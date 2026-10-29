---
title: Right Now
description: Who's home, what everyone is doing right now, and what's next.
---

The live "what's going on" view: the time and weather, then a tile for each person with Home/Away, what they're doing right now (with a progress bar until it ends, or **Free**), and what's next. Small sensor pills, like a phone's battery, sit on each tile.

![The Right Now card](/img/screenshots/right-now-card.webp)

The same view can also run as a bar across the top or down the side of the calendar card. See [The Right Now bar](/docs/features/calendar-and-layout#the-right-now-bar).

## YAML

```yaml
type: custom:family-right-now-card
title: Right Now
weather_entity: weather.forecast_home
show_clock: true
show_weather: true
calendar_dashboard_path: /lovelace-family/0
```

## Options

| Option | Default | Description |
|---|---|---|
| `title` | `Right Now` | Card title. Left as `Right Now` (or empty), it's translated into each person's language. |
| `people_entities` | everyone | **People to show**, by their own calendar (`calendar.*`). The visual editor lists people by name. Leave it empty to show everyone. |
| `weather_entity` | `weather.forecast_home` | Weather in the header: the current temperature and today's high/low. |
| `show_clock` | `true` | **Show the clock/date.** |
| `show_weather` | `true` | **Show the weather.** Turn it off if the dashboard already shows the weather. |
| `calendar_dashboard_path` | none | A relative dashboard path. Adds **Go to Calendar** to the card's ⋮ menu. |
| `calendar_button_label` | **Go to Calendar** | The label for that menu item. |
| `theme_override` | device theme | Pin this card to one theme. |

## Who gets a tile

Since v1.168.88 the tiles are **people, not calendars**: everyone added under Settings → Users who has their own calendar, showing that calendar plus any extra calendars they have. A shared calendar like Family or Holidays isn't a person, so it doesn't get a tile. Before anyone is linked to a calendar, the card shows the calendars instead.

## Presence and sensor pills

Both are set per person in **Settings → Users → their profile → Presence & sensors**:

- **Presence**: a `person.*` or `device_tracker.*` entity. The tile shows a Home or Away pill. Leave it blank for no pill.
- **Other sensors & switches**: any entity at all, like a phone's battery, a door left open, or a light. Each shows as a small pill. Tapping a switch or light pill toggles it; tapping anything else opens its Home Assistant details.

**Discreet Mode** (Settings → Developer tools) shows people as "Person 1", "Person 2" and hides event names here too.
