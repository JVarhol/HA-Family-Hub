---
title: Changelog Archive
sidebar_position: 10
---

This file holds the older half of `README.md`'s `## Changelog` section — everything **older than v138 (1.103.0)** — split out on 2026-09-16 to keep the live `README.md` shorter. Nothing here was rewritten; it's the original entries verbatim.

See `README.md` for the current feature docs and the live changelog from v138 (1.103.0) onward.

## Changelog (archived — v137.1 and older)

- **v137.1 (1.102.1)** — Bugfix: the Routine tab's Person dropdown used to
  default to whichever family member happened to be listed first, with
  nothing on screen saying so — easy to add an item, not notice the default
  person wasn't who you meant, and have it seem to vanish onto someone
  else's board column. It now defaults to whoever's actually signed in
  (falling back to the first member only if that's not a Family Hub member),
  and confirms who/what an item was added for right after you add it.
- **v137 (1.102.0)** — Routines got a real management experience. Items on
  the board are now shown as small cards (checkbox, title, and — if set —
  a due time and/or specific days of the week) instead of a plain checklist
  row, and the old always-on "Add item" input/button under each accordion
  is gone. In its place, the "+" button on the Chores board now has a
  third **Routine** tab alongside Chore/Goal: pick a person and a Morning/
  Afternoon/Night category, and add, edit, or remove that person's routine
  items right there, each with an optional due time and optional specific
  days it applies to (leave the days blank for every day). The board only
  ever shows what's scheduled for today, but the Routine tab's own list
  shows everything for that person/category regardless of day, so a
  Saturday-only item is still easy to find and edit on a Tuesday. The
  pencil icon on a board item jumps straight into the Routine tab with
  that exact item already open for editing.
- **v136 (1.101.0)** — Quick follow-up to the emoji-picker accordion from
  the previous release: an open category could float over the Add/Cancel
  buttons (and the color picker) instead of pushing them down, making them
  hard to reach. The picker now lays out at full modal width in normal
  document flow, so opening a category pushes everything below it down the
  page instead of covering it up.
- **v135 (1.100.0)** — The reward-creation emoji picker was a single flat
  grid of ~18 icon choices that had gotten cramped and hard to scan. It's
  now organized into a collapsible accordion of six named categories
  (Treats & Food, Screens & Games, Toys & Fun Stuff, Outings & Activities,
  Money & Prizes, Achievement & Fun), each collapsed by default and
  expanding on tap — and the overall choice list has grown from 18 to 58
  emojis, so there's a lot more variety to pick from without the picker
  feeling like a wall of icons.
- **v134 (1.99.0)** — Goals can now show up right where the household
  already looks, instead of needing a separate standalone card: two new
  independent Settings → General toggles, **Show Goals in Chores** and
  **Show Goals in Rewards** (both off by default). With the first on, each
  person's own Chores column grows a compact Goals block (progress +
  Log Progress/Approve/Send Back) alongside their chores. With the second
  on, the Rewards page grows a Goals section listing everyone's goals the
  same way the existing Suggested Rewards bin does. Either (or both) can be
  on at once — a household might want goals visible on the Chores board but
  not clutter Rewards, or vice versa. A goal can now also be created
  directly from the Chores or Rewards **+** button: both create modals
  gained a Chore/Goal or Reward/Goal tab row at the top, so there's no need
  to open the standalone Goals card just to add one. The Goal tab only
  appears for someone who can already create/assign (same permission the
  standalone card requires), and never while editing an existing chore or
  reward. Also fixes a real bug in the Auto Screen Saver: its 60-second
  settings poll was unconditionally restarting the idle countdown on every
  tick, whether or not anything had actually changed — which meant the
  screensaver could never actually fire once idle time was set above 60
  seconds (the default is 180s, so this affected nearly every household
  that had it configured). The countdown now only resets when the
  screensaver's settings genuinely change, on both the full calendar card
  and the standalone companion screensaver card.
- **v133 (1.98.0)** — New feature: **Goals**, progress-tracked achievements
  a household attaches a reward to — "get 3 Bs in math," "practice piano 2
  times" — as distinct from a Chore's "do this one concrete thing, on a
  schedule." Each goal has a target count (defaults to 1, so a plain
  one-shot fact like "3 Bs" just works); the assignee self-reports each
  occurrence, and hitting the target moves it to pending approval, the same
  open → pending verification → approved gate Chores already uses. A goal
  pays out either in stars (the same star economy Chores use) or by handing
  over one specific reward straight from the Rewards catalog, chosen per
  goal at creation. A new standalone Goals card (independently addable to
  any dashboard, so it can sit right below the Chores board on the same
  view or live on its own view — either is fine, no toggle needed) shows
  each person's goals in their own column, with Log Progress/Approve/Send
  Back/Edit/Delete actions gated by the same assign/verify permissions
  Chores already has. New backend module `goal_engine.py` (its own
  lighter-weight sibling to `chore_engine.py`/`reward_engine.py`, same
  precedent `routine_engine.py` set for Routines); `reward_engine.py`
  gained `grant_item()` for handing over a catalog reward without spending
  stars. New Settings profile flags `notifyGoalApproved`/
  `notifyGoalRejected`. Covered by `test_goal_engine.py`, a new Goals
  section in `test_chores_websocket_api.py` (Goals' `family_hub/goals/*`
  websocket commands live in that same unified file alongside Chores/
  Rewards/Permissions/Routines, not a separate file), and
  `test_goals_card.js`.
- **v132 (1.97.0)** — Cosmetic fix: on the Rewards page (and the optional
  Rewards column embedded in the Chores board), every catalog item's Claim
  button now lines up along the bottom of its card instead of floating
  right under whatever content happens to be above it. Items with a longer
  title, a value note, a "One-time"/"Stacks up" badge, or a banked-amount
  line no longer push their own Claim button lower than a plain item sitting
  right next to it in the same row.
- **v131 (1.96.0)** — Chore due-date reminders. Any chore with a due date
  can now have one or more "remind me N minutes before" lead times attached
  (Create/Edit Chore modal, right under Due date) — the exact same set of
  lead-time choices (5m/10m/15m/30m/1h/2h/1d) the calendar card's own
  event-reminder checkboxes already offer, so there's only one set of
  options to learn across the whole app. A chore's own assignee gets a push
  notification at each configured lead time counting down to the due date —
  gated by a new opt-in "One of my chores is due soon" toggle in Settings →
  Notifications → edit a profile (Instant notifications section, off by
  default like every other instant alert). Like a calendar event's own
  reminder, a lead time whose moment has already passed by the time the
  next check runs simply never fires late — it's meant to warn ahead of the
  deadline, not report after it. Each chore tracks its own already-fired
  lead times independently, resetting automatically whenever its due date
  or reminder list is edited, or when a recurring chore starts a fresh
  cycle, so the same reminders are ready to fire again next time around.
- **v130 (1.95.0)** — Multi-user individual Reminders lists, plus a
  primary-calendar save reliability fix:
  - **Individual Reminders lists.** Alongside the one shared family
    Reminders list (unchanged), each person can now have their own
    individual list (Settings → Calendars → that person's "Reminders list"
    field). Other people can subscribe to someone else's list at one of
    three levels, set per-person under Settings → Notifications → edit a
    profile: not subscribed, subscribed (shows on the calendar), or
    subscribed + alert (shows on the calendar AND pushes a notification the
    moment something on it comes due). Anyone subscribed at either level
    can add new reminders to that list too, not just its owner. A person's
    own list always shows their own color instead of the family list's
    fixed purple, both on the calendar grid and in the event-info popup,
    and the Add Reminder modal has a new "List" picker (Family, your own
    list, anything you're subscribed to) so a new reminder lands on the
    right one. The daily digest and "due today" notifications now roll in
    every list you own or can see, each labeled with whose list it's from.
  - **Fix: setting a primary calendar could silently fail to save.** The
    Settings modal's save now surfaces a visible error and keeps the modal
    open (instead of closing as if it worked) if the authoritative save
    call doesn't get confirmed - previously a real save failure (a
    disconnected connection, for instance) looked identical to a
    successful save, silently discarding the change.
- **v129 (1.94.0)** — Multi-person calendar events, plus editing rewards:
  - **Family/multi-person calendar events.** An event still lives on exactly
    one person's own calendar (nothing is ever duplicated onto anyone
    else's), but you can now tag it as also being for other people too -
    open the event and check off everyone else it's for under "Also for."
    A tagged event shows a diagonal-stripe "collage" of every involved
    person's color instead of a single solid color (the same look Skylight
    Calendar uses), so you can tell at a glance it's a shared event. It
    still shows up correctly when you filter the calendar down to just one
    of the people it's tagged for, even if it's not the calendar it
    physically lives on, and in Planner view (the one view with a real
    column per person) it appears once in every involved person's own
    column. Tagging happens on the event-info popup after the event
    already exists, rather than at creation time - creating an event works
    exactly as it always has, then you tag who else it's for afterward.
  - **Rewards can now be edited.** Every catalog item in "Manage catalog"
    has a new pencil/Edit button next to the existing remove button -
    opens the same Add-reward popup, pre-filled with the item's current
    title, cost, icon, color, value note, redeem mode, banked
    amount/label, and "needs a parent to mark it done" setting, and saves
    changes to that item in place instead of creating a new one.
- **v128 (1.93.0)** — Reject a chore submission, plus a full star history
  and reward "banking":
  - **Reject a chore submission.** Alongside the existing Approve button on
    a chore waiting for verification, there's now a Reject button too. It
    sends the chore back to Open for the same assignee to redo and
    resubmit (no stars awarded, no streak change) - an optional reason
    typed on rejection shows on the card as a "Sent back" note and in the
    chore's detail view until the redo is cleanly approved. A matching
    native `family_hub.reject_chore` service is available for automations,
    and a new "One of my chores is sent back" notification setting (parent
    to the existing "...is approved" one) tells the assignee why.
  - **Click a person's name in Rewards to see their full star history** -
    every star they've earned from approved chores, lost to overdue
    penalties, spent on redemptions, or had adjusted by hand, merged with
    their redemptions and reward "uses" (see below) into one
    chronological list.
  - **Rewards can now require a parent to mark them "done" before they
    count** - handy for something like a $20 allowance that isn't really
    delivered the moment it's redeemed. Turn on "Needs a parent to mark it
    done" when adding a reward, and every redemption of it (or use of its
    banked balance, see below) shows in a new "Pending rewards" section
    until someone with pricing authority marks it done. Everyone can see
    what's pending; only a parent (or whoever's been granted the
    reward-add/reward-override permission) gets the Mark Done button.
  - **Rewards can now "stack" instead of being one-and-done** - pick "Stacks
    up (e.g. allowance, TV time)" as a reward's redeem mode and set how
    much each redemption adds (e.g. "$5" or "0.5 hrs"). Redeeming it
    repeatedly grows a running balance instead of logging separate
    one-off events; a "Use" button lets you spend part of that balance
    back down whenever you like (e.g. use 1.5 of 3 banked hours), and
    spending can also be marked to need a parent's done-mark, independent
    of whether earning it did.
  - **Rewards can also be marked "One-time"** - redeeming it works exactly
    like an ordinary reward, but the catalog item removes itself right
    after, for everyone, so a one-off perk doesn't linger as claimable
    again.
  - **An optional "what it's really worth" note** (e.g. "$20" or "2 hrs")
    can be added to any reward, shown next to its star cost - purely a
    label for people to read, it's never used in any calculation.
- **v127 (1.92.0)** — Add buttons now match the calendar's own + button,
  and reward suggestions:
  - **Add Chore is now a + button in the corner**, matching the calendar
    card's own add button - same look, same spot, same behavior otherwise.
  - **Add reward is now a + button too**, and it opens a proper popup
    instead of the old inline form under "Manage catalog". Anyone can tap
    it - what happens next depends on permission (see below).
  - **New "Can add rewards to the catalog" permission** (Settings >
    Permissions). Someone with it - an admin always has it - adding a
    reward through the + button sends it straight into the catalog,
    priced right away. Someone without it can still suggest a reward
    through the same button; it just has no price yet and lands in a new
    "Suggested rewards" section for a parent (or anyone with the
    permission) to price and approve, or reject.
- **v126 (1.91.0)** — The last remaining item from the same batch of
  requests:
  - **The Global Theme picker (Settings > Theme Builder) now also lists your
    installed Home Assistant themes**, not just the ones you've built in
    Theme Builder itself. A "Default (Home Assistant)" option plus every
    theme already installed on your Home Assistant (native `themes.yaml`
    themes or ones added via HACS) now show up as selectable options,
    grouped separately from your own custom Theme Builder themes in the
    dropdown. Picking one applies its colors to the card the same way a
    custom theme does.
- **v125 (1.90.0)** — The last two from the same batch of requests:
  - **Users can now have a primary calendar that follows their own color.**
    On the Users tab's profile editor, tap the star on one of a person's
    calendars to make it their primary calendar - that calendar's events
    now use their own custom color (the same one used on the Chores board/
    Rewards balances) instead of its own separately-configured color,
    everywhere it's shown. Only one calendar can be primary per person;
    tapping a different star moves it, tapping the same star again clears
    it.
  - **The calendar picker in a person's profile is now cards, not
    checkboxes.** Each calendar shows as its own colored, tappable card -
    tap the card to subscribe them to reminders from it, tap the star to
    set it as their primary calendar (see above). Same underlying
    subscription list as before, just easier to scan at a glance.
- **v124 (1.89.0)** — Four more from the same batch of requests:
  - **Reward catalog items can now have their own icon and card color.**
    Managing the catalog now shows an emoji icon picker (a small grid of
    reward-flavored emoji, no external picker library) and a color swatch
    on the Add form; a chosen color shows as the item's own accent border/
    background everywhere the catalog renders, including the Chores
    board's embedded Rewards column. A malformed or unset color just falls
    back to the normal card look.
  - **Two new instant notification settings** on each person's own
    Notifications tab profile, separate from - and not batched into - the
    Daily Digest: "A reward is claimed" (sent to everyone who's opted in,
    whenever anyone in the household redeems a reward - handy for a parent
    watching the star economy) and "One of my chores is approved" (sent
    only to that chore's own assignee, the moment their submitted chore
    gets approved and stars are disbursed). Both work whether the approval
    came from the card or from a native `family_hub.approve_chore` service
    call/automation.
  - **Admins can now clear or reverse a reward redemption** from the
    history list. "Clear" (&times;) just removes a history entry - for
    tidying up a duplicate or a mistake already handled some other way.
    "Reverse" (&#8634;) removes the entry AND refunds the stars back to
    whoever claimed it - for undoing a mistaken claim entirely. Both are
    shown only while Manage catalog is open, and both require the same
    reward-override permission catalog management already needs.
- **v123 (1.88.0)** — Three more from the same batch of requests:
  - **Chore cards are now clickable - tap one for a full detail view.**
    Every card on the Chores board (a person's column, the Chore Bin,
    Waiting to Recur) opens a read-only detail popup when tapped anywhere
    that isn't already one of its own buttons: who it's assigned to, star
    value, due date, overdue penalty, streak, recurrence schedule, any
    chores it's waiting on, and its new **Notes** field. An Edit button
    inside opens the real editor for anyone who can already edit chores.
  - **Chores can now have Notes.** A free-text field on the Create/Edit
    form for anything worth writing down - which bin, where to leave it,
    special instructions - shown in the new detail popup above.
  - **The Waiting to Recur column can now collapse into a header button**
    instead of taking up a whole column - useful on a smaller screen or a
    wall tablet where every bit of width counts. Tap the new &#8635;
    button in the header to switch between the full column and a compact
    button showing just the count; tap it again to switch back. This is a
    per-device preference (remembered on that screen only), not something
    that changes for the rest of the household.
  - **Chores now scrolls vertically on mobile instead of sideways.** Below
    the usual mobile breakpoint the board's columns stack top-to-bottom
    and the whole board scrolls as one list, instead of each column
    fighting its neighbors for a horizontal scroll.
- **v122 (1.87.0)** — Two small fixes from a larger batch of requests, first
  in line since they're quick and don't touch anything else in that batch
  (the rest - a clickable chore detail modal, per-user calendars, a card-
  based calendar picker, full Home Assistant theme support, a collapsible
  Waiting to Recur column, vertical scrolling for Chores on mobile, a
  reward icon/color picker, new redemption/approval notification settings,
  and admin redemption reversal - are still in progress):
  - **Fixed: a person's custom color never actually showed in their
    profile's color picker.** Users tab → Edit a person → the little color
    swatch always rendered as a plain white box with just a border, no
    matter what color was actually saved for them - purely a CSS bug (an
    author-set background was painted over the browser's native color
    swatch instead of behind it, most noticeable in Firefox and some
    Android kiosk browsers). The color itself was always being saved and
    used correctly everywhere else (their calendar column, their Chores
    board column); only this one swatch's own appearance was wrong.
  - **My Chores card's heading now matches Family Today's.** It was
    hardcoded to 18px regardless of the household's Theme Builder "Header
    title" font-size setting - now it reads that same shared setting, so
    it sizes exactly like Family Today's and the main calendar's own
    headings, including if that size gets changed later.
  - Investigated the reported "notify device doesn't carry over" issue in
    depth (the add/auto-detect UI wiring, the Settings save payload, the
    reload path, and the backend's settings storage) and traced a full
    add → save → reload round trip successfully with no data loss found -
    flagged back for a more specific reproduction before changing anything
    there, rather than guessing.
- **v121 (1.86.0)** — Two permissions requests from a household running a
  shared wall-mounted tablet as its own Family Hub login:
  - **"Include in Chores & Rewards" toggle, per person.** Each person's
    profile editor (Users tab → Edit) now has its own On/Off toggle right
    alongside their notification color, separate from Family Hub membership
    itself. Turn it Off and that person keeps everything else about being a
    Family Hub member (they still show up on the Users and Permissions
    tabs, they can still be granted permissions, they still get Routines if
    the household uses those) but disappears from the Chores board (no
    column) and the Rewards balance list, and is no longer offered as a
    target when assigning a chore, creating one, or building a rotation
    group. On by default for everyone - nothing changes for a household
    that never touches this. This is exactly what a shared kiosk/wall-
    tablet login wants: add it to Family Hub purely so it can be granted
    permissions below, without it cluttering the board with its own empty
    column.
  - **New "Can mark any chore done" permission**, separate from "Can
    approve/verify completed chores." Previously the only way to let
    someone tap Done on someone else's chore on their behalf was to also
    hand them full approve/verify authority (which finalizes everyone's
    star payouts) - now you can grant just the narrower one. Turn it on for
    an account from the Permissions tab and they can mark any chore done
    for anyone, move chores out of the Chore Bin, and nudge - without also
    being able to approve completions or override reward costs. Nudging a
    chore and drag-and-drop reassignment out of the Chore Bin already
    worked for any account with no special permission needed (nudge) or
    with "Can assign chores to others" (reassignment) - only "mark someone
    else's chore done" needed a new grant.
- **v120 (1.85.0)** — Three requested features, all from real household use
  of the Chores board:
  - **Chores can now recur on a plain schedule** - "every N days" or "on
    specific weekdays" - completely separate from (and stackable with) the
    existing sensor-automation trigger. Set it right in the Create/Edit
    Chore form under a new "Recurs" field: "Doesn't repeat," "Every few
    days" (pick the number), or "Specific days of the week" (pick any
    combination of Mon-Sun). Once a recurring chore is approved, it no
    longer sits faded in whoever last did it - it moves to a new, always-
    visible **"Waiting to Recur" column** on the board, showing its
    schedule ("Every 3 days · Next: 6/12/2026", "On Mon, Thu," or "Waiting
    for the trigger to fire" for a sensor-only chore with no predictable
    date) and who did it last. It automatically reopens and reassigns
    itself back to that same person once its schedule comes due - no admin
    action needed.
  - **New Routines feature: per-person daily checklists.** Each household
    member's own column on the Chores board can now show three collapsible
    accordions - Morning Routine, Afternoon Routine, Night Routine - each
    with a done/total badge (e.g. "1/3"). Tap one open to see an "Add item"
    box (for whoever can already assign chores) and the checklist itself,
    split into Active/Completed sections. Anyone can check off their own
    items - no approval, no stars, just "did I do this today" - and every
    item resets back to unchecked automatically at the next local midnight
    so the same routine is ready to go again tomorrow. Off by default:
    turn it on for the whole household from the calendar card's Settings →
    General tab ("Routines" On/Off) - one shared switch, not per-person.
  - **The Auto Screen Saver now works directly on the Chores, Rewards, and
    My Chores cards** - no more needing to also add the separate, invisible
    Screen Saver companion card just to get it on a dashboard that only has
    one of these. Same shared settings as always (source, idle time, which
    logins it's on for, from the calendar card's Settings → Screen Saver
    section) - nothing new to configure. Built to be mindful of the device
    it's running on: if more than one Family Hub
    card ends up on the same dashboard (say, Chores and Rewards side by
    side), they now share a single screensaver overlay, idle timer, and
    camera-image poll instead of each standing up their own - so adding the
    screensaver to more cards never means more background work piling up
    on a shared kitchen tablet. If you'd previously added the standalone
    Screen Saver companion card to a dashboard that also has one of these
    three, you can remove it now - it's redundant there.
- **v119 (1.84.0)** — **Chores can now be edited, not just created.** The
  Chores board never had any way to fix a chore after the fact - a typo in
  the title, the wrong star value, a due date that needs to move - short of
  deleting it and starting over. Every open chore now has a small pencil
  ("Edit") button alongside its other actions, opening the same kind of
  form the "+ Add Chore" button uses, pre-filled with that chore's current
  title, star value, due date, overdue penalty, dependencies, and (for
  auto-rotation chores) rotation group and sensor triggers. Who can use it:
  exactly whoever can already assign chores - an admin, or anyone granted
  the "can assign" permission on the Permissions tab - the same rule the
  backend has always enforced on chore edits (`family_hub/chores/update`
  was already permission-gated this way; the board just never exposed a
  way to trigger it). Matches the backend's other own long-standing rule
  too: only an **open** chore can be edited (one that's pending approval or
  already approved has to be re-opened or recreated instead) - the Edit
  button simply doesn't appear otherwise. What can't be changed from this
  form: who a chore is assigned to and its assignment mode (Direct/Chore
  Bin/Rotation/First-come) - those still go through drag-and-drop or the
  Chore Bin, exactly as before.
- **v118 (1.83.0)** — **Fixed a real data-loss bug: everyone's notification
  settings could get silently wiped after a manual file update.** If you
  ever updated Family Hub by copying files into `custom_components`
  by hand and then restarted, and had previously opened the card's
  Settings and hit Save even once, your per-person notification profiles
  (notify targets, Daily Digest checkboxes, reminders on/off, everything
  under the Users tab) could come back completely reset on that restart -
  with no way to recover them short of re-entering everyone's settings by
  hand. Root cause: saving Settings from the card always rewrites the
  *entire* stored settings blob, but the card has never known about one
  small backend-only bookkeeping flag (whether the one-time notification
  migration already ran) - so every single Settings save quietly erased
  that flag from storage. The next restart saw the flag missing, assumed
  this household had never migrated, and re-derived everyone's profiles
  from scratch from the old pre-migration settings - overwriting the real
  ones. Fixed with two independent changes so this class of bug can't
  come back from a single missed spot: (1) saving Settings now carries
  that flag forward itself when the card's payload doesn't mention it, so
  it can no longer be silently dropped; (2) as a backstop, the migration
  step itself now refuses to ever re-derive fresh profiles on top of real,
  non-empty profile data that's already in storage, flag or no flag - it
  just re-confirms the flag and leaves real data alone. Existing installs
  aren't at further risk once updated to this version; nothing needs to be
  redone by hand beyond re-entering anything already lost before this fix.
- **v117 (1.82.0)** — Four Chores/Rewards improvements from real household
  use:
  - **Chores board columns now scale to fill the dashboard.** Each column
    keeps its current width (220px) as a *minimum* rather than a fixed
    size - with only a couple of people, columns stretch to use the extra
    space instead of leaving the right side of the board empty; with
    enough people that they wouldn't all fit at 220px, the board scrolls
    horizontally exactly like before. Pure CSS (`flex: 1 0 220px; min-
    width: 220px`), no settings or backend change.
  - **Rewards now only shows people added to Family Hub**, matching the
    Chores board instead of listing every real Home Assistant login.
    Someone's past redemption history still shows their real name even
    after being removed from Family Hub (matching the "removal only
    hides, never deletes" decision from the membership feature) - only
    the live balance-card grid is filtered.
  - **Each person can set their own color** instead of only ever getting
    an automatically assigned muted tone. New color picker on their
    profile (Users tab → Edit → "Chores & Rewards color"), with a "Use
    default" button to go back to the automatic palette color. Applies
    everywhere their color shows up: Chores board columns and Rewards
    balance cards. Purely cosmetic - stored on their profile
    (`userProfiles[id].color`) but never read by any backend notification
    logic.
  - **New optional "Rewards" column on the Chores board** - an embedded
    mini Rewards card (each Family Hub member's star balance, plus the
    full browsable/claimable reward catalog) right alongside the chore
    columns, so a household running the board full-screen doesn't need a
    second card just to see or spend stars. Off by default; an admin
    toggles it on/off from a new star button in the board's header (the
    setting is household-wide, not per-device, like everything else in
    Settings).
- **v116 (1.81.0)** — **Removed the household-level "Grocy in Daily
  Digest" gate from the Users tab.** Grocy notifications were previously
  controlled by a three-way gate: a tracker toggle (General → Grocy), a
  household-wide "include Grocy in the digest at all" on/off switch on the
  Users/Notifications tab, and each person's own profile checkbox. That
  middle layer was redundant with the per-person checkbox and just added a
  second place things could be silently turned off - it's gone now.
  Whether Grocy's expiring-items and low-stock counts show up in a
  person's Daily Digest is decided by exactly two things: the matching
  tracker being on under General → Grocy, and that person's own "Expiring
  items"/"Low stock" checkbox under their profile on the Users tab. The
  household toggle, its buttons, and its backend-side digest_enabled flags
  (`grocy_expiring_digest_enabled`/`grocy_low_stock_digest_enabled`) have
  been fully removed rather than just hidden - nothing reads them anymore.
  Existing installs aren't affected beyond this simplification: if the
  household toggle was ever turned off for a Grocy section, that stops
  mattering and each person's own checkbox takes over as the sole control
  (turn it off on their profile if they don't want that content).
- **v115 (1.80.0)** — **You now add people to Family Hub explicitly,
  instead of every Home Assistant login automatically showing up
  everywhere.** Before this, the Users tab, the Permissions tab, and the
  Chores board all just listed every real HA account - there was no way to
  keep a login (a shared tablet, a guest account, a login that just
  doesn't belong in this household's Chores/notifications) out of the
  picture. Now there's one explicit gate: the Users tab has a new "Add a
  person" picker, and only people who've been added show up there, on the
  Permissions tab, or anywhere a chore gets assigned (the board's columns,
  the direct-assignment dropdown, rotation groups, self-serve claim).
  Removing someone (the ✕ next to their row) only ever takes them off
  this list - it never deletes their notification profile, their
  permission grants, or anything already assigned to them, so re-adding
  them later brings everything right back exactly as it was. This
  replaces v112's separate per-person "Chores enabled" toggle entirely -
  that's folded into being added or not, one setting instead of two. If
  you're upgrading from an earlier version, nothing changes for you
  automatically: everyone who was already showing up (anyone with a
  notification profile or a permission grant) is carried forward
  automatically the first time Home Assistant starts up on this version,
  so nobody you already had set up disappears. From then on, though, a
  newly created Home Assistant login has to be added by hand before it
  shows up anywhere in Family Hub.
- **v114 (1.79.0)** — **Chores/Rewards/Permissions now survive the
  integration being removed and re-added, not just the general Settings.**
  Since v1.76.0, notification profiles and every other card setting have
  been backed up to a plain file outside Home Assistant's own storage
  (`family_hub_backups/settings_backup.json` under your Home Assistant
  config folder) and auto-restored if that data ever comes back empty -
  which is what actually happens if you remove and re-add the Family Hub
  integration (a brand-new entry gets a brand-new, empty storage area; a
  normal file update never touches this at all). That safety net covered
  the Settings blob but not your Chores records, Rewards star
  balances/catalog, or Permissions grants - those are three separate
  storage files that would still have been wiped by the same
  remove-and-re-add scenario. Now they get the exact same treatment:
  `chores_backup.json`, `rewards_backup.json`, and
  `permissions_backup.json`, right alongside `settings_backup.json` in
  that same backups folder, each refreshed automatically after every real
  save (creating/completing/approving a chore, redeeming a reward,
  granting a permission) and auto-restored the moment a fresh, empty
  store is detected. Nothing to configure - this is on by default and
  happens silently in the background.
- **v113 (1.78.1)** — Follow-up to v112: the Chores board's columns
  (`family-hub-chores-card.js`) didn't actually match the rest of the
  household's look. Two real gaps, not just a tweak: (1) the columns used
  a different background (`--fc-surface2` instead of `--fc-card`, the
  color every other card-like container in this project uses — day
  columns, month cells, planner cells, recipe rows), a bigger border
  radius (14px vs. the established 10px), and had no outline or shadow at
  all, where the calendar card's day columns have both (`border: 1px
  solid var(--fc-border)`, `box-shadow: var(--fc-shadow)`) — fixed by
  matching `.chore-column` to that exact formula, and giving the column
  header the same `--fc-surface-alt` background the calendar's own
  planner-grid header cells use. (2) A real latent bug: this card's
  `_applyThemeVars()` never set a `--fc-shadow` CSS variable at all (only
  the color variables), and its `:host` block never defined a default for
  it either — so every `box-shadow: var(--fc-shadow)` in this card's CSS
  was silently resolving to no shadow at all, not just on the columns.
  Fixed by adding the same literal default the calendar card's `:host`
  block carries (`0 2px 5px rgba(58, 53, 44, 0.16)`). Note: this covers
  the default look and the flat default shadow: if the household later
  configures a custom shadow/glow *effect* through Theme Builder on a
  **global** theme, the calendar card (and `family-today-card.js`) pick
  that up dynamically — this card, `family-hub-my-chores-card.js`, and
  `family-hub-rewards-card.js` currently don't (a pre-existing gap from
  v110, not something this fix introduced) and would need the same
  `_buildBoxShadow`/`_hexToRgba` effects wiring `family-today-card.js`
  already has to fully track that too.
- **v112 (1.78.0)** — **Settings relocation + per-user Chores enablement.**
  Every Family Hub setting now lives in one place: the Family Week Calendar
  card's own Settings modal. The admin-only **Permissions tab** (who besides
  an admin can assign/verify chores or override reward costs) moved out of
  `family-hub-chores-card`'s own Settings (which no longer has one) into a
  new **Permissions** tab there, still wired to the same
  `family_hub/permissions/get`/`.../set` commands and still admin-only, both
  by hiding the tab from a non-admin and because the backend itself has
  always enforced that gate. The old **Notifications** tab is now **Users**
  — the same per-person profile editor, broadened with two new fields: a
  **Chores** on/off toggle and a **"Their own pending chores"** Daily Digest
  checkbox. Chores-enabled (`choresEnabled`, default **on** — this is an
  opt-out, not opt-in, so nobody's setup changes on update) is a **full
  opt-out**: turning it off for someone removes their column from the
  Chores board (unless they still have a chore assigned to them that isn't
  done yet - that stays visible until it's finished or reassigned, so
  nothing gets silently orphaned) and excludes them from every new-
  assignment picker (the create-chore form's "Assigned to" dropdown, the
  rotation-group picker) - enforced independently on the backend for every
  relevant chores websocket command, not just hidden in the UI. The Daily
  Digest can now include a personalized **"Your pending chores"** section
  (their own open, not-yet-done chores - not stuff sitting in the Chore Bin
  or already awaiting someone else's approval), on by default alongside
  every other digest section. `family-hub-my-chores-card` and
  `family-hub-rewards-card` are unaffected by choresEnabled - it's purely a
  Chores-board-columns-and-new-assignments control, not a way to hide
  someone's existing stuff or lock them out of redeeming rewards.
- **v111 (1.77.1)** — Two follow-up fixes to v110's Chores/Rewards/Permissions
  feature, both found from real use right after it shipped. **The three new
  cards now actually show up in the "Add Card" picker** - they were
  registering their custom element but never pushing themselves onto
  `window.customCards`, which is the list Home Assistant's card picker
  searches; before this fix the cards worked fine if you hand-typed
  `type: custom:family-hub-chores-card` into a dashboard's YAML, but were
  invisible in the visual picker (which is also why the admin-only
  Permissions tab looked "missing" - it lives inside that card's own
  Settings modal, so there was nowhere to find it until the card itself
  could be added). **Fixed a integration-breaking startup error** -
  `Error during setup of component family_hub: module 'homeassistant.
  components.websocket_api' has no attribute 'async_register_all'` - caused
  by the new chores websocket module originally being named the same thing
  (`websocket_api.py`) as an already-imported Home Assistant module of that
  exact name; renamed to `chores_websocket_api.py` to resolve the collision.
- **v110 (1.77.0)** — **Chores, star Rewards, and per-user Permissions** —
  a full household chore system, built as native Home Assistant
  citizens rather than just cards. A chore lives in its own JSON store
  (`family_hub_chores.json`) and moves through a simple state machine -
  **Open → Pending Verification → Approved** - with four assignment modes
  (direct, dropped in the shared **Chore Bin** for an admin to hand out,
  auto-rotation through a per-chore rotation list, or first-come-first-served
  claiming). Approving a chore disburses its star value into a **Rewards**
  ledger (`family_hub_rewards.json`) - balances, a browsable reward catalog,
  and instant self-serve redemption, no approval step. A chore can also be
  wired to real sensors: an **auto-create trigger** re-opens a recurring
  chore when a sensor changes state (e.g. "Dryer finished" cycles the same
  chore back to Open), and an **auto-complete trigger** marks it done on
  another state change (e.g. "Dishwasher opened"). Everything is exposed to
  the rest of Home Assistant too, not just the new cards: four native
  services (`family_hub.create_chore`, `complete_chore`, `approve_chore`,
  `nudge_user`) for use in your own automations/scripts, a
  `family_hub_chore_event` fired on every status change so native
  automations can react, and a real `todo.family_hub_chores` entity so
  voice assistants (Assist, Alexa, Google) and the native to-do UI can see
  and add chores directly. Three new cards: **`family-hub-chores-card`**
  (the full week-view-style board - one column per person plus the shared
  Chore Bin, drag-and-drop to reassign, a creation form with an Advanced
  Settings accordion for sensor triggers/dependencies/rotation, and a
  one-click Nudge button), **`family-hub-my-chores-card`** (a
  context-aware personal view - reads the logged-in user's own ID and shows
  just their active chores plus a claimable Chore Bin, made for a phone
  dashboard), and **`family-hub-rewards-card`** (balances, the reward
  catalog with a one-click claim, and recent-redemption history). A new
  **Permissions tab** in the Chores card's Settings modal - visible only to
  real Home Assistant admin accounts - lets an admin grant specific
  non-admin household members `can_assign`, `can_verify`, and/or
  `can_override_rewards`; a real admin always has every permission
  regardless of what's in that store, and the store itself can only be
  viewed/edited by a real admin (a household member granted all three
  permissions still can't open it). Every interactive action is
  permission-checked on the backend, independent of what the card chooses
  to show; native service calls are intentionally *not* permission-gated,
  since they run with whatever authority already invoked them, same as any
  other Home Assistant service.
- **v109 (1.76.0)** — **Notification profiles (and every other card
  setting) now survive removing and re-adding the Family Hub integration
  entry.** Family Hub is single-instance, and neither the in-app self-update
  panel nor a HACS update ever touches your saved settings - they only
  overwrite the integration's own code files. The one thing that *did*
  orphan your settings was deleting and re-adding the Family Hub entry
  itself (e.g. while troubleshooting something else) - that hands the next
  setup a brand-new internal ID, leaving the old settings sitting on disk
  but disconnected. Family Hub now keeps a durable backup of the whole
  settings blob (people/calendars, badges, screen saver settings,
  notification profiles - everything) in a plain file outside both its
  `.storage` data and its own code folder, refreshed on every settings save,
  and automatically restores from it if it ever finds a freshly-created,
  completely empty settings store - quietly, logged for anyone who goes
  looking, with nothing for a household to do. A store that already has
  real content (even intentionally-cleared notification profiles) is never
  touched, so this can't undo something you did on purpose.
- **v108 (1.75.0)** — New **"Send test digest now" button**, in each
  person's Notifications-tab profile modal. Lets a household trigger that
  person's Daily Digest on demand - instead of waiting for the scheduled
  time - to check a device actually receives it and preview today's actual
  content. It sends whatever's currently checked in the modal (notify
  targets, digest sections) even if Settings hasn't been Saved yet, so you
  can tweak a setting and immediately test it without a save/reload cycle.
  Reports back how many devices it reached, a partial-failure count if some
  notify targets failed, or a clear "no notify target set yet" prompt if
  none is configured for that person. Backed by a new
  `family_hub/send_daily_digest_now` websocket command.
- **v107 (1.74.0)** — New **Planner view**: a third view mode alongside
  Week and Month, modeled on a paper wall planner - days run down the side
  (one row each, current week only) and each person gets their own column,
  so it's easy to scan "what does everyone have going on this week" at a
  glance instead of paging through each person's events separately. Switch
  to it with the new "Planner" button next to Week/Month; it can also be
  set as the card's Default View (Settings → General). Deliberately
  narrower in scope than Week view - just that person's own calendar
  events per day, no meal-plan banners, no custody badges, no
  timeline/hourly layout - though a calendar's "hide event when contains"
  keyword (Settings → Calendars) still applies, since that's a "never show
  this at all" rule rather than something Week-view-specific. Tapping an
  event opens the same event-detail popup every other view uses. On a
  narrow (phone-width) screen the grid keeps its rows/columns shape and
  scrolls sideways rather than collapsing, since squashing it down would
  lose the whole point of the view.
- **v106 (1.73.0)** — Two additions to the Auto Screen Saver feature:
  - **New "Family Hub Screen Saver" companion card** (`custom:family-hub-screensaver-card`) -
    brings the exact same screensaver (same shared source/idle-time/
    per-login settings the full card's own Settings → Screen Saver
    configures) to a dashboard that doesn't have the full calendar card on
    it. It only shows its own face while its dashboard is in edit mode -
    the rest of the time it's invisible (zero height) but keeps the idle
    timer running in the background. Its face includes a "Return to this
    dashboard on wake" dropdown, populated from your actual configured
    dashboards, so a screensaver that falls asleep on one dashboard can
    wake back up on a different one instead of staying put - handy for a
    wall tablet that's meant to spend most of its time on one dashboard but
    gets tapped over to another one now and then. The same field is also
    available (as a guaranteed-to-save fallback) via the card's own "Edit
    Card" dialog if the on-card dropdown doesn't stick in a given Home
    Assistant version. Served and auto-registered as a dashboard resource
    alongside the full and Today cards. Add it to any dashboard with:
    ```yaml
    type: custom:family-hub-screensaver-card
    title: Screen Saver
    # optional - leave blank to just stay on this dashboard when woken
    return_dashboard_path: /lovelace-family/0
    ```
  - **"Disable screen saver while a recipe is open"** - a new Settings →
    Screen Saver toggle (off by default) on the full card. When on, the
    idle countdown is paused while a single recipe's detail view is open
    (the Recipe Box's own dish detail popup, or the fuller Grocy recipe
    viewer) - a household reading a recipe off a wall-mounted tablet won't
    get interrupted mid-cook. Browsing the Recipe Box's list/search view
    itself still counts as idle, since nothing is actually being read
    there.
- **v105 (1.72.1)** — Follow-up to the notification rework (v104): Grocy's
  "Include in Daily Digest" toggles (for expiring items and low stock)
  moved off the General tab's Grocy accordion and into the Notifications
  tab, next to the per-person Grocy digest checkboxes they control the
  visibility of - they were previously stranded next to "Track expiring
  items"/"Track low stock" (which stayed on General; those toggle the
  actual Expiring Soon/Low Stock features under the More menu, not
  notifications). Each now only shows once its matching tracker is turned
  on, and - new in this pass - that now updates live: turning a tracker on
  under General immediately reveals its Daily Digest toggle over on
  Notifications (and any open person's matching digest-section checkbox),
  without needing to Save and reopen Settings first.
- **v104 (1.72.0)** — Reworked the notification system from the ground up:
  per-user notification profiles instead of one shared, admin-configured
  set of overrides. Previously, who got notified for a given calendar,
  Reminders, or the Daily Digest was a single household-wide setting
  (`notify_overrides`/`default_notify`) configured through the
  integration's own Configure flow - every person shared the same Daily
  Digest content, and there was no way for someone to subscribe to just
  the calendars they cared about. Now each Home Assistant login gets its
  own profile, edited from a new **Notifications** tab in the card's
  Settings modal (Settings itself is now a wider modal with a top tab bar
  - **General** for everything Settings used to hold, **Notifications** for
  all of it - the tabs scroll horizontally on mobile if there isn't room):
  which calendars they're subscribed to, whether they get standalone
  Reminders, and whether they get the Daily Digest - and if so, which
  sections appear in theirs (today's calendar events, due reminders,
  planned meals, Grocy items expiring soon, Grocy items running low). Each
  person's own notify target(s) (`notify.mobile_app_*` etc.) are set from
  their profile via the same add/remove-devices picker Settings already
  used elsewhere, now addressed by person instead of by calendar/Reminders/
  Digest slot - plus a new **Auto-detect** button (only offered on your own
  profile) that matches your Home Assistant `person` entity's linked
  device(s) to a notify service for you, rather than typing one in by
  hand. On upgrade, existing `notify_overrides`/`default_notify` settings
  are automatically migrated into starting per-user profiles the first
  time the integration loads - nobody has to redo their setup, though
  targets that couldn't be confidently matched to a specific person are
  logged as a warning rather than guessed at ("no match is safer than a
  wrong match"). The old Configure-flow fields still exist and still work
  as the migration's source data, just marked (Legacy) in their
  descriptions - none of the old backend delivery code was removed, only
  bypassed by the new per-user resolution. Two things explicitly deferred
  to a future update: a chores feature, and multiple/targeted reminder
  delivery paths (e.g. a reminder aimed at one specific person rather than
  everyone subscribed to it).
- **v103 (1.71.0)** — Two follow-ups to the new Auto Screen Saver
  (v102), both from real-world feedback right after it shipped:
  (1) **Fixed**: the screensaver only covered the dashboard's own content
  area - Home Assistant's sidebar, top bar, and this card's own "+" add-
  event button all stayed visible on top of it. Cause: the overlay lived
  inside `<ha-card>`, and `<ha-card>` (or something further up Home
  Assistant's own layout) establishes its own containing block for
  `position: fixed` descendants, trapping the overlay to that box instead
  of the real browser viewport - this card's own `add-event-fab` button
  already proved the fix works, since it's a *sibling* of `<ha-card>`
  (not nested inside it) and always did cover the full screen correctly.
  The screensaver overlay is now built once and appended directly to
  `document.body`, entirely outside every shadow DOM (this card's own and
  Home Assistant's), which reliably escapes both. Since shadow-scoped
  CSS can't reach a body-level element, every one of its styles is now
  set inline in JS rather than in this card's stylesheet. (2) **Changed**:
  "Enable for these logins" no longer lists every login as an inline
  checkbox block in Settings - a household with a dozen-plus Home
  Assistant accounts (several service/integration logins mixed in with
  actual people) had that section dominate the whole Settings modal's
  scroll length. It's now a single button showing a short summary (e.g.
  "Jaret, Tablet", or "4 selected") that opens a dedicated picker overlay
  with the checkboxes - the same click-a-box-to-select-from-a-list pattern
  the existing Notify-devices buttons elsewhere in Settings already use.
- **v102 (1.70.0)** — New feature: Auto Screen Saver. Shows a full-screen
  video or live camera feed after the dashboard sits idle for a while -
  built for a wall-mounted "home hub" tablet, without also switching on
  for everyone's phone. Configured under Settings > Screen Saver: pick a
  source (a video URL/media path, or a Home Assistant camera entity - one
  or the other, not both at once) and an idle time in seconds. Which
  screens actually show it is controlled per Home Assistant login, not
  per household - a new backend command (family_hub/list_users) lists the
  household's user accounts so Settings can offer one checkbox per login;
  a wall tablet needs its own distinct HA user account logged in for the
  toggle to actually tell it apart from a phone, since Family Hub has no
  other concept of "this specific device." Any tap anywhere dismisses it
  and restarts the idle countdown. A live camera is shown the same
  lightweight way Lovelace's own picture-entity card does - polling the
  camera's still image every 10 seconds - so it needs no extra streaming
  library and works with any camera platform Home Assistant supports.
  Off for every login by default; installing this update changes nothing
  until a source is configured and at least one login opts in.

  While testing this, also found (not fixed - out of scope for this
  change, flagged for later) that `test_reminders_feature.js` has a
  pre-existing flake of its own: it builds its test calendar event from
  the real system clock, so within roughly the last hour before UTC
  midnight the event's fixed 1-hour duration pushes its end past
  midnight, and the grid correctly renders that as a two-day event -
  which the test wasn't expecting. Same category as the already-known
  test_servings_scaling.js flake below, just a different trigger
  (time-of-day vs. day-of-week); confirmed by pinning the test's clock to
  a safely mid-day time and watching the failure disappear.
- **v101 (1.69.0)** — One more recipe-import matching fix, plus a curated
  reference-list expansion: (1) "extra virgin olive oil" now correctly
  matches a household's own existing "Olive Oil" product instead of
  falling through to "+ Add new product" — the raw text scores just under
  the real-product match cutoff (0.581 vs. 0.6) because of the "extra
  virgin" grade words, so a narrow third second-chance pass strips just
  those words ("extra", "extra-virgin", "virgin") and retries the match,
  the same only-if-better pattern already used for stripping parenthetical
  asides. Scoped to grade words only, not general noise-stripping, so it
  can't reintroduce the earlier "chicken or vegetable stock" -> "Vegetable
  Oil" false match that a broader strip once caused. (2) The curated
  ingredient reference list (`grocery_reference.py`, used for the
  "+ Add new product" suggestion when a household doesn't stock something
  yet) grew by 43 everyday entries covering more produce (potato and
  mushroom varieties, celery root, kohlrabi, chayote, broccolini/rabe),
  canned goods (canned chicken/salmon/green chilies, water chestnuts,
  bamboo shoots, San Marzano tomatoes), meats (turkey bacon, Canadian
  bacon), dairy (colby jack, havarti, manchego, queso fresco, cotija,
  light cream, vanilla yogurt, lactose-free milk), beverages (rice milk,
  cashew milk), pantry and baking staples (chia/flax/hemp seeds, wheat
  germ, vital wheat gluten, xanthan gum, protein powder), condiments
  (coconut aminos, liquid smoke, browning sauce), and lavash. Checked for
  duplicate names and alias collisions against the existing list before
  merging.
- **v100 (1.68.0)** — Two more recipe-import matching fixes reported from
  real households: (1) "extra virgin olive oil" was being suggested as a
  new "Olives" product instead of "Olive Oil" — the curated reference
  list's whole-phrase match correctly found "Olive Oil" first, but a
  leftover single word ("olive") then scored an inflated similarity
  against the unrelated "Olives" entry and silently overwrote the
  already-correct answer just for having a numerically higher score. A
  single leftover word can no longer outrank a whole-phrase match for a
  word it already accounts for (it can still rescue a genuinely different
  match the phrase level missed entirely, like "salt" out of "kosher salt
  and pepper" — that case still works). (2) An unqualified "pepper" (no
  vegetable or spice word either way) now defaults to meaning the ground
  spice rather than staying ambiguous, so it can't accidentally match a
  real vegetable-pepper product (bell, poblano, serrano, ...) - only an
  explicit vegetable-pepper variety name still reads as the vegetable.
- **v99 (1.67.0)** — Fixed a whole category of recipe-import matching
  false positives reported from a real household: "1 teaspoon garlic
  powder" was silently matching their existing "Garlic" product (tracked
  by the clove) — garlic powder and fresh garlic are different purchases
  that just happen to mostly share the word "garlic". Auditing the rest
  of the matching logic turned up the same shape recurring across most
  dried herbs vs. their fresh counterpart (dried oregano/parsley/
  rosemary/thyme/basil/sage/tarragon/marjoram/chives vs. the fresh herb),
  dried fruit vs. fresh (dried cranberries/mango), ginger, onion, mustard
  (the ground spice vs. the prepared condiment), cloves (whole vs.
  ground, in both directions), and ground vs. whole/cut meats (ground
  chicken vs. a whole chicken, ground lamb vs. lamb chops/roast, and the
  same for beef/turkey/pork/veal/venison/duck). A recipe ingredient that
  explicitly names the processed form (powder/powdered/granulated/dried/
  dehydrated/minced/ground) no longer matches a real product whose name
  carries no such qualifier, and the rarer reverse case (the ingredient
  says "whole"/"fresh" but the matched product name is itself the
  processed form) is blocked too — same "no match is safer than a wrong
  match" principle as the existing bell-pepper-vs-black-pepper guard, so
  it falls through to the reference-list suggestion or the manual picker
  instead. An ingredient that names one of these words with no qualifier
  at all (a bare "basil" or "chicken") is left untouched either way —
  that's the normal, desired case of matching whatever single product a
  household actually stocks for it.
- **v98 (1.66.0)** — Two more recipe-import matching fixes reported from
  real households: (1) "bell pepper" no longer fuzzy-matches an existing
  "Black Pepper" spice product — the vegetable and the ground spice are
  completely different foods that just happen to share the word "pepper",
  and a household's own product being named more specifically ("Black
  Pepper") was exactly what let the character-similarity match slip
  through. Bell pepper varieties (sweet, chili, poblano, jalapeño,
  habanero, and more) are now recognized as the vegetable and never
  matched against a spice-only product, and vice versa. (2) A plain
  quantity range ("1-2 russet potatoes", "3-4 cloves garlic") now resolves
  to its upper bound instead of failing to parse - previously this left
  very ordinary countable ingredients defaulting to "Don't count toward
  stock" on the review screen every time, since that checkbox just follows
  whether a usable number came back at all.
- **v97 (1.65.0)** — Two follow-up fixes to the Salt and Pepper split from
  v96, both reported from a real household's import: (1) a short, generic
  seasoning word like "Salt" or "pepper" now matches an already-existing
  Grocy product whose name is more specific ("Table Salt", "Black
  Pepper") instead of only ever being offered as a "create new product"
  suggestion from the curated reference list — the word being short is
  exactly what made the old similarity-ratio match miss it; and (2) a
  recipe source's doubly-HTML-escaped ingredient text ("Salt &amp;amp;
  pepper", from a site whose own CMS escaped already-escaped text) now
  fully decodes before splitting, instead of the leftover entity garbling
  the second half of the split ("amp;amp; ...").
- **v96 (1.64.0)** — Fixed the "Salt and Pepper Problem": a recipe's
  ingredient list very often writes both seasonings on one line ("Salt and
  freshly ground black pepper", "Kosher salt and pepper to taste", "salt &
  pepper"), which the importer used to treat as a single ingredient and
  fuzzy-match (often wrongly) as if it were one product. That combined line
  now splits into two independent, independently-matchable ingredient rows
  before matching runs, for both the link-import and paste-in-text import
  paths. Deliberately narrow — only a "salt ... and/& ... pepper" line
  (either order) triggers the split, so unrelated "X and Y" ingredients
  (like "macaroni and cheese") and longer 3+ item lists ("salt, pepper, and
  paprika") are left exactly as typed.
- **v95 (1.63.0)** — Packaged the integration for GitHub/HACS distribution
  (moved to a `custom_components/family_hub/` repo layout, added a
  HACS-compatible `hacs.json`, `LICENSE`, and `.gitignore`). Also
  de-emphasized the Theme Builder sidebar panel in this README for the
  beta - it still ships and still registers itself, but it isn't a
  documented/supported feature yet. Built-in preset themes and the Theme
  Selector card remain fully documented and supported.
- **v94 (1.62.0)** — Retired the standalone Meal Suggestions modal entirely.
  The "💡 Meal Suggestion" option on the + button and the header's
  "💡 Suggestions" button now both open the Recipe Box, straight to its
  existing "💡 Suggested" filter chip - since the Recipe Box already
  replaced the Suggestions box's own add/edit mechanisms back in v92, this
  finishes the job by removing the last bit of the old modal (viewing/
  picking suggestions) instead of leaving a redundant second box around
  for it.
- **v93 (1.61.0)** — Merged the standalone "Grocery List" modal (push a
  planned recipe's missing ingredients onto Grocy's shopping list) into the
  "Shopping List" modal as its own tab, alongside the live Grocy list
  itself - they were really one errand (plan the ingredients, then shop
  and put them away), so there's now a single More-menu entry with two
  tabs instead of two separate buttons. Also added an optional Price field
  to the Put Away panel, next to Location and Expires, so putting an item
  away can record its purchase price the same way Grocy's own
  barcode-scan flow does - which feeds the shopping list's cost estimate
  and future "last known price" lookups.
- **v92 (1.60.0)** — The Recipe Box is now the only place a suggestion or a
  Recipe Box entry gets created. Removed the Meal Suggestions box's own
  free-text add row and its own "Add from Grocy" button - to suggest a
  meal now, search the Recipe Box and tap its light-bulb icon, or check the
  new "Also add to Meal Suggestions" checkbox while adding/editing a
  recipe. Also added fuzzy-duplicate detection: adding a recipe or a
  suggestion that's a near-match for an existing one (typos, punctuation,
  accents) now prompts before creating a separate entry, instead of
  silently piling up duplicates. This check only fires on deliberate
  "add a recipe" actions, not on the day/menu editor's routine per-save
  mirror into the Recipe Box, so normal weekly meal planning isn't
  interrupted.
- **v91 (1.59.0)** — Fixed Grocy recipes not showing up in the Recipe Box.
  A live check of a real household's data found the exact gap: their Grocy
  had recipes with no matching Recipe Box card at all, because nothing ever
  connected the two. The Grocy picker only ever fed Meal Suggestions (via
  the Suggestions box's own "Add from Grocy" button), and "Import from a
  link" deliberately only creates the Grocy side, not a Recipe Box entry -
  so a recipe that already existed in Grocy, or was imported via a link,
  had no path into the Recipe Box's own list. Added an "Add from Grocy"
  button to the Recipe Box itself, right alongside "+ Add Recipe" and
  "Import from a link" - picking a recipe there adds it straight into the
  Recipe Box with its Grocy link intact, so photo hydration, the Recipe
  Viewer, and cascade-delete all work on it exactly like any other
  Grocy-imported dish.
- **v90 (1.58.0)** — Fixed the Recipe Box not showing photos pulled in from
  Grocy, even for recipes confirmed (via a direct backend check) to have a
  real photo available. The card's Recipe Box list is refreshed wholesale
  from its own Store on every load, dashboard reconnect, and the 60-second
  poll, and that Store never keeps a copy of a Grocy-fetched photo (only the
  card's in-memory hydration does) - so every refresh handed back a
  Grocy-linked recipe with no photo again. The photo-fetch logic itself
  correctly skips re-asking Grocy for something it already resolved once,
  but it was ALSO skipping the (much cheaper) step of just re-applying that
  already-known photo to the fresh recipe object - so a photo that loaded
  fine right after opening the Recipe Box would silently vanish again at the
  very next poll, and would never show at all if the Recipe Box wasn't
  opened within that first ~60 seconds. Already-resolved photos are now
  reapplied to every fresh refresh immediately, with no extra Grocy calls.
- **v89 (1.57.0)** — Added two more screens to the first-time setup wizard,
  between the to-do list step and the dashboard step. First, Notifications:
  a default target for calendar event reminders (used whenever a calendar
  doesn't have its own override), and separately which device(s) should
  get standalone Reminders - the latter only applies if a Reminders to-do
  list was actually picked or created a moment earlier, since there's
  nothing to key the notification to otherwise. Second, Daily Digest: off
  by default (this is the one step in the wizard that starts actively
  sending something on a schedule rather than just getting an entity or
  connection ready, so it shouldn't default to on), with a time and
  recipient picker if turned on now. Both notification choices reuse the
  exact same per-target overrides storage Configure's Calendar reminders
  step and the card's own Settings notify pickers already read from -
  keyed by the reminders to-do entity for the first and a reserved digest
  key for the second - so anything picked here shows up correctly in
  either place afterward. The finish screen's summary was extended to show
  both.
- **v88 (1.56.0)** — Added a fourth screen to the first-time setup wizard:
  "would you like a dedicated Family Hub dashboard?" - one full-screen view
  with the calendar card filling the whole page, the same layout this
  project has always recommended for a wall tablet. Saying yes doesn't
  create the dashboard directly - there's no supported way for an
  integration to do that (the Home Assistant object that would allow it
  isn't exposed on any current release, confirmed by checking Home
  Assistant's own source rather than assuming), unlike the dashboard
  *resource* auto-registration this integration already does elsewhere.
  Instead, the finish screen shows the exact dashboard YAML to paste in via
  Settings > Dashboards > Add Dashboard > Edit in YAML - already filled in
  with whichever calendars and Meal Plan/Reminders to-do lists were picked
  earlier in the same wizard run, so pasting it in is genuinely the last
  step, not the start of more manual configuration. Declining (or leaving
  it for later) skips straight to finishing setup with no dashboard section
  shown.
- **v87 (1.55.0)** — Added a first-time setup wizard instead of the old
  single zero-input step. Adding the integration now walks through three
  short, entirely skippable screens: which calendars to watch for event
  reminders, an optional Grocy connection, and getting Meal Plan/Reminders
  each pointed at a real to-do list - leaving either of the last two blank
  has Family Hub create a fresh Local To-do list for it automatically
  rather than requiring a trip to Settings > Devices & Services > Add
  Integration > Local To-do first. All three were always reachable
  one-at-a-time afterward via Configure (Calendar reminders, Grocy) or by
  hand-typing an entity id into the calendar card's own config - that still
  works exactly the same and nothing here is required, this just means a
  fresh install isn't a blank calendar with reminders silently off until
  someone goes looking for Configure. One real limitation worth calling
  out: the wizard seeds the *backend's* to-do entity options so the
  reminders/digest poller has something to read immediately, but the
  calendar card's own `meal_plan_entity`/`reminders_entity` config fields
  live in Lovelace, not in this integration, so whichever to-do list ends
  up in play (shown on the wizard's final screen) still needs to be copied
  into the card's YAML the first time it's added to a dashboard.
- **v86 (1.54.0)** — Recipe Box and Meal Suggestions no longer live on
  Home Assistant to-do lists. Both used to store their data as JSON
  crammed into a to-do item's `description` field, with the "done"
  checkbox repurposed to mean "loved" - a fit that was never quite right,
  since neither one is a task anybody checks off or manages through
  Home Assistant's own to-do UI or voice assistants (unlike Reminders and
  the day-by-day Meal Plan, which stay on to-do lists for exactly that
  reason - they genuinely benefit from due dates and native to-do
  integration). Both now save to their own dedicated storage, the same
  pattern Settings already moved to a few versions back: a household's
  first load after updating reads whatever's still sitting in the old
  `todo.recipe_box`/`todo.meal_suggestions` lists exactly once and copies
  it over, and every load after that uses the new storage directly - the
  old to-do items themselves are left alone, never deleted or written to
  again, so there's nothing to lose if anything looks off. Recipe editing
  is also simpler under the hood as a result: adding a recipe used to
  require creating the to-do item and then immediately reading it back to
  mark it "loved," since `todo.add_item` couldn't set that in one step -
  now it's just saved directly.
- **v85 (1.53.1)** — Fixed two Recipe Box rough edges reported right after
  v84 shipped. First, tapping the lightbulb "suggest this" icon on a card
  or list row silently added the recipe to Meal Suggestions in the
  background with no visible change to the icon itself, so it looked
  like tapping it did nothing (worse, tapping it again just added a
  second, duplicate suggestion, since there was no way to tell it had
  already worked). The icon now lights up once a recipe is suggested,
  tapping it again removes the suggestion instead of adding a duplicate,
  and both card and list-view icons stay in sync with the actual
  Suggestions list. Second, added a "💡 Suggested" filter chip next to
  "All" and "❤️ Loved" so a household can jump straight to just the
  recipes currently sitting on their Suggestions list without leaving the
  Recipe Box - matching the "Suggested first" sort option that already
  existed but had no equivalent filter.
- **v84 (1.53.0)** — Four related Recipe Box upgrades, all in the same
  release since they touch the same modal. First, a grid/list view toggle
  (two icon buttons above the search box) - list view trades the
  Pinterest card grid for a compact scrolling row-per-recipe layout with
  the same photo, name, category, heart, and suggest actions, and the
  choice is remembered per device (like the calendar's own "show
  timeline" toggle) rather than reset every time the modal reopens.
  Second, a sort dropdown next to the search box - Default, Name (A-Z),
  and Suggested first, the last of which bubbles any recipe currently
  sitting on the Meal Suggestions list to the top without disturbing the
  order of everything else, so a household deciding what to cook can see
  at a glance which of their saved recipes they'd already flagged as
  something to make soon. Third, the day/menu editor's old three separate
  buttons - "From suggested," "Pick from loved," "From Grocy" - are now
  one "Pick a Recipe" button that opens the full Recipe Box in picker
  mode: same search, category filter, sort, and grid/list view as
  browsing, the only difference being that tapping a card fills in the
  editor and closes instead of opening dish detail, and the bulk-select
  entry point is hidden since that's not a task that belongs mid-picking.
  This means picking a recipe for the week no longer has three narrower,
  inconsistent lists to remember - it's the same Recipe Box either way.
  Fourth, deleting a recipe now actually removes it from Grocy too when
  it was imported from there (previously, deleting from the Recipe Box
  only removed the local todo item, leaving the recipe itself still
  sitting in Grocy) - both the dish detail screen's Delete button and the
  day editor's Delete button now cascade to a new
  `family_hub/delete_grocy_recipe` DELETE call, treating an already-gone
  recipe (404) as success rather than an error. Alongside that, a new
  "Select" button puts the Recipe Box into a bulk-select mode - tapping
  cards checks them instead of opening detail, a bar at the top shows how
  many are selected with Cancel/Delete actions, and Delete removes every
  checked recipe one at a time (cascading to Grocy for whichever ones
  need it), so clearing out a handful of recipes no longer means deleting
  them one modal-reopen at a time.
- **v83 (1.52.1)** — Fixed Recipe Box cards showing a blank placeholder
  tile instead of the recipe's actual photo for anything imported from
  Grocy. The card grid's photo field only ever came from a Photo URL
  someone manually typed into the dish editor - it never reflected a
  Grocy recipe's own photo, which lives entirely in Grocy's file storage
  and, until now, was only ever fetched one recipe at a time when opening
  that recipe's Recipe Viewer. The grid now fetches that photo in the
  background for any card with a Grocy origin and no manual photo set,
  fills it in once it lands, and caches the result (including "Grocy
  genuinely has no photo for this one") so reopening the Recipe Box or
  typing in its search box doesn't refetch the same recipes over and
  over. A manually-set Photo URL still always wins - this only fills the
  gap for cards that would otherwise show nothing.
- **v82 (1.52.0)** — Redesigned the Loved Dishes modal into a full Recipe
  Box: a Pinterest-style scrolling grid of every saved recipe (not just
  loved ones), with a corner heart on each card that toggles the exact
  same loved/unloved rating used everywhere else in the app (the day
  editor's own rating buttons, the dish detail screen), a light-bulb icon
  to instantly add that dish to Meal Suggestions without leaving the grid,
  and a filter chip row - All, ❤️ Loved, and one chip per category
  actually in use - built dynamically from whatever categories a
  household has typed into their own recipes, plus a search box that now
  also matches on category. Recipes gained two new optional fields to
  support this: Category (a free-text field with autocomplete suggestions
  drawn from existing recipes, so "Kid-approved" or "Slow cooker" just
  works the first time someone types it) and Photo URL (with a live
  preview under the field), both edited from the same recipe editor used
  for everything else and shown as a small thumbnail on each grid card
  (a plain initial-letter tile when no photo is set). "+ Add Recipe" and
  "Import from a link" sit right above the grid so a new recipe can be
  created without hunting for a separate entry point. The one thing that
  deliberately didn't change is the "Pick from loved" flow opened from a
  day's menu editor - it's a different task (grabbing a dish already
  known to work for tonight, not browsing everything) so it keeps its own
  simpler, loved-only list exactly as it was. Under the hood, the new
  grid/chip/card styling was added as its own set of classes rather than
  changing the existing `.loved-item`/`.loved-list` styling those shared
  classes are still rendered, unchanged, by three other modals
  (Suggestions, the Grocy recipe picker, and Meal Templates), so
  restyling them directly would have altered all three by accident.
- **v81 (1.51.0)** — Two independent additions. First, the recipe
  importer's grocery reference list (the fallback suggestion used when an
  ingredient doesn't match anything already in a household's own Grocy)
  now includes every Torani Original Syrup flavor and every Dopoco Classic
  Flavor syrup as their own dedicated entries, plus an expanded spice
  section covering things like dried minced onion, dried minced garlic,
  bouillon cubes, and several seasoning blends that weren't in the list
  before. Getting the dried-onion/garlic entries to actually win a match
  (instead of falling back to fresh Yellow Onion or Garlic, since the
  matcher's own descriptor-word stripping treats "dried" and "minced" as
  generic prep-state noise) needed a small fix to `_match_grocery_reference`
  itself: it now tries the ingredient text with only structural noise
  removed (parentheticals, trailing commas) before falling back to the
  more aggressively descriptor-stripped version, so a specific dedicated
  entry wins a tie against a shorter, less specific one. Second, the
  ingredient review list on the recipe import screen now has a search box
  above it - useful for a recipe with a long ingredient list, or for
  checking whether a spice already has a row before adding it again.
  Filtering is instant and purely visual (it never touches the underlying
  match data), and the search text is preserved across the screen's own
  re-renders.
- **v80 (1.50.0)** — Rather than only computing missing standard cooking
  conversions on the fly during a recipe import (v78), family_hub now
  proactively pushes a full set of standard English/metric unit
  conversions - teaspoon, tablespoon, fluid ounce, cup, pint, quart,
  gallon, milliliter, liter, ounce, pound, gram, kilogram - directly into
  a household's own Grocy instance, so Grocy's own stock/shopping-list/
  recipe math (not just anything routed through family_hub) has these
  available too. Every direct pairwise combination within each measurement
  category gets its own conversion row (not just adjacent units - a
  teaspoon-to-gallon conversion doesn't get inferred by chaining
  teaspoon-to-cup and cup-to-gallon together, so it needs its own direct
  row), added if missing or corrected if a household had one set up with a
  wrong factor. A real, product-specific conversion (a genuine density fact
  like "1 cup of this flour = 120 g") is never read, added, or touched -
  only Grocy's own generic, "applies to every product" conversions are
  ever in scope. This runs once automatically in the background after
  setup or an update that adds anything new to the standard conversion
  set - not on every single restart - and never delays the rest of startup
  even if Grocy is slow or briefly unreachable; a run that hits any errors
  is simply retried on the next restart instead of being marked done with
  some conversions still missing.

- **v79 (1.49.5)** — Fixed a display side effect of v78's own conversion
  fix: Grocy shows a recipe position's free-text "variable amount" in place
  of the plain number, but still shows it paired with whatever quantity
  unit that position actually carries. Once v78 started substituting a
  mismatched ingredient's unit for its product's own stock unit (to satisfy
  Grocy's insert requirement), the display text was still just the bare
  original number - pairing it with the substituted unit could show, say,
  "2 tablespoon" for a recipe that actually called for 2 teaspoons of
  Worcestershire sauce, a 3x overstatement. The display text now always
  carries the ingredient's own originally-written unit alongside its
  number, decoupled entirely from whatever unit it ends up actually stored
  under for Grocy's stock math - so the recipe page always reads exactly as
  it was written, regardless of any unit substitution happening behind the
  scenes.

- **v78 (1.49.4)** — Follow-up to v77's fix, after being asked whether
  family_hub could resolve a missing unit conversion itself instead of
  just disabling stock tracking for that ingredient. For a plain
  same-category mismatch - cup vs. tablespoon, teaspoon vs. tablespoon, any
  volume-to-volume or weight-to-weight pair - the ratio is a fixed, real
  fact true for every product on earth (1 cup is always 16 tablespoons),
  not something that actually needs a household to have configured
  anything in Grocy first. Those are now computed and converted
  automatically, so an ingredient like the Sliders' butter (cups) or
  Worcestershire sauce (teaspoons) reaches Grocy in its product's own stock
  unit (tablespoons) with the amount correctly converted and stock tracking
  left on - not silently disabled. A cross-category mismatch (a spice
  measured in teaspoons matched to a product stocked by the whole
  vegetable, say) still has no real conversion to compute - a teaspoon of
  dried onion isn't a fraction of a whole onion - so that case still falls
  back to v77's "don't count toward stock" behavior, which is the correct
  outcome for a genuine ingredient/product mismatch rather than a missing
  conversion.

- **v77 (1.49.3)** — v76's expanded debug button finally surfaced the real
  answer for the household stuck at "why only 5 ingredients?": every one of
  the 5 failing rows came back with the same Grocy error, "Provided qu_id
  doesn't have a related conversion for that product." Grocy's own
  recipes_pos insert hard-rejects a position's unit outright unless it's
  that exact product's own stock unit or has a real conversion set up
  between the two - the review screen's unit warning already caught some of
  these ahead of time (and, on two of the five, wasn't even checking the
  right product's data to catch it at all), but nothing ever stopped the
  mismatched unit from being sent anyway and hitting Grocy's hard
  rejection. Every ingredient's unit is now checked against Grocy's real
  product/conversion data right before the row that enforces it, falling
  back to that product's own stock unit (with stock-fulfillment checking
  turned off, since the amount number can't be trusted in a unit Grocy
  doesn't know how to convert) instead of failing the ingredient outright -
  the recipe's written amount and unit still display exactly as typed
  either way. A real recipe that previously sent 5 of 10 ingredients to
  Grocy now sends all 10.

- **v76 (1.49.2)** — Even with v75's fix keeping the "N need to be added
  by hand: ..." summary on screen, a household kept sending over the
  pre-creation "Copy debug info" dump instead of that summary text when
  asking why specific ingredients weren't reaching Grocy - so the debug
  button itself now captures the real answer too. After pressing "Add to
  Grocy," the same "Copy debug info" button also includes Grocy's actual
  outcome from that attempt (how many were added, which raw ingredient
  lines were skipped and Grocy's own reason for each one, any photo
  warning) alongside the existing pre-creation match predictions - so one
  button press now gets the real per-ingredient rejection reasons
  regardless of which text a household happens to reach for.

- **v75 (1.49.1)** — A household sent over the new "Copy debug info"
  dump from v74 for a 10-ingredient recipe where only 5 ended up in
  Grocy's ingredients list, and it showed all 10 correctly carrying a
  real product id and being sent - meaning the actual failures were
  happening on Grocy's own end, per-ingredient, during recipe creation.
  Grocy's real API errors for the missing ones were already there in the
  finished summary text ("N need to be added by hand: ...", with each
  one's own reason since v72) - but the importer was still auto-closing
  that summary after a flat 1.6 seconds regardless of how much there was
  to read, the same delay used for a fully clean success. A summary with
  several skipped ingredients (or a failed photo attach) now stays open
  until closed by hand instead of racing that clock; a fully clean
  success still auto-closes same as before. This also caught (and fixed)
  a related test gap: a couple of the importer's own tests were
  asserting an outdated, incorrect expectation about which ingredients
  get sent to the backend at all (every raw line is sent, with a null
  product id for anything unmatched - the backend decides what to skip,
  not the card) - that assertion's own failure was being silently
  swallowed by the importer's error handling instead of surfacing, a
  false-pass masking real drift between the test and the code.

- **v74 (1.49.0)** — Follow-up to v73, after a household reported an
  ingredient with an existing Grocy product ("Deli Turkey" in their case)
  still not auto-matching, and asked for a way to see exactly why a
  10-ingredient recipe was only sending 4 or 5 to Grocy. Matching an
  ingredient against a household's own real Grocy products now also
  tries a version of the ingredient text with parenthetical asides and
  anything after the first comma stripped ("cooked deli ham (thinly
  sliced)" now matches an existing "Deli Ham" product it previously
  missed), on top of the raw text - never a downgrade, only used when it
  scores better. On the "+ Add new product" mini-form, submitting a name
  that already exists in Grocy (case-insensitive) no longer tries to
  create a duplicate and hit Grocy's own unique-name error - it matches
  the ingredient to that existing product instead. The recipe importer
  also has a new "Copy debug info" button next to "Add to Grocy" that
  copies (and logs to the console, in case clipboard access isn't
  available) every ingredient line's raw text, auto-match, and final
  choice - including whether it will actually reach Grocy - without
  creating anything, so a mismatch can be diagnosed from the exact data
  instead of a description of the symptom. Separately, the "Show
  ingredient list in recipe preparation text" Settings toggle from v73 is
  gone - the written-out ingredients list now always lives in a
  collapsed-by-default accordion in the Recipe Viewer's description
  instead, a tap away on any recipe without a per-device setting to find
  or a permanent duplicate of the structured list above it.

- **v73 (1.48.2)** — Two related recipe-importer gaps reported together.
  First, "Manage Ingredients with Grocy" only ever creates `recipes_pos`
  rows for ingredients that resolved to a real Grocy product; anything
  that didn't match was quietly left out with no indication of what
  happened, so a recipe could come in visibly missing items. Creating a
  recipe now checks the match count first and, if it's a partial match,
  asks for confirmation with the actual numbers - "Matched 2 out of 3
  ingredients to Grocy. Continue? This will leave the 1 unmatched
  ingredient out of the recipe's ingredient list in Grocy (it'll still
  show up in its written-out ingredients text)" - before doing anything,
  so nothing disappears from a recipe without the person choosing that.
  Second, and the real root cause of "the recipe viewer isn't showing my
  ingredients": the Recipe Viewer redesign in v70 added logic to hide the
  recipe's raw written-out ingredients text whenever a structured
  ingredients list was present, on the assumption the two always said the
  same thing. They don't when some ingredients were skipped for lack of a
  Grocy match - the structured list is missing exactly the items the
  person was asking about, and the raw text (the only place those items
  still appeared) was being stripped out from under them. The dedup logic
  now only hides the raw text when its ingredient count actually matches
  the structured list's count line-for-line; any mismatch leaves it
  visible. On top of that fix, Settings > Grocy has a new "Show ingredient
  list in recipe preparation text" toggle (device-local, off by default)
  for anyone who'd rather always see the written-out list, even on a
  recipe where every ingredient matched and the structured list alone
  would otherwise be enough.

- **v72 (1.48.1)** — A household hit a "+ Add new product" create that
  failed with nothing more than "Grocy returned HTTP 400 for
  /api/objects/products" - technically true, but useless for figuring out
  what to actually change (a colliding product name? an invalid location?
  something else?). Grocy's own API does send a real reason in its error
  response body on a failed create/edit, but every Grocy call in this
  integration discarded it and raised only the bare HTTP status. All four
  low-level Grocy request helpers (`_grocy_api_get/post/put/delete`) now
  try to read that reason out of Grocy's response and include it in the
  error shown here, e.g. "Grocy returned HTTP 400 for
  /api/objects/products: Name must be unique" - the same status is still
  there, just with the actual cause attached. This applies to every Grocy
  action across the integration (recipes, shopping lists, put-away, unit/
  location creation, and more), not just the new-product form.

- **v71 (1.48.0)** — Fixed a real household bug where a reference-list
  suggestion's units silently weren't applied: an ingredient like "Celery"
  (which `grocery_reference.py` already correctly maps to sold-by-the-bunch,
  used-in-stalks) still opened the "+ Add new product" form with generic
  defaults ("Piece" and "Same as stock unit") if the person picked
  "+ Add new product…" straight from the ingredient row's own dropdown,
  instead of first clicking the separate suggestion banner's own "Use
  this" button. Only that second, easy-to-miss path ever applied the
  suggestion. Both ways of opening the create-product form now share the
  same logic, so the suggested units (and, when this household's Grocy
  doesn't have them yet, auto-creating them) apply no matter which one is
  used.

- **v70 (1.47.0)** — Visual redesign of the Grocy Recipe Viewer to match
  a mockup provided directly, while keeping every existing feature (the
  live servings scaler, Mark Consumed, Open in Grocy, and the preview
  mode's Back button) working exactly as before:
  - The title is now centered and larger, and a new row of Prep/Cook/
    Total stat pills sits below it - populated only from real data the
    recipe already has (parsed prep/cook time, or their sum when both are
    present and cleanly parseable back into minutes). A recipe missing
    any of the three just shows fewer pills, and one missing all three
    shows none at all - nothing here is ever fabricated or guessed at, in
    line with keeping this a simple, honest restyle rather than adding
    review counts or a "Chef's Tips" box that don't correspond to
    anything Grocy actually stores.
  - The ingredients list and the recipe's photo now sit side by side in a
    two-column layout on wider screens (stacking normally on mobile), and
    each ingredient gets a small numbered circular badge in place of the
    plain leading amount text - the amount itself moved down next to the
    product name so nothing shown before is lost.
  - Recipes imported via this card's own "Import a recipe from a link"
    flow write a predictable "Preparation" block into their description;
    that block now renders as numbered Instructions steps (matching the
    ingredients list's badge style) instead of a plain paragraph dump.
    Recipes without that exact structure (hand-typed directly in Grocy,
    older imports) fall back to the previous raw-HTML rendering exactly
    as before - nothing changes for them.
  - Once the Ingredients list and Prep/Cook line have their own dedicated
    elements above, the raw copies embedded in the description are
    stripped out so they don't appear twice on the page - except when
    "Manage Ingredients with Grocy" was off during import (task #243), in
    which case there's no structured ingredients list at all and the raw
    one is the only place that information exists, so it stays. A Source
    link, or anything else not covered by the new structured elements,
    is always preserved.

- **v69 (1.46.0)** — Two real-household bug fixes for the recipe
  importer's ingredient matching:
  - "2 1/2 cups chicken or vegetable stock" was silently matched to an
    existing "Vegetable Oil" product (the shared word "vegetable" was
    enough to clear the old 0.5 match threshold even though the products
    aren't related) - the wrong product, and its amount, then got
    attached to the recipe with no warning. The real-product match
    threshold is now 0.6, which stops this specific kind of coincidental
    partial-word match while still finding everyday near-exact matches
    (plurals, minor typos). Anything this is now more cautious about
    still gets a reference-list suggestion or the manual picker instead
    of a silently wrong match.
  - "Use this" on a reference suggestion now creates whichever of its two
    units (sold by / used in) don't already exist in this household's
    Grocy, instead of leaving that picker blank when only generic units
    like "piece"/"pack" exist so far. The suggestion already named the
    exact units it means before you clicked - this makes "Use this"
    actually one click instead of one click plus a manual "+ Add new
    unit…" prompt per missing unit. Suggesting the same unit for a later
    ingredient in the same import reuses the one already added rather
    than creating a duplicate.

- **v68 (1.45.0)** — A much bigger grocery reference list, and clearer
  unit language throughout the recipe importer:
  - `grocery_reference.py` grew from ~324 items to 589, filling in real
    gaps the original pass missed - chicken wings/drumsticks/tenders,
    a dozen more cheeses, sourdough/rye/naan, arugula and a dozen other
    greens, poblano/serrano/habanero peppers, wild rice and half a dozen
    more pastas, cream of tartar and extract flavors, a full second pass
    of canned goods (soups, more beans, roasted red peppers), sauces
    (pesto, gochujang, buffalo, miso), two dozen more spices (saffron,
    za'atar, cardamom, Old Bay, seasoned/garlic/onion salt), more snacks
    and nuts, sodas/juices/cooking wines, more frozen aisle staples, and
    international pantry items (harissa, dashi, hummus, nori, masa
    harina). Still organized by category with the same conservative
    factor policy - only 33 items carry a purchase-to-stock conversion,
    all either exact unit facts or well-established baking references.
  - Fixed a real gap found right after v67 shipped: a coincidental
    few-letter overlap could make the per-word matching fallback suggest
    something nonsensical for genuinely unmatched text (e.g. "secret"
    scoring 0.77 against "Sherbet"). Single leftover words now need a much
    higher match confidence (0.85) than a full cleaned phrase does (0.72),
    since difflib's overlap ratio is unreliable on short strings - this
    only affects whether a suggestion shows at all, never a false "match"
    against your own real Grocy products.
  - The ingredients list now shows which unit Grocy will actually track
    an ingredient's stock in once it's matched to a real product - e.g.
    "(matched "All-Purpose Flour" · used in pound)" - instead of that only
    being visible indirectly through a conversion warning.
  - The "+ Add new product" form's two unit fields are now labeled in
    plain language - **Sold by** and **Used in** - instead of Grocy's own
    internal "Purchase unit" / "Stock unit" terms, matching the wording
    already used in the reference-list suggestion hint.

- **v67 (1.44.1)** — Bugfix: the v66 reference-list suggestion almost
  never showed up on real recipes. It matched an ingredient's whole
  remaining text as one string, so anything with the usual prep words and
  asides around the actual item - "diced sweet onion, (roughly one large
  onion)", "garlic cloves, (minced)", "kosher salt and pepper" - scored
  far below the matching cutoff even though the item itself was obvious.
  Ingredient text is now cleaned before matching: parenthetical asides and
  anything after the first comma are dropped, then a list of common
  prep/descriptor words (diced, minced, chopped, kosher, cloves, and
  unit words that leak in from unparsed quantity ranges like "18 to 24
  ounces", etc.) is stripped out - both the cleaned phrase and its
  individual leftover words are tried against the reference list, so
  "sweet onion" still matches "Onion" even though "sweet" isn't
  recognized as a descriptor. This only changes the suggestion shown for
  an unmatched ingredient - it never touches matching against your own
  real Grocy products.

- **v66 (1.44.0)** — The recipe importer gets smarter about unmatched
  ingredients, and gets an off switch:
  - A curated reference list of ~324 common grocery items
    (`family_hub/grocery_reference.py`), each with the unit it's typically
    sold in (purchase unit) and the unit a recipe usually calls for it in
    (stock unit). A handful of items - the ones with a genuinely exact or
    well-established conversion, like 16 cups/gallon or King Arthur
    Baking's ~3.78 cups/lb of all-purpose flour - also carry a
    purchase-to-stock factor; the rest deliberately don't, rather than
    guessing at a density nobody's verified. This is a starting point to
    speed up adding new products, not a replacement for checking a
    package.
  - When an imported recipe has an ingredient that doesn't match anything
    already in your Grocy, and it's recognized from that reference list,
    the ingredient's row now shows a small "Looks like X — sold by the Y,
    used in Z" hint with a **Use this** button. Clicking it opens the
    existing "+ Add new product" mini-form prefilled with the suggested
    name and units (using this household's own matching units where they
    already exist) - it's still that same fully editable form with its
    own Create button, so nothing is added to Grocy without a look and a
    tap to confirm.
  - A new **Manage Ingredients with Grocy** toggle on the recipe import
    screen, on by default. Turn it off and the whole ingredient-matching
    section (the product picker, unit conversion warnings, "+ Add new
    product" form, and the new suggestions above) disappears - the
    imported recipe still comes in with its ingredients listed as plain
    text, just with nothing linked to a Grocy product, counted toward
    stock, or added to a shopping list. This is a per-device preference
    (remembered across imports), for anyone who'd rather use Family Hub's
    recipe import without also managing Grocy's product/stock side of
    things.

- **v65 (1.43.0)** — Recipe importer polish: a wider modal, and units without
  leaving the page:
  - The recipe import modal is noticeably wider (640px vs. the 480px it
    shared with several other, simpler modals) - each ingredient row packs
    a raw-text field, amount, unit, and product picker onto one line, which
    was cramped at the old width.
  - Every unit picker on that screen - an ingredient's own unit, and the
    "+ Add new product" mini-form's Stock unit and Purchase unit selects -
    now has a "+ Add new unit…" option, the same pattern as the existing
    "+ Add new location…" and "+ Add new product" options. Picking it
    prompts for a name (and an optional plural form, e.g. "cup" /"cups" -
    Grocy doesn't require one), creates it in Grocy, and immediately
    selects it wherever it was added from - no trip to Grocy's own admin
    screens needed for a missing "tablespoon" or "fl oz" mid-import.
- **v64 (1.42.0)** — Shopping-list amounts in units you'd actually buy in,
  not just cook with:
  - When the Grocery List button pushes a week's recipes' missing
    ingredients onto Grocy's shopping list, Grocy itself writes them in
    each ingredient's stock unit (confirmed against grocy/grocy#1615) -
    e.g. "3 cup" of flour, not the 5 lb bag you'd actually buy. Right
    after that push, this integration now converts each of those specific
    rows into the matched product's own purchase unit (using whatever real
    unit conversion is set up on that product in Grocy - e.g. a cup-to-
    pound density factor for flour, or a cup-to-gallon factor for milk)
    and rounds UP to a whole number of it, so the list reads "2 lb" or "1
    gal" instead of a fractional cooking measurement.
  - Only rows for products the push itself just touched are adjusted -
    something already on the list from somewhere else is left alone.
  - A product with no purchase-unit conversion set up in Grocy yet is left
    exactly as Grocy wrote it, same as before - this never invents a
    number, only converts one that's already correct into a more useful
    unit. Set up (or fix) that conversion under the product's own
    "Quantity unit conversions" section in Grocy to get this for it.
  - The push result now reports how many rows got rounded this way as a
    short trailing note (e.g. "Rounded 2 items up to whole purchase units
    (e.g. cups → pounds)."), on top of the usual added/skipped summary.
- **v63 (1.41.0)** — More accurate ingredient quantities on recipe import,
  for better Grocy stock accounting:
  - Grocy's own recipe math (shopping-list "missing" amounts, a recipe's
    "fulfilled" indicator, and the Mark Consumed button from v62) runs on
    each ingredient's real numeric amount + unit — previously every
    imported ingredient was hardcoded to `1`, silently wrong for anything
    that wasn't literally "1 of something." The importer now parses a real
    quantity out of the ingredient's text (whole numbers, decimals, ASCII
    fractions like "1 1/2", and unicode fractions like "½") wherever one
    exists.
  - The review screen's per-ingredient row now has an editable amount field
    and unit dropdown next to the raw text, prefilled from that parse and
    correctable by hand before the recipe is created.
  - Anything the parser can't pin to one clean number — a range ("3-4
    cloves"), or free text with no leading quantity ("a pinch of salt") —
    defaults to a "Don't count toward stock" checkbox (Grocy's own
    `not_check_stock_fulfillment` flag) instead of a made-up amount, so
    Grocy stops factoring it into missing/fulfilled/consume math at all
    rather than being fed a fictional "1."
  - When a chosen unit has no known Grocy unit-conversion path to the
    matched product's stock unit, an inline warning explains it and points
    at fixing it in Grocy or picking a different unit — this can otherwise
    silently produce wrong stock math with no visible error anywhere.
- **v62 (1.40.0)** — "I made this" button, and control over what the
  recipe importer writes into a recipe's preparation text:
  - **Mark Consumed (Recipe Viewer)** — a new button under a Grocy-backed
    recipe's ingredients/instructions calls Grocy's own recipe-consume
    endpoint, deducting every ingredient's needed amount from Grocy stock
    (partial amounts if a product's only partially in stock) - the same
    thing clicking "Consume all ingredients needed" on the recipe's own
    page in Grocy does. Confirmed before firing, since it's a real stock
    transaction with no undo from here. If the viewer's own servings
    scaler has been moved off the recipe's base servings, that scaled
    count is pushed to Grocy first so the right amounts get deducted.
  - **"Include ingredients in the preparation text" checkbox** — the
    recipe importer's review screen (link, paste-text, or manual entry)
    now has a checkbox, checked by default, controlling whether the
    created Grocy recipe's description gets a plain-text "Ingredients"
    list baked in alongside the instructions (see v42's "Imported
    ingredients now show up in the recipe's own description/preparation
    text"). Unchecking it only changes that description text - the
    ingredients still become real Grocy recipes_pos rows either way, so
    matching, the ingredients list, and shopping-list pushes are
    unaffected regardless of which way this is left.
- **v61 (1.39.1)** — Fix: recipe importer text fields (ingredient rows,
  name, servings, instructions, URL/link, paste-in text) never set their
  own background color, so they rode on the browser's default white input
  background while their text inherited whatever color the active theme
  gave the modal - invisible white-on-white text on any theme with light
  body text. Every field in the recipe importer now explicitly pairs a
  theme-aware surface color with the theme's text color. Also fixed several
  Shopping List/Expiring Soon/Low Stock buttons and inputs that referenced
  an undefined `--fc-surface` CSS variable (a typo for `--fc-surface-alt`
  that silently fell back to a transparent background instead of erroring)
  - same latent bug, just less visible until a theme with unusual contrast
    exposed it.
- **v60 (1.39.0)** — Once a day's meal is set, the day editor now shows a
  clean recipe-card summary instead of the full edit form:
  - **Meal view-card** - opening the editor for a slot that already has a
    meal set now shows a read-only card (dish name, Prep/Cook/Serves facts,
    a "View Recipe →" button, and a small pencil button) instead of jumping
    straight to the "From suggested/loved/Grocy" pick buttons and edit
    fields. Tap the pencil to edit the name, description, link, or other
    details; tap Clear (after Edit) to remove the meal and go back to an
    empty slot. The heart/thumbs-down rating buttons stay visible either
    way. The Loved Dishes/Recipe Box editor is unaffected - it's a reusable
    template, not a specific day's meal, so it always opens straight to the
    edit fields.
  - **Prep/Cook time on imports** - importing a recipe from a link whose
    page publishes Prep/Cook time (schema.org `prepTime`/`cookTime`) now
    carries that through to the view card's facts row. Hand-entered or
    pasted-text recipes, and links that don't publish the times, just don't
    show a Prep/Cook fact - no manual entry field was added for those.
- **v59 (1.38.0)** — Manage multiple Grocy shopping lists and add new
  storage locations, both from right inside Family Hub:
  - **Create a new Grocy shopping list from the Shopping List modal** - a
    "+ New List" button next to the list picker lets you name a new list
    (e.g. "Costco") on the spot, without visiting Grocy's own site first.
    Switches straight to the new list once created.
  - **Move an item to a different shopping list** - once a second list
    exists, every item on the in-card Shopping List gets a "Move to
    another list" button (an inline picker of the other list(s), same
    pattern as the existing Scan/Put Away panel). Stays hidden for
    households with just the one default list.
  - **Add a new Grocy location on the spot** - both the Shopping List's
    Scan/Put Away panel and the recipe importer's "+ Add new product to
    Grocy" mini-form now offer "+ Add new location…" in their Location
    dropdown, for a household adding e.g. a garage freezer or a second
    pantry shelf without a trip to Grocy's own admin UI.
- **v58 (1.37.0)** — Grocy Settings cleanup and a per-feature Daily
  Digest toggle:
  - **All Grocy settings now live under one "Grocy" section** in Settings,
    instead of separate "Grocy: Expiring Soon" and "Grocy: Low Stock"
    accordion sections. Nothing about how the toggles work changed - just
    grouped together in one place.
  - **Each Grocy feature now has its own "Include in Daily Digest"
    toggle**, independent of the feature's own on/off switch. Turning on
    Expiring Soon or Low Stock still shows that list under the More menu
    either way; the new toggle controls only whether it also adds a line
    to the morning Daily Digest notification. Defaults to on, so existing
    installs keep behaving exactly as before until this is switched off
    on purpose.
- **v57 (1.36.0)** — Five new opt-in Grocy features, a recipe-importer
  overhaul, and a modal-navigation bug fix:
  - **Low Stock list**: a new "Low Stock" item under the More menu lists
    everything currently in Grocy stock below its own minimum stock
    amount, with a one-tap "Add All to Shopping List" button (Grocy's own
    add-missing-products endpoint). The Daily Digest gains a matching
    "N items running low" line. Off by default - turn it on under
    Settings → "Grocy: Low Stock", independently of "Grocy: Expiring
    Soon".
  - **Recipe suggestions on Expiring Soon items**: items in the Expiring
    Soon list that appear in one of your Grocy recipes now show up to two
    small recipe chips - tap one to preview that recipe without leaving
    the list.
  - **Shopping list cost estimate**: each priced item on the in-card
    Grocy Shopping List now shows an estimated price (from Grocy's
    last-known purchase price for that product), with a running total at
    the top - a ballpark, not an invoice, since unit conversions aren't
    always exact.
  - **Multiple/named shopping lists**: if you use more than one Grocy
    shopping list (e.g. "Costco" vs. a regular grocery run), a picker now
    appears above the in-card list to switch between them. Remembered per
    device, same as the "show timeline" toggle. Households with just the
    one default list never see the extra control.
  - **Recipe importer: paste text, enter by hand, image, and source**:
    "Import a Recipe" now offers three ways in - paste a link (as
    before), paste the recipe's raw text (a new best-effort parser looks
    for "Ingredients"/"Instructions" section headers), or skip straight
    to a blank form and enter it by hand. Every ingredient line is now
    directly editable (and removable), with a "+ Add ingredient line"
    button for filling one in from scratch. The review screen also gained
    an editable Image URL field (so a hand-entered or pasted-text recipe
    can still get a photo) and a Source field that preserves the
    original link when importing from a URL, or lets you type in where a
    hand-entered/pasted recipe came from - both get carried into the
    created Grocy recipe.
  - **Fixed: picking something from a Grocy picker stacked over another
    open screen (e.g. picking a recipe for a meal, or "add to
    Suggestions") could close the screen underneath it too**, with the
    pick never visibly landing even though it had actually been applied.
    Root cause was in the native-back-button handling added in v54: any
    non-back-button modal close calls history.back() to keep the
    back-button's history in sync, and that call's own (delayed) result
    was being misread as a real back-press once it arrived, closing
    whatever was still open at that point. Fixed by tagging each
    self-issued history.back() call so its own delayed effect is ignored
    instead of acted on.
- **v56 (1.35.1)** — Two fixes:
  - **"Expiring Soon" now hidden from the More menu until turned on** -
    previously it always showed up in the menu (following the same
    "always visible, explains what's missing inside" pattern as Shopping
    List/Grocery List), which was clutter for a feature that's off by
    default. It's now hidden entirely until you enable it under Settings
    → "Grocy: Expiring Soon".
  - **Fixed: the + FAB's 4-option add menu (Calendar Entry / Reminder /
    Meal Suggestion / Recipe) would open and then instantly close again**
    instead of showing the picked modal. Root cause was a race in the
    native-back-button handling added in v54: closing the add menu and
    opening the picked modal in the same tap fired an async
    "history.back()" (for the closed menu) that landed after the new
    modal had already opened, so it got closed by mistake. Fixed by
    netting history changes per batch instead of reacting call-by-call.
- **v55 (1.35.0)** — Two new Grocy features, both opt-in:
  - **Shopping list "Scan" (put away) button**: every product-based row in
    the in-card Grocy Shopping List now has a Scan button (📦) next to the
    existing check-off box - checking an item off is still "I grabbed this
    at the store," and Scan is the separate "now I'm putting it away" step.
    Tapping it opens a small panel to pick a location and an expiration
    date (prefilled from the product's own Grocy defaults where set), then
    adds it into Grocy stock at that location/date and takes it off the
    shopping list - the same two things Grocy's own "mark this item
    purchased" flow does, just without leaving the card.
  - **"Expiring Soon" list + Daily Digest counts**: a new "Expiring Soon"
    item under the More menu lists everything currently in Grocy stock
    that's due within the next 30 days, split into "within 7 days" and
    "within 30 days" sections. The Daily Digest also gains a "Grocy stock"
    section with the two counts ("2 items expiring in 7 days" / "5 items
    expiring in 30 days"), omitted entirely on a day when nothing is
    expiring - same as every other digest section. Off by default even
    once Grocy is connected - turn it on under Settings → "Grocy: Expiring
    Soon".
  - Also: a small seasonal easter egg - the calendar's background
    automatically swaps to a pastel ghosts/bats/pumpkins design on
    Halloween (Oct 31, the device's own local date) and reverts the next
    day on its own, regardless of the theme otherwise configured.
- **v54 (1.34.4)** — A mobile device's native back button/gesture (and a
  desktop browser's Back button) now closes whatever modal is currently
  open - the Recipe Viewer's preview screen, a picker, the day/dish editor,
  Settings, anything - instead of navigating away from the dashboard or
  doing nothing. Works generically across every modal in the card (wired
  once, off the same shared "open a modal" code path they all already go
  through), and stacked modals (e.g. previewing a recipe from on top of a
  Grocy picker) only close the topmost one per back-press, matching what
  tapping that modal's own Back/X button would do.
- **v53 (1.34.3)** — The Recipe Viewer's servings scaler now also rescales
  the plain-text "Ingredients" list some recipes carry inside their own
  description/instructions HTML (see v40's "Include ingredients in
  imported recipe's preparation section"), not just the separate
  structured ingredients list above it - previously the two would drift
  out of sync as soon as you touched the +/- stepper. Only the leading
  quantity of each ingredient line is rescaled (handles whole numbers,
  decimals, "1/2"-style and "1 1/2"-style fractions, and unicode fraction
  characters like ½), formatted back as a friendly fraction where it lands
  on a common one; anything else - a range like "3-4 cloves", "a pinch of
  salt", and critically the Preparation instructions below it (so "bake
  for 20 minutes" is never mistaken for a scalable quantity) - is left
  exactly as written. Recipes without that exact "Ingredients" block
  (hand-typed directly in Grocy) are unaffected.
- **v52 (1.34.2)** — Two real bugs from v51, both root-caused and fixed:
  - **The photo (in both the Recipe Viewer and the meal-modal header) and
    the new preview "← Back" button were never actually showing**, even
    when everything server-side was working correctly - the JS was
    "showing" them by clearing their inline `display:none`, but each
    element's own CSS class *also* set `display: none` as its default, so
    clearing the inline override just fell back to that and left them
    hidden. All three now set an explicit `display: block` instead.
  - **The Recipe Viewer's heading rendered underneath Home Assistant's own
    top app bar** on dashboards that show it (not fully kiosk/chromeless).
    The full-screen overlay now offsets itself below however much space
    that bar (or anything else) actually takes up above the card -
    measured live off the card's own position (the same measurement
    `_syncHeight` already used for the card's height), exposed as a
    `--fh-header-offset` CSS variable so it stays correct across screen
    rotations and different dashboard layouts instead of a hardcoded guess.
- **v51 (1.34.1)** — Recipe preview + photo diagnostics:
  - **Previewing a recipe from a Grocy picker now shows a "← Back" button**
    instead of just the plain X close - since the picker underneath stays
    open the whole time, Back makes that explicit rather than implying
    you're leaving the flow entirely.
  - **A recipe photo that fails to download from Grocy is now logged**
    (`_LOGGER.warning`, visible in Settings → System → Logs) instead of
    failing completely silently - this was previously impossible to
    diagnose from the dashboard when a photo just didn't show up.
- **v50 (1.34.0)** — Three Recipe Viewer / Grocy picker improvements:
  - **Recipe photo shown in both places it's relevant**: the Recipe Viewer
    now shows the imported photo as a header image, and the day/dish
    editor shows it as a banner image at the top of the modal too - fetched
    server-side and embedded directly, so the browser never needs the
    Grocy API key.
  - **Preview button on every Grocy picker row**: a small eye icon next to
    each recipe in "Add from Grocy" (and the day editor's "From Grocy"
    picker) opens the full Recipe Viewer for that recipe without picking
    it or closing the picker underneath - handy for checking a recipe
    before committing to it for the week.
  - **Live servings scaler in the Recipe Viewer**: a +/- stepper next to
    the ingredient list recalculates every numeric ingredient amount for a
    different serving count on the fly (client-side, no re-fetch) -
    free-text amounts like "to taste" are left alone. Only appears when
    Grocy returns real numeric amounts to scale.
- **v49 (1.33.1)** — "Import a recipe from a link" moved from the Meal
  Suggestions box to the bottom of the Grocy picker screen ("Add from
  Grocy"), under its list of recipes - importing a link creates an actual
  Grocy recipe, so it now lives with the rest of the Grocy picker instead
  of the freeform suggestion controls. Opening it closes the Grocy picker
  underneath.
- **v48 (1.33.0)** — Further mobile decluttering:
  - **"Loved Dishes" now lives inside the More menu on phone-width
    screens** instead of its own pill, matching how Suggestions already
    moved into the + menu - the standalone button is still there on
    tablet/desktop.
  - **This Week / Next Week / In 2 Weeks folds behind a small toggle**
    under the week label on phone-width screens instead of always taking
    its own row - tap the little arrow to reveal the three choices, tap a
    choice (or the arrow again) to close it. Unchanged on tablet/desktop,
    and switching to Month view (where it doesn't apply) closes it
    automatically if it was open.
- **v47 (1.32.0)** — Two + button / recipe importer fixes:
  - **The + button's 4 choices now open as a real modal** (Calendar Entry /
    Reminder / Meal Suggestion / Recipe), matching every other popup in the
    card, instead of a floating pill list stacked above the FAB.
  - **"Add to Grocy" in the recipe importer now closes the modal** once the
    recipe's created, after a moment for the added/skipped summary to be
    read - it used to leave the importer sitting open indefinitely.
- **v46 (1.31.1)** — Fixed the Recipe Viewer's clipped top on the tablet
  dashboard: the v44 fix for this only lifted the card's overflow:hidden
  inside a phone-width media query, so anything wider than ~700px -
  including the tablet dashboard - still cut off the recipe's title and
  Close button. That override now applies at every screen width, not just
  mobile.
- **v45 (1.31.0)** — Two day/dish editor tidy-ups:
  - **The three "pick a name" buttons (From suggested / Pick from loved /
    From Grocy) now stay on one line** instead of wrapping onto a second
    row - they sit in their own full-width row below the Dish name label
    and share space evenly, shrinking their text with an ellipsis if a
    device is narrow enough to need it.
  - **Card color, Repeat weekly, Servings, and the editable Recipe link
    box are now tucked into a collapsible "More options" section**,
    matching the accordion style already used in Settings - so the editor
    opens showing just Dish name, Description, and Recipe link's Open
    button, with the less-frequently-changed fields a tap away instead of
    always taking up space. The Open-link button itself stays visible
    outside the accordion, so you can still jump straight to a recipe
    without expanding anything.
- **v44 (1.30.0)** — Mobile decluttering plus a full-screen modal fix:
  - **+ button is now a 4-option menu**: tapping it offers Calendar Entry,
    Reminder, Meal Suggestion, or Recipe (import from a link) instead of
    always jumping straight to a new calendar event. Meal Suggestion and
    Recipe just open the same existing Suggestions box / recipe importer -
    nothing about those screens changed, only how you get to them.
  - **Suggestions button removed from the header on phone-width screens**:
    now that adding (or browsing) suggestions is one tap away from the +
    menu, it didn't need its own spot in an already-tight mobile header
    row. Unchanged on tablet/desktop.
  - **Adding a Meal Suggestion with a link now offers to import it into
    Grocy** right away (only asked when Grocy is configured) - saying yes
    opens the recipe importer already fetching that link, instead of
    leaving it as a separate step to remember later.
  - **Fixed a full-screen modal (e.g. the Grocy Recipe Viewer) getting its
    top - including its own Close button - clipped off on phone-width
    screens.** The mobile layout sets `overflow: hidden` on the card to
    contain the calendar grid's own scrolling, which was also clipping any
    full-screen modal to whatever part of the card happened to be visible
    at the time, even though the modal is otherwise positioned relative to
    the real screen. That clipping now lifts automatically for as long as
    any modal is open.
- **v43 (1.29.0)** — An in-card Grocy Shopping List viewer/editor, plus
  four smaller Grocy refinements:
  - **Shopping List (More menu)**: see and edit Grocy's own shopping list
    without leaving Family Hub or logging into Grocy's separate website -
    check items off, remove them, or add a new one by typing a name (and
    optional amount). Typing something that matches an existing Grocy
    product exactly adds it the "real" way (merging into that product's
    existing entry, same as Grocy's own quick-add); anything else is added
    as a plain freetext note, same as Grocy's own shopping list accepts.
    This is separate from the existing "Grocery List" button, which still
    pushes a whole recipe's ingredients onto this same list in one go -
    Shopping List is for viewing/adding individual items.
  - **Full-screen recipe viewer no longer opens mid-scrolled**: reopening
    it after scrolling through a previous recipe now resets back to the
    top instead of reusing the last recipe's scroll position (which could
    cut off the title above the fold).
  - **"From Grocy" button in the meal editor**: the Edit Meal modal's name
    field previously only offered "From suggested" and "Pick from loved" -
    it now also has a direct "From Grocy" button (when Grocy is
    configured) that fills the meal in from a Grocy recipe right there,
    instead of routing through Suggestions first.
  - **Servings field for Grocy-sourced meals**: when a planned meal uses a
    Grocy recipe, an optional Servings field controls how many people that
    specific planned meal should feed - pushing it to the shopping list
    updates the recipe's servings in Grocy first, so the ingredient
    amounts scale to match instead of always using whatever the recipe's
    default happens to be.
  - **Recipe photos now come along on import**: importing a recipe from a
    link also downloads its photo (from the same page metadata used for
    the name/ingredients) and sets it as the recipe's picture in Grocy, so
    imported recipes don't show up bare in Grocy's own recipe list. A
    failed photo (e.g. a broken image URL) doesn't block the rest of the
    import - the recipe still gets created, just without a picture.
- **v42 (1.28.0)** — Three refinements to the recipe importer plus the
  Grocy recipe viewer:
  - **"+ Add new product" now asks for quantity per container**: if you
    buy something in a different unit than you track it in (e.g. a bag
    tracked in grams), pick a separate purchase unit and how many stock
    units are in one container (e.g. "1000" for a 1000g bag). Leave it as
    "Same as stock unit" and nothing changes from before. This sets
    Grocy's own quantity-unit-conversion for the product, editing the
    conversion row Grocy already auto-creates rather than adding a
    conflicting second one.
  - **Imported ingredients now show up in the recipe's own
    description/preparation text**, not just as Grocy ingredient rows -
    every raw ingredient line (matched or not) is listed before the
    instructions, so the recipe reads as one complete piece in Grocy and
    nothing gets silently dropped for an ingredient that didn't match a
    product.
  - **Grocy Recipe Viewer is now full-screen** instead of a small centered
    popup - a recipe is something you actually read start to finish, often
    at arm's length while cooking, not glance at in a box.
- **v41 (1.27.0)** — Header cleanup plus two refinements to last version's
  Grocy features:
  - **"More" menu**: the header had grown to 9 buttons. Templates, Print,
    and Grocery List now live behind a single "More" (⋯) toggle next to
    Suggestions and Loved Dishes, which stay directly visible since
    they're used almost every time. Same buttons, same behavior - just
    tucked away until needed (outside-click, Escape, or picking an item
    all close the menu).
  - **Grocery List now shows what's already been added**: opening it lists
    this week's distinct Grocy-imported meals with an "Added" / "Not added
    yet" status per meal (grouping the same recipe used more than once
    into a single row, since Grocy's ingredient math is per-recipe, not
    per-planned-day), and only pushes the ones you check - previously it
    silently pushed everything, every time, with no way to tell what had
    already been shopped for. Pushes to Grocy also happen strictly one
    recipe at a time now instead of all at once, since Grocy's own "add
    missing ingredients" endpoint nets out what's already on the shopping
    list from the call before it - sequential calls are what makes two
    different recipes sharing an ingredient (e.g. both need onions) come
    out correctly combined instead of double-ordered.
  - **Recipe importer can create new Grocy products**: an unmatched
    ingredient's dropdown now has a "+ Add new product to Grocy…" option
    that opens a small inline form (name, location, quantity unit) right
    there instead of only offering "Skip" or an existing product - no
    trip out to Grocy's own product form needed for common missing
    ingredients.
- **v40 (1.26.0)** — Two new Grocy-powered features (both entirely optional
  - hidden behind the same Grocy connection used by everything else, see
  Settings > Devices & Services > Family Hub > Configure > Grocy):
  - **Grocery List**: a new button next to Print pushes this week's
    Grocy-imported meals onto Grocy's own shopping list in one tap. Calls
    Grocy's own "add missing ingredients" endpoint once per distinct
    recipe (the same one its own recipe page uses), so combining amounts
    across recipes, converting units, and skipping what's already in
    stock all happen inside Grocy exactly as they would from its own UI -
    nothing is duplicated or guessed on this end. Meals not sourced from
    Grocy (hand-typed ones) are silently skipped, since there's no
    ingredient data to work from.
  - **Import a recipe from a link**: a new option in the "Add from Grocy"
    picker. Paste a link to a recipe page and it reads the same
    schema.org structured data most recipe sites already publish for
    Google/Pinterest (no AI involved) - name, ingredients, instructions,
    servings. Ingredients are then fuzzy-matched against your existing
    Grocy products; anything matched is preselected, anything not is
    left as "Skip" with the full product list available to pick from
    manually (or add the missing product in Grocy first, then hit
    Refresh matches). Quantities are carried over as plain text rather
    than parsed into an exact amount+unit - worth a quick check in Grocy
    before relying on that recipe's own shopping-list button.
- **v39 (1.25.0)** — Moved the card's Settings (theme, badges, Daily Digest,
  block layout, notification click path, etc.) off a hidden "Settings"
  to-do item's JSON description and into a proper Store-backed home on the
  backend (`family_hub/get_settings` / `family_hub/set_settings`), the same
  mechanism Theme Builder already uses for its themes. That to-do item was
  a hack - it cluttered Home Assistant's own To-do UI with an item nobody
  should ever touch by hand, and a stray edit or delete there could
  silently corrupt or wipe every setting at once. The legacy to-do path is
  kept fully working, not removed: every Settings save still writes both
  places, and any existing install migrates automatically the first time it
  loads Settings after updating (the backend store comes back empty, the
  card falls back to reading the old to-do item once, and immediately
  copies it into the new store so every later load skips the to-do lookup
  entirely). Nobody needs to reconfigure anything, and the old to-do item
  is never deleted - it's left alone as a working fallback if anything ever
  needs it again (an older backend, a manual rollback).
- **v38 (1.24.1)** — Fixed the Recipe Viewer (v37) not opening from the most
  common path: picking a Grocy-imported suggestion into a specific day's
  meal (the "Edit Dinner" modal) still only showed the old plain "open
  link" paperclip button, since that flow never carried the suggestion's
  Grocy id into the editor. It now does - picking a Grocy suggestion or
  loved dish into a day, saving it, and reopening that day later all open
  the viewer from the same paperclip button. Hand-editing the link field
  falls back to a plain link open, since a hand-typed URL can't be trusted
  to still match the original Grocy recipe.
- **v37 (1.24.0)** — Added an in-card Recipe Viewer for suggestions
  imported from Grocy. Tapping a Grocy-imported suggestion's link icon now
  opens the recipe right there - servings, a grouped ingredients list, and
  the instructions - fetched live via Family Hub's own Grocy connection,
  instead of opening Grocy's own website, which needs its own separate
  login the API key doesn't satisfy (that's what the "This page requires
  login" / login-wall problem was). A hand-typed suggestion's link icon
  still opens the plain URL as before; the viewer also has its own "Open
  in Grocy" button for actually editing the recipe. Ingredients resolve
  product and unit names from Grocy's raw IDs, including "to taste"-style
  free-text amounts.
- **v36 (1.23.1)** — Fixed the "Open in Grocy" link added by v35: it pointed
  at `{grocy_url}/recipes/{id}` (plural), which 404s in Grocy's own UI.
  Checked Grocy's actual routing source directly this time - the frontend
  recipe page route is singular (`/recipe/{id}`), while only the API list
  endpoint is plural (`/api/objects/recipes`). Recipes added from Grocy
  before this fix will need their link re-added (remove and re-pick the
  suggestion from Grocy) since the wrong link was already saved.
- **v35 (1.23.0)** — Added optional Grocy integration. The Meal Suggestions
  box now has an "Add from Grocy" button that opens a picker of recipes
  pulled live from a self-hosted Grocy instance - pick one and it's added
  as a suggestion with the recipe's name and a link back to view it in
  Grocy (no description/instructions/picture are copied in; those stay in
  Grocy). Connect Grocy under Settings > Devices & Services > Family Hub >
  Configure > Grocy - the URL and API key are stored there in the
  integration's own private options, not in the card's Settings (that JSON
  blob is visible via Home Assistant's own To-do UI, which is no place for
  a credential). Leave both fields blank if you don't use Grocy; nothing
  else changes. Also fixed a latent bug in that same Configure dialog: the
  Reminders screen was replacing the entire options dict on save instead of
  merging into it, which would have silently wiped a saved Grocy connection
  (and reminders_entity, the notification tap destination, Daily Digest
  settings, etc.) the next time someone opened and saved Reminders there -
  it now merges correctly.
- **v34 (1.22.1)** — Removed the graphical editor added in v33. After
  trying it, having two places to configure the card (a visual editor for
  just calendars + entities, and the card's own Settings panel for
  everything else) added confusion rather than convenience, especially
  since the visual editor's calendars list only ever mattered for a brand
  new card. All configuration - calendars, entities, theme, badges,
  countdown, Daily Digest, notification tap destination, everything - now
  lives in one place again: the card's own Settings modal (gear icon).
  YAML is still how the handful of entity ids get set initially.
- **v33 (1.22.0)** — Added a graphical (visual) editor for the full Family
  Week Calendar card, covering Content only: title, the calendars list
  (name/color/entity, add/remove), and the 8 data-entity fields (meal plan,
  meal templates, suggestions, reminders, recipe box, card settings,
  weather, birthdays), each with entity-id autocomplete. The calendars list
  here only bootstraps the card the first time it loads with nothing
  saved yet - once you've added calendars from the card's own Settings
  (gear icon), that becomes the source of truth. Theme colors, badges,
  countdown, Daily Digest, and the notification tap destination are
  intentionally left out of the visual editor (with a note saying so) since
  they already have a good live UI in the card's own Settings panel.
- **v32 (1.21.1)** — Fixed the Family Today card expanding past whatever
  size the dashboard's Layout tab assigns it. The card now fills whatever
  height it's given and scrolls its agenda content (events/meals/reminders)
  internally when there's more due today than fits, instead of overflowing
  past its assigned space - the header and the "Go to Calendar" button stay
  pinned in place while just the middle content scrolls. Left un-resized,
  the card still auto-fits its content exactly as before.
- **v31 (1.21.0)** — Two navigation-related additions:
  - **"Go to Calendar" button**: the Family Today card can now show an
    optional button at the bottom that jumps straight to a full dashboard/
    view - set `calendar_dashboard_path` (and optionally
    `calendar_button_label`) in its config, either via YAML or the visual
    editor. Left unset, nothing new appears. Uses the same client-side
    navigation Home Assistant's own "navigate" tap action uses, so it's an
    instant view swap, not a page reload.
  - **Notification tap destination**: a new Settings field (Reminders
    section) - "Notification tap destination" - lets you set a relative
    dashboard/view path (e.g. `/lovelace-family/0`) that's stamped onto
    every reminder, event, and Daily Digest push notification the backend
    sends (as `data.url` for iOS, `data.clickAction` for Android), so
    tapping a notification on your phone opens the right calendar dashboard
    instead of just launching the app. Requires the Home Assistant
    Companion app; left unset, notifications behave exactly as before.
- **v30 (1.20.0)** — Family Today card: now respects per-calendar badges the
  same way the full card's Week/Month views do. A calendar's "Hide event
  when contains" keyword drops a matching event from Today entirely, and a
  "Show badge when contains" keyword swaps it for a small colored bubble
  next to today's date instead of a full row. Also added support for the
  dashboard's visual editor (entity pickers + title, via `getConfigForm`),
  a stub config so it works immediately when added from the card picker,
  and Layout-tab resizing in sections dashboards (`getGridOptions`) - width
  can be resized between a compact 4-column tile and a full-width row,
  with height left to auto-fit today's actual content.
- **v29 (1.19.0)** — Added the **Family Today** card: a compact, single-day
  companion to the full Family Week Calendar card. Shows just today's
  calendar events, today's meals (including recurring weekly meals), and
  today's due reminders, with tap-for-detail popups and a Done button on
  reminders. It reads the exact same `people`, `meal_plan_entity`,
  `reminders_entity`, and `settings_entity` config as the full card, so it
  automatically matches your existing theme with no separate setup. It also
  auto-refreshes at midnight so a card left open overnight rolls over to the
  new day on its own. Served and auto-registered as a dashboard resource
  alongside the full card. Add it to any dashboard with:
  ```yaml
  type: custom:family-today-card
  people:
    - entity: calendar.family
      name: Family
      color: "#4fc3f7"
  meal_plan_entity: todo.meal_plan
  reminders_entity: todo.family_reminders
  settings_entity: todo.family_calendar_settings
  weather_entity: weather.forecast_home
  # optional, added in v31 - see the changelog entry above
  calendar_dashboard_path: /lovelace-family/0
  calendar_button_label: "Go to Calendar"
  ```
- **v28 (1.18.1)** — Fixed the actual root cause of rollover reminders not
  carrying forward at all in a real Home Assistant instance: the backend's
  `todo.update_item` call that moves a rollover reminder onto today was
  missing `entity_id`, so Home Assistant had no to-do list to apply it to
  and silently did nothing, regardless of the v27 timing fix below. The
  test now asserts `entity_id` is present so this can't silently regress.
- **v27 (1.18.0)** — Fixed rollover reminders jumping to tomorrow's date as
  soon as their own due time passed today, hours before today was even
  over. They now only carry forward once the calendar day actually
  changes, landing on today's date the moment it does (and jumping
  straight to today even after a multi-day gap, e.g. Home Assistant being
  offline over a weekend), instead of needing one poll per missed day.
- **v26 (1.17.0)** — Open-link button next to the Recipe link field in the
  menu/dish editor modal.
- **v25 (1.16.0)** — Countdown migrated from a single custom slot to a
  removable list, manageable from Settings and from any event/reminder's
  "Use as countdown" / "Remove from countdown" toggle (this is also what
  fixed the cycling ticker, which needs more than one item to cycle
  through). Added Daily Digest: a once-daily notification (Settings toggle,
  send time, recipient picker) summarizing the day's events, due reminders,
  and planned meals, sent by the backend independent of the dashboard.
- **v24 (1.15.0)** — Recurring weekly meals, whole-week meal templates, and
  a print/export view for week or month (browser print dialog / Save as
  PDF).
- **v23 (1.14.0)** — Reminders gained date/time editing and an optional
  "roll over to next day if not completed" flag, with backend auto-rollover
  logic.
- **v22 (1.13.0)** — Meal Suggestions gained a link field that carries over
  to the recipe link when pulled into a day's meal editor.
- **v21 (1.12.0)** — Fixed reminders silently failing to save when the
  configured `reminders_entity` didn't exist; added visible error UI and
  up-front entity checks.
- **v20** — Reminders storage reworked from calendar events to real to-do
  items (`reminders_entity`), with a mark-done button.
- **v19** — Standalone reminders introduced as their own Add Event modal
  tab, distinct from calendar-event lead-time reminders, with their own
  legend filter and notify-device settings.
- **v14–v18** — Per-event "use as countdown," reminder edit scoping
  ("this event or all same-name events"), countdown-ticker settings wiring,
  Theme Selector card (per-device theme picker), and an initial-load race
  fix for a blank calendar on first paint.
- **v10–v13** — Multi-device notify overrides (list per calendar), "Use as
  meal" action from the event-info popup, per-event reminder overrides, and
  the zip-upload self-update installer (Configure → Update Family Hub).
- **v6–v9** — The original **Theme Builder** integration and **Family
  Calendar Reminders** companion integration merged into one `family_hub`
  integration; multiple reminder lead-times per event; per-calendar notify
  targets.
- **Pre-integration** — Family Week Calendar started as a standalone
  Lovelace card (manual `www/` copy + dashboard resource), with the week/
  month grid, meal planner, recipe box, meal suggestions, weather, and the
  original single-slot countdown banner.

