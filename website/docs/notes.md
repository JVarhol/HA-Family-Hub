---
title: Notes
sidebar_position: 5
---


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
