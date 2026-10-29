---
title: Quick Add & Ask (beta)
sidebar_position: 2
description: Add an event, reminder, meal, chore, reward or list item by typing or saying one line, and ask Assist what's for dinner.
---

:::info Beta
Quick Add and Assist support are in beta, and English only for now. If something you typed or said isn't understood, or lands in the wrong place, please share the exact words on [Discord](https://discord.com/channels/330944238910963714/1543630448800960653) or GitHub so it can be taught.
:::

Type (or say) one line the way you'd say it, and Family Hub works out what it is and where it goes (v1.168.89+):

| You type or say | You get |
|---|---|
| Soccer Tuesday 5pm for Emma | An event on Emma's calendar, Tuesday 5 to 6 PM |
| Dentist next Thursday at 3:30 with Leo | An event on Leo's calendar |
| Family dinner Saturday 6-8pm on the family calendar | An event on the Family calendar, 6 to 8 PM |
| Piano lesson every Wednesday at 4:30 for Mary Ann | A weekly repeating event |
| tacos for dinner Friday | Friday's dinner on the meal plan |
| dinner tomorrow is spaghetti | Tomorrow's dinner |
| remind me to call the dentist at 3 | A reminder at 3 PM on your own reminders list |
| remind Emma to pack her gym bag tomorrow morning | A reminder on Emma's list, tomorrow at 9 AM |
| reminder take out the trash every Tuesday at 7pm | A repeating reminder |
| chore: Leo empty the dishwasher tomorrow 3 stars | A chore for Leo, due tomorrow, worth 3 stars |
| chore sweep the porch every Saturday | A weekly chore in the Chore Bin |
| reward movie night 30 stars | A reward in the catalog |
| add milk to groceries | Milk on your Groceries list |

No #tags needed, though they still work.

## In the calendar

Open the calendar's **⋮ More** menu and pick **⚡ Quick Add**.

- As you type, a preview shows what it understood: **Event · Soccer Tuesday at 5 PM**, or a problem to fix ("How many stars?").
- Wrong guess? Tap **Not right? It's a:** Event, Reminder, Meal, Chore, Reward or List item, and it re-reads the line as that.
- **Add** (or Enter) saves it, shows what was added, and clears the box for the next one.
- Admins can move or hide it like any other More menu item (Settings → More menu). It starts at the top of the menu.

## With Assist (chat and voice)

Quick Add also works in Home Assistant's **Assist**: the chat in the app, and any voice assistant using Home Assistant's own agent. Start with one of these:

| Say | Example |
|---|---|
| Quick add … | "Quick add soccer Tuesday 5pm for Emma" |
| Family Hub … | "Family Hub tacos for dinner Friday" |
| Add … to the calendar | "Add dentist Thursday at 3 to the calendar", "Add trick or treating to my calendar Saturday at 6" |
| Add … to the (name) calendar | "Add soccer to the family calendar Tuesday 5pm" |
| Add … to my schedule | "Add swim lesson to my schedule Friday at 4" |
| Put … on the calendar | "Put movie night Saturday on the calendar" |
| Remind me to … | "Remind me to call Grandma at 6" |
| Remind (name) to … | "Remind Emma to feed the cat tomorrow" |
| Add a reminder … | "Add a reminder bins out Tuesday at 7pm" |
| Add … to my (or Emma's) reminders | "Add call the dentist to my reminders tomorrow" |
| Add a chore … | "Add a chore Leo empty the dishwasher 3 stars" |
| Add … to my (or Leo's) chores | "Add take out the trash to my chores", "Add feed the cat to Emma's chores tomorrow" |
| Add … to the Chore Bin | "Add sweep the porch to the chore bin" |
| Give (name) a chore … | "Give Leo a chore feed the dog" |
| Add a reward … | "Add a reward ice cream trip 20 stars", "Add ice cream trip to the rewards" |
| Plan … / We're having … | "Plan tacos for dinner Friday", "We're having chili for supper" |
| Add … for dinner … | "Add pizza for dinner tomorrow" |

Say it the way you normally would: "can you", "could you", "please", "hey" or "ok" in front (and "please" at the end) all work, so "Can you remind me to get candy tomorrow?" is fine. "I need to remember to …", "Don't let me forget to …", "Schedule …" and "Make … for dinner" work too.

Assist says back what it added: "Added Soccer Tuesday at 5 PM." Adding to a list ("add milk to the shopping list") is already built into Home Assistant, so Quick Add leaves that sentence alone.

:::tip Using an AI assistant (ChatGPT, Ollama, …)?
Quick Add's sentences belong to Home Assistant's built-in agent. If your voice pipeline uses an AI agent instead, turn on **Prefer handling commands locally** in that pipeline (Settings → Voice assistants) so Home Assistant checks its own sentences first.
:::

## Asking questions

Assist can also answer questions about the family, in the chat or by voice:

| Ask | Answer |
|---|---|
| What's for dinner? / What are we having for lunch tomorrow? / What's for dinner Friday? | "Tonight's dinner is Tacos. Dad is cooking." Weekly repeating meals and leftovers count. |
| What's on the calendar today? / What's happening this weekend? | Everyone's events for that day, by calendar, plus the holiday if there is one |
| What's Emma doing tomorrow? / What does Leo have Saturday? / What do I have today? | One person's events, including ones tagged with #Name |
| Any reminders today? / What reminders do I have tomorrow? / What reminders does Emma have? | Reminders due that day: the family list and your own, or that person's |
| What are my chores? / What chores do I have? / What are Leo's chores? / What does Leo have left? / Does Emma have any chores? / What chores are left? | Open chores for that person, or a count for everyone and the Chore Bin |
| How many stars does Emma have? / How many stars do I have? | Their star balance |

Calendar and reminder questions get "Privacy Mode is on" instead of an answer while Privacy Mode (or Discreet Mode, for the calendar) is on. Names work with or without the apostrophe ("what are Leos chores" is fine, which helps by voice). Questions about "me" and "my" need someone signed in, so from a voice speaker say a name instead ("What chores does Leo have?").

The **`family_hub.ask`** action asks the same questions from an automation and returns the `answer`, for example to announce dinner on the kitchen speaker at 5:30:

```yaml
actions:
  - action: family_hub.ask
    data:
      question: What's for dinner?
    response_variable: dinner
  - action: tts.speak
    target:
      entity_id: tts.home_assistant_cloud
    data:
      media_player_entity_id: media_player.kitchen
      message: "{{ dinner.answer }}"
```

## Who can add what

Quick Add follows the same permissions as the cards:

| Item | Needs |
|---|---|
| Events, reminders, list items | Nothing |
| Meals | **Edit the menu**. Without it, the meal is added as a **suggestion** for someone who can to approve. |
| Chores | **Assign to others** (or an admin) |
| Rewards | **Add to catalog** or **Override star costs**. Without it, it's a **suggestion** with no price yet. |

**Voice satellites** (a speaker in the kitchen) usually aren't signed in as anyone, so by voice from one of those: events, reminders and list items are added, meals become suggestions, and chores and rewards are refused. In the Assist chat on your phone you're signed in, so your own permissions apply.

## How it reads things

- **Who**: anyone's name from Settings → Users, their first name, or a calendar's name ("Family"). "For Emma", "with Leo", "Emma's recital" and "Emma and Leo" all work, and a name one letter off ("Ema") is still found, which helps with voice. "Me" means whoever is signed in.
- **When**: today, tonight, tomorrow, a weekday ("Tuesday" is the next one, today included; "next Tuesday" never means today, and said early in a week it means the week after), this weekend, next week, in 3 days, Oct 30, 30 Oct, 10/30, the 15th, and holidays: Halloween, Thanksgiving, Christmas (Eve), New Year's (Eve), Valentine's Day, St. Patrick's Day, the 4th of July, Mother's Day, Father's Day, Memorial Day and Labor Day (the next one). "On Halloween" sets the day; in "Halloween party at 6" the name stays in the title too. Times like 5pm, 5:30, at 7, noon, 6-8pm, morning (9 AM), afternoon (3 PM), evening (6 PM), tonight (7 PM), and lengths like "for 45 minutes".
- **Bare times**: "at 5" means 5 PM; 8 to 11 mean AM; add am or pm to be exact. The preview shows what it picked.
- **Repeats**: every day, every weekday, every Tuesday (or Tuesday and Thursday), every other week, every month, every year.
- **Where an event goes**: the named calendar ("on the family calendar"), else the first person's own calendar, else yours, else a shared calendar. If someone's calendar can't take new events (like a read-only Google calendar), it goes on a shared calendar and is tagged with their name so it still shows in their column. With more than one person, it goes on the first person's calendar and is tagged for the others.
- **Reminders** go on the named person's own reminders list (or yours for "remind me"), otherwise the shared Family Reminders list. With no day it's for today; with no time it shows at 9 AM, like any reminder without a time.
- **Meals** use your meal slots from Settings → Menu Blocks (Breakfast, Lunch, Dinner, or your own); "supper" means dinner. With no day, it's today. A meal already in that slot is replaced.
- **Chores** go to the named person, or the Chore Bin; with a day but no time they're due at 6 PM.
- **Lists**: "add X to Y", "put X on the Y list", "X to the Y list", matching your Home Assistant to-do lists by name ("grocery" finds "Groceries").

Quick Add understands **English** for now, whatever language Family Hub is shown in.

## For automations

The **`family_hub.quick_add`** action takes the same line as `text` and returns what it added as `message`. See [Automations & Entities](/docs/features/automations-and-entities#actions).
