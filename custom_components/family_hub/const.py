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
# 6 original built-in presets + Liquid Glass / Liquid Glass Dark (added
# together) = 8 built-ins, so this is bumped from the old 8 to 10 to
# preserve the same 2 custom-theme slots every household already had
# headroom for - without this bump, a fresh install would seed all 8
# slots with presets and the Theme Builder "Add theme" button would be
# permanently disabled from the very first load.
MAX_THEMES = 10

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
# v144.13+ - see pantry_engine.py's own module docstring for what this store
# holds (the "Also Tracking" extras list only - the main Pantry stock list
# is Grocy's own numbers, not owned by this project at all, so there's
# nothing of its own to back up there).
PANTRY_EXTRAS_BACKUP_FILENAME = "pantry_extras_backup.json"

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

# To-Do Lists card's own list selection (v146.5+; family_hub/get_todo_card_
# config and family_hub/set_todo_card_config in __init__.py) - which todo.*
# entities and which Grocy shopping lists the FAB's List(s) tab has picked.
# Deliberately its OWN small Store, separate from SETTINGS_STORAGE_KEY_PREFIX
# above, rather than folded into that shared blob: the calendar card's own
# Settings modal does a full-replace save of that blob from its own known
# fields (see _ws_set_settings's docstring on SETTINGS_KEY_NOTIFY_PROFILES_
# MIGRATED getting silently stripped that exact way) and would have no idea
# this card's keys exist, silently wiping them on its very next unrelated
# save. This used to live only in the card's own Lovelace config
# (`entities`/`grocy_list_ids`, round-tripped via setConfig + a
# config-changed event) - that never actually persisted reliably, since
# nothing listens for config-changed outside of the dashboard's own "Edit
# Card" editing flow, so a plain page reload (no editing involved at all)
# silently reverted to whatever was last saved to the dashboard's own
# stored YAML/storage config, which for most households was nothing.
TODO_CARD_CONFIG_STORAGE_KEY_PREFIX = "family_hub_todo_card_config"
TODO_CARD_CONFIG_STORAGE_VERSION = 1

# Wish Lists (v1.122.0+) - the household's own ask: "home assistant has
# native list functionality and we use it a lot in family Hub but it's not
# super robust. I want to use the native list functionality to be able to
# do wish lists link name image description that kind of thing but all
# built on top of the native list functionality... we will need a way to
# make a list a wish list and display it as such in the list card." A
# household flags any existing todo.* entity as a "wish list" here; the
# To-Do Lists card then renders that list's items as gift-registry cards
# (image/link/description, claim button) instead of a plain checklist -
# see family-hub-todo-card.js's _isWishlistList/_parseWishlistDescription/
# _buildWishlistDescription. The link/image/claim data itself is NOT
# stored here - by design it's embedded straight into each native todo
# item's own `description` field (readable note text, then a JSON tail -
# see _buildWishlistDescription's own comment), so the wish list stays a
# completely ordinary todo.* list to Home Assistant, Grocy-style voice
# assistants, phone widgets, or anyone opening it in HA's own built-in
# Todo UI - this store only ever holds the flag + which HA user flagged it
# (see _ws_set_wishlist_flag).
#
# Deliberately its OWN small Store, separate from SETTINGS_STORAGE_KEY_
# PREFIX and from TODO_CARD_CONFIG_STORAGE_KEY_PREFIX above, for the exact
# same reason as that one (see its own comment just above) - a different
# owner/lifecycle (this is a per-ENTITY flag, not a per-CARD-INSTANCE
# selection, and every To-Do Lists card instance in the household must see
# the same flag for the same entity - "Global, per todo entity" was the
# household's own explicit choice when asked whether this should instead
# be per-card-placement) that a full-replace save of either of those two
# stores has no idea exists.
#
# Shape: `{"<todo entity_id>": {"ownerUserId": "<HA user id>"}}` - only
# flagged entities appear as keys at all (an absent key means "not a wish
# list," same "absent key = default" convention as userProfiles[<user>].
# remindersSubscriptions elsewhere in this file). `ownerUserId` is the HA
# user who was signed in at the moment the flag was switched ON (the
# websocket connection's own `connection.user.id`, never something the
# frontend supplies itself) - it drives the claiming feature's "hidden
# from the wish list's own owner" behavior (see _isWishlistOwner): Family
# Hub's own UI simply never shows claim status to whichever signed-in user
# matches this id, while everyone else sees it normally. This is a
# Family-Hub-side hide only, not real access control - the owner could
# still see raw claim data by opening this same list in HA's own built-in
# Todo UI outside Family Hub, since it's a genuinely native HA list; the
# household explicitly accepted that trade-off in exchange for not having
# to build (and maintain) a parallel storage system just for wish-list items.
TODO_WISHLIST_CONFIG_STORAGE_KEY_PREFIX = "family_hub_todo_wishlist_config"
TODO_WISHLIST_CONFIG_STORAGE_VERSION = 1

# v1.110.5+: the store above used to hold exactly ONE record - fine when a
# household only ever had a single To-Do Lists card, but a real bug once
# people added a second instance (e.g. a grocery-focused card on the
# kitchen tablet plus a personal to-do card on a kid's dashboard): both
# instances read/wrote the SAME record, keyed only by entry_id, so whichever
# one saved last silently overwrote the other's list selection. Fixed by
# giving each card instance a stable `card_id` (a uuid4, generated once by
# the card itself in setConfig and persisted into its own Lovelace card
# config the same way getConfigElement already preserves other fields - see
# family-hub-todo-card.js) and reshaping the store to
# `{"cards": {<card_id>: {entities, grocy_list_ids, rows}}}` - a dict-of-
# records inside the ONE existing Store rather than one Store file per card
# instance, so the file count doesn't grow unbounded as people add/remove
# cards.
#
# MIGRATION: a store saved before this version has no "cards" key at all,
# just the old flat {entities, grocy_list_ids, rows} shape directly at the
# top level. The FIRST card instance to call family_hub/get_todo_card_config
# (or set_todo_card_config) after upgrading with a card_id of its own
# inherits that flat record verbatim into cards[<its card_id>], and the flat
# top-level fields are dropped from the store on that same save, so the
# migration only ever happens once. Any card instance that shows up with a
# DIFFERENT card_id (including a second, brand-new card added post-upgrade)
# gets its own empty record - never the migrated one - since by definition
# it never held that data before.

# v1.109.9+: the most stacked rows the To-Do Lists card's board will spread
# its list columns across - "add rows columns, etc so you can have your
# lists shown how you want a line of lists, 2 stacks, 3 stacks etc." The
# chosen count is stored as a `rows` field in the TODO_CARD_CONFIG store
# above (so it persists through a plain reload exactly like the list
# selection does - see that store's own comment for why Lovelace config
# could never be trusted for this), and both the get and set websocket
# commands clamp to 1..this so neither a stale client nor a hand-edited
# .storage file can hand the card a nonsense layout. 4 is a deliberate
# ceiling rather than an arbitrary one: past four stacks each column is
# shorter than a single item card on any realistic dashboard height, so
# more rows stops being a layout and starts being a bug report.
TODO_CARD_MAX_BOARD_ROWS = 4

# Menu suggestions (v1.109.6+; family_hub/get_menu_suggestions,
# add_menu_suggestion, apply_menu_suggestion and remove_menu_suggestion in
# __init__.py) - the "anyone can suggest, only someone with
# PERMISSION_EDIT_MENU can actually put it on the menu" half of the new
# can_edit_menu permission. Each entry is a pending proposal for one
# specific day + meal block:
#   {uid, date_key, block_index, name, description, link, grocy_recipe_id,
#    servings, suggested_by, suggested_by_name, created_at}
# and lives here (a plain pending queue) rather than on the meal-plan
# todo.* entity itself, so a suggestion is never mistaken for a real
# planned meal by anything that reads that entity (the calendar grid, the
# daily digest, the Grocy grocery-list push, meal templates...).
#
# Deliberately its OWN Store, NOT folded into SUGGESTIONS_STORAGE_KEY_PREFIX
# above: that one is the flat, day-less "recipe ideas wishlist" behind the
# Recipe Box's Suggested filter, with a completely different shape (no
# date/block, no suggester identity, no apply step) and a completely
# different lifecycle. Same reasoning as TODO_CARD_CONFIG's own separate
# store just above - one store per feature, so no feature's full-replace
# save can ever clobber another's keys.
MENU_SUGGESTIONS_STORAGE_KEY_PREFIX = "family_hub_menu_suggestions"
MENU_SUGGESTIONS_STORAGE_VERSION = 1

# Chore/reward timers (v1.110.0+; timer_engine.py, the family_hub/timers/*
# websocket commands in chores_websocket_api.py, and the dedicated sweep
# registered in __init__.py's async_setup_entry) - "We need to be able to
# make chores and rewards have timer associated to them... 2 hours of
# gaming, when you click use reward a timer would start and then a timer
# would go off at the end of the 2 hours. Or if you have a chore thats like
# clean for 30 minutes, at the end of 30 minutes it would set off a timer,
# and either go to approval mode or complete the award."
#
# Each record is one RUNNING timer:
#   {uid, kind: "chore"|"reward", chore_id?/item_id?, title, user_id,
#    started_at (ISO, UTC), duration_minutes, notify_targets}
# and it is deleted the moment it fires or is cancelled - this store only
# ever holds what is currently counting down, never history (a fired chore
# timer's outcome is already recorded on the chore itself; a fired reward
# timer's is already in the redemption log).
#
# Deliberately backend-stored rather than a browser setTimeout: a timer has
# to keep running and still fire when no dashboard is open and the tablet
# is asleep, which is the entire point of "a timer would go off at the end."
# The frontend computes the VISIBLE countdown from started_at +
# duration_minutes so the number on screen is smooth and accurate between
# polls, but it is never what decides that a timer is done.
TIMERS_STORAGE_KEY_PREFIX = "family_hub_timers"
TIMERS_STORAGE_VERSION = 1

# ---------------------------------------------------------------------------
# v1.110.2+: native Home Assistant `timer.*` integration - "this should use
# the home assistant native timer.*"
#
# RESEARCH FINDING, recorded here because it is the whole reason this is
# shaped the way it is, and because the obvious-looking approach is
# genuinely impossible rather than merely awkward:
#
#   Home Assistant's `timer` domain is a HELPER domain, not an entity
#   PLATFORM. It is in the same family as input_boolean / input_number /
#   counter / schedule. Concretely, in HA core:
#     - `homeassistant/generated/entity_platforms.py` - the canonical list
#       of domains an integration may provide entities for - contains
#       "todo" (which is why family_hub/todo.py works) but does NOT
#       contain "timer". So `async_forward_entry_setups(entry, ["timer"])`
#       has nothing to forward to.
#     - `components/timer/__init__.py` has no `async_setup_entry`, no
#       PLATFORM_SCHEMA, and never calls `component.async_setup(config)` -
#       all three of which `components/todo/__init__.py` does have. Its
#       entities come only from YAML (`timer:` in configuration.yaml) or
#       from the Helpers UI, via a `TimerStorageCollection` that is a LOCAL
#       VARIABLE in async_setup and is never published to hass.data, so
#       there is no handle on it from another integration either.
#   The only remaining route would be reaching into the private
#   hass.data["entity_components"]["timer"] EntityComponent and adding a
#   hand-rolled subclass of HA's private Timer class, bypassing
#   sync_entity_lifecycle. That is unsupported, invisible to the Helpers
#   UI, and exactly the kind of private-internals coupling that breaks
#   silently on an HA refactor - so it is deliberately NOT done.
#
# WHAT IS DONE INSTEAD. Family Hub does not fabricate timer entities; it
# DRIVES real ones. Any native timer helper the household creates whose
# entity_id starts with TIMER_ENTITY_PREFIX is treated as an adoptable
# "pool" entity. When a Family Hub timer starts and a free pool entity is
# available, the countdown genuinely runs on that native entity
# (timer.start), and completion is EVENT-DRIVEN off HA's own
# `timer.finished` / `timer.cancelled` bus events rather than polled.
# Such a timer is a first-class HA entity: visible in Developer Tools,
# placeable on any dashboard, and usable as an automation trigger.
#
# When no pool entity is free - including the zero-setup case where the
# household has never created one, which is most households - the timer
# still runs exactly as it did in v1.110.0/v1.110.1, off the store plus
# the TIMER_SWEEP_SECONDS safety net below. Identical user-facing
# behavior either way; native entities are a strict upgrade layered on
# top, never a requirement. The sweep also stays as the backstop for a
# missed event (e.g. HA restarted mid-countdown on a non-restoring
# helper), so a timer can never get stuck running forever.
#
# The prefix is a naming convention rather than a Settings picker on
# purpose: it needs no UI, no migration and no per-timer configuration -
# a household that wants native entities creates
# timer.family_hub_timer_1, _2, ... in Settings > Devices & Services >
# Helpers and Family Hub starts using them on its own.
TIMER_ENTITY_PREFIX = "timer.family_hub"

# ---------------------------------------------------------------------------
# v1.110.3+: CORRECTION AND EXTENSION of the note above - "Creating a user
# should automatically create a timer helper for family hub a
# timer.family_hub.Username and there should be an additional 4 timer
# entities for family these are for is you need a timer and dont set a
# user."
#
# The v1.110.2 note says there is "no supported way to create one
# programmatically". That was right about the BACKEND and wrong as a
# blanket statement, and the difference matters:
#
#   - Re-checked the config-entry hypothesis first, with a positive
#     control: `components/timer/` has NO config_flow.py (404) and its
#     manifest carries no "config_flow": true - while `components/min_max/`
#     (a genuine config-entry helper) has both. `input_boolean`, `counter`,
#     `input_number` and `schedule` are all 404 too. So `timer` is NOT a
#     config-entry helper and hass.config_entries.flow.async_init("timer",
#     ...) would have nothing to init. HA has two distinct kinds of thing
#     both called "helpers", and timer is in the older storage-collection
#     family, not the config-entry family.
#   - What the earlier pass missed: the storage collection IS exposed, just
#     not to Python. `timer` registers a
#     `collection.DictStorageCollectionWebsocket`, which publishes
#     `timer/list`, `timer/create`, `timer/update` and `timer/delete` as
#     ordinary websocket commands (all mutations @require_admin). That is
#     precisely what Home Assistant's own "+ Add Helper -> Timer" button
#     calls - a fully public, documented API surface, not private
#     internals.
#
# RE-VERIFIED LIVE in v1.110.3 (not just re-read from source): called
# `timer/create` against this household's real running Home Assistant
# instance via the ha-mcp tooling, got back a real `timer.family_hub_*`
# entity in state `idle` with the `duration`/`restore`/`icon` fields
# reflected exactly as sent, then deleted it again the same way. Separately,
# the HA best-practices reference bundled with that same tooling (verified
# against HA core 2026.8.3) states explicitly: storage-collection helpers
# (created via `<domain>/create`) are `input_boolean, input_number,
# input_select, input_text, input_datetime, input_button, counter, timer,
# schedule, zone, person, tag`; config-entry/config-flow helpers are a
# disjoint list that does NOT include timer. Both checks agree with each
# other and with the source-reading pass below, which is the highest
# confidence this integration can have on this question without HA core's
# own test suite. `timer/create`'s mutations are @require_admin, same as
# every other helper collection - harmless for a non-admin card load, since
# _ensureTimerHelpers's failure is always swallowed.
#
# So creation is possible; it is just websocket-only, which means it must
# be driven from a CARD (which holds an authenticated admin connection)
# rather than from integration Python (which holds none, and cannot reach
# the collection object - `collection.py` publishes nothing to hass.data
# and timer's own storage_collection is a local variable). Hence
# _ensureTimerHelpers() living in the frontend cards.
#
# `timer/create` takes timer's STORAGE_FIELDS: {name (required), icon,
# duration, restore}. The entity_id is slugified from `name` by HA itself
# (TimerStorageCollection._get_suggested_id returns the name), so naming a
# helper "Family Hub Emma" yields timer.family_hub_emma - which is why
# every auto-created helper is named with the "Family Hub " prefix and so
# lands under TIMER_ENTITY_PREFIX above with no extra work.
#
# WHAT GETS AUTO-CREATED (idempotently, admin-only, never duplicated):
#   - One dedicated helper per household member: "Family Hub <Name>" ->
#     timer.family_hub_<name>. Reconciled whenever Settings is saved and
#     whenever the Active Timers card loads, so existing households get
#     theirs backfilled without re-adding anyone.
#   - TIMER_FAMILY_POOL_SIZE shared ones: "Family Hub Family 1..4" ->
#     timer.family_hub_family_1..4, for timers with nobody assigned (the
#     oven, a board game). Always present regardless of member count.
# All are created with restore=True, matching this integration's other
# durability choices - a countdown survives an HA restart.
#
# ON MEMBER REMOVAL the dedicated helper is deliberately LEFT IN PLACE.
# Removing someone from Family Hub is explicitly a fully reversible act
# that never deletes their profile, permissions or assignments (see
# SETTINGS_KEY_MEMBER_USER_IDS and _removeFamilyHubMember's own comment) -
# silently destroying their timer entity would break that promise, and
# would also take out anything the household had built on top of it (a
# dashboard card, an automation trigger). An admin who wants it gone can
# delete it in one click from Settings > Devices & Services > Helpers.
TIMER_FAMILY_POOL_SIZE = 4
TIMER_FAMILY_ENTITY_PREFIX = "timer.family_hub_family_"
# The display-name prefix every auto-created helper is created with; HA
# slugifies it into the entity_id, which is what keeps them all inside
# TIMER_ENTITY_PREFIX.
TIMER_HELPER_NAME_PREFIX = "Family Hub "

# HA's own bus events for the native timer domain (components/timer's
# EVENT_TIMER_FINISHED / EVENT_TIMER_CANCELLED). Listened to in
# __init__.py's async_setup_entry; see _handle_native_timer_event in
# chores_websocket_api.py for what they resolve to.
NATIVE_TIMER_EVENT_FINISHED = "timer.finished"
NATIVE_TIMER_EVENT_CANCELLED = "timer.cancelled"

# v1.110.3+ - Family Hub's OWN event, fired once for every timer of any
# kind (chore/reward/standalone) that actually completes - see sensor.py's
# module docstring and chores_websocket_api.py's _fire_timer for the full
# design note. This is the idiomatic "trigger: event" an automation like
# "when Sam's screen-time reward ends, lock his computer" is meant to use,
# since it needs no attribute lookup and fires exactly once per completion
# regardless of whether the timer was backed by a native timer.* helper or
# ran off the store-plus-sweep path alone. Event data carries the same
# identifying fields as the per-timer sensor's attributes: kind, chore_id,
# reward_item_id, title, user_id, user_name, native_timer_entity_id.
# Deliberately NOT fired for a cancelled timer - "finished" here means what
# it means for HA's own timer.finished: it ran out, it wasn't stopped.
EVENT_FAMILY_HUB_TIMER_FINISHED = "family_hub_timer_finished"

# How often the backend checks whether any timer has run out. Deliberately
# its own tight interval rather than riding the main poller: that one runs
# every CONF_POLL_MINUTES (default 5), which is fine for "remind me 30
# minutes before an event" but not for a countdown someone is watching hit
# zero - a 30-minute chore timer firing up to 5 minutes late would read as
# broken. The sweep this drives is pure in-memory (compare each running
# timer's end time to now; do nothing at all when none have expired), with
# no network or entity work, so 30s costs effectively nothing. See
# _expire_due_timers in chores_websocket_api.py.
#
# v1.110.2+: for a timer backed by a native timer.* entity this sweep is a
# BACKSTOP rather than the primary mechanism - HA's own timer.finished
# event fires first and does the work. It still runs, because (a) most
# timers have no native entity behind them, and (b) an event can be missed
# (a restart mid-countdown on a helper with restore off), and a countdown
# that silently never ends is a far worse failure than one that ends a few
# seconds late.
TIMER_SWEEP_SECONDS = 30

# Guard rails on a timer's length. 1 minute minimum (anything shorter is a
# mis-typed entry, not a real intent); 24 hours maximum (a "timer" longer
# than a day is a due date, which chores already have a better field for).
TIMER_MIN_MINUTES = 1
TIMER_MAX_MINUTES = 24 * 60

TIMER_KIND_CHORE = "chore"
TIMER_KIND_REWARD = "reward"
# v1.110.1+: a general-purpose household timer with no chore or reward
# behind it at all - "an active timers card... a pop up modal that has 3-4
# common timer times, optional assign to user and optional add time." The
# oven, a board game, a kid's turn on the tablet. Deliberately a third KIND
# in this same store rather than a storage system of its own: it shares the
# entire lifecycle (start / count down / fire / cancel), the same expiry
# sweep, the same one-per-person reasoning and the same notification
# plumbing - the ONLY difference is what happens when it fires, which is
# "notify, and nothing else" (no chore to complete, no stars to pay).
# Carries `label` instead of chore_id/item_id, and its user_id may be empty
# (unassigned), which neither of the other two kinds allows.
TIMER_KIND_STANDALONE = "standalone"
TIMER_KINDS = (TIMER_KIND_CHORE, TIMER_KIND_REWARD, TIMER_KIND_STANDALONE)

# The quick-timer modal's preset buttons, in minutes. Chosen for the
# household-timer use case the request describes ("think 'timer for the
# oven' as much as 'timer for a kid'"): 5 is the nag/turn-taking timer, 15
# and 30 cover most cooking and screen-time slices, 60 is the long one. A
# free-entry custom minutes box sits alongside these, so these are
# shortcuts, never a limit.
TIMER_PRESET_MINUTES = (5, 15, 30, 60)

# Max length of a standalone timer's free-text label ("Oven", "Sam's turn").
TIMER_LABEL_MAX_LENGTH = 60

# Optional per-chore / per-catalog-item timer length, in minutes. Absent or
# None means "no timer," which is every chore and reward that existed
# before v1.110.0 - so nothing changes for them.
#
# On a REWARD this is deliberately an independent field rather than a
# fourth REWARD_REDEEM_MODE: the three modes describe how the STAR COST is
# consumed (a one-off spend, an accumulating bank, or once-ever), while a
# timer describes what happens AFTER redeeming. They compose cleanly -
# "1 hour of TV, banked" is a perfectly coherent reward that both adds to a
# bank and starts a countdown - and folding the timer into the mode
# enumeration would have made those combinations unexpressible.
CHORE_KEY_TIMER_MINUTES = "timer_minutes"
REWARD_KEY_TIMER_MINUTES = "timer_minutes"

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
#           "notifyTimerAlarm": bool,
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
# v1.132.0+: this field's own editable UI (the Calendars tab's per-row
# "their own Reminders list" input) is gone from the card - it now lives
# only on that person's userProfiles[uid]["remindersEntity"] instead (see
# that key's own comment below for the migration that moves an
# already-set value across). This raw settings["people"][i]["remindersEntity"]
# key still exists in storage and is still read (a row whose calendar
# isn't claimed as anyone's primaryCalendar has nowhere to migrate its
# value to), it just can no longer be SET from the Calendars tab.
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
#   - notifyTimerAlarm (v1.119.0+): NOT its own notification - it changes
#     HOW the three existing end-of-timer pushes (chore timer, reward timer,
#     an ASSIGNED standalone timer) are delivered to THIS person when one of
#     THEIR OWN timers goes off: alarm-style (Android alarm-stream channel /
#     iOS critical alert - see chores_websocket_api.py's
#     _send_alarm_notification) instead of the plain quiet push everyone
#     else still gets. Snapshotted onto the timer itself at start time
#     (timer_engine.py's "alarm" field), same reasoning as notify_targets/
#     title being snapshots there. Household ask: "route this through alarm
#     notifications for the person the timer is for."
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
# v1.131.0+: userProfiles[uid]["remindersEntity"] / ["wishlistEntity"] /
# ["badges"] - household ask, verbatim: *"I would like to be able to set a
# user calendar, a user reminder todo list and a user wish list all under
# their settings."* Before this, a person's own calendar/reminders/wish-list
# setup was scattered across three different, only loosely-connected
# places left over from this project's original calendar-only design:
#   - their CALENDAR was only ever "whichever settings.people[] row they
#     starred as primaryCalendar" (see primaryCalendar's own comment
#     above) - meaning it had to ALREADY exist as a general Calendars-tab
#     entry before a profile could point at it, and its badges lived on
#     that people[] row, entirely separate from the profile.
#   - their REMINDERS list was settings.people[i].remindersEntity - again,
#     only reachable through whichever people[] row happened to be their
#     starred primaryCalendar, never set directly on the profile itself.
#   - their WISH LIST didn't have a per-person home at all - flagging a
#     todo.* list as a wish list (TODO_WISHLIST_CONFIG_STORAGE_KEY_PREFIX
#     below) was done per-entity from the To-Do Lists card's own List(s)
#     tab, with no link back to "whose" wish list it was beyond the
#     ownerUserId stamped at flag time.
# These three new fields let the Users tab set/create all three directly
# on the profile, while primaryCalendar itself keeps its existing meaning
# and storage (a calendar entity id - see its own comment above) so
# nothing already saved needs migrating:
#   - remindersEntity (str, default ""): this person's own individual
#     Reminders to-do list. Read in PREFERENCE to the legacy settings.
#     people[i].remindersEntity lookup (matched via primaryCalendar) by
#     every call site that resolves "this profile's own reminders list" -
#     see _resolve_profile_reminders_entity.
#     v1.132.0+: the Calendars tab's own "their own Reminders list" field
#     (the settings.people[i].remindersEntity fallback just mentioned) is
#     gone from the card's UI - household ask, verbatim: *"move the linked
#     reminders off of the calendar accordion... make sure that if there
#     is a currently linked todo list on a calendar and a user that
#     selected a calendar as theirs it transfers over to the new calendars
#     and reminders area."* _migrate_people_reminders_into_profiles (in
#     __init__.py, run on every Settings load AND save) does exactly that
#     transfer: for each people[] row with its own remindersEntity still
#     set, it copies that value onto every profile whose primaryCalendar
#     points at that same row (unless that profile already has its own
#     remindersEntity) and then clears the row's copy, since the whole
#     point is to MOVE the data, not leave two copies that can drift. A
#     people[] row whose calendar isn't anybody's primaryCalendar keeps
#     its own remindersEntity untouched (nowhere to move it to) - see that
#     function's own docstring for the full detail, including how the
#     card's "Other people's reminder lists" subscription picker
#     (_renderNotifyProfileRemindersLists) still reads a legacy,
#     unmigrated row's value alongside every profile's own field.
#   - wishlistEntity (str, default ""): this person's own wish list to-do
#     entity. Saving a profile with this set auto-flags that entity in the
#     wish-list store (same flag _ws_set_wishlist_flag itself would set,
#     with ownerUserId = this profile's own user id) - see
#     _sync_profile_wishlist_flags in __init__.py - and un-flags whatever
#     entity this SAME profile had here before, if it changed. A blank
#     value means "no personal wish list set" and never touches the flag
#     store at all, so a wish list flagged the old way (directly from the
#     To-do Lists card, with no profile pointing at it) is left alone.
#   - badges (list of {text, match, hideMatch}, default []): same exact
#     shape as a settings.people[] row's own "badges" array. Applies to
#     THIS profile's own primaryCalendar. If that calendar entity is ALSO
#     a row in settings.people[] (a household that still adds it under the
#     general Calendars tab too - fully supported, nothing here removes
#     that), the profile's own badges/color win for that one entity rather
#     than the two configs needing to be kept in sync by hand - see
#     family-week-calendar-card.js's _getPeople for the merge. If the
#     entity is NOT in settings.people[] at all, _getPeople synthesizes a
#     virtual column for it, named after this profile's own household
#     member name, so "include a user's calendar under their name on the
#     calendar" works without ever touching the general Calendars list.
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

# v1.132.5+: guards _maybe_migrate_wishlist_claims_permission_default in
# __init__.py (see PERMISSION_SEE_WISHLIST_CLAIMS's own comment above for
# why that migration exists at all) - same "presence, not a separate
# migrated-boolean-per-user" idea SETTINGS_KEY_MEMBER_USER_IDS itself uses,
# except here the thing being backfilled (a grant inside the Permissions
# store, keyed by user_id) has no natural way to tell "never touched" apart
# from "explicitly False," so this lives as its own plain flag in the main
# Settings blob instead. Runs once, right after member_user_ids has
# already been migrated (see the call site) - only members in that already-
# final roster are grandfathered in; anyone added afterward correctly
# starts without the grant, same as any other permission.
SETTINGS_KEY_WISHLIST_CLAIMS_PERMISSION_MIGRATED = "wishlistClaimsPermissionMigrated"

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

# Pantry "extras" store (see pantry_engine.py's module docstring) - the
# household's own free-text list of things they're tracking that aren't
# real Grocy products (e.g. "half a bag of flour", "borrowed casserole
# dish"). Mirrors the Goals store above exactly; the main Pantry stock
# list itself is never stored here since it's just Grocy's own numbers.
PANTRY_EXTRAS_STORAGE_KEY_PREFIX = "family_hub_pantry_extras"
PANTRY_EXTRAS_STORAGE_VERSION = 1

# Same three-stage shape as CHORE_STATUS_* above, reused deliberately (same
# meaning: "still being worked toward" -> "hit the target, waiting on a
# parent to confirm it's real" -> "confirmed, reward paid out") rather than
# invented fresh - a household that already understands the Chores
# verification gate needs to learn nothing new for Goals.
GOAL_STATUS_OPEN = "open"
GOAL_STATUS_PENDING_VERIFICATION = "pending_verification"
GOAL_STATUS_APPROVED = "approved"
# v144.13+: a fourth, terminal stage - "approved" used to be the end of the
# line forever (see goal_engine.archive_goal's own docstring for the
# household report this fixes: approved goals just piled up at the bottom
# of My Goals with no way to tidy them away). No reward side effects here -
# approve_goal already disbursed the reward the moment it happened; this is
# purely "I've seen it, get it out of my active list."
GOAL_STATUS_ARCHIVED = "archived"
GOAL_STATUSES = (GOAL_STATUS_OPEN, GOAL_STATUS_PENDING_VERIFICATION, GOAL_STATUS_APPROVED, GOAL_STATUS_ARCHIVED)

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
# Set from the Add/Edit Chore modal's "Doesn't require approval" checkbox.
# When true, complete_chore skips the pending_verification stop for THIS
# chore specifically, regardless of who completes it or what their own
# PERMISSION_AUTO_APPROVE grant says - see
# chore_engine.chore_skips_verification for how the two combine.
CHORE_KEY_NO_APPROVAL_REQUIRED = "no_approval_required"

# Quantity-based chores - "3 loads of laundry," "2 dishwasher loads," etc.
# CHORE_KEY_QUANTITY_TOTAL is how many units the chore was created with;
# None/0 means this is an ordinary (non-quantity) chore and nothing below
# changes behavior at all - this is purely opt-in, matching every other
# feature added this way in this file. CHORE_KEY_QUANTITY_REMAINING tracks
# how many units are still left THIS cycle: complete_chore decrements it by
# one per tap instead of immediately entering pending_verification, and
# only runs the normal completion flow once it reaches 0 - see
# chore_engine.complete_chore. reset_recurring_chore refills it back to
# quantity_total for a recurring chore's next occurrence.
CHORE_KEY_QUANTITY_TOTAL = "quantity_total"
CHORE_KEY_QUANTITY_REMAINING = "quantity_remaining"

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
# Lets an admin exempt a specific person from the verification gate
# entirely: every chore THEY complete goes straight from open to approved
# (stars disbursed immediately) with no pending_verification stop, exactly
# as if every one of their chores had CHORE_KEY_NO_APPROVAL_REQUIRED set.
# Distinct from CHORE_KEY_NO_APPROVAL_REQUIRED below, which is the same
# exemption applied per-CHORE instead of per-person (e.g. a chore trivial
# enough nobody needs to double-check it, regardless of who does it) - see
# chore_engine.chore_skips_verification, which checks both and needs only
# one to be true. Reuses the exact same string as that key: they live in
# separate dicts (this one keyed by user_id in the Permissions store,
# that one a field on the chore record itself) so there's no collision.
PERMISSION_AUTO_APPROVE = "no_approval_required"
# v144.4+: split out of PERMISSION_ASSIGN on request, same precedent as
# PERMISSION_COMPLETE_ANY/PERMISSION_REWARD_ADD splitting out of their own
# broader permissions above - a household wanted to grant someone (e.g. an
# older kid) the ability to CREATE and assign new chores without that same
# grant also letting them go edit the star_value/due_date/etc. on any
# EXISTING open chore (the household's own worry: "prevents a kid from
# adding stars to an open chore"). Before this existed, ws_update_chore
# reused PERMISSION_ASSIGN for both, so there was no way to grant one
# without the other. ws_create_chore is UNCHANGED (still PERMISSION_ASSIGN
# only) - this only gates ws_update_chore (and the chores card's own Edit
# button/modal, which mirrors the same gate client-side as a UI
# convenience, same as PERMISSION_ASSIGN's own comment there already
# explains).
PERMISSION_EDIT_CHORE = "can_edit_chore"
# v144.4+: gates the one specific field on chore create/update that's
# actually dangerous to hand out loosely - CHORE_KEY_NO_APPROVAL_REQUIRED
# (see chore_engine.chore_skips_verification). Without PERMISSION_ASSIGN/
# PERMISSION_EDIT_CHORE a kid can't create or edit a chore at all; but
# someone who DOES have one of those (to legitimately create/assign/edit
# ordinary chores) could otherwise also set no_approval_required=True on a
# chore assigned to themselves and collect its stars the instant they tap
# Done, with nobody ever getting a chance to catch an absurd star_value or
# even notice - "prevents a kid from making random chores that dont need
# approval and getting stars," the household's own words. So this is
# required IN ADDITION to the base create/edit permission specifically
# when a request's own no_approval_required field is truthy; turning it
# OFF (or a request that omits the field, or one that explicitly sets it
# False) never needs this - only turning the exemption ON does. Distinct
# from PERMISSION_AUTO_APPROVE just above, which exempts a specific PERSON
# from verification for everything they complete (an admin's own grant to
# someone they trust); this instead controls who's allowed to author a
# CHORE that skips verification for whoever completes it.
PERMISSION_STAR_OVERRIDE = "can_star_override"
# v146.6+: gates editing the weekly meal plan ("the menu") on the calendar
# card - "need a permission to edit menu, prevents kids from messing with
# the menu, anyone can suggest but only ones with edit menu permission can
# edit." A household member without this (and without real HA admin) can
# still open a day/meal editor and look at it, but its Save/Delete/Move
# controls are replaced with a "Suggest" action instead (see
# family-week-calendar-card.js's _canEditMenu/_openEditor, and the new
# family_hub/menu_suggestions store/websocket commands in __init__.py) -
# same shape as PERMISSION_REWARD_ADD's own "without this, their
# suggestions need approval" precedent just above, rather than a hard
# block. Standalone, not split out of anything - the menu has never had
# ANY permission gating before this.
PERMISSION_EDIT_MENU = "can_edit_menu"
# v1.132.5+: household ask, verbatim (after a kiosk-specific "hide until
# login" toggle in v1.132.4 already closed most of the gap): "it should be
# a user setting under permissions instead." Whether someone can see who's
# claimed what on a wish list that isn't their own (family-hub-todo-
# card.js's _wishlistItemHtml/_toggleWishlistClaim) - the list's own OWNER
# already has claim status hidden from them unconditionally (see
# _isWishlistOwner, unrelated to this permission and never overridden by
# it); this permission only ever governs whether a NON-owner sees it.
#
# UNLIKE every permission above, this one's correct default is the
# opposite of "nobody has it until granted" - before this permission
# existed, every signed-in household member could already see claim status
# with zero restriction at all, so defaulting it to False the ordinary way
# would silently take that away from everyone's own phone/tablet, not just
# close the shared-kiosk gap it exists for. __init__.py's
# _maybe_migrate_wishlist_claims_permission_default runs once and
# explicitly grants this to every household member who already existed at
# upgrade time; after that one-time backfill, it behaves exactly like
# every other permission here (defaults to False, an admin grants/revokes
# it per person from Users -> a person's own profile -> Permissions) - so
# an unidentified shared kiosk login, or anyone added to the household
# after the migration has already run, correctly starts blind to claim
# status until an admin explicitly turns it on for them.
PERMISSION_SEE_WISHLIST_CLAIMS = "can_see_wishlist_claims"
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
)

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
# v140+ - the My Pantry card (see pantry_engine.py's own module docstring).
# Added here in v144.3 after discovering the card was shipped in v140-v142/
# 1.107.0 with working code and passing tests, but was NEVER actually wired
# into async_setup_entry's static-path/dashboard-resource registration below
# - so Home Assistant had never once served its JS or registered it as a
# Lovelace resource, and it could never appear in the Add Card picker no
# matter what the user searched for. See async_setup_entry's own comment
# at the fix site for the fuller story.
PANTRY_CARD_JS_URL = "/family_hub_pantry_card/family-hub-pantry-card.js"
# v146+ - the To-Do Lists card (see family-hub-todo-card.js's own module
# docstring): a themed board over whichever native todo.* entities the
# household points it at. No backend storage of its own (everything reads/
# writes straight through the native `todo` domain's services), so this is
# the only wiring this feature needs on the Python side - same four-step
# static-path/hash/resource pattern as every other card here, just with no
# new websocket commands to register alongside it.
TODO_CARD_JS_URL = "/family_hub_todo_card/family-hub-todo-card.js"

# v1.110.1+ - the Active Timers card (see
# family-hub-active-timers-card.js's own module docstring): every running
# timer in the house on one board, colour-coded by whoever it's assigned
# to, plus the quick-timer modal that starts a standalone one. Reads the
# same timers store the chore/reward timers already use - no storage of its
# own - so this is the usual four-step static-path/hash/resource wiring
# plus the three family_hub/timers/* standalone commands.
ACTIVE_TIMERS_CARD_JS_URL = "/family_hub_active_timers_card/family-hub-active-timers-card.js"

# v1.110.6+ - the standalone Recipe Box card (see
# family-hub-recipe-box-card.js's own module docstring for "the menu box"
# naming decision): the household's Recipe Box ("Loved Dishes") from the
# weekly calendar card's own modal, as its own dashboard tab. Runs on the
# exact same shared method objects (window.__familyHubRecipeBoxShared) the
# modal itself does, so it has no storage of its own beyond the same
# family_hub/get_recipes|set_recipes and get_suggestions|set_suggestions
# commands the modal already uses - same four-step static-path/hash/resource
# wiring as every other card here, no new websocket commands needed.
RECIPE_BOX_CARD_JS_URL = "/family_hub_recipe_box_card/family-hub-recipe-box-card.js"

# The native todo.family_hub_chores entity (todo.py) - a single shared
# to-do list mirroring every open/pending chore, so Assist/Alexa/Google and
# Home Assistant's own to-do UI can see and add chores without the cards at
# all. Unique id is stable/config-entry-scoped like every other entity this
# integration could ever register, even though this is the first one.
TODO_CHORES_UNIQUE_ID_PREFIX = "family_hub_chores_todo"
TODO_CHORES_ENTITY_NAME = "Family Hub Chores"
