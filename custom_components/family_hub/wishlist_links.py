"""Linked wish lists (2026.11.1): the Home Assistant side.

Reads each person's ``wishlistLinks`` (from their profile in the household
settings), fetches them with ``wishlist_import`` and puts the items on their own
wish list (``wishlistEntity``) with the ``todo`` services. Runs every
``SYNC_EVERY_HOURS``, shortly after start-up, after a save that changes
someone's links, and on demand from Settings (``family_hub/wishlist_links/sync``).
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import aiohttp
import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.storage import Store

from . import wishlist_import as wi

_LOGGER = logging.getLogger(__name__)
STORE_VERSION = 1


def store_for(hass: HomeAssistant, entry_id: str) -> Store:
    return Store(hass, STORE_VERSION, f"family_hub_wishlist_links_{entry_id}")


def _profiles(settings: dict[str, Any]) -> dict[str, dict[str, Any]]:
    raw = settings.get("userProfiles") if isinstance(settings, dict) else None
    return {str(k): v for k, v in raw.items() if isinstance(v, dict)} if isinstance(raw, dict) else {}


def links_by_user(settings: dict[str, Any]) -> dict[str, list[str]]:
    return {uid: wi.normalize_links(p.get("wishlistLinks")) for uid, p in _profiles(settings).items()}


async def _todo_items(hass: HomeAssistant, entity_id: str) -> list[dict[str, Any]]:
    response = await hass.services.async_call(
        "todo", "get_items", {"entity_id": entity_id, "status": ["needs_action", "completed"]},
        blocking=True, return_response=True,
    )
    return list(((response or {}).get(entity_id) or {}).get("items") or [])


async def async_sync(hass: HomeAssistant, entry_data: dict[str, Any], only_user: str | None = None) -> dict[str, Any]:
    """Sync everyone's linked lists (or one person's). Returns {user_id: {link: status}}."""
    lock: asyncio.Lock = entry_data.setdefault("wishlist_links_lock", asyncio.Lock())
    async with lock:
        settings_store: Store | None = entry_data.get("settings_store")
        settings = (await settings_store.async_load() or {}) if settings_store else {}
        store: Store = entry_data["wishlist_links_store"]
        saved = await store.async_load() or {}
        known_all: dict[str, Any] = saved.get("known") if isinstance(saved.get("known"), dict) else {}
        status_all: dict[str, Any] = saved.get("status") if isinstance(saved.get("status"), dict) else {}
        session = async_get_clientsession(hass)
        timeout = aiohttp.ClientTimeout(total=25)
        for uid, profile in _profiles(settings).items():
            if only_user and uid != only_user:
                continue
            links = wi.normalize_links(profile.get("wishlistLinks"))
            entity_id = str(profile.get("wishlistEntity") or "").strip()
            old_status = status_all.get(uid) if isinstance(status_all.get(uid), dict) else {}
            if not links and not (known_all.get(uid) or {}):
                status_all.pop(uid, None)
                known_all.pop(uid, None)
                continue
            if not entity_id or hass.states.get(entity_id) is None:
                status_all[uid] = {link: {"ok": False, "error": "This person has no wish list yet. Add one under Their wish list first.", "at": time.time()} for link in links}
                continue
            fetched: dict[str, dict[str, Any]] = {}
            status: dict[str, Any] = {}
            for link in links:
                try:
                    result = await wi.fetch_list(session, link, timeout)
                    fetched[link] = result
                    status[link] = {"ok": True, "title": result.get("title") or "", "source": result.get("source"), "count": len(result["items"]), "at": time.time()}
                except wi.WishlistImportError as err:
                    status[link] = {"ok": False, "error": str(err), "at": time.time(), "title": (old_status.get(link) or {}).get("title", "")}
                except Exception as err:  # noqa: BLE001 - a network failure is just "try later"
                    _LOGGER.debug("Family Hub: linked wish list %s failed: %s", link, err)
                    status[link] = {"ok": False, "error": "Couldn't reach that site. Family Hub will try again later.", "at": time.time(), "title": (old_status.get(link) or {}).get("title", "")}
            try:
                existing = await _todo_items(hass, entity_id)
            except Exception as err:  # noqa: BLE001
                _LOGGER.warning("Family Hub: couldn't read wish list %s: %s", entity_id, err)
                status_all[uid] = status
                continue
            plan = wi.plan_changes(existing, links, fetched, known_all.get(uid) or {})
            added = 0
            for link, item in plan["add"]:
                try:
                    await hass.services.async_call(
                        "todo", "add_item",
                        {"entity_id": entity_id, "item": item["title"], "description": wi.new_item_description(link, item)},
                        blocking=True,
                    )
                    added += 1
                except Exception as err:  # noqa: BLE001
                    _LOGGER.warning("Family Hub: couldn't add %s to %s: %s", item["title"], entity_id, err)
                    status[link] = dict(status.get(link) or {}, ok=False, error="Couldn't add items to their wish list. It needs to be a list that keeps descriptions, like Local To-do.")
                    plan["known"][link] = [s for s in plan["known"].get(link, []) if s != item["sourceId"]]
            for uid_item, description in plan["update"]:
                try:
                    await hass.services.async_call("todo", "update_item", {"entity_id": entity_id, "item": uid_item, "description": description}, blocking=True)
                except Exception as err:  # noqa: BLE001
                    _LOGGER.debug("Family Hub: couldn't update a linked wish: %s", err)
            if plan["remove"]:
                try:
                    await hass.services.async_call("todo", "remove_item", {"entity_id": entity_id, "item": plan["remove"]}, blocking=True)
                except Exception as err:  # noqa: BLE001
                    _LOGGER.debug("Family Hub: couldn't remove old linked wishes: %s", err)
            for link in status:
                if status[link].get("ok"):
                    status[link]["added"] = sum(1 for lk, _ in plan["add"] if lk == link)
            known_all[uid] = plan["known"]
            status_all[uid] = status
        await store.async_save({"known": known_all, "status": status_all})
        return status_all if not only_user else {only_user: status_all.get(only_user, {})}


def schedule_sync(hass: HomeAssistant, entry_data: dict[str, Any], only_user: str | None = None) -> None:
    async def _run() -> None:
        try:
            await async_sync(hass, entry_data, only_user)
        except Exception as err:  # noqa: BLE001 - a background sync must never raise into the event loop
            _LOGGER.warning("Family Hub: linked wish list sync failed: %s", err)

    hass.async_create_background_task(_run(), "family_hub_wishlist_links_sync")


def changed_users(old_settings: dict[str, Any], new_settings: dict[str, Any]) -> list[str]:
    old, new = links_by_user(old_settings or {}), links_by_user(new_settings or {})
    old_entities = {u: str(p.get("wishlistEntity") or "") for u, p in _profiles(old_settings or {}).items()}
    new_entities = {u: str(p.get("wishlistEntity") or "") for u, p in _profiles(new_settings or {}).items()}
    users = set(old) | set(new)
    return sorted(u for u in users if old.get(u, []) != new.get(u, []) or (new.get(u) and old_entities.get(u) != new_entities.get(u)))


def _entry_data(hass: HomeAssistant) -> dict[str, Any] | None:
    entries = (hass.data.get("family_hub") or {}).get("entries") or {}
    return next(iter(entries.values()), None) if entries else None


@websocket_api.websocket_command({vol.Required("type"): "family_hub/wishlist_links/status"})
@websocket_api.async_response
async def ws_status(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    entry_data = _entry_data(hass)
    if entry_data is None:
        connection.send_error(msg["id"], "not_found", "Family Hub is not set up")
        return
    saved = await entry_data["wishlist_links_store"].async_load() or {}
    connection.send_result(msg["id"], {"status": saved.get("status") or {}})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/wishlist_links/sync", vol.Optional("user_id"): str})
@websocket_api.async_response
async def ws_sync(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    entry_data = _entry_data(hass)
    if entry_data is None:
        connection.send_error(msg["id"], "not_found", "Family Hub is not set up")
        return
    status = await async_sync(hass, entry_data, msg.get("user_id") or None)
    connection.send_result(msg["id"], {"status": status})


def register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_status)
    websocket_api.async_register_command(hass, ws_sync)
