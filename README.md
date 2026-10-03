<h1 align="center">Family Hub</h1>

<p align="center">
<a href="https://github.com/JVarhol/HA-Family-Hub/releases/latest"><img src="https://img.shields.io/github/v/release/JVarhol/HA-Family-Hub?style=for-the-badge&color=5da3a6" alt="Release"></a>
<a href="https://github.com/JVarhol/HA-Family-Hub/issues"><img src="https://img.shields.io/github/issues/JVarhol/HA-Family-Hub?style=for-the-badge&color=e8604c" alt="Issues"></a>
<a href="https://github.com/JVarhol/HA-Family-Hub/blob/main/LICENSE"><img src="https://img.shields.io/github/license/JVarhol/HA-Family-Hub?style=for-the-badge&color=3fbf5f" alt="License"></a>
<a href="https://github.com/hacs/integration"><img src="https://img.shields.io/badge/HACS-Custom-41BDF5?style=for-the-badge&logo=homeassistantcommunitystore&logoColor=white" alt="HACS Custom Repository"></a>
</p>

<p align="center">
  Family Hub is a Home Assistant custom integration that bundles a whole<br />
  family-tablet dashboard — calendar, meal planning, chores, rewards,<br />
  goals, routines, and more — into one install/update.<br />
  Runs entirely on your own Home Assistant instance, no cloud required.
</p>

<p align="center">
  <a href="#installation">Installation</a> · <a href="#features">Features</a> · <a href="DOCUMENTATION.md">Documentation</a> · <a href="CHANGELOG.md">Changelog</a>
</p>

## Features

&bull; **Family Week Calendar card:** a full-screen, tablet-friendly Lovelace card combining a Week/Month family calendar, a per-day meal planner, a recipe box, weather, a countdown banner, and a Daily Digest — driven by any number of `calendar.*` entities with per-person columns and colors, configurable entirely from the in-card Settings panel.

&bull; **Family Today card:** a small, single-day companion card for any dashboard — today's events, meals, and due reminders — sharing the full card's config, entities, and theme automatically.

&bull; **Meal planning & Recipe Box:** 1–3 configurable meal blocks a day, recurring weekly meals, whole-week templates, a searchable Recipe Box with ratings, and meal suggestions — works fully standalone, no outside service required.

&bull; **Grocy integration (optional):** connect a self-hosted [Grocy](https://grocy.info) instance to unlock a live in-card Recipe Viewer with a servings scaler, a three-way recipe importer (link, pasted text, or blank form with ingredient matching), grocery-list pushes, shopping lists, and Expiring Soon / Low Stock tracking.

&bull; **Chores, Rewards, Goals & Routines:** a second board covering assignable/rotating/first-come chores with a star economy, a redeemable rewards catalog, one-off goals, and Morning/Afternoon/Night routine checklists — all gated by a granular per-person permissions system.

&bull; **Timers & alarms:** countdown timers on chores and rewards, a household-wide Active Timers board, and TTS/notification alarms.

&bull; **Screen Saver:** an idle-triggered full-screen video, camera feed, or widget overlay (clock, weather, photos) for a wall-mounted tablet, shared across every Family Hub card on the dashboard.

&bull; **Privacy Mode:** hide every calendar event and reminder behind a lock screen until someone with the right permission enters their kiosk PIN — opt individual devices in or out so it only applies where you want it.

&bull; **Holiday Backgrounds:** household-uploaded or predefined holiday photos as a per-day background, with an optional "Expand to full screen" for that day, the whole week, or the whole month, and an automatic tiebreaker when more than one is active at once.

&bull; **Server-side notifications:** calendar-event reminders, standalone reminders, chore due-date reminders, and a once-a-day Daily Digest, all fired by the backend on a schedule so they arrive whether or not anyone has the dashboard open.

&bull; **Theming:** built-in preset themes plus every installed native Home Assistant theme, a per-device Theme Selector card, and per-theme color/font customization.

Also built in: multi-person events with color-blended columns, per-calendar badges, print/export view, word-wrapped event titles, an hourly timeline view, a countdown banner, and Kiosk accounts for shared wall-mounted tablets.

## Installation

Requires a few Home Assistant `todo.*` entities (for the recipe box, meal plan, and reminders) and at least one `calendar.*` entity — see [Requirements](DOCUMENTATION.md#requirements) in the full docs.

### Option A: HACS (recommended)

Family Hub isn't in the default HACS store yet, so add it as a custom repository:

1. In Home Assistant, go to HACS → the ⋮ menu (top right) → **Custom repositories**, and add this repository's URL with category **Integration** — or use this one-click link:
   [![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=JVarhol&repository=HA-Family-Hub&category=integration)
2. Find **Family Hub** in HACS and click **Download**.
3. Restart Home Assistant.
4. Settings → Devices & Services → **Add Integration** → search for **Family Hub** — or use this link:
   [![Open your Home Assistant instance and start setting up a new integration.](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=family_hub)

### Option B: Manual copy

1. Copy the `custom_components/family_hub` folder into your own `/config/custom_components/` (overwrite an existing install to update it).
2. Restart Home Assistant.
3. Settings → Devices & Services → **Add Integration** → search for **Family Hub**.
4. Add the card(s) you want to a dashboard — see [Card configuration](DOCUMENTATION.md#card-configuration) in the full docs for example YAML.

## Documentation

Full feature detail, the complete `todo`/`calendar` entity requirements, example card YAML for every card, and known limitations all live in [DOCUMENTATION.md](DOCUMENTATION.md). Release history is in [CHANGELOG.md](CHANGELOG.md) (older entries in [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md)).

Built to compete with commercial family-hub tablets (Skylight, Dragon Touch, etc.) while running entirely on your own Home Assistant instance.

## License

Copyright (C) 2026 Bordello Labs.

Licensed under the GNU General Public License v3.0 (GPL-3.0) — see [LICENSE](LICENSE) for the full text. You're free to use, study, modify, and redistribute this software, provided that any distributed copies (including modified versions) remain under the same license and keep their source available.
