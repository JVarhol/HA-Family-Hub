"""Shared write-and-broadcast helper for Privacy Mode - see PRIVACY_MODE_EVENT_CHANGED's own comment in const.py for the feature itself."""
from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant

from .const import PRIVACY_MODE_EVENT_CHANGED


async def async_set_privacy_mode(hass: HomeAssistant, entry_data: dict[str, Any], enabled: bool) -> None:
    state = entry_data.setdefault("privacy_mode", {"enabled": False})
    state["enabled"] = bool(enabled)
    store = entry_data.get("privacy_mode_store")
    if store is not None:
        await store.async_save(state)
    hass.bus.async_fire(PRIVACY_MODE_EVENT_CHANGED, {"enabled": bool(enabled)})
