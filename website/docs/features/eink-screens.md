---
title: E-ink Screens
sidebar_position: 10
---

The calendar can run on an e-ink display: a Kindle- or Boox-style tablet, a
color e-ink tablet, or an e-ink photo frame that just shows the week. Turn on
**E-ink screen** in Settings → Calendar Card Layout on that device
(2026.11.1.15+). It's saved for that device only, so the color tablet in the
kitchen keeps its theme while the frame in the hall shows the e-ink look. An
admin can also set it for any device from the
[Devices tab](/docs/settings-modal#devices-tab-admin-only).

<img src="/HA-Family-Hub/img/screenshots/settings-eink.webp" alt="E-ink screen: Off, Black & white, Color (6 ink) and Color (Kaleido), and Can be tapped: Yes or No - just shows the calendar" width="460" />

A device that only shows other cards (a frame with just Today or Chores, say)
has no calendar Settings to turn it on from, so it can also be set by the
dashboard link (2026.11.1.16+): open the dashboard once with
`?fh_eink=bw` (or `color6`, `kaleido`, `off`) on the end of its address, and
add `&fh_eink_tap=off` for a frame nobody touches. That device remembers it
from then on, like the Settings choice.

## What it changes

Every choice has the same base:

- **Black on white with strong outlines.** No shadows, see-through panels,
  blur or soft grays, which only turn into speckle on e-ink.
- **Today is shown in reverse**, white on a black header with a thick
  outline, so it reads from across the room. The event happening now is
  black too.
- **Meals have dashed outlines**, so they read as a different kind of thing
  from events without needing a color.
- **No motion.** Animations and transitions are off, and the calendar redraws
  every 5 minutes instead of every minute, because every redraw makes an
  e-ink screen flash.
- **Single-color weather icons**, and no edit pencils on events.
- The theme on that device is set by E-ink screen while it's on, so a
  household or holiday theme can't bring the soft colors back.

## Black & white

For black-and-white and grayscale e-ink. Each person gets a **pattern**
instead of a color: a strip down the left of their events and on their name
pill (solid, stripes, dots, bars and so on, in the household's order). Their
initial stays on every event, and the name pills at the top work as the key.

![The week on a black and white e-ink screen: each person's events marked with a pattern strip, today in reverse](/img/screenshots/eink-bw.webp)

## Color (6 ink)

For color e-ink photo frames with six inks (Spectra 6: black, white, red,
yellow, blue, green). These can't show in-between shades, so a soft pastel
event turns into a grainy, speckled block. Instead each person gets a **real
ink** as their strip: Family Hub picks the nearest ink to each person's own
color, gives no two people the same one, and uses a striped ink once the
five are taken. Holiday photos behind a day are left out on these panels.

![The week on a six-ink color e-ink frame: white events with a red, green, blue, yellow or black strip per person](/img/screenshots/eink-color6.webp)

## Color (Kaleido)

For color e-ink tablets (Kaleido 3, like the Boox Go Color or PocketBook
color models), which show thousands of colors but muted. Events keep their
fill in each person's own color, made stronger so it survives the muting,
with black outlines and text.

![The week on a color e-ink tablet: events filled with stronger versions of each person's color, black outlines](/img/screenshots/eink-kaleido.webp)

## A frame that only shows the calendar

Set **Can be tapped** to **No - just shows the calendar** for a frame nobody
touches: the top bar and the + button are hidden, so the week fills the
screen. The name pills stay as the key to who's who. To change it back, use
the Devices tab in Settings on another device.

![A display-only e-ink frame: no top bar or + button, just the name pills and the week](/img/screenshots/eink-frame.webp)

## The other cards

E-ink screen covers the cards you'd put on an e-ink screen too (2026.11.1.16+):
**Today**, **Right Now**, **Chores** and **My Chores** (routines included),
**Rewards**, **Goals** and **To-Do Lists**, with the same black on white,
outlines and no motion. Each person keeps the same pattern or ink on every
card as on the calendar, on their name pills, dots, columns and Right Now
tiles. Today's event happening now is shown in reverse, like on the
calendar. **My Pantry** and the **Recipe Box** get the same plain e-ink look.

The **Timers** card and the **Screen Saver** card are left as they are: a
countdown changing every second makes an e-ink screen flash constantly, and
photos don't suit e-ink.

![Today, Right Now, Chores and Rewards on a black and white e-ink screen, each person with the same pattern on every card](/img/screenshots/eink-cards-bw.webp)

![The same cards on a six-ink color frame: each person's real ink on their pills, dots and tiles](/img/screenshots/eink-cards-color6.webp)
