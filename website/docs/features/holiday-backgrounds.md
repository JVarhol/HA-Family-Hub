---
title: Holiday Backgrounds
sidebar_position: 11
---

Show a photo on a holiday or special day, from Settings → General → **Holiday Backgrounds**. Each holiday has an on/off switch; turning one on shows its options:

- **Photo**: the picture to show.
- **Show the photo**: **Behind its day** (a soft background behind just that day's own cell: a Week view day column, a Month view cell, or a Planner day), or **Full screen** for that day, that week or that month.
- **Theme** (v1.168.88+): optionally switch every Family Hub card to one of your themes while the holiday is showing, then back afterwards. It follows the same dates as the photo: the day, or the whole week or month when the photo is set to fill the screen for it. A holiday can change the theme without a photo, too. A card that has its own theme set in its card editor keeps it.

## Built-in holidays

Toggle on any of the built-in dates (New Year's Day, Valentine's Day, St. Patrick's Day, Easter, 4th of July, Halloween, Thanksgiving, and Christmas) and upload your own photo for it (these are dates only; no image ships bundled with any of them). Easter and Thanksgiving are computed fresh each year (the actual Sunday/4th-Thursday), not a fixed month/day, so they land correctly every year with no maintenance. Any built-in holiday can be renamed from Settings too.

## Custom dates

Use **+ Add custom date** for anything the built-in list doesn't cover: a birthday, an anniversary, a family tradition, a one-off event. Each custom entry gets its own uploaded photo and name. An entry can have **several dates** (v1.168.88+), each with an optional name: tap **+ Add another date** to put everyone's birthday under one "Birthdays" entry that shares one photo and theme. Each date can be either:

- **Recurring**: the same month/day every year, like the built-ins, or
- **A specific one-time year**: shows only for that exact date once, never recurring.

Every entry (built-in or custom) can independently be set to show behind its day or fill the screen for its day, week or month, and can have its own theme.

## When more than one holiday wants the screen

It's possible for two enabled, full-screen holidays to both want the card on the same day: a month-long custom background overlapping a single-day built-in one, for instance. Family Hub resolves that automatically:

1. **The narrower scope wins**: a single day beats a week, a week beats a month. The idea is that checking "month" for one background and "day" for another almost always means "show the month backdrop generally, but let the specific day take over on its own day."
2. **Still tied (same scope)?** Whichever entry's own date is closest to today (or, if you've navigated away from today, closest to whatever range is currently on screen) wins: the more "currently relevant" one.
3. **Still tied?** Falls back to list order: built-in holidays before custom ones, then whichever was added first.

A day-scope background only ever takes over on its exact real-world date, even while browsing a Month view that spans the whole month around it, so simply looking at a month a holiday falls in doesn't accidentally trigger its full-screen takeover early.

If two holidays with a theme overlap, the theme follows the same rule: the shorter one wins (a day beats a week, a week beats a month).

## Readability over the photo

Family Hub automatically samples each uploaded photo's average brightness and switches day names/numbers to white text when the photo is dark enough to need it. That way a dark holiday photo doesn't swallow the date numbers and headers along with it. Nothing to configure; it just adapts to whatever you upload.
