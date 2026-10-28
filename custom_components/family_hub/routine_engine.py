"""Routines: per-person daily checklists (Morning/Afternoon/Night Routine)"""
from __future__ import annotations

import re
import uuid
from datetime import date
from typing import Any, Callable, Optional

from homeassistant.util import dt as dt_util

from .const import ROUTINE_CATEGORIES
from .reward_engine import LEDGER_SOURCE_ROUTINE_APPROVED, add_stars

IsUserEnabled = Callable[[str], bool]


class RoutineError(Exception):
    """Raised for any invalid routine operation - see .code for a short
    machine-readable reason (chores_websocket_api.py maps it straight to
    send_error's error code)."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


# an item can optionally carry a due_time ("HH:MM", 24-hour, local wall-clock - deliberately not a full datetime
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


def _validate_star_value(star_value: Any) -> int:
    try:
        n = int(star_value or 0)
    except (TypeError, ValueError):
        return 0
    return max(0, n)


# ): a routine item's own equivalent of a chore's auto_complete_trigger - {"entity_id": ..., "from_state": ..., "to_state": ...}
def _validate_auto_complete_trigger(trigger: Any) -> Optional[dict[str, Any]]:
    if not trigger or not isinstance(trigger, dict):
        return None
    return trigger


def create_item(
    routines: dict[str, Any],
    user_id: str,
    category: str,
    title: str,
    is_user_enabled: Optional[IsUserEnabled] = None,
    due_time: Optional[str] = None,
    days_of_week: Optional[list[int]] = None,
    star_value: int = 0,
    no_approval_required: bool = False,
    auto_complete_trigger: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Add one checklist item under `user_id`'s `category` routine."""
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
        # sort_order is None (unset) until a household actually drags something in this user_id+category section (see reorder_items)
        "sort_order": _next_sort_order_if_section_is_manually_ordered(routines, user_id, category),
        "star_value": _validate_star_value(star_value),
        "no_approval_required": bool(no_approval_required),
        "auto_complete_trigger": _validate_auto_complete_trigger(auto_complete_trigger),
        # Both transient, day-scoped bookkeeping for the star payout below - neither means anything for a star_value=0 item
        "pending_approval": False,
        "stars_disbursed_today": False,
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
    star_value: int = 0,
    no_approval_required: bool = False,
    auto_complete_trigger: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Edit an existing item's title/due_time/days_of_week/star_value/ no_approval_required/auto_complete_trigger in place"""
    item = _get_item(routines, item_id)
    title = str(title or "").strip()
    if not title:
        raise RoutineError("invalid_title", "A routine item needs a title.")
    item["title"] = title
    item["due_time"] = _validate_due_time(due_time)
    item["days_of_week"] = _validate_days_of_week(days_of_week)
    item["star_value"] = _validate_star_value(star_value)
    item["no_approval_required"] = bool(no_approval_required)
    item["auto_complete_trigger"] = _validate_auto_complete_trigger(auto_complete_trigger)
    item["updated_at"] = _now_iso()
    return item


def _get_item(routines: dict[str, Any], item_id: str) -> dict[str, Any]:
    item = routines.setdefault("items", {}).get(item_id)
    if item is None:
        raise RoutineError("not_found", f"No routine item with id {item_id!r}")
    return item


def toggle_item(
    routines: dict[str, Any], rewards: dict[str, Any], item_id: str, done: bool, actor: Optional[str] = None
) -> dict[str, Any]:
    """Mark one item done/not-done - the checkbox action, open to anyone (no permission gate here"""
    item = _get_item(routines, item_id)
    item["done"] = bool(done)
    if not done:
        item["pending_approval"] = False
        item["updated_at"] = _now_iso()
        return item

    star_value = int(item.get("star_value") or 0)
    if star_value and not item.get("stars_disbursed_today"):
        if item.get("no_approval_required"):
            add_stars(
                rewards, item["user_id"], star_value,
                reason=f"Routine item completed: {item.get('title')}", source=LEDGER_SOURCE_ROUTINE_APPROVED,
            )
            item["stars_disbursed_today"] = True
            item["pending_approval"] = False
        else:
            item["pending_approval"] = True
    item["updated_at"] = _now_iso()
    return item


def approve_item(routines: dict[str, Any], rewards: dict[str, Any], item_id: str, approver: Optional[str] = None) -> dict[str, Any]:
    """The manual half of the routine star payout - toggle_item's counterpart to chore_engine.approve_chore, for an item whose no_approval_required is false"""
    item = _get_item(routines, item_id)
    if not item.get("pending_approval") or item.get("stars_disbursed_today"):
        return item
    star_value = int(item.get("star_value") or 0)
    if star_value:
        add_stars(
            rewards, item["user_id"], star_value,
            reason=f"Routine item approved: {item.get('title')}", source=LEDGER_SOURCE_ROUTINE_APPROVED,
        )
    item["stars_disbursed_today"] = True
    item["pending_approval"] = False
    item["updated_at"] = _now_iso()
    return item


def delete_item(routines: dict[str, Any], item_id: str) -> None:
    items = routines.setdefault("items", {})
    if item_id not in items:
        raise RoutineError("not_found", f"No routine item with id {item_id!r}")
    del items[item_id]


def _section_items(routines: dict[str, Any], user_id: str, category: str) -> list[dict[str, Any]]:
    return [
        item for item in routines.get("items", {}).values()
        if item.get("user_id") == user_id and item.get("category") == category
    ]


def _next_sort_order_if_section_is_manually_ordered(
    routines: dict[str, Any], user_id: str, category: str
) -> Optional[int]:
    """See create_item's own comment for the full reasoning - returns None"""
    existing_orders = [
        item.get("sort_order") for item in _section_items(routines, user_id, category)
        if item.get("sort_order") is not None
    ]
    if not existing_orders:
        return None
    return max(existing_orders) + 1


def reorder_items(
    routines: dict[str, Any], user_id: str, category: str, ordered_item_ids: list[str]
) -> list[dict[str, Any]]:
    """Persists a household's drag-and-drop reordering of one person's one routine category (Morning/Afternoon/Night)"""
    section_items = {item["id"]: item for item in _section_items(routines, user_id, category)}
    if set(ordered_item_ids) != set(section_items.keys()):
        raise RoutineError(
            "invalid_order",
            "That reordering doesn't match this section's current items - it may have changed since you started dragging.",
        )
    for index, item_id in enumerate(ordered_item_ids):
        section_items[item_id]["sort_order"] = index
        section_items[item_id]["updated_at"] = _now_iso()
    return [section_items[item_id] for item_id in ordered_item_ids]


def is_item_due_today(item: dict[str, Any], today_weekday: Optional[int] = None) -> bool:
    """True when `item` is scheduled for today - mirrors the board's own
    day filter (family-hub-chores-card.js's _routineItemsFor: "!item.
    days_of_week || !item.days_of_week.length || item.days_of_week.
    includes(todayWeekday)") so is_routine_complete below agrees exactly
    with what the household actually SEES on today's board, not some
    separate backend notion of "today." today_weekday defaults to the
    server's own local weekday (0=Monday..6=Sunday, matching days_of_
    week's own convention) when not passed in explicitly - tests pass it
    explicitly so they don't depend on whatever day they happen to run
    on."""
    days_of_week = item.get("days_of_week") or []
    if not days_of_week:
        return True
    weekday = dt_util.now().weekday() if today_weekday is None else today_weekday
    return weekday in days_of_week


def is_routine_complete(
    routines: dict[str, Any], user_id: str, category: str, today_weekday: Optional[int] = None
) -> bool:
    """True once every item belonging to `user_id`'s `category` routine that's actually due today (is_item_due_ today) is checked off"""
    weekday = dt_util.now().weekday() if today_weekday is None else today_weekday
    todays_items = [
        item
        for item in routines.get("items", {}).values()
        if item.get("user_id") == user_id and item.get("category") == category and is_item_due_today(item, weekday)
    ]
    if not todays_items:
        return False
    return all(item.get("done") for item in todays_items)


def maybe_reset_daily(routines: dict[str, Any], today: Optional[date] = None) -> bool:
    """The daily-rollover check - called once during async_setup_entry (right after the routines store loads"""
    today = today or dt_util.now().date()
    today_str = today.isoformat()
    if routines.get("last_reset_date") == today_str:
        return False
    items = routines.setdefault("items", {})
    for item in items.values():
        item["done"] = False
        # Star bookkeeping is scoped to "today" (see create_item's own docstring) - a new day means a fresh shot at earning/approving the star again
        item["pending_approval"] = False
        item["stars_disbursed_today"] = False
    routines["last_reset_date"] = today_str
    return True
