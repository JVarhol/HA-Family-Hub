"""todo platform: Chores as native Home Assistant to-do lists.

- todo.family_hub_chores - the generic list: chores nobody has yet (the Chore Bin,
  first-come-first-served chores not claimed yet). A chore sent back to the bin lands here.
- one list per person ("<Name> Chores", e.g. todo.emma_chores) - the chores assigned to
  them. Made automatically for every household member and for anyone a chore is assigned
  to, so assigning a chore puts it on that person's list.

Everything syncs both ways: adding an item makes a chore (in the bin, or assigned to that
person), ticking one off completes the chore, renaming renames it, deleting deletes it.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from homeassistant.components.todo import TodoItem, TodoItemStatus, TodoListEntity, TodoListEntityFeature
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from . import chore_engine
from .const import (
    CHORE_ASSIGNMENT_MODE_CHORE_BIN,
    CHORE_ASSIGNMENT_MODE_DIRECT,
    CHORE_BIN_SENTINEL,
    CHORE_STATUS_APPROVED,
    CHORE_STATUS_PENDING_VERIFICATION,
    DOMAIN,
    SETTINGS_KEY_MEMBER_USER_IDS,
    TODO_CHORES_ENTITY_NAME,
    TODO_CHORES_UNIQUE_ID_PREFIX,
)

_LOGGER = logging.getLogger(__name__)

_FEATURES = (
    TodoListEntityFeature.CREATE_TODO_ITEM
    | TodoListEntityFeature.UPDATE_TODO_ITEM
    | TodoListEntityFeature.DELETE_TODO_ITEM
)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    entry_data = hass.data.get(DOMAIN, {}).get("entries", {}).get(entry.entry_id)
    if entry_data is None:
        _LOGGER.warning("Family Hub: todo platform set up before the integration's own entry data existed - skipping")
        return
    entity = FamilyHubChoresTodoListEntity(entry, entry_data)
    entry_data["chores_todo_entity"] = entity
    entry_data["chores_todo_person_entities"] = {}
    entry_data["chores_todo_add_entities"] = async_add_entities
    entry_data["chores_todo_entry"] = entry
    async_add_entities([entity])
    await async_sync_person_chore_lists(hass, entry_data)


def _is_unassigned(chore: dict[str, Any]) -> bool:
    return chore.get("assigned_to") in (None, "", CHORE_BIN_SENTINEL)


def _person_ids_needing_lists(entry_data: dict[str, Any], settings: Optional[dict[str, Any]]) -> list[str]:
    """Household members, plus anyone a chore is assigned to."""
    ids: list[str] = []
    raw = (settings or {}).get(SETTINGS_KEY_MEMBER_USER_IDS) if isinstance(settings, dict) else None
    for uid in raw if isinstance(raw, list) else []:
        if isinstance(uid, str) and uid.strip() and uid not in ids:
            ids.append(uid)
    for chore in (entry_data.get("chores") or {}).values():
        uid = chore.get("assigned_to")
        if isinstance(uid, str) and not _is_unassigned(chore) and uid not in ids:
            ids.append(uid)
    return ids


async def _display_names(hass: HomeAssistant) -> dict[str, str]:
    try:
        users = await hass.auth.async_get_users()
    except Exception:  # noqa: BLE001 - a missing name never blocks the lists
        return {}
    return {u.id: (u.name or u.id) for u in users if not getattr(u, "system_generated", False)}


async def async_sync_person_chore_lists(hass: HomeAssistant, entry_data: dict[str, Any]) -> None:
    """Adds a list for anyone who needs one and doesn't have it yet, then refreshes every
    chores list. Safe to call after any chore change."""
    entry = entry_data.get("chores_todo_entry")
    add_entities = entry_data.get("chores_todo_add_entities")
    existing: dict[str, FamilyHubPersonChoresTodoListEntity] = entry_data.setdefault("chores_todo_person_entities", {})
    if entry is not None and add_entities is not None:
        settings = None
        store = entry_data.get("settings_store")
        if store is not None:
            try:
                settings = await store.async_load()
            except Exception:  # noqa: BLE001
                settings = None
        wanted = [uid for uid in _person_ids_needing_lists(entry_data, settings) if uid not in existing]
        if wanted:
            names = await _display_names(hass)
            new_entities = []
            for uid in wanted:
                if uid not in names:
                    continue  # not a real Home Assistant user (deleted, or a stale id)
                entity = FamilyHubPersonChoresTodoListEntity(entry, entry_data, uid, names[uid])
                existing[uid] = entity
                new_entities.append(entity)
            if new_entities:
                add_entities(new_entities)
    refresh_chore_todo_lists(entry_data)


def refresh_chore_todo_lists(entry_data: dict[str, Any]) -> None:
    """Re-publishes every chores list's items (after chores changed)."""
    entities = [entry_data.get("chores_todo_entity"), *(entry_data.get("chores_todo_person_entities") or {}).values()]
    for entity in entities:
        if entity is None or getattr(entity, "hass", None) is None:
            continue
        try:
            entity.async_write_ha_state()
        except Exception:  # noqa: BLE001 - an entity not fully added yet
            pass


class _ChoresListBase(TodoListEntity):
    _attr_supported_features = _FEATURES
    _attr_has_entity_name = True

    def __init__(self, entry: ConfigEntry, entry_data: dict[str, Any]) -> None:
        self._entry = entry
        self._entry_data = entry_data

    def _includes(self, chore: dict[str, Any]) -> bool:
        raise NotImplementedError

    def _status(self, chore: dict[str, Any]):
        return TodoItemStatus.COMPLETED if chore.get("status") == CHORE_STATUS_APPROVED else TodoItemStatus.NEEDS_ACTION

    def _item(self, chore: dict[str, Any]) -> TodoItem:
        return TodoItem(
            summary=chore.get("title"),
            uid=chore.get("id"),
            status=self._status(chore),
            due=chore.get("due_date"),
        )

    @property
    def todo_items(self) -> Optional[list[TodoItem]]:
        chores = self._entry_data.get("chores") or {}
        return [self._item(chore) for chore in chores.values() if self._includes(chore)]

    async def _save(self) -> None:
        await self._entry_data["chores_store"].async_save(self._entry_data["chores"])
        refresh_chore_todo_lists(self._entry_data)

    def _new_chore_payload(self, item: TodoItem) -> dict[str, Any]:
        raise NotImplementedError

    def _completing_actor(self, chore: dict[str, Any]) -> Optional[str]:
        return chore.get("assigned_to")

    async def async_create_todo_item(self, item: TodoItem) -> None:
        chores = self._entry_data["chores"]
        try:
            chore_engine.create_chore(chores, self.hass, self._new_chore_payload(item))
        except chore_engine.ChoreError as err:
            _LOGGER.warning("Family Hub: couldn't create chore from to-do item %r: %s", item.summary, err)
            return
        await self._save()

    async def async_update_todo_item(self, item: TodoItem) -> None:
        chores = self._entry_data["chores"]
        chore = chores.get(item.uid) if item.uid else None
        if chore is None:
            _LOGGER.warning("Family Hub: couldn't update to-do item - no matching chore for uid %r", item.uid)
            return
        if item.summary and item.summary != chore.get("title"):
            try:
                chore_engine.update_chore(chores, item.uid, {"title": item.summary})
            except chore_engine.ChoreError as err:
                _LOGGER.debug("Family Hub: couldn't rename chore %s from to-do item: %s", item.uid, err)
        if item.status == TodoItemStatus.COMPLETED and chore.get("status") not in (CHORE_STATUS_APPROVED, CHORE_STATUS_PENDING_VERIFICATION):
            try:
                completed = chore_engine.complete_chore(
                    chores, self._entry_data["rewards"], self.hass, item.uid, self._completing_actor(chore),
                    permissions=self._entry_data.get("permissions"),
                )
            except chore_engine.ChoreError as err:
                _LOGGER.debug("Family Hub: couldn't complete chore %s from to-do item: %s", item.uid, err)
            else:
                if completed.get("status") == CHORE_STATUS_APPROVED:
                    # Auto-approved on completion (chore_skips_verification) - stars were disbursed into self._entry_data["rewards"] in memory; persist that too
                    await self._entry_data["rewards_store"].async_save(self._entry_data["rewards"])
        await self._save()

    async def async_delete_todo_items(self, uids: list[str]) -> None:
        chores = self._entry_data["chores"]
        for uid in uids:
            try:
                chore_engine.delete_chore(chores, uid)
            except chore_engine.ChoreError as err:
                _LOGGER.debug("Family Hub: couldn't delete chore %s from to-do item: %s", uid, err)
        await self._save()


class FamilyHubChoresTodoListEntity(_ChoresListBase):
    """The generic list: chores nobody has yet."""

    def __init__(self, entry: ConfigEntry, entry_data: dict[str, Any]) -> None:
        super().__init__(entry, entry_data)
        self._attr_name = TODO_CHORES_ENTITY_NAME
        self._attr_unique_id = f"{TODO_CHORES_UNIQUE_ID_PREFIX}_{entry.entry_id}"

    def _includes(self, chore: dict[str, Any]) -> bool:
        return _is_unassigned(chore)

    def _new_chore_payload(self, item: TodoItem) -> dict[str, Any]:
        return {"title": item.summary, "assignment_mode": CHORE_ASSIGNMENT_MODE_CHORE_BIN, "due_date": item.due}


class FamilyHubPersonChoresTodoListEntity(_ChoresListBase):
    """One person's chores. A chore they've finished but that's waiting for approval shows
    as done (with a note), so ticking it off doesn't seem to undo itself."""

    def __init__(self, entry: ConfigEntry, entry_data: dict[str, Any], user_id: str, name: str) -> None:
        super().__init__(entry, entry_data)
        self._user_id = user_id
        self._attr_name = f"{name} Chores"
        self._attr_unique_id = f"{TODO_CHORES_UNIQUE_ID_PREFIX}_{entry.entry_id}_{user_id}"

    @property
    def user_id(self) -> str:
        return self._user_id

    def _includes(self, chore: dict[str, Any]) -> bool:
        return chore.get("assigned_to") == self._user_id

    def _status(self, chore: dict[str, Any]):
        if chore.get("status") in (CHORE_STATUS_APPROVED, CHORE_STATUS_PENDING_VERIFICATION):
            return TodoItemStatus.COMPLETED
        return TodoItemStatus.NEEDS_ACTION

    def _item(self, chore: dict[str, Any]) -> TodoItem:
        item = super()._item(chore)
        if chore.get("status") == CHORE_STATUS_PENDING_VERIFICATION:
            item.description = "Waiting for approval"
        return item

    def _new_chore_payload(self, item: TodoItem) -> dict[str, Any]:
        return {
            "title": item.summary,
            "assignment_mode": CHORE_ASSIGNMENT_MODE_DIRECT,
            "assigned_to": self._user_id,
            "due_date": item.due,
        }

    def _completing_actor(self, chore: dict[str, Any]) -> Optional[str]:
        return self._user_id
