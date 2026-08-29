"""Constants for the Family Hub integration.

Family Hub merges three things that used to be separate installs:
  - Theme Builder (theme editor panel + generic theme storage/API)
  - Family Calendar Reminders (server-side polling + notify.* calls)
  - The Family Week Calendar card itself (now served as a static file and
    auto-registered as a dashboard resource, instead of a manual deploy)
"""

DOMAIN = "family_hub"

# Unchanged from the old Theme Builder integration on purpose: keeping the
# same storage key means an existing Theme Builder install's saved themes
# are picked up automatically, with no migration step.
THEME_STORAGE_KEY = "theme_builder_themes"
THEME_STORAGE_VERSION = 1
MAX_THEMES = 8

REMINDERS_STORAGE_KEY_PREFIX = "family_hub_reminders_notified"
REMINDERS_STORAGE_VERSION = 1

# Per-event reminder overrides let the card add/remove a reminder on an
# already-created event without needing a calendar.update_event service
# (most calendar platforms only expose create_event/get_events - there is
# no generic way to rewrite an existing event's description marker).
REMINDER_OVERRIDES_STORAGE_KEY_PREFIX = "family_hub_reminder_overrides"
REMINDER_OVERRIDES_STORAGE_VERSION = 1

CONF_CALENDARS = "calendars"
CONF_DEFAULT_NOTIFY = "default_notify_target"
CONF_POLL_MINUTES = "poll_minutes"
CONF_OVERRIDES_TEXT = "calendar_notify_overrides"
CONF_UPDATE_FILE = "zip_file"

# Standalone reminders (the Add Event modal's Reminder tab) are stored as
# items on this Home Assistant to-do list entity, not as calendar events -
# the card tells the backend which to-do entity that is via
# family_hub/set_reminders_entity (best-effort, sent once per session), so
# the poller knows which list to check for due reminders. Notify device
# overrides for reminders reuse the exact same CONF_OVERRIDES_TEXT map as
# per-calendar overrides, just keyed by this real to-do entity id instead of
# a calendar entity id.
CONF_REMINDERS_ENTITY = "reminders_todo_entity"

# The Daily Digest's meal-plan line needs to read the same to-do list the
# card's meal planner writes to - the card tells the backend which entity
# that is via family_hub/set_daily_digest (bundled alongside the digest's
# own enabled/time fields since both are sent from the same Settings save),
# best-effort and refreshed each session, same pattern as CONF_REMINDERS_ENTITY.
CONF_MEAL_PLAN_ENTITY = "meal_plan_todo_entity"

# Daily Digest: a once-a-day notification summarizing today's calendar
# events, due reminders, and planned meals, sent independent of anyone
# having the dashboard open. Enabled/time are pushed from the card's
# Settings (family_hub/set_daily_digest) since the poller - not the card -
# decides when to actually fire it.
CONF_DAILY_DIGEST_ENABLED = "daily_digest_enabled"
CONF_DAILY_DIGEST_TIME = "daily_digest_time"  # "HH:MM", local time

# Same trick as REMINDER_NOTIFY_KEY: a pseudo "calendar entity" key so the
# digest's recipient list can live in the exact same per-target notify
# overrides map (family_hub/set_notify_overrides) as every other notify
# picker in Settings, rather than a separate storage location that could
# drift out of sync with what Settings displays.
DAILY_DIGEST_NOTIFY_KEY = "__family_hub_digest__"

DAILY_DIGEST_STORAGE_KEY_PREFIX = "family_hub_daily_digest_sent"
DAILY_DIGEST_STORAGE_VERSION = 1

# The card's Settings blob (theme, badges, digest config, block layout, etc.)
# used to live ONLY as JSON stuffed into a hidden "Settings" to-do item's
# description (settings_entity, a card-config field - the backend has no
# idea which entity that is). That's a hack: it clutters Home Assistant's
# own To-do UI with an item nobody should ever touch by hand, and a stray
# edit/delete there could silently corrupt or wipe every setting at once.
# family_hub/get_settings and family_hub/set_settings now read/write here
# instead - the same Store-backed pattern already used for Theme Builder's
# themes and Daily Digest send-tracking. The old to-do item is deliberately
# left alone (never deleted) and the card still knows how to read it - the
# very first family_hub/get_settings call after updating finds this store
# empty, falls back to parsing that legacy item once, and immediately saves
# the result here so every later load skips the to-do lookup entirely.
SETTINGS_STORAGE_KEY_PREFIX = "family_hub_settings"
SETTINGS_STORAGE_VERSION = 1

# Recipe Box and Meal Suggestions moved off their to-do lists (todo.recipe_box
# / todo.meal_suggestions) onto their own Store-backed lists, for the same
# reason Settings did: neither one is a task anybody checks off or manages
# through Home Assistant's own to-do UI or voice assistants, so storing a
# recipe's category/photo/Grocy link/rating as JSON crammed into a to-do
# item's description - while repurposing the "done" checkbox to mean
# "loved" - was a hack with no upside. Reminders and the day-by-day meal
# plan stay on real to-do lists; those genuinely benefit from due dates and
# native to-do integration. Same lazy one-time migration pattern as
# Settings: family_hub/get_recipes and family_hub/get_suggestions return a
# "migrated" flag alongside the list; the card falls back to reading the
# legacy to-do list exactly once when that's false, then immediately saves
# the result here (via set_recipes/set_suggestions) so every later load
# skips the to-do lookup for good. The old to-do items are left alone,
# never deleted or written to again.
RECIPES_STORAGE_KEY_PREFIX = "family_hub_recipes"
RECIPES_STORAGE_VERSION = 1
SUGGESTIONS_STORAGE_KEY_PREFIX = "family_hub_suggestions"
SUGGESTIONS_STORAGE_VERSION = 1

# First-time setup wizard (config_flow.py's async_step_calendars/grocy/
# todo_lists/finish): everything it collects - which calendars to monitor,
# Grocy's URL/API key, and which to-do list backs Meal Plan/Reminders - was
# previously only reachable one piece at a time, after the fact, via
# Configure > Calendar reminders / Grocy, or by hand-typing an entity id
# into the card's own YAML config. None of that changes here (Configure
# still works exactly as before, and the wizard's steps are all skippable),
# this just asks for it once, up front, so a new install isn't a blank
# calendar with silently-off reminders until someone finds Configure.
#
# CONF_AUTO_CREATE_TODO_LISTS controls the todo_lists step's checkbox: when
# on (the default) and a field was left blank, the wizard creates a fresh
# Local To-do list for that role via local_todo's own config flow (see
# _create_local_todo_list) rather than leaving meal_plan_entity/
# reminders_entity unset - a household that has never touched to-do lists
# before shouldn't have to go create one by hand just to use the meal
# planner or standalone reminders. Turning it off (or leaving it on but
# already picking an existing list) skips that entirely.
CONF_AUTO_CREATE_TODO_LISTS = "auto_create_todo_lists"
DEFAULT_MEAL_PLAN_LIST_NAME = "Family Meal Plan"
DEFAULT_REMINDERS_LIST_NAME = "Family Reminders"

# Same wizard, two more steps: async_step_notifications asks for a default
# notify target for calendar event reminders plus which device(s) should
# get standalone Reminders (written into the same CONF_OVERRIDES_TEXT map
# Configure's Calendar reminders step already edits, just keyed by the
# reminders to-do entity picked in the previous step); async_step_digest
# asks whether to turn on the Daily Digest, at what time, and to whom -
# previously all three were configured (or discovered to be missing) one at
# a time, after the fact.
DEFAULT_DAILY_DIGEST_TIME = "07:00"

# Optional relative dashboard/view path (e.g. "/lovelace-family/0") stamped
# onto every notify.* call the backend makes (event reminders, standalone
# reminders, Daily Digest) as data.url (iOS)/data.clickAction (Android), so
# tapping the push notification on a phone opens the right Home Assistant
# dashboard instead of just launching the app to wherever it last was. Set
# from the card's own Settings (family_hub/set_notification_click_path,
# bundled into the same Settings save as everything else in Reminders),
# same pattern as CONF_REMINDERS_ENTITY/CONF_MEAL_PLAN_ENTITY.
CONF_NOTIFICATION_CLICK_PATH = "notification_click_path"

# A standalone reminder can opt into "roll over to the next day if not
# completed" - the card appends this marker to the to-do item's own
# description (alongside whatever notes the person typed), rather than a
# separate storage entry, so the flag travels with the item if it's ever
# renamed or moved directly in Home Assistant's own To-do UI. The poller
# (_poll_reminders_todo) checks for it right after firing a due reminder's
# notification: if present and the item is still needs_action, its
# due_datetime gets bumped forward by exactly one local day (same time),
# which - since the notified-dedup key is keyed on the due timestamp -
# naturally makes it eligible to fire again tomorrow, and again the day
# after that, for as long as it stays uncompleted.
REMINDER_ROLLOVER_MARKER_PATTERN = r"<!--rollover:1-->"

DEFAULT_POLL_MINUTES = 5
# How far ahead each poll looks for events - also doubles as how far ahead
# the "Upcoming notifications" preview shows. 26h used to mean anything more
# than about a day out (e.g. next week's yoga class) simply never appeared
# in the preview, even though its reminder would still fire correctly once
# polling caught up closer to the event - just confusing to look at. A full
# week keeps the whole card's week view "in view" here too.
DEFAULT_LOOKAHEAD_HOURS = 24 * 7
NOTIFIED_RETENTION_HOURS = 48

REMINDER_MARKER_PATTERN = r"<!--reminder:([\d,]+)-->"

# Standalone reminders (created from the Add Event modal's "Reminder" tab,
# as opposed to a calendar event) are still stored as ordinary calendar
# events - there's no separate storage - but tagged with this marker so the
# poller knows to fire at the event's own start time (not "N minutes
# before") and route the notification to the dedicated Reminders notify
# devices instead of that calendar's own notify overrides.
REMINDER_TYPE_MARKER_PATTERN = r"<!--type:reminder-->"

# Pseudo "calendar entity" key used in the same notify-overrides map as real
# calendars (family_hub/get_notify_config, family_hub/set_notify_overrides)
# to store the notify target(s) for standalone reminders - reminders aren't
# tied to any one calendar, so they get one shared setting instead of a
# per-calendar row. Deliberately shaped like an invalid entity_id so it can
# never collide with a real one and is easy to filter out of "Calendars to
# monitor".
REMINDER_NOTIFY_KEY = "__family_hub_reminders__"

# How far into the past the poller's calendar.get_events window reaches, on
# top of "now" - a plain calendar event reminder always fires strictly
# before its event starts, so it's always found by a forward-looking-only
# window. A standalone reminder's notify time IS its event's start time
# though, so without some backward reach, a reminder whose moment fell
# between two poll cycles could already read as "started" (start < now) by
# the time the next poll's get_events call runs, and never be returned at
# all. This grace window is independent of the configured poll interval so
# a slow poll interval or a missed cycle (e.g. HA restart) can't cause a
# reminder to be silently skipped entirely.
POLL_QUERY_GRACE_MINUTES = 15

PANEL_URL = "theme-builder"
PANEL_TITLE = "Theme Builder"
PANEL_ICON = "mdi:palette"
PANEL_JS_URL = "/family_hub_panel/theme-builder-panel.js"

CARD_JS_URL = "/family_hub_card/family-week-calendar-card.js"

# A small, single-day companion card ("what's going on today") - served
# and auto-registered as a dashboard resource alongside the full week/month
# card, so it can be pasted onto any dashboard on its own.
TODAY_CARD_JS_URL = "/family_hub_today_card/family-today-card.js"

# Bundled with the Theme Builder panel (not the calendar card) since it's a
# theming tool, not a calendar feature - served from panel/ alongside
# theme-builder-panel.js and shipped/updated together with it.
THEME_SELECTOR_CARD_JS_URL = "/family_hub_theme_selector/theme-selector-card.js"

ICON_URL = "/family_hub_static/icon.png"

# Optional integration with a self-hosted Grocy instance, so the Meal
# Suggestions box can offer "Add from Grocy" (family_hub/get_grocy_recipes)
# alongside typing a suggestion by hand. Deliberately kept out of the card's
# own Settings to-do item (which is visible via Home Assistant's own To-do
# UI) and stored here in the config entry's private options instead, same
# private area as CONF_UPDATE_FILE's installer - set via Settings > Devices
# & Services > Family Hub > Configure > Grocy (config_flow.py's
# FamilyHubOptionsFlow), not the card. Home Assistant's own core Grocy
# integration doesn't expose recipes as a sensor, so Family Hub talks to
# Grocy's REST API directly and independently of whether that integration
# is even installed.
CONF_GROCY_URL = "grocy_url"
CONF_GROCY_API_KEY = "grocy_api_key"
# Opt-in, off by default: powers both the card's "Expiring Soon" list and
# the Daily Digest's expiring-items counts. Stored in config entry options
# (like CONF_DAILY_DIGEST_ENABLED) rather than the Settings Store, since the
# always-running Daily Digest poller needs to see it independent of anyone
# having the dashboard open.
CONF_GROCY_EXPIRING_ENABLED = "grocy_expiring_enabled"
# Same pattern as CONF_GROCY_EXPIRING_ENABLED, mirrored for the "Low Stock"
# list (products currently below their own min. stock amount) and its
# Daily Digest count. A separate opt-in flag rather than reusing the
# Expiring one, since a household might want one feature without the
# other (e.g. no interest in restock alerts but does want expiration
# warnings, or vice versa).
CONF_GROCY_LOW_STOCK_ENABLED = "grocy_low_stock_enabled"
# Independent of the two feature toggles above: whether an enabled
# feature's count also appears in the Daily Digest, vs. staying card-only
# (More menu list still works, but the morning notification stays quiet
# about it). Defaults to True wherever it's missing from options (i.e.
# every install predating this setting) so turning a feature on keeps
# behaving exactly like it always did until someone explicitly opts out
# of the digest line specifically.
CONF_GROCY_EXPIRING_DIGEST_ENABLED = "grocy_expiring_digest_enabled"
CONF_GROCY_LOW_STOCK_DIGEST_ENABLED = "grocy_low_stock_digest_enabled"

# Which Grocy recipes' ingredients have already been pushed onto Grocy's
# shopping list, per planning week (family_hub/get_grocy_grocery_status,
# family_hub/push_grocery_list). Grocy's own add-not-fulfilled-products
# endpoint already nets out "already on the shopping list" per product
# (see missing_amount - amount_on_shopping_list in its RecipesService), so
# calling it again for a recipe that hasn't changed is normally harmless -
# but a recipe with "don't check the shopping list" enabled skips that
# subtraction entirely and WOULD double up on a repeat call, and either way
# the person planning meals has no way to see at a glance which of this
# week's meals still need to be shopped for. Tracking it here (keyed by
# ISO week-start date, since the same recipe slot gets reused week to week)
# gives the card an honest "Added" / "Not added yet" per meal instead of a
# fire-and-forget button.
GROCERY_PUSHED_STORAGE_KEY_PREFIX = "family_hub_grocery_pushed"
GROCERY_PUSHED_STORAGE_VERSION = 1

# Tracks the "generation" of family_hub's own standard English/metric unit
# conversion set (teaspoon, tablespoon, cup, pint, quart, gallon, fluid
# ounce, milliliter, liter, ounce, pound, gram, kilogram) that was last
# successfully pushed into this household's own Grocy instance - see
# _sync_standard_unit_conversions. A plain integer bumped only when
# _STANDARD_UNIT_CONVERSIONS itself changes (a new unit added, say) -
# deliberately NOT tied to family_hub's own package version, since that
# bumps on every unrelated bug fix and would otherwise re-run this sync (a
# full fetch of Grocy's own units/conversions tables) on every single
# update instead of only when there's actually something new to push. Runs
# once per generation - not on every restart - so an already-synced
# household never gets re-checked until there's a real reason to. Stored
# keyed by config entry id, same as every other per-install Store here, so
# multiple Grocy-connected family_hub installs never share state.
GROCY_CONVERSIONS_SYNC_GENERATION = 1
GROCY_CONVERSIONS_SYNC_STORAGE_KEY_PREFIX = "family_hub_grocy_conversions_synced"
GROCY_CONVERSIONS_SYNC_STORAGE_VERSION = 1
