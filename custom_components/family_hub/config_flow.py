"""Config flow for Family Hub."""
from __future__ import annotations

import json
import re
from datetime import timedelta
from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.components.http.auth import async_sign_path
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import selector

from . import (
    _build_upcoming_summary,
    _capture_settings_history_snapshot,
    _get_family_hub_entry_data,
    _overrides_to_text,
    _parse_overrides,
    _restore_settings_history_snapshot,
    store as chores_store,
    updater,
)
from homeassistant.util import dt as dt_util
from .const import (
    CONF_CALENDARS,
    CONF_DAILY_DIGEST_ENABLED,
    CONF_DAILY_DIGEST_TIME,
    CONF_DEFAULT_NOTIFY,
    CONF_GROCY_API_KEY,
    CONF_GROCY_URL,
    CONF_INITIAL_GOALS_IN_CHORES,
    CONF_INITIAL_CALENDARS,
    CONF_INITIAL_GOALS_IN_REWARDS,
    CONF_INITIAL_MEMBER_USER_IDS,
    CONF_INITIAL_ROUTINES_ENABLED,
    CONF_INITIAL_USER_PROFILES,
    CONF_MEAL_PLAN_ENTITY,
    CONF_OVERRIDES_TEXT,
    CONF_POLL_MINUTES,
    CONF_REMINDERS_ENTITY,
    CONF_UPDATE_FILE,
    DAILY_DIGEST_NOTIFY_KEY,
    DEFAULT_DAILY_DIGEST_TIME,
    DEFAULT_POLL_MINUTES,
    DOMAIN,
    SETTINGS_BACKUP_DIR_NAME,
    SETTINGS_HISTORY_MAX_SNAPSHOTS as _SETTINGS_HISTORY_MAX_SNAPSHOTS,
)


def _notify_target_selector(hass, *, multiple: bool = False) -> selector.Selector:
    try:
        services = hass.services.async_services().get("notify", {})
        options = sorted(f"notify.{name}" for name in services)
    except Exception:  # noqa: BLE001 - defensive, never block the flow on this
        options = []
    return selector.SelectSelector(
        selector.SelectSelectorConfig(
            options=options,
            custom_value=True,
            multiple=multiple,
            mode=selector.SelectSelectorMode.DROPDOWN,
        )
    )


def _build_reminders_schema(hass, defaults: dict[str, Any]) -> vol.Schema:
    return vol.Schema(
        {
            vol.Optional(
                CONF_CALENDARS, default=defaults.get(CONF_CALENDARS, [])
            ): selector.EntitySelector(
                selector.EntitySelectorConfig(domain="calendar", multiple=True)
            ),
            vol.Optional(
                CONF_DEFAULT_NOTIFY, default=defaults.get(CONF_DEFAULT_NOTIFY, "")
            ): _notify_target_selector(hass),
            vol.Optional(
                CONF_POLL_MINUTES,
                default=defaults.get(CONF_POLL_MINUTES, DEFAULT_POLL_MINUTES),
            ): selector.NumberSelector(
                selector.NumberSelectorConfig(min=1, max=60, mode=selector.NumberSelectorMode.BOX)
            ),
            vol.Optional(
                CONF_OVERRIDES_TEXT, default=defaults.get(CONF_OVERRIDES_TEXT, "")
            ): selector.TextSelector(selector.TextSelectorConfig(multiline=True)),
        }
    )


def _build_grocy_schema(defaults: dict[str, Any]) -> vol.Schema:
    return vol.Schema(
        {
            vol.Optional(
                CONF_GROCY_URL, default=defaults.get(CONF_GROCY_URL, "")
            ): selector.TextSelector(selector.TextSelectorConfig(type=selector.TextSelectorType.URL)),
            vol.Optional(
                CONF_GROCY_API_KEY, default=defaults.get(CONF_GROCY_API_KEY, "")
            ): selector.TextSelector(selector.TextSelectorConfig(type=selector.TextSelectorType.PASSWORD)),
        }
    )


# the first-time setup wizard's opening "which features do you want" step (async_step_features)
_FEATURE_CHORES = "chores"
_FEATURE_GROCY = "grocy"
_FEATURE_DIGEST = "digest"
# _FEATURE_REMINDERS ("Reminders & Meal Plan to-do lists") is gone - it only ever gated async_step_todo_lists, which is gone too
_ALL_FEATURES = (_FEATURE_CHORES, _FEATURE_GROCY, _FEATURE_DIGEST)
_FEATURES_FIELD = "setup_features"

_FEATURE_LABELS = {
    _FEATURE_CHORES: "Chores, Rewards, Routines & Goals",
    _FEATURE_GROCY: "Grocy",
    _FEATURE_DIGEST: "Daily Digest",
}


def _build_features_schema() -> vol.Schema:
    # Every feature defaults to checked - a household that just clicks through this screen without touching anything sees the exact same full
    return vol.Schema(
        {
            vol.Optional(_FEATURES_FIELD, default=list(_ALL_FEATURES)): selector.SelectSelector(
                selector.SelectSelectorConfig(
                    options=[
                        selector.SelectOptionDict(value=key, label=label)
                        for key, label in _FEATURE_LABELS.items()
                    ],
                    multiple=True,
                    mode=selector.SelectSelectorMode.LIST,
                )
            ),
        }
    )


# async_step_users' own field name - reuses CONF_INITIAL_MEMBER_USER_IDS directly as the form field rather than a separate transient name
async def _list_member_choices(hass: HomeAssistant) -> list[dict[str, str]]:
    """Same shape/filter as __init__.py's family_hub/list_users websocket command (_ws_list_users) - id + display name, system-generated accounts"""
    try:
        users = await hass.auth.async_get_users()
    except Exception:  # noqa: BLE001 - never block setup over the user list
        return []
    return sorted(
        (
            {"id": u.id, "name": u.name or u.id}
            for u in users
            if not getattr(u, "system_generated", False)
        ),
        key=lambda u: u["name"].lower(),
    )


def _build_users_schema(members: list[dict[str, str]]) -> vol.Schema:
    return vol.Schema(
        {
            vol.Optional(CONF_INITIAL_MEMBER_USER_IDS, default=[]): selector.SelectSelector(
                selector.SelectSelectorConfig(
                    options=[selector.SelectOptionDict(value=m["id"], label=m["name"]) for m in members],
                    multiple=True,
                    mode=selector.SelectSelectorMode.LIST,
                )
            ),
        }
    )


# async_step_member_profile's own two field names - one small form shown once per member picked on the Users step
_MEMBER_COLOR_FIELD = "member_color"
_MEMBER_INCLUDE_FIELD = "member_include_in_chores"
# v1.168.60: optional - this member's own calendar, which becomes their
# column on the family calendar (their profile's primaryCalendar).
_MEMBER_CALENDAR_FIELD = "member_calendar"


def _build_member_profile_schema(default_color: str) -> vol.Schema:
    return vol.Schema(
        {
            vol.Optional(_MEMBER_COLOR_FIELD, default=default_color): selector.SelectSelector(
                selector.SelectSelectorConfig(
                    options=[selector.SelectOptionDict(value=c, label=c) for c in _PEOPLE_COLOR_PALETTE],
                    mode=selector.SelectSelectorMode.DROPDOWN,
                )
            ),
            vol.Optional(_MEMBER_INCLUDE_FIELD, default=True): selector.BooleanSelector(),
            vol.Optional(_MEMBER_CALENDAR_FIELD): selector.EntitySelector(
                selector.EntitySelectorConfig(domain="calendar")
            ),
        }
    )


# async_step_chores_features' own three field names - the same Routines/ Goals-on-Chores/Goals-on-Rewards toggles Settings' "Chores
_ROUTINES_FIELD = "routines_enabled"
_GOALS_IN_CHORES_FIELD = "goals_in_chores"
_GOALS_IN_REWARDS_FIELD = "goals_in_rewards"


def _build_chores_features_schema() -> vol.Schema:
    return vol.Schema(
        {
            vol.Optional(_ROUTINES_FIELD, default=True): selector.BooleanSelector(),
            vol.Optional(_GOALS_IN_CHORES_FIELD, default=False): selector.BooleanSelector(),
            vol.Optional(_GOALS_IN_REWARDS_FIELD, default=False): selector.BooleanSelector(),
        }
    )


def _build_calendars_schema(defaults: dict[str, Any]) -> vol.Schema:
    return vol.Schema(
        {
            vol.Optional(
                CONF_CALENDARS, default=defaults.get(CONF_CALENDARS, [])
            ): selector.EntitySelector(
                selector.EntitySelectorConfig(domain="calendar", multiple=True)
            ),
        }
    )


# _build_todo_lists_schema/_REMINDERS_NOTIFY_FIELD (the now-removed "Meal Plan & Reminders lists" step's own schema
def _build_notifications_schema(hass, defaults: dict[str, Any]) -> vol.Schema:
    return vol.Schema(
        {
            vol.Optional(
                CONF_DEFAULT_NOTIFY, default=defaults.get(CONF_DEFAULT_NOTIFY, "")
            ): _notify_target_selector(hass),
        }
    )


# Transient wizard-only field for async_step_digest's recipient list - like _REMINDERS_NOTIFY_FIELD
_DIGEST_RECIPIENTS_FIELD = "digest_recipients"


def _build_digest_schema(hass, defaults: dict[str, Any]) -> vol.Schema:
    return vol.Schema(
        {
            vol.Optional(
                CONF_DAILY_DIGEST_ENABLED, default=defaults.get(CONF_DAILY_DIGEST_ENABLED, False)
            ): selector.BooleanSelector(),
            vol.Optional(
                CONF_DAILY_DIGEST_TIME, default=defaults.get(CONF_DAILY_DIGEST_TIME, DEFAULT_DAILY_DIGEST_TIME)
            ): selector.TextSelector(),
            vol.Optional(_DIGEST_RECIPIENTS_FIELD, default=[]): _notify_target_selector(
                hass, multiple=True
            ),
        }
    )


# Member board colors offered on the member-profile step
_PEOPLE_COLOR_PALETTE = ["#d9bf7e", "#7ec9d9", "#d97e9e", "#9ed97e", "#b07ed9", "#d9a67e"]


def _normalize_options(user_input: dict[str, Any] | None) -> dict[str, Any]:
    user_input = user_input or {}
    return {
        CONF_CALENDARS: user_input.get(CONF_CALENDARS, []),
        CONF_DEFAULT_NOTIFY: user_input.get(CONF_DEFAULT_NOTIFY, ""),
        CONF_POLL_MINUTES: int(user_input.get(CONF_POLL_MINUTES, DEFAULT_POLL_MINUTES) or DEFAULT_POLL_MINUTES),
        CONF_OVERRIDES_TEXT: user_input.get(CONF_OVERRIDES_TEXT, ""),
    }


class FamilyHubConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Which features to turn on, who's in the household, chores/rewards setup for them, calendars to monitor, Grocy, and Meal Plan/Reminders to-do lists"""

    VERSION = 1

    def __init__(self) -> None:
        # Accumulates option values across steps; written into the config entry's options in one shot by async_step_finish
        self._collected_options: dict[str, Any] = {}
        # Which optional sections the Features step turned on - controls step routing only, never persisted (see _ALL_FEATURES).
        self._selected_features: set[str] = set(_ALL_FEATURES)
        # Users/member-profile step state - see async_step_users/ async_step_member_profile.
        self._member_setup_queue: list[str] = []
        self._member_profiles: dict[str, dict[str, Any]] = {}
        self._member_names: dict[str, str] = {}

    def _feature_selected(self, feature: str) -> bool:
        return feature in self._selected_features

    async def async_step_user(self, user_input: dict[str, Any] | None = None):
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        return await self.async_step_features()

    async def async_step_features(self, user_input: dict[str, Any] | None = None):
        """Opening screen: which optional sections of the rest of this wizard does the household actually want?"""
        if user_input is not None:
            self._selected_features = set(user_input.get(_FEATURES_FIELD) or [])
            if self._feature_selected(_FEATURE_CHORES):
                return await self.async_step_users()
            return await self.async_step_calendars()

        return self.async_show_form(step_id="features", data_schema=_build_features_schema())

    async def async_step_users(self, user_input: dict[str, Any] | None = None):
        """Pick which Home Assistant login accounts to add as Family Hub
        members - reached only when "Chores, Rewards, Routines & Goals" was
        checked on the Features step. This is the actual "add users" step:
        membership (SETTINGS_KEY_MEMBER_USER_IDS) is what makes someone show
        up on the Users/Permissions tabs, the Chores board, and every
        assignment picker - previously only reachable by hand afterward via
        the card's own Settings. The picks here don't take effect until
        __init__.py's _maybe_seed_settings_from_setup_wizard runs on first
        setup (see its own docstring, and CONF_INITIAL_* in const.py) -
        there's no runtime Settings store to write into yet at this point in
        the flow, only entry.options once the entry itself is created."""
        if user_input is not None:
            member_ids = [uid for uid in (user_input.get(CONF_INITIAL_MEMBER_USER_IDS) or []) if uid]
            self._collected_options[CONF_INITIAL_MEMBER_USER_IDS] = member_ids
            self._member_setup_queue = list(member_ids)
            self._member_profiles = {}
            return await self.async_step_member_profile()

        members = await _list_member_choices(self.hass)
        self._member_names = {m["id"]: m["name"] for m in members}
        return self.async_show_form(
            step_id="users",
            data_schema=_build_users_schema(members),
        )

    async def async_step_member_profile(self, user_input: dict[str, Any] | None = None):
        """One small screen per member picked on the Users step - their board color (from _PEOPLE_COLOR_PALETTE"""
        if user_input is not None and self._member_setup_queue:
            user_id = self._member_setup_queue[0]
            self._member_profiles[user_id] = {
                "color": user_input.get(_MEMBER_COLOR_FIELD) or "",
                "includeInChores": bool(user_input.get(_MEMBER_INCLUDE_FIELD, True)),
            }
            member_calendar = user_input.get(_MEMBER_CALENDAR_FIELD)
            if isinstance(member_calendar, str) and member_calendar.startswith("calendar."):
                self._member_profiles[user_id]["primaryCalendar"] = member_calendar
            self._member_setup_queue.pop(0)

        if not self._member_setup_queue:
            return await self.async_step_chores_features()

        user_id = self._member_setup_queue[0]
        member_ids = self._collected_options.get(CONF_INITIAL_MEMBER_USER_IDS) or []
        idx = member_ids.index(user_id) if user_id in member_ids else 0
        default_color = _PEOPLE_COLOR_PALETTE[idx % len(_PEOPLE_COLOR_PALETTE)]
        return self.async_show_form(
            step_id="member_profile",
            data_schema=_build_member_profile_schema(default_color),
            description_placeholders={"member_name": self._member_names.get(user_id, user_id)},
        )

    async def async_step_chores_features(self, user_input: dict[str, Any] | None = None):
        """The household-wide Routines/Goals-on-Chores/Goals-on-Rewards
        toggles - same three fields, same off-by-default, as Settings' own
        "Chores, Rewards & Routines" accordion (family-week-calendar-
        card.js). Also where _member_profiles (built up one screen at a
        time by async_step_member_profile) finally gets folded into
        CONF_INITIAL_USER_PROFILES. Reached even when zero members were
        picked (an empty profiles dict is a harmless no-op for
        _maybe_seed_settings_from_setup_wizard) - Routines/Goals can still
        be turned on for whoever gets added later."""
        if user_input is not None:
            self._collected_options[CONF_INITIAL_ROUTINES_ENABLED] = bool(user_input.get(_ROUTINES_FIELD, False))
            self._collected_options[CONF_INITIAL_GOALS_IN_CHORES] = bool(user_input.get(_GOALS_IN_CHORES_FIELD, False))
            self._collected_options[CONF_INITIAL_GOALS_IN_REWARDS] = bool(user_input.get(_GOALS_IN_REWARDS_FIELD, False))
            self._collected_options[CONF_INITIAL_USER_PROFILES] = dict(self._member_profiles)
            return await self.async_step_calendars()

        return self.async_show_form(step_id="chores_features", data_schema=_build_chores_features_schema())

    async def async_step_calendars(self, user_input: dict[str, Any] | None = None):
        """Pick which calendars go on the family calendar."""
        if user_input is not None:
            picked = [e for e in (user_input.get(CONF_CALENDARS) or []) if isinstance(e, str) and e]
            member_calendars = [
                p.get("primaryCalendar")
                for p in (self._collected_options.get(CONF_INITIAL_USER_PROFILES) or {}).values()
                if isinstance(p, dict) and p.get("primaryCalendar")
            ]
            monitored: list[str] = []
            for entity in member_calendars + picked:
                if entity not in monitored:
                    monitored.append(entity)
            self._collected_options[CONF_CALENDARS] = monitored
            self._collected_options[CONF_INITIAL_CALENDARS] = [e for e in picked if e not in member_calendars]
            return await self.async_step_grocy()

        return self.async_show_form(
            step_id="calendars",
            data_schema=_build_calendars_schema(self._collected_options),
        )

    async def async_step_grocy(self, user_input: dict[str, Any] | None = None):
        """Optional Grocy connection, asked up front instead of only being discoverable later via Configure > Grocy - reuses that exact same schema"""
        if not self._feature_selected(_FEATURE_GROCY):
            return await self.async_step_notifications()

        if user_input is not None:
            url = (user_input.get(CONF_GROCY_URL) or "").strip().rstrip("/")
            api_key = (user_input.get(CONF_GROCY_API_KEY) or "").strip()
            if url:
                self._collected_options[CONF_GROCY_URL] = url
            if api_key:
                self._collected_options[CONF_GROCY_API_KEY] = api_key
            return await self.async_step_notifications()

        return self.async_show_form(
            step_id="grocy",
            data_schema=_build_grocy_schema(self._collected_options),
        )

    # async_step_todo_lists ("Meal Plan & Reminders lists") is gone

    async def async_step_notifications(self, user_input: dict[str, Any] | None = None):
        """Who should get a default notification for calendar event reminders"""
        if user_input is not None:
            default_notify = (user_input.get(CONF_DEFAULT_NOTIFY) or "").strip()
            if default_notify:
                self._collected_options[CONF_DEFAULT_NOTIFY] = default_notify
            return await self.async_step_digest()

        return self.async_show_form(
            step_id="notifications",
            data_schema=_build_notifications_schema(self.hass, self._collected_options),
        )

    async def async_step_digest(self, user_input: dict[str, Any] | None = None):
        """Ask whether to turn on the Daily Digest - a once-a-day notification summarizing today's events, due reminders, and planned meals"""
        if not self._feature_selected(_FEATURE_DIGEST):
            self._collected_options[CONF_DAILY_DIGEST_ENABLED] = False
            return await self.async_step_finish()

        if user_input is not None:
            enabled = bool(user_input.get(CONF_DAILY_DIGEST_ENABLED, False))
            self._collected_options[CONF_DAILY_DIGEST_ENABLED] = enabled
            if enabled:
                time_str = str(user_input.get(CONF_DAILY_DIGEST_TIME) or "").strip()
                if not re.match(r"^\d{2}:\d{2}$", time_str):
                    time_str = DEFAULT_DAILY_DIGEST_TIME
                self._collected_options[CONF_DAILY_DIGEST_TIME] = time_str

                recipients = [t for t in (user_input.get(_DIGEST_RECIPIENTS_FIELD) or []) if t]
                if recipients:
                    overrides = _parse_overrides(self._collected_options.get(CONF_OVERRIDES_TEXT, ""))
                    overrides[DAILY_DIGEST_NOTIFY_KEY] = recipients
                    self._collected_options[CONF_OVERRIDES_TEXT] = _overrides_to_text(overrides)
            return await self.async_step_finish()

        return self.async_show_form(
            step_id="digest",
            data_schema=_build_digest_schema(self.hass, self._collected_options),
        )

    async def async_step_finish(self, user_input: dict[str, Any] | None = None):
        """Last screen: a short tour of the cards (in the translations' finish description) plus what reminders and the Daily Digest were set to"""
        if user_input is not None:
            return self.async_create_entry(
                title="Family Hub",
                data={},
                options={**_normalize_options(None), **self._collected_options},
            )

        if self._collected_options.get(CONF_DAILY_DIGEST_ENABLED):
            digest_summary = f"On, daily at {self._collected_options.get(CONF_DAILY_DIGEST_TIME, DEFAULT_DAILY_DIGEST_TIME)}"
        else:
            digest_summary = "Off - turn on any time from the card's Settings or Configure"

        return self.async_show_form(
            step_id="finish",
            data_schema=vol.Schema({}),
            description_placeholders={
                "default_notify": self._collected_options.get(CONF_DEFAULT_NOTIFY)
                or "not set - calendar event reminders won't fire until one is added via Configure",
                "daily_digest": digest_summary,
            },
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return FamilyHubOptionsFlow()


def _read_uploaded_zip_bytes(hass: HomeAssistant, uploaded_file_id: str) -> bytes:
    """Read the bytes of a file uploaded through a FileSelector field.

    Blocking (file I/O) - always call this via hass.async_add_executor_job,
    never awaited directly from a flow step.
    """
    from homeassistant.components.file_upload import process_uploaded_file

    with process_uploaded_file(hass, uploaded_file_id) as file_path:
        return Path(file_path).read_bytes()


_UPDATE_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_UPDATE_FILE): selector.FileSelector(
            selector.FileSelectorConfig(accept=".zip,application/zip")
        ),
    }
)

_TEST_TARGET_FIELD = "target"


def _split_notify_target(target: str) -> tuple[str, str] | None:
    """Turn 'notify.mobile_app_x' into ('notify', 'mobile_app_x').

    Small local copy of the same helper in __init__.py - kept separate so
    config_flow.py doesn't depend on import order relative to __init__.py.
    """
    target = (target or "").strip()
    if not target.startswith("notify."):
        return None
    service = target[len("notify."):]
    if not service:
        return None
    return "notify", service


def _build_test_notify_schema(hass) -> vol.Schema:
    return vol.Schema({vol.Required(_TEST_TARGET_FIELD): _notify_target_selector(hass)})


_RESTORE_SNAPSHOT_FIELD = "snapshot"
_RESTORE_PUSH_DEVICES_FIELD = "push_device_settings"
_EXPORT_SNAPSHOT_FIELD = "snapshot"
_IMPORT_BACKUP_FILE_FIELD = "backup_file"

# Keys a snapshot dict must carry to be treated as a real Family Hub settings-history snapshot rather than some unrelated JSON file someone
_SETTINGS_HISTORY_SNAPSHOT_REQUIRED_KEYS = ("timestamp", "settings", "permissions", "device_settings")


def _write_backup_export_file(hass: HomeAssistant, snapshot: dict[str, Any]) -> str:
    """Writes one Settings-history snapshot out as a standalone JSON file under <config>/family_hub_backups/exports/"""
    export_dir = Path(hass.config.path(SETTINGS_BACKUP_DIR_NAME, "exports"))
    export_dir.mkdir(parents=True, exist_ok=True)
    raw_timestamp = snapshot.get("timestamp")
    safe_timestamp = re.sub(r"[^0-9A-Za-z]+", "-", str(raw_timestamp or "unknown")).strip("-")
    file_path = export_dir / f"family_hub_backup_{safe_timestamp}.json"
    file_path.write_text(json.dumps(snapshot, indent=2, sort_keys=True), encoding="utf-8")
    return str(file_path)


def _read_uploaded_backup_snapshot(hass: HomeAssistant, uploaded_file_id: str) -> dict[str, Any]:
    """Reads and parses a snapshot JSON file uploaded through a FileSelector field (same process_uploaded_file idiom as _read_uploaded_zip_bytes above"""
    from homeassistant.components.file_upload import process_uploaded_file

    with process_uploaded_file(hass, uploaded_file_id) as file_path:
        raw = Path(file_path).read_text(encoding="utf-8")
    try:
        data = json.loads(raw)
    except ValueError as err:
        raise ValueError("not valid JSON") from err
    if not isinstance(data, dict):
        raise ValueError("not a JSON object")
    for key in _SETTINGS_HISTORY_SNAPSHOT_REQUIRED_KEYS:
        if key not in data:
            raise ValueError(f"missing '{key}'")
    if not isinstance(data.get("timestamp"), str):
        raise ValueError("'timestamp' isn't a string")
    for key in ("settings", "permissions", "device_settings"):
        if not isinstance(data.get(key), dict):
            raise ValueError(f"'{key}' isn't an object")
    # Only the four recognized keys are kept - an export is meant to be re-imported as-is
    return {key: data[key] for key in _SETTINGS_HISTORY_SNAPSHOT_REQUIRED_KEYS}


def _describe_settings_history_snapshot(snapshot: dict[str, Any], now) -> str:
    """Label for one Settings-history snapshot shown in the restore/export picker and in confirmation/abort messages - the actual local date and time it was taken"""
    timestamp = snapshot.get("timestamp")
    parsed = dt_util.parse_datetime(timestamp) if isinstance(timestamp, str) else None
    if parsed is None:
        return str(timestamp or "unknown time")
    local = dt_util.as_local(parsed)
    date_part = local.strftime("%b %-d, %Y, %-I:%M %p")
    delta = now - parsed
    seconds = max(int(delta.total_seconds()), 0)
    if seconds < 90:
        relative = "just now"
    else:
        minutes = seconds // 60
        if minutes < 60:
            relative = f"{minutes} minute{'s' if minutes != 1 else ''} ago"
        else:
            hours = minutes // 60
            if hours < 48:
                relative = f"{hours} hour{'s' if hours != 1 else ''} ago"
            else:
                days = hours // 24
                relative = f"{days} day{'s' if days != 1 else ''} ago"
    return f"{date_part} ({relative})"


class FamilyHubOptionsFlow(config_entries.OptionsFlow):
    """Configure reminders, send a test notification, install an update, or
    get pointed at the card's own Settings modal - all live here
    since this is where an admin would already be looking (Settings >
    Devices & Services > Family Hub > Configure), not a separate sidebar
    panel."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None):
        return self.async_show_menu(
            step_id="init",
            menu_options=[
                "settings", "reminders", "grocy", "test_notify", "upcoming", "restore_backup", "update",
            ],
        )

    # Home Assistant's own "Configure" button (Settings -> Devices & Services -> Family Hub -> Configure) already opens this options flow's menu
    async def async_step_settings(self, user_input: dict[str, Any] | None = None):
        return self.async_show_form(step_id="settings", data_schema=vol.Schema({}))

    async def async_step_reminders(self, user_input: dict[str, Any] | None = None):
        if user_input is not None:
            # Merge onto the existing options rather than replacing them outright - reminders_entity, the Daily Digest settings, notification_click_path
            return self.async_create_entry(
                title="", data={**self.config_entry.options, **_normalize_options(user_input)}
            )

        return self.async_show_form(
            step_id="reminders",
            data_schema=_build_reminders_schema(self.hass, dict(self.config_entry.options)),
        )

    async def async_step_grocy(self, user_input: dict[str, Any] | None = None):
        """Connect Family Hub to a self-hosted Grocy instance so the Meal
        Suggestions box can offer "Add from Grocy" - pulling in a recipe's
        name plus a link back to view it in Grocy. Entirely optional; leave
        both fields blank if you don't use Grocy.

        The API key lives here (private integration options), not in the
        card's own Settings - that JSON blob is visible via Home Assistant's
        own To-do UI, which is no place for a credential.
        """
        if user_input is not None:
            url = (user_input.get(CONF_GROCY_URL) or "").strip().rstrip("/")
            api_key = (user_input.get(CONF_GROCY_API_KEY) or "").strip()
            return self.async_create_entry(
                title="",
                data={
                    **self.config_entry.options,
                    CONF_GROCY_URL: url,
                    CONF_GROCY_API_KEY: api_key,
                },
            )

        return self.async_show_form(
            step_id="grocy",
            data_schema=_build_grocy_schema(dict(self.config_entry.options)),
        )

    async def async_step_test_notify(self, user_input: dict[str, Any] | None = None):
        """Fire a one-off notification at any registered notify.* target right now, independent of calendars/reminders"""
        if user_input is not None:
            target = user_input.get(_TEST_TARGET_FIELD, "")
            split = _split_notify_target(target)
            if split is None:
                return self.async_show_form(
                    step_id="test_notify",
                    data_schema=_build_test_notify_schema(self.hass),
                    errors={"base": "invalid_target"},
                    description_placeholders={"target": target or "(empty)"},
                )
            notify_domain, notify_service = split
            try:
                await self.hass.services.async_call(
                    notify_domain,
                    notify_service,
                    {
                        "title": "Family Hub test",
                        "message": "If you got this, Family Hub notifications are working.",
                    },
                    blocking=True,
                )
            except Exception as err:  # noqa: BLE001 - surface the real reason, don't crash the flow
                return self.async_show_form(
                    step_id="test_notify",
                    data_schema=_build_test_notify_schema(self.hass),
                    errors={"base": "test_failed"},
                    description_placeholders={"error": str(err)},
                )

            return self.async_abort(reason="test_sent", description_placeholders={"target": target})

        return self.async_show_form(step_id="test_notify", data_schema=_build_test_notify_schema(self.hass))

    async def async_step_upcoming(self, user_input: dict[str, Any] | None = None):
        """Read-only preview of what's scheduled to fire and when - submitting
        just recomputes and reshows it (acts as a refresh), since this step
        has nothing to save."""
        entry_data = _get_family_hub_entry_data(self.hass) or {}
        summary = await _build_upcoming_summary(
            self.hass,
            self.config_entry,
            entry_data.get("reminder_overrides", {}),
            entry_data.get("notified", {}),
        )
        return self.async_show_form(
            step_id="upcoming",
            data_schema=vol.Schema({}),
            description_placeholders={"summary": summary},
        )

    async def async_step_restore_backup(self, user_input: dict[str, Any] | None = None):
        """Entry point for everything backup-related: restoring an existing automatically-captured snapshot, exporting one to a file"""
        return self.async_show_menu(
            step_id="restore_backup",
            menu_options=["restore_backup_pick", "export_backup", "import_backup"],
        )

    async def async_step_restore_backup_pick(self, user_input: dict[str, Any] | None = None):
        """Step 1 of 2: pick which automatically-captured (or previously imported - the two live in the same history store once imported"""
        entry_data = _get_family_hub_entry_data(self.hass)
        if entry_data is None:
            return self.async_abort(reason="not_found")
        history_store = entry_data.get("settings_history_store")
        history = await chores_store.async_load_settings_history(history_store) if history_store else {"snapshots": []}
        snapshots = history.get("snapshots") or []
        if not snapshots:
            return self.async_abort(reason="no_backups")

        if user_input is not None:
            self._restore_snapshot_index = int(user_input[_RESTORE_SNAPSHOT_FIELD])
            return await self.async_step_restore_backup_confirm()

        now = dt_util.utcnow()
        options = []
        for index, snapshot in enumerate(snapshots):
            options.append(
                selector.SelectOptionDict(
                    value=str(index), label=_describe_settings_history_snapshot(snapshot, now)
                )
            )
        schema = vol.Schema(
            {
                vol.Required(_RESTORE_SNAPSHOT_FIELD): selector.SelectSelector(
                    selector.SelectSelectorConfig(options=options, mode=selector.SelectSelectorMode.LIST)
                ),
            }
        )
        return self.async_show_form(step_id="restore_backup_pick", data_schema=schema)

    async def async_step_export_backup(self, user_input: dict[str, Any] | None = None):
        """Pick one of the existing Settings-history snapshots and make it available two ways: written out as a standalone .json file under"""
        entry_data = _get_family_hub_entry_data(self.hass)
        if entry_data is None:
            return self.async_abort(reason="not_found")
        history_store = entry_data.get("settings_history_store")
        history = await chores_store.async_load_settings_history(history_store) if history_store else {"snapshots": []}
        snapshots = history.get("snapshots") or []
        if not snapshots:
            return self.async_abort(reason="no_backups")

        now = dt_util.utcnow()
        if user_input is not None:
            index = int(user_input[_EXPORT_SNAPSHOT_FIELD])
            if index < 0 or index >= len(snapshots):
                return self.async_abort(reason="no_backups")
            snapshot = snapshots[index]
            path = await self.hass.async_add_executor_job(_write_backup_export_file, self.hass, snapshot)
            download_url = async_sign_path(
                self.hass,
                f"/api/family_hub/settings_history_export/{self.config_entry.entry_id}/{index}",
                timedelta(minutes=5),
            )
            return self.async_abort(
                reason="export_done",
                description_placeholders={
                    "when": _describe_settings_history_snapshot(snapshot, now),
                    "path": path,
                    # a plain Markdown link to this same-origin URL never downloaded anything
                    "download_link": f'<a href="{download_url}" target="_blank" rel="noopener">⬇️ Download the backup file</a>',
                },
            )

        options = []
        for index, snapshot in enumerate(snapshots):
            options.append(
                selector.SelectOptionDict(
                    value=str(index), label=_describe_settings_history_snapshot(snapshot, now)
                )
            )
        schema = vol.Schema(
            {
                vol.Required(_EXPORT_SNAPSHOT_FIELD): selector.SelectSelector(
                    selector.SelectSelectorConfig(options=options, mode=selector.SelectSelectorMode.LIST)
                ),
            }
        )
        return self.async_show_form(step_id="export_backup", data_schema=schema)

    async def async_step_import_backup(self, user_input: dict[str, Any] | None = None):
        """Upload a .json file previously produced by async_step_export_backup"""
        import_schema = vol.Schema(
            {
                vol.Required(_IMPORT_BACKUP_FILE_FIELD): selector.FileSelector(
                    selector.FileSelectorConfig(accept=".json,application/json")
                ),
            }
        )
        if user_input is not None:
            entry_data = _get_family_hub_entry_data(self.hass)
            if entry_data is None:
                return self.async_abort(reason="not_found")
            try:
                snapshot = await self.hass.async_add_executor_job(
                    _read_uploaded_backup_snapshot, self.hass, user_input[_IMPORT_BACKUP_FILE_FIELD]
                )
            except ValueError as err:
                return self.async_show_form(
                    step_id="import_backup",
                    data_schema=import_schema,
                    errors={"base": "invalid_backup_file"},
                    description_placeholders={"error": str(err)},
                )
            except Exception as err:  # noqa: BLE001 - never leave the user with a raw traceback
                return self.async_show_form(
                    step_id="import_backup",
                    data_schema=import_schema,
                    errors={"base": "invalid_backup_file"},
                    description_placeholders={"error": f"Unexpected error: {err}"},
                )

            history_store = entry_data.get("settings_history_store")
            history = (
                await chores_store.async_load_settings_history(history_store) if history_store else {"snapshots": []}
            )
            snapshots = history.get("snapshots") or []
            snapshots.insert(0, snapshot)
            del snapshots[_SETTINGS_HISTORY_MAX_SNAPSHOTS:]
            history["snapshots"] = snapshots
            if history_store is not None:
                await history_store.async_save(history)

            return self.async_abort(
                reason="import_done",
                description_placeholders={"when": _describe_settings_history_snapshot(snapshot, dt_util.utcnow())},
            )

        return self.async_show_form(step_id="import_backup", data_schema=import_schema)

    async def async_step_restore_backup_confirm(self, user_input: dict[str, Any] | None = None):
        """Step 2 of 2: confirm, and separately decide whether the restore should also push the snapshot's Device Settings out live to every known device/instance"""
        entry_data = _get_family_hub_entry_data(self.hass)
        if entry_data is None:
            return self.async_abort(reason="not_found")
        history_store = entry_data.get("settings_history_store")
        history = await chores_store.async_load_settings_history(history_store) if history_store else {"snapshots": []}
        snapshots = history.get("snapshots") or []
        index = getattr(self, "_restore_snapshot_index", None)
        if index is None or index < 0 or index >= len(snapshots):
            return self.async_abort(reason="no_backups")
        snapshot = snapshots[index]

        if user_input is not None:
            push_device_settings = bool(user_input.get(_RESTORE_PUSH_DEVICES_FIELD))
            # One more automatic safety snapshot of the CURRENT state, taken immediately before restoring
            fresh_history = await chores_store.async_load_settings_history(history_store) if history_store else {
                "snapshots": []
            }
            fresh_snapshots = fresh_history.get("snapshots") or []
            safety_snapshot = await _capture_settings_history_snapshot(self.hass, entry_data)
            fresh_snapshots.insert(0, safety_snapshot)
            del fresh_snapshots[_SETTINGS_HISTORY_MAX_SNAPSHOTS:]
            fresh_history["snapshots"] = fresh_snapshots
            if history_store is not None:
                await history_store.async_save(fresh_history)

            await _restore_settings_history_snapshot(
                self.hass, entry_data, snapshot, push_device_settings=push_device_settings
            )
            return self.async_abort(
                reason="restore_done",
                description_placeholders={
                    "when": _describe_settings_history_snapshot(snapshot, dt_util.utcnow()),
                    "devices": "yes" if push_device_settings else "no",
                },
            )

        schema = vol.Schema(
            {
                vol.Optional(_RESTORE_PUSH_DEVICES_FIELD, default=False): selector.BooleanSelector(),
            }
        )
        return self.async_show_form(
            step_id="restore_backup_confirm",
            data_schema=schema,
            description_placeholders={"when": _describe_settings_history_snapshot(snapshot, dt_util.utcnow())},
        )

    async def async_step_update(self, user_input: dict[str, Any] | None = None):
        if user_input is not None:
            try:
                zip_bytes = await self.hass.async_add_executor_job(
                    _read_uploaded_zip_bytes, self.hass, user_input[CONF_UPDATE_FILE]
                )
                integration_dir = self.hass.config.path("custom_components", DOMAIN)
                # Backups are kept outside custom_components/ on purpose - see the docstring on install_update_from_zip for why a sibling folder in there can
                backup_root = self.hass.config.path("family_hub_backups")
                result = await self.hass.async_add_executor_job(
                    updater.install_update_from_zip, integration_dir, zip_bytes, backup_root
                )
            except updater.UpdateError as err:
                return self.async_show_form(
                    step_id="update",
                    data_schema=_UPDATE_SCHEMA,
                    errors={"base": "update_failed"},
                    description_placeholders={"error": str(err)},
                )
            except Exception as err:  # noqa: BLE001 - never leave the user with a raw traceback
                return self.async_show_form(
                    step_id="update",
                    data_schema=_UPDATE_SCHEMA,
                    errors={"base": "update_failed"},
                    description_placeholders={"error": f"Unexpected error: {err}"},
                )

            return self.async_abort(
                reason="update_installed",
                description_placeholders={"version": str(result.get("version", "unknown"))},
            )

        return self.async_show_form(step_id="update", data_schema=_UPDATE_SCHEMA)
