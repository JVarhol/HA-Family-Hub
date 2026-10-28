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
// Family Hub To-Do Lists card (v146+, Grocy shopping lists v146.1+, list picker + Put Away v146.2+)

// Must match const.py's own TODO_CARD_MAX_BOARD_ROWS - the backend clamps the stored value to this range too
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

const TODO_CARD_MAX_BOARD_ROWS = 4;

const PALETTE = ["#a9c6c2", "#dba99c", "#d9bf7e", "#a8bd93", "#b9a7c9", "#cf8f6c", "#a89a83", "#7fa7b0", "#c98fa0"];

// Home Assistant's `todo` domain only lets an item carry a due date or a description when the SPECIFIC entity's own integration advertises
const TODO_FEATURE_DUE_DATE = 16; // SET_DUE_DATE_ON_ITEM
const TODO_FEATURE_DUE_DATETIME = 32; // SET_DUE_DATETIME_ON_ITEM
const TODO_FEATURE_DESCRIPTION = 64; // SET_DESCRIPTION_ON_ITEM

// Wish Lists - the household's own ask: "I want to use the native list functionality to be able to do wish lists link name image description
const WISHLIST_DATA_MARKER = "\n[fh:wishlist-data]\n";

// Decodes one todo.* item's native `description` field into {note, link, image, claimedBy, claimedByName} - see WISHLIST_DATA_MARKER above.
function _parseWishlistDescription(raw) {
  const text = typeof raw === "string" ? raw : "";
  const idx = text.indexOf(WISHLIST_DATA_MARKER);
  if (idx === -1) return { note: text, link: "", image: "", claimedBy: null, claimedByName: "" };
  const note = text.slice(0, idx);
  const tail = text.slice(idx + WISHLIST_DATA_MARKER.length);
  let data = null;
  try {
    data = JSON.parse(tail);
  } catch (e) {
    data = null;
  }
  if (!data || typeof data !== "object") return { note, link: "", image: "", claimedBy: null, claimedByName: "", rewardItemId: null, rewardCostStars: null };
  return {
    note,
    link: typeof data.link === "string" ? data.link : "",
    image: typeof data.image === "string" ? data.image : "",
    claimedBy: typeof data.claimedBy === "string" && data.claimedBy ? data.claimedBy : null,
    claimedByName: typeof data.claimedByName === "string" ? data.claimedByName : "",
    rewardItemId: typeof data.rewardItemId === "string" && data.rewardItemId ? data.rewardItemId : null,
    rewardCostStars: Number.isFinite(data.rewardCostStars) ? data.rewardCostStars : null,
  };
}
// Inverse of _parseWishlistDescription - rebuilds a single description string from a plain note plus {link, image, claimedBy, claimedByName
function _buildWishlistDescription(note, { link, image, claimedBy, claimedByName, rewardItemId, rewardCostStars } = {}) {
  const cleanNote = typeof note === "string" ? note : "";
  const data = {};
  if (link) data.link = link;
  if (image) data.image = image;
  if (claimedBy) {
    data.claimedBy = claimedBy;
    if (claimedByName) data.claimedByName = claimedByName;
  }
  if (rewardItemId) {
    data.rewardItemId = rewardItemId;
    if (Number.isFinite(rewardCostStars)) data.rewardCostStars = rewardCostStars;
  }
  if (!Object.keys(data).length) return cleanNote;
  return cleanNote + WISHLIST_DATA_MARKER + JSON.stringify(data);
}
// Exposed on window purely so this encoding is unit-testable on its own (see test_todo_wishlist.js) without needing a full card instance
if (typeof window !== "undefined") {
  window._parseWishlistDescription = _parseWishlistDescription;
  window._buildWishlistDescription = _buildWishlistDescription;
}

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

// Shared, dashboard-wide kiosk-PIN-login session (v1.132.4+, extended to this card from Chores/Rewards)
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
      if (prev && hass) {
        try {
          await hass.connection.sendMessagePromise({ type: "family_hub/kiosk/deelevate", token: prev.token });
        } catch (e) {
        }
      }
    }
    return {
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
      _debugIdleTimerArmed() {
        return !!idleTimer;
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

class FamilyHubTodoCard extends HTMLElement {
  static getStubConfig() {
    return { title: "To-Do Lists", entities: [], include_grocy_shopping_lists: false };
  }
  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "entities", selector: { entity: { domain: "todo", multiple: true } } },
        { name: "include_grocy_shopping_lists", selector: { boolean: {} } },
        {
          name: "fab_position",
          selector: { select: { mode: "dropdown", options: [
            { value: "dashboard", label: "Dashboard corner (default)" },
            { value: "card", label: "This card's own corner" },
          ] } },
        },
      ],
      computeLabel: (s) =>
        s.name === "title" ? "Title" : s.name === "entities" ? "Lists to show" : s.name === "include_grocy_shopping_lists" ? "Also show Grocy shopping list(s)" : s.name === "fab_position" ? "+ button position" : undefined,
    };
  }
  // A custom editor element rather than letting Home Assistant auto-build one straight from getConfigForm's own schema.
  static getConfigElement() {
    return document.createElement("family-hub-todo-card-editor");
  }
  // this card's own stable per-instance identity, so two different Todo cards on two different views
  _ensureCardId(config) {
    if (config && typeof config.card_id === "string" && config.card_id) {
      return config.card_id;
    }
    // Reuse the id THIS element instance already resolved, rather than re-deriving it on every repeat setConfig call
    if (this._config && typeof this._config.cardId === "string" && this._config.cardId) {
      return this._config.cardId;
    }
    return this._todoCardConfigFingerprint(config);
  }
  // A short, stable, deterministic id derived from this card's own view path plus its title/entities/grocy_list_ids
  _todoCardConfigFingerprint(config) {
    // window.location, not the bare global - a couple of this project's own jsdom test harnesses eval this card's source without ever binding a
    const path = (window.location && window.location.pathname) || "";
    const entities = Array.isArray(config && config.entities)
      ? config.entities.filter((e) => typeof e === "string").slice().sort()
      : [];
    const grocyListIds = Array.isArray(config && config.grocy_list_ids)
      ? config.grocy_list_ids.map((v) => parseInt(v, 10)).filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
      : [];
    const title = (config && typeof config.title === "string") ? config.title : "";
    const raw = JSON.stringify([path, title, entities, grocyListIds]);
    let hash = 5381;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) + hash + raw.charCodeAt(i)) | 0;
    }
    return `cfg-${(hash >>> 0).toString(36)}-${raw.length}`;
  }
  setConfig(config) {
    const cardId = this._ensureCardId(config);
    const entities = Array.isArray(config && config.entities) ? config.entities.filter((e) => typeof e === "string" && e.startsWith("todo.")) : [];
    // grocy_list_ids is the household's explicit pick of WHICH Grocy shopping lists to show, saved by the new Settings modal
    const grocyListIds = Array.isArray(config && config.grocy_list_ids)
      ? config.grocy_list_ids.map((v) => parseInt(v, 10)).filter((v) => Number.isFinite(v))
      : undefined;
    this._config = {
      title: (config && config.title) || "To-Do Lists",
      entities,
      includeGrocyShoppingLists: !!(config && config.include_grocy_shopping_lists),
      grocyListIds,
      cardId,
      // see family-hub-chores-card.js's identical setConfig/ _registerFabCoordinator comment for the full "dashboard" vs "card" design note.
      fab_position: config && config.fab_position === "card" ? "card" : "dashboard",
      // per-card Theme override - see family-hub-goals-card.js's
      // identical field/comment for the full precedence story.
      theme_override: (config && typeof config.theme_override === "string") ? config.theme_override : "",
    };
    this._registerFabCoordinator();
    if (!(config && config.card_id === cardId)) {
      // Best-effort persist the generated id back into this card's own stored config, same channel the editor uses
      const merged = Object.assign({}, config || {}, { card_id: cardId });
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: merged }, bubbles: true, composed: true }));
    }
    if (this._settingsCache === undefined) this._settingsCache = null;
    if (this._globalThemes === undefined) this._globalThemes = [];
    // { [listKey]: { items: [{uid, summary, status, due}] } } - listKey is an entity id for a todo.* list, "grocy:<id>" for a Grocy list
    if (this._lists === undefined) this._lists = {};
    // Grocy's own shopping lists, [{id, name}] - fetched every poll tick
    if (this._grocyLists === undefined) this._grocyLists = [];
    // Whether the last get_grocy_shopping_lists fetch found Grocy configured at all - undefined until the first fetch resolves, then true/false.
    if (this._grocyConfigured === undefined) this._grocyConfigured = undefined;
    // { [listKey]: boolean } - per-column Completed-accordion open state, device-local UI state only
    if (this._completedOpen === undefined) this._completedOpen = {};
    // Grocy locations, cached once per card session for the Put Away modal's own location picker
    if (this._grocyLocationsCache === undefined) this._grocyLocationsCache = null;
    if (this._firstLoadPromise === undefined) this._firstLoadPromise = null;
    if (this._dragState === undefined) this._dragState = null;
    if (this._backendEntities === undefined) this._backendEntities = null;
    if (this._backendGrocyListIds === undefined) this._backendGrocyListIds = null;
    // how many stacked rows to spread the list columns across - see _boardRows/_boardHtml.
    if (this._backendBoardRows === undefined) this._backendBoardRows = null;
    if (this._backendFitToScreen === undefined) this._backendFitToScreen = false;
    // per-row height weights for the "fit to screen" layout's drag-to-resize handles - see _rowHeightWeights/_persistRowHeights.
    if (this._backendRowHeights === undefined) this._backendRowHeights = null;
    // Wish Lists: {[entity_id]: {ownerUserId}} for every todo.* entity currently flagged as a wish list, household-wide
    if (this._wishlistConfig === undefined) this._wishlistConfig = {};
    // this card's own effective permission grants, resolved server-side - see _fetchMyPermissions/_hasPermission.
    if (this._myPermissions === undefined) this._myPermissions = {};
    if (this._rewardsCatalogById === undefined) this._rewardsCatalogById = null;
    // kiosk PIN login, joined from the shared window.__familyHubKioskSession singleton (see that block above this class)
    if (this._kioskElevation === undefined) this._kioskElevation = null;
    if (this._kioskLoginUsers === undefined) this._kioskLoginUsers = [];
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
    await this._fetchSettings();
    // always fetch (not just when useGlobalTheme is on) so a per-card theme_override can resolve even when the household hasn't turned on Global
    await this._fetchGlobalThemes();
    await this._fetchTodoCardConfig();
    await this._fetchWishlistConfig();
    await this._fetchAllLists();
    // who (if anyone) can kiosk-PIN-login on this card - decides whether the Login button even shows at all (see _updateKioskLoginUi).
    await this._fetchKioskLoginUsers();
    this._updateKioskLoginUi();
    // this card's own effective grants (see _hasPermission) - needed before the first render so claim-status visibility is correct immediately
    await this._fetchMyPermissions();
    // only bothers fetching the rewards catalog at all if this card actually has a wish list configured - see _hasAnyWishlist's own comment.
    if (this._hasAnyWishlist()) await this._fetchRewardsCatalog();
    this._startPolling();
    this._registerFabCoordinator();
    this._registerKioskSession();
    // see this file's own copy of the window.__familyHubTimerAlarm singleton (below) for the full design note.
    this._subscribeAlarmEvents();
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
  // joins the shared FAB-stacking coordinator - see family-hub-chores-card.js's identical _registerFabCoordinator for the full design note.
  _registerFabCoordinator() {
    if (!window.__familyHubFabCoordinator) return;
    const cardRelative = this._config && this._config.fab_position === "card";
    if (cardRelative) this.setAttribute("fab-position", "card");
    else this.removeAttribute("fab-position");
    window.__familyHubFabCoordinator.registerClient(this, "todo", {}, (state) => {
      this.style.setProperty("--fh-fab-offset", `${state.offsetPx}px`);
      // hideForModal is true while ANY Family Hub card on this dashboard has a full-screen modal open
      const fab = this._root && this._root.querySelector(".add-todo-fab");
      if (fab) fab.hidden = !!state.hideForModal;
    }, { takesSlot: !cardRelative });
  }
  // joins the shared kiosk-login session - byte-identical reasoning to family-hub-chores-card.js's own _registerKioskSession.
  _registerKioskSession() {
    if (window.__familyHubKioskSession) window.__familyHubKioskSession.registerClient(this, (elevation) => this._onKioskElevationChanged(elevation));
  }
  // kiosk PIN login - see family-hub-chores-card.js's own _myUserId/_myName/_openKioskLoginModal/_submitKioskLogin/ _onKioskElevationChanged
  _myUserId() {
    if (this._kioskElevation) return this._kioskElevation.user_id;
    return this._hass && this._hass.user ? this._hass.user.id : null;
  }
  _myName() {
    if (this._kioskElevation) return this._kioskElevation.name || "";
    return (this._hass && this._hass.user && this._hass.user.name) || "";
  }
  // mirrors family-hub-chores-card.js's own _isAdmin/_hasPermission exactly (see that file's comment above them for the full picture)
  _isAdmin() {
    if (this._kioskElevation) return !!this._kioskElevation.is_admin;
    return !!(this._hass && this._hass.user && this._hass.user.is_admin);
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
  // Redraws everything that shows translated text.
  _onTranslationsReady() {
    this._applyTranslations();
    // The kiosk-login button's own text/title is set imperatively (btn.textContent/.title in _updateKioskLoginUi, not data-i18n
    this._updateKioskLoginUi();
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
  // mirrors family-hub-chores-card.js's own _kioskMsg exactly (see that file's comment above it)
  _kioskMsg(base) {
    return this._kioskElevation ? Object.assign({}, base, { elevation_token: this._kioskElevation.token }) : base;
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
  async _fetchRewardsCatalog() {
    if (!this._hass) return;
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/rewards/get_state" });
      const catalog = (result && result.catalog) || [];
      const byId = {};
      catalog.forEach((it) => {
        if (it && it.id) byId[it.id] = it;
      });
      this._rewardsCatalogById = byId;
    } catch (e) {
      // Leave this._rewardsCatalogById as-is - see this method's own docstring for why a failed fetch must never be treated as "the catalog is now
    }
  }
  // Whether ANY currently-configured list on this card is flagged as a wish list at all - used to skip the periodic rewards-catalog refetch
  _hasAnyWishlist() {
    return Object.keys(this._wishlistConfig || {}).length > 0;
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
      btn.textContent = `\u{1F464} ${this._kioskElevation.name} · ${this._t("todo.kiosk_login.log_out", "Log out")}`;
      btn.classList.add("active");
      btn.title = this._t("todo.kiosk_login.log_out_title", "Tap to log out of this kiosk session");
    } else {
      btn.textContent = `\u{1F512} ${this._t("todo.kiosk_login.login", "Login")}`;
      btn.classList.remove("active");
      btn.title = this._t("todo.kiosk_login.login_title", "Log in as a specific household member on this kiosk display");
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
        empty.textContent = this._t("todo.kiosk_login.no_users", "No one is set up for kiosk login yet - an admin can enable it under Settings > Users.");
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
      if (errEl) errEl.textContent = this._t("todo.kiosk_login.pick_user_first", "Pick who's logging in first.");
      return;
    }
    if (!pin) {
      if (errEl) errEl.textContent = this._t("todo.kiosk_login.enter_pin", "Enter a PIN.");
      return;
    }
    try {
      await window.__familyHubKioskSession.login(this._hass, userId, pin);
      this._closeKioskLoginModal();
    } catch (e) {
      if (errEl) errEl.textContent = (e && e.message) || this._t("todo.kiosk_login.incorrect_pin", "Incorrect PIN.");
      if (pinEl) {
        pinEl.value = "";
        pinEl.focus();
      }
    }
  }
  // called whenever window.__familyHubKioskSession's shared elevation changes - from THIS card's own login/logout, or from Chores/Rewards.
  _onKioskElevationChanged(elevation) {
    this._kioskElevation = elevation;
    if (!this._root) return;
    this._updateKioskLoginUi();
    this._render();
  }
  async _kioskLogout() {
    if (window.__familyHubKioskSession) await window.__familyHubKioskSession.logout(this._hass);
  }
  async _fetchTodoCardConfig() {
    if (!this._hass) return;
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_todo_card_config", card_id: this._config.cardId });
      this._backendEntities = Array.isArray(result && result.entities)
        ? result.entities.filter((e) => typeof e === "string" && e.startsWith("todo."))
        : null;
      this._backendGrocyListIds = Array.isArray(result && result.grocy_list_ids)
        ? result.grocy_list_ids.map((v) => parseInt(v, 10)).filter((v) => Number.isFinite(v))
        : null;
      // board layout.
      const rows = result && result.rows;
      this._backendBoardRows = Number.isFinite(rows) ? rows : null;
      this._backendFitToScreen = !!(result && result.fit_to_screen === true);
      this._backendRowHeights = Array.isArray(result && result.row_heights)
        ? result.row_heights.filter((v) => typeof v === "number" && Number.isFinite(v) && v > 0)
        : null;
      if (this._backendRowHeights && !this._backendRowHeights.length) this._backendRowHeights = null;
    } catch (e) {
      this._backendEntities = null;
      this._backendGrocyListIds = null;
      this._backendBoardRows = null;
      this._backendFitToScreen = false;
      this._backendRowHeights = null;
    }
  }
  // Wish Lists - which todo.* entities are flagged as wish lists, household-wide (family_hub/get_wishlist_config
  async _fetchWishlistConfig() {
    if (!this._hass) return;
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_wishlist_config" });
      const wishlists = (result && result.wishlists && typeof result.wishlists === "object") ? result.wishlists : {};
      const cleaned = {};
      Object.keys(wishlists).forEach((entityId) => {
        const rec = wishlists[entityId];
        cleaned[entityId] = { ownerUserId: (rec && typeof rec.owner_user_id === "string") ? rec.owner_user_id : null };
      });
      this._wishlistConfig = cleaned;
    } catch (e) {
      // Leave whatever was already cached (probably {}) rather than wiping every list back to "not a wish list" on a transient network blip.
    }
  }
  // Is this list key a todo.* entity currently flagged as a wish list?
  _isWishlistList(key) {
    return typeof key === "string" && key.startsWith("todo.") && !!this._wishlistConfig[key];
  }
  // True only for the specific signed-in household member who flagged this list as a wish list
  _isWishlistOwner(key) {
    const rec = this._wishlistConfig[key];
    const myId = this._myUserId();
    return !!(rec && rec.ownerUserId && myId && rec.ownerUserId === myId);
  }
  _startPolling() {
    if (this._interval) return;
    // Same 20s cadence as Chores/Goals - a to-do/shopping list is exactly the kind of thing someone else in the household
    this._interval = setInterval(() => this._fetchAllLists(), 20 * 1000);
  }
  connectedCallback() {
    if (this._hass && !this._interval) {
      if (this._firstLoadPromise) this._firstLoadPromise.then(() => this.isConnected && this._startPolling());
      else this._startPolling();
    }
    this._registerFabCoordinator();
    // re-join the shared kiosk session too, not just the FAB coordinator - Root cause: _registerKioskSession() was only ever called once
    this._registerKioskSession();
    if (!this._boundSyncTodoCardHeight) this._boundSyncTodoCardHeight = this._syncTodoCardHeight.bind(this);
    window.addEventListener("resize", this._boundSyncTodoCardHeight);
    window.addEventListener("orientationchange", this._boundSyncTodoCardHeight);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", this._boundSyncTodoCardHeight);
      window.visualViewport.addEventListener("scroll", this._boundSyncTodoCardHeight);
    }
    if (!this._todoCardHeightInterval) {
      this._todoCardHeightInterval = setInterval(this._boundSyncTodoCardHeight, 1500);
    }
    requestAnimationFrame(this._boundSyncTodoCardHeight);
    setTimeout(this._boundSyncTodoCardHeight, 300);
  }
  disconnectedCallback() {
    if (this._interval) clearInterval(this._interval);
    this._interval = null;
    if (window.__familyHubFabCoordinator) window.__familyHubFabCoordinator.unregisterClient(this);
    if (window.__familyHubKioskSession) window.__familyHubKioskSession.unregisterClient(this);
    if (this._todoCardHeightInterval) {
      clearInterval(this._todoCardHeightInterval);
      this._todoCardHeightInterval = null;
    }
    if (this._boundSyncTodoCardHeight) {
      window.removeEventListener("resize", this._boundSyncTodoCardHeight);
      window.removeEventListener("orientationchange", this._boundSyncTodoCardHeight);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", this._boundSyncTodoCardHeight);
        window.visualViewport.removeEventListener("scroll", this._boundSyncTodoCardHeight);
      }
    }
    this._endRowResizeDrag();
  }
  // pins this card's own height to "however much viewport is left below it" when (and only when) fit-to-screen is on
  _syncTodoCardHeight() {
    if (!this.isConnected) return;
    if (!this._fitToScreen()) {
      if (this.style.height) this.style.height = "";
      return;
    }
    const rect = this.getBoundingClientRect();
    const vv = window.visualViewport;
    const viewportHeight = vv ? vv.height : window.innerHeight;
    const viewportTop = vv ? vv.offsetTop : 0;
    const available = Math.max(200, Math.floor(viewportHeight - (rect.top - viewportTop)));
    if (this.style.height !== `${available}px`) {
      this.style.height = `${available}px`;
    }
  }
  getCardSize() {
    return 6;
  }
  getGridOptions() {
    return { columns: 12, min_columns: 6, max_columns: 12, min_rows: 6 };
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
  // Same this-device-only theme-override key as every other standalone Family Hub card
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
  _esc(s) {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  }
  _escAttr(s) {
    return this._esc(s).replace(/"/g, "&quot;");
  }

  // - List descriptors ---------------------------------------------------- See this file's own top-of-file comment for the descriptor shape.

  _listDescriptors() {
    const todoDescriptors = this._selectedTodoEntities().map((entity) => ({ key: entity, kind: "todo", entity }));
    const selected = this._grocySelectedListIds();
    const grocyDescriptors = (this._grocyLists || [])
      .filter((l) => selected === null || selected.includes(l.id))
      .map((l) => ({ key: `grocy:${l.id}`, kind: "grocy", listId: l.id, name: l.name }));
    return todoDescriptors.concat(grocyDescriptors);
  }
  _descriptorByKey(key) {
    return this._listDescriptors().find((d) => d.key === key) || null;
  }
  // - Board layout ---------------------------------------------- "We should make the todo card fully customizable, add rows columns
  _boardRows() {
    const rows = this._backendBoardRows;
    if (!Number.isFinite(rows)) return 1;
    return Math.max(1, Math.min(TODO_CARD_MAX_BOARD_ROWS, Math.round(rows)));
  }
  // Splits the descriptors (in their existing _listDescriptors order, which is what the List(s) tab's own selection order already determines
  _boardRowGroups() {
    const descriptors = this._listDescriptors();
    const rows = this._boardRows();
    if (rows <= 1 || descriptors.length <= 1) return [descriptors];
    const perRow = Math.ceil(descriptors.length / rows);
    const groups = [];
    for (let i = 0; i < descriptors.length; i += perRow) {
      groups.push(descriptors.slice(i, i + perRow));
    }
    return groups;
  }
  // - Fit to screen + row resizing ------------------------------ "add a way to todo card to fit to screen and also be able to resize rows."
  _fitToScreen() {
    return !!this._backendFitToScreen;
  }
  // One weight per row group, defaulting to an even split (every row the same size) exactly like the board always looked before per-row
  _rowHeightWeights(rowCount) {
    const saved = this._backendRowHeights;
    if (Array.isArray(saved) && saved.length === rowCount) return saved;
    return Array(rowCount).fill(1);
  }
  // Which todo.* entities to show as columns.
  _selectedTodoEntities() {
    return Array.isArray(this._backendEntities) ? this._backendEntities : (this._config.entities || []);
  }
  // Which Grocy list ids to show as columns.
  _grocySelectedListIds() {
    if (Array.isArray(this._backendGrocyListIds)) return this._backendGrocyListIds;
    if (Array.isArray(this._config.grocyListIds)) return this._config.grocyListIds;
    return this._config.includeGrocyShoppingLists ? null : [];
  }

  // -- Data ------------------------------------------------------------------

  async _getTodoItems(entityId) {
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
  // Normalizes a Grocy shopping_list row (see __init__.py's _ws_get_grocy_shopping_list docstring for the raw shape) into this card's common
  async _getGrocyItems(listId) {
    const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_grocy_shopping_list", list_id: listId });
    const rows = (result && Array.isArray(result.items)) ? result.items : [];
    return rows.map((row) => ({
      uid: String(row.id),
      summary: row.amount_display ? `${row.name} (${row.amount_display})` : row.name,
      status: row.done ? "completed" : "needs_action",
      due: null,
      rawName: row.name,
      productId: row.product_id != null ? row.product_id : null,
      amount: typeof row.amount === "number" && row.amount > 0 ? row.amount : 1,
      // note: the shopping-list row's own free-text note field - the closest Grocy equivalent to a todo.* item's description
      note: row.note || "",
      defaultLocationId: row.default_location_id != null ? row.default_location_id : null,
      defaultBestBeforeDays: typeof row.default_best_before_days === "number" ? row.default_best_before_days : null,
    }));
  }
  // Always fetches (not gated on any selection) - the Settings modal needs the full list-of-lists to build its own checklist even when nothing
  async _fetchGrocyLists() {
    if (!this._hass) return;
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_grocy_shopping_lists" });
      this._grocyConfigured = !!(result && result.configured);
      this._grocyLists = (result && result.configured && Array.isArray(result.lists)) ? result.lists : [];
    } catch (e) {
      this._grocyConfigured = false;
      this._grocyLists = [];
    }
  }
  async _fetchAllLists() {
    if (!this._hass) return;
    // Grocy's own list-of-lists first (it drives which Grocy columns even
    // exist this render), THEN every list's items in parallel.
    await this._fetchGrocyLists();
    const descriptors = this._listDescriptors();
    const fetches = descriptors.map(async (d) => {
      try {
        const items = d.kind === "grocy" ? await this._getGrocyItems(d.listId) : await this._getTodoItems(d.entity);
        this._lists[d.key] = { items };
      } catch (e) {
        // That list doesn't exist/isn't reachable right now (a todo.
        if (!this._lists[d.key]) this._lists[d.key] = { items: [] };
      }
    });
    // refreshed on every poll tick too (not just first load) so a reward-tied wish-list item notices when its reward was redeemed straight from
    if (this._hasAnyWishlist()) fetches.push(this._fetchRewardsCatalog());
    await Promise.all(fetches);
    this._render();
  }
  _listName(descriptor) {
    if (descriptor.kind === "grocy") return descriptor.name || `Grocy list #${descriptor.listId}`;
    const st = this._hass && this._hass.states && this._hass.states[descriptor.entity];
    return (st && st.attributes && st.attributes.friendly_name) || descriptor.entity.replace(/^todo\./, "").replace(/_/g, " ");
  }
  // See the TODO_FEATURE_* constants' own comment up top for why this check exists at all
  _todoEntitySupportsFeature(entityId, bit) {
    const st = this._hass && this._hass.states && this._hass.states[entityId];
    const features = (st && st.attributes && st.attributes.supported_features) || 0;
    return (features & bit) === bit;
  }
  _todoEntitySupportsDueDate(entityId) {
    return this._todoEntitySupportsFeature(entityId, TODO_FEATURE_DUE_DATE) || this._todoEntitySupportsFeature(entityId, TODO_FEATURE_DUE_DATETIME);
  }
  _todoEntitySupportsDescription(entityId) {
    return this._todoEntitySupportsFeature(entityId, TODO_FEATURE_DESCRIPTION);
  }
  _listColor(key) {
    const idx = this._listDescriptors().findIndex((d) => d.key === key);
    return PALETTE[(idx >= 0 ? idx : 0) % PALETTE.length];
  }
  _itemsFor(key) {
    return (this._lists[key] && this._lists[key].items) || [];
  }
  _activeItems(key) {
    return this._itemsFor(key).filter((it) => it.status !== "completed");
  }
  _completedItems(key) {
    return this._itemsFor(key).filter((it) => it.status === "completed");
  }

  // -- Mutations -------------------------------------------------------------

  async _toggleItem(key, uid, completed) {
    // Optimistic flip so the checkbox responds instantly instead of waiting a round trip - _fetchAllLists (on the next poll
    const item = this._itemsFor(key).find((it) => it.uid === uid);
    if (item) item.status = completed ? "completed" : "needs_action";
    this._render();
    const descriptor = this._descriptorByKey(key);
    try {
      if (descriptor && descriptor.kind === "grocy") {
        await this._hass.connection.sendMessagePromise({ type: "family_hub/toggle_grocy_shopping_list_item", item_id: parseInt(uid, 10), done: completed });
      } else {
        await this._hass.callService("todo", "update_item", { item: uid, status: completed ? "completed" : "needs_action" }, { entity_id: key });
      }
    } catch (e) {
    }
    this._fetchAllLists();
  }
  async _deleteItem(key, uid) {
    const list = this._lists[key];
    const removedItem = list ? list.items.find((it) => it.uid === uid) : null;
    if (list) list.items = list.items.filter((it) => it.uid !== uid);
    this._render();
    const descriptor = this._descriptorByKey(key);
    try {
      if (descriptor && descriptor.kind === "grocy") {
        await this._hass.connection.sendMessagePromise({ type: "family_hub/remove_grocy_shopping_list_item", item_id: parseInt(uid, 10) });
      } else {
        await this._hass.callService("todo", "remove_item", { item: uid }, { entity_id: key });
      }
    } catch (e) {
    }
    // deleting a wish-list item that still has a reward tied to it (see _openTieRewardModal) also cleans up the now-orphaned catalog entry
    if (this._isWishlistList(key) && removedItem) {
      const removedParsed = _parseWishlistDescription(removedItem.description || "");
      if (removedParsed.rewardItemId) {
        try {
          await this._hass.connection.sendMessagePromise({ type: "family_hub/rewards/delete_catalog_item", item_id: removedParsed.rewardItemId });
        } catch (e) {
        }
      }
    }
    this._fetchAllLists();
  }
  async _addItem(key, summary, dueDate, wishlistExtra) {
    if (!summary || !summary.trim()) return;
    const descriptor = this._descriptorByKey(key);
    try {
      if (descriptor && descriptor.kind === "grocy") {
        // Grocy shopping list rows have no due date - dueDate is simply never sent here
        await this._hass.connection.sendMessagePromise({ type: "family_hub/add_grocy_shopping_list_item", text: summary.trim(), list_id: descriptor.listId });
      } else {
        const data = { item: summary.trim() };
        if (dueDate && this._todoEntitySupportsDueDate(key)) data.due_date = dueDate;
        // Wish Lists - link/image typed in the Add modal (see _renderAddItemTab) get folded straight into the new item's own description at creation
        if (wishlistExtra && (wishlistExtra.link || wishlistExtra.image) && this._todoEntitySupportsDescription(key)) {
          data.description = _buildWishlistDescription("", { link: wishlistExtra.link, image: wishlistExtra.image });
        }
        await this._hass.callService("todo", "add_item", data, { entity_id: key });
      }
    } catch (e) {
    }
    this._fetchAllLists();
  }
  // Item detail modal saves - a todo.* item's native description and due date (todo.update_item's own `description`/`due_date` fields
  async _updateTodoItemDetails(key, uid, { title, originalTitle, description, dueDate }) {
    const data = { item: uid };
    if (title && title.trim() && title.trim() !== originalTitle) data.rename = title.trim();
    // Only ever sent when the entity itself supports the field (see the TODO_FEATURE_* comment up top and _openItemDetailModal
    if (this._todoEntitySupportsDescription(key)) data.description = description || "";
    if (dueDate && this._todoEntitySupportsDueDate(key)) data.due_date = dueDate;
    try {
      await this._hass.callService("todo", "update_item", data, { entity_id: key });
    } catch (e) {
    }
    this._fetchAllLists();
  }
  // Wish Lists - claims/releases one item for the SIGNED-IN household member, never offered at all to the list's own owner
  async _toggleWishlistClaim(key, uid) {
    const item = this._itemsFor(key).find((it) => it.uid === uid);
    if (!item) return;
    const parsed = _parseWishlistDescription(item.description || "");
    const myId = this._myUserId();
    if (!myId) return;
    // defensive only - _wishlistItemHtml already never renders this button at all for a non-owner lacking can_see_wishlist_claims
    if (!this._isWishlistOwner(key) && !this._hasPermission("can_see_wishlist_claims")) return;
    const claimedByMe = parsed.claimedBy === myId;
    const myName = this._myName();
    const nextDescription = _buildWishlistDescription(parsed.note, {
      link: parsed.link,
      image: parsed.image,
      claimedBy: claimedByMe ? null : myId,
      claimedByName: claimedByMe ? "" : myName,
      // preserve a reward tie through this rebuild - this "claim for someone else" toggle is unreachable at all once a reward is tied
      rewardItemId: parsed.rewardItemId,
      rewardCostStars: parsed.rewardCostStars,
    });
    // Optimistic update, same spirit as _toggleItem - the button reflects
    // the new claim state instantly rather than waiting a round trip.
    item.description = nextDescription;
    this._render();
    if (!this._todoEntitySupportsDescription(key)) return;
    try {
      await this._hass.callService("todo", "update_item", { item: uid, description: nextDescription }, { entity_id: key });
    } catch (e) {
    }
    this._fetchAllLists();
  }
  async _openTieRewardModal(key, uid) {
    const item = this._itemsFor(key).find((it) => it.uid === uid);
    if (!item) return;
    const overlay = this._root.querySelector(".tie-reward-modal");
    const box = overlay.querySelector(".modal-box");
    box.innerHTML = `
      <h3>&#127873; ${this._t("todo.tie_reward.heading", "Add a star value")}</h3>
      <div class="remind-hint">${this._t("todo.tie_reward.hint", "Turns this into a one-time reward: it'll show a star cost here and in the Rewards catalog, and claiming it (from either place) removes it from both.")}</div>
      <label>${this._t("todo.tie_reward.title_label", "Title")}<input type="text" class="tie-reward-title" maxlength="120"></label>
      <label>${this._t("todo.tie_reward.cost_label", "Cost (stars)")}<input type="number" class="tie-reward-cost" min="0" step="1" inputmode="numeric"></label>
      <div class="form-error"></div>
      <div class="modal-actions">
        <button class="cancel-btn">${this._t("common.cancel", "Cancel")}</button>
        <button class="save-btn tie-reward-save-btn">${this._t("common.save", "Save")}</button>
      </div>
    `;
    box.querySelector(".tie-reward-title").value = item.summary || "";
    box.querySelector(".cancel-btn").addEventListener("click", () => overlay.classList.remove("open"));
    box.querySelector(".tie-reward-save-btn").addEventListener("click", async () => {
      const titleInput = box.querySelector(".tie-reward-title");
      const costInput = box.querySelector(".tie-reward-cost");
      const errorEl = box.querySelector(".form-error");
      errorEl.textContent = "";
      const title = titleInput.value.trim();
      const cost = parseInt(costInput.value, 10);
      if (!title) {
        errorEl.textContent = this._t("todo.tie_reward.title_required", "A title is required.");
        return;
      }
      if (!Number.isFinite(cost) || cost < 0) {
        errorEl.textContent = this._t("todo.tie_reward.cost_required", "Enter a star cost of 0 or more.");
        return;
      }
      try {
        // routed through _kioskMsg (was a bare sendMessagePromise before) - Without the elevation_token
        const result = await this._hass.connection.sendMessagePromise(this._kioskMsg({
          type: "family_hub/rewards/add_catalog_item",
          title,
          cost_stars: cost,
          redeem_mode: "one_time",
        }));
        const newItemId = result && result.item && result.item.id;
        if (!newItemId) throw new Error("no item id returned");
        const parsed = _parseWishlistDescription(item.description || "");
        const nextDescription = _buildWishlistDescription(parsed.note, {
          link: parsed.link,
          image: parsed.image,
          claimedBy: parsed.claimedBy,
          claimedByName: parsed.claimedByName,
          rewardItemId: newItemId,
          rewardCostStars: cost,
        });
        item.description = nextDescription;
        await this._hass.callService("todo", "update_item", { item: uid, description: nextDescription }, { entity_id: key });
        overlay.classList.remove("open");
        await this._fetchRewardsCatalog();
        this._fetchAllLists();
      } catch (e) {
        errorEl.textContent = this._t("todo.tie_reward.save_failed", "Couldn't save - %error%", { error: (e && e.message) ? e.message : this._t("todo.tie_reward.try_again", "try again.") });
      }
    });
    overlay.classList.add("open");
  }
  // claims a reward tied to a wish-list item - a thin wrapper around the exact same family_hub/rewards/redeem command the Rewards card's own
  async _claimWishlistReward(key, uid) {
    const item = this._itemsFor(key).find((it) => it.uid === uid);
    if (!item) return;
    const parsed = _parseWishlistDescription(item.description || "");
    if (!parsed.rewardItemId) return;
    if (!this._myUserId()) return;
    try {
      await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/rewards/redeem", item_id: parsed.rewardItemId }));
    } catch (e) {
      // Most commonly insufficient_balance - left on the wish list so the person can see the star cost and try again once they've saved up
      return;
    }
    await this._deleteItem(key, uid);
    await this._fetchRewardsCatalog();
  }
  // Upload a photo (v1.124.0+, v1.127.0+) - , followed up with: "for the wish list, when you upload an image
  async _wishlistBlobToUploadFromFile(file) {
    let blob = file;
    let name = (file && file.name) || "photo.jpg";
    try {
      const rawDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error("Couldn't read that file."));
        reader.readAsDataURL(file);
      });
      // A short timeout alongside onload/onerror - some environments (notably this project's own jsdom test suite
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("Couldn't decode that image."));
        el.src = rawDataUrl;
        setTimeout(() => reject(new Error("timed out decoding image")), 1500);
      });
      const maxDim = 1600;
      const width = img.width || maxDim;
      const height = img.height || maxDim;
      const scale = Math.min(1, maxDim / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext && canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const reEncoded = await new Promise((resolve) => {
          if (typeof canvas.toBlob === "function") {
            canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85);
          } else {
            resolve(null);
          }
        });
        if (reEncoded) {
          blob = reEncoded;
          name = "photo.jpg";
        }
      }
    } catch (e) {
      // Best-effort only - falls through to uploading the original file.
    }
    return { blob, name };
  }
  // Small wrapper around `hass.fetchWithAuth` (the frontend's own helper for an authenticated fetch() against Home Assistant's REST API
  async _wishlistFetchWithAuth(path, opts) {
    if (this._hass && typeof this._hass.fetchWithAuth === "function") {
      return this._hass.fetchWithAuth(path, opts);
    }
    const token = this._hass && this._hass.auth && this._hass.auth.data && this._hass.auth.data.access_token;
    const headers = Object.assign({}, opts && opts.headers, token ? { authorization: `Bearer ${token}` } : {});
    return fetch(path, Object.assign({}, opts, { headers }));
  }
  // Uploads a picked file to Home Assistant's own image_upload component and returns the `/api/image/serve/<id>/original` URL to store
  async _wishlistUploadImage(file) {
    if (!file) return null;
    const { blob, name } = await this._wishlistBlobToUploadFromFile(file);
    const formData = new FormData();
    formData.append("file", blob, name);
    const response = await this._wishlistFetchWithAuth("/api/image/upload", { method: "POST", body: formData });
    if (!response || !response.ok) {
      throw new Error(`image upload failed (${response && response.status})`);
    }
    const result = await response.json();
    if (!result || !result.id) throw new Error("image upload response had no id");
    return `/api/image/serve/${result.id}/original`;
  }
  // Wires one Upload-photo file input to one Image URL text input plus its small preview/status elements, shared by both the Add modal
  _wireWishlistImageUpload(fileInput, textInput, previewEl, statusEl) {
    if (!fileInput || !textInput) return;
    // Pasting/editing the URL by hand also updates the preview, not just an upload - keeps the two entry paths (paste a link
    if (previewEl) {
      textInput.addEventListener("input", () => {
        const value = textInput.value.trim();
        previewEl.src = value;
        previewEl.hidden = !value;
        if (statusEl) statusEl.textContent = "";
      });
    }
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (statusEl) statusEl.textContent = this._t("todo.wishlist_upload.uploading", "Uploading…");
      try {
        const imageUrl = await this._wishlistUploadImage(file);
        if (!imageUrl) throw new Error("empty");
        textInput.value = imageUrl;
        if (previewEl) {
          previewEl.src = imageUrl;
          previewEl.hidden = false;
        }
        if (statusEl) statusEl.textContent = this._t("todo.wishlist_upload.photo_added", "Photo added.");
      } catch (e) {
        if (statusEl) statusEl.textContent = this._t("todo.wishlist_upload.upload_failed", "Couldn't upload that photo - try a different file or paste a link instead.");
      } finally {
        // Reset so picking the SAME file again (e.g. after an error)
        // still fires another change event.
        fileInput.value = "";
      }
    });
  }
  // A Grocy row's `note` is the closest equivalent to a todo.* item's description; `name` only actually changes anything for a freetext row
  async _updateGrocyItemDetails(uid, { name, note, amount }) {
    const msg = { type: "family_hub/update_grocy_shopping_list_item", item_id: parseInt(uid, 10), note: note || "" };
    if (name && name.trim()) msg.name = name.trim();
    if (typeof amount === "number" && amount > 0) msg.amount = amount;
    try {
      await this._hass.connection.sendMessagePromise(msg);
    } catch (e) {
    }
    this._fetchAllLists();
  }
  // In-list reorder (drag within the same column).
  async _reorderItem(key, uid, previousUid) {
    const descriptor = this._descriptorByKey(key);
    if (descriptor && descriptor.kind === "grocy") return;
    try {
      await this._hass.callService(
        "todo",
        "move_item",
        previousUid ? { item: uid, previous_uid: previousUid } : { item: uid },
        { entity_id: key }
      );
    } catch (e) {
      // A third-party todo platform that doesn't implement move_item - the drag itself is still harmless, the list just won't reorder.
    }
    this._fetchAllLists();
  }
  // Cross-list move (drag onto a different column) - dispatches on the SOURCE and DESTINATION kinds
  async _moveItemAcrossLists(sourceKey, item, destKey) {
    const source = this._descriptorByKey(sourceKey);
    const dest = this._descriptorByKey(destKey);
    if (!source || !dest) return;
    try {
      if (source.kind === "grocy" && dest.kind === "grocy") {
        await this._hass.connection.sendMessagePromise({ type: "family_hub/move_grocy_shopping_list_item", item_id: parseInt(item.uid, 10), list_id: dest.listId });
      } else if (dest.kind === "grocy") {
        await this._hass.connection.sendMessagePromise({ type: "family_hub/add_grocy_shopping_list_item", text: item.summary || "(untitled)", list_id: dest.listId });
        if (source.kind === "grocy") {
          await this._hass.connection.sendMessagePromise({ type: "family_hub/remove_grocy_shopping_list_item", item_id: parseInt(item.uid, 10) });
        } else {
          await this._hass.callService("todo", "remove_item", { item: item.uid }, { entity_id: source.entity });
        }
      } else {
        // dest is a todo.* list; source is either todo.* or grocy.
        const data = { item: item.summary || "(untitled)" };
        if (item.description && this._todoEntitySupportsDescription(dest.entity)) data.description = item.description;
        if (item.due && this._todoEntitySupportsDueDate(dest.entity)) data.due_date = item.due;
        await this._hass.callService("todo", "add_item", data, { entity_id: dest.entity });
        if (source.kind === "grocy") {
          await this._hass.connection.sendMessagePromise({ type: "family_hub/remove_grocy_shopping_list_item", item_id: parseInt(item.uid, 10) });
        } else {
          await this._hass.callService("todo", "remove_item", { item: item.uid }, { entity_id: source.entity });
        }
      }
    } catch (e) {
    }
    this._fetchAllLists();
  }

  // -- Rendering ---------------------------------------------------------------

  _itemHtml(key, item) {
    const completed = item.status === "completed";
    // Put Away: offered on every ACTIVE Grocy item, not just ones Grocy already linked to a product
    const descriptor = this._descriptorByKey(key);
    const putawayBtn = descriptor && descriptor.kind === "grocy" && !completed
      ? `<button class="todo-putaway-btn" title="${this._escAttr(this._t("todo.item.put_away", "Put away"))}" data-list-key="${this._escAttr(key)}" data-uid="${this._escAttr(item.uid)}">&#128230;</button>`
      : "";
    // Wish Lists - a wish-list item renders as a small gift-registry card (image thumbnail, name, link, note) instead of a plain checklist row
    if (this._isWishlistList(key) && descriptor && descriptor.kind !== "grocy") {
      return this._wishlistItemHtml(key, item, completed);
    }
    return `
      <div class="todo-item${completed ? " completed" : ""}" data-list-key="${this._escAttr(key)}" data-uid="${this._escAttr(item.uid)}" draggable="${completed ? "false" : "true"}">
        <input type="checkbox" class="todo-check" ${completed ? "checked" : ""} data-list-key="${this._escAttr(key)}" data-uid="${this._escAttr(item.uid)}">
        <div class="todo-item-text">
          <div class="todo-item-summary">${this._esc(item.summary || this._t("todo.item.untitled", "(untitled)"))}</div>
          ${item.due ? `<div class="todo-item-due">${this._esc(item.due)}</div>` : ""}
        </div>
        ${putawayBtn}
        <button class="todo-delete-btn" title="${this._escAttr(this._t("todo.item.delete", "Delete"))}" data-list-key="${this._escAttr(key)}" data-uid="${this._escAttr(item.uid)}">&#10005;</button>
      </div>
    `;
  }
  // See _itemHtml's own comment.
  _wishlistItemHtml(key, item, completed) {
    const parsed = _parseWishlistDescription(item.description || "");
    const isOwner = this._isWishlistOwner(key);
    const myId = this._myUserId();
    const claimedByMe = !!(parsed.claimedBy && myId && parsed.claimedBy === myId);
    const imageHtml = parsed.image
      ? `<img class="wishlist-item-image" src="${this._escAttr(parsed.image)}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : `<div class="wishlist-item-image wishlist-item-image-placeholder">&#127873;</div>`;
    const linkHtml = parsed.link
      ? `<a class="wishlist-item-link" href="${this._escAttr(parsed.link)}" target="_blank" rel="noopener noreferrer" title="${this._escAttr(this._t("todo.wishlist.open_link", "Open link"))}">&#128279; ${this._t("todo.wishlist.view_link", "View")}</a>`
      : "";
    // Claim UI is left off entirely for the list's own owner - see _isWishlistOwner's own comment for the "hidden from the owner" design and its
    let rewardHtml = "";
    let claimHtml = "";
    if (parsed.rewardItemId) {
      const rewardItem = this._rewardsCatalogById ? this._rewardsCatalogById[parsed.rewardItemId] : undefined;
      const rewardOrphaned = this._rewardsCatalogById && !rewardItem;
      if (rewardOrphaned) {
        if (!this._healingWishlistRewardUids) this._healingWishlistRewardUids = new Set();
        if (!this._healingWishlistRewardUids.has(item.uid)) {
          this._healingWishlistRewardUids.add(item.uid);
          // Deliberately not awaited here (a render function must stay synchronous)
          this._deleteItem(key, item.uid);
        }
      } else {
        const cost = rewardItem ? rewardItem.cost_stars : parsed.rewardCostStars;
        const canClaimReward = !!myId;
        rewardHtml = `
          <div class="wishlist-reward-row">
            <span class="wishlist-reward-badge" title="${this._escAttr(this._t("todo.wishlist.reward_badge_title", "Redeems this reward and removes it from both the wish list and the Rewards catalog"))}">&#11088; ${Number.isFinite(cost) ? cost : "?"}</span>
            <button type="button" class="wishlist-claim-reward-btn" data-list-key="${this._escAttr(key)}" data-uid="${this._escAttr(item.uid)}" ${canClaimReward ? "" : "disabled"} title="${canClaimReward ? "" : this._escAttr(this._t("todo.wishlist.login_to_claim", "Log in to claim"))}">${this._t("todo.wishlist.claim", "Claim")}</button>
          </div>
        `;
      }
    } else {
      const canSeeClaims = this._hasPermission("can_see_wishlist_claims");
      if (!isOwner && canSeeClaims) {
        if (parsed.claimedBy) {
          const claimedLabel = claimedByMe
            ? this._t("todo.wishlist.claimed_by_you", "Claimed by you – tap to release")
            : (parsed.claimedByName ? this._t("todo.wishlist.claimed_by", "Claimed by %name%", { name: this._esc(parsed.claimedByName) }) : this._t("todo.wishlist.claimed", "Claimed"));
          claimHtml = `<button type="button" class="wishlist-claim-btn claimed${claimedByMe ? " claimed-by-me" : ""}" data-list-key="${this._escAttr(key)}" data-uid="${this._escAttr(item.uid)}" ${claimedByMe ? "" : "disabled"}>${claimedLabel}</button>`;
        } else {
          claimHtml = `<button type="button" class="wishlist-claim-btn" data-list-key="${this._escAttr(key)}" data-uid="${this._escAttr(item.uid)}">${this._t("todo.wishlist.claim", "Claim")}</button>`;
        }
      }
      // Only offered once (no reward tied yet) and only to whoever can add straight to the Rewards catalog
      if (this._hasPermission("can_add_rewards")) {
        claimHtml += `<button type="button" class="wishlist-tie-reward-btn" data-list-key="${this._escAttr(key)}" data-uid="${this._escAttr(item.uid)}" title="${this._escAttr(this._t("todo.wishlist.tie_reward_title", "Tie this item to a one-time Rewards catalog entry"))}">&#127873; ${this._t("todo.wishlist.add_star_value", "Add star value")}</button>`;
      }
    }
    return `
      <div class="todo-item wishlist-item${completed ? " completed" : ""}" data-list-key="${this._escAttr(key)}" data-uid="${this._escAttr(item.uid)}" draggable="${completed ? "false" : "true"}">
        <input type="checkbox" class="todo-check" ${completed ? "checked" : ""} data-list-key="${this._escAttr(key)}" data-uid="${this._escAttr(item.uid)}">
        ${imageHtml}
        <div class="todo-item-text wishlist-item-text">
          <div class="todo-item-summary">${this._esc(item.summary || this._t("todo.item.untitled", "(untitled)"))}</div>
          ${parsed.note ? `<div class="wishlist-item-note">${this._esc(parsed.note)}</div>` : ""}
          <div class="wishlist-item-row">${linkHtml}${claimHtml}</div>
          ${rewardHtml}
        </div>
        <button class="todo-delete-btn" title="${this._escAttr(this._t("todo.item.delete", "Delete"))}" data-list-key="${this._escAttr(key)}" data-uid="${this._escAttr(item.uid)}">&#10005;</button>
      </div>
    `;
  }
  _completedAccordionHtml(key) {
    const completed = this._completedItems(key);
    if (!completed.length) return "";
    const open = !!this._completedOpen[key];
    const body = open ? `<div class="completed-body">${completed.map((it) => this._itemHtml(key, it)).join("")}</div>` : "";
    return `
      <div class="completed-row">
        <div class="completed-header" data-list-key="${this._escAttr(key)}">
          <span class="completed-toggle-icon">${open ? "&#9662;" : "&#9656;"}</span>
          <span class="completed-title">${this._t("todo.column.completed", "Completed")}</span>
          <span class="completed-badge">${completed.length}</span>
        </div>
        ${body}
      </div>
    `;
  }
  _columnHtml(descriptor) {
    const key = descriptor.key;
    const color = this._listColor(key);
    const active = this._activeItems(key);
    const itemsHtml = active.length
      ? active.map((it) => this._itemHtml(key, it)).join("")
      : `<div class="empty-state">${this._t("todo.column.nothing_here", "Nothing here")}</div>`;
    // a small "Grocy" tag on Grocy-backed columns, so the board makes it obvious at a glance which lists are shared with Grocy's own separate
    const grocyTag = descriptor.kind === "grocy" ? `<span class="todo-column-source-tag">${this._t("todo.column.grocy_tag", "Grocy")}</span>` : "";
    // Wish Lists: same small tag treatment as the Grocy one above
    const wishlistTag = this._isWishlistList(key) ? `<span class="todo-column-source-tag wishlist-column-tag">${this._t("todo.column.wishlist_tag", "Wish List")}</span>` : "";
    return `
      <div class="todo-column" data-list-key="${this._escAttr(key)}">
        <div class="todo-column-header" style="border-top-color:${color}">
          <span class="todo-column-title">${this._esc(this._listName(descriptor))}</span>
          ${grocyTag}
          ${wishlistTag}
          <span class="todo-column-count">${active.length}</span>
        </div>
        <div class="todo-column-items" data-list-key="${this._escAttr(key)}">${itemsHtml}</div>
        ${this._completedAccordionHtml(key)}
      </div>
    `;
  }
  _boardHtml() {
    const descriptors = this._listDescriptors();
    if (!descriptors.length) {
      const hint = this._grocyConfigured
        ? this._t("todo.board.no_lists_grocy", "No lists configured yet - tap the gear icon to pick one or more to-do or Grocy lists to show.")
        : this._t("todo.board.no_lists", "No lists configured yet - tap the gear icon to pick one or more to-do lists to show.");
      return `<div class="empty-state">${hint}</div>`;
    }
    // one `.todo-board-row` per chosen stack.
    const groups = this._boardRowGroups();
    const multi = groups.length > 1;
    // when fit-to-screen is on and there's more than one row, each row gets an inline flex-grow weight
    const weights = this._fitToScreen() && multi ? this._rowHeightWeights(groups.length) : null;
    return groups
      .map((group, i) => {
        const weightStyle = weights ? ` style="flex:${weights[i]} 1 0"` : "";
        const rowHtml = `<div class="todo-board-row${multi ? " multi-row" : ""}"${weightStyle}>${group.map((d) => this._columnHtml(d)).join("")}</div>`;
        const handleHtml =
          weights && i < groups.length - 1
            ? `<div class="todo-board-row-resize" data-row-index="${i}" title="${this._escAttr(this._t("todo.board.drag_to_resize", "Drag to resize rows"))}"><span class="todo-board-row-resize-grip"></span></div>`
            : "";
        return rowHtml + handleHtml;
      })
      .join("");
  }
  _render() {
    if (!this._root) return;
    const board = this._root.querySelector(".board");
    board.innerHTML = this._boardHtml();
    // toggled on the persistent `.board` node itself (unlike everything _boardHtml returns
    board.classList.toggle("fit-to-screen", this._fitToScreen());
    // Mirrors onto a host attribute too (same [fab-position="card"]-style pattern _registerFabCoordinator already uses) so the CSS that needs to
    if (this._fitToScreen()) this.setAttribute("fit-screen", "");
    else this.removeAttribute("fit-screen");
    this._syncTodoCardHeight();
  }

  // -- Build / events ----------------------------------------------------------

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
            <button data-fh-t="text.login" data-fh-title="text.log_in_as_a_specific_household_member" class="kiosk-login-btn" title="${__fhT("text.log_in_as_a_specific_household_member", "Log in as a specific household member on this kiosk display", null, "h")}" hidden>${__fhT("text.login", "🔒 Login", null, "h")}</button>
          </div>
        </div>
        <div class="board todo-board"></div>
      </ha-card>
      <div class="modal-overlay create-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay putaway-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay item-detail-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay tie-reward-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay kiosk-login-overlay">
        <div class="modal-box kiosk-login-box">
          <button type="button" class="detail-close-btn kiosk-login-close" data-i18n-title="common.close" title="Close">&#10005;</button>
          <h2>&#128274; <span data-i18n="todo.kiosk_login.heading">Kiosk login</span></h2>
          <div class="kiosk-login-user-picker"></div>
          <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" class="kiosk-login-pin-input" placeholder="PIN" />
          <div class="kiosk-login-error"></div>
          <div class="modal-actions">
            <button class="cancel-btn kiosk-login-cancel" data-i18n="common.cancel">Cancel</button>
            <button class="save-btn kiosk-login-submit" data-i18n="todo.kiosk_login.submit">Log in</button>
          </div>
        </div>
      </div>
      <button class="add-todo-fab" data-i18n-title="todo.fab.add_item_title" title="Add an item" aria-haspopup="true">&#65291;</button>
    `;
    this._root = root;
    root.querySelector(".title").textContent = this._config.title;
    root.querySelector(".add-todo-fab").addEventListener("click", () => this._openCreateModal());
    root.querySelectorAll(".modal-overlay").forEach((overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.classList.remove("open");
      });
    });
    // kiosk PIN login - see _onKioskLoginBtnClick's own docstring for the full picture.
    root.querySelector(".kiosk-login-btn").addEventListener("click", () => this._onKioskLoginBtnClick());
    root.querySelector(".kiosk-login-close").addEventListener("click", () => this._closeKioskLoginModal());
    root.querySelector(".kiosk-login-cancel").addEventListener("click", () => this._closeKioskLoginModal());
    root.querySelector(".kiosk-login-submit").addEventListener("click", () => this._submitKioskLogin());
    root.querySelector(".kiosk-login-pin-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._submitKioskLogin();
    });
    const board = root.querySelector(".board");
    board.addEventListener("click", (e) => this._onBoardClick(e));
    board.addEventListener("change", (e) => this._onBoardChange(e));
    board.addEventListener("dragstart", (e) => this._onDragStart(e));
    board.addEventListener("dragend", (e) => this._onDragEnd(e));
    board.addEventListener("dragover", (e) => this._onDragOver(e));
    board.addEventListener("dragleave", (e) => this._onDragLeave(e));
    board.addEventListener("drop", (e) => this._onDrop(e));
    board.addEventListener("pointerdown", (e) => this._onRowResizePointerDown(e));
  }
  _onBoardClick(e) {
    const completedHeader = e.target.closest(".completed-header");
    if (completedHeader) {
      const key = completedHeader.dataset.listKey;
      this._completedOpen[key] = !this._completedOpen[key];
      this._render();
      return;
    }
    const putawayBtn = e.target.closest(".todo-putaway-btn");
    if (putawayBtn) {
      this._openPutAwayModal(putawayBtn.dataset.listKey, putawayBtn.dataset.uid);
      return;
    }
    const deleteBtn = e.target.closest(".todo-delete-btn");
    if (deleteBtn) {
      this._deleteItem(deleteBtn.dataset.listKey, deleteBtn.dataset.uid);
      return;
    }
    // Wish Lists: the Claim/Claimed button and the "View" link both live inside .todo-item-text
    const claimBtn = e.target.closest(".wishlist-claim-btn");
    if (claimBtn) {
      if (!claimBtn.disabled) this._toggleWishlistClaim(claimBtn.dataset.listKey, claimBtn.dataset.uid);
      return;
    }
    // "tie a wish list item to a reward" - see
    // _openTieRewardModal/_claimWishlistReward's own comments.
    const tieRewardBtn = e.target.closest(".wishlist-tie-reward-btn");
    if (tieRewardBtn) {
      this._openTieRewardModal(tieRewardBtn.dataset.listKey, tieRewardBtn.dataset.uid);
      return;
    }
    const claimRewardBtn = e.target.closest(".wishlist-claim-reward-btn");
    if (claimRewardBtn) {
      if (!claimRewardBtn.disabled) this._claimWishlistReward(claimRewardBtn.dataset.listKey, claimRewardBtn.dataset.uid);
      return;
    }
    if (e.target.closest(".wishlist-item-link")) return;
    // Trello-style item detail - only the text/summary part of a row opens it, never the checkbox/delete/put-away buttons or a drag gesture
    const itemText = e.target.closest(".todo-item-text");
    if (itemText) {
      const itemEl = itemText.closest(".todo-item");
      if (itemEl) this._openItemDetailModal(itemEl.dataset.listKey, itemEl.dataset.uid);
    }
  }
  _onBoardChange(e) {
    const check = e.target.closest(".todo-check");
    if (check) {
      this._toggleItem(check.dataset.listKey, check.dataset.uid, check.checked);
    }
  }

  // - Drag and drop ----------------------------------------------------------- Native HTML5 drag/drop (no library)

  _onDragStart(e) {
    const el = e.target.closest(".todo-item");
    if (!el || el.classList.contains("completed")) return;
    const key = el.dataset.listKey;
    const uid = el.dataset.uid;
    const item = this._itemsFor(key).find((it) => it.uid === uid);
    if (!item) return;
    this._dragState = { sourceKey: key, item };
    el.classList.add("dragging");
    try {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", uid);
    } catch (err) {
      // Some test/headless DOM environments don't implement dataTransfer
      // fully - the drag still works off this._dragState alone.
    }
  }
  _onDragEnd(e) {
    const el = e.target.closest(".todo-item");
    if (el) el.classList.remove("dragging");
    this._root.querySelectorAll(".todo-column-items.drag-over").forEach((c) => c.classList.remove("drag-over"));
    this._dragState = null;
  }
  _closestItemBelow(container, clientY) {
    const items = Array.from(container.querySelectorAll(".todo-item:not(.dragging)"));
    let closest = null;
    let closestOffset = -Infinity;
    for (const item of items) {
      const box = item.getBoundingClientRect();
      const offset = clientY - box.top - box.height / 2;
      if (offset < 0 && offset > closestOffset) {
        closestOffset = offset;
        closest = item;
      }
    }
    return closest;
  }
  _onDragOver(e) {
    if (!this._dragState) return;
    const container = e.target.closest(".todo-column-items");
    if (!container) return;
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = "move";
    } catch (err) {
    }
    this._root.querySelectorAll(".todo-column-items.drag-over").forEach((c) => {
      if (c !== container) c.classList.remove("drag-over");
    });
    container.classList.add("drag-over");
  }
  _onDragLeave(e) {
    const container = e.target.closest(".todo-column-items");
    if (container && e.target === container) container.classList.remove("drag-over");
  }
  _onDrop(e) {
    const container = e.target.closest(".todo-column-items");
    const state = this._dragState;
    if (!container || !state) return;
    e.preventDefault();
    container.classList.remove("drag-over");
    const destKey = container.dataset.listKey;
    const below = this._closestItemBelow(container, e.clientY);
    if (destKey === state.sourceKey) {
      // Same-list reorder: previous_uid is whichever item now sits right above the drop point (null/undefined at the very top).
      const previousUid = below ? this._prevSiblingUid(below) : this._lastItemUid(container);
      if (previousUid !== state.item.uid) this._reorderItem(destKey, state.item.uid, previousUid);
    } else {
      this._moveItemAcrossLists(state.sourceKey, state.item, destKey);
    }
    this._dragState = null;
  }
  _prevSiblingUid(itemEl) {
    const prev = itemEl.previousElementSibling;
    return prev && prev.classList.contains("todo-item") ? prev.dataset.uid : undefined;
  }
  _lastItemUid(container) {
    const items = Array.from(container.querySelectorAll(".todo-item:not(.dragging)"));
    const last = items[items.length - 1];
    return last ? last.dataset.uid : undefined;
  }

  // - Row resizing ----------------------------------------------- "add a way to todo card to fit to screen and also be able to resize rows." A
  _onRowResizePointerDown(e) {
    const handle = e.target.closest(".todo-board-row-resize");
    if (!handle) return;
    e.preventDefault();
    const board = this._root.querySelector(".board");
    const rows = Array.from(board.querySelectorAll(".todo-board-row"));
    const i = parseInt(handle.dataset.rowIndex, 10);
    const rowAbove = rows[i];
    const rowBelow = rows[i + 1];
    if (!rowAbove || !rowBelow) return;
    const weights = this._rowHeightWeights(rows.length).slice();
    const startHeightAbove = rowAbove.getBoundingClientRect().height;
    const startHeightBelow = rowBelow.getBoundingClientRect().height;
    const pairHeight = startHeightAbove + startHeightBelow;
    const pairWeight = (weights[i] || 1) + (weights[i + 1] || 1);
    // Below this, a row reads as broken (its own header barely fits, let alone anything under it)
    const MIN_ROW_PX = 64;
    this._rowResizeDrag = {
      handle, weights, i, startY: e.clientY, startHeightAbove, pairHeight, pairWeight,
      minHeight: Math.min(MIN_ROW_PX, pairHeight / 2),
    };
    handle.classList.add("dragging");
    handle.setPointerCapture(e.pointerId);
    if (!this._boundRowResizeMove) this._boundRowResizeMove = this._onRowResizePointerMove.bind(this);
    if (!this._boundRowResizeUp) this._boundRowResizeUp = this._onRowResizePointerUp.bind(this);
    window.addEventListener("pointermove", this._boundRowResizeMove);
    window.addEventListener("pointerup", this._boundRowResizeUp);
    window.addEventListener("pointercancel", this._boundRowResizeUp);
  }
  _onRowResizePointerMove(e) {
    const drag = this._rowResizeDrag;
    if (!drag) return;
    const deltaY = e.clientY - drag.startY;
    const rawHeightAbove = drag.startHeightAbove + deltaY;
    const clampedHeightAbove = Math.max(drag.minHeight, Math.min(drag.pairHeight - drag.minHeight, rawHeightAbove));
    const ratioAbove = drag.pairHeight > 0 ? clampedHeightAbove / drag.pairHeight : 0.5;
    const weightAbove = drag.pairWeight * ratioAbove;
    const weightBelow = drag.pairWeight - weightAbove;
    drag.liveWeights = drag.weights.slice();
    drag.liveWeights[drag.i] = weightAbove;
    drag.liveWeights[drag.i + 1] = weightBelow;
    const board = this._root.querySelector(".board");
    const rows = board.querySelectorAll(".todo-board-row");
    if (rows[drag.i]) rows[drag.i].style.flex = `${weightAbove} 1 0`;
    if (rows[drag.i + 1]) rows[drag.i + 1].style.flex = `${weightBelow} 1 0`;
  }
  _onRowResizePointerUp() {
    const drag = this._rowResizeDrag;
    if (!drag) return;
    const finalWeights = (drag.liveWeights || drag.weights).map((w) => Math.max(0.1, Math.round(w * 100) / 100));
    this._endRowResizeDrag();
    this._backendRowHeights = finalWeights;
    this._persistRowHeights(finalWeights);
  }
  // Tears down whatever a resize drag left behind - the window-level pointermove/pointerup listeners (pointer capture alone isn't enough
  _endRowResizeDrag() {
    const drag = this._rowResizeDrag;
    if (drag && drag.handle) drag.handle.classList.remove("dragging");
    this._rowResizeDrag = null;
    if (this._boundRowResizeMove) window.removeEventListener("pointermove", this._boundRowResizeMove);
    if (this._boundRowResizeUp) {
      window.removeEventListener("pointerup", this._boundRowResizeUp);
      window.removeEventListener("pointercancel", this._boundRowResizeUp);
    }
  }
  // The concrete Grocy list-id selection to send on a save that isn't driven by the List(s) tab's own checkboxes
  _currentGrocyListIdsForSave() {
    if (Array.isArray(this._backendGrocyListIds)) return this._backendGrocyListIds;
    const resolved = this._grocySelectedListIds();
    if (Array.isArray(resolved)) return resolved;
    return (this._grocyLists || []).map((l) => l.id);
  }
  // Persists the row-height weights a resize drag just settled on
  async _persistRowHeights(weights) {
    if (!this._hass) return;
    try {
      await this._hass.connection.sendMessagePromise({
        type: "family_hub/set_todo_card_config",
        entities: this._selectedTodoEntities(),
        grocy_list_ids: this._currentGrocyListIdsForSave(),
        rows: this._boardRows(),
        fit_to_screen: this._fitToScreen(),
        row_heights: weights,
        card_id: this._config.cardId,
      });
    } catch (e) {
    }
  }

  // - Add / List(s) modal --------------------------------------------------- a two-tab modal opened by the FAB - "Add Item"

  _openCreateModal() {
    const overlay = this._root.querySelector(".create-modal");
    const box = overlay.querySelector(".modal-box");
    box.innerHTML = `
      <div class="modal-tabs">
        <button type="button" class="modal-tab-btn active" data-tab="add">${this._t("todo.create_modal.add_item_tab", "Add Item")}</button>
        <button type="button" class="modal-tab-btn" data-tab="lists">${this._t("todo.create_modal.lists_tab", "List(s)")}</button>
      </div>
      <div class="modal-tab-panel" data-tab-panel="add"></div>
      <div class="modal-tab-panel" data-tab-panel="lists" hidden></div>
    `;
    const switchTab = (name) => {
      box.querySelectorAll(".modal-tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
      box.querySelectorAll(".modal-tab-panel").forEach((p) => { p.hidden = p.dataset.tabPanel !== name; });
    };
    box.querySelectorAll(".modal-tab-btn").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
    overlay.classList.add("open");
    this._renderAddItemTab(box.querySelector('[data-tab-panel="add"]'), overlay, switchTab);
    this._renderListsTab(box.querySelector('[data-tab-panel="lists"]'), overlay);
    // Refresh the Grocy list-of-lists on every open so a list created/ renamed/deleted in Grocy itself since the card last polled shows up
    this._fetchGrocyLists().then(() => this._renderListsTab(box.querySelector('[data-tab-panel="lists"]'), overlay));
  }
  _renderAddItemTab(panel, overlay, switchTab) {
    const descriptors = this._listDescriptors();
    if (!descriptors.length) {
      panel.innerHTML = `<div class="empty-state">${this._t("todo.create_modal.no_lists", "No lists configured yet - switch to the List(s) tab to pick one or more to-do or Grocy lists first.")}</div><div class="modal-actions"><button type="button" class="goto-lists-btn">${this._t("todo.create_modal.lists_tab", "List(s)")}</button></div>`;
      panel.querySelector(".goto-lists-btn").addEventListener("click", () => switchTab("lists"));
      return;
    }
    const listOptions = descriptors
      .map((d) => `<option value="${this._escAttr(d.key)}" data-kind="${d.kind}">${this._esc(this._listName(d))}${d.kind === "grocy" ? ` (${this._t("todo.column.grocy_tag", "Grocy")})` : ""}</option>`)
      .join("");
    panel.innerHTML = `
      <label>${this._t("todo.add_item.list_label", "List")}<select class="f-list">${listOptions}</select></label>
      <label>${this._t("todo.add_item.summary_label", "What do you need to do/get?")}<input data-fh-placeholder="text.e_g_milk" type="text" class="f-summary" placeholder="${__fhT("text.e_g_milk", "e.g. Milk", null, "h")}" autofocus></label>
      <label class="f-wishlist-link-label">${this._t("todo.add_item.link_label", "Link (optional)")}<input type="url" class="f-wishlist-link" placeholder="https://…"></label>
      <label class="f-wishlist-image-label">${this._t("todo.add_item.image_label", "Image URL (optional)")}<input type="url" class="f-wishlist-image" placeholder="https://…"></label>
      <div class="f-wishlist-image-controls-wrap wishlist-image-controls">
        <label class="wishlist-upload-btn">${this._t("todo.add_item.upload_photo", "Upload photo…")}<input type="file" accept="image/*" class="f-wishlist-image-file" hidden></label>
        <img class="wishlist-image-preview" alt="" hidden>
        <span class="wishlist-image-upload-status"></span>
      </div>
      <label class="f-due-label">${this._t("todo.add_item.due_label", "Due date (optional)")}<input type="date" class="f-due"></label>
      <div class="modal-actions">
        <button class="cancel-btn">${this._t("common.cancel", "Cancel")}</button>
        <button class="save-btn">${this._t("common.add", "Add")}</button>
      </div>
      <div class="form-error"></div>
    `;
    const listSelect = panel.querySelector(".f-list");
    if (this._dragState && this._dragState.sourceKey) listSelect.value = this._dragState.sourceKey;
    const dueLabel = panel.querySelector(".f-due-label");
    const wishlistLinkLabel = panel.querySelector(".f-wishlist-link-label");
    const wishlistImageLabel = panel.querySelector(".f-wishlist-image-label");
    const wishlistImageControlsWrap = panel.querySelector(".f-wishlist-image-controls-wrap");
    // Grocy shopping list rows have no due date - hide the field entirely once a Grocy list is selected
    const syncFieldVisibility = () => {
      const selected = listSelect.options[listSelect.selectedIndex];
      const key = selected && selected.value;
      const isGrocy = !!(selected && selected.dataset.kind === "grocy");
      dueLabel.hidden = isGrocy || !(key && this._todoEntitySupportsDueDate(key));
      const showWishlistFields = !isGrocy && key && this._isWishlistList(key) && this._todoEntitySupportsDescription(key);
      wishlistLinkLabel.hidden = !showWishlistFields;
      wishlistImageLabel.hidden = !showWishlistFields;
      wishlistImageControlsWrap.hidden = !showWishlistFields;
    };
    syncFieldVisibility();
    listSelect.addEventListener("change", syncFieldVisibility);
    // Upload a photo - see _wireWishlistImageUpload's own comment for why this writes straight into the same Image URL text input rather than a
    this._wireWishlistImageUpload(
      panel.querySelector(".f-wishlist-image-file"),
      panel.querySelector(".f-wishlist-image"),
      panel.querySelector(".wishlist-image-preview"),
      panel.querySelector(".wishlist-image-upload-status")
    );
    const summaryInput = panel.querySelector(".f-summary");
    setTimeout(() => summaryInput.focus(), 0);
    const submit = () => {
      const errEl = panel.querySelector(".form-error");
      const listKey = listSelect.value;
      const summary = summaryInput.value;
      const due = panel.querySelector(".f-due").value;
      if (!summary || !summary.trim()) {
        errEl.textContent = this._t("todo.add_item.name_required", "Give the item a name.");
        return;
      }
      const wishlistExtra = wishlistLinkLabel.hidden ? undefined : {
        link: panel.querySelector(".f-wishlist-link").value.trim(),
        image: panel.querySelector(".f-wishlist-image").value.trim(),
      };
      this._addItem(listKey, summary, due || null, wishlistExtra);
      overlay.classList.remove("open");
    };
    panel.querySelector(".cancel-btn").addEventListener("click", () => overlay.classList.remove("open"));
    panel.querySelector(".save-btn").addEventListener("click", submit);
    summaryInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
  }
  // List selection - the household ticks which todo.* entities and which specific Grocy shopping lists to show
  _renderListsTab(panel, overlay) {
    const todoEntityIds = Object.keys((this._hass && this._hass.states) || {})
      .filter((id) => id.startsWith("todo."))
      .sort((a, b) => this._todoEntityLabel(a).localeCompare(this._todoEntityLabel(b)));
    const selectedEntities = new Set(this._selectedTodoEntities());
    const todoRowsHtml = todoEntityIds.length
      ? todoEntityIds
          .map(
            (id) => `
        <div class="settings-check-row settings-todo-row">
          <label class="settings-check-row-main">
            <input type="checkbox" class="settings-todo-check" value="${this._escAttr(id)}" ${selectedEntities.has(id) ? "checked" : ""}>
            <span>${this._esc(this._todoEntityLabel(id))}</span>
          </label>
          <label class="settings-wishlist-check-wrap" title="${this._escAttr(this._t("todo.lists_tab.wishlist_check_title", "Show this list as a wish list - image, link and description per item, with claiming."))}">
            <input type="checkbox" class="settings-wishlist-check" value="${this._escAttr(id)}" ${this._isWishlistList(id) ? "checked" : ""}>
            <span>${this._t("todo.lists_tab.wishlist_label", "Wish list")}</span>
          </label>
        </div>`
          )
          .join("")
      : `<div class="empty-state">${this._t("todo.lists_tab.no_todo_lists", "No to-do lists found on this Home Assistant instance yet.")}</div>`;

    const grocySelected = this._grocySelectedListIds();
    let grocySectionHtml;
    if (this._grocyConfigured === false) {
      grocySectionHtml = `<div class="empty-state">${this._t("todo.lists_tab.grocy_not_set_up", "Grocy isn't set up in Family Hub yet - add it under Settings &rarr; Devices &amp; Services &rarr; Family Hub &rarr; Configure &rarr; Grocy to show its shopping lists here.")}</div>`;
    } else if (this._grocyConfigured === undefined) {
      grocySectionHtml = `<div class="settings-loading">${this._t("todo.lists_tab.loading", "Loading…")}</div>`;
    } else if (!(this._grocyLists || []).length) {
      grocySectionHtml = `<div class="empty-state">${this._t("todo.lists_tab.no_grocy_lists", "No Grocy shopping lists found yet.")}</div>`;
    } else {
      grocySectionHtml = this._grocyLists
        .map((l) => {
          const checked = grocySelected === null || grocySelected.includes(l.id);
          return `
        <label class="settings-check-row">
          <input type="checkbox" class="settings-grocy-check" value="${l.id}" ${checked ? "checked" : ""}>
          <span>${this._esc(l.name)}</span>
        </label>`;
        })
        .join("");
    }

    const currentRows = this._boardRows();
    const layoutBtnsHtml = Array.from({ length: TODO_CARD_MAX_BOARD_ROWS }, (_, i) => i + 1)
      .map(
        (n) =>
          `<button type="button" class="layout-btn${n === currentRows ? " active" : ""}" data-rows="${n}">${n === 1 ? this._t("todo.layout_hint.row_count_one", "1 row") : this._t("todo.layout_hint.row_count_other", "%n% rows", { n })}</button>`
      )
      .join("");

    panel.innerHTML = `
      <div class="settings-section">
        <div class="settings-section-title">${this._t("todo.lists_tab.todo_lists_heading", "To-Do Lists")}</div>
        <div class="settings-check-list">${todoRowsHtml}</div>
      </div>
      <div class="settings-section">
        <div class="settings-section-title">${this._t("todo.lists_tab.grocy_lists_heading", "Grocy Shopping Lists")}</div>
        <div class="settings-check-list">${grocySectionHtml}</div>
      </div>
      <div class="settings-section layout-section">
        <div class="settings-section-title">${this._t("todo.lists_tab.layout_heading", "Layout")}</div>
        <div class="layout-row">${layoutBtnsHtml}</div>
        <div class="layout-hint"></div>
        <label class="settings-check-row fit-screen-row">
          <input type="checkbox" class="settings-fit-screen-check" ${this._fitToScreen() ? "checked" : ""}>
          <span>${this._fitScreenHintText(currentRows)}</span>
        </label>
      </div>
      <div class="modal-actions">
        <button class="cancel-btn lists-cancel-btn">${this._t("common.cancel", "Cancel")}</button>
        <button class="save-btn lists-save-btn">${this._t("common.save", "Save")}</button>
      </div>
      <div class="form-error"></div>
    `;
    // the layout picker is a small row of preset buttons rather than a number stepper.
    this._listsTabRowsDraft = this._boardRows();
    // same draft-until-Save pattern as the row count above - the hint text mentioning row-dragging only makes sense once BOTH this and the row
    this._listsTabFitScreenDraft = this._fitToScreen();
    const syncFitScreenHint = () => {
      const hint = panel.querySelector(".fit-screen-row span");
      const rows = this._listsTabRowsDraft || 1;
      hint.textContent = this._fitScreenHintText(rows);
    };
    const syncLayoutUi = () => {
      panel.querySelectorAll(".layout-btn").forEach((btn) => {
        btn.classList.toggle("active", parseInt(btn.dataset.rows, 10) === this._listsTabRowsDraft);
      });
      panel.querySelector(".layout-hint").textContent = this._layoutHintText(this._listsTabRowsDraft);
      syncFitScreenHint();
    };
    panel.querySelectorAll(".layout-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._listsTabRowsDraft = parseInt(btn.dataset.rows, 10) || 1;
        syncLayoutUi();
      });
    });
    panel.querySelector(".settings-fit-screen-check").addEventListener("change", (e) => {
      this._listsTabFitScreenDraft = !!e.target.checked;
    });
    syncLayoutUi();
    panel.querySelector(".lists-cancel-btn").addEventListener("click", () => overlay.classList.remove("open"));
    panel.querySelector(".lists-save-btn").addEventListener("click", () => this._saveListsTab(panel, overlay));
  }
  // Describes the chosen layout in terms of the lists actually selected right now ("6 lists across 2 rows - 3 per row")
  _fitScreenHintText(rows) {
    return rows > 1
      ? this._t(
          "todo.lists_tab.fit_screen_hint_resizable",
          "Fit to screen - the card fills the space below it instead of growing the page; each list scrolls on its own, and rows can be resized by dragging the handle between them."
        )
      : this._t(
          "todo.lists_tab.fit_screen_hint",
          "Fit to screen - the card fills the space below it instead of growing the page; each list scrolls on its own."
        );
  }
  _layoutHintText(rows) {
    const total = this._listDescriptors().length;
    if (rows <= 1) {
      if (!total) return this._t("todo.layout_hint.all_lists_one_row", "All lists side by side in one row.");
      const listWord = total === 1 ? this._t("todo.layout_hint.list_one", "list") : this._t("todo.layout_hint.list_other", "lists");
      return this._t("todo.layout_hint.one_row", "All %total% %list_word% side by side in one row.", { total, list_word: listWord });
    }
    if (!total) return this._t("todo.layout_hint.stacked_rows", "Lists split across %rows% stacked rows.", { rows });
    const perRow = Math.ceil(total / rows);
    const usedRows = Math.ceil(total / perRow);
    if (usedRows < rows) {
      const listWord = total === 1 ? this._t("todo.layout_hint.list_one", "list") : this._t("todo.layout_hint.list_other", "lists");
      const rowWord = usedRows === 1 ? this._t("todo.layout_hint.row_one", "row") : this._t("todo.layout_hint.row_other", "rows");
      return this._t("todo.layout_hint.underfilled", "%total% %list_word% only fill %used_rows% %row_word% - pick more lists to use all %rows%.", { total, list_word: listWord, used_rows: usedRows, row_word: rowWord, rows });
    }
    return this._t("todo.layout_hint.filled", "%total% lists across %rows% rows - up to %per_row% per row.", { total, rows, per_row: perRow });
  }
  _todoEntityLabel(entityId) {
    const st = this._hass && this._hass.states && this._hass.states[entityId];
    return (st && st.attributes && st.attributes.friendly_name) || entityId.replace(/^todo\./, "").replace(/_/g, " ");
  }
  // Persists straight to the backend (family_hub/ set_todo_card_config) rather than through setConfig + a config-changed event
  async _saveListsTab(panel, overlay) {
    const entities = Array.from(panel.querySelectorAll(".settings-todo-check:checked")).map((el) => el.value);
    // Only meaningful when the Grocy section actually rendered checkboxes (Grocy configured and at least one list exists)
    const grocyCheckboxes = panel.querySelectorAll(".settings-grocy-check");
    const grocyListIds = grocyCheckboxes.length
      ? Array.from(grocyCheckboxes)
          .filter((el) => el.checked)
          .map((el) => parseInt(el.value, 10))
      : this._grocySelectedListIds() || [];
    // board layout, saved through the very same store as the list selection (and in the same round trip)
    const rows = Math.max(1, Math.min(TODO_CARD_MAX_BOARD_ROWS, this._listsTabRowsDraft || 1));
    // Wish Lists - only the entities whose checkbox actually CHANGED get a family_hub/set_wishlist_flag call
    const wishlistChecked = new Set(Array.from(panel.querySelectorAll(".settings-wishlist-check:checked")).map((el) => el.value));
    const wishlistChanges = [];
    panel.querySelectorAll(".settings-wishlist-check").forEach((el) => {
      const id = el.value;
      const isWishlist = wishlistChecked.has(id);
      if (isWishlist !== this._isWishlistList(id)) wishlistChanges.push({ entity_id: id, is_wishlist: isWishlist });
    });
    wishlistChanges.forEach(({ entity_id, is_wishlist }) => {
      if (is_wishlist) {
        this._wishlistConfig[entity_id] = { ownerUserId: this._myUserId() };
      } else {
        delete this._wishlistConfig[entity_id];
      }
    });
    const fitToScreen = !!this._listsTabFitScreenDraft;
    if (rows !== this._backendBoardRows) this._backendRowHeights = null;
    this._backendEntities = entities;
    this._backendGrocyListIds = grocyListIds;
    this._backendBoardRows = rows;
    this._backendFitToScreen = fitToScreen;
    overlay.classList.remove("open");
    this._render();
    try {
      await this._hass.connection.sendMessagePromise({
        type: "family_hub/set_todo_card_config",
        entities,
        grocy_list_ids: grocyListIds,
        rows,
        fit_to_screen: fitToScreen,
        card_id: this._config.cardId,
      });
    } catch (e) {
    }
    await Promise.all(
      wishlistChanges.map(({ entity_id, is_wishlist }) =>
        this._hass.connection.sendMessagePromise({ type: "family_hub/set_wishlist_flag", entity_id, is_wishlist }).catch(() => {})
      )
    );
    if (wishlistChanges.length) await this._fetchWishlistConfig();
    this._fetchAllLists();
  }

  // - Put Away modal --------------------------------------------- Grocy's own "scan it home" flow: add a shopping-list item into real Grocy

  async _openPutAwayModal(key, uid) {
    const descriptor = this._descriptorByKey(key);
    const item = this._itemsFor(key).find((it) => it.uid === uid);
    if (!descriptor || descriptor.kind !== "grocy" || !item) return;
    const overlay = this._root.querySelector(".putaway-modal");
    const box = overlay.querySelector(".modal-box");

    // Resolved product for this put-away - starts as the row's own product_id when Grocy already linked one
    let selectedProductId = item.productId;
    let selectedProductName = item.productId != null ? item.rawName : null;
    const wasLinked = item.productId != null;

    const renderShell = () => {
      box.innerHTML = `
        <h3>${this._t("todo.putaway.heading", "Put away")}</h3>
        <div class="putaway-item-name">${this._esc(item.rawName || item.summary || "")}</div>
        <div class="putaway-product-section"></div>
        <div class="putaway-fields" hidden>
          <label>${this._t("todo.putaway.location_label", "Location")}<select class="pa-location"><option value="">${this._t("todo.putaway.loading", "Loading…")}</option></select></label>
          <label>${this._t("todo.putaway.expires_label", "Expires")}<input type="date" class="pa-date"></label>
          <label>${this._t("todo.putaway.price_label", "Price")}<input data-fh-placeholder="text.optional" type="number" class="pa-price" min="0" step="0.01" placeholder="${__fhT("text.optional", "Optional", null, "h")}"></label>
        </div>
        <div class="modal-actions">
          <button class="cancel-btn">${this._t("common.cancel", "Cancel")}</button>
          <button class="save-btn putaway-confirm-btn">${this._t("todo.putaway.confirm_btn", "Put Away")}</button>
        </div>
        <div class="form-error"></div>
      `;
      box.querySelector(".cancel-btn").addEventListener("click", () => overlay.classList.remove("open"));
      box.querySelector(".putaway-confirm-btn").addEventListener("click", confirm);
    };

    const fieldsEl = () => box.querySelector(".putaway-fields");
    const productSectionEl = () => box.querySelector(".putaway-product-section");

    const showFields = async () => {
      fieldsEl().hidden = false;
      const locationSelect = box.querySelector(".pa-location");
      const dateInput = box.querySelector(".pa-date");
      if (item.defaultBestBeforeDays != null && item.defaultBestBeforeDays > 0 && !dateInput.value) {
        const d = new Date();
        d.setDate(d.getDate() + item.defaultBestBeforeDays);
        dateInput.value = d.toISOString().slice(0, 10);
      }
      const locations = await this._fetchGrocyLocationsCached();
      const defaultId = item.defaultLocationId != null && locations.some((loc) => loc.id === item.defaultLocationId) ? item.defaultLocationId : null;
      locationSelect.innerHTML = locations.length
        ? locations.map((loc) => `<option value="${loc.id}"${defaultId === loc.id ? " selected" : ""}>${this._esc(loc.name)}</option>`).join("")
        : `<option value="">${this._t("todo.putaway.no_locations", "No locations yet")}</option>`;
    };

    const renderProductSection = () => {
      const sectionEl = productSectionEl();
      if (selectedProductId != null) {
        sectionEl.innerHTML = `
          <div class="putaway-product-label">${this._t("todo.putaway.product_label", "Product:")} <strong>${this._esc(selectedProductName || "")}</strong>
            ${wasLinked ? "" : `<button type="button" class="putaway-change-btn">${this._t("todo.putaway.change_btn", "Change")}</button>`}
          </div>
        `;
        const changeBtn = sectionEl.querySelector(".putaway-change-btn");
        if (changeBtn) changeBtn.addEventListener("click", () => { selectedProductId = null; selectedProductName = null; fieldsEl().hidden = true; renderProductSection(); });
        showFields();
        return;
      }
      fieldsEl().hidden = true;
      sectionEl.innerHTML = `
        <div class="putaway-search-row">
          <input data-fh-placeholder="text.search_grocy_products" type="text" class="pa-search-text" value="${this._escAttr(item.rawName || "")}" placeholder="${__fhT("text.search_grocy_products", "Search Grocy products", null, "h")}">
          <button type="button" class="pa-search-btn">${this._t("todo.putaway.search_btn", "Search")}</button>
        </div>
        <div class="putaway-match-list"><div class="putaway-searching">${this._t("todo.putaway.searching", "Searching…")}</div></div>
      `;
      const searchInput = sectionEl.querySelector(".pa-search-text");
      const searchBtn = sectionEl.querySelector(".pa-search-btn");
      const runSearch = async () => {
        const matchListEl = sectionEl.querySelector(".putaway-match-list");
        matchListEl.innerHTML = `<div class="putaway-searching">${this._t("todo.putaway.searching", "Searching…")}</div>`;
        const text = searchInput.value.trim();
        if (!text) {
          matchListEl.innerHTML = `<div class="empty-state">${this._t("todo.putaway.type_to_search", "Type a product name to search.")}</div>`;
          return;
        }
        try {
          const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/match_grocy_product", text });
          if (result && result.configured === false) {
            matchListEl.innerHTML = `<div class="empty-state">${this._t("todo.putaway.grocy_not_connected", "Grocy isn't connected yet.")}</div>`;
            return;
          }
          const matches = (result && Array.isArray(result.matches)) ? result.matches : [];
          if (!matches.length) {
            matchListEl.innerHTML = `<div class="empty-state">${this._t("todo.putaway.no_matches", "No close matches found - try a different search.")}</div>`;
            return;
          }
          matchListEl.innerHTML = matches
            .map(
              (m) => `<button type="button" class="putaway-match-option" data-product-id="${m.product_id}" data-name="${this._escAttr(m.name)}">${this._esc(m.name)} <span class="putaway-match-score">${Math.round(m.score * 100)}%</span></button>`
            )
            .join("");
          matchListEl.querySelectorAll(".putaway-match-option").forEach((btn) => {
            btn.addEventListener("click", () => {
              selectedProductId = parseInt(btn.dataset.productId, 10);
              selectedProductName = btn.dataset.name;
              renderProductSection();
            });
          });
        } catch (e) {
          matchListEl.innerHTML = `<div class="empty-state">${this._t("todo.putaway.cant_reach_grocy", "Couldn't reach Grocy.")}</div>`;
        }
      };
      searchBtn.addEventListener("click", runSearch);
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") runSearch();
      });
      runSearch();
    };

    const confirm = async () => {
      const errEl = box.querySelector(".form-error");
      if (selectedProductId == null) {
        errEl.textContent = this._t("todo.putaway.pick_product_first", "Pick a product first.");
        return;
      }
      const locationSelect = box.querySelector(".pa-location");
      const locationId = parseInt(locationSelect.value, 10);
      if (!locationId) {
        errEl.textContent = this._t("todo.putaway.pick_location_first", "Pick a location before putting this away.");
        return;
      }
      const dateInput = box.querySelector(".pa-date");
      const priceInput = box.querySelector(".pa-price");
      const priceRaw = priceInput.value.trim();
      const price = priceRaw ? parseFloat(priceRaw) : undefined;
      errEl.textContent = "";
      const confirmBtn = box.querySelector(".putaway-confirm-btn");
      confirmBtn.disabled = true;
      try {
        const result = await this._hass.connection.sendMessagePromise({
          type: "family_hub/put_away_grocy_shopping_list_item",
          item_id: parseInt(item.uid, 10),
          product_id: selectedProductId,
          amount: item.amount || 1,
          location_id: locationId,
          best_before_date: dateInput.value || undefined,
          price: price != null && !Number.isNaN(price) ? price : undefined,
          list_id: descriptor.listId,
          // True whenever the product link came from a fuzzy match/search here rather than Grocy's own row-to-product link
          unlink_by_row_id: !wasLinked,
        });
        if (result && result.configured === false) {
          errEl.textContent = this._t("todo.putaway.grocy_not_connected", "Grocy isn't connected yet.");
          confirmBtn.disabled = false;
          return;
        }
        if (!result || !result.success) {
          errEl.textContent = this._t("todo.putaway.put_away_failed", "Couldn't put that away: %error%", { error: (result && result.error) || this._t("todo.putaway.unknown_error", "unknown error") });
          confirmBtn.disabled = false;
          return;
        }
        overlay.classList.remove("open");
        this._fetchAllLists();
      } catch (e) {
        errEl.textContent = this._t("todo.putaway.cant_reach_grocy", "Couldn't reach Grocy.");
        confirmBtn.disabled = false;
      }
    };

    renderShell();
    overlay.classList.add("open");
    renderProductSection();
  }
  // Cached for the card's session, same convention as family-week-calendar-card.js's own _fetchGrocyLocations
  async _fetchGrocyLocationsCached() {
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

  // - Item detail modal ------------------------------------------ "Todo lists natively have descriptions and due dates when you click an item

  _openItemDetailModal(key, uid) {
    const descriptor = this._descriptorByKey(key);
    const item = this._itemsFor(key).find((it) => it.uid === uid);
    if (!descriptor || !item) return;
    const overlay = this._root.querySelector(".item-detail-modal");
    const box = overlay.querySelector(".modal-box");
    const isGrocy = descriptor.kind === "grocy";
    const completed = item.status === "completed";
    const originalTitle = isGrocy ? (item.rawName || "") : (item.summary || "");
    // A Grocy row already linked to a product shows its title read-only - that name always comes from the linked product record in Grocy itself
    const titleEditable = !isGrocy || item.productId == null;
    // A todo.* item's description/due-date fields are only shown when the list's own entity actually supports them
    const supportsDescription = isGrocy || this._todoEntitySupportsDescription(key);
    const supportsDueDate = isGrocy || this._todoEntitySupportsDueDate(key);
    // Wish Lists - only offered on a todo.* item whose list is flagged AND whose entity actually supports description
    const isWishlist = !isGrocy && this._isWishlistList(key);
    const wishlistParsed = isWishlist ? _parseWishlistDescription(item.description || "") : null;

    box.innerHTML = `
      <div class="detail-header">
        <label class="detail-check-wrap">
          <input type="checkbox" class="detail-check" ${completed ? "checked" : ""}>
          <span class="detail-check-label">${this._t("todo.item_detail.done", "Done")}</span>
        </label>
        <div class="detail-title-field">
          <span class="detail-field-label">${this._t("todo.item_detail.title_label", "Title")}</span>
          ${titleEditable
            ? `<input type="text" class="detail-title" value="${this._escAttr(originalTitle)}">`
            : `<div class="detail-title detail-title-readonly">${this._esc(originalTitle)}</div>`}
        </div>
      </div>
      ${isGrocy
        ? `<label>${this._t("todo.item_detail.note_label", "Note")}<textarea data-fh-placeholder="text.add_a_note" class="detail-note" rows="4" placeholder="${__fhT("text.add_a_note", "Add a note…", null, "h")}">${this._esc(item.note || "")}</textarea></label>
           <label>${this._t("todo.item_detail.amount_label", "Amount")}<input type="number" class="detail-amount" min="0" step="0.01" value="${item.amount || 1}"></label>`
        : `<label ${supportsDescription ? "" : "hidden"}>${this._t("todo.item_detail.description_label", "Description")}<textarea data-fh-placeholder="text.add_a_description" class="detail-description" rows="4" placeholder="${__fhT("text.add_a_description", "Add a description…", null, "h")}">${this._esc(isWishlist ? wishlistParsed.note : (item.description || ""))}</textarea></label>
           ${isWishlist ? `
           <label>${this._t("todo.item_detail.link_label", "Link")}<input type="url" class="detail-wishlist-link" placeholder="https://…" value="${this._escAttr(wishlistParsed.link)}"></label>
           <label>${this._t("todo.item_detail.image_label", "Image URL")}<input type="url" class="detail-wishlist-image" placeholder="https://…" value="${this._escAttr(wishlistParsed.image)}"></label>
           <div class="wishlist-image-controls">
             <label class="wishlist-upload-btn">${this._t("todo.add_item.upload_photo", "Upload photo…")}<input type="file" accept="image/*" class="detail-wishlist-image-file" hidden></label>
             <img class="wishlist-image-preview" alt="" src="${this._escAttr(wishlistParsed.image)}" ${wishlistParsed.image ? "" : "hidden"}>
             <span class="wishlist-image-upload-status"></span>
           </div>` : ""}
           <label ${supportsDueDate ? "" : "hidden"}>${this._t("todo.item_detail.due_date_label", "Due date")}<input type="date" class="detail-due" value="${item.due ? this._escAttr(item.due) : ""}"></label>
           ${(!supportsDescription && !supportsDueDate) ? `<div class="detail-unsupported-hint">${this._t("todo.item_detail.unsupported_hint", "This list doesn't support descriptions or due dates.")}</div>` : ""}`}
      <div class="modal-actions detail-actions">
        <button type="button" class="detail-delete-btn">${this._t("todo.item.delete", "Delete")}</button>
        ${isGrocy ? `<button type="button" class="detail-putaway-btn">${this._t("todo.item_detail.put_away_btn", "Put away")}</button>` : ""}
        <span class="detail-actions-spacer"></span>
        <button type="button" class="cancel-btn">${this._t("common.close", "Close")}</button>
        <button type="button" class="save-btn detail-save-btn">${this._t("common.save", "Save")}</button>
      </div>
      <div class="form-error"></div>
    `;
    box.querySelector(".cancel-btn").addEventListener("click", () => overlay.classList.remove("open"));
    if (isWishlist) {
      this._wireWishlistImageUpload(
        box.querySelector(".detail-wishlist-image-file"),
        box.querySelector(".detail-wishlist-image"),
        box.querySelector(".wishlist-image-preview"),
        box.querySelector(".wishlist-image-upload-status")
      );
    }
    box.querySelector(".detail-check").addEventListener("change", (e) => this._toggleItem(key, uid, e.target.checked));
    box.querySelector(".detail-delete-btn").addEventListener("click", () => {
      this._deleteItem(key, uid);
      overlay.classList.remove("open");
    });
    const putawayBtn = box.querySelector(".detail-putaway-btn");
    if (putawayBtn) {
      putawayBtn.addEventListener("click", () => {
        overlay.classList.remove("open");
        this._openPutAwayModal(key, uid);
      });
    }
    box.querySelector(".detail-save-btn").addEventListener("click", () => {
      const titleInput = box.querySelector(".detail-title:not(.detail-title-readonly)");
      const newTitle = titleInput ? titleInput.value : originalTitle;
      if (isGrocy) {
        this._updateGrocyItemDetails(uid, {
          name: titleEditable ? newTitle : undefined,
          note: box.querySelector(".detail-note").value,
          amount: parseFloat(box.querySelector(".detail-amount").value) || undefined,
        });
      } else {
        let description = supportsDescription ? box.querySelector(".detail-description").value : undefined;
        if (isWishlist && supportsDescription) {
          // Recombine the edited note with the link/image just typed and whatever claim data this item already had (never editable from here
          description = _buildWishlistDescription(box.querySelector(".detail-description").value, {
            link: box.querySelector(".detail-wishlist-link").value.trim(),
            image: box.querySelector(".detail-wishlist-image").value.trim(),
            claimedBy: wishlistParsed.claimedBy,
            claimedByName: wishlistParsed.claimedByName,
            // a reward tie (see _openTieRewardModal) is never editable from this plain note/link/image editor
            rewardItemId: wishlistParsed.rewardItemId,
            rewardCostStars: wishlistParsed.rewardCostStars,
          });
        }
        this._updateTodoItemDetails(key, uid, {
          title: newTitle,
          originalTitle,
          description,
          dueDate: supportsDueDate ? (box.querySelector(".detail-due").value || null) : undefined,
        });
      }
      overlay.classList.remove("open");
    });
    overlay.classList.add("open");
  }

  _css() {
    return `
      /* position:relative is the containing block .add-todo-fab
         needs when [fab-position="card"] switches it to position:absolute. */
      :host { display: block; position: relative; font-family: 'Varela Round', sans-serif; }
      ha-card { background: var(--fc-bg); background-image: var(--fc-bg-overlay-image, none), var(--fc-bg-image, none); background-size: cover, var(--fc-bg-size, cover); background-position: center, var(--fc-bg-position, center); color: var(--fc-text); padding: 14px; }
      .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
      .title { font-size: 18px; font-weight: 800; }
      .actions { display: flex; gap: 8px; }
      .board { display: block; }
      /* "fit to screen" - see _fitToScreen/_syncTodoCardHeight.
         Off by default (no [fit-screen] attribute, no .fit-to-screen
         class), in which case every rule below is simply inert and the
         card looks exactly like it always has: it grows with its content
         and the dashboard page scrolls. Once on, _syncTodoCardHeight pins
         :host's own height to whatever viewport is left below it, and
         these rules turn that fixed height into a flex chain all the way
         down to each list's own items, so every column scrolls on its own
         instead of the page having anything left to scroll. */
      :host([fit-screen]) ha-card { display: flex; flex-direction: column; height: 100%; box-sizing: border-box; }
      :host([fit-screen]) .header { flex: 0 0 auto; }
      .board.fit-to-screen { flex: 1 1 auto; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
      .board.fit-to-screen .todo-board-row { flex: 1 1 0; min-height: 0; }
      /* Only multi-row loses the single-row rule's own horizontal scroll -
         evenly-shared columns never need it - a single fit-to-screen row
         keeps scrolling sideways if there are more columns than fit, same
         as it always has. */
      .board.fit-to-screen .todo-board-row.multi-row { overflow: hidden; }
      .board.fit-to-screen .todo-column { height: 100%; overflow-y: auto; }
      .board.fit-to-screen .todo-column-header { position: sticky; top: 0; background: var(--fc-surface2); z-index: 1; }
      /* the drag handle between two adjacent rows - only ever
         rendered (see _boardHtml) when fit-to-screen is on AND there's
         more than one row, since dragging two rows against each other
         means nothing otherwise. touch-action:none stops a touchscreen
         from also trying to scroll the page while dragging one. */
      .todo-board-row-resize { flex: 0 0 auto; height: 14px; margin: -3px 0; display: flex; align-items: center; justify-content: center; cursor: row-resize; touch-action: none; }
      .todo-board-row-resize-grip { width: 48px; height: 5px; border-radius: 3px; background: var(--fc-border); transition: background-color 0.1s ease; }
      .todo-board-row-resize:hover .todo-board-row-resize-grip,
      .todo-board-row-resize.dragging .todo-board-row-resize-grip { background: var(--fc-accent); }
      .empty-state { font-size: 12px; color: var(--fc-text-secondary); padding: 8px 2px; }
      /* the board is now one or more stacked rows (see
         _boardRowGroups). A SINGLE row is untouched from every version
         before this - one scrolling line of fixed-ish-width columns - so
         the default layout is byte-for-byte what it always was. Only when
         the household actually picks 2+ stacks does .multi-row kick in and
         switch the columns to sharing the width evenly, which is the whole
         point of stacking: two genuinely tiled rows, not two independently
         side-scrolling strips (which is what leaving overflow-x:auto on
         would have produced, and reads as broken). */
      /* Layout picker in the FAB's List(s) tab - a segmented
         row of presets, one active, matching this app's existing shape for
         a short enumerated choice. */
      .layout-row { display: flex; flex-wrap: wrap; gap: 6px; }
      .layout-btn { flex: 1 1 auto; border: 2px solid var(--fc-border, rgba(0,0,0,0.12)); border-radius: 10px; padding: 8px 10px; font-size: 12px; font-weight: 700; background: var(--fc-surface2); color: var(--fc-text); cursor: pointer; }
      .layout-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      .layout-hint { font-size: 11px; color: var(--fc-text-secondary); margin-top: 6px; }
      .todo-board { display: flex; flex-direction: column; gap: 12px; }
      .todo-board-row { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 6px; }
      .todo-board-row.multi-row { overflow-x: visible; }
      .todo-board-row.multi-row > .todo-column { flex: 1 1 0; min-width: 0; max-width: none; }
      .todo-column { flex: 1 1 240px; min-width: 220px; max-width: 340px; display: flex; flex-direction: column; background: var(--fc-surface2); border-radius: 12px; padding: 8px; box-shadow: var(--fc-shadow, 0 2px 5px rgba(0,0,0,0.06)); }
      .todo-column-header { display: flex; align-items: center; gap: 6px; padding: 4px 4px 8px; border-top: 4px solid; border-radius: 3px 3px 0 0; margin: -8px -8px 6px; padding-top: 8px; padding-left: 8px; padding-right: 8px; }
      .todo-column-title { font-weight: 800; font-size: 13px; flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
      .todo-column-source-tag { flex: 0 0 auto; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; background: var(--fc-accent2); color: var(--fc-accent-text); border-radius: 6px; padding: 1px 6px; }
      /* Wish Lists: its own color, distinct from the Grocy
         tag's, so the two are never confused at a glance when a board has
         both kinds of tagged column. */
      .wishlist-column-tag { background: var(--fc-accent3); }
      .todo-column-count { flex: 0 0 auto; background: var(--fc-surface-alt); color: var(--fc-accent2); border-radius: 8px; padding: 1px 7px; font-size: 11px; font-weight: 700; }
      .todo-column-items { display: flex; flex-direction: column; gap: 6px; min-height: 40px; border-radius: 8px; transition: background-color 0.1s ease; }
      .todo-column-items.drag-over { background: var(--fc-surface-alt); outline: 2px dashed var(--fc-accent); outline-offset: 2px; }
      .todo-item { display: flex; align-items: center; gap: 8px; background: var(--fc-card); border-radius: 10px; padding: 8px 10px; box-shadow: var(--fc-shadow, 0 2px 5px rgba(0,0,0,0.08)); cursor: grab; }
      .todo-item.dragging { opacity: 0.4; }
      .todo-item.completed { opacity: 0.55; cursor: default; }
      .todo-item, .cancel-btn {
        backdrop-filter: blur(var(--fc-glass-blur, 0px));
        -webkit-backdrop-filter: blur(var(--fc-glass-blur, 0px));
      }
      .todo-check { flex: 0 0 auto; width: 18px; height: 18px; cursor: pointer; accent-color: var(--fc-accent); }
      .todo-item-text { flex: 1 1 auto; min-width: 0; }
      .todo-item-summary { font-size: 13px; font-weight: 700; overflow-wrap: anywhere; }
      .todo-item.completed .todo-item-summary { text-decoration: line-through; }
      .todo-item-due { font-size: 10px; color: var(--fc-text-secondary); margin-top: 1px; }
      .todo-delete-btn { flex: 0 0 auto; border: none; background: transparent; color: var(--fc-text-secondary); font-size: 12px; cursor: pointer; padding: 2px 4px; border-radius: 6px; }
      .todo-delete-btn:hover { color: var(--fc-accent3); }
      .todo-putaway-btn { flex: 0 0 auto; border: none; background: transparent; color: var(--fc-text-secondary); font-size: 14px; cursor: pointer; padding: 2px 4px; border-radius: 6px; }
      .todo-putaway-btn:hover { color: var(--fc-accent); }
      .completed-row { border-top: 1px solid var(--fc-border); margin-top: 8px; padding-top: 4px; }
      .completed-header { display: flex; align-items: center; gap: 6px; padding: 6px 2px; font-size: 11px; font-weight: 700; cursor: pointer; color: var(--fc-text-secondary); }
      .completed-title { flex: 1; }
      .completed-badge { background: var(--fc-surface-alt); color: var(--fc-accent2); border-radius: 8px; padding: 1px 6px; font-size: 10px; }
      .completed-body { display: flex; flex-direction: column; gap: 6px; margin-top: 2px; }
      /* bottom offset by --fh-fab-offset - see family-hub-chores-card.js's identical comment. */
      .add-todo-fab { position: fixed; right: 18px; bottom: calc(18px + var(--fh-fab-offset, 0px)); z-index: 900; width: 56px; height: 56px; border-radius: 50%; border: none; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 28px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(58,53,44,0.35); transition: transform 0.15s ease, bottom 0.15s ease; }
      .add-todo-fab:active { transform: scale(0.94); }
      /* Hidden (not just z-indexed behind) while ANY Family Hub card on
         this dashboard has a full-screen modal open - see
         family-hub-chores-card.js's identical .add-chore-fab[hidden] rule
         for the same mechanism. */
      .add-todo-fab[hidden] { display: none; }
      /* fab_position: "card" - see family-hub-chores-card.js's
         identical .add-chore-fab rule for the same mechanism. */
      :host([fab-position="card"]) .add-todo-fab { position: absolute; bottom: 18px; }
      .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; align-items: center; justify-content: center; }
      .modal-tabs { display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 1px solid var(--fc-border); }
      .modal-tab-btn { border: none; background: none; color: var(--fc-text-secondary); font-weight: 700; font-size: 13px; padding: 8px 4px 10px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
      .modal-tab-btn.active { color: var(--fc-accent); border-bottom-color: var(--fc-accent); }
      .modal-overlay.open { display: flex; }
      .modal-box { background: var(--fc-bg); color: var(--fc-text); border-radius: 14px; padding: 18px; width: min(90vw, 420px); max-height: 85vh; overflow-y: auto; }
      .modal-box label { display: block; margin: 8px 0; font-size: 13px; font-weight: 700; }
      .modal-box label[hidden] { display: none; }
      .modal-box input, .modal-box select, .modal-box textarea { width: 100%; box-sizing: border-box; margin-top: 4px; padding: 8px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 13px; font-family: inherit; }
      .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
      .modal-actions button { border: none; border-radius: 10px; padding: 8px 16px; font-weight: 700; cursor: pointer; }
      .save-btn { background: var(--fc-accent); color: var(--fc-accent-text); }
      .cancel-btn { background: var(--fc-surface-alt); color: var(--fc-text); }
      .form-error { color: var(--fc-accent3); font-size: 12px; margin-top: 6px; }
      .settings-section { margin-top: 10px; }
      .settings-section-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; color: var(--fc-text-secondary); margin-bottom: 6px; }
      .settings-check-list { display: flex; flex-direction: column; gap: 2px; max-height: 180px; overflow-y: auto; border: 1px solid var(--fc-border); border-radius: 10px; padding: 6px; }
      .settings-check-row { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; padding: 4px 6px; margin: 0; border-radius: 6px; }
      .settings-check-row:hover { background: var(--fc-surface-alt); }
      .settings-check-row input { width: auto; margin: 0; accent-color: var(--fc-accent); }
      .settings-loading { font-size: 12px; color: var(--fc-text-secondary); padding: 6px 2px; font-style: italic; }
      /* Wish Lists: each to-do entity row in the List(s) tab
         gets a second, smaller "Wish list" checkbox alongside its main
         show/hide one - see _renderListsTab. Both classes on the labels
         below deliberately outrank the generic .modal-box label rule
         (display:block/margin:8px 0) so they stay a tight inline row
         rather than stacking. */
      .settings-todo-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 2px 6px; border-radius: 6px; }
      .settings-todo-row:hover { background: var(--fc-surface-alt); }
      .settings-todo-row .settings-check-row-main { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; margin: 4px 0; flex: 1 1 auto; min-width: 0; }
      .settings-todo-row .settings-wishlist-check-wrap { display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; margin: 4px 0; color: var(--fc-text-secondary); white-space: nowrap; flex: 0 0 auto; }
      .settings-todo-row input { width: auto; margin: 0; accent-color: var(--fc-accent); }
      /* Wish Lists: item rendering on the board itself - see
         _wishlistItemHtml. */
      .wishlist-item { align-items: flex-start; }
      .wishlist-item-image { flex: 0 0 auto; width: 40px; height: 40px; border-radius: 8px; object-fit: cover; background: var(--fc-surface-alt); }
      .wishlist-item-image-placeholder { display: flex; align-items: center; justify-content: center; font-size: 18px; }
      .wishlist-item-text { display: flex; flex-direction: column; gap: 2px; }
      .wishlist-item-note { font-size: 11px; color: var(--fc-text-secondary); overflow-wrap: anywhere; }
      .wishlist-item-row { display: flex; align-items: center; gap: 8px; margin-top: 2px; flex-wrap: wrap; }
      .wishlist-item-link { font-size: 11px; font-weight: 700; color: var(--fc-accent); text-decoration: none; }
      .wishlist-item-link:hover { text-decoration: underline; }
      .wishlist-claim-btn { border: none; border-radius: 8px; padding: 3px 8px; font-size: 10px; font-weight: 800; cursor: pointer; background: var(--fc-accent2); color: var(--fc-accent-text); }
      .wishlist-claim-btn.claimed { background: var(--fc-surface-alt); color: var(--fc-text-secondary); cursor: default; }
      .wishlist-claim-btn.claimed-by-me { background: var(--fc-accent3); color: var(--fc-accent-text); cursor: pointer; }
      /* "tie a wish list item to a reward" - see
         _wishlistItemHtml/_openTieRewardModal/_claimWishlistReward. */
      .wishlist-tie-reward-btn { border: none; border-radius: 8px; padding: 3px 8px; font-size: 10px; font-weight: 700; cursor: pointer; background: var(--fc-surface-alt); color: var(--fc-text-secondary); }
      .wishlist-reward-row { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
      .wishlist-reward-badge { font-size: 11px; font-weight: 800; color: var(--fc-text); background: var(--fc-surface-alt); border-radius: 8px; padding: 3px 8px; }
      .wishlist-claim-reward-btn { border: none; border-radius: 8px; padding: 3px 10px; font-size: 10px; font-weight: 800; cursor: pointer; background: var(--fc-accent2); color: var(--fc-accent-text); }
      .wishlist-claim-reward-btn:disabled { background: var(--fc-surface-alt); color: var(--fc-text-secondary); cursor: default; }
      .tie-reward-modal .modal-box label { display: block; margin-bottom: 10px; font-size: 13px; font-weight: 700; color: var(--fc-text); }
      .tie-reward-modal .modal-box input { display: block; width: 100%; box-sizing: border-box; margin-top: 4px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 14px; font-family: inherit; }
      /* Upload a photo - the Add/item detail modals' Upload
         photo control, see _wireWishlistImageUpload. */
      .wishlist-image-controls { display: flex; align-items: center; gap: 10px; margin: 8px 0; }
      .wishlist-upload-btn { display: inline-flex; align-items: center; margin: 0; border: 2px dashed var(--fc-border, rgba(0,0,0,0.2)); border-radius: 10px; padding: 6px 12px; font-size: 12px; font-weight: 700; color: var(--fc-text-secondary); cursor: pointer; }
      .wishlist-upload-btn:hover { border-color: var(--fc-accent); color: var(--fc-accent); }
      .wishlist-image-preview { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; background: var(--fc-surface-alt); }
      .wishlist-image-upload-status { font-size: 11px; color: var(--fc-text-secondary); }
      .putaway-item-name { font-size: 13px; font-weight: 700; margin: 4px 0 10px; }
      .putaway-product-section { margin-bottom: 4px; }
      .putaway-product-label { font-size: 13px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .putaway-change-btn { border: none; background: var(--fc-surface-alt); color: var(--fc-accent2); font-size: 11px; font-weight: 700; border-radius: 8px; padding: 3px 8px; cursor: pointer; }
      .putaway-search-row { display: flex; gap: 6px; }
      .putaway-search-row input { margin-top: 0; }
      .putaway-search-row .pa-search-btn { flex: 0 0 auto; border: none; border-radius: 8px; padding: 0 12px; font-weight: 700; cursor: pointer; background: var(--fc-accent); color: var(--fc-accent-text); }
      .putaway-match-list { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; max-height: 160px; overflow-y: auto; }
      .putaway-match-option { display: flex; align-items: center; justify-content: space-between; gap: 8px; text-align: left; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); border-radius: 8px; padding: 6px 10px; font-size: 13px; cursor: pointer; }
      .putaway-match-option:hover { background: var(--fc-surface-alt); }
      .putaway-match-score { flex: 0 0 auto; font-size: 10px; color: var(--fc-text-secondary); }
      .putaway-searching { font-size: 12px; color: var(--fc-text-secondary); padding: 4px 2px; font-style: italic; }
      .detail-header { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 6px; }
      .detail-check-wrap { display: flex; flex-direction: column; align-items: center; gap: 2px; flex: 0 0 auto; cursor: pointer; padding-top: 4px; }
      .detail-check { width: 20px; height: 20px; cursor: pointer; accent-color: var(--fc-accent); margin: 0; }
      .detail-check-label { font-size: 10px; font-weight: 700; color: var(--fc-text-secondary); }
      .detail-title-field { flex: 1 1 auto; min-width: 0; }
      .detail-field-label { display: block; font-size: 11px; font-weight: 700; color: var(--fc-text-secondary); margin-bottom: 2px; }
      .detail-title { width: 100%; box-sizing: border-box; font-size: 16px; font-weight: 800; margin: 0 !important; padding: 4px 6px; }
      .detail-title-readonly { border: 1px solid transparent; padding: 4px 6px; color: var(--fc-text); overflow-wrap: anywhere; }
      .detail-unsupported-hint { font-size: 12px; color: var(--fc-text-secondary); margin: 8px 0; }
      .detail-actions { align-items: center; }
      .detail-actions-spacer { flex: 1 1 auto; }
      .detail-delete-btn, .detail-putaway-btn { border: none; border-radius: 10px; padding: 8px 14px; font-weight: 700; cursor: pointer; background: var(--fc-surface-alt); color: var(--fc-accent3); }
      .detail-putaway-btn { color: var(--fc-accent2); }
      /* kiosk PIN login - byte-identical to family-hub-chores-
         card.js/family-hub-rewards-card.js's own copy of these rules. */
      .detail-close-btn { border: none; background: none; color: var(--fc-text-secondary); font-size: 16px; cursor: pointer; line-height: 1; padding: 4px; }
      .kiosk-login-btn { border: 1px solid var(--fc-border); border-radius: 12px; padding: 6px 12px; font-size: 12px; font-weight: 700; background: var(--fc-surface-alt); color: var(--fc-text); cursor: pointer; }
      .kiosk-login-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      .kiosk-login-box { max-width: 360px; }
      .kiosk-login-user-picker { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
      .kiosk-login-user-btn { border: 2px solid var(--fc-border); border-radius: 12px; padding: 10px 14px; font-weight: 700; background: var(--fc-card); color: var(--fc-text); cursor: pointer; }
      .kiosk-login-user-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      .kiosk-login-empty { color: var(--fc-text-secondary); font-size: 13px; }
      .kiosk-login-pin-input { width: 100%; box-sizing: border-box; font-size: 22px; letter-spacing: 6px; text-align: center; padding: 10px; border-radius: 10px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); }
      .kiosk-login-error { color: #b3462c; font-size: 13px; min-height: 18px; margin-top: 6px; }
      @media (max-width: 700px) {
        .todo-board-row { gap: 8px; }
        .todo-column { flex: 0 0 82vw; min-width: 0; }
        /* On a phone, stacking is undone deliberately: at this width a
           column is already a full screen wide (82vw, swipe for the next),
           so tiling 2-4 of them per row would give slivers nothing fits in.
           The chosen row COUNT is still honoured - the lists stay grouped
           into the same stacks, in the same order - each stack just goes
           back to being its own side-scrolling line, exactly like the
           single-row layout. Nothing about the saved setting changes; this
           is purely how it renders narrow, keeping the card's existing
           small-display behavior intact. */
        .todo-board-row.multi-row { overflow-x: auto; }
        .todo-board-row.multi-row > .todo-column { flex: 0 0 82vw; max-width: none; }
      }
    `;
  }
}

// See FamilyHubTodoCard.getConfigElement's own comment for why this exists at all instead of just returning getConfigForm() and letting Home
class FamilyHubTodoCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    if (!this._themeOptions) this._fetchThemeOptions();
  }
  // per-card Theme override options - duplicated (not shared/ imported) from family-hub-goals-card.js's own editor
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
      entities: this._config.entities,
      include_grocy_shopping_lists: this._config.include_grocy_shopping_lists,
      fab_position: this._config.fab_position === "card" ? "card" : "dashboard",
      theme_override: (typeof this._config.theme_override === "string") ? this._config.theme_override : "",
    };
  }
  _schema() {
    const base = FamilyHubTodoCard.getConfigForm().schema;
    return base.concat([
      {
        name: "theme_override",
        selector: { select: { mode: "dropdown", options: this._themeOptions || [{ value: "", label: "Use device settings (default)" }] } },
      },
    ]);
  }
  _render() {
    const { computeLabel } = FamilyHubTodoCard.getConfigForm();
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
        : undefined
    );
    form.data = this._formData();
    if (this._hass) form.hass = this._hass;
    form.addEventListener("value-changed", (e) => {
      e.stopPropagation();
      // ha-form's own emitted value only ever carries the schema's fields - merge it into a COPY of the full config
      const merged = Object.assign({}, this._config, e.detail.value);
      this._config = merged;
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: merged }, bubbles: true, composed: true }));
    });
    this._form = form;
    this.appendChild(form);
  }
}

customElements.define("family-hub-todo-card", FamilyHubTodoCard);
customElements.define("family-hub-todo-card-editor", FamilyHubTodoCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "family-hub-todo-card")) {
  window.customCards.push({
    type: "family-hub-todo-card",
    name: "Family Hub To-Do Lists",
    description: "A Family Hub-styled board over your Home Assistant to-do lists and (optionally) Grocy shopping lists - multiple lists side by side, drag and drop between them, and a FAB to quickly add an item.",
  });
}
