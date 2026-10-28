"""Star economy: per-user balances, a browsable reward catalog, redemption (in three different shapes - see redeem_mode below), a pending suggestions bin"""
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


# Machine-readable `source` tags for add_stars' ledger entries (see below) - not an enum stored anywhere on the schema itself
LEDGER_SOURCE_CHORE_APPROVED = "chore_approved"
LEDGER_SOURCE_CHORE_OVERDUE = "chore_overdue"
# a Goal (see goal_engine.py) whose reward_type is "stars", paid out by goal_engine.approve_goal
LEDGER_SOURCE_GOAL_ACHIEVED = "goal_achieved"
# a Routine item (see routine_engine.py) with its own optional star_value, paid out by routine_engine.approve_item (manual
LEDGER_SOURCE_ROUTINE_APPROVED = "routine_approved"
LEDGER_SOURCE_REDEEMED = "redeemed"
LEDGER_SOURCE_REDEMPTION_REVERSED = "redemption_reversed"
LEDGER_SOURCE_MANUAL_ADJUSTMENT = "manual_adjustment"
# (): the two halves of a peer-to-peer star gift (see gift_stars below) - always appear in pairs
LEDGER_SOURCE_GIFT_SENT = "gift_sent"
LEDGER_SOURCE_GIFT_RECEIVED = "gift_received"


def add_stars(
    rewards: dict[str, Any], user_id: str, delta: int, *, reason: Optional[str] = None, source: str = LEDGER_SOURCE_MANUAL_ADJUSTMENT
) -> int:
    """Adjust a user's balance by `delta` (negative for a penalty/spend) and return the new balance."""
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
    """one household member gives some of their OWN stars to
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
    """Most-recent-first, optionally scoped to one user - same shape as list_redemptions below (the per-user Star History view's primary data source"""
    ledger = rewards.setdefault("ledger", [])
    if user_id is not None:
        ledger = [entry for entry in ledger if entry.get("user_id") == user_id]
    return sorted(ledger, key=lambda entry: entry.get("at") or "", reverse=True)


def list_catalog(rewards: dict[str, Any]) -> list[dict[str, Any]]:
    return list(rewards.setdefault("catalog", []))


def _normalize_hex_color(value: Any) -> str:
    """A card color is purely cosmetic (the catalog card's own background accent - see family-hub-rewards-card.js's _catalogItemHtml) and"""
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
    """adds four optional fields on top of the original title/cost/ icon/color"""
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
        # optional countdown started when this reward is used - "2 hours of gaming." None (every pre-v1.110.0 reward) means no timer
        REWARD_KEY_TIMER_MINUTES: timer_engine.normalize_timer_minutes(timer_minutes),
        # who/what rings when this reward's timer alarms - same field/tiers/default as a chore's own CHORE_KEY_ALARM_AUDIENCE
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
        # Validated against whatever redeem_mode the item has AFTER this same call's own "redeem_mode" field (if any) is applied above
        if item.get("redeem_mode") == REWARD_REDEEM_MODE_BANKED and stack_unit_amount <= 0:
            raise RewardError("invalid_stack_unit", "A banked reward needs a positive amount added per redemption.")
        item["stack_unit_amount"] = stack_unit_amount
    if "stack_unit_label" in fields:
        item["stack_unit_label"] = str(fields["stack_unit_label"] or "").strip()
    return item


def delete_catalog_item(rewards: dict[str, Any], item_id: str) -> None:
    """Removes the catalog listing itself."""
    catalog = rewards.setdefault("catalog", [])
    remaining = [it for it in catalog if it.get("id") != item_id]
    if len(remaining) == len(catalog):
        raise RewardError("not_found", f"No reward with id {item_id!r}")
    rewards["catalog"] = remaining


def redeem_item(rewards: dict[str, Any], user_id: str, item_id: str) -> dict[str, Any]:
    """Self-serve claim: deduct cost_stars from user_id's balance right now (raising if the balance doesn't cover it, regardless of redeem_mode"""
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
    """Hands a catalog item to user_id WITHOUT charging any stars - v133+, for Family Hub's Goals feature"""
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
    """Marks a pending (requires_fulfillment, not yet fulfilled) redemption as delivered - e.g. a parent confirming the $20 allowance was actually handed over."""
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


# -- Banked rewards: a per-(user, item) running balance, spent down over time via use_bank independent of stars


def _adjust_bank(rewards: dict[str, Any], user_id: str, item_id: str, delta: float) -> float:
    """Shared credit/debit for a user's bank on one item - redeem_item (always positive, crediting) and use_bank (always negative"""
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
    """{item_id: amount} for every item this user has EVER banked something in (including one now at exactly 0, or one whose catalog item has since been deleted"""
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

    a reversed BANKED redemption (bank_delta present) also pulls
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
    """Turns a pending suggestion into a real, priced catalog item - cost_stars is required (the one thing the original submitter couldn't set)"""
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
