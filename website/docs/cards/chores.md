---
title: Chores
description: The chore board - a column per person, the Chore Bin, routines, and star requests.
---

The chore board: a column for each person, the shared **Chore Bin**, a **Waiting to Recur** column, and each person's Morning/Afternoon/Night **routines**. Everything runs on Family Hub's own storage; no entities to set up.

![The Chores board: a column per person, the Chore Bin, and name pills across the top](/img/screenshots/chores.webp)

How chores, approval, recurrence, routines and stars work is covered in [Chores, Rewards, Goals & Routines](/docs/features/chores-rewards-goals-routines). This page is the card itself.

## YAML

```yaml
type: custom:family-hub-chores-card
title: Chores
people: []                 # everyone
layout: columns            # or "single"
show_stars: true
show_waiting_to_recur: true
allow_star_requests: true
fab_position: dashboard    # or "card"
```

## Options

| Option | Default | Description |
|---|---|---|
| `title` | `Chores` | Card title. |
| `people` | `[]` (everyone) | **People on this card**: Home Assistant user IDs, `me` (whoever is signed in) and `chore_bin` (the Chore Bin column). If none of the listed people exist any more, the card shows everyone instead of going blank (except with `me`, which never shows everyone). |
| `layout` | `columns` | `columns` shows everyone side by side. `single` (**One column at a time**) suits phones: swipe left or right, or tap the arrows beside the name, to move between people. Dots show where you are. |
| `show_stars` | `true` | **Show star balance next to names** in each column header. |
| `show_waiting_to_recur` | `true` | **Show Waiting to Recur**: the pill and column for approved recurring chores waiting for their next date. |
| `allow_star_requests` | `true` | **Show "Ask for stars"**: the tab in the **+** button's pop-up for asking for stars for something that isn't on the chart. People who can't create chores still get the **+** button for this. |
| `fab_position` | `dashboard` | **+ button position**. See [All Cards](/docs/card-configuration#the--button-position). |
| `theme_override` | device theme | Pin this card to one theme. |

## Example cards

A personal card for a phone, following whoever is signed in (or PIN-logged-in on a kiosk):

```yaml
type: custom:family-hub-chores-card
title: My Chores
people:
  - me
  - chore_bin
show_waiting_to_recur: false
layout: single
```

A kids-only board:

```yaml
type: custom:family-hub-chores-card
title: Kids' chores
people:
  - 0a1b2c3d4e5f...   # Emma's Home Assistant user ID
  - 9f8e7d6c5b4a...   # Leo's
  - chore_bin
```

The visual editor lists people by name, so you don't need to look up IDs.

## On the card

- **Name pills** across the top, one per person plus the Chore Bin and Waiting to Recur, each with a count. Tap people to show only their columns; tap again to turn them off. Each screen remembers its choice, separately for each dashboard view.
- **☰ Compact view**: a tighter layout for long lists. Each screen remembers it.
- **📅 Schedule**: swaps the board for an overview of when every chore is due, **This week**, **Next week** or a **Month**, with repeating chores shown ahead. See [Chore schedule](/docs/features/chores-rewards-goals-routines#chore-schedule). Each screen remembers it.
- **Rewards column**: a button in the header shows or hides a Rewards column with everyone's balances and the catalog, right on the chore board. This one is shared by the whole household.
- **Drag an open chore** onto someone else's column (or the Chore Bin) to reassign it, if you can assign chores. Routine items are reordered by dragging them in the **+** button's Routine tab.
- **🔒 Login** (on a shared kiosk): pick your name and enter your Kiosk PIN to use the board as yourself: mark your own chores done, or approve others' if you have that permission. It logs out after 45 seconds of no taps. An admin turns this on per person under Settings → Users → **Kiosk PIN login**.
- **+ button**: a **New** pop-up with tabs for **Chore**, **Goal**, **Routine** (when Routines is on) and **Ask for stars**. You only see the tabs you're allowed to use.
- **Confetti** when a chore is done, if it's turned on in Settings → General → Chores, Rewards & Routines.

<img src="/HA-Family-Hub/img/screenshots/chores-just-me.webp" alt="The Chores card set to Just me on a phone" width="320" />

## The old My Chores card

`custom:family-hub-my-chores-card` is deprecated since v1.168.66. It now simply shows a Chores card set to `people: [me, chore_bin]`. Dashboards edited in the UI were switched over automatically, with a one-time notification listing what changed. It's no longer offered when adding a card.
