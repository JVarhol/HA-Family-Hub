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
// Family Hub Active Timers card - "We should also build an active timers card that shows all the timers active in the house

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
// Must match const.py's TIMER_PRESET_MINUTES.
const TIMER_PRESETS = [5, 15, 30, 60];
const UNASSIGNED_COLOR = "#c9c2b3";

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

class FamilyHubActiveTimersCard extends HTMLElement {
  static getStubConfig() {
    return { title: "Active Timers" };
  }
  // switched to getConfigElement (a real custom element) so the new theme_override field can offer a live-fetched theme list
  static getConfigElement() {
    return document.createElement("family-hub-active-timers-card-editor");
  }
  setConfig(config) {
    this._config = {
      title: (config && config.title) || "Active Timers",
      // "" (default) = "Use device settings" - see
      // _resolveTheme below for where this takes priority.
      theme_override: (config && typeof config.theme_override === "string") ? config.theme_override : "",
    };
    if (this._settingsCache === undefined) this._settingsCache = null;
    if (this._globalThemes === undefined) this._globalThemes = [];
    if (this._users === undefined) this._users = [];
    if (this._timers === undefined) this._timers = [];
    if (this._myPermissions === undefined) this._myPermissions = {};
    if (this._firstLoadPromise === undefined) this._firstLoadPromise = null;
    // Quick-timer modal draft: which preset (if any) is selected, so the
    // chosen chip can show as active and the custom box can override it.
    if (this._draftMinutes === undefined) this._draftMinutes = null;
    if (!this._built) this._build();
    this._render();
  }
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    this._ensureTranslationsLoaded();
    if (first) this._firstLoadPromise = this._initFirstLoad();
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
    await Promise.all([this._fetchSettings(), this._fetchUsers(), this._fetchTimers(), this._fetchMyPermissions()]);
    // always fetched now (not just when useGlobalTheme is on) -
    // a per-card theme_override needs this list regardless.
    await this._fetchGlobalThemes();
    // backfill for a household that upgraded without re-saving Settings (which is the calendar card's own trigger for this same reconcile).
    this._ensureTimerHelpers((this._getSettings().memberUserIds) || []).catch(() => {});
    this._startPolling();
    this._startTimerTicker();
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

  // see family-week-calendar-card.js's copy of this function for the full design note (why the frontend does this rather than Python
  async _ensureTimerHelpers(memberUserIds) {
    if (!this._hass || !this._hass.connection || !this._hass.connection.sendMessagePromise) return;
    const wanted = [];
    for (const uid of Array.isArray(memberUserIds) ? memberUserIds : []) {
      const match = (this._users || []).find((u) => u.id === uid);
      const name = match ? match.name || match.id : uid;
      const slug = this._slugifyForEntity(name);
      if (!slug) continue;
      wanted.push({ entityId: `timer.family_hub_${slug}`, name: `Family Hub ${name}` });
    }
    for (let i = 1; i <= 4; i++) {
      wanted.push({ entityId: `timer.family_hub_family_${i}`, name: `Family Hub Family ${i}` });
    }
    const existing = this._hass.states || {};
    for (const w of wanted) {
      if (existing[w.entityId]) continue;
      await this._createTimerHelper(w.name);
    }
  }
  _slugifyForEntity(name) {
    let out = "";
    let prevUnderscore = false;
    for (const ch of String(name || "").toLowerCase()) {
      if (/[a-z0-9]/.test(ch) && /^[\x00-\x7F]*$/.test(ch)) {
        out += ch;
        prevUnderscore = false;
      } else if (!prevUnderscore) {
        out += "_";
        prevUnderscore = true;
      }
    }
    return out.replace(/^_+|_+$/g, "");
  }
  async _createTimerHelper(name) {
    try {
      await this._hass.connection.sendMessagePromise({
        type: "timer/create",
        name,
        duration: "00:05:00",
        icon: "mdi:timer-outline",
        restore: true,
      });
    } catch (e) {
      try {
        await this._hass.connection.sendMessagePromise({
          type: "timer/create",
          name,
          duration: "00:05:00",
          icon: "mdi:timer-outline",
        });
      } catch (e2) {
      }
    }
  }
  _startPolling() {
    if (this._interval) return;
    this._interval = setInterval(() => this._fetchTimers(), 20 * 1000);
  }
  connectedCallback() {
    if (this._hass && !this._interval) {
      if (this._firstLoadPromise) this._firstLoadPromise.then(() => this.isConnected && this._startPolling());
      else this._startPolling();
    }
    this._startTimerTicker();
  }
  disconnectedCallback() {
    if (this._interval) clearInterval(this._interval);
    this._interval = null;
    this._stopTimerTicker();
    if (this._alarmUnsub) {
      this._alarmUnsub();
      this._alarmUnsub = null;
    }
  }
  getCardSize() {
    return 6;
  }
  getGridOptions() {
    return { columns: 12, min_columns: 6, max_columns: 12, min_rows: 4 };
  }
  _isAdmin() {
    return !!(this._hass && this._hass.user && this._hass.user.is_admin);
  }
  _myUserId() {
    return this._hass && this._hass.user ? this._hass.user.id : null;
  }
  _esc(s) {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
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
    return { theme: this._defaultTheme(), useGlobalTheme: true, globalThemeId: "slate" };
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
    const cardOpacity = typeof g.cardOpacity === "number" ? g.cardOpacity : 100;
    const glassBlur = typeof g.glassBlur === "number" ? g.glassBlur : 0;
    return { colors, cardOpacity, glassBlur, background: g.background || null };
  }
  _resolveTheme(settings) {
    const local = settings.theme || this._defaultTheme();
    // a per-card-placement Theme override (from this card's own native "Edit Card" dialog) wins over this device's own override and the
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
  }
  async _fetchGlobalThemes() {
    let custom = [];
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "theme_builder/list" });
      custom = (result && Array.isArray(result.themes)) ? result.themes : [];
    } catch (e) {
      custom = [];
    }
    // also merge in every installed native Home Assistant theme
    // - duplicated (not shared/imported) from family-week-calendar-card.js.
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
  async _fetchUsers() {
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/list_users" });
      this._users = (result && Array.isArray(result.users)) ? result.users : [];
    } catch (e) {
      this._users = [];
    }
  }

  // -- Timers --------------------------------------------------------------- Same shape as the chore/reward cards' own copies
  async _fetchTimers() {
    if (!this._hass) return;
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/timers/list" });
      this._timers = (result && result.timers) || [];
    } catch (e) {
      this._timers = [];
    }
    this._render();
  }
  // Every OTHER `timer.*` entity in the house that's currently counting down
  _foreignTimerEntities() {
    if (!this._hass || !this._hass.states) return [];
    const adopted = new Set((this._timers || []).map((t) => t.entity_id).filter(Boolean));
    const out = [];
    for (const entityId of Object.keys(this._hass.states)) {
      if (entityId.indexOf("timer.") !== 0) continue;
      if (adopted.has(entityId)) continue;
      const state = this._hass.states[entityId];
      if (!state || state.state !== "active") continue;
      const attrs = state.attributes || {};
      out.push({
        uid: `ha:${entityId}`,
        kind: "native",
        title: attrs.friendly_name || this._humanizeEntityId(entityId),
        user_id: null,
        duration_minutes: this._parseHaDurationMinutes(attrs.duration),
        entity_id: entityId,
        foreign: true,
      });
    }
    return out;
  }
  _humanizeEntityId(entityId) {
    const raw = String(entityId || "").split(".")[1] || entityId;
    return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  // HA's own timer.duration attribute is "HH:MM:SS" - parsed defensively (falls back to 0, i.e. "of 0m"
  _parseHaDurationMinutes(duration) {
    const parts = String(duration || "").split(":").map((p) => parseInt(p, 10));
    if (!parts.length || parts.some((p) => !Number.isFinite(p))) return 0;
    if (parts.length === 3) return Math.round(parts[0] * 60 + parts[1] + parts[2] / 60);
    if (parts.length === 2) return Math.round(parts[0] + parts[1] / 60);
    return 0;
  }
  // Everything this board shows: Family Hub's own tracked timers plus every other running HA timer.* entity.
  _allTimers() {
    return (this._timers || []).concat(this._foreignTimerEntities());
  }
  _startTimerTicker() {
    if (this._timerTicker) return;
    this._timerTicker = setInterval(() => this._renderTimerCountdowns(), 1000);
  }
  _stopTimerTicker() {
    if (this._timerTicker) clearInterval(this._timerTicker);
    this._timerTicker = null;
  }
  // this browser tab's own stable id - sessionStorage-backed (survives a reload of this same tab, gone once the tab actually closes)
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
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }
  _formatTimerLength(minutes) {
    const m = Number(minutes) || 0;
    if (m >= 60 && m % 60 === 0) return `${m / 60}h`;
    if (m > 60) return `${Math.floor(m / 60)}h${Math.round(m % 60)}m`;
    const totalSeconds = Math.round(m * 60);
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const wholeMinutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds === 0 ? `${wholeMinutes}m` : `${wholeMinutes}m${seconds}s`;
  }
  // Repaints only the countdown text, in place, once a second - a full
  // re-render at that rate would fight scrolling and any open modal.
  _renderTimerCountdowns() {
    if (!this._root) return;
    // kiosk-side sound+modal alarm for whichever ONE running timer this exact browser tab started, if it opted into alarm-style delivery
    if (window.__familyHubTimerAlarm) {
      window.__familyHubTimerAlarm.check(this._timers, this._familyHubClientId(), (t) => this._timerRemainingSeconds(t), this._hass);
    }
    const allTimers = this._allTimers();
    // a foreign HA timer.* entity can start or finish entirely outside Family Hub (someone else's automation
    const shownUids = new Set(Array.from(this._root.querySelectorAll("[data-timer-uid]")).map((el) => el.dataset.timerUid));
    const liveUids = new Set(allTimers.map((t) => t.uid));
    let setChanged = shownUids.size !== liveUids.size;
    if (!setChanged) {
      for (const uid of liveUids) {
        if (!shownUids.has(uid)) {
          setChanged = true;
          break;
        }
      }
    }
    if (setChanged) {
      this._render();
      return;
    }
    let anyExpired = false;
    this._root.querySelectorAll("[data-timer-uid]").forEach((el) => {
      const timer = allTimers.find((t) => t.uid === el.dataset.timerUid);
      if (!timer) return;
      const left = this._timerRemainingSeconds(timer);
      el.textContent = this._formatTimerRemaining(left);
      const card = el.closest(".timer-card");
      if (card) card.classList.toggle("is-finishing", left > 0 && left <= 60);
      // Only a Family Hub timer's own zero-crossing needs the backend asked what happened next (see below)
      if (left <= 0 && !timer.foreign) anyExpired = true;
    });
    // The instant something visibly hits zero, ask the backend what actually happened rather than guessing - it owns expiry.
    if (anyExpired && !this._timerExpiryRefreshPending) {
      this._timerExpiryRefreshPending = true;
      setTimeout(() => {
        this._timerExpiryRefreshPending = false;
        this._fetchTimers();
      }, 2000);
    }
  }
  _userName(id) {
    if (!id) return this._t("active_timers.unassigned", "Unassigned");
    const u = (this._users || []).find((x) => x.id === id);
    return u ? u.name : id;
  }
  // The person's OWN colour, resolved exactly as family-hub-chores-card.js's _userColor does: a custom colour picked on the calendar card's
  _userColor(id) {
    if (!id) return UNASSIGNED_COLOR;
    const profiles = (this._settingsCache && this._settingsCache.userProfiles) || {};
    const custom = profiles[id] && profiles[id].color;
    if (custom) return custom;
    const idx = (this._users || []).findIndex((x) => x.id === id);
    return idx >= 0 ? PALETTE[idx % PALETTE.length] : UNASSIGNED_COLOR;
  }
  // What this timer is FOR - a chore/reward timer's snapshotted title, or a standalone one's own label
  _timerLabel(timer) {
    if (timer.title) return timer.title;
    if (timer.kind === "chore") return this._t("active_timers.kind_chore", "Chore");
    if (timer.kind === "reward") return this._t("active_timers.kind_reward", "Reward");
    return this._t("active_timers.kind_timer", "Timer");
  }
  _timerKindLabel(kind) {
    return kind === "chore" ? this._t("active_timers.kind_chore", "Chore")
      : kind === "reward" ? this._t("active_timers.kind_reward", "Reward")
      : kind === "native" ? this._t("active_timers.kind_ha_timer", "HA Timer")
      : this._t("active_timers.kind_timer", "Timer");
  }
  // Mirrors ws_cancel_timer's own rules exactly, so no button is offered that the backend would refuse (it re-checks independently
  _canCancelTimer(timer) {
    if (!timer) return false;
    const me = this._myUserId();
    if (this._isAdmin()) return true;
    // a foreign HA timer.* entity has no owner/permission model at all (unlike Family Hub's own timers
    if (timer.kind === "native") return false;
    if (timer.kind === "standalone") {
      if (!timer.user_id) return true;
      return timer.user_id === me || timer.started_by === me;
    }
    if (timer.user_id === me) return true;
    return timer.kind === "chore"
      ? this._hasPermission("can_verify") || this._hasPermission("can_complete_any")
      : this._hasPermission("can_override_rewards");
  }
  _hasPermission(key) {
    if (this._isAdmin()) return true;
    return !!(this._myPermissions && this._myPermissions[key]);
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
  async _cancelTimer(uid) {
    if (!uid || !this._hass) return;
    // a foreign HA timer.* entity (synthetic uid "ha:<entity_id>", see _foreignTimerEntities) has no family_hub/timers/cancel record at all
    if (uid.indexOf("ha:") === 0) {
      const entityId = uid.slice(3);
      try {
        await this._hass.callService("timer", "cancel", {}, { entity_id: entityId });
      } catch (e) {
        window.alert((e && e.message) || this._t("active_timers.couldnt_stop_timer", "Couldn't stop that timer."));
      }
      this._render();
      return;
    }
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/timers/cancel", uid });
    } catch (e) {
      window.alert((e && e.message) || this._t("active_timers.couldnt_stop_timer", "Couldn't stop that timer."));
    }
    await this._fetchTimers();
  }

  // --- Board ----------------------------------------------------------------
  _timerCardHtml(timer) {
    const color = this._userColor(timer.user_id);
    const unassigned = !timer.user_id;
    const left = this._timerRemainingSeconds(timer);
    const who = unassigned ? this._t("active_timers.unassigned", "Unassigned") : this._userName(timer.user_id);
    const cancel = this._canCancelTimer(timer)
      ? `<button class="timer-cancel-btn" data-uid="${this._esc(timer.uid)}" title="${this._esc(this._t("active_timers.stop_timer_title", "Stop this timer"))}">&#10005;</button>`
      : "";
    return `
      <div class="timer-card${unassigned ? " unassigned" : ""}${timer.foreign ? " foreign-timer" : ""}${left > 0 && left <= 60 ? " is-finishing" : ""}" data-uid="${this._esc(timer.uid)}" style="--timer-color: ${this._esc(color)}">
        <div class="timer-card-top">
          <span class="timer-kind">${this._timerKindLabel(timer.kind)}</span>
          ${cancel}
        </div>
        <div class="timer-label">${this._esc(this._timerLabel(timer))}</div>
        <div class="timer-remaining" data-timer-uid="${this._esc(timer.uid)}">${this._formatTimerRemaining(left)}</div>
        <div class="timer-who"><span class="timer-who-dot"></span>${this._esc(who)}</div>
        <div class="timer-total">${this._esc(this._t("active_timers.of_duration", "of %length%", { length: this._formatTimerLength(timer.duration_minutes) }))}</div>
      </div>
    `;
  }
  _render() {
    if (!this._root) return;
    this._root.querySelector(".title").textContent = this._config.title;
    const timers = this._allTimers().slice().sort((a, b) => this._timerRemainingSeconds(a) - this._timerRemainingSeconds(b));
    const board = this._root.querySelector(".timers-board");
    board.innerHTML = timers.length
      ? timers.map((t) => this._timerCardHtml(t)).join("")
      : `<div class="empty-state">${this._t("active_timers.empty_state", "Nothing's running right now. Tap &#65291; Start Timer to set one.")}</div>`;
    const count = this._root.querySelector(".timer-count");
    if (count) count.textContent = timers.length ? String(timers.length) : "";
  }

  // -- Quick-timer modal ---------------------------------------------------- "a pop up modal that has 3-4 common timer times
  _openQuickTimerModal() {
    const overlay = this._root.querySelector(".quick-timer-modal");
    const box = overlay.querySelector(".modal-box");
    this._draftMinutes = null;
    // same 3-way "self/kiosks/everyone" tier chores/rewards already have (see const.py's CHORE_KEY_ALARM_ AUDIENCE), now offered here too.
    this._draftAlarmAudience = "self";
    this._draftSpeakers = [];
    const presetBtns = TIMER_PRESETS.map(
      (m) => `<button type="button" class="preset-btn" data-minutes="${m}">${this._formatTimerLength(m)}</button>`
    ).join("");
    const speakerChips = ((this._getSettings() || {}).alarmDevices || [])
      .filter((d) => d && d.entity_id)
      .map((d) => `<button type="button" class="q-speaker-btn" data-id="${this._esc(d.entity_id)}">${d.domain === "assist_satellite" ? "&#127908;" : "&#128266;"} ${this._esc(d.name || d.entity_id)}</button>`)
      .join("");
    const userOptions = (this._users || [])
      .map((u) => `<option value="${this._esc(u.id)}">${this._esc(u.name)}</option>`)
      .join("");
    box.innerHTML = `
      <h3>${this._t("active_timers.modal_title", "Start a timer")}</h3>
      <div class="preset-row">${presetBtns}</div>
      <label><span>${this._t("active_timers.custom_length_label", "Or a custom length")}</span>
        <div class="q-custom-row">
          <input type="number" class="q-minutes" min="0" max="1440" placeholder="min">
          <input type="number" class="q-seconds" min="0" max="59" placeholder="sec">
        </div>
      </label>
      <label><span>${this._t("active_timers.whats_it_for_label", "What's it for? (optional)")}</span><input data-fh-placeholder="text.oven_sam_s_turn_laundry" type="text" class="q-label" maxlength="60" placeholder="${__fhT("text.oven_sam_s_turn_laundry", "Oven, Sam's turn, laundry...", null, "h")}"></label>
      <label><span>${this._t("active_timers.assign_to_label", "Assign to (optional)")}</span><select class="q-user"><option value="">${this._t("active_timers.nobody_option", "Nobody - just a house timer")}</option>${userOptions}</select></label>
      <label><span>${this._t("active_timers.who_hears_label", "Who hears this alarm")}</span>
        <div class="q-audience-row">
          <button type="button" class="q-audience-btn active" data-value="self">${this._t("active_timers.audience_self", "Just them")}</button>
          <button type="button" class="q-audience-btn" data-value="kiosks">${this._t("active_timers.audience_kiosks", "Them + kiosks")}</button>
          <button type="button" class="q-audience-btn" data-value="everyone">${this._t("active_timers.audience_everyone", "Everyone")}</button>
        </div>
        <div class="q-hint">${this._t("active_timers.audience_hint", "Just them: their own screens, phones and speakers - or, for a house timer, this screen and the house speakers. It keeps ringing until someone taps Stop.")}</div>
      </label>
      ${speakerChips ? `<label><span>${this._t("active_timers.speakers_label", "Ring on these speakers (optional)")}</span><div class="q-speaker-row">${speakerChips}</div><div class="q-hint">${this._t("active_timers.speakers_hint", "Leave empty to use each speaker's own \"Rings for\" setting.")}</div></label>` : ""}
      <div class="modal-actions">
        <button type="button" class="cancel-btn">${this._t("common.cancel", "Cancel")}</button>
        <button type="button" class="save-btn" disabled>${this._t("active_timers.start_btn", "Start")}</button>
      </div>
      <div class="form-error"></div>
    `;
    const minutesInput = box.querySelector(".q-minutes");
    const secondsInput = box.querySelector(".q-seconds");
    const saveBtn = box.querySelector(".save-btn");
    const syncState = () => {
      // A preset chip and the custom min/sec boxes are two ways of answering the same question
      const custom = this._customQuickTimerMinutes(box);
      const minutes = custom !== null ? custom : this._draftMinutes;
      saveBtn.disabled = !(minutes > 0);
      box.querySelectorAll(".preset-btn").forEach((b) => {
        b.classList.toggle("active", custom === null && Number(b.dataset.minutes) === this._draftMinutes);
      });
    };
    box.querySelectorAll(".preset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._draftMinutes = Number(btn.dataset.minutes);
        minutesInput.value = "";
        secondsInput.value = "";
        syncState();
      });
    });
    minutesInput.addEventListener("input", syncState);
    secondsInput.addEventListener("input", syncState);
    box.querySelectorAll(".q-audience-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        box.querySelectorAll(".q-audience-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this._draftAlarmAudience = btn.dataset.value;
      });
    });
    box.querySelectorAll(".q-speaker-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.classList.toggle("active");
        this._draftSpeakers = Array.from(box.querySelectorAll(".q-speaker-btn.active")).map((b) => b.dataset.id);
      });
    });
    box.querySelector(".cancel-btn").addEventListener("click", () => overlay.classList.remove("open"));
    saveBtn.addEventListener("click", () => this._submitQuickTimer(box, overlay));
    syncState();
    overlay.classList.add("open");
    setTimeout(() => {
      try {
        box.querySelector(".q-label").focus();
      } catch (e) {
      }
    }, 0);
  }
  // Reads the modal's minutes + seconds custom-length boxes together and folds them into one fractional-minutes number
  _customQuickTimerMinutes(box) {
    const minVal = box.querySelector(".q-minutes").value;
    const secVal = box.querySelector(".q-seconds").value;
    if (minVal === "" && secVal === "") return null;
    const typedMin = parseInt(minVal, 10);
    const typedSec = parseInt(secVal, 10);
    const min = Number.isFinite(typedMin) && typedMin > 0 ? typedMin : 0;
    const sec = Number.isFinite(typedSec) && typedSec > 0 ? Math.min(59, typedSec) : 0;
    const total = min + sec / 60;
    return total > 0 ? total : null;
  }
  async _submitQuickTimer(box, overlay) {
    const custom = this._customQuickTimerMinutes(box);
    const minutes = custom !== null ? custom : this._draftMinutes;
    if (!minutes) return;
    const errEl = box.querySelector(".form-error");
    try {
      await this._hass.connection.sendMessagePromise({
        type: "family_hub/timers/start_standalone",
        duration_minutes: minutes,
        label: (box.querySelector(".q-label").value || "").trim(),
        user_id: box.querySelector(".q-user").value || null,
        client_id: this._familyHubClientId(),
        // "who hears this alarm" - see the button row's own
        // comment above.
        alarm_audience: this._draftAlarmAudience || "self",
        alarm_device_ids: this._draftSpeakers || [],
        source: "timers",
      });
    } catch (e) {
      errEl.textContent = (e && e.message) || this._t("active_timers.couldnt_start_timer", "Couldn't start that timer.");
      return;
    }
    overlay.classList.remove("open");
    await this._fetchTimers();
  }

  // the timer log - every timer, who set it and from where, how it ended, where it rang and who stopped it (family_hub/timers/history).
  async _openTimerLog() {
    const overlay = this._root.querySelector(".timer-log-modal");
    const box = overlay.querySelector(".log-box");
    const t = (k, f, v) => this._esc(this._t(k, f, v));
    box.innerHTML = `<h3>${t("active_timers.log_heading", "Timer log")}</h3><div class="log-list">${t("active_timers.log_loading", "Loading…")}</div><div class="modal-actions"><button type="button" class="cancel-btn log-close">${t("common.close", "Close")}</button></div>`;
    box.querySelector(".log-close").addEventListener("click", () => overlay.classList.remove("open"));
    overlay.classList.add("open");
    let entries = [];
    try {
      const res = await this._hass.connection.sendMessagePromise({ type: "family_hub/timers/history", limit: 100 });
      entries = (res && res.entries) || [];
    } catch (e) {
      box.querySelector(".log-list").textContent = this._t("active_timers.log_error", "Couldn't load the timer log.");
      return;
    }
    const list = box.querySelector(".log-list");
    if (!entries.length) {
      list.innerHTML = `<div class="log-empty">${t("active_timers.log_empty", "No timers yet.")}</div>`;
      return;
    }
    list.innerHTML = entries.map((e) => this._timerLogEntryHtml(e)).join("");
    list.querySelectorAll(".log-stop-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          await this._hass.connection.sendMessagePromise({ type: "family_hub/timers/dismiss_alarm", uid: btn.dataset.uid });
        } catch (err) {
          // ignore
        }
        this._openTimerLog();
      });
    });
  }
  _timerLogWhen(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const lang = (this._hass && ((this._hass.locale && this._hass.locale.language) || this._hass.language)) || undefined;
    const tf = this._hass && this._hass.locale && this._hass.locale.time_format;
    const opts = { hour: "numeric", minute: "2-digit" };
    if (tf === "24") opts.hour12 = false;
    if (tf === "12") opts.hour12 = true;
    let time;
    try {
      time = d.toLocaleTimeString(lang, opts);
    } catch (e) {
      time = d.toLocaleTimeString();
    }
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return time;
    let day;
    try {
      day = d.toLocaleDateString(lang, { weekday: "short", month: "short", day: "numeric" });
    } catch (e) {
      day = d.toDateString();
    }
    return `${day} ${time}`;
  }
  _timerLogEntryHtml(e) {
    const t = (k, f, v) => this._esc(this._t(k, f, v));
    const kinds = { chore: t("active_timers.log_kind_chore", "Chore"), reward: t("active_timers.log_kind_reward", "Reward"), standalone: t("active_timers.log_kind_timer", "Timer") };
    const sources = {
      chores: t("active_timers.log_src_chores", "the Chores card"),
      rewards: t("active_timers.log_src_rewards", "the Rewards card"),
      timers: t("active_timers.log_src_timers", "Active Timers"),
      automation: t("active_timers.log_src_automation", "an automation"),
    };
    const outcomeLabel = e.ringing
      ? t("active_timers.log_ringing", "Ringing")
      : { running: t("active_timers.log_running", "Running"), finished: t("active_timers.log_finished", "Finished"), cancelled: t("active_timers.log_cancelled", "Cancelled") }[e.outcome] ||
        t("active_timers.log_unknown", "Ended");
    const lines = [];
    const who = e.user_name || t("active_timers.log_house", "House timer");
    const setBy = e.started_by_name
      ? t("active_timers.log_set_by", "Set by %name%", { name: e.started_by_name })
      : t("active_timers.log_set_by_unknown", "Set by an automation");
    const from = sources[e.source] && !(e.source === "automation" && !e.started_by_name) ? t("active_timers.log_from", "from %where%", { where: this._t(`active_timers.log_src_${e.source}`, { chores: "the Chores card", rewards: "the Rewards card", timers: "Active Timers", automation: "an automation" }[e.source]) }) : "";
    lines.push(`${this._esc(who)} · ${setBy}${from ? " " + from : ""} · ${this._esc(this._formatTimerLength(e.duration_minutes))}`);
    const when = [t("active_timers.log_started", "Started %time%", { time: this._timerLogWhen(e.started_at) })];
    if (e.ended_at) when.push(t("active_timers.log_ended", "ended %time%", { time: this._timerLogWhen(e.ended_at) }));
    else if (e.outcome === "running" && e.ends_at) when.push(t("active_timers.log_ends", "ends %time%", { time: this._timerLogWhen(e.ends_at) }));
    lines.push(when.join(" · "));
    const results = {
      completed: t("active_timers.log_result_completed", "Chore completed - stars paid"),
      sent_for_approval: t("active_timers.log_result_approval", "Chore sent for approval"),
      chore_deleted: t("active_timers.log_result_deleted", "Chore was deleted - no alarm"),
      chore_already_done: t("active_timers.log_result_done", "Chore was already done - no alarm"),
    };
    if (e.result && results[e.result]) lines.push(results[e.result]);
    if (e.outcome === "cancelled") {
      const reasons = {
        home_assistant: t("active_timers.log_cancel_ha", "Stopped from Home Assistant"),
        chore_changed: t("active_timers.log_cancel_chore", "Its chore was finished, changed or deleted"),
        automation: t("active_timers.log_cancel_automation", "Cancelled by an automation"),
      };
      lines.push(
        reasons[e.cancel_reason] && !e.cancelled_by_name
          ? reasons[e.cancel_reason]
          : t("active_timers.log_cancelled_by", "Cancelled by %name%", { name: e.cancelled_by_name || this._t("active_timers.log_someone", "someone") })
      );
    }
    const a = e.alarm || {};
    if (a.rang_at) {
      const prettyPhone = (p) => String(p || "").replace(/^notify\./, "").replace(/^mobile_app_/, "").replace(/_/g, " ");
      const places = []
        .concat(a.screens || [])
        .concat((a.speakers || []).map((x) => x))
        .concat((a.phones || []).map(prettyPhone));
      lines.push(t("active_timers.log_rang_on", "Rang on: %places%", { places: places.length ? places.join(", ") : this._t("active_timers.log_nowhere", "nowhere set up") }));
      if (a.stopped_at) {
        const via = {
          screen: this._t("active_timers.log_via_screen", "a screen"),
          phone: this._t("active_timers.log_via_phone", "a phone"),
          automation: this._t("active_timers.log_via_automation", "an automation"),
        }[a.stopped_via];
        lines.push(
          a.stopped_via === "auto"
            ? t("active_timers.log_auto_stopped", "Nobody stopped it - it went quiet by itself after 30 minutes")
            : t("active_timers.log_stopped", "Stopped by %name% from %via% at %time%", {
                name: a.stopped_by_name || this._t("active_timers.log_someone", "someone"),
                via: via || this._t("active_timers.log_via_screen", "a screen"),
                time: this._timerLogWhen(a.stopped_at),
              })
        );
      }
    }
    return `<div class="log-entry log-${this._esc(e.ringing ? "ringing" : e.outcome || "unknown")}">
      <div class="log-top"><span class="log-kind">${kinds[e.kind] || kinds.standalone}</span><span class="log-title">${this._esc(e.title || kinds[e.kind] || "Timer")}</span><span class="log-outcome">${outcomeLabel}</span></div>
      ${lines.map((l) => `<div class="log-line">${l}</div>`).join("")}
      ${e.ringing ? `<button type="button" class="log-stop-btn" data-uid="${this._esc(e.uid)}">${t("active_timers.log_stop", "Stop alarm")}</button>` : ""}
    </div>`;
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
          <span class="timer-count"></span>
          <button class="timer-log-btn" title="Timer log" data-i18n-title="active_timers.log_title">&#128338; <span data-i18n="active_timers.log_btn">Log</span></button>
          <button class="add-timer-btn">&#65291; <span data-i18n="active_timers.start_timer_btn">Start Timer</span></button>
        </div>
        <div class="timers-board"></div>
      </ha-card>
      <div class="modal-overlay quick-timer-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay timer-log-modal"><div class="modal-box log-box"></div></div>
    `;
    this._root = root;
    root.querySelector(".add-timer-btn").addEventListener("click", () => this._openQuickTimerModal());
    root.querySelector(".timer-log-btn").addEventListener("click", () => this._openTimerLog());
    root.querySelectorAll(".modal-overlay").forEach((overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.classList.remove("open");
      });
    });
    root.querySelector(".timers-board").addEventListener("click", (e) => {
      const cancelBtn = e.target.closest(".timer-cancel-btn");
      if (cancelBtn) this._cancelTimer(cancelBtn.dataset.uid);
    });
  }

  _css() {
    return `
      :host { display: block; height: 100%; font-family: "Arial Rounded MT Std", "Arial Rounded MT", "Varela Round", -apple-system, "Segoe UI Rounded", "Segoe UI", Roboto, sans-serif;
        --fc-bg: #fbf7e5; --fc-card: #f5f3f0; --fc-border: #e6ddc4; --fc-text: #423d34; --fc-text-secondary: #96877a;
        --fc-accent: #8f5a00; --fc-accent-text: #fff8ea; --fc-accent2: #305545; --fc-accent3: #b5583c;
        --fc-surface-alt: #efe6cf; --fc-surface2: #f2eede; }
      ha-card { background: var(--fc-bg); background-image: var(--fc-bg-overlay-image, none), var(--fc-bg-image, none); background-size: cover, var(--fc-bg-size, cover); background-position: center, var(--fc-bg-position, center); color: var(--fc-text); padding: 14px; height: 100%; box-sizing: border-box; overflow-y: auto; }
      .header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
      .title { font-size: 18px; font-weight: 800; flex: 1 1 auto; min-width: 0; }
      .timer-count { flex: 0 0 auto; background: var(--fc-surface-alt); color: var(--fc-accent2); border-radius: 8px; padding: 1px 8px; font-size: 12px; font-weight: 800; }
      .add-timer-btn { flex: 0 0 auto; border: none; border-radius: 12px; padding: 10px 16px; font-size: 14px; font-weight: 700; cursor: pointer; background: var(--fc-accent); color: var(--fc-accent-text); }
      /* A responsive grid rather than a fixed column count - five
         simultaneous timers on a wall tablet and one on a phone should both
         look deliberate. auto-fill/minmax handles both with no media query. */
      .timers-board { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
      /* Each card is tinted with its assigned person's own colour (see
         _userColor) via the --timer-color custom property set inline: a
         solid left edge plus a wash of the same colour, which reads as
         "this is Emma's" at a glance across a room without making the
         countdown itself hard to read. */
      .timer-card { position: relative; border-radius: 12px; padding: 10px 12px; background: color-mix(in srgb, var(--timer-color) 16%, var(--fc-card)); border: 2px solid var(--timer-color); box-shadow: var(--fc-shadow, 0 2px 5px rgba(0,0,0,0.06)); display: flex; flex-direction: column; gap: 2px; }
      .timer-card.unassigned { background: var(--fc-surface2); border-color: var(--fc-border); }
      /* a plain HA timer.* entity, not one of Family Hub's own -
         dashed rather than solid so it's visually obvious at a glance which
         timers this board actually owns/can manage vs. is just reporting on. */
      .timer-card.foreign-timer { border-style: dashed; }
      /* Under a minute left - a gentle pulse rather than anything alarming,
         since most of these are dinner, not emergencies. */
      .timer-card.is-finishing { animation: timer-pulse 1.6s ease-in-out infinite; }
      @keyframes timer-pulse { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--timer-color) 60%, transparent); } 50% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--timer-color) 0%, transparent); } }
      .timer-card-top { display: flex; align-items: center; gap: 6px; }
      .timer-kind { flex: 1 1 auto; font-size: 9px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--fc-text-secondary); }
      .timer-cancel-btn { flex: 0 0 auto; border: none; background: transparent; color: var(--fc-text-secondary); cursor: pointer; font-size: 13px; padding: 0 2px; line-height: 1; }
      .timer-label { font-size: 14px; font-weight: 800; overflow-wrap: anywhere; }
      /* tabular-nums so the ticking seconds never reflow the card. */
      .timer-remaining { font-size: 26px; font-weight: 800; color: var(--fc-text); font-variant-numeric: tabular-nums; line-height: 1.1; }
      .timer-who { display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 700; color: var(--fc-text-secondary); }
      .timer-who-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--timer-color); flex: 0 0 auto; }
      .timer-card.unassigned .timer-who-dot { background: var(--fc-border); }
      .timer-total { font-size: 11px; color: var(--fc-text-secondary); }
      .empty-state { grid-column: 1 / -1; text-align: center; color: var(--fc-text-secondary); font-size: 13px; padding: 20px 10px; }
      .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 20; align-items: center; justify-content: center; }
      .modal-overlay.open { display: flex; }
      .modal-box { background: var(--fc-bg); color: var(--fc-text); border-radius: 14px; padding: 16px; width: min(92vw, 360px); max-height: 86vh; overflow-y: auto; box-sizing: border-box; }
      .modal-box h3 { margin: 0 0 10px; font-size: 16px; font-weight: 800; }
      .modal-box label { display: block; margin: 10px 0 0; font-size: 13px; font-weight: 700; }
      .modal-box input, .modal-box select { width: 100%; box-sizing: border-box; margin-top: 4px; padding: 8px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 13px; font-family: inherit; }
      .preset-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
      .preset-btn { border: 2px solid var(--fc-border); border-radius: 10px; padding: 10px 4px; font-size: 13px; font-weight: 800; background: var(--fc-surface2); color: var(--fc-text); cursor: pointer; }
      .preset-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      /* "can we make the timer accept seconds" - the custom
         length row is now two inputs (min/sec) side by side instead of
         one; override the generic 100%-width input rule above so they
         share the row instead of each claiming the full width. */
      .q-custom-row { display: flex; gap: 8px; margin-top: 4px; }
      .q-custom-row input { width: auto; flex: 1 1 0; margin-top: 0; }
      /* "Who hears this alarm" 3-way row - same visual idiom
         as .preset-btn above (a small pill button group), for the quick-
         timer modal's new alarm_audience picker. */
      .q-audience-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
      .q-audience-btn { flex: 1 1 0; min-width: 88px; min-height: 40px; border: 2px solid var(--fc-border); border-radius: 10px; padding: 8px 6px; font-size: 12.5px; font-weight: 800; background: var(--fc-surface2); color: var(--fc-text); cursor: pointer; }
      .q-audience-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      .q-hint { font-size: 11.5px; color: var(--fc-text-secondary); margin-top: 4px; font-weight: 400; line-height: 1.35; }
      .q-speaker-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
      .q-speaker-btn { border: 2px solid var(--fc-border); border-radius: 10px; padding: 6px 10px; font-size: 12.5px; font-weight: 800; background: var(--fc-surface2); color: var(--fc-text); cursor: pointer; }
      .q-speaker-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      .timer-log-btn { flex: 0 0 auto; border: none; border-radius: 12px; padding: 10px 12px; font-size: 14px; font-weight: 700; cursor: pointer; background: var(--fc-surface-alt); color: var(--fc-text); }
      .log-box { max-width: 560px; }
      .log-list { display: flex; flex-direction: column; gap: 8px; max-height: 64vh; overflow-y: auto; }
      .log-entry { border-radius: 12px; padding: 10px 12px; background: var(--fc-card); border-left: 4px solid var(--fc-border); }
      .log-entry.log-finished { border-left-color: var(--fc-accent2); }
      .log-entry.log-cancelled { border-left-color: var(--fc-text-secondary); }
      .log-entry.log-running { border-left-color: var(--fc-accent); }
      .log-entry.log-ringing { border-left-color: var(--fc-accent3); }
      .log-top { display: flex; gap: 8px; align-items: baseline; margin-bottom: 4px; }
      .log-kind { font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: var(--fc-text-secondary); }
      .log-title { font-weight: 800; flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
      .log-outcome { font-size: 12px; font-weight: 800; color: var(--fc-text-secondary); }
      .log-ringing .log-outcome { color: var(--fc-accent3); }
      .log-line { font-size: 12.5px; color: var(--fc-text-secondary); line-height: 1.4; overflow-wrap: anywhere; }
      .log-empty { color: var(--fc-text-secondary); font-style: italic; }
      .log-stop-btn { margin-top: 6px; border: none; border-radius: 10px; padding: 6px 14px; font-weight: 800; background: var(--fc-accent3); color: #fff; cursor: pointer; }
      .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
      .modal-actions button { border: none; border-radius: 10px; padding: 8px 16px; font-weight: 700; cursor: pointer; }
      .save-btn { background: var(--fc-accent); color: var(--fc-accent-text); }
      .save-btn:disabled { opacity: .45; cursor: default; }
      .cancel-btn { background: var(--fc-surface-alt); color: var(--fc-text); }
      .form-error { color: var(--fc-accent3); font-size: 12px; margin-top: 6px; }
    `;
  }
}

customElements.define("family-hub-active-timers-card", FamilyHubActiveTimersCard);

// native "Edit Card" config editor - a thin wrapper around Home Assistant's own <ha-form>
class FamilyHubActiveTimersCardEditor extends HTMLElement {
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
if (!customElements.get("family-hub-active-timers-card-editor")) {
  customElements.define("family-hub-active-timers-card-editor", FamilyHubActiveTimersCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "family-hub-active-timers-card")) {
  window.customCards.push({
    type: "family-hub-active-timers-card",
    name: "Family Hub Active Timers",
    description: "Every timer running in the house on one board, colour-coded by who it's for - chore and reward timers plus quick household timers you start right here.",
  });
}
