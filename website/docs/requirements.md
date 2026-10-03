---
title: Requirements
sidebar_position: 3
---


`family_hub` is installed as a real custom integration (`custom_components/
family_hub`), not a raw card file — it serves the Family Week Calendar
card, the Family Today companion card, the Chores/Rewards/Goals/My Chores
board cards, the Screen Saver companion card, and the Theme Selector card
(plus a Theme Builder sidebar panel that isn't a documented feature of
this beta yet — see [Theming](/docs/features/theming-and-more) above), and best-effort
auto-registers all of them as dashboard resources.

The recipe box, meal plan, meal templates, meal suggestions, and
standalone reminders are stored as Home Assistant `todo` list entities (so
they sync across every device automatically, with no size limits the way
`input_text` helpers have), so you'll want several `todo` entities before
configuring the card. The easiest way is the built-in **Local To-do**
integration — Settings → Devices & Services → Add Integration → **Local
To-do** — create one list per row below and note the resulting entity IDs.
(Card Settings, and everything in the Chores/Rewards/Goals/Routines board,
need no `todo` entity at all — see the note above and
[Chores, Rewards, Goals & Routines](/docs/features/chores-rewards-goals-routines).)

| Purpose | Example entity |
|---|---|
| Recipe box | `todo.recipe_box` |
| Meal plan | `todo.meal_plan` |
| Meal plan templates | `todo.meal_plan_templates` |
| Meal suggestions | `todo.meal_suggestions` |
| Standalone reminders | `todo.family_reminders` |

You'll also want at least one `calendar.*` entity (a local HA calendar, a
CalDAV/Google Calendar integration, etc.) to show events, and — for
reminders, event alerts, or the Daily Digest to actually notify anyone — at
least one working `notify.*` target (e.g. the Home Assistant Companion app).
