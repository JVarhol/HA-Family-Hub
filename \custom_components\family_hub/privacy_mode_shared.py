"""Shared write-and-broadcast helper for Privacy Mode - see
PRIVACY_MODE_EVENT_CHANGED's own comment in const.py for the feature itself.

Deliberately its own tiny module, self-contained like device_settings_
entity_shared.py (no imports from `.`'s own __init__.py, and nothing from
switch.py or chores_websocket_api.py either - see those two modules' own
docstrings for how the dependency only ever flows INTO this one, never back
out, which is what keeps switch.py able to call this directly with no
circular import). Everything that actually needs to turn privacy mode on or
off - FamilyHubPrivacyModeSwitch's own turn_on/turn_off (an automation,
unconditionally - no PIN) and chores_websocket_api.py's ws_privacy_mode_
set/ws_privacy_mode_disable_with_pin (the card's own "more" menu and PIN-
gated unlock flow) - calls async_set_privacy_mode below rather than
poking entry_data["privacy_mode"] directly, so there is exactly one place
that persists the flag and fires the live event.
"""
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
