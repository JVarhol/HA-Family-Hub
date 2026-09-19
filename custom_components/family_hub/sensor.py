"""sensor platform: one read-only sensor entity per currently-ACTIVE Family
Hub timer (v1.110.3+).

Why this exists - the household's own words: "We also need to have a way to
understand what the timer is doing to tie into automations, maybe there is
a timer for screen time when its up the computer locks, how do we know what
the reward or chore behind the timer is so we can use them in automations?"

The gap this closes: a Family Hub timer adopted onto a native `timer.*`
helper (see chores_websocket_api.py's _adopt_native_timer, v1.110.2+) is a
real, automatable HA entity - but HA's own `timer` domain has a FIXED
schema (duration/remaining/finishes_at only). It has no room for "this is
Sam's screen-time reward" or "this is the Saturday chores timer for Emma".
That mapping only ever lived in Family Hub's own in-memory timers Store,
which a plain HA automation has no way to see. Two complementary fixes
ship together (see also __init__.py's EVENT_FAMILY_HUB_TIMER_FINISHED
firing, in chores_websocket_api.py's _fire_timer):

  1. THIS FILE - one sensor per RUNNING timer, so "what's currently
     counting down and what's it for" is queryable at any time, from
     Developer Tools > States or a template. State is the timer's `kind`
     (chore/reward/standalone) - stable and simple to match on
     (`state == 'reward'`) - and every other identifying fact lives in
     attributes: chore_id/item_id, title, user_id/user_name,
     native_timer_entity_id (the timer.* helper it's adopted onto, if any -
     the cross-reference an automation triggering off THAT entity's own
     timer.finished event needs to answer "which one was this?"),
     started_at, duration_minutes, finishes_at.
  2. The custom `family_hub_timer_finished` EVENT - fired the instant any
     of the three kinds completes, carrying the same metadata. That is the
     natural "trigger: event" for "when Sam's screen-time reward ends, lock
     his computer" - no sensor lookup required at all. See README.md's
     Timers section for a full example automation.

Entities here are created/removed DYNAMICALLY as timers start and end
(there is no fixed count - a household with three timers running has three
of these, and none while nothing is counting down) rather than being
pre-declared, which is why this platform stores `async_add_entities` in
entry_data instead of calling it once here. Created alongside the SAME
call sites that already start/adopt a native timer in
chores_websocket_api.py, and removed alongside every place that already
calls timer_engine.remove_timer/remove_timers_for_chore - see
create_timer_sensor/remove_timer_sensor below, and their call sites.

Self-contained like todo.py: no imports from `.` (the package __init__.py),
so it has no circular-import exposure and is forwarded the same way
(hass.config_entries.async_forward_entry_setups(entry, ["sensor"])).
"""
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
    # A restart can land here with timers already running (they are
    # persisted in the Store, unlike these sensors which are recreated from
    # scratch every setup) - backfill one for each so a mid-countdown
    # restart doesn't leave automations blind until the next start/adopt.
    timers = (entry_data.get("timers") or {}).get("timers") or []
    entities = [FamilyHubTimerSensor(entry_data, timer) for timer in timers]
    if entities:
        for entity in entities:
            entry_data["timer_sensor_entities"][entity.timer_uid] = entity
        async_add_entities(entities)


def create_timer_sensor(
    hass: HomeAssistant, entry_data: dict[str, Any], timer: dict[str, Any], user_name: Optional[str] = None
) -> None:
    """Add a sensor for a timer that just started. Best-effort and silent
    if the sensor platform hasn't finished loading yet (very first setup,
    before async_forward_entry_setups resolves) - the timer itself still
    runs and fires normally either way, this is purely the automation-
    visibility layer on top.

    `user_name` is resolved by the caller (which already has an async
    context and, in every real call site, has just looked it up anyway for
    the end-of-timer notification) rather than here, since a HA user
    lookup is async and Entity property getters cannot be."""
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
    # `hass`/`async_remove` are only present once HA has actually added the
    # entity to the platform (real Entity base class behavior - our own
    # FamilyHubTimerSensor never sets either itself). Getting here before
    # that has happened, or in a unit test with no real HA underneath,
    # should just drop our own bookkeeping rather than raise - the entity
    # already reads unavailable (see `available` above) either way.
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
