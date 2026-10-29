---
title: Requirements
sidebar_position: 3
---

`family_hub` is installed as a real custom integration (`custom_components/family_hub`), not a raw card file. It serves all [12 cards](/docs/card-configuration) and the **Theme Builder** sidebar page (see [Theming](/docs/features/theming-and-more)), and registers the cards as dashboard resources for you, so there's nothing to add under Resources.

The recipe box, meal plan, meal templates, meal suggestions and reminders are stored as Home Assistant `todo` lists, so they sync across every device. **You don't need to create them**: Family Hub makes the ones below as **Local To-do** lists the first time it needs them (the meal plan from Settings → Menu Blocks → **+ Add list**). Each person added under Settings → Users also gets their own reminders list and wish list automatically. If you'd rather use lists you already have, point the card at them (see [Family Week Calendar](/docs/cards/family-week-calendar)). Settings, Chores, Rewards, Goals, Routines, timers and the pantry's extra items need no `todo` list at all.

| Purpose | Default list |
|---|---|
| Recipe box | `todo.recipe_box` |
| Meal plan | `todo.meal_plan` |
| Meal plan templates | `todo.meal_plan_templates` |
| Meal suggestions | `todo.meal_suggestions` |
| Shared reminders | `todo.family_reminders` |
| Each person's reminders and wish list | `todo.<name>_reminders`, `todo.<name>_wish_list` |
| Chores (one list per person, plus the Chore Bin) | `todo.<name>_chores`, `todo.family_hub_chores` |

You'll also want at least one `calendar.*` entity (a local HA calendar, a CalDAV/Google Calendar integration, etc.) to show events. For reminders, event alerts, or the Daily Digest to actually notify anyone, you'll need at least one working `notify.*` target too (the Home Assistant Companion app works fine).
