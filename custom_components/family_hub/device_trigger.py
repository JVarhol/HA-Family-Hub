"""Device automation triggers for Family Hub Routines.

v190+: household ask, verbatim - "routines should be able to be used as
automation triggers" (v186), then, once that shipped as a plain bus event
with no device behind it, the follow-up report: "family hub is not
showing as an integration with automation triggers and it's not showing
if I type family into the trigger search."

The v186 fix (see chores_websocket_api.py's _fire_routine_event) already
made every routine checklist toggle/approval, and the moment a person
finishes every item due today in one of their routines, fire a real HA
bus event (ROUTINE_EVENT_TYPE = "family_hub_routine_event"). That was
technically usable as a trigger - Settings -> Automations -> Add Trigger
-> Event -> type the event type by hand. But Home Assistant's "Add
Trigger" search box only ever surfaces an integration by name for
entities or DEVICES that integration owns; a bare bus event with nothing
registered in the device registry never appears no matter what you
search for, which is exactly the gap this file closes.

This file is Home Assistant's own device automation platform contract
(see the "trigger" platform docs) - `async_get_triggers` lists what shows
up for the "Family Hub" device (registered once per config entry, in
__init__.py's async_setup_entry) when it's picked in the trigger UI,
`async_get_trigger_capabilities` offers the optional "only this routine
category" / "only this household member" narrowing fields, and
`async_attach_trigger` is what actually fires the automation - it just
builds the equivalent plain Event trigger (matching event_type +
event_data) under the hood and delegates to Home Assistant's own event
trigger platform, so there's no separate listening/dispatch logic to
maintain here at all.

Self-contained like todo.py/sensor.py: only imports from .const, nothing
from the package __init__.py, so it carries no circular-import exposure -
Home Assistant discovers and imports this module by convention
(`<domain>.device_trigger`) whenever a device belonging to this domain is
asked for its available triggers.
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components.device_automation import DEVICE_TRIGGER_BASE_SCHEMA
from homeassistant.components.homeassistant.triggers import event as event_trigger
from homeassistant.const import CONF_DEVICE_ID, CONF_DOMAIN, CONF_PLATFORM, CONF_TYPE
from homeassistant.core import CALLBACK_TYPE, HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.trigger import TriggerActionType, TriggerInfo
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN, ROUTINE_CATEGORIES, ROUTINE_CATEGORY_LABELS, ROUTINE_EVENT_TYPE

# These three map 1:1 onto the three `event` values _fire_routine_event
# already sends in the ROUTINE_EVENT_TYPE payload (see
# chores_websocket_api.py) - "routine_completed" fires once when every
# item due today in a category is done, the other two fire on every
# single checklist toggle/approval regardless of whether that finishes
# the routine.
TRIGGER_TYPE_ROUTINE_COMPLETED = "routine_completed"
TRIGGER_TYPE_ITEM_TOGGLED = "routine_item_toggled"
TRIGGER_TYPE_ITEM_APPROVED = "routine_item_approved"

# device_trigger "type" (this file's own trigger names) -> the ROUTINE_EVENT_TYPE
# payload's "event" field value it actually corresponds to - the one place
# that mapping lives, so the three lists below can never drift apart.
_TRIGGER_TYPE_TO_EVENT_NAME = {
    TRIGGER_TYPE_ROUTINE_COMPLETED: "routine_completed",
    TRIGGER_TYPE_ITEM_TOGGLED: "item_toggled",
    TRIGGER_TYPE_ITEM_APPROVED: "item_approved",
}

TRIGGER_TYPES = tuple(_TRIGGER_TYPE_TO_EVENT_NAME.keys())

CONF_CATEGORY = "category"
CONF_ROUTINE_USER_ID = "routine_user_id"

TRIGGER_SCHEMA = DEVICE_TRIGGER_BASE_SCHEMA.extend(
    {
        vol.Required(CONF_TYPE): vol.In(TRIGGER_TYPES),
        vol.Optional(CONF_CATEGORY): vol.In(ROUTINE_CATEGORIES),
        vol.Optional(CONF_ROUTINE_USER_ID): cv.string,
    }
)


def _device_belongs_to_family_hub(hass: HomeAssistant, device_id: str) -> bool:
    device_registry = dr.async_get(hass)
    device = device_registry.async_get(device_id)
    if device is None:
        return False
    return any(domain == DOMAIN for domain, _ident in device.identifiers)


async def async_get_triggers(hass: HomeAssistant, device_id: str) -> list[dict[str, Any]]:
    """The fixed list of triggers the Family Hub device offers - always
    all three, regardless of whether the household has routines enabled
    or any routines actually set up yet (same "always show what's
    possible" approach as every other integration's device triggers -
    narrowing to "only this category"/"only this person" happens via the
    optional extra_fields below, not by hiding trigger types)."""
    if not _device_belongs_to_family_hub(hass, device_id):
        return []
    return [
        {
            CONF_PLATFORM: "device",
            CONF_DEVICE_ID: device_id,
            CONF_DOMAIN: DOMAIN,
            CONF_TYPE: trigger_type,
        }
        for trigger_type in TRIGGER_TYPES
    ]


async def async_get_trigger_capabilities(hass: HomeAssistant, config: ConfigType) -> dict[str, Any]:
    """Optional narrowing fields shown once a trigger type is picked -
    "Category" (Morning/Afternoon/Night Routine) and "Person" (any real HA
    user, name looked up live via hass.auth so it stays correct as people
    are added/renamed - same source family_hub/list_users already uses).
    Both default to "any" (left blank) when omitted, matching how
    _fire_routine_event's payload always carries user_id/category but a
    household may want an automation that fires for ANY of them."""
    users = await hass.auth.async_get_users()
    user_choices = {user.id: user.name or user.id for user in users if not user.system_generated}
    return {
        "extra_fields": vol.Schema(
            {
                vol.Optional(CONF_CATEGORY): vol.In(dict(ROUTINE_CATEGORY_LABELS)),
                vol.Optional(CONF_ROUTINE_USER_ID): vol.In(user_choices),
            }
        )
    }


async def async_attach_trigger(
    hass: HomeAssistant,
    config: ConfigType,
    action: TriggerActionType,
    trigger_info: TriggerInfo,
) -> CALLBACK_TYPE:
    """Delegates to Home Assistant's own Event trigger platform - a
    Family Hub device trigger IS just an Event trigger on
    ROUTINE_EVENT_TYPE with event_data pre-filled from the trigger type
    (+ the optional category/person narrowing), so there's no separate
    listen/dispatch/cleanup logic to hand-maintain here. Mirrors the
    pattern most core integrations' device_trigger.py use for
    event-backed triggers."""
    event_data: dict[str, Any] = {"event": _TRIGGER_TYPE_TO_EVENT_NAME[config[CONF_TYPE]]}
    if config.get(CONF_CATEGORY):
        event_data[CONF_CATEGORY] = config[CONF_CATEGORY]
    if config.get(CONF_ROUTINE_USER_ID):
        event_data["user_id"] = config[CONF_ROUTINE_USER_ID]

    event_config = event_trigger.TRIGGER_SCHEMA(
        {
            event_trigger.CONF_PLATFORM: "event",
            event_trigger.CONF_EVENT_TYPE: [ROUTINE_EVENT_TYPE],
            event_trigger.CONF_EVENT_DATA: event_data,
        }
    )
    return await event_trigger.async_attach_trigger(
        hass, event_config, action, trigger_info, platform_type="device"
    )
