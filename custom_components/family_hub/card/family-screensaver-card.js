// A small companion card whose only job is to bring the Family Hub Auto
// Screen Saver to a dashboard that doesn't have the full Family Week
// Calendar card on it - a kitchen tablet's "shopping list" dashboard, a
// hallway display's "chores" dashboard, whatever else the household has.
// It reads the exact same shared screensaver settings (source, idle time,
// which logins it's on for) that the full card's own Settings modal
// configures - there's nothing new to set up here except which dashboard
// this card lives on, and (optionally) which dashboard to jump back to
// once someone taps the screen awake again.
//
// It only ever shows its own face while ITS dashboard is in edit mode - the
// rest of the time it renders nothing (zero height), but keeps running in
// the background exactly like the full card's own screensaver does. Add it
// once per dashboard that should get the screensaver, anywhere in the
// layout; where on the page it sits doesn't matter since it's invisible in
// normal (non-edit) view.
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

class FamilyScreensaverCard extends HTMLElement {
  static getStubConfig() {
    return { title: "Screen Saver", return_dashboard_path: "" };
  }
  // Same "let Home Assistant's own schema form handle it" approach as the
  // Family Today card - this card's config is just a title (shown only in
  // edit mode, so it's mostly for telling two of these apart if a household
  // ever adds more than one) and the optional wake-navigation target. The
  // wake target is ALSO editable as a friendly dropdown right on the card's
  // own face while its dashboard is in edit mode (see _renderEditFace) -
  // this form is a second, guaranteed-to-save way to set the same field via
  // the card's own "Edit Card" dialog, in case the on-card dropdown doesn't
  // persist in a given Home Assistant version (a plain card sitting in the
  // dashboard grid isn't always wired the same way a dedicated card editor
  // is for saving live edits).
  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "return_dashboard_path", selector: { navigation: {} } },
      ],
      computeLabel: (schema) => {
        const labels = {
          title: "Title (shown only while this dashboard is in edit mode)",
          return_dashboard_path: "Return to this dashboard on wake",
        };
        return labels[schema.name] || undefined;
      },
      computeHelper: (schema) => {
        if (schema.name === "return_dashboard_path") {
          return "Optional. If the screensaver falls asleep here and gets tapped awake, it jumps to this dashboard/view instead of staying on this one. Leave blank to just stay put. Also settable as a dropdown on the card itself in edit mode - use this form instead if that dropdown doesn't stick.";
        }
        if (schema.name === "title") {
          return "Purely a label for telling cards apart in edit mode - never shown once editing is done.";
        }
        return undefined;
      },
    };
  }
  // v1.111.0+: switched to getConfigElement (a real custom element) so the
  // Theme picker below can list live Theme Builder + native HA themes -
  // see family-hub-goals-card.js's identical comment for the full reasoning.
  // getConfigForm above is kept (and still used by the editor below to
  // build the title/return_dashboard_path portion of its schema) since
  // nothing about those two fields needs to change.
  static getConfigElement() {
    return document.createElement("family-hub-screensaver-card-editor");
  }
  setConfig(config) {
    config = config || {};
    // v140+: an optional wrapped `card:` (any Lovelace card config, built-in
    // or custom:*) - for a panel-view dashboard, which only ever holds
    // exactly ONE card, so this companion card couldn't previously be added
    // alongside whatever the household actually wanted showing on that
    // display. Configuring it as:
    //   type: custom:family-hub-screensaver-card
    //   card: { <the household's real single card config> }
    // makes THIS card the dashboard's one card, rendering the wrapped card
    // at full size while still running the exact same idle-timer/overlay
    // logic in the background - see _ensureScreenSaverOverlay's own
    // comment on why that overlay is appended to document.body and so
    // doesn't care what this card's own footprint looks like. Leaving
    // `card` out keeps this card's original behavior exactly as it was
    // (invisible except in edit mode) for a dashboard that already has
    // room for a second, dedicated card.
    const hasCard = config.card && typeof config.card === "object";
    this._config = {
      title: (config.title || "Screen Saver").toString(),
      return_dashboard_path: (config.return_dashboard_path || "").toString().trim(),
      card: hasCard ? config.card : null,
      // v1.111.0+: per-card Theme override - see family-hub-goals-card.js's
      // identical field/comment for the full precedence story. This card
      // never had any theming at all before this (its edit-mode "face" used
      // hardcoded colors) - _defaultTheme/_resolveTheme/_applyThemeVars
      // below are new baseline theming built from scratch, matching every
      // other standalone Family Hub card's own shape.
      theme_override: (typeof config.theme_override === "string") ? config.theme_override : "",
    };
    if (this._settingsCache === undefined) this._settingsCache = null;
    if (this._screenSaverSettingsSnapshot === undefined) this._screenSaverSettingsSnapshot = null;
    if (this._dashboards === undefined) this._dashboards = null;
    if (this._editModeInternal === undefined) this._editModeInternal = false;
    if (this._globalThemes === undefined) this._globalThemes = [];
    if (!this._built) this._build();
    if (hasCard) this._ensureWrappedCardElement();
    this._render();
  }
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (this._wrappedCardEl) this._wrappedCardEl.hass = hass;
    if (first) {
      this._firstLoadPromise = this._initFirstLoad();
    }
  }
  // Lazily creates (once) and keeps mounted the actual child card element
  // for the `card:` config option above, using Home Assistant's own
  // officially-supported `loadCardHelpers().createCardElement()` - the
  // same mechanism cards like auto-entities/layout-card use to embed an
  // arbitrary other card, rather than hand-rolling support for a handful
  // of built-in types and leaving every other custom card unsupported.
  async _ensureWrappedCardElement() {
    if (this._wrappedCardEl || !this._config.card) return;
    if (typeof window.loadCardHelpers !== "function") {
      // Extremely old frontend without the helper - not worth a manual
      // fallback for a case this unlikely; the wrapped card area just
      // stays empty and _renderWrappedCard below reports why.
      this._wrappedCardHelpersMissing = true;
      this._render();
      return;
    }
    const helpers = await window.loadCardHelpers();
    const el = helpers.createCardElement(this._config.card);
    el.hass = this._hass;
    this._wrappedCardEl = el;
    this._renderWrappedCard();
  }
  // Home Assistant's own dashboard editor sets this on any card element
  // that defines it, so the card can tell "someone is editing this
  // dashboard right now" apart from "this is just how the dashboard always
  // looks" - exactly the distinction this card exists to make. Falls back
  // to false (hidden) if the running frontend never sets it, which just
  // means this card stays invisible everywhere, same as before this
  // property existed.
  set editMode(value) {
    const next = !!value;
    if (next === this._editModeInternal) return;
    this._editModeInternal = next;
    this._render();
    if (next && this._hass && this._dashboards === null) this._fetchDashboards();
  }
  get editMode() {
    return !!this._editModeInternal;
  }
  async _initFirstLoad() {
    await this._fetchSettings();
    // v1.111.0+: always fetch (not just when useGlobalTheme is on) so a
    // per-card theme_override can resolve even when the household hasn't
    // turned on Global Theme - same change as every other themed card.
    await this._fetchGlobalThemes();
    if (this._editModeInternal) await this._fetchDashboards();
    this._setupScreenSaverActivityListeners();
    this._resetScreenSaverIdleTimer();
    this._startPolling();
  }
  // Same 60s cadence as the full card - catches a Settings change (new
  // idle time, a login toggled on/off, a new video URL) made from any
  // dashboard within a minute, without needing this card's own dashboard
  // reloaded.
  _startPolling() {
    if (this._interval) return;
    this._interval = setInterval(() => {
      this._fetchSettings();
    }, 60 * 1000);
  }
  connectedCallback() {
    if (this._hass && !this._interval) {
      if (this._firstLoadPromise) {
        this._firstLoadPromise.then(() => {
          if (this.isConnected && this._hass && !this._interval) {
            this._resetScreenSaverIdleTimer();
            this._startPolling();
          }
        });
      } else {
        this._fetchSettings();
        this._resetScreenSaverIdleTimer();
        this._startPolling();
      }
    }
    this._setupScreenSaverActivityListeners();
  }
  // Tears everything down when this card leaves the page - most commonly
  // because its dashboard/view was navigated away from. That's exactly
  // right: this dashboard is no longer the one the household is looking
  // at, so nothing here should keep counting down or holding a full-screen
  // overlay open behind the scenes. Landing back on this dashboard later
  // re-mounts the card and starts fresh, same as the full card's own
  // reconnect behavior.
  disconnectedCallback() {
    if (this._interval) clearInterval(this._interval);
    this._interval = null;
    if (this._screenSaverTimer) {
      clearTimeout(this._screenSaverTimer);
      this._screenSaverTimer = null;
    }
    if (this._screenSaverCameraInterval) {
      clearInterval(this._screenSaverCameraInterval);
      this._screenSaverCameraInterval = null;
    }
    if (this._screenSaverOverlayEl) {
      this._screenSaverOverlayEl.remove();
      this._screenSaverOverlayEl = null;
    }
    this._teardownScreenSaverActivityListeners();
  }
  // Reports a minimal footprint - this card renders at zero height outside
  // edit mode (see _render), but a masonry/sections grid still reserves
  // some space for it based on these numbers rather than truly nothing;
  // 1 row is as small as that reservation gets. Shrinking or hiding that
  // reserved slot further is a Layout-tab/grid-card limitation, not
  // something this card can opt out of on its own.
  // Delegates to the wrapped card's own size once one exists, so a
  // panel-view dashboard's masonry/sections view (if it's ever switched
  // away from true panel mode) reserves the space the actual visible
  // content needs rather than the 1-row minimum this card uses on its own.
  getCardSize() {
    if (this._wrappedCardEl && typeof this._wrappedCardEl.getCardSize === "function") {
      try {
        const size = this._wrappedCardEl.getCardSize();
        if (typeof size === "number") return size;
      } catch (e) {
        // fall through to the standalone default below
      }
    }
    return 1;
  }
  getLayoutOptions() {
    if (this._wrappedCardEl && typeof this._wrappedCardEl.getLayoutOptions === "function") {
      try {
        return this._wrappedCardEl.getLayoutOptions();
      } catch (e) {
        // fall through
      }
    }
    return { grid_rows: 1, grid_columns: "full", min_rows: 1 };
  }
  getGridOptions() {
    if (this._wrappedCardEl && typeof this._wrappedCardEl.getGridOptions === "function") {
      try {
        return this._wrappedCardEl.getGridOptions();
      } catch (e) {
        // fall through
      }
    }
    return { columns: 12, rows: 1, min_rows: 1 };
  }
  // Only the screenSaver slice of the shared settings blob is read here -
  // everything else (calendars, meal blocks, theme, ...) is simply ignored,
  // the same lenient/forward-compatible approach the Family Today card
  // takes toward the parts of Settings it doesn't render. An older or
  // newer settings shape never breaks this card; it just falls back to
  // defaults for anything it doesn't recognize.
  _defaultSettings() {
    return {
      screenSaver: {
        sourceType: "video",
        videoUrl: "",
        cameraEntity: "",
        idleSeconds: 180,
        usersEnabled: {},
      },
    };
  }
  _normalizeSettings(parsed) {
    const defaults = this._defaultSettings();
    if (!parsed || typeof parsed !== "object") return defaults;
    const parsedScreenSaver = parsed.screenSaver && typeof parsed.screenSaver === "object" ? parsed.screenSaver : {};
    const sourceType = parsedScreenSaver.sourceType === "camera" ? "camera" : "video";
    const videoUrl = typeof parsedScreenSaver.videoUrl === "string" ? parsedScreenSaver.videoUrl.trim() : defaults.screenSaver.videoUrl;
    const cameraEntity = typeof parsedScreenSaver.cameraEntity === "string" ? parsedScreenSaver.cameraEntity.trim() : defaults.screenSaver.cameraEntity;
    let idleSeconds = Number.isFinite(parsedScreenSaver.idleSeconds) ? Math.round(parsedScreenSaver.idleSeconds) : parseInt(parsedScreenSaver.idleSeconds, 10);
    if (!Number.isFinite(idleSeconds)) idleSeconds = defaults.screenSaver.idleSeconds;
    idleSeconds = Math.min(3600, Math.max(10, idleSeconds));
    const usersEnabled = {};
    if (parsedScreenSaver.usersEnabled && typeof parsedScreenSaver.usersEnabled === "object") {
      Object.keys(parsedScreenSaver.usersEnabled).forEach((userId) => {
        if (parsedScreenSaver.usersEnabled[userId]) usersEnabled[userId] = true;
      });
    }
    return { screenSaver: { sourceType, videoUrl, cameraEntity, idleSeconds, usersEnabled } };
  }
  _getSettings() {
    return this._settingsCache || this._defaultSettings();
  }
  async _fetchSettings() {
    if (!this._hass) return;
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_settings" });
      const parsed = result && result.settings && typeof result.settings === "object" ? result.settings : null;
      this._settingsCache = this._normalizeSettings(parsed);
      // v1.111.0+: _normalizeSettings above only keeps the screenSaver
      // slice this card actually renders - theme/useGlobalTheme/
      // globalThemeId live on the SAME shared settings blob but get
      // stripped out by that normalization, so a separate cache of the raw
      // response is kept just for _resolveTheme below (same lenient
      // "ignore what I don't recognize elsewhere" approach, just applied to
      // a second field this card now also cares about).
      this._themeSettingsCache = parsed && typeof parsed === "object" ? parsed : null;
    } catch (e) {
      if (!this._settingsCache) this._settingsCache = this._defaultSettings();
    }
    this._maybeResetScreenSaverIdleTimer();
    this._applyThemeVars();
  }
  // --- Baseline theming (new for this card, v1.111.0+) - applies only to
  // this card's own edit-mode "face" (the dashed-border box - see _build's
  // .card-root styles below), never to the actual full-screen screensaver
  // overlay itself (a video/camera feed with no themable surface). Same
  // shape (colors-only, no fonts) as every other simple standalone Family
  // Hub card - duplicated (not shared/imported), same "independently
  // loaded resources duplicate small helpers" convention as everything
  // else in this project. ---
  _defaultTheme() {
    return {
      colors: {
        bg: "#fbf7e5", card: "#f5f3f0", border: "#e6ddc4", text: "#423d34", textSecondary: "#96877a",
        accent: "#8f5a00", accentText: "#fff8ea", accent2: "#305545", accent3: "#b5583c",
        surfaceAlt: "#efe6cf", surface2: "#f2eede",
      },
    };
  }
  _defaultThemeSettings() {
    return { theme: this._defaultTheme(), useGlobalTheme: false, globalThemeId: "" };
  }
  // Same this-device-only theme-override key as every other standalone
  // Family Hub card - see family-hub-pantry-card.js's own
  // _getDeviceThemeOverride for the full reasoning (Settings lives only on
  // the calendar card).
  _getDeviceThemeOverride() {
    let raw = "";
    try {
      raw = localStorage.getItem("familyHubDeviceThemeOverrideLocal") || "";
    } catch (e) {
    }
    return raw;
  }
  _themeFromGlobalEntry(g) {
    const defaultTheme = this._defaultTheme();
    const colors = {};
    Object.keys(defaultTheme.colors).forEach((k) => {
      const v = g.colors && g.colors[k];
      colors[k] = typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : defaultTheme.colors[k];
    });
    const cardOpacity = typeof g.cardOpacity === "number" ? g.cardOpacity : 100;
    const glassBlur = typeof g.glassBlur === "number" ? g.glassBlur : 0;
    return { colors, cardOpacity, glassBlur };
  }
  // Reads settings.theme (the household's Theme Builder default) the same
  // way every other card's own _resolveTheme does, off the separate raw-
  // settings cache _fetchSettings keeps just for this (see its own
  // comment) rather than the screenSaver-shaped _getSettings() above.
  _resolveTheme() {
    const raw = this._themeSettingsCache;
    const settings = raw && typeof raw === "object" ? Object.assign(this._defaultThemeSettings(), raw) : this._defaultThemeSettings();
    const local = settings.theme || this._defaultTheme();
    // v1.111.0+: a per-card-placement Theme override (set from this card's
    // own native "Edit Card" dialog) wins over everything else, including
    // this device's own override and the household's Global Theme.
    const cardOverride = this._config && this._config.theme_override;
    if (cardOverride) {
      const g = (this._globalThemes || []).find((t) => t && t.id === cardOverride);
      if (g) return this._themeFromGlobalEntry(g);
    }
    const override = this._getDeviceThemeOverride();
    const useGlobalTheme = override ? override !== "__default__" : settings.useGlobalTheme;
    const globalThemeId = override ? (override === "__default__" ? "" : override) : settings.globalThemeId;
    if (!useGlobalTheme || !globalThemeId) return local;
    const g = (this._globalThemes || []).find((t) => t && t.id === globalThemeId);
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
  // v1.126.0+ - see window.__familyHubThemeCache's own comment above the
  // class for the full "why a key, not one shared blob" reasoning. Called
  // identically from here (after resolving the REAL theme) and from
  // `_build()` (before the real theme is known yet, to look up whatever
  // was cached last time) - both call sites MUST derive the same key for
  // a given card/placement, or the cache lookup in `_build()` would never
  // find what the theme-applying method just wrote for it.
  _familyHubThemeCacheKey() {
    const cardOverride = this._config && this._config.theme_override;
    if (cardOverride) return `card:${cardOverride}`;
    const deviceOverride = this._getDeviceThemeOverride();
    if (deviceOverride) return `device:${deviceOverride}`;
    return "household";
  }
  _applyThemeVars() {
    const theme = this._resolveTheme();
    const cardOpacity = typeof theme.cardOpacity === "number" ? theme.cardOpacity : 100;
    this.style.setProperty("--fc-bg", theme.colors.bg);
    this.style.setProperty("--fc-card", this._hexToRgba(theme.colors.card, cardOpacity / 100));
    this.style.setProperty("--fc-border", theme.colors.border);
    this.style.setProperty("--fc-text", theme.colors.text);
    this.style.setProperty("--fc-text-secondary", theme.colors.textSecondary);
    this.style.setProperty("--fc-accent", theme.colors.accent);
    this.style.setProperty("--fc-accent-text", theme.colors.accentText);
    // v1.126.0+: snapshot exactly what was just set/removed above into the
    // shared cache under this card/placement's key, so a future _build() can
    // apply the same values before the real fetches resolve - see
    // window.__familyHubThemeCache's own comment for the full reasoning. A
    // var not currently set on the host (e.g. --fc-bg-image when there is no
    // background image right now) is simply skipped rather than cached as an
    // empty string, so applying the cache later never clobbers a var that
    // should stay unset.
    //
    // Only caches once `_hass` is actually set - `_build()` calls this
    // method once synchronously, before `hass` is ever assigned, purely so
    // a brand-new card with nothing cached yet still shows SOME accent
    // color instead of nothing at all. At that point _resolveTheme() can't
    // have resolved a real theme_override yet, so caching THAT premature
    // fallback would overwrite a perfectly good value left by an earlier
    // page load with the wrong one, on every single reload - the opposite
    // of this fix's whole point.
    if (this._hass && window.__familyHubThemeCache) {
      const __familyHubCacheVarNames = [
      "--fc-bg",
      "--fc-card",
      "--fc-border",
      "--fc-text",
      "--fc-text-secondary",
      "--fc-accent",
      "--fc-accent-text",
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
  async _fetchGlobalThemes() {
    let custom = [];
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "theme_builder/list" });
      custom = (result && Array.isArray(result.themes)) ? result.themes : [];
    } catch (e) {
      custom = [];
    }
    // v1.111.0+: also merge in every installed native Home Assistant theme -
    // duplicated (not shared/imported) from family-week-calendar-card.js's
    // own _fetchGlobalThemes/_nativeHaThemeEntries, same "independently
    // loaded Lovelace resources duplicate small helpers" convention as
    // every native/websocket pair elsewhere in this project.
    this._globalThemes = custom.concat(this._nativeHaThemeEntries());
    this._applyThemeVars();
  }
  // --- Native HA theme support (duplicated from family-week-calendar-
  // card.js's identical methods - see that file's own comments for the
  // full reasoning on each) ---
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
    const entries = [
      {
        id: "ha:__default__",
        name: "Default (Home Assistant)",
        colors: this._haVarsToBuilderColors(this._haDefaultCssVars()),
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
          native: true,
        });
      });
    return entries;
  }
  // Populates the on-card dashboard picker (edit mode only) - listed
  // dashboards only cover Home Assistant's own configured
  // dashboards/strategy dashboards, each defaulting to that dashboard's
  // first view (view index 0); a household that wants a different specific
  // view can still fine-tune the path afterward via this card's own "Edit
  // Card" dialog (see getConfigForm), which accepts any path.
  async _fetchDashboards() {
    if (!this._hass) return;
    try {
      const list = await this._hass.connection.sendMessagePromise({ type: "lovelace/dashboards/list" });
      this._dashboards = Array.isArray(list) ? list : [];
    } catch (e) {
      this._dashboards = [];
    }
    this._renderEditFace();
  }
  // Whether the current login should ever arm the idle timer - identical
  // rule to the full card's own _screenSaverApplicable (same shared
  // settings, same per-login opt-in), just without that card's own
  // recipe-detail gate since this card never has a recipe view open on it.
  _screenSaverApplicable() {
    if (!this._hass || !this._hass.user || !this._hass.user.id) return false;
    const ss = this._getSettings().screenSaver;
    if (!ss) return false;
    const hasSource = ss.sourceType === "camera" ? !!ss.cameraEntity : !!ss.videoUrl;
    if (!hasSource) return false;
    return !!(ss.usersEnabled && ss.usersEnabled[this._hass.user.id]);
  }
  // v134+: same fix as the full calendar card's own
  // _maybeResetScreenSaverIdleTimer - this card's 60s settings poll
  // (_startPolling) used to call _resetScreenSaverIdleTimer() on every
  // single tick regardless of whether anything actually changed, which
  // clobbered and restarted any real idle countdown longer than 60s (the
  // poll interval - and the default idle time, 180s, is already above it)
  // before it could ever reach _showScreenSaver(). Only the real reset
  // fires when the screenSaver settings sub-object actually changed since
  // the last check (or on the very first call after this card loads).
  _maybeResetScreenSaverIdleTimer() {
    const key = JSON.stringify(this._getSettings().screenSaver || null);
    if (key === this._screenSaverSettingsSnapshot) return;
    this._screenSaverSettingsSnapshot = key;
    this._resetScreenSaverIdleTimer();
  }
  _resetScreenSaverIdleTimer() {
    if (this._screenSaverTimer) {
      clearTimeout(this._screenSaverTimer);
      this._screenSaverTimer = null;
    }
    if (!this._screenSaverApplicable()) return;
    if (this._screenSaverOverlayEl && this._screenSaverOverlayEl.style.display !== "none") return;
    const seconds = this._getSettings().screenSaver.idleSeconds || 180;
    this._screenSaverTimer = setTimeout(() => this._showScreenSaver(), seconds * 1000);
  }
  // Same document.body-level overlay trick as the full card's own
  // _ensureScreenSaverOverlay (see its comment there for the full "why") -
  // appended outside every shadow root and outside <ha-card>/Home
  // Assistant's own app shell so position:fixed actually reaches the real
  // viewport instead of getting trapped inside a containing block further
  // up the tree.
  _ensureScreenSaverOverlay() {
    if (this._screenSaverOverlayEl && this._screenSaverOverlayEl.isConnected) return this._screenSaverOverlayEl;
    const el = document.createElement("div");
    el.setAttribute("data-family-hub-screensaver", "");
    Object.assign(el.style, {
      position: "fixed",
      top: "0",
      left: "0",
      right: "0",
      bottom: "0",
      zIndex: "2147483000",
      background: "#000",
      display: "none",
      alignItems: "stretch",
      justifyContent: "stretch",
      cursor: "pointer",
    });
    const video = document.createElement("video");
    video.className = "screensaver-video";
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.setAttribute("playsinline", "");
    Object.assign(video.style, { width: "100%", height: "100%", objectFit: "cover", background: "#000", display: "none" });
    const img = document.createElement("img");
    img.className = "screensaver-camera-image";
    img.alt = "";
    Object.assign(img.style, { width: "100%", height: "100%", objectFit: "cover", background: "#000", display: "none" });
    el.appendChild(video);
    el.appendChild(img);
    el.addEventListener("pointerdown", () => this._hideScreenSaver());
    document.body.appendChild(el);
    this._screenSaverOverlayEl = el;
    return el;
  }
  _showScreenSaver() {
    if (!this._screenSaverApplicable()) return;
    const overlay = this._ensureScreenSaverOverlay();
    const ss = this._getSettings().screenSaver;
    const videoEl = overlay.querySelector(".screensaver-video");
    const imgEl = overlay.querySelector(".screensaver-camera-image");
    if (ss.sourceType === "camera") {
      if (videoEl) {
        videoEl.pause();
        videoEl.style.display = "none";
      }
      if (imgEl) imgEl.style.display = "";
      this._updateScreenSaverCameraImage();
      if (!this._screenSaverCameraInterval) {
        this._screenSaverCameraInterval = setInterval(() => this._updateScreenSaverCameraImage(), 10000);
      }
    } else {
      if (imgEl) imgEl.style.display = "none";
      if (videoEl) {
        videoEl.style.display = "";
        if (videoEl.getAttribute("src") !== ss.videoUrl) videoEl.setAttribute("src", ss.videoUrl);
        videoEl.currentTime = 0;
        const playResult = videoEl.play();
        if (playResult && typeof playResult.catch === "function") playResult.catch(() => {});
      }
    }
    overlay.style.display = "flex";
  }
  // Dismissing the screensaver is also the "wake" moment for the
  // return-to-dashboard behavior this card exists to add: if a return
  // dashboard is configured, this is where the household actually lands
  // back somewhere useful instead of staying on whatever dashboard happened
  // to be showing when it fell asleep.
  _hideScreenSaver() {
    const overlay = this._screenSaverOverlayEl;
    if (!overlay || overlay.style.display === "none") return;
    overlay.style.display = "none";
    const videoEl = overlay.querySelector(".screensaver-video");
    if (videoEl) videoEl.pause();
    if (this._screenSaverCameraInterval) {
      clearInterval(this._screenSaverCameraInterval);
      this._screenSaverCameraInterval = null;
    }
    this._resetScreenSaverIdleTimer();
    this._goToReturnDashboard();
  }
  _updateScreenSaverCameraImage() {
    if (!this._hass) return;
    const overlay = this._screenSaverOverlayEl;
    const imgEl = overlay && overlay.querySelector(".screensaver-camera-image");
    if (!imgEl) return;
    const ss = this._getSettings().screenSaver;
    const entityId = ss && ss.cameraEntity;
    const state = entityId && this._hass.states[entityId];
    const picture = state && state.attributes && state.attributes.entity_picture;
    if (!picture) return;
    const sep = picture.indexOf("?") === -1 ? "?" : "&";
    imgEl.src = `${picture}${sep}fhts=${Date.now()}`;
  }
  // Bound to document/window rather than this card's own shadow root - the
  // full card can rely on its own root because it's the thing filling the
  // screen, but this card is a near-invisible sliver on a foreign
  // dashboard, so "activity anywhere on the page" is the only definition
  // of "not idle" that makes sense here. The overlay's own pointerdown
  // listener (set up in _ensureScreenSaverOverlay) handles dismissing an
  // already-showing screensaver; these listeners only need to worry about
  // resetting the countdown during ordinary use of whatever else is on the
  // page.
  _setupScreenSaverActivityListeners() {
    if (this._screenSaverActivityBound) return;
    this._screenSaverActivityBound = true;
    this._boundScreenSaverActivity = () => this._resetScreenSaverIdleTimer();
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach((evt) => {
      document.addEventListener(evt, this._boundScreenSaverActivity, { passive: true });
    });
  }
  _teardownScreenSaverActivityListeners() {
    if (!this._screenSaverActivityBound) return;
    this._screenSaverActivityBound = false;
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach((evt) => {
      document.removeEventListener(evt, this._boundScreenSaverActivity);
    });
    this._boundScreenSaverActivity = null;
  }
  // Same client-side navigation mechanism as the full card's own
  // dashboard-jump buttons (e.g. Family Today's _goToCalendar) - pushState
  // plus a "location-changed" event lets Home Assistant's own router swap
  // views instantly rather than a full page reload.
  _goToReturnDashboard() {
    const path = (this._config.return_dashboard_path || "").trim();
    if (!path) return;
    history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true, detail: { replace: false } }));
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
font-family: "Arial Rounded MT Std", "Arial Rounded MT", "Varela Round", -apple-system, "Segoe UI Rounded", "Segoe UI", Roboto, sans-serif;
/* v1.111.0+ defaults - same palette every other standalone Family Hub
   card's own _defaultTheme() returns, overridden by _applyThemeVars
   (inline style on the host, so it always wins over these) once
   settings/theme_override resolve. See this card's own _defaultTheme
   comment for why this card never had any of this before. */
--fc-bg: #fbf7e5;
--fc-card: #f5f3f0;
--fc-border: #e6ddc4;
--fc-text: #423d34;
--fc-text-secondary: #96877a;
--fc-accent: #8f5a00;
--fc-accent-text: #fff8ea;
}
:host(.fh-ss-hidden) {
height: 0;
min-height: 0;
overflow: hidden;
pointer-events: none;
}
.card-root {
box-sizing: border-box;
padding: 14px 16px;
border-radius: 14px;
background: var(--fc-card);
border: 2px dashed var(--fc-border);
color: var(--fc-text);
}
.title-row { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 800; margin-bottom: 4px; }
.badge { display: inline-flex; align-items: center; justify-content: center; padding: 2px 8px; border-radius: 10px; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; }
.hint { font-size: 12px; color: var(--fc-text-secondary); margin-bottom: 10px; line-height: 1.5; }
.field { margin-bottom: 4px; }
.field label { display: block; font-size: 12px; font-weight: 700; margin-bottom: 4px; }
.field select { width: 100%; box-sizing: border-box; font-size: 14px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-bg); color: var(--fc-text); font-family: inherit; }
.status { font-size: 11px; color: var(--fc-text-secondary); margin-top: 8px; font-style: italic; }
.wrapped-card-host { display: none; }
.wrapped-card-host.active { display: block; }
</style>
<div class="wrapped-card-host"></div>
<div class="card-root">
<div class="title-row"><span class="title-text"></span><span class="badge">Edit-mode only</span></div>
<div class="hint">Invisible once you're done editing this dashboard - it keeps the screensaver running in the background from wherever it's placed. Screen source, idle time, and which logins it's on for are all set from the full calendar card's own Settings &rarr; Screen Saver section.</div>
<div class="field">
<label>Return to this dashboard on wake</label>
<select class="return-dashboard-select">
<option value="">Stay on this dashboard</option>
</select>
</div>
<div class="status"></div>
</div>
`;
    root.querySelector(".return-dashboard-select").addEventListener("change", (e) => {
      const value = e.target.value || "";
      this._config = Object.assign({}, this._config, { return_dashboard_path: value });
      // Bubbles up through hui-card the same way a dedicated card editor's
      // own live edits do, so a dashboard editor that's listening for it
      // saves the change immediately. If a given Home Assistant version
      // doesn't wire that up for a plain card sitting in the view (rather
      // than the "Edit Card" dialog's own editor element), the getConfigForm
      // field above is the guaranteed-to-save alternative for the same
      // setting.
      this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config: this._config } }));
      this._updateStatus();
    });
    // v1.126.0+: this used to unconditionally call `_applyThemeVars()` here
    // too, but that ran the REAL theme resolution before `_hass`/
    // `_globalThemes` could possibly have anything in them yet, so it
    // always resolved to the plain local default - harmless on its own
    // (identical to this same class's `:host` CSS defaults, so it was a
    // visual no-op) until `_applyThemeVars()` also started caching its
    // result: then this call would immediately overwrite whatever
    // `_applyCachedThemeVarsIfAny()` just applied at the top of this same
    // `_build()` with that same premature default, defeating the whole
    // fix for this card specifically. Removed - `_applyCachedThemeVars
    // IfAny()` already covers the "show something before hass is set" job
    // this line used to do, and the real `_applyThemeVars()` still runs
    // (and re-caches) once `_fetchSettings`/`_fetchGlobalThemes` resolve
    // for real, same as it always has.
  }
  _render() {
    if (!this._root) return;
    const hasCard = !!this._config.card;
    // With a wrapped card configured, this card is meant to be the
    // dashboard's actual visible content (a panel view's one-and-only
    // card) - never hidden, and the dashed-border "edit-mode only" face
    // never shown, since there's no separate real content sitting
    // alongside it the way there is for the standalone companion use.
    this.classList.toggle("fh-ss-hidden", !hasCard && !this._editModeInternal);
    this._root.querySelector(".card-root").style.display = hasCard ? "none" : "";
    this._root.querySelector(".wrapped-card-host").classList.toggle("active", hasCard);
    if (hasCard) {
      this._renderWrappedCard();
      return;
    }
    this._root.querySelector(".title-text").textContent = this._config.title || "Screen Saver";
    if (this._editModeInternal) this._renderEditFace();
  }
  _renderWrappedCard() {
    const host = this._root && this._root.querySelector(".wrapped-card-host");
    if (!host) return;
    if (this._wrappedCardEl) {
      if (this._wrappedCardEl.parentElement !== host) host.appendChild(this._wrappedCardEl);
      return;
    }
    if (this._wrappedCardHelpersMissing) {
      host.textContent = "This frontend version can't embed another card here - update Home Assistant, or use this card standalone instead.";
    }
  }
  _renderEditFace() {
    const root = this._root;
    if (!root) return;
    const select = root.querySelector(".return-dashboard-select");
    const current = this._config.return_dashboard_path || "";
    const dashboards = Array.isArray(this._dashboards) ? this._dashboards : [];
    const options = [{ value: "", label: "Stay on this dashboard" }].concat(
      dashboards
        .filter((d) => d && d.url_path)
        .map((d) => ({ value: `/${d.url_path}/0`, label: d.title || d.url_path }))
    );
    // A manually-typed path (set via YAML or the Edit Card dialog) that
    // doesn't match any listed dashboard's default view still needs to show
    // up as selected rather than silently reverting the dropdown to "Stay
    // on this dashboard" - added as its own option so the picker never
    // contradicts what's actually configured.
    if (current && !options.some((o) => o.value === current)) {
      options.push({ value: current, label: current });
    }
    select.innerHTML = options.map((o) => `<option value="${o.value.replace(/"/g, "&quot;")}">${o.label}</option>`).join("");
    select.value = current;
    this._updateStatus();
  }
  _updateStatus() {
    const root = this._root;
    if (!root) return;
    const statusEl = root.querySelector(".status");
    if (!statusEl) return;
    const applicable = this._screenSaverApplicable();
    if (!applicable) {
      statusEl.textContent = "Screensaver isn't active for your current login yet - enable it under the calendar card's Settings → Screen Saver → Enable for these logins.";
    } else {
      const path = (this._config.return_dashboard_path || "").trim();
      statusEl.textContent = path ? `Active for your login - wakes back to ${path}.` : "Active for your login - stays on this dashboard when woken.";
    }
  }
}

if (!customElements.get("family-hub-screensaver-card")) {
  customElements.define("family-hub-screensaver-card", FamilyScreensaverCard);
}

// v1.111.0+: dedicated editor element for getConfigElement above - same
// pattern as family-hub-goals-card.js's own editor (see that file's
// comments for the full reasoning on each duplicated helper). Reuses
// getConfigForm's own title/return_dashboard_path schema/labels/helpers
// for those two fields, only adding the new theme_override field on top.
class FamilyScreensaverCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    if (!this._themeOptions) this._fetchThemeOptions();
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
  _formData() {
    return {
      title: this._config.title,
      return_dashboard_path: this._config.return_dashboard_path,
      theme_override: (typeof this._config.theme_override === "string") ? this._config.theme_override : "",
    };
  }
  _schema() {
    const base = FamilyScreensaverCard.getConfigForm().schema;
    return base.concat([
      {
        name: "theme_override",
        selector: { select: { mode: "dropdown", options: this._themeOptions || [{ value: "", label: "Use device settings (default)" }] } },
      },
    ]);
  }
  _render() {
    const { computeLabel, computeHelper } = FamilyScreensaverCard.getConfigForm();
    if (this._built) {
      this._form.schema = this._schema();
      this._form.data = this._formData();
      return;
    }
    this._built = true;
    this.innerHTML = "";
    const form = document.createElement("ha-form");
    form.schema = this._schema();
    form.computeLabel = (s) => (s.name === "theme_override" ? "Theme" : computeLabel(s));
    form.computeHelper = (s) => (
      s.name === "theme_override"
        ? "Pin this one card to a specific theme, or leave on \"Use device settings\" to follow whatever this device/household normally shows."
        : computeHelper(s)
    );
    form.data = this._formData();
    if (this._hass) form.hass = this._hass;
    form.addEventListener("value-changed", (e) => {
      e.stopPropagation();
      const merged = Object.assign({}, this._config, e.detail.value);
      this._config = merged;
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: merged }, bubbles: true, composed: true }));
    });
    this._form = form;
    this.appendChild(form);
  }
}
if (!customElements.get("family-hub-screensaver-card-editor")) {
  customElements.define("family-hub-screensaver-card-editor", FamilyScreensaverCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "family-hub-screensaver-card")) {
  window.customCards.push({
    type: "family-hub-screensaver-card",
    name: "Family Hub Screen Saver",
    description: "Invisible outside edit mode - brings the Family Hub auto screensaver to any other dashboard, with an optional dashboard to return to on wake.",
  });
}
