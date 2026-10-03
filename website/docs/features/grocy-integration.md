---
title: Grocy Integration (Optional)
sidebar_position: 3
---

Connect a self-hosted [Grocy](https://grocy.info) instance under Settings →
Devices & Services → Family Hub → Configure → **Grocy** (URL + API key) to
unlock a deeper recipe/grocery layer on top of the meal planner above.
Leave both fields blank and none of this appears. Family Hub works exactly
as described everywhere else in this README with no Grocy at all.

- **Pick a meal straight from Grocy**: the Recipe Box gets an "Add from
  Grocy" option that pulls in one of your existing Grocy recipes by name,
  instead of typing one in by hand.
- **In-card Recipe Viewer**: tapping a Grocy-backed recipe opens a
  full-screen viewer (servings, grouped ingredients, instructions, photo)
  fetched live through Family Hub, instead of sending you to Grocy's own
  website (which needs its own separate login the API key doesn't satisfy).
  A **live servings scaler** (+/- stepper) rescales every numeric ingredient
  amount on the fly, including the plain-text ingredient list some recipes
  carry in their own description. A **Mark Consumed** button deducts the
  recipe's ingredients from Grocy stock (the current scaled serving count,
  if the stepper's been touched), the same thing as Grocy's own "Consume
  all ingredients needed" button, confirmed first since it's a real,
  one-way stock transaction.
- **Import a recipe into Grocy**: "Import a Recipe" offers three ways in:
  paste a link (reads the same schema.org structured data most recipe sites
  publish for Google/Pinterest: name, ingredients, instructions, servings,
  and Prep/Cook time when published, no AI involved), paste the recipe's
  raw text (a best-effort "Ingredients"/"Instructions" section-header
  parser), or skip straight to a blank form and enter it by hand. Every
  ingredient line is fuzzy-matched against your existing Grocy products
  (editable, removable, or added fresh), with a "+ Add new product to
  Grocy…" option (including quantity-per-container) for anything missing,
  and a "+ Add new location…" option for a storage location Grocy doesn't
  have yet. Any unit picker on this screen (an ingredient's own unit, or
  the new-product form's Stock/Purchase unit) has a matching "+ Add new
  unit…" option for a measurement Grocy doesn't have yet either (e.g.
  "fluid ounce" or "tablespoon"). An "Include ingredients in the preparation text" checkbox
  (checked by default) controls whether that raw ingredient list also gets
  written into the recipe's description alongside the instructions. Either
  way the ingredients still become real Grocy ingredient rows, so matching
  and shopping-list pushes work the same regardless. Image and source-link
  fields carry through, and the created recipe's photo, ingredients, and
  Prep/Cook time all show up back on the meal view-card once it's planned.
  Each ingredient's real quantity (e.g. the "2" in "2 cups flour") is parsed
  automatically and shown as an editable amount + unit next to the raw text
  ; this is the number Grocy actually uses for stock math (shopping-list
  "missing" amounts, the recipe's "fulfilled" check, and the Mark Consumed
  button above), not just cosmetic display text. Anything that can't be
  pinned to one clean number (a range like "3-4", or free text like "a
  pinch of salt") defaults to a "Don't count toward stock" checkbox instead
  of a made-up amount, and a chosen unit with no known Grocy conversion
  path to that product's stock unit gets flagged inline so it can be fixed
  or swapped before the recipe is created.
- **Grocery List**: pushes a whole week's Grocy-sourced meals onto Grocy's
  own shopping list in one tap, combining amounts across recipes and
  skipping what's already in stock exactly as Grocy's own UI would, with an
  "Added" / "Not added yet" status per meal so it's clear what's already
  been shopped for. Grocy itself adds those ingredients in the recipe's own
  cooking unit (e.g. "3 cup" of flour), so right after the push, anything
  with a real purchase-unit conversion set up in Grocy gets automatically
  converted and rounded up to a whole number of the unit it's actually
  bought in (e.g. "2 lb") - a short note on the push result says how many
  items got rounded this way. Anything without a conversion set up yet is
  left exactly as Grocy wrote it.
- **Shopping List** (More menu): view and edit Grocy's shopping list without
  leaving Family Hub: check items off, remove them, add a new one by name,
  see an estimated running total by price, and (if you use more than one
  Grocy list, e.g. "Costco" vs. a regular run) switch between lists or spin
  up a brand new one on the spot. Any item can be moved to a different list.
- **Put Away / Scan**: mark a shopping-list item purchased and immediately
  file it into Grocy stock at a location and expiration date, adding a new
  storage location inline if you need one that doesn't exist yet.
- **Expiring Soon** and **Low Stock** lists (More menu, each its own opt-in
  toggle under Settings → Grocy): everything in Grocy stock due within 30
  days, or currently below its minimum stock amount, with a one-tap "Add
  All to Shopping List" button for Low Stock and small recipe-suggestion
  chips on Expiring Soon items that use up something about to expire.
- **Per-feature Daily Digest toggles**: Expiring Soon and Low Stock can each
  independently be included in (or left out of) the once-a-day Daily Digest
  notification described below, on top of their own on/off switch for
  showing up in the More menu at all.
