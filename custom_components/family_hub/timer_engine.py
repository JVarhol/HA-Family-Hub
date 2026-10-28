"""Chore/reward countdown timers."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from .const import (
    TIMER_ALARM_AUDIENCE_SELF,
    TIMER_ALARM_AUDIENCES,
    TIMER_KIND_CHORE,
    TIMER_KIND_REWARD,
    TIMER_KIND_STANDALONE,
    TIMER_KINDS,
    TIMER_LABEL_MAX_LENGTH,
    TIMER_MAX_MINUTES,
    TIMER_MIN_MINUTES,
    TIMER_MIN_SECONDS,
)


class TimerError(Exception):
    """Mirrors ChoreError/RewardError - carries a machine-readable code
    alongside the human message so the websocket layer can hand the code
    straight to connection.send_error."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def new_timer_id() -> str:
    return f"tmr_{uuid.uuid4().hex[:12]}"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def normalize_timer_minutes(value: Any) -> Optional[float]:
    """A chore's/reward's/standalone timer's configured length in minutes,
    or None for "no timer."

    None, "", 0 and anything unparseable all mean "no timer" rather than
    raising - these arrive from a text input on two different cards, and an
    empty box is the overwhelmingly common case, not an error. A real but
    out-of-range number IS clamped rather than dropped, since someone who
    typed 5000 clearly wanted "a long time," not "no timer at all."

    `value` may now be fractional (e.g. 0.5 == 30 seconds) - the
    standalone quick-timer modal combines a minutes field and a seconds
    field into one fractional-minutes number before calling this. A
    fractional/sub-minute request is floored at TIMER_MIN_SECONDS (1
    second) instead of the usual TIMER_MIN_MINUTES (1 whole minute), which
    only matters for a "seconds only, no minutes" timer - chore/reward
    timer lengths are still whole minutes in practice, since neither of
    those settings fields offers a seconds input, so this never changes
    what they produce. A whole-number result is returned as a plain int
    (not e.g. 30.0) so every existing caller that expects an int for a
    normal whole-minute timer keeps getting exactly that.
    """
    if value is None or value == "":
        return None
    try:
        minutes = float(value)
    except (TypeError, ValueError):
        return None
    if minutes <= 0:
        return None
    floor = TIMER_MIN_MINUTES if minutes >= TIMER_MIN_MINUTES else (TIMER_MIN_SECONDS / 60)
    clamped = max(floor, min(TIMER_MAX_MINUTES, minutes))
    return int(clamped) if clamped == int(clamped) else round(clamped, 4)


def normalize_timer_label(value: Any) -> str:
    """A standalone timer's free-text label ("Oven", "Sam's turn"). Trimmed
    and length-capped; empty is fine and common, and the card falls back to
    a plain "Timer" when there is none - naming it is a convenience, not a
    requirement, since a lot of quick timers are started in a hurry."""
    return str(value or "").strip()[:TIMER_LABEL_MAX_LENGTH]


def normalize_alarm_audience(value: Any) -> str:
    """A chore's/reward's alarm_audience field (see const.py's
    CHORE_KEY_ALARM_AUDIENCE for the full "who/what rings" picture) -
    anything not one of the three known tiers (missing, None, a stale/typo'd
    string) falls back to TIMER_ALARM_AUDIENCE_SELF, the same "changes
    nothing for anyone who's never touched this field" default every other
    optional field in this project uses."""
    return value if value in TIMER_ALARM_AUDIENCES else TIMER_ALARM_AUDIENCE_SELF


def _timers(state: dict[str, Any]) -> list[dict[str, Any]]:
    timers = state.setdefault("timers", [])
    if not isinstance(timers, list):
        timers = []
        state["timers"] = timers
    return timers


def list_timers(state: dict[str, Any]) -> list[dict[str, Any]]:
    return [t for t in _timers(state) if isinstance(t, dict)]


def get_timer(state: dict[str, Any], uid: str) -> Optional[dict[str, Any]]:
    return next((t for t in list_timers(state) if t.get("uid") == uid), None)


def has_active_timer(state: dict[str, Any], user_id: str, kind: str) -> Optional[dict[str, Any]]:
    """The one running timer of `kind` for `user_id`, or None. See this
    module's docstring for why the cap is per-KIND rather than global."""
    return next(
        (t for t in list_timers(state) if t.get("user_id") == user_id and t.get("kind") == kind),
        None,
    )


def timer_for_entity(state: dict[str, Any], entity_id: str) -> Optional[dict[str, Any]]:
    """The running timer currently backed by this native `timer.*` entity,
    or None. This is the lookup HA's own timer.finished / timer.cancelled
    events resolve through - the event carries only an entity_id, and this
    turns it back into the Family Hub timer that has to be acted on."""
    if not entity_id:
        return None
    return next((t for t in list_timers(state) if t.get("entity_id") == entity_id), None)


def bound_entity_ids(state: dict[str, Any]) -> set:
    """Every native entity currently spoken for, so a new timer never
    adopts one that is already counting down for somebody else."""
    return {t.get("entity_id") for t in list_timers(state) if t.get("entity_id")}


def timer_for_chore(state: dict[str, Any], chore_id: str) -> Optional[dict[str, Any]]:
    """Whoever started it - a chore can only have one timer running on it
    at a time regardless of who that is, since it's one piece of work."""
    return next(
        (t for t in list_timers(state) if t.get("kind") == TIMER_KIND_CHORE and t.get("chore_id") == chore_id),
        None,
    )


def ends_at(timer: dict[str, Any]) -> Optional[datetime]:
    """When this timer runs out, or None if its stored started_at is
    unparseable (a hand-edited store file). A None here is treated as
    "expired now" by due_timers below - deliberately failing toward firing
    rather than leaving an un-killable timer stuck on someone's card
    forever."""
    started = timer.get("started_at")
    if not started:
        return None
    try:
        dt = datetime.fromisoformat(str(started))
    except (TypeError, ValueError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    minutes = timer.get("duration_minutes")
    # this used to truncate via int(minutes), which silently dropped a sub-minute timer's seconds (0.5 -> 0).
    try:
        minutes = float(minutes)
    except (TypeError, ValueError):
        minutes = 0
    return dt + timedelta(minutes=max(0, minutes))


def remaining_seconds(timer: dict[str, Any], now: Optional[datetime] = None) -> int:
    """Never negative - an overdue timer reads as 0 left, not -240."""
    end = ends_at(timer)
    if end is None:
        return 0
    delta = (end - (now or _utcnow())).total_seconds()
    return max(0, int(delta))


def due_timers(state: dict[str, Any], now: Optional[datetime] = None) -> list[dict[str, Any]]:
    """Every timer whose time is up, oldest-started first so a batch that
    expired together (e.g. Home Assistant was down over the end of two
    timers) fires in the order they were started."""
    moment = now or _utcnow()
    due = [t for t in list_timers(state) if remaining_seconds(t, moment) <= 0]
    return sorted(due, key=lambda t: str(t.get("started_at") or ""))


def start_timer(
    state: dict[str, Any],
    *,
    kind: str,
    user_id: str,
    duration_minutes: Any,
    title: str = "",
    chore_id: Optional[str] = None,
    item_id: Optional[str] = None,
    notify_targets: Optional[list[str]] = None,
    alarm: bool = False,
    alarm_audience: Any = TIMER_ALARM_AUDIENCE_SELF,
    client_id: Optional[str] = None,
    now: Optional[datetime] = None,
) -> dict[str, Any]:
    """Begin a countdown. Raises TimerError (never silently no-ops) for
    every refusal, so the websocket layer can tell the person exactly why
    nothing started."""
    if kind not in TIMER_KINDS:
        raise TimerError("invalid_kind", f"Unknown timer kind: {kind!r}")
    # a standalone timer may be UNASSIGNED - "optional assign to user"
    if not user_id and kind != TIMER_KIND_STANDALONE:
        raise TimerError("no_user", "A timer needs to belong to somebody.")
    minutes = normalize_timer_minutes(duration_minutes)
    if minutes is None:
        raise TimerError("invalid_duration", "That timer needs a length in minutes.")

    # An unassigned standalone timer has nobody to be "the one running timer" for, so the per-person cap simply doesn't apply
    existing = has_active_timer(state, user_id, kind) if user_id else None
    if existing is not None:
        left = max(1, round(remaining_seconds(existing, now) / 60))
        label = "chore" if kind == TIMER_KIND_CHORE else "reward" if kind == TIMER_KIND_REWARD else "timer"
        raise TimerError(
            "timer_already_running",
            f"You've already got a {label} timer running for \"{existing.get('title') or 'something'}\" "
            f"- about {left} minute{'s' if left != 1 else ''} left. Cancel it first if you want to start this one.",
        )
    if kind == TIMER_KIND_CHORE and chore_id and timer_for_chore(state, chore_id) is not None:
        raise TimerError("timer_already_running", "Someone's already got a timer running on that chore.")

    timer = {
        "uid": new_timer_id(),
        "kind": kind,
        "title": str(title or "").strip(),
        "user_id": user_id,
        "started_at": (now or _utcnow()).isoformat(),
        "duration_minutes": minutes,
        "notify_targets": list(notify_targets or []),
        "alarm": bool(alarm),
        "alarm_audience": normalize_alarm_audience(alarm_audience),
        "origin_client_id": str(client_id or "").strip(),
    }
    if kind == TIMER_KIND_CHORE:
        timer["chore_id"] = chore_id
    elif kind == TIMER_KIND_REWARD:
        timer["item_id"] = item_id
    # A standalone timer carries neither - its `title` (from the modal's
    # optional label field) is all the identity it has.
    _timers(state).append(timer)
    return timer


def remove_timer(state: dict[str, Any], uid: str) -> Optional[dict[str, Any]]:
    """Drop a timer by id, returning it (or None if it was already gone -
    not an error, since a timer firing and someone tapping Cancel can race
    and both outcomes are 'it's not running any more')."""
    timers = _timers(state)
    timer = next((t for t in timers if t.get("uid") == uid), None)
    if timer is None:
        return None
    state["timers"] = [t for t in timers if t.get("uid") != uid]
    return timer


def remove_timers_for_chore(state: dict[str, Any], chore_id: str) -> list[dict[str, Any]]:
    """Used when a chore is completed by hand, deleted, or reassigned - its
    timer has nothing left to count down toward. Returns whatever was
    removed so the caller can tell the frontend."""
    timers = _timers(state)
    removed = [t for t in timers if t.get("kind") == TIMER_KIND_CHORE and t.get("chore_id") == chore_id]
    if removed:
        state["timers"] = [t for t in timers if t not in removed]
    return removed
