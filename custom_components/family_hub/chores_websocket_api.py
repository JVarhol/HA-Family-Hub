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
from typing import Any, Optional

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from . import chore_engine, goal_engine, reward_engine, routine_engine, sensor as timer_sensor, store as chores_store, timer_engine
from .const import (
    CHORE_KEY_TIMER_MINUTES,
    CHORE_PERMISSIONS,
    CONF_NOTIFICATION_CLICK_PATH,
    DOMAIN,
    PERMISSION_ASSIGN,
    PERMISSION_COMPLETE_ANY,
    PERMISSION_EDIT_CHORE,
    PERMISSION_REWARD_ADD,
    PERMISSION_REWARD_OVERRIDE,
    PERMISSION_AUTO_APPROVE,
    PERMISSION_STAR_OVERRIDE,
    PERMISSION_VERIFY,
    REWARD_KEY_TIMER_MINUTES,
    ROUTINE_CATEGORIES,
    EVENT_FAMILY_HUB_TIMER_FINISHED,
    NATIVE_TIMER_EVENT_CANCELLED,
    NATIVE_TIMER_EVENT_FINISHED,
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
        vol.Optional("recur_weekdays"): [int],
        vol.Optional("no_approval_required"): bool,
        vol.Optional("quantity_total"): vol.Any(int, None),
        # v1.110.0+: optional countdown length in minutes, None to clear.
        vol.Optional("timer_minutes"): vol.Any(int, None),
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
        vol.Optional("recur_weekdays"): [int],
        vol.Optional("no_approval_required"): bool,
        vol.Optional("quantity_total"): vol.Any(int, None),
        # v1.110.0+: optional countdown length in minutes, None to clear.
        vol.Optional("timer_minutes"): vol.Any(int, None),
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
    }
)
@websocket_api.async_response
async def ws_adjust_balance(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """The explicit "reward override" the spec calls out by name - a manual
    star grant or deduction outside the normal chore-approval/redemption
    flow (e.g. a one-off bonus, or correcting a mistake)."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _has_permission(entry_data, connection, PERMISSION_REWARD_OVERRIDE):
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
    }
)
@websocket_api.async_response
async def ws_create_routine_item(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _has_permission(entry_data, connection, PERMISSION_ASSIGN):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted chore-assignment permission) can add routine items.")
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
    }
)
@websocket_api.async_response
async def ws_update_routine_item(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Edit an existing item's title/due_time/days_of_week - the "manage
    items" flow (v136+, see routine_engine.update_item). Same
    PERMISSION_ASSIGN gate as create/delete just above/below - editing an
    item is exactly as privileged an operation as adding or removing one,
    not the low-stakes self-serve checkbox toggle ws_toggle_routine_item
    is."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _has_permission(entry_data, connection, PERMISSION_ASSIGN):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted chore-assignment permission) can edit routine items.")
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
    connection.send_result(msg["id"], {"item": item})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/routines/delete", vol.Required("item_id"): str})
@websocket_api.async_response
async def ws_delete_routine_item(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _has_permission(entry_data, connection, PERMISSION_ASSIGN):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted chore-assignment permission) can remove routine items.")
        return
    try:
        routine_engine.delete_item(entry_data["routines"], msg["item_id"])
    except routine_engine.RoutineError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_routines(hass, entry_data)
    connection.send_result(msg["id"], {"success": True})


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
        minutes = int(timer.get("duration_minutes") or 0)
        await hass.services.async_call(
            "timer",
            "start",
            {"entity_id": entity_id, "duration": f"{minutes // 60:02d}:{minutes % 60:02d}:00"},
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
        vol.Required("duration_minutes"): vol.Coerce(int),
        vol.Optional("label"): str,
        vol.Optional("user_id"): vol.Any(str, None),
        vol.Optional("client_id"): str,
        vol.Optional("elevation_token"): str,
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
    if targets:
        approved = completed.get("status") == chore_engine.CHORE_STATUS_APPROVED
        body = (
            f"Time's up on \"{completed.get('title')}\" - all done!"
            if approved
            else f"Time's up on \"{completed.get('title')}\" - sent for approval."
        )
        # v1.119.0+: alarm-style delivery for whoever opted into it on their
        # own profile (see timer.get("alarm")'s own docstring) - everyone
        # else keeps getting the plain, quiet push exactly as before.
        send = _send_alarm_notification if timer.get("alarm") else _send_instant_notification
        await send(hass, targets, "Family Hub chore timer", body)


async def _fire_reward_timer(hass: HomeAssistant, entry_data: dict[str, Any], timer: dict[str, Any]) -> None:
    """A reward timer running out gates nothing - it is purely "time's up,"
    so this only sends the notification. No approval step, no star change
    (the stars were spent when it started), nothing to complete."""
    targets = timer.get("notify_targets") or []
    if not targets:
        return
    title = timer.get("title") or "your reward"
    send = _send_alarm_notification if timer.get("alarm") else _send_instant_notification
    await send(
        hass, targets, "Family Hub reward timer", f"Time's up - {title} is finished."
    )


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
    if not targets:
        return
    label = timer.get("title") or "Timer"
    # Only ever true for an ASSIGNED timer (see ws_start_standalone_timer) -
    # the household-wide fallback for an unassigned one has no single
    # person's setting to honor, so it always stays the plain push.
    send = _send_alarm_notification if timer.get("alarm") else _send_instant_notification
    await send(
        hass, targets, "Family Hub timer", f"Time's up - {label}."
    )


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
    ws_create_routine_item,
    ws_update_routine_item,
    ws_toggle_routine_item,
    ws_approve_routine_item,
    ws_delete_routine_item,
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
)


def async_register_all(hass: HomeAssistant) -> None:
    """Called once from __init__.py's async_setup, same pattern as every
    other family_hub/* command registration."""
    for command in ALL_COMMANDS:
        websocket_api.async_register_command(hass, command)
