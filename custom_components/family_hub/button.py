"""button platform: one press-only button entity per real Home Assistant
user account, each opening THAT user's own Daily Digest modal
live on whichever Family Hub dashboard they currently have open.

Why this exists - the household's own words: "Need to make the daily digest
a Card/modal. ... Add a setting that is per device that allows you to add
the modal button to the calendar screen or allows someone to add a digest
button to a dashboard by calling an entity. Digest should be user specific."

The in-card route (a "Daily Digest" item in the calendar card's own More
menu, gated by the new familyCalendarShowDigestButtonLocal device setting -
see const.py's DEVICE_SETTINGS_FIELDS and the card's own _openDailyDigest)
covers "add the modal button to the calendar screen." This file covers the
other half: "allows someone to add a digest button to a dashboard by
calling an entity" - a plain `button` domain entity is exactly Home
Assistant's own answer to "something I can drop on any dashboard as a
button card, or press from an automation/script." Pressing it does NOT
itself send a notification (that's already covered by the scheduled digest
and the Users tab's "Send test digest now") - it fires
DAILY_DIGEST_EVENT_OPEN (see const.py's own comment on that event) so any
currently-open Family Hub card belonging to THIS SAME signed-in user pops
its digest modal open right there, same live-broadcast shape as an
already-ringing timer alarm reaching every open dashboard.

One button PER USER (not one shared button) because "Digest should be user
specific" is the whole point - the digest's actual content already varies
per recipient (see _build_daily_digest_sections' own docstring), and a
single shared button would have no way to know whose morning to show
without guessing. A household member presses THEIR OWN named button
(wherever it's been placed - their own phone dashboard, a shared tablet, an
automation) and sees their own events/reminders/chores, never anyone
else's.

Entities here are created once, statically, at setup from whichever real
(non-system-generated) Home Assistant user accounts exist at that moment -
same enumeration _ws_get_users already uses for the Users tab's own admin
dropdown. Unlike sensor.py's per-running-timer entities, these are NOT
recreated dynamically as accounts are added or removed - a new HA user
added later only gets their own button after the next Family Hub reload/HA
restart, an accepted, ordinary limitation shared by plenty of "one entity
per configured X" integrations rather than something worth a live
add/remove-entities bridge for what's expected to be a rare event.

Self-contained like sensor.py/todo.py: no imports from `.` (the package
__init__.py), so it has no circular-import exposure and is forwarded the
same way (hass.config_entries.async_forward_entry_setups(entry, ["button"])).
"""
from __future__ import annotations

import logging

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DAILY_DIGEST_EVENT_OPEN, DOMAIN

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    entry_data = hass.data.get(DOMAIN, {}).get("entries", {}).get(entry.entry_id)
    if entry_data is None:
        _LOGGER.warning("Family Hub: button platform set up before the integration's own entry data existed - skipping")
        return
    users = [u for u in await hass.auth.async_get_users() if not getattr(u, "system_generated", False)]
    entities = [
        FamilyHubDailyDigestButton(entry.entry_id, u.id, u.name or u.id)
        for u in users
    ]
    if entities:
        async_add_entities(entities)


class FamilyHubDailyDigestButton(ButtonEntity):
    """Pressing this fires DAILY_DIGEST_EVENT_OPEN carrying this button's own
    user_id - purely a live broadcast, no state, nothing persisted here (see
    this module's own docstring for why there is deliberately no pending/
    catch-up backstop for a device that wasn't open at press time)."""

    _attr_has_entity_name = True
    _attr_icon = "mdi:newspaper-variant-outline"

    def __init__(self, entry_id: str, user_id: str, user_name: str) -> None:
        self._entry_id = entry_id
        self._user_id = user_id
        self._attr_unique_id = f"{entry_id}_daily_digest_button_{user_id}"
        self._attr_name = f"{user_name} Daily Digest"

    async def async_press(self) -> None:
        self.hass.bus.async_fire(DAILY_DIGEST_EVENT_OPEN, {"user_id": self._user_id})
