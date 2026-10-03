---
title: Introduction
sidebar_position: 0
---

# Family Hub

Family Hub is a Home Assistant custom integration that bundles a whole family-tablet dashboard — calendar, meal planning, chores, rewards, goals, routines, and more — into one install/update. It runs entirely on your own Home Assistant instance, with no cloud service required.

## Why Family Hub exists

For years, the idea was a nagging itch: put a digital calendar on the wall. Nothing wildly complex — just a clean display that actually shows what's going on in the family's lives. A magnetic chalkboard worked for a while, but swapping meal dates meant erasing and rewriting, historical planning was impossible, and the whole thing lived completely separate from the rest of the smart home.

Commercial smart displays like Skylight solve the display problem, but at a real cost — often around $300 — for a locked-down Android tablet running closed-source software you can't modify or extend. Paying that much for something you can't tinker with, and that has no idea your lights, thermostat, or anything else in your home even exists, didn't make sense when Home Assistant was already running the rest of the house.

Family Hub is the Home Assistant-native answer: an **11-card ecosystem** built from the ground up for Home Assistant, modular and fully configurable, deployable across wall tablets, desktops, and phones — built to compete with commercial family-hub tablets (Skylight, Dragon Touch, Cozyla, Nori, and similar) while running entirely on infrastructure you already own and control.

## What's included

- **Family Week Calendar** — the centerpiece: a full-screen, tablet-friendly Week/Month calendar with per-day meal planning, a recipe box, weather, a countdown banner, and a Daily Digest.
- **Family Today** — a small single-day companion card for any dashboard, sharing the main card's config automatically.
- **Chores, Rewards, Goals & Routines** — assignable/rotating/first-come chores with a star economy, a redeemable rewards catalog, one-off goals, and Morning/Afternoon/Night routine checklists.
- **To-Do Lists, Recipe Box & Pantry** — native Home Assistant to-do integration, a searchable recipe box, and pantry/grocery tracking via an optional [Grocy](https://grocy.info) connection.
- **Active Timers & Screen Saver** — a household-wide timers board, plus an idle-triggered full-screen screen saver (video, camera feed, clock, weather, or photos).

See [Calendar & Layout](/docs/features/calendar-and-layout) and the rest of the Features section in the sidebar for the full list, or jump straight to [Installation](/docs/installation).

## Status

Family Hub is in active beta development. Source, issue tracker, and releases all live on [GitHub](https://github.com/JVarhol/HA-Family-Hub); there's also ongoing discussion in the [original Home Assistant Community thread](https://community.home-assistant.io/t/ha-family-hub-a-ha-focused-alternative-to-skylight-nori-cozyla-etc/1025747) and on the Home Assistant Discord server.
