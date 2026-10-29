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

// Full-screen Chores board: one column per household member plus a shared Chore Bin column, drag-and-drop between them
const ASSIGNMENT_MODES = [
  { value: "direct", label: "Direct", title: "Assign to one specific person" },
  { value: "auto_rotation", label: "Auto Rotation", title: "Takes turns automatically among a rotation group" },
  { value: "chore_bin", label: "Chore Bin (anyone can claim)", title: "Sits unassigned until someone taps Claim" },
];
const CHORE_BIN_SENTINEL = "chore_bin";
// v1.168.65: the Waiting to Recur pill's id (matches its column's data-col-id).
const WAITING_TO_RECUR_PILL_ID = "waiting_to_recur";
const CHORE_REMINDER_MINUTES_CHOICES = [5, 10, 15, 30, 60, 120, 1440];
const PALETTE = ["#a9c6c2", "#dba99c", "#d9bf7e", "#a8bd93", "#b9a7c9", "#cf8f6c", "#a89a83"];
// Index 0-6 = Monday..Sunday, matching Python's own date.weekday()/the backend's recur_weekdays exactly
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// same index convention as WEEKDAY_LABELS just above (Monday=0 ...Sunday=6)
const WEEKDAY_FULL_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
// Matches the existing recur_month_nth select's own wording (_recurFieldsHtml's nthOptions
const RECUR_NTH_WORDS = { "1": "first", "2": "second", "3": "third", "4": "fourth", "-1": "last" };
// Presets for recur_due_offset_minutes (see chore_engine.CHORE_KEY_RECUR_DUE_OFFSET_ MINUTES) - "0"
const RECUR_DUE_OFFSET_OPTIONS = [
  { value: 0, label: " immediately " },
  { value: 60, label: " 1 hour " },
  { value: 180, label: " 3 hours " },
  { value: 360, label: " 6 hours " },
  { value: 720, label: " 12 hours " },
  { value: 1440, label: " 1 day " },
  { value: 2880, label: " 2 days " },
  { value: 4320, label: " 3 days " },
  { value: 10080, label: " 1 week " },
];
// Fixed order/labels, matching const.py's ROUTINE_CATEGORIES/ ROUTINE_CATEGORY_LABELS exactly
const ROUTINE_CATEGORIES = ["morning", "afternoon", "night"];
const ROUTINE_CATEGORY_LABELS = { morning: "Morning Routine", afternoon: "Afternoon Routine", night: "Night Routine" };
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

class FamilyHubChoresCard extends HTMLElement {
  static getStubConfig() {
    return { title: "Chores" };
  }
  // switched to getConfigElement (a real custom element) so the Theme picker below can list live Theme Builder + native HA themes
  static getConfigElement() {
    return document.createElement("family-hub-chores-card-editor");
  }
  setConfig(config) {
    this._config = {
      title: (config && config.title) || "Chores",
      fab_position: config && config.fab_position === "card" ? "card" : "dashboard",
      theme_override: (config && typeof config.theme_override === "string") ? config.theme_override : "",
      // which people this card shows at all (Home Assistant user ids, picked in the card editor's "People on this card" list).
      people: Array.isArray(config && config.people) ? config.people.filter((id) => typeof id === "string" && id) : [],
      // Waiting to Recur is now a name pill (it used to be a ↻ header button that collapsed/expanded its column).
      show_waiting_to_recur: !(config && config.show_waiting_to_recur === false),
      // "single": one column at a time - swipe or use the arrows to move between people (compact layouts)
      layout: config && config.layout === "single" ? "single" : "columns",
      // each person's star balance next to their name in the column header
      show_stars: !(config && config.show_stars === false),
      // "Ask for stars" tab in the + button's New pop-up: request stars for something that isn't on the chart
      allow_star_requests: !(config && config.allow_star_requests === false),
    };
    this._registerFabCoordinator();
    if (this._settingsCache === undefined) this._settingsCache = null;
    if (this._globalThemes === undefined) this._globalThemes = [];
    if (this._chores === undefined) this._chores = [];
    if (this._users === undefined) this._users = [];
    if (this._myPermissions === undefined) this._myPermissions = {};
    // running chore/reward timers, household-wide, straight from family_hub/timers/list.
    if (this._timers === undefined) this._timers = [];
    if (this._balances === undefined) this._balances = {};
    if (this._catalog === undefined) this._catalog = [];
    if (this._firstLoadPromise === undefined) this._firstLoadPromise = null;
    if (this._draggingId === undefined) this._draggingId = null;
    if (this._routineItems === undefined) this._routineItems = [];
    // Which Morning/Afternoon/Night accordion rows are expanded, keyed "<userId>:<category>" - lives on the card instance
    if (this._openRoutineSections === undefined) this._openRoutineSections = new Set();
    // Which per-column "Completed" accordions are expanded, keyed by column (person) id - same "lives on the instance
    if (this._openCompletedSections === undefined) this._openCompletedSections = new Set();
    // Goals, optionally embedded per-person on the Chores board (see _goalsInChoresEnabled/_goalsBlockHtml)
    if (this._goals === undefined) this._goals = [];
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
    await Promise.all([this._fetchSettings(), this._fetchUsers(), this._fetchChores()]);
    // always fetch (not just when useGlobalTheme is on) so a per-card theme_override can resolve even when the household hasn't turned on Global
    await this._fetchGlobalThemes();
    await this._fetchMyPermissions();
    await this._fetchTimers();
    this._startTimerTicker();
    if (this._showRewardsColumn() || this._config.show_stars) await this._fetchRewardsState();
    if (this._routinesEnabled()) await this._fetchRoutines();
    if (this._goalsInChoresEnabled()) await this._fetchGoals();
    // who (if anyone) can kiosk-PIN-login on this board - decides whether the Login button even shows at all (see _updateKioskLoginUi).
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
  // joins the shared kiosk-login session (see the singleton block above this class) instead of tracking elevation as a private instance field
  _registerKioskSession() {
    if (window.__familyHubKioskSession) window.__familyHubKioskSession.registerClient(this, (elevation) => this._onKioskElevationChanged(elevation));
  }
  // Joins the shared, dashboard-wide screensaver controller (see the singleton block above this class) rather than standing up its own
  _registerScreenSaver() {
    if (window.__familyHubScreenSaver && this._hass) window.__familyHubScreenSaver.registerClient(this, this._hass);
  }
  // joins the shared FAB-stacking coordinator (see the singleton block above this class) so this card's add-chore-fab gets a non- overlapping
  _registerFabCoordinator() {
    // fab_position "card" toggles the [fab-position="card"] host attribute the CSS below keys off of
    if (!window.__familyHubFabCoordinator) return;
    const cardRelative = this._config && this._config.fab_position === "card";
    if (cardRelative) this.setAttribute("fab-position", "card");
    else this.removeAttribute("fab-position");
    window.__familyHubFabCoordinator.registerClient(
      this,
      "chores",
      { providesGoalTab: this._goalsInChoresEnabled() },
      (state) => {
        this.style.setProperty("--fh-fab-offset", `${state.offsetPx}px`);
        // hideForModal is true while ANY Family Hub card on this dashboard has a full-screen modal open
        const fab = this._root && this._root.querySelector(".add-chore-fab");
        if (fab) fab.hidden = !!state.hideForModal;
      },
      { takesSlot: !cardRelative }
    );
  }
  // the actual poll-refresh body, pulled out of _startPolling's setInterval callback so connectedCallback
  _pollTick() {
    this._fetchChores();
    this._fetchTimers();
    if (this._showRewardsColumn()) this._fetchRewardsState();
    if (this._routinesEnabled()) this._fetchRoutines();
    if (this._goalsInChoresEnabled()) this._fetchGoals();
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
    // _fireConfetti's portals live in document.body, outside this card's own shadow root (see that method's own comment for why)
    if (this._confettiPortals && this._confettiPortals.length) {
      this._confettiPortals.forEach((portal) => portal.remove());
      this._confettiPortals = [];
    }
  }
  getCardSize() {
    return 8;
  }
  getGridOptions() {
    return { columns: 12, min_columns: 8, max_columns: 12, min_rows: 8 };
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
  // reads this._myPermissions (see _fetchMyPermissions below), the CALLER's own effective grants - {permission: bool}
  _hasPermission(key) {
    if (this._isAdmin()) return true;
    if (this._kioskElevation) return !!(this._kioskElevation.permissions && this._kioskElevation.permissions[key]);
    return !!this._myPermissions[key];
  }
  // -- Native HA frontend i18n (same trio as family-week-calendar-card.js
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
  // ROUTINE_CATEGORY_LABELS/WEEKDAY_LABELS are module-level consts (shared with const.py's own fixed ordering
  _routineCategoryLabel(cat) {
    const fallback = ROUTINE_CATEGORY_LABELS[cat] || cat;
    return this._t(`chores.routine_category_${cat}`, fallback);
  }
  _weekdayLabel(idx) {
    const fallback = WEEKDAY_LABELS[idx] || "";
    return this._t(`chores.weekday_${idx}`, fallback);
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
        // this used to fail completely silently (see _t's own comment above)
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
      btn.textContent = `\u{1F464} ${this._kioskElevation.name} · ${this._t("chores.log_out", "Log out")}`;
      btn.classList.add("active");
      btn.title = this._t("chores.kiosk_logout_title", "Tap to log out of this kiosk session");
    } else {
      btn.textContent = `\u{1F512} ${this._t("chores.login", "Login")}`;
      btn.classList.remove("active");
      btn.title = this._t("chores.kiosk_login_title", "Log in as a specific household member on this kiosk display");
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
        empty.textContent = __fhT("text.no_one_is_set_up_for_kiosk_login_yet_an", "No one is set up for kiosk login yet - an admin can enable it under Settings > Users.");
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
      if (errEl) errEl.textContent = __fhT("text.pick_who_s_logging_in_first", "Pick who's logging in first.");
      return;
    }
    if (!pin) {
      if (errEl) errEl.textContent = __fhT("text.enter_a_pin", "Enter a PIN.");
      return;
    }
    try {
      // the actual elevate round trip and the shared elevation state now live in window.__familyHubKioskSession (see its own docstring above)
      await window.__familyHubKioskSession.login(this._hass, userId, pin);
      this._closeKioskLoginModal();
    } catch (e) {
      if (errEl) errEl.textContent = (e && e.message) || __fhT("text.incorrect_pin", "Incorrect PIN.");
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
    // Everything on the board (which column is "mine", which action buttons show) is derived from _myUserId/_hasPermission
    this._render();
  }
  // the 45-second inactivity timer and its document-wide activity listeners now live entirely in window.__familyHubKioskSession
  async _kioskLogout() {
    if (window.__familyHubKioskSession) await window.__familyHubKioskSession.logout(this._hass);
  }
  _canAssign() {
    return this._hasPermission("can_assign");
  }
  // Mirrors chores_websocket_api.py's _can_write_routine_items(...) exactly (see that function's own docstring for the full reasoning)
  _canManageRoutinesFor(userId) {
    if (this._canAssign()) return true;
    if (this._hasPermission("can_manage_any_routines")) return true;
    if (this._hasPermission("can_manage_own_routines") && userId === this._myUserId()) return true;
    return false;
  }
  // true if the viewer has ANY routine-write grant at all (own, any, or plain can_assign)
  _canManageAnyRoutines() {
    return this._canAssign() || this._hasPermission("can_manage_any_routines") || this._hasPermission("can_manage_own_routines");
  }
  _canVerify() {
    return this._hasPermission("can_verify");
  }
  // PERMISSION_EDIT_CHORE was split out of PERMISSION_ASSIGN - can_assign alone is only enough to create/assign brand new chores now
  _canEditChore() {
    return this._hasPermission("can_edit_chore");
  }
  // PERMISSION_STAR_OVERRIDE - gates the one specific field (no_approval_required) that lets a chore's stars pay out instantly with no
  _canStarOverride() {
    return this._hasPermission("can_star_override");
  }
  // Replaces the old single "Doesn't require approval" checkbox with a 2-button toggle group
  _approvalToggleHtml(inputClass, checked, disabled, disabledTitle) {
    const title = disabled ? ` title="${this._escAttr(disabledTitle || "")}"` : "";
    return `
      <div class="approval-toggle-field"${title}>
        <div class="approval-toggle-label">${this._t("chores.approval_label", "Approval")}</div>
        <div class="approval-toggle-btn-group">
          <button type="button" class="approval-toggle-btn${checked ? "" : " active"}" data-value="required" ${disabled ? "disabled" : ""}>${this._t("chores.requires_approval", "Requires approval")}</button>
          <button type="button" class="approval-toggle-btn${checked ? " active" : ""}" data-value="not_required" ${disabled ? "disabled" : ""}>${this._t("chores.does_not_require_approval", "Doesn't require approval")}</button>
        </div>
        <input type="checkbox" class="${inputClass}" hidden ${checked ? "checked" : ""} ${disabled ? "disabled" : ""} />
      </div>
    `;
  }
  // Wires the two buttons rendered by _approvalToggleHtml above
  _wireApprovalToggle(scope, inputClass) {
    const checkbox = scope.querySelector(`.${inputClass}`);
    if (!checkbox) return;
    const group = checkbox.previousElementSibling;
    if (!group || !group.classList.contains("approval-toggle-btn-group")) return;
    group.querySelectorAll(".approval-toggle-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        group.querySelectorAll(".approval-toggle-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        checkbox.checked = btn.dataset.value === "not_required";
      });
    });
  }
  // Same visual convention as _approvalToggleHtml above (a hidden field driven by a row of buttons), but three options instead of two
  _alarmAudienceToggleHtml(inputClass, value) {
    const v = value === "kiosks" || value === "everyone" ? value : "self";
    const opt = (val, label) => `<button type="button" class="approval-toggle-btn${v === val ? " active" : ""}" data-value="${val}">${label}</button>`;
    return `
      <div class="approval-toggle-field">
        <div class="approval-toggle-label">${this._t("chores.alarm_audience_label", "Who hears this alarm")}</div>
        <div class="approval-toggle-btn-group">
          ${opt("self", this._t("chores.alarm_audience_self", "Just them"))}
          ${opt("kiosks", this._t("chores.alarm_audience_kiosks", "Them + kiosks"))}
          ${opt("everyone", this._t("chores.alarm_audience_everyone", "Everyone"))}
        </div>
        <input type="text" class="${inputClass}" hidden value="${v}" />
      </div>
    `;
  }
  // Wires the three buttons rendered by _alarmAudienceToggleHtml above
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
  // Same PERMISSION_VERIFY-or-PERMISSION_COMPLETE_ANY tier family-hub- goals-card.js's own _canLogForOthers uses
  _canLogGoalsForOthers() {
    return this._canVerify() || this._hasPermission("can_complete_any");
  }
  _canLogGoalProgress(goal) {
    return goal.assigned_to === this._myUserId() || this._canLogGoalsForOthers();
  }

  // --- theming (mirrors family-today-card.js's _defaultTheme/_resolveTheme/_applyThemeVars) ---
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
    // Root cause: choresConfettiOnComplete is a schema-free Settings key with no backend-side default at all
    return { theme: this._defaultTheme(), useGlobalTheme: true, globalThemeId: "slate", choresConfettiOnComplete: true };
  }
  _getSettings() {
    return this._settingsCache || this._defaultSettings();
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
    // goalsShowInChores can change out from under a card that's already on screen
    if (window.__familyHubFabCoordinator) {
      window.__familyHubFabCoordinator.updateClientMeta(this, { providesGoalTab: this._goalsInChoresEnabled() });
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
  async _fetchChores() {
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/chores/list" });
      this._chores = (result && Array.isArray(result.chores)) ? result.chores : [];
    } catch (e) {
      this._chores = [];
    }
    this._render();
    // a chore changed, so its place on the schedule (and its next repeats) may have too
    if (this._scheduleViewEnabled()) this._fetchSchedule();
    // approving or finishing a chore changes stars, so the header balances follow every chore refresh
    if (this._config && this._config.show_stars && !this._showRewardsColumn()) this._fetchRewardsState();
  }
  // fetched for EVERY user, not just admins - family_hub/ permissions/get_mine is open to any authenticated household member and returns only

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
  async _startChoreTimer(choreId) {
    if (!choreId || !this._hass) return;
    try {
      await this._hass.connection.sendMessagePromise(
        this._kioskMsg({ type: "family_hub/timers/start_chore", chore_id: choreId, client_id: this._familyHubClientId() })
      );
    } catch (e) {
      // Surfaced rather than swallowed - the realistic failures here are "you've already got a chore timer running" and "that's not your chore,"
      window.alert((e && e.message) || __fhT("text.couldn_t_start_that_timer", "Couldn't start that timer."));
    }
    await this._fetchTimers();
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
  // Powers the optional Rewards column (see _showRewardsColumn/ _rewardsColumnHtml below)
  async _fetchRewardsState() {
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/rewards/get_state" });
      this._balances = (result && result.balances) || {};
      this._catalog = (result && result.catalog) || [];
    } catch (e) {
      // keep whatever we had
    }
    this._render();
  }
  // routinesEnabled is the per-household on/off switch for the whole Routines feature
  _routinesEnabled() {
    return !!(this._settingsCache && this._settingsCache.routinesEnabled);
  }
  // goalsShowInChores, same household-wide Settings-toggle shape as routinesEnabled just above (see const.py's SETTINGS_KEY_GOALS_IN_CHORES)
  _goalsInChoresEnabled() {
    return !!(this._settingsCache && this._settingsCache.goalsShowInChores);
  }
  // Powers the per-person Goals block (see _goalsBlockHtml) - one flat list for the whole household, filtered client-side per person
  async _fetchGoals() {
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/goals/list" });
      this._goals = (result && Array.isArray(result.goals)) ? result.goals : [];
    } catch (e) {
      // keep whatever we had
    }
    this._render();
  }
  // Powers the per-person Morning/Afternoon/Night accordions rendered into each user's own column (see _routinesBlockHtml)
  async _fetchRoutines() {
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/routines/list" });
      this._routineItems = (result && Array.isArray(result.items)) ? result.items : [];
    } catch (e) {
      this._routineItems = [];
    }
    this._render();
  }
  // choresShowRewardsColumn lives on the same schema-free Settings blob as everything else (see _fetchSettings) - opt-in/off by default
  _showRewardsColumn() {
    return !!(this._settingsCache && this._settingsCache.choresShowRewardsColumn);
  }
  // choresConfettiOnComplete lives on the same schema-free Settings blob as choresShowRewardsColumn/routinesEnabled/goalsShow InChores just
  _confettiOnCompleteEnabled() {
    return !!(this._settingsCache && this._settingsCache.choresConfettiOnComplete);
  }
  // Root cause: this used to append the overlay to `this._root`
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
  // Reads a fresh copy of the settings blob right before writing, rather than trusting this card's own (possibly long-stale
  async _toggleRewardsColumn() {
    if (!this._hass || !this._isAdmin()) return;
    const next = !this._showRewardsColumn();
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_settings" });
      const fresh = (result && result.settings && typeof result.settings === "object") ? result.settings : (this._settingsCache || {});
      const merged = Object.assign({}, fresh, { choresShowRewardsColumn: next });
      await this._hass.connection.sendMessagePromise({ type: "family_hub/set_settings", settings: merged });
      this._settingsCache = Object.assign(this._defaultSettings(), merged);
      if (next) await this._fetchRewardsState();
    } catch (e) {
      // no-op - button just stays in its last-known state
    }
    this._render();
  }
  // Redeeming a reward from the mini Rewards column - named distinctly from _claim(id) just above (chore claiming
  async _claimReward(itemId) {
    const statusEl = this._root.querySelector(`.rewards-catalog-item[data-id="${itemId}"] .rewards-claim-status`);
    try {
      await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/rewards/redeem", item_id: itemId }));
      await this._fetchRewardsState();
    } catch (e) {
      if (statusEl) statusEl.textContent = __fhT("text.not_enough_stars_yet", "Not enough stars yet.");
    }
  }
  // memberUserIds lives on the Settings blob (see const.py's SETTINGS_KEY_MEMBER_USER_IDS)
  _isFamilyHubMember(userId) {
    const memberIds = (this._settingsCache && this._settingsCache.memberUserIds) || [];
    return memberIds.includes(userId);
  }
  // a second, narrower opt-out UNDER Family Hub membership - see const.py's own "v121+" docstring right after SETTINGS_KEY_MEMBER_USER_IDS for
  _isChoresIncluded(userId) {
    if (!this._isFamilyHubMember(userId)) return false;
    const profiles = (this._settingsCache && this._settingsCache.userProfiles) || {};
    const profile = profiles[userId];
    // a kiosk account (a shared tablet login) is never on Chores, Rewards or Goals
    return !profile || (profile.includeInChores !== false && !profile.isKioskAccount);
  }
  // Being added to Family Hub AND included in Chores is the gate for the Chores board
  _memberUsers() {
    return this._users.filter((u) => this._isChoresIncluded(u.id));
  }
  _userName(id) {
    if (id === CHORE_BIN_SENTINEL) return "Chore Bin";
    const u = this._users.find((x) => x.id === id);
    return u ? u.name : id || "Unassigned";
  }
  // A person's own custom color (settings.userProfiles[id].color, set on the Users tab of the calendar card's Settings
  _userColor(id) {
    const profiles = (this._settingsCache && this._settingsCache.userProfiles) || {};
    const custom = profiles[id] && profiles[id].color;
    if (custom) return custom;
    const idx = this._users.findIndex((x) => x.id === id);
    return idx >= 0 ? PALETTE[idx % PALETTE.length] : "#c9c2b3";
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
            <button class="schedule-view-toggle-btn" title="Show the chore schedule" data-i18n-title="chores.schedule_toggle_show">&#128197;</button>
            <button class="compact-view-toggle-btn" title="Switch to compact view" data-i18n-title="chores.compact_view_show">&#9776;</button>
            <button class="rewards-toggle-btn" title="Show/hide the Rewards column" data-i18n-title="chores.rewards_toggle_title" hidden>&#11088;</button>
            <button class="kiosk-login-btn" title="Log in as a specific household member on this kiosk display" data-i18n-title="chores.kiosk_login_title" hidden>&#128274; <span data-i18n="chores.login">Login</span></button>
          </div>
        </div>
        <div class="person-pills" hidden></div>
        <div class="board"></div>
      </ha-card>
      <div class="modal-overlay create-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay edit-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay detail-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay reject-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay kiosk-login-overlay">
        <div class="modal-box kiosk-login-box">
          <button type="button" class="detail-close-btn kiosk-login-close" title="Close" data-i18n-title="common.close">&#10005;</button>
          <h2>&#128274; <span data-i18n="chores.kiosk_login_heading">Kiosk login</span></h2>
          <div class="kiosk-login-user-picker"></div>
          <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" class="kiosk-login-pin-input" placeholder="PIN" />
          <div class="kiosk-login-error"></div>
          <div class="modal-actions">
            <button class="cancel-btn kiosk-login-cancel" data-i18n="common.cancel">Cancel</button>
            <button class="save-btn kiosk-login-submit" data-i18n="chores.log_in">Log in</button>
          </div>
        </div>
      </div>
      <button class="add-chore-fab" title="Add a chore" data-i18n-title="chores.add_a_chore" aria-haspopup="true">&#65291;</button>
    `;
    this._root = root;
    // A fixed round + button in the bottom-right corner, matching family-week-calendar-card.js's own add-event-fab pixel-for-pixel
    root.querySelector(".add-chore-fab").addEventListener("click", () => this._openCreateModal());
    root.querySelector(".rewards-toggle-btn").addEventListener("click", () => this._toggleRewardsColumn());
    root.querySelector(".compact-view-toggle-btn").addEventListener("click", () => this._toggleCompactView());
    root.querySelector(".schedule-view-toggle-btn").addEventListener("click", () => this._toggleScheduleView());
    root.querySelectorAll(".modal-overlay").forEach((ov) => {
      ov.addEventListener("click", (e) => {
        if (e.target === ov) ov.classList.remove("open");
      });
    });
    root.querySelector(".board").addEventListener("click", (e) => this._onBoardClick(e));
    // kiosk PIN login - see _onKioskLoginBtnClick's own
    // docstring for the full picture.
    root.querySelector(".kiosk-login-btn").addEventListener("click", () => this._onKioskLoginBtnClick());
    root.querySelector(".kiosk-login-close").addEventListener("click", () => this._closeKioskLoginModal());
    root.querySelector(".kiosk-login-cancel").addEventListener("click", () => this._closeKioskLoginModal());
    root.querySelector(".kiosk-login-submit").addEventListener("click", () => this._submitKioskLogin());
    root.querySelector(".kiosk-login-pin-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._submitKioskLogin();
    });
    // the 45-second idle-reset activity listeners moved to window.__familyHubKioskSession itself (bound once, at the document level
  }

  // Anyone can ask for stars for themselves; asking for someone else takes assign permission
  // (the backend checks the same rule). Approving uses the normal verify permission.
  _canRequestStarsFor(colId) {
    if (!this._config.allow_star_requests || !colId || colId === CHORE_BIN_SENTINEL) return false;
    const me = this._myUserId();
    return (!!me && colId === me) || this._canAssign();
  }
  // The "Ask for stars" tab in the + button's New pop-up: for yourself if you're in Family Hub,
  // or for anyone with assign permission.
  _canRequestStarsAny() {
    if (!this._config.allow_star_requests) return false;
    const me = this._myUserId();
    return this._canAssign() || (!!me && this._memberUsers().some((u) => u.id === me));
  }
  _starRequestPaneHtml() {
    const me = this._myUserId();
    const choices = this._memberUsers().filter((u) => this._canRequestStarsFor(u.id));
    const forField = this._canAssign() && choices.length > 1
      ? `<div class="field"><label>${this._esc(this._t("chores.star_request_for", "For"))}</label><select class="s-for">${choices
          .map((u) => `<option value="${u.id}"${u.id === me ? " selected" : ""}>${this._esc(u.name)}</option>`)
          .join("")}</select></div>`
      : "";
    return `
      ${forField}
      <div class="field"><label>${this._esc(this._t("chores.star_request_what", "What did you do?"))}</label><input type="text" class="s-title" maxlength="120" placeholder="${this._escAttr(this._t("chores.star_request_what_placeholder", "Helped carry in the groceries"))}"></div>
      <div class="field"><label>${this._esc(this._t("chores.star_request_how_many", "How many stars?"))}</label><input type="number" class="s-stars" min="1" max="100" value="1" inputmode="numeric"></div>
      <div class="field"><label>${this._esc(this._t("chores.star_request_note", "Anything else? (optional)"))}</label><input type="text" class="s-note" maxlength="200"></div>
      <div class="star-request-hint">${this._esc(this._t("chores.star_request_hint", "Someone who can approve chores will approve it or send it back."))}</div>
    `;
  }
  async _submitStarRequest(overlay, box) {
    const errEl = box.querySelector(".form-error");
    const title = box.querySelector(".s-title").value.trim();
    const stars = parseInt(box.querySelector(".s-stars").value, 10);
    const notes = box.querySelector(".s-note").value.trim();
    const forSel = box.querySelector(".s-for");
    const forUser = forSel ? forSel.value : this._myUserId();
    if (!title) {
      errEl.textContent = this._t("chores.star_request_need_title", "Say what it was for.");
      return;
    }
    if (!Number.isInteger(stars) || stars < 1 || stars > 100) {
      errEl.textContent = this._t("chores.star_request_need_stars", "Ask for between 1 and 100 stars.");
      return;
    }
    const msg = { type: "family_hub/chores/request_stars", title, stars };
    if (forUser && forUser !== this._myUserId()) msg.for_user = forUser;
    if (notes) msg.notes = notes;
    try {
      await this._hass.connection.sendMessagePromise(this._kioskMsg(msg));
    } catch (e) {
      errEl.textContent = (e && e.message) || this._t("chores.star_request_failed", "Couldn't send the request.");
      return;
    }
    overlay.classList.remove("open");
    await this._fetchChores();
  }
  _onBoardClick(e) {
    if (e.target.closest(".sched") && this._onScheduleClick(e)) return;
    // timer controls first - both live inside .chore-actions alongside Done/Nudge
    const timerStartBtn = e.target.closest(".chore-timer-start-btn");
    if (timerStartBtn) {
      e.stopPropagation();
      this._startChoreTimer(timerStartBtn.dataset.id);
      return;
    }
    const timerCancelBtn = e.target.closest(".chore-timer-cancel-btn");
    if (timerCancelBtn) {
      e.stopPropagation();
      this._cancelTimer(timerCancelBtn.dataset.uid);
      return;
    }
    const inProgressBtn = e.target.closest(".chore-in-progress-btn");
    if (inProgressBtn) {
      e.stopPropagation();
      this._setChoreInProgress(inProgressBtn.dataset.id, inProgressBtn.dataset.next === "1");
      return;
    }
    const nudgeBtn = e.target.closest(".chore-nudge-btn");
    const doneBtn = e.target.closest(".chore-done-btn");
    const approveBtn = e.target.closest(".chore-approve-btn");
    const rejectBtn = e.target.closest(".chore-reject-btn");
    const claimBtn = e.target.closest(".chore-claim-btn");
    const rewardsClaimBtn = e.target.closest(".rewards-claim-btn");
    const editBtn = e.target.closest(".chore-edit-btn");
    const routineHeader = e.target.closest(".routine-row-header");
    const completedHeader = e.target.closest(".completed-chores-header");
    const routineEditBtn = e.target.closest(".routine-item-edit");
    const routineDeleteBtn = e.target.closest(".routine-item-delete");
    const routineCheck = e.target.closest(".routine-item-check");
    const routineApproveBtn = e.target.closest(".routine-item-approve");
    const goalLogBtn = e.target.closest(".goal-log-btn");
    const goalApproveBtn = e.target.closest(".goal-approve-btn");
    const goalRejectBtn = e.target.closest(".goal-reject-btn");
    const goalCompleteBtn = e.target.closest(".goal-complete-btn");
    if (goalLogBtn) return this._logGoalProgress(goalLogBtn.dataset.id);
    if (goalApproveBtn) return this._approveGoal(goalApproveBtn.dataset.id);
    if (goalRejectBtn) return this._rejectGoal(goalRejectBtn.dataset.id);
    if (goalCompleteBtn) return this._archiveGoal(goalCompleteBtn.dataset.id);
    if (nudgeBtn) return this._nudge(nudgeBtn.dataset.id);
    if (doneBtn) return this._complete(doneBtn.dataset.id);
    if (approveBtn) return this._approve(approveBtn.dataset.id);
    if (rejectBtn) return this._reject(rejectBtn.dataset.id);
    if (claimBtn) return this._claim(claimBtn.dataset.id);
    if (rewardsClaimBtn) return this._claimReward(rewardsClaimBtn.dataset.id);
    if (editBtn) return this._openEditModal(editBtn.dataset.id);
    // Edit jumps into the FAB modal's Routine tab pre-scoped to this item (see _openRoutineManageModal)
    if (routineEditBtn) return this._openRoutineManageModal(routineEditBtn.dataset.id);
    if (routineDeleteBtn) return this._deleteRoutineItem(routineDeleteBtn.dataset.id);
    // Checked before routineHeader so tapping the checkbox itself
    if (routineCheck) return this._toggleRoutineItem(routineCheck.dataset.id, routineCheck.checked);
    if (routineApproveBtn) return this._approveRoutineItem(routineApproveBtn.dataset.id);
    if (routineHeader) return this._toggleRoutineSection(routineHeader.dataset.user, routineHeader.dataset.category);
    if (completedHeader) return this._toggleCompletedSection(completedHeader.dataset.col);
    // Kanban-style "click the card for details" - falls through to here only when the click landed on the card itself (or plain
    const choreCard = e.target.closest(".chore-card");
    if (choreCard) return this._openChoreDetailModal(choreCard.dataset.id);
  }

  async _nudge(id) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/chores/nudge", chore_id: id });
    } catch (e) {
    }
  }
  async _complete(id) {
    try {
      await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/chores/complete", chore_id: id }));
      // fire right after the server confirms the tap actually went through (never on a failed/rejected call
      if (this._confettiOnCompleteEnabled()) this._fireConfetti();
      await this._fetchChores();
    } catch (e) {
      // server already reports the reason via send_error; nothing actionable client-side beyond refreshing
    }
  }
  async _approve(id) {
    try {
      await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/chores/approve", chore_id: id }));
      await this._fetchChores();
    } catch (e) {
    }
  }
  // was an optional, skippable window.prompt() for a short note
  _reject(id) {
    this._openRejectModal(id, "chore");
  }
  _openRejectModal(id, kind) {
    const item = kind === "goal" ? this._goals.find((g) => g.id === id) : this._chores.find((c) => c.id === id);
    if (!item) return;
    const overlay = this._root.querySelector(".reject-modal");
    const box = overlay.querySelector(".modal-box");
    box.innerHTML = `
      <button data-fh-aria="text.close" type="button" class="modal-close reject-modal-close" aria-label="${__fhT("text.close", "Close", null, "h")}">&#10005;</button>
      <h2>${__fhT("text.send_back_x", "Send back \"%0%\"", {0: this._esc(item.title)}, "h")}</h2>
      <div class="field"><label data-fh-t="text.anything_you_want_to_tell_them_about">${__fhT("text.anything_you_want_to_tell_them_about", "Anything you want to tell them about why? (optional)", null, "h")}</label><textarea data-fh-placeholder="text.not_quite_try_again" class="f-reject-reason" rows="3" placeholder="${__fhT("text.not_quite_try_again", "Not quite - try again", null, "h")}"></textarea></div>
      <div class="modal-actions">
        <button data-fh-t="text.cancel" class="cancel-btn">${__fhT("text.cancel", "Cancel", null, "h")}</button>
        <button data-fh-t="text.send_back" class="save-btn">${__fhT("text.send_back", "Send back", null, "h")}</button>
      </div>
    `;
    box.querySelector(".reject-modal-close").addEventListener("click", () => overlay.classList.remove("open"));
    box.querySelector(".cancel-btn").addEventListener("click", () => overlay.classList.remove("open"));
    box.querySelector(".save-btn").addEventListener("click", () => this._submitReject(id, kind, overlay, box));
    overlay.classList.add("open");
    box.querySelector(".f-reject-reason").focus();
  }
  async _submitReject(id, kind, overlay, box) {
    const reason = box.querySelector(".f-reject-reason").value.trim();
    overlay.classList.remove("open");
    if (kind === "goal") {
      try {
        await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/goals/reject", goal_id: id, reason }));
        await this._fetchGoals();
      } catch (e) {
      }
      return;
    }
    try {
      await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/chores/reject", chore_id: id, reason }));
      await this._fetchChores();
    } catch (e) {
    }
  }
  async _claim(id) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/chores/claim", chore_id: id });
      await this._fetchChores();
    } catch (e) {
    }
  }
  async _setChoreInProgress(id, inProgress) {
    try {
      await this._hass.connection.sendMessagePromise(
        this._kioskMsg({ type: "family_hub/chores/set_in_progress", chore_id: id, in_progress: inProgress })
      );
      await this._fetchChores();
    } catch (e) {
      // server already reports the reason via send_error; next poll/render corrects the button either way
    }
  }
  async _assign(id, target) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/chores/assign", chore_id: id, target });
      await this._fetchChores();
    } catch (e) {
    }
  }

  // Only Family Hub members get a standing column - "those are the only ones that show up in the chore chart" (the household's own words).
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
    return `familyHubPersonFilter:chores:${path}`;
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

  _columns() {
    const memberIds = new Set(this._memberUsers().map((u) => u.id));
    const hasOutstandingChore = (userId) =>
      this._chores.some((c) => c.assigned_to === userId && c.status !== "approved");
    const cols = this._users
      .filter((u) => memberIds.has(u.id) || hasOutstandingChore(u.id))
      .map((u) => ({ id: u.id, name: u.name, color: this._userColor(u.id) }));
    cols.push({ id: CHORE_BIN_SENTINEL, name: "Chore Bin", color: "#c9c2b3" });
    return cols;
  }

  // A recurring chore doesn't just sit in its assignee's column once it's done - it moves HERE instead, into a dedicated always-visible column
  _isWaitingToRecur(chore) {
    return chore.status === "approved" && !!(chore.recur_type || chore.auto_create_trigger);
  }
  // A one-off approved chore stays visible (in the per-column Completed accordion
  _choreApprovedWithinDays(chore, days) {
    if (!chore.approved_at) return false;
    const at = new Date(chore.approved_at).getTime();
    if (Number.isNaN(at)) return false;
    return Date.now() - at <= days * 24 * 60 * 60 * 1000;
  }
  _completedChoresAccordionHtml(colId, completedItems) {
    if (!completedItems.length) return "";
    const open = this._openCompletedSections.has(colId);
    // Most-recently-approved first - the opposite of the main column's due-date ordering, since there's no "what's next" question here
    const sorted = completedItems
      .slice()
      .sort((a, b) => new Date(b.approved_at || 0).getTime() - new Date(a.approved_at || 0).getTime());
    const body = open
      ? `<div class="completed-chores-body">${sorted.map((c) => this._choreCardHtml(c)).join("")}</div>`
      : "";
    return `
      <div class="completed-chores-row">
        <div class="completed-chores-header" data-col="${colId}">
          <span class="routine-toggle-icon">${open ? "&#9662;" : "&#9656;"}</span>
          <span class="completed-chores-title">${this._t("chores.completed", "Completed")}</span>
          <span class="routine-row-badge">${completedItems.length}</span>
        </div>
        ${body}
      </div>
    `;
  }
  _toggleCompletedSection(colId) {
    if (this._openCompletedSections.has(colId)) this._openCompletedSections.delete(colId);
    else this._openCompletedSections.add(colId);
    this._render();
  }
  // recur_month_nth (1-4 or -1 for "last") + recur_weekdays (one or more weekdays
  _recurMonthlyNthLabel(chore) {
    const ORDINALS = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", "-1": "last" };
    const days = ((chore && chore.recur_weekdays) || []).slice().sort((a, b) => a - b);
    const nth = chore && chore.recur_month_nth;
    if (!days.length || nth === null || nth === undefined) return "";
    const ord = this._t(`chores.ordinal_${nth}`, ORDINALS[nth] || `${nth}th`);
    if (days.length === 2 && days[0] === 5 && days[1] === 6) return this._t("chores.the_x_weekend", `The ${ord} weekend`, { x: ord });
    const dayList = days.map((d) => this._weekdayLabel(d)).join("/");
    return this._t("chores.the_x_y", `The ${ord} ${dayList}`, { x: ord, y: dayList });
  }
  _recurDescriptionHtml(chore) {
    const parts = [];
    if (chore.recur_type === "interval") {
      // recur_interval_ unit (missing on any chore saved before this existed) defaults to "days"
      const n = chore.recur_interval_days || 1;
      const unit = chore.recur_interval_unit || "days";
      if (unit === "days" && n === 2) {
        parts.push(this._t("chores.every_other_day", "Every other day"));
      } else {
        const unitLabel = unit === "weeks" ? "week" : unit === "months" ? "month" : "day";
        const unitKey = unit === "weeks" ? "chores.weeks" : unit === "months" ? "chores.months" : "chores.days";
        const unitFallback = `${unitLabel}${n === 1 ? "" : "s"}`;
        parts.push(this._t("chores.every_n_unit", `Every ${n} ${unitFallback}`, { n: String(n), unit: this._t(unitKey, unitFallback) }));
      }
    } else if (chore.recur_type === "weekdays") {
      const days = (chore.recur_weekdays || []).map((d) => this._weekdayLabel(d)).join(", ");
      if (days) parts.push(this._t("chores.on_x", `On ${days}`, { x: days }));
    } else if (chore.recur_type === "monthly_nth") {
      const label = this._recurMonthlyNthLabel(chore);
      if (label) parts.push(label);
    }
    if (chore.auto_create_trigger) parts.push(this._t("chores.an_automation_trigger", "an automation trigger"));
    const schedule = parts.length ? parts.join(` ${this._t("chores.plus_join", "+")} `) : this._t("chores.waiting", "Waiting");
    // recur_next_due only ever exists for a plain-schedule (recur_type) chore - a purely sensor-triggered one has no predictable date
    const nextDateStr = chore.recur_next_due ? this._fmtDate(new Date(chore.recur_next_due)) : "";
    const next = chore.recur_next_due
      ? this._t("chores.next_x", `Next: ${nextDateStr}`, { x: nextDateStr })
      : (chore.auto_create_trigger ? this._t("chores.waiting_for_trigger", "Waiting for the trigger to fire") : "");
    return `${this._esc(schedule)}${next ? ` &middot; ${this._esc(next)}` : ""}`;
  }
  _waitingToRecurCardHtml(chore) {
    return `
      <div class="chore-card status-approved waiting-recur-card" data-id="${chore.id}">
        <div class="chore-title">${this._esc(chore.title)}</div>
        <div class="chore-meta">
          <span class="chore-stars">&#11088; ${chore.star_value || 0}</span>
        </div>
        <div class="waiting-recur-desc">${this._recurDescriptionHtml(chore)}</div>
        <div class="waiting-recur-owner">${this._t("chores.last_done_by_x", `Last done by ${this._esc(this._userName(chore.assigned_to))}`, { x: this._esc(this._userName(chore.assigned_to)) })}</div>
      </div>
    `;
  }
  // (v1.168.65: the old per-device "collapse Waiting to Recur to a header button" flag - localStorage familyHubChoresWaitingToRecurBar
  _compactViewEnabled() {
    try {
      return window.localStorage.getItem("familyHubChoresCompactView") === "on";
    } catch (e) {
      return false;
    }
  }
  _toggleCompactView() {
    const next = !this._compactViewEnabled();
    try {
      window.localStorage.setItem("familyHubChoresCompactView", next ? "on" : "off");
    } catch (e) {
      // no-op - this device just won't remember the choice across reloads
    }
    this._render();
  }
  // -- 📅 Schedule view (v1.168.89) ------------------------------------------
  // An overview of when every chore is due: This week, Next week or a Month, with repeating chores projected ahead by the backend
  // (family_hub/chores/schedule -> chore_engine.project_schedule). Swaps out the board while it's on; remembered per device like compact view.
  _scheduleViewEnabled() {
    try {
      return window.localStorage.getItem("familyHubChoresScheduleView") === "on";
    } catch (e) {
      return !!this._scheduleViewFallback;
    }
  }
  _toggleScheduleView() {
    const next = !this._scheduleViewEnabled();
    this._scheduleViewFallback = next;
    try {
      window.localStorage.setItem("familyHubChoresScheduleView", next ? "on" : "off");
    } catch (e) {
      // no-op - remembered for this page only
    }
    this._render();
  }
  _schedState() {
    if (!this._sched) this._sched = { mode: "week", offset: 0, data: null, dataKey: "", key: "", loading: false, error: false, selected: "" };
    return this._sched;
  }
  // The signed-in person's "First day of the week" from their Home Assistant profile (0 = Sunday ... 6 = Saturday), same as the calendar card
  _firstWeekday() {
    const loc = this._hass && this._hass.locale;
    const setting = loc && loc.first_weekday;
    const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    if (setting && names.includes(setting)) return names.indexOf(setting);
    if (!setting) return 0;
    try {
      const lang = (loc && loc.language) || (this._hass && this._hass.language);
      if (lang && typeof Intl !== "undefined" && Intl.Locale) {
        const l = new Intl.Locale(lang);
        const info = typeof l.getWeekInfo === "function" ? l.getWeekInfo() : l.weekInfo;
        if (info && info.firstDay) return info.firstDay % 7;
      }
    } catch (e) {
      // fall through to Sunday
    }
    return 0;
  }
  _startOfWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() - this._firstWeekday() + 7) % 7));
    return d;
  }
  _schedDayKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  // {start, end} to fetch (end exclusive) plus, for a month, the month itself - the month grid shows whole weeks around it
  _scheduleRange() {
    const s = this._schedState();
    const now = this._schedNow ? new Date(this._schedNow) : new Date();
    if (s.mode === "month") {
      const monthStart = new Date(now.getFullYear(), now.getMonth() + s.offset, 1);
      const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
      const start = this._startOfWeek(monthStart);
      const lastDay = new Date(monthEnd);
      lastDay.setDate(lastDay.getDate() - 1);
      const end = this._startOfWeek(lastDay);
      end.setDate(end.getDate() + 7);
      return { start, end, monthStart, monthEnd };
    }
    const start = this._startOfWeek(now);
    start.setDate(start.getDate() + 7 * s.offset);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }
  async _fetchSchedule() {
    if (!this._hass || !this._hass.connection || !this._scheduleViewEnabled()) return;
    const s = this._schedState();
    const r = this._scheduleRange();
    const key = `${r.start.toISOString()}|${r.end.toISOString()}`;
    s.key = key;
    s.loading = true;
    try {
      const res = await this._hass.connection.sendMessagePromise({ type: "family_hub/chores/schedule", start: r.start.toISOString(), end: r.end.toISOString() });
      if (s.key !== key) return; // moved on to another week while this was loading
      s.data = { items: (res && Array.isArray(res.items)) ? res.items : [], undated: (res && Array.isArray(res.undated)) ? res.undated : [] };
      s.error = false;
    } catch (e) {
      if (s.key !== key) return;
      s.data = null;
      s.error = true;
    }
    s.dataKey = key;
    s.loading = false;
    this._render();
  }
  _onScheduleClick(e) {
    const s = this._schedState();
    const tab = e.target.closest("[data-sched-tab]");
    if (tab) {
      const t = tab.dataset.schedTab;
      s.mode = t === "month" ? "month" : "week";
      s.offset = t === "next" ? 1 : 0;
      s.selected = "";
      this._render();
      return true;
    }
    const step = e.target.closest("[data-sched-step]");
    if (step) {
      s.offset += Number(step.dataset.schedStep) || 0;
      s.selected = "";
      this._render();
      return true;
    }
    const item = e.target.closest("[data-sched-chore]");
    if (item) {
      if (this._chores.some((c) => c.id === item.dataset.schedChore)) this._openChoreDetailModal(item.dataset.schedChore);
      return true;
    }
    const day = e.target.closest("[data-sched-day]");
    if (day) {
      s.selected = day.dataset.schedDay;
      this._render();
      return true;
    }
    return false;
  }
  // allowedIds: the columns shown (person pills / the card's people setting), or null for everyone
  _scheduleHtml(allowedIds) {
    const s = this._schedState();
    const r = this._scheduleRange();
    const key = `${r.start.toISOString()}|${r.end.toISOString()}`;
    if (s.dataKey !== key && !(s.loading && s.key === key)) this._fetchSchedule();
    const allowed = allowedIds ? new Set(allowedIds) : null;
    const keep = (x) => !allowed || allowed.has(x.assigned_to);
    const fresh = s.dataKey === key && s.data;
    const items = fresh ? s.data.items.filter(keep) : [];
    const undated = fresh ? s.data.undated.filter(keep) : [];
    const todayKey = this._schedDayKey(this._schedNow ? new Date(this._schedNow) : new Date());

    const tabActive = (t) => (t === "month" ? s.mode === "month" : s.mode === "week" && s.offset === (t === "next" ? 1 : 0));
    const tabs = [["this", this._t("chores.schedule_this_week", "This week")], ["next", this._t("chores.schedule_next_week", "Next week")], ["month", this._t("chores.schedule_month", "Month")]]
      .map(([t, label]) => `<button type="button" class="sched-tab${tabActive(t) ? " active" : ""}" data-sched-tab="${t}">${this._esc(label)}</button>`).join("");
    let rangeLabel;
    if (s.mode === "month") {
      rangeLabel = this._fmtDate(r.monthStart, { month: "long", year: "numeric" });
    } else {
      const last = new Date(r.end);
      last.setDate(last.getDate() - 1);
      rangeLabel = `${this._fmtDate(r.start, { month: "short", day: "numeric" })} – ${this._fmtDate(last, { month: "short", day: "numeric" })}`;
    }
    const bar = `
      <div class="sched-bar">
        <div class="sched-tabs">${tabs}</div>
        <div class="sched-nav">
          <button type="button" class="sched-step" data-sched-step="-1" aria-label="${this._escAttr(this._t("chores.schedule_previous", "Previous"))}">&#8249;</button>
          <span class="sched-range">${this._esc(rangeLabel)}</span>
          <button type="button" class="sched-step" data-sched-step="1" aria-label="${this._escAttr(this._t("chores.schedule_next", "Next"))}">&#8250;</button>
        </div>
      </div>`;
    if (!fresh) {
      const msg = s.error && s.dataKey === key ? this._t("chores.schedule_error", "Couldn't load the schedule.") : this._t("chores.schedule_loading", "Loading…");
      return `<div class="sched">${bar}<div class="sched-note">${this._esc(msg)}</div></div>`;
    }

    // the month's own items only, for the summary (the grid's spill-over days belong to the months either side)
    const inSummary = s.mode === "month"
      ? items.filter((i) => { const d = new Date(i.due); return d >= r.monthStart && d < r.monthEnd; })
      : items;
    const count = (st) => inSummary.filter((i) => i.status === st).length;
    const todo = inSummary.filter((i) => i.status !== "done");
    const stars = todo.reduce((n, i) => n + (Number(i.star_value) || 0), 0);
    const parts = [this._t("chores.schedule_summary_due", `${todo.length} to do`, { n: String(todo.length) })];
    if (count("overdue")) parts.push(`<span class="sched-sum-overdue">${this._esc(this._t("chores.schedule_summary_overdue", `${count("overdue")} overdue`, { n: String(count("overdue")) }))}</span>`);
    if (count("waiting")) parts.push(this._esc(this._t("chores.schedule_summary_waiting", `${count("waiting")} waiting for approval`, { n: String(count("waiting")) })));
    if (count("done")) parts.push(this._esc(this._t("chores.schedule_summary_done", `${count("done")} done`, { n: String(count("done")) })));
    if (this._config.show_stars !== false && stars) parts.push(this._esc(this._t("chores.schedule_summary_stars", `${stars} ⭐ to earn`, { n: String(stars) })));
    const summary = `<div class="sched-summary">${parts.join(" · ")}</div>`;

    const byDay = new Map();
    items.forEach((i) => {
      const k = this._schedDayKey(new Date(i.due));
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(i);
    });

    let body;
    if (s.mode === "month") {
      const cells = [];
      for (let d = new Date(r.start); d < r.end; d.setDate(d.getDate() + 1)) {
        const k = this._schedDayKey(d);
        const list = byDay.get(k) || [];
        const outside = d < r.monthStart || d >= r.monthEnd;
        const shown = list.slice(0, 3).map((i) => `<span class="sched-chip sched-${i.status}${i.projected ? " projected" : ""}"><span class="sched-dot" style="background:${this._userColor(i.assigned_to)}"></span>${this._esc(i.title)}</span>`).join("");
        const more = list.length > 3 ? `<span class="sched-more">${this._esc(this._t("chores.schedule_more", `+${list.length - 3} more`, { n: String(list.length - 3) }))}</span>` : "";
        const flags = [outside ? " outside" : "", k === todayKey ? " today" : "", k === s.selected ? " selected" : "", list.some((i) => i.status === "overdue") ? " has-overdue" : ""].join("");
        cells.push(`<button type="button" class="sched-cell${flags}" data-sched-day="${k}"><span class="sched-cell-num">${d.getDate()}</span>${shown}${more}${list.length ? `<span class="sched-count">${list.length}</span>` : ""}</button>`);
      }
      const heads = [];
      const h = new Date(r.start);
      for (let i = 0; i < 7; i++) {
        heads.push(`<div class="sched-head">${this._esc(this._fmtDate(h, { weekday: "short" }))}</div>`);
        h.setDate(h.getDate() + 1);
      }
      let selKey = s.selected;
      if (!selKey) {
        const today = this._schedNow ? new Date(this._schedNow) : new Date();
        selKey = today >= r.monthStart && today < r.monthEnd ? todayKey : this._schedDayKey(r.monthStart);
      }
      const [y, m, dd] = selKey.split("-").map(Number);
      body = `<div class="sched-month">${heads.join("")}${cells.join("")}</div>${this._schedDayHtml(new Date(y, m - 1, dd), byDay.get(selKey) || [], todayKey)}`;
    } else {
      const days = [];
      for (let d = new Date(r.start); d < r.end; d.setDate(d.getDate() + 1)) {
        days.push(this._schedDayHtml(new Date(d), byDay.get(this._schedDayKey(d)) || [], todayKey));
      }
      body = `<div class="sched-week">${days.join("")}</div>`;
    }
    const empty = !items.length && !undated.length
      ? `<div class="sched-note">${this._esc(this._t("chores.schedule_empty", "No chores are due here. Give a chore a due date (and a repeat) to see it on the schedule."))}</div>`
      : "";
    const legend = items.some((i) => i.projected) ? `<div class="sched-legend">${this._esc(this._t("chores.schedule_legend", "Faded ones are repeats still to come, if each one is done on time."))}</div>` : "";
    const undatedHtml = undated.length
      ? `<div class="sched-day sched-undated"><div class="sched-day-head">${this._esc(this._t("chores.schedule_no_due_date", "No due date"))}</div>${undated.map((i) => this._schedItemHtml(i, false)).join("")}</div>`
      : "";
    return `<div class="sched">${bar}${summary}${empty}${body}${legend}${undatedHtml}</div>`;
  }
  _schedDayHtml(date, list, todayKey) {
    const k = this._schedDayKey(date);
    const isToday = k === todayKey;
    const label = this._fmtDate(date, { weekday: "long", month: "short", day: "numeric" });
    const rows = list.length
      ? list.map((i) => this._schedItemHtml(i, true)).join("")
      : `<div class="sched-none">${this._esc(this._t("chores.schedule_nothing_due", "Nothing due"))}</div>`;
    return `<div class="sched-day${isToday ? " today" : ""}${list.length ? "" : " empty"}" data-day="${k}">
        <div class="sched-day-head">${isToday ? `<span class="sched-today-tag">${this._esc(this._t("chores.schedule_today", "Today"))}</span> ` : ""}${this._esc(label)}</div>
        ${rows}
      </div>`;
  }
  _schedItemHtml(i, withTime) {
    const d = withTime && i.due ? new Date(i.due) : null;
    const time = d && (d.getHours() !== 0 || d.getMinutes() !== 0) ? this._fmtTimeOfDay(d) : "";
    const who = i.assigned_to === CHORE_BIN_SENTINEL ? this._t("chores.schedule_chore_bin", "Chore Bin") : this._userName(i.assigned_to);
    const badge = i.status === "overdue" ? this._t("chores.schedule_overdue", "Overdue")
      : i.status === "waiting" ? this._t("chores.schedule_waiting", "Waiting for approval")
      : i.status === "done" ? `✓ ${this._t("chores.schedule_done", "Done")}` : "";
    const title = i.projected ? ` title="${this._escAttr(this._t("chores.schedule_projected_title", "A repeat still to come, if the one before is done on time"))}"` : "";
    return `<button type="button" class="sched-item sched-${this._escAttr(i.status)}${i.projected ? " projected" : ""}" data-sched-chore="${this._escAttr(i.chore_id)}"${title}>
        <span class="sched-dot" style="background:${this._userColor(i.assigned_to)}"></span>
        ${time ? `<span class="sched-time">${this._esc(time)}</span>` : ""}
        <span class="sched-title">${i.important ? "&#10071; " : ""}${this._esc(i.title)}</span>
        <span class="sched-who">${this._esc(who)}${i.rotation ? ` <span class="sched-rot" title="${this._escAttr(this._t("chores.schedule_takes_turns", "Takes turns"))}">&#8635;</span>` : ""}</span>
        ${this._config.show_stars !== false && i.star_value ? `<span class="sched-stars">&#11088; ${Number(i.star_value) || 0}</span>` : ""}
        ${badge ? `<span class="sched-badge">${this._esc(badge)}</span>` : ""}
      </button>`;
  }
  _waitingToRecurColumnHtml() {
    const waiting = this._chores.filter((c) => this._isWaitingToRecur(c));
    const body = waiting.length
      ? waiting.map((c) => this._waitingToRecurCardHtml(c)).join("")
      : `<div class="chore-col-empty">${this._t("chores.nothing_waiting_to_recur", "Nothing waiting to recur right now")}</div>`;
    return `
      <div class="chore-column waiting-recur-column" data-col-id="waiting_to_recur">
        <div class="chore-col-header" style="border-color:#8fa7b3">
          <span class="chore-col-dot" style="background:#8fa7b3"></span>
          <span>&#8635; ${this._t("chores.waiting_to_recur_col", "Waiting to Recur")}</span>
          <span class="chore-col-count">${waiting.length}</span>
        </div>
        <div class="waiting-recur-col-body">${body}</div>
      </div>
    `;
  }

  // Embedded mini Rewards card - balance per member plus the full browsable/claimable catalog
  _rewardsBalanceRowHtml(user) {
    const bal = this._balances[user.id] || 0;
    return `
      <div class="rewards-balance-row" style="border-color:${this._userColor(user.id)}">
        <span class="rewards-balance-dot" style="background:${this._userColor(user.id)}"></span>
        <span class="rewards-balance-name">${this._esc(user.name)}</span>
        <span class="rewards-balance-stars">&#11088; ${bal}</span>
      </div>
    `;
  }
  // Mirrors family-hub-rewards-card.js's own _catalogAccentStyle - a
  // malformed/missing color just falls back to no inline style at all.
  _rewardsCatalogAccentStyle(item) {
    const color = item && item.color;
    if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color)) return "";
    return ` style="border: 2px solid ${color}; background: ${color}22;"`;
  }
  _rewardsCatalogItemHtml(item) {
    const myBalance = this._balances[this._myUserId()] || 0;
    const affordable = myBalance >= (item.cost_stars || 0);
    return `
      <div class="rewards-catalog-item" data-id="${item.id}"${this._rewardsCatalogAccentStyle(item)}>
        <span class="rewards-catalog-icon">${item.icon || "&#127873;"}</span>
        <span class="rewards-catalog-item-title">${this._esc(item.title)}</span>
        <span class="rewards-catalog-cost">&#11088; ${item.cost_stars}</span>
        <button type="button" class="rewards-claim-btn" data-id="${item.id}" ${affordable ? "" : "disabled"}>${this._t("chores.claim", "Claim")}</button>
        <div class="rewards-claim-status"></div>
      </div>
    `;
  }
  _rewardsColumnHtml() {
    const memberUsers = this._memberUsers();
    const balances = memberUsers.length
      ? memberUsers.map((u) => this._rewardsBalanceRowHtml(u)).join("")
      : `<div class="chore-col-empty">${this._t("chores.no_one_added_yet", "No one's been added to Family Hub yet")}</div>`;
    const catalog = this._catalog.length
      ? this._catalog.map((it) => this._rewardsCatalogItemHtml(it)).join("")
      : `<div class="chore-col-empty">${this._t("chores.no_rewards_yet", "No rewards in the catalog yet")}</div>`;
    return `
      <div class="chore-column rewards-column" data-col-id="rewards">
        <div class="chore-col-header" style="border-color:#f4c95d">
          <span class="chore-col-dot" style="background:#f4c95d"></span>
          <span>&#11088; ${this._t("chores.rewards_col", "Rewards")}</span>
        </div>
        <div class="rewards-col-body">
          <div class="rewards-balances">${balances}</div>
          <div class="rewards-catalog-title">${this._t("chores.reward_catalog", "Reward catalog")}</div>
          <div class="rewards-catalog">${catalog}</div>
        </div>
      </div>
    `;
  }

  // -- Routines: per-person Morning/Afternoon/Night daily checklists
  _jsDayToBackendDay(jsDay) {
    return (jsDay + 6) % 7;
  }
  _todayBackendWeekday() {
    return this._jsDayToBackendDay(new Date().getDay());
  }
  _routineItemAppliesToday(item) {
    return !item.days_of_week || !item.days_of_week.length || item.days_of_week.includes(this._todayBackendWeekday());
  }
  _routineItemsFor(userId, category) {
    return this._routineItems
      .filter((it) => it.user_id === userId && it.category === category && this._routineItemAppliesToday(it))
      .sort((a, b) => this._routineSortCompare(a, b));
  }
  // Unfiltered by day - powers the manage list in the Routine tab
  _routineItemsForManage(userId, category) {
    return this._routineItems
      .filter((it) => it.user_id === userId && it.category === category)
      .sort((a, b) => this._routineSortCompare(a, b));
  }
  _formatDueTime(hhmm) {
    const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${period}`;
  }
  // Minutes since midnight, for
  // comparing two due_time strings numerically.
  _routineDueTimeMinutes(hhmm) {
    const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
    return h * 60 + m;
  }
  // The comparator both _routineItemsFor (board) and _routineItemsForManage (the Routine tab's manage list
  _routineSortCompare(a, b) {
    const aManual = a.sort_order !== null && a.sort_order !== undefined;
    const bManual = b.sort_order !== null && b.sort_order !== undefined;
    if (aManual && bManual) return a.sort_order - b.sort_order;
    if (aManual !== bManual) return aManual ? -1 : 1;
    const aTime = a.due_time ? this._routineDueTimeMinutes(a.due_time) : null;
    const bTime = b.due_time ? this._routineDueTimeMinutes(b.due_time) : null;
    if (aTime !== null && bTime !== null) return aTime - bTime;
    if (aTime !== null) return -1;
    if (bTime !== null) return 1;
    return 0;
  }
  _isRoutineItemOverdue(item) {
    if (item.done || !item.due_time) return false;
    const [h, m] = item.due_time.split(":").map((n) => parseInt(n, 10));
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() > h * 60 + m;
  }
  _routineItemCardHtml(item) {
    const overdue = this._isRoutineItemOverdue(item);
    const dueBadge = item.due_time ? `<span class="routine-item-due ${overdue ? "overdue" : ""}">${overdue ? "&#9888; " : ""}${this._esc(this._formatDueTime(item.due_time))}</span>` : "";
    const daysBadge = item.days_of_week && item.days_of_week.length ? `<span class="routine-item-days">${item.days_of_week.map((d) => this._weekdayLabel(d)).join(" ")}</span>` : "";
    // stars for completing a routine item (routine_engine.py's star_value/no_approval_required) - most items still show nothing here
    const starsBadge = item.star_value
      ? `<span class="routine-item-stars">&#11088; ${item.star_value}${item.pending_approval ? ` - ${this._t("chores.awaiting_approval", "awaiting approval")}` : ""}</span>`
      : "";
    const meta = dueBadge || daysBadge || starsBadge ? `<div class="routine-item-meta">${dueBadge}${daysBadge}${starsBadge}</div>` : "";
    // Editing/removing an item is an admin/assign-permission action
    const approveBtn = item.pending_approval && this._canVerify()
      ? `<button type="button" class="routine-item-approve" data-id="${item.id}" title="${this._t("chores.approve_stars_title", "Approve stars")}">${this._t("chores.approve", "Approve")}</button>`
      : "";
    const actions = this._canManageRoutinesFor(item.user_id)
      ? `
        ${approveBtn}
        <button type="button" class="routine-item-edit" data-id="${item.id}" title="${this._t("common.edit", "Edit")}">&#9998;</button>
        <button type="button" class="routine-item-delete" data-id="${item.id}" title="${this._t("chores.remove", "Remove")}">&times;</button>
      `
      : approveBtn;
    return `
      <div class="routine-item-card ${item.done ? "done" : ""}" data-id="${item.id}">
        <input type="checkbox" class="routine-item-check" data-id="${item.id}" ${item.done ? "checked" : ""}>
        <div class="routine-item-body">
          <div class="routine-item-title">${this._esc(item.title)}</div>
          ${meta}
        </div>
        <div class="routine-item-actions">${actions}</div>
      </div>
    `;
  }
  _routineRowHtml(userId, category) {
    const items = this._routineItemsFor(userId, category);
    const done = items.filter((it) => it.done).length;
    const key = `${userId}:${category}`;
    const open = this._openRoutineSections.has(key);
    let body = "";
    if (open) {
      // Splitting into Active/Completed sub-lists (rather than one flat list with strikethrough) matches the household's own mockup for this
      const active = items.filter((it) => !it.done);
      const completed = items.filter((it) => it.done);
      body = `
        <div class="routine-row-body">
          ${active.length ? `<div class="routine-section-label">${this._t("chores.active", "Active")}</div>${active.map((it) => this._routineItemCardHtml(it)).join("")}` : ""}
          ${completed.length ? `<div class="routine-section-label">${this._t("chores.completed", "Completed")}</div>${completed.map((it) => this._routineItemCardHtml(it)).join("")}` : ""}
          ${items.length ? "" : `<div class="routine-row-empty">${this._t("chores.routine_row_empty", "Nothing on today's list") + (this._canManageRoutinesFor(userId) ? this._t("chores.routine_row_empty_manage_suffix", " - manage items from the + button") : "")}</div>`}
        </div>
      `;
    }
    return `
      <div class="routine-row">
        <div class="routine-row-header" data-user="${userId}" data-category="${category}">
          <span class="routine-toggle-icon">${open ? "&#9662;" : "&#9656;"}</span>
          <span class="routine-row-title">${this._routineCategoryLabel(category)}</span>
          <span class="routine-row-badge">${done}/${items.length}</span>
        </div>
        ${body}
      </div>
    `;
  }
  _routinesBlockHtml(userId) {
    if (!this._routinesEnabled()) return "";
    return `<div class="routines-block">${ROUTINE_CATEGORIES.map((cat) => this._routineRowHtml(userId, cat)).join("")}</div>`;
  }
  // a compact per-person Goals block, only ever rendered when goalsShowInChores is on (see _goalsInChoresEnabled).
  _goalsBlockHtml(userId) {
    if (!this._goalsInChoresEnabled()) return "";
    // archived goals (the household hit "Complete" on them, see _archiveGoal/goal-complete-btn below) are deliberately left out of this embedded
    const goals = this._goals.filter((g) => g.assigned_to === userId && g.status !== GOAL_STATUS_ARCHIVED);
    if (!goals.length) return "";
    const sorted = goals.slice().sort((a, b) => {
      const rank = (g) => (g.status === GOAL_STATUS_PENDING_VERIFICATION ? 0 : g.status === GOAL_STATUS_OPEN ? 1 : 2);
      return rank(a) - rank(b) || String(a.created_at).localeCompare(String(b.created_at));
    });
    return `<div class="goals-block">${sorted.map((g) => this._goalItemHtml(g)).join("")}</div>`;
  }
  _goalItemHtml(goal) {
    const target = Math.max(1, goal.target_count || 1);
    const current = Math.min(target, goal.current_count || 0);
    const canLog = goal.status === GOAL_STATUS_OPEN && this._canLogGoalProgress(goal);
    const progressLabel = target > 1 ? `${current} / ${target}` : (current >= target ? this._t("chores.done", "Done") : this._t("chores.not_yet_done", "Not yet done"));
    let actions = "";
    if (canLog) actions += `<button type="button" class="goal-log-btn" data-id="${goal.id}">${target > 1 ? this._t("chores.log", "Log") : this._t("chores.mark_done", "Mark done")}</button>`;
    if (goal.status === GOAL_STATUS_PENDING_VERIFICATION) {
      if (this._canVerify()) {
        actions += `<button type="button" class="goal-approve-btn" data-id="${goal.id}">${this._t("chores.approve", "Approve")}</button>`;
        actions += `<button type="button" class="goal-reject-btn" data-id="${goal.id}">${this._t("chores.send_back", "Send back")}</button>`;
      } else actions += `<span class="goal-pending-label">${this._t("chores.awaiting_approval", "Awaiting approval")}</span>`;
    } else if (goal.status === GOAL_STATUS_APPROVED) {
      actions += `<span class="goal-approved-label">&#10003; ${this._t("chores.achieved", "Achieved")}</span>`;
      // Achieved goals had no way to complete/hide them from this embedded block either (only the standalone Goals card had this)
      if (goal.assigned_to === this._myUserId() || this._canAssign()) {
        actions += `<button type="button" class="goal-complete-btn" data-id="${goal.id}">${this._t("chores.complete", "Complete")}</button>`;
      }
    }
    return `
      <div class="goal-item status-${goal.status}" data-id="${goal.id}">
        <span class="goal-item-icon">&#127942;</span>
        <div class="goal-item-body">
          <div class="goal-item-title">${this._esc(goal.title)}</div>
          <div class="goal-item-progress">${progressLabel}</div>
        </div>
        <div class="goal-item-actions">${actions}</div>
      </div>
    `;
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
  // same window.prompt() -> modal conversion as chore _reject above - see that method's own comment.
  _rejectGoal(id) {
    this._openRejectModal(id, "goal");
  }
  // same family_hub/goals/archive ws command + no-reward-side- effects contract as family-hub-goals-card.js's own _archive
  async _archiveGoal(id) {
    try {
      await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/goals/archive", goal_id: id }));
      // Reuses the exact same choresConfettiOnComplete setting/_fireConfetti machinery chore completion already uses
      if (this._confettiOnCompleteEnabled()) this._fireConfetti();
    } catch (e) {
    }
    await this._fetchGoals();
  }
  async _toggleRoutineSection(userId, category) {
    const key = `${userId}:${category}`;
    if (this._openRoutineSections.has(key)) this._openRoutineSections.delete(key);
    else this._openRoutineSections.add(key);
    this._render();
  }
  // Unlike a chore (one tap = one celebration, even for a quantity chore's non-final units - see _complete's own comment)
  async _toggleRoutineItem(itemId, done) {
    const item = this._routineItems.find((it) => it.id === itemId);
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/routines/toggle", item_id: itemId, done: !!done });
      await this._fetchRoutines();
      if (done && item && this._confettiOnCompleteEnabled()) {
        const sectionItems = this._routineItemsFor(item.user_id, item.category);
        if (sectionItems.length && sectionItems.every((it) => it.done)) this._fireConfetti();
      }
    } catch (e) {
      // no-op - a failed toggle just leaves the item as the server last had it, next poll corrects the checkbox
    }
  }
  async _approveRoutineItem(itemId) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/routines/approve_item", item_id: itemId });
      await this._fetchRoutines();
    } catch (e) {
      // server already reports the reason via send_error; next poll/render corrects the board either way
    }
  }
  async _deleteRoutineItem(itemId) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/routines/delete", item_id: itemId });
      await this._fetchRoutines();
    } catch (e) {
    }
  }

  // Chore due dates are stored as a single ISO datetime (the Create/Edit modals both use a <input type="datetime-local">
  _formatChoreDueDisplay(dueDateIso) {
    if (!dueDateIso) return "";
    const d = new Date(dueDateIso);
    const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
    return hasTime ? this._fmtDateTime(d) : this._fmtDate(d);
  }
  _choreCardHtml(chore) {
    const status = chore.status;
    const isBin = chore.assigned_to === CHORE_BIN_SENTINEL;
    // Quantity-based chores ("3 loads of laundry") - quantity_total is only ever set on a chore created/edited with a count
    const hasQuantity = !!chore.quantity_total;
    const qtyRemaining = hasQuantity
      ? (chore.quantity_remaining == null ? chore.quantity_total : chore.quantity_remaining)
      : null;
    // timed chores ("clean for 30 minutes").
    const runningTimer = this._choreTimer(chore.id);
    const timerMinutes = Number(chore.timer_minutes) || 0;
    let actions = "";
    if (status === "open" && !isBin) {
      const doneLabel = hasQuantity ? this._t("chores.done_n_left", `Done (${qtyRemaining} left)`, { n: String(qtyRemaining) }) : this._t("chores.done", "Done");
      if (runningTimer) {
        actions += `<span class="chore-timer-live" title="${this._t("chores.time_left_title", "Time left - finishes by itself")}">&#9201; <span data-timer-uid="${runningTimer.uid}">${this._formatTimerRemaining(this._timerRemainingSeconds(runningTimer))}</span></span>`;
        actions += `<button class="chore-timer-cancel-btn" data-uid="${runningTimer.uid}" title="${this._t("chores.stop_timer_title", "Stop the timer")}">&#10005;</button>`;
      } else if (timerMinutes > 0) {
        actions += `<button class="chore-timer-start-btn" data-id="${chore.id}" title="${this._t("chores.start_timer_title", "Start the timer - this chore finishes itself when it runs out")}">&#9654; ${this._t("chores.start_n", `Start (${this._formatTimerLength(timerMinutes)})`, { n: this._formatTimerLength(timerMinutes) })}</button>`;
      }
      actions += `<button class="chore-done-btn" data-id="${chore.id}">${doneLabel}</button>`;
      if (!runningTimer) {
        actions += chore.in_progress
          ? `<button class="chore-in-progress-btn is-active" data-id="${chore.id}" data-next="0" title="${this._t("chores.in_progress_title", "Someone's working on this - tap to clear")}">&#9203; ${this._t("chores.in_progress", "In progress")}</button>`
          : `<button class="chore-in-progress-btn" data-id="${chore.id}" data-next="1" title="${this._t("chores.mark_in_progress_title", "Let the household know you're working on this")}">${this._t("chores.mark_in_progress", "Mark in progress")}</button>`;
      }
      actions += `<button class="chore-nudge-btn" data-id="${chore.id}" title="${this._t("chores.nudge", "Nudge")}">&#128276;</button>`;
    } else if (status === "open" && isBin) {
      // used to be gated to assignment_mode === "first_come_first_ served" only
      actions += `<button class="chore-claim-btn" data-id="${chore.id}">${this._t("chores.claim", "Claim")}</button>`;
    } else if (status === "pending_verification") {
      if (this._canVerify()) {
        actions += `<button class="chore-approve-btn" data-id="${chore.id}">${this._t("chores.approve", "Approve")}</button>`;
        actions += `<button class="chore-reject-btn" data-id="${chore.id}" title="${this._t("chores.send_back_title", "Send back - not approved")}">${this._t("chores.reject", "Reject")}</button>`;
      } else actions += `<span class="chore-pending-label">${this._t("chores.awaiting_approval", "Awaiting approval")}</span>`;
    } else if (status === "approved") {
      actions += `<span class="chore-approved-label">&#10003; ${this._t("chores.done", "Done")}</span>`;
    }
    // Editing (title/stars/due date/dependencies/triggers/rotation group) is only ever possible for an open chore
    if (status === "open" && this._canEditChore()) {
      actions += `<button class="chore-edit-btn" data-id="${chore.id}" title="${this._t("common.edit", "Edit")}">&#9998;</button>`;
    }
    const dueStr = this._formatChoreDueDisplay(chore.due_date);
    const due = dueStr ? `<span class="chore-due">${this._t("chores.due_x", `Due ${dueStr}`, { x: dueStr })}</span>` : "";
    const streak = chore.streak_count > 0 ? `<span class="chore-streak">&#128293; ${chore.streak_count}</span>` : "";
    const quantityBadge =
      hasQuantity && status === "open" ? `<span class="chore-quantity">${qtyRemaining}/${chore.quantity_total}</span>` : "";
    // a small "sent back" flag while this chore sits open again after chore_engine.reject_chore
    const sentBack = status === "open" && chore.rejected_by ? `<span class="chore-rejected-badge" title="${this._esc(chore.reject_reason || this._t("chores.send_back_title", "Sent back - not approved"))}">&#8617; ${this._t("chores.sent_back", "Sent back")}</span>` : "";
    // The "always go to the top" half lives in
    // _sortChoresForColumn; this is just the visual marker.
    const importantBadge = chore.important ? `<span class="chore-important-badge" title="${this._t("chores.important", "Important")}">&#10071;</span>` : "";
    return `
      <div class="chore-card status-${status}${chore.important ? " chore-important" : ""}" draggable="${this._canAssign() && status === "open" ? "true" : "false"}" data-id="${chore.id}">
        <div class="chore-title">${importantBadge}${this._esc(chore.title)}</div>
        ${chore.star_request ? `<div class="chore-star-request-badge">&#11088; ${this._esc(this._t("chores.star_request", "Star request"))}${chore.notes ? ` - ${this._esc(chore.notes)}` : ""}</div>` : ""}
        <div class="chore-meta">
          <span class="chore-stars">&#11088; ${chore.star_value || 0}</span>
          ${due}
          ${streak}
          ${quantityBadge}
        </div>
        ${sentBack}
        <div class="chore-actions">${actions}</div>
      </div>
    `;
  }

  // -- Chore detail modal (kanban-card "click for more info") --- Read-only info view
  _statusLabel(chore) {
    if (this._isWaitingToRecur(chore)) return this._t("chores.waiting_to_recur", "Waiting to recur");
    switch (chore.status) {
      case "open":
        return chore.assigned_to === CHORE_BIN_SENTINEL ? this._t("chores.in_chore_bin", "In the Chore Bin") : this._t("chores.open", "Open");
      case "pending_verification":
        return this._t("chores.awaiting_approval", "Awaiting approval");
      case "approved":
        return this._t("chores.done", "Done");
      default:
        return chore.status || "";
    }
  }
  _openChoreDetailModal(choreId) {
    const chore = this._chores.find((c) => c.id === choreId);
    if (!chore) return;
    const overlay = this._root.querySelector(".detail-modal");
    const box = overlay.querySelector(".modal-box");
    const assigneeName = this._userName(chore.assigned_to);
    const assigneeColor = this._userColor(chore.assigned_to);
    const due = this._formatChoreDueDisplay(chore.due_date);
    const recurHtml = chore.recur_type || chore.auto_create_trigger ? this._recurDescriptionHtml(chore) : "";
    const deps = (chore.dependencies || []).map((depId) => {
      const dep = this._chores.find((c) => c.id === depId);
      const met = dep && dep.status === "approved";
      return `<span class="detail-dep ${met ? "met" : ""}">${this._esc(dep ? dep.title : depId)}${met ? " &#10003;" : ""}</span>`;
    });
    const notes = (chore.notes || "").trim();
    box.innerHTML = `
      <div class="detail-header">
        <span class="detail-status-badge">${this._esc(this._statusLabel(chore))}</span>
        <button data-fh-title="text.close" type="button" class="detail-close-btn" title="${__fhT("text.close", "Close", null, "h")}">&#10005;</button>
      </div>
      <h3 class="detail-title">${this._esc(chore.title)}</h3>
      <div class="detail-row">
        <span class="detail-assignee-dot" style="background:${assigneeColor}"></span>
        <span>${this._esc(assigneeName)}</span>
      </div>
      <div class="detail-stats">
        <span class="detail-stat">&#11088; ${chore.star_value || 0} star${chore.star_value === 1 ? "" : "s"}</span>
        ${due ? `<span class="detail-stat">${__fhT("text.due_x", "📅 Due %0%", {0: this._esc(due)}, "h")}</span>` : ""}
        ${chore.overdue_penalty ? `<span class="detail-stat">${__fhT("text.x_if_overdue", "⚠ -%0% if overdue", {0: chore.overdue_penalty}, "h")}</span>` : ""}
        ${chore.streak_count > 0 ? `<span class="detail-stat">&#128293; ${chore.streak_count} streak</span>` : ""}
        ${chore.quantity_total ? `<span class="detail-stat">&#128203; ${chore.quantity_remaining == null ? chore.quantity_total : chore.quantity_remaining}/${chore.quantity_total} left</span>` : ""}
      </div>
      ${recurHtml ? `<div class="detail-recur">${__fhT("text.recurs_x", "🔄 Recurs: %0%", {0: recurHtml}, "h")}</div>` : ""}
      ${deps.length ? `<div data-fh-t="text.waiting_on" class="detail-section-label">${__fhT("text.waiting_on", "Waiting on", null, "h")}</div><div class="detail-deps">${deps.join("")}</div>` : ""}
      ${
        // full feedback for a chore currently sitting in its reject_chore redo window - see const.py's CHORE_KEY_REJECT_REASON docstring.
        chore.status === "open" && chore.rejected_by
          ? `<div data-fh-t="text.sent_back" class="detail-section-label">${__fhT("text.sent_back", "Sent back", null, "h")}</div><div class="detail-rejected-note">${chore.reject_reason ? this._esc(chore.reject_reason) : __fhT("text.no_reason_given", "No reason given.", null, "h")}</div>`
          : ""
      }
      <div data-fh-t="text.notes" class="detail-section-label">${__fhT("text.notes", "Notes", null, "h")}</div>
      <div class="detail-notes ${notes ? "" : "empty"}">${notes ? this._esc(notes) : __fhT("text.no_notes_added", "No notes added.", null, "h")}</div>
      <div class="modal-actions">
        ${chore.status === "open" && this._canEditChore() ? `<button data-fh-t="text.edit" type="button" class="detail-edit-btn">${__fhT("text.edit", "Edit", null, "h")}</button>` : ""}
        ${this._isAdmin() ? `<button data-fh-t="text.delete" type="button" class="detail-delete-btn">${__fhT("text.delete", "Delete", null, "h")}</button>` : ""}
        <button data-fh-t="text.close" type="button" class="detail-close-btn-2">${__fhT("text.close", "Close", null, "h")}</button>
      </div>
    `;
    const close = () => overlay.classList.remove("open");
    box.querySelector(".detail-close-btn").addEventListener("click", close);
    box.querySelector(".detail-close-btn-2").addEventListener("click", close);
    const editBtn = box.querySelector(".detail-edit-btn");
    if (editBtn) {
      editBtn.addEventListener("click", () => {
        close();
        this._openEditModal(choreId);
      });
    }
    // Admin-only, and deliberately available regardless of status (open, awaiting approval, or already approved) - unlike Edit
    const deleteBtn = box.querySelector(".detail-delete-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", async () => {
        if (!window.confirm(__fhT("text.delete_x_this_can_t_be_undone", "Delete \"%0%\"? This can't be undone.", {0: chore.title}))) return;
        try {
          await this._hass.connection.sendMessagePromise({ type: "family_hub/chores/delete", chore_id: choreId });
        } catch (e) {
          window.alert((e && e.message) || __fhT("text.couldn_t_delete_this_chore", "Couldn't delete this chore."));
          return;
        }
        close();
        await this._fetchChores();
      });
    }
    overlay.classList.add("open");
  }

  _esc(s) {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  }
  // _esc() alone is only safe inside HTML text content - it never escapes `"`
  _escAttr(s) {
    return this._esc(s).replace(/"/g, "&quot;");
  }
  // Converts a stored due_date (a UTC ISO string, same as what the Create form's own new Date(dueVal).toISOString() produces) back into the
  _isoToLocalDatetimeInputValue(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // Soonest-due-first, same "what needs attention next" ordering whether you're looking at Mom's column or a kid's
  _sortChoresForColumn(items) {
    return items.slice().sort((a, b) => {
      // Checked FIRST, ahead of due-date/created-at, so an important chore always sorts above every non-important one regardless of how those two
      if (!!a.important !== !!b.important) return a.important ? -1 : 1;
      const aDue = a.due_date ? new Date(a.due_date).getTime() : null;
      const bDue = b.due_date ? new Date(b.due_date).getTime() : null;
      if (aDue !== null && bDue !== null) return aDue - bDue;
      if (aDue !== null) return -1;
      if (bDue !== null) return 1;
      const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bCreated - aCreated;
    });
  }

  _render() {
    if (!this._root) return;
    this._root.querySelector(".title").textContent = this._config.title;
    const board = this._root.querySelector(".board");
    // person pills - see _renderPersonPills.
    const allColumns = this._limitToConfiguredPeople(this._columns(), (col) => col.id);
    const openCount = (colId) => this._chores.filter((c) => c.assigned_to === colId && !this._isWaitingToRecur(c) && c.status !== "approved").length;
    // Waiting to Recur is its own pill at the end of the row (household ask: move it "to the pill style") instead of the old ↻ header button
    const waitingEntry = this._config.show_waiting_to_recur
      ? [{ id: WAITING_TO_RECUR_PILL_ID, name: `\u21BB ${this._t("chores.waiting_to_recur_col", "Waiting to Recur")}`, color: "#8fa7b3", count: this._chores.filter((c) => this._isWaitingToRecur(c)).length }]
      : [];
    const pillEntries = allColumns.map((col) => ({ id: col.id, name: col.name, color: col.color, count: openCount(col.id) })).concat(waitingEntry);
    this._renderPersonPills(pillEntries);
    const shownIds = this._activePersonFilter(pillEntries.map((e) => e.id));
    const columns = shownIds.length ? allColumns.filter((col) => shownIds.includes(col.id)) : allColumns;
    const showWaitingColumn = waitingEntry.length > 0 && (!shownIds.length || shownIds.includes(WAITING_TO_RECUR_PILL_ID));
    // a "Just me" card with nobody to show for this login (e.g. a shared kiosk before anyone logs in with their PIN) says so instead of leaving
    const justMeNote = !columns.length && this._isJustMeCard()
      ? `<div class="just-me-empty">${this._esc(this._t("chores.just_me_empty", "This card shows whoever is signed in. Sign in (or log in with your PIN) as someone in the household to see your chores."))}</div>`
      : "";
    const scheduleOn = this._scheduleViewEnabled();
    if (scheduleOn) {
      // the pills (and the card's people setting) narrow the schedule the same way they narrow the board
      const limited = columns.length && (shownIds.length || allColumns.length !== this._columns().length);
      board.innerHTML = justMeNote || this._scheduleHtml(limited ? columns.map((c) => c.id) : null);
    } else board.innerHTML = justMeNote + columns
      .map((col) => {
        // Excludes anything now sitting in the dedicated Waiting to Recur column (see _isWaitingToRecur)
        const allItems = this._chores.filter((c) => c.assigned_to === col.id && !this._isWaitingToRecur(c));
        const activeItems = this._sortChoresForColumn(allItems.filter((c) => c.status !== "approved"));
        const completedItems = allItems.filter((c) => c.status === "approved" && this._choreApprovedWithinDays(c, 7));
        // Routines never apply to the shared Chore Bin (it isn't a person)
        const routinesHtml = col.id !== CHORE_BIN_SENTINEL ? this._routinesBlockHtml(col.id) : "";
        const goalsHtml = col.id !== CHORE_BIN_SENTINEL ? this._goalsBlockHtml(col.id) : "";
        const choresLabel = routinesHtml || goalsHtml ? `<div class="chores-section-label">${this._t("chores.chores_label", "Chores")}</div>` : "";
        return `
          <div class="chore-column" data-col-id="${col.id}">
            <div class="chore-col-header" style="border-color:${col.color}">
              <span class="chore-col-dot" style="background:${col.color}"></span>
              <span>${this._esc(col.name)}</span>
              ${this._config.show_stars && col.id !== CHORE_BIN_SENTINEL ? `<span class="chore-col-stars" title="${this._escAttr(this._t("chores.star_balance", "Stars"))}">&#11088; ${this._balances[col.id] || 0}</span>` : ""}
              <span class="chore-col-count">${activeItems.length}</span>
            </div>
            ${routinesHtml}
            ${goalsHtml}
            ${choresLabel}
            <div class="chore-col-body" data-col-id="${col.id}">
              ${activeItems.length ? activeItems.map((c) => this._choreCardHtml(c)).join("") : `<div class="chore-col-empty">${this._t("chores.nothing_here", "Nothing here")}</div>`}
            </div>
            ${this._completedChoresAccordionHtml(col.id, completedItems)}
          </div>
        `;
      })
      .join("") + (showWaitingColumn ? this._waitingToRecurColumnHtml() : "") + (this._showRewardsColumn() ? this._rewardsColumnHtml() : "");

    if (this._canAssign() && !scheduleOn) this._attachDragHandlers();
    // Was plain _canAssign() - broadened to _canManageAnyRoutines()
    this._root.querySelector(".add-chore-fab").style.display = this._canManageAnyRoutines() || this._canRequestStarsAny() ? "" : "none";
    const rewardsToggleBtn = this._root.querySelector(".rewards-toggle-btn");
    if (rewardsToggleBtn) {
      rewardsToggleBtn.hidden = !this._isAdmin();
      rewardsToggleBtn.classList.toggle("active", this._showRewardsColumn());
      rewardsToggleBtn.title = this._showRewardsColumn() ? this._t("chores.hide_rewards_column", "Hide the Rewards column") : this._t("chores.show_rewards_column", "Show the Rewards column");
    }
    const compactToggleBtn = this._root.querySelector(".compact-view-toggle-btn");
    if (compactToggleBtn) {
      const compact = this._compactViewEnabled();
      compactToggleBtn.classList.toggle("active", compact);
      compactToggleBtn.title = compact ? this._t("chores.compact_view_hide", "Switch to the full view") : this._t("chores.compact_view_show", "Switch to compact view");
    }
    this._root.querySelector(".board").classList.toggle("compact-view", this._compactViewEnabled() && !scheduleOn);
    this._root.querySelector(".board").classList.toggle("schedule-view", scheduleOn);
    const scheduleToggleBtn = this._root.querySelector(".schedule-view-toggle-btn");
    if (scheduleToggleBtn) {
      scheduleToggleBtn.classList.toggle("active", scheduleOn);
      scheduleToggleBtn.title = scheduleOn ? this._t("chores.schedule_toggle_hide", "Back to the chore board") : this._t("chores.schedule_toggle_show", "Show the chore schedule");
    }
    if (compactToggleBtn) compactToggleBtn.hidden = scheduleOn;
    if (scheduleOn) {
      this._root.querySelector(".board").classList.remove("single-column");
      return;
    }
    this._applySingleColumnLayout();
  }

  // -- One column at a time (layout: "single") --------------------------------
  _singleColumnIds() {
    const board = this._root && this._root.querySelector(".board");
    if (!board) return [];
    return Array.from(board.querySelectorAll(":scope > .chore-column")).map((c) => c.dataset.colId);
  }
  _applySingleColumnLayout() {
    const board = this._root && this._root.querySelector(".board");
    if (!board) return;
    const single = this._config.layout === "single";
    board.classList.toggle("single-column", single);
    if (!single) return;
    const cols = Array.from(board.querySelectorAll(":scope > .chore-column"));
    if (!cols.length) return;
    // _singleColId is only set when someone moves, so the first render (before people load) doesn't pin the Chore Bin
    let idx = cols.findIndex((c) => c.dataset.colId === this._singleColId);
    if (idx === -1) idx = 0;
    cols.forEach((c, i) => c.classList.toggle("single-current", i === idx));
    const header = cols[idx].querySelector(".chore-col-header");
    if (header && cols.length > 1) {
      const prev = document.createElement("button");
      prev.type = "button";
      prev.className = "single-col-arrow single-col-prev";
      prev.setAttribute("aria-label", this._t("chores.previous_person", "Previous"));
      prev.innerHTML = "&#8249;";
      prev.addEventListener("click", (e) => { e.stopPropagation(); this._stepSingleColumn(-1); });
      const next = document.createElement("button");
      next.type = "button";
      next.className = "single-col-arrow single-col-next";
      next.setAttribute("aria-label", this._t("chores.next_person", "Next"));
      next.innerHTML = "&#8250;";
      next.addEventListener("click", (e) => { e.stopPropagation(); this._stepSingleColumn(1); });
      header.insertBefore(prev, header.firstChild);
      header.appendChild(next);
      const dots = document.createElement("div");
      dots.className = "single-col-dots";
      dots.innerHTML = cols.map((c, i) => `<span class="single-col-dot${i === idx ? " active" : ""}"></span>`).join("");
      header.insertAdjacentElement("afterend", dots);
    }
    this._wireSingleColumnSwipe(board);
  }
  _stepSingleColumn(delta) {
    const ids = this._singleColumnIds();
    if (ids.length < 2) return;
    let idx = ids.indexOf(this._singleColId);
    if (idx === -1) idx = 0;
    this._singleColId = ids[(idx + delta + ids.length) % ids.length];
    this._render();
  }
  // Horizontal swipe on the board moves to the next/previous column; vertical scrolling is left alone.
  _wireSingleColumnSwipe(board) {
    if (board.__fhSwipeWired) return;
    board.__fhSwipeWired = true;
    let startX = null;
    let startY = null;
    board.addEventListener("touchstart", (e) => {
      if (this._config.layout !== "single" || !e.touches || e.touches.length !== 1) { startX = null; return; }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });
    board.addEventListener("touchend", (e) => {
      if (startX === null || !e.changedTouches || !e.changedTouches.length) return;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      startX = null;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      this._stepSingleColumn(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  _attachDragHandlers() {
    const board = this._root.querySelector(".board");
    board.querySelectorAll(".chore-card[draggable='true']").forEach((card) => {
      card.addEventListener("dragstart", (e) => {
        this._draggingId = card.dataset.id;
        e.dataTransfer.effectAllowed = "move";
      });
    });
    board.querySelectorAll(".chore-col-body").forEach((col) => {
      col.addEventListener("dragover", (e) => {
        e.preventDefault();
        col.classList.add("drag-over");
      });
      col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
      col.addEventListener("drop", (e) => {
        e.preventDefault();
        col.classList.remove("drag-over");
        if (this._draggingId) this._assign(this._draggingId, col.dataset.colId);
        this._draggingId = null;
      });
    });
  }

  // -- Plain-schedule recurrence fields, shared by the Create and Edit modals
  _recurFieldsHtml(chore) {
    const recurType = (chore && chore.recur_type) || "";
    const interval = chore && chore.recur_interval_days ? chore.recur_interval_days : 1;
    const selectedDays = new Set((chore && chore.recur_weekdays) || []);
    const weekdayBtns = WEEKDAY_LABELS.map(
      (label, idx) => `<button type="button" class="weekday-btn ${selectedDays.has(idx) ? "active" : ""}" data-day="${idx}">${label}</button>`
    ).join("");
    const monthlySelectedDays = recurType === "monthly_nth" ? selectedDays : new Set();
    const monthlyWeekdayBtns = WEEKDAY_LABELS.map(
      (label, idx) => `<button type="button" class="weekday-btn f-recur-monthly-weekday ${monthlySelectedDays.has(idx) ? "active" : ""}" data-day="${idx}">${label}</button>`
    ).join("");
    const nth = chore && chore.recur_month_nth;
    const nthOptions = [
      { value: "1", label: "The 1st" },
      { value: "2", label: "The 2nd" },
      { value: "3", label: "The 3rd" },
      { value: "4", label: "The 4th" },
      { value: "-1", label: "The last" },
    ].map((o) => `<option value="${o.value}" ${String(nth) === o.value ? "selected" : ""}>${o.label}</option>`).join("");
    const dueOffset = chore && chore.recur_due_offset_minutes ? chore.recur_due_offset_minutes : 0;
    const dueOffsetOptions = RECUR_DUE_OFFSET_OPTIONS.map(
      (o) => `<option value="${o.value}" ${dueOffset === o.value ? "selected" : ""}>${o.label}</option>`
    ).join("");
    // A unit select alongside the existing count input - "days" (the pre-existing/default meaning
    const intervalUnit = (chore && chore.recur_interval_unit) || "days";
    const intervalUnitOptions = [
      { value: "days", label: "day(s)" },
      { value: "weeks", label: "week(s)" },
      { value: "months", label: "month(s)" },
    ].map((o) => `<option value="${o.value}" ${intervalUnit === o.value ? "selected" : ""}>${o.label}</option>`).join("");
    // Anchor date for the preset dropdown's own dynamic labels ("Weekly on Tuesday") - the chore's own due date when editing one that has one
    const anchor = (chore && chore.due_date && new Date(chore.due_date)) || new Date();
    const anchorInfo = this._recurNthWeekdayInfo(anchor);
    const presetValue = this._detectRecurPreset(chore, anchorInfo);
    const weekdayFull = WEEKDAY_FULL_LABELS[anchorInfo.weekday];
    const nthWord = RECUR_NTH_WORDS[String(anchorInfo.nth)] || "fourth";
    const presetOptions = [
      { value: "", label: "Does not repeat" },
      { value: "daily", label: "Daily" },
      { value: "weekly", label: `Weekly on ${weekdayFull}` },
      { value: "monthly_nth", label: `Monthly on the ${nthWord} ${weekdayFull}` },
      { value: "weekdays_mf", label: "Every weekday (Monday to Friday)" },
      { value: "custom", label: "Custom..." },
    ].map((o) => `<option value="${o.value}" ${presetValue === o.value ? "selected" : ""}>${o.label}</option>`).join("");
    return `
      <label>${__fhT("text.recurs", "Recurs", null, "h")}
        <select class="f-recur-preset" data-anchor-weekday="${anchorInfo.weekday}" data-anchor-nth="${anchorInfo.nth}">${presetOptions}</select>
      </label>
      <div class="field f-recur-custom-panel">
        <label>${__fhT("text.custom_recurrence", "Custom recurrence", null, "h")}
          <select class="f-recur-type">
            <option data-fh-t="text.doesn_t_repeat_on_its_own_schedule" value="" ${recurType === "" ? "selected" : ""}>${__fhT("text.doesn_t_repeat_on_its_own_schedule", "Doesn't repeat on its own schedule", null, "h")}</option>
            <option data-fh-t="text.every_few_days_weeks_months" value="interval" ${recurType === "interval" ? "selected" : ""}>${__fhT("text.every_few_days_weeks_months", "Every few days/weeks/months", null, "h")}</option>
            <option data-fh-t="text.specific_days_of_the_week" value="weekdays" ${recurType === "weekdays" ? "selected" : ""}>${__fhT("text.specific_days_of_the_week", "Specific days of the week", null, "h")}</option>
            <option data-fh-t="text.a_specific_week_each_month_e_g_the_3rd" value="monthly_nth" ${recurType === "monthly_nth" ? "selected" : ""}>${__fhT("text.a_specific_week_each_month_e_g_the_3rd", "A specific week each month (e.g. the 3rd Wednesday)", null, "h")}</option>
          </select>
        </label>
        <label class="f-recur-interval-field">${__fhT("text.repeat_every", "Repeat every", null, "h")} <input type="number" class="f-recur-interval" min="1" value="${interval}"> <select class="f-recur-interval-unit">${intervalUnitOptions}</select></label>
        <div class="field f-recur-weekdays-field">
          <label data-fh-t="text.on_these_days">${__fhT("text.on_these_days", "On these days", null, "h")}</label>
          <div class="weekday-btn-row">${weekdayBtns}</div>
        </div>
        <div class="field f-recur-monthly-field">
          <label>${__fhT("text.which_week", "Which week", null, "h")}<select class="f-recur-month-nth">${nthOptions}</select></label>
          <label data-fh-t="text.on_these_days">${__fhT("text.on_these_days", "On these days", null, "h")}</label>
          <div class="weekday-btn-row">${monthlyWeekdayBtns}</div>
          <button data-fh-t="text.first_weekend_of_the_month" type="button" class="recur-quickpick-btn f-recur-first-weekend">${__fhT("text.first_weekend_of_the_month", "First weekend of the month", null, "h")}</button>
        </div>
      </div>
      <label class="f-recur-due-offset-field">${__fhT("text.due", "Due", null, "h")}<select class="f-recur-due-offset">${dueOffsetOptions}</select>${__fhT("text.after_it_recurs", "after it recurs", null, "h")}</label>
    `;
  }
  // Which occurrence-of-the-weekday-in-its-month `date` is (1st/2nd/3rd/ 4th), or -1 ("last") for a 5th occurrence
  _recurNthWeekdayInfo(date) {
    const day = date.getDate();
    const rawNth = Math.ceil(day / 7);
    return { nth: rawNth >= 5 ? -1 : rawNth, weekday: this._jsDayToBackendDay(date.getDay()) };
  }
  // Maps a chore's actual saved recur_* fields onto one of the preset dropdown's plain-English options
  _detectRecurPreset(chore, anchorInfo) {
    const type = (chore && chore.recur_type) || "";
    if (!type) return "";
    if (type === "interval") {
      const unit = (chore.recur_interval_unit || "days");
      const interval = chore.recur_interval_days || 1;
      return unit === "days" && interval === 1 ? "daily" : "custom";
    }
    if (type === "weekdays") {
      const days = (chore.recur_weekdays || []).slice().sort((a, b) => a - b);
      if (days.length === 1 && days[0] === anchorInfo.weekday) return "weekly";
      if (days.length === 5 && days.every((d, i) => d === i)) return "weekdays_mf";
      return "custom";
    }
    if (type === "monthly_nth") {
      const days = chore.recur_weekdays || [];
      const matches = days.length === 1 && days[0] === anchorInfo.weekday && String(chore.recur_month_nth) === String(anchorInfo.nth);
      return matches ? "monthly_nth" : "custom";
    }
    return "custom";
  }
  // Silently fills in the hidden "Custom recurrence" panel's own fields to match a plain-English preset - _applyRecurFieldsToPayload
  _applyRecurPresetToFields(box, preset, anchorInfo) {
    const typeSel = box.querySelector(".f-recur-type");
    const setWeekdays = (selector, days) => {
      box.querySelectorAll(selector).forEach((btn) => btn.classList.toggle("active", days.has(parseInt(btn.dataset.day, 10))));
    };
    if (preset === "") {
      typeSel.value = "";
    } else if (preset === "daily") {
      typeSel.value = "interval";
      box.querySelector(".f-recur-interval").value = "1";
      box.querySelector(".f-recur-interval-unit").value = "days";
    } else if (preset === "weekly") {
      typeSel.value = "weekdays";
      setWeekdays(".f-recur-weekdays-field .weekday-btn", new Set([anchorInfo.weekday]));
    } else if (preset === "weekdays_mf") {
      typeSel.value = "weekdays";
      setWeekdays(".f-recur-weekdays-field .weekday-btn", new Set([0, 1, 2, 3, 4]));
    } else if (preset === "monthly_nth") {
      typeSel.value = "monthly_nth";
      box.querySelector(".f-recur-month-nth").value = String(anchorInfo.nth);
      setWeekdays(".f-recur-monthly-weekday", new Set([anchorInfo.weekday]));
    }
    // preset === "custom": deliberately untouched, see this method's own
    // comment above.
  }
  _wireRecurFields(box) {
    const presetSel = box.querySelector(".f-recur-preset");
    const customPanel = box.querySelector(".f-recur-custom-panel");
    const typeSel = box.querySelector(".f-recur-type");
    const intervalField = box.querySelector(".f-recur-interval-field");
    const weekdaysField = box.querySelector(".f-recur-weekdays-field");
    const monthlyField = box.querySelector(".f-recur-monthly-field");
    const dueOffsetField = box.querySelector(".f-recur-due-offset-field");
    const anchorInfo = { weekday: parseInt(presetSel.dataset.anchorWeekday, 10), nth: parseInt(presetSel.dataset.anchorNth, 10) };
    const syncCustomSubfields = () => {
      intervalField.style.display = typeSel.value === "interval" ? "" : "none";
      weekdaysField.style.display = typeSel.value === "weekdays" ? "" : "none";
      monthlyField.style.display = typeSel.value === "monthly_nth" ? "" : "none";
      // Only meaningful for a chore that actually recurs on its own schedule - "due X after it recurs" has nothing to anchor to for a one-off
      if (dueOffsetField) dueOffsetField.style.display = typeSel.value ? "" : "none";
    };
    const syncPreset = () => {
      customPanel.style.display = presetSel.value === "custom" ? "" : "none";
      if (presetSel.value !== "custom") this._applyRecurPresetToFields(box, presetSel.value, anchorInfo);
      syncCustomSubfields();
    };
    presetSel.addEventListener("change", syncPreset);
    syncPreset();
    typeSel.addEventListener("change", syncCustomSubfields);
    box.querySelectorAll(".weekday-btn").forEach((btn) => {
      btn.addEventListener("click", () => btn.classList.toggle("active"));
    });
    const firstWeekendBtn = box.querySelector(".f-recur-first-weekend");
    if (firstWeekendBtn) {
      firstWeekendBtn.addEventListener("click", () => {
        box.querySelector(".f-recur-month-nth").value = "1";
        box.querySelectorAll(".f-recur-monthly-weekday").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.day === "5" || btn.dataset.day === "6");
        });
      });
    }
  }
  // Reads the recur fields into `payload` in place - always sets every recur_* key
  _applyRecurFieldsToPayload(box, payload) {
    const recurType = box.querySelector(".f-recur-type").value || null;
    payload.recur_type = recurType;
    payload.recur_interval_days = recurType === "interval" ? Math.max(1, parseInt(box.querySelector(".f-recur-interval").value, 10) || 1) : 0;
    const intervalUnitSel = box.querySelector(".f-recur-interval-unit");
    payload.recur_interval_unit = recurType === "interval" && intervalUnitSel ? (intervalUnitSel.value || "days") : "days";
    if (recurType === "weekdays") {
      payload.recur_weekdays = Array.from(box.querySelectorAll(".f-recur-weekdays-field .weekday-btn.active")).map((btn) => parseInt(btn.dataset.day, 10));
    } else if (recurType === "monthly_nth") {
      payload.recur_weekdays = Array.from(box.querySelectorAll(".f-recur-monthly-weekday.active")).map((btn) => parseInt(btn.dataset.day, 10));
    } else {
      payload.recur_weekdays = [];
    }
    payload.recur_month_nth = recurType === "monthly_nth" ? (parseInt(box.querySelector(".f-recur-month-nth").value, 10) || null) : null;
    const dueOffsetSel = box.querySelector(".f-recur-due-offset");
    payload.recur_due_offset_minutes = recurType && dueOffsetSel ? (parseInt(dueOffsetSel.value, 10) || 0) : 0;
  }

  _remindFieldsHtml(chore) {
    const current = (chore && chore.reminder_minutes) || [];
    const optionsHtml = CHORE_REMINDER_MINUTES_CHOICES
      .map((m) => {
        const label = m >= 60 ? (m % 1440 === 0 ? `${m / 1440}d` : `${m / 60}h`) : `${m}m`;
        return `<label class="f-remind-opt"><input type="checkbox" class="f-remind-check" value="${m}"${current.includes(m) ? " checked" : ""} />${label}</label>`;
      })
      .join("");
    return `
      <label class="f-remind-field">${__fhT("text.remind_me", "Remind me", null, "h")}
        <div class="f-remind-row">${optionsHtml}</div>
      </label>
    `;
  }

  // Ties the Remind-me checkbox row's visibility to whether a due date is actually set - there's nothing to count down to otherwise
  _wireRemindFields(box) {
    const dueInput = box.querySelector(".f-due");
    const remindField = box.querySelector(".f-remind-field");
    if (!dueInput || !remindField) return;
    const sync = () => {
      remindField.style.display = dueInput.value ? "" : "none";
    };
    dueInput.addEventListener("input", sync);
    dueInput.addEventListener("change", sync);
    sync();
  }

  // -- Create Chore modal --- a Chore/Goal tab row at the top - selecting Goal swaps to a second pane with its own create-goal form
  _openCreateModal() {
    const overlay = this._root.querySelector(".create-modal");
    const box = overlay.querySelector(".modal-box");
    // Only Family Hub members are offered as a NEW direct assignee or
    // rotation-group member (see _memberUsers/_columns).
    const userOptions = this._memberUsers().map((u) => `<option value="${u.id}">${this._esc(u.name)}</option>`).join("");
    const depOptions = this._chores
      .filter((c) => c.status !== "approved")
      .map((c) => `<option value="${c.id}">${this._esc(c.title)}</option>`)
      .join("");
    // a third Routine tab, shown only when _routinesEnabled() (the FAB itself is already canAssign()-gated - see _render()
    const routineOnly = !this._canAssign() && this._canManageAnyRoutines();
    // nothing to create - only the "Ask for stars" tab
    const starsOnly = !this._canManageAnyRoutines();
    const starsTab = this._canRequestStarsAny() ? `<button type="button" class="modal-tab${starsOnly ? " active" : ""}" data-tab="stars">&#11088; ${this._esc(this._t("chores.ask_for_stars", "Ask for stars"))}</button>` : "";
    const routineTab = this._routinesEnabled() ? `<button data-fh-t="text.routine" type="button" class="modal-tab${routineOnly ? " active" : ""}" data-tab="routine">${__fhT("text.routine", "Routine", null, "h")}</button>` : "";
    const choreGoalTabsHtml = routineOnly || starsOnly
      ? ""
      : `
        <button data-fh-t="text.chore" type="button" class="modal-tab active" data-tab="chore">${__fhT("text.chore", "Chore", null, "h")}</button>
        <button data-fh-t="text.goal" type="button" class="modal-tab" data-tab="goal">${__fhT("text.goal", "Goal", null, "h")}</button>
      `;
    box.innerHTML = `
      <button data-fh-aria="text.close" type="button" class="modal-close create-modal-close" aria-label="${__fhT("text.close", "Close", null, "h")}">&#10005;</button>
      <h2 data-fh-t="text.new" class="chore-modal-heading">${__fhT("text.new", "➕ New", null, "h")}</h2>
      <div class="modal-tabs">
        ${choreGoalTabsHtml}
        ${starsOnly ? "" : routineTab}
        ${starsTab}
      </div>
      <div class="tab-pane chore-pane"${routineOnly || starsOnly ? " hidden" : ""}>
        ${this._libraryPickerHtml("chores")}
        <div class="field"><label data-fh-t="text.title">${__fhT("text.title", "Title", null, "h")}</label><input data-fh-placeholder="text.take_out_the_trash" type="text" class="f-title" placeholder="${__fhT("text.take_out_the_trash", "Take out the trash", null, "h")}"></div>
        <div class="field">
          <label data-fh-t="text.assignment_mode">${__fhT("text.assignment_mode", "Assignment mode", null, "h")}</label>
          <!-- buttons instead of a dropdown (see the
               ASSIGNMENT_MODES const's own comment) - the hidden native
               <select> right below stays the actual source of truth
               (.f-mode is still what _submitCreate/syncModeFields/every
               existing test reads and sets), the buttons just drive it:
               clicking one sets the select's value and dispatches "change"
               on it, so nothing downstream had to change at all. -->
          <div class="f-mode-btn-group">${ASSIGNMENT_MODES.map((m, i) => `<button type="button" class="f-mode-btn${i === 0 ? " active" : ""}" data-mode="${m.value}" title="${this._escAttr(m.title)}">${this._esc(m.label)}</button>`).join("")}</div>
          <select class="f-mode" style="display:none">${ASSIGNMENT_MODES.map((m) => `<option value="${m.value}">${m.label}</option>`).join("")}</select>
        </div>
        <!-- - Chore Bin is now its own
             assignment mode (see just above), so offering it again as an
             assignee choice inside Direct mode was a confusing duplicate
             way to reach the same "sits unassigned, anyone can claim" end
             state - a real person is the only thing Direct mode should
             ever hand this field. -->
        <div class="field f-direct-field"><label data-fh-t="text.assigned_to">${__fhT("text.assigned_to", "Assigned to", null, "h")}</label>
          <select class="f-assigned">${userOptions}</select>
        </div>
        <!-- Only
             offered in Direct mode (see syncModeFields below) - Chore Bin/
             Auto Rotation already have their own "more than one person
             could end up with it" concepts and don't mix cleanly with this
             one. Checking 2+ people here fans
             out into one independent chore PER person at Save (see
             _submitCreate) - each gets its own card, its own Done/Approve,
             its own stars, exactly like creating N separate chores by
             hand would, just in one step. -->
        <label class="f-direct-field remind-check-opt f-multi-assign-toggle"><input type="checkbox" class="f-multi-assign" /> Assign to multiple people</label>
        <div class="field f-multi-assign-field" style="display:none"><label>Assigned to (everyone checked gets their own copy of this chore)</label>
          <div class="f-assigned-multi-list">${this._memberUsers().map((u) => `<label class="remind-check-opt"><input type="checkbox" class="f-assigned-multi" value="${u.id}" /> ${this._esc(u.name)}</label>`).join("")}</div>
        </div>
        <div class="field"><label>Star value</label><input type="number" class="f-stars" min="0" value="0"></div>
        <div class="field"><label>Due date</label><input type="datetime-local" class="f-due"></div>
        ${this._remindFieldsHtml(null)}
        <div class="field"><label>Overdue penalty (stars)</label><input type="number" class="f-penalty" min="0" value="0"></div>
        <!-- - so
             Important/No-approval, Quantity, Timer, Notes, Depends on, and
             Rotation group live inside "Advanced Settings". v198 then also
             moved Automate under Advanced as a sub-tab there - v211+
             ) pulled both the recurrence fields AND Automate back
             OUT into their own top-level accordions instead, so there are
             now three independent, separately-collapsible accordions -
             Repeat, Advanced Settings, Automate - rather than Automate
             nested as a tab inside Advanced. All three share the exact
             same generic .accordion-toggle/.accordion-body pattern
             (_wireAccordions already loops over every accordion-toggle in
             the box, not just one, so no new wiring was needed) - the
             short-lived .advanced-tabs/.advanced-tab sub-tab UI from v198
             is gone along with _wireAdvancedTabs, since each pane is now
             its own accordion instead of a tab inside one. -->
        <button type="button" class="accordion-toggle" data-target="chore-create-repeat-body">
          <span class="theme-section-label">Repeat</span>
          <span class="accordion-chevron">&#9660;</span>
        </button>
        <div class="accordion-body" id="chore-create-repeat-body">
          ${this._recurFieldsHtml(null)}
        </div>
        <button type="button" class="accordion-toggle" data-target="chore-create-advanced-body">
          <span class="theme-section-label">Advanced Settings</span>
          <span class="accordion-chevron">&#9660;</span>
        </button>
        <div class="accordion-body" id="chore-create-advanced-body">
          <!-- -->
          <div class="remind-check-row">
            <label class="remind-check-opt"><input type="checkbox" class="f-important" /> <span class="chore-important-badge">&#10071;</span> Mark as important (always sorts to the top)</label>
            <label class="remind-check-opt"><input type="checkbox" class="f-show-on-calendar" /> ${__fhT("text.show_on_the_calendar_on_its_due_date", "📅 Show on the calendar on its due date", null, "h")}</label>
          </div>
          ${this._approvalToggleHtml("f-no-approval", false, !this._canStarOverride(), "Only an admin (or someone granted star-override permission) can create a chore that skips verification.")}
          ${this._alarmAudienceToggleHtml("f-alarm-audience", "self")}
          <div class="field" title="Optional - e.g. 3 for &quot;3 loads of laundry&quot;. Tapping Done counts down one unit at a time; only the last one triggers approval/stars."><label>Quantity (optional - e.g. 3 loads of laundry)</label><input type="number" class="f-quantity" min="1" placeholder="Leave blank for a normal chore"></div>
          <div class="field" title="Optional - e.g. 30 for &quot;clean for 30 minutes&quot;. Adds a Start button to the chore; when the countdown runs out the chore completes itself exactly as if Done had been tapped, so it still respects whatever approval rules already apply."><label>Timer (optional - minutes)</label><input type="number" class="f-timer-minutes" min="1" max="1440" placeholder="Leave blank for no timer"></div>
          <div class="field"><label>Notes</label><textarea class="f-notes" rows="3" placeholder="Any details worth knowing - which bin, where to leave it, etc."></textarea></div>
          <div class="field"><label>Depends on</label><select class="f-deps" multiple>${depOptions}</select></div>
          <label class="f-rotation-field">Rotation group (in order)<select class="f-rotation" multiple>${userOptions}</select></label>
        </div>
        <button type="button" class="accordion-toggle" data-target="chore-create-automate-body">
          <span class="theme-section-label">Automate</span>
          <span class="accordion-chevron">&#9660;</span>
        </button>
        <div class="accordion-body" id="chore-create-automate-body">
          <fieldset>
            <legend>Auto-create trigger (e.g. "Dryer finished")</legend>
            <label>Entity ID<input type="text" class="f-create-entity" placeholder="binary_sensor.dryer_done"></label>
            <label>From state (optional)<input type="text" class="f-create-from" placeholder="running"></label>
            <label>To state<input type="text" class="f-create-to" placeholder="off"></label>
          </fieldset>
          <fieldset>
            <legend>Auto-complete trigger (e.g. "Dishwasher opened")</legend>
            <label>Entity ID<input type="text" class="f-complete-entity" placeholder="binary_sensor.dishwasher_door"></label>
            <label>From state (optional)<input type="text" class="f-complete-from" placeholder="closed"></label>
            <label>To state<input type="text" class="f-complete-to" placeholder="open"></label>
          </fieldset>
        </div>
      </div>
      <div class="tab-pane goal-pane" hidden>
        <div class="field"><label>Title</label><input type="text" class="g-title" placeholder="Get 3 Bs in math"></div>
        <div class="field"><label>For</label><select class="g-assigned">${userOptions}</select></div>
        <div class="field"><label>Target count (how many times to log before it's done)</label><input type="number" class="g-target" min="1" value="1"></div>
        ${this._goalRewardFieldsHtml(null)}
        <div class="field"><label data-fh-t="text.due_date_optional">${__fhT("text.due_date_optional", "Due date (optional)", null, "h")}</label><input type="datetime-local" class="g-due"></div>
        <div class="field"><label data-fh-t="text.notes">${__fhT("text.notes", "Notes", null, "h")}</label><textarea data-fh-placeholder="text.any_details_worth_knowing" class="g-notes" rows="3" placeholder="${__fhT("text.any_details_worth_knowing", "Any details worth knowing", null, "h")}"></textarea></div>
      </div>
      ${this._routinesEnabled() ? `<div class="tab-pane routine-pane"${routineOnly && !starsOnly ? "" : " hidden"}>${this._routineManagePaneHtml()}</div>` : ""}
      ${starsTab ? `<div class="tab-pane stars-pane"${starsOnly ? "" : " hidden"}>${this._starRequestPaneHtml()}</div>` : ""}
      <div class="modal-actions">
        <button data-fh-t="text.cancel" class="cancel-btn">${__fhT("text.cancel", "Cancel", null, "h")}</button>
        <button data-fh-t="text.create" class="save-btn">${__fhT("text.create", "Create", null, "h")}</button>
      </div>
      <div class="form-error"></div>
    `;
    this._wireAccordions(box);
    box.querySelector(".create-modal-close").addEventListener("click", () => overlay.classList.remove("open"));
    const modeSel = box.querySelector(".f-mode");
    const directField = box.querySelectorAll(".f-direct-field");
    const rotationField = box.querySelector(".f-rotation-field");
    const multiAssignToggle = box.querySelector(".f-multi-assign");
    const multiAssignField = box.querySelector(".f-multi-assign-field");
    const singleAssignField = box.querySelector(".f-assigned").closest(".field");
    const syncMultiAssignFields = () => {
      const on = multiAssignToggle.checked;
      multiAssignField.style.display = on ? "" : "none";
      singleAssignField.style.display = on ? "none" : "";
    };
    const syncModeFields = () => {
      directField.forEach((el) => { el.style.display = modeSel.value === "direct" ? "" : "none"; });
      rotationField.style.display = modeSel.value === "auto_rotation" ? "" : "none";
      // Leaving Direct mode entirely retires the multi-assign checkbox too (its own field is already a .f-direct-field
      if (modeSel.value !== "direct" && multiAssignToggle.checked) {
        multiAssignToggle.checked = false;
        box.querySelectorAll(".f-assigned-multi").forEach((cb) => { cb.checked = false; });
        syncMultiAssignFields();
      }
    };
    modeSel.addEventListener("change", syncModeFields);
    // the visible .f-mode-btn row drives the hidden .f-mode select - clicking a button sets its value and fires "change" on it
    box.querySelectorAll(".f-mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        box.querySelectorAll(".f-mode-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        modeSel.value = btn.dataset.mode;
        modeSel.dispatchEvent(new CustomEvent("change"));
      });
    });
    multiAssignToggle.addEventListener("change", syncMultiAssignFields);
    syncModeFields();
    syncMultiAssignFields();
    this._wireRecurFields(box);
    if (!routineOnly && !starsOnly) {
      this._wireLibraryPicker(box, "chores", (it) => {
        box.querySelector(".f-title").value = it.title;
        const starsInput = box.querySelector(".f-stars");
        if (starsInput) starsInput.value = it.star_value || 0;
      });
    }
    this._wireRemindFields(box);
    this._wireGoalRewardFields(box);
    this._wireModalTabs(box);
    this._wireApprovalToggle(box, "f-no-approval");
    this._wireAlarmAudienceToggle(box, "f-alarm-audience");
    // Editing an item from the board (see _openRoutineManageModal) jumps straight to the Routine tab pre-scoped to that item
    this._routineManageEditingId = null;
    if (this._routinesEnabled()) this._wireRoutineManagePane(box);
    box.querySelector(".cancel-btn").addEventListener("click", () => overlay.classList.remove("open"));
    box.querySelector(".save-btn").addEventListener("click", () => {
      if (box.dataset.activeTab === "stars") this._submitStarRequest(overlay, box);
      else if (box.dataset.activeTab === "goal") this._submitCreateGoal(overlay, box);
      else this._submitCreate(overlay, box);
    });
    overlay.classList.add("open");
  }

  // Opens the FAB modal directly on the Routine tab, pre-scoped to one existing item's person/category and already in edit mode for it
  _openRoutineManageModal(itemId) {
    const item = this._routineItems.find((it) => it.id === itemId);
    if (!item) return;
    this._openCreateModal();
    const box = this._root.querySelector(".create-modal .modal-box");
    const routineTab = box.querySelector('.modal-tab[data-tab="routine"]');
    if (!routineTab) return; // routines got disabled between render and click - nothing to jump to
    routineTab.click();
    box.querySelector(".rm-person").value = item.user_id;
    box.querySelector(".rm-category").value = item.category;
    this._routineManageEditingId = item.id;
    this._renderRoutineManagePane(box);
  }

  // Shared by both this modal and the Rewards card's own create-reward modal (copy-pasted
  _wireAccordions(box) {
    box.querySelectorAll(".accordion-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const body = box.querySelector(`#${btn.dataset.target}`);
        btn.classList.toggle("open");
        if (body) body.classList.toggle("open");
      });
    });
  }
  _wireModalTabs(box) {
    // the Chore tab button doesn't exist at all for a routine-only viewer (see _openCreateModal's routineOnly branch just above)
    box.dataset.activeTab = box.querySelector('.modal-tab[data-tab="chore"]') ? "chore" : box.querySelector('.modal-tab[data-tab="routine"]') ? "routine" : "stars";
    const createLabel = box.querySelector(".save-btn") ? box.querySelector(".save-btn").textContent : "";
    const syncSaveLabel = () => {
      const saveBtn = box.querySelector(".save-btn");
      if (saveBtn) saveBtn.textContent = box.dataset.activeTab === "stars" ? this._t("chores.star_request_send", "Send request") : createLabel;
    };
    syncSaveLabel();
    if (box.dataset.activeTab === "routine") {
      // Mirrors the tab-click handler's own save-btn hiding just below, for the routine-only viewer who lands on Routine by default
      const saveBtn = box.querySelector(".save-btn");
      if (saveBtn) saveBtn.hidden = true;
    }
    box.querySelectorAll(".modal-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        box.querySelectorAll(".modal-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        box.dataset.activeTab = tab.dataset.tab;
        box.querySelector(".chore-pane").hidden = tab.dataset.tab !== "chore";
        box.querySelector(".goal-pane").hidden = tab.dataset.tab !== "goal";
        const routinePane = box.querySelector(".routine-pane");
        if (routinePane) routinePane.hidden = tab.dataset.tab !== "routine";
        const starsPane = box.querySelector(".stars-pane");
        if (starsPane) starsPane.hidden = tab.dataset.tab !== "stars";
        syncSaveLabel();
        // Routine tab has no Create/Save step of its own - every add/edit/ delete in there hits the server immediately
        const saveBtn = box.querySelector(".save-btn");
        if (saveBtn) saveBtn.hidden = tab.dataset.tab === "routine";
        const errEl = box.querySelector(".form-error");
        if (errEl) errEl.textContent = "";
        // The reward-item picker needs the Rewards catalog, which this card otherwise only ever fetches when the embedded Rewards column itself is on
        if (tab.dataset.tab === "goal" && !this._catalogLoadedForGoalForm) {
          this._catalogLoadedForGoalForm = true;
          this._fetchRewardsState().then(() => {
            const box2 = this._root.querySelector(".create-modal .modal-box");
            if (box2 && box2.dataset.activeTab === "goal") {
              const field = box2.querySelector(".g-reward-item-field");
              if (field) field.querySelector("select").innerHTML = this._catalog.map((it) => `<option value="${it.id}">${this._esc(it.title)} (${it.cost_stars}&#11088;)</option>`).join("");
            }
          });
        }
        // Routine Library picker (see _routineManagePaneHtml's own comment)
        if (tab.dataset.tab === "routine") this._populateRoutineLibraryPicker(box);
      });
    });
  }

  // Fetches routine_library.py's static list (cached after the first call - it's read-only reference data
  async _populateRoutineLibraryPicker(box) {
    const createBox = this._root.querySelector(".create-modal .modal-box");
    await this._populateLibraryPicker(createBox || box, "routines");
  }

  // -- Routine tab (FAB modal) - "manage items" pane, -- Replaces the old always-visible inline "Add item" row on the board itself
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
  _defaultRoutineManagePersonId(members) {
    const myId = this._myUserId();
    if (myId && members.some((u) => u.id === myId)) return myId;
    return members.length ? members[0].id : null;
  }
  _routineManagePaneHtml() {
    // Only offer people the viewer is actually allowed to manage routines for (see _canManageRoutinesFor)
    const members = this._memberUsers().filter((u) => this._canManageRoutinesFor(u.id));
    const defaultPersonId = this._defaultRoutineManagePersonId(members);
    const personOptions = members
      .map((u) => `<option value="${u.id}" ${u.id === defaultPersonId ? "selected" : ""}>${this._esc(u.name)}</option>`)
      .join("");
    const categoryOptions = ROUTINE_CATEGORIES.map((c) => `<option value="${c}">${this._routineCategoryLabel(c)}</option>`).join("");
    const dayToggles = WEEKDAY_LABELS.map((label, i) => `<button type="button" class="rm-day-toggle" data-day="${i}">${this._weekdayLabel(i)}</button>`).join("");
    return `
      <div class="routine-manage">
        ${members.length ? "" : `<div class="rm-empty">${this._t("chores.rm_add_someone_first", "Add someone to Family Hub first (Settings &rarr; Users) before giving them routine items.")}</div>`}
        <div class="rm-filters">
          <label class="rm-filter-label">${this._t("chores.person", "Person")}<select class="rm-person">${personOptions}</select></label>
          <label class="rm-filter-label">${this._t("chores.time_of_day", "Time of day")}<select class="rm-category">${categoryOptions}</select></label>
        </div>
        <div class="rm-add-form">
          <!--
               Purely a faster way to fill in the title below (see
               _wireRoutineLibraryPicker) - the library itself is read-only
               static data (routine_library.py), nothing about a routine
               item's own schema changes because this exists. Options are
               populated lazily the first time the Routine tab is opened
               (see _wireModalTabs) since the library is its own extra
               fetch, same lazy-load pattern the Goal tab's reward-item
               picker already uses. -->
          ${this._libraryPickerHtml("routines")}
          <input type="text" class="rm-add-title" placeholder="${this._t("chores.rm_item_title_placeholder", "Item title (e.g. Brush teeth)")}">
          <input type="time" class="rm-add-time" title="${this._t("chores.rm_due_time_title", "Due time (optional)")}">
          <div class="rm-days" data-role="add">${dayToggles}</div>
          <div class="rm-hint">${this._t("chores.rm_days_hint", "Tap the days this applies to - leave them all off for every day.")}</div>
          <input type="number" class="rm-add-stars" min="0" placeholder="${this._t("chores.rm_stars_placeholder", "Stars for completing this (optional)")}">
          ${this._approvalToggleHtml("rm-add-no-approval", false, false, "")}
          <!-- Same single "sensor turns X -> item marked done"
               matcher shape as a chore's own auto_complete_trigger fieldset
               (see the create-chore modal's Automate accordion) - a routine
               item has no create/reopen lifecycle to mirror auto_create_
               trigger, so this is the one fieldset, not two.
               -
               was a plain always-visible fieldset; now wrapped in the same
               generic .accordion-toggle/.accordion-body pattern the create-
               chore modal's own Automate section already uses (see
               _wireAccordions's own comment) rather than a bespoke one.
               This one's part of the modal's own static box HTML (built
               once when the modal opens), so the existing _wireAccordions
               (box) call a few lines below already wires it - no separate
               wiring call needed here, unlike the per-item edit-form copy
               just below in _routineManageItemHtml, which is rebuilt on
               every add/edit/delete/reorder and needs its own re-wire. -->
          <button type="button" class="accordion-toggle" data-target="routine-add-automate-body">
            <span class="theme-section-label">${this._t("chores.automate", "Automate")}</span>
            <span class="accordion-chevron">&#9660;</span>
          </button>
          <div class="accordion-body" id="routine-add-automate-body">
            <fieldset class="rm-automate-fieldset">
              <legend>${this._t("chores.rm_automate_legend", "Auto-complete trigger (optional, e.g. \"Dishwasher opened\")")}</legend>
              <label>${this._t("chores.entity_id_label", "Entity ID")}<input type="text" class="rm-add-automate-entity" placeholder="binary_sensor.dishwasher_door"></label>
              <label>${this._t("chores.from_state_label", "From state (optional)")}<input type="text" class="rm-add-automate-from" placeholder="closed"></label>
              <label>${this._t("chores.to_state_label", "To state")}<input type="text" class="rm-add-automate-to" placeholder="open"></label>
            </fieldset>
          </div>
          <button type="button" class="rm-add-btn">${this._t("chores.create", "Create")}</button>
        </div>
        <div class="rm-error"></div>
        <div class="rm-list"></div>
      </div>
    `;
  }
  _routineManageItemHtml(item) {
    if (this._routineManageEditingId === item.id) {
      const dayToggles = WEEKDAY_LABELS.map(
        (label, i) => `<button type="button" class="rm-day-toggle ${item.days_of_week && item.days_of_week.includes(i) ? "active" : ""}" data-day="${i}">${this._weekdayLabel(i)}</button>`
      ).join("");
      const automate = item.auto_complete_trigger || {};
      return `
        <div class="rm-item-row" data-id="${item.id}">
          <div class="rm-item-edit-form">
            <input type="text" class="rm-edit-title" value="${this._escAttr(item.title)}">
            <input type="time" class="rm-edit-time" value="${item.due_time || ""}">
            <div class="rm-days" data-role="edit">${dayToggles}</div>
            <input type="number" class="rm-edit-stars" min="0" placeholder="${this._t("chores.rm_stars_placeholder", "Stars for completing this (optional)")}" value="${item.star_value || ""}">
            ${this._approvalToggleHtml("rm-edit-no-approval", !!item.no_approval_required, false, "")}
            <!-- same accordion treatment as the add-form's own
                 copy just above (see its own comment) - this one's re-
                 rendered fresh every time _renderRoutineManagePane rebuilds
                 .rm-list though, so it needs its own _wireAccordions call
                 scoped to .rm-list rather than relying on the one-time box-
                 level wiring _openCreateModal already did (see
                 _renderRoutineManagePane's own comment on this). Target id
                 includes the item's own id since, in principle, more than
                 one row's accordion-body could exist in the DOM at once. -->
            <button type="button" class="accordion-toggle" data-target="routine-edit-automate-body-${item.id}">
              <span class="theme-section-label">${this._t("chores.automate", "Automate")}</span>
              <span class="accordion-chevron">&#9660;</span>
            </button>
            <div class="accordion-body" id="routine-edit-automate-body-${item.id}">
              <fieldset class="rm-automate-fieldset">
                <legend>${this._t("chores.rm_automate_legend", "Auto-complete trigger (optional, e.g. \"Dishwasher opened\")")}</legend>
                <label>${this._t("chores.entity_id_label", "Entity ID")}<input type="text" class="rm-edit-automate-entity" value="${this._escAttr(automate.entity_id || "")}" placeholder="binary_sensor.dishwasher_door"></label>
                <label>${this._t("chores.from_state_label", "From state (optional)")}<input type="text" class="rm-edit-automate-from" value="${this._escAttr(automate.from_state || "")}" placeholder="closed"></label>
                <label>${this._t("chores.to_state_label", "To state")}<input type="text" class="rm-edit-automate-to" value="${this._escAttr(automate.to_state || "")}" placeholder="open"></label>
              </fieldset>
            </div>
            <div class="rm-item-edit-actions">
              <button type="button" class="rm-item-save-btn" data-id="${item.id}">${this._t("common.save", "Save")}</button>
              <button type="button" class="rm-item-cancel-btn" data-id="${item.id}">${this._t("common.cancel", "Cancel")}</button>
            </div>
          </div>
        </div>
      `;
    }
    const dueBadge = item.due_time ? `<span>${this._esc(this._formatDueTime(item.due_time))}</span>` : "";
    const daysBadge = `<span>${item.days_of_week && item.days_of_week.length ? item.days_of_week.map((d) => this._weekdayLabel(d)).join(" ") : this._t("chores.every_day", "Every day")}</span>`;
    const starsBadge = item.star_value ? `<span>&#11088; ${item.star_value}${item.no_approval_required ? "" : ` (${this._t("chores.needs_approval", "needs approval")})`}</span>` : "";
    const automateBadge = item.auto_complete_trigger ? `<span title="${this._t("chores.auto_completes_from_x", `Auto-completes from ${this._esc(item.auto_complete_trigger.entity_id || "")}`, { x: this._esc(item.auto_complete_trigger.entity_id || "") })}">&#9881;&#65039; ${this._t("chores.auto", "Auto")}</span>` : "";
    // draggable, same gate as the Edit/Remove buttons right below (reordering is exactly as privileged an edit as those
    const canManage = this._canManageRoutinesFor(item.user_id);
    const dragHandle = canManage ? `<span class="rm-item-drag-handle" title="${this._t("chores.drag_to_reorder", "Drag to reorder")}">&#8942;&#8942;</span>` : "";
    const rowActions = canManage
      ? `
        <button type="button" class="rm-item-edit-btn" data-id="${item.id}" title="${this._t("common.edit", "Edit")}">&#9998;</button>
        <button type="button" class="rm-item-delete-btn" data-id="${item.id}" title="${this._t("chores.remove", "Remove")}">&times;</button>
      `
      : "";
    return `
      <div class="rm-item-row" data-id="${item.id}" draggable="${canManage ? "true" : "false"}">
        ${dragHandle}
        <div class="rm-item-body">
          <div class="rm-item-title">${this._esc(item.title)}</div>
          <div class="rm-item-meta">${dueBadge}${daysBadge}${starsBadge}${automateBadge}</div>
        </div>
        <div class="rm-item-actions">${rowActions}</div>
      </div>
    `;
  }
  _renderRoutineManagePane(box) {
    const personSel = box.querySelector(".rm-person");
    const categorySel = box.querySelector(".rm-category");
    if (!personSel || !categorySel || !personSel.value) return;
    const items = this._routineItemsForManage(personSel.value, categorySel.value);
    box.querySelector(".rm-list").innerHTML = items.length
      ? items.map((it) => this._routineManageItemHtml(it)).join("")
      : `<div class="rm-empty">${this._t("chores.rm_no_items_yet", "No items yet - add one above.")}</div>`;
    // .rm-list is rebuilt via innerHTML above (every add/edit/delete/ reorder/filter change goes through this one method)
    this._wireRoutineDragAndDrop(box);
    // same reasoning - an item's own edit-form Automate accordion
    const list = box.querySelector(".rm-list");
    if (list) this._wireAccordions(list);
  }
  // native HTML5 drag-and-drop within .rm-list, same idiom as the board's own card-to-column dragging
  _wireRoutineDragAndDrop(box) {
    const list = box.querySelector(".rm-list");
    if (!list) return;
    let draggingId = null;
    list.querySelectorAll('.rm-item-row[draggable="true"]').forEach((row) => {
      row.addEventListener("dragstart", (e) => {
        draggingId = row.dataset.id;
        row.classList.add("rm-dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      row.addEventListener("dragend", () => {
        draggingId = null;
        list.querySelectorAll(".rm-item-row").forEach((r) => r.classList.remove("rm-dragging", "rm-drag-over"));
      });
      row.addEventListener("dragover", (e) => {
        if (!draggingId || row.dataset.id === draggingId) return;
        e.preventDefault();
        row.classList.add("rm-drag-over");
      });
      row.addEventListener("dragleave", () => row.classList.remove("rm-drag-over"));
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        row.classList.remove("rm-drag-over");
        if (!draggingId || row.dataset.id === draggingId) return;
        // Which side of the target row the cursor dropped on decides before-vs-after
        const rect = row.getBoundingClientRect();
        const insertBefore = e.clientY - rect.top < rect.height / 2;
        const droppedId = draggingId;
        draggingId = null;
        this._reorderRoutineManageItems(box, droppedId, row.dataset.id, insertBefore);
      });
    });
  }
  // Computes the section's full new order (dragged item removed
  async _reorderRoutineManageItems(box, draggedId, targetId, insertBefore) {
    const personSel = box.querySelector(".rm-person");
    const categorySel = box.querySelector(".rm-category");
    if (!personSel || !categorySel) return;
    const items = this._routineItemsForManage(personSel.value, categorySel.value);
    const ids = items.map((it) => it.id).filter((id) => id !== draggedId);
    const targetIdx = ids.indexOf(targetId);
    if (targetIdx === -1) return;
    ids.splice(insertBefore ? targetIdx : targetIdx + 1, 0, draggedId);
    try {
      await this._hass.connection.sendMessagePromise({
        type: "family_hub/routines/reorder",
        user_id: personSel.value,
        category: categorySel.value,
        item_ids: ids,
      });
    } catch (e) {
      // no-op - a failed reorder just leaves the old order in place; the refetch just below re-renders from whatever the backend actually has
    }
    await this._fetchRoutines();
    const box2 = this._root.querySelector(".create-modal .modal-box");
    if (box2) this._renderRoutineManagePane(box2);
  }
  // Reads the currently-active (.active) day toggles out of one .rm-days container
  _readRoutineDaysFromContainer(container) {
    return Array.from(container.querySelectorAll(".rm-day-toggle.active")).map((b) => parseInt(b.dataset.day, 10));
  }
  _wireRoutineManagePane(box) {
    const personSel = box.querySelector(".rm-person");
    const categorySel = box.querySelector(".rm-category");
    if (!personSel || !categorySel) return;
    const refresh = () => {
      this._routineManageEditingId = null;
      const errEl = box.querySelector(".rm-error");
      if (errEl) {
        errEl.textContent = "";
        errEl.classList.remove("rm-success");
      }
      this._renderRoutineManagePane(box);
    };
    personSel.addEventListener("change", refresh);
    categorySel.addEventListener("change", refresh);
    // Routine Library picker - selecting an entry just fills the title box below (nothing about a routine item's schema changes
    this._wireLibraryPicker(box, "routines", (it) => {
      const titleInput = box.querySelector(".rm-add-title");
      if (titleInput) titleInput.value = it.title;
      const starsInput = box.querySelector(".rm-add-stars");
      if (starsInput && it.star_value) starsInput.value = it.star_value;
    });
    this._renderRoutineManagePane(box);
    // One delegated listener on the whole pane, since .rm-list is rebuilt via innerHTML on every add/edit/delete/cancel
    box.querySelector(".routine-manage").addEventListener("click", (e) => {
      const dayToggle = e.target.closest(".rm-day-toggle");
      if (dayToggle) {
        dayToggle.classList.toggle("active");
        return;
      }
      // the Routine Library's own copy of the approval toggle (rm-add-no-approval/rm-edit-no-approval)
      const approvalBtn = e.target.closest(".approval-toggle-btn");
      if (approvalBtn) {
        if (approvalBtn.disabled) return;
        const field = approvalBtn.closest(".approval-toggle-field");
        const checkbox = field ? field.querySelector('input[type="checkbox"]') : null;
        const group = approvalBtn.closest(".approval-toggle-btn-group");
        if (group) group.querySelectorAll(".approval-toggle-btn").forEach((b) => b.classList.remove("active"));
        approvalBtn.classList.add("active");
        if (checkbox) checkbox.checked = approvalBtn.dataset.value === "not_required";
        return;
      }
      const addBtn = e.target.closest(".rm-add-btn");
      if (addBtn) return this._addRoutineManageItem(box);
      const editBtn = e.target.closest(".rm-item-edit-btn");
      if (editBtn) {
        this._routineManageEditingId = editBtn.dataset.id;
        this._renderRoutineManagePane(box);
        return;
      }
      const cancelBtn = e.target.closest(".rm-item-cancel-btn");
      if (cancelBtn) {
        this._routineManageEditingId = null;
        this._renderRoutineManagePane(box);
        return;
      }
      const saveBtn = e.target.closest(".rm-item-save-btn");
      if (saveBtn) return this._saveRoutineManageItem(box, saveBtn.dataset.id);
      const deleteBtn = e.target.closest(".rm-item-delete-btn");
      if (deleteBtn) return this._deleteRoutineManageItem(box, deleteBtn.dataset.id);
    });
  }
  async _addRoutineManageItem(box) {
    const errEl = box.querySelector(".rm-error");
    errEl.textContent = "";
    errEl.classList.remove("rm-success");
    const personSel = box.querySelector(".rm-person");
    const categorySel = box.querySelector(".rm-category");
    const personId = personSel.value;
    const category = categorySel.value;
    const titleInput = box.querySelector(".rm-add-title");
    const title = titleInput.value.trim();
    if (!personId) {
      errEl.textContent = __fhT("text.add_someone_to_family_hub_first", "Add someone to Family Hub first.");
      return;
    }
    if (!title) {
      errEl.textContent = __fhT("text.a_routine_item_needs_a_title", "A routine item needs a title.");
      return;
    }
    const dueTime = box.querySelector(".rm-add-time").value || null;
    const daysOfWeek = this._readRoutineDaysFromContainer(box.querySelector('.rm-days[data-role="add"]'));
    const starValue = parseInt(box.querySelector(".rm-add-stars").value, 10) || 0;
    const noApprovalRequired = box.querySelector(".rm-add-no-approval").checked;
    const automateEntity = box.querySelector(".rm-add-automate-entity").value.trim();
    const autoCompleteTrigger = automateEntity
      ? {
          entity_id: automateEntity,
          from_state: box.querySelector(".rm-add-automate-from").value.trim() || null,
          to_state: box.querySelector(".rm-add-automate-to").value.trim() || null,
        }
      : null;
    try {
      await this._hass.connection.sendMessagePromise({
        type: "family_hub/routines/create",
        user_id: personId,
        category,
        title,
        due_time: dueTime,
        days_of_week: daysOfWeek,
        star_value: starValue,
        no_approval_required: noApprovalRequired,
        auto_complete_trigger: autoCompleteTrigger,
      });
    } catch (e) {
      errEl.textContent = (e && e.message) || this._t("chores.rm_couldnt_add", "Couldn't add this item.");
      return;
    }
    await this._fetchRoutines();
    const box2 = this._root.querySelector(".create-modal .modal-box");
    if (!box2) return;
    box2.querySelector(".rm-add-title").value = "";
    box2.querySelector(".rm-add-time").value = "";
    box2.querySelector(".rm-add-stars").value = "";
    box2.querySelector(".rm-add-no-approval").checked = false;
    box2.querySelector(".rm-add-automate-entity").value = "";
    box2.querySelector(".rm-add-automate-from").value = "";
    box2.querySelector(".rm-add-automate-to").value = "";
    box2.querySelectorAll('.rm-days[data-role="add"] .rm-day-toggle').forEach((b) => b.classList.remove("active"));
    this._renderRoutineManagePane(box2);
    // x fix: say out loud who/what it was actually added to, since the person/category selects above are easy to leave on their default and not
    const addedPerson = this._memberUsers().find((u) => u.id === personId);
    const addedErrEl = box2.querySelector(".rm-error");
    if (addedErrEl) {
      const personName = addedPerson ? addedPerson.name : this._t("chores.that_person", "that person");
      const categoryLabel = this._routineCategoryLabel(category);
      addedErrEl.textContent = this._t(
        "chores.rm_added_confirmation",
        `Added "${title}" for ${personName} • ${categoryLabel}.`,
        { title, person: personName, category: categoryLabel }
      );
      addedErrEl.classList.add("rm-success");
    }
  }
  async _saveRoutineManageItem(box, itemId) {
    const row = box.querySelector(`.rm-item-row[data-id="${itemId}"]`);
    if (!row) return;
    const errEl = box.querySelector(".rm-error");
    errEl.textContent = "";
    const title = row.querySelector(".rm-edit-title").value.trim();
    if (!title) {
      errEl.textContent = __fhT("text.a_routine_item_needs_a_title", "A routine item needs a title.");
      return;
    }
    const dueTime = row.querySelector(".rm-edit-time").value || null;
    const daysOfWeek = this._readRoutineDaysFromContainer(row.querySelector('.rm-days[data-role="edit"]'));
    const starValue = parseInt(row.querySelector(".rm-edit-stars").value, 10) || 0;
    const noApprovalRequired = row.querySelector(".rm-edit-no-approval").checked;
    const automateEntity = row.querySelector(".rm-edit-automate-entity").value.trim();
    const autoCompleteTrigger = automateEntity
      ? {
          entity_id: automateEntity,
          from_state: row.querySelector(".rm-edit-automate-from").value.trim() || null,
          to_state: row.querySelector(".rm-edit-automate-to").value.trim() || null,
        }
      : null;
    try {
      await this._hass.connection.sendMessagePromise({
        type: "family_hub/routines/update",
        item_id: itemId,
        title,
        due_time: dueTime,
        days_of_week: daysOfWeek,
        star_value: starValue,
        no_approval_required: noApprovalRequired,
        auto_complete_trigger: autoCompleteTrigger,
      });
    } catch (e) {
      errEl.textContent = (e && e.message) || __fhT("text.couldn_t_save_this_item", "Couldn't save this item.");
      return;
    }
    this._routineManageEditingId = null;
    await this._fetchRoutines();
    const box2 = this._root.querySelector(".create-modal .modal-box");
    if (box2) this._renderRoutineManagePane(box2);
  }
  async _deleteRoutineManageItem(box, itemId) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/routines/delete", item_id: itemId });
    } catch (e) {
      // no-op - a failed delete just leaves the item in place, next poll/render corrects it
    }
    if (this._routineManageEditingId === itemId) this._routineManageEditingId = null;
    await this._fetchRoutines();
    const box2 = this._root.querySelector(".create-modal .modal-box");
    if (box2) this._renderRoutineManagePane(box2);
  }

  // -- Goal reward fields (mirrors family-hub-goals-card.js's own _rewardFieldsHtml/_wireRewardFields/_applyRewardFieldsToPayload exactly
  _goalRewardFieldsHtml(goal) {
    const g = goal || {};
    const rewardType = g.reward_type || "stars";
    const catalogOptions = this._catalog
      .map((it) => `<option value="${it.id}" ${g.reward_item_id === it.id ? "selected" : ""}>${this._esc(it.title)} (${it.cost_stars}&#11088;)</option>`)
      .join("");
    return `
      <label>${__fhT("text.reward", "Reward", null, "h")}
        <select class="g-reward-type">
          <option data-fh-t="text.stars" value="stars" ${rewardType === "stars" ? "selected" : ""}>${__fhT("text.stars", "Stars", null, "h")}</option>
          <option data-fh-t="text.a_specific_reward_from_the_catalog" value="catalog_item" ${rewardType === "catalog_item" ? "selected" : ""}>${__fhT("text.a_specific_reward_from_the_catalog", "A specific reward from the catalog", null, "h")}</option>
        </select>
      </label>
      <label class="g-star-value-field">${__fhT("text.how_many_stars", "How many stars", null, "h")}<input type="number" class="g-star-value" min="1" value="${g.star_value || 1}"></label>
      <label class="g-reward-item-field">${__fhT("text.which_reward", "Which reward", null, "h")}<select class="g-reward-item">${catalogOptions}</select></label>
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
      errEl.textContent = __fhT("text.a_goal_needs_a_title", "A goal needs a title.");
      return;
    }
    const assignedTo = box.querySelector(".g-assigned").value;
    if (!assignedTo) {
      errEl.textContent = __fhT("text.a_goal_needs_someone_it_belongs_to", "A goal needs someone it belongs to.");
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
      errEl.textContent = (e && e.message) || __fhT("text.couldn_t_save_this_goal", "Couldn't save this goal.");
      return;
    }
    overlay.classList.remove("open");
    await this._fetchGoals();
  }

  async _submitCreate(overlay, box) {
    const errEl = box.querySelector(".form-error");
    errEl.textContent = "";
    const title = box.querySelector(".f-title").value.trim();
    if (!title) {
      errEl.textContent = __fhT("text.a_chore_needs_a_title", "A chore needs a title.");
      return;
    }
    const mode = box.querySelector(".f-mode").value;
    const payload = {
      type: "family_hub/chores/create",
      title,
      assignment_mode: mode,
      star_value: parseInt(box.querySelector(".f-stars").value, 10) || 0,
      overdue_penalty: parseInt(box.querySelector(".f-penalty").value, 10) || 0,
      notes: box.querySelector(".f-notes").value.trim(),
      dependencies: Array.from(box.querySelector(".f-deps").selectedOptions).map((o) => o.value),
      no_approval_required: box.querySelector(".f-no-approval").checked,
      // "who hears this alarm" 3-way tier - see const.py's
      // CHORE_KEY_ALARM_AUDIENCE and _alarmAudienceToggleHtml's own comment.
      alarm_audience: box.querySelector(".f-alarm-audience").value,
      // Blank -> null (an ordinary chore) - see chore_engine._normalize_
      // quantity_total, which treats null/blank/anything under 1 the same.
      quantity_total: parseInt(box.querySelector(".f-quantity").value, 10) || null,
      // same null-on-blank shape as quantity_total just above - the backend normalizes/clamps
      timer_minutes: parseInt(box.querySelector(".f-timer-minutes").value, 10) || null,
      // "Ability to Mark Chores Important" - sorts to the top of the
      // board and shows a red ! badge (see _sortChoresForColumn/_choreCardHtml).
      important: box.querySelector(".f-important").checked,
      show_on_calendar: !!(box.querySelector(".f-show-on-calendar") && box.querySelector(".f-show-on-calendar").checked),
    };
    this._applyRecurFieldsToPayload(box, payload);
    if (mode === "direct") {
      const multiAssignOn = box.querySelector(".f-multi-assign").checked;
      if (multiAssignOn) {
        // Sent as a list; ws_create_chore fans this out into one independent chore per checked person (see chores_websocket_api.ws_create_chore)
        payload.assigned_to_list = Array.from(box.querySelectorAll(".f-assigned-multi:checked")).map((cb) => cb.value);
      } else {
        payload.assigned_to = box.querySelector(".f-assigned").value;
      }
    }
    if (mode === "auto_rotation") {
      payload.rotation_group = Array.from(box.querySelector(".f-rotation").selectedOptions).map((o) => o.value);
    }
    const dueVal = box.querySelector(".f-due").value;
    if (dueVal) payload.due_date = new Date(dueVal).toISOString();
    // Same "omit entirely when there's nothing to say" rule due_date just above already follows on Create
    const remindMinutes = Array.from(box.querySelectorAll(".f-remind-check:checked")).map((cb) => parseInt(cb.value, 10));
    if (remindMinutes.length) payload.reminder_minutes = remindMinutes;
    const createEntity = box.querySelector(".f-create-entity").value.trim();
    if (createEntity) {
      payload.auto_create_trigger = {
        entity_id: createEntity,
        from_state: box.querySelector(".f-create-from").value.trim() || null,
        to_state: box.querySelector(".f-create-to").value.trim() || null,
      };
    }
    const completeEntity = box.querySelector(".f-complete-entity").value.trim();
    if (completeEntity) {
      payload.auto_complete_trigger = {
        entity_id: completeEntity,
        from_state: box.querySelector(".f-complete-from").value.trim() || null,
        to_state: box.querySelector(".f-complete-to").value.trim() || null,
      };
    }
    if (payload.assigned_to_list && payload.assigned_to_list.length === 0) {
      errEl.textContent = __fhT("text.check_at_least_one_person_to_assign_to", "Check at least one person to assign to multiple people.");
      return;
    }
    try {
      const result = await this._hass.connection.sendMessagePromise(payload);
      // Multi-assign fan-out replies with {chores: [...]} (one per person); a normal create still replies with {chore: {...}}
      if (!result || (!result.chore && !(result.chores && result.chores.length))) throw new Error("no chore returned");
      overlay.classList.remove("open");
      await this._fetchChores();
    } catch (e) {
      errEl.textContent = (e && e.message) || __fhT("text.couldn_t_create_that_chore_check_the", "Couldn't create that chore - check the fields above.");
    }
  }

  // -- Edit Chore modal --- Same field set as the Create modal minus what's permanently fixed once a chore exists
  _openEditModal(choreId) {
    const chore = this._chores.find((c) => c.id === choreId);
    if (!chore) return;
    const overlay = this._root.querySelector(".edit-modal");
    const box = overlay.querySelector(".modal-box");
    const rotationGroup = chore.rotation_group || [];
    const dependencies = chore.dependencies || [];
    const userOptions = this._memberUsers()
      .map((u) => `<option value="${u.id}" ${rotationGroup.includes(u.id) ? "selected" : ""}>${this._esc(u.name)}</option>`)
      .join("");
    const depOptions = this._chores
      .filter((c) => c.status !== "approved" && c.id !== choreId)
      .map((c) => `<option value="${c.id}" ${dependencies.includes(c.id) ? "selected" : ""}>${this._esc(c.title)}</option>`)
      .join("");
    const createTrigger = chore.auto_create_trigger || {};
    const completeTrigger = chore.auto_complete_trigger || {};
    // Rotation only means anything for an auto_rotation chore - since assignment_mode itself can't be changed from this modal
    const rotationFieldHtml = chore.assignment_mode === "auto_rotation"
      ? `<label class="f-rotation-field">${__fhT("text.rotation_group_in_order", "Rotation group (in order)", null, "h")}<select class="f-rotation" multiple>${userOptions}</select></label>`
      : "";
    box.innerHTML = `
      <button data-fh-aria="text.close" type="button" class="modal-close edit-modal-close" aria-label="${__fhT("text.close", "Close", null, "h")}">&#10005;</button>
      <h2 data-fh-t="text.edit_chore">${__fhT("text.edit_chore", "Edit chore", null, "h")}</h2>
      <div class="field"><label data-fh-t="text.title">${__fhT("text.title", "Title", null, "h")}</label><input type="text" class="f-title" value="${this._escAttr(chore.title)}"></div>
      <div class="field"><label data-fh-t="text.star_value">${__fhT("text.star_value", "Star value", null, "h")}</label><input type="number" class="f-stars" min="0" value="${chore.star_value || 0}"></div>
      <div class="field"><label data-fh-t="text.due_date">${__fhT("text.due_date", "Due date", null, "h")}</label><input type="datetime-local" class="f-due" value="${this._isoToLocalDatetimeInputValue(chore.due_date)}"></div>
      ${this._remindFieldsHtml(chore)}
      <div class="field"><label data-fh-t="text.overdue_penalty_stars">${__fhT("text.overdue_penalty_stars", "Overdue penalty (stars)", null, "h")}</label><input type="number" class="f-penalty" min="0" value="${chore.overdue_penalty || 0}"></div>
      <!-- - see the
           create modal's own copy of this comment for the full history
           (v198's Automate sub-tab, then v211's split into three sibling
           accordions - Repeat, Advanced Settings, Automate). -->
      <button type="button" class="accordion-toggle" data-target="chore-edit-repeat-body">
        <span class="theme-section-label">Repeat</span>
        <span class="accordion-chevron">&#9660;</span>
      </button>
      <div class="accordion-body" id="chore-edit-repeat-body">
        ${this._recurFieldsHtml(chore)}
      </div>
      <button type="button" class="accordion-toggle" data-target="chore-edit-advanced-body">
        <span class="theme-section-label">Advanced Settings</span>
        <span class="accordion-chevron">&#9660;</span>
      </button>
      <div class="accordion-body" id="chore-edit-advanced-body">
        <!-- Editable after creation
             too, unlike assignment_mode/assigned_to just above (see this
             modal's own header comment). -->
        <div class="remind-check-row">
          <label class="remind-check-opt"><input type="checkbox" class="f-important" ${chore.important ? "checked" : ""} /> <span class="chore-important-badge">&#10071;</span> ${__fhT("text.mark_as_important_always_sorts_to_the", "Mark as important (always sorts to the top)", null, "h")}</label>
          <label class="remind-check-opt"><input type="checkbox" class="f-show-on-calendar" ${chore.show_on_calendar ? "checked" : ""} /> ${__fhT("text.show_on_the_calendar_on_its_due_date", "📅 Show on the calendar on its due date", null, "h")}</label>
        </div>
        ${this._approvalToggleHtml("f-no-approval", !!chore.no_approval_required, !(this._canStarOverride() || chore.no_approval_required), "Only an admin (or someone granted star-override permission) can mark a chore as not requiring approval.")}
        ${this._alarmAudienceToggleHtml("f-alarm-audience", chore.alarm_audience)}
        <div class="field" title="Optional - e.g. 3 for &quot;3 loads of laundry&quot;. Tapping Done counts down one unit at a time; only the last one triggers approval/stars. Changing this resets the current count."><label data-fh-t="text.quantity_optional_e_g_3_loads_of_laundry">${__fhT("text.quantity_optional_e_g_3_loads_of_laundry", "Quantity (optional - e.g. 3 loads of laundry)", null, "h")}</label><input data-fh-placeholder="text.leave_blank_for_a_normal_chore" type="number" class="f-quantity" min="1" placeholder="${__fhT("text.leave_blank_for_a_normal_chore", "Leave blank for a normal chore", null, "h")}" value="${chore.quantity_total || ""}"></div>
        <div class="field" title="Optional - e.g. 30 for &quot;clean for 30 minutes&quot;. Adds a Start button to the chore; when the countdown runs out the chore completes itself exactly as if Done had been tapped, so it still respects whatever approval rules already apply."><label data-fh-t="text.timer_optional_minutes">${__fhT("text.timer_optional_minutes", "Timer (optional - minutes)", null, "h")}</label><input data-fh-placeholder="text.leave_blank_for_no_timer" type="number" class="f-timer-minutes" min="1" max="1440" placeholder="${__fhT("text.leave_blank_for_no_timer", "Leave blank for no timer", null, "h")}" value="${chore.timer_minutes || ""}"></div>
        <div class="field"><label data-fh-t="text.notes">${__fhT("text.notes", "Notes", null, "h")}</label><textarea data-fh-placeholder="text.any_details_worth_knowing_which_bin" class="f-notes" rows="3" placeholder="${__fhT("text.any_details_worth_knowing_which_bin", "Any details worth knowing - which bin, where to leave it, etc.", null, "h")}">${this._esc(chore.notes || "")}</textarea></div>
        <div class="field"><label data-fh-t="text.depends_on">${__fhT("text.depends_on", "Depends on", null, "h")}</label><select class="f-deps" multiple>${depOptions}</select></div>
        ${rotationFieldHtml}
      </div>
      <button type="button" class="accordion-toggle" data-target="chore-edit-automate-body">
        <span data-fh-t="text.automate" class="theme-section-label">${__fhT("text.automate", "Automate", null, "h")}</span>
        <span class="accordion-chevron">&#9660;</span>
      </button>
      <div class="accordion-body" id="chore-edit-automate-body">
        <fieldset>
          <legend data-fh-t="text.auto_create_trigger_e_g_dryer_finished">${__fhT("text.auto_create_trigger_e_g_dryer_finished", "Auto-create trigger (e.g. \"Dryer finished\")", null, "h")}</legend>
          <label>${__fhT("text.entity_id", "Entity ID", null, "h")}<input type="text" class="f-create-entity" value="${this._escAttr(createTrigger.entity_id || "")}" placeholder="binary_sensor.dryer_done"></label>
          <label>${__fhT("text.from_state_optional", "From state (optional)", null, "h")}<input type="text" class="f-create-from" value="${this._escAttr(createTrigger.from_state || "")}" placeholder="running"></label>
          <label>${__fhT("text.to_state", "To state", null, "h")}<input type="text" class="f-create-to" value="${this._escAttr(createTrigger.to_state || "")}" placeholder="off"></label>
        </fieldset>
        <fieldset>
          <legend data-fh-t="text.auto_complete_trigger_e_g_dishwasher">${__fhT("text.auto_complete_trigger_e_g_dishwasher", "Auto-complete trigger (e.g. \"Dishwasher opened\")", null, "h")}</legend>
          <label>${__fhT("text.entity_id", "Entity ID", null, "h")}<input type="text" class="f-complete-entity" value="${this._escAttr(completeTrigger.entity_id || "")}" placeholder="binary_sensor.dishwasher_door"></label>
          <label>${__fhT("text.from_state_optional", "From state (optional)", null, "h")}<input type="text" class="f-complete-from" value="${this._escAttr(completeTrigger.from_state || "")}" placeholder="closed"></label>
          <label>${__fhT("text.to_state", "To state", null, "h")}<input type="text" class="f-complete-to" value="${this._escAttr(completeTrigger.to_state || "")}" placeholder="open"></label>
        </fieldset>
      </div>
      <div class="modal-actions">
        <button data-fh-t="text.cancel" class="cancel-btn">${__fhT("text.cancel", "Cancel", null, "h")}</button>
        <button data-fh-t="text.save" class="save-btn">${__fhT("text.save", "Save", null, "h")}</button>
      </div>
      <div class="form-error"></div>
    `;
    this._wireRecurFields(box);
    this._wireRemindFields(box);
    this._wireAccordions(box);
    this._wireApprovalToggle(box, "f-no-approval");
    this._wireAlarmAudienceToggle(box, "f-alarm-audience");
    box.querySelector(".edit-modal-close").addEventListener("click", () => overlay.classList.remove("open"));
    box.querySelector(".cancel-btn").addEventListener("click", () => overlay.classList.remove("open"));
    box.querySelector(".save-btn").addEventListener("click", () => this._submitEdit(choreId, overlay, box));
    overlay.classList.add("open");
  }

  async _submitEdit(choreId, overlay, box) {
    const errEl = box.querySelector(".form-error");
    errEl.textContent = "";
    const title = box.querySelector(".f-title").value.trim();
    if (!title) {
      errEl.textContent = __fhT("text.a_chore_needs_a_title", "A chore needs a title.");
      return;
    }
    const payload = {
      type: "family_hub/chores/update",
      chore_id: choreId,
      title,
      star_value: parseInt(box.querySelector(".f-stars").value, 10) || 0,
      overdue_penalty: parseInt(box.querySelector(".f-penalty").value, 10) || 0,
      no_approval_required: box.querySelector(".f-no-approval").checked,
      // same field as the create form - see its own comment.
      alarm_audience: box.querySelector(".f-alarm-audience").value,
      // "Ability to Mark Chores Important" - editable after creation,
      // unlike assignment_mode/assigned_to (see this modal's header comment).
      important: box.querySelector(".f-important").checked,
      show_on_calendar: !!(box.querySelector(".f-show-on-calendar") && box.querySelector(".f-show-on-calendar").checked),
      // Always sent explicitly (even as ""), same reasoning as due_date just below
      notes: box.querySelector(".f-notes").value.trim(),
      // Sent as exactly what the form shows selected, same as the Create modal - unlike Create there IS a pre-existing value here
      dependencies: Array.from(box.querySelector(".f-deps").selectedOptions).map((o) => o.value),
      // Always sent explicitly, same "blank on purpose still has to clear it server-side" reasoning as notes/due_date
      quantity_total: parseInt(box.querySelector(".f-quantity").value, 10) || null,
      // same null-on-blank shape as quantity_total just above - the backend normalizes/clamps
      timer_minutes: parseInt(box.querySelector(".f-timer-minutes").value, 10) || null,
    };
    const dueVal = box.querySelector(".f-due").value;
    // Unlike Create (which just omits due_date entirely when left blank), this always includes the key
    payload.due_date = dueVal ? new Date(dueVal).toISOString() : null;
    // Same "always send explicitly" reasoning as due_date just above - unlike Create (which omits the key entirely when nothing's checked
    payload.reminder_minutes = Array.from(box.querySelectorAll(".f-remind-check:checked")).map((cb) => parseInt(cb.value, 10));
    this._applyRecurFieldsToPayload(box, payload);
    const rotationSelect = box.querySelector(".f-rotation");
    if (rotationSelect) payload.rotation_group = Array.from(rotationSelect.selectedOptions).map((o) => o.value);
    const createEntity = box.querySelector(".f-create-entity").value.trim();
    payload.auto_create_trigger = createEntity
      ? {
          entity_id: createEntity,
          from_state: box.querySelector(".f-create-from").value.trim() || null,
          to_state: box.querySelector(".f-create-to").value.trim() || null,
        }
      : null;
    const completeEntity = box.querySelector(".f-complete-entity").value.trim();
    payload.auto_complete_trigger = completeEntity
      ? {
          entity_id: completeEntity,
          from_state: box.querySelector(".f-complete-from").value.trim() || null,
          to_state: box.querySelector(".f-complete-to").value.trim() || null,
        }
      : null;
    try {
      const result = await this._hass.connection.sendMessagePromise(payload);
      if (!result || !result.chore) throw new Error("no chore returned");
      overlay.classList.remove("open");
      await this._fetchChores();
    } catch (e) {
      errEl.textContent = (e && e.message) || __fhT("text.couldn_t_save_that_chore_check_the", "Couldn't save that chore - check the fields above.");
    }
  }

  _css() {
    return `
      /* position:relative is the containing block .add-chore-fab
         needs when [fab-position="card"] switches it to position:absolute -
         harmless the rest of the time (default position:fixed doesn't care). */
      :host { display: block; height: 100%; position: relative; font-family: "Arial Rounded MT Std", "Arial Rounded MT", "Varela Round", -apple-system, "Segoe UI Rounded", "Segoe UI", Roboto, sans-serif;
        --fc-bg: #fbf7e5; --fc-card: #f5f3f0; --fc-border: #e6ddc4; --fc-text: #423d34; --fc-text-secondary: #96877a;
        --fc-accent: #8f5a00; --fc-accent-text: #fff8ea; --fc-accent2: #305545; --fc-accent3: #b5583c;
        --fc-surface-alt: #efe6cf; --fc-surface2: #f2eede;
        /* Same literal default as family-week-calendar-card.js's :host block -
           _applyThemeVars below only ever overrides the color vars, never
           --fc-shadow (that one's driven by theme "effects", which this card
           doesn't have a UI for), so without this default var(--fc-shadow)
           would resolve to nothing and every box-shadow using it would
           silently vanish. */
        --fc-shadow: 0 2px 5px rgba(58, 53, 44, 0.16); }
      ha-card { background: var(--fc-bg); background-image: var(--fc-bg-overlay-image, none), var(--fc-bg-image, none); background-size: cover, var(--fc-bg-size, cover); background-position: center, var(--fc-bg-position, center); color: var(--fc-text); padding: 12px; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; }
      .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
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
      .actions { display: flex; gap: 8px; }
      /* Same pixel-for-pixel treatment as family-week-calendar-card.js's own
         add-event-fab (size, corner offset, circle, colors, shadow, tap
         feedback) - a deliberately identical look across both cards rather
         than each having its own take on "the + button". */
      /* bottom is offset by --fh-fab-offset, set by the shared
         window.__familyHubFabCoordinator (see the singleton block near the
         top of this file) so this FAB stacks above any other Family Hub
         card's FAB sharing the same dashboard view instead of overlapping
         it - 0px (the default) when this is the only one on screen. */
      .add-chore-fab { position: fixed; right: 18px; bottom: calc(18px + var(--fh-fab-offset, 0px)); z-index: 900; width: 56px; height: 56px; border-radius: 50%; border: none; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 28px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(58,53,44,0.35); transition: transform 0.15s ease, bottom 0.15s ease; }
      .add-chore-fab:active { transform: scale(0.94); }
      /* Hidden (not just z-indexed behind) while ANY Family Hub card on
         this dashboard has a full-screen modal open - see
         _registerFabCoordinator's own comment on state.hideForModal.
         Author-stylesheet [hidden] override, since the plain browser
         default [hidden]{display:none} UA rule alone would lose to the
         display:flex set above it. */
      .add-chore-fab[hidden] { display: none; }
      /* fab_position: "card" - anchors to THIS card's own box
         instead of the viewport, and opts out of the shared coordinator
         offset entirely (see _registerFabCoordinator). */
      :host([fab-position="card"]) .add-chore-fab { position: absolute; bottom: 18px; }
      .rewards-toggle-btn { border: 1px solid var(--fc-border); border-radius: 12px; padding: 6px 12px; font-size: 12px; font-weight: 700; background: var(--fc-surface-alt); color: var(--fc-text); cursor: pointer; }
      .rewards-toggle-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      /* kiosk PIN login button + modal. .active here means
         "someone is currently logged in", same as the toggle buttons above. */
      .kiosk-login-btn { border: 1px solid var(--fc-border); border-radius: 12px; padding: 6px 12px; font-size: 12px; font-weight: 700; background: var(--fc-surface-alt); color: var(--fc-text); cursor: pointer; }
      .kiosk-login-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      .kiosk-login-box { max-width: 360px; }
      .kiosk-login-user-picker { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
      .kiosk-login-user-btn { border: 2px solid var(--fc-border); border-radius: 12px; padding: 10px 14px; font-weight: 700; background: var(--fc-card); color: var(--fc-text); cursor: pointer; }
      .kiosk-login-user-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      .kiosk-login-empty { color: var(--fc-text-secondary); font-size: 13px; }
      .kiosk-login-pin-input { width: 100%; box-sizing: border-box; font-size: 22px; letter-spacing: 6px; text-align: center; padding: 10px; border-radius: 10px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); }
      .kiosk-login-error { color: #b3462c; font-size: 13px; min-height: 18px; margin-top: 6px; }
      .compact-view-toggle-btn { border: 1px solid var(--fc-border); border-radius: 12px; padding: 6px 10px; font-size: 13px; font-weight: 700; background: var(--fc-surface-alt); color: var(--fc-text); cursor: pointer; }
      .compact-view-toggle-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      .schedule-view-toggle-btn { border: 1px solid var(--fc-border); border-radius: 12px; padding: 6px 10px; font-size: 13px; font-weight: 700; background: var(--fc-surface-alt); color: var(--fc-text); cursor: pointer; }
      .schedule-view-toggle-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      .compact-view-toggle-btn[hidden] { display: none; }
      .board.schedule-view { display: block; overflow-y: auto; }
      .sched { display: flex; flex-direction: column; gap: 10px; padding-bottom: 72px; }
      .sched-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
      .sched-tabs { display: flex; gap: 4px; background: var(--fc-surface-alt); border-radius: 12px; padding: 3px; }
      .sched-tab { border: none; background: transparent; color: var(--fc-text); font-weight: 700; font-size: 13px; padding: 6px 12px; border-radius: 9px; cursor: pointer; }
      .sched-tab.active { background: var(--fc-accent); color: var(--fc-accent-text); }
      .sched-nav { display: flex; align-items: center; gap: 6px; }
      .sched-step { border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); border-radius: 10px; width: 32px; height: 32px; font-size: 18px; cursor: pointer; }
      .sched-range { font-weight: 700; min-width: 120px; text-align: center; }
      .sched-summary { font-size: 13px; color: var(--fc-text-secondary); }
      .sched-sum-overdue { color: #b3462c; font-weight: 700; }
      .sched-note, .sched-legend { color: var(--fc-text-secondary); font-size: 13px; }
      .sched-week { display: flex; flex-direction: column; gap: 8px; }
      .sched-day { background: var(--fc-card); border: 1px solid var(--fc-border); border-radius: 12px; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; }
      .sched-day.today { border-color: var(--fc-accent); box-shadow: 0 0 0 1px var(--fc-accent) inset; }
      .sched-day.empty { opacity: 0.7; }
      .sched-day-head { font-weight: 700; font-size: 13px; }
      .sched-today-tag { background: var(--fc-accent); color: var(--fc-accent-text); border-radius: 8px; padding: 1px 6px; font-size: 11px; }
      .sched-none { color: var(--fc-text-secondary); font-size: 12px; }
      .sched-item { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; border: none; background: var(--fc-surface-alt); color: var(--fc-text); border-radius: 10px; padding: 7px 10px; font-size: 14px; cursor: pointer; }
      .sched-item.projected { opacity: 0.6; }
      .sched-item.sched-done .sched-title { text-decoration: line-through; }
      .sched-dot { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 10px; display: inline-block; }
      .sched-time { font-size: 12px; color: var(--fc-text-secondary); white-space: nowrap; }
      .sched-title { flex: 1; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
      .sched-who, .sched-stars { font-size: 12px; color: var(--fc-text-secondary); white-space: nowrap; }
      .sched-badge { font-size: 11px; font-weight: 700; border-radius: 8px; padding: 2px 6px; background: var(--fc-border); white-space: nowrap; }
      .sched-overdue .sched-badge { background: #b3462c; color: #fff; }
      .sched-waiting .sched-badge { background: #e0a030; color: #000; }
      .sched-done .sched-badge { background: #3c8c5a; color: #fff; }
      .sched-month { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
      .sched-head { text-align: center; font-size: 12px; font-weight: 700; color: var(--fc-text-secondary); }
      .sched-cell { min-height: 72px; border: 1px solid var(--fc-border); border-radius: 10px; background: var(--fc-card); color: var(--fc-text); padding: 4px; display: flex; flex-direction: column; gap: 2px; align-items: stretch; text-align: left; cursor: pointer; overflow: hidden; font: inherit; }
      .sched-cell.outside { opacity: 0.45; }
      .sched-cell.today { border-color: var(--fc-accent); }
      .sched-cell.selected { box-shadow: 0 0 0 2px var(--fc-accent) inset; }
      .sched-cell.has-overdue .sched-cell-num { color: #b3462c; }
      .sched-cell-num { font-size: 12px; font-weight: 700; }
      .sched-chip { display: flex; align-items: center; gap: 3px; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .sched-chip.projected { opacity: 0.6; }
      .sched-chip.sched-done { text-decoration: line-through; }
      .sched-chip .sched-dot { width: 7px; height: 7px; flex-basis: 7px; }
      .sched-more { font-size: 11px; color: var(--fc-text-secondary); }
      .sched-count { display: none; font-size: 11px; font-weight: 700; background: var(--fc-accent); color: var(--fc-accent-text); border-radius: 8px; padding: 0 5px; align-self: flex-start; }
      @media (max-width: 520px) { .sched-chip, .sched-more { display: none; } .sched-count { display: inline-block; } .sched-cell { min-height: 44px; } }
      .board { flex: 1; display: flex; gap: 10px; overflow-x: auto; overflow-y: hidden; }
      /* min-width, not a fixed width: with room to spare (few columns) each
         column grows equally to fill the dashboard instead of leaving empty
         space on the right; with more columns than fit at 220px each,
         flex-shrink:0 keeps every column at its full 220px and .board's
         overflow-x:auto takes over (horizontal scroll) instead of squeezing
         them narrower. */
      .chore-column { flex: 1 0 220px; min-width: 220px; display: flex; flex-direction: column; background: var(--fc-card); border: 1px solid var(--fc-border); border-radius: 10px; box-shadow: var(--fc-shadow); overflow: hidden; }
      .chore-col-header { display: flex; align-items: center; gap: 6px; padding: 10px; font-weight: 700; background: var(--fc-surface-alt); border-bottom: 3px solid var(--fc-border); }
      .chore-col-dot { width: 10px; height: 10px; border-radius: 50%; }
      .chore-col-count { margin-left: auto; opacity: .6; font-size: 12px; }
      .chore-star-request-badge { font-size: 11px; font-weight: 700; color: var(--fc-text-secondary); margin: -2px 0 4px; }
      .star-request-hint { font-size: 12px; color: var(--fc-text-secondary); margin-top: 4px; }
      .chore-col-stars { font-size: 12px; font-weight: 700; padding: 1px 7px; border-radius: 10px; background: color-mix(in srgb, #f4c95d 30%, transparent); white-space: nowrap; }
      .chore-col-stars + .chore-col-count { margin-left: 6px; }
      .chore-col-header:has(.chore-col-stars) .chore-col-stars { margin-left: auto; }
      .board.single-column { overflow-x: hidden; touch-action: pan-y; }
      .board.single-column > .chore-column { display: none; flex: 1 1 100%; min-width: 0; }
      .board.single-column > .chore-column.single-current { display: flex; }
      .single-col-arrow { border: none; background: none; color: var(--fc-text); font-size: 24px; line-height: 1; padding: 0 6px; cursor: pointer; font-weight: 700; }
      .single-col-next { margin-left: 4px; }
      .single-col-dots { display: flex; justify-content: center; gap: 5px; padding: 5px 0 0; }
      .single-col-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--fc-border); }
      .single-col-dot.active { background: var(--fc-accent); }
      .chore-col-body { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 8px; }
      .chore-col-body.drag-over { background: var(--fc-surface-alt); }
      .chore-col-empty { text-align: center; color: var(--fc-text-secondary); font-size: 12px; padding: 12px 0; }
      .just-me-empty { align-self: flex-start; max-width: 360px; color: var(--fc-text-secondary); font-size: 13px; padding: 16px; background: var(--fc-card); border-radius: 12px; }
      .routines-block { padding: 8px 8px 0; display: flex; flex-direction: column; gap: 4px; border-bottom: 1px solid var(--fc-border); }
      .routine-row { background: var(--fc-surface2); border-radius: 8px; overflow: hidden; }
      .routine-row-header { display: flex; align-items: center; gap: 6px; padding: 6px 8px; font-size: 12px; font-weight: 700; cursor: pointer; }
      .routine-toggle-icon { font-size: 9px; opacity: .65; width: 9px; flex-shrink: 0; }
      .routine-row-title { flex: 1; }
      .routine-row-badge { font-size: 11px; font-weight: 700; opacity: .75; background: var(--fc-card); border-radius: 8px; padding: 1px 7px; }
      .routine-row-body { padding: 2px 8px 8px; display: flex; flex-direction: column; gap: 4px; }
      .routine-section-label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: var(--fc-text-secondary); margin-top: 2px; }
      /* card-style item (mirrors .goal-item's visual language -
         surface2 chip, icon/checkbox + body + actions - just below) in
         place of the old plain flex row, now that items also carry an
         optional due-time/days-of-week meta line and edit/delete actions
         moved here from a single tiny inline &times;. */
      .routine-item-card { display: flex; align-items: flex-start; gap: 6px; background: var(--fc-card); border-radius: 8px; padding: 6px 8px; }
      .routine-item-card.done { opacity: .6; }
      .routine-item-card.done .routine-item-title { text-decoration: line-through; }
      .routine-item-check { width: 15px; height: 15px; flex-shrink: 0; margin-top: 2px; accent-color: var(--fc-accent); cursor: pointer; }
      .routine-item-body { flex: 1; min-width: 0; }
      .routine-item-title { font-size: 12px; font-weight: 700; word-break: break-word; }
      .routine-item-meta { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
      .routine-item-due, .routine-item-days { font-size: 10px; font-weight: 700; color: var(--fc-text-secondary); background: var(--fc-surface2); border-radius: 6px; padding: 1px 6px; }
      .routine-item-due.overdue { color: var(--fc-accent3); }
      .routine-item-actions { display: flex; gap: 2px; flex-shrink: 0; }
      .routine-item-edit, .routine-item-delete { border: none; background: none; color: var(--fc-text-secondary); cursor: pointer; font-size: 13px; line-height: 1; padding: 2px; }
      .routine-item-delete { font-size: 15px; }
      .routine-row-empty { font-size: 11px; color: var(--fc-text-secondary); padding: 2px 0 4px; }
      .completed-chores-row { border-top: 1px solid var(--fc-border); flex-shrink: 0; }
      .completed-chores-header { display: flex; align-items: center; gap: 6px; padding: 8px; font-size: 12px; font-weight: 700; cursor: pointer; color: var(--fc-text-secondary); }
      .completed-chores-title { flex: 1; }
      .completed-chores-body { padding: 0 8px 8px; display: flex; flex-direction: column; gap: 8px; max-height: 240px; overflow-y: auto; }
      .completed-chores-body .chore-card { opacity: .7; }
      /* --- Routine tab (FAB modal) - "manage items" pane, -- */
      .routine-manage { display: flex; flex-direction: column; gap: 8px; }
      .rm-filters { display: flex; gap: 6px; }
      .rm-filter-label { flex: 1; display: flex; flex-direction: column; gap: 2px; font-size: 10px; font-weight: 700; color: var(--fc-text-secondary); text-transform: uppercase; letter-spacing: 0.02em; }
      .rm-filters select { margin: 0; width: 100%; box-sizing: border-box; text-transform: none; font-weight: 400; letter-spacing: normal; font-size: 12px; }
      .rm-error.rm-success { color: var(--fc-accent2); }
      .rm-add-form { background: var(--fc-surface2); border-radius: 10px; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
      .rm-add-form input[type="text"], .rm-add-form input[type="time"] { box-sizing: border-box; width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 12px; font-family: inherit; }
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
      .rm-library-pick { box-sizing: border-box; width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 12px; font-family: inherit; }
      .rm-days { display: flex; flex-wrap: wrap; gap: 4px; }
      .rm-day-toggle { border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); border-radius: 6px; padding: 4px 8px; font-size: 11px; font-weight: 700; cursor: pointer; }
      .rm-day-toggle.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      .rm-hint { font-size: 10px; color: var(--fc-text-secondary); }
      .rm-add-btn, .rm-item-save-btn { border: none; border-radius: 8px; padding: 7px 10px; font-weight: 700; font-size: 12px; cursor: pointer; background: var(--fc-accent); color: var(--fc-accent-text); align-self: flex-start; }
      /* -
         the Routine tab's own Add-item button only (its sibling .rm-item-
         save-btn, the per-item Edit-form Save button, is untouched and
         stays left-aligned like before). */
      .rm-add-btn { align-self: flex-end; }
      .rm-error { color: var(--fc-accent3); font-size: 11px; min-height: 13px; }
      .rm-list { display: flex; flex-direction: column; gap: 6px; }
      .rm-item-row { display: flex; align-items: flex-start; gap: 6px; background: var(--fc-card); border: 1px solid var(--fc-border); border-radius: 8px; padding: 6px 8px; }
      /* drag-and-drop reordering - see _wireRoutineDragAndDrop. The
         dragged row fades slightly while it's moving; the row currently
         under the cursor gets a top border as a drop-position hint (same
         "upper half vs lower half" convention _wireRoutineDragAndDrop's
         own comment describes). */
      .rm-item-row[draggable="true"] { cursor: grab; }
      .rm-item-row.rm-dragging { opacity: 0.5; }
      .rm-item-row.rm-drag-over { border-top: 2px solid var(--fc-accent); }
      .rm-item-drag-handle { flex-shrink: 0; color: var(--fc-text-secondary); font-size: 14px; line-height: 1; padding: 4px 2px; cursor: grab; user-select: none; }
      .rm-item-body { flex: 1; min-width: 0; }
      .rm-item-title { font-size: 12px; font-weight: 700; word-break: break-word; }
      .rm-item-meta { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
      .rm-item-meta span { font-size: 10px; font-weight: 700; color: var(--fc-text-secondary); background: var(--fc-surface2); border-radius: 6px; padding: 1px 6px; }
      .rm-item-actions { display: flex; gap: 2px; flex-shrink: 0; }
      .rm-item-edit-btn, .rm-item-delete-btn, .rm-item-cancel-btn { border: none; background: none; color: var(--fc-text-secondary); cursor: pointer; font-size: 13px; line-height: 1; padding: 2px; }
      .rm-item-delete-btn { font-size: 15px; }
      .rm-item-edit-form { flex: 1; display: flex; flex-direction: column; gap: 6px; }
      .rm-item-edit-form input[type="text"], .rm-item-edit-form input[type="time"] { box-sizing: border-box; width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 12px; font-family: inherit; }
      .rm-item-edit-actions { display: flex; gap: 6px; }
      .rm-empty { font-size: 11px; color: var(--fc-text-secondary); padding: 4px 0; }
      .chores-section-label { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: var(--fc-text-secondary); padding: 8px 8px 0; }
      .goals-block { padding: 8px 8px 0; display: flex; flex-direction: column; gap: 4px; border-bottom: 1px solid var(--fc-border); }
      .goal-item { display: flex; align-items: center; gap: 6px; background: var(--fc-surface2); border-radius: 8px; padding: 6px 8px; }
      .goal-item-icon { font-size: 13px; flex-shrink: 0; }
      .goal-item-body { flex: 1; min-width: 0; }
      .goal-item-title { font-size: 12px; font-weight: 700; word-break: break-word; }
      .goal-item-progress { font-size: 11px; color: var(--fc-text-secondary); }
      .goal-item-actions { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }
      .goal-item-actions button { border: none; border-radius: 6px; padding: 3px 7px; font-size: 10px; font-weight: 700; cursor: pointer; background: var(--fc-accent); color: var(--fc-accent-text); }
      .goal-reject-btn { background: var(--fc-surface-alt) !important; color: var(--fc-accent3) !important; }
      .goal-complete-btn { background: var(--fc-accent2) !important; }
      .goal-pending-label, .goal-approved-label { font-size: 10px; color: var(--fc-text-secondary); white-space: nowrap; }
      .waiting-recur-col-body { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 8px; }
      .waiting-recur-card { opacity: .8; }
      .waiting-recur-desc { font-size: 11px; color: var(--fc-text-secondary); margin-top: 4px; font-weight: 700; }
      .waiting-recur-owner { font-size: 11px; color: var(--fc-text-secondary); margin-top: 2px; }
      /* Wider min-width than a plain chore column - it holds a catalog grid,
         not a single-column stack of chore cards, so it needs more room to
         not immediately collapse into one item per row. */
      .rewards-column { flex-basis: 280px; min-width: 280px; }
      .rewards-col-body { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 8px; }
      .rewards-balances { display: flex; flex-direction: column; gap: 6px; }
      .rewards-balance-row { display: flex; align-items: center; gap: 6px; background: var(--fc-card); border: 2px solid; border-radius: 10px; padding: 6px 10px; font-size: 13px; font-weight: 700; }
      .rewards-balance-dot { width: 9px; height: 9px; border-radius: 50%; }
      .rewards-balance-name { flex: 1; }
      .rewards-balance-stars { color: var(--fc-accent); }
      .rewards-catalog-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: var(--fc-text-secondary); margin-top: 6px; }
      .rewards-catalog { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; }
      .rewards-catalog-item { background: var(--fc-card); border-radius: 12px; padding: 8px; text-align: center; display: flex; flex-direction: column; align-items: center; box-shadow: var(--fc-shadow, 0 2px 5px rgba(0,0,0,0.08)); }
      .rewards-catalog-icon { font-size: 20px; }
      .rewards-catalog-item-title { font-weight: 700; font-size: 12px; margin: 4px 0; }
      .rewards-catalog-cost { font-size: 11px; color: var(--fc-accent); margin-bottom: 6px; }
      /* margin-top: auto - the embedded card's own .rewards-catalog-item is
         already a flex column, so this pins Claim to the bottom regardless
         of how many lines the title above it wraps to, keeping the button
         row lined up across neighboring items - same fix as the standalone
         Rewards card's own .claim-btn. */
      .rewards-claim-btn { border: none; border-radius: 8px; padding: 5px 8px; font-size: 11px; font-weight: 700; cursor: pointer; background: var(--fc-accent); color: var(--fc-accent-text); width: 100%; margin-top: auto; }
      .rewards-claim-btn:disabled { opacity: .5; cursor: default; }
      .rewards-claim-status { font-size: 10px; color: var(--fc-accent3); min-height: 12px; }
      /* Every card is clickable now (opens the detail modal - see
         _onBoardClick/_openChoreDetailModal), so the cursor is a plain
         pointer everywhere; a draggable card (open + can-assign) still
         drags via native HTML5 drag-and-drop regardless of cursor style. */
      .chore-card { background: var(--fc-card); border-radius: 10px; padding: 8px 10px; box-shadow: var(--fc-shadow, 0 2px 5px rgba(0,0,0,0.1)); cursor: pointer; }
      /* "Liquid glass" support, same convention as
         family-week-calendar-card.js - any theme may set --fc-glass-blur
         (px, default 0, see the Liquid Glass presets) and every surface
         painted with --fc-card/--fc-surface-alt/--fc-surface2 (now
         translucent via cardOpacity, see _applyThemeVars above) also
         gets backdrop-filter so it genuinely blurs what's behind it
         instead of just going see-through. Zero-cost for every existing
         theme - blur(0px) is a no-op. -webkit- prefix needed for Safari/
         iOS webviews. */
      .chore-card, .chore-column, .chore-col-header, .chore-col-body.drag-over,
      .cancel-btn, .chore-edit-btn, .chore-nudge-btn, .chore-reject-btn,
      .chore-rejected-badge, .detail-dep, .detail-notes, .detail-rejected-note,
      .detail-status-badge, .f-remind-opt, .goal-item, .goal-reject-btn,
      .kiosk-login-btn, .kiosk-login-pin-input, .kiosk-login-user-btn,
      .rewards-balance-row, .rewards-catalog-item, .rewards-toggle-btn,
      .rm-add-form, .rm-day-toggle, .rm-item-row, .routine-item-card,
      .routine-item-due, .routine-item-days, .routine-row, .routine-row-badge,
      .waiting-recur-toggle-btn, .weekday-btn {
        backdrop-filter: blur(var(--fc-glass-blur, 0px));
        -webkit-backdrop-filter: blur(var(--fc-glass-blur, 0px));
      }
      .chore-card.status-pending_verification { opacity: .85; }
      .chore-card.status-approved { opacity: .55; }
      /* "Mark Chores Important" - the sort itself is in _sortChoresForColumn, this is
         just the visual marker: a red "!" ahead of the title, plus a thin
         red left border on the whole card so it's easy to spot scanning a
         column even when the title is truncated). */
      .chore-card.chore-important { border-left: 3px solid #c0392b; }
      .chore-important-badge { color: #c0392b; font-weight: 900; margin-right: 3px; }
      .chore-title { font-weight: 700; font-size: 14px; margin-bottom: 4px; }
      .chore-meta { display: flex; gap: 8px; font-size: 12px; color: var(--fc-text-secondary); flex-wrap: wrap; }
      .chore-actions { margin-top: 6px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      /* Household ask, verbatim: "If there are so many chores on a list
         that they turn into a scrolling list, maybe we should have a more
         compact view." A per-device toggle (see _compactViewEnabled) that
         shrinks every card's own padding/font rather than hiding any
         chore - due date/streak/quantity stay, just smaller, so a long
         column shows noticeably more of itself per scroll without losing
         information. Scoped under .board.compact-view so a card's OWN
         status/important styling above still applies unchanged. */
      .board.compact-view .chore-card { padding: 5px 8px; border-radius: 8px; }
      .board.compact-view .chore-col-body { gap: 5px; padding: 6px; }
      .board.compact-view .chore-title { font-size: 12.5px; margin-bottom: 2px; }
      .board.compact-view .chore-meta { font-size: 10.5px; gap: 6px; }
      .board.compact-view .chore-actions { margin-top: 4px; gap: 4px; }
      .board.compact-view .chore-actions button { padding: 3px 7px; font-size: 11px; }
      .board.compact-view .chore-rejected-badge,
      .board.compact-view .chore-timer-live { font-size: 10.5px; padding: 2px 6px; }
      /* chore timers. Start reads as a secondary action next to
         Done (which stays primary - finishing early is always allowed);
         once running it's replaced by a live countdown chip, monospace-ish
         tabular figures so the seconds ticking down don't shift the layout
         under the cursor every second. */
      .chore-timer-start-btn { background: var(--fc-surface-alt) !important; color: var(--fc-accent2) !important; }
      .chore-timer-live { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 800; color: var(--fc-accent2); background: var(--fc-surface-alt); border-radius: 8px; padding: 4px 8px; font-variant-numeric: tabular-nums; }
      .chore-timer-cancel-btn { background: transparent !important; color: var(--fc-text-secondary) !important; padding: 4px 6px !important; }
      .chore-actions button { border: none; border-radius: 8px; padding: 5px 10px; font-size: 12px; font-weight: 700; cursor: pointer; background: var(--fc-accent2); color: #fff; }
      .chore-nudge-btn { background: var(--fc-surface-alt) !important; color: var(--fc-text) !important; }
      .chore-in-progress-btn { background: var(--fc-surface-alt) !important; color: var(--fc-text) !important; }
      .chore-in-progress-btn.is-active { background: var(--fc-accent2) !important; color: #fff !important; }
      .chore-edit-btn { background: var(--fc-surface-alt) !important; color: var(--fc-text) !important; }
      .chore-approve-btn { background: var(--fc-accent) !important; color: var(--fc-accent-text) !important; }
      .chore-reject-btn { background: var(--fc-surface-alt) !important; color: var(--fc-accent3) !important; }
      .chore-rejected-badge { display: inline-block; font-size: 11px; color: var(--fc-accent3); background: var(--fc-surface-alt); border-radius: 8px; padding: 2px 6px; margin-top: 4px; }
      .chore-pending-label, .chore-approved-label { font-size: 12px; color: var(--fc-text-secondary); }
      .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; align-items: center; justify-content: center; }
      .modal-overlay.open { display: flex; }
      .modal-box { position: relative; background: var(--fc-bg); color: var(--fc-text); border-radius: 14px; padding: 18px; width: min(92vw, 480px); max-height: 85vh; overflow-y: auto; }
      /* "make the chores and rewards modals more similar to the add
         calendar and add reminder modal" (household's own words, full visual
         match) - this block ports the calendar card's Add Event modal design
         system (family-week-calendar-card.js's own .modal-close/.field/h2/
         .size-btn-row/.accordion-* rules - no shared module between the two
         cards, so this is its own independent copy of the same look, same
         convention as every other cross-card CSS port in this project) onto
         the EXISTING .modal-tab/.cancel-btn/.save-btn/.modal-actions class
         names below rather than renaming them, so none of the JS wiring that
         already queries those selectors has to change - only the visuals do. */
      .modal-close { position: absolute; top: 10px; right: 10px; width: 36px; height: 36px; border-radius: 50%; border: none; background: var(--fc-surface-alt); color: var(--fc-text); font-size: 18px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: var(--fc-shadow); }
      .modal-box h2 { margin: 0 26px 14px 0; font-size: 1.2em; color: var(--fc-text); }
      .modal-box h3 { margin: 0 26px 14px 0; font-size: 1.1em; color: var(--fc-text); }
      .modal-box label { display: block; margin: 8px 0; font-size: 13px; font-weight: 700; }
      .modal-box input, .modal-box select, .modal-box textarea { width: 100%; box-sizing: border-box; margin-top: 4px; padding: 8px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 13px; font-family: inherit; }
      .modal-box textarea { resize: vertical; }
      .modal-box fieldset { border: 1px solid var(--fc-border); border-radius: 8px; margin: 8px 0; }
      /* .field - calendar card's own field wrapper (label above input, on
         its own line, secondary-text colored) - used in place of the plain
         "label wraps input" pattern above wherever this redesign has
         converted a field over to it. */
      .field { margin-bottom: 14px; }
      .field label { display: block; font-size: 13px; font-weight: 600; color: var(--fc-text-secondary); margin-bottom: 5px; }
      .field input, .field select, .field textarea { width: 100%; box-sizing: border-box; font-size: 16px; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-family: inherit; margin-top: 0; }
      .field textarea { resize: vertical; min-height: 60px; }
      /* .size-btn-row/.size-btn - calendar card's equal-width toggle-button
         row idiom, used here for binary/few-option fields the redesign has
         converted away from a raw checkbox or <select>. */
      .size-btn-row { display: flex; gap: 8px; flex-wrap: wrap; }
      .size-btn { flex: 1 1 auto; min-height: 44px; border-radius: 10px; border: 2px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: var(--fc-shadow); }
      .size-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      /* Accordion pattern - same generic .accordion-toggle/.accordion-body/
         .accordion-chevron idiom as the calendar card's Settings panel and
         Grocy recipe viewer, reused here for "Advanced Settings" in place of
         the plain native <details>/<summary> this modal used before. */
      .accordion-toggle { width: 100%; display: flex; align-items: center; justify-content: space-between; background: var(--fc-surface-alt); border: none; border-radius: 10px; padding: 10px 12px; cursor: pointer; box-shadow: var(--fc-shadow); font-size: 13px; font-weight: 800; color: var(--fc-text); text-transform: uppercase; letter-spacing: 0.02em; margin-top: 8px; }
      .accordion-chevron { font-size: 12px; color: var(--fc-text-secondary); transition: transform 0.2s ease; }
      .accordion-toggle.open .accordion-chevron { transform: rotate(180deg); }
      .accordion-body { display: none; margin-top: 10px; }
      .accordion-body.open { display: block; }
      /* .remind-check-opt - pill-style checkbox row, same look as the
         calendar card's reminder-checkbox row. Chore/goal Important/No-
         approval/multi-assign checkboxes already used this class name
         without any matching CSS (they rendered as plain unstyled labels) -
         this is the first time it's actually styled here. */
      .remind-check-row { display: flex; flex-wrap: wrap; gap: 6px; }
      .remind-check-opt { display: flex; align-items: center; gap: 4px; padding: 5px 9px; border-radius: 12px; background: var(--fc-surface-alt); color: var(--fc-text); font-size: 12px; font-weight: 600; cursor: pointer; user-select: none; margin: 4px 0; }
      .remind-check-opt input { margin: 0; width: auto; }
      .modal-tabs { display: flex; gap: 8px; margin-bottom: 10px; }
      .modal-tab { flex: 1 1 0; min-height: 40px; padding: 8px 10px; border-radius: 10px; border: 2px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: var(--fc-shadow); }
      .modal-tab.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      .goal-pane[hidden], .chore-pane[hidden] { display: none; }
      .g-star-value-field, .g-reward-item-field { display: block; }
      .weekday-btn-row { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
      .weekday-btn { border: 1px solid var(--fc-border); border-radius: 8px; padding: 6px 8px; font-size: 12px; font-weight: 700; background: var(--fc-card); color: var(--fc-text); cursor: pointer; }
      .weekday-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      /* the "Custom recurrence" panel revealed by picking
         "Custom..." in the Recurs preset dropdown - see _recurFieldsHtml's
         own comment. A left border + slight indent/tint, same visual
         language as an expanded accordion elsewhere in this card, so it
         reads as "extra detail tucked under the dropdown" rather than a
         separate, disconnected section of the form. */
      .f-recur-custom-panel { border-left: 3px solid var(--fc-border); padding-left: 10px; margin-top: 4px; margin-left: 2px; background: var(--fc-surface-alt); border-radius: 0 8px 8px 0; padding-top: 8px; padding-bottom: 8px; }
      /* "A specific week each month" schedule's own nth select +
         weekday row + "First weekend" shortcut - see _recurFieldsHtml's
         own comment. */
      .f-recur-monthly-field select { margin-bottom: 4px; }
      .recur-quickpick-btn { margin-top: 6px; border: 1px dashed var(--fc-border); border-radius: 8px; padding: 6px 10px; font-size: 12px; font-weight: 700; background: transparent; color: var(--fc-accent); cursor: pointer; }
      .recur-quickpick-btn:hover { background: var(--fc-surface-alt); }
      .f-remind-row { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
      .f-remind-opt { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--fc-border); border-radius: 8px; padding: 6px 8px; font-size: 12px; font-weight: 700; background: var(--fc-card); color: var(--fc-text); cursor: pointer; margin: 0; }
      .f-remind-opt input { width: auto; margin: 0; }
      /* "Assign to multiple people" checkbox list - same visual
         pattern as .f-remind-row/.f-remind-opt just above (a wrapping row
         of pill checkboxes) rather than the tall native multi-select the
         Rotation group field below uses, since picking 2-3 people out of a
         short household member list reads better as checkboxes. */
      .f-assigned-multi-list { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
      .f-assigned-multi-list label { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--fc-border); border-radius: 8px; padding: 6px 8px; font-size: 12px; font-weight: 700; background: var(--fc-card); color: var(--fc-text); cursor: pointer; margin: 0; }
      .f-assigned-multi-list input { width: auto; margin: 0; }
      /* Assignment mode buttons in place of the old dropdown - see
         the ASSIGNMENT_MODES const's own comment. Same flex-row-of-buttons
         idiom as .modal-tabs/.modal-tab just above, under its own class
         names since this row drives a hidden <select> (see _openCreateModal)
         rather than a .tab-pane. */
      .f-mode-btn-group { display: flex; gap: 6px; flex-wrap: wrap; }
      .f-mode-btn { flex: 1 1 0; min-width: 88px; min-height: 40px; padding: 8px 10px; border-radius: 10px; border: 2px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 12.5px; font-weight: 700; cursor: pointer; box-shadow: var(--fc-shadow); }
      .f-mode-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      .f-mode-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      /* checkbox replaced with
         a 2-button toggle (Requires approval / Doesn't require approval).
         Deliberately its OWN class names (not .f-mode-btn-group/.f-mode-btn)
         even though the look is copied from that pattern - .f-mode-btn is
         also a test/query selector elsewhere (assignment-mode buttons) and
         sharing it would make both sets of buttons match the same
         querySelectorAll. See _approvalToggleHtml. Used in the create-chore
         modal, the edit-chore modal, and both Routine Library forms. */
      .approval-toggle-field { margin: 10px 0; }
      .approval-toggle-label { font-size: 12.5px; font-weight: 700; color: var(--fc-text-secondary); margin-bottom: 4px; }
      .approval-toggle-btn-group { display: flex; gap: 6px; flex-wrap: wrap; }
      .approval-toggle-btn { flex: 1 1 0; min-width: 88px; min-height: 40px; padding: 8px 10px; border-radius: 10px; border: 2px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 12.5px; font-weight: 700; cursor: pointer; box-shadow: var(--fc-shadow); }
      .approval-toggle-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      .approval-toggle-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .f-multi-assign-toggle { display: flex; align-items: center; gap: 6px; }
      .f-multi-assign-toggle input { width: auto; margin: 0; }
      .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
      .modal-actions button { border: none; border-radius: 10px; padding: 10px 18px; font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: var(--fc-shadow); }
      .save-btn { background: var(--fc-accent); color: var(--fc-accent-text); }
      .cancel-btn { background: var(--fc-surface-alt); color: var(--fc-text); }
      .form-error { color: var(--fc-accent3); font-size: 12px; margin-top: 6px; }
      /* Chore detail modal (click-a-card-for-info) */
      .detail-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .detail-status-badge { display: inline-block; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; color: var(--fc-text-secondary); background: var(--fc-surface-alt); border-radius: 8px; padding: 3px 8px; }
      .detail-close-btn { border: none; background: none; color: var(--fc-text-secondary); font-size: 16px; cursor: pointer; line-height: 1; padding: 4px; }
      .detail-title { margin: 8px 0 6px; font-size: 18px; font-weight: 800; }
      .detail-row { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; margin-bottom: 8px; }
      .detail-assignee-dot { width: 12px; height: 12px; border-radius: 50%; flex: 0 0 auto; }
      .detail-stats { display: flex; flex-wrap: wrap; gap: 8px 14px; font-size: 13px; color: var(--fc-text-secondary); font-weight: 700; margin-bottom: 8px; }
      .detail-recur { font-size: 12px; color: var(--fc-text-secondary); font-weight: 700; margin-bottom: 8px; }
      .detail-section-label { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--fc-text-secondary); font-weight: 800; margin: 10px 0 4px; }
      .detail-deps { display: flex; flex-wrap: wrap; gap: 6px; }
      .detail-dep { font-size: 12px; font-weight: 700; background: var(--fc-surface-alt); border-radius: 8px; padding: 3px 8px; }
      .detail-dep.met { color: var(--fc-accent2); }
      .detail-notes { font-size: 13px; line-height: 1.5; white-space: pre-wrap; background: var(--fc-card); border: 1px solid var(--fc-border); border-radius: 8px; padding: 10px; min-height: 20px; }
      .detail-notes.empty { color: var(--fc-text-secondary); font-style: italic; }
      .detail-rejected-note { font-size: 13px; line-height: 1.5; white-space: pre-wrap; background: var(--fc-card); border: 1px solid var(--fc-accent3); border-radius: 8px; padding: 10px; color: var(--fc-accent3); }
      /* Small screens (phones, and most wall tablets in portrait): the
         board was always a horizontally-scrolling row of columns, the
         usual kanban layout - fine on a wide dashboard, but on a narrow
         one it meant sideways scrolling to see anyone past the first
         column, with each column's own vertical scroll fighting the
         page's. Below this width the columns stack top-to-bottom instead
         and the board scrolls vertically as one list - the same
         breakpoint family-week-calendar-card.js already uses for its own
         mobile layout. */
      @media (max-width: 700px) {
        .board { flex-direction: column; overflow-x: hidden; overflow-y: auto; }
        .chore-column, .rewards-column { flex: 0 0 auto; min-width: 0; width: 100%; }
        .chore-col-body, .waiting-recur-col-body { overflow-y: visible; }
      }
      /* Gated on the choresConfettiOnComplete Settings
         field (off by default, same opt-in-cosmetic-feature convention as
         choresShowRewardsColumn/routinesEnabled) - see _fireConfetti.
         the actual .chore-confetti-overlay/-piece/@keyframes
         rules moved out of this shadow-root stylesheet into
         _confettiCss(), carried instead by _fireConfetti's own
         document.body-level portal - see that method's comment for why
         (Android app full-screen-overlay fix). Nothing here references
         them anymore; kept as a single source of truth in one place. */
    `;
  }
}

if (!customElements.get("family-hub-chores-card")) {
  customElements.define("family-hub-chores-card", FamilyHubChoresCard);
}

// dedicated editor element for getConfigElement above - same pattern as family-hub-goals-card.js's own editor
class FamilyHubChoresCardEditor extends HTMLElement {
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
        options.push({ value: "chore_bin", label: "Chore Bin" });
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
      { name: "show_waiting_to_recur", selector: { boolean: {} } },
      {
        name: "layout",
        selector: { select: { mode: "dropdown", options: [
          { value: "columns", label: "Side by side (default)" },
          { value: "single", label: "One column at a time - swipe to switch" },
        ] } },
      },
      { name: "show_stars", selector: { boolean: {} } },
      { name: "allow_star_requests", selector: { boolean: {} } },
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
    // show_waiting_to_recur defaults ON (absent = on), so show it that way
    this._form.data = { show_waiting_to_recur: true, layout: "columns", show_stars: true, allow_star_requests: true, ...(this._config || {}) };
    this._form.schema = this._schema();
    this._form.computeLabel = (s) => (
      s.name === "title" ? "Title" :
      s.name === "fab_position" ? "+ button position" :
      s.name === "theme_override" ? "Theme" :
      s.name === "people" ? "People on this card" :
      s.name === "show_waiting_to_recur" ? "Show Waiting to Recur" :
      s.name === "layout" ? "Layout" :
      s.name === "show_stars" ? "Show star balance next to names" :
      s.name === "allow_star_requests" ? "Show \"Ask for stars\"" : undefined
    );
    this._form.computeHelper = (s) => (
      s.name === "people"
        ? "Only these people get a spot (and a name pill) on this card. \"Just me\" means whoever is signed in (on a kiosk, whoever logged in with their PIN). Leave everything unchecked to show everyone."
        : s.name === "layout"
        ? "One column at a time suits phones and small tablets: swipe left or right (or tap the arrows) to move between people."
        : s.name === "theme_override"
        ? "Pin this one card to a specific theme, or leave on \"Use device settings\" to follow whatever this device/household normally shows."
        : undefined
    );
  }
}
if (!customElements.get("family-hub-chores-card-editor")) {
  customElements.define("family-hub-chores-card-editor", FamilyHubChoresCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "family-hub-chores-card")) {
  window.customCards.push({
    type: "family-hub-chores-card",
    name: "Family Hub Chores",
    description: "Full-screen chores board - one column per family member added to Family Hub plus a shared Chore Bin, drag-and-drop assignment, a creation form (and matching edit form for open chores) with sensor-trigger/rotation Advanced Settings, and one-click Nudge. Manage who's added to Family Hub and their permissions from the Family Hub calendar card's own Settings.",
  });
}
