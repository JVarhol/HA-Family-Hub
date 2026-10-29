---
title: Meal Planning
sidebar_position: 2
---

Everything in this section works entirely on its own, with no Grocy (or any
other outside service) required. Grocy only adds the deeper grocery/recipe
features described in its own section below.
- **Meal planner** with 1–3 configurable blocks per day (Breakfast/Lunch/
  Dinner by default, renameable), an optional "breakfast on weekends only"
  toggle, per-dish custom card colors, and a drag-to-reorder **Edit** mode.
- **Meal view-card**: once a day's meal is actually set, opening it shows a
  clean read-only summary (dish name, Prep/Cook/Serves facts when known, a
  "View Recipe" button, and a small pencil button) instead of jumping
  straight back into the picker/edit fields. Tap the pencil to change the
  name, description, or link, or Clear to empty the slot again. The love/
  dislike rating buttons stay visible the whole time.
- **Recurring weekly meals**: any planned meal can be set to "repeat weekly":
  it then auto-fills the same weekday/block every future week until
  turned off or overridden for a single week (editing a projected occurrence
  asks whether to change just that day or every future week).
- **Whole-week meal templates**: save an entire week's plan as a named
  template ("Taco Tuesday week", "Camping week", etc.) and apply it to any
  week with one click.
- **Meal plan in Month view** (optional toggle): planned meals show as
  pills; tapping one opens that day's meal editor directly.
- **Recipe box ("Loved Dishes")** with heart/thumbs-down ratings, recipe
  links (with an **Open link** button next to the link field in the menu
  editor), and a picker to reuse a loved dish when planning a new meal.
  Dishes can be added, edited, and deleted from the Loved Dishes list and
  each dish's own detail screen.

![The Recipe Box, with category filters](/img/screenshots/recipe-box.webp)

- **Recipe Box card** (v1.110.6+): the same Recipe Box as its own dashboard
  tab/card (`family-hub-recipe-box-card.js`), for anyone who'd rather have it
  pinned open than pop it up from the calendar. Browse, search, filter by
  category, heart, suggest, and add/edit/delete dishes right there. It runs
  on the exact same underlying code as the calendar card's own Recipe Box
  modal, so a change to one always behaves identically on the other, and
  both read/write the same household-wide Recipe Box data.
- **Meal Suggestions**: there's no separate Suggestions box to manage;
  tapping the light-bulb icon on any Recipe Box entry (or checking "Also
  add to Meal Suggestions" while adding/editing one) flags it as a
  suggestion. Both the "💡 Meal Suggestion" option on the + button and the
  header's "💡 Suggestions" button open the Recipe Box itself, filtered to
  its "💡 Suggested" chip, so suggesting and picking a meal both happen in
  the same searchable list as everything else.
- **Search** inside the Recipe Box, including its Suggested filter.

## The meal editor

Tap an empty meal block (or the pencil on a planned one) to open the editor:

- **Dish name**, with **🍽️ Pick a Recipe** to choose from the Recipe Box.
  Typing a name close to a dish you already have ("Cilli dogs") offers
  **Similar to: Chilli Cheese Dogs**, so the same dish doesn't end up in
  the Recipe Box twice under different spellings.
- **Description** (notes, sides), **Category**, and **💡 Also add to Meal
  Suggestions**.
- **Recipe link**, with a 🔗 button to open it.
- **👍 Who's cooking**: tap a person. Their color shows as a bar along the
  bottom of that meal block, so everyone can see whose night it is.
- **More options**: edit the recipe link, **Servings** (for the Grocy
  shopping list), a **Photo URL** (shown on its Recipe Box card), the
  **Card color**, and **🔁 Repeat weekly** (until turned off or changed
  for one week).
- **♻️ Leftovers**: also show this meal on any other days you pick (they
  don't need to be in a row), for a big pot of chili that covers Tuesday
  and Thursday.
- **📅 Move to another week**: pick a date and **Move** sends the meal
  there, in the same slot.
- **🍲 Additional recipes**: sides, sauces or desserts that go with it,
  **from the Recipe Box** or **from a link**.
- **❤️ / 👎**: rate the dish.
- **Clear** empties the slot. (In the Recipe Box's own dish editor,
  **Delete** removes the dish.)

**Suggesting a meal**: someone without the **Edit the menu** permission sees
**💡 Suggest** instead of Save. Their idea shows on that day as a
suggestion, and someone who can edit the menu puts it on the menu or
dismisses it. You can always take back your own suggestion.

**Rearranging**: the **✏️ Edit** button in the top bar turns on drag and
drop. Drag meals between days and slots (and, with the right permission,
calendar events between days). Tap it again when you're done.

Without Grocy, a Loved Dish or a day's meal is filled in through the dish/
day editor's own fields: name, description, a recipe link (with an Open
Link button), card color, servings, typed or pasted in by hand. The
three-way recipe importer described below (paste a link, paste raw recipe
text, or a blank form with per-ingredient matching) is a Grocy feature: it
always creates a real Grocy recipe, and needs a Grocy connection to work at
all.
