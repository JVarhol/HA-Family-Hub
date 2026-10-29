---
title: Integration Options (Configure)
sidebar_label: Integration Options
description: What's under Settings → Devices & services → Family Hub → Configure.
---

A few things are set up in Home Assistant's own integration screen instead of the card's ⚙️ Settings: **Settings → Devices & services → Family Hub → Configure**. You need to be a Home Assistant admin.

| Option | What it's for |
|---|---|
| **Family Hub Settings** | Just a pointer: almost everything is in the calendar card's ⚙️ Settings. See [Settings](/docs/settings-modal). |
| **Calendar reminders** | Which calendars the backend watches for event reminders, and how often it checks. |
| **Grocy** | Connect Grocy. |
| **Test a notification** | Send a test message to any notify target. |
| **Upcoming notifications** | See what's queued to fire. |
| **Restore a backup** | Restore, export or import a backup. |
| **Update Family Hub** | Install a new version from a zip file. |

## Calendar reminders

- **Calendars to monitor**: the calendars the backend checks for events with a **Remind me** time. Leave it empty to turn event reminders off. Calendars picked in the setup wizard are already here.
- **Check every (minutes)**: how often the backend checks (default 5). Reminders, event alerts, chore due reminders, roll-overs and the Daily Digest all run on this check, with or without a dashboard open.
- **(Legacy) Default notify target** and **(Legacy) Per-calendar notify overrides**: kept from older versions for reference only. Nothing reads them any more. Who gets notified is now set per person: Settings → Users → their profile.

## Grocy

**Grocy URL** (for example `http://homeassistant.local:9192`) and **Grocy API key** (create one in Grocy under the 🔧 menu → Manage API keys). Leave both blank if you don't use Grocy. The key is stored in the integration, never in the card's Settings. What it adds: [Grocy Integration](/docs/features/grocy-integration).

## Test a notification

Pick any notify target (like `notify.mobile_app_pixel_9`) and Family Hub sends it a test message right away. Use it to check a phone gets notifications before relying on reminders, or to rule delivery in or out when reminders don't arrive.

## Upcoming notifications

A read-only list of the event reminders and other notifications that are queued, so you can check one is set up right without waiting for it.

## Backups

Family Hub saves a snapshot of your **Settings, Permissions and per-device settings** every 12 hours (at midnight and noon) and keeps the last 8. Take one any time with **Back up now** in Settings → Developer tools.

- **Restore a snapshot**: pick one. A safety snapshot of what you have now is always taken first, so a restore can be undone. You can also choose **Also restore and push per-device settings**; it's off by default, because usually you only want the household settings back, not every tablet's layout rolled back too.
- **Export a snapshot to a file**: the next screen has a link that downloads it. A copy is also saved in Home Assistant's config folder under `family_hub_backups/exports`.
- **Import a snapshot from a file**: upload an exported file (from this install or another one). It's added as a new snapshot; nothing changes until you restore it.

These snapshots cover Family Hub's settings only. Chores, rewards, goals, star balances, calendars and to-do lists aren't in them; Home Assistant's own backups cover everything.

## Update Family Hub

Upload a `family_hub_vN.zip` release file to update without SSH or a file manager. The current install is backed up automatically first, and nothing is overwritten unless the zip checks out. Restart Home Assistant afterwards (Settings → System → Restart). Your themes, calendars and reminders are untouched.

With HACS, just update from HACS instead.
