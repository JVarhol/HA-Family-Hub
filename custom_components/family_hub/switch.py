"""switch platform: two kinds of live, automation-friendly on/off entities -"""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo

from . import device_settings_entity_shared as shared
from . import privacy_mode_shared
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    entry_data = hass.data.get(DOMAIN, {}).get("entries", {}).get(entry.entry_id)
    if entry_data is None:
        _LOGGER.warning("Family Hub: switch platform set up before the integration's own entry data existed - skipping")
        return
    entry_data["device_settings_switch_add_entities"] = async_add_entities
    entry_data.setdefault("device_settings_screensaver_switch_entities", {})
    entry_data.setdefault("device_settings_privacy_participates_switch_entities", {})
    privacy_switch = FamilyHubPrivacyModeSwitch(entry.entry_id, entry_data)
    entry_data["privacy_mode_switch_entity"] = privacy_switch
    entities: list[SwitchEntity] = [privacy_switch]
    for device_id in shared.known_device_ids(entry_data):
        entities.extend(_build_screensaver_switch_for_device(entry_data, device_id))
        entities.extend(_build_privacy_participates_switch_for_device(entry_data, device_id))
    async_add_entities(entities)


def _build_screensaver_switch_for_device(entry_data: dict[str, Any], device_id: str) -> list["FamilyHubDeviceScreenSaverSwitch"]:
    registry = entry_data.setdefault("device_settings_screensaver_switch_entities", {})
    if device_id in registry:
        return []
    entity = FamilyHubDeviceScreenSaverSwitch(entry_data, device_id)
    registry[device_id] = entity
    return [entity]


def _build_privacy_participates_switch_for_device(entry_data: dict[str, Any], device_id: str) -> list["FamilyHubDevicePrivacyParticipatesSwitch"]:
    registry = entry_data.setdefault("device_settings_privacy_participates_switch_entities", {})
    if device_id in registry:
        return []
    entity = FamilyHubDevicePrivacyParticipatesSwitch(entry_data, device_id)
    registry[device_id] = entity
    return [entity]


def create_entities_for_device(entry_data: dict[str, Any], device_id: str) -> None:
    """Called from device_settings_websocket_api.py the first time a
    device_id reports in - same best-effort/silent-if-platform-not-loaded-
    yet shape as select.py's own create_entities_for_device."""
    add_entities = entry_data.get("device_settings_switch_add_entities")
    if add_entities is None:
        return
    entities = _build_screensaver_switch_for_device(entry_data, device_id)
    entities.extend(_build_privacy_participates_switch_for_device(entry_data, device_id))
    if entities:
        add_entities(entities)


def notify_device(entry_data: dict[str, Any], device_id: str) -> None:
    """Refreshes one device's already-created screensaver switch after its value changed by some other means (the admin Devices tab's own toggle control"""
    entity = entry_data.get("device_settings_screensaver_switch_entities", {}).get(device_id)
    if entity is not None:
        shared.safe_write_ha_state(entity)


def notify_device_privacy_participates(entry_data: dict[str, Any], device_id: str) -> None:
    """Same as notify_device above, for the per-device Privacy Mode
    participation switch - refreshes it after the admin Devices tab's own
    toggle control changes it (via ws_set_privacy_participates)."""
    entity = entry_data.get("device_settings_privacy_participates_switch_entities", {}).get(device_id)
    if entity is not None:
        shared.safe_write_ha_state(entity)


class FamilyHubDeviceScreenSaverSwitch(SwitchEntity):
    """See this module's own docstring. One per device - whether THIS
    device's automatic screensaver is allowed to engage at all."""

    _attr_has_entity_name = True
    _attr_icon = "mdi:monitor-lock"

    def __init__(self, entry_data: dict[str, Any], device_id: str) -> None:
        self._entry_data = entry_data
        self._device_id = device_id
        self._attr_unique_id = f"family_hub_device_screensaver_enabled_{device_id}"
        self._attr_name = "Screensaver enabled"
        self._attr_device_info = shared.build_device_info(device_id, shared.device_name_for(entry_data, device_id))

    @property
    def is_on(self) -> bool:
        return shared.screensaver_enabled_for(self._entry_data, self._device_id)

    async def async_turn_on(self, **kwargs: Any) -> None:
        await shared.async_set_screensaver_enabled(self.hass, self._entry_data, self._device_id, True)
        shared.safe_write_ha_state(self)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await shared.async_set_screensaver_enabled(self.hass, self._entry_data, self._device_id, False)
        shared.safe_write_ha_state(self)


class FamilyHubDevicePrivacyParticipatesSwitch(SwitchEntity):
    """See this module's own docstring. One per device - whether THIS
    device honors the household's single Privacy Mode flag at all."""

    _attr_has_entity_name = True
    _attr_icon = "mdi:shield-lock"

    def __init__(self, entry_data: dict[str, Any], device_id: str) -> None:
        self._entry_data = entry_data
        self._device_id = device_id
        self._attr_unique_id = f"family_hub_device_privacy_participates_{device_id}"
        self._attr_name = "Participates in privacy mode"
        self._attr_device_info = shared.build_device_info(device_id, shared.device_name_for(entry_data, device_id))

    @property
    def is_on(self) -> bool:
        return shared.privacy_participates_for(self._entry_data, self._device_id)

    async def async_turn_on(self, **kwargs: Any) -> None:
        await shared.async_set_privacy_participates(self.hass, self._entry_data, self._device_id, True)
        shared.safe_write_ha_state(self)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await shared.async_set_privacy_participates(self.hass, self._entry_data, self._device_id, False)
        shared.safe_write_ha_state(self)


class FamilyHubPrivacyModeSwitch(SwitchEntity):
    """See this module's own docstring. ONE single household-wide switch -
    grouped under the "Family Hub" integration device, not a per-tablet
    device like FamilyHubDeviceScreenSaverSwitch above."""

    _attr_has_entity_name = True
    _attr_icon = "mdi:lock"
    _attr_name = "Privacy mode"

    def __init__(self, entry_id: str, entry_data: dict[str, Any]) -> None:
        self._entry_data = entry_data
        self._attr_unique_id = f"family_hub_privacy_mode_{entry_id}"
        self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, entry_id)})

    @property
    def is_on(self) -> bool:
        return bool((self._entry_data.get("privacy_mode") or {}).get("enabled"))

    async def async_turn_on(self, **kwargs: Any) -> None:
        await privacy_mode_shared.async_set_privacy_mode(self.hass, self._entry_data, True)
        shared.safe_write_ha_state(self)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await privacy_mode_shared.async_set_privacy_mode(self.hass, self._entry_data, False)
        shared.safe_write_ha_state(self)


def notify_privacy_mode(entry_data: dict[str, Any]) -> None:
    """Refreshes the single privacy-mode switch after its value changed by
    some other means (the PIN-gated disable command, or the card's own
    "more" menu enable action) - mirrors notify_device above."""
    entity = entry_data.get("privacy_mode_switch_entity")
    if entity is not None:
        shared.safe_write_ha_state(entity)
