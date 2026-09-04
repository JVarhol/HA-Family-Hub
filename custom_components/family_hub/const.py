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

# v129+: multi-person events. Each person's calendar is a real external
# calendar (their own Google Calendar, etc.) reached through exactly one
# `calendar.*` entity - there is no Family Hub-side event storage, and an
# event physically only ever exists on the ONE calendar it was created on.
# "This event is also Dad's/Kid's" is therefore tracked the exact same way
# reminder overrides already solve the identical "can't rewrite an existing
# event's own data" problem: a lightweight side-channel store, keyed by the
# same (calendar, start, summary) composite identity via _event_override_key
# (there is no stable uid across the REST/poller fetch paths - see that
# function's own docstring), mapping to a list of the OTHER people's entity
# ids also involved. The card renders the event in every involved person's
# own column with a collage of everyone's colors (see family-week-calendar-
# card.js's own _eventPeopleEntities/_eventCollageStyle) - nothing is ever
# duplicated onto anyone else's real external calendar.
EVENT_PEOPLE_OVERRIDES_STORAGE_KEY_PREFIX = "family_hub_event_people_overrides"
EVENT_PEOPLE_OVERRIDES_STORAGE_VERSION = 1

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

# Durable, entry_id-independent backup of the Settings blob above (people,
# calendars, badges, screen saver settings, and userProfiles/notification
# profiles all live in that one blob). The Store above is keyed by
# entry.entry_id, which is stable across ordinary restarts/updates - but if
# someone ever removes and re-adds the Family Hub integration entry (e.g.
# while troubleshooting something unrelated), that generates a brand-new
# entry_id, and the old Store file becomes orphaned even though it's still
# sitting on disk. This backup file lives outside BOTH .storage/ and
# custom_components/family_hub/ (the same family_hub_backups/ folder
# updater.py already uses for update-zip backups, so it survives a file
# update the same way those do), keyed by nothing but DOMAIN itself - safe
# because Family Hub only ever has one config entry (see config_flow.py's
# _abort_if_unique_id_configured). Written on every real settings save;
# read back and restored automatically if a freshly-created Store ever
# loads completely empty. See _backup_settings/_maybe_restore_settings_backup.
SETTINGS_BACKUP_DIR_NAME = "family_hub_backups"
SETTINGS_BACKUP_FILENAME = "settings_backup.json"

# Same durable-backup mechanism as SETTINGS_BACKUP_FILENAME above, extended
# (1.78.2) to the three Chores/Rewards/Permissions stores - those are ALSO
# keyed by entry.entry_id (see store.py) and were just as exposed to the
# remove-and-re-add-the-integration data loss the settings backup already
# solved, just not covered by it (settings_store is a different Store).
# Same family_hub_backups/ folder, one file per store. See store.py's
# backup_chores/maybe_restore_chores_backup (and the rewards/permissions
# siblings) - deliberately living in store.py, not here alongside the
# settings backup functions, because chores_websocket_api.py (which does
# every real chores/rewards/permissions save) must stay import-independent
# of __init__.py, and store.py is the shared self-contained sibling both
# modules already import from.
CHORES_BACKUP_FILENAME = "chores_backup.json"
REWARDS_BACKUP_FILENAME = "rewards_backup.json"
PERMISSIONS_BACKUP_FILENAME = "permissions_backup.json"
ROUTINES_BACKUP_FILENAME = "routines_backup.json"
# v133+ - see the "--- Goals ---" section below for what this store holds.
GOALS_BACKUP_FILENAME = "goals_backup.json"

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

# v138+: the first-time setup wizard's "which features do you want" step
# (async_step_features) conditionally routes to async_step_users ->
# async_step_member_profile (one screen per picked member: board color +
# Include in Chores) -> async_step_chores_features (the same Routines/
# Goals-on-Chores/Goals-on-Rewards toggles Settings' own "Chores, Rewards &
# Routines" accordion has) whenever "Chores, Rewards, Routines & Goals" is
# checked. None of the four keys below are ever read back by the wizard
# itself or by Configure - they're a one-shot handoff into entry.options,
# consumed exactly once by __init__.py's _maybe_seed_settings_from_setup_
# wizard the first time async_setup_entry runs (which writes them into the
# real runtime Settings blob - memberUserIds/userProfiles/routinesEnabled/
# goalsShowInChores/goalsShowInRewards - the config entry's own options
# were never the actual home for any of this, that's always been the
# Store-backed Settings blob chores_websocket_api.py's family_hub/
# set_settings writes to, which doesn't exist until the entry itself does,
# hence the config_flow -> entry.options -> one-time-seed indirection
# instead of writing straight into it). Left sitting in entry.options
# afterward as harmless, never-read-again leftovers rather than stripped -
# this project already tolerates that shape elsewhere (see
# SETTINGS_KEY_NOTIFY_PROFILES_MIGRATED, a permanent marker in the
# Settings blob for the exact same reason). An install that predates this
# wizard step simply never has these keys in its options at all, so the
# seed function no-ops for it and the older _maybe_migrate_member_user_ids
# backfill (union of existing userProfiles/permissions) still runs exactly
# as it always has.
CONF_INITIAL_MEMBER_USER_IDS = "initial_member_user_ids"
CONF_INITIAL_USER_PROFILES = "initial_user_profiles"
CONF_INITIAL_ROUTINES_ENABLED = "initial_routines_enabled"
CONF_INITIAL_GOALS_IN_CHORES = "initial_goals_in_chores"
CONF_INITIAL_GOALS_IN_REWARDS = "initial_goals_in_rewards"

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

# An edit-mode-only helper card that brings the full card's Auto Screen
# Saver to a dashboard that doesn't have the full card on it - invisible
# outside of dashboard edit mode, served and auto-registered the same way
# as the Today card above.
SCREENSAVER_CARD_JS_URL = "/family_hub_screensaver_card/family-screensaver-card.js"

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
# Superseded as of v116: there used to be a third, household-level gate
# here (CONF_GROCY_EXPIRING_DIGEST_ENABLED/CONF_GROCY_LOW_STOCK_DIGEST_
# ENABLED) deciding whether an enabled feature's count could appear in
# anyone's Daily Digest at all, on top of the two feature toggles above
# and each person's own digestSections.grocyExpiring/grocyLowStock
# checkbox. It was removed - each person's own profile checkbox is now
# the sole control over whether their digest includes Grocy content, as
# long as the matching feature toggle above is on.

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

# --- Per-user notification profiles -----------------------------------------
#
# Replaces the flat CONF_DEFAULT_NOTIFY / CONF_OVERRIDES_TEXT system (still
# defined above, left in place and never deleted) as the source of truth for
# who gets notified about what. Instead of "calendar X notifies device list
# Y" configured once for the whole household, each Home Assistant login now
# has its own profile - which calendars they want event reminders from,
# whether they want standalone Reminders, whether/what they want in the
# Daily Digest - stored as one more top-level key in the same schema-free
# Settings Store blob the card already reads/writes via family_hub/get_settings
# and family_hub/set_settings (see SETTINGS_STORAGE_KEY_PREFIX above):
#
#   settings["userProfiles"] = {
#       "<hass user id>": {
#           "notifyTargets": ["notify.mobile_app_x", ...],
#           "subscribedCalendars": ["calendar.a", ...],
#           "remindersEnabled": bool,
#           "digestEnabled": bool,
#           "digestSections": {
#               "calendar": bool, "reminders": bool, "meals": bool,
#               "grocyExpiring": bool, "grocyLowStock": bool,
#           },
#           "notifyRewardClaimed": bool,
#           "notifyChoreApproved": bool,
#           "notifyChoreRejected": bool,
#           "notifyChoreDue": bool,
#           "notifyGoalApproved": bool,
#           "notifyGoalRejected": bool,
#           "remindersSubscriptions": {"<person calendar entity>": "calendar" | "calendar_alert"},
#       },
#       ...
#   }
#
# remindersSubscriptions (v130+) is how ONE person's individual to-do-list
# reminders (settings["people"][i]["remindersEntity"] - see the comment
# above SETTINGS_KEY_PEOPLE_REMINDERS_ENTITY_NOTE below) become visible to
# OTHER people, without duplicating anything: subscribing doesn't copy or
# move any to-do item, it only changes who's allowed to see that list (on
# their own calendar) and/or be alerted about it. A person key that's
# missing from this dict (the overwhelmingly common case - most people
# subscribe to few if any lists) means "not subscribed at all," exactly
# like subscribedCalendars' own empty-list-by-default convention. Three
# levels total, the third (silently) implied by the key's absence:
#   - absent/unrecognized value: not subscribed - this list is completely
#     invisible to this viewer (not fetched, not shown, can't add to it).
#   - REMINDER_SUBSCRIPTION_CALENDAR ("calendar"): the list's items show up
#     on this viewer's own calendar (Week/Month/Timeline/Planner), colored
#     with the list owner's own color (see _primaryCalendarColorByEntity's
#     sibling on the reminders side, _personColorForRemindersEntity, in the
#     card's own JS) - but this viewer is never pushed a notification about
#     them.
#   - REMINDER_SUBSCRIPTION_CALENDAR_ALERT ("calendar_alert"): same as
#     "calendar" above, plus this viewer's own notifyTargets get a push the
#     moment one of that list's reminders comes due - see
#     _targets_for_individual_reminders in __init__.py.
# A subscriber at EITHER level can also add new items directly onto the
# list they're subscribed to (the household's own choice - "any subscriber
# can add to it too" - confirmed the same permissiveness as e.g. anyone
# being able to add a family reminder today; there is no separate
# view-only-vs-can-add distinction). The list's own owner (whoever has it
# set as their primaryCalendar - see SETTINGS_KEY_USER_PROFILES's
# primaryCalendar field above) always sees and can add to their own list
# regardless of this map, which only ever governs OTHER people's access to
# it.
REMINDER_SUBSCRIPTION_CALENDAR = "calendar"
REMINDER_SUBSCRIPTION_CALENDAR_ALERT = "calendar_alert"
REMINDER_SUBSCRIPTION_LEVELS = (REMINDER_SUBSCRIPTION_CALENDAR, REMINDER_SUBSCRIPTION_CALENDAR_ALERT)
#
# v130+: settings["people"][i]["remindersEntity"] - settings["people"] itself
# has no single top-level key (it's a plain list the card owns entirely,
# same as ever - see _get_people below for the backend's own defensive
# reader). Same shape as that person's existing "entity" field (their
# calendar.* id) but pointing at a todo.* to-do list instead - their own
# individual Reminders list, kept fully separate from the household's
# single shared "family" reminders list (CONF_REMINDERS_ENTITY below,
# unaffected by any of this and always visible to everyone with no
# subscription needed). Optional and blank by default - a person with no
# remindersEntity set simply has no individual list yet, same as a person
# who's never set a primaryCalendar. The two "entity" fields (calendar vs.
# reminders) are deliberately independent so a person's calendar and their
# to-do list can even live on different HA integrations if that's how the
# household set them up.
# notifyRewardClaimed/notifyChoreApproved/notifyChoreRejected (v123+, v128+
# for the last one) are instant, one-shot pushes - NOT digest-batched, and
# NOT gated by digestEnabled - sent the moment the underlying event happens
# rather than folded into the next morning's Daily Digest. notifyChoreDue
# (v131+) is the odd one out of the six: it's evaluated on the regular
# poll tick (same cadence/mechanism as calendar-event reminders, not a
# synchronous send-at-the-triggering-action like the others) and, per
# chore, can fire MORE than once - once per lead time in that chore's own
# reminder_minutes (see CHORE_KEY_REMINDER_MINUTES below), e.g. once at 30
# minutes before and again at 10 minutes before. notifyGoalApproved/
# notifyGoalRejected (v133+) are the Goals-feature counterparts of
# notifyChoreApproved/notifyChoreRejected - see GOAL_STATUS_* below and
# chores_websocket_api.py's _notify_goal_approved/_notify_goal_rejected
# (Goals' websocket commands live in that same unified file alongside
# Chores/Rewards/Permissions/Routines - only the engines are split into
# separate files), same instant/synchronous shape as the chore pair, just
# for a goal instead of a chore. All six default False, same "opt in to
# nothing" convention as
# every other profile field:
#   - notifyRewardClaimed: sent to EVERY profile with this on whenever
#     ANYONE in the household redeems a reward (reward_engine.redeem_item
#     is instant self-serve with no approval step - see that module's own
#     docstring - so this is how an admin/parent watching the star economy
#     finds out in real time rather than only from the redemption history
#     list). Not scoped to "my own redemptions" - a parent wants to know
#     about every claim, not just their own.
#   - notifyChoreApproved: sent only to the chore's own assignee (the
#     person who did the work and is waiting to hear back), when THEIR
#     chore is approved (chore_engine.approve_chore) - the "yes, you're
#     all set, stars disbursed" confirmation. Never sent to anyone else,
#     unlike notifyRewardClaimed above.
#   - notifyChoreRejected: the other half of notifyChoreApproved - sent
#     only to the chore's own assignee when THEIR chore is sent back
#     instead of approved (chore_engine.reject_chore), so the bounce-back
#     isn't silent. Carries the verifier's optional reject_reason note
#     (see CHORE_KEY_REJECT_REASON above) in the notification body when one
#     was given.
#   - notifyChoreDue: sent only to the chore's own assignee, at each of
#     that chore's own configured reminder_minutes lead times counting down
#     to its due_date - mirrors the calendar card's own event-reminder
#     "remind me N minutes before" checkboxes exactly (same lead-time
#     values, same "before" semantics: a chore whose due_date has already
#     passed by the time a poll tick runs never fires late, same as a
#     calendar event reminder never fires for a missed window). A chore
#     with no due_date, no reminder_minutes, or sitting unassigned/in the
#     Chore Bin (CHORE_BIN_SENTINEL) is simply never considered - there's
#     nothing to count down to, or nobody specific to tell. See
#     _poll_chore_due_reminders in __init__.py.
#   - notifyGoalApproved / notifyGoalRejected: sent only to the goal's own
#     assigned_to, when THEIR goal is approved (goal_engine.approve_goal) or
#     sent back (goal_engine.reject_goal) - same "only the person waiting to
#     hear back" scoping as the chore pair, and the same optional
#     reject_reason-in-the-message-body treatment. See goal_engine.py's
#     module docstring for how Goals itself differs from Chores.
# The chore/reward/goal pair-events above are sent from chores_websocket_
# api.py (ws_redeem_reward/ws_approve_chore/ws_reject_chore/ws_approve_goal/
# ws_reject_goal - all Goals commands live in this same unified file) and,
# for chore approval,
# __init__.py's native approve_chore service handler too - reward_engine.py/
# chore_engine.py/goal_engine.py themselves stay free of this (see
# reward_engine.py's own "no HA dependency at all" docstring), so the
# actual hass.services.async_call("notify", ...) send always happens at the
# call site, same as the existing chore-nudge feature.
#
# _migrate_notify_profiles (called once from async_setup_entry) seeds this
# key from the old flat system the first time a household upgrades, using
# each person's HA login <-> person.* entity <-> device_tracker <-> notify.*
# service to figure out which existing notify target(s) belong to which
# user. It never deletes the old CONF_DEFAULT_NOTIFY/CONF_OVERRIDES_TEXT
# data (nothing is destroyed, and Configure's old "Calendar reminders"
# screen still shows exactly what it always did) - it just stops being what
# the poller actually reads once this key exists.
SETTINGS_KEY_USER_PROFILES = "userProfiles"
# Marker (also stored in the Settings blob, alongside userProfiles) so the
# one-time migration never re-runs and clobbers hand-edited profiles with a
# second, stale pass over the old flat data.
SETTINGS_KEY_NOTIFY_PROFILES_MIGRATED = "notifyProfilesMigrated"

DEFAULT_DIGEST_SECTIONS = {
    "calendar": True,
    "reminders": True,
    "meals": True,
    "grocyExpiring": True,
    "grocyLowStock": True,
    # v112+: that person's own pending (status "open", assigned directly to
    # them - not sitting unclaimed in the Chore Bin) chores. Defaults True
    # like every other section here, so nobody has to go find a new setting
    # just to keep getting what they'd reasonably expect once Chores exists.
    "chores": True,
}

# v115+: explicit Family Hub membership, stored as its own top-level key in
# the Settings blob (not nested under a person's profile - unlike everything
# in SETTINGS_KEY_USER_PROFILES above, this has to exist independently of
# whether a profile has ever been created for that user):
#
#   settings["memberUserIds"] = ["<hass user id>", "<hass user id>", ...]
#
# Replaces v112's per-user "choresEnabled" toggle (see git history / the
# README changelog for that version if you're looking for it - it's gone,
# folded entirely into this). Where choresEnabled was an opt-OUT control
# (defaulted True, gated Chores alone), memberUserIds is deliberately
# opt-IN (nothing here unless explicitly added) and is the ONE gate for
# EVERYTHING: family_hub/list_users still returns every real Home Assistant
# login (Screen Saver's per-login toggle and this feature's own "add a
# person" picker both still need that raw, unfiltered pool to choose from),
# but only ids present in this list are ever shown on the Users tab, the
# Permissions tab, or offered anywhere a chore gets assigned - the Chores
# board's own columns, its direct-assignment dropdown, rotation-group
# pickers, and self-serve claim. See chore_engine.py's IsUserEnabled /
# chores_websocket_api.py's _is_user_family_hub_member for the runtime
# gate chore_engine.py enforces on create/assign/claim/update.
#
# Removing someone is ALWAYS just deleting their id from this list - never a
# data operation. Their profile (settings["userProfiles"][uid]), their
# permission grants (the Permissions store), and any chore already assigned
# to them are deliberately left completely untouched, exactly like
# choresEnabled's old off-switch behavior above used to leave assignments
# alone. Re-adding the same id later brings all of it back automatically,
# because none of it was ever actually gone - just filtered out of view.
#
# Existing installs upgrading to this version never had to "add" anyone -
# every real HA user already showed up everywhere, because choresEnabled
# defaulted True and nothing gated the Users/Permissions tabs at all. So
# this key is never left simply absent for a household that's used Family
# Hub before: _maybe_migrate_member_user_ids in __init__.py runs once,
# right after settings/userProfiles/permissions are all loaded during
# async_setup_entry, and - only if this key has genuinely never been set -
# backfills it from the union of settings["userProfiles"].keys() and the
# Permissions store's own keys, i.e. "everyone who already appears
# somewhere," so nobody already-visible vanishes the moment this ships.
# From that point on the key is real (even if later explicitly saved back
# as an empty list) and the migration never runs again. A genuinely brand
# new install backfills from nothing and starts empty, same net effect as
# if the household had to opt every person in by hand.
SETTINGS_KEY_MEMBER_USER_IDS = "memberUserIds"

# v121+: a second, NARROWER opt-out living UNDER Family Hub membership above,
# for a household that wants someone (most often a shared kiosk/wall-tablet
# HA login, not a real person) added to Family Hub - so it shows up on the
# Users tab and can be granted Permissions - without also cluttering the
# Chores board with its own column, being offered as a new assignee, or
# showing up in the Rewards balance grid/catalog picker. Nested in a
# person's own profile (not top-level like memberUserIds, since it's
# per-person configuration, same shape as "color"):
#
#   settings["userProfiles"][uid]["includeInChores"] = False
#
# Defaults to True (included) whenever the key is absent - matters for every
# existing member from before this field existed, who must keep exactly the
# board/balance visibility they already have with zero migration needed.
# Checked by chores_websocket_api.py's _is_chores_eligible (member AND this
# flag not explicitly False) - the callable chore_engine.py's create/update/
# assign/claim call sites are actually handed for their IsUserEnabled
# parameter, in place of plain membership. Routines is deliberately NOT
# gated by this flag (only by memberUserIds, same as before) - a household
# asked for this to declutter Chores and Rewards specifically, not Routines,
# and since a person's Routines accordions live in the same board column as
# their Chores, toggling this off hides that whole column (Routines
# included) as a side effect - acceptable for the kiosk-login use case this
# exists for, but worth knowing if a real family member ever uses it instead
# purely to step back from chores/stars while keeping their own routines.
# Existing assigned chores/rewards history are never touched by this flag
# (same "never destroy in-flight work" principle as memberUserIds above) -
# it only ever affects new-assignment eligibility and board/grid visibility.

# --- Chores / Rewards / Permissions -----------------------------------------
#
# A separate feature area from the calendar/meal-plan/Grocy stuff above, with
# its own three Store-backed JSON files (see store.py) rather than living in
# the general Settings blob - chores/rewards data changes far more often
# (every completion, every star spent) and has real schema (chore_engine.py/
# reward_engine.py validate and mutate it), unlike Settings which is a mostly
# opaque blob the frontend owns. All three are still per-config-entry Stores,
# keyed by entry.entry_id exactly like every other Store in this project.
CHORES_STORAGE_KEY_PREFIX = "family_hub_chores"
CHORES_STORAGE_VERSION = 1
REWARDS_STORAGE_KEY_PREFIX = "family_hub_rewards"
REWARDS_STORAGE_VERSION = 1
PERMISSIONS_STORAGE_KEY_PREFIX = "family_hub_permissions"
PERMISSIONS_STORAGE_VERSION = 1

# --- Routines ----------------------------------------------------------------
#
# A fourth, deliberately lightweight sibling to Chores/Rewards/Permissions
# above (own Store, own backup file, same entry.entry_id-keyed pattern) -
# per-person daily checklists ("Morning Routine"/"Afternoon Routine"/"Night
# Routine": Get dressed, Brush teeth, that kind of thing), NOT bolted onto
# the Chores/star-reward system at all. No assignment modes, no star
# values, no verification gate - just add an item under one of a person's
# three fixed routine categories, check it off, and everything resets back
# to unchecked at the next local-midnight rollover so the same routine is
# ready to run again tomorrow. See routine_engine.py.
ROUTINES_STORAGE_KEY_PREFIX = "family_hub_routines"
ROUTINES_STORAGE_VERSION = 1

# --- Goals -------------------------------------------------------------------
#
# A fifth sibling alongside Chores/Rewards/Permissions/Routines above (own
# Store, own backup file, same entry.entry_id-keyed pattern - see store.py's
# create_goals_store/async_load_goals) - "get 3 Bs in math," "practice piano
# 2 times," any target the household wants to track progress toward and pay
# out once it's actually hit, as opposed to a Chore's "do this one concrete
# thing, on a schedule." Deliberately its own lighter-weight engine
# (goal_engine.py) rather than another chore assignment_mode or a bag of
# extra fields bolted onto every chore record - see that module's own
# docstring for the full reasoning and how its open -> pending_verification
# -> approved state machine (borrowed from Chores) differs from a chore's:
# no assignment modes/rotation/Chore Bin (a goal is always for one specific
# person, chosen at creation), no dependencies/auto-triggers/recurrence/
# overdue penalty/due-date reminders, but it DOES gain a target_count/
# current_count pair a chore doesn't have, and a per-goal choice between
# paying out in stars (the same economy chores use) or handing over one
# specific reward straight from the catalog (reward_engine.grant_item) -
# see GOAL_REWARD_TYPE_* below.
GOALS_STORAGE_KEY_PREFIX = "family_hub_goals"
GOALS_STORAGE_VERSION = 1

# Same three-stage shape as CHORE_STATUS_* above, reused deliberately (same
# meaning: "still being worked toward" -> "hit the target, waiting on a
# parent to confirm it's real" -> "confirmed, reward paid out") rather than
# invented fresh - a household that already understands the Chores
# verification gate needs to learn nothing new for Goals.
GOAL_STATUS_OPEN = "open"
GOAL_STATUS_PENDING_VERIFICATION = "pending_verification"
GOAL_STATUS_APPROVED = "approved"
GOAL_STATUSES = (GOAL_STATUS_OPEN, GOAL_STATUS_PENDING_VERIFICATION, GOAL_STATUS_APPROVED)

# What approving a goal actually pays out - see goal_engine.approve_goal.
# "stars": credits star_value to the assignee's balance, same
# reward_engine.add_stars mechanism a chore approval already uses - the
# goal's reward folds into the same economy as everything else, redeemed
# from the catalog later like normal.
# "catalog_item": hands over one specific existing reward catalog item
# directly (reward_item_id) via reward_engine.grant_item - no stars change
# hands at all, the goal itself WAS the price. Chosen per-goal at creation,
# not a household-wide setting - "3 Bs in math" might hand over "movie
# night" directly while "practice piano 2 times" pays out a handful of
# stars instead.
GOAL_REWARD_TYPE_STARS = "stars"
GOAL_REWARD_TYPE_CATALOG_ITEM = "catalog_item"
GOAL_REWARD_TYPES = (GOAL_REWARD_TYPE_STARS, GOAL_REWARD_TYPE_CATALOG_ITEM)

GOAL_EVENT_TYPE = "family_hub_goal_event"

ROUTINE_CATEGORY_MORNING = "morning"
ROUTINE_CATEGORY_AFTERNOON = "afternoon"
ROUTINE_CATEGORY_NIGHT = "night"
# Order matters here - it's the display order of the three accordion rows
# on each person's column (see family-hub-chores-card.js's _routinesHtml).
ROUTINE_CATEGORIES = (ROUTINE_CATEGORY_MORNING, ROUTINE_CATEGORY_AFTERNOON, ROUTINE_CATEGORY_NIGHT)
ROUTINE_CATEGORY_LABELS = {
    ROUTINE_CATEGORY_MORNING: "Morning Routine",
    ROUTINE_CATEGORY_AFTERNOON: "Afternoon Routine",
    ROUTINE_CATEGORY_NIGHT: "Night Routine",
}

# Household-wide on/off switch for the whole Routines feature, on the same
# schema-free general Settings blob as everything else the calendar card's
# Settings modal controls (see family_hub/get_settings/set_settings) -
# General tab, right alongside the other simple on/off fields there (e.g.
# the timeline toggle). Off by default: a brand new install shouldn't
# suddenly grow four new board columns nobody asked for. When off, the
# Chores board renders exactly as it did before Routines existed - no
# accordion rows, no Routines websocket calls made at all.
SETTINGS_KEY_ROUTINES_ENABLED = "routinesEnabled"

# v134+: household-wide on/off switches for embedding Goals inside the
# Chores board and/or the Rewards page, same schema-free General-tab
# pattern/off-by-default reasoning as SETTINGS_KEY_ROUTINES_ENABLED just
# above - a brand new install (or a household that's never touched Goals)
# shouldn't suddenly grow an extra board section nobody asked for, and each
# card only ever fetches family_hub/goals/list at all when its own flag is
# on (see family-hub-chores-card.js's _goalsInChoresEnabled/
# family-hub-rewards-card.js's _goalsInRewardsEnabled). Deliberately two
# separate flags, not one combined "show Goals everywhere" switch - a
# household might want goals visible on the Chores board (where the kids
# already look) but not clutter the Rewards page, or vice versa.
SETTINGS_KEY_GOALS_IN_CHORES = "goalsShowInChores"
SETTINGS_KEY_GOALS_IN_REWARDS = "goalsShowInRewards"

# Chore lifecycle - see chore_engine.py's module docstring for the full
# state machine. "open" covers both "sitting in the Chore Bin unclaimed" and
# "assigned to someone, not yet done" (assigned_to distinguishes the two);
# there is no separate "overdue" status - overdue-ness is computed from
# due_date at read/poll time against CHORE_STATUS_OPEN, and applying its
# one-time star penalty is tracked by CHORE_KEY_OVERDUE_PENALTY_APPLIED
# rather than a status transition, so a still-open, now-penalized chore can
# still be completed normally afterward.
CHORE_STATUS_OPEN = "open"
CHORE_STATUS_PENDING_VERIFICATION = "pending_verification"
CHORE_STATUS_APPROVED = "approved"
CHORE_STATUSES = (CHORE_STATUS_OPEN, CHORE_STATUS_PENDING_VERIFICATION, CHORE_STATUS_APPROVED)

# Sentinel assigned_to value for "sitting in the shared Chore Bin, claimed by
# nobody yet" - distinct from assigned_to being null/None, which chore_engine
# treats as a data error for every assignment_mode except "chore_bin" itself
# (a direct/auto_rotation/first_come_first_served chore always resolves to
# either a real HA user id or the chore_bin sentinel, never bare null).
CHORE_BIN_SENTINEL = "chore_bin"

CHORE_ASSIGNMENT_MODE_DIRECT = "direct"
CHORE_ASSIGNMENT_MODE_CHORE_BIN = "chore_bin"
CHORE_ASSIGNMENT_MODE_AUTO_ROTATION = "auto_rotation"
CHORE_ASSIGNMENT_MODE_FIRST_COME_FIRST_SERVED = "first_come_first_served"
CHORE_ASSIGNMENT_MODES = (
    CHORE_ASSIGNMENT_MODE_DIRECT,
    CHORE_ASSIGNMENT_MODE_CHORE_BIN,
    CHORE_ASSIGNMENT_MODE_AUTO_ROTATION,
    CHORE_ASSIGNMENT_MODE_FIRST_COME_FIRST_SERVED,
)

# Internal bookkeeping keys on a chore record - not part of the schema
# handed to the frontend as "the fields you can set," but present on every
# stored chore dict alongside the schema fields the spec calls for.
CHORE_KEY_OVERDUE_PENALTY_APPLIED = "overdue_penalty_applied"
CHORE_KEY_COMPLETED_BY = "completed_by"
CHORE_KEY_COMPLETED_AT = "completed_at"
CHORE_KEY_APPROVED_BY = "approved_by"
CHORE_KEY_APPROVED_AT = "approved_at"
CHORE_KEY_UPDATED_AT = "updated_at"

# v131+: "remind me N minutes before this is due" - a plain, editable schema
# field (like due_date/star_value, NOT internal bookkeeping), set by
# whoever creates/edits the chore via the Create/Edit Chore modal's own
# "Remind me" checkboxes - deliberately the exact same lead-time values the
# calendar card's own Add Event modal offers for calendar-event reminders
# (5/10/15/30/60/120/1440 minutes), so a household never has to learn a
# second set of options. A list of positive minute counts; empty (the
# default) means no reminders configured for this chore. Only meaningful
# alongside a due_date and a real (non-Chore-Bin) assigned_to - see
# _poll_chore_due_reminders in __init__.py and userProfiles' own
# notifyChoreDue flag above for who actually receives these.
CHORE_KEY_REMINDER_MINUTES = "reminder_minutes"

# Internal bookkeeping (not part of the create/edit schema): which of this
# chore's own reminder_minutes lead times have already fired for the
# CURRENT occurrence - mirrors CHORE_KEY_OVERDUE_PENALTY_APPLIED's own
# "never re-fire, but reset for a fresh occurrence" pattern directly above.
# update_chore resets this to [] whenever due_date or reminder_minutes
# itself changes (a new schedule deserves a fresh chance to fire), and
# reset_recurring_chore resets it on every new cycle, for the identical
# reasoning it already resets overdue_penalty_applied.
CHORE_KEY_REMINDERS_FIRED = "reminders_fired"

# v128+: the reject half of the verification gate - see chore_engine.py's
# reject_chore. A verifier can send a pending_verification chore back to
# "open" instead of approving it (no stars disbursed, no streak/rotation
# change - nothing was ever earned). rejected_by/rejected_at record who and
# when; reject_reason is an OPTIONAL free-text note from the verifier (e.g.
# "the trash still had bags in it") shown to the assignee so the bounce-
# back isn't silent. All three are left in place through the redo-and-
# resubmit cycle (so a second review still has the first note as context)
# and only cleared once the chore is finally approve_chore'd - a clean
# approval has nothing left to explain.
CHORE_KEY_REJECTED_BY = "rejected_by"
CHORE_KEY_REJECTED_AT = "rejected_at"
CHORE_KEY_REJECT_REASON = "reject_reason"

# Plain-schedule recurrence - a SECOND, independent way (alongside the
# sensor-driven auto_create_trigger above) for an approved chore to cycle
# back to "open" on its own, with no Home Assistant sensor/automation
# involved at all. A chore can have a recur_type, an auto_create_trigger,
# both, or neither - reset_recurring_chore doesn't care which reason
# triggered it, it only requires status == approved (see chore_engine.py).
# recur_next_due (a UTC ISO string, computed once when a recurring chore
# is approved - see approve_chore) is what a poll-tick sweep
# (sweep_due_recurrences) compares against "now" to decide it's time to
# reset; it's cleared back to None the moment the chore actually resets to
# open, since "waiting to recur" only describes an approved chore sitting
# idle, never one that's currently active again.
CHORE_RECUR_TYPE_INTERVAL = "interval"
CHORE_RECUR_TYPE_WEEKDAYS = "weekdays"
CHORE_RECUR_TYPES = (CHORE_RECUR_TYPE_INTERVAL, CHORE_RECUR_TYPE_WEEKDAYS)
CHORE_KEY_RECUR_NEXT_DUE = "recur_next_due"

# Fired on every status change (assignment, claim, complete, approve, and
# the automatic bin->open/rotation reset when a recurring sensor-triggered
# chore's auto_create_trigger fires again) so native HA automations can
# react without going through the websocket API at all. event_data always
# carries at least {"chore_id", "status", "previous_status"}; see
# chore_engine._fire_chore_event for the full payload.
CHORE_EVENT_TYPE = "family_hub_chore_event"

# Native HA services (see services.yaml) - the same five actions the
# websocket API exposes to the cards, registered as real hass.services too
# so voice assistants / native HA automations / scripts can drive chores
# without any custom card involved.
SERVICE_CREATE_CHORE = "create_chore"
SERVICE_COMPLETE_CHORE = "complete_chore"
SERVICE_APPROVE_CHORE = "approve_chore"
SERVICE_REJECT_CHORE = "reject_chore"
SERVICE_NUDGE_USER = "nudge_user"

# Permission keys a household can grant a non-admin HA user in the
# Permissions tab (Settings > Permissions on family-hub-chores-card, admin
# accounts only - see chores_websocket_api.py's _require_chore_permission). A real
# hass.user.is_admin account always has every permission regardless of what
# is/isn't set here; this store only ever ADDS permissions on top of that
# baseline for specific non-admin logins (e.g. an older sibling who verifies
# younger kids' chores without being a full HA admin) - it can never be used
# to take a permission away from a real admin.
PERMISSION_ASSIGN = "can_assign"
PERMISSION_VERIFY = "can_verify"
PERMISSION_REWARD_OVERRIDE = "can_override_rewards"
# v121+: split out of PERMISSION_VERIFY on request - "mark any chore done"
# (completing it on someone else's behalf) used to be bundled with "approve/
# verify a completed chore" (which finalizes the star reward), so there was
# no way to grant one without the other. A household running a shared wall-
# mounted tablet wanted that account able to tap Done for anyone and move
# chores out of the Chore Bin, without also handing it the authority to
# approve completions and finalize everyone's reward payouts. See
# chores_websocket_api.py's ws_complete_chore: allowed if the actor is the
# assignee, OR has PERMISSION_VERIFY (unchanged - still works exactly like
# before for a household that never bothers with this new, narrower grant),
# OR has this.
PERMISSION_COMPLETE_ANY = "can_complete_any"
# v127+: split out of PERMISSION_REWARD_OVERRIDE on request, same precedent
# as PERMISSION_COMPLETE_ANY splitting out of PERMISSION_VERIFY above - a
# household wanted to grant "can add a new reward to the catalog with a
# price" to someone (e.g. an older sibling) WITHOUT also handing them
# reward-override's much broader authority (adjusting anyone's balance,
# deleting/reversing redemption history, editing/deleting existing catalog
# items). Whoever lacks BOTH this and PERMISSION_REWARD_OVERRIDE (and isn't
# a real admin) can still suggest a new reward - it just can't be priced by
# them, so it lands in reward_engine's suggestions bin (no cost_stars) until
# someone who DOES have one of these two permissions reviews it via
# reward_engine.approve_suggestion/reject_suggestion. See
# chores_websocket_api.py's ws_add_catalog_item/ws_approve_suggestion/
# ws_reject_suggestion, all gated on "PERMISSION_REWARD_OVERRIDE OR this",
# the same "either of two permissions" shape ws_complete_chore already uses
# for PERMISSION_VERIFY/PERMISSION_COMPLETE_ANY.
PERMISSION_REWARD_ADD = "can_add_rewards"
CHORE_PERMISSIONS = (PERMISSION_ASSIGN, PERMISSION_VERIFY, PERMISSION_REWARD_OVERRIDE, PERMISSION_COMPLETE_ANY, PERMISSION_REWARD_ADD)

# v128+: a catalog item's redeem_mode - see reward_engine.py's own module
# docstring for the full picture. Every reward has exactly one:
#   - "instant" (the default, and the ONLY mode that existed before v128):
#     redeem any time, no limit on how many times, nothing tracked beyond
#     the redemption log entry itself - "movie night," "extra dessert."
#   - "banked": each redemption ADDS a fixed amount (catalog item's own
#     stack_unit_amount, e.g. 1) to a running per-user balance for that
#     specific item ("bank") instead of being a one-off event - "$1 of
#     allowance," "1 hour of TV time," redeemed as many times as affordable
#     so the bank grows. A separate reward_engine.use_bank action later
#     spends part (or all) of that bank down, independent of star cost -
#     "use 1.5 of my 3 banked hours."
#   - "one_time": behaves exactly like "instant" (an ordinary logged
#     redemption), except the catalog item deletes itself immediately
#     afterward - a single-use reward, gone from the catalog for everyone
#     the moment anybody claims it.
# Orthogonal to all three: a catalog item's requires_fulfillment flag (see
# add_catalog_item) - whether the "spend" step (the redemption itself for
# instant/one_time, or a use_bank call for banked) needs a parent to mark
# it done before it counts as delivered, or is self-serve/instant. The two
# dimensions combine freely - e.g. banked + requires_fulfillment models
# "$20 allowance, redeemed into a growing bank, paid out (and marked done)
# in chunks whenever a parent actually hands over the cash," while banked +
# NOT requires_fulfillment models "3 hours of TV time, use whenever, no
# approval needed."
REWARD_REDEEM_MODE_INSTANT = "instant"
REWARD_REDEEM_MODE_BANKED = "banked"
REWARD_REDEEM_MODE_ONE_TIME = "one_time"
REWARD_REDEEM_MODES = (REWARD_REDEEM_MODE_INSTANT, REWARD_REDEEM_MODE_BANKED, REWARD_REDEEM_MODE_ONE_TIME)

CHORES_CARD_JS_URL = "/family_hub_chores_card/family-hub-chores-card.js"
MY_CHORES_CARD_JS_URL = "/family_hub_my_chores_card/family-hub-my-chores-card.js"
REWARDS_CARD_JS_URL = "/family_hub_rewards_card/family-hub-rewards-card.js"
# v133+ - see goal_engine.py's own module docstring for what Goals is.
GOALS_CARD_JS_URL = "/family_hub_goals_card/family-hub-goals-card.js"

# The native todo.family_hub_chores entity (todo.py) - a single shared
# to-do list mirroring every open/pending chore, so Assist/Alexa/Google and
# Home Assistant's own to-do UI can see and add chores without the cards at
# all. Unique id is stable/config-entry-scoped like every other entity this
# integration could ever register, even though this is the first one.
TODO_CHORES_UNIQUE_ID_PREFIX = "family_hub_chores_todo"
TODO_CHORES_ENTITY_NAME = "Family Hub Chores"
