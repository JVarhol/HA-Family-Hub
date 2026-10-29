---
title: Screen Saver
sidebar_position: 6
---

Built for a wall-mounted display: after the dashboard sits idle, a full-screen video or live camera feed takes over, with your own widgets on top. Any tap wakes it.

## Setting it up

Everything is in Settings → General → **Screen Saver**:

- **Source**: **Video** (a direct link to a video file, or a file under Home Assistant's `/local/` folder; it loops muted) or **Camera** (any camera entity, live).
- **Idle time before it shows**, in seconds. Any tap, key press or scroll restarts the countdown.
- **Disable while a recipe is open**: pauses the countdown while someone has a recipe open, so it doesn't kick in mid-recipe. Browsing the recipe list still counts as idle.
- **Return to this dashboard on wake**: jump to a chosen dashboard when it's tapped away, instead of staying where it fell asleep.
- **Screen Saver logins**: tick the Home Assistant logins that should get it. A wall tablet's login can have it while everyone's phones don't.

The source, idle time and widgets are shared by the whole household.

## Widgets

**Widgets on the screensaver** layers cards over the video or camera. **Add widget** offers:

| Widget | Shows |
|---|---|
| **Weather** | Current conditions and forecast from a weather entity |
| **Clock** | A digital clock. **Clock style**: Home Assistant's card, or **Digits only** (no border or background), with optional **Automatic color** (light digits on a dark picture, dark digits on a light one) |
| **Calendar** | A month grid for one calendar |
| **Sensor** | One entity's current state |
| **Camera** | A live snapshot from a camera |
| **Text** | Your own text or Markdown |
| **Custom** | Any Lovelace card, written as JSON (or **📝 Edit as YAML**) |

Drag a widget to move it and drag its bottom-right corner to resize it. Any widget can have a **Transparent background**. **Hide widgets on this device** hides chosen widgets on just the screen you're on.

## Per screen

- Each screen can be switched off from Settings → **Devices** → **Screensaver enabled**, without changing anyone's login. It takes effect immediately.
- The same switch is a Home Assistant entity, so an automation can turn the screen saver off during a party and back on afterwards. See [Automations & Entities](/docs/features/automations-and-entities#per-screen-entities).

## Which dashboards

The screen saver runs on any dashboard that has a Family Hub card, and only once, however many Family Hub cards are on it. For a dashboard with no Family Hub card, add the small [Screen Saver card](/docs/cards/screen-saver).
