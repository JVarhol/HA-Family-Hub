---
title: Theming & Everything Else
sidebar_position: 7
---

- **Full theme editor** in Settings: every background/text/accent color and
  every font size is exposed as a color picker or numeric field, with a
  one-click "Reset to default."
- **Built-in preset themes**: a handful of ready-made color themes ship with
  the integration out of the box.
- **Theme Selector card**: a small, per-device gear-icon card for picking
  which saved theme this particular tablet/browser shows, independent of
  what other devices are showing.
- **Global theme mode**: the calendar card can optionally follow a saved
  theme directly instead of its own local theme settings. The "Use global
  theme" dropdown lists two groups — your own saved presets, and a
  **"Home Assistant"** group listing every native/installed HA theme
  (`themes.yaml`, HACS themes, etc.) plus a synthesized "Default (Home
  Assistant)" entry — so the dashboard can follow a theme you already have
  installed in Home Assistant without recreating it by hand.
- A full **Theme Builder sidebar panel** for building and saving your own
  custom named themes exists in the codebase but isn't part of this beta
  release yet — presets and the Theme Selector cover theming for now.

## Everything else
- **Collapsible accordion sections** in Settings (Calendars, Menu Blocks,
  Countdown, Daily Digest, Theme colors, Theme fonts) to keep the panel
  manageable.
- **Settings sync across devices**: all shared settings live in the
  integration's own backend storage (with an automatic on-disk backup), so
  every tablet/browser sees the same configuration — except the timeline
  toggle and theme-selector pick, which are deliberately per-device. An
  older `todo`-list-based settings entity is still read once, automatically,
  as a one-time fallback for households updating from a very old version —
  new installs never need one.
- **Optional vertical scroll lock**, handy for kiosk-mode wall tablets.
- Built-in **Debug Info** panel (Settings → Debug Info) showing fetched
  events, errors per calendar, and current settings.
- **Self-update from the integration itself**: Settings → Devices & Services
  → Family Hub → Configure → **Update Family Hub** lets you upload a new
  `family_hub_vN.zip` and installs it in place (auto-backed-up first) —
  no manual file copying, just a Home Assistant restart afterward.
- **Test a notification** and **Upcoming notifications preview** steps in
  Configure, for confirming a notify target works and previewing what's
  queued to fire before waiting around for it.
