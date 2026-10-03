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
  - ws_subscribe_push / ws_subscribe_identify: any signed-in device's live
    counterpart to ws_get_pending above - forwards DEVICE_SETTINGS_EVENT_
    PUSH/_IDENTIFY to the calling connection via hass.bus.async_listen,
    same as Home Assistant's own built-in `subscribe_events` websocket
    command would, except NOT restricted to admin connections. The generic
    `subscribe_events` command refuses a non-admin connection.user for any
    event type outside its own small built-in allowlist (see
    homeassistant.auth.permissions.events.SUBSCRIBE_ALLOWLIST), so a
    device signed in as a non-admin Home Assistant user could never
    receive a live push or identify at all - only ever catching up on
    page reload via ws_get_pending (identify has no such catch-up, so it
    silently never worked there before these two commands existed).
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

v1.139.0+: a device record can also hold one or more "instances" nested
under it (record["instances"][instance_id]) - one per dashboard/view the
card is embedded on for that device (see the card's own
_getCardInstanceId), each with the same {settings, last_seen, pending_seq,
pending_settings} shape as the device record itself, plus a cosmetic
instance_label. This exists because DEVICE_SETTINGS_FIELDS' view/layout
fields (Week/Month variant, day count, rows, timeline, current-day-first,
small-screen mode) are now "instance"-scoped (see const.py's own "scope"
comment) rather than shared for the whole physical device - a household
can embed the same card on more than one dashboard on one tablet and want
a different layout on each. ws_report/ws_push/ws_get_pending each grew an
optional instance_id (and, for report, instance_settings/instance_label)
that route to a device's own top-level fields when omitted, or to that one
instance's nested record when given - see each command's own docstring.
"""
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


def _validate_against(raw: Any, fields: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Returns a cleaned {key: value} dict containing only keys recognized
    by `fields` with valid values, or None if `raw` isn't even a dict, or
    if it contains a key `fields` doesn't recognize or an invalid value for
    a recognized one - deliberately all-or-nothing (like CHORE_PERMISSIONS-
    backed schemas elsewhere in this project) rather than silently
    dropping/clamping the bad entries, so a caller always gets a clear
    rejection instead of a partially-applied result. The three thin
    wrappers below just fix which slice of DEVICE_SETTINGS_FIELDS `fields`
    is - see each one's own docstring for which callers use it and why."""
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
            # Empty string is valid (familyHubDeviceCustomNameLocal's own
            # "no override yet" default) - only a non-str value or one
            # over max_length is rejected, same "reject outright, never
            # silently truncate" rule this function's own docstring
            # already applies to enum/int.
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
    """Either scope, mixed - only ws_save_preset uses this: a preset is a
    named bundle an admin builds once (in the admin Devices tab's own
    per-field controls, which cover every field regardless of scope) and
    may apply later to a device, an instance, or both at once (see
    ws_apply_preset's own docstring for how it's split back apart by scope
    at apply time)."""
    return _validate_against(raw, DEVICE_SETTINGS_FIELDS)


def _sync_device_entities(
    hass: HomeAssistant,
    entry_data: dict[str, Any],
    device_id: str,
    is_new_device: bool,
    instance_id: Optional[str] = None,
    is_new_instance: bool = False,
) -> None:
    """Keeps the select/number/text/button entities from select.py/number.py/
    text.py/button.py in step with this store - creates a new device's (or
    instance's) full set of entities the first time it's seen, otherwise
    refreshes the state of whichever entities already exist for it. Called
    after every change to a device's or instance's own settings dict,
    regardless of whether that change came from a report or an admin's
    push/apply_preset."""
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
        # v1.139.0+: the same card can be embedded on more than one
        # Lovelace dashboard/view on one physical device - instance_id
        # identifies WHICH placement this report is for (see the card's
        # own _getCardInstanceId), and instance_settings carries that
        # placement's own view/layout values (INSTANCE_SCOPED_SETTINGS_
        # FIELDS), separate from `settings` above (now device-scoped
        # fields only - see _validate_settings's own docstring). Both
        # optional together: an older cached card that hasn't picked up
        # this version yet simply never sends them, and this report still
        # succeeds exactly as before for its device-scoped fields.
        vol.Optional("instance_id"): str,
        vol.Optional("instance_settings"): dict,
        vol.Optional("instance_label"): str,
        # Household ask: "a kiosk would default with participation in
        # privacy mode" - true when the HA user currently logged in and
        # reporting is, per their own Family Hub profile
        # (isKioskAccount), a Kiosk account. See this handler's own use
        # of it below for what that actually does to this device's
        # privacy_participates.
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
    # Household ask: "a kiosk would default with participation in privacy
    # mode" - the FIRST time this device ever reports in while logged in
    # as a Kiosk-account profile, explicitly persist privacy_participates
    # as True, rather than just leaning on privacy_participates_for's own
    # implicit "no key yet -> True" default. Only fires while the key is
    # still unset, so it never overwrites an explicit choice an admin
    # already made for this device (on or off), and never forces it back
    # on later if an admin opts the device out afterward - a one-time
    # sensible default, not an enforced link between account and device.
    if bool(msg.get("is_kiosk_account")) and "privacy_participates" not in record:
        record["privacy_participates"] = True
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
    # v1.147.0+: lets a device that was closed/asleep when an admin or
    # automation flipped its screensaver switch learn the right value the
    # next time it loads - see DEVICE_SETTINGS_EVENT_SCREENSAVER_TOGGLE's
    # own comment in const.py for why this field has no dedicated
    # get_pending-style catch-up command of its own.
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
    """Catch-up check for both scopes at once when `instance_id` is given -
    the response keeps its original flat {seq, settings} shape (the
    device's own pending push) for backward compatibility with an older
    cached card that never sends instance_id, and ADDS a nested
    `instance` key ({seq, settings} for that one instance's own pending
    push, or null if that instance has never had anything pushed to it)
    only when instance_id was actually given - see the card's own
    _checkPendingDeviceSettings for how the two get applied together
    without a double reload."""
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
    """Live Identify subscription for every signed-in device - see
    ws_subscribe_push's own docstring above for why this needs its own
    command rather than the generic subscribe_events one. Identify has no
    catch-up counterpart to ws_get_pending (see DEVICE_SETTINGS_EVENT_
    IDENTIFY's own comment in const.py): a device that missed the live
    event - screen off, or, before this command existed, a non-admin
    login that could never subscribe at all - simply never shows the
    modal for that click, same as Identify already meant for a closed or
    asleep dashboard."""
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
    """Instance-scoped counterpart to _push_settings above - same staging/
    mirroring/live-event shape, just one level deeper (record["instances"]
    [instance_id] instead of the device record itself), and the fired
    event carries instance_id alongside device_id so the card's own live
    listener only applies it to the matching dashboard/view (see the
    card's own _subscribeDeviceSettingsPush)."""
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
        # v1.139.0+: when given, `settings` targets that one dashboard/view
        # instance's own view/layout fields (validated against INSTANCE_
        # SCOPED_SETTINGS_FIELDS) instead of the device's own fields
        # (DEVICE_SCOPED_SETTINGS_FIELDS) - see _validate_settings/
        # _validate_instance_settings's own docstrings.
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
    """The admin Devices tab's own per-device Privacy Mode participation
    toggle - household ask, verbatim: "I wanted to have a setting that you
    check if you want the device to participate in privacy mode. This way
    things like phones could have the calendar while the fridge or the
    kiosk is hidden." Admin-only, same gate as ws_set_screensaver_enabled
    above, and takes effect immediately for the same reason - there's no
    separate Push/Sync step for this field either."""
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
        # v1.139.0+: a preset can carry both device- and instance-scoped
        # fields at once (ws_save_preset validates against the full mixed
        # registry - see _validate_mixed_settings's own docstring). The
        # device-scoped part of the preset always applies to device_id;
        # the instance-scoped part only applies, to this one instance_id,
        # when it's given - see this command's own docstring below.
        vol.Optional("instance_id"): str,
    }
)
@websocket_api.async_response
async def ws_apply_preset(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Splits the preset's own (possibly mixed-scope) settings dict by
    scope (DEVICE_SCOPED_SETTINGS_FIELDS / INSTANCE_SCOPED_SETTINGS_FIELDS)
    and pushes each half through its own scope's push path. The device-
    scoped half always applies (there's always a device_id). The instance-
    scoped half only applies when instance_id was given; without one, any
    instance-scoped keys the preset happens to carry are simply skipped -
    "apply this preset to just the device" is a perfectly reasonable thing
    to want, not an error, same as a preset built with only device-scoped
    fields in the first place."""
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
