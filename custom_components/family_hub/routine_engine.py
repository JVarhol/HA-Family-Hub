"""Routines: per-person daily checklists (Morning/Afternoon/Night Routine),
deliberately separate from the Chores/star-reward system in chore_engine.py/
reward_engine.py - no assignment modes, no verification gate, no stars.
Just "add an item under one of a person's three fixed routine categories,
check it off, and it resets back to unchecked at the next local day
change so the same routine is ready to run again tomorrow."

Every function here operates on the caller's already-loaded `routines`
dict (see store.py's default_routines shape: {"last_reset_date": ...,
"items": {<item_id>: <item record>, ...}}) and mutates it in place;
callers own saving the Store afterward, same convention as
chore_engine.py/reward_engine.py.

Membership enforcement (is_user_enabled) follows the exact same
dependency-injection shape chore_engine.py uses for the same reason - this
module stays self-contained (no import of __init__.py or the Settings
store).
"""
from __future__ import annotations

import re
import uuid
from datetime import date
from typing import Any, Callable, Optional

from homeassistant.util import dt as dt_util

from .const import ROUTINE_CATEGORIES

IsUserEnabled = Callable[[str], bool]


class RoutineError(Exception):
    """Raised for any invalid routine operation - see .code for a short
    machine-readable reason (chores_websocket_api.py maps it straight to
    send_error's error code)."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


# v136+: an item can optionally carry a due_time ("HH:MM", 24-hour, local
# wall-clock - deliberately not a full datetime, since a routine item
# recurs every day rather than pointing at one specific date the way a
# chore's due_date does) and/or days_of_week (a list of Python weekday
# ints, Monday=0..Sunday=6, matching date.weekday() - deliberately NOT
# ISO's Monday=1..Sunday=7 or JS's Sunday=0..Saturday=6, so the frontend's
# own day-of-week filtering has to convert from JS's getDay() itself, see
# family-hub-chores-card.js's _routineItemsFor). An empty/missing
# days_of_week means "every day" - the common case, and the same default
# behavior this feature always had before days_of_week existed at all.
_DUE_TIME_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


def _validate_due_time(due_time: Any) -> Optional[str]:
    if due_time in (None, ""):
        return None
    if not isinstance(due_time, str) or not _DUE_TIME_RE.match(due_time):
        raise RoutineError("invalid_due_time", "Due time needs to be a 24-hour HH:MM time, like 07:30.")
    return due_time


def _validate_days_of_week(days_of_week: Any) -> list[int]:
    if days_of_week in (None, ""):
        return []
    if not isinstance(days_of_week, (list, tuple)):
        raise RoutineError("invalid_days_of_week", "Days of week needs to be a list of weekday numbers (0=Monday..6=Sunday).")
    try:
        days = sorted({int(d) for d in days_of_week})
    except (TypeError, ValueError):
        raise RoutineError("invalid_days_of_week", "Days of week needs to be a list of weekday numbers (0=Monday..6=Sunday).")
    if any(d < 0 or d > 6 for d in days):
        raise RoutineError("invalid_days_of_week", "Days of week needs to be a list of weekday numbers (0=Monday..6=Sunday).")
    return days


def new_routine_item_id() -> str:
    return f"rtn_{uuid.uuid4().hex[:12]}"


def _now_iso() -> str:
    return dt_util.utcnow().isoformat()


def create_item(
    routines: dict[str, Any],
    user_id: str,
    category: str,
    title: str,
    is_user_enabled: Optional[IsUserEnabled] = None,
    due_time: Optional[str] = None,
    days_of_week: Optional[list[int]] = None,
) -> dict[str, Any]:
    """Add one checklist item under `user_id`'s `category` routine. Raises
    if user_id isn't a real Family Hub member (same membership gate as
    Chores - see chore_engine._check_user_enabled) or category isn't one
    of the three fixed ROUTINE_CATEGORIES. due_time ("HH:MM", optional) and
    days_of_week (optional list of 0=Monday..6=Sunday - empty/omitted means
    every day) are both validated via _validate_due_time/_validate_days_of_
    week - see their docstring comment just above for why the shapes are
    what they are."""
    if category not in ROUTINE_CATEGORIES:
        raise RoutineError("invalid_category", f"Unknown routine category: {category!r}")
    title = str(title or "").strip()
    if not title:
        raise RoutineError("invalid_title", "A routine item needs a title.")
    if not user_id:
        raise RoutineError("missing_user", "A routine item needs a person to belong to.")
    if is_user_enabled is not None and not is_user_enabled(user_id):
        raise RoutineError(
            "user_chores_disabled",
            "This person hasn't been added to Family Hub yet - they can't get a routine item right now.",
        )
    due_time = _validate_due_time(due_time)
    days_of_week = _validate_days_of_week(days_of_week)
    item = {
        "id": new_routine_item_id(),
        "user_id": user_id,
        "category": category,
        "title": title,
        "done": False,
        "due_time": due_time,
        "days_of_week": days_of_week,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    routines.setdefault("items", {})[item["id"]] = item
    return item


def update_item(
    routines: dict[str, Any],
    item_id: str,
    title: str,
    due_time: Optional[str] = None,
    days_of_week: Optional[list[int]] = None,
) -> dict[str, Any]:
    """Edit an existing item's title/due_time/days_of_week in place - the
    "manage items" flow from the Routine tab of the Chores card's FAB
    modal (v136+). Deliberately does NOT allow moving an item to a
    different user_id/category - those are set once at creation (matches
    the picker-driven "which person/category am I managing right now" UI,
    which just deletes-and-recreates in that rare case rather than needing
    a move operation here). Same PERMISSION_ASSIGN gate as create_item/
    delete_item, enforced by the caller (ws_update_routine_item)."""
    item = _get_item(routines, item_id)
    title = str(title or "").strip()
    if not title:
        raise RoutineError("invalid_title", "A routine item needs a title.")
    item["title"] = title
    item["due_time"] = _validate_due_time(due_time)
    item["days_of_week"] = _validate_days_of_week(days_of_week)
    item["updated_at"] = _now_iso()
    return item


def _get_item(routines: dict[str, Any], item_id: str) -> dict[str, Any]:
    item = routines.setdefault("items", {}).get(item_id)
    if item is None:
        raise RoutineError("not_found", f"No routine item with id {item_id!r}")
    return item


def toggle_item(routines: dict[str, Any], item_id: str, done: bool) -> dict[str, Any]:
    """Mark one item done/not-done - the checkbox action, open to anyone
    (no permission gate here; see chores_websocket_api.py's ws_toggle_
    routine_item for why: this is a personal daily checklist on a shared
    kitchen tablet, not a reward-bearing chore, so the same low-stakes
    self-serve principle as claim_chore applies, minus even the "first tap
    wins" race-safety concern since checking your own already-checked item
    again is harmless)."""
    item = _get_item(routines, item_id)
    item["done"] = bool(done)
    item["updated_at"] = _now_iso()
    return item


def delete_item(routines: dict[str, Any], item_id: str) -> None:
    items = routines.setdefault("items", {})
    if item_id not in items:
        raise RoutineError("not_found", f"No routine item with id {item_id!r}")
    del items[item_id]


def maybe_reset_daily(routines: dict[str, Any], today: Optional[date] = None) -> bool:
    """The daily-rollover check - called once during async_setup_entry
    (right after the routines store loads, so a Home Assistant restart on
    a new day starts fresh even before the first poll tick) and again on
    every later poll tick (so a household that never restarts still wakes
    up to fresh routines each morning - same poll-tick granularity as
    sweep_overdue_chores/sweep_due_recurrences, not instant-on-the-second).
    Idempotent and cheap to call repeatedly: compares today's LOCAL
    calendar date (not a timestamp - a routine resets once per real day,
    not every 24 hours on a rolling clock) against the last date this
    actually ran, and only touches anything when they differ. Returns True
    if it reset anything (so the caller knows whether a save is actually
    needed), False otherwise."""
    today = today or dt_util.now().date()
    today_str = today.isoformat()
    if routines.get("last_reset_date") == today_str:
        return False
    items = routines.setdefault("items", {})
    for item in items.values():
        item["done"] = False
    routines["last_reset_date"] = today_str
    return True
