(function () {
  if (window.__familyCalendarFontLoaded) return;
  window.__familyCalendarFontLoaded = true;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Varela+Round&display=swap";
  document.head.appendChild(link);
})();

// Shared, dashboard-wide screensaver controller - lets this card bring the
// Family Hub Auto Screen Saver to its own dashboard (same shared
// settings.screenSaver blob the calendar card's own Settings -> Screen
// Saver section configures - source, idle time, which logins it's on for)
// without needing the separate family-hub-screensaver-card companion card
// alongside it. Defined once per page (guarded by window.__familyHubScreenSaver
// below), then shared by every Family Hub card that opts in via
// registerClient/unregisterClient/updateHass - copy-pasted identically into
// each card file on purpose (these are independently-loaded Lovelace
// resources, not ES modules that could import one shared file), so only the
// FIRST card whose script actually runs this block sets anything up; every
// other card's identical copy just sees the flag already set and no-ops.
// This is the "mindful of the device" half of adding the screensaver here -
// a household with e.g. this card AND the Rewards card AND the dedicated
// Screen Saver companion card all on one dashboard gets exactly ONE overlay,
// ONE idle timer, and ONE camera-image poll (not one per card), because the
// controller itself only starts those when the client count goes from 0 to
// 1 and only tears them down when it drops back to 0 - see registerClient/
// unregisterClient below.
if (!window.__familyHubScreenSaver) {
  window.__familyHubScreenSaver = (function () {
    const clients = new Set();
    let hass = null;
    let settingsCache = null;
    let pollInterval = null;
    let idleTimer = null;
    let cameraInterval = null;
    let overlayEl = null;
    let activityBound = false;
    let boundActivity = null;
    let settingsSnapshot = null;

    function defaultSettings() {
      return { screenSaver: { sourceType: "video", videoUrl: "", cameraEntity: "", idleSeconds: 180, usersEnabled: {} } };
    }
    function normalizeSettings(parsed) {
      const defaults = defaultSettings();
      if (!parsed || typeof parsed !== "object") return defaults;
      const ss = parsed.screenSaver && typeof parsed.screenSaver === "object" ? parsed.screenSaver : {};
      const sourceType = ss.sourceType === "camera" ? "camera" : "video";
      const videoUrl = typeof ss.videoUrl === "string" ? ss.videoUrl.trim() : defaults.screenSaver.videoUrl;
      const cameraEntity = typeof ss.cameraEntity === "string" ? ss.cameraEntity.trim() : defaults.screenSaver.cameraEntity;
      let idleSeconds = Number.isFinite(ss.idleSeconds) ? Math.round(ss.idleSeconds) : parseInt(ss.idleSeconds, 10);
      if (!Number.isFinite(idleSeconds)) idleSeconds = defaults.screenSaver.idleSeconds;
      idleSeconds = Math.min(3600, Math.max(10, idleSeconds));
      const usersEnabled = {};
      if (ss.usersEnabled && typeof ss.usersEnabled === "object") {
        Object.keys(ss.usersEnabled).forEach((uid) => {
          if (ss.usersEnabled[uid]) usersEnabled[uid] = true;
        });
      }
      return { screenSaver: { sourceType, videoUrl, cameraEntity, idleSeconds, usersEnabled } };
    }
    function getSettings() {
      return settingsCache || defaultSettings();
    }
    async function fetchSettings() {
      if (!hass) return;
      try {
        const result = await hass.connection.sendMessagePromise({ type: "family_hub/get_settings" });
        settingsCache = normalizeSettings(result && result.settings);
      } catch (e) {
        if (!settingsCache) settingsCache = defaultSettings();
      }
      maybeResetIdleTimer();
    }
    // v144.12+: this used to call resetIdleTimer() unconditionally on every
    // single poll tick (startPolling, every 60s), whether or not anything
    // about the screenSaver settings had actually changed. That meant any
    // household with idleSeconds set above 60 (the poll interval - and the
    // DEFAULT idle time, 180s, is already well above it) could never
    // actually see the screensaver on a card that shares this controller
    // (Chores/Rewards/My Chores): a genuinely idle card's countdown kept
    // getting clobbered and restarted from zero every 60 seconds by the
    // poll itself, so it never survived long enough to reach
    // showScreenSaver(). This wrapper only calls the real reset when the
    // screenSaver settings sub-object has changed since the last time this
    // ran (or on the very first call) - a poll tick that finds nothing new
    // leaves a real in-progress countdown alone. A genuine change (new idle
    // time, source, or a login toggled on/off) still re-arms immediately
    // with the fresh value, same as before. Mirrors the calendar card's own
    // separate _maybeResetScreenSaverIdleTimer fix for its own idle timer.
    function maybeResetIdleTimer() {
      const key = JSON.stringify(getSettings().screenSaver || null);
      if (key === settingsSnapshot) return;
      settingsSnapshot = key;
      resetIdleTimer();
    }
    function applicable() {
      if (!hass || !hass.user || !hass.user.id) return false;
      const ss = getSettings().screenSaver;
      if (!ss) return false;
      const hasSource = ss.sourceType === "camera" ? !!ss.cameraEntity : !!ss.videoUrl;
      if (!hasSource) return false;
      return !!(ss.usersEnabled && ss.usersEnabled[hass.user.id]);
    }
    function resetIdleTimer() {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      if (!clients.size) return;
      if (!applicable()) return;
      if (overlayEl && overlayEl.style.display !== "none") return;
      const seconds = getSettings().screenSaver.idleSeconds || 180;
      idleTimer = setTimeout(showScreenSaver, seconds * 1000);
    }
    // Same document.body-level overlay trick as before this was shared -
    // appended outside every card's own shadow root and outside <ha-card>/
    // Home Assistant's own app shell so position:fixed actually reaches the
    // real viewport instead of getting trapped inside a containing block
    // further up the tree.
    function ensureOverlay() {
      if (overlayEl && overlayEl.isConnected) return overlayEl;
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
      el.addEventListener("pointerdown", hideScreenSaver);
      document.body.appendChild(el);
      overlayEl = el;
      return el;
    }
    function showScreenSaver() {
      if (!applicable()) return;
      const overlay = ensureOverlay();
      const ss = getSettings().screenSaver;
      const videoEl = overlay.querySelector(".screensaver-video");
      const imgEl = overlay.querySelector(".screensaver-camera-image");
      if (ss.sourceType === "camera") {
        if (videoEl) {
          videoEl.pause();
          videoEl.style.display = "none";
        }
        if (imgEl) imgEl.style.display = "";
        updateCameraImage();
        if (!cameraInterval) cameraInterval = setInterval(updateCameraImage, 10000);
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
    function hideScreenSaver() {
      const overlay = overlayEl;
      if (!overlay || overlay.style.display === "none") return;
      overlay.style.display = "none";
      const videoEl = overlay.querySelector(".screensaver-video");
      if (videoEl) videoEl.pause();
      if (cameraInterval) {
        clearInterval(cameraInterval);
        cameraInterval = null;
      }
      resetIdleTimer();
    }
    function updateCameraImage() {
      if (!hass) return;
      const overlay = overlayEl;
      const imgEl = overlay && overlay.querySelector(".screensaver-camera-image");
      if (!imgEl) return;
      const ss = getSettings().screenSaver;
      const entityId = ss && ss.cameraEntity;
      const state = entityId && hass.states[entityId];
      const picture = state && state.attributes && state.attributes.entity_picture;
      if (!picture) return;
      const sep = picture.indexOf("?") === -1 ? "?" : "&";
      imgEl.src = `${picture}${sep}fhts=${Date.now()}`;
    }
    // Bound to document rather than any one card's own shadow root -
    // "activity anywhere on the page" is the only definition of "not idle"
    // that makes sense when several cards on the dashboard all want a say.
    // The overlay's own pointerdown listener (see ensureOverlay) handles
    // dismissing an already-showing screensaver; these listeners only need
    // to worry about resetting the countdown during ordinary use of
    // whatever else is on the page.
    function setupActivityListeners() {
      if (activityBound) return;
      activityBound = true;
      boundActivity = () => resetIdleTimer();
      ["pointerdown", "keydown", "wheel", "touchstart"].forEach((evt) => {
        document.addEventListener(evt, boundActivity, { passive: true });
      });
    }
    function teardownActivityListeners() {
      if (!activityBound) return;
      activityBound = false;
      ["pointerdown", "keydown", "wheel", "touchstart"].forEach((evt) => {
        document.removeEventListener(evt, boundActivity);
      });
      boundActivity = null;
    }
    function startPolling() {
      if (pollInterval) return;
      pollInterval = setInterval(fetchSettings, 60 * 1000);
    }
    function stopEverything() {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      if (cameraInterval) {
        clearInterval(cameraInterval);
        cameraInterval = null;
      }
      if (overlayEl) {
        overlayEl.remove();
        overlayEl = null;
      }
      teardownActivityListeners();
    }
    return {
      // Call once a card instance has a live `hass` (typically from
      // connectedCallback, guarded by the card's own !this._interval-style
      // check so reconnecting without a matching unregister never double-
      // counts). The FIRST client to register is what actually stands up
      // the shared overlay/timers/listeners; later clients just join the
      // refcount and hand over their own (equally valid, same Home
      // Assistant session) `hass` in case theirs is fresher.
      registerClient(client, clientHass) {
        const wasEmpty = clients.size === 0;
        clients.add(client);
        if (clientHass) hass = clientHass;
        if (wasEmpty) {
          setupActivityListeners();
          fetchSettings();
          startPolling();
        } else {
          resetIdleTimer();
        }
      },
      // Call from disconnectedCallback. Only the LAST client leaving
      // actually tears the shared overlay/timers/listeners down - any
      // other still-connected Family Hub card on the same dashboard keeps
      // the screensaver running uninterrupted.
      unregisterClient(client) {
        clients.delete(client);
        if (clients.size === 0) stopEverything();
      },
      // Call from a card's own `set hass` whenever Home Assistant hands it
      // a fresh hass object, so the controller's copy (used for every
      // family_hub/get_settings poll and camera-image state lookup) never
      // goes stale even though it's shared across cards that otherwise
      // don't talk to each other.
      updateHass(clientHass) {
        if (clientHass) hass = clientHass;
      },
    };
  })();
}

// Context-aware personal chores view - reads this.hass.user.id and shows
// only that person's own active chores (open or pending_verification),
// plus an embedded claimable Chore Bin so they can pick up an unclaimed
// first_come_first_served chore without opening the full
// family-hub-chores-card. Meant to be pasted onto a personal dashboard/
// phone view, same spirit as family-today-card.js.
const CHORE_BIN_SENTINEL = "chore_bin";

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

class FamilyHubMyChoresCard extends HTMLElement {
  static getStubConfig() {
    return { title: "My Chores" };
  }
  // v1.111.0+: switched to getConfigElement (a real custom element) so the
  // new theme_override field can offer a live-fetched theme list.
  static getConfigElement() {
    return document.createElement("family-hub-my-chores-card-editor");
  }
  setConfig(config) {
    this._config = {
      title: (config && config.title) || "My Chores",
      theme_override: (config && typeof config.theme_override === "string") ? config.theme_override : "",
    };
    if (this._settingsCache === undefined) this._settingsCache = null;
    if (this._globalThemes === undefined) this._globalThemes = [];
    if (this._chores === undefined) this._chores = [];
    if (this._firstLoadPromise === undefined) this._firstLoadPromise = null;
    if (!this._built) this._build();
    this._render();
  }
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    // Keeps the shared screensaver controller's own hass reference fresh
    // on every update (not just the first) - see the singleton block above
    // this class.
    if (window.__familyHubScreenSaver) window.__familyHubScreenSaver.updateHass(hass);
    if (first) this._firstLoadPromise = this._initFirstLoad();
  }
  async _initFirstLoad() {
    if (this._timers === undefined) this._timers = [];
    await Promise.all([this._fetchSettings(), this._fetchChores()]);
    await this._fetchTimers();
    this._startTimerTicker();
    // v1.111.0+: always fetched now - a per-card theme_override needs this
    // list regardless of the household's own useGlobalTheme setting.
    await this._fetchGlobalThemes();
    this._startPolling();
    this._registerScreenSaver();
    this._render();
  }
  // Joins the shared, dashboard-wide screensaver controller rather than
  // standing up its own overlay/idle-timer/camera-poll - safe to call more
  // than once per card instance (a plain JS Set under the hood), which is
  // why this runs from both here and connectedCallback below with no extra
  // guard flag needed.
  _registerScreenSaver() {
    if (window.__familyHubScreenSaver && this._hass) window.__familyHubScreenSaver.registerClient(this, this._hass);
  }
  _startPolling() {
    if (this._interval) return;
    this._interval = setInterval(() => {
      this._fetchChores();
      this._fetchTimers();
    }, 20 * 1000);
  }
  connectedCallback() {
    if (this._hass && !this._interval) {
      if (this._firstLoadPromise) this._firstLoadPromise.then(() => this.isConnected && this._startPolling());
      else this._startPolling();
    }
    this._registerScreenSaver();
  }
  disconnectedCallback() {
    if (this._interval) clearInterval(this._interval);
    this._interval = null;
    if (window.__familyHubScreenSaver) window.__familyHubScreenSaver.unregisterClient(this);
  }
  getCardSize() {
    return 5;
  }
  getGridOptions() {
    return { columns: 6, min_columns: 4, max_columns: 12, min_rows: 5 };
  }
  _myUserId() {
    return this._hass && this._hass.user ? this._hass.user.id : null;
  }

  _defaultTheme() {
    return {
      colors: {
        bg: "#fbf7e5", card: "#f5f3f0", border: "#e6ddc4", text: "#423d34", textSecondary: "#96877a",
        accent: "#8f5a00", accentText: "#fff8ea", accent2: "#305545", accent3: "#b5583c",
        surfaceAlt: "#efe6cf", surface2: "#f2eede",
      },
    };
  }
  _defaultSettings() {
    return { theme: this._defaultTheme(), useGlobalTheme: false, globalThemeId: "" };
  }
  _getSettings() {
    return this._settingsCache || this._defaultSettings();
  }
  // v144.6+: "This device's theme" - a device-local override of the shared
  // Settings > Appearance theme choice, same key/mechanism
  // family-week-calendar-card.js's own _getDeviceThemeOverride uses (see
  // its own comment) and configured from that card's Settings modal (this
  // card has none of its own - see the top-of-file comment on why Settings
  // lives only on the calendar card). "" = follow the household setting
  // (nothing changes for anyone who hasn't touched this); "__default__" =
  // force this device's own plain/local look regardless of what the
  // household picked; anything else is a specific theme id this device
  // wants instead.
  _getDeviceThemeOverride() {
    let raw = "";
    try {
      raw = localStorage.getItem("familyHubDeviceThemeOverrideLocal") || "";
    } catch (e) {
    }
    return raw;
  }
  // Shared by both the new per-card override branch and the existing
  // household-global branch below.
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
  // The specific global-theme entry a per-card theme_override (if any)
  // currently resolves to, or null - shared by _resolveTheme and
  // _headerTitleFontSize below so both agree on which theme is "the
  // override" without duplicating the lookup twice.
  _cardOverrideThemeEntry() {
    const cardOverride = this._config && this._config.theme_override;
    if (!cardOverride) return null;
    return (this._globalThemes || []).find((t) => t && t.id === cardOverride) || null;
  }
  _resolveTheme(settings) {
    const local = settings.theme || this._defaultTheme();
    // v1.111.0+: a per-card-placement Theme override (from this card's own
    // native "Edit Card" dialog) wins over this device's own override and
    // the household's Global Theme.
    const overrideEntry = this._cardOverrideThemeEntry();
    if (overrideEntry) return this._themeFromGlobalEntry(overrideEntry);
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
  // find what `_applyThemeVars()` just wrote for it.
  _familyHubThemeCacheKey() {
    const cardOverride = this._config && this._config.theme_override;
    if (cardOverride) return `card:${cardOverride}`;
    const deviceOverride = this._getDeviceThemeOverride();
    if (deviceOverride) return `device:${deviceOverride}`;
    return "household";
  }
  _applyThemeVars() {
    const theme = this._resolveTheme(this._getSettings());
    // v144.5+: same "liquid glass" support family-week-calendar-card.js has
    // - a theme's cardOpacity/glassBlur (100/0 defaults, both no-ops) turn
    // the card/surface backgrounds translucent and blur whatever shows
    // through them, so picking a Liquid Glass theme actually looks glassy
    // on this card too, not just the calendar.
    const cardOpacity = typeof theme.cardOpacity === "number" ? theme.cardOpacity : 100;
    const glassBlur = typeof theme.glassBlur === "number" ? theme.glassBlur : 0;
    // v1.126.0+: built as a plain object first (rather than each var going
    // straight into its own setProperty call, as before) purely so the
    // exact same values that get applied here also get cached - see
    // window.__familyHubThemeCache's own comment for why this fixes the
    // household's reported "loads the default theme first" flash.
    const vars = {
      "--fc-bg": theme.colors.bg,
      "--fc-card": this._hexToRgba(theme.colors.card, cardOpacity / 100),
      "--fc-border": theme.colors.border,
      "--fc-text": theme.colors.text,
      "--fc-text-secondary": theme.colors.textSecondary,
      "--fc-accent": theme.colors.accent,
      "--fc-accent-text": theme.colors.accentText,
      "--fc-accent2": theme.colors.accent2,
      "--fc-accent3": theme.colors.accent3,
      "--fc-surface-alt": this._hexToRgba(theme.colors.surfaceAlt, cardOpacity / 100),
      "--fc-surface2": this._hexToRgba(theme.colors.surface2, cardOpacity / 100),
      "--fc-glass-blur": `${glassBlur}px`,
      // Same shared --fs-header-title custom property family-today-card.js
      // and family-week-calendar-card.js both set from the household's one
      // Theme Builder "Header title" font-size field (settings.theme.fonts.
      // headerTitle, default 15) - this card previously never read it at
      // all, leaving its own .title hardcoded to 18px regardless of what
      // every other card's heading was set to. _headerTitleFontSize below
      // mirrors the calendar card's own _resolveTheme font-fallback logic
      // (including the global-theme case) without pulling in this card's
      // full font set, since nothing else here is theme-font-driven yet.
      // Cached and re-applied along with the rest (v1.126.0+) so a reload
      // doesn't ALSO flash the header title back to 18px before this
      // resolves for real, same reasoning as every other var here.
      "--fs-header-title": `${this._headerTitleFontSize(this._getSettings())}px`,
    };
    Object.keys(vars).forEach((name) => this.style.setProperty(name, vars[name]));
    if (window.__familyHubThemeCache) window.__familyHubThemeCache.set(this._familyHubThemeCacheKey(), vars);
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
  _headerTitleFontSize(settings) {
    const fallback = 15;
    const fromFonts = (fonts) => {
      const n = fonts && Number(fonts.headerTitle);
      return Number.isFinite(n) && n >= 6 && n <= 72 ? n : fallback;
    };
    // v1.111.0+: a per-card theme_override wins here too, same precedence
    // as _resolveTheme, so the header font size always matches whichever
    // theme actually ends up applied to this specific card.
    const overrideEntry = this._cardOverrideThemeEntry();
    if (overrideEntry) return fromFonts(overrideEntry.fonts);
    // v144.6+: same device-theme-override precedence _resolveTheme uses,
    // so the header font size always matches whichever theme (household's
    // or this device's own override) actually ends up applied.
    const override = this._getDeviceThemeOverride();
    const useGlobalTheme = override ? override !== "__default__" : settings.useGlobalTheme;
    const globalThemeId = override ? (override === "__default__" ? "" : override) : settings.globalThemeId;
    if (useGlobalTheme && globalThemeId) {
      const g = (this._globalThemes || []).find((t) => t && t.id === globalThemeId);
      if (g) return fromFonts(g.fonts);
    }
    return fromFonts(settings.theme && settings.theme.fonts);
  }
  async _fetchSettings() {
    if (!this._hass) return;
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_settings" });
      const raw = result && result.settings;
      this._settingsCache = raw && typeof raw === "object" ? Object.assign(this._defaultSettings(), raw) : this._defaultSettings();
    } catch (e) {
      if (!this._settingsCache) this._settingsCache = this._defaultSettings();
    }
    this._applyThemeVars();
  }
  async _fetchGlobalThemes() {
    let custom = [];
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "theme_builder/list" });
      custom = (result && Array.isArray(result.themes)) ? result.themes : [];
    } catch (e) {
      custom = [];
    }
    // v1.111.0+: also merge in every installed native Home Assistant theme.
    this._globalThemes = custom.concat(this._nativeHaThemeEntries());
    this._applyThemeVars();
  }
  // --- Native HA theme support (duplicated from family-week-calendar-
  // card.js's identical methods) ---
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
      { id: "ha:__default__", name: "Default (Home Assistant)", colors: this._haVarsToBuilderColors(this._haDefaultCssVars()), native: true },
    ];
    const themes = (this._hass && this._hass.themes && this._hass.themes.themes) || {};
    Object.keys(themes)
      .filter((name) => name.indexOf("Theme Builder - ") !== 0)
      .sort((a, b) => a.localeCompare(b))
      .forEach((name) => {
        entries.push({ id: "ha:" + name, name: name, colors: this._haVarsToBuilderColors(this._haThemeCssVars(name)), native: true });
      });
    return entries;
  }
  async _fetchChores() {
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/chores/list" });
      this._chores = (result && Array.isArray(result.chores)) ? result.chores : [];
    } catch (e) {
      this._chores = [];
    }
    this._render();
  }

  _myChores() {
    const me = this._myUserId();
    return this._chores.filter((c) => c.assigned_to === me && (c.status === "open" || c.status === "pending_verification"));
  }
  _binChores() {
    return this._chores.filter((c) => c.assigned_to === CHORE_BIN_SENTINEL && c.status === "open");
  }

  _build() {
    this._built = true;
    // v1.126.0+: applied BEFORE attachShadow/the first innerHTML paint -
    // see _applyCachedThemeVarsIfAny's own comment and window.__familyHub
    // ThemeCache's above the class for why this is what actually fixes
    // the household's reported "loads the default theme first" flash.
    this._applyCachedThemeVarsIfAny();
    this.attachShadow({ mode: "open" });
    const root = this.shadowRoot;
    root.innerHTML = `
      <style>${this._css()}</style>
      <ha-card>
        <div class="header"><div class="title"></div></div>
        <div class="section">
          <div class="section-title">My chores</div>
          <div class="reward-timer-slot"></div>
          <div class="my-list"></div>
        </div>
        <div class="section">
          <div class="section-title">Chore Bin - up for grabs</div>
          <div class="bin-list"></div>
        </div>
      </ha-card>
    `;
    this._root = root;
    root.addEventListener("click", (e) => this._onClick(e));
  }

  _onClick(e) {
    const doneBtn = e.target.closest(".chore-done-btn");
    const claimBtn = e.target.closest(".chore-claim-btn");
    if (doneBtn) return this._complete(doneBtn.dataset.id);
    if (claimBtn) return this._claim(claimBtn.dataset.id);
  }

  async _complete(id) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/chores/complete", chore_id: id });
      await this._fetchChores();
    } catch (e) {
      /* no-op */
    }
  }
  async _claim(id) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/chores/claim", chore_id: id });
      await this._fetchChores();
    } catch (e) {
      /* no-op */
    }
  }

  _esc(s) {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  }

  // --- Timers (v1.110.0+) ---------------------------------------------------
  // This card is the "just show me my list" surface, so it deliberately
  // shows timers READ-ONLY: a running chore timer's countdown, and a small
  // banner for a running reward timer. Starting and cancelling live on the
  // full Chores/Rewards boards - duplicating those controls here would mean
  // three places to keep in sync for very little gain. Countdown text is
  // computed locally from started_at + duration_minutes, same as everywhere
  // else; the backend is what actually fires them.
  async _fetchTimers() {
    if (!this._hass) return;
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/timers/list" });
      this._timers = (result && result.timers) || [];
    } catch (e) {
      this._timers = [];
    }
    this._renderTimerCountdowns();
  }
  _startTimerTicker() {
    if (this._timerTicker) return;
    this._timerTicker = setInterval(() => this._renderTimerCountdowns(), 1000);
  }
  _choreTimer(choreId) {
    return (this._timers || []).find((t) => t.kind === "chore" && t.chore_id === choreId) || null;
  }
  _myRewardTimer() {
    return (this._timers || []).find((t) => t.kind === "reward" && t.user_id === this._myUserId()) || null;
  }
  _timerRemainingSeconds(timer) {
    if (!timer) return 0;
    // v1.110.2+: when this timer is running on an adopted native HA
    // timer.* helper, Home Assistant already publishes the authoritative
    // finish time as a `finishes_at` state attribute - so read HA's own
    // number rather than recomputing it. Falls back to the original
    // started_at + duration math for a timer with no native entity behind
    // it, which is still the common case (a household only gets native
    // entities by creating timer.family_hub* helpers). Both paths are
    // derived, never a stored counter, which is what makes a reload or a
    // restart mid-countdown resume at the right number.
    const entityId = timer.entity_id;
    if (entityId && this._hass && this._hass.states && this._hass.states[entityId]) {
      const attrs = this._hass.states[entityId].attributes || {};
      const finishesAt = Date.parse(attrs.finishes_at);
      if (Number.isFinite(finishesAt)) return Math.max(0, Math.round((finishesAt - Date.now()) / 1000));
    }
    if (!timer.started_at) return 0;
    const started = Date.parse(timer.started_at);
    if (!Number.isFinite(started)) return 0;
    const ends = started + (Number(timer.duration_minutes) || 0) * 60000;
    return Math.max(0, Math.round((ends - Date.now()) / 1000));
  }
  _formatTimerRemaining(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }
  _renderTimerCountdowns() {
    if (!this._root) return;
    this._root.querySelectorAll("[data-timer-uid]").forEach((el) => {
      const timer = (this._timers || []).find((t) => t.uid === el.dataset.timerUid);
      if (timer) el.textContent = this._formatTimerRemaining(this._timerRemainingSeconds(timer));
    });
  }
  _rewardTimerBannerHtml() {
    const timer = this._myRewardTimer();
    if (!timer) return "";
    return `<div class="reward-timer-banner">&#9201; <strong>${this._esc(timer.title || "Reward")}</strong> - <span data-timer-uid="${timer.uid}">${this._formatTimerRemaining(this._timerRemainingSeconds(timer))}</span> left</div>`;
  }
  _myChoreRowHtml(chore) {
    const due = chore.due_date ? `<span class="chore-due">Due ${new Date(chore.due_date).toLocaleDateString()}</span>` : "";
    const runningTimer = this._choreTimer(chore.id);
    const timerChip = runningTimer
      ? `<span class="chore-timer-live">&#9201; <span data-timer-uid="${runningTimer.uid}">${this._formatTimerRemaining(this._timerRemainingSeconds(runningTimer))}</span></span>`
      : "";
    const action =
      chore.status === "open"
        ? `<button class="chore-done-btn" data-id="${chore.id}">Done</button>`
        : `<span class="chore-pending-label">Awaiting approval</span>`;
    return `
      <div class="chore-row">
        <div class="chore-row-main">
          <span class="chore-title">${this._esc(chore.title)}</span>
          <span class="chore-stars">&#11088; ${chore.star_value || 0}</span>
          ${due}
          ${timerChip}
        </div>
        ${action}
      </div>
    `;
  }
  _binRowHtml(chore) {
    const claimable = chore.assignment_mode === "first_come_first_served";
    return `
      <div class="chore-row">
        <div class="chore-row-main">
          <span class="chore-title">${this._esc(chore.title)}</span>
          <span class="chore-stars">&#11088; ${chore.star_value || 0}</span>
        </div>
        ${claimable ? `<button class="chore-claim-btn" data-id="${chore.id}">Claim</button>` : `<span class="chore-pending-label">Waiting to be assigned</span>`}
      </div>
    `;
  }

  _render() {
    if (!this._root) return;
    this._root.querySelector(".title").textContent = this._config.title;
    const mine = this._myChores();
    const bin = this._binChores();
    // v1.110.0+: a running reward timer of your own, shown above the list -
    // "your 2 hours of gaming has 41 minutes left" is exactly the kind of
    // thing this card exists to answer at a glance.
    const rewardSlot = this._root.querySelector(".reward-timer-slot");
    if (rewardSlot) rewardSlot.innerHTML = this._rewardTimerBannerHtml();
    this._root.querySelector(".my-list").innerHTML = mine.length
      ? mine.map((c) => this._myChoreRowHtml(c)).join("")
      : `<div class="empty">Nothing on your list right now.</div>`;
    this._root.querySelector(".bin-list").innerHTML = bin.length
      ? bin.map((c) => this._binRowHtml(c)).join("")
      : `<div class="empty">The Chore Bin is empty.</div>`;
  }

  _css() {
    return `
      :host { display: block; height: 100%; font-family: "Arial Rounded MT Std", "Arial Rounded MT", "Varela Round", -apple-system, "Segoe UI Rounded", "Segoe UI", Roboto, sans-serif;
        --fc-bg: #fbf7e5; --fc-card: #f5f3f0; --fc-border: #e6ddc4; --fc-text: #423d34; --fc-text-secondary: #96877a;
        --fc-accent: #8f5a00; --fc-accent-text: #fff8ea; --fc-accent2: #305545; --fc-accent3: #b5583c;
        --fc-surface-alt: #efe6cf; --fc-surface2: #f2eede; }
      ha-card { background: var(--fc-bg); color: var(--fc-text); padding: 14px; height: 100%; box-sizing: border-box; overflow-y: auto; }
      .header { margin-bottom: 8px; }
      /* v1.110.0+: read-only timer surfaces (start/cancel live on the full
         boards - see _fetchTimers' own comment). Tabular figures so the
         ticking seconds don't reflow the row. */
      .reward-timer-banner { display: flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 700; color: var(--fc-accent2); background: var(--fc-surface-alt); border-radius: 10px; padding: 8px 10px; margin-bottom: 8px; font-variant-numeric: tabular-nums; }
      .chore-timer-live { font-size: 12px; font-weight: 800; color: var(--fc-accent2); font-variant-numeric: tabular-nums; }
      .title { font-size: var(--fs-header-title, 15px); font-weight: 800; }
      .section { margin-top: 12px; }
      .section-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: var(--fc-text-secondary); margin-bottom: 6px; }
      .chore-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; background: var(--fc-card); border-radius: 10px; padding: 8px 10px; margin-bottom: 6px; box-shadow: var(--fc-shadow, 0 2px 5px rgba(0,0,0,0.08)); }
      /* v144.5+: "Liquid glass" support, same convention as
         family-week-calendar-card.js - see that file's own comment on its
         backdrop-filter rule for the full reasoning. Zero-cost for every
         existing theme (blur(0px) is a no-op); -webkit- prefix needed for
         Safari/iOS webviews. */
      .chore-row {
        backdrop-filter: blur(var(--fc-glass-blur, 0px));
        -webkit-backdrop-filter: blur(var(--fc-glass-blur, 0px));
      }
      .chore-row-main { display: flex; flex-direction: column; gap: 2px; }
      .chore-title { font-weight: 700; font-size: 14px; }
      .chore-stars, .chore-due { font-size: 11px; color: var(--fc-text-secondary); }
      .chore-row button { border: none; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 700; cursor: pointer; background: var(--fc-accent2); color: #fff; white-space: nowrap; }
      .chore-claim-btn { background: var(--fc-accent) !important; color: var(--fc-accent-text) !important; }
      .chore-pending-label { font-size: 11px; color: var(--fc-text-secondary); white-space: nowrap; }
      .empty { font-size: 12px; color: var(--fc-text-secondary); padding: 8px 0; }
    `;
  }
}

if (!customElements.get("family-hub-my-chores-card")) {
  customElements.define("family-hub-my-chores-card", FamilyHubMyChoresCard);
}

// v1.111.0+: native "Edit Card" config editor - a thin wrapper around
// Home Assistant's own <ha-form>, needed only because the new
// theme_override field's option list has to be fetched live.
class FamilyHubMyChoresCardEditor extends HTMLElement {
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
    return [
      { name: "title", selector: { text: {} } },
      { name: "theme_override", selector: { select: { mode: "dropdown", options: this._themeOptions || [{ value: "", label: "Use device settings (default)" }] } } },
    ];
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
    this._form.computeLabel = (s) => (s.name === "title" ? "Title" : s.name === "theme_override" ? "Theme" : undefined);
    this._form.computeHelper = (s) => (
      s.name === "theme_override"
        ? "Pin this one card to a specific theme, or leave on \"Use device settings\" to follow whatever this device/household normally shows."
        : undefined
    );
  }
}
if (!customElements.get("family-hub-my-chores-card-editor")) {
  customElements.define("family-hub-my-chores-card-editor", FamilyHubMyChoresCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "family-hub-my-chores-card")) {
  window.customCards.push({
    type: "family-hub-my-chores-card",
    name: "My Chores",
    description: "Context-aware personal chores view - shows just the logged-in person's own active chores plus a claimable Chore Bin. Made for a phone or personal dashboard.",
  });
}
