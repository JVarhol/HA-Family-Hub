---
title: Screen Saver
sidebar_position: 6
---

Built for a wall-mounted display: after the dashboard sits idle, a full-screen video or live camera feed takes over, with your own widgets on top. Any tap wakes it.

## Setting it up

Everything is in Settings → General → **Screen Saver**:

- **Source**: **Video** (a direct link to a video file, or a file under Home Assistant's `/local/` folder; it loops muted) or **Camera** (any camera entity, live).
- **Idle time before it shows**, in seconds. Any tap, key press or scroll restarts the countdown.
- **Disable while a recipe is open**: pauses the countdown while someone has a recipe open, so it doesn't kick in mid-recipe. Browsing the recipe list still counts as idle.
- **Return to this dashboard on wake**: jump to a chosen dashboard when it's tapped away, instead of staying where it fell asleep.
- **Screen Saver logins**: tick the Home Assistant logins that should get it. A wall tablet's login can have it while everyone's phones don't.

The source, idle time and widgets are shared by the whole household.

## Suggested: a photo slideshow

The **Camera** source works with any camera entity, so the easiest way to turn the screen into a photo frame is an integration that makes a slideshow camera. We like [Album Slideshow](https://github.com/eyalgal/album_slideshow) (install it from HACS). It reads Google Photos shared albums, Immich, PhotoPrism, iCloud shared albums, Synology Photos, Nextcloud, a local or NAS folder, or a Home Assistant media source, and creates a camera that cycles through the pictures. Pick that camera as the screen saver's **Camera**, and the widgets below sit on top of your photos.

## Widgets

The widgets are drawn straight onto the picture, the way a photo frame does it: big, thin type with no card around it (2026.11.1.4+).

![The screen saver with a clock, weather, Next up and a light](/img/screenshots/screensaver-landscape.webp)

Open Settings → General → Screen Saver → **Widgets on the screensaver**. **Add widget** offers:

| Widget | Shows |
|---|---|
| **Clock** | **Big digits**, **Stacked** (weekday, time, date, like a smart display), **Minimal** (time · weekday) or a **Clock face**. Seconds and the date are optional. 12 or 24 hours follows Home Assistant unless you pick one. |
| **Weather** | The icon, temperature and condition. Optionally today's high and low, or the next 3 days. |
| **Clock & weather** | The time with "☀️ 64° · Tuesday, October 27" under it, as one piece. |
| **Next up** | The next 1 to 3 events from everyone's calendars (or the ones you list), with each person's picture, and "Now" for one that's on. Hidden in Discreet Mode. |
| **Entity** | Any entity: its icon, name and state. Switches, lights, fans, covers and scripts can be set to **tap to toggle**, which works without waking the screen. |
| **Camera** | A camera in a rounded picture-in-picture tile. Give it an **Only show when** entity (a doorbell, a motion sensor or an event entity) and it only appears when that goes off, for as long as you choose. |
| **Text** | A line of your own text. |
| **Custom card** | Any Lovelace card, written as JSON, for anything else. |

### Where widgets go

Each widget goes in one of 9 spots (the corners, the middle of each side, and the centre) and has a size: Small, Medium, Large or Extra large. Sizes follow the screen's shorter side, so the same layout works on a landscape TV, a portrait tablet, a square frame or a phone. Widgets in the same spot stack, and spots that would run into each other on a narrow screen shrink a little until they fit.

![The same layout on a portrait screen](/img/screenshots/screensaver-portrait.webp)

The editor shows a live preview. **This screen** uses the shape of the screen you're on; **Landscape**, **Portrait**, **Square** and **4:3** show how it looks elsewhere. If the screen saver uses a camera, the preview sits on its picture. Drag a widget in the preview to another spot, or tap it to change it.

![The widget editor](/img/screenshots/screensaver-editor.webp)

![Changing a widget](/img/screenshots/screensaver-widget-form.webp)

### Readable on any picture

- **Text color**: **Automatic** looks at the picture behind each spot and uses light text on a dark picture and dark text on a light one. You can also fix it to **Light** or **Dark**.
- **Soft shade**: a faint shadow behind the spots that have widgets keeps them readable on busy pictures, without a box. It can be turned off under **On the screen**.

![Dark text on a light picture](/img/screenshots/screensaver-light-picture.webp)

### On the screen

- **Move widgets slightly every few minutes**: shifts everything by a few pixels now and then, so nothing burns into the screen. On by default.
- **Night mode**: between two times, dims the screen to the brightness you choose, and can turn the clock red.

Old layouts move over automatically: each widget lands in the spot nearest where it was, a "Digits only" clock becomes a Clock, a Weather card becomes Weather, Markdown becomes Text, and any other card stays a Custom card. **Hide widgets on this device** still hides chosen widgets on just the screen you're on. The calendar card and the standalone [Screen Saver card](/docs/cards/screen-saver) draw the widgets the same way.

![Clock & weather with two entities on a square frame](/img/screenshots/screensaver-square.webp)

## Per screen

- Each screen can be switched off from Settings → **Devices** → **Screensaver enabled**, without changing anyone's login. It takes effect immediately.
- The same switch is a Home Assistant entity, so an automation can turn the screen saver off during a party and back on afterwards. See [Automations & Entities](/docs/features/automations-and-entities#per-screen-entities).

## Which dashboards

The screen saver runs on any dashboard that has a Family Hub card, and only once, however many Family Hub cards are on it. For a dashboard with no Family Hub card, add the small [Screen Saver card](/docs/cards/screen-saver).
