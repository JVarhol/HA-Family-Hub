---
title: Companion
description: A child's own screen for their bedroom or their phone - an ok-to-wake clock, routines one step at a time, their day, jobs, rewards, wish list, timers, room buttons and readings, messages and a comfort button.
---

**Family Hub Companion** is one card made for one child. Put it on the little screen by their bed (an old smart
clock, a cheap tablet on a stand, a smart display) or on their phone, and it changes on its own through the day:
a dim clock at night, a green "time to get up" in the morning, their routines one big step at a time, and a big clock
with their day, jobs and stars the rest of the time. A bar along the bottom opens the screens you choose for them.

![Companion's day screen: a big clock, the room temperature and humidity, stars and the reward they're saving for, what's on now, their next job and a countdown](/img/screenshots/companion-day.webp)

Everything on it comes from Family Hub: their calendar, routines, chores, stars, rewards and wish list. Tick a job off
on Companion and it's ticked off everywhere.

Companion came in 2026.11.1. Their screens in the bar, room info, timers of their own, the screensaver, phones,
themes, e-ink, and hearing the sounds and searching for things in Settings came in 2026.11.2.

**On this page:** [Set it up](#set-it-up) · [A day with Companion](#a-day-with-companion) · [Their screens](#their-screens) ·
[Screensaver](#screensaver) · [Messages](#messages) · [I need a hug](#i-need-a-hug) · [Sounds](#sounds) ·
[Room light and waking up](#their-room-light-and-waking-up) · [Every setting](#every-setting) · [Card options](#card-options) ·
[Phones](#phones-and-tablets) · [Colours, e-ink and accessibility](#colours-e-ink-and-accessibility) ·
[Example setups](#example-setups) · [Automations](#automations) · [Troubleshooting](#troubleshooting)

## Set it up

You need a Home Assistant login for the child (so Family Hub knows whose day it is) and a screen for them.

### 1. Give the child a Family Hub profile

In the calendar, open **⚙️ Settings → Users**. Your child should be in the list. If they aren't, pick their Home
Assistant login under **Add a person**. Tap **Edit** next to their name.

<img src="/HA-Family-Hub/img/screenshots/companion-settings-users.webp" alt="Settings, Users tab: Mom, Dad and Emma, each with an Edit button" width="560" />

On their profile, tap **Child** under **Account options** (so the Chores and Rewards cards treat them as a kid too). Under
**Calendar**, pick their calendar (for [My day](#my-day)), and under **Lists**, pick **Their wish list** if you want the
Wish list screen.

### 2. Open their Companion screen settings

Further down their profile, open **Companion screen**. Everything on this page is set here, per child.

<img src="/HA-Family-Hub/img/screenshots/companion-settings-open.webp" alt="A profile in Settings with the Companion screen section folded up, below Reminders" width="560" />

### 3. Set their day

Under **Their day**, set when they wake up and go to bed. School days and weekends each get their own times, plus
when school's out and how long before bed the bedtime routine starts.

<img src="/HA-Family-Hub/img/screenshots/companion-settings-day.webp" alt="Their day: wake up Mon-Fri 7:00 AM, Sat-Sun 8:00 AM, bedtime Sun-Thu 7:30 PM, Fri-Sat 8:30 PM, after school 3:30 PM, bedtime routine 30 min before bed" width="560" />

### 4. Choose what's on their screen

Under **What's on their screen**, tick the screens they get in the bar. Start small with a young child (Jobs and
Rewards, say) and add more later. [Their screens](#their-screens) shows each one.

<img src="/HA-Family-Hub/img/screenshots/companion-settings-screens.webp" alt="What's on their screen: My day, Jobs, Rewards, Wish list, Timers and Room buttons, each with a tick box, and Ask for stars" width="560" />

Tap **Save** at the bottom of Settings.

### 5. Add the card to their screen

On the screen they'll use, make a dashboard with one **Panel** view (so the card fills the screen) and add the
**Family Hub Companion** card. In the card's settings, pick the child. That's it:

```yaml
type: custom:family-hub-companion-card
person: 0a1b2c3d4e5f...   # pick them in the visual editor; or "me" for whoever is signed in
```

If the screen is signed in as the child, you can leave **Child** on **Whoever is signed in**. On a shared kiosk that
uses Family Hub's PIN login, **Whoever is signed in** means whoever logged in with their PIN.

### 6. Give them routines (optional)

Companion walks through their **Morning**, **Afternoon** and **Night** [routines](/docs/features/chores-rewards-goals-routines)
one step at a time. Make them in Family Hub like any other routine. Their [chores](/docs/features/chores-rewards-goals-routines),
stars and rewards show up on their own.

:::tip Try it out without waiting for bedtime
Press and hold the clock for a couple of seconds for the [grown-ups' menu](#grown-ups-menu), or use the **Bedtime now**
and **Back to the schedule** buttons at the bottom of their Companion settings.
:::

## A day with Companion

Companion works out the part of the day from their times. With the times above, a school day goes like this:

| Time | Part of the day | What they see |
|---|---|---|
| Before 7:00 AM | **Night** | A dim clock, "Stay in bed until 7:00 AM", **I need a hug** |
| 7:00 to 7:30 AM | **Wake-up** | "Good morning, Emma!", the weather, what to wear, an alarm and **I'm up!** |
| 7:30 AM to noon | **Morning** | Their morning routine, then the day screen once it's done |
| Noon to 3:30 PM | **Day** | The big clock, their day, jobs and stars |
| 3:30 to 7:00 PM | **After school** | Their afternoon routine, then the day screen |
| 7:00 to 7:30 PM | **Bedtime** | Their bedtime routine, in calm purple |
| After 7:30 PM | **Night** | The dim clock again |

On Friday and Saturday nights the later bedtime is used, and on Saturday and Sunday the later wake-up.

### Night

The screen goes almost black with a dim red clock, which doesn't keep anyone awake. The amber dot and "Stay in bed
until 7:00 AM" tell a child who can't read a clock yet whether it's time to get up. The bar is hidden so there's
nothing to play with in bed.

<img src="/HA-Family-Hub/img/screenshots/companion-night.webp" alt="Night: a dim red clock 9:12 PM, a moon, Stay in bed until 7:00 AM and I need a hug" width="560" />

Set **At night the screen** to **Goes dark** for no light at all: a tap shows the time for 10 seconds. A sleep sound
can play all night (see [Sounds](#sounds)).

### Waking up

At wake-up time the screen turns green: "Good morning, Emma!" and "It's time to get up", with today's weather and
what to wear (a warm coat, a raincoat, shorts and a water bottle, sunscreen). The alarm plays until they tap
**I'm up!**. Their room light can do a slow sunrise before this and turn green at wake-up
(see [Room light and waking up](#their-room-light-and-waking-up)).

<img src="/HA-Family-Hub/img/screenshots/companion-wake.webp" alt="Wake-up: Good morning, Emma! It's time to get up, 7:00 AM, 41°F and rain, a warm coat and a raincoat, I'm up!" width="560" />

The weather comes from the weather entity in Family Hub Settings. What to wear goes by the day's low and high and
whether it will rain or snow.

### Routines, one step at a time

Each routine shows one big step: its picture, its name, the time it should be done by and the stars it's worth, with
**Then** showing what comes next. They tap **✔ Done!** (or press their [physical button](#a-physical-button)) and the
next step comes up. The dots along the top show how far they are.

![Morning routine: Get dressed by 7:30 AM, +1 star, then Make bed, a big Done button](/img/screenshots/companion-morning.webp)

<img src="/HA-Family-Hub/img/screenshots/companion-afternoon.webp" alt="After school: Homework, +2 stars, then Piano practice" width="49%" /> <img src="/HA-Family-Hub/img/screenshots/companion-bedtime.webp" alt="Bedtime routine in purple: Story time, then Lights out" width="49%" />

When the last step is done there's a little celebration with their stars, then the day screen comes back.

<img src="/HA-Family-Hub/img/screenshots/companion-morning-done.webp" alt="Morning routine done! Great job! 12 stars and Movie night, 18 more stars" width="560" />

- Only today's steps show: a step set for weekdays doesn't show on Saturday.
- A step's picture is its icon from the routine library, or a picture from its words (🪥 brush teeth, 👕 get dressed,
  🛏️ make bed, 🎒 backpack, 📚 homework, 🎹 practice). Start a step's name with an emoji to choose your own.
- Ticking a step off pays stars the same way as on the Chores card, and ticks it off everywhere.
- A running timer shows as a shrinking circle beside the step.

### The day screen

The rest of the day it's a big clock with:

- **Their room readings**, like 🌡️ 70°F 💧 44% (if you've added [room info](#room)).
- **Their stars**, and the reward they're saving for with a bar. Tap it for [Rewards](#rewards).
- **What's on now or next** from their calendar ("Soccer practice, Now", "Dinner, in 25 min").
- **Their next job** with its own ✔. Tap the job for [Jobs](#jobs).
- **A countdown** from Family Hub's countdowns ("3 sleeps until Grandma's visit!").
- **A running timer** as a shrinking circle.

<img src="/HA-Family-Hub/img/screenshots/companion-day.webp" alt="The day screen with readings, stars, soccer practice now, feed the cat and 3 sleeps until Grandma's visit" width="49%" /> <img src="/HA-Family-Hub/img/screenshots/companion-day-timer.webp" alt="The day screen with a 20-minute Reading timer running as a red circle, 12 min left" width="49%" />

With nothing on, it says **Free time! 😎**. During bedtime it also says when bedtime is.

## Their screens

(2026.11.2+) The bar along the bottom opens their screens. It's there all day and during routines, and hidden at night and over
the screensaver. A screen only shows in the bar when it has something in it, and any screen goes back to the clock
after a minute without a tap.

### My day

Today as a list with times and pictures. All-day events sit at the top, earlier ones are faded with a ✓, the one
that's on now is outlined and marked **Now**, and bedtime is at the end. It scrolls to what's happening now.

![My day: Pajama day at the top, Soccer practice now, Dinner at 6:00, Piano lesson at 6:45, Bedtime at 7:30](/img/screenshots/companion-myday.webp)

The events come from the calendars in the **Calendar** section of their profile in Settings. An event that
starts with an emoji uses it; otherwise the picture comes from its words (🏫 school, ⚽ soccer, 🎵 piano lesson,
🎂 birthday, 🩺 doctor).

### Jobs

Their chores for today, and their week.

![Jobs: 3 of 5 done, 4 days in a row, this week's stars, Feed the cat with a tick, Read with a play button, Pick up toys](/img/screenshots/companion-jobs.webp)

- **"3 of 5 done"** with a bar, and their **streak** (🔥 4 days in a row).
- **This week**: stars earned on the days gone by, today's jobs done, and how many jobs are coming on the days ahead.
- Each job has a big **✔**. A job with a timer gets **▶** instead: it counts down and is done when the time runs out.
- Done jobs that need a grown-up to check them say **Waiting for a grown-up** until they're approved.

Scroll down for **Up for grabs** and **Ask for stars**:

<img src="/HA-Family-Hub/img/screenshots/companion-jobs-grabs.webp" alt="Up for grabs: Water the plants +2 stars and Sweep the porch +3 stars, each with Mine!, and Ask for stars" width="49%" /> <img src="/HA-Family-Hub/img/screenshots/companion-jobs-ask.webp" alt="Ask for stars: Helped Grandma carry groceries, 2 stars, Send" width="49%" />

- **Up for grabs** is the Chore Bin. **Mine!** makes the job theirs.
- **⭐ Ask for stars** is for something that isn't on the chart: they type what they did ("Helped Grandma carry
  groceries"), pick how many stars with − and +, and **Send**. A grown-up approves it like any
  [star request](/docs/features/chores-rewards-goals-routines). Turn **Ask for stars** off in their settings if you'd
  rather they didn't.

### Rewards

Every reward as a big tile, with their stars at the top.

![Rewards: 12 stars, Screen time with 90 min saved and Use 30 min, Ice cream Get it!, Pick dinner 3 more stars](/img/screenshots/companion-rewards.webp)

- **Get it!** shows when they have enough stars. One tap turns it into **Yes, get it!**, and a second tap gets it, so
  a bump doesn't spend their stars:

  <img src="/HA-Family-Hub/img/screenshots/companion-rewards-sure.webp" alt="Ice cream showing Yes, get it! after the first tap" width="560" />

- Without enough stars, the tile shows how many more they need, with a bar.
- **Tap a heart** to pick what they're saving for. The day screen, and the Chores and Rewards cards, show the same goal.
- Rewards that stack up, like screen time or allowance, show how much is saved ("90 min saved") with **Use 30 min**.
- Rewards with a timer start it, and ones a grown-up hands over show as waiting.
- **You got** at the bottom shows the last few rewards they've had.

### Wish list

Their own [wish list](/docs/features/todo-lists-and-wishlists#wish-lists), as picture tiles with 1 to 3 hearts,
most-wanted first. Tapping the hearts changes how much they want it.

![Wish list: New bike with 3 hearts, Ice skates with 2, Art set with 1, Slime kit](/img/screenshots/companion-wishes.webp)

**+ Add a wish** lets them type a new one. Linked GoWish and Amazon lists fold up under their names (Christmas,
Birthday); tap one to open it.

<img src="/HA-Family-Hub/img/screenshots/companion-wishes-add.webp" alt="Adding a wish: Glow-in-the-dark stars and Add" width="49%" /> <img src="/HA-Family-Hub/img/screenshots/companion-wishes-sections.webp" alt="The Christmas section open: LEGO Friends treehouse and Unicorn plush; Birthday folded" width="49%" />

The Wish list screen needs **Their wish list** set on their profile. Prices and who's buying what never show here.

### Timers

Timers they can start themselves. One runs at a time.

![Timers: Reading 20 min +2 stars, Piano 15 min +1, Tidy up 10 min +1, Screen time 30 min, and Pick a time](/img/screenshots/companion-timers.webp)

- Each timer you set up has an emoji, a name, a length and, if you like, **stars for finishing it**. Stars are paid
  only when it runs all the way out, never when it's stopped early, and show in their star history as "Timer".
- **Pick a time** is a timer of their own: they choose the length with − and +, or tap 5, 10, 15, 20, 30, 45 or 60,
  then **▶ Start**. It can be 1 minute to 2 hours and never earns stars. Turn it off in their settings if you'd rather
  they only had yours.
- A running timer shows as the shrinking circle with **■ Stop**, and on the day screen too. When it's done it rings
  like any [Family Hub timer](/docs/features/timers).

<img src="/HA-Family-Hub/img/screenshots/companion-timers-own.webp" alt="Pick a time: How long? 25 min with minus and plus, quick picks 5 to 60, Start" width="49%" /> <img src="/HA-Family-Hub/img/screenshots/companion-timers-running.webp" alt="A Reading timer running, 12 min left, with Stop" width="49%" />

### Room

Big buttons for their own things, and readings from their room.

![Room: 70°F room temperature and 44% humidity, then Lamp on, Fairy lights off, Fan off, Music on, Blinds and Dance party](/img/screenshots/companion-room.webp)

- **Room info** along the top: up to 4 readings, like their room's temperature or humidity, a door or window, or the
  weather. They can see these but not change them. They also show under the clock on the day screen.
- **Room buttons**: up to 6 of their lights, switches, fans, a speaker, blinds, or a scene or script ("Dance party").
  They show the real state, and a tap toggles it (a speaker plays or pauses; a scene or script runs). Locks and alarms
  can never be added.

## Screensaver

(2026.11.2+) Turn on **Screensaver** in their settings and, during the day, after the screen sits untouched for the time you pick,
it shows a screensaver with a small clock in the corner. One tap brings their screen back. It never shows at night,
during a routine, or on an e-ink screen.

<img src="/HA-Family-Hub/img/screenshots/companion-screensaver.webp" alt="The Companion screensaver showing a backyard camera, with a small clock in the corner" width="560" />

**Show** picks what's on it:

- **The Family Hub screensaver** (the default): whatever video or camera the household [Screen Saver](/docs/features/screen-saver)
  uses. Change that one and every child's Companion follows.
- **A video**: this child's own video, by link (`/local/fish.mp4`).
- **A camera**: this child's own camera, refreshed every 10 seconds.

<img src="/HA-Family-Hub/img/screenshots/companion-settings-screensaver.webp" alt="Screensaver settings: the tick box, Show The Family Hub screensaver, Start after 5 min" width="560" />

For family photos, use a slideshow camera like [Album Slideshow](/docs/features/screen-saver#suggested-a-photo-slideshow).

## Messages

Send a message to their screen from the bottom of their Companion settings, or from an automation. It takes over
their screen, is read out loud, and stays until they tap **Got it**. Settings shows when they saw it.

<img src="/HA-Family-Hub/img/screenshots/companion-message.webp" alt="A message on Companion: Dinner in 5 minutes! From Mom, Got it" width="49%" /> <img src="/HA-Family-Hub/img/screenshots/companion-settings-message.webp" alt="Send a message to their screen, with Bedtime now and Back to the schedule, and when the last one was seen" width="49%" />

```yaml
action: family_hub.companion_message
data:
  person: Emma        # their name, person entity or Home Assistant user ID
  message: Dinner in 5 minutes!
  from: Mom
```

## I need a hug

At night, **I need a hug** starts slow breathing on the screen for three minutes: a circle that grows and shrinks with
"Breathe in... and out". The people you tick under **"I need a hug" button tells** get a notification on their phone
(through their own notify devices in Family Hub).

<img src="/HA-Family-Hub/img/screenshots/companion-hug.webp" alt="I need a hug: a blue breathing circle, Breathe in, A grown-up knows. Tap to close." width="49%" /> <img src="/HA-Family-Hub/img/screenshots/companion-settings-hug.webp" alt="I need a hug button tells: Mom ticked, Dad not" width="49%" />

## Grown-ups' menu

Press and hold the clock for a couple of seconds for **Bedtime now**, **Sleep now**, **Day** or **Back to the
schedule**, each for the next hour. It needs a grown-up to be signed in on that screen (on a child's own screen, use
the buttons in their settings, or `family_hub.companion_mode`).

<img src="/HA-Family-Hub/img/screenshots/companion-grownups.webp" alt="The grown-ups' menu: For the next hour: Bedtime now, Sleep now, Day, Back to the schedule, Close" width="560" />

## Sounds

Sounds are made on the screen itself, so there's nothing to download:

- **Wake-up alarm:** Chimes, Birds or Marimba, or No alarm. It plays until they tap **I'm up!** (or two minutes pass).
- **Sleep sound:** White noise, Soft noise, Deep rumble, Rain or Waves, all night, at the volume you set.
- **Messages** are read out loud.

To hear them (2026.11.2+), pick one in the **Wake-up alarm** or **Sleep sound** dropdown: it plays straight away on the device you're
on, the same as Companion makes it. **▶ Listen** next to the dropdown plays the one that's picked, and **■ Stop** stops it.

<img src="/HA-Family-Hub/img/screenshots/companion-settings-sounds.webp" alt="Sounds: Wake-up alarm Birds with Stop while it plays, Sleep sound Waves with Listen, and the volume" width="560" />

:::note Browsers and sound
Browsers only let a page make sound after someone has touched the screen. If **🔈 Tap for sound** shows in the corner,
tap it once. Kiosk browsers like Fully Kiosk have a setting that lets pages play sound on their own.
:::

<img src="/HA-Family-Hub/img/screenshots/companion-sound.webp" alt="The wake-up screen with Tap for sound in the bottom corner" width="560" />

## Their room light and waking up

Pick their room light and Companion uses it too:

<img src="/HA-Family-Hub/img/screenshots/companion-settings-light.webp" alt="Their room light: Emma's lamp, with Amber nightlight all night ticked" width="49%" /> <img src="/HA-Family-Hub/img/screenshots/companion-settings-waking.webp" alt="Waking up: more lights, sunrise in 20 minutes, Green at wake-up, and a scene to run" width="49%" />

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

## Every setting

Everything is in **⚙️ Settings → Users → their profile → Companion screen**, and saved with **Save**.

### What's on their screen

| Setting | What it does |
|---|---|
| **My day, Jobs, Rewards, Wish list, Timers, Room buttons** | Which screens they have in the bar. Turning **Jobs** or **Rewards** off also takes the next job or the stars off the day screen. |
| **Jobs has an Ask for stars button** | On by default. |

### Timers they can start

<img src="/HA-Family-Hub/img/screenshots/companion-settings-timers.webp" alt="Timers they can start: Reading 20 min 2 stars, Piano 15 min 1 star, Tidy up 10 min 1 star, Add a timer, and the tick box for a timer of their own" width="560" />

Up to 12 timers. Each row is an emoji, a name, the minutes (1 to 180) and the stars for finishing it (0 to 20). **+ Add
a timer** adds a row and **✕** removes one. Reading, Practice and Tidy up are there to start with, with no stars until
you add some. **They can also start a timer of their own** gives them **Pick a time** (on by default).

### Room buttons and room info

<img src="/HA-Family-Hub/img/screenshots/companion-settings-search.webp" alt="Typing emma in a room button: a list of Emma's blinds, ceiling light, fan, lamp and speaker to pick from" width="560" />

Type a few letters of a name (or the entity ID) and pick from the list: it only offers things that can go there (2026.11.2+).

| Setting | What it takes |
|---|---|
| **Room buttons** (up to 6) | Lights, switches, fans, input booleans, media players, covers, scenes and scripts. Never locks or alarms. |
| **Room info they can see** (up to 4) | Sensors, binary sensors (a door or window), climate entities (their current temperature) and weather. |

<img src="/HA-Family-Hub/img/screenshots/companion-settings-room.webp" alt="Room buttons: Emma's lamp, Fairy lights, Emma's fan, Add a button" width="49%" /> <img src="/HA-Family-Hub/img/screenshots/companion-settings-info.webp" alt="Room info they can see: Emma's room temperature and humidity, Add a sensor" width="49%" />

The name under each box shows what you picked, or **Not found in Home Assistant** if it's mistyped or gone.

### Everything else

| Setting | Choices | Default |
|---|---|---|
| **Screensaver** | On or off, **Show** (Family Hub screensaver, a video, a camera), **Start after** 1 to 30 min | Off, Family Hub screensaver, 5 min |
| **Wake up** (Mon-Fri, Sat-Sun) | Any time | 7:00 AM, 8:00 AM |
| **Bedtime** (Sun-Thu nights, Fri-Sat nights) | Any time | 7:30 PM, 8:30 PM |
| **After school starts** | Any time | 3:30 PM |
| **Bedtime routine starts** | 15 to 90 min before bed | 30 min |
| **Wake-up alarm** | No alarm, Chimes, Birds, Marimba | Chimes |
| **Sleep sound**, **volume** | None, White noise, Soft noise, Deep rumble, Rain, Waves; 5 to 100 | None, 40 |
| **At night the screen** | Shows a dim clock, Goes dark (tap to see the time) | Dim clock |
| **Their room light** | One light | None |
| **Amber nightlight all night** | On or off | On |
| **More lights to wake them** | Up to 6 lights | None |
| **Sunrise**, **Sunrise takes** | On or off; 10 to 60 min | On, 20 min |
| **When it's time to get up** | Green then off, Bright light stays on, Stay as the sunrise ended | Green |
| **Also at wake-up, run** | A scene, script or automation | None |
| **"I need a hug" button tells** | Anyone else in Family Hub | Nobody |

## Card options

The card itself only says whose screen it is and how it looks. Everything about their day is in Settings.

| Option | What it does |
|---|---|
| **Child** (`person`) | Whose Companion this is: pick them, or **Whoever is signed in** (`me`). |
| **Physical button** (`button_entity`) | A button by the bed. See [A physical button](#a-physical-button). |
| **Height** (`height`) | `100vh` fills the screen (use a Panel view), or a size like `480px`. |
| **Show seconds** (`clock_seconds`) | Seconds on the big clock. |
| **Theme** (`theme_override`) | Colours for the day screens. See [Colours](#colours-e-ink-and-accessibility). |

```yaml
type: custom:family-hub-companion-card
person: 0a1b2c3d4e5f...      # their Home Assistant user ID, or "me"
button_entity: event.emma_bed_button
height: 100vh
clock_seconds: false
theme_override: ""           # a theme ID, "companion" for its own warm colours, or "" to follow Family Hub
```

### A physical button

Set **Physical button** to any button by the bed: a Zigbee button's event, an `input_button`, a `button`, a binary
sensor or a switch. Pressing it does what the big button on the screen does: **Done!**, **Got it**, **I'm up!**, and at
night it starts the hug breathing. Great for little ones, and for screens that can't be tapped.

## Phones and tablets

(2026.11.2+) The same card works on a phone or a portrait tablet: it sizes itself to the width, tiles sit two to a row, and the bar
fits every screen. Put it on a dashboard on their phone (a **Panel** view) and they have the same jobs, rewards, wish
list and timers there.

![Companion on a phone: the day screen, the morning routine, Jobs and Rewards](/img/screenshots/companion-phone.webp)

![Companion on a phone: My day, the wish list, Timers and Room](/img/screenshots/companion-phone-2.webp)

On a smart clock (800×480) or a landscape tablet it's the side-by-side layout shown elsewhere on this page. It runs on
older Android browsers too, like the ones on hacked smart clocks.

## Colours, e-ink and accessibility

(2026.11.2+) The day screen and the screens in the bar use your Family Hub theme, like every other card: this device's theme if it
has one, otherwise the household's, and a holiday theme while one is on. Light, dark and Liquid Glass themes all work,
and so do Home Assistant themes. Night, waking up, routines and bedtime keep their own colours, because there the
colour tells them something: dark red means stay in bed, green means it's OK to get up.

To give one child's screen its own look, pick a **Theme** in the card's settings. **Companion's own warm colours**
keeps the original cream look whatever the house uses.

<img src="/HA-Family-Hub/img/screenshots/companion-themes.webp" alt="Companion's day screen and Jobs in Midnight, Liquid Glass, high contrast and its own warm colours" />

[Accessibility](/docs/features/accessibility) and [E-ink screens](/docs/features/eink-screens) work here too, from
Family Hub Settings for this device or the household:

- **E-ink screen** and **High contrast**: black on white with outlines on every screen, night included. The screensaver
  doesn't come on.
- **Text size**: the words get bigger, while the big clock and pictures stay the size they were. Companion is already
  large print, so it grows by up to 25% on a landscape screen and 40% on a phone or portrait tablet, enough to keep the
  whole day screen in view.
- **Font**, **Reduce motion** and **Bigger buttons** work as on the other cards. Reduce motion leaves the slow
  breathing circle on the "I need a hug" screen, because the breathing is the point.

![Companion on a black and white e-ink screen: the clock, Jobs, Rewards, My day, wake-up and night](/img/screenshots/companion-eink.webp)

## Example setups

### A bedside smart clock for a 5-year-old

- **Screens:** Jobs and Rewards only. Turn **Ask for stars** off.
- **Routines:** a short morning routine (Potty, Get dressed, Breakfast, Shoes) and night routine (Bath, Pajamas, Teeth, Story).
- **Night:** dim clock, **Amber nightlight all night**, **Rain** sleep sound.
- **Waking up:** **Sunrise** over 20 minutes, **Birds** alarm, **Green** at wake-up. The green screen and green light are
  their "ok to get up", no clock reading needed.
- **Physical button:** a big Zigbee button for **Done!**.

### A tablet on a desk for a 9-year-old

- **Screens:** all of them.
- **Timers:** Reading 20 min (2 stars), Piano 15 min (1 star), Homework 30 min (2 stars), with **Pick a time** on.
- **Room:** their lamp, fairy lights and speaker, plus their room's temperature.
- **Screensaver:** on after 5 minutes, showing the family photo slideshow.

### Their phone

- Add a dashboard with a Panel view and the Companion card (**Child: Whoever is signed in**), signed in as them.
- Everything works the same: they can tick jobs off on the bus, add to their wish list and start a timer for homework.

### A shared kids' tablet

- One Companion card with **Child: Whoever is signed in**, and Family Hub's PIN login on the tablet. Whoever logs in
  with their PIN sees their own screen.

## Automations

Companion fires `family_hub_companion_event` with the child's `user_id` and a `type`:

| type | When | Also has |
|---|---|---|
| `mode` | The part of the day changed | `mode`, `previous` (`sleep`, `wake`, `morning`, `day`, `afternoon`, `bedtime`) |
| `step_done`, `routine_done` | A routine step, or the whole routine, was done on Companion | |
| `comfort` | **I need a hug** was pressed | |
| `message_sent`, `message_ack` | A message was sent, and when they tapped **Got it** | `message_id` |
| `alarm_stopped` | They tapped **I'm up!** | |
| `sound_on`, `sound_off` | The sleep sound started or stopped | |

**Tell everyone at dinner time:**

```yaml
triggers:
  - trigger: time
    at: "17:55:00"
actions:
  - action: family_hub.companion_message
    data:
      person: Emma
      message: Dinner in 5 minutes! Time to wash your hands.
      from: Dad
```

**Open the blinds when they're up:**

```yaml
triggers:
  - trigger: event
    event_type: family_hub_companion_event
    event_data:
      type: alarm_stopped
actions:
  - action: cover.open_cover
    target:
      entity_id: cover.emma_blinds
```

**Flash the hallway light when they press I need a hug:**

```yaml
triggers:
  - trigger: event
    event_type: family_hub_companion_event
    event_data:
      type: comfort
actions:
  - action: light.turn_on
    target:
      entity_id: light.hallway
    data:
      brightness_pct: 30
      color_name: amber
```

**Start bedtime early from a button:**

```yaml
triggers:
  - trigger: state
    entity_id: input_button.early_bedtime
actions:
  - action: family_hub.companion_mode
    data:
      person: Emma
      mode: bedtime   # or sleep, wake, morning, day, afternoon, or auto to go back
      minutes: 60
```

To react to one child only, add their user ID to `event_data` (`user_id: 0a1b2c3d4e5f...`).

## Troubleshooting

**"Pick a child in this card's settings."** The card doesn't know whose screen it is. Pick the child in the card's
settings, or sign the screen in as them and use **Whoever is signed in**.

**No sound.** Tap **🔈 Tap for sound** once (browsers need a tap first). On Fully Kiosk, turn on its setting that lets
pages play sound. Check the alarm isn't set to **No alarm**, and use **▶ Listen** in Settings to hear it on your phone.

**A screen is missing from the bar.** It's turned off in **What's on their screen**, or it has nothing in it yet: Wish
list needs **Their wish list** on their profile, and Room needs a button or a reading.

**My day is empty.** Companion shows the calendars in the **Calendar** section of their profile in Settings. Add their calendar there.

**The routine doesn't show.** Check the routine is theirs, has steps for today's day of the week, and isn't done
already. Each routine shows only in its part of the day (morning, after school, bedtime).

**A room button says "Not found in Home Assistant".** The entity was renamed or removed. Search for it again.

**The screensaver never comes on.** It only shows during the day (not at night or during a routine), not on an e-ink
screen, and only if the household screensaver (or their own video or camera) has something to show.

**The times are wrong.** Companion uses Home Assistant's time zone. Weekend times are used on Saturday and Sunday
mornings, and Friday and Saturday nights.
