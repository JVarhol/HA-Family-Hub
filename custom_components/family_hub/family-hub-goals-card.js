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
// Family Hub Goals card (v133+, v143+ "My Goals") - progress-tracked achievements a household attaches a reward to

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

const PALETTE = ["#a9c6c2", "#dba99c", "#d9bf7e", "#a8bd93", "#b9a7c9", "#cf8f6c", "#a89a83"];
const GOAL_REWARD_TYPE_STARS = "stars";
const GOAL_REWARD_TYPE_CATALOG_ITEM = "catalog_item";
const GOAL_STATUS_OPEN = "open";
const GOAL_STATUS_PENDING_VERIFICATION = "pending_verification";
const GOAL_STATUS_APPROVED = "approved";
// An approved goal used to just sit in the same flat My Goals list forever (see _goalCardHtml's own `.status-approved { opacity: 0.6 }`
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

class FamilyHubGoalsCard extends HTMLElement {
  static getStubConfig() {
    return { title: "My Goals" };
  }
  // switched from getConfigForm (a static schema) to getConfigElement
  static getConfigElement() {
    return document.createElement("family-hub-goals-card-editor");
  }
  // see family-hub-chores-card.js's identical setConfig/ _registerFabCoordinator comment for the full "dashboard" vs "card" design note
  setConfig(config) {
    this._config = {
      title: (config && config.title) || "My Goals",
      fab_position: config && config.fab_position === "card" ? "card" : "dashboard",
      // per-card-placement Theme override, set from this card's own "Edit Card" dialog - "" (the default
      theme_override: (config && typeof config.theme_override === "string") ? config.theme_override : "",
    };
    this._registerFabCoordinator();
    if (this._settingsCache === undefined) this._settingsCache = null;
    if (this._globalThemes === undefined) this._globalThemes = [];
    if (this._users === undefined) this._users = [];
    if (this._goals === undefined) this._goals = [];
    if (this._catalog === undefined) this._catalog = [];
    if (this._myPermissions === undefined) this._myPermissions = {};
    if (this._firstLoadPromise === undefined) this._firstLoadPromise = null;
    if (this._completedGoalsOpen === undefined) this._completedGoalsOpen = false;
    if (!this._built) this._build();
    this._render();
  }
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    this._ensureTranslationsLoaded();
    if (first) this._firstLoadPromise = this._initFirstLoad();
  }
  async _initFirstLoad() {
    await Promise.all([this._fetchSettings(), this._fetchUsers(), this._fetchGoals(), this._fetchCatalog(), this._fetchMyPermissions()]);
    // always fetched now, not just when the household has useGlobalTheme on
    await this._fetchGlobalThemes();
    this._startPolling();
    this._registerFabCoordinator();
    // see this file's own copy of the window.__familyHubTimerAlarm singleton (below) for the full design note.
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
  // joins the shared FAB-stacking coordinator (see the singleton block above this class)
  _registerFabCoordinator() {
    if (!window.__familyHubFabCoordinator) return;
    const cardRelative = this._config && this._config.fab_position === "card";
    if (cardRelative) this.setAttribute("fab-position", "card");
    else this.removeAttribute("fab-position");
    window.__familyHubFabCoordinator.registerClient(this, "goals", {}, (state) => {
      this.style.setProperty("--fh-fab-offset", `${state.offsetPx}px`);
      this._fabSuppressedByOther = state.otherProvidesGoalTab;
      // hideForModal is true while ANY Family Hub card on this dashboard has a full-screen modal open
      this._fabHiddenForModal = state.hideForModal;
      this._applyFabVisibility();
    }, { takesSlot: !cardRelative });
  }
  _applyFabVisibility() {
    const fab = this._root && this._root.querySelector(".add-goal-fab");
    if (fab) fab.hidden = !this._canManageGoals() || !!this._fabSuppressedByOther || !!this._fabHiddenForModal;
  }
  _startPolling() {
    if (this._interval) return;
    this._interval = setInterval(() => this._fetchGoals(), 20 * 1000);
  }
  connectedCallback() {
    if (this._hass && !this._interval) {
      if (this._firstLoadPromise) this._firstLoadPromise.then(() => this.isConnected && this._startPolling());
      else this._startPolling();
    }
    this._registerFabCoordinator();
  }
  disconnectedCallback() {
    if (this._interval) clearInterval(this._interval);
    this._interval = null;
    if (window.__familyHubFabCoordinator) window.__familyHubFabCoordinator.unregisterClient(this);
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
  _isAdmin() {
    return !!(this._hass && this._hass.user && this._hass.user.is_admin);
  }
  _myUserId() {
    return this._hass && this._hass.user ? this._hass.user.id : null;
  }
  // Same family_hub/permissions/get_mine pattern as every other Family Hub card
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
    return !!this._myPermissions[key];
  }
  // Same PERMISSION_ASSIGN tier Chores itself uses for create/edit/delete
  _canManageGoals() {
    return this._hasPermission("can_assign");
  }
  // Same PERMISSION_VERIFY-or-PERMISSION_COMPLETE_ANY tier ws_complete_chore already uses
  _canLogForOthers() {
    return this._hasPermission("can_verify") || this._hasPermission("can_complete_any");
  }
  _canVerify() {
    return this._hasPermission("can_verify");
  }
  _canLogProgress(goal) {
    return goal.assigned_to === this._myUserId() || this._canLogForOthers();
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
  // Reuses the exact same choresConfettiOnComplete setting and _fireConfetti/_confettiCss trio as family-hub-chores-card.js's own
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
      // An override pointing at a theme that's since been deleted/renamed falls back to the normal device/household resolution below rather than
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
  // Note: this card's own theme shape has no `fonts` concept (unlike family-week-calendar-card.js's version of this same method)
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
  async _fetchGoals() {
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/goals/list" });
      this._goals = (result && Array.isArray(result.goals)) ? result.goals : [];
    } catch (e) {
      // keep whatever we had
    }
    this._render();
  }
  // Only the catalog array is actually used here (the reward-item picker on the Create/Edit modal
  async _fetchCatalog() {
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/rewards/get_state" });
      this._catalog = (result && Array.isArray(result.catalog)) ? result.catalog : [];
    } catch (e) {
      this._catalog = [];
    }
  }
  _userName(id) {
    const u = this._users.find((x) => x.id === id);
    return u ? u.name : id;
  }
  _userColor(id) {
    const profiles = (this._settingsCache && this._settingsCache.userProfiles) || {};
    const custom = profiles[id] && profiles[id].color;
    if (custom) return custom;
    const idx = this._users.findIndex((x) => x.id === id);
    return idx >= 0 ? PALETTE[idx % PALETTE.length] : "#c9c2b3";
  }
  _isFamilyHubMember(userId) {
    const memberIds = (this._settingsCache && this._settingsCache.memberUserIds) || [];
    return memberIds.includes(userId);
  }
  // Same narrower includeInChores opt-out Chores/Rewards already read - Goals shares the exact same assignee-eligibility pool as Chores
  _isChoresIncluded(userId) {
    if (!this._isFamilyHubMember(userId)) return false;
    const profiles = (this._settingsCache && this._settingsCache.userProfiles) || {};
    const profile = profiles[userId];
    // a kiosk account (a shared tablet login) is never on Chores, Rewards or Goals
    return !profile || (profile.includeInChores !== false && !profile.isKioskAccount);
  }
  _memberUsers() {
    return this._users.filter((u) => this._isChoresIncluded(u.id));
  }
  _catalogItem(id) {
    return this._catalog.find((it) => it.id === id) || null;
  }
  _esc(s) {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  }
  _escAttr(s) {
    return this._esc(s).replace(/"/g, "&quot;");
  }
  _isoToLocalDatetimeInputValue(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
        </div>
        <div class="board"></div>
      </ha-card>
      <div class="modal-overlay create-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay edit-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay reject-modal"><div class="modal-box"></div></div>
      <button class="add-goal-fab" title="Add a goal" data-i18n-title="goals.add_a_goal" aria-haspopup="true" hidden>&#65291;</button>
    `;
    this._root = root;
    root.querySelector(".title").textContent = this._config.title;
    root.querySelector(".add-goal-fab").addEventListener("click", () => this._openCreateModal());
    root.querySelectorAll(".modal-overlay").forEach((overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.classList.remove("open");
      });
    });
    // Delegated click handling for every goal-card action button, same pattern family-hub-chores-card.js's own board uses
    root.querySelector(".board").addEventListener("click", (e) => this._onBoardClick(e));
  }

  _onBoardClick(e) {
    const completedHeader = e.target.closest(".completed-goals-header");
    const logBtn = e.target.closest(".goal-log-btn");
    const approveBtn = e.target.closest(".goal-approve-btn");
    const rejectBtn = e.target.closest(".goal-reject-btn");
    const editBtn = e.target.closest(".goal-edit-btn");
    const deleteBtn = e.target.closest(".goal-delete-btn");
    const completeBtn = e.target.closest(".goal-complete-btn");
    if (completedHeader) return this._toggleCompletedGoals();
    if (logBtn) return this._logProgress(logBtn.dataset.id);
    if (approveBtn) return this._approve(approveBtn.dataset.id);
    if (rejectBtn) return this._openRejectModal(rejectBtn.dataset.id);
    if (editBtn) return this._openEditModal(editBtn.dataset.id);
    if (deleteBtn) return this._delete(deleteBtn.dataset.id);
    if (completeBtn) return this._archive(completeBtn.dataset.id);
  }
  _toggleCompletedGoals() {
    this._completedGoalsOpen = !this._completedGoalsOpen;
    this._render();
  }

  async _logProgress(goalId) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/goals/log_progress", goal_id: goalId });
    } catch (e) {
      // server already validated/permission-gated this - a stale click just no-ops
    }
    await this._fetchGoals();
  }
  async _approve(goalId) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/goals/approve", goal_id: goalId });
    } catch (e) {
    }
    await this._fetchGoals();
  }
  // was a bare window.prompt() for the optional reason - replaced with a proper modal
  _openRejectModal(goalId) {
    const goal = this._goals.find((g) => g.id === goalId);
    if (!goal) return;
    const overlay = this._root.querySelector(".reject-modal");
    const box = overlay.querySelector(".modal-box");
    box.innerHTML = `
      <h3>${this._t("goals.send_back_modal_title", 'Send back "%title%"', { title: this._esc(goal.title) })}</h3>
      <label>${this._t("goals.reject_reason_label", "Anything you want to tell them about why? (optional)")}<textarea data-fh-placeholder="text.not_quite_try_again" class="f-reject-reason" rows="3" placeholder="${__fhT("text.not_quite_try_again", "Not quite - try again", null, "h")}"></textarea></label>
      <div class="modal-actions">
        <button class="cancel-btn">${this._t("common.cancel", "Cancel")}</button>
        <button class="save-btn">${this._t("goals.send_back", "Send back")}</button>
      </div>
    `;
    box.querySelector(".cancel-btn").addEventListener("click", () => overlay.classList.remove("open"));
    box.querySelector(".save-btn").addEventListener("click", () => this._submitReject(goalId, overlay, box));
    overlay.classList.add("open");
    box.querySelector(".f-reject-reason").focus();
  }
  async _submitReject(goalId, overlay, box) {
    const reason = box.querySelector(".f-reject-reason").value.trim();
    overlay.classList.remove("open");
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/goals/reject", goal_id: goalId, reason });
    } catch (e) {
      // server already validated/permission-gated this - a stale click just no-ops
    }
    await this._fetchGoals();
  }
  // The "Complete" button on an achieved goal - tucks it into the Completed accordion below the active list instead of leaving it sitting in
  async _archive(goalId) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/goals/archive", goal_id: goalId });
      // Fires on "Complete" (archiving an already-approved goal) - that's the moment with its own literal "Complete" button
      if (this._confettiOnCompleteEnabled()) this._fireConfetti();
    } catch (e) {
      // server already validated/permission-gated this - a stale click just no-ops
    }
    await this._fetchGoals();
  }
  async _delete(goalId) {
    if (!window.confirm(this._t("goals.delete_confirm", "Delete this goal? This can\'t be undone."))) return;
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/goals/delete", goal_id: goalId });
    } catch (e) {
    }
    await this._fetchGoals();
  }

  // --- Create/Edit modal ------------------------------------------------

  _rewardFieldsHtml(goal) {
    const g = goal || {};
    const rewardType = g.reward_type || GOAL_REWARD_TYPE_STARS;
    const catalogOptions = this._catalog
      .map((it) => `<option value="${it.id}" ${g.reward_item_id === it.id ? "selected" : ""}>${this._esc(it.title)} (${it.cost_stars}&#11088;)</option>`)
      .join("");
    return `
      <label>${this._t("goals.reward_label", "Reward")}
        <select class="f-reward-type">
          <option value="${GOAL_REWARD_TYPE_STARS}" ${rewardType === GOAL_REWARD_TYPE_STARS ? "selected" : ""}>${this._t("goals.reward_type_stars", "Stars")}</option>
          <option value="${GOAL_REWARD_TYPE_CATALOG_ITEM}" ${rewardType === GOAL_REWARD_TYPE_CATALOG_ITEM ? "selected" : ""}>${this._t("goals.reward_type_catalog_item", "A specific reward from the catalog")}</option>
        </select>
      </label>
      <label class="f-star-value-field">${this._t("goals.how_many_stars_label", "How many stars")}<input type="number" class="f-star-value" min="1" value="${g.star_value || 1}"></label>
      <label class="f-reward-item-field">${this._t("goals.which_reward_label", "Which reward")}<select class="f-reward-item">${catalogOptions}</select></label>
    `;
  }
  _wireRewardFields(box) {
    const typeSelect = box.querySelector(".f-reward-type");
    const starField = box.querySelector(".f-star-value-field");
    const itemField = box.querySelector(".f-reward-item-field");
    const sync = () => {
      const isStars = typeSelect.value === GOAL_REWARD_TYPE_STARS;
      starField.style.display = isStars ? "" : "none";
      itemField.style.display = isStars ? "none" : "";
    };
    typeSelect.addEventListener("change", sync);
    sync();
  }
  _applyRewardFieldsToPayload(box, payload) {
    const rewardType = box.querySelector(".f-reward-type").value;
    payload.reward_type = rewardType;
    if (rewardType === GOAL_REWARD_TYPE_STARS) {
      payload.star_value = parseInt(box.querySelector(".f-star-value").value, 10) || 0;
      payload.reward_item_id = null;
    } else {
      payload.reward_item_id = box.querySelector(".f-reward-item").value || null;
      payload.star_value = 0;
    }
  }

  _openCreateModal() {
    const overlay = this._root.querySelector(".create-modal");
    const box = overlay.querySelector(".modal-box");
    const userOptions = this._memberUsers().map((u) => `<option value="${u.id}">${this._esc(u.name)}</option>`).join("");
    box.innerHTML = `
      <h3>${this._t("goals.add_a_goal", "Add a goal")}</h3>
      <label>${this._t("goals.title_label", "Title")}<input data-fh-placeholder="text.get_3_bs_in_math" type="text" class="f-title" placeholder="${__fhT("text.get_3_bs_in_math", "Get 3 Bs in math", null, "h")}"></label>
      <label>${this._t("goals.for_label", "For")}<select class="f-assigned">${userOptions}</select></label>
      <label>${this._t("goals.target_count_label", "Target count (how many times to log before it\'s done)")}<input type="number" class="f-target" min="1" value="1"></label>
      ${this._rewardFieldsHtml(null)}
      <label>${this._t("goals.due_date_label", "Due date (optional)")}<input type="datetime-local" class="f-due"></label>
      <label>${this._t("goals.notes_label", "Notes")}<textarea data-fh-placeholder="text.any_details_worth_knowing" class="f-notes" rows="3" placeholder="${__fhT("text.any_details_worth_knowing", "Any details worth knowing", null, "h")}"></textarea></label>
      <div class="modal-actions">
        <button class="cancel-btn">${this._t("common.cancel", "Cancel")}</button>
        <button class="save-btn">${this._t("common.save", "Save")}</button>
      </div>
      <div class="form-error"></div>
    `;
    this._wireRewardFields(box);
    box.querySelector(".cancel-btn").addEventListener("click", () => overlay.classList.remove("open"));
    box.querySelector(".save-btn").addEventListener("click", () => this._submitCreate(overlay, box));
    overlay.classList.add("open");
  }

  async _submitCreate(overlay, box) {
    const errEl = box.querySelector(".form-error");
    errEl.textContent = "";
    const title = box.querySelector(".f-title").value.trim();
    if (!title) {
      errEl.textContent = this._t("goals.needs_title", "A goal needs a title.");
      return;
    }
    const assignedTo = box.querySelector(".f-assigned").value;
    if (!assignedTo) {
      errEl.textContent = this._t("goals.needs_assignee", "A goal needs someone it belongs to.");
      return;
    }
    const payload = {
      type: "family_hub/goals/create",
      title,
      assigned_to: assignedTo,
      target_count: parseInt(box.querySelector(".f-target").value, 10) || 1,
      notes: box.querySelector(".f-notes").value.trim(),
    };
    const dueVal = box.querySelector(".f-due").value;
    if (dueVal) payload.due_date = new Date(dueVal).toISOString();
    this._applyRewardFieldsToPayload(box, payload);
    try {
      await this._hass.connection.sendMessagePromise(payload);
    } catch (e) {
      errEl.textContent = (e && e.message) || this._t("goals.save_failed", "Couldn\'t save this goal.");
      return;
    }
    overlay.classList.remove("open");
    await this._fetchGoals();
  }

  _openEditModal(goalId) {
    const goal = this._goals.find((g) => g.id === goalId);
    if (!goal) return;
    const overlay = this._root.querySelector(".edit-modal");
    const box = overlay.querySelector(".modal-box");
    const userOptions = this._memberUsers()
      .map((u) => `<option value="${u.id}" ${goal.assigned_to === u.id ? "selected" : ""}>${this._esc(u.name)}</option>`)
      .join("");
    box.innerHTML = `
      <h3>${this._t("goals.edit_goal_title", "Edit goal")}</h3>
      <label>${this._t("goals.title_label", "Title")}<input type="text" class="f-title" value="${this._escAttr(goal.title)}"></label>
      <label>${this._t("goals.for_label", "For")}<select class="f-assigned">${userOptions}</select></label>
      <label>${this._t("goals.target_count_label", "Target count (how many times to log before it\'s done)")}<input type="number" class="f-target" min="1" value="${goal.target_count || 1}"></label>
      ${this._rewardFieldsHtml(goal)}
      <label>${this._t("goals.due_date_label", "Due date (optional)")}<input type="datetime-local" class="f-due" value="${this._isoToLocalDatetimeInputValue(goal.due_date)}"></label>
      <label>${this._t("goals.notes_label", "Notes")}<textarea class="f-notes" rows="3">${this._esc(goal.notes || "")}</textarea></label>
      <div class="modal-actions">
        <button class="cancel-btn">${this._t("common.cancel", "Cancel")}</button>
        <button class="save-btn">${this._t("common.save", "Save")}</button>
      </div>
      <div class="form-error"></div>
    `;
    this._wireRewardFields(box);
    box.querySelector(".cancel-btn").addEventListener("click", () => overlay.classList.remove("open"));
    box.querySelector(".save-btn").addEventListener("click", () => this._submitEdit(goalId, overlay, box));
    overlay.classList.add("open");
  }

  async _submitEdit(goalId, overlay, box) {
    const errEl = box.querySelector(".form-error");
    errEl.textContent = "";
    const title = box.querySelector(".f-title").value.trim();
    if (!title) {
      errEl.textContent = this._t("goals.needs_title", "A goal needs a title.");
      return;
    }
    const payload = {
      type: "family_hub/goals/update",
      goal_id: goalId,
      title,
      assigned_to: box.querySelector(".f-assigned").value,
      target_count: parseInt(box.querySelector(".f-target").value, 10) || 1,
      notes: box.querySelector(".f-notes").value.trim(),
    };
    const dueVal = box.querySelector(".f-due").value;
    payload.due_date = dueVal ? new Date(dueVal).toISOString() : null;
    this._applyRewardFieldsToPayload(box, payload);
    try {
      await this._hass.connection.sendMessagePromise(payload);
    } catch (e) {
      errEl.textContent = (e && e.message) || this._t("goals.save_failed", "Couldn\'t save this goal.");
      return;
    }
    overlay.classList.remove("open");
    await this._fetchGoals();
  }

  // --- Rendering ----------------------------------------------------------

  _rewardSummary(goal) {
    if (goal.reward_type === GOAL_REWARD_TYPE_CATALOG_ITEM) {
      const item = this._catalogItem(goal.reward_item_id);
      return item ? `${item.icon || "&#127873;"} ${this._esc(item.title)}` : this._t("goals.reward_unavailable", "(reward no longer available)");
    }
    const stars = goal.star_value || 0;
    const starsText = stars === 1
      ? this._t("goals.stars_one", "%n% star", { n: stars })
      : this._t("goals.stars_other", "%n% stars", { n: stars });
    return `&#11088; ${starsText}`;
  }

  _goalCardHtml(goal) {
    const target = Math.max(1, goal.target_count || 1);
    const current = Math.min(target, goal.current_count || 0);
    const canLog = goal.status === GOAL_STATUS_OPEN && this._canLogProgress(goal);
    const canManage = this._canManageGoals();
    const canVerify = this._canVerify();
    // Only an achieved (not yet archived) goal can be archived - the same "owner or manager" pool _canLogProgress already checks
    const canArchive = goal.status === GOAL_STATUS_APPROVED && (goal.assigned_to === this._myUserId() || canManage);
    const progressLabel = target > 1
      ? this._t("goals.progress_logged", "%current% / %target% logged", { current, target })
      : (current >= target ? this._t("common.done", "Done") : this._t("goals.not_yet_done", "Not yet done"));
    let statusBadge = "";
    if (goal.status === GOAL_STATUS_PENDING_VERIFICATION) statusBadge = `<span class="goal-badge pending">${this._t("goals.awaiting_approval", "Awaiting approval")}</span>`;
    // the achieved badge now shows the reward inline ("Achieved!
    else if (goal.status === GOAL_STATUS_APPROVED || goal.status === GOAL_STATUS_ARCHIVED) {
      statusBadge = `<span class="goal-badge approved">${this._t("goals.achieved_with_reward", "Achieved! %reward%", { reward: this._rewardSummary(goal) })}</span>`;
    }
    if (goal.rejected_at && goal.status === GOAL_STATUS_OPEN) {
      const badgeText = goal.reject_reason
        ? this._t("goals.sent_back_with_reason", "Sent back: %reason%", { reason: this._esc(goal.reject_reason) })
        : this._t("goals.sent_back", "Sent back");
      statusBadge += `<span class="goal-badge rejected">${badgeText}</span>`;
    }
    let actions = "";
    if (canLog) actions += `<button class="goal-log-btn" data-id="${goal.id}">${target > 1 ? this._t("goals.log_progress", "Log progress") : this._t("goals.mark_done", "Mark done")}</button>`;
    if (goal.status === GOAL_STATUS_PENDING_VERIFICATION && canVerify) {
      actions += `<button class="goal-approve-btn" data-id="${goal.id}">${this._t("goals.approve", "Approve")}</button>`;
      actions += `<button class="goal-reject-btn" data-id="${goal.id}">${this._t("goals.send_back", "Send back")}</button>`;
    }
    if (canArchive) actions += `<button class="goal-complete-btn" data-id="${goal.id}">${this._t("goals.complete", "Complete")}</button>`;
    if (goal.status === GOAL_STATUS_OPEN && canManage) {
      actions += `<button class="goal-edit-btn" data-id="${goal.id}">${this._t("common.edit", "Edit")}</button>`;
    }
    if (canManage) actions += `<button class="goal-delete-btn" data-id="${goal.id}">&times;</button>`;
    const dueHtml = goal.due_date ? `<div class="goal-due">${this._t("goals.due_x", "Due %date%", { date: this._fmtDateTime(new Date(goal.due_date)) })}</div>` : "";
    const notesHtml = goal.notes ? `<div class="goal-notes">${this._esc(goal.notes)}</div>` : "";
    return `
      <div class="goal-card status-${goal.status}" data-id="${goal.id}">
        <div class="goal-title">${this._esc(goal.title)}</div>
        <div class="goal-progress">${progressLabel}</div>
        <div class="goal-reward">${this._rewardSummary(goal)}</div>
        ${dueHtml}
        ${notesHtml}
        ${statusBadge}
        <div class="goal-actions">${actions}</div>
      </div>
    `;
  }

  _myGoals() {
    const me = this._myUserId();
    if (!me) return [];
    return this._goals
      .filter((g) => g.assigned_to === me && g.status !== GOAL_STATUS_ARCHIVED)
      .sort((a, b) => {
        const rank = (g) => (g.status === GOAL_STATUS_PENDING_VERIFICATION ? 0 : g.status === GOAL_STATUS_OPEN ? 1 : 2);
        return rank(a) - rank(b) || String(a.created_at).localeCompare(String(b.created_at));
      });
  }
  // Most-recently-archived first - same "what did we just finish" framing as the chores card's own Completed accordion
  _archivedGoals() {
    const me = this._myUserId();
    if (!me) return [];
    return this._goals
      .filter((g) => g.assigned_to === me && g.status === GOAL_STATUS_ARCHIVED)
      .sort((a, b) => new Date(b.archived_at || 0).getTime() - new Date(a.archived_at || 0).getTime());
  }
  _completedGoalsAccordionHtml() {
    const archived = this._archivedGoals();
    if (!archived.length) return "";
    const open = this._completedGoalsOpen;
    const body = open ? `<div class="completed-goals-body">${archived.map((g) => this._goalCardHtml(g)).join("")}</div>` : "";
    return `
      <div class="completed-goals-row">
        <div class="completed-goals-header">
          <span class="completed-goals-toggle-icon">${open ? "&#9662;" : "&#9656;"}</span>
          <span class="completed-goals-title">${this._t("goals.completed_title", "Completed")}</span>
          <span class="completed-goals-badge">${archived.length}</span>
        </div>
        ${body}
      </div>
    `;
  }
  _boardHtml() {
    if (!this._myUserId()) {
      return `<div class="empty-state">${this._t("goals.login_prompt", "Log in to see your goals.")}</div>`;
    }
    const goals = this._myGoals();
    const listHtml = goals.length
      ? `<div class="goal-list">${goals.map((g) => this._goalCardHtml(g)).join("")}</div>`
      : `<div class="empty-state">${this._t("goals.no_goals_yet", "No goals yet.")}</div>`;
    return `${listHtml}${this._completedGoalsAccordionHtml()}`;
  }

  _render() {
    if (!this._root) return;
    this._applyFabVisibility();
    this._root.querySelector(".board").innerHTML = this._boardHtml();
  }

  _css() {
    return `
      /* position:relative is the containing block .add-goal-fab
         needs when [fab-position="card"] switches it to position:absolute. */
      :host { display: block; position: relative; font-family: 'Varela Round', sans-serif; }
      ha-card { background: var(--fc-bg); background-image: var(--fc-bg-overlay-image, none), var(--fc-bg-image, none); background-size: cover, var(--fc-bg-size, cover); background-position: center, var(--fc-bg-position, center); color: var(--fc-text); padding: 14px; }
      .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
      .title { font-size: 18px; font-weight: 800; }
      .board { display: block; }
      .goal-list { display: flex; flex-direction: column; gap: 8px; }
      .empty-state { font-size: 12px; color: var(--fc-text-secondary); padding: 8px 2px; }
      .goal-card { background: var(--fc-card); border-radius: 10px; padding: 10px; box-shadow: var(--fc-shadow, 0 2px 5px rgba(0,0,0,0.08)); display: flex; flex-direction: column; gap: 4px; }
      /* "Liquid glass" support, same convention as
         family-week-calendar-card.js - see that file's own comment on its
         backdrop-filter rule for the full reasoning. Zero-cost for every
         existing theme (blur(0px) is a no-op); -webkit- prefix needed for
         Safari/iOS webviews. */
      .goal-card, .cancel-btn, .goal-badge.pending, .goal-delete-btn {
        backdrop-filter: blur(var(--fc-glass-blur, 0px));
        -webkit-backdrop-filter: blur(var(--fc-glass-blur, 0px));
      }
      .goal-card.status-approved { opacity: 0.6; }
      .goal-card.status-archived { opacity: 0.55; }
      .goal-title { font-weight: 700; font-size: 13px; }
      .goal-progress { font-size: 12px; color: var(--fc-accent2); font-weight: 700; }
      .goal-reward { font-size: 12px; color: var(--fc-accent); }
      .goal-due, .goal-notes { font-size: 11px; color: var(--fc-text-secondary); }
      .goal-badge { display: inline-block; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; border-radius: 6px; padding: 2px 6px; margin-top: 2px; width: fit-content; }
      .goal-badge.pending { background: var(--fc-surface2); color: var(--fc-accent2); }
      .goal-badge.approved { background: var(--fc-accent2); color: var(--fc-accent-text); }
      .goal-badge.rejected { background: var(--fc-accent3); color: var(--fc-accent-text); }
      .goal-actions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
      .goal-actions button { border: none; border-radius: 8px; padding: 4px 8px; font-size: 11px; font-weight: 700; cursor: pointer; background: var(--fc-accent); color: var(--fc-accent-text); }
      .goal-delete-btn { background: var(--fc-surface2) !important; color: var(--fc-accent3) !important; }
      .goal-complete-btn { background: var(--fc-accent2) !important; }
      /* the Completed accordion - same collapsed-by-default,
         click-to-expand shape as family-hub-chores-card.js's own per-column
         Completed accordion (_completedChoresAccordionHtml), just a single
         one here since My Goals is already one flat list, not one per
         column. */
      .completed-goals-row { border-top: 1px solid var(--fc-border); margin-top: 10px; padding-top: 6px; }
      .completed-goals-header { display: flex; align-items: center; gap: 6px; padding: 8px 2px; font-size: 12px; font-weight: 700; cursor: pointer; color: var(--fc-text-secondary); }
      .completed-goals-title { flex: 1; }
      .completed-goals-badge { background: var(--fc-surface2); color: var(--fc-accent2); border-radius: 8px; padding: 1px 7px; font-size: 11px; }
      .completed-goals-body { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
      /* bottom offset by --fh-fab-offset - see family-hub-chores-card.js's identical comment. */
      .add-goal-fab { position: fixed; right: 18px; bottom: calc(18px + var(--fh-fab-offset, 0px)); z-index: 900; width: 56px; height: 56px; border-radius: 50%; border: none; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 28px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(58,53,44,0.35); transition: bottom 0.15s ease; }
      .add-goal-fab[hidden] { display: none; }
      /* fab_position: "card" - see family-hub-chores-card.js's
         identical .add-chore-fab rule for the same mechanism. */
      :host([fab-position="card"]) .add-goal-fab { position: absolute; bottom: 18px; }
      .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; align-items: center; justify-content: center; }
      .modal-overlay.open { display: flex; }
      .modal-box { background: var(--fc-bg); color: var(--fc-text); border-radius: 14px; padding: 18px; width: min(90vw, 420px); max-height: 85vh; overflow-y: auto; }
      .modal-box label { display: block; margin: 8px 0; font-size: 13px; font-weight: 700; }
      .modal-box input, .modal-box select, .modal-box textarea { width: 100%; box-sizing: border-box; margin-top: 4px; padding: 8px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 13px; font-family: inherit; }
      .modal-box textarea { resize: vertical; }
      .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
      .modal-actions button { border: none; border-radius: 10px; padding: 8px 16px; font-weight: 700; cursor: pointer; }
      .save-btn { background: var(--fc-accent); color: var(--fc-accent-text); }
      .cancel-btn { background: var(--fc-surface-alt); color: var(--fc-text); }
      .form-error { color: var(--fc-accent3); font-size: 12px; margin-top: 6px; }
    `;
  }
}

customElements.define("family-hub-goals-card", FamilyHubGoalsCard);

// the card's native "Edit Card" config editor - a thin wrapper around Home Assistant's own <ha-form>
class FamilyHubGoalsCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    if (!this._themeOptions) this._fetchThemeOptions();
    else this._render();
  }
  // Duplicated (not shared/imported) from the card class's own _fetchGlobalThemes/_nativeHaThemeEntries just above
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
      s.name === "theme_override" ? "Theme" : undefined
    );
    this._form.computeHelper = (s) => (
      s.name === "theme_override"
        ? "Pin this one card to a specific theme, or leave on \"Use device settings\" to follow whatever this device/household normally shows."
        : undefined
    );
  }
}
if (!customElements.get("family-hub-goals-card-editor")) {
  customElements.define("family-hub-goals-card-editor", FamilyHubGoalsCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "family-hub-goals-card")) {
  window.customCards.push({
    type: "family-hub-goals-card",
    name: "Family Hub My Goals",
    description: "Progress-tracked achievements with a reward attached - \"get 3 Bs in math,\" \"practice piano 2 times\" - shows only the logged-in viewer's own goals.",
  });
}
