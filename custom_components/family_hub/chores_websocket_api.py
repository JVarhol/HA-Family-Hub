"""Websocket API for the Chores/Rewards/Permissions feature area -
everything family-hub-chores-card.js, family-hub-my-chores-card.js, and
family-hub-rewards-card.js talk to. Registered from __init__.py's
async_setup, same as every other family_hub/* websocket command.

Named chores_websocket_api.py, NOT websocket_api.py - deliberately, to
avoid a real (and nasty) Python import gotcha: __init__.py already binds
the module-level name `websocket_api` to homeassistant.components.
websocket_api (`from homeassistant.components import panel_custom,
websocket_api`). A submodule of this package sharing that exact same
name would make `from . import websocket_api as chores_ws_api` silently
resolve to that ALREADY-BOUND HA module instead of this file - Python's
`from package import name` machinery checks `hasattr(package, name)`
first and only imports a same-named submodule if that check fails, so
the submodule here would never even get loaded via that statement. This
was hit for real (see PROJECT_CONTEXT.md's Chores architecture section /
the "Error during setup of component family_hub: module 'homeassistant.
components.websocket_api' has no attribute 'async_register_all'" bug) and
is the reason this file has this name - don't rename it back to
websocket_api.py.

Deliberately self-contained otherwise: nothing here imports from `.`
(family_hub's own __init__.py), even though a couple of tiny helpers below
duplicate a few lines that also exist there (_get_entry/_get_entry_data
mirror _get_family_hub_entry/_get_family_hub_entry_data; _split_notify_target
mirrors the same-named helper). __init__.py imports THIS module (to
register its commands), so the reverse import would be circular -
config_flow.py hit the exact same constraint and solved it the same way
(see its own _split_notify_target's docstring). Keeping this module import-
independent of __init__.py also means it can be unit tested without
loading the ~6000-line __init__.py module at all.

Permission model (see const.py's PERMISSION_* / CHORE_PERMISSIONS):
a real hass.user.is_admin account can always do everything; the
Permissions store (see store.py) can ADD specific permissions to specific
non-admin users on top of that baseline, but managing the Permissions
store itself always requires real is_admin - see _require_admin vs
_require_permission below.
"""
from __future__ import annotations

import hashlib
import logging
import secrets
import time
from datetime import datetime
from typing import Any, Optional

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from . import chore_engine, goal_engine, reward_engine, routine_engine, routine_library, sensor as timer_sensor, store as chores_store, timer_engine
from .const import (
    ALARM_REANNOUNCE_SECONDS,
    CHORE_KEY_ALARM_AUDIENCE,
    CHORE_KEY_GROUP_ID,
    CHORE_KEY_IMPORTANT,
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
    PERMISSION_VERIFY,
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


async def _send_instant_notification(hass: HomeAssistant, notify_targets: list[str], title: str, message: str) -> int:
    """Best-effort push to every resolved notify target - shared send loop
    for the two v123+ instant profile notifications (notifyRewardClaimed/
    notifyChoreApproved, see const.py's SETTINGS_KEY_USER_PROFILES
    docstring). Deliberately just the send loop, not chore_engine.py's own
    send_nudge (which also fires a chore lifecycle event) - a reward claim
    isn't a chore event at all, and a plain shared helper here covers both
    call sites without forcing reward_engine.py to take a hass dependency
    it explicitly doesn't want (see its own docstring). Mirrors __init__.py's
    Daily Digest send loop's best-effort try/except-per-target. Returns how
    many sends succeeded."""
    entry = _get_entry(hass)
    data = _notification_click_data(entry)
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


async def _send_alarm_notification(hass: HomeAssistant, notify_targets: list[str], title: str, message: str) -> int:
    """v1.119.0+: same send loop as _send_instant_notification, but with an
    enriched `data` payload asking the Home Assistant Companion App for
    alarm-like delivery instead of a normal quiet push - only used for a
    timer whose own "alarm" field is True (the owner's own notifyTimerAlarm
    profile flag, snapshotted at start - see timer_engine.py's docstring
    and _timer_alarm_enabled_for_user above). Household ask: "route this
    through alarm notifications for the person the timer is for."

    What this data payload actually does, per platform - these are Home
    Assistant Companion App features, not anything Family Hub invents:

      - Android: `channel: "alarm_stream_max"` is the app's own documented
        special channel name that routes the notification's sound through
        the phone's ALARM audio stream at max volume, the same stream a
        real alarm clock uses - it plays even with the ringer silenced or
        Do Not Disturb on, unlike a normal notification channel. `sticky`
        stops it being swiped away, and `tag` means a second alarm firing
        for the same person updates this one notification in place rather
        than stacking duplicates.
      - iOS: `push.sound.critical`/`push["interruption-level"]: "critical"`
        asks for a Critical Alert - the one iOS notification type allowed
        to sound even through Silent Mode and Focus. This REQUIRES Apple's
        Critical Alerts entitlement on the Companion App itself - already
        granted for Home Assistant Cloud (Nabu Casa) push, not available
        to a self-hosted install without applying to Apple directly. On a
        phone without that entitlement, iOS silently falls back to an
        ordinary (louder-than-default, but not DND-piercing) notification
        instead - there is nothing Family Hub can do from here to change
        that; it's an Apple/OS-level restriction on the app, not a
        household setting.

    There's no "ignore Stop until tapped" push notification type on either
    platform - the closest either OS offers is exactly this "bypass
    silent/DND once" alarm-style delivery. The actual "you must tap Stop to
    silence it" experience is the kiosk-side sound+modal handled entirely
    client-side by the tab that started the timer (see the card's own
    window.__familyHubTimerAlarm) - this function is only the phone half.
    """
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
    """v186+: household ask, verbatim - "Routines should be able to be
    triggers for automations." Mirrors chore_engine._fire_chore_event's
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
    """Whoever can add straight to the catalog with a price, and so is
    also the audience for approving/rejecting someone else's suggestion -
    reward-override's broader authority already implies this narrower one
    (same "either of two permissions" shape as ws_complete_chore's own
    can_complete_for_others), so this is deliberately an OR, not a
    replacement of PERMISSION_REWARD_OVERRIDE's existing catalog-management
    checks elsewhere in this file."""
    return _has_permission(entry_data, connection, PERMISSION_REWARD_OVERRIDE) or _has_permission(
        entry_data, connection, PERMISSION_REWARD_ADD
    )


# Task #29: "log in as a specific user at a kiosk display." A shared kiosk
# HA account (see const.py's SETTINGS_KEY_MEMBER_USER_IDS docstring for the
# existing "one shared Tablet login" pattern this builds on) can act, for a
# short window, AS whichever household member just typed their own PIN -
# elevations are minted by ws_kiosk_elevate below and consumed by
# _effective_actor. Deliberately an in-memory dict on entry_data, never a
# Store - every permission decision in this file is re-derived fresh from
# server-controlled data on every call (see this module's own docstring),
# so a restart safely forgetting every outstanding elevation is exactly
# the right failure mode, not a bug to work around.
KIOSK_ELEVATION_TTL_SECONDS = 90


def _kiosk_elevations(entry_data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return entry_data.setdefault("kiosk_elevations", {})


def _prune_kiosk_elevations(entry_data: dict[str, Any]) -> None:
    elevations = _kiosk_elevations(entry_data)
    now = time.time()
    for token in [tok for tok, rec in elevations.items() if rec["expires_at"] <= now]:
        elevations.pop(token, None)


def _hash_pin(pin: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}:{pin}".encode("utf-8")).hexdigest()


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
    """Resolves who is actually performing this action: by default the real
    HA login on the connection (same as the old bare _actor_id/_is_admin),
    or - if msg carries a still-valid elevation_token from ws_kiosk_elevate
    - whichever household member is currently "logged in" on this kiosk.
    A missing/unknown/expired token silently falls back to the real
    connection identity rather than erroring the whole call; the elevated
    UI is only ever a frontend convenience, ANY permission decision made
    from the (user_id, is_admin) this returns is still fully re-derived
    server-side by the caller right after (see _has_permission_ctx) -
    nothing here is trusted from the client beyond "which token to look
    up."""
    token = msg.get("elevation_token")
    if token:
        _prune_kiosk_elevations(entry_data)
        rec = _kiosk_elevations(entry_data).get(token)
        if rec:
            user_id = rec["user_id"]
            return user_id, await _ha_user_is_admin(hass, user_id)
    return _actor_id(connection), _is_admin(connection)


def _has_permission_ctx(entry_data: dict[str, Any], user_id: Optional[str], is_admin: bool, permission: str) -> bool:
    """Same rule _has_permission enforces, but against an already-resolved
    (user_id, is_admin) pair instead of a live connection - lets the kiosk-
    aware handlers below share this one permission rule with every other
    handler in the file, whether the actor came from _effective_actor
    (elevation-aware) or plain _actor_id/_is_admin."""
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
    """The one choke point every real chores save goes through - also
    refreshes the durable chores_backup.json file on disk (see store.py's
    backup_chores/maybe_restore_chores_backup) with this exact save, so a
    later removed-and-re-added config entry can recover it. Mirrors
    __init__.py's own _backup_settings-after-every-save pattern for the
    general Settings blob."""
    await entry_data["chores_store"].async_save(entry_data["chores"])
    await chores_store.backup_chores(hass, entry_data["chores"])


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
    """Local, lightweight settings load - mirrors ws_nudge_chore's existing
    inline pattern below rather than duplicating __init__.py's full
    _get_settings_and_profiles/_get_user_profiles normalization, since every
    caller here only ever needs one field per user (see
    _is_user_family_hub_member), not the whole per-user profile shape."""
    store = entry_data.get("settings_store")
    if store is None:
        return {}
    return await store.async_load() or {}


def _is_user_family_hub_member(settings: dict[str, Any], user_id: Optional[str]) -> bool:
    """user_id -> bool for chore_engine's is_user_enabled parameter (see its
    own docstring in chore_engine.py). Checks settings["memberUserIds"] -
    see SETTINGS_KEY_MEMBER_USER_IDS in const.py: membership is opt-IN, so
    unlike the retired choresEnabled toggle this used to check, there is no
    default-True fallback here - not being in the list at all means not a
    member."""
    if not user_id:
        return True
    raw = settings.get("memberUserIds")
    member_ids = {str(uid) for uid in raw} if isinstance(raw, list) else set()
    return user_id in member_ids


async def _make_is_user_enabled(entry_data: dict[str, Any]):
    """Returns a ready-to-pass-in `is_user_enabled` callback (see
    chore_engine.IsUserEnabled), closing over one settings load rather than
    re-loading the Settings store per rotation-group member checked.
    Membership-only (see _is_user_family_hub_member) - used for Routines
    (ws_create_routine_item), which is deliberately NOT gated by the
    narrower includeInChores flag below (see const.py's own docstring on
    that field for why). Chores itself uses _make_is_chores_eligible
    instead - see that function just below."""
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
    return profile.get("includeInChores", True) is not False


async def _make_is_chores_eligible(entry_data: dict[str, Any]):
    """Chores-flavored counterpart to _make_is_user_enabled just above -
    this is the one actually handed to chore_engine.py's create/update/
    assign/claim as their IsUserEnabled parameter, so a chores-excluded
    member is rejected as a new assignee exactly like a non-member already
    is, with the same error message (see chore_engine._check_user_enabled)."""
    settings = await _load_settings(entry_data)
    return lambda user_id: _is_chores_eligible(settings, user_id)


# ---------------------------------------------------------------------------
# Chores
# ---------------------------------------------------------------------------


@websocket_api.websocket_command({vol.Required("type"): "family_hub/chores/list"})
@websocket_api.async_response
async def ws_list_chores(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    connection.send_result(msg["id"], {"chores": list(entry_data["chores"].values())})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/chores/create",
        vol.Required("title"): str,
        vol.Optional("assigned_to"): vol.Any(str, None),
        # v184+: household ask, verbatim - "Ability to Assign chores to
        # multiple people. Each person is rewarded individually. Chore can
        # be marked completed for each person individually." When present
        # with 2+ entries, ws_create_chore fans this single request out
        # into one ordinary chore PER assignee (each with its own plain
        # `assigned_to`) instead of creating one multi-assignee record -
        # see CHORE_KEY_GROUP_ID's own docstring in const.py for why. A
        # single-entry list behaves exactly like plain `assigned_to`.
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
        # v187+: household ask, verbatim - "chore scheduling needs some
        # more work potentially want to do every 2 months or every 3
        # months, every 4th week or 7th week, every other day etc." Only
        # meaningful when recur_type == "interval" - see chore_engine.
        # _normalize_recur_interval_unit/_compute_next_recur_due's own
        # comments.
        vol.Optional(CHORE_KEY_RECUR_INTERVAL_UNIT): vol.Any(str, None),
        vol.Optional("recur_weekdays"): [int],
        # v185+: household ask, verbatim - "Better chore scheduling so you
        # can choose things like every third Wednesday or the first weekend
        # of every month. Very similar to how Google calendar does it now."
        # Only meaningful when recur_type == "monthly_nth" - see chore_
        # engine._compute_next_recur_due's own comment for how this pairs
        # with recur_weekdays just above to express "the first weekend."
        vol.Optional(CHORE_KEY_RECUR_MONTH_NTH): vol.Any(int, None),
        # v186+: household ask, verbatim - "Chores due x amount time before
        # due on recurring chores. This will set the due date based on when
        # the chore is recurred instead of when the chore was created." How
        # many minutes after each recurrence reset_recurring_chore should
        # set the fresh due_date to - see chore_engine._normalize_recur_
        # due_offset_minutes.
        vol.Optional(CHORE_KEY_RECUR_DUE_OFFSET_MINUTES): vol.Any(int, None),
        vol.Optional("no_approval_required"): bool,
        vol.Optional("quantity_total"): vol.Any(int, None),
        # v1.110.0+: optional countdown length in minutes, None to clear.
        vol.Optional("timer_minutes"): vol.Any(int, None),
        # v1.132.55+: who/what rings when this chore's timer alarms - see
        # const.py's CHORE_KEY_ALARM_AUDIENCE/TIMER_ALARM_AUDIENCES.
        vol.Optional(CHORE_KEY_ALARM_AUDIENCE): vol.Any(str, None),
        # v184+: household ask, verbatim - "Ability to Mark Chores
        # Important. Chore will have a red ! denoting importance, they
        # always go to the top of the list."
        vol.Optional(CHORE_KEY_IMPORTANT): bool,
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
    # v144.4+: creating a chore with no_approval_required=True is the one
    # specific way someone with plain PERMISSION_ASSIGN could otherwise
    # collect stars with zero oversight - author a chore assigned to
    # themselves, skip verification entirely, done. Turning it OFF (or
    # simply not sending the field, the vast majority of chores) never
    # needs this - see PERMISSION_STAR_OVERRIDE's own docstring in const.py.
    if msg.get("no_approval_required") and not _has_permission(entry_data, connection, PERMISSION_STAR_OVERRIDE):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted star-override permission) can create a chore that doesn't require approval.")
        return
    # v184+: multi-assignee fan-out - see the schema's own comment on
    # assigned_to_list above. De-duplicated, order-preserving (a household
    # double-checking the same person twice in the picker shouldn't get two
    # identical chores for them). A single name in the list is handled by
    # this same path (group_id stays None for it, same as an ordinary
    # single-assignee create - a "group" of one isn't a group).
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
            # Roll back any chores this same request already created rather
            # than leaving a half-applied multi-assign (e.g. the 2nd of 3
            # assignees turns out not to be chores-eligible) - a household
            # fixing the error and resubmitting should see a clean retry,
            # not duplicates of whichever assignees already succeeded.
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
        # v187+: household ask, verbatim - "chore scheduling needs some
        # more work potentially want to do every 2 months or every 3
        # months, every 4th week or 7th week, every other day etc." Only
        # meaningful when recur_type == "interval" - see chore_engine.
        # _normalize_recur_interval_unit/_compute_next_recur_due's own
        # comments.
        vol.Optional(CHORE_KEY_RECUR_INTERVAL_UNIT): vol.Any(str, None),
        vol.Optional("recur_weekdays"): [int],
        # v185+: see ws_create_chore's identical field for the household ask
        # this answers.
        vol.Optional(CHORE_KEY_RECUR_MONTH_NTH): vol.Any(int, None),
        # v186+: household ask, verbatim - "Chores due x amount time before
        # due on recurring chores. This will set the due date based on when
        # the chore is recurred instead of when the chore was created." How
        # many minutes after each recurrence reset_recurring_chore should
        # set the fresh due_date to - see chore_engine._normalize_recur_
        # due_offset_minutes.
        vol.Optional(CHORE_KEY_RECUR_DUE_OFFSET_MINUTES): vol.Any(int, None),
        vol.Optional("no_approval_required"): bool,
        vol.Optional("quantity_total"): vol.Any(int, None),
        # v1.110.0+: optional countdown length in minutes, None to clear.
        vol.Optional("timer_minutes"): vol.Any(int, None),
        # v1.132.55+: see ws_create_chore's identical field.
        vol.Optional(CHORE_KEY_ALARM_AUDIENCE): vol.Any(str, None),
        # v184+: see ws_create_chore's identical field for the household ask
        # this answers.
        vol.Optional(CHORE_KEY_IMPORTANT): bool,
    }
)
@websocket_api.async_response
async def ws_update_chore(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """v144.4+: gated on PERMISSION_EDIT_CHORE, NOT PERMISSION_ASSIGN - see
    that permission's own docstring in const.py for why this was split out
    (the household's own worry: someone granted plain "assign chores"
    could otherwise also go bump the star_value on any existing open
    chore). Someone with PERMISSION_ASSIGN alone (no PERMISSION_EDIT_CHORE)
    can still create/assign brand new chores, just can't come back and
    edit an existing one afterward - a household that wants both grants
    both."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _has_permission(entry_data, connection, PERMISSION_EDIT_CHORE):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted chore-editing permission) can edit chores.")
        return
    # Same star-override gate ws_create_chore enforces - see its own
    # comment and PERMISSION_STAR_OVERRIDE's docstring in const.py. Editing
    # any OTHER field never needs this, only flipping no_approval_required
    # ON. Compared against the chore's CURRENT stored value (not just
    # truthiness of the incoming field) so that re-saving an unrelated edit
    # on a chore an admin already marked no_approval_required=True doesn't
    # itself get blocked for someone who only has PERMISSION_EDIT_CHORE -
    # the chores card's edit form always resends whatever the checkbox
    # currently shows, changed or not (see family-hub-chores-card.js's
    # _submitEdit), so a same-value resend must not require this permission.
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
    # v1.110.0+: a deleted chore's timer has nothing left to count toward.
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
    # v1.110.0+: reassigning a chore mid-countdown drops its timer. The
    # timer belongs to the person it was started for, and silently
    # transferring "you have 12 minutes left to clean" to somebody who
    # never agreed to it (or leaving it counting for the old assignee, who
    # no longer owns the chore) are both worse than making the new
    # assignee tap Start themselves.
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
        vol.Required("type"): "family_hub/chores/complete",
        vol.Required("chore_id"): str,
        vol.Optional("elevation_token"): str,
    }
)
@websocket_api.async_response
async def ws_complete_chore(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """The assignee can mark their own chore done; so can anyone with
    verify permission (or a real admin) marking it done on someone else's
    behalf (e.g. a young child with no HA login of their own); so can
    anyone granted the narrower can_complete_any permission (e.g. a shared
    wall-tablet login that should be able to tap Done for anyone without
    also getting verify's authority to approve completions and finalize
    star payouts - see const.py's PERMISSION_COMPLETE_ANY docstring)."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    chore = entry_data["chores"].get(msg["chore_id"])
    # Task #29: resolves to whichever household member is "logged in" on
    # this kiosk (see _effective_actor's own docstring) when msg carries a
    # valid elevation_token, else the real connection identity as before.
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
    # v1.110.0+: completing a chore by hand while a timer is counting down
    # on it just ends the timer - "don't fight the user." They've clearly
    # finished early (or changed their mind about timing it), and leaving
    # an orphan timer running against a now-approved chore would fire a
    # second, meaningless completion later.
    await _clear_chore_timers(hass, entry_data, msg["chore_id"])
    await _apply_chore_completion_effects(hass, entry_data, chore)
    connection.send_result(msg["id"], {"chore": chore})


async def _apply_chore_completion_effects(hass: HomeAssistant, entry_data: dict[str, Any], chore: dict[str, Any]) -> None:
    """Everything that has to happen AFTER chore_engine.complete_chore
    succeeds, factored out of ws_complete_chore (v1.110.0+) so a chore
    timer running out can reuse the completion path byte-for-byte instead
    of forking its own.

    That reuse is the whole design of chore timers, and it is deliberate -
    the household's own words when asked what a timer ending should do:
    "the chore already has a does not require approval and the users
    already have a permission for does not require approval on chores, this
    should handle it already." So a timer ending is simply an alternate way
    of pressing Done. Whether the chore lands in Awaiting Approval or
    auto-approves and pays out is decided exactly where it always was -
    inside chore_engine.complete_chore, off the chore's own
    no_approval_required flag and the completer's PERMISSION_AUTO_APPROVE
    grant. Nothing about that logic is duplicated or re-implemented here.
    """
    await _save_chores(hass, entry_data)
    if chore.get("status") == chore_engine.CHORE_STATUS_APPROVED:
        # Auto-approved on completion (chore_skips_verification) - same
        # side effects ws_approve_chore performs after a manual approval:
        # persist the star payout and send the assignee their notification,
        # since approve_chore's own code path never ran for this one.
        await _save_rewards(hass, entry_data)
        await _notify_chore_approved(hass, entry_data, chore)


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
    """v123+: an instant push to the chore's own assignee, gated by their
    own profile's notifyChoreApproved flag - see const.py's
    SETTINGS_KEY_USER_PROFILES docstring. Never sent to anyone else, and a
    no-op (not an error) when the assignee has no profile, no notify
    targets, or the flag off - same "opt in to nothing" shape as every
    other profile-gated send in this file."""
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
    """v128+: the other way out of the verification gate - same permission
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
    await _save_chores(hass, entry_data)
    await _notify_chore_rejected(hass, entry_data, chore)
    connection.send_result(msg["id"], {"chore": chore})


async def _notify_chore_rejected(hass: HomeAssistant, entry_data: dict[str, Any], chore: dict[str, Any]) -> None:
    """v128+: the reject-side twin of _notify_chore_approved right above -
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


# ---------------------------------------------------------------------------
# Rewards
# ---------------------------------------------------------------------------


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
            # v127+: always included, same as catalog/redemptions above -
            # every caller can see what's pending (a submitter should be
            # able to see their own suggestion is still waiting), the
            # approve/reject ACTIONS are what's actually permission-gated
            # (see ws_approve_suggestion/ws_reject_suggestion below), not
            # visibility of the list itself.
            "suggestions": reward_engine.list_suggestions(rewards),
            # v128+: same full-household transparency as "balances" above
            # (every caller sees everyone's) - {user_id: {item_id: amount}}
            # for "banked" redeem_mode rewards, see reward_engine._adjust_bank.
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
        # v128+ - see const.py's REWARD_REDEEM_MODES docstring and
        # reward_engine.add_catalog_item.
        vol.Optional("redeem_mode"): str,
        vol.Optional("requires_fulfillment"): bool,
        vol.Optional("value_note"): str,
        vol.Optional("stack_unit_amount"): vol.Any(int, float),
        vol.Optional("stack_unit_label"): str,
        vol.Optional("timer_minutes"): vol.Any(int, None),
        # v1.132.55+ - see const.py's REWARD_KEY_ALARM_AUDIENCE/
        # TIMER_ALARM_AUDIENCES.
        vol.Optional("alarm_audience"): str,
        vol.Optional("elevation_token"): str,
    }
)
@websocket_api.async_response
async def ws_add_catalog_item(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """v127+: gated on _can_add_rewards (reward-override OR the narrower
    can_add_rewards grant), not reward-override alone - see const.py's
    PERMISSION_REWARD_ADD. Anyone WITHOUT either of those still gets to
    suggest a new reward, just through ws_add_suggestion below instead
    (no price, pending an approve_suggestion) - the card decides which of
    the two commands to call based on what family_hub/permissions/get_mine
    told it, and this handler independently re-checks rather than trusting
    that client-side choice, same as every other permission gate here.

    v1.132.9+: household report, verbatim: "when logged in as elevated user
    on todo lists I cant assign a star value to items on the kiosk." Root
    cause: unlike ws_approve_suggestion/ws_reject_suggestion (which accept
    an optional elevation_token and resolve the actor via _effective_actor +
    _can_add_rewards_ctx), this handler only ever checked the raw connection
    identity (_can_add_rewards(entry_data, connection)) - so on a shared
    kiosk display, tying a wish-list item to a reward (family-hub-todo-
    card.js's _openTieRewardModal) or adding a reward straight from the
    Rewards card's own + button always checked the SHARED KIOSK's own HA
    login, never whichever household member had actually PIN-elevated on
    that kiosk, even when the card correctly showed the "Add star value"/
    "canPrice" UI because it *had* checked the elevated user's own
    permissions client-side. Fixed the same way the suggestion handlers
    already were: elevation_token is now accepted here too, and the
    permission check is elevation-aware via _effective_actor/
    _can_add_rewards_ctx - the cards' own _kioskMsg wrapper (already used
    for other kiosk-aware calls) supplies the token whenever a kiosk
    elevation is active, and is simply absent (so this falls back to the
    real connection identity, unchanged) everywhere else."""
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
    default (task #29: "the caller" includes whoever is elevated via a
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
    """v123+: an instant push to EVERY profile opted into notifyRewardClaimed
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

    v199+: household report, verbatim: "when logging in and trying to
    adjust stars I get an error that only an admin can adjust stars." Same
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
    """v128+: marks a pending (requires_fulfillment) redemption as
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
    """v128+: spends part (or all) of a banked reward - "use 1.5 of my 3
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
    """v128+: a complete per-user star history (every chore approval/
    overdue penalty/redemption/reversal/manual adjustment - see
    reward_engine.add_stars) for the rewards card's own "click a name to
    see their history" view. No permission gate, for the same reason
    ws_get_rewards_state's own balances/redemptions aren't gated either -
    this household's Rewards board is already fully transparent (everyone
    already sees everyone's balance and full redemption history in one
    request), so a per-user star history is no more sensitive than what's
    already visible."""
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
    """Task #31: gift some of the caller's OWN stars to another household
    member - self-serve and instant, same "no admin approval needed" shape
    ws_redeem_reward already has (see reward_engine.gift_stars' own
    docstring). Elevation-aware the same way ws_redeem_reward is (task #29
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
    """v127+: open to any authenticated household member, no permission
    gate at all - this IS the path for whoever doesn't have pricing
    authority (see _can_add_rewards/PERMISSION_REWARD_ADD). Someone who DOES
    have it could call this too (nothing stops them), but the card only
    ever calls it when family_hub/permissions/get_mine said they can't add
    directly - see ws_add_catalog_item's own docstring for the other half
    of that split."""
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


# ---------------------------------------------------------------------------
# Permissions
# ---------------------------------------------------------------------------


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
    """v127+: the non-admin-safe counterpart to ws_get_permissions above -
    open to ANY authenticated household member (not admin-only), and
    returns only the CALLER's own effective grants (exactly the
    {permission: bool} shape _has_permission already checks for every
    gated action here), never anyone else's. This is what actually lets a
    permission granted to a non-admin (can_verify, can_add_rewards, ...)
    show up as usable UI on THEIR OWN card instance - before this existed,
    every card's own permission-gated buttons only ever called the
    admin-only endpoint above (and only when hass.user.is_admin was
    already true), so a granted non-admin's own client never actually
    learned about their own grant and the UI stayed hidden for them
    regardless of what the Permissions store said server-side. Reusing
    ws_get_permissions for this instead would mean either loosening it to
    leak every OTHER user's grants to a non-admin, or leaving this gap in
    place - so this is a new, narrower command instead."""
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
        # v1.132.5+: PERMISSION_SEE_WISHLIST_CLAIMS - see its own docstring
        # in const.py. Must be listed here literally (this schema doesn't
        # derive its keys from CHORE_PERMISSIONS) or a save carrying this
        # field would be silently stripped by voluptuous before the handler
        # ever saw it, even though the handler's own `for key in
        # CHORE_PERMISSIONS` loop below already handles it generically.
        vol.Optional("can_see_wishlist_claims"): bool,
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


# ---------------------------------------------------------------------------
# Kiosk PIN login (task #29) - "Need a way to be able to log in as a
# specific user at a kiosk display... click a button at the top of chores
# or rewards and be asked for a pin code that would then allow you to run
# in an elevated permission state of whatever users code was entered."
#
# Builds on the existing "shared Tablet login" pattern (see const.py's
# SETTINGS_KEY_MEMBER_USER_IDS docstring) rather than replacing it: the
# kiosk's own HA account is still the one real websocket connection, but
# once a household member's PIN is verified here, every kiosk-aware
# handler above (ws_complete_chore, ws_approve_chore, ws_reject_chore,
# ws_redeem_reward, ws_approve_suggestion, ws_reject_suggestion,
# ws_approve_goal, ws_reject_goal) resolves the acting user through
# _effective_actor instead of the raw connection - see its own docstring
# for exactly how a msg["elevation_token"] is turned into a (user_id,
# is_admin) pair, and note the permission decision is always re-derived
# server-side from that pair, never trusted from the client.
#
# PIN storage/verification is deliberately NOT routed through the general
# family_hub/get_settings / family_hub/set_settings pair - that pair does
# an ungated full blob replace (see __init__.py's own _ws_set_settings
# docstring), so nothing would stop any authenticated connection from
# overwriting someone else's PIN hash through it. ws_kiosk_set_pin below
# is the one and only place a PIN hash is ever written, and it is always
# admin-gated - "once set only an admin can reset a code or change it,"
# per the spec, applies even to a not-yet-set PIN (no separate self-
# service first-time-set path, so there's never a window where anyone
# could plant their own PIN on an un-PINned profile). WHICH members have
# kiosk login enabled at all (settings["kioskLoginEnabledUserIds"]) is
# not secret, so that toggle lives in the ordinary Settings blob like
# memberUserIds/permissions already do - only the PIN hash itself gets
# this extra protection.
# ---------------------------------------------------------------------------


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
    users = [
        {"id": uid, "name": names.get(uid, uid), "has_pin": bool((profiles.get(uid) or {}).get("pinHash"))}
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
    store = entry_data.get("settings_store")
    if store is None:
        connection.send_error(msg["id"], "not_found", "Family Hub is not set up")
        return
    settings = await store.async_load() or {}
    profiles = settings.setdefault("userProfiles", {})
    profile = dict(profiles.get(msg["user_id"]) or {})
    if pin:
        salt = secrets.token_hex(16)
        profile["pinSalt"] = salt
        profile["pinHash"] = _hash_pin(pin, salt)
    else:
        profile.pop("pinSalt", None)
        profile.pop("pinHash", None)
    profiles[msg["user_id"]] = profile
    await store.async_save(settings)
    connection.send_result(msg["id"], {"has_pin": bool(pin)})


@websocket_api.websocket_command(
    {vol.Required("type"): "family_hub/kiosk/elevate", vol.Required("user_id"): str, vol.Required("pin"): str}
)
@websocket_api.async_response
async def ws_kiosk_elevate(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Verifies a household member's own PIN and, on success, mints a
    short-lived server-side elevation token - see _effective_actor's own
    docstring for how every kiosk-aware handler consumes it. Deliberately
    the same "incorrect_pin" error for a wrong PIN, an unset PIN, or a
    user_id kiosk login isn't enabled for - never confirms/denies which of
    those it was, so a kiosk display can't be used to fish for who has a
    PIN set."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    settings = await _load_settings(entry_data)
    enabled_ids = settings.get("kioskLoginEnabledUserIds") or []
    profile = (settings.get("userProfiles") or {}).get(msg["user_id"]) or {}
    salt = profile.get("pinSalt")
    stored_hash = profile.get("pinHash")
    if (
        msg["user_id"] not in enabled_ids
        or not salt
        or not stored_hash
        or _hash_pin(msg["pin"], salt) != stored_hash
    ):
        connection.send_error(msg["id"], "incorrect_pin", "Incorrect PIN.")
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


# ---------------------------------------------------------------------------
# Routines - see routine_engine.py's module docstring for how this is a
# deliberately separate, lighter-weight sibling to Chores/Rewards above (no
# stars, no verification gate, no assignment modes).
# ---------------------------------------------------------------------------


def _can_write_routine_items(
    entry_data: dict[str, Any], connection: websocket_api.ActiveConnection, target_user_id: Optional[str]
) -> bool:
    """v1.132.47+: household ask, verbatim - "Need a permission to add/
    delete routines both add/delete self and all so someone can't modify
    others." Shared by ws_create_routine_item/ws_update_routine_item/
    ws_delete_routine_item/ws_reorder_routine_items below - the one place
    this rule is decided, so all four stay consistent. target_user_id is
    whichever person's routine SECTION the write actually touches (the
    create/reorder request's own "user_id" field, or - for update/delete,
    which only ever carry an item_id - the EXISTING item's own "user_id",
    looked up before this is called; see each handler for how it's
    resolved).

    Allowed if: a real HA admin (always, same baseline every permission
    check in this file starts from - see _has_permission); OR
    PERMISSION_ASSIGN (unchanged from every routine write's original,
    single gate - an assign-permission holder keeps managing every
    person's routines exactly as before, this function is purely
    additive); OR the new PERMISSION_ROUTINES_MANAGE_ANY (same reach as
    PERMISSION_ASSIGN, scoped to just Routines, for a household that wants
    to hand out routine-management authority without PERMISSION_ASSIGN's
    much broader chore-assignment authority too); OR the new
    PERMISSION_ROUTINES_MANAGE_OWN, but ONLY when target_user_id is the
    acting user's own id - unlike every other permission this file checks
    (a flat name lookup with no further comparison), this one only ever
    grants write access to the grantee's OWN section, never anyone else's,
    which is the entire point of the household's ask ("so someone can't
    modify others").

    Deliberately NOT elevation-aware (unlike many other handlers in this
    file that resolve the actor via _effective_actor/_has_permission_ctx
    for a kiosk-PIN-elevated session) - the routine write handlers have
    never accepted an elevation_token at all (see their own websocket_
    command schemas), so this stays consistent with that existing,
    unchanged behavior rather than quietly expanding kiosk-elevation
    support as a side effect of adding these two new permissions."""
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


# v184+: household ask, verbatim - "Build a Routine Library - a common
# library of routines that people can pick from to build out their day.
# Brush teeth, make bed, etc etc etc." Read-only, no permission gate (same
# as ws_list_routines/ws_list_chores - it's just a menu of suggestions, not
# anyone's actual data), served straight from routine_library.py's static
# list. Picking an entry in the UI is just a faster way to fill in the
# EXISTING create-routine-item form/call (ws_create_routine_item) - nothing
# here writes anything.
@websocket_api.websocket_command({vol.Required("type"): "family_hub/routines/library"})
@websocket_api.async_response
async def ws_list_routine_library(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    connection.send_result(msg["id"], {"items": routine_library.get_routine_library()})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/routines/create",
        vol.Required("user_id"): str,
        vol.Required("category"): str,
        vol.Required("title"): str,
        # v136+: both optional, same shape/validation as routine_engine.py's
        # _validate_due_time/_validate_days_of_week (recur_weekdays just
        # above is the precedent for [int] as the schema shape for a list
        # of weekday numbers).
        vol.Optional("due_time"): vol.Any(str, None),
        vol.Optional("days_of_week"): [int],
        vol.Optional("star_value"): int,
        vol.Optional("no_approval_required"): bool,
        # v1.132.41+ (household ask, verbatim: "add the account to automate
        # routine completion based on sensors like we do with chores") -
        # same loose shape as ws_create_chore's auto_create_trigger/auto_
        # complete_trigger just above: any dict or None, the inner entity_
        # id/from_state/to_state fields aren't enforced here either, since
        # matching only happens later at trigger-fire time.
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
    """Checking an item off is open to anyone with access to the card - no
    permission gate, same low-stakes self-serve principle as
    ws_claim_chore. This is a personal daily checklist on a shared kitchen
    tablet, not a reward-bearing chore; see routine_engine.toggle_item's
    own docstring for the full reasoning (star_value/no_approval_required,
    v141+, are this handler's one addition over the original zero-stakes
    version - still no permission gate on the checkbox itself, since
    toggle_item only ever immediately pays out when the item's OWN
    no_approval_required says to; otherwise it just flips on
    pending_approval for ws_approve_routine_item, which IS gated, to
    resolve)."""
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
    # v186+: "routine_completed" fires once, right on the transition into
    # every today-due item for this user_id+category being done - see
    # routine_engine.is_routine_complete's own docstring for why it's
    # gated on was_done being False (never re-fires from toggling an
    # already-fully-done routine's item off and back on).
    if item.get("done") and not was_done and routine_engine.is_routine_complete(
        entry_data["routines"], item["user_id"], item["category"]
    ):
        _fire_routine_event(hass, event="routine_completed", user_id=item["user_id"], category=item["category"], actor=actor)
    connection.send_result(msg["id"], {"item": item})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/routines/approve_item", vol.Required("item_id"): str})
@websocket_api.async_response
async def ws_approve_routine_item(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """The manual half of a routine item's star payout (routine_engine.
    approve_item) - gated on PERMISSION_VERIFY, the exact same tier that
    approves a chore's completion, since this is the same kind of decision
    (a kid says they're done, a parent confirms before stars move) just on
    a routine item instead of a chore."""
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
    """v1.132.47+: same _can_write_routine_items gate as create/update above
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
    """v211+: household ask, verbatim - "allow routine blocks to be drug
    around and ordered in the routine modal" - persists a drag-and-drop
    reorder of one person's one routine category (routine_engine.
    reorder_items). v1.132.47+: same _can_write_routine_items gate as
    create/update/delete just above (see that helper's own docstring) -
    reordering is exactly as privileged an edit to a routine as any of
    those. The request already carries the target "user_id" directly (same
    as create), so no item lookup is needed first, unlike update/delete."""
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


# ---------------------------------------------------------------------------
# Goals - see goal_engine.py's own module docstring for how this differs
# from Chores/Rewards above. Reuses the exact same PERMISSION_ASSIGN/
# PERMISSION_VERIFY/PERMISSION_COMPLETE_ANY tiers Chores already has (no new
# Permissions-tab checkboxes to add) and the same _make_is_chores_eligible
# member/includeInChores gate - a goal's assignee pool is the same pool a
# chore's assignee pool already is, so there's no separate "includeInGoals"
# flag to invent.
# ---------------------------------------------------------------------------


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



# ---------------------------------------------------------------------------
# Chore/reward timers (v1.110.0+) - "2 hours of gaming, when you click use
# reward a timer would start and then a timer would go off at the end of the
# 2 hours. Or if you have a chore thats like clean for 30 minutes, at the end
# of 30 minutes it would set off a timer, and either go to approval mode or
# complete the award."
#
# State lives in its own Store (see const.py's TIMERS_STORAGE_KEY_PREFIX) and
# holds only what is currently counting down - timer_engine.py owns all the
# pure logic. Expiry is driven from the backend on a dedicated tight sweep
# (see _expire_due_timers below and its registration in __init__.py), NOT
# from a browser, so a timer still fires with every dashboard closed and the
# tablet asleep.
#
# Permissions follow the non-timer equivalents exactly, on the principle
# that starting a timer is just a way of doing the thing the timer ends in:
#   - Starting/cancelling a timer on YOUR OWN chore, or using your own
#     timed reward, needs nothing extra - same as tapping Done or Use.
#   - Doing either on someone ELSE's behalf needs the same grant that
#     action already needs: PERMISSION_VERIFY or PERMISSION_COMPLETE_ANY
#     for chores (mirroring ws_complete_chore), PERMISSION_REWARD_OVERRIDE
#     for rewards (mirroring ws_redeem_reward).
# ---------------------------------------------------------------------------


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




# ---------------------------------------------------------------------------
# Native Home Assistant timer.* integration (v1.110.2+)
#
# "this should use the home assistant native timer.*". See const.py's
# TIMER_ENTITY_PREFIX for the full research note on why Family Hub ADOPTS
# native timer helpers rather than creating them (short version: `timer` is
# a helper domain, not an entity platform - it is absent from HA's own
# generated entity_platforms list, and its storage collection is a local
# variable no other integration can reach, so there is no supported way to
# create one programmatically).
#
# What these helpers do: when a Family Hub timer starts, if the household
# has any free `timer.family_hub*` helper, the countdown is handed to it via
# the real timer.start service and completion arrives as HA's own
# timer.finished event instead of being polled. Everything downstream -
# which chore gets completed, who gets notified, the approval path - is the
# UNCHANGED code from v1.110.0/v1.110.1; only the trigger moved.
# ---------------------------------------------------------------------------


def slugify_for_entity(name: str) -> str:
    """Match Home Assistant's own slugify closely enough for the names
    Family Hub generates: lowercase, every run of non-alphanumerics
    collapsed to a single underscore, trimmed. HA slugifies a helper's
    `name` into its entity_id itself (see const.py's
    TIMER_HELPER_NAME_PREFIX note), so this is how the backend predicts
    which entity a given person's dedicated helper will be - it never
    creates anything, it only has to agree with HA about the name.

    Deliberately conservative: ordinary household names ("Emma", "Mom &
    Dad", "Jo-Anne") land on the same slug HA produces. Anything exotic
    enough to diverge simply fails the lookup and falls through to the
    shared pool, which is a harmless outcome rather than a wrong one.
    """
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
    """The entity_id of this person's OWN auto-created timer helper, or
    None for a timer with nobody assigned. Derived from their display name
    rather than stored in a mapping table: the helper was named from that
    same name in the first place (see _ensureTimerHelpers in the cards), so
    deriving it keeps the two sides in sync with nothing to migrate and
    nothing that can go stale when somebody is renamed - a rename just
    means the old helper stops being matched and a new one is created on
    the next reconcile."""
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
    """Choose which native timer helper should run this countdown.

    v1.110.3+ preference chain, in order - each step falling through to the
    next when nothing is available:

      (a) THE ASSIGNED PERSON'S OWN dedicated helper
          (timer.family_hub_<their name>). Preferred first so someone's
          timer shows up on the entity that carries their name, which is
          what makes "when timer.family_hub_emma finishes, announce it in
          Emma's room" a natural automation to write.
      (b) One of the shared family helpers
          (timer.family_hub_family_1..TIMER_FAMILY_POOL_SIZE) - the pool
          the household's unassigned timers live on, and the natural
          overflow when a person already has their own one running.
      (c) Any OTHER adoptable timer.family_hub* helper. This is the
          v1.110.2 behaviour, kept so a household that hand-made helpers
          under the old model keeps working untouched.
      (d) None - run unbacked, off the store plus the backstop sweep,
          exactly as v1.110.0 did. Still the zero-setup default.
    """
    bound = timer_engine.bound_entity_ids(_timers_state(entry_data))

    own = await dedicated_timer_entity_id(hass, timer.get("user_id"))
    if own and _is_free_native_timer(hass, own, bound):
        return own

    for index in range(1, TIMER_FAMILY_POOL_SIZE + 1):
        entity_id = f"{TIMER_FAMILY_ENTITY_PREFIX}{index}"
        if _is_free_native_timer(hass, entity_id, bound):
            return entity_id

    # Anything else the household has made under the naming convention -
    # sorted so the choice is deterministic rather than state-order luck.
    # Somebody ELSE's dedicated helper is excluded: borrowing Emma's timer
    # for Sam's chore would put Sam's countdown on an entity named after
    # Emma, which is exactly the confusion this chain exists to avoid.
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
    """True when this helper is another household member's own named timer.
    Checked against the CURRENT member list so a helper left behind by a
    removed member (which is deliberately never deleted - see const.py)
    becomes generally adoptable again rather than staying reserved for
    somebody who is no longer here."""
    settings_store = entry_data.get("settings_store")
    settings = (await settings_store.async_load() or {}) if settings_store is not None else {}
    for member_id in settings.get("memberUserIds") or []:
        if member_id == for_user_id:
            continue
        if await dedicated_timer_entity_id(hass, member_id) == entity_id:
            return True
    return False


async def _adopt_native_timer(hass: HomeAssistant, entry_data: dict[str, Any], timer: dict[str, Any]) -> None:
    """Hand this timer's countdown to a free native timer.* entity, if there
    is one. Best-effort on purpose: a household with no helpers (the
    zero-setup default) simply gets the store-plus-sweep behaviour that
    shipped in v1.110.0, and so does one whose helper refuses the call.
    The Family Hub timer record is the source of truth either way, which is
    what keeps the two paths behaviourally identical.
    """
    try:
        entity_id = await _pick_native_timer(hass, entry_data, timer)
        if not entity_id:
            return
        # v1.132.59+: duration_minutes can now be fractional (a sub-minute
        # standalone timer - "can we make the timer accept seconds"), so
        # this is computed in total seconds rather than truncating via
        # int(minutes) first, which used to silently drop anything under a
        # minute. round() rather than int() so e.g. 0.5 minutes lands on
        # exactly :30, not :29 from float imprecision.
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


async def _fire_timer(hass: HomeAssistant, entry_data: dict[str, Any], timer: dict[str, Any]) -> None:
    """The one dispatcher both completion paths go through - HA's own
    timer.finished event (_handle_native_timer_event) and the backstop
    sweep (_expire_due_timers). Factored out in v1.110.2 precisely so that
    moving to native, event-driven completion changed only WHAT TRIGGERS a
    timer firing and nothing at all about what firing does: the three
    _fire_*_timer functions below are the same code that shipped in
    v1.110.0/v1.110.1, untouched.
    """
    # v1.110.3+ - fire Family Hub's own event FIRST, before the kind-
    # specific action, so an automation reacting to it (see
    # EVENT_FAMILY_HUB_TIMER_FINISHED in const.py) sees this exactly once
    # per completion regardless of which of the three actions below does
    # or doesn't raise. The sensor for this timer is removed by the caller
    # (handle_native_timer_event / _expire_due_timers) - by the time either
    # calls this, the Store record is already gone, which is what "expired,
    # about to fire" means.
    hass.bus.async_fire(
        EVENT_FAMILY_HUB_TIMER_FINISHED,
        {
            "uid": timer.get("uid"),
            "kind": timer.get("kind"),
            "chore_id": timer.get("chore_id"),
            "reward_item_id": timer.get("item_id"),
            "title": timer.get("title"),
            "user_id": timer.get("user_id"),
            "user_name": await _user_display_name(hass, timer.get("user_id")) if timer.get("user_id") else None,
            "native_timer_entity_id": timer.get("entity_id"),
            "started_at": timer.get("started_at"),
            "duration_minutes": timer.get("duration_minutes"),
        },
    )
    kind = timer.get("kind")
    if kind == TIMER_KIND_CHORE:
        await _fire_chore_timer(hass, entry_data, timer)
    elif kind == TIMER_KIND_STANDALONE:
        await _fire_standalone_timer(hass, entry_data, timer)
    else:
        await _fire_reward_timer(hass, entry_data, timer)


async def handle_native_timer_event(hass: HomeAssistant, event: Any) -> None:
    """Completion driven by Home Assistant itself.

    Registered in __init__.py against HA's own timer.finished and
    timer.cancelled bus events. The event carries only an entity_id, which
    timer_engine.timer_for_entity turns back into the Family Hub timer that
    has to be acted on; an event for any other timer helper in the house
    (someone's own kitchen timer) resolves to nothing and is ignored.

    Removal happens BEFORE the action runs and is persisted either way -
    the same ordering, and the same reasoning, as the sweep: a timer that
    threw while firing must not be able to fire again on the next event or
    sweep tick and loop forever.

    timer.cancelled is handled too, so stopping a Family Hub countdown from
    Home Assistant's OWN UI (Developer Tools, a dashboard timer card, an
    automation) correctly clears it here rather than leaving a ghost on the
    Active Timers board. A cancel deliberately does NOT run the completion
    action - cancelling is not finishing.
    """
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
        return
    try:
        await _fire_timer(hass, entry_data, timer)
    except Exception as err:  # noqa: BLE001 - one bad timer must not break the listener
        _LOGGER.warning("Family Hub: native timer %s failed to fire: %s", timer.get("uid"), err)


def _get_entry_data(hass: HomeAssistant) -> Optional[dict[str, Any]]:
    """Local copy of __init__.py's _get_family_hub_entry_data - see this
    module's own docstring for why it isn't imported."""
    entry = _get_entry(hass)
    if entry is None:
        return None
    return hass.data.get(DOMAIN, {}).get("entries", {}).get(entry.entry_id)


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


async def _notify_targets_for_user(hass: HomeAssistant, entry_data: dict[str, Any], user_id: Optional[str]) -> list[str]:
    """This person's configured notify.* targets, straight off their
    Settings profile - the same notifyTargets list every other push in this
    file reads (see _notify_chore_approved). Snapshotted into the timer at
    start time so an end-of-timer push still lands even if the profile is
    edited mid-countdown."""
    if not user_id:
        return []
    store = entry_data.get("settings_store")
    settings = (await store.async_load() or {}) if store is not None else {}
    profile = (settings.get("userProfiles") or {}).get(user_id) or {}
    targets = profile.get("notifyTargets") or []
    return [t for t in targets if isinstance(t, str)]


async def _timer_alarm_enabled_for_user(hass: HomeAssistant, entry_data: dict[str, Any], user_id: Optional[str]) -> bool:
    """v1.119.0+: this person's own notifyTimerAlarm profile flag, read raw
    the same way _notify_targets_for_user reads notifyTargets - snapshotted
    onto the timer's own "alarm" field at start time (see timer_engine.py's
    own docstring for why every notify-relevant field on a timer is a
    snapshot, never re-read live at fire time). An unassigned/unknown user
    (no profile at all) simply never gets the alarm treatment - there's
    nobody's setting to honor."""
    if not user_id:
        return False
    store = entry_data.get("settings_store")
    settings = (await store.async_load() or {}) if store is not None else {}
    profile = (settings.get("userProfiles") or {}).get(user_id) or {}
    return bool(profile.get("notifyTimerAlarm"))


@websocket_api.websocket_command({vol.Required("type"): "family_hub/timers/list"})
@websocket_api.async_response
async def ws_list_timers(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Every running timer, household-wide. Open to any authenticated
    member on purpose: siblings each running their own screen-time timer is
    the expected case, and both cards want to show "Emma: 34m left" next to
    the person it belongs to. Nothing here is private - it is a list of
    what is currently counting down."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    connection.send_result(msg["id"], {"timers": timer_engine.list_timers(_timers_state(entry_data))})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/timers/start_chore",
        vol.Required("chore_id"): str,
        # v1.119.0+: this tab's own per-browser-tab id, echoed back onto the
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
    # The timer belongs to whoever the chore is assigned to, not whoever
    # tapped Start - so a parent starting a young child's chore timer from
    # a shared tablet produces the child's timer, counted against the
    # child's one-per-person cap and notifying the child's devices.
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
            # v1.132.55+: snapshot the chore's own alarm_audience tier onto
            # the timer at start time, same convention as "alarm" above -
            # see const.py's CHORE_KEY_ALARM_AUDIENCE and timer_engine.py's
            # own docstring for why this one field is snapshotted even
            # though WHO it resolves to at fire time is read live.
            alarm_audience=timer_engine.normalize_alarm_audience(chore.get(CHORE_KEY_ALARM_AUDIENCE)),
            client_id=msg.get("client_id"),
        )
    except timer_engine.TimerError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _adopt_native_timer(hass, entry_data, timer)
    timer_sensor.create_timer_sensor(hass, entry_data, timer, await _user_display_name(hass, owner))
    await _save_timers(hass, entry_data)
    connection.send_result(msg["id"], {"timer": timer})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/timers/start_reward",
        vol.Required("item_id"): str,
        vol.Optional("user_id"): str,
        vol.Optional("client_id"): str,
        vol.Optional("elevation_token"): str,
    }
)
@websocket_api.async_response
async def ws_start_reward_timer(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Redeem a timed reward AND start its countdown, in one step.

    Stars are deducted exactly as an ordinary redemption does (same
    reward_engine.redeem_item call ws_redeem_reward makes, same
    notification) - the timer is what happens on top, not instead. The
    order matters and is deliberate: the one-per-person timer check runs
    FIRST, so a refused second timer never charges anybody stars for a
    reward that didn't start.
    """
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
            # v1.132.55+: same snapshot as ws_start_chore_timer above, off
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
        # v1.132.59+: household ask, verbatim - "can we make the timer
        # accept seconds" - was vol.Coerce(int), which silently truncated
        # away a fractional/sub-minute value (0.5 -> 0) before it ever
        # reached timer_engine.start_timer. The quick-timer modal combines
        # its minutes + seconds inputs into one fractional-minutes number
        # client-side, so this needs to accept that, not just whole minutes.
        vol.Required("duration_minutes"): vol.Coerce(float),
        vol.Optional("label"): str,
        vol.Optional("user_id"): vol.Any(str, None),
        vol.Optional("client_id"): str,
        vol.Optional("elevation_token"): str,
        # v1.132.57+: household ask, verbatim - "why dont household timers
        # alert on the kiosks" - see const.py's CHORE_KEY_ALARM_AUDIENCE.
        vol.Optional("alarm_audience"): vol.Any(str, None),
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
    assigned_to = msg.get("user_id") or ""
    label = timer_engine.normalize_timer_label(msg.get("label"))
    try:
        timer = timer_engine.start_timer(
            _timers_state(entry_data),
            kind=TIMER_KIND_STANDALONE,
            user_id=assigned_to,
            duration_minutes=msg["duration_minutes"],
            title=label,
            # Only an assigned timer has someone specific to tell; an
            # unassigned one falls back to the household at fire time (see
            # _fire_standalone_timer).
            notify_targets=await _notify_targets_for_user(hass, entry_data, assigned_to) if assigned_to else [],
            alarm=await _timer_alarm_enabled_for_user(hass, entry_data, assigned_to) if assigned_to else False,
            # v1.132.57+: unlike notify_targets/alarm just above, this one
            # deliberately does NOT depend on whether the timer is assigned
            # - an unassigned "house" timer (the oven, whose turn it is) can
            # still widen to kiosks/everyone even though it has no owner to
            # read a personal profile flag off of. See _dispatch_timer_alarm's
            # own docstring for why this is intentionally decoupled from the
            # "alarm" field right above it.
            alarm_audience=timer_engine.normalize_alarm_audience(msg.get("alarm_audience")),
            client_id=msg.get("client_id"),
        )
    except timer_engine.TimerError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    # Who started it, so an unassigned timer still has a recoverable owner
    # for the cancel rules (see ws_cancel_timer).
    timer["started_by"] = actor_id
    await _adopt_native_timer(hass, entry_data, timer)
    timer_sensor.create_timer_sensor(
        hass, entry_data, timer, await _user_display_name(hass, assigned_to) if assigned_to else None
    )
    await _save_timers(hass, entry_data)
    connection.send_result(msg["id"], {"timer": timer})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/timers/cancel",
        vol.Required("uid"): str,
        vol.Optional("elevation_token"): str,
    }
)
@websocket_api.async_response
async def ws_cancel_timer(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Stop a countdown without it firing.

    Worth having rather than leaving out: a mis-tapped two-hour reward
    timer with no way to stop it is a real usability hole, and with a
    one-per-person cap it would also lock that person out of every other
    timed reward until it ran down. Cancelling a REWARD timer deliberately
    does NOT refund the stars - the reward was redeemed, and un-redeeming
    is what the existing reverse-redemption flow is for; conflating the two
    here would let someone start-and-cancel repeatedly to no effect but
    confusion in the ledger. Cancelling a CHORE timer costs nothing and
    simply leaves the chore open to be started again or completed by hand.
    """
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    state = _timers_state(entry_data)
    timer = timer_engine.get_timer(state, msg["uid"])
    if timer is None:
        # Already fired, or already cancelled elsewhere - not an error,
        # since either way it isn't running any more, which is what the
        # caller wanted.
        connection.send_result(msg["id"], {"cancelled": None, "timers": timer_engine.list_timers(state)})
        return
    user_id, is_admin = await _effective_actor(hass, connection, entry_data, msg)
    kind = timer.get("kind")
    if kind == TIMER_KIND_STANDALONE:
        # v1.110.1+: a standalone timer is household furniture, not
        # somebody's property. An UNASSIGNED one (the oven, a board game)
        # can be stopped by anyone - it belongs to the room, and making
        # people hunt down whoever tapped Start to silence the kitchen
        # would be absurd. An ASSIGNED one can be stopped by the person
        # it's for, by whoever started it (so a mis-assignment is
        # immediately undoable by the person who made it), or by an admin.
        # Nothing is lost by cancelling either way - no stars, no chore -
        # which is exactly why this is looser than the other two kinds.
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
    # v1.110.2+: hand the native entity back. Done AFTER removal so the
    # timer.cancelled event this triggers resolves to nothing and can't
    # double-handle what we already cleared.
    if cancelled:
        await _release_native_timer(hass, cancelled, cancel=True)
    connection.send_result(msg["id"], {"cancelled": cancelled, "timers": timer_engine.list_timers(state)})


async def _expire_due_timers(hass: HomeAssistant, entry_data: dict[str, Any]) -> bool:
    """The backend sweep: fire every timer whose time is up. Returns True
    if anything fired, so the caller can refresh dependent entities.

    Called from __init__.py on its own TIMER_SWEEP_SECONDS interval rather
    than from the main poller - see that constant's own comment for why a
    5-minute granularity isn't good enough for a countdown someone is
    watching.

    A timer is removed BEFORE its action runs, and removal is persisted
    even if the action then fails. That ordering is deliberate: a timer
    that somehow throws on completion would otherwise be retried every 30
    seconds forever, turning one bad record into an endless notification
    loop. Firing at most once and logging the failure is the safer half of
    that trade.
    """
    state = _timers_state(entry_data)
    due = timer_engine.due_timers(state)
    if not due:
        return False
    for timer in due:
        timer_engine.remove_timer(state, timer.get("uid"))
        timer_sensor.remove_timer_sensor(entry_data, timer.get("uid"))
    await _save_timers(hass, entry_data)
    for timer in due:
        try:
            # v1.110.2+: a timer backed by a native entity has almost
            # certainly already fired through HA's own timer.finished event
            # by now and been removed - reaching it here means the event was
            # missed, so release the helper back to the pool as we go.
            await _release_native_timer(hass, timer, cancel=True)
            await _fire_timer(hass, entry_data, timer)
        except Exception as err:  # noqa: BLE001 - one bad timer must not stop the rest
            _LOGGER.warning("Family Hub: timer %s failed to fire: %s", timer.get("uid"), err)
    return True


async def _fire_chore_timer(hass: HomeAssistant, entry_data: dict[str, Any], timer: dict[str, Any]) -> None:
    """A chore timer running out completes the chore exactly as tapping
    Done would - see _apply_chore_completion_effects' own docstring for why
    this reuses that path rather than deciding anything itself. Whether the
    result is Awaiting Approval or an instant star payout is entirely
    chore_engine.complete_chore's call, off the chore's own
    no_approval_required flag and the completer's PERMISSION_AUTO_APPROVE
    grant."""
    chore_id = timer.get("chore_id")
    chore = entry_data["chores"].get(chore_id) if chore_id else None
    if chore is None:
        # Deleted mid-countdown - nothing to complete, and the timer is
        # already gone. Silence is the right outcome.
        return
    if chore.get("status") != chore_engine.CHORE_STATUS_OPEN:
        # Completed by hand in the seconds before the sweep ran, or reset.
        return
    try:
        completed = chore_engine.complete_chore(
            entry_data["chores"], entry_data["rewards"], hass, chore_id, timer.get("user_id"),
            permissions=entry_data.get("permissions"),
        )
    except chore_engine.ChoreError as err:
        _LOGGER.warning("Family Hub: chore timer for %s could not complete it: %s", chore_id, err)
        return
    await _apply_chore_completion_effects(hass, entry_data, completed)
    # Tell them their time is up regardless of which way the completion
    # landed - the two messages differ because "it's been sent for
    # approval" and "you've been paid" are genuinely different news.
    targets = timer.get("notify_targets") or []
    approved = completed.get("status") == chore_engine.CHORE_STATUS_APPROVED
    body = (
        f"Time's up on \"{completed.get('title')}\" - all done!"
        if approved
        else f"Time's up on \"{completed.get('title')}\" - sent for approval."
    )
    if targets:
        # v1.119.0+: alarm-style delivery for whoever opted into it on their
        # own profile (see timer.get("alarm")'s own docstring) - everyone
        # else keeps getting the plain, quiet push exactly as before.
        send = _send_alarm_notification if timer.get("alarm") else _send_instant_notification
        await send(hass, targets, "Family Hub chore timer", body)
    # v1.132.55+/v1.132.57+: the WIDENED reach on top of the owner's own
    # phone push above - alarm devices, other people's phones, and the
    # dashboard ring. Called UNCONDITIONALLY (not gated on timer.get
    # ("alarm")) because _dispatch_timer_alarm's own audience check is
    # the real gate - see its docstring. Household ask, verbatim: "if a
    # kid starts a clean room for 30 minutes task they should get an
    # alarm at the main kiosk" - that's the CHORE's own alarm_audience
    # setting speaking, not the kid's personal notifyTimerAlarm opt-in
    # for their own phone (those are deliberately independent: a chore
    # can widen to kiosks even if its owner never turned on alarm-style
    # delivery for themselves).
    await _dispatch_timer_alarm(hass, entry_data, timer, "Family Hub chore timer", body)


async def _fire_reward_timer(hass: HomeAssistant, entry_data: dict[str, Any], timer: dict[str, Any]) -> None:
    """A reward timer running out gates nothing - it is purely "time's up,"
    so this only sends the notification. No approval step, no star change
    (the stars were spent when it started), nothing to complete."""
    targets = timer.get("notify_targets") or []
    title = timer.get("title") or "your reward"
    body = f"Time's up - {title} is finished."
    if targets:
        send = _send_alarm_notification if timer.get("alarm") else _send_instant_notification
        await send(hass, targets, "Family Hub reward timer", body)
    # v1.132.55+/v1.132.57+: see _fire_chore_timer's matching block above -
    # unconditional, gated by _dispatch_timer_alarm's own audience check.
    await _dispatch_timer_alarm(hass, entry_data, timer, "Family Hub reward timer", body)


async def _fire_standalone_timer(hass: HomeAssistant, entry_data: dict[str, Any], timer: dict[str, Any]) -> None:
    """A standalone (general-purpose) timer running out just says so - no
    chore to complete, no stars, nothing gated. See TIMER_KIND_STANDALONE
    in const.py.

    Who gets told: an ASSIGNED timer notifies that person's own devices
    (snapshotted at start, same as the other two kinds) - consistent with
    how a reward timer already tells its owner. An UNASSIGNED one has no
    person to notify, so it falls back to the household-wide notify
    targets, i.e. everyone who has any target configured at all. That
    fallback is the whole reason unassigned timers are useful: "the oven is
    done" is news for whoever is nearest the kitchen, not for one
    nominated person.
    """
    targets = list(timer.get("notify_targets") or [])
    if not targets and not timer.get("user_id"):
        targets = await _all_household_notify_targets(hass, entry_data)
    label = timer.get("title") or "Timer"
    body = f"Time's up - {label}."
    if targets:
        # Only ever true for an ASSIGNED timer (see ws_start_standalone_
        # timer) - the household-wide fallback for an unassigned one has
        # no single person's setting to honor, so it always stays the
        # plain push.
        send = _send_alarm_notification if timer.get("alarm") else _send_instant_notification
        await send(hass, targets, "Family Hub timer", body)
    # v1.132.57+: household ask, verbatim - "why dont household timers
    # alert on the kiosks" - a household/standalone timer (the oven, a
    # board game, whose turn it is - see TIMER_KIND_STANDALONE) can now
    # carry the same "Who hears this alarm" tier as a chore/reward timer
    # (see ws_start_standalone_timer), and this is what actually acts on
    # it. Unconditional/self-gated exactly like the chore/reward fire
    # helpers above - an UNASSIGNED timer has no owner and so no owner
    # alarm-push flag to gate on in the first place, which is precisely
    # why this can no longer be tied to that flag the way it briefly was.
    await _dispatch_timer_alarm(hass, entry_data, timer, "Family Hub timer", body)


async def _all_household_notify_targets(hass: HomeAssistant, entry_data: dict[str, Any]) -> list[str]:
    """Every configured notify target in the household, de-duplicated -
    only used for an UNASSIGNED standalone timer, which by definition has
    nobody of its own to tell."""
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


def _active_alarms(entry_data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """v1.132.55+: in-memory-only registry of currently-ringing timer
    alarms, keyed by timer uid - deliberately not Store-persisted,
    mirroring _kiosk_elevations above: a restart forgetting an
    in-progress alarm is the correct failure mode here, not a bug (nobody
    wants a phantom alarm ringing forever after Home Assistant restarts)."""
    return entry_data.setdefault("active_alarms", {})


async def _announce_on_alarm_device(
    hass: HomeAssistant, device: dict[str, Any], tts_entity: Optional[str], message: str
) -> None:
    """Best-effort dispatch to a single registered alarm device (see
    const.py's SETTINGS_KEY_ALARM_DEVICES) - never raises, same "a failed
    notify must never break the underlying action" convention as
    _send_instant_notification/_send_alarm_notification above.

    An assist_satellite entry speaks for itself - assist_satellite.announce
    handles its own TTS engine end to end. A media_player entry needs the
    household's configured tts.* entity to speak through it (see
    SETTINGS_KEY_ALARM_TTS_ENTITY) and is silently skipped, with a debug
    log rather than a warning (this is an expected, unconfigured state, not
    a failure), if none is set."""
    entity_id = device.get("entity_id")
    domain = device.get("domain")
    if not entity_id or not domain:
        return
    try:
        if domain == "assist_satellite":
            await hass.services.async_call(
                "assist_satellite", "announce", {"entity_id": entity_id, "message": message}, blocking=True,
            )
        elif domain == "media_player":
            if not tts_entity:
                _LOGGER.debug(
                    "Family Hub: skipping alarm announcement on %s - no alarmTtsEntityId configured", entity_id,
                )
                return
            await hass.services.async_call(
                "tts", "speak",
                {"entity_id": tts_entity, "media_player_entity_id": entity_id, "message": message},
                blocking=True,
            )
    except Exception as err:  # noqa: BLE001 - a failed alarm device must never break the underlying timer completion
        _LOGGER.warning("Family Hub: failed to announce alarm on %s: %s", entity_id, err)


async def _broadcast_alarm_ring(hass: HomeAssistant, entry_data: dict[str, Any], uid: str) -> None:
    """Fire the RING event every open Family Hub dashboard subscribes to
    via hass.connection.subscribeEvents (see const.py's
    EVENT_FAMILY_HUB_TIMER_ALARM_RING) - re-fired by
    _reannounce_active_alarms too, on the same cadence as the speaker
    re-announcement, so a dashboard opened mid-alarm still catches up on
    something that started ringing before it was even open."""
    record = _active_alarms(entry_data).get(uid)
    if record is None:
        return
    hass.bus.async_fire(
        EVENT_FAMILY_HUB_TIMER_ALARM_RING,
        {
            "uid": uid,
            "title": record.get("title"),
            "body": record.get("body"),
            "audience": record.get("audience"),
            "target_user_ids": record.get("target_user_ids") or [],
            "broadcast_all": bool(record.get("broadcast_all")),
        },
    )


async def _dispatch_timer_alarm(
    hass: HomeAssistant, entry_data: dict[str, Any], timer: dict[str, Any], title: str, body: str
) -> None:
    """The WIDENED half of a timer alarm, on top of the owner's own phone
    push _fire_chore_timer/_fire_reward_timer/_fire_standalone_timer
    already sent (if any - an unassigned standalone timer has no owner
    push at all). Household ask, verbatim: "if a kid starts a clean room
    for 30 minutes task they should get an alarm at the main kiosk, but if
    they have siblings the siblings don't need that alarm. But maybe
    parents want alarms to trigger everywhere." Follow-up, also verbatim:
    "why dont household timers alert on the kiosks" - answered by giving
    every timer kind the same alarm_audience tier, not just chores/rewards.
    See const.py's CHORE_KEY_ALARM_AUDIENCE for the full three-tier picture
    this implements.

    Called UNCONDITIONALLY by every _fire_*_timer helper, regardless of the
    timer's own "alarm" field (which only ever governs the STYLE of the
    owner's own phone push - plain vs Android alarm-stream/iOS critical -
    see timer.get("alarm")'s own docstring). This function's own audience
    check is the real, and only, gate: a "self" audience (the default) is a
    no-op here regardless of what "alarm" was, and a "kiosks"/"everyone"
    audience widens the reach regardless of whether the timer's owner
    personally opted into alarm-style delivery for their own phone -
    deliberately decoupled, both because the chore/reward's own audience
    setting is what the household is actually configuring (not the owner's
    personal notification preference), and because an unassigned standalone
    timer has no owner at all to read a personal flag off of in the first
    place.

    Deliberately resolves the actual device/kiosk/people list LIVE, off
    current settings, rather than anything snapshotted on the timer -
    unlike every other notify-relevant field on a timer (see
    timer_engine.py's own docstring) - because who currently counts as a
    registered alarm device or an always-on kiosk login can change from one
    day to the next, and a speaker registered this morning should still
    ring for a timer that was started this afternoon.
    """
    audience = timer_engine.normalize_alarm_audience(timer.get("alarm_audience"))
    if audience == TIMER_ALARM_AUDIENCE_SELF:
        return
    uid = timer.get("uid")
    if not uid:
        return

    store = entry_data.get("settings_store")
    settings = (await store.async_load() or {}) if store is not None else {}
    profiles = settings.get("userProfiles") or {}

    owner = timer.get("user_id")
    target_user_ids: list[str] = [owner] if owner else []
    for profile_user_id, profile in profiles.items():
        if not isinstance(profile, dict):
            continue
        if profile.get(SETTINGS_KEY_PROFILE_IS_ALARM_KIOSK) and profile_user_id not in target_user_ids:
            target_user_ids.append(profile_user_id)

    broadcast_all = audience == TIMER_ALARM_AUDIENCE_EVERYONE
    if broadcast_all:
        # "Everyone" widens to every OTHER person's own phone too - "maybe
        # parents want alarms to trigger everywhere." Deliberately NOT done
        # for the "kiosks" tier - the household explicitly doesn't want
        # sibling phones paged for a chore that isn't theirs.
        other_targets = await _all_household_notify_targets(hass, entry_data)
        if other_targets:
            await _send_alarm_notification(hass, other_targets, title, body)

    alarm_devices = [d for d in (settings.get(SETTINGS_KEY_ALARM_DEVICES) or []) if isinstance(d, dict)]
    tts_entity = settings.get(SETTINGS_KEY_ALARM_TTS_ENTITY) or None
    message = f"{title}. {body}".strip(". ") or body
    for device in alarm_devices:
        await _announce_on_alarm_device(hass, device, tts_entity, message)

    now_iso = dt_util.utcnow().isoformat()
    _active_alarms(entry_data)[uid] = {
        "uid": uid,
        "title": title,
        "body": body,
        "audience": audience,
        "target_user_ids": target_user_ids,
        "broadcast_all": broadcast_all,
        "alarm_devices": alarm_devices,
        "tts_entity": tts_entity,
        "started_at": now_iso,
        "last_announced_at": now_iso,
    }
    await _broadcast_alarm_ring(hass, entry_data, uid)


async def _reannounce_active_alarms(hass: HomeAssistant, entry_data: dict[str, Any]) -> None:
    """Called from __init__.py's own timer sweep, right after
    _expire_due_timers, on the same TIMER_SWEEP_SECONDS cadence - see
    const.py's ALARM_REANNOUNCE_SECONDS for why. Speakers and Assist
    satellites have no native "keep ringing until dismissed" primitive, so
    this is what actually makes a Family Hub alarm persist rather than
    announcing once and going silent: every still-active alarm gets
    re-announced on each of its registered devices (and the RING event
    gets re-fired, so a dashboard opened mid-alarm still catches up) until
    ws_dismiss_timer_alarm removes it from _active_alarms."""
    active = _active_alarms(entry_data)
    if not active:
        return
    now = dt_util.utcnow()
    for uid, record in list(active.items()):
        last = record.get("last_announced_at")
        try:
            last_dt = datetime.fromisoformat(last) if last else None
        except (TypeError, ValueError):
            last_dt = None
        if last_dt is not None and (now - last_dt).total_seconds() < ALARM_REANNOUNCE_SECONDS:
            continue
        message = f"{record.get('title') or ''}. {record.get('body') or ''}".strip(". ")
        tts_entity = record.get("tts_entity")
        for device in record.get("alarm_devices") or []:
            await _announce_on_alarm_device(hass, device, tts_entity, message)
        record["last_announced_at"] = now.isoformat()
        await _broadcast_alarm_ring(hass, entry_data, uid)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/timers/dismiss_alarm",
        vol.Required("uid"): str,
    }
)
@websocket_api.async_response
async def ws_dismiss_timer_alarm(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Stop a ringing alarm everywhere at once. Household's explicit
    choice, "first tap wins, from anyone" - so this is deliberately NOT
    permission-gated: whoever reaches a phone, a kiosk, or the dashboard
    first can silence it, exactly the way walking over and hitting Stop on
    a real alarm clock doesn't ask who you are first."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    _active_alarms(entry_data).pop(msg["uid"], None)
    hass.bus.async_fire(EVENT_FAMILY_HUB_TIMER_ALARM_STOP, {"uid": msg["uid"]})
    connection.send_result(msg["id"], {"dismissed": True})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/timers/list_active_alarms"})
@websocket_api.async_response
async def ws_list_active_alarms(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Every currently-ringing alarm, for a dashboard that just opened (or
    reconnected) to catch up on anything already in progress rather than
    waiting for the next re-announcement's RING event."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    connection.send_result(msg["id"], {"alarms": list(_active_alarms(entry_data).values())})


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


ALL_COMMANDS = (
    ws_list_chores,
    ws_create_chore,
    ws_update_chore,
    ws_delete_chore,
    ws_clear_all_chores,
    ws_assign_chore,
    ws_claim_chore,
    ws_complete_chore,
    ws_approve_chore,
    ws_reject_chore,
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
    ws_list_routines,
    ws_list_routine_library,
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
    # v1.110.0+: chore/reward timers.
    ws_list_timers,
    ws_start_chore_timer,
    ws_start_reward_timer,
    ws_start_standalone_timer,
    ws_cancel_timer,
    # v1.132.55+: household-wide timer alarms (speakers, Assist satellites,
    # dashboard ring) - see _dispatch_timer_alarm's own docstring.
    ws_dismiss_timer_alarm,
    ws_list_active_alarms,
    ws_list_alarm_device_candidates,
)


def async_register_all(hass: HomeAssistant) -> None:
    """Called once from __init__.py's async_setup, same pattern as every
    other family_hub/* command registration."""
    for command in ALL_COMMANDS:
        websocket_api.async_register_command(hass, command)
