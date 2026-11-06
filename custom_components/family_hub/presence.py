"""Who's home: day badges as a custody schedule (2026.11.1.7).

Badges started as the way to see a custody schedule without filling the calendar with "At Dad's" events: on the days
an event on a calendar contains a keyword, that day gets a small badge instead. A badge can now say what it means for
the people it's about:

  presence "home"  - they're home on the days it shows, and away on the days it doesn't (the default for new badges)
  presence "away"  - they're away on the days it shows
  presence "label" - just a label (every badge made before this existed, until someone picks)

Who a badge is about: the person whose calendar it's on, or (for a shared calendar like "Custody", or to cover
several kids) the people listed in the badge's "who".

Chores and routines ask is_away(user, day): a chore given to someone who's away goes to the next person who's home,
the Chore Bin, or is skipped that day (the chore's own away_mode); routines aren't due for someone who's away.

The pure functions here take plain dicts so they test without Home Assistant; refresh() does the calendar fetch.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Any, Iterable, Optional

from homeassistant.util import dt as dt_util

_LOGGER = logging.getLogger(__name__)

PRESENCE_HOME = "home"
PRESENCE_AWAY = "away"
PRESENCE_LABEL = "label"
PRESENCE_VALUES = (PRESENCE_HOME, PRESENCE_AWAY, PRESENCE_LABEL)
LOOK_BEHIND_DAYS = 2
LOOK_AHEAD_DAYS = 35
REFRESH_SECONDS = 15 * 60


def _users_by_calendar(settings: dict[str, Any]) -> dict[str, str]:
    """{calendar entity: user id} from each person's primary and extra calendars"""
    out: dict[str, str] = {}
    profiles = settings.get("userProfiles") if isinstance(settings, dict) else None
    if not isinstance(profiles, dict):
        return out
    for uid, p in profiles.items():
        if not isinstance(p, dict):
            continue
        cals = [p.get("primaryCalendar")] + list(p.get("extraCalendars") or [])
        for c in cals:
            if isinstance(c, str) and c.strip() and c.strip() not in out:
                out[c.strip()] = uid
    return out


def badge_rules(settings: dict[str, Any]) -> list[dict[str, Any]]:
    """Every badge that says something about who's home: [{calendar, match, presence, users}]"""
    if not isinstance(settings, dict):
        return []
    owner = _users_by_calendar(settings)
    rules: list[dict[str, Any]] = []
    seen: set[tuple] = set()

    def add(calendar: Any, badges: Any, profile_uid: Optional[str]) -> None:
        if not isinstance(calendar, str) or not calendar.strip() or not isinstance(badges, list):
            return
        calendar = calendar.strip()
        for b in badges:
            if not isinstance(b, dict):
                continue
            presence = b.get("presence")
            if presence not in (PRESENCE_HOME, PRESENCE_AWAY):
                continue
            match = str(b.get("match") or "").strip().lower()
            if not match:
                continue
            who = [u for u in (b.get("who") or []) if isinstance(u, str) and u]
            users = who or ([profile_uid] if profile_uid else ([owner[calendar]] if calendar in owner else []))
            if not users:
                continue
            key = (calendar, match, presence, tuple(sorted(users)))
            if key in seen:
                continue
            seen.add(key)
            rules.append({"calendar": calendar, "match": match, "presence": presence, "users": users})

    for p in settings.get("people") or []:
        if isinstance(p, dict):
            add(p.get("entity"), p.get("badges"), None)
    for uid, p in (settings.get("userProfiles") or {}).items():
        if isinstance(p, dict):
            add(p.get("primaryCalendar"), p.get("badges"), uid)
    return rules


def _event_days(event: dict[str, Any]) -> list[date]:
    """The local days an event covers (an all-day event's end date is exclusive, like Home Assistant's)"""
    def parse(raw: Any) -> tuple[Optional[date], bool]:
        if isinstance(raw, dict):
            raw = raw.get("dateTime") or raw.get("date")
        if not raw:
            return None, False
        raw = str(raw)
        if "T" not in raw:
            try:
                return date.fromisoformat(raw[:10]), True
            except ValueError:
                return None, False
        dt = dt_util.parse_datetime(raw)
        if dt is None:
            return None, False
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=dt_util.get_default_time_zone())
        return dt_util.as_local(dt).date(), False

    start, all_day = parse(event.get("start"))
    end, _ = parse(event.get("end"))
    if start is None:
        return []
    if end is None or end < start:
        end = start
    if all_day and end > start:
        end = end - timedelta(days=1)
    elif not all_day and event.get("end"):
        # a timed event that ends exactly at midnight doesn't count for the next day
        raw_end = event["end"].get("dateTime") if isinstance(event["end"], dict) else event["end"]
        end_dt = dt_util.parse_datetime(str(raw_end)) if raw_end else None
        if end_dt is not None and end > start:
            local_end = dt_util.as_local(end_dt if end_dt.tzinfo else end_dt.replace(tzinfo=dt_util.get_default_time_zone()))
            if local_end.hour == 0 and local_end.minute == 0:
                end = end - timedelta(days=1)
    days = []
    d = start
    while d <= end and len(days) < 400:
        days.append(d)
        d += timedelta(days=1)
    return days


def compute_away_days(
    rules: list[dict[str, Any]], events_by_calendar: dict[str, list[dict[str, Any]]], days: Iterable[date]
) -> dict[str, list[str]]:
    """{user: [YYYY-MM-DD days they're away]} over `days`.
    Away on a day when an "away" badge shows, or when they have "home" badges and none of them shows."""
    days = list(days)
    shown: dict[int, set[date]] = {}
    for i, rule in enumerate(rules):
        hit: set[date] = set()
        for ev in events_by_calendar.get(rule["calendar"], []) or []:
            if rule["match"] in str(ev.get("summary") or "").lower():
                hit.update(_event_days(ev))
        shown[i] = hit
    users = sorted({u for r in rules for u in r["users"]})
    out: dict[str, list[str]] = {}
    for uid in users:
        mine = [(i, r) for i, r in enumerate(rules) if uid in r["users"]]
        home = [i for i, r in mine if r["presence"] == PRESENCE_HOME]
        away = [i for i, r in mine if r["presence"] == PRESENCE_AWAY]
        away_days = []
        for d in days:
            if any(d in shown[i] for i in away) or (home and not any(d in shown[i] for i in home)):
                away_days.append(d.isoformat())
        if away_days:
            out[uid] = away_days
    return out


class Presence:
    """Per config entry: the latest away days, refreshed from the calendars every so often"""

    def __init__(self) -> None:
        self.away: dict[str, set[str]] = {}
        self.range: tuple[Optional[str], Optional[str]] = (None, None)
        self.fetched_at: Optional[datetime] = None
        self.rules: list[dict[str, Any]] = []

    def is_away(self, user_id: Optional[str], when: Optional[datetime | date] = None) -> bool:
        if not user_id or user_id not in self.away:
            return False
        if when is None:
            day = dt_util.now().date()
        elif isinstance(when, datetime):
            day = dt_util.as_local(when if when.tzinfo else when.replace(tzinfo=dt_util.get_default_time_zone())).date()
        else:
            day = when
        return day.isoformat() in self.away[user_id]

    def set_from(self, away_days: dict[str, list[str]], first: date, last: date) -> None:
        self.away = {u: set(d) for u, d in away_days.items()}
        self.range = (first.isoformat(), last.isoformat())
        self.fetched_at = dt_util.utcnow()

    def as_dict(self) -> dict[str, Any]:
        return {
            "away": {u: sorted(d) for u, d in self.away.items()},
            "from": self.range[0],
            "to": self.range[1],
            "has_rules": bool(self.rules),
        }

    def stale(self) -> bool:
        return self.fetched_at is None or (dt_util.utcnow() - self.fetched_at).total_seconds() > REFRESH_SECONDS

    async def refresh(self, hass: Any, settings: dict[str, Any]) -> bool:
        """Fetch the badge calendars and work out who's away. Returns True when anything changed."""
        self.rules = badge_rules(settings)
        today = dt_util.now().date()
        first, last = today - timedelta(days=LOOK_BEHIND_DAYS), today + timedelta(days=LOOK_AHEAD_DAYS)
        before = {u: set(d) for u, d in self.away.items()}
        if not self.rules:
            self.set_from({}, first, last)
            return before != self.away
        tz = dt_util.get_default_time_zone()
        start = datetime.combine(first, datetime.min.time(), tz)
        end = datetime.combine(last + timedelta(days=1), datetime.min.time(), tz)
        events: dict[str, list[dict[str, Any]]] = {}
        for cal in sorted({r["calendar"] for r in self.rules}):
            try:
                resp = await hass.services.async_call(
                    "calendar", "get_events",
                    {"entity_id": cal, "start_date_time": start.isoformat(), "end_date_time": end.isoformat()},
                    blocking=True, return_response=True,
                )
            except Exception as err:  # noqa: BLE001 - one calendar failing keeps the last known answer for it
                _LOGGER.debug("Family Hub: who's-home check couldn't read %s: %s", cal, err)
                return False
            events[cal] = ((resp or {}).get(cal) or {}).get("events", []) or []
        days = [first + timedelta(days=i) for i in range((last - first).days + 1)]
        self.set_from(compute_away_days(self.rules, events, days), first, last)
        return before != self.away
