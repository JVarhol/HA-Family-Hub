---
title: To-Do Lists & Wish Lists
sidebar_position: 9
---

The **To-Do Lists card** (`family-hub-todo-card`) is a separate, optional card: a themed, kanban-style board over your Home Assistant to-do lists. It doesn't store anything of its own; every list it shows is a real `todo.*` entity (or, optionally, one of Grocy's own shopping lists), read and written through the normal `todo` domain services Home Assistant already provides.

## Multiple lists as columns

Each list you add shows up as its own column: shopping lists, reminders lists, project lists, whatever `todo.*` entities you have. Pick which ones show (and in what order) from the card's own Settings (the small gear button above the **+** FAB), under the **Lists** tab (no YAML editing needed after the card is placed). The board layout is adjustable too: stack 1 to 4 rows of columns, and optionally turn on "Fit to screen" so everything scales to fit without scrolling.

## Drag and drop

Items can be dragged within a column to reorder them, or dragged onto a different column to move them to that list entirely; both update the real `todo.*` entity immediately (no separate save step). This works across however many rows your board layout uses.

## Wish Lists

**Every household member automatically gets their own personal wish list** the moment they're added to Family Hub under Settings → Users. There's no checkbox to turn this on and no way to turn it off. A dedicated `todo.*` list is auto-created for them (named after them, e.g. "Jaret_Wish List") the same way their personal Reminders list is, and it's auto-flagged as a Wish List they own, with no extra setup. It shows up as its own column the same as any other list once you add it to the board from Settings → Lists.

Beyond that automatic per-person list, any other list on the board can also be designated a **Wish List** by hand from Settings → Lists; just check the box next to it. Whoever checks that box becomes the list's **owner**. Either way (automatic or by hand), this doesn't change the underlying entity itself; it's purely a Family Hub-side flag that changes how the card behaves for that one list:

- Items on a wish list can be **claimed** by anyone except the owner. A household member taps a claim button to mark "I've got this one," which hides nothing from everyone else but is deliberately hidden from the owner themselves, so a wish list actually works as a gift list rather than spoiling the surprise.
- The owner never sees who claimed what, or that anything was claimed at all; the card simply never renders claim status to them. Other household members see it according to the `can_see_wishlist_claims` permission (set per-person under the main calendar card's Users tab).
- **A Kiosk account can never see claim status, full stop**, not even if that login happens to be a Home Assistant admin account. Every other permission has an "admins can do anything" bypass, but `can_see_wishlist_claims` is the one deliberate exception: a Kiosk account is a shared, unidentified screen by definition, so letting an admin-flagged kiosk login see claims anyway would defeat the whole point of hiding them. This only applies to the raw kiosk login itself. See the Kiosk PIN login point below for how someone standing at that same screen can still see what their own permission grant allows.
- **Claiming requires being signed in as yourself.** On a personal device this is automatic. On a shared kiosk tablet, claiming through the raw kiosk login would incorrectly attribute every claim to "the kiosk" account instead of whoever actually tapped it. So use the **Kiosk PIN login button** to sign in as yourself first. Once you're signed in that way, your claim is attributed to you by name exactly as if you were on your own device, and both your claim and your claim-visibility follow your own account's permissions, not the kiosk login's.
- A wish list item can optionally be **tied to a reward** (a small star-cost modal, reachable from the item itself). This creates a one-time entry in the Rewards catalog linked to that item, so claiming or redeeming it from either place removes it from both.

## Grocy shopping lists

When a Grocy instance is connected (Settings → Devices & Services → Family Hub → Configure → Grocy), the same board can also show Grocy's own shopping list(s) as columns alongside your ordinary `todo.*` lists, picked the same way, from Settings → Lists. These are read and written directly against Grocy, not mirrored into a `todo.*` entity.

- **Put Away**: checking off a Grocy shopping-list item offers a Put Away action that fuzzy-matches it against your actual Grocy products (the same matching approach used elsewhere in Family Hub for recipe ingredients), so a shopping-list row that was never explicitly linked to a product can still be added to your stock correctly.
- Dragging items between a Grocy list and a regular `todo.*` list works the same as dragging between any two columns on the board.
