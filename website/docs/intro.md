---
title: Introduction
sidebar_position: 0
---

# Family Hub

Family Hub is a Home Assistant custom integration that bundles a whole family-tablet dashboard into one install: calendar, meal planning, chores, rewards, goals, routines, and more. It runs entirely on your own Home Assistant instance, with no cloud service required.

## Why Family Hub exists

For years, the idea was a nagging itch: put a digital calendar on the wall. Nothing wildly complex, just a clean display that actually shows what's going on in the family's lives. A magnetic chalkboard worked for a while, but swapping meal dates meant erasing and rewriting, historical planning was impossible, and the whole thing lived completely separate from the rest of the smart home.

Commercial smart displays like Skylight solve the display problem. They don't solve the price or the lock-in: often around $300 for an Android tablet running closed-source software you can't modify or extend, with no idea your lights, thermostat, or anything else in your home even exists. Paying that much for something you can't tinker with didn't make sense when Home Assistant was already running the rest of the house.

Family Hub is the Home Assistant-native answer: a **12-card ecosystem** built from the ground up for Home Assistant, modular and fully configurable, deployable across wall tablets, desktops, and phones. It's built to compete with commercial family-hub tablets (Skylight, Dragon Touch, Cozyla, Nori, and similar) while running entirely on infrastructure you already own and control.

![The Family Week Calendar in Week view, with meals, weather and colored person pills](/img/screenshots/calendar-week.webp)

*The Family Week Calendar on a 1280×800 wall tablet (demo household, made-up data).*

## What's included

- **Family Week Calendar**: the centerpiece, a full-screen, tablet-friendly Week/Month calendar with per-day meal planning, a recipe box, weather, a countdown banner, and a Daily Digest.
- **Family Today**: a small single-day companion card for any dashboard, sharing the main card's config automatically.
- **Right Now**: who's home, what everyone is doing right now, and what's next. Use it as its own card, or turn it on as a bar across the top (or down the side) of the calendar.
- **Chores, Rewards, Goals & Routines**: assignable/rotating/first-come chores with a star economy, a redeemable rewards catalog, one-off goals, and Morning/Afternoon/Night routine checklists.
- **To-Do Lists, Recipe Box & Pantry**: native Home Assistant to-do integration, a searchable recipe box, and pantry/grocery tracking via an optional [Grocy](https://grocy.info) connection.
- **Active Timers & Screen Saver**: a household-wide timers board, plus an idle-triggered full-screen screen saver (video, camera feed, clock, weather, or photos).
- **Quick Add**: type or say one line, like "Soccer Tuesday 5pm for Emma" or "tacos for dinner Friday", and it lands in the right place. Works in the calendar and with Assist chat and voice. See [Quick Add](/docs/features/quick-add).
- **Your own buttons**: add pop-ups to the calendar's More menu with text, photos, links and QR codes (guest Wi-Fi, including UniFi's own QR code, contacts and more), optionally locked to chosen people.
- **Themes and languages**: 10 built-in themes (including Liquid Glass and two that match Home Assistant's own look), a Theme Builder for your own, and translations into English, German, Spanish, French, Italian, Dutch, Polish and Portuguese (Brazil). See [Theming](/docs/features/theming-and-more).

See [Calendar & Layout](/docs/features/calendar-and-layout) and the rest of the Features section in the sidebar for the full list, browse [all 12 cards](/docs/card-configuration), or jump straight to [Installation](/docs/installation).

## Status

Family Hub is in active beta development. Source, issue tracker, and releases all live on [GitHub](https://github.com/JVarhol/HA-Family-Hub). Come say hi, ask questions and share your setup in the [Family Hub discussion on Discord](https://discord.com/channels/330944238910963714/1543630448800960653) or the [Home Assistant Community thread](https://community.home-assistant.io/t/ha-family-hub-a-ha-focused-alternative-to-skylight-nori-cozyla-etc/1025747). Bugs and feature requests go on [GitHub Issues](https://github.com/JVarhol/HA-Family-Hub/issues).
