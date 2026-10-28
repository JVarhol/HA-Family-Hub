"""Shared helpers for the per-device settings entity platforms (select.py, number.py, text.py) and the Sync button(s) in button.py"""
from __future__ import annotations

from typing import Any, Optional

from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo

from .const import (
    DEVICE_SETTINGS_EVENT_PRIVACY_PARTICIPATION_TOGGLE,
    DEVICE_SETTINGS_EVENT_PUSH,
    DEVICE_SETTINGS_EVENT_SCREENSAVER_TOGGLE,
    DOMAIN,
)


def _device_record(devices: dict[str, Any], device_id: str) -> dict[str, Any]:
    record = devices.get(device_id)
    if not isinstance(record, dict):
        record = {
            "settings": {}, "last_seen": None, "pending_seq": 0, "pending_settings": None,
            "device_name": None, "instances": {}, "screensaver_enabled": True,
            "privacy_participates": True,
        }
        devices[device_id] = record
    record.setdefault("settings", {})
    record.setdefault("pending_seq", 0)
    record.setdefault("pending_settings", None)
    record.setdefault("device_name", None)
    record.setdefault("instances", {})
    # see DEVICE_SETTINGS_EVENT_SCREENSAVER_TOGGLE's own comment in const.py - True
    record.setdefault("screensaver_enabled", True)
    # see DEVICE_SETTINGS_EVENT_PRIVACY_PARTICIPATION_TOGGLE's own comment in const.py - True
    record.setdefault("privacy_participates", True)
    return record


def _instance_record(device_record: dict[str, Any], instance_id: str) -> dict[str, Any]:
    instances = device_record.setdefault("instances", {})
    record = instances.get(instance_id)
    if not isinstance(record, dict):
        record = {"settings": {}, "last_seen": None, "pending_seq": 0, "pending_settings": None, "instance_label": None}
        instances[instance_id] = record
    record.setdefault("settings", {})
    record.setdefault("pending_seq", 0)
    record.setdefault("pending_settings", None)
    record.setdefault("instance_label", None)
    return record


def known_device_ids(entry_data: dict[str, Any]) -> list[str]:
    devices = entry_data.get("device_settings", {}).get("devices", {})
    return list(devices.keys()) if isinstance(devices, dict) else []


def known_instance_ids(entry_data: dict[str, Any], device_id: str) -> list[str]:
    devices = entry_data.get("device_settings", {}).get("devices", {})
    record = devices.get(device_id) if isinstance(devices, dict) else None
    instances = record.get("instances") if isinstance(record, dict) else None
    return list(instances.keys()) if isinstance(instances, dict) else []


def device_name_for(entry_data: dict[str, Any], device_id: str) -> Optional[str]:
    devices = entry_data.get("device_settings", {}).get("devices", {})
    record = devices.get(device_id) if isinstance(devices, dict) else None
    name = record.get("device_name") if isinstance(record, dict) else None
    return name or None


def instance_label_for(entry_data: dict[str, Any], device_id: str, instance_id: str) -> Optional[str]:
    devices = entry_data.get("device_settings", {}).get("devices", {})
    record = devices.get(device_id) if isinstance(devices, dict) else None
    instances = record.get("instances") if isinstance(record, dict) else None
    instance_record = instances.get(instance_id) if isinstance(instances, dict) else None
    label = instance_record.get("instance_label") if isinstance(instance_record, dict) else None
    return label or None


def build_device_info(device_id: str, device_name: Optional[str]) -> DeviceInfo:
    return DeviceInfo(
        identifiers={(DOMAIN, device_id)},
        name=device_name or f"Family Hub Device {device_id[:8]}",
        manufacturer="Family Hub",
        model="Family Hub Device",
    )


def current_setting(entry_data: dict[str, Any], device_id: str, key: str, default: Any, instance_id: Optional[str] = None) -> Any:
    devices = entry_data.get("device_settings", {}).get("devices", {})
    record = devices.get(device_id) if isinstance(devices, dict) else None
    if not isinstance(record, dict):
        return default
    if instance_id:
        instances = record.get("instances")
        record = instances.get(instance_id) if isinstance(instances, dict) else None
        if not isinstance(record, dict):
            return default
    settings = record.get("settings")
    if isinstance(settings, dict) and key in settings:
        return settings[key]
    return default


async def async_write_setting(entry_data: dict[str, Any], device_id: str, key: str, value: Any, instance_id: Optional[str] = None) -> None:
    """The write path every settings entity (select/number/text) shares -
    see this module's own docstring for why this stops short of pushing to
    the device itself. Targets the device record's own settings dict, or
    (with instance_id) one instance's own, nested underneath it."""
    blob = entry_data["device_settings"]
    device_record = _device_record(blob["devices"], device_id)
    target = _instance_record(device_record, instance_id) if instance_id else device_record
    target["settings"] = {**target.get("settings", {}), key: value}
    await entry_data["device_settings_store"].async_save(blob)


def push_settings_to_target(hass: HomeAssistant, entry_data: dict[str, Any], device_id: str, instance_id: Optional[str] = None) -> int:
    """Stages and live-broadcasts the current settings snapshot for one scope - the device itself (instance_id omitted) or one of its instances"""
    blob = entry_data["device_settings"]
    device_record = _device_record(blob["devices"], device_id)
    target = _instance_record(device_record, instance_id) if instance_id else device_record
    settings = dict(target.get("settings") or {})
    new_seq = int(target.get("pending_seq", 0)) + 1
    target["pending_seq"] = new_seq
    target["pending_settings"] = settings
    event_data = {"device_id": device_id, "seq": new_seq, "settings": settings}
    if instance_id:
        event_data["instance_id"] = instance_id
    hass.bus.async_fire(DEVICE_SETTINGS_EVENT_PUSH, event_data)
    return new_seq


def screensaver_enabled_for(entry_data: dict[str, Any], device_id: str) -> bool:
    """Current screensaver_enabled value for one device - see
    DEVICE_SETTINGS_EVENT_SCREENSAVER_TOGGLE's own comment in const.py for
    the full picture of why this is a top-level device-record field, not a
    "settings" dict entry like every DEVICE_SETTINGS_FIELDS value."""
    devices = entry_data.get("device_settings", {}).get("devices", {})
    record = devices.get(device_id) if isinstance(devices, dict) else None
    if not isinstance(record, dict) or "screensaver_enabled" not in record:
        return True
    return bool(record["screensaver_enabled"])


async def async_set_screensaver_enabled(hass: HomeAssistant, entry_data: dict[str, Any], device_id: str, enabled: bool) -> None:
    """The one shared write path for the screensaver toggle - called directly by FamilyHubDeviceScreenSaverSwitch's own async_turn_on/ async_turn_off"""
    blob = entry_data["device_settings"]
    record = _device_record(blob["devices"], device_id)
    record["screensaver_enabled"] = bool(enabled)
    await entry_data["device_settings_store"].async_save(blob)
    hass.bus.async_fire(DEVICE_SETTINGS_EVENT_SCREENSAVER_TOGGLE, {"device_id": device_id, "enabled": bool(enabled)})


def privacy_participates_for(entry_data: dict[str, Any], device_id: str) -> bool:
    """Current privacy_participates value for one device - see
    DEVICE_SETTINGS_EVENT_PRIVACY_PARTICIPATION_TOGGLE's own comment in
    const.py. Mirrors screensaver_enabled_for above exactly."""
    devices = entry_data.get("device_settings", {}).get("devices", {})
    record = devices.get(device_id) if isinstance(devices, dict) else None
    if not isinstance(record, dict) or "privacy_participates" not in record:
        return True
    return bool(record["privacy_participates"])


async def async_set_privacy_participates(hass: HomeAssistant, entry_data: dict[str, Any], device_id: str, enabled: bool) -> None:
    """The one shared write path for the per-device Privacy Mode participation toggle"""
    blob = entry_data["device_settings"]
    record = _device_record(blob["devices"], device_id)
    record["privacy_participates"] = bool(enabled)
    await entry_data["device_settings_store"].async_save(blob)
    hass.bus.async_fire(DEVICE_SETTINGS_EVENT_PRIVACY_PARTICIPATION_TOGGLE, {"device_id": device_id, "enabled": bool(enabled)})


def safe_write_ha_state(entity: Any) -> None:
    """Best-effort async_write_ha_state - a no-op for an entity never
    actually added to a platform (unit tests, or the narrow first-load-
    ordering window sensor.py's own create_timer_sensor already documents),
    same defensive shape as sensor.py's remove_timer_sensor."""
    hass = getattr(entity, "hass", None)
    write = getattr(entity, "async_write_ha_state", None)
    if hass is not None and callable(write):
        write()
