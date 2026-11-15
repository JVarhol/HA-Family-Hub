// jsdom tests for the "Merge shared events into one" feature (mergeSharedEvents).
//
//   node test_merge_shared_events.js
//
// Same style/conventions as test_week_grid_summary.js: loads the real card into jsdom,
// drives the real _fetchEvents()/ _eventPeopleEntities() / _renderGrid() paths, and asserts
// on the rendered DOM. jsdom is not vendored; install it anywhere and point JSDOM_PATH at
// it if a plain require("jsdom") does not resolve.
//
// The feature: with preventDuplicateEvents ON, a shared event (same name + same time on
// several people's calendars) is collapsed to one entry. mergeSharedEvents (ON) additionally
// makes that one entry render as a multi-person COLLAGE (every sharer's color) instead of a
// single-person pill in the first person's column. It is off by default and a no-op unless
// preventDuplicateEvents is also on.

const fs = require("fs");
const path = require("path");
let JSDOM;
try {
  ({ JSDOM } = require("jsdom"));
} catch (e) {
  ({ JSDOM } = require(process.env.JSDOM_PATH || "jsdom"));
}

const CARD = process.env.CARD || path.join(__dirname, "custom_components", "family_hub", "card", "family-week-calendar-card.js");
const src = fs.readFileSync(CARD, "utf8");

function check(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

// Three people; the shared events below are spread across their calendars.
const PEOPLE = [
  { entity: "calendar.person_a", name: "Alex" },
  { entity: "calendar.person_b", name: "Sam" },
  { entity: "calendar.person_c", name: "Riley" },
];

function makeHass(calls) {
  return {
    states: {},
    language: "en",
    locale: { language: "en" },
    user: { id: "u1", is_admin: true, name: "Test" },
    callApi: async (method, url) => {
      if (calls) calls.push(url);
      return [];
    },
    callWS: async () => ({}),
    callService: async () => ({}),
    connection: { sendMessagePromise: async () => ({}), subscribeEvents: async () => () => {} },
  };
}

// Force the card's household settings. _getSettings() returns _settingsCache when it is set,
// so seeding it is the reliable way to turn the toggles on in a test (the real store path,
// family_hub/get_settings, is out of scope for a card-level unit test).
function withSettings(el, overrides) {
  // Seed _settingsCache directly. _getSettings() returns _settingsCache when it is set, but a
  // first _getSettings() call would hand back a throwaway _defaultSettings(), so we must start
  // from the current effective settings and store the merged object back onto the instance.
  const base = el._settingsCache || el._getSettings();
  el._settingsCache = Object.assign({}, base, overrides);
}

// Fresh jsdom + card per scenario so localStorage / state never leaks.
async function makeCard({ config = {}, calls } = {}) {
  const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only", pretendToBeVisual: true, url: "http://localhost/" });
  const w = dom.window;
  w.eval(src);
  const el = w.document.createElement("family-week-calendar-card");
  w.document.body.appendChild(el);
  el.setConfig({ people: PEOPLE, ...config });
  el.hass = makeHass(calls);
  await new Promise((r) => setTimeout(r, 200));
  el._viewMode = "week";
  el._weekOffset = 0;
  return { dom, w, el };
}

// A timed event at a fixed instant. Shared events reuse the SAME start across calendars.
function sharedEv(summary, ts, uid) {
  const s = new Date(ts);
  const e = new Date(ts + 3600e3);
  return { summary, start: { dateTime: s.toISOString() }, end: { dateTime: e.toISOString() }, uid: uid || summary };
}

const T = Date.parse("2026-11-19T18:30:00-06:00");

// Week-relative timed event: `dayOffset` days after the first day shown, at `hour`. Mirrors the
// ev() helper in test_week_grid_summary.js so events land inside the card's rendered week window
// (the card draws the week around "now", not a fixed calendar date).
function ev0(el, summary, dayOffset, hour, opts = {}) {
  const day = new Date(el._weekStart());
  day.setDate(day.getDate() + dayOffset);
  const s = new Date(day);
  s.setHours(hour, 0, 0, 0);
  const e = new Date(s);
  e.setHours(hour + 1);
  return { summary, start: { dateTime: s.toISOString() }, end: { dateTime: e.toISOString() }, uid: (opts.uid || summary) + dayOffset };
}

// Give each calendar its events, then run the REAL _fetchEvents so _sharedEventIndex is built
// and the dedup filter runs exactly as in the browser.
async function fetchWith(el, eventsByEntity) {
  el._hass.callApi = async (method, url) => {
    const m = /calendars\/([^?]+)/.exec(url || "");
    const entity = m && m[1];
    return eventsByEntity[entity] ? eventsByEntity[entity].map((e) => Object.assign({}, e)) : [];
  };
  await el._fetchEvents();
}

// The event pills in the week grid: returns [{entities, style, summary}] where entities is the
// list of people the pill's background/collage is drawn for (the thing mergeSharedEvents changes).
function pills(el) {
  const known = new Set(PEOPLE.map((p) => p.entity));
  return [...el._root.querySelectorAll(".event")].map((n) => {
    const summaryEl = n.querySelector(".summary");
    const summary = summaryEl ? summaryEl.textContent : "";
    return { summary, style: n.getAttribute("style") || "" };
  });
}
// Count how many of the configured people a given rendered pill is drawn for, by checking how
// many distinct person colors appear in its background. A single-person pill is a flat color;
// a multi-person collage is a repeating-linear-gradient with one stop per person.
function collageStopCount(style) {
  if (!/repeating-linear-gradient/.test(style)) return 1;
  // The gradient lists one band per person, then loops back to the first color to close, so the
  // number of DISTINCT hex colors is the number of people (color[0] appears twice but counts once).
  const colors = new Set((style.match(/#[0-9a-fA-F]{6}/g) || []).map((c) => c.toLowerCase()));
  // The trailing "color:#..." text color is not part of the collage; it's a separate property.
  let m;
  const onlyBg = style.split(";color:")[0];
  return new Set((onlyBg.match(/#[0-9a-fA-F]{6}/g) || []).map((c) => c.toLowerCase())).size;
}

const scenarios = {
  async "off by default: shared event is shown per-calendar, never a collage"() {
    const { el } = await makeCard();
    // Do NOT seed the settings cache: defaults apply (both toggles off).
    await fetchWith(el, {
      "calendar.person_a": [ev0(el, "Mozarts", 1, 18)],
      "calendar.person_b": [ev0(el, "Mozarts", 1, 18)],
      "calendar.person_c": [],
    });
    el._renderGrid();
    const moz = pills(el).filter((p) => /mozarts/i.test(p.summary));
    check(moz.length >= 1, "Mozarts is rendered, got " + moz.length);
    moz.forEach((p) => check(!/repeating-linear-gradient/.test(p.style), "no collage when the feature is off: " + p.style));
  },

  async "dedup on, merge off: one event, but only the first person"() {
    const { el } = await makeCard();
    withSettings(el, { preventDuplicateEvents: true, mergeSharedEvents: false });
    await fetchWith(el, {
      "calendar.person_a": [ev0(el, "Mozarts", 1, 18)],
      "calendar.person_b": [ev0(el, "Mozarts", 1, 18)],
      "calendar.person_c": [ev0(el, "Mozarts", 1, 18)],
    });
    el._renderGrid();
    const moz = pills(el).filter((p) => /mozarts/i.test(p.summary));
    check(moz.length === 1, "dedup collapses the 3 copies into one pill, got " + moz.length);
    check(!/repeating-linear-gradient/.test(moz[0].style), "single-person pill (no collage) when merge is off: " + moz[0].style);
  },

  async "dedup on + merge on: shared event renders as a multi-person collage"() {
    const { el } = await makeCard();
    withSettings(el, { preventDuplicateEvents: true, mergeSharedEvents: true });
    await fetchWith(el, {
      "calendar.person_a": [ev0(el, "Mozarts", 1, 18)],
      "calendar.person_b": [ev0(el, "Mozarts", 1, 18)],
      "calendar.person_c": [ev0(el, "Mozarts", 1, 18)],
    });
    el._renderGrid();
    const moz = pills(el).filter((p) => /mozarts/i.test(p.summary));
    check(moz.length === 1, "one pill for the shared event, got " + moz.length);
    const stops = collageStopCount(moz[0].style);
    check(stops === 3, "collage has all 3 sharers, got " + stops + " stops: " + moz[0].style);
  },

  async "merge is scoped to exactly the same name + same time"() {
    const { el } = await makeCard();
    withSettings(el, { preventDuplicateEvents: true, mergeSharedEvents: true });
    // Same name, DIFFERENT time -> must NOT merge.
    await fetchWith(el, {
      "calendar.person_a": [ev0(el, "Practice", 2, 10)],
      "calendar.person_b": [ev0(el, "Practice", 2, 11)],
    });
    el._renderGrid();
    const prac = pills(el).filter((p) => /practice/i.test(p.summary));
    check(prac.length === 2, "two separately-timed events stay separate, got " + prac.length);
    prac.forEach((p) => check(collageStopCount(p.style) === 1, "each is single-person, got: " + p.style));

    // Same time, DIFFERENT name -> must NOT merge either.
    const { el: el2 } = await makeCard();
    withSettings(el2, { preventDuplicateEvents: true, mergeSharedEvents: true });
    await fetchWith(el2, {
      "calendar.person_a": [ev0(el2, "Sam Practice", 2, 10)],
      "calendar.person_b": [ev0(el2, "Taylor Practice", 2, 10)],
    });
    el2._renderGrid();
    const p2 = pills(el2).filter((p) => /practice/i.test(p.summary));
    check(p2.length === 2, "two different names at the same time stay separate, got " + p2.length);
  },

  async "a solo event is never turned into a collage"() {
    const { el } = await makeCard();
    withSettings(el, { preventDuplicateEvents: true, mergeSharedEvents: true });
    await fetchWith(el, {
      "calendar.person_a": [ev0(el, "Gym", 3, 8)],
      "calendar.person_b": [ev0(el, "Dentist", 3, 9)],
      "calendar.person_c": [],
    });
    el._renderGrid();
    const solo = pills(el).filter((p) => /gym|dentist/i.test(p.summary));
    check(solo.length === 2, "both solo events render, got " + solo.length);
    solo.forEach((p) => check(collageStopCount(p.style) === 1, "solo events stay single-person: " + p.style));
  },

  async "_sharedEventIndex is built before dedup so all sharers are remembered"() {
    const { el } = await makeCard();
    withSettings(el, { preventDuplicateEvents: true, mergeSharedEvents: true });
    const e = ev0(el, "Dinner", 1, 19);
    await fetchWith(el, {
      "calendar.person_a": [e],
      "calendar.person_b": [e],
      "calendar.person_c": [e],
    });
    const key = "dinner::" + Math.floor(new Date(e.start.dateTime).getTime() / 1000);
    const set = el._sharedEventIndex && el._sharedEventIndex.get(key);
    check(set, "index has the shared-event key, keys=" + [...(el._sharedEventIndex || new Map()).keys()]);
    const ents = [...set];
    check(ents.length === 3, "index remembers all 3 sharers, got " + ents.length);
    check(ents.every((x) => PEOPLE.some((p) => p.entity === x)), "index entries are real people: " + ents.join(","));
  },

  async "_eventPeopleEntities unions the auto sharers (the rendering hook)"() {
    const { el } = await makeCard();
    withSettings(el, { preventDuplicateEvents: true, mergeSharedEvents: true });
    const e = ev0(el, "Mozarts", 1, 18);
    await fetchWith(el, {
      "calendar.person_a": [e],
      "calendar.person_b": [e],
      "calendar.person_c": [],
    });
    // Build the Date in the jsdom realm so `start instanceof Date` inside the card matches.
    const startD = new el._root.ownerDocument.defaultView.Date(e.start.dateTime);
    const ents = el._eventPeopleEntities("calendar.person_a", startD, "Mozarts", PEOPLE, "");
    check(ents.includes("calendar.person_a"), "includes the base calendar: " + ents.join(","));
    check(ents.includes("calendar.person_b"), "includes the auto sharer: " + ents.join(","));
    check(!ents.includes("calendar.person_c"), "does not include a non-sharer: " + ents.join(","));
    // Off: only the base.
    const { el: el2 } = await makeCard();
    withSettings(el2, { preventDuplicateEvents: true, mergeSharedEvents: false });
    const e2 = ev0(el2, "Mozarts", 1, 18);
    await fetchWith(el2, { "calendar.person_a": [e2], "calendar.person_b": [e2] });
    const startD2 = new el2._root.ownerDocument.defaultView.Date(e2.start.dateTime);
    const ents2 = el2._eventPeopleEntities("calendar.person_a", startD2, "Mozarts", PEOPLE, "");
    check(ents2.length === 1 && ents2[0] === "calendar.person_a", "off -> base only: " + ents2.join(","));
  },

  async "merge is inert without dedup (nothing to collapse into)"() {
    const { el } = await makeCard();
    withSettings(el, { preventDuplicateEvents: false, mergeSharedEvents: true });
    await fetchWith(el, {
      "calendar.person_a": [ev0(el, "Mozarts", 1, 18)],
      "calendar.person_b": [ev0(el, "Mozarts", 1, 18)],
    });
    el._renderGrid();
    // Without dedup the event is shown per-calendar (two pills), so a merge has nothing to collapse.
    const moz = pills(el).filter((p) => /mozarts/i.test(p.summary));
    check(moz.length >= 2, "without dedup the event is shown per-calendar, so no merge can collapse it: got " + moz.length);
  },
};

(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(scenarios)) {
    try {
      await fn();
      console.log("ok   - " + name);
    } catch (e) {
      failed++;
      console.log("FAIL - " + name + "\n       " + (e && e.message));
    }
  }
  console.log(failed ? failed + " scenario(s) failed" : "all scenarios passed");
  process.exit(failed ? 1 : 0);
})();
