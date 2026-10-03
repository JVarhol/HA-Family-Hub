---
title: Settings Modal
sidebar_position: 5
---

Every Family Hub card has a gear-icon **Settings** button that opens a modal with three tabs: **General**, **Users**, and **Devices** (Devices is admin-only). This page walks through what's in each one. Most fields save together when you tap the Save button at the bottom of the modal; a few, called out below, save immediately or are stored per-device instead.

## General tab

### This device

Shows which physical device/browser you're currently on (handy once you have several tablets), with an **Identify** button that flashes something on-screen so you can match a name to a physical screen.

### Weather entity

The weather entity each day column's forecast is pulled from. Leave it blank to fall back to the dashboard's own configured weather entity, or Home Assistant's default `weather.forecast_home`.

### Calendars

Add and manage the `calendar.*` entities that feed the board; no YAML editing needed after initial setup. Each calendar can define a keyword to watch for in event titles, producing a small colored badge (e.g. "N") next to the date, and a separate keyword for events that should be hidden from the grid entirely (handy for a background custody-schedule calendar). Who gets notified about a calendar's events is set per-person under the **Users** tab, not here.

### Default view

Which view (Week or Month) the card opens to.

### Layout ideas (this device only)

Four one-tap presets (**Week**, **Portrait**, **Agenda**, **Two-Week Ahead**) that fill in the Week/Month view fields below with sensible starting values for that kind of screen. Tap one, then Save. It doesn't apply anything until you save.

### Week view options (this device only)

- **Week button shows**: which variant the Week button displays (Planner and other layout options).
- **Days shown in Week view**: 1–36 columns, for narrower screens that can't fit all 7 days.
- **Rows shown at once in Week view**: 1–7, for the Two-Week-style layouts.
- **Current day always first**: keeps today in the leftmost column instead of a fixed Sunday/Monday start.

### Month view options

- **Month button shows**: Month alone, or Month + Day (a split view).
- **Show hours of the day (timeline)**: adds an hour-by-hour timeline to the day view, with a configurable **Timeline range**.

### Dim past events

Today's events dim one by one as they end; any earlier day dims entirely, since the whole day is already over.

### Calendar top bar style (this device only)

**Normal** or **Minimal**. Minimal hides the top bar (Settings/Week/Month/Edit Meals/Suggestions/Recipe Box/More) to save space on a small device. Settings moves into the **+** button's menu instead, alongside Calendar Entry/Reminder/Meal Suggestion/Recipe. This is saved to this device/browser only, like the other "this device only" fields above, unless the card's own **Static layout** config option (set from its Edit Card screen) is turned on, in which case it becomes shared household-wide instead.

### Lock vertical scrolling

Unlocked/Locked, for a kiosk display you don't want someone accidentally scrolling.

### Bottom padding

Reserves extra space (px) at the bottom of the card, e.g. for a dock, taskbar, or on-screen keyboard.

### Menu Blocks

- **Menu to-do list**: the to-do list the weekly menu is stored on. Leave blank and tap "+ Add list" to create one automatically.
- **Menu blocks per day**: how many meal slots each day gets.
- **Breakfast on weekends**: whether weekend days get a breakfast block too.
- **Block size**: Small/Medium/Large.
- **Show meal plan in month view**: whether planned meals also show in the Month grid.
- **Block 1/2/3 name**: rename the meal slots (defaults are usually Breakfast/Lunch/Dinner).

### Chores, Rewards & Routines

- **Routines**: one household-wide switch: once on, everyone gets Morning/Afternoon/Night checklist accordions on their own column of the Chores board.
- **Show Goals on**: None, Chores page, Rewards page, or Both: where each person's goals appear. Chores page adds goals to each person's own column with Log Progress/Approve/Send Back actions right there; Rewards page adds a Goals section alongside the star catalog.
- **Confetti when a chore is completed**: a quick on-screen confetti animation whenever someone marks a chore done.
- **Danger Zone (admin only)**: **Clear all chores** / **Clear all goals**: permanently deletes everything regardless of status, with no undo. Only visible to real Home Assistant admin accounts.

### Countdown

- **Countdown banner**: turns the banner on/off.
- **Custom countdown items**: add your own named countdown targets (e.g. "Disney Trip") alongside any events/reminders marked "Use as countdown."
- **Cycle through all upcoming countdown items**: only matters once there's more than one item to cycle through.

### Daily Digest

Sends one notification each morning summarizing today's events, meals, and due reminders, independent of anyone having the dashboard open. This section just turns the feature on and sets the household's send time (**Send daily digest**, **Send at**). Who actually gets a digest, and what's in theirs, is set per-person under the **Users** tab.

### Grocy

Connect Grocy itself under Home Assistant's own **Settings → Devices & Services → Family Hub → Configure → Grocy**; the toggles here only control which optional Grocy-powered features show up on the card once it's connected (everything is off by default):

- **Track expiring items**: adds an "Expiring Soon" list under the More menu.
- **Track low stock**: adds a "Low Stock" list under the More menu, with a one-tap button to add everything below its minimum stock to the shopping list.

Whether either list is also offered in someone's Daily Digest is set under the **Users** tab once the toggle is on.

### Screen Saver

Shows a full-screen video or live camera feed after the dashboard sits idle, built for a wall-mounted display. The source and idle time are shared household-wide; which logins actually see it is controlled per Home Assistant user further down (**Users** tab), so one tablet's login can have it on while a phone's stays off.

- **Source**: Video or Camera.
- **Video URL**: a direct link to a video file, or a path under Home Assistant's own `/local/` media folder. Loops muted.
- **Camera entity**: for the Camera source.
- **Idle time before it shows**: in seconds; any tap dismisses it and restarts the countdown.
- **Enable for these logins**: which Home Assistant accounts actually see the screensaver.
- **Disable while a recipe is open**: pauses the idle countdown while a single recipe's detail view is open (browsing the recipe list itself still counts as idle).
- **Return to this dashboard on wake**: optional: jump to a specific dashboard/view when the screensaver is tapped awake, instead of staying on whatever view it fell asleep on.
- **Widgets on the screensaver**: layer weather, a clock, a to-do list, or any other Lovelace card on top of the screensaver (shared layout, with a per-device **Hide widgets on this device** option below it).

### Theme

- **Use global theme (Theme Builder)**: on by default; turn off to set **This device's theme** independently; every other Family Hub card on that device (Chores, Rewards, Goals, My Pantry, My Chores) picks it up too, with no other device affected. Takes effect immediately, no Save needed.
- **Theme colors**: Background, Card background, Border, Text, Secondary text, Accent, Text on accent, Accent 2, Accent 3, Surface (alt), Surface 2.
- **Theme font sizes (px)**: Day name, Day number, Weather temp, Event text, Chip text, Header title, Countdown text, Block heading, Block meal text.
- **Reset theme to default**: discards all color/font overrides above.

### Privacy Mode

A household-wide "hide the calendar and reminders" switch for the calendar card, turned on from the card's own "more" menu (no setting here to turn it on). This section just controls who can turn it back **off**:

- **Turn off Privacy mode** (Permissions, under the Users tab, per-person) is the permission that lets someone other than a real admin unlock it via the on-screen PIN prompt.

See [Privacy Mode](/docs/features/privacy-mode) for the full picture: what gets hidden, the per-device **Participates in Privacy Mode** opt-out (Devices tab), and the automation-facing switch entities.

### Holiday Backgrounds

Show a photo on a holiday or special day, normally just behind that day's own column, or check **Expand to full screen** (per-entry) to take over the whole card for that day, week, or month. If two enabled holidays would both want the screen on the same day, the more specific one wins (a day beats a week, a week beats a month); if it's still a tie, whichever date is closest to today wins. Turn on any of the built-in holidays, or use **+ Add custom date** for your own. See [Holiday Backgrounds](/docs/features/holiday-backgrounds) for the full picture: recurring vs. one-time custom dates, the full tiebreaker rules, and automatic text-contrast.

## Users tab

### Notification tap destination (admin only)

Optional. When set, tapping a reminder, event, or Daily Digest push notification opens this Home Assistant dashboard/view instead of just launching the app (use a relative path like `/lovelace-family/0`). Applies to every notification this backend sends, and needs the Home Assistant Companion app.

### Add a person (admin only)

Add a Home Assistant login to make them part of Family Hub. Only people added here show up on the member list, on each admin's per-person Permissions accordion, and on the Chores board. Adding them also auto-creates two personal to-do lists for them right away, with no extra step: their own **Reminders** list and their own **Wish List** (see **Their reminders list** / **Their wish list** below, and [To-Do Lists & Wish Lists](/docs/features/todo-lists-and-wishlists) for what the wish list auto-flag means). This is deliberately not optional, by household request.

### Member profiles

Tap a person in the list to open their profile, or **Remove** to take them out of Family Hub (nothing about them is deleted; re-adding brings everything right back). Each profile covers:

- **Chores & Rewards color**: their color on the Chores board and Rewards balances. Leave unset for an automatically assigned color.
- **Include in Chores & Rewards**: turn off to keep them a full member (still on the list, Permissions, and Routines) without a Chores board column or Rewards balance. Useful for a shared/kiosk login that needs permissions but isn't an actual person.
- **Child account** (admin only): restricts their own Settings view even further than an ordinary non-admin's: they also lose the whole Users tab, including their own profile. A child can never turn this off for themselves.
- **Kiosk account** (admin only): for a shared wall-mounted tablet login rather than a real person. Restricts Settings the same way Child account does, and also turns on **Always-on alarm kiosk** and that account's own Kiosk PIN login as a starting point (either can be switched back off afterward). New devices logged in as a kiosk account default to participating in Privacy Mode. A Kiosk account can never see wish-list claim status while logged in directly as itself; this is hard-blocked even for a kiosk login that's also a Home Assistant admin account, since every other permission has an admin bypass but this one deliberately doesn't. Once someone PIN-logs-in as themselves via that account's own Kiosk PIN login, they see claims according to their own permission grant instead.
- **Their reminders list** / **Their wish list**: the personal to-do lists auto-created for them when they're added (see **Add a person** above), shown here so you can point either at a to-do list you already have instead, the same "+ Add list" pattern used elsewhere in Settings. Changing **Their wish list** re-flags whichever list is pointed at as this person's owned Wish List automatically; it doesn't need a separate visit to the To-Do Lists card's own List(s) tab.
- **Always-on alarm kiosk** (admin only): a "kiosks"- or "everyone"-tier chore/reward alarm (set per chore/reward via its own "Who hears this alarm" option) rings on every open Family Hub dashboard logged in as this account, not just the timer owner's.
- **Notify targets**: which devices/services actually receive this person's notifications.
- **Calendars**: tap a calendar card to subscribe them to reminders from it; tap the star to make it their primary calendar (their events then follow their own profile color everywhere, instead of the calendar's configured color).
- **Their own calendar**: set directly here if it wasn't already added under the General tab's Calendars section. It shows up as its own column labeled with their name/color. If it's also added there, this profile's color/badges win.
- **Permissions** (admin only): an accordion of granular permission checkboxes for that person: things like approving chores, overriding rewards, pricing a suggested reward, or seeing wish-list claims. Each checkbox saves immediately on change, no Save button needed. This used to be one big combined grid under its own tab; it's now folded into each person's own profile instead. The underlying backend commands are themselves hard-gated to real Home Assistant admin accounts, so hiding this from a non-admin here is UX, not the actual security boundary.

### Alarm Devices (admin only)

Speakers and Assist satellites a widened ("Them + kiosks" or "Everyone") chore/reward timer alarm rings on, picked from Home Assistant's own entity list. Set per chore/reward from its own "Who hears this alarm" option. Also sets the **text-to-speech voice** used for speaker alarms (not needed for Assist satellites).

## Devices tab (admin only)

Every dashboard reports its own display settings (Week day count, Current day first, Rows shown in Week view, etc., the "this device only" fields from the General tab) here once it's been opened at least once.

- Change a device's values and tap **Push** to update it right away. An open dashboard updates instantly, a closed one picks it up next time it's opened.
- **Identify all**: flashes an identifier on every reporting device at once, to help match entries in the list to physical screens.
- **Presets**: save any device's current values as a named preset, then apply that preset to any other device.
