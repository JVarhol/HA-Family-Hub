"""text platform: one text entity per Family Hub device per "text"-type
DEVICE_SETTINGS_FIELDS entry (see that registry in const.py) - currently
just familyHubDeviceCustomNameLocal, which is device-scoped (see const.py's
own "scope" comment), so INSTANCE_TEXT_FIELDS is empty for now - kept
rather than removed so a future instance-scoped text field needs no
changes here beyond adding it to const.py. See select.py's own module
docstring and device_settings_entity_shared.py's module docstring for the
full picture of how these entities relate to the Sync buttons in button.py.

Self-contained like select.py/number.py/sensor.py/button.py: no imports
from `.` (the package __init__.py), forwarded the same way (hass.
config_entries.async_forward_entry_setups(entry, ["text"])).
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from homeassistant.components.text import TextEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from . import device_settings_entity_shared as shared
from .const import DEVICE_SETTINGS_FIELDS, DOMAIN

_LOGGER = logging.getLogger(__name__)

TEXT_FIELDS = {key: field for key, field in DEVICE_SETTINGS_FIELDS.items() if field["type"] == "text" and field.get("scope") == "device"}
INSTANCE_TEXT_FIELDS = {key: field for key, field in DEVICE_SETTINGS_FIELDS.items() if field["type"] == "text" and field.get("scope") == "instance"}


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    entry_data = hass.data.get(DOMAIN, {}).get("entries", {}).get(entry.entry_id)
    if entry_data is None:
        _LOGGER.warning("Family Hub: text platform set up before the integration's own entry data existed - skipping")
        return
    entry_data["device_settings_text_add_entities"] = async_add_entities
    entry_data.setdefault("device_settings_text_entities", {})
    entry_data.setdefault("device_settings_text_instance_entities", {})
    entities: list[FamilyHubDeviceSettingText] = []
    for device_id in shared.known_device_ids(entry_data):
        entities.extend(_build_entities_for_device(entry_data, device_id))
        for instance_id in shared.known_instance_ids(entry_data, device_id):
            entities.extend(_build_entities_for_instance(entry_data, device_id, instance_id))
    if entities:
        async_add_entities(entities)


def _build_entities_for_device(entry_data: dict[str, Any], device_id: str) -> list["FamilyHubDeviceSettingText"]:
    registry = entry_data.setdefault("device_settings_text_entities", {}).setdefault(device_id, {})
    built = []
    for key, field in TEXT_FIELDS.items():
        if key in registry:
            continue
        entity = FamilyHubDeviceSettingText(entry_data, device_id, key, field)
        registry[key] = entity
        built.append(entity)
    return built


def _build_entities_for_instance(entry_data: dict[str, Any], device_id: str, instance_id: str) -> list["FamilyHubDeviceSettingText"]:
    registry = entry_data.setdefault("device_settings_text_instance_entities", {}).setdefault(device_id, {}).setdefault(instance_id, {})
    built = []
    label = shared.instance_label_for(entry_data, device_id, instance_id)
    for key, field in INSTANCE_TEXT_FIELDS.items():
        if key in registry:
            continue
        entity = FamilyHubDeviceSettingText(entry_data, device_id, key, field, instance_id=instance_id, instance_label=label)
        registry[key] = entity
        built.append(entity)
    return built


def create_entities_for_device(entry_data: dict[str, Any], device_id: str) -> None:
    add_entities = entry_data.get("device_settings_text_add_entities")
    if add_entities is None or not TEXT_FIELDS:
        return
    entities = _build_entities_for_device(entry_data, device_id)
    if entities:
        add_entities(entities)


def create_entities_for_instance(entry_data: dict[str, Any], device_id: str, instance_id: str) -> None:
    add_entities = entry_data.get("device_settings_text_add_entities")
    if add_entities is None or not INSTANCE_TEXT_FIELDS:
        return
    entities = _build_entities_for_instance(entry_data, device_id, instance_id)
    if entities:
        add_entities(entities)


def notify_device(entry_data: dict[str, Any], device_id: str) -> None:
    registry = entry_data.get("device_settings_text_entities", {}).get(device_id, {})
    for entity in registry.values():
        shared.safe_write_ha_state(entity)


def notify_instance(entry_data: dict[str, Any], device_id: str, instance_id: str) -> None:
    registry = entry_data.get("device_settings_text_instance_entities", {}).get(device_id, {}).get(instance_id, {})
    for entity in registry.values():
        shared.safe_write_ha_state(entity)


class FamilyHubDeviceSettingText(TextEntity):
    """One per device (or, with instance_id, per dashboard/view placement
    of that device) per text-type DEVICE_SETTINGS_FIELDS entry of the
    matching scope - see this module's own docstring."""

    _attr_has_entity_name = True
    _attr_icon = "mdi:cog-outline"

    def __init__(
        self,
        entry_data: dict[str, Any],
        device_id: str,
        key: str,
        field: dict[str, Any],
        instance_id: Optional[str] = None,
        instance_label: Optional[str] = None,
    ) -> None:
        self._entry_data = entry_data
        self._device_id = device_id
        self._instance_id = instance_id
        self._key = key
        self._default = field["default"]
        suffix = f"_{instance_id}" if instance_id else ""
        self._attr_unique_id = f"family_hub_device_setting_{device_id}{suffix}_{key}"
        self._attr_name = f"{instance_label or instance_id}: {field['label']}" if instance_id else field["label"]
        self._attr_native_max = field["max_length"]
        self._attr_device_info = shared.build_device_info(device_id, shared.device_name_for(entry_data, device_id))

    @property
    def native_value(self) -> str:
        return shared.current_setting(self._entry_data, self._device_id, self._key, self._default, self._instance_id)

    async def async_set_value(self, value: str) -> None:
        await shared.async_write_setting(self._entry_data, self._device_id, self._key, value, self._instance_id)
        shared.safe_write_ha_state(self)
