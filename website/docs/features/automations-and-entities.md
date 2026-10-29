---
title: Automations & Entities
sidebar_position: 12
description: Family Hub's actions, events, device triggers and entities, for automations, scripts and voice assistants.
---

Everything Family Hub exposes to Home Assistant itself, so automations, scripts, voice assistants and other dashboards can work with it. Timers have their own section with more detail: [Timers → Actions and events](/docs/features/timers#actions-and-events-for-automations).

## Actions

Call these from **Developer tools → Actions**, an automation or a script.

| Action | What it does | Fields |
|---|---|---|
| `family_hub.create_chore` | Creates a chore, the same as the Chores card's **+** button. | `title` (required), `assigned_to` (a user ID, or `chore_bin`), `assignment_mode` (`direct`, `chore_bin`, `auto_rotation`, `first_come_first_served`), `rotation_group` (user IDs in order), `star_value`, `due_date`, `overdue_penalty`, `dependencies` (chore IDs), `show_on_calendar` (true to show it on the calendar on its due date) |
| `family_hub.complete_chore` | Marks a chore done. It goes to Awaiting approval, unless it skips approval. | `chore_id` |
| `family_hub.approve_chore` | Approves a chore and pays its stars. | `chore_id` |
| `family_hub.reject_chore` | Sends a chore back for a redo, with no stars. | `chore_id`, `reason` (optional, shown to them) |
| `family_hub.nudge_user` | Sends the 🔔 reminder for one chore to whoever has it. | `chore_id` |
| `family_hub.quick_add` | Adds one plain-English line, the same as [Quick Add](/docs/features/quick-add): an event, reminder, meal, chore, reward or list item. Returns `message` (what it added). | `text`, `user_id` (optional: add it as this person; only automations and admins can use it) |
| `family_hub.ask` | Answers a question in one sentence, the same as asking Assist: what's for dinner, what's on the calendar, reminders, chores, stars. Returns `answer`. See [Asking questions](/docs/features/quick-add#asking-questions). | `question`, `user_id` (optional: who "I" means; only automations and admins can use it) |
| `family_hub.start_timer` | Starts a timer. | See [Timers](/docs/features/timers#actions-and-events-for-automations) |
| `family_hub.cancel_timer` | Cancels a timer. | See Timers |
| `family_hub.stop_timer_alarm` | Silences one ringing alarm, or all of them. | See Timers |

Chore IDs come with every chore event (below), so an automation can react to one chore and then act on it.

Example: put "Empty the dishwasher" in the Chore Bin when the dishwasher finishes.

```yaml
action: family_hub.create_chore
data:
  title: Empty the dishwasher
  assignment_mode: chore_bin
  star_value: 2
```

A chore can also create or complete itself from a sensor without any automation: see **Automate** in the chore form ([Chores](/docs/features/chores-rewards-goals-routines#chores)).

## Events

Listen for these with an **Event** trigger.

| Event | Fired when | Data |
|---|---|---|
| `family_hub_chore_event` | Any chore change: created, assigned, claimed, marked in progress, completed, approved, sent back, recurred, overdue, nudged, a star request, or one unit of a quantity chore done | `chore_id`, `title`, `status`, `previous_status`, `assigned_to`, `actor`, and `event` for the named kinds (`assigned`, `claimed`, `in_progress`, `in_progress_cleared`, `quantity_decremented`, `rejected`, `recurred`, `overdue`, `nudged`, `star_request`). Approvals carry `stars_disbursed`; a sent-back chore carries `reason`; an overdue one carries `penalty`. |
| `family_hub_goal_event` | A goal is created, logged, approved or sent back | `goal_id`, `title`, `status`, `previous_status`, `assigned_to`, `actor`, plus `event: logged` with `current_count`, `event: rejected` with `reason`, or `stars_disbursed` on approval |
| `family_hub_routine_event` | A routine item is checked or unchecked, approved, or someone finishes a whole routine | `event` (`item_toggled`, `item_approved`, `routine_completed`), `user_id`, `category` (`morning`, `afternoon`, `night`), and for items `item_id`, `title`, `done`, `actor` |
| `family_hub_privacy_mode_changed` | Privacy Mode turns on or off | `enabled` |
| `family_hub_timer_started`, `family_hub_timer_finished`, `family_hub_timer_cancelled`, `family_hub_timer_alarm_stopped` | Timer changes | See [Timers](/docs/features/timers#actions-and-events-for-automations) |

Example: flash the hallway light when a chore is waiting for approval.

```yaml
triggers:
  - trigger: event
    event_type: family_hub_chore_event
    event_data:
      status: pending_verification
actions:
  - action: light.turn_on
    target:
      entity_id: light.hallway
    data:
      flash: short
```

## Device triggers for routines

Family Hub adds **device triggers** for routines, so you don't need to write the event yourself. In an automation, add a **Device** trigger, pick a Family Hub device (any of them works; they all offer the same triggers), and choose:

- **Routine completed**: someone checked off everything in a routine.
- **Routine item toggled**: one item was checked or unchecked.
- **Routine item approved**: an item that needs approval was approved.

Each can be narrowed to one routine (Morning, Afternoon or Night) and one person. A nice one: when the kids' Night routine is completed, dim the lights.

## Entities

| Entity | One per | What it's for |
|---|---|---|
| `switch.family_hub_privacy_mode` | household | Turn Privacy Mode on or off. No PIN is needed from an automation. See [Privacy Mode](/docs/features/privacy-mode). |
| `button.<name>_daily_digest` | person | Pressing it opens that person's Daily Digest pop-up on any Family Hub screen they're signed into right now. It doesn't send a notification. |
| `todo.family_hub_chores` | household | Chores nobody has yet (the Chore Bin). Add an item to create a chore there. |
| `todo.<name>_chores` | person | Their assigned chores. Tick one off to mark it done; add one to give them a chore. See [Chores in Home Assistant's to-do lists](/docs/features/chores-rewards-goals-routines#chores). |
| `todo.family_reminders` | household | The shared Family Reminders list, created automatically. |
| `todo.<name>_reminders`, `todo.<name>_wish_list` | person | Each person's own reminders list and wish list, created when they're added under Settings → Users. |
| `sensor.*` (named after the timer) | running timer | One read-only sensor per active timer, with `kind`, `title`, `user_name`, `chore_id`, `reward_item_id`, `started_at`, `duration_minutes`, `finishes_at` and the matching native `timer.*` helper. |
| `timer.family_hub_<name>`, `timer.family_hub_family_1` … `_4` | person, plus 4 shared | Native Home Assistant timer helpers that Family Hub's timers run on, so "when `timer.family_hub_emma` finishes" works as a trigger. See [Timers](/docs/features/timers). |

### Per-screen entities

Every screen that opens a Family Hub dashboard becomes a **device** in Home Assistant (Settings → Devices & services → Family Hub), named after the browser or the **Device name** you give it. Each has:

- **Screensaver enabled** (switch): turns the screen saver on or off on that screen right away.
- **Participates in privacy mode** (switch): whether that screen obeys Privacy Mode.
- One entity for each "this device only" layout setting: **Current day always first**, **Navigation step**, **Days shown in Week view**, **Rows shown in Week view**, **Week button shows**, **Month button shows**, **Show hours of the day**, **Small screen mode**, **Calendar top bar style: Hidden**, **Hide name pills** and **Device name**. Each dashboard view on that screen gets its own set, prefixed with the view's name.
- **Sync** (button): sends any changed values to the screen now. An open screen updates instantly; a closed one picks it up the next time it opens.

So an automation can, say, switch the kitchen tablet to Agenda in the evening and back to Week in the morning, or turn its screen saver off during a party.

The names above are the usual ones. Your exact entity IDs depend on people's names and any renames, so check Settings → Devices & services → Family Hub → Entities.
