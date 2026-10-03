---
title: Changelog
sidebar_position: 9
---

The live changelog, newest first. Entries older than v138 (1.103.0) live
in [the changelog archive](/docs/changelog-archive).

> **Note:** this file's entries currently run through v1.135.4. Everything
> from v1.136.0 through the current release hasn't been written up here
> yet — the version number in [manifest.json](https://github.com/JVarhol/HA-Family-Hub/blob/main/custom_components/family_hub/manifest.json)
> is ahead of this changelog.

## Changelog

### v1.135.4

- Fix: household report, verbatim, "Sometimes the UI shows the month
  view but says its week view" - every place that switches which view
  or date-range is showing (the Week/Month/Day dropdown, the prev/next
  nav arrows for week/month/day, clicking the week label to jump to
  "today", a week-shortcut jump, and clicking a day cell in Month/split
  Month to jump into that week) updated the nav label/dropdown text
  synchronously and right away, but relied entirely on the async
  `_fetchEvents()` network round-trip to eventually repaint the grid to
  match - leaving a real, visible window (as long as that round-trip
  took) where the label already named the new view while the grid still
  showed whatever had been painted for the old one. Each of those spots
  now also repaints the grid synchronously (with whatever events are
  already cached - a fresh repaint follows the instant new ones arrive),
  so the grid's type always matches the label the same instant the label
  changes. Added a regression test (test_view_switch_grid_sync.js) using
  a deliberately-never-resolving calendar fetch to check this truly
  synchronously, and confirmed it reproduces the exact reported mismatch
  against the old code before checking it's gone with the fix.

### v1.135.3

- Fix: household report, verbatim, "in 14 day view the second week
  shows no events" - `_fetchEvents()` always asked the calendar API for
  a fixed 7-day window no matter how many day columns were actually
  configured, so Two-Week Ahead (or any custom day count above 7)
  rendered its 8th-14th day columns with events that were simply never
  fetched in the first place; the day columns themselves were always
  built for the real day count, only the network fetch fell short. Now
  uses the same `_weekViewDayCount()` the rest of the Week view already
  relies on for its own window, so the fetched range always matches
  what's on screen (Planner keeps its own hardcoded 7-day window on
  purpose, unaffected). Also fixed the Debug Info panel's "Query
  window" line, which had the identical hardcoded-7 bug in its own
  display-only copy. Added a regression guard
  (test_week_day_count_and_rows.js) that checks the actual fetched
  date range for both a 7- and 14-day count, and confirmed it fails
  without the fix, not just that it passes with it.

### v1.135.2

- Fix: household report, verbatim, "seems our layout broke mobile
  again" - on an actual phone-width screen, the Week view's day columns
  collapsed down to unreadable slivers (just the date number, barely
  visible) with a large blank gap below, instead of stacking as full
  readable cards. Root cause: the v1.134.0 Week/Portrait merge added a
  desktop-only rule so each row's day columns share that row's height
  side-by-side (`.week-row .day-col { flex: 1 1 0; }`), but the phone
  breakpoint (&le;700px) that stacks every day into one scrolling column
  never overrode that flex value for the new column layout - "grow from
  a height of 0" inside a row that itself has no fixed height to give,
  so nothing grew. Confirmed by rendering the actual card in a real
  browser at phone width, both before and after; added a regression
  guard (test_week_mobile_view.js) that checks the phone media query for
  this override directly, since jsdom's DOM-structure tests can't catch
  a pure-CSS flex layout bug like this one.

### v1.135.1

- Fix: Screensaver widgets now stretch their card content to fill
  whatever size box you've dragged/resized on the Screensaver widgets
  canvas, instead of sitting at their own smaller intrinsic size inside
  a bigger box. Household ask, verbatim: "not fill screen, but fill the
  card that we can resize on the screen saver."
- New: a "Transparent background" checkbox in the widget form (both the
  guided fields and the raw JSON/Custom step, and when editing an
  existing widget) - strips the hosted card's own background/shadow so
  it blends into the screensaver instead of showing as a boxed card.
  Household ask, verbatim: "make this full size and no BG" (for a Clock
  widget).

### v1.135.0

- New: "Layout ideas" - a quick-pick row on Settings > General offering
  four named starting points for the Week view, so a household doesn't
  have to hand-tune the day-count/rows/variant fields to get a good
  look. Household ask, verbatim: "We should give users a couple jumping
  off points, ideas of layouts, the week view, the portrait view maybe 2
  more." The four: Week (the classic single-row 7-day grid), Portrait
  (the same week split into 2 rows for a tall or portrait-mounted
  screen), Agenda (the existing Planner variant reframed as a small-
  screen-friendly scrolling list), and Two-Week Ahead (14 days across 2
  rows, for planning further out). Tapping one just fills in the
  existing fields below it - nothing new to persist, and the raw fields
  still show/highlight whichever preset (if any) exactly matches them.
- New: adding a Screensaver widget now starts with a gallery of named
  kinds - Weather, Clock, Calendar, Sensor, Camera, Text, or Custom -
  instead of a blank JSON box. Household ask, verbatim: "In screen saver
  widgets, allow the user to select the widgets with a UI similar to
  what is used to build dashboards," the same pick-a-card-type-first
  flow Home Assistant's own Add Card uses. Picking a kind shows just the
  field or two it actually needs (an Entity picker suggested from your
  own Home Assistant entities, or free-form text for the Text kind);
  Custom drops straight into the original raw JSON field for any
  Lovelace card this gallery doesn't name. Editing an existing widget
  still goes straight to its JSON config, unchanged.

### v1.134.1

- New: the Devices tab now shows "Identify" next to each device, and each
  row's heading is a readable `<name>_<id>` label instead of a bare
  generated id. Household ask, verbatim: "on the device tab and naming is
  kind of difficult. At best it should be deviceName_browserID with an
  identify button that posts a modal to that device with its ID name."
  Clicking Identify pops a brief full-screen modal on that one device's
  own screen naming itself, so whoever's standing in front of a wall of
  tablets can match the physical screen to the row they clicked. The name
  half is a best-effort browser/OS guess (e.g. "Chrome-Windows",
  "Safari-iPad") each device reports about itself - purely cosmetic, never
  relied on for anything functional, and a device that hasn't reported
  one yet just shows as "Device_<id>" same as before.

### v1.134.0

- Change: Week and Portrait are now one view. As one household put it:
  "we have built enough functionality into the portrait mode that this
  should become the default mode... a week view is just the portrait mode
  with 7 days and one row." Week's layout now always uses the same
  row-splitting behavior Portrait introduced, with the plain 7-day/1-row
  look simply being that layout's default case rather than a separate
  code path. This is a pure internal merge with a migration guarantee: a
  household that was on plain Week (one row) keeps seeing exactly one row,
  and a household that had customized Portrait to two (or any number of)
  rows keeps seeing that same row count, automatically, with nothing to
  reconfigure.
- Change: Settings is simplified to match - the "Week button shows" picker
  drops the now-redundant "Portrait" choice (just Week/Planner remain),
  and the rows field is relabeled "Rows shown in Week view" and only shows
  up when Week is the selected variant.
- Change (internal/device settings): the per-device row-count setting is
  renamed `familyCalendarWeekRowsLocal` (was
  `familyCalendarPortraitRowsLocal`) in both the admin Devices tab and the
  card itself, defaulting to 1 row; existing devices are migrated
  automatically based on their prior variant and row count, not by
  reusing the old key directly, so a stray saved value can't leak an
  extra row onto a plain-Week device.
- Fix (incidental cleanup): Week's mobile-width layout no longer needs a
  day-count-specific CSS class, a JS-computed inline grid style, or a
  live re-render on screen-width changes - it now reflows with pure CSS
  at any day count or width, the same simpler mechanism Portrait always
  used.

### v1.133.11

- New: Day view - a third option alongside Week and Month, showing a
  single day as one column ("lane") per family member on a shared hourly
  scale, so a busy household can spot overlapping commitments (two people
  needing the car, a pickup that collides with a lesson) at a glance the
  way one merged list can hide. Reuses the same event-pill styling,
  past-event greying, and tap-to-open-details behavior as Week/Portrait.
  A synthetic "Family" lane shows the shared reminders list; individual
  reminders and events show only in their own person's lane, and an
  event tagged for multiple people shows in every one of their lanes.
- Change: the previously always-visible Week and Month buttons are now a
  single dropdown (tap the current view's name to switch), with Day added
  as a third choice alongside them.

### v1.133.10

- Fix: the Week/Portrait views' multi-week windows (e.g. showing 14 days
  for a 2-week view) now start on the current week's Sunday instead of
  centering today in the middle of the window - the week you're currently
  in is always the first week shown, not the second. Plain 7-day Week
  view and non-whole-week counts (3, 5, 10, ...) are unchanged.

### v1.133.9

- Fix: calendar event and reminder pills now pick readable text color
  automatically instead of always using dark text - a person whose color
  is black (or any other dark color) gets white text instead of
  unreadable black-on-black. Applies everywhere an event/reminder shows
  as a colored pill (week/day view, month view, the day-detail popup, the
  timeline, all-day chips, and the event detail modal) as well as on the
  Family Today companion card. Light colors keep the original dark text,
  same as before.

### v1.133.8

- New: Screensaver widgets - build out a "screensaver dashboard" on top of
  the existing Auto Screen Saver's video/camera feed. Add any Home
  Assistant Lovelace card (weather, a clock, sensors, a todo list, or any
  custom/HACS card) as a widget, and arrange the layout with a visual
  drag-to-move, drag-corner-to-resize editor from Settings > Screen Saver
  > Widgets > Edit Layout. The layout is shared by the whole household,
  like every other Settings field, but each device can also hide
  individual widgets locally without affecting anyone else's screen.
  Widgets render live on every place the screensaver can show - the main
  calendar card's built-in screensaver, the standalone Screen Saver
  companion card, and the shared screensaver used by the Chores, My
  Chores, and Rewards cards.

### v1.133.7

- Cleanup: removed the "household ask/report, verbatim - '...'" quote
  clauses and `vX.Y.Z+:` version-tag prefixes from comments throughout
  the integration's Python backend and card JavaScript (const.py,
  __init__.py, chores_websocket_api.py, reward_engine.py, timer_engine.py,
  and all eleven card files). No behavior changes - comments only, with
  the surrounding technical rationale kept and reworded to stand on its
  own. New code going forward won't carry this style either.

### v1.133.6

- New: household ask, verbatim - "Can we put a place to set that Todo
  under the manu blocks section. If none is set have the + button to auto
  create one." Settings → Menu Blocks now has a "Menu to-do list" field
  for the `todo` entity that backs the weekly menu (previously only
  settable by hand-editing the dashboard's own `meal_plan_entity` YAML
  config). Leave it blank and tap "+ Add list" to create a new Local
  To-do list automatically and fill it in - the same one-tap list
  creation the per-person Reminders/Wish List fields already use. Once
  set here, it applies household-wide and overrides the card's own YAML
  config, without needing to touch the dashboard at all.

### v1.133.5

- New: household ask, verbatim - "Need to make the daily digest a Card/
  modal. ... Add a setting that is per device that allows you to add the
  modal button to the calendar screen or allows someone to add a digest
  button to a dashboard by calling an entity. Digest should be user
  specific." The Daily Digest (see Reminders & notifications above) is now
  also available as a popup you can open any time, not just as a once-a-day
  notification. Two entry points: a this-device-only "Daily Digest button
  on calendar screen" setting that adds a "Daily Digest" item to the card's
  More menu, and a new `button.<name>_daily_digest` entity created
  automatically for every real Home Assistant user account - drop it on any
  dashboard, script, or automation, and pressing it pops the digest modal
  open live on wherever that same person's dashboard is currently open.
  Whoever's looking at it always sees their OWN events, reminders, meals,
  and chores - never anyone else's.

### v1.133.4

- Fix: household report, verbatim - "Changing number of days on mobile
  seems to break the clean mobile view." Week view's new 2-14 day-count
  setting (v1.133.3) was rendering with an inline `grid-template-columns`
  style and an unconditional `.day-count-N` CSS class, both of which
  outrank the phone-width single-column "clean mobile view" layout rule
  on plain CSS precedence - so anything other than 7 days re-broke mobile
  back into a cramped single row. Week now skips both at phone width,
  leaving the mobile layout untouched exactly like the classic 7-day case
  always did, and also re-lays itself out live if the breakpoint is
  crossed while Week is already open (rotating a phone, resizing a
  window), matching the live-relayout Planner view already had.

### v1.133.3

- New: household report, verbatim - "Current Day always first option In
  all views for week, the current day is always the first day. This can
  be enabled in the settings." Added a this-device-only Settings toggle
  (Week view, Portrait, and any other day-count window) that, when on,
  always starts the visible window on today instead of Sunday-aligning
  (7 days) or centering today (3/5/etc. days) - still advances by whole
  windows via the existing forward/back navigation.
- Change: household follow-up, verbatim - "Turn days to show into an
  input box so users can set any number of days from 2 to 14." Replaced
  the fixed 3/5/7-day button group with a number input accepting any
  whole number from 2 to 14, still this-device-only.
- New: household follow-up, verbatim - "Portrait mode, default 2 rows,
  but have a place to set how many rows you want. Ex if someone is
  showing 12 days they can do 3 rows of 4 or 4 rows of 3." Portrait mode
  now shares the same day-count setting as Week view (previously fixed
  at 7) and adds its own this-device-only rows setting (default 2),
  splitting the chosen day count evenly across that many rows - matching
  the original 7-day/2-row "4 then 3" layout as the default case.
- New: household follow-up, verbatim - "We have a lot of per device
  settings, need a way an admin can see all the devices with settings,
  change them, save settings as a preset and apply those to other
  devices." Added a new admin-only Devices tab in Settings: every
  dashboard now reports its own this-device-only display settings (day
  count, Current day first, Portrait rows, Week/Month button variant,
  Timeline view, Small screen mode) to the backend, an admin can view and
  edit any reported device's values and push a change to it directly (an
  open dashboard updates instantly; a closed one picks it up the next
  time it's opened), and any device's current values can be saved as a
  named preset and applied to other devices later.

### v1.133.2

- Fix: household report, verbatim - "In user permissions the calendar and
  routine permissions cannot be checked." The Delete calendar events,
  Manage own routine items, and Manage everyone's routine items
  permissions had been added to the backend's recognized permission list
  but never added to the `family_hub/permissions/set` websocket command's
  own schema, so Home Assistant rejected any save that included one of
  them before it ever reached the handler - the checkbox would check,
  then immediately revert. Added a regression test that checks every
  recognized permission against that schema directly, so a future
  permission added the same way (defined but never added to the schema)
  fails the test suite instead of shipping silently broken.

### v1.133.1

- Fix: the Kiosk PIN login and Permissions accordions in a person's profile
  modal (Settings → Users) had no gap between them, or from the Daily
  Digest section above them - both were missing the `.field` wrapper every
  other accordion in that modal uses for spacing, so they rendered
  touching instead of matching the rest of the page.

### v1.133.0

This update goes over and unifies a lot of the UI with the calendar card —
most cards were touched in this UI update. Some more tweaks to function and
some much-needed added features, like clicking a day and then adding a
calendar event or reminder, which now defaults to that day.

**Reminders**
- Roll over to next day now allows you to select what days are applicable.

**Chores**
- Chores can now be marked as important.
- Chores can now be assigned to multiple people — you mark them done
  separately for each person.
- Added a common Routine library to make routine creation faster and
  easier.
- Confetti pop when a chore is completed.
- Routines can now be completed by a sensor changing.

**Calendar**
- Cleaned up Month view UI to make sure all-day events show at the top.
- Incorporated grayed-out passed events in Month view.
- Selecting a day in Week or Month view, then clicking Add calendar event
  or Add reminder, now defaults to the selected day.
- Calendar events can now be deleted (some calendar integrations, like
  Google Calendar, do not support this and will throw an error).
- Reminders and calendar events can now have lists attached — choose a
  pre-existing list, or create one that only exists on that calendar event
  or reminder.

**Family Today**
- Added a new compact view, and the option to have an Add reminder / Add
  calendar event button on the daily Today card.

**Meals**
- Now suggests meals from your saved past dishes based on what you're
  typing, recommending up to 3.

**Todo Lists**
- No changes this release.

**Other**
- Started working on multi-language support.
- New setting for where to return on screen saver wake.

**Themes**
- Cleaned up the Settings menu considerably — non-admins now get a much
  more restricted Settings modal. Users can be marked as child accounts
  for further-restricted Settings.

**New cards**
- None this release. 😀
