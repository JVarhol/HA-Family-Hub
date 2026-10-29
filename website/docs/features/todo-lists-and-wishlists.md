---
title: To-Do Lists & Wish Lists
sidebar_position: 9
---

The **To-Do Lists card** (`family-hub-todo-card`) is a separate, optional card: a themed, kanban-style board over your Home Assistant to-do lists. It doesn't store anything of its own; every list it shows is a real `todo.*` entity (or, optionally, one of Grocy's own shopping lists), read and written through the normal `todo` domain services Home Assistant already provides.

## Multiple lists as columns

![Two to-do lists side by side](/img/screenshots/todo-lists.webp)


Each list you add shows up as its own column: shopping lists, reminders lists, project lists, whatever `todo.*` entities you have. Pick which ones show (and in what order) from the card's **+** button → **List(s)** tab (no YAML editing needed after the card is placed). See [To-Do Lists card](/docs/cards/todo-lists). The board layout is adjustable too: stack 1 to 4 rows of columns, and optionally turn on "Fit to screen" so everything scales to fit without scrolling.

## Drag and drop

Items can be dragged within a column to reorder them, or dragged onto a different column to move them to that list entirely; both update the real `todo.*` entity immediately (no separate save step). This works across however many rows your board layout uses.

## Wish Lists

A wish list is an ordinary Home Assistant to-do list that Family Hub shows as a gift list: each item gets a picture, a note and a link, and other people can quietly **claim** things so two people don't buy the same present. The person whose list it is never sees what's been claimed.

### Getting one

- **Everyone gets one automatically.** Adding someone under Settings → Users creates their own wish list (for example `todo.emma_wish_list`) and marks it as theirs. There's no switch to turn this off, and kiosk accounts don't get one. To use a list they already have instead, change **Their wish list** in their profile; that list is then marked as their wish list.
- **Any other list can be one too.** In the To-Do Lists card, **+** button → **List(s)** tab, tick **Wish list** next to it. Whoever ticks the box becomes the list's **owner**. Untick it to make it a normal list again.
- The wish-list mark belongs to the list, so every To-Do Lists card in the house shows it the same way. It doesn't change the list in Home Assistant.
- Add the list to a To-Do Lists card (List(s) tab) to see it. It gets a **Wish List** tag on its column.

### Adding items

The **+** button's **Add Item** tab (pick the wish list under **List**):

- **What do you need to do/get?**: the item's name.
- **Link** (optional): where to buy it. It shows as **🔗 View** on the item.
- **Image URL** (optional), or **Upload photo…** to take or pick a picture. Uploaded photos are shrunk to at most 1600 pixels and stored in Home Assistant's own image storage.

Tap an item later to change its name, note, link or picture. Items without a picture show a 🎁.

The link, picture and claim are saved inside the to-do item's description, so a wish list needs a to-do list that supports descriptions. Home Assistant's **Local To-do** lists do, and Family Hub's own wish lists are Local To-do lists.

### Claiming

- **Claim** on an item marks it as yours ("I'll get this one"). Everyone allowed to see claims then sees **Claimed by Dad**, and the button is greyed out for them.
- **Claimed by you – tap to release** lets you give it back. Only the person who claimed something can release it.
- **The owner never sees claims.** On their own list there are no Claim buttons and nothing shows as claimed, on any screen.
- **Who can claim and see claims** is the **See claim status** permission (Settings → Users → their profile → Permissions → Wish Lists). Without it, someone sees the list but no Claim buttons and no claims. People who were already in Family Hub when this permission arrived got it switched on; **anyone added since starts with it off**, so an admin needs to tick it for them. Admins always have it.
- **Kiosk accounts can never see claims**, even if the kiosk login is a Home Assistant admin, because anyone could be standing at a shared screen. To claim from a kiosk tablet, tap **🔒 Login** on the card and enter your Kiosk PIN: you then claim as yourself, with your own permission. Signed in as the kiosk itself, the card shows **Log in to claim**.

:::caution Claims can be seen outside Family Hub
Claims are stored in the item's description, so they're readable in Home Assistant's own To-do page and in the to-do list's raw data. Family Hub hides them; Home Assistant doesn't. If the owner uses Home Assistant's To-do page, they could spot a claim there.
:::

### Turning an item into a reward

Someone who can add rewards to the catalog (the **Add to catalog** permission, or an admin) sees **Add star value** on a wish-list item:

- Give it a star cost. The item now shows **⭐ cost** on the wish list, and a one-time reward with the same name appears in the Rewards catalog.
- Claiming it, from either place, **spends the stars** of whoever is signed in (or PIN-logged-in) and removes it from both the wish list and the catalog. If they don't have enough stars yet, nothing happens and it stays put.
- If the reward is deleted from the catalog, the item disappears from the wish list too.
- An item tied to a reward has no ordinary Claim button, since claiming it means earning it.

This works well for a child's list: put the things they're saving up for on their wish list, give each a star cost, and they can claim one once they've earned enough.

## Grocy shopping lists

When a Grocy instance is connected (Settings → Devices & Services → Family Hub → Configure → Grocy), the same board can also show Grocy's own shopping list(s) as columns alongside your ordinary `todo.*` lists, picked the same way, from the **+** button → List(s). These are read and written directly against Grocy, not mirrored into a `todo.*` entity.

- **Put Away**: checking off a Grocy shopping-list item offers a Put Away action that fuzzy-matches it against your actual Grocy products (the same matching approach used elsewhere in Family Hub for recipe ingredients), so a shopping-list row that was never explicitly linked to a product can still be added to your stock correctly.
- Dragging items between a Grocy list and a regular `todo.*` list works the same as dragging between any two columns on the board.
