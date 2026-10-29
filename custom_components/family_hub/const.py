"""Constants for the Family Hub integration."""

DOMAIN = "family_hub"

# Unchanged from the old Theme Builder integration on purpose: keeping the same storage key means an existing Theme Builder install's saved
THEME_STORAGE_KEY = "theme_builder_themes"
THEME_STORAGE_VERSION = 1
# 6 original built-in presets + Liquid Glass / Liquid Glass Dark (added together) = 8 built-ins
MAX_THEMES = 12

REMINDERS_STORAGE_KEY_PREFIX = "family_hub_reminders_notified"
REMINDERS_STORAGE_VERSION = 1

# Per-event reminder overrides let the card add/remove a reminder on an already-created event without needing a calendar.update_event service
REMINDER_OVERRIDES_STORAGE_KEY_PREFIX = "family_hub_reminder_overrides"
REMINDER_OVERRIDES_STORAGE_VERSION = 1

# multi-person events.
EVENT_PEOPLE_OVERRIDES_STORAGE_KEY_PREFIX = "family_hub_event_people_overrides"
EVENT_PEOPLE_OVERRIDES_STORAGE_VERSION = 1
# Category picked for a calendar event in Family Hub, keyed like the people overrides above (or
# "cat|<calendar>|uid:<uid>" for a whole series). Value: category id, or "" for explicitly none.
EVENT_CATEGORIES_STORAGE_KEY_PREFIX = "family_hub_event_categories"
EVENT_CATEGORIES_STORAGE_VERSION = 1

# attachable checklists ("baseball practice needs cleats, a water bottle
EVENT_CHECKLISTS_STORAGE_KEY_PREFIX = "family_hub_event_checklists"
EVENT_CHECKLISTS_STORAGE_VERSION = 1
# Generous grace window after a calendar event's own START time before its attached checklist is treated as "passed" and cleaned up
EVENT_CHECKLIST_PASSED_GRACE_HOURS = 12

CONF_CALENDARS = "calendars"
CONF_DEFAULT_NOTIFY = "default_notify_target"
CONF_POLL_MINUTES = "poll_minutes"
CONF_OVERRIDES_TEXT = "calendar_notify_overrides"
CONF_UPDATE_FILE = "zip_file"

# Standalone reminders (the Add Event modal's Reminder tab) are stored as items on this Home Assistant to-do list entity
CONF_REMINDERS_ENTITY = "reminders_todo_entity"

# The Daily Digest's meal-plan line needs to read the same to-do list the card's meal planner writes to
CONF_MEAL_PLAN_ENTITY = "meal_plan_todo_entity"

# Daily Digest: a once-a-day notification summarizing today's calendar events, due reminders, and planned meals
CONF_DAILY_DIGEST_ENABLED = "daily_digest_enabled"
CONF_DAILY_DIGEST_TIME = "daily_digest_time"  # "HH:MM", local time

# Same trick as REMINDER_NOTIFY_KEY: a pseudo "calendar entity" key so the digest's recipient list can live in the exact same per-target
DAILY_DIGEST_NOTIFY_KEY = "__family_hub_digest__"

DAILY_DIGEST_STORAGE_KEY_PREFIX = "family_hub_daily_digest_sent"
DAILY_DIGEST_STORAGE_VERSION = 1

# Bus event fired by button.py's FamilyHubDailyDigestButton.async_press (one button entity per real Home Assistant user account
DAILY_DIGEST_EVENT_OPEN = "family_hub_daily_digest_open"

# The card's Settings blob (theme, badges, digest config, block layout
SETTINGS_STORAGE_KEY_PREFIX = "family_hub_settings"
SETTINGS_STORAGE_VERSION = 1

# Durable, entry_id-independent backup of the Settings blob above (people, calendars, badges, screen saver settings
SETTINGS_BACKUP_DIR_NAME = "family_hub_backups"
SETTINGS_BACKUP_FILENAME = "settings_backup.json"

SETTINGS_HISTORY_STORAGE_KEY_PREFIX = "family_hub_settings_history"
SETTINGS_HISTORY_STORAGE_VERSION = 1
SETTINGS_HISTORY_MAX_SNAPSHOTS = 8

# Same durable-backup mechanism as SETTINGS_BACKUP_FILENAME above, extended (1.78.2) to the three Chores/Rewards/Permissions stores
CHORES_BACKUP_FILENAME = "chores_backup.json"
REWARDS_BACKUP_FILENAME = "rewards_backup.json"
PERMISSIONS_BACKUP_FILENAME = "permissions_backup.json"
ROUTINES_BACKUP_FILENAME = "routines_backup.json"
# see the "--- Goals ---" section below for what this store holds.
GOALS_BACKUP_FILENAME = "goals_backup.json"
# see pantry_engine.py's own module docstring for what this store holds (the "Also Tracking" extras list only
PANTRY_EXTRAS_BACKUP_FILENAME = "pantry_extras_backup.json"

# Recipe Box and Meal Suggestions moved off their to-do lists (todo.recipe_box / todo.meal_suggestions) onto their own Store-backed lists
RECIPES_STORAGE_KEY_PREFIX = "family_hub_recipes"
RECIPES_STORAGE_VERSION = 1
SUGGESTIONS_STORAGE_KEY_PREFIX = "family_hub_suggestions"
SUGGESTIONS_STORAGE_VERSION = 1

# To-Do Lists card's own list selection (family_hub/get_todo_card_ config and family_hub/set_todo_card_config in __init__.py)
TODO_CARD_CONFIG_STORAGE_KEY_PREFIX = "family_hub_todo_card_config"
TODO_CARD_CONFIG_STORAGE_VERSION = 1

# Wish Lists - the household's own ask: "home assistant has native list functionality and we use it a lot in family Hub but it's not super
TODO_WISHLIST_CONFIG_STORAGE_KEY_PREFIX = "family_hub_todo_wishlist_config"
TODO_WISHLIST_CONFIG_STORAGE_VERSION = 1

# the store above used to hold exactly ONE record - fine when a household only ever had a single To-Do Lists card

# the most stacked rows the To-Do Lists card's board will spread its list columns across - "add rows columns
TODO_CARD_MAX_BOARD_ROWS = 4

# Menu suggestions (family_hub/get_menu_suggestions, add_menu_suggestion, apply_menu_suggestion and remove_menu_suggestion in __init__.py)
MENU_SUGGESTIONS_STORAGE_KEY_PREFIX = "family_hub_menu_suggestions"
MENU_SUGGESTIONS_STORAGE_VERSION = 1

# Chore/reward timers (timer_engine.py, the family_hub/timers/* websocket commands in chores_websocket_api.py
TIMERS_STORAGE_KEY_PREFIX = "family_hub_timers"
TIMERS_STORAGE_VERSION = 1

# -------------------------------------------------------------------------- native Home Assistant `timer.*` integration
TIMER_ENTITY_PREFIX = "timer.family_hub"

# -------------------------------------------------------------------------- CORRECTION AND EXTENSION of the note above
TIMER_FAMILY_POOL_SIZE = 4
TIMER_FAMILY_ENTITY_PREFIX = "timer.family_hub_family_"
# The display-name prefix every auto-created helper is created with; HA slugifies it into the entity_id
TIMER_HELPER_NAME_PREFIX = "Family Hub "

# HA's own bus events for the native timer domain (components/timer's EVENT_TIMER_FINISHED / EVENT_TIMER_CANCELLED).
NATIVE_TIMER_EVENT_FINISHED = "timer.finished"
NATIVE_TIMER_EVENT_CANCELLED = "timer.cancelled"

# Family Hub's OWN event, fired once for every timer of any kind (chore/reward/standalone) that actually completes
EVENT_FAMILY_HUB_TIMER_FINISHED = "family_hub_timer_finished"

# How often the backend checks whether any timer has run out.
TIMER_SWEEP_SECONDS = 15

# Guard rails on a timer's length.
TIMER_MIN_MINUTES = 1
TIMER_MAX_MINUTES = 24 * 60
# A standalone quick timer can now be entered down to whole seconds (e.g. "30 sec" with no minutes at all)
TIMER_MIN_SECONDS = 1

TIMER_KIND_CHORE = "chore"
TIMER_KIND_REWARD = "reward"
# a general-purpose household timer with no chore or reward behind it at all - "an active timers card...
TIMER_KIND_STANDALONE = "standalone"
TIMER_KINDS = (TIMER_KIND_CHORE, TIMER_KIND_REWARD, TIMER_KIND_STANDALONE)

# The quick-timer modal's preset buttons, in minutes.
TIMER_PRESET_MINUTES = (5, 15, 30, 60)

# Max length of a standalone timer's free-text label ("Oven", "Sam's turn").
TIMER_LABEL_MAX_LENGTH = 60

# Optional per-chore / per-catalog-item timer length, in minutes.
CHORE_KEY_TIMER_MINUTES = "timer_minutes"
REWARD_KEY_TIMER_MINUTES = "timer_minutes"

# -- Timer alarm audience --------------------------------------- A follow-up narrowed the actual requirement: "if a kid starts a clean room
CHORE_KEY_ALARM_AUDIENCE = "alarm_audience"
REWARD_KEY_ALARM_AUDIENCE = "alarm_audience"
TIMER_ALARM_AUDIENCE_SELF = "self"
TIMER_ALARM_AUDIENCE_KIOSKS = "kiosks"
TIMER_ALARM_AUDIENCE_EVERYONE = "everyone"
TIMER_ALARM_AUDIENCES = (TIMER_ALARM_AUDIENCE_SELF, TIMER_ALARM_AUDIENCE_KIOSKS, TIMER_ALARM_AUDIENCE_EVERYONE)

# settings["alarmDevices"] - a household-wide list of registered speakers/ Assist satellites that a "kiosks"/"everyone" audience timer alarm
SETTINGS_KEY_ALARM_DEVICES = "alarmDevices"

# settings["alarmTtsEntityId"] - which tts.* entity to use for the media_player half of alarmDevices above
SETTINGS_KEY_ALARM_TTS_ENTITY = "alarmTtsEntityId"

# userProfiles[uid]["isAlarmKiosk"] (bool, default False) - "this login is a shared/always-on screen (the main kitchen kiosk
SETTINGS_KEY_PROFILE_IS_ALARM_KIOSK = "isAlarmKiosk"

# Bus events broadcasting a "ring"/"stop" to every open Family Hub dashboard for a "kiosks"/"everyone"-audience timer alarm
EVENT_FAMILY_HUB_TIMER_ALARM_RING = "family_hub_timer_alarm_ring"
EVENT_FAMILY_HUB_TIMER_ALARM_STOP = "family_hub_timer_alarm_stop"

# How often the sweep re-announces a still-ringing "kiosks"/"everyone" alarm to its registered speakers/Assist satellites.
ALARM_REANNOUNCE_SECONDS = 45

# (timer + alarm overhaul): a ringing alarm stops by itself after this long if nobody taps Stop anywhere - logged as "auto-stopped"
ALARM_AUTO_STOP_SECONDS = 30 * 60
# Every Family Hub timer alarm push carries a Stop button with this action id + the timer uid
ALARM_STOP_ACTION_PREFIX = "FAMILY_HUB_STOP_ALARM_"
# The timer log (who set what, when it ended, how, where it rang, who
# stopped it) keeps this many most-recent timers.
TIMER_LOG_MAX_ENTRIES = 300
# Automation hooks alongside EVENT_FAMILY_HUB_TIMER_FINISHED.
EVENT_FAMILY_HUB_TIMER_STARTED = "family_hub_timer_started"
EVENT_FAMILY_HUB_TIMER_CANCELLED = "family_hub_timer_cancelled"
EVENT_FAMILY_HUB_TIMER_ALARM_STOPPED = "family_hub_timer_alarm_stopped"
SERVICE_START_TIMER = "start_timer"
SERVICE_CANCEL_TIMER = "cancel_timer"
SERVICE_STOP_TIMER_ALARM = "stop_timer_alarm"

# First-time setup wizard (config_flow.py's async_step_calendars/grocy/ todo_lists/finish): everything it collects
CONF_AUTO_CREATE_TODO_LISTS = "auto_create_todo_lists"
DEFAULT_MEAL_PLAN_LIST_NAME = "Family Meal Plan"
DEFAULT_REMINDERS_LIST_NAME = "Family Reminders"
# What the cards use when reminders_entity isn't configured - created automatically when missing
DEFAULT_REMINDERS_ENTITY = "todo.family_reminders"

# the first-time setup wizard's "which features do you want" step
CONF_INITIAL_MEMBER_USER_IDS = "initial_member_user_ids"
CONF_INITIAL_USER_PROFILES = "initial_user_profiles"
CONF_INITIAL_ROUTINES_ENABLED = "initial_routines_enabled"
CONF_INITIAL_GOALS_IN_CHORES = "initial_goals_in_chores"
CONF_INITIAL_GOALS_IN_REWARDS = "initial_goals_in_rewards"
# calendars picked on the wizard's Calendars step that aren't any member's own calendar (a shared Family calendar, a child without a login
CONF_INITIAL_CALENDARS = "initial_calendars"

# Same wizard, two more steps: async_step_notifications asks for a default notify target for calendar event reminders plus which device(s)
DEFAULT_DAILY_DIGEST_TIME = "07:00"

# Optional relative dashboard/view path (e.g. "/lovelace-family/0") stamped onto every notify.* call the backend makes (event reminders
CONF_NOTIFICATION_CLICK_PATH = "notification_click_path"

# A standalone reminder can opt into "roll over to the next day if not completed"
REMINDER_ROLLOVER_MARKER_PATTERN = r"<!--rollover:1-->"

# A SECOND, optional marker alongside the one above - present only when rollover is restricted to specific weekdays (0=Monday..
REMINDER_ROLLOVER_DAYS_MARKER_PATTERN = r"<!--rolldays:([\d,]*)-->"
# A repeating reminder: an RFC 5545-style rule (FREQ, INTERVAL, BYDAY, BYMONTHDAY, UNTIL, COUNT).
# Marking it done moves it to its next date instead of finishing it; COUNT counts down what's left.
REMINDER_REPEAT_MARKER_PATTERN = r"<!--repeat:([A-Z0-9=;,+\-]{1,200})-->"

DEFAULT_POLL_MINUTES = 5
# How far ahead each poll looks for events - also doubles as how far ahead the "Upcoming notifications" preview shows.
DEFAULT_LOOKAHEAD_HOURS = 24 * 7
NOTIFIED_RETENTION_HOURS = 48

REMINDER_MARKER_PATTERN = r"<!--reminder:([\d,]+)-->"

# Standalone reminders (created from the Add Event modal's "Reminder" tab
REMINDER_TYPE_MARKER_PATTERN = r"<!--type:reminder-->"

# Pseudo "calendar entity" key used in the same notify-overrides map as real calendars (family_hub/get_notify_config
REMINDER_NOTIFY_KEY = "__family_hub_reminders__"

# How far into the past the poller's calendar.get_events window reaches, on top of "now"
POLL_QUERY_GRACE_MINUTES = 15

PANEL_URL = "theme-builder"
PANEL_TITLE = "Theme Builder"
PANEL_ICON = "mdi:palette"
PANEL_JS_URL = "/family_hub_panel/theme-builder-panel.js"

CARD_JS_URL = "/family_hub_card/family-week-calendar-card.js"

# A small, single-day companion card ("what's going on today")
TODAY_CARD_JS_URL = "/family_hub_today_card/family-today-card.js"

# Bundled with the Theme Builder panel (not the calendar card) since it's a theming tool, not a calendar feature
THEME_SELECTOR_CARD_JS_URL = "/family_hub_theme_selector/theme-selector-card.js"

# An edit-mode-only helper card that brings the full card's Auto Screen Saver to a dashboard that doesn't have the full card on it
SCREENSAVER_CARD_JS_URL = "/family_hub_screensaver_card/family-screensaver-card.js"

# A small standalone companion card - "what's going on for everyone right now": each person's current event (with a progress bar
RIGHT_NOW_CARD_JS_URL = "/family_hub_right_now_card/family-right-now-card.js"

ICON_URL = "/family_hub_static/icon.png"

# Optional integration with a self-hosted Grocy instance, so the Meal Suggestions box can offer "Add from Grocy"
CONF_GROCY_URL = "grocy_url"
CONF_GROCY_API_KEY = "grocy_api_key"
# Opt-in, off by default: powers both the card's "Expiring Soon" list and the Daily Digest's expiring-items counts.
CONF_GROCY_EXPIRING_ENABLED = "grocy_expiring_enabled"
# Same pattern as CONF_GROCY_EXPIRING_ENABLED, mirrored for the "Low Stock" list (products currently below their own min.
CONF_GROCY_LOW_STOCK_ENABLED = "grocy_low_stock_enabled"
# Superseded as of v116: there used to be a third, household-level gate here

# Which Grocy recipes' ingredients have already been pushed onto Grocy's shopping list, per planning week
GROCERY_PUSHED_STORAGE_KEY_PREFIX = "family_hub_grocery_pushed"
GROCERY_PUSHED_STORAGE_VERSION = 1

# Tracks the "generation" of family_hub's own standard English/metric unit conversion set (teaspoon, tablespoon, cup, pint, quart, gallon
GROCY_CONVERSIONS_SYNC_GENERATION = 1
GROCY_CONVERSIONS_SYNC_STORAGE_KEY_PREFIX = "family_hub_grocy_conversions_synced"
GROCY_CONVERSIONS_SYNC_STORAGE_VERSION = 1

# -- Per-user notification profiles ----------------------------------------- Replaces the flat CONF_DEFAULT_NOTIFY / CONF_OVERRIDES_TEXT
REMINDER_SUBSCRIPTION_CALENDAR = "calendar"
REMINDER_SUBSCRIPTION_CALENDAR_ALERT = "calendar_alert"
REMINDER_SUBSCRIPTION_LEVELS = (REMINDER_SUBSCRIPTION_CALENDAR, REMINDER_SUBSCRIPTION_CALENDAR_ALERT)
# settings["people"][i]["remindersEntity"] - settings["people"] itself has no single top-level key (it's a plain list the card owns entirely
SETTINGS_KEY_USER_PROFILES = "userProfiles"
# Marker (also stored in the Settings blob, alongside userProfiles) so the one-time migration never re-runs and clobbers hand-edited profiles
SETTINGS_KEY_NOTIFY_PROFILES_MIGRATED = "notifyProfilesMigrated"

DEFAULT_DIGEST_SECTIONS = {
    "calendar": True,
    "reminders": True,
    "meals": True,
    "grocyExpiring": True,
    "grocyLowStock": True,
    # that person's own pending (status "open", assigned directly to them - not sitting unclaimed in the Chore Bin) chores.
    "chores": True,
}

# explicit Family Hub membership, stored as its own top-level key in the Settings blob (not nested under a person's profile
SETTINGS_KEY_MEMBER_USER_IDS = "memberUserIds"

# guards _maybe_migrate_wishlist_claims_permission_default in __init__.py
SETTINGS_KEY_WISHLIST_CLAIMS_PERMISSION_MIGRATED = "wishlistClaimsPermissionMigrated"

# a second, NARROWER opt-out living UNDER Family Hub membership above, for a household that wants someone

# -- Chores / Rewards / Permissions ----------------------------------------- A separate feature area from the calendar/meal-plan/Grocy stuff
CHORES_STORAGE_KEY_PREFIX = "family_hub_chores"
CHORES_STORAGE_VERSION = 1
REWARDS_STORAGE_KEY_PREFIX = "family_hub_rewards"
REWARDS_STORAGE_VERSION = 1
PERMISSIONS_STORAGE_KEY_PREFIX = "family_hub_permissions"
PERMISSIONS_STORAGE_VERSION = 1

# -- Routines ---------------------------------------------------------------- A fourth
ROUTINES_STORAGE_KEY_PREFIX = "family_hub_routines"
ROUTINES_STORAGE_VERSION = 1

# -- Goals ------------------------------------------------------------------- A fifth sibling alongside Chores/Rewards/Permissions/Routines
GOALS_STORAGE_KEY_PREFIX = "family_hub_goals"
GOALS_STORAGE_VERSION = 1

# Pantry "extras" store (see pantry_engine.py's module docstring)
PANTRY_EXTRAS_STORAGE_KEY_PREFIX = "family_hub_pantry_extras"
PANTRY_EXTRAS_STORAGE_VERSION = 1

# Device Settings admin dashboard - Every setting this covers
DEVICE_SETTINGS_STORAGE_KEY_PREFIX = "family_hub_device_settings"
DEVICE_SETTINGS_STORAGE_VERSION = 1
DEVICE_SETTINGS_EVENT_PUSH = "family_hub_device_settings_push"
# x+ "Identify" (household ask: the Devices tab's rows were hard to tell apart
DEVICE_SETTINGS_EVENT_IDENTIFY = "family_hub_device_settings_identify"
DEVICE_SETTINGS_EVENT_SCREENSAVER_TOGGLE = "family_hub_device_screensaver_toggle"

DEVICE_SETTINGS_EVENT_PRIVACY_PARTICIPATION_TOGGLE = "family_hub_device_privacy_participation_toggle"

PRIVACY_MODE_STORAGE_KEY_PREFIX = "family_hub_privacy_mode"
PRIVACY_MODE_STORAGE_VERSION = 1
# Live-only broadcast (same shape as DEVICE_SETTINGS_EVENT_IDENTIFY/ _SCREENSAVER_TOGGLE above) so every open Family Calendar card
PRIVACY_MODE_EVENT_CHANGED = "family_hub_privacy_mode_changed"

# The whitelist of this-device-only localStorage keys the admin dashboard is allowed to read/display/push
DEVICE_SETTINGS_FIELDS = {
    "familyCalendarCurrentDayFirstLocal": {
        "type": "enum", "choices": ["on", "off"], "default": "off",
        "label": "Current day always first", "scope": "instance",
    },
    "familyCalendarCurrentDayFirstStepLocal": {
        "type": "enum", "choices": ["day", "window"], "default": "day",
        "label": "Current day first navigation step", "scope": "instance",
    },
    "familyCalendarWeekDayCountLocal": {
        "type": "int", "min": 1, "max": 36, "default": 7,
        "label": "Days shown in Week view", "scope": "instance",
    },
    "familyCalendarWeekRowsLocal": {
        "type": "int", "min": 1, "max": 7, "default": 1,
        "label": "Rows shown in Week view", "scope": "instance",
    },
    "familyCalendarWeekViewVariantLocal": {
        "type": "enum", "choices": ["week", "planner", "agenda"], "default": "week",
        "label": "Week button shows", "scope": "instance",
    },
    "familyCalendarMonthViewVariantLocal": {
        "type": "enum", "choices": ["month", "split"], "default": "month",
        "label": "Month button shows", "scope": "instance",
    },
    "familyCalendarShowTimelineLocal": {
        "type": "enum", "choices": ["on", "off"], "default": "off",
        "label": "Timeline view", "scope": "instance",
    },
    "familyCalendarSmallScreenModeLocal": {
        "type": "enum", "choices": ["on", "off"], "default": "off",
        "label": "Small screen mode", "scope": "instance",
    },
    # The "Hidden" option of the General tab's "Calendar top bar style" picker
    "familyCalendarHideTopBarDeviceLocal": {
        "type": "enum", "choices": ["on", "off"], "default": "off",
        "label": "Calendar top bar style: Hidden", "scope": "instance",
    },
    # "Name pills: Hide" in Settings > General > Calendar Card Layout
    "familyCalendarHideNamePillsLocal": {
        "type": "enum", "choices": ["on", "off"], "default": "off",
        "label": "Hide name pills", "scope": "instance",
    },
    # Unlike the free-text `device_name` ws_report already carries (see device_settings_websocket_api.py's own module docstring)
    "familyHubDeviceCustomNameLocal": {
        "type": "text", "max_length": 60, "default": "",
        "label": "Device name", "scope": "device",
    },
}

# Convenience views over DEVICE_SETTINGS_FIELDS above, split by "scope"
DEVICE_SCOPED_SETTINGS_FIELDS = {k: v for k, v in DEVICE_SETTINGS_FIELDS.items() if v.get("scope") == "device"}
INSTANCE_SCOPED_SETTINGS_FIELDS = {k: v for k, v in DEVICE_SETTINGS_FIELDS.items() if v.get("scope") == "instance"}

# Same three-stage shape as CHORE_STATUS_* above, reused deliberately (same meaning: "still being worked toward" -> "hit the target
GOAL_STATUS_OPEN = "open"
GOAL_STATUS_PENDING_VERIFICATION = "pending_verification"
GOAL_STATUS_APPROVED = "approved"
# a fourth, terminal stage - "approved" used to be the end of the line forever
GOAL_STATUS_ARCHIVED = "archived"
GOAL_STATUSES = (GOAL_STATUS_OPEN, GOAL_STATUS_PENDING_VERIFICATION, GOAL_STATUS_APPROVED, GOAL_STATUS_ARCHIVED)

# What approving a goal actually pays out - see goal_engine.approve_goal.
GOAL_REWARD_TYPE_STARS = "stars"
GOAL_REWARD_TYPE_CATALOG_ITEM = "catalog_item"
GOAL_REWARD_TYPES = (GOAL_REWARD_TYPE_STARS, GOAL_REWARD_TYPE_CATALOG_ITEM)

GOAL_EVENT_TYPE = "family_hub_goal_event"

ROUTINE_CATEGORY_MORNING = "morning"
ROUTINE_CATEGORY_AFTERNOON = "afternoon"
ROUTINE_CATEGORY_NIGHT = "night"
# Order matters here - it's the display order of the three accordion rows on each person's column
ROUTINE_CATEGORIES = (ROUTINE_CATEGORY_MORNING, ROUTINE_CATEGORY_AFTERNOON, ROUTINE_CATEGORY_NIGHT)
ROUTINE_CATEGORY_LABELS = {
    ROUTINE_CATEGORY_MORNING: "Morning Routine",
    ROUTINE_CATEGORY_AFTERNOON: "Afternoon Routine",
    ROUTINE_CATEGORY_NIGHT: "Night Routine",
}

SETTINGS_KEY_ROUTINES_ENABLED = "routinesEnabled"

SETTINGS_KEY_GOALS_IN_CHORES = "goalsShowInChores"
SETTINGS_KEY_GOALS_IN_REWARDS = "goalsShowInRewards"

# Chore lifecycle - see chore_engine.py's module docstring for the full state machine.
CHORE_STATUS_OPEN = "open"
CHORE_STATUS_PENDING_VERIFICATION = "pending_verification"
CHORE_STATUS_APPROVED = "approved"
CHORE_STATUSES = (CHORE_STATUS_OPEN, CHORE_STATUS_PENDING_VERIFICATION, CHORE_STATUS_APPROVED)

# Sentinel assigned_to value for "sitting in the shared Chore Bin, claimed by nobody yet" - distinct from assigned_to being null/None
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

# Internal bookkeeping keys on a chore record - not part of the schema handed to the frontend as "the fields you can set," but present on
CHORE_KEY_OVERDUE_PENALTY_APPLIED = "overdue_penalty_applied"
CHORE_KEY_COMPLETED_BY = "completed_by"
CHORE_KEY_COMPLETED_AT = "completed_at"
CHORE_KEY_APPROVED_BY = "approved_by"
CHORE_KEY_APPROVED_AT = "approved_at"
CHORE_KEY_UPDATED_AT = "updated_at"

CHORE_KEY_REMINDER_MINUTES = "reminder_minutes"

# Internal bookkeeping (not part of the create/edit schema): which of this chore's own reminder_minutes lead times have already fired for the
CHORE_KEY_REMINDERS_FIRED = "reminders_fired"

# the reject half of the verification gate - see chore_engine.py's reject_chore.
CHORE_KEY_REJECTED_BY = "rejected_by"
CHORE_KEY_REJECTED_AT = "rejected_at"
CHORE_KEY_REJECT_REASON = "reject_reason"
# Set from the Add/Edit Chore modal's "Doesn't require approval" checkbox.
CHORE_KEY_NO_APPROVAL_REQUIRED = "no_approval_required"

# Quantity-based chores - "3 loads of laundry," "2 dishwasher loads," etc. CHORE_KEY_QUANTITY_TOTAL is how many units the chore was created
CHORE_KEY_QUANTITY_TOTAL = "quantity_total"
CHORE_KEY_QUANTITY_REMAINING = "quantity_remaining"

# Plain opt-in boolean, editable via update_chore like every other simple flag here
CHORE_KEY_IMPORTANT = "important"
# Opt-in: show this chore on the Family Week Calendar on its due date, like a reminder
CHORE_KEY_SHOW_ON_CALENDAR = "show_on_calendar"

CHORE_KEY_IN_PROGRESS = "in_progress"

# Implemented as fan-out: one ordinary single-assignee chore is created PER assignee
CHORE_KEY_GROUP_ID = "group_id"
# A star request: someone asked for stars for something that isn't on the chore chart. Created already
# waiting for approval; approving pays the stars like any chore, rejecting deletes it.
CHORE_KEY_STAR_REQUEST = "star_request"
STAR_REQUEST_MAX_STARS = 100

# Plain-schedule recurrence - a SECOND, independent way (alongside the sensor-driven auto_create_trigger above) for an approved chore to
CHORE_RECUR_TYPE_INTERVAL = "interval"
# The "interval" schedule used to ALWAYS mean "every N days" (recur_interval_days alone) - "every other day" already worked
CHORE_RECUR_INTERVAL_UNIT_DAYS = "days"
CHORE_RECUR_INTERVAL_UNIT_WEEKS = "weeks"
CHORE_RECUR_INTERVAL_UNIT_MONTHS = "months"
CHORE_RECUR_INTERVAL_UNITS = (CHORE_RECUR_INTERVAL_UNIT_DAYS, CHORE_RECUR_INTERVAL_UNIT_WEEKS, CHORE_RECUR_INTERVAL_UNIT_MONTHS)
CHORE_KEY_RECUR_INTERVAL_UNIT = "recur_interval_unit"
CHORE_RECUR_TYPE_WEEKDAYS = "weekdays"
# Google Calendar's own "Monthly on the third Wednesday" option picks exactly one weekday
CHORE_RECUR_TYPE_MONTHLY_NTH = "monthly_nth"
CHORE_RECUR_TYPES = (CHORE_RECUR_TYPE_INTERVAL, CHORE_RECUR_TYPE_WEEKDAYS, CHORE_RECUR_TYPE_MONTHLY_NTH)
CHORE_KEY_RECUR_MONTH_NTH = "recur_month_nth"
CHORE_RECUR_MONTH_NTH_VALUES = (1, 2, 3, 4, -1)
CHORE_KEY_RECUR_NEXT_DUE = "recur_next_due"

# Before this, a recurring chore's due_date was set once (at creation
CHORE_KEY_RECUR_DUE_OFFSET_MINUTES = "recur_due_offset_minutes"

# Fired on every status change (assignment, claim, complete, approve
CHORE_EVENT_TYPE = "family_hub_chore_event"

# Chores already had CHORE_EVENT_TYPE above; Routines (routine_engine.py's per-person daily checklists) never fired anything onto hass.bus at
ROUTINE_EVENT_TYPE = "family_hub_routine_event"

# Native HA services (see services.yaml) - the same five actions the websocket API exposes to the cards
SERVICE_CREATE_CHORE = "create_chore"
SERVICE_COMPLETE_CHORE = "complete_chore"
SERVICE_APPROVE_CHORE = "approve_chore"
SERVICE_REJECT_CHORE = "reject_chore"
SERVICE_NUDGE_USER = "nudge_user"

# Permission keys a household can grant a non-admin HA user in the Permissions tab (Settings > Permissions on family-hub-chores-card
PERMISSION_ASSIGN = "can_assign"
PERMISSION_VERIFY = "can_verify"
PERMISSION_REWARD_OVERRIDE = "can_override_rewards"
# split out of PERMISSION_VERIFY on request - "mark any chore done"
PERMISSION_COMPLETE_ANY = "can_complete_any"
# split out of PERMISSION_REWARD_OVERRIDE on request, same precedent as PERMISSION_COMPLETE_ANY splitting out of PERMISSION_VERIFY above
PERMISSION_REWARD_ADD = "can_add_rewards"
# Lets an admin exempt a specific person from the verification gate entirely: every chore THEY complete goes straight from open to approved
PERMISSION_AUTO_APPROVE = "no_approval_required"
# split out of PERMISSION_ASSIGN on request, same precedent as PERMISSION_COMPLETE_ANY/PERMISSION_REWARD_ADD splitting out of their own
PERMISSION_EDIT_CHORE = "can_edit_chore"
# gates the one specific field on chore create/update that's actually dangerous to hand out loosely - CHORE_KEY_NO_APPROVAL_REQUIRED
PERMISSION_STAR_OVERRIDE = "can_star_override"
# gates editing the weekly meal plan ("the menu") on the calendar card - "need a permission to edit menu
PERMISSION_EDIT_MENU = "can_edit_menu"
# Whether someone can see who's claimed what on a wish list that isn't their own
PERMISSION_SEE_WISHLIST_CLAIMS = "can_see_wishlist_claims"
# Gates the new Delete button in family-week-calendar-card.js's event-info popup (_openEventInfo)
PERMISSION_DELETE_EVENT = "can_delete_event"
# Gates the new Edit affordance in family-week-calendar-card.js's event-info popup
PERMISSION_EDIT_EVENT = "can_edit_event"
# Before this, every routine-item write (create/update/delete/reorder
PERMISSION_ROUTINES_MANAGE_OWN = "can_manage_own_routines"
PERMISSION_ROUTINES_MANAGE_ANY = "can_manage_any_routines"
# Privacy mode (see PRIVACY_MODE_EVENT_CHANGED's own comment above for the feature itself) - "it will display a lock
PERMISSION_TOGGLE_PRIVACY_MODE = "can_toggle_privacy_mode"
CHORE_PERMISSIONS = (
    PERMISSION_ASSIGN,
    PERMISSION_VERIFY,
    PERMISSION_REWARD_OVERRIDE,
    PERMISSION_COMPLETE_ANY,
    PERMISSION_REWARD_ADD,
    PERMISSION_AUTO_APPROVE,
    PERMISSION_EDIT_CHORE,
    PERMISSION_STAR_OVERRIDE,
    PERMISSION_EDIT_MENU,
    PERMISSION_SEE_WISHLIST_CLAIMS,
    PERMISSION_DELETE_EVENT,
    PERMISSION_EDIT_EVENT,
    PERMISSION_ROUTINES_MANAGE_OWN,
    PERMISSION_ROUTINES_MANAGE_ANY,
    PERMISSION_TOGGLE_PRIVACY_MODE,
)

# HA core's `calendar` component defines a CalendarEntityFeature IntFlag on CalendarEntity (CREATE_EVENT=1, DELETE_EVENT=2, UPDATE_EVENT=4)
CALENDAR_ENTITY_FEATURE_CREATE_EVENT = 1
CALENDAR_ENTITY_FEATURE_DELETE_EVENT = 2
# A calendar entity implementing `async_update_event` (HA core's own calendar/__init__.py) reports this bit instead/as well
CALENDAR_ENTITY_FEATURE_UPDATE_EVENT = 4

# Human-facing names for the "please use [INTEGRATION] app to delete this event" popup
CALENDAR_PLATFORM_FRIENDLY_NAMES = {
    "google": "Google Calendar",
    "caldav": "your CalDAV app",
    "local_calendar": "Home Assistant's local calendar",
    "office365": "Outlook / Office 365",
    "o365": "Outlook / Office 365",
    "icloud": "iCloud Calendar",
    "todoist": "Todoist",
    "remote_calendar": "your remote calendar's own app",
}

# a catalog item's redeem_mode - see reward_engine.py's own module docstring for the full picture.
REWARD_REDEEM_MODE_INSTANT = "instant"
REWARD_REDEEM_MODE_BANKED = "banked"
REWARD_REDEEM_MODE_ONE_TIME = "one_time"
REWARD_REDEEM_MODES = (REWARD_REDEEM_MODE_INSTANT, REWARD_REDEEM_MODE_BANKED, REWARD_REDEEM_MODE_ONE_TIME)

CHORES_CARD_JS_URL = "/family_hub_chores_card/family-hub-chores-card.js"
MY_CHORES_CARD_JS_URL = "/family_hub_my_chores_card/family-hub-my-chores-card.js"
REWARDS_CARD_JS_URL = "/family_hub_rewards_card/family-hub-rewards-card.js"
# see goal_engine.py's own module docstring for what Goals is.
GOALS_CARD_JS_URL = "/family_hub_goals_card/family-hub-goals-card.js"
# the My Pantry card (see pantry_engine.py's own module docstring).
PANTRY_CARD_JS_URL = "/family_hub_pantry_card/family-hub-pantry-card.js"
# the To-Do Lists card (see family-hub-todo-card.js's own module docstring): a themed board over whichever native todo.* entities the
TODO_CARD_JS_URL = "/family_hub_todo_card/family-hub-todo-card.js"

# the Active Timers card (see family-hub-active-timers-card.js's own module docstring): every running timer in the house on one board
ACTIVE_TIMERS_CARD_JS_URL = "/family_hub_active_timers_card/family-hub-active-timers-card.js"

# the standalone Recipe Box card (see family-hub-recipe-box-card.js's own module docstring for "the menu box" naming decision): the
RECIPE_BOX_CARD_JS_URL = "/family_hub_recipe_box_card/family-hub-recipe-box-card.js"

# The native todo.family_hub_chores entity (todo.py) - a single shared to-do list mirroring every open/pending chore
TODO_CHORES_UNIQUE_ID_PREFIX = "family_hub_chores_todo"
TODO_CHORES_ENTITY_NAME = "Family Hub Chores"
