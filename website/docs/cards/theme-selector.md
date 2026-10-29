---
title: Theme Selector
description: A small gear that lets this one device pick its own theme.
---

A tiny card with a gear button. Tap it to pick a theme for **this device only**: any theme installed in Home Assistant, including the Family Hub themes from the Theme Builder (they're saved as ordinary Home Assistant themes). The choice is remembered on that device and nowhere else, so the kitchen tablet can be dark while every phone stays light. **Default** goes back to normal.

It changes the whole dashboard page on that device, not just Family Hub cards.

## YAML

```yaml
type: custom:theme-selector-card
title: Theme
```

## Options

| Option | Default | Description |
|---|---|---|
| `title` | `Theme` | Card title. |

## Other ways to pick a theme

- For every screen: Settings → **Theme** → **Use global theme**.
- For one screen, from Settings: turn **Use global theme** off on that device and pick **This device's theme**.
- For one card: the card's own **Theme** option (`theme_override`).

See [Theming](/docs/features/theming-and-more#choosing-a-theme).
