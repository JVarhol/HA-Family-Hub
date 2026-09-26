"""Star economy: per-user balances, a browsable reward catalog, redemption
(in three different shapes - see redeem_mode below), a pending suggestions
bin, a per-item "bank" for stackable rewards, and a full star transaction
ledger.

v127+: not everyone can add straight to the catalog (see const.py's
PERMISSION_REWARD_ADD) - someone without that (or PERMISSION_REWARD_OVERRIDE,
or real admin) can still suggest a new reward via add_suggestion, just
without a price (they have no authority to set one). It sits in
rewards["suggestions"] until someone who DOES have pricing authority calls
approve_suggestion (turns it into a real, priced catalog item) or
reject_suggestion (discards it) - see chores_websocket_api.py's
ws_add_suggestion/ws_approve_suggestion/ws_reject_suggestion for the
permission gating itself, which (deliberately) lives at the call site, not
in this hass-free module.

Redemption itself is deliberately NOT gated behind admin approval (confirmed
with the household - see the "Reward redemption" decision in the project's
own notes): tapping "Claim" in family-hub-rewards-card deducts stars the
moment it happens, as long as the balance covers the cost. What happens
AFTER that deduction depends on the catalog item's own redeem_mode (see
const.py's REWARD_REDEEM_MODES docstring for the full picture):
  - "instant" (the original, and still the default): a plain logged
    redemption - "movie night," "extra dessert."
  - "banked" (v128+): the redemption ADDS to a running per-user balance for
    that item (its "bank") instead of being a one-off event - "$1 of
    allowance," "1 hour of TV time" - redeemed as many times as affordable,
    stacking up. use_bank later spends part (or all) of the bank down,
    independent of stars - "use 1.5 of my 3 banked hours."
  - "one_time" (v128+): a plain logged redemption exactly like "instant",
    except the catalog item deletes itself immediately afterward - gone for
    everyone the instant anybody claims it.
Separately, a catalog item's requires_fulfillment flag (v128+) controls
whether the "spend" step - the redemption itself for instant/one_time, or a
use_bank call for banked - needs someone with pricing authority to mark it
done before it's considered delivered (an actual $20 handed over, an actual
prize picked up), or is self-serve/instant. See mark_redemption_fulfilled/
mark_bank_usage_fulfilled.

Every star balance change (chore approval, overdue penalty, redemption,
reversed redemption, a manual adjust_balance) is recorded in rewards["ledger"]
(v128+ - see add_stars) so a household can pull a complete per-user history
of where their stars came from and went, not just the current balance.

Every function here operates on the caller's already-loaded `rewards` dict
(see store.py's default_rewards shape) and mutates it in place; callers own
saving the Store afterward, same convention as chore_engine.py.
"""
from __future__ import annotations

import re
import uuid
from typing import Any, Optional

from homeassistant.util import dt as dt_util

from . import timer_engine
from .const import (
    REWARD_KEY_ALARM_AUDIENCE,
    REWARD_KEY_TIMER_MINUTES,
    REWARD_REDEEM_MODE_BANKED,
    REWARD_REDEEM_MODE_INSTANT,
    REWARD_REDEEM_MODE_ONE_TIME,
    REWARD_REDEEM_MODES,
)


class RewardError(Exception):
    """Raised for any invalid reward operation - see .code for a short
    machine-readable reason (chores_websocket_api.py maps it straight to
    send_error's error code)."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def new_catalog_item_id() -> str:
    return f"rwd_{uuid.uuid4().hex[:12]}"


def new_redemption_id() -> str:
    return f"rdm_{uuid.uuid4().hex[:12]}"


def new_suggestion_id() -> str:
    return f"sug_{uuid.uuid4().hex[:12]}"


def new_ledger_entry_id() -> str:
    return f"led_{uuid.uuid4().hex[:12]}"


def new_bank_usage_id() -> str:
    return f"use_{uuid.uuid4().hex[:12]}"


def get_balance(rewards: dict[str, Any], user_id: str) -> int:
    return int(rewards.setdefault("balances", {}).get(user_id, 0))


# Machine-readable `source` tags for add_stars' ledger entries (see below) -
# not an enum stored anywhere on the schema itself (a plain string, like
# every other loosely-typed field in this module), just the fixed set of
# values every call site in this project actually passes, listed here so
# a frontend rendering the ledger has one place to look for "what are all
# the kinds of entry I might see."
LEDGER_SOURCE_CHORE_APPROVED = "chore_approved"
LEDGER_SOURCE_CHORE_OVERDUE = "chore_overdue"
# v133+: a Goal (see goal_engine.py) whose reward_type is "stars", paid out
# by goal_engine.approve_goal - the Goals-feature counterpart of
# LEDGER_SOURCE_CHORE_APPROVED just above. A goal whose reward_type is
# "catalog_item" instead never touches add_stars at all (see grant_item),
# so it never produces a ledger entry - only redemptions.
LEDGER_SOURCE_GOAL_ACHIEVED = "goal_achieved"
# v141+: a Routine item (see routine_engine.py) with its own optional
# star_value, paid out by routine_engine.approve_item (manual, when the
# item's no_approval_required is false - the default) or straight from
# toggle_item itself (when it's true) - the Routines-feature counterpart of
# LEDGER_SOURCE_CHORE_APPROVED, minus the rest of the chore state machine
# (no streaks/recurrence/dependencies - routines reset on their own daily
# timer, see maybe_reset_daily).
LEDGER_SOURCE_ROUTINE_APPROVED = "routine_approved"
LEDGER_SOURCE_REDEEMED = "redeemed"
LEDGER_SOURCE_REDEMPTION_REVERSED = "redemption_reversed"
LEDGER_SOURCE_MANUAL_ADJUSTMENT = "manual_adjustment"
# v144.2+ (task #31): the two halves of a peer-to-peer star gift (see
# gift_stars below) - always appear in pairs, one LEDGER_SOURCE_GIFT_SENT
# entry on the giver's own ledger and one LEDGER_SOURCE_GIFT_RECEIVED entry
# on the recipient's, same instant/no-approval-needed shape as redemption
# (see this module's own docstring on why redemption itself is never
# admin-gated - the household's same "spend your own stars, no approval
# needed" answer applies here too, just spending them ON someone else
# instead of on a catalog item).
LEDGER_SOURCE_GIFT_SENT = "gift_sent"
LEDGER_SOURCE_GIFT_RECEIVED = "gift_received"


def add_stars(
    rewards: dict[str, Any], user_id: str, delta: int, *, reason: Optional[str] = None, source: str = LEDGER_SOURCE_MANUAL_ADJUSTMENT
) -> int:
    """Adjust a user's balance by `delta` (negative for a penalty/spend)
    and return the new balance. No floor at zero - a star debt from an
    overdue penalty is allowed to go negative, same as a real allowance
    ledger would; the UI is free to display that as "owes N stars" rather
    than blocking it here.

    v128+: every call appends an entry to rewards["ledger"] (id, user_id,
    delta, balance_after, reason, source, at) - the household asked for a
    complete per-user history of where their stars came from and went, not
    just the current balance/the separate redemptions log. `source` is one
    of the LEDGER_SOURCE_* constants above; callers that don't pass one
    fall back to "manual_adjustment" (the ws_adjust_balance call site's own
    shape - a plain grant/deduction outside the normal chore/redemption
    flow), which is also the only sensible default for any caller this
    module doesn't know about yet. Every OTHER call site in this project
    (chore_engine.approve_chore/sweep_overdue_chores, redeem_item,
    reverse_redemption below) passes its own specific source explicitly."""
    balances = rewards.setdefault("balances", {})
    new_balance = int(balances.get(user_id, 0)) + int(delta)
    balances[user_id] = new_balance
    rewards.setdefault("ledger", []).append({
        "id": new_ledger_entry_id(),
        "user_id": user_id,
        "delta": int(delta),
        "balance_after": new_balance,
        "reason": reason or "",
        "source": source,
        "at": dt_util.utcnow().isoformat(),
    })
    return new_balance


def gift_stars(
    rewards: dict[str, Any],
    from_user_id: str,
    to_user_id: str,
    amount: int,
    *,
    from_reason: str = "",
    to_reason: str = "",
) -> tuple[int, int]:
    """Task #31: one household member gives some of their OWN stars to
    another, on top of the existing earn-via-chores/redeem-via-catalog
    economy - "I don't want this reward, but my sister does, so here's 10
    of my stars." Self-serve and instant, same "never admin-gated" shape
    redeem_item already has (see this module's own docstring) - a positive
    balance is the only authority needed to give some of it away; there's
    nothing here for an admin to approve, just like there's nothing for an
    admin to approve when a kid redeems a reward they already have the
    stars for.

    Deducts `amount` from from_user_id and credits it to to_user_id in one
    call, each producing its own ledger entry (LEDGER_SOURCE_GIFT_SENT /
    LEDGER_SOURCE_GIFT_RECEIVED above) via the same add_stars every other
    balance change in this module goes through - so a gift shows up in
    both people's Star History exactly like any other transaction, just
    tagged as a gift instead of a chore/redemption/manual adjustment.
    `from_reason`/`to_reason` are separate (not one shared string) because
    the two sides read differently in each person's own history - "Gift to
    Dad" on the giver's side, "Gift from Mom" on the receiver's -
    resolving a display name is chores_websocket_api.py's job (it has
    hass.auth), not this hass-free module's.

    Raises "no_user" if either id is missing, "invalid_recipient" for a
    self-gift (gifting stars to yourself is a no-op dressed up as a
    transaction - nothing stops it structurally, but it has no purpose and
    would just show up as two confusing dueling ledger entries), and
    "invalid_amount"/"insufficient_balance" the same way redeem_item
    validates cost against balance. Returns (giver's new balance,
    recipient's new balance)."""
    if not from_user_id or not to_user_id:
        raise RewardError("no_user", "Not logged in.")
    if from_user_id == to_user_id:
        raise RewardError("invalid_recipient", "Can't gift stars to yourself.")
    try:
        amount = int(amount)
    except (TypeError, ValueError):
        amount = 0
    if amount <= 0:
        raise RewardError("invalid_amount", "Enter how many stars to gift.")
    balance = get_balance(rewards, from_user_id)
    if balance < amount:
        raise RewardError(
            "insufficient_balance",
            f"Not enough stars - gifting {amount} needs a balance of at least {amount}, and the balance is {balance}.",
        )
    new_from_balance = add_stars(rewards, from_user_id, -amount, reason=from_reason, source=LEDGER_SOURCE_GIFT_SENT)
    new_to_balance = add_stars(rewards, to_user_id, amount, reason=to_reason, source=LEDGER_SOURCE_GIFT_RECEIVED)
    return new_from_balance, new_to_balance


def list_ledger(rewards: dict[str, Any], user_id: Optional[str] = None) -> list[dict[str, Any]]:
    """Most-recent-first, optionally scoped to one user - same shape as
    list_redemptions below (the per-user Star History view's primary data
    source; the full household-wide list isn't currently exposed anywhere,
    but nothing here stops a future admin-wide view from calling this with
    user_id=None)."""
    ledger = rewards.setdefault("ledger", [])
    if user_id is not None:
        ledger = [entry for entry in ledger if entry.get("user_id") == user_id]
    return sorted(ledger, key=lambda entry: entry.get("at") or "", reverse=True)


def list_catalog(rewards: dict[str, Any]) -> list[dict[str, Any]]:
    return list(rewards.setdefault("catalog", []))


def _normalize_hex_color(value: Any) -> str:
    """A card color is purely cosmetic (the catalog card's own background
    accent - see family-hub-rewards-card.js's _catalogItemHtml) and, like
    every other stored color in this project (userProfiles[id].color,
    Theme Builder's own fields), degrades to "" (meaning "use the default
    look") rather than raising on anything that isn't a clean #rrggbb
    hex string - a malformed value here should never block saving the
    rest of the reward."""
    if not isinstance(value, str):
        return ""
    value = value.strip()
    if re.fullmatch(r"#[0-9a-fA-F]{6}", value):
        return value
    return ""


def add_catalog_item(
    rewards: dict[str, Any],
    title: str,
    cost_stars: int,
    icon: str = "",
    color: str = "",
    *,
    redeem_mode: str = REWARD_REDEEM_MODE_INSTANT,
    requires_fulfillment: bool = False,
    value_note: str = "",
    stack_unit_amount: float = 1,
    stack_unit_label: str = "",
    timer_minutes: Any = None,
    alarm_audience: Any = None,
) -> dict[str, Any]:
    """v128+ adds four optional fields on top of the original title/cost/
    icon/color - see const.py's REWARD_REDEEM_MODES docstring for the full
    picture of what redeem_mode/requires_fulfillment mean, and this
    module's own docstring for how they interact. value_note is purely
    cosmetic (a free-text "what this is really worth" label like "$20" or
    "2 hrs", shown next to cost_stars - never parsed or used in any
    calculation). stack_unit_amount/stack_unit_label only matter for
    redeem_mode "banked" (how much one redemption adds to the bank, and
    what unit to call it - "hours", "$"); harmless (stored but inert) on
    the other two modes."""
    title = str(title or "").strip()
    if not title:
        raise RewardError("invalid_title", "A reward needs a title.")
    cost_stars = int(cost_stars or 0)
    if cost_stars < 0:
        raise RewardError("invalid_cost", "Cost can't be negative.")
    redeem_mode = redeem_mode or REWARD_REDEEM_MODE_INSTANT
    if redeem_mode not in REWARD_REDEEM_MODES:
        raise RewardError("invalid_redeem_mode", f"Unknown redeem_mode: {redeem_mode!r}")
    try:
        stack_unit_amount = float(stack_unit_amount)
    except (TypeError, ValueError):
        stack_unit_amount = 1.0
    if redeem_mode == REWARD_REDEEM_MODE_BANKED and stack_unit_amount <= 0:
        raise RewardError("invalid_stack_unit", "A banked reward needs a positive amount added per redemption.")
    item = {
        "id": new_catalog_item_id(),
        "title": title,
        "cost_stars": cost_stars,
        "icon": icon or "",
        "color": _normalize_hex_color(color),
        "redeem_mode": redeem_mode,
        "requires_fulfillment": bool(requires_fulfillment),
        "value_note": str(value_note or "").strip(),
        "stack_unit_amount": stack_unit_amount,
        "stack_unit_label": str(stack_unit_label or "").strip(),
        # v1.110.0+: optional countdown started when this reward is used -
        # "2 hours of gaming." None (every pre-v1.110.0 reward) means no
        # timer, and Use behaves exactly as it always has. Deliberately
        # INDEPENDENT of redeem_mode rather than a fourth mode: the modes
        # describe how the star cost is consumed, a timer describes what
        # happens after, and they compose ("1 hour of TV, banked").
        REWARD_KEY_TIMER_MINUTES: timer_engine.normalize_timer_minutes(timer_minutes),
        # v1.132.55+: who/what rings when this reward's timer alarms - same
        # field/tiers/default as a chore's own CHORE_KEY_ALARM_AUDIENCE, see
        # its docstring in const.py for the full picture.
        REWARD_KEY_ALARM_AUDIENCE: timer_engine.normalize_alarm_audience(alarm_audience),
    }
    rewards.setdefault("catalog", []).append(item)
    return item


def update_catalog_item(rewards: dict[str, Any], item_id: str, **fields: Any) -> dict[str, Any]:
    catalog = rewards.setdefault("catalog", [])
    item = next((it for it in catalog if it.get("id") == item_id), None)
    if item is None:
        raise RewardError("not_found", f"No reward with id {item_id!r}")
    if "title" in fields:
        title = str(fields["title"] or "").strip()
        if not title:
            raise RewardError("invalid_title", "A reward needs a title.")
        item["title"] = title
    if "cost_stars" in fields:
        cost_stars = int(fields["cost_stars"] or 0)
        if cost_stars < 0:
            raise RewardError("invalid_cost", "Cost can't be negative.")
        item["cost_stars"] = cost_stars
    if REWARD_KEY_TIMER_MINUTES in fields:
        item[REWARD_KEY_TIMER_MINUTES] = timer_engine.normalize_timer_minutes(fields[REWARD_KEY_TIMER_MINUTES])
    if REWARD_KEY_ALARM_AUDIENCE in fields:
        item[REWARD_KEY_ALARM_AUDIENCE] = timer_engine.normalize_alarm_audience(fields[REWARD_KEY_ALARM_AUDIENCE])
    if "icon" in fields:
        item["icon"] = fields["icon"] or ""
    if "color" in fields:
        item["color"] = _normalize_hex_color(fields["color"])
    if "redeem_mode" in fields:
        redeem_mode = fields["redeem_mode"] or REWARD_REDEEM_MODE_INSTANT
        if redeem_mode not in REWARD_REDEEM_MODES:
            raise RewardError("invalid_redeem_mode", f"Unknown redeem_mode: {redeem_mode!r}")
        item["redeem_mode"] = redeem_mode
    if "requires_fulfillment" in fields:
        item["requires_fulfillment"] = bool(fields["requires_fulfillment"])
    if "value_note" in fields:
        item["value_note"] = str(fields["value_note"] or "").strip()
    if "stack_unit_amount" in fields:
        try:
            stack_unit_amount = float(fields["stack_unit_amount"])
        except (TypeError, ValueError):
            stack_unit_amount = 1.0
        # Validated against whatever redeem_mode the item has AFTER this
        # same call's own "redeem_mode" field (if any) is applied above -
        # so switching an item to "banked" and setting its stack amount in
        # one call validates the combination together, not the item's
        # stale pre-update mode.
        if item.get("redeem_mode") == REWARD_REDEEM_MODE_BANKED and stack_unit_amount <= 0:
            raise RewardError("invalid_stack_unit", "A banked reward needs a positive amount added per redemption.")
        item["stack_unit_amount"] = stack_unit_amount
    if "stack_unit_label" in fields:
        item["stack_unit_label"] = str(fields["stack_unit_label"] or "").strip()
    return item


def delete_catalog_item(rewards: dict[str, Any], item_id: str) -> None:
    """Removes the catalog listing itself. Deliberately does NOT touch any
    existing bank balance for this item (rewards["banks"][user][item_id]) -
    stars already converted into a bank are the user's, and use_bank still
    honors them (falling back to a generic "(removed reward)" title/no unit
    label) even after the item that earned them is gone; a household that
    wants those funds actually cleared out can do so through use_bank
    itself, not by deleting the catalog listing."""
    catalog = rewards.setdefault("catalog", [])
    remaining = [it for it in catalog if it.get("id") != item_id]
    if len(remaining) == len(catalog):
        raise RewardError("not_found", f"No reward with id {item_id!r}")
    rewards["catalog"] = remaining


def redeem_item(rewards: dict[str, Any], user_id: str, item_id: str) -> dict[str, Any]:
    """Self-serve claim: deduct cost_stars from user_id's balance right now
    (raising if the balance doesn't cover it, regardless of redeem_mode -
    see this module's own docstring, redemption itself is never gated) and
    append a redemption history entry. What happens next branches on the
    item's own redeem_mode:
      - "instant"/"one_time": the redemption is the whole transaction -
        fulfilled immediately unless the item requires_fulfillment, in
        which case it's logged as pending until mark_redemption_fulfilled.
        "one_time" additionally deletes the catalog item right after.
      - "banked": the redemption ADDS stack_unit_amount to this user's bank
        for this item (see _adjust_bank) instead of being fulfillment-
        gated itself - banking is always instant/self-serve; fulfillment
        (if the item has it on) only ever applies to the later use_bank
        spend, not to the act of earning the bank balance.
    Returns the redemption entry either way."""
    catalog = rewards.setdefault("catalog", [])
    item = next((it for it in catalog if it.get("id") == item_id), None)
    if item is None:
        raise RewardError("not_found", f"No reward with id {item_id!r}")
    cost = int(item.get("cost_stars") or 0)
    balance = get_balance(rewards, user_id)
    if balance < cost:
        raise RewardError(
            "insufficient_balance",
            f"Not enough stars - this costs {cost}, and the balance is {balance}.",
        )
    mode = item.get("redeem_mode") or REWARD_REDEEM_MODE_INSTANT
    add_stars(rewards, user_id, -cost, reason=f"Redeemed: {item.get('title')}", source=LEDGER_SOURCE_REDEEMED)
    now = dt_util.utcnow().isoformat()
    requires_fulfillment = bool(item.get("requires_fulfillment")) and mode != REWARD_REDEEM_MODE_BANKED
    redemption = {
        "id": new_redemption_id(),
        "user_id": user_id,
        "catalog_item_id": item_id,
        "title": item.get("title"),
        "cost_stars": cost,
        "redeemed_at": now,
        "redeem_mode": mode,
        "requires_fulfillment": requires_fulfillment,
        "fulfilled": not requires_fulfillment,
        "fulfilled_at": None if requires_fulfillment else now,
        "fulfilled_by": None,
    }
    if mode == REWARD_REDEEM_MODE_BANKED:
        amount = float(item.get("stack_unit_amount") or 1)
        redemption["bank_delta"] = amount
        redemption["unit_label"] = item.get("stack_unit_label") or ""
        redemption["bank_balance_after"] = _adjust_bank(rewards, user_id, item_id, amount)
    rewards.setdefault("redemptions", []).append(redemption)
    if mode == REWARD_REDEEM_MODE_ONE_TIME:
        delete_catalog_item(rewards, item_id)
    return redemption


def grant_item(rewards: dict[str, Any], user_id: str, item_id: str, *, reason: str = "") -> dict[str, Any]:
    """Hands a catalog item to user_id WITHOUT charging any stars - v133+,
    for Family Hub's Goals feature (goal_engine.approve_goal) crediting a
    goal's own directly-attached reward on approval, as an alternative to
    redeem_item's normal self-serve "spend stars now" path. Reuses the
    exact same redemption record shape (and requires_fulfillment/banked
    handling) as redeem_item, just with cost_stars forced to 0 and a
    `granted: True` marker so it's still fully visible in the recipient's
    ordinary redemption history - a parent looking at "what did my kid get"
    sees a goal-earned reward right alongside anything self-claimed with
    stars, not in some separate list. `reason` is stored as `grant_reason`
    (e.g. "Goal achieved: Get 3 Bs in math") for that same history view to
    show WHY this one has no star cost.

    Deliberately raises RewardError("not_found", ...) rather than silently
    no-op'ing when item_id no longer exists (the catalog item a goal
    pointed at could have since been deleted) - approve_goal itself decides
    whether that should block the whole approval or just skip the grant;
    this function only owns "does the grant itself succeed."""
    catalog = rewards.setdefault("catalog", [])
    item = next((it for it in catalog if it.get("id") == item_id), None)
    if item is None:
        raise RewardError("not_found", f"No reward with id {item_id!r}")
    mode = item.get("redeem_mode") or REWARD_REDEEM_MODE_INSTANT
    now = dt_util.utcnow().isoformat()
    requires_fulfillment = bool(item.get("requires_fulfillment")) and mode != REWARD_REDEEM_MODE_BANKED
    redemption = {
        "id": new_redemption_id(),
        "user_id": user_id,
        "catalog_item_id": item_id,
        "title": item.get("title"),
        "cost_stars": 0,
        "redeemed_at": now,
        "redeem_mode": mode,
        "requires_fulfillment": requires_fulfillment,
        "fulfilled": not requires_fulfillment,
        "fulfilled_at": None if requires_fulfillment else now,
        "fulfilled_by": None,
        "granted": True,
        "grant_reason": reason or "",
    }
    if mode == REWARD_REDEEM_MODE_BANKED:
        amount = float(item.get("stack_unit_amount") or 1)
        redemption["bank_delta"] = amount
        redemption["unit_label"] = item.get("stack_unit_label") or ""
        redemption["bank_balance_after"] = _adjust_bank(rewards, user_id, item_id, amount)
    rewards.setdefault("redemptions", []).append(redemption)
    if mode == REWARD_REDEEM_MODE_ONE_TIME:
        delete_catalog_item(rewards, item_id)
    return redemption


def mark_redemption_fulfilled(rewards: dict[str, Any], redemption_id: str, actor: Optional[str] = None) -> dict[str, Any]:
    """Marks a pending (requires_fulfillment, not yet fulfilled) redemption
    as delivered - e.g. a parent confirming the $20 allowance was actually
    handed over. Stays in the redemptions list either way (never popped -
    this is a status flip, not a removal, so the history entry survives).
    Raises "already_fulfilled" rather than silently no-op'ing on a second
    call, so a caller (the card's own Mark Done button) can tell a stale
    click apart from a real state change."""
    redemptions = rewards.setdefault("redemptions", [])
    match = next((r for r in redemptions if r.get("id") == redemption_id), None)
    if match is None:
        raise RewardError("not_found", f"No redemption with id {redemption_id!r}")
    if match.get("fulfilled"):
        raise RewardError("already_fulfilled", "This was already marked done.")
    match["fulfilled"] = True
    match["fulfilled_at"] = dt_util.utcnow().isoformat()
    match["fulfilled_by"] = actor
    return match


# --- Banked rewards: a per-(user, item) running balance, spent down over
# time via use_bank independent of stars - see const.py's REWARD_REDEEM_MODES
# docstring and redeem_item above for how a bank gets credited in the first
# place. rewards["banks"] is a plain nested dict: {user_id: {item_id: amount}}
# - a flat float per pair, not its own list of entries (unlike ledger/
# redemptions/bank_usages, there's nothing to browse chronologically about
# a running balance, only the current number).


def _adjust_bank(rewards: dict[str, Any], user_id: str, item_id: str, delta: float) -> float:
    """Shared credit/debit for a user's bank on one item - redeem_item
    (always positive, crediting) and use_bank (always negative, debiting)
    both go through this so the two never drift out of the same rounding/
    clamping behavior. Rounded to 4 decimal places to keep repeated partial
    (e.g. 1.5-hour) credits/debits from accumulating binary-float noise
    into a balance that LOOKS wrong (2.9999999999996 instead of 3);
    clamped to exactly 0 once within float-noise distance of it so a full
    "use everything banked" never leaves a technically-negative dust
    amount sitting behind."""
    banks = rewards.setdefault("banks", {})
    user_banks = banks.setdefault(user_id, {})
    new_total = round(float(user_banks.get(item_id, 0)) + delta, 4)
    if abs(new_total) < 1e-9:
        new_total = 0.0
    user_banks[item_id] = new_total
    return new_total


def get_bank(rewards: dict[str, Any], user_id: str, item_id: str) -> float:
    return float(rewards.setdefault("banks", {}).setdefault(user_id, {}).get(item_id, 0))


def list_banks(rewards: dict[str, Any], user_id: str) -> dict[str, float]:
    """{item_id: amount} for every item this user has EVER banked something
    in (including one now at exactly 0, or one whose catalog item has since
    been deleted - see delete_catalog_item's own docstring) - the rewards
    card filters/looks up titles against the current catalog itself when
    rendering, this just hands back the raw numbers."""
    return dict(rewards.setdefault("banks", {}).get(user_id, {}))


def use_bank(rewards: dict[str, Any], user_id: str, item_id: str, amount: float) -> dict[str, Any]:
    """Spends part (or all) of a user's bank for one item - "use 1.5 of my
    3 banked hours." Never touches stars (those were already spent back
    when the bank was credited - see redeem_item) or requires a specific
    catalog item to still exist (see delete_catalog_item's own docstring
    on why a bank can outlive its item). Fulfillment-gated by the item's
    OWN requires_fulfillment flag when the item is still around (a missing
    item defaults to NOT requiring fulfillment - nobody left to gate it).
    Returns the new bank_usages entry."""
    try:
        amount = float(amount)
    except (TypeError, ValueError):
        amount = 0.0
    if amount <= 0:
        raise RewardError("invalid_amount", "Enter how much to use.")
    current = get_bank(rewards, user_id, item_id)
    if amount > current + 1e-9:
        raise RewardError("insufficient_bank", f"Only {current} banked - can't use {amount}.")
    catalog = rewards.setdefault("catalog", [])
    item = next((it for it in catalog if it.get("id") == item_id), None)
    new_total = _adjust_bank(rewards, user_id, item_id, -amount)
    requires_fulfillment = bool(item.get("requires_fulfillment")) if item else False
    now = dt_util.utcnow().isoformat()
    usage = {
        "id": new_bank_usage_id(),
        "user_id": user_id,
        "item_id": item_id,
        "title": item.get("title") if item else "(removed reward)",
        "amount": amount,
        "unit_label": (item.get("stack_unit_label") or "") if item else "",
        "bank_balance_after": new_total,
        "requires_fulfillment": requires_fulfillment,
        "fulfilled": not requires_fulfillment,
        "used_at": now,
        "fulfilled_at": None if requires_fulfillment else now,
        "fulfilled_by": None,
    }
    rewards.setdefault("bank_usages", []).append(usage)
    return usage


def list_bank_usages(rewards: dict[str, Any], user_id: Optional[str] = None) -> list[dict[str, Any]]:
    """Most-recent-first, optionally scoped to one user - same shape as
    list_redemptions."""
    usages = rewards.setdefault("bank_usages", [])
    if user_id is not None:
        usages = [u for u in usages if u.get("user_id") == user_id]
    return sorted(usages, key=lambda u: u.get("used_at") or "", reverse=True)


def mark_bank_usage_fulfilled(rewards: dict[str, Any], usage_id: str, actor: Optional[str] = None) -> dict[str, Any]:
    """The use_bank twin of mark_redemption_fulfilled above - same "flip a
    flag, stay in the list, refuse a second call" shape."""
    usages = rewards.setdefault("bank_usages", [])
    match = next((u for u in usages if u.get("id") == usage_id), None)
    if match is None:
        raise RewardError("not_found", f"No bank usage with id {usage_id!r}")
    if match.get("fulfilled"):
        raise RewardError("already_fulfilled", "This was already marked done.")
    match["fulfilled"] = True
    match["fulfilled_at"] = dt_util.utcnow().isoformat()
    match["fulfilled_by"] = actor
    return match


def list_redemptions(rewards: dict[str, Any], user_id: Optional[str] = None) -> list[dict[str, Any]]:
    """Most-recent-first, optionally scoped to one user (the rewards
    card's per-person history view); the full list (every user) is what
    an admin sees."""
    redemptions = rewards.setdefault("redemptions", [])
    if user_id is not None:
        redemptions = [r for r in redemptions if r.get("user_id") == user_id]
    return sorted(redemptions, key=lambda r: r.get("redeemed_at") or "", reverse=True)


def _pop_redemption(rewards: dict[str, Any], redemption_id: str) -> dict[str, Any]:
    """Shared lookup-and-remove for delete_redemption/reverse_redemption
    below - both need "find it, take it out of the list" and differ only
    in whether the balance gets touched afterward."""
    redemptions = rewards.setdefault("redemptions", [])
    match = next((r for r in redemptions if r.get("id") == redemption_id), None)
    if match is None:
        raise RewardError("not_found", f"No redemption with id {redemption_id!r}")
    rewards["redemptions"] = [r for r in redemptions if r.get("id") != redemption_id]
    return match


def delete_redemption(rewards: dict[str, Any], redemption_id: str) -> dict[str, Any]:
    """Admin-only history cleanup (the "clear" half of the household's own
    "clear redemptions or reverse them" request) - just removes the entry
    from the log. Deliberately does NOT touch the star balance: this is for
    tidying up the history list itself (a duplicate entry, a redemption
    logged for a reason already handled some other way), not for undoing
    the actual claim - see reverse_redemption for that. Returns the removed
    entry."""
    return _pop_redemption(rewards, redemption_id)


def reverse_redemption(rewards: dict[str, Any], redemption_id: str) -> dict[str, Any]:
    """Admin-only "undo" (the "reverse" half of the same request) - removes
    the redemption from the log AND refunds its cost_stars back to
    whoever claimed it, same add_stars mechanism every other star
    adjustment in this module uses. For when a reward was claimed by
    mistake (wrong item, wrong person) and the whole transaction should
    never have happened - contrast with delete_redemption above, which
    leaves the balance alone. Returns the removed entry with the refunded
    balance included as `new_balance`, so the caller (chores_websocket_api.py)
    doesn't have to make a second get_balance call just to report it.

    v128+: a reversed BANKED redemption (bank_delta present) also pulls
    that amount back OUT of the bank it credited - "this transaction
    should never have happened" has to undo BOTH halves of a banked
    redemption (the star spend AND the bank credit), not just the stars,
    or a reversed "$1 of allowance" would still have quietly left $1 sitting
    in the bank. Clamped at 0 via _adjust_bank same as any other debit - if
    some of that credit was already spent via use_bank in the meantime,
    reversing can't claw back more than what's still actually banked."""
    redemption = _pop_redemption(rewards, redemption_id)
    user_id = redemption.get("user_id")
    cost = int(redemption.get("cost_stars") or 0)
    new_balance = (
        add_stars(rewards, user_id, cost, reason=f"Reversed: {redemption.get('title')}", source=LEDGER_SOURCE_REDEMPTION_REVERSED)
        if user_id
        else get_balance(rewards, user_id)
    )
    redemption["new_balance"] = new_balance
    bank_delta = redemption.get("bank_delta")
    if user_id and bank_delta:
        item_id = redemption.get("catalog_item_id")
        current = get_bank(rewards, user_id, item_id)
        _adjust_bank(rewards, user_id, item_id, -min(float(bank_delta), current))
    return redemption


def list_suggestions(rewards: dict[str, Any]) -> list[dict[str, Any]]:
    """Oldest-first (unlike list_redemptions - there's no strong reason to
    show the newest suggestion first, and oldest-first nudges an approver
    toward clearing the backlog in the order it arrived)."""
    return list(rewards.setdefault("suggestions", []))


def add_suggestion(rewards: dict[str, Any], user_id: str, title: str, icon: str = "", color: str = "") -> dict[str, Any]:
    """A reward suggested by someone without pricing authority - see this
    module's own docstring. No cost_stars field at all (not even 0 - that
    would look like a deliberately free reward rather than "not priced
    yet"); an approver supplies one for the first time in approve_suggestion
    below."""
    title = str(title or "").strip()
    if not title:
        raise RewardError("invalid_title", "A reward needs a title.")
    if not user_id:
        raise RewardError("no_user", "Not logged in.")
    suggestion = {
        "id": new_suggestion_id(),
        "title": title,
        "icon": icon or "",
        "color": _normalize_hex_color(color),
        "submitted_by": user_id,
        "submitted_at": dt_util.utcnow().isoformat(),
    }
    rewards.setdefault("suggestions", []).append(suggestion)
    return suggestion


def _pop_suggestion(rewards: dict[str, Any], suggestion_id: str) -> dict[str, Any]:
    """Shared lookup-and-remove for approve_suggestion/reject_suggestion
    below, same shape as _pop_redemption above."""
    suggestions = rewards.setdefault("suggestions", [])
    match = next((s for s in suggestions if s.get("id") == suggestion_id), None)
    if match is None:
        raise RewardError("not_found", f"No suggestion with id {suggestion_id!r}")
    rewards["suggestions"] = [s for s in suggestions if s.get("id") != suggestion_id]
    return match


def approve_suggestion(
    rewards: dict[str, Any],
    suggestion_id: str,
    cost_stars: int,
    icon: Optional[str] = None,
    color: Optional[str] = None,
    *,
    redeem_mode: Optional[str] = None,
    requires_fulfillment: bool = False,
    value_note: str = "",
    stack_unit_amount: float = 1,
    stack_unit_label: str = "",
) -> dict[str, Any]:
    """Turns a pending suggestion into a real, priced catalog item -
    cost_stars is required (the one thing the original submitter couldn't
    set); icon/color are optional overrides for an approver who wants to
    tidy up what was suggested, defaulting to whatever the suggestion
    itself already had. Cost is validated BEFORE the suggestion is popped
    off the list, so a bad request (negative cost) leaves the suggestion
    exactly where it was instead of silently discarding it on a failed
    approval. Removes the suggestion either way it resolves (this function
    only ever resolves it as approved - see reject_suggestion for the
    other outcome) and returns the new catalog item.

    v128+: redeem_mode/requires_fulfillment/value_note/stack_unit_* are all
    optional and default to the original "instant, no fulfillment gate"
    shape approve_suggestion always had before these existed - an approver
    who wants a suggestion turned into a banked or one-time reward, or one
    that needs marking done, passes those explicitly (the card's own Approve
    row only ever sends cost_stars, matching that original behavior; a
    parent who wants more control still has update_catalog_item after the
    fact)."""
    cost_stars = int(cost_stars or 0)
    if cost_stars < 0:
        raise RewardError("invalid_cost", "Cost can't be negative.")
    suggestion = _pop_suggestion(rewards, suggestion_id)
    return add_catalog_item(
        rewards,
        suggestion.get("title"),
        cost_stars,
        icon if icon is not None else suggestion.get("icon", ""),
        color if color is not None else suggestion.get("color", ""),
        redeem_mode=redeem_mode or REWARD_REDEEM_MODE_INSTANT,
        requires_fulfillment=requires_fulfillment,
        value_note=value_note,
        stack_unit_amount=stack_unit_amount,
        stack_unit_label=stack_unit_label,
    )


def reject_suggestion(rewards: dict[str, Any], suggestion_id: str) -> dict[str, Any]:
    """Discards a suggestion without adding anything to the catalog -
    the other resolution besides approve_suggestion. Returns the removed
    entry (so a caller can e.g. name it back to the submitter)."""
    return _pop_suggestion(rewards, suggestion_id)
