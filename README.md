# Family Hub

A full Home Assistant custom integration (`family_hub`, currently v1.109.6)
that bundles a whole family-tablet dashboard — calendar, chores, rewards,
goals, and more — into one install/update, instead of a pile of separate
integrations and cards:

- **Family Week Calendar card** — a full-screen, tablet-friendly Lovelace
  card combining a weekly/monthly family calendar, a per-day meal planner,
  a recipe box, weather, a countdown banner, and a Daily Digest.
- **Family Today card** — a small, single-day companion card you can paste
  onto any dashboard to see just today's events, meals, and due reminders,
  sharing the full card's config, entities, and theme automatically.
- **Chores, Rewards, Goals & Routines** — a full second board (`Chores`,
  `Rewards`, `Goals`, and a per-person `My Chores` card) covering
  assignable/rotating/first-come chores with a star economy, a redeemable
  rewards catalog, standalone or embedded goals, and Morning/Afternoon/
  Night routine checklists — with a granular per-person permissions system
  underneath it all. See [Chores, Rewards, Goals & Routines](#chores-rewards-goals--routines)
  below.
- **Theming** — a set of built-in preset themes, every installed native
  Home Assistant theme available alongside them, plus a per-device Theme
  Selector card (a small gear-icon card for picking which theme this
  tablet/browser shows). A full custom Theme Builder panel exists in the
  codebase but isn't part of this beta release yet.
- **Server-side notifications** — calendar-event reminders, standalone
  reminders, chore due-date reminders, and a once-a-day Daily Digest, all
  fired by the backend on a schedule so they arrive whether or not anyone
  has the dashboard open.
- **Recipe & meal planning, with or without Grocy** — a recipe box, meal
  suggestions, and recurring/templated meal planning work entirely on their
  own; connecting a self-hosted [Grocy](https://grocy.info) instance
  (optional) adds recipe importing, a live Recipe Viewer, shopping lists,
  Expiring Soon/Low Stock tracking, and matching Daily Digest lines on top.
- **Screen Saver** — an idle-triggered full-screen video or camera-feed
  overlay for a wall-mounted tablet, shared across every Family Hub card on
  the same dashboard so it only ever runs once.

Built to compete with commercial family-hub tablets (Skylight, Dragon
Touch, etc.) while running entirely on your own Home Assistant instance.

## Features

### Calendar & layout
- **Week view and Month view**, switchable from the card itself, with a
  default-view setting. Tapping a day in Month view jumps to that week.
- **Per-person/per-calendar columns** with configurable name and color,
  driven by any number of `calendar.*` entities — fully manageable live from
  the in-card Settings → Calendars accordion (no YAML editing required after
  initial setup).
- **Per-calendar badges**: any calendar can define a keyword to watch for in
  event titles, a short badge (e.g. "N") to display next to the date when it
  matches, and a separate keyword for events that should be hidden from the
  grid entirely (e.g. a background custody-schedule calendar).
- **Optional hourly timeline** view, toggle is **device-specific** (saved to
  that browser/tablet only, via `localStorage`). Range is configurable start
  hour to end hour, with the end able to reach **Midnight**.
- **Word-wrapped event names** in both Week and Month view — full titles are
  shown rather than truncated.
- **Add-event FAB**: a floating "+" button with two tabs — **Calendar**
  (title, calendar, all-day or timed, location, notes, optional reminder
  lead time) and **Reminder** (a standalone to-do-backed reminder with its
  own date/time and an optional "roll over to next day if not completed"
  toggle) — without leaving the card.
- **Multi-person events**: any event's info popup gets an **"Also for"**
  row — check off any other household member and the event shows in their
  column too (Week/Month view), with a diagonal collage/stripe background
  blending everyone's colors instead of one solid color. The event still
  lives on exactly one real calendar; tagging is purely a display overlay,
  nothing is duplicated onto anyone else's actual calendar.
- **Print/export view**: prints (or "Save as PDF" via the browser's print
  dialog) whichever view — week or month — is currently on screen, carrying
  over the active theme's colors.

### Meal planning
Everything in this section works entirely on its own, with no Grocy (or any
other outside service) required — Grocy only adds the deeper grocery/recipe
features described in its own section below.
- **Meal planner** with 1–3 configurable blocks per day (Breakfast/Lunch/
  Dinner by default, renameable), an optional "breakfast on weekends only"
  toggle, per-dish custom card colors, and a drag-to-reorder **Edit** mode.
- **Meal view-card**: once a day's meal is actually set, opening it shows a
  clean read-only summary (dish name, Prep/Cook/Serves facts when known, a
  "View Recipe" button, and a small pencil button) instead of jumping
  straight back into the picker/edit fields — tap the pencil to change the
  name, description, or link, or Clear to empty the slot again. The love/
  dislike rating buttons stay visible the whole time.
- **Recurring weekly meals**: any planned meal can be set to "repeat weekly"
  — it then auto-fills the same weekday/block every future week until
  turned off or overridden for a single week (editing a projected occurrence
  asks whether to change just that day or every future week).
- **Whole-week meal templates**: save an entire week's plan as a named
  template ("Taco Tuesday week", "Camping week", etc.) and apply it to any
  week with one click.
- **Meal plan in Month view** (optional toggle): planned meals show as
  pills; tapping one opens that day's meal editor directly.
- **Recipe box ("Loved Dishes")** with heart/thumbs-down ratings, recipe
  links (with an **Open link** button next to the link field in the menu
  editor), and a picker to reuse a loved dish when planning a new meal.
  Dishes can be added, edited, and deleted from the Loved Dishes list and
  each dish's own detail screen.
- **Meal Suggestions** — there's no separate Suggestions box to manage;
  tapping the light-bulb icon on any Recipe Box entry (or checking "Also
  add to Meal Suggestions" while adding/editing one) flags it as a
  suggestion. Both the "💡 Meal Suggestion" option on the + button and the
  header's "💡 Suggestions" button open the Recipe Box itself, filtered to
  its "💡 Suggested" chip, so suggesting and picking a meal both happen in
  the same searchable list as everything else.
- **Search** inside the Recipe Box, including its Suggested filter.

Without Grocy, a Loved Dish or a day's meal is filled in through the dish/
day editor's own fields — name, description, a recipe link (with an Open
Link button), card color, servings — typed or pasted in by hand. The
three-way recipe importer described below (paste a link, paste raw recipe
text, or a blank form with per-ingredient matching) is a Grocy feature: it
always creates a real Grocy recipe, and needs a Grocy connection to work at
all.

### Grocy integration (optional)
Connect a self-hosted [Grocy](https://grocy.info) instance under Settings →
Devices & Services → Family Hub → Configure → **Grocy** (URL + API key) to
unlock a deeper recipe/grocery layer on top of the meal planner above.
Leave both fields blank and none of this appears — Family Hub works exactly
as described everywhere else in this README with no Grocy at all.

- **Pick a meal straight from Grocy**: the Recipe Box gets an "Add from
  Grocy" option that pulls in one of your existing Grocy recipes by name,
  instead of typing one in by hand.
- **In-card Recipe Viewer**: tapping a Grocy-backed recipe opens a
  full-screen viewer (servings, grouped ingredients, instructions, photo)
  fetched live through Family Hub, instead of sending you to Grocy's own
  website (which needs its own separate login the API key doesn't satisfy).
  A **live servings scaler** (+/- stepper) rescales every numeric ingredient
  amount on the fly, including the plain-text ingredient list some recipes
  carry in their own description. A **Mark Consumed** button deducts the
  recipe's ingredients from Grocy stock (the current scaled serving count,
  if the stepper's been touched) — the same thing as Grocy's own "Consume
  all ingredients needed" button, confirmed first since it's a real,
  one-way stock transaction.
- **Import a recipe into Grocy**: "Import a Recipe" offers three ways in —
  paste a link (reads the same schema.org structured data most recipe sites
  publish for Google/Pinterest — name, ingredients, instructions, servings,
  and Prep/Cook time when published; no AI involved), paste the recipe's
  raw text (a best-effort "Ingredients"/"Instructions" section-header
  parser), or skip straight to a blank form and enter it by hand. Every
  ingredient line is fuzzy-matched against your existing Grocy products
  (editable, removable, or added fresh), with a "+ Add new product to
  Grocy…" option — including quantity-per-container — for anything missing,
  and a "+ Add new location…" option for a storage location Grocy doesn't
  have yet. Any unit picker on this screen (an ingredient's own unit, or
  the new-product form's Stock/Purchase unit) has a matching "+ Add new
  unit…" option for a measurement Grocy doesn't have yet either (e.g.
  "fluid ounce" or "tablespoon"). An "Include ingredients in the preparation text" checkbox
  (checked by default) controls whether that raw ingredient list also gets
  written into the recipe's description alongside the instructions — either
  way the ingredients still become real Grocy ingredient rows, so matching
  and shopping-list pushes work the same regardless. Image and source-link
  fields carry through, and the created recipe's photo, ingredients, and
  Prep/Cook time all show up back on the meal view-card once it's planned.
  Each ingredient's real quantity (e.g. the "2" in "2 cups flour") is parsed
  automatically and shown as an editable amount + unit next to the raw text
  — this is the number Grocy actually uses for stock math (shopping-list
  "missing" amounts, the recipe's "fulfilled" check, and the Mark Consumed
  button above), not just cosmetic display text. Anything that can't be
  pinned to one clean number (a range like "3-4", or free text like "a
  pinch of salt") defaults to a "Don't count toward stock" checkbox instead
  of a made-up amount, and a chosen unit with no known Grocy conversion
  path to that product's stock unit gets flagged inline so it can be fixed
  or swapped before the recipe is created.
- **Grocery List**: pushes a whole week's Grocy-sourced meals onto Grocy's
  own shopping list in one tap, combining amounts across recipes and
  skipping what's already in stock exactly as Grocy's own UI would, with an
  "Added" / "Not added yet" status per meal so it's clear what's already
  been shopped for. Grocy itself adds those ingredients in the recipe's own
  cooking unit (e.g. "3 cup" of flour), so right after the push, anything
  with a real purchase-unit conversion set up in Grocy gets automatically
  converted and rounded up to a whole number of the unit it's actually
  bought in (e.g. "2 lb") - a short note on the push result says how many
  items got rounded this way. Anything without a conversion set up yet is
  left exactly as Grocy wrote it.
- **Shopping List** (More menu): view and edit Grocy's shopping list without
  leaving Family Hub — check items off, remove them, add a new one by name,
  see an estimated running total by price, and (if you use more than one
  Grocy list, e.g. "Costco" vs. a regular run) switch between lists or spin
  up a brand new one on the spot. Any item can be moved to a different list.
- **Put Away / Scan**: mark a shopping-list item purchased and immediately
  file it into Grocy stock at a location and expiration date, adding a new
  storage location inline if you need one that doesn't exist yet.
- **Expiring Soon** and **Low Stock** lists (More menu, each its own opt-in
  toggle under Settings → Grocy): everything in Grocy stock due within 30
  days, or currently below its minimum stock amount, with a one-tap "Add
  All to Shopping List" button for Low Stock and small recipe-suggestion
  chips on Expiring Soon items that use up something about to expire.
- **Per-feature Daily Digest toggles**: Expiring Soon and Low Stock can each
  independently be included in (or left out of) the once-a-day Daily Digest
  notification described below, on top of their own on/off switch for
  showing up in the More menu at all.

### Chores, Rewards, Goals & Routines
A second board — separate `Chores`, `Rewards`, `Goals`, and `My Chores`
cards, all talking to their own backend, no calendar/todo entities needed
(see [Card configuration](#card-configuration) below for how to add them).
Together they cover assignable chores with a star economy, a redeemable
rewards catalog, one-off goals, and daily routine checklists, all gated by
a granular per-person permissions system.

**Chores**
- **Assignment modes**: **Direct** (assign to one person), **Chore Bin**
  (an admin assigns it later), **Auto-rotation** (takes turns through an
  ordered rotation group), or **First come, first served** (anyone can
  self-claim it with a **Claim** button). Chore Bin and First-come-first-
  served chores both start out sitting in a shared **Chore Bin** column.
- **Verification flow**: the assignee taps **Done**, sending it to
  "Awaiting approval"; anyone with verify permission taps **Approve** (pays
  out its star value, extends a 🔥 streak if it was on time) or **Reject**
  ("↩ Sent back", with an optional note, reopens it for a redo).
- **Recurrence, two independent ways**: a plain schedule (every N days, or
  specific days of the week) that reopens the chore once it's both
  approved and due again; and/or a sensor-driven auto-create trigger (an HA
  entity state change, e.g. "Dryer finished") that cycles it back to open
  on its own. A separate auto-complete trigger can also mark a chore done
  automatically from a sensor.
- **Dependencies, rotation groups, and notes**: a chore can require other
  chores be approved first, cycle through an ordered rotation group of
  people, and carry a free-text Notes field.
- **Due dates, reminders, overdue penalties, streaks**: an optional due
  date with configurable reminder lead times (the same 5m–1d choices as
  calendar-event reminders), an optional one-time star penalty applied if
  it goes overdue, and a 🔥 streak badge that grows with on-time approvals
  and resets on a late one.
- **Nudge button**: a one-tap 🔔 reminder push to whoever a chore is
  currently assigned to.
- **Waiting to Recur column**: an approved recurring/triggered chore moves
  into its own "↻ Waiting to Recur" column (collapsible to a small counter
  button) instead of sitting faded in someone's finished list.
- **The "+" FAB**: a tabbed create modal — **Chore**, **Goal**, and (when
  Routines is on) **Routine** — covers creating a chore, a goal, or
  managing someone's routine items, all from one button.

**Rewards**
- **Star economy**: stars are earned via chore/goal approval and spent by
  redeeming a catalog item; a balance can go negative (shown as "owes")
  rather than being blocked from spending.
- **Reward catalog**: title, star cost, an optional "what it's really
  worth" note (e.g. "$20" — purely cosmetic), an icon (a 58-emoji picker
  across 6 collapsible categories — Treats & Food, Screens & Games, Toys &
  Fun Stuff, Outings & Activities, Money & Prizes, Achievement & Fun), and
  a card color.
- **How it works**: **Redeem any time** (a plain logged redemption),
  **Stacks up** (e.g. allowance or TV time — each redemption adds a fixed
  amount to a running per-person bank instead of being a one-off, spent
  down later via a separate **Use** action), or **One-time** (the catalog
  item deletes itself after its first use).
- **Requires fulfillment**: an optional checkbox ("needs a parent to mark
  it done before it counts", e.g. cash allowance) that holds a redemption
  as pending until someone with pricing authority marks it done.
- **Suggestions**: anyone without pricing authority can suggest a new
  reward with no cost set; it waits in **Suggested Rewards** until someone
  prices and approves (or rejects) it.
- **History**: every star change (chore/goal payouts, redemptions,
  overdue penalties, manual balance adjustments) is logged per person; a
  redemption can be **Reversed** (deletes the log entry and refunds the
  stars) or just **Cleared** (deletes it without a refund) by anyone with
  override authority.

**Goals**
- **What a goal is**: a one-off achievement for one specific person —
  title, target count (log progress that many times to complete it),
  optional due date, and a reward that's either a flat star payout or one
  specific item handed over straight from the Rewards catalog.
- **Progress & verification**: each **Log** (or **Mark done**, for a
  single-count goal) tap logs one occurrence; hitting the target sends it
  for approval the same way a chore does. **Approve** pays out the reward;
  **Send back** resets progress to zero for a genuine retry.
- **Standalone card, or embedded**: `Goals` is its own Lovelace card, and
  can also be shown right inside the Chores board (Settings → General →
  "Show Goals on the Chores board") and/or the Rewards page ("Show Goals
  on the Rewards page") — two independent toggles, both off by default.
  Either way, goals can also be created from a Goal tab on the Chores/
  Rewards "+" buttons.

**Routines**
- **Morning/Afternoon/Night checklists**: a per-person daily checklist
  shown as an accordion on their own Chores board column, reset back to
  unchecked every local midnight. No stars, no verification — checking an
  item off is open to anyone.
- **Card-style items with optional due times and days**: each item can
  carry a due time (shown as a badge, turns amber if it's overdue) and/or
  specific days of the week it applies to — leave the days blank for every
  day. The board only ever shows what's scheduled for today.
- **A real management modal**: adding, editing, and removing routine items
  happens from a **Routine** tab on the Chores board's "+" button — pick a
  person and a category, and manage every item for them regardless of
  which days it's scheduled (unlike the board itself, which is always
  today-only). The pencil icon on any routine item on the board jumps
  straight into this tab, pre-scoped to that exact item.
- **One household-wide switch**: Settings → General → "Routines" — off by
  default; once on, everyone gets the three checklist accordions on their
  own Chores column.

**Permissions**
- **Granted per-person** from Settings → **Permissions** (admin-only):
  **Can assign chores to others**, **Can approve/verify completed
  chores**, **Can mark any chore done (not just their own)**, **Can
  override reward star costs**, and **Can add rewards to the catalog with
  a star cost** (without it, their suggestions need approval first). A
  real Home Assistant admin account always has every permission
  implicitly.
- **What anyone can do with no grants at all**: claim an unclaimed chore
  from the Chore Bin, mark their own chore done, check off their own (or
  anyone's) routine items, log their own goal's progress, and suggest a
  new reward.

### Screen Saver
- **Idle-triggered overlay**: after a configurable idle timeout (any tap,
  key press, or scroll resets it), a full-screen video or camera-feed
  overlay takes over — any tap dismisses it. Shared across every Family
  Hub card on the same dashboard, so a dashboard with several of these
  cards only ever runs one screen saver, not one per card.
- **Per-login opt-in**: the source (video or camera) and idle time are
  shared household-wide, but whether the screen saver ever arms itself is
  chosen per Home Assistant login under Settings → Screen Saver — a wall
  tablet's login can have it on while a phone's stays off.
- **Disable while a recipe is open**: an optional toggle that pauses the
  idle countdown while a recipe's detail view is open, so it doesn't kick
  in mid-recipe.
- **A standalone companion card** (`family-hub-screensaver-card`) brings
  the same shared screen saver to a dashboard that doesn't otherwise have
  a Family Hub card on it, with an optional "return to this dashboard on
  wake" setting.

### Reminders & notifications
- **Standalone reminders**, stored as Home Assistant to-do items (not
  calendar events), with their own date/time, editable after creation from
  the event-info popup, and a **mark done** button.
- **"Roll over to next day if not completed"**: an optional per-reminder
  flag. If checked, the backend automatically pushes an incomplete
  reminder's due date forward by one day (same time) each day it's still
  not marked done — it keeps re-notifying daily until you mark it done.
  Without it, a reminder just fires once at its due time and then sits
  overdue on its original day until you clean it up yourself.
- **Calendar-event reminders**: any event can get a "remind me N minutes
  before" lead time (or several at once, e.g. 10 and 30 minutes before),
  added at creation or edited afterward from the event-info popup —
  editing one on a recurring-by-name event (e.g. weekly "Yoga") offers to
  apply the same change to every matching occurrence currently loaded.
- **Server-side delivery**: reminders and event notifications fire from the
  backend integration itself (polling every few minutes, configurable), so
  they arrive even if no dashboard is open, and are deduplicated so the
  same reminder never fires twice.
- **Per-target notify devices**: a default notify target, plus optional
  overrides per calendar, for Reminders as a whole, and for the Daily
  Digest — all manageable from in-card Settings via a shared "Notify
  devices" picker.
- **Daily Digest**: an optional once-a-day notification (Settings → Daily
  Digest: on/off toggle, send time, recipient picker) summarizing that
  day's calendar events, due reminders, and planned meals. Sent by the
  backend at the first poll at or after the configured time, once per
  calendar day, independent of the dashboard being open. With Grocy
  connected, it can also add an "N items expiring soon" and/or "N items
  running low" line — each opt-in independently under Settings → Grocy (see
  the Grocy integration section above) — and every section, Grocy or not,
  is simply omitted on a day it has nothing to report.

### Countdown
- **Countdown banner** showing the nearest upcoming event from any
  calendar(s) flagged for it (great for birthdays), plus any number of
  **custom countdown items** — add one from an event/reminder's "Use as
  countdown" button (which becomes "Remove from countdown" once added), or
  manage the whole list directly in Settings → Countdown (add, remove, see
  every saved item).
- **Cycling ticker**: with more than one countdown item and "Cycle through
  all upcoming countdown items" turned on, the banner rotates through all
  of them every few seconds instead of only showing the soonest one.

### Theming
- **Full theme editor** in Settings: every background/text/accent color and
  every font size is exposed as a color picker or numeric field, with a
  one-click "Reset to default."
- **Built-in preset themes**: a handful of ready-made color themes ship with
  the integration out of the box.
- **Theme Selector card**: a small, per-device gear-icon card for picking
  which saved theme this particular tablet/browser shows, independent of
  what other devices are showing.
- **Global theme mode**: the calendar card can optionally follow a saved
  theme directly instead of its own local theme settings. The "Use global
  theme" dropdown lists two groups — your own saved presets, and a
  **"Home Assistant"** group listing every native/installed HA theme
  (`themes.yaml`, HACS themes, etc.) plus a synthesized "Default (Home
  Assistant)" entry — so the dashboard can follow a theme you already have
  installed in Home Assistant without recreating it by hand.
- A full **Theme Builder sidebar panel** for building and saving your own
  custom named themes exists in the codebase but isn't part of this beta
  release yet — presets and the Theme Selector cover theming for now.

### Everything else
- **Collapsible accordion sections** in Settings (Calendars, Menu Blocks,
  Countdown, Daily Digest, Theme colors, Theme fonts) to keep the panel
  manageable.
- **Settings sync across devices**: all shared settings live in the
  integration's own backend storage (with an automatic on-disk backup), so
  every tablet/browser sees the same configuration — except the timeline
  toggle and theme-selector pick, which are deliberately per-device. An
  older `todo`-list-based settings entity is still read once, automatically,
  as a one-time fallback for households updating from a very old version —
  new installs never need one.
- **Optional vertical scroll lock**, handy for kiosk-mode wall tablets.
- Built-in **Debug Info** panel (Settings → Debug Info) showing fetched
  events, errors per calendar, and current settings.
- **Self-update from the integration itself**: Settings → Devices & Services
  → Family Hub → Configure → **Update Family Hub** lets you upload a new
  `family_hub_vN.zip` and installs it in place (auto-backed-up first) —
  no manual file copying, just a Home Assistant restart afterward.
- **Test a notification** and **Upcoming notifications preview** steps in
  Configure, for confirming a notify target works and previewing what's
  queued to fire before waiting around for it.

## Requirements

`family_hub` is installed as a real custom integration (`custom_components/
family_hub`), not a raw card file — it serves the Family Week Calendar
card, the Family Today companion card, the Chores/Rewards/Goals/My Chores
board cards, the Screen Saver companion card, and the Theme Selector card
(plus a Theme Builder sidebar panel that isn't a documented feature of
this beta yet — see [Theming](#theming) above), and best-effort
auto-registers all of them as dashboard resources.

The recipe box, meal plan, meal templates, meal suggestions, and
standalone reminders are stored as Home Assistant `todo` list entities (so
they sync across every device automatically, with no size limits the way
`input_text` helpers have), so you'll want several `todo` entities before
configuring the card. The easiest way is the built-in **Local To-do**
integration — Settings → Devices & Services → Add Integration → **Local
To-do** — create one list per row below and note the resulting entity IDs.
(Card Settings, and everything in the Chores/Rewards/Goals/Routines board,
need no `todo` entity at all — see the note above and
[Chores, Rewards, Goals & Routines](#chores-rewards-goals--routines).)

| Purpose | Example entity |
|---|---|
| Recipe box | `todo.recipe_box` |
| Meal plan | `todo.meal_plan` |
| Meal plan templates | `todo.meal_plan_templates` |
| Meal suggestions | `todo.meal_suggestions` |
| Standalone reminders | `todo.family_reminders` |

You'll also want at least one `calendar.*` entity (a local HA calendar, a
CalDAV/Google Calendar integration, etc.) to show events, and — for
reminders, event alerts, or the Daily Digest to actually notify anyone — at
least one working `notify.*` target (e.g. the Home Assistant Companion app).

## Installation

### Option A: HACS (recommended)

Family Hub isn't in the default HACS store yet, so add it as a custom
repository:

1. In Home Assistant, go to HACS → the ⋮ menu (top right) → **Custom
   repositories**, and add this repository's URL with category
   **Integration** — or use this one-click link (replace the owner/repo
   below if you forked it):
   [![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=JVarhol&repository=HA-Family-Hub&category=integration)
2. Find **Family Hub** in HACS and click **Download**.
3. Restart Home Assistant.
4. Settings → Devices & Services → **Add Integration** → search for
   **Family Hub** — or use this link:
   [![Open your Home Assistant instance and start setting up a new integration.](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=family_hub)
5. Continue from step 4 below.

### Option B: Manual copy

1. Copy the `custom_components/family_hub` folder into your own
   `/config/custom_components/` (overwrite an existing install to update
   it, or use the in-integration **Update Family Hub** zip-upload step
   described above instead of manual copying).
2. Restart Home Assistant.
3. Settings → Devices & Services → **Add Integration** → search for
   **Family Hub**. No configuration is required at this step — it just
   registers every card (Family Week Calendar, Family Today, Chores,
   Rewards, Goals, My Chores, Screen Saver) and the Theme Selector card (a
   Theme Builder sidebar item also appears; it's leftover from an
   in-progress feature not yet documented for this beta — safe to ignore
   for now).
4. Add the card(s) you want to a dashboard (see below). If a dashboard
   resource wasn't auto-registered for your Home Assistant version, add it
   manually under Settings → Dashboards → Resources.
5. Optional: Family Hub → **Configure** to turn on calendar reminders, pick
   notify devices, test a notification, or preview upcoming notifications.
   (Daily Digest on/off, send time, and recipients are configured from the
   card's own Settings, not this Configure menu.)

## Card configuration

### Family Week Calendar card

Add the card to a dashboard view via YAML (or the visual editor's "manual
card" option):

```yaml
type: custom:family-week-calendar-card
title: Family Calendar
people:
  - entity: calendar.jess
    name: Jess
    color: "#a9c6c2"
  - entity: calendar.family
    name: Family
    color: "#dba99c"
  - entity: calendar.birthdays
    name: Birthdays
    color: "#d9bf7e"
recipe_entity: todo.recipe_box
meal_plan_entity: todo.meal_plan
meal_templates_entity: todo.meal_plan_templates
suggestions_entity: todo.meal_suggestions
reminders_entity: todo.family_reminders
weather_entity: weather.forecast_home
birthdays_entity: calendar.birthdays
```

| Option | Required | Default | Description |
|---|---|---|---|
| `people` | yes | — | List of `{ entity, name, color }` calendars to show. Can also be fully managed later from in-card Settings → Calendars, including badges and notify devices. |
| `recipe_entity` | no | `todo.recipe_box` | `todo` entity backing the Loved Dishes recipe box. |
| `meal_plan_entity` | no | `todo.meal_plan` | `todo` entity backing the meal planner (including recurring weekly meals). |
| `meal_templates_entity` | no | `todo.meal_plan_templates` | `todo` entity backing whole-week meal templates. |
| `suggestions_entity` | no | `todo.meal_suggestions` | `todo` entity backing the Meal Suggestions box. |
| `reminders_entity` | no | `todo.family_reminders` | `todo` entity backing standalone reminders (Add Event modal's Reminder tab). |
| `settings_entity` | no | `todo.family_calendar_settings` | An **older** `todo` entity, only ever read once as a legacy migration fallback if the card's own backend-stored Settings come back empty — not needed on a fresh install, and no longer where Settings actually live day to day (see the note in [Requirements](#requirements)). |
| `weather_entity` | no | `weather.forecast_home` | Entity used for the daily high/low + icon in each day column. |
| `birthdays_entity` | no | `calendar.birthdays` | Used to auto-tag birthday events with a 🎂 icon in Month view. |
| `title` | no | `Family Calendar` | Card title (not currently rendered, reserved for future use). |

Everything else — which calendars show, their names/colors/badges/notify
devices, meal block names/count, font sizes, every theme color, the
timeline hour range, default view, countdown items and ticker, Daily
Digest, whether meals show in Month view, and scroll lock — is configured
from the ⚙️ **Settings** button on the card itself, and synced across every
device automatically by the integration's own backend storage (with the
exception of the timeline toggle and the per-device Theme Selector pick).

### Chores, Rewards, Goals & My Chores cards

None of these need a `people`/entity list or any `todo`/`calendar`
entities at all — everything runs over Family Hub's own backend, and
who's eligible is drawn from the members you've added under the calendar
card's own Settings → Users tab. The only config option any of them takes
is an optional `title`:

```yaml
type: custom:family-hub-chores-card
title: Chores
```

```yaml
type: custom:family-hub-rewards-card
title: Rewards
```

```yaml
type: custom:family-hub-goals-card
title: Goals
```

`family-hub-my-chores-card` is a smaller, single-person companion (handy
on a kid's own tablet/dashboard) showing just their own chores, goals, and
routines rather than the full multi-column board.

### Screen Saver companion card

Only needed on a dashboard that doesn't otherwise have any Family Hub card
on it (the Screen Saver itself is already shared automatically across any
Family Hub cards already on a dashboard — see
[Screen Saver](#screen-saver) above):

```yaml
type: custom:family-hub-screensaver-card
title: Screen Saver
```

`return_dashboard_path` (optional) jumps to a chosen dashboard/view when
the screen saver is dismissed, instead of staying wherever it fell asleep.

## Notes

- Card font defaults to "Arial Rounded MT Std" where available, falling
  back to the Google Font "Varela Round" (loaded automatically).
- Data (events, recipes, meal plan, meal templates, suggestions, weather,
  countdown, reminders) is polled every 60 seconds while the card is
  connected; the Chores/Rewards/Goals/My Chores/Routines board cards poll
  the same way. The backend poller (reminders, event alerts, chore due
  reminders, recurrence resets, Daily Digest) runs independently on its own
  schedule (default every 5 minutes).
- HA silently skips (rather than errors on) a service call targeting a
  `todo`/`calendar` entity that doesn't exist — the card checks entities
  exist up front and surfaces a visible error instead of failing silently.

## Changelog

Recent versions (backend `manifest.json` version in parentheses):

### 109.6

**Meal Planning**
- Meals now support leftovers for multi-day use. Select the days where
  leftovers can be used — days with leftovers show a recycle symbol, and
  clicking one opens the original day's meal card.
- **Move Meal to Another Week**: editing a meal's "more options" now
  includes a place to move it to another week entirely. Rearranging meals
  within the same week (via the Edit button in the top right of the
  calendar) was already supported.
- New "no meal cards" option in Settings for households that don't want
  the meal planner shown at all.
- Meal cards now support additional recipes — attach sides, desserts, and
  more alongside the main dish.
- Meal cards now show their description.
- Fixed a bug that prevented meals from being un-favorited.
- New **Edit Menu** permission — users without it can only add
  suggestions, not edit the menu directly.

**Chores**
- Chores can now require being completed multiple times (e.g. "Complete 3
  Loads of Laundry") — click once per completion until the chore is fully
  marked done.
- New per-user permission to skip approval on their own chores; chores
  also gained a "do not require approval" checkbox at creation time.
- Chores now move into a collapsible "Completed" accordion once finished.
- Chores expiring soon are now sorted to the top.
- New setting to toggle showing just the due date vs. the full due date
  and time.
- Chores and Routines now have a login button in the top right. Set a PIN
  in a user's settings, then use the login button to select that user and
  enter their PIN — their permissions (claiming rewards, editing chores,
  approving chores, etc.) apply for the rest of that session until you log
  out.

**Routines**
- Routine items can now earn stars, with an option at creation time to
  require approval or not.

**Goals**
- The Goals card is now **My Goals**, showing only the current user's own
  goals.
- Added a way to mark a goal fully complete and hide it.

**Rewards**
- Users can now gift stars to another user — click the gift box icon and
  enter how many stars to transfer.

**Calendar**
- Events can now include other people: choose a primary calendar to add
  the event to, then select who else is involved. The card shows striped
  colors indicating every member tagged on the event.
- New views: **Portrait** (a week view built for vertical monitors) and
  **Month + Day** (a new month view — click a day to see its events).
- New setting to grey out past events on the calendar, under the Calendar
  tab in Settings.
- Fixed an issue that caused Planner view to not show badges.
- Settings now lets you choose your default week and month views — this
  is device-specific.

**Themes**
- Added "Liquid Glass" themes.

**Other**
- Optimized the calendar card for smaller displays.

**New cards**
- **My Pantry** — see and edit your Grocy inventory: tracked items (in
  Grocy) and untracked items (not counted in Grocy), sortable by Expiring
  Soon, Expired, Name, Location, and more.
- **To-Do** — view multiple to-do and grocery shopping lists on one
  screen, drag and drop cards between lists, open a to-do in a modal, and
  more. Build a Kanban board, a multi-store shopping list, or whatever
  else the community comes up with.

## License

Copyright (C) 2026 Bordello Labs.

Licensed under the GNU General Public License v3.0 (GPL-3.0) — see
[LICENSE](LICENSE) for the full text. You're free to use, study, modify,
and redistribute this software, provided that any distributed copies
(including modified versions) remain under the same license and keep
their source available.
