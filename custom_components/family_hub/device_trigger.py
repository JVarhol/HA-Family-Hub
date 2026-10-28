"""Device automation triggers for Family Hub Routines."""
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

# These three map 1:1 onto the three `event` values _fire_routine_event already sends in the ROUTINE_EVENT_TYPE payload
TRIGGER_TYPE_ROUTINE_COMPLETED = "routine_completed"
TRIGGER_TYPE_ITEM_TOGGLED = "routine_item_toggled"
TRIGGER_TYPE_ITEM_APPROVED = "routine_item_approved"

# device_trigger "type" (this file's own trigger names) -> the ROUTINE_EVENT_TYPE payload's "event" field value it actually corresponds to
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
    """The fixed list of triggers the Family Hub device offers - always all three"""
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
    """Delegates to Home Assistant's own Event trigger platform - a Family Hub device trigger IS just an Event trigger on ROUTINE_EVENT_TYPE with event_data"""
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
