(function () {
  if (window.__familyCalendarFontLoaded) return;
  window.__familyCalendarFontLoaded = true;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Varela+Round&display=swap";
  document.head.appendChild(link);
})();

// A fixed accent color for reminder rows - reminders aren't tied to any
// one calendar (and so have no calendar color of their own), but still
// need to look consistent wherever they show up. Matches the same
// constant in family-week-calendar-card.js so the two cards agree.
const TODAY_REMINDER_COLOR = "#b58cd9";

// v1.132.65+: the 7 Mon-Sun day-toggle buttons used by the new Add Event
// modal's reminder rollover-days picker - identical list to family-week-
// calendar-card.js's own REMINDER_WEEKDAY_LABELS, kept as its own copy
// since these are independently-loaded Lovelace resources, not ES modules
// (see this file's own window.__familyHubTimerAlarm comment just below for
// the same reasoning applied to a different shared piece of logic).
const REMINDER_WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// A small, single-day companion to the full Family Week Calendar card -
// meant to be pasted onto any dashboard (a phone's default view, a small
// tile next to other cards, etc.) to see just "what's going on today"
// without the week/month grid. Reads the exact same config + settings_entity
// as the full card, so it automatically matches its theme, calendars, meal
// blocks, and entities - there is nothing new to configure if you're
// already running the full card.
// Household-wide timer alarm sound+modal (v1.119.0+, widened in
// v1.132.55+) - see family-hub-active-timers-card.js's own top comment
// above this same block for the full design note. Added here in
// v1.132.59+ after a household bug report, verbatim: "a household
// alarm or an assigned alarm set to them plus kiosk doesnt alarm on the
// kiosk" - this card never carried this singleton or subscribed to
// the widened-alarm broadcast at all, so a kiosk whose dashboard shows
// it silently never rang for anyone else's widened timer alarm. Kept
// byte-identical to every other card's copy on purpose.
if (!window.__familyHubTimerAlarm) {
  window.__familyHubTimerAlarm = (function () {
    let modalEl = null;
    let audioCtx = null;
    let beepHandle = null;
    let activeUid = null;
    // A timer's uid, once dismissed, stays dismissed - otherwise the very
    // next poll's countdown tick (still <= 0 for a few more seconds until
    // the backend's own sweep, up to TIMER_SWEEP_SECONDS later, actually
    // removes it from family_hub/timers/list) would immediately re-open
    // the modal a person just tapped Stop on. Unbounded but negligible: a
    // few bytes per timer this ONE tab ever alarmed for in its lifetime.
    const dismissedUids = new Set();
    function ensureModal() {
      if (modalEl) return modalEl;
      modalEl = document.createElement("div");
      modalEl.id = "family-hub-timer-alarm-overlay";
      Object.assign(modalEl.style, {
        position: "fixed", inset: "0", zIndex: "2147483647", display: "none",
        alignItems: "center", justifyContent: "center",
        background: "rgba(20,16,8,0.78)",
      });
      modalEl.innerHTML =
        '<div style="background:#fff8ea;color:#3a352c;border-radius:22px;padding:38px 30px;max-width:360px;width:88vw;text-align:center;box-shadow:0 14px 46px rgba(0,0,0,0.45);font-family:-apple-system,\'Segoe UI\',Roboto,sans-serif;">' +
        '<div style="font-size:48px;margin-bottom:12px;">&#9200;</div>' +
        '<div class="fh-timer-alarm-title" style="font-size:1.3em;font-weight:800;margin-bottom:6px;"></div>' +
        '<div style="font-size:14px;color:#96877a;margin-bottom:24px;">Time\'s up!</div>' +
        '<button type="button" class="fh-timer-alarm-stop" style="min-height:54px;width:100%;border:none;border-radius:14px;background:#8f5a00;color:#fff8ea;font-size:19px;font-weight:800;cursor:pointer;">Stop</button>' +
        "</div>";
      document.body.appendChild(modalEl);
      modalEl.querySelector(".fh-timer-alarm-stop").addEventListener("click", () => stop());
      return modalEl;
    }
    // A plain oscillator beep via the Web Audio API - deliberately not a
    // bundled sound file: no extra media asset for HACS/manual installs to
    // ship or for a self-hosted install's network policy to worry about,
    // and it sounds identical on every install.
    //
    // Household ask, verbatim: "can we make it sound more like an alarm
    // and less like a ticking bomb." The original v1.119.0+ sound was one
    // flat square-wave tone repeated once a second - metronomic, which is
    // exactly what read as a countdown-bomb tick rather than an alarm. This
    // plays a quick alternating two-pitch TRIPLET (a classic digital-alarm-
    // clock trill) each cycle instead of a single tone, which is what
    // actually reads as "alarm" to the ear - the alternating pitch is what
    // a lone repeated tone can't give you, no matter how loud.
    function playBeep(atTime, freq) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, atTime);
      gain.gain.exponentialRampToValueAtTime(0.3, atTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, atTime + 0.13);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(atTime);
      osc.stop(atTime + 0.15);
    }
    // Scheduled via Web Audio's own clock (osc.start(atTime)) rather than
    // three back-to-back setTimeout calls, so the triplet's timing stays
    // tight even if the main JS thread is briefly busy - it's the crisp,
    // even spacing that makes it read as a trill instead of a stutter.
    function beepOnce() {
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === "suspended") audioCtx.resume();
        const now = audioCtx.currentTime;
        [[0, 1046], [0.15, 1318], [0.3, 1046]].forEach(([offset, freq]) => playBeep(now + offset, freq));
      } catch (e) {
        // Autoplay blocked, or no Web Audio at all - the modal is still
        // the primary alarm; sound is a bonus on top of it, not required.
      }
    }
    // v1.132.55+: which hass connection to tell "dismiss this everywhere"
    // when Stop is tapped - set by whichever card most recently called
    // ring()/check() with one, since this singleton is shared across every
    // card on the dashboard and any of them may have `hass` by now. Best-
    // effort only (see stop() below): a same-tab-only local alarm (the
    // original v1.119.0+ behavior this singleton already had) never had a
    // server-side record to begin with, so the dismiss call below simply
    // no-ops for it (ws_dismiss_timer_alarm pops a uid that was never
    // registered - see its own docstring for why that's silent, not an
    // error).
    let lastHass = null;
    function stop() {
      if (activeUid) dismissedUids.add(activeUid);
      const uid = activeUid;
      activeUid = null;
      if (beepHandle) {
        clearInterval(beepHandle);
        beepHandle = null;
      }
      if (modalEl) modalEl.style.display = "none";
      // v1.132.55+: household's explicit choice - "first tap wins, from
      // anyone" - so tapping Stop here also clears the alarm everywhere
      // else (other kiosks, other people's phones-that-are-dashboards)
      // rather than just silencing this one tab. No permission gate, by
      // design.
      if (uid && lastHass && lastHass.connection && lastHass.connection.sendMessagePromise) {
        lastHass.connection.sendMessagePromise({ type: "family_hub/timers/dismiss_alarm", uid }).catch(() => {});
      }
    }
    // Household bug report, verbatim: "a household alarm or an assigned
    // alarm set to them plus kiosk doesnt alarm on the kiosk, it should end
    // the screen saver and pop up the timer ended modal and make noise."
    // This modal already outranks the screensaver's own overlay (z-index
    // 2147483647 vs 2147483000, set in ensureModal() above), so it was
    // always painting on top of it - but a screensaver left running
    // underneath still means its video/camera poll keeps going, and the
    // household asked for it to actually END, not just be covered up.
    // There are THREE independent screensaver implementations in this
    // project (the calendar card's own, the shared window.__familyHub
    // ScreenSaver controller used by Chores/Rewards/My Chores/etc., and the
    // standalone family-screensaver-card.js) and this singleton has no
    // reference to whichever one might be running on this particular
    // dashboard. Rather than importing all three, every one of them marks
    // its overlay element with the same data-family-hub-screensaver
    // attribute and already dismisses itself (hides, stops video/camera
    // polling, navigates to its configured return dashboard) on its own
    // overlay's "pointerdown" listener - so a synthetic pointerdown on
    // whichever overlay is actually showing reuses each implementation's
    // own real dismiss path for free, with zero coupling to which one it
    // is.
    function wakeAnyScreenSaver() {
      try {
        const overlay = document.querySelector("[data-family-hub-screensaver]");
        if (overlay && overlay.style.display !== "none") {
          overlay.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        }
      } catch (e) {
        // Best-effort - worst case the alarm modal still shows ON TOP of a
        // running screensaver rather than ending it outright.
      }
    }
    function start(timer, hass) {
      if (hass) lastHass = hass;
      if (activeUid === timer.uid) return;
      activeUid = timer.uid;
      wakeAnyScreenSaver();
      const el = ensureModal();
      el.querySelector(".fh-timer-alarm-title").textContent = timer.title || "Timer";
      el.style.display = "flex";
      beepOnce();
      if (beepHandle) clearInterval(beepHandle);
      // Shorter gap than the old single-tone version (1200ms) since each
      // cycle is now a ~450ms triplet, not a single ~340ms tone - this
      // keeps the alarm feeling urgent/continuous rather than sparse.
      beepHandle = setInterval(beepOnce, 950);
    }
    return {
      // Call once a second from a card's own countdown ticker (the same
      // tick that already repaints the visible "X:XX left" text), passing:
      //   timers        - that card's own freshly-fetched timers list
      //   clientId      - this tab's own id (see _familyHubClientId below)
      //   remainingSecondsFn - a (timer) => seconds function, so this
      //                   singleton reuses the CALLING card's own
      //                   native-timer-aware math (_timerRemainingSeconds)
      //                   instead of a second, potentially-drifting copy
      //                   of it living here with no access to `hass`.
      // Only a timer whose origin_client_id matches THIS tab's own id and
      // whose alarm flag is on can ever trigger anything - a timer someone
      // else started, or one this same tab started but didn't opt into
      // alarms for, is silently ignored here exactly as before this
      // feature existed.
      check(timers, clientId, remainingSecondsFn, hass) {
        if (!clientId) return;
        const mine = (timers || []).find((t) => t.alarm && t.origin_client_id && t.origin_client_id === clientId);
        if (!mine || dismissedUids.has(mine.uid)) return;
        if (remainingSecondsFn(mine) <= 0) start(mine, hass);
      },
      // v1.132.55+: the WIDENED half - a household_timer_alarm_ring bus
      // event (fired by chores_websocket_api.py's _dispatch_timer_alarm/
      // _reannounce_active_alarms) that THIS login should also ring for,
      // because it's either the timer's own owner, a login flagged as an
      // always-on alarm kiosk, or the tier was "everyone." Unlike check()
      // above (which only ever recognizes the ONE tab that started the
      // timer, by origin_client_id), this recognizes a login/account -
      // every open tab logged in as a matching user rings, on every
      // dashboard, which is the whole point of the widened tiers. Re-fired
      // on every re-announcement (see _reannounce_active_alarms), so
      // calling this again for an already-ringing uid is a deliberate
      // no-op (start() already short-circuits on activeUid === timer.uid).
      ringBroadcast(payload, hass, myUserId) {
        if (!payload || !payload.uid || dismissedUids.has(payload.uid)) return;
        const targets = payload.target_user_ids || [];
        const shouldRing = !!payload.broadcast_all || (myUserId && targets.includes(myUserId));
        if (!shouldRing) return;
        start({ uid: payload.uid, title: payload.title }, hass);
      },
      // The STOP half of the same broadcast pair - fired the instant
      // ANY device dismisses (see ws_dismiss_timer_alarm's own "first tap
      // wins" docstring), including a dismiss that originated from THIS
      // singleton's own stop() above (that call's own dismiss already
      // covers this tab; the event still arrives here a moment later and
      // is a harmless no-op via stop()'s own activeUid !== uid guard, or
      // via dismissedUids already containing it).
      stopFromServer(uid) {
        if (uid) dismissedUids.add(uid);
        if (activeUid === uid) stop();
      },
    };
  })();
}

// Theme flash-of-default fix (v1.126.0+) - household report, verbatim:
// "When you load a card it tends to load the default theme first then it
// switches over to the theme you set how can we always make it load the
// set theme first." Root cause: EVERY themed card's first paint happens
// with no theme CSS vars set at all (falls back to _defaultTheme()'s own
// hardcoded palette), because resolving the household's actual theme
// takes two sequential, awaited websocket round trips after `hass` is
// first set - family_hub/get_settings (_fetchSettings), THEN
// theme_builder/list (_fetchGlobalThemes, which is what a Global Theme
// selection actually needs to resolve into real colors) - both happening
// well after `_build()` has already rendered the card once. There was no
// way to know the real colors before those round trips finished.
//
// Fix: cache the last set of CSS var values this device actually applied
// (in memory for the rest of this page load, in localStorage across
// reloads), and apply that cache SYNCHRONOUSLY in `_build()` - before the
// very first paint, before any fetch has even started - so a reload shows
// last-known-good colors immediately instead of _defaultTheme()'s
// hardcoded ones. Once the real fetches resolve, `_applyThemeVars()` runs
// as it always has and reconciles - a no-op re-application (no visible
// change) if nothing changed since last time, which is the overwhelmingly
// common case on an ordinary refresh; a visible switch only when the
// household's theme has genuinely changed since this device last saw it,
// which is unavoidable (nothing can know about a change before asking).
//
// Same shared-singleton, "only the first card whose script actually runs
// this block sets it up" pattern as window.__familyHubFabCoordinator/
// __familyHubKioskSession/__familyHubScreenSaver/__familyHubTimerAlarm
// above - copy-pasted byte-identically into every themed card file, since
// these are independently-loaded Lovelace resources rather than ES
// modules that could import one shared file (same reasoning as those).
//
// Cached under a KEY, not one single blob, because different cards (or
// even the SAME card on a different dashboard placement) can legitimately
// resolve to different colors at once - a per-card-placement Theme
// override (`_config.theme_override`) or a per-device override
// (`_getDeviceThemeOverride()`) both exist specifically so one card can
// look different from the household's shared theme. Caching under one
// shared key would "fix" the flash for the common case but introduce a
// WRONG flash for an overridden card (briefly showing the household's
// theme before its own override kicks in) - a strictly worse bug than
// the one being fixed. The key is derived the same way every time
// (`_familyHubThemeCacheKey`, called identically from `_build()` before
// first paint and from `_applyThemeVars()` after resolving for real), so
// a card with no override at all shares one cache entry with every other
// un-overridden card/placement (the common case this exists for), while
// an overridden card/placement gets its own.
if (!window.__familyHubThemeCache) {
  window.__familyHubThemeCache = (function () {
    const STORAGE_PREFIX = "familyHubThemeVarsCache::";
    const memory = new Map(); // key -> {varName: value}

    function get(key) {
      if (memory.has(key)) return memory.get(key);
      try {
        const raw = localStorage.getItem(STORAGE_PREFIX + key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            memory.set(key, parsed);
            return parsed;
          }
        }
      } catch (e) {
        // Corrupt/blocked localStorage (private browsing, etc.) - just
        // means no cache to apply this time, same as a first-ever load.
      }
      return null;
    }
    function set(key, vars) {
      memory.set(key, vars);
      try {
        localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(vars));
      } catch (e) {
        // Best-effort only - the in-memory copy above still helps every
        // OTHER card mounted later in this same page load even if
        // localStorage itself is unavailable.
      }
    }
    return { get, set };
  })();
}

class FamilyTodayCard extends HTMLElement {
  // Lets the card be added via the dashboard's "+ Add Card" picker with
  // working defaults straight away - these match the entity ids the full
  // Family Week Calendar card's own Settings suggests/creates, so a family
  // already running the full card needs zero edits for the common case.
  static getStubConfig() {
    return {
      title: "Today",
      settings_entity: "todo.family_calendar_settings",
      meal_plan_entity: "todo.meal_plan",
      reminders_entity: "todo.family_reminders",
      weather_entity: "weather.forecast_home",
    };
  }
  // Uses Home Assistant's built-in schema-based form editor rather than a
  // hand-built custom editor element - this card's config is just a
  // handful of entity pickers plus a title, so the generic form covers the
  // common case with far less code to maintain. `people` is deliberately
  // left out of the form: in practice it's read from the shared
  // settings_entity's own Settings (see _getPeople) and only needs to be
  // set here directly for a rare standalone override, which is still fully
  // supported by hand-editing the YAML.
  // v1.111.0+: static getConfigForm can't offer a live-fetched theme list
  // (no hass in scope when it's called), so this card now provides its own
  // config editor element instead - see FamilyTodayCardEditor at the
  // bottom of this file, which renders the exact same fields (via the
  // shared statics below) plus the new theme_override field.
  static _configSchema() {
    return [
      { name: "title", selector: { text: {} } },
      { name: "settings_entity", selector: { entity: { domain: "todo" } } },
      { name: "meal_plan_entity", selector: { entity: { domain: "todo" } } },
      { name: "reminders_entity", selector: { entity: { domain: "todo" } } },
      { name: "weather_entity", selector: { entity: { domain: "weather" } } },
      { name: "calendar_dashboard_path", selector: { text: {} } },
      { name: "calendar_button_label", selector: { text: {} } },
      // v1.132.64+: household ask, verbatim - "I want to add another view
      // to Family today that is the same style as what the today area
      // looks like on month + day view." That's the Month Split view's
      // day-detail panel (family-week-calendar-card.js's own
      // _buildMonthSplitDetailHtml/.msd-* CSS) - a single scrolling list
      // mixing meals and events/reminders together by time, rather than
      // this card's own default three separate labeled sections. A select
      // rather than a boolean so a third layout could be added later
      // without a breaking config-shape change; "sectioned" is the
      // default so every existing dashboard using this card looks exactly
      // the same until a household opts in.
      { name: "layout", selector: { select: { mode: "dropdown", options: [
        { value: "sectioned", label: "Sectioned (Events / Meals / Reminders) - default" },
        { value: "compact", label: "Compact (Month view's Today panel style)" },
      ] } } },
      // v1.132.65+: household ask, verbatim - "Can we add another item to
      // the family today card. An option to have an add button. If turned
      // on it appears next to the go to calendar button, allows you to add
      // a reminder or calendar event, have it open the same modal as we
      // use in the current calendar card to add reminder or calendar
      // event." Off by default (like calendar_dashboard_path) so nothing
      // new appears on an existing dashboard until a household opts in.
      { name: "show_add_button", selector: { boolean: {} } },
    ];
  }
  static _computeLabel(schema) {
    const labels = {
      title: "Title",
      settings_entity: "Settings to-do list (shared with the full card)",
      meal_plan_entity: "Meal plan to-do list",
      reminders_entity: "Reminders to-do list",
      weather_entity: "Weather entity",
      calendar_dashboard_path: "Calendar dashboard path",
      calendar_button_label: "Calendar button label",
      theme_override: "Theme",
      layout: "Layout",
      show_add_button: "Show an Add button",
    };
    return labels[schema.name] || undefined;
  }
  static _computeHelper(schema) {
    if (schema.name === "settings_entity") {
      return "Same to-do entity configured on the full Family Week Calendar card - reused here so the theme, people, and meal blocks automatically match.";
    }
    if (schema.name === "calendar_dashboard_path") {
      return "Optional. Set a relative path (e.g. /lovelace-family/0) and a 'Go to Calendar' button appears at the bottom of the card, jumping straight to your full calendar dashboard/view.";
    }
    if (schema.name === "theme_override") {
      return "Pin this one card to a specific theme, or leave on \"Use device settings\" to follow the household's own Global Theme.";
    }
    if (schema.name === "layout") {
      return "Compact matches the single scrolling list style of the Month Split view's day panel (meals and events/reminders mixed together by time); Sectioned keeps today's three separate labeled lists.";
    }
    if (schema.name === "show_add_button") {
      return "Adds a button next to Go to Calendar that opens the same Add Event modal as the full calendar card, for adding a calendar event or a reminder without leaving this card.";
    }
    return undefined;
  }
  static getConfigElement() {
    return document.createElement("family-today-card-editor");
  }
  setConfig(config) {
    config = config || {};
    const palette = ["#a9c6c2", "#dba99c", "#d9bf7e", "#a8bd93", "#b9a7c9", "#cf8f6c", "#a89a83"];
    const rawPeople = Array.isArray(config.people) ? config.people : [];
    this._config = {
      title: config.title || "Today",
      people: rawPeople.map((p, i) => ({
        entity: p.entity,
        name: p.name || p.entity,
        color: p.color || palette[i % palette.length],
        badges: Array.isArray(p.badges) ? p.badges : [],
      })),
      meal_plan_entity: config.meal_plan_entity || "todo.meal_plan",
      reminders_entity: config.reminders_entity || "todo.family_reminders",
      settings_entity: config.settings_entity || "todo.family_calendar_settings",
      weather_entity: config.weather_entity || "weather.forecast_home",
      // Optional footer button that jumps straight to a full calendar
      // dashboard/view - blank by default so nothing new appears unless
      // explicitly configured. calendar_dashboard_path is a relative path
      // like "/lovelace-family/0" (see the full card's own README for the
      // dashboard/view path format).
      calendar_dashboard_path: (config.calendar_dashboard_path || "").toString().trim(),
      calendar_button_label: (config.calendar_button_label || "").toString().trim(),
      // Accepted (and ignored) so the exact same YAML block used for the
      // full family-week-calendar-card can be pasted in here unedited.
      recipe_entity: config.recipe_entity || "todo.recipe_box",
      meal_templates_entity: config.meal_templates_entity || "todo.meal_plan_templates",
      suggestions_entity: config.suggestions_entity || "todo.meal_suggestions",
      birthdays_entity: config.birthdays_entity || "calendar.birthdays",
      // v1.111.0+: "" (default, untouched by every existing dashboard) =
      // "Use device settings" - falls straight through to the exact
      // pre-1.111.0 behavior (household Global Theme, else local). See
      // _resolveTheme below for where this takes priority.
      theme_override: typeof config.theme_override === "string" ? config.theme_override : "",
      // v1.132.64+: "sectioned" (this card's original, unchanged layout)
      // unless a household explicitly opted into "compact" - see
      // _configSchema's own comment on this field.
      layout: config.layout === "compact" ? "compact" : "sectioned",
      // v1.132.65+: household ask, verbatim - see _configSchema's own
      // comment on this field. false (untouched) means every existing
      // dashboard looks exactly the same until a household opts in.
      show_add_button: !!config.show_add_button,
    };
    if (this._settingsCache === undefined) this._settingsCache = null;
    if (this._globalThemes === undefined) this._globalThemes = [];
    if (this._todayEvents === undefined) this._todayEvents = [];
    if (this._todayBadges === undefined) this._todayBadges = [];
    if (this._todayMeals === undefined) this._todayMeals = [];
    if (this._todayReminders === undefined) this._todayReminders = [];
    if (this._forecastToday === undefined) this._forecastToday = null;
    if (this._mealPlanRaw === undefined) this._mealPlanRaw = {};
    if (this._recurringMeals === undefined) this._recurringMeals = [];
    if (this._firstLoadPromise === undefined) this._firstLoadPromise = null;
    if (!this._built) this._build();
    // v1.132.64+: a full _render() (not just _renderHeader()) so toggling
    // the new layout field live in the card editor's preview actually
    // re-paints the body immediately, using whatever today's data was
    // already fetched to - _render() itself is cheap and safe to call
    // again with unchanged data (every other setConfig-triggered field
    // change already relied on this being idempotent).
    this._render();
  }
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) {
      this._firstLoadPromise = this._initFirstLoad();
    }
  }
  async _initFirstLoad() {
    await this._fetchSettings();
    // v1.111.0+: always fetched now, not just when the household has
    // useGlobalTheme on - a per-card theme_override needs this list
    // regardless of the household's own Global Theme setting.
    await this._fetchGlobalThemes();
    this._refreshAll();
    this._startPolling();
    // Household bug report, verbatim: "a household alarm or an assigned
    // alarm set to them plus kiosk doesnt alarm on the kiosk" - see this
    // file's own copy of the window.__familyHubTimerAlarm singleton
    // (below) for the full design note. Kept byte-identical to every
    // other card's copy on purpose.
    this._subscribeAlarmEvents();
  }
  _myUserId() {
    return this._hass && this._hass.user ? this._hass.user.id : null;
  }
  // v1.132.59+: household-wide timer alarms - subscribe to the two bus
  // events chores_websocket_api.py's _dispatch_timer_alarm/
  // _reannounce_active_alarms fire (see const.py's
  // EVENT_FAMILY_HUB_TIMER_ALARM_RING/_STOP), and hand each one to the
  // shared window.__familyHubTimerAlarm singleton below - same "one modal/
  // audio loop shared by every card on the dashboard" convention its own
  // top comment describes. Subscribed once per card instance (guarded by
  // _alarmUnsub so a re-run of _initFirstLoad, which shouldn't happen but
  // costs nothing to guard against, never double-subscribes).
  async _subscribeAlarmEvents() {
    if (this._alarmUnsub || !this._hass || !this._hass.connection) return;
    const myUserId = this._myUserId();
    try {
      const unsubRing = await this._hass.connection.subscribeEvents((event) => {
        if (window.__familyHubTimerAlarm) {
          window.__familyHubTimerAlarm.ringBroadcast(event.data, this._hass, myUserId);
        }
      }, "family_hub_timer_alarm_ring");
      const unsubStop = await this._hass.connection.subscribeEvents((event) => {
        if (window.__familyHubTimerAlarm && event.data) {
          window.__familyHubTimerAlarm.stopFromServer(event.data.uid);
        }
      }, "family_hub_timer_alarm_stop");
      this._alarmUnsub = () => {
        try { unsubRing(); } catch (e) { /* no-op */ }
        try { unsubStop(); } catch (e) { /* no-op */ }
      };
    } catch (e) {
      // Best-effort - a dashboard that can't subscribe (e.g. a very old
      // frontend build) simply never gets the WIDENED alarm reach; the
      // same-tab-only local alarm (window.__familyHubTimerAlarm.check,
      // unaffected by any of this) still works exactly as before.
    }
    // Catch up on anything already ringing before this tab opened, rather
    // than waiting up to ALARM_REANNOUNCE_SECONDS for the next re-
    // announcement's RING event.
    if (this._hass.connection.sendMessagePromise) {
      try {
        const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/timers/list_active_alarms" });
        for (const alarm of (result && result.alarms) || []) {
          if (window.__familyHubTimerAlarm) window.__familyHubTimerAlarm.ringBroadcast(alarm, this._hass, myUserId);
        }
      } catch (e) {
        // Best-effort catch-up only - the next re-announcement still
        // covers it.
      }
    }
  }
  _refreshAll() {
    this._fetchTodayEvents();
    this._fetchTodayMeals();
    this._fetchTodayReminders();
    this._fetchWeather();
  }
  _startPolling() {
    if (this._interval) return;
    this._interval = setInterval(() => {
      this._fetchSettings();
      this._refreshAll();
    }, 60 * 1000);
  }
  connectedCallback() {
    if (this._hass && !this._interval) {
      if (this._firstLoadPromise) {
        this._firstLoadPromise.then(() => {
          if (this.isConnected && this._hass && !this._interval) {
            this._refreshAll();
            this._startPolling();
          }
        });
      } else {
        this._fetchSettings();
        this._refreshAll();
        this._startPolling();
      }
    }
    // Refresh at the next local midnight so a card left open overnight
    // rolls over to the new day's events/meals/reminders on its own,
    // without needing a manual refresh.
    this._scheduleMidnightRefresh();
  }
  disconnectedCallback() {
    if (this._interval) clearInterval(this._interval);
    this._interval = null;
    if (this._midnightTimeout) clearTimeout(this._midnightTimeout);
    this._midnightTimeout = null;
  }
  _scheduleMidnightRefresh() {
    if (this._midnightTimeout) clearTimeout(this._midnightTimeout);
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 5, 0);
    const ms = nextMidnight.getTime() - now.getTime();
    this._midnightTimeout = setTimeout(() => {
      this._renderHeader();
      this._refreshAll();
      this._scheduleMidnightRefresh();
    }, ms);
  }
  getCardSize() {
    return 4;
  }
  // Sections-view "Layout" tab sizing (current API). `rows` is left unset
  // so the card auto-fits its content height by default (a day with one
  // event looks shorter than a day with five) - but if someone manually
  // drags the card to a shorter height in the Layout tab, the grid DOES
  // impose a fixed height on this element, and the card's own CSS (:host
  // height:100%, .body-scroll flex:1 + overflow-y:auto) makes it scroll
  // internally rather than overflowing past its assigned space. Width is
  // resizable between a compact 4-column tile and a full 12-column row.
  getGridOptions() {
    return {
      columns: 6,
      min_columns: 4,
      max_columns: 12,
      min_rows: 4,
    };
  }
  // Older frontends only understand the deprecated grid_* keys - kept
  // alongside getGridOptions so the card still lays out sensibly there.
  getLayoutOptions() {
    return { grid_rows: "auto", grid_columns: 6, grid_min_rows: 4 };
  }
  _dateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  _toDate(part) {
    if (!part) return null;
    if (part.dateTime) return new Date(part.dateTime);
    if (part.date) return new Date(part.date + "T00:00:00");
    return null;
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
      weekendBreakfast: false,
      people: [],
      theme: this._defaultTheme(),
      useGlobalTheme: true,
      globalThemeId: "liquidglass",
    };
  }
  // Only reads the handful of shared-settings fields this card actually
  // needs (blocks, weekend-breakfast, people, theme) - everything else in
  // the settings blob (countdown, Daily Digest, timeline range, etc.) is
  // simply ignored here since this card doesn't render any of it. This is
  // deliberately lenient/forward-compatible: an older or newer settings
  // blob shape never breaks this card, it just falls back to defaults for
  // any field it doesn't recognize.
  _normalizeSettings(parsed) {
    const defaults = this._defaultSettings();
    if (!parsed || typeof parsed !== "object") return defaults;
    const blocks = Array.isArray(parsed.blocks) && parsed.blocks.length ? parsed.blocks.map((b) => String(b)) : defaults.blocks;
    const weekendBreakfast = typeof parsed.weekendBreakfast === "boolean" ? parsed.weekendBreakfast : defaults.weekendBreakfast;
    const people = Array.isArray(parsed.people) ? parsed.people : defaults.people;
    const defaultTheme = defaults.theme;
    const parsedTheme = parsed.theme && typeof parsed.theme === "object" ? parsed.theme : {};
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
    const useGlobalTheme = typeof parsed.useGlobalTheme === "boolean" ? parsed.useGlobalTheme : defaults.useGlobalTheme;
    const globalThemeId = typeof parsed.globalThemeId === "string" ? parsed.globalThemeId : defaults.globalThemeId;
    return { blocks, weekendBreakfast, people, theme: { colors, fonts }, useGlobalTheme, globalThemeId };
  }
  _getSettings() {
    return this._settingsCache || this._defaultSettings();
  }
  _getPeople() {
    const settings = this._getSettings();
    if (Array.isArray(settings.people) && settings.people.length) {
      const palette = ["#a9c6c2", "#dba99c", "#d9bf7e", "#a8bd93", "#b9a7c9", "#cf8f6c", "#a89a83"];
      return settings.people
        .filter((p) => p && p.entity)
        .map((p, i) => ({
          entity: p.entity,
          name: p.name || p.entity,
          color: p.color || palette[i % palette.length],
          badges: Array.isArray(p.badges) ? p.badges : [],
          remindersEntity: p.remindersEntity || "",
        }));
    }
    return this._config.people;
  }
  _getBlocksForToday() {
    const settings = this._getSettings();
    const blocks = settings.blocks.slice();
    const dayIndex = new Date().getDay();
    const isWeekend = dayIndex === 0 || dayIndex === 6;
    if (settings.weekendBreakfast && isWeekend && !blocks.some((b) => /breakfast/i.test(b))) {
      blocks.unshift("Breakfast");
    }
    return blocks;
  }
  // Shared by both the new per-card override branch below and the
  // existing household-global branch, so the color/font validation only
  // needs to exist once in this file.
  _themeFromGlobalEntry(g) {
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
  _resolveTheme(settings) {
    const local = settings.theme || this._defaultTheme();
    // v1.111.0+: a per-card-placement Theme override (set from this card's
    // own native "Edit Card" dialog) wins over the household's own Global
    // Theme setting - the most specific choice available. "" (the
    // untouched default) falls straight through to the exact pre-1.111.0
    // behavior below.
    const cardOverride = this._config && this._config.theme_override;
    if (cardOverride) {
      const list = Array.isArray(this._globalThemes) ? this._globalThemes : [];
      const g = list.find((t) => t && t.id === cardOverride);
      if (g) return this._themeFromGlobalEntry(g);
      // A stale override (theme since deleted/renamed) falls through to
      // normal resolution below rather than going blank.
    }
    if (!settings.useGlobalTheme || !settings.globalThemeId) return local;
    const list = Array.isArray(this._globalThemes) ? this._globalThemes : [];
    const g = list.find((t) => t && t.id === settings.globalThemeId);
    if (!g) return local;
    return this._themeFromGlobalEntry(g);
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
  // v1.126.0+ - see window.__familyHubThemeCache's own comment above the
  // class for the full "why a key, not one shared blob" reasoning. This
  // card has no per-device theme override concept (that lives only on the
  // full calendar/chores/rewards/goals/pantry/my-chores cards), so the key
  // is only ever this card-placement's own theme_override, or the shared
  // "household" bucket every un-overridden card/placement uses.
  _familyHubThemeCacheKey() {
    const cardOverride = this._config && this._config.theme_override;
    if (cardOverride) return `card:${cardOverride}`;
    return "household";
  }
  _applyThemeVars() {
    const settings = this._getSettings();
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
    this.style.setProperty("--fs-header-title", `${theme.fonts.headerTitle}px`);
    this.style.setProperty("--fs-event", `${theme.fonts.event}px`);
    this.style.setProperty("--fs-chip", `${theme.fonts.chip}px`);
    this.style.setProperty("--fs-wx-temp", `${theme.fonts.wxTemp}px`);
    const shadowCss = this._buildBoxShadow(theme.effects);
    if (shadowCss) this.style.setProperty("--fc-shadow", shadowCss);
    else this.style.removeProperty("--fc-shadow");
    const bg = theme.background;
    if (bg && bg.image) {
      this.style.setProperty("--fc-bg-image", `url("${bg.image.replace(/"/g, '\\"')}")`);
      this.style.setProperty("--fc-bg-size", bg.size === "repeat" ? "auto" : bg.size || "cover");
      this.style.setProperty("--fc-bg-position", bg.position || "center");
      this.style.setProperty("--fc-bg-blur", `${bg.blur || 0}px`);
      this.style.setProperty("--fc-bg-image-opacity", typeof bg.opacity === "number" ? bg.opacity : 1);
      this.style.setProperty(
        "--fc-bg-overlay-image",
        `linear-gradient(${this._hexToRgba(bg.overlayColor || "#000000", bg.overlayOpacity || 0)}, ${this._hexToRgba(bg.overlayColor || "#000000", bg.overlayOpacity || 0)})`
      );
    } else {
      this.style.removeProperty("--fc-bg-image");
      this.style.removeProperty("--fc-bg-size");
      this.style.removeProperty("--fc-bg-position");
      this.style.removeProperty("--fc-bg-blur");
      this.style.removeProperty("--fc-bg-image-opacity");
      this.style.removeProperty("--fc-bg-overlay-image");
    }
    // v1.126.0+: snapshot exactly what was just set/removed above into the
    // shared cache under this card/placement's key, so a future _build() can
    // apply the same values before the real fetches resolve - see
    // window.__familyHubThemeCache's own comment for the full reasoning. A
    // var not currently set on the host (e.g. --fc-bg-image when there is no
    // background image right now) is simply skipped rather than cached as an
    // empty string, so applying the cache later never clobbers a var that
    // should stay unset.
    if (window.__familyHubThemeCache) {
      const __familyHubCacheVarNames = [
      "--fc-bg",
      "--fc-card",
      "--fc-border",
      "--fc-text",
      "--fc-text-secondary",
      "--fc-accent",
      "--fc-accent-text",
      "--fc-accent2",
      "--fc-accent3",
      "--fc-surface-alt",
      "--fc-surface2",
      "--fs-header-title",
      "--fs-event",
      "--fs-chip",
      "--fs-wx-temp",
      "--fc-shadow",
      "--fc-bg-image",
      "--fc-bg-size",
      "--fc-bg-position",
      "--fc-bg-blur",
      "--fc-bg-image-opacity",
      "--fc-bg-overlay-image",
      ];
      const vars = {};
      __familyHubCacheVarNames.forEach((name) => {
        const v = this.style.getPropertyValue(name);
        if (v) vars[name] = v;
      });
      window.__familyHubThemeCache.set(this._familyHubThemeCacheKey(), vars);
    }
  }
  // v1.126.0+: applies whatever theme this device/placement last actually
  // resolved to, SYNCHRONOUSLY, before the real fetches that would
  // otherwise be the only way to know it - see window.__familyHubTheme
  // Cache's own comment above the class. Called once from `_build()`,
  // before the very first `_render()`/paint. A no-op (does nothing,
  // leaves `_defaultTheme()`'s plain colors as the first paint exactly
  // like before this fix) on the very first time ANY card resolves this
  // particular key - there's nothing to have cached yet.
  _applyCachedThemeVarsIfAny() {
    if (!window.__familyHubThemeCache) return;
    const cached = window.__familyHubThemeCache.get(this._familyHubThemeCacheKey());
    if (!cached) return;
    Object.keys(cached).forEach((name) => {
      if (typeof cached[name] === "string") this.style.setProperty(name, cached[name]);
    });
  }
  async _fetchSettings() {
    if (!this._hass) return;
    try {
      const result = await this._hass.connection.sendMessagePromise({
        type: "call_service",
        domain: "todo",
        service: "get_items",
        service_data: { status: ["needs_action", "completed"] },
        target: { entity_id: this._config.settings_entity },
        return_response: true,
      });
      const items = (result && result.response && result.response[this._config.settings_entity] && result.response[this._config.settings_entity].items) || [];
      const matches = items.filter((it) => it.summary === "Settings");
      const item = matches.length ? matches[matches.length - 1] : items[0] || null;
      let parsed = null;
      if (item && item.description) {
        try {
          parsed = JSON.parse(item.description);
        } catch (e) {
          parsed = null;
        }
      }
      this._settingsCache = this._normalizeSettings(parsed);
    } catch (e) {
      if (!this._settingsCache) this._settingsCache = this._defaultSettings();
    }
    this._applyThemeVars();
    this._renderHeader();
  }
  async _fetchGlobalThemes() {
    if (!this._hass) return;
    let custom = [];
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "theme_builder/list" });
      custom = (result && Array.isArray(result.themes)) ? result.themes : [];
    } catch (e) {
      custom = [];
    }
    // v1.111.0+: also merge in every installed native Home Assistant theme
    // - duplicated (not shared/imported) from family-week-calendar-card.js's
    // own _fetchGlobalThemes/_nativeHaThemeEntries, same "independently
    // loaded Lovelace resources duplicate small helpers" convention used
    // throughout this project.
    this._globalThemes = custom.concat(this._nativeHaThemeEntries());
    this._applyThemeVars();
  }
  // --- Native HA theme support (duplicated from family-week-calendar-
  // card.js's identical methods - see that file's own comments) ---
  _haVarsToBuilderColors(vars) {
    const v = vars || {};
    const accent = v["primary-color"];
    return {
      bg: v["primary-background-color"],
      card: v["card-background-color"] || v["ha-card-background"],
      border: v["divider-color"],
      text: v["primary-text-color"],
      textSecondary: v["secondary-text-color"],
      accent: accent,
      accentText: v["text-primary-color"],
      accent2: v["accent-color"] || accent,
      accent3: v["warning-color"],
      surfaceAlt: v["secondary-background-color"],
      surface2: v["secondary-background-color"],
    };
  }
  _haThemeCssVars(name) {
    const themes = (this._hass && this._hass.themes && this._hass.themes.themes) || {};
    const theme = themes[name];
    if (!theme) return {};
    const vars = {};
    for (const key of Object.keys(theme)) {
      if (key === "modes") continue;
      vars[key] = theme[key];
    }
    if (theme.modes) {
      const dark = !!(this._hass && this._hass.themes && this._hass.themes.darkMode);
      const modeVars = theme.modes[dark ? "dark" : "light"] || {};
      for (const key of Object.keys(modeVars)) vars[key] = modeVars[key];
    }
    return vars;
  }
  _haDefaultCssVars() {
    try {
      if (typeof getComputedStyle !== "function" || !document || !document.documentElement) return {};
      const style = getComputedStyle(document.documentElement);
      const keys = [
        "primary-color", "text-primary-color", "primary-background-color", "secondary-background-color",
        "card-background-color", "primary-text-color", "secondary-text-color", "divider-color",
        "accent-color", "warning-color", "ha-card-background",
      ];
      const vars = {};
      keys.forEach((k) => {
        const val = style.getPropertyValue(`--${k}`);
        if (val && val.trim()) vars[k] = val.trim();
      });
      return vars;
    } catch (e) {
      return {};
    }
  }
  _nativeHaThemeEntries() {
    const defaultFonts = this._defaultTheme().fonts;
    const entries = [
      {
        id: "ha:__default__",
        name: "Default (Home Assistant)",
        colors: this._haVarsToBuilderColors(this._haDefaultCssVars()),
        fonts: defaultFonts,
        effects: null,
        background: null,
        native: true,
      },
    ];
    const themes = (this._hass && this._hass.themes && this._hass.themes.themes) || {};
    Object.keys(themes)
      .filter((name) => name.indexOf("Theme Builder - ") !== 0)
      .sort((a, b) => a.localeCompare(b))
      .forEach((name) => {
        entries.push({
          id: "ha:" + name,
          name: name,
          colors: this._haVarsToBuilderColors(this._haThemeCssVars(name)),
          fonts: defaultFonts,
          effects: null,
          background: null,
          native: true,
        });
      });
    return entries;
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
  _parseDishDescription(raw) {
    if (!raw) return { description: "", link: "", color: null, block: 0, recur: null };
    try {
      const parsed = JSON.parse(raw);
      return {
        description: parsed.description || "",
        link: parsed.link || "",
        color: parsed.color || null,
        block: typeof parsed.block === "number" ? parsed.block : 0,
        recur: parsed.recur || null,
      };
    } catch (e) {
      return { description: raw, link: "", color: null, block: 0, recur: null };
    }
  }
  _parseReminderRollover(raw) {
    const match = /<!--rollover:1-->/.exec(raw || "");
    // v185+: a rollover reminder can now also carry a <!--rolldays:...-->
    // marker (see family-week-calendar-card.js's own _parseReminderRollover
    // for the read/write half of this) restricting which days it applies
    // to - this card only ever DISPLAYS a reminder's description, so it
    // just needs both markers stripped out of the visible text, not the
    // day list itself.
    const description = (raw || "")
      .replace(/<!--rollover:1-->/, "")
      .replace(/<!--rolldays:[\d,]*-->/, "")
      .trim();
    return { description, rollover: !!match };
  }
  async _fetchTodayEvents() {
    if (!this._hass) return;
    const today = new Date();
    const dayStart = new Date(today);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayStart.getDate() + 1);
    const people = this._getPeople();
    const results = [];
    // Deduped by "text|color" so two same-badge events today don't stack
    // duplicate bubbles next to the date - one bubble per distinct badge is
    // enough to signal "something's up today", same intent as the full
    // card's per-day custody badge.
    const badgeMap = new Map();
    await Promise.all(
      people.map(async (person) => {
        if (!person.entity) return;
        const personBadges = person.badges || [];
        try {
          const events = await this._hass.callApi(
            "GET",
            `calendars/${person.entity}?start=${encodeURIComponent(dayStart.toISOString())}&end=${encodeURIComponent(dayEnd.toISOString())}`
          );
          for (const ev of events || []) {
            const start = this._toDate(ev.start);
            const end = this._toDate(ev.end);
            if (!start) continue;
            const summaryLower = (ev.summary || "").toLowerCase();
            // A per-calendar "hide when contains" keyword drops the event
            // entirely (e.g. a background custody-schedule calendar) -
            // same as the full card's month/week grids.
            const hideMatched = personBadges.some((b) => {
              const hideMatch = (b.hideMatch || "").trim().toLowerCase();
              return hideMatch && summaryLower.includes(hideMatch);
            });
            if (hideMatched) continue;
            // A "show badge when contains" keyword swaps the full event
            // row for a small colored bubble next to today's date instead
            // - keeps the agenda from being cluttered by all-day custody
            // markers while still surfacing that something matched today.
            let matchedBadge = false;
            for (const b of personBadges) {
              const badgeMatch = (b.match || "").trim().toLowerCase();
              if (badgeMatch && summaryLower.includes(badgeMatch)) {
                matchedBadge = true;
                if (b.text) badgeMap.set(`${b.text}|${person.color}`, { text: b.text, color: person.color });
              }
            }
            if (matchedBadge) continue;
            results.push({
              summary: ev.summary || "(untitled)",
              start,
              end,
              allDay: !ev.start || !ev.start.dateTime,
              location: ev.location || "",
              description: ev.description || "",
              color: person.color,
              personName: person.name,
            });
          }
        } catch (e) {
          // One bad calendar shouldn't blank out the rest of today.
        }
      })
    );
    results.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.start - b.start;
    });
    this._todayEvents = results;
    this._todayBadges = Array.from(badgeMap.values());
    this._render();
  }
  async _fetchTodayMeals() {
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
        };
        if (parsed.recur === "weekly") {
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
          });
        }
      }
      this._mealPlanRaw = map;
      this._recurringMeals = recurring;
    } catch (e) {
      this._mealPlanRaw = {};
      this._recurringMeals = [];
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateKey = this._dateKey(today);
    const blocks = this._getBlocksForToday();
    this._todayMeals = blocks
      .map((label, blockIndex) => {
        const meal = this._getMealForDay(dateKey, today, blockIndex);
        return meal ? { label, blockIndex, ...meal } : null;
      })
      .filter(Boolean);
    this._render();
  }
  // Same resolution rule as the full card's _getMealForDay: an explicit
  // entry for this exact date always wins (whether it's a recurring
  // anchor or a one-off override), otherwise the nearest "repeat weekly"
  // anchor whose weekday + block match and whose own date is on or before
  // today (never projects backward).
  _getMealForDay(dateKey, dayDate, blockIndex) {
    const explicit = this._mealPlanRaw[dateKey] && this._mealPlanRaw[dateKey][blockIndex];
    if (explicit) return explicit;
    const weekday = dayDate.getDay();
    let best = null;
    for (const t of this._recurringMeals || []) {
      if (t.weekday !== weekday || t.blockIndex !== blockIndex) continue;
      if (dateKey < t.anchorDateKey) continue;
      if (!best || t.anchorDateKey > best.anchorDateKey) best = t;
    }
    if (!best) return null;
    return { uid: best.uid, name: best.name, description: best.description, link: best.link, color: best.color, recur: "weekly" };
  }
  // v144.2+ (task #21): mirrors the full calendar card's own v130+
  // multi-list subscription rule (see family-week-calendar-card.js's
  // _fetchReminders) instead of only ever pulling from the one shared
  // family list. Every logged-in profile also sees, folded into the same
  // this._todayReminders array: their OWN individual list (settings.
  // people[i].remindersEntity for whichever person their userProfile.
  // primaryCalendar points at), shown unconditionally - no subscription
  // needed for your own list - and every OTHER person's individual list
  // they're subscribed to at EITHER tier (remindersSubscriptions[personEntity]
  // === "calendar" or "calendar_alert"; both tiers are equivalent to
  // "visible" here, same as the calendar card). Each returned item is
  // tagged with which list it came from (listEntity), that list's color
  // (null for the family list) and personName (null for the family list)
  // so "Done" can target the right entity and items can be styled per
  // owner. A person whose individual list entity happens to equal the
  // family entity is only ever fetched once.
  async _fetchTodayReminders() {
    if (!this._hass) return;
    const familyEntity = this._config.reminders_entity;
    const lists = [{ entity: familyEntity, color: null, personName: null, isFamily: true }];
    try {
      const settings = this._getSettings();
      const profiles = settings.userProfiles || {};
      const myUserId = this._hass.user && this._hass.user.id;
      const myProfile = myUserId ? profiles[myUserId] : null;
      if (myProfile) {
        const people = this._getPeople();
        const subs = myProfile.remindersSubscriptions || {};
        const seenEntities = new Set([familyEntity]);
        for (const person of people) {
          if (!person.remindersEntity || seenEntities.has(person.remindersEntity)) continue;
          const isOwn = !!myProfile.primaryCalendar && person.entity === myProfile.primaryCalendar;
          const subLevel = subs[person.entity];
          const visible = isOwn || subLevel === "calendar" || subLevel === "calendar_alert";
          if (!visible) continue;
          seenEntities.add(person.remindersEntity);
          lists.push({ entity: person.remindersEntity, color: person.color, personName: person.name, isFamily: false });
        }
      }
    } catch (e) {
      // No profile/individual-list data yet (or something malformed about
      // it) - the shared family list above still works fine on its own.
    }
    const today = new Date();
    const dateKey = this._dateKey(today);
    try {
      const fetchedLists = await Promise.all(
        lists.map(async (list) => {
          try {
            const items = await this._getItems(list.entity);
            return items
              .filter((it) => it.status === "needs_action" && it.due)
              .map((it) => {
                const parsed = this._parseReminderRollover(it.description || "");
                const due = new Date(it.due);
                if (isNaN(due.getTime())) return null;
                return {
                  uid: it.uid,
                  summary: it.summary || "(untitled)",
                  due,
                  description: parsed.description,
                  rollover: parsed.rollover,
                  listEntity: list.entity,
                  color: list.color,
                  personName: list.personName,
                  isFamily: list.isFamily,
                };
              })
              .filter(Boolean);
          } catch (e) {
            // That particular list's to-do entity doesn't exist yet - skip
            // it, the other lists still show.
            return [];
          }
        })
      );
      this._todayReminders = fetchedLists
        .flat()
        .filter((r) => this._dateKey(r.due) === dateKey)
        .sort((a, b) => a.due - b.due);
    } catch (e) {
      this._todayReminders = [];
    }
    this._render();
  }
  async _markReminderDone(uid, listEntity) {
    if (!this._hass || !uid) return;
    try {
      await this._hass.callService("todo", "update_item", { item: uid, status: "completed" }, { entity_id: listEntity || this._config.reminders_entity });
    } catch (e) {
    }
    this._fetchTodayReminders();
  }
  async _fetchWeather() {
    if (!this._hass || !this._config.weather_entity) {
      this._forecastToday = null;
      this._render();
      return;
    }
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
      const todayKey = this._dateKey(new Date());
      const todayForecast = forecasts.find((f) => (f.datetime || "").slice(0, 10) === todayKey);
      this._forecastToday = todayForecast
        ? { condition: todayForecast.condition, high: todayForecast.temperature, low: todayForecast.templow }
        : null;
    } catch (e) {
      this._forecastToday = null;
    }
    this._render();
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
    return map[condition] || "";
  }
  _fmtTime(d) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  // Client-side navigation to another dashboard/view, the same mechanism
  // Home Assistant's own frontend uses for a "navigate" tap action -
  // pushState + a "location-changed" event lets the app's router swap
  // views instantly instead of a full page reload (which would also lose
  // any other cards' in-memory state on the page).
  _goToCalendar() {
    const path = (this._config.calendar_dashboard_path || "").trim();
    if (!path) return;
    history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true, detail: { replace: false } }));
  }
  // Same contrast heuristic as the full card's _textColorFor, so a badge
  // bubble's text stays readable against any configured badge color.
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
  // v1.132.65+: household ask, verbatim - "Can we add another item to the
  // family today card. An option to have an add button. If turned on it
  // appears next to the go to calendar button, allows you to add a
  // reminder or calendar event, have it open the same modal as we use in
  // the current calendar card to add reminder or calendar event." Ported
  // from family-week-calendar-card.js's own Add Event modal (same class
  // names, same fields, same save logic) rather than a stripped-down
  // rebuild, so it really is "the same modal" - this card already shared
  // most of the underlying data (_getPeople, _getSettings, reminders_entity,
  // the rollover marker format) with the full card, so the gap was mostly
  // this UI itself, not the concepts behind it. Two deliberate, documented
  // scope cuts from the full card's version: no translations (this card has
  // no i18n system at all today, so every string here is plain English,
  // matching the rest of this file), and _addEventDefaultDate's "whichever
  // day is currently in view" logic is replaced with a plain "always
  // defaults to today" - this card only ever shows one day, so there's no
  // other day to default to.
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
  // Same "someone else's individual/subscribed Reminders list" picker as
  // the full card's own _addableRemindersLists - always at least the
  // shared family list, plus this Home Assistant user's own individual
  // list and anything they're subscribed to, per this card's own already-
  // fetched _getSettings()/_getPeople() (see _fetchTodayReminders, which
  // already builds this exact same list for display).
  _addableRemindersLists() {
    const familyEntity = this._config.reminders_entity;
    const lists = [{ entity: familyEntity, label: "Family", color: null }];
    if (!this._hass) return lists;
    try {
      const settings = this._getSettings();
      const profiles = settings.userProfiles || {};
      const myUserId = this._hass.user && this._hass.user.id;
      const myProfile = myUserId ? profiles[myUserId] : null;
      if (myProfile) {
        const people = this._getPeople();
        const subs = myProfile.remindersSubscriptions || {};
        const seenEntities = new Set([familyEntity]);
        for (const person of people) {
          if (!person.remindersEntity || seenEntities.has(person.remindersEntity)) continue;
          const isOwn = !!myProfile.primaryCalendar && person.entity === myProfile.primaryCalendar;
          const subLevel = subs[person.entity];
          const canAdd = isOwn || subLevel === "calendar" || subLevel === "calendar_alert";
          if (!canAdd) continue;
          seenEntities.add(person.remindersEntity);
          lists.push({ entity: person.remindersEntity, label: isOwn ? `My list (${person.name})` : person.name, color: person.color });
        }
      }
    } catch (e) {
      // No profile/individual-list data yet - just the family list, same
      // picker-of-one this feature always had before individual lists
      // existed.
    }
    return lists;
  }
  // Renders the 7 Mon-Sun toggle buttons for the reminder rollover-days
  // picker - `selected` empty (or covering all 7 days) renders every button
  // active, matching "every day" being this feature's default state.
  _rolldaysBtnsHtml(selectedDays) {
    const selected = new Set(selectedDays && selectedDays.length ? selectedDays : [0, 1, 2, 3, 4, 5, 6]);
    return REMINDER_WEEKDAY_LABELS.map(
      (label, idx) => `<button type="button" class="rolldays-btn ${selected.has(idx) ? "active" : ""}" data-day="${idx}">${label}</button>`
    ).join("");
  }
  _wireRolldaysToggle(container) {
    if (!container) return;
    container.querySelectorAll(".rolldays-btn").forEach((btn) => {
      btn.addEventListener("click", () => btn.classList.toggle("active"));
    });
  }
  _readRolldaysFromContainer(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll(".rolldays-btn.active")).map((btn) => parseInt(btn.dataset.day, 10));
  }
  // Writes a standalone reminder's rollover markers back into its
  // description - identical marker format to family-week-calendar-card.js's
  // own _buildReminderDescription (and to what this card's own
  // _parseReminderRollover already reads back for display), so a reminder
  // created here rolls over exactly the same way one created from the full
  // card would.
  _buildReminderDescription(description, rollover, rolloverDays) {
    const base = (description || "").trim();
    if (!rollover) return base;
    const days = Array.isArray(rolloverDays) ? Array.from(new Set(rolloverDays)).filter((d) => d >= 0 && d <= 6) : [];
    const markers = ["<!--rollover:1-->"];
    if (days.length > 0 && days.length < 7) {
      markers.push(`<!--rolldays:${days.sort((a, b) => a - b).join(",")}-->`);
    }
    const markerBlock = markers.join("\n");
    return base ? `${base}\n\n${markerBlock}` : markerBlock;
  }
  // Same mobile-back-button/hardware-back-gesture handling as the full
  // card's own _openModal/_setupModalBackButtonHandling/
  // _handleModalPopState (see that file's own extensive comment on
  // _setupModalBackButtonHandling for the full "why" - identical here,
  // just ported byte-for-byte since it depends on nothing but this._root
  // and the browser's History API). Wiring this up as part of the Add
  // Event modal also gives this card's existing Detail popup the same
  // back-button behavior for free, the first time a household opens the
  // Add Event modal - a small, harmless improvement, not a regression,
  // since a household that never enables show_add_button never triggers
  // this at all and sees no change whatsoever.
  _openModal(el) {
    if (!el) return;
    this._setupModalBackButtonHandling();
    this._topModalZ = (this._topModalZ || 1006) + 1;
    el.style.zIndex = String(this._topModalZ);
    el.classList.add("open");
  }
  _setupModalBackButtonHandling() {
    if (this._modalBackButtonSetup || !this._root) return;
    this._modalBackButtonSetup = true;
    this._closingModalFromPopState = false;
    this._pendingProgrammaticBacks = 0;
    this._boundHandleModalPopState = this._handleModalPopState.bind(this);
    window.addEventListener("popstate", this._boundHandleModalPopState);
    this._modalHistoryObserver = new MutationObserver((mutations) => {
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
    if (this._pendingProgrammaticBacks > 0) {
      this._pendingProgrammaticBacks--;
      return;
    }
    const openOverlays = Array.from(this._root.querySelectorAll(".modal-overlay.open"));
    if (!openOverlays.length) return;
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
    setTimeout(() => {
      this._closingModalFromPopState = false;
    }, 0);
  }
  _openAddEvent(tab) {
    const root = this._root;
    const select = root.querySelector(".add-event-calendar-select");
    select.innerHTML = this._getPeople()
      .map((p) => `<option value="${p.entity}">${p.name}</option>`)
      .join("");
    const remListSelect = root.querySelector(".add-event-reminder-list-select");
    if (remListSelect) {
      remListSelect.innerHTML = this._addableRemindersLists()
        .map((l) => `<option value="${l.entity}">${l.label}</option>`)
        .join("");
      remListSelect.value = this._config.reminders_entity;
    }
    root.querySelector(".add-event-title").value = "";
    root.querySelector(".add-event-location").value = "";
    root.querySelector(".add-event-description").value = "";
    root.querySelector(".add-event-reminder-rollover").checked = false;
    const addEventRolldaysFieldReset = root.querySelector(".add-event-reminder-rolldays-field");
    if (addEventRolldaysFieldReset) addEventRolldaysFieldReset.style.display = "none";
    root.querySelectorAll(".add-event-reminder-rolldays .rolldays-btn").forEach((btn) => btn.classList.add("active"));
    root.querySelectorAll(".remind-check").forEach((cb) => {
      cb.checked = cb.value === "10" || cb.value === "30";
    });
    // Always defaults to today - see this whole block's own top comment
    // for why this card doesn't need the full card's "whichever day is
    // currently in view" logic.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    root.querySelector(".add-event-date").value = this._dateKey(today);
    root.querySelector(".add-event-end-date").value = "";
    root.querySelector(".add-event-reminder-date").value = this._dateKey(today);
    const now = new Date();
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
    this._renderAddEventPeopleField();
    // Attachable checklists - always start fresh, closed, in "just for
    // this" mode with no items (same as family-week-calendar-card.js's own
    // _openAddEvent).
    this._addEventChecklistItems = [];
    root.querySelector(".add-event-checklist-toggle").checked = false;
    root.querySelector(".add-event-checklist-body").style.display = "none";
    root.querySelectorAll(".add-event-checklist-mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.value === "custom"));
    root.querySelector(".add-event-checklist-existing-field").style.display = "none";
    root.querySelector(".add-event-checklist-custom-field").style.display = "";
    root.querySelector(".add-event-checklist-add-input").value = "";
    this._renderAddEventChecklistItems();
    this._todoListCandidates = null;
    this._setAddEventTab(tab === "reminder" ? "reminder" : "calendar");
    this._openModal(root.querySelector(".add-event-overlay"));
  }
  // "Also for" - lets someone tag a new event for multiple people right
  // when they create it. Rebuilt on open and whenever the Calendar select
  // changes, since whichever calendar is currently picked has to be
  // excluded from "someone else".
  _renderAddEventPeopleField() {
    const root = this._root;
    const content = root.querySelector(".add-event-people-content");
    if (!content) return;
    const ownEntity = root.querySelector(".add-event-calendar-select").value;
    const people = this._getPeople();
    const others = people.filter((p) => p.entity !== ownEntity);
    if (!others.length) {
      content.innerHTML = `<div class="empty">No one else in Family Hub to tag yet.</div>`;
      return;
    }
    const colorMap = this._colorByName(people);
    const checkboxesHtml = others
      .map((p) => {
        const color = this._colorFor(p, colorMap);
        return `<label class="remind-check-opt"><input type="checkbox" class="add-event-people-check" value="${p.entity}" /><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color}"></span>${p.name}</label>`;
      })
      .join("");
    content.innerHTML = `<div class="remind-check-row">${checkboxesHtml}</div>`;
  }
  // Renders the "just for this" checklist-item builder inside the Add
  // Event modal from this._addEventChecklistItems.
  _renderAddEventChecklistItems() {
    const root = this._root;
    const listEl = root.querySelector(".add-event-checklist-items");
    if (!listEl) return;
    const items = this._addEventChecklistItems || [];
    listEl.innerHTML = items.length
      ? items
          .map(
            (item, i) =>
              `<div class="checklist-item-row">` +
              `<span class="checklist-item-row-text">${item.text}</span>` +
              `<button type="button" class="checklist-item-remove-btn" data-index="${i}" title="Remove">&#10005;</button>` +
              `</div>`
          )
          .join("")
      : `<div class="remind-hint">No items yet - add whatever needs to be remembered below.</div>`;
    listEl.querySelectorAll(".checklist-item-remove-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.index, 10);
        if (Number.isFinite(idx)) this._addEventChecklistItems.splice(idx, 1);
        this._renderAddEventChecklistItems();
      });
    });
  }
  // Populates the "use an existing list" dropdown from
  // _fetchTodoListCandidates - separate from that fetch itself so it can
  // be called again cheaply (the fetch is cached) whenever the mode
  // toggles to "existing" without re-fetching every time.
  async _renderAddEventChecklistExistingSelect() {
    const root = this._root;
    const select = root.querySelector(".add-event-checklist-existing-select");
    if (!select) return;
    const candidates = await this._fetchTodoListCandidates();
    if (!candidates) return;
    const previous = select.value;
    select.innerHTML = candidates.length
      ? candidates.map((c) => `<option value="${c.entity_id}">${c.name}</option>`).join("")
      : `<option value="">No to-do lists found</option>`;
    if (previous && candidates.some((c) => c.entity_id === previous)) select.value = previous;
  }
  // Every todo.* entity in this Home Assistant instance, for the "use an
  // existing list" picker - cached on this._todoListCandidates once per
  // modal-open lifetime (cleared to null every time the modal is
  // (re)opened - see _openAddEvent).
  async _fetchTodoListCandidates() {
    if (this._todoListCandidates) return this._todoListCandidates;
    if (!this._hass || !this._hass.connection || !this._hass.connection.sendMessagePromise) return null;
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/checklist/list_todo_candidates" });
      this._todoListCandidates = (result && Array.isArray(result.todo_lists)) ? result.todo_lists : [];
      return this._todoListCandidates;
    } catch (e) {
      return null;
    }
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
    const calendarField = root.querySelector(".add-event-calendar-field");
    if (calendarField) calendarField.style.display = isReminder ? "none" : "";
    const heading = root.querySelector(".add-event-heading");
    if (heading) heading.innerHTML = isReminder ? "\u{1F514} New Reminder" : "\u{2795} New Event";
    this._setAddEventError("");
    this._refreshAddReminderMissingWarn();
  }
  _refreshAddReminderMissingWarn() {
    const root = this._root;
    const warn = root.querySelector(".add-event-reminder-missing-warn");
    if (!warn) return;
    const isReminder = this._addEventActiveTab === "reminder";
    const listSelect = root.querySelector(".add-event-reminder-list-select");
    const entityId = (listSelect && listSelect.value) || this._config.reminders_entity;
    const missing = isReminder && this._hass && entityId && !this._hass.states[entityId];
    if (missing) {
      warn.textContent = `⚠️ "${entityId}" doesn't exist in Home Assistant yet, so reminders can't be saved until it does. Create a to-do list with that entity id (Settings → Devices & Services → Add Integration → Local To-do), or point this card's reminders_entity config at a to-do list you already have.`;
      warn.style.display = "";
    } else {
      warn.style.display = "none";
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
  // Shared by both _saveAddEvent's calendar branch and _saveAddReminder
  // below - reads whatever's currently set in the checklist section and,
  // if the toggle was ever turned on, attaches it to the just-created
  // event/reminder. Best-effort: a failure here still leaves the event/
  // reminder itself created, just without its checklist attached.
  async _saveAddEventChecklistIfAny(targetParams) {
    const root = this._root;
    const toggle = root.querySelector(".add-event-checklist-toggle");
    if (!toggle || !toggle.checked) return;
    const isExisting = root.querySelector(".add-event-checklist-mode-btn.active").dataset.value === "existing";
    let checklist;
    if (isExisting) {
      const entityId = root.querySelector(".add-event-checklist-existing-select").value;
      if (!entityId) return;
      checklist = { mode: "existing", entity_id: entityId };
    } else {
      const items = (this._addEventChecklistItems || []).map((item) => ({ text: item.text }));
      if (!items.length) return;
      checklist = { mode: "custom", items };
    }
    try {
      await this._hass.connection.sendMessagePromise({
        type: "family_hub/set_event_checklist",
        ...targetParams,
        checklist,
      });
    } catch (e) {
      /* best-effort - see comment above */
    }
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
    const endDateInputVal = root.querySelector(".add-event-end-date").value;
    const endDateVal = endDateInputVal && endDateInputVal >= dateVal ? endDateInputVal : dateVal;
    const data = { summary: title };
    if (location) data.location = location;
    if (description) data.description = description;
    if (allDay) {
      const end = new Date(endDateVal + "T00:00:00");
      end.setDate(end.getDate() + 1);
      data.start_date = dateVal;
      data.end_date = this._dateKey(end);
    } else {
      const startTime = root.querySelector(".add-event-start-time").value || "09:00";
      let endTime = root.querySelector(".add-event-end-time").value || "10:00";
      if (endDateVal === dateVal && endTime <= startTime) {
        const [h, m] = startTime.split(":").map((n) => parseInt(n, 10));
        const endDate = new Date();
        endDate.setHours(h + 1, m, 0, 0);
        endTime = `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;
      }
      data.start_date_time = `${dateVal} ${startTime}:00`;
      data.end_date_time = `${endDateVal} ${endTime}:00`;
    }
    try {
      await this._hass.callService("calendar", "create_event", data, { entity_id: entity });
    } catch (e) {
      this._setAddEventError(`⚠️ Couldn't save this event: ${e && e.message ? e.message : e}`);
      return;
    }
    const startDate = allDay ? new Date(dateVal + "T00:00:00") : new Date(data.start_date_time.replace(" ", "T"));
    const startTs = Math.floor(startDate.getTime() / 1000);
    const peopleEntities = Array.from(root.querySelectorAll(".add-event-people-check:checked")).map((c) => c.value);
    if (peopleEntities.length) {
      try {
        await this._hass.connection.sendMessagePromise({
          type: "family_hub/set_event_people_override",
          calendar_entity: entity,
          start: startTs,
          summary: title,
          people: peopleEntities,
        });
      } catch (e) {
        /* best-effort - see comment above */
      }
    }
    await this._saveAddEventChecklistIfAny({ calendar_entity: entity, start: startTs, summary: title });
    this._closeAddEvent();
    this._fetchTodayEvents();
  }
  async _saveAddReminder() {
    const root = this._root;
    this._setAddEventError("");
    const title = root.querySelector(".add-event-title").value.trim();
    if (!title) return;
    const dateVal = root.querySelector(".add-event-reminder-date").value;
    if (!dateVal) return;
    const listSelect = root.querySelector(".add-event-reminder-list-select");
    const entityId = (listSelect && listSelect.value) || this._config.reminders_entity;
    if (this._hass && entityId && !this._hass.states[entityId]) {
      this._setAddEventError(`⚠️ "${entityId}" doesn't exist in Home Assistant, so this reminder wasn't saved. Create a to-do list with that entity id (Settings → Devices & Services → Add Integration → Local To-do), or point the right list's config at a to-do list you already have.`);
      return;
    }
    const notifyTime = root.querySelector(".add-event-reminder-time").value || "09:00";
    const description = root.querySelector(".add-event-description").value.trim();
    const rollover = root.querySelector(".add-event-reminder-rollover").checked;
    const rolloverDays = this._readRolldaysFromContainer(root.querySelector(".add-event-reminder-rolldays"));
    const fullDescription = this._buildReminderDescription(description, rollover, rolloverDays);
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
    const toggle = root.querySelector(".add-event-checklist-toggle");
    if (toggle && toggle.checked) {
      const newItemUid = await this._findJustAddedReminderUid(entityId, title, data.due_datetime);
      if (newItemUid) {
        await this._saveAddEventChecklistIfAny({ todo_entity: entityId, item_uid: newItemUid });
      }
    }
    this._closeAddEvent();
    this._fetchTodayReminders();
  }
  // Best-effort lookup for the uid of the to-do item _saveAddReminder just
  // created via the plain (response-less) todo.add_item callService call
  // above - only needed when a checklist is about to be attached to it.
  async _findJustAddedReminderUid(entityId, title, dueDatetime) {
    try {
      const result = await this._hass.connection.sendMessagePromise({
        type: "call_service",
        domain: "todo",
        service: "get_items",
        service_data: {},
        target: { entity_id: entityId },
        return_response: true,
      });
      const forEntity = result && result.response && result.response[entityId];
      const items = (forEntity && forEntity.items) || [];
      const match = items.find((it) => it.summary === title && it.due && it.due.startsWith(dueDatetime.slice(0, 16)));
      return match ? match.uid : null;
    } catch (e) {
      return null;
    }
  }
  // All the Add Event modal's own event listeners, wired once from _build()
  // right after its markup is created - kept as its own method (rather than
  // inlined into _build() alongside the two existing detail-popup
  // listeners) purely so this sizable block reads as one clearly-labeled
  // unit rather than crowding _build() itself.
  _wireAddEventModal(root) {
    root.querySelector(".add-event-close").addEventListener("click", () => this._closeAddEvent());
    root.querySelector(".add-event-cancel").addEventListener("click", () => this._closeAddEvent());
    root.querySelector(".add-event-overlay").addEventListener("click", (e) => {
      if (e.target === root.querySelector(".add-event-overlay")) this._closeAddEvent();
    });
    root.querySelector(".add-event-save").addEventListener("click", () => this._saveAddEvent());
    root.querySelector(".add-event-checklist-toggle").addEventListener("change", (e) => {
      root.querySelector(".add-event-checklist-body").style.display = e.target.checked ? "" : "none";
      if (e.target.checked && root.querySelector(".add-event-checklist-mode-btn.active").dataset.value === "existing") {
        this._renderAddEventChecklistExistingSelect();
      }
    });
    root.querySelectorAll(".add-event-checklist-mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        root.querySelectorAll(".add-event-checklist-mode-btn").forEach((b) => b.classList.toggle("active", b === btn));
        const isExisting = btn.dataset.value === "existing";
        root.querySelector(".add-event-checklist-existing-field").style.display = isExisting ? "" : "none";
        root.querySelector(".add-event-checklist-custom-field").style.display = isExisting ? "none" : "";
        if (isExisting) this._renderAddEventChecklistExistingSelect();
      });
    });
    const addChecklistItem = () => {
      const input = root.querySelector(".add-event-checklist-add-input");
      const text = (input.value || "").trim();
      if (!text) return;
      this._addEventChecklistItems = this._addEventChecklistItems || [];
      this._addEventChecklistItems.push({ text: text.slice(0, 200) });
      input.value = "";
      this._renderAddEventChecklistItems();
      input.focus();
    };
    root.querySelector(".add-event-checklist-add-btn").addEventListener("click", addChecklistItem);
    root.querySelector(".add-event-checklist-add-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addChecklistItem();
      }
    });
    const wireDatePickerBtn = (btnSelector, inputSelector) => {
      root.querySelector(btnSelector).addEventListener("click", () => {
        const input = root.querySelector(inputSelector);
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
    };
    wireDatePickerBtn(".add-event-date-btn", ".add-event-date");
    wireDatePickerBtn(".add-event-end-date-btn", ".add-event-end-date");
    wireDatePickerBtn(".add-event-reminder-date-btn", ".add-event-reminder-date");
    root.querySelectorAll(".add-event-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => this._setAddEventTab(btn.dataset.tab));
    });
    const remListSelectEl = root.querySelector(".add-event-reminder-list-select");
    if (remListSelectEl) {
      remListSelectEl.addEventListener("change", () => this._refreshAddReminderMissingWarn());
    }
    const addEventCalendarSelectEl = root.querySelector(".add-event-calendar-select");
    if (addEventCalendarSelectEl) {
      addEventCalendarSelectEl.addEventListener("change", () => this._renderAddEventPeopleField());
    }
    root.querySelectorAll(".add-event-allday-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        root.querySelectorAll(".add-event-allday-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this._updateAddEventFieldVisibility(btn.dataset.value === "on");
      });
    });
    const addEventRolloverCb = root.querySelector(".add-event-reminder-rollover");
    const addEventRolldaysField = root.querySelector(".add-event-reminder-rolldays-field");
    if (addEventRolloverCb && addEventRolldaysField) {
      addEventRolloverCb.addEventListener("change", () => {
        addEventRolldaysField.style.display = addEventRolloverCb.checked ? "block" : "none";
      });
    }
    this._wireRolldaysToggle(root.querySelector(".add-event-reminder-rolldays"));
  }
  _build() {
    this._built = true;
    // v1.126.0+: applied BEFORE attachShadow/the first innerHTML paint -
    // see _applyCachedThemeVarsIfAny's own comment and window.__familyHub
    // ThemeCache's above the class for why this is what actually fixes
    // the household's reported "loads the default theme first" flash.
    this._applyCachedThemeVarsIfAny();
    const root = this.attachShadow ? this.attachShadow({ mode: "open" }) : this;
    this._root = root;
    root.innerHTML = `
<style>
:host {
display: block;
height: 100%;
min-height: 0;
font-family: "Arial Rounded MT Std", "Arial Rounded MT", "Varela Round", -apple-system, "Segoe UI Rounded", "Segoe UI", Roboto, sans-serif;
--fc-shadow: 0 2px 8px rgba(58,53,44,0.12);
}
.card-root {
position: relative;
box-sizing: border-box;
height: 100%;
min-height: 0;
display: flex;
flex-direction: column;
padding: 16px;
border-radius: 16px;
overflow: hidden;
background: var(--fc-bg);
background-image: var(--fc-bg-image, none);
background-size: var(--fc-bg-size, cover);
background-position: var(--fc-bg-position, center);
color: var(--fc-text);
box-shadow: var(--fc-shadow);
}
.card-root::after {
content: "";
position: absolute;
inset: 0;
border-radius: 16px;
pointer-events: none;
background-image: var(--fc-bg-overlay-image, none);
}
.header { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; position: relative; }
.body-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; margin-right: -8px; padding-right: 8px; }
.date-title { display: flex; align-items: center; gap: 6px; font-size: var(--fs-header-title, 15px); font-weight: 800; color: var(--fc-text); }
.header-badges { display: inline-flex; align-items: center; gap: 4px; }
.custody-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px; font-size: 11px; font-weight: 800; box-shadow: var(--fc-shadow); }
.date-sub { font-size: var(--fs-chip, 13px); color: var(--fc-text-secondary); font-weight: 600; margin-top: 2px; }
.wx { display: flex; align-items: center; gap: 6px; font-size: var(--fs-wx-temp, 14px); color: var(--fc-text-secondary); font-weight: 700; }
.section { margin-bottom: 14px; position: relative; }
.section:last-child { margin-bottom: 0; }
.section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--fc-text-secondary); font-weight: 800; margin-bottom: 6px; }
.row { display: flex; align-items: center; gap: 10px; padding: 9px 11px; border-radius: 10px; background: var(--fc-surface-alt); margin-bottom: 6px; cursor: pointer; box-sizing: border-box; }
.row:last-child { margin-bottom: 0; }
.row .dot { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto; }
.row .label { flex: 1 1 auto; font-size: var(--fs-event, 14px); color: var(--fc-text); min-width: 0; overflow-wrap: break-word; }
.row .meta { font-size: var(--fs-chip, 13px); color: var(--fc-text-secondary); flex: 0 0 auto; white-space: nowrap; }
.reminder-owner { font-size: 0.85em; color: var(--fc-text-secondary); font-weight: 400; }
.row .done-btn { flex: 0 0 auto; border: none; border-radius: 8px; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 11px; font-weight: 700; padding: 6px 10px; cursor: pointer; }
.empty { font-size: var(--fs-event, 14px); color: var(--fc-text-secondary); font-style: italic; padding: 4px 2px; }
/* v1.132.64+: compact layout - same .msd-* class names/rules as the full
   Family Week Calendar card's Month Split view day panel (see that
   file's own copy for the "why" - kept visually identical on purpose, so
   this really is "the same style", not just a similar one). This card's
   own .header (date/weather/badges) stays as-is either way; only
   .body-scroll's content differs between layouts. */
.msd-items { display: flex; flex-direction: column; gap: 6px; }
.msd-item { border-radius: 8px; padding: 6px 8px; color: #3a352c; cursor: pointer; display: flex; align-items: baseline; gap: 8px; }
.msd-item.mc-meal-pill { font-weight: 700; }
.msd-item-time { font-size: 10px; font-weight: 700; opacity: 0.8; flex: 0 0 auto; }
.msd-item-summary { font-size: 12px; overflow-wrap: anywhere; }
.msd-empty { font-size: 12px; color: var(--fc-text-secondary); font-style: italic; padding: 4px 0; }
.footer-actions { flex: 0 0 auto; }
.footer-actions:empty { display: none; }
/* v1.132.65+: the "Go to Calendar" button and the new opt-in "+ Add"
   button share one row (see _renderFooterActions) rather than each being
   its own full-width block - flex: 1 1 auto splits the row evenly between
   whichever of the two are actually present. */
.footer-actions-row { display: flex; gap: 8px; margin-top: 4px; }
.go-to-calendar-btn, .footer-add-btn { flex: 1 1 auto; box-sizing: border-box; border: none; border-radius: 10px; background: var(--fc-accent); color: var(--fc-accent-text); font-size: var(--fs-event, 14px); font-weight: 700; padding: 11px 12px; cursor: pointer; box-shadow: var(--fc-shadow); font-family: inherit; }
.modal-overlay { display: none; position: fixed; inset: 0; background: rgba(40,34,20,0.45); z-index: 1000; align-items: center; justify-content: center; }
.modal-overlay.open { display: flex; }
.modal-box { position: relative; background: var(--fc-card); color: var(--fc-text); border-radius: 14px; padding: 20px 20px 16px; width: min(92vw, 380px); max-height: 80vh; overflow-y: auto; box-shadow: 0 8px 30px rgba(58,53,44,0.3); }
.modal-close { position: absolute; top: 10px; right: 10px; border: none; background: var(--fc-surface-alt); color: var(--fc-text); width: 30px; height: 30px; border-radius: 8px; font-size: 14px; cursor: pointer; }
.modal-box h2 { margin: 0 26px 14px 0; font-size: 1.2em; color: var(--fc-text); }
.detail-title { font-size: 17px; font-weight: 800; margin: 0 24px 8px 0; }
.detail-chip { display: inline-block; padding: 3px 9px; border-radius: 12px; font-size: 12px; font-weight: 700; margin-bottom: 8px; }
.detail-row { font-size: 14px; color: var(--fc-text); margin-bottom: 6px; }
.detail-row.secondary { color: var(--fc-text-secondary); }
.detail-actions { margin-top: 12px; display: flex; gap: 8px; }
.detail-open-link-btn, .detail-done-btn { flex: 1 1 auto; border: none; border-radius: 10px; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 13px; font-weight: 700; padding: 9px 12px; cursor: pointer; }
/* v1.132.65+: the Add Event modal, ported from family-week-calendar-card.js
   (same class names on purpose - see that file's own copies of these
   rules) so it's visually identical to the full card's own modal, not
   just similar. .add-event-box only overrides the sizing that differs
   from this card's smaller detail-popup .modal-box (wider, taller, more
   padding - it has a lot more fields to fit). */
.add-event-box { padding: 24px 22px 18px; width: min(92vw, 420px); max-height: 85vh; }
.add-event-tabs { display: flex; gap: 8px; margin-bottom: 4px; }
.add-event-tab-btn { flex: 1 1 0; min-height: 40px; padding: 8px 10px; border-radius: 10px; border: 2px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: var(--fc-shadow); }
.add-event-tab-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
.add-event-tab-panel { display: flex; flex-direction: column; gap: 12px; }
.field { margin-bottom: 14px; }
.field label { display: block; font-size: 13px; font-weight: 600; color: var(--fc-text-secondary); margin-bottom: 5px; }
.field input, .field textarea { width: 100%; box-sizing: border-box; font-size: 16px; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-family: inherit; }
.field textarea { resize: vertical; min-height: 60px; }
.size-btn-row { display: flex; gap: 8px; }
.size-btn { flex: 1 1 auto; min-height: 44px; border-radius: 10px; border: 2px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: var(--fc-shadow); }
.size-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
.hour-select { flex: 1 1 auto; min-height: 44px; border-radius: 10px; border: 2px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 14px; font-weight: 700; padding: 0 8px; box-shadow: var(--fc-shadow); }
.range-sep { display: flex; align-items: center; font-size: 13px; font-weight: 700; color: var(--fc-text-secondary); }
.date-picker-row { display: flex; align-items: center; gap: 8px; }
.date-picker-row input { flex: 1 1 auto; }
.add-event-date-btn, .add-event-reminder-date-btn, .add-event-end-date-btn { flex: 0 0 auto; width: 44px; height: 44px; border-radius: 10px; border: 2px solid var(--fc-border); background: var(--fc-card); font-size: 18px; cursor: pointer; box-shadow: var(--fc-shadow); }
.remind-check-row { display: flex; flex-wrap: wrap; gap: 6px; }
.remind-check-opt { display: flex; align-items: center; gap: 4px; padding: 5px 9px; border-radius: 12px; background: var(--fc-surface-alt); color: var(--fc-text); font-size: 12px; font-weight: 600; cursor: pointer; user-select: none; }
.remind-check-opt input { margin: 0; }
.remind-hint { font-size: 11px; color: var(--fc-text-secondary); margin: 5px 0 0; font-style: italic; }
.add-event-error { font-size: 12px; color: #b91c1c; background: rgba(185,28,28,0.1); border: 1px solid rgba(185,28,28,0.3); border-radius: 8px; padding: 8px 10px; margin: 4px 0 0; line-height: 1.4; }
.add-event-warn { font-size: 11px; color: #b45309; margin: 5px 0 0; font-style: italic; }
.rolldays-field { display: none; margin: 6px 0 0 0; }
.rolldays-hint { font-size: 11px; color: var(--fc-text-secondary); font-style: italic; margin: 0 0 4px; }
.rolldays-btn-row { display: flex; gap: 4px; flex-wrap: wrap; }
.rolldays-btn { border: 1px solid var(--fc-border); border-radius: 8px; padding: 6px 8px; font-size: 12px; font-weight: 700; background: var(--fc-card); color: var(--fc-text); cursor: pointer; }
.rolldays-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
.checklist-mode-btn-row { display: flex; gap: 8px; margin-bottom: 8px; }
.checklist-item-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
.checklist-item-row-text { flex: 1; }
.checklist-add-row { display: flex; gap: 8px; margin-top: 6px; }
.checklist-add-row input { flex: 1; min-height: 40px; border-radius: 10px; border: 2px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 13px; padding: 0 10px; box-shadow: var(--fc-shadow); }
.checklist-item-remove-btn { min-width: 32px; min-height: 32px; border-radius: 8px; border: 2px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: var(--fc-shadow); }
.modal-actions { display: flex; gap: 10px; margin-top: 6px; flex-wrap: wrap; }
.modal-actions button { flex: 1 1 auto; min-height: 44px; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; box-shadow: var(--fc-shadow); }
.btn-save { background: var(--fc-accent); color: var(--fc-accent-text); }
.btn-cancel { background: var(--fc-surface-alt); color: var(--fc-text); }
</style>
<div class="card-root">
<div class="header">
<div>
<div class="date-title"><span class="date-title-text"></span><span class="header-badges"></span></div>
<div class="date-sub"></div>
</div>
<div class="wx"></div>
</div>
<div class="body-scroll">
<div class="section">
<div class="section-title">Today's Events</div>
<div class="events-list"></div>
</div>
<div class="section">
<div class="section-title">Today's Meals</div>
<div class="meals-list"></div>
</div>
<div class="section">
<div class="section-title">Due Today</div>
<div class="reminders-list"></div>
</div>
<div class="msd-items today-compact-items" style="display:none"></div>
</div>
<div class="footer-actions"></div>
</div>
<div class="modal-overlay detail-overlay">
<div class="modal-box">
<button type="button" class="modal-close" aria-label="Close">&#10005;</button>
<div class="detail-chip" style="display:none;"></div>
<div class="detail-title"></div>
<div class="detail-body"></div>
<div class="detail-actions"></div>
</div>
</div>
<div class="modal-overlay add-event-overlay">
<div class="modal-box add-event-box">
<button type="button" class="modal-close add-event-close" aria-label="Close">&#10005;</button>
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
<div class="field add-event-enddate-field">
<label>End date (optional - for multi-day events)</label>
<div class="date-picker-row">
<input type="date" class="add-event-end-date" />
<button type="button" class="add-event-end-date-btn" title="Pick a date">&#128197;</button>
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
<div class="field add-event-people-field">
<label>Also for</label>
<div class="add-event-people-content"></div>
</div>
</div>
<div class="add-event-tab-panel" data-tab-panel="reminder" style="display:none">
<div class="field add-event-reminder-list-field">
<label>List</label>
<select class="hour-select add-event-reminder-list-select"></select>
</div>
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
<div class="field rolldays-field add-event-reminder-rolldays-field">
<div class="rolldays-hint">Applies only on these days (leave every day selected to roll over daily, same as before)</div>
<div class="rolldays-btn-row add-event-reminder-rolldays">${this._rolldaysBtnsHtml([])}</div>
</div>
</div>
<div class="remind-hint">Saved as a to-do in Home Assistant, not an event on your calendar - fires once at this exact time, and you can mark it done or reschedule it anytime from Home Assistant's own To-do UI. Needs the Family Hub integration installed to actually notify; set reminder notify devices under Settings.</div>
<div class="add-event-warn add-event-reminder-missing-warn" style="display:none"></div>
</div>
<div class="field add-event-checklist-field">
<label class="remind-check-opt"><input type="checkbox" class="add-event-checklist-toggle" />&#128203; Attach a checklist</label>
<div class="add-event-checklist-body" style="display:none">
<div class="checklist-mode-btn-row">
<button type="button" class="size-btn add-event-checklist-mode-btn active" data-value="custom">Just for this</button>
<button type="button" class="size-btn add-event-checklist-mode-btn" data-value="existing">Use an existing list</button>
</div>
<div class="field add-event-checklist-existing-field" style="display:none">
<select class="hour-select add-event-checklist-existing-select"></select>
</div>
<div class="add-event-checklist-custom-field">
<div class="add-event-checklist-items"></div>
<div class="checklist-add-row">
<input type="text" class="add-event-checklist-add-input" placeholder="e.g. Cleats" maxlength="200" />
<button type="button" class="btn-cancel add-event-checklist-add-btn">Add</button>
</div>
</div>
<div class="remind-hint">A "just for this" list is deleted automatically once this happens (plus a grace window) - an existing list you attach is only ever unlinked, never touched or deleted itself.</div>
</div>
</div>
<div class="field">
<label>Notes (optional)</label>
<textarea class="add-event-description" placeholder="Optional details" maxlength="255"></textarea>
</div>
<div class="add-event-error" style="display:none"></div>
<div class="modal-actions">
<button type="button" class="btn-cancel add-event-cancel">Cancel</button>
<button type="button" class="btn-save add-event-save">Save</button>
</div>
</div>
</div>
`;
    root.querySelector(".modal-close").addEventListener("click", () => this._closeDetail());
    root.querySelector(".detail-overlay").addEventListener("click", (e) => {
      if (e.target === root.querySelector(".detail-overlay")) this._closeDetail();
    });
    this._wireAddEventModal(root);
  }
  _closeDetail() {
    if (!this._root) return;
    this._root.querySelector(".detail-overlay").classList.remove("open");
  }
  _openDetail({ chip, chipColor, title, rows, actionLabel, actionHandler }) {
    const root = this._root;
    const chipEl = root.querySelector(".detail-chip");
    if (chip) {
      chipEl.style.display = "";
      chipEl.style.background = chipColor || "var(--fc-accent)";
      chipEl.style.color = "#fff";
      chipEl.textContent = chip;
    } else {
      chipEl.style.display = "none";
    }
    root.querySelector(".detail-title").textContent = title || "";
    const body = root.querySelector(".detail-body");
    body.innerHTML = (rows || [])
      .map((r) => `<div class="detail-row${r.secondary ? " secondary" : ""}">${r.text}</div>`)
      .join("");
    const actions = root.querySelector(".detail-actions");
    if (actionLabel && actionHandler) {
      actions.innerHTML = `<button type="button" class="detail-open-link-btn">${actionLabel}</button>`;
      actions.querySelector("button").addEventListener("click", actionHandler);
    } else {
      actions.innerHTML = "";
    }
    root.querySelector(".detail-overlay").classList.add("open");
  }
  _renderHeader() {
    if (!this._root) return;
    const now = new Date();
    this._root.querySelector(".date-title-text").textContent = this._config.title || "Today";
    this._root.querySelector(".date-sub").textContent = now.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    // Per-calendar custody/status badges (Settings -> Calendars -> Add
    // badge) that matched one of today's events - same small colored
    // bubbles the full card shows next to the date in Week/Month view.
    const badgesEl = this._root.querySelector(".header-badges");
    if (badgesEl) {
      badgesEl.innerHTML = (this._todayBadges || [])
        .map((b) => `<span class="custody-badge" style="background:${b.color};color:${this._textColorFor(b.color)}">${b.text}</span>`)
        .join("");
    }
    this._renderFooterActions();
  }
  // v1.132.64+: extracted out of _render()'s old inline click handlers so
  // both layouts (sectioned's per-list rows AND compact's single combined
  // list) can open the exact same detail popup for the exact same event,
  // rather than maintaining two copies of this logic.
  _openEventDetail(ev) {
    const rows = [];
    rows.push({ text: ev.allDay ? "All day" : `${this._fmtTime(ev.start)}${ev.end ? " - " + this._fmtTime(ev.end) : ""}` });
    if (ev.location) rows.push({ text: `\u{1F4CD} ${ev.location}`, secondary: true });
    if (ev.description) rows.push({ text: ev.description, secondary: true });
    this._openDetail({ chip: ev.personName, chipColor: ev.color, title: ev.summary, rows });
  }
  _openMealDetail(m) {
    const rows = [{ text: m.description || "No notes added.", secondary: !m.description }];
    this._openDetail({
      chip: m.label,
      chipColor: m.color || null,
      title: m.name,
      rows,
      actionLabel: m.link ? "\u{1F517} Open recipe link" : null,
      actionHandler: m.link ? () => window.open(m.link, "_blank", "noopener") : null,
    });
  }
  _openReminderDetail(r) {
    const rows = [{ text: `Due ${this._fmtTime(r.due)}` }];
    if (r.description) rows.push({ text: r.description, secondary: true });
    this._openDetail({
      chip: r.personName ? `Reminder • ${r.personName}` : "Reminder",
      chipColor: r.color || TODAY_REMINDER_COLOR,
      title: r.summary,
      rows,
      actionLabel: "✓ Mark done",
      actionHandler: () => {
        this._markReminderDone(r.uid, r.listEntity);
        this._closeDetail();
      },
    });
  }
  _render() {
    if (!this._root) return;
    this._renderHeader();
    const wxEl = this._root.querySelector(".wx");
    if (this._forecastToday) {
      const f = this._forecastToday;
      const high = typeof f.high === "number" ? Math.round(f.high) : "-";
      const low = typeof f.low === "number" ? Math.round(f.low) : "-";
      wxEl.textContent = `${this._wxIcon(f.condition)} ${high}°/${low}°`;
    } else {
      wxEl.textContent = "";
    }

    if (this._config.layout === "compact") {
      this._renderCompactBody();
    } else {
      this._renderSectionedBody();
    }

    this._renderFooterActions();
  }
  // The card's original layout - three separately labeled, independently
  // rendered lists. Unchanged from before the "compact" layout existed.
  _renderSectionedBody() {
    const root = this._root;
    root.querySelectorAll(".section").forEach((el) => (el.style.display = ""));
    const compactEl = root.querySelector(".today-compact-items");
    if (compactEl) compactEl.style.display = "none";

    const eventsEl = root.querySelector(".events-list");
    if (!this._todayEvents.length) {
      eventsEl.innerHTML = `<div class="empty">Nothing on the calendar today.</div>`;
    } else {
      eventsEl.innerHTML = this._todayEvents
        .map((ev, idx) => {
          const meta = ev.allDay ? "All day" : this._fmtTime(ev.start);
          return `<div class="row" data-idx="${idx}"><span class="dot" style="background:${ev.color}"></span><span class="label">${ev.summary}</span><span class="meta">${meta}</span></div>`;
        })
        .join("");
      eventsEl.querySelectorAll(".row").forEach((row) => {
        row.addEventListener("click", () => {
          const ev = this._todayEvents[parseInt(row.dataset.idx, 10)];
          if (ev) this._openEventDetail(ev);
        });
      });
    }

    const mealsEl = root.querySelector(".meals-list");
    if (!this._todayMeals.length) {
      mealsEl.innerHTML = `<div class="empty">Nothing planned yet.</div>`;
    } else {
      mealsEl.innerHTML = this._todayMeals
        .map((m, idx) => `<div class="row" data-idx="${idx}"><span class="dot" style="background:${m.color || "var(--fc-accent2)"}"></span><span class="label">${m.name}</span><span class="meta">${m.label}</span></div>`)
        .join("");
      mealsEl.querySelectorAll(".row").forEach((row) => {
        row.addEventListener("click", () => {
          const m = this._todayMeals[parseInt(row.dataset.idx, 10)];
          if (m) this._openMealDetail(m);
        });
      });
    }

    const remindersEl = root.querySelector(".reminders-list");
    if (!this._todayReminders.length) {
      remindersEl.innerHTML = `<div class="empty">No reminders due today.</div>`;
    } else {
      remindersEl.innerHTML = this._todayReminders
        .map(
          (r, idx) =>
            `<div class="row" data-idx="${idx}"><span class="dot" style="background:${r.color || TODAY_REMINDER_COLOR}"></span><span class="label">&#128276; ${r.summary}${r.personName ? ` <span class="reminder-owner">(${r.personName})</span>` : ""}</span><span class="meta">${this._fmtTime(r.due)}</span><button type="button" class="done-btn" data-uid="${r.uid}" data-list-entity="${r.listEntity}">Done</button></div>`
        )
        .join("");
      remindersEl.querySelectorAll(".done-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          btn.disabled = true;
          this._markReminderDone(btn.dataset.uid, btn.dataset.listEntity);
        });
      });
      remindersEl.querySelectorAll(".row").forEach((row) => {
        row.addEventListener("click", (e) => {
          if (e.target.closest(".done-btn")) return;
          const r = this._todayReminders[parseInt(row.dataset.idx, 10)];
          if (r) this._openReminderDetail(r);
        });
      });
    }
  }
  // v1.132.64+: household ask, verbatim - "I want to add another view to
  // Family today that is the same style as what the today area looks
  // like on month + day view." Mirrors family-week-calendar-card.js's own
  // _buildMonthSplitDetailHtml as closely as this card's own already-
  // fetched data allows: meal pills first, then events and reminders
  // combined into one time-sorted list (all-day items first, same
  // ordering _buildMonthSplitDetailHtml uses). Two differences from the
  // full card's version, both deliberate scope cuts rather than oversights:
  // no "Go to this week" button (this card has its own separate "Go to
  // Calendar" footer button already, see _renderFooterActions) and no
  // birthdays (this card never fetches birthdays_entity at all today -
  // see setConfig's own comment on that field - so there's nothing to
  // include; a future pass could add that fetch if a household asks).
  _renderCompactBody() {
    const root = this._root;
    root.querySelectorAll(".section").forEach((el) => (el.style.display = "none"));
    const compactEl = root.querySelector(".today-compact-items");
    if (!compactEl) return;
    compactEl.style.display = "";

    const mealsHtml = (this._todayMeals || [])
      .map(
        (m, idx) =>
          `<div class="msd-item mc-meal-pill" data-kind="meal" data-idx="${idx}" style="background:${m.color || "#f0e6c4"}">\u{1F37D}\u{FE0F} ${m.name}</div>`
      )
      .join("");

    const combined = [];
    (this._todayEvents || []).forEach((ev, idx) => {
      combined.push({ kind: "event", idx, start: ev.start, allDay: !!ev.allDay, color: ev.color, isReminder: false, summary: ev.summary });
    });
    (this._todayReminders || []).forEach((r, idx) => {
      combined.push({ kind: "reminder", idx, start: r.due, allDay: false, color: r.color || TODAY_REMINDER_COLOR, isReminder: true, summary: r.summary });
    });
    combined.sort((a, b) => (a.allDay === b.allDay ? a.start - b.start : a.allDay ? -1 : 1));

    const itemsHtml = combined.length
      ? combined
          .map(
            (it) =>
              `<div class="msd-item" data-kind="${it.kind}" data-idx="${it.idx}" style="background:${it.color}">` +
              `<span class="msd-item-time">${it.allDay ? "All day" : this._fmtTime(it.start)}</span>` +
              `<span class="msd-item-summary">${it.isReminder ? "&#128276; " : ""}${it.summary}</span>` +
              `</div>`
          )
          .join("")
      : `<div class="msd-empty">Nothing scheduled</div>`;

    compactEl.innerHTML = mealsHtml + itemsHtml;
    compactEl.querySelectorAll(".msd-item[data-kind]").forEach((el) => {
      el.addEventListener("click", () => {
        const idx = parseInt(el.dataset.idx, 10);
        if (el.dataset.kind === "meal") {
          const m = this._todayMeals[idx];
          if (m) this._openMealDetail(m);
        } else if (el.dataset.kind === "event") {
          const ev = this._todayEvents[idx];
          if (ev) this._openEventDetail(ev);
        } else if (el.dataset.kind === "reminder") {
          const r = this._todayReminders[idx];
          if (r) this._openReminderDetail(r);
        }
      });
    });
  }
  // Optional footer button - only rendered when a dashboard path is
  // actually configured, so cards that don't want it look unchanged. Split
  // out from _render() (and also called from setConfig via _renderHeader)
  // so the button shows up immediately from config alone, without waiting
  // on hass/data to load first.
  _renderFooterActions() {
    if (!this._root) return;
    const footerEl = this._root.querySelector(".footer-actions");
    if (!footerEl) return;
    const calendarPath = (this._config.calendar_dashboard_path || "").trim();
    // v1.132.65+: household ask, verbatim - "An option to have an add
    // button. If turned on it appears next to the go to calendar button."
    // Both buttons (either, neither, or both may be present depending on
    // config) live in one flex row rather than each being its own
    // full-width block, so "next to" is literal, not just "also in the
    // footer".
    const buttonsHtml = [];
    if (this._config.show_add_button) {
      buttonsHtml.push(`<button type="button" class="footer-add-btn">&#10133; Add</button>`);
    }
    if (calendarPath) {
      const label = this._config.calendar_button_label || "\u{1F4C5} Go to Calendar";
      buttonsHtml.push(`<button type="button" class="go-to-calendar-btn">${label}</button>`);
    }
    if (buttonsHtml.length) {
      footerEl.innerHTML = `<div class="footer-actions-row">${buttonsHtml.join("")}</div>`;
      const addBtn = footerEl.querySelector(".footer-add-btn");
      if (addBtn) addBtn.addEventListener("click", () => this._openAddEvent("calendar"));
      const calBtn = footerEl.querySelector(".go-to-calendar-btn");
      if (calBtn) calBtn.addEventListener("click", () => this._goToCalendar());
    } else {
      footerEl.innerHTML = "";
    }
  }
}

if (!customElements.get("family-today-card")) {
  customElements.define("family-today-card", FamilyTodayCard);
}

// v1.111.0+: native "Edit Card" config editor - a thin wrapper around
// Home Assistant's own <ha-form>, needed only because the new
// theme_override field's option list has to be fetched live. See
// FamilyTodayCard.getConfigElement above and FamilyHubGoalsCardEditor in
// family-hub-goals-card.js for the identical pattern/reasoning.
class FamilyTodayCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    if (!this._themeOptions) this._fetchThemeOptions();
    else this._render();
  }
  async _fetchThemeOptions() {
    this._themeOptions = [{ value: "", label: "Use device settings (default)" }];
    if (!this._hass) {
      this._render();
      return;
    }
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "theme_builder/list" });
      const custom = (result && Array.isArray(result.themes)) ? result.themes : [];
      custom.forEach((t) => {
        if (t && t.id) this._themeOptions.push({ value: t.id, label: "Theme Builder: " + (t.name || t.id) });
      });
    } catch (e) {
    }
    this._themeOptions.push({ value: "ha:__default__", label: "Home Assistant: Default" });
    const themes = (this._hass && this._hass.themes && this._hass.themes.themes) || {};
    Object.keys(themes)
      .filter((name) => name.indexOf("Theme Builder - ") !== 0)
      .sort((a, b) => a.localeCompare(b))
      .forEach((name) => this._themeOptions.push({ value: "ha:" + name, label: "Home Assistant: " + name }));
    this._render();
  }
  _schema() {
    return FamilyTodayCard._configSchema().concat([
      { name: "theme_override", selector: { select: { mode: "dropdown", options: this._themeOptions || [{ value: "", label: "Use device settings (default)" }] } } },
    ]);
  }
  _render() {
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.addEventListener("value-changed", (e) => {
        e.stopPropagation();
        this._config = e.detail.value;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = this._config || {};
    this._form.schema = this._schema();
    this._form.computeLabel = FamilyTodayCard._computeLabel;
    this._form.computeHelper = FamilyTodayCard._computeHelper;
  }
}
if (!customElements.get("family-today-card-editor")) {
  customElements.define("family-today-card-editor", FamilyTodayCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "family-today-card")) {
  window.customCards.push({
    type: "family-today-card",
    name: "Family Today",
    description: "A compact single-day companion to the Family Week Calendar card - today's events, meals, and due reminders at a glance.",
  });
}
