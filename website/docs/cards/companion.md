---
title: Companion
description: A child's own bedside screen - wake-up, routines one step at a time, timers, stars, messages and a comfort button.
---

**Family Hub Companion** is a screen for one child, made for the little display by their bed: a smart clock running a
browser, an 8" tablet on a stand, or a smart display. Through the day it changes on its own:

| Part of the day | What they see |
|---|---|
| **Night** | A dim red clock (or nothing), an amber "Stay in bed until 7:00 AM", sleep sounds, and **I need a hug** |
| **Wake-up** | "Good morning, Emma!", a green ok-to-get-up screen, the weather and what to wear, an alarm and **I'm up!** |
| **Morning, after school, bedtime** | Their [routine](/docs/features/chores-rewards-goals-routines) one big step at a time: **Now** and **Then**, a big **Done!** and stars |
| **Day** | A big clock, what's next on their calendar, their next job (with its own Done), a timer as a shrinking circle, their stars and what they're saving for |

![The Companion morning routine: Now brush teeth, Then get dressed, a big Done button](/img/screenshots/companion-routine.webp)

<img src="/HA-Family-Hub/img/screenshots/companion-wake.webp" alt="Wake-up: Good morning, the weather and what to wear, and I'm up" width="49%" /> <img src="/HA-Family-Hub/img/screenshots/companion-night.webp" alt="Night: a dim clock, Stay in bed until 7:00 AM and I need a hug" width="49%" />

<img src="/HA-Family-Hub/img/screenshots/companion-day.webp" alt="Day: a big clock, a screen-time timer, the next event and job, stars" width="49%" /> <img src="/HA-Family-Hub/img/screenshots/companion-message.webp" alt="A message from Mom: Dinner in 5 minutes! and Got it" width="49%" />

## Set it up

1. On the child's screen, make a dashboard with a **Panel** view and add the **Family Hub Companion** card. Pick the
   child in the card's settings (or leave **Whoever is signed in** if the screen is signed in as them).
2. In the calendar's **⚙️ Settings → Users → their profile → Companion screen**, set their day: wake-up and bedtime
   (school days and weekends), when school's out, and how long before bed the bedtime routine starts.
3. Give them [routines](/docs/features/chores-rewards-goals-routines) (Morning, Afternoon and Night). Those are the
   steps Companion walks through. Chores, stars and rewards work as they do everywhere else.

## Their day

- **Morning routine** shows from wake-up until noon (after the good-morning screen), **after school** from the time
  school's out, and the **bedtime routine** for the set time before bed. When a routine is done, there's a little
  celebration and the day screen comes back.
- Steps for other days of the week don't show. Ticking a step off on Companion ticks it off everywhere, and stars are
  paid out the same way as on the Chores card.
- **Grown-ups:** press and hold the clock for a couple of seconds for **Bedtime now**, **Sleep now**, **Day** or **Back
  to the schedule** (for the next hour). It needs a grown-up to be signed in on that screen, or use the buttons in Settings.

## Sounds

Sounds come from the screen itself, made on the device, so there's nothing to download:

- **Wake-up alarm:** chimes, birds or marimba. It plays until they tap **I'm up!** (or two minutes pass).
- **Sleep sound:** white noise, soft noise, deep rumble, rain or waves, all night, at the volume you set.
- **Messages** are read out loud.

:::note Browsers and sound
Browsers only allow sound after someone has touched the screen. If **🔈 Tap for sound** shows in the corner, tap it once.
Kiosk browsers like Fully Kiosk have a setting that lets pages play sound on their own.
:::

## Their room light and waking up

Pick their room light in Settings and Companion uses it too:

- **Amber nightlight all night**, very dim, which means *stay in bed*.
- **Sunrise, then the alarm:** the lights slowly brighten to a warm glow, finishing right at wake-up time, and then the
  alarm goes off on the screen. Choose how long the sunrise takes (10 to 60 minutes). With the alarm set to **No alarm**,
  the sunrise wakes them on its own.
- **More lights to wake them:** add the ceiling light or a lamp. They join the sunrise and the wake-up, not the nightlight.
- **When it's time to get up**, the lights go:
  - **Green**: *ok to get up*, then their room light turns off once the morning starts.
  - **Bright light, stays on**: a bright, cool-white light on all of them, for getting dressed.
  - **Stay as the sunrise ended.**
- **Also at wake-up, run** a scene, script or automation: open the blinds, start music, warm up the bathroom.

The lights only change when the part of the day changes, so you can still switch them yourself. With
`family_hub.companion_mode` set to `wake`, the wake-up lights and action run right away (handy for trying it out).

## Messages

Send a message from **Settings → Users → their profile → Companion screen**, or from an automation:

```yaml
action: family_hub.companion_message
data:
  person: Emma
  message: Dinner in 5 minutes!
  from: Mom
```

It takes over their screen, is read out loud, and stays until they tap **Got it**. Settings shows when they saw it.

## I need a hug

At night, **I need a hug** starts slow breathing on the screen for three minutes. The people you pick in Settings get
a notification on their phone.

## A physical button

Set **Physical button** in the card's settings to any button by the bed (a Zigbee button's event, an `input_button`, a
binary sensor). Pressing it does what the big button on screen does: **Done!**, **Got it**, **I'm up!**, and at night it
starts the hug breathing. Great for little ones, and for screens that can't be tapped.

## For automations

Companion fires `family_hub_companion_event` with the child's `user_id` and a `type`:

| type | When |
|---|---|
| `mode` | The part of the day changed (`mode`, `previous`: `sleep`, `wake`, `morning`, `day`, `afternoon`, `bedtime`) |
| `step_done`, `routine_done` | A routine step, or the whole routine, was done on Companion |
| `comfort` | **I need a hug** was pressed |
| `message_sent`, `message_ack` | A message was sent, and when they tapped **Got it** |
| `alarm_stopped` | They tapped **I'm up!** |

`family_hub.companion_mode` puts their screen (and light) into a part of the day for a while:

```yaml
action: family_hub.companion_mode
data:
  person: Emma
  mode: bedtime   # or sleep, wake, morning, day, afternoon, or auto to go back
  minutes: 60
```

## YAML

```yaml
type: custom:family-hub-companion-card
person: 0a1b2c3d4e5f...      # their Home Assistant user ID, or "me"
button_entity: event.emma_bed_button
height: 100vh                # fills a Panel view; or a size like 480px
clock_seconds: false
```

## Screens

Companion is made to be read from across a bedroom, and the same layout scales from a 4" smart clock (800×480) to a
tablet. It runs on older Android browsers too, like the ones on hacked smart clocks. Portrait tablets get a stacked layout.
