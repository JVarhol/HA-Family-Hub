"""Storage Managers for the Chores/Rewards/Permissions feature area."""
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
    DEVICE_SETTINGS_STORAGE_KEY_PREFIX,
    DEVICE_SETTINGS_STORAGE_VERSION,
    GOALS_BACKUP_FILENAME,
    GOALS_STORAGE_KEY_PREFIX,
    GOALS_STORAGE_VERSION,
    PANTRY_EXTRAS_BACKUP_FILENAME,
    PANTRY_EXTRAS_STORAGE_KEY_PREFIX,
    PANTRY_EXTRAS_STORAGE_VERSION,
    PERMISSIONS_BACKUP_FILENAME,
    PERMISSIONS_STORAGE_KEY_PREFIX,
    PERMISSIONS_STORAGE_VERSION,
    PRIVACY_MODE_STORAGE_KEY_PREFIX,
    PRIVACY_MODE_STORAGE_VERSION,
    REWARDS_BACKUP_FILENAME,
    REWARDS_STORAGE_KEY_PREFIX,
    REWARDS_STORAGE_VERSION,
    ROUTINES_BACKUP_FILENAME,
    ROUTINES_STORAGE_KEY_PREFIX,
    ROUTINES_STORAGE_VERSION,
    SETTINGS_BACKUP_DIR_NAME,
    SETTINGS_HISTORY_STORAGE_KEY_PREFIX,
    SETTINGS_HISTORY_STORAGE_VERSION,
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


def create_device_settings_store(hass: HomeAssistant, entry: ConfigEntry) -> Store:
    return Store(hass, DEVICE_SETTINGS_STORAGE_VERSION, f"{DEVICE_SETTINGS_STORAGE_KEY_PREFIX}_{entry.entry_id}")


def create_privacy_mode_store(hass: HomeAssistant, entry: ConfigEntry) -> Store:
    return Store(hass, PRIVACY_MODE_STORAGE_VERSION, f"{PRIVACY_MODE_STORAGE_KEY_PREFIX}_{entry.entry_id}")


def create_settings_history_store(hass: HomeAssistant, entry: ConfigEntry) -> Store:
    return Store(hass, SETTINGS_HISTORY_STORAGE_VERSION, f"{SETTINGS_HISTORY_STORAGE_KEY_PREFIX}_{entry.entry_id}")


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


def default_device_settings() -> dict[str, Any]:
    """See const.py's DEVICE_SETTINGS_STORAGE_KEY_PREFIX docstring for the full picture of what this store is (a mirror/staging area"""
    return {"devices": {}, "presets": {}}


async def async_load_device_settings(store: Store) -> dict[str, Any]:
    """Loads the device-settings blob, filling in either top-level key
    that's missing (an older/partial save, or the very first load) with its
    empty default - same defensive merge as async_load_rewards/
    async_load_routines above."""
    data = await store.async_load()
    if not isinstance(data, dict):
        data = {}
    defaults = default_device_settings()
    merged = dict(data)
    for key, default_value in defaults.items():
        if key not in merged or not isinstance(merged[key], type(default_value)):
            merged[key] = default_value
    return merged


def default_rewards() -> dict[str, Any]:
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


def default_privacy_mode() -> dict[str, Any]:
    """See const.py's PRIVACY_MODE_EVENT_CHANGED docstring for why this is
    its own tiny store rather than a key in the general Settings blob."""
    return {"enabled": False}


async def async_load_privacy_mode(store: Store) -> dict[str, Any]:
    """Loads the privacy-mode blob, filling in the one key if it's ever
    missing (an older/partial save, or the very first load) - same
    defensive merge as async_load_device_settings/async_load_rewards above."""
    data = await store.async_load()
    if not isinstance(data, dict):
        data = {}
    defaults = default_privacy_mode()
    merged = dict(data)
    for key, default_value in defaults.items():
        if key not in merged or not isinstance(merged[key], type(default_value)):
            merged[key] = default_value
    return merged


def default_settings_history() -> dict[str, Any]:
    """See const.py's SETTINGS_HISTORY_STORAGE_KEY_PREFIX docstring for the full picture of what this store is for (a rotating"""
    return {"snapshots": []}


async def async_load_settings_history(store: Store) -> dict[str, Any]:
    """Loads the settings-history blob, filling in the one key if it's ever
    missing (an older/partial save, or the very first load) - same
    defensive merge as async_load_privacy_mode just above."""
    data = await store.async_load()
    if not isinstance(data, dict):
        data = {}
    defaults = default_settings_history()
    merged = dict(data)
    for key, default_value in defaults.items():
        if key not in merged or not isinstance(merged[key], type(default_value)):
            merged[key] = default_value
    if not isinstance(merged.get("snapshots"), list):
        merged["snapshots"] = []
    return merged


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


# -------------------------------------------------------------------------- Durable backups
def _backup_file_path(hass: HomeAssistant, filename: str) -> str:
    """Same family_hub_backups/ folder __init__.py's settings backup uses -
    outside both .storage/ and custom_components/family_hub/, so it
    survives a plain file update AND the config entry being removed and
    re-added."""
    return hass.config.path(SETTINGS_BACKUP_DIR_NAME, filename)


def _write_backup_file(path: str, data: dict[str, Any]) -> None:
    """Blocking file write - always call via hass.async_add_executor_job."""
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
    """Best-effort durable copy of one store's current data."""
    if not data:
        return
    try:
        await hass.async_add_executor_job(_write_backup_file, _backup_file_path(hass, filename), data)
    except Exception as err:  # noqa: BLE001 - a backup failure is not fatal
        _LOGGER.warning("Family Hub: could not write %s backup file: %s", label, err)


async def _maybe_restore_backup(hass: HomeAssistant, store: Store, filename: str, *, label: str) -> None:
    """If `store` loads completely empty - the signature of a brand-new entry_id that's never been written to"""
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
