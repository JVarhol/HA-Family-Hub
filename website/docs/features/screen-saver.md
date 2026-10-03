---
title: Screen Saver
sidebar_position: 6
---

- **Idle-triggered overlay**: after a configurable idle timeout (any tap,
  key press, or scroll resets it), a full-screen video or camera-feed
  overlay takes over — any tap dismisses it. Shared across every Family
  Hub card on the same dashboard, so a dashboard with several of these
  cards only ever runs one screen saver, not one per card.
- **Per-login opt-in**: the source (video or camera) and idle time are
  shared household-wide, but whether the screen saver ever arms itself is
  chosen per Home Assistant login under Settings → Screen Saver — a wall
  tablet's login can have it on while a phone's stays off.
- **Disable while a recipe is open**: an optional toggle that pauses the
  idle countdown while a recipe's detail view is open, so it doesn't kick
  in mid-recipe.
- **A standalone companion card** (`family-hub-screensaver-card`) brings
  the same shared screen saver to a dashboard that doesn't otherwise have
  a Family Hub card on it, with an optional "return to this dashboard on
  wake" setting.
