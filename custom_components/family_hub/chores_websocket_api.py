"""Websocket API for the Chores/Rewards/Permissions feature area - everything family-hub-chores-card.js, family-hub-my-chores-card.js"""
from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_point_in_utc_time
from homeassistant.util import dt as dt_util

from . import chore_engine, goal_engine, libraries, privacy_mode_shared, reward_engine, routine_engine, routine_library, sensor as timer_sensor, store as chores_store, switch as device_settings_switch, timer_engine
from .const import (
    ALARM_AUTO_STOP_SECONDS,
    ALARM_REANNOUNCE_SECONDS,
    ALARM_STOP_ACTION_PREFIX,
    EVENT_FAMILY_HUB_TIMER_ALARM_STOPPED,
    EVENT_FAMILY_HUB_TIMER_CANCELLED,
    EVENT_FAMILY_HUB_TIMER_STARTED,
    TIMER_LOG_MAX_ENTRIES,
    CHORE_KEY_ALARM_AUDIENCE,
    CHORE_KEY_GROUP_ID,
    CHORE_KEY_STAR_REQUEST,
    CHORE_KEY_IMPORTANT,
    CHORE_KEY_SHOW_ON_CALENDAR,
    CHORE_KEY_RECUR_DUE_OFFSET_MINUTES,
    CHORE_KEY_RECUR_INTERVAL_UNIT,
    CHORE_KEY_RECUR_MONTH_NTH,
    CHORE_KEY_TIMER_MINUTES,
    CHORE_PERMISSIONS,
    CONF_NOTIFICATION_CLICK_PATH,
    DOMAIN,
    ROUTINE_EVENT_TYPE,
    EVENT_FAMILY_HUB_TIMER_ALARM_RING,
    EVENT_FAMILY_HUB_TIMER_ALARM_STOP,
    PERMISSION_ASSIGN,
    PERMISSION_COMPLETE_ANY,
    PERMISSION_EDIT_CHORE,
    PERMISSION_REWARD_ADD,
    PERMISSION_REWARD_OVERRIDE,
    PERMISSION_AUTO_APPROVE,
    PERMISSION_ROUTINES_MANAGE_ANY,
    PERMISSION_ROUTINES_MANAGE_OWN,
    PERMISSION_STAR_OVERRIDE,
    PERMISSION_TOGGLE_PRIVACY_MODE,
    PERMISSION_VERIFY,
    PRIVACY_MODE_EVENT_CHANGED,
    REWARD_KEY_ALARM_AUDIENCE,
    REWARD_KEY_TIMER_MINUTES,
    ROUTINE_CATEGORIES,
    EVENT_FAMILY_HUB_TIMER_FINISHED,
    NATIVE_TIMER_EVENT_CANCELLED,
    NATIVE_TIMER_EVENT_FINISHED,
    SETTINGS_KEY_ALARM_DEVICES,
    SETTINGS_KEY_ALARM_TTS_ENTITY,
    SETTINGS_KEY_PROFILE_IS_ALARM_KIOSK,
    TIMER_ALARM_AUDIENCE_EVERYONE,
    TIMER_ALARM_AUDIENCE_KIOSKS,
    TIMER_ALARM_AUDIENCE_SELF,
    TIMER_ALARM_AUDIENCES,
    TIMER_ENTITY_PREFIX,
    TIMER_FAMILY_ENTITY_PREFIX,
    TIMER_FAMILY_POOL_SIZE,
    TIMER_KIND_CHORE,
    TIMER_KIND_REWARD,
    TIMER_KIND_STANDALONE,
)

_LOGGER = logging.getLogger(__name__)

REDEMPTION_HISTORY_LIMIT = 200
BANK_USAGE_HISTORY_LIMIT = 200
LEDGER_HISTORY_LIMIT = 500


def _get_entry(hass: HomeAssistant):
    """Local copy of __init__.py's _get_family_hub_entry - see this
    module's docstring for why it isn't imported instead."""
    entries = hass.config_entries.async_entries(DOMAIN)
    return entries[0] if entries else None


def _get_entry_data(hass: HomeAssistant) -> Optional[dict[str, Any]]:
    """Local copy of __init__.py's _get_family_hub_entry_data."""
    entry = _get_entry(hass)
    if entry is None:
        return None
    return hass.data.get(DOMAIN, {}).get("entries", {}).get(entry.entry_id)


def _split_notify_target(target: str) -> Optional[tuple[str, str]]:
    """Local copy of __init__.py's _split_notify_target - turns
    'notify.mobile_app_x' into ('notify', 'mobile_app_x')."""
    target = (target or "").strip()
    if not target.startswith("notify."):
        return None
    service = target[len("notify."):]
    if not service:
        return None
    return "notify", service


def _notification_click_data(entry) -> dict[str, str]:
    """Local copy of __init__.py's _notification_click_data - see this
    module's own docstring for why it isn't imported instead."""
    path = ((entry.options.get(CONF_NOTIFICATION_CLICK_PATH) if entry else None) or "").strip()
    if not path:
        return {}
    return {"url": path, "clickAction": path}


async def _user_display_name(hass: HomeAssistant, user_id: Optional[str]) -> str:
    """Best-effort real name for a notification's own message text (e.g.
    "Mom claimed Movie night") - falls back to the raw id if the account
    can't be found, same fail-safe convention as __init__.py's own
    family_hub/list_users (`u.name or u.id`)."""
    if not user_id:
        return "Someone"
    try:
        users = await hass.auth.async_get_users()
    except Exception:  # noqa: BLE001
        return user_id
    match = next((u for u in users if u.id == user_id), None)
    return (match.name or match.id) if match else user_id


async def _send_instant_notification(
    hass: HomeAssistant, notify_targets: list[str], title: str, message: str, extra: Optional[dict] = None
) -> int:
    """Best-effort push to every resolved notify target - shared send loop for the two v123+ instant profile notifications (notifyRewardClaimed/ notifyChoreApproved"""
    entry = _get_entry(hass)
    data = dict(_notification_click_data(entry))
    if extra:
        data.update(extra)
    sent = 0
    for target in notify_targets:
        split = _split_notify_target(target)
        if split is None:
            continue
        domain, service = split
        try:
            await hass.services.async_call(
                domain, service, {"title": title, "message": message, "data": data}, blocking=True,
            )
            sent += 1
        except Exception as err:  # noqa: BLE001 - a failed notify must never break the underlying action
            _LOGGER.warning("Family Hub: failed to send instant notification via %s: %s", target, err)
    return sent


async def _send_alarm_notification(
    hass: HomeAssistant, notify_targets: list[str], title: str, message: str, extra: Optional[dict] = None
) -> int:
    """same send loop as _send_instant_notification, but with an enriched `data` payload asking the Home Assistant Companion App for alarm-like delivery instead of a"""
    entry = _get_entry(hass)
    data = dict(_notification_click_data(entry))
    data.update({
        "channel": "alarm_stream_max",
        "importance": "high",
        "sticky": "true",
        "tag": "family_hub_timer_alarm",
        "push": {
            "sound": {"name": "default", "critical": 1, "volume": 1.0},
            "interruption-level": "critical",
        },
    })
    if extra:
        data.update(extra)
    sent = 0
    for target in notify_targets:
        split = _split_notify_target(target)
        if split is None:
            continue
        domain, service = split
        try:
            await hass.services.async_call(
                domain, service, {"title": title, "message": message, "data": data}, blocking=True,
            )
            sent += 1
        except Exception as err:  # noqa: BLE001 - a failed notify must never break the underlying action
            _LOGGER.warning("Family Hub: failed to send alarm notification via %s: %s", target, err)
    return sent


def _actor_id(connection: websocket_api.ActiveConnection) -> Optional[str]:
    return connection.user.id if connection.user else None


def _fire_routine_event(
    hass: HomeAssistant,
    *,
    event: str,
    user_id: Optional[str] = None,
    category: Optional[str] = None,
    item: Optional[dict[str, Any]] = None,
    actor: Optional[str] = None,
    done: Optional[bool] = None,
) -> None:
    """Mirrors chore_engine._fire_chore_event's
    "always fire, never let a listener misbehaving break the actual
    action" shape, but lives here rather than in routine_engine.py since
    that module deliberately stays hass-free (see its own module
    docstring) - this is the one place `hass` is already on hand right
    after a routine websocket action saves. See ROUTINE_EVENT_TYPE's own
    comment in const.py for the two event shapes ("item_toggled" vs
    "routine_completed") this gets called with."""
    payload: dict[str, Any] = {"event": event}
    if item is not None:
        payload["item_id"] = item.get("id")
        payload["title"] = item.get("title")
        payload["user_id"] = item.get("user_id")
        payload["category"] = item.get("category")
    else:
        payload["user_id"] = user_id
        payload["category"] = category
    if actor is not None:
        payload["actor"] = actor
    if done is not None:
        payload["done"] = done
    try:
        hass.bus.async_fire(ROUTINE_EVENT_TYPE, payload)
    except Exception as err:  # noqa: BLE001 - a listener misbehaving must never break the routine action itself
        _LOGGER.warning("Family Hub: error firing %s: %s", ROUTINE_EVENT_TYPE, err)


def _is_admin(connection: websocket_api.ActiveConnection) -> bool:
    return bool(connection.user and getattr(connection.user, "is_admin", False))


def _has_permission(entry_data: dict[str, Any], connection: websocket_api.ActiveConnection, permission: str) -> bool:
    """A real admin always has every permission. Otherwise, only what the
    Permissions store explicitly grants this specific user_id - see
    const.py's CHORE_PERMISSIONS for the full set."""
    if _is_admin(connection):
        return True
    user_id = _actor_id(connection)
    if not user_id:
        return False
    permissions = (entry_data.get("permissions") or {}).get(user_id, {})
    return bool(permissions.get(permission))


def _can_add_rewards(entry_data: dict[str, Any], connection: websocket_api.ActiveConnection) -> bool:
    """Whoever can add straight to the catalog with a price, and so is also the audience for approving/rejecting someone else's suggestion"""
    return _has_permission(entry_data, connection, PERMISSION_REWARD_OVERRIDE) or _has_permission(
        entry_data, connection, PERMISSION_REWARD_ADD
    )


KIOSK_ELEVATION_TTL_SECONDS = 90


def _kiosk_elevations(entry_data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return entry_data.setdefault("kiosk_elevations", {})


def _prune_kiosk_elevations(entry_data: dict[str, Any]) -> None:
    elevations = _kiosk_elevations(entry_data)
    now = time.time()
    for token in [tok for tok, rec in elevations.items() if rec["expires_at"] <= now]:
        elevations.pop(token, None)


def _hash_pin(pin: str, salt: str) -> str:
    """The original (pre-v1.168.71) one-round salted SHA-256. Kept only to
    verify a PIN set before v1.168.71 - see _verify_pin_record, which
    upgrades it to PBKDF2 the first time that PIN is used."""
    return hashlib.sha256(f"{salt}:{pin}".encode("utf-8")).hexdigest()


# -------------------------------------------------------------------------- v1.168.71: kiosk PIN storage
PIN_PBKDF2_ITERATIONS = 120_000
PIN_MAX_FAILURES = 5
PIN_LOCKOUT_SECONDS = 300


class _MemoryStore:
    """Stand-in used only when entry_data has no real Store for this (the
    integration always creates one - see async_setup_entry; this keeps
    hand-built test entry_data working)."""

    def __init__(self) -> None:
        self._data = None

    async def async_load(self):
        return self._data

    async def async_save(self, data) -> None:
        self._data = data


def _pins_store(hass: HomeAssistant, entry_data: dict[str, Any]):
    store = entry_data.get("pins_store")
    if store is None:
        store = _MemoryStore()
        entry_data["pins_store"] = store
    return store


def _strip_pins_from_settings(settings: dict[str, Any]) -> dict[str, dict[str, str]]:
    """Removes pinHash/pinSalt from every profile in a settings dict (in
    place) and returns what was removed, keyed by user id."""
    found: dict[str, dict[str, str]] = {}
    profiles = settings.get("userProfiles") if isinstance(settings, dict) else None
    if not isinstance(profiles, dict):
        return found
    for uid, profile in profiles.items():
        if not isinstance(profile, dict):
            continue
        h = profile.pop("pinHash", None)
        salt = profile.pop("pinSalt", None)
        if h and salt:
            found[uid] = {"algo": "sha256", "salt": salt, "hash": h}
    return found


async def async_load_pins(hass: HomeAssistant, entry_data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """{user_id: {algo, salt, hash, [iterations]}} - migrating any hash
    still sitting in the settings blob into the private store first."""
    pins = entry_data.get("kiosk_pins")
    if pins is None:
        pins = await _pins_store(hass, entry_data).async_load() or {}
        entry_data["kiosk_pins"] = pins
    settings_store = entry_data.get("settings_store")
    if settings_store is not None and not entry_data.get("kiosk_pins_migrated"):
        # set_settings strips hashes from every incoming save, so after one
        # check per run the blob can't hold any again
        entry_data["kiosk_pins_migrated"] = True
        settings = await settings_store.async_load() or {}
        found = _strip_pins_from_settings(settings)
        if found:
            for uid, rec in found.items():
                pins.setdefault(uid, rec)  # a PIN already in the private store wins
            await _pins_store(hass, entry_data).async_save(pins)
            await settings_store.async_save(settings)
            _LOGGER.info("Family Hub: moved %s kiosk PIN(s) out of the shared settings", len(found))
    return pins


def _pbkdf2(pin: str, salt: str, iterations: int) -> str:
    return hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), salt.encode("utf-8"), iterations).hex()


async def async_set_pin(hass: HomeAssistant, entry_data: dict[str, Any], user_id: str, pin: Optional[str]) -> None:
    pins = await async_load_pins(hass, entry_data)
    if pin:
        salt = secrets.token_hex(16)
        digest = await hass.async_add_executor_job(_pbkdf2, pin, salt, PIN_PBKDF2_ITERATIONS)
        pins[user_id] = {"algo": "pbkdf2_sha256", "iterations": PIN_PBKDF2_ITERATIONS, "salt": salt, "hash": digest}
    else:
        pins.pop(user_id, None)
    entry_data.setdefault("pin_failures", {}).pop(user_id, None)
    await _pins_store(hass, entry_data).async_save(pins)


async def async_has_pin(hass: HomeAssistant, entry_data: dict[str, Any], user_id: str) -> bool:
    return bool((await async_load_pins(hass, entry_data)).get(user_id))


def pin_lockout_remaining(entry_data: dict[str, Any], user_id: str) -> int:
    rec = entry_data.setdefault("pin_failures", {}).get(user_id)
    if not rec:
        return 0
    return max(0, int(rec.get("locked_until", 0) - time.time()))


async def async_verify_pin(hass: HomeAssistant, entry_data: dict[str, Any], user_id: str, pin: str) -> str:
    """"ok", "incorrect" or "locked". Every PIN check goes through here, so
    the lockout applies everywhere. A wrong PIN for someone with no PIN set
    still counts, so the answer never reveals who has a PIN."""
    failures = entry_data.setdefault("pin_failures", {})
    if pin_lockout_remaining(entry_data, user_id) > 0:
        return "locked"
    pins = await async_load_pins(hass, entry_data)
    rec = pins.get(user_id) or {}
    ok = False
    pin = str(pin or "")
    if rec.get("algo") == "pbkdf2_sha256" and rec.get("salt") and rec.get("hash"):
        digest = await hass.async_add_executor_job(_pbkdf2, pin, rec["salt"], int(rec.get("iterations") or PIN_PBKDF2_ITERATIONS))
        ok = hmac.compare_digest(digest, rec["hash"])
    elif rec.get("salt") and rec.get("hash"):
        ok = hmac.compare_digest(_hash_pin(pin, rec["salt"]), rec["hash"])
        if ok:
            await async_set_pin(hass, entry_data, user_id, pin)  # upgrade the old hash
    if ok:
        failures.pop(user_id, None)
        return "ok"
    entry = failures.setdefault(user_id, {"count": 0, "locked_until": 0})
    entry["count"] += 1
    if entry["count"] >= PIN_MAX_FAILURES:
        entry["count"] = 0
        entry["locked_until"] = time.time() + PIN_LOCKOUT_SECONDS
        _LOGGER.warning("Family Hub: too many wrong PINs for a household member - PIN locked for %s minutes", PIN_LOCKOUT_SECONDS // 60)
    return "incorrect"


def _send_pin_error(connection: websocket_api.ActiveConnection, msg_id: int, result: str, entry_data: dict[str, Any], user_id: str) -> None:
    if result == "locked":
        connection.send_error(msg_id, "pin_locked", f"Too many wrong PINs - try again in {max(1, (pin_lockout_remaining(entry_data, user_id) + 59) // 60)} minute(s).")
    else:
        connection.send_error(msg_id, "incorrect_pin", "Incorrect PIN.")


# -------------------------------------------------------------------------- v1.168.71: locked More-menu pop-ups.
LOCKED_POPUP_CONTENT_KEYS = ("heading", "text", "images", "qrLink", "qrType", "qrFields", "linkUrl", "linkLabel")


def _locked_popups_store(entry_data: dict[str, Any]):
    store = entry_data.get("locked_popups_store")
    if store is None:
        store = _MemoryStore()
        entry_data["locked_popups_store"] = store
    return store


async def async_load_locked_popups(entry_data: dict[str, Any]) -> dict[str, Any]:
    data = entry_data.get("locked_popups")
    if data is None:
        data = await _locked_popups_store(entry_data).async_load() or {}
        entry_data["locked_popups"] = data
    return data


def _clean_locked_content(raw: Any) -> dict[str, Any]:
    """Shapes/limits what's stored - the card normalizes it again before
    drawing anything."""
    raw = raw if isinstance(raw, dict) else {}

    def s(key: str, limit: int) -> str:
        v = raw.get(key)
        return v[:limit] if isinstance(v, str) else ""

    images = [u[:500] for u in (raw.get("images") or []) if isinstance(u, str) and u][:2] if isinstance(raw.get("images"), list) else []
    fields = raw.get("qrFields") if isinstance(raw.get("qrFields"), dict) else {}
    qr_fields = {str(k)[:20]: v[:800] for k, v in list(fields.items())[:10] if isinstance(v, str)}
    link = s("linkUrl", 1000)
    return {
        "heading": s("heading", 80),
        "text": s("text", 3000),
        "images": images,
        "qrLink": s("qrLink", 1000),
        "qrType": s("qrType", 20),
        "qrFields": qr_fields,
        "linkUrl": link if link.lower().startswith(("http://", "https://")) else "",
        "linkLabel": s("linkLabel", 40),
    }


def _locked_items(settings: dict[str, Any]) -> dict[str, dict[str, Any]]:
    mm = settings.get("moreMenu") if isinstance(settings, dict) else None
    custom = mm.get("custom") if isinstance(mm, dict) else None
    out: dict[str, dict[str, Any]] = {}
    for item in custom if isinstance(custom, list) else []:
        if isinstance(item, dict) and item.get("locked") and isinstance(item.get("id"), str):
            out[item["id"]] = item
    return out


def strip_locked_popup_content(settings: dict[str, Any]) -> None:
    """For set_settings: copies moreMenu (the caller's payload is left
    alone) and drops any content from locked items, so a secret can never
    end up in the readable blob even if a client sends it."""
    mm = settings.get("moreMenu") if isinstance(settings, dict) else None
    if not isinstance(mm, dict) or not isinstance(mm.get("custom"), list):
        return
    mm = dict(mm)
    custom = []
    for item in mm["custom"]:
        if isinstance(item, dict) and item.get("locked"):
            item = {k: v for k, v in item.items() if k not in LOCKED_POPUP_CONTENT_KEYS}
            ids = item.get("unlockUserIds")
            item["unlockUserIds"] = [u for u in ids if isinstance(u, str) and u][:30] if isinstance(ids, list) else []
        custom.append(item)
    mm["custom"] = custom
    settings["moreMenu"] = mm


async def async_prune_locked_popups(entry_data: dict[str, Any], settings: dict[str, Any]) -> None:
    """Content for a button that's gone, or no longer locked, is deleted."""
    data = await async_load_locked_popups(entry_data)
    keep = set(_locked_items(settings))
    stale = [k for k in data if k not in keep]
    if stale:
        for k in stale:
            data.pop(k, None)
        await _locked_popups_store(entry_data).async_save(data)


async def _connection_profile(entry_data: dict[str, Any], user_id: Optional[str]) -> dict[str, Any]:
    settings = await _load_settings(entry_data)
    profiles = settings.get("userProfiles") if isinstance(settings.get("userProfiles"), dict) else {}
    prof = profiles.get(user_id) if user_id else None
    return prof if isinstance(prof, dict) else {}


@websocket_api.websocket_command(
    {vol.Required("type"): "family_hub/more_menu/locked/set", vol.Required("item_id"): str, vol.Required("content"): vol.Any(dict, None)}
)
@websocket_api.async_response
async def ws_more_menu_locked_set(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Admin-only. The button must already be saved as locked (the card
    saves settings first, then this)."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not (connection.user and connection.user.is_admin):
        connection.send_error(msg["id"], "forbidden", "Only an admin can change a locked pop-up.")
        return
    settings = await _load_settings(entry_data)
    if msg["item_id"] not in _locked_items(settings):
        connection.send_error(msg["id"], "not_found", "That button isn't saved as locked.")
        return
    data = await async_load_locked_popups(entry_data)
    if msg["content"] is None:
        data.pop(msg["item_id"], None)
    else:
        data[msg["item_id"]] = _clean_locked_content(msg["content"])
    await _locked_popups_store(entry_data).async_save(data)
    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/more_menu/locked/get_for_edit", vol.Required("item_id"): str})
@websocket_api.async_response
async def ws_more_menu_locked_get_for_edit(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not (connection.user and connection.user.is_admin):
        connection.send_error(msg["id"], "forbidden", "Only an admin can edit a locked pop-up.")
        return
    data = await async_load_locked_popups(entry_data)
    connection.send_result(msg["id"], {"content": data.get(msg["item_id"]) or _clean_locked_content({})})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/more_menu/unlock_options", vol.Required("item_id"): str})
@websocket_api.async_response
async def ws_more_menu_unlock_options(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """direct: this login may open it with no PIN. users: who can unlock it
    with a PIN (name + has_pin only)."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    settings = await _load_settings(entry_data)
    item = _locked_items(settings).get(msg["item_id"])
    if item is None:
        connection.send_error(msg["id"], "not_found", "That pop-up isn't locked.")
        return
    allowed = item.get("unlockUserIds") or []
    me = connection.user.id if connection.user else None
    prof = await _connection_profile(entry_data, me)
    direct = bool(me and me in allowed and not prof.get("isKioskAccount"))
    pins = await async_load_pins(hass, entry_data)
    users = [{"id": uid, "name": await _user_display_name(hass, uid), "has_pin": bool(pins.get(uid))} for uid in allowed]
    connection.send_result(msg["id"], {"direct": direct, "users": users})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/more_menu/unlock",
        vol.Required("item_id"): str,
        vol.Optional("user_id"): str,
        vol.Optional("pin"): str,
    }
)
@websocket_api.async_response
async def ws_more_menu_unlock(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Returns a locked pop-up's content. Same single "incorrect_pin" error
    for a wrong PIN, no PIN set, or a person not on the list."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    settings = await _load_settings(entry_data)
    item = _locked_items(settings).get(msg["item_id"])
    if item is None:
        connection.send_error(msg["id"], "not_found", "That pop-up isn't locked.")
        return
    allowed = item.get("unlockUserIds") or []
    me = connection.user.id if connection.user else None
    prof = await _connection_profile(entry_data, me)
    if not (me and me in allowed and not prof.get("isKioskAccount")):
        uid = msg.get("user_id") or ""
        pin = msg.get("pin") or ""
        if not uid or not pin:
            connection.send_error(msg["id"], "pin_required", "A PIN is needed to open this.")
            return
        result = await async_verify_pin(hass, entry_data, uid, pin)
        if result != "ok" or uid not in allowed:
            _send_pin_error(connection, msg["id"], result if result != "ok" else "incorrect", entry_data, uid)
            return
    data = await async_load_locked_popups(entry_data)
    connection.send_result(msg["id"], {"content": data.get(msg["item_id"]) or _clean_locked_content({})})


async def _ha_user_is_admin(hass: HomeAssistant, user_id: Optional[str]) -> bool:
    if not user_id:
        return False
    try:
        ha_user = await hass.auth.async_get_user(user_id)
    except Exception:  # noqa: BLE001 - a lookup failure must never crash the caller
        return False
    return bool(ha_user and ha_user.is_admin)


async def _effective_actor(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, entry_data: dict[str, Any], msg: dict
) -> tuple[Optional[str], bool]:
    """Resolves who is actually performing this action: by default the real HA login on the connection (same as the old bare _actor_id/_is_admin), or"""
    token = msg.get("elevation_token")
    if token:
        _prune_kiosk_elevations(entry_data)
        rec = _kiosk_elevations(entry_data).get(token)
        if rec:
            user_id = rec["user_id"]
            return user_id, await _ha_user_is_admin(hass, user_id)
    return _actor_id(connection), _is_admin(connection)


def _has_permission_ctx(entry_data: dict[str, Any], user_id: Optional[str], is_admin: bool, permission: str) -> bool:
    """Same rule _has_permission enforces, but against an already-resolved (user_id, is_admin) pair instead of a live connection"""
    if is_admin:
        return True
    if not user_id:
        return False
    permissions = (entry_data.get("permissions") or {}).get(user_id, {})
    return bool(permissions.get(permission))


def _can_add_rewards_ctx(entry_data: dict[str, Any], user_id: Optional[str], is_admin: bool) -> bool:
    """Elevation-aware twin of _can_add_rewards, same OR-of-two-permissions
    shape."""
    return _has_permission_ctx(entry_data, user_id, is_admin, PERMISSION_REWARD_OVERRIDE) or _has_permission_ctx(
        entry_data, user_id, is_admin, PERMISSION_REWARD_ADD
    )


async def _save_chores(hass: HomeAssistant, entry_data: dict[str, Any]) -> None:
    """The one choke point every real chores save goes through - also refreshes the durable chores_backup.json file on disk"""
    await entry_data["chores_store"].async_save(entry_data["chores"])
    await chores_store.backup_chores(hass, entry_data["chores"])
    # keep the chores to-do lists (generic + one per person) in step; a new assignee gets a list
    try:
        from .todo import async_sync_person_chore_lists

        await async_sync_person_chore_lists(hass, entry_data)
    except Exception as err:  # noqa: BLE001 - a to-do list hiccup never fails the save
        _LOGGER.debug("Family Hub: couldn't update the chores to-do lists: %s", err)


async def _save_rewards(hass: HomeAssistant, entry_data: dict[str, Any]) -> None:
    await entry_data["rewards_store"].async_save(entry_data["rewards"])
    await chores_store.backup_rewards(hass, entry_data["rewards"])


async def _save_permissions(hass: HomeAssistant, entry_data: dict[str, Any]) -> None:
    await entry_data["permissions_store"].async_save(entry_data["permissions"])
    await chores_store.backup_permissions(hass, entry_data["permissions"])


async def _save_routines(hass: HomeAssistant, entry_data: dict[str, Any]) -> None:
    await entry_data["routines_store"].async_save(entry_data["routines"])
    await chores_store.backup_routines(hass, entry_data["routines"])


async def _save_goals(hass: HomeAssistant, entry_data: dict[str, Any]) -> None:
    await entry_data["goals_store"].async_save(entry_data["goals"])
    await chores_store.backup_goals(hass, entry_data["goals"])


def _entry_data_or_error(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg_id: Any) -> Optional[dict[str, Any]]:
    entry_data = _get_entry_data(hass)
    if entry_data is None:
        connection.send_error(msg_id, "not_found", "Family Hub is not set up")
        return None
    return entry_data


async def _load_settings(entry_data: dict[str, Any]) -> dict[str, Any]:
    """Local, lightweight settings load - mirrors ws_nudge_chore's existing inline pattern below rather than duplicating __init__.py's full"""
    store = entry_data.get("settings_store")
    if store is None:
        return {}
    return await store.async_load() or {}


def _is_user_family_hub_member(settings: dict[str, Any], user_id: Optional[str]) -> bool:
    """user_id -> bool for chore_engine's is_user_enabled parameter (see its own docstring in chore_engine.py)."""
    if not user_id:
        return True
    raw = settings.get("memberUserIds")
    member_ids = {str(uid) for uid in raw} if isinstance(raw, list) else set()
    return user_id in member_ids


async def _make_is_user_enabled(entry_data: dict[str, Any]):
    """Returns a ready-to-pass-in `is_user_enabled` callback (see chore_engine.IsUserEnabled)"""
    settings = await _load_settings(entry_data)
    return lambda user_id: _is_user_family_hub_member(settings, user_id)


def _is_chores_eligible(settings: dict[str, Any], user_id: Optional[str]) -> bool:
    """Family Hub membership PLUS the narrower per-person includeInChores
    opt-out (see const.py's docstring on SETTINGS_KEY_MEMBER_USER_IDS's
    "v121+" follow-up, right after it) - a member who's explicitly been
    excluded from Chores/Rewards (most often a shared kiosk/wall-tablet
    login added to Family Hub only so it can be granted Permissions) is
    still a real member everywhere else, just not eligible for a NEW chore
    assignment/claim. Defaults to eligible (True) whenever the flag is
    missing/malformed, same fail-safe-for-existing-installs shape as every
    other userProfiles field."""
    if not _is_user_family_hub_member(settings, user_id):
        return False
    if not user_id:
        return True
    profiles = settings.get("userProfiles")
    profile = profiles.get(user_id) if isinstance(profiles, dict) else None
    if not isinstance(profile, dict):
        return True
    # a kiosk account is a shared tablet login, never a chores/rewards participant
    if profile.get("isKioskAccount"):
        return False
    return profile.get("includeInChores", True) is not False


async def _make_is_chores_eligible(entry_data: dict[str, Any]):
    """Chores-flavored counterpart to _make_is_user_enabled just above - this is the one actually handed to chore_engine.py's create/update/ assign/claim as their"""
    settings = await _load_settings(entry_data)
    return lambda user_id: _is_chores_eligible(settings, user_id)


# -------------------------------------------------------------------------- Chores


@websocket_api.websocket_command({vol.Required("type"): "family_hub/chores/list"})
@websocket_api.async_response
async def ws_list_chores(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    connection.send_result(msg["id"], {"chores": list(entry_data["chores"].values())})


@websocket_api.websocket_command(
    {vol.Required("type"): "family_hub/chores/schedule", vol.Required("start"): str, vol.Required("end"): str}
)
@websocket_api.async_response
async def ws_chores_schedule(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Chores between start and end (ISO), with repeating ones projected ahead - the Chores card's 📅 Schedule view.
    Read-only and open to everyone, like the board itself. At most 62 days at a time."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    start = dt_util.parse_datetime(msg["start"])
    end = dt_util.parse_datetime(msg["end"])
    if start is None or end is None or end <= start:
        connection.send_error(msg["id"], "invalid_format", "start and end must be ISO date-times, end after start.")
        return
    if start.tzinfo is None:
        start = start.replace(tzinfo=dt_util.get_default_time_zone())
    if end.tzinfo is None:
        end = end.replace(tzinfo=dt_util.get_default_time_zone())
    if end - start > timedelta(days=62):
        end = start + timedelta(days=62)
    connection.send_result(msg["id"], chore_engine.project_schedule(entry_data["chores"], start, end))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/chores/create",
        vol.Required("title"): str,
        vol.Optional("assigned_to"): vol.Any(str, None),
        # When present with 2+ entries, ws_create_chore fans this single request out into one ordinary chore PER assignee
        vol.Optional("assigned_to_list"): [str],
        vol.Optional("assignment_mode"): str,
        vol.Optional("rotation_group"): [str],
        vol.Optional("rotation_pointer"): int,
        vol.Optional("star_value"): int,
        vol.Optional("due_date"): vol.Any(str, None),
        vol.Optional("overdue_penalty"): int,
        vol.Optional("reminder_minutes"): [int],
        vol.Optional("notes"): str,
        vol.Optional("dependencies"): [str],
        vol.Optional("auto_create_trigger"): vol.Any(dict, None),
        vol.Optional("auto_complete_trigger"): vol.Any(dict, None),
        vol.Optional("recur_type"): vol.Any(str, None),
        vol.Optional("recur_interval_days"): int,
        # Only meaningful when recur_type == "interval" - see chore_engine.
        vol.Optional(CHORE_KEY_RECUR_INTERVAL_UNIT): vol.Any(str, None),
        vol.Optional("recur_weekdays"): [int],
        # Only meaningful when recur_type == "monthly_nth" - see chore_ engine._compute_next_recur_due's own comment for how this pairs with
        vol.Optional(CHORE_KEY_RECUR_MONTH_NTH): vol.Any(int, None),
        # How many minutes after each recurrence reset_recurring_chore should set the fresh due_date to
        vol.Optional(CHORE_KEY_RECUR_DUE_OFFSET_MINUTES): vol.Any(int, None),
        vol.Optional("no_approval_required"): bool,
        vol.Optional("quantity_total"): vol.Any(int, None),
        # optional countdown length in minutes, None to clear.
        vol.Optional("timer_minutes"): vol.Any(int, None),
        # who/what rings when this chore's timer alarms - see
        # const.py's CHORE_KEY_ALARM_AUDIENCE/TIMER_ALARM_AUDIENCES.
        vol.Optional(CHORE_KEY_ALARM_AUDIENCE): vol.Any(str, None),
        vol.Optional(CHORE_KEY_IMPORTANT): bool,
        vol.Optional(CHORE_KEY_SHOW_ON_CALENDAR): bool,
    }
)
@websocket_api.async_response
async def ws_create_chore(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _has_permission(entry_data, connection, PERMISSION_ASSIGN):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted chore-assignment permission) can create chores.")
        return
    # creating a chore with no_approval_required=True is the one specific way someone with plain PERMISSION_ASSIGN could otherwise collect stars
    if msg.get("no_approval_required") and not _has_permission(entry_data, connection, PERMISSION_STAR_OVERRIDE):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted star-override permission) can create a chore that doesn't require approval.")
        return
    # multi-assignee fan-out - see the schema's own comment on assigned_to_list above.
    raw_assignees = msg.get("assigned_to_list")
    if isinstance(raw_assignees, list) and len(raw_assignees) > 1:
        unique_assignees = list(dict.fromkeys(a for a in raw_assignees if a))
        if not unique_assignees:
            connection.send_error(msg["id"], "missing_assignee", "Pick at least one person to assign this chore to.")
            return
        group_id = chore_engine.new_group_id() if len(unique_assignees) > 1 else None
        is_chores_eligible = await _make_is_chores_eligible(entry_data)
        created: list[dict] = []
        try:
            for assignee in unique_assignees:
                payload = dict(msg)
                payload["assigned_to"] = assignee
                payload["assignment_mode"] = chore_engine.CHORE_ASSIGNMENT_MODE_DIRECT
                payload[CHORE_KEY_GROUP_ID] = group_id
                created.append(chore_engine.create_chore(entry_data["chores"], hass, payload, is_chores_eligible))
        except chore_engine.ChoreError as err:
            # Roll back any chores this same request already created rather than leaving a half-applied multi-assign
            for c in created:
                entry_data["chores"].pop(c["id"], None)
            connection.send_error(msg["id"], err.code, str(err))
            return
        await _save_chores(hass, entry_data)
        connection.send_result(msg["id"], {"chores": created})
        return
    try:
        chore = chore_engine.create_chore(entry_data["chores"], hass, msg, await _make_is_chores_eligible(entry_data))
    except chore_engine.ChoreError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_chores(hass, entry_data)
    connection.send_result(msg["id"], {"chore": chore})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/chores/update",
        vol.Required("chore_id"): str,
        vol.Optional("title"): str,
        vol.Optional("star_value"): int,
        vol.Optional("due_date"): vol.Any(str, None),
        vol.Optional("overdue_penalty"): int,
        vol.Optional("reminder_minutes"): [int],
        vol.Optional("notes"): str,
        vol.Optional("dependencies"): [str],
        vol.Optional("rotation_group"): [str],
        vol.Optional("auto_create_trigger"): vol.Any(dict, None),
        vol.Optional("auto_complete_trigger"): vol.Any(dict, None),
        vol.Optional("recur_type"): vol.Any(str, None),
        vol.Optional("recur_interval_days"): int,
        # Only meaningful when recur_type == "interval" - see chore_engine.
        vol.Optional(CHORE_KEY_RECUR_INTERVAL_UNIT): vol.Any(str, None),
        vol.Optional("recur_weekdays"): [int],
        # see ws_create_chore's identical field.
        vol.Optional(CHORE_KEY_RECUR_MONTH_NTH): vol.Any(int, None),
        # How many minutes after each recurrence reset_recurring_chore should set the fresh due_date to
        vol.Optional(CHORE_KEY_RECUR_DUE_OFFSET_MINUTES): vol.Any(int, None),
        vol.Optional("no_approval_required"): bool,
        vol.Optional("quantity_total"): vol.Any(int, None),
        # optional countdown length in minutes, None to clear.
        vol.Optional("timer_minutes"): vol.Any(int, None),
        # see ws_create_chore's identical field.
        vol.Optional(CHORE_KEY_ALARM_AUDIENCE): vol.Any(str, None),
        # see ws_create_chore's identical field.
        vol.Optional(CHORE_KEY_IMPORTANT): bool,
        vol.Optional(CHORE_KEY_SHOW_ON_CALENDAR): bool,
    }
)
@websocket_api.async_response
async def ws_update_chore(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """gated on PERMISSION_EDIT_CHORE, NOT PERMISSION_ASSIGN - see that permission's own docstring in const.py for why this was split out"""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _has_permission(entry_data, connection, PERMISSION_EDIT_CHORE):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted chore-editing permission) can edit chores.")
        return
    # Same star-override gate ws_create_chore enforces - see its own comment and PERMISSION_STAR_OVERRIDE's docstring in const.py.
    existing_chore = entry_data["chores"].get(msg["chore_id"]) or {}
    if (
        msg.get("no_approval_required")
        and not existing_chore.get("no_approval_required")
        and not _has_permission(entry_data, connection, PERMISSION_STAR_OVERRIDE)
    ):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted star-override permission) can mark a chore as not requiring approval.")
        return
    fields = {k: v for k, v in msg.items() if k not in ("type", "id", "chore_id")}
    try:
        chore = chore_engine.update_chore(entry_data["chores"], msg["chore_id"], fields, await _make_is_chores_eligible(entry_data))
    except chore_engine.ChoreError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_chores(hass, entry_data)
    connection.send_result(msg["id"], {"chore": chore})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/chores/delete", vol.Required("chore_id"): str})
@websocket_api.async_response
async def ws_delete_chore(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _has_permission(entry_data, connection, PERMISSION_ASSIGN):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted chore-assignment permission) can delete chores.")
        return
    try:
        chore_engine.delete_chore(entry_data["chores"], msg["chore_id"])
    except chore_engine.ChoreError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    # a deleted chore's timer has nothing left to count toward.
    await _clear_chore_timers(hass, entry_data, msg["chore_id"])
    await _save_chores(hass, entry_data)
    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/chores/clear_all"})
@websocket_api.async_response
async def ws_clear_all_chores(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """The household's own "developer option to clear all chores" request -
    a full wipe of every chore regardless of status, for starting over
    (testing, a botched import, whatever). Deliberately gated on a real
    hass.user.is_admin rather than PERMISSION_ASSIGN like every other
    chores/* command above - this is destructive and irreversible (no
    confirmation/undo server-side; the card itself is expected to confirm
    before ever sending this), so it's never delegated to a granted
    non-admin permission the way assigning/deleting one chore at a time
    is."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _is_admin(connection):
        connection.send_error(msg["id"], "forbidden", "Only a Home Assistant admin account can clear all chores.")
        return
    count = len(entry_data["chores"])
    entry_data["chores"].clear()
    await _save_chores(hass, entry_data)
    connection.send_result(msg["id"], {"cleared": count})


@websocket_api.websocket_command(
    {vol.Required("type"): "family_hub/chores/assign", vol.Required("chore_id"): str, vol.Required("target"): str}
)
@websocket_api.async_response
async def ws_assign_chore(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """The drag-and-drop action - move a chore between the Chore Bin and a
    specific person's column."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _has_permission(entry_data, connection, PERMISSION_ASSIGN):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted chore-assignment permission) can reassign chores.")
        return
    try:
        chore = chore_engine.assign_chore(
            entry_data["chores"], hass, msg["chore_id"], msg["target"], _actor_id(connection), await _make_is_chores_eligible(entry_data)
        )
    except chore_engine.ChoreError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    # reassigning a chore mid-countdown drops its timer.
    await _clear_chore_timers(hass, entry_data, msg["chore_id"])
    await _save_chores(hass, entry_data)
    connection.send_result(msg["id"], {"chore": chore})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/chores/claim", vol.Required("chore_id"): str})
@websocket_api.async_response
async def ws_claim_chore(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Self-serve claim from the Chore Bin - no permission gate, this is
    the whole point of first_come_first_served/an open chore_bin chore.
    Still requires a logged-in HA user (there is no "claim as guest")."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    user_id = _actor_id(connection)
    if not user_id:
        connection.send_error(msg["id"], "no_user", "Not logged in.")
        return
    try:
        chore = chore_engine.claim_chore(entry_data["chores"], hass, msg["chore_id"], user_id, await _make_is_chores_eligible(entry_data))
    except chore_engine.ChoreError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_chores(hass, entry_data)
    connection.send_result(msg["id"], {"chore": chore})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/chores/set_in_progress",
        vol.Required("chore_id"): str,
        vol.Required("in_progress"): bool,
        vol.Optional("elevation_token"): str,
    }
)
@websocket_api.async_response
async def ws_set_chore_in_progress(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Household ask, verbatim: "Chores should have a button to Mark in
    progress also." Same self-serve gate as ws_complete_chore/
    ws_start_chore_timer: the chore's own assignee can toggle this on
    themselves, and so can anyone with verify or can_complete_any
    (an admin, or a shared wall-tablet login marking it on someone else's
    behalf). This never changes status/approval/stars - see
    chore_engine.set_chore_in_progress's own docstring for why it's a
    plain reversible flag, not a new state-machine step."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    chore = entry_data["chores"].get(msg["chore_id"])
    user_id, is_admin = await _effective_actor(hass, connection, entry_data, msg)
    is_assignee = chore is not None and chore.get("assigned_to") == user_id
    can_toggle_for_others = _has_permission_ctx(entry_data, user_id, is_admin, PERMISSION_VERIFY) or _has_permission_ctx(
        entry_data, user_id, is_admin, PERMISSION_COMPLETE_ANY
    )
    if not is_assignee and not can_toggle_for_others:
        connection.send_error(msg["id"], "forbidden", "Only the person this chore is assigned to (or an admin/verifier/can_complete_any grant) can mark it in progress.")
        return
    try:
        chore = chore_engine.set_chore_in_progress(entry_data["chores"], hass, msg["chore_id"], user_id, msg["in_progress"])
    except chore_engine.ChoreError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_chores(hass, entry_data)
    connection.send_result(msg["id"], {"chore": chore})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/chores/complete",
        vol.Required("chore_id"): str,
        vol.Optional("elevation_token"): str,
    }
)
@websocket_api.async_response
async def ws_complete_chore(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """The assignee can mark their own chore done; so can anyone with verify permission (or a real admin) marking it done on someone else's behalf"""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    chore = entry_data["chores"].get(msg["chore_id"])
    # resolves to whichever household member is "logged in" on this kiosk
    user_id, is_admin = await _effective_actor(hass, connection, entry_data, msg)
    is_assignee = chore is not None and chore.get("assigned_to") == user_id
    can_complete_for_others = _has_permission_ctx(entry_data, user_id, is_admin, PERMISSION_VERIFY) or _has_permission_ctx(
        entry_data, user_id, is_admin, PERMISSION_COMPLETE_ANY
    )
    if not is_assignee and not can_complete_for_others:
        connection.send_error(msg["id"], "forbidden", "Only the person this chore is assigned to (or an admin/verifier/can_complete_any grant) can mark it complete.")
        return
    try:
        chore = chore_engine.complete_chore(
            entry_data["chores"], entry_data["rewards"], hass, msg["chore_id"], user_id,
            permissions=entry_data.get("permissions"),
        )
    except chore_engine.ChoreError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    # completing a chore by hand while a timer is counting down on it just ends the timer
    await _clear_chore_timers(hass, entry_data, msg["chore_id"])
    await _apply_chore_completion_effects(hass, entry_data, chore)
    connection.send_result(msg["id"], {"chore": chore})


async def _apply_chore_completion_effects(hass: HomeAssistant, entry_data: dict[str, Any], chore: dict[str, Any]) -> None:
    """Everything that has to happen AFTER chore_engine.complete_chore succeeds"""
    await _save_chores(hass, entry_data)
    if chore.get("status") == chore_engine.CHORE_STATUS_APPROVED:
        # Auto-approved on completion (chore_skips_verification) - same side effects ws_approve_chore performs after a manual approval: persist the
        await _save_rewards(hass, entry_data)
        await _notify_chore_approved(hass, entry_data, chore)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/chores/request_stars",
        vol.Required("title"): str,
        vol.Required("stars"): int,
        vol.Optional("for_user"): str,
        vol.Optional("notes"): str,
        vol.Optional("elevation_token"): str,
    }
)
@websocket_api.async_response
async def ws_request_stars(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Ask for stars for something that isn't on the chore chart. Anyone in Family Hub can ask for
    themselves; asking for someone else takes chore-assignment permission. It then waits for
    approval like a finished chore, so approving it follows the usual verify permission."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    user_id, is_admin = await _effective_actor(hass, connection, entry_data, msg)
    for_user = msg.get("for_user") or user_id
    if for_user != user_id and not _has_permission_ctx(entry_data, user_id, is_admin, PERMISSION_ASSIGN):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted chore-assignment permission) can ask for stars for someone else.")
        return
    try:
        chore = chore_engine.create_star_request(
            entry_data["chores"], hass, msg.get("title") or "", msg.get("stars"), for_user, user_id,
            notes=(msg.get("notes") or "").strip(), is_user_enabled=await _make_is_chores_eligible(entry_data),
        )
    except chore_engine.ChoreError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_chores(hass, entry_data)
    connection.send_result(msg["id"], {"chore": chore})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/chores/approve",
        vol.Required("chore_id"): str,
        vol.Optional("elevation_token"): str,
    }
)
@websocket_api.async_response
async def ws_approve_chore(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    user_id, is_admin = await _effective_actor(hass, connection, entry_data, msg)
    if not _has_permission_ctx(entry_data, user_id, is_admin, PERMISSION_VERIFY):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted chore-verification permission) can approve chores.")
        return
    try:
        chore = chore_engine.approve_chore(entry_data["chores"], entry_data["rewards"], hass, msg["chore_id"], user_id)
    except chore_engine.ChoreError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_chores(hass, entry_data)
    await _save_rewards(hass, entry_data)
    await _notify_chore_approved(hass, entry_data, chore)
    connection.send_result(msg["id"], {"chore": chore})


async def _notify_chore_approved(hass: HomeAssistant, entry_data: dict[str, Any], chore: dict[str, Any]) -> None:
    """an instant push to the chore's own assignee, gated by their own profile's notifyChoreApproved flag - see const.py's SETTINGS_KEY_USER_PROFILES docstring."""
    assignee = chore.get("assigned_to")
    if not assignee:
        return
    settings = await entry_data["settings_store"].async_load() or {} if entry_data.get("settings_store") else {}
    profile = (settings.get("userProfiles") or {}).get(assignee) or {}
    if not profile.get("notifyChoreApproved"):
        return
    notify_targets = profile.get("notifyTargets") or []
    if not notify_targets:
        return
    stars = int(chore.get("star_value") or 0)
    stars_note = f" (+{stars} star{'s' if stars != 1 else ''})" if stars else ""
    await _send_instant_notification(
        hass, notify_targets, "Family Hub chore approved",
        f"\"{chore.get('title')}\" was approved{stars_note}!",
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/chores/reject",
        vol.Required("chore_id"): str,
        vol.Optional("reason"): str,
        vol.Optional("elevation_token"): str,
    }
)
@websocket_api.async_response
async def ws_reject_chore(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """the other way out of the verification gate - same permission
    tier as ws_approve_chore above (verification authority, not the
    narrower can_complete_any), since sending work back is just as much a
    verifier's call as accepting it."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    user_id, is_admin = await _effective_actor(hass, connection, entry_data, msg)
    if not _has_permission_ctx(entry_data, user_id, is_admin, PERMISSION_VERIFY):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted chore-verification permission) can reject chores.")
        return
    try:
        chore = chore_engine.reject_chore(entry_data["chores"], hass, msg["chore_id"], user_id, msg.get("reason"))
    except chore_engine.ChoreError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    # a turned-down star request has nothing to redo, so it goes away instead of reopening
    if chore.get(CHORE_KEY_STAR_REQUEST):
        entry_data["chores"].pop(chore["id"], None)
    await _save_chores(hass, entry_data)
    await _notify_chore_rejected(hass, entry_data, chore)
    connection.send_result(msg["id"], {"chore": chore})


async def _notify_chore_rejected(hass: HomeAssistant, entry_data: dict[str, Any], chore: dict[str, Any]) -> None:
    """the reject-side twin of _notify_chore_approved right above -
    same "gated by the assignee's own profile flag" shape, see const.py's
    SETTINGS_KEY_USER_PROFILES docstring. Includes the verifier's optional
    reject_reason note (see const.py's CHORE_KEY_REJECT_REASON docstring)
    in the message body when one was given."""
    assignee = chore.get("assigned_to")
    if not assignee:
        return
    settings = await entry_data["settings_store"].async_load() or {} if entry_data.get("settings_store") else {}
    profile = (settings.get("userProfiles") or {}).get(assignee) or {}
    if not profile.get("notifyChoreRejected"):
        return
    notify_targets = profile.get("notifyTargets") or []
    if not notify_targets:
        return
    reason = (chore.get("reject_reason") or "").strip()
    reason_note = f" - {reason}" if reason else ""
    await _send_instant_notification(
        hass, notify_targets, "Family Hub chore sent back",
        f"\"{chore.get('title')}\" was sent back, not approved{reason_note}.",
    )


@websocket_api.websocket_command({vol.Required("type"): "family_hub/chores/nudge", vol.Required("chore_id"): str})
@websocket_api.async_response
async def ws_nudge_chore(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """No permission gate - a lightweight social nudge, not an
    administrative action (any household member can poke any other about
    an active chore)."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    chore = entry_data["chores"].get(msg["chore_id"])
    if chore is None:
        connection.send_error(msg["id"], "not_found", f"No chore with id {msg['chore_id']!r}")
        return
    assignee = chore.get("assigned_to")
    settings = await entry_data["settings_store"].async_load() or {} if entry_data.get("settings_store") else {}
    profile = (settings.get("userProfiles") or {}).get(assignee) or {}
    notify_targets = profile.get("notifyTargets") or []
    sent = await chore_engine.send_nudge(
        hass, chore, actor=_actor_id(connection), notify_targets=notify_targets, split_notify_target=_split_notify_target
    )
    connection.send_result(msg["id"], {"success": True, "sent": sent})


# -------------------------------------------------------------------------- Rewards


@websocket_api.websocket_command({vol.Required("type"): "family_hub/rewards/get_state"})
@websocket_api.async_response
async def ws_get_rewards_state(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    rewards = entry_data["rewards"]
    connection.send_result(
        msg["id"],
        {
            "balances": dict(rewards.get("balances") or {}),
            "catalog": reward_engine.list_catalog(rewards),
            "redemptions": reward_engine.list_redemptions(rewards)[:REDEMPTION_HISTORY_LIMIT],
            # always included, same as catalog/redemptions above - every caller can see what's pending
            "suggestions": reward_engine.list_suggestions(rewards),
            # same full-household transparency as "balances" above (every caller sees everyone's)
            "banks": {uid: dict(bank) for uid, bank in (rewards.get("banks") or {}).items()},
            "bank_usages": reward_engine.list_bank_usages(rewards)[:BANK_USAGE_HISTORY_LIMIT],
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/rewards/add_catalog_item",
        vol.Required("title"): str,
        vol.Required("cost_stars"): int,
        vol.Optional("icon"): str,
        vol.Optional("color"): str,
        # see const.py's REWARD_REDEEM_MODES docstring and
        # reward_engine.add_catalog_item.
        vol.Optional("redeem_mode"): str,
        vol.Optional("requires_fulfillment"): bool,
        vol.Optional("value_note"): str,
        vol.Optional("stack_unit_amount"): vol.Any(int, float),
        vol.Optional("stack_unit_label"): str,
        vol.Optional("timer_minutes"): vol.Any(int, None),
        # see const.py's REWARD_KEY_ALARM_AUDIENCE/
        # TIMER_ALARM_AUDIENCES.
        vol.Optional("alarm_audience"): str,
        vol.Optional("elevation_token"): str,
    }
)
@websocket_api.async_response
async def ws_add_catalog_item(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """gated on _can_add_rewards (reward-override OR the narrower can_add_rewards grant), not reward-override alone - see const.py's PERMISSION_REWARD_ADD."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    actor_id, is_admin = await _effective_actor(hass, connection, entry_data, msg)
    if not _can_add_rewards_ctx(entry_data, actor_id, is_admin):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted reward-add/reward-override permission) can add straight to the catalog - try suggesting it instead.")
        return
    try:
        item = reward_engine.add_catalog_item(
            entry_data["rewards"], msg["title"], msg["cost_stars"], msg.get("icon", ""), msg.get("color", ""),
            redeem_mode=msg.get("redeem_mode", "instant"),
            requires_fulfillment=msg.get("requires_fulfillment", False),
            value_note=msg.get("value_note", ""),
            stack_unit_amount=msg.get("stack_unit_amount", 1),
            stack_unit_label=msg.get("stack_unit_label", ""),
            timer_minutes=msg.get("timer_minutes"),
            alarm_audience=msg.get("alarm_audience"),
        )
    except reward_engine.RewardError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_rewards(hass, entry_data)
    connection.send_result(msg["id"], {"item": item})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/rewards/update_catalog_item",
        vol.Required("item_id"): str,
        vol.Optional("title"): str,
        vol.Optional("cost_stars"): int,
        vol.Optional("icon"): str,
        vol.Optional("color"): str,
        vol.Optional("redeem_mode"): str,
        vol.Optional("requires_fulfillment"): bool,
        vol.Optional("value_note"): str,
        vol.Optional("stack_unit_amount"): vol.Any(int, float),
        vol.Optional("stack_unit_label"): str,
        vol.Optional("timer_minutes"): vol.Any(int, None),
        vol.Optional("alarm_audience"): str,
    }
)
@websocket_api.async_response
async def ws_update_catalog_item(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _has_permission(entry_data, connection, PERMISSION_REWARD_OVERRIDE):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted reward-override permission) can manage the catalog.")
        return
    fields = {k: v for k, v in msg.items() if k not in ("type", "id", "item_id")}
    try:
        item = reward_engine.update_catalog_item(entry_data["rewards"], msg["item_id"], **fields)
    except reward_engine.RewardError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_rewards(hass, entry_data)
    connection.send_result(msg["id"], {"item": item})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/rewards/delete_catalog_item", vol.Required("item_id"): str})
@websocket_api.async_response
async def ws_delete_catalog_item(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _has_permission(entry_data, connection, PERMISSION_REWARD_OVERRIDE):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted reward-override permission) can manage the catalog.")
        return
    try:
        reward_engine.delete_catalog_item(entry_data["rewards"], msg["item_id"])
    except reward_engine.RewardError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_rewards(hass, entry_data)
    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/rewards/redeem",
        vol.Required("item_id"): str,
        vol.Optional("user_id"): str,
        vol.Optional("elevation_token"): str,
    }
)
@websocket_api.async_response
async def ws_redeem_reward(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Instant self-serve claim - redeems for the caller's own id by
    default ("the caller" includes whoever is elevated via a
    kiosk PIN login, so a kid can claim their own reward from a shared
    kiosk without needing any override permission at all - see
    _effective_actor). Redeeming on someone ELSE's behalf (an admin
    claiming something for a login-less child) requires reward-override
    permission - see the "Reward redemption" project decision: claims are
    instant, but claiming for someone else is still an administrative act."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    actor_id, is_admin = await _effective_actor(hass, connection, entry_data, msg)
    target_user_id = msg.get("user_id") or actor_id
    if not target_user_id:
        connection.send_error(msg["id"], "no_user", "Not logged in.")
        return
    if target_user_id != actor_id and not _has_permission_ctx(entry_data, actor_id, is_admin, PERMISSION_REWARD_OVERRIDE):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted reward-override permission) can redeem on someone else's behalf.")
        return
    try:
        redemption = reward_engine.redeem_item(entry_data["rewards"], target_user_id, msg["item_id"])
    except reward_engine.RewardError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_rewards(hass, entry_data)
    await _notify_reward_claimed(hass, entry_data, target_user_id, redemption)
    connection.send_result(msg["id"], {"redemption": redemption, "balance": reward_engine.get_balance(entry_data["rewards"], target_user_id)})


async def _notify_reward_claimed(hass: HomeAssistant, entry_data: dict[str, Any], claimer_id: str, redemption: dict[str, Any]) -> None:
    """an instant push to EVERY profile opted into notifyRewardClaimed
    (not just an admin, not just the claimer) - see const.py's
    SETTINGS_KEY_USER_PROFILES docstring for why this is intentionally
    household-wide rather than scoped to one person. A no-op when nobody's
    opted in."""
    settings = await entry_data["settings_store"].async_load() or {} if entry_data.get("settings_store") else {}
    profiles = settings.get("userProfiles") or {}
    recipients: list[str] = []
    for profile in profiles.values():
        if isinstance(profile, dict) and profile.get("notifyRewardClaimed"):
            recipients.extend(profile.get("notifyTargets") or [])
    if not recipients:
        return
    claimer_name = await _user_display_name(hass, claimer_id)
    cost = int(redemption.get("cost_stars") or 0)
    await _send_instant_notification(
        hass, recipients, "Family Hub reward claimed",
        f"{claimer_name} claimed \"{redemption.get('title')}\" for {cost} star{'s' if cost != 1 else ''}.",
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/rewards/adjust_balance",
        vol.Required("user_id"): str,
        vol.Required("delta"): int,
        vol.Optional("reason"): str,
        vol.Optional("elevation_token"): str,
    }
)
@websocket_api.async_response
async def ws_adjust_balance(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """The explicit "reward override" the spec calls out by name - a manual
    star grant or deduction outside the normal chore-approval/redemption
    flow (e.g. a one-off bonus, or correcting a mistake).

    Same
    root cause (and same fix) as v1.132.9's ws_add_catalog_item bug: this
    handler only ever checked the raw connection identity
    (_has_permission(entry_data, connection, ...)), never an
    elevation_token, so on a shared kiosk display a household member who'd
    just PIN-elevated to an admin/override-permitted account was still
    checked against the SHARED KIOSK's own underlying HA login instead -
    which is exactly why the error insisted "only an admin" even though the
    person really was one. elevation_token is now accepted here too, and
    the permission check is elevation-aware via _effective_actor/
    _has_permission_ctx, matching every other kiosk-aware handler in this
    file. The cards' own _kioskMsg wrapper supplies the token whenever a
    kiosk elevation is active (see family-hub-rewards-card.js's
    _adjustBalance and _submitManageStars) and is simply absent - so this
    falls back to the real connection identity, unchanged - everywhere
    else."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    actor_id, is_admin = await _effective_actor(hass, connection, entry_data, msg)
    if not _has_permission_ctx(entry_data, actor_id, is_admin, PERMISSION_REWARD_OVERRIDE):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted reward-override permission) can adjust balances directly.")
        return
    new_balance = reward_engine.add_stars(entry_data["rewards"], msg["user_id"], msg["delta"], reason=msg.get("reason"))
    await _save_rewards(hass, entry_data)
    connection.send_result(msg["id"], {"balance": new_balance})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/rewards/delete_redemption", vol.Required("redemption_id"): str})
@websocket_api.async_response
async def ws_delete_redemption(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """The "clear" half of the household's "clear redemptions or reverse
    them" request - removes one history entry, balance untouched. See
    reward_engine.delete_redemption's own docstring for how this differs
    from reverse below."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _has_permission(entry_data, connection, PERMISSION_REWARD_OVERRIDE):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted reward-override permission) can clear redemption history.")
        return
    try:
        redemption = reward_engine.delete_redemption(entry_data["rewards"], msg["redemption_id"])
    except reward_engine.RewardError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_rewards(hass, entry_data)
    connection.send_result(msg["id"], {"redemption": redemption})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/rewards/reverse_redemption", vol.Required("redemption_id"): str})
@websocket_api.async_response
async def ws_reverse_redemption(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """The "reverse" half of the same request - removes the entry AND
    refunds its cost_stars back to whoever claimed it. See
    reward_engine.reverse_redemption's own docstring."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _has_permission(entry_data, connection, PERMISSION_REWARD_OVERRIDE):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted reward-override permission) can reverse a redemption.")
        return
    try:
        redemption = reward_engine.reverse_redemption(entry_data["rewards"], msg["redemption_id"])
    except reward_engine.RewardError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_rewards(hass, entry_data)
    connection.send_result(msg["id"], {"redemption": redemption})


@websocket_api.websocket_command(
    {vol.Required("type"): "family_hub/rewards/mark_fulfilled", vol.Required("redemption_id"): str}
)
@websocket_api.async_response
async def ws_mark_fulfilled(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """marks a pending (requires_fulfillment) redemption as
    delivered - "yes, I actually handed over the $20." Same authority tier
    as approving a suggestion (_can_add_rewards - reward-override OR the
    narrower can_add_rewards grant), not the broader reward-override alone,
    since this is "confirm the thing happened" rather than "manage the
    catalog/adjust balances."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _can_add_rewards(entry_data, connection):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted reward-add/reward-override permission) can mark a reward as done.")
        return
    try:
        redemption = reward_engine.mark_redemption_fulfilled(entry_data["rewards"], msg["redemption_id"], _actor_id(connection))
    except reward_engine.RewardError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_rewards(hass, entry_data)
    connection.send_result(msg["id"], {"redemption": redemption})


@websocket_api.websocket_command(
    {vol.Required("type"): "family_hub/rewards/use_bank", vol.Required("item_id"): str, vol.Required("amount"): vol.Any(int, float), vol.Optional("user_id"): str}
)
@websocket_api.async_response
async def ws_use_bank(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """spends part (or all) of a banked reward - "use 1.5 of my 3
    banked hours." Same self-serve-for-yourself/reward-override-for-someone-
    else split as ws_redeem_reward above - using your OWN bank needs no
    permission at all, using someone ELSE's needs reward-override (an
    admin/parent doing it on behalf of a login-less child)."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    actor_id = _actor_id(connection)
    target_user_id = msg.get("user_id") or actor_id
    if not target_user_id:
        connection.send_error(msg["id"], "no_user", "Not logged in.")
        return
    if target_user_id != actor_id and not _has_permission(entry_data, connection, PERMISSION_REWARD_OVERRIDE):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted reward-override permission) can use a bank on someone else's behalf.")
        return
    try:
        usage = reward_engine.use_bank(entry_data["rewards"], target_user_id, msg["item_id"], msg["amount"])
    except reward_engine.RewardError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_rewards(hass, entry_data)
    connection.send_result(msg["id"], {"usage": usage, "bank": reward_engine.get_bank(entry_data["rewards"], target_user_id, msg["item_id"])})


@websocket_api.websocket_command(
    {vol.Required("type"): "family_hub/rewards/mark_bank_usage_fulfilled", vol.Required("usage_id"): str}
)
@websocket_api.async_response
async def ws_mark_bank_usage_fulfilled(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """The use_bank twin of ws_mark_fulfilled above - same authority tier."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _can_add_rewards(entry_data, connection):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted reward-add/reward-override permission) can mark a reward as done.")
        return
    try:
        usage = reward_engine.mark_bank_usage_fulfilled(entry_data["rewards"], msg["usage_id"], _actor_id(connection))
    except reward_engine.RewardError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_rewards(hass, entry_data)
    connection.send_result(msg["id"], {"usage": usage})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/rewards/get_ledger", vol.Required("user_id"): str})
@websocket_api.async_response
async def ws_get_ledger(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """a complete per-user star history (every chore approval/ overdue penalty/redemption/reversal/manual adjustment"""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    ledger = reward_engine.list_ledger(entry_data["rewards"], msg["user_id"])[:LEDGER_HISTORY_LIMIT]
    connection.send_result(msg["id"], {"ledger": ledger})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/rewards/gift_stars",
        vol.Required("to_user_id"): str,
        vol.Required("amount"): int,
        vol.Optional("elevation_token"): str,
    }
)
@websocket_api.async_response
async def ws_gift_stars(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """gift some of the caller's OWN stars to another household
    member - self-serve and instant, same "no admin approval needed" shape
    ws_redeem_reward already has (see reward_engine.gift_stars' own
    docstring). Elevation-aware the same way ws_redeem_reward is (
    - a kid logged in at a shared kiosk can gift their own stars without
    needing any override permission), via _effective_actor. Unlike
    ws_redeem_reward there is no "on someone else's behalf" mode at all -
    a gift only ever moves stars OUT of the actual caller's own balance,
    so there's nothing for a reward-override permission to unlock here."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    actor_id, _is_admin_actor = await _effective_actor(hass, connection, entry_data, msg)
    if not actor_id:
        connection.send_error(msg["id"], "no_user", "Not logged in.")
        return
    to_user_id = msg["to_user_id"]
    from_name = await _user_display_name(hass, actor_id)
    to_name = await _user_display_name(hass, to_user_id)
    try:
        new_from_balance, new_to_balance = reward_engine.gift_stars(
            entry_data["rewards"],
            actor_id,
            to_user_id,
            msg["amount"],
            from_reason=f"Gift to {to_name}",
            to_reason=f"Gift from {from_name}",
        )
    except reward_engine.RewardError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_rewards(hass, entry_data)
    connection.send_result(
        msg["id"],
        {"from_balance": new_from_balance, "to_balance": new_to_balance, "to_user_id": to_user_id, "amount": int(msg["amount"])},
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/rewards/add_suggestion",
        vol.Required("title"): str,
        vol.Optional("icon"): str,
        vol.Optional("color"): str,
    }
)
@websocket_api.async_response
async def ws_add_suggestion(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """open to any authenticated household member, no permission gate at all - this IS the path for whoever doesn't have pricing authority"""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    actor_id = _actor_id(connection)
    if not actor_id:
        connection.send_error(msg["id"], "no_user", "Not logged in.")
        return
    try:
        suggestion = reward_engine.add_suggestion(entry_data["rewards"], actor_id, msg["title"], msg.get("icon", ""), msg.get("color", ""))
    except reward_engine.RewardError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_rewards(hass, entry_data)
    connection.send_result(msg["id"], {"suggestion": suggestion})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/rewards/approve_suggestion",
        vol.Required("suggestion_id"): str,
        vol.Required("cost_stars"): int,
        vol.Optional("icon"): str,
        vol.Optional("color"): str,
        vol.Optional("elevation_token"): str,
    }
)
@websocket_api.async_response
async def ws_approve_suggestion(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    user_id, is_admin = await _effective_actor(hass, connection, entry_data, msg)
    if not _can_add_rewards_ctx(entry_data, user_id, is_admin):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted reward-add/reward-override permission) can approve a suggested reward.")
        return
    try:
        item = reward_engine.approve_suggestion(
            entry_data["rewards"], msg["suggestion_id"], msg["cost_stars"], msg.get("icon"), msg.get("color")
        )
    except reward_engine.RewardError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_rewards(hass, entry_data)
    connection.send_result(msg["id"], {"item": item})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/rewards/reject_suggestion",
        vol.Required("suggestion_id"): str,
        vol.Optional("elevation_token"): str,
    }
)
@websocket_api.async_response
async def ws_reject_suggestion(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    user_id, is_admin = await _effective_actor(hass, connection, entry_data, msg)
    if not _can_add_rewards_ctx(entry_data, user_id, is_admin):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted reward-add/reward-override permission) can reject a suggested reward.")
        return
    try:
        suggestion = reward_engine.reject_suggestion(entry_data["rewards"], msg["suggestion_id"])
    except reward_engine.RewardError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_rewards(hass, entry_data)
    connection.send_result(msg["id"], {"suggestion": suggestion})


# -------------------------------------------------------------------------- Permissions


@websocket_api.websocket_command({vol.Required("type"): "family_hub/permissions/get"})
@websocket_api.async_response
async def ws_get_permissions(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Strictly admin-only (real hass.user.is_admin, not the permissions
    store itself - see this module's docstring for why managing the store
    can never be delegated through the store)."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _is_admin(connection):
        connection.send_error(msg["id"], "forbidden", "Only a Home Assistant admin account can view/manage chore permissions.")
        return
    connection.send_result(msg["id"], {"permissions": dict(entry_data.get("permissions") or {})})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/permissions/get_mine"})
@websocket_api.async_response
async def ws_get_my_permissions(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """the non-admin-safe counterpart to ws_get_permissions above - open to ANY authenticated household member (not admin-only)"""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    connection.send_result(
        msg["id"],
        {
            "is_admin": _is_admin(connection),
            "permissions": {key: _has_permission(entry_data, connection, key) for key in CHORE_PERMISSIONS},
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/permissions/set",
        vol.Required("user_id"): str,
        vol.Optional("can_assign"): bool,
        vol.Optional("can_verify"): bool,
        vol.Optional("can_override_rewards"): bool,
        vol.Optional("can_complete_any"): bool,
        vol.Optional("can_add_rewards"): bool,
        vol.Optional("no_approval_required"): bool,
        vol.Optional("can_edit_chore"): bool,
        vol.Optional("can_star_override"): bool,
        vol.Optional("can_edit_menu"): bool,
        # PERMISSION_SEE_WISHLIST_CLAIMS - see its own docstring in const.py.
        vol.Optional("can_see_wishlist_claims"): bool,
        # bugfix: PERMISSION_DELETE_EVENT/PERMISSION_ROUTINES_ MANAGE_OWN/PERMISSION_ROUTINES_MANAGE_ANY
        vol.Optional("can_delete_event"): bool,
        # PERMISSION_EDIT_EVENT - same trap, missed when can_delete_event was added right above it.
        vol.Optional("can_edit_event"): bool,
        vol.Optional("can_manage_own_routines"): bool,
        vol.Optional("can_manage_any_routines"): bool,
        # PERMISSION_TOGGLE_PRIVACY_MODE - see its own docstring in const.py.
        vol.Optional("can_toggle_privacy_mode"): bool,
    }
)
@websocket_api.async_response
async def ws_set_permissions(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _is_admin(connection):
        connection.send_error(msg["id"], "forbidden", "Only a Home Assistant admin account can view/manage chore permissions.")
        return
    permissions = entry_data.setdefault("permissions", {})
    entry = dict(permissions.get(msg["user_id"]) or {key: False for key in CHORE_PERMISSIONS})
    for key in CHORE_PERMISSIONS:
        if key in msg:
            entry[key] = bool(msg[key])
    permissions[msg["user_id"]] = entry
    await _save_permissions(hass, entry_data)
    connection.send_result(msg["id"], {"permissions": dict(permissions)})


# -------------------------------------------------------------------------- Kiosk PIN login ()


@websocket_api.websocket_command(
    {vol.Required("type"): "family_hub/kiosk/list_login_users"}
)
@websocket_api.async_response
async def ws_kiosk_list_login_users(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Open to any authenticated connection - a kiosk's own shared login
    needs this to show its PIN-login picker. Returns only id/name/has_pin,
    never a hash or salt."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    settings = await _load_settings(entry_data)
    enabled_ids = settings.get("kioskLoginEnabledUserIds") or []
    profiles = settings.get("userProfiles") or {}
    try:
        ha_users = await hass.auth.async_get_users()
    except Exception:  # noqa: BLE001
        ha_users = []
    names = {u.id: (u.name or u.id) for u in ha_users}
    pins = await async_load_pins(hass, entry_data)
    users = [
        {"id": uid, "name": names.get(uid, uid), "has_pin": bool(pins.get(uid))}
        for uid in enabled_ids
        if uid in names
    ]
    connection.send_result(msg["id"], {"users": users})


@websocket_api.websocket_command(
    {vol.Required("type"): "family_hub/kiosk/set_pin", vol.Required("user_id"): str, vol.Optional("pin"): str}
)
@websocket_api.async_response
async def ws_kiosk_set_pin(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Sets a household member's kiosk PIN (4-8 digits), or clears it when
    pin is omitted/blank. Always admin-only - see this section's own
    docstring above for why there's no self-service first-time-set path."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _is_admin(connection):
        connection.send_error(msg["id"], "forbidden", "Only a Home Assistant admin account can set or change a kiosk PIN.")
        return
    pin = (msg.get("pin") or "").strip()
    if pin and (not pin.isdigit() or not (4 <= len(pin) <= 8)):
        connection.send_error(msg["id"], "invalid_pin", "PIN must be 4-8 digits.")
        return
    if entry_data.get("settings_store") is None:
        connection.send_error(msg["id"], "not_found", "Family Hub is not set up")
        return
    await async_set_pin(hass, entry_data, msg["user_id"], pin or None)
    connection.send_result(msg["id"], {"has_pin": bool(pin)})


@websocket_api.websocket_command(
    {vol.Required("type"): "family_hub/kiosk/elevate", vol.Required("user_id"): str, vol.Required("pin"): str}
)
@websocket_api.async_response
async def ws_kiosk_elevate(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Verifies a household member's own PIN and, on success, mints a short-lived server-side elevation token"""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    settings = await _load_settings(entry_data)
    enabled_ids = settings.get("kioskLoginEnabledUserIds") or []
    result = await async_verify_pin(hass, entry_data, msg["user_id"], msg["pin"])
    if result != "ok" or msg["user_id"] not in enabled_ids:
        _send_pin_error(connection, msg["id"], result if result != "ok" else "incorrect", entry_data, msg["user_id"])
        return
    _prune_kiosk_elevations(entry_data)
    token = secrets.token_hex(16)
    _kiosk_elevations(entry_data)[token] = {
        "user_id": msg["user_id"],
        "expires_at": time.time() + KIOSK_ELEVATION_TTL_SECONDS,
    }
    is_admin = await _ha_user_is_admin(hass, msg["user_id"])
    name = await _user_display_name(hass, msg["user_id"])
    connection.send_result(
        msg["id"],
        {
            "token": token,
            "user_id": msg["user_id"],
            "name": name,
            "is_admin": is_admin,
            "permissions": {
                key: _has_permission_ctx(entry_data, msg["user_id"], is_admin, key) for key in CHORE_PERMISSIONS
            },
            "expires_in": KIOSK_ELEVATION_TTL_SECONDS,
        },
    )


@websocket_api.websocket_command({vol.Required("type"): "family_hub/kiosk/deelevate", vol.Required("token"): str})
@websocket_api.async_response
async def ws_kiosk_deelevate(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Explicit logout - called on the 45-second inactivity timeout and on
    a manual "Log out" tap, so a token doesn't sit valid for the rest of
    its KIOSK_ELEVATION_TTL_SECONDS backstop once the UI has already
    hidden the elevated state. Never errors on an already-gone/unknown
    token - logging out twice is a no-op, not a failure."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    _kiosk_elevations(entry_data).pop(msg.get("token"), None)
    connection.send_result(msg["id"], {})


# -------------------------------------------------------------------------- Routines


def _can_write_routine_items(
    entry_data: dict[str, Any], connection: websocket_api.ActiveConnection, target_user_id: Optional[str]
) -> bool:
    """Shared by ws_create_routine_item/ws_update_routine_item/ ws_delete_routine_item/ws_reorder_routine_items below - the one place this rule is decided"""
    if _is_admin(connection):
        return True
    if _has_permission(entry_data, connection, PERMISSION_ASSIGN):
        return True
    if _has_permission(entry_data, connection, PERMISSION_ROUTINES_MANAGE_ANY):
        return True
    if _has_permission(entry_data, connection, PERMISSION_ROUTINES_MANAGE_OWN):
        actor = _actor_id(connection)
        if actor and target_user_id and actor == target_user_id:
            return True
    return False


@websocket_api.websocket_command({vol.Required("type"): "family_hub/routines/list"})
@websocket_api.async_response
async def ws_list_routines(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    connection.send_result(
        msg["id"],
        {"items": list(entry_data["routines"].get("items", {}).values()), "categories": list(ROUTINE_CATEGORIES)},
    )


# Read-only, no permission gate (same as ws_list_routines/ws_list_chores - it's just a menu of suggestions, not anyone's actual data)
@websocket_api.websocket_command({vol.Required("type"): "family_hub/routines/library"})
@websocket_api.async_response
async def ws_list_routine_library(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    connection.send_result(msg["id"], {"items": libraries.get_items(await async_load_libraries(entry_data), libraries.KIND_ROUTINES)})


# -------------------------------------------------------------------------- Editable libraries (routines/chores/rewards)


def _libraries_store(entry_data: dict[str, Any]):
    store = entry_data.get("libraries_store")
    if store is None:
        store = _MemoryStore()
        entry_data["libraries_store"] = store
    return store


async def async_load_libraries(entry_data: dict[str, Any]) -> dict[str, Any]:
    data = entry_data.get("libraries")
    if data is None:
        data = await _libraries_store(entry_data).async_load() or {}
        entry_data["libraries"] = data
    return data


def _can_edit_library(entry_data: dict[str, Any], user_id: Optional[str], is_admin: bool, kind: str) -> bool:
    """Same people who can make the real thing: assigners for chores, reward adders for rewards,
    assigners or anyone managing everyone's routines for routines. Admins always."""
    if kind == libraries.KIND_CHORES:
        return _has_permission_ctx(entry_data, user_id, is_admin, PERMISSION_ASSIGN)
    if kind == libraries.KIND_REWARDS:
        return _can_add_rewards_ctx(entry_data, user_id, is_admin)
    return _has_permission_ctx(entry_data, user_id, is_admin, PERMISSION_ASSIGN) or _has_permission_ctx(
        entry_data, user_id, is_admin, PERMISSION_ROUTINES_MANAGE_ANY
    )


_LIBRARY_KIND = vol.In(list(libraries.KINDS))


@websocket_api.websocket_command({vol.Required("type"): "family_hub/library/list", vol.Required("kind"): _LIBRARY_KIND, vol.Optional("elevation_token"): str})
@websocket_api.async_response
async def ws_library_list(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    user_id, is_admin = await _effective_actor(hass, connection, entry_data, msg)
    data = await async_load_libraries(entry_data)
    connection.send_result(msg["id"], {
        "items": libraries.get_items(data, msg["kind"]),
        "can_edit": _can_edit_library(entry_data, user_id, is_admin, msg["kind"]),
    })


async def _library_write(hass, connection, msg, action) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    user_id, is_admin = await _effective_actor(hass, connection, entry_data, msg)
    if not _can_edit_library(entry_data, user_id, is_admin, msg["kind"]):
        connection.send_error(msg["id"], "forbidden", "You don't have permission to change this library.")
        return
    data = await async_load_libraries(entry_data)
    try:
        result = action(data)
    except ValueError as err:
        code = str(err)
        connection.send_error(msg["id"], code, "Give it a name." if code == "invalid_title" else "That library is full.")
        return
    await _libraries_store(entry_data).async_save(data)
    connection.send_result(msg["id"], {"result": result, "items": libraries.get_items(data, msg["kind"])})


@websocket_api.websocket_command(
    {vol.Required("type"): "family_hub/library/save_item", vol.Required("kind"): _LIBRARY_KIND, vol.Required("item"): dict, vol.Optional("elevation_token"): str}
)
@websocket_api.async_response
async def ws_library_save_item(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    await _library_write(hass, connection, msg, lambda data: libraries.save_item(data, msg["kind"], msg["item"]))


@websocket_api.websocket_command(
    {vol.Required("type"): "family_hub/library/delete_item", vol.Required("kind"): _LIBRARY_KIND, vol.Required("item_id"): str, vol.Optional("elevation_token"): str}
)
@websocket_api.async_response
async def ws_library_delete_item(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    await _library_write(hass, connection, msg, lambda data: libraries.delete_item(data, msg["kind"], msg["item_id"]))


@websocket_api.websocket_command({vol.Required("type"): "family_hub/library/reset", vol.Required("kind"): _LIBRARY_KIND, vol.Optional("elevation_token"): str})
@websocket_api.async_response
async def ws_library_reset(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    # adds back removed built-in items; keeps everything the household added or changed
    await _library_write(hass, connection, msg, lambda data: {"restored": len(libraries.reset(data, msg["kind"]))})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/routines/create",
        vol.Required("user_id"): str,
        vol.Required("category"): str,
        vol.Required("title"): str,
        # both optional, same shape/validation as routine_engine.py's _validate_due_time/_validate_days_of_week
        vol.Optional("due_time"): vol.Any(str, None),
        vol.Optional("days_of_week"): [int],
        vol.Optional("star_value"): int,
        vol.Optional("no_approval_required"): bool,
        # ) - same loose shape as ws_create_chore's auto_create_trigger/auto_ complete_trigger just above: any dict or None
        vol.Optional("auto_complete_trigger"): vol.Any(dict, None),
    }
)
@websocket_api.async_response
async def ws_create_routine_item(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _can_write_routine_items(entry_data, connection, msg["user_id"]):
        connection.send_error(
            msg["id"],
            "forbidden",
            "You don't have permission to add routine items for that person. Ask an admin to grant you routine-management permission (for your own items, or for everyone's) under Settings → Permissions.",
        )
        return
    try:
        item = routine_engine.create_item(
            entry_data["routines"],
            msg["user_id"],
            msg["category"],
            msg["title"],
            await _make_is_user_enabled(entry_data),
            due_time=msg.get("due_time"),
            days_of_week=msg.get("days_of_week"),
            star_value=msg.get("star_value") or 0,
            no_approval_required=bool(msg.get("no_approval_required")),
            auto_complete_trigger=msg.get("auto_complete_trigger"),
        )
    except routine_engine.RoutineError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_routines(hass, entry_data)
    connection.send_result(msg["id"], {"item": item})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/routines/update",
        vol.Required("item_id"): str,
        vol.Required("title"): str,
        vol.Optional("due_time"): vol.Any(str, None),
        vol.Optional("days_of_week"): [int],
        vol.Optional("star_value"): int,
        vol.Optional("no_approval_required"): bool,
        vol.Optional("auto_complete_trigger"): vol.Any(dict, None),
    }
)
@websocket_api.async_response
async def ws_update_routine_item(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Edit an existing item's title/due_time/days_of_week/auto_complete_
    trigger - the "manage items" flow (v136+, see routine_engine.
    update_item). Same _can_write_routine_items gate as create/delete just
    above/below (v1.132.47+, see that helper's own docstring for the full
    own-vs-any reasoning) - editing an item is exactly as privileged an
    operation as adding or removing one, not the low-stakes self-serve
    checkbox toggle ws_toggle_routine_item is. Unlike create/reorder
    (which carry a "user_id" field directly in the request), an update only
    ever carries the item's own item_id - so the item is looked up FIRST,
    purely to read its existing "user_id" for the ownership check, before
    any permission decision or the actual update_item() mutation call."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    existing = entry_data["routines"].get("items", {}).get(msg["item_id"])
    target_user_id = existing.get("user_id") if existing else None
    if not _can_write_routine_items(entry_data, connection, target_user_id):
        connection.send_error(
            msg["id"],
            "forbidden",
            "You don't have permission to edit that person's routine items. Ask an admin to grant you routine-management permission (for your own items, or for everyone's) under Settings → Permissions.",
        )
        return
    try:
        item = routine_engine.update_item(
            entry_data["routines"],
            msg["item_id"],
            msg["title"],
            due_time=msg.get("due_time"),
            days_of_week=msg.get("days_of_week"),
            star_value=msg.get("star_value") or 0,
            no_approval_required=bool(msg.get("no_approval_required")),
            auto_complete_trigger=msg.get("auto_complete_trigger"),
        )
    except routine_engine.RoutineError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_routines(hass, entry_data)
    connection.send_result(msg["id"], {"item": item})


@websocket_api.websocket_command(
    {vol.Required("type"): "family_hub/routines/toggle", vol.Required("item_id"): str, vol.Required("done"): bool}
)
@websocket_api.async_response
async def ws_toggle_routine_item(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Checking an item off is open to anyone with access to the card - no permission gate, same low-stakes self-serve principle as ws_claim_chore."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    existing = entry_data["routines"].get("items", {}).get(msg["item_id"])
    was_done = bool(existing.get("done")) if existing else False
    try:
        item = routine_engine.toggle_item(
            entry_data["routines"], entry_data["rewards"], msg["item_id"], msg["done"], _actor_id(connection),
        )
    except routine_engine.RoutineError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_routines(hass, entry_data)
    if item.get("stars_disbursed_today"):
        await _save_rewards(hass, entry_data)
    actor = _actor_id(connection)
    _fire_routine_event(hass, event="item_toggled", item=item, actor=actor, done=item.get("done"))
    if item.get("done") and not was_done and routine_engine.is_routine_complete(
        entry_data["routines"], item["user_id"], item["category"]
    ):
        _fire_routine_event(hass, event="routine_completed", user_id=item["user_id"], category=item["category"], actor=actor)
    connection.send_result(msg["id"], {"item": item})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/routines/approve_item", vol.Required("item_id"): str})
@websocket_api.async_response
async def ws_approve_routine_item(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """The manual half of a routine item's star payout (routine_engine."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _has_permission(entry_data, connection, PERMISSION_VERIFY):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted verify permission) can approve a routine item's stars.")
        return
    try:
        item = routine_engine.approve_item(entry_data["routines"], entry_data["rewards"], msg["item_id"], _actor_id(connection))
    except routine_engine.RoutineError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_routines(hass, entry_data)
    await _save_rewards(hass, entry_data)
    _fire_routine_event(hass, event="item_approved", item=item, actor=_actor_id(connection), done=True)
    connection.send_result(msg["id"], {"item": item})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/routines/delete", vol.Required("item_id"): str})
@websocket_api.async_response
async def ws_delete_routine_item(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """same _can_write_routine_items gate as create/update above
    (see that helper's own docstring) - looks up the existing item first,
    purely to read its "user_id" for the ownership check, same reasoning as
    ws_update_routine_item just above."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    existing = entry_data["routines"].get("items", {}).get(msg["item_id"])
    target_user_id = existing.get("user_id") if existing else None
    if not _can_write_routine_items(entry_data, connection, target_user_id):
        connection.send_error(
            msg["id"],
            "forbidden",
            "You don't have permission to remove that person's routine items. Ask an admin to grant you routine-management permission (for your own items, or for everyone's) under Settings → Permissions.",
        )
        return
    try:
        routine_engine.delete_item(entry_data["routines"], msg["item_id"])
    except routine_engine.RoutineError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_routines(hass, entry_data)
    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/routines/reorder",
        vol.Required("user_id"): str,
        vol.Required("category"): str,
        vol.Required("item_ids"): [str],
    }
)
@websocket_api.async_response
async def ws_reorder_routine_items(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """persists a drag-and-drop reorder of one person's one routine category (routine_engine."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _can_write_routine_items(entry_data, connection, msg["user_id"]):
        connection.send_error(
            msg["id"],
            "forbidden",
            "You don't have permission to reorder that person's routine items. Ask an admin to grant you routine-management permission (for your own items, or for everyone's) under Settings → Permissions.",
        )
        return
    try:
        items = routine_engine.reorder_items(entry_data["routines"], msg["user_id"], msg["category"], msg["item_ids"])
    except routine_engine.RoutineError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_routines(hass, entry_data)
    connection.send_result(msg["id"], {"items": items})


# -------------------------------------------------------------------------- Goals


@websocket_api.websocket_command({vol.Required("type"): "family_hub/goals/list"})
@websocket_api.async_response
async def ws_list_goals(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    connection.send_result(msg["id"], {"goals": list(entry_data["goals"].values())})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/goals/create",
        vol.Required("title"): str,
        vol.Required("assigned_to"): str,
        vol.Optional("target_count"): int,
        vol.Optional("notes"): str,
        vol.Optional("due_date"): vol.Any(str, None),
        vol.Optional("reward_type"): str,
        vol.Optional("star_value"): int,
        vol.Optional("reward_item_id"): vol.Any(str, None),
    }
)
@websocket_api.async_response
async def ws_create_goal(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _has_permission(entry_data, connection, PERMISSION_ASSIGN):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted chore-assignment permission) can create goals.")
        return
    try:
        goal = goal_engine.create_goal(entry_data["goals"], hass, msg, await _make_is_chores_eligible(entry_data))
    except goal_engine.GoalError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_goals(hass, entry_data)
    connection.send_result(msg["id"], {"goal": goal})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/goals/update",
        vol.Required("goal_id"): str,
        vol.Optional("title"): str,
        vol.Optional("assigned_to"): str,
        vol.Optional("target_count"): int,
        vol.Optional("notes"): str,
        vol.Optional("due_date"): vol.Any(str, None),
        vol.Optional("reward_type"): str,
        vol.Optional("star_value"): int,
        vol.Optional("reward_item_id"): vol.Any(str, None),
    }
)
@websocket_api.async_response
async def ws_update_goal(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _has_permission(entry_data, connection, PERMISSION_ASSIGN):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted chore-assignment permission) can edit goals.")
        return
    fields = {k: v for k, v in msg.items() if k not in ("type", "id", "goal_id")}
    try:
        goal = goal_engine.update_goal(entry_data["goals"], msg["goal_id"], fields, await _make_is_chores_eligible(entry_data))
    except goal_engine.GoalError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_goals(hass, entry_data)
    connection.send_result(msg["id"], {"goal": goal})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/goals/delete", vol.Required("goal_id"): str})
@websocket_api.async_response
async def ws_delete_goal(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _has_permission(entry_data, connection, PERMISSION_ASSIGN):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted chore-assignment permission) can delete goals.")
        return
    try:
        goal_engine.delete_goal(entry_data["goals"], msg["goal_id"])
    except goal_engine.GoalError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_goals(hass, entry_data)
    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/goals/clear_all"})
@websocket_api.async_response
async def ws_clear_all_goals(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Goals' own counterpart to ws_clear_all_chores above - same
    admin-only, destructive, no-confirmation-server-side reasoning."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _is_admin(connection):
        connection.send_error(msg["id"], "forbidden", "Only a Home Assistant admin account can clear all goals.")
        return
    count = len(entry_data["goals"])
    entry_data["goals"].clear()
    await _save_goals(hass, entry_data)
    connection.send_result(msg["id"], {"cleared": count})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/goals/log_progress", vol.Required("goal_id"): str})
@websocket_api.async_response
async def ws_log_goal_progress(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """The self-report tap - "I practiced just now." Same permission shape
    as ws_complete_chore: the goal's own assignee can log their own
    progress, and so can anyone with verify or the narrower
    can_complete_any grant (or a real admin) logging on their behalf (e.g.
    a young child with no HA login of their own)."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    goal = entry_data["goals"].get(msg["goal_id"])
    user_id = _actor_id(connection)
    is_assignee = goal is not None and goal.get("assigned_to") == user_id
    can_log_for_others = _has_permission(entry_data, connection, PERMISSION_VERIFY) or _has_permission(
        entry_data, connection, PERMISSION_COMPLETE_ANY
    )
    if not is_assignee and not can_log_for_others:
        connection.send_error(msg["id"], "forbidden", "Only the person this goal belongs to (or an admin/verifier/can_complete_any grant) can log progress on it.")
        return
    try:
        goal = goal_engine.log_progress(entry_data["goals"], hass, msg["goal_id"], user_id)
    except goal_engine.GoalError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_goals(hass, entry_data)
    connection.send_result(msg["id"], {"goal": goal})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/goals/approve",
        vol.Required("goal_id"): str,
        vol.Optional("elevation_token"): str,
    }
)
@websocket_api.async_response
async def ws_approve_goal(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    user_id, is_admin = await _effective_actor(hass, connection, entry_data, msg)
    if not _has_permission_ctx(entry_data, user_id, is_admin, PERMISSION_VERIFY):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted chore-verification permission) can approve goals.")
        return
    try:
        goal = goal_engine.approve_goal(entry_data["goals"], entry_data["rewards"], hass, msg["goal_id"], user_id)
    except goal_engine.GoalError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_goals(hass, entry_data)
    await _save_rewards(hass, entry_data)
    await _notify_goal_approved(hass, entry_data, goal)
    connection.send_result(msg["id"], {"goal": goal})


async def _notify_goal_approved(hass: HomeAssistant, entry_data: dict[str, Any], goal: dict[str, Any]) -> None:
    """The Goals-feature counterpart of _notify_chore_approved - an instant
    push to the goal's own assignee, gated by their own profile's
    notifyGoalApproved flag."""
    assignee = goal.get("assigned_to")
    if not assignee:
        return
    settings = await entry_data["settings_store"].async_load() or {} if entry_data.get("settings_store") else {}
    profile = (settings.get("userProfiles") or {}).get(assignee) or {}
    if not profile.get("notifyGoalApproved"):
        return
    notify_targets = profile.get("notifyTargets") or []
    if not notify_targets:
        return
    reward_note = ""
    if goal.get("reward_type") == "stars":
        stars = int(goal.get("star_value") or 0)
        if stars:
            reward_note = f" (+{stars} star{'s' if stars != 1 else ''})"
    await _send_instant_notification(
        hass, notify_targets, "Family Hub goal achieved",
        f"\"{goal.get('title')}\" was approved{reward_note}!",
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/goals/archive",
        vol.Required("goal_id"): str,
    }
)
@websocket_api.async_response
async def ws_archive_goal(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """The "Complete" button on an achieved goal - tucks it into the My
    Goals Completed accordion instead of leaving it sitting in the active
    list forever (see goal_engine.archive_goal's own docstring). Same
    permission shape as ws_log_goal_progress: the goal's own assignee can
    archive their own achieved goal, and so can anyone who could otherwise
    manage goals (PERMISSION_ASSIGN) or a real admin - no separate
    verification-tier gate needed here since nothing is being disbursed or
    reversed, just tidied away."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    goal = entry_data["goals"].get(msg["goal_id"])
    user_id = _actor_id(connection)
    is_assignee = goal is not None and goal.get("assigned_to") == user_id
    can_manage = _has_permission(entry_data, connection, PERMISSION_ASSIGN) or _is_admin(connection)
    if not is_assignee and not can_manage:
        connection.send_error(msg["id"], "forbidden", "Only the person this goal belongs to (or an admin/goal-manager) can archive it.")
        return
    try:
        goal = goal_engine.archive_goal(entry_data["goals"], hass, msg["goal_id"], user_id)
    except goal_engine.GoalError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_goals(hass, entry_data)
    connection.send_result(msg["id"], {"goal": goal})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/goals/reject",
        vol.Required("goal_id"): str,
        vol.Optional("reason"): str,
        vol.Optional("elevation_token"): str,
    }
)
@websocket_api.async_response
async def ws_reject_goal(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    user_id, is_admin = await _effective_actor(hass, connection, entry_data, msg)
    if not _has_permission_ctx(entry_data, user_id, is_admin, PERMISSION_VERIFY):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted chore-verification permission) can reject goals.")
        return
    try:
        goal = goal_engine.reject_goal(entry_data["goals"], hass, msg["goal_id"], user_id, msg.get("reason"))
    except goal_engine.GoalError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_goals(hass, entry_data)
    await _notify_goal_rejected(hass, entry_data, goal)
    connection.send_result(msg["id"], {"goal": goal})


async def _notify_goal_rejected(hass: HomeAssistant, entry_data: dict[str, Any], goal: dict[str, Any]) -> None:
    """The reject-side twin of _notify_goal_approved above - same "gated by
    the assignee's own profile flag" shape."""
    assignee = goal.get("assigned_to")
    if not assignee:
        return
    settings = await entry_data["settings_store"].async_load() or {} if entry_data.get("settings_store") else {}
    profile = (settings.get("userProfiles") or {}).get(assignee) or {}
    if not profile.get("notifyGoalRejected"):
        return
    notify_targets = profile.get("notifyTargets") or []
    if not notify_targets:
        return
    reason = (goal.get("reject_reason") or "").strip()
    reason_note = f" - {reason}" if reason else ""
    await _send_instant_notification(
        hass, notify_targets, "Family Hub goal sent back",
        f"\"{goal.get('title')}\" was sent back, not approved{reason_note}.",
    )



# -------------------------------------------------------------------------- Chore/reward timers - "2 hours of gaming


def _timers_state(entry_data: dict[str, Any]) -> dict[str, Any]:
    """The in-memory timers dict, created on first use. Mirrors how
    entry_data["chores"]/["rewards"] are held alongside their Store."""
    state = entry_data.get("timers")
    if not isinstance(state, dict):
        state = {"timers": []}
        entry_data["timers"] = state
    return state


async def _save_timers(hass: HomeAssistant, entry_data: dict[str, Any]) -> None:
    store = entry_data.get("timers_store")
    if store is not None:
        await store.async_save(_timers_state(entry_data))




# -------------------------------------------------------------------------- Native Home Assistant timer.* integration "this should use the


def slugify_for_entity(name: str) -> str:
    """Match Home Assistant's own slugify closely enough for the names Family Hub generates: lowercase"""
    out = []
    prev_us = False
    for ch in str(name or "").lower():
        if ch.isalnum() and ch.isascii():
            out.append(ch)
            prev_us = False
        elif not prev_us:
            out.append("_")
            prev_us = True
    return "".join(out).strip("_")


async def dedicated_timer_entity_id(hass: HomeAssistant, user_id: Optional[str]) -> Optional[str]:
    """The entity_id of this person's OWN auto-created timer helper, or None for a timer with nobody assigned."""
    if not user_id:
        return None
    slug = slugify_for_entity(await _user_display_name(hass, user_id))
    if not slug:
        return None
    return f"{TIMER_ENTITY_PREFIX}_{slug}"


def _is_free_native_timer(hass: HomeAssistant, entity_id: str, bound: set) -> bool:
    """Idle, ours to use, and not already counting down for somebody else."""
    if entity_id in bound:
        return False
    state = hass.states.get(entity_id)
    return state is not None and str(state.state) == "idle"


async def _pick_native_timer(
    hass: HomeAssistant, entry_data: dict[str, Any], timer: dict[str, Any]
) -> Optional[str]:
    """Choose which native timer helper should run this countdown."""
    bound = timer_engine.bound_entity_ids(_timers_state(entry_data))

    own = await dedicated_timer_entity_id(hass, timer.get("user_id"))
    if own and _is_free_native_timer(hass, own, bound):
        return own

    for index in range(1, TIMER_FAMILY_POOL_SIZE + 1):
        entity_id = f"{TIMER_FAMILY_ENTITY_PREFIX}{index}"
        if _is_free_native_timer(hass, entity_id, bound):
            return entity_id

    # Anything else the household has made under the naming convention - sorted so the choice is deterministic rather than state-order luck.
    others = []
    for state in hass.states.async_all("timer"):
        entity_id = state.entity_id
        if not entity_id.startswith(TIMER_ENTITY_PREFIX):
            continue
        if entity_id.startswith(TIMER_FAMILY_ENTITY_PREFIX):
            continue
        if await _is_someone_elses_dedicated_timer(hass, entry_data, entity_id, timer.get("user_id")):
            continue
        if _is_free_native_timer(hass, entity_id, bound):
            others.append(entity_id)
    return sorted(others)[0] if others else None


async def _is_someone_elses_dedicated_timer(
    hass: HomeAssistant, entry_data: dict[str, Any], entity_id: str, for_user_id: Optional[str]
) -> bool:
    """True when this helper is another household member's own named timer."""
    settings_store = entry_data.get("settings_store")
    settings = (await settings_store.async_load() or {}) if settings_store is not None else {}
    for member_id in settings.get("memberUserIds") or []:
        if member_id == for_user_id:
            continue
        if await dedicated_timer_entity_id(hass, member_id) == entity_id:
            return True
    return False


async def _adopt_native_timer(hass: HomeAssistant, entry_data: dict[str, Any], timer: dict[str, Any]) -> None:
    """Hand this timer's countdown to a free native timer.* entity, if there is one."""
    try:
        entity_id = await _pick_native_timer(hass, entry_data, timer)
        if not entity_id:
            return
        # duration_minutes can now be fractional (a sub-minute standalone timer - "can we make the timer accept seconds")
        total_seconds = round(float(timer.get("duration_minutes") or 0) * 60)
        hh, rem = divmod(total_seconds, 3600)
        mm, ss = divmod(rem, 60)
        await hass.services.async_call(
            "timer",
            "start",
            {"entity_id": entity_id, "duration": f"{hh:02d}:{mm:02d}:{ss:02d}"},
            blocking=True,
        )
        timer["entity_id"] = entity_id
    except Exception as err:  # noqa: BLE001 - never let this break starting a timer
        _LOGGER.debug("Family Hub: could not adopt a native timer entity: %s", err)
        timer.pop("entity_id", None)


async def _release_native_timer(hass: HomeAssistant, timer: dict[str, Any], *, cancel: bool = True) -> None:
    """Give a native entity back to the pool. `cancel=True` stops a still-
    running countdown (our timer was cancelled); `cancel=False` is for a
    timer that already fired, where HA has returned the helper to idle by
    itself and calling cancel would be a pointless extra service call.
    """
    entity_id = timer.get("entity_id")
    if not entity_id or not cancel:
        return
    try:
        await hass.services.async_call("timer", "cancel", {"entity_id": entity_id}, blocking=True)
    except Exception as err:  # noqa: BLE001 - the Family Hub record is the source of truth
        _LOGGER.debug("Family Hub: could not cancel native timer %s: %s", entity_id, err)


# -------------------------------------------------------------------------- v1.168.74 timer + alarm overhaul: exact-second firing
TIMER_SOURCES = ("chores", "rewards", "timers", "calendar", "automation", "voice", "other")


def _timer_unsubs(entry_data: dict[str, Any]) -> dict[str, Any]:
    return entry_data.setdefault("timer_unsubs", {})


def _unschedule_timer(entry_data: dict[str, Any], uid: Optional[str]) -> None:
    unsub = _timer_unsubs(entry_data).pop(uid, None) if uid else None
    if unsub is not None:
        try:
            unsub()
        except Exception:  # noqa: BLE001
            pass


def schedule_timer(hass: HomeAssistant, entry_data: dict[str, Any], timer: dict[str, Any]) -> None:
    """Fire this timer on the exact second it ends (the 15-second sweep is
    only the backstop now - a kitchen timer going off half a minute late
    reads as broken). Also called for every stored timer at startup."""
    uid = timer.get("uid")
    end = timer_engine.ends_at(timer)
    if not uid or end is None:
        return
    _unschedule_timer(entry_data, uid)

    async def _due(_now=None) -> None:
        _timer_unsubs(entry_data).pop(uid, None)
        try:
            fired = await _expire_due_timers(hass, entry_data)
        except Exception as err:  # noqa: BLE001
            _LOGGER.warning("Family Hub: timer %s failed to fire on time: %s", uid, err)
            return
        if fired:
            try:
                from .todo import refresh_chore_todo_lists

                refresh_chore_todo_lists(entry_data)
            except Exception:  # noqa: BLE001
                pass

    try:
        _timer_unsubs(entry_data)[uid] = async_track_point_in_utc_time(hass, _due, end)
    except Exception as err:  # noqa: BLE001 - the sweep still covers it
        _LOGGER.debug("Family Hub: could not schedule timer %s exactly: %s", uid, err)


def _timer_log(entry_data: dict[str, Any]) -> list[dict[str, Any]]:
    log = entry_data.get("timer_log")
    if not isinstance(log, list):
        log = []
        entry_data["timer_log"] = log
    return log


async def async_load_timer_log(entry_data: dict[str, Any]) -> list[dict[str, Any]]:
    if not entry_data.get("timer_log_loaded"):
        entry_data["timer_log_loaded"] = True
        store = entry_data.get("timer_log_store")
        loaded = (await store.async_load()) if store is not None else None
        if isinstance(loaded, dict) and isinstance(loaded.get("entries"), list):
            # anything logged in memory before the load finished stays on top
            current = _timer_log(entry_data)
            seen = {e.get("uid") for e in current}
            current.extend(e for e in loaded["entries"] if isinstance(e, dict) and e.get("uid") not in seen)
    return _timer_log(entry_data)


async def _save_timer_log(entry_data: dict[str, Any]) -> None:
    log = _timer_log(entry_data)
    del log[TIMER_LOG_MAX_ENTRIES:]
    store = entry_data.get("timer_log_store")
    if store is not None:
        try:
            await store.async_save({"entries": log})
        except Exception as err:  # noqa: BLE001 - the log must never break a timer
            _LOGGER.debug("Family Hub: could not save the timer log: %s", err)


async def _log_timer_update(entry_data: dict[str, Any], uid: Optional[str], fields: dict[str, Any]) -> None:
    """Merge fields into the log entry for this timer (alarm fields merge
    into its own "alarm" dict)."""
    if not uid:
        return
    log = await async_load_timer_log(entry_data)
    entry = next((e for e in log if e.get("uid") == uid), None)
    if entry is None:
        return
    alarm = fields.pop("alarm", None)
    entry.update(fields)
    if isinstance(alarm, dict):
        merged = dict(entry.get("alarm") or {})
        merged.update(alarm)
        entry["alarm"] = merged
    await _save_timer_log(entry_data)


async def _timer_event_payload(hass: HomeAssistant, timer: dict[str, Any], **extra: Any) -> dict[str, Any]:
    end = timer_engine.ends_at(timer)
    payload = {
        "uid": timer.get("uid"),
        "kind": timer.get("kind"),
        "chore_id": timer.get("chore_id"),
        "reward_item_id": timer.get("item_id"),
        "title": timer.get("title"),
        "user_id": timer.get("user_id") or None,
        "user_name": await _user_display_name(hass, timer.get("user_id")) if timer.get("user_id") else None,
        "started_by": timer.get("started_by") or None,
        "source": timer.get("source") or None,
        "native_timer_entity_id": timer.get("entity_id"),
        "started_at": timer.get("started_at"),
        "duration_minutes": timer.get("duration_minutes"),
        "ends_at": end.isoformat() if end else None,
    }
    payload.update(extra)
    return payload


async def _after_timer_started(
    hass: HomeAssistant, entry_data: dict[str, Any], timer: dict[str, Any], actor_id: Optional[str], source: Optional[str]
) -> None:
    """Everything that happens once a timer is running, whoever started it:
    exact-second scheduling, the log entry and the started event."""
    if actor_id and not timer.get("started_by"):
        timer["started_by"] = actor_id
    src = (source or "").strip().lower()
    timer["source"] = src if src in TIMER_SOURCES else (src[:20] or "other")
    schedule_timer(hass, entry_data, timer)
    log = await async_load_timer_log(entry_data)
    end = timer_engine.ends_at(timer)
    log.insert(0, {
        "uid": timer.get("uid"),
        "kind": timer.get("kind"),
        "title": timer.get("title") or "",
        "user_id": timer.get("user_id") or None,
        "user_name": await _user_display_name(hass, timer.get("user_id")) if timer.get("user_id") else None,
        "started_by": timer.get("started_by") or None,
        "started_by_name": await _user_display_name(hass, timer.get("started_by")) if timer.get("started_by") else None,
        "source": timer.get("source"),
        "chore_id": timer.get("chore_id"),
        "item_id": timer.get("item_id"),
        "duration_minutes": timer.get("duration_minutes"),
        "audience": timer_engine.normalize_alarm_audience(timer.get("alarm_audience")),
        "started_at": timer.get("started_at"),
        "ends_at": end.isoformat() if end else None,
        "outcome": "running",
    })
    await _save_timer_log(entry_data)
    hass.bus.async_fire(EVENT_FAMILY_HUB_TIMER_STARTED, await _timer_event_payload(hass, timer))


async def _after_timer_cancelled(
    hass: HomeAssistant, entry_data: dict[str, Any], timer: dict[str, Any], by_user_id: Optional[str], reason: str
) -> None:
    """A timer that stopped WITHOUT finishing - cancelled on a card, from
    Home Assistant's own timer UI, by an automation, or because its chore
    was finished by hand. An automation like "turn the internet back off
    when computer time ends" should listen for this too."""
    _unschedule_timer(entry_data, timer.get("uid"))
    await _log_timer_update(entry_data, timer.get("uid"), {
        "outcome": "cancelled",
        "ended_at": dt_util.utcnow().isoformat(),
        "cancel_reason": reason,
        "cancelled_by": by_user_id,
        "cancelled_by_name": await _user_display_name(hass, by_user_id) if by_user_id else None,
    })
    hass.bus.async_fire(
        EVENT_FAMILY_HUB_TIMER_CANCELLED,
        await _timer_event_payload(hass, timer, reason=reason, cancelled_by=by_user_id),
    )


async def _fire_timer(hass: HomeAssistant, entry_data: dict[str, Any], timer: dict[str, Any]) -> None:
    """The one dispatcher both completion paths go through - HA's own timer.finished event (_handle_native_timer_event) and the backstop sweep (_expire_due_timers)."""
    # fire Family Hub's own event FIRST, before the kind- specific action, so an automation reacting to it
    _unschedule_timer(entry_data, timer.get("uid"))
    hass.bus.async_fire(EVENT_FAMILY_HUB_TIMER_FINISHED, await _timer_event_payload(hass, timer, reason="finished"))
    await _log_timer_update(entry_data, timer.get("uid"), {"outcome": "finished", "ended_at": dt_util.utcnow().isoformat()})
    kind = timer.get("kind")
    if kind == TIMER_KIND_CHORE:
        await _fire_chore_timer(hass, entry_data, timer)
    elif kind == TIMER_KIND_STANDALONE:
        await _fire_standalone_timer(hass, entry_data, timer)
    else:
        await _fire_reward_timer(hass, entry_data, timer)


async def handle_native_timer_event(hass: HomeAssistant, event: Any) -> None:
    """Completion driven by Home Assistant itself."""
    entity_id = (event.data or {}).get("entity_id")
    if not entity_id:
        return
    entry_data = _get_entry_data(hass)
    if entry_data is None:
        return
    state = _timers_state(entry_data)
    timer = timer_engine.timer_for_entity(state, entity_id)
    if timer is None:
        return
    timer_engine.remove_timer(state, timer.get("uid"))
    timer_sensor.remove_timer_sensor(entry_data, timer.get("uid"))
    await _save_timers(hass, entry_data)
    if event.event_type != NATIVE_TIMER_EVENT_FINISHED:
        ctx = getattr(event, "context", None)
        await _after_timer_cancelled(hass, entry_data, timer, getattr(ctx, "user_id", None), "home_assistant")
        return
    try:
        await _fire_timer(hass, entry_data, timer)
    except Exception as err:  # noqa: BLE001 - one bad timer must not break the listener
        _LOGGER.warning("Family Hub: native timer %s failed to fire: %s", timer.get("uid"), err)


async def _clear_chore_timers(hass: HomeAssistant, entry_data: dict[str, Any], chore_id: str) -> None:
    """Drop any timer running against this chore. Called when the chore is
    completed by hand, deleted, or reassigned - in all three cases the
    countdown has nothing left to count toward, and letting it survive
    would fire a stray completion later."""
    removed = timer_engine.remove_timers_for_chore(_timers_state(entry_data), chore_id)
    if removed:
        timer_sensor.remove_timer_sensors(entry_data, [t.get("uid") for t in removed])
        await _save_timers(hass, entry_data)
        for timer in removed:
            await _release_native_timer(hass, timer, cancel=True)
            await _after_timer_cancelled(hass, entry_data, timer, None, "chore_changed")


async def _notify_targets_for_user(hass: HomeAssistant, entry_data: dict[str, Any], user_id: Optional[str]) -> list[str]:
    """This person's configured notify.* targets, straight off their Settings profile - the same notifyTargets list every other push in this file reads"""
    if not user_id:
        return []
    store = entry_data.get("settings_store")
    settings = (await store.async_load() or {}) if store is not None else {}
    profile = (settings.get("userProfiles") or {}).get(user_id) or {}
    targets = profile.get("notifyTargets") or []
    return [t for t in targets if isinstance(t, str)]


async def _timer_alarm_enabled_for_user(hass: HomeAssistant, entry_data: dict[str, Any], user_id: Optional[str]) -> bool:
    """this person's own notifyTimerAlarm profile flag, read raw the same way _notify_targets_for_user reads notifyTargets"""
    if not user_id:
        return False
    store = entry_data.get("settings_store")
    settings = (await store.async_load() or {}) if store is not None else {}
    profile = (settings.get("userProfiles") or {}).get(user_id) or {}
    return bool(profile.get("notifyTimerAlarm"))


@websocket_api.websocket_command({vol.Required("type"): "family_hub/timers/list"})
@websocket_api.async_response
async def ws_list_timers(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Every running timer, household-wide."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    connection.send_result(msg["id"], {"timers": timer_engine.list_timers(_timers_state(entry_data))})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/timers/start_chore",
        vol.Required("chore_id"): str,
        vol.Optional("source"): str,
        # this tab's own per-browser-tab id, echoed back onto the
        # timer as origin_client_id - see timer_engine.py's own docstring.
        vol.Optional("client_id"): str,
        vol.Optional("elevation_token"): str,
    }
)
@websocket_api.async_response
async def ws_start_chore_timer(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Begin the countdown on a timed chore ("clean for 30 minutes"). The
    duration is the chore's OWN configured timer_minutes - never a value
    from the client - so nobody can shorten their own chore by sending a
    smaller number."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    chore = entry_data["chores"].get(msg["chore_id"])
    if chore is None:
        connection.send_error(msg["id"], "not_found", "That chore no longer exists.")
        return
    if chore.get("status") != chore_engine.CHORE_STATUS_OPEN:
        connection.send_error(msg["id"], "not_open", "Only an open chore's timer can be started.")
        return
    minutes = timer_engine.normalize_timer_minutes(chore.get(CHORE_KEY_TIMER_MINUTES))
    if minutes is None:
        connection.send_error(msg["id"], "no_timer", "That chore doesn't have a timer set.")
        return
    user_id, is_admin = await _effective_actor(hass, connection, entry_data, msg)
    assignee = chore.get("assigned_to")
    # Same gate ws_complete_chore applies, for the same reason: starting
    # the timer IS starting the completion.
    if assignee != user_id and not (
        _has_permission_ctx(entry_data, user_id, is_admin, PERMISSION_VERIFY)
        or _has_permission_ctx(entry_data, user_id, is_admin, PERMISSION_COMPLETE_ANY)
    ):
        connection.send_error(msg["id"], "forbidden", "Only the person this chore is assigned to (or an admin/verifier/can_complete_any grant) can start its timer.")
        return
    # The timer belongs to whoever the chore is assigned to, not whoever tapped Start
    owner = assignee or user_id
    try:
        timer = timer_engine.start_timer(
            _timers_state(entry_data),
            kind=TIMER_KIND_CHORE,
            user_id=owner,
            duration_minutes=minutes,
            title=chore.get("title") or "",
            chore_id=msg["chore_id"],
            notify_targets=await _notify_targets_for_user(hass, entry_data, owner),
            alarm=await _timer_alarm_enabled_for_user(hass, entry_data, owner),
            # snapshot the chore's own alarm_audience tier onto the timer at start time, same convention as "alarm" above
            alarm_audience=timer_engine.normalize_alarm_audience(chore.get(CHORE_KEY_ALARM_AUDIENCE)),
            client_id=msg.get("client_id"),
        )
    except timer_engine.TimerError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _adopt_native_timer(hass, entry_data, timer)
    await _after_timer_started(hass, entry_data, timer, user_id, msg.get("source") or "chores")
    timer_sensor.create_timer_sensor(hass, entry_data, timer, await _user_display_name(hass, owner))
    await _save_timers(hass, entry_data)
    connection.send_result(msg["id"], {"timer": timer})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/timers/start_reward",
        vol.Required("item_id"): str,
        vol.Optional("source"): str,
        vol.Optional("user_id"): str,
        vol.Optional("client_id"): str,
        vol.Optional("elevation_token"): str,
    }
)
@websocket_api.async_response
async def ws_start_reward_timer(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Redeem a timed reward AND start its countdown, in one step."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    actor_id, is_admin = await _effective_actor(hass, connection, entry_data, msg)
    target_user_id = msg.get("user_id") or actor_id
    if not target_user_id:
        connection.send_error(msg["id"], "no_user", "Not logged in.")
        return
    # Same gate ws_redeem_reward applies to redeeming for someone else.
    if target_user_id != actor_id and not _has_permission_ctx(entry_data, actor_id, is_admin, PERMISSION_REWARD_OVERRIDE):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted reward-override permission) can redeem on someone else's behalf.")
        return
    item = next((it for it in (entry_data["rewards"].get("catalog") or []) if it.get("id") == msg["item_id"]), None)
    if item is None:
        connection.send_error(msg["id"], "not_found", "That reward no longer exists.")
        return
    minutes = timer_engine.normalize_timer_minutes(item.get(REWARD_KEY_TIMER_MINUTES))
    if minutes is None:
        connection.send_error(msg["id"], "no_timer", "That reward doesn't have a timer set.")
        return
    # Refuse BEFORE spending stars - see this function's own docstring.
    running = timer_engine.has_active_timer(_timers_state(entry_data), target_user_id, TIMER_KIND_REWARD)
    if running is not None:
        left = max(1, round(timer_engine.remaining_seconds(running) / 60))
        connection.send_error(
            msg["id"], "timer_already_running",
            f"You've already got \"{running.get('title') or 'a reward'}\" running - about {left} "
            f"minute{'s' if left != 1 else ''} left. Cancel it first if you want to start this one.",
        )
        return
    try:
        redemption = reward_engine.redeem_item(entry_data["rewards"], target_user_id, msg["item_id"])
    except reward_engine.RewardError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    try:
        timer = timer_engine.start_timer(
            _timers_state(entry_data),
            kind=TIMER_KIND_REWARD,
            user_id=target_user_id,
            duration_minutes=minutes,
            title=item.get("title") or "",
            item_id=msg["item_id"],
            notify_targets=await _notify_targets_for_user(hass, entry_data, target_user_id),
            alarm=await _timer_alarm_enabled_for_user(hass, entry_data, target_user_id),
            # same snapshot as ws_start_chore_timer above, off
            # the reward catalog item's own alarm_audience field.
            alarm_audience=timer_engine.normalize_alarm_audience(item.get(REWARD_KEY_ALARM_AUDIENCE)),
            client_id=msg.get("client_id"),
        )
    except timer_engine.TimerError as err:
        # Should be unreachable (the cap was checked above), but if it
        # somehow isn't, don't leave the person charged for nothing.
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _adopt_native_timer(hass, entry_data, timer)
    await _after_timer_started(hass, entry_data, timer, actor_id, msg.get("source") or "rewards")
    timer_sensor.create_timer_sensor(hass, entry_data, timer, await _user_display_name(hass, target_user_id))
    await _save_rewards(hass, entry_data)
    await _save_timers(hass, entry_data)
    await _notify_reward_claimed(hass, entry_data, target_user_id, redemption)
    connection.send_result(
        msg["id"],
        {
            "timer": timer,
            "redemption": redemption,
            "balance": reward_engine.get_balance(entry_data["rewards"], target_user_id),
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/timers/start_standalone",
        # was vol.Coerce(int), which silently truncated away a fractional/sub-minute value (0.5 -> 0) before it ever reached timer_engine.start_timer.
        vol.Required("duration_minutes"): vol.Coerce(float),
        vol.Optional("label"): str,
        vol.Optional("user_id"): vol.Any(str, None),
        vol.Optional("client_id"): str,
        vol.Optional("elevation_token"): str,
        # - see const.py's CHORE_KEY_ALARM_AUDIENCE.
        vol.Optional("alarm_audience"): vol.Any(str, None),
        # v1.168.74: specific speakers for this one timer (alarm device ids
        # or entity ids) instead of the people/house links in Settings
        vol.Optional("alarm_device_ids"): [str],
        vol.Optional("source"): str,
    }
)
@websocket_api.async_response
async def ws_start_standalone_timer(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Start a general-purpose household timer from the Active Timers
    card's quick-timer modal - "3-4 common timer times, optional assign to
    user and optional add time."

    Unlike the chore/reward commands, the DURATION comes from the client
    here, because there is no chore or catalog item to read it off - this
    is the person typing "12 minutes" or tapping a preset.
    timer_engine.normalize_timer_minutes still clamps it to 1..24h, so an
    absurd or malformed value can't be stored.

    Assignment is optional and defaults to nobody. Anyone can start one
    (it costs nothing and gates nothing), and anyone can assign one to
    anyone - deliberately not permission-gated: "start a 10 minute timer
    for Sam" is a normal thing for a sibling to do, it takes nothing away
    from Sam, and the cancel rules below keep it recoverable. This is the
    one timer command with no permission check at all, and that is the
    intended asymmetry - the other two start something consequential (a
    chore completion, a star spend); this one starts a countdown.
    """
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    actor_id, _is_admin = await _effective_actor(hass, connection, entry_data, msg)
    try:
        timer = await async_start_standalone_timer(
            hass, entry_data,
            minutes=msg["duration_minutes"],
            label=msg.get("label"),
            user_id=msg.get("user_id") or "",
            actor_id=actor_id,
            alarm_audience=msg.get("alarm_audience"),
            alarm_device_ids=msg.get("alarm_device_ids"),
            client_id=msg.get("client_id"),
            source=msg.get("source") or "timers",
        )
    except timer_engine.TimerError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    connection.send_result(msg["id"], {"timer": timer})


async def async_start_standalone_timer(
    hass: HomeAssistant,
    entry_data: dict[str, Any],
    *,
    minutes: Any,
    label: Any = None,
    user_id: str = "",
    actor_id: Optional[str] = None,
    alarm_audience: Any = None,
    alarm_device_ids: Optional[list] = None,
    client_id: Optional[str] = None,
    source: str = "timers",
) -> dict[str, Any]:
    """Shared by the websocket command and the family_hub.start_timer
    action. Raises timer_engine.TimerError."""
    assigned_to = user_id or ""
    label = timer_engine.normalize_timer_label(label)
    timer = timer_engine.start_timer(
        _timers_state(entry_data),
        kind=TIMER_KIND_STANDALONE,
        user_id=assigned_to,
        duration_minutes=minutes,
        title=label,
        # Only an assigned timer has a person's own phones/profile; an
        # unassigned one rings where it was started (see _resolve_alarm_reach).
        notify_targets=await _notify_targets_for_user(hass, entry_data, assigned_to) if assigned_to else [],
        alarm=await _timer_alarm_enabled_for_user(hass, entry_data, assigned_to) if assigned_to else False,
        alarm_audience=timer_engine.normalize_alarm_audience(alarm_audience),
        client_id=client_id,
    )
    # Who started it, so an unassigned timer still has a recoverable owner
    # for the cancel rules (see ws_cancel_timer).
    timer["started_by"] = actor_id
    ids = [str(d)[:200] for d in (alarm_device_ids or []) if isinstance(d, str) and d][:10]
    if ids:
        timer["alarm_device_ids"] = ids
    await _adopt_native_timer(hass, entry_data, timer)
    await _after_timer_started(hass, entry_data, timer, actor_id, source)
    timer_sensor.create_timer_sensor(
        hass, entry_data, timer, await _user_display_name(hass, assigned_to) if assigned_to else None
    )
    await _save_timers(hass, entry_data)
    return timer


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/timers/cancel",
        vol.Required("uid"): str,
        vol.Optional("elevation_token"): str,
    }
)
@websocket_api.async_response
async def ws_cancel_timer(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Stop a countdown without it firing."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    state = _timers_state(entry_data)
    timer = timer_engine.get_timer(state, msg["uid"])
    if timer is None:
        # Already fired, or already cancelled elsewhere - not an error, since either way it isn't running any more, which is what the caller wanted.
        connection.send_result(msg["id"], {"cancelled": None, "timers": timer_engine.list_timers(state)})
        return
    user_id, is_admin = await _effective_actor(hass, connection, entry_data, msg)
    kind = timer.get("kind")
    if kind == TIMER_KIND_STANDALONE:
        # a standalone timer is household furniture, not somebody's property.
        if timer.get("user_id") and not (
            timer.get("user_id") == user_id or timer.get("started_by") == user_id or is_admin
        ):
            connection.send_error(
                msg["id"], "forbidden", "Only the person this timer is for (or whoever started it) can stop it."
            )
            return
    elif timer.get("user_id") != user_id:
        allowed = (
            _has_permission_ctx(entry_data, user_id, is_admin, PERMISSION_VERIFY)
            or _has_permission_ctx(entry_data, user_id, is_admin, PERMISSION_COMPLETE_ANY)
            if kind == TIMER_KIND_CHORE
            else _has_permission_ctx(entry_data, user_id, is_admin, PERMISSION_REWARD_OVERRIDE)
        )
        if not allowed:
            connection.send_error(msg["id"], "forbidden", "You can only cancel your own timers.")
            return
    cancelled = timer_engine.remove_timer(state, msg["uid"])
    timer_sensor.remove_timer_sensor(entry_data, msg["uid"])
    await _save_timers(hass, entry_data)
    # hand the native entity back.
    if cancelled:
        await _release_native_timer(hass, cancelled, cancel=True)
        await _after_timer_cancelled(hass, entry_data, cancelled, user_id, "cancelled")
    connection.send_result(msg["id"], {"cancelled": cancelled, "timers": timer_engine.list_timers(state)})


async def _expire_due_timers(hass: HomeAssistant, entry_data: dict[str, Any]) -> bool:
    """The backend sweep: fire every timer whose time is up."""
    state = _timers_state(entry_data)
    due = timer_engine.due_timers(state)
    if not due:
        return False
    for timer in due:
        timer_engine.remove_timer(state, timer.get("uid"))
        timer_sensor.remove_timer_sensor(entry_data, timer.get("uid"))
        _unschedule_timer(entry_data, timer.get("uid"))
    await _save_timers(hass, entry_data)
    for timer in due:
        try:
            # a timer backed by a native entity has almost certainly already fired through HA's own timer.finished event by now and been removed
            await _release_native_timer(hass, timer, cancel=True)
            await _fire_timer(hass, entry_data, timer)
        except Exception as err:  # noqa: BLE001 - one bad timer must not stop the rest
            _LOGGER.warning("Family Hub: timer %s failed to fire: %s", timer.get("uid"), err)
    return True


async def _fire_chore_timer(hass: HomeAssistant, entry_data: dict[str, Any], timer: dict[str, Any]) -> None:
    """A chore timer running out completes the chore exactly as tapping Done would"""
    chore_id = timer.get("chore_id")
    chore = entry_data["chores"].get(chore_id) if chore_id else None
    title = timer.get("title") or "your chore"
    body = f"Time's up on \"{title}\"."
    result = None
    if chore is not None and chore.get("status") == chore_engine.CHORE_STATUS_OPEN:
        try:
            completed = chore_engine.complete_chore(
                entry_data["chores"], entry_data["rewards"], hass, chore_id, timer.get("user_id"),
                permissions=entry_data.get("permissions"),
            )
        except chore_engine.ChoreError as err:
            _LOGGER.warning("Family Hub: chore timer for %s could not complete it: %s", chore_id, err)
            completed = None
        if completed is not None:
            await _apply_chore_completion_effects(hass, entry_data, completed)
            approved = completed.get("status") == chore_engine.CHORE_STATUS_APPROVED
            result = "completed" if approved else "sent_for_approval"
            body = (
                f"Time's up on \"{completed.get('title')}\" - all done!"
                if approved
                else f"Time's up on \"{completed.get('title')}\" - sent for approval."
            )
    else:
        # Deleted, or already finished by hand, mid-countdown - nothing left
        # to say "time's up" about, so it stays quiet (and says why in the log).
        await _log_timer_update(entry_data, timer.get("uid"), {"result": "chore_deleted" if chore is None else "chore_already_done"})
        return
    if result:
        await _log_timer_update(entry_data, timer.get("uid"), {"result": result})
    await _dispatch_timer_alarm(hass, entry_data, timer, "Family Hub chore timer", body)


async def _fire_reward_timer(hass: HomeAssistant, entry_data: dict[str, Any], timer: dict[str, Any]) -> None:
    """A reward timer running out gates nothing - it is purely "time's up"
    (the stars were spent when it started). Automations hang off
    family_hub_timer_finished / family_hub_timer_cancelled."""
    title = timer.get("title") or "your reward"
    await _dispatch_timer_alarm(hass, entry_data, timer, "Family Hub reward timer", f"Time's up - {title} is finished.")


async def _fire_standalone_timer(hass: HomeAssistant, entry_data: dict[str, Any], timer: dict[str, Any]) -> None:
    """A standalone (general-purpose) timer running out just says so."""
    label = timer.get("title") or "Timer"
    await _dispatch_timer_alarm(hass, entry_data, timer, "Family Hub timer", f"Time's up - {label}.")


async def _all_household_notify_targets(hass: HomeAssistant, entry_data: dict[str, Any]) -> list[str]:
    """Every configured notify target in the household, de-duplicated -
    only used for an "everyone" alarm."""
    store = entry_data.get("settings_store")
    settings = (await store.async_load() or {}) if store is not None else {}
    seen: list[str] = []
    for profile in (settings.get("userProfiles") or {}).values():
        if not isinstance(profile, dict):
            continue
        for target in profile.get("notifyTargets") or []:
            if isinstance(target, str) and target not in seen:
                seen.append(target)
    return seen


# -------------------------------------------------------------------------- Timer alarms (v1.168.74 overhaul).
def _active_alarms(entry_data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Ringing alarms by timer uid. One dict shared between
    entry_data["active_alarms"] and the timers Store's "alarms" key, so it
    is saved with the timers and survives a restart."""
    state = _timers_state(entry_data)
    alarms = entry_data.get("active_alarms")
    if not isinstance(alarms, dict):
        alarms = state.get("alarms") if isinstance(state.get("alarms"), dict) else {}
        entry_data["active_alarms"] = alarms
    state["alarms"] = alarms
    return alarms


def _alarm_tag(uid: str) -> str:
    return f"family_hub_timer_{uid}"


def _resolve_alarm_reach(settings: dict[str, Any], timer: dict[str, Any], starter_targets: list[str]) -> dict[str, Any]:
    """Pure: who and what rings for this timer (see the section comment)."""
    audience = timer_engine.normalize_alarm_audience(timer.get("alarm_audience"))
    owner = timer.get("user_id") or ""
    person = owner or timer.get("started_by") or ""
    profiles = settings.get("userProfiles") or {}

    target_user_ids: list[str] = [person] if person else []
    if audience in (TIMER_ALARM_AUDIENCE_KIOSKS, TIMER_ALARM_AUDIENCE_EVERYONE):
        for uid, profile in profiles.items():
            if isinstance(profile, dict) and profile.get(SETTINGS_KEY_PROFILE_IS_ALARM_KIOSK) and uid not in target_user_ids:
                target_user_ids.append(uid)

    own_phones = [t for t in (timer.get("notify_targets") or []) if isinstance(t, str)]
    if not owner:
        own_phones = [t for t in starter_targets if isinstance(t, str)]

    devices = [d for d in (settings.get(SETTINGS_KEY_ALARM_DEVICES) or []) if isinstance(d, dict) and d.get("entity_id")]
    chosen = set(timer.get("alarm_device_ids") or [])
    picked: list[dict[str, Any]] = []

    def add(device: dict[str, Any]) -> None:
        if device not in picked:
            picked.append(device)

    for d in devices:
        legacy = "user_ids" not in d and "house" not in d
        if audience == TIMER_ALARM_AUDIENCE_EVERYONE:
            add(d)
        elif chosen:
            if d.get("id") in chosen or d.get("entity_id") in chosen:
                add(d)
        elif owner and owner in (d.get("user_ids") or []):
            add(d)
        elif not owner and d.get("house"):
            add(d)
        if audience == TIMER_ALARM_AUDIENCE_KIOSKS and (d.get("house") or legacy):
            add(d)
    return {
        "audience": audience,
        "target_user_ids": target_user_ids,
        "broadcast_all": audience == TIMER_ALARM_AUDIENCE_EVERYONE,
        "own_phones": own_phones,
        "devices": picked,
    }


async def _push_alarm_to_phones(hass: HomeAssistant, record: dict[str, Any]) -> None:
    uid = record.get("uid") or ""
    extra = {
        "tag": _alarm_tag(uid),
        "actions": [{"action": f"{ALARM_STOP_ACTION_PREFIX}{uid}", "title": "Stop"}],
    }
    if record.get("phones_alarm"):
        await _send_alarm_notification(hass, record["phones_alarm"], record.get("title") or "", record.get("body") or "", extra)
    if record.get("phones_plain"):
        await _send_instant_notification(hass, record["phones_plain"], record.get("title") or "", record.get("body") or "", extra)


async def _clear_alarm_on_phones(hass: HomeAssistant, record: dict[str, Any]) -> None:
    """Companion App's own "clear_notification" message, by tag."""
    for target in list(record.get("phones_alarm") or []) + list(record.get("phones_plain") or []):
        split = _split_notify_target(target)
        if split is None:
            continue
        try:
            await hass.services.async_call(
                split[0], split[1], {"message": "clear_notification", "data": {"tag": _alarm_tag(record.get("uid") or "")}}, blocking=True,
            )
        except Exception as err:  # noqa: BLE001
            _LOGGER.debug("Family Hub: could not clear the alarm notification on %s: %s", target, err)


async def _announce_on_alarm_device(
    hass: HomeAssistant, device: dict[str, Any], tts_entity: Optional[str], message: str
) -> bool:
    """Best-effort announcement on one registered alarm device; never
    raises. assist_satellite.announce speaks for itself; a media_player
    (Google Home, Nest, Sonos...) speaks through the household's chosen
    tts.* entity. Returns whether it was sent."""
    entity_id = device.get("entity_id")
    domain = device.get("domain") or (entity_id.split(".", 1)[0] if entity_id else "")
    if not entity_id or not domain:
        return False
    try:
        if domain == "assist_satellite":
            await hass.services.async_call(
                "assist_satellite", "announce", {"entity_id": entity_id, "message": message}, blocking=True,
            )
            return True
        if domain == "media_player":
            if not tts_entity:
                _LOGGER.warning(
                    "Family Hub: can't announce the timer alarm on %s - pick a text-to-speech engine under Settings > Alarm Devices",
                    entity_id,
                )
                return False
            await hass.services.async_call(
                "tts", "speak",
                {"entity_id": tts_entity, "media_player_entity_id": entity_id, "message": message},
                blocking=True,
            )
            return True
    except Exception as err:  # noqa: BLE001 - a failed alarm device must never break the timer
        _LOGGER.warning("Family Hub: failed to announce alarm on %s: %s", entity_id, err)
    return False


async def _broadcast_alarm_ring(hass: HomeAssistant, entry_data: dict[str, Any], uid: str) -> None:
    """The RING event every open Family Hub screen listens for; each
    screen decides for itself whether it's one of the targets."""
    record = _active_alarms(entry_data).get(uid)
    if record is None:
        return
    hass.bus.async_fire(
        EVENT_FAMILY_HUB_TIMER_ALARM_RING,
        {
            "uid": uid,
            "title": record.get("title"),
            "body": record.get("body"),
            "timer_title": record.get("timer_title"),
            "audience": record.get("audience"),
            "target_user_ids": record.get("target_user_ids") or [],
            "broadcast_all": bool(record.get("broadcast_all")),
            "origin_client_id": record.get("origin_client_id") or "",
            "started_at": record.get("started_at"),
        },
    )


async def _dispatch_timer_alarm(
    hass: HomeAssistant, entry_data: dict[str, Any], timer: dict[str, Any], title: str, body: str
) -> None:
    """Start ringing for a finished timer - screens, phones and speakers as
    resolved by _resolve_alarm_reach - and remember it until stopped."""
    uid = timer.get("uid")
    if not uid:
        return
    store = entry_data.get("settings_store")
    settings = (await store.async_load() or {}) if store is not None else {}
    starter = timer.get("started_by") if not timer.get("user_id") else None
    starter_targets = await _notify_targets_for_user(hass, entry_data, starter) if starter else []
    reach = _resolve_alarm_reach(settings, timer, starter_targets)

    own_style_alarm = bool(timer.get("alarm")) or reach["broadcast_all"]
    phones_alarm: list[str] = list(reach["own_phones"]) if own_style_alarm else []
    phones_plain: list[str] = [] if own_style_alarm else list(reach["own_phones"])
    if reach["broadcast_all"]:
        for target in await _all_household_notify_targets(hass, entry_data):
            if target not in phones_alarm and target not in phones_plain:
                phones_alarm.append(target)

    tts_entity = settings.get(SETTINGS_KEY_ALARM_TTS_ENTITY) or None
    now_iso = dt_util.utcnow().isoformat()
    record = {
        "uid": uid,
        "title": title,
        "body": body,
        "timer_title": timer.get("title") or "",
        "kind": timer.get("kind"),
        "user_id": timer.get("user_id") or None,
        "chore_id": timer.get("chore_id"),
        "item_id": timer.get("item_id"),
        "audience": reach["audience"],
        "target_user_ids": reach["target_user_ids"],
        "broadcast_all": reach["broadcast_all"],
        "origin_client_id": timer.get("origin_client_id") or "",
        "phones_alarm": phones_alarm,
        "phones_plain": phones_plain,
        "alarm_devices": reach["devices"],
        "tts_entity": tts_entity,
        "started_at": now_iso,
        "last_announced_at": now_iso,
        "rings": 1,
    }
    _active_alarms(entry_data)[uid] = record
    await _save_timers(hass, entry_data)

    message = f"{title}. {body}".strip(". ") or body
    spoke = []
    for device in reach["devices"]:
        if await _announce_on_alarm_device(hass, device, tts_entity, message):
            spoke.append(device.get("name") or device.get("entity_id"))
    await _push_alarm_to_phones(hass, record)
    await _broadcast_alarm_ring(hass, entry_data, uid)

    names = []
    for user_id in reach["target_user_ids"]:
        names.append(await _user_display_name(hass, user_id))
    await _log_timer_update(entry_data, uid, {"alarm": {
        "rang_at": now_iso,
        "audience": reach["audience"],
        "screens": (["every screen"] if reach["broadcast_all"] else []) + (["the screen it was started on"] if record["origin_client_id"] else []) + names,
        "phones": phones_alarm + phones_plain,
        "speakers": [d.get("name") or d.get("entity_id") for d in reach["devices"]],
        "speakers_ok": spoke,
    }})


async def async_stop_alarm(
    hass: HomeAssistant, entry_data: dict[str, Any], uid: str, *, by_user_id: Optional[str] = None, via: str = "screen"
) -> bool:
    """Silence an alarm everywhere at once ("first tap wins, from anyone").
    Returns False if it wasn't ringing."""
    record = _active_alarms(entry_data).pop(uid, None)
    hass.bus.async_fire(EVENT_FAMILY_HUB_TIMER_ALARM_STOP, {"uid": uid, "stopped_by": by_user_id, "via": via})
    if record is None:
        return False
    await _save_timers(hass, entry_data)
    await _clear_alarm_on_phones(hass, record)
    now_iso = dt_util.utcnow().isoformat()
    by_name = await _user_display_name(hass, by_user_id) if by_user_id else None
    hass.bus.async_fire(EVENT_FAMILY_HUB_TIMER_ALARM_STOPPED, {
        "uid": uid,
        "kind": record.get("kind"),
        "title": record.get("timer_title"),
        "user_id": record.get("user_id"),
        "chore_id": record.get("chore_id"),
        "reward_item_id": record.get("item_id"),
        "stopped_by": by_user_id,
        "via": via,
    })
    await _log_timer_update(entry_data, uid, {"alarm": {
        "stopped_at": now_iso,
        "stopped_by": by_user_id,
        "stopped_by_name": by_name,
        "stopped_via": via,
        "rings": record.get("rings") or 1,
    }})
    return True


async def _reannounce_active_alarms(hass: HomeAssistant, entry_data: dict[str, Any]) -> None:
    """Called from the timer sweep. Keeps every ringing alarm going -
    speakers re-announce, phones re-push (same tag, so it replaces rather
    than stacks), screens get the RING again - every
    ALARM_REANNOUNCE_SECONDS, and stops it after ALARM_AUTO_STOP_SECONDS."""
    active = _active_alarms(entry_data)
    if not active:
        return
    now = dt_util.utcnow()

    def _parse(value: Any) -> Optional[datetime]:
        try:
            parsed = datetime.fromisoformat(value) if value else None
        except (TypeError, ValueError):
            return None
        if parsed is not None and parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed

    changed = False
    for uid, record in list(active.items()):
        started = _parse(record.get("started_at"))
        if started is not None and (now - started).total_seconds() >= ALARM_AUTO_STOP_SECONDS:
            await async_stop_alarm(hass, entry_data, uid, via="auto")
            continue
        last_dt = _parse(record.get("last_announced_at"))
        if last_dt is not None and (now - last_dt).total_seconds() < ALARM_REANNOUNCE_SECONDS:
            continue
        message = f"{record.get('title') or ''}. {record.get('body') or ''}".strip(". ")
        tts_entity = record.get("tts_entity")
        for device in record.get("alarm_devices") or []:
            await _announce_on_alarm_device(hass, device, tts_entity, message)
        await _push_alarm_to_phones(hass, record)
        record["last_announced_at"] = now.isoformat()
        record["rings"] = int(record.get("rings") or 1) + 1
        changed = True
        await _broadcast_alarm_ring(hass, entry_data, uid)
    if changed:
        await _save_timers(hass, entry_data)


async def handle_mobile_notification_action(hass: HomeAssistant, event: Any) -> None:
    """The Stop button on a timer alarm push (Companion App's
    mobile_app_notification_action event)."""
    action = str((event.data or {}).get("action") or "")
    if not action.startswith(ALARM_STOP_ACTION_PREFIX):
        return
    entry_data = _get_entry_data(hass)
    if entry_data is None:
        return
    ctx = getattr(event, "context", None)
    await async_stop_alarm(hass, entry_data, action[len(ALARM_STOP_ACTION_PREFIX):], by_user_id=getattr(ctx, "user_id", None), via="phone")


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/timers/dismiss_alarm",
        vol.Required("uid"): str,
        vol.Optional("elevation_token"): str,
    }
)
@websocket_api.async_response
async def ws_dismiss_timer_alarm(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Stop a ringing alarm everywhere. Not permission-gated - whoever
    reaches a phone, a kiosk or the dashboard first can silence it."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    user_id, _is_admin = await _effective_actor(hass, connection, entry_data, msg)
    await async_stop_alarm(hass, entry_data, msg["uid"], by_user_id=user_id, via="screen")
    connection.send_result(msg["id"], {"dismissed": True})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/timers/list_active_alarms"})
@websocket_api.async_response
async def ws_list_active_alarms(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Every currently-ringing alarm, for a screen that just opened (or
    reconnected) to catch up on."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    alarms = [
        {k: v for k, v in record.items() if k not in ("phones_alarm", "phones_plain", "tts_entity", "alarm_devices")}
        for record in _active_alarms(entry_data).values()
    ]
    connection.send_result(msg["id"], {"alarms": alarms})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/timers/history", vol.Optional("limit"): int})
@websocket_api.async_response
async def ws_timer_history(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """The timer log, newest first: who set each timer, from where, how it
    ended, where it rang and who stopped it."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    log = await async_load_timer_log(entry_data)
    limit = max(1, min(int(msg.get("limit") or 100), TIMER_LOG_MAX_ENTRIES))
    ringing = set(_active_alarms(entry_data))
    running = {t.get("uid") for t in timer_engine.list_timers(_timers_state(entry_data))}
    out = []
    for entry in log[:limit]:
        item = dict(entry)
        item["ringing"] = item.get("uid") in ringing
        if item.get("outcome") == "running" and item.get("uid") not in running:
            item["outcome"] = "unknown"
        out.append(item)
    connection.send_result(msg["id"], {"entries": out})


async def async_cancel_timer_by_service(
    hass: HomeAssistant, entry_data: dict[str, Any], *, uid: Optional[str] = None, user_id: Optional[str] = None, title: Optional[str] = None
) -> int:
    """family_hub.cancel_timer: by uid, or every running timer matching a
    person and/or a title. Returns how many were cancelled."""
    state = _timers_state(entry_data)
    matches = []
    for timer in timer_engine.list_timers(state):
        if uid and timer.get("uid") != uid:
            continue
        if user_id and timer.get("user_id") != user_id:
            continue
        if title and (timer.get("title") or "").strip().lower() != title.strip().lower():
            continue
        if not (uid or user_id or title):
            continue
        matches.append(timer)
    for timer in matches:
        cancelled = timer_engine.remove_timer(state, timer.get("uid"))
        timer_sensor.remove_timer_sensor(entry_data, timer.get("uid"))
        if cancelled:
            await _release_native_timer(hass, cancelled, cancel=True)
            await _after_timer_cancelled(hass, entry_data, cancelled, None, "automation")
    if matches:
        await _save_timers(hass, entry_data)
    return len(matches)


@websocket_api.websocket_command(
    {vol.Required("type"): "family_hub/settings/test_alarm_device", vol.Required("entity_id"): str, vol.Optional("tts_entity_id"): str}
)
@websocket_api.async_response
async def ws_test_alarm_device(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Settings > Alarm Devices > Test: one announcement, admin only."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not (connection.user and connection.user.is_admin):
        connection.send_error(msg["id"], "forbidden", "Only an admin can test alarm devices.")
        return
    entity_id = msg["entity_id"]
    domain = entity_id.split(".", 1)[0]
    if domain not in ("media_player", "assist_satellite"):
        connection.send_error(msg["id"], "invalid", "Not a speaker or Assist satellite.")
        return
    tts_entity = (msg.get("tts_entity_id") or "").strip() or None
    if domain == "media_player" and not tts_entity:
        connection.send_result(msg["id"], {"ok": False, "reason": "no_tts"})
        return
    ok = await _announce_on_alarm_device(
        hass, {"entity_id": entity_id, "domain": domain}, tts_entity, "This is a Family Hub timer alarm test."
    )
    connection.send_result(msg["id"], {"ok": ok, "reason": None if ok else "failed"})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/settings/list_alarm_device_candidates"})
@websocket_api.async_response
async def ws_list_alarm_device_candidates(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Candidate lists for the Settings "Alarm Devices" picker. Household's
    explicit choice: "pick from HA's own entity list", not manual entity-id
    typing. Three separate lists: media_player and assist_satellite are
    what can be REGISTERED as an alarm device (see
    SETTINGS_KEY_ALARM_DEVICES); tts is what can be picked as the
    household's alarmTtsEntityId for a media_player device's own TTS half
    (an assist_satellite entry needs none of this - announce handles its
    own TTS end to end)."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return

    def _candidates(domain: str) -> list[dict[str, str]]:
        out = [
            {
                "entity_id": state.entity_id,
                "domain": domain,
                "name": state.attributes.get("friendly_name") or state.entity_id,
            }
            for state in hass.states.async_all(domain)
        ]
        out.sort(key=lambda c: c["name"].lower())
        return out

    connection.send_result(
        msg["id"],
        {
            "media_players": _candidates("media_player"),
            "assist_satellites": _candidates("assist_satellite"),
            "tts_entities": _candidates("tts"),
        },
    )




@websocket_api.websocket_command({vol.Required("type"): "family_hub/privacy_mode/get_state"})
@websocket_api.async_response
async def ws_privacy_mode_get_state(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Open to any authenticated connection - every Family Calendar card
    needs this on load to know whether to hide reminders/events and show
    the lock overlay right away, before any live event has fired yet."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    connection.send_result(msg["id"], {"enabled": bool((entry_data.get("privacy_mode") or {}).get("enabled"))})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/privacy_mode/subscribe"})
@websocket_api.async_response
async def ws_privacy_mode_subscribe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Live counterpart to ws_privacy_mode_get_state above - same "this
    integration's own command, not the generic subscribe_events one"
    reasoning as device_settings_websocket_api.py's ws_subscribe_push (a
    device signed in as a non-admin Home Assistant user could never
    subscribe to a custom event type through the generic command at all)."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return

    @callback
    def forward_event(event) -> None:
        connection.send_message(websocket_api.event_message(msg["id"], event.data))

    connection.subscriptions[msg["id"]] = hass.bus.async_listen(PRIVACY_MODE_EVENT_CHANGED, forward_event)
    connection.send_result(msg["id"])


@websocket_api.websocket_command({vol.Required("type"): "family_hub/privacy_mode/set", vol.Required("enabled"): bool})
@websocket_api.async_response
async def ws_privacy_mode_set(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Open to any authenticated connection, with NO permission check at
    all, in either direction - the card's own "more" menu uses this to
    turn privacy mode ON (nobody needs special privilege to make the
    screen MORE private), and the switch.family_hub_privacy_mode entity's
    own turn_on/turn_off call privacy_mode_shared.async_set_privacy_mode
    directly rather than through this command, but with the exact same "no
    validation" result either way - see this feature's own module comment
    above for why. Turning privacy mode OFF from the card's own on-screen
    lock is deliberately a SEPARATE command (ws_privacy_mode_disable_with_
    pin below) that the card chooses to call instead of this one for that
    one flow - this command staying ungated is what the backend switch
    entity needs, not a hole in the on-screen unlock flow."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    await privacy_mode_shared.async_set_privacy_mode(hass, entry_data, msg["enabled"])
    device_settings_switch.notify_privacy_mode(entry_data)
    connection.send_result(msg["id"], {"enabled": msg["enabled"]})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/privacy_mode/list_eligible_users"})
@websocket_api.async_response
async def ws_privacy_mode_list_eligible_users(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Who can type a PIN to turn privacy mode off - every real admin (see
    _has_permission_ctx's own "admin always has every permission" rule)
    plus anyone explicitly granted PERMISSION_TOGGLE_PRIVACY_MODE under the
    Users tab's Permissions accordion. Deliberately NOT the same list as
    ws_kiosk_list_login_users (kioskLoginEnabledUserIds) - this is its own,
    unrelated privilege; a household may want someone to be able to clear
    privacy mode without also setting them up for full kiosk login
    elsewhere. Returns id/name/has_pin only, never a hash or salt - mirrors
    ws_kiosk_list_login_users's own response shape so the card can reuse the
    same "nobody has a PIN set yet" empty-state handling."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    pins = await async_load_pins(hass, entry_data)
    try:
        ha_users = await hass.auth.async_get_users()
    except Exception:  # noqa: BLE001
        ha_users = []
    users = []
    for u in ha_users:
        if getattr(u, "system_generated", False):
            continue
        if not _has_permission_ctx(entry_data, u.id, bool(u.is_admin), PERMISSION_TOGGLE_PRIVACY_MODE):
            continue
        users.append({"id": u.id, "name": u.name or u.id, "has_pin": bool(pins.get(u.id))})
    connection.send_result(msg["id"], {"users": users})


@websocket_api.websocket_command(
    {vol.Required("type"): "family_hub/privacy_mode/disable_with_pin", vol.Required("user_id"): str, vol.Required("pin"): str}
)
@websocket_api.async_response
async def ws_privacy_mode_disable_with_pin(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """The card's own on-screen lock-unlock flow."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    is_admin = await _ha_user_is_admin(hass, msg["user_id"])
    result = await async_verify_pin(hass, entry_data, msg["user_id"], msg["pin"])
    if result != "ok" or not _has_permission_ctx(entry_data, msg["user_id"], is_admin, PERMISSION_TOGGLE_PRIVACY_MODE):
        _send_pin_error(connection, msg["id"], result if result != "ok" else "incorrect", entry_data, msg["user_id"])
        return
    await privacy_mode_shared.async_set_privacy_mode(hass, entry_data, False)
    device_settings_switch.notify_privacy_mode(entry_data)
    connection.send_result(msg["id"], {"enabled": False})


ALL_COMMANDS = (
    ws_list_chores,
    ws_chores_schedule,
    ws_create_chore,
    ws_update_chore,
    ws_delete_chore,
    ws_clear_all_chores,
    ws_assign_chore,
    ws_claim_chore,
    ws_set_chore_in_progress,
    ws_complete_chore,
    ws_approve_chore,
    ws_reject_chore,
    ws_request_stars,
    ws_nudge_chore,
    ws_get_rewards_state,
    ws_add_catalog_item,
    ws_update_catalog_item,
    ws_delete_catalog_item,
    ws_redeem_reward,
    ws_adjust_balance,
    ws_delete_redemption,
    ws_reverse_redemption,
    ws_mark_fulfilled,
    ws_use_bank,
    ws_mark_bank_usage_fulfilled,
    ws_get_ledger,
    ws_gift_stars,
    ws_add_suggestion,
    ws_approve_suggestion,
    ws_reject_suggestion,
    ws_get_permissions,
    ws_get_my_permissions,
    ws_set_permissions,
    ws_kiosk_list_login_users,
    ws_kiosk_set_pin,
    ws_kiosk_elevate,
    ws_kiosk_deelevate,
    ws_more_menu_locked_set,
    ws_more_menu_locked_get_for_edit,
    ws_more_menu_unlock_options,
    ws_more_menu_unlock,
    ws_list_routines,
    ws_list_routine_library,
    ws_library_list,
    ws_library_save_item,
    ws_library_delete_item,
    ws_library_reset,
    ws_create_routine_item,
    ws_update_routine_item,
    ws_toggle_routine_item,
    ws_approve_routine_item,
    ws_delete_routine_item,
    ws_reorder_routine_items,
    ws_list_goals,
    ws_create_goal,
    ws_update_goal,
    ws_delete_goal,
    ws_clear_all_goals,
    ws_log_goal_progress,
    ws_approve_goal,
    ws_archive_goal,
    ws_reject_goal,
    # chore/reward timers.
    ws_list_timers,
    ws_start_chore_timer,
    ws_start_reward_timer,
    ws_start_standalone_timer,
    ws_cancel_timer,
    # household-wide timer alarms (speakers, Assist satellites,
    # dashboard ring) - see _dispatch_timer_alarm's own docstring.
    ws_dismiss_timer_alarm,
    ws_list_active_alarms,
    ws_timer_history,
    ws_test_alarm_device,
    ws_list_alarm_device_candidates,
    # Privacy mode.
    ws_privacy_mode_get_state,
    ws_privacy_mode_subscribe,
    ws_privacy_mode_set,
    ws_privacy_mode_list_eligible_users,
    ws_privacy_mode_disable_with_pin,
)


def async_register_all(hass: HomeAssistant) -> None:
    """Called once from __init__.py's async_setup, same pattern as every
    other family_hub/* command registration."""
    for command in ALL_COMMANDS:
        websocket_api.async_register_command(hass, command)
