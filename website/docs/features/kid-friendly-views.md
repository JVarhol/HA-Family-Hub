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

The setting decides: a card is either the kid view or the normal card, and
there's no switching back and forth on screen. For a screen grown-ups use too,
put a normal card on another dashboard (or another view).

## The same settings as the normal card

A kid view follows the card's own settings, the same as the normal card:

- **People on this card** picks who shows. With nobody picked, the Chores and
  Rewards kid views show the people with the **Child** account option
  (calendar Settings → Users → their profile), or everyone if nobody is marked.
- **The name pills** at the top narrow it down, the same way as on the normal
  card. On Rewards, a pill picks whose star jar is shown.
- **Grown-ups get rewards too.** On Rewards, a grown-up who's signed in (or
  logged in with their PIN on a shared screen) also gets a pill and a jar of
  their own, so they can get rewards for themselves. A shared kiosk login never
  does.
- **🔒 Login** is there for a shared screen, so a child can log in with their PIN.
- **The + button** follows the same rules as on the normal card.
- On Rewards, grown-ups who are allowed see **Manage stars** and **Manage
  catalog**. Manage catalog opens the full card while you're managing, and
  **Done managing** goes back to the kid view.

Permissions don't change in the kid view: a child can still only do what they
could do on the normal card.

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
- **Goals** (2026.11.2.11+): when the household shows goals on the Chores card
  (**Show goals in Chores**), each child's goals sit under their jobs with a
  progress bar and a big **+1** (or **I did it!**). One waiting to be checked
  shows ⏳ (a grown-up gets ✓ and ↩ to approve or send it back); one that's
  done gets 🎉.

  ![Goals under the jobs on the Chores kid view, with +1 and I did it!](/img/screenshots/kid-goals.webp)
- **The reward they're saving for** sits at the bottom of the column: the one
  they hearted on the Rewards card, or else the cheapest one they can't get
  yet.
- **Up for grabs** is the Chore Bin. **Mine!** asks which child is taking it.
  A child can take one for themselves; a grown-up can give it to anyone.
- **Grown-ups** is a small list of everyone else's chores, each with whose it
  is, so the kids can see the parents have jobs too. To give grown-ups a big
  column of their own instead (tiles, stars, streak, this week, the reward
  they're saving for), turn on **Kid-friendly view: show grown-ups like kids**
  in the card's settings (`kid_view_grownups: true`). They're then in the
  **Mine!** picker too, and in the one-at-a-time layout.
- **"2 waiting to be checked"** tells a grown-up something needs approving;
  approve it with 👍 on the tile.
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

- **Pick a child** with the name pills at the top. The card opens on whoever is
  signed in (or logged in with their PIN), grown-ups included.
- **The star jar**: their picture, name and stars to spend.
- **What can I get?** shows every reward that child can get as a picture tile
  (one set up for someone else only doesn't show). **Get it!** when
  they have enough, or "**6 more ⭐**" with a bar when they don't. **Get it!**
  asks first, so a bump doesn't spend their stars: **Use now** or **📦 Save it**
  for an everyday reward (2026.11.2+), **Yes, get it!** for the rest.
- **Saved for later**: a reward they saved shows "📦 2 saved" with **Use one**.
- **Tap a heart** to pick what they're saving for. It shows in the jar, and in
  their Chores column. Hearts are saved on that screen.
- **Goals** (2026.11.2.11+): with **Show goals in Rewards** on, the child's goals
  sit under the jar, the same way as on the Chores kid view.
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
- Linked GoWish and Amazon lists fold up into their own sections, so a long
  list doesn't bury the wishes they added themselves.
- **Double-tap the list's name** (or tap ⤢) to see it full screen.

## YAML

```yaml
type: custom:family-hub-chores-card
kid_view: true
layout: single           # optional: one child at a time
kid_view_grownups: true  # optional: grown-ups get a column like the kids
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
