// ---- Family Hub shared translation helper (v1.168.76) -------------------
// __fhT(key, english, vars, mode) looks a string up in Home Assistant's
// loaded "fh_ui" translations (translations/<language>.json → fh_ui.text.*)
// and falls back to the English text written right here in the source.
// vars fill %0%, %1%, ... placeholders. mode "h" escapes the translated
// text (not the vars, which callers already prepared) for use inside HTML
// markup or an attribute value. Identical copy in every Family Hub card and
// in the Theme Builder panel - whichever loads first sets it up.
// __fhSweep(root) re-translates markup that was drawn before the language
// file finished loading (elements tagged data-fh-t / data-fh-title /
// data-fh-placeholder / data-fh-aria / data-fh-alt), but only while they
// still show the English original, so text a card later replaced with
// something else is never overwritten.
var __fhI18n = (window.__familyHubI18n = window.__familyHubI18n || { hass: null, fb: {}, loading: null, loaded: null });
var __fhEsc = function (s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
};
var __fhT = function (key, fb, vars, mode) {
  var g = window.__familyHubI18n || __fhI18n;
  if (g.fb[key] === undefined) g.fb[key] = fb;
  var str = "";
  try {
    if (g.hass && typeof g.hass.localize === "function") str = g.hass.localize("component.family_hub.fh_ui." + key) || "";
  } catch (e) {
    str = "";
  }
  if (!str) str = fb;
  if (mode === "h") str = __fhEsc(str);
  if (vars) {
    Object.keys(vars).forEach(function (k) {
      var v = vars[k];
      str = str.split("%" + k + "%").join(v === null || v === undefined ? "" : String(v));
    });
  }
  return str;
};
var __fhUseHass = function (hass) {
  if (hass && typeof hass.localize === "function") (window.__familyHubI18n || __fhI18n).hass = hass;
};
var __fhSweep = function (root) {
  if (!root || typeof root.querySelectorAll !== "function") return;
  var g = window.__familyHubI18n || __fhI18n;
  root.querySelectorAll("[data-fh-t]").forEach(function (el) {
    var key = el.getAttribute("data-fh-t");
    var fb = g.fb[key];
    if (fb === undefined) return;
    var cur = (el.textContent || "").trim();
    if (cur !== fb && cur !== el.__fhShown) return;
    var next = __fhT(key, fb);
    if (cur !== next) el.textContent = next;
    el.__fhShown = next;
  });
  [["data-fh-title", "title"], ["data-fh-placeholder", "placeholder"], ["data-fh-aria", "aria-label"], ["data-fh-alt", "alt"]].forEach(function (pair) {
    root.querySelectorAll("[" + pair[0] + "]").forEach(function (el) {
      var key = el.getAttribute(pair[0]);
      var fb = g.fb[key];
      if (fb === undefined) return;
      var cur = el.getAttribute(pair[1]);
      var shownKey = "__fhShown_" + pair[1];
      if (cur !== fb && cur !== el[shownKey]) return;
      var next = __fhT(key, fb);
      if (cur !== next) el.setAttribute(pair[1], next);
      el[shownKey] = next;
    });
  });
};
// -------------------------------------------------------------------------

(function () {
  if (window.__familyCalendarFontLoaded) return;
  window.__familyCalendarFontLoaded = true;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Varela+Round&display=swap";
  document.head.appendChild(link);
})();

// A small, fully independent companion card - "what's going on for
// everyone, right now". Reads the exact same settings_entity (the shared
// "Settings" to-do item) as the full Family Week Calendar card and
// family-today-card.js, so it automatically matches the household's
// people/colors/badges/theme with nothing new to configure. Deliberately
// built the same way family-today-card.js is - an independent card that
// fetches its own data straight from hass - rather than the "find a live
// calendar card on the page and clone its DOM" approach the new top bar
// card (v1.168.17) uses: that approach exists there only because the top
// bar has to mirror another card's exact interactive buttons. This card
// renders its own computed content, so it works on any dashboard even
// with no full calendar card present at all, same as the Today card.
//
// Each person's presence pill reads settings.userProfiles[userId].
// presenceEntity (see const.py's SETTINGS_KEY_USER_PROFILES docstring) -
// resolved to a calendar entity the same way primaryCalendar's color
// override already is: a profile whose primaryCalendar matches this
// person's calendar entity "owns" that person row, and (only when set)
// its own presenceEntity is what this card reads for the Home/Away pill.

if (!window.__familyHubThemeCache) {
  window.__familyHubThemeCache = (function () {
    const STORAGE_PREFIX = "familyHubThemeVarsCache::";
    const memory = new Map();
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
        // Corrupt/blocked localStorage - no cache to apply this time.
      }
      return null;
    }
    function set(key, vars) {
      memory.set(key, vars);
      try {
        localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(vars));
      } catch (e) {
        // Best-effort only.
      }
    }
    return { get, set };
  })();
}

class FamilyRightNowCard extends HTMLElement {
  static getStubConfig() {
    return {
      title: "Right Now",
      weather_entity: "weather.forecast_home",
    };
  }
  // Household ask: "we also got rid of the settings todo card [...] this
  // should not be an option of the family right now card" - the shared
  // Settings to-do entity is now a fixed internal implementation detail
  // (see FIXED_SETTINGS_ENTITY below), not something exposed for someone
  // to pick on this card's own Edit Card screen, since there's no longer
  // any visible settings to-do card on the dashboard for them to point it
  // at. The entity id itself hasn't changed underneath - only whether a
  // person can see/edit it here.
  static _configSchema() {
    return [
      { name: "title", selector: { text: {} } },
      // Household ask: "the right now card needs a way to select what
      // people are on it" - picks straight from the same calendar.*
      // entities every person row already keys off of (person.entity -
      // see _getPeople/_normalizeSettings), so there's nothing new to
      // configure in Settings, just filter this card's own display of
      // whoever's already set up there. Left empty (the default) shows
      // everyone, same as every dashboard using this card before this
      // option existed.
      { name: "people_entities", selector: { entity: { domain: "calendar", multiple: true } } },
      { name: "weather_entity", selector: { entity: { domain: "weather" } } },
      { name: "show_clock", selector: { boolean: {} } },
      { name: "show_weather", selector: { boolean: {} } },
      { name: "calendar_dashboard_path", selector: { text: {} } },
      { name: "calendar_button_label", selector: { text: {} } },
    ];
  }
  static _computeLabel(schema) {
    const labels = {
      title: "Title",
      people_entities: "People to show",
      weather_entity: "Weather entity",
      show_clock: "Show the clock/date",
      show_weather: "Show the weather",
      calendar_dashboard_path: "Calendar dashboard path",
      calendar_button_label: "Calendar button label",
      theme_override: "Theme",
    };
    return labels[schema.name] || undefined;
  }
  static _computeHelper(schema) {
    if (schema.name === "people_entities") {
      return "Pick one or more people to show only them on this card. Leave blank to show everyone, same as before this option existed.";
    }
    if (schema.name === "show_weather") {
      return "Turn off if this dashboard already shows the weather elsewhere.";
    }
    if (schema.name === "calendar_dashboard_path") {
      return "Optional. Set a relative path (e.g. /lovelace-family/0) to offer a 'Go to Calendar' button from this card's ⋮ menu.";
    }
    if (schema.name === "theme_override") {
      return "Pin this one card to a specific theme, or leave on \"Use device settings\" to follow the household's own Global Theme.";
    }
    return undefined;
  }
  static getConfigElement() {
    return document.createElement("family-right-now-card-editor");
  }
  // Fixed internal settings store - not a config field (see _configSchema's
  // own comment above). Reused verbatim from the pre-existing
  // config.settings_entity default of every other Family Hub companion
  // card, so this still reads the exact same household Settings data.
  static FIXED_SETTINGS_ENTITY = "todo.family_calendar_settings";
  setConfig(config) {
    config = config || {};
    this._config = {
      title: config.title || "Right Now",
      settings_entity: FamilyRightNowCard.FIXED_SETTINGS_ENTITY,
      people_entities: Array.isArray(config.people_entities)
        ? config.people_entities.filter((e) => typeof e === "string" && e)
        : [],
      weather_entity: config.weather_entity || "weather.forecast_home",
      show_clock: config.show_clock !== false,
      show_weather: config.show_weather !== false,
      calendar_dashboard_path: (config.calendar_dashboard_path || "").toString().trim(),
      calendar_button_label: (config.calendar_button_label || "").toString().trim(),
      theme_override: typeof config.theme_override === "string" ? config.theme_override : "",
      // Household ask: "should use the same background as the calendar
      // card" - set ONLY by the Family Week Calendar card's own
      // _syncRightNowTopBarMount when it creates this card embedded in
      // its own top bar/sidebar (see .card-root.embedded below) -
      // deliberately not part of _configSchema/getStubConfig above, so
      // a standalone placement of this card on an ordinary dashboard is
      // completely unaffected and keeps its own normal card look.
      embedded: config.embedded === true,
      // v1.168.61 (Right Now bar pass): when embedded, the Family Week
      // Calendar card now TELLS this card how big to be and what shape it
      // is (a horizontal "bar" across the top/phone strip, or a vertical
      // "sidebar"), instead of this card guessing from its own measured
      // height (the rows-1/2/3 ResizeObserver tiers - still used, unchanged,
      // for every standalone placement). Guessing from height is what
      // caused the fixed-height bar to leave dead space under the tiles on
      // Large and to clip tiles on phones/portrait tablets.
      embedded_size: ["small", "medium", "large"].includes(config.embedded_size) ? config.embedded_size : "",
      embedded_layout: ["bar", "sidebar"].includes(config.embedded_layout) ? config.embedded_layout : "",
      // v1.168.59: the embedded top bar's people, already resolved by the
      // Family Week Calendar card's own _getPeople() (profile-only members,
      // their extra calendars, profile-locked colors, minus the top bar's
      // exclusion list). Before this, the embedded card re-derived people
      // from settings.people alone, so a member set up only from the Users
      // tab never got a tile, extra calendars were ignored, colors could
      // differ from the calendar columns, and excluding everyone produced
      // an empty people_entities list - which this card reads as "show
      // everyone". null (the default, and every standalone placement)
      // keeps the original settings.people behavior.
      people_override: Array.isArray(config.people_override)
        ? config.people_override
            .filter((p) => p && typeof p.entity === "string" && p.entity)
            .map((p) => ({
              entity: p.entity,
              name: p.name || p.entity,
              color: p.color || "",
              badges: Array.isArray(p.badges) ? p.badges : [],
              extraEntities: Array.isArray(p.extraEntities) ? p.extraEntities.filter((e) => typeof e === "string" && e) : [],
            }))
        : null,
    };
    if (this._settingsCache === undefined) this._settingsCache = null;
    if (this._globalThemes === undefined) this._globalThemes = [];
    if (this._personEvents === undefined) this._personEvents = {};
    if (this._eventPeopleOverrides === undefined) this._eventPeopleOverrides = {};
    if (this._forecastToday === undefined) this._forecastToday = null;
    if (this._firstLoadPromise === undefined) this._firstLoadPromise = null;
    if (!this._built) this._build();
    this._applyEmbeddedLayoutClasses();
    // A changed people set (someone un-hidden in the calendar card's top
    // bar Settings, a calendar linked/unlinked) needs that person's events
    // fetched now, not up to a minute later on the next poll.
    const peopleSig = JSON.stringify(this._config.people_override ? this._config.people_override.map((p) => [p.entity, p.extraEntities]) : this._config.people_entities);
    const peopleChanged = this._peopleSig !== undefined && this._peopleSig !== peopleSig;
    this._peopleSig = peopleSig;
    if (peopleChanged && this._hass && this._settingsCache) this._fetchEvents();
    this._render();
  }
  // v1.168.61: see embedded_size/embedded_layout in setConfig. Only ever
  // adds the emb-* classes for an embedded card that was given an explicit
  // size; a standalone card (or an older calendar card that doesn't send
  // these) keeps the measured rows-1/2/3 tiers exactly as before.
  _usesExplicitEmbeddedLayout() {
    return !!(this._config && this._config.embedded && this._config.embedded_size && this._config.embedded_layout);
  }
  _applyEmbeddedLayoutClasses() {
    const cardRoot = this._root && this._root.querySelector(".card-root");
    if (!cardRoot) return;
    cardRoot.classList.remove("emb-small", "emb-medium", "emb-large", "emb-bar", "emb-sidebar");
    cardRoot.classList.toggle("embedded", !!(this._config && this._config.embedded));
    if (!this._usesExplicitEmbeddedLayout()) return;
    cardRoot.classList.remove("rows-1", "rows-2", "rows-3");
    cardRoot.classList.add(`emb-${this._config.embedded_size}`, `emb-${this._config.embedded_layout}`);
  }
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    this._ensureTranslationsLoaded();
    if (first) {
      this._firstLoadPromise = this._initFirstLoad();
    } else {
      // presence pills read this._hass.states directly - no separate
      // fetch needed, Home Assistant already pushes a fresh hass object
      // whenever a watched entity's state changes - so every ordinary
      // hass update re-renders the pills live.
      this._render();
    }
  }
  _t(key, fallback, vars) {
    let str = "";
    try {
      if (this._hass && typeof this._hass.localize === "function") {
        str = this._hass.localize(`component.family_hub.fh_ui.${key}`) || "";
      }
    } catch (e) {
      str = "";
    }
    if (!str) str = fallback;
    if (vars) {
      Object.keys(vars).forEach((k) => {
        str = str.split(`%${k}%`).join(vars[k]);
      });
    }
    return str;
  }
  _baseLanguage(lang) {
    return (lang || "en").split("-")[0].toLowerCase();
  }
  _ensureTranslationsLoaded() {
    __fhUseHass(this._hass);
    if (!this._hass || typeof this._hass.loadBackendTranslation !== "function") return;
    const lang = this._baseLanguage(this._hass.language);
    if (this._i18nLoadedLang === lang) {
      // v1.168.67 fix (GitHub issue #10 - "German localization on buttons
      // only after click on settings"): Home Assistant hands cards the hass
      // object that actually knows the newly loaded strings a moment AFTER
      // loadBackendTranslation resolves, so the redraw in .then() below
      // still ran with the old, English-only localize. Redraw once more
      // whenever a new localize arrives for the already-loaded language.
      if (this._hass.localize !== this._i18nLocalize) {
        this._i18nLocalize = this._hass.localize;
        this._onTranslationsReady();
      }
      return;
    }
    if (this._i18nLoading === lang) return;
    this._i18nLoading = lang;
    this._hass
      .loadBackendTranslation("fh_ui", "family_hub")
      .then(() => {
        this._i18nLoadedLang = lang;
        this._i18nLoading = null;
        this._i18nLocalize = this._hass.localize;
        this._onTranslationsReady();
      })
      .catch((e) => {
        this._i18nLoading = null;
        console.warn('[family_hub] failed to load "' + lang + '" translations - staying on English fallback text', e);
      });
  }
  // v1.168.67 (GitHub issue #10): dates and times follow the Home
  // Assistant user's own language and time format (Profile > Language /
  // Time format), not the browser's.
  _uiLocale() {
    const h = this._hass;
    const lang = (h && h.locale && h.locale.language) || (h && h.language) || "";
    return lang || undefined;
  }
  _uiHour12() {
    const h = this._hass;
    const tf = h && h.locale && h.locale.time_format;
    if (tf === "12") return true;
    if (tf === "24") return false;
    if (tf === "system") {
      try {
        return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12;
      } catch (e) {
        return undefined;
      }
    }
    return undefined;
  }
  _fmtDate(d, opts) {
    try {
      return d.toLocaleDateString(this._uiLocale(), opts);
    } catch (e) {
      return d.toLocaleDateString(undefined, opts);
    }
  }
  _fmtTimeOfDay(d) {
    const opts = { hour: "numeric", minute: "2-digit" };
    const hour12 = this._uiHour12();
    if (hour12 !== undefined) opts.hour12 = hour12;
    try {
      return d.toLocaleTimeString(this._uiLocale(), opts);
    } catch (e) {
      return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    }
  }
  _fmtDateTime(d) {
    const opts = { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" };
    const hour12 = this._uiHour12();
    if (hour12 !== undefined) opts.hour12 = hour12;
    try {
      return d.toLocaleString(this._uiLocale(), opts);
    } catch (e) {
      return d.toLocaleString();
    }
  }
  // Redraws everything that shows translated text.
  _onTranslationsReady() {
    this._applyTranslations();
    this._render();
  }
  _applyTranslations() {
    __fhSweep(this._root || this.shadowRoot);
    if (!this._root) return;
    this._root.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      if (el.dataset.i18nFallback === undefined) el.dataset.i18nFallback = el.textContent;
      el.textContent = this._t(key, el.dataset.i18nFallback);
    });
    this._root.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const key = el.dataset.i18nTitle;
      if (el.dataset.i18nTitleFallback === undefined) {
        el.dataset.i18nTitleFallback = el.getAttribute("title") || el.getAttribute("aria-label") || "";
      }
      const translated = this._t(key, el.dataset.i18nTitleFallback);
      if (el.hasAttribute("title")) el.setAttribute("title", translated);
      if (el.hasAttribute("aria-label")) el.setAttribute("aria-label", translated);
    });
  }
  async _initFirstLoad() {
    await this._fetchSettings();
    await this._fetchGlobalThemes();
    this._refreshAll();
    this._startPolling();
  }
  _refreshAll() {
    this._fetchEvents();
    this._fetchWeather();
  }
  _startPolling() {
    if (!this._dataInterval) {
      // Re-fetch events/weather/settings every minute - same cadence as
      // family-today-card.js's own polling.
      this._dataInterval = setInterval(() => {
        this._fetchSettings();
        this._refreshAll();
      }, 60 * 1000);
    }
    if (!this._tickInterval) {
      // A separate 1-second tick keeps the clock, the "Free"/"until"
      // progress bars, and current-vs-next status live between the
      // once-a-minute data re-fetches above, without hitting hass again.
      this._tickInterval = setInterval(() => this._render(), 1000);
    }
  }
  connectedCallback() {
    if (this._hass && !this._dataInterval) {
      if (this._firstLoadPromise) {
        this._firstLoadPromise.then(() => {
          if (this.isConnected && this._hass && !this._dataInterval) {
            this._refreshAll();
            this._startPolling();
          }
        });
      } else {
        this._refreshAll();
        this._startPolling();
      }
    } else {
      this._startPolling();
    }
    this._startSizeObserving();
  }
  disconnectedCallback() {
    if (this._dataInterval) {
      clearInterval(this._dataInterval);
      this._dataInterval = null;
    }
    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
    if (this._sizeObserver) {
      this._sizeObserver.disconnect();
      this._sizeObserver = null;
    }
  }
  // Household ask: "we want the right now to scale to fit its space 1
  // row, 2 row, 3 row etc" (follow-up on the earlier, now superseded,
  // single on/off "compact" breakpoint). Watches this card's own
  // rendered height (not the viewport, not a fixed breakpoint - whatever
  // the dashboard's grid/layout actually assigned it) and steps through
  // explicit size tiers, trimming progressively more chrome the more
  // it's squeezed instead of one abrupt cutover. Thresholds are tuned to
  // HA's own sections-view row sizing (see below). A ResizeObserver
  // rather than a one-time check because a dashboard can resize this
  // card's row/column span live in the layout editor without a page
  // reload.
  _startSizeObserving() {
    if (this._sizeObserver || typeof ResizeObserver === "undefined") return;
    // HA's sections view sizes a `rows: N` card at 64*N - 8 px (the
    // same formula the topbar card's own "2 rows = 120px" height cap is
    // built on: 1 row=56px, 2 rows=120px, 3 rows=184px, 4 rows=248px).
    // Thresholds sit at the midpoint between consecutive row counts so
    // each real row assignment lands squarely inside its own tier,
    // rather than a round-number guess that let an actual 3-row card
    // (184px) fall just short of the rows-3 tier and get stuck in
    // rows-2 instead.
    const ROWS_1_MAX = 88;  // below the 1-row/2-row midpoint (56, 120)
    const ROWS_2_MAX = 152; // below the 2-row/3-row midpoint (120, 184)
    const ROWS_3_MAX = 216; // below the 3-row/4-row midpoint (184, 248)
    this._sizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !this._root) return;
      const height = entry.contentRect ? entry.contentRect.height : this.offsetHeight;
      const cardRoot = this._root.querySelector(".card-root");
      if (!cardRoot) return;
      cardRoot.classList.remove("rows-1", "rows-2", "rows-3");
      if (this._usesExplicitEmbeddedLayout()) return;
      if (height <= 0) return;
      if (height < ROWS_1_MAX) cardRoot.classList.add("rows-1");
      else if (height < ROWS_2_MAX) cardRoot.classList.add("rows-2");
      else if (height < ROWS_3_MAX) cardRoot.classList.add("rows-3");
      // height >= ROWS_3_MAX: no tier class - full layout, unchanged.
    });
    this._sizeObserver.observe(this);
  }
  getCardSize() {
    return 3;
  }
  // --- Theme (same resolution/caching convention as every other themed
  // Family Hub card file - see family-today-card.js's own identical copy
  // for the full "why" comments; kept byte-equivalent in spirit, trimmed
  // of the per-device-override lookup this card has no concept of). ---
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
      fonts: { headerTitle: 15, event: 14, chip: 13, wxTemp: 14 },
    };
  }
  _defaultSettings() {
    return {
      people: [],
      userProfiles: {},
      theme: this._defaultTheme(),
      useGlobalTheme: true,
      globalThemeId: "slate",
      discreetModeEnabled: false,
    };
  }
  // Lenient/forward-compatible, same as family-today-card.js's own
  // _normalizeSettings - only reads the handful of fields this card
  // actually needs (people, a trimmed userProfiles, theme); anything else
  // in the shared settings blob is simply ignored.
  _normalizeSettings(parsed) {
    const defaults = this._defaultSettings();
    if (!parsed || typeof parsed !== "object") return defaults;
    const people = Array.isArray(parsed.people) ? parsed.people : defaults.people;
    const userProfiles = this._normalizeUserProfiles(parsed.userProfiles);
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
    const discreetModeEnabled = typeof parsed.discreetModeEnabled === "boolean" ? parsed.discreetModeEnabled : defaults.discreetModeEnabled;
    return { people, userProfiles, theme: { colors, fonts }, useGlobalTheme, globalThemeId, discreetModeEnabled };
  }
  // Only ever needs primaryCalendar (to find which profile "owns" a
  // calendar row) and presenceEntity (what to show) out of the full
  // user-profile shape family-week-calendar-card.js's own
  // _normalizeUserProfiles knows about - every other profile field this
  // card doesn't render is simply dropped.
  _normalizeUserProfiles(raw) {
    const result = {};
    if (!raw || typeof raw !== "object") return result;
    Object.keys(raw).forEach((userId) => {
      const p = raw[userId];
      if (!p || typeof p !== "object") return;
      result[userId] = {
        primaryCalendar: typeof p.primaryCalendar === "string" ? p.primaryCalendar.trim() : "",
        presenceEntity: typeof p.presenceEntity === "string" ? p.presenceEntity.trim() : "",
        // Household ask: "make Right Now support multiple sensors too,
        // not just presence" - same shape/order-preserving rules as the
        // full card's own _normalizeUserProfiles copy of this field.
        extraSensors: Array.isArray(p.extraSensors)
          ? p.extraSensors.map((e) => (typeof e === "string" ? e.trim() : "")).filter(Boolean)
          : [],
      };
    });
    return result;
  }
  _getSettings() {
    return this._settingsCache || this._defaultSettings();
  }
  // Discreet Mode - household-wide toggle (settings.discreetModeEnabled),
  // same shared setting family-week-calendar-card.js's own Discreet Mode
  // reads and writes from its Settings modal: "hide all sense of
  // information" by stripping event/reminder TEXT and person NAMES while
  // leaving the colored tiles/times themselves visible. Ported here with
  // the exact same semantics/numbering (never re-derived independently)
  // so a household that turns it on sees consistent redaction across
  // every Family Hub card, this one included.
  _isDiscreetMode() {
    return !!this._getSettings().discreetModeEnabled;
  }
  // Returns a bare empty string rather than placeholder text like "Busy" -
  // same "nothing at all" design choice as the main card's _discreetText.
  _discreetText(raw) {
    return this._isDiscreetMode() ? "" : raw;
  }
  // Stable per-entity "Person N" label, numbered by this person's own
  // position in the full people list every caller already has - so tiles
  // stay as distinguishable from each other as they were with real names,
  // without revealing who's who. Returns the real name unchanged when
  // discreet mode is off.
  _discreetPersonName(person, people) {
    if (!this._isDiscreetMode() || !person) return person ? person.name : person;
    const idx = (people || []).findIndex((p) => p.entity === person.entity);
    return `Person ${idx >= 0 ? idx + 1 : "?"}`;
  }
  // Same "Person N" numbering, but just the bare number as a string - for
  // the avatar's single-letter initial, which would otherwise still spell
  // out a name's first letter even with the full name hidden elsewhere.
  _discreetInitial(person, people) {
    if (!this._isDiscreetMode() || !person) return null;
    const idx = (people || []).findIndex((p) => p.entity === person.entity);
    return String(idx >= 0 ? idx + 1 : "?");
  }
  _getPeople() {
    const settings = this._getSettings();
    const palette = ["#a9c6c2", "#dba99c", "#d9bf7e", "#a8bd93", "#b9a7c9", "#cf8f6c", "#a89a83"];
    // See people_override in setConfig - an empty override is a real
    // "nobody" (everyone excluded), never "everyone".
    if (this._config && Array.isArray(this._config.people_override)) {
      return this._config.people_override.map((p, i) => ({ ...p, color: p.color || palette[i % palette.length] }));
    }
    const selected = (this._config && this._config.people_entities) || [];
    return (settings.people || [])
      .filter((p) => p && p.entity)
      // Empty selection (the default) shows everyone - see _configSchema's
      // own comment on this option.
      .filter((p) => !selected.length || selected.includes(p.entity))
      .map((p, i) => ({
        entity: p.entity,
        name: p.name || p.entity,
        color: p.color || palette[i % palette.length],
        badges: Array.isArray(p.badges) ? p.badges : [],
      }));
  }
  // {calendarEntity -> presenceEntity}, built the same way the full
  // card's own _primaryCalendarColorByEntity derives a per-entity map from
  // whichever profile's primaryCalendar links to it - see that file's own
  // comment on the pattern. Only entries with both a link AND a
  // presenceEntity actually set are included.
  _presenceByCalendarEntity() {
    const settings = this._getSettings();
    const map = {};
    const profiles = settings.userProfiles || {};
    Object.keys(profiles).forEach((userId) => {
      const p = profiles[userId];
      if (p && p.primaryCalendar && p.presenceEntity) map[p.primaryCalendar] = p.presenceEntity;
    });
    return map;
  }
  // Sibling of _presenceByCalendarEntity above, same linkage - any
  // entity at all (battery sensors, door sensors, whatever a household
  // wants a quick glance at next to this person's presence pill).
  _sensorsByCalendarEntity() {
    const settings = this._getSettings();
    const map = {};
    const profiles = settings.userProfiles || {};
    Object.keys(profiles).forEach((userId) => {
      const p = profiles[userId];
      if (p && p.primaryCalendar && Array.isArray(p.extraSensors) && p.extraSensors.length) {
        map[p.primaryCalendar] = p.extraSensors;
      }
    });
    return map;
  }
  // A battery sensor is identified by device_class (the reliable signal
  // when hass is available) or, failing that, an entity id ending in
  // "_battery" (still correct often enough to be worth the fallback for
  // a sensor whose state object hasn't loaded yet). Anything else is
  // just shown as its raw state + unit.
  _isBatterySensor(entity, stateObj) {
    if (stateObj && stateObj.attributes && stateObj.attributes.device_class === "battery") return true;
    return /_battery$/i.test(entity);
  }
  // Small pill for one configured sensor's current value - battery
  // sensors get a numeric check parsed out (so "72" and "72%" both
  // render consistently as "72%") and a low-battery color below 20%,
  // same threshold Home Assistant's own low-battery binary sensors use
  // as a rule of thumb. Anything else just shows state + unit_of_measurement
  // as-is (a friendly-enough default for a generic sensor with no
  // special-cased rendering of its own).
  _sensorPillHtml(entity) {
    if (!entity || !this._hass || !this._hass.states || !this._hass.states[entity]) return "";
    const stateObj = this._hass.states[entity];
    const isBattery = this._isBatterySensor(entity, stateObj);
    if (isBattery) {
      const pct = parseFloat(stateObj.state);
      if (Number.isNaN(pct)) return "";
      const low = pct <= 20;
      return `<span class="sensor-pill battery-pill${low ? " low-battery" : ""}" data-entity="${entity}">&#128267; ${Math.round(pct)}%</span>`;
    }
    const unit = (stateObj.attributes && stateObj.attributes.unit_of_measurement) || "";
    const raw = stateObj.state;
    if (raw === undefined || raw === null || raw === "") return "";
    return `<span class="sensor-pill" data-entity="${entity}">${raw}${unit ? ` ${unit}` : ""}</span>`;
  }
  // Household ask: "can the pills support actions like toggle, more
  // info etc" - a tap toggles an entity whose domain actually has an
  // on/off state worth flipping (same default Home Assistant's own tile
  // card uses: toggle for these domains, more-info for everything
  // else) and otherwise opens the standard Home Assistant more-info
  // dialog, same as tapping any entity row elsewhere in the frontend.
  _isToggleableEntity(entity) {
    const domain = (entity.split(".")[0] || "").toLowerCase();
    return ["switch", "light", "fan", "input_boolean", "siren", "humidifier", "valve", "cover"].includes(domain);
  }
  _onPillTap(entity) {
    if (!entity || !this._hass) return;
    if (this._isToggleableEntity(entity)) {
      this._hass.callService("homeassistant", "toggle", { entity_id: entity });
      return;
    }
    this._fireMoreInfo(entity);
  }
  // Standard Home Assistant frontend convention for a custom card to
  // open the built-in more-info dialog without reimplementing it -
  // composed:true so the event crosses this card's own shadow DOM
  // boundary and reaches the dashboard's listener for it.
  _fireMoreInfo(entity) {
    const event = new CustomEvent("hass-more-info", {
      bubbles: true,
      composed: true,
      detail: { entityId: entity },
    });
    this.dispatchEvent(event);
  }
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
    const cardOpacity = typeof g.cardOpacity === "number" ? g.cardOpacity : 100;
    const glassBlur = typeof g.glassBlur === "number" ? g.glassBlur : 0;
    return { colors, fonts, fontFamily: (typeof g.fontFamily === "string" && /^[\w\s,'"\-]{1,200}$/.test(g.fontFamily.trim()) ? g.fontFamily.trim() : ""), effects: g.effects || null, background: g.background || null, cardOpacity, glassBlur };
  }
  _resolveTheme(settings) {
    const local = settings.theme || this._defaultTheme();
    const cardOverride = this._config && this._config.theme_override;
    if (cardOverride) {
      const list = Array.isArray(this._globalThemes) ? this._globalThemes : [];
      const g = list.find((t) => t && t.id === cardOverride);
      if (g) return this._themeFromGlobalEntry(g);
    }
    if (!settings.useGlobalTheme || !settings.globalThemeId) return local;
    const list = Array.isArray(this._globalThemes) ? this._globalThemes : [];
    const g = list.find((t) => t && t.id === settings.globalThemeId);
    if (!g) return local;
    return this._themeFromGlobalEntry(g);
  }
  _familyHubThemeCacheKey() {
    const cardOverride = this._config && this._config.theme_override;
    if (cardOverride) return `card:${cardOverride}`;
    return "household";
  }
  _applyCachedThemeVarsIfAny() {
    if (!window.__familyHubThemeCache) return;
    const cached = window.__familyHubThemeCache.get(this._familyHubThemeCacheKey());
    if (!cached) return;
    Object.keys(cached).forEach((name) => {
      if (typeof cached[name] === "string") this.style.setProperty(name, cached[name]);
    });
  }
  _fhThemeBgVars(bg) {
    const img = bg && typeof bg.image === "string" && bg.image ? bg.image : "";
    if (!img) return { "--fc-bg-image": "none", "--fc-bg-overlay-image": "none", "--fc-bg-size": "cover", "--fc-bg-position": "center" };
    const ov = this._hexToRgba(/^#[0-9a-fA-F]{6}$/.test(bg.overlayColor || "") ? bg.overlayColor : "#000000", Number(bg.overlayOpacity) || 0);
    return {
      "--fc-bg-image": `url("${img.replace(/"/g, '\\"')}")`,
      "--fc-bg-overlay-image": `linear-gradient(${ov}, ${ov})`,
      "--fc-bg-size": bg.size === "repeat" ? "auto" : bg.size || "cover",
      "--fc-bg-position": bg.position || "center",
    };
  }
  _applyThemeVars() {
    const settings = this._getSettings();
    const theme = this._resolveTheme(settings);
    // v1.168.79 - Liquid Glass support (cardOpacity/glassBlur), same as
    // the other Family Hub cards: translucent card color + a blur on the
    // person tiles. 100/0 (every other theme) leaves them exactly as before.
    const cardOpacity = typeof theme.cardOpacity === "number" ? theme.cardOpacity : 100;
    const glassBlur = typeof theme.glassBlur === "number" ? theme.glassBlur : 0;
    this.classList.toggle("fh-glass", glassBlur > 0 || cardOpacity < 100);
    const vars = {
      "--fc-font-family": theme.fontFamily || "",
      "--fc-bg": theme.colors.bg,
      "--fc-card": (cardOpacity < 100 ? this._hexToRgba(theme.colors.card, cardOpacity / 100) : theme.colors.card),
      "--fc-card-menu": (cardOpacity < 88 ? this._hexToRgba(theme.colors.card, 0.88) : cardOpacity < 100 ? this._hexToRgba(theme.colors.card, cardOpacity / 100) : theme.colors.card),
      "--fc-glass-blur": `${glassBlur}px`,
      "--fc-border": theme.colors.border,
      "--fc-text": theme.colors.text,
      "--fc-text-secondary": theme.colors.textSecondary,
      "--fc-accent": theme.colors.accent,
      "--fc-accent-text": theme.colors.accentText,
      "--fc-accent2": theme.colors.accent2,
      "--fc-accent3": theme.colors.accent3,
      "--fc-surface-alt": theme.colors.surfaceAlt,
      "--fc-surface2": theme.colors.surface2,
      "--fs-header-title": `${theme.fonts.headerTitle}px`,
      "--fs-event": `${theme.fonts.event}px`,
      "--fs-chip": `${theme.fonts.chip}px`,
      "--fs-wx-temp": `${theme.fonts.wxTemp}px`,
    };
        // v1.168.79 - the theme's own background image (the Liquid Glass
    // aurora, or any image a theme sets in Theme Builder) now paints
    // behind this card too, not just the calendar/Today cards - without
    // it a glass theme's translucent surfaces only had a flat color to
    // show through, so nothing looked like glass. Always set (to "none"
    // when there's no image) so a cached earlier theme can't leave a
    // stale image behind.
    Object.assign(vars, this._fhThemeBgVars(theme.background));
    Object.keys(vars).forEach((name) => this.style.setProperty(name, vars[name]));
    if (window.__familyHubThemeCache) window.__familyHubThemeCache.set(this._familyHubThemeCacheKey(), vars);
    this._applyHeaderContrast(theme.colors.bg);
  }
  // v1.168.66 - household ask: "the heading for right now should be
  // background depending and be white if the background is dark". The
  // heading (title, clock, date, weather) sits straight on the background
  // (this card's own, or the calendar's when embedded - the same theme
  // color either way), while a theme's text color is often picked for
  // its light cards rather than a dark page background. So the heading
  // alone turns white whenever that background color is dark. A photo
  // background (holiday image) is still decided by the calendar's own
  // .bg-dark sampling instead (see the CSS).
  _isDarkColor(color) {
    if (typeof color !== "string") return null;
    const c = color.trim().toLowerCase();
    let r;
    let g;
    let b;
    let a = 1;
    let m = c.match(/^#([0-9a-f]{3,8})$/);
    if (m) {
      let hex = m[1];
      if (hex.length === 3 || hex.length === 4) hex = hex.split("").map((ch) => ch + ch).join("");
      if (hex.length !== 6 && hex.length !== 8) return null;
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
      if (hex.length === 8) a = parseInt(hex.slice(6, 8), 16) / 255;
    } else {
      m = c.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
      if (!m) return null;
      r = +m[1];
      g = +m[2];
      b = +m[3];
      if (m[4] != null) a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    }
    // mostly see-through: what's behind it is unknown, leave the theme alone
    if (!(a >= 0.5)) return null;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
  }
  _applyHeaderContrast(bgColor) {
    const root = this._root && this._root.querySelector(".card-root");
    if (!root) return;
    root.classList.toggle("head-on-dark", this._isDarkColor(bgColor) === true);
  }
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
  async _fetchGlobalThemes() {
    if (!this._hass) return;
    let custom = [];
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "theme_builder/list" });
      custom = (result && Array.isArray(result.themes)) ? result.themes : [];
    } catch (e) {
      custom = [];
    }
    this._globalThemes = custom.concat(this._nativeHaThemeEntries());
    this._applyThemeVars();
  }
  async _fetchSettings() {
    if (!this._hass) return;
    // v1.168.61 fix: this card used to read ONLY the legacy "Settings" item
    // on the to-do list - which stopped being updated when Settings moved
    // into Family Hub's own storage (family_hub/get_settings - see
    // __init__.py's _ws_set_settings: "the old to-do item is left untouched
    // ... not kept in sync going forward"). So it was working from a frozen,
    // often empty copy: no presence/sensor pills (userProfiles), stale
    // people and badges. Now the live store comes first, the same source
    // the calendar and screensaver cards already use; the legacy item is
    // only read when the store has nothing (an older backend, or an
    // install that has never saved Settings yet).
    try {
      const live = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_settings" });
      const liveSettings = live && live.settings && typeof live.settings === "object" ? live.settings : null;
      if (liveSettings && Object.keys(liveSettings).length) {
        this._settingsCache = this._normalizeSettings(liveSettings);
        this._applyThemeVars();
        this._render();
        return;
      }
    } catch (e) {
      // fall through to the legacy copy below
    }
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
    this._render();
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
  // A keyword match against a person's own badges (same shape/semantics
  // as family-today-card.js's own agenda badge matching): a "hideMatch"
  // keyword drops the event from this card entirely (e.g. a background
  // custody-schedule calendar), while a "match" keyword just prefixes the
  // event's own title with that badge's text (an emoji, typically) -
  // unlike the Today card's agenda, this card never collapses the whole
  // event into a separate bubble, since the icon IS the event line here.
  _badgePrefixFor(person, summaryLower) {
    for (const b of person.badges || []) {
      const match = (b.match || "").trim().toLowerCase();
      if (match && summaryLower.includes(match) && b.text) return b.text;
    }
    return "";
  }
  // Household ask: "we currently have a do not include in digest button
  // for badges, this should also keep it out of the family now card" -
  // same digestHide filtering __init__.py's own _build_daily_digest_message
  // already applies to the daily digest (see that function's docstring):
  // a badge with digestHide=True hides the event when EITHER its own
  // `match` (the text that makes the badge show) or its `hideMatch` (the
  // text that already hides the event from the calendar grid) is found
  // in the event summary - kept byte-equivalent in spirit to that
  // backend check so "hide from digest" means the same thing everywhere.
  _isHiddenByBadge(person, summaryLower) {
    return (person.badges || []).some((b) => {
      const hideMatch = (b.hideMatch || "").trim().toLowerCase();
      // hideMatch always hides, independent of digestHide (pre-existing
      // behavior - a background custody-schedule calendar, say).
      if (hideMatch && summaryLower.includes(hideMatch)) return true;
      // digestHide additionally hides on its own `match` keyword (the
      // same one that would otherwise just prefix the event with this
      // badge's text) - see this method's own comment above for why
      // that mirrors the backend digest's identical check exactly.
      if (b.digestHide) {
        const match = (b.match || "").trim().toLowerCase();
        if (match && summaryLower.includes(match)) return true;
      }
      return false;
    });
  }
  // Same (calendar_entity, start, summary) composite identity
  // __init__.py's own _event_override_key uses (calendar.get_events has
  // no stable uid to key off instead) - matching it exactly is what lets
  // this card look up the same "Also for" overrides the main calendar
  // card's event-info popup saves.
  _eventOverrideKey(calendarEntity, start, summary) {
    const startTs = Math.floor((start instanceof Date ? start.getTime() : start) / 1000);
    return `${calendarEntity}|${startTs}|${summary}`;
  }
  // Fetched alongside events every refresh (see _fetchEvents below) -
  // same "Also for" override store the main calendar card's event-info
  // popup writes to (family_hub/set_event_people_override), read here so
  // this card can merge a tagged event onto every OTHER person it's
  // tagged for, not just color it differently.
  async _fetchEventPeopleOverrides() {
    if (!this._hass) return;
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_event_people_overrides" });
      this._eventPeopleOverrides = (result && result.overrides && typeof result.overrides === "object") ? result.overrides : {};
    } catch (e) {
      // Family Hub not installed, or an older version without this command -
      // every event just shows on its own calendar's tile, same as before
      // this feature existed.
      this._eventPeopleOverrides = {};
    }
  }
  // Fetches a 2-day window (today through the start of the day after
  // tomorrow) per person, same calendars/{entity}?start=&end= endpoint the
  // full card and the Today card both already use. Two days rather than
  // just today so "Next: ..." still has something to find for a person
  // whose next event isn't until tomorrow - e.g. late at night once
  // today's own events are all done.
  async _fetchEvents() {
    if (!this._hass) return;
    await this._fetchEventPeopleOverrides();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const windowEnd = new Date(todayStart);
    windowEnd.setDate(windowEnd.getDate() + 2);
    const people = this._getPeople();
    const knownEntities = new Set(people.map((p) => p.entity));
    const byEntity = {};
    await Promise.all(
      people.map(async (person) => {
        if (!person.entity) return;
        try {
          // v1.168.59: a person's "also show events from" calendars
          // (extraEntities, only ever set via people_override) count toward
          // their Right Now status too, same as they're merged into that
          // person's column on the calendar card. Only the primary
          // calendar failing blanks the tile; a failed overlay just adds
          // nothing.
          const sourceEntities = Array.from(new Set([person.entity, ...(person.extraEntities || [])]));
          const fetched = await Promise.all(
            sourceEntities.map((entity, idx) =>
              this._hass
                .callApi("GET", `calendars/${entity}?start=${encodeURIComponent(todayStart.toISOString())}&end=${encodeURIComponent(windowEnd.toISOString())}`)
                .then((events) => (events || []).map((ev) => ({ ev, entity })))
                .catch((err) => {
                  if (idx === 0) throw err;
                  return [];
                })
            )
          );
          const results = [];
          const seenOccurrences = new Set();
          for (const { ev, entity: sourceEntity } of [].concat(...fetched)) {
            const start = this._toDate(ev.start);
            const end = this._toDate(ev.end);
            if (!start || !end) continue;
            const summary = ev.summary || "(untitled)";
            const summaryLower = summary.toLowerCase();
            if (this._isHiddenByBadge(person, summaryLower)) continue;
            // the same event on both the primary and an overlay calendar
            // (e.g. a shared family calendar) only counts once
            const occurrenceKey = `${start.getTime()}|${summary}`;
            if (seenOccurrences.has(occurrenceKey)) continue;
            seenOccurrences.add(occurrenceKey);
            results.push({
              summary,
              start,
              end,
              allDay: !ev.start || !ev.start.dateTime,
              badgePrefix: this._badgePrefixFor(person, summaryLower),
              calendarEntity: sourceEntity,
            });
          }
          results.sort((a, b) => a.start - b.start);
          byEntity[person.entity] = results;
        } catch (e) {
          // One bad calendar shouldn't blank out everyone else's status.
          byEntity[person.entity] = [];
        }
      })
    );
    // Household ask: "we should make the now card compatible with the
    // also for on events, if one user has something on their calendar
    // but its also for someone else, we should see it as an event for
    // both" - for every event already fetched above, look up whether
    // it's tagged "Also for" anyone else currently shown on this card
    // and, if so, merge a copy of it onto THEIR list too, so it counts
    // as a genuine current/next event for both people rather than only
    // showing (in a different color) on the calendar it actually lives
    // on, which is as far as the main week-grid's own version of this
    // feature goes.
    people.forEach((owner) => {
      if (!owner.entity) return;
      (byEntity[owner.entity] || []).forEach((ev) => {
        const key = this._eventOverrideKey(ev.calendarEntity || owner.entity, ev.start, ev.summary);
        const taggedEntities = (this._eventPeopleOverrides && this._eventPeopleOverrides[key]) || [];
        taggedEntities.forEach((taggedEntity) => {
          if (taggedEntity === owner.entity || !knownEntities.has(taggedEntity)) return;
          const taggedPerson = people.find((p) => p.entity === taggedEntity);
          if (!taggedPerson) return;
          const summaryLower = ev.summary.toLowerCase();
          // The tagged person's OWN badges still apply - someone who's
          // tagged "Also for" them but matches one of their own hideMatch
          // badges (e.g. a background custody calendar) stays hidden from
          // their tile exactly like it would if it were on their own
          // calendar directly.
          if (this._isHiddenByBadge(taggedPerson, summaryLower)) return;
          const taggedList = byEntity[taggedEntity] || (byEntity[taggedEntity] = []);
          const alreadyThere = taggedList.some((e) => e.start.getTime() === ev.start.getTime() && e.summary === ev.summary);
          if (alreadyThere) return;
          taggedList.push({
            summary: ev.summary,
            start: ev.start,
            end: ev.end,
            allDay: ev.allDay,
            badgePrefix: this._badgePrefixFor(taggedPerson, summaryLower),
            calendarEntity: ev.calendarEntity || owner.entity,
            alsoFor: true,
          });
        });
      });
    });
    Object.keys(byEntity).forEach((entity) => {
      byEntity[entity].sort((a, b) => a.start - b.start);
    });
    this._personEvents = byEntity;
    this._render();
  }
  // Picks "current" (the earliest-ending event that covers `now`,
  // preferring a timed event over an all-day one so a workout block still
  // takes priority over a multi-day "Fall Break" calendar entry sitting in
  // the background) and "next" (the earliest event that starts after
  // `now`, skipping the current one) out of a person's own fetched list.
  _statusFor(entity, now) {
    const events = this._personEvents[entity] || [];
    const timedCurrent = events
      .filter((e) => !e.allDay && e.start <= now && now < e.end)
      .sort((a, b) => a.end - b.end)[0];
    const allDayCurrent = events.find((e) => e.allDay && e.start <= now && now < e.end);
    const current = timedCurrent || allDayCurrent || null;
    const next = events.find((e) => e !== current && e.start > now) || null;
    return { current, next };
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
  _fmtTime(d) {
    return this._fmtTimeOfDay(d);
  }
  // The card editor's Title, unless it's empty or still the stock "Right
  // Now" (getStubConfig/setConfig default) - those follow the HA language.
  _customTitle() {
    const t = ((this._config && this._config.title) || "").toString().trim();
    return t && t !== "Right Now" ? t : "";
  }
  _goToCalendar() {
    const path = (this._config.calendar_dashboard_path || "").trim();
    if (!path) return;
    history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true, detail: { replace: false } }));
  }
  _textColorFor(hex) {
    const h = (hex || "#000000").replace("#", "");
    if (h.length !== 6) return "#ffffff";
    const r = parseInt(h.substr(0, 2), 16);
    const g = parseInt(h.substr(2, 2), 16);
    const b = parseInt(h.substr(4, 2), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? "#3a352c" : "#ffffff";
  }
  // Same helper every other themed Family Hub card file duplicates (see
  // the full calendar card's own copy) - used here to tint each person
  // tile's background/left border by their own color, rather than every
  // tile sharing one flat surface color.
  _hexToRgba(hex, alpha) {
    const h = (hex || "#000000").replace("#", "");
    if (h.length !== 6) return "rgba(0,0,0,0)";
    const r = parseInt(h.substr(0, 2), 16);
    const g = parseInt(h.substr(2, 2), 16);
    const b = parseInt(h.substr(4, 2), 16);
    const a = Math.max(0, Math.min(1, typeof alpha === "number" ? alpha : 1));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  _build() {
    this._built = true;
    this._applyCachedThemeVarsIfAny();
    const root = this.attachShadow ? this.attachShadow({ mode: "open" }) : this;
    this._root = root;
    root.innerHTML = `
<style>
:host {
  display: block;
  height: 100%;
  min-height: 0;
  font-family: var(--fc-font-family, "Arial Rounded MT Std", "Arial Rounded MT", "Varela Round", -apple-system, "Segoe UI Rounded", "Segoe UI", Roboto, sans-serif);
  --fc-shadow: 0 2px 8px rgba(58,53,44,0.12);
}
/* Household report: "at 2 rows its taller than 2 rows high" - root
   cause: <ha-card> (a plain child element, not this component's own
   shadow host) had no height rule of its own, so it sized itself to
   its content (shrink-to-fit/auto) like any ordinary block element.
   .card-root's own "height: 100%" below was then measured against that
   auto-height ha-card - a percentage height against an auto-height
   ancestor is defined as having no effect, so .card-root (and
   therefore the whole card) just grew to fit however tall its content
   wanted to be, ignoring whatever row height the dashboard assigned.
   Giving ha-card an explicit height: 100% completes the chain
   (:host -> ha-card -> .card-root, all now definite heights) so
   .body-scroll's existing overflow-y: auto can actually do its job -
   overflow stays inside the assigned height instead of growing past it. */
ha-card {
  display: block;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
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
  background-image: var(--fc-bg-overlay-image, none), var(--fc-bg-image, none);
  background-size: cover, var(--fc-bg-size, cover);
  background-position: center, var(--fc-bg-position, center);
  color: var(--fc-text);
  box-shadow: var(--fc-shadow);
}
/* Household ask: "should use the same background as the calendar card" -
   when embedded inside the Family Week Calendar card's own top bar/
   sidebar (config.embedded - see setConfig above), this card's own
   background/shadow/rounding would otherwise look like a second, separate
   card floating inside the calendar's own ha-card. Both already resolve
   the SAME theme vars (same settings_entity, same global-theme logic), so
   going transparent here doesn't lose the household's theme - it just
   stops drawing its own duplicate background/shadow on top of it, so it
   reads as one continuous surface instead of a card nested in a card. */
.card-root.embedded { background: transparent; box-shadow: none; border-radius: 0; padding: 6px 8px; }
/* The rule above only clears OUR OWN .card-root div - <ha-card> is a
   real Home Assistant element with its own shadow DOM that paints its
   own opaque background/shadow/radius from theme vars regardless of
   anything set on .card-root, which is why "transparent" didn't
   actually look transparent when embedded: everything below the
   content's own natural height was still that solid ha-card showing
   through, which is also what read as "a lot of empty space below the
   right now card" at the taller Large/top-bar heights. ha-card can't be
   reached inside its own shadow root, but it DOES read these as CSS
   custom properties, which inherit across the shadow boundary like any
   other custom property - setting them here on the host element itself
   reaches it. */
ha-card.embedded {
  --ha-card-background: transparent;
  --ha-card-box-shadow: none;
  --ha-card-border-radius: 0;
  --ha-card-border-width: 0;
  background: transparent;
  box-shadow: none;
}
/* Household ask: "make what is the large tiles the size of the medium
   card" - at the Large bar size (220px, clears ROWS_3_MAX so no rows-*
   tier class applies - see _startSizeObserving), tiles fall through to
   this file's own DEFAULT .person-tile sizing above, which was sized
   for a full standalone card, not a slim embedded bar - oversized next
   to the calendar regardless of which Size setting picked the bar's
   overall height. Embedded tiles always use the same compact sizing as
   the Medium tier's .rows-2 .person-tile (flex basis/min-width/padding),
   whatever the actual rows-* tier (or lack of one) the bar's own height
   lands in - Size still controls which other pieces show (header/clock/
   weather - see the rows-1/2/3 rules above), just not how big an
   individual tile is drawn. */
.card-root.embedded .person-tile { flex: 1 1 160px; min-width: 140px; padding: 6px 10px; }
/* Household ask: "the tiles themselves should have an opaque
   background" - each tile's own background is a translucent tint of
   that person's color (see the --person-bg inline style below, a 16%-
   alpha rgba()) painted over whatever's behind it. On a normal
   standalone placement that's the card's own opaque ha-card, so the
   tint reads as a soft pastel square. Embedded, ha-card/.card-root are
   now BOTH transparent (the fix just above), so that same 16%-alpha
   tint was instead picking up the calendar grid showing through behind
   it - exactly what read as "not opaque." A flat linear-gradient layer
   of the same translucent color, stacked on top of a plain opaque
   background-color layer, renders identically to the tint everywhere
   else but is fully opaque regardless of what's behind the card -
   CSS's background shorthand only allows a plain color as the LAST
   (bottommost) layer, which is why the tint has to be expressed as a
   flat two-stop gradient to sit above it rather than as a second plain
   color. */
.card-root.embedded .person-tile {
  background: linear-gradient(var(--person-bg, var(--fc-surface-alt)), var(--person-bg, var(--fc-surface-alt))), var(--fc-card, var(--fc-surface-alt));
}
/* Household ask: "make the top text content aware so if its on a dark
   background its a contrasting color" - embedded, this card is
   transparent (see ha-card.embedded above) and sits directly on top of
   the SAME full-card background the Family Week Calendar card itself
   paints (a Holiday Background photo, or the Halloween easter egg -
   see that file's own _isHolidayBackgroundDark/.fh-bg-dark, which
   already does this exact flip for its own week-nav date label for the
   identical reason). Nearly every piece of text in this card - title,
   clock, date, weather, person names, "until"/"Next" lines - already
   reads its color from --fc-text/--fc-text-secondary, so redefining
   just those two here covers all of it in one place rather than
   enumerating every selector. .bg-dark is toggled on THIS element from
   outside (_applySizeVars, right alongside the calendar's own .fh-bg-
   dark toggle - see that file) whenever the active full-card background
   samples dark; a standalone placement never gets this class, so its
   own theme-driven text color is completely unaffected. */
/* v1.168.69 fix: this used to redefine the two vars on :host, but
   _applyThemeVars sets --fc-text/--fc-text-secondary as INLINE styles on
   the host, which always beat a :host() rule - so the clock never turned
   white over a dark photo (the date/weather only looked OK because many
   themes' secondary gray reads on dark). Redefined on the heading itself
   instead, where the inline host value can't win; the person tiles keep
   the theme's text, since they sit on their own light surfaces. */
:host(.bg-dark) .header .menu-btn {
  background: rgba(255, 255, 255, 0.16);
}
/* v1.168.69: embedded in the calendar, the heading simply uses the color
   of the calendar's own week/month label (handed over as
   --fh-heading-color - see _syncRightNowHeadingColor there), which
   already adapts to the background; date and weather get a softer shade
   of it. Set on .header, since the theme vars sit inline on the host. */
:host(.fh-heading-color) .header {
  --fc-text: var(--fh-heading-color);
  --fc-text-secondary: color-mix(in srgb, var(--fh-heading-color) 80%, transparent);
}
/* v1.168.66: the heading alone goes white on a dark theme background
   (see _applyHeaderContrast). Not over a photo background - the calendar
   marks those .bg-photo and decides with .bg-dark above instead. */
:host(:not(.bg-photo):not(.fh-heading-color)) .card-root.head-on-dark .header {
  --fc-text: #fff;
  --fc-text-secondary: rgba(255, 255, 255, 0.85);
}
:host(:not(.bg-photo):not(.fh-heading-color)) .card-root.head-on-dark .header .menu-btn {
  background: rgba(255, 255, 255, 0.16);
}
.header { flex: 0 0 auto; display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; position: relative; }
.rn-title { font-size: var(--fs-header-title, 15px); font-weight: 800; color: var(--fc-text); }
.date-time-row { display: flex; align-items: baseline; gap: 8px; margin-top: 2px; }
.rn-clock { font-size: 20px; font-weight: 800; color: var(--fc-text); }
.rn-date { font-size: var(--fs-chip, 13px); color: var(--fc-text-secondary); font-weight: 600; }
.header-right { display: flex; align-items: center; gap: 8px; }
.wx { display: flex; align-items: center; gap: 6px; font-size: var(--fs-wx-temp, 14px); color: var(--fc-text-secondary); font-weight: 700; white-space: nowrap; }
.menu-wrap { position: relative; }
.menu-btn { border: none; background: var(--fc-surface-alt); color: var(--fc-text); width: 28px; height: 28px; border-radius: 8px; font-size: 16px; cursor: pointer; line-height: 1; }
.menu-dropdown { display: none; position: absolute; top: 32px; right: 0; background: var(--fc-card-menu, var(--fc-card)); backdrop-filter: blur(var(--fc-glass-blur, 0px)); -webkit-backdrop-filter: blur(var(--fc-glass-blur, 0px)); border: 1px solid var(--fc-border); border-radius: 10px; box-shadow: 0 8px 20px rgba(58,53,44,0.25); z-index: 20; min-width: 160px; overflow: hidden; }
.menu-dropdown.open { display: block; }
.menu-dropdown button { display: block; width: 100%; box-sizing: border-box; text-align: left; border: none; background: none; color: var(--fc-text); padding: 9px 12px; font-size: 13px; font-family: inherit; cursor: pointer; }
.menu-dropdown button:hover { background: var(--fc-surface-alt); }
.body-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; margin-right: -8px; padding-right: 8px; }
.people-grid { display: flex; flex-flow: row wrap; gap: 10px; align-items: stretch; }
.person-tile { flex: 1 1 220px; min-width: 200px; border-radius: 12px; padding: 10px 12px; box-sizing: border-box; border-left: 4px solid var(--person-color, var(--fc-accent)); background: var(--person-bg, var(--fc-surface-alt)); }
/* v1.168.79 - glass themes: a person tile was only a 16% tint of the
   person's color, so over the theme's background image it had no surface
   of its own. It now sits on the translucent card color and blurs the
   image behind it (the same frosted look the calendar's events have). */
:host(.fh-glass) .person-tile {
  background: linear-gradient(var(--person-bg, var(--fc-surface-alt)), var(--person-bg, var(--fc-surface-alt))), var(--fc-card, var(--fc-surface-alt));
  backdrop-filter: blur(var(--fc-glass-blur, 0px));
  -webkit-backdrop-filter: blur(var(--fc-glass-blur, 0px));
}
.person-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.avatar { width: 26px; height: 26px; border-radius: 50%; flex: 0 0 auto; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; box-shadow: var(--fc-shadow); }
.person-name { font-size: var(--fs-event, 14px); font-weight: 800; color: var(--fc-text); flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.presence-pill { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 10px; }
.presence-pill.home { background: var(--fc-accent2); color: #fff; }
/* v1.168.72: Away and sensor pills used --fc-surface2, the same color as
   the tile behind them, so the pill vanished and left faint 10px text.
   A see-through tint of the text color + a hairline outline reads on any
   tile color and in light or dark themes. */
.presence-pill.away { background: color-mix(in srgb, var(--fc-text) 9%, transparent); color: var(--fc-text); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fc-text) 22%, transparent); }
.sensor-pill { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 10px; background: color-mix(in srgb, var(--fc-text) 9%, transparent); color: var(--fc-text); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fc-text) 22%, transparent); }
.sensor-pill { font-size: 11px; }
.sensor-pill.battery-pill.low-battery { background: #c0514a; color: #fff; box-shadow: none; }
.presence-pill, .sensor-pill { cursor: pointer; -webkit-tap-highlight-color: transparent; }
.presence-pill:active, .sensor-pill:active { opacity: 0.7; }
.current-title { font-size: var(--fs-event, 14px); color: var(--fc-text); font-weight: 700; overflow-wrap: break-word; }
.current-free { font-size: var(--fs-event, 14px); color: var(--fc-text-secondary); font-style: italic; }
.progress-row { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.progress-track { flex: 1 1 auto; height: 6px; border-radius: 4px; background: var(--fc-surface2); overflow: hidden; }
.progress-fill { height: 100%; border-radius: 4px; background: var(--person-color, var(--fc-accent)); }
.current-until { flex: 0 0 auto; font-size: var(--fs-chip, 13px); color: var(--fc-text-secondary); font-weight: 600; white-space: nowrap; }
.current-until.standalone { margin-top: 3px; }
.next-label { margin-top: 6px; font-size: var(--fs-chip, 13px); color: var(--fc-text-secondary); font-weight: 600; overflow-wrap: break-word; }
.next-label.next-empty { font-style: italic; }
.next-time { font-weight: 800; color: var(--fc-text); }
.empty-people { font-size: var(--fs-event, 14px); color: var(--fc-text-secondary); font-style: italic; padding: 4px 2px; }
.empty-people-goto { margin-top: 10px; border: none; border-radius: 10px; padding: 8px 14px; font: inherit; font-size: 13px; font-weight: 800; font-style: normal; background: var(--fc-accent); color: var(--fc-accent-text, #fff); cursor: pointer; }
/* v1.168.72: on its own (not embedded, not the 1-row strip) the tiles sit
   in even columns, so a last row with fewer people no longer stretches
   one tile across the whole card. auto-fit still lets one or two people
   use the full width. */
.card-root:not(.embedded):not(.rows-1) .people-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); }
.card-root.rows-2:not(.embedded) .people-grid { grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr)); }
.card-root:not(.embedded):not(.rows-1) .person-tile { min-width: 0; }
.people-grid > .empty-people { grid-column: 1 / -1; }
.wx-now { color: var(--fc-text); font-size: calc(var(--fs-wx-temp, 14px) + 4px); font-weight: 800; }
.wx-range { font-weight: 600; }
/* Household ask: "we want the right now to scale to fit its space 1
   row, 2 row, 3 row etc" (plus the follow-up "make it be able to be
   full cards at 2 rows") - a ResizeObserver on the host (see
   _startSizeObserving) steps the card through three size tiers as its
   actual rendered height shrinks, trimming progressively more chrome
   at each step. Household report after an earlier version left full
   tiles untouched at rows-2/rows-3 ("now 2 row has a scroll bar but I
   want it to fully work in 2 rows no scroll"): a single full-detail
   tile (header + presence pill + progress bar + "Next" line) is
   already close to 120px tall on its own - there's no way for more
   than about one person's FULL tile to fit in a genuine 2-row card
   without scrolling, so rows-2/rows-3 trim tile content too, not just
   the header. Nothing here changes what happens ABOVE the largest
   tier's threshold - the card already stretches/scrolls to fill a
   taller assignment via .card-root/.body-scroll's existing
   height:100%/flex-1 rules. */

/* rows-1 (~1 row or less): the tightest tier. Header fully hidden (no
   room for clock/date/weather/menu), and each person tile collapses to
   a single-line "avatar + name + current status" chip laid out in one
   horizontal scrollable row instead of a wrapping grid. */
.card-root.rows-1 { padding: 8px 10px; }
.card-root.rows-1 .header { display: none; }
.card-root.rows-1 .body-scroll { overflow: visible; }
.card-root.rows-1 .people-grid { flex-flow: row nowrap; overflow-x: auto; overflow-y: hidden; align-items: center; gap: 8px; }
.card-root.rows-1 .person-tile { flex: 0 0 auto; min-width: 0; width: auto; display: flex; flex-direction: row; align-items: center; gap: 8px; padding: 4px 10px; white-space: nowrap; }
.card-root.rows-1 .person-head { margin-bottom: 0; }
.card-root.rows-1 .person-name { max-width: 90px; }
.card-root.rows-1 .presence-pill { display: none; }
.card-root.rows-1 .sensor-pill { display: none; }
.card-root.rows-1 .current-title,
.card-root.rows-1 .current-free { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }
.card-root.rows-1 .progress-row,
.card-root.rows-1 .current-until.standalone,
.card-root.rows-1 .next-label { display: none; }

/* rows-2 (~2 rows): no room for the header, and - per the "no scroll"
   follow-up - no room for the progress bar or "Next" line either. Tiles
   go back to a wrapping grid of small tiles (not a single scrolling
   line, there's a bit more width to work with than rows-1) that keep
   the presence pill and current status, which is what actually lets a
   normal-sized household fit inside 120px without a scrollbar. */
.card-root.rows-2 { padding: 10px 12px; }
.card-root.rows-2 .header { display: none; }
.card-root.rows-2 .people-grid { gap: 8px; }
.card-root.rows-2 .person-tile { flex: 1 1 160px; min-width: 140px; padding: 6px 10px; }
.card-root.rows-2 .person-head { margin-bottom: 2px; }
.card-root.rows-2 .progress-row,
.card-root.rows-2 .current-until.standalone,
.card-root.rows-2 .next-label { display: none; }
/* Household ask: "Medium view should keep the large card style just
   get rid of the top" - embedded in the calendar card's top bar/
   sidebar, the Medium Size setting lands right at this rows-2 tier
   (see _getRightNowTopBarSize's own 74/150/220px comment), which by
   default ALSO hides the progress bar and "Next" line above, on top of
   the header - more was hidden here than just "the top." Un-hides
   those two for the embedded case only (their own natural display
   values, restored here since the rule right above wins by class count
   otherwise), so Medium shows everything Large does except the header -
   a standalone placement of this card at this same height keeps rows-
   2's original, more compact behavior untouched. */
.card-root.embedded.rows-2 .progress-row { display: flex; }
.card-root.embedded.rows-2 .current-until.standalone,
.card-root.embedded.rows-2 .next-label { display: block; }

/* rows-3 (~3 rows): no header (household ask: "hide the top of the
   right now card if at 3" - the title bar isn't worth the space at
   this tier either, same call already made for rows-1/rows-2).
   There's enough room here for both the progress bar AND the "Next"
   line - a real 184px rows-3 card was found hiding "Next" for every
   tile (own events and "Also for" merges alike) even though the
   taller progress bar already fits fine at this tier, which made the
   "also for" merge look broken when the actual bug was this rule
   hiding the whole feature's own display regardless of where the
   event came from. */
.card-root.rows-3 .header { display: none; }
/* v1.168.61 (Right Now bar pass): explicit embedded layouts - see
   embedded_size/embedded_layout in setConfig. Only ever active on an
   embedded card given an explicit size (.emb-*), so a standalone card is
   untouched. Placed last so these win over the older .embedded rules. */
.card-root.embedded.emb-bar, .card-root.embedded.emb-sidebar { padding: 2px 2px 4px; }
.card-root.emb-bar .rn-title, .card-root.emb-sidebar .rn-title { display: none; }
.card-root.emb-bar .header, .card-root.emb-sidebar .header { align-items: center; margin-bottom: 6px; }
.card-root.emb-bar .date-time-row, .card-root.emb-sidebar .date-time-row { margin-top: 0; }
.card-root.emb-bar .rn-clock, .card-root.emb-sidebar .rn-clock { white-space: nowrap; }
.next-time { white-space: nowrap; }
/* bar: one row of equal tiles that scrolls sideways instead of wrapping
   into rows the fixed-height strip used to cut off */
.card-root.emb-bar { height: auto; }
.card-root.emb-bar .body-scroll { overflow: visible; margin-right: 0; padding-right: 0; }
.card-root.emb-bar .people-grid { flex-flow: row nowrap; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x proximity; gap: 8px; padding-bottom: 2px; scrollbar-width: thin; }
.card-root.emb-bar .person-tile { flex: 1 0 184px; min-width: 184px; max-width: 340px; scroll-snap-align: start; padding: 8px 10px; }
.card-root.emb-bar .person-head { margin-bottom: 4px; }
/* a name always keeps room for a few letters; when a tile is too narrow
   for name + Home/Away + sensor pills on one line, the pills move to a
   second line (right-aligned) instead of squeezing the name to "D." or
   cutting the pills off */
.card-root.emb-bar .person-head { flex-wrap: wrap; row-gap: 3px; }
.card-root.emb-bar .person-name { flex: 1 1 auto; min-width: 3.4em; }
.card-root.emb-bar .presence-pill, .card-root.emb-bar .sensor-pill { white-space: nowrap; padding: 2px 6px; }
.card-root.emb-bar .current-title, .card-root.emb-bar .current-free, .card-root.emb-bar .next-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-root.emb-bar .progress-row { margin-top: 4px; }
.card-root.emb-bar .next-label { margin-top: 4px; }
/* Medium keeps Large's tiles, just without the clock/weather line */
.card-root.emb-medium .header { display: none; }
/* Small: one compact chip per person - name + what they're doing */
.card-root.emb-small .header { display: none; }
.card-root.emb-small .person-tile { flex: 0 0 auto; min-width: 0; max-width: none; display: flex; flex-direction: row; align-items: center; gap: 8px; padding: 4px 10px; white-space: nowrap; }
.card-root.emb-small .person-head { margin-bottom: 0; }
.card-root.emb-small .person-name { max-width: 110px; }
.card-root.emb-small .presence-pill, .card-root.emb-small .sensor-pill,
.card-root.emb-small .progress-row, .card-root.emb-small .current-until.standalone, .card-root.emb-small .next-label { display: none; }
.card-root.emb-small .current-title, .card-root.emb-small .current-free { font-size: 12px; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* sidebar: a single column of tiles that scrolls inside the sidebar */
.card-root.emb-sidebar { height: 100%; }
.card-root.emb-sidebar .header { flex-wrap: wrap; gap: 4px 8px; }
.card-root.emb-sidebar .date-time-row { flex-wrap: wrap; row-gap: 0; }
.card-root.emb-sidebar .people-grid { flex-flow: column nowrap; gap: 8px; }
.card-root.emb-sidebar .person-tile { flex: 0 0 auto; min-width: 0; max-width: none; padding: 8px 10px; }
.card-root.emb-sidebar.emb-small .person-tile { flex-direction: row; }
</style>
<ha-card class="${this._config && this._config.embedded ? "embedded" : ""}">
<div class="card-root${this._config && this._config.embedded ? " embedded" : ""}">
  <div class="header">
    <div class="header-left">
      <div class="rn-title" data-i18n="right_now.title">Right Now</div>
      <div class="date-time-row">
        <span class="rn-clock"></span>
        <span class="rn-date"></span>
      </div>
    </div>
    <div class="header-right">
      <div class="wx"></div>
      <div class="menu-wrap">
        <button type="button" class="menu-btn" aria-label="More" data-i18n-title="common.more">&#8942;</button>
        <div class="menu-dropdown">
          <button type="button" class="menu-refresh-btn" data-i18n="right_now.refresh">Refresh</button>
          <button type="button" class="menu-goto-calendar-btn" style="display:none"></button>
        </div>
      </div>
    </div>
  </div>
  <div class="body-scroll">
    <div class="people-grid"></div>
  </div>
</div>
</ha-card>
`;
    this._wireEvents();
    // the theme may already be known (cached vars, or applied before the
    // shadow root existed) - set the heading contrast for it right away
    this._applyHeaderContrast(this.style.getPropertyValue("--fc-bg"));
  }
  _wireEvents() {
    const root = this._root;
    const menuBtn = root.querySelector(".menu-btn");
    const menuDropdown = root.querySelector(".menu-dropdown");
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      menuDropdown.classList.toggle("open");
    });
    root.addEventListener("click", (e) => {
      if (!e.composedPath().includes(menuDropdown) && !e.composedPath().includes(menuBtn)) {
        menuDropdown.classList.remove("open");
      }
    });
    // Household ask: "can the pills support actions like toggle, more
    // info etc" - presence/sensor pills (see _renderPersonTile) now
    // each carry data-entity, and a single delegated listener here
    // handles taps for every pill in every tile, present now or added
    // later by a re-render of .people-grid (a per-pill listener would
    // need re-wiring on every single render).
    root.addEventListener("click", (e) => {
      if (e.target.closest(".empty-people-goto")) {
        this._goToCalendar();
        return;
      }
      const pill = e.target.closest(".presence-pill, .sensor-pill");
      if (!pill) return;
      const entity = pill.dataset.entity;
      if (!entity) return;
      e.stopPropagation();
      this._onPillTap(entity);
    });
    root.querySelector(".menu-refresh-btn").addEventListener("click", () => {
      menuDropdown.classList.remove("open");
      this._fetchSettings();
      this._refreshAll();
    });
    root.querySelector(".menu-goto-calendar-btn").addEventListener("click", () => {
      menuDropdown.classList.remove("open");
      this._goToCalendar();
    });
  }
  _renderPersonTile(person, now, people) {
    const { current, next } = this._statusFor(person.entity, now);
    const initial = this._discreetInitial(person, people) || (person.name || "?").trim().charAt(0).toUpperCase() || "?";
    const displayName = this._discreetPersonName(person, people);
    const textColor = this._textColorFor(person.color);
    const presenceEntity = this._presenceByCalendarEntity()[person.entity] || "";
    let presenceHtml = "";
    if (presenceEntity && this._hass && this._hass.states && this._hass.states[presenceEntity]) {
      const state = this._hass.states[presenceEntity].state;
      const isHome = state === "home";
      presenceHtml = `<span class="presence-pill ${isHome ? "home" : "away"}" data-entity="${presenceEntity}">${isHome ? this._t("right_now.home", "Home") : this._t("right_now.away", "Away")}</span>`;
    }
    // Household ask: "Right Now only supports presence, make it support
    // multiple sensors too (battery, etc.)" - zero or more extra pills
    // right after the presence pill, one per configured sensor, skipping
    // any whose entity isn't currently known to hass (see _sensorPillHtml).
    const sensorEntities = this._sensorsByCalendarEntity()[person.entity] || [];
    const sensorsHtml = sensorEntities.map((e) => this._sensorPillHtml(e)).join("");
    let currentHtml;
    if (!current) {
      currentHtml = `<div class="current-free">${this._t("right_now.free", "Free")}</div>`;
    } else {
      const titleText = this._discreetText(`${current.badgePrefix ? current.badgePrefix + " " : ""}${current.summary}`);
      if (current.allDay) {
        currentHtml = `<div class="current-title">${titleText}</div><div class="current-until standalone">${this._t("right_now.all_day", "All day")}</div>`;
      } else {
        const total = current.end - current.start;
        const elapsed = now - current.start;
        const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((elapsed / total) * 100))) : 100;
        currentHtml = `<div class="current-title">${titleText}</div><div class="progress-row"><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div><div class="current-until">${this._t("right_now.until", "until %time%", { time: this._fmtTime(current.end) })}</div></div>`;
      }
    }
    let nextHtml;
    if (next) {
      const nextTitle = this._discreetText(`${next.badgePrefix ? next.badgePrefix + " " : ""}${next.summary}`);
      nextHtml = `<div class="next-label">${this._t("right_now.next", "Next:")} ${nextTitle} <span class="next-time">${next.allDay ? this._t("right_now.all_day", "All day") : this._fmtTime(next.start)}</span></div>`;
    } else {
      nextHtml = `<div class="next-label next-empty">${this._t("right_now.no_upcoming", "No upcoming events")}</div>`;
    }
    return `
<div class="person-tile" style="--person-color:${person.color};--person-bg:${this._hexToRgba(person.color, 0.16)}">
  <div class="person-head">
    <div class="avatar" style="background:${person.color};color:${textColor}">${initial}</div>
    <div class="person-name">${displayName}</div>
    ${presenceHtml}
    ${sensorsHtml}
  </div>
  ${currentHtml}
  ${nextHtml}
</div>`;
  }
  _render() {
    if (!this._root) return;
    const cfg = this._config || {};
    const now = new Date();
    const dateTimeRowEl = this._root.querySelector(".date-time-row");
    if (dateTimeRowEl) {
      dateTimeRowEl.style.display = cfg.show_clock === false ? "none" : "";
      if (cfg.show_clock !== false) {
        const clockEl = this._root.querySelector(".rn-clock");
        const clockText = this._fmtTime(now);
        if (clockEl && clockEl.textContent !== clockText) clockEl.textContent = clockText;
        const dateEl = this._root.querySelector(".rn-date");
        const dateText = this._fmtDate(now, { weekday: "long", month: "short", day: "numeric" });
        if (dateEl && dateEl.textContent !== dateText) dateEl.textContent = dateText;
      }
    }
    // v1.168.72: the card editor's Title was never shown - the heading
    // was always the translated "Right Now". A title of your own now wins;
    // the default (or none) still follows the Home Assistant language.
    const titleEl = this._root.querySelector(".rn-title");
    if (titleEl) {
      const custom = this._customTitle();
      if (custom) {
        if (titleEl.hasAttribute("data-i18n")) titleEl.removeAttribute("data-i18n");
        if (titleEl.textContent !== custom) titleEl.textContent = custom;
      } else if (!titleEl.hasAttribute("data-i18n")) {
        titleEl.setAttribute("data-i18n", "right_now.title");
        titleEl.textContent = this._t("right_now.title", "Right Now");
      }
    }
    const wxEl = this._root.querySelector(".wx");
    if (wxEl) {
      if (cfg.show_weather === false) {
        wxEl.style.display = "none";
      } else {
        wxEl.style.display = "";
        // v1.168.72: the current temperature (from the weather entity
        // itself) first, then today's high/low from the forecast
        const st = this._hass && this._hass.states && cfg.weather_entity ? this._hass.states[cfg.weather_entity] : null;
        const curRaw = st && st.attributes ? st.attributes.temperature : null;
        const cur = curRaw != null && curRaw !== "" && !isNaN(Number(curRaw)) ? Math.round(Number(curRaw)) : null;
        const f = this._forecastToday;
        const high = f && f.high != null ? Math.round(f.high) : null;
        const low = f && f.low != null ? Math.round(f.low) : null;
        const cond = st && st.state && st.state !== "unavailable" && st.state !== "unknown" ? st.state : f ? f.condition : "";
        const range = `${high != null ? high + "°" : ""}${low != null ? "/" + low + "°" : ""}`;
        const key = JSON.stringify([cond, cur, range]);
        if (wxEl.dataset.key !== key) {
          wxEl.dataset.key = key;
          wxEl.textContent = "";
          if (cur != null || range) {
            const icon = this._wxIcon(cond);
            if (icon) wxEl.appendChild(document.createTextNode(icon));
            if (cur != null) {
              const nowEl = document.createElement("span");
              nowEl.className = "wx-now";
              nowEl.textContent = `${cur}°`;
              wxEl.appendChild(nowEl);
            }
            if (range) {
              const rangeEl = document.createElement("span");
              rangeEl.className = "wx-range";
              rangeEl.textContent = range;
              wxEl.appendChild(rangeEl);
            }
          }
        }
      }
    }
    const gotoBtn = this._root.querySelector(".menu-goto-calendar-btn");
    if (gotoBtn) {
      const path = (this._config && this._config.calendar_dashboard_path) || "";
      if (path) {
        gotoBtn.style.display = "";
        gotoBtn.textContent = (this._config && this._config.calendar_button_label) || `\u{1F4C5} ${this._t("right_now.go_to_calendar", "Go to Calendar")}`;
      } else {
        gotoBtn.style.display = "none";
      }
    }
    const gridEl = this._root.querySelector(".people-grid");
    if (gridEl) {
      const people = this._getPeople();
      let gridHtml;
      if (!people.length) {
        // An embedded top bar with everyone excluded is a deliberate choice,
        // not "nothing configured yet" - say so instead.
        const allHidden = this._config && Array.isArray(this._config.people_override);
        gridHtml = allHidden
          ? `<div class="empty-people">${this._t("right_now.all_hidden", "Everyone is hidden from the Right Now bar - change who's shown in this calendar's Settings.")}</div>`
          : `<div class="empty-people">${this._t("right_now.no_people", "No people configured yet - add some on the full calendar card's Settings.")}${
              cfg.calendar_dashboard_path ? `<div><button type="button" class="empty-people-goto">\u{1F4C5} ${this._t("right_now.go_to_calendar", "Go to Calendar")}</button></div>` : ""
            }</div>`;
      } else {
        gridHtml = people.map((p) => this._renderPersonTile(p, now, people)).join("");
      }
      // v1.168.59: this runs every second (the clock tick) and on every
      // Home Assistant state push, and used to tear down and rebuild every
      // person tile each time. Tile markup only actually changes when an
      // event starts/ends, a progress bar crosses a whole percent, or a
      // presence/sensor pill changes - so skip the DOM rebuild whenever
      // the freshly built markup is identical to what's already showing.
      // Matters now that this card is embedded in the always-on calendar
      // as the Right Now top bar on wall tablets. Pill click handling is
      // delegated on the grid (see _build), so nothing is lost by keeping
      // the existing tile nodes.
      if (gridHtml !== this._lastGridHtml || gridEl.childElementCount === 0) {
        gridEl.innerHTML = gridHtml;
        this._lastGridHtml = gridHtml;
      }
    }
    // The tiles carry no data-i18n markers (they're built with _t()
    // directly), so only the static header/menu markup needs this pass -
    // once after the first render, and again by _ensureTranslationsLoaded
    // itself whenever a language's strings finish loading.
    if (!this._staticI18nApplied) {
      this._staticI18nApplied = true;
      this._applyTranslations();
    }
  }
}

if (!customElements.get("family-right-now-card")) {
  customElements.define("family-right-now-card", FamilyRightNowCard);
}

// native "Edit Card" config editor - same thin <ha-form> wrapper pattern
// as FamilyTodayCardEditor in family-today-card.js, needed only because
// the theme_override field's option list has to be fetched live.
class FamilyRightNowCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    let fetching = false;
    if (!this._themeOptions) {
      this._fetchThemeOptions();
      fetching = true;
    }
    if (!this._peopleOptions) {
      this._fetchPeopleOptions();
      fetching = true;
    }
    if (!fetching) this._render();
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
      // Best-effort only - falls back to just the default option.
    }
    this._themeOptions.push({ value: "ha:__default__", label: "Home Assistant: Default" });
    const themes = (this._hass && this._hass.themes && this._hass.themes.themes) || {};
    Object.keys(themes)
      .filter((name) => name.indexOf("Theme Builder - ") !== 0)
      .sort((a, b) => a.localeCompare(b))
      .forEach((name) => this._themeOptions.push({ value: "ha:" + name, label: "Home Assistant: " + name }));
    this._render();
  }
  // Household report: "when you open card settings for right now people
  // to show shows calendars not family hub users" - the field was a
  // plain entity picker scoped to domain:calendar, so it listed every
  // calendar.* entity in Home Assistant by its raw entity id/friendly
  // name, not the household's own configured people (their actual names,
  // from the same Settings blob every other card reads). Fetches that
  // list the same way _fetchThemeOptions fetches themes - once per
  // editor instance, re-rendering when it resolves - and _schema() below
  // swaps it in as a labeled multi-select instead of the generic entity
  // selector.
  async _fetchPeopleOptions() {
    this._peopleOptions = [];
    if (!this._hass) {
      this._render();
      return;
    }
    try {
      const result = await this._hass.connection.sendMessagePromise({
        type: "call_service",
        domain: "todo",
        service: "get_items",
        service_data: { status: ["needs_action", "completed"] },
        target: { entity_id: FamilyRightNowCard.FIXED_SETTINGS_ENTITY },
        return_response: true,
      });
      const items = (result && result.response && result.response[FamilyRightNowCard.FIXED_SETTINGS_ENTITY] && result.response[FamilyRightNowCard.FIXED_SETTINGS_ENTITY].items) || [];
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
      const people = (parsed && Array.isArray(parsed.people)) ? parsed.people : [];
      this._peopleOptions = people
        .filter((p) => p && p.entity)
        .map((p) => ({ value: p.entity, label: p.name || p.entity }));
    } catch (e) {
      this._peopleOptions = [];
    }
    this._render();
  }
  _schema() {
    const base = FamilyRightNowCard._configSchema().map((f) => {
      if (f.name === "people_entities") {
        return { name: "people_entities", selector: { select: { multiple: true, mode: "list", options: this._peopleOptions || [] } } };
      }
      return f;
    });
    return base.concat([
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
    this._form.computeLabel = FamilyRightNowCard._computeLabel;
    this._form.computeHelper = FamilyRightNowCard._computeHelper;
  }
}
if (!customElements.get("family-right-now-card-editor")) {
  customElements.define("family-right-now-card-editor", FamilyRightNowCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "family-right-now-card")) {
  window.customCards.push({
    type: "family-right-now-card",
    name: "Family Right Now",
    description: "What's going on for everyone right now - each person's current event with a progress bar (or Free), what's next, and an optional Home/Away presence pill.",
  });
}
