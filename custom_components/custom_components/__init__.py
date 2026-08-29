"""Family Hub integration.

One integration, one install, one restart, covering what used to be three
separate pieces:
  - Theme Builder: a sidebar panel for editing generic themes (colors,
    fonts, shadow/glow effects, background image) plus a websocket API
    (theme_builder/list, theme_builder/save) any card can call, and
    best-effort registration of each theme as a real, selectable Home
    Assistant theme.
  - Family Calendar Reminders: server-side polling of chosen calendars that
    fires notify.* calls ahead of events with a reminder marker in their
    description, independent of any dashboard being open.
  - The Family Week Calendar card itself, served as a static file and
    (best-effort) auto-registered as a dashboard resource, so future card
    updates are "replace the file, restart Home Assistant" - no more manual
    minify-and-paste into a dashboard resource.
"""
from __future__ import annotations

import base64
import difflib
import hashlib
import itertools
import json
import logging
import math
import os
import re
from datetime import timedelta
from typing import Any, Optional
from urllib.parse import quote, urlsplit

import aiohttp
import voluptuous as vol

from homeassistant.components import panel_custom, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import (
    CARD_JS_URL,
    CONF_CALENDARS,
    CONF_DAILY_DIGEST_ENABLED,
    CONF_DAILY_DIGEST_TIME,
    CONF_DEFAULT_NOTIFY,
    CONF_GROCY_API_KEY,
    CONF_GROCY_EXPIRING_DIGEST_ENABLED,
    CONF_GROCY_EXPIRING_ENABLED,
    CONF_GROCY_LOW_STOCK_DIGEST_ENABLED,
    CONF_GROCY_LOW_STOCK_ENABLED,
    CONF_GROCY_URL,
    CONF_MEAL_PLAN_ENTITY,
    CONF_NOTIFICATION_CLICK_PATH,
    CONF_OVERRIDES_TEXT,
    CONF_POLL_MINUTES,
    DAILY_DIGEST_NOTIFY_KEY,
    DAILY_DIGEST_STORAGE_KEY_PREFIX,
    DAILY_DIGEST_STORAGE_VERSION,
    DEFAULT_LOOKAHEAD_HOURS,
    DEFAULT_POLL_MINUTES,
    DOMAIN,
    ICON_URL,
    MAX_THEMES,
    NOTIFIED_RETENTION_HOURS,
    PANEL_ICON,
    PANEL_JS_URL,
    PANEL_TITLE,
    PANEL_URL,
    CONF_REMINDERS_ENTITY,
    POLL_QUERY_GRACE_MINUTES,
    REMINDER_MARKER_PATTERN,
    REMINDER_NOTIFY_KEY,
    REMINDER_OVERRIDES_STORAGE_KEY_PREFIX,
    REMINDER_OVERRIDES_STORAGE_VERSION,
    REMINDER_ROLLOVER_MARKER_PATTERN,
    REMINDER_TYPE_MARKER_PATTERN,
    REMINDERS_STORAGE_KEY_PREFIX,
    REMINDERS_STORAGE_VERSION,
    GROCERY_PUSHED_STORAGE_KEY_PREFIX,
    GROCERY_PUSHED_STORAGE_VERSION,
    GROCY_CONVERSIONS_SYNC_GENERATION,
    GROCY_CONVERSIONS_SYNC_STORAGE_KEY_PREFIX,
    GROCY_CONVERSIONS_SYNC_STORAGE_VERSION,
    SETTINGS_STORAGE_KEY_PREFIX,
    SETTINGS_STORAGE_VERSION,
    RECIPES_STORAGE_KEY_PREFIX,
    RECIPES_STORAGE_VERSION,
    SUGGESTIONS_STORAGE_KEY_PREFIX,
    SUGGESTIONS_STORAGE_VERSION,
    THEME_SELECTOR_CARD_JS_URL,
    THEME_STORAGE_KEY,
    THEME_STORAGE_VERSION,
    TODAY_CARD_JS_URL,
)
from .grocery_reference import GROCERY_REFERENCE

_LOGGER = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Theme Builder (panel + storage + websocket API + native HA theme sync)
# ---------------------------------------------------------------------------

# Old calendar-card-flavored color keys -> new generic slot names.
LEGACY_COLOR_KEY_MAP = {
    "gold": "accent",
    "goldText": "accentText",
    "green": "accent2",
    "terracotta": "accent3",
    "chipBg": "surfaceAlt",
    "blockBg": "surface2",
}

DEFAULT_SHADOW = {
    "enabled": True,
    "color": "#000000",
    "opacity": 0.16,
    "blurRadius": 8,
    "spreadRadius": 0,
    "offsetX": 0,
    "offsetY": 2,
}

DEFAULT_GLOW = {
    "enabled": False,
    "color": "#ffd21a",
    "opacity": 0.6,
    "blurRadius": 16,
}

DEFAULT_BACKGROUND = {
    "image": "",
    "size": "cover",
    "position": "center",
    "opacity": 1,
    "blur": 0,
    "overlayColor": "#000000",
    "overlayOpacity": 0,
}

# Prefix used when registering Theme Builder themes as native HA themes, so
# they're visually grouped and never collide with a user's own theme names.
HA_THEME_PREFIX = "Theme Builder - "


def _theme(
    theme_id: str,
    name: str,
    *,
    bg: str,
    card: str,
    border: str,
    text: str,
    text_secondary: str,
    accent: str,
    accent_text: str,
    accent2: str,
    accent3: str,
    surface_alt: str,
    surface2: str,
    border_width: int = 1,
    accent_border_width: int = 2,
    card_opacity: int = 100,
) -> dict:
    """Build a theme dict with the standard (generic) shape."""
    return {
        "id": theme_id,
        "name": name,
        "colors": {
            "bg": bg,
            "card": card,
            "border": border,
            "text": text,
            "textSecondary": text_secondary,
            "accent": accent,
            "accentText": accent_text,
            "accent2": accent2,
            "accent3": accent3,
            "surfaceAlt": surface_alt,
            "surface2": surface2,
        },
        "fonts": {
            "dayName": 13,
            "dayNumber": 22,
            "wxTemp": 14,
            "event": 14,
            "chip": 13,
            "headerTitle": 15,
            "countdown": 11,
            "blockLabel": 9,
            "blockMeal": 13,
        },
        "borderWidth": border_width,
        "accentBorderWidth": accent_border_width,
        "cardOpacity": card_opacity,
        "effects": {
            "shadow": dict(DEFAULT_SHADOW),
            "glow": {**DEFAULT_GLOW, "color": accent},
        },
        "background": dict(DEFAULT_BACKGROUND),
    }


def _seed_themes() -> list[dict]:
    """The built-in preset themes. First entry mirrors the original default colors."""
    return [
        _theme(
            "default", "Soft",
            bg="#fbf7e5", card="#f5f3f0", border="#e6ddc4", text="#423d34",
            text_secondary="#96877a", accent="#8f5a00", accent_text="#fff8ea",
            accent2="#305545", accent3="#b5583c", surface_alt="#efe6cf", surface2="#f2eede",
        ),
        _theme(
            "slate", "Slate",
            bg="#eef1f4", card="#f7f9fa", border="#d7dde3", text="#2e3742",
            text_secondary="#7a8794", accent="#3d6b8f", accent_text="#f4f8fb",
            accent2="#2f5a5a", accent3="#a1503c", surface_alt="#dde6ee", surface2="#e7ecf1",
        ),
        _theme(
            "meadow", "Meadow",
            bg="#f1f7ea", card="#fbfdf7", border="#d7e6c4", text="#33402a",
            text_secondary="#7c8a6a", accent="#7a8f3c", accent_text="#fbfdf0",
            accent2="#3f6b3a", accent3="#b5583c", surface_alt="#e3edd3", surface2="#eaf2df",
        ),
        _theme(
            "vaulttek", "VaultTek",
            bg="#0b1712", card="#122019", border="#22402f", text="#7cffb2",
            text_secondary="#4a8f6c", accent="#ffd21a", accent_text="#1a1400",
            accent2="#2ecc71", accent3="#d9822b", surface_alt="#17281f", surface2="#142a20",
        ),
        _theme(
            "midnight", "Midnight",
            bg="#12141c", card="#1a1d29", border="#2a2f42", text="#e4e6f0",
            text_secondary="#8b90a8", accent="#c9a227", accent_text="#1a1400",
            accent2="#3ea67a", accent3="#b5583c", surface_alt="#232739", surface2="#1f2333",
        ),
        _theme(
            "blossom", "Blossom",
            bg="#fdf1f0", card="#fffafa", border="#f3d9d6", text="#4a2e2c",
            text_secondary="#a67d78", accent="#c9789a", accent_text="#fff5f7",
            accent2="#6b8f6a", accent3="#d98a6a", surface_alt="#f7e3e0", surface2="#faeae8",
        ),
    ]


def _migrate_theme(theme: dict) -> dict:
    """Normalize a (possibly legacy-shaped) theme dict to the current schema.

    Safe to call repeatedly / on already-current themes (idempotent).
    """
    theme = dict(theme or {})
    colors = dict(theme.get("colors") or {})
    for old_key, new_key in LEGACY_COLOR_KEY_MAP.items():
        if old_key in colors:
            if new_key not in colors:
                colors[new_key] = colors[old_key]
            del colors[old_key]
    theme["colors"] = colors

    effects = theme.get("effects") or {}
    theme["effects"] = {
        "shadow": {**DEFAULT_SHADOW, **(effects.get("shadow") or {})},
        "glow": {**DEFAULT_GLOW, **(effects.get("glow") or {})},
    }
    theme["background"] = {**DEFAULT_BACKGROUND, **(theme.get("background") or {})}
    theme.setdefault("borderWidth", 1)
    theme.setdefault("accentBorderWidth", 2)
    theme.setdefault("cardOpacity", 100)
    return theme


async def _load_themes(hass: HomeAssistant) -> list[dict]:
    """Load themes from storage, seeding presets and migrating legacy shapes."""
    store: Store = hass.data[DOMAIN]["theme_store"]
    data = await store.async_load()
    raw_themes = (data or {}).get("themes") or []

    if not raw_themes:
        themes = _seed_themes()
        await store.async_save({"themes": themes})
        return themes

    changed = False
    if (
        len(raw_themes) == 1
        and raw_themes[0].get("id") == "default"
        and raw_themes[0].get("name") == "Default"
    ):
        raw_themes[0]["name"] = "Soft"
        changed = True

    migrated = []
    for t in raw_themes:
        m = _migrate_theme(t)
        if m != t:
            changed = True
        migrated.append(m)

    existing_ids = {t.get("id") for t in migrated}
    for preset in _seed_themes()[1:]:
        if preset["id"] not in existing_ids and len(migrated) < MAX_THEMES:
            migrated.append(preset)
            changed = True

    if changed:
        await store.async_save({"themes": migrated})
    return migrated


def _hex_to_rgba(hex_color: str, alpha: float) -> str:
    """Convert a #rrggbb string + 0-1 alpha into an rgba() CSS string."""
    h = (hex_color or "#000000").lstrip("#")
    if len(h) != 6:
        h = "000000"
    try:
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    except ValueError:
        r, g, b = 0, 0, 0
    a = max(0, min(1, alpha if isinstance(alpha, (int, float)) else 1))
    return f"rgba({r}, {g}, {b}, {a})"


def _build_box_shadow(effects: dict) -> str | None:
    """Combine shadow + glow into a single CSS box-shadow value."""
    shadow = (effects or {}).get("shadow") or {}
    glow = (effects or {}).get("glow") or {}
    layers = []
    if shadow.get("enabled", True):
        layers.append(
            f"{shadow.get('offsetX', 0)}px {shadow.get('offsetY', 2)}px "
            f"{shadow.get('blurRadius', 8)}px {shadow.get('spreadRadius', 0)}px "
            f"{_hex_to_rgba(shadow.get('color', '#000000'), shadow.get('opacity', 0.16))}"
        )
    if glow.get("enabled"):
        layers.append(
            f"0 0 {glow.get('blurRadius', 16)}px 0 "
            f"{_hex_to_rgba(glow.get('color', '#ffd21a'), glow.get('opacity', 0.6))}"
        )
    return ", ".join(layers) if layers else None


def _theme_to_ha_vars(theme: dict) -> dict:
    """Map a Theme Builder theme onto Home Assistant's native theme variables."""
    colors = theme.get("colors") or {}
    box_shadow = _build_box_shadow(theme.get("effects") or {})
    accent = colors.get("accent", "#8f5a00")
    accent_text = colors.get("accentText", "#fff8ea")
    ha_vars = {
        "primary-color": accent,
        "text-primary-color": accent_text,
        "primary-background-color": colors.get("bg", "#fbf7e5"),
        "secondary-background-color": colors.get("surfaceAlt", "#efe6cf"),
        "card-background-color": colors.get("card", "#f5f3f0"),
        "primary-text-color": colors.get("text", "#423d34"),
        "secondary-text-color": colors.get("textSecondary", "#96877a"),
        "divider-color": colors.get("border", "#e6ddc4"),
        "accent-color": colors.get("accent2", accent),
        "warning-color": colors.get("accent3", "#b5583c"),
        "app-header-background-color": accent,
        "app-header-text-color": accent_text,
        "ha-card-background": colors.get("card", "#f5f3f0"),
        "ha-card-border-width": f"{theme.get('borderWidth', 1)}px",
    }
    if box_shadow:
        ha_vars["ha-card-box-shadow"] = box_shadow
    return ha_vars


def _register_ha_themes(hass: HomeAssistant, themes: list[dict]) -> None:
    """Best-effort: expose each Theme Builder theme as a selectable HA theme.

    This writes directly into the frontend integration's internal theme
    registry (hass.data["frontend_themes"]). Home Assistant has no supported
    public API for a separate integration to add entries there - this is an
    unofficial hook into a stable-but-internal implementation detail. Any
    failure here is swallowed so a Home Assistant core update can never break
    Family Hub's own storage, panel, or the websocket API the calendar card
    relies on.

    Only colors and a synthesized card shadow carry over - HA's theme system
    has no per-element font-size hooks or background-image concept, so those
    stay available only via theme_builder/list for cards built to use them.
    """
    try:
        frontend_themes = hass.data.get("frontend_themes")
        if frontend_themes is None:
            return
        stale = [name for name in frontend_themes if name.startswith(HA_THEME_PREFIX)]
        current_names = set()
        for theme in themes:
            name = f"{HA_THEME_PREFIX}{theme.get('name') or theme.get('id')}"
            current_names.add(name)
            frontend_themes[name] = _theme_to_ha_vars(theme)
        for name in stale:
            if name not in current_names:
                frontend_themes.pop(name, None)
        hass.bus.async_fire("themes_updated")
    except Exception:  # noqa: BLE001 - defensive against internal HA changes
        _LOGGER.debug(
            "Could not register Family Hub themes as native HA themes", exc_info=True
        )


@websocket_api.websocket_command({vol.Required("type"): "theme_builder/list"})
@websocket_api.async_response
async def _ws_list_themes(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Return every saved theme (seeding/migrating as needed)."""
    themes = await _load_themes(hass)
    _register_ha_themes(hass, themes)
    connection.send_result(msg["id"], {"themes": themes})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "theme_builder/save",
        vol.Required("themes"): list,
    }
)
@websocket_api.async_response
async def _ws_save_themes(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Persist the full theme list (capped at MAX_THEMES), normalizing shape."""
    themes = [_migrate_theme(t) for t in msg["themes"][:MAX_THEMES]]
    store: Store = hass.data[DOMAIN]["theme_store"]
    await store.async_save({"themes": themes})
    _register_ha_themes(hass, themes)
    connection.send_result(msg["id"], {"themes": themes})


# ---------------------------------------------------------------------------
# Family Calendar Reminders (server-side polling + notify.*)
# ---------------------------------------------------------------------------

REMINDER_RE = re.compile(REMINDER_MARKER_PATTERN)
REMINDER_TYPE_RE = re.compile(REMINDER_TYPE_MARKER_PATTERN)
REMINDER_ROLLOVER_RE = re.compile(REMINDER_ROLLOVER_MARKER_PATTERN)


def _is_reminder_type_event(description: str) -> bool:
    """True if this event was created from the Add Event modal's Reminder
    tab (tagged with <!--type:reminder-->), as opposed to an ordinary
    calendar event that happens to carry a "remind me N minutes before"
    marker."""
    return bool(REMINDER_TYPE_RE.search(description or ""))


def _parse_overrides(text: str) -> dict[str, list[str]]:
    """Parse 'calendar.entity = notify.service_one,notify.service_two' lines into a dict.

    Each calendar can list one or more notify targets, comma-separated -
    every device in the list gets its own notification. Blank lines, lines
    without '=', and lines missing either side are skipped rather than
    raising - a typo here should degrade to "use the default target" for
    that calendar, not break the whole integration.
    """
    overrides: dict[str, list[str]] = {}
    for raw_line in (text or "").splitlines():
        line = raw_line.strip()
        if not line or "=" not in line:
            continue
        entity, _, targets_raw = line.partition("=")
        entity = entity.strip()
        targets = [t.strip() for t in targets_raw.split(",") if t.strip()]
        if entity and targets:
            overrides[entity] = targets
    return overrides


def _split_notify_target(target: str) -> tuple[str, str] | None:
    """Turn 'notify.mobile_app_x' into ('notify', 'mobile_app_x')."""
    target = (target or "").strip()
    if not target.startswith("notify."):
        return None
    service = target[len("notify."):]
    if not service:
        return None
    return "notify", service


def _overrides_to_text(overrides: dict[str, list[str]]) -> str:
    """The inverse of _parse_overrides - back to 'calendar.entity = notify.a,notify.b' lines."""
    return "\n".join(
        f"{entity} = {','.join(targets)}" for entity, targets in sorted(overrides.items()) if targets
    )


def _get_family_hub_entry(hass: HomeAssistant) -> ConfigEntry | None:
    """Family Hub is single-instance (config_flow sets unique_id=DOMAIN), so
    there is at most one config entry to find."""
    entries = hass.config_entries.async_entries(DOMAIN)
    return entries[0] if entries else None


def _get_family_hub_entry_data(hass: HomeAssistant) -> dict[str, Any] | None:
    """Return the hass.data[DOMAIN]['entries'][entry_id] runtime bucket
    (reminder overrides, the notified-dedup store, etc.) for the single
    Family Hub config entry, or None if it isn't set up yet."""
    entry = _get_family_hub_entry(hass)
    if entry is None:
        return None
    return hass.data.get(DOMAIN, {}).get("entries", {}).get(entry.entry_id)


@websocket_api.websocket_command({vol.Required("type"): "family_hub/get_notify_config"})
@websocket_api.async_response
async def _ws_get_notify_config(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Return the reminders default target + per-calendar overrides, for the
    card's Settings > Calendars notify picker."""
    entry = _get_family_hub_entry(hass)
    options = entry.options if entry else {}
    connection.send_result(
        msg["id"],
        {
            "default_notify": options.get(CONF_DEFAULT_NOTIFY, ""),
            "overrides": _parse_overrides(options.get(CONF_OVERRIDES_TEXT, "")),
        },
    )


def _add_monitored_calendars(existing: list[str], new_entities: "Iterable[str]") -> list[str]:
    """Return existing + any of new_entities not already present, order-preserving.

    Never removes anything - the card's UI (notify picker, per-event reminder
    editor) only ever has visibility into ONE calendar/event at a time, so it
    can add a calendar to "Calendars to monitor" with confidence but can
    never safely conclude a calendar should be dropped from it.
    """
    result = list(existing)
    for entity in new_entities:
        if entity not in result:
            result.append(entity)
    return result


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/set_notify_overrides",
        vol.Required("overrides"): dict,
    }
)
@websocket_api.async_response
async def _ws_set_notify_overrides(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Replace the full per-calendar notify override map in one shot.

    Written into the same config-entry options the reminders poller already
    reads (CONF_OVERRIDES_TEXT) - this is the only place that data lives, so
    the card's Settings UI and the integration's own Configure form always
    agree with each other.

    A calendar getting notify device(s) here is clearly meant to have its
    reminders fire, so it's also added to "Calendars to monitor"
    (CONF_CALENDARS) automatically - previously this was a separate, easy to
    miss step in Configure, and forgetting it meant reminders on that
    calendar would silently never fire even though notify devices were set.
    """
    entry = _get_family_hub_entry(hass)
    if entry is None:
        connection.send_error(msg["id"], "not_found", "Family Hub is not set up")
        return
    overrides: dict[str, list[str]] = {}
    for entity, targets in (msg.get("overrides") or {}).items():
        raw_list = targets if isinstance(targets, list) else [targets]
        cleaned = [str(t).strip() for t in raw_list if str(t).strip()]
        if cleaned:
            overrides[str(entity)] = cleaned
    # The overrides map can also contain the reminders to-do entity (a real
    # entity, but a todo.* one, not a calendar.* one - reminders get their
    # own row in the card's Settings > Reminders notify picker, sharing this
    # same map) or the older synthetic REMINDER_NOTIFY_KEY from a prior
    # version. Neither belongs in "Calendars to monitor" - calendar.get_events
    # would just fail against them every poll - so only real calendar
    # entities are ever added there.
    calendars = _add_monitored_calendars(
        entry.options.get(CONF_CALENDARS, []),
        [e for e in overrides.keys() if e.startswith("calendar.")],
    )
    new_options = {
        **entry.options,
        CONF_OVERRIDES_TEXT: _overrides_to_text(overrides),
        CONF_CALENDARS: calendars,
    }
    hass.config_entries.async_update_entry(entry, options=new_options)
    connection.send_result(msg["id"], {"overrides": overrides, "calendars": calendars})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/set_reminders_entity",
        vol.Required("entity_id"): str,
    }
)
@websocket_api.async_response
async def _ws_set_reminders_entity(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Record which Home Assistant to-do list holds standalone reminders.

    Sent best-effort by the card once per session (see _syncRemindersEntity
    in the card's JS) so the poller (_poll_reminders_todo) knows which
    to-do entity to check for due reminders, without anyone needing to type
    the entity id into Configure by hand. Reminders are plain to-do items,
    not calendar events, so this is intentionally separate from
    CONF_CALENDARS / "Calendars to monitor".
    """
    entry = _get_family_hub_entry(hass)
    if entry is None:
        connection.send_error(msg["id"], "not_found", "Family Hub is not set up")
        return
    entity_id = str(msg["entity_id"]).strip()
    if entity_id and entry.options.get(CONF_REMINDERS_ENTITY) != entity_id:
        hass.config_entries.async_update_entry(
            entry, options={**entry.options, CONF_REMINDERS_ENTITY: entity_id}
        )
    connection.send_result(msg["id"], {"entity_id": entity_id})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/set_notification_click_path",
        vol.Required("path"): str,
    }
)
@websocket_api.async_response
async def _ws_set_notification_click_path(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Record the relative dashboard/view path to open when a notification
    this backend sent is tapped on a phone.

    Sent best-effort by the card once per session and again on every
    Settings save (see _syncNotificationClickPath in the card's JS). Stored
    empty-string clears it (falls back to the Companion app's own default
    behavior of just opening the app) rather than leaving a stale path.
    """
    entry = _get_family_hub_entry(hass)
    if entry is None:
        connection.send_error(msg["id"], "not_found", "Family Hub is not set up")
        return
    path = str(msg["path"]).strip()
    if entry.options.get(CONF_NOTIFICATION_CLICK_PATH, "") != path:
        hass.config_entries.async_update_entry(
            entry, options={**entry.options, CONF_NOTIFICATION_CLICK_PATH: path}
        )
    connection.send_result(msg["id"], {"path": path})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/get_settings"})
@websocket_api.async_response
async def _ws_get_settings(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Return the card's Settings blob from its Store-backed home.

    settings_entity's old "Settings" to-do item is intentionally NOT read or
    migrated here - the backend has no reliable way to know that entity id
    (it's a card-config field, not an integration option), and it's a
    per-device Lovelace card that already has that string in its own config.
    So this just returns whatever's in the store (possibly nothing yet), and
    the card (see _fetchSettings in the JS) is the one that notices an empty
    result, falls back to reading the legacy to-do item itself, and calls
    family_hub/set_settings once to migrate it in - after that, every future
    call here returns the real thing directly.
    """
    entry_data = _get_family_hub_entry_data(hass)
    if entry_data is None:
        connection.send_error(msg["id"], "not_found", "Family Hub is not set up")
        return
    store: Store = entry_data["settings_store"]
    settings = await store.async_load()
    connection.send_result(msg["id"], {"settings": settings})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/set_settings",
        vol.Required("settings"): dict,
    }
)
@websocket_api.async_response
async def _ws_set_settings(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Persist the full Settings blob to its Store-backed home.

    Called on every Settings save/patch (see _saveSettings/_persistSettingsPatch
    in the card's JS) and once, automatically, the first time the card
    notices the store is still empty and falls back to migrating the legacy
    "Settings" to-do item's JSON in. This is now the only place Settings are
    written - the old to-do item is left untouched on disk (never deleted or
    updated) as a harmless leftover, not kept in sync going forward.
    """
    entry_data = _get_family_hub_entry_data(hass)
    if entry_data is None:
        connection.send_error(msg["id"], "not_found", "Family Hub is not set up")
        return
    store: Store = entry_data["settings_store"]
    await store.async_save(msg["settings"])
    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/get_recipes"})
@websocket_api.async_response
async def _ws_get_recipes(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Return the Recipe Box's Store-backed list, plus a "migrated" flag.

    The flag - not just an empty list - is what tells the card (see
    _fetchRecipes in the JS) whether it's safe to treat "nothing here yet"
    as "this household genuinely has zero recipes" versus "this store has
    never been written to, go read the legacy todo.recipe_box list once."
    Without it, deleting every recipe down to zero would look identical to
    an unmigrated store and silently resurrect whatever's still sitting in
    the old to-do list on the next load.
    """
    entry_data = _get_family_hub_entry_data(hass)
    if entry_data is None:
        connection.send_error(msg["id"], "not_found", "Family Hub is not set up")
        return
    store: Store = entry_data["recipes_store"]
    data = await store.async_load() or {}
    connection.send_result(
        msg["id"], {"recipes": data.get("recipes", []), "migrated": bool(data.get("migrated"))}
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/set_recipes",
        vol.Required("recipes"): [dict],
    }
)
@websocket_api.async_response
async def _ws_set_recipes(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Persist the full Recipe Box list, marking the store migrated.

    Called after every add/edit/delete (the card keeps the authoritative
    list in memory and just re-saves the whole thing - see _persistRecipes
    in the JS) and once, automatically, the first time the card notices
    the store isn't migrated yet and reads the legacy to-do list in. The
    old todo.recipe_box item is left untouched on disk either way.
    """
    entry_data = _get_family_hub_entry_data(hass)
    if entry_data is None:
        connection.send_error(msg["id"], "not_found", "Family Hub is not set up")
        return
    store: Store = entry_data["recipes_store"]
    await store.async_save({"recipes": msg["recipes"], "migrated": True})
    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/get_suggestions"})
@websocket_api.async_response
async def _ws_get_suggestions(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Return Meal Suggestions' Store-backed list, plus a "migrated" flag -
    same reasoning as _ws_get_recipes just above."""
    entry_data = _get_family_hub_entry_data(hass)
    if entry_data is None:
        connection.send_error(msg["id"], "not_found", "Family Hub is not set up")
        return
    store: Store = entry_data["suggestions_store"]
    data = await store.async_load() or {}
    connection.send_result(
        msg["id"], {"suggestions": data.get("suggestions", []), "migrated": bool(data.get("migrated"))}
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/set_suggestions",
        vol.Required("suggestions"): [dict],
    }
)
@websocket_api.async_response
async def _ws_set_suggestions(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Persist the full Meal Suggestions list, marking the store migrated -
    same reasoning as _ws_set_recipes just above."""
    entry_data = _get_family_hub_entry_data(hass)
    if entry_data is None:
        connection.send_error(msg["id"], "not_found", "Family Hub is not set up")
        return
    store: Store = entry_data["suggestions_store"]
    await store.async_save({"suggestions": msg["suggestions"], "migrated": True})
    connection.send_result(msg["id"], {"success": True})


async def _grocy_error_detail(resp) -> str:
    """Best-effort extraction of *why* Grocy rejected a request, for a
    non-2xx response - Grocy's GenericEntityApiController responds to a
    validation failure (duplicate name, a bad location_id/qu_id, etc.)
    with a JSON body like {"error_message": "..."} rather than an empty
    body, but every _grocy_api_* helper used to discard that entirely and
    raise a bare "Grocy returned HTTP 400 for /api/objects/products" -
    technically accurate, but useless for actually fixing whatever Grocy
    is objecting to (a household reported this exact case: a plain "HTTP
    400" with no way to tell if the product name collided with an
    existing one, an already-deleted location was picked, or something
    else).

    Deliberately only tries resp.json() (never resp.text()) - a raw-text
    fallback would need every test's fake HTTP response objects to also
    implement .text(), when they already all implement the same .json()
    Grocy itself actually returns. Returns "" (not None) when there's
    nothing usable, so callers can build the message with a plain
    conditional rather than an extra None check.
    """
    try:
        body = await resp.json(content_type=None)
    except Exception:  # noqa: BLE001 - a non-JSON error body is common (proxies, PHP fatals)
        return ""
    if not isinstance(body, dict):
        return ""
    detail = body.get("error_message") or body.get("message") or body.get("Message")
    return str(detail).strip() if detail else ""


async def _grocy_http_error(resp, path: str) -> RuntimeError:
    detail = await _grocy_error_detail(resp)
    message = f"Grocy returned HTTP {resp.status} for {path}"
    if detail:
        message += f": {detail}"
    return RuntimeError(message)


async def _grocy_api_get(session, url: str, api_key: str, path: str):
    """GET a Grocy REST API path (e.g. '/api/objects/recipes/5') and return
    the parsed JSON body.

    Raises on a non-200 response or network failure - callers wrap this in
    a try/except and turn it into the friendly {"configured": True, ...,
    "error": str(err)} result shape used throughout the Grocy websocket
    handlers, rather than letting it propagate as an unhandled error frame
    back to the card.
    """
    async with session.get(
        f"{url}{path}",
        headers={"GROCY-API-KEY": api_key},
        timeout=aiohttp.ClientTimeout(total=10),
    ) as resp:
        if resp.status != 200:
            raise await _grocy_http_error(resp, path)
        return await resp.json(content_type=None)


async def _grocy_api_post(session, url: str, api_key: str, path: str, body: dict | None = None):
    """POST to a Grocy REST API path - either an action endpoint like
    '/api/recipes/5/add-not-fulfilled-products-to-shoppinglist' (which
    responds 204 with no body) or a generic-entity create like
    '/api/objects/recipes' (which responds 200 with a JSON body containing
    "created_object_id"). Returns the parsed JSON body, or None if there
    wasn't one. Raises on a non-2xx response or network failure, same
    convention as _grocy_api_get - callers wrap this in a try/except.
    """
    async with session.post(
        f"{url}{path}",
        headers={"GROCY-API-KEY": api_key, "Content-Type": "application/json"},
        json=body or {},
        timeout=aiohttp.ClientTimeout(total=10),
    ) as resp:
        if resp.status not in (200, 204):
            raise await _grocy_http_error(resp, path)
        if resp.status == 204:
            return None
        try:
            return await resp.json(content_type=None)
        except (ValueError, TypeError):
            return None


async def _grocy_api_put(session, url: str, api_key: str, path: str, body: dict | None = None):
    """PUT to a Grocy REST API path - used for editing an existing generic
    entity object, e.g. '/api/objects/quantity_unit_conversions/5'
    (GenericEntityApiController::EditObject, which responds 204 with no
    body on success). Same raise-on-non-2xx convention as _grocy_api_get/
    _grocy_api_post - callers wrap this in a try/except.
    """
    async with session.put(
        f"{url}{path}",
        headers={"GROCY-API-KEY": api_key, "Content-Type": "application/json"},
        json=body or {},
        timeout=aiohttp.ClientTimeout(total=10),
    ) as resp:
        if resp.status not in (200, 204):
            raise await _grocy_http_error(resp, path)
        if resp.status == 204:
            return None
        try:
            return await resp.json(content_type=None)
        except (ValueError, TypeError):
            return None


async def _grocy_api_delete(session, url: str, api_key: str, path: str):
    """DELETE a Grocy REST API path, e.g. '/api/objects/shopping_list/5'
    (GenericEntityApiController::DeleteObject, which responds 204 with no
    body on success). Same raise-on-non-2xx convention as _grocy_api_get/
    _grocy_api_post/_grocy_api_put - callers wrap this in a try/except.
    """
    async with session.delete(
        f"{url}{path}",
        headers={"GROCY-API-KEY": api_key},
        timeout=aiohttp.ClientTimeout(total=10),
    ) as resp:
        if resp.status not in (200, 204):
            raise await _grocy_http_error(resp, path)


async def _grocy_api_upload_file(
    session, url: str, api_key: str, group: str, file_name: str, data: bytes, content_type: str | None = None
) -> None:
    """PUT raw file bytes to Grocy's file storage (FilesApiController::
    UploadFile) - e.g. group="recipepictures" for a recipe's photo. Grocy
    expects the *filename itself* base64-encoded as the URL path segment
    (it decodes + validates that server-side), NOT the file contents - the
    body of the request is the raw bytes, no multipart/form wrapping.

    Grocy opens the destination file with PHP's 'xb' (exclusive create)
    mode, so re-uploading the exact same filename a second time fails
    outright rather than overwriting - callers should pick a filename
    that's unique per use (e.g. embedding the recipe id), and treat a
    failure here as recoverable/non-fatal rather than retryable as-is.
    """
    b64name = base64.b64encode(file_name.encode()).decode()
    async with session.put(
        f"{url}/api/files/{group}/{quote(b64name, safe='')}",
        headers={"GROCY-API-KEY": api_key, "Content-Type": content_type or "application/octet-stream"},
        data=data,
        timeout=aiohttp.ClientTimeout(total=20),
    ) as resp:
        if resp.status not in (200, 204):
            raise RuntimeError(f"Grocy returned HTTP {resp.status} uploading {file_name}")


async def _grocy_api_get_file_bytes(
    session, url: str, api_key: str, group: str, file_name: str
) -> tuple[bytes, str | None]:
    """GET raw file bytes back out of Grocy's file storage (mirrors
    _grocy_api_upload_file's PUT, same base64-encoded-filename-in-the-URL
    convention) - e.g. group="recipepictures" to fetch a recipe's photo
    for display. Returns (bytes, content_type). Raises on a non-200
    response or network failure, same convention as the other
    _grocy_api_* helpers - callers wrap this in a try/except and treat a
    failure as non-fatal (a missing/broken photo shouldn't break the rest
    of a recipe view).
    """
    b64name = base64.b64encode(file_name.encode()).decode()
    async with session.get(
        f"{url}/api/files/{group}/{quote(b64name, safe='')}",
        headers={"GROCY-API-KEY": api_key},
        timeout=aiohttp.ClientTimeout(total=20),
    ) as resp:
        if resp.status != 200:
            raise RuntimeError(f"Grocy returned HTTP {resp.status} downloading {file_name}")
        data = await resp.read()
        return data, resp.headers.get("Content-Type")


def _guess_image_extension(image_url: str, content_type: str | None) -> str:
    """Best-effort file extension for a fetched recipe photo, preferring
    the HTTP response's Content-Type over the URL's own path (a CDN URL
    often has no extension, or a misleading one, e.g. a query-string-only
    image endpoint)."""
    ct = (content_type or "").lower()
    if "png" in ct:
        return ".png"
    if "webp" in ct:
        return ".webp"
    if "gif" in ct:
        return ".gif"
    if "jpeg" in ct or "jpg" in ct:
        return ".jpg"
    path = urlsplit(image_url).path.lower()
    for ext in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
        if path.endswith(ext):
            return ".jpg" if ext == ".jpeg" else ext
    return ".jpg"


@websocket_api.websocket_command({vol.Required("type"): "family_hub/get_grocy_recipes"})
@websocket_api.async_response
async def _ws_get_grocy_recipes(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Fetch the recipe list from a self-hosted Grocy instance for the Meal
    Suggestions box's "Add from Grocy" picker (see CONF_GROCY_URL/
    CONF_GROCY_API_KEY - set via Settings > Devices & Services > Family Hub
    > Configure > Grocy, not the card).

    Only name + a link back to the recipe in Grocy are returned -
    ingredients/instructions stay in Grocy rather than being duplicated into
    Family Hub's own storage, matching what the card actually does with
    them (adds a suggestion with a name and an optional "open in Grocy"
    link, same as any hand-typed suggestion).

    Result shape is always `{"configured": bool, "recipes": [...], "error"?:
    str}` - never an error response - so the card can render a friendly
    empty/error state in the picker instead of a raised exception.
    """
    entry = _get_family_hub_entry(hass)
    url = (entry.options.get(CONF_GROCY_URL) if entry else "") or ""
    api_key = (entry.options.get(CONF_GROCY_API_KEY) if entry else "") or ""
    if not url or not api_key:
        connection.send_result(msg["id"], {"configured": False, "recipes": []})
        return

    session = async_get_clientsession(hass)
    try:
        async with session.get(
            f"{url}/api/objects/recipes",
            headers={"GROCY-API-KEY": api_key},
            timeout=aiohttp.ClientTimeout(total=10),
        ) as resp:
            if resp.status != 200:
                connection.send_result(
                    msg["id"],
                    {
                        "configured": True,
                        "recipes": [],
                        "error": f"Grocy returned HTTP {resp.status}",
                    },
                )
                return
            data = await resp.json(content_type=None)
    except Exception as err:  # noqa: BLE001 - surface a friendly error, don't crash the dashboard
        connection.send_result(
            msg["id"], {"configured": True, "recipes": [], "error": str(err)}
        )
        return

    recipes = []
    for item in data if isinstance(data, list) else []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        recipe_id = item.get("id")
        if not name or recipe_id is None:
            continue
        # Grocy's own frontend route for a recipe page is singular
        # (/recipe/{id}) even though the API list endpoint above is plural
        # (/api/objects/recipes) - confirmed against Grocy's routes.php,
        # since getting this wrong just silently 404s in the browser.
        recipes.append({"id": recipe_id, "name": name, "link": f"{url}/recipe/{recipe_id}"})
    recipes.sort(key=lambda r: r["name"].lower())
    connection.send_result(msg["id"], {"configured": True, "recipes": recipes})


def _format_grocy_ingredient_amount(pos: dict, unit: dict) -> str:
    """Turn a recipes_pos row + its resolved quantity_unit into a display
    string like "500 g" or "2 cloves" - or the recipe's own free-text
    "variable_amount" (e.g. "to taste") when that's set instead of a
    numeric amount, matching how Grocy's own recipe view chooses between
    the two.
    """
    variable_amount = str(pos.get("variable_amount") or "").strip()
    if variable_amount:
        return variable_amount

    try:
        amount = float(pos.get("amount") or 0)
    except (TypeError, ValueError):
        amount = 0
    amount_str = str(int(amount)) if amount == int(amount) else str(amount)
    unit_name = (unit.get("name_plural") or unit.get("name")) if amount != 1 else unit.get("name")
    unit_name = str(unit_name or "").strip()
    return f"{amount_str} {unit_name}".strip()


# A recipe imported via family_hub/parse_recipe_url that had a published
# prep/cook time gets it baked into the created Grocy recipe's description
# as a "Prep: 15 min" / "Cook: 25 min" line (see the card's
# _createImportedGrocyRecipe) - the same place family_hub/create_grocy_recipe
# already stores the "Source:" link, since Grocy's own recipes table has no
# dedicated prep/cook time columns. These regexes pull them back out for the
# day editor's meal view-card; a recipe with neither line (hand-entered,
# pasted text, or a link whose page didn't publish either time) just has
# no prep_time/cook_time in the detail response, same as any other
# optional field here.
#
# When both are present they share one line - "Prep: 15 min &middot; Cook:
# 25 min" - and "&middot;" isn't inside a tag, so stopping only at "<" would
# let Prep's match swallow the separator and Cook's value along with it.
# Stopping at "&" too keeps each match to just its own value.
_RECIPE_PREP_TIME_RE = re.compile(r"<strong>Prep:</strong>\s*([^<&]+)", re.IGNORECASE)
_RECIPE_COOK_TIME_RE = re.compile(r"<strong>Cook:</strong>\s*([^<&]+)", re.IGNORECASE)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/get_grocy_recipe_detail",
        vol.Required("recipe_id"): vol.Coerce(int),
    }
)
@websocket_api.async_response
async def _ws_get_grocy_recipe_detail(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Fetch a single recipe's full detail - instructions and a resolved
    ingredients list - for the card's Recipe Viewer, so opening a
    Grocy-imported suggestion shows the recipe right there instead of
    sending someone to Grocy's own website. Grocy's website needs its own
    separate login (the API key only authorizes API calls, not a browser
    session), which is exactly the login-wall problem this exists to avoid.

    Ingredients live in Grocy's recipes_pos table as product_id/qu_id
    references rather than plain text, so this also fetches the full
    products and quantity_units lists once per call and resolves each
    ingredient locally - simpler and more robust than relying on Grocy's
    query-filter syntax for a "just these products" call, and small enough
    for a household-scale Grocy instance either way.

    Result shape is always `{"configured": bool, "recipe": {...}|None,
    "error"?: str}` - never a raised error - so the card can render a
    friendly state either way instead of a broken modal.
    """
    entry = _get_family_hub_entry(hass)
    url = (entry.options.get(CONF_GROCY_URL) if entry else "") or ""
    api_key = (entry.options.get(CONF_GROCY_API_KEY) if entry else "") or ""
    if not url or not api_key:
        connection.send_result(msg["id"], {"configured": False, "recipe": None})
        return

    recipe_id = msg["recipe_id"]
    session = async_get_clientsession(hass)
    try:
        recipe = await _grocy_api_get(session, url, api_key, f"/api/objects/recipes/{recipe_id}")
    except Exception as err:  # noqa: BLE001 - surface a friendly error, don't crash the dashboard
        connection.send_result(msg["id"], {"configured": True, "recipe": None, "error": str(err)})
        return

    if not isinstance(recipe, dict) or not recipe.get("name"):
        connection.send_result(
            msg["id"], {"configured": True, "recipe": None, "error": "Recipe not found in Grocy"}
        )
        return

    # Only fetch the rest once the recipe itself is confirmed to exist -
    # no point spending 3 more requests resolving ingredients for a recipe
    # that isn't there.
    try:
        positions = await _grocy_api_get(
            session, url, api_key, f"/api/objects/recipes_pos?query[]=recipe_id={recipe_id}"
        )
        products = await _grocy_api_get(session, url, api_key, "/api/objects/products")
        quantity_units = await _grocy_api_get(session, url, api_key, "/api/objects/quantity_units")
    except Exception as err:  # noqa: BLE001 - surface a friendly error, don't crash the dashboard
        connection.send_result(msg["id"], {"configured": True, "recipe": None, "error": str(err)})
        return

    products_by_id = {p["id"]: p for p in products if isinstance(p, dict) and "id" in p}
    units_by_id = {u["id"]: u for u in quantity_units if isinstance(u, dict) and "id" in u}

    ingredients = []
    for pos in positions if isinstance(positions, list) else []:
        if not isinstance(pos, dict):
            continue
        product = products_by_id.get(pos.get("product_id"), {})
        unit = units_by_id.get(pos.get("qu_id"), {})
        variable_amount = str(pos.get("variable_amount") or "").strip()
        amount_value = None
        if not variable_amount:
            try:
                amount_value = float(pos.get("amount") or 0)
            except (TypeError, ValueError):
                amount_value = 0.0
        ingredients.append({
            # Pre-formatted display string, unchanged from before this
            # feature - anything not aware of live scaling can keep using
            # this as-is.
            "amount": _format_grocy_ingredient_amount(pos, unit),
            "product": str(product.get("name") or "").strip(),
            "note": str(pos.get("note") or "").strip(),
            "group": str(pos.get("ingredient_group") or "").strip(),
            # Raw fields for the Recipe Viewer's live servings scaler
            # (task #173) to recompute "amount" client-side against a
            # different serving count - None/"" when there's nothing
            # numeric to scale (a free-text "to taste" style amount).
            "amount_value": amount_value,
            "unit_name": str(unit.get("name") or "").strip(),
            "unit_name_plural": str(unit.get("name_plural") or unit.get("name") or "").strip(),
            "variable_amount": variable_amount,
        })

    # The recipe's photo (see _ws_create_grocy_recipe's picture upload and
    # picture_file_name write) lives entirely inside Grocy's own file
    # storage, not anywhere in Home Assistant - fetch it back out and embed
    # it as a data URL so the card can show it without needing its own
    # authenticated route to Grocy's file API (which would mean handing the
    # Grocy API key to the browser). A missing/broken photo is non-fatal -
    # the rest of the recipe still renders, just without a header image.
    image_data_url = None
    picture_file_name = str(recipe.get("picture_file_name") or "").strip()
    if picture_file_name:
        try:
            image_bytes, content_type = await _grocy_api_get_file_bytes(
                session, url, api_key, "recipepictures", picture_file_name
            )
            # A generous but bounded cap - this gets base64-embedded in the
            # websocket response (~33% larger than the raw bytes), and a
            # household recipe photo has no business being multiple
            # megabytes in the first place.
            if len(image_bytes) <= 5 * 1024 * 1024:
                b64_image = base64.b64encode(image_bytes).decode()
                image_data_url = f"data:{content_type or 'image/jpeg'};base64,{b64_image}"
            else:
                _LOGGER.warning(
                    "Family Hub: recipe %s's photo (%s) is %d bytes, over the 5 MB "
                    "embed cap - not showing it in the card",
                    recipe_id, picture_file_name, len(image_bytes),
                )
        except Exception as err:  # noqa: BLE001 - non-fatal, see comment above -
            # but still worth a log line since this used to fail completely
            # silently, which made "why isn't my recipe photo showing up"
            # impossible to diagnose from the dashboard alone.
            _LOGGER.warning(
                "Family Hub: couldn't fetch recipe %s's photo (%s) from Grocy: %s",
                recipe_id, picture_file_name, err,
            )
            image_data_url = None

    servings = recipe.get("desired_servings") or recipe.get("base_servings") or 1
    try:
        base_servings = float(recipe.get("base_servings") or servings or 1)
    except (TypeError, ValueError):
        base_servings = 1.0
    if base_servings <= 0:
        base_servings = 1.0
    description_html = recipe.get("description") or ""
    prep_match = _RECIPE_PREP_TIME_RE.search(description_html)
    cook_match = _RECIPE_COOK_TIME_RE.search(description_html)
    prep_time = prep_match.group(1).strip() if prep_match else ""
    cook_time = cook_match.group(1).strip() if cook_match else ""
    # Only sum the two into a total when both are present AND both parse
    # cleanly back into minutes - if either is missing, or is text this
    # integration didn't write itself (hand-entered recipe, unusual
    # phrasing), showing a "total" would either be wrong or half-fabricated.
    # No total_time key at all in that case, same treatment as a missing
    # prep_time/cook_time - the Recipe Viewer just doesn't render that stat.
    total_time = ""
    if prep_time and cook_time:
        prep_minutes = _friendly_duration_to_minutes(prep_time)
        cook_minutes = _friendly_duration_to_minutes(cook_time)
        if prep_minutes is not None and cook_minutes is not None:
            total_time = _minutes_to_friendly_duration(prep_minutes + cook_minutes)
    detail = {
        "id": recipe_id,
        "name": str(recipe.get("name") or "").strip(),
        # Grocy stores this as HTML (already sanitized by Grocy's own
        # HTMLPurifier on save) - rendered directly in the card's viewer.
        "description": description_html,
        # Parsed back out of the description above (see the regexes' own
        # comment) - "" when this recipe has neither line.
        "prep_time": prep_time,
        "cook_time": cook_time,
        # Sum of the two above, only when both are present and parseable -
        # see the comment where this is computed. "" otherwise.
        "total_time": total_time,
        "servings": servings,
        # The serving count the ingredient amounts above are actually
        # calibrated for (Grocy's own "base_servings" on the recipe) - the
        # Recipe Viewer's live scaler (task #173) starts its stepper here
        # and multiplies each ingredient's amount_value by
        # (chosen_servings / base_servings). Deliberately separate from
        # "servings" above, which can reflect a previously-saved
        # desired_servings override instead of the recipe's true base.
        "base_servings": base_servings,
        "link": f"{url}/recipe/{recipe_id}",
        "ingredients": ingredients,
        "image": image_data_url,
    }
    connection.send_result(msg["id"], {"configured": True, "recipe": detail})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/delete_grocy_recipe",
        vol.Required("recipe_id"): vol.Coerce(int),
    }
)
@websocket_api.async_response
async def _ws_delete_grocy_recipe(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Delete a recipe from Grocy outright (DELETE /api/objects/recipes/{id})
    - the other half of Recipe Box deletion for a dish that was imported
    from Grocy (see the card's _deleteDish): removing just the recipe_box
    todo item would leave the recipe itself still sitting in Grocy, which
    is the actual data a household would expect "delete this recipe" to
    get rid of. A 404 (already gone - e.g. deleted directly in Grocy, or
    this is a second delete attempt after a partial failure) is treated as
    success rather than an error, since the end state either way is "this
    recipe doesn't exist in Grocy", which is what was asked for.
    """
    entry = _get_family_hub_entry(hass)
    url = (entry.options.get(CONF_GROCY_URL) if entry else "") or ""
    api_key = (entry.options.get(CONF_GROCY_API_KEY) if entry else "") or ""
    if not url or not api_key:
        connection.send_result(msg["id"], {"configured": False, "success": False})
        return

    session = async_get_clientsession(hass)
    try:
        await _grocy_api_delete(session, url, api_key, f"/api/objects/recipes/{msg['recipe_id']}")
    except Exception as err:  # noqa: BLE001
        if "HTTP 404" in str(err):
            connection.send_result(msg["id"], {"configured": True, "success": True})
            return
        connection.send_result(msg["id"], {"configured": True, "success": False, "error": str(err)})
        return
    connection.send_result(msg["id"], {"configured": True, "success": True})


async def _load_grocery_pushed_week(entry_data: dict, week_start: str) -> set[int]:
    """Return the set of Grocy recipe ids already pushed for this planning
    week (ISO date of that week's Sunday/Monday, whatever the card uses as
    its week key) - see GROCERY_PUSHED_STORAGE_KEY_PREFIX in const.py for
    why this is tracked at all instead of just re-calling Grocy's endpoint
    every time."""
    store: Store = entry_data["grocery_pushed_store"]
    data: dict = await store.async_load() or {}
    return set(data.get(week_start) or [])


async def _mark_grocery_pushed(entry_data: dict, week_start: str, recipe_ids) -> None:
    store: Store = entry_data["grocery_pushed_store"]
    data: dict = await store.async_load() or {}
    existing = set(data.get(week_start) or [])
    existing.update(recipe_ids)
    data[week_start] = sorted(existing)
    await store.async_save(data)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/get_grocery_list_status",
        vol.Required("week_start"): str,
        vol.Required("recipe_ids"): [vol.Coerce(int)],
    }
)
@websocket_api.async_response
async def _ws_get_grocery_list_status(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Report which of this week's distinct Grocy recipes have already had
    their ingredients pushed onto Grocy's shopping list, so the card can
    show "Added" vs "Not added yet" per meal before the person taps
    anything - see _openGroceryList in the JS."""
    entry_data = _get_family_hub_entry_data(hass)
    if entry_data is None:
        connection.send_error(msg["id"], "not_found", "Family Hub is not set up")
        return
    pushed = await _load_grocery_pushed_week(entry_data, msg["week_start"])
    connection.send_result(msg["id"], {"pushed_recipe_ids": sorted(pushed)})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/push_grocery_list",
        vol.Required("week_start"): str,
        vol.Required("recipe_ids"): [vol.Coerce(int)],
        vol.Optional("force", default=False): bool,
        vol.Optional("servings_overrides", default={}): dict,
    }
)
@websocket_api.async_response
async def _ws_push_grocery_list(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Push a batch of Grocy-sourced recipes' missing ingredients onto
    Grocy's own shopping list - one call per distinct recipe id to Grocy's
    own POST /api/recipes/{id}/add-not-fulfilled-products-to-shoppinglist
    (the same endpoint its own recipe page's "Put missing products on
    shopping list" button uses).

    Calls are made ONE AT A TIME, in order (not concurrently) - this
    matters, not just for tidiness: Grocy's own implementation computes how
    much of each ingredient to add as `missing_amount - amount_on_shopping_
    list` (see RecipesService::AddNotFulfilledProductsToShoppingList in
    Grocy's source), i.e. it already nets out whatever a *previous* call
    just added to the list. That only works correctly if each call sees the
    shopping list state left behind by the one before it, which concurrent/
    parallel calls could race. So when this week's plan has two different
    recipes that both need onions, calling them in sequence lets Grocy's own
    math combine that shared ingredient correctly - no quantity math is
    duplicated on this end.

    Recipes already pushed for this planning week (tracked in
    grocery_pushed_store, keyed by week_start) are skipped unless force is
    set - not primarily to prevent double-ordering (Grocy's own subtraction
    above makes a harmless no-op of most repeat calls), but because a
    recipe with its "don't check the shopping list" option enabled skips
    that subtraction entirely and WOULD double up on a repeat call, and
    either way there's no reason to make a redundant network round trip for
    a meal the person already shopped for. A recipe planned more than once
    in the same week (e.g. tacos twice) is still only pushed once, since
    Grocy's endpoint works off the recipe's own defined ingredient amounts,
    not a per-planned-instance multiplier - the card's status list says so
    explicitly rather than silently under-ordering.

    One recipe failing (e.g. it was deleted in Grocy since being planned)
    doesn't block the others - each gets its own success/error result so
    the card can report exactly what did and didn't make it onto the list.

    An optional "servings_overrides" map (recipe id -> desired servings, as
    sent by the card when a planned meal's own Servings field was set)
    updates the recipe's desired_servings in Grocy immediately before its
    push - Grocy computes every ingredient amount off desired_servings/
    base_servings (see recipes_pos_resolved), and that ratio lives on the
    recipe row itself rather than being a parameter of the shopping-list
    endpoint, so this is the only way to make "push to shopping list" match
    a headcount other than whatever the recipe's own desired_servings was
    last left at. That's a real, persistent edit to the recipe in Grocy
    (the same field its own recipe page's "servings" input edits) rather
    than a scoped-to-this-push value - matches how Grocy's own UI works,
    and means the household's usual headcount for a recipe just stays put
    until someone changes it again.
    """
    entry_data = _get_family_hub_entry_data(hass)
    entry = _get_family_hub_entry(hass)
    url = (entry.options.get(CONF_GROCY_URL) if entry else "") or ""
    api_key = (entry.options.get(CONF_GROCY_API_KEY) if entry else "") or ""
    if not url or not api_key:
        connection.send_result(msg["id"], {"configured": False, "results": []})
        return

    week_start = msg["week_start"]
    force = msg["force"]
    servings_overrides = msg["servings_overrides"]
    already_pushed = (
        set() if entry_data is None else await _load_grocery_pushed_week(entry_data, week_start)
    )

    session = async_get_clientsession(hass)
    results = []
    newly_pushed = []
    # Sequential on purpose - see the docstring above for why.
    for recipe_id in sorted(set(msg["recipe_ids"])):
        if not force and recipe_id in already_pushed:
            results.append({"recipe_id": recipe_id, "success": True, "skipped": True})
            continue
        desired_servings = servings_overrides.get(str(recipe_id))
        try:
            if desired_servings:
                await _grocy_api_put(
                    session, url, api_key, f"/api/objects/recipes/{recipe_id}", {"desired_servings": desired_servings}
                )
            await _grocy_api_post(
                session, url, api_key, f"/api/recipes/{recipe_id}/add-not-fulfilled-products-to-shoppinglist"
            )
            results.append({"recipe_id": recipe_id, "success": True, "skipped": False})
            newly_pushed.append(recipe_id)
        except Exception as err:  # noqa: BLE001 - one bad recipe must not block the rest
            results.append({"recipe_id": recipe_id, "success": False, "error": str(err)})

    if entry_data is not None and newly_pushed:
        await _mark_grocery_pushed(entry_data, week_start, newly_pushed)

    # Polish pass: Grocy just wrote each pushed recipe's missing ingredients
    # onto the shopping list in their own *stock* unit (see
    # _round_up_shopping_list_amounts_to_purchase_units's docstring) -
    # round those specific rows up into whatever unit each product is
    # actually bought in, so "3 cup" of flour becomes a plain "1 lb" to
    # shop with instead of a cooking measurement nobody buys in. Scoped to
    # only the products these recipes just touched (fetched per newly-
    # pushed recipe, one more sequential call each - consistent with the
    # rest of this handler already doing one call per recipe) - a recipe
    # that failed above never reaches this, and any of it failing outright
    # (fetching the recipe's own ingredients, or the rounding pass itself)
    # is swallowed rather than turning an otherwise-successful shopping-
    # list push into a reported failure.
    unit_adjustments = 0
    if newly_pushed:
        product_ids: set[int] = set()
        for recipe_id in newly_pushed:
            try:
                positions = await _grocy_api_get(
                    session, url, api_key, f"/api/objects/recipes_pos?query[]=recipe_id={recipe_id}"
                )
            except Exception:  # noqa: BLE001 - see comment above
                continue
            for pos in positions if isinstance(positions, list) else []:
                if isinstance(pos, dict) and pos.get("product_id"):
                    product_ids.add(pos["product_id"])
        if product_ids:
            unit_adjustments = await _round_up_shopping_list_amounts_to_purchase_units(
                session, url, api_key, product_ids
            )

    connection.send_result(
        msg["id"], {"configured": True, "results": results, "unit_adjustments": unit_adjustments}
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/consume_grocy_recipe",
        vol.Required("recipe_id"): vol.Coerce(int),
        vol.Optional("servings"): vol.Coerce(int),
    }
)
@websocket_api.async_response
async def _ws_consume_grocy_recipe(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """"I made this" button (Recipe Viewer) - calls Grocy's own POST
    /api/recipes/{id}/consume (RecipesApiController::Consume), which is a
    real stock transaction: it deducts every ingredient's recipes_pos
    amount from Grocy stock (whatever's actually in stock if a product is
    only partially available - it doesn't error out or roll back for a
    partial match), the exact same effect as clicking "Consume all
    ingredients needed" on the recipe's own page in Grocy. There's no
    "undo" here beyond manually re-adding stock in Grocy afterward, so this
    is meant to be a deliberate tap, not something fired automatically when
    a planned meal's day arrives.

    An optional "servings" (the Recipe Viewer's own scaler value, when it
    differs from the recipe's last-saved desired_servings) updates the
    recipe's desired_servings in Grocy immediately before consuming - same
    "persist it, then act" pattern _ws_push_grocery_list uses before its
    own add-not-fulfilled-products call, since Grocy computes every
    ingredient's needed amount off desired_servings/base_servings and that
    ratio lives on the recipe row itself, not as a parameter of /consume.
    """
    entry = _get_family_hub_entry(hass)
    url = (entry.options.get(CONF_GROCY_URL) if entry else "") or ""
    api_key = (entry.options.get(CONF_GROCY_API_KEY) if entry else "") or ""
    if not url or not api_key:
        connection.send_result(msg["id"], {"configured": False, "success": False})
        return

    recipe_id = msg["recipe_id"]
    servings = msg.get("servings")
    session = async_get_clientsession(hass)
    try:
        if servings:
            await _grocy_api_put(
                session, url, api_key, f"/api/objects/recipes/{recipe_id}", {"desired_servings": servings}
            )
        await _grocy_api_post(session, url, api_key, f"/api/recipes/{recipe_id}/consume")
    except Exception as err:  # noqa: BLE001 - surfaced to the card as a friendly error string
        connection.send_result(msg["id"], {"configured": True, "success": False, "error": str(err)})
        return
    connection.send_result(msg["id"], {"configured": True, "success": True})


def _format_shopping_list_amount(amount: float, qu: dict | None) -> str:
    """Turn a shopping_list row's amount + its resolved quantity_unit into a
    display string like "2 lbs" - same singular/plural + integer-trim
    convention as _format_grocy_ingredient_amount above, just without the
    recipe-position-specific "variable_amount" free-text case (the shopping
    list itself has no equivalent field)."""
    amount_str = str(int(amount)) if amount == int(amount) else str(amount)
    if not qu:
        return amount_str
    unit_name = (qu.get("name_plural") or qu.get("name")) if amount != 1 else qu.get("name")
    unit_name = str(unit_name or "").strip()
    return f"{amount_str} {unit_name}".strip()


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/get_grocy_shopping_list",
        vol.Optional("list_id", default=1): vol.Coerce(int),
    }
)
@websocket_api.async_response
async def _ws_get_grocy_shopping_list(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Fetch one of Grocy's shopping lists (list_id, default 1 - the same
    default list _ws_push_grocery_list adds recipe ingredients to) for the
    card's in-card Grocy Shopping List viewer, so seeing and adding to it
    doesn't require logging into Grocy's own separate website.

    Filtered server-side via Grocy's generic query-filter syntax
    (?query[]=shopping_list_id={list_id}, the same syntax already used
    elsewhere in this file for recipes_pos) rather than fetching every list
    and filtering client-side - Grocy already supports scoping the fetch,
    so there's no reason to pull other lists' items over the wire.

    Each raw shopping_list row is resolved against /api/objects/products and
    /api/objects/quantity_units into a display-ready name/amount, the same
    way the recipe-detail viewer resolves recipes_pos rows - a product-based
    item shows the product's name and a formatted "amount unit" (falling
    back to the product's own default purchase unit if the row itself has
    no qu_id set, matching Grocy's own shopping list display); a freetext
    item (no product_id - typed directly into Grocy's own "quick add" or via
    this card's own add-item field below) shows its note as the name with no
    unit.

    Also attaches a best-effort cost estimate per product-based row (via
    each distinct product's /api/stock/products/{id} `last_price`, Grocy's
    own last-purchase price) and an `estimated_total` summing whatever
    prices are actually known - Grocy doesn't track a currency, so this is
    shown as a bare number and the person's own currency is assumed. A
    product Grocy has never priced (no purchase history) is simply left out
    of the total rather than treated as free.

    Result shape is always `{"configured": bool, "items": [...],
    "estimated_total": float|None, "error"?: str}`, never a raised error,
    matching every other Grocy websocket handler in this file.
    """
    entry = _get_family_hub_entry(hass)
    url = (entry.options.get(CONF_GROCY_URL) if entry else "") or ""
    api_key = (entry.options.get(CONF_GROCY_API_KEY) if entry else "") or ""
    if not url or not api_key:
        connection.send_result(msg["id"], {"configured": False, "items": []})
        return

    list_id = msg.get("list_id", 1)
    session = async_get_clientsession(hass)
    try:
        rows = await _grocy_api_get(
            session, url, api_key, f"/api/objects/shopping_list?query[]=shopping_list_id={list_id}"
        )
        products = await _grocy_api_get(session, url, api_key, "/api/objects/products")
        units = await _grocy_api_get(session, url, api_key, "/api/objects/quantity_units")
    except Exception as err:  # noqa: BLE001 - surface a friendly error, don't crash the dashboard
        connection.send_result(msg["id"], {"configured": True, "items": [], "error": str(err)})
        return

    products_by_id = {p["id"]: p for p in (products if isinstance(products, list) else []) if isinstance(p, dict)}
    units_by_id = {u["id"]: u for u in (units if isinstance(units, list) else []) if isinstance(u, dict)}

    # Best-effort per-product price lookup - one call per distinct
    # product-based product on this list (small for a household-scale
    # list), each independently non-fatal: a product Grocy can't price
    # (never purchased, or the call fails) just has no estimated cost
    # rather than breaking the whole list.
    distinct_product_ids = {
        row.get("product_id")
        for row in (rows if isinstance(rows, list) else [])
        if isinstance(row, dict) and row.get("product_id")
    }
    prices_by_product_id: dict = {}
    for pid in distinct_product_ids:
        try:
            details = await _grocy_api_get(session, url, api_key, f"/api/stock/products/{pid}")
            raw_price = (details or {}).get("last_price") if isinstance(details, dict) else None
            prices_by_product_id[pid] = float(raw_price) if raw_price not in (None, "") else None
        except Exception:  # noqa: BLE001
            prices_by_product_id[pid] = None

    items = []
    estimated_total = 0.0
    has_any_price = False
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict):
            continue
        row_id = row.get("id")
        if row_id is None:
            continue
        try:
            amount = float(row.get("amount") or 0)
        except (TypeError, ValueError):
            amount = 0.0
        note = str(row.get("note") or "").strip()
        done = str(row.get("done") or "0") not in ("0", "", "None")
        product_id = row.get("product_id")
        if product_id:
            product = products_by_id.get(product_id) or {}
            name = str(product.get("name") or f"Product #{product_id}")
            qu_id = row.get("qu_id") or product.get("qu_id_purchase")
            qu = units_by_id.get(qu_id) if qu_id else None
            amount_display = _format_shopping_list_amount(amount, qu)
        else:
            name = note or "Item"
            amount_display = _format_shopping_list_amount(amount, None) if amount and amount != 1 else ""
        # default_best_before_days/location_id are the product's own default
        # shelf-life-in-days and default stock location, if set in Grocy -
        # used only to prefill the "Put Away" panel's date/location fields
        # for a product-based row (best-effort: left null/omitted rather
        # than erroring if a Grocy version ever renames/drops either field,
        # since these are convenience defaults, not required data).
        default_best_before_days = None
        default_location_id = None
        if product_id:
            product = products_by_id.get(product_id) or {}
            try:
                raw_days = product.get("default_best_before_days")
                default_best_before_days = int(raw_days) if raw_days not in (None, "") else None
            except (TypeError, ValueError):
                default_best_before_days = None
            default_location_id = product.get("location_id")
        # Estimated cost for this row - last-purchase price (per stock unit)
        # times the row's amount. Grocy relates "last_price" to the
        # product's stock quantity unit while a shopping list row's amount
        # is in the *purchase* unit, so for a product whose purchase and
        # stock units differ this is an approximation, not exact - it's a
        # ballpark shopping total, not an invoice, and is only ever shown
        # alongside a plain number with no currency (Grocy doesn't track
        # one), so a small unit mismatch is an acceptable tradeoff here.
        estimated_price = None
        if product_id:
            unit_price = prices_by_product_id.get(product_id)
            if unit_price is not None:
                estimated_price = round(unit_price * amount, 2)
                estimated_total += estimated_price
                has_any_price = True
        items.append(
            {
                "id": row_id,
                "product_id": product_id,
                "name": name,
                "amount": amount,
                "amount_display": amount_display,
                "note": note if product_id else "",
                "done": done,
                "default_best_before_days": default_best_before_days,
                "default_location_id": default_location_id,
                "estimated_price": estimated_price,
            }
        )

    items.sort(key=lambda it: (it["done"], it["name"].lower()))
    connection.send_result(
        msg["id"],
        {
            "configured": True,
            "items": items,
            "estimated_total": round(estimated_total, 2) if has_any_price else None,
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/add_grocy_shopping_list_item",
        vol.Required("text"): str,
        vol.Optional("amount", default=1): vol.Coerce(float),
        vol.Optional("list_id", default=1): vol.Coerce(int),
    }
)
@websocket_api.async_response
async def _ws_add_grocy_shopping_list_item(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Add one arbitrary item to Grocy's shopping list from the card's
    in-card viewer, without requiring the person to already know whether
    it's a tracked Grocy product.

    If the typed text case-insensitively matches an existing product's
    name exactly, it's added the "real" way via Grocy's own POST
    /api/stock/shoppinglist/add-product (StockService::AddProductToShopping
    List - merges into an existing entry for that product rather than
    duplicating it, same as Grocy's own UI); that convenience endpoint's
    body param is named `list_id`. Otherwise it's added as a plain
    freetext row (POST /api/objects/shopping_list with just a note -
    product_id/qu_id left unset), same as typing something Grocy doesn't
    know as a product directly into Grocy's own shopping list page; that's
    a raw object create, so its field for which list it belongs to is the
    actual DB column name, `shopping_list_id`, not `list_id`.
    """
    entry = _get_family_hub_entry(hass)
    url = (entry.options.get(CONF_GROCY_URL) if entry else "") or ""
    api_key = (entry.options.get(CONF_GROCY_API_KEY) if entry else "") or ""
    if not url or not api_key:
        connection.send_result(msg["id"], {"configured": False, "success": False})
        return

    text = msg["text"].strip()
    if not text:
        connection.send_result(msg["id"], {"configured": True, "success": False, "error": "No item text was given"})
        return
    amount = msg["amount"] or 1
    list_id = msg.get("list_id", 1)

    session = async_get_clientsession(hass)
    try:
        products = await _grocy_api_get(session, url, api_key, "/api/objects/products")
        matched_id = None
        for product in products if isinstance(products, list) else []:
            if isinstance(product, dict) and str(product.get("name") or "").strip().lower() == text.lower():
                matched_id = product.get("id")
                break

        if matched_id is not None:
            await _grocy_api_post(
                session,
                url,
                api_key,
                "/api/stock/shoppinglist/add-product",
                {"product_id": matched_id, "product_amount": amount, "list_id": list_id},
            )
        else:
            await _grocy_api_post(
                session,
                url,
                api_key,
                "/api/objects/shopping_list",
                {"note": text, "amount": amount, "shopping_list_id": list_id},
            )
    except Exception as err:  # noqa: BLE001
        connection.send_result(msg["id"], {"configured": True, "success": False, "error": str(err)})
        return

    connection.send_result(msg["id"], {"configured": True, "success": True, "matched_product": matched_id is not None})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/remove_grocy_shopping_list_item",
        vol.Required("item_id"): vol.Coerce(int),
    }
)
@websocket_api.async_response
async def _ws_remove_grocy_shopping_list_item(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Delete one row (product-based or freetext) from Grocy's shopping list
    outright - DELETE /api/objects/shopping_list/{id} - for the card's
    per-item remove button. A full delete rather than decrementing an
    amount, since the person is saying "take this off the list", not "I
    bought part of it"."""
    entry = _get_family_hub_entry(hass)
    url = (entry.options.get(CONF_GROCY_URL) if entry else "") or ""
    api_key = (entry.options.get(CONF_GROCY_API_KEY) if entry else "") or ""
    if not url or not api_key:
        connection.send_result(msg["id"], {"configured": False, "success": False})
        return

    session = async_get_clientsession(hass)
    try:
        await _grocy_api_delete(session, url, api_key, f"/api/objects/shopping_list/{msg['item_id']}")
    except Exception as err:  # noqa: BLE001
        connection.send_result(msg["id"], {"configured": True, "success": False, "error": str(err)})
        return
    connection.send_result(msg["id"], {"configured": True, "success": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/toggle_grocy_shopping_list_item",
        vol.Required("item_id"): vol.Coerce(int),
        vol.Required("done"): bool,
    }
)
@websocket_api.async_response
async def _ws_toggle_grocy_shopping_list_item(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Check/uncheck one shopping list item - PUT /api/objects/shopping_list/
    {id} with {"done": 0 or 1} - matching Grocy's own shopping list page,
    where checking an item off marks it done rather than deleting it (the
    row stays until Grocy's own "clear" action or this card's remove
    button removes it)."""
    entry = _get_family_hub_entry(hass)
    url = (entry.options.get(CONF_GROCY_URL) if entry else "") or ""
    api_key = (entry.options.get(CONF_GROCY_API_KEY) if entry else "") or ""
    if not url or not api_key:
        connection.send_result(msg["id"], {"configured": False, "success": False})
        return

    session = async_get_clientsession(hass)
    try:
        await _grocy_api_put(
            session,
            url,
            api_key,
            f"/api/objects/shopping_list/{msg['item_id']}",
            {"done": 1 if msg["done"] else 0},
        )
    except Exception as err:  # noqa: BLE001
        connection.send_result(msg["id"], {"configured": True, "success": False, "error": str(err)})
        return
    connection.send_result(msg["id"], {"configured": True, "success": True})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/get_grocy_shopping_lists"})
@websocket_api.async_response
async def _ws_get_grocy_shopping_lists(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """GET /api/objects/shopping_lists for the card's shopping-list picker -
    Grocy supports more than one named list (e.g. "Costco" vs. a regular
    grocery run), each with its own id used as `list_id` everywhere else in
    this file's shopping-list handlers. Sorted by id so the default list
    (id 1, always present in a fresh Grocy install) comes first."""
    entry = _get_family_hub_entry(hass)
    url = (entry.options.get(CONF_GROCY_URL) if entry else "") or ""
    api_key = (entry.options.get(CONF_GROCY_API_KEY) if entry else "") or ""
    if not url or not api_key:
        connection.send_result(msg["id"], {"configured": False, "lists": []})
        return

    session = async_get_clientsession(hass)
    try:
        rows = await _grocy_api_get(session, url, api_key, "/api/objects/shopping_lists")
    except Exception as err:  # noqa: BLE001
        connection.send_result(msg["id"], {"configured": True, "lists": [], "error": str(err)})
        return

    lists = [
        {"id": row.get("id"), "name": str(row.get("name") or f"List #{row.get('id')}")}
        for row in (rows if isinstance(rows, list) else [])
        if isinstance(row, dict) and row.get("id") is not None
    ]
    lists.sort(key=lambda lst: lst["id"])
    connection.send_result(msg["id"], {"configured": True, "lists": lists})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/create_grocy_shopping_list",
        vol.Required("name"): str,
    }
)
@websocket_api.async_response
async def _ws_create_grocy_shopping_list(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """POST /api/objects/shopping_lists - lets the card's shopping-list
    picker offer "+ New list" instead of only ever switching between lists
    that already exist in Grocy. Returns the new list's id so the card can
    immediately switch the picker to it, the same shape
    _ws_get_grocy_shopping_lists uses per-list ({"id", "name"})."""
    entry = _get_family_hub_entry(hass)
    url = (entry.options.get(CONF_GROCY_URL) if entry else "") or ""
    api_key = (entry.options.get(CONF_GROCY_API_KEY) if entry else "") or ""
    if not url or not api_key:
        connection.send_result(msg["id"], {"configured": False, "success": False})
        return

    name = msg["name"].strip()
    if not name:
        connection.send_result(msg["id"], {"configured": True, "success": False, "error": "Give the list a name first"})
        return

    session = async_get_clientsession(hass)
    try:
        result = await _grocy_api_post(session, url, api_key, "/api/objects/shopping_lists", {"name": name})
    except Exception as err:  # noqa: BLE001
        connection.send_result(msg["id"], {"configured": True, "success": False, "error": str(err)})
        return

    new_id = (result or {}).get("created_object_id") if isinstance(result, dict) else None
    try:
        new_id = int(new_id) if new_id is not None else None
    except (TypeError, ValueError):
        new_id = None
    connection.send_result(
        msg["id"],
        {"configured": True, "success": True, "list": {"id": new_id, "name": name}},
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/move_grocy_shopping_list_item",
        vol.Required("item_id"): vol.Coerce(int),
        vol.Required("list_id"): vol.Coerce(int),
    }
)
@websocket_api.async_response
async def _ws_move_grocy_shopping_list_item(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Move one row to a different shopping list - PUT
    /api/objects/shopping_list/{id} with just its shopping_list_id column
    changed. Grocy has no dedicated "move" endpoint; this is the same raw
    object PATCH-style update _ws_toggle_grocy_shopping_list_item already
    uses for {"done": ...}, just touching a different column, so an item's
    done/note/amount/product are all preserved untouched."""
    entry = _get_family_hub_entry(hass)
    url = (entry.options.get(CONF_GROCY_URL) if entry else "") or ""
    api_key = (entry.options.get(CONF_GROCY_API_KEY) if entry else "") or ""
    if not url or not api_key:
        connection.send_result(msg["id"], {"configured": False, "success": False})
        return

    session = async_get_clientsession(hass)
    try:
        await _grocy_api_put(
            session,
            url,
            api_key,
            f"/api/objects/shopping_list/{msg['item_id']}",
            {"shopping_list_id": msg["list_id"]},
        )
    except Exception as err:  # noqa: BLE001
        connection.send_result(msg["id"], {"configured": True, "success": False, "error": str(err)})
        return
    connection.send_result(msg["id"], {"configured": True, "success": True})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/get_grocy_locations"})
@websocket_api.async_response
async def _ws_get_grocy_locations(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """GET /api/objects/locations for the shopping list's "Put Away" panel
    location picker (e.g. Pantry, Fridge, Freezer - whatever locations
    exist in this Grocy instance)."""
    entry = _get_family_hub_entry(hass)
    url = (entry.options.get(CONF_GROCY_URL) if entry else "") or ""
    api_key = (entry.options.get(CONF_GROCY_API_KEY) if entry else "") or ""
    if not url or not api_key:
        connection.send_result(msg["id"], {"configured": False, "locations": []})
        return

    session = async_get_clientsession(hass)
    try:
        rows = await _grocy_api_get(session, url, api_key, "/api/objects/locations")
    except Exception as err:  # noqa: BLE001
        connection.send_result(msg["id"], {"configured": True, "locations": [], "error": str(err)})
        return

    locations = [
        {"id": row.get("id"), "name": str(row.get("name") or f"Location #{row.get('id')}")}
        for row in (rows if isinstance(rows, list) else [])
        if isinstance(row, dict) and row.get("id") is not None
    ]
    locations.sort(key=lambda loc: loc["name"].lower())
    connection.send_result(msg["id"], {"configured": True, "locations": locations})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/create_grocy_location",
        vol.Required("name"): str,
    }
)
@websocket_api.async_response
async def _ws_create_grocy_location(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """POST /api/objects/locations - lets a location picker (Put Away panel,
    or the recipe importer's "+ Add new product to Grocy" mini-form) offer
    "+ New location" for a household adding e.g. a garage freezer or a
    second pantry shelf, without a trip to Grocy's own admin UI first.
    Returns the new location's id/name in the same shape
    _ws_get_grocy_locations uses per-location, so the caller can select it
    immediately."""
    entry = _get_family_hub_entry(hass)
    url = (entry.options.get(CONF_GROCY_URL) if entry else "") or ""
    api_key = (entry.options.get(CONF_GROCY_API_KEY) if entry else "") or ""
    if not url or not api_key:
        connection.send_result(msg["id"], {"configured": False, "success": False})
        return

    name = msg["name"].strip()
    if not name:
        connection.send_result(msg["id"], {"configured": True, "success": False, "error": "Give the location a name first"})
        return

    session = async_get_clientsession(hass)
    try:
        result = await _grocy_api_post(session, url, api_key, "/api/objects/locations", {"name": name})
    except Exception as err:  # noqa: BLE001
        connection.send_result(msg["id"], {"configured": True, "success": False, "error": str(err)})
        return

    new_id = (result or {}).get("created_object_id") if isinstance(result, dict) else None
    try:
        new_id = int(new_id) if new_id is not None else None
    except (TypeError, ValueError):
        new_id = None
    connection.send_result(
        msg["id"],
        {"configured": True, "success": True, "location": {"id": new_id, "name": name}},
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/create_grocy_quantity_unit",
        vol.Required("name"): str,
        vol.Optional("name_plural"): str,
    }
)
@websocket_api.async_response
async def _ws_create_grocy_quantity_unit(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """POST /api/objects/quantity_units - lets a unit picker (the recipe
    importer's per-ingredient unit select, or its "+ Add new product to
    Grocy" mini-form's Stock/Purchase unit selects) offer "+ Add new
    unit…" for a household whose Grocy doesn't have e.g. "tablespoon" or
    "fl oz" yet, without a trip to Grocy's own admin UI first - same
    reasoning as _ws_create_grocy_location just above for locations.

    `name` is the only column Grocy actually requires (confirmed against
    Grocy's own migration SQL: quantity_units.name is NOT NULL with no
    default; name_plural was added later as a plain nullable column, and
    description/row_created_timestamp aren't touched here either) - a
    plural form is genuinely optional, Grocy's own display code falls back
    to the singular name wherever name_plural is empty, so this only sends
    it when someone actually typed one in.

    Returns the new unit's id/name in the same shape the review screen's
    own state.units list uses per-unit, so the caller can select it
    immediately without a full re-fetch."""
    entry = _get_family_hub_entry(hass)
    url = (entry.options.get(CONF_GROCY_URL) if entry else "") or ""
    api_key = (entry.options.get(CONF_GROCY_API_KEY) if entry else "") or ""
    if not url or not api_key:
        connection.send_result(msg["id"], {"configured": False, "success": False})
        return

    name = msg["name"].strip()
    if not name:
        connection.send_result(msg["id"], {"configured": True, "success": False, "error": "Give the unit a name first"})
        return
    name_plural = str(msg.get("name_plural") or "").strip()

    body = {"name": name}
    if name_plural:
        body["name_plural"] = name_plural

    session = async_get_clientsession(hass)
    try:
        result = await _grocy_api_post(session, url, api_key, "/api/objects/quantity_units", body)
    except Exception as err:  # noqa: BLE001
        connection.send_result(msg["id"], {"configured": True, "success": False, "error": str(err)})
        return

    new_id = (result or {}).get("created_object_id") if isinstance(result, dict) else None
    try:
        new_id = int(new_id) if new_id is not None else None
    except (TypeError, ValueError):
        new_id = None
    connection.send_result(
        msg["id"],
        {"configured": True, "success": True, "unit": {"id": new_id, "name": name}},
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/put_away_grocy_shopping_list_item",
        vol.Required("item_id"): vol.Coerce(int),
        vol.Required("product_id"): vol.Coerce(int),
        vol.Required("amount"): vol.Coerce(float),
        vol.Required("location_id"): vol.Coerce(int),
        vol.Optional("best_before_date"): str,
        vol.Optional("price"): vol.Coerce(float),
        vol.Optional("list_id", default=1): vol.Coerce(int),
    }
)
@websocket_api.async_response
async def _ws_put_away_grocy_shopping_list_item(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """The "Scan" / put-away flow: a shopping list item just carried home
    gets added into Grocy stock at a chosen location, expiration date, and
    optionally a purchase price - POST /api/stock/products/{id}/add
    (StockApiController::AddProduct, same endpoint Grocy's own
    barcode-scan-to-purchase flow uses, transaction_type "purchase";
    `price` there is the same per-stock-unit purchase price field Grocy's
    own UI records, which is what feeds the shopping list's own cost
    estimate and each product's `last_price` elsewhere in this file) -
    then taken off the shopping list the same way Grocy's own UI does when
    marking a shopping list item purchased: POST
    /api/stock/shoppinglist/remove-product
    (StockApiController::RemoveProductFromShoppingList), rather than
    deleting the row directly, so a partially-fulfilled amount decrements
    correctly instead of always removing the whole row.

    item_id isn't used in either Grocy call (product_id/amount from the
    shopping list row the card already has locally are what both need) -
    it's only carried in the message so a failure response can be matched
    back to the right row in the card's list.
    """
    entry = _get_family_hub_entry(hass)
    url = (entry.options.get(CONF_GROCY_URL) if entry else "") or ""
    api_key = (entry.options.get(CONF_GROCY_API_KEY) if entry else "") or ""
    if not url or not api_key:
        connection.send_result(msg["id"], {"configured": False, "success": False})
        return

    body: dict[str, Any] = {
        "amount": msg["amount"],
        "location_id": msg["location_id"],
        "transaction_type": "purchase",
    }
    best_before_date = str(msg.get("best_before_date") or "").strip()
    if best_before_date:
        body["best_before_date"] = best_before_date
    if msg.get("price") is not None:
        body["price"] = msg["price"]

    session = async_get_clientsession(hass)
    try:
        await _grocy_api_post(session, url, api_key, f"/api/stock/products/{msg['product_id']}/add", body)
        await _grocy_api_post(
            session,
            url,
            api_key,
            "/api/stock/shoppinglist/remove-product",
            {"product_id": msg["product_id"], "product_amount": msg["amount"], "list_id": msg.get("list_id", 1)},
        )
    except Exception as err:  # noqa: BLE001
        connection.send_result(msg["id"], {"configured": True, "success": False, "error": str(err)})
        return
    connection.send_result(msg["id"], {"configured": True, "success": True})


async def _fetch_grocy_expiring_stock(
    session: aiohttp.ClientSession, url: str, api_key: str, days: int = 30
) -> list[dict]:
    """Products currently in stock whose best_before_date falls within the
    next `days` days and hasn't passed yet - GET /api/stock/volatile?
    due_soon_days={days}, reading its `due_products` list.

    Verified against Grocy's own source (StockApiController::
    CurrentVolatileStock / StockService::GetDueProducts): due_products is
    built with $excludeOverdue=true, i.e. `WHERE best_before_date <=
    date('now', '+{days} days') AND best_before_date >= date()` - already
    excludes anything already overdue/expired, so this is exactly "expiring
    soon", not "already expired" (that's a separate due_type=2 list Grocy
    itself doesn't mix in here either).

    Used both for the card's in-card "Expiring Soon" list and the Daily
    Digest's expiring-item counts, so both always agree with each other.
    """
    data = await _grocy_api_get(session, url, api_key, f"/api/stock/volatile?due_soon_days={days}")
    rows = (data or {}).get("due_products") if isinstance(data, dict) else []
    today = dt_util.now().date()

    items = []
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict):
            continue
        best_before_raw = row.get("best_before_date")
        best_before = dt_util.parse_date(str(best_before_raw)) if best_before_raw else None
        if best_before is None:
            continue
        try:
            amount = float(row.get("amount") or 0)
        except (TypeError, ValueError):
            amount = 0.0
        product = row.get("product") or {}
        items.append(
            {
                "product_id": row.get("product_id"),
                "name": str(product.get("name") or f"Product #{row.get('product_id')}"),
                "amount": amount,
                "best_before_date": best_before.isoformat(),
                "days_until": (best_before - today).days,
            }
        )
    items.sort(key=lambda it: it["days_until"])
    return items


@websocket_api.websocket_command({vol.Required("type"): "family_hub/get_grocy_expiring_soon"})
@websocket_api.async_response
async def _ws_get_grocy_expiring_soon(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Powers the card's "Expiring Soon" list. Opt-in (CONF_GROCY_EXPIRING_
    ENABLED, off by default) - checked here rather than just leaving it to
    the card to decide whether to open this view, matching the file's
    established "always show the entry point, explain what's missing
    inside" pattern (see _ws_get_grocy_recipes and friends): the menu item
    is always there, this result's "enabled" flag is what the card uses to
    show a "turn this on in Settings" hint instead of the list.
    """
    entry = _get_family_hub_entry(hass)
    url = (entry.options.get(CONF_GROCY_URL) if entry else "") or ""
    api_key = (entry.options.get(CONF_GROCY_API_KEY) if entry else "") or ""
    enabled = bool(entry.options.get(CONF_GROCY_EXPIRING_ENABLED)) if entry else False
    if not url or not api_key:
        connection.send_result(msg["id"], {"configured": False, "enabled": enabled, "items": []})
        return
    if not enabled:
        connection.send_result(msg["id"], {"configured": True, "enabled": False, "items": []})
        return

    session = async_get_clientsession(hass)
    try:
        items = await _fetch_grocy_expiring_stock(session, url, api_key, days=30)
    except Exception as err:  # noqa: BLE001
        connection.send_result(msg["id"], {"configured": True, "enabled": True, "items": [], "error": str(err)})
        return

    # Recipe suggestions ("cook this before it goes bad") are a nice-to-have
    # layered on top - a failure here must not take down the list itself,
    # so every item just falls back to no suggestions rather than erroring.
    if items:
        try:
            product_ids = {it["product_id"] for it in items if it.get("product_id") is not None}
            suggestions = await _fetch_grocy_recipe_suggestions(session, url, api_key, product_ids)
            for it in items:
                it["recipes"] = suggestions.get(it.get("product_id"), [])
        except Exception as err:  # noqa: BLE001
            _LOGGER.debug("Family Hub: could not fetch recipe suggestions for expiring stock: %s", err)
            for it in items:
                it.setdefault("recipes", [])

    connection.send_result(msg["id"], {"configured": True, "enabled": True, "items": items})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/set_grocy_expiring_enabled",
        vol.Required("enabled"): bool,
        vol.Optional("digest_enabled", default=True): bool,
    }
)
@websocket_api.async_response
async def _ws_set_grocy_expiring_enabled(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Turn the opt-in "Expiring Soon" feature (card list) on/off, and
    independently whether it also contributes a line to the Daily Digest
    (digest_enabled - see CONF_GROCY_EXPIRING_DIGEST_ENABLED). Both stored
    in the config entry's options rather than the Settings Store, same
    reasoning as CONF_DAILY_DIGEST_ENABLED: the always-running Daily
    Digest poller needs to see these independent of anyone having the
    dashboard open."""
    entry = _get_family_hub_entry(hass)
    if entry is None:
        connection.send_error(msg["id"], "not_found", "Family Hub is not set up")
        return
    enabled = bool(msg["enabled"])
    digest_enabled = bool(msg.get("digest_enabled", True))
    new_options = {
        **entry.options,
        CONF_GROCY_EXPIRING_ENABLED: enabled,
        CONF_GROCY_EXPIRING_DIGEST_ENABLED: digest_enabled,
    }
    hass.config_entries.async_update_entry(entry, options=new_options)
    connection.send_result(msg["id"], {"enabled": enabled, "digest_enabled": digest_enabled})


async def _fetch_grocy_low_stock(session: aiohttp.ClientSession, url: str, api_key: str) -> list[dict]:
    """Products currently below their own "minimum stock amount" - the
    mirror of _fetch_grocy_expiring_stock, but for restocking rather than
    expiration. Same /api/stock/volatile endpoint (StockApiController::
    CurrentVolatileStock), reading its `missing_products` list this time
    instead of `due_products` - verified against Grocy's own source
    (StockService::GetMissingProducts, which selects from the
    `stock_missing_products` DB view and attaches the full product row as
    `.product` on each result). `due_soon_days` is irrelevant to this list
    (missing-stock status doesn't depend on it) so the default is used.

    Used both for the card's "Low Stock" list and the Daily Digest's
    restock count, so both always agree with each other - same reasoning
    as the expiring-stock helper.
    """
    data = await _grocy_api_get(session, url, api_key, "/api/stock/volatile")
    rows = (data or {}).get("missing_products") if isinstance(data, dict) else []

    items = []
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict):
            continue
        product_id = row.get("id")
        if product_id is None:
            continue
        try:
            amount_missing = float(row.get("amount_missing") or 0)
        except (TypeError, ValueError):
            amount_missing = 0.0
        product = row.get("product") or {}
        try:
            raw_min = product.get("min_stock_amount")
            min_stock_amount = float(raw_min) if raw_min not in (None, "") else None
        except (TypeError, ValueError):
            min_stock_amount = None
        items.append(
            {
                "product_id": product_id,
                "name": str(product.get("name") or f"Product #{product_id}"),
                "amount_missing": amount_missing,
                "min_stock_amount": min_stock_amount,
            }
        )
    items.sort(key=lambda it: it["name"].lower())
    return items


@websocket_api.websocket_command({vol.Required("type"): "family_hub/get_grocy_low_stock"})
@websocket_api.async_response
async def _ws_get_grocy_low_stock(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Powers the card's "Low Stock" list - the restock-focused mirror of
    _ws_get_grocy_expiring_soon, opt-in via CONF_GROCY_LOW_STOCK_ENABLED
    (off by default), same "always show the entry point, its own enabled
    flag decides what's shown inside" pattern."""
    entry = _get_family_hub_entry(hass)
    url = (entry.options.get(CONF_GROCY_URL) if entry else "") or ""
    api_key = (entry.options.get(CONF_GROCY_API_KEY) if entry else "") or ""
    enabled = bool(entry.options.get(CONF_GROCY_LOW_STOCK_ENABLED)) if entry else False
    if not url or not api_key:
        connection.send_result(msg["id"], {"configured": False, "enabled": enabled, "items": []})
        return
    if not enabled:
        connection.send_result(msg["id"], {"configured": True, "enabled": False, "items": []})
        return

    session = async_get_clientsession(hass)
    try:
        items = await _fetch_grocy_low_stock(session, url, api_key)
    except Exception as err:  # noqa: BLE001
        connection.send_result(msg["id"], {"configured": True, "enabled": True, "items": [], "error": str(err)})
        return
    connection.send_result(msg["id"], {"configured": True, "enabled": True, "items": items})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/set_grocy_low_stock_enabled",
        vol.Required("enabled"): bool,
        vol.Optional("digest_enabled", default=True): bool,
    }
)
@websocket_api.async_response
async def _ws_set_grocy_low_stock_enabled(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Turn the opt-in "Low Stock" feature (card list) on/off, and
    independently whether it also contributes a line to the Daily Digest
    (digest_enabled - see CONF_GROCY_LOW_STOCK_DIGEST_ENABLED) - stored in
    config entry options, same reasoning as
    CONF_GROCY_EXPIRING_ENABLED/CONF_DAILY_DIGEST_ENABLED."""
    entry = _get_family_hub_entry(hass)
    if entry is None:
        connection.send_error(msg["id"], "not_found", "Family Hub is not set up")
        return
    enabled = bool(msg["enabled"])
    digest_enabled = bool(msg.get("digest_enabled", True))
    new_options = {
        **entry.options,
        CONF_GROCY_LOW_STOCK_ENABLED: enabled,
        CONF_GROCY_LOW_STOCK_DIGEST_ENABLED: digest_enabled,
    }
    hass.config_entries.async_update_entry(entry, options=new_options)
    connection.send_result(msg["id"], {"enabled": enabled, "digest_enabled": digest_enabled})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/add_missing_grocy_products_to_shopping_list",
        vol.Optional("list_id", default=1): vol.Coerce(int),
    }
)
@websocket_api.async_response
async def _ws_add_missing_grocy_products_to_shopping_list(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """One-tap "add everything low to the shopping list" button on the Low
    Stock list - POST /api/stock/shoppinglist/add-missing-products
    (StockService::AddMissingProductsToShoppingList), Grocy's own native
    endpoint for exactly this (merges into an existing shopping list entry
    for a product rather than duplicating it, same as adding one product at
    a time)."""
    entry = _get_family_hub_entry(hass)
    url = (entry.options.get(CONF_GROCY_URL) if entry else "") or ""
    api_key = (entry.options.get(CONF_GROCY_API_KEY) if entry else "") or ""
    if not url or not api_key:
        connection.send_result(msg["id"], {"configured": False, "success": False})
        return

    session = async_get_clientsession(hass)
    try:
        await _grocy_api_post(
            session,
            url,
            api_key,
            "/api/stock/shoppinglist/add-missing-products",
            {"list_id": msg.get("list_id", 1)},
        )
    except Exception as err:  # noqa: BLE001
        connection.send_result(msg["id"], {"configured": True, "success": False, "error": str(err)})
        return
    connection.send_result(msg["id"], {"configured": True, "success": True})


async def _fetch_grocy_recipe_suggestions(
    session: aiohttp.ClientSession, url: str, api_key: str, product_ids: set
) -> dict:
    """For a set of product ids (e.g. everything currently expiring soon),
    find Grocy recipes that use them - a "cook this before it goes bad"
    nudge alongside the Expiring Soon list.

    Fetches the full recipes_pos table and recipes list once (not filtered
    per product - a household-scale Grocy instance has few enough recipes/
    ingredients that this is simpler and cheaper than one filtered query
    per expiring product) and builds product_id -> up to 2 recipes
    client-side, so it degrades to an empty list per product rather than
    erroring if either fetch fails.

    Returns `{}` (every product just gets no suggestions) rather than
    raising, on any failure - a nice-to-have nudge should never be able to
    break the Expiring Soon list itself.
    """
    try:
        positions = await _grocy_api_get(session, url, api_key, "/api/objects/recipes_pos")
        recipes = await _grocy_api_get(session, url, api_key, "/api/objects/recipes")
    except Exception:  # noqa: BLE001
        return {}

    recipes_by_id = {}
    for r in recipes if isinstance(recipes, list) else []:
        if not isinstance(r, dict):
            continue
        rid = r.get("id")
        name = str(r.get("name") or "").strip()
        if rid is None or not name:
            continue
        recipes_by_id[rid] = {"id": rid, "name": name, "link": f"{url}/recipe/{rid}"}

    suggestions: dict = {pid: [] for pid in product_ids}
    for pos in positions if isinstance(positions, list) else []:
        if not isinstance(pos, dict):
            continue
        pid = pos.get("product_id")
        if pid not in suggestions:
            continue
        recipe = recipes_by_id.get(pos.get("recipe_id"))
        if recipe is None:
            continue
        existing = suggestions[pid]
        if len(existing) >= 2 or any(r["id"] == recipe["id"] for r in existing):
            continue
        existing.append(recipe)
    return suggestions


# ---------------------------------------------------------------------------
# Web recipe importer: paste a link, pull out schema.org Recipe metadata
# (the structured JSON-LD data almost every recipe blog embeds for Google/
# Pinterest), fuzzy-match its ingredients against Grocy's existing products,
# and create the recipe in Grocy once the person confirms it. No AI involved
# - this only reads a well-established, widely-adopted metadata format that
# recipe sites already publish for search engines.
# ---------------------------------------------------------------------------


def _schema_text(value: Any) -> str:
    """Coerce a schema.org value that might be a plain string or an object
    with its own "name"/"text" field (e.g. an Organization as author, or a
    HowToStep) down to a plain string."""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        return str(value.get("text") or value.get("name") or "").strip()
    return ""


def _schema_image(value: Any) -> str:
    """schema.org "image" can be a plain URL string, an ImageObject dict
    with its own "url", or a list of either - just want one URL back."""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        return str(value.get("url") or "").strip()
    if isinstance(value, list) and value:
        return _schema_image(value[0])
    return ""


_ISO8601_DURATION_RE = re.compile(
    r"^P(?:(?P<days>\d+)D)?(?:T(?:(?P<hours>\d+)H)?(?:(?P<minutes>\d+)M)?(?:(?P<seconds>\d+)S)?)?$"
)


def _format_iso_duration(value: Any) -> str:
    """schema.org prepTime/cookTime are published as ISO 8601 durations
    (e.g. "PT15M", "PT1H30M", "P0DT2H") - turn one into a short, friendly
    string like "15 min" or "1 hr 30 min" for the day editor's meal card.

    Returns "" for anything missing, blank, or not a recognizable ISO 8601
    duration - a handful of sites publish plain text here instead (e.g.
    "15 minutes") and rather than guess at parsing arbitrary text, this
    quietly gives up and the field just doesn't show, same as a recipe
    with no prep/cook time published at all.
    """
    text = _schema_text(value)
    if not text:
        return ""
    match = _ISO8601_DURATION_RE.match(text.strip().upper())
    if not match:
        return ""
    days = int(match.group("days") or 0)
    hours = int(match.group("hours") or 0) + days * 24
    minutes = int(match.group("minutes") or 0)
    if not hours and not minutes:
        return ""
    parts = []
    if hours:
        parts.append(f"{hours} hr" if hours == 1 else f"{hours} hrs")
    if minutes:
        parts.append(f"{minutes} min")
    return " ".join(parts)


# Matches the two pieces _format_iso_duration can produce ("1 hr"/"2 hrs" and
# "30 min"), in either order and either alone or together - i.e. exactly the
# strings that function itself outputs. This is the reverse direction: given
# a friendly prep_time/cook_time string already on the recipe detail, recover
# the total minutes so a total_time can be summed and re-formatted. Anything
# that doesn't match this shape (hand-typed text, a unit the function never
# produces) is treated as unparseable rather than guessed at.
_FRIENDLY_DURATION_RE = re.compile(
    r"^\s*(?:(?P<hours>\d+)\s*hrs?)?\s*(?:(?P<minutes>\d+)\s*min)?\s*$",
    re.IGNORECASE,
)


def _friendly_duration_to_minutes(text: str) -> Optional[int]:
    """Reverse _format_iso_duration: turn "15 min" / "1 hr 30 min" / "2 hrs"
    back into a total minute count, or None if the text isn't in exactly
    that format. Used to sum prep_time + cook_time into a total_time without
    fabricating a number from text we can't confidently parse.
    """
    text = (text or "").strip()
    if not text:
        return None
    match = _FRIENDLY_DURATION_RE.match(text)
    if not match or not (match.group("hours") or match.group("minutes")):
        return None
    hours = int(match.group("hours") or 0)
    minutes = int(match.group("minutes") or 0)
    return hours * 60 + minutes


def _minutes_to_friendly_duration(total_minutes: int) -> str:
    """Format a total minute count the same way _format_iso_duration does,
    so total_time reads consistently with prep_time/cook_time."""
    if total_minutes <= 0:
        return ""
    hours, minutes = divmod(total_minutes, 60)
    parts = []
    if hours:
        parts.append(f"{hours} hr" if hours == 1 else f"{hours} hrs")
    if minutes:
        parts.append(f"{minutes} min")
    return " ".join(parts)


def _schema_instructions(value: Any) -> list[str]:
    """Flatten schema.org "recipeInstructions" into a plain list of step
    strings. Can be a single string (the whole method as one blob), a list
    of strings, a list of HowToStep objects (each with its own "text"), or
    a list of HowToSection objects that each nest their own steps under
    "itemListElement" - walked recursively so nested sections don't get
    lost or collapsed into one run-on step.
    """
    steps: list[str] = []

    def walk(v: Any) -> None:
        if isinstance(v, str):
            text = v.strip()
            if text:
                steps.append(text)
        elif isinstance(v, list):
            for item in v:
                walk(item)
        elif isinstance(v, dict):
            item_type = str(v.get("@type") or "").lower()
            if item_type == "howtosection":
                for item in v.get("itemListElement") or []:
                    walk(item)
            else:
                text = _schema_text(v)
                if text:
                    steps.append(text)

    walk(value)
    return steps


def _extract_json_ld_recipe(html: str) -> dict | None:
    """Find the first schema.org Recipe object embedded as JSON-LD in a
    page's <script type="application/ld+json"> tags.

    Handles the common shapes: a single Recipe object, a top-level array of
    objects (one of which is the Recipe), and a single object wrapping
    everything in "@graph" (also an array). @type itself can be a plain
    string or a list of strings, since a page can mark something as both
    e.g. "Recipe" and "NewsArticle".
    """
    for match in re.finditer(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        re.DOTALL | re.IGNORECASE,
    ):
        raw = match.group(1).strip()
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            continue
        candidates: list[Any] = []
        if isinstance(data, list):
            candidates.extend(data)
        elif isinstance(data, dict):
            graph = data.get("@graph")
            if isinstance(graph, list):
                candidates.extend(graph)
            else:
                candidates.append(data)
        for item in candidates:
            if not isinstance(item, dict):
                continue
            item_type = item.get("@type")
            types = item_type if isinstance(item_type, list) else [item_type]
            if any(str(t).strip().lower() == "recipe" for t in types if t):
                return item
    return None


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/parse_recipe_url",
        vol.Required("url"): str,
    }
)
@websocket_api.async_response
async def _ws_parse_recipe_url(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Fetch a recipe webpage and pull out its name/ingredients/instructions
    from schema.org Recipe metadata, for the card's "Import from a link"
    flow. Independent of Grocy being configured at all - this step just
    reads the page; Grocy only comes in at the ingredient-matching and
    create-recipe steps that follow.
    """
    url = str(msg["url"]).strip()
    if not url:
        connection.send_result(msg["id"], {"success": False, "error": "No URL given"})
        return

    session = async_get_clientsession(hass)
    try:
        async with session.get(
            url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; FamilyHub-RecipeImport/1.0)"},
            timeout=aiohttp.ClientTimeout(total=15),
            allow_redirects=True,
        ) as resp:
            if resp.status != 200:
                connection.send_result(msg["id"], {"success": False, "error": f"That page returned HTTP {resp.status}"})
                return
            html = await resp.text(errors="ignore")
    except Exception as err:  # noqa: BLE001 - any network failure becomes a friendly message
        connection.send_result(msg["id"], {"success": False, "error": f"Couldn't reach that page: {err}"})
        return

    recipe_data = _extract_json_ld_recipe(html)
    if not recipe_data:
        connection.send_result(
            msg["id"],
            {
                "success": False,
                "error": "Couldn't find recipe data on that page - it may not use the standard format most recipe sites include for Google/Pinterest. Try a different page, or enter the recipe by hand.",
            },
        )
        return

    ingredients_raw = recipe_data.get("recipeIngredient") or recipe_data.get("ingredients") or []
    if isinstance(ingredients_raw, str):
        ingredients_raw = [ingredients_raw]
    ingredients = [str(i).strip() for i in ingredients_raw if str(i).strip()]

    servings_raw = recipe_data.get("recipeYield") or recipe_data.get("yield")
    if isinstance(servings_raw, list) and servings_raw:
        servings_raw = servings_raw[0]
    servings = str(servings_raw).strip() if servings_raw is not None else ""

    connection.send_result(
        msg["id"],
        {
            "success": True,
            "recipe": {
                "name": _schema_text(recipe_data.get("name")) or "Imported Recipe",
                "ingredients": ingredients,
                "instructions": _schema_instructions(recipe_data.get("recipeInstructions")),
                "servings": servings,
                "image": _schema_image(recipe_data.get("image")),
                "source_url": url,
                "prep_time": _format_iso_duration(recipe_data.get("prepTime")),
                "cook_time": _format_iso_duration(recipe_data.get("cookTime")),
            },
        },
    )


_SERVINGS_TEXT_RE = re.compile(r"(?:serves|servings?)\s*:?\s*(\d+)", re.IGNORECASE)
_INGREDIENTS_HEADER_RE = re.compile(r"^ingredients\s*:?$", re.IGNORECASE)
_INSTRUCTIONS_HEADER_RE = re.compile(r"^(instructions|directions|method|steps|preparation)\s*:?$", re.IGNORECASE)
_TEXT_LEADING_BULLET_RE = re.compile(r"^\s*(?:[-*•]|\d+[\.\)])\s*")


def _parse_recipe_text(text: str) -> dict:
    """Best-effort split of a hand-pasted recipe (no structured schema.org
    metadata available the way parse_recipe_url gets from a page - this is
    plain text copied from an email, note, or group chat) into the same
    {name, ingredients, instructions, servings} shape.

    Looks for "Ingredients" and "Instructions" (or Directions/Method/
    Steps/Preparation) section headers on their own line - overwhelmingly
    the common way a recipe gets formatted, whether typed by hand or
    copy-pasted off a blog with the styling stripped out. The first
    substantive line before any recognized header becomes the name. A
    "Serves 4" / "Servings: 4" line is pulled out as servings wherever it
    appears, rather than only in a fixed position, since it shows up
    anywhere from right under the title to the very end.

    Deliberately simple (regex + section headers, no NLP) - if no
    "Ingredients" header is found at all, everything after the name just
    ends up in instructions with nothing in ingredients, which is still
    useful (a name plus one big editable block) rather than an outright
    failure. The review screen's editable name/ingredients/instructions
    fields (see _ws_match_recipe_ingredients and the card's "+ Add
    ingredient line") are there specifically to fix up whatever this
    heuristic gets wrong, the same way a manual pick is always the
    fallback for a bad ingredient-product fuzzy match.
    """
    name = ""
    servings = ""
    ingredients: list[str] = []
    instructions: list[str] = []
    section: str | None = None  # None | "ingredients" | "instructions"
    instruction_buffer: list[str] = []

    def flush_instruction() -> None:
        if instruction_buffer:
            instructions.append(" ".join(instruction_buffer).strip())
            instruction_buffer.clear()

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            # Flush on blank lines once we're past the title, whether
            # that's inside a real "Instructions:" section or the
            # no-header fallback below (both accumulate into the same
            # instruction_buffer) - a blank line never means anything
            # inside "Ingredients:" (each line is already its own item).
            if section != "ingredients" and name:
                flush_instruction()
            continue
        if _INGREDIENTS_HEADER_RE.match(line):
            section = "ingredients"
            continue
        if _INSTRUCTIONS_HEADER_RE.match(line):
            flush_instruction()
            section = "instructions"
            continue
        servings_match = _SERVINGS_TEXT_RE.search(line)
        if servings_match and not servings and len(line) <= len(servings_match.group(0)) + 12:
            # A standalone "Serves 4" / "Servings: 4" line - captured, not
            # also kept as part of the name/ingredients/instructions text.
            servings = servings_match.group(1)
            continue
        if section is None and not name:
            name = _TEXT_LEADING_BULLET_RE.sub("", line)
            continue
        # No "Ingredients:" header ever showed up (section still None,
        # past the title line) - treat the rest of the text as
        # instructions rather than silently dropping it, per the
        # fallback documented above. Handled with the exact same
        # bullet/continuation-line logic as an explicit "Instructions:"
        # section, just without a header having set `section` first.
        effective_section = section or "instructions"
        if effective_section == "ingredients":
            ingredients.append(_TEXT_LEADING_BULLET_RE.sub("", line))
        else:
            if _TEXT_LEADING_BULLET_RE.match(raw_line) or not instruction_buffer:
                flush_instruction()
                instruction_buffer.append(_TEXT_LEADING_BULLET_RE.sub("", line))
            else:
                # An unbulleted continuation line - almost always the same
                # step wrapped onto multiple lines by whatever it was
                # copied from, not a new step.
                instruction_buffer.append(line)
    flush_instruction()

    return {"name": name, "ingredients": ingredients, "instructions": instructions, "servings": servings}


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/parse_recipe_text",
        vol.Required("text"): str,
    }
)
@websocket_api.async_response
async def _ws_parse_recipe_text(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Best-effort parse of hand-pasted recipe text into the same shape
    family_hub/parse_recipe_url returns, feeding the exact same review/
    ingredient-matching screen the link-based import uses (see
    _parse_recipe_text above for the section-header heuristic). No network
    fetch involved - unlike the URL path, this can't fail on a bad
    connection or an unsupported page, it always succeeds with its best
    guess, even if that guess needs fixing up by hand afterward.
    """
    text = str(msg["text"])
    if not text.strip():
        connection.send_result(msg["id"], {"success": False, "error": "Paste some recipe text first."})
        return

    parsed = _parse_recipe_text(text)
    connection.send_result(
        msg["id"],
        {
            "success": True,
            "recipe": {
                "name": parsed["name"] or "Pasted Recipe",
                "ingredients": parsed["ingredients"],
                "instructions": parsed["instructions"],
                "servings": parsed["servings"],
                "image": "",
                "source_url": "",
            },
        },
    )


# Known unit words recognized when splitting a raw ingredient line like
# "2 cups all-purpose flour" into an amount/unit prefix and the remaining
# product text. Deliberately a plain lookup list, not anything smarter -
# anything not on this list (e.g. "2 large eggs") is treated as part of the
# product text instead of a misread unit, so it's never silently dropped.
_INGREDIENT_UNIT_WORDS = {
    "cups", "cup", "c", "tablespoons", "tablespoon", "tbsp", "tbsps",
    "teaspoons", "teaspoon", "tsp", "tsps", "ounces", "ounce", "oz",
    "pounds", "pound", "lbs", "lb", "grams", "gram", "g", "kilograms",
    "kilogram", "kg", "liters", "liter", "l", "milliliters", "milliliter",
    "ml", "pinch", "pinches", "cloves", "clove", "cans", "can", "packages",
    "package", "pkg", "slices", "slice", "pieces", "piece", "dozen", "dz",
}
_INGREDIENT_LEAD_RE = re.compile(
    r"^\s*(?P<amount>\d+\s+\d/\d|\d+/\d+|\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?)"
    r"\s*(?P<unit>[a-zA-Z]+)?\.?\s+(?P<rest>\S.*)$"
)


def _parse_ingredient_line(raw: str) -> dict:
    """Best-effort split of a raw ingredient line into an amount prefix, a
    recognized unit word (if any), and the remaining product text to
    fuzzy-match against Grocy's product list.

    Deliberately simple (plain regex + a fixed unit word list, no NLP) -
    gets the common "NUMBER UNIT product..." shape right and otherwise
    falls back to matching the whole line as the product text. The raw
    line is always kept alongside the split too, so a wrong guess here
    never loses information - see family_hub/create_grocy_recipe, which
    stores it as the recipe position's note either way.
    """
    text = raw.strip()
    match = _INGREDIENT_LEAD_RE.match(text)
    if not match:
        return {"amount_text": "", "unit_text": "", "product_text": text}
    unit = (match.group("unit") or "").strip().lower()
    rest = match.group("rest").strip()
    if unit and unit not in _INGREDIENT_UNIT_WORDS:
        # E.g. "2 large eggs" - "large" isn't a real unit, so it belongs
        # with the product text, not thrown away as a misread unit.
        return {"amount_text": match.group("amount").strip(), "unit_text": "", "product_text": f"{unit} {rest}".strip()}
    return {"amount_text": match.group("amount").strip(), "unit_text": unit, "product_text": rest}


_QUANTITY_FRACTION_MAP = {
    "¼": 0.25, "½": 0.5, "¾": 0.75,
    "⅓": 1 / 3, "⅔": 2 / 3,
    "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8,
    "⅙": 1 / 6, "⅚": 5 / 6,
    "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
}
_QUANTITY_MIXED_RE = re.compile(r"^(\d+)\s+(\d+)/(\d+)$")
_QUANTITY_FRACTION_RE = re.compile(r"^(\d+)/(\d+)$")
_QUANTITY_DECIMAL_FRACTION_RE = re.compile(
    r"^(\d+(?:\.\d+)?)?([¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])?$"
)


def _parse_quantity_token(token: str) -> float | None:
    """"1 1/2" / "1/2" / "1½" / "½" / "2" / "2.5" -> a plain float,
    the same conversion the card's own _parseQuantityToken does client-side
    for the Recipe Viewer's servings scaler - kept in sync deliberately so a
    quantity that scales cleanly there also gets a real numeric `amount` on
    import instead of being discarded as pure display text.

    Returns None for anything that isn't a single clean quantity - a range
    ("3-4"), no leading number at all ("a pinch of salt"), or blank input -
    so the caller knows to leave the ingredient's Grocy stock-math amount
    unset (via not_check_stock_fulfillment) rather than invent a number
    that isn't actually in the recipe.
    """
    token = (token or "").strip()
    if not token:
        return None
    match = _QUANTITY_MIXED_RE.match(token)
    if match:
        return int(match.group(1)) + int(match.group(2)) / int(match.group(3))
    match = _QUANTITY_FRACTION_RE.match(token)
    if match:
        return int(match.group(1)) / int(match.group(2))
    match = _QUANTITY_DECIMAL_FRACTION_RE.match(token)
    if match and (match.group(1) or match.group(2)):
        whole = float(match.group(1)) if match.group(1) else 0.0
        frac = _QUANTITY_FRACTION_MAP.get(match.group(2), 0.0) if match.group(2) else 0.0
        return whole + frac
    return None


def _has_grocy_unit_conversion(
    from_qu_id: int, to_qu_id: int, product_id: int | None, conversions: list[dict]
) -> bool:
    """Whether Grocy has a way to convert an ingredient's chosen unit into
    the amount its matched product is actually tracked in (qu_id_stock) -
    the thing recipes_pos_resolved needs in order to compute a real
    missing/consumed amount for /consume and the shopping-list push,
    exactly like Grocy's own recipe editor warns about when it can't do
    this math (see grocy/grocy#2545).

    Same unit on both sides never needs a lookup. Otherwise checks Grocy's
    quantity_unit_conversions table for a matching row, preferring one
    scoped to this exact product (an override) but also accepting one of
    Grocy's global default conversions (product_id is null, applying to
    every product). Checked in both directions, since a recipe published
    the same way Grocy's own "Add conversion" form stores it (one row per
    direction) either satisfies this - this is a best-effort presence
    check, not a guarantee Grocy will compute the resulting amount exactly
    as expected, since Grocy's own conversion math (and any tare-weight
    handling) isn't reimplemented here.
    """
    if from_qu_id == to_qu_id:
        return True
    for conv in conversions:
        if not isinstance(conv, dict):
            continue
        conv_product_id = conv.get("product_id")
        if conv_product_id is not None and int(conv_product_id) != int(product_id or -1):
            continue
        pair = {conv.get("from_qu_id"), conv.get("to_qu_id")}
        if pair == {from_qu_id, to_qu_id}:
            return True
    return False


def _resolve_grocy_unit_conversion_factor(
    from_qu_id: int, to_qu_id: int, product_id: int | None, conversions: list[dict]
) -> float | None:
    """The numeric factor to multiply an amount expressed in from_qu_id by,
    to get the equivalent amount in to_qu_id - unlike _has_grocy_unit_
    conversion above (which only answers yes/no), this is used where the
    actual converted number is needed (rounding a shopping-list amount up
    to a whole purchase unit).

    Confirmed against Grocy's own source (StockService::ConsumeProduct):
    a quantity_unit_conversions row's `factor` means "1 from_qu_id equals
    `factor` to_qu_id" - i.e. amount_in_to_qu = amount_in_from_qu * factor.
    Grocy's UI only ever writes one row per direction it's told about (see
    family_hub/create_grocy_product, which writes purchase->stock, never
    the reverse) so this also accepts the exact reverse row, dividing by
    its factor instead.

    A product-specific row (product_id set, matching this product) is
    preferred over a generic one (product_id null, applying to every
    product) when both exist for the same unit pair, since a product-
    specific conversion (e.g. "1 cup of THIS flour = 0.24 lb", a real
    density fact) is more trustworthy than a generic guess.
    """
    if from_qu_id == to_qu_id:
        return 1.0
    best: tuple[float, bool] | None = None
    for conv in conversions:
        if not isinstance(conv, dict):
            continue
        conv_product_id = conv.get("product_id")
        is_specific = conv_product_id is not None
        if is_specific and int(conv_product_id) != int(product_id or -1):
            continue
        try:
            factor = float(conv.get("factor"))
        except (TypeError, ValueError):
            continue
        if factor <= 0:
            continue
        c_from, c_to = conv.get("from_qu_id"), conv.get("to_qu_id")
        if c_from == from_qu_id and c_to == to_qu_id:
            candidate = factor
        elif c_from == to_qu_id and c_to == from_qu_id:
            candidate = 1.0 / factor
        else:
            continue
        if best is None or (is_specific and not best[1]):
            best = (candidate, is_specific)
    return best[0] if best else None


# Standard cooking-measurement conversions family_hub can compute itself,
# with no help from Grocy's own (household-configured) quantity_unit_
# conversions table at all - unlike a cup-to-grams conversion (which needs a
# real, product-specific density fact nobody but the household can supply),
# a cup-to-tablespoon conversion is a fixed, universal ratio true for every
# product, the same one printed on the back of every measuring cup set.
# Keyed by a normalized unit name (see _normalize_unit_name_for_conversion)
# to a (category, factor-to-that-category's base-unit) pair - two units only
# convert against each other when they share a category ("volume" or
# "weight"; deliberately no "count" category, since "package"/"can"/"each"
# carry no fixed real-world size at all). This is exactly the missing half
# of the fallback added for the Ham and Cheese Sliders household: their
# butter (cup) and Worcestershire sauce (teaspoon) both had a real,
# computable conversion to their product's own stock unit (tablespoon) that
# nobody had to type into Grocy by hand for it to be correct.
_STANDARD_UNIT_CONVERSIONS = {
    # Volume, base unit = milliliter.
    "teaspoon": ("volume", 4.92892),
    "tablespoon": ("volume", 14.7868),
    "fluid ounce": ("volume", 29.5735),
    "cup": ("volume", 236.588),
    "pint": ("volume", 473.176),
    "quart": ("volume", 946.353),
    "gallon": ("volume", 3785.41),
    "milliliter": ("volume", 1.0),
    "liter": ("volume", 1000.0),
    # Weight, base unit = gram.
    "ounce": ("weight", 28.3495),
    "pound": ("weight", 453.592),
    "gram": ("weight", 1.0),
    "kilogram": ("weight", 1000.0),
    # Count - "dozen" is the one count word with a fixed, universal size
    # (always 12), so it's the one exception to the no-count-category rule
    # above; "each"/"piece" are the natural thing a dozen of something is a
    # dozen of.
    "dozen": ("count", 12.0),
    "each": ("count", 1.0),
    "piece": ("count", 1.0),
}
# Maps common abbreviations/spellings/plurals seen in both recipe text and
# a household's own Grocy unit names onto the canonical names used as keys
# in _STANDARD_UNIT_CONVERSIONS above.
_UNIT_NAME_ALIASES = {
    "tsp": "teaspoon", "tsps": "teaspoon", "t": "teaspoon", "teaspoons": "teaspoon",
    "tbsp": "tablespoon", "tbsps": "tablespoon", "tbs": "tablespoon", "T": "tablespoon", "tablespoons": "tablespoon",
    "fl oz": "fluid ounce", "fl. oz.": "fluid ounce", "fluid ounces": "fluid ounce",
    "c": "cup", "cups": "cup",
    "pt": "pint", "pints": "pint",
    "qt": "quart", "quarts": "quart",
    "gal": "gallon", "gallons": "gallon",
    "ml": "milliliter", "milliliters": "milliliter", "millilitre": "milliliter", "millilitres": "milliliter",
    "l": "liter", "liters": "liter", "litre": "liter", "litres": "liter",
    "oz": "ounce", "ounces": "ounce",
    "lb": "pound", "lbs": "pound", "pounds": "pound",
    "g": "gram", "grams": "gram",
    "kg": "kilogram", "kilograms": "kilogram",
    "dz": "dozen", "doz": "dozen", "dozens": "dozen",
    "ea": "each", "eaches": "each",
    "pieces": "piece", "pcs": "piece", "pc": "piece",
}


def _normalize_unit_name_for_conversion(name: str) -> str:
    """Turns a Grocy quantity unit's own "name" field (whatever a household
    happened to type in when they set it up - "Tbsp", "TABLESPOON",
    "tablespoons") into the canonical key used in _STANDARD_UNIT_CONVERSIONS,
    so a match isn't missed purely over capitalization or an abbreviation."""
    key = (name or "").strip().lower()
    return _UNIT_NAME_ALIASES.get(key, key)


def _resolve_standard_unit_conversion_factor(from_name: str, to_name: str) -> float | None:
    """The factor to multiply an amount in from_name's unit by to get the
    equivalent amount in to_name's unit, using nothing but fixed,
    universal cooking-measurement ratios (see _STANDARD_UNIT_CONVERSIONS) -
    no Grocy configuration, and no product-specific data, required.

    Only two units in the same category (both volume, or both weight, or
    both a fixed-size count) ever resolve to a factor; a cup of flour to
    grams of flour needs a real density fact this can't supply, so that
    combination (and any other cross-category pair) deliberately returns
    None rather than guess.
    """
    from_key = _normalize_unit_name_for_conversion(from_name)
    to_key = _normalize_unit_name_for_conversion(to_name)
    from_entry = _STANDARD_UNIT_CONVERSIONS.get(from_key)
    to_entry = _STANDARD_UNIT_CONVERSIONS.get(to_key)
    if not from_entry or not to_entry:
        return None
    from_category, from_factor = from_entry
    to_category, to_factor = to_entry
    if from_category != to_category:
        return None
    return from_factor / to_factor


def _standard_unit_conversion_pairs() -> list[tuple[str, str, float]]:
    """Every DIRECT pairwise combination of family_hub's own standard
    English/metric units within the same measurement category - teaspoon to
    tablespoon, teaspoon to cup, teaspoon to gallon, tablespoon to cup, and
    so on for every volume pair, plus every weight pair (ounce/pound/gram/
    kilogram) - each with the correct from-to factor.

    Deliberately every combination, not just adjacent ones (teaspoon-to-
    tablespoon, tablespoon-to-cup, ...): neither Grocy's own
    quantity_unit_conversions lookups nor family_hub's own
    _has_grocy_unit_conversion/_resolve_grocy_unit_conversion_factor chain
    multiple hops together, so a recipe measured in teaspoons against a
    product stocked in gallons needs its OWN direct row - it won't be
    inferred by combining a teaspoon-to-cup row with a cup-to-gallon row.
    The "count" category (dozen/each/piece) is deliberately excluded here -
    it's a fine, honest fallback for family_hub's own recipe-import math
    (_resolve_standard_unit_conversion_factor), but a "dozen = 12 each" row
    isn't really an English/metric measurement conversion in the sense a
    household would expect to see sitting in their own Grocy setup, so it's
    not something this pushes into their instance.
    """
    pairs: list[tuple[str, str, float]] = []
    measurement_units = {
        name: entry for name, entry in _STANDARD_UNIT_CONVERSIONS.items() if entry[0] in ("volume", "weight")
    }
    for (name_a, (category_a, factor_a)), (name_b, (category_b, factor_b)) in itertools.combinations(
        measurement_units.items(), 2
    ):
        if category_a != category_b:
            continue
        pairs.append((name_a, name_b, factor_a / factor_b))
    return pairs


async def _sync_standard_unit_conversions(session, url: str, api_key: str) -> dict:
    """Ensure this household's own Grocy instance has a real, direct,
    global quantity_unit_conversions row for every standard English/metric
    unit pair it actually has units for (see _standard_unit_conversion_pairs)
    - not just relying on family_hub's own recipe importer to compute these
    on the fly, since Grocy's OWN stock/shopping-list/recipe math (outside
    anything family_hub touches directly) needs these same conversions to
    exist in Grocy itself to work correctly too.

    Only ever touches GLOBAL conversions (product_id left null - Grocy's own
    "applies to every product" row) - a product-specific override (a real
    density fact like "1 cup of THIS flour = 120 g") is never read, added,
    or changed here, regardless of whether it happens to match or conflict
    with the standard ratio for that unit pair; that's real household data
    this has no business touching.

    A household's own two Grocy units are only ever matched by NAME (via
    _normalize_unit_name_for_conversion) - never invented. A household with
    no "gallon" unit at all in their Grocy simply never gets gallon rows
    added; this never creates new quantity_units, only conversions between
    ones that already exist. If two of a household's own units happen to
    normalize to the same canonical name (e.g. they have both "Tbsp" and
    "tablespoon" as separate real Grocy units - a genuinely ambiguous setup
    this has no safe way to resolve), that canonical name is skipped
    entirely rather than guessing which one was meant.

    Best-effort and non-fatal throughout - any failure fetching Grocy's own
    data, or POSTing/PUTing any single row, is caught and counted rather
    than raised, since this is a background reconciliation pass that must
    never be allowed to block integration startup or take down anything
    else. Returns a summary dict for logging: added/fixed/skipped counts
    and the list of ambiguous unit names (if any) that were skipped.
    """
    summary = {"checked": 0, "added": 0, "fixed": 0, "unchanged": 0, "errors": 0, "ambiguous_units": []}
    try:
        units = await _grocy_api_get(session, url, api_key, "/api/objects/quantity_units")
        conversions = await _grocy_api_get(session, url, api_key, "/api/objects/quantity_unit_conversions")
    except Exception:  # noqa: BLE001 - see docstring, this must never block integration startup
        summary["errors"] += 1
        return summary

    unit_rows = [u for u in units if isinstance(u, dict) and "id" in u] if isinstance(units, list) else []
    canonical_to_id: dict[str, int] = {}
    ambiguous: set[str] = set()
    for u in unit_rows:
        canonical = _normalize_unit_name_for_conversion(u.get("name", ""))
        if canonical not in _STANDARD_UNIT_CONVERSIONS:
            continue
        if canonical in canonical_to_id and canonical_to_id[canonical] != u["id"]:
            ambiguous.add(canonical)
            continue
        canonical_to_id[canonical] = u["id"]
    for name in ambiguous:
        canonical_to_id.pop(name, None)
    summary["ambiguous_units"] = sorted(ambiguous)

    global_rows = [
        c for c in conversions if isinstance(c, dict) and c.get("product_id") is None
    ] if isinstance(conversions, list) else []
    # Keyed by the unordered pair of ids, since a conversion row could have
    # been entered in either direction (Grocy doesn't care which side is
    # "from" - see _resolve_grocy_unit_conversion_factor's own handling of
    # this same thing).
    global_rows_by_pair: dict[frozenset, dict] = {}
    for row in global_rows:
        from_id, to_id = row.get("from_qu_id"), row.get("to_qu_id")
        if from_id is None or to_id is None:
            continue
        global_rows_by_pair[frozenset((from_id, to_id))] = row

    for name_a, name_b, factor_a_to_b in _standard_unit_conversion_pairs():
        id_a = canonical_to_id.get(name_a)
        id_b = canonical_to_id.get(name_b)
        if id_a is None or id_b is None or id_a == id_b:
            continue
        summary["checked"] += 1
        existing = global_rows_by_pair.get(frozenset((id_a, id_b)))
        if existing is None:
            try:
                await _grocy_api_post(
                    session,
                    url,
                    api_key,
                    "/api/objects/quantity_unit_conversions",
                    {"from_qu_id": id_a, "to_qu_id": id_b, "factor": factor_a_to_b},
                )
                summary["added"] += 1
            except Exception:  # noqa: BLE001 - one bad pair must not abort the rest
                summary["errors"] += 1
            continue
        # The row could have been written in either direction - the factor
        # it should hold depends on which side its own from_qu_id lands on.
        expected_factor = factor_a_to_b if existing.get("from_qu_id") == id_a else (1 / factor_a_to_b)
        try:
            stored_factor = float(existing.get("factor"))
        except (TypeError, ValueError):
            stored_factor = None
        # A relative tolerance (not an absolute one) since these range from
        # tiny (teaspoon->gallon is a factor of ~0.00065) to large (the
        # reverse), and household-entered rows are sometimes rounded by
        # hand (e.g. "16" instead of "16.0000006").
        if stored_factor is not None and expected_factor and abs(stored_factor - expected_factor) / abs(expected_factor) < 0.005:
            summary["unchanged"] += 1
            continue
        try:
            await _grocy_api_put(
                session,
                url,
                api_key,
                f"/api/objects/quantity_unit_conversions/{existing.get('id')}",
                {"factor": expected_factor},
            )
            summary["fixed"] += 1
        except Exception:  # noqa: BLE001 - one bad pair must not abort the rest
            summary["errors"] += 1

    return summary


async def _maybe_sync_standard_unit_conversions(
    hass: HomeAssistant, entry: ConfigEntry, store: Store
) -> None:
    """Runs family_hub's standard-unit-conversion sync against this
    household's Grocy once per _STANDARD_UNIT_CONVERSIONS "generation" (see
    GROCY_CONVERSIONS_SYNC_GENERATION's own docstring in const.py) - called
    from async_setup_entry, but scheduled as its own background task (see
    hass.async_create_task at the call site) so a slow or unreachable Grocy
    can never delay the rest of the integration's own startup.

    The generation marker is only advanced on a clean run (no errors at
    all) - a run that hit any POST/PUT failures (a flaky connection, Grocy
    mid-restart) is left to retry again on the next Home Assistant restart
    rather than being marked done and silently leaving some pairs unfixed
    until the next code change happens to bump the generation number again.
    """
    url = entry.options.get(CONF_GROCY_URL) or ""
    api_key = entry.options.get(CONF_GROCY_API_KEY) or ""
    if not url or not api_key:
        return
    state = await store.async_load() or {}
    if state.get("generation") == GROCY_CONVERSIONS_SYNC_GENERATION:
        return
    session = async_get_clientsession(hass)
    summary = await _sync_standard_unit_conversions(session, url, api_key)
    if summary["errors"]:
        _LOGGER.warning(
            "Family Hub: standard unit conversion sync to Grocy hit %d error(s) (added %d, fixed %d) - will retry next restart",
            summary["errors"],
            summary["added"],
            summary["fixed"],
        )
        return
    if summary["added"] or summary["fixed"]:
        _LOGGER.info(
            "Family Hub: synced standard unit conversions to Grocy (added %d, fixed %d, already correct %d)",
            summary["added"],
            summary["fixed"],
            summary["unchanged"],
        )
    if summary["ambiguous_units"]:
        _LOGGER.warning(
            "Family Hub: skipped standard unit conversions for ambiguous Grocy unit name(s) matching more than one of your own units: %s",
            ", ".join(summary["ambiguous_units"]),
        )
    await store.async_save({"generation": GROCY_CONVERSIONS_SYNC_GENERATION})


async def _round_up_shopping_list_amounts_to_purchase_units(
    session, url: str, api_key: str, product_ids: set[int], list_id: int = 1
) -> int:
    """After Grocy's own add-not-fulfilled-products-to-shoppinglist writes
    shopping-list rows for a recipe's missing ingredients, those rows come
    out in the ingredient's own *stock* unit (e.g. "3 cup" of flour), not
    however that product is actually bought (a 5 lb bag) - confirmed
    against grocy/grocy#1615, which reports exactly this for this same
    endpoint, with no automatic rounding to a purchase-container size.

    This runs right after that push and, for any shopping-list row on a
    product in `product_ids` (i.e. one this push just touched - existing
    rows for other products, added some other way, are left untouched on
    purpose) whose unit doesn't already match that product's own purchase
    unit (qu_id_purchase), converts the amount into the purchase unit (via
    Grocy's own quantity_unit_conversions - see
    _resolve_grocy_unit_conversion_factor) and rounds UP to a whole number
    of it - "3 cups" of flour with a real cup-to-pound conversion set on
    the product becomes a plain whole number of pounds to actually buy at
    the store, not a fraction of a bag or a unit nobody shops in.

    Best-effort throughout: a row on a product with no purchase-unit
    conversion set up in Grocy yet is left exactly as Grocy wrote it (same
    as before this existed), and any failure fetching data or updating one
    row is swallowed rather than raised - this is a nice-to-have polish
    pass on top of an already-successful shopping-list push, never
    something that push's own success/failure should hinge on. Returns how
    many rows were actually adjusted, for a one-line status note.
    """
    try:
        rows = await _grocy_api_get(
            session, url, api_key, f"/api/objects/shopping_list?query[]=shopping_list_id={list_id}"
        )
        products = await _grocy_api_get(session, url, api_key, "/api/objects/products")
        conversions = await _grocy_api_get(session, url, api_key, "/api/objects/quantity_unit_conversions")
    except Exception:  # noqa: BLE001 - see docstring, never blocks the push itself
        return 0

    products_by_id = (
        {p["id"]: p for p in products if isinstance(p, dict) and "id" in p} if isinstance(products, list) else {}
    )
    conversion_rows = [c for c in conversions if isinstance(c, dict)] if isinstance(conversions, list) else []

    adjusted = 0
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict):
            continue
        product_id = row.get("product_id")
        if product_id not in product_ids:
            continue
        product = products_by_id.get(product_id)
        if not product:
            continue
        purchase_qu_id = product.get("qu_id_purchase") or product.get("qu_id_stock")
        current_qu_id = row.get("qu_id") or product.get("qu_id_stock")
        if not purchase_qu_id or not current_qu_id or current_qu_id == purchase_qu_id:
            continue
        try:
            current_amount = float(row.get("amount") or 0)
        except (TypeError, ValueError):
            continue
        if current_amount <= 0:
            continue
        factor = _resolve_grocy_unit_conversion_factor(current_qu_id, purchase_qu_id, product_id, conversion_rows)
        if not factor:
            continue
        # round() first to absorb float noise (e.g. 2.0000000002) before
        # ceil - otherwise an amount that converts to a clean whole number
        # could get bumped up an extra, unwanted unit.
        new_amount = math.ceil(round(current_amount * factor, 6))
        if new_amount <= 0 or row.get("id") is None:
            continue
        try:
            await _grocy_api_put(
                session,
                url,
                api_key,
                f"/api/objects/shopping_list/{row['id']}",
                {"amount": new_amount, "qu_id": purchase_qu_id},
            )
            adjusted += 1
        except Exception:  # noqa: BLE001 - one row failing to convert shouldn't block the rest
            continue
    return adjusted


def _best_text_match(query: str, candidates: list[tuple[int, str]], cutoff: float = 0.5):
    """Plain case-insensitive text-similarity match (stdlib difflib, no
    extra dependency) of `query` against a list of (id, name) candidates.
    Returns (id, name, score) for the best match at or above `cutoff`, or
    None. Intentionally simple - a manual picker in the card's review
    screen is the fallback for anything this gets wrong.
    """
    query_lower = query.strip().lower()
    if not query_lower:
        return None
    best = None
    for candidate_id, name in candidates:
        score = difflib.SequenceMatcher(None, query_lower, (name or "").strip().lower()).ratio()
        if best is None or score > best[2]:
            best = (candidate_id, name, score)
    if best and best[2] >= cutoff:
        return best
    return None


_GROCERY_REFERENCE_CANDIDATES: list[tuple[int, str]] | None = None

# Words real recipes routinely wrap around the actual grocery item -
# prep/cut instructions ("diced", "minced"), doneness/state ("cooked",
# softened"), quantity leftovers that leaked past _parse_ingredient_line
# (a unit word, or "to" from an unparsed "18 to 24" range), and filler -
# that say nothing about what to buy at the store and otherwise sink an
# otherwise-good match. E.g. "diced sweet onion, (roughly one large onion)"
# scores under 0.2 against "onion" as a whole string; stripped down to its
# real content words it matches cleanly. Deliberately a plain word list,
# not stemming/NLP - same "simple over clever" approach as the rest of
# this file's matching code, and it only ever affects the *suggestion*
# shown for an ingredient with no real Grocy match yet, never a real
# household product match.
_INGREDIENT_DESCRIPTOR_WORDS = _INGREDIENT_UNIT_WORDS | {
    "diced", "chopped", "minced", "sliced", "shredded", "grated", "crushed",
    "cubed", "julienned", "peeled", "seeded", "cored", "trimmed", "torn",
    "melted", "softened", "room", "temperature", "cooked", "raw", "fresh",
    "frozen", "dried", "canned", "large", "medium", "small", "extra",
    "ripe", "ground", "boneless", "skinless", "lean", "coarse", "coarsely",
    "fine", "finely", "roughly", "thinly", "thickly", "kosher", "table",
    "packed", "divided", "optional", "into", "pieces", "cubes", "strips",
    "wedges", "halves", "quarters", "cloves", "clove", "plus", "more",
    "taste", "to", "for", "a", "an", "the", "of", "and", "or", "with",
    "such", "as", "one", "about", "approximately", "each",
}


def _strip_ingredient_asides(text: str) -> str:
    """Strips just the structural noise real recipes wrap around a
    grocery item: a parenthetical aside ("(thinly sliced)",
    "(roughly one large onion)") and everything after the first comma
    (usually a prep note, e.g. "onion, diced"). Deliberately does NOT
    also drop individual descriptor words like _clean_ingredient_
    reference_text below does for the reference-suggestion matcher -
    words like "or"/"and" carry real information about how different an
    ingredient line is from an unrelated product (see
    _ws_match_recipe_ingredients' real-product cutoff comment: dropping
    them shortens the string enough to inflate difflib's overlap ratio
    for things that aren't actually alike, e.g. "chicken or vegetable
    stock" scoring falsely close to "Vegetable Oil" once "or" is gone).
    Parens/trailing-comma noise alone is enough to recover a real match
    like "cooked deli ham (thinly sliced)" against an existing "Deli
    Ham" product, without that side effect.
    """
    text = re.sub(r"\([^)]*\)", " ", text)
    text = text.split(",")[0]
    return re.sub(r"\s+", " ", text).strip()


def _clean_ingredient_reference_text(text: str) -> str:
    """Strips the descriptive noise real recipes put around a grocery item
    before reference-matching: a parenthetical aside
    ("(roughly one large onion)"), everything after the first comma
    (usually a prep note, e.g. "onion, diced" or "garlic cloves, (minced)"),
    and _INGREDIENT_DESCRIPTOR_WORDS. Only feeds _match_grocery_reference -
    the ingredient text shown to the person and matched against their own
    real Grocy products is untouched.
    """
    text = _strip_ingredient_asides(text)
    words = [w for w in re.findall(r"[a-zA-Z']+", text.lower()) if w not in _INGREDIENT_DESCRIPTOR_WORDS]
    return " ".join(words).strip()


def _match_grocery_reference(query: str) -> dict | None:
    """Fuzzy-matches free ingredient text (the already-stripped "product"
    portion of a parsed ingredient line, e.g. "flour" out of "2 cups
    flour") against the curated GROCERY_REFERENCE list (grocery_reference.
    py) - for an ingredient that doesn't match anything already in this
    household's own Grocy, this is what powers the "+ Add new product"
    mini-form's suggested name/units on the recipe import review screen
    (see _ws_match_recipe_ingredients below).

    Matches against every item's name AND its aliases (candidates built
    once and cached at module scope - GROCERY_REFERENCE is static data, so
    there's no reason to rebuild this list on every ingredient of every
    recipe import), since a recipe is far more likely to say "flour" or
    "chicken breasts" than an item's own canonical reference name. Reuses
    _best_text_match's plain difflib scoring - same simple, no-dependency
    approach as every other fuzzy match in this file - with a
    deliberately higher cutoff than the 0.5 used for matching against a
    household's own real Grocy products, since a wrong suggestion here is
    worse than no suggestion at all (the person didn't ask for this one,
    it's just a convenience prefill they can also simply ignore).

    Tries the cleaned phrase as a whole first (so a multi-word reference
    name/alias like "garlic clove" or "chicken breast" still matches), then
    falls back to each of its remaining individual words on their own -
    "sweet onion" doesn't match "Onion" well as a whole string (difflib
    penalizes the extra word "sweet" quite a bit even though "onion" is a
    clean hit), but the word "onion" by itself matches perfectly. Keeps
    whichever of these scores best, so a real ingredient line with several
    descriptive words around the item still gets a confident suggestion.
    """
    global _GROCERY_REFERENCE_CANDIDATES
    if _GROCERY_REFERENCE_CANDIDATES is None:
        candidates: list[tuple[int, str]] = []
        for i, entry in enumerate(GROCERY_REFERENCE):
            candidates.append((i, entry["name"]))
            for alias in entry.get("aliases") or []:
                candidates.append((i, alias))
        _GROCERY_REFERENCE_CANDIDATES = candidates
    # Structural noise only (parens, everything after the first comma) -
    # stripped but NOT the further per-word descriptor stripping
    # _clean_ingredient_reference_text also does. Tried BEFORE that fully
    # cleaned version (not after) so a specific, dedicated reference entry
    # - e.g. "Dried Minced Onion" - wins a tie against a shorter, less
    # specific one - e.g. "Yellow Onion" via its "onion" alias - reached
    # only once "dried"/"minced" have also been stripped as generic
    # prep-state noise. Both can score a perfect 1.0 ratio for input like
    # "dried minced onion, (for garnish)" (asides-stripped against the
    # dedicated entry's own name, once the parenthetical is gone; fully
    # cleaned's bare "onion" against the fresh-produce entry's alias);
    # since the loop below only replaces `best` on a STRICTLY higher
    # score, whichever text is tried first wins that tie - and the more
    # specific, less-destructively-cleaned match is the one that should.
    asides_stripped = _strip_ingredient_asides(query)
    cleaned = _clean_ingredient_reference_text(query)
    best = None
    for text in (asides_stripped, cleaned):
        if not text or len(text) < 3:
            continue
        match = _best_text_match(text, _GROCERY_REFERENCE_CANDIDATES, cutoff=0.72)
        if match and (best is None or match[2] > best[2]):
            best = match
    # Single leftover words get a much higher cutoff than the phrase-level
    # checks above - difflib's character-overlap ratio is unreliable on
    # short strings ("secret" vs "Sherbet" scores 0.77, "sauce" vs
    # "a1 sauce" scores 0.77, both comfortably clearing 0.72 despite being
    # unrelated), so a coincidental few-letter overlap can't pass here. What
    # a 0.85+ cutoff still catches is exactly what this fallback exists
    # for: an exact or near-exact single word ("onion" out of "sweet
    # onion") that the full cleaned phrase scored too low on because of the
    # word next to it.
    for word in cleaned.split():
        if len(word) < 3:
            continue
        match = _best_text_match(word, _GROCERY_REFERENCE_CANDIDATES, cutoff=0.85)
        if match and (best is None or match[2] > best[2]):
            best = match
    if not best:
        return None
    idx, _matched_text, _score = best
    return GROCERY_REFERENCE[idx]


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/match_recipe_ingredients",
        vol.Required("ingredients"): [str],
    }
)
@websocket_api.async_response
async def _ws_match_recipe_ingredients(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Fuzzy-match a parsed recipe's raw ingredient lines against Grocy's
    existing product list, for the import review screen: which ingredients
    Grocy already recognizes (and at what confidence) vs. which need a
    manual pick from the full product list, or to be created as a brand
    new Grocy product right from that ingredient's row (see the card's "+
    Add new product to Grocy" option and family_hub/create_grocy_product) -
    also returns the location list that mini-form needs.
    """
    entry = _get_family_hub_entry(hass)
    url = (entry.options.get(CONF_GROCY_URL) if entry else "") or ""
    api_key = (entry.options.get(CONF_GROCY_API_KEY) if entry else "") or ""
    if not url or not api_key:
        connection.send_result(
            msg["id"], {"configured": False, "matches": [], "products": [], "units": [], "locations": []}
        )
        return

    session = async_get_clientsession(hass)
    try:
        products = await _grocy_api_get(session, url, api_key, "/api/objects/products")
        units = await _grocy_api_get(session, url, api_key, "/api/objects/quantity_units")
        locations = await _grocy_api_get(session, url, api_key, "/api/objects/locations")
        conversions = await _grocy_api_get(session, url, api_key, "/api/objects/quantity_unit_conversions")
    except Exception as err:  # noqa: BLE001
        connection.send_result(
            msg["id"],
            {"configured": True, "matches": [], "products": [], "units": [], "locations": [], "error": str(err)},
        )
        return

    product_candidates = [(p["id"], p.get("name", "")) for p in products if isinstance(p, dict) and "id" in p]
    unit_candidates = [(u["id"], u.get("name", "")) for u in units if isinstance(u, dict) and "id" in u]
    location_candidates = [
        {"id": loc["id"], "name": loc.get("name", "")} for loc in locations if isinstance(loc, dict) and "id" in loc
    ]
    units_by_id = {u["id"]: u for u in units if isinstance(u, dict) and "id" in u}
    products_by_id = {p["id"]: p for p in products if isinstance(p, dict) and "id" in p}
    conversion_rows = [c for c in conversions if isinstance(c, dict)]
    # Resolves the reference list's plain unit NAMES ("pound", "cup", ...)
    # against whatever this household's own Grocy actually calls those
    # units - a suggestion is only as useful as the ids it can actually
    # preselect, and a fresh Grocy install may not have every unit yet
    # (that's exactly what the "+ Add new unit…" option already handles).
    units_by_name_lower = {
        str(u.get("name") or "").strip().lower(): u["id"] for u in units if isinstance(u, dict) and "id" in u
    }

    matches = []
    for raw in msg["ingredients"]:
        parsed = _parse_ingredient_line(str(raw))
        # Raised from the plain _best_text_match default (0.5) - a real
        # household reported "2 1/2 cups chicken or vegetable stock"
        # silently matching an existing "Vegetable Oil" product (ratio
        # 0.56): the shared word "vegetable" is a big enough fraction of
        # both short strings to clear 0.5 even though the products are
        # nothing alike. This is a genuinely different failure than messy
        # prep-word text (see _clean_ingredient_reference_text) - the raw
        # text here was already clean, the match was just wrong - so a
        # stricter cutoff is the fix, not more cleaning. 0.6 still finds
        # everyday near-exact matches (plurals, minor typos) while no
        # longer accepting a match built on one shared word out of several
        # unrelated ones; anything it now misses still gets the reference
        # suggestion below, or the manual picker on the review screen.
        product_match = _best_text_match(parsed["product_text"], product_candidates, cutoff=0.6)
        # A real household reported an existing "Deli Ham" product not
        # being matched at all for an ingredient line like "cooked deli
        # ham (thinly sliced)" - the parenthetical alone was enough to
        # sink a perfectly good match under the 0.6 cutoff (and then send
        # the ingredient down the "+ Add new product" path - which, worse,
        # can then collide with that same already-existing product's name
        # and fail with Grocy's own unique-name constraint). Uses the
        # lighter _strip_ingredient_asides here rather than the fuller
        # _clean_ingredient_reference_text the reference matcher uses
        # below - that one also drops individual words like "or"/"and",
        # which shortens the string enough to reintroduce the exact false
        # "vegetable stock" -> "Vegetable Oil" match the 0.6 cutoff was
        # raised to stop (see that regression test). Only tried as a
        # fallback, and only kept if it actually scores better, so this
        # can never make an already-good raw-text match worse - it just
        # gives a legitimately messy line a second, cleaner shot.
        cleaned_product_text = _strip_ingredient_asides(parsed["product_text"])
        if cleaned_product_text and cleaned_product_text.lower() != parsed["product_text"].strip().lower():
            cleaned_match = _best_text_match(cleaned_product_text, product_candidates, cutoff=0.6)
            if cleaned_match and (product_match is None or cleaned_match[2] > product_match[2]):
                product_match = cleaned_match
        unit_match = _best_text_match(parsed["unit_text"], unit_candidates, cutoff=0.6) if parsed["unit_text"] else None
        amount_value = _parse_quantity_token(parsed["amount_text"])
        unit_id = unit_match[0] if unit_match else None
        product_id = product_match[0] if product_match else None
        # A conversion warning only means anything once there's both a real
        # product to check against and a unit chosen to check it in - an
        # ingredient with no matched unit at all just falls back to the
        # product's own stock unit at creation time (see
        # family_hub/create_grocy_recipe), which never needs converting.
        unit_conversion_warning = None
        stock_unit_id = None
        stock_unit_name = None
        if product_id and unit_id:
            product = products_by_id.get(product_id) or {}
            stock_unit_id = product.get("qu_id_stock")
            stock_unit = units_by_id.get(stock_unit_id) if stock_unit_id else None
            stock_unit_name = stock_unit.get("name") if stock_unit else None
            if stock_unit_id and not _has_grocy_unit_conversion(unit_id, stock_unit_id, product_id, conversion_rows):
                chosen_unit_name = (unit_match[1] if unit_match else "") or "that unit"
                unit_conversion_warning = (
                    f"Grocy has no conversion from {chosen_unit_name} to {stock_unit_name or 'this product’s stock unit'} "
                    f"for {product_match[1]} - the amount may not be usable for stock math until you add one in Grocy, "
                    "or pick a different unit below."
                )
        # A reference suggestion is only worth computing (and only makes
        # sense) when there's no real Grocy product already matched - it's
        # meant to fill the exact gap the "+ Add new product" mini-form
        # covers, not second-guess a confident match against something
        # that already exists in this household's own Grocy.
        suggested_new_product = None
        if not product_id:
            reference_entry = _match_grocery_reference(parsed["product_text"])
            if reference_entry:
                suggested_new_product = {
                    "name": reference_entry["name"],
                    "purchase_unit_name": reference_entry["purchase_unit"],
                    "stock_unit_name": reference_entry["stock_unit"],
                    "purchase_unit_id": units_by_name_lower.get(reference_entry["purchase_unit"].lower()),
                    "stock_unit_id": units_by_name_lower.get(reference_entry["stock_unit"].lower()),
                    "factor": reference_entry["factor"],
                }
        matches.append(
            {
                "raw": raw,
                "amount_text": parsed["amount_text"],
                "amount_value": amount_value,
                "product_id": product_id,
                "product_name": product_match[1] if product_match else None,
                "score": round(product_match[2], 2) if product_match else 0,
                "unit_id": unit_id,
                "unit_name": unit_match[1] if unit_match else None,
                "stock_unit_id": stock_unit_id,
                "stock_unit_name": stock_unit_name,
                "unit_conversion_warning": unit_conversion_warning,
                "suggested_new_product": suggested_new_product,
            }
        )

    connection.send_result(
        msg["id"],
        {
            "configured": True,
            "matches": matches,
            "products": [{"id": cid, "name": name} for cid, name in product_candidates],
            "units": [{"id": cid, "name": name} for cid, name in unit_candidates],
            "locations": location_candidates,
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/create_grocy_product",
        vol.Required("name"): str,
        vol.Required("location_id"): vol.Coerce(int),
        vol.Required("qu_id"): vol.Coerce(int),
        vol.Optional("qu_id_purchase"): vol.Coerce(int),
        vol.Optional("qty_per_container", default=1): vol.Coerce(float),
    }
)
@websocket_api.async_response
async def _ws_create_grocy_product(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Create a brand new Grocy product from the recipe import review
    screen, for an ingredient that doesn't match anything already in Grocy
    - the "+ Add new product to Grocy" option in that ingredient's dropdown.

    Grocy's products table only truly requires a name, a default location,
    a stock quantity unit, and a purchase quantity unit (confirmed against
    Grocy's own schema/migrations) - everything else (min stock amount,
    due-date handling, calories, etc.) has a real default and can be tuned
    in Grocy afterward. qu_id_consume isn't sent at all because Grocy
    auto-defaults it to qu_id_stock on insert.

    qu_id ("Stock unit") is what the product's amount is tracked/consumed
    in (e.g. "gram", "piece"). qu_id_purchase ("Purchase unit") is what you
    actually buy it in (e.g. "bag", "dozen") - it defaults to the same as
    qu_id when the person doesn't pick a different one, same as before this
    field existed. When the two differ, qty_per_container (e.g. "1 bag =
    1000" for a 1kg bag tracked in grams) is Grocy's own
    qu_factor_purchase_to_stock concept - in current Grocy this isn't a
    plain column on products anymore, it lives in the quantity_unit_
    conversions table instead (confirmed against Grocy's migrations:
    products_view derives qu_factor_purchase_to_stock from a conversion row
    there). Grocy's own AFTER INSERT trigger on products already creates a
    default 1:1 conversion row the moment qu_stock != qu_purchase, so
    rather than blindly POSTing a second (conflicting) row, this looks that
    row up first and PUTs the real factor onto it - if for some reason it
    isn't there (e.g. a future Grocy version changes that trigger), it
    falls back to creating one. If either request fails, the product itself
    still exists - that failure is reported separately as
    "conversion_error" rather than treated as the whole operation failing,
    since fixing a unit conversion in Grocy directly afterward is a normal,
    low-friction thing to do and shouldn't require redoing the product.

    If Grocy still rejects the product itself (e.g. a required field
    changed in a newer Grocy version than this was checked against), its
    own error message is returned as-is rather than guessed at or
    swallowed - see GenericEntityApiController::AddObject, which always
    responds with the real exception message on failure.
    """
    entry = _get_family_hub_entry(hass)
    url = (entry.options.get(CONF_GROCY_URL) if entry else "") or ""
    api_key = (entry.options.get(CONF_GROCY_API_KEY) if entry else "") or ""
    if not url or not api_key:
        connection.send_result(msg["id"], {"configured": False, "success": False})
        return

    name = msg["name"].strip()
    if not name:
        connection.send_result(msg["id"], {"configured": True, "success": False, "error": "A product name is required."})
        return

    stock_qu_id = msg["qu_id"]
    purchase_qu_id = msg.get("qu_id_purchase") or stock_qu_id
    qty_per_container = msg["qty_per_container"]
    if qty_per_container <= 0:
        connection.send_result(
            msg["id"], {"configured": True, "success": False, "error": "Quantity per container must be greater than 0."}
        )
        return

    session = async_get_clientsession(hass)
    try:
        created = await _grocy_api_post(
            session,
            url,
            api_key,
            "/api/objects/products",
            {
                "name": name,
                "location_id": msg["location_id"],
                "qu_id_stock": stock_qu_id,
                "qu_id_purchase": purchase_qu_id,
            },
        )
    except Exception as err:  # noqa: BLE001 - surfaced verbatim, see docstring
        connection.send_result(msg["id"], {"configured": True, "success": False, "error": str(err)})
        return

    product_id = created.get("created_object_id") if isinstance(created, dict) else None
    if not product_id:
        connection.send_result(
            msg["id"], {"configured": True, "success": False, "error": "Grocy didn't return the new product's id"}
        )
        return

    conversion_error = None
    if purchase_qu_id != stock_qu_id:
        try:
            existing = await _grocy_api_get(
                session,
                url,
                api_key,
                f"/api/objects/quantity_unit_conversions?query[]=product_id={product_id}"
                f"&query[]=from_qu_id={purchase_qu_id}&query[]=to_qu_id={stock_qu_id}",
            )
            existing_id = None
            if isinstance(existing, list):
                for row in existing:
                    if isinstance(row, dict) and "id" in row:
                        existing_id = row["id"]
                        break
            if existing_id is not None:
                await _grocy_api_put(
                    session, url, api_key, f"/api/objects/quantity_unit_conversions/{existing_id}", {"factor": qty_per_container}
                )
            else:
                await _grocy_api_post(
                    session,
                    url,
                    api_key,
                    "/api/objects/quantity_unit_conversions",
                    {
                        "product_id": product_id,
                        "from_qu_id": purchase_qu_id,
                        "to_qu_id": stock_qu_id,
                        "factor": qty_per_container,
                    },
                )
        except Exception as err:  # noqa: BLE001 - the product itself still exists, see docstring
            conversion_error = str(err)

    result = {"configured": True, "success": True, "product_id": product_id, "name": name}
    if conversion_error:
        result["conversion_error"] = (
            f"Product created, but couldn't set the quantity-per-container conversion in Grocy ({conversion_error}) - "
            "set it under that product's Quantity unit conversions in Grocy."
        )
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/create_grocy_recipe",
        vol.Required("name"): str,
        vol.Optional("description", default=""): str,
        vol.Optional("servings", default=1): vol.Coerce(int),
        vol.Optional("image", default=""): str,
        vol.Required("ingredients"): [dict],
    }
)
@websocket_api.async_response
async def _ws_create_grocy_recipe(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Create a new recipe in Grocy from an imported (and hand-reviewed)
    ingredient list - the last step of the "Import from a link" flow.

    Only ingredients carrying a real, existing Grocy product id (matched
    automatically or picked manually in the review screen) become a
    recipes_pos row; anything left unresolved is skipped and reported back
    in "skipped" so the person knows what to add by hand afterward, rather
    than silently dropped or blocking the whole import.

    Each ingredient carries a real numeric "amount" (parsed from the
    recipe's own text by family_hub/match_recipe_ingredients, editable in
    the review screen) in whatever unit the person picked there ("qu_id") -
    Grocy converts that into the product's own stock unit itself using its
    quantity_unit_conversions table when it computes what's missing/
    consumed, the same way its own recipe editor works. An ingredient with
    no confident/editable amount (a range like "3-4 cloves", "a pinch of
    salt", or a person deliberately checking "Don't count toward stock")
    gets Grocy's own "not_check_stock_fulfillment" flag instead of a
    fabricated number - that keeps it out of the shopping-list "missing"
    math and the recipe's "fulfilled" indicator, which is the documented,
    intended way to handle an ingredient that can't be quantified, rather
    than silently guessing at "1" the way this used to work. "amount" still
    gets *some* value in that case (1, or whatever the field happened to
    hold) purely because Grocy's recipes_pos row requires one - it isn't
    meant to be read once not_check_stock_fulfillment is set.

    "variable_amount" is stored alongside regardless - it's a purely
    cosmetic display override in Grocy (shows in place of the numeric
    amount on the recipe page) with no effect on any of this math, so
    keeping the recipe's original wording ("2 cups", "a pinch") visible
    costs nothing.
    """
    entry = _get_family_hub_entry(hass)
    url = (entry.options.get(CONF_GROCY_URL) if entry else "") or ""
    api_key = (entry.options.get(CONF_GROCY_API_KEY) if entry else "") or ""
    if not url or not api_key:
        connection.send_result(msg["id"], {"configured": False})
        return

    session = async_get_clientsession(hass)
    try:
        units = await _grocy_api_get(session, url, api_key, "/api/objects/quantity_units")
    except Exception as err:  # noqa: BLE001
        connection.send_result(msg["id"], {"configured": True, "success": False, "error": str(err)})
        return
    units_by_id = {u["id"]: u for u in units if isinstance(u, dict) and "id" in u}
    fallback_unit_id = next((u["id"] for u in units if isinstance(u, dict) and "id" in u), None)
    if fallback_unit_id is None:
        connection.send_result(
            msg["id"],
            {"configured": True, "success": False, "error": "Grocy has no quantity units set up yet - add at least one in Grocy first."},
        )
        return

    try:
        # desired_servings has its own separate column default (1) in Grocy,
        # independent of base_servings - Grocy's shopping-list math scales
        # every ingredient by desired_servings/base_servings (see
        # RecipesService::AddNotFulfilledProductsToShoppingList's use of the
        # recipes_pos_resolved view), so leaving it unset here would silently
        # under-order every imported recipe with a parsed serving count above
        # 1 down to a 1-serving amount. Seeding it equal to base_servings
        # makes "push to shopping list" match the recipe's own parsed
        # serving count by default, same as Grocy's own recipe page would
        # show right after creating it there directly.
        servings = msg.get("servings") or 1
        created = await _grocy_api_post(
            session,
            url,
            api_key,
            "/api/objects/recipes",
            {
                "name": msg["name"],
                "description": msg.get("description") or "",
                "base_servings": servings,
                "desired_servings": servings,
            },
        )
    except Exception as err:  # noqa: BLE001
        connection.send_result(msg["id"], {"configured": True, "success": False, "error": str(err)})
        return

    recipe_id = created.get("created_object_id") if isinstance(created, dict) else None
    if not recipe_id:
        connection.send_result(msg["id"], {"configured": True, "success": False, "error": "Grocy didn't return the new recipe's id"})
        return

    # Attaching the recipe's photo (if the source page had a schema.org
    # "image") is a non-fatal, best-effort extra - a broken/unreachable
    # image URL, an oversized file, or an upload hiccup shouldn't undo an
    # otherwise-successful recipe import. Downloaded here (not passed as a
    # data: URL from the card) since only the backend's aiohttp session has
    # a reasonable timeout/size guard around fetching an arbitrary
    # third-party URL - same trust boundary already accepted for fetching
    # the recipe page itself in family_hub/parse_recipe_url.
    picture_error = None
    image_url = msg["image"]
    if image_url:
        try:
            async with session.get(image_url, timeout=aiohttp.ClientTimeout(total=15)) as img_resp:
                if img_resp.status != 200:
                    raise RuntimeError(f"couldn't download the recipe photo (HTTP {img_resp.status})")
                content_type = img_resp.content_type or ""
                image_bytes = await img_resp.read()
            if len(image_bytes) > 8 * 1024 * 1024:
                raise RuntimeError("the recipe photo was too large to import (over 8 MB)")
            file_name = f"family_hub_recipe_{recipe_id}{_guess_image_extension(image_url, content_type)}"
            await _grocy_api_upload_file(session, url, api_key, "recipepictures", file_name, image_bytes, content_type)
            await _grocy_api_put(session, url, api_key, f"/api/objects/recipes/{recipe_id}", {"picture_file_name": file_name})
        except Exception as err:  # noqa: BLE001 - the recipe itself already exists; don't undo that over a photo
            picture_error = str(err)

    # Grocy's own recipes_pos insert rejects a qu_id outright (a hard
    # SQLite integrity-constraint 400, not a soft warning) unless it's
    # either that product's own stock unit or has a row in
    # quantity_unit_conversions bridging it to that stock unit - the
    # review screen already flags this ahead of time as
    # "unit_conversion_warning" for products it has full data on, but a
    # household reported 5 of 10 ingredients still failing with exactly
    # this error even after switching to the review screen's suggested
    # products, including two that showed no warning at all (matched via
    # the reference-suggestion "create new product" flow, whose product
    # data isn't loaded into that warning check). Rather than depend on
    # every path remembering to warn correctly, every ingredient's unit is
    # now verified here, right before the row that actually enforces it.
    # Before giving up on stock math entirely, a mismatch first gets a
    # second chance at family_hub's own fixed, universal cooking-measurement
    # ratios (_resolve_standard_unit_conversion_factor - cup-to-tablespoon,
    # teaspoon-to-tablespoon, etc.) - the household doesn't have to have
    # typed a conversion into Grocy themselves for one of these plain
    # unit-to-unit conversions to be computed correctly. Only when neither
    # Grocy's own configuration nor a standard ratio can relate the two
    # (a spice measured in teaspoons matched to a product stocked by the
    # whole vegetable, say) does it fall back to "don't count toward stock"
    # instead of failing the ingredient outright. The recipe's written
    # amount/unit text (variable_amount) is preserved in every case, so
    # what's displayed on the recipe page never changes either way.
    try:
        products = await _grocy_api_get(session, url, api_key, "/api/objects/products")
        conversions = await _grocy_api_get(session, url, api_key, "/api/objects/quantity_unit_conversions")
    except Exception:  # noqa: BLE001 - fall back to the pre-existing (unverified) behavior rather than abort the import
        products = []
        conversions = []
    products_by_id = {p["id"]: p for p in products if isinstance(p, dict) and "id" in p} if isinstance(products, list) else {}
    conversion_rows = [c for c in conversions if isinstance(c, dict)] if isinstance(conversions, list) else []

    skipped = []
    added = 0
    for ing in msg["ingredients"]:
        product_id = ing.get("product_id")
        raw_text = str(ing.get("raw") or "").strip()
        if not product_id:
            skipped.append(raw_text or "(unnamed ingredient)")
            continue
        raw_amount = ing.get("amount")
        amount_value = raw_amount if isinstance(raw_amount, (int, float)) and raw_amount > 0 else 1
        chosen_qu_id = ing.get("unit_id") or fallback_unit_id
        not_check_stock = bool(ing.get("not_check_stock_fulfillment"))
        product = products_by_id.get(product_id)
        stock_qu_id = product.get("qu_id_stock") if product else None
        if (
            stock_qu_id
            and chosen_qu_id != stock_qu_id
            and not _has_grocy_unit_conversion(chosen_qu_id, stock_qu_id, product_id, conversion_rows)
        ):
            standard_factor = _resolve_standard_unit_conversion_factor(
                (units_by_id.get(chosen_qu_id) or {}).get("name", ""),
                (units_by_id.get(stock_qu_id) or {}).get("name", ""),
            )
            if standard_factor is not None:
                # A real, computable conversion (e.g. cup -> tablespoon) -
                # convert the amount itself and send it in the product's
                # stock unit, so stock/shopping-list math still works
                # exactly as if the household had set this conversion up in
                # Grocy themselves.
                final_qu_id = stock_qu_id
                amount_value = round(amount_value * standard_factor, 6)
            else:
                # No way (Grocy's own config, or a standard ratio) to relate
                # the recipe's own unit to this product's stock unit -
                # sending the stock unit instead is always accepted (a unit
                # always "converts" to itself), and not_check_stock_
                # fulfillment keeps the (now unit-mismatched) amount number
                # out of the shopping-list/fulfilled math, same as an
                # ingredient with no confident amount at all.
                final_qu_id = stock_qu_id
                not_check_stock = True
        else:
            final_qu_id = chosen_qu_id
        # Grocy shows variable_amount in place of the numeric amount, but
        # still shows whatever unit name goes with the row's actual qu_id
        # right alongside it (see grocy-docs' own description of variable
        # amount) - so once a mismatched unit gets substituted for the
        # product's stock unit above, a variable_amount that's just the bare
        # original number ("2") would end up paired with the SUBSTITUTED
        # unit's name instead of the one the recipe was actually written in
        # ("2 tablespoon" showing where the recipe said "2 teaspoons",
        # overstating a Worcestershire sauce measurement 3x). Building
        # variable_amount from the amount together with the ingredient's own
        # originally-chosen unit name - never the substituted one - keeps
        # the recipe reading exactly as written regardless of which unit
        # Grocy ends up tracking it under internally. Only done when a real
        # unit was actually chosen (ing["unit_id"] set, not just the
        # arbitrary system fallback_unit_id an ingredient with no matched
        # unit at all would otherwise get) - an ingredient like "3 eggs"
        # never had a real unit to begin with, so its variable_amount stays
        # just the number, same as before.
        amount_text = str(ing.get("amount_text") or "").strip()
        original_unit_name = str((units_by_id.get(ing.get("unit_id")) or {}).get("name", "")).strip() if ing.get("unit_id") else ""
        if amount_text and original_unit_name:
            variable_amount = f"{amount_text} {original_unit_name}"
        else:
            variable_amount = amount_text or raw_text
        try:
            await _grocy_api_post(
                session,
                url,
                api_key,
                "/api/objects/recipes_pos",
                {
                    "recipe_id": recipe_id,
                    "product_id": product_id,
                    "amount": amount_value,
                    "qu_id": final_qu_id,
                    "variable_amount": variable_amount,
                    "note": raw_text,
                    "not_check_stock_fulfillment": not_check_stock,
                },
            )
            added += 1
        except Exception as err:  # noqa: BLE001 - one bad line must not abort the whole import
            skipped.append(f"{raw_text} ({err})")

    result = {
        "configured": True,
        "success": True,
        "recipe_id": recipe_id,
        "link": f"{url}/recipe/{recipe_id}",
        "added": added,
        "skipped": skipped,
    }
    if picture_error:
        result["picture_error"] = (
            f"Recipe created, but couldn't import its photo ({picture_error}) - "
            "add one manually under that recipe's picture in Grocy if you'd like."
        )
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/set_daily_digest",
        vol.Required("enabled"): bool,
        vol.Required("time"): str,
        vol.Optional("meal_plan_entity"): str,
    }
)
@websocket_api.async_response
async def _ws_set_daily_digest(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Record whether the Daily Digest is on and what local time to send it at.

    Sent best-effort by the card once per session and again on every
    Settings save (see _syncDailyDigestConfig in the card's JS) - the
    poller (_maybe_send_daily_digest), not the card, decides when to
    actually fire it, so it needs its own copy of these two settings
    independent of anyone having the dashboard open. The recipient list
    is NOT sent here - that reuses family_hub/set_notify_overrides, keyed
    by DAILY_DIGEST_NOTIFY_KEY, exactly like the Reminders notify row.
    """
    entry = _get_family_hub_entry(hass)
    if entry is None:
        connection.send_error(msg["id"], "not_found", "Family Hub is not set up")
        return
    enabled = bool(msg["enabled"])
    time_str = str(msg["time"]).strip()
    if not re.match(r"^\d{2}:\d{2}$", time_str):
        time_str = entry.options.get(CONF_DAILY_DIGEST_TIME, "07:00")
    new_options = {
        **entry.options,
        CONF_DAILY_DIGEST_ENABLED: enabled,
        CONF_DAILY_DIGEST_TIME: time_str,
    }
    meal_plan_entity = str(msg.get("meal_plan_entity") or "").strip()
    if meal_plan_entity:
        new_options[CONF_MEAL_PLAN_ENTITY] = meal_plan_entity
    hass.config_entries.async_update_entry(entry, options=new_options)
    connection.send_result(
        msg["id"],
        {
            "enabled": enabled,
            "time": time_str,
            "meal_plan_entity": new_options.get(CONF_MEAL_PLAN_ENTITY, ""),
        },
    )


def _event_override_key(calendar_entity: str, start_ts: int, summary: str) -> str:
    # Matches identity the same way _dedup_key does (calendar + when + what
    # it's called - calendar.get_events has no stable uid) but keyed off a
    # unix timestamp rather than a raw ISO string, since the card fetches
    # events via the REST API (start.dateTime) while the poller fetches via
    # the get_events service (a flat start string) - the two aren't
    # guaranteed to be byte-identical, but both resolve to the same instant.
    return f"{calendar_entity}|{int(start_ts)}|{summary}"


@websocket_api.websocket_command({vol.Required("type"): "family_hub/get_reminder_overrides"})
@websocket_api.async_response
async def _ws_get_reminder_overrides(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Return every per-event reminder override, for the card's event-info
    popup to look up by (calendar, start, summary) when it opens."""
    entry_data = _get_family_hub_entry_data(hass)
    overrides = (entry_data or {}).get("reminder_overrides", {})
    connection.send_result(msg["id"], {"overrides": overrides})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "family_hub/set_reminder_override",
        vol.Required("calendar_entity"): str,
        vol.Required("start"): vol.Any(int, float),
        vol.Required("summary"): str,
        vol.Required("minutes"): [vol.Any(int, float)],
    }
)
@websocket_api.async_response
async def _ws_set_reminder_override(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Add, change, or remove the reminder on one existing event, without
    touching the event itself - most calendar platforms only expose
    create_event/get_events, so there's no generic way to rewrite an
    existing event's description marker. An empty minutes list is a valid,
    meaningful override: it explicitly turns reminders off for that event
    even if its description still carries a marker.

    Setting a non-empty reminder here also adds the event's calendar to
    "Calendars to monitor" if it isn't already there - the event-info popup
    lets you add a reminder to an event on any calendar, regardless of
    whether that calendar has otherwise been set up for reminders, so
    without this a reminder set here could silently never fire.
    """
    entry_data = _get_family_hub_entry_data(hass)
    if entry_data is None:
        connection.send_error(msg["id"], "not_found", "Family Hub is not set up")
        return
    minutes = sorted({int(m) for m in msg["minutes"] if m and int(m) > 0})
    calendar_entity = msg["calendar_entity"]
    key = _event_override_key(calendar_entity, int(msg["start"]), msg["summary"])
    overrides: dict[str, list[int]] = entry_data.setdefault("reminder_overrides", {})
    overrides[key] = minutes
    store: Store | None = entry_data.get("reminder_overrides_store")
    if store is not None:
        await store.async_save(overrides)

    calendars_result = None
    if minutes:
        entry = _get_family_hub_entry(hass)
        if entry is not None and calendar_entity not in entry.options.get(CONF_CALENDARS, []):
            calendars_result = _add_monitored_calendars(entry.options.get(CONF_CALENDARS, []), [calendar_entity])
            hass.config_entries.async_update_entry(
                entry, options={**entry.options, CONF_CALENDARS: calendars_result}
            )

    result = {"key": key, "minutes": minutes}
    if calendars_result is not None:
        result["calendars"] = calendars_result
    connection.send_result(msg["id"], result)


def _parse_reminder_minutes(description: str) -> list[int]:
    """Parse the (possibly multi-value) reminder marker into a sorted list of minutes.

    An event can carry more than one lead time (e.g. <!--reminder:10,30-->
    for "10 and 30 minutes before") - each fires as its own, independently
    dedup'd notification. Also accepts the original single-value marker
    from before multiple reminders per event were supported.
    """
    match = REMINDER_RE.search(description or "")
    if not match:
        return []
    minutes = []
    for part in match.group(1).split(","):
        try:
            n = int(part)
        except (TypeError, ValueError):
            continue
        if n > 0:
            minutes.append(n)
    return sorted(set(minutes))


def _notification_click_data(entry: ConfigEntry) -> dict[str, str]:
    """Build the notify.* `data` fields that make tapping a push notification
    open the configured dashboard/view instead of just launching the
    Companion app to wherever it last was.

    iOS reads `url`, Android reads `clickAction` - both are set to the same
    relative path (e.g. "/lovelace-family/0") so one Settings field covers
    both platforms, per the Companion app docs. Returns an empty dict when
    unset, which is exactly today's behavior (no extra data beyond
    title/message) - existing installs see no change until this is set.
    """
    path = (entry.options.get(CONF_NOTIFICATION_CLICK_PATH) or "").strip()
    if not path:
        return {}
    return {"url": path, "clickAction": path}


def _dedup_key(calendar_entity: str, event: dict[str, Any], lead_minutes: int) -> str:
    # calendar.get_events does not return a stable uid, so identity is built
    # from what it does return: which calendar, when it starts, and what
    # it's called. lead_minutes is part of the key so an event with two
    # reminders (e.g. 10 and 30 minutes before) tracks each independently -
    # firing the first must not suppress the second.
    return f"{calendar_entity}|{event.get('start')}|{event.get('summary')}|{lead_minutes}"


async def _run_poll(
    hass: HomeAssistant,
    entry: ConfigEntry,
    store: Store,
    notified: dict[str, str],
    reminder_overrides: dict[str, list[int]] | None = None,
) -> None:
    options = entry.options
    calendars = options.get(CONF_CALENDARS, [])
    default_target = options.get(CONF_DEFAULT_NOTIFY, "")
    overrides = _parse_overrides(options.get(CONF_OVERRIDES_TEXT, ""))
    reminder_overrides = reminder_overrides if reminder_overrides is not None else {}

    if not calendars:
        return

    now = dt_util.utcnow()
    # Standalone reminders fire AT their own start time rather than strictly
    # before it, so a forward-looking-only window (start_date_time=now) can
    # miss one that started in between two poll cycles - reach a little into
    # the past too. This doesn't change firing eligibility for ordinary
    # calendar-event reminders (they're still gated by "now >= event_start"
    # below unless they're a standalone reminder).
    query_start = now - timedelta(minutes=POLL_QUERY_GRACE_MINUTES)
    window_end = now + timedelta(hours=DEFAULT_LOOKAHEAD_HOURS)
    changed = False

    for calendar_entity in calendars:
        try:
            response = await hass.services.async_call(
                "calendar",
                "get_events",
                {
                    "entity_id": calendar_entity,
                    "start_date_time": query_start.isoformat(),
                    "end_date_time": window_end.isoformat(),
                },
                blocking=True,
                return_response=True,
            )
        except Exception as err:  # noqa: BLE001 - one bad calendar must not stop the rest
            _LOGGER.debug(
                "Family Hub: could not fetch events for %s: %s", calendar_entity, err
            )
            continue

        events = ((response or {}).get(calendar_entity) or {}).get("events", [])
        for event in events:
            start_raw = event.get("start")
            if not start_raw or "T" not in str(start_raw):
                # All-day events have no specific time to count down from;
                # reminders are only supported for timed events.
                continue

            event_start = dt_util.parse_datetime(str(start_raw))
            if event_start is None:
                continue
            if event_start.tzinfo is None:
                event_start = dt_util.as_utc(event_start)

            summary = event.get("summary") or "(untitled)"
            description = event.get("description") or ""
            is_reminder_type = _is_reminder_type_event(description)

            if is_reminder_type:
                # A standalone reminder always fires exactly at its own
                # start time - it has no "N minutes before" concept, and
                # doesn't consult the per-event reminder override map at all
                # (that's for calendar events' "remind me" checkboxes).
                lead_minutes_list = [0]
            else:
                # A per-event override (set from the card's event-info
                # popup) takes priority over the description marker - this
                # is how reminders get added to or removed from an event
                # after it was created, since most calendar platforms have
                # no update_event service to rewrite the marker in place. An
                # override of [] means "explicitly no reminder", even if a
                # marker is present.
                override_key = _event_override_key(calendar_entity, int(event_start.timestamp()), summary)
                if override_key in reminder_overrides:
                    lead_minutes_list = reminder_overrides[override_key]
                else:
                    lead_minutes_list = _parse_reminder_minutes(description)
            if not lead_minutes_list:
                continue

            if now >= event_start and not is_reminder_type:
                # Missed window - none of this event's reminders fire late.
                # A standalone reminder is the opposite case: now >=
                # event_start is exactly when (or after) it's supposed to
                # fire, not a reason to skip it.
                continue

            if is_reminder_type:
                targets = overrides.get(REMINDER_NOTIFY_KEY) or ([default_target] if default_target else [])
            else:
                targets = overrides.get(calendar_entity) or ([default_target] if default_target else [])
            local_start = dt_util.as_local(event_start)

            # An event can carry several lead times (e.g. 10 and 30 minutes
            # before) - each is tracked and fired independently. A
            # standalone reminder only ever has the single lead_minutes=0
            # entry from above.
            for lead_minutes in lead_minutes_list:
                reminder_time = event_start - timedelta(minutes=lead_minutes)
                if now < reminder_time:
                    continue

                key = _dedup_key(calendar_entity, event, lead_minutes)
                if key in notified:
                    continue

                if not targets:
                    _LOGGER.warning(
                        "Family Hub: no notify device configured for %s - "
                        "skipping this %s",
                        REMINDER_NOTIFY_KEY if is_reminder_type else calendar_entity,
                        "reminder" if is_reminder_type else "event's reminder",
                    )
                    notified[key] = now.isoformat()
                    changed = True
                    continue

                # Every configured device gets its own notification. One
                # bad/unreachable device must not block the others, and a
                # config problem (bad target format) on one device
                # shouldn't cause an infinite retry loop for it.
                any_success = False
                any_transient_failure = False
                for target in targets:
                    split_target = _split_notify_target(target)
                    if not split_target:
                        _LOGGER.warning(
                            "Family Hub: invalid notify target %r for %s - skipping this device",
                            target,
                            calendar_entity,
                        )
                        continue
                    notify_domain, notify_service = split_target
                    try:
                        if is_reminder_type:
                            title = f"Reminder: {summary}"
                            message = f"{summary} - {local_start.strftime('%-I:%M %p')}"
                        else:
                            title = f"Upcoming: {summary}"
                            message = f"{summary} starts at {local_start.strftime('%-I:%M %p')}"
                        await hass.services.async_call(
                            notify_domain,
                            notify_service,
                            {
                                "title": title,
                                "message": message,
                                "data": _notification_click_data(entry),
                            },
                            blocking=True,
                        )
                        any_success = True
                    except Exception as err:  # noqa: BLE001 - a failed notify must not crash the poll
                        _LOGGER.warning(
                            "Family Hub: failed to send notification via %s: %s", target, err
                        )
                        any_transient_failure = True

                if any_success or not any_transient_failure:
                    notified[key] = now.isoformat()
                    changed = True
                # else: at least one device failed transiently and none succeeded -
                # leave undedup'd so the whole set is retried next poll.

    if _prune_notified(notified, now):
        changed = True

    if changed:
        await store.async_save(notified)


def _prune_notified(notified: dict[str, str], now) -> bool:
    """Drop dedup entries older than the retention window. Returns True if anything changed."""
    cutoff = now - timedelta(hours=NOTIFIED_RETENTION_HOURS)
    stale = []
    for key, notified_at in notified.items():
        parsed = dt_util.parse_datetime(notified_at) if notified_at else None
        if parsed is None or parsed < cutoff:
            stale.append(key)
    for key in stale:
        del notified[key]
    return bool(stale)


async def _poll_reminders_todo(
    hass: HomeAssistant,
    entry: ConfigEntry,
    store: Store,
    notified: dict[str, str],
) -> None:
    """Fire notifications for standalone reminders - Home Assistant to-do
    items on CONF_REMINDERS_ENTITY, not calendar events.

    Unlike calendar events (which have no stable uid, so identity has to be
    reconstructed from start+summary), to-do items DO have a persistent uid
    - so identity here is (entity, uid, due). due is still part of the key
    so rescheduling an already-fired reminder to a new time makes it
    eligible to fire again, matching what you'd expect from "moving it
    around" in Home Assistant's own To-do UI. Items are always read live
    from todo.get_items - there's no local marker to go stale, so a rename
    or reschedule done directly in Home Assistant is picked up automatically
    on the very next poll.
    """
    options = entry.options
    reminders_entity = options.get(CONF_REMINDERS_ENTITY)
    if not reminders_entity:
        return

    overrides = _parse_overrides(options.get(CONF_OVERRIDES_TEXT, ""))
    default_target = options.get(CONF_DEFAULT_NOTIFY, "")
    targets = overrides.get(reminders_entity) or ([default_target] if default_target else [])

    try:
        response = await hass.services.async_call(
            "todo",
            "get_items",
            {"entity_id": reminders_entity, "status": ["needs_action"]},
            blocking=True,
            return_response=True,
        )
    except Exception as err:  # noqa: BLE001 - the to-do list may not exist (yet)
        _LOGGER.debug(
            "Family Hub: could not fetch reminders from %s: %s", reminders_entity, err
        )
        return

    items = ((response or {}).get(reminders_entity) or {}).get("items", [])
    now = dt_util.utcnow()
    changed = False

    for item in items:
        uid = item.get("uid")
        due_raw = item.get("due")
        summary = item.get("summary") or "(untitled)"
        is_rollover = bool(REMINDER_ROLLOVER_RE.search(item.get("description") or ""))
        if not uid or not due_raw:
            continue

        due_dt = dt_util.parse_datetime(str(due_raw))
        if due_dt is None:
            # A due DATE with no time component parses to None here (it's
            # not a valid datetime string) - reminders created by the card
            # always set a due time, so this is most likely a plain to-do
            # someone added by hand on the same list. There's no specific
            # moment to notify at, so skip it rather than guess one.
            continue
        if due_dt.tzinfo is None:
            due_dt = dt_util.as_utc(due_dt)

        # A "roll over if not completed" reminder that's still sitting on a
        # PAST calendar day gets carried forward onto today the moment the
        # day actually changes - not merely once its own time-of-day has
        # passed, which would carry it onto tomorrow's date while today
        # hasn't even finished yet. Comparing local calendar dates (not just
        # "now >= due_dt") is what keeps it showing under today's date for
        # the rest of today, only moving again at the next real day change.
        if is_rollover and dt_util.as_local(due_dt).date() < dt_util.now().date():
            due_dt = await _roll_reminder_to_today(hass, reminders_entity, uid, due_dt, summary)

        if now < due_dt:
            continue

        key = f"{reminders_entity}|{uid}|{int(due_dt.timestamp())}"
        if key in notified:
            continue

        if not targets:
            _LOGGER.warning(
                "Family Hub: no notify device configured for reminders (%s) - "
                "skipping this reminder",
                reminders_entity,
            )
            notified[key] = now.isoformat()
            changed = True
            continue

        local_due = dt_util.as_local(due_dt)
        any_success = False
        any_transient_failure = False
        for target in targets:
            split_target = _split_notify_target(target)
            if not split_target:
                _LOGGER.warning(
                    "Family Hub: invalid notify target %r for reminders - skipping this device",
                    target,
                )
                continue
            notify_domain, notify_service = split_target
            try:
                await hass.services.async_call(
                    notify_domain,
                    notify_service,
                    {
                        "title": f"Reminder: {summary}",
                        "message": f"{summary} - {local_due.strftime('%-I:%M %p')}",
                        "data": _notification_click_data(entry),
                    },
                    blocking=True,
                )
                any_success = True
            except Exception as err:  # noqa: BLE001 - a failed notify must not crash the poll
                _LOGGER.warning(
                    "Family Hub: failed to send reminder notification via %s: %s", target, err
                )
                any_transient_failure = True

        if any_success or not any_transient_failure:
            notified[key] = now.isoformat()
            changed = True
        # else: at least one device failed transiently and none succeeded -
        # leave undedup'd so it's retried next poll.

    if _prune_notified(notified, now):
        changed = True

    if changed:
        await store.async_save(notified)


async def _roll_reminder_to_today(
    hass: HomeAssistant,
    reminders_entity: str,
    uid: str,
    due_dt,
    summary: str,
):
    """Carry a "roll over if not completed" reminder that's still sitting on
    a past calendar day forward onto TODAY (same local time of day), rather
    than a flat +1 day - so it lands on today's date the moment the day
    actually changes, however many days it's been sitting there (e.g. after
    Home Assistant was offline over a weekend), instead of needing one poll
    cycle per missed day to slowly catch up. Computed in local time so the
    wall-clock time of day is preserved across DST transitions.

    Returns the new due datetime (UTC-aware) so the caller can immediately
    continue evaluating today's due-ness/notification with it, without
    waiting for the next poll to notice the change it just wrote.
    """
    local_due = dt_util.as_local(due_dt)
    today_local = dt_util.now()
    next_local_due = local_due.replace(
        year=today_local.year, month=today_local.month, day=today_local.day
    )
    next_due_str = next_local_due.strftime("%Y-%m-%dT%H:%M:%S")
    try:
        # entity_id MUST be included - todo.update_item is an
        # entity-targeted service, and without it Home Assistant has no
        # way to know which to-do list "item" (the uid) belongs to, so the
        # call is a silent no-op (same class of bug as the v21 fix for
        # reminders not saving). This was missing here from the start, so
        # rollover reminders were never actually being carried forward in
        # a real Home Assistant instance regardless of the day-change
        # timing logic above.
        await hass.services.async_call(
            "todo",
            "update_item",
            {"entity_id": reminders_entity, "item": uid, "due_datetime": next_due_str},
            blocking=True,
        )
        return dt_util.as_utc(next_local_due)
    except Exception as err:  # noqa: BLE001 - a failed roll-over must not crash the poll
        _LOGGER.warning(
            "Family Hub: failed to roll reminder %r over to today: %s", summary, err
        )
        return due_dt


async def _build_daily_digest_message(hass: HomeAssistant, entry: ConfigEntry) -> str:
    """Build the "good morning" summary: today's calendar events, today's
    due reminders, and today's planned meals - each section is skipped
    entirely (not shown as "none") if there's nothing to say, so a light
    day gets a short message instead of a wall of empty headers.
    """
    options = entry.options
    now_local = dt_util.now()
    today_start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end_local = today_start_local + timedelta(days=1)
    today_start_utc = dt_util.as_utc(today_start_local)
    today_end_utc = dt_util.as_utc(today_end_local)

    lines: list[str] = []

    # --- Today's calendar events ---
    event_lines: list[str] = []
    for calendar_entity in options.get(CONF_CALENDARS, []):
        try:
            response = await hass.services.async_call(
                "calendar",
                "get_events",
                {
                    "entity_id": calendar_entity,
                    "start_date_time": today_start_utc.isoformat(),
                    "end_date_time": today_end_utc.isoformat(),
                },
                blocking=True,
                return_response=True,
            )
        except Exception as err:  # noqa: BLE001 - one bad calendar must not stop the digest
            _LOGGER.debug(
                "Family Hub: digest could not fetch events for %s: %s", calendar_entity, err
            )
            continue
        events = ((response or {}).get(calendar_entity) or {}).get("events", [])
        for event in events:
            summary = event.get("summary") or "(untitled)"
            start_raw = event.get("start")
            if start_raw and "T" in str(start_raw):
                start_dt = dt_util.parse_datetime(str(start_raw))
                if start_dt is not None:
                    if start_dt.tzinfo is None:
                        start_dt = dt_util.as_utc(start_dt)
                    event_lines.append(f"{dt_util.as_local(start_dt).strftime('%-I:%M %p')} - {summary}")
                    continue
            event_lines.append(summary)  # all-day event, no specific time
    if event_lines:
        lines.append("Today's events:")
        lines.extend(f"  - {line}" for line in sorted(event_lines))

    # --- Today's due reminders ---
    reminders_entity = options.get(CONF_REMINDERS_ENTITY)
    if reminders_entity:
        try:
            response = await hass.services.async_call(
                "todo",
                "get_items",
                {"entity_id": reminders_entity, "status": ["needs_action"]},
                blocking=True,
                return_response=True,
            )
            items = ((response or {}).get(reminders_entity) or {}).get("items", [])
            reminder_lines = []
            for item in items:
                due_raw = item.get("due")
                if not due_raw:
                    continue
                due_dt = dt_util.parse_datetime(str(due_raw))
                if due_dt is None:
                    continue
                if due_dt.tzinfo is None:
                    due_dt = dt_util.as_utc(due_dt)
                if today_start_utc <= due_dt < today_end_utc:
                    reminder_lines.append(item.get("summary") or "(untitled)")
            if reminder_lines:
                lines.append("Due today:")
                lines.extend(f"  - {line}" for line in sorted(reminder_lines))
        except Exception as err:  # noqa: BLE001 - a missing to-do list must not stop the digest
            _LOGGER.debug(
                "Family Hub: digest could not fetch reminders from %s: %s", reminders_entity, err
            )

    # --- Today's planned meals ---
    meal_plan_entity = options.get(CONF_MEAL_PLAN_ENTITY)
    if meal_plan_entity:
        try:
            response = await hass.services.async_call(
                "todo",
                "get_items",
                {"entity_id": meal_plan_entity, "status": ["needs_action", "completed"]},
                blocking=True,
                return_response=True,
            )
            items = ((response or {}).get(meal_plan_entity) or {}).get("items", [])
            meal_lines = []
            for item in items:
                due_raw = item.get("due")
                if not due_raw:
                    continue
                # Meal-plan to-do items store their date as a due DATE (no
                # time component), unlike reminders - compare on the date
                # portion only rather than parsing as a full datetime.
                due_date_str = str(due_raw)[:10]
                if due_date_str == today_start_local.strftime("%Y-%m-%d"):
                    meal_lines.append(item.get("summary") or "(untitled)")
            if meal_lines:
                lines.append("On the menu today:")
                lines.extend(f"  - {line}" for line in meal_lines)
        except Exception as err:  # noqa: BLE001 - a missing to-do list must not stop the digest
            _LOGGER.debug(
                "Family Hub: digest could not fetch meal plan from %s: %s", meal_plan_entity, err
            )

    # --- Grocy: items expiring soon (opt-in, off by default - see
    # CONF_GROCY_EXPIRING_ENABLED). Independently gated on
    # CONF_GROCY_EXPIRING_DIGEST_ENABLED too - the feature can be on for
    # the card's own "Expiring Soon" list while staying out of the
    # morning digest; defaults to True (missing key = pre-dates this
    # setting) so existing installs keep the line they already had. ---
    if options.get(CONF_GROCY_EXPIRING_ENABLED) and options.get(CONF_GROCY_EXPIRING_DIGEST_ENABLED, True):
        grocy_url = options.get(CONF_GROCY_URL) or ""
        grocy_api_key = options.get(CONF_GROCY_API_KEY) or ""
        if grocy_url and grocy_api_key:
            try:
                session = async_get_clientsession(hass)
                expiring = await _fetch_grocy_expiring_stock(session, grocy_url, grocy_api_key, days=30)
                count_7 = sum(1 for it in expiring if it["days_until"] <= 7)
                count_30 = len(expiring)
                if count_30:
                    lines.append("Grocy stock:")
                    lines.append(f"  - {count_7} item{'' if count_7 == 1 else 's'} expiring in 7 days")
                    lines.append(f"  - {count_30} item{'' if count_30 == 1 else 's'} expiring in 30 days")
            except Exception as err:  # noqa: BLE001 - a Grocy hiccup must not stop the digest
                _LOGGER.debug("Family Hub: digest could not fetch Grocy expiring stock: %s", err)

    # --- Grocy: items running low (opt-in, off by default - see
    # CONF_GROCY_LOW_STOCK_ENABLED). Independently gated on
    # CONF_GROCY_LOW_STOCK_DIGEST_ENABLED, same reasoning as the expiring-
    # soon section above. ---
    if options.get(CONF_GROCY_LOW_STOCK_ENABLED) and options.get(CONF_GROCY_LOW_STOCK_DIGEST_ENABLED, True):
        grocy_url = options.get(CONF_GROCY_URL) or ""
        grocy_api_key = options.get(CONF_GROCY_API_KEY) or ""
        if grocy_url and grocy_api_key:
            try:
                session = async_get_clientsession(hass)
                low_stock = await _fetch_grocy_low_stock(session, grocy_url, grocy_api_key)
                if low_stock:
                    count = len(low_stock)
                    lines.append(f"{count} item{'' if count == 1 else 's'} running low in Grocy stock")
            except Exception as err:  # noqa: BLE001 - a Grocy hiccup must not stop the digest
                _LOGGER.debug("Family Hub: digest could not fetch Grocy low stock: %s", err)

    if not lines:
        return "Nothing on the calendar, no reminders due, and no meals planned for today."
    return "\n".join(lines)


async def _maybe_send_daily_digest(
    hass: HomeAssistant,
    entry: ConfigEntry,
    digest_store: Store,
    digest_state: dict[str, str],
) -> None:
    """Fire the Daily Digest once per day, the first poll cycle at or after
    its configured local send time - not a separately-scheduled callback,
    since the existing poll loop already runs often enough (default every 5
    minutes) that piggybacking on it is simpler than registering and
    re-registering a second timer whenever the configured time changes.
    """
    options = entry.options
    if not options.get(CONF_DAILY_DIGEST_ENABLED):
        return
    digest_time = options.get(CONF_DAILY_DIGEST_TIME, "07:00")
    match = re.match(r"^(\d{2}):(\d{2})$", str(digest_time))
    if not match:
        return
    target_hour, target_minute = int(match.group(1)), int(match.group(2))

    now_local = dt_util.now()
    today_str = now_local.strftime("%Y-%m-%d")
    if digest_state.get(entry.entry_id) == today_str:
        return  # already sent today
    if (now_local.hour, now_local.minute) < (target_hour, target_minute):
        return  # not time yet today

    overrides = _parse_overrides(options.get(CONF_OVERRIDES_TEXT, ""))
    default_target = options.get(CONF_DEFAULT_NOTIFY, "")
    targets = overrides.get(DAILY_DIGEST_NOTIFY_KEY) or ([default_target] if default_target else [])
    if not targets:
        _LOGGER.warning(
            "Family Hub: Daily Digest is enabled but no notify device is configured - skipping today's digest"
        )
        digest_state[entry.entry_id] = today_str
        await digest_store.async_save(digest_state)
        return

    message = await _build_daily_digest_message(hass, entry)
    any_success = False
    any_transient_failure = False
    for target in targets:
        split_target = _split_notify_target(target)
        if not split_target:
            _LOGGER.warning("Family Hub: invalid notify target %r for Daily Digest - skipping this device", target)
            continue
        notify_domain, notify_service = split_target
        try:
            await hass.services.async_call(
                notify_domain,
                notify_service,
                {
                    "title": "Good morning! Today's Family Hub digest",
                    "message": message,
                    "data": _notification_click_data(entry),
                },
                blocking=True,
            )
            any_success = True
        except Exception as err:  # noqa: BLE001 - a failed notify must not crash the poll
            _LOGGER.warning("Family Hub: failed to send Daily Digest via %s: %s", target, err)
            any_transient_failure = True

    if any_success or not any_transient_failure:
        digest_state[entry.entry_id] = today_str
        await digest_store.async_save(digest_state)
    # else: every device failed transiently - leave unmarked so it's retried
    # on the next poll rather than silently skipping today's digest.


async def _build_upcoming_summary(
    hass: HomeAssistant,
    entry: ConfigEntry,
    reminder_overrides: dict[str, list[int]],
    notified: dict[str, str],
) -> str:
    """Preview what reminders are scheduled to fire, without sending or
    marking anything - a read-only dry run of the same event/override
    resolution _run_poll uses, for the Configure > Upcoming notifications
    screen. Lets someone see whether a reminder they expect is even in the
    queue, and whether it's already fired, before waiting around for it.
    """
    options = entry.options
    calendars = options.get(CONF_CALENDARS, [])

    # Reminders can be added to any event via the card's event-info popup,
    # on any calendar - but only calendars listed under "Calendars to
    # monitor" ever get polled, so a reminder on an unmonitored calendar
    # will silently never fire. Surface that mismatch up front instead of
    # just showing an empty/confusing list.
    monitored = set(calendars)
    override_calendars = {key.split("|", 1)[0] for key in reminder_overrides if "|" in key}
    unmonitored_with_overrides = sorted(override_calendars - monitored)
    warning = ""
    if unmonitored_with_overrides:
        warning = (
            "Note: reminder(s) are set on "
            + ", ".join(unmonitored_with_overrides)
            + ", but that calendar isn't in \"Calendars to monitor\" below, so those reminders will never fire. "
            "Add it under Calendar reminders to include it.\n\n"
        )

    default_target = options.get(CONF_DEFAULT_NOTIFY, "")
    overrides = _parse_overrides(options.get(CONF_OVERRIDES_TEXT, ""))
    now = dt_util.utcnow()
    query_start = now - timedelta(minutes=POLL_QUERY_GRACE_MINUTES)
    window_end = now + timedelta(hours=DEFAULT_LOOKAHEAD_HOURS)

    # Standalone reminders (to-do items) don't depend on "Calendars to
    # monitor" at all, so - unlike the calendar-event loop below - this
    # isn't gated on `calendars` being non-empty; someone with only
    # reminders configured and no calendars yet should still see them here.
    rows: list[tuple[Any, str]] = []
    for calendar_entity in calendars:
        try:
            response = await hass.services.async_call(
                "calendar",
                "get_events",
                {
                    "entity_id": calendar_entity,
                    "start_date_time": query_start.isoformat(),
                    "end_date_time": window_end.isoformat(),
                },
                blocking=True,
                return_response=True,
            )
        except Exception:  # noqa: BLE001 - one bad calendar must not blank the whole preview
            continue

        events = ((response or {}).get(calendar_entity) or {}).get("events", [])
        for event in events:
            start_raw = event.get("start")
            if not start_raw or "T" not in str(start_raw):
                continue
            event_start = dt_util.parse_datetime(str(start_raw))
            if event_start is None:
                continue
            if event_start.tzinfo is None:
                event_start = dt_util.as_utc(event_start)

            summary = event.get("summary") or "(untitled)"
            description = event.get("description") or ""
            is_reminder_type = _is_reminder_type_event(description)
            if is_reminder_type:
                lead_minutes_list = [0]
            else:
                override_key = _event_override_key(calendar_entity, int(event_start.timestamp()), summary)
                lead_minutes_list = (
                    reminder_overrides[override_key] if override_key in reminder_overrides else _parse_reminder_minutes(description)
                )
            if not lead_minutes_list:
                continue

            if is_reminder_type:
                targets = overrides.get(REMINDER_NOTIFY_KEY) or ([default_target] if default_target else [])
            else:
                targets = overrides.get(calendar_entity) or ([default_target] if default_target else [])
            target_text = ", ".join(targets) if targets else "(no notify target configured)"

            for lead_minutes in lead_minutes_list:
                reminder_time = event_start - timedelta(minutes=lead_minutes)
                key = _dedup_key(calendar_entity, event, lead_minutes)
                status = "sent" if key in notified else "pending"
                local_time = dt_util.as_local(reminder_time)
                lead_text = "reminder" if is_reminder_type else f"{lead_minutes}m before"
                rows.append(
                    (
                        reminder_time,
                        f'{local_time.strftime("%a %b %-d, %-I:%M %p")} - "{summary}" '
                        f"({lead_text}) -> {target_text} [{status}]",
                    )
                )

    # Standalone reminders (to-do items on CONF_REMINDERS_ENTITY) are a
    # separate source from the calendar-event reminders above - included
    # here too so the preview is a complete picture of everything about to
    # notify, not just the calendar side.
    reminders_entity = options.get(CONF_REMINDERS_ENTITY)
    if reminders_entity:
        try:
            reminder_response = await hass.services.async_call(
                "todo",
                "get_items",
                {"entity_id": reminders_entity, "status": ["needs_action"]},
                blocking=True,
                return_response=True,
            )
            reminder_items = ((reminder_response or {}).get(reminders_entity) or {}).get("items", [])
        except Exception:  # noqa: BLE001 - the to-do list may not exist (yet)
            reminder_items = []
        reminder_targets = overrides.get(reminders_entity) or ([default_target] if default_target else [])
        reminder_target_text = ", ".join(reminder_targets) if reminder_targets else "(no notify target configured)"
        for item in reminder_items:
            uid = item.get("uid")
            due_raw = item.get("due")
            summary = item.get("summary") or "(untitled)"
            if not uid or not due_raw:
                continue
            due_dt = dt_util.parse_datetime(str(due_raw))
            if due_dt is None:
                continue
            if due_dt.tzinfo is None:
                due_dt = dt_util.as_utc(due_dt)
            key = f"{reminders_entity}|{uid}|{int(due_dt.timestamp())}"
            status = "sent" if key in notified else "pending"
            local_time = dt_util.as_local(due_dt)
            rows.append(
                (
                    due_dt,
                    f'{local_time.strftime("%a %b %-d, %-I:%M %p")} - "{summary}" '
                    f"(reminder to-do) -> {reminder_target_text} [{status}]",
                )
            )

    if not rows:
        return warning + f"No upcoming reminders in the next {DEFAULT_LOOKAHEAD_HOURS} hours."

    rows.sort(key=lambda r: r[0])
    max_rows = 25
    lines = [text for _, text in rows[:max_rows]]
    if len(rows) > max_rows:
        lines.append(f"...and {len(rows) - max_rows} more.")
    return warning + "\n".join(lines)


# ---------------------------------------------------------------------------
# Dashboard resource auto-registration (best-effort)
# ---------------------------------------------------------------------------


def _file_content_hash(path: str) -> str:
    """Short, stable hash of a file's bytes - used to cache-bust the card URL.

    Browsers (and their ES module import cache in particular) hang onto a
    previously-loaded script for the lifetime of the page, independent of
    what the file on disk now contains. A restart alone does not force a
    reload of an already-open dashboard tab. Appending "?v=<hash>" to the
    served URL means every content change is automatically a new URL, so a
    normal page reload always fetches the current file - no manual cache
    clearing, no version bumping by hand.
    """
    try:
        with open(path, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()[:10]
    except OSError:
        return "0"


def _register_dashboard_resource(hass: HomeAssistant, versioned_url: str) -> None:
    """Best-effort: ensure the calendar card is registered as a dashboard resource.

    Uses Home Assistant's internal Lovelace storage collection - there is no
    public API for an integration to add a dashboard resource. Wrapped
    defensively throughout: if HA's internals change, this silently no-ops
    rather than breaking setup, and the resource can always be added by hand
    once (Settings > Dashboards > (top-right menu) > Resources > Add Resource,
    URL {versioned_url}, type "JavaScript Module").

    versioned_url carries a "?v=<hash>" cache-busting suffix (see
    _file_content_hash). An existing resource is matched by its base path
    (the part before "?") and its URL is updated in place when the hash
    changes, rather than accumulating a new resource entry per version -
    this is what makes a plain file replace + restart pick up automatically
    in the browser without ever touching Settings > Dashboards by hand.
    """
    base_path = versioned_url.split("?", 1)[0]
    try:
        lovelace_data = hass.data.get("lovelace")
        if lovelace_data is None:
            return
        resource_collection = getattr(lovelace_data, "resources", None)
        if resource_collection is None:
            return
        if not hasattr(resource_collection, "async_create_item") or not hasattr(
            resource_collection, "store"
        ):
            # YAML-mode dashboards use a plain list-backed collection with no
            # create method worth calling - nothing safe to do here.
            return

        async def _ensure() -> None:
            try:
                if not getattr(resource_collection, "loaded", True):
                    await resource_collection.async_load()
                    resource_collection.loaded = True
                existing = resource_collection.async_items()
                match = next(
                    (item for item in existing if (item.get("url") or "").split("?", 1)[0] == base_path),
                    None,
                )
                if match is None:
                    await resource_collection.async_create_item(
                        {"res_type": "module", "url": versioned_url}
                    )
                    _LOGGER.info("Family Hub: registered %s as a dashboard resource", versioned_url)
                    return
                if (match.get("url") or "") == versioned_url:
                    return
                if hasattr(resource_collection, "async_update_item"):
                    await resource_collection.async_update_item(match["id"], {"url": versioned_url})
                    _LOGGER.info(
                        "Family Hub: card changed, updated dashboard resource to %s", versioned_url
                    )
                else:
                    _LOGGER.debug(
                        "Family Hub: card changed but this HA version's resource collection has no "
                        "update method - update the resource URL by hand in Settings > Dashboards > "
                        "Resources to %s",
                        versioned_url,
                    )
            except Exception as err:  # noqa: BLE001
                _LOGGER.debug(
                    "Family Hub: could not auto-register/update dashboard resource: %s", err
                )

        hass.async_create_task(_ensure())
    except Exception as err:  # noqa: BLE001
        _LOGGER.debug("Family Hub: dashboard resource auto-registration skipped: %s", err)


# ---------------------------------------------------------------------------
# Integration setup / teardown
# ---------------------------------------------------------------------------


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Register the theme storage and websocket commands (once, at startup)."""
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN]["theme_store"] = Store(hass, THEME_STORAGE_VERSION, THEME_STORAGE_KEY)
    hass.data[DOMAIN].setdefault("entries", {})

    websocket_api.async_register_command(hass, _ws_list_themes)
    websocket_api.async_register_command(hass, _ws_save_themes)
    websocket_api.async_register_command(hass, _ws_get_notify_config)
    websocket_api.async_register_command(hass, _ws_set_notify_overrides)
    websocket_api.async_register_command(hass, _ws_get_reminder_overrides)
    websocket_api.async_register_command(hass, _ws_set_reminder_override)
    websocket_api.async_register_command(hass, _ws_set_reminders_entity)
    websocket_api.async_register_command(hass, _ws_set_notification_click_path)
    websocket_api.async_register_command(hass, _ws_get_grocy_recipes)
    websocket_api.async_register_command(hass, _ws_get_grocy_recipe_detail)
    websocket_api.async_register_command(hass, _ws_delete_grocy_recipe)
    websocket_api.async_register_command(hass, _ws_get_grocery_list_status)
    websocket_api.async_register_command(hass, _ws_push_grocery_list)
    websocket_api.async_register_command(hass, _ws_consume_grocy_recipe)
    websocket_api.async_register_command(hass, _ws_get_grocy_shopping_list)
    websocket_api.async_register_command(hass, _ws_add_grocy_shopping_list_item)
    websocket_api.async_register_command(hass, _ws_remove_grocy_shopping_list_item)
    websocket_api.async_register_command(hass, _ws_toggle_grocy_shopping_list_item)
    websocket_api.async_register_command(hass, _ws_get_grocy_locations)
    websocket_api.async_register_command(hass, _ws_put_away_grocy_shopping_list_item)
    websocket_api.async_register_command(hass, _ws_get_grocy_expiring_soon)
    websocket_api.async_register_command(hass, _ws_set_grocy_expiring_enabled)
    websocket_api.async_register_command(hass, _ws_get_grocy_low_stock)
    websocket_api.async_register_command(hass, _ws_set_grocy_low_stock_enabled)
    websocket_api.async_register_command(hass, _ws_add_missing_grocy_products_to_shopping_list)
    websocket_api.async_register_command(hass, _ws_get_grocy_shopping_lists)
    websocket_api.async_register_command(hass, _ws_create_grocy_shopping_list)
    websocket_api.async_register_command(hass, _ws_move_grocy_shopping_list_item)
    websocket_api.async_register_command(hass, _ws_create_grocy_location)
    websocket_api.async_register_command(hass, _ws_create_grocy_quantity_unit)
    websocket_api.async_register_command(hass, _ws_parse_recipe_url)
    websocket_api.async_register_command(hass, _ws_parse_recipe_text)
    websocket_api.async_register_command(hass, _ws_match_recipe_ingredients)
    websocket_api.async_register_command(hass, _ws_create_grocy_product)
    websocket_api.async_register_command(hass, _ws_create_grocy_recipe)
    websocket_api.async_register_command(hass, _ws_set_daily_digest)
    websocket_api.async_register_command(hass, _ws_get_settings)
    websocket_api.async_register_command(hass, _ws_set_settings)
    websocket_api.async_register_command(hass, _ws_get_recipes)
    websocket_api.async_register_command(hass, _ws_set_recipes)
    websocket_api.async_register_command(hass, _ws_get_suggestions)
    websocket_api.async_register_command(hass, _ws_set_suggestions)

    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Serve the panel + card, register the resource, sync themes, start polling."""
    integration_dir = hass.config.path("custom_components", DOMAIN)
    panel_path = f"{integration_dir}/panel/theme-builder-panel.js"
    card_path = f"{integration_dir}/card/family-week-calendar-card.js"
    theme_selector_path = f"{integration_dir}/panel/theme-selector-card.js"
    today_card_path = f"{integration_dir}/card/family-today-card.js"
    icon_path = f"{integration_dir}/icon.png"

    static_paths = [
        StaticPathConfig(PANEL_JS_URL, panel_path, False),
        StaticPathConfig(CARD_JS_URL, card_path, False),
        StaticPathConfig(THEME_SELECTOR_CARD_JS_URL, theme_selector_path, False),
        StaticPathConfig(TODAY_CARD_JS_URL, today_card_path, False),
    ]
    icon_exists = await hass.async_add_executor_job(os.path.isfile, icon_path)
    if icon_exists:
        static_paths.append(StaticPathConfig(ICON_URL, icon_path, False))
    await hass.http.async_register_static_paths(static_paths)

    # Cache-bust both URLs off the files' actual contents, so a plain file
    # replace + restart is picked up by an already-open browser tab without
    # any manual cache clearing (see _file_content_hash for why).
    panel_hash = await hass.async_add_executor_job(_file_content_hash, panel_path)
    card_hash = await hass.async_add_executor_job(_file_content_hash, card_path)
    theme_selector_hash = await hass.async_add_executor_job(_file_content_hash, theme_selector_path)
    today_card_hash = await hass.async_add_executor_job(_file_content_hash, today_card_path)
    panel_url_versioned = f"{PANEL_JS_URL}?v={panel_hash}"
    card_url_versioned = f"{CARD_JS_URL}?v={card_hash}"
    theme_selector_url_versioned = f"{THEME_SELECTOR_CARD_JS_URL}?v={theme_selector_hash}"
    today_card_url_versioned = f"{TODAY_CARD_JS_URL}?v={today_card_hash}"
    icon_url_versioned = ""
    if icon_exists:
        icon_hash = await hass.async_add_executor_job(_file_content_hash, icon_path)
        icon_url_versioned = f"{ICON_URL}?v={icon_hash}"

    try:
        await panel_custom.async_register_panel(
            hass,
            frontend_url_path=PANEL_URL,
            webcomponent_name="theme-builder-panel",
            sidebar_title=PANEL_TITLE,
            sidebar_icon=PANEL_ICON,
            module_url=panel_url_versioned,
            embed_iframe=False,
            trust_external=False,
            require_admin=False,
            config={"iconUrl": icon_url_versioned},
        )
    except ValueError:
        # Panel path already registered (e.g. a reload) - safe to ignore.
        _LOGGER.debug("Family Hub panel already registered")

    _register_dashboard_resource(hass, card_url_versioned)
    _register_dashboard_resource(hass, theme_selector_url_versioned)
    _register_dashboard_resource(hass, today_card_url_versioned)

    themes = await _load_themes(hass)
    _register_ha_themes(hass, themes)

    reminders_store: Store = Store(
        hass, REMINDERS_STORAGE_VERSION, f"{REMINDERS_STORAGE_KEY_PREFIX}_{entry.entry_id}"
    )
    notified: dict[str, str] = await reminders_store.async_load() or {}

    reminder_overrides_store: Store = Store(
        hass,
        REMINDER_OVERRIDES_STORAGE_VERSION,
        f"{REMINDER_OVERRIDES_STORAGE_KEY_PREFIX}_{entry.entry_id}",
    )
    reminder_overrides: dict[str, list[int]] = await reminder_overrides_store.async_load() or {}

    digest_store: Store = Store(
        hass, DAILY_DIGEST_STORAGE_VERSION, f"{DAILY_DIGEST_STORAGE_KEY_PREFIX}_{entry.entry_id}"
    )
    digest_state: dict[str, str] = await digest_store.async_load() or {}

    settings_store: Store = Store(
        hass, SETTINGS_STORAGE_VERSION, f"{SETTINGS_STORAGE_KEY_PREFIX}_{entry.entry_id}"
    )

    recipes_store: Store = Store(
        hass, RECIPES_STORAGE_VERSION, f"{RECIPES_STORAGE_KEY_PREFIX}_{entry.entry_id}"
    )

    suggestions_store: Store = Store(
        hass, SUGGESTIONS_STORAGE_VERSION, f"{SUGGESTIONS_STORAGE_KEY_PREFIX}_{entry.entry_id}"
    )

    grocy_conversions_sync_store: Store = Store(
        hass,
        GROCY_CONVERSIONS_SYNC_STORAGE_VERSION,
        f"{GROCY_CONVERSIONS_SYNC_STORAGE_KEY_PREFIX}_{entry.entry_id}",
    )

    grocery_pushed_store: Store = Store(
        hass, GROCERY_PUSHED_STORAGE_VERSION, f"{GROCERY_PUSHED_STORAGE_KEY_PREFIX}_{entry.entry_id}"
    )

    async def _poll(_now=None) -> None:
        await _run_poll(hass, entry, reminders_store, notified, reminder_overrides)
        await _poll_reminders_todo(hass, entry, reminders_store, notified)
        await _maybe_send_daily_digest(hass, entry, digest_store, digest_state)

    poll_minutes = entry.options.get(CONF_POLL_MINUTES, DEFAULT_POLL_MINUTES)
    cancel = async_track_time_interval(hass, _poll, timedelta(minutes=poll_minutes))

    hass.data[DOMAIN]["entries"][entry.entry_id] = {
        "cancel": cancel,
        "notified": notified,
        "reminders_store": reminders_store,
        "reminder_overrides": reminder_overrides,
        "reminder_overrides_store": reminder_overrides_store,
        "digest_store": digest_store,
        "digest_state": digest_state,
        "settings_store": settings_store,
        "recipes_store": recipes_store,
        "suggestions_store": suggestions_store,
        "grocery_pushed_store": grocery_pushed_store,
    }

    entry.async_on_unload(entry.add_update_listener(_async_options_updated))

    # Run once shortly after setup/restart rather than waiting a full poll
    # interval before the first reminder check.
    hass.async_create_task(_poll())

    # Best-effort, backgrounded on purpose (see _maybe_sync_standard_unit_
    # conversions's own docstring) - a slow or unreachable Grocy must never
    # delay the rest of setup, and this only actually does anything the
    # first time a household runs a given generation of family_hub's
    # standard conversion set (an already-synced install is a single fast
    # Store read, not a Grocy round trip).
    hass.async_create_task(
        _maybe_sync_standard_unit_conversions(hass, entry, grocy_conversions_sync_store)
    )

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Cancel polling and remove the sidebar panel + any native themes we registered."""
    entry_data = hass.data.get(DOMAIN, {}).get("entries", {}).pop(entry.entry_id, None)
    if entry_data and entry_data.get("cancel"):
        entry_data["cancel"]()

    try:
        from homeassistant.components.frontend import async_remove_panel

        async_remove_panel(hass, PANEL_URL)
    except (ImportError, KeyError, ValueError):
        pass

    try:
        frontend_themes = hass.data.get("frontend_themes")
        if frontend_themes is not None:
            for name in [n for n in frontend_themes if n.startswith(HA_THEME_PREFIX)]:
                frontend_themes.pop(name, None)
            hass.bus.async_fire("themes_updated")
    except Exception:  # noqa: BLE001 - defensive
        _LOGGER.debug("Could not clean up native HA themes on unload", exc_info=True)

    return True


async def _async_options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)
