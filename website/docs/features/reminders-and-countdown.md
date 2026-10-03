---
title: Reminders & Countdown
sidebar_position: 7
---

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
- **Attach a checklist to any event or reminder**: the "Attach a
  checklist" toggle in the Add Event modal works the same way for a
  calendar event and a standalone reminder. Two modes: **"Just for
  this"** creates a brand-new to-do list scoped to just that one event
  or reminder, with items you type right there — it's deleted
  automatically once the event/reminder passes (with a short grace
  window, so it doesn't vanish while you're still mid-use). **"Use an
  existing list"** attaches one of your existing `todo.*` lists instead
  (packing for a trip, say) — that list is only ever unlinked when the
  event/reminder passes, never touched or deleted itself. Either way,
  the checklist is editable afterward from the event-info popup, right
  alongside the event/reminder's own details.
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
  - **As a popup, any time**: the same digest is also available as a modal
    you can open on demand — nothing to wait for, and always your own
    current content, not a cached notification from earlier. Two ways to
    open it: turn on "Daily Digest button on calendar screen" (Settings →
    Calendar & layout, this device only) to add a "Daily Digest" item to
    the card's own More menu; or, from anywhere else in Home Assistant —
    another dashboard, an automation, a script, a button card — press that
    person's own `button.<name>_daily_digest` entity (one is created
    automatically per real Home Assistant user account). Pressing it pops
    the modal open live on any Family Hub dashboard that person currently
    has open and is signed into; it does not itself send a notification.
    The digest shown is always specific to whoever's looking at it — each
    person only ever sees their own events, reminders, meals, and chores.

## Countdown
- **Countdown banner** showing the nearest upcoming event from any
  calendar(s) flagged for it (great for birthdays), plus any number of
  **custom countdown items** — add one from an event/reminder's "Use as
  countdown" button (which becomes "Remove from countdown" once added), or
  manage the whole list directly in Settings → Countdown (add, remove, see
  every saved item).
- **Cycling ticker**: with more than one countdown item and "Cycle through
  all upcoming countdown items" turned on, the banner rotates through all
  of them every few seconds instead of only showing the soonest one.
