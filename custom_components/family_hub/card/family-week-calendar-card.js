(function () {
if (window.__familyCalendarApplyScrollLock) return;
function applyScrollLock(locked) {
let styleEl = document.getElementById("family-calendar-scroll-lock-style");
if (!styleEl) {
styleEl = document.createElement("style");
styleEl.id = "family-calendar-scroll-lock-style";
document.head.appendChild(styleEl);
}
styleEl.textContent = locked
? `html, body { overflow: hidden !important; height: 100% !important; height: 100dvh !important; overscroll-behavior: none; }`
: "";
}
window.__familyCalendarApplyScrollLock = applyScrollLock;
})();
(function () {
if (window.__familyCalendarFontLoaded) return;
window.__familyCalendarFontLoaded = true;
const link = document.createElement("link");
link.rel = "stylesheet";
link.href = "https://fonts.googleapis.com/css2?family=Varela+Round&display=swap";
document.head.appendChild(link);
})();
// A fixed accent color for reminder pills/blocks in the grid - reminders
// aren't tied to any one calendar (and so have no calendar color of their
// own), but still need to look consistent wherever they show up.
const REMINDER_COLOR = "#b58cd9";
// A small seasonal easter egg: on Halloween (Oct 31, the device's local
// date), the calendar's background swaps to this pastel ghosts/bats/
// pumpkins SVG for the day, overriding whatever background the active
// theme is otherwise configured with - reverting automatically the next
// day since it's re-checked on every _applySizeVars() call rather than
// stored anywhere. Embedded inline as a base64 data URI (same --fc-bg-image
// custom property every other theme background already uses) so this
// needs no extra file, network request, or Grocy/any other integration to
// work everywhere the card is installed.
const HALLOWEEN_BG_IMAGE =
"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MDAgODAwIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIj4KICA8ZGVmcz4KICAgIDwhLS0gU29mdCBMaWdodCBQYXN0ZWwgQmFja2dyb3VuZCAtLT4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0ibGlnaHQtYmciIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMCUiIHkyPSIxMDAlIj4KICAgICAgPHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iI2YzZThmZiIvPgogICAgICA8c3RvcCBvZmZzZXQ9IjQwJSIgc3RvcC1jb2xvcj0iI2ZhZWZlZSIvPgogICAgICA8c3RvcCBvZmZzZXQ9IjgwJSIgc3RvcC1jb2xvcj0iI2ZmZjRlNiIvPgogICAgICA8c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiNmZmU4ZDYiLz4KICAgIDwvbGluZWFyR3JhZGllbnQ+CgogICAgPCEtLSBTdW4vTW9vbiBTb2Z0IFBhc3RlbCBSYWRpYWwgLS0+CiAgICA8cmFkaWFsR3JhZGllbnQgaWQ9ImxpZ2h0LXN1biIgY3g9IjUwJSIgY3k9IjUwJSIgcj0iNTAlIj4KICAgICAgPHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iI2ZmYjcwMyIgc3RvcC1vcGFjaXR5PSIwLjM1Ii8+CiAgICAgIDxzdG9wIG9mZnNldD0iNzAlIiBzdG9wLWNvbG9yPSIjZmI4NTAwIiBzdG9wLW9wYWNpdHk9IjAuMTUiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjZmI4NTAwIiBzdG9wLW9wYWNpdHk9IjAiLz4KICAgIDwvcmFkaWFsR3JhZGllbnQ+CiAgPC9kZWZzPgoKICA8IS0tIENhbnZhcyBCYWNrZ3JvdW5kIC0tPgogIDxyZWN0IHdpZHRoPSI0MDAiIGhlaWdodD0iODAwIiBmaWxsPSJ1cmwoI2xpZ2h0LWJnKSIvPgoKICA8IS0tIFRvcCBBbWJpZW50IFN1biBHbG93IC0tPgogIDxjaXJjbGUgY3g9IjIwMCIgY3k9IjEzMCIgcj0iMTQwIiBmaWxsPSJ1cmwoI2xpZ2h0LXN1bikiLz4KCiAgPCEtLSBGbG9hdGluZyBHaG9zdHMgJiBCYXRzIChUb3AgSGVhZGVyIEFyZWEgLSBJbmNyZWFzZWQpIC0tPgogIDxnIGZpbGw9IiM2YjIxYTgiIG9wYWNpdHk9IjAuMTgiPgogICAgPCEtLSBNYWluIExlZnQgR2hvc3QgLS0+CiAgICA8cGF0aCBkPSJNIDUwIDExMCBDIDUwIDkwIDcwIDkwIDcwIDExMCBDIDcwIDEyNSA2NSAxMjAgNjUgMTMwIEMgNjAgMTI1IDU4IDEzMCA1NSAxMjUgQyA1MiAxMzAgNTAgMTI1IDUwIDExMCBaIi8+CiAgICA8Y2lyY2xlIGN4PSI1OCIgY3k9IjEwMyIgcj0iMS41IiBmaWxsPSIjNGMxZDk1Ii8+CiAgICA8Y2lyY2xlIGN4PSI2NCIgY3k9IjEwMyIgcj0iMS41IiBmaWxsPSIjNGMxZDk1Ii8+CiAgICAKICAgIDwhLS0gQ2x1c3RlciBVcHBlciBMZWZ0IC0tPgogICAgPHBhdGggZD0iTSAxMTAgODAgQyAxMTAgNjUgMTI1IDY1IDEyNSA4MCBRIDEyNSA5MCAxMjAgOTUgTCAxMTUgOTAgWiIgb3BhY2l0eT0iMC43Ii8+CiAgICA8cGF0aCBkPSJNIDg1IDU1IFEgODkgNTEgOTMgNTUgUSA5NyA1MSAxMDEgNTUgUSA5MyA2MCA4NSA1NSBaIi8+CgogICAgPCEtLSBNYWluIFJpZ2h0IEdob3N0IC0tPgogICAgPHBhdGggZD0iTSAzMzAgNzAgQyAzMzAgNTUgMzQ1IDU1IDM0NSA3MCBDIDM0NSA4MiAzNDEgNzggMzQxIDg2IEMgMzM3IDgyIDMzNSA4NiAzMzMgODIgQyAzMzEgODYgMzMwIDgyIDMzMCA3MCBaIi8+CiAgICA8Y2lyY2xlIGN4PSIzMzUuNSIgY3k9IjY1IiByPSIxLjIiIGZpbGw9IiM0YzFkOTUiLz4KICAgIDxjaXJjbGUgY3g9IjM0MC41IiBjeT0iNjUiIHI9IjEuMiIgZmlsbD0iIzRjMWQ5NSIvPgogICAgCiAgICA8IS0tIENsdXN0ZXIgVXBwZXIgUmlnaHQgLS0+CiAgICA8cGF0aCBkPSJNIDI5MCA5NSBDIDI5MCA4NSAzMDAgODUgMzAwIDk1IFEgMzAwIDEwMiAyOTUgMTA1IEwgMjkyIDEwMiBaIiBvcGFjaXR5PSIwLjciLz4KICAgIDxwYXRoIGQ9Ik0gMzU1IDExMCBRIDM1OSAxMDYgMzYzIDExMCBRIDM2NyAxMDYgMzcxIDExMCBRIDM2MyAxMTUgMzU1IDExMCBaIi8+CgogICAgPCEtLSBBZGRpdGlvbmFsIENlbnRlciBTbWFsbCBHaG9zdHMgLS0+CiAgICA8cGF0aCBkPSJNIDE3MCAxNzAgQyAxNzAgMTYwIDE4MCAxNjAgMTgwIDE3MCBRIDE4MCAxNzYgMTc1IDE3OCBaIiBvcGFjaXR5PSIwLjYiLz4KICAgIDxwYXRoIGQ9Ik0gMjMwIDE1MCBDIDIzMCAxNDAgMjQwIDE0MCAyNDAgMTUwIFEgMjQwIDE1NiAyMzUgMTU4IFoiIG9wYWNpdHk9IjAuNiIvPgoKICAgIDwhLS0gTWluaW1hbCBCYXRzIC0tPgogICAgPHBhdGggZD0iTSAxODAgNjAgUSAxODUgNTUgMTkwIDYwIFEgMTk1IDU1IDIwMCA2MCBRIDE5MCA2NyAxODAgNjAgWiIvPgogICAgPHBhdGggZD0iTSAyMjAgODUgUSAyMjMgODEgMjI3IDg1IFEgMjMxIDgxIDIzNSA4NSBRIDIyNyA5MCAyMjAgODUgWiIvPgogICAgPHBhdGggZD0iTSAxNDAgNDAgUSAxNDMgMzYgMTQ3IDQwIFEgMTUxIDM2IDE1NSA0MCBRIDE0NyA0NSAxNDAgNDAgWiIvPgogIDwvZz4KCiAgPCEtLSBCb3R0b20gUHVtcGtpbiAmIEhpbGwgU2lsaG91ZXR0ZXMgKFN1YnRsZSBGb290ZXIgQW5jaG9yIC0gSW5jcmVhc2VkIFBhdGNoKSAtLT4KICA8ZyBmaWxsPSIjNGMxZDk1IiBvcGFjaXR5PSIwLjEyIj4KICAgIDwhLS0gQmFzZSBDdXJ2ZWQgSGlsbCAtLT4KICAgIDxwYXRoIGQ9Ik0gLTIwIDc0MCBRIDE4MCA3MDAgNDIwIDc0MCBMIDQyMCA4MDAgTCAtMjAgODAwIFoiLz4KICAgIAogICAgPCEtLSBMZWZ0IE1haW4gUHVtcGtpbiAtLT4KICAgIDxwYXRoIGQ9Ik0gNDAgNzM1IEMgMjUgNzM1IDIwIDc0OCAyMCA3NTggQyAyMCA3NzAgMjggNzc4IDQwIDc3OCBDIDUyIDc3OCA2MCA3NzAgNjAgNzU4IEMgNjAgNzQ4IDU1IDczNSA0MCA3MzUgWiIvPgogICAgPHJlY3QgeD0iMzgiIHk9IjczMCIgd2lkdGg9IjQiIGhlaWdodD0iNyIgcng9IjEiIGZpbGw9IiM0YzFkOTUiLz4KICAgIDwhLS0gTGVmdCBDbHVzdGVyIEFkZGl0aW9ucyAtLT4KICAgIDxwYXRoIGQ9Ik0gNzUgNzQ1IEMgNjggNzQ1IDY1IDc1MiA2NSA3NTcgQyA2NSA3NjMgNjkgNzY3IDc1IDc2NyBDIDgxIDc2NyA4NSA3NjMgODUgNzU3IEMgODUgNzUyIDgyIDc0NSA3NSA3NDUgWiIgb3BhY2l0eT0iMC43Ii8+CiAgICA8cmVjdCB4PSI3NCIgeT0iNzQyIiB3aWR0aD0iMiIgaGVpZ2h0PSI0IiByeD0iMSIgZmlsbD0iIzRjMWQ5NSIvPgoKICAgIDwhLS0gUmlnaHQgTWFpbiBQdW1wa2luIChTbWFsbCkgLS0+CiAgICA8cGF0aCBkPSJNIDM0MCA3NDUgQyAzMjggNzQ1IDMyNCA3NTUgMzI0IDc2MyBDIDMyNCA3NzMgMzMwIDc3OSAzNDAgNzc5IEMgMzUwIDc3OSAzNTYgNzczIDM1NiA3NjMgQyAzNTYgNzU1IDM1MiA3NDUgMzQwIDc0NSBaIi8+CiAgICA8cmVjdCB4PSIzMzkiIHk9Ijc0MSIgd2lkdGg9IjMiIGhlaWdodD0iNSIgcng9IjEiIGZpbGw9IiM0YzFkOTUiLz4KICAgIDwhLS0gUmlnaHQgQ2x1c3RlciBBZGRpdGlvbnMgLS0+CiAgICA8cGF0aCBkPSJNIDMxMCA3NTUgQyAzMDMgNzU1IDMwMCA3NjAgMzAwIDc2NCBDIDMwMCA3NjkgMzAzIDc3MiAzMTAgNzcyIEMgMzE3IDc3MiAzMjAgNzY5IDMyMCA3NjQgQyAzMjAgNzYwIDMxNyA3NTUgMzEwIDc1NSBaIiBvcGFjaXR5PSIwLjciLz4KICAgIDxwYXRoIGQ9Ik0gMzY1IDc1MCBDIDM1OCA3NTAgMzU1IDc1NyAzNTUgNzYyIEMgMzU1IDc2OCAzNTkgNzcyIDM2NSA3NzIgQyAzNzEgNzcyIDM3NSA3NjggMzc1IDc2MiBDIDM3NSA3NTcgMzcyIDc1MCAzNjUgNzUwIFoiIG9wYWNpdHk9IjAuOCIvPgoKICAgIDwhLS0gQ2VudGVyIEdyb3VuZCBDb3ZlciAtLT4KICAgIDxwYXRoIGQ9Ik0gMTgwIDczMCBDIDE3MCA3MzAgMTY3IDczOCAxNjcgNzQzIEMgMTY3IDc0OCAxNzEgNzUxIDE4MCA3NTEgQyAxODkgNzUxIDE5MyA3NDggMTkzIDc0MyBDIDE5MyA3MzggMTkwIDczMCAxODAgNzMwIFoiIG9wYWNpdHk9IjAuNSIvPgogICAgPHBhdGggZD0iTSAyMjAgNzM1IEMgMjEzIDczNSAyMTAgNzQwIDIxMCA3NDQgQyAyMTAgNzQ5IDIxMyA3NTEgMjIwIDc1MSBDIDIyNyA3NTEgMjMwIDc0OSAyMzAgNzQ0IEMgMjMwIDc0MCAyMjcgNzM1IDIyMCA3MzUgWiIgb3BhY2l0eT0iMC41Ii8+CiAgPC9nPgo8L3N2Zz4K";
class FamilyWeekCalendarCard extends HTMLElement {
// No getConfigElement/getConfigForm here on purpose - a graphical editor
// was tried (v33) but reverted (v34): it only ever covered a bootstrap
// subset of config (calendars + a few entities), while everything else
// lived in the card's own Settings panel, so having two places to
// configure the card added confusion rather than convenience. All setup
// and ongoing editing is meant to happen from the in-card Settings modal
// (gear icon) instead - YAML is only needed once, for the entities block.
setConfig(config) {
config = config || {};
const palette = ["#a9c6c2", "#dba99c", "#d9bf7e", "#a8bd93", "#b9a7c9", "#cf8f6c", "#a89a83"];
const rawPeople = Array.isArray(config.people) ? config.people : [];
this._config = {
title: config.title || "Family Calendar",
// No calendars yet is a valid starting state - the Settings > Calendars
// panel (+ Add calendar) is how people are meant to be added once the
// card is placed, not required config up front.
people: rawPeople.map((p, i) => ({
entity: p.entity,
name: p.name || p.entity,
color: p.color || palette[i % palette.length],
})),
recipe_entity: config.recipe_entity || "todo.recipe_box",
meal_plan_entity: config.meal_plan_entity || "todo.meal_plan",
// Whole-week meal templates ("Save this week as a template" / "Apply a
// saved template") each live as one to-do item on this list - the item's
// name is the template's name, and its description JSON-encodes every
// populated day/block slot from the week it was saved from.
meal_templates_entity: config.meal_templates_entity || "todo.meal_plan_templates",
suggestions_entity: config.suggestions_entity || "todo.meal_suggestions",
weather_entity: config.weather_entity || "weather.forecast_home",
settings_entity: config.settings_entity || "todo.family_calendar_settings",
birthdays_entity: config.birthdays_entity || "calendar.birthdays",
// Reminders (the Add Event modal's Reminder tab) are stored as items on
// this Home Assistant to-do list, not as events on any calendar - so they
// can be marked done, edited, or rescheduled directly in Home Assistant's
// own To-do UI (or from this card) without touching Google Calendar or
// whatever the "real" calendars are backed by.
reminders_entity: config.reminders_entity || "todo.family_reminders",
};
this._events = {};
this._fetchErrors = {};
this._reminders = [];
this._recipes = [];
// Recipe Box thumbnails for Grocy-imported dishes (see
// _hydrateGrocyRecipeImages): recipe_box todo items only ever store a
// manually-entered Photo URL, never a Grocy recipe's own photo, so a
// dish imported from Grocy shows a blank placeholder tile in the grid
// until this cache is populated from a get_grocy_recipe_detail call.
// Keyed by grocyRecipeId; a cached `null` means "already checked, Grocy
// has no photo for this one" so it isn't retried on every re-render.
this._grocyImageCache = {};
this._grocyImageFetching = new Set();
// "default" (whatever order the recipe_box todo list returns), "name"
// (A-Z), or "suggested" (recipes currently in Meal Suggestions bubble to
// the top) - see _sortRecipeBoxList. Reset to "default" each time the
// Recipe Box is opened (_openLoved), same as the search box and category
// filter.
this._recipeBoxSort = "default";
// Multi-select delete mode (see _toggleRecipeBoxSelectMode) - a Set of
// recipe uids currently checked, only meaningful while
// _recipeBoxSelectMode is true. Browsing-mode only; picker mode has no
// use for bulk delete.
this._recipeBoxSelectMode = false;
this._recipeBoxSelectedUids = new Set();
this._mealPlan = {};
this._recurringMeals = [];
this._mealTemplates = [];
this._suggestions = [];
this._lovedSearchTerm = "";
this._templatesSearchTerm = "";
// "Add from Grocy" picker (Meal Suggestions box) - configured is null
// until the first fetch resolves, so the picker can show a neutral
// "checking..." state instead of flashing "not configured" on open.
this._grocyRecipes = [];
this._grocySearchTerm = "";
this._grocyStatus = { loading: false, configured: null, error: "" };
this._forecast = {};
this._eventDetails = {};
this._currentRating = null;
this._currentColor = null;
// Set whenever the day/dish editor is populated from something that came
// from Grocy (picking a Grocy-imported suggestion or loved dish, or
// reopening a previously-saved one) - lets the modal's link-open button
// open the in-card Recipe Viewer instead of the plain link. Cleared for a
// brand new/empty entry.
this._currentGrocyRecipeId = null;
this._pickerMode = false;
this._countdown = null;
if (this._weekOffset === undefined) this._weekOffset = 0;
if (this._monthOffset === undefined) this._monthOffset = 0;
if (this._settingsCache === undefined) this._settingsCache = null;
if (this._settingsItemUid === undefined) this._settingsItemUid = null;
if (this._settingsPeopleDraft === undefined) this._settingsPeopleDraft = [];
if (this._mealEditMode === undefined) this._mealEditMode = false;
if (this._settingsFetchSeq === undefined) this._settingsFetchSeq = 0;
if (this._eventsFetchSeq === undefined) this._eventsFetchSeq = 0;
if (this._topModalZ === undefined) this._topModalZ = 1006;
if (this._legendFilterKeys === undefined) this._legendFilterKeys = [];
if (this._notifyOverrides === undefined) this._notifyOverrides = {};
if (this._notifyConfigError === undefined) this._notifyConfigError = false;
if (this._notifyDevicesEditIdx === undefined) this._notifyDevicesEditIdx = null;
if (this._reminderOverrides === undefined) this._reminderOverrides = {};
if (this._eventInfoOpenId === undefined) this._eventInfoOpenId = null;
if (this._eventInfoRemindDirty === undefined) this._eventInfoRemindDirty = false;
if (this._firstLoadPromise === undefined) this._firstLoadPromise = null;
if (this._addEventActiveTab === undefined) this._addEventActiveTab = "calendar";
if (this._eventTypeFilter === undefined) this._eventTypeFilter = [];
if (this._settingsReminderNotifyDraft === undefined) this._settingsReminderNotifyDraft = [];
if (this._settingsDigestNotifyDraft === undefined) this._settingsDigestNotifyDraft = [];
if (!this._built) this._build();
}
set hass(hass) {
const first = !this._hass;
this._hass = hass;
if (first) {
this._firstLoadPromise = this._initFirstLoad();
}
this._applySizeVars();
}
// One shared list of "refresh everything" fetches, used by the very first
// load, a reconnect (e.g. switching dashboard views), and the 60s poll -
// having one copy means there's only ever one place this can drift, and
// only ever one in-flight round of these calls at a time (see
// connectedCallback for why that matters).
_refreshAllData() {
this._fetchEvents();
this._fetchRecipes();
this._fetchMealPlan();
this._fetchMealTemplates();
this._fetchSuggestions();
this._fetchWeather();
this._fetchCountdown();
this._fetchGlobalThemes();
this._fetchReminders();
}
_startPolling() {
if (this._interval) return;
this._interval = setInterval(() => {
this._fetchSettings();
this._refreshAllData();
}, 60 * 1000);
}
async _initFirstLoad() {
await this._fetchSettings();
if (!this._viewMode) {
const s = this._getSettings();
this._viewMode = s.defaultView === "month" ? "month" : "week";
}
this._refreshAllData();
this._startPolling();
// Tell the backend which to-do list holds reminders, so its poller knows
// what to check - best-effort, and only needs to happen once per session
// since it rarely changes.
this._syncRemindersEntity();
this._syncDailyDigestConfig();
this._syncGrocyExpiringConfig();
this._syncGrocyLowStockConfig();
this._syncNotificationClickPath();
}
connectedCallback() {
if (this._hass && !this._interval) {
if (this._firstLoadPromise) {
// A first load kicked off by the hass setter is already in flight (or
// already finished) - piggyback on it instead of starting a second,
// duplicate round of fetches here. Firing a second, independent round
// of _fetchSettings()/_fetchEvents() at the same time used to race the
// original one (both bump the same fetch-sequence counters that guard
// against a stale response overwriting a fresher one), which could
// leave the very first render with no/partial data - the calendar
// looked blank until something else (like changing weeks) triggered a
// single, uncontested fetch that rendered cleanly. Waiting for the
// original load to finish avoids that race entirely.
this._firstLoadPromise.then(() => {
if (this.isConnected && this._hass && !this._interval) {
this._refreshAllData();
this._startPolling();
}
});
} else {
// A true reconnect - hass was already set from a previous connect
// (e.g. switching away to another dashboard view and back), so there's
// no first-load race to avoid; refresh right away.
this._fetchSettings();
this._refreshAllData();
this._startPolling();
}
}
if (!this._boundSyncHeight) this._boundSyncHeight = this._syncHeight.bind(this);
window.addEventListener("resize", this._boundSyncHeight);
window.addEventListener("orientationchange", this._boundSyncHeight);
if (window.visualViewport) {
window.visualViewport.addEventListener("resize", this._boundSyncHeight);
window.visualViewport.addEventListener("scroll", this._boundSyncHeight);
}
if (!this._heightInterval) {
this._heightInterval = setInterval(this._boundSyncHeight, 1500);
}
requestAnimationFrame(this._boundSyncHeight);
setTimeout(this._boundSyncHeight, 300);
setTimeout(this._boundSyncHeight, 1200);
this._applyScrollLock();
}
disconnectedCallback() {
if (this._interval) clearInterval(this._interval);
this._interval = null;
if (this._heightInterval) clearInterval(this._heightInterval);
this._heightInterval = null;
if (this._countdownTickerInterval) clearInterval(this._countdownTickerInterval);
this._countdownTickerInterval = null;
if (this._boundSyncHeight) {
window.removeEventListener("resize", this._boundSyncHeight);
window.removeEventListener("orientationchange", this._boundSyncHeight);
if (window.visualViewport) {
window.visualViewport.removeEventListener("resize", this._boundSyncHeight);
window.visualViewport.removeEventListener("scroll", this._boundSyncHeight);
}
}
if (this._boundHandleModalPopState) {
window.removeEventListener("popstate", this._boundHandleModalPopState);
}
if (this._modalHistoryObserver) {
this._modalHistoryObserver.disconnect();
this._modalHistoryObserver = null;
}
this._modalBackButtonSetup = false;
}
_syncHeight() {
if (!this.isConnected) return;
const rect = this.getBoundingClientRect();
const vv = window.visualViewport;
const viewportHeight = vv ? vv.height : window.innerHeight;
const viewportTop = vv ? vv.offsetTop : 0;
const available = Math.max(300, Math.floor(viewportHeight - (rect.top - viewportTop)));
if (this.style.height !== `${available}px`) {
this.style.height = `${available}px`;
}
// Whatever sits above the card in the actual dashboard - most commonly
// Home Assistant's own top app bar, when the view isn't in a fully
// chromeless/kiosk layout - has already pushed the card's own top edge
// down by this many pixels, which is exactly the same amount any
// position:fixed, viewport-anchored overlay (the full-screen Recipe
// Viewer) needs to be offset by so its heading doesn't render underneath
// that bar instead of below it. Exposed as a custom property (rather than
// only used here) so the fix applies wherever a fixed overlay needs it,
// and stays live via the same resize/orientation/interval polling this
// method already runs on.
const headerOffset = Math.max(0, Math.round(rect.top - viewportTop));
this.style.setProperty("--fh-header-offset", `${headerOffset}px`);
}
getCardSize() {
return 8;
}
getLayoutOptions() {
return { grid_rows: "auto", grid_columns: "full" };
}
_dateKey(d) {
return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
_weekStart() {
const now = new Date();
const day = now.getDay();
const sunday = new Date(now);
sunday.setHours(0, 0, 0, 0);
sunday.setDate(now.getDate() - day + (this._weekOffset || 0) * 7);
return sunday;
}
_setWeekOffset(n) {
this._weekOffset = n;
this._fetchEvents();
this._updateNavLabel();
}
_monthAnchor() {
const now = new Date();
return new Date(now.getFullYear(), now.getMonth() + (this._monthOffset || 0), 1);
}
_monthGridRange() {
const anchor = this._monthAnchor();
const gridStart = new Date(anchor);
gridStart.setHours(0, 0, 0, 0);
gridStart.setDate(gridStart.getDate() - gridStart.getDay());
const gridEnd = new Date(gridStart);
gridEnd.setDate(gridStart.getDate() + 42);
return { gridStart, gridEnd, anchor };
}
_setMonthOffset(n) {
this._monthOffset = n;
this._fetchEvents();
this._updateNavLabel();
}
_goToWeekFromDate(date) {
const now = new Date();
const nowSunday = new Date(now);
nowSunday.setHours(0, 0, 0, 0);
nowSunday.setDate(now.getDate() - now.getDay());
const clickedSunday = new Date(date);
clickedSunday.setHours(0, 0, 0, 0);
clickedSunday.setDate(date.getDate() - date.getDay());
const diffWeeks = Math.round((clickedSunday - nowSunday) / (7 * 86400000));
this._viewMode = "week";
this._weekOffset = diffWeeks;
this._fetchEvents();
this._updateNavLabel();
}
_updateNavLabel() {
if (!this._root) return;
this._root.querySelectorAll(".view-btn").forEach((btn) => {
btn.classList.toggle("active", btn.dataset.view === this._viewMode);
});
const editBtn = this._root.querySelector(".edit-meals-btn");
if (editBtn) editBtn.style.display = this._viewMode === "month" ? "none" : "";
const shortcuts = this._root.querySelector(".week-shortcuts");
if (this._viewMode === "month") {
if (shortcuts) shortcuts.style.display = "none";
this._closeWeekShortcuts();
const anchor = this._monthAnchor();
this._root.querySelector(".week-label").textContent = anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
} else {
if (shortcuts) shortcuts.style.display = "";
const start = this._weekStart();
const end = new Date(start);
end.setDate(start.getDate() + 6);
const fmt = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
const prefix =
this._weekOffset === 0 ? "This Week" : this._weekOffset === 1 ? "Next Week" : this._weekOffset > 1 ? `${this._weekOffset} Weeks Out` : `${Math.abs(this._weekOffset)} Week(s) Ago`;
this._root.querySelector(".week-label").textContent = `${prefix} · ${fmt(start)} – ${fmt(end)}`;
this._root.querySelectorAll(".week-shortcut").forEach((btn) => {
btn.classList.toggle("active", parseInt(btn.dataset.weeks, 10) === this._weekOffset);
});
}
}
_fmtHour12(h) {
const period = h < 12 ? "AM" : "PM";
let hour12 = h % 12;
if (hour12 === 0) hour12 = 12;
return `${hour12} ${period}`;
}
_fmtHourOrMidnight(h) {
return h >= 24 ? "Midnight" : this._fmtHour12(h);
}
_getShowTimeline() {
let local = null;
try {
local = localStorage.getItem("familyCalendarShowTimelineLocal");
} catch (e) {
}
if (local === "on") return true;
if (local === "off") return false;
return !!this._getSettings().showTimeline;
}
_defaultTheme() {
return {
colors: {
bg: "#fbf7e5",
card: "#f5f3f0",
border: "#e6ddc4",
text: "#423d34",
textSecondary: "#96877a",
accent: "#8f5a00",
accentText: "#fff8ea",
accent2: "#305545",
accent3: "#b5583c",
surfaceAlt: "#efe6cf",
surface2: "#f2eede",
},
fonts: {
dayName: 13,
dayNumber: 22,
wxTemp: 14,
event: 14,
chip: 13,
headerTitle: 15,
countdown: 11,
blockLabel: 9,
blockMeal: 13,
},
};
}
_defaultSettings() {
return {
blocks: ["Breakfast", "Lunch", "Dinner"],
fontSize: "medium",
blockSize: "medium",
showTimeline: false,
timelineStartHour: 8,
timelineEndHour: 23,
defaultView: "week",
countdownEnabled: true,
// countdownLabel/countdownDate (singular) are kept only so an older save
// can be migrated into countdownItems below - new saves always go
// through the list. Storing every "use as countdown" pick as its own
// list entry (instead of one shared slot that a second pick would just
// overwrite) is what actually lets the ticker have more than one thing
// to cycle through, and lets any of them be individually removed later.
countdownLabel: "",
countdownDate: "",
countdownItems: [],
countdownTicker: false,
dailyDigestEnabled: false,
dailyDigestTime: "07:00",
// Opt-in, off by default: powers the card's "Expiring Soon" list and adds
// expiring-item counts to the Daily Digest, once Grocy is configured.
// Synced to the backend's config entry options too (_syncGrocyExpiringConfig,
// mirroring _syncDailyDigestConfig) since the always-running Daily Digest
// poller needs to see it independent of anyone having the dashboard open.
grocyExpiringEnabled: false,
// Independent of grocyExpiringEnabled itself: whether the feature (once
// on) also contributes a line to the Daily Digest, vs. staying card-only.
// Defaults to true so turning the feature on keeps behaving exactly like
// it always did until someone opts out of the digest line specifically.
grocyExpiringDigestEnabled: true,
// Same opt-in pattern as grocyExpiringEnabled just above, for the "Low
// Stock" list (products below their own min. stock amount) and its own
// Daily Digest count - a separate flag since a household might want one
// without the other. Synced via _syncGrocyLowStockConfig.
grocyLowStockEnabled: false,
grocyLowStockDigestEnabled: true,
// Optional relative path (e.g. "/lovelace-family/0") opened when someone
// taps a reminder/event/Daily Digest push notification on their phone -
// synced to the backend (family_hub/set_notification_click_path) since
// it's the backend, not the card, that actually sends the notification
// and needs to stamp this onto its data.url/data.clickAction.
notificationClickPath: "",
// Digest recipients are NOT stored here - they reuse the same per-target
// notify-overrides map as Reminders (family_hub/set_notify_overrides,
// keyed by the synthetic "__family_hub_digest__" target), so Settings and
// the backend's actual send logic can never disagree about who gets it.
people: [],
weekendBreakfast: false,
showMealsInMonth: false,
scrollLocked: false,
theme: this._defaultTheme(),
useGlobalTheme: false,
globalThemeId: "",
};
}
_genId() {
return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
// Strips a name down to lowercase alphanumerics-and-single-spaces so
// "Beef Stew!", "beef  stew", and "Beef-Stew" all compare equal - a
// plainer, cheaper first pass than full fuzzy matching that alone catches
// most accidental near-duplicates (punctuation, casing, extra whitespace)
// without any risk of false positives between genuinely different dishes.
_normalizeForDuplicateCheck(name) {
return (name || "")
.toString()
.normalize("NFKD")
.replace(/[̀-ͯ]/g, "")
.toLowerCase()
.replace(/[^a-z0-9]+/g, " ")
.trim()
.replace(/\s+/g, " ");
}
// Standard Levenshtein edit distance (insert/delete/substitute), used
// only on the already-normalized strings above so it's comparing "beef
// stew" against "beef stow", not raw user input still carrying
// punctuation/casing differences the normalize step already handles for
// free.
_levenshteinDistance(a, b) {
if (a === b) return 0;
if (!a.length) return b.length;
if (!b.length) return a.length;
let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
for (let i = 1; i <= a.length; i++) {
const cur = [i];
for (let j = 1; j <= b.length; j++) {
cur[j] =
a[i - 1] === b[j - 1]
? prev[j - 1]
: 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
}
prev = cur;
}
return prev[b.length];
}
// Finds the closest existing item to `name` worth flagging as a possible
// duplicate - an exact match after normalizing (distance 0) always
// counts; anything else only counts if the edit distance is small
// relative to the name's own length, so two short names a couple letters
// apart ("Stew"/"Stow") are held to the same relative bar as two long
// ones ("Buttery Herb Stuffing"/"Buttery Herb Stuffing2") a few
// characters apart - not a fixed distance that would either miss long-
// name typos or falsely flag short, legitimately-different dishes.
// `getName` extracts the comparable name string from each item in
// `list`; returns null when nothing is close enough to be worth asking
// about.
_findFuzzyDuplicate(name, list, getName) {
const norm = this._normalizeForDuplicateCheck(name);
if (!norm) return null;
let best = null;
let bestDistance = Infinity;
for (const item of list || []) {
const otherNorm = this._normalizeForDuplicateCheck(getName(item));
if (!otherNorm) continue;
const distance = otherNorm === norm ? 0 : this._levenshteinDistance(norm, otherNorm);
const threshold = otherNorm === norm ? 0 : Math.max(1, Math.round(Math.max(norm.length, otherNorm.length) * 0.2));
if (distance <= threshold && distance < bestDistance) {
best = item;
bestDistance = distance;
}
}
return best;
}
_normalizeBadges(p) {
if (Array.isArray(p.badges)) {
return p.badges
.filter((b) => b && typeof b === "object")
.map((b) => ({
text: (b.text || "").toString().trim(),
match: (b.match || "").toString().trim(),
hideMatch: (b.hideMatch || "").toString().trim(),
}))
.filter((b) => b.text || b.match || b.hideMatch);
}
if (p.badgeText || p.badgeMatch || p.badgeHideMatch) {
return [
{
text: (p.badgeText || "").toString().trim(),
match: (p.badgeMatch || "").toString().trim(),
hideMatch: (p.badgeHideMatch || "").toString().trim(),
},
];
}
return [];
}
_normalizeSettings(parsed) {
const defaults = this._defaultSettings();
if (!parsed || typeof parsed !== "object") return defaults;
const blocks =
Array.isArray(parsed.blocks) && parsed.blocks.length >= 1
? parsed.blocks.slice(0, 3).map((b, i) => (b && String(b).trim()) || defaults.blocks[i] || `Block ${i + 1}`)
: defaults.blocks;
const fontSize = ["small", "medium", "large"].includes(parsed.fontSize) ? parsed.fontSize : defaults.fontSize;
const blockSize = ["small", "medium", "large"].includes(parsed.blockSize) ? parsed.blockSize : defaults.blockSize;
const showTimeline = typeof parsed.showTimeline === "boolean" ? parsed.showTimeline : defaults.showTimeline;
let timelineStartHour = Number.isInteger(parsed.timelineStartHour) ? parsed.timelineStartHour : defaults.timelineStartHour;
let timelineEndHour = Number.isInteger(parsed.timelineEndHour) ? parsed.timelineEndHour : defaults.timelineEndHour;
timelineStartHour = Math.min(23, Math.max(0, timelineStartHour));
timelineEndHour = Math.min(24, Math.max(0, timelineEndHour));
if (timelineEndHour <= timelineStartHour) timelineEndHour = Math.min(24, timelineStartHour + 1);
const defaultView = parsed.defaultView === "month" ? "month" : "week";
const countdownEnabled = typeof parsed.countdownEnabled === "boolean" ? parsed.countdownEnabled : defaults.countdownEnabled;
const countdownLabel = typeof parsed.countdownLabel === "string" ? parsed.countdownLabel : defaults.countdownLabel;
const countdownDate = typeof parsed.countdownDate === "string" ? parsed.countdownDate : defaults.countdownDate;
let countdownItems = Array.isArray(parsed.countdownItems)
? parsed.countdownItems
.filter((it) => it && typeof it === "object" && it.label && it.date)
.map((it) => ({
id: typeof it.id === "string" && it.id ? it.id : this._genId(),
label: String(it.label),
date: String(it.date),
}))
: [];
// Migrate an older save's single countdownLabel/countdownDate pair into
// the list, once, so nobody's existing "use as countdown" pick just
// vanishes the first time this loads under the new list-based storage.
if (!countdownItems.length && countdownLabel && countdownDate) {
countdownItems = [{ id: this._genId(), label: countdownLabel, date: countdownDate }];
}
const countdownTicker = typeof parsed.countdownTicker === "boolean" ? parsed.countdownTicker : defaults.countdownTicker;
const dailyDigestEnabled = typeof parsed.dailyDigestEnabled === "boolean" ? parsed.dailyDigestEnabled : defaults.dailyDigestEnabled;
const dailyDigestTime = typeof parsed.dailyDigestTime === "string" && /^\d{2}:\d{2}$/.test(parsed.dailyDigestTime) ? parsed.dailyDigestTime : defaults.dailyDigestTime;
const grocyExpiringEnabled = typeof parsed.grocyExpiringEnabled === "boolean" ? parsed.grocyExpiringEnabled : defaults.grocyExpiringEnabled;
const grocyExpiringDigestEnabled = typeof parsed.grocyExpiringDigestEnabled === "boolean" ? parsed.grocyExpiringDigestEnabled : defaults.grocyExpiringDigestEnabled;
const grocyLowStockEnabled = typeof parsed.grocyLowStockEnabled === "boolean" ? parsed.grocyLowStockEnabled : defaults.grocyLowStockEnabled;
const grocyLowStockDigestEnabled = typeof parsed.grocyLowStockDigestEnabled === "boolean" ? parsed.grocyLowStockDigestEnabled : defaults.grocyLowStockDigestEnabled;
const notificationClickPath = typeof parsed.notificationClickPath === "string" ? parsed.notificationClickPath.trim() : defaults.notificationClickPath;
let people =
Array.isArray(parsed.people) && parsed.people.length
? parsed.people
.filter((p) => p && typeof p.entity === "string" && p.entity.trim())
.map((p) => ({
entity: p.entity.trim(),
name: (p.name || "").toString().trim() || p.entity.trim(),
color: p.color || "#d9bf7e",
countdown: !!p.countdown,
badges: this._normalizeBadges(p),
}))
: defaults.people;
if ((!Array.isArray(parsed.people) || !parsed.people.length) && parsed.showBirthdayCountdown && this._config.birthdays_entity) {
people = this._config.people.map((p) => ({ ...p, countdown: p.entity === this._config.birthdays_entity }));
}
const weekendBreakfast = typeof parsed.weekendBreakfast === "boolean" ? parsed.weekendBreakfast : defaults.weekendBreakfast;
const showMealsInMonth = typeof parsed.showMealsInMonth === "boolean" ? parsed.showMealsInMonth : defaults.showMealsInMonth;
const scrollLocked = typeof parsed.scrollLocked === "boolean" ? parsed.scrollLocked : defaults.scrollLocked;
const defaultTheme = defaults.theme;
const parsedTheme = parsed.theme && typeof parsed.theme === "object" ? parsed.theme : {};
if (parsedTheme.colors && typeof parsedTheme.colors === "object") {
const legacyColorKeyMap = { gold: "accent", goldText: "accentText", green: "accent2", terracotta: "accent3", chipBg: "surfaceAlt", blockBg: "surface2" };
const migratedColors = Object.assign({}, parsedTheme.colors);
Object.keys(legacyColorKeyMap).forEach((oldKey) => {
const newKey = legacyColorKeyMap[oldKey];
if (oldKey in migratedColors) {
if (!(newKey in migratedColors)) migratedColors[newKey] = migratedColors[oldKey];
delete migratedColors[oldKey];
}
});
parsedTheme.colors = migratedColors;
}
const colors = {};
Object.keys(defaultTheme.colors).forEach((k) => {
const v = parsedTheme.colors && parsedTheme.colors[k];
colors[k] = typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : defaultTheme.colors[k];
});
const fonts = {};
Object.keys(defaultTheme.fonts).forEach((k) => {
const raw = parsedTheme.fonts && parsedTheme.fonts[k];
const n = typeof raw === "number" ? raw : parseInt(raw, 10);
fonts[k] = Number.isFinite(n) && n >= 6 && n <= 72 ? n : defaultTheme.fonts[k];
});
const theme = { colors, fonts };
const useGlobalTheme = typeof parsed.useGlobalTheme === "boolean" ? parsed.useGlobalTheme : defaults.useGlobalTheme;
const globalThemeId = typeof parsed.globalThemeId === "string" ? parsed.globalThemeId : defaults.globalThemeId;
return {
blocks,
fontSize,
blockSize,
showTimeline,
timelineStartHour,
timelineEndHour,
defaultView,
countdownEnabled,
countdownLabel,
countdownDate,
countdownItems,
countdownTicker,
dailyDigestEnabled,
dailyDigestTime,
grocyExpiringEnabled,
grocyExpiringDigestEnabled,
grocyLowStockEnabled,
grocyLowStockDigestEnabled,
notificationClickPath,
people,
weekendBreakfast,
showMealsInMonth,
scrollLocked,
theme,
useGlobalTheme,
globalThemeId,
};
}
_parseSettingsDescription(raw) {
if (!raw) return null;
try {
return JSON.parse(raw);
} catch (e) {
return null;
}
}
// Settings used to live ONLY as JSON in a hidden "Settings" to-do item's
// description (this._config.settings_entity) - a hack that clutters Home
// Assistant's own To-do UI with an item nobody should touch by hand. They
// now live in a Store-backed home on the backend (family_hub/get_settings
// / family_hub/set_settings), same mechanism Theme Builder already uses for
// themes. The legacy to-do path is kept fully working, not just as a
// frozen fallback - _saveSettings/_persistSettingsPatch still write to it
// on every save - so falling back here (an older backend that predates
// family_hub/get_settings, or a manual rollback) always has current data,
// and existing installs migrate automatically the first time this runs
// after updating.
async _fetchSettings() {
if (!this._hass) return;
const fetchId = ++this._settingsFetchSeq;
let storeResult = null;
let storeReachable = true;
try {
storeResult = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_settings" });
} catch (e) {
storeReachable = false;
}
if (fetchId !== this._settingsFetchSeq) return;
if (storeReachable && storeResult && storeResult.settings && typeof storeResult.settings === "object") {
this._settingsCache = this._normalizeSettings(storeResult.settings);
this._applySizeVars();
if (this._root) {
this._renderGrid();
this._renderLegend();
this._updateNavLabel();
this._renderCountdown();
}
return;
}
// Store came back empty (not migrated yet) or family_hub/get_settings
// isn't available at all - fall back to the legacy to-do item exactly as
// this always has. Only attempt the one-time migration save when the
// store itself was actually reachable (no point saving somewhere we just
// failed to reach).
await this._fetchLegacySettings(fetchId, storeReachable);
}
async _fetchLegacySettings(fetchId, migrate) {
try {
const items = await this._getItems(this._config.settings_entity);
if (fetchId !== this._settingsFetchSeq) return;
const matches = items.filter((it) => it.summary === "Settings");
const item = matches.length ? matches[matches.length - 1] : items[0] || null;
this._settingsItemUid = item ? item.uid : null;
const parsed = item ? this._parseSettingsDescription(item.description) : null;
this._settingsCache = this._normalizeSettings(parsed);
if (matches.length > 1) {
for (let i = 0; i < matches.length - 1; i++) {
this._hass
.callService("todo", "remove_item", { item: matches[i].uid }, { entity_id: this._config.settings_entity })
.catch(() => {});
}
}
// One-time migration into the new Store-backed home so every later
// _fetchSettings call finds it there directly. The to-do item itself is
// left exactly as-is - never deleted or cleared - in case anything ever
// needs to fall back to it again.
if (migrate && parsed) {
this._hass.connection
.sendMessagePromise({ type: "family_hub/set_settings", settings: this._settingsCache })
.catch(() => {});
}
} catch (e) {
if (!this._settingsCache) this._settingsCache = this._defaultSettings();
}
this._applySizeVars();
if (this._root) {
this._renderGrid();
this._renderLegend();
this._updateNavLabel();
this._renderCountdown();
}
}
_getSettings() {
return this._settingsCache || this._defaultSettings();
}
_getBlocks() {
return this._getSettings().blocks;
}
_getBlocksForDay(dayIndex) {
const settings = this._getSettings();
const blocks = settings.blocks.slice();
const isWeekend = dayIndex === 0 || dayIndex === 6;
if (settings.weekendBreakfast && isWeekend && !blocks.some((b) => /breakfast/i.test(b))) {
blocks.unshift("Breakfast");
}
return blocks;
}
_getPeople() {
const settings = this._getSettings();
if (Array.isArray(settings.people) && settings.people.length) {
const palette = ["#a9c6c2", "#dba99c", "#d9bf7e", "#a8bd93", "#b9a7c9", "#cf8f6c", "#a89a83"];
return settings.people.map((p, i) => ({
entity: p.entity,
name: p.name || p.entity,
color: p.color || palette[i % palette.length],
countdown: !!p.countdown,
badges: Array.isArray(p.badges) ? p.badges : [],
}));
}
return this._config.people.map((p) => ({ ...p, countdown: !!p.countdown }));
}
_colorByName(people) {
const map = {};
for (const p of people) {
const key = (p.name || p.entity || "").trim().toLowerCase();
if (!(key in map)) map[key] = p.color;
}
return map;
}
_colorFor(person, colorMap) {
const key = (person.name || person.entity || "").trim().toLowerCase();
return (colorMap && colorMap[key]) || person.color;
}
_layoutTimedEvents(events) {
const sorted = events.slice().sort((a, b) => a.start - b.start || a.end - b.end);
const clusters = [];
let current = [];
let clusterEnd = -Infinity;
for (const ev of sorted) {
if (current.length && ev.start.getTime() >= clusterEnd) {
clusters.push(current);
current = [];
clusterEnd = -Infinity;
}
current.push(ev);
if (ev.end.getTime() > clusterEnd) clusterEnd = ev.end.getTime();
}
if (current.length) clusters.push(current);
const result = [];
for (const cluster of clusters) {
const columns = [];
const colOf = new Map();
for (const ev of cluster) {
let placed = false;
for (let c = 0; c < columns.length; c++) {
if (columns[c] <= ev.start.getTime()) {
columns[c] = ev.end.getTime();
colOf.set(ev, c);
placed = true;
break;
}
}
if (!placed) {
columns.push(ev.end.getTime());
colOf.set(ev, columns.length - 1);
}
}
const totalCols = columns.length;
for (const ev of cluster) {
result.push({ ev, col: colOf.get(ev), totalCols });
}
}
return result;
}
_applyScrollLock() {
const settings = this._getSettings();
if (window.__familyCalendarApplyScrollLock) {
window.__familyCalendarApplyScrollLock(!!settings.scrollLocked);
}
}
_openModal(el) {
if (!el) return;
this._setupModalBackButtonHandling();
this._topModalZ = (this._topModalZ || 1006) + 1;
el.style.zIndex = String(this._topModalZ);
el.classList.add("open");
}
// Makes a mobile device's native back button/gesture (and a desktop
// browser's Back button, or Android's predictive-back swipe) close
// whatever modal is currently open, instead of navigating away from the
// dashboard or doing nothing - a real gap, since every modal in this card
// is a plain shadow-DOM overlay rather than something Home Assistant's
// own dialog-close-on-back handling already knows about. Wired once, off
// the single shared _openModal entry point every modal already goes
// through, so it automatically covers all of them (the full-screen
// Recipe Viewer, the day/dish editor, every picker, etc.) rather than
// needing to be added to each modal's own open method one by one.
//
// Approach: push one history entry per modal open (no URL change, just a
// marker state), and watch for any ".modal-overlay" losing its "open"
// class - whether that's from the physical Back button, the on-screen X/
// Back button, a Save/Cancel action, or a backdrop click - via a
// MutationObserver rather than hooking every individual _closeXxx method
// (there are ~20 of them, all a one-line classList.remove("open") with no
// other side effects - confirmed by inspection - so observing the class
// change is equivalent and far less invasive than touching every one).
// Closing it any way OTHER than the physical back button consumes
// (history.back()'s) the entry that was pushed for it, so a later real
// back-press doesn't land on a stale "modal open" marker for a modal
// that's already closed - which would otherwise take two back-presses in
// a row to actually leave the dashboard.
_setupModalBackButtonHandling() {
if (this._modalBackButtonSetup || !this._root) return;
this._modalBackButtonSetup = true;
this._closingModalFromPopState = false;
// Count of history.back() calls WE issued below (to consume a history
// entry for a modal closed by something other than the physical back
// button - an X/close button, a picker selection, Save/Cancel, etc.).
// Each such back() eventually fires its own "popstate" asynchronously,
// just like a real back-press does - and _handleModalPopState has no
// other way to tell the two apart. Without this counter, that
// self-inflicted popstate is misread as a real back-press and closes
// whatever modal happens to still be open at the time it arrives -
// e.g. picking a recipe in a Grocy picker stacked on top of the day
// editor calls _closeGrocyPicker() (closes only the picker), which
// nets to a single history.back() here; by the time its popstate
// lands, the picker is already closed, so _handleModalPopState finds
// the day editor underneath as "the open one" and closes THAT too -
// the editor appears to slam shut with the pick never visibly landing,
// even though the field was set correctly before the close. Each
// self-issued back() is paired 1:1, in order, with the popstate it
// causes, so a simple increment/decrement here correctly ignores only
// our own pops while still handling genuine back-presses (where the
// counter is 0) normally.
this._pendingProgrammaticBacks = 0;
this._boundHandleModalPopState = this._handleModalPopState.bind(this);
window.addEventListener("popstate", this._boundHandleModalPopState);
this._modalHistoryObserver = new MutationObserver((mutations) => {
// Net the whole batch before touching history at all, rather than
// acting eagerly per-mutation. MutationObserver delivers every class
// change that happened synchronously in one callback, and the + FAB's
// menu items close the picker overlay AND open the picked modal in
// the very same click handler - so a naive per-mutation handler sees
// both in one batch and calls history.back() (async - its popstate
// fires on a later tick) immediately followed by pushState (sync).
// By the time that back()'s popstate arrives, the new modal has
// already opened and pushed its own entry, so _handleModalPopState
// finds it in the open-overlays query and closes THAT instead - the
// modal appears to open then instantly slam shut. Netting first means
// a close-then-open in the same tick (depth unchanged) does neither
// back() nor pushState(), sidestepping the race entirely.
let opened = 0;
let closedNonPopstate = 0;
const seen = new Set();
for (const mutation of mutations) {
const el = mutation.target;
if (!el.classList || !el.classList.contains("modal-overlay") || seen.has(el)) continue;
seen.add(el);
const isOpen = el.classList.contains("open");
if (isOpen && !el.__fhHistoryPushed) {
el.__fhHistoryPushed = true;
opened++;
} else if (!isOpen && el.__fhHistoryPushed) {
el.__fhHistoryPushed = false;
if (!this._closingModalFromPopState) closedNonPopstate++;
}
}
const delta = opened - closedNonPopstate;
if (delta > 0) {
for (let i = 0; i < delta; i++) window.history.pushState({ familyHubModal: true }, "");
} else if (delta < 0) {
for (let i = 0; i < -delta; i++) {
// Mark this back() as self-issued BEFORE calling it, so the
// popstate it causes (arrives later, asynchronously) is ignored
// by _handleModalPopState instead of closing whatever modal is
// still open underneath. See the comment on
// this._pendingProgrammaticBacks in _setupModalBackButtonHandling.
this._pendingProgrammaticBacks++;
window.history.back();
}
}
});
this._modalHistoryObserver.observe(this._root, {
attributes: true,
attributeFilter: ["class"],
subtree: true,
});
}
_handleModalPopState() {
if (!this._root) return;
// This popstate may be the delayed result of a back() call WE issued
// (to consume a closed modal's history entry after a non-back-button
// close), not a real physical back-press - if so, there's nothing to
// close; the modal it was for is already closed, and closing whatever
// else happens to be open would be wrong (see the counter's comment
// in _setupModalBackButtonHandling).
if (this._pendingProgrammaticBacks > 0) {
this._pendingProgrammaticBacks--;
return;
}
const openOverlays = Array.from(this._root.querySelectorAll(".modal-overlay.open"));
if (!openOverlays.length) return; // nothing of ours open - let the back navigation proceed as normal
// Only the topmost (highest z-index) - matches what pressing the
// on-screen Back/X button on a stacked modal (e.g. a recipe preview
// opened over a Grocy picker) would do: dismiss just that top layer.
let top = openOverlays[0];
let topZ = parseInt(top.style.zIndex || "0", 10);
for (const el of openOverlays) {
const z = parseInt(el.style.zIndex || "0", 10);
if (z >= topZ) {
top = el;
topZ = z;
}
}
this._closingModalFromPopState = true;
top.classList.remove("open");
// The MutationObserver callback above runs as a microtask - scheduling
// the reset as a macrotask (not synchronously, and not another
// microtask) guarantees it fires after that callback has already read
// this flag, rather than racing it back to false first.
setTimeout(() => {
this._closingModalFromPopState = false;
}, 0);
}
_sizeVars(settings) {
const blockMap = {
small: { minHeight: "34px", padding: "4px 16px" },
medium: { minHeight: "42px", padding: "6px 20px" },
large: { minHeight: "56px", padding: "9px 24px" },
};
const b = blockMap[settings.blockSize] || blockMap.medium;
return { minHeight: b.minHeight, padding: b.padding };
}
_resolveTheme(settings) {
const local = settings.theme || this._defaultTheme();
if (!settings.useGlobalTheme || !settings.globalThemeId) return local;
const list = Array.isArray(this._globalThemes) ? this._globalThemes : [];
const g = list.find((t) => t && t.id === settings.globalThemeId);
if (!g) return local;
const defaultTheme = this._defaultTheme();
const colors = {};
Object.keys(defaultTheme.colors).forEach((k) => {
const v = g.colors && g.colors[k];
colors[k] = typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : defaultTheme.colors[k];
});
const fonts = {};
Object.keys(defaultTheme.fonts).forEach((k) => {
const raw = g.fonts && g.fonts[k];
const n = typeof raw === "number" ? raw : parseInt(raw, 10);
fonts[k] = Number.isFinite(n) && n >= 6 && n <= 72 ? n : defaultTheme.fonts[k];
});
return { colors, fonts, effects: g.effects || null, background: g.background || null };
}
_hexToRgba(hex, alpha) {
const h = (hex || "#000000").replace("#", "");
if (h.length !== 6) return "rgba(0,0,0,0)";
const r = parseInt(h.substr(0, 2), 16);
const g = parseInt(h.substr(2, 2), 16);
const b = parseInt(h.substr(4, 2), 16);
const a = Math.max(0, Math.min(1, typeof alpha === "number" ? alpha : 1));
return `rgba(${r}, ${g}, ${b}, ${a})`;
}
_buildBoxShadow(effects) {
if (!effects) return null;
const shadow = effects.shadow || {};
const glow = effects.glow || {};
const layers = [];
if (shadow.enabled !== false) {
layers.push(
`${shadow.offsetX || 0}px ${shadow.offsetY || 0}px ${shadow.blurRadius || 0}px ${shadow.spreadRadius || 0}px ${this._hexToRgba(shadow.color || "#000000", typeof shadow.opacity === "number" ? shadow.opacity : 0.16)}`
);
}
if (glow.enabled) {
layers.push(`0 0 ${glow.blurRadius || 0}px 0 ${this._hexToRgba(glow.color || "#ffd21a", typeof glow.opacity === "number" ? glow.opacity : 0.6)}`);
}
return layers.length ? layers.join(", ") : null;
}
async _fetchGlobalThemes() {
if (!this._hass) return;
try {
const result = await this._hass.connection.sendMessagePromise({ type: "theme_builder/list" });
this._globalThemes = (result && Array.isArray(result.themes)) ? result.themes : [];
this._globalThemesError = false;
} catch (e) {
this._globalThemes = [];
this._globalThemesError = true;
}
this._applySizeVars();
if (this._root && this._root.querySelector(".settings-overlay.open")) {
this._populateGlobalThemeSelect();
}
}
async _fetchNotifyConfig() {
if (!this._hass) return;
try {
const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_notify_config" });
this._notifyOverrides = (result && result.overrides && typeof result.overrides === "object") ? result.overrides : {};
this._notifyConfigError = false;
} catch (e) {
// Family Hub not installed, or an older version without this command -
// per-calendar notify selection just stays unavailable, nothing else breaks.
this._notifyOverrides = {};
this._notifyConfigError = true;
}
// _getPeople() (and therefore the initial settings draft) doesn't carry
// notify targets - they live in the config entry, not the todo blob - so
// merge them into the in-progress draft by entity once they arrive.
if (Array.isArray(this._settingsPeopleDraft)) {
this._settingsPeopleDraft.forEach((p) => {
const saved = p.entity && this._notifyOverrides[p.entity];
p.notify = Array.isArray(saved) ? saved.slice() : [];
});
}
const savedReminderNotify = this._notifyOverrides[this._config.reminders_entity];
this._settingsReminderNotifyDraft = Array.isArray(savedReminderNotify) ? savedReminderNotify.slice() : [];
// Daily Digest recipients reuse this same per-target notify-overrides map
// (a synthetic key, same trick as reminders' own row) rather than a
// separate card-settings field, so Settings > Calendars/Reminders/Digest
// notify pickers and the backend's actual send logic always agree.
const savedDigestNotify = this._notifyOverrides["__family_hub_digest__"];
this._settingsDigestNotifyDraft = Array.isArray(savedDigestNotify) ? savedDigestNotify.slice() : [];
if (this._root && this._root.querySelector(".settings-overlay.open")) {
this._populatePersonNotifyButtons(this._settingsPeopleDraft);
if (this._notifyDevicesEditIdx !== undefined && this._notifyDevicesEditIdx !== null) {
this._renderNotifyDevicesModal();
}
}
}
async _saveNotifyOverrides(overrides) {
if (!this._hass) return;
try {
await this._hass.connection.sendMessagePromise({ type: "family_hub/set_notify_overrides", overrides });
this._notifyOverrides = overrides;
this._notifyConfigError = false;
} catch (e) {
// Best-effort - the rest of Settings (people, badges, theme, etc.) still saves fine.
this._notifyConfigError = true;
}
}
_populateGlobalThemeSelect() {
const root = this._root;
const select = root.querySelector(".global-theme-select");
const status = root.querySelector(".global-theme-status");
if (!select || !status) return;
const settings = this._getSettings();
if (this._globalThemesError) {
select.innerHTML = "";
status.textContent = "Theme Builder integration not found on this Home Assistant — install it to enable global themes.";
status.style.display = "";
return;
}
const list = Array.isArray(this._globalThemes) ? this._globalThemes : [];
if (!list.length) {
select.innerHTML = "";
status.textContent = "No themes found in Theme Builder yet.";
status.style.display = "";
return;
}
status.style.display = "none";
select.innerHTML = list.map((t) => `<option value="${t.id}">${(t.name || t.id || "").toString()}</option>`).join("");
const hasCurrent = list.some((t) => t.id === settings.globalThemeId);
select.value = hasCurrent ? settings.globalThemeId : list[0].id;
}
_updateGlobalThemeVisibility(isOn) {
const root = this._root;
const select = root.querySelector(".global-theme-select");
const status = root.querySelector(".global-theme-status");
root.querySelectorAll(".theme-local-fields").forEach((el) => {
el.style.display = isOn ? "none" : "";
});
if (select) select.style.display = isOn ? "" : "none";
if (isOn) {
if (!Array.isArray(this._globalThemes) && !this._globalThemesError) {
if (status) {
status.textContent = "Loading themes…";
status.style.display = "";
}
this._fetchGlobalThemes();
} else {
this._populateGlobalThemeSelect();
}
} else if (status) {
status.style.display = "none";
}
}
// Local (device) date, not UTC - so the swap lines up with what "today"
// actually looks like on the tablet/dashboard, not some other timezone's
// Oct 31 that may already be Nov 1 (or not yet Oct 31) locally.
_isHalloweenToday() {
const now = new Date();
return now.getMonth() === 9 && now.getDate() === 31;
}
_applySizeVars() {
const settings = this._getSettings();
const v = this._sizeVars(settings);
this.style.setProperty("--menu-block-min-height", v.minHeight);
this.style.setProperty("--menu-block-padding", v.padding);
const theme = this._resolveTheme(settings);
this.style.setProperty("--fc-bg", theme.colors.bg);
this.style.setProperty("--fc-card", theme.colors.card);
this.style.setProperty("--fc-border", theme.colors.border);
this.style.setProperty("--fc-text", theme.colors.text);
this.style.setProperty("--fc-text-secondary", theme.colors.textSecondary);
this.style.setProperty("--fc-accent", theme.colors.accent);
this.style.setProperty("--fc-accent-text", theme.colors.accentText);
this.style.setProperty("--fc-accent2", theme.colors.accent2);
this.style.setProperty("--fc-accent3", theme.colors.accent3);
this.style.setProperty("--fc-surface-alt", theme.colors.surfaceAlt);
this.style.setProperty("--fc-surface2", theme.colors.surface2);
this.style.setProperty("--fs-day-name", `${theme.fonts.dayName}px`);
this.style.setProperty("--fs-day-number", `${theme.fonts.dayNumber}px`);
this.style.setProperty("--fs-wx-temp", `${theme.fonts.wxTemp}px`);
this.style.setProperty("--fs-event", `${theme.fonts.event}px`);
this.style.setProperty("--fs-chip", `${theme.fonts.chip}px`);
this.style.setProperty("--fs-header-title", `${theme.fonts.headerTitle}px`);
this.style.setProperty("--fs-countdown", `${theme.fonts.countdown}px`);
this.style.setProperty("--menu-label-font-size", `${theme.fonts.blockLabel}px`);
this.style.setProperty("--menu-font-size", `${theme.fonts.blockMeal}px`);
const shadowCss = this._buildBoxShadow(theme.effects);
if (shadowCss) {
this.style.setProperty("--fc-shadow", shadowCss);
} else {
this.style.removeProperty("--fc-shadow");
}
// Halloween override: takes over whatever background the theme is
// otherwise configured with for just the one day, then gets out of the
// way again on its own the next time this runs (nothing is saved to
// settings, so there's nothing to revert).
const bg = this._isHalloweenToday()
? { image: HALLOWEEN_BG_IMAGE, size: "cover", position: "center", blur: 0, opacity: 1, overlayColor: "#000000", overlayOpacity: 0 }
: theme.background;
if (bg && bg.image) {
this.style.setProperty("--fc-bg-image", `url("${bg.image.replace(/"/g, '\\"')}")`);
this.style.setProperty("--fc-bg-size", bg.size === "repeat" ? "auto" : bg.size || "cover");
this.style.setProperty("--fc-bg-position", bg.position || "center");
this.style.setProperty("--fc-bg-blur", `${bg.blur || 0}px`);
this.style.setProperty("--fc-bg-image-opacity", typeof bg.opacity === "number" ? bg.opacity : 1);
this.style.setProperty("--fc-bg-overlay-image", `linear-gradient(${this._hexToRgba(bg.overlayColor || "#000000", bg.overlayOpacity || 0)}, ${this._hexToRgba(bg.overlayColor || "#000000", bg.overlayOpacity || 0)})`);
} else {
this.style.removeProperty("--fc-bg-image");
this.style.removeProperty("--fc-bg-size");
this.style.removeProperty("--fc-bg-position");
this.style.removeProperty("--fc-bg-blur");
this.style.removeProperty("--fc-bg-image-opacity");
this.style.removeProperty("--fc-bg-overlay-image");
}
this._applyScrollLock();
}
async _fetchEvents() {
if (!this._hass) return;
const fetchId = ++this._eventsFetchSeq;
let start, end;
if (this._viewMode === "month") {
const range = this._monthGridRange();
start = range.gridStart;
end = range.gridEnd;
} else {
start = this._weekStart();
end = new Date(start);
end.setDate(start.getDate() + 7);
}
const startIso = start.toISOString();
const endIso = end.toISOString();
const people = this._getPeople();
const newEvents = {};
const newErrors = {};
await Promise.all(
people.map(async (person) => {
try {
const events = await this._hass.callApi(
"GET",
`calendars/${person.entity}?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`
);
newEvents[person.entity] = events || [];
} catch (e) {
newEvents[person.entity] = [];
newErrors[person.entity] = (e && (e.message || e.body || e.error)) || String(e);
}
})
);
if (fetchId !== this._eventsFetchSeq) return;
Object.assign(this._events, newEvents);
for (const entity of Object.keys(newEvents)) {
if (newErrors[entity]) this._fetchErrors[entity] = newErrors[entity];
else delete this._fetchErrors[entity];
}
this._renderGrid();
this._renderLegend();
this._updateNavLabel();
if (this._root.querySelector(".debug-overlay.open")) this._renderDebug();
}
async _fetchWeather() {
if (!this._hass || !this._config.weather_entity) return;
try {
const result = await this._hass.connection.sendMessagePromise({
type: "call_service",
domain: "weather",
service: "get_forecasts",
service_data: { type: "daily" },
target: { entity_id: this._config.weather_entity },
return_response: true,
});
const bucket = result && result.response && result.response[this._config.weather_entity];
const forecasts = (bucket && bucket.forecast) || [];
const map = {};
for (const f of forecasts) {
const dateKey = (f.datetime || "").slice(0, 10);
if (!dateKey) continue;
map[dateKey] = {
condition: f.condition,
high: f.temperature,
low: f.templow,
};
}
this._forecast = map;
} catch (e) {
this._forecast = {};
}
this._renderGrid();
}
async _fetchCountdown() {
if (!this._hass) return;
const settings = this._getSettings();
if (!settings.countdownEnabled) {
this._countdown = null;
this._renderCountdown();
return;
}
const candidates = [];
const today = new Date();
today.setHours(0, 0, 0, 0);
const countdownPeople = this._getPeople().filter((p) => p.countdown);
if (countdownPeople.length) {
const start = new Date();
const end = new Date();
end.setDate(end.getDate() + 366);
await Promise.all(
countdownPeople.map(async (person) => {
try {
const evs = await this._hass.callApi(
"GET",
`calendars/${person.entity}?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`
);
for (const ev of evs || []) {
const d = this._toDate(ev.start);
if (!d) continue;
const dd = new Date(d);
dd.setHours(0, 0, 0, 0);
if (dd < today) continue;
const isBirthday = person.entity === this._config.birthdays_entity || /birthday/i.test(ev.summary || "");
const label = isBirthday
? (ev.summary || "").replace(/[’']s\s*birthday/i, "").replace(/\s*birthday/i, "").trim() || ev.summary
: ev.summary || "(untitled)";
candidates.push({ date: dd, label, icon: isBirthday ? "\u{1F382}" : "\u{1F4C5}" });
}
} catch (e) {
}
})
);
}
// Every custom "use as countdown" pick is its own list entry (not one
// shared slot), which is what actually gives the ticker more than one
// thing to cycle through.
for (const item of settings.countdownItems || []) {
const d = new Date(item.date + "T00:00:00");
if (isNaN(d.getTime())) continue;
d.setHours(0, 0, 0, 0);
if (d < today) continue;
candidates.push({ icon: "\u{1F389}", label: item.label, date: d, id: item.id });
}
candidates.sort((a, b) => a.date - b.date);
this._countdown = candidates[0] || null;
this._countdownList = candidates;
this._renderCountdown();
}
_renderCountdown() {
if (!this._root) return;
const el = this._root.querySelector(".countdown-line");
if (!el) return;
const settings = this._getSettings();
const list = this._countdownList || (this._countdown ? [this._countdown] : []);
if (!list.length) {
el.textContent = "";
this._stopCountdownTicker();
return;
}
if (settings.countdownTicker && list.length > 1) {
this._startCountdownTicker(list);
} else {
this._stopCountdownTicker();
this._countdownTickerIndex = 0;
this._renderCountdownItem(list[0]);
}
}
_renderCountdownItem(item) {
if (!this._root) return;
const el = this._root.querySelector(".countdown-line");
if (!el || !item) return;
const today = new Date();
today.setHours(0, 0, 0, 0);
const days = Math.round((item.date - today) / 86400000);
const when = days === 0 ? "today!" : days === 1 ? "tomorrow" : `in ${days} days`;
el.textContent = `${item.icon} ${item.label} ${when}`;
}
_startCountdownTicker(list) {
this._stopCountdownTicker();
this._countdownTickerIndex = 0;
this._renderCountdownItem(list[0]);
this._countdownTickerInterval = setInterval(() => {
if (!this._root || !this.isConnected) {
this._stopCountdownTicker();
return;
}
const settings = this._getSettings();
const currentList = this._countdownList || [];
if (!settings.countdownTicker || currentList.length <= 1) {
this._stopCountdownTicker();
this._renderCountdownItem(currentList[0] || null);
return;
}
this._countdownTickerIndex = (this._countdownTickerIndex + 1) % currentList.length;
this._renderCountdownItem(currentList[this._countdownTickerIndex]);
}, 5000);
}
_stopCountdownTicker() {
if (this._countdownTickerInterval) {
clearInterval(this._countdownTickerInterval);
this._countdownTickerInterval = null;
}
}
_wxIcon(condition) {
const map = {
"clear-night": "\u{1F319}",
cloudy: "\u{2601}\u{FE0F}",
fog: "\u{1F32B}\u{FE0F}",
hail: "\u{1F328}\u{FE0F}",
lightning: "\u{26C8}\u{FE0F}",
"lightning-rainy": "\u{26C8}\u{FE0F}",
partlycloudy: "\u{26C5}",
pouring: "\u{1F327}\u{FE0F}",
rainy: "\u{1F327}\u{FE0F}",
snowy: "\u{2744}\u{FE0F}",
"snowy-rainy": "\u{1F328}\u{FE0F}",
sunny: "\u{2600}\u{FE0F}",
windy: "\u{1F4A8}",
"windy-variant": "\u{1F4A8}",
exceptional: "\u{26A0}\u{FE0F}",
};
return map[condition] || "\u{1F321}\u{FE0F}";
}
_parseDishDescription(raw) {
if (!raw) return { description: "", link: "", rating: null, color: null, block: 0, recur: null, grocyRecipeId: null, servings: null, category: "", image: "" };
try {
const parsed = JSON.parse(raw);
return {
description: parsed.description || "",
link: parsed.link || "",
rating: parsed.rating || null,
color: parsed.color || null,
// Recipe Box-only fields (see _upsertDish) - harmlessly blank on
// every other kind of item this same parser also handles (a planned
// meal, a recurring-meal anchor, a suggestion), since none of those
// ever set them.
category: parsed.category || "",
image: parsed.image || "",
block: typeof parsed.block === "number" ? parsed.block : 0,
// "weekly" if this meal-plan entry is the anchor of a "repeat weekly"
// meal - see _getMealForDay for how that anchor gets projected onto
// every future week's matching day-of-week + block.
recur: parsed.recur || null,
// Set only for suggestions added via "Add from Grocy" - lets the
// suggestions list open the in-card Recipe Viewer (which fetches
// live from Grocy) instead of just opening the plain link, which
// would hit Grocy's own login wall (see _openGrocyRecipeViewer).
grocyRecipeId: parsed.grocyRecipeId || null,
// How many people this specific planned meal is meant to feed - only
// meaningful alongside grocyRecipeId. null means "use whatever the
// Grocy recipe's own desired_servings is currently set to" rather
// than any specific number - see _ws_push_grocery_list's docstring
// for how this becomes a real (persistent) edit to the recipe in
// Grocy at push time.
servings: typeof parsed.servings === "number" ? parsed.servings : null,
};
} catch (e) {
return { description: raw, link: "", rating: null, color: null, block: 0, recur: null, grocyRecipeId: null, servings: null, category: "", image: "" };
}
}
async _getItems(entityId) {
const result = await this._hass.connection.sendMessagePromise({
type: "call_service",
domain: "todo",
service: "get_items",
service_data: { status: ["needs_action", "completed"] },
target: { entity_id: entityId },
return_response: true,
});
return (result && result.response && result.response[entityId] && result.response[entityId].items) || [];
}
// Reminders live as items on a Home Assistant to-do list (reminders_entity),
// not as calendar events - so unlike the calendar/people fetches above,
// there's no description marker to parse and nothing calendar-specific
// about identity: each item's own uid + due datetime is the source of
// truth, and it stays that way even if the item gets renamed or
// rescheduled directly in Home Assistant's own To-do UI.
async _fetchReminders() {
if (!this._hass) return;
try {
const items = await this._getItems(this._config.reminders_entity);
this._reminders = items
.filter((it) => it.status === "needs_action" && it.due)
.map((it) => {
const parsed = this._parseReminderRollover(it.description || "");
return {
uid: it.uid,
summary: it.summary || "(untitled)",
due: new Date(it.due),
description: parsed.description,
rollover: parsed.rollover,
};
})
.filter((r) => !isNaN(r.due.getTime()));
} catch (e) {
// Family Hub not installed, or the configured to-do list doesn't exist
// yet - reminders just stay unavailable, nothing else breaks.
this._reminders = [];
}
this._renderGrid();
this._renderLegend();
}
async _markReminderDone(uid) {
if (!this._hass || !uid) return;
try {
await this._hass.callService(
"todo",
"update_item",
{ item: uid, status: "completed" },
{ entity_id: this._config.reminders_entity }
);
} catch (e) {
}
this._fetchReminders();
}
// Best-effort, fire-and-forget: lets the backend poller know which to-do
// list to check for due reminders, without requiring anyone to type the
// entity id into Configure by hand. Safe to call even if Family Hub (the
// backend integration) isn't installed - the card's own reminders display
// never depends on this succeeding, only server-side notifications do.
async _syncRemindersEntity() {
if (!this._hass || !this._config.reminders_entity) return;
try {
await this._hass.connection.sendMessagePromise({
type: "family_hub/set_reminders_entity",
entity_id: this._config.reminders_entity,
});
} catch (e) {
}
}
// Best-effort, fire-and-forget: the Daily Digest actually fires from the
// backend's own poll loop (so it goes out whether or not anyone has the
// dashboard open), which means the backend needs to know whether it's
// enabled and what time to send it at - it can't read the card's settings
// to-do item itself. Sent once per session on load and again every time
// Settings is saved, so the backend never runs stale. The recipient list
// isn't part of this call - that's synced separately, the same way
// Reminders' notify devices are, via family_hub/set_notify_overrides.
async _syncDailyDigestConfig() {
if (!this._hass) return;
const settings = this._getSettings();
try {
await this._hass.connection.sendMessagePromise({
type: "family_hub/set_daily_digest",
enabled: !!settings.dailyDigestEnabled,
time: settings.dailyDigestTime || "07:00",
meal_plan_entity: this._config.meal_plan_entity || "",
});
} catch (e) {
}
}
// Same reasoning as _syncDailyDigestConfig just above: the Daily Digest's
// expiring-items counts come from the backend's own poll loop, not the
// card, so it needs this opt-in flag in its config entry options
// independent of the card's own Settings Store copy. Sent once per
// session on load and again every time Settings is saved.
async _syncGrocyExpiringConfig() {
if (!this._hass) return;
const settings = this._getSettings();
try {
await this._hass.connection.sendMessagePromise({
type: "family_hub/set_grocy_expiring_enabled",
enabled: !!settings.grocyExpiringEnabled,
digest_enabled: !!settings.grocyExpiringDigestEnabled,
});
} catch (e) {
}
}
// Same reasoning as _syncGrocyExpiringConfig just above, for the separate
// "Low Stock" opt-in.
async _syncGrocyLowStockConfig() {
if (!this._hass) return;
const settings = this._getSettings();
try {
await this._hass.connection.sendMessagePromise({
type: "family_hub/set_grocy_low_stock_enabled",
enabled: !!settings.grocyLowStockEnabled,
digest_enabled: !!settings.grocyLowStockDigestEnabled,
});
} catch (e) {
}
}
// Best-effort, fire-and-forget: the backend (not the card) is what
// actually calls notify.* for reminders/events/Daily Digest, so it needs
// to know what relative dashboard path to stamp onto each notification's
// data.url (iOS)/data.clickAction (Android) so tapping it opens the right
// place instead of just launching the app to whatever it was last on.
// Sent once per session on load and again every time Settings is saved.
async _syncNotificationClickPath() {
if (!this._hass) return;
const settings = this._getSettings();
try {
await this._hass.connection.sendMessagePromise({
type: "family_hub/set_notification_click_path",
path: settings.notificationClickPath || "",
});
} catch (e) {
}
}
// Recipe Box moved off its old todo.recipe_box list onto a Store-backed
// list (family_hub/get_recipes + set_recipes) - a recipe's category,
// photo, Grocy link, and rating no longer live as JSON crammed into a
// to-do item's description with the "done" checkbox repurposed to mean
// "loved" (same reasoning as the earlier Settings migration - nobody
// manages their Recipe Box through Home Assistant's own to-do UI or
// voice assistants, so there was no upside to the to-do item, just
// fragility). The backend flags whether this household's store has ever
// been migrated; the very first time it hasn't, this reads the legacy
// to-do list once (if recipe_entity is even configured - fine either way
// if not) and immediately persists the result, so every later load skips
// the to-do lookup entirely. The old to-do items are never touched again.
async _fetchRecipes() {
if (!this._hass) return;
try {
const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_recipes" });
if (!result.migrated) {
const items = this._config.recipe_entity ? await this._getItems(this._config.recipe_entity) : [];
this._recipes = items.map((it) => {
const parsed = this._parseDishDescription(it.description);
return {
uid: it.uid,
name: it.summary,
description: parsed.description,
link: parsed.link,
rating: parsed.rating,
grocyRecipeId: parsed.grocyRecipeId,
category: parsed.category,
image: parsed.image,
};
});
await this._persistRecipes();
} else {
this._recipes = result.recipes || [];
}
} catch (e) {
this._recipes = [];
}
this._renderLoved();
this._renderGrid();
}
// Saves the full Recipe Box list in one shot - the card keeps the
// authoritative in-memory array (this._recipes) and just re-persists all
// of it after every add/edit/delete, same "set the whole blob" pattern
// Settings already uses, rather than fine-grained per-item mutation
// endpoints.
async _persistRecipes() {
if (!this._hass) return;
try {
await this._hass.connection.sendMessagePromise({ type: "family_hub/set_recipes", recipes: this._recipes });
} catch (e) {
}
}
// Meal Suggestions moved off its old todo.meal_suggestions list onto a
// Store-backed list (family_hub/get_suggestions + set_suggestions) - same
// reasoning and same lazy one-time migration pattern as _fetchRecipes
// just above (see its comment for the full explanation).
async _fetchSuggestions() {
if (!this._hass) return;
try {
const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_suggestions" });
if (!result.migrated) {
const items = this._config.suggestions_entity ? await this._getItems(this._config.suggestions_entity) : [];
this._suggestions = items.map((it) => {
const parsed = this._parseDishDescription(it.description);
return { uid: it.uid, name: it.summary, description: parsed.description, link: parsed.link, grocyRecipeId: parsed.grocyRecipeId };
});
await this._persistSuggestions();
} else {
this._suggestions = result.suggestions || [];
}
} catch (e) {
this._suggestions = [];
}
// No standalone Suggestions modal to re-render into anymore - "viewing
// suggestions" is just the Recipe Box's own "💡 Suggested" filter now
// (_openSuggestedRecipes), which reads this._suggestions fresh each time
// it renders rather than needing a push here.
}
async _persistSuggestions() {
if (!this._hass) return;
try {
await this._hass.connection.sendMessagePromise({ type: "family_hub/set_suggestions", suggestions: this._suggestions });
} catch (e) {
}
}
// Every path that creates a suggestion now runs through here - the
// Recipe Box's own 💡 toggle (_suggestDish, which already skips this
// entirely for an exact-name match by removing instead), and the dish
// editor's "Also add to Meal Suggestions" checkbox, which has no such
// pre-check of its own. Deduping here once, in the single write path,
// means neither caller has to remember to do it themselves. An
// already-normalized-identical suggestion (same name ignoring case/
// punctuation/whitespace) is skipped outright - it's unambiguously the
// same idea. Anything merely close (a likely typo, not a different dish)
// gets a confirm() instead of a silent block, since a fuzzy match can
// occasionally be wrong and the household should get the final say.
async _addSuggestion(name, description, link, grocyRecipeId) {
if (!name) return;
const dupe = this._findFuzzyDuplicate(name, this._suggestions, (s) => s.name);
if (dupe) {
const isExact = this._normalizeForDuplicateCheck(dupe.name) === this._normalizeForDuplicateCheck(name);
if (isExact) return;
if (!window.confirm(`"${dupe.name}" is already suggested and looks very similar. Add "${name}" as a separate suggestion anyway?`)) {
return;
}
}
this._suggestions.push({ uid: this._genId(), name, description: description || "", link: link || "", grocyRecipeId: grocyRecipeId || null });
await this._persistSuggestions();
}
async _removeSuggestion(uid) {
if (!uid) return;
this._suggestions = this._suggestions.filter((s) => s.uid !== uid);
await this._persistSuggestions();
}
async _fetchMealPlan() {
if (!this._hass) return;
try {
const items = await this._getItems(this._config.meal_plan_entity);
const map = {};
const recurring = [];
for (const it of items) {
const dateKey = (it.due || "").slice(0, 10);
if (!dateKey) continue;
const parsed = this._parseDishDescription(it.description);
const blockIndex = parsed.block || 0;
if (!map[dateKey]) map[dateKey] = {};
map[dateKey][blockIndex] = {
uid: it.uid,
name: it.summary,
description: parsed.description,
link: parsed.link,
color: parsed.color,
recur: parsed.recur,
grocyRecipeId: parsed.grocyRecipeId,
servings: parsed.servings,
};
if (parsed.recur === "weekly") {
// The anchor's own weekday (parsed from its due date, not "today")
// is what every future week's projection is matched against - see
// _getMealForDay.
const anchorDate = new Date(`${dateKey}T00:00:00`);
recurring.push({
uid: it.uid,
weekday: anchorDate.getDay(),
blockIndex,
name: it.summary,
description: parsed.description,
link: parsed.link,
color: parsed.color,
anchorDateKey: dateKey,
grocyRecipeId: parsed.grocyRecipeId,
servings: parsed.servings,
});
}
}
this._mealPlan = map;
this._recurringMeals = recurring;
} catch (e) {
this._mealPlan = {};
this._recurringMeals = [];
}
this._renderGrid();
}
// Resolves what should show for a given day/block: an explicit meal-plan
// entry for that exact date if one exists (this always wins, whether it's
// the "repeat weekly" anchor itself or a one-off override created to
// replace what would otherwise repeat), otherwise the nearest "repeat
// weekly" anchor whose weekday + block match and whose own date is on or
// before this one (a recurring meal only ever projects forward from the
// week it was first set on, never backward). Returns null if neither
// applies - an ordinary empty slot.
_getMealForDay(dateKey, dayDate, blockIndex) {
const explicit = this._mealPlan[dateKey] && this._mealPlan[dateKey][blockIndex];
if (explicit) return explicit;
const weekday = dayDate.getDay();
let best = null;
for (const t of this._recurringMeals || []) {
if (t.weekday !== weekday || t.blockIndex !== blockIndex) continue;
if (dateKey < t.anchorDateKey) continue;
if (!best || t.anchorDateKey > best.anchorDateKey) best = t;
}
if (!best) return null;
return {
uid: best.uid,
name: best.name,
description: best.description,
link: best.link,
color: best.color,
recur: "weekly",
grocyRecipeId: best.grocyRecipeId,
servings: best.servings,
// Distinguishes "this is a projection of an anchor set on some earlier
// date" from an explicit entry (which may itself be the anchor) - the
// day editor uses this to decide whether saving a change should ask
// "just this day, or every future week too?".
recurring: true,
anchorDateKey: best.anchorDateKey,
};
}
// checkDuplicates defaults off because this same function is also the
// day/menu editor's "mirror this planned meal into the Recipe Box" call
// (see _saveEditor) - that fires on every single meal-plan save, and a
// confirm() popup interrupting routine weekly planning over a merely-
// similar name would be far more annoying than the rare accidental
// duplicate it might catch. The deliberate "I'm adding/importing a
// recipe" entry points (_saveDishEditor, the Recipe Box's "Add from
// Grocy" picker) opt in explicitly instead, since that's where a near-
// duplicate is actually likely and a nudge is welcome, not disruptive.
async _upsertDish(name, description, link, rating, uidOverride, grocyRecipeId, category, image, checkDuplicates) {
if (!name) return;
const existing = uidOverride
? this._recipes.find((r) => r.uid === uidOverride)
: this._recipes.find((r) => r.name.toLowerCase() === name.toLowerCase());
// Only worth asking about when this is about to become a genuinely new
// Recipe Box entry - an exact-name match above already merges in place
// (existing truthy), and that's the desired behavior, not a duplicate to
// warn about. This is the same fuzzy check _addSuggestion uses, applied
// to the household's actual data gap that prompted it: Grocy recipes and
// hand-typed entries piling up as separate near-identical cards ("Our
// Favorite Buttery Herb Stuffing" vs "...Stuffing4") with no nudge that
// one might already exist.
if (!existing && checkDuplicates) {
const dupe = this._findFuzzyDuplicate(name, this._recipes, (r) => r.name);
if (dupe && !window.confirm(`"${dupe.name}" is already in your Recipe Box and looks very similar. Add "${name}" as a separate recipe anyway?`)) {
return;
}
}
// category/image are Recipe Box-only fields that not every caller knows
// about - the day/menu editor's "also save this as a loved dish" path
// (see _saveEditor) calls this without them, and a heart click straight
// from a Recipe Box card (see _renderLoved) only ever wants to flip the
// rating, not silently blank out a category or photo someone already
// set. Passing undefined here means "leave it alone" (falls back to
// whatever the existing entry already had); pass an empty string
// explicitly to actually clear one.
const finalCategory = category !== undefined ? category : (existing ? existing.category || "" : "");
const finalImage = image !== undefined ? image : (existing ? existing.image || "" : "");
const record = {
uid: existing ? existing.uid : this._genId(),
name,
description: description || "",
link: link || "",
rating: rating || null,
grocyRecipeId: grocyRecipeId || null,
category: finalCategory,
image: finalImage,
};
if (existing) {
this._recipes[this._recipes.indexOf(existing)] = record;
} else {
this._recipes.push(record);
}
await this._persistRecipes();
this._renderLoved();
this._renderGrid();
}
async _upsertMealPlan(dateKey, blockIndex, name, description, link, color, recur, grocyRecipeId, servings) {
const payload = JSON.stringify({ description, link, color, block: blockIndex, recur: recur || null, grocyRecipeId: grocyRecipeId || null, servings: typeof servings === "number" ? servings : null });
// Deliberately keyed off the EXPLICIT entry for this exact date, not
// _getMealForDay's projection - if this date only has a projected
// "repeat weekly" meal showing (no concrete item due here yet), this
// creates a brand new one-off item that overrides just this date,
// leaving the original weekly repeat (and every other week it still
// projects onto) untouched.
const existing = this._mealPlan[dateKey] && this._mealPlan[dateKey][blockIndex];
try {
if (existing) {
await this._hass.callService("todo", "update_item", {
item: existing.uid,
rename: name,
description: payload,
due_date: dateKey,
}, { entity_id: this._config.meal_plan_entity });
} else {
await this._hass.callService("todo", "add_item", {
item: name,
due_date: dateKey,
description: payload,
}, { entity_id: this._config.meal_plan_entity });
}
} catch (e) {
}
this._fetchMealPlan();
}
// Updates a meal-plan entry by its to-do uid directly, WITHOUT touching
// due_date - used to edit a "repeat weekly" meal's anchor item itself (so
// the change applies to every future week it projects onto) as opposed to
// _upsertMealPlan, which always targets one specific date.
async _upsertMealPlanByUid(uid, blockIndex, name, description, link, color, recur, grocyRecipeId, servings) {
if (!uid) return;
const payload = JSON.stringify({ description, link, color, block: blockIndex, recur: recur || null, grocyRecipeId: grocyRecipeId || null, servings: typeof servings === "number" ? servings : null });
try {
await this._hass.callService("todo", "update_item", {
item: uid,
rename: name,
description: payload,
}, { entity_id: this._config.meal_plan_entity });
} catch (e) {
}
this._fetchMealPlan();
}
// Whole-week meal templates: each saved template is one to-do item on
// meal_templates_entity, its description JSON-encoding every populated
// day/block slot from the week it was saved from (day-of-week indexed 0-6,
// not tied to any specific date, so the same template can be applied to
// any week later).
async _fetchMealTemplates() {
if (!this._hass) return;
try {
const items = await this._getItems(this._config.meal_templates_entity);
this._mealTemplates = items.map((it) => {
let blocks = [];
try {
const parsed = JSON.parse(it.description || "{}");
blocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
} catch (e) {
blocks = [];
}
return { uid: it.uid, name: it.summary, blocks };
});
} catch (e) {
this._mealTemplates = [];
}
this._renderMealTemplates();
}
_currentWeekMealBlocks() {
const start = this._weekStart();
const blocks = [];
for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
const dayDate = new Date(start);
dayDate.setDate(start.getDate() + dayIndex);
const dateKey = this._dateKey(dayDate);
const dayBlocks = this._getBlocksForDay(dayIndex);
dayBlocks.forEach((blockName, blockIndex) => {
const m = this._getMealForDay(dateKey, dayDate, blockIndex);
if (!m || !m.name || !m.name.trim()) return;
blocks.push({
dayIndex,
blockIndex,
date: dateKey,
name: m.name,
description: m.description || "",
link: m.link || "",
color: m.color || "",
grocyRecipeId: m.grocyRecipeId || null,
servings: typeof m.servings === "number" ? m.servings : null,
});
});
}
return blocks;
}
async _saveMealTemplate(name) {
if (!name) return;
const blocks = this._currentWeekMealBlocks();
try {
await this._hass.callService("todo", "add_item", {
item: name,
description: JSON.stringify({ blocks }),
}, { entity_id: this._config.meal_templates_entity });
} catch (e) {
}
this._fetchMealTemplates();
}
async _applyMealTemplate(template) {
if (!template || !Array.isArray(template.blocks)) return;
const start = this._weekStart();
for (const b of template.blocks) {
const dayDate = new Date(start);
dayDate.setDate(start.getDate() + b.dayIndex);
const dateKey = this._dateKey(dayDate);
await this._upsertMealPlan(dateKey, b.blockIndex, b.name, b.description || "", b.link || "", b.color || "", null, b.grocyRecipeId || null, typeof b.servings === "number" ? b.servings : null);
}
}
async _deleteMealTemplate(uid) {
if (!uid) return;
try {
await this._hass.callService("todo", "remove_item", {
item: uid,
}, { entity_id: this._config.meal_templates_entity });
} catch (e) {
}
this._fetchMealTemplates();
}
async _removeMealPlan(dateKey, blockIndex) {
const existing = this._mealPlan[dateKey] && this._mealPlan[dateKey][blockIndex];
if (!existing) return;
try {
await this._hass.callService("todo", "remove_item", {
item: existing.uid,
}, { entity_id: this._config.meal_plan_entity });
} catch (e) {
}
this._fetchMealPlan();
}
async _moveMealPlan(fromDateKey, fromBlockIndex, toDateKey, toBlockIndex) {
if (fromDateKey === toDateKey && fromBlockIndex === toBlockIndex) return;
const source = this._mealPlan[fromDateKey] && this._mealPlan[fromDateKey][fromBlockIndex];
if (!source) return;
const dest = this._mealPlan[toDateKey] && this._mealPlan[toDateKey][toBlockIndex];
try {
const sourcePayload = JSON.stringify({ description: source.description, link: source.link, color: source.color, block: toBlockIndex, recur: source.recur || null, grocyRecipeId: source.grocyRecipeId || null, servings: typeof source.servings === "number" ? source.servings : null });
await this._hass.callService("todo", "update_item", {
item: source.uid,
rename: source.name,
description: sourcePayload,
due_date: toDateKey,
}, { entity_id: this._config.meal_plan_entity });
if (dest) {
const destPayload = JSON.stringify({ description: dest.description, link: dest.link, color: dest.color, block: fromBlockIndex, recur: dest.recur || null, grocyRecipeId: dest.grocyRecipeId || null, servings: typeof dest.servings === "number" ? dest.servings : null });
await this._hass.callService("todo", "update_item", {
item: dest.uid,
rename: dest.name,
description: destPayload,
due_date: fromDateKey,
}, { entity_id: this._config.meal_plan_entity });
}
} catch (e) {
}
this._fetchMealPlan();
}
_toDate(part) {
if (!part) return null;
if (part.dateTime) return new Date(part.dateTime);
if (part.date) return new Date(part.date + "T00:00:00");
return null;
}
// Opens a separate, minimal print window containing just the currently
// visible grid (week or month, whichever mode is active) - not the whole
// dashboard page, since that would print every other card too. Theme
// colors are carried over by copying this card's own inline custom
// properties (set via this.style.setProperty in _applyTheme) onto the new
// document's body, and the card's own <style> rules are reused as-is so
// the printed layout matches what's on screen. The browser's own Print
// dialog (with "Save as PDF" as a destination) handles the rest - no PDF
// library needed.
_printView() {
if (!this._root) return;
const gridEl = this._root.querySelector(".grid");
if (!gridEl) return;
const isMonth = gridEl.classList.contains("mode-month");
const title = isMonth ? "Month view" : "Week view";
let printWindow;
try {
printWindow = window.open("", "_blank");
} catch (e) {
printWindow = null;
}
if (!printWindow) {
// Popup blocked (or window.open unsupported in this environment) -
// nothing more we can safely do without the user's own action.
return;
}
const styleEl = this._root.querySelector("style");
const hostStyle = this.style && this.style.cssText ? this.style.cssText : "";
const doc = printWindow.document;
doc.open();
doc.write(
`<!doctype html><html><head><title>${title}</title><style>${styleEl ? styleEl.textContent : ""}
@page { margin: 12mm; }
body { margin: 0; padding: 16px; background: var(--fc-bg, #fff); }
.add-event-fab, .week-nav-side, .week-shortcuts, .nav-arrow { display: none !important; }
.grid { max-height: none !important; overflow: visible !important; }
</style></head><body style="${hostStyle}"><div class="grid ${isMonth ? "mode-month" : "mode-week"}">${gridEl.innerHTML}</div></body></html>`
);
doc.close();
printWindow.onload = () => {
printWindow.focus();
printWindow.print();
};
}
_isAllDay(ev) {
return !!(ev.start && ev.start.date && !ev.start.dateTime);
}
_textColorFor(hex) {
if (!hex) return "#4a3800";
const c = hex.replace("#", "");
if (c.length !== 6) return "#4a3800";
const r = parseInt(c.substr(0, 2), 16);
const g = parseInt(c.substr(2, 2), 16);
const b = parseInt(c.substr(4, 2), 16);
const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
return luminance > 0.6 ? "#3a2f00" : "#ffffff";
}
_build() {
this._built = true;
const root = this.attachShadow ? this.attachShadow({ mode: "open" }) : this;
const hourOptionsHtml = Array.from({ length: 24 }, (_, h) => `<option value="${h}">${this._fmtHour12(h)}</option>`).join("");
const endHourOptionsHtml = hourOptionsHtml + `<option value="24">Midnight</option>`;
root.innerHTML = `
<style>
:host {
display: block;
height: 100vh;
height: 100dvh;
box-sizing: border-box;
overflow: hidden;
font-family: "Arial Rounded MT Std", "Arial Rounded MT", "Varela Round", -apple-system, "Segoe UI Rounded", "Segoe UI", Roboto, sans-serif;
--fc-bg: #fbf7e5;
--fc-card: #f5f3f0;
--fc-border: #e6ddc4;
--fc-text: #423d34;
--fc-text-secondary: #96877a;
--fc-accent: #8f5a00;
--fc-accent-text: #fff8ea;
--fc-accent2: #305545;
--fc-accent3: #b5583c;
--fc-surface-alt: #efe6cf;
--fc-surface2: #f2eede;
--fc-shadow: 0 2px 5px rgba(58, 53, 44, 0.16);
--fc-bg-image: none;
--fc-bg-overlay-image: none;
--fc-bg-size: cover;
--fc-bg-position: center;
--fc-bg-blur: 0px;
--fc-bg-image-opacity: 1;
}
ha-card {
height: 100%;
box-sizing: border-box;
padding: 12px 12px 16px;
display: flex;
flex-direction: column;
border-radius: 0;
position: relative;
isolation: isolate;
overflow: hidden;
background: var(--fc-bg);
color: var(--fc-text);
box-shadow: 0 2px 10px rgba(58, 53, 44, 0.1);
}
/* :host and ha-card above are overflow:hidden at every width (not just
   mobile) to contain the calendar grid's own scrolling - but a
   position:fixed full-screen modal (e.g. the Grocy Recipe Viewer) is
   still clipped by that ancestor overflow even though it's positioned
   relative to the viewport, which was cutting off its top (title + close
   button) on the tablet dashboard too, not just phone-width screens where
   this was first reported and originally (incompletely) fixed inside the
   max-width:700px media query below. Lifting it here instead, unscoped by
   width, while any modal is open (.modal-open, toggled by a
   MutationObserver watching .modal-overlay's "open" class - see where
   _root is set up) covers every screen size. */
:host(.modal-open) { overflow: visible !important; }
:host(.modal-open) ha-card { overflow: visible !important; }
ha-card::before {
content: "";
position: absolute;
inset: calc(-1 * var(--fc-bg-blur, 0px));
z-index: -1;
background-image: var(--fc-bg-overlay-image, none), var(--fc-bg-image, none);
background-size: 100% 100%, var(--fc-bg-size, cover);
background-position: center, var(--fc-bg-position, center);
background-repeat: no-repeat, no-repeat;
filter: blur(var(--fc-bg-blur, 0px));
opacity: var(--fc-bg-image-opacity, 1);
pointer-events: none;
}
.loved-btn, .suggestions-btn, .templates-btn, .print-btn { border: none; border-radius: 16px; padding: 8px 14px; font-size: 13px; font-weight: 700; background: #f2ddd4; color: #7a4436; cursor: pointer; white-space: nowrap; box-shadow: var(--fc-shadow); }
.suggestions-btn { background: #f2ecc4; color: #7a6a2f; }
.templates-btn { background: #d8e3e0; color: #2f5650; }
.print-btn { background: #e6dcee; color: #4a3760; }
/* Shopping List modal's two tabs (This Week's Meals / Grocy List) - same
   look as the Add Event modal's tab bar (.add-event-tab-btn), kept as its
   own small rule set rather than shared, since the two modals' tab
   contents have nothing else in common. */
.shopping-tabs { display: flex; gap: 8px; margin-bottom: 4px; }
.shopping-tab-btn { flex: 1 1 0; min-height: 40px; padding: 8px 10px; border-radius: 10px; border: 2px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: var(--fc-shadow); }
.shopping-tab-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
.shopping-tab-panel { display: flex; flex-direction: column; gap: 12px; }
/* Less-frequently-used week-level actions (Templates, Print, Grocery List)
   live behind a single "More" button instead of each getting their own
   slot in the header - keeps Suggestions and Loved Dishes (used almost
   every time someone plans a meal) front and center as the header grows
   more Grocy-powered actions over time. */
.more-menu-wrap { position: relative; }
.more-menu-btn { border: none; border-radius: 16px; padding: 8px 14px; font-size: 13px; font-weight: 700; background: var(--fc-surface-alt); color: var(--fc-text); cursor: pointer; white-space: nowrap; box-shadow: var(--fc-shadow); }
.more-menu-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); }
.more-menu-dropdown { display: none; position: absolute; top: calc(100% + 6px); right: 0; z-index: 950; background: var(--fc-card); border-radius: 12px; box-shadow: 0 6px 20px rgba(0,0,0,0.25); padding: 6px; min-width: 200px; flex-direction: column; gap: 4px; }
.more-menu-dropdown.open { display: flex; }
.more-menu-item { border: none; border-radius: 8px; padding: 10px 12px; font-size: 13px; font-weight: 700; background: none; color: var(--fc-text); cursor: pointer; text-align: left; white-space: nowrap; width: 100%; box-sizing: border-box; }
.more-menu-item:hover, .more-menu-item:focus-visible { background: var(--fc-surface-alt); }
.grocery-list-status { font-size: 13px; color: var(--fc-text-secondary); line-height: 1.5; padding: 4px 2px 10px; }
.grocery-list-status.is-error { color: #b5583c; }
.grocery-list-meals { display: flex; flex-direction: column; gap: 6px; padding: 4px 2px 10px; max-height: 320px; overflow-y: auto; }
.grocery-list-meal-row { display: flex; align-items: flex-start; gap: 10px; padding: 8px 10px; border-radius: 10px; background: var(--fc-surface-alt); }
.grocery-list-meal-row input[type="checkbox"] { margin-top: 3px; }
.grocery-list-meal-name { font-weight: 700; font-size: 13px; color: var(--fc-text); }
.grocery-list-meal-days { font-size: 12px; color: var(--fc-text-secondary); }
.grocery-list-meal-badge { font-size: 11px; font-weight: 700; border-radius: 10px; padding: 2px 8px; white-space: nowrap; margin-left: auto; align-self: center; }
.grocery-list-meal-badge.is-added { background: #dbe8d4; color: #3c5c30; }
.grocery-list-meal-badge.is-pending { background: #f2ddd4; color: #7a4436; }
.grocy-shopping-list-add-row { display: flex; gap: 8px; padding: 2px 2px 10px; }
.grocy-shopping-list-add-input { flex: 1 1 auto; min-width: 0; border: 1px solid var(--fc-border, #ccc); border-radius: 10px; padding: 8px 10px; font-size: 13px; background: var(--fc-surface-alt, #fff); color: var(--fc-text); }
.grocy-shopping-list-add-amount { width: 64px; border: 1px solid var(--fc-border, #ccc); border-radius: 10px; padding: 8px 6px; font-size: 13px; background: var(--fc-surface-alt, #fff); color: var(--fc-text); text-align: center; }
.grocy-shopping-list-add-btn { border: none; border-radius: 10px; padding: 8px 14px; font-size: 13px; font-weight: 700; background: var(--fc-accent); color: var(--fc-accent-text); cursor: pointer; white-space: nowrap; }
.grocy-shopping-list-status { font-size: 13px; color: var(--fc-text-secondary); line-height: 1.5; padding: 0 2px 8px; }
.grocy-shopping-list-status.is-error { color: #b5583c; }
.grocy-shopping-list-items { display: flex; flex-direction: column; gap: 6px; padding: 2px 2px 4px; max-height: 360px; overflow-y: auto; }
.grocy-shopping-list-item-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; background: var(--fc-surface-alt); }
.grocy-shopping-list-item-row.is-done { opacity: 0.55; }
.grocy-shopping-list-item-row.is-done .grocy-shopping-list-item-name { text-decoration: line-through; }
.grocy-shopping-list-item-check { flex: none; }
.grocy-shopping-list-item-info { flex: 1 1 auto; min-width: 0; }
.grocy-shopping-list-item-name { font-weight: 700; font-size: 13px; color: var(--fc-text); }
.grocy-shopping-list-item-amount { font-size: 12px; color: var(--fc-text-secondary); }
.grocy-shopping-list-item-remove { flex: none; border: none; border-radius: 8px; padding: 4px 8px; font-size: 13px; background: none; color: var(--fc-text-secondary); cursor: pointer; }
.grocy-shopping-list-item-remove:hover, .grocy-shopping-list-item-remove:focus-visible { color: #b5583c; background: var(--fc-surface-alt, #fff); }
.grocy-shopping-list-item-putaway { flex: none; border: none; border-radius: 8px; padding: 4px 8px; font-size: 15px; line-height: 1; background: none; color: var(--fc-text-secondary); cursor: pointer; }
.grocy-shopping-list-item-putaway:hover, .grocy-shopping-list-item-putaway:focus-visible { color: var(--fc-accent); background: var(--fc-surface-alt, #fff); }
.grocy-shopping-list-item-move { flex: none; border: none; border-radius: 8px; padding: 4px 8px; font-size: 15px; line-height: 1; background: none; color: var(--fc-text-secondary); cursor: pointer; }
.grocy-shopping-list-item-move:hover, .grocy-shopping-list-item-move:focus-visible { color: var(--fc-accent); background: var(--fc-surface-alt, #fff); }
.grocy-shopping-list-putaway-panel { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; margin: -2px 0 2px; border-radius: 10px; background: var(--fc-surface-alt, #fff); border: 1px solid var(--fc-border); }
.grocy-shopping-list-putaway-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--fc-text); }
.grocy-shopping-list-putaway-row label { flex: none; width: 60px; color: var(--fc-text-secondary); }
.grocy-shopping-list-putaway-row select, .grocy-shopping-list-putaway-row input { flex: 1 1 auto; min-width: 0; border: 1px solid var(--fc-border); border-radius: 8px; padding: 6px 8px; font-size: 13px; background: var(--fc-surface-alt); color: var(--fc-text); }
.grocy-shopping-list-putaway-actions { display: flex; justify-content: flex-end; gap: 8px; }
.grocy-shopping-list-putaway-cancel { border: none; border-radius: 8px; padding: 6px 12px; font-size: 12px; background: none; color: var(--fc-text-secondary); cursor: pointer; }
.grocy-shopping-list-putaway-confirm { border: none; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 700; background: var(--fc-accent); color: var(--fc-accent-text); cursor: pointer; }
.grocy-shopping-list-picker-row { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; }
.grocy-shopping-list-picker { flex: 1 1 auto; min-width: 0; box-sizing: border-box; border: 1px solid var(--fc-border, #ccc); border-radius: 10px; padding: 8px 10px; font-size: 13px; background: var(--fc-surface-alt, #fff); color: var(--fc-text); }
.grocy-shopping-list-new-list-btn { flex: none; border: 1px solid var(--fc-border, #ccc); border-radius: 10px; padding: 8px 10px; font-size: 12px; font-weight: 700; background: var(--fc-surface-alt, #fff); color: var(--fc-text-secondary); cursor: pointer; }
.grocy-shopping-list-new-list-btn:hover, .grocy-shopping-list-new-list-btn:focus-visible { color: var(--fc-accent); }
.grocy-shopping-list-total { font-size: 13px; font-weight: 700; color: var(--fc-text); text-align: right; padding: 8px 4px 2px; border-top: 1px solid var(--fc-border); margin-top: 4px; }
.grocy-expiring-status { font-size: 13px; color: var(--fc-text-secondary); line-height: 1.5; padding: 0 2px 8px; }
.grocy-expiring-status.is-error { color: #b5583c; }
.grocy-expiring-sections { display: flex; flex-direction: column; gap: 16px; max-height: 420px; overflow-y: auto; padding: 2px; }
.grocy-expiring-section-label { font-weight: 800; font-size: 13px; color: var(--fc-text); margin-bottom: 6px; }
.grocy-expiring-items { display: flex; flex-direction: column; gap: 6px; }
.grocy-expiring-item-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 10px; padding: 8px 10px; border-radius: 10px; background: var(--fc-surface-alt); }
.grocy-expiring-item-name { font-weight: 700; font-size: 13px; color: var(--fc-text); }
.grocy-expiring-item-when { font-size: 12px; color: var(--fc-text-secondary); flex: none; white-space: nowrap; }
.grocy-expiring-item-when.is-soon { color: #b5583c; font-weight: 700; }
.grocy-expiring-item-recipes { flex-basis: 100%; display: flex; flex-wrap: wrap; gap: 6px; }
.grocy-expiring-item-recipe-chip { border: none; border-radius: 999px; padding: 3px 10px; font-size: 11px; font-weight: 700; background: var(--fc-surface-alt, #fff); color: var(--fc-accent); cursor: pointer; }
.grocy-expiring-item-recipe-chip:hover, .grocy-expiring-item-recipe-chip:focus-visible { background: var(--fc-accent); color: var(--fc-accent-text); }
.grocy-expiring-empty { font-size: 13px; color: var(--fc-text-secondary); font-style: italic; padding: 2px 2px 4px; }
.grocy-low-stock-status { font-size: 13px; color: var(--fc-text-secondary); line-height: 1.5; padding: 0 2px 8px; }
.grocy-low-stock-status.is-error { color: #b5583c; }
.grocy-low-stock-add-all-btn { border: none; border-radius: 10px; padding: 8px 14px; font-size: 13px; font-weight: 700; background: var(--fc-accent); color: var(--fc-accent-text); cursor: pointer; margin-bottom: 10px; }
.grocy-low-stock-items { display: flex; flex-direction: column; gap: 6px; max-height: 420px; overflow-y: auto; padding: 2px; }
.grocy-low-stock-item-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; border-radius: 10px; background: var(--fc-surface-alt); }
.grocy-low-stock-item-name { font-weight: 700; font-size: 13px; color: var(--fc-text); }
.grocy-low-stock-item-missing { font-size: 12px; color: var(--fc-text-secondary); flex: none; white-space: nowrap; }
.grocery-list-empty-hint { font-size: 13px; color: var(--fc-text-secondary); line-height: 1.5; padding: 8px 2px; }
.grocery-list-push-btn { margin-top: 4px; }
.recipe-import-hint { font-size: 12px; color: var(--fc-text-secondary); line-height: 1.4; padding: 4px 2px 8px; }
.recipe-import-url-input { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(0,0,0,0.15); font-size: 14px; margin-bottom: 8px; background: var(--fc-surface-alt, #fff); color: var(--fc-text); }
.recipe-import-status { font-size: 13px; color: var(--fc-text-secondary); line-height: 1.5; padding: 8px 2px; }
.recipe-import-status.is-error { color: #b5583c; }
.recipe-import-name-input, .recipe-import-servings-input { width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.15); font-size: 14px; background: var(--fc-surface-alt, #fff); color: var(--fc-text); }
.recipe-import-photo-preview { width: 100%; max-height: 180px; object-fit: cover; border-radius: 10px; margin-bottom: 10px; }
.recipe-import-ingredients-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 12px; }
.recipe-import-ingredients-label, .recipe-import-instructions-label { font-weight: 700; font-size: 13px; }
.recipe-import-instructions-label { display: block; margin: 12px 0 6px; }
.recipe-import-refresh-btn { border: none; background: none; color: var(--fc-accent, #7a4436); font-size: 12px; font-weight: 700; cursor: pointer; padding: 2px 4px; }
.recipe-import-ingredient-search-input { width: 100%; box-sizing: border-box; background: var(--fc-surface-alt, #fff); color: var(--fc-text); border: 1px solid rgba(0,0,0,0.12); border-radius: 8px; padding: 6px 10px; font-size: 13px; margin: 8px 0 6px; }
.recipe-import-ingredients-empty-filter { font-size: 12px; color: var(--fc-text-secondary); padding: 8px 0; font-style: italic; }
.recipe-import-ingredient-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid rgba(0,0,0,0.06); font-size: 13px; }
.recipe-import-ingredient-raw { flex: 1; }
.recipe-import-ingredient-select { max-width: 45%; background: var(--fc-surface-alt, #fff); color: var(--fc-text); border: 1px solid rgba(0,0,0,0.12); border-radius: 6px; padding: 4px 6px; font-size: 13px; }
.recipe-import-ingredient-score { font-size: 11px; color: var(--fc-text-secondary); }
.recipe-import-ingredient-amount-input { width: 56px; flex: 0 0 auto; background: var(--fc-surface-alt, #fff); color: var(--fc-text); border: 1px solid rgba(0,0,0,0.12); border-radius: 6px; padding: 4px 6px; font-size: 13px; }
.recipe-import-ingredient-unit-select { max-width: 90px; flex: 0 0 auto; background: var(--fc-surface-alt, #fff); color: var(--fc-text); border: 1px solid rgba(0,0,0,0.12); border-radius: 6px; padding: 4px 6px; font-size: 13px; }
/* Two classes (not just .remind-check-opt alone) so this wins over that
   pill-style rule's own display/padding/font-size regardless of which one
   is declared later in the stylesheet - this checkbox needs to sit
   compactly under its ingredient row, not float as a standalone pill. */
.remind-check-opt.recipe-import-ingredient-no-stock-label { display: inline-flex; font-size: 11px; font-weight: 400; background: none; padding: 0 0 8px; margin: 0; }
.recipe-import-ingredient-warning { font-size: 11px; color: #b5583c; padding: 0 0 8px; line-height: 1.4; }
.recipe-import-suggestion { font-size: 12px; color: var(--fc-text-secondary); background: var(--fc-surface-alt); border-radius: 8px; padding: 6px 10px; margin: -2px 0 8px; line-height: 1.5; }
.recipe-import-suggestion strong { color: var(--fc-text); }
.recipe-import-suggestion-use-btn { border: none; background: none; color: var(--fc-accent, #7a4436); font-weight: 700; font-size: 12px; cursor: pointer; padding: 0 0 0 4px; text-decoration: underline; }
.recipe-import-new-product-form { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 10px; margin: -4px 0 6px; background: var(--fc-surface-alt); border-radius: 10px; }
.recipe-import-new-product-name { flex: 1 1 160px; padding: 6px 8px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.15); font-size: 13px; }
.recipe-import-new-product-location, .recipe-import-new-product-unit { padding: 6px 8px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.15); font-size: 13px; }
.recipe-import-new-product-cancel { border: none; background: none; color: var(--fc-text-secondary); font-size: 13px; cursor: pointer; text-decoration: underline; }
.recipe-import-new-product-label { display: flex; flex-direction: column; gap: 2px; font-size: 11px; color: var(--fc-text-secondary); }
.recipe-import-new-product-label select, .recipe-import-new-product-label input { padding: 6px 8px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.15); font-size: 13px; }
.recipe-import-new-product-qty-label input { width: 90px; }
.recipe-import-new-product-qty-hint { flex-basis: 100%; font-size: 11px; color: var(--fc-text-secondary); font-style: italic; margin-top: -4px; }
.recipe-import-new-product-status { flex-basis: 100%; font-size: 12px; color: var(--fc-text-secondary); }
.recipe-import-new-product-status.is-error { color: #b5583c; }
.recipe-import-instructions-preview { font-size: 13px; line-height: 1.6; max-height: 160px; overflow-y: auto; background: rgba(0,0,0,0.03); border-radius: 8px; padding: 8px 10px; }
.recipe-import-divider { text-align: center; font-size: 12px; color: var(--fc-text-secondary); margin: 10px 0; }
.recipe-import-text-input { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(0,0,0,0.15); font-size: 14px; margin-bottom: 8px; font-family: inherit; resize: vertical; background: var(--fc-surface-alt, #fff); color: var(--fc-text); }
.recipe-import-manual-btn { display: block; width: 100%; border: none; background: none; color: var(--fc-accent, #7a4436); font-size: 13px; font-weight: 700; cursor: pointer; padding: 6px 2px; text-align: center; }
.recipe-import-image-input, .recipe-import-source-input { width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.15); font-size: 14px; background: var(--fc-surface-alt, #fff); color: var(--fc-text); }
/* These text inputs never set their own background/text color before, so
   they silently rode on the browser's default white input background while
   inheriting whatever color the active theme gave the modal (var(--fc-text))
   - invisible white-on-white text on any theme with light body text. Every
   field in this modal (ingredient rows included) now explicitly pairs
   var(--fc-surface-alt) with var(--fc-text) so it always has real contrast,
   whatever theme is active. */
.recipe-import-ingredient-raw-input { flex: 1; box-sizing: border-box; padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.12); font-size: 13px; background: var(--fc-surface-alt, #fff); color: var(--fc-text); }
.recipe-import-ingredient-remove-btn { border: none; background: none; color: var(--fc-text-secondary); font-size: 15px; cursor: pointer; padding: 2px 6px; line-height: 1; }
.recipe-import-add-ingredient-btn { border: none; background: none; color: var(--fc-accent, #7a4436); font-size: 12px; font-weight: 700; cursor: pointer; padding: 6px 2px; }
.recipe-import-debug-btn { display: block; width: 100%; margin-top: 6px; border: none; background: none; color: var(--fc-text-secondary); font-size: 12px; cursor: pointer; padding: 6px 2px; text-align: center; }
.recipe-import-instructions-input { width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.15); font-size: 13px; line-height: 1.6; font-family: inherit; resize: vertical; background: var(--fc-surface-alt, #fff); color: var(--fc-text); }
.recipe-import-ingredient-select { max-width: 45%; background: var(--fc-surface-alt, #fff); color: var(--fc-text); border: 1px solid rgba(0,0,0,0.12); border-radius: 6px; padding: 4px 6px; font-size: 13px; }
.add-event-fab { position: fixed; right: 18px; bottom: 18px; z-index: 900; width: 56px; height: 56px; border-radius: 50%; border: none; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 28px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(58,53,44,0.35); transition: transform 0.15s ease; }
.add-event-fab:active { transform: scale(0.94); }
/* The + button's 4 choices (Calendar Entry / Reminder / Meal Suggestion /
   Recipe) open in a real modal like everything else in the card, rather
   than a floating pill list next to the FAB - a stacked list of full-width
   rows inside the standard modal-box. */
.add-menu-list { display: flex; flex-direction: column; gap: 8px; }
.add-fab-item { width: 100%; box-sizing: border-box; text-align: left; border: none; border-radius: 10px; padding: 14px 16px; font-size: 15px; font-weight: 700; background: var(--fc-surface-alt); color: var(--fc-text); cursor: pointer; box-shadow: var(--fc-shadow); }
.add-fab-item:active { transform: scale(0.98); }
.settings-btn, .view-btn, .edit-meals-btn { border: none; border-radius: 16px; padding: 8px 10px; font-size: 12px; font-weight: 700; background: var(--fc-surface-alt); color: var(--fc-text); cursor: pointer; box-shadow: var(--fc-shadow); }
.view-btn.active, .edit-meals-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); }
.week-nav { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; margin-bottom: 8px; flex: 0 0 auto; }
.week-nav-side { display: flex; gap: 8px; flex-wrap: wrap; min-width: 0; }
.week-nav-side.left { justify-content: flex-start; justify-self: start; }
.week-nav-side.right { justify-content: flex-end; justify-self: end; }
.week-nav-center { display: flex; align-items: center; justify-content: center; gap: 14px; }
.nav-arrow { border: none; background: var(--fc-surface-alt); color: var(--fc-text); width: 40px; height: 40px; border-radius: 50%; font-size: 16px; cursor: pointer; flex: 0 0 auto; box-shadow: var(--fc-shadow); }
.week-label-wrap { display: flex; flex-direction: column; align-items: center; min-width: 180px; }
.week-label { font-size: var(--fs-header-title, 15px); font-weight: 700; cursor: pointer; text-align: center; color: var(--fc-text); }
.countdown-line { font-size: var(--fs-countdown, 11px); font-weight: 700; color: var(--fc-text-secondary); margin-top: 1px; min-height: 13px; }
/* Desktop/tablet keeps the always-visible This Week/Next Week/In 2 Weeks
   row (see .week-shortcuts) - this toggle button only does anything on
   phone-width screens, where that row folds away behind it instead (see
   the mobile media query). */
.week-shortcuts-toggle { display: none; }
/* Mirrors .loved-btn's own click handler - only shown inside the More
   menu on phone-width screens (see the mobile media query), where the
   standalone button is hidden to save a row. */
.loved-menu-item { display: none; }
.week-shortcuts { display: flex; justify-content: center; gap: 8px; margin-bottom: 10px; flex: 0 0 auto; flex-wrap: wrap; }
.week-shortcut { border: none; border-radius: 14px; padding: 8px 14px; font-size: 12px; font-weight: 700; background: var(--fc-surface-alt); color: var(--fc-text); cursor: pointer; box-shadow: var(--fc-shadow); }
.week-shortcut.active { background: var(--fc-accent); color: var(--fc-accent-text); }
.legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin-bottom: 10px; flex: 0 0 auto; }
.chip { display: flex; align-items: center; gap: 6px; padding: 4px 10px 4px 4px; border-radius: 16px; font-size: var(--fs-chip, 13px); font-weight: 600; color: #3a352c; box-shadow: var(--fc-shadow); cursor: pointer; transition: opacity 0.15s ease, transform 0.15s ease; }
.empty-people-hint { display: block; width: 100%; text-align: center; border: 2px dashed var(--fc-border); border-radius: 14px; background: var(--fc-surface-alt); color: var(--fc-text-secondary); font-size: 13px; font-weight: 600; padding: 10px 14px; cursor: pointer; }
.empty-people-hint:hover { color: var(--fc-text); border-color: var(--fc-accent, var(--fc-border)); }
.chip:active { transform: scale(0.96); }
.chip.active-filter { outline: 2px solid var(--fc-accent); outline-offset: 1px; }
.chip.dimmed { opacity: 0.4; }
.chip .avatar { width: 20px; height: 20px; border-radius: 50%; background: rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center; font-size: 11px; color: #fff; }
.chip.type-chip { background: var(--fc-surface-alt); color: var(--fc-text); border: 2px solid var(--fc-border); margin-left: 4px; }
.grid { flex: 1 1 auto; min-height: 0; overflow: hidden; touch-action: pan-y; }
.grid.mode-week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); grid-template-rows: minmax(0, 1fr); gap: 8px; }
.grid.mode-month { display: flex; flex-direction: column; gap: 4px; }
.month-weekday-row { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; flex: 0 0 auto; }
.mwd { text-align: center; font-size: 11px; font-weight: 700; color: var(--fc-text-secondary); text-transform: uppercase; }
.month-cells { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); grid-template-rows: repeat(6, minmax(0, 1fr)); gap: 4px; flex: 1 1 auto; min-height: 0; overflow: hidden; }
.month-cell { background: var(--fc-card); border: 1px solid var(--fc-border); border-radius: 8px; padding: 4px; display: flex; flex-direction: column; min-height: 0; min-width: 0; overflow: hidden; cursor: pointer; box-shadow: var(--fc-shadow); }
.month-cell.today { border: 2px solid var(--fc-accent); }
.month-cell.outside { opacity: 0.4; }
.mc-date { font-size: 12px; font-weight: 700; display: flex; align-items: center; gap: 3px; flex: 0 0 auto; color: var(--fc-text); }
.mc-events { flex: 1 1 auto; min-height: 0; overflow: hidden; display: flex; flex-direction: column; gap: 2px; margin-top: 2px; }
.mc-pill { font-size: 10px; border-radius: 3px; padding: 1px 4px; color: #3a352c; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mc-meal-pill { cursor: pointer; font-weight: 700; }
.mc-more { font-size: 9px; color: var(--fc-text-secondary); }
.day-col { background: var(--fc-card); border: 1px solid var(--fc-border); border-radius: 10px; padding: 8px; display: flex; flex-direction: column; min-height: 0; min-width: 0; height: 100%; overflow: hidden; box-shadow: var(--fc-shadow); }
.day-col.today { border: 2px solid var(--fc-accent); }
.day-header { text-align: center; margin-bottom: 4px; flex: 0 0 auto; }
.name-row { display: flex; align-items: center; justify-content: center; gap: 5px; }
.day-header .name { font-size: var(--fs-day-name, 13px); text-transform: uppercase; color: var(--fc-text-secondary); }
.wx-icon { font-size: 19px; line-height: 1; }
.day-header .num { font-size: var(--fs-day-number, 22px); font-weight: 700; display: inline-flex; align-items: center; gap: 6px; justify-content: center; flex-wrap: wrap; color: var(--fc-text); }
.wx-temp { font-size: var(--fs-wx-temp, 14px); font-weight: 800; opacity: 0.9; white-space: nowrap; color: var(--fc-accent2); }
.custody-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px; background: #cf8f9c; color: #3a352c; font-size: 11px; font-weight: 800; box-shadow: var(--fc-shadow); margin-left: 2px; }
.today .day-header .num { color: var(--fc-accent); }
.menu-blocks { flex: 0 0 auto; display: flex; flex-direction: column; gap: 3px; margin-bottom: 4px; min-height: 0; }
.menu-banner { position: relative; padding: var(--menu-block-padding, 6px 20px); border-radius: 6px; background: var(--fc-surface2, #f0e6c4); color: #5c4a22; cursor: pointer; min-height: var(--menu-block-min-height, 42px); display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box; box-shadow: var(--fc-shadow); }
.menu-banner .block-label { font-size: var(--menu-label-font-size, 9px); font-weight: 800; text-transform: uppercase; opacity: 0.65; line-height: 1.2; }
.menu-banner .menu-text { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-align: center; font-size: var(--menu-font-size, 13px); font-weight: 800; line-height: 1.2; white-space: normal; word-break: break-word; }
.menu-banner.empty .menu-text { color: #8a7a52; font-style: italic; font-weight: 600; -webkit-line-clamp: 1; }
.menu-banner.recurring-meal { box-shadow: var(--fc-shadow), inset 0 0 0 2px rgba(0,0,0,0.12); }
.menu-banner .rating-flag { position: absolute; left: 4px; top: 4px; font-size: 12px; }
.menu-banner.edit-mode { outline: 2px dashed var(--fc-accent); outline-offset: 2px; }
.menu-banner.edit-mode:not(.empty) { cursor: grab; animation: meal-wiggle 0.32s ease-in-out infinite; touch-action: none; }
.menu-banner.edit-mode.dragging-source { opacity: 0.3; animation: none; }
.menu-banner.edit-mode.drop-target { outline-color: var(--fc-accent3); outline-width: 3px; transform: scale(1.04); }
.meal-drag-ghost { position: fixed; pointer-events: none; z-index: 2000; opacity: 0.92; box-shadow: 0 8px 20px rgba(58,53,44,0.4); transform: scale(1.05) rotate(-2deg); }
@keyframes meal-wiggle { 0% { transform: rotate(-1deg); } 50% { transform: rotate(1deg); } 100% { transform: rotate(-1deg); } }
.events { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; gap: 6px; overscroll-behavior: contain; }
.event { border-radius: 8px; padding: 8px 10px; font-size: var(--fs-event, 14px); color: #3a352c; display: flex; flex-direction: column; gap: 3px; line-height: 1.35; flex: 0 0 auto; cursor: pointer; box-shadow: var(--fc-shadow); min-width: 0; }
.event:active { transform: scale(0.98); }
.event .event-top { display: flex; align-items: center; gap: 6px; min-width: 0; }
.event .avatar { width: 19px; height: 19px; min-width: 19px; border-radius: 50%; background: rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center; font-size: 10px; color: #fff; }
.event .time { font-weight: 700; opacity: 0.8; white-space: nowrap; }
.event .summary { display: block; width: 100%; overflow-wrap: break-word; word-break: break-word; white-space: normal; font-weight: 600; min-width: 0; }
.all-day-row { flex: 0 0 auto; display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; }
.all-day-chip { border-radius: 6px; padding: 3px 8px; font-size: 11px; font-weight: 700; color: #3a352c; cursor: pointer; box-shadow: var(--fc-shadow); }
.timeline { position: relative; flex: 0 0 auto; }
.hour-row { position: absolute; left: 0; right: 0; border-top: 1px solid var(--fc-border); }
.hour-label { position: absolute; left: 2px; top: -7px; font-size: 9px; font-weight: 600; color: var(--fc-text-secondary); background: var(--fc-card); padding: 0 2px; }
.tl-event { position: absolute; border-radius: 6px; padding: 2px 5px; font-size: 11px; color: #3a352c; overflow: hidden; box-sizing: border-box; cursor: pointer; box-shadow: var(--fc-shadow); }
.tl-event .tl-time { display: block; font-weight: 700; opacity: 0.85; font-size: 9px; line-height: 1.2; }
.tl-event .tl-summary { font-weight: 700; white-space: normal; overflow-wrap: break-word; word-break: break-word; line-height: 1.2; }
.tl-event.reminder-event, .event.reminder-event { border: 2px dashed rgba(0,0,0,0.35); }
.mc-pill.mc-reminder-pill { border: 2px dashed rgba(0,0,0,0.35); }
@media (max-width: 700px) {
:host { height: auto !important; min-height: 100vh; min-height: 100dvh; overflow: hidden; }
ha-card { height: auto; min-height: 100%; overflow: hidden; }
/* The :host(.modal-open)/ha-card overflow:visible override that undoes
   the overflow:hidden above while a modal is open now lives unscoped by
   width, right after the base ha-card rule near the top of this
   stylesheet - see the comment there. It used to live only in this
   mobile media query, which meant the tablet dashboard (anything wider
   than 700px) never got it and could still show the same clipped-modal
   bug this comment used to describe. */
/* Adding/browsing Meal Suggestions now also lives behind the + button
   (see .add-menu-overlay) - dropping this from the header's already-tight
   phone-width row declutters it without losing the feature, since the
   same Suggestions overlay opens either way. */
.suggestions-btn { display: none; }
.grid.mode-week { grid-template-columns: 1fr; grid-template-rows: none; gap: 10px; overflow-y: auto; }
.day-col { min-height: unset; height: auto; }
.day-header { display: flex; align-items: baseline; justify-content: center; gap: 8px; }
.events { max-height: 220px; }
.week-label-wrap { min-width: 0; }
.week-nav { grid-template-columns: 1fr; row-gap: 6px; }
.week-nav-side.left, .week-nav-side.right { justify-self: center; justify-content: center; }
.week-nav-center { justify-content: center; }
/* Loved Dishes folds into the More menu (see .loved-menu-item) instead of
   sitting as its own pill, saving a slot in an already-tight row. */
.loved-btn { display: none; }
.loved-menu-item { display: block; }
/* This Week/Next Week/In 2 Weeks used to always be their own row (see
   .week-shortcuts); on phone-width screens it now folds away behind the
   little toggle under the week label instead, matching the accordion
   chevron treatment used elsewhere in the card. Tapping a shortcut (see
   its click handler) or picking a different one closes it again. */
.week-shortcuts-toggle { display: block; border: none; background: none; color: var(--fc-text-secondary); font-size: 10px; cursor: pointer; padding: 2px 10px; margin-top: 1px; transition: transform 0.15s ease; }
.week-shortcuts-toggle.open { transform: rotate(180deg); }
.week-shortcuts { display: none; }
.week-shortcuts.open { display: flex; }
}
.modal-overlay { display: none; position: fixed; inset: 0; background: rgba(40,34,20,0.45); z-index: 1000; align-items: center; justify-content: center; }
.modal-overlay.open { display: flex; }
.loved-overlay { z-index: 1001; }
.grocy-import-btn { width: 100%; margin-bottom: 10px; background: var(--fc-surface-alt); color: var(--fc-text); box-shadow: none; border: 1px solid var(--fc-border); }
/* Lives at the bottom of the Grocy picker screen, under the list of Grocy
   recipes, rather than in the Meal Suggestions box - importing a link
   creates an actual Grocy recipe, so it belongs alongside the rest of the
   Grocy picker's own recipes, not the freeform suggestion controls. */
.recipe-import-open-btn { width: 100%; margin-top: 10px; background: var(--fc-surface-alt); color: var(--fc-text); box-shadow: none; border: 1px solid var(--fc-border); }
.grocy-picker-overlay { z-index: 1002; }
.grocy-picker-overlay .modal-box { background: var(--fc-bg); }
.grocy-picker-status { font-size: 12px; color: var(--fc-text-secondary); padding: 2px 2px 10px; }
.grocy-picker-status.is-error { color: #b5583c; }
/* Full-screen rather than a centered popup - a recipe is something people
   actually want to read start to finish (often while cooking, at arm's
   length from a tablet), not glance at in a small box. The overlay itself
   fills the viewport edge to edge; the reading column inside it is capped
   at a comfortable line length instead of stretching full width on a wide
   dashboard screen. */
/* top offset (not just inset:0's implied top:0) so the overlay starts
below whatever Home Assistant chrome - typically its own top app bar -
already pushes the card itself down by; see _syncHeight's
--fh-header-offset for where this number comes from. Falls back to 0px
(the old, full-viewport behavior) when unset, e.g. before the first
_syncHeight run or on a Home Assistant layout with no header at all. */
.grocy-recipe-viewer-overlay { top: var(--fh-header-offset, 0px); z-index: 1002; align-items: stretch; justify-content: stretch; padding: 0; }
.grocy-recipe-viewer-overlay .modal-box { background: var(--fc-bg); width: 100%; max-width: 100%; height: calc(100vh - var(--fh-header-offset, 0px)); max-height: calc(100vh - var(--fh-header-offset, 0px)); border-radius: 0; box-shadow: none; box-sizing: border-box; padding: 28px max(22px, calc(50% - 380px)) 60px; overflow-y: auto; }
.grocy-recipe-viewer-overlay .grocy-recipe-viewer-close { position: fixed; top: calc(14px + var(--fh-header-offset, 0px)); right: 14px; }
/* Shown only when the viewer was opened via a picker's preview icon (task
#177) rather than the normal "click a suggestion/meal's link" flow - lets
someone check out a recipe without it feeling like they've left the
picker underneath, which stays open and is exactly what "Back" returns
them to (see _closeGrocyRecipeViewer). */
.grocy-recipe-viewer-back-btn { display: none; }
.grocy-recipe-viewer-overlay .grocy-recipe-viewer-back-btn { position: fixed; top: calc(14px + var(--fh-header-offset, 0px)); left: 14px; border: 1px solid var(--fc-border); background: var(--fc-surface-alt); color: var(--fc-text); border-radius: 20px; padding: 8px 16px; font-size: 14px; font-weight: 700; cursor: pointer; }
.grocy-recipe-viewer-overlay .grocy-recipe-viewer-back-btn:active { background: var(--fc-border); }
.grocy-recipe-viewer-overlay .grocy-recipe-viewer-title { font-size: 1.8em; text-align: center; margin: 4px 50px 6px; color: var(--fc-accent); }
.grocy-recipe-viewer-overlay.preview-mode .grocy-recipe-viewer-title { margin-left: 70px; margin-right: 70px; }
/* The photo grabbed during recipe import (see create_grocy_recipe's
picture upload) or added by hand in Grocy - hidden entirely when the
recipe has none, in which case the ingredients column below just takes
the full width (see .grocy-recipe-viewer-columns). */
.grocy-recipe-viewer-photo { display: none; flex: 1 1 260px; min-width: 220px; max-width: 100%; max-height: 320px; object-fit: cover; border-radius: 12px; align-self: flex-start; }
.grocy-recipe-viewer-status { font-size: 12px; color: var(--fc-text-secondary); padding: 2px 2px 10px; text-align: center; }
.grocy-recipe-viewer-status.is-error { color: #b5583c; }
/* Prep/Cook/Total stat pills (task #250) - only ever populated with real
values parsed off the recipe (see _renderGrocyRecipeDetail); a recipe with
none of the three published stays an empty, invisible row via :empty
rather than showing a blank card, same treatment as every other optional
field on this page. */
.grocy-recipe-viewer-stats { display: flex; justify-content: center; gap: 10px; margin: 0 0 16px; flex-wrap: wrap; }
.grocy-recipe-viewer-stats:empty { display: none; margin: 0; }
.grocy-recipe-stat { background: var(--fc-surface-alt); border: 1px solid var(--fc-border); border-radius: 10px; padding: 8px 18px; text-align: center; min-width: 78px; }
.grocy-recipe-stat-label { display: block; font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--fc-text-secondary); margin-bottom: 2px; }
.grocy-recipe-stat-value { display: block; font-size: 15px; font-weight: 800; color: var(--fc-text); }
/* Two-column reading layout (task #251) - ingredients (with their own
scaler) on one side, hero photo on the other; wraps to a single stacked
column on narrow widths via flex-wrap, and the photo simply isn't in the
DOM's visible flow at all when the recipe has none (display:none above),
so the ingredients column naturally takes the full width instead of
leaving an empty gap next to it. */
.grocy-recipe-viewer-columns { display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; margin-bottom: 10px; }
.grocy-recipe-viewer-main-col { flex: 1 1 280px; min-width: 240px; }
.grocy-recipe-viewer-servings { font-size: 12px; color: var(--fc-text-secondary); margin-bottom: 10px; }
.grocy-recipe-viewer-scale-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--fc-text-secondary); margin-bottom: 14px; }
.grocy-recipe-viewer-scale-row button { border: 1px solid var(--fc-border); background: var(--fc-surface-alt); color: var(--fc-text); border-radius: 8px; width: 28px; height: 28px; font-size: 16px; font-weight: 800; line-height: 1; cursor: pointer; flex-shrink: 0; }
.grocy-recipe-viewer-scale-row button:active { background: var(--fc-border); }
.grocy-recipe-viewer-scale-value { font-weight: 800; color: var(--fc-text); min-width: 20px; text-align: center; }
.grocy-recipe-viewer-ingredients { margin-bottom: 14px; }
.grocy-recipe-ingredient-group { font-size: 12px; font-weight: 700; color: var(--fc-text-secondary); text-transform: uppercase; letter-spacing: 0.03em; margin: 10px 0 4px; }
.grocy-recipe-ingredient-group:first-child { margin-top: 0; }
.grocy-recipe-ingredient-row { display: flex; align-items: flex-start; gap: 10px; padding: 6px 0; font-size: 14px; color: var(--fc-text); border-bottom: 1px solid var(--fc-border); }
/* Numbered circular badge (task #251/mockup) standing in for the plain
amount text that used to lead each row - the amount itself moved into the
row's second line/span alongside the product name so nothing that used to
be shown is lost, just restyled. */
.grocy-recipe-ingredient-badge { flex: 0 0 auto; width: 24px; height: 24px; border-radius: 50%; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 12px; font-weight: 800; display: flex; align-items: center; justify-content: center; margin-top: 1px; }
.grocy-recipe-ingredient-amount { font-weight: 600; color: var(--fc-text-secondary); }
.grocy-recipe-ingredient-note { font-size: 12px; color: var(--fc-text-secondary); font-style: italic; }
/* Numbered Instructions steps (task #252) - parsed from the recipe's own
"Preparation" block when it has one (see _renderGrocyRecipeDescription);
recipes without that exact structure never populate this element at all,
so it stays empty/invisible via :empty and the raw description below
carries the full instructions instead, same as before this feature. */
.grocy-recipe-viewer-instructions:empty { display: none; }
.grocy-recipe-instructions-title { font-size: 1.1em; font-weight: 800; color: var(--fc-accent); margin: 6px 0 10px; }
.grocy-recipe-instruction-row { display: flex; align-items: flex-start; gap: 12px; padding: 8px 0; font-size: 14px; line-height: 1.5; color: var(--fc-text); }
.grocy-recipe-instruction-badge { flex: 0 0 auto; width: 26px; height: 26px; border-radius: 50%; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 13px; font-weight: 800; display: flex; align-items: center; justify-content: center; margin-top: 1px; }
.grocy-recipe-instruction-text { padding-top: 3px; }
.grocy-recipe-viewer-description { font-size: 14px; line-height: 1.5; color: var(--fc-text); }
.grocy-recipe-viewer-description img { max-width: 100%; }
.grocy-recipe-ingredients-accordion { margin: 10px 0; }
.grocy-recipe-ingredients-accordion .accordion-toggle { font-size: 13px; padding: 8px 10px; }
.grocy-recipe-ingredients-accordion .accordion-body { padding-left: 4px; }
.grocy-recipe-viewer-footer { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
.grocy-recipe-viewer-open-btn { width: 100%; box-sizing: border-box; }
/* Consuming ingredients is a real, one-way Grocy stock deduction (see
   _consumeGrocyRecipeIngredients) - kept visually secondary next to Open in
   Grocy's solid accent button so it doesn't read as the default/expected
   tap, closer to how a "destructive-ish but sometimes wanted" action would
   look in a settings list than a bright primary call to action. */
.grocy-recipe-viewer-consume-btn { width: 100%; box-sizing: border-box; background: var(--fc-surface-alt, #fff); color: var(--fc-text); border: 1px solid var(--fc-border); box-shadow: none; }
.grocy-recipe-viewer-overlay .grocy-recipe-viewer-servings { font-size: 14px; }
.grocy-recipe-viewer-overlay .grocy-recipe-ingredient-row { font-size: 15px; padding: 7px 0; }
.grocy-recipe-viewer-overlay .grocy-recipe-instruction-row { font-size: 15px; }
.grocy-recipe-viewer-overlay .grocy-recipe-viewer-description { font-size: 16px; line-height: 1.6; }
.grocy-recipe-viewer-overlay .grocy-recipe-viewer-footer { max-width: 320px; margin: 14px auto 0; }
.templates-overlay { z-index: 1002; }
.templates-overlay .modal-box { background: var(--fc-bg); }
.templates-save-btn { width: 100%; margin-bottom: 12px; }
.template-row { display: flex; flex-direction: column; gap: 6px; }
.template-row-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.template-summary { font-size: 12px; color: var(--fc-text-secondary); }
.template-actions { display: flex; gap: 8px; }
.template-apply-btn { flex: 1 1 auto; min-height: 36px; padding: 6px 12px; border-radius: 10px; border: none; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 12px; font-weight: 700; cursor: pointer; box-shadow: var(--fc-shadow); }
.template-delete-btn { flex: 0 0 auto; width: 36px; height: 36px; border-radius: 8px; border: none; background: var(--fc-surface-alt); color: #b5583c; font-size: 13px; cursor: pointer; }
.countdown-items-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
.countdown-item-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px; background: var(--fc-surface-alt); }
.countdown-item-label { flex: 1 1 auto; font-size: 13px; font-weight: 600; color: var(--fc-text); }
.countdown-item-date { flex: 0 0 auto; font-size: 12px; color: var(--fc-text-secondary); }
.countdown-item-remove-btn { flex: 0 0 auto; width: 28px; height: 28px; border-radius: 8px; border: none; background: var(--fc-card); color: #b5583c; font-size: 12px; cursor: pointer; }
.countdown-empty { font-size: 12px; color: var(--fc-text-secondary); padding: 6px 2px; }
.countdown-add-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.countdown-add-row input { width: auto; }
.countdown-add-row .countdown-add-label-input { flex: 1 1 140px; min-width: 0; }
.countdown-add-row .countdown-add-date-input { flex: 0 1 150px; }
.countdown-add-row .countdown-add-btn { flex: 0 0 auto; min-height: 36px; }
.debug-overlay { z-index: 1005; }
.dish-detail-overlay { z-index: 1006; }
.event-info-overlay { z-index: 1003; }
.settings-overlay { z-index: 1004; }
.modal-box { position: relative; background: var(--fc-card); color: var(--fc-text); border-radius: 14px; padding: 24px 22px 18px; width: min(92vw, 420px); max-height: 85vh; overflow-y: auto; box-shadow: 0 8px 30px rgba(58,53,44,0.3); }
/* A banner image bled to the modal-box's own edges/corners (negative
margins matching its padding/border-radius above) when the planned meal
or Loved Dish is backed by a Grocy recipe with a photo - hidden entirely
otherwise. The close button floats over its top-right corner since it
comes later in paint order. */
.menu-editor-photo { display: none; width: calc(100% + 44px); max-height: 160px; object-fit: cover; margin: -24px -22px 14px; border-radius: 14px 14px 0 0; }
/* Read-only summary shown instead of the editable fields when a day/block
   already has a meal set - see _setMealEditorViewMode. Tapping the pencil
   next to the title reveals .meal-edit-fields for actually changing
   anything (name, link, etc.); this view is just "here's what's planned". */
.meal-view-card { margin-bottom: 16px; }
.meal-view-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
.meal-view-title { font-size: 1.15em; font-weight: 800; color: var(--fc-text); line-height: 1.25; }
.meal-view-edit-btn { flex: none; border: none; border-radius: 50%; width: 34px; height: 34px; background: var(--fc-surface-alt); color: var(--fc-text); font-size: 15px; cursor: pointer; box-shadow: var(--fc-shadow); }
.meal-view-facts { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13px; color: var(--fc-text-secondary); margin-bottom: 12px; }
.meal-view-recipe-btn { display: block; width: 100%; box-sizing: border-box; border: none; border-radius: 10px; padding: 12px; font-size: 15px; font-weight: 700; background: var(--fc-accent); color: var(--fc-accent-text); cursor: pointer; box-shadow: var(--fc-shadow); }
.debug-box { width: min(94vw, 560px); font-family: monospace; }
.settings-box { width: min(92vw, 400px); }
.modal-close { position: absolute; top: 10px; right: 10px; width: 36px; height: 36px; border-radius: 50%; border: none; background: var(--fc-surface-alt); color: var(--fc-text); font-size: 18px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: var(--fc-shadow); }
.modal-box h2 { margin: 0 26px 14px 0; font-size: 1.2em; color: var(--fc-text); }
.field { margin-bottom: 14px; }
.field-label-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 5px; }
.field label { display: block; font-size: 13px; font-weight: 600; color: var(--fc-text-secondary); margin-bottom: 5px; }
.pick-loved-btn { border: none; border-radius: 14px; padding: 5px 10px; font-size: 12px; font-weight: 700; background: #f2ddd4; color: #7a4436; cursor: pointer; white-space: nowrap; box-shadow: var(--fc-shadow); }
/* On its own full-width row below the "Dish name" label (rather than
   sharing that row, which never had enough space for all three once
   "From Grocy" joined "From suggested"/"Pick from loved" - see task
   history) so three buttons have the whole modal width to share instead
   of wrapping to a second line. Each takes an equal flex share and clips
   with an ellipsis rather than wrapping if the modal is ever narrower
   still (e.g. a very small phone). */
.pick-btn-group { display: flex; gap: 4px; flex-wrap: nowrap; margin-bottom: 8px; }
/* Formerly three separate "From suggested"/"Pick from loved"/"From
   Grocy" buttons here, one per source - replaced with a single entry
   point into the Recipe Box (now itself searchable, filterable, and
   sortable, including "Suggested first" - see _sortRecipeBoxList), which
   picker mode (_openLoved(true)) renders as one unified browse/pick
   surface instead of three separate, narrower ones. */
.pick-recipe-btn { border: none; border-radius: 14px; padding: 8px 10px; font-size: 12px; font-weight: 700; background: #f2ddd4; color: #7a4436; cursor: pointer; white-space: nowrap; box-shadow: var(--fc-shadow); width: 100%; }
.field input, .field textarea { width: 100%; box-sizing: border-box; font-size: 16px; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-family: inherit; }
.field textarea { resize: vertical; min-height: 60px; }
.size-btn-row { display: flex; gap: 8px; }
.size-btn { flex: 1 1 auto; min-height: 44px; border-radius: 10px; border: 2px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: var(--fc-shadow); }
.size-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
.hour-select { flex: 1 1 auto; min-height: 44px; border-radius: 10px; border: 2px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 14px; font-weight: 700; padding: 0 8px; box-shadow: var(--fc-shadow); }
.range-sep { display: flex; align-items: center; font-size: 13px; font-weight: 700; color: var(--fc-text-secondary); }
.color-swatches { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.swatch { width: 30px; height: 30px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; box-shadow: var(--fc-shadow), inset 0 0 0 1px rgba(58,53,44,0.15); }
.swatch.selected { border-color: var(--fc-accent); box-shadow: 0 0 0 2px var(--fc-card) inset, 0 0 0 2px var(--fc-accent); }
.input-color-custom { width: 34px; height: 30px; border: 2px solid transparent; padding: 0; border-radius: 8px; cursor: pointer; background: none; }
.rating-row { display: flex; gap: 10px; margin-bottom: 16px; }
.rating-btn { flex: 1 1 auto; min-height: 48px; border-radius: 10px; border: 2px solid var(--fc-border); background: var(--fc-card); font-size: 22px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: var(--fc-shadow); }
.rating-btn.active-up { background: #f2ddd4; border-color: #cf8f6c; }
.rating-btn.btn-heart { color: #d0342c; }
.rating-btn.active-down { background: #d8e3e0; border-color: #6f9a94; }
.modal-actions { display: flex; gap: 10px; margin-top: 6px; flex-wrap: wrap; }
.modal-actions button { flex: 1 1 auto; min-height: 44px; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; box-shadow: var(--fc-shadow); }
.btn-save { background: var(--fc-accent); color: var(--fc-accent-text); }
.btn-clear { background: var(--fc-accent3); color: #fff8ea; }
.btn-cancel { background: var(--fc-surface-alt); color: var(--fc-text); }
.settings-debug-btn { width: 100%; min-height: 40px; border-radius: 10px; border: none; background: var(--fc-surface-alt); color: var(--fc-text); font-size: 13px; font-weight: 700; cursor: pointer; margin-bottom: 14px; box-shadow: var(--fc-shadow); }
.loved-box { width: min(92vw, 480px); }
/* Wider than the other loved-box-based modals - each ingredient row here
   packs a raw-text input, amount field, unit select, product select, and a
   remove button on one line, which gets cramped fast at 480px. */
.recipe-import-box { width: min(94vw, 640px); }
.loved-hint { font-size: 12px; color: var(--fc-text-secondary); margin: -8px 0 12px; }
.loved-list { display: flex; flex-direction: column; gap: 10px; }
.loved-item { border: 1px solid var(--fc-border); border-radius: 10px; padding: 10px 12px; box-shadow: var(--fc-shadow); cursor: pointer; }
.loved-item.selectable { cursor: pointer; }
.loved-item.selectable:active { background: var(--fc-surface-alt); }
.loved-item .loved-name { font-size: 16px; font-weight: 800; display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.loved-item .loved-desc { font-size: 13px; color: var(--fc-text-secondary); margin-top: 4px; }
.loved-item .loved-link { font-size: 14px; cursor: pointer; }
.loved-item .grocy-picker-preview { font-size: 15px; cursor: pointer; opacity: 0.7; flex-shrink: 0; }
.loved-item .grocy-picker-preview:active { opacity: 1; }
.loved-empty { color: var(--fc-text-secondary); font-style: italic; text-align: center; padding: 20px 0; }
/* Recipe Box: a Pinterest-style browsable grid over the same "loved
   dishes" data the app already tracks, rather than a separate feature -
   see _renderLoved's non-picker branch. Kept as new classes layered onto
   the existing .loved-list/.loved-box (a "recipe-grid" modifier class
   toggled on the same container) instead of restyling .loved-item/
   .loved-list themselves, since those are shared verbatim by Suggestions,
   the Grocy picker, and Meal Templates - none of which should turn into
   a grid just because the Recipe Box did. */
.recipe-box-modal { width: min(94vw, 620px); }
/* flex-wrap here (added alongside the "Add from Grocy" button, task: "grocy
   recipes are not showing up in the recipe box") - four buttons at flex:1 1 0
   on one line left almost no room for label text on a phone-width modal;
   wrapping into two rows of two keeps every label readable instead of
   clipping or forcing the row to overflow the modal. */
.recipe-box-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.recipe-box-actions .suggestion-add-btn { flex: 1 1 calc(50% - 4px); min-width: 0; padding: 0 10px; text-align: center; }
.recipe-box-categories { display: flex; gap: 6px; flex-wrap: wrap; margin: -2px 0 12px; }
.recipe-chip { border: 1px solid var(--fc-border); border-radius: 20px; padding: 5px 12px; font-size: 12px; font-weight: 700; background: var(--fc-card); color: var(--fc-text-secondary); cursor: pointer; white-space: nowrap; }
.recipe-chip.active { background: var(--fc-accent); border-color: var(--fc-accent); color: var(--fc-accent-text); }
.loved-list.recipe-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 14px; }
.recipe-card { position: relative; border-radius: 16px; overflow: hidden; background: var(--fc-card); box-shadow: var(--fc-shadow); cursor: pointer; display: flex; flex-direction: column; transition: transform 0.12s ease; }
.recipe-card:active { transform: scale(0.97); }
.recipe-card-media { width: 100%; aspect-ratio: 1 / 1; background-size: cover; background-position: center; background-color: var(--fc-surface-alt); }
.recipe-card-media-placeholder { display: flex; align-items: center; justify-content: center; background-image: linear-gradient(135deg, var(--fc-surface-alt), var(--fc-surface2)); }
.recipe-card-media-placeholder span { font-size: 34px; font-weight: 800; color: var(--fc-text-secondary); opacity: 0.6; }
.recipe-card-heart, .recipe-card-suggest { position: absolute; top: 8px; width: 30px; height: 30px; border-radius: 50%; border: none; background: rgba(255,255,255,0.88); font-size: 15px; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,0.2); padding: 0; }
.recipe-card-heart { right: 8px; }
.recipe-card-heart.is-loved { background: rgba(255,255,255,0.95); }
.recipe-card-suggest.is-suggested { background: #ffe9a8; box-shadow: 0 0 0 2px #f2c94c inset, 0 1px 4px rgba(0,0,0,0.2); }
.recipe-card-suggest { left: 8px; }
.recipe-card-body { padding: 8px 10px 10px; flex: 1 1 auto; }
.recipe-card-name { font-size: 13px; font-weight: 800; line-height: 1.25; color: var(--fc-text); word-break: break-word; }
.recipe-card-category { display: inline-block; margin-top: 4px; font-size: 10px; font-weight: 700; color: var(--fc-text-secondary); background: var(--fc-surface-alt); border-radius: 8px; padding: 2px 7px; }
/* Recipe Box list view - same underlying data/actions as the grid cards
   above (see _renderLoved), just laid out as rows with a small square
   thumbnail instead of a big Pinterest-style tile. Its own classes so it
   doesn't inherit .recipe-card's aspect-ratio media block. */
.loved-list.recipe-list { display: flex; flex-direction: column; gap: 8px; }
.recipe-row { display: flex; align-items: center; gap: 10px; border-radius: 12px; padding: 8px; background: var(--fc-card); box-shadow: var(--fc-shadow); cursor: pointer; }
.recipe-row:active { background: var(--fc-surface-alt); }
.recipe-row-media { width: 52px; height: 52px; flex-shrink: 0; border-radius: 10px; background-size: cover; background-position: center; background-color: var(--fc-surface-alt); display: flex; align-items: center; justify-content: center; }
.recipe-row-media.recipe-row-media-placeholder { background-image: linear-gradient(135deg, var(--fc-surface-alt), var(--fc-surface2)); }
.recipe-row-media-placeholder span { font-size: 18px; font-weight: 800; color: var(--fc-text-secondary); opacity: 0.6; }
.recipe-row-body { flex: 1 1 auto; min-width: 0; }
.recipe-row-name { font-size: 14px; font-weight: 800; color: var(--fc-text); word-break: break-word; }
.recipe-row-category { display: inline-block; margin-top: 3px; font-size: 10px; font-weight: 700; color: var(--fc-text-secondary); background: var(--fc-surface-alt); border-radius: 8px; padding: 2px 7px; }
.recipe-row-actions { display: flex; gap: 6px; flex-shrink: 0; }
.recipe-row-heart, .recipe-row-suggest { border: none; background: var(--fc-surface-alt); width: 32px; height: 32px; border-radius: 50%; font-size: 15px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
.recipe-row-heart.is-loved { background: var(--fc-accent); }
.recipe-row-suggest.is-suggested { background: #ffe9a8; box-shadow: 0 0 0 2px #f2c94c inset; }
.dish-detail-photo { width: 100%; max-height: 220px; object-fit: cover; border-radius: 12px; margin-bottom: 10px; }
.dish-image-preview { width: 100%; max-height: 140px; object-fit: cover; border-radius: 10px; margin-top: 8px; }
/* Despite the name (left over from when this styled the old standalone
   Suggestions modal's intro line), .suggestions-hint is a shared generic
   "small helper text under a modal title" style now also used by the
   Meal Templates modal - don't remove it along with anything else
   Suggestions-specific. */
.suggestions-hint { font-size: 12px; color: var(--fc-text-secondary); margin: -8px 0 12px; }
.suggestion-add-row { display: flex; gap: 8px; margin-bottom: 14px; }
.suggestion-add-row.suggestion-add-link-row { margin-top: -8px; }
.suggestion-add-row input { flex: 1 1 auto; box-sizing: border-box; font-size: 16px; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-family: inherit; }
.suggestion-add-btn { flex: 0 0 auto; min-height: 44px; padding: 0 16px; border: none; border-radius: 10px; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: var(--fc-shadow); }
.add-dish-btn { width: 100%; margin-bottom: 12px; }
.sugg-remove-btn { flex: 0 0 auto; width: 26px; height: 26px; border-radius: 8px; border: none; background: var(--fc-surface-alt); color: #b5583c; font-size: 13px; cursor: pointer; }
.date-picker-row { display: flex; align-items: center; gap: 8px; }
.date-picker-row input { flex: 1 1 auto; }
.link-picker-row { display: flex; align-items: center; gap: 8px; }
.link-picker-row input { flex: 1 1 auto; }
.menu-link-open-btn { flex: 0 0 auto; width: 44px; height: 44px; border-radius: 10px; border: 2px solid var(--fc-border); background: var(--fc-card); font-size: 18px; cursor: pointer; box-shadow: var(--fc-shadow); }
.menu-link-open-btn:disabled { opacity: 0.4; cursor: default; box-shadow: none; }
/* The Recipe link field's "Open link" button stays visible outside the
More options accordion (task #172) even though the editable URL input
moved inside it, so this row lays the label and button out side-by-side
instead of the usual stacked field layout. */
.menu-link-quick-field { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.menu-link-quick-field label { margin-bottom: 0; }
.add-event-date-btn, .add-event-reminder-date-btn { flex: 0 0 auto; width: 44px; height: 44px; border-radius: 10px; border: 2px solid var(--fc-border); background: var(--fc-card); font-size: 18px; cursor: pointer; box-shadow: var(--fc-shadow); }
.add-event-tabs { display: flex; gap: 8px; margin-bottom: 4px; }
.add-event-tab-btn { flex: 1 1 0; min-height: 40px; padding: 8px 10px; border-radius: 10px; border: 2px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: var(--fc-shadow); }
.add-event-tab-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
.add-event-tab-panel { display: flex; flex-direction: column; gap: 12px; }
.debug-content { font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.debug-content .dbg-cal { margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px dashed var(--fc-border); }
.debug-content .dbg-err { color: #b5583c; font-weight: 700; }
.event-info-box { width: min(92vw, 420px); }
.event-info-title { font-size: 20px; font-weight: 800; margin: 0 26px 12px 0; }
.event-info-row { margin-bottom: 12px; font-size: 14px; }
.event-info-row .label { font-size: 12px; font-weight: 700; color: var(--fc-text-secondary); text-transform: uppercase; margin-bottom: 2px; }
.event-info-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 14px; font-size: 13px; font-weight: 700; color: #3a352c; box-shadow: var(--fc-shadow); }
.event-info-use-meal-buttons { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
.event-info-use-meal-btn { flex: 1 1 auto; min-height: 40px; padding: 6px 12px; border-radius: 10px; border: 2px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: var(--fc-shadow); }
.event-info-use-meal-btn:active { opacity: 0.7; }
.event-info-use-meal-btn.done { border-color: var(--fc-accent); background: #f0e6c4; }
.event-info-countdown-btn { min-height: 40px; padding: 6px 14px; border-radius: 10px; border: 2px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: var(--fc-shadow); }
.event-info-reminder-edit-row { display: flex; gap: 8px; margin-top: 8px; }
.event-info-reminder-edit-row input { flex: 1 1 auto; box-sizing: border-box; font-size: 14px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-family: inherit; }
.event-info-reminder-rollover-label { display: block; margin-top: 8px; font-size: 13px; }
.event-info-reminder-actions { display: flex; gap: 8px; margin-top: 8px; }
.event-info-reminder-save-btn, .event-info-reminder-done-btn { margin-top: 6px; min-height: 40px; padding: 6px 14px; border-radius: 10px; border: none; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: var(--fc-shadow); }
.event-info-reminder-save-btn:disabled, .event-info-reminder-done-btn:disabled { opacity: 0.6; cursor: default; }
.event-info-countdown-btn:active { opacity: 0.7; }
.event-info-countdown-btn.done { border-color: var(--fc-accent); background: #f0e6c4; }
.event-info-countdown-btn:disabled { opacity: 0.6; cursor: default; }
.people-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
.person-row { display: flex; align-items: center; gap: 6px; }
.person-row input[type="text"] { width: auto; }
.person-row .person-entity { flex: 1.3 1 0; min-width: 0; font-size: 13px !important; padding: 8px 10px !important; }
.person-row .person-name { flex: 1 1 0; min-width: 0; font-size: 13px !important; padding: 8px 10px !important; }
.person-row .person-color { width: 36px; height: 36px; padding: 0; border: 2px solid transparent; border-radius: 8px; cursor: pointer; background: none; flex: 0 0 auto; box-shadow: var(--fc-shadow); }
.person-countdown-btn { flex: 0 0 auto; width: 36px; height: 36px; border-radius: 8px; border: 2px solid var(--fc-border); background: var(--fc-card); font-size: 15px; cursor: pointer; opacity: 0.4; box-shadow: var(--fc-shadow); }
.person-notify-row { display: flex; align-items: center; gap: 6px; margin: -2px 0 4px; }
.person-notify-btn, .reminder-notify-btn { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 12px; border: 2px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 12px; font-weight: 700; cursor: pointer; box-shadow: var(--fc-shadow); }
.person-notify-count { display: inline-flex; align-items: center; justify-content: center; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 10px; font-weight: 800; }
.notify-devices-box { width: min(92vw, 420px); }
.notify-devices-subtitle { font-size: 13px; color: var(--fc-text-secondary); margin: -6px 0 12px; }
.notify-devices-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
.notify-devices-empty { font-size: 12px; color: var(--fc-text-secondary); font-style: italic; }
.notify-device-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px; background: var(--fc-surface-alt); }
.notify-device-name { flex: 1 1 0; min-width: 0; font-size: 13px; font-weight: 600; color: var(--fc-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.notify-device-remove-btn { flex: 0 0 auto; width: 30px; height: 30px; border-radius: 8px; border: none; background: var(--fc-card); color: var(--fc-text); font-size: 13px; cursor: pointer; box-shadow: var(--fc-shadow); }
.notify-devices-add-row { display: flex; gap: 6px; }
.notify-devices-add-select { flex: 1 1 0; min-width: 0; }
.notify-devices-add-btn { flex: 0 0 auto; min-height: 40px; padding: 6px 14px; border-radius: 10px; border: none; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: var(--fc-shadow); }
.notify-devices-add-btn:disabled { opacity: 0.4; cursor: default; }
.person-badges { display: flex; flex-direction: column; gap: 6px; margin: -2px 0 10px; }
.person-badge-row { display: flex; align-items: center; gap: 6px; }
.person-badge-row input { flex: 1 1 0; min-width: 0; font-size: 12px !important; padding: 6px 8px !important; }
.person-badge-row .person-badge-text { flex: 0 0 64px; }
.person-badge-remove-btn { flex: 0 0 auto; width: 30px; height: 30px; border-radius: 8px; border: none; background: var(--fc-surface-alt); color: #b5583c; font-size: 13px; cursor: pointer; }
.person-badge-add-btn { align-self: flex-start; border: none; border-radius: 12px; padding: 5px 10px; font-size: 11px; font-weight: 700; background: var(--fc-surface-alt); color: var(--fc-text); cursor: pointer; box-shadow: var(--fc-shadow); }
.person-countdown-btn.active { opacity: 1; border-color: var(--fc-accent); background: #f0e6c4; }
.person-remove-btn { flex: 0 0 auto; width: 36px; height: 36px; border-radius: 8px; border: none; background: var(--fc-surface-alt); color: #b5583c; font-size: 16px; cursor: pointer; box-shadow: var(--fc-shadow); }
.add-person-btn { width: 100%; min-height: 40px; border-radius: 10px; border: 2px dashed var(--fc-border); background: none; color: var(--fc-text-secondary); font-size: 14px; font-weight: 700; cursor: pointer; }
.people-hint { font-size: 11px; color: var(--fc-text-secondary); margin: -4px 0 8px; }
.remind-hint { font-size: 11px; color: var(--fc-text-secondary); margin: 5px 0 0; font-style: italic; }
.add-event-error { font-size: 12px; color: #b91c1c; background: rgba(185,28,28,0.1); border: 1px solid rgba(185,28,28,0.3); border-radius: 8px; padding: 8px 10px; margin: 4px 0 0; line-height: 1.4; }
.add-event-warn { font-size: 11px; color: #b45309; margin: 5px 0 0; font-style: italic; }
.remind-check-row { display: flex; flex-wrap: wrap; gap: 6px; }
.remind-check-opt { display: flex; align-items: center; gap: 4px; padding: 5px 9px; border-radius: 12px; background: var(--fc-surface-alt); color: var(--fc-text); font-size: 12px; font-weight: 600; cursor: pointer; user-select: none; }
.remind-check-opt input { margin: 0; }
.event-info-remind-row { align-items: flex-start; }
.event-info-remind-content { display: flex; flex-direction: column; gap: 4px; }
.event-info-remind-status { font-size: 11px; color: var(--fc-text-secondary); min-height: 14px; }
.event-info-remind-none { font-size: 12px; color: var(--fc-text-secondary); font-style: italic; }
.theme-section-label { font-size: 13px; font-weight: 800; color: var(--fc-text); margin: 6px 0 8px; text-transform: uppercase; letter-spacing: 0.02em; }
.accordion-toggle { width: 100%; display: flex; align-items: center; justify-content: space-between; background: var(--fc-surface-alt); border: none; border-radius: 10px; padding: 10px 12px; cursor: pointer; box-shadow: var(--fc-shadow); }
.accordion-toggle .theme-section-label { margin: 0; }
.accordion-chevron { font-size: 12px; color: var(--fc-text-secondary); transition: transform 0.2s ease; }
.accordion-toggle.open .accordion-chevron { transform: rotate(180deg); }
.accordion-body { display: none; margin-top: 10px; }
.accordion-body.open { display: block; }
/* .suggestions-search is likewise still a real, shared class - the Meal
   Templates search box (.suggestions-search.templates-search) uses this
   same base style, it isn't just a leftover from the old Suggestions
   modal. */
.loved-search, .suggestions-search { width: 100%; box-sizing: border-box; font-size: 15px; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-family: inherit; margin-bottom: 12px; }
/* Recipe Box grid/list view toggle - sits next to the search box rather
   than in the category chip row, since it's a display preference, not a
   filter, and is device-specific (see _recipeBoxViewMode) the same way
   the calendar's own "show timeline" toggle is. */
.recipe-box-search-row { display: flex; gap: 8px; align-items: flex-start; }
.recipe-box-search-row .loved-search { width: auto; flex: 1 1 auto; min-width: 0; margin-bottom: 0; }
.recipe-box-search-row { margin-bottom: 12px; }
.recipe-view-toggle { display: flex; gap: 4px; flex-shrink: 0; }
.recipe-view-btn { border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text-secondary); border-radius: 8px; width: 40px; height: 40px; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }
.recipe-view-btn.active { background: var(--fc-accent); border-color: var(--fc-accent); color: var(--fc-accent-text); }
.recipe-sort-select { width: 100%; box-sizing: border-box; font-size: 13px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-family: inherit; margin-bottom: 12px; }
/* Bulk-select delete mode (see _toggleRecipeBoxSelectMode) - browsing
   mode only, replaces the +Add/Import/Select action row with a compact
   "N selected / Cancel / Delete" bar while active. */
.recipe-box-select-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; padding: 10px 12px; border-radius: 10px; background: var(--fc-surface-alt); }
.recipe-box-select-count { font-size: 13px; font-weight: 700; color: var(--fc-text); }
.recipe-box-select-actions { display: flex; gap: 8px; }
.recipe-box-select-actions button { border: none; border-radius: 10px; padding: 7px 14px; font-size: 12px; font-weight: 700; cursor: pointer; }
.recipe-box-select-cancel { background: var(--fc-card); color: var(--fc-text-secondary); border: 1px solid var(--fc-border) !important; }
.recipe-box-select-delete { background: #e0685c; color: #fff; }
.recipe-card.is-selected { outline: 3px solid var(--fc-accent); outline-offset: -3px; }
.recipe-row.is-selected { background: var(--fc-surface-alt); outline: 2px solid var(--fc-accent); outline-offset: -2px; }
.recipe-card-select-badge { position: absolute; top: 8px; right: 8px; width: 26px; height: 26px; border-radius: 50%; background: rgba(255,255,255,0.9); border: 2px solid var(--fc-border); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; color: var(--fc-accent); }
.recipe-card.is-selected .recipe-card-select-badge { background: var(--fc-accent); border-color: var(--fc-accent); color: var(--fc-accent-text); }
.recipe-row-select-badge { width: 26px; height: 26px; flex-shrink: 0; border-radius: 50%; border: 2px solid var(--fc-border); background: var(--fc-card); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; color: var(--fc-accent); }
.recipe-row.is-selected .recipe-row-select-badge { background: var(--fc-accent); border-color: var(--fc-accent); color: var(--fc-accent-text); }
.dish-detail-box { width: min(92vw, 420px); }
.dish-detail-title { font-size: 20px; font-weight: 800; margin: 0 26px 10px 0; }
.dish-detail-rating { margin-bottom: 10px; }
.dish-detail-desc { font-size: 14px; color: var(--fc-text); line-height: 1.4; margin-bottom: 14px; white-space: pre-wrap; }
.dish-detail-link-row button { width: 100%; }
.theme-color-row, .theme-font-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.theme-color-row .theme-row-label, .theme-font-row .theme-row-label { flex: 1 1 auto; font-size: 13px; font-weight: 600; color: var(--fc-text); }
.theme-color-row input[type="color"] { width: 40px; height: 34px; padding: 0; border: 2px solid transparent; border-radius: 8px; cursor: pointer; background: none; flex: 0 0 auto; box-shadow: var(--fc-shadow); }
.theme-font-row input[type="number"] { width: 70px; text-align: center; font-size: 14px; padding: 6px 4px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); flex: 0 0 auto; }
.theme-reset-btn { width: 100%; min-height: 40px; border-radius: 10px; border: 2px dashed var(--fc-border); background: none; color: var(--fc-text-secondary); font-size: 13px; font-weight: 700; cursor: pointer; margin-top: 4px; }
</style>
<ha-card>
<div class="week-nav">
<div class="week-nav-side left">
<button class="settings-btn" title="Settings">&#9881;&#65039;</button>
<button class="view-btn" data-view="week" title="Week view">Week</button>
<button class="view-btn" data-view="month" title="Month view">Month</button>
<button class="edit-meals-btn" title="Rearrange meals">&#9999;&#65039; Edit</button>
</div>
<div class="week-nav-center">
<button class="nav-arrow nav-prev" aria-label="Previous">&#9664;</button>
<div class="week-label-wrap">
<div class="week-label">This Week</div>
<div class="countdown-line"></div>
<button type="button" class="week-shortcuts-toggle" aria-haspopup="true" aria-expanded="false" aria-label="Jump to a week">&#9660;</button>
</div>
<button class="nav-arrow nav-next" aria-label="Next">&#9654;</button>
</div>
<div class="week-nav-side right">
<button class="suggestions-btn">&#128161; Suggestions</button>
<button class="loved-btn">&#127869;&#65039; Recipe Box</button>
<div class="more-menu-wrap">
<button class="more-menu-btn" title="More" aria-haspopup="true" aria-expanded="false">&#8942; More</button>
<div class="more-menu-dropdown">
<button type="button" class="more-menu-item loved-menu-item">&#127869;&#65039; Recipe Box</button>
<button type="button" class="more-menu-item templates-btn">&#128203; Templates</button>
<button type="button" class="more-menu-item print-btn" title="Print or save as PDF">&#128424;&#65039; Print</button>
<button type="button" class="more-menu-item grocy-shopping-list-btn" title="View and add to your Grocy shopping list">&#128717; Shopping List</button>
<button type="button" class="more-menu-item grocy-expiring-btn" title="Items in Grocy stock expiring within 30 days">&#8987; Expiring Soon</button>
<button type="button" class="more-menu-item grocy-low-stock-btn" title="Items in Grocy stock below their minimum amount">&#128230; Low Stock</button>
</div>
</div>
</div>
</div>
<div class="week-shortcuts">
<button class="week-shortcut" data-weeks="0">This Week</button>
<button class="week-shortcut" data-weeks="1">Next Week</button>
<button class="week-shortcut" data-weeks="2">In 2 Weeks</button>
</div>
<div class="legend"></div>
<div class="grid mode-week"></div>
<div class="modal-overlay edit-overlay">
<div class="modal-box">
<button class="modal-close" aria-label="Close">&#10005;</button>
<img class="menu-editor-photo" style="display:none;" alt="" />
<h2 class="modal-day-title">Edit menu</h2>
<div class="meal-view-card" style="display:none;">
<div class="meal-view-header">
<div class="meal-view-title"></div>
<button type="button" class="meal-view-edit-btn" title="Edit recipe details">&#9999;&#65039;</button>
</div>
<div class="meal-view-facts">
<span class="meal-view-fact meal-view-prep" style="display:none;">&#9200; Prep: <span class="meal-view-prep-value"></span></span>
<span class="meal-view-fact meal-view-cook" style="display:none;">&#128293; Cook: <span class="meal-view-cook-value"></span></span>
<span class="meal-view-fact meal-view-serves" style="display:none;">&#128101; Serves: <span class="meal-view-serves-value"></span></span>
</div>
<button type="button" class="meal-view-recipe-btn" style="display:none;">View Recipe &rarr;</button>
</div>
<div class="meal-edit-fields">
<div class="field">
<label>Dish name</label>
<div class="pick-btn-group dish-hide-field">
<button class="pick-recipe-btn" type="button">&#127869;&#65039; Pick a Recipe</button>
</div>
<input type="text" class="input-name" placeholder="e.g. Taco night" maxlength="120" />
</div>
<div class="field">
<label>Description</label>
<textarea class="input-description" placeholder="Notes, sides, who's cooking..." maxlength="255"></textarea>
</div>
<div class="field dish-only-field" style="display:none;">
<label>Category</label>
<input type="text" class="input-category" list="dish-category-options" placeholder="e.g. Dinner" maxlength="40" />
<datalist id="dish-category-options"></datalist>
</div>
<div class="field dish-only-field" style="display:none;">
<label class="remind-check-opt"><input type="checkbox" class="input-add-suggestion" />&#128161; Also add to Meal Suggestions</label>
</div>
<div class="field menu-link-quick-field">
<label>Recipe link</label>
<button type="button" class="menu-link-open-btn" title="Open link" disabled>&#128279;</button>
</div>
<div class="field">
<button type="button" class="accordion-toggle" data-target="menu-more-options-body">
<span class="theme-section-label">More options</span>
<span class="accordion-chevron">&#9660;</span>
</button>
<div class="accordion-body" id="menu-more-options-body">
<div class="field">
<label>Edit recipe link</label>
<input type="url" class="input-link" placeholder="https://..." maxlength="255" />
</div>
<div class="field dish-hide-field servings-field" style="display:none;">
<label>Servings <small>(for the Grocy shopping list)</small></label>
<input type="number" class="input-servings" min="1" max="99" placeholder="Recipe's default" />
</div>
<div class="field dish-only-field" style="display:none;">
<label>Photo URL <small>(shown on its Recipe Box card)</small></label>
<input type="url" class="input-dish-image" placeholder="https://..." maxlength="500" />
<img class="dish-image-preview" style="display:none;" alt="" />
</div>
<div class="field dish-hide-field">
<label>Card color</label>
<div class="color-swatches">
<button type="button" class="swatch" data-color="#f0e6c4" style="background:#f0e6c4" title="Wheat"></button>
<button type="button" class="swatch" data-color="#f2ddd4" style="background:#f2ddd4" title="Blush"></button>
<button type="button" class="swatch" data-color="#dbe6d2" style="background:#dbe6d2" title="Sage"></button>
<button type="button" class="swatch" data-color="#d8e3e0" style="background:#d8e3e0" title="Sky mist"></button>
<button type="button" class="swatch" data-color="#e6dcee" style="background:#e6dcee" title="Lilac"></button>
<button type="button" class="swatch" data-color="#f2ddc4" style="background:#f2ddc4" title="Peach"></button>
<button type="button" class="swatch" data-color="#e6e0d4" style="background:#e6e0d4" title="Warm gray"></button>
<input type="color" class="input-color-custom" title="Custom color" value="#f0e6c4" />
</div>
</div>
<div class="field dish-hide-field">
<label class="remind-check-opt"><input type="checkbox" class="input-recur-weekly" />&#128257; Repeat weekly (until turned off or overridden for one week)</label>
</div>
</div>
</div>
</div>
<div class="rating-row">
<button class="rating-btn btn-heart" title="Love it">&#10084;&#65039;</button>
<button class="rating-btn btn-thumbsdown" title="Not a fan">&#128078;</button>
</div>
<div class="modal-actions">
<button class="btn-clear">Clear</button>
<button class="btn-delete-dish btn-clear" style="display:none;">Delete</button>
<button class="btn-cancel">Cancel</button>
<button class="btn-save">Save</button>
</div>
</div>
</div>
<div class="modal-overlay loved-overlay">
<div class="modal-box loved-box recipe-box-modal">
<button class="modal-close loved-close" aria-label="Close">&#10005;</button>
<h2 class="loved-title">&#127869;&#65039; Recipe Box</h2>
<div class="loved-hint" style="display:none;">Tap a dish to fill in the menu editor.</div>
<div class="recipe-box-actions">
<button type="button" class="suggestion-add-btn add-dish-btn">+ Add Recipe</button>
<button type="button" class="suggestion-add-btn recipe-box-grocy-btn">&#127838; Add from Grocy</button>
<button type="button" class="suggestion-add-btn recipe-box-import-btn">&#128279; Import from a link</button>
<button type="button" class="suggestion-add-btn recipe-box-select-btn">&#9989; Select</button>
</div>
<div class="recipe-box-select-bar" style="display:none;">
<span class="recipe-box-select-count">0 selected</span>
<div class="recipe-box-select-actions">
<button type="button" class="recipe-box-select-cancel">Cancel</button>
<button type="button" class="recipe-box-select-delete">Delete</button>
</div>
</div>
<div class="recipe-box-search-row">
<input type="text" class="loved-search" placeholder="&#128269; Search recipes..." />
<div class="recipe-view-toggle">
<button type="button" class="recipe-view-btn" data-view="grid" title="Grid view" aria-label="Grid view">&#9638;</button>
<button type="button" class="recipe-view-btn" data-view="list" title="List view" aria-label="List view">&#9776;</button>
</div>
</div>
<select class="recipe-sort-select">
<option value="default">Sort: Default order</option>
<option value="name">Sort: Name (A-Z)</option>
<option value="suggested">Sort: Suggested first</option>
</select>
<div class="recipe-box-categories"></div>
<div class="loved-list"></div>
</div>
</div>
<div class="modal-overlay dish-detail-overlay">
<div class="modal-box dish-detail-box">
<button class="modal-close dish-detail-close" aria-label="Close">&#10005;</button>
<h2 class="dish-detail-title"></h2>
<img class="dish-detail-photo" style="display:none;" alt="" />
<div class="dish-detail-rating"></div>
<div class="dish-detail-desc"></div>
<div class="dish-detail-link-row"></div>
<div class="modal-actions">
<button class="btn-cancel dish-detail-suggest-btn">&#128161; Suggest this</button>
<button class="btn-cancel dish-detail-edit-btn">&#9999;&#65039; Edit</button>
<button class="btn-clear dish-detail-delete-btn">&#128465;&#65039; Delete</button>
</div>
</div>
</div>
<!-- There's no standalone "Meal Suggestions" modal here anymore - the
     Recipe Box is the only place a suggestion gets created (search a
     recipe and tap the 💡 icon, or check "Also add to Meal Suggestions"
     while adding/editing one) AND the only place to view them, via its
     own "💡 Suggested" filter chip (see _openSuggestedRecipes,
     _suggestDish, and the dish editor's .input-add-suggestion checkbox). -->
<div class="modal-overlay grocy-picker-overlay">
<div class="modal-box loved-box">
<button class="modal-close grocy-picker-close" aria-label="Close">&#10005;</button>
<h2 class="grocy-picker-title">&#127838; Add from Grocy</h2>
<div class="grocy-picker-status"></div>
<input type="text" class="grocy-picker-search" placeholder="&#128269; Search Grocy recipes..." />
<div class="loved-list grocy-picker-list"></div>
<button type="button" class="suggestion-add-btn recipe-import-open-btn">&#128279; Import a recipe from a link</button>
</div>
</div>
<div class="modal-overlay grocy-recipe-viewer-overlay">
<div class="modal-box loved-box">
<button class="modal-close grocy-recipe-viewer-close" aria-label="Close">&#10005;</button>
<button type="button" class="grocy-recipe-viewer-back-btn" style="display:none;">&#8592; Back</button>
<h2 class="grocy-recipe-viewer-title"></h2>
<div class="grocy-recipe-viewer-status"></div>
<div class="grocy-recipe-viewer-stats"></div>
<div class="grocy-recipe-viewer-columns">
<div class="grocy-recipe-viewer-main-col">
<div class="grocy-recipe-viewer-servings"></div>
<div class="grocy-recipe-viewer-scale-row" style="display:none;">
<span class="grocy-recipe-viewer-scale-label">Scale ingredients for</span>
<button type="button" class="grocy-recipe-viewer-scale-down" aria-label="Fewer servings">&#8722;</button>
<span class="grocy-recipe-viewer-scale-value"></span>
<span class="grocy-recipe-viewer-scale-unit">servings</span>
<button type="button" class="grocy-recipe-viewer-scale-up" aria-label="More servings">&#43;</button>
</div>
<div class="grocy-recipe-viewer-ingredients"></div>
</div>
<img class="grocy-recipe-viewer-photo" style="display:none;" alt="" />
</div>
<div class="grocy-recipe-viewer-instructions"></div>
<div class="grocy-recipe-viewer-description"></div>
<div class="grocy-recipe-viewer-footer">
<button type="button" class="suggestion-add-btn grocy-recipe-viewer-consume-btn">&#127860; Mark Consumed (deduct from Grocy stock)</button>
<button type="button" class="suggestion-add-btn grocy-recipe-viewer-open-btn">&#128279; Open in Grocy</button>
</div>
</div>
</div>
<div class="modal-overlay recipe-import-overlay">
<div class="modal-box loved-box recipe-import-box">
<button class="modal-close recipe-import-close" aria-label="Close">&#10005;</button>
<h2>&#128279; Import a Recipe</h2>
<div class="recipe-import-hint">Paste a link to a recipe page - this reads the same structured data most recipe sites already publish for Google/Pinterest, no AI involved.</div>
<input type="url" class="recipe-import-url-input" placeholder="https://example.com/some-recipe" />
<button type="button" class="suggestion-add-btn recipe-import-fetch-btn">Fetch Recipe</button>
<div class="recipe-import-divider">— or —</div>
<div class="recipe-import-hint">Paste the recipe's text instead (e.g. copied from an email, note, or a page with no link). Works best with an "Ingredients" line and a "Directions"/"Instructions" line separating the two parts, but anything is fine to start from.</div>
<textarea class="recipe-import-text-input" rows="4" placeholder="Paste the recipe text here…"></textarea>
<button type="button" class="suggestion-add-btn recipe-import-parse-text-btn">Parse Text</button>
<div class="recipe-import-divider">— or —</div>
<button type="button" class="recipe-import-manual-btn">&#9998;&#65039; Skip this, I'll enter it by hand</button>
<div class="recipe-import-status"></div>
<div class="recipe-import-review" style="display:none;">
<img class="recipe-import-photo-preview" style="display:none;" alt="Recipe photo" />
<div class="field">
<label>Recipe name</label>
<input type="text" class="recipe-import-name-input" />
</div>
<div class="field">
<label>Image URL</label>
<input type="url" class="recipe-import-image-input" placeholder="https://example.com/photo.jpg" />
</div>
<div class="field">
<label>Source (link or where this came from)</label>
<input type="text" class="recipe-import-source-input" placeholder="https://example.com/some-recipe, or e.g. \"Mom's recipe box\"" />
</div>
<div class="field">
<label>Servings</label>
<input type="text" class="recipe-import-servings-input" />
</div>
<label class="remind-check-opt recipe-import-manage-ingredients-opt"><input type="checkbox" class="recipe-import-manage-ingredients-check" checked /> Manage Ingredients with Grocy</label>
<div class="recipe-import-hint recipe-import-manage-ingredients-off-hint" style="display:none;">Ingredients won't be matched or linked to Grocy products - the recipe will still import with its plain ingredient text. Turn this back on any time to match ingredients against your Grocy products again.</div>
<div class="recipe-import-ingredients-section">
<div class="recipe-import-ingredients-header">
<span class="recipe-import-ingredients-label">Ingredients (matched against your Grocy products)</span>
<button type="button" class="recipe-import-refresh-btn" title="Re-check matches (e.g. after adding a missing product in Grocy)">&#128260; Refresh matches</button>
</div>
<div class="recipe-import-hint">Anything not found needs to be added as a product in Grocy first (Grocy's own product form asks for details like unit and location this can't guess) - add it there, then tap Refresh matches, or just pick the closest existing product from the list instead. Edit any ingredient's text directly if it didn't come through quite right.</div>
<input type="text" class="recipe-import-ingredient-search-input" placeholder="Search ingredients…" />
<div class="recipe-import-ingredients-list"></div>
<div class="recipe-import-ingredients-empty-filter" style="display:none;">No ingredients match your search.</div>
<button type="button" class="recipe-import-add-ingredient-btn">&#10133; Add ingredient line</button>
</div>
<div class="recipe-import-instructions-label">Instructions</div>
<textarea class="recipe-import-instructions-input" rows="6" placeholder="One step per line…"></textarea>
<div class="recipe-import-hint">Quantities are carried over as plain text on each ingredient - worth a quick check in Grocy afterward if you plan to use this recipe's shopping list feature.</div>
<label class="remind-check-opt"><input type="checkbox" class="recipe-import-include-ingredients-check" checked /> Include ingredients in the preparation text</label>
<button type="button" class="suggestion-add-btn recipe-import-create-btn">&#128190; Add to Grocy</button>
<button type="button" class="recipe-import-debug-btn">&#128027; Copy debug info</button>
</div>
</div>
</div>
<div class="modal-overlay grocy-shopping-list-overlay">
<div class="modal-box loved-box">
<button class="modal-close grocy-shopping-list-close" aria-label="Close">&#10005;</button>
<h2>&#128717; Shopping List</h2>
<!-- Two tabs sharing one modal: "This Week's Meals" (push a planned
     recipe's missing ingredients onto Grocy's shopping list - was its own
     standalone "Grocery List" modal/More-menu button) and "Grocy List"
     (the live Grocy shopping list itself: add/check off/remove/put away).
     Merged into one modal since they're really two steps of the same
     errand - plan the ingredients, then shop and put them away - see
     _openGrocyShoppingList/_switchShoppingListTab. -->
<div class="shopping-tabs">
<button type="button" class="shopping-tab-btn" data-shopping-tab="meals">&#128722; This Week's Meals</button>
<button type="button" class="shopping-tab-btn active" data-shopping-tab="list">&#128717; Grocy List</button>
</div>
<div class="shopping-tab-panel" data-shopping-tab-panel="meals" style="display:none;">
<div class="grocery-list-meals"></div>
<div class="grocery-list-status"></div>
<button type="button" class="suggestion-add-btn grocery-list-push-btn">Add checked to Grocy shopping list</button>
</div>
<div class="shopping-tab-panel" data-shopping-tab-panel="list">
<div class="grocy-shopping-list-picker-row" style="display:none;">
<select class="grocy-shopping-list-picker"></select>
<button type="button" class="grocy-shopping-list-new-list-btn" title="Create a new shopping list">+ New List</button>
</div>
<div class="grocy-shopping-list-add-row">
<input type="text" class="grocy-shopping-list-add-input" placeholder="Add an item..." />
<input type="number" class="grocy-shopping-list-add-amount" min="0.01" step="any" value="1" title="Amount" />
<button type="button" class="grocy-shopping-list-add-btn">Add</button>
</div>
<div class="grocy-shopping-list-status"></div>
<div class="grocy-shopping-list-items"></div>
<div class="grocy-shopping-list-total" style="display:none;"></div>
</div>
</div>
</div>
<div class="modal-overlay grocy-expiring-overlay">
<div class="modal-box loved-box">
<button class="modal-close grocy-expiring-close" aria-label="Close">&#10005;</button>
<h2>&#8987; Expiring Soon</h2>
<div class="grocy-expiring-status"></div>
<div class="grocy-expiring-sections" style="display:none;">
<div class="grocy-expiring-section">
<div class="grocy-expiring-section-label">Within 7 days</div>
<div class="grocy-expiring-items grocy-expiring-items-7"></div>
</div>
<div class="grocy-expiring-section">
<div class="grocy-expiring-section-label">Within 30 days</div>
<div class="grocy-expiring-items grocy-expiring-items-30"></div>
</div>
</div>
</div>
</div>
<div class="modal-overlay grocy-low-stock-overlay">
<div class="modal-box loved-box">
<button class="modal-close grocy-low-stock-close" aria-label="Close">&#10005;</button>
<h2>&#128230; Low Stock</h2>
<div class="grocy-low-stock-status"></div>
<button type="button" class="grocy-low-stock-add-all-btn" style="display:none;">Add All to Shopping List</button>
<div class="grocy-low-stock-items"></div>
</div>
</div>
<div class="modal-overlay templates-overlay">
<div class="modal-box loved-box">
<button class="modal-close templates-close" aria-label="Close">&#10005;</button>
<h2 class="templates-title">&#128203; Meal Templates</h2>
<div class="suggestions-hint">Save this week's whole meal plan as a reusable template, then apply it to any week later with one tap.</div>
<button type="button" class="suggestion-add-btn templates-save-btn">&#128190; Save this week as a template</button>
<input type="text" class="suggestions-search templates-search" placeholder="&#128269; Search templates..." />
<div class="loved-list templates-list"></div>
</div>
</div>
<div class="modal-overlay debug-overlay">
<div class="modal-box debug-box">
<button class="modal-close debug-close" aria-label="Close">&#10005;</button>
<h2>Debug Info</h2>
<div class="debug-content"></div>
</div>
</div>
<div class="modal-overlay event-info-overlay">
<div class="modal-box event-info-box">
<button class="modal-close event-info-close" aria-label="Close">&#10005;</button>
<div class="event-info-title"></div>
<div class="event-info-content"></div>
</div>
</div>
<div class="modal-overlay settings-overlay">
<div class="modal-box settings-box">
<button class="modal-close settings-close" aria-label="Close">&#10005;</button>
<h2>&#9881;&#65039; Settings</h2>
<button type="button" class="settings-debug-btn">&#128027; Debug Info</button>
<div class="field">
<button type="button" class="accordion-toggle" data-target="calendars-body">
<span class="theme-section-label">Calendars</span>
<span class="accordion-chevron">&#9660;</span>
</button>
<div class="accordion-body" id="calendars-body">
<div class="people-hint">Tap &#9203; on a calendar to include its events in the countdown banner. Use &#10133; Add badge to show a small bubble (like "N", in that calendar's color) on days with events matching a keyword, and optionally hide events matching another keyword.</div>
<div class="people-list"></div>
<button type="button" class="add-person-btn">+ Add calendar</button>
</div>
</div>
<div class="field">
<button type="button" class="accordion-toggle" data-target="reminders-body">
<span class="theme-section-label">Reminders</span>
<span class="accordion-chevron">&#9660;</span>
</button>
<div class="accordion-body" id="reminders-body">
<div class="people-hint">Reminders (from the &#128276; tab of the Add Event modal) are saved as Home Assistant to-do items in <code class="reminders-entity-label"></code> - not events on your calendar. Mark them done, edit them, or reschedule them anytime from Home Assistant's own To-do UI (or the &#9989; Mark done button in the event-info popup), independent of Google Calendar or whatever your other calendars are backed by. They aren't tied to any one calendar, so they share this one notify setting instead of a per-calendar row.</div>
<div class="add-event-warn reminders-entity-missing-warn" style="display:none"></div>
<button type="button" class="reminder-notify-btn">&#128276; Notify <span class="reminder-notify-count">0</span></button>
<div class="field">
<label>Notification tap destination</label>
<input type="text" class="notify-click-path-input" placeholder="/lovelace-family/0" maxlength="255" />
<div class="remind-hint">Optional. When set, tapping a reminder, event, or Daily Digest push notification opens this Home Assistant dashboard/view instead of just launching the app - use a relative path like /lovelace-family/0 (dashboard + view) or /lovelace/calendar (a view's own path). Applies to every notification this backend sends, not just Reminders. Needs the Home Assistant Companion app.</div>
</div>
</div>
</div>
<div class="field">
<label>Default view</label>
<div class="size-btn-row">
<button type="button" class="size-btn default-view-btn" data-value="week">Week</button>
<button type="button" class="size-btn default-view-btn" data-value="month">Month</button>
</div>
</div>
<div class="field">
<label>Lock vertical scrolling</label>
<div class="size-btn-row">
<button type="button" class="size-btn scroll-lock-btn" data-value="off">Unlocked</button>
<button type="button" class="size-btn scroll-lock-btn" data-value="on">Locked</button>
</div>
</div>
<div class="field">
<button type="button" class="accordion-toggle" data-target="menu-blocks-body">
<span class="theme-section-label">Menu Blocks</span>
<span class="accordion-chevron">&#9660;</span>
</button>
<div class="accordion-body" id="menu-blocks-body">
<div class="field">
<label>Menu blocks per day</label>
<div class="size-btn-row">
<button type="button" class="size-btn block-count-btn" data-count="1">1</button>
<button type="button" class="size-btn block-count-btn" data-count="2">2</button>
<button type="button" class="size-btn block-count-btn" data-count="3">3</button>
</div>
</div>
<div class="field">
<label>Breakfast on weekends</label>
<div class="size-btn-row">
<button type="button" class="size-btn weekend-breakfast-btn" data-value="off">Off</button>
<button type="button" class="size-btn weekend-breakfast-btn" data-value="on">On</button>
</div>
</div>
<div class="field">
<label>Block size</label>
<div class="size-btn-row">
<button type="button" class="size-btn block-size-btn" data-size="small">Small</button>
<button type="button" class="size-btn block-size-btn" data-size="medium">Medium</button>
<button type="button" class="size-btn block-size-btn" data-size="large">Large</button>
</div>
</div>
<div class="field">
<label>Show meal plan in month view</label>
<div class="size-btn-row">
<button type="button" class="size-btn meals-in-month-btn" data-value="off">Off</button>
<button type="button" class="size-btn meals-in-month-btn" data-value="on">On</button>
</div>
</div>
<div class="field block-name-field" data-index="0">
<label>Block 1 name</label>
<input type="text" class="block-name-input" data-index="0" placeholder="Breakfast" maxlength="30" />
</div>
<div class="field block-name-field" data-index="1">
<label>Block 2 name</label>
<input type="text" class="block-name-input" data-index="1" placeholder="Lunch" maxlength="30" />
</div>
<div class="field block-name-field" data-index="2">
<label>Block 3 name</label>
<input type="text" class="block-name-input" data-index="2" placeholder="Dinner" maxlength="30" />
</div>
</div>
</div>
<div class="field">
<label>Show hours of the day (timeline) — this device only</label>
<div class="size-btn-row">
<button type="button" class="size-btn timeline-btn" data-value="off">Off</button>
<button type="button" class="size-btn timeline-btn" data-value="on">On</button>
</div>
</div>
<div class="field">
<label>Timeline range</label>
<div class="size-btn-row">
<select class="hour-select timeline-start-select">${hourOptionsHtml}</select>
<div class="range-sep">to</div>
<select class="hour-select timeline-end-select">${endHourOptionsHtml}</select>
</div>
</div>
<div class="field">
<button type="button" class="accordion-toggle" data-target="countdown-body">
<span class="theme-section-label">Countdown</span>
<span class="accordion-chevron">&#9660;</span>
</button>
<div class="accordion-body" id="countdown-body">
<div class="field">
<label>Countdown banner</label>
<div class="size-btn-row">
<button type="button" class="size-btn countdown-enabled-btn" data-value="off">Off</button>
<button type="button" class="size-btn countdown-enabled-btn" data-value="on">On</button>
</div>
</div>
<div class="field">
<label>Custom countdown items</label>
<div class="countdown-items-list"></div>
<div class="countdown-add-row">
<input type="text" class="countdown-add-label-input" placeholder="e.g. Disney Trip" maxlength="40" />
<input type="date" class="countdown-add-date-input" />
<button type="button" class="template-apply-btn countdown-add-btn">+ Add</button>
</div>
</div>
<div class="field">
<label class="remind-check-opt"><input type="checkbox" class="countdown-ticker-check" /> Cycle through all upcoming countdown items</label>
<div class="remind-hint">Add more than one item above (or mark events/reminders "Use as countdown") to see this in action — with only one item there's nothing to cycle through.</div>
</div>
</div>
</div>
<div class="field">
<button type="button" class="accordion-toggle" data-target="digest-body">
<span class="theme-section-label">Daily Digest</span>
<span class="accordion-chevron">&#9660;</span>
</button>
<div class="accordion-body" id="digest-body">
<div class="remind-hint">Sends one notification each morning summarizing today's events, meals, and due reminders — independent of anyone having the dashboard open. Requires the Family Hub integration installed.</div>
<div class="field">
<label>Send daily digest</label>
<div class="size-btn-row">
<button type="button" class="size-btn digest-enabled-btn" data-value="off">Off</button>
<button type="button" class="size-btn digest-enabled-btn" data-value="on">On</button>
</div>
</div>
<div class="field">
<label>Send at</label>
<input type="time" class="digest-time-input" />
</div>
<div class="field">
<button type="button" class="reminder-notify-btn digest-notify-btn">&#128276; Notify <span class="digest-notify-count">0</span></button>
</div>
</div>
</div>
<div class="field">
<button type="button" class="accordion-toggle" data-target="grocy-settings-body">
<span class="theme-section-label">Grocy</span>
<span class="accordion-chevron">&#9660;</span>
</button>
<div class="accordion-body" id="grocy-settings-body">
<div class="remind-hint">Connect Grocy itself under Settings → Devices & Services → Family Hub → Configure → Grocy - the toggles below only control which optional Grocy-powered features show up on the card once it's connected. Everything here is off by default.</div>
<div class="field">
<label>Track expiring items</label>
<div class="size-btn-row">
<button type="button" class="size-btn grocy-expiring-enabled-btn" data-value="off">Off</button>
<button type="button" class="size-btn grocy-expiring-enabled-btn" data-value="on">On</button>
</div>
<div class="remind-hint">Adds an "Expiring Soon" list under the More menu.</div>
<label>Include in Daily Digest</label>
<div class="size-btn-row">
<button type="button" class="size-btn grocy-expiring-digest-enabled-btn" data-value="off">Off</button>
<button type="button" class="size-btn grocy-expiring-digest-enabled-btn" data-value="on">On</button>
</div>
<div class="remind-hint">Adds items-expiring-in-7/30-days counts to the morning digest notification.</div>
</div>
<div class="field">
<label>Track low stock</label>
<div class="size-btn-row">
<button type="button" class="size-btn grocy-low-stock-enabled-btn" data-value="off">Off</button>
<button type="button" class="size-btn grocy-low-stock-enabled-btn" data-value="on">On</button>
</div>
<div class="remind-hint">Adds a "Low Stock" list under the More menu (products below their own minimum stock amount, with a one-tap button to add them all to the shopping list).</div>
<label>Include in Daily Digest</label>
<div class="size-btn-row">
<button type="button" class="size-btn grocy-low-stock-digest-enabled-btn" data-value="off">Off</button>
<button type="button" class="size-btn grocy-low-stock-digest-enabled-btn" data-value="on">On</button>
</div>
<div class="remind-hint">Adds a running-low count to the morning digest notification.</div>
</div>
</div>
</div>
<div class="field">
<label>Use global theme (Theme Builder)</label>
<div class="size-btn-row">
<button type="button" class="size-btn global-theme-btn" data-value="off">Off</button>
<button type="button" class="size-btn global-theme-btn" data-value="on">On</button>
</div>
<select class="global-theme-select" style="display:none;margin-top:8px;width:100%;box-sizing:border-box;font-size:16px;padding:10px 12px;border-radius:8px;border:1px solid var(--fc-border);background:var(--fc-card);color:var(--fc-text);font-family:inherit;"></select>
<div class="global-theme-status" style="display:none;font-size:12px;color:var(--fc-text-secondary);font-style:italic;margin-top:6px;"></div>
</div>
<div class="field theme-local-fields">
<button type="button" class="accordion-toggle" data-target="theme-colors-body">
<span class="theme-section-label">Theme colors</span>
<span class="accordion-chevron">&#9660;</span>
</button>
<div class="accordion-body" id="theme-colors-body">
<div class="theme-color-row"><div class="theme-row-label">Background</div><input type="color" class="theme-color-input" data-key="bg" /></div>
<div class="theme-color-row"><div class="theme-row-label">Card background</div><input type="color" class="theme-color-input" data-key="card" /></div>
<div class="theme-color-row"><div class="theme-row-label">Border</div><input type="color" class="theme-color-input" data-key="border" /></div>
<div class="theme-color-row"><div class="theme-row-label">Text</div><input type="color" class="theme-color-input" data-key="text" /></div>
<div class="theme-color-row"><div class="theme-row-label">Secondary text</div><input type="color" class="theme-color-input" data-key="textSecondary" /></div>
<div class="theme-color-row"><div class="theme-row-label">Accent</div><input type="color" class="theme-color-input" data-key="accent" /></div>
<div class="theme-color-row"><div class="theme-row-label">Text on accent</div><input type="color" class="theme-color-input" data-key="accentText" /></div>
<div class="theme-color-row"><div class="theme-row-label">Accent 2</div><input type="color" class="theme-color-input" data-key="accent2" /></div>
<div class="theme-color-row"><div class="theme-row-label">Accent 3</div><input type="color" class="theme-color-input" data-key="accent3" /></div>
<div class="theme-color-row"><div class="theme-row-label">Surface (alt)</div><input type="color" class="theme-color-input" data-key="surfaceAlt" /></div>
<div class="theme-color-row"><div class="theme-row-label">Surface 2</div><input type="color" class="theme-color-input" data-key="surface2" /></div>
</div>
</div>
<div class="field theme-local-fields">
<button type="button" class="accordion-toggle" data-target="theme-fonts-body">
<span class="theme-section-label">Theme font sizes (px)</span>
<span class="accordion-chevron">&#9660;</span>
</button>
<div class="accordion-body" id="theme-fonts-body">
<div class="theme-font-row"><div class="theme-row-label">Day name</div><input type="number" class="theme-font-input" data-key="dayName" min="6" max="72" /></div>
<div class="theme-font-row"><div class="theme-row-label">Day number</div><input type="number" class="theme-font-input" data-key="dayNumber" min="6" max="72" /></div>
<div class="theme-font-row"><div class="theme-row-label">Weather temp</div><input type="number" class="theme-font-input" data-key="wxTemp" min="6" max="72" /></div>
<div class="theme-font-row"><div class="theme-row-label">Event text</div><input type="number" class="theme-font-input" data-key="event" min="6" max="72" /></div>
<div class="theme-font-row"><div class="theme-row-label">Chip text</div><input type="number" class="theme-font-input" data-key="chip" min="6" max="72" /></div>
<div class="theme-font-row"><div class="theme-row-label">Header title</div><input type="number" class="theme-font-input" data-key="headerTitle" min="6" max="72" /></div>
<div class="theme-font-row"><div class="theme-row-label">Countdown text</div><input type="number" class="theme-font-input" data-key="countdown" min="6" max="72" /></div>
<div class="theme-font-row"><div class="theme-row-label">Block heading (label)</div><input type="number" class="theme-font-input" data-key="blockLabel" min="6" max="72" /></div>
<div class="theme-font-row"><div class="theme-row-label">Block meal text</div><input type="number" class="theme-font-input" data-key="blockMeal" min="6" max="72" /></div>
<button type="button" class="theme-reset-btn">Reset theme to default</button>
</div>
</div>
<div class="modal-actions">
<button class="btn-cancel settings-cancel">Cancel</button>
<button class="btn-save settings-save">Save</button>
</div>
</div>
</div>
<div class="modal-overlay notify-devices-overlay">
<div class="modal-box notify-devices-box">
<button class="modal-close notify-devices-close" aria-label="Close">&#10005;</button>
<h2>&#128276; Notify devices</h2>
<div class="notify-devices-subtitle"></div>
<div class="notify-devices-list"></div>
<div class="notify-devices-add-row">
<select class="notify-devices-add-select"></select>
<button type="button" class="notify-devices-add-btn">&#10133; Add</button>
</div>
<div class="modal-actions">
<button class="btn-save notify-devices-done">Done</button>
</div>
</div>
</div>
<div class="modal-overlay add-menu-overlay">
<div class="modal-box add-menu-box">
<button class="modal-close add-menu-close" aria-label="Close">&#10005;</button>
<h2>&#10133; Add</h2>
<div class="add-menu-list">
<button type="button" class="add-fab-item add-fab-calendar">&#128197; Calendar Entry</button>
<button type="button" class="add-fab-item add-fab-reminder">&#128276; Reminder</button>
<button type="button" class="add-fab-item add-fab-suggestion">&#128161; Meal Suggestion</button>
<button type="button" class="add-fab-item add-fab-recipe">&#127838; Recipe</button>
</div>
</div>
</div>
<div class="modal-overlay add-event-overlay">
<div class="modal-box add-event-box">
<button class="modal-close add-event-close" aria-label="Close">&#10005;</button>
<h2 class="add-event-heading">&#10133; New Event</h2>
<div class="add-event-tabs">
<button type="button" class="add-event-tab-btn active" data-tab="calendar">&#128197; Calendar Event</button>
<button type="button" class="add-event-tab-btn" data-tab="reminder">&#128276; Reminder</button>
</div>
<div class="field add-event-calendar-field">
<label>Calendar</label>
<select class="hour-select add-event-calendar-select"></select>
</div>
<div class="field">
<label>Title</label>
<input type="text" class="add-event-title" placeholder="e.g. Dentist appointment" maxlength="120" />
</div>
<div class="add-event-tab-panel" data-tab-panel="calendar">
<div class="field">
<label>All day</label>
<div class="size-btn-row">
<button type="button" class="size-btn add-event-allday-btn" data-value="off">Timed</button>
<button type="button" class="size-btn add-event-allday-btn" data-value="on">All day</button>
</div>
</div>
<div class="field">
<label>Date</label>
<div class="date-picker-row">
<input type="date" class="add-event-date" />
<button type="button" class="add-event-date-btn" title="Pick a date">&#128197;</button>
</div>
</div>
<div class="field add-event-time-field">
<label>Start / End time</label>
<div class="size-btn-row">
<input type="time" class="hour-select add-event-start-time" />
<div class="range-sep">to</div>
<input type="time" class="hour-select add-event-end-time" />
</div>
</div>
<div class="field">
<label>Location (optional)</label>
<input type="text" class="add-event-location" placeholder="Optional" maxlength="120" />
</div>
<div class="field add-event-remind-field">
<label>Remind me</label>
<div class="remind-check-row">
<label class="remind-check-opt"><input type="checkbox" class="remind-check" value="5" />5m</label>
<label class="remind-check-opt"><input type="checkbox" class="remind-check" value="10" />10m</label>
<label class="remind-check-opt"><input type="checkbox" class="remind-check" value="15" />15m</label>
<label class="remind-check-opt"><input type="checkbox" class="remind-check" value="30" />30m</label>
<label class="remind-check-opt"><input type="checkbox" class="remind-check" value="60" />1h</label>
<label class="remind-check-opt"><input type="checkbox" class="remind-check" value="120" />2h</label>
<label class="remind-check-opt"><input type="checkbox" class="remind-check" value="1440" />1d</label>
</div>
<div class="remind-hint">Needs the Family Hub integration installed to actually notify.</div>
</div>
</div>
<div class="add-event-tab-panel" data-tab-panel="reminder" style="display:none">
<div class="field">
<label>Date</label>
<div class="date-picker-row">
<input type="date" class="add-event-reminder-date" />
<button type="button" class="add-event-reminder-date-btn" title="Pick a date">&#128197;</button>
</div>
</div>
<div class="field">
<label>Notify at</label>
<input type="time" class="hour-select add-event-reminder-time" />
</div>
<div class="field">
<label class="remind-check-opt"><input type="checkbox" class="add-event-reminder-rollover" />&#128257; Roll over to next day if not completed</label>
</div>
<div class="remind-hint">Saved as a to-do in Home Assistant, not an event on your calendar - fires once at this exact time, and you can mark it done, edit it, or reschedule it anytime from the event-info popup or Home Assistant's own To-do UI. Needs the Family Hub integration installed to actually notify; set reminder notify devices under Settings.</div>
<div class="add-event-warn add-event-reminder-missing-warn" style="display:none"></div>
</div>
<div class="field">
<label>Notes (optional)</label>
<textarea class="add-event-description" placeholder="Optional details" maxlength="255"></textarea>
</div>
<div class="add-event-error" style="display:none"></div>
<div class="modal-actions">
<button class="btn-cancel add-event-cancel">Cancel</button>
<button class="btn-save add-event-save">Save</button>
</div>
</div>
</div>
</ha-card>
<button class="add-event-fab" title="Add" aria-haspopup="true" aria-expanded="false">&#65291;</button>
`;
this._root = root;
// On narrow/mobile layouts, :host and ha-card both get overflow:hidden
// (see the 700px media query) to contain the calendar grid's own
// scrolling and stop the whole page from also scrolling. That same
// overflow:hidden clips any position:fixed modal living inside ha-card
// (e.g. the full-screen Grocy Recipe Viewer) to whatever part of ha-card
// happens to be visible, even though "fixed" is otherwise positioned
// relative to the real viewport - if the page hasn't been scrolled all
// the way up, that cuts off the modal's own top (title, close button)
// along with it. Toggling .modal-open on the host while any
// .modal-overlay has its "open" class lifts that clipping (see the
// :host(.modal-open) rules) for exactly as long as a modal needs the
// full viewport, then restores it once every modal is closed again.
if (window.MutationObserver) {
if (this._modalOpenObserver) this._modalOpenObserver.disconnect();
this._modalOpenObserver = new window.MutationObserver(() => {
const anyOpen = !!root.querySelector(".modal-overlay.open");
this.classList.toggle("modal-open", anyOpen);
});
root.querySelectorAll(".modal-overlay").forEach((el) => {
this._modalOpenObserver.observe(el, { attributes: true, attributeFilter: ["class"] });
});
}
this._applySizeVars();
root.querySelector(".grid").addEventListener("click", (e) => {
const mealPill = e.target.closest(".mc-meal-pill");
if (mealPill && mealPill.dataset.date) {
this._openEditorForDate(new Date(mealPill.dataset.date + "T00:00:00"), parseInt(mealPill.dataset.blockIndex || "0", 10));
return;
}
const cell = e.target.closest(".month-cell");
if (cell && cell.dataset.date) {
this._goToWeekFromDate(new Date(cell.dataset.date + "T00:00:00"));
return;
}
const evCard = e.target.closest(".event, .tl-event, .all-day-chip");
if (evCard && evCard.dataset.eventId) {
this._openEventInfo(evCard.dataset.eventId);
return;
}
const banner = e.target.closest(".menu-banner");
if (banner && banner.dataset.dayIndex !== undefined) {
if (this._mealEditMode) return;
this._openEditor(parseInt(banner.dataset.dayIndex, 10), parseInt(banner.dataset.blockIndex || "0", 10));
}
});
this._swipeStartX = null;
this._swipeStartY = null;
this._swipeStartTime = null;
root.querySelector(".grid").addEventListener(
"touchstart",
(e) => {
if (this._mealEditMode || e.touches.length !== 1) {
this._swipeStartX = null;
return;
}
this._swipeStartX = e.touches[0].clientX;
this._swipeStartY = e.touches[0].clientY;
this._swipeStartTime = Date.now();
},
{ passive: true }
);
root.querySelector(".grid").addEventListener(
"touchend",
(e) => {
if (this._swipeStartX === null) return;
const touch = e.changedTouches[0];
const dx = touch.clientX - this._swipeStartX;
const dy = touch.clientY - this._swipeStartY;
const dt = Date.now() - this._swipeStartTime;
this._swipeStartX = null;
const absDx = Math.abs(dx);
const absDy = Math.abs(dy);
if (absDx > 60 && absDx > absDy * 1.5 && dt < 800) {
if (dx < 0) {
if (this._viewMode === "month") this._setMonthOffset((this._monthOffset || 0) + 1);
else this._setWeekOffset((this._weekOffset || 0) + 1);
} else {
if (this._viewMode === "month") this._setMonthOffset((this._monthOffset || 0) - 1);
else this._setWeekOffset((this._weekOffset || 0) - 1);
}
}
},
{ passive: true }
);
root.querySelector(".nav-prev").addEventListener("click", () => {
if (this._viewMode === "month") this._setMonthOffset((this._monthOffset || 0) - 1);
else this._setWeekOffset((this._weekOffset || 0) - 1);
});
root.querySelector(".nav-next").addEventListener("click", () => {
if (this._viewMode === "month") this._setMonthOffset((this._monthOffset || 0) + 1);
else this._setWeekOffset((this._weekOffset || 0) + 1);
});
root.querySelector(".week-label").addEventListener("click", () => {
if (this._viewMode === "month") this._setMonthOffset(0);
else this._setWeekOffset(0);
});
root.querySelector(".week-shortcuts-toggle").addEventListener("click", (e) => {
e.stopPropagation();
this._toggleWeekShortcuts();
});
root.querySelectorAll(".week-shortcut").forEach((btn) => {
btn.addEventListener("click", () => {
this._setWeekOffset(parseInt(btn.dataset.weeks, 10));
this._closeWeekShortcuts();
});
});
root.querySelectorAll(".view-btn").forEach((btn) => {
btn.addEventListener("click", () => {
const mode = btn.dataset.view;
if (mode === this._viewMode) return;
this._viewMode = mode;
if (mode === "month" && this._mealEditMode) {
this._mealEditMode = false;
const editBtn = root.querySelector(".edit-meals-btn");
if (editBtn) {
editBtn.classList.remove("active");
editBtn.innerHTML = "&#9999;&#65039; Edit";
}
}
this._fetchEvents();
this._updateNavLabel();
});
});
root.querySelector(".edit-meals-btn").addEventListener("click", () => {
this._mealEditMode = !this._mealEditMode;
const btn = root.querySelector(".edit-meals-btn");
btn.classList.toggle("active", this._mealEditMode);
btn.innerHTML = this._mealEditMode ? "&#9989; Done" : "&#9999;&#65039; Edit";
this._renderGrid();
});
root.querySelector(".edit-overlay .modal-close").addEventListener("click", () => this._closeEditor());
root.querySelector(".btn-cancel:not(.settings-cancel)").addEventListener("click", () => this._closeEditor());
root.querySelector(".btn-save:not(.settings-save)").addEventListener("click", () => this._saveEditor());
root.querySelector(".btn-clear").addEventListener("click", () => {
root.querySelector(".input-name").value = "";
root.querySelector(".input-description").value = "";
root.querySelector(".input-link").value = "";
root.querySelector(".input-servings").value = "";
this._currentGrocyRecipeId = null;
this._updateMenuLinkOpenBtn();
this._currentRating = null;
this._currentColor = "#f0e6c4";
root.querySelector(".input-color-custom").value = "#f0e6c4";
this._updateColorSwatches();
this._updateRatingButtons();
// Clearing an already-set meal means there's nothing left to show a
// view card for - go straight back to the empty-slot state (pick
// buttons back, edit fields visible) rather than leaving Save with
// nothing left to save while still showing "here's what's planned".
// Dish-editor mode (Loved Dishes) never shows the pick buttons or view
// card at all, so this is a no-op there.
if (!this._dishEditorMode) {
this._editingMealIsSet = false;
root.querySelector(".pick-btn-group").style.display = "";
this._setMealEditorViewMode(false);
}
});
root.querySelector(".input-link").addEventListener("input", () => {
// A hand-edit means the link may no longer be the Grocy recipe this
// modal was originally populated from - fall back to treating it as a
// plain link rather than risk opening the viewer on stale/wrong data.
// Any Servings override only made sense for that specific recipe too,
// so it's cleared here rather than silently carried onto whatever the
// link now points at.
this._currentGrocyRecipeId = null;
root.querySelector(".input-servings").value = "";
this._updateMenuLinkOpenBtn();
});
root.querySelector(".input-dish-image").addEventListener("input", (e) => {
// Updates only the preview image here, not via _setDishImage (which
// also reassigns the input's own .value) - re-setting an <input> to the
// exact string it already holds is harmless in most browsers, but
// there's no reason to risk a cursor-jump while someone's actively
// typing/pasting into it.
const preview = root.querySelector(".dish-image-preview");
const url = e.target.value.trim();
if (url) {
preview.src = url;
preview.style.display = "block";
} else {
preview.src = "";
preview.style.display = "none";
}
});
root.querySelector(".menu-link-open-btn").addEventListener("click", () => this._openCurrentMenuLink());
root.querySelector(".meal-view-recipe-btn").addEventListener("click", () => this._openCurrentMenuLink());
root.querySelector(".meal-view-edit-btn").addEventListener("click", () => this._setMealEditorViewMode(false));
root.querySelector(".btn-heart").addEventListener("click", () => {
this._currentRating = this._currentRating === "up" ? null : "up";
this._updateRatingButtons();
});
root.querySelector(".btn-thumbsdown").addEventListener("click", () => {
this._currentRating = this._currentRating === "down" ? null : "down";
this._updateRatingButtons();
});
root.querySelectorAll(".swatch").forEach((sw) => {
sw.addEventListener("click", () => {
this._currentColor = sw.dataset.color;
root.querySelector(".input-color-custom").value = sw.dataset.color;
this._updateColorSwatches();
});
});
root.querySelector(".input-color-custom").addEventListener("input", (e) => {
this._currentColor = e.target.value;
this._updateColorSwatches();
});
root.querySelector(".loved-btn").addEventListener("click", () => this._openLoved(false));
root.querySelector(".loved-menu-item").addEventListener("click", () => {
this._closeMoreMenu();
this._openLoved(false);
});
root.querySelector(".pick-recipe-btn").addEventListener("click", () => this._openLoved(true));
root.querySelector(".loved-close").addEventListener("click", () => this._closeLoved());
root.querySelector(".suggestions-btn").addEventListener("click", () => this._openSuggestedRecipes());
// There's no standalone Suggestions box left at all now - both places
// that used to open it (this header button and the + FAB's "Meal
// Suggestion" item) now open the Recipe Box itself, pre-filtered to the
// "💡 Suggested" chip (see _openSuggestedRecipes). The Recipe Box is the
// only place a suggestion gets created too (search a recipe and tap its
// 💡 icon via _suggestDish, or check "Also add to Meal Suggestions" while
// adding/editing one - see .input-add-suggestion in _saveDishEditor).
// This is also where a recipe already living in Grocy
// (created there directly, or imported via "Import from a link" - which
// deliberately only creates the Grocy side) gets pulled into the Recipe
// Box's own Store list, via the same picker.
root.querySelector(".recipe-box-grocy-btn").addEventListener("click", () => this._openGrocyPicker());
root.querySelector(".recipe-import-open-btn").addEventListener("click", () => {
this._closeGrocyPicker();
this._openRecipeImport();
});
root.querySelector(".recipe-import-close").addEventListener("click", () => this._closeRecipeImport());
root.querySelector(".recipe-import-fetch-btn").addEventListener("click", () => this._fetchImportedRecipe());
root.querySelector(".recipe-import-parse-text-btn").addEventListener("click", () => this._parseImportedRecipeText());
root.querySelector(".recipe-import-manual-btn").addEventListener("click", () => this._startManualRecipeEntry());
root.querySelector(".recipe-import-create-btn").addEventListener("click", () => this._createImportedGrocyRecipe());
root.querySelector(".recipe-import-debug-btn").addEventListener("click", () => this._copyRecipeImportDebugInfo());
root.querySelector(".recipe-import-add-ingredient-btn").addEventListener("click", () => this._addImportedIngredientLine());
root.querySelector(".recipe-import-image-input").addEventListener("input", (e) => {
if (this._recipeImport && this._recipeImport.recipe) this._recipeImport.recipe.image = e.target.value;
this._updateRecipeImportPhotoPreview();
});
root.querySelector(".recipe-import-source-input").addEventListener("input", (e) => {
if (this._recipeImport && this._recipeImport.recipe) this._recipeImport.recipe.source_url = e.target.value;
});
root.querySelector(".recipe-import-instructions-input").addEventListener("input", (e) => {
// Kept in sync with state on every keystroke (not just read once at
// submit time) so a later re-render of the review screen - e.g.
// removing an ingredient line, or creating a new Grocy product mid-way
// through - doesn't blow away in-progress edits to the instructions.
if (this._recipeImport && this._recipeImport.recipe) {
this._recipeImport.recipe.instructions = e.target.value.split("\n");
}
});
root.querySelector(".recipe-import-refresh-btn").addEventListener("click", async () => {
await this._matchImportedIngredients();
this._renderRecipeImportReview();
});
root.querySelector(".recipe-import-manage-ingredients-check").addEventListener("change", (e) => {
// A lasting device preference, not a per-recipe one - most people either
// always use Grocy's stock/shopping-list features or never do, so this
// remembers the choice (localStorage, same pattern as
// familyCalendarShowTimelineLocal) rather than resetting to on for every
// fresh import like the unrelated "Include ingredients in the
// preparation text" checkbox does.
window.localStorage.setItem("familyHubManageIngredientsWithGrocy", e.target.checked ? "on" : "off");
this._applyManageIngredientsToggle(e.target.checked);
});
root.querySelector(".grocy-picker-close").addEventListener("click", () => this._closeGrocyPicker());
root.querySelector(".grocy-picker-search").addEventListener("input", (e) => {
this._grocySearchTerm = e.target.value;
this._renderGrocyPicker();
});
root.querySelector(".grocy-recipe-viewer-close").addEventListener("click", () => this._closeGrocyRecipeViewer());
root.querySelector(".grocy-recipe-viewer-back-btn").addEventListener("click", () => this._closeGrocyRecipeViewer());
root.querySelector(".grocy-recipe-viewer-open-btn").addEventListener("click", () => {
if (this._grocyRecipeViewerFallbackLink) window.open(this._grocyRecipeViewerFallbackLink, "_blank", "noopener");
});
root.querySelector(".grocy-recipe-viewer-consume-btn").addEventListener("click", () => this._consumeGrocyRecipeIngredients());
root.querySelector(".grocy-recipe-viewer-scale-down").addEventListener("click", () => this._adjustGrocyRecipeViewerServings(-1));
root.querySelector(".grocy-recipe-viewer-scale-up").addEventListener("click", () => this._adjustGrocyRecipeViewerServings(1));
root.querySelector(".templates-btn").addEventListener("click", () => this._openTemplates());
root.querySelector(".templates-close").addEventListener("click", () => this._closeTemplates());
root.querySelector(".templates-save-btn").addEventListener("click", () => {
const name = window.prompt("Name this template (e.g. \"Summer Rotation\"):", "");
if (name === null) return;
const trimmed = name.trim();
if (!trimmed) return;
this._saveMealTemplate(trimmed);
});
root.querySelector(".templates-search").addEventListener("input", (e) => {
this._templatesSearchTerm = e.target.value;
this._renderMealTemplates();
});
root.querySelector(".print-btn").addEventListener("click", () => this._printView());
root.querySelector(".grocery-list-push-btn").addEventListener("click", () => this._pushCheckedGroceryItems());
root.querySelector(".grocy-shopping-list-btn").addEventListener("click", () => this._openGrocyShoppingList());
root.querySelector(".grocy-shopping-list-close").addEventListener("click", () => this._closeGrocyShoppingList());
root.querySelectorAll(".shopping-tab-btn").forEach((btn) => {
btn.addEventListener("click", () => this._switchShoppingListTab(btn.dataset.shoppingTab));
});
root.querySelector(".grocy-shopping-list-picker").addEventListener("change", (e) => {
this._grocyShoppingListId = parseInt(e.target.value, 10) || 1;
try {
window.localStorage.setItem("familyHubGrocyShoppingListId", String(this._grocyShoppingListId));
} catch (err) {
}
this._renderGrocyShoppingList();
});
root.querySelector(".grocy-shopping-list-new-list-btn").addEventListener("click", () => this._createGrocyShoppingList());
root.querySelector(".grocy-expiring-btn").addEventListener("click", () => this._openGrocyExpiringSoon());
root.querySelector(".grocy-low-stock-btn").addEventListener("click", () => this._openGrocyLowStock());
root.querySelector(".grocy-low-stock-close").addEventListener("click", () => this._closeGrocyLowStock());
root.querySelector(".grocy-low-stock-add-all-btn").addEventListener("click", () => this._addMissingGrocyProductsToShoppingList());
root.querySelector(".grocy-expiring-close").addEventListener("click", () => this._closeGrocyExpiringSoon());
root.querySelector(".grocy-shopping-list-add-btn").addEventListener("click", () => this._addGrocyShoppingListItem());
root.querySelector(".grocy-shopping-list-add-input").addEventListener("keydown", (e) => {
if (e.key === "Enter") this._addGrocyShoppingListItem();
});
// "More" menu (Templates/Print/Grocery List) - a simple toggle-open
// dropdown rather than its own modal, since these are one-tap actions,
// not screens that need their own Close button. Closes itself again on
// an outside click, Escape, or picking any item in it (each item keeps
// its own existing click handler above - this just also closes the menu
// afterward via one delegated listener rather than repeating that in
// every single handler).
root.querySelector(".more-menu-btn").addEventListener("click", (e) => {
e.stopPropagation();
this._toggleMoreMenu();
});
root.querySelector(".more-menu-dropdown").addEventListener("click", () => this._closeMoreMenu());
document.addEventListener("click", (e) => {
if (!root.querySelector(".more-menu-wrap").contains(e.target)) this._closeMoreMenu();
});
document.addEventListener("keydown", (e) => {
if (e.key === "Escape") this._closeMoreMenu();
});
root.querySelector(".add-event-fab").addEventListener("click", () => {
this._openModal(root.querySelector(".add-menu-overlay"));
});
root.querySelector(".add-menu-close").addEventListener("click", () => this._closeAddMenu());
root.querySelector(".add-fab-calendar").addEventListener("click", () => {
this._closeAddMenu();
this._openAddEvent("calendar");
});
root.querySelector(".add-fab-reminder").addEventListener("click", () => {
this._closeAddMenu();
this._openAddEvent("reminder");
});
root.querySelector(".add-fab-suggestion").addEventListener("click", () => {
this._closeAddMenu();
this._openSuggestedRecipes();
});
root.querySelector(".add-fab-recipe").addEventListener("click", () => {
this._closeAddMenu();
this._openRecipeImport();
});
root.querySelector(".add-event-close").addEventListener("click", () => this._closeAddEvent());
root.querySelector(".add-event-cancel").addEventListener("click", () => this._closeAddEvent());
root.querySelector(".add-event-save").addEventListener("click", () => this._saveAddEvent());
root.querySelector(".add-event-date-btn").addEventListener("click", () => {
const input = root.querySelector(".add-event-date");
if (input.showPicker) {
try {
input.showPicker();
} catch (e) {
input.focus();
}
} else {
input.focus();
}
});
root.querySelector(".add-event-reminder-date-btn").addEventListener("click", () => {
const input = root.querySelector(".add-event-reminder-date");
if (input.showPicker) {
try {
input.showPicker();
} catch (e) {
input.focus();
}
} else {
input.focus();
}
});
root.querySelectorAll(".add-event-tab-btn").forEach((btn) => {
btn.addEventListener("click", () => this._setAddEventTab(btn.dataset.tab));
});
root.querySelectorAll(".add-event-allday-btn").forEach((btn) => {
btn.addEventListener("click", () => {
root.querySelectorAll(".add-event-allday-btn").forEach((b) => b.classList.remove("active"));
btn.classList.add("active");
this._updateAddEventFieldVisibility(btn.dataset.value === "on");
});
});
root.querySelector(".debug-close").addEventListener("click", () => {
root.querySelector(".debug-overlay").classList.remove("open");
});
root.querySelector(".event-info-close").addEventListener("click", () => {
root.querySelector(".event-info-overlay").classList.remove("open");
this._eventInfoOpenId = null;
});
root.querySelector(".settings-btn").addEventListener("click", () => this._openSettings());
root.querySelector(".settings-close").addEventListener("click", () => this._closeSettings());
root.querySelector(".notify-devices-close").addEventListener("click", () => this._closeNotifyDevicesModal());
root.querySelector(".notify-devices-done").addEventListener("click", () => this._closeNotifyDevicesModal());
root.querySelector(".notify-devices-add-btn").addEventListener("click", () => this._addNotifyDevice());
root.querySelector(".reminder-notify-btn").addEventListener("click", () => this._openNotifyDevicesModal("reminders"));
root.querySelector(".settings-cancel").addEventListener("click", () => this._closeSettings());
root.querySelector(".settings-save").addEventListener("click", () => this._saveSettings());
root.querySelector(".settings-debug-btn").addEventListener("click", () => {
this._closeSettings();
this._renderDebug();
this._openModal(root.querySelector(".debug-overlay"));
});
root.querySelector(".add-person-btn").addEventListener("click", () => {
this._syncPeopleDraftFromDom();
this._settingsPeopleDraft.push({ entity: "", name: "", color: "#d9bf7e", countdown: false, badges: [] });
this._renderPeopleSettings(this._settingsPeopleDraft);
});
root.querySelectorAll(".block-count-btn").forEach((btn) => {
btn.addEventListener("click", () => {
root.querySelectorAll(".block-count-btn").forEach((b) => b.classList.remove("active"));
btn.classList.add("active");
this._updateSettingsBlockVisibility(parseInt(btn.dataset.count, 10));
});
});
root.querySelectorAll(".block-size-btn").forEach((btn) => {
btn.addEventListener("click", () => {
root.querySelectorAll(".block-size-btn").forEach((b) => b.classList.remove("active"));
btn.classList.add("active");
});
});
root.querySelectorAll(".timeline-btn").forEach((btn) => {
btn.addEventListener("click", () => {
root.querySelectorAll(".timeline-btn").forEach((b) => b.classList.remove("active"));
btn.classList.add("active");
});
});
root.querySelectorAll(".weekend-breakfast-btn").forEach((btn) => {
btn.addEventListener("click", () => {
root.querySelectorAll(".weekend-breakfast-btn").forEach((b) => b.classList.remove("active"));
btn.classList.add("active");
});
});
root.querySelectorAll(".global-theme-btn").forEach((btn) => {
btn.addEventListener("click", () => {
root.querySelectorAll(".global-theme-btn").forEach((b) => b.classList.remove("active"));
btn.classList.add("active");
this._updateGlobalThemeVisibility(btn.dataset.value === "on");
});
});
root.querySelectorAll(".meals-in-month-btn").forEach((btn) => {
btn.addEventListener("click", () => {
root.querySelectorAll(".meals-in-month-btn").forEach((b) => b.classList.remove("active"));
btn.classList.add("active");
});
});
root.querySelectorAll(".scroll-lock-btn").forEach((btn) => {
btn.addEventListener("click", () => {
root.querySelectorAll(".scroll-lock-btn").forEach((b) => b.classList.remove("active"));
btn.classList.add("active");
});
});
root.querySelectorAll(".default-view-btn").forEach((btn) => {
btn.addEventListener("click", () => {
root.querySelectorAll(".default-view-btn").forEach((b) => b.classList.remove("active"));
btn.classList.add("active");
});
});
root.querySelectorAll(".countdown-enabled-btn").forEach((btn) => {
btn.addEventListener("click", () => {
root.querySelectorAll(".countdown-enabled-btn").forEach((b) => b.classList.remove("active"));
btn.classList.add("active");
});
});
const countdownAddBtn = root.querySelector(".countdown-add-btn");
if (countdownAddBtn) {
countdownAddBtn.addEventListener("click", async () => {
const labelEl = root.querySelector(".countdown-add-label-input");
const dateEl = root.querySelector(".countdown-add-date-input");
const label = labelEl ? labelEl.value.trim() : "";
const date = dateEl ? dateEl.value : "";
if (!label || !date) return;
countdownAddBtn.disabled = true;
await this._addCountdownItem(label, date);
if (labelEl) labelEl.value = "";
if (dateEl) dateEl.value = "";
this._renderCountdownItemsList();
countdownAddBtn.disabled = false;
});
}
root.querySelectorAll(".digest-enabled-btn").forEach((btn) => {
btn.addEventListener("click", () => {
root.querySelectorAll(".digest-enabled-btn").forEach((b) => b.classList.remove("active"));
btn.classList.add("active");
});
});
root.querySelectorAll(".grocy-expiring-enabled-btn").forEach((btn) => {
btn.addEventListener("click", () => {
root.querySelectorAll(".grocy-expiring-enabled-btn").forEach((b) => b.classList.remove("active"));
btn.classList.add("active");
});
});
root.querySelectorAll(".grocy-expiring-digest-enabled-btn").forEach((btn) => {
btn.addEventListener("click", () => {
root.querySelectorAll(".grocy-expiring-digest-enabled-btn").forEach((b) => b.classList.remove("active"));
btn.classList.add("active");
});
});
root.querySelectorAll(".grocy-low-stock-enabled-btn").forEach((btn) => {
btn.addEventListener("click", () => {
root.querySelectorAll(".grocy-low-stock-enabled-btn").forEach((b) => b.classList.remove("active"));
btn.classList.add("active");
});
});
root.querySelectorAll(".grocy-low-stock-digest-enabled-btn").forEach((btn) => {
btn.addEventListener("click", () => {
root.querySelectorAll(".grocy-low-stock-digest-enabled-btn").forEach((b) => b.classList.remove("active"));
btn.classList.add("active");
});
});
const digestNotifyBtn = root.querySelector(".digest-notify-btn");
if (digestNotifyBtn) {
digestNotifyBtn.addEventListener("click", () => this._openNotifyDevicesModal("digest"));
}
root.querySelector(".theme-reset-btn").addEventListener("click", () => {
const defaultTheme = this._defaultTheme();
root.querySelectorAll(".theme-color-input").forEach((input) => {
input.value = defaultTheme.colors[input.dataset.key];
});
root.querySelectorAll(".theme-font-input").forEach((input) => {
input.value = defaultTheme.fonts[input.dataset.key];
});
});
root.querySelectorAll(".accordion-toggle").forEach((btn) => {
btn.addEventListener("click", () => {
const body = root.querySelector(`#${btn.dataset.target}`);
btn.classList.toggle("open");
if (body) body.classList.toggle("open");
});
});
root.querySelector(".loved-search").addEventListener("input", (e) => {
this._lovedSearchTerm = e.target.value;
this._renderLoved();
});
root.querySelectorAll(".recipe-view-btn").forEach((btn) => {
btn.addEventListener("click", () => {
this._setRecipeBoxViewMode(btn.dataset.view);
});
});
root.querySelector(".recipe-sort-select").addEventListener("change", (e) => {
this._recipeBoxSort = e.target.value;
this._renderLoved();
});
root.querySelector(".recipe-box-select-btn").addEventListener("click", () => {
this._toggleRecipeBoxSelectMode(true);
});
root.querySelector(".recipe-box-select-cancel").addEventListener("click", () => {
this._toggleRecipeBoxSelectMode(false);
});
root.querySelector(".recipe-box-select-delete").addEventListener("click", () => {
this._deleteSelectedRecipeBoxItems();
});
root.querySelector(".dish-detail-close").addEventListener("click", () => this._closeDishDetail());
root.querySelector(".add-dish-btn").addEventListener("click", () => {
this._closeLoved();
this._openDishEditor(null);
});
// Reuses the exact same "paste a link, fetch/parse it" flow already
// wired up for Grocy recipe imports elsewhere - see _openRecipeImport.
// It only ever creates a Grocy recipe, not a Recipe Box entry, but that
// mirrors how the rest of the app already treats these as two related-
// but-separate collections (a household's Grocy recipes vs. their loved-
// dish shortlist) rather than silently merging them here.
root.querySelector(".recipe-box-import-btn").addEventListener("click", () => {
this._closeLoved();
this._openRecipeImport();
});
root.querySelector(".dish-detail-edit-btn").addEventListener("click", () => {
const recipe = this._dishDetailRecipe;
this._closeDishDetail();
if (recipe) this._openDishEditor(recipe);
});
root.querySelector(".dish-detail-delete-btn").addEventListener("click", () => {
const recipe = this._dishDetailRecipe;
if (!recipe) return;
const grocyNote = recipe.grocyRecipeId ? " This will also delete it from Grocy." : "";
if (!window.confirm(`Delete "${recipe.name}" from the Recipe Box?${grocyNote}`)) return;
this._deleteDish(recipe.uid, recipe.grocyRecipeId);
this._closeDishDetail();
});
root.querySelector(".btn-delete-dish").addEventListener("click", () => {
if (!this._editingDishUid) return;
const uid = this._editingDishUid;
const name = root.querySelector(".input-name").value.trim();
const grocyNote = this._currentGrocyRecipeId ? " This will also delete it from Grocy." : "";
if (!window.confirm(`Delete "${name}" from the Recipe Box?${grocyNote}`)) return;
this._deleteDish(uid, this._currentGrocyRecipeId);
this._closeEditor();
});
this._updateNavLabel();
}
_renderPeopleSettings(list) {
const container = this._root.querySelector(".people-list");
if (!list.length) {
container.innerHTML = `<div style="font-size:12px;color:var(--fc-text-secondary);font-style:italic;margin-bottom:4px;">No calendars yet — add one below.</div>`;
} else {
container.innerHTML = list
.map(
(p, idx) => `
<div class="person-row" data-idx="${idx}">
<input type="text" class="person-entity" placeholder="calendar.family" value="${p.entity || ""}" />
<input type="text" class="person-name" placeholder="Name" value="${p.name || ""}" maxlength="20" />
<input type="color" class="person-color" value="${p.color || "#d9bf7e"}" />
<button type="button" class="person-countdown-btn ${p.countdown ? "active" : ""}" data-idx="${idx}" title="Include in countdown">&#9203;</button>
<button type="button" class="person-remove-btn" data-idx="${idx}" title="Remove">&#10005;</button>
</div>
<div class="person-notify-row" data-idx="${idx}">
<button type="button" class="person-notify-btn" data-idx="${idx}">&#128276; Notify <span class="person-notify-count">0</span></button>
</div>
<div class="person-badges" data-idx="${idx}">
${(p.badges || [])
.map(
(b, bidx) => `
<div class="person-badge-row" data-idx="${idx}" data-badge-idx="${bidx}">
<input type="text" class="person-badge-text" placeholder="Badge (e.g. N)" value="${b.text || ""}" maxlength="4" />
<input type="text" class="person-badge-match" placeholder="Show badge when event contains..." value="${b.match || ""}" />
<input type="text" class="person-badge-hide" placeholder="Hide event when contains..." value="${b.hideMatch || ""}" />
<button type="button" class="person-badge-remove-btn" data-idx="${idx}" data-badge-idx="${bidx}" title="Remove badge">&#10005;</button>
</div>
`
)
.join("")}
<button type="button" class="person-badge-add-btn" data-idx="${idx}">&#10133; Add badge</button>
</div>
`
)
.join("");
}
this._populatePersonNotifyButtons(list);
container.querySelectorAll(".person-notify-btn").forEach((btn) => {
btn.addEventListener("click", () => {
const idx = parseInt(btn.dataset.idx, 10);
this._openNotifyDevicesModal(idx);
});
});
container.querySelectorAll(".person-countdown-btn").forEach((btn) => {
btn.addEventListener("click", () => {
btn.classList.toggle("active");
});
});
container.querySelectorAll(".person-remove-btn").forEach((btn) => {
btn.addEventListener("click", () => {
this._syncPeopleDraftFromDom();
const idx = parseInt(btn.dataset.idx, 10);
this._settingsPeopleDraft.splice(idx, 1);
this._renderPeopleSettings(this._settingsPeopleDraft);
});
});
container.querySelectorAll(".person-badge-add-btn").forEach((btn) => {
btn.addEventListener("click", () => {
this._syncPeopleDraftFromDom();
const idx = parseInt(btn.dataset.idx, 10);
if (!Array.isArray(this._settingsPeopleDraft[idx].badges)) this._settingsPeopleDraft[idx].badges = [];
this._settingsPeopleDraft[idx].badges.push({ text: "", match: "", hideMatch: "" });
this._renderPeopleSettings(this._settingsPeopleDraft);
});
});
container.querySelectorAll(".person-badge-remove-btn").forEach((btn) => {
btn.addEventListener("click", () => {
this._syncPeopleDraftFromDom();
const idx = parseInt(btn.dataset.idx, 10);
const bidx = parseInt(btn.dataset.badgeIdx, 10);
this._settingsPeopleDraft[idx].badges.splice(bidx, 1);
this._renderPeopleSettings(this._settingsPeopleDraft);
});
});
}
_notifyServiceOptions() {
// Read directly from hass - always available client-side, no round trip needed.
const services = (this._hass && this._hass.services && this._hass.services.notify) || {};
return Object.keys(services)
.sort()
.map((name) => `notify.${name}`);
}
_populatePersonNotifyButtons(list) {
this._root.querySelectorAll(".person-notify-btn").forEach((btn) => {
const idx = parseInt(btn.dataset.idx, 10);
const person = list[idx];
const notifyList = (person && Array.isArray(person.notify)) ? person.notify : [];
const countEl = btn.querySelector(".person-notify-count");
if (countEl) countEl.textContent = String(notifyList.length);
});
const reminderBtn = this._root.querySelector(".reminder-notify-btn:not(.digest-notify-btn)");
if (reminderBtn) {
const countEl = reminderBtn.querySelector(".reminder-notify-count");
const notifyList = Array.isArray(this._settingsReminderNotifyDraft) ? this._settingsReminderNotifyDraft : [];
if (countEl) countEl.textContent = String(notifyList.length);
}
const digestBtn = this._root.querySelector(".digest-notify-btn");
if (digestBtn) {
const countEl = digestBtn.querySelector(".digest-notify-count");
const notifyList = Array.isArray(this._settingsDigestNotifyDraft) ? this._settingsDigestNotifyDraft : [];
if (countEl) countEl.textContent = String(notifyList.length);
}
}
// The notify-devices modal is shared between per-calendar rows (target is
// the calendar's numeric index into _settingsPeopleDraft), the Reminders
// row (target is the string "reminders", backed by
// _settingsReminderNotifyDraft), and the Daily Digest row (target is the
// string "digest", backed by _settingsDigestNotifyDraft) - this resolves
// any of the three shapes to the actual live array reference to read/mutate.
_notifyDraftListFor(target) {
if (target === "reminders") {
if (!Array.isArray(this._settingsReminderNotifyDraft)) this._settingsReminderNotifyDraft = [];
return this._settingsReminderNotifyDraft;
}
if (target === "digest") {
if (!Array.isArray(this._settingsDigestNotifyDraft)) this._settingsDigestNotifyDraft = [];
return this._settingsDigestNotifyDraft;
}
const person = this._settingsPeopleDraft[target];
if (!person) return null;
if (!Array.isArray(person.notify)) person.notify = [];
return person.notify;
}
_openNotifyDevicesModal(target) {
if (target !== "reminders" && target !== "digest") {
this._syncPeopleDraftFromDom();
}
this._notifyDevicesEditIdx = target;
const root = this._root;
const subtitleEl = root.querySelector(".notify-devices-subtitle");
if (subtitleEl) {
if (target === "reminders") {
subtitleEl.textContent = "Reminders";
} else if (target === "digest") {
subtitleEl.textContent = "Daily Digest";
} else {
const person = this._settingsPeopleDraft[target];
subtitleEl.textContent = (person && (person.name || person.entity)) || "This calendar";
}
}
this._renderNotifyDevicesModal();
this._openModal(root.querySelector(".notify-devices-overlay"));
}
_renderNotifyDevicesModal() {
const target = this._notifyDevicesEditIdx;
if (target === undefined || target === null) return;
const root = this._root;
const notifyList = this._notifyDraftListFor(target) || [];
const listEl = root.querySelector(".notify-devices-list");
if (notifyList.length) {
listEl.innerHTML = notifyList
.map(
(t, di) => `
<div class="notify-device-row" data-di="${di}">
<span class="notify-device-name">${t}</span>
<button type="button" class="notify-device-remove-btn" data-di="${di}" title="Remove">&#10005;</button>
</div>
`
)
.join("");
} else {
const emptyLabel = target === "reminders" ? "reminders" : target === "digest" ? "the daily digest" : "this calendar";
listEl.innerHTML = `<div class="notify-devices-empty">No devices added - ${emptyLabel} use the default notify target.</div>`;
}
listEl.querySelectorAll(".notify-device-remove-btn").forEach((btn) => {
btn.addEventListener("click", () => {
const di = parseInt(btn.dataset.di, 10);
const list = this._notifyDraftListFor(target);
if (list) list.splice(di, 1);
this._renderNotifyDevicesModal();
this._populatePersonNotifyButtons(this._settingsPeopleDraft);
});
});
const options = this._notifyServiceOptions();
const available = options.filter((opt) => !notifyList.includes(opt));
const addSelect = root.querySelector(".notify-devices-add-select");
const addBtn = root.querySelector(".notify-devices-add-btn");
if (available.length) {
addSelect.innerHTML = available.map((opt) => `<option value="${opt}">${opt}</option>`).join("");
addSelect.disabled = false;
addBtn.disabled = false;
} else {
addSelect.innerHTML = `<option value="">No more devices available</option>`;
addSelect.disabled = true;
addBtn.disabled = true;
}
}
_addNotifyDevice() {
const target = this._notifyDevicesEditIdx;
if (target === undefined || target === null) return;
const root = this._root;
const addSelect = root.querySelector(".notify-devices-add-select");
const value = addSelect && addSelect.value;
if (!value) return;
const list = this._notifyDraftListFor(target);
if (!list) return;
if (!list.includes(value)) list.push(value);
this._renderNotifyDevicesModal();
this._populatePersonNotifyButtons(this._settingsPeopleDraft);
}
_closeNotifyDevicesModal() {
this._root.querySelector(".notify-devices-overlay").classList.remove("open");
this._notifyDevicesEditIdx = null;
}
_syncPeopleDraftFromDom() {
const rows = this._root.querySelectorAll(".person-row");
const prevDraft = Array.isArray(this._settingsPeopleDraft) ? this._settingsPeopleDraft : [];
this._settingsPeopleDraft = Array.from(rows).map((row, idx) => {
const badgesContainer = this._root.querySelector(`.person-badges[data-idx="${idx}"]`);
const badgeRows = badgesContainer ? badgesContainer.querySelectorAll(".person-badge-row") : [];
const badges = Array.from(badgeRows).map((br) => ({
text: br.querySelector(".person-badge-text").value.trim(),
match: br.querySelector(".person-badge-match").value.trim(),
hideMatch: br.querySelector(".person-badge-hide").value.trim(),
}));
// notify is an array of notify targets managed via the "Notify devices"
// modal, not a DOM input - carry it over from the prior draft state by index.
const prevPerson = prevDraft[idx];
const notify = (prevPerson && Array.isArray(prevPerson.notify)) ? prevPerson.notify : [];
return {
entity: row.querySelector(".person-entity").value.trim(),
name: row.querySelector(".person-name").value.trim(),
color: row.querySelector(".person-color").value,
countdown: row.querySelector(".person-countdown-btn").classList.contains("active"),
badges,
notify,
};
});
}
_openSettings() {
const root = this._root;
const settings = this._getSettings();
const count = settings.blocks.length;
root.querySelectorAll(".block-count-btn").forEach((btn) => {
btn.classList.toggle("active", parseInt(btn.dataset.count, 10) === count);
});
root.querySelectorAll(".block-size-btn").forEach((btn) => {
btn.classList.toggle("active", btn.dataset.size === settings.blockSize);
});
root.querySelectorAll(".timeline-btn").forEach((btn) => {
btn.classList.toggle("active", btn.dataset.value === (this._getShowTimeline() ? "on" : "off"));
});
root.querySelector(".timeline-start-select").value = String(settings.timelineStartHour);
root.querySelector(".timeline-end-select").value = String(settings.timelineEndHour);
root.querySelectorAll(".weekend-breakfast-btn").forEach((btn) => {
btn.classList.toggle("active", btn.dataset.value === (settings.weekendBreakfast ? "on" : "off"));
});
root.querySelectorAll(".meals-in-month-btn").forEach((btn) => {
btn.classList.toggle("active", btn.dataset.value === (settings.showMealsInMonth ? "on" : "off"));
});
root.querySelectorAll(".scroll-lock-btn").forEach((btn) => {
btn.classList.toggle("active", btn.dataset.value === (settings.scrollLocked ? "on" : "off"));
});
root.querySelectorAll(".default-view-btn").forEach((btn) => {
btn.classList.toggle("active", btn.dataset.value === settings.defaultView);
});
root.querySelectorAll(".countdown-enabled-btn").forEach((btn) => {
btn.classList.toggle("active", btn.dataset.value === (settings.countdownEnabled ? "on" : "off"));
});
this._renderCountdownItemsList();
const countdownAddLabelEl = root.querySelector(".countdown-add-label-input");
const countdownAddDateEl = root.querySelector(".countdown-add-date-input");
if (countdownAddLabelEl) countdownAddLabelEl.value = "";
if (countdownAddDateEl) countdownAddDateEl.value = "";
const countdownTickerCheckEl = root.querySelector(".countdown-ticker-check");
if (countdownTickerCheckEl) countdownTickerCheckEl.checked = !!settings.countdownTicker;
root.querySelectorAll(".digest-enabled-btn").forEach((btn) => {
btn.classList.toggle("active", btn.dataset.value === (settings.dailyDigestEnabled ? "on" : "off"));
});
const digestTimeEl = root.querySelector(".digest-time-input");
if (digestTimeEl) digestTimeEl.value = settings.dailyDigestTime || "07:00";
root.querySelectorAll(".grocy-expiring-enabled-btn").forEach((btn) => {
btn.classList.toggle("active", btn.dataset.value === (settings.grocyExpiringEnabled ? "on" : "off"));
});
root.querySelectorAll(".grocy-expiring-digest-enabled-btn").forEach((btn) => {
btn.classList.toggle("active", btn.dataset.value === (settings.grocyExpiringDigestEnabled ? "on" : "off"));
});
root.querySelectorAll(".grocy-low-stock-enabled-btn").forEach((btn) => {
btn.classList.toggle("active", btn.dataset.value === (settings.grocyLowStockEnabled ? "on" : "off"));
});
root.querySelectorAll(".grocy-low-stock-digest-enabled-btn").forEach((btn) => {
btn.classList.toggle("active", btn.dataset.value === (settings.grocyLowStockDigestEnabled ? "on" : "off"));
});
const notifyClickPathEl = root.querySelector(".notify-click-path-input");
if (notifyClickPathEl) notifyClickPathEl.value = settings.notificationClickPath || "";
root.querySelectorAll(".block-name-input").forEach((input) => {
const idx = parseInt(input.dataset.index, 10);
input.value = settings.blocks[idx] || "";
});
const theme = settings.theme || this._defaultTheme();
root.querySelectorAll(".theme-color-input").forEach((input) => {
input.value = theme.colors[input.dataset.key] || this._defaultTheme().colors[input.dataset.key];
});
root.querySelectorAll(".theme-font-input").forEach((input) => {
const v = theme.fonts[input.dataset.key];
input.value = Number.isFinite(v) ? v : this._defaultTheme().fonts[input.dataset.key];
});
const isGlobalOn = !!settings.useGlobalTheme;
root.querySelectorAll(".global-theme-btn").forEach((btn) => {
btn.classList.toggle("active", btn.dataset.value === (isGlobalOn ? "on" : "off"));
});
this._updateGlobalThemeVisibility(isGlobalOn);
this._settingsPeopleDraft = JSON.parse(JSON.stringify(this._getPeople())).map((p) => ({ ...p, notify: [] }));
this._settingsReminderNotifyDraft = [];
const remindersEntityLabel = root.querySelector(".reminders-entity-label");
if (remindersEntityLabel) remindersEntityLabel.textContent = this._config.reminders_entity;
const remindersMissingWarn = root.querySelector(".reminders-entity-missing-warn");
if (remindersMissingWarn) {
const entityId = this._config.reminders_entity;
const missing = this._hass && entityId && !this._hass.states[entityId];
if (missing) {
remindersMissingWarn.textContent = `⚠️ This entity doesn't exist in Home Assistant yet, so reminders can't be saved until it does. Create a to-do list with that entity id (Settings → Devices & Services → Add Integration → Local To-do), or update reminders_entity in this card's configuration to point at a to-do list you already have.`;
remindersMissingWarn.style.display = "";
} else {
remindersMissingWarn.style.display = "none";
}
}
this._renderPeopleSettings(this._settingsPeopleDraft);
this._populatePersonNotifyButtons(this._settingsPeopleDraft);
this._updateSettingsBlockVisibility(count);
this._openModal(root.querySelector(".settings-overlay"));
// Notify overrides load async and re-populate the per-calendar and
// reminders notify buttons once they arrive - opening Settings isn't
// blocked on the round trip.
this._fetchNotifyConfig();
}
_closeSettings() {
this._root.querySelector(".settings-overlay").classList.remove("open");
}
_updateSettingsBlockVisibility(count) {
this._root.querySelectorAll(".block-name-field").forEach((field) => {
const idx = parseInt(field.dataset.index, 10);
field.style.display = idx < count ? "" : "none";
});
}
// Persist a partial change on top of the current settings, without going
// through the full Settings form (which reads its values straight out of
// that modal's own DOM). Used by shortcuts like the event-info popup's
// "Use as countdown" button, where only one or two fields are changing and
// the Settings modal isn't even open.
async _persistSettingsPatch(patch) {
if (!this._hass) return;
const merged = Object.assign({}, this._getSettings(), patch);
const payload = JSON.stringify(merged);
try {
if (this._settingsItemUid) {
await this._hass.callService("todo", "update_item", {
item: this._settingsItemUid,
description: payload,
}, { entity_id: this._config.settings_entity });
} else {
await this._hass.callService("todo", "add_item", {
item: "Settings",
description: payload,
}, { entity_id: this._config.settings_entity });
}
} catch (e) {
}
// New authoritative home, written alongside the legacy to-do item above
// (kept fully live rather than a frozen migration snapshot) so the
// to-do-based path still has current data if anything ever falls back to
// it (an older backend, a manual rollback).
try {
await this._hass.connection.sendMessagePromise({ type: "family_hub/set_settings", settings: merged });
} catch (e) {
}
await this._fetchSettings();
this._fetchCountdown();
}
// Custom countdown items are each their own entry in a list (not one
// shared label/date slot) so that: (a) more than one thing can actually
// be lined up for the ticker to cycle through, and (b) any single one of
// them can be added or removed independently - from the event-info
// popup's "Use as countdown" / "Remove from countdown" toggle, or from
// the Countdown section in Settings - without disturbing the others.
async _addCountdownItem(label, date) {
if (!label || !date) return null;
const items = (this._getSettings().countdownItems || []).slice();
const id = this._genId();
items.push({ id, label, date });
await this._persistSettingsPatch({ countdownItems: items });
return id;
}
async _removeCountdownItem(id) {
if (!id) return;
const items = (this._getSettings().countdownItems || []).filter((it) => it.id !== id);
await this._persistSettingsPatch({ countdownItems: items });
}
// Renders settings.countdownItems into the Settings modal's Countdown
// section as a removable list, and wires the "+ Add" row next to it.
// Called when Settings opens and again after any add/remove so the list
// and the event-info popup's Use/Remove toggle always agree with each
// other (both read/write the same countdownItems array via
// _addCountdownItem/_removeCountdownItem).
_renderCountdownItemsList() {
const root = this._root;
if (!root) return;
const listEl = root.querySelector(".countdown-items-list");
if (!listEl) return;
const items = this._getSettings().countdownItems || [];
if (!items.length) {
listEl.innerHTML = `<div class="countdown-empty">No custom countdown items yet - add one below.</div>`;
} else {
listEl.innerHTML = items
.map(
(it) => `
<div class="countdown-item-row" data-id="${it.id}">
<span class="countdown-item-label">${it.label}</span>
<span class="countdown-item-date">${it.date}</span>
<button type="button" class="countdown-item-remove-btn" data-id="${it.id}" title="Remove">&#10005;</button>
</div>
`
)
.join("");
}
listEl.querySelectorAll(".countdown-item-remove-btn").forEach((btn) => {
btn.addEventListener("click", async () => {
btn.disabled = true;
await this._removeCountdownItem(btn.dataset.id);
this._renderCountdownItemsList();
});
});
}
async _saveSettings() {
const root = this._root;
this._syncPeopleDraftFromDom();
const people = this._settingsPeopleDraft
.filter((p) => p.entity)
.map((p) => ({
entity: p.entity,
name: p.name || p.entity,
color: p.color || "#d9bf7e",
countdown: !!p.countdown,
badges: (Array.isArray(p.badges) ? p.badges : [])
.map((b) => ({
text: (b.text || "").trim(),
match: (b.match || "").trim(),
hideMatch: (b.hideMatch || "").trim(),
}))
.filter((b) => b.text || b.match || b.hideMatch),
}));
const notifyOverrides = {};
this._settingsPeopleDraft.forEach((p) => {
if (p.entity && Array.isArray(p.notify) && p.notify.length) notifyOverrides[p.entity] = p.notify.slice();
});
if (Array.isArray(this._settingsReminderNotifyDraft) && this._settingsReminderNotifyDraft.length) {
notifyOverrides[this._config.reminders_entity] = this._settingsReminderNotifyDraft.slice();
}
if (Array.isArray(this._settingsDigestNotifyDraft) && this._settingsDigestNotifyDraft.length) {
notifyOverrides["__family_hub_digest__"] = this._settingsDigestNotifyDraft.slice();
}
const activeCountBtn = root.querySelector(".block-count-btn.active");
const count = activeCountBtn ? parseInt(activeCountBtn.dataset.count, 10) : 3;
const activeBlockSizeBtn = root.querySelector(".block-size-btn.active");
const blockSize = activeBlockSizeBtn ? activeBlockSizeBtn.dataset.size : "medium";
const activeTimelineBtn = root.querySelector(".timeline-btn.active");
const showTimeline = activeTimelineBtn ? activeTimelineBtn.dataset.value === "on" : false;
let timelineStartHour = parseInt(root.querySelector(".timeline-start-select").value, 10);
let timelineEndHour = parseInt(root.querySelector(".timeline-end-select").value, 10);
if (Number.isNaN(timelineStartHour)) timelineStartHour = 8;
if (Number.isNaN(timelineEndHour)) timelineEndHour = 24;
if (timelineEndHour <= timelineStartHour) timelineEndHour = Math.min(24, timelineStartHour + 1);
const activeWeekendBreakfastBtn = root.querySelector(".weekend-breakfast-btn.active");
const weekendBreakfast = activeWeekendBreakfastBtn ? activeWeekendBreakfastBtn.dataset.value === "on" : false;
const activeMealsInMonthBtn = root.querySelector(".meals-in-month-btn.active");
const showMealsInMonth = activeMealsInMonthBtn ? activeMealsInMonthBtn.dataset.value === "on" : false;
try {
localStorage.setItem("familyCalendarShowTimelineLocal", showTimeline ? "on" : "off");
} catch (e) {
}
const activeScrollLockBtn = root.querySelector(".scroll-lock-btn.active");
const scrollLocked = activeScrollLockBtn ? activeScrollLockBtn.dataset.value === "on" : false;
const activeDefaultViewBtn = root.querySelector(".default-view-btn.active");
const defaultView = activeDefaultViewBtn ? activeDefaultViewBtn.dataset.value : "week";
const activeCountdownEnabledBtn = root.querySelector(".countdown-enabled-btn.active");
const countdownEnabled = activeCountdownEnabledBtn ? activeCountdownEnabledBtn.dataset.value === "on" : true;
// Custom countdown items themselves aren't read from this form - they're
// each added/removed immediately (via _addCountdownItem/_removeCountdownItem)
// from the Countdown section's own list or the event-info popup, so this
// just carries whatever's already saved through unchanged.
const countdownItems = this._getSettings().countdownItems || [];
const countdownTickerCheck = root.querySelector(".countdown-ticker-check");
const countdownTicker = countdownTickerCheck ? countdownTickerCheck.checked : false;
const activeDigestEnabledBtn = root.querySelector(".digest-enabled-btn.active");
const dailyDigestEnabled = activeDigestEnabledBtn ? activeDigestEnabledBtn.dataset.value === "on" : false;
const digestTimeInput = root.querySelector(".digest-time-input");
const dailyDigestTime = digestTimeInput && /^\d{2}:\d{2}$/.test(digestTimeInput.value) ? digestTimeInput.value : "07:00";
const activeGrocyExpiringBtn = root.querySelector(".grocy-expiring-enabled-btn.active");
const grocyExpiringEnabled = activeGrocyExpiringBtn ? activeGrocyExpiringBtn.dataset.value === "on" : false;
const activeGrocyExpiringDigestBtn = root.querySelector(".grocy-expiring-digest-enabled-btn.active");
const grocyExpiringDigestEnabled = activeGrocyExpiringDigestBtn ? activeGrocyExpiringDigestBtn.dataset.value === "on" : true;
const activeGrocyLowStockBtn = root.querySelector(".grocy-low-stock-enabled-btn.active");
const grocyLowStockEnabled = activeGrocyLowStockBtn ? activeGrocyLowStockBtn.dataset.value === "on" : false;
const activeGrocyLowStockDigestBtn = root.querySelector(".grocy-low-stock-digest-enabled-btn.active");
const grocyLowStockDigestEnabled = activeGrocyLowStockDigestBtn ? activeGrocyLowStockDigestBtn.dataset.value === "on" : true;
const notifyClickPathInput = root.querySelector(".notify-click-path-input");
const notificationClickPath = notifyClickPathInput ? notifyClickPathInput.value.trim() : "";
const defaults = ["Breakfast", "Lunch", "Dinner"];
const blocks = [];
for (let idx = 0; idx < count; idx++) {
const input = root.querySelector(`.block-name-input[data-index="${idx}"]`);
const val = input ? input.value.trim() : "";
blocks.push(val || defaults[idx] || `Block ${idx + 1}`);
}
const defaultTheme = this._defaultTheme();
const themeColors = {};
root.querySelectorAll(".theme-color-input").forEach((input) => {
themeColors[input.dataset.key] = input.value || defaultTheme.colors[input.dataset.key];
});
const themeFonts = {};
root.querySelectorAll(".theme-font-input").forEach((input) => {
const n = parseInt(input.value, 10);
themeFonts[input.dataset.key] = Number.isFinite(n) && n >= 6 && n <= 72 ? n : defaultTheme.fonts[input.dataset.key];
});
const theme = { colors: themeColors, fonts: themeFonts };
const activeGlobalThemeBtn = root.querySelector(".global-theme-btn.active");
const useGlobalTheme = activeGlobalThemeBtn ? activeGlobalThemeBtn.dataset.value === "on" : false;
const globalThemeSelect = root.querySelector(".global-theme-select");
const globalThemeId = useGlobalTheme && globalThemeSelect ? globalThemeSelect.value || "" : "";
const settingsObj = {
blocks,
blockSize,
showTimeline,
timelineStartHour,
timelineEndHour,
defaultView,
countdownEnabled,
countdownItems,
countdownTicker,
dailyDigestEnabled,
dailyDigestTime,
grocyExpiringEnabled,
grocyExpiringDigestEnabled,
grocyLowStockEnabled,
grocyLowStockDigestEnabled,
notificationClickPath,
people,
weekendBreakfast,
showMealsInMonth,
scrollLocked,
theme,
useGlobalTheme,
globalThemeId,
};
const payload = JSON.stringify(settingsObj);
if (this._hass) {
try {
if (this._settingsItemUid) {
await this._hass.callService("todo", "update_item", {
item: this._settingsItemUid,
description: payload,
}, { entity_id: this._config.settings_entity });
} else {
await this._hass.callService("todo", "add_item", {
item: "Settings",
description: payload,
}, { entity_id: this._config.settings_entity });
}
} catch (e) {
}
// New authoritative home, written alongside the legacy to-do item above -
// see _persistSettingsPatch for why the to-do write is kept rather than
// removed.
try {
await this._hass.connection.sendMessagePromise({ type: "family_hub/set_settings", settings: settingsObj });
} catch (e) {
}
await this._fetchSettings();
await this._saveNotifyOverrides(notifyOverrides);
await this._syncDailyDigestConfig();
await this._syncGrocyExpiringConfig();
await this._syncGrocyLowStockConfig();
await this._syncNotificationClickPath();
}
this._closeSettings();
this._applySizeVars();
this._fetchEvents();
this._fetchCountdown();
}
_renderDebug() {
if (!this._root) return;
const start = this._weekStart();
const end = new Date(start);
end.setDate(start.getDate() + 7);
const lines = [];
lines.push(`hass connected: ${!!this._hass}`);
lines.push(`Logged in user: ${this._hass && this._hass.user ? this._hass.user.name + (this._hass.user.is_admin ? " (admin)" : " (non-admin)") : "unknown"}`);
lines.push(`View mode: ${this._viewMode} ${this._viewMode === "month" ? `(month offset ${this._monthOffset || 0})` : `(week offset ${this._weekOffset || 0})`}`);
lines.push(`Query window: ${start.toISOString()} -> ${end.toISOString()}`);
lines.push(`Browser local time now: ${new Date().toString()}`);
lines.push(`Weather entity: ${this._config.weather_entity} (${Object.keys(this._forecast || {}).length} forecast days loaded)`);
lines.push(`Settings entity: ${this._config.settings_entity} (item uid: ${this._settingsItemUid || "none yet"})`);
const settings = this._getSettings();
lines.push(`Scroll locked: ${settings.scrollLocked}`);
lines.push(
`Menu blocks: ${settings.blocks.join(", ")} | weekend breakfast: ${settings.weekendBreakfast} | block size: ${settings.blockSize} | timeline (this device): ${this._getShowTimeline()} (${this._fmtHourOrMidnight(
settings.timelineStartHour
)}–${this._fmtHourOrMidnight(settings.timelineEndHour)})`
);
const countdownCals = this._getPeople().filter((p) => p.countdown).map((p) => p.name);
lines.push(
`Countdown: ${this._countdown ? `${this._countdown.icon} ${this._countdown.label}` : "none"} | enabled: ${settings.countdownEnabled} | source calendars: ${countdownCals.length ? countdownCals.join(", ") : "(none selected)"} | custom: ${settings.countdownLabel || "(none)"} ${settings.countdownDate || ""}`
);
lines.push(`Theme: ${JSON.stringify(settings.theme)}`);
const rect = this.getBoundingClientRect();
const vv = window.visualViewport;
lines.push(
`Viewport: innerHeight=${window.innerHeight}, visualViewport.height=${vv ? Math.round(vv.height) : "n/a"}, host top=${Math.round(rect.top)}, host height=${Math.round(rect.height)}, host bottom=${Math.round(rect.bottom)}`
);
lines.push("");
for (const person of this._getPeople()) {
const evs = this._events[person.entity] || [];
const err = this._fetchErrors[person.entity];
lines.push(`--- ${person.name} (${person.entity}) ---`);
if (err) {
lines.push(`ERROR: ${err}`);
}
lines.push(`events returned: ${evs.length}`);
evs.forEach((ev) => {
const s = ev.start && (ev.start.dateTime || ev.start.date);
const e = ev.end && (ev.end.dateTime || ev.end.date);
lines.push(`  • "${ev.summary}"  ${s} -> ${e}`);
});
lines.push("");
}
const content = this._root.querySelector(".debug-content");
content.innerHTML = lines
.map((l) => (l.startsWith("ERROR") ? `<div class="dbg-err">${l}</div>` : `<div>${l || "&nbsp;"}</div>`))
.join("");
}
_eventOverrideKey(detail) {
const startTs = Math.floor(detail.start.getTime() / 1000);
return `${detail.calendarEntity}|${startTs}|${detail.summary}`;
}
_effectiveReminderMinutes(id) {
const detail = this._eventDetails && this._eventDetails[id];
if (!detail) return [];
const key = this._eventOverrideKey(detail);
if (this._reminderOverrides && Object.prototype.hasOwnProperty.call(this._reminderOverrides, key)) {
return this._reminderOverrides[key];
}
return detail.reminderMinutesList || [];
}
async _fetchReminderOverrides() {
if (!this._hass) return;
try {
const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_reminder_overrides" });
this._reminderOverrides = (result && result.overrides && typeof result.overrides === "object") ? result.overrides : {};
} catch (e) {
// Family Hub not installed, or an older version without this command -
// the reminder editor just falls back to whatever the marker says.
this._reminderOverrides = {};
}
// Only auto-correct the checkboxes from the fetched overrides if the user
// hasn't already started editing them in this popup session - otherwise a
// slow round trip could stomp an edit (and its "Saving..." status) that
// already happened locally.
if (this._eventInfoOpenId && !this._eventInfoRemindDirty) {
this._renderEventInfoRemindSection(this._eventInfoOpenId);
}
}
_renderEventInfoRemindSection(id) {
const detail = this._eventDetails && this._eventDetails[id];
const root = this._root;
const section = root.querySelector(".event-info-remind-content");
if (!detail || !section) return;
if (detail.isReminder) {
// Standalone reminders are a Home Assistant to-do item, not a calendar
// event - date/time and the roll-over setting can be changed right here
// (todo.update_item), or just as well from Home Assistant's own To-do UI.
const fmtTimeInput = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
section.innerHTML = `<div class="event-info-remind-none">&#128276; This is a reminder (a Home Assistant to-do item, not a calendar event) - it notifies once, at its scheduled time. Notify devices for reminders are set under Settings.</div>
<div class="event-info-reminder-edit-row">
<input type="date" class="event-info-reminder-date" />
<input type="time" class="event-info-reminder-time" />
</div>
<label class="remind-check-opt event-info-reminder-rollover-label"><input type="checkbox" class="event-info-reminder-rollover" />&#128257; Roll over to next day if not completed</label>
<div class="event-info-reminder-actions">
<button type="button" class="event-info-reminder-save-btn">&#128190; Save changes</button>
<button type="button" class="event-info-reminder-done-btn">&#9989; Mark done</button>
</div>
<span class="event-info-remind-status"></span>`;
section.querySelector(".event-info-reminder-date").value = this._dateKey(detail.start);
section.querySelector(".event-info-reminder-time").value = fmtTimeInput(detail.start);
section.querySelector(".event-info-reminder-rollover").checked = !!detail.rollover;
const statusEl = section.querySelector(".event-info-remind-status");
const saveBtn = section.querySelector(".event-info-reminder-save-btn");
if (saveBtn) {
saveBtn.addEventListener("click", async () => {
const dateVal = section.querySelector(".event-info-reminder-date").value;
const timeVal = section.querySelector(".event-info-reminder-time").value;
if (!dateVal || !timeVal) return;
const rollover = section.querySelector(".event-info-reminder-rollover").checked;
saveBtn.disabled = true;
saveBtn.textContent = "Saving…";
if (statusEl) statusEl.textContent = "";
try {
await this._hass.callService(
"todo",
"update_item",
{
item: detail.todoUid,
due_datetime: `${dateVal}T${timeVal}:00`,
description: this._buildReminderDescription(detail.description, rollover),
},
{ entity_id: this._config.reminders_entity }
);
// The due date may have moved this reminder to a different day/
// position in the grid, so the synthetic event-info id keyed to its
// old spot won't line up with anything after the refresh - closing
// (like Mark done already does) avoids showing a stale popup.
await this._fetchReminders();
root.querySelector(".event-info-overlay").classList.remove("open");
this._eventInfoOpenId = null;
} catch (e) {
saveBtn.disabled = false;
saveBtn.textContent = "\u{1F4BE} Save changes";
if (statusEl) statusEl.textContent = "Couldn't save - try again";
}
});
}
const doneBtn = section.querySelector(".event-info-reminder-done-btn");
if (doneBtn) {
doneBtn.addEventListener("click", async () => {
doneBtn.disabled = true;
doneBtn.textContent = "Marking done…";
await this._markReminderDone(detail.todoUid);
root.querySelector(".event-info-overlay").classList.remove("open");
this._eventInfoOpenId = null;
});
}
return;
}
if (detail.allDay) {
section.innerHTML = `<div class="event-info-remind-none">Reminders aren't available for all-day events.</div>`;
return;
}
const minutesOptions = [5, 10, 15, 30, 60, 120, 1440];
const current = this._effectiveReminderMinutes(id);
const checkboxesHtml = minutesOptions
.map((m) => {
const label = m >= 60 ? (m % 1440 === 0 ? `${m / 1440}d` : `${m / 60}h`) : `${m}m`;
return `<label class="remind-check-opt"><input type="checkbox" class="event-info-remind-check" value="${m}"${current.includes(m) ? " checked" : ""} />${label}</label>`;
})
.join("");
section.innerHTML = `<div class="remind-check-row">${checkboxesHtml}</div><span class="event-info-remind-status"></span>`;
section.querySelectorAll(".event-info-remind-check").forEach((cb) => {
cb.addEventListener("change", () => this._saveReminderOverride(id));
});
}
// Every OTHER timed event currently loaded (i.e. visible somewhere in the
// currently-fetched week/month range) whose name matches this one - used
// to offer "update all of them too" when editing a reminder, since a name
// match is the closest thing to "the same recurring thing" most calendar
// platforms expose to this card (no calendar.update_event / series id to
// key off of). All-day events are excluded since reminders aren't
// supported on them at all.
_findSameNameEvents(detail) {
const targetName = (detail.summary || "").trim().toLowerCase();
if (!targetName) return [];
const selfKey = this._eventOverrideKey(detail);
const matches = [];
const seen = new Set();
for (const [calendarEntity, evs] of Object.entries(this._events || {})) {
for (const ev of evs || []) {
if (!ev.start || !ev.start.dateTime) continue;
const name = (ev.summary || "").trim().toLowerCase();
if (name !== targetName) continue;
const startTs = Math.floor(new Date(ev.start.dateTime).getTime() / 1000);
const key = `${calendarEntity}|${startTs}|${ev.summary}`;
if (key === selfKey || seen.has(key)) continue;
seen.add(key);
matches.push({ calendarEntity, start: startTs, summary: ev.summary });
}
}
return matches;
}
_saveOneReminderOverride(calendarEntity, startTs, summary, minutes) {
return this._hass.connection.sendMessagePromise({
type: "family_hub/set_reminder_override",
calendar_entity: calendarEntity,
start: startTs,
summary,
minutes,
});
}
async _saveReminderOverride(id) {
const detail = this._eventDetails && this._eventDetails[id];
if (!detail || !this._hass) return;
const root = this._root;
const checks = Array.from(root.querySelectorAll(".event-info-remind-check"));
const minutes = checks
.filter((c) => c.checked)
.map((c) => parseInt(c.value, 10))
.filter((n) => Number.isFinite(n) && n > 0);

// If other events with this same name are currently loaded, ask whether
// the change should follow all of them (e.g. a weekly "Yoga" class) or
// stay scoped to just this one occurrence.
const matches = this._findSameNameEvents(detail);
let applyToAll = false;
if (matches.length) {
applyToAll = window.confirm(
`"${detail.summary}" also appears ${matches.length} more time${matches.length === 1 ? "" : "s"} in the current view.\n\n` +
`OK - update the reminder for all of them too\n` +
`Cancel - update only this one event`
);
}

this._eventInfoRemindDirty = true;
const statusEl = root.querySelector(".event-info-remind-status");
if (statusEl) statusEl.textContent = "Saving…";
try {
const startTs = Math.floor(detail.start.getTime() / 1000);
const result = await this._saveOneReminderOverride(detail.calendarEntity, startTs, detail.summary, minutes);
const key = (result && result.key) || this._eventOverrideKey(detail);
const savedMinutes = (result && result.minutes) || minutes.slice().sort((a, b) => a - b);
if (!this._reminderOverrides) this._reminderOverrides = {};
this._reminderOverrides[key] = savedMinutes;
detail.reminderMinutesList = savedMinutes;

let extraSaved = 0;
if (applyToAll && matches.length) {
const results = await Promise.allSettled(
matches.map((m) => this._saveOneReminderOverride(m.calendarEntity, m.start, m.summary, minutes))
);
results.forEach((r, i) => {
if (r.status === "fulfilled") {
const m = matches[i];
const mKey = (r.value && r.value.key) || `${m.calendarEntity}|${m.start}|${m.summary}`;
const mMinutes = (r.value && r.value.minutes) || savedMinutes;
this._reminderOverrides[mKey] = mMinutes;
extraSaved++;
}
});
}

if (statusEl) {
statusEl.textContent = savedMinutes.length
? extraSaved > 0
? `Saved (+${extraSaved} more)`
: "Saved"
: "Reminder removed";
}
} catch (e) {
if (statusEl) statusEl.textContent = "Couldn't save - try again";
}
}
_openEventInfo(id) {
const detail = this._eventDetails && this._eventDetails[id];
if (!detail) return;
const root = this._root;
root.querySelector(".event-info-title").textContent = detail.summary;
const fmtDate = (d) => d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
const fmtTime = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
let whenText;
if (detail.allDay) {
whenText = fmtDate(detail.start);
} else {
const sameDay = this._dateKey(detail.start) === this._dateKey(detail.end);
whenText = sameDay
? `${fmtDate(detail.start)} · ${fmtTime(detail.start)} – ${fmtTime(detail.end)}`
: `${fmtDate(detail.start)} ${fmtTime(detail.start)} – ${fmtDate(detail.end)} ${fmtTime(detail.end)}`;
}
const rows = [];
rows.push(
`<div class="event-info-row"><div class="label">${detail.isReminder ? "Reminder" : "Calendar"}</div><span class="event-info-chip" style="background:${detail.color}">${detail.isReminder ? "&#128276; " : ""}${detail.personName}</span></div>`
);
rows.push(`<div class="event-info-row"><div class="label">When</div>${whenText}</div>`);
if (detail.location) {
rows.push(`<div class="event-info-row"><div class="label">Location</div>${detail.location}</div>`);
}
rows.push(`<div class="event-info-row event-info-remind-row"><div class="label">Remind me</div><div class="event-info-remind-content"></div></div>`);
if (detail.description) {
rows.push(`<div class="event-info-row"><div class="label">Details</div>${detail.description}</div>`);
}
const mealDateKey = this._dateKey(detail.start);
const mealDayIndex = detail.start.getDay();
const mealBlocks = this._getBlocksForDay(mealDayIndex);
// Reminders aren't calendar events in the meal-planning sense - skip the
// "use as meal" shortcut for them.
if (!detail.isReminder) {
const useMealButtonsHtml = mealBlocks
.map((blockName, blockIndex) => `<button type="button" class="event-info-use-meal-btn" data-block-index="${blockIndex}">${blockName}</button>`)
.join("");
rows.push(
`<div class="event-info-row event-info-use-meal-row"><div class="label">Use as meal</div><div class="event-info-use-meal-buttons">${useMealButtonsHtml}</div></div>`
);
}
const today0 = new Date();
today0.setHours(0, 0, 0, 0);
const eventIsUpcoming = detail.start >= today0;
if (eventIsUpcoming) {
// Works the same for a reminder or a calendar event - either can be
// marked (or un-marked) as a countdown item, matched by its own
// name + date against the saved countdownItems list.
const dateKeyForCountdown = this._dateKey(detail.start);
const existingCountdownItem = (this._getSettings().countdownItems || []).find(
(it) => it.label === detail.summary && it.date === dateKeyForCountdown
);
rows.push(
`<div class="event-info-row event-info-countdown-row"><div class="label">Countdown</div><button type="button" class="event-info-countdown-btn${existingCountdownItem ? " done" : ""}" data-countdown-item-id="${existingCountdownItem ? existingCountdownItem.id : ""}">${existingCountdownItem ? "\u{1F5D1} Remove from countdown" : "⏳ Use as countdown"}</button></div>`
);
}
root.querySelector(".event-info-content").innerHTML = rows.join("");
this._eventInfoOpenId = id;
this._eventInfoRemindDirty = false;
this._renderEventInfoRemindSection(id);
root.querySelectorAll(".event-info-use-meal-btn").forEach((btn) => {
btn.addEventListener("click", async () => {
const blockIndex = parseInt(btn.dataset.blockIndex, 10);
const existing = this._getMealForDay(mealDateKey, detail.start, blockIndex);
if (existing) {
const blockName = mealBlocks[blockIndex] || `Block ${blockIndex + 1}`;
const confirmed = window.confirm(`${blockName} already has "${existing.name}" planned. Replace it with "${detail.summary}"?`);
if (!confirmed) return;
}
btn.disabled = true;
await this._upsertMealPlan(mealDateKey, blockIndex, detail.summary, "", "", detail.color);
root.querySelectorAll(".event-info-use-meal-btn").forEach((b) => b.classList.remove("done"));
btn.classList.add("done");
btn.disabled = false;
});
});
const countdownBtn = root.querySelector(".event-info-countdown-btn");
if (countdownBtn) {
countdownBtn.addEventListener("click", async () => {
countdownBtn.disabled = true;
const currentId = countdownBtn.dataset.countdownItemId;
if (currentId) {
await this._removeCountdownItem(currentId);
countdownBtn.textContent = "⏳ Use as countdown";
countdownBtn.classList.remove("done");
countdownBtn.dataset.countdownItemId = "";
} else {
const newId = await this._addCountdownItem(detail.summary, this._dateKey(detail.start));
countdownBtn.textContent = "\u{1F5D1} Remove from countdown";
countdownBtn.classList.add("done");
countdownBtn.dataset.countdownItemId = newId || "";
}
countdownBtn.disabled = false;
});
}
this._openModal(root.querySelector(".event-info-overlay"));
// Overrides load async so a stale checkbox state (e.g. cleared from
// another device) gets corrected shortly after open - the popup isn't
// blocked on the round trip.
this._fetchReminderOverrides();
}
_updateRatingButtons() {
const heart = this._root.querySelector(".btn-heart");
const thumbsdown = this._root.querySelector(".btn-thumbsdown");
heart.classList.toggle("active-up", this._currentRating === "up");
thumbsdown.classList.toggle("active-down", this._currentRating === "down");
}
_updateColorSwatches() {
if (!this._root) return;
const current = (this._currentColor || "").toLowerCase();
this._root.querySelectorAll(".swatch").forEach((sw) => {
sw.classList.toggle("selected", sw.dataset.color.toLowerCase() === current);
});
}
// Enables/disables the "open link" button next to the menu modal's Recipe
// link field based on whether there's currently a (trimmed, non-empty)
// value to open - called whenever .input-link is populated programmatically
// (opening the editor, picking a loved dish/suggestion) and on every
// keystroke, so it never offers to open a blank or since-cleared link.
_updateMenuLinkOpenBtn() {
if (!this._root) return;
const linkInput = this._root.querySelector(".input-link");
const btn = this._root.querySelector(".menu-link-open-btn");
if (!linkInput || !btn) return;
btn.disabled = !linkInput.value.trim();
btn.title = this._currentGrocyRecipeId ? "View recipe" : "Open link";
// The Servings field only makes sense for a specific planned meal backed
// by a Grocy recipe (it edits that recipe's desired_servings in Grocy at
// grocery-list push time - see _ws_push_grocery_list) - never for the
// Recipe Box / Loved Dish editor, which is a reusable template rather
// than a dated instance of a meal.
const servingsField = this._root.querySelector(".servings-field");
if (servingsField) {
servingsField.style.display = !this._dishEditorMode && this._currentGrocyRecipeId ? "" : "none";
}
this._updateMenuEditorPhoto();
}
// Shows the Grocy recipe's photo (see get_grocy_recipe_detail's "image"
// field) as a header banner in the day/dish editor whenever a Grocy
// recipe is attached (this._currentGrocyRecipeId set by picking one via
// the "From Grocy" button, opening an existing Grocy-backed meal/dish, or
// importing a link) - hidden entirely otherwise, e.g. a plain manual link
// or freeform dish with no Grocy recipe behind it. Cheap to call from
// _updateMenuLinkOpenBtn on every keystroke/selection since it no-ops
// once already fetched for the current id.
_updateMenuEditorPhoto() {
if (!this._root) return;
const img = this._root.querySelector(".menu-editor-photo");
if (!img) return;
const recipeId = this._currentGrocyRecipeId;
if (!recipeId) {
img.style.display = "none";
img.src = "";
this._menuEditorPhotoRecipeId = null;
this._currentMenuRecipeDetail = null;
this._renderMealViewCard();
return;
}
if (this._menuEditorPhotoRecipeId === recipeId) return;
this._menuEditorPhotoRecipeId = recipeId;
this._currentMenuRecipeDetail = null;
img.style.display = "none";
img.src = "";
if (!this._hass) return;
this._hass.connection
.sendMessagePromise({ type: "family_hub/get_grocy_recipe_detail", recipe_id: recipeId })
.then((result) => {
// The editor may have moved on to a different recipe (or none) while
// this was in flight - don't let a slow, stale response clobber it.
if (this._currentGrocyRecipeId !== recipeId) return;
const recipe = result && result.recipe;
const image = recipe && recipe.image;
if (image) {
img.src = image;
// Same "" vs an explicit value gotcha as _renderGrocyRecipeDetail's
// photo - .menu-editor-photo's CSS rule itself defaults to
// display:none, so clearing the inline style silently falls back to
// that instead of showing the image.
img.style.display = "block";
} else {
img.style.display = "none";
img.src = "";
}
// Prep/Cook time and this recipe's own default servings (used as a
// fallback below when the planned meal has no per-meal servings
// override) only ever come from this same detail fetch - re-render
// the view card now that they're in, same as the photo just above.
this._currentMenuRecipeDetail = recipe || null;
this._renderMealViewCard();
})
.catch(() => {
if (this._currentGrocyRecipeId !== recipeId) return;
img.style.display = "none";
img.src = "";
});
}
// Opens whatever the day/dish editor's Recipe link field currently points
// to - the Grocy Recipe Viewer if this meal is backed by a Grocy recipe,
// or just the plain URL in a new tab otherwise. Shared by the compact
// icon-only button next to the Recipe link field (edit mode) and the
// full-width "View Recipe" button on the read-only view card, so both
// behave identically no matter which one is visible.
_openCurrentMenuLink() {
const url = this._root.querySelector(".input-link").value.trim();
if (!url) return;
const name = this._root.querySelector(".input-name").value.trim();
if (this._currentGrocyRecipeId) {
this._openGrocyRecipeViewer(this._currentGrocyRecipeId, name, url);
} else {
window.open(url, "_blank", "noopener");
}
}
// Toggles between the read-only meal view-card (title, prep/cook/serves,
// View Recipe, and the pencil Edit button) and the actual editable fields
// (name, description, link, more options) - both live in the same modal
// at all times, only one is ever visible. The rating (heart/thumbsdown)
// row is deliberately outside either container so it stays visible in
// both modes.
_setMealEditorViewMode(showView) {
const root = this._root;
if (!root) return;
this._mealEditorViewMode = showView;
root.querySelector(".meal-view-card").style.display = showView ? "" : "none";
root.querySelector(".meal-edit-fields").style.display = showView ? "none" : "";
// Nothing to save while just looking at the view card - Save reappears
// the moment Edit is tapped.
const saveBtn = root.querySelector(".btn-save");
if (saveBtn) saveBtn.style.display = showView ? "none" : "";
}
// Populates the view card from whatever's known right now - this._editingExistingMeal
// (set once, at open time, in _openEditorForDate) for the name/servings-override/
// link, and this._currentMenuRecipeDetail (refreshed asynchronously by
// _updateMenuEditorPhoto whenever the attached Grocy recipe, if any,
// changes) for prep/cook time and that recipe's own default servings.
// Safe to call any time, including before the Grocy detail fetch has
// resolved (or when there's no Grocy recipe at all) - every field just
// falls back to hidden rather than showing stale or half-loaded data.
_renderMealViewCard() {
const root = this._root;
if (!root) return;
const existing = this._editingExistingMeal;
const recipe = this._currentMenuRecipeDetail;
const titleEl = root.querySelector(".meal-view-title");
if (titleEl) titleEl.textContent = (existing && existing.name) || "";
const prepEl = root.querySelector(".meal-view-prep");
const cookEl = root.querySelector(".meal-view-cook");
const servesEl = root.querySelector(".meal-view-serves");
const prepTime = (recipe && recipe.prep_time) || "";
const cookTime = (recipe && recipe.cook_time) || "";
if (prepTime) {
root.querySelector(".meal-view-prep-value").textContent = prepTime;
prepEl.style.display = "";
} else {
prepEl.style.display = "none";
}
if (cookTime) {
root.querySelector(".meal-view-cook-value").textContent = cookTime;
cookEl.style.display = "";
} else {
cookEl.style.display = "none";
}
// A per-meal servings override (set for this specific dated occurrence)
// wins over the recipe's own default - same precedence the grocery-list
// push logic already uses.
const servings = existing && typeof existing.servings === "number" && existing.servings > 0
? existing.servings
: (recipe && recipe.servings) || null;
if (servings) {
root.querySelector(".meal-view-serves-value").textContent = servings;
servesEl.style.display = "";
} else {
servesEl.style.display = "none";
}
const hasLink = !!(existing && existing.link && existing.link.trim());
root.querySelector(".meal-view-recipe-btn").style.display = hasLink ? "" : "none";
}
_openEditor(dayIndex, blockIndex) {
const start = this._weekStart();
const dayDate = new Date(start);
dayDate.setDate(start.getDate() + dayIndex);
this._openEditorForDate(dayDate, blockIndex);
}
_openEditorForDate(dayDate, blockIndex) {
const dateKey = this._dateKey(dayDate);
const root = this._root;
this._dishEditorMode = false;
this._editingDishUid = null;
root.querySelectorAll(".dish-hide-field").forEach((el) => {
el.style.display = "";
});
root.querySelectorAll(".dish-only-field").forEach((el) => {
el.style.display = "none";
});
root.querySelector(".btn-delete-dish").style.display = "none";
this._editingDateKey = dateKey;
this._editingBlockIndex = blockIndex || 0;
const blocks = this._getBlocksForDay(dayDate.getDay());
const blockName = blocks[this._editingBlockIndex] || `Block ${this._editingBlockIndex + 1}`;
const dateLabel = dayDate.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
root.querySelector(".modal-day-title").textContent = `Edit ${blockName} — ${dateLabel}`;
// _getMealForDay resolves either an explicit entry for this exact date or
// - if there isn't one - a projected "repeat weekly" meal from some
// earlier anchor date. .recurring (only set on the latter) is what
// _saveEditor uses to decide whether to ask "just this day, or every
// future week?" instead of just overwriting.
const existing = this._getMealForDay(dateKey, dayDate, this._editingBlockIndex);
this._editingMealRecurring = !!(existing && existing.recurring);
this._editingMealAnchorUid = existing ? existing.uid : null;
this._editingExistingMeal = existing;
root.querySelector(".input-name").value = existing ? existing.name : "";
root.querySelector(".input-description").value = existing ? existing.description : "";
root.querySelector(".input-link").value = existing ? existing.link : "";
this._currentGrocyRecipeId = (existing && existing.grocyRecipeId) || null;
root.querySelector(".input-servings").value =
existing && typeof existing.servings === "number" ? String(existing.servings) : "";
this._updateMenuLinkOpenBtn();
const recurCheck = root.querySelector(".input-recur-weekly");
if (recurCheck) recurCheck.checked = !!(existing && existing.recur === "weekly");
const recipe = existing ? this._recipes.find((r) => r.name.toLowerCase() === existing.name.trim().toLowerCase()) : null;
this._currentRating = recipe ? recipe.rating : null;
this._updateRatingButtons();
this._currentColor = (existing && existing.color) || "#f0e6c4";
root.querySelector(".input-color-custom").value = this._currentColor;
this._updateColorSwatches();
// Once a meal is actually set for this slot, the "pick a starting point"
// buttons (From suggested/loved/Grocy) have already done their job -
// showing them again would just invite accidentally picking a wholly
// different meal instead of editing this one's details. Clear brings
// them back (see the .btn-clear handler) since that puts the slot back
// to genuinely empty. A projected recurring meal with nothing overriding
// it still counts as "set" here - it has a name and everything.
const isSet = !!(existing && existing.name);
this._editingMealIsSet = isSet;
root.querySelector(".pick-btn-group").style.display = isSet ? "none" : "";
this._renderMealViewCard();
this._setMealEditorViewMode(isSet);
this._openModal(root.querySelector(".edit-overlay"));
}
_closeEditor() {
this._root.querySelector(".edit-overlay").classList.remove("open");
}
_openDishEditor(recipe) {
const root = this._root;
this._dishEditorMode = true;
this._editingDishUid = recipe ? recipe.uid : null;
root.querySelectorAll(".dish-hide-field").forEach((el) => {
el.style.display = "none";
});
root.querySelectorAll(".dish-only-field").forEach((el) => {
el.style.display = "";
});
root.querySelector(".btn-delete-dish").style.display = recipe ? "" : "none";
root.querySelector(".modal-day-title").textContent = recipe ? "Edit Recipe" : "Add Recipe";
root.querySelector(".input-name").value = recipe ? recipe.name || "" : "";
root.querySelector(".input-description").value = recipe ? recipe.description || "" : "";
root.querySelector(".input-link").value = recipe ? recipe.link || "" : "";
root.querySelector(".input-category").value = recipe ? recipe.category || "" : "";
this._populateDishCategoryOptions();
// Always starts unchecked, add or edit alike - it's a one-time "also do
// this on save" action (see _saveDishEditor), not a persisted field on
// the recipe itself, so there's no existing state to restore here the
// way there is for name/category/photo/etc.
root.querySelector(".input-add-suggestion").checked = false;
this._currentGrocyRecipeId = (recipe && recipe.grocyRecipeId) || null;
root.querySelector(".input-servings").value = "";
this._updateMenuLinkOpenBtn();
this._setDishImage(recipe ? recipe.image || "" : "");
const recurCheck = root.querySelector(".input-recur-weekly");
if (recurCheck) recurCheck.checked = false;
this._currentRating = recipe ? recipe.rating || "up" : "up";
this._updateRatingButtons();
this._currentColor = "#f0e6c4";
root.querySelector(".input-color-custom").value = this._currentColor;
this._updateColorSwatches();
// The Loved Dishes / Recipe Box editor is a reusable template, not a
// specific dated meal - it always shows the editable fields directly,
// never the calendar-slot view card (there's no "already planned" state
// to summarize here).
this._editingExistingMeal = null;
this._setMealEditorViewMode(false);
this._openModal(root.querySelector(".edit-overlay"));
}
// Deleting a dish that was imported from Grocy (grocyRecipeId set) also
// deletes the underlying recipe in Grocy itself, not just the local
// Recipe Box todo item - otherwise the recipe would keep existing in
// Grocy (still pickable from "Add from Grocy", still in Grocy's own
// recipe list) even though the household just asked to delete it. The
// Grocy-side call is deliberately non-fatal on failure (offline, Grocy
// temporarily down): the Recipe Box entry is still removed either way,
// since that's the part actually under this app's control, and a
// leftover Grocy recipe can always be cleaned up from Grocy's own UI.
async _deleteDish(uid, grocyRecipeId) {
if (!uid) return;
if (grocyRecipeId) {
try {
await this._hass.connection.sendMessagePromise({
type: "family_hub/delete_grocy_recipe",
recipe_id: grocyRecipeId,
});
} catch (e) {
}
}
this._recipes = this._recipes.filter((r) => r.uid !== uid);
await this._persistRecipes();
this._renderLoved();
this._renderGrid();
}
_saveEditor() {
if (this._dishEditorMode) {
this._saveDishEditor();
return;
}
const dateKey = this._editingDateKey;
const blockIndex = this._editingBlockIndex || 0;
const root = this._root;
const name = root.querySelector(".input-name").value.trim();
const description = root.querySelector(".input-description").value.trim();
const link = root.querySelector(".input-link").value.trim();
const recur = root.querySelector(".input-recur-weekly").checked ? "weekly" : null;
// Only meaningful alongside a Grocy recipe - blank means "use whatever
// the recipe's own desired_servings is currently set to in Grocy"
// rather than a specific override for this planned meal.
const servingsRaw = root.querySelector(".input-servings").value.trim();
const servings = this._currentGrocyRecipeId && servingsRaw ? parseInt(servingsRaw, 10) || null : null;
if (name) {
if (this._editingMealRecurring && this._editingMealAnchorUid) {
// What's showing here is a projection of a "repeat weekly" meal set
// on some earlier date, not a concrete entry for THIS date - ask
// whether the edit should apply to every future week (by editing the
// anchor item itself) or just carve out a one-off override for this
// single occurrence, leaving the recurring meal untouched everywhere
// else. Mirrors the same this-one-or-all pattern already used for
// per-event reminder overrides.
const applyToAll = window.confirm(
`"${name}" repeats weekly.\n\n` +
`OK - update it for this day and every future week\n` +
`Cancel - only change this one occurrence`
);
if (applyToAll) {
this._upsertMealPlanByUid(this._editingMealAnchorUid, blockIndex, name, description, link, this._currentColor, recur, this._currentGrocyRecipeId, servings);
} else {
this._upsertMealPlan(dateKey, blockIndex, name, description, link, this._currentColor, null, this._currentGrocyRecipeId, servings);
}
} else {
this._upsertMealPlan(dateKey, blockIndex, name, description, link, this._currentColor, recur, this._currentGrocyRecipeId, servings);
}
this._upsertDish(name, description, link, this._currentRating, null, this._currentGrocyRecipeId);
} else if (this._editingMealRecurring && this._editingMealAnchorUid) {
// Clearing a projected occurrence's name means "skip just this one
// week" - an explicit "Skipped" entry for this date overrides the
// projection without touching the recurring anchor, so it keeps
// projecting normally onto every other week.
this._upsertMealPlan(dateKey, blockIndex, "Skipped", "", "", this._currentColor, null);
} else {
this._removeMealPlan(dateKey, blockIndex);
}
this._closeEditor();
}
_saveDishEditor() {
const root = this._root;
const name = root.querySelector(".input-name").value.trim();
const description = root.querySelector(".input-description").value.trim();
const link = root.querySelector(".input-link").value.trim();
const category = root.querySelector(".input-category").value.trim();
const image = root.querySelector(".input-dish-image").value.trim();
const addAsSuggestion = root.querySelector(".input-add-suggestion").checked;
if (name) {
// checkDuplicates=true here (unlike the day/menu editor's own "mirror
// this planned meal into the Recipe Box" call in _saveEditor) because
// this IS the deliberate "add/edit a Recipe Box entry" action - a
// near-duplicate nudge is the point, not an interruption. See
// _upsertDish's own comment for why the two calls differ.
this._upsertDish(name, description, link, this._currentRating || "up", this._editingDishUid, this._currentGrocyRecipeId, category, image, true);
// "Also add to Meal Suggestions" - the other half of "search for a
// recipe and tap 💡, or add one and check this box" (see
// _suggestDish and the now-removed Suggestions box free-text add).
// Fires after _upsertDish so a fuzzy-duplicate cancel above also
// cancels this - no orphaned suggestion for a recipe that was never
// actually added.
if (addAsSuggestion) {
this._addSuggestion(name, description, link, this._currentGrocyRecipeId);
}
}
this._closeEditor();
}
// Live-updates the small photo preview under the dish editor's "Photo
// URL" field as it's typed/pasted into, and is also the single place
// that field's own value gets set from - _openDishEditor calls this with
// an existing recipe's image (or "" for a new one) instead of poking the
// input/preview separately, so the two can never drift out of sync.
_setDishImage(url) {
const root = this._root;
if (!root) return;
const input = root.querySelector(".input-dish-image");
const preview = root.querySelector(".dish-image-preview");
if (input) input.value = url || "";
if (!preview) return;
if (url) {
preview.src = url;
preview.style.display = "block";
} else {
preview.src = "";
preview.style.display = "none";
}
}
// Datalist suggestions for the Category field: every category already in
// use across the Recipe Box, so picking one is a couple of keystrokes on
// a device with a keyboard and a single tap on the on-screen one, rather
// than everyone having to remember (and spell consistently) whatever
// categories the household has settled on so far. Deliberately not a
// fixed dropdown - a free-text field with suggestions still lets a
// three-person household invent "Kid-approved" or "Slow cooker" without
// this needing to know about it in advance.
_populateDishCategoryOptions() {
const root = this._root;
if (!root) return;
const datalist = root.querySelector("#dish-category-options");
if (!datalist) return;
const categories = Array.from(
new Set((this._recipes || []).map((r) => (r.category || "").trim()).filter(Boolean))
).sort((a, b) => a.localeCompare(b));
datalist.innerHTML = categories.map((c) => `<option value="${c.replace(/"/g, "&quot;")}"></option>`).join("");
}
_openLoved(pickerMode) {
this._pickerMode = !!pickerMode;
this._lovedSearchTerm = "";
this._recipeBoxCategory = "All";
this._recipeBoxSort = "default";
this._recipeBoxSelectMode = false;
this._recipeBoxSelectedUids.clear();
this._root.querySelector(".loved-search").value = "";
this._root.querySelector(".recipe-sort-select").value = "default";
this._fetchRecipes();
// Picker mode (opened from the day/menu editor's single "Pick a
// Recipe" button - see the pick-btn-group HTML) is now the exact same
// searchable/filterable/sortable grid-or-list browse experience as the
// full Recipe Box, not a separate, narrower loved-only list - it just
// fills in the editor and closes on tap instead of opening dish detail
// (see _renderLoved's click wiring), and hides the bulk-select/delete
// entry point since that's not a task that belongs mid-picking.
this._root.querySelector(".loved-title").textContent = this._pickerMode
? "\u{1F37D}\u{FE0F} Pick a Recipe"
: "\u{1F37D}\u{FE0F} Recipe Box";
this._root.querySelector(".loved-hint").style.display = this._pickerMode ? "block" : "none";
this._root.querySelector(".recipe-box-select-btn").style.display = this._pickerMode ? "none" : "";
this._openModal(this._root.querySelector(".loved-overlay"));
}
_closeLoved() {
this._root.querySelector(".loved-overlay").classList.remove("open");
}
// The header's 💡 Suggestions button and the + FAB's "Meal Suggestion"
// item both land here now - there's no standalone Suggestions modal left
// to open at all (see the removed _openSuggestions/_renderSuggestions).
// "Viewing suggestions" is just the Recipe Box itself, opened straight to
// its own "💡 Suggested" filter chip (see _renderRecipeBoxCategoryChips
// and the "suggested" branch of _renderLoved's category filtering) -
// browsing, editing, or picking a suggested recipe from here is exactly
// the same as doing any of that for any other Recipe Box entry.
_openSuggestedRecipes() {
this._openLoved(false);
this._recipeBoxCategory = "💡 Suggested";
this._renderLoved();
}
_selectLovedDish(recipe) {
const root = this._root;
root.querySelector(".input-name").value = recipe.name || "";
root.querySelector(".input-description").value = recipe.description || "";
root.querySelector(".input-link").value = recipe.link || "";
this._currentGrocyRecipeId = recipe.grocyRecipeId || null;
root.querySelector(".input-servings").value = "";
this._updateMenuLinkOpenBtn();
this._currentRating = recipe.rating || "up";
this._updateRatingButtons();
this._closeLoved();
}
// One unified browse/pick surface - grid or list (_getRecipeBoxViewMode),
// searchable, filterable by category, and sortable (_sortRecipeBoxList) -
// shared by the full Recipe Box AND the day/menu editor's single "Pick a
// Recipe" entry point (_pickerMode, see _openLoved). The two only differ
// in title/hint text and in what tapping a card does: picker mode fills
// in the editor and closes (_selectLovedDish), browsing mode opens the
// dish detail screen (_openDishDetail) - unless bulk-select mode is on
// (browsing only), in which case a tap toggles that card's selection
// instead of either of those.
_renderLoved() {
if (!this._root) return;
const list = this._root.querySelector(".loved-list");
const viewMode = this._getRecipeBoxViewMode();
list.classList.toggle("recipe-grid", viewMode !== "list");
list.classList.toggle("recipe-list", viewMode === "list");
this._updateRecipeBoxViewButtons();
this._renderRecipeBoxCategoryChips();
this._updateRecipeBoxSelectBar();
// Fire-and-forget: fills in photos for Grocy-imported dishes that don't
// have one yet (see _hydrateGrocyRecipeImages) and re-renders once they
// land, so the grid doesn't have to wait on Grocy before showing names/
// placeholders first.
this._hydrateGrocyRecipeImages();
let recipes = this._recipes.slice();
// Matches a Recipe Box entry to a Meal Suggestions entry by name
// (case-insensitive) since the two aren't otherwise linked records -
// same matching rule _sortRecipeBoxList's "suggested" sort already uses.
// Computed once here so both the "Suggested" filter chip below and each
// card/row's suggest-icon highlight (see the .map() further down) agree
// on the same answer for the same render.
const suggestedNameSet = new Set((this._suggestions || []).map((s) => (s.name || "").trim().toLowerCase()));
const term = (this._lovedSearchTerm || "").trim().toLowerCase();
if (term) {
recipes = recipes.filter(
(r) =>
(r.name || "").toLowerCase().includes(term) ||
(r.description || "").toLowerCase().includes(term) ||
(r.category || "").toLowerCase().includes(term)
);
}
const activeCategory = this._recipeBoxCategory || "All";
if (activeCategory === "❤️ Loved") {
recipes = recipes.filter((r) => r.rating === "up");
} else if (activeCategory === "💡 Suggested") {
recipes = recipes.filter((r) => suggestedNameSet.has((r.name || "").trim().toLowerCase()));
} else if (activeCategory !== "All") {
recipes = recipes.filter((r) => (r.category || "Uncategorized") === activeCategory);
}
recipes = this._sortRecipeBoxList(recipes);
if (!recipes.length) {
list.innerHTML = `<div class="loved-empty">${
term || activeCategory !== "All"
? "No recipes match this search/filter."
: "Your Recipe Box is empty - tap “+ Add Recipe” or “\u{1F517} Import from a link” above to get started."
}</div>`;
return;
}
const isListView = viewMode === "list";
const selectMode = this._recipeBoxSelectMode && !this._pickerMode;
list.innerHTML = recipes
.map((r, idx) => {
const isLoved = r.rating === "up";
const isSuggested = suggestedNameSet.has((r.name || "").trim().toLowerCase());
const isSelected = selectMode && this._recipeBoxSelectedUids.has(r.uid);
const initial = (r.name || "?").trim().charAt(0).toUpperCase();
if (isListView) {
const media = r.image
? `<div class="recipe-row-media" style="background-image:url('${String(r.image).replace(/'/g, "%27")}')"></div>`
: `<div class="recipe-row-media recipe-row-media-placeholder"><span>${initial}</span></div>`;
const category = r.category ? `<span class="recipe-row-category">${r.category}</span>` : "";
const trailing = selectMode
? `<div class="recipe-row-select-badge">${isSelected ? "&#10003;" : ""}</div>`
: `<div class="recipe-row-actions">
<button type="button" class="recipe-row-heart ${isLoved ? "is-loved" : ""}" data-idx="${idx}" title="${isLoved ? "Remove from loved" : "Love this dish"}">${isLoved ? "&#10084;&#65039;" : "&#129293;"}</button>
<button type="button" class="recipe-row-suggest ${isSuggested ? "is-suggested" : ""}" data-idx="${idx}" title="${isSuggested ? "Remove from Suggestions" : "Suggest this for a meal"}">&#128161;</button>
</div>`;
return `<div class="recipe-row ${isSelected ? "is-selected" : ""}" data-idx="${idx}">
${media}
<div class="recipe-row-body">
<div class="recipe-row-name">${r.name}</div>
${category}
</div>
${trailing}
</div>`;
}
const media = r.image
? `<div class="recipe-card-media" style="background-image:url('${String(r.image).replace(/'/g, "%27")}')"></div>`
: `<div class="recipe-card-media recipe-card-media-placeholder"><span>${initial}</span></div>`;
const category = r.category ? `<span class="recipe-card-category">${r.category}</span>` : "";
const overlay = selectMode
? `<div class="recipe-card-select-badge">${isSelected ? "&#10003;" : ""}</div>`
: `<button type="button" class="recipe-card-heart ${isLoved ? "is-loved" : ""}" data-idx="${idx}" title="${isLoved ? "Remove from loved" : "Love this dish"}">${isLoved ? "&#10084;&#65039;" : "&#129293;"}</button>
<button type="button" class="recipe-card-suggest ${isSuggested ? "is-suggested" : ""}" data-idx="${idx}" title="${isSuggested ? "Remove from Suggestions" : "Suggest this for a meal"}">&#128161;</button>`;
return `<div class="recipe-card ${isSelected ? "is-selected" : ""}" data-idx="${idx}">
${media}
${overlay}
<div class="recipe-card-body">
<div class="recipe-card-name">${r.name}</div>
${category}
</div>
</div>`;
})
.join("");
const cardSelector = isListView ? ".recipe-row" : ".recipe-card";
list.querySelectorAll(cardSelector).forEach((el) => {
el.addEventListener("click", () => {
const idx = parseInt(el.dataset.idx, 10);
const recipe = recipes[idx];
if (selectMode) {
this._toggleRecipeBoxSelected(recipe.uid);
} else if (this._pickerMode) {
this._selectLovedDish(recipe);
} else {
this._openDishDetail(recipe);
}
});
});
if (!selectMode) {
const heartSelector = isListView ? ".recipe-row-heart" : ".recipe-card-heart";
const suggestSelector = isListView ? ".recipe-row-suggest" : ".recipe-card-suggest";
list.querySelectorAll(heartSelector).forEach((el) => {
el.addEventListener("click", (e) => {
e.stopPropagation();
const idx = parseInt(el.dataset.idx, 10);
this._toggleDishLoved(recipes[idx]);
});
});
list.querySelectorAll(suggestSelector).forEach((el) => {
el.addEventListener("click", (e) => {
e.stopPropagation();
const idx = parseInt(el.dataset.idx, 10);
this._suggestDish(recipes[idx]);
});
});
}
}
// "default" (whatever order the recipe_box todo list returns), "name"
// (A-Z), or "suggested" - the latter puts anything currently sitting in
// Meal Suggestions at the top (matched by name, case-insensitive, since
// a suggestion and a Recipe Box entry aren't otherwise linked records),
// which is the actual point of the day/menu editor now routing through
// here: seeing what's already been proposed for the week before digging
// through everything else. Ties within each group keep their original
// relative order (a stable partition, not a full re-sort within either
// group) so switching to "Suggested first" doesn't also scramble
// alphabetical or default ordering someone was relying on.
_sortRecipeBoxList(recipes) {
const mode = this._recipeBoxSort || "default";
if (mode === "name") {
return recipes.slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}
if (mode === "suggested") {
const suggestedNames = new Set((this._suggestions || []).map((s) => (s.name || "").trim().toLowerCase()));
return recipes
.map((r, i) => ({ r, i, suggested: suggestedNames.has((r.name || "").trim().toLowerCase()) }))
.sort((a, b) => {
if (a.suggested !== b.suggested) return a.suggested ? -1 : 1;
return a.i - b.i;
})
.map((x) => x.r);
}
return recipes;
}
// Recipe Box grid/list view is a device-level preference (localStorage),
// same pattern as the calendar's own "show timeline" toggle - it isn't
// reset each time the modal reopens, unlike search/category/sort.
_getRecipeBoxViewMode() {
return window.localStorage.getItem("familyHubRecipeBoxView") === "list" ? "list" : "grid";
}
_setRecipeBoxViewMode(mode) {
window.localStorage.setItem("familyHubRecipeBoxView", mode === "list" ? "list" : "grid");
this._renderLoved();
}
_updateRecipeBoxViewButtons() {
const root = this._root;
if (!root) return;
const mode = this._getRecipeBoxViewMode();
root.querySelectorAll(".recipe-view-btn").forEach((btn) => {
btn.classList.toggle("active", btn.dataset.view === mode);
});
}
// Bulk-select delete (task: "a bulk edit feature to delete multiple
// recipes from the box") - browsing mode only; picker mode hides the
// Select button entirely (see _openLoved) since bulk-deleting isn't a
// task that belongs in the middle of picking tonight's meal.
_toggleRecipeBoxSelectMode(active) {
this._recipeBoxSelectMode = !!active;
if (!this._recipeBoxSelectMode) this._recipeBoxSelectedUids.clear();
this._renderLoved();
}
_toggleRecipeBoxSelected(uid) {
if (this._recipeBoxSelectedUids.has(uid)) {
this._recipeBoxSelectedUids.delete(uid);
} else {
this._recipeBoxSelectedUids.add(uid);
}
this._renderLoved();
}
_updateRecipeBoxSelectBar() {
const root = this._root;
if (!root) return;
const active = this._recipeBoxSelectMode && !this._pickerMode;
const bar = root.querySelector(".recipe-box-select-bar");
const actions = root.querySelector(".recipe-box-actions");
if (bar) bar.style.display = active ? "flex" : "none";
if (actions) actions.style.display = active ? "none" : "";
const countEl = root.querySelector(".recipe-box-select-count");
if (countEl) {
const n = this._recipeBoxSelectedUids.size;
countEl.textContent = `${n} selected`;
}
}
// Deletes every checked recipe - each one via the same _deleteDish path
// as a single delete (cascading to Grocy for anything imported from
// there - see _deleteDish's own comment), one at a time rather than in
// parallel so a slow/offline Grocy doesn't fire a burst of simultaneous
// delete requests at it.
async _deleteSelectedRecipeBoxItems() {
const uids = Array.from(this._recipeBoxSelectedUids);
if (!uids.length) return;
const recipesToDelete = uids.map((uid) => this._recipes.find((r) => r.uid === uid)).filter(Boolean);
if (!recipesToDelete.length) return;
const hasGrocy = recipesToDelete.some((r) => r.grocyRecipeId);
const label = recipesToDelete.length === 1 ? `"${recipesToDelete[0].name}"` : `these ${recipesToDelete.length} recipes`;
const grocyNote = hasGrocy ? " This will also delete the linked recipe(s) from Grocy." : "";
if (!window.confirm(`Delete ${label} from the Recipe Box?${grocyNote}`)) return;
for (const recipe of recipesToDelete) {
await this._deleteDish(recipe.uid, recipe.grocyRecipeId);
}
this._recipeBoxSelectMode = false;
this._recipeBoxSelectedUids.clear();
this._renderLoved();
}
// Recipe Box cards for a Grocy-imported dish (grocyRecipeId set) show a
// blank placeholder tile until this runs, because the recipe_box todo
// item itself only ever stores a manually-entered Photo URL - it never
// carries Grocy's own recipe photo, which lives entirely in Grocy's file
// storage and is otherwise only ever fetched one-at-a-time, on demand,
// when opening a single recipe's Viewer (see get_grocy_recipe_detail).
// Called every time the grid renders, but only actually fetches for
// recipes not already in _grocyImageCache (a cached `null` - "checked,
// Grocy has none" - counts as done, so a photo-less import isn't
// re-requested on every keystroke of a search or every heart tap).
// Fire-and-forget from _renderLoved: doesn't block the initial grid
// paint on Grocy answering, and only re-renders once if it actually has
// new photos to show.
async _hydrateGrocyRecipeImages() {
if (!this._hass) return;
// _fetchRecipes() replaces this._recipes wholesale from the Store on
// every load, reconnect, AND the 60s poll (see _refreshAllData) - and
// the Store itself never persists a Grocy-fetched photo (see
// _persistRecipes) - so a recipe whose photo was already resolved into
// _grocyImageCache on an earlier call shows up here again with a fresh
// object and image: null. Re-apply anything already cached BEFORE
// deciding what still needs a network fetch, or a photo that loaded
// fine once quietly disappears again at the very next poll (this was
// the actual bug behind "recipe box still isn't pulling images from
// Grocy" - it briefly worked, then reverted).
let reapplied = false;
(this._recipes || []).forEach((r) => {
if (r.grocyRecipeId && !r.image && this._grocyImageCache[r.grocyRecipeId]) {
r.image = this._grocyImageCache[r.grocyRecipeId];
reapplied = true;
}
});
const targets = (this._recipes || []).filter(
(r) =>
r.grocyRecipeId &&
!r.image &&
!(r.grocyRecipeId in this._grocyImageCache) &&
!this._grocyImageFetching.has(r.grocyRecipeId)
);
if (!targets.length) {
if (
reapplied &&
this._root &&
this._root.querySelector(".loved-overlay") &&
this._root.querySelector(".loved-overlay").classList.contains("open") &&
!this._pickerMode
) {
this._renderLoved();
}
return;
}
targets.forEach((r) => this._grocyImageFetching.add(r.grocyRecipeId));
const results = await Promise.all(
targets.map(async (r) => {
let image = null;
try {
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/get_grocy_recipe_detail",
recipe_id: r.grocyRecipeId,
});
image = (result && result.recipe && result.recipe.image) || null;
} catch (e) {
image = null;
} finally {
this._grocyImageFetching.delete(r.grocyRecipeId);
}
return { id: r.grocyRecipeId, image };
})
);
let changed = false;
results.forEach(({ id, image }) => {
this._grocyImageCache[id] = image;
if (image) changed = true;
});
if (!changed && !reapplied) return;
(this._recipes || []).forEach((r) => {
if (r.grocyRecipeId && !r.image && this._grocyImageCache[r.grocyRecipeId]) {
r.image = this._grocyImageCache[r.grocyRecipeId];
}
});
// Guard against re-entering the picker's plain list or a since-closed
// modal - a slow Grocy response could land well after the Recipe Box
// itself moved on.
if (
this._root &&
this._root.querySelector(".loved-overlay") &&
this._root.querySelector(".loved-overlay").classList.contains("open") &&
!this._pickerMode
) {
this._renderLoved();
}
}
// Flips a Recipe Box card's loved state without opening the full editor -
// the corner heart is meant to be a one-tap action while scrolling the
// grid, matching the same heart/rating concept used everywhere else in
// the app (the menu editor's own heart button, the dish detail screen).
// Passing category/image as undefined (not touched here at all) means
// _upsertDish preserves whatever the dish already had.
_toggleDishLoved(recipe) {
const newRating = recipe.rating === "up" ? null : "up";
this._upsertDish(recipe.name, recipe.description, recipe.link, newRating, recipe.uid, recipe.grocyRecipeId);
}
// Adds a Recipe Box dish straight to Meal Suggestions - the "click the
// suggest meal ... from this modal" half of the Recipe Box request,
// available both as a quick icon right on each card and as a full button
// on the dish detail screen (see _openDishDetail) for anyone who opened
// a dish first to double check it before suggesting it.
async _suggestDish(recipe) {
const name = (recipe.name || "").trim().toLowerCase();
const existing = (this._suggestions || []).find((s) => (s.name || "").trim().toLowerCase() === name);
if (existing) {
await this._removeSuggestion(existing.uid);
} else {
await this._addSuggestion(recipe.name, recipe.description, recipe.link, recipe.grocyRecipeId);
}
// _addSuggestion/_removeSuggestion (Store-backed - see _fetchSuggestions)
// update this._suggestions in memory before persisting, so it's already
// current here - no extra re-fetch needed before re-rendering the
// suggest icon's highlighted state.
this._renderLoved();
}
// Builds the "All / Loved / <each category in use>" filter chip row
// above the Recipe Box grid - purely derived from whatever categories
// already exist on saved recipes (see _populateDishCategoryOptions for
// the same idea applied to the editor's own datalist), so a household
// inventing "Slow cooker" or "Kid-approved" sees it show up here too
// without any setup step.
_renderRecipeBoxCategoryChips() {
const root = this._root;
if (!root) return;
const container = root.querySelector(".recipe-box-categories");
if (!container) return;
const categories = Array.from(
new Set((this._recipes || []).map((r) => (r.category || "").trim()).filter(Boolean))
).sort((a, b) => a.localeCompare(b));
const chips = ["All", "❤️ Loved", "💡 Suggested", ...categories];
if (!this._recipeBoxCategory || !chips.includes(this._recipeBoxCategory)) {
this._recipeBoxCategory = "All";
}
container.innerHTML = chips
.map(
(c) =>
`<button type="button" class="recipe-chip ${c === this._recipeBoxCategory ? "active" : ""}" data-category="${c.replace(/"/g, "&quot;")}">${c}</button>`
)
.join("");
container.querySelectorAll(".recipe-chip").forEach((el) => {
el.addEventListener("click", () => {
this._recipeBoxCategory = el.dataset.category;
this._renderLoved();
});
});
}
_openDishDetail(recipe) {
const root = this._root;
this._dishDetailRecipe = recipe;
root.querySelector(".dish-detail-title").textContent = recipe.name || "(untitled)";
const photo = root.querySelector(".dish-detail-photo");
if (photo) {
if (recipe.image) {
photo.src = recipe.image;
photo.style.display = "block";
} else {
photo.src = "";
photo.style.display = "none";
}
}
const ratingHtml =
(recipe.rating === "up"
? `<span class="event-info-chip" style="background:#f2ddd4">&#10084;&#65039; Loved</span>`
: recipe.rating === "down"
? `<span class="event-info-chip" style="background:#d8e3e0">&#128078; Not a fan</span>`
: "") + (recipe.category ? `<span class="event-info-chip">${recipe.category}</span>` : "");
root.querySelector(".dish-detail-rating").innerHTML = ratingHtml;
root.querySelector(".dish-detail-desc").textContent = recipe.description || "No notes added.";
const suggestBtn = root.querySelector(".dish-detail-suggest-btn");
if (suggestBtn) {
suggestBtn.textContent = "\u{1F4A1} Suggest this";
suggestBtn.onclick = () => {
this._suggestDish(recipe);
suggestBtn.textContent = "\u{2705} Added to Suggestions";
setTimeout(() => {
suggestBtn.textContent = "\u{1F4A1} Suggest this";
}, 1600);
};
}
const linkRow = root.querySelector(".dish-detail-link-row");
if (recipe.link) {
const label = recipe.grocyRecipeId ? "&#128279; View recipe" : "&#128279; Open recipe link";
linkRow.innerHTML = `<button type="button" class="pick-loved-btn dish-detail-open-link">${label}</button>`;
linkRow.querySelector(".dish-detail-open-link").addEventListener("click", () => {
if (recipe.grocyRecipeId) {
this._openGrocyRecipeViewer(recipe.grocyRecipeId, recipe.name, recipe.link);
} else {
window.open(recipe.link, "_blank", "noopener");
}
});
} else {
linkRow.innerHTML = "";
}
this._openModal(root.querySelector(".dish-detail-overlay"));
}
_closeDishDetail() {
this._root.querySelector(".dish-detail-overlay").classList.remove("open");
}
// Opened only from the Recipe Box's own "Add from Grocy" button now -
// see _selectGrocyRecipe's own comment for how the picker used to serve
// two other callers (the day/dish editor directly, and the Suggestions
// box) that have both since been folded into the Recipe Box instead.
_openGrocyPicker() {
this._grocySearchTerm = "";
this._root.querySelector(".grocy-picker-search").value = "";
this._root.querySelector(".grocy-picker-title").textContent = "\u{1F958} Add from Grocy";
this._openModal(this._root.querySelector(".grocy-picker-overlay"));
this._fetchGrocyRecipes();
}
_closeGrocyPicker() {
this._root.querySelector(".grocy-picker-overlay").classList.remove("open");
}
// Only ever touches recipes that came in from Grocy in the first place
// (grocyRecipeId set on a meal via "Add from Grocy" or a Loved Dish
// imported the same way) - a hand-typed meal has no ingredient data
// anywhere for this to work from, so it's silently skipped rather than
// erroring. Follows the same "always show the entry point, explain
// what's missing inside" pattern as the "Add from Grocy" button itself
// (grocy-import-btn) rather than trying to pre-fetch Grocy's configured
// status just to decide whether to show this button at all.
_toggleMoreMenu() {
const dropdown = this._root.querySelector(".more-menu-dropdown");
if (dropdown.classList.contains("open")) {
this._closeMoreMenu();
} else {
// Unlike every other More-menu entry point (Shopping List, Grocery
// List, etc. - which follow the "always show the button, explain
// what's missing inside" pattern), Expiring Soon is opt-in and off by
// default, so it's hidden from the menu entirely until the person
// turns it on in Settings, rather than being visible-but-empty.
const expiringBtn = this._root.querySelector(".grocy-expiring-btn");
if (expiringBtn) {
expiringBtn.style.display = this._getSettings().grocyExpiringEnabled ? "" : "none";
}
// Same reasoning as Expiring Soon just above - Low Stock is its own
// separate opt-in (a household might want one without the other), so
// it's gated on its own setting rather than piggybacking on
// grocyExpiringEnabled.
const lowStockBtn = this._root.querySelector(".grocy-low-stock-btn");
if (lowStockBtn) {
lowStockBtn.style.display = this._getSettings().grocyLowStockEnabled ? "" : "none";
}
dropdown.classList.add("open");
this._root.querySelector(".more-menu-btn").classList.add("active");
this._root.querySelector(".more-menu-btn").setAttribute("aria-expanded", "true");
}
}
_closeMoreMenu() {
const dropdown = this._root.querySelector(".more-menu-dropdown");
if (!dropdown) return;
dropdown.classList.remove("open");
this._root.querySelector(".more-menu-btn").classList.remove("active");
this._root.querySelector(".more-menu-btn").setAttribute("aria-expanded", "false");
}
_closeAddMenu() {
const overlay = this._root.querySelector(".add-menu-overlay");
if (overlay) overlay.classList.remove("open");
}
_toggleWeekShortcuts() {
const shortcuts = this._root.querySelector(".week-shortcuts");
if (!shortcuts) return;
if (shortcuts.classList.contains("open")) {
this._closeWeekShortcuts();
} else {
shortcuts.classList.add("open");
const toggle = this._root.querySelector(".week-shortcuts-toggle");
if (toggle) {
toggle.classList.add("open");
toggle.setAttribute("aria-expanded", "true");
}
}
}
_closeWeekShortcuts() {
const shortcuts = this._root.querySelector(".week-shortcuts");
if (!shortcuts) return;
shortcuts.classList.remove("open");
const toggle = this._root.querySelector(".week-shortcuts-toggle");
if (toggle) {
toggle.classList.remove("open");
toggle.setAttribute("aria-expanded", "false");
}
}
// Recipes planned more than once this week (e.g. tacos on Monday AND
// Thursday) are still grouped into a single row/single push - Grocy's
// add-not-fulfilled-products endpoint works off the recipe's own defined
// ingredient amounts, not a per-planned-day multiplier, so calling it
// twice for the same recipe wouldn't double the shopping list amount
// anyway (see the backend's _ws_push_grocery_list docstring). The day
// list on each row makes that plain instead of silently implying a 2x
// order that never happens.
_groupWeekGrocyRecipes() {
const blocks = this._currentWeekMealBlocks().filter((b) => b.grocyRecipeId);
const byId = new Map();
blocks.forEach((b) => {
if (!byId.has(b.grocyRecipeId)) byId.set(b.grocyRecipeId, { recipeId: b.grocyRecipeId, name: b.name, dates: [], servings: null });
const entry = byId.get(b.grocyRecipeId);
entry.dates.push(b.date);
// If the same recipe is planned more than once with different Servings
// values set, there's no single right answer for one shopping-list
// push - take the largest so the list errs toward having enough
// rather than running short (see _ws_push_grocery_list for why this
// has to be one value per recipe, not per planned day).
if (typeof b.servings === "number" && (entry.servings === null || b.servings > entry.servings)) {
entry.servings = b.servings;
}
});
return Array.from(byId.values());
}
_dayLabelForDates(dates) {
const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
return dates
.map((d) => {
const parts = d.split("-").map((n) => parseInt(n, 10));
return names[new Date(parts[0], parts[1] - 1, parts[2]).getDay()];
})
.join(", ");
}
async _renderGroceryList() {
const meals = this._groupWeekGrocyRecipes();
const mealsEl = this._root.querySelector(".grocery-list-meals");
const statusEl = this._root.querySelector(".grocery-list-status");
const pushBtn = this._root.querySelector(".grocery-list-push-btn");
statusEl.textContent = "";
statusEl.classList.remove("is-error");
if (!meals.length) {
mealsEl.innerHTML = "";
statusEl.textContent = "No Grocy-imported recipes are planned for this week yet - pick a suggestion or loved dish that came from Grocy (look for the \u{1F955} icon) to build a shopping list.";
pushBtn.style.display = "none";
return;
}
pushBtn.style.display = "";
this._groceryListWeekStart = this._dateKey(this._weekStart());
let pushedIds = new Set();
if (this._hass) {
try {
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/get_grocery_list_status",
week_start: this._groceryListWeekStart,
recipe_ids: meals.map((m) => m.recipeId),
});
pushedIds = new Set(result.pushed_recipe_ids || []);
} catch (e) {
// If the status check fails, fall through with nothing marked as
// added yet - the push itself still works, it just won't default
// to skipping anything.
}
}
mealsEl.innerHTML = meals
.map((m) => {
const added = pushedIds.has(m.recipeId);
const daysLabel = `Planned ${this._dayLabelForDates(m.dates)}`;
const servingsLabel = typeof m.servings === "number" ? ` &middot; Servings: ${m.servings}` : "";
return `
<div class="grocery-list-meal-row" data-recipe-id="${m.recipeId}" data-servings="${typeof m.servings === "number" ? m.servings : ""}">
<input type="checkbox" class="grocery-list-meal-check" data-recipe-id="${m.recipeId}" ${added ? "" : "checked"}>
<div>
<div class="grocery-list-meal-name">${m.name}</div>
<div class="grocery-list-meal-days">${daysLabel}${m.dates.length > 1 ? " (added once for this recipe)" : ""}${servingsLabel}</div>
</div>
<span class="grocery-list-meal-badge ${added ? "is-added" : "is-pending"}">${added ? "Added" : "Not added yet"}</span>
</div>
`;
})
.join("");
}
async _pushCheckedGroceryItems() {
const statusEl = this._root.querySelector(".grocery-list-status");
const checks = Array.from(this._root.querySelectorAll(".grocery-list-meal-check:checked"));
const recipeIds = checks.map((c) => parseInt(c.dataset.recipeId, 10));
if (!recipeIds.length) {
statusEl.textContent = "Check at least one meal to add its ingredients to Grocy's shopping list.";
statusEl.classList.remove("is-error");
return;
}
const meals = this._groupWeekGrocyRecipes();
const nameById = new Map(meals.map((m) => [m.recipeId, m.name]));
// Only recipes with an explicit Servings value set on their planned meal
// get an override sent - everything else pushes using whatever Grocy's
// own desired_servings for that recipe already is (see
// _ws_push_grocery_list's docstring on why this is a real, persistent
// edit to the recipe in Grocy rather than a one-off push parameter).
const servingsOverrides = {};
meals.forEach((m) => {
if (typeof m.servings === "number") servingsOverrides[String(m.recipeId)] = m.servings;
});
statusEl.textContent = `Adding ingredients for ${recipeIds.length} recipe${recipeIds.length === 1 ? "" : "s"} to your Grocy shopping list…`;
statusEl.classList.remove("is-error");
if (!this._hass) return;
try {
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/push_grocery_list",
week_start: this._groceryListWeekStart || this._dateKey(this._weekStart()),
recipe_ids: recipeIds,
force: true,
servings_overrides: servingsOverrides,
});
if (result.configured === false) {
statusEl.textContent = "Grocy isn't connected yet - set it up under Settings > Devices & Services > Family Hub > Configure > Grocy.";
statusEl.classList.remove("is-error");
return;
}
const results = Array.isArray(result.results) ? result.results : [];
const succeeded = results.filter((r) => r.success);
const failed = results.filter((r) => !r.success);
const nameFor = (r) => nameById.get(r.recipe_id) || `#${r.recipe_id}`;
let text = succeeded.length
? `Added ingredients for ${succeeded.length} recipe${succeeded.length === 1 ? "" : "s"} to your Grocy shopping list: ${succeeded.map(nameFor).join(", ")}.`
: "";
if (failed.length) {
text += `${text ? " " : ""}Couldn't add ${failed.length}: ${failed.map((r) => `${nameFor(r)} (${r.error || "unknown error"})`).join(", ")}.`;
}
// Grocy adds recipe ingredients to the shopping list in their own cooking
// unit (e.g. "3 cup" of flour) - the backend follows up by rounding those
// specific rows up to whatever unit each product is actually purchased
// in (e.g. "1 lb"), when it can. Surfaced as a short trailing note rather
// than its own status line, since it's a nice-to-know polish detail, not
// the headline of what just happened.
if (result.unit_adjustments > 0) {
text += `${text ? " " : ""}Rounded ${result.unit_adjustments} item${result.unit_adjustments === 1 ? "" : "s"} up to whole purchase units (e.g. cups → pounds).`;
}
const isError = failed.length > 0 && succeeded.length === 0;
// _renderGroceryList clears the status line as part of rebuilding the
// meal rows - re-render FIRST, then set the final summary text, or this
// message would get wiped out by that clear immediately after.
await this._renderGroceryList();
statusEl.textContent = text || "Nothing was added.";
statusEl.classList.toggle("is-error", isError);
} catch (e) {
statusEl.textContent = "Couldn't reach Grocy.";
statusEl.classList.add("is-error");
}
}
// In-card viewer/editor for Grocy's own shopping list (the same list
// _pushCheckedGroceryItems above adds recipe ingredients to) - lets
// someone see what's on it and add/check off/remove arbitrary items
// without needing to log into Grocy's own separate website. This modal
// now also holds the "This Week's Meals" tab (formerly its own standalone
// "Grocery List" modal/More-menu button) - the two are really one errand
// (plan the ingredients, then shop and put them away), so opening either
// way lands here and both tabs' data are loaded up front.
_openGrocyShoppingList() {
this._openModal(this._root.querySelector(".grocy-shopping-list-overlay"));
this._root.querySelector(".grocy-shopping-list-add-input").value = "";
this._root.querySelector(".grocy-shopping-list-add-amount").value = "1";
if (this._grocyShoppingListId == null) {
// Device-specific, same convention as the timeline toggle - which
// list someone was last looking at on THIS tablet/browser, not
// synced across the household's devices.
let saved = null;
try {
saved = window.localStorage.getItem("familyHubGrocyShoppingListId");
} catch (e) {
}
this._grocyShoppingListId = saved ? parseInt(saved, 10) || 1 : 1;
}
// Which of the two tabs to land on is also device-specific - whichever
// this tablet/browser was last looking at, defaulting to the live Grocy
// list itself (the more frequent of the two errands) the very first time.
if (this._shoppingListActiveTab === undefined) {
let savedTab = null;
try {
savedTab = window.localStorage.getItem("familyHubShoppingListTab");
} catch (e) {
}
this._shoppingListActiveTab = savedTab === "meals" ? "meals" : "list";
}
this._switchShoppingListTab(this._shoppingListActiveTab);
this._populateGrocyShoppingListPicker();
this._renderGrocyShoppingList();
this._renderGroceryList();
}
_closeGrocyShoppingList() {
this._root.querySelector(".grocy-shopping-list-overlay").classList.remove("open");
}
_switchShoppingListTab(tab) {
this._shoppingListActiveTab = tab === "meals" ? "meals" : "list";
try {
window.localStorage.setItem("familyHubShoppingListTab", this._shoppingListActiveTab);
} catch (e) {
}
this._root.querySelectorAll(".shopping-tab-btn").forEach((btn) => {
btn.classList.toggle("active", btn.dataset.shoppingTab === this._shoppingListActiveTab);
});
this._root.querySelectorAll(".shopping-tab-panel").forEach((panel) => {
panel.style.display = panel.dataset.shoppingTabPanel === this._shoppingListActiveTab ? "" : "none";
});
}
// Populates the list-switcher dropdown once per session (Grocy's set of
// shopping lists rarely changes mid-session) - hidden entirely when
// there's only the one default list, so most households never see an
// extra control they have no use for.
async _populateGrocyShoppingListPicker() {
const row = this._root.querySelector(".grocy-shopping-list-picker-row");
if (!this._hass || this._grocyShoppingListsCache) {
if (this._grocyShoppingListsCache) this._renderGrocyShoppingListPicker(this._grocyShoppingListsCache);
return;
}
try {
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/get_grocy_shopping_lists",
});
if (result.configured === false) {
row.style.display = "none";
return;
}
const lists = Array.isArray(result.lists) ? result.lists : [];
this._grocyShoppingListsCache = lists;
this._renderGrocyShoppingListPicker(lists);
} catch (e) {
row.style.display = "none";
}
}
// The dropdown itself only shows once there are 2+ lists (a single-list
// household has no use for a switcher) - but the "+ New List" button next
// to it is shown any time Grocy is reachable at all, since creating a
// second list is exactly how a household would go from 1 list to 2.
_renderGrocyShoppingListPicker(lists) {
const row = this._root.querySelector(".grocy-shopping-list-picker-row");
const picker = this._root.querySelector(".grocy-shopping-list-picker");
if (lists.length < 2) {
picker.style.display = "none";
} else {
picker.innerHTML = lists.map((lst) => `<option value="${lst.id}">${lst.name}</option>`).join("");
picker.value = String(this._grocyShoppingListId || 1);
picker.style.display = "";
}
row.style.display = "flex";
}
// Grocy has no dedicated "create shopping list" endpoint beyond the
// generic object-create API (POST /api/objects/shopping_lists) - same
// window.prompt pattern already used for naming a whole-week meal
// template, since a full custom modal for "type one name" would be
// overkill. Switches straight to the new list once created, same as
// picking it from the dropdown would.
async _createGrocyShoppingList() {
if (!this._hass) return;
const name = window.prompt('Name the new shopping list (e.g. "Costco"):', "");
if (!name || !name.trim()) return;
const statusEl = this._root.querySelector(".grocy-shopping-list-status");
statusEl.textContent = "Creating…";
statusEl.classList.remove("is-error");
try {
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/create_grocy_shopping_list",
name: name.trim(),
});
if (result.configured === false) {
statusEl.textContent = "Grocy isn't connected yet - set it up under Settings > Devices & Services > Family Hub > Configure > Grocy.";
statusEl.classList.add("is-error");
return;
}
if (!result.success || !result.list) {
statusEl.textContent = `Couldn't create the list: ${result.error || "unknown error"}`;
statusEl.classList.add("is-error");
return;
}
this._grocyShoppingListsCache = [...(this._grocyShoppingListsCache || []), result.list];
this._grocyShoppingListId = result.list.id;
try {
window.localStorage.setItem("familyHubGrocyShoppingListId", String(this._grocyShoppingListId));
} catch (err) {
}
this._renderGrocyShoppingListPicker(this._grocyShoppingListsCache);
statusEl.textContent = "";
await this._renderGrocyShoppingList();
} catch (e) {
statusEl.textContent = "Couldn't reach Grocy.";
statusEl.classList.add("is-error");
}
}
async _renderGrocyShoppingList() {
const itemsEl = this._root.querySelector(".grocy-shopping-list-items");
const statusEl = this._root.querySelector(".grocy-shopping-list-status");
const totalEl = this._root.querySelector(".grocy-shopping-list-total");
statusEl.classList.remove("is-error");
totalEl.style.display = "none";
if (!this._hass) return;
statusEl.textContent = "Loading…";
itemsEl.innerHTML = "";
try {
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/get_grocy_shopping_list",
list_id: this._grocyShoppingListId || 1,
});
if (result.configured === false) {
statusEl.textContent = "Grocy isn't connected yet - set it up under Settings > Devices & Services > Family Hub > Configure > Grocy.";
return;
}
if (result.error) {
statusEl.textContent = `Couldn't load the shopping list: ${result.error}`;
statusEl.classList.add("is-error");
return;
}
const items = Array.isArray(result.items) ? result.items : [];
this._grocyShoppingListItems = items;
if (result.estimated_total != null) {
totalEl.textContent = `Estimated total: ${result.estimated_total}`;
totalEl.style.display = "";
}
if (!items.length) {
statusEl.textContent = "Grocy's shopping list is empty.";
return;
}
statusEl.textContent = "";
itemsEl.innerHTML = items
.map((item) => {
const amountLabel = item.amount_display ? item.amount_display : "";
const noteLabel = item.note && item.product_id ? ` &middot; ${item.note}` : "";
const priceLabel = item.estimated_price != null ? ` &middot; ~${item.estimated_price}` : "";
// Only a product-based row can be "put away" into Grocy stock - a
// freetext row (no product_id) has nothing in Grocy to attach stock
// to, so it gets no Scan button or panel at all.
const putawayBtn = item.product_id
? `<button type="button" class="grocy-shopping-list-item-putaway" title="Put away (scan)">&#128230;</button>`
: "";
const putawayPanel = item.product_id
? `
<div class="grocy-shopping-list-putaway-panel" data-item-id="${item.id}" style="display:none;">
<div class="grocy-shopping-list-putaway-row">
<label>Location</label>
<select class="grocy-shopping-list-putaway-location"><option value="">Loading…</option></select>
</div>
<div class="grocy-shopping-list-putaway-row">
<label>Expires</label>
<input type="date" class="grocy-shopping-list-putaway-date" />
</div>
<div class="grocy-shopping-list-putaway-row">
<label>Price</label>
<input type="number" class="grocy-shopping-list-putaway-price" min="0" step="0.01" placeholder="Optional" />
</div>
<div class="grocy-shopping-list-putaway-actions">
<button type="button" class="grocy-shopping-list-putaway-cancel">Cancel</button>
<button type="button" class="grocy-shopping-list-putaway-confirm">Put Away</button>
</div>
</div>
`
: "";
// Only worth offering when a second list actually exists to move
// something to - most households never enable a second list at all
// (see _renderGrocyShoppingListPicker), so this stays quiet for them
// instead of showing a "Move" button with nowhere to move to.
const hasOtherLists = (this._grocyShoppingListsCache || []).length > 1;
const moveBtn = hasOtherLists
? `<button type="button" class="grocy-shopping-list-item-move" title="Move to another list">&#10132;</button>`
: "";
const movePanel = hasOtherLists
? `
<div class="grocy-shopping-list-putaway-panel grocy-shopping-list-move-panel" data-item-id="${item.id}" style="display:none;">
<div class="grocy-shopping-list-putaway-row">
<label>Move to</label>
<select class="grocy-shopping-list-move-target"></select>
</div>
<div class="grocy-shopping-list-putaway-actions">
<button type="button" class="grocy-shopping-list-putaway-cancel grocy-shopping-list-move-cancel">Cancel</button>
<button type="button" class="grocy-shopping-list-putaway-confirm grocy-shopping-list-move-confirm">Move</button>
</div>
</div>
`
: "";
return `
<div class="grocy-shopping-list-item-row ${item.done ? "is-done" : ""}" data-item-id="${item.id}">
<input type="checkbox" class="grocy-shopping-list-item-check" ${item.done ? "checked" : ""}>
<div class="grocy-shopping-list-item-info">
<div class="grocy-shopping-list-item-name">${item.name}</div>
${amountLabel || noteLabel || priceLabel ? `<div class="grocy-shopping-list-item-amount">${amountLabel}${noteLabel}${priceLabel}</div>` : ""}
</div>
${putawayBtn}
${moveBtn}
<button type="button" class="grocy-shopping-list-item-remove" title="Remove">&#10005;</button>
</div>
${putawayPanel}
${movePanel}
`;
})
.join("");
itemsEl.querySelectorAll(".grocy-shopping-list-item-row").forEach((row) => {
const itemId = parseInt(row.dataset.itemId, 10);
row.querySelector(".grocy-shopping-list-item-check").addEventListener("change", (e) => {
this._toggleGrocyShoppingListItem(itemId, e.target.checked);
});
row.querySelector(".grocy-shopping-list-item-remove").addEventListener("click", () => {
this._removeGrocyShoppingListItem(itemId);
});
const putawayBtnEl = row.querySelector(".grocy-shopping-list-item-putaway");
if (putawayBtnEl) {
putawayBtnEl.addEventListener("click", () => this._toggleGrocyPutAwayPanel(itemId));
}
const moveBtnEl = row.querySelector(".grocy-shopping-list-item-move");
if (moveBtnEl) {
moveBtnEl.addEventListener("click", () => this._toggleGrocyMovePanel(itemId));
}
});
itemsEl.querySelectorAll(".grocy-shopping-list-putaway-panel:not(.grocy-shopping-list-move-panel)").forEach((panel) => {
const itemId = parseInt(panel.dataset.itemId, 10);
panel.querySelector(".grocy-shopping-list-putaway-cancel").addEventListener("click", () => {
panel.style.display = "none";
});
panel.querySelector(".grocy-shopping-list-putaway-confirm").addEventListener("click", () => {
this._confirmGrocyPutAway(itemId, panel);
});
});
itemsEl.querySelectorAll(".grocy-shopping-list-move-panel").forEach((panel) => {
const itemId = parseInt(panel.dataset.itemId, 10);
panel.querySelector(".grocy-shopping-list-move-cancel").addEventListener("click", () => {
panel.style.display = "none";
});
panel.querySelector(".grocy-shopping-list-move-confirm").addEventListener("click", () => {
this._confirmGrocyMoveItem(itemId, panel);
});
});
} catch (e) {
statusEl.textContent = "Couldn't reach Grocy.";
statusEl.classList.add("is-error");
}
}
// Toggles the inline "Put Away" panel under a shopping-list row (the
// "scan" step - choose where it's going and how long it's good for
// before it's added into Grocy stock). Locations are fetched once per
// card session (_fetchGrocyLocations caches them) rather than on every
// open, and each panel only pre-populates itself the first time it's
// opened (panel.dataset.loaded guard) - re-opening after cancelling
// shouldn't stomp on anything the person already picked.
async _toggleGrocyPutAwayPanel(itemId) {
const panel = this._root.querySelector(`.grocy-shopping-list-putaway-panel[data-item-id="${itemId}"]`);
if (!panel) return;
if (panel.style.display !== "none") {
panel.style.display = "none";
return;
}
panel.style.display = "flex";
if (panel.dataset.loaded) return;
panel.dataset.loaded = "1";
const item = (this._grocyShoppingListItems || []).find((it) => it.id === itemId);
if (item && Number(item.default_best_before_days) > 0) {
const dateInput = panel.querySelector(".grocy-shopping-list-putaway-date");
const d = new Date();
d.setDate(d.getDate() + Number(item.default_best_before_days));
dateInput.value = d.toISOString().slice(0, 10);
}
const locationSelect = panel.querySelector(".grocy-shopping-list-putaway-location");
const locations = await this._fetchGrocyLocations();
const defaultId = item && item.default_location_id != null && locations.some((loc) => loc.id === item.default_location_id)
? item.default_location_id
: null;
this._renderGrocyPutAwayLocationOptions(locationSelect, defaultId);
if (!locationSelect.dataset.newLocationWired) {
locationSelect.dataset.newLocationWired = "1";
locationSelect.addEventListener("change", () => {
if (locationSelect.value === "__new__") this._createGrocyLocationForPutAway(locationSelect);
});
}
}
// Shared by the initial panel-open fill and by _createGrocyLocationForPutAway
// after adding a location - always appends "+ Add new location…" so the
// household can create their very first Grocy location right from here,
// same as being able to create a second/third one later.
_renderGrocyPutAwayLocationOptions(selectEl, selectedId) {
const locations = this._grocyLocationsCache || [];
const baseOptions = locations.length
? locations.map((loc) => `<option value="${loc.id}"${selectedId === loc.id ? " selected" : ""}>${loc.name}</option>`).join("")
: `<option value="">No locations yet</option>`;
selectEl.innerHTML = baseOptions + `<option value="__new__">+ Add new location…</option>`;
if (selectedId != null) selectEl.value = String(selectedId);
}
// Grocy has no dedicated "create location" endpoint beyond the generic
// object-create API (POST /api/objects/locations) - same window.prompt
// pattern as _createGrocyShoppingList. Falls back to re-selecting the
// first real option (not "__new__") if the person cancels the prompt, so
// the select never gets stuck showing "+ Add new location…" as its value.
async _createGrocyLocationForPutAway(selectEl) {
const name = window.prompt('Name the new Grocy location (e.g. "Garage Freezer"):', "");
if (!name || !name.trim()) {
if (selectEl.options.length > 1) selectEl.selectedIndex = 0;
return;
}
const statusEl = this._root.querySelector(".grocy-shopping-list-status");
try {
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/create_grocy_location",
name: name.trim(),
});
if (!result.success || !result.location) {
statusEl.textContent = `Couldn't create the location: ${result.error || "unknown error"}`;
statusEl.classList.add("is-error");
if (selectEl.options.length > 1) selectEl.selectedIndex = 0;
return;
}
this._grocyLocationsCache = [...(this._grocyLocationsCache || []), result.location];
this._renderGrocyPutAwayLocationOptions(selectEl, result.location.id);
} catch (e) {
statusEl.textContent = "Couldn't reach Grocy.";
statusEl.classList.add("is-error");
if (selectEl.options.length > 1) selectEl.selectedIndex = 0;
}
}
// Cached for the card's session - the location list rarely changes, and
// every put-away panel opening would otherwise re-fetch it from Grocy.
async _fetchGrocyLocations() {
if (this._grocyLocationsCache) return this._grocyLocationsCache;
if (!this._hass) return [];
try {
const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_grocy_locations" });
const locations = Array.isArray(result.locations) ? result.locations : [];
this._grocyLocationsCache = locations;
return locations;
} catch (e) {
return [];
}
}
async _confirmGrocyPutAway(itemId, panel) {
if (!this._hass) return;
const statusEl = this._root.querySelector(".grocy-shopping-list-status");
const item = (this._grocyShoppingListItems || []).find((it) => it.id === itemId);
if (!item || !item.product_id) return;
const locationSelect = panel.querySelector(".grocy-shopping-list-putaway-location");
const dateInput = panel.querySelector(".grocy-shopping-list-putaway-date");
const priceInput = panel.querySelector(".grocy-shopping-list-putaway-price");
const locationId = parseInt(locationSelect.value, 10);
if (!locationId) {
statusEl.textContent = "Pick a location before putting this away.";
statusEl.classList.add("is-error");
return;
}
// Price is optional - Grocy's own barcode-scan-to-purchase flow (the same
// endpoint this hits) treats it the same way, just recording last-known
// purchase price for future cost estimates rather than requiring one.
const priceRaw = priceInput ? priceInput.value.trim() : "";
const price = priceRaw ? parseFloat(priceRaw) : undefined;
statusEl.textContent = "Putting away…";
statusEl.classList.remove("is-error");
try {
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/put_away_grocy_shopping_list_item",
item_id: itemId,
product_id: item.product_id,
amount: item.amount || 1,
location_id: locationId,
best_before_date: dateInput.value || undefined,
price: price != null && !Number.isNaN(price) ? price : undefined,
list_id: this._grocyShoppingListId || 1,
});
if (result.configured === false) {
statusEl.textContent = "Grocy isn't connected yet - set it up under Settings > Devices & Services > Family Hub > Configure > Grocy.";
return;
}
if (!result.success) {
statusEl.textContent = `Couldn't put that away: ${result.error || "unknown error"}`;
statusEl.classList.add("is-error");
return;
}
statusEl.textContent = `Put away ${item.name}.`;
await this._renderGrocyShoppingList();
} catch (e) {
statusEl.textContent = "Couldn't reach Grocy.";
statusEl.classList.add("is-error");
}
}
// Toggles the inline "Move to" panel under a shopping-list row - mirrors
// _toggleGrocyPutAwayPanel's show/hide behavior, but the target-list
// select is cheap to rebuild every open (just the already-cached list of
// lists, minus whichever one is currently showing) rather than needing a
// "loaded" guard like the put-away panel's location fetch.
_toggleGrocyMovePanel(itemId) {
const panel = this._root.querySelector(`.grocy-shopping-list-move-panel[data-item-id="${itemId}"]`);
if (!panel) return;
if (panel.style.display !== "none") {
panel.style.display = "none";
return;
}
panel.style.display = "flex";
const select = panel.querySelector(".grocy-shopping-list-move-target");
const otherLists = (this._grocyShoppingListsCache || []).filter((lst) => lst.id !== (this._grocyShoppingListId || 1));
select.innerHTML = otherLists.map((lst) => `<option value="${lst.id}">${lst.name}</option>`).join("");
}
async _confirmGrocyMoveItem(itemId, panel) {
if (!this._hass) return;
const statusEl = this._root.querySelector(".grocy-shopping-list-status");
const select = panel.querySelector(".grocy-shopping-list-move-target");
const targetListId = parseInt(select.value, 10);
if (!targetListId) {
statusEl.textContent = "Pick a list to move this item to.";
statusEl.classList.add("is-error");
return;
}
statusEl.textContent = "Moving…";
statusEl.classList.remove("is-error");
try {
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/move_grocy_shopping_list_item",
item_id: itemId,
list_id: targetListId,
});
if (!result.success) {
statusEl.textContent = `Couldn't move that item: ${result.error || "unknown error"}`;
statusEl.classList.add("is-error");
return;
}
const targetList = (this._grocyShoppingListsCache || []).find((lst) => lst.id === targetListId);
statusEl.textContent = targetList ? `Moved to ${targetList.name}.` : "Moved.";
await this._renderGrocyShoppingList();
} catch (e) {
statusEl.textContent = "Couldn't reach Grocy.";
statusEl.classList.add("is-error");
}
}
async _addGrocyShoppingListItem() {
const input = this._root.querySelector(".grocy-shopping-list-add-input");
const amountInput = this._root.querySelector(".grocy-shopping-list-add-amount");
const statusEl = this._root.querySelector(".grocy-shopping-list-status");
const text = input.value.trim();
if (!text) return;
const amount = parseFloat(amountInput.value) || 1;
if (!this._hass) return;
statusEl.textContent = "Adding…";
statusEl.classList.remove("is-error");
try {
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/add_grocy_shopping_list_item",
text,
amount,
list_id: this._grocyShoppingListId || 1,
});
if (result.configured === false) {
statusEl.textContent = "Grocy isn't connected yet - set it up under Settings > Devices & Services > Family Hub > Configure > Grocy.";
return;
}
if (!result.success) {
statusEl.textContent = `Couldn't add "${text}": ${result.error || "unknown error"}`;
statusEl.classList.add("is-error");
return;
}
input.value = "";
amountInput.value = "1";
await this._renderGrocyShoppingList();
} catch (e) {
statusEl.textContent = "Couldn't reach Grocy.";
statusEl.classList.add("is-error");
}
}
async _toggleGrocyShoppingListItem(itemId, done) {
if (!this._hass) return;
const statusEl = this._root.querySelector(".grocy-shopping-list-status");
const row = this._root.querySelector(`.grocy-shopping-list-item-row[data-item-id="${itemId}"]`);
if (row) row.classList.toggle("is-done", done);
try {
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/toggle_grocy_shopping_list_item",
item_id: itemId,
done,
});
if (!result.success) {
statusEl.textContent = `Couldn't update that item: ${result.error || "unknown error"}`;
statusEl.classList.add("is-error");
if (row) row.classList.toggle("is-done", !done);
}
} catch (e) {
statusEl.textContent = "Couldn't reach Grocy.";
statusEl.classList.add("is-error");
if (row) row.classList.toggle("is-done", !done);
}
}
async _removeGrocyShoppingListItem(itemId) {
if (!this._hass) return;
const statusEl = this._root.querySelector(".grocy-shopping-list-status");
try {
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/remove_grocy_shopping_list_item",
item_id: itemId,
});
if (!result.success) {
statusEl.textContent = `Couldn't remove that item: ${result.error || "unknown error"}`;
statusEl.classList.add("is-error");
return;
}
await this._renderGrocyShoppingList();
} catch (e) {
statusEl.textContent = "Couldn't reach Grocy.";
statusEl.classList.add("is-error");
}
}
_openGrocyExpiringSoon() {
this._openModal(this._root.querySelector(".grocy-expiring-overlay"));
this._renderGrocyExpiringSoon();
}
_closeGrocyExpiringSoon() {
this._root.querySelector(".grocy-expiring-overlay").classList.remove("open");
}
// Opt-in feature (see CONF_GROCY_EXPIRING_ENABLED / settings.grocyExpiring
// Enabled) - the menu item is always there (same "always show the entry
// point, explain what's missing inside" pattern as the rest of the Grocy
// features in this card), so this is where "not configured" vs. "not
// turned on yet" vs. "here's the list" actually gets decided, all off one
// result shape from family_hub/get_grocy_expiring_soon.
async _renderGrocyExpiringSoon() {
const statusEl = this._root.querySelector(".grocy-expiring-status");
const sectionsEl = this._root.querySelector(".grocy-expiring-sections");
const list7 = this._root.querySelector(".grocy-expiring-items-7");
const list30 = this._root.querySelector(".grocy-expiring-items-30");
statusEl.classList.remove("is-error");
sectionsEl.style.display = "none";
if (!this._hass) return;
statusEl.textContent = "Loading…";
list7.innerHTML = "";
list30.innerHTML = "";
try {
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/get_grocy_expiring_soon",
});
if (result.configured === false) {
statusEl.textContent = "Grocy isn't connected yet - set it up under Settings > Devices & Services > Family Hub > Configure > Grocy.";
return;
}
if (!result.enabled) {
statusEl.textContent = "Turn on \"Track expiring items\" under Settings > Grocy: Expiring Soon to use this.";
return;
}
if (result.error) {
statusEl.textContent = `Couldn't load expiring items: ${result.error}`;
statusEl.classList.add("is-error");
return;
}
const items = Array.isArray(result.items) ? result.items : [];
if (!items.length) {
statusEl.textContent = "Nothing in Grocy stock is expiring within the next 30 days.";
return;
}
statusEl.textContent = "";
sectionsEl.style.display = "flex";
const within7 = items.filter((it) => it.days_until <= 7);
const within30 = items.filter((it) => it.days_until > 7);
// Recipe suggestions ("cook this before it goes bad") are attached by
// the backend per item (empty array when there's nothing to suggest, or
// on any backend-side lookup failure - see _ws_get_grocy_expiring_soon)
// - purely a nudge layered on top of the expiration info, so a missing
// list here just means no chips, never an error state of its own.
const renderItem = (item) => {
const when =
item.days_until < 0
? `${Math.abs(item.days_until)}d overdue`
: item.days_until === 0
? "Today"
: item.days_until === 1
? "Tomorrow"
: `${item.days_until} days`;
const recipes = Array.isArray(item.recipes) ? item.recipes : [];
const recipeChips = recipes.length
? `<div class="grocy-expiring-item-recipes">${recipes
.map(
(r) =>
`<button type="button" class="grocy-expiring-item-recipe-chip" data-recipe-id="${r.id}" data-recipe-name="${r.name}" data-recipe-link="${r.link}">&#127859; ${r.name}</button>`
)
.join("")}</div>`
: "";
return `
<div class="grocy-expiring-item-row">
<div class="grocy-expiring-item-name">${item.name}</div>
<div class="grocy-expiring-item-when ${item.days_until <= 7 ? "is-soon" : ""}">${when}</div>
${recipeChips}
</div>
`;
};
list7.innerHTML = within7.length
? within7.map(renderItem).join("")
: `<div class="grocy-expiring-empty">Nothing expiring this soon.</div>`;
list30.innerHTML = within30.length
? within30.map(renderItem).join("")
: `<div class="grocy-expiring-empty">Nothing else expiring this month.</div>`;
sectionsEl.querySelectorAll(".grocy-expiring-item-recipe-chip").forEach((chip) => {
chip.addEventListener("click", () => {
this._openGrocyRecipeViewer(chip.dataset.recipeId, chip.dataset.recipeName, chip.dataset.recipeLink, true);
});
});
} catch (e) {
statusEl.textContent = "Couldn't reach Grocy.";
statusEl.classList.add("is-error");
}
}
// Restock-focused mirror of the Expiring Soon list above - opt-in via
// settings.grocyLowStockEnabled (CONF_GROCY_LOW_STOCK_ENABLED on the
// backend), same "always show the entry point" pattern.
_openGrocyLowStock() {
this._openModal(this._root.querySelector(".grocy-low-stock-overlay"));
this._renderGrocyLowStock();
}
_closeGrocyLowStock() {
this._root.querySelector(".grocy-low-stock-overlay").classList.remove("open");
}
async _renderGrocyLowStock() {
const statusEl = this._root.querySelector(".grocy-low-stock-status");
const itemsEl = this._root.querySelector(".grocy-low-stock-items");
const addAllBtn = this._root.querySelector(".grocy-low-stock-add-all-btn");
statusEl.classList.remove("is-error");
addAllBtn.style.display = "none";
if (!this._hass) return;
statusEl.textContent = "Loading…";
itemsEl.innerHTML = "";
try {
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/get_grocy_low_stock",
});
if (result.configured === false) {
statusEl.textContent = "Grocy isn't connected yet - set it up under Settings > Devices & Services > Family Hub > Configure > Grocy.";
return;
}
if (!result.enabled) {
statusEl.textContent = "Turn on \"Track low stock\" under Settings > Grocy: Low Stock to use this.";
return;
}
if (result.error) {
statusEl.textContent = `Couldn't load low stock items: ${result.error}`;
statusEl.classList.add("is-error");
return;
}
const items = Array.isArray(result.items) ? result.items : [];
if (!items.length) {
statusEl.textContent = "Nothing in Grocy stock is currently below its minimum amount.";
return;
}
statusEl.textContent = "";
addAllBtn.style.display = "";
itemsEl.innerHTML = items
.map((item) => {
const need = item.min_stock_amount != null ? ` (min ${item.min_stock_amount})` : "";
return `
<div class="grocy-low-stock-item-row">
<div class="grocy-low-stock-item-name">${item.name}</div>
<div class="grocy-low-stock-item-missing">Short ${item.amount_missing}${need}</div>
</div>
`;
})
.join("");
} catch (e) {
statusEl.textContent = "Couldn't reach Grocy.";
statusEl.classList.add("is-error");
}
}
async _addMissingGrocyProductsToShoppingList() {
if (!this._hass) return;
const statusEl = this._root.querySelector(".grocy-low-stock-status");
statusEl.textContent = "Adding to shopping list…";
statusEl.classList.remove("is-error");
try {
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/add_missing_grocy_products_to_shopping_list",
list_id: this._grocyShoppingListId || 1,
});
if (result.configured === false) {
statusEl.textContent = "Grocy isn't connected yet - set it up under Settings > Devices & Services > Family Hub > Configure > Grocy.";
return;
}
if (!result.success) {
statusEl.textContent = `Couldn't add those to the shopping list: ${result.error || "unknown error"}`;
statusEl.classList.add("is-error");
return;
}
statusEl.textContent = "Added to the shopping list.";
await this._renderGrocyLowStock();
} catch (e) {
statusEl.textContent = "Couldn't reach Grocy.";
statusEl.classList.add("is-error");
}
}
async _fetchGrocyRecipes() {
if (!this._hass) return;
this._grocyStatus = { loading: true, configured: null, error: "" };
this._renderGrocyPicker();
try {
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/get_grocy_recipes",
});
this._grocyRecipes = Array.isArray(result.recipes) ? result.recipes : [];
this._grocyStatus = {
loading: false,
configured: !!result.configured,
error: result.error || "",
};
} catch (e) {
this._grocyRecipes = [];
this._grocyStatus = { loading: false, configured: null, error: "Couldn't reach Grocy." };
}
this._renderGrocyPicker();
}
// "Import a recipe from a link": paste a URL, read its schema.org Recipe
// metadata (name/ingredients/instructions/servings), fuzzy-match the
// ingredients against Grocy's existing products, let the person review and
// fix any mismatches, then create it in Grocy. this._recipeImport holds
// all the working state for one import attempt (cleared each time the
// modal opens fresh).
_openRecipeImport(prefillUrl) {
this._recipeImport = { recipe: null, matches: [], products: [], units: [], locations: [], choices: [], creatingIdx: null, configured: true, newLocationChoice: {}, ingredientFilter: "" };
const root = this._root;
root.querySelector(".recipe-import-url-input").value = prefillUrl || "";
root.querySelector(".recipe-import-text-input").value = "";
const statusEl = root.querySelector(".recipe-import-status");
statusEl.textContent = "";
statusEl.classList.remove("is-error");
root.querySelector(".recipe-import-review").style.display = "none";
// Defaults back to checked for every fresh import (link, paste-text, or
// manual) rather than carrying over whatever the last recipe imported in
// this session left it at - matches the original always-on behavior
// unless a person deliberately opts out for a given recipe.
root.querySelector(".recipe-import-include-ingredients-check").checked = true;
// Unlike the checkbox above, this one IS carried over between imports (a
// device-level localStorage preference, defaulting to on when never set)
// - see the "Manage Ingredients with Grocy" checkbox's own change
// listener for why.
const manageIngredients = window.localStorage.getItem("familyHubManageIngredientsWithGrocy") !== "off";
root.querySelector(".recipe-import-manage-ingredients-check").checked = manageIngredients;
this._applyManageIngredientsToggle(manageIngredients);
this._openModal(root.querySelector(".recipe-import-overlay"));
// Opened with a link already in hand (the + menu's Recipe option arrives
// empty, but the "also import to Grocy?" prompt after adding a linked
// Meal Suggestion arrives with one) - fetch it immediately instead of
// making the person paste/tap Fetch again for a link Family Hub already
// has.
if (prefillUrl) this._fetchImportedRecipe();
}
_closeRecipeImport() {
this._root.querySelector(".recipe-import-overlay").classList.remove("open");
}
// Shows/hides the ingredient-matching section (the Grocy product picker,
// "+ Add new product" mini-form, and reference-list suggestions) without
// throwing away any matching work already done - ingredient matching
// itself (_matchImportedIngredients) still runs and stays cached in
// state.matches either way, so flipping this back on mid-review shows
// results immediately instead of needing a fresh fetch. Someone who
// doesn't use Grocy for stock/shopping-list tracking can turn this off
// once and just get a plain imported recipe from here on.
_applyManageIngredientsToggle(enabled) {
const root = this._root;
if (!root) return;
root.querySelector(".recipe-import-ingredients-section").style.display = enabled ? "" : "none";
root.querySelector(".recipe-import-manage-ingredients-off-hint").style.display = enabled ? "none" : "";
}
// "Paste recipe text" option: same review screen as the link-based
// import (_fetchImportedRecipe), just fed from family_hub/parse_recipe_text
// (a best-effort section-header split, no network fetch) instead of
// family_hub/parse_recipe_url - for recipes with no link at all (typed
// into a note, forwarded in a text/email, copied out of a group chat).
async _parseImportedRecipeText() {
const root = this._root;
const text = root.querySelector(".recipe-import-text-input").value;
const statusEl = root.querySelector(".recipe-import-status");
root.querySelector(".recipe-import-review").style.display = "none";
if (!text.trim()) {
statusEl.textContent = "Paste some recipe text first.";
statusEl.classList.add("is-error");
return;
}
if (!this._hass) return;
statusEl.textContent = "Parsing…";
statusEl.classList.remove("is-error");
let result;
try {
result = await this._hass.connection.sendMessagePromise({ type: "family_hub/parse_recipe_text", text });
} catch (e) {
statusEl.textContent = "Couldn't reach the backend.";
statusEl.classList.add("is-error");
return;
}
if (!result.success) {
statusEl.textContent = result.error || "Couldn't parse that text.";
statusEl.classList.add("is-error");
return;
}
this._recipeImport.recipe = result.recipe;
const count = result.recipe.ingredients.length;
statusEl.textContent = count ? `Matching ${count} ingredient${count === 1 ? "" : "s"} against your Grocy products…` : "Checking Grocy…";
await this._matchImportedIngredients();
this._renderRecipeImportReview();
statusEl.textContent = "Review the recipe below - fix anything that didn't come through quite right, then add it to Grocy.";
statusEl.classList.remove("is-error");
}
// "Skip this, I'll enter it by hand": opens the exact same review screen
// completely blank, with no fetch/parse step at all - for a recipe with
// no source to import from in the first place (a family recipe card,
// something memorized, etc.). Still calls _matchImportedIngredients with
// an empty ingredient list so the product/unit/location pickers are
// populated for whatever ingredient lines get added by hand next via
// _addImportedIngredientLine.
// Grocy has no dedicated "create location" endpoint beyond the generic
// object-create API (POST /api/objects/locations) - same window.prompt
// pattern used elsewhere in this card. state.newLocationChoice remembers
// which location to pre-select for this ingredient row once
// _renderRecipeImportReview redraws the whole ingredients list (a full
// re-render is needed so the newly created location shows up in every
// ingredient's own location dropdown, not just this one).
async _createGrocyLocationForRecipeImport(idx) {
if (!this._hass) return;
const state = this._recipeImport;
const name = window.prompt('Name the new Grocy location (e.g. "Garage Freezer"):', "");
if (!name || !name.trim()) {
this._renderRecipeImportReview();
return;
}
try {
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/create_grocy_location",
name: name.trim(),
});
if (!result.success || !result.location) {
const form = this._root.querySelector(`.recipe-import-new-product-form[data-idx="${idx}"]`);
const statusEl = form ? form.querySelector(".recipe-import-new-product-status") : null;
if (statusEl) {
statusEl.textContent = `Couldn't create the location: ${result.error || "unknown error"}`;
statusEl.classList.add("is-error");
}
this._renderRecipeImportReview();
return;
}
state.locations = [...state.locations, result.location];
state.newLocationChoice = state.newLocationChoice || {};
state.newLocationChoice[idx] = result.location.id;
this._renderRecipeImportReview();
} catch (e) {
const form = this._root.querySelector(`.recipe-import-new-product-form[data-idx="${idx}"]`);
const statusEl = form ? form.querySelector(".recipe-import-new-product-status") : null;
if (statusEl) {
statusEl.textContent = "Couldn't reach Grocy.";
statusEl.classList.add("is-error");
}
this._renderRecipeImportReview();
}
}
// Same "+ Add new X…" pattern as _createGrocyLocationForRecipeImport just
// above, for Grocy quantity units - offered from three different selects
// on this screen (a per-ingredient row's own unit, and the "+ Add new
// product" mini-form's Stock unit / Purchase unit), so `target` says which
// one triggered this and therefore which state field should remember the
// new unit to pre-select once the whole ingredients list redraws (every
// unit dropdown on the screen needs that redraw to pick up the new unit,
// not just the one that created it).
async _createGrocyUnitForRecipeImport(target) {
if (!this._hass) return;
const state = this._recipeImport;
const name = window.prompt('Name the new Grocy unit (e.g. "tablespoon"):', "");
if (!name || !name.trim()) {
this._renderRecipeImportReview();
return;
}
// Optional - Grocy doesn't require a plural form (falls back to the
// singular name for display wherever it's blank), so a blank answer
// here is left out of the request entirely rather than sent empty.
const namePlural = window.prompt('Plural form, if different (e.g. "tablespoons") - leave blank to skip:', "");
const showFormError = (message) => {
if (target.type === "ingredient") return;
const form = this._root.querySelector(`.recipe-import-new-product-form[data-idx="${target.idx}"]`);
const statusEl = form ? form.querySelector(".recipe-import-new-product-status") : null;
if (statusEl) {
statusEl.textContent = message;
statusEl.classList.add("is-error");
}
};
try {
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/create_grocy_quantity_unit",
name: name.trim(),
...(namePlural && namePlural.trim() ? { name_plural: namePlural.trim() } : {}),
});
if (!result.success || !result.unit) {
showFormError(`Couldn't create the unit: ${result.error || "unknown error"}`);
this._renderRecipeImportReview();
return;
}
state.units = [...state.units, result.unit];
if (target.type === "ingredient") {
if (state.matches[target.idx]) state.matches[target.idx].unit_id = result.unit.id;
} else if (target.type === "product-stock") {
state.newProductUnitChoice = state.newProductUnitChoice || {};
state.newProductUnitChoice[target.idx] = result.unit.id;
} else if (target.type === "product-purchase") {
state.newProductPurchaseUnitChoice = state.newProductPurchaseUnitChoice || {};
state.newProductPurchaseUnitChoice[target.idx] = result.unit.id;
}
this._renderRecipeImportReview();
} catch (e) {
showFormError("Couldn't reach Grocy.");
this._renderRecipeImportReview();
}
}
// Looks up a Grocy unit by plain name (case-insensitive) in this
// household's already-known unit list, creating it via
// family_hub/create_grocy_quantity_unit if it isn't there yet - used by
// the reference suggestion's "Use this" button so a fresh Grocy install
// with only its own default units (often just "piece"/"pack") still gets
// a fully usable suggestion instead of two blank unit pickers needing
// "+ Add new unit…" by hand for every single ingredient. Checking
// state.units first (rather than always creating) is what keeps a second
// ingredient that also calls for, say, "pound" from creating a duplicate
// unit - the first one it already added is reused. Returns null (rather
// than throwing) on any failure, so the caller can still open the form
// with that one field left blank instead of the whole action failing.
async _resolveOrCreateGrocyUnit(state, name) {
if (!name) return null;
const existing = state.units.find((u) => (u.name || "").toLowerCase() === name.toLowerCase());
if (existing) return existing.id;
if (!this._hass) return null;
try {
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/create_grocy_quantity_unit",
name,
});
if (!result.success || !result.unit) return null;
state.units = [...state.units, result.unit];
return result.unit.id;
} catch (e) {
return null;
}
}
// Applies a reference-list suggestion's units (and, when they differ, its
// qty-per-container factor) into state.newProductUnitChoice/
// newProductPurchaseUnitChoice/newProductQtyChoice for the given
// ingredient row, auto-creating whichever of the two units this
// household's Grocy doesn't have yet (see _resolveOrCreateGrocyUnit). This
// is the one piece of logic both ways of opening the "+ Add new product"
// form for a suggested ingredient - clicking the suggestion banner's own
// "Use this" button, or picking "+ Add new product…" straight from the
// row's product dropdown - share, so an ingredient like "Celery" (bunch/
// stalk) gets the same smart prefill no matter which one the person
// happens to use. A no-op when there's no suggestion for this row at all.
async _applyNewProductSuggestion(state, idx, suggestion) {
if (!suggestion) return;
const [stockUnitId, purchaseUnitId] = await Promise.all([
this._resolveOrCreateGrocyUnit(state, suggestion.stock_unit_name),
this._resolveOrCreateGrocyUnit(state, suggestion.purchase_unit_name),
]);
if (stockUnitId) {
state.newProductUnitChoice = state.newProductUnitChoice || {};
state.newProductUnitChoice[idx] = stockUnitId;
}
if (purchaseUnitId) {
state.newProductPurchaseUnitChoice = state.newProductPurchaseUnitChoice || {};
state.newProductPurchaseUnitChoice[idx] = purchaseUnitId;
}
if (suggestion.factor && stockUnitId && purchaseUnitId && stockUnitId !== purchaseUnitId) {
state.newProductQtyChoice = state.newProductQtyChoice || {};
state.newProductQtyChoice[idx] = suggestion.factor;
}
}
async _startManualRecipeEntry() {
const root = this._root;
const statusEl = root.querySelector(".recipe-import-status");
statusEl.textContent = "";
statusEl.classList.remove("is-error");
this._recipeImport.recipe = { name: "", ingredients: [], instructions: [], servings: "", image: "", source_url: "" };
await this._matchImportedIngredients();
this._renderRecipeImportReview();
statusEl.textContent = "Fill in the recipe below, then add it to Grocy.";
}
// Appends one blank, freely-editable ingredient row - used both for
// manual entry from scratch and for fixing up a parsed recipe that
// missed a line (or split one line into two).
_addImportedIngredientLine() {
const state = this._recipeImport;
if (!state || !state.recipe) return;
state.matches.push({ raw: "", product_id: null, product_name: null, score: 0, unit_id: null, unit_name: null, amount_text: "", amount_value: null, no_stock: true });
state.choices.push("");
this._renderRecipeImportReview();
}
// Keeps the photo preview in sync with the (now-editable) Image URL
// field - called on every keystroke rather than only re-rendering the
// whole review screen, so typing a URL by hand doesn't fight for focus.
_updateRecipeImportPhotoPreview() {
const root = this._root;
const state = this._recipeImport;
const photoEl = root.querySelector(".recipe-import-photo-preview");
const image = (state && state.recipe && state.recipe.image) || "";
if (image) {
photoEl.src = image;
photoEl.style.display = "";
} else {
photoEl.removeAttribute("src");
photoEl.style.display = "none";
}
}
async _fetchImportedRecipe() {
const root = this._root;
const url = root.querySelector(".recipe-import-url-input").value.trim();
const statusEl = root.querySelector(".recipe-import-status");
root.querySelector(".recipe-import-review").style.display = "none";
if (!url) {
statusEl.textContent = "Enter a link first.";
statusEl.classList.add("is-error");
return;
}
if (!this._hass) return;
statusEl.textContent = "Fetching recipe…";
statusEl.classList.remove("is-error");
let result;
try {
result = await this._hass.connection.sendMessagePromise({ type: "family_hub/parse_recipe_url", url });
} catch (e) {
statusEl.textContent = "Couldn't reach the backend.";
statusEl.classList.add("is-error");
return;
}
if (!result.success) {
statusEl.textContent = result.error || "Couldn't import that recipe.";
statusEl.classList.add("is-error");
return;
}
this._recipeImport.recipe = result.recipe;
const count = result.recipe.ingredients.length;
statusEl.textContent = count ? `Matching ${count} ingredient${count === 1 ? "" : "s"} against your Grocy products…` : "Checking Grocy…";
await this._matchImportedIngredients();
this._renderRecipeImportReview();
statusEl.textContent = "Review the recipe below, then add it to Grocy.";
statusEl.classList.remove("is-error");
}
async _matchImportedIngredients() {
const state = this._recipeImport;
const recipe = state.recipe;
if (!recipe || !this._hass) return;
try {
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/match_recipe_ingredients",
ingredients: recipe.ingredients,
});
state.matches = Array.isArray(result.matches) ? result.matches : [];
state.products = Array.isArray(result.products) ? result.products : [];
state.units = Array.isArray(result.units) ? result.units : [];
state.locations = Array.isArray(result.locations) ? result.locations : [];
state.configured = result.configured !== false;
} catch (e) {
state.matches = recipe.ingredients.map((raw) => ({ raw, product_id: null, product_name: null, unit_id: null, amount_text: "", amount_value: null, no_stock: true }));
state.products = [];
state.units = [];
state.locations = [];
state.configured = false;
}
// The backend parses a real numeric amount from the ingredient's text
// when it can (amount_value) and flags when it can't (a range like
// "3-4", or free text like "a pinch of salt") - default those to "don't
// count toward stock" up front so Grocy's stock math isn't fed a made-up
// number. Someone reviewing the list can always uncheck this and type a
// number in by hand instead.
state.matches.forEach((m) => {
if (m.amount_value === undefined) m.amount_value = null;
if (m.no_stock === undefined) m.no_stock = m.amount_value === null || m.amount_value === undefined;
});
// Default each row to whatever the backend auto-matched (or left blank,
// which the ingredients list renders as "Skip this ingredient").
state.choices = state.matches.map((m) => m.product_id || "");
}
_renderRecipeImportReview() {
const root = this._root;
const state = this._recipeImport;
const recipe = state.recipe;
if (!recipe) return;
root.querySelector(".recipe-import-review").style.display = "block";
root.querySelector(".recipe-import-name-input").value = recipe.name || "";
root.querySelector(".recipe-import-servings-input").value = recipe.servings || "";
root.querySelector(".recipe-import-image-input").value = recipe.image || "";
root.querySelector(".recipe-import-source-input").value = recipe.source_url || "";
root.querySelector(".recipe-import-instructions-input").value = (recipe.instructions || []).join("\n");
this._updateRecipeImportPhotoPreview();
const listEl = root.querySelector(".recipe-import-ingredients-list");
if (!state.configured) {
listEl.innerHTML = `<div class="recipe-import-status is-error">Grocy isn't connected yet - set it up under Settings > Devices & Services > Family Hub > Configure > Grocy before importing ingredients.</div>`;
} else if (!state.matches.length) {
listEl.innerHTML = `<div class="recipe-import-status">This recipe has no listed ingredients to match.</div>`;
} else {
listEl.innerHTML = state.matches
.map((m, idx) => {
const options = [`<option value="">— Skip this ingredient —</option>`]
.concat(state.products.map((p) => `<option value="${p.id}"${state.choices[idx] === p.id ? " selected" : ""}>${p.name}</option>`))
.concat([`<option value="__new__"${state.creatingIdx === idx ? " selected" : ""}>+ Add new product to Grocy…</option>`])
.join("");
// Shows which unit Grocy will actually track this ingredient's stock in
// - the matched product's own stock unit (m.stock_unit_name, fetched
// alongside the match), not necessarily whatever unit the recipe happened
// to call for. Someone picking "cup" in the row's own unit select above
// needs to see plainly that flour is really tracked (and consumed) in
// pounds, for example - previously this only surfaced indirectly, via the
// conversion warning when the two units didn't line up.
const stockUnitHint = m.product_id && m.stock_unit_name ? ` · used in ${m.stock_unit_name}` : "";
const scoreLabel = m.product_id ? ` <span class="recipe-import-ingredient-score">(matched "${m.product_name}"${stockUnitHint})</span>` : "";
const formVisible = state.creatingIdx === idx;
const selectedNewLocationId = state.newLocationChoice ? state.newLocationChoice[idx] : undefined;
const locationOptions = state.locations
.map((l) => `<option value="${l.id}"${selectedNewLocationId === l.id ? " selected" : ""}>${l.name}</option>`)
.join("");
const selectedNewStockUnitId = state.newProductUnitChoice ? state.newProductUnitChoice[idx] : undefined;
const selectedNewPurchaseUnitId = state.newProductPurchaseUnitChoice ? state.newProductPurchaseUnitChoice[idx] : undefined;
const selectedNewQty = state.newProductQtyChoice ? state.newProductQtyChoice[idx] : undefined;
// Qty per container starts hidden and at "1" (see below) until either a
// person picks a differing purchase unit by hand (the purchase-unit
// select's own change listener toggles it), or a reference suggestion
// (see "Use this" below) preselects a real differing unit up front - in
// that second case the field needs to already be visible on first
// render, since no "change" event fires for a value that was rendered
// as selected rather than picked.
const qtyVisible = !!selectedNewPurchaseUnitId;
const qtyValue = selectedNewQty !== undefined ? selectedNewQty : 1;
const unitOptions = state.units
.map((u) => `<option value="${u.id}"${selectedNewStockUnitId === u.id ? " selected" : ""}>${u.name}</option>`)
.concat([`<option value="__new__">+ Add new unit…</option>`])
.join("");
const purchaseUnitOptions = [`<option value="">Same as stock unit</option>`]
.concat(state.units.map((u) => `<option value="${u.id}"${selectedNewPurchaseUnitId === u.id ? " selected" : ""}>${u.name}</option>`))
.concat([`<option value="__new__">+ Add new unit…</option>`])
.join("");
// Per-row amount/unit editing: the backend already parsed a real number
// out of the ingredient's text where it could (amount_value) and flagged
// when a chosen unit has no known Grocy conversion path to the matched
// product's stock unit (unit_conversion_warning) - both are editable here
// rather than fixed, since the parse is a best guess and the person
// reviewing the import knows the actual recipe better than any parser.
const rowAmountValue = m.amount_value === null || m.amount_value === undefined ? "" : m.amount_value;
const rowUnitOptions = [`<option value="">(unit)</option>`]
.concat(state.units.map((u) => `<option value="${u.id}"${m.unit_id === u.id ? " selected" : ""}>${u.name}</option>`))
.concat([`<option value="__new__">+ Add new unit…</option>`])
.join("");
const showWarning = !!(m.unit_conversion_warning && !m.no_stock);
const suggestion = m.suggested_new_product || null;
const newProductForm = formVisible
? `
<div class="recipe-import-new-product-form" data-idx="${idx}">
<input type="text" class="recipe-import-new-product-name" placeholder="Product name" value="${String(m.product_name || (suggestion ? suggestion.name : "") || m.raw || "").replace(/"/g, "&quot;")}">
<label class="recipe-import-new-product-label">Location<select class="recipe-import-new-product-location">${locationOptions || "<option value=\"\">No locations in Grocy</option>"}<option value="__new__">+ Add new location…</option></select></label>
<label class="recipe-import-new-product-label">Used in (recipes call for it in this)<select class="recipe-import-new-product-unit">${unitOptions || "<option value=\"\">No units in Grocy</option>"}</select></label>
<label class="recipe-import-new-product-label">Sold by (the store sells it in this)<select class="recipe-import-new-product-purchase-unit">${purchaseUnitOptions}</select></label>
<label class="recipe-import-new-product-label recipe-import-new-product-qty-label" style="display:${qtyVisible ? "" : "none"};">Qty per container<input type="number" class="recipe-import-new-product-qty" min="0" step="any" value="${qtyValue}"></label>
<div class="recipe-import-new-product-qty-hint" style="display:${qtyVisible ? "" : "none"};">e.g. a 1000g bag tracked in grams = 1000</div>
<button type="button" class="suggestion-add-btn recipe-import-new-product-save" data-idx="${idx}">Create</button>
<button type="button" class="recipe-import-new-product-cancel" data-idx="${idx}">Cancel</button>
<div class="recipe-import-new-product-status" data-idx="${idx}"></div>
</div>
`
: "";
// A reference-list suggestion for an ingredient with no real Grocy match
// yet (see _match_grocery_reference on the backend) - shown as a small,
// easy-to-ignore hint rather than auto-opening the create-product form,
// since a recipe can have several unmatched ingredients at once and this
// screen can only usefully show one open create-form at a time. "Use
// this" seeds the same state the manual "+ Add new product" flow reads
// from (state.newProductUnitChoice/newProductPurchaseUnitChoice/
// newProductQtyChoice) and opens that exact form already filled in -
// that form, left fully editable with its own Create button, IS the
// verification step, not a second dialog on top of it.
const suggestionHtml = suggestion && !formVisible && !state.choices[idx]
? `<div class="recipe-import-suggestion" data-idx="${idx}">Looks like <strong>${suggestion.name}</strong> — sold by the ${suggestion.purchase_unit_name}, used in ${suggestion.stock_unit_name}. <button type="button" class="recipe-import-suggestion-use-btn" data-idx="${idx}">Use this</button></div>`
: "";
// Wrapped in one group element (rather than the bare sibling blocks
// this used to return) purely so the ingredient search box below has a
// single element per ingredient it can show/hide as a unit - data-search
// carries the raw ingredient text plus any matched product name
// (lowercased) so filtering doesn't need to re-walk each row's children
// on every keystroke.
const searchHay = `${m.raw || ""} ${m.product_name || ""}`.toLowerCase().replace(/"/g, "&quot;");
return `
<div class="recipe-import-ingredient-group" data-idx="${idx}" data-search="${searchHay}">
<div class="recipe-import-ingredient-row" data-idx="${idx}">
<input type="text" class="recipe-import-ingredient-raw-input" data-idx="${idx}" value="${String(m.raw || "").replace(/"/g, "&quot;")}" placeholder="e.g. 2 cups flour">
${scoreLabel}
<input type="number" class="recipe-import-ingredient-amount-input" data-idx="${idx}" step="any" min="0" placeholder="qty" value="${rowAmountValue}">
<select class="recipe-import-ingredient-unit-select" data-idx="${idx}">${rowUnitOptions}</select>
<select class="recipe-import-ingredient-select" data-idx="${idx}">${options}</select>
<button type="button" class="recipe-import-ingredient-remove-btn" data-idx="${idx}" title="Remove this ingredient line">&#10005;</button>
</div>
<label class="remind-check-opt recipe-import-ingredient-no-stock-label" data-idx="${idx}"><input type="checkbox" class="recipe-import-ingredient-no-stock-check" data-idx="${idx}"${m.no_stock ? " checked" : ""}> Don't count toward stock (e.g. "a pinch" or "to taste")</label>
<div class="recipe-import-ingredient-warning" data-idx="${idx}" style="display:${showWarning ? "" : "none"}">&#9888;&#65039; ${m.unit_conversion_warning || ""}</div>
${suggestionHtml}
${newProductForm}
</div>
`;
})
.join("");
listEl.querySelectorAll(".recipe-import-ingredient-raw-input").forEach((input) => {
// Just updates state on each keystroke - no re-render, so typing
// doesn't fight the input for focus (same reasoning as the top-level
// image/source field listeners in the click-wiring block).
input.addEventListener("input", () => {
const idx = parseInt(input.dataset.idx, 10);
if (state.matches[idx]) state.matches[idx].raw = input.value;
});
});
listEl.querySelectorAll(".recipe-import-ingredient-amount-input").forEach((input) => {
// Same no-re-render-on-keystroke pattern as the raw-text input above -
// mutate the match in place so the person can keep typing digits
// without losing focus.
input.addEventListener("input", () => {
const idx = parseInt(input.dataset.idx, 10);
if (!state.matches[idx]) return;
const parsed = parseFloat(input.value);
state.matches[idx].amount_value = input.value.trim() && !isNaN(parsed) ? parsed : null;
});
});
listEl.querySelectorAll(".recipe-import-ingredient-unit-select").forEach((sel) => {
sel.addEventListener("change", () => {
const idx = parseInt(sel.dataset.idx, 10);
if (sel.value === "__new__") {
this._createGrocyUnitForRecipeImport({ type: "ingredient", idx });
return;
}
if (state.matches[idx]) state.matches[idx].unit_id = sel.value ? parseInt(sel.value, 10) : null;
});
});
listEl.querySelectorAll(".recipe-import-ingredient-no-stock-check").forEach((cb) => {
cb.addEventListener("change", () => {
const idx = parseInt(cb.dataset.idx, 10);
if (state.matches[idx]) state.matches[idx].no_stock = cb.checked;
// Checking "don't count toward stock" makes any unit-conversion
// warning moot (nothing here is going to touch Grocy's stock math
// now) - hide it without a full re-render so the checkbox click
// doesn't jump the scroll position around.
const warningEl = listEl.querySelector(`.recipe-import-ingredient-warning[data-idx="${idx}"]`);
if (warningEl) warningEl.style.display = cb.checked || !(state.matches[idx] && state.matches[idx].unit_conversion_warning) ? "none" : "";
});
});
listEl.querySelectorAll(".recipe-import-ingredient-remove-btn").forEach((btn) => {
btn.addEventListener("click", () => {
const idx = parseInt(btn.dataset.idx, 10);
state.matches.splice(idx, 1);
state.choices.splice(idx, 1);
if (state.creatingIdx === idx) state.creatingIdx = null;
this._renderRecipeImportReview();
});
});
listEl.querySelectorAll(".recipe-import-ingredient-select").forEach((sel) => {
sel.addEventListener("change", async () => {
const idx = parseInt(sel.dataset.idx, 10);
if (sel.value === "__new__") {
// Opening the create-product form this way - picking "+ Add new
// product…" straight from the row's own dropdown - used to skip
// the reference-list suggestion entirely, even when one existed
// for this exact ingredient (see _match_grocery_reference on the
// backend): only clicking the separate suggestion banner's own
// "Use this" button applied it. A household ingredient like
// "Celery" has a real suggested unit pair (bunch/stalk) either
// way, so it should get prefilled here too, not just when the
// person happens to notice and click the banner first.
const m = state.matches[idx];
await this._applyNewProductSuggestion(state, idx, m && m.suggested_new_product);
state.creatingIdx = idx;
this._renderRecipeImportReview();
return;
}
state.choices[idx] = sel.value ? parseInt(sel.value, 10) : "";
});
});
listEl.querySelectorAll(".recipe-import-suggestion-use-btn").forEach((btn) => {
btn.addEventListener("click", async () => {
const idx = parseInt(btn.dataset.idx, 10);
const m = state.matches[idx];
await this._applyNewProductSuggestion(state, idx, m && m.suggested_new_product);
state.creatingIdx = idx;
this._renderRecipeImportReview();
});
});
listEl.querySelectorAll(".recipe-import-new-product-location").forEach((sel) => {
sel.addEventListener("change", () => {
if (sel.value !== "__new__") return;
const form = sel.closest(".recipe-import-new-product-form");
const idx = parseInt(form.dataset.idx, 10);
this._createGrocyLocationForRecipeImport(idx);
});
});
listEl.querySelectorAll(".recipe-import-new-product-unit").forEach((sel) => {
sel.addEventListener("change", () => {
if (sel.value !== "__new__") return;
const form = sel.closest(".recipe-import-new-product-form");
const idx = parseInt(form.dataset.idx, 10);
this._createGrocyUnitForRecipeImport({ type: "product-stock", idx });
});
});
listEl.querySelectorAll(".recipe-import-new-product-purchase-unit").forEach((sel) => {
sel.addEventListener("change", () => {
const form = sel.closest(".recipe-import-new-product-form");
if (sel.value === "__new__") {
const idx = parseInt(form.dataset.idx, 10);
this._createGrocyUnitForRecipeImport({ type: "product-purchase", idx });
return;
}
const differs = sel.value !== "";
form.querySelector(".recipe-import-new-product-qty-label").style.display = differs ? "" : "none";
form.querySelector(".recipe-import-new-product-qty-hint").style.display = differs ? "" : "none";
});
});
listEl.querySelectorAll(".recipe-import-new-product-save").forEach((btn) => {
btn.addEventListener("click", () => this._submitNewGrocyProduct(parseInt(btn.dataset.idx, 10)));
});
listEl.querySelectorAll(".recipe-import-new-product-cancel").forEach((btn) => {
btn.addEventListener("click", () => {
state.creatingIdx = null;
this._renderRecipeImportReview();
});
});
}
// Ingredient search box: a recipe importing 15-20 lines (or a household
// checking whether "cinnamon" already has a row before adding another)
// benefits from filtering the list down rather than scrolling it. The
// list itself gets fully replaced on every re-render (new matches,
// unit-conversion edits, etc.), so re-apply whatever filter text is
// already in state each time rather than only wiring this once - and
// restore the box's own value too, since its DOM node is recreated only
// implicitly (it's outside listEl and survives re-renders, but a fresh
// _openRecipeImport call rebuilds the whole modal from scratch).
const searchInput = root.querySelector(".recipe-import-ingredient-search-input");
this._applyRecipeImportIngredientFilter();
if (searchInput) {
searchInput.value = state.ingredientFilter || "";
// Assigning .oninput (not addEventListener) is deliberately idempotent -
// this function re-runs on every re-render, and addEventListener would
// otherwise stack a new duplicate listener each time.
searchInput.oninput = () => {
state.ingredientFilter = searchInput.value;
this._applyRecipeImportIngredientFilter();
};
}
// Instructions field itself is populated once, up front in this method
// (see the .recipe-import-instructions-input.value assignment above) -
// it's a plain editable textarea now rather than a read-only preview, so
// there's nothing left to render into it here.
}
// Shows/hides each already-rendered ingredient group per the current
// search text, and toggles the "no matches" hint - split out from
// _renderRecipeImportReview so it can also run right after a keystroke
// in the search box without redoing the (much more expensive) full
// ingredient-list re-render.
_applyRecipeImportIngredientFilter() {
const root = this._root;
const state = this._recipeImport;
const query = (state.ingredientFilter || "").trim().toLowerCase();
const groups = root.querySelectorAll(".recipe-import-ingredient-group");
let visibleCount = 0;
groups.forEach((group) => {
const hay = group.dataset.search || "";
const matches = !query || hay.includes(query);
group.style.display = matches ? "" : "none";
if (matches) visibleCount += 1;
});
const emptyFilterEl = root.querySelector(".recipe-import-ingredients-empty-filter");
if (emptyFilterEl) {
emptyFilterEl.style.display = query && groups.length && !visibleCount ? "" : "none";
}
}
async _submitNewGrocyProduct(idx) {
const root = this._root;
const state = this._recipeImport;
const form = root.querySelector(`.recipe-import-new-product-form[data-idx="${idx}"]`);
if (!form) return;
const statusEl = form.querySelector(".recipe-import-new-product-status");
const name = form.querySelector(".recipe-import-new-product-name").value.trim();
const locationSel = form.querySelector(".recipe-import-new-product-location");
const unitSel = form.querySelector(".recipe-import-new-product-unit");
const purchaseUnitSel = form.querySelector(".recipe-import-new-product-purchase-unit");
const qtyInput = form.querySelector(".recipe-import-new-product-qty");
const locationId = locationSel.value ? parseInt(locationSel.value, 10) : null;
const unitId = unitSel.value ? parseInt(unitSel.value, 10) : null;
const purchaseUnitId = purchaseUnitSel.value ? parseInt(purchaseUnitSel.value, 10) : null;
const qtyPerContainer = purchaseUnitId ? parseFloat(qtyInput.value) : 1;
if (!name) {
statusEl.textContent = "Enter a product name.";
statusEl.classList.add("is-error");
return;
}
if (!locationId || !unitId) {
statusEl.textContent = "Grocy needs at least one location and one quantity unit set up before a product can be created here.";
statusEl.classList.add("is-error");
return;
}
if (purchaseUnitId && !(qtyPerContainer > 0)) {
statusEl.textContent = "Enter how many stock units are in one purchase container (e.g. a 1000g bag = 1000).";
statusEl.classList.add("is-error");
return;
}
// A household hit Grocy's own "UNIQUE constraint failed: products.name"
// error here - the reference-list suggestion (or the person's own typed
// name) happened to match a product that already existed in their
// Grocy, just not closely enough for the automatic match above to have
// caught it. Rather than send that doomed create request and surface
// Grocy's raw SQL error, catch the exact-name collision here first and
// just use the existing product instead - it's what the person almost
// certainly wants anyway.
const existingProduct = (state.products || []).find(
(p) => (p.name || "").trim().toLowerCase() === name.toLowerCase()
);
if (existingProduct) {
state.choices[idx] = existingProduct.id;
state.creatingIdx = null;
this._renderRecipeImportReview();
const topStatusEl = root.querySelector(".recipe-import-status");
if (topStatusEl) {
topStatusEl.textContent = `"${existingProduct.name}" already exists in Grocy - matched this ingredient to it instead of creating a duplicate.`;
topStatusEl.classList.remove("is-error");
}
return;
}
statusEl.textContent = "Creating…";
statusEl.classList.remove("is-error");
if (!this._hass) return;
try {
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/create_grocy_product",
name,
location_id: locationId,
qu_id: unitId,
qu_id_purchase: purchaseUnitId || undefined,
qty_per_container: qtyPerContainer,
});
if (result.configured === false || !result.success) {
statusEl.textContent = result.error || "Couldn't create that product in Grocy.";
statusEl.classList.add("is-error");
return;
}
state.products.push({ id: result.product_id, name: result.name || name });
state.choices[idx] = result.product_id;
state.creatingIdx = null;
this._renderRecipeImportReview();
if (result.conversion_error) {
// The product itself was still created successfully - surface this
// as a secondary note on the top-level status line (the form's own
// status element is gone now that the review just re-rendered)
// rather than treating the whole thing as a failed create.
const topStatusEl = root.querySelector(".recipe-import-status");
topStatusEl.textContent = result.conversion_error;
topStatusEl.classList.add("is-error");
}
} catch (e) {
statusEl.textContent = "Couldn't reach Grocy.";
statusEl.classList.add("is-error");
}
}
// Best-effort clipboard write with a fallback for contexts where
// navigator.clipboard either doesn't exist or throws (an insecure
// context, an iframe without the clipboard-write permission, an older
// browser) - a temporary offscreen textarea + document.execCommand
// still works in most of those. Rejects only if truly nothing worked,
// so the caller can fall back to "it's in the console" messaging.
async _copyTextToClipboard(text) {
// window.navigator, not bare navigator - same reasoning as window.
// localStorage elsewhere in this file: a plain unqualified reference
// isn't guaranteed to resolve the way "the browser global" would
// suggest in every context this card's code can run in.
if (window.navigator && window.navigator.clipboard && window.navigator.clipboard.writeText) {
try {
await window.navigator.clipboard.writeText(text);
return;
} catch (e) {
// fall through to the textarea approach below
}
}
const textarea = document.createElement("textarea");
textarea.value = text;
textarea.style.position = "fixed";
textarea.style.opacity = "0";
document.body.appendChild(textarea);
textarea.focus();
textarea.select();
let ok = false;
try {
ok = document.execCommand("copy");
} catch (e) {
ok = false;
}
document.body.removeChild(textarea);
if (!ok) throw new Error("copy command failed");
}
// A household reported a recipe with 10 ingredients only sending 4 or 5
// to Grocy, with no way to tell why from the review screen alone (was
// something unmatched? mismatched to the wrong product? never even
// parsed as a separate line?). Rather than guess, this dumps the exact
// state the "Add to Grocy" button is about to act on - every raw
// ingredient line, what it matched (if anything) and at what confidence,
// what the person ultimately chose, and whether that line will actually
// become a recipes_pos row - so it can be copied out and sent back for
// diagnosis instead of describing the problem secondhand. Deliberately
// read fresh from the DOM/state right here rather than reusing
// _createImportedGrocyRecipe's own computation, so pressing this button
// is always non-destructive and never risks accidentally submitting
// anything to Grocy.
_copyRecipeImportDebugInfo() {
const root = this._root;
const state = this._recipeImport;
const statusEl = root.querySelector(".recipe-import-status");
if (!state || !state.recipe) return;
const manageIngredientsCheck = root.querySelector(".recipe-import-manage-ingredients-check");
const manageIngredients = manageIngredientsCheck ? manageIngredientsCheck.checked : false;
const filledMatches = (state.matches || []).filter((m) => (m.raw || "").trim());
const rows = filledMatches.map((m) => {
const idx = state.matches.indexOf(m);
const chosenProductId = state.choices[idx] || null;
return {
raw: m.raw,
amount_text: m.amount_text || "",
amount_value: typeof m.amount_value === "number" ? m.amount_value : null,
parsed_unit: m.unit_name || null,
auto_matched_product_id: m.product_id || null,
auto_matched_product_name: m.product_name || null,
match_score: typeof m.score === "number" ? m.score : null,
chosen_product_id: chosenProductId,
no_stock: !!m.no_stock,
will_be_sent_to_grocy: manageIngredients ? !!chosenProductId : false,
suggested_new_product: m.suggested_new_product || null,
unit_conversion_warning: m.unit_conversion_warning || null,
};
});
const sentCount = rows.filter((r) => r.will_be_sent_to_grocy).length;
const nameInput = root.querySelector(".recipe-import-name-input");
const servingsInput = root.querySelector(".recipe-import-servings-input");
const debugInfo = {
generated_at: new Date().toISOString(),
recipe_name: (nameInput && nameInput.value) || state.recipe.name || "",
servings: (servingsInput && servingsInput.value) || "",
manage_ingredients_with_grocy: manageIngredients,
total_ingredient_lines: rows.length,
ingredients_that_will_reach_grocy: sentCount,
ingredients: rows,
// Only present once "Add to Grocy" has actually been pressed at least
// once - this is Grocy's real, post-creation outcome (what actually got
// added, what got skipped and why, per _grocy_error_detail), not just
// the pre-creation prediction above. Included here because households
// have repeatedly copied this debug info INSTEAD OF the status line
// that already shows this text, so the button now carries both.
last_create_result: state.lastCreateResult || null,
};
const text = JSON.stringify(debugInfo, null, 2);
// Always logged too, regardless of whether the clipboard copy below
// succeeds - a household without clipboard permissions granted (or on
// an older webview) can still grab this from the browser's own
// devtools console.
console.log("Family Hub recipe import debug info:", text);
this._copyTextToClipboard(text)
.then(() => {
if (statusEl) {
statusEl.textContent = `Copied debug info for ${rows.length} ingredient${rows.length === 1 ? "" : "s"} (${sentCount} would reach Grocy right now) - paste it wherever you're sending it.`;
statusEl.classList.remove("is-error");
}
})
.catch(() => {
if (statusEl) {
statusEl.textContent = "Couldn't copy automatically - the same debug info was logged to the browser console instead (right-click the page > Inspect > Console).";
statusEl.classList.add("is-error");
}
});
}
async _createImportedGrocyRecipe() {
const root = this._root;
const state = this._recipeImport;
const statusEl = root.querySelector(".recipe-import-status");
if (!state.recipe) return;
const name = root.querySelector(".recipe-import-name-input").value.trim() || state.recipe.name || "Imported Recipe";
const servings = parseInt(root.querySelector(".recipe-import-servings-input").value.trim(), 10) || 1;
const image = root.querySelector(".recipe-import-image-input").value.trim();
const sourceText = root.querySelector(".recipe-import-source-input").value.trim();
// Blank rows are only ever created by "+ Add ingredient line" (manual
// entry, or padding out a parsed recipe) and left unfilled - drop them
// rather than sending Grocy an empty ingredient/description bullet.
const filledMatches = state.matches.filter((m) => (m.raw || "").trim());
// Ingredients also become recipes_pos rows (see below), but those only
// show up in Grocy's own ingredients list, not in the recipe's
// description/preparation text itself - listing the raw lines here too
// means the full recipe (as originally written on the source page) reads
// as one piece in Grocy, and nothing gets lost for ingredients that
// weren't matched to a product (those still show up here even though they
// won't appear in the ingredients list at all). The "Include ingredients
// in the preparation text" checkbox lets this be skipped for someone who'd
// rather keep the description to just the instructions - since they're
// still stored as real recipes_pos rows regardless, nothing about the
// ingredients list, matching, or shopping-list pushes is affected either
// way, this only changes what shows up in the description/preparation text.
const includeIngredientsInPrep = root.querySelector(".recipe-import-include-ingredients-check").checked;
const ingredientsHtml = includeIngredientsInPrep && filledMatches.length
? `<p><strong>Ingredients</strong></p><ul>${filledMatches.map((m) => `<li>${m.raw}</li>`).join("")}</ul>`
: "";
const instructionsHtml = (state.recipe.instructions || []).map((step) => step.trim()).filter(Boolean).map((step) => `<p>${step}</p>`).join("");
// Preserves where this recipe came from - a real URL becomes a clickable
// link (opening it later is one tap instead of hunting down the
// original page again); anything else typed in (paste-text/manual entry
// has no URL to carry over automatically) is shown as plain text.
const isUrl = /^https?:\/\//i.test(sourceText);
const sourceHtml = sourceText
? `<p><strong>Source:</strong> ${isUrl ? `<a href="${sourceText}">${sourceText}</a>` : sourceText}</p>`
: "";
// Prep/Cook time only ever come from a URL import whose page published
// schema.org prepTime/cookTime (see _format_iso_duration on the backend)
// - there's no manual entry field for these, so a paste-text or
// hand-entered recipe simply never has them and this line is omitted
// entirely. Stored as one combined line (not two separate <p> tags) to
// keep the description compact; _ws_get_grocy_recipe_detail's regexes
// for "Prep:"/"Cook:" don't care whether they're on the same line or
// not, so this is just a display choice.
const prepTime = (state.recipe.prep_time || "").trim();
const cookTime = (state.recipe.cook_time || "").trim();
const prepCookHtml = prepTime || cookTime
? `<p>${prepTime ? `<strong>Prep:</strong> ${prepTime}` : ""}${prepTime && cookTime ? " &middot; " : ""}${cookTime ? `<strong>Cook:</strong> ${cookTime}` : ""}</p>`
: "";
const description = ingredientsHtml + (instructionsHtml ? `<p><strong>Preparation</strong></p>${instructionsHtml}` : "") + prepCookHtml + sourceHtml;
// "Manage Ingredients with Grocy" off means exactly that - no
// recipes_pos rows get created at all, so nothing here ends up linked to
// a Grocy product, counted against stock, or pushed to a shopping list.
// The ingredient text itself is never lost either way: it's still
// available above via ingredientsHtml/the "Include ingredients in the
// preparation text" checkbox, since that's built from the raw lines, not
// from this `ingredients` array.
const manageIngredients = root.querySelector(".recipe-import-manage-ingredients-check").checked;
const ingredients = manageIngredients
? filledMatches.map((m) => ({
raw: m.raw,
amount_text: m.amount_text || "",
// A real numeric amount only gets sent when it's actually usable for
// Grocy's stock math (a positive number) - "don't count toward stock"
// (checked by default whenever the parser couldn't find a clean
// quantity) is what tells the backend to set
// not_check_stock_fulfillment instead of inventing a placeholder amount.
amount: typeof m.amount_value === "number" && isFinite(m.amount_value) && m.amount_value > 0 ? m.amount_value : null,
not_check_stock_fulfillment: !!m.no_stock,
product_id: state.choices[state.matches.indexOf(m)] || null,
unit_id: m.unit_id || null,
}))
: [];
// An ingredient with no product_id here never becomes a recipes_pos row
// at all (see _ws_create_grocy_recipe's "skipped" list) - it's still
// visible afterward in the raw Ingredients text (ingredientsHtml above),
// but silently missing from Grocy's own ingredients list/stock math/
// shopping-list pushes for that recipe. A household reported this as
// "not importing all the items" without realizing why - only warning
// once (rather than after the fact, in a status message that then
// closes the whole modal a moment later) actually gives them a chance to
// go back and match/create the missing ones first, or accept it and
// move on. Only relevant when ingredients are being managed with Grocy
// at all - "off" already means none of this ever gets linked, by choice.
if (manageIngredients && ingredients.length) {
const totalCount = ingredients.length;
const matchedCount = ingredients.filter((ing) => ing.product_id).length;
if (matchedCount < totalCount) {
const unmatchedCount = totalCount - matchedCount;
const proceed = window.confirm(
`Matched ${matchedCount} out of ${totalCount} ingredients to Grocy. Continue? ` +
`This will leave the ${unmatchedCount} unmatched ingredient${unmatchedCount === 1 ? "" : "s"} out of the recipe's ingredient list in Grocy (they'll still show up in its written-out ingredients text).`
);
if (!proceed) return;
}
}
statusEl.textContent = "Creating recipe in Grocy…";
statusEl.classList.remove("is-error");
if (!this._hass) return;
try {
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/create_grocy_recipe",
name,
description,
servings,
image,
ingredients,
});
if (result.configured === false) {
statusEl.textContent = "Grocy isn't connected yet - set it up under Settings > Devices & Services > Family Hub > Configure > Grocy.";
statusEl.classList.add("is-error");
state.lastCreateResult = { configured: false };
return;
}
if (!result.success) {
statusEl.textContent = result.error || "Couldn't create the recipe in Grocy.";
statusEl.classList.add("is-error");
state.lastCreateResult = { success: false, error: result.error || null };
return;
}
// Stashed on state (not just shown in statusEl) so the "Copy debug
// info" button can include the real Grocy-side outcome - added count,
// which ingredients were skipped and why, the picture warning - since
// households have repeatedly reached for that button instead of
// reading/copying the status line above the buttons.
state.lastCreateResult = {
success: true,
added: result.added,
skipped: result.skipped || [],
picture_error: result.picture_error || null,
recipe_id: result.recipe_id || null,
};
let text = `Added "${name}" to Grocy with ${result.added} ingredient${result.added === 1 ? "" : "s"}.`;
if (result.skipped && result.skipped.length) {
text += ` ${result.skipped.length} need${result.skipped.length === 1 ? "s" : ""} to be added by hand: ${result.skipped.join(", ")}.`;
}
if (result.picture_error) {
text += ` ${result.picture_error}`;
}
statusEl.textContent = text;
statusEl.classList.remove("is-error");
// Refresh the Meal Suggestions box's own Grocy recipe list so the
// freshly-imported recipe is immediately pickable from "Add from
// Grocy" without needing to reopen anything.
this._fetchGrocyRecipes();
// The importer is a one-shot "create this recipe" action, not a place
// to linger like the Grocery List or Shopping List modals, so a clean
// success (nothing skipped, no picture hiccup) auto-closes after a
// brief delay. A household reported a recipe with several skipped
// ingredients and no clear idea why - it turned out the "N need to be
// added by hand: ..." summary (which, since v72, includes Grocy's own
// reason for each one) was auto-closing after the same fixed 1.6s used
// for a plain success, nowhere near long enough to actually read a list
// of several ingredients each with its own error message. Anything
// worth a second look - a skip, or the photo failing to attach - now
// stays open until manually closed instead of racing the clock.
if ((!result.skipped || !result.skipped.length) && !result.picture_error) {
setTimeout(() => this._closeRecipeImport(), 1600);
}
} catch (e) {
statusEl.textContent = "Couldn't reach Grocy.";
statusEl.classList.add("is-error");
state.lastCreateResult = { success: false, error: "Couldn't reach Grocy." };
}
}
// The Grocy picker used to have three different behaviors depending on
// where it was opened from (fill the day/dish editor directly, add a
// Meal Suggestion, or - the one surviving path - add a Recipe Box entry)
// but the other two lost their only entry points: the day/dish editor's
// own "From Grocy" button was folded into the Recipe Box's unified
// picker mode (task #290), and the Suggestions box's "Add from Grocy"
// button was removed outright since the Recipe Box is now the only place
// a suggestion gets created (search + 💡, or add + the "Also add to Meal
// Suggestions" checkbox). Add straight into the Recipe Box's Store (same
// write path as every other Recipe Box entry, and the fuzzy-duplicate
// check comes along with it) instead of maintaining branches nothing can
// reach anymore.
_selectGrocyRecipe(recipe) {
if (!recipe) return;
this._upsertDish(recipe.name, "", recipe.link || "", null, null, recipe.id, undefined, undefined, true);
this._closeGrocyPicker();
}
_renderGrocyPicker() {
if (!this._root) return;
const statusEl = this._root.querySelector(".grocy-picker-status");
const list = this._root.querySelector(".grocy-picker-list");
const status = this._grocyStatus || {};
if (status.loading) {
statusEl.textContent = "Loading recipes from Grocy…";
statusEl.classList.remove("is-error");
list.innerHTML = "";
return;
}
if (status.configured === false) {
statusEl.textContent = "Grocy isn't connected yet — set it up under Settings > Devices & Services > Family Hub > Configure > Grocy.";
statusEl.classList.remove("is-error");
list.innerHTML = "";
return;
}
if (status.error) {
statusEl.textContent = `Couldn't load recipes from Grocy: ${status.error}`;
statusEl.classList.add("is-error");
list.innerHTML = "";
return;
}
statusEl.textContent = "";
statusEl.classList.remove("is-error");
let recipes = this._grocyRecipes || [];
const term = (this._grocySearchTerm || "").trim().toLowerCase();
if (term) {
recipes = recipes.filter((r) => (r.name || "").toLowerCase().includes(term));
}
if (!recipes.length) {
list.innerHTML = `<div class="loved-empty">${
term ? "No Grocy recipes match your search." : "No recipes found in Grocy."
}</div>`;
return;
}
list.innerHTML = recipes
.map(
(r, idx) =>
`<div class="loved-item selectable" data-idx="${idx}">
<div class="loved-name"><span>${r.name}</span><span class="grocy-picker-preview" title="Preview recipe">&#128065;</span></div>
</div>`
)
.join("");
list.querySelectorAll(".grocy-picker-preview").forEach((el) => {
el.addEventListener("click", (e) => {
e.stopPropagation();
const idx = parseInt(el.closest(".loved-item").dataset.idx, 10);
const r = recipes[idx];
this._openGrocyRecipeViewer(r.id, r.name, r.link, true);
});
});
list.querySelectorAll(".loved-item").forEach((el) => {
el.addEventListener("click", () => {
const idx = parseInt(el.dataset.idx, 10);
this._selectGrocyRecipe(recipes[idx]);
});
});
}
_openGrocyRecipeViewer(recipeId, fallbackName, fallbackLink, isPreview) {
if (!recipeId) return;
this._grocyRecipeViewerRecipeId = recipeId;
this._grocyRecipeViewerFallbackLink = fallbackLink || "";
const root = this._root;
const overlay = root.querySelector(".grocy-recipe-viewer-overlay");
// Preview mode (task #177's picker preview icon) opens the exact same
// viewer, but over a picker that's deliberately left open underneath -
// show a "Back" button instead of relying on the plain close (X) to
// implicitly reveal it, so it reads as "look, then come back" rather
// than "close this and lose your place".
overlay.classList.toggle("preview-mode", !!isPreview);
// "block", not "" - .grocy-recipe-viewer-back-btn's CSS rule defaults to
// display:none (same gotcha as the photo elements above), so clearing
// the inline style here would silently leave it hidden even in preview
// mode instead of showing it.
root.querySelector(".grocy-recipe-viewer-back-btn").style.display = isPreview ? "block" : "none";
root.querySelector(".grocy-recipe-viewer-title").textContent = fallbackName || "Recipe";
root.querySelector(".grocy-recipe-viewer-stats").innerHTML = "";
root.querySelector(".grocy-recipe-viewer-servings").textContent = "";
root.querySelector(".grocy-recipe-viewer-ingredients").innerHTML = "";
root.querySelector(".grocy-recipe-viewer-instructions").innerHTML = "";
root.querySelector(".grocy-recipe-viewer-description").innerHTML = "";
root.querySelector(".grocy-recipe-viewer-scale-row").style.display = "none";
this._grocyRecipeViewerIngredients = [];
this._grocyRecipeViewerBaseServings = 1;
this._grocyRecipeViewerServings = 1;
this._grocyRecipeViewerRawDescription = "";
const photoEl = root.querySelector(".grocy-recipe-viewer-photo");
photoEl.style.display = "none";
photoEl.src = "";
// The full-screen modal-box scrolls its own content (overflow-y: auto);
// without this, reopening the viewer after scrolling through a previous
// recipe reused the same stale scrollTop and opened mid-page with the
// title scrolled out of view above the fold.
root.querySelector(".grocy-recipe-viewer-overlay .modal-box").scrollTop = 0;
this._openModal(root.querySelector(".grocy-recipe-viewer-overlay"));
this._fetchGrocyRecipeDetail(recipeId);
}
_closeGrocyRecipeViewer() {
this._root.querySelector(".grocy-recipe-viewer-overlay").classList.remove("open");
}
// "I made this" button - calls Grocy's own /consume endpoint, which is a
// real, one-way stock deduction (see the backend handler's docstring),
// the same thing clicking "Consume all ingredients needed" on the
// recipe's own page in Grocy does. Confirmed first since there's no undo
// here beyond manually re-adding stock in Grocy afterward.
async _consumeGrocyRecipeIngredients() {
const recipeId = this._grocyRecipeViewerRecipeId;
if (!recipeId || !this._hass) return;
if (!window.confirm("Deduct this recipe's ingredients from your Grocy stock now? This can't be undone from here.")) {
return;
}
const statusEl = this._root.querySelector(".grocy-recipe-viewer-status");
statusEl.textContent = "Consuming ingredients in Grocy…";
statusEl.classList.remove("is-error");
try {
// Only sent when the viewer's own scaler has been moved off the
// recipe's base servings - leaving it out otherwise means an
// untouched recipe consumes at whatever desired_servings was already
// saved in Grocy, instead of this call silently overwriting it back
// to the base count for recipes plenty of people leave scaled up.
const servings =
this._grocyRecipeViewerServings && this._grocyRecipeViewerServings !== this._grocyRecipeViewerBaseServings
? this._grocyRecipeViewerServings
: undefined;
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/consume_grocy_recipe",
recipe_id: recipeId,
...(servings ? { servings } : {}),
});
if (result.configured === false) {
statusEl.textContent = "Grocy isn't connected — set it up under Settings > Devices & Services > Family Hub > Configure > Grocy.";
statusEl.classList.add("is-error");
return;
}
if (!result.success) {
statusEl.textContent = `Couldn't consume this recipe's ingredients: ${result.error || "unknown error"}`;
statusEl.classList.add("is-error");
return;
}
statusEl.textContent = "Ingredients deducted from Grocy stock.";
statusEl.classList.remove("is-error");
} catch (e) {
statusEl.textContent = "Couldn't reach Grocy.";
statusEl.classList.add("is-error");
}
}
async _fetchGrocyRecipeDetail(recipeId) {
if (!this._hass) return;
const statusEl = this._root.querySelector(".grocy-recipe-viewer-status");
statusEl.textContent = "Loading recipe from Grocy…";
statusEl.classList.remove("is-error");
try {
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/get_grocy_recipe_detail",
recipe_id: recipeId,
});
if (result.configured === false) {
statusEl.textContent = "Grocy isn't connected — set it up under Settings > Devices & Services > Family Hub > Configure > Grocy.";
return;
}
if (result.error || !result.recipe) {
statusEl.textContent = `Couldn't load this recipe from Grocy: ${result.error || "not found"}`;
statusEl.classList.add("is-error");
return;
}
statusEl.textContent = "";
this._renderGrocyRecipeDetail(result.recipe);
} catch (e) {
statusEl.textContent = "Couldn't reach Grocy.";
statusEl.classList.add("is-error");
}
}
_renderGrocyRecipeDetail(recipe) {
const root = this._root;
const photoEl = root.querySelector(".grocy-recipe-viewer-photo");
if (recipe.image) {
photoEl.src = recipe.image;
// NOT "" - .grocy-recipe-viewer-photo's own CSS rule sets
// `display: none` as its base/default (so it stays hidden for
// recipes with no photo without extra markup) - clearing the inline
// style here would just fall back to that class rule and the image
// would silently never show even though src is set correctly.
photoEl.style.display = "block";
} else {
photoEl.style.display = "none";
photoEl.src = "";
}
root.querySelector(".grocy-recipe-viewer-title").textContent = recipe.name || "Recipe";
// Prep/Cook/Total stat pills (task #250/mockup) - only the ones this
// recipe actually has real data for; a manually-typed Grocy recipe with
// none of the three published just gets an empty (and, per the
// :empty CSS rule, invisible) stats row instead of a placeholder.
const statsEl = root.querySelector(".grocy-recipe-viewer-stats");
const statDefs = [
["Prep", recipe.prep_time],
["Cook", recipe.cook_time],
["Total", recipe.total_time],
].filter(([, value]) => (value || "").trim());
statsEl.innerHTML = statDefs
.map(([label, value]) => `<div class="grocy-recipe-stat"><span class="grocy-recipe-stat-label">${label}</span><span class="grocy-recipe-stat-value">${value}</span></div>`)
.join("");
root.querySelector(".grocy-recipe-viewer-servings").textContent = recipe.servings
? `Makes ${recipe.servings} serving${recipe.servings === 1 ? "" : "s"}`
: "";
// The picker only ever had the list-page link; once the detail call
// resolves we have the authoritative one from the recipe object itself
// (same value in practice, but this is the one that should win).
this._grocyRecipeViewerFallbackLink = recipe.link || this._grocyRecipeViewerFallbackLink || "";

const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
this._grocyRecipeViewerIngredients = ingredients;
// The scaler (task #173) works off the recipe's own base_servings - the
// serving count Grocy's recipes_pos amounts are actually calibrated for -
// separate from "servings" above, which can reflect a previously-saved
// desired_servings override instead. Falls back gracefully to whatever's
// available so old/partial responses (or the plain "amount" string with
// no raw amount_value) still render exactly as before.
const baseServings = Number(recipe.base_servings) > 0 ? Number(recipe.base_servings) : (Number(recipe.servings) > 0 ? Number(recipe.servings) : 1);
this._grocyRecipeViewerBaseServings = baseServings;
this._grocyRecipeViewerServings = Number(recipe.servings) > 0 ? Number(recipe.servings) : baseServings;
const scaleRow = root.querySelector(".grocy-recipe-viewer-scale-row");
const canScale = ingredients.some((ing) => typeof ing.amount_value === "number");
scaleRow.style.display = canScale ? "flex" : "none";
root.querySelector(".grocy-recipe-viewer-scale-value").textContent = String(this._grocyRecipeViewerServings);
this._renderGrocyRecipeIngredients();

// The description/instructions HTML can itself embed a plain-text
// ingredients list (see _createImportedGrocyRecipe's "Ingredients"
// <ul> block, added for recipes imported via the card's "Import a
// recipe from a link" flow, task #158) - kept unscaled here so
// _renderGrocyRecipeDescription can re-derive the scaled version from
// the original every time the stepper changes, rather than scaling an
// already-scaled string a second time.
this._grocyRecipeViewerRawDescription = recipe.description || "";
this._renderGrocyRecipeDescription();
}
// Recomputes the description/instructions block against the current
// servings ratio - mirrors _renderGrocyRecipeIngredients, but for the
// plain-text "Ingredients" list some recipes also carry inside their
// description HTML (see the comment above). Recipes without that exact
// block (hand-typed directly in Grocy, or from before task #158) simply
// pass through _scaleIngredientsDescriptionHtml unchanged.
_renderGrocyRecipeDescription() {
if (!this._root) return;
const descEl = this._root.querySelector(".grocy-recipe-viewer-description");
const instructionsEl = this._root.querySelector(".grocy-recipe-viewer-instructions");
if (!descEl) return;
const raw = this._grocyRecipeViewerRawDescription || "";
if (!raw) {
if (instructionsEl) instructionsEl.innerHTML = "";
descEl.innerHTML = `<div class="loved-empty">No instructions added in Grocy.</div>`;
return;
}
const baseServings = this._grocyRecipeViewerBaseServings || 1;
const servings = this._grocyRecipeViewerServings || baseServings;
const ratio = baseServings > 0 ? servings / baseServings : 1;
let html = this._scaleIngredientsDescriptionHtml(raw, ratio);

// Recipes imported via this card's own "Import a recipe from a link"
// flow (_createImportedGrocyRecipe, task #158/#223) write a predictable
// "<p><strong>Preparation</strong></p><p>step 1</p><p>step 2</p>..."
// block, followed by (optionally) the Prep/Cook line and/or a Source
// line, each of which starts with its own "<p><strong>". Recipes without
// that exact shape (hand-typed directly in Grocy, older imports, plain
// pasted text with no parsed steps) simply have no match here and fall
// through to the untouched raw-HTML rendering exactly as before this
// feature existed - nothing about them changes.
const stepsMatch = html.match(/<p><strong>Preparation<\/strong><\/p>([\s\S]*?)(?=<p><strong>|$)/i);
const steps = [];
if (stepsMatch) {
const stepRe = /<p>([\s\S]*?)<\/p>/gi;
let m;
while ((m = stepRe.exec(stepsMatch[1]))) {
const text = m[1].trim();
if (text) steps.push(text);
}
}

if (instructionsEl) {
instructionsEl.innerHTML = steps.length
? `<div class="grocy-recipe-instructions-title">Instructions</div>` +
steps
.map(
(step, i) =>
`<div class="grocy-recipe-instruction-row"><span class="grocy-recipe-instruction-badge">${i + 1}</span><span class="grocy-recipe-instruction-text">${step}</span></div>`
)
.join("")
: "";
}

// Once a block has its own dedicated element above (structured
// ingredients list, numbered Instructions), it'd otherwise appear twice
// on the page. The Ingredients block needs real care though: an
// ingredient the importer couldn't match (or the person left unmatched/
// skipped) never becomes a recipes_pos row at all (see
// _ws_create_grocy_recipe's "skipped" list), so the structured list
// above can be a strict SUBSET of what's in the raw text - and outright
// removing the raw block used to hide those skipped ingredients
// entirely (a real household report: "not including the ingredients in
// the preparation section"). Rather than try to judge redundancy and
// hide it, this always keeps the raw written-out list available - just
// tucked behind a collapsed-by-default accordion, so it's a tap away
// when needed (a skipped ingredient, double-checking exact wording,
// etc.) without permanently duplicating the structured list above for
// the common case where every ingredient already matched.
const ingredientsBlockMatch = html.match(/<p><strong>Ingredients<\/strong><\/p><ul>([\s\S]*?)<\/ul>/i);
if (ingredientsBlockMatch) {
const accordionHtml =
`<div class="grocy-recipe-ingredients-accordion">` +
`<button type="button" class="accordion-toggle recipe-viewer-ingredients-toggle" data-target="recipe-viewer-ingredients-body">` +
`<span class="theme-section-label">Written-out ingredients list</span>` +
`<span class="accordion-chevron">&#9660;</span>` +
`</button>` +
`<div class="accordion-body" id="recipe-viewer-ingredients-body"><ul>${ingredientsBlockMatch[1]}</ul></div>` +
`</div>`;
html = html.replace(ingredientsBlockMatch[0], accordionHtml);
}
if (steps.length) {
html = html.replace(stepsMatch[0], "");
}
// The Prep/Cook line is now always shown as its own stat pills whenever
// it exists at all (see _renderGrocyRecipeDetail), so it's always
// redundant here - safe to strip unconditionally.
html = html.replace(/<p>[\s\S]*?<strong>(?:Prep|Cook):<\/strong>[\s\S]*?<\/p>/i, "");
html = html.trim();
descEl.innerHTML = html || `<div class="loved-empty">No additional notes.</div>`;
const ingredientsToggle = descEl.querySelector(".recipe-viewer-ingredients-toggle");
if (ingredientsToggle) {
ingredientsToggle.addEventListener("click", () => {
const body = descEl.querySelector(`#${ingredientsToggle.dataset.target}`);
ingredientsToggle.classList.toggle("open");
if (body) body.classList.toggle("open");
});
}
}
// Finds the "Ingredients" <ul> block _createImportedGrocyRecipe writes
// into a recipe's description (raw scraped lines like "2 cups flour",
// not the structured recipes_pos data the main ingredients list above
// uses) and scales just the LEADING quantity of each line by ratio,
// leaving everything else - product names, notes, and especially the
// Preparation instructions below it (so "bake for 20 minutes" never gets
// mistaken for a scalable quantity) - untouched. A line whose quantity
// isn't a plain number/fraction (a range like "3-4 cloves", or no
// leading number at all, e.g. "a pinch of salt") is left exactly as
// written rather than guessed at. Recipes with no such block (hand-typed
// directly in Grocy) pass through completely unchanged.
_scaleIngredientsDescriptionHtml(html, ratio) {
if (!html) return html;
const blockRe = /(<p><strong>Ingredients<\/strong><\/p><ul>)([\s\S]*?)(<\/ul>)/i;
const match = html.match(blockRe);
if (!match) return html;
const qtyRe = /^(\s*)(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?[¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]?|[¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])(?=\s|$)/;
const scaledItems = match[2].replace(/<li>([\s\S]*?)<\/li>/gi, (full, inner) => {
const qm = inner.match(qtyRe);
if (!qm) return full;
const value = this._parseQuantityToken(qm[2]);
if (value === null || !isFinite(value)) return full;
const scaledText = this._formatScaledQuantityToken(value * ratio);
const rest = inner.slice(qm[0].length);
return `<li>${qm[1]}${scaledText}${rest}</li>`;
});
return html.slice(0, match.index) + match[1] + scaledItems + match[3] + html.slice(match.index + match[0].length);
}
// "1 1/2" / "1/2" / "1½" / "½" / "2" / "2.5" -> a plain decimal. Returns
// null for anything else (ranges, non-numeric text) so the caller knows
// to leave that line alone rather than silently mangling it.
_parseQuantityToken(token) {
token = (token || "").trim();
const FRACTION_MAP = {
"¼": 0.25, "½": 0.5, "¾": 0.75,
"⅓": 1 / 3, "⅔": 2 / 3,
"⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8,
"⅙": 1 / 6, "⅚": 5 / 6,
"⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
};
let m = token.match(/^(\d+)\s+(\d+)\/(\d+)$/);
if (m) return parseInt(m[1], 10) + parseInt(m[2], 10) / parseInt(m[3], 10);
m = token.match(/^(\d+)\/(\d+)$/);
if (m) return parseInt(m[1], 10) / parseInt(m[2], 10);
m = token.match(/^(\d+(?:\.\d+)?)?([¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])?$/);
if (m && (m[1] || m[2])) {
const whole = m[1] ? parseFloat(m[1]) : 0;
const frac = m[2] ? FRACTION_MAP[m[2]] : 0;
return whole + frac;
}
return null;
}
// The inverse of _parseQuantityToken - renders a scaled decimal back as
// a recipe-friendly whole/fraction string (e.g. "1 1/2" rather than
// "1.5") when it lands close to a common cooking fraction (halves,
// thirds, quarters, fifths, sixths, eighths), falling back to a plain
// rounded decimal otherwise.
_formatScaledQuantityToken(value) {
const rounded = Math.round(value * 100) / 100;
const whole = Math.floor(rounded + 1e-6);
const frac = rounded - whole;
const FRACTIONS = [
[1 / 8, "1/8"], [1 / 6, "1/6"], [0.2, "1/5"], [0.25, "1/4"],
[1 / 3, "1/3"], [0.375, "3/8"], [0.4, "2/5"], [0.5, "1/2"],
[0.6, "3/5"], [0.625, "5/8"], [2 / 3, "2/3"], [0.75, "3/4"],
[0.8, "4/5"], [5 / 6, "5/6"], [0.875, "7/8"],
];
if (frac > 0.03) {
for (const [f, label] of FRACTIONS) {
if (Math.abs(frac - f) < 0.03) {
return whole > 0 ? `${whole} ${label}` : label;
}
}
}
return String(rounded);
}
// Recomputes just the ingredients list against
// this._grocyRecipeViewerServings/_grocyRecipeViewerBaseServings, without
// re-fetching from Grocy - called on initial render and again every time
// the scale stepper changes.
_renderGrocyRecipeIngredients() {
if (!this._root) return;
const ingredientsEl = this._root.querySelector(".grocy-recipe-viewer-ingredients");
if (!ingredientsEl) return;
const ingredients = this._grocyRecipeViewerIngredients || [];
if (!ingredients.length) {
ingredientsEl.innerHTML = "";
return;
}
const baseServings = this._grocyRecipeViewerBaseServings || 1;
const servings = this._grocyRecipeViewerServings || baseServings;
const ratio = baseServings > 0 ? servings / baseServings : 1;
let lastGroup = null;
ingredientsEl.innerHTML = ingredients
.map((ing, idx) => {
let groupHtml = "";
const group = ing.group || "";
if (group !== lastGroup) {
lastGroup = group;
if (group) groupHtml = `<div class="grocy-recipe-ingredient-group">${group}</div>`;
}
const note = ing.note ? ` <span class="grocy-recipe-ingredient-note">(${ing.note})</span>` : "";
const amountText = this._formatScaledIngredientAmount(ing, ratio);
// Numbered circular badge (task #251/mockup) in place of the amount
// leading the row - the amount itself moves down alongside the
// product name so nothing shown before is lost.
return `${groupHtml}<div class="grocy-recipe-ingredient-row"><span class="grocy-recipe-ingredient-badge">${idx + 1}</span><span><span class="grocy-recipe-ingredient-amount">${amountText}</span> ${ing.product || ""}${note}</span></div>`;
})
.join("");
}
// A free-text amount ("to taste") can't be scaled - passed through as-is.
// Anything without a raw numeric amount_value (an older/partial response)
// falls back to the pre-formatted "amount" string, matching the exact
// behavior before this feature existed.
_formatScaledIngredientAmount(ing, ratio) {
if (ing.variable_amount) return ing.variable_amount;
if (typeof ing.amount_value !== "number") return ing.amount || "";
const scaled = ing.amount_value * ratio;
const rounded = Math.round(scaled * 100) / 100;
const unit = (rounded === 1 ? (ing.unit_name || ing.unit_name_plural) : (ing.unit_name_plural || ing.unit_name)) || "";
return `${rounded} ${unit}`.trim();
}
_adjustGrocyRecipeViewerServings(delta) {
const next = Math.max(1, (this._grocyRecipeViewerServings || 1) + delta);
if (next === this._grocyRecipeViewerServings) return;
this._grocyRecipeViewerServings = next;
const valueEl = this._root.querySelector(".grocy-recipe-viewer-scale-value");
if (valueEl) valueEl.textContent = String(next);
this._renderGrocyRecipeIngredients();
this._renderGrocyRecipeDescription();
}
_openTemplates() {
this._templatesSearchTerm = "";
this._root.querySelector(".templates-search").value = "";
this._fetchMealTemplates();
this._openModal(this._root.querySelector(".templates-overlay"));
}
_closeTemplates() {
this._root.querySelector(".templates-overlay").classList.remove("open");
}
_renderMealTemplates() {
if (!this._root) return;
const list = this._root.querySelector(".templates-list");
if (!list) return;
let templates = this._mealTemplates || [];
const term = (this._templatesSearchTerm || "").trim().toLowerCase();
if (term) {
templates = templates.filter((t) => (t.name || "").toLowerCase().includes(term));
}
if (!templates.length) {
list.innerHTML = `<div class="loved-empty">${
term ? "No templates match your search." : "No templates yet — save this week's plan above to create one."
}</div>`;
return;
}
list.innerHTML = templates
.map((t, idx) => {
const count = (t.blocks || []).length;
return `<div class="template-row" data-idx="${idx}">
<div class="template-row-top">
<span class="loved-name">${t.name}</span>
<button type="button" class="template-delete-btn" data-idx="${idx}" title="Delete">&#10005;</button>
</div>
<div class="template-summary">${count} meal${count === 1 ? "" : "s"} planned</div>
<div class="template-actions">
<button type="button" class="template-apply-btn" data-idx="${idx}">Apply to this week</button>
</div>
</div>`;
})
.join("");
list.querySelectorAll(".template-delete-btn").forEach((btn) => {
btn.addEventListener("click", (e) => {
e.stopPropagation();
const idx = parseInt(btn.dataset.idx, 10);
const t = templates[idx];
if (!t) return;
if (!window.confirm(`Delete the "${t.name}" template? This can't be undone.`)) return;
this._deleteMealTemplate(t.uid);
});
});
list.querySelectorAll(".template-apply-btn").forEach((btn) => {
btn.addEventListener("click", async () => {
const idx = parseInt(btn.dataset.idx, 10);
const t = templates[idx];
if (!t) return;
if (!window.confirm(`Apply "${t.name}" to this week? This will overwrite any meals already planned on matching days.`)) return;
btn.disabled = true;
btn.textContent = "Applying…";
await this._applyMealTemplate(t);
this._closeTemplates();
});
});
}
// Note: _selectSuggestion and _renderSuggestions (the standalone
// Suggestions modal's own picker-fill and list-rendering) were removed
// along with that modal - see _openSuggestedRecipes for where "viewing
// suggestions" and "picking a suggested recipe for a meal" both live now
// (the Recipe Box's own "💡 Suggested" filter and _selectLovedDish).
_openAddEvent(tab) {
const root = this._root;
const select = root.querySelector(".add-event-calendar-select");
select.innerHTML = this._getPeople()
.map((p) => `<option value="${p.entity}">${p.name}</option>`)
.join("");
root.querySelector(".add-event-title").value = "";
root.querySelector(".add-event-location").value = "";
root.querySelector(".add-event-description").value = "";
root.querySelector(".add-event-reminder-rollover").checked = false;
// New events default to reminders at 10 and 30 minutes before.
root.querySelectorAll(".remind-check").forEach((cb) => {
cb.checked = cb.value === "10" || cb.value === "30";
});
const now = new Date();
root.querySelector(".add-event-date").value = this._dateKey(now);
root.querySelector(".add-event-reminder-date").value = this._dateKey(now);
const nextHour = new Date(now);
nextHour.setMinutes(0, 0, 0);
nextHour.setHours(nextHour.getHours() + 1);
const afterHour = new Date(nextHour);
afterHour.setHours(afterHour.getHours() + 1);
const fmtTimeInput = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
root.querySelector(".add-event-start-time").value = fmtTimeInput(nextHour);
root.querySelector(".add-event-end-time").value = fmtTimeInput(afterHour);
root.querySelector(".add-event-reminder-time").value = fmtTimeInput(nextHour);
root.querySelectorAll(".add-event-allday-btn").forEach((b) => b.classList.toggle("active", b.dataset.value === "off"));
this._updateAddEventFieldVisibility(false);
// Which tab was last used isn't meaningful context to carry over to the
// next, unrelated event/reminder - default to Calendar unless the + menu
// specifically picked "Reminder" (see the add-fab-reminder handler).
this._setAddEventTab(tab === "reminder" ? "reminder" : "calendar");
this._openModal(root.querySelector(".add-event-overlay"));
}
_setAddEventTab(tab) {
const root = this._root;
this._addEventActiveTab = tab === "reminder" ? "reminder" : "calendar";
const isReminder = this._addEventActiveTab === "reminder";
root.querySelectorAll(".add-event-tab-btn").forEach((btn) => {
btn.classList.toggle("active", btn.dataset.tab === this._addEventActiveTab);
});
root.querySelectorAll(".add-event-tab-panel").forEach((panel) => {
panel.style.display = panel.dataset.tabPanel === this._addEventActiveTab ? "" : "none";
});
// Reminders always go on the fixed reminders_entity to-do list, not one of
// the picked calendars - the Calendar picker (shared above the tabs)
// isn't relevant to them, so hide it rather than leave a dropdown that
// does nothing on this tab.
const calendarField = root.querySelector(".add-event-calendar-field");
if (calendarField) calendarField.style.display = isReminder ? "none" : "";
const heading = root.querySelector(".add-event-heading");
if (heading) {
heading.innerHTML = isReminder ? "&#128276; New Reminder" : "&#10133; New Event";
}
this._setAddEventError("");
// Reminders live on a fixed to-do entity (reminders_entity) that has to
// already exist in Home Assistant - unlike calendars, nothing creates it
// automatically. If it's missing, "Save" would silently do nothing (Home
// Assistant just logs a warning and skips the service call rather than
// throwing), so warn up front instead of leaving the user to figure out
// why nothing showed up.
const warn = root.querySelector(".add-event-reminder-missing-warn");
if (warn) {
const entityId = this._config.reminders_entity;
const missing = isReminder && this._hass && entityId && !this._hass.states[entityId];
if (missing) {
warn.textContent = `⚠️ "${entityId}" doesn't exist in Home Assistant yet, so reminders can't be saved until it does. Create a to-do list with that entity id (Settings → Devices & Services → Add Integration → Local To-do), or point this card's reminders_entity config at a to-do list you already have.`;
warn.style.display = "";
} else {
warn.style.display = "none";
}
}
}
_setAddEventError(message) {
const box = this._root && this._root.querySelector(".add-event-error");
if (!box) return;
if (message) {
box.textContent = message;
box.style.display = "";
} else {
box.textContent = "";
box.style.display = "none";
}
}
_closeAddEvent() {
this._root.querySelector(".add-event-overlay").classList.remove("open");
this._setAddEventError("");
}
_updateAddEventFieldVisibility(allDay) {
const field = this._root.querySelector(".add-event-time-field");
if (field) field.style.display = allDay ? "none" : "";
const remindField = this._root.querySelector(".add-event-remind-field");
if (remindField) {
remindField.style.display = allDay ? "none" : "";
if (allDay) {
this._root.querySelectorAll(".remind-check").forEach((cb) => {
cb.checked = false;
});
}
}
}
_isReminderEvent(description) {
// Standalone reminders (from the Add Event modal's Reminder tab) are
// still plain calendar events under the hood - this marker is what tells
// them apart from a normal calendar event for display/filtering/notify
// purposes.
return /<!--type:reminder-->/.test(description || "");
}
_parseReminderMarker(description) {
const desc = description || "";
const isReminder = this._isReminderEvent(desc);
const withoutType = desc.replace(/\n*<!--type:reminder-->\s*/, "").trim();
// Supports both the current comma-separated form (<!--reminder:10,30-->)
// and the original single-value form from before multiple reminders per
// event were supported (<!--reminder:15-->) - old saved events keep working.
const match = withoutType.match(/<!--reminder:([\d,]+)-->/);
if (!match) return { minutesList: [], clean: withoutType, isReminder };
const minutesList = match[1]
.split(",")
.map((n) => parseInt(n, 10))
.filter((n) => Number.isFinite(n) && n > 0)
.sort((a, b) => a - b);
const clean = withoutType.replace(/\n*<!--reminder:[\d,]+-->\s*/, "").trim();
return { minutesList, clean, isReminder };
}
// A standalone reminder (to-do item) can opt into "roll over to the next
// day if not completed" - rather than a separate storage field, this is
// just a marker appended to the item's own description, right alongside
// whatever notes were typed, so it travels with the item if it's ever
// renamed or rescheduled directly in Home Assistant's own To-do UI. The
// server-side poller looks for the same marker and, once a due reminder
// fires, bumps its due_datetime forward by a day as long as it's still
// needs_action - so it keeps coming due, once a day, until marked done.
_parseReminderRollover(description) {
const desc = description || "";
const rollover = /<!--rollover:1-->/.test(desc);
const clean = desc.replace(/\n*<!--rollover:1-->\s*/, "").trim();
return { description: clean, rollover };
}
_buildReminderDescription(description, rollover) {
const base = (description || "").trim();
if (!rollover) return base;
return base ? `${base}\n\n<!--rollover:1-->` : "<!--rollover:1-->";
}
_formatReminderMinutes(minutes) {
if (minutes % 1440 === 0) {
const days = minutes / 1440;
return `${days} day${days > 1 ? "s" : ""}`;
}
if (minutes % 60 === 0) {
const hours = minutes / 60;
return `${hours} hour${hours > 1 ? "s" : ""}`;
}
return `${minutes} minutes`;
}
_formatReminderLabel(minutesList) {
const list = Array.isArray(minutesList) ? minutesList : [minutesList];
if (!list.length) return "";
return `${list.map((m) => this._formatReminderMinutes(m)).join(" & ")} before`;
}
async _saveAddEvent() {
if (this._addEventActiveTab === "reminder") {
await this._saveAddReminder();
return;
}
const root = this._root;
this._setAddEventError("");
const entity = root.querySelector(".add-event-calendar-select").value;
const title = root.querySelector(".add-event-title").value.trim();
if (!entity || !title) return;
if (this._hass && !this._hass.states[entity]) {
this._setAddEventError(`⚠️ "${entity}" doesn't exist in Home Assistant. Check the calendars configured under Settings.`);
return;
}
const allDayBtn = root.querySelector(".add-event-allday-btn.active");
const allDay = allDayBtn ? allDayBtn.dataset.value === "on" : false;
const dateVal = root.querySelector(".add-event-date").value;
if (!dateVal) return;
const location = root.querySelector(".add-event-location").value.trim();
let description = root.querySelector(".add-event-description").value.trim();
const remindMinutesList = allDay
? []
: Array.from(root.querySelectorAll(".remind-check:checked"))
.map((cb) => parseInt(cb.value, 10))
.filter((n) => Number.isFinite(n) && n > 0)
.sort((a, b) => a - b);
if (remindMinutesList.length) {
const marker = `<!--reminder:${remindMinutesList.join(",")}-->`;
description = description ? `${description}\n\n${marker}` : marker;
}
const data = { summary: title };
if (location) data.location = location;
if (description) data.description = description;
if (allDay) {
const start = new Date(dateVal + "T00:00:00");
const end = new Date(start);
end.setDate(end.getDate() + 1);
data.start_date = dateVal;
data.end_date = this._dateKey(end);
} else {
const startTime = root.querySelector(".add-event-start-time").value || "09:00";
let endTime = root.querySelector(".add-event-end-time").value || "10:00";
if (endTime <= startTime) {
const [h, m] = startTime.split(":").map((n) => parseInt(n, 10));
const endDate = new Date();
endDate.setHours(h + 1, m, 0, 0);
endTime = `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;
}
data.start_date_time = `${dateVal} ${startTime}:00`;
data.end_date_time = `${dateVal} ${endTime}:00`;
}
try {
await this._hass.callService("calendar", "create_event", data, { entity_id: entity });
} catch (e) {
this._setAddEventError(`⚠️ Couldn't save this event: ${e && e.message ? e.message : e}`);
return;
}
this._closeAddEvent();
this._fetchEvents();
}
// Standalone reminders are items on a Home Assistant to-do list
// (reminders_entity), not events on any calendar - so they can be marked
// done, edited, or rescheduled directly in Home Assistant's own To-do UI
// (or the "Mark done" button in the event-info popup) without touching
// Google Calendar or whatever the "real" calendars are backed by. A bell
// icon and dashed style set them apart in the grid, they're filterable via
// the legend's Events/Reminders chips, there's no "remind me N minutes
// before" picker (they simply fire once, at their own due time), and
// they're routed to the dedicated Reminders notify devices set in Settings.
async _saveAddReminder() {
const root = this._root;
this._setAddEventError("");
const title = root.querySelector(".add-event-title").value.trim();
if (!title) return;
const dateVal = root.querySelector(".add-event-reminder-date").value;
if (!dateVal) return;
const entityId = this._config.reminders_entity;
// Home Assistant doesn't reject a service call targeting a nonexistent
// entity_id with an error - it just logs a warning and skips the call, so
// the promise below resolves normally either way. Without this check,
// that looked exactly like "click Save, modal closes, nothing happened."
if (this._hass && entityId && !this._hass.states[entityId]) {
this._setAddEventError(`⚠️ "${entityId}" doesn't exist in Home Assistant, so this reminder wasn't saved. Create a to-do list with that entity id (Settings → Devices & Services → Add Integration → Local To-do), or point this card's reminders_entity config at a to-do list you already have.`);
return;
}
const notifyTime = root.querySelector(".add-event-reminder-time").value || "09:00";
const description = root.querySelector(".add-event-description").value.trim();
const rollover = root.querySelector(".add-event-reminder-rollover").checked;
const fullDescription = this._buildReminderDescription(description, rollover);
const data = {
item: title,
due_datetime: `${dateVal}T${notifyTime}:00`,
};
if (fullDescription) data.description = fullDescription;
try {
await this._hass.callService("todo", "add_item", data, { entity_id: entityId });
} catch (e) {
this._setAddEventError(`⚠️ Couldn't save this reminder: ${e && e.message ? e.message : e}`);
return;
}
this._closeAddEvent();
this._fetchReminders();
}
_renderLegend() {
if (!this._root || !this._hass) return;
const legend = this._root.querySelector(".legend");
const people = this._getPeople();
if (!people.length) {
legend.innerHTML = `<button type="button" class="empty-people-hint">No Calendar Configured</button>`;
const hintBtn = legend.querySelector(".empty-people-hint");
if (hintBtn) hintBtn.addEventListener("click", () => this._openSettings());
return;
}
const order = [];
const groups = {};
for (const p of people) {
const key = (p.name || p.entity || "").trim().toLowerCase();
if (!groups[key]) {
groups[key] = { name: p.name, color: p.color, count: 0 };
order.push(key);
}
groups[key].count += (this._events[p.entity] || []).length;
}
const activeKeys = this._legendFilterKeys || [];
// Reminders live on their own to-do list (this._reminders), not mixed into
// this._events - so unlike eventCount, reminderCount doesn't need to scan
// calendar event descriptions.
let eventCount = 0;
for (const evs of Object.values(this._events || {})) {
eventCount += (evs || []).length;
}
const reminderCount = (this._reminders || []).length;
const typeFilter = this._eventTypeFilter || [];
const identityChipsHtml = order
.map((key) => {
const g = groups[key];
const initial = (g.name || "?").trim().charAt(0).toUpperCase();
const isActive = activeKeys.includes(key);
const isDimmed = activeKeys.length > 0 && !isActive;
return `<div class="chip${isActive ? " active-filter" : ""}${isDimmed ? " dimmed" : ""}" data-key="${key}" style="background:${g.color}"><span class="avatar">${initial}</span>${g.name} ${g.count}</div>`;
})
.join("");
// Separate from the per-calendar chips above (which filter by WHICH
// calendar), these two filter by WHAT KIND of thing it is - lets someone
// isolate just calendar events or just reminders on the grid, regardless
// of which calendar either lives on.
const typeChipsHtml = [
{ type: "event", label: "&#128197; Events", count: eventCount },
{ type: "reminder", label: "&#128276; Reminders", count: reminderCount },
]
.map(({ type, label, count }) => {
const isActive = typeFilter.includes(type);
const isDimmed = typeFilter.length > 0 && !isActive;
return `<div class="chip type-chip${isActive ? " active-filter" : ""}${isDimmed ? " dimmed" : ""}" data-type="${type}">${label} ${count}</div>`;
})
.join("");
legend.innerHTML = identityChipsHtml + typeChipsHtml;
legend.querySelectorAll(".chip:not(.type-chip)").forEach((chip) => {
chip.addEventListener("click", () => {
const key = chip.dataset.key;
const idx = this._legendFilterKeys.indexOf(key);
if (idx === -1) this._legendFilterKeys.push(key);
else this._legendFilterKeys.splice(idx, 1);
this._renderGrid();
this._renderLegend();
});
});
legend.querySelectorAll(".type-chip").forEach((chip) => {
chip.addEventListener("click", () => {
const type = chip.dataset.type;
const idx = this._eventTypeFilter.indexOf(type);
if (idx === -1) this._eventTypeFilter.push(type);
else this._eventTypeFilter.splice(idx, 1);
this._renderGrid();
this._renderLegend();
});
});
}
_renderGrid() {
if (!this._root) return;
this._applySizeVars();
this._eventDetails = {};
if (this._viewMode === "month") {
this._renderMonthGrid();
} else {
this._renderWeekGrid();
}
}
_renderMonthGrid() {
const gridEl = this._root.querySelector(".grid");
gridEl.className = "grid mode-month";
const { gridStart, anchor } = this._monthGridRange();
const today = new Date();
today.setHours(0, 0, 0, 0);
const monthIndex = anchor.getMonth();
const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const settings = this._getSettings();
const people = this._getPeople();
const colorMap = this._colorByName(people);
const filterKeys = this._legendFilterKeys || [];
const eventPeople = filterKeys.length ? people.filter((p) => filterKeys.includes((p.name || p.entity || "").trim().toLowerCase())) : people;
let cellsHtml = "";
for (let i = 0; i < 42; i++) {
const cellDate = new Date(gridStart);
cellDate.setDate(gridStart.getDate() + i);
const dateKey = this._dateKey(cellDate);
const isToday = cellDate.getTime() === today.getTime();
const outside = cellDate.getMonth() !== monthIndex;
const dayStart = cellDate;
const dayEnd = new Date(cellDate);
dayEnd.setDate(dayStart.getDate() + 1);
let dayEvents = [];
let hasBirthday = false;
let badges = [];
for (const person of people) {
const personBadges = person.badges || [];
if (!personBadges.length) continue;
const evs = this._events[person.entity] || [];
const personColor = this._colorFor(person, colorMap);
for (const ev of evs) {
const evStart = this._toDate(ev.start);
const evEnd = this._toDate(ev.end) || evStart;
if (!evStart) continue;
if (evEnd > dayStart && evStart < dayEnd) {
const summaryLower = (ev.summary || "").toLowerCase();
const hideMatched = personBadges.some((b) => {
const hideMatch = (b.hideMatch || "").trim().toLowerCase();
return hideMatch && summaryLower.includes(hideMatch);
});
if (hideMatched) {
continue;
}
for (const b of personBadges) {
const badgeMatch = (b.match || "").trim().toLowerCase();
if (badgeMatch && summaryLower.includes(badgeMatch) && b.text) {
badges.push({ text: b.text, color: personColor });
}
}
}
}
}
for (const person of eventPeople) {
const evs = this._events[person.entity] || [];
const personIsBirthdays = person.entity === this._config.birthdays_entity;
const personBadges = person.badges || [];
const personColor = this._colorFor(person, colorMap);
for (const ev of evs) {
const evStart = this._toDate(ev.start);
const evEnd = this._toDate(ev.end) || evStart;
if (!evStart) continue;
if (evEnd > dayStart && evStart < dayEnd) {
const summaryLower = (ev.summary || "").toLowerCase();
const hideMatched = personBadges.some((b) => {
const hideMatch = (b.hideMatch || "").trim().toLowerCase();
return hideMatch && summaryLower.includes(hideMatch);
});
if (hideMatched) {
continue;
}
let matchedBadge = false;
for (const b of personBadges) {
const badgeMatch = (b.match || "").trim().toLowerCase();
if (badgeMatch && summaryLower.includes(badgeMatch)) {
matchedBadge = true;
}
}
if (matchedBadge) continue;
const isReminder = this._isReminderEvent(ev.description);
const typeFilter = this._eventTypeFilter || [];
if (typeFilter.length && !typeFilter.includes(isReminder ? "reminder" : "event")) continue;
if (personIsBirthdays) hasBirthday = true;
dayEvents.push({ summary: ev.summary || "(untitled)", color: personColor, isReminder });
}
}
}
{
const typeFilter = this._eventTypeFilter || [];
if (!typeFilter.length || typeFilter.includes("reminder")) {
for (const r of this._reminders || []) {
if (r.due >= dayStart && r.due < dayEnd) {
dayEvents.push({ summary: r.summary, color: REMINDER_COLOR, isReminder: true });
}
}
}
}
const shown = dayEvents.slice(0, 3);
const more = dayEvents.length - shown.length;
let pillsHtml =
shown
.map(
(e) =>
`<div class="mc-pill${e.isReminder ? " mc-reminder-pill" : ""}" style="background:${e.color}">${e.isReminder ? "&#128276; " : ""}${e.summary}</div>`
)
.join("") + (more > 0 ? `<div class="mc-more">+${more} more</div>` : "");
if (settings.showMealsInMonth) {
const dayBlocks = this._getBlocksForDay(cellDate.getDay());
pillsHtml += dayBlocks
.map((blockName, bi) => {
const m = this._getMealForDay(dateKey, cellDate, bi);
if (!m || !m.name || !m.name.trim()) return "";
const repeatIcon = m.recur === "weekly" ? "\u{1F501} " : "";
return `<div class="mc-pill mc-meal-pill" style="background:${m.color || "#f0e6c4"}" data-date="${dateKey}" data-block-index="${bi}">\u{1F37D}\u{FE0F} ${repeatIcon}${m.name}</div>`;
})
.join("");
}
const badgesHtml = badges
.map((b) => `<span class="custody-badge" style="background:${b.color};color:${this._textColorFor(b.color)}">${b.text}</span>`)
.join("");
cellsHtml += `<div class="month-cell ${isToday ? "today" : ""} ${outside ? "outside" : ""}" data-date="${dateKey}">
<div class="mc-date">${cellDate.getDate()}${hasBirthday ? " \u{1F382}" : ""}${badgesHtml}</div>
<div class="mc-events">${pillsHtml}</div>
</div>`;
}
gridEl.innerHTML = `<div class="month-weekday-row">${dayNames.map((d) => `<div class="mwd">${d}</div>`).join("")}</div><div class="month-cells">${cellsHtml}</div>`;
}
_renderWeekGrid() {
const gridEl = this._root.querySelector(".grid");
gridEl.className = "grid mode-week";
const start = this._weekStart();
const today = new Date();
today.setHours(0, 0, 0, 0);
const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const settings = this._getSettings();
const people = this._getPeople();
const colorMap = this._colorByName(people);
const filterKeys = this._legendFilterKeys || [];
const eventPeople = filterKeys.length ? people.filter((p) => filterKeys.includes((p.name || p.entity || "").trim().toLowerCase())) : people;
const PX_PER_HOUR = 40;
const rangeStart = settings.timelineStartHour;
const rangeEnd = settings.timelineEndHour;
const rangeStartMin = rangeStart * 60;
const rangeEndMin = rangeEnd >= 24 ? 1440 : (rangeEnd + 1) * 60;
let html = "";
for (let i = 0; i < 7; i++) {
const dayStart = new Date(start);
dayStart.setDate(start.getDate() + i);
const dayEnd = new Date(dayStart);
dayEnd.setDate(dayStart.getDate() + 1);
const isToday = dayStart.getTime() === today.getTime();
const dateKey = this._dateKey(dayStart);
const blocks = this._getBlocksForDay(i);
const forecast = this._forecast ? this._forecast[dateKey] : null;
const wxIconHtml = forecast
? `<span class="wx-icon" title="${(forecast.condition || "").replace(/-/g, " ")}">${this._wxIcon(forecast.condition)}</span>`
: "";
const wxTempHtml =
forecast && forecast.high != null
? `<span class="wx-temp">${Math.round(forecast.high)}°${forecast.low != null ? `/${Math.round(forecast.low)}°` : ""}</span>`
: "";
let bannersHtml = "";
blocks.forEach((blockName, blockIndex) => {
const plan = this._getMealForDay(dateKey, dayStart, blockIndex);
const hasName = plan && plan.name && plan.name.trim();
const recipe = hasName ? this._recipes.find((r) => r.name.toLowerCase() === plan.name.trim().toLowerCase()) : null;
const flagChar = recipe && recipe.rating === "up" ? "❤️" : recipe && recipe.rating === "down" ? "\u{1F44E}" : "";
const bannerColor = hasName ? plan.color || "#f0e6c4" : null;
const bannerTextColor = bannerColor ? this._textColorFor(bannerColor) : null;
const bannerStyle = bannerColor ? ` style="background:${bannerColor};color:${bannerTextColor}"` : "";
const editClass = this._mealEditMode ? " edit-mode" : "";
const recurClass = plan && plan.recur === "weekly" ? " recurring-meal" : "";
const recurIcon = plan && plan.recur === "weekly" ? "\u{1F501} " : "";
bannersHtml += `
<div class="menu-banner ${hasName ? "" : "empty"}${editClass}${recurClass}" data-day-index="${i}" data-block-index="${blockIndex}"${bannerStyle}>
${flagChar ? `<span class="rating-flag">${flagChar}</span>` : ""}
<span class="block-label">${blockName}</span>
<span class="menu-text">${hasName ? `${recurIcon}${plan.name}` : `Tap to add ${blockName.toLowerCase()}`}</span>
</div>
`;
});
let dayEvents = [];
let badges = [];
const typeFilter = this._eventTypeFilter || [];
for (const person of people) {
const personBadges = person.badges || [];
if (!personBadges.length) continue;
const evs = this._events[person.entity] || [];
const personColor = this._colorFor(person, colorMap);
for (const ev of evs) {
const evStart = this._toDate(ev.start);
const evEnd = this._toDate(ev.end) || evStart;
if (!evStart) continue;
if (evEnd > dayStart && evStart < dayEnd) {
const summaryLower = (ev.summary || "").toLowerCase();
const hideMatched = personBadges.some((b) => {
const hideMatch = (b.hideMatch || "").trim().toLowerCase();
return hideMatch && summaryLower.includes(hideMatch);
});
if (hideMatched) {
continue;
}
for (const b of personBadges) {
const badgeMatch = (b.match || "").trim().toLowerCase();
if (badgeMatch && summaryLower.includes(badgeMatch) && b.text) {
badges.push({ text: b.text, color: personColor });
}
}
}
}
}
for (const person of eventPeople) {
const evs = this._events[person.entity] || [];
const personBadges = person.badges || [];
const personColor = this._colorFor(person, colorMap);
for (const ev of evs) {
const evStart = this._toDate(ev.start);
const evEnd = this._toDate(ev.end) || evStart;
if (!evStart) continue;
if (evEnd > dayStart && evStart < dayEnd) {
const summaryLower = (ev.summary || "").toLowerCase();
const hideMatched = personBadges.some((b) => {
const hideMatch = (b.hideMatch || "").trim().toLowerCase();
return hideMatch && summaryLower.includes(hideMatch);
});
if (hideMatched) {
continue;
}
let matchedBadge = false;
for (const b of personBadges) {
const badgeMatch = (b.match || "").trim().toLowerCase();
if (badgeMatch && summaryLower.includes(badgeMatch)) {
matchedBadge = true;
}
}
if (matchedBadge) continue;
const reminderInfo = this._parseReminderMarker(ev.description);
const typeFilter = this._eventTypeFilter || [];
if (typeFilter.length && !typeFilter.includes(reminderInfo.isReminder ? "reminder" : "event")) continue;
const eventId = `ev-${i}-${dayEvents.length}-${person.entity}`;
const evColor = personColor;
this._eventDetails[eventId] = {
summary: ev.summary || "(untitled)",
start: evStart,
end: evEnd,
allDay: this._isAllDay(ev),
color: evColor,
personName: person.name,
calendarEntity: person.entity,
description: reminderInfo.clean,
reminderMinutesList: reminderInfo.minutesList,
isReminder: reminderInfo.isReminder,
location: ev.location || "",
};
dayEvents.push({
id: eventId,
summary: ev.summary || "(untitled)",
start: evStart,
end: evEnd,
allDay: this._isAllDay(ev),
color: evColor,
initial: (person.name || "?").trim().charAt(0).toUpperCase(),
isReminder: reminderInfo.isReminder,
});
}
}
}
if (!typeFilter.length || typeFilter.includes("reminder")) {
for (const r of this._reminders || []) {
if (r.due >= dayStart && r.due < dayEnd) {
const reminderId = `rem-${i}-${dayEvents.length}-${r.uid}`;
this._eventDetails[reminderId] = {
summary: r.summary,
start: r.due,
end: new Date(r.due.getTime() + 60000),
allDay: false,
color: REMINDER_COLOR,
personName: "Reminder",
calendarEntity: this._config.reminders_entity,
description: r.description || "",
reminderMinutesList: [],
isReminder: true,
todoUid: r.uid,
rollover: !!r.rollover,
location: "",
};
dayEvents.push({
id: reminderId,
summary: r.summary,
start: r.due,
end: new Date(r.due.getTime() + 60000),
allDay: false,
color: REMINDER_COLOR,
initial: "\u{1F514}",
isReminder: true,
});
}
}
}
dayEvents.sort((a, b) => (a.allDay === b.allDay ? a.start - b.start : a.allDay ? -1 : 1));
let eventsHtml;
if (this._getShowTimeline()) {
const allDay = dayEvents.filter((e) => e.allDay);
const timed = dayEvents.filter((e) => !e.allDay);
const allDayHtml = allDay.length
? `<div class="all-day-row">${allDay
.map((ev) => `<span class="all-day-chip" style="background:${ev.color}" data-event-id="${ev.id}">${ev.summary}</span>`)
.join("")}</div>`
: "";
let hourRowsHtml = "";
for (let h = rangeStart; h <= Math.min(rangeEnd, 23); h++) {
const top = (h - rangeStart) * PX_PER_HOUR;
hourRowsHtml += `<div class="hour-row" style="top:${top}px;height:${PX_PER_HOUR}px"><span class="hour-label">${this._fmtHour12(h)}</span></div>`;
}
const laidOut = this._layoutTimedEvents(timed);
const tlEventsHtml = laidOut
.map(({ ev, col, totalCols }) => {
const clippedStartMs = Math.max(ev.start.getTime(), dayStart.getTime());
const clippedEndMs = Math.min(ev.end.getTime(), dayEnd.getTime());
let startMinutes = Math.round((clippedStartMs - dayStart.getTime()) / 60000);
let endMinutes = Math.round((clippedEndMs - dayStart.getTime()) / 60000);
startMinutes = Math.max(rangeStartMin, Math.min(startMinutes, rangeEndMin));
endMinutes = Math.max(rangeStartMin, Math.min(endMinutes, rangeEndMin));
if (endMinutes <= startMinutes) endMinutes = Math.min(rangeEndMin, startMinutes + 30);
const top = ((startMinutes - rangeStartMin) / 60) * PX_PER_HOUR;
const height = Math.max(16, ((endMinutes - startMinutes) / 60) * PX_PER_HOUR);
const timeLabel = ev.start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const left = `calc(32px + (100% - 34px) * ${col} / ${totalCols})`;
const width = `calc((100% - 34px) / ${totalCols} - 2px)`;
return `<div class="tl-event${ev.isReminder ? " reminder-event" : ""}" style="top:${top}px;height:${height}px;left:${left};width:${width};background:${ev.color}" data-event-id="${ev.id}">
<span class="tl-time">${timeLabel}</span>
<span class="tl-summary">${ev.isReminder ? "&#128276; " : ""}${ev.summary}</span>
</div>`;
})
.join("");
eventsHtml = `${allDayHtml}<div class="timeline" style="height:${((rangeEndMin - rangeStartMin) / 60) * PX_PER_HOUR}px">${hourRowsHtml}${tlEventsHtml}</div>`;
} else {
eventsHtml = dayEvents
.map((ev) => {
const timeLabel = ev.allDay
? "All day"
: ev.start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
return `<div class="event${ev.isReminder ? " reminder-event" : ""}" style="background:${ev.color}" data-event-id="${ev.id}">
<div class="event-top">
<span class="avatar" style="background:rgba(0,0,0,0.3)">${ev.isReminder ? "&#128276;" : ev.initial}</span>
<span class="time">${timeLabel}</span>
</div>
<span class="summary">${ev.isReminder ? "&#128276; " : ""}${ev.summary}</span>
</div>`;
})
.join("");
}
html += `
<div class="day-col ${isToday ? "today" : ""}">
<div class="day-header">
<div class="name-row"><div class="name">${dayNames[i]}</div>${wxIconHtml}</div>
<div class="num">${dayStart.getDate()}${badges
.map((b) => `<span class="custody-badge" style="background:${b.color};color:${this._textColorFor(b.color)}">${b.text}</span>`)
.join("")}${wxTempHtml}</div>
</div>
<div class="menu-blocks">${bannersHtml}</div>
<div class="events">${eventsHtml}</div>
</div>
`;
}
gridEl.innerHTML = html;
if (this._getShowTimeline()) {
const now = new Date();
this._root.querySelectorAll(".day-col").forEach((col) => {
const evEl = col.querySelector(".events");
if (!evEl) return;
const isToday = col.classList.contains("today");
const nowHour = now.getHours();
const targetHour = isToday ? Math.max(rangeStart, Math.min(rangeEnd, nowHour - 1)) : rangeStart;
evEl.scrollTop = (targetHour - rangeStart) * PX_PER_HOUR;
});
}
if (this._mealEditMode) {
this._attachMealDragHandlers();
}
}
_attachMealDragHandlers() {
const root = this._root;
const banners = root.querySelectorAll(".menu-banner.edit-mode:not(.empty)");
banners.forEach((banner) => {
banner.addEventListener("pointerdown", (e) => this._startMealDrag(e, banner));
});
}
_startMealDrag(e, banner) {
if (e.button !== undefined && e.button !== 0) return;
e.preventDefault();
const root = this._root;
const fromDayIndex = parseInt(banner.dataset.dayIndex, 10);
const fromBlockIndex = parseInt(banner.dataset.blockIndex, 10);
const rect = banner.getBoundingClientRect();
const ghost = banner.cloneNode(true);
ghost.classList.add("meal-drag-ghost");
ghost.classList.remove("edit-mode");
ghost.style.width = `${rect.width}px`;
ghost.style.height = `${rect.height}px`;
ghost.style.left = `${rect.left}px`;
ghost.style.top = `${rect.top}px`;
ghost.style.margin = "0";
root.appendChild(ghost);
banner.classList.add("dragging-source");
const offsetX = e.clientX - rect.left;
const offsetY = e.clientY - rect.top;
let currentTarget = null;
const onMove = (ev) => {
ghost.style.left = `${ev.clientX - offsetX}px`;
ghost.style.top = `${ev.clientY - offsetY}px`;
const under = root.elementFromPoint
? root.elementFromPoint(ev.clientX, ev.clientY)
: document.elementFromPoint(ev.clientX, ev.clientY);
const targetBanner = under && under.closest ? under.closest(".menu-banner") : null;
if (targetBanner !== currentTarget) {
if (currentTarget) currentTarget.classList.remove("drop-target");
currentTarget = targetBanner && targetBanner !== banner ? targetBanner : null;
if (currentTarget) currentTarget.classList.add("drop-target");
}
};
const onUp = () => {
window.removeEventListener("pointermove", onMove);
window.removeEventListener("pointerup", onUp);
window.removeEventListener("pointercancel", onUp);
ghost.remove();
banner.classList.remove("dragging-source");
if (currentTarget) {
currentTarget.classList.remove("drop-target");
const toDayIndex = parseInt(currentTarget.dataset.dayIndex, 10);
const toBlockIndex = parseInt(currentTarget.dataset.blockIndex, 10);
this._dragMoveMeal(fromDayIndex, fromBlockIndex, toDayIndex, toBlockIndex);
}
};
window.addEventListener("pointermove", onMove);
window.addEventListener("pointerup", onUp);
window.addEventListener("pointercancel", onUp);
}
async _dragMoveMeal(fromDayIndex, fromBlockIndex, toDayIndex, toBlockIndex) {
if (fromDayIndex === toDayIndex && fromBlockIndex === toBlockIndex) return;
const start = this._weekStart();
const fromDate = new Date(start);
fromDate.setDate(start.getDate() + fromDayIndex);
const toDate = new Date(start);
toDate.setDate(start.getDate() + toDayIndex);
await this._moveMealPlan(this._dateKey(fromDate), fromBlockIndex, this._dateKey(toDate), toBlockIndex);
}
}
if (!customElements.get("family-week-calendar-card")) {
customElements.define("family-week-calendar-card", FamilyWeekCalendarCard);
}
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "family-week-calendar-card")) {
window.customCards.push({
type: "family-week-calendar-card",
name: "Family Week Calendar",
description: "Dragon-Touch-style weekly family calendar with date-specific meal planning, phone-friendly layout, and a recipe box",
});
}
