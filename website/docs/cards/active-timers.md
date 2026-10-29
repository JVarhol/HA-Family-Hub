---
title: Active Timers
description: Every timer running in the house on one card, plus quick timers.
---

Every timer running in the house on one board: chore timers, reward timers and quick household timers, each tinted in the color of whoever it belongs to (house timers are grey). Live countdowns, soonest first, with a ✕ to stop one.

How timers, alarms, speakers and the timer log work is in [Timers](/docs/features/timers).

## YAML

```yaml
type: custom:family-hub-active-timers-card
title: Active Timers
```

## Options

| Option | Default | Description |
|---|---|---|
| `title` | `Active Timers` | Card title. |
| `theme_override` | device theme | Pin this card to one theme. |

## Starting a timer

**＋ Start Timer** opens a small pop-up:

- One-tap **5m / 15m / 30m / 1h**, or **Or a custom length**.
- **What's it for?** (optional): "Oven", "Sam's turn".
- **Assign to** (optional): that person's timer, in their color. **Nobody - just a house timer** means anyone can stop it.
- **Who hears this alarm** and **Ring on these speakers** (optional).

Timers keep running with every dashboard closed, because they live in Family Hub itself.
