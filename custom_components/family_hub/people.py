"""Family Hub-only people (2026.11.2): people in the household without a Home Assistant login.

They live in Settings as `localPeople` ([{id, name}], ids start with "fhp_") and are used everywhere a Home Assistant
user id is used: chores, stars, rewards, goals, routines, Companion, wish lists, PIN login. Only Family Hub's own
commands add, rename or remove them (a Settings save from a card always keeps the stored list).

Anything that needs Home Assistant's own account comes from the admin account instead:
  - notifications meant for them go to an admin's notify devices, with their name on the message
  - they're never Home Assistant admins; what they can do comes from Family Hub's own permissions, through their PIN

`async_get_users` / `async_get_user` are drop-in stand-ins for hass.auth's, with these people added, for the places
that list or name the household.
"""
from __future__ import annotations

import secrets
from typing import Any, Optional

from .const import DOMAIN

LOCAL_PREFIX = "fhp_"
SETTINGS_KEY = "localPeople"
# the Home Assistant account whose phones get the notifications of people without a login
NOTIFY_FROM_KEY = "localPeopleNotifyFrom"
MAX_LOCAL_PEOPLE = 30


class LocalUser:
    """Looks enough like a Home Assistant user for the places that list or name people."""

    def __init__(self, user_id: str, name: str) -> None:
        self.id = user_id
        self.name = name
        self.is_admin = False
        self.is_owner = False
        self.is_active = True
        self.system_generated = False
        self.local = True
        self.groups: list[Any] = []
        self.credentials: list[Any] = []

    def __repr__(self) -> str:  # pragma: no cover - debugging only
        return f"LocalUser({self.id!r}, {self.name!r})"


def is_local(user_id: Any) -> bool:
    return isinstance(user_id, str) and user_id.startswith(LOCAL_PREFIX)


def new_id() -> str:
    return LOCAL_PREFIX + secrets.token_hex(6)


def clean_name(name: Any) -> str:
    return " ".join(str(name or "").split())[:40]


def normalize(raw: Any) -> list[dict[str, str]]:
    """The stored list, checked: real ids, a name each, no repeats."""
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for p in raw if isinstance(raw, list) else []:
        if not isinstance(p, dict):
            continue
        pid = p.get("id")
        name = clean_name(p.get("name"))
        if not is_local(pid) or not name or pid in seen:
            continue
        seen.add(pid)
        out.append({"id": pid, "name": name})
    return out[:MAX_LOCAL_PEOPLE]


def _entry_data(hass: Any) -> Optional[dict[str, Any]]:
    try:
        entries = hass.data.get(DOMAIN, {}).get("entries", {})
    except Exception:  # noqa: BLE001 - a hass without Family Hub set up has nobody extra
        return None
    return next(iter(entries.values()), None) if entries else None


async def local_people(hass: Any, entry_data: Optional[dict[str, Any]] = None) -> list[dict[str, str]]:
    """Every Family Hub-only person, from Settings."""
    data = entry_data if entry_data is not None else _entry_data(hass)
    store = data.get("settings_store") if isinstance(data, dict) else None
    if store is None:
        return []
    try:
        settings = await store.async_load() or {}
    except Exception:  # noqa: BLE001 - never block a lookup over Settings
        return []
    return normalize(settings.get(SETTINGS_KEY))


async def async_get_users(hass: Any, entry_data: Optional[dict[str, Any]] = None) -> list[Any]:
    """hass.auth.async_get_users(), plus the Family Hub-only people."""
    try:
        users = list(await hass.auth.async_get_users())
    except Exception:  # noqa: BLE001 - the household still has its Family Hub-only people
        users = []
    return users + [LocalUser(p["id"], p["name"]) for p in await local_people(hass, entry_data)]


async def async_get_user(hass: Any, user_id: Optional[str], entry_data: Optional[dict[str, Any]] = None) -> Any:
    """hass.auth.async_get_user(), or the Family Hub-only person with that id (None if there's nobody)."""
    if not user_id:
        return None
    if is_local(user_id):
        for p in await local_people(hass, entry_data):
            if p["id"] == user_id:
                return LocalUser(p["id"], p["name"])
        return None
    return await hass.auth.async_get_user(user_id)


# -------------------------------------------------------------------------- moving someone to a Home Assistant login


def _swap_in_place(obj: Any, old: str, new: str) -> bool:
    """Replace `old` with `new` in every dict key and string inside obj, in place (so anything else holding a reference
    to part of it sees the change). A Family Hub-only id is random ("fhp_" + 12 hex), so it never appears by accident;
    composite keys like "fhp_x:chore1" are covered too. True if anything changed."""
    changed = False
    if isinstance(obj, dict):
        for key in list(obj.keys()):
            value = obj[key]
            if isinstance(value, str):
                if old in value:
                    obj[key] = value.replace(old, new)
                    changed = True
            elif isinstance(value, (dict, list)):
                changed = _swap_in_place(value, old, new) or changed
            if isinstance(key, str) and old in key:
                new_key = key.replace(old, new)
                obj[new_key] = obj.pop(key)
                changed = True
    elif isinstance(obj, list):
        for i, value in enumerate(obj):
            if isinstance(value, str):
                if old in value:
                    obj[i] = value.replace(old, new)
                    changed = True
            elif isinstance(value, (dict, list)):
                changed = _swap_in_place(value, old, new) or changed
    return changed


def _is_store(value: Any) -> bool:
    return callable(getattr(value, "async_load", None)) and callable(getattr(value, "async_save", None))


async def async_move_to_user(hass, entry_data: dict[str, Any], old: str, new: str, extra_stores: list | None = None) -> int:
    """Everything Family Hub keeps about a Family Hub-only person (chores, stars, rewards, routines, goals, timers,
    permissions, PIN, Companion, profile...) now belongs to the Home Assistant user `new`: every saved store and every
    loaded copy of one. Returns how many stores changed. Settings' own localPeople entry is the caller's to drop."""
    stores = [v for v in entry_data.values() if _is_store(v)] + list(extra_stores or [])
    changed = 0
    seen: set[int] = set()
    for store in stores:
        if id(store) in seen:
            continue
        seen.add(id(store))
        try:
            data = await store.async_load()
        except Exception:  # noqa: BLE001 - one unreadable store never blocks the rest
            continue
        if isinstance(data, (dict, list)) and _swap_in_place(data, old, new):
            await store.async_save(data)
            changed += 1
    # what's already loaded (entry_data["chores"], ["rewards"], ["timers"], the Companion's messages, PIN lockouts...)
    for key, value in list(entry_data.items()):
        if isinstance(value, (dict, list)):
            _swap_in_place(value, old, new)
        elif isinstance(getattr(value, "data", None), dict) and not _is_store(value):
            _swap_in_place(value.data, old, new)
    return changed
