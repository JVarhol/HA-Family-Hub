---
title: Theming & Everything Else
sidebar_position: 8
---

![The week view in all ten built-in themes](/img/screenshots/themes.webp)

## Built-in themes

Family Hub ships with **10 ready-made themes**:

- **Slate** (the default for new installs), **Soft**, **Meadow** and **Blossom**: light, warm and calm.
- **VaultTek** and **Midnight**: dark, with bold accents.
- **HA Light** and **HA Dark**: flat cards in Home Assistant's own blue, grey and white, so Family Hub sits naturally next to the rest of your dashboard.
- **Liquid Glass** and **Liquid Glass Dark**: see-through, frosted cards over a soft colour wash. Every Family Hub card (calendar, Today, Right Now, Chores, Rewards, To-Do, Timers, Goals, Pantry and Recipe Box) shows the theme's background through blurred glass, while pop-ups and menus stay almost solid so they're easy to read.

![The calendar in the Liquid Glass theme](/img/screenshots/calendar-liquid-glass.webp)

## Theme Builder

The **Theme Builder** page in the Home Assistant sidebar is where you edit the built-in themes or make your own (up to 12 in total). For each theme you can set:

- **Colors**: background, card, border, text, secondary text, three accents, text on the accent, and two surface colours.
- **Fonts**: the size of day names, dates, weather, events, chips, headings, the countdown and the meal blocks.
- **Appearance**: drop shadow, glow, border weight, **card/chip transparency** and **glass blur** (together these make the glass look), and a **background image** with its own fit, position, opacity, blur and tint.

A live preview shows the result as you go, and **Save All** saves every theme at once. Your themes also appear as ordinary Home Assistant themes, so you can use their colours on the rest of your dashboards too.

![The Theme Builder page with the Liquid Glass theme open](/img/screenshots/theme-builder.webp)

## Choosing a theme

- **For the whole household**: Settings → **Theme** → **Use global theme** picks one theme for every screen. The list includes the built-in themes, your own, and every theme installed in Home Assistant (`themes.yaml`, HACS themes, and "Default (Home Assistant)").
- **For one screen**: turn **Use global theme** off on that device, or use the **This device** button at the top of the Theme Builder, or add the small **Theme Selector card** to that screen's dashboard. Every Family Hub card on that device follows it, and no other device is affected.
- **For one card**: each Family Hub card's own **Edit card** dialog has a **Theme** option that overrides everything else for that card.
- **Quick tweaks** without the Theme Builder: Settings → **Theme colors** and **Theme font sizes**, with **Reset theme to default**.

## Languages

Family Hub's cards, Settings, Theme Builder page and setup screens are translated into **English, German, Spanish, French, Italian, Dutch, Polish and Portuguese (Brazil)**. Each person sees the language and 12/24-hour clock they've chosen in their own Home Assistant profile, and switching it there switches Family Hub too.

## Everything else
- **Collapsible accordion sections** in Settings (Calendars, Menu Blocks,
  Countdown, Daily Digest, Theme colors, Theme fonts) to keep the panel
  manageable.
- **Settings sync across devices**: all shared settings live in the
  integration's own backend storage, so
  every tablet/browser sees the same configuration, except the timeline
  toggle and theme-selector pick, which are deliberately per-device. An
  older `todo`-list-based settings entity is still read once, automatically,
  as a one-time fallback for households updating from a very old version;
  new installs never need one.
- **Optional vertical scroll lock**, handy for kiosk-mode wall tablets.
- Built-in **Debug Info** panel (Settings → Developer tools → Debug Info)
  showing fetched events, errors per calendar, and current settings, with
  **Copy** and **Export to file** for bug reports.
- **Test a notification** and **Upcoming notifications** in
  [Integration Options](/docs/integration-options), for confirming a notify
  target works and previewing what's queued to fire.
- **Backups**: Family Hub saves a snapshot of your Settings, Permissions and
  per-device settings every 12 hours (at midnight and noon) and keeps the
  last 8 (or take one right away with **Back up now** in Settings → Developer tools). Restore one, download one as a
  file, or upload a file from another install under Settings → Devices &
  services → Family Hub → **Configure** → **Restore a backup**. See
  [Integration Options → Backups](/docs/integration-options#backups).
- **Updating without HACS**: Configure → **Update Family Hub** installs a
  release zip. See [Integration Options](/docs/integration-options#update-family-hub).
