"""button platform: one press-only button entity per real Home Assistant user account"""
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
    """One per Family Hub device, plus one more per dashboard/view instance of that device (instance_id given)"""

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
