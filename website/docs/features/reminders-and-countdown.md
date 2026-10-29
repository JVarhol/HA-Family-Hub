---
title: Reminders & Countdown
sidebar_position: 7
---

- **A Family Reminders list is made for you** (v1.168.88+): reminders live
  on a Home Assistant to-do list, `todo.family_reminders`. Family Hub
  creates it (as a Local To-do list) when it's missing, right after install
  or if it's deleted later.
- **Everyone's own reminders lists**: each person added under Settings →
  Users also gets their own list (`todo.<name>_reminders`), and can have
  more. New reminders can go on the shared list or **My list**. In each
  person's profile, **Other people's reminder lists** decides whether they
  see someone else's list: **None**, **Add to calendar** (shown in its
  owner's color) or **Add to calendar + alert** (also notified when one
  comes due). See [Member profiles](/docs/settings-modal#member-profiles).
- **Standalone reminders**, stored as Home Assistant to-do items (not
  calendar events), with their own date/time, editable after creation from
  the event-info popup, and a **mark done** button.
- **"Roll over to next day if not completed"**: an optional per-reminder
  flag. If checked, the backend automatically pushes an incomplete
  reminder's due date forward by one day (same time) each day it's still
  not marked done. It keeps re-notifying daily until you mark it done.
  Without it, a reminder just fires once at its due time and then sits
  overdue on its original day until you clean it up yourself.
- **Repeating reminders** (v1.168.88+): the Reminder tab has the same
  **Repeat** section as calendar events: daily, weekly on chosen days,
  monthly or yearly, every N days/weeks/months/years, ending never, on a
  date, or after a number of times. Marking a repeating reminder done moves
  it to its next date instead of finishing it (dates you missed are
  skipped), wherever you mark it done: the calendar, the Today card or Home
  Assistant's own to-do list. Upcoming dates show faded on the calendar. The
  event-info popup can change or stop the repeat. The last one (or one past
  its end date) finishes normally.
- **Categories** (v1.168.88+): reminders can have a category too; see
  [Calendar](/docs/features/calendar-and-layout#adding-and-editing-events).
- **Calendar-event reminders**: any event can get a "remind me N minutes
  before" lead time (or several at once, e.g. 10 and 30 minutes before):
  tap 5m, 10m, 15m, 30m or 1h, or **+ Custom** for any number of minutes,
  hours or days before (v1.168.88+),
  added at creation or edited afterward from the event-info popup;
  editing one on a recurring-by-name event (e.g. weekly "Yoga") offers to
  apply the same change to every matching occurrence currently loaded.
- **Attach a checklist to any event or reminder**: the "Attach a
  checklist" toggle in the Add Event modal works the same way for a
  calendar event and a standalone reminder. Two modes: **"Just for
  this"** creates a brand-new to-do list scoped to just that one event
  or reminder, with items you type right there. It's deleted
  automatically once the event/reminder passes (with a short grace
  window, so it doesn't vanish while you're still mid-use). **"Use an
  existing list"** attaches one of your existing `todo.*` lists instead
  (packing for a trip, say); that list is only ever unlinked when the
  event/reminder passes, never touched or deleted itself. Either way,
  the checklist is editable afterward from the event-info popup, right
  alongside the event/reminder's own details.
- **Server-side delivery**: reminders and event notifications fire from the
  backend integration itself (polling every few minutes, configurable), so
  they arrive even if no dashboard is open, and are deduplicated so the
  same reminder never fires twice.
- **Who gets notified is set per person** (Settings → Users → their
  profile): their **Notify targets** (their phones), which calendars they
  **Get reminders from**, whether **Reminders** notify them, their
  **Instant notifications** (a reward claimed, a chore approved, sent back
  or due soon, a timer going off) and their own **Daily Digest**. Which
  calendars the backend watches, and how often, is under
  [Integration Options → Calendar reminders](/docs/integration-options#calendar-reminders).
- **Tapping a notification** opens the dashboard set under Settings →
  Users → **Notification tap destination** (needs the Home Assistant
  Companion app).
- **Checking it works**: **Test a notification** and **Upcoming
  notifications** under [Integration Options](/docs/integration-options),
  and **Notification debug** in each person's profile.
- **Daily Digest**: an optional once-a-day notification (Settings → Daily
  Digest: on/off and the send time; each person's profile: whether they
  get one and what's in it, with **Send test digest now**) summarizing that
  day's calendar events, due reminders, planned meals and their own pending
  chores. Sent by the
  backend at the first poll at or after the configured time, once per
  calendar day, independent of the dashboard being open. With Grocy
  connected, it can also add an "N items expiring soon" and/or "N items
  running low" line, each opt-in per person in their profile once the
  Grocy toggles are on (see [Grocy](/docs/features/grocy-integration)), and every section, Grocy or not,
  is simply omitted on a day it has nothing to report.
  - **As a popup, any time**: the same digest is also available as a modal
    you can open on demand. There's nothing to wait for, and it's always your own
    current content, not a cached notification from earlier. Two ways to
    open it: **Daily Digest** in the calendar's **⋮ More** menu (admins can
    hide it under Settings → More menu); or, from anywhere else in Home Assistant
    (another dashboard, an automation, a script, a button card), press that
    person's own `button.<name>_daily_digest` entity (one is created
    automatically per real Home Assistant user account). Pressing it pops
    the modal open live on any Family Hub dashboard that person currently
    has open and is signed into; it does not itself send a notification.
    The digest shown is always specific to whoever's looking at it: each
    person only ever sees their own events, reminders, meals, and chores.

## Countdown
- **Countdown banner** showing the nearest upcoming event from any
  calendar(s) flagged for it (great for birthdays), plus any number of
  **custom countdown items**: add one from an event/reminder's "Use as
  countdown" button (which becomes "Remove from countdown" once added), or
  manage the whole list directly in Settings → Countdown (add, remove, see
  every saved item).
- **Cycling ticker**: with more than one countdown item and "Cycle through
  all upcoming countdown items" turned on, the banner rotates through all
  of them every few seconds instead of only showing the soonest one.
