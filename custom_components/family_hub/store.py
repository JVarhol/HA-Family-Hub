"""Storage Managers for the Chores/Rewards/Permissions feature area.

Three separate Store-backed JSON files (family_hub_chores.json,
family_hub_rewards.json, family_hub_permissions.json under Home Assistant's
own .storage/ - the actual on-disk filename homeassistant.helpers.storage.Store
uses is "<key>_<entry.entry_id>", matching every other Store this project
already creates directly in async_setup_entry), kept apart from the general
Settings blob (see SETTINGS_STORAGE_KEY_PREFIX in const.py) because this data
has real shape chore_engine.py/reward_engine.py validate and mutate, changes
far more often (every completion, every star spent), and is meaningfully
sized on its own (a family with a year of chore history) - none of which is
true of the mostly-opaque Settings blob the frontend just round-trips.

Each store's on-disk root is a plain dict, same convention as every other
Store in this project (notified, reminder_overrides, digest_state, etc.):

    chores:      {<chore_id>: <chore record - see chore_engine.py>, ...}
    rewards:     {"balances": {<user_id>: <int>, ...},
                  "catalog": [<catalog item>, ...],
                  "redemptions": [<redemption record>, ...]}
    permissions: {<user_id>: {"can_assign": bool, "can_verify": bool,
                               "can_override_rewards": bool}, ...}

All functions here are thin - create the Store, load it with sane defaults
if it's ever empty/missing a key, or save it back. No business logic lives
here (that's chore_engine.py/reward_engine.py); this module only knows how
to get the right shape of dict in and out of disk.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.storage import Store

from .const import (
    CHORES_BACKUP_FILENAME,
    CHORES_STORAGE_KEY_PREFIX,
    CHORES_STORAGE_VERSION,
    GOALS_BACKUP_FILENAME,
    GOALS_STORAGE_KEY_PREFIX,
    GOALS_STORAGE_VERSION,
    PANTRY_EXTRAS_BACKUP_FILENAME,
    PANTRY_EXTRAS_STORAGE_KEY_PREFIX,
    PANTRY_EXTRAS_STORAGE_VERSION,
    PERMISSIONS_BACKUP_FILENAME,
    PERMISSIONS_STORAGE_KEY_PREFIX,
    PERMISSIONS_STORAGE_VERSION,
    REWARDS_BACKUP_FILENAME,
    REWARDS_STORAGE_KEY_PREFIX,
    REWARDS_STORAGE_VERSION,
    ROUTINES_BACKUP_FILENAME,
    ROUTINES_STORAGE_KEY_PREFIX,
    ROUTINES_STORAGE_VERSION,
    SETTINGS_BACKUP_DIR_NAME,
)

_LOGGER = logging.getLogger(__name__)


def create_chores_store(hass: HomeAssistant, entry: ConfigEntry) -> Store:
    return Store(hass, CHORES_STORAGE_VERSION, f"{CHORES_STORAGE_KEY_PREFIX}_{entry.entry_id}")


def create_rewards_store(hass: HomeAssistant, entry: ConfigEntry) -> Store:
    return Store(hass, REWARDS_STORAGE_VERSION, f"{REWARDS_STORAGE_KEY_PREFIX}_{entry.entry_id}")


def create_permissions_store(hass: HomeAssistant, entry: ConfigEntry) -> Store:
    return Store(hass, PERMISSIONS_STORAGE_VERSION, f"{PERMISSIONS_STORAGE_KEY_PREFIX}_{entry.entry_id}")


def create_routines_store(hass: HomeAssistant, entry: ConfigEntry) -> Store:
    return Store(hass, ROUTINES_STORAGE_VERSION, f"{ROUTINES_STORAGE_KEY_PREFIX}_{entry.entry_id}")


def create_goals_store(hass: HomeAssistant, entry: ConfigEntry) -> Store:
    return Store(hass, GOALS_STORAGE_VERSION, f"{GOALS_STORAGE_KEY_PREFIX}_{entry.entry_id}")


def create_pantry_extras_store(hass: HomeAssistant, entry: ConfigEntry) -> Store:
    return Store(hass, PANTRY_EXTRAS_STORAGE_VERSION, f"{PANTRY_EXTRAS_STORAGE_KEY_PREFIX}_{entry.entry_id}")


async def async_load_chores(store: Store) -> dict[str, dict[str, Any]]:
    """chore_id -> chore record. An empty/missing store is a household that
    has never created a chore yet - not an error."""
    data = await store.async_load()
    return data if isinstance(data, dict) else {}


async def async_load_goals(store: Store) -> dict[str, dict[str, Any]]:
    """goal_id -> goal record - same flat {id: record} shape as
    async_load_chores above (see goal_engine.py's own module docstring for
    why Goals is a separate store/engine despite the shape match). An
    empty/missing store is a household that has never created a goal yet -
    not an error."""
    data = await store.async_load()
    return data if isinstance(data, dict) else {}


async def async_load_pantry_extras(store: Store) -> dict[str, dict[str, Any]]:
    """extra_id -> extra record (see pantry_engine.py's own module
    docstring) - same flat {id: record} shape as async_load_goals above. An
    empty/missing store is a household that has never added an "Also
    Tracking" extra yet - not an error."""
    data = await store.async_load()
    return data if isinstance(data, dict) else {}


def default_rewards() -> dict[str, Any]:
    # v127+: "suggestions" - pending reward suggestions from someone without
    # add/override authority, awaiting a priced approve_suggestion (or a
    # reject_suggestion) from someone who has one - see reward_engine.py's
    # own module docstring and const.py's PERMISSION_REWARD_ADD.
    #
    # v128+: three more -
    #   "ledger": every star balance change ever made (chore approvals/
    #   overdue penalties/redemptions/reversals/manual adjustments), for a
    #   complete per-user star history - see reward_engine.add_stars.
    #   "banks": {user_id: {item_id: amount}} - running per-(user, item)
    #   balances for "banked" redeem_mode rewards (an accumulating
    #   allowance/TV-time-style pool), see reward_engine._adjust_bank.
    #   "bank_usages": the spend-side history for banks above (reward_engine.
    #   use_bank) - parallel to "redemptions" but for spending FROM a bank
    #   rather than earning INTO one.
    return {
        "balances": {}, "catalog": [], "redemptions": [], "suggestions": [],
        "ledger": [], "banks": {}, "bank_usages": [],
    }


async def async_load_rewards(store: Store) -> dict[str, Any]:
    """Loads the rewards blob, filling in any of the seven top-level keys
    that are missing (e.g. an older/partial save, or the very first load)
    with their empty default rather than letting callers each defend
    against a half-shaped dict individually."""
    data = await store.async_load()
    if not isinstance(data, dict):
        data = {}
    defaults = default_rewards()
    merged = dict(data)
    for key, default_value in defaults.items():
        if key not in merged or not isinstance(merged[key], type(default_value)):
            merged[key] = default_value
    return merged


async def async_load_permissions(store: Store) -> dict[str, dict[str, bool]]:
    """user_id -> {"can_assign": bool, "can_verify": bool,
    "can_override_rewards": bool}. Only ever grants permissions to
    non-admin users on top of the hass.user.is_admin baseline - see
    chores_websocket_api.py's _require_chore_permission, the only code that reads
    this for an authorization decision."""
    data = await store.async_load()
    return data if isinstance(data, dict) else {}


def default_routines() -> dict[str, Any]:
    """last_reset_date is a plain "YYYY-MM-DD" LOCAL date string (not a
    timestamp) - see routine_engine.maybe_reset_daily, the poll-tick check
    that flips every item's "done" back to False and bumps this the moment
    the local calendar date actually changes, so each of a person's three
    routines is a fresh checklist again the next morning. Starts as None
    (never reset) rather than today's date, so a brand-new install's very
    first poll tick still runs the reset path once (harmless no-op, since
    there are no items yet) rather than silently skipping day 1."""
    return {"last_reset_date": None, "items": {}}


async def async_load_routines(store: Store) -> dict[str, Any]:
    """Loads the routines blob, filling in either top-level key that's
    missing (an older/partial save, or the very first load) with its empty
    default - same defensive merge as async_load_rewards above."""
    data = await store.async_load()
    if not isinstance(data, dict):
        data = {}
    defaults = default_routines()
    merged = dict(data)
    for key, default_value in defaults.items():
        if key not in merged:
            merged[key] = default_value
    if not isinstance(merged.get("items"), dict):
        merged["items"] = {}
    return merged


# ---------------------------------------------------------------------------
# Durable backups (survive the Family Hub config entry being removed and
# re-added, not just a normal update/restart)
# ---------------------------------------------------------------------------
# Same mechanism __init__.py's _backup_settings/_maybe_restore_settings_backup
# already established for the general Settings blob (see PROJECT_CONTEXT.md's
# v109/1.76.0 note, and CHORES_BACKUP_FILENAME's comment in const.py):
# chores/rewards/permissions are Store-backed and keyed by entry.entry_id
# (see create_chores_store/create_rewards_store/create_permissions_store
# above), so removing and re-adding the integration hands the next setup a
# brand-new entry_id and therefore brand-new, empty Stores - orphaning
# whatever's on disk under the old entry_id even though it's still there.
#
# This lives HERE, not in __init__.py alongside the settings backup
# functions, because chores_websocket_api.py - which is where every real
# chores/rewards/permissions save actually happens (its _save_chores/
# _save_rewards/_save_permissions helpers) - must stay import-independent
# of __init__.py (see that module's own docstring); store.py is the shared,
# self-contained sibling both __init__.py and chores_websocket_api.py
# already import from, so it's the only place this can live without either
# duplicating the logic or breaking that convention.
def _backup_file_path(hass: HomeAssistant, filename: str) -> str:
    """Same family_hub_backups/ folder __init__.py's settings backup uses -
    outside both .storage/ and custom_components/family_hub/, so it
    survives a plain file update AND the config entry being removed and
    re-added."""
    return hass.config.path(SETTINGS_BACKUP_DIR_NAME, filename)


def _write_backup_file(path: str, data: dict[str, Any]) -> None:
    """Blocking file write - always call via hass.async_add_executor_job.

    Written to a temp file in the same directory and swapped into place
    with os.replace (atomic on both POSIX and Windows), so a crash or
    power loss mid-write can never leave a half-written, unparseable
    backup file behind. Mirrors __init__.py's _write_settings_backup_file
    exactly - kept as a separate copy rather than a shared import specifically
    so this module has zero dependency on __init__.py (see this section's
    intro comment)."""
    directory = os.path.dirname(path)
    os.makedirs(directory, exist_ok=True)
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f)
    os.replace(tmp_path, path)


def _read_backup_file(path: str) -> dict[str, Any] | None:
    """Blocking file read - always call via hass.async_add_executor_job.

    Never raises: a missing file, or one that somehow isn't valid JSON,
    just means "nothing usable to restore" rather than crashing setup."""
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


async def _backup_data(hass: HomeAssistant, filename: str, data: dict[str, Any], *, label: str) -> None:
    """Best-effort durable copy of one store's current data. Deliberately
    never backs up an empty/falsy dict - a brand-new install's very first
    (still-empty) load, or a household that's currently at zero chores/
    grants, should never stomp on a previous real backup before there's
    anything worth losing. A backup failure (disk full, permissions, etc.)
    is logged and swallowed - it must never block the real save that
    triggered it."""
    if not data:
        return
    try:
        await hass.async_add_executor_job(_write_backup_file, _backup_file_path(hass, filename), data)
    except Exception as err:  # noqa: BLE001 - a backup failure is not fatal
        _LOGGER.warning("Family Hub: could not write %s backup file: %s", label, err)


async def _maybe_restore_backup(hass: HomeAssistant, store: Store, filename: str, *, label: str) -> None:
    """If `store` loads completely empty - the signature of a brand-new
    entry_id that's never been written to, most commonly because the
    Family Hub integration entry was removed and re-added - and a durable
    backup file exists on disk, restore it into the store before anything
    else reads from or writes to it (see async_setup_entry in __init__.py
    for the exact call ordering, matching how _maybe_restore_settings_backup
    is sequenced there).

    Deliberately only triggers on a completely empty store, never a
    partially-populated one - if the raw store has ANY content (even an
    intentionally-emptied dict some callers can't tell apart from "never
    used" - see _backup_data's docstring on the flip side of this same
    tradeoff), it's left exactly as-is. A brand-new install with nothing
    configured yet and no prior backup file on disk correctly does
    nothing here."""
    existing = await store.async_load()
    if existing:
        return
    try:
        backup = await hass.async_add_executor_job(_read_backup_file, _backup_file_path(hass, filename))
    except Exception as err:  # noqa: BLE001 - never block setup over this
        _LOGGER.warning("Family Hub: could not read %s backup file: %s", label, err)
        return
    if not backup:
        return
    await store.async_save(backup)
    _LOGGER.info(
        "Family Hub: this install's %s store was empty, so it was restored "
        "from the backup at %s (most likely because the Family Hub "
        "integration entry was removed and re-added at some point).",
        label,
        _backup_file_path(hass, filename),
    )


async def backup_chores(hass: HomeAssistant, chores: dict[str, Any]) -> None:
    await _backup_data(hass, CHORES_BACKUP_FILENAME, chores, label="chores")


async def maybe_restore_chores_backup(hass: HomeAssistant, store: Store) -> None:
    await _maybe_restore_backup(hass, store, CHORES_BACKUP_FILENAME, label="chores")


async def backup_rewards(hass: HomeAssistant, rewards: dict[str, Any]) -> None:
    await _backup_data(hass, REWARDS_BACKUP_FILENAME, rewards, label="rewards")


async def maybe_restore_rewards_backup(hass: HomeAssistant, store: Store) -> None:
    await _maybe_restore_backup(hass, store, REWARDS_BACKUP_FILENAME, label="rewards")


async def backup_permissions(hass: HomeAssistant, permissions: dict[str, dict[str, bool]]) -> None:
    await _backup_data(hass, PERMISSIONS_BACKUP_FILENAME, permissions, label="permissions")


async def maybe_restore_permissions_backup(hass: HomeAssistant, store: Store) -> None:
    await _maybe_restore_backup(hass, store, PERMISSIONS_BACKUP_FILENAME, label="permissions")


async def backup_routines(hass: HomeAssistant, routines: dict[str, Any]) -> None:
    await _backup_data(hass, ROUTINES_BACKUP_FILENAME, routines, label="routines")


async def maybe_restore_routines_backup(hass: HomeAssistant, store: Store) -> None:
    await _maybe_restore_backup(hass, store, ROUTINES_BACKUP_FILENAME, label="routines")


async def backup_goals(hass: HomeAssistant, goals: dict[str, Any]) -> None:
    await _backup_data(hass, GOALS_BACKUP_FILENAME, goals, label="goals")


async def maybe_restore_goals_backup(hass: HomeAssistant, store: Store) -> None:
    await _maybe_restore_backup(hass, store, GOALS_BACKUP_FILENAME, label="goals")


async def backup_pantry_extras(hass: HomeAssistant, pantry_extras: dict[str, Any]) -> None:
    await _backup_data(hass, PANTRY_EXTRAS_BACKUP_FILENAME, pantry_extras, label="pantry_extras")


async def maybe_restore_pantry_extras_backup(hass: HomeAssistant, store: Store) -> None:
    await _maybe_restore_backup(hass, store, PANTRY_EXTRAS_BACKUP_FILENAME, label="pantry_extras")
