---
title: Timers
sidebar_position: 5
---

- **Timers on chores and rewards**: give a chore an optional timer ("clean
  for 30 minutes") and it gains a **▶ Start** button that counts down and
  then completes the chore itself; it obeys the approval rules you already
  have, so it either lands in Awaiting Approval or pays out instantly. Give a
  catalog reward a timer ("2 hours of gaming") and **Use** spends the stars
  and starts the countdown, with a notification when time's up.
- **Active Timers card**: every timer running in the house on one board:
  chore timers, reward timers, and quick household timers, each card tinted
  with the colour of whoever it's assigned to (the same per-person colour you
  set on the Users tab), with unassigned ones in neutral grey. Live
  countdowns, soonest-finishing first, and a ✕ to stop one.

![The Active Timers card: a kitchen timer, a chore timer and a reward timer, each in its person's color](/img/screenshots/active-timers.webp)

- **Quick household timers**: **＋ Start Timer** on that card opens a small
  modal with four one-tap presets (5m / 15m / 30m / 1h), a custom-minutes box
  for anything else, an optional label ("Oven", "Sam's turn") and an optional
  person to assign it to, who hears the alarm, and (optionally) which
  speakers it rings on. Assign it and it's that person's timer in their
  colour; leave it unassigned and it's a house timer anyone can stop.

## When a timer ends: the alarm

Every timer rings when it ends (a chore timer whose chore was already done
or deleted stays quiet). It keeps going until someone taps **Stop**
anywhere, and Stop on any screen, phone or the log silences it everywhere.

| Where it rings | Just them (default) | Them + kiosks | Everyone |
|---|---|---|---|
| The screen that started it | ✓ | ✓ | ✓ |
| Screens logged in as that person (a house timer: as whoever started it) | ✓ | ✓ | every screen |
| Screens logged in as a kiosk (Users → person → Alarm kiosk) | | ✓ | ✓ |
| That person's phone(s) (a house timer: the starter's) | ✓ | ✓ | every phone |
| Speakers linked to that person (a house timer: the House speakers) | ✓ | ✓ | every speaker |
| House speakers | | ✓ | ✓ |

- **Screens** show a full-screen "Time's up!" with an alarm sound (it ends
  the screen saver first). Several alarms at once each get their own row,
  plus **Stop all**.
- **Phones** get a push with a **Stop** button. It's re-sent about every
  45 seconds until stopped, then cleared from the phone. It's alarm-style
  (alarm sound through Do Not Disturb on Android, a critical alert on iOS)
  if that person turned on alarm-style timer notifications in their
  profile, and always for an "Everyone" alarm.
- **Speakers** (Google Home, Nest, Sonos, Assist satellites) announce it,
  repeating until stopped. Set them up under **Settings → Users → Alarm
  Devices**: tap a speaker to add it, tick who it **Rings for** (people,
  and/or **House timers** for timers with nobody assigned), and use
  **Test** to hear it. Speakers need a text-to-speech voice picked below the
  list; Assist satellites don't. When starting a quick timer you can also
  pick speakers just for that timer.
- **Nobody around?** An alarm goes quiet by itself after 30 minutes.
- Ringing alarms survive a Home Assistant restart, and timers go off on the
  exact second (not up to 30 seconds late).

## Timer log

**🕘 Log** on the Active Timers card lists recent timers, newest first:
what it was and who it was for, who set it and from where (Chores card,
Rewards card, Active Timers, an automation), how long, when it started and
ended, how it ended (finished, the chore's result, or cancelled and by
whom), where it rang, and who stopped it and from what (a screen, a phone,
an automation) or that it went quiet on its own. A ringing one has a
**Stop alarm** button. The last 300 timers are kept.

## Actions and events for automations

- **Actions**: `family_hub.start_timer` (label, hours/minutes/seconds, a
  person's name or user id, who hears it, specific speakers),
  `family_hub.cancel_timer` (by id, person and/or label) and
  `family_hub.stop_timer_alarm` (one, or every ringing alarm).
- **Events**: `family_hub_timer_started`, `family_hub_timer_finished`,
  `family_hub_timer_cancelled` (stopped early: from a card, Home Assistant's
  own timer UI, an automation, or because its chore was finished by hand)
  and `family_hub_timer_alarm_stopped`. They all carry `uid`, `kind`,
  `title`, `user_id`, `user_name`, `chore_id`, `reward_item_id`,
  `started_by`, `source`, `started_at`, `duration_minutes` and `ends_at`;
  the end events add `reason`.

**Example: an hour of computer time turns the internet on, and off again
when it's up or stopped early.**
```yaml
automation:
  - alias: "Computer time"
    triggers:
      - trigger: event
        event_type: family_hub_timer_started
        id: "on"
      - trigger: event
        event_type: family_hub_timer_finished
        id: "off"
      - trigger: event
        event_type: family_hub_timer_cancelled
        id: "off"
    conditions:
      - condition: template
        value_template: "{{ trigger.event.data.reward_item_id == 'YOUR_REWARD_ID' }}"
    actions:
      - action: "switch.turn_{{ trigger.id }}"
        target:
          entity_id: switch.kids_internet
```
(The reward's id is in the event data the first time you use it - check
Developer Tools → Events, listening for `family_hub_timer_started`.)
- **They keep running with everything closed**: timers live on the Family Hub
  backend, so one still finishes, completes its chore and sends its
  notification with every dashboard shut and the tablet asleep, and picks up
  at the right time remaining after a reload or a Home Assistant restart.
- **Native Home Assistant timer helpers are created for you automatically.**
  As of v1.110.3, Family Hub creates and maintains a real `timer.*` helper
  for every household member, named **"Family Hub \<Name\>"**, entity id
  `timer.family_hub_<name>` (e.g. `timer.family_hub_emma`), plus **4
  shared "Family Hub Family 1"–"Family Hub Family 4"** helpers, always
  present, for timers nobody in particular is assigned to (the oven, a
  board game). These appear automatically whenever you save Settings after
  adding a member, and are backfilled the first time the Active Timers
  card loads on an upgraded household. Nothing to click. A timer is
  handed to the assigned person's own helper first, then a free shared
  one, so "Emma's" countdown always lands on `timer.family_hub_emma`
  itself: genuine `timer.*` entities, visible in Developer Tools,
  droppable on any dashboard, and usable directly as an automation trigger
  ("when `timer.family_hub_emma` finishes…"). Removing someone from Family
  Hub deliberately leaves their helper in place (same as everything else a
  removed member leaves behind). Delete it yourself from Settings →
  Devices & Services → Helpers if you don't want it any more. You can still
  hand-create extra `timer.family_hub*`-named helpers of your own; Family
  Hub adopts those too once its own are all busy.
- **Automations: which chore or reward is a timer actually for?** A native
  `timer.*` entity's own state has no room for that; it's just a
  countdown. Two things close the gap, so a plain HA automation can answer
  "what is this timer, and who's it for" without any Family Hub-specific
  knowledge:
  - A **`sensor.*` entity per currently-running timer** (state = its kind:
    `chore` / `reward` / `standalone`) carrying `chore_id`, `reward_item_id`,
    `title`, `user_id`, `user_name`, `native_timer_entity_id` (the `timer.*`
    helper it's adopted onto, if any), `started_at`, `duration_minutes` and
    `finishes_at` as attributes. Query it any time from Developer Tools →
    States or a template.
  - The **`family_hub_timer_*` events** above, fired the instant a timer
    starts, finishes or is cancelled. These are the natural trigger for
    "when X finishes, do Y"; no attribute lookup needed.

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
  reward" for your household. Matching on `reward_item_id` against the
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
