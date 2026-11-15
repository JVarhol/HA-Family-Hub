---
title: People & Sign-in
sidebar_position: 4
description: Who's in Family Hub, the kinds of accounts, signing in on a shared screen with a PIN, and who's home.
---

Everyone in Family Hub is a **person** on the calendar's **Settings → Users** tab. This page is the overview: the
kinds of people, how they sign in on a shared screen, and how Family Hub knows who's home. Every setting is described
in full on the [Settings](/docs/settings-modal#users-tab) page.

![The Users tab](/img/screenshots/settings-users.webp)

## Kinds of people

| | What they are | Signs in with |
|---|---|---|
| **A grown-up** | A Home Assistant login added with **Add a person**. Admins (Home Assistant admins) can do everything; everyone else gets the [permissions](/docs/settings-modal#member-profiles) you tick for them. | Their own Home Assistant login, or their PIN on a shared screen |
| **A child** | The same, with **Child** ticked in their profile: they can't open the Users tab or change their own profile, and Companion and the kid views treat them as a child. | Their own login (a phone or tablet of their own), or their PIN |
| **Someone without a Home Assistant login** (2026.11.2+) | A person added by name only, usually a young child who only uses the family tablet. Their notifications go to the phones of the admin who added them. | Only their PIN, on a shared screen |
| **A kiosk** | Not a person: the Home Assistant login a shared wall tablet stays signed in as. Never on Chores, Rewards or Goals, never gets reminders. | (stays signed in) |

We recommend a real Home Assistant login for everyone you can: it's free, it can still be a Child account, and it
gives them notifications on their own phone. Someone added without a login can be moved to one later with
**Give them a login**, and everything they have (chores, stars, rewards, routines, goals, Companion) moves with them.
See [Add someone without a Home Assistant login](/docs/settings-modal#add-someone-without-a-home-assistant-login-admin-only).

Every person (except a kiosk) gets their own **Reminders** and **Wish List** to-do lists, a colour, a Chores column
(unless you turn **Chores** off for them) and a star balance.

## Signing in on a shared screen

A wall tablet is signed in as one Home Assistant login, usually a **Kiosk** account. To act as themselves on it,
anyone with a **Kiosk PIN** taps **🔒 Login** (on the Chores, Rewards and To-Do Lists cards), picks their name and types
their PIN. Until they log out, or after 45 seconds of no taps, the screen acts as them:

- their own chores, stars and rewards, and whatever their permissions allow (approving chores, managing rewards);
- their wish-list claims;
- unlocking [Privacy Mode](/docs/features/privacy-mode) and locked More-menu pop-ups.

Set a PIN in their profile under **Kiosk PIN login** (4 to 8 digits). Five wrong PINs in a row lock that person's PIN
for 5 minutes.

The [kid-friendly views](/docs/features/kid-friendly-views) and [Companion](/docs/cards/companion) let a child do their
own things without a PIN; a grown-up's PIN is only asked for what needs a grown-up.

## One person's own view

Set **People on this card** to **Just me** on the Chores or Rewards card and it follows whoever is
signed in (or PIN-logged-in): a personal card for a phone. See
[Just me](/docs/features/chores-rewards-goals-routines#just-me-replaces-my-chores).

## Who's home

Family Hub knows who's home two ways:

- **Presence**: a `person.*` or `device_tracker.*` entity in their profile, for the Home/Away pill on the
  [Right Now](/docs/cards/right-now) card and bar.
- **Badges**: a calendar keyword that **Means they're home** or **Means they're away** (a custody calendar, a work
  trip). Away days move their chores to someone else and grey out their column. See
  [Badges: who's where](/docs/features/calendar-and-layout#badges-whos-where).

Anyone a badge is about gets a `binary_sensor.family_hub_<name>_home` entity for automations, and days marked
**No school** or **No work** (on a holiday, or your own [holidays and breaks](/docs/features/calendar-and-layout#your-own-holidays-and-breaks),
for everyone or just some people) show on their Right Now tile and wake Companion later. See
[Automations & Entities](/docs/features/automations-and-entities#entities).
