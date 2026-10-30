---
title: Settings
description: Everything behind the ⚙️ Settings button on the Family Week Calendar card.
---

Household settings live behind the **⚙️ Settings** button on the **Family Week Calendar** card, and only there. (With the top bar hidden or minimal, Settings moves into the card's **+** button menu.) Settings has four tabs: **General**, **Users**, and for admins **Devices** and **Developer tools**.

Most fields save together when you tap **Save**, which stays pinned to the bottom while you scroll. A few, called out below, save the moment you change them, and fields marked **this device only** are saved on that one screen.

Children and kiosk accounts see a reduced Settings: no Users tab and none of the admin sections. Things you can't change are hidden rather than greyed out.

A few things are set up in Home Assistant's own integration screen instead (calendar reminders, Grocy, backups, updates). See [Integration Options](/docs/integration-options).

## General tab

### This device

Shows which physical device/browser you're currently on (handy once you have several tablets), with an **Identify** button that flashes something on-screen so you can match a name to a physical screen.

### Weather entity

The weather entity each day column's forecast is pulled from. Leave it blank to fall back to the dashboard's own configured weather entity, or Home Assistant's default `weather.forecast_home`.

### Calendars

The one place to add calendars and say whose calendar is whose; no YAML editing needed.

![Settings → Calendars, grouped into shared calendars and calendars linked to a person](/img/screenshots/settings-calendars.webp)

- **+ Add calendar**: pick one of your Home Assistant calendars **by name** from the list. The **Name** fills in automatically (a name you've typed yourself is never overwritten). A new calendar takes its own color from Home Assistant (for a Google calendar, its Google color); one without a color gets a color nobody else is using.
- **Person menu**: choose who the calendar belongs to, or **Not linked** for a shared calendar like Family or School. A person's first calendar becomes their column (★); any more of theirs are shown inside that same column. Calendars are grouped under **Not linked to a user** and **Linked to a user**.
- **Color**: tap it for **Choose a color…** or **Reset to calendar color** (back to its Home Assistant/Google color).
- **A row of buttons** under each calendar (v1.168.88+):
  - **⏳ Countdown**: add this calendar's events to the countdown banner.
  - **🎉 Holidays**: treat it as a holiday calendar, so its days show as banners under the meals instead of as events in a column. Calendars with "holiday" in the name are switched on automatically. See [Holiday calendars](/docs/features/calendar-and-layout#holiday-calendars).
  - **➕ Add badge**: a keyword to watch for in event titles, which puts a small colored badge (like "N") next to the date, plus an optional keyword for events to hide from the grid entirely (handy for a background custody-schedule calendar).
  - **✕ Remove**: removes the calendar and unlinks it from its person, so it doesn't come back as their column.

Who gets *reminders* from a calendar is set per person under the **Users** tab (**Get reminders from**), not here.

### Prevent duplicate events

Off by default. When it's on and the same event shows up on more than one of your calendars - the same invite on both parents' calendars, or events with exactly the same name at the same time - it only appears once, in the first column that has it. Repeating events are never treated as duplicates of themselves. Turning it on shows a short reminder: if two people really have separate events with the same name at the same time, name them apart ("Sam Soccer" and "Taylor Soccer" instead of "Soccer") so both show.

### Categories

At the bottom of the Calendars section. Admins only. Add categories with a name and a color; events and reminders given one show a bar in its color. Removing a category takes the bar off everything that had it. See [Calendar](/docs/features/calendar-and-layout#adding-and-editing-events).

### Default view

Which view (Week or Month) the card opens to.

### Layout ideas (this device only)

Five one-tap presets (**Week**, **Portrait**, **Agenda**, **Two-Week Ahead**, **Week + Next Week**) that fill in the Week/Month view fields below with sensible starting values for that kind of screen. Tap one, then Save. It doesn't apply anything until you save.

**Week + Next Week** shows this week's 7 days in a 4 over 4 grid and uses the 8th cell as a summary of the following 7 days: one chip per event, styled like the day columns' own chips but showing the event's day instead of its time, **+N more** after 4 chips and **Nothing scheduled** when next week is empty. It follows the same filters as the day columns (selected people, Prevent duplicate events, Privacy and Discreet mode), and tapping the tile jumps to next week. It is the Portrait layout (7 days, 2 rows) plus the **Next-week summary tile** switch below, which is only used with 7 days in the Week view.

### Week view options (this device only)

- **Week button shows**: **Week**, **Planner** (a row per day, a column per person) or **Agenda** (a plain list). See [Calendar & Layout](/docs/features/calendar-and-layout#views).
- **Agenda view: show meals**: Agenda follows the Days shown setting below and always includes reminders; turn this on to list meals too.
- **Days shown in Week view**: 1–36 columns, for narrower screens that can't fit all 7 days.
- **Rows shown at once in Week view**: 1–7, for the Two-Week-style layouts.
- **Next-week summary tile**: Off by default. On (with 7 days shown in the Week view) adds the next-week summary as an 8th cell and lays the grid out 4 over 4. The **Week + Next Week** layout idea sets this for you.
- **Current day always first**: keeps today in the leftmost column instead of a fixed Sunday/Monday start (synced household-wide by default, with optional per-device override via the Devices tab).
- **Navigation step** (when Current day always first is On): choose whether Previous/Next advances by **1 day** at a time (rolling 7-day window) or by a **Full window** (7 days).

### Month view options

- **Month button shows**: Month alone, or Month + Day (a split view).
- **Show hours of the day (timeline)**: adds an hour-by-hour timeline to the day view, with a configurable **Timeline range**.

### Dim past events

Today's events dim one by one as they end; any earlier day dims entirely, since the whole day is already over.

### Name pills (this device only)

Show or hide the row of names with counts above the calendar (and the Reminders pill). Hiding it gives the calendar more room, and the calendar then shows everyone. (v1.168.88+)

### Calendar top bar style (this device only)

**Normal**, **Minimal**, **Hidden**, or **Right Now**.

- **Minimal** hides the top bar (Settings/Week/Month/Edit Meals/Suggestions/Recipe Box/More) to save space on a small device. Settings moves into the **+** button's menu instead, alongside Calendar Entry/Reminder/Meal Suggestion/Recipe.
- **Hidden** hides the bar completely; Settings still moves into the **+** button's menu so you can always get back.
- **Right Now** shows a live clock/weather/who's-home strip. Pick its **placement** (Top, Left or Right; always a top strip on a phone), its **size** for Top (Small, Medium or Large), whether it shows the **clock & date** and **weather**, and **who's shown** on it. See [The Right Now bar](/docs/features/calendar-and-layout#the-right-now-bar).

 This is saved to this device/browser only, like the other "this device only" fields above, unless the card's own **Static layout** config option (set from its Edit Card screen) is turned on, in which case it becomes shared household-wide instead.

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
- **Disable while a recipe is open**: pauses the idle countdown while a single recipe's detail view is open (browsing the recipe list itself still counts as idle).
- **Return to this dashboard on wake**: optional: jump to a specific dashboard/view when the screensaver is tapped awake, instead of staying on whatever view it fell asleep on.
- **Widgets on the screensaver**: cards layered on top of the video or camera. **Add widget** offers **Weather**, **Clock**, **Calendar** (a month grid for one calendar), **Sensor** (one entity's state), **Camera** (a live snapshot), **Text** (your own text or Markdown) and **Custom** (any Lovelace card, as JSON or YAML). Drag a widget to move it and drag its corner to resize it. A Clock can be **Digits only** with **Automatic color** (light digits on a dark picture, dark on a light one), and any widget can have a **Transparent background**. The layout is shared by the household; **Hide widgets on this device** hides chosen widgets on just this screen.
- **Screen Saver logins**: tick every Home Assistant login that should get the screen saver. Everyone else keeps browsing without it. Each screen can also be switched off from the Devices tab (or its **Screensaver enabled** switch entity).

### Theme

- **Use global theme (Theme Builder)**: on by default: pick any of the 10 built-in themes, your own from the [Theme Builder](/docs/features/theming-and-more), or an installed Home Assistant theme. Turn it off to set **This device's theme** independently; every other Family Hub card on that device (Chores, Rewards, Goals, My Pantry) picks it up too, with no other device affected. Takes effect immediately, no Save needed.
- **Theme colors**: Background, Card background, Border, Text, Secondary text, Accent, Text on accent, Accent 2, Accent 3, Surface (alt), Surface 2.
- **Theme font sizes (px)**: Day name, Day number, Weather temp, Event text, Chip text, Header title, Countdown text, Block heading, Block meal text.
- **Reset theme to default**: discards all color/font overrides above.

### Privacy Mode

A household-wide "hide the calendar and reminders" switch for the calendar card, turned on from the card's own "more" menu (no setting here to turn it on). This section just controls who can turn it back **off**:

- **Turn off Privacy mode** (Permissions, under the Users tab, per-person) is the permission that lets someone other than a real admin unlock it via the on-screen PIN prompt.

See [Privacy Mode](/docs/features/privacy-mode) for the full picture: what gets hidden, the per-device **Participates in Privacy Mode** opt-out (Devices tab), and the automation-facing switch entities.

### Holiday Backgrounds

Show a photo on a holiday or special day, normally just behind that day's own column, or check **Expand to full screen** (per-entry) to take over the whole card for that day, week, or month. If two enabled holidays would both want the screen on the same day, the more specific one wins (a day beats a week, a week beats a month); if it's still a tie, whichever date is closest to today wins. Turn on any of the built-in holidays, or use **+ Add custom date** for your own. See [Holiday Backgrounds](/docs/features/holiday-backgrounds) for the full picture: recurring vs. one-time custom dates, the full tiebreaker rules, and automatic text-contrast.

### More menu (admin only)

Choose what the **⋮ More** menu shows, and add your own buttons to it. This is set once for the whole household, so every tablet and phone gets the same menu. Changes are saved when you tap **Save**.

- **Show or hide** any built-in item (Quick Add, Recipe Box, Templates, Print, Shopping List, Expiring Soon, Low Stock, Daily Digest, Privacy Mode) with its checkbox.
- **Reorder** with the ▲ ▼ arrows. Your own buttons can go anywhere in the list.
- **+ Add a button** creates your own button (up to 20). Start from **Blank** or a ready-made one - **Babysitter / house info**, **Emergency contacts**, **Address book** or **Guest Wi-Fi** - and fill in the blanks. Each one opens a pop-up with:
  - an **icon** (any emoji, or a Home Assistant icon like `mdi:camera`) and a **button label**;
  - a **heading** and some **text** (line breaks are kept);
  - a **QR code**: pick what it should do and fill in a few boxes. Family Hub writes the QR format for you, with a live preview:
    - **Link / website**, for example the photo album your screen saver shows;
    - **Wi-Fi network**: network name, password, security, hidden or not. Guests scan and tap to join, and the pop-up can also show the network name and password;
    - **Wi-Fi from UniFi**: if you use the UniFi Network integration, pick one of your Wi-Fi networks and the pop-up shows UniFi's own QR code for it, live from Home Assistant, so it stays right when the password changes (including rotating guest passwords). When UniFi is installed, the plain Wi-Fi option shows a line suggesting this instead. UniFi's QR codes are turned off in Home Assistant by default; the line then offers **Turn on UniFi QR codes**, and about 30 seconds later it switches over by itself (turning them on needs a Home Assistant admin);
    - **Contact card**: name, phone, email. Scanning offers to save the contact;
    - **Phone number** (scanning offers to call it), **Text message** (number and a pre-written message), **Email** (address, subject, message), or **Plain text**;
  - up to **2 photos**, uploaded into Home Assistant;
  - an optional **link button** (http/https only), handy for phones;
  - **Lock it** (optional): pick who can open it. Someone on the list opens it straight away on their own phone or login; on a shared or kiosk screen it asks who's opening it and their PIN (set in Settings → Users). A locked pop-up's content stays in Home Assistant until someone unlocks it, and it's cleared from the screen when closed. Good for addresses, emergency contacts or anything private. Leave the babysitter sheet unlocked - the sitter won't have a PIN.

PINs lock for 5 minutes after 5 wrong tries in a row (also for kiosk login and Privacy Mode); setting a new PIN for that person unlocks it right away.

A good first one: a QR code that opens the shared photo album your screen saver shows, so guests can add their pictures.

![Settings → More menu: show/hide and reorder the built-in items, plus your own buttons](/img/screenshots/more-menu-settings.webp)

![Editing a custom button: heading, text, a QR code with live preview, photos and a link button](/img/screenshots/more-menu-edit.webp)

![The pop-up it opens](/img/screenshots/more-menu-popup.webp)

![With UniFi installed, the Wi-Fi option suggests UniFi's own QR code and offers to turn it on](/img/screenshots/more-menu-unifi.webp)

The More menu lives in the calendar's top bar, so with **Calendar top bar style** set to Minimal or Hidden it isn't shown.

## Users tab

### Notification tap destination (admin only)

Optional. When set, tapping a reminder, event, or Daily Digest push notification opens this Home Assistant dashboard/view instead of just launching the app (use a relative path like `/lovelace-family/0`). Applies to every notification this backend sends, and needs the Home Assistant Companion app.

### Add a person (admin only)

Add a Home Assistant login to make them part of Family Hub. Only people added here show up on the member list, on each admin's per-person Permissions accordion, and on the Chores board. Adding them also auto-creates two personal to-do lists for them right away, with no extra step: their own **Reminders** list and their own **Wish List** (see **Their reminders list** / **Their wish list** below, and [To-Do Lists & Wish Lists](/docs/features/todo-lists-and-wishlists) for what the wish list auto-flag means). This is deliberately not optional, by household request.

### Member profiles

![The Users tab](/img/screenshots/settings-users.webp)

Tap a person to open their profile, or **Remove** to take them out of Family Hub (nothing about them is deleted, and re-adding them brings everything back). Most of a profile saves with **Done**; Permissions save the moment you tick them.

**At the top**

- **Color**: their color on the calendar, the Chores board and Rewards. Leave it unset for an automatic color. Someone with no color who gets a calendar takes that calendar's color, and **Reset to calendar color** brings it back later.
- **Display Name**: the name Family Hub shows for them, instead of their Home Assistant name.
- **Account options** (admin only, pick any):
  - **Chores**: on by default. Turn it off to keep them a full member (on the list, in Permissions and Routines) without a Chores column, a Rewards balance, or being offered as an assignee.
  - **Child**: they can't see the Users tab at all, including their own profile, and can never turn this off themselves.
  - **Kiosk**: for a shared wall-tablet login, not a person. A kiosk account is never on Chores, Rewards or Goals, never gets reminders, and doesn't get its own Reminders or Wish List (v1.168.88+); those options are hidden. It restricts Settings like Child does, and switches on **Always-on alarm kiosk** and its own Kiosk PIN login as a starting point. New screens signed in as a kiosk account join Privacy Mode by default. A kiosk login can never see wish-list claims, even if it's a Home Assistant admin; someone who PIN-logs-in on it sees claims by their own permission.
- **Always-on alarm kiosk** (admin only): chore, reward and timer alarms set to "Them + kiosks" or "Everyone" ring on every open Family Hub screen signed in as this account, not just the owner's.

**Presence & sensors**

- **Presence**: a `person.*` or `device_tracker.*` entity for the Home/Away pill on the Right Now card and bar.
- **Other sensors & switches to show**: any entities, shown as small pills on their Right Now tile (a phone's battery, a door). Tapping a switch or light toggles it; anything else opens its details.

**🔔 Notify targets**: which phones or services get this person's notifications. **Auto-detect this device** adds the phone you're on.

**Calendar**

- **Their calendar column**: which calendar is their column and which others are merged into it, with **Manage calendars** to jump to General → Calendars (the main place calendars are linked to people).
- **Get reminders from**: tap calendars to get their event reminders and Daily Digest entries (✓ = on). Calendars that belong to someone are grouped under their name: tap the name to pick all of theirs. Tap the **★** on one to make it their **primary** calendar: its events then take this person's color everywhere.
- **Their own calendar**: set their calendar right here if it isn't added under Calendars yet. It becomes their column, with their name and color. It can have its own **badge**, the same as under Calendars.
- **Also show events from**: extra read-only calendars shown in their column (a school feed, a work calendar). Their events can't be edited from the dashboard. To get reminders from one, tick it under Get reminders from too.

![A person's Calendar section: their column, Manage calendars, and Get reminders from](/img/screenshots/settings-person-calendar.webp)

**Lists**

- **Their reminders list**: their own Reminders list, separate from the shared Family Reminders. Created automatically when they're added; point it at another list if you like.
- **Their other reminders lists**: more personal reminders lists. The one above stays their **primary**, where new reminders go; tap **★** on another to make it primary instead. **+ Create new** makes one.
- **Their wish list**: their wish list, created automatically. Pointing it at another list flags that list as their wish list.
- **Other people's reminder lists**: for each other person's own list: **None** (out of sight), **Add to calendar** (shown on this person's calendar in its owner's color, no notifications) or **Add to calendar + alert** (also notifies this person when one comes due). Everyone always sees their own list.
- **Reminders**: whether they get a notification when a reminder comes due, on the shared Family Reminders list and their own lists. Off by default.

**Instant notifications**: sent right away, not saved for the Daily Digest. Pick any:

- A reward is claimed (by anyone in the household)
- One of my chores is approved
- One of my chores is sent back
- One of my chores is due soon (using that chore's own reminder times)
- One of my timers goes off (alarm-style, so it breaks through silent mode and Do Not Disturb)

**Daily Digest**: on or off for this person, and **In their digest**: today's calendar events, today's due reminders, today's planned meals, their own pending chores, and (with Grocy) items expiring soon and items running low. **📤 Send test digest now** sends what's ticked, even before you Save, to their notify targets.

**Notification debug** (admin only): what Family Hub actually sees for this person as of their last Save: their **subscribed calendars**, the **devices to notify**, and **pending notifications** (and ones already sent). Use **🔄 Refresh** after a change.

**Kiosk PIN login** (admin only): **Enable logging in as this person on a shared kiosk display**, and **🔐 Set / change PIN…** (4 to 8 digits; save it blank to clear it). They can then tap **🔒 Login** on the Chores, Rewards and To-Do Lists cards, or unlock Privacy Mode and locked More-menu pop-ups, as themselves. A kiosk session logs out after 45 seconds of no taps. Five wrong PINs in a row lock that person's PIN for 5 minutes; setting a new PIN unlocks it.

**Permissions** (admin only): saved the moment you tick them. A Home Assistant admin always has all of them. Everyone, with no permissions at all, can still do their own chores, claim from the Chore Bin, check off routine items, log their own goals, suggest a reward, suggest a meal, and ask for stars.

| Group | Permission | Lets them |
|---|---|---|
| Chores | **Assign to others** | Assign chores to other people, reassign by dragging, and edit the Chores library. |
| Chores | **Edit open chores** | Change an existing open chore (stars, due date and so on). |
| Chores | **Skip-approval chores** | Create or edit a chore that skips approval, so its stars pay out right away. |
| Chores | **Approve completed** | Approve or send back chores (and star requests) other people marked done. |
| Chores | **Complete anyone's** | Mark any chore done, not just their own. |
| Chores | **No approval needed** | Their own finished chores are approved and paid instantly. |
| Rewards | **Override star costs** | Change what a reward costs, add or subtract anyone's stars (Manage stars), reverse or clear history, price and approve suggestions, and mark rewards as handed over. |
| Rewards | **Add to catalog** | Add rewards with a star cost, price and approve suggestions, and mark a "needs a parent" reward as handed over. Without it, what they add is a suggestion that waits for approval. |
| Menu | **Edit the menu** | Change the weekly meal plan. Without it they can still **suggest** a meal for any day, and someone with this permission decides. |
| Wish Lists | **See claim status** | See who's claimed what on other people's wish lists. A list's owner never sees claims. |
| Calendar | **Delete calendar events** | Delete events (on calendars that allow it). |
| Calendar | **Edit/move calendar events** | Edit events, and drag them to another day in Edit Meals mode (on calendars that allow it). |
| Routines | **Manage own routine items** | Add, edit, remove and reorder items in their own routines. |
| Routines | **Manage everyone's routine items** | The same for anyone's routines, and edit the Routines library. |
| Privacy | **Turn off Privacy mode** | Unlock Privacy Mode with their Kiosk PIN. Anyone can turn it on. |

### Alarm Devices (admin only)

Speakers and Assist satellites a widened ("Them + kiosks" or "Everyone") chore/reward timer alarm rings on, picked from Home Assistant's own entity list. Set per chore/reward from its own "Who hears this alarm" option. Also sets the **text-to-speech voice** used for speaker alarms (not needed for Assist satellites).

## Devices tab (admin only)

Every screen that has opened a Family Hub dashboard shows up here, with each dashboard view on it listed separately. For each one you can see and change:

- **Device name** (otherwise a guess from the browser, like "Chrome on Android")
- The **this device only** layout fields from the General tab: Week button shows, Days shown, Rows shown, Current day always first and its navigation step, Month button shows, Show hours of the day, Small screen mode (the Minimal top bar), Calendar top bar style: Hidden, and Hide name pills
- **Screensaver enabled** and **Participates in Privacy Mode**: these two save immediately, no Push needed.
- **Dashboards/views on this device**: which views it has opened.

Then:

- **Push** sends the changed values to that screen. An open screen updates instantly; a closed one picks it up next time it opens.
- **Identify all** flashes a name on every screen at once, to match the list to the physical tablets. (**Identify** in General → This device does the same for just the screen you're on.)
- **Presets**: save a screen's values as a named preset, then apply it to any other screen.

Every value here is also a Home Assistant entity, so automations can change them. See [Automations & Entities](/docs/features/automations-and-entities#per-screen-entities).

## Developer tools tab (admin only)

- **Discreet mode (hide names & event text)**: shows people as "Person 1", "Person 2" and blanks event names on the calendar and Right Now card, on every screen. Handy for screenshots or a public-facing display. See [Discreet Mode](/docs/features/privacy-mode#discreet-mode).
- **🐛 Debug Info**: what the card has loaded: events and errors for each calendar, the current settings, and backup history. **Copy** it or **Export to file** to attach to a bug report.
- **💾 Back up now**: take a settings snapshot right away. Restoring is under [Integration Options → Backups](/docs/integration-options#backups).
