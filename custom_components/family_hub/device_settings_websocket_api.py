"""Websocket API for the v1.133.3+ Device Settings admin dashboard -


Named device_settings_websocket_api.py, NOT websocket_api.py, for the exact
same import-shadowing reason chores_websocket_api.py's own module docstring
explains at length - don't rename it to that.

Deliberately self-contained otherwise (mirrors chores_websocket_api.py's own
"nothing here imports from `.`'s __init__.py" convention) so it can be unit
tested without loading __init__.py.

Every setting this manages (see const.py's DEVICE_SETTINGS_FIELDS) lives in
one specific dashboard's own browser localStorage and always has - this
store is a mirror/staging area the admin dashboard reads from and pushes
into, never the source of truth a device itself relies on to render (see
const.py's own module comment for the full picture). Concretely:

  - ws_report: any signed-in device calls this on load (and after any local
    Settings save) to upload its own current values - this is how the admin
    dashboard's device list has anything to show at all, and where "save
    THIS device's current settings as a new preset" gets its data from.
    Also carries an optional, purely cosmetic `device_name` (a browser/OS
    guess like "Chrome-Windows" the card derives from its own
    navigator.userAgent) - stored alongside `settings` but NOT part of
    DEVICE_SETTINGS_FIELDS/_validate_settings, since it's display sugar for
    the admin tab's row headings (household ask: raw device ids alone were
    "kind of difficult" to tell apart), never a managed/pushable setting.
  - ws_get_pending: any signed-in device calls this on load to ask "has an
    admin pushed me something since I last checked?" - compares against the
    seq number the device itself remembers having already applied (see the
    card's own familyHubDeviceSettingsAppliedSeqLocal). Covers the device
    being closed/asleep at push time - ws_push below ALSO fires a live bus
    event for whichever devices happen to be open right now, but this is
    the backstop that makes the sync eventually-consistent regardless.
  - ws_list / ws_push / ws_save_preset / ws_delete_preset / ws_apply_preset /
    ws_identify: admin-only (a real hass.user.is_admin account - same
    baseline every other admin-gated command in this project uses, see
    chores_websocket_api.py's _is_admin) management of the dashboard
    itself. ws_identify is the odd one out: it never touches this store at
    all (see DEVICE_SETTINGS_EVENT_IDENTIFY's own comment in const.py) - it
    just fires a live-only bus event telling one specific device to pop an
    on-screen modal naming itself, so an admin who can't tell two tablets
    apart from their rows alone can click Identify and go look.

Every value written here (a device's own report, or an admin's push/preset)
is validated against DEVICE_SETTINGS_FIELDS - an unrecognized key or an
out-of-range/wrong-type value is rejected outright rather than silently
dropped or clamped, so a typo'd or forged websocket call can't quietly
corrupt what the admin dashboard shows or plant a bad value on a device.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any, Optional

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from .const import (
    DEVICE_SETTINGS_EVENT_IDENTIFY,
    DEVICE_SETTINGS_EVENT_PUSH,
    DEVICE_SETTINGS_FIELDS,
    DOMAIN,
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
    """Shared admin gate for the four dashboard-management commands (list/
    push/save_preset/delete_preset/apply_preset) - report and get_pending
    deliberately do NOT use this (see their own docstrings: every signed-in
    device, not just an admin's, needs to report its own settings and check
    for a pending push)."""
    entry_data = _entry_data_or_error(hass, connection, msg_id)
    if entry_data is None:
        return None
    if not _is_admin(connection):
        connection.send_error(msg_id, "unauthorized", "Only a Home Assistant admin can manage device settings")
        return None
    return entry_data


def _validate_settings(raw: Any) -> Optional[dict[str, Any]]:
    """Returns a cleaned {key: value} dict containing only recognized
    DEVICE_SETTINGS_FIELDS keys with valid values, or None if `raw` isn't
    even a dict, or if it contains an unrecognized key or an invalid value
    for a recognized one - deliberately all-or-nothing (like CHORE_
    PERMISSIONS-backed schemas elsewhere in this project) rather than
    silently dropping/clamping the bad entries, so a caller always gets a
    clear rejection instead of a partially-applied result."""
    if not isinstance(raw, dict):
        return None
    cleaned: dict[str, Any] = {}
    for key, value in raw.items():
        field = DEVICE_SETTINGS_FIELDS.get(key)
        if field is None:
            return None
        if field["type"] == "enum":
            if value not in field["choices"]:
                return None
        elif field["type"] == "int":
            if not isinstance(value, int) or isinstance(value, bool) or value < field["min"] or value > field["max"]:
                return None
        cleaned[key] = value
    return cleaned


def _device_record(devices: dict[str, Any], device_id: str) -> dict[str, Any]:
    record = devices.get(device_id)
    if not isinstance(record, dict):
        record = {"settings": {}, "last_seen": None, "pending_seq": 0, "pending_settings": None, "device_name": None}
        devices[device_id] = record
    record.setdefault("settings", {})
    record.setdefault("pending_seq", 0)
    record.setdefault("pending_settings", None)
    record.setdefault("device_name", None)
    return record


# Cosmetic-only cap on the self-reported device_name (see ws_report below) -
# generous enough for any real browser/OS guess the card's own _getDeviceName
# ever produces, just a sanity ceiling against a malformed/oversized value
# rather than a meaningful validation rule (unlike DEVICE_SETTINGS_FIELDS,
# this is never fed back into a form control, so there's nothing to reject
# it FOR beyond "don't let the stored blob grow unbounded").
_DEVICE_NAME_MAX_LEN = 80


# ---------------------------------------------------------------------------
# Every signed-in device (not admin-gated - see this module's own docstring)
# ---------------------------------------------------------------------------


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/device_settings/report",
        vol.Required("device_id"): str,
        vol.Required("settings"): dict,
        vol.Optional("device_name"): str,
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
    blob = entry_data["device_settings"]
    record = _device_record(blob["devices"], device_id)
    record["settings"] = cleaned
    record["last_seen"] = dt_util.utcnow().isoformat()
    # Cosmetic only - see this field's own note on _device_record/
    # _DEVICE_NAME_MAX_LEN above. A device that never sends one (an older
    # card version, say) simply keeps whatever was last reported, so this
    # never regresses a row back to a bare id just because one report
    # happened to omit it.
    device_name = (msg.get("device_name") or "").strip()
    if device_name:
        record["device_name"] = device_name[:_DEVICE_NAME_MAX_LEN]
    await entry_data["device_settings_store"].async_save(blob)
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/device_settings/get_pending",
        vol.Required("device_id"): str,
    }
)
@websocket_api.async_response
async def ws_get_pending(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    device_id = msg["device_id"].strip()
    devices = entry_data["device_settings"]["devices"]
    record = devices.get(device_id) if isinstance(devices, dict) else None
    if not isinstance(record, dict):
        connection.send_result(msg["id"], {"seq": 0, "settings": None})
        return
    connection.send_result(
        msg["id"],
        {"seq": record.get("pending_seq", 0), "settings": record.get("pending_settings")},
    )


# ---------------------------------------------------------------------------
# Admin-only dashboard management
# ---------------------------------------------------------------------------


@websocket_api.websocket_command({vol.Required("type"): "family_hub/device_settings/list"})
@websocket_api.async_response
async def ws_list(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _require_admin(hass, connection, msg["id"])
    if entry_data is None:
        return
    blob = entry_data["device_settings"]
    connection.send_result(msg["id"], {"devices": blob["devices"], "presets": blob["presets"], "fields": DEVICE_SETTINGS_FIELDS})


def _push_settings(hass: HomeAssistant, entry_data: dict[str, Any], device_id: str, settings: dict[str, Any]) -> int:
    """Shared by ws_push and ws_apply_preset - stages `settings` as the
    device's pending push (bumping pending_seq so _applyPendingDeviceSettings
    on the card can tell "this is newer than what I already applied" even
    across a full push-settings/apply-preset mix), mirrors it into the
    dashboard's own "settings" snapshot (so the admin list shows the new
    values immediately rather than waiting for the device's own next
    ws_report to confirm it), and fires the live event for whichever device
    happens to have its dashboard open right now. Returns the new seq."""
    blob = entry_data["device_settings"]
    record = _device_record(blob["devices"], device_id)
    new_seq = int(record.get("pending_seq", 0)) + 1
    record["pending_seq"] = new_seq
    record["pending_settings"] = settings
    record["settings"] = {**record.get("settings", {}), **settings}
    hass.bus.async_fire(DEVICE_SETTINGS_EVENT_PUSH, {"device_id": device_id, "seq": new_seq, "settings": settings})
    return new_seq


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/device_settings/push",
        vol.Required("device_id"): str,
        vol.Required("settings"): dict,
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
    cleaned = _validate_settings(msg["settings"])
    if cleaned is None:
        connection.send_error(msg["id"], "invalid_format", "settings contained an unrecognized key or invalid value")
        return
    seq = _push_settings(hass, entry_data, device_id, cleaned)
    await entry_data["device_settings_store"].async_save(entry_data["device_settings"])
    connection.send_result(msg["id"], {"seq": seq})


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
    """Creates a new preset, or (when preset_id names an existing one)
    overwrites it in place - the card's own Save button uses the same
    command for both, distinguishing "new" vs "update" purely by whether a
    preset is currently selected, same idiom as this project's other
    create-or-update forms (e.g. ws_save_preset's own name field is never
    treated as a uniqueness key, so renaming an existing preset on save is
    just a normal update)."""
    entry_data = _require_admin(hass, connection, msg["id"])
    if entry_data is None:
        return
    name = msg["name"].strip()
    if not name:
        connection.send_error(msg["id"], "invalid_format", "name must be non-empty")
        return
    cleaned = _validate_settings(msg["settings"])
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
    }
)
@websocket_api.async_response
async def ws_apply_preset(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
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
    seq = _push_settings(hass, entry_data, device_id, dict(preset.get("settings") or {}))
    await entry_data["device_settings_store"].async_save(blob)
    connection.send_result(msg["id"], {"seq": seq})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/device_settings/identify",
        vol.Required("device_id"): str,
    }
)
@websocket_api.async_response
async def ws_identify(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Fires DEVICE_SETTINGS_EVENT_IDENTIFY for one device_id - see that
    constant's own comment in const.py for why this deliberately never
    touches device_settings storage (no seq, no pending push, nothing
    persisted): it's a pure live "pop a modal naming yourself" signal for
    whichever one device happens to be open right now, not a setting."""
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
    ws_list,
    ws_push,
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
