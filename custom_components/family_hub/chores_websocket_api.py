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

import logging
from typing import Any, Optional

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from . import chore_engine, goal_engine, reward_engine, routine_engine, store as chores_store
from .const import (
    CHORE_PERMISSIONS,
    CONF_NOTIFICATION_CLICK_PATH,
    DOMAIN,
    PERMISSION_ASSIGN,
    PERMISSION_COMPLETE_ANY,
    PERMISSION_REWARD_ADD,
    PERMISSION_REWARD_OVERRIDE,
    PERMISSION_VERIFY,
    ROUTINE_CATEGORIES,
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
    }
)
@websocket_api.async_response
async def ws_update_chore(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _has_permission(entry_data, connection, PERMISSION_ASSIGN):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted chore-assignment permission) can edit chores.")
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
    await _save_chores(hass, entry_data)
    connection.send_result(msg["id"], {"success": True})


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


@websocket_api.websocket_command({vol.Required("type"): "family_hub/chores/complete", vol.Required("chore_id"): str})
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
    user_id = _actor_id(connection)
    is_assignee = chore is not None and chore.get("assigned_to") == user_id
    can_complete_for_others = _has_permission(entry_data, connection, PERMISSION_VERIFY) or _has_permission(
        entry_data, connection, PERMISSION_COMPLETE_ANY
    )
    if not is_assignee and not can_complete_for_others:
        connection.send_error(msg["id"], "forbidden", "Only the person this chore is assigned to (or an admin/verifier/can_complete_any grant) can mark it complete.")
        return
    try:
        chore = chore_engine.complete_chore(entry_data["chores"], hass, msg["chore_id"], user_id)
    except chore_engine.ChoreError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_chores(hass, entry_data)
    connection.send_result(msg["id"], {"chore": chore})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/chores/approve", vol.Required("chore_id"): str})
@websocket_api.async_response
async def ws_approve_chore(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _has_permission(entry_data, connection, PERMISSION_VERIFY):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted chore-verification permission) can approve chores.")
        return
    try:
        chore = chore_engine.approve_chore(entry_data["chores"], entry_data["rewards"], hass, msg["chore_id"], _actor_id(connection))
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
    {vol.Required("type"): "family_hub/chores/reject", vol.Required("chore_id"): str, vol.Optional("reason"): str}
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
    if not _has_permission(entry_data, connection, PERMISSION_VERIFY):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted chore-verification permission) can reject chores.")
        return
    try:
        chore = chore_engine.reject_chore(entry_data["chores"], hass, msg["chore_id"], _actor_id(connection), msg.get("reason"))
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
    that client-side choice, same as every other permission gate here."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _can_add_rewards(entry_data, connection):
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
    {vol.Required("type"): "family_hub/rewards/redeem", vol.Required("item_id"): str, vol.Optional("user_id"): str}
)
@websocket_api.async_response
async def ws_redeem_reward(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Instant self-serve claim - redeems for the caller's own id by
    default. Redeeming on someone ELSE's behalf (an admin claiming
    something for a login-less child) requires reward-override
    permission - see the "Reward redemption" project decision: claims are
    instant, but claiming for someone else is still an administrative act."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    actor_id = _actor_id(connection)
    target_user_id = msg.get("user_id") or actor_id
    if not target_user_id:
        connection.send_error(msg["id"], "no_user", "Not logged in.")
        return
    if target_user_id != actor_id and not _has_permission(entry_data, connection, PERMISSION_REWARD_OVERRIDE):
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
    }
)
@websocket_api.async_response
async def ws_approve_suggestion(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _can_add_rewards(entry_data, connection):
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


@websocket_api.websocket_command({vol.Required("type"): "family_hub/rewards/reject_suggestion", vol.Required("suggestion_id"): str})
@websocket_api.async_response
async def ws_reject_suggestion(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _can_add_rewards(entry_data, connection):
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
    own docstring for the full reasoning."""
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    try:
        item = routine_engine.toggle_item(entry_data["routines"], msg["item_id"], msg["done"])
    except routine_engine.RoutineError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    await _save_routines(hass, entry_data)
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


@websocket_api.websocket_command({vol.Required("type"): "family_hub/goals/approve", vol.Required("goal_id"): str})
@websocket_api.async_response
async def ws_approve_goal(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _has_permission(entry_data, connection, PERMISSION_VERIFY):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted chore-verification permission) can approve goals.")
        return
    try:
        goal = goal_engine.approve_goal(entry_data["goals"], entry_data["rewards"], hass, msg["goal_id"], _actor_id(connection))
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
    {vol.Required("type"): "family_hub/goals/reject", vol.Required("goal_id"): str, vol.Optional("reason"): str}
)
@websocket_api.async_response
async def ws_reject_goal(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_data = _entry_data_or_error(hass, connection, msg["id"])
    if entry_data is None:
        return
    if not _has_permission(entry_data, connection, PERMISSION_VERIFY):
        connection.send_error(msg["id"], "forbidden", "Only an admin (or someone granted chore-verification permission) can reject goals.")
        return
    try:
        goal = goal_engine.reject_goal(entry_data["goals"], hass, msg["goal_id"], _actor_id(connection), msg.get("reason"))
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


ALL_COMMANDS = (
    ws_list_chores,
    ws_create_chore,
    ws_update_chore,
    ws_delete_chore,
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
    ws_add_suggestion,
    ws_approve_suggestion,
    ws_reject_suggestion,
    ws_get_permissions,
    ws_get_my_permissions,
    ws_set_permissions,
    ws_list_routines,
    ws_create_routine_item,
    ws_update_routine_item,
    ws_toggle_routine_item,
    ws_delete_routine_item,
    ws_list_goals,
    ws_create_goal,
    ws_update_goal,
    ws_delete_goal,
    ws_log_goal_progress,
    ws_approve_goal,
    ws_reject_goal,
)


def async_register_all(hass: HomeAssistant) -> None:
    """Called once from __init__.py's async_setup, same pattern as every
    other family_hub/* command registration."""
    for command in ALL_COMMANDS:
        websocket_api.async_register_command(hass, command)
