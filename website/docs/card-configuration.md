---
title: Card Configuration
sidebar_position: 4
---


## Family Week Calendar card

Add the card to a dashboard view via YAML (or the visual editor's "manual
card" option):

```yaml
type: custom:family-week-calendar-card
title: Family Calendar
people:
  - entity: calendar.user
    name: User
    color: "#a9c6c2"
recipe_entity: todo.recipe_box
meal_plan_entity: todo.meal_plan
meal_templates_entity: todo.meal_plan_templates
suggestions_entity: todo.meal_suggestions
reminders_entity: todo.family_reminders
weather_entity: weather.forecast_home
```

| Option | Required | Default | Description |
|---|---|---|---|
| `people` | no | — (empty) | List of `{ entity, name, color }` calendars to show. Not required to get the card running - leave it out and add calendars live from in-card Settings → Calendars (including badges and notify devices) once the card is on a dashboard. |
| `recipe_entity` | no | `todo.recipe_box` | `todo` entity backing the Loved Dishes recipe box. |
| `meal_plan_entity` | no | `todo.meal_plan` | `todo` entity backing the meal planner (including recurring weekly meals). Can also be set (or auto-created) household-wide from in-card Settings → Menu Blocks → Menu to-do list, which overrides this YAML value once set - no dashboard edit needed. |
| `meal_templates_entity` | no | `todo.meal_plan_templates` | `todo` entity backing whole-week meal templates. |
| `suggestions_entity` | no | `todo.meal_suggestions` | `todo` entity backing the Meal Suggestions box. Auto-created the first time Family Hub finds it missing - no setup needed. |
| `reminders_entity` | no | `todo.family_reminders` | `todo` entity backing standalone reminders (Add Event modal's Reminder tab). Auto-created the first time Family Hub finds it missing; also settable (or re-pointed) household-wide from in-card Settings → General → Reminders, which overrides this YAML value once set. |
| `weather_entity` | no | `weather.forecast_home` | Entity used for the daily high/low + icon in each day column. |
| `birthdays_entity` | no | — | Optional. Point this at a calendar already listed under `people` to auto-tag its events with a 🎂 icon in Month view. Off by default - nothing is assumed. |
| `title` | no | `Family Calendar` | Card title (not currently rendered, reserved for future use). |

Everything else is configured from the ⚙️ **Settings** button on the card itself, and synced across every device automatically by the integration's own backend storage: which calendars show, their names/colors/badges/notify devices, meal block names/count, font sizes, every theme color, the timeline hour range, default view, countdown items and ticker, Daily Digest, whether meals show in Month view, scroll lock, and (v1.110.7+) the **+ button position**. The exceptions are the timeline toggle and the per-device Theme Selector pick.

**+ button position** (v1.110.7+, Settings → Calendars, next to "Dim
events/reminders that have already passed"): **Dashboard corner**
(default) pins the + button to the bottom-right of the whole screen, same
as every version before this one, stacked with any other Family Hub
card's own + button sharing the dashboard (see
[Notes](/docs/notes) below on the FAB-stacking coordinator). **This card's own
corner** instead anchors it to the bottom-right of THIS card's own box -
useful on a dashboard where this card shares a row/column with other
cards (a sections/grid layout, or cards placed side-by-side), so the
button sits under the card it actually belongs to instead of floating off
in a screen corner that may not even be near it.

## Chores, Rewards, Goals & My Chores cards

None of these need a `people`/entity list or any `todo`/`calendar` entities at all. Everything runs over Family Hub's own backend, and who's eligible is drawn from the members you've added under the calendar card's own Settings → Users tab. `title` is optional on all of them;
Chores/Rewards/Goals also each take an optional `fab_position` (v1.110.7+,
see below) for their own "+" button:

```yaml
type: custom:family-hub-chores-card
title: Chores
fab_position: dashboard # or "card" - see below
```

```yaml
type: custom:family-hub-rewards-card
title: Rewards
fab_position: dashboard # or "card" - see below
```

```yaml
type: custom:family-hub-goals-card
title: Goals
fab_position: dashboard # or "card" - see below
```

`family-hub-my-chores-card` is a smaller, single-person companion (handy
on a kid's own tablet/dashboard) showing just their own chores, goals, and
routines rather than the full multi-column board. It has no "+" FAB of
its own, so `fab_position` doesn't apply to it.

**`fab_position`** (`dashboard` default | `card`, v1.110.7+, also
available from each card's own visual editor as "+ button position"):
`dashboard` pins the card's "+" button to the bottom-right of the whole
screen (today's unchanged behavior), stacked with every other Family Hub
card's own FAB sharing the dashboard via the shared FAB-stacking
coordinator (see [Notes](/docs/notes) below). `card` instead anchors it to the
bottom-right of THIS card's own box - useful when this card shares a
row/column with other cards on a sections/grid dashboard, where a
screen-corner button would sit disconnected from wherever this
particular card actually landed. A card-relative FAB opts out of the
shared stacking slot (it's no longer sharing the screen corner with
anything), though it stays a member of the same coordinator for Goal-tab
de-duplication purposes (Chores/Rewards' own embedded Goal tab still
correctly suppresses the standalone Goals card's FAB either way).

## To-Do Lists card

See [To-Do Lists & Wish Lists](/docs/features/todo-lists-and-wishlists) for what the board can do (drag-and-drop between lists, Wish Lists with anonymous claiming, Grocy shopping-list support).

```yaml
type: custom:family-hub-todo-card
title: To-Do Lists
entities:
  - todo.groceries
  - todo.errands
include_grocy_shopping_lists: false
fab_position: dashboard # or "card" - see below
```

| Option | Required | Default | Description |
|---|---|---|---|
| `title` | no | `To-Do Lists` | Card title. |
| `entities` | no | `[]` | `todo.*` entities to show as columns (also pickable/persisted from the card's own Settings → Lists tab, which is the recommended way to manage this day to day; see the note in the changelog on why this card has a custom visual editor). |
| `include_grocy_shopping_lists` | no | `false` | Also show Grocy's own shopping list(s) as a column (which specific Grocy list(s) is chosen from Settings). |
| `fab_position` | no | `dashboard` | Same `dashboard`/`card` option as Chores/Rewards/Goals above (see that section's own description). |

## Screen Saver companion card

Only needed on a dashboard that doesn't otherwise have any Family Hub card on it. The Screen Saver itself is already shared automatically across any Family Hub cards already on a dashboard; see [Screen Saver](/docs/features/screen-saver) above.

```yaml
type: custom:family-hub-screensaver-card
title: Screen Saver
```

`return_dashboard_path` (optional) jumps to a chosen dashboard/view when
the screen saver is dismissed, instead of staying wherever it fell asleep.

## Recipe Box card

The Recipe Box ("Loved Dishes") as its own dashboard tab/card, for anyone
who'd rather have it pinned open than pop it up from the calendar card.
Same household-wide Recipe Box data, same behavior. It runs on the exact same shared code as the calendar card's own Recipe Box modal (see that card file's own module comment). Only an optional `title`:

```yaml
type: custom:family-hub-recipe-box-card
title: Recipe Box
```
