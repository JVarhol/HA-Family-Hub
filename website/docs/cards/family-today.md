---
title: Family Today
description: A small single-day card for phones and dashboard corners - today's events, meals and reminders.
---

A small companion to the calendar: just today. It shows today's events, today's meals and the reminders due today, for a phone or the corner of any dashboard.

<img src="/HA-Family-Hub/img/screenshots/today-card.webp" alt="The Family Today card" width="360" />

It takes everything from your Family Week Calendar card: the people and their colors, the meal plan, the reminders lists, the weather, the theme and the categories. A new Today card needs only a title.

## YAML

```yaml
type: custom:family-today-card
title: Today
layout: sectioned   # or "compact"
show_add_button: false
calendar_dashboard_path: /lovelace-family/0
calendar_button_label: Open calendar
```

## Options

| Option | Default | Description |
|---|---|---|
| `title` | `Today` | Card title. |
| `layout` | `sectioned` | `sectioned` shows three labeled lists: **Today's Events**, **Today's Meals** and **Due Today**. `compact` mixes them into one list in time order, like Month view's day panel. |
| `show_add_button` | `false` | **Show an Add button** for new events and reminders. It opens the same New Event / New Reminder form as the calendar (calendar, title, all day or start/end time, end date for multi-day events, location, notes, reminder chips, and for a reminder, which list it goes on). |
| `calendar_dashboard_path` | none | A relative dashboard path like `/lovelace-family/0`. When set, the card shows a **Go to Calendar** button that opens it. |
| `calendar_button_label` | **Go to Calendar** | The label for that button. |
| `meal_plan_entity`, `reminders_entity`, `weather_entity` | the calendar card's | Under **Advanced** in the visual editor. Only for pointing this card at different lists than the calendar uses. Leave them out otherwise. |
| `theme_override` | device theme | Pin this card to one theme. |

## Using it

- **Tap anything** to see its details: an event's time, location and notes, a meal's notes and recipe link, or a reminder with a **Mark done** button. Marking a repeating reminder done moves it to its next date.
- **Chores** that have **Show on the calendar** ticked show in Due Today on their due date, with a 🧹 and a **Done** button that marks the chore done (approval still applies). Chore Bin chores show without Done; grab them on the Chores card.
- **Holidays** from a holiday calendar show as small chips next to the date instead of as events.
- **Reminders** are the ones the signed-in person sees on the calendar: the shared Family Reminders list, their own lists, and anyone else's lists they've chosen to see (Settings → Users → their profile → Lists).
- **Privacy Mode and Discreet Mode** only cover the calendar and Right Now cards. The Today card keeps showing everything, so leave it off shared screens that should go private.
