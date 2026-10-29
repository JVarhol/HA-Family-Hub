---
title: All Cards
sidebar_label: All Cards
description: Every Family Hub card, what it's for, and the options every card shares.
---

Family Hub ships **12 dashboard cards**. Add any of them from **Edit dashboard → Add card** and search "Family", or paste the YAML from each card's page. Every card has a visual editor, so YAML is optional.

| Card | Type | What it's for |
|---|---|---|
| [Family Week Calendar](/docs/cards/family-week-calendar) | `custom:family-week-calendar-card` | The main card: Week/Month/Planner/Agenda calendar, meals, reminders, and **⚙️ Settings for all of Family Hub** |
| [Family Today](/docs/cards/family-today) | `custom:family-today-card` | Today's events, meals and reminders, for a phone or a corner of any dashboard |
| [Right Now](/docs/cards/right-now) | `custom:family-right-now-card` | Who's home, what everyone is doing now, and what's next |
| [Chores](/docs/cards/chores) | `custom:family-hub-chores-card` | The chore board, the Chore Bin, routines and star requests |
| [Rewards](/docs/cards/rewards) | `custom:family-hub-rewards-card` | Star balances, the reward catalog, suggestions and history |
| [Goals](/docs/cards/goals) | `custom:family-hub-goals-card` | One-off goals with progress and a reward |
| [To-Do Lists](/docs/cards/todo-lists) | `custom:family-hub-todo-card` | Your Home Assistant to-do lists as columns, wish lists, Grocy shopping lists |
| [Recipe Box](/docs/cards/recipe-box) | `custom:family-hub-recipe-box-card` | The Recipe Box ("Loved Dishes") pinned open as its own card |
| [My Pantry](/docs/cards/my-pantry) | `custom:family-hub-pantry-card` | Grocy stock, plus anything else you want to keep an eye on |
| [Active Timers](/docs/cards/active-timers) | `custom:family-hub-active-timers-card` | Every timer running in the house, and quick timers |
| [Screen Saver](/docs/cards/screen-saver) | `custom:family-hub-screensaver-card` | Brings the screen saver to a dashboard with no other Family Hub card |
| [Theme Selector](/docs/cards/theme-selector) | `custom:theme-selector-card` | A small gear that picks this device's theme |

:::tip Start with the calendar
Settings for the whole household live behind the **⚙️** on the **Family Week Calendar** card, and it's the only place to change them. Add that card first, even on a dashboard you don't use much.
:::

## Options every card shares

| Option | Cards | Default | Description |
|---|---|---|---|
| `title` | all | the card's name | Card title. Left at its default, it's translated into each person's Home Assistant language. |
| `theme_override` | all except the calendar and Theme Selector | device theme | Pin this one card to a theme, whatever the device or household uses. In the visual editor: **Theme** → "Use device settings (default)" or any theme. |
| `fab_position` | Calendar, Chores, Rewards, Goals, To-Do Lists | `dashboard` | Where the card's **+** button sits. See below. |

### The + button position

`dashboard` (the default) pins the card's **+** button to the bottom-right corner of the screen. When several Family Hub cards share a dashboard, their buttons stack neatly in that corner instead of sitting on top of each other.

`card` anchors the button to the bottom-right of **this card's own box** instead. Use it on a sections or grid dashboard where the card shares a row with other cards, so the button sits under the card it belongs to. A card-corner button leaves the shared stack, but the Chores and Rewards cards still hide the standalone Goals card's button when they already offer a Goal tab.

The calendar card can also hide its button entirely with `hide_fab` (see [Family Week Calendar](/docs/cards/family-week-calendar)).

### Where card data lives

Most cards need no entities at all. Chores, Rewards, Goals, Routines, timers and the pantry's extra items all live in Family Hub's own storage. The calendar, Today and Recipe Box cards read and write Home Assistant `todo` lists (meal plan, reminders, recipes), and Family Hub creates the ones it needs automatically. See [Requirements](/docs/requirements).

Cards on a dashboard refresh their data every 60 seconds while they're open, and right away for changes made on that same screen.
