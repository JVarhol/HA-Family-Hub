"""button platform: one press-only button entity per real Home Assistant
user account, each opening THAT user's own Daily Digest modal
live on whichever Family Hub dashboard they currently have open.

Why this exists - the household's own words: "Need to make the daily digest
a Card/modal. ... Add a setting that is per device that allows you to add
the modal button to the calendar screen or allows someone to add a digest
button to a dashboard by calling an entity. Digest should be user specific."

The in-card route (a "Daily Digest" item in the calendar card's own More
menu, always present - see the card's own _openDailyDigest) covers "add
the modal button to the calendar screen." This file covers the
other half: "allows someone to add a digest button to a dashboard by
calling an entity" - a plain `button` domain entity is exactly Home
Assistant's own answer to "something I can drop on any dashboard as a
button card, or press from an automation/script." Pressing it does NOT
itself send a notification (that's already covered by the scheduled digest
and the Users tab's "Send test digest now") - it fires
DAILY_DIGEST_EVENT_OPEN (see const.py's own comment on that event) so any
currently-open Family Hub card belonging to THIS SAME signed-in user pops
its digest modal open right there, same live-broadcast shape as an
already-ringing timer alarm reaching every open dashboard.

One button PER USER (not one shared button) because "Digest should be user
specific" is the whole point - the digest's actual content already varies
per recipient (see _build_daily_digest_sections' own docstring), and a
single shared button would have no way to know whose morning to show
without guessing. A household member presses THEIR OWN named button
(wherever it's been placed - their own phone dashboard, a shared tablet, an
automation) and sees their own events/reminders/chores, never anyone
else's.

Entities here are created once, statically, at setup from whichever real
(non-system-generated) Home Assistant user accounts exist at that moment -
same enumeration _ws_get_users already uses for the Users tab's own admin
dropdown. Unlike sensor.py's per-running-timer entities, these are NOT
recreated dynamically as accounts are added or removed - a new HA user
added later only gets their own button after the next Family Hub reload/HA
restart, an accepted, ordinary limitation shared by plenty of "one entity
per configured X" integrations rather than something worth a live
add/remove-entities bridge for what's expected to be a rare event.

Self-contained like sensor.py/todo.py: no imports from `.` (the package
__init__.py), so it has no circular-import exposure and is forwarded the
same way (hass.config_entries.async_forward_entry_setups(entry, ["button"])).
"""
from __future__ import annotations

import logging

from typing import Any, Optional

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from . import device_settings_entity_shared as shared
from .const import DAILY_DIGEST_EVENT_OPEN, DOMAIN

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    entry_data = hass.data.get(DOMAIN, {}).get("entries", {}).get(entry.entry_id)
    if entry_data is None:
        _LOGGER.warning("Family Hub: button platform set up before the integration's own entry data existed - skipping")
        return
    users = [u for u in await hass.auth.async_get_users() if not getattr(u, "system_generated", False)]
    entities: list[ButtonEntity] = [
        FamilyHubDailyDigestButton(entry.entry_id, u.id, u.name or u.id)
        for u in users
    ]
    entry_data["device_settings_sync_add_entities"] = async_add_entities
    entry_data.setdefault("device_settings_sync_entities", {})
    entry_data.setdefault("device_settings_sync_instance_entities", {})
    for device_id in shared.known_device_ids(entry_data):
        entities.extend(_build_sync_button_for_device(entry_data, device_id))
        for instance_id in shared.known_instance_ids(entry_data, device_id):
            entities.extend(_build_sync_button_for_instance(entry_data, device_id, instance_id))
    if entities:
        async_add_entities(entities)


def _build_sync_button_for_device(entry_data: dict[str, Any], device_id: str) -> list["FamilyHubDeviceSyncButton"]:
    registry = entry_data.setdefault("device_settings_sync_entities", {})
    if device_id in registry:
        return []
    entity = FamilyHubDeviceSyncButton(entry_data, device_id)
    registry[device_id] = entity
    return [entity]


def _build_sync_button_for_instance(entry_data: dict[str, Any], device_id: str, instance_id: str) -> list["FamilyHubDeviceSyncButton"]:
    registry = entry_data.setdefault("device_settings_sync_instance_entities", {}).setdefault(device_id, {})
    if instance_id in registry:
        return []
    label = shared.instance_label_for(entry_data, device_id, instance_id)
    entity = FamilyHubDeviceSyncButton(entry_data, device_id, instance_id=instance_id, instance_label=label)
    registry[instance_id] = entity
    return [entity]


def create_sync_button_for_device(entry_data: dict[str, Any], device_id: str) -> None:
    """Called from device_settings_websocket_api.py the first time a
    device_id reports in - same "best-effort/silent if this platform
    hasn't finished loading yet" shape as sensor.py's create_timer_sensor
    and select.py/number.py/text.py's own create_entities_for_device."""
    add_entities = entry_data.get("device_settings_sync_add_entities")
    if add_entities is None:
        return
    entities = _build_sync_button_for_device(entry_data, device_id)
    if entities:
        add_entities(entities)


def create_sync_button_for_instance(entry_data: dict[str, Any], device_id: str, instance_id: str) -> None:
    """Same as create_sync_button_for_device, for the first report of one
    dashboard/view placement (instance_id) of a device."""
    add_entities = entry_data.get("device_settings_sync_add_entities")
    if add_entities is None:
        return
    entities = _build_sync_button_for_instance(entry_data, device_id, instance_id)
    if entities:
        add_entities(entities)


class FamilyHubDailyDigestButton(ButtonEntity):
    """Pressing this fires DAILY_DIGEST_EVENT_OPEN carrying this button's own
    user_id - purely a live broadcast, no state, nothing persisted here (see
    this module's own docstring for why there is deliberately no pending/
    catch-up backstop for a device that wasn't open at press time)."""

    _attr_has_entity_name = True
    _attr_icon = "mdi:newspaper-variant-outline"

    def __init__(self, entry_id: str, user_id: str, user_name: str) -> None:
        self._entry_id = entry_id
        self._user_id = user_id
        self._attr_unique_id = f"{entry_id}_daily_digest_button_{user_id}"
        self._attr_name = f"{user_name} Daily Digest"

    async def async_press(self) -> None:
        self.hass.bus.async_fire(DAILY_DIGEST_EVENT_OPEN, {"user_id": self._user_id})


class FamilyHubDeviceSyncButton(ButtonEntity):
    """One per Family Hub device, plus one more per dashboard/view instance
    of that device (instance_id given) - pressing it stages and live-
    broadcasts that scope's current settings (see device_settings_entity_
    shared.py's own push_settings_to_target), the same effect the admin
    dashboard's own Push action already has, but reachable from an
    automation/script/other integration via the native button.press
    service with no custom websocket call. Every button for one device -
    its own and every instance's - is grouped under that same device's
    device-registry entry via DeviceInfo, same as the select/number/text
    settings entities."""

    _attr_has_entity_name = True
    _attr_icon = "mdi:sync"

    def __init__(
        self,
        entry_data: dict[str, Any],
        device_id: str,
        instance_id: Optional[str] = None,
        instance_label: Optional[str] = None,
    ) -> None:
        self._entry_data = entry_data
        self._device_id = device_id
        self._instance_id = instance_id
        suffix = f"_{instance_id}" if instance_id else ""
        self._attr_unique_id = f"family_hub_device_sync_{device_id}{suffix}"
        self._attr_name = f"{instance_label or instance_id}: Sync" if instance_id else "Sync"
        self._attr_device_info = shared.build_device_info(device_id, shared.device_name_for(entry_data, device_id))

    async def async_press(self) -> None:
        shared.push_settings_to_target(self.hass, self._entry_data, self._device_id, self._instance_id)
        await self._entry_data["device_settings_store"].async_save(self._entry_data["device_settings"])
