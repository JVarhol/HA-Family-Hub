---
title: Installation
sidebar_position: 1
---

You'll want at least one `calendar.*` entity and, for notifications, the Home Assistant Companion app on your phones. The `todo` lists Family Hub uses are created for you. See [Requirements](/docs/requirements).

## Option A: HACS (recommended)

Family Hub isn't in the default HACS store yet, so add it as a custom repository:

1. In Home Assistant, go to HACS → the ⋮ menu (top right) → **Custom repositories**, and add this repository's URL with category **Integration**. Or use this one-click link:

   [![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=JVarhol&repository=HA-Family-Hub&category=integration)

2. Find **Family Hub** in HACS and click **Download**.
3. Restart Home Assistant.
4. Settings → Devices & Services → **Add Integration** → search for **Family Hub**. Or skip the search with this link:

   [![Open your Home Assistant instance and start setting up a new integration.](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=family_hub)

## The setup wizard

Adding the integration opens a short setup wizard. Nothing in it is required, and every answer can be changed later (from the card's own ⚙️ Settings, or Family Hub → **Configure**).

1. **Features**: what to set up now (the Family Week Calendar card, the Theme Builder panel).
2. **Add users**: pick the Home Assistant logins that make up the household. This is what puts someone on the Users tab, the Chores board, and the Rewards balances.
3. **Set up each member**: a board color, whether they're included in Chores & Rewards, and **Their own calendar** (optional). The calendar you pick becomes their column on the family calendar, in their color.
4. **Chores, Rewards & Routines**: optional switches for Routines and where Goals show.
5. **Family calendar**: pick shared calendars (a family calendar, a school calendar, a child without their own login). Each one becomes its own column.
6. **Grocy** (optional), **Notifications** (a default target for event reminders), and **Daily Digest** (optional).
7. **All set**: a short tour of the Family Hub cards and what each one does. Add them to any dashboard with Edit dashboard → **Add card** and search "Family". Start with the **Family Week Calendar**: its ⚙️ holds Settings for all of Family Hub.

Calendars picked in steps 3 and 5 are also watched for event reminders. You can skip both and add calendars later from Settings → General → Calendars.

## After installing

1. Add the **Family Week Calendar** card to a dashboard. Its **⚙️ Settings** is where everything else is set up: see [Settings](/docs/settings-modal).
2. Add any other [cards](/docs/card-configuration) you want.
3. On each phone, open Settings → Users → your profile → **Notify targets** → **Auto-detect this device**, so reminders reach you.
4. Wall tablet? Give it its own Home Assistant login, tick **Kiosk** in its profile, and set up Kiosk PINs for the family.

## Option B: Manual copy

1. Copy the `custom_components/family_hub` folder into your own `/config/custom_components/` (overwrite an existing install to update it).
2. Restart Home Assistant.
3. Settings → Devices & Services → **Add Integration** → search for **Family Hub**.
4. Add the card(s) you want to a dashboard. Each card's page under [Cards](/docs/card-configuration) has example YAML.
