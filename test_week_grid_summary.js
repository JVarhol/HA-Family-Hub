// jsdom test for the "Week + next-week summary" layout (4 x 2 grid whose 8th
// cell summarises the 7 days after the last day shown).
//
//   node test_week_grid_summary.js
//
// jsdom is not vendored; install it anywhere and point JSDOM_PATH at it if
// a plain require("jsdom") does not resolve.
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

const PEOPLE = [
  { entity: "calendar.person_a", name: "Alex" },
  { entity: "calendar.person_b", name: "Sam" },
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

// Fresh jsdom + card per scenario so localStorage / state never leaks.
async function makeCard({ summary = true, rows = 2, dayCount = 7, config = {}, calls } = {}) {
  const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only", pretendToBeVisual: true, url: "http://localhost/" });
  const w = dom.window;
  w.eval(src);
  const ls = w.localStorage;
  ls.setItem("familyCalendarWeekRowsLocal", String(rows));
  ls.setItem("familyCalendarWeekDayCountLocal", String(dayCount));
  if (summary) ls.setItem("familyCalendarWeekSummaryLocal", "on");
  const el = w.document.createElement("family-week-calendar-card");
  w.document.body.appendChild(el);
  el.setConfig({ people: PEOPLE, ...config });
  el.hass = makeHass(calls);
  await new Promise((r) => setTimeout(r, 300));
  el._viewMode = "week";
  el._weekOffset = 0;
  return { dom, w, el };
}

// A local-time event `dayOffset` days after the first day shown.
function ev(el, summary, dayOffset, hour, opts = {}) {
  const day = new Date(el._weekStart());
  day.setDate(day.getDate() + dayOffset);
  if (opts.allDay) {
    const key = el._dateKey(day);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    return { summary, start: { date: key }, end: { date: el._dateKey(next) }, uid: summary + dayOffset };
  }
  const s = new Date(day);
  s.setHours(hour, 0, 0, 0);
  const e = new Date(s);
  e.setHours(hour + 1);
  return { summary, start: { dateTime: s.toISOString() }, end: { dateTime: e.toISOString() }, uid: summary + dayOffset };
}

function render(el, events) {
  el._events = events;
  el._renderGrid();
  return el._root.querySelector(".week-summary");
}

const scenarios = {
  async "preset registry offers the layout and leaves the others alone"() {
    const { el } = await makeCard();
    const reg = el._layoutPresetRegistry();
    check(reg.week_summary && reg.week_summary.summary === true, "week_summary preset with summary:true");
    check(reg.week_summary.variant === "week" && reg.week_summary.dayCount === 7 && reg.week_summary.rows === 2, "week_summary is 7 days over 2 rows");
    for (const k of ["week", "portrait", "agenda", "two_week"]) {
      check(reg[k] && !reg[k].summary, k + " preset has no summary");
    }
    check(el._root.querySelector('.layout-preset-btn[data-preset="week_summary"]'), "Settings lists the new layout button");
  },

  async "summary lists next week"() {
    const { el } = await makeCard();
    const events = {
      "calendar.person_a": [ev(el, "Event A", 8, 9), ev(el, "Event Allday", 9, 0, { allDay: true })],
      "calendar.person_b": [ev(el, "Event B", 8, 14), ev(el, "Event C", 12, 18)],
    };
    const tile = render(el, events);
    check(tile, "8th summary cell exists");
    const rows = el._root.querySelectorAll(".week-row");
    check(rows.length === 2, "two rows");
    check(rows[0].children.length === 4 && rows[1].children.length === 4, "4 over 4");
    check(el._root.querySelectorAll(".day-col").length === 7, "seven day columns");
    check(rows[1].lastElementChild === tile, "summary is the last cell");
    const lines = [...tile.querySelectorAll(".ws-event")];
    check(lines.length === 4, "four lines, got " + lines.length);
    const titles = lines.map((l) => l.querySelector(".ws-title").textContent);
    check(titles.join("|") === "Event A|Event B|Event Allday|Event C", "ordered by day then time: " + titles.join("|"));
    const day8 = new Date(el._weekStart());
    day8.setDate(day8.getDate() + 8);
    check(lines[0].querySelector(".ws-day").textContent.endsWith(" " + day8.getDate()), "line carries its day label inside the chip");
    check(!lines.some((l) => l.querySelector(".ws-time")) && !/\d:\d\d/.test(tile.textContent), "no clock times in the tile");
    check(lines.every((l) => l.classList.contains("event") && l.querySelector(".event-top .avatar") && l.querySelector(".summary")), "lines reuse the day chips' markup (event, avatar, summary)");
    check(lines[0].querySelector(".avatar").textContent === "A", "avatar shows the person's initial");
    check(/\w+ \d+/.test(lines[2].querySelector(".time").textContent) && !/all day/i.test(lines[2].textContent), "all-day event also just shows its day");
    check(!tile.querySelector("div.ws-day"), "no separate day heading rows");
    check(!tile.querySelector(".ws-empty") && !tile.querySelector(".ws-more"), "no empty/overflow notes");
    check(/background/.test(lines[0].getAttribute("style") || ""), "line is tinted");
  },

  async "nothing next week"() {
    const { el } = await makeCard();
    const tile = render(el, { "calendar.person_a": [ev(el, "This week only", 2, 9)], "calendar.person_b": [] });
    check(tile, "summary cell exists");
    check(tile.querySelectorAll(".ws-event").length === 0, "no lines");
    check(tile.querySelector(".ws-empty") && /nothing scheduled/i.test(tile.textContent), "says Nothing scheduled");
  },

  async "respects the legend filter"() {
    const { el } = await makeCard();
    const events = { "calendar.person_a": [ev(el, "Event A", 8, 9)], "calendar.person_b": [ev(el, "Event B", 9, 9)] };
    el._legendFilterKeys = ["alex"];
    const tile = render(el, events);
    const titles = [...tile.querySelectorAll(".ws-title")].map((n) => n.textContent);
    check(titles.join("|") === "Event A", "only the selected person's events: " + titles.join("|"));
  },

  async "respects privacy mode"() {
    const { el } = await makeCard();
    el._privacyModeEnabled = true;
    const tile = render(el, { "calendar.person_a": [ev(el, "Event A", 8, 9)], "calendar.person_b": [] });
    check(tile.querySelectorAll(".ws-event").length === 0, "privacy mode shows no events, like the grid");
    check(!tile.textContent.includes("Event A"), "title not leaked");
  },

  async "respects discreet mode"() {
    const { el } = await makeCard();
    const real = el._getSettings.bind(el);
    el._getSettings = () => ({ ...real(), discreetModeEnabled: true });
    const tile = render(el, { "calendar.person_a": [ev(el, "Event A", 8, 9)], "calendar.person_b": [] });
    check(tile.querySelectorAll(".ws-event").length === 1, "the event is still counted");
    check(!tile.textContent.includes("Event A"), "title redacted");
  },

  async "+N more overflow"() {
    const { el } = await makeCard();
    const many = [];
    for (let i = 0; i < 9; i++) many.push(ev(el, "Event " + i, 8 + (i % 3), 8 + i));
    const tile = render(el, { "calendar.person_a": many, "calendar.person_b": [] });
    const shown = tile.querySelectorAll(".ws-event").length;
    check(shown === 4, "without layout the fallback shows 4 lines, shows " + shown);
    const more = tile.querySelector(".ws-more");
    check(more && more.textContent.includes("+" + (9 - shown) + " more"), "shows +N more: " + (more && more.textContent));
  },

  async "the number of lines follows the tile's real height"() {
    const { w, el } = await makeCard();
    // jsdom has no layout: model a 280px tile where every line (and the +N more line) is 40px.
    const isTile = (n) => n.classList && n.classList.contains("week-summary");
    Object.defineProperty(w.HTMLElement.prototype, "clientHeight", { get() { return isTile(this) ? 280 : 0; } });
    Object.defineProperty(w.HTMLElement.prototype, "scrollHeight", {
      get() { return isTile(this) ? 40 * (this.querySelectorAll(".ws-event, .ws-more").length) : 0; },
    });
    const many = [];
    for (let i = 0; i < 9; i++) many.push(ev(el, "Event " + i, 8 + (i % 3), 8 + i));
    const tile = render(el, { "calendar.person_a": many, "calendar.person_b": [] });
    const shown = tile.querySelectorAll(".ws-event").length;
    check(shown === 6, "fits 6 lines in 280px (6 + the +N more line), got " + shown);
    check(/\+3 more/.test(tile.querySelector(".ws-more").textContent), "+3 more for the rest");
    const few = render(el, { "calendar.person_a": many.slice(0, 3), "calendar.person_b": [] });
    check(few.querySelectorAll(".ws-event").length === 3 && !few.querySelector(".ws-more"), "everything fits: no +N more");
  },

  async "tapping the tile goes to next week"() {
    const { el } = await makeCard();
    const tile = render(el, { "calendar.person_a": [], "calendar.person_b": [] });
    tile.click();
    check(el._weekOffset === 1, "week offset is 1 after tap, got " + el._weekOffset);
  },

  async "fetch window grows by 7 days only with the summary"() {
    const withSummary = [];
    const a = await makeCard({ calls: withSummary });
    withSummary.length = 0;
    await a.el._fetchEvents();
    const without = [];
    const b = await makeCard({ summary: false, calls: without });
    without.length = 0;
    await b.el._fetchEvents();
    const span = (url) => {
      const q = new URLSearchParams(url.split("?")[1]);
      return Math.round((new Date(q.get("end")) - new Date(q.get("start"))) / 864e5);
    };
    check(withSummary.length > 0 && without.length > 0, "calendar calls were made");
    check(span(withSummary[0]) === 14, "14 day window with summary, got " + span(withSummary[0]));
    check(span(without[0]) === 7, "7 day window without, got " + span(without[0]));
  },

  async "Prevent duplicate events applies to next week's events"() {
    const { el } = await makeCard();
    const shared = ev(el, "Shared", 8, 9);
    el._hass.callApi = async () => [shared];
    await el._fetchEvents();
    const total = Object.values(el._events).reduce((n, l) => n + l.length, 0);
    check(total === 1, "same event on two calendars is kept once, got " + total);
    el._viewMode = "week";
    el._renderGrid();
    check(el._root.querySelectorAll(".ws-event").length === 1, "tile shows it once");
  },

  async "shared layout setting"() {
    const { el } = await makeCard({ summary: false, config: { static_layout_across_devices: true } });
    const real = el._getSettings.bind(el);
    el._getSettings = () => ({ ...real(), weekSummaryShared: true, weekRowsShared: 2, weekDayCountShared: 7, weekViewVariantShared: "week" });
    el._renderGrid();
    check(el._getWeekSummary() === true, "reads weekSummaryShared when the layout is shared");
    check(el._root.querySelector(".week-summary"), "tile rendered from the shared setting");
  },

  async "other layouts are unchanged"() {
    // flag off: classic 7 columns on 1 row
    let c = await makeCard({ summary: false, rows: 1 });
    render(c.el, { "calendar.person_a": [], "calendar.person_b": [] });
    check(!c.el._root.querySelector(".week-summary"), "no tile when the flag is off (week)");
    check(c.el._root.querySelectorAll(".week-row").length === 1 && c.el._root.querySelectorAll(".day-col").length === 7, "week: 1 row, 7 days");
    // flag off: portrait 4 + 3
    c = await makeCard({ summary: false, rows: 2 });
    render(c.el, { "calendar.person_a": [], "calendar.person_b": [] });
    const rows = [...c.el._root.querySelectorAll(".week-row")].map((r) => r.children.length);
    check(rows.join("+") === "4+3" && !c.el._root.querySelector(".week-summary"), "portrait still 4+3, got " + rows.join("+"));
    // flag on but a different day count: ignored
    c = await makeCard({ summary: true, rows: 2, dayCount: 14 });
    render(c.el, { "calendar.person_a": [], "calendar.person_b": [] });
    check(!c.el._root.querySelector(".week-summary") && c.el._root.querySelectorAll(".day-col").length === 14, "two-week ignores a stale summary flag");
    // flag on but agenda variant: ignored
    c = await makeCard({ summary: true });
    c.w.localStorage.setItem("familyCalendarWeekViewVariantLocal", "agenda");
    check(c.el._weekSummaryActive() === false, "agenda variant never shows the tile");
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
