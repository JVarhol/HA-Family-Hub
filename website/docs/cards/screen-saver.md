---
title: Screen Saver
description: Brings the Family Hub screen saver to a dashboard that has no other Family Hub card.
---

The screen saver already runs on every dashboard that has any Family Hub card, so most households never need this card. Add it only to a dashboard with **no other Family Hub card** on it (a camera view, a lights dashboard) to give that dashboard the screen saver too. It's invisible outside of edit mode.

The screen saver itself (video or camera, idle time, widgets, which logins get it) is set up in Settings. See [Screen Saver](/docs/features/screen-saver).

## YAML

```yaml
type: custom:family-hub-screensaver-card
title: Screen Saver
return_dashboard_path: /lovelace-family/0
```

## Options

| Option | Default | Description |
|---|---|---|
| `title` | `Screen Saver` | Only shown while you're editing the dashboard, to tell cards apart. |
| `return_dashboard_path` | none | **Return to this dashboard on wake**: a relative path to jump to when someone taps the screen saver away, instead of staying where it fell asleep. |
| `theme_override` | device theme | Pin this card to one theme. |
