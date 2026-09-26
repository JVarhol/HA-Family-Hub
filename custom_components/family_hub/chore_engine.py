"""Core chore business logic - assignment, the completion/verification
state machine, dependencies, overdue penalties, streaks, and the sensor-
driven recurring-chore lifecycle.

State machine (also see CHORE_STATUS_* in const.py):

    open --(complete_chore)--> pending_verification --(approve_chore)--> approved
     ^                                                                       |
     `---------------- reset_recurring_chore (auto_create_trigger fires) ---'

"open" covers both "unclaimed in the Chore Bin" (assigned_to ==
CHORE_BIN_SENTINEL) and "assigned to someone, not yet done" - assigned_to is
what distinguishes those, not status. A chore with no auto_create_trigger is
a one-off: once approved, it just stays approved forever (nothing resets
it) - recreate a similar chore by hand for "next time." A chore WITH an
auto_create_trigger is a reusable template: the same record cycles back to
open (a new occurrence) each time its trigger fires again while it's
sitting approved from the previous cycle - see reset_recurring_chore and
__init__.py's sensor-trigger listener that calls it.

Every function here assumes the CALLER (chores_websocket_api.py, services, the
sensor-trigger listener) has already resolved permissions - nothing in this
module checks hass.user.is_admin or the Permissions store itself, keeping
the state machine logic independent of who's allowed to invoke it.

Every mutating function fires CHORE_EVENT_TYPE via hass.bus.async_fire and
returns the updated chore record; none of them save the Store themselves -
callers own exactly one async_save per websocket/service call so a batch of
engine calls (e.g. the overdue sweep touching many chores) writes once.
"""
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
    """Raised for any invalid chore operation (bad state, missing
    dependency, unknown chore id, etc.) - always carries a short machine-
    readable `code` alongside the human-readable message, so
    chores_websocket_api.py can send_error(msg["id"], err.code, str(err)) without
    a big if/elif ladder guessing at the reason from the text."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


# Passed in (never imported) by every caller that wants assignment
# eligibility enforced - a user_id -> bool check. Chores callers are always
# handed chores_websocket_api.py's _make_is_chores_eligible (Family Hub
# membership AND not explicitly excluded via userProfiles[uid].
# includeInChores - see const.py's SETTINGS_KEY_MEMBER_USER_IDS docstring
# and its "v121+" follow-up right after it); Routines' own create_item uses
# a plain membership-only check instead (see routine_engine.py), since that
# narrower exclusion deliberately doesn't apply there. Same dependency-
# injection shape as send_nudge's split_notify_target parameter below:
# chore_engine.py stays self-contained (no import of __init__.py or the
# Settings store), and a caller that doesn't care - a test, or code that
# genuinely wants to bypass the check - just omits it, in which case every
# function below skips the check entirely (None means "not enforced here").
# Named IsUserEnabled/is_user_enabled rather than something more specific
# because this same plumbing predates memberUserIds (it used to gate the
# now-retired per-user choresEnabled toggle) and every call site below
# still reads naturally either way.
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
    """v184+: one of these is generated per multi-assignee create request
    (chores_websocket_api.ws_create_chore's fan-out) and stamped onto every
    chore created from it, via CHORE_KEY_GROUP_ID - see that constant's own
    docstring in const.py for why fan-out (N independent single-assignee
    chores) rather than one multi-assignee record."""
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
    """v187+: household ask, verbatim - "chore scheduling needs some more
    work potentially want to do every 2 months or every 3 months, every
    4th week or 7th week, every other day etc." Anything not one of the
    three real units (days/weeks/months) - including None, the value every
    chore saved before this field existed actually has - collapses to
    "days," the exact meaning "interval" always had before this feature,
    so nothing stored previously changes behavior."""
    if value in CHORE_RECUR_INTERVAL_UNITS:
        return value
    return CHORE_RECUR_INTERVAL_UNIT_DAYS


def _add_months(dt: datetime, months: int) -> datetime:
    """Adds `months` calendar months to `dt`, clamping the day-of-month to
    the target month's own last day when the original day doesn't exist
    there (e.g. Jan 31 + 1 month lands on Feb 28, or Feb 29 in a leap
    year) - the same "always resolvable, never skip/crash" philosophy
    _nth_weekday_of_month's own docstring describes for its 1-4/-1 values.
    Preserves hour/minute/second/tzinfo exactly, only year/month/day move."""
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
    """0=Monday..6=Sunday, matching Python's own date.weekday()/datetime.
    weekday() exactly - so these same integers plug directly into
    _compute_next_recur_due's date-math with no day-of-week convention
    translation needed anywhere, frontend included (the card sends/receives
    the identical 0-6 numbers)."""
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
    """v185+: which occurrence of the selected weekday(s) within a month -
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
    """Every date in (year, month) whose weekday() is in `weekdays`, sorted,
    then the nth one (1-indexed) or the last one (nth == -1). Returns None
    only if `weekdays` is empty - nth 1-4 always exists because every
    weekday occurs at least 4 times in any month (see CHORE_RECUR_MONTH_NTH_
    VALUES's own comment), so this never has to "skip" a month the way a
    literal 5th-occurrence request would.
    v185+: this is also how "the first weekend of the month" is expressed -
    weekdays={5, 6} (Sat+Sun), nth=1 - a plain date-by-date scan naturally
    lands on the month's first Saturday (or, in the rare case the month
    itself starts on a Sunday, that Sunday) without needing a dedicated
    "weekend" concept of its own."""
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
    """A chore's own reminder_minutes (v131+) - deliberately as permissive
    as the calendar card's own event-reminder marker parsing (_parse_
    reminder_minutes in __init__.py): any positive integer is accepted, not
    just the fixed 5/10/15/30/60/120/1440 set the Create/Edit Chore modal's
    own checkboxes happen to offer - same "the UI offers a fixed menu, the
    backend doesn't gatekeep against it" relationship the calendar's own
    reminder marker already has. Deduped and sorted, same as that function."""
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
    """Computes when a just-approved recurring chore should pop back open -
    called exactly once, at the moment it's approved (see approve_chore),
    never recomputed while it just sits waiting, so its "next occurrence"
    can't silently drift from a late poll tick or a clock change. Always
    strictly after from_dt (at least a day out), so a chore can never loop
    back to the very day it was just finished. Returns None for a chore
    with no recur_type (recurs only via its own auto_create_trigger, if
    any - see chore_engine's module docstring) or a weekdays chore with an
    empty weekday selection (nothing to compute against)."""
    recur_type = chore.get("recur_type")
    if recur_type == CHORE_RECUR_TYPE_INTERVAL:
        # v187+: household ask, verbatim - "chore scheduling needs some
        # more work potentially want to do every 2 months or every 3
        # months, every 4th week or 7th week, every other day etc." N
        # (recur_interval_days, kept as the field name for backward
        # compatibility) now pairs with a unit (recur_interval_unit) -
        # days is the pre-existing/default behavior ("every other day" was
        # already just N=2), weeks/months are new. Months uses _add_months
        # rather than a flat 30-day multiply so "every 2 months" actually
        # lands on the same day-of-month each time (clamped at short
        # months), the way a household actually means it.
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
        # v185+: household ask, verbatim - "Better chore scheduling so you
        # can choose things like every third Wednesday or the first weekend
        # of every month. Very similar to how Google calendar does it now."
        # Reuses recur_weekdays (one or more weekdays - see _nth_weekday_
        # of_month's own comment on how "first weekend" falls out of that)
        # plus recur_month_nth (which occurrence). Scans forward month by
        # month from from_dt's own month - capped at 24 so a malformed/
        # cleared selection can't loop forever - taking the first candidate
        # that's still strictly after from_dt (this month's occurrence, if
        # it hasn't happened yet, otherwise next month's, exactly like the
        # weekdays branch above never returns something on/before from_dt).
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
    """v186+: household ask, verbatim - "Chores due x amount time before
    due on recurring chores. This will set the due date based on when the
    chore is recurred instead of when the chore was created." How long
    AFTER each recurrence reset_recurring_chore should set the fresh
    due_date to. Same "opt-in numeric field, anything blank/invalid
    collapses to the harmless default" style as star_value/overdue_penalty
    - here the harmless default is 0 ("due the moment it reopens"), never
    negative (a due date before the chore even exists again is
    meaningless)."""
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
        CHORE_KEY_GROUP_ID: None,
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
    # CHORE_ASSIGNMENT_MODE_DIRECT: leave assigned_to exactly as given -
    # a direct chore with no assigned_to is a data error the caller (the
    # create-chore form) should have prevented, but engine code never
    # crashes over it; it just sits assigned to nobody until fixed.


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

    # v123+: a free-text description, shown in the click-to-open chore
    # detail modal (family-hub-chores-card.js's _openChoreDetailModal) -
    # purely informational, never validated/interpreted by the engine
    # itself (unlike e.g. dependencies), so just trimmed like title.
    notes = str(payload.get("notes") or "").strip()

    rotation_group = [str(u) for u in (payload.get("rotation_group") or []) if u]
    if mode == CHORE_ASSIGNMENT_MODE_DIRECT:
        _check_user_enabled(is_user_enabled, payload.get("assigned_to"))
    elif mode == CHORE_ASSIGNMENT_MODE_AUTO_ROTATION:
        for member in rotation_group:
            _check_user_enabled(is_user_enabled, member)

    recur_type = _normalize_recur_type(payload.get("recur_type"))
    quantity_total = _normalize_quantity_total(payload.get(CHORE_KEY_QUANTITY_TOTAL))
    # v1.110.0+: optional countdown length. None (the default, and every
    # pre-v1.110.0 chore) means "no timer" and changes nothing - see
    # timer_engine.normalize_timer_minutes.
    timer_minutes = timer_engine.normalize_timer_minutes(payload.get(CHORE_KEY_TIMER_MINUTES))
    # v1.132.55+: who/what rings when this chore's timer alarms - see
    # const.py's CHORE_KEY_ALARM_AUDIENCE for the full picture. Defaults to
    # "self" (timer_engine.normalize_alarm_audience's own fallback), which
    # is exactly today's pre-existing behaviour, so a chore that never sets
    # this is completely unaffected.
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
            # A fresh chore's remaining count always starts equal to its
            # total - there's no partial progress to speak of yet. None
            # (quantity_total unset) means an ordinary chore, so remaining
            # stays None too - see chore_skips_verification's sibling check
            # in complete_chore, which only branches on quantity at all
            # when quantity_total is actually set.
            CHORE_KEY_QUANTITY_REMAINING: quantity_total,
            CHORE_KEY_TIMER_MINUTES: timer_minutes,
            CHORE_KEY_ALARM_AUDIENCE: alarm_audience,
            CHORE_KEY_IMPORTANT: bool(payload.get(CHORE_KEY_IMPORTANT)),
            # v184+: set by chores_websocket_api's multi-assignee fan-out
            # (ws_create_chore, when the request names more than one
            # assignee) - the SAME group_id is passed in this same payload
            # dict for every one of the N create_chore calls that request
            # makes, one per assignee. An ordinary single-assignee create
            # never sets this, so it stays None (see default_chore).
            CHORE_KEY_GROUP_ID: payload.get(CHORE_KEY_GROUP_ID) or None,
        },
    )
    if mode == CHORE_ASSIGNMENT_MODE_DIRECT and not chore.get("assigned_to"):
        raise ChoreError("missing_assignee", "A direct chore needs someone assigned to it.")
    _resolve_initial_assignment(chore)

    chores[chore["id"]] = chore
    _fire_chore_event(hass, chore, previous_status=None)
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
    """Move a chore between the Chore Bin and a specific person (or back to
    the bin, if target is CHORE_BIN_SENTINEL) - the drag-and-drop action on
    family-hub-chores-card. Does not change status; a chore can be
    reassigned freely while still "open" (unclaimed or claimed but not yet
    done), but never once it's pending_verification/approved - re-open it
    first (there is no "un-approve," by design, matching the verification
    gate: approval already disbursed stars)."""
    chore = _get_chore(chores, chore_id)
    if chore["status"] != CHORE_STATUS_OPEN:
        raise ChoreError("not_open", "Only an open (not-yet-completed) chore can be reassigned.")
    _check_user_enabled(is_user_enabled, target)
    chore["assigned_to"] = target
    chore[CHORE_KEY_UPDATED_AT] = _now_iso()
    _fire_chore_event(hass, chore, previous_status=CHORE_STATUS_OPEN, actor=actor, extra={"event": "assigned"})
    return chore


def claim_chore(
    chores: dict[str, dict[str, Any]],
    hass: HomeAssistant,
    chore_id: str,
    user_id: str,
    is_user_enabled: Optional[IsUserEnabled] = None,
) -> dict[str, Any]:
    """Self-serve claim from the Chore Bin - the action anyone (not just an
    admin) can take on a first_come_first_served chore, or on a chore_bin
    chore nobody has drag-and-dropped out yet (a household is free to let
    kids grab those too; assign_chore is for a *specific* admin-directed
    assignment, this is "first tap wins"). Race-safe: the check and the
    mutation happen with no `await` between them, so two claims arriving
    back-to-back on Home Assistant's single-threaded event loop can never
    both win - whichever websocket message this function runs for first
    simply sees assigned_to still CHORE_BIN_SENTINEL and the second one
    doesn't.
    """
    chore = _get_chore(chores, chore_id)
    if chore["assigned_to"] != CHORE_BIN_SENTINEL:
        raise ChoreError("already_claimed", "Someone already claimed this chore.")
    _check_user_enabled(is_user_enabled, user_id)
    chore["assigned_to"] = user_id
    chore[CHORE_KEY_UPDATED_AT] = _now_iso()
    _fire_chore_event(hass, chore, previous_status=CHORE_STATUS_OPEN, actor=user_id, extra={"event": "claimed"})
    return chore


def chore_skips_verification(chore: dict[str, Any], permissions: Optional[dict[str, dict[str, Any]]] = None) -> bool:
    """True when a completion of THIS chore should go straight from open to
    approved with no pending_verification stop at all. Either of two
    independent exemptions is enough:

    - the chore itself has CHORE_KEY_NO_APPROVAL_REQUIRED set (the Add/Edit
      Chore modal's "Doesn't require approval" checkbox) - applies no
      matter who completes it, or
    - its current assignee has been granted PERMISSION_AUTO_APPROVE in the
      Permissions store (the "doesn't require approval" toggle on a
      person's own entry in the Users tab) - applies no matter which chore
      it is.

    This is a plain data lookup, not an authorization check - it doesn't
    decide who's ALLOWED to complete the chore (that's still ws_complete_chore's
    job), only whether the completion that's already been allowed also
    clears verification. That keeps it consistent with this module's
    docstring promise that the state machine doesn't reach into the
    Permissions store itself: callers hand it that store's contents
    (or leave it out, e.g. todo.py/services that don't have it handy - the
    chore-level exemption still applies) rather than this module fetching it."""
    if chore.get(CHORE_KEY_NO_APPROVAL_REQUIRED):
        return True
    if not permissions:
        return False
    assignee = chore.get("assigned_to")
    if not assignee or assignee == CHORE_BIN_SENTINEL:
        return False
    return bool((permissions.get(assignee) or {}).get(PERMISSION_AUTO_APPROVE))


def _apply_approval(chore: dict[str, Any], rewards: dict[str, Any], approver: Optional[str]) -> int:
    """The state-changing core shared by approve_chore (the normal, human-
    in-the-loop path) and complete_chore's auto-approve shortcut
    (chore_skips_verification) - both need the exact same streak/status/
    recurrence/star bookkeeping, differing only in what got them here and
    what event they fire afterward, which stays the caller's job. Returns
    the star_value actually disbursed (0 if none) purely so the caller can
    put an accurate stars_disbursed on its own event without recomputing it."""
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
    """Mark a chore done, entering pending_verification - the first half of
    the verification gate (Completed -> Pending Verification). Blocked by
    any not-yet-approved dependency.

    Takes `rewards` and an optional `permissions` now (previously just
    took `chores`/`hass`) so it can go straight on to _apply_approval
    itself when chore_skips_verification says this one's exempt from the
    gate entirely - see that function's docstring. Every existing caller
    that doesn't care about the exemption (or doesn't have a permissions
    dict handy) can still just pass permissions=None; the chore-level
    CHORE_KEY_NO_APPROVAL_REQUIRED exemption still applies either way."""
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
            # Still units left in this batch ("3 loads of laundry" -> 2 ->
            # 1) - one unit just got done, but the chore stays "open" and
            # nothing else (verification gate, streak, stars) happens until
            # the count actually reaches zero. complete_chore gets called
            # once per unit; only the LAST call falls through to the
            # ordinary completion flow below.
            chore[CHORE_KEY_QUANTITY_REMAINING] = remaining
            chore[CHORE_KEY_UPDATED_AT] = _now_iso()
            _fire_chore_event(
                hass, chore, previous_status=previous, actor=actor,
                extra={"event": "quantity_decremented", "quantity_remaining": remaining},
            )
            return chore
        # Last unit - record the count hitting zero, then fall through to
        # the normal completion flow right below exactly as if this were
        # an ordinary (non-quantity) chore.
        chore[CHORE_KEY_QUANTITY_REMAINING] = 0

    chore["status"] = CHORE_STATUS_PENDING_VERIFICATION
    chore[CHORE_KEY_COMPLETED_BY] = actor or chore.get("assigned_to")
    chore[CHORE_KEY_COMPLETED_AT] = _now_iso()
    chore[CHORE_KEY_UPDATED_AT] = chore[CHORE_KEY_COMPLETED_AT]

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
    """The second half of the verification gate: Pending Verification ->
    Approved -> Stars Disbursed. On-time (completed_at <= due_date, or no
    due_date set at all) extends the streak by one; overdue resets it to
    zero rather than leaving a stale streak from before the miss. Disburses
    star_value to the assignee's balance via reward_engine.add_stars.
    Advances rotation_pointer for an auto_rotation chore so the *next*
    occurrence (see reset_recurring_chore) goes to the next person in line,
    regardless of who actually ended up completing this one."""
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
    """The other way out of the verification gate: Pending Verification ->
    back to Open, for the SAME assignee to redo (unlike reset_recurring_chore,
    this never re-resolves assignment - it's not a fresh occurrence, it's
    the same one bounced back). No stars disbursed, no streak/rotation
    change - approve_chore is the only place either of those ever happens,
    and this function never reaches it. Clears completed_by/completed_at so
    the chore looks freshly open again and complete_chore's own "must be
    open" guard is satisfied on the redo; records rejected_by/rejected_at
    plus an optional free-text reason (see const.py's CHORE_KEY_REJECT_REASON
    docstring for why these persist through the redo-and-resubmit cycle
    instead of being cleared here)."""
    chore = _get_chore(chores, chore_id)
    if chore["status"] != CHORE_STATUS_PENDING_VERIFICATION:
        raise ChoreError("not_pending", "This chore isn't waiting on approval.")

    previous = chore["status"]
    chore["status"] = CHORE_STATUS_OPEN
    chore[CHORE_KEY_COMPLETED_BY] = None
    chore[CHORE_KEY_COMPLETED_AT] = None
    chore[CHORE_KEY_REJECTED_BY] = rejecter
    chore[CHORE_KEY_REJECTED_AT] = _now_iso()
    reason = (reason or "").strip()
    chore[CHORE_KEY_REJECT_REASON] = reason or None
    chore[CHORE_KEY_UPDATED_AT] = chore[CHORE_KEY_REJECTED_AT]
    _fire_chore_event(hass, chore, previous_status=previous, actor=rejecter, extra={"event": "rejected", "reason": chore[CHORE_KEY_REJECT_REASON]})
    return chore


def reset_recurring_chore(chores: dict[str, dict[str, Any]], hass: HomeAssistant, chore_id: str) -> Optional[dict[str, Any]]:
    """Called when a chore's own auto_create_trigger fires again (see the
    sensor-trigger listener in __init__.py) - the mechanism behind e.g.
    "Dryer finished creates chore." A chore with an auto_create_trigger IS
    its own reusable template: this doesn't spawn a new record, it cycles
    the SAME one back to a fresh "open" occurrence, re-resolving assignment
    (advancing an auto_rotation chore to whoever rotation_pointer now
    points at, re-dropping a chore_bin/first_come_first_served chore back
    into the bin) so the same completion/verification gate runs again next
    time. Only fires the reset when the chore is currently "approved"
    (last cycle actually finished) - a trigger firing again while a chore
    is still open or pending_verification is a no-op, so an in-progress
    cycle is never silently clobbered. Returns None (and does nothing) for
    that no-op case; returns the updated record when it did reset.
    """
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
    # A quantity-based chore's next occurrence starts with the full count
    # again ("3 loads of laundry" every week, not "0 loads" forever after
    # the first cycle used them all up) - ordinary chores have
    # quantity_total=None so this is a no-op for them.
    if chore.get(CHORE_KEY_QUANTITY_TOTAL):
        chore[CHORE_KEY_QUANTITY_REMAINING] = chore[CHORE_KEY_QUANTITY_TOTAL]
    # A fresh occurrence deserves a fresh shot at its own reminder_minutes,
    # same reasoning update_chore already applies when due_date/reminder_
    # minutes themselves change - see CHORE_KEY_REMINDERS_FIRED's own
    # docstring in const.py.
    chore[CHORE_KEY_REMINDERS_FIRED] = []
    # No longer "waiting" once it's active again - recur_next_due only ever
    # describes an approved chore sitting idle (see CHORE_KEY_RECUR_NEXT_DUE
    # in const.py); it gets recomputed fresh the next time this same chore
    # is approved again (see approve_chore).
    chore[CHORE_KEY_RECUR_NEXT_DUE] = None
    # v186+: household ask, verbatim - "Chores due x amount time before due
    # on recurring chores. This will set the due date based on when the
    # chore is recurred instead of when the chore was created." Every
    # occurrence of a recurring chore (schedule-based via sweep_due_
    # recurrences, or sensor-triggered via its own auto_create_trigger -
    # this function is the single reset point for both) gets a fresh
    # due_date anchored to right now, offset by CHORE_KEY_RECUR_DUE_OFFSET_
    # MINUTES (0 = due the moment it reopens). Replaces whatever due_date
    # was left over from the previous cycle (or from creation, the very
    # first time this chore ever recurs) - a stale due_date that never
    # moved was exactly the reported problem.
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
    """Poll-tick sweep (see __init__.py's _poll, alongside
    sweep_overdue_chores) - the other half of plain-schedule recurrence:
    finds every approved chore whose recur_next_due has arrived and resets
    it back to open via reset_recurring_chore, exactly as if its
    auto_create_trigger sensor had just fired. A chore with no recur_type
    (recur_next_due never got set - see approve_chore) is simply never
    matched here; it only ever recurs via its own sensor trigger, if any.
    Returns the list of chores that were actually reset this sweep, so the
    caller can save/log once for the whole batch."""
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
    """Poll-tick sweep (see __init__.py's _poll): applies each open, past-
    due chore's overdue_penalty exactly once (tracked by
    CHORE_KEY_OVERDUE_PENALTY_APPLIED, the same "never re-fire" pattern the
    reminders poller already uses for its own notified dict) rather than on
    every tick the chore remains overdue. Does not change `status` - being
    overdue is a computed condition against due_date, not a pipeline stage
    - so a penalized chore can still be completed normally afterward.
    Returns the list of chores that were actually penalized this sweep, so
    the caller can log/save once for the whole batch."""
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
    """Edit an open chore's details (never while pending_verification/
    approved - re-open it via reset_recurring_chore or create a fresh one
    instead, same reasoning as assign_chore). Only touches keys the caller
    actually passed in `fields`; only fields in _EDITABLE_FIELDS are
    honored, so e.g. `status`/`streak_count` can never be smuggled in
    through this path - id/assignment_mode/created_at are permanently
    fixed once a chore exists."""
    chore = _get_chore(chores, chore_id)
    if chore["status"] != CHORE_STATUS_OPEN:
        raise ChoreError("not_open", "Only an open (not-yet-completed) chore can be edited.")
    if "title" in fields:
        title = str(fields["title"] or "").strip()
        if not title:
            raise ChoreError("invalid_title", "A chore needs a title.")
        chore["title"] = title
    if CHORE_KEY_TIMER_MINUTES in fields:
        # Normalized (and so clearable back to None) exactly like it is on
        # create - editing a chore's timer to blank must genuinely remove
        # it, not leave a stale length behind.
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
        # A new deadline is effectively a new reminder schedule - clear any
        # already-fired lead times so the (possibly identical) reminder_
        # minutes list gets a fresh chance against the new due_date, same
        # "settings changed, un-apply the old bookkeeping" reasoning as
        # overdue_penalty's own reset right above.
        chore[CHORE_KEY_REMINDERS_FIRED] = []
    if CHORE_KEY_REMINDER_MINUTES in fields:
        chore[CHORE_KEY_REMINDER_MINUTES] = _normalize_reminder_minutes(fields[CHORE_KEY_REMINDER_MINUTES])
        chore[CHORE_KEY_REMINDERS_FIRED] = []
    if "notes" in fields:
        chore["notes"] = str(fields["notes"] or "").strip()
    if CHORE_KEY_QUANTITY_TOTAL in fields:
        new_total = _normalize_quantity_total(fields[CHORE_KEY_QUANTITY_TOTAL])
        chore[CHORE_KEY_QUANTITY_TOTAL] = new_total
        # Editing the count resets progress on the current (still-open,
        # per the guard above) cycle - same "definition changed, invalidate
        # old bookkeeping" reasoning as due_date/reminder_minutes just
        # above. There's no partial-progress number that would still make
        # sense against a different total anyway.
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
