"""Websocket API for the v1.133.3+ Device Settings admin dashboard -"""
from __future__ import annotations

import logging
import uuid
from typing import Any, Optional

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.util import dt as dt_util

from . import button as device_settings_button
from . import device_settings_entity_shared as shared
from . import number as device_settings_number
from . import select as device_settings_select
from . import switch as device_settings_switch
from . import text as device_settings_text
from .const import (
    DEVICE_SCOPED_SETTINGS_FIELDS,
    DEVICE_SETTINGS_EVENT_IDENTIFY,
    DEVICE_SETTINGS_EVENT_PRIVACY_PARTICIPATION_TOGGLE,
    DEVICE_SETTINGS_EVENT_PUSH,
    DEVICE_SETTINGS_EVENT_SCREENSAVER_TOGGLE,
    DEVICE_SETTINGS_FIELDS,
    DOMAIN,
    INSTANCE_SCOPED_SETTINGS_FIELDS,
)

_LOGGER = logging.getLogger(__name__)


def _get_entry(hass: HomeAssistant):
    """Local copy of __init__.py's _get_family_hub_entry - see chores_
    websocket_api.py's own module docstring for why this isn't imported
    from there instead (same import-shadowing/circularity constraint)."""
    entries = hass.config_entries.async_entries(DOMAIN)
    return entries[0] if entries else None


def _get_entry_data(hass: HomeAssistant) -> Optional[dict[str, Any]]:
    entry = _get_entry(hass)
    if entry is None:
        return None
    return hass.data.get(DOMAIN, {}).get("entries", {}).get(entry.entry_id)


def _entry_data_or_error(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg_id: Any) -> Optional[dict[str, Any]]:
    entry_data = _get_entry_data(hass)
    if entry_data is None:
        connection.send_error(msg_id, "not_found", "Family Hub is not set up")
        return None
    return entry_data


def _is_admin(connection: websocket_api.ActiveConnection) -> bool:
    return bool(connection.user and getattr(connection.user, "is_admin", False))


def _require_admin(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg_id: Any) -> Optional[dict[str, Any]]:
    """Shared admin gate for the four dashboard-management commands (list/ push/save_preset/delete_preset/apply_preset)"""
    entry_data = _entry_data_or_error(hass, connection, msg_id)
    if entry_data is None:
        return None
    if not _is_admin(connection):
        connection.send_error(msg_id, "unauthorized", "Only a Home Assistant admin can manage device settings")
        return None
    return entry_data


def _validate_against(raw: Any, fields: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Returns a cleaned {key: value} dict containing only keys recognized by `fields` with valid values, or None if `raw` isn't even a dict"""
    if not isinstance(raw, dict):
        return None
    cleaned: dict[str, Any] = {}
    for key, value in raw.items():
        field = fields.get(key)
        if field is None:
            return None
        if field["type"] == "enum":
            if value not in field["choices"]:
                return None
        elif field["type"] == "int":
            if not isinstance(value, int) or isinstance(value, bool) or value < field["min"] or value > field["max"]:
                return None
        elif field["type"] == "text":
            # Empty string is valid (familyHubDeviceCustomNameLocal's own "no override yet" default)
            if not isinstance(value, str) or len(value) > field["max_length"]:
                return None
        cleaned[key] = value
    return cleaned


def _validate_settings(raw: Any) -> Optional[dict[str, Any]]:
    """Device-scoped fields only (familyHubDeviceCustomNameLocal - see
    const.py's own "scope" comment on DEVICE_SETTINGS_FIELDS) - what
    ws_report's/ws_push's plain `settings` param means now that the
    view/layout fields moved to per-instance storage (see
    _validate_instance_settings below)."""
    return _validate_against(raw, DEVICE_SCOPED_SETTINGS_FIELDS)


def _validate_instance_settings(raw: Any) -> Optional[dict[str, Any]]:
    """Instance-scoped fields only (the Week/Month view/layout fields) -
    what ws_report's `instance_settings` and ws_push's `settings` mean when
    it carries an `instance_id` (see each command's own docstring)."""
    return _validate_against(raw, INSTANCE_SCOPED_SETTINGS_FIELDS)


def _validate_mixed_settings(raw: Any) -> Optional[dict[str, Any]]:
    """Either scope, mixed - only ws_save_preset uses this: a preset is a named bundle an admin builds once (in the admin Devices tab's own per-field controls"""
    return _validate_against(raw, DEVICE_SETTINGS_FIELDS)


def _sync_device_entities(
    hass: HomeAssistant,
    entry_data: dict[str, Any],
    device_id: str,
    is_new_device: bool,
    instance_id: Optional[str] = None,
    is_new_instance: bool = False,
) -> None:
    """Keeps the select/number/text/button entities from select.py/number.py/ text.py/button.py in step with this store - creates a new device's"""
    if is_new_device:
        device_settings_select.create_entities_for_device(entry_data, device_id)
        device_settings_number.create_entities_for_device(entry_data, device_id)
        device_settings_text.create_entities_for_device(entry_data, device_id)
        device_settings_button.create_sync_button_for_device(entry_data, device_id)
        device_settings_switch.create_entities_for_device(entry_data, device_id)
    else:
        device_settings_select.notify_device(entry_data, device_id)
        device_settings_number.notify_device(entry_data, device_id)
        device_settings_text.notify_device(entry_data, device_id)
    if not instance_id:
        return
    if is_new_instance:
        device_settings_select.create_entities_for_instance(entry_data, device_id, instance_id)
        device_settings_number.create_entities_for_instance(entry_data, device_id, instance_id)
        device_settings_text.create_entities_for_instance(entry_data, device_id, instance_id)
        device_settings_button.create_sync_button_for_instance(entry_data, device_id, instance_id)
    else:
        device_settings_select.notify_instance(entry_data, device_id, instance_id)
        device_settings_number.notify_instance(entry_data, device_id, instance_id)
        device_settings_text.notify_instance(entry_data, device_id, instance_id)


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
    record.setdefault("screensaver_enabled", True)
    # see DEVICE_SETTINGS_EVENT_PRIVACY_PARTICIPATION_TOGGLE's own comment
    record.setdefault("privacy_participates", True)
    return record


def _instance_record(device_record: dict[str, Any], instance_id: str) -> dict[str, Any]:
    """One dashboard/view placement of the card on a device - see const.py's
    own "scope" comment on DEVICE_SETTINGS_FIELDS for why this exists
    (view/layout settings differ per dashboard, everything else stays on
    the device record above). Same create-or-return shape as _device_record
    itself, nested one level deeper."""
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


# Cosmetic-only cap on the self-reported device_name (see ws_report below)
_DEVICE_NAME_MAX_LEN = 80


# -------------------------------------------------------------------------- Every signed-in device (not admin-gated


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/device_settings/report",
        vol.Required("device_id"): str,
        vol.Required("settings"): dict,
        vol.Optional("device_name"): str,
        # the same card can be embedded on more than one Lovelace dashboard/view on one physical device
        vol.Optional("instance_id"): str,
        vol.Optional("instance_settings"): dict,
        vol.Optional("instance_label"): str,
        vol.Optional("is_kiosk_account"): bool,
    }
)
@websocket_api.async_response
async def ws_report(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    device_id = msg["device_id"].strip()
    if not device_id:
        connection.send_error(msg["id"], "invalid_format", "device_id must be non-empty")
        return
    cleaned = _validate_settings(msg["settings"])
    if cleaned is None:
        connection.send_error(msg["id"], "invalid_format", "settings contained an unrecognized key or invalid value")
        return
    instance_id = (msg.get("instance_id") or "").strip()
    cleaned_instance = None
    if instance_id:
        cleaned_instance = _validate_instance_settings(msg.get("instance_settings") or {})
        if cleaned_instance is None:
            connection.send_error(msg["id"], "invalid_format", "instance_settings contained an unrecognized key or invalid value")
            return
    blob = entry_data["device_settings"]
    is_new_device = device_id not in blob["devices"]
    record = _device_record(blob["devices"], device_id)
    if bool(msg.get("is_kiosk_account")) and "privacy_participates" not in record:
        record["privacy_participates"] = True
    record["settings"] = cleaned
    record["last_seen"] = dt_util.utcnow().isoformat()
    # Cosmetic only - see this field's own note on _device_record/ _DEVICE_NAME_MAX_LEN above.
    device_name = (msg.get("device_name") or "").strip()
    if device_name:
        record["device_name"] = device_name[:_DEVICE_NAME_MAX_LEN]
    is_new_instance = False
    if instance_id:
        is_new_instance = instance_id not in record["instances"]
        instance_record = _instance_record(record, instance_id)
        instance_record["settings"] = cleaned_instance
        instance_record["last_seen"] = dt_util.utcnow().isoformat()
        instance_label = (msg.get("instance_label") or "").strip()
        if instance_label:
            instance_record["instance_label"] = instance_label[:_DEVICE_NAME_MAX_LEN]
    await entry_data["device_settings_store"].async_save(blob)
    _sync_device_entities(hass, entry_data, device_id, is_new_device, instance_id or None, is_new_instance)
    # lets a device that was closed/asleep when an admin or automation flipped its screensaver switch learn the right value the next time it
    connection.send_result(
        msg["id"],
        {
            "screensaver_enabled": record.get("screensaver_enabled", True),
            "privacy_participates": record.get("privacy_participates", True),
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/device_settings/get_pending",
        vol.Required("device_id"): str,
        vol.Optional("instance_id"): str,
    }
)
@websocket_api.async_response
async def ws_get_pending(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Catch-up check for both scopes at once when `instance_id` is given - the response keeps its original flat {seq, settings} shape"""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    device_id = msg["device_id"].strip()
    devices = entry_data["device_settings"]["devices"]
    record = devices.get(device_id) if isinstance(devices, dict) else None
    if not isinstance(record, dict):
        result: dict[str, Any] = {"seq": 0, "settings": None}
        if msg.get("instance_id"):
            result["instance"] = None
        connection.send_result(msg["id"], result)
        return
    result = {"seq": record.get("pending_seq", 0), "settings": record.get("pending_settings")}
    instance_id = (msg.get("instance_id") or "").strip()
    if instance_id:
        instances = record.get("instances")
        instance_record = instances.get(instance_id) if isinstance(instances, dict) else None
        result["instance"] = (
            {"seq": instance_record.get("pending_seq", 0), "settings": instance_record.get("pending_settings")}
            if isinstance(instance_record, dict)
            else None
        )
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command({vol.Required("type"): "family_hub/device_settings/subscribe_push"})
@websocket_api.async_response
async def ws_subscribe_push(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Live half of the push sync for every signed-in device (not
    admin-gated - same "every signed-in device" gate as ws_report/
    ws_get_pending above), delivered through a dedicated command rather
    than Home Assistant's generic `subscribe_events` websocket command.

    The generic command refuses a non-admin connection.user for any event
    type outside its own small built-in allowlist (state_changed and a
    handful of others) - see homeassistant.auth.permissions.events.
    SUBSCRIBE_ALLOWLIST - so a device signed in as a non-admin Home
    Assistant user (a restricted account set up specifically for a wall-
    mounted kiosk display, for instance) could never subscribe to
    DEVICE_SETTINGS_EVENT_PUSH at all: the frontend's subscribeEvents()
    call raised Unauthorized immediately and the card's own try/catch
    around it (see the card's own docstring on why a failed subscribe is
    never fatal) swallowed it silently, so that device only ever picked
    up a push on its own next full page reload, via ws_get_pending's
    catch-up check - never live while the dashboard stayed open.

    A command this integration defines itself is not subject to that
    generic command's allowlist - only what this handler itself checks,
    which for every-signed-in-device commands here is nothing beyond
    "Family Hub is set up." Forwards just `event.data` (device_id, seq,
    settings), not the full Event envelope - nothing downstream needs the
    Event object's own time_fired/origin/context. Forwards EVERY push
    event to every subscribed connection, same as the generic command
    would have - "is this push for MY device_id" stays a client-side
    filter (see the card's own _subscribeDeviceSettingsPush), unchanged
    from before this command existed."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return

    @callback
    def forward_event(event) -> None:
        connection.send_message(websocket_api.event_message(msg["id"], event.data))

    connection.subscriptions[msg["id"]] = hass.bus.async_listen(DEVICE_SETTINGS_EVENT_PUSH, forward_event)
    connection.send_result(msg["id"])


@websocket_api.websocket_command({vol.Required("type"): "family_hub/device_settings/subscribe_identify"})
@websocket_api.async_response
async def ws_subscribe_identify(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Live Identify subscription for every signed-in device - see ws_subscribe_push's own docstring above for why this needs its own command rather than the generic"""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return

    @callback
    def forward_event(event) -> None:
        connection.send_message(websocket_api.event_message(msg["id"], event.data))

    connection.subscriptions[msg["id"]] = hass.bus.async_listen(DEVICE_SETTINGS_EVENT_IDENTIFY, forward_event)
    connection.send_result(msg["id"])


@websocket_api.websocket_command({vol.Required("type"): "family_hub/device_settings/subscribe_screensaver_toggle"})
@websocket_api.async_response
async def ws_subscribe_screensaver_toggle(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Live screensaver-toggle subscription for every signed-in device -
    same "own command, not the generic subscribe_events one" reasoning as
    ws_subscribe_push/ws_subscribe_identify above. No get_pending-style
    catch-up counterpart either (same as Identify) - a device that missed
    the live event picks up the current value on its own next ws_report
    instead (see that command's own docstring)."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return

    @callback
    def forward_event(event) -> None:
        connection.send_message(websocket_api.event_message(msg["id"], event.data))

    connection.subscriptions[msg["id"]] = hass.bus.async_listen(DEVICE_SETTINGS_EVENT_SCREENSAVER_TOGGLE, forward_event)
    connection.send_result(msg["id"])


@websocket_api.websocket_command({vol.Required("type"): "family_hub/device_settings/subscribe_privacy_participation_toggle"})
@websocket_api.async_response
async def ws_subscribe_privacy_participation_toggle(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Live per-device Privacy Mode participation subscription - mirrors
    ws_subscribe_screensaver_toggle exactly, same no-get_pending shape (a
    device that missed the live event picks up the current value on its
    own next ws_report)."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return

    @callback
    def forward_event(event) -> None:
        connection.send_message(websocket_api.event_message(msg["id"], event.data))

    connection.subscriptions[msg["id"]] = hass.bus.async_listen(DEVICE_SETTINGS_EVENT_PRIVACY_PARTICIPATION_TOGGLE, forward_event)
    connection.send_result(msg["id"])


# -------------------------------------------------------------------------- Admin-only dashboard management


@websocket_api.websocket_command({vol.Required("type"): "family_hub/device_settings/list"})
@websocket_api.async_response
async def ws_list(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _require_admin(hass, connection, msg["id"])
    if entry_data is None:
        return
    blob = entry_data["device_settings"]
    connection.send_result(msg["id"], {"devices": blob["devices"], "presets": blob["presets"], "fields": DEVICE_SETTINGS_FIELDS})


def _push_settings(hass: HomeAssistant, entry_data: dict[str, Any], device_id: str, settings: dict[str, Any]) -> int:
    """Shared by ws_push and ws_apply_preset - stages `settings` as the device's pending push"""
    blob = entry_data["device_settings"]
    is_new_device = device_id not in blob["devices"]
    record = _device_record(blob["devices"], device_id)
    new_seq = int(record.get("pending_seq", 0)) + 1
    record["pending_seq"] = new_seq
    record["pending_settings"] = settings
    record["settings"] = {**record.get("settings", {}), **settings}
    hass.bus.async_fire(DEVICE_SETTINGS_EVENT_PUSH, {"device_id": device_id, "seq": new_seq, "settings": settings})
    _sync_device_entities(hass, entry_data, device_id, is_new_device)
    return new_seq


def _push_instance_settings(hass: HomeAssistant, entry_data: dict[str, Any], device_id: str, instance_id: str, settings: dict[str, Any]) -> int:
    """Instance-scoped counterpart to _push_settings above - same staging/ mirroring/live-event shape, just one level deeper"""
    blob = entry_data["device_settings"]
    is_new_device = device_id not in blob["devices"]
    device_record = _device_record(blob["devices"], device_id)
    is_new_instance = instance_id not in device_record["instances"]
    instance_record = _instance_record(device_record, instance_id)
    new_seq = int(instance_record.get("pending_seq", 0)) + 1
    instance_record["pending_seq"] = new_seq
    instance_record["pending_settings"] = settings
    instance_record["settings"] = {**instance_record.get("settings", {}), **settings}
    hass.bus.async_fire(
        DEVICE_SETTINGS_EVENT_PUSH,
        {"device_id": device_id, "instance_id": instance_id, "seq": new_seq, "settings": settings},
    )
    _sync_device_entities(hass, entry_data, device_id, is_new_device, instance_id, is_new_instance)
    return new_seq


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/device_settings/push",
        vol.Required("device_id"): str,
        vol.Required("settings"): dict,
        # when given, `settings` targets that one dashboard/view instance's own view/layout fields
        vol.Optional("instance_id"): str,
    }
)
@websocket_api.async_response
async def ws_push(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _require_admin(hass, connection, msg["id"])
    if entry_data is None:
        return
    device_id = msg["device_id"].strip()
    if not device_id:
        connection.send_error(msg["id"], "invalid_format", "device_id must be non-empty")
        return
    instance_id = (msg.get("instance_id") or "").strip()
    if instance_id:
        cleaned = _validate_instance_settings(msg["settings"])
    else:
        cleaned = _validate_settings(msg["settings"])
    if cleaned is None:
        connection.send_error(msg["id"], "invalid_format", "settings contained an unrecognized key or invalid value")
        return
    if instance_id:
        seq = _push_instance_settings(hass, entry_data, device_id, instance_id, cleaned)
    else:
        seq = _push_settings(hass, entry_data, device_id, cleaned)
    await entry_data["device_settings_store"].async_save(entry_data["device_settings"])
    connection.send_result(msg["id"], {"seq": seq})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/device_settings/set_screensaver_enabled",
        vol.Required("device_id"): str,
        vol.Required("enabled"): bool,
    }
)
@websocket_api.async_response
async def ws_set_screensaver_enabled(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """The admin Devices tab's own screensaver toggle control - household
    ask: "I want the screensaver to have a toggle per device shown in the
    same device tab." Admin-only, same gate as ws_push/ws_identify above.
    Unlike ws_push, this takes effect immediately (see shared.
    async_set_screensaver_enabled's own docstring) - there's no separate
    Push/Sync step for this field, by design."""
    entry_data = _require_admin(hass, connection, msg["id"])
    if entry_data is None:
        return
    device_id = msg["device_id"].strip()
    if not device_id:
        connection.send_error(msg["id"], "invalid_format", "device_id must be non-empty")
        return
    await shared.async_set_screensaver_enabled(hass, entry_data, device_id, msg["enabled"])
    device_settings_switch.notify_device(entry_data, device_id)
    connection.send_result(msg["id"], {"screensaver_enabled": msg["enabled"]})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/device_settings/set_privacy_participates",
        vol.Required("device_id"): str,
        vol.Required("enabled"): bool,
    }
)
@websocket_api.async_response
async def ws_set_privacy_participates(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """The admin Devices tab's own per-device Privacy Mode participation toggle - household ask"""
    entry_data = _require_admin(hass, connection, msg["id"])
    if entry_data is None:
        return
    device_id = msg["device_id"].strip()
    if not device_id:
        connection.send_error(msg["id"], "invalid_format", "device_id must be non-empty")
        return
    await shared.async_set_privacy_participates(hass, entry_data, device_id, msg["enabled"])
    device_settings_switch.notify_device_privacy_participates(entry_data, device_id)
    connection.send_result(msg["id"], {"privacy_participates": msg["enabled"]})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/device_settings/save_preset",
        vol.Required("name"): str,
        vol.Required("settings"): dict,
        vol.Optional("preset_id"): str,
    }
)
@websocket_api.async_response
async def ws_save_preset(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Creates a new preset, or (when preset_id names an existing one) overwrites it in place - the card's own Save button uses the same command for both"""
    entry_data = _require_admin(hass, connection, msg["id"])
    if entry_data is None:
        return
    name = msg["name"].strip()
    if not name:
        connection.send_error(msg["id"], "invalid_format", "name must be non-empty")
        return
    cleaned = _validate_mixed_settings(msg["settings"])
    if cleaned is None:
        connection.send_error(msg["id"], "invalid_format", "settings contained an unrecognized key or invalid value")
        return
    blob = entry_data["device_settings"]
    preset_id = msg.get("preset_id") or uuid.uuid4().hex
    existing = blob["presets"].get(preset_id) if isinstance(blob["presets"].get(preset_id), dict) else None
    blob["presets"][preset_id] = {
        "name": name,
        "settings": cleaned,
        "created": (existing or {}).get("created") or dt_util.utcnow().isoformat(),
    }
    await entry_data["device_settings_store"].async_save(blob)
    connection.send_result(msg["id"], {"preset_id": preset_id})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/device_settings/delete_preset",
        vol.Required("preset_id"): str,
    }
)
@websocket_api.async_response
async def ws_delete_preset(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _require_admin(hass, connection, msg["id"])
    if entry_data is None:
        return
    blob = entry_data["device_settings"]
    blob["presets"].pop(msg["preset_id"], None)
    await entry_data["device_settings_store"].async_save(blob)
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/device_settings/apply_preset",
        vol.Required("preset_id"): str,
        vol.Required("device_id"): str,
        # a preset can carry both device- and instance-scoped fields at once (ws_save_preset validates against the full mixed registry
        vol.Optional("instance_id"): str,
    }
)
@websocket_api.async_response
async def ws_apply_preset(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Splits the preset's own (possibly mixed-scope) settings dict by scope"""
    entry_data = _require_admin(hass, connection, msg["id"])
    if entry_data is None:
        return
    blob = entry_data["device_settings"]
    preset = blob["presets"].get(msg["preset_id"])
    if not isinstance(preset, dict):
        connection.send_error(msg["id"], "not_found", "No preset with that id")
        return
    device_id = msg["device_id"].strip()
    if not device_id:
        connection.send_error(msg["id"], "invalid_format", "device_id must be non-empty")
        return
    preset_settings = dict(preset.get("settings") or {})
    device_part = {k: v for k, v in preset_settings.items() if k in DEVICE_SCOPED_SETTINGS_FIELDS}
    instance_part = {k: v for k, v in preset_settings.items() if k in INSTANCE_SCOPED_SETTINGS_FIELDS}
    seq = _push_settings(hass, entry_data, device_id, device_part)
    instance_id = (msg.get("instance_id") or "").strip()
    instance_seq = None
    if instance_id and instance_part:
        instance_seq = _push_instance_settings(hass, entry_data, device_id, instance_id, instance_part)
    await entry_data["device_settings_store"].async_save(blob)
    result = {"seq": seq}
    if instance_seq is not None:
        result["instance_seq"] = instance_seq
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/device_settings/identify",
        vol.Required("device_id"): str,
    }
)
@websocket_api.async_response
async def ws_identify(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Fires DEVICE_SETTINGS_EVENT_IDENTIFY for one device_id - see that constant's own comment in const.py for why this deliberately never touches device_settings"""
    entry_data = _require_admin(hass, connection, msg["id"])
    if entry_data is None:
        return
    device_id = msg["device_id"].strip()
    if not device_id:
        connection.send_error(msg["id"], "invalid_format", "device_id must be non-empty")
        return
    hass.bus.async_fire(DEVICE_SETTINGS_EVENT_IDENTIFY, {"device_id": device_id})
    connection.send_result(msg["id"], {})


ALL_COMMANDS = (
    ws_report,
    ws_get_pending,
    ws_subscribe_push,
    ws_subscribe_identify,
    ws_subscribe_screensaver_toggle,
    ws_subscribe_privacy_participation_toggle,
    ws_list,
    ws_push,
    ws_set_screensaver_enabled,
    ws_set_privacy_participates,
    ws_save_preset,
    ws_delete_preset,
    ws_apply_preset,
    ws_identify,
)


def async_register_all(hass: HomeAssistant) -> None:
    """Called once from __init__.py's async_setup, same pattern as chores_
    websocket_api.py's own async_register_all."""
    for command in ALL_COMMANDS:
        websocket_api.async_register_command(hass, command)
