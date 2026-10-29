---
title: Goals
description: One-off goals for one person, with progress, approval and a reward.
---

A board of everyone's goals: one-off achievements for one person ("Read 10 books", "Get 3 Bs in math"), each with a target count, an optional due date and a reward. How goals work is in [Chores, Rewards, Goals & Routines](/docs/features/chores-rewards-goals-routines#goals).

Goals can also show inside the Chores or Rewards card instead (Settings → General → **Show Goals on**), so you may not need this card at all.

## YAML

```yaml
type: custom:family-hub-goals-card
title: Goals
fab_position: dashboard  # or "card"
```

## Options

| Option | Default | Description |
|---|---|---|
| `title` | `Goals` | Card title. |
| `fab_position` | `dashboard` | **+ button position**. When a Chores or Rewards card on the same dashboard already has a Goal tab on its **+** button, this card's own **+** button hides so there's only one. |
| `theme_override` | device theme | Pin this card to one theme. |

## On the card

- **Log** (or **Mark done** for a single-count goal) adds one to the count. Reaching the target sends it for approval.
- **Approve** pays the reward. **Send back** (with an optional note) resets the count to zero for a real retry.
- **✎** edits a goal: title, who it's for, target count, due date, and the reward (a number of stars, or one specific item from the Rewards catalog).
