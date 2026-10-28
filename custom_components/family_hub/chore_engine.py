"""Core chore business logic - assignment, the completion/verification state machine, dependencies, overdue penalties, streaks"""
from __future__ import annotations

import calendar
import logging
import uuid
from datetime import date, datetime, timedelta
from typing import Any, Callable, Optional

from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.util import dt as dt_util

from . import timer_engine

from .const import (
    CHORE_KEY_STAR_REQUEST,
    STAR_REQUEST_MAX_STARS,
    CHORE_ASSIGNMENT_MODE_AUTO_ROTATION,
    CHORE_ASSIGNMENT_MODE_CHORE_BIN,
    CHORE_ASSIGNMENT_MODE_DIRECT,
    CHORE_ASSIGNMENT_MODE_FIRST_COME_FIRST_SERVED,
    CHORE_ASSIGNMENT_MODES,
    CHORE_BIN_SENTINEL,
    CHORE_EVENT_TYPE,
    CHORE_KEY_ALARM_AUDIENCE,
    CHORE_KEY_APPROVED_AT,
    CHORE_KEY_APPROVED_BY,
    CHORE_KEY_COMPLETED_AT,
    CHORE_KEY_COMPLETED_BY,
    CHORE_KEY_GROUP_ID,
    CHORE_KEY_IMPORTANT,
    CHORE_KEY_IN_PROGRESS,
    CHORE_KEY_NO_APPROVAL_REQUIRED,
    CHORE_KEY_OVERDUE_PENALTY_APPLIED,
    CHORE_KEY_QUANTITY_REMAINING,
    CHORE_KEY_QUANTITY_TOTAL,
    CHORE_KEY_TIMER_MINUTES,
    CHORE_KEY_RECUR_DUE_OFFSET_MINUTES,
    CHORE_KEY_RECUR_INTERVAL_UNIT,
    CHORE_KEY_RECUR_MONTH_NTH,
    CHORE_KEY_RECUR_NEXT_DUE,
    CHORE_KEY_REJECT_REASON,
    CHORE_KEY_REJECTED_AT,
    CHORE_KEY_REJECTED_BY,
    CHORE_KEY_REMINDER_MINUTES,
    CHORE_KEY_REMINDERS_FIRED,
    CHORE_KEY_UPDATED_AT,
    CHORE_RECUR_INTERVAL_UNIT_DAYS,
    CHORE_RECUR_INTERVAL_UNIT_MONTHS,
    CHORE_RECUR_INTERVAL_UNIT_WEEKS,
    CHORE_RECUR_INTERVAL_UNITS,
    CHORE_RECUR_MONTH_NTH_VALUES,
    CHORE_RECUR_TYPE_INTERVAL,
    CHORE_RECUR_TYPE_MONTHLY_NTH,
    CHORE_RECUR_TYPE_WEEKDAYS,
    CHORE_RECUR_TYPES,
    CHORE_STATUS_APPROVED,
    CHORE_STATUS_OPEN,
    CHORE_STATUS_PENDING_VERIFICATION,
    PERMISSION_AUTO_APPROVE,
)
from .reward_engine import add_stars

_LOGGER = logging.getLogger(__name__)


class ChoreError(Exception):
    """Raised for any invalid chore operation (bad state, missing dependency, unknown chore id, etc.)"""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


# Passed in (never imported) by every caller that wants assignment eligibility enforced - a user_id -> bool check.
IsUserEnabled = Callable[[str], bool]


def _check_user_enabled(is_user_enabled: Optional[IsUserEnabled], user_id: Optional[str]) -> None:
    """Raise ChoreError("user_chores_disabled", ...) if user_id names a real
    person (not None, not the Chore Bin) who isn't eligible for a new chore
    assignment right now - either they haven't been added to Family Hub at
    all, or they have but have been explicitly excluded from Chores/Rewards
    (see the IsUserEnabled docstring just above). Either way they don't get
    a board column, and don't get offered as a new assignee anywhere
    (direct assignment, rotation groups, self-serve claim). Deliberately
    never called for CHORE_BIN_SENTINEL or None - "send it back to the
    bin"/"leave unassigned" is always allowed regardless of eligibility."""
    if is_user_enabled is None or user_id in (None, CHORE_BIN_SENTINEL):
        return
    if not is_user_enabled(user_id):
        raise ChoreError(
            "user_chores_disabled",
            "This person isn't eligible to be assigned a chore right now (not a Family Hub member, or excluded from Chores).",
        )


def new_chore_id() -> str:
    return f"chr_{uuid.uuid4().hex[:12]}"


def new_group_id() -> str:
    """one of these is generated per multi-assignee create request (chores_websocket_api.ws_create_chore's fan-out) and stamped onto every chore created from it"""
    return f"grp_{uuid.uuid4().hex[:12]}"


def _now_iso() -> str:
    return dt_util.utcnow().isoformat()


def _parse_dt(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        parsed = dt_util.parse_datetime(str(value))
    except Exception:  # noqa: BLE001
        return None
    return parsed


def _normalize_recur_interval_unit(value: Any) -> str:
    """Anything not one of the
    three real units (days/weeks/months) - including None, the value every
    chore saved before this field existed actually has - collapses to
    "days," the exact meaning "interval" always had before this feature,
    so nothing stored previously changes behavior."""
    if value in CHORE_RECUR_INTERVAL_UNITS:
        return value
    return CHORE_RECUR_INTERVAL_UNIT_DAYS


def _add_months(dt: datetime, months: int) -> datetime:
    """Adds `months` calendar months to `dt`, clamping the day-of-month to the target month's own last day when the original day doesn't exist there"""
    total_month_index = dt.month - 1 + months
    year = dt.year + total_month_index // 12
    month = total_month_index % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    day = min(dt.day, last_day)
    return dt.replace(year=year, month=month, day=day)


def _normalize_recur_type(value: Any) -> Optional[str]:
    value = value or None
    if value is None:
        return None
    if value not in CHORE_RECUR_TYPES:
        raise ChoreError("invalid_recur_type", f"Unknown recur_type: {value!r}")
    return value


def _normalize_quantity_total(value: Any) -> Optional[int]:
    """Quantity-based chores ("3 loads of laundry") - None/0/blank all mean
    "not a quantity chore," same as every other opt-in numeric field in
    this file (star_value, overdue_penalty). Anything below 1 collapses to
    None rather than raising, since the Create/Edit Chore modal's quantity
    field is just an optional number input a household can leave blank -
    there's no meaningful distinction between "left blank" and "typed 0."""
    if value in (None, ""):
        return None
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    return n if n >= 1 else None


def _normalize_recur_weekdays(value: Any) -> list[int]:
    """0=Monday..6=Sunday, matching Python's own date.weekday()/datetime."""
    days: list[int] = []
    for d in value or []:
        try:
            d_int = int(d)
        except (TypeError, ValueError):
            continue
        if 0 <= d_int <= 6 and d_int not in days:
            days.append(d_int)
    return sorted(days)


def _normalize_recur_month_nth(value: Any) -> Optional[int]:
    """which occurrence of the selected weekday(s) within a month -
    1/2/3/4 for "the Nth," -1 for "the last" (matches Google Calendar's own
    "Monthly on the last ..." option), None when not a monthly_nth chore or
    left blank. Anything else (0, 5+, garbage) collapses to None the same
    "opt-in field, blank on anything unrecognized" way every other numeric
    field in this module behaves - _compute_next_recur_due simply treats a
    None nth as "nothing to compute," the same as an empty weekday
    selection."""
    if value in (None, ""):
        return None
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    return n if n in CHORE_RECUR_MONTH_NTH_VALUES else None


def _nth_weekday_of_month(year: int, month: int, weekdays: set[int], nth: int) -> Optional[date]:
    """Every date in (year, month) whose weekday() is in `weekdays`, sorted, then the nth one (1-indexed) or the last one (nth == -1)."""
    if not weekdays:
        return None
    days_in_month = calendar.monthrange(year, month)[1]
    matches = [
        date(year, month, day)
        for day in range(1, days_in_month + 1)
        if date(year, month, day).weekday() in weekdays
    ]
    if not matches:
        return None
    if nth == -1:
        return matches[-1]
    idx = nth - 1
    return matches[idx] if 0 <= idx < len(matches) else None


def _normalize_reminder_minutes(value: Any) -> list[int]:
    """A chore's own reminder_minutes - deliberately as permissive as the calendar card's own event-reminder marker parsing"""
    minutes: list[int] = []
    for v in value or []:
        try:
            n = int(v)
        except (TypeError, ValueError):
            continue
        if n > 0:
            minutes.append(n)
    return sorted(set(minutes))


def _compute_next_recur_due(chore: dict[str, Any], from_dt: datetime) -> Optional[datetime]:
    """Computes when a just-approved recurring chore should pop back open - called exactly once, at the moment it's approved (see approve_chore)"""
    recur_type = chore.get("recur_type")
    if recur_type == CHORE_RECUR_TYPE_INTERVAL:
        # N (recur_interval_days, kept as the field name for backward compatibility) now pairs with a unit (recur_interval_unit)
        n = max(1, int(chore.get("recur_interval_days") or 0))
        unit = _normalize_recur_interval_unit(chore.get(CHORE_KEY_RECUR_INTERVAL_UNIT))
        if unit == CHORE_RECUR_INTERVAL_UNIT_WEEKS:
            return from_dt + timedelta(weeks=n)
        if unit == CHORE_RECUR_INTERVAL_UNIT_MONTHS:
            return _add_months(from_dt, n)
        return from_dt + timedelta(days=n)
    if recur_type == CHORE_RECUR_TYPE_WEEKDAYS:
        weekdays = set(_normalize_recur_weekdays(chore.get("recur_weekdays")))
        if not weekdays:
            return None
        for offset in range(1, 8):
            candidate = from_dt + timedelta(days=offset)
            if candidate.weekday() in weekdays:
                return candidate
        return None
    if recur_type == CHORE_RECUR_TYPE_MONTHLY_NTH:
        # Reuses recur_weekdays (one or more weekdays - see _nth_weekday_ of_month's own comment on how "first weekend" falls out of that) plus
        weekdays = set(_normalize_recur_weekdays(chore.get("recur_weekdays")))
        nth = _normalize_recur_month_nth(chore.get(CHORE_KEY_RECUR_MONTH_NTH))
        if not weekdays or nth is None:
            return None
        year, month = from_dt.year, from_dt.month
        for _ in range(24):
            candidate_date = _nth_weekday_of_month(year, month, weekdays, nth)
            if candidate_date is not None:
                candidate = from_dt.replace(year=candidate_date.year, month=candidate_date.month, day=candidate_date.day)
                if candidate > from_dt:
                    return candidate
            month += 1
            if month > 12:
                month = 1
                year += 1
        return None
    return None


def _normalize_recur_due_offset_minutes(value: Any) -> int:
    """How long AFTER each recurrence reset_recurring_chore should set the fresh due_date to."""
    if value in (None, ""):
        return 0
    try:
        n = int(value)
    except (TypeError, ValueError):
        return 0
    return max(0, n)


def default_chore(**overrides: Any) -> dict[str, Any]:
    """A fully-populated chore record with every schema field defaulted,
    then overridden by whatever the caller actually specified. Used by both
    create_chore (fresh chore) and tests (building fixtures without having
    to restate every field)."""
    chore: dict[str, Any] = {
        "id": overrides.get("id") or new_chore_id(),
        "title": "",
        "assigned_to": None,
        "assignment_mode": CHORE_ASSIGNMENT_MODE_DIRECT,
        "rotation_group": [],
        "rotation_pointer": 0,
        "star_value": 0,
        "due_date": None,
        "overdue_penalty": 0,
        CHORE_KEY_REMINDER_MINUTES: [],
        "notes": "",
        "status": CHORE_STATUS_OPEN,
        "streak_count": 0,
        "dependencies": [],
        "auto_create_trigger": None,
        "auto_complete_trigger": None,
        "recur_type": None,
        "recur_interval_days": 0,
        CHORE_KEY_RECUR_INTERVAL_UNIT: CHORE_RECUR_INTERVAL_UNIT_DAYS,
        "recur_weekdays": [],
        CHORE_KEY_RECUR_MONTH_NTH: None,
        CHORE_KEY_RECUR_DUE_OFFSET_MINUTES: 0,
        CHORE_KEY_RECUR_NEXT_DUE: None,
        "created_at": _now_iso(),
        CHORE_KEY_UPDATED_AT: _now_iso(),
        CHORE_KEY_OVERDUE_PENALTY_APPLIED: False,
        CHORE_KEY_COMPLETED_BY: None,
        CHORE_KEY_COMPLETED_AT: None,
        CHORE_KEY_APPROVED_BY: None,
        CHORE_KEY_APPROVED_AT: None,
        CHORE_KEY_REJECTED_BY: None,
        CHORE_KEY_REJECTED_AT: None,
        CHORE_KEY_REJECT_REASON: None,
        CHORE_KEY_REMINDERS_FIRED: [],
        CHORE_KEY_NO_APPROVAL_REQUIRED: False,
        CHORE_KEY_QUANTITY_TOTAL: None,
        CHORE_KEY_QUANTITY_REMAINING: None,
        CHORE_KEY_IMPORTANT: False,
        CHORE_KEY_IN_PROGRESS: False,
        CHORE_KEY_GROUP_ID: None,
        CHORE_KEY_STAR_REQUEST: False,
    }
    chore.update(overrides)
    return chore


def _fire_chore_event(
    hass: HomeAssistant,
    chore: dict[str, Any],
    *,
    previous_status: Optional[str],
    actor: Optional[str] = None,
    extra: Optional[dict[str, Any]] = None,
) -> None:
    payload = {
        "chore_id": chore["id"],
        "title": chore.get("title"),
        "status": chore.get("status"),
        "previous_status": previous_status,
        "assigned_to": chore.get("assigned_to"),
        "actor": actor,
    }
    if extra:
        payload.update(extra)
    try:
        hass.bus.async_fire(CHORE_EVENT_TYPE, payload)
    except Exception as err:  # noqa: BLE001 - a listener misbehaving must never break the chore action itself
        _LOGGER.warning("Family Hub: error firing %s: %s", CHORE_EVENT_TYPE, err)


def _resolve_initial_assignment(chore: dict[str, Any]) -> None:
    """Mutates chore["assigned_to"] in place based on assignment_mode, at
    creation time only (see reset_recurring_chore for the same resolution
    re-run on every later occurrence of a recurring chore)."""
    mode = chore.get("assignment_mode")
    if mode in (CHORE_ASSIGNMENT_MODE_CHORE_BIN, CHORE_ASSIGNMENT_MODE_FIRST_COME_FIRST_SERVED):
        chore["assigned_to"] = CHORE_BIN_SENTINEL
    elif mode == CHORE_ASSIGNMENT_MODE_AUTO_ROTATION:
        group = chore.get("rotation_group") or []
        pointer = chore.get("rotation_pointer") or 0
        if group:
            pointer = pointer % len(group)
            chore["rotation_pointer"] = pointer
            chore["assigned_to"] = group[pointer]
        else:
            chore["assigned_to"] = CHORE_BIN_SENTINEL
    # CHORE_ASSIGNMENT_MODE_DIRECT: leave assigned_to exactly as given - a direct chore with no assigned_to is a data error the caller


def create_chore(
    chores: dict[str, dict[str, Any]],
    hass: HomeAssistant,
    payload: dict[str, Any],
    is_user_enabled: Optional[IsUserEnabled] = None,
) -> dict[str, Any]:
    """Validate + build a new chore record, insert it into `chores` (the
    caller's in-memory dict, saved to the Store afterward), fire the
    creation event, and return the record."""
    title = str(payload.get("title") or "").strip()
    if not title:
        raise ChoreError("invalid_title", "A chore needs a title.")

    mode = payload.get("assignment_mode") or CHORE_ASSIGNMENT_MODE_DIRECT
    if mode not in CHORE_ASSIGNMENT_MODES:
        raise ChoreError("invalid_assignment_mode", f"Unknown assignment_mode: {mode!r}")

    dependencies = [str(d) for d in (payload.get("dependencies") or []) if d]
    unknown_deps = [d for d in dependencies if d not in chores]
    if unknown_deps:
        raise ChoreError(
            "unknown_dependency",
            f"Depends on chore(s) that don't exist: {', '.join(unknown_deps)}",
        )

    # a free-text description, shown in the click-to-open chore detail modal (family-hub-chores-card.js's _openChoreDetailModal)
    notes = str(payload.get("notes") or "").strip()

    rotation_group = [str(u) for u in (payload.get("rotation_group") or []) if u]
    if mode == CHORE_ASSIGNMENT_MODE_DIRECT:
        _check_user_enabled(is_user_enabled, payload.get("assigned_to"))
    elif mode == CHORE_ASSIGNMENT_MODE_AUTO_ROTATION:
        for member in rotation_group:
            _check_user_enabled(is_user_enabled, member)

    recur_type = _normalize_recur_type(payload.get("recur_type"))
    quantity_total = _normalize_quantity_total(payload.get(CHORE_KEY_QUANTITY_TOTAL))
    # optional countdown length.
    timer_minutes = timer_engine.normalize_timer_minutes(payload.get(CHORE_KEY_TIMER_MINUTES))
    # who/what rings when this chore's timer alarms - see const.py's CHORE_KEY_ALARM_AUDIENCE for the full picture.
    alarm_audience = timer_engine.normalize_alarm_audience(payload.get(CHORE_KEY_ALARM_AUDIENCE))

    chore = default_chore(
        id=new_chore_id(),
        title=title,
        assigned_to=payload.get("assigned_to"),
        assignment_mode=mode,
        rotation_group=rotation_group,
        rotation_pointer=int(payload.get("rotation_pointer") or 0),
        star_value=max(0, int(payload.get("star_value") or 0)),
        due_date=payload.get("due_date") or None,
        overdue_penalty=max(0, int(payload.get("overdue_penalty") or 0)),
        reminder_minutes=_normalize_reminder_minutes(payload.get(CHORE_KEY_REMINDER_MINUTES)),
        notes=notes,
        dependencies=dependencies,
        auto_create_trigger=payload.get("auto_create_trigger") or None,
        auto_complete_trigger=payload.get("auto_complete_trigger") or None,
        recur_type=recur_type,
        recur_interval_days=max(0, int(payload.get("recur_interval_days") or 0)),
        recur_weekdays=_normalize_recur_weekdays(payload.get("recur_weekdays")),
        **{CHORE_KEY_RECUR_INTERVAL_UNIT: _normalize_recur_interval_unit(payload.get(CHORE_KEY_RECUR_INTERVAL_UNIT))},
        **{CHORE_KEY_RECUR_MONTH_NTH: _normalize_recur_month_nth(payload.get(CHORE_KEY_RECUR_MONTH_NTH))},
        **{CHORE_KEY_RECUR_DUE_OFFSET_MINUTES: _normalize_recur_due_offset_minutes(payload.get(CHORE_KEY_RECUR_DUE_OFFSET_MINUTES))},
        **{
            CHORE_KEY_NO_APPROVAL_REQUIRED: bool(payload.get(CHORE_KEY_NO_APPROVAL_REQUIRED)),
            CHORE_KEY_QUANTITY_TOTAL: quantity_total,
            # A fresh chore's remaining count always starts equal to its total - there's no partial progress to speak of yet.
            CHORE_KEY_QUANTITY_REMAINING: quantity_total,
            CHORE_KEY_TIMER_MINUTES: timer_minutes,
            CHORE_KEY_ALARM_AUDIENCE: alarm_audience,
            CHORE_KEY_IMPORTANT: bool(payload.get(CHORE_KEY_IMPORTANT)),
            # set by chores_websocket_api's multi-assignee fan-out (ws_create_chore, when the request names more than one assignee)
            CHORE_KEY_GROUP_ID: payload.get(CHORE_KEY_GROUP_ID) or None,
        },
    )
    if mode == CHORE_ASSIGNMENT_MODE_DIRECT and not chore.get("assigned_to"):
        raise ChoreError("missing_assignee", "A direct chore needs someone assigned to it.")
    _resolve_initial_assignment(chore)

    chores[chore["id"]] = chore
    _fire_chore_event(hass, chore, previous_status=None)
    return chore


def create_star_request(
    chores: dict[str, dict[str, Any]],
    hass: HomeAssistant,
    title: str,
    stars: Any,
    for_user: str,
    requested_by: Optional[str],
    notes: str = "",
    is_user_enabled: Optional[IsUserEnabled] = None,
) -> dict[str, Any]:
    """Someone asks for stars for a task that isn't on the chart: a one-off chore for `for_user`,
    already waiting for approval (Pending Verification), worth `stars`."""
    try:
        stars = int(stars)
    except (TypeError, ValueError):
        stars = 0
    if stars < 1 or stars > STAR_REQUEST_MAX_STARS:
        raise ChoreError("invalid_stars", f"Ask for between 1 and {STAR_REQUEST_MAX_STARS} stars.")
    if not for_user or for_user == CHORE_BIN_SENTINEL:
        raise ChoreError("missing_assignee", "Pick who the stars are for.")
    chore = create_chore(
        chores, hass,
        {"title": title, "assigned_to": for_user, "assignment_mode": CHORE_ASSIGNMENT_MODE_DIRECT, "star_value": stars, "notes": notes},
        is_user_enabled,
    )
    previous = chore["status"]
    now = _now_iso()
    chore[CHORE_KEY_STAR_REQUEST] = True
    chore["status"] = CHORE_STATUS_PENDING_VERIFICATION
    chore[CHORE_KEY_COMPLETED_BY] = requested_by or for_user
    chore[CHORE_KEY_COMPLETED_AT] = now
    chore[CHORE_KEY_UPDATED_AT] = now
    _fire_chore_event(hass, chore, previous_status=previous, actor=requested_by, extra={"event": "star_request"})
    return chore


def _get_chore(chores: dict[str, dict[str, Any]], chore_id: str) -> dict[str, Any]:
    chore = chores.get(chore_id)
    if chore is None:
        raise ChoreError("not_found", f"No chore with id {chore_id!r}")
    return chore


def assign_chore(
    chores: dict[str, dict[str, Any]],
    hass: HomeAssistant,
    chore_id: str,
    target: str,
    actor: Optional[str],
    is_user_enabled: Optional[IsUserEnabled] = None,
) -> dict[str, Any]:
    """Move a chore between the Chore Bin and a specific person (or back to the bin, if target is CHORE_BIN_SENTINEL)"""
    chore = _get_chore(chores, chore_id)
    if chore["status"] != CHORE_STATUS_OPEN:
        raise ChoreError("not_open", "Only an open (not-yet-completed) chore can be reassigned.")
    _check_user_enabled(is_user_enabled, target)
    chore["assigned_to"] = target
    chore[CHORE_KEY_UPDATED_AT] = _now_iso()
    chore[CHORE_KEY_IN_PROGRESS] = False
    _fire_chore_event(hass, chore, previous_status=CHORE_STATUS_OPEN, actor=actor, extra={"event": "assigned"})
    return chore


def claim_chore(
    chores: dict[str, dict[str, Any]],
    hass: HomeAssistant,
    chore_id: str,
    user_id: str,
    is_user_enabled: Optional[IsUserEnabled] = None,
) -> dict[str, Any]:
    """Self-serve claim from the Chore Bin - the action anyone (not just an admin) can take on a first_come_first_served chore"""
    chore = _get_chore(chores, chore_id)
    if chore["assigned_to"] != CHORE_BIN_SENTINEL:
        raise ChoreError("already_claimed", "Someone already claimed this chore.")
    _check_user_enabled(is_user_enabled, user_id)
    chore["assigned_to"] = user_id
    chore[CHORE_KEY_UPDATED_AT] = _now_iso()
    _fire_chore_event(hass, chore, previous_status=CHORE_STATUS_OPEN, actor=user_id, extra={"event": "claimed"})
    return chore


def set_chore_in_progress(
    chores: dict[str, dict[str, Any]],
    hass: HomeAssistant,
    chore_id: str,
    actor: Optional[str],
    in_progress: bool,
) -> dict[str, Any]:
    """Household ask, verbatim: "Chores should have a button to Mark in
    progress also." Toggles CHORE_KEY_IN_PROGRESS - a lightweight,
    reversible marker, NOT a new state-machine status (see this module's
    own docstring diagram, which stays exactly open -> pending_
    verification -> approved). Only valid while the chore is still
    CHORE_STATUS_OPEN; once complete_chore moves it on, "in progress" is
    meaningless and every exit from "open" (complete_chore, reject_chore's
    redo, reset_recurring_chore's fresh occurrence, assign_chore's
    reassignment) clears it back to False on its own - see each of their
    own comments. Doesn't touch assigned_to, dependencies, or anything
    else; purely a UI signal for "someone's actively working on this
    right now" on the Chores card."""
    chore = _get_chore(chores, chore_id)
    if chore["status"] != CHORE_STATUS_OPEN:
        raise ChoreError("not_open", "Only an open (not-yet-completed) chore can be marked in progress.")
    chore[CHORE_KEY_IN_PROGRESS] = bool(in_progress)
    chore[CHORE_KEY_UPDATED_AT] = _now_iso()
    _fire_chore_event(
        hass, chore, previous_status=CHORE_STATUS_OPEN, actor=actor,
        extra={"event": "in_progress" if in_progress else "in_progress_cleared"},
    )
    return chore


def chore_skips_verification(chore: dict[str, Any], permissions: Optional[dict[str, dict[str, Any]]] = None) -> bool:
    """True when a completion of THIS chore should go straight from open to approved with no pending_verification stop at all."""
    if chore.get(CHORE_KEY_NO_APPROVAL_REQUIRED):
        return True
    if not permissions:
        return False
    assignee = chore.get("assigned_to")
    if not assignee or assignee == CHORE_BIN_SENTINEL:
        return False
    return bool((permissions.get(assignee) or {}).get(PERMISSION_AUTO_APPROVE))


def _apply_approval(chore: dict[str, Any], rewards: dict[str, Any], approver: Optional[str]) -> int:
    """The state-changing core shared by approve_chore (the normal, human- in-the-loop path) and complete_chore's auto-approve shortcut (chore_skips_verification)"""
    due = _parse_dt(chore.get("due_date"))
    completed = _parse_dt(chore.get(CHORE_KEY_COMPLETED_AT))
    on_time = due is None or completed is None or completed <= due
    chore["streak_count"] = int(chore.get("streak_count") or 0) + 1 if on_time else 0

    chore["status"] = CHORE_STATUS_APPROVED
    chore[CHORE_KEY_APPROVED_BY] = approver
    chore[CHORE_KEY_APPROVED_AT] = _now_iso()
    chore[CHORE_KEY_UPDATED_AT] = chore[CHORE_KEY_APPROVED_AT]
    chore[CHORE_KEY_REJECTED_BY] = None
    chore[CHORE_KEY_REJECTED_AT] = None
    chore[CHORE_KEY_REJECT_REASON] = None

    if chore.get("recur_type"):
        next_due = _compute_next_recur_due(chore, dt_util.utcnow())
        chore[CHORE_KEY_RECUR_NEXT_DUE] = next_due.isoformat() if next_due else None
    else:
        chore[CHORE_KEY_RECUR_NEXT_DUE] = None

    assignee = chore.get("assigned_to")
    star_value = int(chore.get("star_value") or 0)
    disbursed = 0
    if assignee and assignee != CHORE_BIN_SENTINEL and star_value:
        add_stars(rewards, assignee, star_value, reason=f"Chore approved: {chore.get('title')}", source="chore_approved")
        disbursed = star_value

    if chore.get("assignment_mode") == CHORE_ASSIGNMENT_MODE_AUTO_ROTATION:
        group = chore.get("rotation_group") or []
        if group:
            chore["rotation_pointer"] = (int(chore.get("rotation_pointer") or 0) + 1) % len(group)

    return disbursed


def complete_chore(
    chores: dict[str, dict[str, Any]],
    rewards: dict[str, Any],
    hass: HomeAssistant,
    chore_id: str,
    actor: Optional[str],
    permissions: Optional[dict[str, dict[str, Any]]] = None,
) -> dict[str, Any]:
    """Mark a chore done, entering pending_verification - the first half of the verification gate (Completed -> Pending Verification)."""
    chore = _get_chore(chores, chore_id)
    if chore["status"] != CHORE_STATUS_OPEN:
        raise ChoreError("not_open", "This chore isn't open (already completed, or awaiting approval).")
    if chore.get("assigned_to") in (None, CHORE_BIN_SENTINEL):
        raise ChoreError("unassigned", "This chore has to be claimed/assigned before it can be completed.")

    unmet = [d for d in (chore.get("dependencies") or []) if chores.get(d, {}).get("status") != CHORE_STATUS_APPROVED]
    if unmet:
        raise ChoreError(
            "dependencies_not_met",
            f"Waiting on {len(unmet)} other chore(s) to be approved first.",
        )

    previous = chore["status"]

    quantity_total = chore.get(CHORE_KEY_QUANTITY_TOTAL)
    if quantity_total:
        remaining = chore.get(CHORE_KEY_QUANTITY_REMAINING)
        if remaining is None:
            remaining = quantity_total
        remaining -= 1
        if remaining > 0:
            # Still units left in this batch ("3 loads of laundry" -> 2 -> 1) - one unit just got done, but the chore stays "open" and nothing else
            chore[CHORE_KEY_QUANTITY_REMAINING] = remaining
            chore[CHORE_KEY_UPDATED_AT] = _now_iso()
            _fire_chore_event(
                hass, chore, previous_status=previous, actor=actor,
                extra={"event": "quantity_decremented", "quantity_remaining": remaining},
            )
            return chore
        # Last unit - record the count hitting zero, then fall through to the normal completion flow right below exactly as if this were an ordinary
        chore[CHORE_KEY_QUANTITY_REMAINING] = 0

    chore["status"] = CHORE_STATUS_PENDING_VERIFICATION
    chore[CHORE_KEY_COMPLETED_BY] = actor or chore.get("assigned_to")
    chore[CHORE_KEY_COMPLETED_AT] = _now_iso()
    chore[CHORE_KEY_UPDATED_AT] = chore[CHORE_KEY_COMPLETED_AT]
    # "In progress" only means anything while the chore is still open -
    # see set_chore_in_progress's own docstring.
    chore[CHORE_KEY_IN_PROGRESS] = False

    if chore_skips_verification(chore, permissions):
        approver = actor or chore.get("assigned_to")
        disbursed = _apply_approval(chore, rewards, approver)
        _fire_chore_event(
            hass, chore, previous_status=previous, actor=actor,
            extra={"auto_approved": True, "stars_disbursed": disbursed},
        )
        return chore

    _fire_chore_event(hass, chore, previous_status=previous, actor=actor)
    return chore


def approve_chore(
    chores: dict[str, dict[str, Any]],
    rewards: dict[str, Any],
    hass: HomeAssistant,
    chore_id: str,
    approver: Optional[str],
) -> dict[str, Any]:
    """The second half of the verification gate: Pending Verification -> Approved -> Stars Disbursed."""
    chore = _get_chore(chores, chore_id)
    if chore["status"] != CHORE_STATUS_PENDING_VERIFICATION:
        raise ChoreError("not_pending", "This chore isn't waiting on approval.")

    previous = chore["status"]
    disbursed = _apply_approval(chore, rewards, approver)
    _fire_chore_event(
        hass, chore, previous_status=previous, actor=approver,
        extra={"stars_disbursed": disbursed},
    )
    return chore


def reject_chore(
    chores: dict[str, dict[str, Any]],
    hass: HomeAssistant,
    chore_id: str,
    rejecter: Optional[str],
    reason: Optional[str] = None,
) -> dict[str, Any]:
    """The other way out of the verification gate: Pending Verification -> back to Open, for the SAME assignee to redo (unlike reset_recurring_chore"""
    chore = _get_chore(chores, chore_id)
    if chore["status"] != CHORE_STATUS_PENDING_VERIFICATION:
        raise ChoreError("not_pending", "This chore isn't waiting on approval.")

    previous = chore["status"]
    chore["status"] = CHORE_STATUS_OPEN
    chore[CHORE_KEY_COMPLETED_BY] = None
    chore[CHORE_KEY_COMPLETED_AT] = None
    # Bounced back to redo - starts fresh, not already "in progress."
    chore[CHORE_KEY_IN_PROGRESS] = False
    chore[CHORE_KEY_REJECTED_BY] = rejecter
    chore[CHORE_KEY_REJECTED_AT] = _now_iso()
    reason = (reason or "").strip()
    chore[CHORE_KEY_REJECT_REASON] = reason or None
    chore[CHORE_KEY_UPDATED_AT] = chore[CHORE_KEY_REJECTED_AT]
    _fire_chore_event(hass, chore, previous_status=previous, actor=rejecter, extra={"event": "rejected", "reason": chore[CHORE_KEY_REJECT_REASON]})
    return chore


def reset_recurring_chore(chores: dict[str, dict[str, Any]], hass: HomeAssistant, chore_id: str) -> Optional[dict[str, Any]]:
    """Called when a chore's own auto_create_trigger fires again (see the sensor-trigger listener in __init__.py)"""
    chore = _get_chore(chores, chore_id)
    if chore["status"] != CHORE_STATUS_APPROVED:
        _LOGGER.debug(
            "Family Hub: auto_create_trigger fired for chore %s but it isn't approved yet (status=%s) - ignoring",
            chore_id, chore["status"],
        )
        return None

    previous = chore["status"]
    chore["status"] = CHORE_STATUS_OPEN
    chore[CHORE_KEY_COMPLETED_BY] = None
    chore[CHORE_KEY_COMPLETED_AT] = None
    chore[CHORE_KEY_APPROVED_BY] = None
    chore[CHORE_KEY_APPROVED_AT] = None
    chore[CHORE_KEY_OVERDUE_PENALTY_APPLIED] = False
    # A fresh occurrence hasn't been started by anyone yet.
    chore[CHORE_KEY_IN_PROGRESS] = False
    # A quantity-based chore's next occurrence starts with the full count again ("3 loads of laundry" every week
    if chore.get(CHORE_KEY_QUANTITY_TOTAL):
        chore[CHORE_KEY_QUANTITY_REMAINING] = chore[CHORE_KEY_QUANTITY_TOTAL]
    # A fresh occurrence deserves a fresh shot at its own reminder_minutes
    chore[CHORE_KEY_REMINDERS_FIRED] = []
    # No longer "waiting" once it's active again - recur_next_due only ever describes an approved chore sitting idle
    chore[CHORE_KEY_RECUR_NEXT_DUE] = None
    # Every occurrence of a recurring chore (schedule-based via sweep_due_ recurrences, or sensor-triggered via its own auto_create_trigger
    now = dt_util.utcnow()
    offset_minutes = int(chore.get(CHORE_KEY_RECUR_DUE_OFFSET_MINUTES) or 0)
    chore["due_date"] = (now + timedelta(minutes=offset_minutes)).isoformat()
    chore[CHORE_KEY_UPDATED_AT] = _now_iso()
    _resolve_initial_assignment(chore)
    _fire_chore_event(hass, chore, previous_status=previous, extra={"event": "recurred"})
    return chore


def sweep_due_recurrences(
    chores: dict[str, dict[str, Any]], hass: HomeAssistant, now: Optional[datetime] = None
) -> list[dict[str, Any]]:
    """Poll-tick sweep (see __init__.py's _poll, alongside sweep_overdue_chores)"""
    now = now or dt_util.utcnow()
    recurred: list[dict[str, Any]] = []
    for chore_id in list(chores.keys()):
        chore = chores.get(chore_id)
        if chore is None or chore["status"] != CHORE_STATUS_APPROVED:
            continue
        due = _parse_dt(chore.get(CHORE_KEY_RECUR_NEXT_DUE))
        if due is None or due > now:
            continue
        result = reset_recurring_chore(chores, hass, chore_id)
        if result is not None:
            recurred.append(result)
    return recurred


def sweep_overdue_chores(
    chores: dict[str, dict[str, Any]], rewards: dict[str, Any], hass: HomeAssistant, now: Optional[datetime] = None
) -> list[dict[str, Any]]:
    """Poll-tick sweep (see __init__.py's _poll): applies each open, past- due chore's overdue_penalty exactly once (tracked by CHORE_KEY_OVERDUE_PENALTY_APPLIED"""
    now = now or dt_util.utcnow()
    penalized: list[dict[str, Any]] = []
    for chore in chores.values():
        if chore["status"] != CHORE_STATUS_OPEN:
            continue
        if chore.get(CHORE_KEY_OVERDUE_PENALTY_APPLIED):
            continue
        due = _parse_dt(chore.get("due_date"))
        if due is None or due >= now:
            continue
        penalty = int(chore.get("overdue_penalty") or 0)
        chore[CHORE_KEY_OVERDUE_PENALTY_APPLIED] = True
        chore[CHORE_KEY_UPDATED_AT] = _now_iso()
        assignee = chore.get("assigned_to")
        if penalty and assignee and assignee != CHORE_BIN_SENTINEL:
            add_stars(rewards, assignee, -penalty, reason=f"Overdue: {chore.get('title')}", source="chore_overdue")
        _fire_chore_event(hass, chore, previous_status=chore["status"], extra={"event": "overdue", "penalty": penalty})
        penalized.append(chore)
    return penalized


async def send_nudge(
    hass: HomeAssistant,
    chore: dict[str, Any],
    *,
    actor: Optional[str],
    notify_targets: list[str],
    split_notify_target,
) -> int:
    """One-click "Nudge" - a lightweight notification poke about a single
    active chore, independent of the Daily Digest/reminders system (no
    Store bookkeeping, nothing to dedupe - a household can nudge the same
    chore as many times as patience requires). `split_notify_target` is
    passed in rather than imported, to reuse __init__.py's existing
    "notify.xxx" -> (domain, service) parser without a circular import
    between this module and __init__.py.

    Always fires CHORE_EVENT_TYPE (so a native automation can react to a
    nudge even with zero notify targets configured), then best-effort sends
    to every resolved notify target. Returns how many sends succeeded.
    """
    _fire_chore_event(hass, chore, previous_status=chore.get("status"), actor=actor, extra={"event": "nudged"})
    sent = 0
    for target in notify_targets:
        split = split_notify_target(target)
        if split is None:
            continue
        domain, service = split
        try:
            await hass.services.async_call(
                domain,
                service,
                {
                    "title": "Family Hub chore nudge",
                    "message": f"Don't forget: {chore.get('title')}",
                },
                blocking=True,
            )
            sent += 1
        except Exception as err:  # noqa: BLE001
            _LOGGER.warning("Family Hub: failed to send chore nudge via %s: %s", target, err)
    return sent


_EDITABLE_FIELDS = (
    "title",
    "star_value",
    "due_date",
    "overdue_penalty",
    CHORE_KEY_REMINDER_MINUTES,
    "notes",
    "dependencies",
    "rotation_group",
    "auto_create_trigger",
    "auto_complete_trigger",
    "recur_type",
    "recur_interval_days",
    CHORE_KEY_RECUR_INTERVAL_UNIT,
    "recur_weekdays",
    CHORE_KEY_RECUR_MONTH_NTH,
    CHORE_KEY_RECUR_DUE_OFFSET_MINUTES,
    CHORE_KEY_NO_APPROVAL_REQUIRED,
    CHORE_KEY_QUANTITY_TOTAL,
    CHORE_KEY_TIMER_MINUTES,
    CHORE_KEY_ALARM_AUDIENCE,
    CHORE_KEY_IMPORTANT,
)


def update_chore(
    chores: dict[str, dict[str, Any]],
    chore_id: str,
    fields: dict[str, Any],
    is_user_enabled: Optional[IsUserEnabled] = None,
) -> dict[str, Any]:
    """Edit an open chore's details (never while pending_verification/ approved - re-open it via reset_recurring_chore or create a fresh one instead"""
    chore = _get_chore(chores, chore_id)
    if chore["status"] != CHORE_STATUS_OPEN:
        raise ChoreError("not_open", "Only an open (not-yet-completed) chore can be edited.")
    if "title" in fields:
        title = str(fields["title"] or "").strip()
        if not title:
            raise ChoreError("invalid_title", "A chore needs a title.")
        chore["title"] = title
    if CHORE_KEY_TIMER_MINUTES in fields:
        # Normalized (and so clearable back to None) exactly like it is on create - editing a chore's timer to blank must genuinely remove it
        chore[CHORE_KEY_TIMER_MINUTES] = timer_engine.normalize_timer_minutes(fields[CHORE_KEY_TIMER_MINUTES])
    if CHORE_KEY_ALARM_AUDIENCE in fields:
        chore[CHORE_KEY_ALARM_AUDIENCE] = timer_engine.normalize_alarm_audience(fields[CHORE_KEY_ALARM_AUDIENCE])
    if "star_value" in fields:
        chore["star_value"] = max(0, int(fields["star_value"] or 0))
    if "overdue_penalty" in fields:
        chore["overdue_penalty"] = max(0, int(fields["overdue_penalty"] or 0))
        chore[CHORE_KEY_OVERDUE_PENALTY_APPLIED] = False
    if "due_date" in fields:
        chore["due_date"] = fields["due_date"] or None
        # A new deadline is effectively a new reminder schedule - clear any already-fired lead times so the
        chore[CHORE_KEY_REMINDERS_FIRED] = []
    if CHORE_KEY_REMINDER_MINUTES in fields:
        chore[CHORE_KEY_REMINDER_MINUTES] = _normalize_reminder_minutes(fields[CHORE_KEY_REMINDER_MINUTES])
        chore[CHORE_KEY_REMINDERS_FIRED] = []
    if "notes" in fields:
        chore["notes"] = str(fields["notes"] or "").strip()
    if CHORE_KEY_QUANTITY_TOTAL in fields:
        new_total = _normalize_quantity_total(fields[CHORE_KEY_QUANTITY_TOTAL])
        chore[CHORE_KEY_QUANTITY_TOTAL] = new_total
        # Editing the count resets progress on the current (still-open, per the guard above) cycle - same "definition changed
        chore[CHORE_KEY_QUANTITY_REMAINING] = new_total
    if "dependencies" in fields:
        dependencies = [str(d) for d in (fields["dependencies"] or []) if d and d != chore_id]
        unknown = [d for d in dependencies if d not in chores]
        if unknown:
            raise ChoreError("unknown_dependency", f"Depends on chore(s) that don't exist: {', '.join(unknown)}")
        chore["dependencies"] = dependencies
    if "rotation_group" in fields:
        new_group = [str(u) for u in (fields["rotation_group"] or []) if u]
        if chore.get("assignment_mode") == CHORE_ASSIGNMENT_MODE_AUTO_ROTATION:
            for member in new_group:
                _check_user_enabled(is_user_enabled, member)
        chore["rotation_group"] = new_group
    if "auto_create_trigger" in fields:
        chore["auto_create_trigger"] = fields["auto_create_trigger"] or None
    if "auto_complete_trigger" in fields:
        chore["auto_complete_trigger"] = fields["auto_complete_trigger"] or None
    if "recur_type" in fields:
        chore["recur_type"] = _normalize_recur_type(fields["recur_type"])
    if "recur_interval_days" in fields:
        chore["recur_interval_days"] = max(0, int(fields["recur_interval_days"] or 0))
    if CHORE_KEY_RECUR_INTERVAL_UNIT in fields:
        chore[CHORE_KEY_RECUR_INTERVAL_UNIT] = _normalize_recur_interval_unit(fields[CHORE_KEY_RECUR_INTERVAL_UNIT])
    if "recur_weekdays" in fields:
        chore["recur_weekdays"] = _normalize_recur_weekdays(fields["recur_weekdays"])
    if CHORE_KEY_RECUR_MONTH_NTH in fields:
        chore[CHORE_KEY_RECUR_MONTH_NTH] = _normalize_recur_month_nth(fields[CHORE_KEY_RECUR_MONTH_NTH])
    if CHORE_KEY_RECUR_DUE_OFFSET_MINUTES in fields:
        chore[CHORE_KEY_RECUR_DUE_OFFSET_MINUTES] = _normalize_recur_due_offset_minutes(fields[CHORE_KEY_RECUR_DUE_OFFSET_MINUTES])
    if CHORE_KEY_NO_APPROVAL_REQUIRED in fields:
        chore[CHORE_KEY_NO_APPROVAL_REQUIRED] = bool(fields[CHORE_KEY_NO_APPROVAL_REQUIRED])
    if CHORE_KEY_IMPORTANT in fields:
        chore[CHORE_KEY_IMPORTANT] = bool(fields[CHORE_KEY_IMPORTANT])
    chore[CHORE_KEY_UPDATED_AT] = _now_iso()
    return chore


def delete_chore(chores: dict[str, dict[str, Any]], chore_id: str) -> None:
    if chore_id not in chores:
        raise ChoreError("not_found", f"No chore with id {chore_id!r}")
    still_depended_on = [c["id"] for c in chores.values() if chore_id in (c.get("dependencies") or [])]
    if still_depended_on:
        raise ChoreError(
            "has_dependents",
            f"{len(still_depended_on)} other chore(s) still depend on this one - remove that link first.",
        )
    del chores[chore_id]
