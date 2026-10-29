---
title: Recipe Box
description: The Recipe Box ("Loved Dishes") as its own dashboard card.
---

The Recipe Box ("Loved Dishes") as a card of its own, for anyone who'd rather have it pinned open than pop it up from the calendar. It's the same Recipe Box, with the same household-wide dishes, running on the same code as the calendar card's Recipe Box pop-up.

![The Recipe Box card](/img/screenshots/recipe-box.webp)

## YAML

```yaml
type: custom:family-hub-recipe-box-card
title: Recipe Box
```

## Options

| Option | Default | Description |
|---|---|---|
| `title` | `Recipe Box` | Card title. |
| `theme_override` | device theme | Pin this card to one theme. |

It uses the same recipe and suggestion lists as your calendar card; there's nothing to point it at.

## On the card

- **Search**, and filter by **category** chips or **💡 Suggested**.
- **Grid view** or **List view**.
- **❤️ Love it** / **👎 Not a fan** on any dish.
- **💡** flags a dish as a Meal Suggestion (the same as **Also add to Meal Suggestions** in the editor).
- **+ Add Recipe**: name, description, category, recipe link, photo URL and card color. With Grocy connected, **Add from Grocy** and **Import a Recipe** are here too. See [Grocy Integration](/docs/features/grocy-integration).
- **Tap a dish** to open it: Prep/Cook/Serves when known, **View Recipe**, edit or delete. A Grocy recipe opens the full recipe viewer with a servings scaler.

See [Meal Planning](/docs/features/meal-planning) for how dishes get onto the menu.
