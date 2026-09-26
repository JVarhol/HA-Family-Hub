"""Config flow for Family Hub.

The theme panel and calendar card both work immediately once the
integration is added - nothing here is required, and everything it collects
can also be reached later via Configure (Settings > Devices & Services >
Family Hub). What used to happen is a new install sat there with reminders
silently off and no Grocy connection until someone thought to go look for
Configure; the first-time setup wizard below (async_step_user through
async_step_finish) just front-loads those same optional decisions - which
calendars to watch for reminders and whether to connect Grocy - into the
moment the integration is added, since that's when a household is already
thinking about setup. Every step can be left blank/skipped and revisited in
Configure afterward. That same Configure dialog is also where updates get
installed - see async_step_update below - since that's where an admin would
look for it, not a sidebar panel.

v1.132.8+: this wizard USED to also have a "Meal Plan & Reminders lists"
step (async_step_todo_lists) between Grocy and Notifications, letting you
pick/auto-create the todo.* entities those two features are backed by.
Removed - household ask, verbatim: "drop todo lists" - since it was never
actually load-bearing: the calendar card's own meal_plan_entity/
reminders_entity Lovelace config fields (defaulting to todo.meal_plan/
todo.family_reminders if never overridden - see the card's own YAML
options in README.md) are the real source of truth for which entity each
feature reads, and the card ALREADY self-syncs whichever entity it's
actually configured with into these same backend options every session
(_ws_set_reminders_entity/_ws_set_daily_digest in __init__.py) with zero
user action needed - so this step only ever saved someone the trouble of
either accepting the card's own defaults or setting the field once on the
card. CONF_MEAL_PLAN_ENTITY/CONF_REMINDERS_ENTITY themselves are unchanged
and still very much live options, just no longer settable from THIS
wizard.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import selector

from . import (
    _build_upcoming_summary,
    _get_family_hub_entry_data,
    _overrides_to_text,
    _parse_overrides,
    updater,
)
from .const import (
    CONF_CALENDARS,
    CONF_DAILY_DIGEST_ENABLED,
    CONF_DAILY_DIGEST_TIME,
    CONF_DEFAULT_NOTIFY,
    CONF_GROCY_API_KEY,
    CONF_GROCY_URL,
    CONF_INITIAL_GOALS_IN_CHORES,
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


# v138+: the first-time setup wizard's opening "which features do you
# want" step (async_step_features) - lets a household skip whole sections
# of the wizard up front rather than clicking through and leaving
# everything blank. Deliberately a small, fixed set of transient string
# keys rather than config-entry options (see CONF_INITIAL_* in const.py
# for the one set of wizard fields that DOES need to survive past this
# flow) - self._selected_features only ever controls this flow run's own
# step routing and is never persisted anywhere.
_FEATURE_CHORES = "chores"
_FEATURE_GROCY = "grocy"
_FEATURE_DIGEST = "digest"
# v1.132.8+: _FEATURE_REMINDERS ("Reminders & Meal Plan to-do lists") is
# gone - it only ever gated async_step_todo_lists, which is gone too (see
# this module's own docstring). Calendar reminders themselves aren't
# gated behind a feature choice here at all (see async_step_features'
# docstring below) - only the now-removed to-do list picker/auto-create
# step was.
_ALL_FEATURES = (_FEATURE_CHORES, _FEATURE_GROCY, _FEATURE_DIGEST)
_FEATURES_FIELD = "setup_features"

_FEATURE_LABELS = {
    _FEATURE_CHORES: "Chores, Rewards, Routines & Goals",
    _FEATURE_GROCY: "Grocy",
    _FEATURE_DIGEST: "Daily Digest",
}


def _build_features_schema() -> vol.Schema:
    # Every feature defaults to checked - a household that just clicks
    # through this screen without touching anything sees the exact same
    # full wizard this always was, before this step existed.
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


# async_step_users' own field name - reuses CONF_INITIAL_MEMBER_USER_IDS
# directly as the form field rather than a separate transient name, since
# that's exactly where the picked ids end up in self._collected_options
# anyway (see the CONF_INITIAL_* docstring in const.py).
async def _list_member_choices(hass: HomeAssistant) -> list[dict[str, str]]:
    """Same shape/filter as __init__.py's family_hub/list_users websocket
    command (_ws_list_users) - id + display name, system-generated
    accounts (Supervisor and the like - nobody logs in as those) excluded,
    sorted by name. Surfaced here a step earlier, before the config entry
    (and therefore that websocket command) exists yet. Best-effort: an
    empty list just means an empty picker, never blocks the wizard.
    """
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


# async_step_member_profile's own two field names - one small form shown
# once per member picked on the Users step (see that step's own docstring
# for why this loops one-at-a-time instead of building one big dynamic
# schema with a field per member: HA's translation strings are per FIELD
# NAME, which can't cover an unbounded/variable set of member ids, but CAN
# cover a title/description that gets a member's name interpolated in via
# description_placeholders on a step reused once per member).
_MEMBER_COLOR_FIELD = "member_color"
_MEMBER_INCLUDE_FIELD = "member_include_in_chores"


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
        }
    )


# async_step_chores_features' own three field names - the same Routines/
# Goals-on-Chores/Goals-on-Rewards toggles Settings' "Chores, Rewards &
# Routines" accordion has (see family-week-calendar-card.js), just asked
# once up front here too. Goals-on-Chores/Goals-on-Rewards stay off by
# default, same as they've always defaulted to in Settings. Routines
# defaults ON as of v1.132.54+ (household ask, verbatim: "Default to
# routines enabled") - see family-week-calendar-card.js's own
# routinesEnabled:true default for the matching change to an existing/
# upgraded install that never went through this wizard (or skipped the
# Features step's "Chores, Rewards, Routines & Goals" option) and so falls
# back to that frontend default instead. Picking "Chores, Rewards, Routines
# & Goals" on the Features step only guarantees Chores/Rewards themselves
# (membership, board, catalog) are ready to go; Routines/Goals are each
# their own separate opt-in on top of that - Routines' own opt-in is now
# just pre-checked here rather than starting unchecked.
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


# v1.132.8+: _build_todo_lists_schema/_REMINDERS_NOTIFY_FIELD (the
# now-removed "Meal Plan & Reminders lists" step's own schema, and the
# Notifications step's reminders-notify-target picker that only ever made
# sense keyed by that step's CONF_REMINDERS_ENTITY output) are both gone -
# see this module's own docstring for why the step itself was dropped.
def _build_notifications_schema(hass, defaults: dict[str, Any]) -> vol.Schema:
    return vol.Schema(
        {
            vol.Optional(
                CONF_DEFAULT_NOTIFY, default=defaults.get(CONF_DEFAULT_NOTIFY, "")
            ): _notify_target_selector(hass),
        }
    )


# Transient wizard-only field for async_step_digest's recipient list - like
# _REMINDERS_NOTIFY_FIELD, folded into CONF_OVERRIDES_TEXT rather than kept
# as its own option (see DAILY_DIGEST_NOTIFY_KEY).
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


# Transient wizard-only field/defaults for async_step_dashboard - not config
# entry options (a dashboard's YAML isn't something Family Hub itself owns
# or persists; the field just controls whether the finish step shows one).
_ADD_DASHBOARD_FIELD = "add_dashboard"
DEFAULT_DASHBOARD_TITLE = "Family Hub"
DEFAULT_DASHBOARD_URL_PATH = "family-hub"

_PEOPLE_COLOR_PALETTE = ["#d9bf7e", "#7ec9d9", "#d97e9e", "#9ed97e", "#b07ed9", "#d9a67e"]


def _build_dashboard_schema() -> vol.Schema:
    return vol.Schema({vol.Optional(_ADD_DASHBOARD_FIELD, default=True): selector.BooleanSelector()})


def _yaml_scalar(value: str) -> str:
    """Minimal YAML-safe quoting for the handful of values this wizard ever
    plugs into _build_dashboard_yaml (entity ids, calendar friendly names,
    hex colors) - not a general-purpose YAML dumper, just enough to keep a
    name with a colon or leading/trailing space from breaking the pasted
    result."""
    if value == "" or value.strip() != value or any(ch in value for ch in ":#{}[]&*!|>'\"%@`,"):
        return "'" + value.replace("'", "''") + "'"
    return value


def _dashboard_calendar_name(hass: HomeAssistant, entity_id: str) -> str:
    """Best-effort friendly name for a calendar.* entity, for the "name"
    field of a generated dashboard card's people list - falls back to a
    title-cased version of the entity id's object_id if the entity isn't
    known yet (e.g. hass is unavailable, as in unit tests) rather than
    leaving the YAML with a blank name."""
    try:
        state = hass.states.get(entity_id) if hass is not None else None
    except Exception:  # noqa: BLE001 - never block the wizard over a display name
        state = None
    if state is not None and getattr(state, "name", None):
        return state.name
    return entity_id.split(".", 1)[-1].replace("_", " ").title()


def _build_dashboard_yaml(
    hass: HomeAssistant, options: dict[str, Any], url_path: str, title: str
) -> str:
    """Build the exact dashboard YAML shown on the finish screen: one
    "panel" view (a single card filling the whole screen, same as this
    project's own documented "one card, full dashboard" setup) holding the
    Family Week Calendar card, pre-filled with whatever calendars and
    Meal Plan/Reminders to-do lists were already picked earlier in this
    same wizard run - so pasting it in gets a working dashboard in one
    step instead of also needing a trip through the card's own Settings.

    Returned as plain text rather than parsed/applied anywhere - there is
    no supported way for an integration to create a Lovelace dashboard on
    Home Assistant's behalf (the object that would allow it isn't exposed
    by the lovelace component on any current release), so copy/paste into
    Settings > Dashboards > Add Dashboard > Edit in YAML is the actual
    mechanism, not a fallback for one.
    """
    calendars: list[str] = options.get(CONF_CALENDARS) or []
    lines = [
        f"title: {_yaml_scalar(title)}",
        "views:",
        f"  - title: {_yaml_scalar(title)}",
        f"    path: {_yaml_scalar(url_path)}",
        "    type: panel",
        "    cards:",
        "      - type: custom:family-week-calendar-card",
    ]
    if calendars:
        lines.append("        people:")
        for idx, entity_id in enumerate(calendars):
            color = _PEOPLE_COLOR_PALETTE[idx % len(_PEOPLE_COLOR_PALETTE)]
            name = _dashboard_calendar_name(hass, entity_id)
            lines.append(f"          - entity: {_yaml_scalar(entity_id)}")
            lines.append(f"            name: {_yaml_scalar(name)}")
            lines.append(f"            color: {_yaml_scalar(color)}")
    else:
        lines.append("        people: []  # add at least one calendar.* entity here")
    meal_plan_entity = options.get(CONF_MEAL_PLAN_ENTITY)
    if meal_plan_entity:
        lines.append(f"        meal_plan_entity: {_yaml_scalar(meal_plan_entity)}")
    reminders_entity = options.get(CONF_REMINDERS_ENTITY)
    if reminders_entity:
        lines.append(f"        reminders_entity: {_yaml_scalar(reminders_entity)}")
    return "\n".join(lines)


def _normalize_options(user_input: dict[str, Any] | None) -> dict[str, Any]:
    user_input = user_input or {}
    return {
        CONF_CALENDARS: user_input.get(CONF_CALENDARS, []),
        CONF_DEFAULT_NOTIFY: user_input.get(CONF_DEFAULT_NOTIFY, ""),
        CONF_POLL_MINUTES: int(user_input.get(CONF_POLL_MINUTES, DEFAULT_POLL_MINUTES) or DEFAULT_POLL_MINUTES),
        CONF_OVERRIDES_TEXT: user_input.get(CONF_OVERRIDES_TEXT, ""),
    }


class FamilyHubConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Which features to turn on, who's in the household, chores/rewards
    setup for them, calendars to monitor, Grocy, and Meal Plan/Reminders
    to-do lists - before creating the entry. Every step accepts blank/
    default input and moves on; nothing here is required to finish setup,
    matching how Configure/the card's own Settings have always treated the
    same settings afterward. The opening Features step (async_step_features)
    controls which of the Chores/Grocy/Reminders/Digest sections below even
    get shown - see that step's own docstring."""

    VERSION = 1

    def __init__(self) -> None:
        # Accumulates option values across steps; written into the config
        # entry's options in one shot by async_step_finish, the same shape
        # _normalize_options/the options flow steps already expect.
        self._collected_options: dict[str, Any] = {}
        # Set by async_step_dashboard when the household opts in - shown on
        # the finish screen as copy-paste YAML, never persisted anywhere
        # (see _build_dashboard_yaml's docstring for why this can't just be
        # created automatically).
        self._dashboard_yaml: str | None = None
        # Which optional sections the Features step turned on - controls
        # step routing only, never persisted (see _ALL_FEATURES). Defaults
        # to "everything on" so any code path that somehow checks this
        # before async_step_features runs sees the same full wizard this
        # always was, rather than skipping sections nobody chose to skip.
        self._selected_features: set[str] = set(_ALL_FEATURES)
        # Users/member-profile step state - see async_step_users/
        # async_step_member_profile. _member_setup_queue is the ids still
        # waiting for their own one-member-at-a-time profile screen (popped
        # from the front as each is submitted); _member_profiles accumulates
        # {user_id: {"color":..., "includeInChores":...}} as they go, folded
        # into CONF_INITIAL_USER_PROFILES once the queue drains
        # (async_step_chores_features); _member_names is id -> display name,
        # fetched once in async_step_users, used only to caption each
        # member's own profile screen.
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
        """Opening screen: which optional sections of the rest of this
        wizard does the household actually want? Every section defaults to
        checked, so clicking straight through without touching anything
        behaves exactly like the wizard always did before this step
        existed - this only exists to let a household SKIP whole sections
        (Chores/Rewards/Routines/Goals setup, Grocy, Daily Digest) up front
        rather than clicking through screens for features they don't want
        and leaving every field blank. Calendars, Notifications, and the
        Dashboard offer are NOT gated behind a feature choice here - they're
        cheap, universally-relevant screens that every household still
        sees."""
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
        """One small screen per member picked on the Users step - their
        board color (from the same six-color palette the generated
        dashboard YAML already cycles through, see _PEOPLE_COLOR_PALETTE)
        and whether they're included in Chores/Rewards (default yes - see
        _isChoresIncluded in the chores card for how this same field is
        read afterward). This is "set up chores for users," one member at a
        time rather than one big dynamic form - see _MEMBER_COLOR_FIELD's
        own comment for why. Loops by re-invoking itself: pops the member
        that was just submitted for off the front of _member_setup_queue,
        then either shows the next one or - once the queue is empty (which
        is also true immediately, on the very first call, for a household
        that picked zero members) - moves on to async_step_chores_features.
        """
        if user_input is not None and self._member_setup_queue:
            user_id = self._member_setup_queue[0]
            self._member_profiles[user_id] = {
                "color": user_input.get(_MEMBER_COLOR_FIELD) or "",
                "includeInChores": bool(user_input.get(_MEMBER_INCLUDE_FIELD, True)),
            }
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
        """Pick which calendar.* entities Family Hub should watch for
        event reminders - the same "Calendars to monitor" list Configure's
        Calendar reminders step edits later, just asked up front so a fresh
        install doesn't silently have reminders off. Leaving this empty is
        fine; it can be filled in from Configure or by adding notify
        devices to a calendar in the card's own Settings (which adds it to
        this list automatically)."""
        if user_input is not None:
            self._collected_options[CONF_CALENDARS] = user_input.get(CONF_CALENDARS, [])
            return await self.async_step_grocy()

        return self.async_show_form(
            step_id="calendars",
            data_schema=_build_calendars_schema(self._collected_options),
        )

    async def async_step_grocy(self, user_input: dict[str, Any] | None = None):
        """Optional Grocy connection, asked up front instead of only being
        discoverable later via Configure > Grocy - reuses that exact same
        schema, so filling it in here or there behaves identically. Leaving
        both fields blank skips Grocy entirely, same as before. Skipped
        entirely (never even shown) when "Grocy" was unchecked on the
        Features step - reachable afterward via Configure either way."""
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

    # v1.132.8+: async_step_todo_lists ("Meal Plan & Reminders lists") is
    # gone - household ask, verbatim: "drop todo lists." See this module's
    # own docstring for why it was safe to drop entirely: the calendar
    # card's own meal_plan_entity/reminders_entity config fields already
    # self-sync into these same backend options every session with no user
    # action needed, so this step only ever saved someone from accepting
    # the card's own defaults or setting the field once on the card itself.

    async def async_step_notifications(self, user_input: dict[str, Any] | None = None):
        """Who should get a default notification for calendar event
        reminders - the calendar card's "Remind me" field falls back to
        this when a calendar has no override of its own. Leaving it blank
        is fine; it's also editable later via Configure > Calendar
        reminders or the card's own Settings > Calendars notify pickers."""
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
        """Ask whether to turn on the Daily Digest - a once-a-day
        notification summarizing today's events, due reminders, and
        planned meals, sent independent of anyone having the dashboard
        open. Off by default, unlike most of this wizard's other
        defaults - this is the one step here that starts actively sending
        something on a schedule rather than just getting an entity or
        connection ready, so a household should switch it on on purpose,
        not discover it because a wizard defaulted it on. Reachable
        afterward via the card's own Settings or Configure either way,
        same as everything else in this wizard. Skipped entirely when
        "Daily Digest" was unchecked on the Features step."""
        if not self._feature_selected(_FEATURE_DIGEST):
            self._collected_options[CONF_DAILY_DIGEST_ENABLED] = False
            return await self.async_step_dashboard()

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
            return await self.async_step_dashboard()

        return self.async_show_form(
            step_id="digest",
            data_schema=_build_digest_schema(self.hass, self._collected_options),
        )

    async def async_step_dashboard(self, user_input: dict[str, Any] | None = None):
        """Ask whether to set up a dedicated Family Hub dashboard - the
        same single full-screen calendar card layout this project has
        always documented for manual setup. There's no supported way for
        an integration to create a Lovelace dashboard on its own (the
        object that would allow it isn't exposed by Home Assistant's own
        lovelace component on any current release, unlike the dashboard
        *resource* registration this integration already does elsewhere),
        so saying yes here doesn't create anything directly - it generates
        the exact YAML to paste in, already filled in with whichever
        calendars and to-do lists were picked earlier in this wizard, and
        shows it on the next (finish) screen with instructions."""
        if user_input is not None:
            if user_input.get(_ADD_DASHBOARD_FIELD, True):
                self._dashboard_yaml = _build_dashboard_yaml(
                    self.hass,
                    self._collected_options,
                    DEFAULT_DASHBOARD_URL_PATH,
                    DEFAULT_DASHBOARD_TITLE,
                )
            else:
                self._dashboard_yaml = None
            return await self.async_step_finish()

        return self.async_show_form(
            step_id="dashboard",
            data_schema=_build_dashboard_schema(),
        )

    async def async_step_finish(self, user_input: dict[str, Any] | None = None):
        """Read-only summary before creating the entry - mainly so the
        dashboard YAML (if requested) is visible somewhere, since it still
        needs to be copied into place by hand via Settings > Dashboards.
        v1.132.8+: no longer mentions meal_plan_entity/reminders_entity -
        those aren't collected by this wizard any more (see this module's
        own docstring on why the "Meal Plan & Reminders lists" step was
        dropped); the calendar card's own config fields for those, or its
        Settings, are where to set them now."""
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
                "dashboard_yaml": self._dashboard_yaml
                or "Skipped - you can always add a dashboard later the same way (Settings > Dashboards > Add Dashboard > Edit in YAML).",
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


class FamilyHubOptionsFlow(config_entries.OptionsFlow):
    """Configure reminders, send a test notification, install an update, or
    (v201+) get pointed at the card's own Settings modal - all live here
    since this is where an admin would already be looking (Settings >
    Devices & Services > Family Hub > Configure), not a separate sidebar
    panel."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None):
        return self.async_show_menu(
            step_id="init",
            menu_options=["settings", "reminders", "grocy", "test_notify", "upcoming", "update"],
        )

    # v201+: household ask, verbatim - "add a settings button to the
    # integration settings page." Home Assistant's own "Configure" button
    # (Settings -> Devices & Services -> Family Hub -> Configure) already
    # opens this options flow's menu, but the actual day-to-day Family Hub
    # settings (theme, per-person notifications, chores/rewards toggles,
    # screensaver, etc.) all live inside the calendar card's own in-
    # dashboard Settings modal (family-week-calendar-card.js's
    # _openSettings/.settings-btn) - a config flow step can't reach into a
    # Lovelace card's JS to open that modal directly (they're two
    # completely separate surfaces: this flow renders as its own dialog in
    # the Settings page, the card's modal lives inside a dashboard view),
    # so this is a plain informational step, same shape as async_step_
    # upcoming's read-only summary just below - it just tells someone
    # where to actually find that gear icon, rather than pretending to be
    # a shortcut into it.
    async def async_step_settings(self, user_input: dict[str, Any] | None = None):
        return self.async_show_form(step_id="settings", data_schema=vol.Schema({}))

    async def async_step_reminders(self, user_input: dict[str, Any] | None = None):
        if user_input is not None:
            # Merge onto the existing options rather than replacing them
            # outright - reminders_entity, the Daily Digest settings,
            # notification_click_path, meal_plan_entity, and the Grocy
            # fields below are all written straight into entry.options by
            # their own websocket handlers (not part of this form), so a
            # plain `data=_normalize_options(user_input)` here would
            # silently wipe every one of them out the moment someone opens
            # and saves this screen.
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
        """Fire a one-off notification at any registered notify.* target right
        now, independent of calendars/reminders - lets you confirm a device
        is reachable before wiring it into a calendar's reminder overrides,
        or diagnose "reminders aren't arriving" by ruling notify delivery
        in or out."""
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

    async def async_step_update(self, user_input: dict[str, Any] | None = None):
        if user_input is not None:
            try:
                zip_bytes = await self.hass.async_add_executor_job(
                    _read_uploaded_zip_bytes, self.hass, user_input[CONF_UPDATE_FILE]
                )
                integration_dir = self.hass.config.path("custom_components", DOMAIN)
                # Backups are kept outside custom_components/ on purpose - see
                # the docstring on install_update_from_zip for why a sibling
                # folder in there can break the whole integration's setup.
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
