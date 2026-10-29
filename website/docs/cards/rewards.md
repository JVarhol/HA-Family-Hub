---
title: Rewards
description: Star balances, the reward catalog, suggestions, pending rewards and history.
---

Everyone's star balance, the **Reward catalog**, **Suggested rewards**, **Pending rewards** and **Recent redemptions**, with each person's goals too if Settings puts them here.

![The Rewards card: name pills with star balances, each person's balance, and the reward catalog](/img/screenshots/rewards.webp)

How stars, the catalog and redemptions work is in [Chores, Rewards, Goals & Routines](/docs/features/chores-rewards-goals-routines#rewards).

## YAML

```yaml
type: custom:family-hub-rewards-card
title: Rewards
people: []               # everyone
fab_position: dashboard  # or "card"
```

A personal "my stars" card:

```yaml
type: custom:family-hub-rewards-card
title: My Stars
people:
  - me
```

## Options

| Option | Default | Description |
|---|---|---|
| `title` | `Rewards` | Card title. |
| `people` | `[]` (everyone) | **People on this card**: Home Assistant user IDs, or `me` for whoever is signed in. Balances, goals, suggestions, pending rewards and history follow it; the catalog always shows in full. |
| `fab_position` | `dashboard` | **+ button position**. See [All Cards](/docs/card-configuration#the--button-position). |
| `theme_override` | device theme | Pin this card to one theme. |

## On the card

- **Name pills** with each person's balance. Tap people to narrow the card to them.
- **On each balance**: tap the name for that person's full **star history**; **🎁** gifts some of your own stars to them (anyone can, to anyone but themselves); **✎** adds or subtracts their stars (if you can override star costs).
- **⭐ Manage stars** (header, if you can override star costs): add or subtract stars for anyone with an optional reason ("Grandma gave a bonus"), with quick amounts or a custom one, and a link to their history.
- **Manage catalog** (header): switches the catalog into edit mode to change or delete rewards; **Done managing** switches back.
- **Redeem** a reward from the catalog. A reward with a **timer** starts a countdown when you use it (one reward timer per person at a time), and shows a ⏱ badge and a **Stop** button while it runs.
- **🔒 Login** on a shared kiosk, the same as the Chores card: log in with your Kiosk PIN to redeem your own rewards.
- **+ button**: **Add a reward** (or **Suggest a reward** if you can't set prices), and a Goal tab.
