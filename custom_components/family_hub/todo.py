"""todo platform: syncs Chores onto a single native to-do list entity
(todo.family_hub_chores) - the "native HA UI/Assist/Alexa/Google can see
and add chores directly" part of the spec, with zero involvement from any
of the Family Hub cards.

Forwarded from __init__.py's async_setup_entry via
hass.config_entries.async_forward_entry_setups(entry, ["todo"]) - Home
Assistant's own loader finds this file by the domain/platform naming
convention (family_hub/todo.py = the "todo" platform for the "family_hub"
integration), so nothing in __init__.py imports this module directly.

Self-contained like chores_websocket_api.py/chore_engine.py/reward_engine.py -
imports only from .const/.chore_engine, never from `.` (the package
__init__.py), so it has no circular-import exposure and can be unit tested
without loading the rest of the integration.

Mapping to the 3-status chore state machine (see chore_engine.py):
  - open / pending_verification -> TodoItemStatus.NEEDS_ACTION (a chore
    only reads as "done" in a to-do list once it's actually approved - a
    completed-but-unverified chore still needs a household member's
    attention, so leaving it unchecked is the more honest state).
  - approved -> TodoItemStatus.COMPLETED.

Native create/check-off/delete actions are intentionally simple, since the
plain to-do API has no concept of assignment/rotation/dependencies/stars:
  - Creating an item here creates a brand-new "chore_bin" chore (assigned
    to nobody in particular, direct mode isn't possible without a target
    user) - anyone can then claim/assign it normally from the cards.
  - Checking an item off calls complete_chore (entering pending
    verification, same as tapping "Done" on a card) - it does NOT
    immediately mark the chore approved/disburse stars; the verification
    gate still applies even from a voice assistant. Un-checking a
    completed item is not supported (no "un-complete" in the state
    machine - see chore_engine.py's own docstring for why).
  - Deleting an item deletes the chore outright.
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
    CHORE_STATUS_APPROVED,
    DOMAIN,
    TODO_CHORES_ENTITY_NAME,
    TODO_CHORES_UNIQUE_ID_PREFIX,
)

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    entry_data = hass.data.get(DOMAIN, {}).get("entries", {}).get(entry.entry_id)
    if entry_data is None:
        _LOGGER.warning("Family Hub: todo platform set up before the integration's own entry data existed - skipping")
        return
    entity = FamilyHubChoresTodoListEntity(entry, entry_data)
    entry_data["chores_todo_entity"] = entity
    async_add_entities([entity])


class FamilyHubChoresTodoListEntity(TodoListEntity):
    _attr_supported_features = (
        TodoListEntityFeature.CREATE_TODO_ITEM
        | TodoListEntityFeature.UPDATE_TODO_ITEM
        | TodoListEntityFeature.DELETE_TODO_ITEM
    )
    _attr_has_entity_name = True

    def __init__(self, entry: ConfigEntry, entry_data: dict[str, Any]) -> None:
        self._entry = entry
        self._entry_data = entry_data
        self._attr_name = TODO_CHORES_ENTITY_NAME
        self._attr_unique_id = f"{TODO_CHORES_UNIQUE_ID_PREFIX}_{entry.entry_id}"

    @property
    def todo_items(self) -> Optional[list[TodoItem]]:
        chores = self._entry_data.get("chores") or {}
        items = []
        for chore in chores.values():
            status = TodoItemStatus.COMPLETED if chore.get("status") == CHORE_STATUS_APPROVED else TodoItemStatus.NEEDS_ACTION
            items.append(
                TodoItem(
                    summary=chore.get("title"),
                    uid=chore.get("id"),
                    status=status,
                    due=chore.get("due_date"),
                )
            )
        return items

    async def _save(self) -> None:
        await self._entry_data["chores_store"].async_save(self._entry_data["chores"])

    async def async_create_todo_item(self, item: TodoItem) -> None:
        chores = self._entry_data["chores"]
        try:
            chore_engine.create_chore(
                chores,
                self.hass,
                {"title": item.summary, "assignment_mode": CHORE_ASSIGNMENT_MODE_CHORE_BIN, "due_date": item.due},
            )
        except chore_engine.ChoreError as err:
            _LOGGER.warning("Family Hub: couldn't create chore from to-do item %r: %s", item.summary, err)
            return
        await self._save()
        self.async_write_ha_state()

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
        if item.status == TodoItemStatus.COMPLETED:
            try:
                chore_engine.complete_chore(chores, self.hass, item.uid, chore.get("assigned_to"))
            except chore_engine.ChoreError as err:
                _LOGGER.debug("Family Hub: couldn't complete chore %s from to-do item: %s", item.uid, err)
        await self._save()
        self.async_write_ha_state()

    async def async_delete_todo_items(self, uids: list[str]) -> None:
        chores = self._entry_data["chores"]
        for uid in uids:
            try:
                chore_engine.delete_chore(chores, uid)
            except chore_engine.ChoreError as err:
                _LOGGER.debug("Family Hub: couldn't delete chore %s from to-do item: %s", uid, err)
        await self._save()
        self.async_write_ha_state()
