"""Shared helpers for the per-device settings entity platforms (select.py,
number.py, text.py) and the Sync button(s) in button.py - together these
expose the existing Device Settings admin backend (see device_settings_
websocket_api.py's own module docstring for the storage shape and the
admin dashboard commands this mirrors) as native Home Assistant entities,
so any automation, script, or other integration can read or change a
Family Hub device's settings using HA's own select.select_option/number.
set_value/text.set_value/button.press services, with no custom websocket
call required.

v1.139.0+: a Family Hub device's settings split into two scopes (see
const.py's own "scope" comment on DEVICE_SETTINGS_FIELDS) - DEVICE-scoped
fields (the physical screen's own identity: its custom name, the Daily
Digest button toggle) live on the device record itself, same as before;
INSTANCE-scoped fields (the Week/Month view/layout fields) live one level
deeper, one settings dict per dashboard/view the card is embedded on (see
the card's own _getCardInstanceId). Every entity function below takes an
optional `instance_id` - omitted (None), it reads/writes the device-level
settings dict exactly as this module always has; given, it reads/writes
that one instance's own settings dict instead. Every entity for one
Family Hub device - device-scoped AND every instance's own - is still
grouped under the SAME Home Assistant device-registry entry via DeviceInfo
(one physical screen is still one HA device, however many dashboards are
embedded on it); an instance's own entities are told apart by their name
being prefixed with that instance's own label.

Writing a settings entity (select_option/set_native_value/set_value) stores
the new value directly into the target settings dict (device- or instance-
level) and persists it immediately, so reading the entity back afterward
(from this integration or any automation) always reflects what was just
set. It deliberately does NOT push anything to the device itself - no
pending_seq bump, no live DEVICE_SETTINGS_EVENT_PUSH. Only a Sync button
(button.py's FamilyHubDeviceSyncButton for the device scope, FamilyHubDevice
InstanceSyncButton for one instance) stages and live-broadcasts that
scope's current settings, the same effect device_settings_websocket_api.py's
own _push_settings/_push_instance_settings has for the admin dashboard's
own Push action. This two-step shape lets several settings entities be
changed in one automation run and finish with a single Sync press, rather
than pushing to the device once per changed field.

Deliberately self-contained like device_settings_websocket_api.py itself
(no import of `.`'s own __init__.py, only `.const`) - a local copy of the
small device/instance-record and push helpers that module also defines, so
neither file has to import the other or agree on load order. See that
module's own _get_entry docstring for the same reasoning applied there.
"""
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
    # see DEVICE_SETTINGS_EVENT_SCREENSAVER_TOGGLE's own comment in const.py
    # - True (screensaver stays whatever the household's own screenSaver
    # settings already say) is the only default that doesn't silently
    # disable every existing household's screensaver the moment this field
    # was introduced.
    record.setdefault("screensaver_enabled", True)
    # see DEVICE_SETTINGS_EVENT_PRIVACY_PARTICIPATION_TOGGLE's own comment
    # in const.py - True (this device keeps participating in the
    # household's single privacy_mode flag) is the only default that
    # doesn't silently exempt every existing household's devices the
    # moment this field was introduced.
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
    """Stages and live-broadcasts the current settings snapshot for one
    scope - the device itself (instance_id omitted) or one of its
    instances - used by the matching Sync button. Functionally the same
    effect as device_settings_websocket_api.py's own _push_settings/
    _push_instance_settings, except it snapshots whatever's already
    current (kept up to date by async_write_setting above) instead of
    merging in a caller-supplied settings argument - there's nothing left
    to merge, the entities already hold whatever should be pushed. Returns
    the new seq. The live event always carries a device_id; instance_id is
    only included when this push targets one, so a device-scope push's
    payload shape is unchanged from before instances existed."""
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
    """The one shared write path for the screensaver toggle - called
    directly by FamilyHubDeviceScreenSaverSwitch's own async_turn_on/
    async_turn_off (an automation flipping the switch needs no admin
    dashboard involved at all) AND by device_settings_websocket_api.py's
    ws_set_screensaver_enabled (the admin Devices tab's own toggle control).
    Unlike async_write_setting above, this ALWAYS fires the live event
    immediately - there is no staged/Sync-button step for this field, since
    "automations can control screen saver" only makes sense if flipping it
    takes effect right away."""
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
    """The one shared write path for the per-device Privacy Mode
    participation toggle - called directly by
    FamilyHubDevicePrivacyParticipatesSwitch's own async_turn_on/
    async_turn_off AND by device_settings_websocket_api.py's
    ws_set_privacy_participates (the admin Devices tab's own toggle
    control). Same "always fires immediately, no Sync step" shape as
    async_set_screensaver_enabled above."""
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
