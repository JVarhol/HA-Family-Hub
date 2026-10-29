---
title: To-Do Lists
description: Your Home Assistant to-do lists as columns, with drag and drop, wish lists and Grocy shopping lists.
---

A board over your Home Assistant to-do lists: each list is a column, and items drag between them. It stores nothing of its own; every column is a real `todo.*` entity (or a Grocy shopping list). Wish lists, claiming and Grocy are covered in [To-Do Lists & Wish Lists](/docs/features/todo-lists-and-wishlists).

![Two to-do lists side by side](/img/screenshots/todo-lists.webp)

## YAML

```yaml
type: custom:family-hub-todo-card
title: To-Do Lists
entities:
  - todo.groceries
  - todo.errands
include_grocy_shopping_lists: false
fab_position: dashboard  # or "card"
```

## Options

| Option | Default | Description |
|---|---|---|
| `title` | `To-Do Lists` | Card title. |
| `entities` | `[]` | **Lists to show**, as columns. Easier to manage from the **+** button → **List(s)** tab, which saves for this card on every screen. |
| `include_grocy_shopping_lists` | `false` | **Also show Grocy shopping list(s)**. Which Grocy lists is picked in the **+** button → **List(s)** tab. |
| `fab_position` | `dashboard` | **+ button position**. See [All Cards](/docs/card-configuration#the--button-position). |
| `theme_override` | device theme | Pin this card to one theme. |

## The + button

The **+** button opens a pop-up with two tabs.

**Add Item**: what it is, which list, an optional due date, and on a wish list a link and an image (paste a URL or **Upload photo…**).

**List(s)**, this card's own settings:

- **Lists**: tick the to-do lists (and Grocy shopping lists) to show, in order. The **Wish list** box next to a list turns it into a wish list, owned by whoever ticks it.
- **Rows**: stack the columns in 1 to 4 rows. A hint shows how your lists will split.
- **Fit to screen**: the card fills the space below it instead of growing the page, and each list scrolls on its own. With more than one row, drag the handle between rows to resize them.

## Items

- **Tap an item** to edit its name, description and due date (when that list supports them) and its image.
- **Drag** to reorder within a list, or onto another column to move it there. Works across rows, and between Grocy and ordinary lists.
- **Completed** items collect at the bottom of each column.
- **🔒 Login** on a shared kiosk: log in with your Kiosk PIN so wish-list claims are yours, not the kiosk's.
