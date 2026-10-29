---
title: My Pantry
description: Grocy stock on a card, plus an "Also Tracking" list for anything else.
---

What's in the house. With [Grocy](/docs/features/grocy-integration) connected, the top section is your live **Grocy Stock**. Below it, **Also Tracking** is a simple list for anything you don't keep in Grocy (paper towels, the freezer, the garage fridge), and it works with or without Grocy.

## YAML

```yaml
type: custom:family-hub-pantry-card
title: My Pantry
```

## Options

| Option | Default | Description |
|---|---|---|
| `title` | `My Pantry` | Card title. |
| `theme_override` | device theme | Pin this card to one theme. |

## Grocy Stock

Needs Grocy connected (Settings → Devices & services → Family Hub → Configure → **Grocy**). Without it, the section says so and Also Tracking still works.

- **Search**, filter to **Expired** or **Expiring soon**, and **sort** by Name, Expiration, Location or Category.
- Each item shows its amount, location, when it expires ("Expires tomorrow", "Expired Oct 2") and a **Low stock** badge when it's under its minimum.
- **Add stock**: pick a product, an amount, a best-before date and a location. If it isn't in Grocy yet, tick **This isn't in Grocy yet** to create the product right there, with its name, category, stock and purchase units, location and minimum stock amount. New categories and locations can be added from their menus.
- **Remove stock**: take some out (it asks how much).
- **Edit entries**: change each individual stock entry's amount, best-before date, price and location.
- **Edit product**: rename it, change its category, default location or **Min stock amount**, or **Delete product** from Grocy entirely (only if nothing else in Grocy, like a recipe or shopping list, still uses it).

## Also Tracking

- **Track something else** adds an item with a name, a quantity (free text: "3 rolls", "a few", "1 case"), a location, an optional expiration date and notes.
- Tap one to edit it, or **Stop tracking** to remove it.
- These live in Family Hub's own storage, not in Grocy, so they never count toward Grocy stock.

Expiring and low-stock items can also show under the calendar's More menu and in the Daily Digest. See [Grocy Integration](/docs/features/grocy-integration).
