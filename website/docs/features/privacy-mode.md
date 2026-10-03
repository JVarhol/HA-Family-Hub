---
title: Privacy Mode
sidebar_position: 10
---

Privacy Mode hides the calendar and reminders across every Family Hub dashboard in the house at once, for whenever something on the shared screens shouldn't be visible to whoever's walking by (a surprise party, a medical appointment, anything you'd rather not have on a kitchen kiosk for everyone to see).

## What it actually hides

Turning Privacy Mode on blanks out calendar events and reminders: every day/week/month cell, the Agenda view, and the reminders list all render exactly like a genuinely empty day, rather than being covered up by a black panel or a "hidden" placeholder. Everything else on the calendar card (the grid itself, meal blocks, countdown, weather) stays visible as normal. Privacy Mode only affects the main calendar card. The standalone Chores, Rewards, My Pantry, My Chores, To-Do Lists, and Screen Saver cards are completely unaffected and keep working normally.

A small locked pill appears over the card instead: "Privacy Mode is on - tap to unlock."

## Turning it on

Anyone can turn Privacy Mode on, with no PIN and no permission needed. From the card's **☰ "more" menu**, tap **Enable Privacy Mode**. There's deliberately no gate on making the screen *more* private.

## Turning it off

Tap the locked pill, pick your name from the list of people eligible to unlock it, and enter your **Kiosk PIN** (the same PIN you'd set up for Kiosk PIN login elsewhere in Family Hub; there's no separate "privacy PIN"). Unlike turning it on, turning Privacy Mode off IS gated:

- A real Home Assistant admin account can always unlock it.
- Anyone else needs the **Turn off Privacy mode** permission, granted per-person under Settings → Users → their profile → Permissions (the "Privacy" group). Off by default. A household grants it to whoever should be able to clear Privacy Mode.

## It's household-wide, with a per-device opt-out

Privacy Mode itself is a single flag, not a per-device setting: every Family Hub dashboard in the house blanks out together the instant it's turned on. But any individual device can opt out of obeying it: under Settings → **Devices** tab, uncheck **Participates in Privacy Mode** for that device. This is for things like "let my phone keep showing the calendar while the kitchen kiosk/fridge display goes private," the household's own reasoning for adding it. It takes effect immediately, no Push needed, and every device participates by default unless you turn this off for it specifically.

## Automation entities

Two Home Assistant entities let Privacy Mode be driven from automations, voice commands, or your own dashboards, not just the card's own menu:

- **`switch.family_hub_privacy_mode`**: one per household. Turning it on or off this way needs no PIN at all, in either direction: an automation or a script call is already an authenticated Home Assistant action, a different trust boundary than an anonymous tap on a kiosk's lock screen, so the PIN gate deliberately only applies to the on-screen unlock flow.
- **A "Participates in privacy mode" switch per device**, the same per-device opt-out described above, exposed as its own entity so it can be automated too (e.g., automatically flip a specific kiosk out of Privacy Mode during a scheduled event).
