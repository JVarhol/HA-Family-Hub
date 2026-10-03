---
title: Timers
sidebar_position: 5
---


- **Timers on chores and rewards**: give a chore an optional timer ("clean
  for 30 minutes") and it gains a **▶ Start** button that counts down and
  then completes the chore itself — obeying the approval rules you already
  have, so it either lands in Awaiting Approval or pays out instantly. Give a
  catalog reward a timer ("2 hours of gaming") and **Use** spends the stars
  and starts the countdown, with a notification when time's up.
- **Active Timers card**: every timer running in the house on one board —
  chore timers, reward timers, and quick household timers — each card tinted
  with the colour of whoever it's assigned to (the same per-person colour you
  set on the Users tab), with unassigned ones in neutral grey. Live
  countdowns, soonest-finishing first, and a ✕ to stop one.
- **Quick household timers**: **＋ Start Timer** on that card opens a small
  modal with four one-tap presets (5m / 15m / 30m / 1h), a custom-minutes box
  for anything else, an optional label ("Oven", "Sam's turn") and an optional
  person to assign it to. Assign it and that person gets the notification in
  their colour; leave it unassigned and it's a house timer anyone can stop,
  which notifies everyone when it finishes.
- **They keep running with everything closed**: timers live on the Family Hub
  backend, so one still finishes, completes its chore and sends its
  notification with every dashboard shut and the tablet asleep — and picks up
  at the right time remaining after a reload or a Home Assistant restart.
- **Native Home Assistant timer helpers are created for you automatically.**
  As of v1.110.3, Family Hub creates and maintains a real `timer.*` helper
  for every household member — named **"Family Hub \<Name\>"**, entity id
  `timer.family_hub_<name>` (e.g. `timer.family_hub_emma`) — plus **4
  shared "Family Hub Family 1"–"Family Hub Family 4"** helpers, always
  present, for timers nobody in particular is assigned to (the oven, a
  board game). These appear automatically whenever you save Settings after
  adding a member, and are backfilled the first time the Active Timers
  card loads on an upgraded household — nothing to click. A timer is
  handed to the assigned person's own helper first, then a free shared
  one, so "Emma's" countdown always lands on `timer.family_hub_emma`
  itself — genuine `timer.*` entities, visible in Developer Tools,
  droppable on any dashboard, and usable directly as an automation trigger
  ("when `timer.family_hub_emma` finishes…"). Removing someone from Family
  Hub deliberately leaves their helper in place (same as everything else a
  removed member leaves behind) — delete it yourself from Settings →
  Devices & Services → Helpers if you don't want it any more. You can still
  hand-create extra `timer.family_hub*`-named helpers of your own; Family
  Hub adopts those too once its own are all busy.
- **Automations: which chore or reward is a timer actually for?** A native
  `timer.*` entity's own state has no room for that — it's just a
  countdown. Two things close the gap, so a plain HA automation can answer
  "what is this timer, and who's it for" without any Family Hub-specific
  knowledge:
  - A **`sensor.*` entity per currently-running timer** (state = its kind:
    `chore` / `reward` / `standalone`) carrying `chore_id`, `reward_item_id`,
    `title`, `user_id`, `user_name`, `native_timer_entity_id` (the `timer.*`
    helper it's adopted onto, if any), `started_at`, `duration_minutes` and
    `finishes_at` as attributes — query it any time from Developer Tools →
    States or a template.
  - A custom **`family_hub_timer_finished` event**, fired the instant any
    timer of any kind completes, carrying the same fields as event data.
    This is the natural trigger for "when X finishes, do Y" — no attribute
    lookup needed.

  **Example: lock a kid's computer when their screen-time reward ends.**
  ```yaml
  automation:
    - alias: "Lock Sam's computer when screen time ends"
      triggers:
        - trigger: event
          event_type: family_hub_timer_finished
      condition: >
        {{ trigger.event.data.kind == 'reward'
           and trigger.event.data.user_id == 'YOUR_SAMS_HA_USER_ID'
           and 'screen' in (trigger.event.data.title | lower) }}
      actions:
        - action: lock.lock
          target:
            entity_id: lock.sams_computer
  ```
  (Swap the `condition` for whatever identifies "this is the screen-time
  reward" for your household — matching on `reward_item_id` against the
  catalog item's id is more robust than matching on title text once you
  know it.) The same information is available as a state trigger instead,
  if you'd rather watch the sensor:
  ```yaml
  automation:
    - alias: "Lock Sam's computer when screen time ends (sensor variant)"
      triggers:
        - trigger: state
          entity_id: sensor.family_hub_timer_2_hours_of_gaming
          to: null  # the sensor is removed (fired OR cancelled) once its timer ends
      actions:
        - action: lock.lock
          target:
            entity_id: lock.sams_computer
  ```
