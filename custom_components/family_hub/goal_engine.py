"""Goals: progress-tracked achievements a household attaches a reward to -
"get 3 Bs in math," "practice piano 2 times" - as opposed to a Chore's "do
this one concrete thing, on a schedule." Deliberately its own lighter-
weight sibling to chore_engine.py/reward_engine.py (same "separate self-
contained module" precedent routine_engine.py already established for
Routines), not another chore assignment_mode or a bag of extra fields
bolted onto every chore record, because a goal's shape is genuinely
different enough that reusing chore_engine.py would mean every plain chore
carrying fields (target_count/current_count, a reward_type choice) that
only ever matter for the minority of records that are actually goals.

What Goals borrows from Chores: the same three-stage verification gate -
open -> pending_verification -> approved (see GOAL_STATUS_* in const.py) -
and the same "engine functions never check permissions, callers
(chores_websocket_api.py, which hosts Goals' websocket commands alongside
Chores/Rewards/Permissions/Routines) resolve those first" separation of
concerns.

What Goals deliberately does NOT have, unlike a chore: assignment modes,
rotation, the Chore Bin (a goal is always for one specific person, chosen
at creation - there's no "whoever gets to it first" achievement),
dependencies, auto-create/auto-complete sensor triggers, recurrence, an
overdue penalty, or due-date lead-time reminders. A household that wants
any of those belongs back in Chores; Goals stays intentionally narrow.

What Goals HAS that a chore doesn't: a target_count/current_count pair
(default target_count=1, so a plain one-shot achievement like "get 3 Bs in
math" - the "3" here is a fact ABOUT the outside world, not something this
app counts toward - just works with the default; "practice piano 2 times"
sets target_count=2 and each practice session is its own log_progress
call), and a per-goal reward_type choice between paying out in stars (the
same reward_engine.add_stars economy chores use) or handing over one
specific catalog reward directly via reward_engine.grant_item (see
GOAL_REWARD_TYPE_* in const.py) - decided when the goal is created, not a
household-wide setting.

Progress logging (log_progress) is deliberately a SEPARATE step from
completion, unlike a chore's single complete_chore call - each call is one
occurrence ("I practiced just now") appended to the goal's own log_history
(timestamp + who logged it, for a parent's own sanity-check before
approving) and bumps current_count by exactly one; hitting target_count is
what actually flips the goal into pending_verification, the same "first
half of the verification gate" moment complete_chore represents for a
chore. A target_count=1 goal therefore behaves exactly like a chore's own
complete_chore -> approve_chore/reject_chore flow: one log_progress call is
the whole "mark it done" action.

Every function here operates on the caller's already-loaded `goals` dict
(id -> goal record, same {<goal_id>: <goal record>} shape store.py already
uses for chores) and mutates it in place; callers own saving the Store
afterward, same convention as chore_engine.py/reward_engine.py/
routine_engine.py. Every mutating function fires GOAL_EVENT_TYPE via
hass.bus.async_fire, same as chore_engine.py's own _fire_chore_event.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any, Callable, Optional

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from .const import (
    GOAL_EVENT_TYPE,
    GOAL_REWARD_TYPE_CATALOG_ITEM,
    GOAL_REWARD_TYPE_STARS,
    GOAL_REWARD_TYPES,
    GOAL_STATUS_APPROVED,
    GOAL_STATUS_OPEN,
    GOAL_STATUS_PENDING_VERIFICATION,
)
from .reward_engine import LEDGER_SOURCE_GOAL_ACHIEVED, RewardError, add_stars, grant_item

_LOGGER = logging.getLogger(__name__)

# Same dependency-injection shape as chore_engine.IsUserEnabled - see that
# module's own docstring for the full reasoning (keeps this module import-
# independent of __init__.py/the Settings store).
IsUserEnabled = Callable[[str], bool]


class GoalError(Exception):
    """Raised for any invalid goal operation - see .code for a short
    machine-readable reason (chores_websocket_api.py maps it straight to
    send_error's error code), same shape as ChoreError/RewardError/
    RoutineError."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def new_goal_id() -> str:
    return f"gl_{uuid.uuid4().hex[:12]}"


def _now_iso() -> str:
    return dt_util.utcnow().isoformat()


def default_goal(**overrides: Any) -> dict[str, Any]:
    """A fully-populated goal record with every schema field defaulted,
    then overridden by whatever the caller actually specified - same
    "single source of truth for the shape" role default_chore plays for
    chores, used by both create_goal and tests."""
    goal: dict[str, Any] = {
        "id": overrides.get("id") or new_goal_id(),
        "title": "",
        "assigned_to": None,
        "target_count": 1,
        "current_count": 0,
        "log_history": [],
        "notes": "",
        "due_date": None,
        "reward_type": GOAL_REWARD_TYPE_STARS,
        "star_value": 0,
        "reward_item_id": None,
        "status": GOAL_STATUS_OPEN,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "completed_by": None,
        "completed_at": None,
        "approved_by": None,
        "approved_at": None,
        "rejected_by": None,
        "rejected_at": None,
        "reject_reason": None,
    }
    goal.update(overrides)
    return goal


def _fire_goal_event(
    hass: HomeAssistant,
    goal: dict[str, Any],
    *,
    previous_status: Optional[str],
    actor: Optional[str] = None,
    extra: Optional[dict[str, Any]] = None,
) -> None:
    payload = {
        "goal_id": goal["id"],
        "title": goal.get("title"),
        "status": goal.get("status"),
        "previous_status": previous_status,
        "assigned_to": goal.get("assigned_to"),
        "actor": actor,
    }
    if extra:
        payload.update(extra)
    try:
        hass.bus.async_fire(GOAL_EVENT_TYPE, payload)
    except Exception as err:  # noqa: BLE001 - a listener misbehaving must never break the goal action itself
        _LOGGER.warning("Family Hub: error firing %s: %s", GOAL_EVENT_TYPE, err)


def _validate_reward_fields(reward_type: str, star_value: int, reward_item_id: Optional[str]) -> None:
    if reward_type not in GOAL_REWARD_TYPES:
        raise GoalError("invalid_reward_type", f"Unknown reward_type: {reward_type!r}")
    if reward_type == GOAL_REWARD_TYPE_STARS and star_value <= 0:
        raise GoalError("invalid_star_value", "A star-reward goal needs a positive star_value.")
    if reward_type == GOAL_REWARD_TYPE_CATALOG_ITEM and not reward_item_id:
        raise GoalError("missing_reward_item", "A catalog-reward goal needs a reward_item_id.")


def create_goal(
    goals: dict[str, dict[str, Any]],
    hass: HomeAssistant,
    payload: dict[str, Any],
    is_user_enabled: Optional[IsUserEnabled] = None,
) -> dict[str, Any]:
    """Validate + build a new goal record, insert it into `goals` (the
    caller's in-memory dict, saved to the Store afterward), fire the
    creation event, and return the record. Unlike create_chore, assigned_to
    is always required here - there is no Chore-Bin-style "unclaimed"
    state for a goal, it's always for one specific person from the start."""
    title = str(payload.get("title") or "").strip()
    if not title:
        raise GoalError("invalid_title", "A goal needs a title.")

    assigned_to = payload.get("assigned_to")
    if not assigned_to:
        raise GoalError("missing_assignee", "A goal needs someone it belongs to.")
    if is_user_enabled is not None and not is_user_enabled(assigned_to):
        raise GoalError(
            "user_chores_disabled",
            "This person isn't eligible for a new goal right now (not a Family Hub member, or excluded from Chores/Goals).",
        )

    target_count = max(1, int(payload.get("target_count") or 1))
    reward_type = payload.get("reward_type") or GOAL_REWARD_TYPE_STARS
    star_value = max(0, int(payload.get("star_value") or 0))
    reward_item_id = payload.get("reward_item_id") or None
    _validate_reward_fields(reward_type, star_value, reward_item_id)

    notes = str(payload.get("notes") or "").strip()

    goal = default_goal(
        id=new_goal_id(),
        title=title,
        assigned_to=assigned_to,
        target_count=target_count,
        notes=notes,
        due_date=payload.get("due_date") or None,
        reward_type=reward_type,
        star_value=star_value,
        reward_item_id=reward_item_id,
    )
    goals[goal["id"]] = goal
    _fire_goal_event(hass, goal, previous_status=None)
    return goal


def _get_goal(goals: dict[str, dict[str, Any]], goal_id: str) -> dict[str, Any]:
    goal = goals.get(goal_id)
    if goal is None:
        raise GoalError("not_found", f"No goal with id {goal_id!r}")
    return goal


def log_progress(
    goals: dict[str, dict[str, Any]],
    hass: HomeAssistant,
    goal_id: str,
    actor: Optional[str],
) -> dict[str, Any]:
    """One occurrence toward the goal's own target_count - "I practiced
    just now." Appends to log_history (timestamp + who logged it, so a
    parent approving later can sanity-check WHEN each occurrence happened,
    not just trust a bare number) and bumps current_count by exactly one.
    Reaching target_count on this call is what flips the goal into
    pending_verification - the same "first half of the verification gate"
    moment complete_chore represents for a chore - recording completed_by/
    completed_at the same way. Raises "not_open" once the goal has already
    reached that point (mirrors complete_chore's own "not_open" guard) -
    there is no way to over-log past the target."""
    goal = _get_goal(goals, goal_id)
    if goal["status"] != GOAL_STATUS_OPEN:
        raise GoalError("not_open", "This goal isn't open for logging (already pending approval or approved).")
    if not goal.get("assigned_to"):
        raise GoalError("unassigned", "This goal has no one assigned to it.")

    now = _now_iso()
    goal.setdefault("log_history", []).append({"at": now, "by": actor})
    target = max(1, int(goal.get("target_count") or 1))
    goal["current_count"] = min(target, int(goal.get("current_count") or 0) + 1)
    goal["updated_at"] = now

    previous = goal["status"]
    if goal["current_count"] >= target:
        goal["status"] = GOAL_STATUS_PENDING_VERIFICATION
        goal["completed_by"] = actor
        goal["completed_at"] = now
    _fire_goal_event(hass, goal, previous_status=previous, actor=actor, extra={"event": "logged", "current_count": goal["current_count"]})
    return goal


def approve_goal(
    goals: dict[str, dict[str, Any]],
    rewards: dict[str, Any],
    hass: HomeAssistant,
    goal_id: str,
    approver: Optional[str],
) -> dict[str, Any]:
    """The second half of the verification gate: Pending Verification ->
    Approved -> reward disbursed. Disburses per the goal's own reward_type
    (see const.py's GOAL_REWARD_TYPE_* docstring): star_value credited via
    reward_engine.add_stars for "stars", or reward_item_id handed over
    directly via reward_engine.grant_item for "catalog_item" - a
    since-deleted catalog item is logged and swallowed rather than blocking
    the approval itself (the goal was still genuinely achieved; the
    reward's own availability is a separate, already-surfaced-elsewhere
    concern - same fail-safe posture reward_engine.use_bank already takes
    on a since-deleted item)."""
    goal = _get_goal(goals, goal_id)
    if goal["status"] != GOAL_STATUS_PENDING_VERIFICATION:
        raise GoalError("not_pending", "This goal isn't waiting on approval.")

    previous = goal["status"]
    goal["status"] = GOAL_STATUS_APPROVED
    goal["approved_by"] = approver
    goal["approved_at"] = _now_iso()
    goal["updated_at"] = goal["approved_at"]
    # A clean approval has nothing left to explain - clear out any note left
    # by an earlier reject_goal on a prior attempt, same reasoning
    # approve_chore already applies to CHORE_KEY_REJECT_REASON.
    goal["rejected_by"] = None
    goal["rejected_at"] = None
    goal["reject_reason"] = None

    assignee = goal.get("assigned_to")
    reward_type = goal.get("reward_type") or GOAL_REWARD_TYPE_STARS
    stars_disbursed = 0
    if assignee and reward_type == GOAL_REWARD_TYPE_STARS:
        stars_disbursed = int(goal.get("star_value") or 0)
        if stars_disbursed:
            add_stars(
                rewards, assignee, stars_disbursed,
                reason=f"Goal achieved: {goal.get('title')}", source=LEDGER_SOURCE_GOAL_ACHIEVED,
            )
    elif assignee and reward_type == GOAL_REWARD_TYPE_CATALOG_ITEM:
        item_id = goal.get("reward_item_id")
        if item_id:
            try:
                grant_item(rewards, assignee, item_id, reason=f"Goal achieved: {goal.get('title')}")
            except RewardError as err:
                _LOGGER.warning(
                    "Family Hub: goal %s approved but its reward_item_id %r couldn't be granted (%s) - "
                    "the catalog item was probably deleted; the goal is still approved.",
                    goal_id, item_id, err,
                )

    _fire_goal_event(hass, goal, previous_status=previous, actor=approver, extra={"stars_disbursed": stars_disbursed})
    return goal


def reject_goal(
    goals: dict[str, dict[str, Any]],
    hass: HomeAssistant,
    goal_id: str,
    rejecter: Optional[str],
    reason: Optional[str] = None,
) -> dict[str, Any]:
    """The other way out of the verification gate: Pending Verification ->
    back to Open. Unlike reject_chore (which leaves a chore's own
    completed_by/completed_at cleared but nothing else touched), a
    rejected goal's current_count and log_history are both reset to
    empty/zero - "send it back" for a counted goal means genuinely trying
    again, not a silent partial-credit reduction with no clear record of
    which specific logged occurrence was disputed. No reward disbursed, no
    stars/bank touched - approve_goal is the only place that ever happens,
    and this function never reaches it."""
    goal = _get_goal(goals, goal_id)
    if goal["status"] != GOAL_STATUS_PENDING_VERIFICATION:
        raise GoalError("not_pending", "This goal isn't waiting on approval.")

    previous = goal["status"]
    goal["status"] = GOAL_STATUS_OPEN
    goal["current_count"] = 0
    goal["log_history"] = []
    goal["completed_by"] = None
    goal["completed_at"] = None
    goal["rejected_by"] = rejecter
    goal["rejected_at"] = _now_iso()
    reason = (reason or "").strip()
    goal["reject_reason"] = reason or None
    goal["updated_at"] = goal["rejected_at"]
    _fire_goal_event(hass, goal, previous_status=previous, actor=rejecter, extra={"event": "rejected", "reason": goal["reject_reason"]})
    return goal


_EDITABLE_FIELDS = (
    "title",
    "assigned_to",
    "target_count",
    "notes",
    "due_date",
    "reward_type",
    "star_value",
    "reward_item_id",
)


def update_goal(
    goals: dict[str, dict[str, Any]],
    goal_id: str,
    fields: dict[str, Any],
    is_user_enabled: Optional[IsUserEnabled] = None,
) -> dict[str, Any]:
    """Edit an open goal's details (never while pending_verification/
    approved - reject it back to open first, same reasoning as
    update_chore). Only touches keys the caller actually passed in
    `fields`; only fields in _EDITABLE_FIELDS are honored, so e.g.
    `status`/`current_count`/`log_history` can never be smuggled in through
    this path - those only ever change via log_progress/approve_goal/
    reject_goal. Reassigning to a different person (`assigned_to`) is
    allowed directly here rather than through a separate assign_goal
    action, unlike Chores - there's no Chore-Bin/drag-and-drop concept to
    mirror for a goal, so a plain editable field is simpler and just as
    safe (still gated by is_user_enabled).

    If target_count is lowered to (or below) a count already logged, the
    goal immediately advances to pending_verification exactly as if that
    many log_progress calls had just landed - an admin shrinking the target
    below what's already been logged is a deliberate "that's enough,
    already done" call, not something that should require yet another
    log_progress tap that can't happen (the goal isn't open anymore in
    spirit, only in stale field values) to actually take effect."""
    goal = _get_goal(goals, goal_id)
    if goal["status"] != GOAL_STATUS_OPEN:
        raise GoalError("not_open", "Only an open (not-yet-completed) goal can be edited.")
    if "title" in fields:
        title = str(fields["title"] or "").strip()
        if not title:
            raise GoalError("invalid_title", "A goal needs a title.")
        goal["title"] = title
    if "assigned_to" in fields:
        new_assignee = fields["assigned_to"]
        if not new_assignee:
            raise GoalError("missing_assignee", "A goal needs someone it belongs to.")
        if is_user_enabled is not None and not is_user_enabled(new_assignee):
            raise GoalError(
                "user_chores_disabled",
                "This person isn't eligible for a new goal right now (not a Family Hub member, or excluded from Chores/Goals).",
            )
        goal["assigned_to"] = new_assignee
    if "target_count" in fields:
        goal["target_count"] = max(1, int(fields["target_count"] or 1))
    if "notes" in fields:
        goal["notes"] = str(fields["notes"] or "").strip()
    if "due_date" in fields:
        goal["due_date"] = fields["due_date"] or None
    reward_type = fields.get("reward_type", goal.get("reward_type"))
    star_value = int(fields.get("star_value", goal.get("star_value")) or 0)
    reward_item_id = fields.get("reward_item_id", goal.get("reward_item_id")) or None
    if "reward_type" in fields or "star_value" in fields or "reward_item_id" in fields:
        _validate_reward_fields(reward_type, star_value, reward_item_id)
        goal["reward_type"] = reward_type
        goal["star_value"] = star_value
        goal["reward_item_id"] = reward_item_id

    now = _now_iso()
    goal["updated_at"] = now
    target = max(1, int(goal.get("target_count") or 1))
    if int(goal.get("current_count") or 0) >= target:
        goal["status"] = GOAL_STATUS_PENDING_VERIFICATION
        if not goal.get("completed_at"):
            goal["completed_at"] = now
    return goal


def delete_goal(goals: dict[str, dict[str, Any]], goal_id: str) -> None:
    if goal_id not in goals:
        raise GoalError("not_found", f"No goal with id {goal_id!r}")
    del goals[goal_id]
