"""sensor platform: one read-only sensor entity per currently-ACTIVE Family Hub timer."""
from __future__ import annotations

import logging
from typing import Any, Optional

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from . import timer_engine
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    entry_data = hass.data.get(DOMAIN, {}).get("entries", {}).get(entry.entry_id)
    if entry_data is None:
        _LOGGER.warning("Family Hub: sensor platform set up before the integration's own entry data existed - skipping")
        return
    entry_data["timer_sensor_add_entities"] = async_add_entities
    entry_data.setdefault("timer_sensor_entities", {})
    # A restart can land here with timers already running (they are persisted in the Store
    timers = (entry_data.get("timers") or {}).get("timers") or []
    entities = [FamilyHubTimerSensor(entry_data, timer) for timer in timers]
    if entities:
        for entity in entities:
            entry_data["timer_sensor_entities"][entity.timer_uid] = entity
        async_add_entities(entities)


def create_timer_sensor(
    hass: HomeAssistant, entry_data: dict[str, Any], timer: dict[str, Any], user_name: Optional[str] = None
) -> None:
    """Add a sensor for a timer that just started."""
    add_entities = entry_data.get("timer_sensor_add_entities")
    if add_entities is None:
        return
    uid = timer.get("uid")
    if not uid or uid in entry_data.get("timer_sensor_entities", {}):
        return
    entity = FamilyHubTimerSensor(entry_data, timer, user_name)
    entry_data.setdefault("timer_sensor_entities", {})[uid] = entity
    add_entities([entity])


def remove_timer_sensor(entry_data: dict[str, Any], uid: Optional[str]) -> None:
    """Remove the sensor for a timer that just ended (fired or cancelled).
    Entities here only ever represent a RUNNING timer - once it's gone
    there is nothing left to show, and the custom event / chore-or-reward
    outcome is the durable record instead."""
    if not uid:
        return
    entities = entry_data.get("timer_sensor_entities")
    if not entities:
        return
    entity = entities.pop(uid, None)
    if entity is None:
        return
    # `hass`/`async_remove` are only present once HA has actually added the entity to the platform (real Entity base class behavior
    hass = getattr(entity, "hass", None)
    remove = getattr(entity, "async_remove", None)
    if hass is not None and callable(remove):
        hass.async_create_task(remove())


def remove_timer_sensors(entry_data: dict[str, Any], uids: list[str]) -> None:
    for uid in uids:
        remove_timer_sensor(entry_data, uid)


class FamilyHubTimerSensor(SensorEntity):
    """One of these per currently-running Family Hub timer. See this
    module's own docstring for the automation gap it closes."""

    _attr_has_entity_name = True
    _attr_icon = "mdi:timer-sand"

    def __init__(self, entry_data: dict[str, Any], timer: dict[str, Any], user_name: Optional[str] = None) -> None:
        self._entry_data = entry_data
        self.timer_uid = timer.get("uid")
        self._user_name = user_name
        self._attr_unique_id = f"family_hub_timer_{self.timer_uid}"
        self._attr_name = timer.get("title") or "Timer"

    def _timer(self) -> Optional[dict[str, Any]]:
        for timer in (self._entry_data.get("timers") or {}).get("timers") or []:
            if timer.get("uid") == self.timer_uid:
                return timer
        return None

    @property
    def available(self) -> bool:
        return self._timer() is not None

    @property
    def native_value(self) -> Optional[str]:
        timer = self._timer()
        return timer.get("kind") if timer else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        timer = self._timer()
        if timer is None:
            return {}
        ends = timer_engine.ends_at(timer)
        return {
            "kind": timer.get("kind"),
            "chore_id": timer.get("chore_id"),
            "reward_item_id": timer.get("item_id"),
            "title": timer.get("title"),
            "user_id": timer.get("user_id"),
            "user_name": self._user_name,
            "native_timer_entity_id": timer.get("entity_id"),
            "started_at": timer.get("started_at"),
            "duration_minutes": timer.get("duration_minutes"),
            "finishes_at": ends.isoformat() if ends else None,
        }
