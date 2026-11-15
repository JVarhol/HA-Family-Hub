"""No school / no work days, from holidays (2026.11.2).

Tap a holiday's banner on the calendar and set it to No school, No work or Both: that holiday (by name, on that
calendar) is a day off every year it comes round. Stored in settings.daysOff as [{calendar, name, off}], where name is
normalized (see norm_name) and off is "school", "work" or "both". Server-owned: only family_hub/days_off/set changes it.

No school is for the children (Child accounts), no work for everyone else. What it changes:
  - binary_sensor.family_hub_no_school_today / _tomorrow and _no_work_today / _tomorrow (binary_sensor.py)
  - Companion uses a child's weekend wake-up time on a no-school day, and weekend bedtime the night before one
  - the calendar's banner, the Today card and the Right Now bar say so

Holidays and breaks of the family's own (2026.11.2.8): settings.familyBreaks [{id, name, start, end, off, who, calendar?}] - spring
break, summer break, a work holiday, a vacation - with dates (end included) instead of a calendar. off is "" (just a
banner), "school", "work" or "both"; who is a list of user ids when only some people are off (a child whose school
has a different break). Server-owned: only family_hub/days_off/set_breaks changes it. A break for everyone counts like
a marked holiday; one for certain people is kept per person (days[date]["people"][uid]) and never turns the household
sensors on - they list them in their `people` attribute instead.
"""
from __future__ import annotations

import logging
import re
from datetime import date, datetime, timedelta
from typing import Any, Optional

from homeassistant.util import dt as dt_util

_LOGGER = logging.getLogger(__name__)

SETTINGS_KEY = "daysOff"
OFF_VALUES = ("school", "work", "both")
LOOK_AHEAD_DAYS = 14
REFRESH_SECONDS = 15 * 60
MAX_RULES = 200
BREAKS_KEY = "familyBreaks"
MAX_BREAKS = 100
MAX_BREAK_DAYS = 120
MAX_WHO = 30
KEEP_PAST_DAYS = 400


def norm_name(name: Any) -> str:
    """'Thanksgiving Day (observed) 2026' -> 'thanksgiving day': the same holiday every year, observed or not"""
    s = str(name or "").lower()
    s = re.sub(r"\(\s*(observed|observance|substitute)\s*\)", " ", s)
    s = re.sub(r"\b(19|20)\d{2}\b", " ", s)
    s = re.sub(r"\s+", " ", s).strip(" -–—:,")
    return s[:120]


def normalize(raw: Any) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for r in raw if isinstance(raw, list) else []:
        if not isinstance(r, dict):
            continue
        cal = str(r.get("calendar") or "").strip()
        name = norm_name(r.get("name"))
        off = r.get("off")
        if not cal.startswith("calendar.") or not name or off not in OFF_VALUES or (cal, name) in seen:
            continue
        seen.add((cal, name))
        out.append({"calendar": cal, "name": name, "off": off})
    return out[:MAX_RULES]


def set_rule(rules: list[dict[str, str]], calendar: str, name: str, off: Optional[str]) -> list[dict[str, str]]:
    """off None/'' clears it (a regular day)"""
    key = (calendar, norm_name(name))
    kept = [r for r in normalize(rules) if (r["calendar"], r["name"]) != key]
    if off in OFF_VALUES and key[1]:
        kept.append({"calendar": calendar, "name": key[1], "off": off})
    return kept[:MAX_RULES]


def _parse_day(value: Any) -> Optional[date]:
    try:
        return date.fromisoformat(str(value or "")[:10])
    except ValueError:
        return None


def normalize_breaks(raw: Any, today: Optional[date] = None) -> list[dict[str, Any]]:
    """Sorted by start; a bad one dropped, ends before starts swapped, too long cut to MAX_BREAK_DAYS, long-past ones
    dropped. Ids are kept (made up when missing)."""
    today = today or dt_util.now().date()
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for i, b in enumerate(raw if isinstance(raw, list) else []):
        if not isinstance(b, dict):
            continue
        name = re.sub(r"\s+", " ", str(b.get("name") or "")).strip()[:60]
        start, end = _parse_day(b.get("start")), _parse_day(b.get("end") or b.get("start"))
        if not name or start is None or end is None:
            continue
        if end < start:
            start, end = end, start
        if (end - start).days >= MAX_BREAK_DAYS:
            end = start + timedelta(days=MAX_BREAK_DAYS - 1)
        if (today - end).days > KEEP_PAST_DAYS:
            continue
        bid = re.sub(r"[^A-Za-z0-9_-]", "", str(b.get("id") or ""))[:40] or f"b{start.strftime('%Y%m%d')}{i}"
        while bid in seen:
            bid += "x"
        seen.add(bid)
        off = b.get("off") if b.get("off") in OFF_VALUES else ""
        who: list[str] = []
        for u in b.get("who") if isinstance(b.get("who"), list) else []:
            u = str(u or "").strip()
            if u and u not in who:
                who.append(u)
        item = {"id": bid, "name": name, "start": start.isoformat(), "end": end.isoformat(), "off": off, "who": who[:MAX_WHO]}
        cal = str(b.get("calendar") or "").strip()
        if cal.startswith("calendar."):
            item["calendar"] = cal  # added on that Holidays calendar (its colour); Family Hub keeps it either way
        out.append(item)
    out.sort(key=lambda b: (b["start"], b["end"], b["name"].lower()))
    return out[:MAX_BREAKS]


def _add_breaks(out: dict[str, dict[str, Any]], breaks: list[dict[str, Any]]) -> None:
    for b in breaks:
        if not b.get("off"):
            continue
        start, end = _parse_day(b["start"]), _parse_day(b["end"])
        if start is None or end is None:
            continue
        kinds = ("school", "work") if b["off"] == "both" else (b["off"],)
        d = start
        while d <= end:
            day = out.setdefault(d.isoformat(), {"school": [], "work": []})
            if b.get("who"):
                people = day.setdefault("people", {})
                for uid in b["who"]:
                    names = people.setdefault(uid, [])
                    if b["name"] not in names:
                        names.append(b["name"])
            else:
                for k in kinds:
                    if b["name"] not in day[k]:
                        day[k].append(b["name"])
            d += timedelta(days=1)


def _event_days(event: dict[str, Any]) -> list[date]:
    from .presence import _event_days as days
    return days(event)


def compute(rules: list[dict[str, str]], events_by_calendar: dict[str, list[dict[str, Any]]], breaks: Optional[list[dict[str, Any]]] = None) -> dict[str, dict[str, Any]]:
    """{YYYY-MM-DD: {"school": [holiday names], "work": [...], "people": {uid: [break names]} (only when some are)}}"""
    out: dict[str, dict[str, Any]] = {}
    _add_breaks(out, breaks or [])
    for rule in rules:
        for ev in events_by_calendar.get(rule["calendar"], []) or []:
            summary = str(ev.get("summary") or "")
            if norm_name(summary) != rule["name"]:
                continue
            kinds = ("school", "work") if rule["off"] == "both" else (rule["off"],)
            for d in _event_days(ev):
                day = out.setdefault(d.isoformat(), {"school": [], "work": []})
                for k in kinds:
                    if summary.strip() not in day[k]:
                        day[k].append(summary.strip())
    return out


class DaysOff:
    """Per config entry: the coming days off, refreshed from the calendars every so often"""

    def __init__(self) -> None:
        self.days: dict[str, dict[str, list[str]]] = {}
        self.rules: list[dict[str, str]] = []
        self.breaks: list[dict[str, Any]] = []
        self.fetched_at: Optional[datetime] = None

    def is_off(self, when: Any, kind: str, user_id: Optional[str] = None) -> bool:
        return bool(self.names(when, kind, user_id))

    def _day(self, when: Any) -> dict[str, Any]:
        if isinstance(when, datetime):
            when = dt_util.as_local(when if when.tzinfo else when.replace(tzinfo=dt_util.get_default_time_zone())).date()
        key = when.isoformat() if isinstance(when, date) else str(when)
        return self.days.get(key) or {}

    def names(self, when: Any, kind: str, user_id: Optional[str] = None) -> list[str]:
        """The household's days off of this kind, plus (for user_id) the breaks only some people have"""
        day = self._day(when)
        out = list(day.get(kind) or [])
        if user_id:
            out += [n for n in ((day.get("people") or {}).get(user_id) or []) if n not in out]
        return out

    def people(self, when: Any) -> dict[str, list[str]]:
        return {u: list(n) for u, n in ((self._day(when).get("people") or {}).items())}

    def stale(self) -> bool:
        return self.fetched_at is None or (dt_util.utcnow() - self.fetched_at).total_seconds() > REFRESH_SECONDS

    def as_dict(self) -> dict[str, Any]:
        return {"days": self.days, "rules": self.rules, "breaks": self.breaks}

    async def refresh(self, hass: Any, settings: dict[str, Any]) -> bool:
        """Fetch the calendars the rules are on and work out the days off. True when anything changed."""
        before_days, before_rules, before_breaks = self.days, self.rules, self.breaks
        self.rules = normalize(settings.get(SETTINGS_KEY) if isinstance(settings, dict) else None)
        self.breaks = normalize_breaks(settings.get(BREAKS_KEY) if isinstance(settings, dict) else None)
        self.fetched_at = dt_util.utcnow()
        if not self.rules:
            self.days = compute([], {}, self.breaks)
            return before_days != self.days or before_rules != self.rules or before_breaks != self.breaks
        tz = dt_util.get_default_time_zone()
        today = dt_util.now().date()
        start = datetime.combine(today - timedelta(days=1), datetime.min.time(), tz)
        end = datetime.combine(today + timedelta(days=LOOK_AHEAD_DAYS + 1), datetime.min.time(), tz)
        events: dict[str, list[dict[str, Any]]] = {}
        for cal in sorted({r["calendar"] for r in self.rules}):
            try:
                resp = await hass.services.async_call(
                    "calendar", "get_events",
                    {"entity_id": cal, "start_date_time": start.isoformat(), "end_date_time": end.isoformat()},
                    blocking=True, return_response=True,
                )
            except Exception as err:  # noqa: BLE001 - keep what we knew for a calendar that can't be read right now
                _LOGGER.debug("Family Hub: days off couldn't read %s: %s", cal, err)
                return before_rules != self.rules or before_breaks != self.breaks
            events[cal] = ((resp or {}).get(cal) or {}).get("events", []) or []
        self.days = compute(self.rules, events, self.breaks)
        return before_days != self.days or before_rules != self.rules or before_breaks != self.breaks
