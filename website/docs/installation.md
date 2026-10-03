---
title: Installation
sidebar_position: 1
---

Requires a few Home Assistant `todo.*` entities (for the recipe box, meal plan, and reminders) and at least one `calendar.*` entity — see [Requirements](/docs/requirements) for the full list.

## Option A: HACS (recommended)

Family Hub isn't in the default HACS store yet, so add it as a custom repository:

1. In Home Assistant, go to HACS → the ⋮ menu (top right) → **Custom repositories**, and add this repository's URL with category **Integration** — or use this one-click link:

   [![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=JVarhol&repository=HA-Family-Hub&category=integration)

2. Find **Family Hub** in HACS and click **Download**.
3. Restart Home Assistant.
4. Settings → Devices & Services → **Add Integration** → search for **Family Hub** — or use this link:

   [![Open your Home Assistant instance and start setting up a new integration.](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=family_hub)

## Option B: Manual copy

1. Copy the `custom_components/family_hub` folder into your own `/config/custom_components/` (overwrite an existing install to update it).
2. Restart Home Assistant.
3. Settings → Devices & Services → **Add Integration** → search for **Family Hub**.
4. Add the card(s) you want to a dashboard — see [Card Configuration](/docs/card-configuration) for example YAML.
