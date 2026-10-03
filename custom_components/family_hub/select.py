"""select platform: one select entity per Family Hub device per "enum"-type
DEVICE_SETTINGS_FIELDS entry (see that registry in const.py) - the native-
HA-entity half of the Device Settings feature (see device_settings_entity_
shared.py's own module docstring for the full picture, and button.py's
Sync buttons for how a changed value actually reaches a device).

An enum field is either device-scoped (ENUM_FIELDS) or instance-scoped
(INSTANCE_ENUM_FIELDS - the Week/Month view-shape toggles), see const.py's
own "scope" comment. ENUM_FIELDS is currently empty - familyHubDevice
CustomNameLocal, the only remaining device-scoped field, is a "text" type,
not an enum - so this platform creates no device-scoped select entities
right now; it stays here rather than being deleted so a future device-
scoped enum field needs no new platform to show up in. FamilyHubDevice
SettingSelect covers both scopes: instance_id omitted for a device-scoped
field, given for an instance-scoped one - see device_settings_entity_
shared.py's own module docstring for what that changes.

Entities are created per DEVICE (and, for instance-scoped fields, per
INSTANCE of that device), not pre-declared - a Family Hub device_id or
instance_id only exists once something has reported in via device_
settings_websocket_api.py's ws_report, which is also where a brand-new
device's or instance's full set of settings entities (this platform plus
number.py/text.py/button.py) gets created, mirroring sensor.py's own
"created dynamically, not pre-declared" shape for per-timer entities.

Self-contained like sensor.py/button.py: no imports from `.` (the package
__init__.py), so it has no circular-import exposure and is forwarded the
same way (hass.config_entries.async_forward_entry_setups(entry, ["select"])).
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from . import device_settings_entity_shared as shared
from .const import DEVICE_SETTINGS_FIELDS, DOMAIN

_LOGGER = logging.getLogger(__name__)

ENUM_FIELDS = {key: field for key, field in DEVICE_SETTINGS_FIELDS.items() if field["type"] == "enum" and field.get("scope") == "device"}
INSTANCE_ENUM_FIELDS = {key: field for key, field in DEVICE_SETTINGS_FIELDS.items() if field["type"] == "enum" and field.get("scope") == "instance"}


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    entry_data = hass.data.get(DOMAIN, {}).get("entries", {}).get(entry.entry_id)
    if entry_data is None:
        _LOGGER.warning("Family Hub: select platform set up before the integration's own entry data existed - skipping")
        return
    entry_data["device_settings_select_add_entities"] = async_add_entities
    entry_data.setdefault("device_settings_select_entities", {})
    entry_data.setdefault("device_settings_select_instance_entities", {})
    entities: list[FamilyHubDeviceSettingSelect] = []
    for device_id in shared.known_device_ids(entry_data):
        entities.extend(_build_entities_for_device(entry_data, device_id))
        for instance_id in shared.known_instance_ids(entry_data, device_id):
            entities.extend(_build_entities_for_instance(entry_data, device_id, instance_id))
    if entities:
        async_add_entities(entities)


def _build_entities_for_device(entry_data: dict[str, Any], device_id: str) -> list["FamilyHubDeviceSettingSelect"]:
    registry = entry_data.setdefault("device_settings_select_entities", {}).setdefault(device_id, {})
    built = []
    for key, field in ENUM_FIELDS.items():
        if key in registry:
            continue
        entity = FamilyHubDeviceSettingSelect(entry_data, device_id, key, field)
        registry[key] = entity
        built.append(entity)
    return built


def _build_entities_for_instance(entry_data: dict[str, Any], device_id: str, instance_id: str) -> list["FamilyHubDeviceSettingSelect"]:
    registry = entry_data.setdefault("device_settings_select_instance_entities", {}).setdefault(device_id, {}).setdefault(instance_id, {})
    built = []
    label = shared.instance_label_for(entry_data, device_id, instance_id)
    for key, field in INSTANCE_ENUM_FIELDS.items():
        if key in registry:
            continue
        entity = FamilyHubDeviceSettingSelect(entry_data, device_id, key, field, instance_id=instance_id, instance_label=label)
        registry[key] = entity
        built.append(entity)
    return built


def create_entities_for_device(entry_data: dict[str, Any], device_id: str) -> None:
    """Called from device_settings_websocket_api.py the first time a
    device_id reports in. Best-effort/silent if this platform hasn't
    finished loading yet, same accepted limitation sensor.py's own
    create_timer_sensor documents for the very-first-setup ordering
    window."""
    add_entities = entry_data.get("device_settings_select_add_entities")
    if add_entities is None or not ENUM_FIELDS:
        return
    entities = _build_entities_for_device(entry_data, device_id)
    if entities:
        add_entities(entities)


def create_entities_for_instance(entry_data: dict[str, Any], device_id: str, instance_id: str) -> None:
    """Same as create_entities_for_device, for the first report of one
    dashboard/view placement (instance_id) of a device."""
    add_entities = entry_data.get("device_settings_select_add_entities")
    if add_entities is None or not INSTANCE_ENUM_FIELDS:
        return
    entities = _build_entities_for_instance(entry_data, device_id, instance_id)
    if entities:
        add_entities(entities)


def notify_device(entry_data: dict[str, Any], device_id: str) -> None:
    """Called after a device's settings changed by some other means (its
    own ws_report, or an admin dashboard push/apply_preset) so this
    device's already-created select entities reflect the new values
    promptly rather than waiting for HA's own next poll."""
    registry = entry_data.get("device_settings_select_entities", {}).get(device_id, {})
    for entity in registry.values():
        shared.safe_write_ha_state(entity)


def notify_instance(entry_data: dict[str, Any], device_id: str, instance_id: str) -> None:
    registry = entry_data.get("device_settings_select_instance_entities", {}).get(device_id, {}).get(instance_id, {})
    for entity in registry.values():
        shared.safe_write_ha_state(entity)


class FamilyHubDeviceSettingSelect(SelectEntity):
    """One per device (or, with instance_id, per dashboard/view placement
    of that device) per enum-type DEVICE_SETTINGS_FIELDS entry of the
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
        self._attr_options = list(field["choices"])
        self._attr_device_info = shared.build_device_info(device_id, shared.device_name_for(entry_data, device_id))

    @property
    def current_option(self) -> str:
        return shared.current_setting(self._entry_data, self._device_id, self._key, self._default, self._instance_id)

    async def async_select_option(self, option: str) -> None:
        await shared.async_write_setting(self._entry_data, self._device_id, self._key, option, self._instance_id)
        shared.safe_write_ha_state(self)
