---
title: Kid-Friendly Views
sidebar_position: 12
---

The Chores, Rewards and To-Do Lists cards each have a **Kid-friendly view**
(2026.11.1+): big pictures, big buttons and very few words, so a child can
use the kitchen tablet on their own. Turn it on in the card's settings (the
pencil when editing the dashboard), or add `kid_view: true` to the card's
YAML. Each card switches on its own, so the kids' tablet can use kid views
while the parents' phones keep the normal cards.

## Who counts as a kid

People with the **Child** account option (calendar Settings → Users → their profile) get
the big kid layout. If nobody is marked, everyone on the card gets it.

## Grown-ups button

Every kid view has a **🔒 Grown-ups** button at the top. It switches that
screen back to the normal card, for editing, approving and managing. After
10 minutes without a tap it goes back to the kid view on its own, or tap
**🧒 Kid view** to go back straight away. Permissions don't change in the kid
view: a child can still only do what they could do on the normal card.

## Chores

![The kid view of the Chores card: a column for Emma and Leo with big chore tiles, star counts, streaks and the next reward](/img/screenshots/kid-chores.webp)

- **A column per child** with their picture, star count and streak
  ("🔥 4 days in a row!").
- **"1 of 3 done"** with a bar that fills as they go.
- **Big tiles with a picture** chosen from the chore's name (🐱 for
  "Feed the cat", 🍽️ for the dishwasher, and so on). Tap the big round
  button when it's done.
- Done chores turn green with a **+3 ⭐** stamp. A chore that needs approval
  shows **Checking…** until a grown-up approves it (they can approve straight
  from the tile with 👍).
- Timed chores get a ▶ button that starts the timer.
- **The reward they're saving for** sits at the bottom of the column: the one
  they hearted on the Rewards card, or else the cheapest one they can't get
  yet.
- **Up for grabs** is the Chore Bin. **Mine!** asks which child is taking it.
  A child can take one for themselves; a grown-up can give it to anyone.
- **Grown-ups** is a small list of everyone else's chores, so the kids can see
  the parents have jobs too.
- Morning, afternoon and night routines show under the chores.
- **This week** is a row of 7 days under the progress bar. Days gone by show
  the stars they earned that day, today shows "1 of 3", and days ahead show how
  many jobs are coming. Tap a day to see what they did or what's coming, and
  **Back to today** to return. Only today's chores can be ticked off.

### One child at a time

With the card's **Layout** set to **One column at a time** (`layout: single`),
the kid view shows one child at a time, full width, which suits phones and
small tablets. Tap a child's picture at the top, use the arrows, or swipe left
or right to switch. Up for grabs and the Grown-ups list sit underneath. It
opens on whoever is signed in, if they're one of the kids.

<img src="/HA-Family-Hub/img/screenshots/kid-chores-single.webp" alt="The kid view one child at a time on a phone: Emma's column with the week row, a day ahead picked, and pictures to switch to Leo" width="360" />

## Rewards

![The kid view of the Rewards card: Leo's star jar, what he's saving for, and a picture shop of rewards](/img/screenshots/kid-rewards.webp)

- **Pick a child** at the top. The card opens on whoever is signed in (or
  logged in with their PIN).
- **The star jar**: their picture, name and stars to spend.
- **What can I get?** shows every reward as a picture tile. **Get it!** when
  they have enough, or "**6 more ⭐**" with a bar when they don't. **Get it!**
  asks **Yes, get it!** before spending, so a bump doesn't spend their stars.
- **Tap a heart** to pick what they're saving for. It shows in the jar, and in
  their Chores column. Hearts are saved on that screen.
- **Waiting for a grown-up** lists rewards that need a grown-up to happen,
  like a trip for ice cream.
- **Leo got** shows the last few rewards they've had.
- On a shared tablet, a child gets a reward for themselves by logging in with
  their PIN. A grown-up who can manage stars can get one for any child.

## Wish lists

![The kid view of a wish list: picture tiles with hearts, Most wanted, a birthday countdown and Add a wish](/img/screenshots/kid-wishlist.webp)

On the To-Do Lists card, the kid view only changes **wish lists**. Other lists
stay as they are.

- **Big picture tiles** for every wish, from the photo you added or the
  linked GoWish or Amazon list.
- **1 to 3 hearts** for how much they want it: Would be nice, Really want,
  Really, really want. The top one is marked **Most wanted**. Grown-ups see
  the hearts on the normal list too.
- **No prices and no claims** anywhere in the kid view, whoever is looking, so
  the surprise is safe on any screen.
- **🎂 Birthday in 12 days!** shows when there's a countdown with their name
  and "birthday" in it (a custom countdown item in Settings → General → Countdown).
- **Add a wish** opens the add pop-up with their list already picked.

## YAML

```yaml
type: custom:family-hub-chores-card
kid_view: true
layout: single   # optional: one child at a time
```

```yaml
type: custom:family-hub-rewards-card
kid_view: true
```

```yaml
type: custom:family-hub-todo-card
entities:
  - todo.emma_wish_list
kid_view: true
```
