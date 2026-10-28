// Holiday themes, shared by every Family Hub card: a holiday background can switch the theme
// while it's showing. The backend works out the dates (family_hub/holiday_themes/get); this
// checks today against them, refreshes every 30 minutes, and tells cards to re-theme when the
// answer changes (including at midnight).
if (!window.__fhHolidayTheme) {
  window.__fhHolidayTheme = (function () {
    let schedule = null;
    let fetchedAt = 0;
    let loading = null;
    let midnightTimer = null;
    let lastId = null;
    const listeners = new Set();
    const todayKey = () => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const span = (s) => (Date.parse(s.end) - Date.parse(s.start)) || 0;
    function current() {
      if (!Array.isArray(schedule)) return "";
      const k = todayKey();
      // the most specific wins: a day beats a week, a week beats a month (same rule as the backgrounds)
      const hits = schedule.filter((s) => s && s.theme_id && s.start <= k && k <= s.end).sort((a, b) => span(a) - span(b));
      return hits.length ? hits[0].theme_id : "";
    }
    function notify() {
      const id = current();
      if (id === lastId) return;
      lastId = id;
      listeners.forEach((cb) => {
        try {
          cb();
        } catch (e) {
          // one card's error never stops the others
        }
      });
    }
    function armMidnight() {
      clearTimeout(midnightTimer);
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
      midnightTimer = setTimeout(() => {
        notify();
        armMidnight();
      }, next.getTime() - now.getTime());
    }
    function refresh(hass) {
      if (!hass || !hass.connection) return Promise.resolve();
      if (loading) return loading;
      loading = hass.connection
        .sendMessagePromise({ type: "family_hub/holiday_themes/get" })
        .then((r) => {
          schedule = (r && Array.isArray(r.schedule) && r.schedule) || [];
        })
        .catch(() => {
          schedule = schedule || [];
        })
        .then(() => {
          fetchedAt = Date.now();
          loading = null;
          armMidnight();
          notify();
        });
      return loading;
    }
    return {
      themeId(hass) {
        if (hass && !loading && Date.now() - fetchedAt > 30 * 60 * 1000) refresh(hass);
        return current();
      },
      subscribe(cb) {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      invalidate(hass) {
        fetchedAt = 0;
        return refresh(hass);
      },
    };
  })();
}
// --- Family Hub shared translation helper (v1.168.76) ------------------- __fhT(key, english, vars
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

// Shared, dashboard-wide screensaver controller - lets this card bring the Family Hub Auto Screen Saver to its own dashboard
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
    let widgetEls = {};

    function defaultSettings() {
      return { screenSaver: { sourceType: "video", videoUrl: "", cameraEntity: "", idleSeconds: 180, usersEnabled: {}, returnDashboardPath: "" }, screenSaverWidgets: [] };
    }
    // Same this-device-only localStorage key as the main calendar card's own _getScreenSaverHiddenWidgetIds - kept in sync by hand
    function getScreenSaverHiddenWidgetIds() {
      let raw = null;
      try {
        raw = localStorage.getItem("familyCalendarScreenSaverHiddenWidgetIdsLocal");
      } catch (e) {
      }
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string" && id) : [];
      } catch (e) {
        return [];
      }
    }
    // Same clamped-percentage, drop-malformed-entries normalization as the
    // main calendar card's own screenSaverWidgets handling.
    function normalizeScreenSaverWidgets(parsed) {
      if (!Array.isArray(parsed)) return [];
      const clampPct = (v, fallback) => {
        const n = typeof v === "number" ? v : parseFloat(v);
        return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : fallback;
      };
      return parsed
        .filter((w) => w && typeof w === "object" && w.config && typeof w.config === "object" && typeof w.config.type === "string" && w.config.type)
        .map((w) => ({
          id: typeof w.id === "string" && w.id ? w.id : `sw-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
          config: w.config,
          x: clampPct(w.x, 5),
          y: clampPct(w.y, 5),
          w: clampPct(w.w, 30),
          h: clampPct(w.h, 20),
        }));
    }
    // same helper as the calendar card's/standalone screensaver card's own _normalizeDashboardPath
    function normalizeDashboardPath(raw) {
      const val = (raw || "").toString().trim();
      if (!val) return "";
      if (val.startsWith("/") || /^https?:\/\//i.test(val)) return val;
      return "/" + val;
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
      const returnDashboardPath = normalizeDashboardPath(ss.returnDashboardPath);
      const screenSaverWidgets = normalizeScreenSaverWidgets(parsed.screenSaverWidgets);
      return { screenSaver: { sourceType, videoUrl, cameraEntity, idleSeconds, usersEnabled, returnDashboardPath }, screenSaverWidgets };
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
    // this used to call resetIdleTimer() unconditionally on every single poll tick (startPolling, every 60s)
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
    // Same document.body-level overlay trick as before this was shared
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
      const widgetsLayer = document.createElement("div");
      widgetsLayer.className = "screensaver-widgets";
      Object.assign(widgetsLayer.style, { position: "absolute", top: "0", left: "0", right: "0", bottom: "0", pointerEvents: "none" });
      el.appendChild(widgetsLayer);
      el.addEventListener("pointerdown", hideScreenSaver);
      document.body.appendChild(el);
      overlayEl = el;
      return el;
    }
    // Same dynamic-card-hosting approach as the main calendar card's own _renderScreenSaverWidgets (loadCardHelpers/createCardElement)
    async function renderWidgets(overlay) {
      const layer = overlay && overlay.querySelector(".screensaver-widgets");
      if (!layer) return;
      const widgets = getSettings().screenSaverWidgets || [];
      const hiddenIds = getScreenSaverHiddenWidgetIds();
      const visible = widgets.filter((w) => !hiddenIds.includes(w.id));
      if (!visible.length) {
        layer.innerHTML = "";
        widgetEls = {};
        return;
      }
      if (typeof window.loadCardHelpers !== "function") return;
      const helpers = await window.loadCardHelpers();
      const seenIds = {};
      for (const widget of visible) {
        seenIds[widget.id] = true;
        let wrap = widgetEls[widget.id];
        if (!wrap || !wrap.isConnected) {
          wrap = document.createElement("div");
          wrap.setAttribute("data-screensaver-widget-id", widget.id);
          Object.assign(wrap.style, { position: "absolute", overflow: "hidden" });
          try {
            const cardEl = helpers.createCardElement(widget.config);
            cardEl.hass = hass;
            wrap.appendChild(cardEl);
          } catch (e) {
          }
          layer.appendChild(wrap);
          widgetEls[widget.id] = wrap;
        } else {
          const cardEl = wrap.firstElementChild;
          if (cardEl) cardEl.hass = hass;
        }
        Object.assign(wrap.style, { left: `${widget.x}%`, top: `${widget.y}%`, width: `${widget.w}%`, height: `${widget.h}%` });
      }
      Object.keys(widgetEls).forEach((id) => {
        if (!seenIds[id]) {
          const wrap = widgetEls[id];
          if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
          delete widgetEls[id];
        }
      });
    }
    function showScreenSaver() {
      if (!applicable()) return;
      const overlay = ensureOverlay();
      const ss = getSettings().screenSaver;
      renderWidgets(overlay);
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
    // Root cause: this shared singleton (the screensaver that actually runs when a Chores/Rewards/My Chores card - not the calendar card
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
      goToReturnDashboard();
    }
    function goToReturnDashboard() {
      const ss = getSettings().screenSaver;
      const path = normalizeDashboardPath(ss && ss.returnDashboardPath);
      if (!path) return;
      navigateWithFallback(path);
    }
    // See family-week-calendar-card.js's own identical copy of this method for the full root-cause note
    function navigateWithFallback(path) {
      const before = window.location.href;
      const alreadyThere = path === before || path === window.location.pathname + window.location.search;
      let threw = false;
      try {
        window.history.pushState(null, "", path);
        window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
      } catch (e) {
        // Fall through - the setTimeout below will see window.location
        // unchanged and hard-navigate instead.
        threw = true;
      }
      if (alreadyThere && !threw) return;
      setTimeout(() => {
        if (window.location.href === before) hardNavigate(path);
      }, 300);
    }
    function hardNavigate(path) {
      window.location.assign(path);
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
    // Bound to document rather than any one card's own shadow root
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
      widgetEls = {};
      teardownActivityListeners();
    }
    return {
      // Call once a card instance has a live `hass` (typically from connectedCallback
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
      // Call from disconnectedCallback.
      unregisterClient(client) {
        clients.delete(client);
        if (clients.size === 0) stopEverything();
      },
      // Call from a card's own `set hass` whenever Home Assistant hands it a fresh hass object, so the controller's copy
      updateHass(clientHass) {
        if (clientHass) hass = clientHass;
        Object.values(widgetEls).forEach((wrap) => {
          const cardEl = wrap && wrap.firstElementChild;
          if (cardEl) cardEl.hass = hass;
        });
      },
      // Test-only hooks - not used by any real card.
      _test: {
        showScreenSaver,
        hideScreenSaver,
        getSettings,
        normalizeSettings,
        setHardNavigate(fn) {
          hardNavigate = fn;
        },
        get overlayEl() {
          return overlayEl;
        },
        set settingsCacheForTest(v) {
          settingsCache = v;
        },
      },
    };
  })();
}

// Star economy ledger: every household member's star balance, a browsable reward catalog with a one-click claim flow (instant self-serve
const PALETTE = ["#a9c6c2", "#dba99c", "#d9bf7e", "#a8bd93", "#b9a7c9", "#cf8f6c", "#a89a83"];

// A small, self-contained emoji grid (no external picker library
const REWARD_ICON_CATEGORIES = [
  { label: "Treats & Food", emojis: ["🍦", "🍩", "🍿", "🧁", "🍕", "🍪", "🍔", "🍟", "🧃", "🍫", "🍉", "🍎", "🥤", "🍰"] },
  { label: "Screens & Games", emojis: ["🎮", "🎬", "📱", "🎧", "💻", "📺", "🕹️", "🎵", "🎲", "🧩"] },
  { label: "Toys & Fun Stuff", emojis: ["🧸", "🎁", "🎨", "🚲", "🎫", "🛏️", "👟", "🎒", "🪁", "🖍️"] },
  { label: "Outings & Activities", emojis: ["🎪", "🏊", "🎳", "🎡", "🏕️", "🎣", "⚽", "🏀", "🎿", "🛹", "🎤"] },
  { label: "Money & Prizes", emojis: ["💵", "💰", "🏦", "💳", "🎟️"] },
  { label: "Achievement & Fun", emojis: ["⭐", "🏆", "🥇", "🎉", "👑", "💎", "🎯", "🚀"] },
];
const REWARD_ICON_CHOICES = REWARD_ICON_CATEGORIES.reduce((all, cat) => all.concat(cat.emojis), []);
// mirrors const.py's GOAL_STATUS_* (same duplicated-across- independently-loaded-files convention as everything else on this line)
const GOAL_STATUS_OPEN = "open";
const GOAL_STATUS_PENDING_VERIFICATION = "pending_verification";
const GOAL_STATUS_APPROVED = "approved";
// mirrors const.py's GOAL_STATUS_ARCHIVED - see family-hub-goals-card.js's own comment on this same constant for the full "Complete" button
const GOAL_STATUS_ARCHIVED = "archived";

// Shared, dashboard-wide FAB coordinator - "when a user has more than one card on the same screen, the FAB buttons overlap
if (!window.__familyHubFabCoordinator) {
  window.__familyHubFabCoordinator = (function () {
    // Deterministic stacking order - unrecognized/future kinds sort last,
    // after everything named here, rather than crashing or colliding.
    const FAB_KIND_ORDER = ["calendar", "chores", "rewards", "goals", "todo"];
    // 56px button + 10px breathing room between stacked FABs.
    const SLOT_HEIGHT_PX = 66;
    const entries = new Map(); // client -> { kind, seq, meta, onUpdate }
    let seq = 0;
    // Every FAB here is position:fixed, pinned to the viewport corner (or, for a fab-position:"card" client, to its own card's box)
    let openModalCount = 0;

    function orderIndex(kind) {
      const i = FAB_KIND_ORDER.indexOf(kind);
      return i === -1 ? FAB_KIND_ORDER.length : i;
    }
    function recompute() {
      const list = Array.from(entries.entries()).sort((a, b) => {
        const oa = orderIndex(a[1].kind);
        const ob = orderIndex(b[1].kind);
        if (oa !== ob) return oa - ob;
        return a[1].seq - b[1].seq;
      });
      // entries with takesSlot:false (a fab_position: "card" client
      const slotCount = list.filter(([, entry]) => entry.takesSlot).length;
      let slotIndex = 0;
      const hideForModal = openModalCount > 0;
      list.forEach(([client, entry]) => {
        const otherProvidesGoalTab = list.some(
          ([otherClient, otherEntry]) => otherClient !== client && otherEntry.meta && otherEntry.meta.providesGoalTab
        );
        const index = entry.takesSlot ? slotIndex++ : null;
        if (typeof entry.onUpdate === "function") {
          entry.onUpdate({ offsetPx: (index || 0) * SLOT_HEIGHT_PX, slotIndex: index, count: slotCount, otherProvidesGoalTab, hideForModal });
        }
      });
    }
    return {
      // `kind` is one of FAB_KIND_ORDER's entries (or anything else, which just sorts last).
      registerClient(client, kind, meta, onUpdate, opts) {
        const takesSlot = !(opts && opts.takesSlot === false);
        entries.set(client, { kind, seq: seq++, meta: meta || {}, onUpdate, takesSlot });
        recompute();
      },
      // Call whenever a fact in `meta` changes at runtime (e.g. the household flips goalsShowInChores in Settings without reloading the dashboard)
      updateClientMeta(client, meta) {
        const entry = entries.get(client);
        if (!entry) return;
        entry.meta = Object.assign({}, entry.meta, meta || {});
        recompute();
      },
      // Call when THIS card opens a full-screen modal that every OTHER Family Hub card's FAB should get out of the way of
      pushModalOpen() {
        openModalCount += 1;
        recompute();
      },
      popModalOpen() {
        openModalCount = Math.max(0, openModalCount - 1);
        recompute();
      },
      // Call from disconnectedCallback.
      unregisterClient(client) {
        if (entries.delete(client)) recompute();
      },
    };
  })();
}

// One-tap common amounts for the Manage Stars modal, same idea
// as family-hub-active-timers-card.js's TIMER_PRESETS.
const MANAGE_STARS_PRESETS = [1, 5, 10];

// Shared, dashboard-wide kiosk PIN login session - the same "independently- loaded Lovelace card files have no built-in way to know about
if (!window.__familyHubKioskSession) {
  window.__familyHubKioskSession = (function () {
    const clients = new Map(); // client -> onUpdate
    let elevation = null; // null, or {token, user_id, name, is_admin, permissions, expires_in}
    let idleTimer = null;
    let activityBound = false;

    function broadcast() {
      clients.forEach((onUpdate) => {
        if (typeof onUpdate === "function") onUpdate(elevation);
      });
    }
    // Activity anywhere on the dashboard resets the ONE shared idle clock - bound at the document level
    function bindActivity() {
      if (activityBound) return;
      activityBound = true;
      ["pointerdown", "keydown", "wheel", "touchstart"].forEach((evt) => {
        document.addEventListener(evt, resetIdleTimer, { passive: true });
      });
    }
    function resetIdleTimer() {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      if (!elevation) return;
      idleTimer = setTimeout(() => doLogout(null), 45000);
    }
    async function doLogout(hass) {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      const prev = elevation;
      elevation = null;
      broadcast();
      // Best-effort, same as the old per-card _kioskLogout - even offline
      if (prev && hass) {
        try {
          await hass.connection.sendMessagePromise({ type: "family_hub/kiosk/deelevate", token: prev.token });
        } catch (e) {
        }
      }
    }
    return {
      // onUpdate is called once immediately on registration (so a card that mounts AFTER someone already logged in on another card immediately
      registerClient(client, onUpdate) {
        clients.set(client, onUpdate);
        if (typeof onUpdate === "function") onUpdate(elevation);
      },
      unregisterClient(client) {
        clients.delete(client);
      },
      getElevation() {
        return elevation;
      },
      // Called from whichever card's own login modal submitted the PIN
      async login(hass, userId, pin) {
        const result = await hass.connection.sendMessagePromise({ type: "family_hub/kiosk/elevate", user_id: userId, pin });
        elevation = result;
        bindActivity();
        resetIdleTimer();
        broadcast();
        return result;
      },
      logout(hass) {
        return doLogout(hass);
      },
      resetIdleTimer,
      // Test-only introspection - whether the shared idle timer is currently armed, without exposing the raw timer handle (which
      _debugIdleTimerArmed() {
        return !!idleTimer;
      },
    };
  })();
}

// The phone-push half of that (Android alarm-stream channel / iOS critical alert) is entirely server-side
if (!window.__familyHubTimerAlarm) {
  // (timer + alarm overhaul): the on-screen half of a Family Hub timer alarm
  window.__familyHubTimerAlarm = (function () {
    let modalEl = null;
    let audioCtx = null;
    let beepHandle = null;
    const ringing = new Map(); // uid -> {title, body}
    const dismissedUids = new Set();
    let lastHass = null;
    function myClientId() {
      try {
        let id = sessionStorage.getItem("family_hub_client_id");
        if (!id) {
          id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
          sessionStorage.setItem("family_hub_client_id", id);
        }
        return id;
      } catch (e) {
        return "";
      }
    }
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
        '<div class="fh-timer-alarm-box" role="alertdialog" aria-live="assertive" style="background:#fff8ea;color:#3a352c;border-radius:22px;padding:30px 26px;max-width:400px;width:88vw;max-height:86vh;overflow:auto;text-align:center;box-shadow:0 14px 46px rgba(0,0,0,0.45);font-family:-apple-system,\'Segoe UI\',Roboto,sans-serif;">' +
        '<div style="font-size:48px;margin-bottom:6px;">&#9200;</div>' +
        ('<div data-fh-t="text.time_s_up" class="fh-timer-alarm-head" style="font-size:14px;color:#96877a;margin-bottom:14px;font-weight:700;">' + __fhT("text.time_s_up", "Time's up!", null, "h") + '</div>') +
        '<div class="fh-timer-alarm-list" style="display:flex;flex-direction:column;gap:12px;"></div>' +
        ('<button data-fh-t="text.stop_all" type="button" class="fh-timer-alarm-stop-all" style="display:none;margin-top:16px;min-height:46px;width:100%;border:2px solid #8f5a00;border-radius:14px;background:transparent;color:#8f5a00;font-size:16px;font-weight:800;cursor:pointer;">' + __fhT("text.stop_all", "Stop all", null, "h") + '</button>') +
        "</div>";
      document.body.appendChild(modalEl);
      modalEl.addEventListener("click", (e) => {
        const btn = e.target.closest && e.target.closest("button");
        if (!btn) return;
        if (btn.classList.contains("fh-timer-alarm-stop-all")) {
          Array.from(ringing.keys()).forEach((uid) => stop(uid));
        } else if (btn.dataset.uid) {
          stop(btn.dataset.uid);
        }
      });
      return modalEl;
    }
    function render() {
      const el = ensureModal();
      if (!ringing.size) {
        el.style.display = "none";
        return;
      }
      const list = el.querySelector(".fh-timer-alarm-list");
      list.innerHTML = "";
      ringing.forEach((info, uid) => {
        const row = document.createElement("div");
        const title = document.createElement("div");
        title.className = "fh-timer-alarm-title";
        title.style.cssText = "font-size:1.3em;font-weight:800;margin-bottom:4px;overflow-wrap:anywhere;";
        title.textContent = info.title || __fhT("text.timer", "Timer");
        row.appendChild(title);
        if (info.body) {
          const body = document.createElement("div");
          body.style.cssText = "font-size:14px;color:#6b5f52;margin-bottom:10px;overflow-wrap:anywhere;";
          body.textContent = info.body;
          row.appendChild(body);
        }
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "fh-timer-alarm-stop";
        btn.dataset.uid = uid;
        btn.textContent = __fhT("text.stop", "Stop");
        btn.style.cssText = "min-height:54px;width:100%;border:none;border-radius:14px;background:#8f5a00;color:#fff8ea;font-size:19px;font-weight:800;cursor:pointer;";
        row.appendChild(btn);
        list.appendChild(row);
      });
      el.querySelector(".fh-timer-alarm-stop-all").style.display = ringing.size > 1 ? "" : "none";
      el.style.display = "flex";
    }
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
    // A two-pitch alarm-clock trill via Web Audio (no sound file to ship).
    function beepOnce() {
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === "suspended") audioCtx.resume();
        const now = audioCtx.currentTime;
        [[0, 1046], [0.15, 1318], [0.3, 1046]].forEach(([offset, freq]) => playBeep(now + offset, freq));
      } catch (e) {
        // Autoplay blocked or no Web Audio - the modal is still the alarm.
      }
    }
    // Ends whichever Family Hub screensaver is showing (they all close on
    // pointerdown on their own overlay).
    function wakeAnyScreenSaver() {
      try {
        const overlay = document.querySelector("[data-family-hub-screensaver]");
        if (overlay && overlay.style.display !== "none") {
          overlay.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        }
      } catch (e) {
        // best-effort
      }
    }
    function start(uid, title, body, hass) {
      if (hass) lastHass = hass;
      if (!uid || dismissedUids.has(uid)) return;
      const isNew = !ringing.has(uid);
      ringing.set(uid, { title: title || (ringing.get(uid) || {}).title || "Timer", body: body || (ringing.get(uid) || {}).body || "" });
      if (!isNew) return;
      wakeAnyScreenSaver();
      render();
      if (!beepHandle) {
        beepOnce();
        beepHandle = setInterval(beepOnce, 950);
      }
    }
    function stop(uid) {
      if (!uid) return;
      dismissedUids.add(uid);
      const had = ringing.delete(uid);
      if (!ringing.size && beepHandle) {
        clearInterval(beepHandle);
        beepHandle = null;
      }
      render();
      if (had && lastHass && lastHass.connection && lastHass.connection.sendMessagePromise) {
        lastHass.connection.sendMessagePromise({ type: "family_hub/timers/dismiss_alarm", uid }).catch(() => {});
      }
    }
    return {
      // From a card's 1-second countdown tick: the tab that started a timer rings the moment it reaches zero (any timer it started
      check(timers, clientId, remainingSecondsFn, hass) {
        if (hass) lastHass = hass;
        const me = clientId || myClientId();
        if (!me) return;
        (timers || []).forEach((t) => {
          if (t && t.origin_client_id && t.origin_client_id === me && !dismissedUids.has(t.uid) && remainingSecondsFn(t) <= 0) {
            start(t.uid, t.title || "Timer", "", hass);
          }
        });
      },
      // The backend's ring event (and list_active_alarms on load).
      ringBroadcast(payload, hass, myUserId) {
        if (!payload || !payload.uid || dismissedUids.has(payload.uid)) return;
        const targets = payload.target_user_ids || [];
        const fromHere = !!payload.origin_client_id && payload.origin_client_id === myClientId();
        const shouldRing = !!payload.broadcast_all || fromHere || (myUserId && targets.includes(myUserId));
        if (!shouldRing) return;
        start(payload.uid, payload.timer_title || payload.title, payload.body, hass);
      },
      // Someone stopped it somewhere else.
      stopFromServer(uid) {
        if (!uid) return;
        dismissedUids.add(uid);
        if (ringing.delete(uid)) {
          if (!ringing.size && beepHandle) {
            clearInterval(beepHandle);
            beepHandle = null;
          }
          render();
        }
      },
      _ringing() {
        return Array.from(ringing.keys());
      },
    };
  })();
}

// Theme flash-of-default fix - Root cause: EVERY themed card's first paint happens with no theme CSS vars set at all
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
        // Best-effort only - the in-memory copy above still helps every OTHER card mounted later in this same page load even if localStorage itself
      }
    }
    return { get, set };
  })();
}

class FamilyHubRewardsCard extends HTMLElement {
  static getStubConfig() {
    return { title: "Rewards" };
  }
  // switched to getConfigElement (a real custom element) so the Theme picker below can list live Theme Builder + native HA themes
  static getConfigElement() {
    return document.createElement("family-hub-rewards-card-editor");
  }
  // see family-hub-chores-card.js's identical setConfig/ _registerFabCoordinator comment for the full "dashboard" vs "card" design note
  setConfig(config) {
    this._config = {
      title: (config && config.title) || "Rewards",
      fab_position: config && config.fab_position === "card" ? "card" : "dashboard",
      theme_override: (config && typeof config.theme_override === "string") ? config.theme_override : "",
      // which people this card shows at all (Home Assistant user ids, picked in the card editor's "People on this card" list).
      people: Array.isArray(config && config.people) ? config.people.filter((id) => typeof id === "string" && id) : [],
    };
    this._registerFabCoordinator();
    if (this._settingsCache === undefined) this._settingsCache = null;
    if (this._globalThemes === undefined) this._globalThemes = [];
    if (this._users === undefined) this._users = [];
    if (this._balances === undefined) this._balances = {};
    if (this._catalog === undefined) this._catalog = [];
    if (this._redemptions === undefined) this._redemptions = [];
    // pending reward suggestions from someone without pricing authority
    if (this._suggestions === undefined) this._suggestions = [];
    // {user_id: {item_id: amount}} for "banked" redeem_mode rewards (see const.py's REWARD_REDEEM_MODES docstring)
    if (this._banks === undefined) this._banks = {};
    if (this._bankUsages === undefined) this._bankUsages = [];
    // On-demand per-user star history (family_hub/rewards/get_ledger) - only fetched when the Star History modal is actually opened
    if (this._historyLedger === undefined) this._historyLedger = [];
    if (this._myPermissions === undefined) this._myPermissions = {};
    if (this._manageOpen === undefined) this._manageOpen = false;
    // Goals, optionally embedded on the Rewards page (see _goalsInRewardsEnabled/_fetchGoals)
    if (this._goals === undefined) this._goals = [];
    if (this._firstLoadPromise === undefined) this._firstLoadPromise = null;
    if (!this._built) this._build();
    this._render();
  }
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    this._ensureTranslationsLoaded();
    // Keeps the shared screensaver controller's own hass reference fresh on every update (not just the first)
    if (window.__familyHubScreenSaver) window.__familyHubScreenSaver.updateHass(hass);
    if (first) this._firstLoadPromise = this._initFirstLoad();
  }
  async _initFirstLoad() {
    if (this._timers === undefined) this._timers = [];
    await Promise.all([this._fetchSettings(), this._fetchUsers(), this._fetchRewardsState(), this._fetchMyPermissions()]);
    await this._fetchTimers();
    this._startTimerTicker();
    // always fetch (not just when useGlobalTheme is on) so a per-card theme_override can resolve even when the household hasn't turned on Global
    await this._fetchGlobalThemes();
    if (this._goalsInRewardsEnabled()) await this._fetchGoals();
    // who (if anyone) can kiosk-PIN-login on this card - decides whether the Login button even shows at all (see _updateKioskLoginUi).
    await this._fetchKioskLoginUsers();
    this._updateKioskLoginUi();
    this._startPolling();
    this._registerScreenSaver();
    this._registerFabCoordinator();
    this._registerKioskSession();
    // a widened (kiosks/everyone) timer alarm only ever reached a dashboard through this subscription
    this._subscribeAlarmEvents();
    this._render();
  }
  async _subscribeAlarmEvents() {
    if (this._alarmUnsub || !this._hass || !this._hass.connection) return;
    const myUserId = this._myUserId();
    try {
      const unsubRing = await this._hass.connection.subscribeEvents((event) => {
        if (window.__familyHubTimerAlarm) {
          window.__familyHubTimerAlarm.ringBroadcast(event.data, this._hass, typeof this._myUserId === "function" ? this._myUserId() : myUserId);
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
      // Best-effort - a dashboard that can't subscribe (e.g. a very old frontend build) simply never gets the WIDENED alarm reach
    }
    // Catch up on anything already ringing before this tab opened
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
  // joins the shared kiosk-login session (see family-hub-chores-card.js's identical _registerKioskSession/singleton for the full design note
  _registerKioskSession() {
    if (window.__familyHubKioskSession) window.__familyHubKioskSession.registerClient(this, (elevation) => this._onKioskElevationChanged(elevation));
  }
  // Joins the shared, dashboard-wide screensaver controller rather than standing up its own overlay/idle-timer/camera-poll
  _registerScreenSaver() {
    if (window.__familyHubScreenSaver && this._hass) window.__familyHubScreenSaver.registerClient(this, this._hass);
  }
  // joins the shared FAB-stacking coordinator - see family-hub-chores-card.js's identical _registerFabCoordinator for the full design note.
  _registerFabCoordinator() {
    // fab_position "card" registers with takesSlot:false - see
    // family-hub-chores-card.js's identical comment for the full reasoning.
    if (!window.__familyHubFabCoordinator) return;
    const cardRelative = this._config && this._config.fab_position === "card";
    if (cardRelative) this.setAttribute("fab-position", "card");
    else this.removeAttribute("fab-position");
    window.__familyHubFabCoordinator.registerClient(
      this,
      "rewards",
      { providesGoalTab: this._goalsInRewardsEnabled() },
      (state) => {
        this.style.setProperty("--fh-fab-offset", `${state.offsetPx}px`);
        // hideForModal is true while ANY Family Hub card on this dashboard has a full-screen modal open
        const fab = this._root && this._root.querySelector(".add-reward-fab");
        if (fab) fab.hidden = !!state.hideForModal;
      },
      { takesSlot: !cardRelative }
    );
  }
  // the actual poll-refresh body, pulled out of _startPolling's setInterval callback so connectedCallback
  _pollTick() {
    this._fetchRewardsState();
    this._fetchTimers();
    if (this._goalsInRewardsEnabled()) this._fetchGoals();
  }
  _startPolling() {
    if (this._interval) return;
    this._interval = setInterval(() => this._pollTick(), 20 * 1000);
  }
  connectedCallback() {
    if (this._hass && !this._interval) {
      if (this._firstLoadPromise) {
        // Guard against a disconnect+reconnect happening again while THIS SAME first-load promise is still pending
        if (!this._reconnectPollPending) {
          this._reconnectPollPending = true;
          this._firstLoadPromise.then(() => {
            this._reconnectPollPending = false;
            if (!this.isConnected) return;
            this._pollTick();
            this._startPolling();
          });
        }
      } else {
        this._pollTick();
        this._startPolling();
      }
    }
    this._registerScreenSaver();
    this._registerFabCoordinator();
    this._registerKioskSession();
  }
  disconnectedCallback() {
    if (this._interval) clearInterval(this._interval);
    this._interval = null;
    if (window.__familyHubScreenSaver) window.__familyHubScreenSaver.unregisterClient(this);
    if (window.__familyHubFabCoordinator) window.__familyHubFabCoordinator.unregisterClient(this);
    if (window.__familyHubKioskSession) window.__familyHubKioskSession.unregisterClient(this);
    // same "force-remove a still-animating portal" cleanup as family-hub-chores-card.js's own disconnectedCallback
    if (this._confettiPortals && this._confettiPortals.length) {
      this._confettiPortals.forEach((portal) => portal.remove());
      this._confettiPortals = [];
    }
  }
  getCardSize() {
    return 6;
  }
  getGridOptions() {
    return { columns: 8, min_columns: 6, max_columns: 12, min_rows: 6 };
  }
  // while a kiosk PIN elevation is active (this._kioskElevation - a local mirror of window.__familyHubKioskSession's shared state
  _isAdmin() {
    if (this._kioskElevation) return !!this._kioskElevation.is_admin;
    return !!(this._hass && this._hass.user && this._hass.user.is_admin);
  }
  _myUserId() {
    if (this._kioskElevation) return this._kioskElevation.user_id;
    return this._hass && this._hass.user ? this._hass.user.id : null;
  }
  // family_hub/permissions/get_mine is open to any authenticated household member

  // -- Timers ----------------------------------------------------- "2 hours of gaming
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
  // Repaints just the countdown text in place, every second, without a full re-render
  _startTimerTicker() {
    if (this._timerTicker) return;
    this._timerTicker = setInterval(() => this._renderTimerCountdowns(), 1000);
  }
  _stopTimerTicker() {
    if (this._timerTicker) clearInterval(this._timerTicker);
    this._timerTicker = null;
  }
  _timerFor(predicate) {
    return (this._timers || []).find(predicate) || null;
  }
  _choreTimer(choreId) {
    return this._timerFor((t) => t.kind === "chore" && t.chore_id === choreId);
  }
  _rewardTimerFor(userId) {
    return this._timerFor((t) => t.kind === "reward" && t.user_id === userId);
  }
  // Mirrors timer_engine.remaining_seconds exactly - derived, never a stored counter, which is why a page reload
  _familyHubClientId() {
    if (this.__fhClientId) return this.__fhClientId;
    try {
      let id = sessionStorage.getItem("family_hub_client_id");
      if (!id) {
        id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
        sessionStorage.setItem("family_hub_client_id", id);
      }
      this.__fhClientId = id;
    } catch (e) {
      // Private browsing / storage blocked - an in-memory id still lets
      // the alarm work for this one page view, just not survive a reload.
      this.__fhClientId = this.__fhClientId || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    }
    return this.__fhClientId;
  }
  _timerRemainingSeconds(timer) {
    if (!timer) return 0;
    // when this timer is running on an adopted native HA timer.* helper
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
    // Hours only appear once there actually are some - "1:05:00" for a two-hour reward
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }
  _formatTimerLength(minutes) {
    const m = Number(minutes) || 0;
    if (m >= 60 && m % 60 === 0) return `${m / 60}h`;
    if (m > 60) return `${Math.floor(m / 60)}h${m % 60}m`;
    return `${m}m`;
  }
  _renderTimerCountdowns() {
    if (!this._root) return;
    // kiosk-side sound+modal alarm for whichever ONE running timer this exact browser tab started, if it opted into alarm-style delivery
    if (window.__familyHubTimerAlarm) {
      window.__familyHubTimerAlarm.check(this._timers, this._familyHubClientId(), (t) => this._timerRemainingSeconds(t));
    }
    let anyExpired = false;
    this._root.querySelectorAll("[data-timer-uid]").forEach((el) => {
      const timer = this._timerFor((t) => t.uid === el.dataset.timerUid);
      if (!timer) return;
      const left = this._timerRemainingSeconds(timer);
      el.textContent = this._formatTimerRemaining(left);
      if (left <= 0) anyExpired = true;
    });
    // The moment a countdown visibly hits zero, ask the backend what actually happened rather than guessing
    if (anyExpired && !this._timerExpiryRefreshPending) {
      this._timerExpiryRefreshPending = true;
      setTimeout(() => {
        this._timerExpiryRefreshPending = false;
        this._fetchTimers();
        if (typeof this._fetchChores === "function") this._fetchChores();
        if (typeof this._fetchRewardsState === "function") this._fetchRewardsState();
      }, 2000);
    }
  }
  async _startRewardTimer(itemId) {
    if (!itemId || !this._hass) return;
    try {
      await this._hass.connection.sendMessagePromise(
        this._kioskMsg({ type: "family_hub/timers/start_reward", item_id: itemId, client_id: this._familyHubClientId() })
      );
    } catch (e) {
      // The realistic failures are "you've already got one running" and "not enough stars"
      window.alert((e && e.message) || this._t("rewards.catalog.start_timer_failed", "Couldn't start that reward."));
    }
    await Promise.all([this._fetchTimers(), this._fetchRewardsState()]);
    this._render();
  }
  async _cancelTimer(uid) {
    if (!uid || !this._hass) return;
    try {
      await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/timers/cancel", uid }));
    } catch (e) {
    }
    await this._fetchTimers();
    this._render();
  }

  async _fetchMyPermissions() {
    if (!this._hass) return;
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/permissions/get_mine" });
      this._myPermissions = (result && result.permissions) || {};
    } catch (e) {
      this._myPermissions = {};
    }
  }
  _hasPermission(key) {
    if (this._isAdmin()) return true;
    if (this._kioskElevation) return !!(this._kioskElevation.permissions && this._kioskElevation.permissions[key]);
    return !!this._myPermissions[key];
  }
  // -- Native HA frontend i18n (same trio as family-hub-chores-card.js
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
      // Home Assistant hands cards the hass object that actually knows the newly loaded strings a moment AFTER loadBackendTranslation resolves
      if (this._hass.localize !== this._i18nLocalize) {
        this._i18nLocalize = this._hass.localize;
        // redraw only when our strings changed - a new localize function alone made cards flicker (GitHub issue #16)
        let probe = "";
        try { probe = this._hass.localize("component.family_hub.fh_ui.nav.settings") || ""; } catch (e) { probe = ""; }
        probe = `${this._hass.language}|${probe}`;
        if (probe !== this._i18nLastProbe) {
          this._i18nLastProbe = probe;
          this._onTranslationsReady();
        }
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
        console.warn("[family_hub] failed to load \"" + lang + "\" translations - staying on English fallback text", e);
      });
  }
  // (GitHub issue #10): dates and times follow the Home Assistant user's own language and time format (Profile > Language / Time format)
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
  // kiosk PIN login.
  _kioskMsg(base) {
    return this._kioskElevation ? Object.assign({}, base, { elevation_token: this._kioskElevation.token }) : base;
  }
  async _fetchKioskLoginUsers() {
    if (!this._hass) return;
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/kiosk/list_login_users" });
      this._kioskLoginUsers = (result && result.users) || [];
    } catch (e) {
      this._kioskLoginUsers = [];
    }
  }
  _updateKioskLoginUi() {
    const root = this._root;
    if (!root) return;
    const btn = root.querySelector(".kiosk-login-btn");
    if (!btn) return;
    btn.hidden = !this._kioskElevation && !(this._kioskLoginUsers && this._kioskLoginUsers.length);
    if (this._kioskElevation) {
      btn.textContent = this._t("rewards.kiosk_login.logged_in_as", "\u{1F464} %name% · Log out", { name: this._kioskElevation.name });
      btn.classList.add("active");
      btn.title = this._t("rewards.kiosk_login.logout_title", "Tap to log out of this kiosk session");
    } else {
      btn.textContent = this._t("rewards.kiosk_login.btn_label", "\u{1F512} Login");
      btn.classList.remove("active");
      btn.title = this._t("rewards.kiosk_login.title", "Log in as a specific household member on this kiosk display");
    }
  }
  async _onKioskLoginBtnClick() {
    if (this._kioskElevation) await this._kioskLogout();
    else await this._openKioskLoginModal();
  }
  async _openKioskLoginModal() {
    await this._fetchKioskLoginUsers();
    const root = this._root;
    if (!root) return;
    const overlay = root.querySelector(".kiosk-login-overlay");
    const pickerEl = root.querySelector(".kiosk-login-user-picker");
    const errEl = root.querySelector(".kiosk-login-error");
    const pinEl = root.querySelector(".kiosk-login-pin-input");
    if (errEl) errEl.textContent = "";
    if (pinEl) pinEl.value = "";
    this._kioskLoginSelectedUserId = null;
    if (pickerEl) {
      pickerEl.textContent = "";
      if (!this._kioskLoginUsers.length) {
        const empty = document.createElement("div");
        empty.className = "kiosk-login-empty";
        empty.textContent = this._t("rewards.kiosk_login.no_users", "No one is set up for kiosk login yet - an admin can enable it under Settings > Users.");
        pickerEl.appendChild(empty);
      } else {
        this._kioskLoginUsers.forEach((u) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "kiosk-login-user-btn";
          btn.dataset.userId = u.id;
          btn.textContent = u.name;
          btn.addEventListener("click", () => {
            pickerEl.querySelectorAll(".kiosk-login-user-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            this._kioskLoginSelectedUserId = u.id;
            if (pinEl) pinEl.focus();
          });
          pickerEl.appendChild(btn);
        });
      }
    }
    if (overlay) overlay.classList.add("open");
    if (pinEl) pinEl.focus();
  }
  _closeKioskLoginModal() {
    const overlay = this._root && this._root.querySelector(".kiosk-login-overlay");
    if (overlay) overlay.classList.remove("open");
  }
  async _submitKioskLogin() {
    const root = this._root;
    if (!root || !this._hass) return;
    const errEl = root.querySelector(".kiosk-login-error");
    const pinEl = root.querySelector(".kiosk-login-pin-input");
    const userId = this._kioskLoginSelectedUserId;
    const pin = pinEl ? pinEl.value.trim() : "";
    if (!userId) {
      if (errEl) errEl.textContent = this._t("rewards.kiosk_login.pick_user_first", "Pick who's logging in first.");
      return;
    }
    if (!pin) {
      if (errEl) errEl.textContent = this._t("rewards.kiosk_login.enter_pin", "Enter a PIN.");
      return;
    }
    try {
      // the actual elevate round trip and the shared elevation state now live in window.__familyHubKioskSession
      await window.__familyHubKioskSession.login(this._hass, userId, pin);
      this._closeKioskLoginModal();
    } catch (e) {
      if (errEl) errEl.textContent = (e && e.message) || this._t("rewards.kiosk_login.incorrect_pin", "Incorrect PIN.");
      if (pinEl) {
        pinEl.value = "";
        pinEl.focus();
      }
    }
  }
  // called whenever window.__familyHubKioskSession's shared elevation changes - from THIS card's own login/logout
  _onKioskElevationChanged(elevation) {
    this._kioskElevation = elevation;
    if (!this._root) return;
    this._updateKioskLoginUi();
    // Everything on the card (whose balance is "mine", which action buttons show) is derived from _myUserId/_hasPermission
    this._render();
  }
  // the 45-second inactivity timer and its document-wide activity listeners now live entirely in window.__familyHubKioskSession
  async _kioskLogout() {
    if (window.__familyHubKioskSession) await window.__familyHubKioskSession.logout(this._hass);
  }
  // Whoever can add straight to the catalog with a price (and so is also the audience for approving/rejecting someone else's suggestion)
  _canAddRewardsDirectly() {
    return this._hasPermission("can_override_rewards") || this._hasPermission("can_add_rewards");
  }
  // the same PERMISSION_VERIFY tier family-hub-goals-card.js's own
  // _canVerify uses, for approving/rejecting an embedded goal here.
  _canVerify() {
    return this._hasPermission("can_verify");
  }
  _canLogGoalsForOthers() {
    return this._canVerify() || this._hasPermission("can_complete_any");
  }
  _canLogGoalProgress(goal) {
    return goal.assigned_to === this._myUserId() || this._canLogGoalsForOthers();
  }
  // goalsShowInRewards, same household-wide Settings-toggle shape as family-hub-chores-card.js's own _goalsInChoresEnabled
  _goalsInRewardsEnabled() {
    return !!(this._settingsCache && this._settingsCache.goalsShowInRewards);
  }
  // Shares the exact same family_hub/goals/list command the standalone family-hub-goals-card.js and the Chores card's own embedded block poll
  async _fetchGoals() {
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/goals/list" });
      this._goals = (result && Array.isArray(result.goals)) ? result.goals : [];
    } catch (e) {
      // keep whatever we had
    }
    this._render();
  }
  async _logGoalProgress(id) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/goals/log_progress", goal_id: id });
      await this._fetchGoals();
    } catch (e) {
    }
  }
  async _approveGoal(id) {
    try {
      await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/goals/approve", goal_id: id }));
      await this._fetchGoals();
    } catch (e) {
    }
  }
  // was a window.prompt() (couldn't tell "Cancel the whole action" from "send with an empty reason"
  _openRejectModal(id) {
    const goal = this._goals.find((g) => g.id === id);
    if (!goal) return;
    const overlay = this._root.querySelector(".reject-modal");
    const box = overlay.querySelector(".modal-box");
    box.innerHTML = `
      <button type="button" class="modal-close reject-modal-close" aria-label="${this._t("common.close", "Close")}">&#10005;</button>
      <h2>${this._t("rewards.goal_reject.title", 'Send back "%title%"', { title: this._esc(goal.title) })}</h2>
      <div class="field"><label>${this._t("rewards.goal_reject.reason_label", "Anything you want to tell them about why? (optional)")}</label><textarea class="f-reject-reason" rows="3" placeholder="${this._t("rewards.goal_reject.reason_placeholder", "Not quite - try again")}"></textarea></div>
      <div class="modal-actions">
        <button class="cancel-btn">${this._t("common.cancel", "Cancel")}</button>
        <button class="save-btn">${this._t("rewards.goal.send_back", "Send back")}</button>
      </div>
      <div class="form-error"></div>
    `;
    box.querySelector(".reject-modal-close").addEventListener("click", () => overlay.classList.remove("open"));
    box.querySelector(".cancel-btn").addEventListener("click", () => overlay.classList.remove("open"));
    box.querySelector(".save-btn").addEventListener("click", () => this._submitRejectGoal(id, overlay, box));
    overlay.classList.add("open");
    box.querySelector(".f-reject-reason").focus();
  }
  async _submitRejectGoal(id, overlay, box) {
    const reason = box.querySelector(".f-reject-reason").value.trim();
    overlay.classList.remove("open");
    try {
      await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/goals/reject", goal_id: id, reason }));
    } catch (e) {
    }
    await this._fetchGoals();
  }
  // Achieved goals had no way to complete/ hide them here either (only the standalone Goals card got this first
  async _archiveGoal(id) {
    try {
      await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/goals/archive", goal_id: id }));
      // same confetti celebration as family-hub-chores-card.js's
      // own _archiveGoal - see that method's comment.
      if (this._confettiOnCompleteEnabled()) this._fireConfetti();
    } catch (e) {
    }
    await this._fetchGoals();
  }
  _goalRowHtml(goal) {
    const target = Math.max(1, goal.target_count || 1);
    const current = Math.min(target, goal.current_count || 0);
    const canLog = goal.status === GOAL_STATUS_OPEN && this._canLogGoalProgress(goal);
    const progressLabel = target > 1
      ? this._t("rewards.goal.progress_count", "%current% / %target% logged", { current, target })
      : (current >= target ? this._t("common.done", "Done") : this._t("rewards.goal.not_yet_done", "Not yet done"));
    let actions = "";
    if (canLog) actions += `<button type="button" class="goal-log-btn" data-id="${goal.id}">${target > 1 ? this._t("rewards.goal.log_progress", "Log progress") : this._t("rewards.goal.mark_done", "Mark done")}</button>`;
    if (goal.status === GOAL_STATUS_PENDING_VERIFICATION) {
      if (this._canVerify()) {
        actions += `<button type="button" class="goal-approve-btn" data-id="${goal.id}">${this._t("rewards.goal.approve", "Approve")}</button>`;
        actions += `<button type="button" class="goal-reject-btn" data-id="${goal.id}">${this._t("rewards.goal.send_back", "Send back")}</button>`;
      } else actions += `<span class="suggestion-pending">${this._t("rewards.goal.awaiting_approval", "Awaiting approval")}</span>`;
    } else if (goal.status === GOAL_STATUS_APPROVED) {
      actions += `<span class="suggestion-pending">&#10003; ${this._t("rewards.goal.achieved", "Achieved")}</span>`;
      if (goal.assigned_to === this._myUserId() || this._hasPermission("can_assign")) {
        actions += `<button type="button" class="goal-complete-btn" data-id="${goal.id}">${this._t("rewards.goal.complete", "Complete")}</button>`;
      }
    }
    return `
      <div class="suggestion-row goal-row" data-id="${goal.id}">
        <div class="suggestion-icon">&#127942;</div>
        <div class="suggestion-title">${this._esc(goal.title)}</div>
        <div class="suggestion-by">${this._esc(this._userName(goal.assigned_to))} - ${progressLabel}</div>
        <span class="suggestion-actions goal-row-actions">${actions}</span>
      </div>
    `;
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
    // defaults ON, matching family-hub-chores-card.js's own _defaultSettings (see that file's comment for why this has to be listed here too
    return { theme: this._defaultTheme(), useGlobalTheme: true, globalThemeId: "slate", choresConfettiOnComplete: true };
  }
  _getSettings() {
    return this._settingsCache || this._defaultSettings();
  }
  // This card has no chores/routines of its own, but it does embed the same Goals board every other card embeds (see _archiveGoal below)
  _confettiOnCompleteEnabled() {
    return !!(this._settingsCache && this._settingsCache.choresConfettiOnComplete);
  }
  _confettiCss() {
    return `
      .chore-confetti-overlay { position: fixed; top: 0; right: 0; bottom: 0; left: 0; pointer-events: none; z-index: 9999; overflow: hidden; }
      .chore-confetti-piece { position: absolute; top: -12px; width: 8px; height: 14px; opacity: 0.95; animation-name: chore-confetti-fall; animation-timing-function: cubic-bezier(0.35, 0, 0.65, 1); animation-fill-mode: forwards; }
      @keyframes chore-confetti-fall {
        0% { transform: translateY(0) rotate(0deg); opacity: 1; }
        85% { opacity: 1; }
        100% { transform: translateY(110vh) rotate(var(--chore-confetti-rot)); opacity: 0; }
      }
    `;
  }
  _fireConfetti() {
    const COLORS = ["#f94144", "#f3722c", "#f9c74f", "#90be6d", "#43aa8b", "#577590", "#f8961e", "#f9844a"];
    const portal = document.createElement("div");
    portal.className = "fh-chore-confetti-portal";
    const style = document.createElement("style");
    style.textContent = this._confettiCss();
    portal.appendChild(style);
    const overlay = document.createElement("div");
    overlay.className = "chore-confetti-overlay";
    portal.appendChild(overlay);
    const PIECE_COUNT = 70;
    let maxLifetimeMs = 0;
    for (let i = 0; i < PIECE_COUNT; i++) {
      const piece = document.createElement("span");
      piece.className = "chore-confetti-piece";
      const durationS = 1.5 + Math.random() * 1.2;
      const delayS = Math.random() * 0.35;
      const rotationDeg = (360 + Math.random() * 720) * (Math.random() < 0.5 ? -1 : 1);
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = COLORS[Math.floor(Math.random() * COLORS.length)];
      piece.style.animationDuration = `${durationS}s`;
      piece.style.animationDelay = `${delayS}s`;
      piece.style.setProperty("--chore-confetti-rot", `${rotationDeg}deg`);
      if (Math.random() < 0.5) piece.style.borderRadius = "50%";
      overlay.appendChild(piece);
      maxLifetimeMs = Math.max(maxLifetimeMs, (durationS + delayS) * 1000);
    }
    document.body.appendChild(portal);
    if (!this._confettiPortals) this._confettiPortals = [];
    this._confettiPortals.push(portal);
    setTimeout(() => {
      portal.remove();
      if (this._confettiPortals) {
        const idx = this._confettiPortals.indexOf(portal);
        if (idx !== -1) this._confettiPortals.splice(idx, 1);
      }
    }, maxLifetimeMs + 200);
  }
  _getDeviceThemeOverride() {
    let raw = "";
    try {
      raw = localStorage.getItem("familyHubDeviceThemeOverrideLocal") || "";
    } catch (e) {
    }
    return raw;
  }
  // Shared by both the new per-card override branch and the existing household-global branch below
  _themeFromGlobalEntry(g) {
    const defaultTheme = this._defaultTheme();
    const colors = {};
    Object.keys(defaultTheme.colors).forEach((k) => {
      const v = g.colors && g.colors[k];
      colors[k] = typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : defaultTheme.colors[k];
    });
    // cardOpacity/glassBlur (the "liquid glass" look - see the Liquid Glass/Liquid Glass Dark built-in presets) aren't part of defaultTheme
    const cardOpacity = typeof g.cardOpacity === "number" ? g.cardOpacity : 100;
    const glassBlur = typeof g.glassBlur === "number" ? g.glassBlur : 0;
    return { colors, cardOpacity, glassBlur, background: g.background || null };
  }
  _resolveTheme(settings) {
    const local = settings.theme || this._defaultTheme();
    // a per-card-placement Theme override (set from this card's own native "Edit Card" dialog) wins over everything else
    const cardOverride = this._config && this._config.theme_override;
    if (cardOverride) {
      const g = (this._globalThemes || []).find((t) => t && t.id === cardOverride);
      if (g) return this._themeFromGlobalEntry(g);
    }
    // a holiday background set to change the theme wins while it's showing
    if (window.__fhHolidayTheme) {
      if (!this.__fhHolidaySub) this.__fhHolidaySub = window.__fhHolidayTheme.subscribe(() => { if (this.isConnected) this._applyThemeVars(); });
      const holidayThemeId = window.__fhHolidayTheme.themeId(this._hass);
      const hg = holidayThemeId && (this._globalThemes || []).find((t) => t && t.id === holidayThemeId);
      if (hg) return this._themeFromGlobalEntry(hg);
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
  // see window.__familyHubThemeCache's own comment above the class for the full "why a key, not one shared blob" reasoning.
  _familyHubThemeCacheKey() {
    const cardOverride = this._config && this._config.theme_override;
    if (cardOverride) return `card:${cardOverride}`;
    const deviceOverride = this._getDeviceThemeOverride();
    if (deviceOverride) return `device:${deviceOverride}`;
    return "household";
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
    const theme = this._resolveTheme(this._getSettings());
    // same "liquid glass" support family-week-calendar-card.js has - a theme's cardOpacity/glassBlur (100/0 defaults
    const cardOpacity = typeof theme.cardOpacity === "number" ? theme.cardOpacity : 100;
    const glassBlur = typeof theme.glassBlur === "number" ? theme.glassBlur : 0;
    // built as a plain object first (rather than each var going straight into its own setProperty call
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
    };
        // the theme's own background image (the Liquid Glass aurora, or any image a theme sets in Theme Builder) now paints behind this card too
    Object.assign(vars, this._fhThemeBgVars(theme.background));
    Object.keys(vars).forEach((name) => this.style.setProperty(name, vars[name]));
    if (window.__familyHubThemeCache) window.__familyHubThemeCache.set(this._familyHubThemeCacheKey(), vars);
  }
  // applies whatever theme this device/placement last actually resolved to, SYNCHRONOUSLY
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
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_settings" });
      const raw = result && result.settings;
      this._settingsCache = raw && typeof raw === "object" ? Object.assign(this._defaultSettings(), raw) : this._defaultSettings();
    } catch (e) {
      if (!this._settingsCache) this._settingsCache = this._defaultSettings();
    }
    this._applyThemeVars();
    // keep the FAB coordinator's picture of "does this card currently offer a Goal tab" in sync with a live Settings change
    if (window.__familyHubFabCoordinator) {
      window.__familyHubFabCoordinator.updateClientMeta(this, { providesGoalTab: this._goalsInRewardsEnabled() });
    }
  }
  async _fetchGlobalThemes() {
    let custom = [];
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "theme_builder/list" });
      custom = (result && Array.isArray(result.themes)) ? result.themes : [];
    } catch (e) {
      custom = [];
    }
    // also merge in every installed native Home Assistant theme - duplicated
    this._globalThemes = custom.concat(this._nativeHaThemeEntries());
    this._applyThemeVars();
  }
  // -- Native HA theme support (duplicated from family-week-calendar- card.js's identical methods
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
  // Note: this card's own theme shape has no `fonts` concept - only `colors`/`cardOpacity`/`glassBlur` are ever read via _themeFromGlobalEntry
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
  async _fetchUsers() {
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/list_users" });
      this._users = (result && Array.isArray(result.users)) ? result.users : [];
    } catch (e) {
      this._users = [];
    }
  }
  async _fetchRewardsState() {
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/rewards/get_state" });
      this._balances = (result && result.balances) || {};
      this._catalog = (result && result.catalog) || [];
      this._redemptions = (result && result.redemptions) || [];
      this._suggestions = (result && result.suggestions) || [];
      this._banks = (result && result.banks) || {};
      this._bankUsages = (result && result.bank_usages) || [];
    } catch (e) {
      // keep whatever we had
    }
    this._render();
    // The Star History modal (if open) shows redemption/bank-usage rows pulled from these same lists, filtered client-side
    if (this._root.querySelector(".star-history-modal").classList.contains("open")) this._renderStarHistoryModal();
  }
  _userName(id) {
    const u = this._users.find((x) => x.id === id);
    return u ? u.name : id;
  }
  // A person's own custom color (settings.userProfiles[id].color, set on the Users tab of the calendar card's Settings
  _userColor(id) {
    const profiles = (this._settingsCache && this._settingsCache.userProfiles) || {};
    const custom = profiles[id] && profiles[id].color;
    if (custom) return custom;
    const idx = this._users.findIndex((x) => x.id === id);
    return idx >= 0 ? PALETTE[idx % PALETTE.length] : "#c9c2b3";
  }
  // memberUserIds lives on the Settings blob (see const.py's SETTINGS_KEY_MEMBER_USER_IDS)
  _isFamilyHubMember(userId) {
    const memberIds = (this._settingsCache && this._settingsCache.memberUserIds) || [];
    return memberIds.includes(userId);
  }
  // a second, narrower opt-out UNDER Family Hub membership - see const.py's own "v121+" docstring right after SETTINGS_KEY_MEMBER_USER_IDS.
  _isChoresIncluded(userId) {
    if (!this._isFamilyHubMember(userId)) return false;
    const profiles = (this._settingsCache && this._settingsCache.userProfiles) || {};
    const profile = profiles[userId];
    // a kiosk account (a shared tablet login) is never on Chores, Rewards or Goals
    return !profile || (profile.includeInChores !== false && !profile.isKioskAccount);
  }
  // calendar-style person pills across the top - household ask: "make the chores and rewards card able to have the pill style names across the
  _configuredPeopleIds() {
    const chosen = (this._config && Array.isArray(this._config.people)) ? this._config.people : [];
    const me = this._myUserId();
    return chosen.map((id) => (id === "me" ? me : id)).filter((id) => typeof id === "string" && id);
  }
  _isJustMeCard() {
    return !!(this._config && Array.isArray(this._config.people) && this._config.people.includes("me"));
  }
  _limitToConfiguredPeople(items, idOf) {
    const chosen = (this._config && Array.isArray(this._config.people)) ? this._config.people : [];
    if (!chosen.length) return items;
    const ids = this._configuredPeopleIds();
    const kept = items.filter((it) => ids.includes(idOf(it)));
    if (kept.length || this._isJustMeCard()) return kept;
    return items;
  }
  _personFilterStorageKey() {
    let path = "";
    try {
      path = (window.location && window.location.pathname) || "";
    } catch (e) {
      path = "";
    }
    return `familyHubPersonFilter:rewards:${path}`;
  }
  _personFilterIds() {
    if (!Array.isArray(this._personFilter)) {
      let saved = [];
      try {
        const raw = localStorage.getItem(this._personFilterStorageKey());
        const parsed = raw ? JSON.parse(raw) : [];
        saved = Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string" && id) : [];
      } catch (e) {
        saved = [];
      }
      this._personFilter = saved;
    }
    return this._personFilter;
  }
  // The filter actually in effect for this set of people: only ids that
  // still exist count, and if none of them do, it's "show everyone".
  _activePersonFilter(knownIds) {
    const known = new Set(knownIds);
    return this._personFilterIds().filter((id) => known.has(id));
  }
  _togglePersonFilter(id) {
    const list = this._personFilterIds().slice();
    const at = list.indexOf(id);
    if (at === -1) list.push(id);
    else list.splice(at, 1);
    this._personFilter = list;
    try {
      localStorage.setItem(this._personFilterStorageKey(), JSON.stringify(list));
    } catch (e) {
      // per-device convenience only - the filter still works this session
    }
    this._render();
  }
  // pills: [{ id, name, color, count }] - drawn into .person-pills. Hidden
  // when there's only one person (nothing to choose between).
  _renderPersonPills(pills) {
    const el = this._root && this._root.querySelector(".person-pills");
    if (!el) return;
    if (!Array.isArray(pills) || pills.length < 2) {
      el.innerHTML = "";
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const active = this._activePersonFilter(pills.map((p) => p.id));
    const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
    el.innerHTML = pills
      .map((p) => {
        const isActive = active.includes(p.id);
        const isDimmed = active.length > 0 && !isActive;
        const initial = (String(p.name || "?").trim().charAt(0) || "?").toUpperCase();
        return `<button type="button" class="person-pill${isActive ? " active-filter" : ""}${isDimmed ? " dimmed" : ""}" data-person-id="${esc(p.id)}" aria-pressed="${isActive ? "true" : "false"}" style="background:${esc(p.color)}"><span class="person-pill-avatar">${esc(initial)}</span>${esc(p.name)}${p.count !== undefined && p.count !== null && p.count !== "" ? ` <span class="person-pill-count">${esc(p.count)}</span>` : ""}</button>`;
      })
      .join("");
    el.querySelectorAll(".person-pill").forEach((btn) => {
      btn.addEventListener("click", () => this._togglePersonFilter(btn.dataset.personId));
    });
  }

  _memberUsers() {
    return this._users.filter((u) => this._isChoresIncluded(u.id));
  }
  _escAttr(s) {
    return this._esc(s).replace(/"/g, "&quot;");
  }
  // -- Editable libraries (routines / chores / rewards) -----------------------------------------
  // A "Pick from library" list that fills in the form, plus an editor for people allowed to change
  // the list (the backend decides who: family_hub/library/list returns can_edit).
  async _loadLibrary(kind, force) {
    if (!this._libraries) this._libraries = {};
    if (!force && this._libraries[kind]) return this._libraries[kind];
    let lib = { items: [], canEdit: false };
    try {
      const result = await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/library/list", kind }));
      lib = { items: (result && result.items) || [], canEdit: !!(result && result.can_edit) };
    } catch (e) {
      // older backend: routines still have the read-only list
      if (kind === "routines") {
        try {
          const old = await this._hass.connection.sendMessagePromise({ type: "family_hub/routines/library" });
          lib = { items: ((old && old.items) || []).map((it, i) => Object.assign({ id: `old_${i}` }, it)), canEdit: false };
        } catch (e2) {
          // nothing to offer
        }
      }
    }
    this._libraries[kind] = lib;
    return lib;
  }
  _libraryPickerHtml(kind) {
    return `<div class="lib-row"><select class="lib-pick" data-kind="${kind}"><option value="">${this._esc(this._t("library.pick", "Pick from library… (optional)"))}</option></select><button type="button" class="lib-edit-btn" data-kind="${kind}" hidden title="${this._escAttr(this._t("library.edit", "Edit library"))}">&#9998;</button></div>`;
  }
  _libraryOptionLabel(kind, it) {
    const amount = kind === "rewards" ? it.cost_stars : it.star_value;
    return `${it.icon ? `${it.icon} ` : ""}${it.title}${amount ? ` (${amount}⭐)` : ""}`;
  }
  async _populateLibraryPicker(box, kind) {
    const lib = await this._loadLibrary(kind);
    const select = box.querySelector(`.lib-pick[data-kind="${kind}"]`);
    if (!select) return;
    const option = (it) => `<option value="${this._escAttr(it.id)}">${this._esc(this._libraryOptionLabel(kind, it))}</option>`;
    let body;
    if (kind === "routines" && typeof ROUTINE_CATEGORIES !== "undefined") {
      const byCat = {};
      lib.items.forEach((it) => (byCat[it.category] = byCat[it.category] || []).push(it));
      body = ROUTINE_CATEGORIES.filter((c) => byCat[c] && byCat[c].length)
        .map((c) => `<optgroup label="${this._escAttr(this._routineCategoryLabel ? this._routineCategoryLabel(c) : c)}">${byCat[c].map(option).join("")}</optgroup>`)
        .join("");
    } else {
      body = lib.items.map(option).join("");
    }
    select.innerHTML = `<option value="">${this._esc(this._t("library.pick", "Pick from library… (optional)"))}</option>${body}`;
    const editBtn = box.querySelector(`.lib-edit-btn[data-kind="${kind}"]`);
    if (editBtn) editBtn.hidden = !lib.canEdit;
  }
  _wireLibraryPicker(box, kind, onPick) {
    const select = box.querySelector(`.lib-pick[data-kind="${kind}"]`);
    if (!select) return;
    select.addEventListener("change", () => {
      const lib = (this._libraries && this._libraries[kind]) || { items: [] };
      const item = lib.items.find((it) => it.id === select.value);
      select.value = "";
      if (item) onPick(item);
    });
    const editBtn = box.querySelector(`.lib-edit-btn[data-kind="${kind}"]`);
    if (editBtn) editBtn.addEventListener("click", () => this._openLibraryEditor(kind, () => this._populateLibraryPicker(box, kind)));
    this._populateLibraryPicker(box, kind);
  }
  _libraryEditorRowHtml(kind, it) {
    const amount = kind === "rewards" ? it.cost_stars : it.star_value;
    const cats = kind === "routines" && typeof ROUTINE_CATEGORIES !== "undefined"
      ? `<select class="lib-ed-cat">${ROUTINE_CATEGORIES.map((c) => `<option value="${c}"${it.category === c ? " selected" : ""}>${this._esc(this._routineCategoryLabel ? this._routineCategoryLabel(c) : c)}</option>`).join("")}</select>`
      : "";
    return `<div class="lib-ed-row" data-id="${this._escAttr(it.id || "")}">
      <input type="text" class="lib-ed-icon" maxlength="4" value="${this._escAttr(it.icon || "")}" placeholder="&#11088;">
      <input type="text" class="lib-ed-title" maxlength="80" value="${this._escAttr(it.title || "")}" placeholder="${this._escAttr(this._t("library.item_name", "Name"))}">
      <div class="lib-ed-meta"><label class="lib-ed-amount-wrap" title="${this._escAttr(kind === "rewards" ? this._t("library.cost", "Cost in stars") : this._t("library.stars", "Stars"))}">&#11088;<input type="number" class="lib-ed-amount" min="0" inputmode="numeric" value="${amount || 0}"></label>${cats}</div>
      <button type="button" class="lib-ed-del" title="${this._escAttr(this._t("library.remove", "Remove"))}">&#10005;</button>
    </div>`;
  }
  async _openLibraryEditor(kind, onClose) {
    const lib = await this._loadLibrary(kind, true);
    const heading = kind === "rewards" ? this._t("library.rewards_title", "Rewards library") : kind === "chores" ? this._t("library.chores_title", "Chores library") : this._t("library.routines_title", "Routines library");
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay library-editor-overlay open";
    overlay.style.zIndex = "1200";
    overlay.innerHTML = `<div class="modal-box library-editor-box">
      <button type="button" class="modal-close lib-ed-close" aria-label="${this._escAttr(this._t("common.close", "Close"))}">&#10005;</button>
      <h2>&#128218; ${this._esc(heading)}</h2>
      <div class="lib-ed-hint">${this._esc(this._t("library.hint", "Changes save as you go. Everyone picks from this list."))}</div>
      <button type="button" class="lib-ed-add">+ ${this._esc(this._t("library.add", "Add an item"))}</button>
      <div class="lib-ed-list">${lib.items.map((it) => this._libraryEditorRowHtml(kind, it)).join("")}</div>
      <div class="lib-ed-status"></div>
      <div class="modal-actions">
        <button type="button" class="cancel-btn lib-ed-reset">${this._esc(this._t("library.reset", "Add back removed built-in items"))}</button>
        <button type="button" class="save-btn lib-ed-done">${this._esc(this._t("common.done", "Done"))}</button>
      </div>
    </div>`;
    const status = overlay.querySelector(".lib-ed-status");
    const list = overlay.querySelector(".lib-ed-list");
    const send = async (msg) => {
      try {
        const result = await this._hass.connection.sendMessagePromise(this._kioskMsg(Object.assign({ kind }, msg)));
        this._libraries[kind] = { items: (result && result.items) || [], canEdit: true };
        status.textContent = this._t("library.saved", "Saved.");
        return result;
      } catch (e) {
        status.textContent = (e && e.message) || this._t("library.failed", "Couldn't save that.");
        return null;
      }
    };
    const saveRow = async (row) => {
      const item = {
        title: row.querySelector(".lib-ed-title").value.trim(),
        icon: row.querySelector(".lib-ed-icon").value.trim(),
      };
      if (!item.title) return;
      if (row.dataset.id) item.id = row.dataset.id;
      const amount = parseInt(row.querySelector(".lib-ed-amount").value, 10) || 0;
      if (kind === "rewards") item.cost_stars = amount;
      else item.star_value = amount;
      const cat = row.querySelector(".lib-ed-cat");
      if (cat) item.category = cat.value;
      const result = await send({ type: "family_hub/library/save_item", item });
      if (result && result.result && result.result.id) row.dataset.id = result.result.id;
    };
    list.addEventListener("change", (e) => {
      const row = e.target.closest(".lib-ed-row");
      if (row) saveRow(row);
    });
    list.addEventListener("click", async (e) => {
      const del = e.target.closest(".lib-ed-del");
      if (!del) return;
      const row = del.closest(".lib-ed-row");
      if (row.dataset.id) await send({ type: "family_hub/library/delete_item", item_id: row.dataset.id });
      row.remove();
    });
    overlay.querySelector(".lib-ed-add").addEventListener("click", () => {
      list.insertAdjacentHTML("afterbegin", this._libraryEditorRowHtml(kind, { id: "", title: "", icon: "", category: "morning" }));
      list.querySelector(".lib-ed-row .lib-ed-title").focus();
    });
    const resetBtn = overlay.querySelector(".lib-ed-reset");
    // Adds back built-in items that were removed; nothing added or changed is lost, so no confirm step
    resetBtn.addEventListener("click", async () => {
      const result = await send({ type: "family_hub/library/reset" });
      if (!result) return;
      list.innerHTML = this._libraries[kind].items.map((it) => this._libraryEditorRowHtml(kind, it)).join("");
      const n = (result.result && result.result.restored) || 0;
      status.textContent = n
        ? this._t("library.restored", "Added back %n% built-in item(s).", { n })
        : this._t("library.nothing_to_restore", "All the built-in items are already here.");
    });
    const close = () => {
      overlay.remove();
      if (onClose) onClose();
    };
    overlay.querySelector(".lib-ed-close").addEventListener("click", close);
    overlay.querySelector(".lib-ed-done").addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    this._root.appendChild(overlay);
  }
  _esc(s) {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  }

  _build() {
    this._built = true;
    // applied BEFORE attachShadow/the first innerHTML paint - see _applyCachedThemeVarsIfAny's own comment and window.__familyHub ThemeCache's
    this._applyCachedThemeVarsIfAny();
    this.attachShadow({ mode: "open" });
    const root = this.shadowRoot;
    root.innerHTML = `
      <style>${this._css()}</style>
      <ha-card>
        <div class="header">
          <div class="title"></div>
          <div class="actions">
            <button class="manage-stars-btn" data-i18n-title="rewards.header.manage_stars_title" title="Manually add or subtract stars, with a reason - for bonuses, corrections, etc. outside chores/rewards/goals" hidden><span data-i18n="rewards.header.manage_stars_btn">&#11088; Manage stars</span></button>
            <button data-fh-t="text.manage_catalog" class="manage-btn" hidden>${__fhT("text.manage_catalog", "Manage catalog", null, "h")}</button>
            <button data-fh-t="text.login" data-fh-title="text.log_in_as_a_specific_household_member" class="kiosk-login-btn" title="${__fhT("text.log_in_as_a_specific_household_member", "Log in as a specific household member on this kiosk display", null, "h")}" hidden>${__fhT("text.login", "🔒 Login", null, "h")}</button>
          </div>
        </div>
        <div class="person-pills" hidden></div>
        <div class="balances"></div>
        <div class="section-title" data-i18n="rewards.sections.catalog">Reward catalog</div>
        <div class="catalog"></div>
        <div class="section-title goals-title" data-i18n="rewards.sections.goals" hidden>Goals</div>
        <div class="goals"></div>
        <div class="section-title suggestions-title" data-i18n="rewards.sections.suggestions" hidden>Suggested rewards</div>
        <div class="suggestions"></div>
        <div class="section-title pending-title" data-i18n="rewards.sections.pending" hidden>Pending rewards</div>
        <div class="pending"></div>
        <div class="section-title" data-i18n="rewards.sections.history">Recent redemptions</div>
        <div class="history"></div>
      </ha-card>
      <div class="modal-overlay create-reward-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay star-history-modal"><div class="modal-box star-history-box"></div></div>
      <div class="modal-overlay gift-stars-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay manage-stars-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay reject-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay kiosk-login-overlay">
        <div class="modal-box kiosk-login-box">
          <button type="button" class="star-history-close-btn kiosk-login-close" data-i18n-title="common.close" title="Close">&#10005;</button>
          <h2 data-i18n="rewards.kiosk_login.heading">&#128274; Kiosk login</h2>
          <div class="kiosk-login-user-picker"></div>
          <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" class="kiosk-login-pin-input" placeholder="PIN" />
          <div class="kiosk-login-error"></div>
          <div class="modal-actions">
            <button class="cancel-btn kiosk-login-cancel" data-i18n="common.cancel">Cancel</button>
            <button class="save-btn kiosk-login-submit" data-i18n="rewards.kiosk_login.submit">Log in</button>
          </div>
        </div>
      </div>
      <button class="add-reward-fab" data-i18n-title="rewards.add_reward_fab_title" title="Add a reward" aria-haspopup="true">&#65291;</button>
    `;
    this._root = root;
    // A fixed round + button in the bottom-right corner, pixel-for-pixel matching family-week-calendar-card.js's own add-event-fab and
    root.querySelector(".add-reward-fab").addEventListener("click", () => this._openCreateRewardModal());
    root.querySelectorAll(".modal-overlay").forEach((ov) => {
      ov.addEventListener("click", (e) => {
        if (e.target === ov) ov.classList.remove("open");
      });
    });
    root.querySelector(".manage-btn").addEventListener("click", () => {
      this._manageOpen = !this._manageOpen;
      this._render();
    });
    // the manual stars-adjustment modal (task: "Need a stars manage modal.
    root.querySelector(".manage-stars-btn").addEventListener("click", () => this._openManageStarsModal());
    // kiosk PIN login - see _onKioskLoginBtnClick's own
    // docstring for the full picture.
    root.querySelector(".kiosk-login-btn").addEventListener("click", () => this._onKioskLoginBtnClick());
    root.querySelector(".kiosk-login-close").addEventListener("click", () => this._closeKioskLoginModal());
    root.querySelector(".kiosk-login-cancel").addEventListener("click", () => this._closeKioskLoginModal());
    root.querySelector(".kiosk-login-submit").addEventListener("click", () => this._submitKioskLogin());
    root.querySelector(".kiosk-login-pin-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._submitKioskLogin();
    });
    // the 45-second idle-reset activity listeners moved to window.__familyHubKioskSession itself (document-level, shared)
    root.addEventListener("click", (e) => this._onClick(e));
  }

  _onClick(e) {
    const claimBtn = e.target.closest(".claim-btn");
    const delBtn = e.target.closest(".manage-delete-btn");
    const goalLogBtn = e.target.closest(".goal-log-btn");
    const goalApproveBtn = e.target.closest(".goal-approve-btn");
    const goalRejectBtn = e.target.closest(".goal-reject-btn");
    const goalCompleteBtn = e.target.closest(".goal-complete-btn");
    if (goalLogBtn) return this._logGoalProgress(goalLogBtn.dataset.id);
    if (goalApproveBtn) return this._approveGoal(goalApproveBtn.dataset.id);
    if (goalRejectBtn) return this._openRejectModal(goalRejectBtn.dataset.id);
    if (goalCompleteBtn) return this._archiveGoal(goalCompleteBtn.dataset.id);
    // a timed reward's Claim starts the countdown (and spends
    // the stars) in one backend call instead of just logging a redemption.
    if (claimBtn) {
      return Number(claimBtn.dataset.timer) > 0
        ? this._startRewardTimer(claimBtn.dataset.id)
        : this._claim(claimBtn.dataset.id);
    }
    const timerCancelBtn = e.target.closest(".catalog-timer-cancel-btn");
    if (timerCancelBtn) return this._cancelTimer(timerCancelBtn.dataset.uid);
    if (delBtn) return this._deleteItem(delBtn.dataset.id);
    // Edit an existing catalog item - opens the same Add-reward modal pre-filled (see _openCreateRewardModal), only ever shown while _manageOpen
    const editBtn = e.target.closest(".manage-edit-btn");
    if (editBtn) return this._openCreateRewardModal(this._catalog.find((it) => it.id === editBtn.dataset.id));
    if (e.target.closest(".adjust-plus-btn")) return this._adjustBalance(e.target.closest(".adjust-plus-btn").dataset.user, 1);
    if (e.target.closest(".adjust-minus-btn")) return this._adjustBalance(e.target.closest(".adjust-minus-btn").dataset.user, -1);
    const giftBtn = e.target.closest(".gift-stars-btn");
    if (giftBtn) return this._openGiftStarsModal(giftBtn.dataset.user, giftBtn.dataset.name);
    const manageStarsBtn = e.target.closest(".manage-stars-for-btn");
    if (manageStarsBtn) return this._openManageStarsModal(manageStarsBtn.dataset.user);
    const historyDeleteBtn = e.target.closest(".history-delete-btn");
    if (historyDeleteBtn) return this._deleteRedemption(historyDeleteBtn.dataset.id);
    const historyReverseBtn = e.target.closest(".history-reverse-btn");
    if (historyReverseBtn) return this._reverseRedemption(historyReverseBtn.dataset.id);

    // click a person's name in the balances row to see their full star history (chore stars earned/deducted, redemptions, bank credits/spends
    const balanceNameBtn = e.target.closest(".balance-name");
    if (balanceNameBtn) {
      if (this._hasPermission("can_override_rewards")) return this._openManageStarsModal(balanceNameBtn.dataset.user);
      return this._openStarHistoryModal(balanceNameBtn.dataset.user);
    }
    if (e.target.closest(".star-history-close-btn")) {
      this._root.querySelector(".star-history-modal").classList.remove("open");
      return;
    }

    const useBankBtn = e.target.closest(".catalog-use-bank-btn");
    if (useBankBtn) return this._useBank(useBankBtn.dataset.id);

    // mark a pending (requires_fulfillment) redemption or bank use as done - see _pendingRowHtml.
    const markRedemptionDoneBtn = e.target.closest(".pending-mark-done-btn[data-kind='redemption']");
    if (markRedemptionDoneBtn) return this._markFulfilled(markRedemptionDoneBtn.dataset.id);
    const markUsageDoneBtn = e.target.closest(".pending-mark-done-btn[data-kind='usage']");
    if (markUsageDoneBtn) return this._markBankUsageFulfilled(markUsageDoneBtn.dataset.id);

    // approve/reject a pending suggestion (see _suggestionRowHtml below) - only rendered at all for someone who _canAddRewardsDirectly
    const approveBtn = e.target.closest(".suggestion-approve-btn");
    if (approveBtn) {
      const row = approveBtn.closest(".suggestion-row");
      const costInput = row && row.querySelector(".suggestion-cost-input");
      const cost = parseInt(costInput && costInput.value, 10) || 0;
      return this._approveSuggestion(approveBtn.dataset.id, cost);
    }
    const rejectBtn = e.target.closest(".suggestion-reject-btn");
    if (rejectBtn) return this._rejectSuggestion(rejectBtn.dataset.id);

    // Icon picker for the "Add reward" form (now living in the create-reward-modal - see _openCreateRewardModal)
    const iconToggle = e.target.closest(".m-icon-toggle");
    if (iconToggle) {
      const grid = iconToggle.parentElement.querySelector(".m-icon-grid");
      if (grid) grid.hidden = !grid.hidden;
      return;
    }
    // each emoji category collapses to its own accordion row (see REWARD_ICON_CATEGORIES/the .m-icon-cat-toggle markup above)
    const catToggle = e.target.closest(".m-icon-cat-toggle");
    if (catToggle) {
      const category = catToggle.closest(".m-icon-category");
      category.classList.toggle("open");
      return;
    }
    const iconChoice = e.target.closest(".m-icon-choice");
    if (iconChoice) {
      const picker = iconChoice.closest(".m-icon-picker");
      const toggle = picker.querySelector(".m-icon-toggle");
      toggle.dataset.icon = iconChoice.dataset.icon;
      toggle.textContent = iconChoice.dataset.icon;
      picker.querySelector(".m-icon-grid").hidden = true;
      return;
    }
    const iconClear = e.target.closest(".m-icon-clear");
    if (iconClear) {
      const picker = iconClear.closest(".m-icon-picker");
      const toggle = picker.querySelector(".m-icon-toggle");
      toggle.dataset.icon = "";
      toggle.innerHTML = "&#127873;";
      picker.querySelector(".m-icon-grid").hidden = true;
      return;
    }
    // Card color reset - same "Use default" convention as the user color picker on the calendar card's Users tab
    const colorReset = e.target.closest(".m-color-reset-btn");
    if (colorReset) {
      const row = colorReset.closest(".m-color-row");
      const input = row.querySelector(".m-color");
      input.value = "#c9c2b3";
      input.dataset.touched = "false";
      return;
    }
  }

  async _claim(itemId) {
    const statusEl = this._root.querySelector(`.catalog-item[data-id="${itemId}"] .claim-status`);
    try {
      await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/rewards/redeem", item_id: itemId }));
      await this._fetchRewardsState();
    } catch (e) {
      if (statusEl) statusEl.textContent = this._t("rewards.catalog.not_enough_stars", "Not enough stars yet.");
    }
  }
  async _deleteItem(itemId) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/rewards/delete_catalog_item", item_id: itemId });
      await this._fetchRewardsState();
    } catch (e) {
    }
  }
  async _deleteRedemption(redemptionId) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/rewards/delete_redemption", redemption_id: redemptionId });
      await this._fetchRewardsState();
    } catch (e) {
    }
  }
  async _reverseRedemption(redemptionId) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/rewards/reverse_redemption", redemption_id: redemptionId });
      await this._fetchRewardsState();
    } catch (e) {
    }
  }
  // the + button's modal - same title/icon/color fields the old inline "manage panel" add-form always had
  _canAssignGoals() {
    return this._hasPermission("can_assign");
  }
  _openCreateRewardModal(existingItem) {
    const overlay = this._root.querySelector(".create-reward-modal");
    const box = overlay.querySelector(".modal-box");
    const canPrice = this._canAddRewardsDirectly();
    const isEdit = !!existingItem;
    // The Goal tab only ever shows for a brand-new item (never while editing an existing catalog reward
    const showGoalTab = !isEdit && this._canAssignGoals();
    const memberUsersHtml = this._memberUsers().map((u) => `<option value="${u.id}">${this._esc(u.name)}</option>`).join("");
    const saveLabel = isEdit
      ? this._t("common.save", "Save")
      : canPrice
      ? this._t("common.add", "Add")
      : this._t("rewards.modal.submit_for_approval", "Submit for approval");
    box.innerHTML = `
      <button type="button" class="modal-close reward-modal-close" aria-label="${this._t("common.close", "Close")}">&#10005;</button>
      <h2>&#127873; ${isEdit ? this._t("rewards.modal.edit_heading", "Edit reward") : canPrice ? this._t("rewards.modal.add_heading", "Add a reward") : this._t("rewards.modal.suggest_heading", "Suggest a reward")}</h2>
      ${showGoalTab ? `
      <div class="modal-tabs">
        <button type="button" class="modal-tab active" data-tab="reward">${this._t("rewards.modal.tab_reward", "Reward")}</button>
        <button type="button" class="modal-tab" data-tab="goal">${this._t("rewards.modal.tab_goal", "Goal")}</button>
      </div>` : ""}
      <div class="tab-pane reward-pane">
      ${!isEdit && !canPrice ? `<div class="m-hint">${this._t("rewards.modal.suggest_hint", "You can suggest a new reward, but only an admin (or someone granted reward-add/reward-override permission) can set its star cost - this'll wait in Suggested Rewards until they price and approve it.")}</div>` : ""}
      ${!isEdit ? this._libraryPickerHtml("rewards") : ""}
      <div class="field"><label>${this._t("rewards.modal.title_label", "Title")}</label><input type="text" class="m-title" placeholder="${this._t("rewards.modal.title_placeholder", "Movie night")}"></div>
      ${canPrice ? `<div class="field"><label>${this._t("rewards.modal.cost_label", "Cost (stars)")}</label><input type="number" class="m-cost" min="0" placeholder="5"></div>` : ""}
      ${
        canPrice
          ? `
      <div class="field"><label>${this._t("rewards.modal.value_note_label", "What it's really worth (optional)")}</label><input type="text" class="m-value-note" placeholder="${this._t("rewards.modal.value_note_placeholder", "$20, or 2 hrs")}"></div>
      <div class="field" title="${this._t("rewards.modal.timer_hint", "Optional - e.g. 120 for “2 hours of gaming”. Using this reward starts a countdown and sends a notification when it's up. One reward timer runs at a time per person.")}"><label>${this._t("rewards.modal.timer_label", "Timer (optional - minutes)")}</label><input type="number" class="m-timer-minutes" min="1" max="1440" placeholder="${this._t("rewards.modal.timer_placeholder", "Leave blank for no timer")}"></div>
      ${this._alarmAudienceToggleHtml("m-alarm-audience", isEdit ? existingItem.alarm_audience : "self")}
      <div class="field"><label>${this._t("rewards.modal.redeem_mode_label", "How it works")}</label>
        <select class="m-redeem-mode">
          <option value="instant">${this._t("rewards.modal.redeem_mode_instant", "Redeem any time")}</option>
          <option value="banked">${this._t("rewards.modal.redeem_mode_banked", "Stacks up (e.g. allowance, TV time)")}</option>
          <option value="one_time">${this._t("rewards.modal.redeem_mode_one_time", "One-time - disappears after use")}</option>
        </select>
      </div>
      <div class="m-banked-fields field" hidden>
        <label>${this._t("rewards.modal.stack_amount_label", "Adds this much per redemption")}</label>
          <span class="m-stack-row"><input type="number" class="m-stack-amount" min="0" step="any" value="1"><input type="text" class="m-stack-label" placeholder="${this._t("rewards.modal.stack_label_placeholder", "hours, $, etc.")}"></span>
      </div>
      <label class="m-checkbox-label"><input type="checkbox" class="m-requires-fulfillment"> ${this._t("rewards.modal.requires_fulfillment_label", "Needs a parent to mark it done before it counts (e.g. cash allowance)")}</label>
      `
          : ""
      }
      <div class="m-icon-picker">
        <button type="button" class="m-icon-toggle" data-icon="" title="${this._t("rewards.modal.pick_icon_title", "Pick an icon")}">&#127873;</button>
        <div class="m-icon-grid" hidden>
          ${REWARD_ICON_CATEGORIES.map(
            (cat, i) => `
          <div class="m-icon-category">
            <button type="button" class="m-icon-cat-toggle" data-cat-index="${i}">
              <span>${this._t(`rewards.icon_category.${i}`, cat.label)}</span>
              <span class="m-icon-cat-chevron">&#9660;</span>
            </button>
            <div class="m-icon-cat-body">
              ${cat.emojis.map((emoji) => `<button type="button" class="m-icon-choice" data-icon="${emoji}">${emoji}</button>`).join("")}
            </div>
          </div>`
          ).join("")}
          <button type="button" class="m-icon-clear">${this._t("rewards.modal.use_default_icon", "Use default icon")} &times;</button>
        </div>
      </div>
      <div class="m-color-row">
        <input type="color" class="m-color" value="#c9c2b3" data-touched="false" title="${this._t("rewards.modal.card_color_title", "Card color")}">
        <button type="button" class="m-color-reset-btn">${this._t("common.use_default", "Use default")}</button>
      </div>
      </div>
      ${showGoalTab ? `
      <div class="tab-pane goal-pane" hidden>
        <div class="field"><label>${this._t("rewards.modal.title_label", "Title")}</label><input type="text" class="g-title" placeholder="${this._t("rewards.modal.goal_title_placeholder", "Get 3 Bs in math")}"></div>
        <div class="field"><label>${this._t("rewards.modal.for_label", "For")}</label><select class="g-assigned">${memberUsersHtml}</select></div>
        <div class="field"><label>${this._t("rewards.modal.target_count_label", "Target count (how many times to log before it's done)")}</label><input type="number" class="g-target" min="1" value="1"></div>
        ${this._goalRewardFieldsHtml(null)}
        <div class="field"><label>${this._t("rewards.modal.due_date_label", "Due date (optional)")}</label><input type="datetime-local" class="g-due"></div>
        <div class="field"><label>${this._t("rewards.modal.notes_label", "Notes")}</label><textarea class="g-notes" rows="3" placeholder="${this._t("rewards.modal.notes_placeholder", "Any details worth knowing")}"></textarea></div>
      </div>` : ""}
      <div class="modal-actions">
        <button class="cancel-btn">${this._t("common.cancel", "Cancel")}</button>
        <button class="save-btn">${saveLabel}</button>
      </div>
      <div class="form-error"></div>
    `;
    box.querySelector(".reward-modal-close").addEventListener("click", () => overlay.classList.remove("open"));
    if (showGoalTab) {
      this._wireGoalRewardFields(box);
      this._wireModalTabs(box, () => {
        box.querySelector(".save-btn").textContent = box.dataset.activeTab === "goal"
          ? this._t("rewards.modal.create", "Create")
          : saveLabel;
      });
    }
    this._wireAlarmAudienceToggle(box, "m-alarm-audience");
    if (!isEdit) {
      this._wireLibraryPicker(box, "rewards", (it) => {
        box.querySelector(".m-title").value = it.title;
        const costInput = box.querySelector(".m-cost");
        if (costInput) costInput.value = it.cost_stars || 0;
        const iconToggle = box.querySelector(".m-icon-toggle");
        if (iconToggle && it.icon) {
          iconToggle.dataset.icon = it.icon;
          iconToggle.textContent = it.icon;
        }
      });
    }
    const colorInput = box.querySelector(".m-color");
    if (colorInput) colorInput.addEventListener("input", () => { colorInput.dataset.touched = "true"; });
    const redeemModeSelect = box.querySelector(".m-redeem-mode");
    if (redeemModeSelect) {
      redeemModeSelect.addEventListener("change", () => {
        box.querySelector(".m-banked-fields").hidden = redeemModeSelect.value !== "banked";
      });
    }
    // pre-fill every field from the item being edited.
    if (isEdit) {
      box.querySelector(".m-title").value = existingItem.title || "";
      if (canPrice) {
        box.querySelector(".m-cost").value = existingItem.cost_stars != null ? existingItem.cost_stars : "";
        box.querySelector(".m-value-note").value = existingItem.value_note || "";
        box.querySelector(".m-timer-minutes").value = existingItem.timer_minutes || "";
        redeemModeSelect.value = existingItem.redeem_mode || "instant";
        box.querySelector(".m-banked-fields").hidden = redeemModeSelect.value !== "banked";
        box.querySelector(".m-stack-amount").value = existingItem.stack_unit_amount != null ? existingItem.stack_unit_amount : 1;
        box.querySelector(".m-stack-label").value = existingItem.stack_unit_label || "";
        box.querySelector(".m-requires-fulfillment").checked = !!existingItem.requires_fulfillment;
      }
      const iconToggle = box.querySelector(".m-icon-toggle");
      iconToggle.dataset.icon = existingItem.icon || "";
      iconToggle.innerHTML = existingItem.icon || "&#127873;";
      if (existingItem.color) {
        colorInput.value = existingItem.color;
        colorInput.dataset.touched = "true";
      }
    }
    box.querySelector(".cancel-btn").addEventListener("click", () => overlay.classList.remove("open"));
    box.querySelector(".save-btn").addEventListener("click", () => {
      if (showGoalTab && box.dataset.activeTab === "goal") this._submitCreateGoal(overlay, box);
      else this._submitCreateReward(overlay, box, canPrice, existingItem);
    });
    overlay.classList.add("open");
  }
  // Shared tab-row wiring (copy-pasted from family-hub-chores-card.js's own identical _wireModalTabs - independently-loaded resources
  _wireModalTabs(box, onSwitch) {
    box.dataset.activeTab = "reward";
    box.querySelectorAll(".modal-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        box.querySelectorAll(".modal-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        box.dataset.activeTab = tab.dataset.tab;
        box.querySelector(".reward-pane").hidden = tab.dataset.tab !== "reward";
        box.querySelector(".goal-pane").hidden = tab.dataset.tab !== "goal";
        const errEl = box.querySelector(".form-error");
        if (errEl) errEl.textContent = "";
        if (onSwitch) onSwitch();
      });
    });
  }
  // Copy of family-hub-chores- card.js's own identical pair (independently-loaded-card convention, not shared code) - three tiers
  _alarmAudienceToggleHtml(inputClass, value) {
    const v = value === "kiosks" || value === "everyone" ? value : "self";
    const opt = (val, label) => `<button type="button" class="approval-toggle-btn${v === val ? " active" : ""}" data-value="${val}">${label}</button>`;
    return `
      <div class="approval-toggle-field">
        <div class="approval-toggle-label">${this._t("rewards.alarm_audience.label", "Who hears this alarm")}</div>
        <div class="approval-toggle-btn-group">
          ${opt("self", this._t("rewards.alarm_audience.self", "Just them"))}
          ${opt("kiosks", this._t("rewards.alarm_audience.kiosks", "Them + kiosks"))}
          ${opt("everyone", this._t("rewards.alarm_audience.everyone", "Everyone"))}
        </div>
        <input type="text" class="${inputClass}" hidden value="${v}" />
      </div>
    `;
  }
  _wireAlarmAudienceToggle(scope, inputClass) {
    const hidden = scope.querySelector(`.${inputClass}`);
    if (!hidden) return;
    const group = hidden.previousElementSibling;
    if (!group || !group.classList.contains("approval-toggle-btn-group")) return;
    group.querySelectorAll(".approval-toggle-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        group.querySelectorAll(".approval-toggle-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        hidden.value = btn.dataset.value;
      });
    });
  }
  // -- Goal reward fields (mirrors family-hub-goals-card.js's own _rewardFieldsHtml/_wireRewardFields/_applyRewardFieldsToPayload exactly
  _goalRewardFieldsHtml(goal) {
    const g = goal || {};
    const rewardType = g.reward_type || "stars";
    const catalogOptions = this._catalog
      .map((it) => `<option value="${it.id}" ${g.reward_item_id === it.id ? "selected" : ""}>${this._esc(it.title)} (${it.cost_stars}&#11088;)</option>`)
      .join("");
    return `
      <label>${this._t("rewards.modal.reward_label", "Reward")}
        <select class="g-reward-type">
          <option value="stars" ${rewardType === "stars" ? "selected" : ""}>${this._t("rewards.modal.reward_type_stars", "Stars")}</option>
          <option value="catalog_item" ${rewardType === "catalog_item" ? "selected" : ""}>${this._t("rewards.modal.reward_type_catalog_item", "A specific reward from the catalog")}</option>
        </select>
      </label>
      <label class="g-star-value-field">${this._t("rewards.modal.how_many_stars_label", "How many stars")}<input type="number" class="g-star-value" min="1" value="${g.star_value || 1}"></label>
      <label class="g-reward-item-field">${this._t("rewards.modal.which_reward_label", "Which reward")}<select class="g-reward-item">${catalogOptions}</select></label>
    `;
  }
  _wireGoalRewardFields(box) {
    const typeSelect = box.querySelector(".g-reward-type");
    const starField = box.querySelector(".g-star-value-field");
    const itemField = box.querySelector(".g-reward-item-field");
    if (!typeSelect) return;
    const sync = () => {
      const isStars = typeSelect.value === "stars";
      starField.style.display = isStars ? "" : "none";
      itemField.style.display = isStars ? "none" : "";
    };
    typeSelect.addEventListener("change", sync);
    sync();
  }
  _applyGoalRewardFieldsToPayload(box, payload) {
    const rewardType = box.querySelector(".g-reward-type").value;
    payload.reward_type = rewardType;
    if (rewardType === "stars") {
      payload.star_value = parseInt(box.querySelector(".g-star-value").value, 10) || 0;
      payload.reward_item_id = null;
    } else {
      payload.reward_item_id = box.querySelector(".g-reward-item").value || null;
      payload.star_value = 0;
    }
  }
  async _submitCreateGoal(overlay, box) {
    const errEl = box.querySelector(".form-error");
    errEl.textContent = "";
    const title = box.querySelector(".g-title").value.trim();
    if (!title) {
      errEl.textContent = this._t("rewards.goal_errors.needs_title", "A goal needs a title.");
      return;
    }
    const assignedTo = box.querySelector(".g-assigned").value;
    if (!assignedTo) {
      errEl.textContent = this._t("rewards.goal_errors.needs_assignee", "A goal needs someone it belongs to.");
      return;
    }
    const payload = {
      type: "family_hub/goals/create",
      title,
      assigned_to: assignedTo,
      target_count: parseInt(box.querySelector(".g-target").value, 10) || 1,
      notes: box.querySelector(".g-notes").value.trim(),
    };
    const dueVal = box.querySelector(".g-due").value;
    if (dueVal) payload.due_date = new Date(dueVal).toISOString();
    this._applyGoalRewardFieldsToPayload(box, payload);
    try {
      await this._hass.connection.sendMessagePromise(payload);
    } catch (e) {
      errEl.textContent = (e && e.message) || this._t("rewards.goal_errors.save_failed", "Couldn't save this goal.");
      return;
    }
    overlay.classList.remove("open");
    await this._fetchGoals();
  }
  async _submitCreateReward(overlay, box, canPrice, existingItem) {
    const errEl = box.querySelector(".form-error");
    errEl.textContent = "";
    const title = box.querySelector(".m-title").value.trim();
    if (!title) {
      errEl.textContent = this._t("rewards.modal.needs_title", "A reward needs a title.");
      return;
    }
    const iconToggle = box.querySelector(".m-icon-toggle");
    const icon = (iconToggle && iconToggle.dataset.icon) || "";
    const colorInput = box.querySelector(".m-color");
    // Only send a color when it was actually touched - otherwise the input's own browser-default value
    const color = colorInput && colorInput.dataset.touched === "true" ? colorInput.value : "";
    try {
      if (existingItem) {
        // Edit - always sends every field currently shown in the form
        const cost = parseInt(box.querySelector(".m-cost").value, 10) || 0;
        const valueNote = (box.querySelector(".m-value-note").value || "").trim();
        // null on blank, so clearing the box genuinely removes
        // the timer rather than leaving the old length in place.
        const timerMinutes = parseInt(box.querySelector(".m-timer-minutes").value, 10) || null;
        const redeemMode = box.querySelector(".m-redeem-mode").value || "instant";
        const requiresFulfillment = box.querySelector(".m-requires-fulfillment").checked;
        const payload = {
          type: "family_hub/rewards/update_catalog_item", item_id: existingItem.id, title, cost_stars: cost, icon, color,
          value_note: valueNote, redeem_mode: redeemMode, requires_fulfillment: requiresFulfillment,
          timer_minutes: timerMinutes,
          // "who hears this alarm" 3-way tier - see const.py's
          // REWARD_KEY_ALARM_AUDIENCE.
          alarm_audience: box.querySelector(".m-alarm-audience").value,
        };
        if (redeemMode === "banked") {
          payload.stack_unit_amount = parseFloat(box.querySelector(".m-stack-amount").value) || 1;
          payload.stack_unit_label = (box.querySelector(".m-stack-label").value || "").trim();
        }
        await this._hass.connection.sendMessagePromise(payload);
      } else if (canPrice) {
        const cost = parseInt(box.querySelector(".m-cost").value, 10) || 0;
        const valueNote = (box.querySelector(".m-value-note").value || "").trim();
        // null on blank, so clearing the box genuinely removes
        // the timer rather than leaving the old length in place.
        const timerMinutes = parseInt(box.querySelector(".m-timer-minutes").value, 10) || null;
        const redeemMode = box.querySelector(".m-redeem-mode").value || "instant";
        const requiresFulfillment = box.querySelector(".m-requires-fulfillment").checked;
        const payload = {
          type: "family_hub/rewards/add_catalog_item", title, cost_stars: cost, icon, color,
          value_note: valueNote, redeem_mode: redeemMode, requires_fulfillment: requiresFulfillment,
          timer_minutes: timerMinutes,
          // same field as the edit form - see its own comment.
          alarm_audience: box.querySelector(".m-alarm-audience").value,
        };
        if (redeemMode === "banked") {
          payload.stack_unit_amount = parseFloat(box.querySelector(".m-stack-amount").value) || 1;
          payload.stack_unit_label = (box.querySelector(".m-stack-label").value || "").trim();
        }
        // routed through _kioskMsg, same fix and same reason as family-hub-todo-card.js's _openTieRewardModal
        await this._hass.connection.sendMessagePromise(this._kioskMsg(payload));
      } else {
        await this._hass.connection.sendMessagePromise({ type: "family_hub/rewards/add_suggestion", title, icon, color });
      }
      overlay.classList.remove("open");
      await this._fetchRewardsState();
    } catch (e) {
      errEl.textContent = (e && e.message) || this._t("rewards.modal.save_failed", "Couldn't save that - check the fields above.");
    }
  }
  async _approveSuggestion(suggestionId, costStars) {
    try {
      await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/rewards/approve_suggestion", suggestion_id: suggestionId, cost_stars: costStars }));
      await this._fetchRewardsState();
    } catch (e) {
    }
  }
  async _rejectSuggestion(suggestionId) {
    try {
      await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/rewards/reject_suggestion", suggestion_id: suggestionId }));
      await this._fetchRewardsState();
    } catch (e) {
    }
  }
  async _adjustBalance(userId, delta) {
    try {
      // routed through _kioskMsg, same fix and same reason as _openCreateEditRewardModal's own call to add_catalog_item
      await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/rewards/adjust_balance", user_id: userId, delta }));
      await this._fetchRewardsState();
    } catch (e) {
    }
  }
  // give some of the viewer's OWN stars to another household member - self-serve and instant
  _openGiftStarsModal(toUserId, toName) {
    const overlay = this._root.querySelector(".gift-stars-modal");
    const box = overlay.querySelector(".modal-box");
    const myBalance = this._balances[this._myUserId()] || 0;
    const toNameLabel = toName ? this._esc(toName) : this._t("rewards.gift.them_fallback", "them");
    box.innerHTML = `
      <button type="button" class="modal-close gift-stars-close" aria-label="${this._t("common.close", "Close")}">&#10005;</button>
      <h2>&#127873; ${this._t("rewards.gift.heading", "Gift stars to %name%", { name: toNameLabel })}</h2>
      <div class="m-hint">${myBalance === 1 ? this._t("rewards.gift.balance_hint_one", "You have %count% star.", { count: myBalance }) : this._t("rewards.gift.balance_hint_other", "You have %count% stars.", { count: myBalance })}</div>
      <div class="field"><label>${this._t("rewards.gift.amount_label", "How many stars")}</label><input type="number" class="gift-amount-input" min="1" max="${myBalance}" placeholder="1"></div>
      <div class="form-error gift-stars-error" hidden></div>
      <div class="modal-actions">
        <button class="cancel-btn gift-stars-cancel-btn">${this._t("common.cancel", "Cancel")}</button>
        <button class="save-btn gift-stars-send-btn">${this._t("rewards.gift.send_btn", "Send gift")}</button>
      </div>
    `;
    box.querySelector(".gift-stars-close").addEventListener("click", () => this._closeGiftStarsModal());
    box.querySelector(".gift-stars-cancel-btn").addEventListener("click", () => this._closeGiftStarsModal());
    box.querySelector(".gift-stars-send-btn").addEventListener("click", () => this._submitGiftStars(toUserId));
    const input = box.querySelector(".gift-amount-input");
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._submitGiftStars(toUserId);
    });
    overlay.classList.add("open");
    input.focus();
  }
  _closeGiftStarsModal() {
    const overlay = this._root.querySelector(".gift-stars-modal");
    if (overlay) overlay.classList.remove("open");
  }
  async _submitGiftStars(toUserId) {
    const overlay = this._root.querySelector(".gift-stars-modal");
    const box = overlay.querySelector(".modal-box");
    const errEl = box.querySelector(".gift-stars-error");
    const amount = parseInt(box.querySelector(".gift-amount-input").value, 10);
    if (!(amount > 0)) {
      errEl.textContent = this._t("rewards.gift.enter_amount", "Enter how many stars to gift.");
      errEl.hidden = false;
      return;
    }
    try {
      await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/rewards/gift_stars", to_user_id: toUserId, amount }));
      await this._fetchRewardsState();
      this._closeGiftStarsModal();
    } catch (e) {
      errEl.textContent = (e && e.message) || this._t("rewards.gift.send_failed", "Couldn't send the gift - check the balance and try again.");
      errEl.hidden = false;
    }
  }
  // manual stars adjustment - "Need a stars manage modal.
  _openManageStarsModal(userId) {
    const overlay = this._root.querySelector(".manage-stars-modal");
    const box = overlay.querySelector(".modal-box");
    const members = this._memberUsers();
    const preselect = userId || (members[0] && members[0].id) || "";
    const presetBtns = MANAGE_STARS_PRESETS.map(
      (n) => `<button type="button" class="preset-btn manage-stars-preset-btn" data-amount="${n}">${n}</button>`
    ).join("");
    box.innerHTML = `
      <button type="button" class="modal-close manage-stars-close" aria-label="${this._t("common.close", "Close")}">&#10005;</button>
      <h2>&#11088; ${this._t("rewards.manage_stars.heading", "Manage stars")}</h2>
      <div class="field"><label>${this._t("rewards.manage_stars.who_label", "Who")}</label>
        <select class="manage-stars-user">
          ${members.map((u) => `<option value="${u.id}" ${u.id === preselect ? "selected" : ""}>${this._esc(u.name)} (${this._balances[u.id] || 0} &#11088;)</option>`).join("")}
        </select>
      </div>
      <button type="button" class="manage-stars-history-btn">&#128220; ${this._t("rewards.manage_stars.view_history_btn", "View star history")}</button>
      <div class="preset-row manage-stars-preset-row">${presetBtns}</div>
      <div class="field"><label>${this._t("rewards.manage_stars.custom_amount_label", "Or a custom amount")}</label><input type="number" class="manage-stars-amount" min="1" step="1" placeholder="${this._t("rewards.manage_stars.custom_amount_placeholder", "e.g. 5")}"></div>
      <div class="manage-stars-sign-row">
        <button type="button" class="manage-stars-sign-btn manage-stars-add" data-sign="1">&#43; ${this._t("common.add", "Add")}</button>
        <button type="button" class="manage-stars-sign-btn manage-stars-subtract" data-sign="-1">&#8722; ${this._t("rewards.manage_stars.subtract_btn", "Subtract")}</button>
      </div>
      <div class="field"><label>${this._t("rewards.manage_stars.reason_label", "Reason (optional)")}</label><textarea class="manage-stars-reason" rows="2" placeholder="${this._t("rewards.manage_stars.reason_placeholder", "e.g. Grandma gave a bonus, or: was rude at dinner")}"></textarea></div>
      <div class="form-error manage-stars-error" hidden></div>
      <div class="modal-actions">
        <button class="cancel-btn manage-stars-cancel-btn">${this._t("common.cancel", "Cancel")}</button>
        <button class="save-btn manage-stars-save-btn">${this._t("common.save", "Save")}</button>
      </div>
    `;
    box.querySelector(".manage-stars-close").addEventListener("click", () => this._closeManageStarsModal());
    this._manageStarsSign = 1;
    const amountInput = box.querySelector(".manage-stars-amount");
    const markSign = () => {
      box.querySelector(".manage-stars-add").classList.toggle("selected", this._manageStarsSign === 1);
      box.querySelector(".manage-stars-subtract").classList.toggle("selected", this._manageStarsSign === -1);
    };
    markSign();
    box.querySelectorAll(".manage-stars-sign-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._manageStarsSign = parseInt(btn.dataset.sign, 10);
        markSign();
      });
    });
    // Same "preset chip vs custom box, same field" relationship as the quick-timer modal's preset-btn/custom-minutes pair: tapping a preset just
    box.querySelectorAll(".manage-stars-preset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        amountInput.value = btn.dataset.amount;
        box.querySelectorAll(".manage-stars-preset-btn").forEach((b) => b.classList.toggle("active", b === btn));
      });
    });
    amountInput.addEventListener("input", () => {
      box.querySelectorAll(".manage-stars-preset-btn").forEach((b) => b.classList.toggle("active", Number(b.dataset.amount) === Number(amountInput.value)));
    });
    box.querySelector(".manage-stars-cancel-btn").addEventListener("click", () => this._closeManageStarsModal());
    box.querySelector(".manage-stars-save-btn").addEventListener("click", () => this._submitManageStars());
    // As documented (see this method's own docstring and _balanceCardHtml's comment)
    box.querySelector(".manage-stars-history-btn").addEventListener("click", () => {
      const uid = box.querySelector(".manage-stars-user").value;
      this._closeManageStarsModal();
      this._openStarHistoryModal(uid);
    });
    overlay.classList.add("open");
    amountInput.focus();
  }
  _closeManageStarsModal() {
    const overlay = this._root.querySelector(".manage-stars-modal");
    if (overlay) overlay.classList.remove("open");
  }
  async _submitManageStars() {
    const overlay = this._root.querySelector(".manage-stars-modal");
    const box = overlay.querySelector(".modal-box");
    const errEl = box.querySelector(".manage-stars-error");
    const userId = box.querySelector(".manage-stars-user").value;
    const amount = parseInt(box.querySelector(".manage-stars-amount").value, 10);
    const reason = (box.querySelector(".manage-stars-reason").value || "").trim();
    if (!userId) {
      errEl.textContent = this._t("rewards.manage_stars.pick_who", "Pick who this is for.");
      errEl.hidden = false;
      return;
    }
    if (!(amount > 0)) {
      errEl.textContent = this._t("rewards.manage_stars.enter_positive_amount", "Enter a positive amount to add or subtract.");
      errEl.hidden = false;
      return;
    }
    // Reason is optional - only sent when non-empty so an omitted reason doesn't show up as a blank line in star history
    const delta = amount * (this._manageStarsSign === -1 ? -1 : 1);
    try {
      const msg = { type: "family_hub/rewards/adjust_balance", user_id: userId, delta };
      if (reason) msg.reason = reason;
      // routed through _kioskMsg - see _adjustBalance's own comment and chores_websocket_api.py's ws_adjust_balance for the full story
      await this._hass.connection.sendMessagePromise(this._kioskMsg(msg));
      await this._fetchRewardsState();
      this._closeManageStarsModal();
    } catch (e) {
      errEl.textContent = (e && e.message) || this._t("rewards.manage_stars.save_failed", "Couldn't save that adjustment - only an admin or someone with reward-override permission can.");
      errEl.hidden = false;
    }
  }
  // spend part of a banked reward - see const.py's REWARD_REDEEM_MODES docstring.
  async _useBank(itemId) {
    const current = this._banks[this._myUserId()] && this._banks[this._myUserId()][itemId];
    const raw = window.prompt(this._t("rewards.bank.use_prompt", "How much to use now?"), current != null ? String(current) : "1");
    if (raw === null) return;
    const amount = parseFloat(raw);
    if (!(amount > 0)) return;
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/rewards/use_bank", item_id: itemId, amount });
      await this._fetchRewardsState();
    } catch (e) {
      // server reports the reason (e.g. insufficient_bank) via send_error; nothing actionable client-side beyond refreshing
    }
  }
  async _markFulfilled(redemptionId) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/rewards/mark_fulfilled", redemption_id: redemptionId });
      await this._fetchRewardsState();
    } catch (e) {
    }
  }
  async _markBankUsageFulfilled(usageId) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/rewards/mark_bank_usage_fulfilled", usage_id: usageId });
      await this._fetchRewardsState();
    } catch (e) {
    }
  }
  // the per-user "click a name, see everything" history view - a complete star ledger
  async _openStarHistoryModal(userId) {
    this._historyUserId = userId;
    this._historyLedger = [];
    const overlay = this._root.querySelector(".star-history-modal");
    overlay.classList.add("open");
    this._renderStarHistoryModal();
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/rewards/get_ledger", user_id: userId });
      this._historyLedger = (result && result.ledger) || [];
    } catch (e) {
      this._historyLedger = [];
    }
    this._renderStarHistoryModal();
  }
  // Turns one ledger/redemption/bank-usage entry into a common {at, icon, label
  _historyEventRow(kind, entry) {
    if (kind === "ledger") {
      const positive = entry.delta > 0;
      const icons = { chore_approved: "&#11088;", chore_overdue: "&#9888;", redeemed: "&#127873;", redemption_reversed: "&#8634;", manual_adjustment: "&#9998;" };
      return {
        at: entry.at,
        icon: icons[entry.source] || (positive ? "&#11088;" : "&#9888;"),
        label: entry.reason || (positive ? this._t("rewards.history.stars_added", "Stars added") : this._t("rewards.history.stars_deducted", "Stars deducted")),
        detail: `${positive ? "+" : ""}${entry.delta} &#11088; (balance ${entry.balance_after})`,
      };
    }
    if (kind === "redemption") {
      const label = entry.bank_delta
        ? this._t("rewards.history.banked", "Banked %title%", { title: entry.title })
        : this._t("rewards.history.redeemed", "Redeemed %title%", { title: entry.title });
      const pending = entry.requires_fulfillment && !entry.fulfilled ? ` - ${this._t("rewards.history.pending_suffix", "pending")}` : "";
      return {
        at: entry.redeemed_at,
        icon: "&#127873;",
        label: `${label}${pending}`,
        detail: entry.bank_delta ? `+${entry.bank_delta} ${entry.unit_label || ""} (&minus;${entry.cost_stars} &#11088;)` : `&minus;${entry.cost_stars} &#11088;`,
      };
    }
    // "usage"
    const pending = entry.requires_fulfillment && !entry.fulfilled ? ` - ${this._t("rewards.history.pending_suffix", "pending")}` : "";
    return {
      at: entry.used_at,
      icon: "&#128337;",
      label: `${this._t("rewards.history.used", "Used %title%", { title: entry.title })}${pending}`,
      detail: `&minus;${entry.amount} ${entry.unit_label || ""}`,
    };
  }
  _renderStarHistoryModal() {
    const box = this._root.querySelector(".star-history-box");
    if (!box) return;
    const userId = this._historyUserId;
    const rows = [
      ...this._historyLedger.map((e) => this._historyEventRow("ledger", e)),
      ...this._redemptions.filter((r) => r.user_id === userId).map((e) => this._historyEventRow("redemption", e)),
      ...this._bankUsages.filter((u) => u.user_id === userId).map((e) => this._historyEventRow("usage", e)),
    ].sort((a, b) => (b.at || "").localeCompare(a.at || ""));
    box.innerHTML = `
      <div class="star-history-header">
        <h3 class="star-history-title">${this._t("rewards.history.title", "%name%'s star history", { name: this._esc(this._userName(userId)) })}</h3>
        <button type="button" class="star-history-close-btn" title="${this._t("common.close", "Close")}">&#10005;</button>
      </div>
      <div class="star-history-list">
        ${
          rows.length
            ? rows.map((r) => `
              <div class="star-history-row">
                <span class="star-history-icon">${r.icon}</span>
                <span class="star-history-label">${this._esc(r.label)}</span>
                <span class="star-history-detail">${r.detail}</span>
                <span class="star-history-date">${r.at ? this._fmtDate(new Date(r.at)) : ""}</span>
              </div>
            `).join("")
            : `<div class="empty">${this._t("rewards.history.empty", "Nothing yet.")}</div>`
        }
      </div>
    `;
  }

  _balanceCardHtml(user) {
    const bal = this._balances[user.id] || 0;
    const isAdmin = this._isAdmin();
    // a "Gift" button on every OTHER household member's balance card - self-serve, like redemption (see _giftStars' own docstring)
    const canGift = user.id !== this._myUserId();
    // For someone who can_override_rewards, clicking the name itself now opens the Manage Stars modal pre-selected to that person
    const canManage = this._hasPermission("can_override_rewards");
    const nameTitle = canManage
      ? this._t("rewards.balance.manage_title", "Manually add or subtract %name%'s stars", { name: this._esc(user.name) })
      : this._t("rewards.balance.history_title", "See %name%'s full star history", { name: this._esc(user.name) });
    return `
      <div class="balance-card" style="border-color:${this._userColor(user.id)}">
        <span class="balance-dot" style="background:${this._userColor(user.id)}"></span>
        <button type="button" class="balance-name" data-user="${user.id}" title="${nameTitle}">${this._esc(user.name)}</button>
        <span class="balance-stars">&#11088; ${bal}</span>
        ${canGift ? `<button type="button" class="gift-stars-btn" data-user="${user.id}" data-name="${this._esc(user.name)}" title="${this._t("rewards.balance.gift_title", "Gift some of your own stars to %name%", { name: this._esc(user.name) })}">&#127873;</button>` : ""}
        ${canManage ? `<button type="button" class="manage-stars-for-btn" data-user="${user.id}" title="${this._t("rewards.balance.manage_title", "Manually add or subtract %name%'s stars", { name: this._esc(user.name) })}">&#9998;</button>` : ""}
        ${isAdmin ? `<span class="balance-adjust"><button class="adjust-minus-btn" data-user="${user.id}">-</button><button class="adjust-plus-btn" data-user="${user.id}">+</button></span>` : ""}
      </div>
    `;
  }
  // A malformed/missing color (anything not a clean #rrggbb hex string) falls back to no inline style at all
  _catalogAccentStyle(item) {
    const color = item && item.color;
    if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color)) return "";
    return ` style="border: 2px solid ${color}; background: ${color}22;"`;
  }
  _catalogItemHtml(item) {
    const myBalance = this._balances[this._myUserId()] || 0;
    const affordable = myBalance >= (item.cost_stars || 0);
    const mode = item.redeem_mode || "instant";
    // purely cosmetic "what this is really worth" label (e.g. "$20" or "2 hrs")
    const valueNote = item.value_note ? `<div class="catalog-value-note">${this._esc(item.value_note)}</div>` : "";
    const modeBadge =
      mode === "one_time" ? `<div class="catalog-mode-badge">${this._t("rewards.catalog.mode_one_time", "One-time")}</div>`
      : mode === "banked" ? `<div class="catalog-mode-badge">${this._t("rewards.catalog.mode_banked", "Stacks up")}</div>`
      : "";
    // A banked item shows the CURRENT VIEWER's own bank for it (not everyone's
    const myBank = mode === "banked" ? (this._banks[this._myUserId()] && this._banks[this._myUserId()][item.id]) || 0 : 0;
    const bankDisplay =
      mode === "banked"
        ? `<div class="catalog-bank">${this._t("rewards.catalog.banked_amount", "Banked: %amount% %unit%", { amount: myBank, unit: this._esc(item.stack_unit_label || "") })}</div>`
        : "";
    const useBankBtn = mode === "banked" && myBank > 0 ? `<button class="catalog-use-bank-btn" data-id="${item.id}">${this._t("rewards.catalog.use_btn", "Use")}</button>` : "";
    // timed rewards ("2 hours of gaming").
    const timerMinutes = Number(item.timer_minutes) || 0;
    const timerBadge = timerMinutes > 0 ? `<div class="catalog-timer-badge" title="${this._t("rewards.catalog.timer_badge_title", "Starts a %len% countdown when you use it", { len: this._formatTimerLength(timerMinutes) })}">&#9201; ${this._formatTimerLength(timerMinutes)}</div>` : "";
    // One running reward timer per person: while this viewer has one going, every timed reward's Claim is disabled and says why
    const myRewardTimer = this._rewardTimerFor(this._myUserId());
    const isMyRunningItem = !!(myRewardTimer && myRewardTimer.item_id === item.id);
    const blockedByOtherTimer = timerMinutes > 0 && !!myRewardTimer && !isMyRunningItem;
    const runningRow = isMyRunningItem
      ? `<div class="catalog-timer-running">&#9201; <span data-timer-uid="${myRewardTimer.uid}">${this._formatTimerRemaining(this._timerRemainingSeconds(myRewardTimer))}</span> ${this._t("rewards.catalog.left_suffix", "left")}
           <button class="catalog-timer-cancel-btn" data-uid="${myRewardTimer.uid}" title="${this._t("rewards.catalog.stop_timer_title", "Stop this timer")}">&#10005;</button>
         </div>`
      : "";
    const claimLabel = mode === "banked" ? this._t("common.add", "Add") : timerMinutes > 0 ? this._t("rewards.catalog.use_btn", "Use") : this._t("rewards.catalog.claim_btn", "Claim");
    return `
      <div class="catalog-item" data-id="${item.id}"${this._catalogAccentStyle(item)}>
        <div class="catalog-icon">${item.icon || "&#127873;"}</div>
        <div class="catalog-title">${this._esc(item.title)}</div>
        <div class="catalog-cost">&#11088; ${item.cost_stars}</div>
        ${valueNote}
        ${modeBadge}
        ${timerBadge}
        ${bankDisplay}
        ${runningRow}
        <button class="claim-btn" data-id="${item.id}" data-timer="${timerMinutes}" ${affordable && !blockedByOtherTimer && !isMyRunningItem ? "" : "disabled"} ${blockedByOtherTimer ? `title="${this._t("rewards.catalog.blocked_by_other_timer_title", "You've already got &quot;%title%&quot; running", { title: this._esc(myRewardTimer.title || this._t("rewards.catalog.generic_reward", "a reward")) })}"` : ""}>${isMyRunningItem ? this._t("rewards.catalog.running_btn", "Running") : claimLabel}</button>
        ${useBankBtn}
        <div class="claim-status"></div>
        ${this._manageOpen ? `<button class="manage-edit-btn" data-id="${item.id}" title="${this._t("common.edit", "Edit")}">&#9998;</button><button class="manage-delete-btn" data-id="${item.id}" title="${this._t("rewards.catalog.remove_title", "Remove")}">&times;</button>` : ""}
      </div>
    `;
  }
  _historyRowHtml(r) {
    // while managing, an admin gets a "clear" (delete, no refund) and a "reverse" (delete + refund the stars) button per entry
    const actions = this._manageOpen && this._isAdmin()
      ? `<span class="history-actions">
          <button type="button" class="history-reverse-btn" data-id="${r.id}" title="${this._t("rewards.history.reverse_title", "Reverse - delete and refund the stars")}">&#8634;</button>
          <button type="button" class="history-delete-btn" data-id="${r.id}" title="${this._t("rewards.history.clear_title", "Clear - delete without refunding")}">&times;</button>
        </span>`
      : `<span class="history-actions"></span>`;
    return `
      <div class="history-row">
        <span>${this._esc(this._userName(r.user_id))}</span>
        <span>${this._esc(r.title)}</span>
        <span>&#11088; ${r.cost_stars}</span>
        <span class="history-date">${r.redeemed_at ? this._fmtDate(new Date(r.redeemed_at)) : ""}</span>
        ${actions}
      </div>
    `;
  }
  // one row per pending reward_engine suggestion (get_state's own "suggestions" list, always included regardless of who's asking
  _suggestionRowHtml(s) {
    const canResolve = this._canAddRewardsDirectly();
    const actions = canResolve
      ? `<span class="suggestion-actions">
          <input type="number" class="suggestion-cost-input" min="0" placeholder="${this._t("rewards.suggestion.cost_placeholder", "Cost")}">
          <button type="button" class="suggestion-approve-btn" data-id="${s.id}" title="${this._t("rewards.suggestion.approve_title", "Approve and add to the catalog")}">&#10003;</button>
          <button type="button" class="suggestion-reject-btn" data-id="${s.id}" title="${this._t("rewards.suggestion.reject_title", "Reject")}">&times;</button>
        </span>`
      : `<span class="suggestion-pending">${this._t("rewards.suggestion.pending_approval", "Pending approval")}</span>`;
    return `
      <div class="suggestion-row" data-id="${s.id}">
        <div class="suggestion-icon">${s.icon || "&#127873;"}</div>
        <div class="suggestion-title">${this._esc(s.title)}</div>
        <div class="suggestion-by">${this._t("rewards.suggestion.suggested_by", "suggested by %name%", { name: this._esc(this._userName(s.submitted_by)) })}</div>
        ${actions}
      </div>
    `;
  }

  // one row per pending (requires_fulfillment, not yet fulfilled) redemption OR bank usage
  _pendingRowHtml(kind, entry) {
    const canResolve = this._canAddRewardsDirectly();
    const amountText = kind === "redemption" ? `&#11088; ${entry.cost_stars}` : `${entry.amount} ${this._esc(entry.unit_label || "")}`;
    const when = kind === "redemption" ? entry.redeemed_at : entry.used_at;
    const action = canResolve
      ? `<span class="suggestion-actions"><button type="button" class="pending-mark-done-btn" data-kind="${kind}" data-id="${entry.id}">${this._t("rewards.pending.mark_done_btn", "Mark done")}</button></span>`
      : `<span class="suggestion-pending">${this._t("rewards.pending.pending_label", "Pending")}</span>`;
    return `
      <div class="suggestion-row" data-id="${entry.id}">
        <div class="suggestion-icon">${kind === "redemption" ? "&#127873;" : "&#128337;"}</div>
        <div class="suggestion-title">${this._esc(entry.title)}</div>
        <div class="suggestion-by">${this._esc(this._userName(entry.user_id))} - ${amountText}${when ? ` - ${this._fmtDate(new Date(when))}` : ""}</div>
        ${action}
      </div>
    `;
  }
  _render() {
    if (!this._root) return;
    this._root.querySelector(".title").textContent = this._config.title;
    const manageBtn = this._root.querySelector(".manage-btn");
    manageBtn.hidden = !this._isAdmin();
    manageBtn.textContent = this._manageOpen
      ? this._t("rewards.header.done_managing_btn", "Done managing")
      : this._t("rewards.header.manage_catalog_btn", "Manage catalog");
    // gated on PERMISSION_REWARD_OVERRIDE specifically (not plain _isAdmin like the catalog button above)
    this._root.querySelector(".manage-stars-btn").hidden = !this._hasPermission("can_override_rewards");

    const allMemberUsers = this._limitToConfiguredPeople(this._memberUsers(), (u) => u.id);
    // person pills - see _renderPersonPills.
    this._renderPersonPills(allMemberUsers.map((u) => ({ id: u.id, name: u.name, color: this._userColor(u.id), count: `\u2B50${this._balances[u.id] || 0}` })));
    const shownIds = this._activePersonFilter(allMemberUsers.map((u) => u.id));
    // someone left off this card in the editor ("People on this card") stays out of goals/suggestions/pending/history too, not just the balances.
    const configured = Array.isArray(this._config.people) && this._config.people.length ? new Set(allMemberUsers.map((u) => u.id)) : null;
    const isShown = (userId) => (!configured || configured.has(userId)) && (!shownIds.length || shownIds.includes(userId));
    const memberUsers = allMemberUsers.filter((u) => isShown(u.id));
    this._root.querySelector(".balances").innerHTML = memberUsers.length
      ? memberUsers.map((u) => this._balanceCardHtml(u)).join("")
      : this._isJustMeCard()
      ? `<div class="empty just-me-empty">${this._esc(this._t("rewards.empty.just_me", "This card shows whoever is signed in. Sign in (or log in with your PIN) as someone in the household to see your stars."))}</div>`
      : `<div class="empty">${this._t("rewards.empty.no_members", "No one's been added to Family Hub yet - add people under Settings on the calendar dashboard.")}</div>`;

    this._root.querySelector(".catalog").innerHTML = this._catalog.length
      ? this._catalog.map((it) => this._catalogItemHtml(it)).join("")
      : `<div class="empty">${this._t("rewards.empty.no_catalog", "No rewards in the catalog yet.")}</div>`;

    // an embedded Goals section, only ever shown when the household's own goalsShowInRewards Settings toggle is on
    const goalsTitle = this._root.querySelector(".goals-title");
    const goalsList = this._root.querySelector(".goals");
    const goalsEnabled = this._goalsInRewardsEnabled();
    // archived goals (household hit "Complete" on them - see _archiveGoal/goal-complete-btn above) are left out of this embedded list entirely
    const visibleGoals = this._goals.filter((g) => g.status !== GOAL_STATUS_ARCHIVED && isShown(g.assigned_to));
    goalsTitle.hidden = !goalsEnabled || !visibleGoals.length;
    goalsList.innerHTML = goalsEnabled && visibleGoals.length ? visibleGoals.map((g) => this._goalRowHtml(g)).join("") : "";

    // pending suggestions are visible to EVERYONE whenever there are any
    const suggestionsTitle = this._root.querySelector(".suggestions-title");
    const suggestionsList = this._root.querySelector(".suggestions");
    const shownSuggestions = this._suggestions.filter((s) => isShown(s.submitted_by));
    const hasSuggestions = shownSuggestions.length > 0;
    suggestionsTitle.hidden = !hasSuggestions;
    suggestionsList.innerHTML = hasSuggestions ? shownSuggestions.map((s) => this._suggestionRowHtml(s)).join("") : "";

    // pending (requires_fulfillment, not yet fulfilled) redemptions and bank uses, combined into one list, most-recent-first
    const pendingTitle = this._root.querySelector(".pending-title");
    const pendingList = this._root.querySelector(".pending");
    const pendingEntries = [
      ...this._redemptions.filter((r) => r.requires_fulfillment && !r.fulfilled && isShown(r.user_id)).map((r) => ({ kind: "redemption", entry: r, at: r.redeemed_at })),
      ...this._bankUsages.filter((u) => u.requires_fulfillment && !u.fulfilled && isShown(u.user_id)).map((u) => ({ kind: "usage", entry: u, at: u.used_at })),
    ].sort((a, b) => (b.at || "").localeCompare(a.at || ""));
    pendingTitle.hidden = !pendingEntries.length;
    pendingList.innerHTML = pendingEntries.length ? pendingEntries.map((p) => this._pendingRowHtml(p.kind, p.entry)).join("") : "";

    const shownRedemptions = this._redemptions.filter((r) => isShown(r.user_id));
    this._root.querySelector(".history").innerHTML = shownRedemptions.length
      ? shownRedemptions.slice(0, 10).map((r) => this._historyRowHtml(r)).join("")
      : `<div class="empty">${this._t("rewards.empty.no_history", "Nothing redeemed yet.")}</div>`;
  }

  _css() {
    return `
      /* position:relative is the containing block .add-reward-fab
         needs when [fab-position="card"] switches it to position:absolute. */
      :host { display: block; height: 100%; position: relative; font-family: "Arial Rounded MT Std", "Arial Rounded MT", "Varela Round", -apple-system, "Segoe UI Rounded", "Segoe UI", Roboto, sans-serif;
        --fc-bg: #fbf7e5; --fc-card: #f5f3f0; --fc-border: #e6ddc4; --fc-text: #423d34; --fc-text-secondary: #96877a;
        --fc-accent: #8f5a00; --fc-accent-text: #fff8ea; --fc-accent2: #305545; --fc-accent3: #b5583c;
        --fc-surface-alt: #efe6cf; --fc-surface2: #f2eede; }
      ha-card { background: var(--fc-bg); background-image: var(--fc-bg-overlay-image, none), var(--fc-bg-image, none); background-size: cover, var(--fc-bg-size, cover); background-position: center, var(--fc-bg-position, center); color: var(--fc-text); padding: 14px; height: 100%; box-sizing: border-box; overflow-y: auto; }
      .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
      /* v1.168.62: calendar-style person pills (same look as the Family Week
         Calendar card's legend chips) */
      .person-pills { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin: 0 0 10px; }
      .person-pills[hidden] { display: none; }
      .person-pill { display: flex; align-items: center; gap: 6px; padding: 4px 10px 4px 4px; border: none; border-radius: 16px; font: inherit; font-size: 13px; font-weight: 600; color: #3a352c; box-shadow: var(--fc-shadow, 0 2px 8px rgba(58,53,44,0.12)); cursor: pointer; transition: opacity 0.15s ease; -webkit-tap-highlight-color: transparent; }
      .person-pill.active-filter { outline: 2px solid var(--fc-accent); outline-offset: 1px; }
      .person-pill.dimmed { opacity: 0.4; }
      .person-pill-avatar { width: 20px; height: 20px; border-radius: 50%; background: rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center; font-size: 11px; color: #fff; font-weight: 700; }
      .person-pill-count { font-weight: 700; }
      .title { font-size: 18px; font-weight: 800; }
      .actions { display: flex; align-items: center; gap: 8px; }
      .manage-btn { border: none; border-radius: 12px; padding: 6px 12px; font-size: 12px; font-weight: 700; background: var(--fc-surface-alt); color: var(--fc-text); cursor: pointer; }
      .manage-stars-btn { border: none; border-radius: 12px; padding: 6px 12px; font-size: 12px; font-weight: 700; background: var(--fc-surface-alt); color: var(--fc-text); cursor: pointer; }
      /* kiosk PIN login button + modal - same shape as
         family-hub-chores-card.js's own identical copy. .active here means
         "someone is currently logged in", same as manage-btn's own toggle. */
      .kiosk-login-btn { border: 1px solid var(--fc-border); border-radius: 12px; padding: 6px 12px; font-size: 12px; font-weight: 700; background: var(--fc-surface-alt); color: var(--fc-text); cursor: pointer; }
      .kiosk-login-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      .kiosk-login-box { max-width: 360px; }
      .kiosk-login-user-picker { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
      .kiosk-login-user-btn { border: 2px solid var(--fc-border); border-radius: 12px; padding: 10px 14px; font-weight: 700; background: var(--fc-card); color: var(--fc-text); cursor: pointer; }
      .kiosk-login-user-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      .kiosk-login-empty { color: var(--fc-text-secondary); font-size: 13px; }
      .kiosk-login-pin-input { width: 100%; box-sizing: border-box; font-size: 22px; letter-spacing: 6px; text-align: center; padding: 10px; border-radius: 10px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); }
      .kiosk-login-error { color: #b3462c; font-size: 13px; min-height: 18px; margin-top: 6px; }
      .section-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: var(--fc-text-secondary); margin: 14px 0 6px; }
      .balances { display: flex; gap: 8px; flex-wrap: wrap; }
      .balance-card { display: flex; align-items: center; gap: 6px; background: var(--fc-card); border: 2px solid; border-radius: 12px; padding: 6px 10px; font-size: 13px; font-weight: 700; }
      .balance-dot { width: 9px; height: 9px; border-radius: 50%; }
      /* the name is now a button (click for Star History) - reset
         it back to plain inline text visually, same font/weight/color the
         old plain <span> had, so this reads as a label that happens to be
         tappable rather than looking like a generic browser button. */
      .balance-name { border: none; background: none; padding: 0; margin: 0; font: inherit; font-weight: 700; color: var(--fc-text); cursor: pointer; text-decoration: underline dotted; text-underline-offset: 2px; }
      .balance-stars { color: var(--fc-accent); }
      .balance-adjust { display: flex; gap: 2px; margin-left: 4px; }
      .balance-adjust button { border: none; border-radius: 50%; width: 18px; height: 18px; line-height: 1; background: var(--fc-surface-alt); color: var(--fc-text); cursor: pointer; font-weight: 800; }
      .gift-stars-btn { border: none; border-radius: 50%; width: 20px; height: 20px; line-height: 1; background: var(--fc-surface-alt); cursor: pointer; font-size: 12px; padding: 0; }
      .manage-stars-for-btn { border: none; border-radius: 50%; width: 20px; height: 20px; line-height: 1; background: var(--fc-surface-alt); cursor: pointer; font-size: 11px; padding: 0; }
      /* the "View star history" link inside the Manage Stars
         modal (see _openManageStarsModal's comment on why it's here) -
         deliberately styled as a plain understated text link, not a full
         button, so it doesn't compete with Save/Cancel or the Add/Subtract
         toggle for attention - it's a secondary way out of this modal, not
         part of the add/subtract task the modal is otherwise entirely for. */
      .manage-stars-history-btn { display: block; border: none; background: none; padding: 4px 0 2px; margin: 0 0 8px; font: inherit; font-size: 12px; font-weight: 700; color: var(--fc-accent); cursor: pointer; text-decoration: underline dotted; text-underline-offset: 2px; }
      .manage-stars-sign-row { display: flex; gap: 8px; margin: 8px 0; }
      .manage-stars-sign-btn { flex: 1; border: 2px solid var(--fc-border); border-radius: 10px; padding: 8px; font-weight: 700; background: var(--fc-card); color: var(--fc-text); cursor: pointer; }
      .manage-stars-sign-btn.selected { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      /* v1.110.7: quick common-amount chips, same visual pattern as
         family-hub-active-timers-card.js's own .preset-row/.preset-btn. */
      .preset-row { display: flex; gap: 6px; margin: 4px 0 2px; }
      .preset-btn { flex: 1; border: 2px solid var(--fc-border); border-radius: 10px; padding: 8px 4px; font-size: 13px; font-weight: 800; background: var(--fc-surface2); color: var(--fc-text); cursor: pointer; }
      .preset-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      .manage-stars-modal textarea { width: 100%; box-sizing: border-box; font: inherit; border-radius: 10px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); padding: 8px; resize: vertical; }
      .catalog { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
      .catalog-item { background: var(--fc-card); border-radius: 12px; padding: 10px; text-align: center; position: relative; box-shadow: var(--fc-shadow, 0 2px 5px rgba(0,0,0,0.08)); display: flex; flex-direction: column; }
      /* "Liquid glass" support, same convention as
         family-week-calendar-card.js - see that file's own comment on its
         backdrop-filter rule for the full reasoning. Zero-cost for every
         existing theme (blur(0px) is a no-op); -webkit- prefix needed for
         Safari/iOS webviews. */
      .catalog-item, .balance-card, .cancel-btn, .gift-stars-btn,
      .goal-reject-btn, .kiosk-login-btn, .kiosk-login-pin-input,
      .kiosk-login-user-btn, .m-icon-toggle, .m-icon-grid, .m-icon-choice,
      .m-color-reset-btn, .manage-btn, .catalog-mode-badge,
      .catalog-use-bank-btn, .suggestion-cost-input, .suggestion-reject-btn {
        backdrop-filter: blur(var(--fc-glass-blur, 0px));
        -webkit-backdrop-filter: blur(var(--fc-glass-blur, 0px));
      }
      .catalog-icon { font-size: 22px; }
      .catalog-title { font-weight: 700; font-size: 13px; margin: 4px 0; }
      .catalog-cost { font-size: 12px; color: var(--fc-accent); margin-bottom: 6px; }
      /* margin-top: auto - so the Claim button (and whatever sits right
         below it, like the banked-mode Use button/claim-status) always sits
         flush against the bottom of the card, regardless of how much
         variable-height content (title wrapping, value note, mode badge,
         banked amount) sits above it on THIS item vs. its neighbors in the
         same grid row - .catalog-item above is a flex column specifically
         to make this work. */
      .claim-btn { border: none; border-radius: 8px; padding: 6px 10px; font-size: 12px; font-weight: 700; cursor: pointer; background: var(--fc-accent); color: var(--fc-accent-text); width: 100%; margin-top: auto; }
      .claim-btn:disabled { opacity: .5; cursor: default; }
      /* timed rewards. The badge sits alongside the redeem-mode
         badge (they're independent properties, not alternatives), and the
         running row shows a live countdown with tabular figures so ticking
         seconds don't shift the card layout. */
      .catalog-timer-badge { font-size: 10px; font-weight: 800; color: var(--fc-accent2); background: var(--fc-surface-alt); border-radius: 6px; padding: 1px 6px; margin-top: 2px; }
      .catalog-timer-running { display: flex; align-items: center; justify-content: center; gap: 4px; font-size: 12px; font-weight: 800; color: var(--fc-accent2); font-variant-numeric: tabular-nums; margin-top: 4px; }
      .catalog-timer-cancel-btn { border: none; background: transparent; color: var(--fc-text-secondary); cursor: pointer; font-size: 12px; padding: 0 2px; }
      .claim-status { font-size: 10px; color: var(--fc-accent3); min-height: 12px; }
      .manage-delete-btn { position: absolute; top: 4px; right: 4px; border: none; background: none; color: var(--fc-accent3); font-size: 16px; cursor: pointer; }
      /* Edit sits just to the left of Delete, same absolute-corner treatment. */
      .manage-edit-btn { position: absolute; top: 4px; right: 26px; border: none; background: none; color: var(--fc-text-secondary); font-size: 14px; cursor: pointer; }
      /* same pixel-for-pixel FAB treatment as family-week-calendar-
         card.js's add-event-fab / family-hub-chores-card.js's
         add-chore-fab - see _build's own comment on why this lives as a
         sibling of <ha-card>. Unlike those two, never hidden/gated - every
         user gets this button, see _openCreateRewardModal for how its
         behavior itself branches on permission instead. */
      /* bottom offset by --fh-fab-offset - see family-hub-chores-card.js's identical comment. */
      .add-reward-fab { position: fixed; right: 18px; bottom: calc(18px + var(--fh-fab-offset, 0px)); z-index: 900; width: 56px; height: 56px; border-radius: 50%; border: none; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 28px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(58,53,44,0.35); transition: transform 0.15s ease, bottom 0.15s ease; }
      .add-reward-fab:active { transform: scale(0.94); }
      /* Hidden (not just z-indexed behind) while ANY Family Hub card on
         this dashboard has a full-screen modal open - see
         family-hub-chores-card.js's identical .add-chore-fab[hidden] rule
         for the same mechanism. */
      .add-reward-fab[hidden] { display: none; }
      /* fab_position: "card" - see family-hub-chores-card.js's
         identical .add-chore-fab rule for the same mechanism. */
      :host([fab-position="card"]) .add-reward-fab { position: absolute; bottom: 18px; }
      /* The + button's modal - same shape as family-hub-chores-card.js's
         own create/edit modals (this card had no modal infrastructure at
         all before v127, everything used to render inline). */
      .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; align-items: center; justify-content: center; }
      .modal-overlay.open { display: flex; }
      .modal-box { position: relative; background: var(--fc-bg); color: var(--fc-text); border-radius: 14px; padding: 18px; width: min(92vw, 420px); max-height: 85vh; overflow-y: auto; }
      /* "make the chores and rewards modals more similar to the add
         calendar and add reminder modal" (household's own words, full visual
         match) - same design-system port as family-hub-chores-card.js's own
         copy of this comment/block (no shared module between the cards, so
         it's its own independent copy of the calendar card's look), applied
         onto the EXISTING .modal-tab/.cancel-btn/.save-btn/.modal-actions
         class names below rather than renaming them so the JS wiring that
         already queries those selectors doesn't have to change. */
      .modal-close { position: absolute; top: 10px; right: 10px; width: 36px; height: 36px; border-radius: 50%; border: none; background: var(--fc-surface-alt); color: var(--fc-text); font-size: 18px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: var(--fc-shadow); }
      .modal-box h2 { margin: 0 26px 14px 0; font-size: 1.2em; color: var(--fc-text); }
      .modal-box h3 { margin: 0 26px 14px 0; font-size: 1.1em; color: var(--fc-text); }
      .modal-box label { display: block; margin: 8px 0; font-size: 13px; font-weight: 700; }
      .modal-box input[type="text"], .modal-box input[type="number"] { width: 100%; box-sizing: border-box; margin-top: 4px; padding: 8px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 13px; font-family: inherit; }
      .m-hint { font-size: 12px; color: var(--fc-text-secondary); line-height: 1.5; margin: 4px 0 10px; }
      .modal-box select { width: 100%; box-sizing: border-box; margin-top: 4px; padding: 8px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 13px; font-family: inherit; }
      .m-checkbox-label { display: flex !important; align-items: center; gap: 6px; font-weight: 400 !important; }
      /* the Goal tab's own fields (g-* prefix, mirroring the m-*
         prefix the Reward tab's fields already use) - textarea/datetime-
         local inputs this card never needed before Goals existed. */
      .modal-box textarea, .modal-box input[type="datetime-local"] { width: 100%; box-sizing: border-box; margin-top: 4px; padding: 8px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 13px; font-family: inherit; }
      .modal-box textarea { resize: vertical; }
      /* .field - same calendar-card field-wrapper idiom ported into
         family-hub-chores-card.js's own copy of this block. */
      .field { margin-bottom: 14px; }
      .field label { display: block; font-size: 13px; font-weight: 600; color: var(--fc-text-secondary); margin-bottom: 5px; }
      .field input, .field select, .field textarea { width: 100%; box-sizing: border-box; font-size: 16px; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-family: inherit; margin-top: 0; }
      .field textarea { resize: vertical; min-height: 60px; }
      .remind-check-row { display: flex; flex-wrap: wrap; gap: 6px; }
      .remind-check-opt { display: flex; align-items: center; gap: 4px; padding: 5px 9px; border-radius: 12px; background: var(--fc-surface-alt); color: var(--fc-text); font-size: 12px; font-weight: 600; cursor: pointer; user-select: none; margin: 4px 0; }
      .remind-check-opt input { margin: 0; width: auto; }
      .modal-tabs { display: flex; gap: 8px; margin-bottom: 10px; }
      .modal-tab { flex: 1 1 0; min-height: 40px; padding: 8px 10px; border-radius: 10px; border: 2px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: var(--fc-shadow); }
      .modal-tab.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      /* "who hears this alarm" 3-way toggle - copy of
         family-hub-chores-card.js's own .approval-toggle-* block (same
         independently-loaded-card convention as everything else in this
         file, not shared code). */
      .approval-toggle-field { margin: 10px 0; }
      .approval-toggle-label { font-size: 12.5px; font-weight: 700; color: var(--fc-text-secondary); margin-bottom: 4px; }
      .approval-toggle-btn-group { display: flex; gap: 6px; flex-wrap: wrap; }
      .approval-toggle-btn { flex: 1 1 0; min-width: 88px; min-height: 40px; padding: 8px 10px; border-radius: 10px; border: 2px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 12.5px; font-weight: 700; cursor: pointer; box-shadow: var(--fc-shadow); }
      .approval-toggle-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      .goal-pane[hidden], .reward-pane[hidden] { display: none; }
      .m-banked-fields { margin: 4px 0; }
      .m-stack-row { display: flex; gap: 6px; margin-top: 4px; }
      .m-stack-row input[type="number"] { width: 70px; }
      .m-stack-row input[type="text"] { flex: 1; }
      .lib-row { display: flex; gap: 6px; align-items: center; margin-bottom: 8px; }
      .lib-row .lib-pick { flex: 1 1 auto; min-width: 0; box-sizing: border-box; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 14px; }
      .lib-edit-btn { flex: 0 0 auto; border: 1px solid var(--fc-border); background: var(--fc-surface-alt); color: var(--fc-text); border-radius: 6px; padding: 5px 9px; cursor: pointer; font-size: 14px; }
      .lib-ed-hint { font-size: 12px; color: var(--fc-text-secondary); margin-bottom: 8px; }
      .lib-ed-add { border: 2px dashed var(--fc-border); background: none; color: var(--fc-text); border-radius: 8px; padding: 6px 10px; font-weight: 700; cursor: pointer; margin-bottom: 8px; }
      .library-editor-box.modal-box { width: min(94vw, 560px); }
      .library-editor-box .lib-ed-list { display: flex; flex-direction: column; gap: 8px; max-height: 55vh; overflow-y: auto; }
      .library-editor-box .lib-ed-row { display: grid; grid-template-columns: 48px minmax(0, 1fr) 34px; grid-template-areas: "icon title del" "icon meta del"; gap: 6px; align-items: center; padding: 8px; border: 1px solid var(--fc-border); border-radius: 10px; background: var(--fc-surface-alt, var(--fc-card)); }
      .library-editor-box .lib-ed-row input, .library-editor-box .lib-ed-row select { width: 100%; min-width: 0; margin: 0; box-sizing: border-box; padding: 7px 8px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 14px; }
      .library-editor-box .lib-ed-icon { grid-area: icon; align-self: stretch; text-align: center; font-size: 20px; padding: 4px; }
      .library-editor-box .lib-ed-title { grid-area: title; }
      .library-editor-box .lib-ed-meta { grid-area: meta; display: flex; gap: 6px; align-items: center; min-width: 0; }
      .library-editor-box .lib-ed-amount-wrap { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; font-size: 13px; margin: 0; }
      .library-editor-box .lib-ed-amount-wrap .lib-ed-amount { width: 72px; }
      .library-editor-box .lib-ed-meta .lib-ed-cat { flex: 1 1 auto; width: auto; }
      .library-editor-box .lib-ed-del { grid-area: del; border: none; background: none; color: #b5583c; font-size: 16px; cursor: pointer; padding: 6px; }
      @media (min-width: 640px) {
        .library-editor-box .lib-ed-row { grid-template-columns: 48px minmax(0, 1fr) auto 34px; grid-template-areas: "icon title meta del"; }
      }
      .lib-ed-status { font-size: 12px; color: var(--fc-text-secondary); min-height: 16px; margin-top: 6px; }
      .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
      .modal-actions button { border: none; border-radius: 10px; padding: 10px 18px; font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: var(--fc-shadow); }
      .save-btn { background: var(--fc-accent); color: var(--fc-accent-text); }
      .cancel-btn { background: var(--fc-surface-alt); color: var(--fc-text); }
      .form-error { color: var(--fc-accent3); font-size: 12px; margin-top: 8px; min-height: 14px; }
      .m-icon-picker { margin: 8px 0; }
      .m-icon-toggle { background: var(--fc-card); color: var(--fc-text); border: 1px solid var(--fc-border); border-radius: 8px; font-size: 16px; padding: 5px 8px; cursor: pointer; }
      /* the grid itself is a vertical stack of collapsed-by-default
         category accordions (see REWARD_ICON_CATEGORIES) instead of one
         long flat emoji grid. laid out in normal document flow
         (full modal width, pushes .modal-actions down below it) rather
         than an absolutely-positioned popover - the popover used to float
         over the Add/Cancel buttons below it (and anything else lower in
         the form) whenever a category was open, which is exactly the
         "draws over the buttons" bug this replaced; letting the modal's
         own .modal-box scroll (it's already overflow-y:auto) handles any
         extra height instead of nesting a second scroll area in here. */
      .m-icon-grid { width: 100%; box-sizing: border-box; margin-top: 6px; display: flex; flex-direction: column; gap: 4px; background: var(--fc-card); border: 1px solid var(--fc-border); border-radius: 10px; padding: 8px; }
      .m-icon-category { border-bottom: 1px solid var(--fc-border); padding-bottom: 4px; }
      .m-icon-category:last-of-type { border-bottom: none; padding-bottom: 0; }
      .m-icon-cat-toggle { width: 100%; display: flex; align-items: center; justify-content: space-between; background: none; border: none; color: var(--fc-text); font-size: 12px; font-weight: 700; padding: 6px 2px; cursor: pointer; }
      .m-icon-cat-chevron { font-size: 10px; color: var(--fc-text-secondary); transition: transform 0.2s ease; }
      .m-icon-category.open .m-icon-cat-chevron { transform: rotate(180deg); }
      .m-icon-cat-body { display: none; grid-template-columns: repeat(6, 1fr); gap: 4px; padding-bottom: 4px; }
      .m-icon-category.open .m-icon-cat-body { display: grid; }
      .m-icon-choice { border: none; background: var(--fc-surface-alt); border-radius: 6px; font-size: 16px; padding: 4px; cursor: pointer; line-height: 1; }
      .m-icon-clear { border: none; background: var(--fc-surface-alt); border-radius: 6px; font-size: 12px; font-weight: 700; padding: 6px; cursor: pointer; line-height: 1; color: var(--fc-accent3); margin-top: 2px; }
      .m-color-row { display: flex; align-items: center; gap: 4px; }
      .m-color { width: 36px; height: 30px; padding: 0; border: 1px solid var(--fc-border); border-radius: 8px; background: none; cursor: pointer; }
      .m-color-reset-btn { background: var(--fc-surface-alt); color: var(--fc-text); border: 1px solid var(--fc-border); font-size: 11px; font-weight: 600; padding: 5px 8px; }
      .history-row { display: grid; grid-template-columns: 1fr 1fr auto auto auto; align-items: center; gap: 8px; font-size: 12px; padding: 5px 0; border-top: 1px solid var(--fc-border); }
      .history-date { color: var(--fc-text-secondary); text-align: right; }
      .history-actions { display: flex; gap: 2px; }
      .history-delete-btn, .history-reverse-btn { border: none; background: none; font-size: 14px; cursor: pointer; padding: 2px 4px; line-height: 1; }
      .history-delete-btn { color: var(--fc-accent3); }
      .history-reverse-btn { color: var(--fc-accent2); }
      /* pending reward_engine suggestions - see _suggestionRowHtml.
         .suggestions-title (the "Suggested rewards" .section-title) starts
         hidden in the markup and is only un-hidden in _render() while the
         bin actually has something in it, same idea as every other
         empty-state-hides-the-whole-section convention in this file. */
      .suggestion-row { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 4px 8px; font-size: 12px; padding: 6px 0; border-top: 1px solid var(--fc-border); }
      .suggestion-icon { font-size: 18px; grid-row: span 2; }
      .suggestion-title { font-weight: 700; font-size: 13px; }
      .suggestion-by { grid-column: 2; color: var(--fc-text-secondary); font-size: 11px; }
      .suggestion-actions { grid-row: span 2; display: flex; align-items: center; gap: 4px; }
      .suggestion-cost-input { width: 56px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 12px; }
      .suggestion-approve-btn, .suggestion-reject-btn { border: none; border-radius: 6px; width: 24px; height: 24px; line-height: 1; cursor: pointer; font-weight: 800; }
      .suggestion-approve-btn { background: var(--fc-accent2); color: #fff; }
      .suggestion-reject-btn { background: var(--fc-surface-alt); color: var(--fc-accent3); }
      .suggestion-pending { grid-row: span 2; color: var(--fc-text-secondary); font-size: 11px; font-style: italic; white-space: nowrap; }
      /* embedded Goals section rows reuse .suggestion-row's own grid
         (see _goalRowHtml) - .goal-row-actions just needs its own button
         styling since Log Progress/Approve/Send Back are full text labels,
         not the suggestion row's small icon-only checkmark/X buttons. */
      .goal-row-actions { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }
      .goal-row-actions button { border: none; border-radius: 6px; padding: 4px 8px; font-size: 11px; font-weight: 700; cursor: pointer; background: var(--fc-accent2); color: #fff; white-space: nowrap; }
      .goal-reject-btn { background: var(--fc-surface-alt) !important; color: var(--fc-accent3) !important; }
      .empty { font-size: 12px; color: var(--fc-text-secondary); padding: 6px 0; }
      /* pending-fulfillment rows reuse .suggestion-row's own grid,
         see _pendingRowHtml. */
      .pending-mark-done-btn { border: none; border-radius: 8px; padding: 4px 8px; font-size: 11px; font-weight: 700; cursor: pointer; background: var(--fc-accent2); color: #fff; white-space: nowrap; }
      /* value_note/redeem_mode badges and the banked-item display
         on a catalog card - see _catalogItemHtml. */
      .catalog-value-note { font-size: 11px; color: var(--fc-text-secondary); margin-bottom: 4px; }
      .catalog-mode-badge { display: inline-block; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; color: var(--fc-accent2); background: var(--fc-surface-alt); border-radius: 6px; padding: 1px 6px; margin-bottom: 4px; }
      .catalog-bank { font-size: 11px; font-weight: 700; color: var(--fc-accent2); margin-bottom: 4px; }
      .catalog-use-bank-btn { border: none; border-radius: 8px; padding: 6px 10px; font-size: 12px; font-weight: 700; cursor: pointer; background: var(--fc-surface-alt); color: var(--fc-text); width: 100%; margin-top: 4px; }
      /* the Star History modal - reuses the same .modal-overlay/
         .modal-box shell every other modal in this file already has. */
      .star-history-box { width: min(90vw, 460px); }
      .star-history-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
      .star-history-title { font-size: 15px; font-weight: 800; margin: 0; }
      .star-history-close-btn { border: none; background: none; font-size: 16px; color: var(--fc-text-secondary); cursor: pointer; line-height: 1; padding: 4px; }
      .star-history-list { max-height: 60vh; overflow-y: auto; }
      .star-history-row { display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: 4px 8px; font-size: 12px; padding: 6px 0; border-top: 1px solid var(--fc-border); }
      .star-history-icon { font-size: 16px; }
      .star-history-label { font-weight: 700; }
      .star-history-detail { color: var(--fc-accent); white-space: nowrap; }
      .star-history-date { color: var(--fc-text-secondary); font-size: 11px; white-space: nowrap; text-align: right; }
    `;
  }
}

if (!customElements.get("family-hub-rewards-card")) {
  customElements.define("family-hub-rewards-card", FamilyHubRewardsCard);
}

// dedicated editor element for getConfigElement above - same pattern as family-hub-goals-card.js's own editor
class FamilyHubRewardsCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    if (!this._peopleOptions && !this._peopleOptionsLoading && hass) this._fetchPeopleOptions();
    if (!this._themeOptions) this._fetchThemeOptions();
    else this._render();
  }
  // v1.168.63: household members for the "People on this card" list -
  // Family Hub members (memberUserIds) by name, fetched once.
  async _fetchPeopleOptions() {
    this._peopleOptionsLoading = true;
    // v1.168.66: "Just me" first - whoever is signed in (or PIN-logged-in
    // on a kiosk) at the time, instead of a fixed person.
    const options = [{ value: "me", label: "Just me (whoever is signed in)" }];
    try {
      const [usersRes, settingsRes] = await Promise.all([
        this._hass.connection.sendMessagePromise({ type: "family_hub/list_users" }).catch(() => null),
        this._hass.connection.sendMessagePromise({ type: "family_hub/get_settings" }).catch(() => null),
      ]);
      const users = (usersRes && Array.isArray(usersRes.users)) ? usersRes.users : [];
      const settings = (settingsRes && settingsRes.settings) || {};
      const members = Array.isArray(settings.memberUserIds) && settings.memberUserIds.length ? new Set(settings.memberUserIds) : null;
      users
        .filter((u) => u && u.id && (!members || members.has(u.id)))
        .forEach((u) => options.push({ value: u.id, label: u.name || u.id }));
    } catch (e) {
      // leave the list empty - the option still works from YAML
    }
    // keep any already-chosen id visible even if it isn't a member any more,
    // so saving the editor never silently drops it
    ((this._config && Array.isArray(this._config.people)) ? this._config.people : []).forEach((id) => {
      if (!options.some((o) => o.value === id)) options.push({ value: id, label: id + " (not found)" });
    });
    this._peopleOptions = options;
    this._peopleOptionsLoading = false;
    this._render();
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
      {
        name: "fab_position",
        selector: { select: { mode: "dropdown", options: [
          { value: "dashboard", label: "Dashboard corner (default)" },
          { value: "card", label: "This card's own corner" },
        ] } },
      },
      {
        name: "people",
        selector: { select: { multiple: true, mode: "list", options: this._peopleOptions || [] } },
      },
      {
        name: "theme_override",
        selector: { select: { mode: "dropdown", options: this._themeOptions || [{ value: "", label: "Use device settings (default)" }] } },
      },
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
    this._form.computeLabel = (s) => (
      s.name === "title" ? "Title" :
      s.name === "fab_position" ? "+ button position" :
      s.name === "theme_override" ? "Theme" :
      s.name === "people" ? "People on this card" : undefined
    );
    this._form.computeHelper = (s) => (
      s.name === "people"
        ? "Only these people get a spot (and a name pill) on this card. \"Just me\" means whoever is signed in (on a kiosk, whoever logged in with their PIN). Leave everything unchecked to show everyone."
        : s.name === "theme_override"
        ? "Pin this one card to a specific theme, or leave on \"Use device settings\" to follow whatever this device/household normally shows."
        : undefined
    );
  }
}
if (!customElements.get("family-hub-rewards-card-editor")) {
  customElements.define("family-hub-rewards-card-editor", FamilyHubRewardsCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "family-hub-rewards-card")) {
  window.customCards.push({
    type: "family-hub-rewards-card",
    name: "Family Hub Rewards",
    description: "Star economy ledger - household star balances, a browsable reward catalog with a one-click claim, and recent redemption history.",
  });
}
