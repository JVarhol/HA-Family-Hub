---
title: Family Week Calendar
description: The main Family Hub card - calendar, meals, reminders, and Settings for the whole household.
---

The centerpiece card: a full-screen, tablet-friendly calendar with each person's events in their own color, the week's meals, the weather, reminders, the countdown banner and the **More** menu. Its **⚙️ Settings** button is where every household setting lives, so add this card first.

![Week view: meals at the top of each day, colored events below](/img/screenshots/calendar-week.webp)

What it can do is covered in [Calendar & Layout](/docs/features/calendar-and-layout), [Meal Planning](/docs/features/meal-planning) and [Reminders & Countdown](/docs/features/reminders-and-countdown). This page is the card's own options.

## YAML

Nothing is required. This is a complete card:

```yaml
type: custom:family-week-calendar-card
```

Every option, with its default:

```yaml
type: custom:family-week-calendar-card
people: []                       # calendars are added from Settings instead
recipe_entity: todo.recipe_box
meal_plan_entity: todo.meal_plan
meal_templates_entity: todo.meal_plan_templates
suggestions_entity: todo.meal_suggestions
reminders_entity: todo.family_reminders
weather_entity: weather.forecast_home
birthdays_entity: calendar.birthdays
fab_position: dashboard          # or "card"
hide_fab: false
hide_top_bar: false
static_layout_across_devices: false
```

## Options

| Option | Default | Description |
|---|---|---|
| `people` | none | Calendars as `{ entity, name, color }`. You don't need it: add calendars from **Settings → General → Calendars**, which is easier and syncs to every screen. |
| `recipe_entity` | `todo.recipe_box` | The to-do list behind the Recipe Box. |
| `meal_plan_entity` | `todo.meal_plan` | The to-do list behind the meal plan, including weekly repeating meals. **Settings → Menu Blocks → Menu to-do list** overrides it for the whole household once set. |
| `meal_templates_entity` | `todo.meal_plan_templates` | The list behind saved whole-week meal templates. |
| `suggestions_entity` | `todo.meal_suggestions` | The list behind Meal Suggestions. Created automatically if it's missing. |
| `reminders_entity` | `todo.family_reminders` | The shared Family Reminders list. Created automatically if it's missing, and the card tells the backend which list it uses so reminders still notify with no dashboard open. Each person's own reminders lists are set in their profile instead (Settings → Users). |
| `weather_entity` | `weather.forecast_home` | The daily high/low and icon in each day. **Settings → General → Weather entity** overrides it. |
| `birthdays_entity` | `calendar.birthdays` | If this calendar is one of your calendars, its events get a 🎂 in Month view and in the countdown banner. Events with "birthday" in the title get the 🎂 in the countdown too. |
| `fab_position` | `dashboard` | **+ button position**: the screen corner or this card's corner. See [All Cards](/docs/card-configuration#the--button-position). |
| `hide_fab` | `false` | **Hide the + button** on this placement of the card, for a display-only screen. Settings and Add Event stay reachable from any other placement. |
| `hide_top_bar` | `false` | **Hide the top bar** (Settings, view switch, arrows, Suggestions, Recipe Box, More) and the "jump to a week" row on this placement. Settings moves into the **+** button's menu. |
| `static_layout_across_devices` | `false` | **Static layout across devices**: normally each screen keeps its own view and layout (days shown, rows, Week/Planner/Agenda, timeline, top bar style). Turn this on to make every screen showing this card share one layout instead. |

The `title` option is accepted but not shown.

## What's set per screen, and what's shared

Fields marked **this device only** in Settings are saved on each screen (each browser, and each dashboard view on it), so a wall tablet and a phone can look different:

- Week button shows (Week, Planner or Agenda), Days shown, Rows shown, Current day first and its navigation step
- Month button shows (Month, or Month + Day)
- Show hours of the day (timeline)
- Name pills
- Calendar top bar style (Normal, Minimal, Hidden or Right Now), and the Right Now placement, size and contents
- This device's theme, when **Use global theme** is off

Admins can see and change every screen's values from **Settings → Devices** (or from Home Assistant entities: see [Automations & Entities](/docs/features/automations-and-entities)). Everything else in Settings is shared by the whole household.

## More than one placement

You can put the calendar card on several dashboards, or twice on one dashboard. Each placement keeps its own per-screen layout. A typical setup: the full card on the kitchen tablet, and a second placement with `hide_top_bar: true` and `hide_fab: true` as a clean wall display.

## Related cards

- [Family Today](/docs/cards/family-today) and [Right Now](/docs/cards/right-now) take their people, colors, lists and theme from this card automatically.
- The Recipe Box is also its own card: [Recipe Box](/docs/cards/recipe-box).
