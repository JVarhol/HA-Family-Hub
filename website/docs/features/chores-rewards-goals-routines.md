---
title: Chores, Rewards, Goals & Routines
sidebar_position: 4
---

A second board: separate `Chores`, `Rewards`, and `Goals`
cards, all talking to their own backend, no calendar/todo entities needed
(see the [Chores](/docs/cards/chores), [Rewards](/docs/cards/rewards) and [Goals](/docs/cards/goals) card pages for how to add them).
Together they cover assignable chores with a star economy, a redeemable
rewards catalog, one-off goals, and daily routine checklists, all gated by
a granular per-person permissions system.

![The Chores board: a column per person, the Chore Bin, and name pills across the top](/img/screenshots/chores.webp)

## Chores

- **Name pills** (v1.168.62+): colored pills across the top, one per
  person plus the Chore Bin, each with their number of open chores, just
  like the calendar's. Tap people to show only their columns (the rest
  dim); tap again to turn someone off; with nobody selected, everyone
  shows. Each tablet remembers its own choice, separately for each
  dashboard view.
- **People on this card** (v1.168.63+): choose in the card editor who
  appears on this card at all, so a kids' dashboard can show just the
  kids. See [Chores card](/docs/cards/chores).
- **Assignment modes**: **Direct** (assign to one person), **Chore Bin**
  (an admin assigns it later), **Auto-rotation** (takes turns through an
  ordered rotation group), or **First come, first served** (anyone can
  self-claim it with a **Claim** button). Chore Bin and First-come-first-
  served chores both start out sitting in a shared **Chore Bin** column.
- **Mark in progress**: an open chore has a **Mark in progress** button so
  everyone can see someone has started it; tap it again to clear it. It
  clears itself when the chore is done, sent back, reassigned or comes
  round again.
- **Compact view**: the ☰ button at the top of the board switches to a
  tighter layout for long lists (each tablet remembers its own choice).
- **Schedule**: the 📅 button at the top of the board shows when
  everything is due, week by week or for a month. See
  [Chore schedule](#chore-schedule) below.
- **Verification flow**: the assignee taps **Done**, sending it to
  "Awaiting approval"; anyone with verify permission taps **Approve** (pays
  out its star value, extends a 🔥 streak if it was on time) or **Reject**
  ("↩ Sent back", with an optional note, reopens it for a redo).
- **Recurrence, two independent ways**: a plain schedule (every N days, or
  specific days of the week) that reopens the chore once it's both
  approved and due again; and/or a sensor-driven auto-create trigger (an HA
  entity state change, e.g. "Dryer finished") that cycles it back to open
  on its own. A separate auto-complete trigger can also mark a chore done
  automatically from a sensor.
- **Dependencies, rotation groups, and notes**: a chore can require other
  chores be approved first, cycle through an ordered rotation group of
  people, and carry a free-text Notes field.
- **The chore form, field by field**: **Pick from library…**, **Title**,
  **Assignment mode** (buttons), **Assigned to** (Direct mode), **Star
  value**, **Due date**, reminder times and **Overdue penalty**, then three
  collapsible sections:
  - **Repeat**: a quick pick of **Does not repeat**, **Daily**, **Weekly on
    (that day)**, **Monthly on the (third Wednesday)**, **Every weekday
    (Monday to Friday)**, or **Custom…**: every N **days, weeks or
    months**; specific days of the week; or **a specific week each month**
    (the 1st, 2nd, 3rd, 4th or last chosen weekday, or the first weekend of
    the month). **Due … after it recurs** sets the new due time each time it
    comes round: immediately, or 1 hour up to 1 week after it recurs.
  - **Advanced Settings**: **❗ Mark as important** (always sorts to the
    top, with a ❗ badge); **📅 Show on the calendar on its due date** (see
    below); **Approval** (Requires approval / Doesn't require
    approval, which pays instantly and needs the Skip-approval permission);
    **Who hears this alarm** (for a timed chore: Just them, Them + kiosks or
    Everyone); **Quantity** ("3 loads of laundry": each Done counts one
    down and the chore shows how many are left); **Timer** (minutes: adds a
    **▶ Start** button and the chore finishes itself when time's up, see
    [Timers](/docs/features/timers)); **Notes**; **Depends on**; and
    **Rotation group** (in order).
  - **Automate**: an **Auto-create trigger** (an entity, an optional From
    state and a To state, like the dryer going from `on` to `off`) that
    reopens the chore, and an **Auto-complete trigger** (like the dishwasher
    door opening) that marks it done.
- **Chores on the calendar** (v1.168.89+): tick **📅 Show on the calendar
  on its due date** in a chore's Advanced Settings and, while it's open and
  has a due date, it shows on the Family Week Calendar on that day, like a
  reminder: with a 🧹 instead of a 🔔, in the color of whoever it's
  assigned to (Chore Bin chores in the reminder color). It shows in Week,
  Day, Month, Planner and Agenda. Tap it for who it's for, when it's due, its
  stars and notes, and **✅ Mark done**, which works exactly like Done on
  the Chores card (approval and all). It also shows in the **Family Today**
  card's Due Today list on its day, with a **Done** button. Once it's done, or waiting for
  approval, it leaves the calendar; a repeating chore comes back on its next
  due date. Privacy Mode hides it like a reminder. It's off by default, per
  chore, and it isn't counted on the Reminders pill.
- **Assign to multiple people**: in Direct mode, tick several people and
  everyone gets their own copy of the chore, with their own Done, approval
  and stars.
- **Due dates, reminders, overdue penalties, streaks**: an optional due
  date with configurable reminder lead times (the same 5m–1d choices as
  calendar-event reminders), an optional one-time star penalty applied if
  it goes overdue, and a 🔥 streak badge that grows with on-time approvals
  and resets on a late one.
- **Nudge button**: a one-tap 🔔 reminder push to whoever a chore is
  currently assigned to.
- **Sending a chore back**: **Send back** asks for an optional note ("the
  trash still had bags in it"), which they see on the chore. A chore can
  also be dragged back to the Chore Bin.
- **Ask for stars**: did something that isn't on the chore chart? Tap the
  Chores card's **+** button and pick the **Ask for stars** tab: say what you
  did and how many stars (1-100). Everyone in Family Hub gets the + button for
  this, even without permission to create chores. The request shows in your
  column as a **Star request** waiting for approval: anyone who can approve
  chores approves it (the stars are added) or rejects it (the request goes
  away). People with chore-assignment permission can also pick someone else
  under **For**. Turn the tab off per card with **Show "Ask for stars"**.
- **One column at a time**: for phones and small tablets, set the card's
  **Layout** to "One column at a time". Swipe left or right (or tap the
  arrows beside the name) to move between people; dots show where you are.
- **Stars next to names**: each person's star balance shows beside their
  name at the top of their column (turn off with **Show star balance next
  to names** in the card editor).
- **Waiting to Recur**: an approved recurring/triggered chore moves into
  its own "↻ Waiting to Recur" column instead of sitting faded in
  someone's finished list. It has its own pill (with its count) at the end
  of the pill row, so you can show or hide it like anyone else's column.
  The card editor's **Show Waiting to Recur** switch leaves it off a card
  entirely.

![Only Emma and Leo selected; the other pills are dimmed](/img/screenshots/chores-filtered.webp)
- **Libraries to pick from** (v1.168.88+): the Chore tab, the Routine tab and the
  New Reward form each start with **Pick from library…**, a list of common
  chores, routines or rewards that fills in the title, stars (or cost) and icon
  for you. Each household can change its own lists with the ✎ button next to
  the picker: add items, rename them, change stars or icons, remove them, or
  **Add back removed built-in items** (your own items and changes stay). Changes save as you go and everyone picks from the
  same lists. Who can edit: admins, plus anyone who can assign chores (Chores
  library), add or override rewards (Rewards library), or assign chores or
  manage anyone's routines (Routines library).
- **The "+" FAB**: a tabbed create modal, **Chore**, **Goal**, and (when Routines is on) **Routine**. It covers creating a chore, a goal, or managing someone's routine items, all from one button.

- **Chores in Home Assistant's to-do lists** (v1.168.88+): everyone in
  the household gets their own list, like **Emma Chores**
  (`todo.emma_chores`), made automatically; so does anyone a chore is
  assigned to. A person's list shows the chores assigned to them. Chores
  nobody has yet (the Chore Bin, or ones sent back to it) are on the
  **Family Hub Chores** list. The lists sync both ways: add an item to give
  that person a chore, tick it off to mark it done (it shows as done with
  "Waiting for approval" until approved), rename it or delete it.

### Chore schedule

The **📅** button at the top of the Chores card (v1.168.89+) swaps the board for an overview of when every chore is due, so you can look ahead and spread the work out. Tap it again to go back to the board. Each screen remembers which one it shows.

- **This week**, **Next week** and **Month** tabs, with **‹ ›** to step back or forward a week (or a month) at a time. Weeks start on the day you picked in your Home Assistant profile (**First day of the week**), like the calendar.
- **Week**: one row per day with each chore due that day: a dot in the person's color, the time, the chore, who it's for and its stars. Today is outlined.
- **Month**: a grid with the chores on each day (on a phone, a count). A day with something overdue has a red date. Tap a day to list its chores under the grid.
- **Repeating chores show ahead.** A chore that repeats every few days, on set weekdays, or on the "first Saturday" of the month shows on each day it will come round, assuming each one is done on its day. These are **faded**, since the dates move if one is done late. Auto-rotation chores show whose turn each one will be (marked **↻**). Chores that come round from a sensor (Automate) can't be predicted, so only the current one shows.
- **Badges**: **Overdue** (red), **Waiting for approval**, and **✓ Done** for chores already done in that week.
- **Summary** at the top: how many are left to do, overdue, waiting for approval and done, and the stars still to earn.
- **No due date**: open chores without a due date are listed at the bottom, so nothing is missed.
- The **name pills** and the card's **People on this card** setting narrow the schedule the same way they narrow the board, so a kid's dashboard shows only their chores.
- **Tap a chore** to open its details (and **Edit**, if you're allowed). A projected repeat opens the chore as it is now.
- Star requests aren't shown. It updates whenever a chore changes.

## Just me (replaces My Chores)


<img src="/HA-Family-Hub/img/screenshots/chores-just-me.webp" alt="The Chores card set to Just me on a phone: your own chores and the Chore Bin" width="320" />

- Set **People on this card** to **Just me** (plus the Chore Bin, if you
  like) and the Chores card shows only whoever is signed in: a personal
  view for a phone or a kid's own dashboard. On a shared kiosk tablet it
  follows whoever logs in with their PIN, and switches back when they log
  out.
- A login that isn't on the card (a kiosk account before anyone logs in, a
  guest) sees just the Chore Bin, or a short "sign in to see yours" note:
  never everyone's chores.
- **The old My Chores card is deprecated** (v1.168.66). Dashboards edited
  in the UI are switched over automatically on the next restart: each My
  Chores card becomes a Chores card set to Just me + Chore Bin, with its
  title and theme kept, and Home Assistant shows a one-time notification
  listing the dashboards that changed. YAML dashboards keep working too:
  `custom:family-hub-my-chores-card` now simply shows that same Chores
  card. It's no longer offered when adding a card.

## Rewards


![The Rewards card: name pills with star balances, each person's balance, and the reward catalog](/img/screenshots/rewards.webp)

- **Name pills** (v1.168.62+): one per person with their star balance.
  Selecting people narrows balances, goals, suggestions, pending rewards
  and history to just them; the reward catalog always shows in full. The
  card editor's **People on this card** option works here too, including
  **Just me**: a personal "my stars" card that follows whoever is signed
  in (or PIN-logged-in on a kiosk).
- **Star economy**: stars are earned via chore/goal approval and spent by
  redeeming a catalog item; a balance can go negative (shown as "owes")
  rather than being blocked from spending.
- **Reward catalog**: title, star cost, an optional "what it's really
  worth" note (e.g. "$20", purely cosmetic), an icon (a 58-emoji picker
  across 6 collapsible categories (Treats & Food, Screens & Games, Toys &
  Fun Stuff, Outings & Activities, Money & Prizes, Achievement & Fun), and
  a card color.
- **How it works**: **Redeem any time** (a plain logged redemption),
  **Stacks up** (e.g. allowance or TV time: each redemption adds a fixed
  amount to a running per-person bank instead of being a one-off, spent
  down later via a separate **Use** action), or **One-time** (the catalog
  item deletes itself after its first use).
- **Requires fulfillment**: an optional checkbox ("needs a parent to mark
  it done before it counts", e.g. cash allowance) that holds a redemption
  as pending until someone with pricing authority marks it done.
- **Suggestions**: anyone without pricing authority can suggest a new
  reward with no cost set; it waits in **Suggested Rewards** until someone
  prices and approves (or rejects) it.
- **History**: every star change (chore/goal payouts, redemptions,
  overdue penalties, manual balance adjustments, gifts) is logged per
  person; a redemption can be **Reversed** (deletes the log entry and
  refunds the stars) or just **Cleared** (deletes it without a refund) by
  anyone with override authority.
- **Manage stars**: add or subtract stars for anyone, with an optional
  reason ("Grandma gave a bonus", "was rude at dinner"). Needs **Override
  star costs**.
- **Gift stars**: anyone can give some of their own stars to someone else
  with the 🎁 on that person's balance.
- **Reward timers**: give a reward a timer in minutes ("120" for two hours
  of gaming) and using it starts a countdown, with a notification when time's
  up. One reward timer runs at a time per person. See
  [Timers](/docs/features/timers).
- **Wish-list rewards**: a wish-list item can be tied to a one-time reward,
  so it shows in the catalog with a star cost. Claiming it from either
  place removes it from both. See
  [Wish Lists](/docs/features/todo-lists-and-wishlists#wish-lists).
- **Stacks up rewards**: the catalog shows each person's banked amount
  ("Banked: 3 hours"). **Use** asks how much to spend now.

## Goals

- **What a goal is**: a one-off achievement for one specific person: title, target count (log progress that many times to complete it),
  optional due date, and a reward that's either a flat star payout or one
  specific item handed over straight from the Rewards catalog.
- **Progress & verification**: each **Log** (or **Mark done**, for a
  single-count goal) tap logs one occurrence; hitting the target sends it
  for approval the same way a chore does. **Approve** pays out the reward;
  **Send back** resets progress to zero for a genuine retry.
- **Standalone card, or embedded**: `Goals` is its own card, and can also
  show inside other cards: Settings → General → Chores, Rewards & Routines
  → **Show Goals on**: **None**, **Chores page** (in each person's column,
  with Log/Approve/Send back right there), **Rewards page**, or **Both**.
  Goals can also be created from the Goal tab on the Chores and Rewards
  **+** buttons.

## Routines

- **Morning/Afternoon/Night checklists**: a per-person daily checklist
  shown as an accordion on their own Chores board column, reset back to
  unchecked every local midnight. No stars, no verification: checking an
  item off is open to anyone.
- **Card-style items with optional due times and days**: each item can
  carry a due time (shown as a badge, turns amber if it's overdue) and/or
  specific days of the week it applies to (leave the days blank for every
  day). The board only ever shows what's scheduled for today.
- **A real management modal**: adding, editing, and removing routine items
  happens from a **Routine** tab on the Chores board's "+" button. Pick a
  person and a category, and manage every item for them regardless of
  which days it's scheduled (unlike the board itself, which is always
  today-only). The pencil icon on any routine item on the board jumps
  straight into this tab, pre-scoped to that exact item.
- **Stars and approval for routine items** (optional): give an item a star
  value and checking it off earns those stars. By default it then waits for
  approval like a chore; tick **Doesn't require approval** to pay the stars
  the moment it's checked.
- **Auto-complete trigger**: an item can tick itself off from a sensor
  ("Dishwasher opened"), the same way chores can.
- **Library and reordering**: start an item from **Pick from library…**,
  and drag items to reorder them in the Routine tab.
- **Automations**: finishing a routine, or checking an item, fires an event
  and a device trigger. See [Automations & Entities](/docs/features/automations-and-entities#device-triggers-for-routines).
- **One household-wide switch**: Settings → General → "Routines", off by
  default; once on, everyone gets the three checklist accordions on their
  own Chores column.

## Permissions

- **Granted per person** in Settings → Users → their profile →
  **Permissions** (admins only). There are 15, in groups for Chores,
  Rewards, Menu, Wish Lists, Calendar, Routines and Privacy; the full
  list with what each one allows is in
  [Settings → Member profiles](/docs/settings-modal#member-profiles). A
  real Home Assistant admin account always has every permission.
- **What anyone can do with no grants at all**: claim an unclaimed chore
  from the Chore Bin, mark their own chore done, check off routine items,
  log their own goal's progress, suggest a new reward, ask for stars, and
  gift their own stars.

## Automations

- Chores can be created, completed, approved, sent back and nudged from
  Home Assistant actions, and every change fires an event. See
  [Automations & Entities](/docs/features/automations-and-entities).
