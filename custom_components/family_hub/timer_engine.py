"""Chore/reward countdown timers (v1.110.0+).

The household's ask: "We need to be able to make chores and rewards have
timer associated to them. This would allow some interesting things like 2
hours of gaming, when you click use reward a timer would start and then a
timer would go off at the end of the 2 hours. Or if you have a chore thats
like clean for 30 minutes, at the end of 30 minutes it would set off a
timer, and either go to approval mode or complete the award."

Same shape as every other *_engine.py in this integration: pure functions
over a plain dict, no Home Assistant imports, no I/O. Whoever calls these
owns loading/saving the dict (see chores_websocket_api.py's timers
commands and __init__.py's sweep registration) - which is what makes all of
this straightforwardly unit-testable without standing up hass.

The state dict is `{"timers": [ {...}, ... ]}` where each entry is one
RUNNING timer:

    {
      "uid":              opaque id, generated here
      "kind":             "chore" | "reward"
      "chore_id":         set when kind == "chore"
      "item_id":          set when kind == "reward" (catalog item id)
      "title":            snapshot of the chore/reward title, for the
                          end-of-timer notification - snapshotted on
                          purpose so a renamed (or deleted) chore still
                          produces a sensible message
      "user_id":          whose timer this is
      "started_at":       ISO-8601 UTC
      "duration_minutes": int
      "notify_targets":   list of notify.* targets, snapshotted at start
                          for the same reason as title
      "entity_id":        v1.110.2+ - the native HA `timer.*` helper entity
                          actually running this countdown, when one was
                          free to adopt at start time. None/absent means
                          this timer runs off the store plus the backend
                          sweep exactly as it did before native support
                          existed. See const.py's TIMER_ENTITY_PREFIX for
                          the full research note on why Family Hub adopts
                          native timer entities rather than creating them.
      "alarm":            v1.119.0+ - snapshot of the owner's own
                          notifyTimerAlarm profile flag at start time (same
                          "snapshot, don't re-check later" reasoning as
                          notify_targets/title above). When true, firing
                          this timer sends an alarm-style push (Android
                          alarm-stream channel / iOS critical alert)
                          instead of the plain one - see
                          chores_websocket_api.py's _send_alarm_notification.
      "origin_client_id": v1.119.0+ - an opaque per-browser-tab id the
                          frontend generates once (sessionStorage-backed,
                          so it's stable across a reload but gone once that
                          tab actually closes) and sends when starting a
                          timer. Lets the ORIGINATING tab - and only that
                          one, not every open Family Hub screen in the
                          house - recognize "this is my timer" on its own
                          local per-second countdown and pop a same-device
                          sound+modal alarm the instant it hits zero,
                          without waiting on a round trip to the backend
                          sweep (which only runs every TIMER_SWEEP_SECONDS
                          and doesn't push anything to the frontend at
                          all). Empty/absent for a timer nobody's tab
                          claimed (or an old timer from before this field
                          existed) - just means no tab treats it as "mine."
    }

A timer exists ONLY while it is counting down. Firing or cancelling
removes it - this store is never a history log, because both outcomes are
already recorded elsewhere (a fired chore timer's result is on the chore
itself; a fired reward timer's is in the redemption log).

Two rules worth stating explicitly, because they are decisions and not
accidents:

  - ONE ACTIVE TIMER PER PERSON PER KIND. The household asked for one
    running reward timer per person ("2 hours of gaming" shouldn't be
    startable twice), and the same reasoning applies to chore timers - you
    cannot "clean for 30 minutes" at two different things simultaneously,
    and without the cap a kid can start five timers and wander off. The
    two kinds are independent of each other though: someone can be 10
    minutes into a cleaning timer AND have an hour of screen time running,
    which is a perfectly ordinary afternoon. See has_active_timer.
  - BLOCK, DON'T QUEUE, when a second one is attempted. Queuing was the
    alternative, and it's worse here: you would tap Redeem, be charged the
    stars, and see nothing happen for up to two hours, with no natural
    place in either card to show a pending queue. Refusing with "you've
    already got X running, N minutes left" is honest, immediately
    understandable, and recoverable (cancel it and start the other).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from .const import (
    TIMER_KIND_CHORE,
    TIMER_KIND_REWARD,
    TIMER_KIND_STANDALONE,
    TIMER_KINDS,
    TIMER_LABEL_MAX_LENGTH,
    TIMER_MAX_MINUTES,
    TIMER_MIN_MINUTES,
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


def normalize_timer_minutes(value: Any) -> Optional[int]:
    """A chore's/reward's configured timer length, or None for "no timer."

    None, "", 0 and anything unparseable all mean "no timer" rather than
    raising - these arrive from a text input on two different cards, and an
    empty box is the overwhelmingly common case, not an error. A real but
    out-of-range number IS clamped rather than dropped, since someone who
    typed 5000 clearly wanted "a long time," not "no timer at all."
    """
    if value is None or value == "":
        return None
    try:
        minutes = int(value)
    except (TypeError, ValueError):
        return None
    if minutes <= 0:
        return None
    return max(TIMER_MIN_MINUTES, min(TIMER_MAX_MINUTES, minutes))


def normalize_timer_label(value: Any) -> str:
    """A standalone timer's free-text label ("Oven", "Sam's turn"). Trimmed
    and length-capped; empty is fine and common, and the card falls back to
    a plain "Timer" when there is none - naming it is a convenience, not a
    requirement, since a lot of quick timers are started in a hurry."""
    return str(value or "").strip()[:TIMER_LABEL_MAX_LENGTH]


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
    try:
        minutes = int(minutes)
    except (TypeError, ValueError):
        minutes = 0
    return dt + timedelta(minutes=max(0, minutes))


def remaining_seconds(timer: dict[str, Any], now: Optional[datetime] = None) -> int:
    """Never negative - an overdue timer reads as 0 left, not -240. The
    frontend does this same arithmetic itself from started_at +
    duration_minutes so the visible countdown ticks smoothly between
    backend sweeps; this copy is what the backend's own expiry check and
    the "N minutes left" refusal message use."""
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
    client_id: Optional[str] = None,
    now: Optional[datetime] = None,
) -> dict[str, Any]:
    """Begin a countdown. Raises TimerError (never silently no-ops) for
    every refusal, so the websocket layer can tell the person exactly why
    nothing started."""
    if kind not in TIMER_KINDS:
        raise TimerError("invalid_kind", f"Unknown timer kind: {kind!r}")
    # v1.110.1+: a standalone timer may be UNASSIGNED - "optional assign to
    # user" - because plenty of household timers belong to the kitchen
    # rather than to a person. Chore and reward timers still must have an
    # owner: a chore timer completes somebody's chore and a reward timer
    # spends somebody's stars, so "nobody's" is meaningless for both.
    if not user_id and kind != TIMER_KIND_STANDALONE:
        raise TimerError("no_user", "A timer needs to belong to somebody.")
    minutes = normalize_timer_minutes(duration_minutes)
    if minutes is None:
        raise TimerError("invalid_duration", "That timer needs a length in minutes.")

    # An unassigned standalone timer has nobody to be "the one running
    # timer" for, so the per-person cap simply doesn't apply - a household
    # can have the oven, the pasta and a board game all counting down at
    # once, which is the whole point of the board. An ASSIGNED standalone
    # timer is capped like the others.
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
