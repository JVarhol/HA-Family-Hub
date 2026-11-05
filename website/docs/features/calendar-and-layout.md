---
title: Calendar & Layout
sidebar_position: 1
---

The **Family Hub Week Calendar** is the centerpiece card: a full-screen, tablet-friendly calendar with each person's events in their own color, the week's meals, weather for each day, and reminders.

![Week view: meals at the top of each day, colored events below, a pencil on events that can be edited](/img/screenshots/calendar-week.webp)

*All screenshots on this site use a made-up demo household (Mom, Dad, Emma, Leo and a shared Family calendar).*

## Views

- **Week, Day and Month**, picked from the view menu in the top bar, with a
  default-view setting. **Day** shows a single day. Tapping a day in Month
  view jumps to it.
- **First day of the week** (v1.168.89+): weeks start on the day each
  person picked in their own Home Assistant profile (**Profile → First day
  of the week**), so Week view, the Month grid and its day headings start on
  Monday for one person and Sunday for another. "Automatic" follows their
  language's region (Monday for English (UK), Sunday for English (US)).
  With **Current day always first** on, today is still the first column.
  Holiday backgrounds set to fill a whole week still use a Sunday-to-Saturday
  week.
- **The Week button can show three layouts** (Settings → General →
  **Week button shows**, saved per device):
  - **Week**: a column per day, with each day's meals at the top.
  - **Planner**: a row per day and a column per person, so you can read
    across one person's week. It fills the whole card, and over a holiday
    photo it gets a solid (or, on a glass theme, frosted) background so it
    stays readable.
  - **Agenda**: a plain list of the coming days' events and reminders, no
    columns, ideal for a narrow screen or a sidebar. It uses the same
    **Days shown** setting as Week, and can include meals too.
- **Layout ideas**: one tap fills in a starting layout for your screen:
  Week, Portrait (7 days on 2 rows), Agenda, Two-Week Ahead or Week + Next
  Week (7 days plus an 8th tile summarising the following 7 days). See
  [Settings Modal → Layout ideas](/docs/settings-modal#layout-ideas-this-device-only).
- **Month + Day (split view)**: Month view can show the selected day's
  events in a panel beside the grid, with a **Go to this week** shortcut.
- **Optional hourly timeline** view, toggle is **device-specific** (saved to
  that browser/tablet only, via `localStorage`). Range is configurable start
  hour to end hour, with the end able to reach **Midnight**.
  (2026.11.1.2+) Each event sits at its real time and is as tall as it is
  long. The hours are labelled once per row, every day lines up on the same
  hours, and the days scroll together. A red line marks the current time on
  today. An event that starts inside another one (a call in the middle of a
  work block) sits on top of it, slightly indented, instead of squeezing both
  into narrow columns. Short events show just the time and title; longer ones
  add the end time, the people's faces and the location. All-day events stay
  in a band at the top of each day.
- **The date block** (2026.11.1.5+): each day shows the weekday and a large
  date on the left, and the weather (icon over the high and low) on the
  right. On narrow columns (a 14-day layout, a small tablet) the weather
  moves to a line under the date. A person's day badges (set per person in
  Settings) sit in a row under the date. Every day's date block is
  left-aligned and the same height (2026.11.1.12+), so the meals and events
  under them line up across the week, including days past the forecast
  and days without a badge.

  ![A week of date blocks: weekday and date on the left, the weather on the right, and a school badge under Monday and Tuesday](/img/screenshots/calendar-day-headers.webp)

- **Word-wrapped event names** in both Week and Month view: full titles are shown rather than truncated.
- **Today opens on what's next** (2026.11.1.3+): when today's column has
  more events than fit, it opens with the next event (or the one happening
  now) at the top. Scroll up for earlier events, down for later ones. Once
  everything today is over, it shows the last ones. If you scroll it
  yourself, it stays where you put it for a minute before going back to the
  next event. In the hour view, today already opens at the current hour.
- **Phones**: on a narrow screen the week stacks one day per row, and the
  person pills wrap onto two lines.

![Month view with the day panel open](/img/screenshots/calendar-month.webp)

![Planner layout: a row per day and a column per person](/img/screenshots/calendar-planner.webp)

![Agenda layout: every day as a list](/img/screenshots/calendar-agenda.webp)

![The hour-by-hour view: events at their real times, with a now line](/img/screenshots/calendar-hours.webp)

## Pictures, ages and what's happening now

These work on every card (2026.11.1.2+):

- **People's pictures**: if a person has a picture in Home Assistant
  (Settings → People), it's used instead of their initial on their events,
  name pills, the Right Now bar, the Today card, and the Chores and Rewards
  cards. An event for several people shows up to three faces. The picture
  is found through the person entity set as their presence entity, or the
  Home Assistant person linked to their user. Turn it off under Settings →
  General → **Show people's pictures**. Discreet Mode always hides them.
- **Birthday ages**: put the year in an event's description, like
  `YEAR=1956` or `born 1956`, and the title shows the age: "Grandma's
  birthday (70)". Anniversaries say "(10 years)". `since` and `married`
  work too. The title itself isn't changed, so editing the event still shows
  what you typed.
- **Happening now**: an event that's on right now gets a "Now ·" label and a
  thin bar showing how far through it is, in Week view, Agenda and the Today
  card (the Right Now bar always had one). Turn it off under Settings →
  General → **Show the Now marker**.

![Faces, a birthday age and a "Now" event in Week view](/img/screenshots/calendar-faces.webp)

## People and calendars

- **A column and color per person**: each person's calendar becomes their
  column, in their color. A person can have **more than one calendar**
  (say, a work Google calendar and a Local Calendar): their first
  calendar becomes their column and the rest are shown inside it, in the
  same color.
- **Colors come from Home Assistant**: a newly added calendar starts in
  the color Home Assistant (or Google, for a Google calendar) already uses
  for it. Linking a calendar to a person gives it that person's color,
  unless you've changed it since. Tap a calendar's color dot in Settings
  and pick **Reset to calendar color** to go back to its own color.
- **Shared calendars** (a Family calendar, a school calendar, a child
  without their own login) get a column of their own.
- **Picked by name, from Settings**: calendars are added under
  Settings → General → **Calendars**, choosing from a list of your Home
  Assistant calendars by name, with no YAML editing. The name fills in
  automatically and a new calendar gets a color nobody else is using. See
  [Settings Modal → Calendars](/docs/settings-modal#calendars).
- **First run**: a fresh install with no calendars shows a
  **+ Add your first calendar** button that opens Settings straight to the
  Calendars section.
- **Person pills**: the colored pills under the week heading show each
  person's event count. Tap pills to show just those people; tap again
  to turn them off.
- **Prevent duplicate events** (off by default): when the same event is on
  two calendars you show - the same invite, or an event with exactly the
  same name at the same time - it only appears once. Repeating events still
  show every occurrence. Give separate events different names ("Sam Soccer",
  "Taylor Soccer") so both show.
- **Per-calendar badges**: a small badge on the days a keyword shows up in a
  calendar's events, in place of the event itself. See
  [Badges: who's where](#badges-whos-where) below.

<img src="/HA-Family-Hub/img/screenshots/calendar-phone.webp" alt="The calendar on a phone" width="320" />

## Badges: who's where

Badges were built for custody schedules. When kids split their time between
two homes, the schedule is usually a calendar full of events like "Kids at
Dad's" or "Mom's week". You need to know who's in the house each day, but you
don't want those events filling every day of the calendar. A badge turns them
into a small mark under the date instead.

How it works:

- Each calendar (or person) can have badges, set in Settings → Calendars →
  **➕ Add badge**, or on the person under Users.
- A badge has a short **text** (a letter or emoji, like "D" or "🏠") and a
  **keyword**. On any day where one of that calendar's events contains the
  keyword, the badge shows under the date in that person's color, and the
  event itself isn't shown.
- A badge can also have a **hide** keyword: events containing it are hidden
  without a badge. Handy for the other half of the schedule, or anything you
  don't need to see.
- **Hide from digest** keeps matching events out of the Daily Digest too.
- **What it means** (2026.11.1.7+): each badge also says what it tells
  Family Hub about who's home. **Means they're home** (the default for new
  badges): they're home on the days it shows, and away on the days it
  doesn't. **Means they're away**: they're away on the days it shows. **Just
  a label**: nothing, it's only a mark (badges made before 2026.11.1.7 start
  as labels, so pick one for your custody badges).
- **Who it's about**: tick the people the badge is about. On a calendar
  linked to a person, leaving them all unticked means that person. On a
  shared calendar (like one "Custody" calendar for all the kids), tick each
  child it covers.

![A custody calendar with an "M" badge that means Emma and Leo are home, and a "D" badge that means away](/img/screenshots/settings-badge-presence.webp)

Chores and routines use this: see
[When someone's away](/docs/features/chores-rewards-goals-routines#when-someones-away).

An example: the kids' custody schedule is a calendar where every day has an
all-day event, "At Mom's" or "At Dad's". Give that calendar a badge "M" with
the keyword "Mom's", set it to **Means they're home**, and tick the kids.
Add a hide keyword "Dad's". Now the days they're home get a small "M" under
the date, neither event takes up space in the columns, and on the other days
Family Hub knows they're away: their chores go to someone else and they have
no routine. (If you'd rather mark the days they're away, use a "D" badge for
"Dad's" set to **Means they're away** instead.)

Badges work for anything you want to know at a glance without an event:
who's traveling, who has the car, whose week it is to cook, or a nanny or
grandparent day.

## Hashtags

Type `#Name` or `#Category` in an event's title or notes, even from Google
or Apple Calendar on your phone (v1.168.88+):

![Halloween as a banner under Saturday's meals, colored category bars under Soccer practice and Field trip, and Trick or treating striped for Emma and Leo](/img/screenshots/calendar-holiday-categories.webp)

- `#Emma` also shows the event on Emma's calendar, like **Also for**. A
  person's name from Settings → Users, their first name (when no one else
  shares it), or a calendar's name all work. Case and spaces don't matter:
  `#MaryAnn` matches "Mary Ann".
- `#Sports` gives the event the Sports category, if that category exists.
  A category picked in Family Hub still wins.
- Tags stack: "Game #Emma #Leo #Sports". Reminders take `#Category` too.

## Holiday calendars

A holiday calendar (Home Assistant's Holidays integration, a Google
holidays calendar) doesn't get a column, a name pill or event space
(v1.168.88+). Its days show as a banner with an icon from the holiday's
name: 🎃 Halloween, 🎄 Christmas, 🦃 Thanksgiving, 🎉 for anything else.

- **Week view**: a banner right under the day's meals, as wide as the meal
  blocks and about three-quarters of their height.
- **Month, Planner and Agenda**: a slim banner under (or beside) the date.
- **Today card**: a small chip next to the date.

Tap a banner to see the holiday's details.

Calendars with "holiday" in their name are treated this way automatically.
Use the **🎉 Holidays** button on any calendar in Settings → General →
Calendars to turn it on or off. Someone's own calendar is never treated
as a holiday calendar. A holiday calendar set to **Countdown** still feeds
the countdown banner.

## Adding and editing events

- **Add-event button**: a floating **+** button with two tabs, **Calendar
  Event** (calendar, title, all-day or timed, date, optional end date for
  multi-day events, repeat, location, notes, optional reminder lead time)
  and **Reminder** (a standalone to-do-backed reminder with its own
  date/time and an optional "roll over to next day if not completed"
  toggle), without leaving the card.
- **Categories** (v1.168.88+): admins set up categories (a name and a
  color, e.g. Sports, School, Work) under **Settings → General → Calendars**. Anyone can then pick one when adding an event or a
  reminder, or change it from the event's popup. An event or reminder with a
  category gets a colored bar along its bottom edge, like the who's-cooking
  bar on menu cards. Changing a repeating event's category changes the whole
  series.
- **Starts on your calendar**: New Event picks the signed-in person's own
  calendar, and only offers calendars that can actually take new events
  (a read-only Holidays feed isn't in the list).

![The New Event form](/img/screenshots/add-event.webp)

![An event's pop-up: calendar, when, Also for, category, Remind me, checklist and Use as meal](/img/screenshots/event-info.webp)

- **Edit pencil**: events on a calendar that Home Assistant can edit (for
  example the built-in **Local Calendar**) show a small ✎ pencil. Tap it to
  open the event with its edit form already open: title, date, times and
  location. Tapping anywhere else on the event opens its details as usual.
  You need the **Edit/move calendar events** permission to see it.
- **Read-only calendars say so**: events from a calendar that can't be
  changed from Home Assistant (e.g. Google Calendar, a holidays feed) don't
  get a pencil, and their details popup explains that they're read-only
  and where to edit them instead.
- **Edit, countdown and delete on one line**: at the bottom of an event's
  details are **Edit event**, **Use as countdown** and **Delete event**
  (each only when it applies).
- **Duplicate an event**: open **Edit event** and tap **Duplicate**. A
  small **Duplicate to…** window asks for the copy's date and start/end
  time (just the date for an all-day event). It starts on the event's own
  date and time, has **Tomorrow** and **Next week** shortcuts, and moving
  the start time keeps the copy the same length. Nothing is added until
  you tap **Add copy**. The copy keeps the title (as the edit form has
  it), location and details, goes on the same calendar, and the original
  isn't touched. On calendars that can't be edited from Home Assistant
  but can take new events (like Google Calendar), the button is
  **Duplicate event** and its form already has the date and time, so it
  just has **Add copy**.

<img src="/HA-Family-Hub/img/screenshots/duplicate-picker.webp" alt="The Duplicate to… window with Tomorrow and Next week shortcuts, a date, and start and end times" width="380" />

- **Repeating events**: the New Event form has a **Repeat** section
  (daily, weekly on chosen days, monthly or yearly, every N, with an
  optional end date). It only appears for calendars that can store
  repeating events. A repeating event's details say **Repeats** and list
  the other dates in the series, and editing one asks whether to change
  **This event**, **This and following events** or **All events in the
  series**.

![An event opened from its pencil, with the edit form open](/img/screenshots/event-edit.webp)

- **Multi-person events**: any event's info popup gets an **"Also for"**
  row: check off any other household member and the event shows in their
  column too (Week/Month view), with a diagonal collage/stripe background
  blending everyone's colors instead of one solid color. The event still
  lives on exactly one real calendar; tagging is purely a display overlay,
  nothing is duplicated onto anyone else's actual calendar.
- **Event extras**: **Remind me** (tap 5m, 10m, 15m, 30m or 1h, or
  **+ Custom** for any number of minutes, hours or days; pick several), a
  checklist, a category, and **Use as meal** (turn an event into that day's
  breakfast, lunch or dinner).
- **The New Event form** (v1.168.88+): start and end dates share a line,
  the checklist and category share a line, and Remind me is a single row of
  chips.
- **Chores** can show on the calendar too, on their due date, if the chore
  has **Show on the calendar** ticked. See
  [Chores on the calendar](/docs/features/chores-rewards-goals-routines#chores).
- **Moving events**: in **✏️ Edit** mode (the button in the top bar for rearranging meals),
  events can be dragged to another day as well as meals, on calendars that
  allow editing and for people with the **Edit/move calendar events**
  permission.

## The Right Now bar

Turn the top of the calendar into a live **Right Now** strip: the time and
weather, plus a tile for each person showing whether they're home, what
they're doing right now (with a progress bar until it ends), and what's
next. Sensor pills, like a phone's battery level, show up on the tile too.

The tiles are the people added under Settings → Users, each with their own
calendar (and any extra calendars they have), the same people "Also for"
offers (v1.168.88+). A shared calendar like Holidays isn't a person, so it
doesn't get a tile. Until anyone is linked to a calendar, the bar shows
the calendars instead.

![The Right Now bar across the top of the calendar](/img/screenshots/right-now-top.webp)

Turn it on from Settings → General → **Calendar top bar style** →
**Right Now** (saved per device, so the kitchen tablet can have it while a
phone doesn't). Then choose:

- **Placement**: **Top** shares one row with the calendar's navigation;
  **Left** or **Right** show it as a sidebar beside the whole calendar. On
  a phone it's always a strip across the top.
- **Size** (Top only): **Small** shows names and the current event,
  **Medium** adds Home/Away and sensor pills, **Large** (the default) adds
  the clock and weather.
- **Right Now shows**: turn the clock & date or the weather off.
- **Who's shown**: uncheck anyone (or anything, like a Holidays calendar)
  that shouldn't get a tile. They still show everywhere else.

The bar's heading (clock, date and weather), like the calendar's own
week label beside it, turns white when the background behind it is dark,
so it stays readable on dark themes.

The bar shows the same people as the calendar, in the same colors. Home/Away
comes from each person's presence entity and the extra pills from their
sensors, both set in their profile (Settings → Users → **Presence &
sensors**).

![The Right Now bar as a sidebar on the left](/img/screenshots/right-now-sidebar.webp)

The same view is also available as its own card, `family-right-now-card`,
for any other dashboard. See [Right Now card](/docs/cards/right-now).

## The top bar and the More menu

The calendar's top bar has ⚙️ Settings, the view switch (Week, Day, Month), the
arrows and week label, **✏️ Edit** (rearrange meals), 💡
**Suggestions**, the 🍽️ **Recipe Box** and the **⋮ More** menu. The More
menu holds **⚡ Quick Add** (type one line to add an event, reminder, meal, chore, reward or list item: see [Quick Add](/docs/features/quick-add)), **Templates** (whole-week meal templates), **Print**, and with
Grocy the **Shopping List**, **Expiring Soon** and **Low Stock**, plus
**Daily Digest** (your own digest as a pop-up), **Privacy Mode** and any
buttons your household added. Admins choose what's in it: see
[Settings → More menu](/docs/settings-modal#more-menu-admin-only).

![The ⋮ More menu open, with ⚡ Quick Add at the top](/img/screenshots/more-menu.webp)

**Calendar top bar style** (per screen) can shrink it to **Minimal** or
**Hidden**, or swap it for the Right Now bar. With the bar hidden, Settings
moves into the **+** button's menu.

## Printing

- **Print/export view**: prints (or "Save as PDF" via the browser's print dialog) whichever view, week or month, is currently on screen, carrying over the active theme's colors.
