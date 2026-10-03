---
title: Calendar & Layout
sidebar_position: 1
---

- **Week view and Month view**, switchable from the card itself, with a
  default-view setting. Tapping a day in Month view jumps to that week.
- **Per-person/per-calendar columns** with configurable name and color,
  driven by any number of `calendar.*` entities, fully manageable live from
  the in-card Settings → Calendars accordion (no YAML editing required after
  initial setup).
- **Per-calendar badges**: any calendar can define a keyword to watch for in
  event titles, a short badge (e.g. "N") to display next to the date when it
  matches, and a separate keyword for events that should be hidden from the
  grid entirely (e.g. a background custody-schedule calendar).
- **Optional hourly timeline** view, toggle is **device-specific** (saved to
  that browser/tablet only, via `localStorage`). Range is configurable start
  hour to end hour, with the end able to reach **Midnight**.
- **Word-wrapped event names** in both Week and Month view: full titles are shown rather than truncated.
- **Add-event FAB**: a floating "+" button with two tabs, **Calendar** (title, calendar, all-day or timed, location, notes, optional reminder lead time) and **Reminder** (a standalone to-do-backed reminder with its own date/time and an optional "roll over to next day if not completed" toggle), without leaving the card.
- **Multi-person events**: any event's info popup gets an **"Also for"**
  row: check off any other household member and the event shows in their
  column too (Week/Month view), with a diagonal collage/stripe background
  blending everyone's colors instead of one solid color. The event still
  lives on exactly one real calendar; tagging is purely a display overlay,
  nothing is duplicated onto anyone else's actual calendar.
- **Print/export view**: prints (or "Save as PDF" via the browser's print dialog) whichever view, week or month, is currently on screen, carrying over the active theme's colors.
