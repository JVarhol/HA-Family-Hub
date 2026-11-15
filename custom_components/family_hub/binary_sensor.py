"""binary_sensor platform: who's home, from day badges (2026.11.2).

When a badge says what it means ("Means they're home" / "Means they're away", see presence.py), the person it's about
gets binary_sensor.family_hub_<name>_home: on when they're home today, off when they're away, following the same
answer the Chores card and routines use. Only people with such a badge get one; someone whose badges are all taken
away goes unavailable. It changes at midnight and whenever the badges or their calendars change.

Attributes: user_id, away_days (the away days from today, up to 5 weeks), next_away / next_home (the next day that
changes), source.
"""
from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any, Optional

from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.event import async_track_time_change
from homeassistant.util import dt as dt_util

from . import people as people_mod
from . import presence as presence_mod
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

PRESENCE_EVENT = f"{DOMAIN}_presence_updated"
DAYS_OFF_EVENT = f"{DOMAIN}_days_off_updated"


def _slug(name: str) -> str:
    out = []
    prev = False
    for ch in str(name or "").lower():
        if ch.isascii() and ch.isalnum():
            out.append(ch)
            prev = False
        elif not prev and out:
            out.append("_")
            prev = True
    return "".join(out).strip("_")


def people_with_badges(presence: Any) -> list[str]:
    """The users some home/away badge is about"""
    rules = getattr(presence, "rules", None) or []
    return sorted({u for r in rules for u in (r.get("users") or []) if isinstance(u, str) and u})


def presence_attributes(presence: Any, user_id: str, today: Any = None) -> dict[str, Any]:
    today = today or dt_util.now().date()
    away = sorted(d for d in (getattr(presence, "away", {}) or {}).get(user_id, set()) if d >= today.isoformat())
    away_set = set(away)
    last = getattr(presence, "range", (None, None))[1]
    next_away = next_home = None
    is_away_today = today.isoformat() in away_set
    for i in range(1, 36):
        d = (today + timedelta(days=i)).isoformat()
        if last and d > last:
            break
        if is_away_today and next_home is None and d not in away_set:
            next_home = d
        if not is_away_today and next_away is None and d in away_set:
            next_away = d
        if next_home or next_away:
            break
    return {"user_id": user_id, "away_days": away, "next_away": next_away, "next_home": next_home, "source": "Family Hub badges"}


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    entry_data = hass.data.get(DOMAIN, {}).get("entries", {}).get(entry.entry_id)
    if entry_data is None:
        _LOGGER.warning("Family Hub: binary_sensor platform set up before the integration's own entry data existed - skipping")
        return
    made: dict[str, FamilyHubHomeSensor] = entry_data.setdefault("presence_sensors", {})

    async def sync(_event: Any = None) -> None:
        presence = entry_data.get("presence")
        if presence is None:
            return
        wanted = people_with_badges(presence)
        new = []
        for uid in wanted:
            if uid not in made:
                user = await people_mod.async_get_user(hass, uid, entry_data)
                name = (getattr(user, "name", None) or uid) if user is not None else uid
                made[uid] = FamilyHubHomeSensor(entry.entry_id, entry_data, uid, name)
                new.append(made[uid])
        if new:
            async_add_entities(new)
        for uid, ent in made.items():
            if ent.hass is not None:
                ent.async_write_ha_state()

    await sync()
    entry.async_on_unload(hass.bus.async_listen(PRESENCE_EVENT, sync))

    # 2026.11.2: no school / no work, today and tomorrow (from holidays marked so - see days_off.py)
    day_sensors = [FamilyHubDayOffSensor(entry.entry_id, entry_data, kind, offset) for kind in ("school", "work") for offset in (0, 1)]
    async_add_entities(day_sensors)

    @callback
    def _days_off_changed(_event: Any = None) -> None:
        for ent in day_sensors:
            if ent.hass is not None:
                ent.async_write_ha_state()

    entry.async_on_unload(hass.bus.async_listen(DAYS_OFF_EVENT, _days_off_changed))

    @callback
    def _midnight(_now: Any) -> None:
        hass.async_create_task(sync())
        _days_off_changed()

    entry.async_on_unload(async_track_time_change(hass, _midnight, hour=0, minute=0, second=5))


class FamilyHubHomeSensor(BinarySensorEntity):
    """On = home today (from the badges about this person), off = away"""

    _attr_has_entity_name = False
    _attr_device_class = BinarySensorDeviceClass.PRESENCE
    _attr_should_poll = False

    def __init__(self, entry_id: str, entry_data: dict[str, Any], user_id: str, name: str) -> None:
        self._entry_data = entry_data
        self._user_id = user_id
        self._attr_unique_id = f"{entry_id}_presence_{user_id}"
        # under Settings > Devices & services > Family Hub, with Privacy mode
        self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, entry_id)})
        self._attr_name = f"{name} home"
        slug = _slug(name) or _slug(user_id)
        self.entity_id = f"binary_sensor.family_hub_{slug}_home"

    @property
    def _presence(self) -> Optional[Any]:
        return self._entry_data.get("presence")

    @property
    def available(self) -> bool:
        p = self._presence
        return p is not None and self._user_id in people_with_badges(p)

    @property
    def is_on(self) -> Optional[bool]:
        p = self._presence
        if p is None:
            return None
        return not p.is_away(self._user_id)

    @property
    def icon(self) -> str:
        return "mdi:home-account" if self.is_on else "mdi:home-export-outline"

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        p = self._presence
        return presence_attributes(p, self._user_id) if p is not None else {"user_id": self._user_id}


class FamilyHubDayOffSensor(BinarySensorEntity):
    """On when today (or tomorrow) is a holiday marked No school / No work. No school is for the children, no work for
    everyone else. Attribute holidays: which ones."""

    _attr_has_entity_name = False
    _attr_should_poll = False

    def __init__(self, entry_id: str, entry_data: dict[str, Any], kind: str, offset: int) -> None:
        self._entry_data = entry_data
        self._kind = kind
        self._offset = offset
        when = "today" if offset == 0 else "tomorrow"
        self._attr_unique_id = f"{entry_id}_no_{kind}_{when}"
        self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, entry_id)})
        self._attr_name = f"No {kind} {when}"
        self.entity_id = f"binary_sensor.family_hub_no_{kind}_{when}"
        self._attr_icon = "mdi:school-outline" if kind == "school" else "mdi:briefcase-off-outline"

    def _day(self):
        return dt_util.now().date() + timedelta(days=self._offset)

    def _names(self) -> list[str]:
        days = self._entry_data.get("days_off")
        return days.names(self._day(), self._kind) if days is not None else []

    @property
    def is_on(self) -> bool:
        return bool(self._names())

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        days = self._entry_data.get("days_off")
        # 2026.11.2.8: breaks only some people have don't turn this on; they're listed here, by user id
        people = days.people(self._day()) if days is not None and hasattr(days, "people") else {}
        return {"date": self._day().isoformat(), "holidays": self._names(), "for": "children" if self._kind == "school" else "grown-ups", "people": people}
