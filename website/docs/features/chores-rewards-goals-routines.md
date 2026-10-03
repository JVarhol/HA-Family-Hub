---
title: Chores, Rewards, Goals & Routines
sidebar_position: 4
---

A second board — separate `Chores`, `Rewards`, `Goals`, and `My Chores`
cards, all talking to their own backend, no calendar/todo entities needed
(see [Card configuration](/docs/card-configuration) below for how to add them).
Together they cover assignable chores with a star economy, a redeemable
rewards catalog, one-off goals, and daily routine checklists, all gated by
a granular per-person permissions system.

**Chores**
- **Assignment modes**: **Direct** (assign to one person), **Chore Bin**
  (an admin assigns it later), **Auto-rotation** (takes turns through an
  ordered rotation group), or **First come, first served** (anyone can
  self-claim it with a **Claim** button). Chore Bin and First-come-first-
  served chores both start out sitting in a shared **Chore Bin** column.
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
- **Due dates, reminders, overdue penalties, streaks**: an optional due
  date with configurable reminder lead times (the same 5m–1d choices as
  calendar-event reminders), an optional one-time star penalty applied if
  it goes overdue, and a 🔥 streak badge that grows with on-time approvals
  and resets on a late one.
- **Nudge button**: a one-tap 🔔 reminder push to whoever a chore is
  currently assigned to.
- **Waiting to Recur column**: an approved recurring/triggered chore moves
  into its own "↻ Waiting to Recur" column (collapsible to a small counter
  button) instead of sitting faded in someone's finished list.
- **The "+" FAB**: a tabbed create modal — **Chore**, **Goal**, and (when
  Routines is on) **Routine** — covers creating a chore, a goal, or
  managing someone's routine items, all from one button.

**Rewards**
- **Star economy**: stars are earned via chore/goal approval and spent by
  redeeming a catalog item; a balance can go negative (shown as "owes")
  rather than being blocked from spending.
- **Reward catalog**: title, star cost, an optional "what it's really
  worth" note (e.g. "$20" — purely cosmetic), an icon (a 58-emoji picker
  across 6 collapsible categories — Treats & Food, Screens & Games, Toys &
  Fun Stuff, Outings & Activities, Money & Prizes, Achievement & Fun), and
  a card color.
- **How it works**: **Redeem any time** (a plain logged redemption),
  **Stacks up** (e.g. allowance or TV time — each redemption adds a fixed
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
  overdue penalties, manual balance adjustments) is logged per person; a
  redemption can be **Reversed** (deletes the log entry and refunds the
  stars) or just **Cleared** (deletes it without a refund) by anyone with
  override authority.

**Goals**
- **What a goal is**: a one-off achievement for one specific person —
  title, target count (log progress that many times to complete it),
  optional due date, and a reward that's either a flat star payout or one
  specific item handed over straight from the Rewards catalog.
- **Progress & verification**: each **Log** (or **Mark done**, for a
  single-count goal) tap logs one occurrence; hitting the target sends it
  for approval the same way a chore does. **Approve** pays out the reward;
  **Send back** resets progress to zero for a genuine retry.
- **Standalone card, or embedded**: `Goals` is its own Lovelace card, and
  can also be shown right inside the Chores board (Settings → General →
  "Show Goals on the Chores board") and/or the Rewards page ("Show Goals
  on the Rewards page") — two independent toggles, both off by default.
  Either way, goals can also be created from a Goal tab on the Chores/
  Rewards "+" buttons.

**Routines**
- **Morning/Afternoon/Night checklists**: a per-person daily checklist
  shown as an accordion on their own Chores board column, reset back to
  unchecked every local midnight. No stars, no verification — checking an
  item off is open to anyone.
- **Card-style items with optional due times and days**: each item can
  carry a due time (shown as a badge, turns amber if it's overdue) and/or
  specific days of the week it applies to — leave the days blank for every
  day. The board only ever shows what's scheduled for today.
- **A real management modal**: adding, editing, and removing routine items
  happens from a **Routine** tab on the Chores board's "+" button — pick a
  person and a category, and manage every item for them regardless of
  which days it's scheduled (unlike the board itself, which is always
  today-only). The pencil icon on any routine item on the board jumps
  straight into this tab, pre-scoped to that exact item.
- **One household-wide switch**: Settings → General → "Routines" — off by
  default; once on, everyone gets the three checklist accordions on their
  own Chores column.

**Permissions**
- **Granted per-person** from Settings → **Permissions** (admin-only):
  **Can assign chores to others**, **Can approve/verify completed
  chores**, **Can mark any chore done (not just their own)**, **Can
  override reward star costs**, and **Can add rewards to the catalog with
  a star cost** (without it, their suggestions need approval first). A
  real Home Assistant admin account always has every permission
  implicitly.
- **What anyone can do with no grants at all**: claim an unclaimed chore
  from the Chore Bin, mark their own chore done, check off their own (or
  anyone's) routine items, log their own goal's progress, and suggest a
  new reward.
