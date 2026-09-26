// Family Hub Active Timers card (v1.110.1+) - "We should also build an
// active timers card that shows all the timers active in the house, color
// coded if they are assigned to someone based on their user color. You
// should be able to have a pop up modal that has 3-4 common timer times,
// optional assign to user and optional add time, will show up as a card on
// the active timers screen."
//
// One board showing every countdown currently running in the household,
// whatever started it:
//   - CHORE timers ("clean for 30 minutes") and REWARD timers ("2 hours of
//     gaming"), both from v1.110.0 - read from the SAME timers store, via
//     the same family_hub/timers/list command those cards already use.
//     There is deliberately no second timer-storage system.
//   - STANDALONE timers (new here) - a general-purpose household timer with
//     no chore or reward behind it at all, started from this card's own
//     quick-timer modal. The oven, a board game, whose turn it is. See
//     TIMER_KIND_STANDALONE in const.py for why it's a third `kind` in the
//     existing store rather than storage of its own.
//   - v1.120.0+: FOREIGN native `timer.*` entities - any HA timer helper
//     currently active that ISN'T one Family Hub itself started/adopted
//     (someone else's automation, a helper made from Developer Tools or
//     HA's own UI, another integration entirely). Household ask, verbatim:
//     "can we make the timers card show all active timers not just from
//     family hub." These render read-only aside from an admin-only Stop
//     (no ownership model exists for an arbitrary entity the way it does
//     for Family Hub's own timers) and with a dashed border so it's
//     obvious at a glance which timers this board actually manages vs. is
//     just reporting on. See _foreignTimerEntities/_allTimers below.
//
// COLOUR CODING. Each card is tinted with the household member it's
// assigned to, using that person's EXISTING colour - settings.userProfiles
// [id].color when they've picked one on the calendar card's Users tab,
// otherwise their automatically-assigned PALETTE slot. That is the identical
// _userColor resolution family-hub-chores-card.js uses for its own per-person
// columns (and the same profile field the calendar's people columns read),
// deliberately copy-pasted rather than reinvented so a household that
// recolours someone in Settings sees it change everywhere at once. An
// UNASSIGNED timer gets a neutral grey treatment instead of borrowing some
// arbitrary person's colour.
//
// LIVE COUNTDOWNS reuse the exact mechanism the chore/reward cards already
// use: remaining time is computed locally from started_at + duration_minutes
// on a 1-second ticker that repaints only [data-timer-uid] text in place,
// while the BACKEND remains the only thing that decides a timer has actually
// expired (a dedicated sweep every TIMER_SWEEP_SECONDS - see
// _expire_due_timers in chores_websocket_api.py). So the number on screen is
// smooth and accurate between polls, and a timer still fires with every
// dashboard closed and the tablet asleep.
//
// Config is just an optional `title`, same as the Chores/Rewards/Goals
// cards - everything else comes from the Family Hub backend, there are no
// entities to point it at.
//
// Same self-contained, independently-loaded-Lovelace-resource shape as every
// other Family Hub card - PALETTE and the theme/settings/users boilerplate
// are copy-pasted rather than imported, matching this project's established
// convention.

const PALETTE = ["#a9c6c2", "#dba99c", "#d9bf7e", "#a8bd93", "#b9a7c9", "#cf8f6c", "#a89a83"];
// Must match const.py's TIMER_PRESET_MINUTES. Chosen for the household-timer
// use case: 5 is the nag/turn-taking timer, 15 and 30 cover most cooking and
// screen-time slices, 60 is the long one. The custom-minutes box alongside
// them means these are shortcuts, never a limit.
const TIMER_PRESETS = [5, 15, 30, 60];
const UNASSIGNED_COLOR = "#c9c2b3";

// v1.119.0+: household ask, verbatim: "route this through alarm
// notifications for the person the timer is for, if its started by a
// device with a kiosk still open can we make sounds and pop up a modal
// that requires you to click stop?"
//
// The phone-push half of that (Android alarm-stream channel / iOS
// critical alert) is entirely server-side - see chores_websocket_api.py's
// _send_alarm_notification. THIS is the other half: a same-device sound +
// blocking "tap Stop" modal, but only on the ONE browser tab that actually
// started the timer, and only while that tab is still open - not every
// Family Hub screen in the house, and not a re-trigger every time some
// OTHER card's poll happens to notice the same timer.
//
// How "only the originating tab, if still open" is decided with zero
// backend round-trips: every tab gets its own random id, stable for that
// tab's lifetime (sessionStorage - survives a reload, gone once the tab
// actually closes), sent as `client_id` when a timer is started and
// snapshotted onto it server-side as `origin_client_id` (see
// timer_engine.py's own docstring). A tab recognizes "this is mine" by
// comparing its own id against that field on its own next per-second
// countdown tick - no need to ask the backend "was it me?", and no risk of
// a DIFFERENT tab (someone else's phone, a second kiosk display) alarming
// for a timer it didn't start.
//
// window-singleton, guarded-by-`if` shape (same precedent as
// window.__familyHubFabCoordinator/__familyHubKioskSession/
// __familyHubScreenSaver elsewhere in these files) so three cards on the
// same dashboard - Chores, Rewards, Active Timers, all of which can start
// a timer - share exactly ONE modal/audio loop instead of each popping
// its own. The modal is appended to `document.body`, not any one card's
// shadow root, so it keeps working even if whichever card first noticed
// the alarm gets scrolled off-screen or unmounted afterward.
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

class FamilyHubActiveTimersCard extends HTMLElement {
  static getStubConfig() {
    return { title: "Active Timers" };
  }
  // v1.111.0+: switched to getConfigElement (a real custom element) so the
  // new theme_override field can offer a live-fetched theme list - see
  // FamilyHubActiveTimersCardEditor at the bottom of this file.
  static getConfigElement() {
    return document.createElement("family-hub-active-timers-card-editor");
  }
  setConfig(config) {
    this._config = {
      title: (config && config.title) || "Active Timers",
      // v1.111.0+: "" (default) = "Use device settings" - see
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
    if (first) this._firstLoadPromise = this._initFirstLoad();
  }
  async _initFirstLoad() {
    await Promise.all([this._fetchSettings(), this._fetchUsers(), this._fetchTimers(), this._fetchMyPermissions()]);
    // v1.111.0+: always fetched now (not just when useGlobalTheme is on) -
    // a per-card theme_override needs this list regardless.
    await this._fetchGlobalThemes();
    // v1.110.3+ - backfill for a household that upgraded without re-saving
    // Settings (which is the calendar card's own trigger for this same
    // reconcile). Best-effort, never blocks the rest of first load.
    this._ensureTimerHelpers((this._getSettings().memberUserIds) || []).catch(() => {});
    this._startPolling();
    this._startTimerTicker();
    this._subscribeAlarmEvents();
    this._render();
  }
  // v1.132.55+: household-wide timer alarms - subscribe to the two bus
  // events chores_websocket_api.py's _dispatch_timer_alarm/
  // _reannounce_active_alarms fire (see const.py's
  // EVENT_FAMILY_HUB_TIMER_ALARM_RING/_STOP), and hand each one to the
  // shared window.__familyHubTimerAlarm singleton above - same "one modal/
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

  // v1.110.3+ - see family-week-calendar-card.js's copy of this function
  // for the full design note (why the frontend does this rather than
  // Python, the naming scheme, and why removal never deletes a helper).
  // Duplicated rather than shared, matching this project's established
  // convention of self-contained, independently-loaded card files.
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
    return { theme: this._defaultTheme(), useGlobalTheme: true, globalThemeId: "liquidglass" };
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
  // household-global branch below (see the v144.5+ comment this used to
  // live under for why cardOpacity/glassBlur skip the color-shape
  // validation loop).
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
  _resolveTheme(settings) {
    const local = settings.theme || this._defaultTheme();
    // v1.111.0+: a per-card-placement Theme override (from this card's own
    // native "Edit Card" dialog) wins over this device's own override and
    // the household's Global Theme - the most specific choice available.
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
    // v1.111.0+: also merge in every installed native Home Assistant theme
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

  // --- Timers ---------------------------------------------------------------
  // Same shape as the chore/reward cards' own copies (see
  // family-hub-chores-card.js) - the countdown you SEE is derived here from
  // started_at + duration_minutes; the backend is what decides a timer is
  // actually done. Derived rather than stored is also why a reload or a
  // Home Assistant restart mid-countdown resumes at the right number.
  //
  // v1.120.0+: household ask, verbatim: "can we make the timers card show
  // all active timers not just from family hub." Family Hub's own timers
  // (chore/reward/standalone) still come from family_hub/timers/list below
  // exactly as before; _foreignTimerEntities/_allTimers layer in every
  // OTHER `timer.*` domain entity currently running in the house - a plain
  // HA timer helper someone made directly, one from an automation or a
  // different integration, whatever - so this board is genuinely "every
  // timer running in the house," matching the card's own original ask
  // ("an active timers card that shows all the timers active in the
  // house") rather than only the ones Family Hub itself started.
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
  // Every OTHER `timer.*` entity in the house that's currently counting
  // down, EXCLUDING any entity Family Hub itself has already adopted for
  // one of its own tracked timers (see timer_engine.py's "entity_id" field
  // and _ensureTimerHelpers above) - that one is already shown as its own
  // full Family Hub timer card, and showing it a second time here would be
  // confusing, not helpful. Only `state === "active"` counts, matching
  // this card's own name/purpose ("Active Timers") - a timer helper
  // sitting idle isn't something running that a household member is
  // waiting on.
  //
  // There is no ownership model at all for an arbitrary HA entity (unlike
  // a Family Hub timer, which always has a user_id or is explicitly
  // "the room's"), so these render read-only aside from an admin-only
  // Stop - see _canCancelTimer/_cancelTimer below.
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
  // HA's own timer.duration attribute is "HH:MM:SS" - parsed defensively
  // (falls back to 0, i.e. "of 0m", rather than throwing) since it's
  // reflecting whatever an unrelated integration or automation set it to,
  // not something Family Hub controls.
  _parseHaDurationMinutes(duration) {
    const parts = String(duration || "").split(":").map((p) => parseInt(p, 10));
    if (!parts.length || parts.some((p) => !Number.isFinite(p))) return 0;
    if (parts.length === 3) return Math.round(parts[0] * 60 + parts[1] + parts[2] / 60);
    if (parts.length === 2) return Math.round(parts[0] + parts[1] / 60);
    return 0;
  }
  // Everything this board shows: Family Hub's own tracked timers plus
  // every other running HA timer.* entity. Kept as one combined helper
  // (rather than inlining the concat at each call site) so _render and
  // _renderTimerCountdowns can never drift out of sync about what counts.
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
  // v1.119.0+: this browser tab's own stable id - sessionStorage-backed
  // (survives a reload of this same tab, gone once the tab actually
  // closes), shared under the same fixed key across every Family Hub
  // card on the page so a timer started from the Chores card and watched
  // from, say, the Active Timers card on the SAME tab still recognizes
  // itself as "mine" - see window.__familyHubTimerAlarm's own comment.
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
  _formatTimerLength(minutes) {
    const m = Number(minutes) || 0;
    if (m >= 60 && m % 60 === 0) return `${m / 60}h`;
    if (m > 60) return `${Math.floor(m / 60)}h${Math.round(m % 60)}m`;
    // v1.132.59+: "can we make the timer accept seconds" - a sub-minute
    // (or otherwise non-whole-minute) duration now reads as "45s" / "1m30s"
    // instead of rounding down to a misleading "0m" / "1m".
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
    // v1.119.0+: kiosk-side sound+modal alarm for whichever ONE running
    // timer this exact browser tab started, if it opted into alarm-style
    // delivery - see window.__familyHubTimerAlarm's own top comment.
    // Deliberately every tick (not just on the local zero-crossing) so a
    // tab that was reloaded/backgrounded right as a timer finished still
    // catches up and alarms once its poll comes back with remaining<=0.
    if (window.__familyHubTimerAlarm) {
      window.__familyHubTimerAlarm.check(this._timers, this._familyHubClientId(), (t) => this._timerRemainingSeconds(t), this._hass);
    }
    const allTimers = this._allTimers();
    // v1.120.0+: a foreign HA timer.* entity can start or finish entirely
    // outside Family Hub (someone else's automation, a helper started from
    // Developer Tools, HA's own UI) with no family_hub/timers/list poll to
    // ever notice - so if the SET of what's currently running has changed
    // since the last paint (not just the countdown numbers on what's
    // already there), rebuild the whole board rather than trying to patch
    // individual cards in place.
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
      // Only a Family Hub timer's own zero-crossing needs the backend
      // asked what happened next (see below) - a foreign entity's own
      // "active" -> "idle"/"finished" state transition is what the setChanged
      // check above already catches on its own next tick, no fetch needed.
      if (left <= 0 && !timer.foreign) anyExpired = true;
    });
    // The instant something visibly hits zero, ask the backend what
    // actually happened rather than guessing - it owns expiry. Guarded so
    // this fires once per expiry, not once a second afterwards.
    if (anyExpired && !this._timerExpiryRefreshPending) {
      this._timerExpiryRefreshPending = true;
      setTimeout(() => {
        this._timerExpiryRefreshPending = false;
        this._fetchTimers();
      }, 2000);
    }
  }
  _userName(id) {
    if (!id) return "Unassigned";
    const u = (this._users || []).find((x) => x.id === id);
    return u ? u.name : id;
  }
  // The person's OWN colour, resolved exactly as family-hub-chores-card.js's
  // _userColor does: a custom colour picked on the calendar card's Users tab
  // (settings.userProfiles[id].color) wins, otherwise their automatically
  // assigned PALETTE slot. Copy-pasted deliberately rather than reinvented -
  // recolouring someone in Settings must change them everywhere at once.
  // An unassigned timer gets a neutral grey rather than borrowing somebody's.
  _userColor(id) {
    if (!id) return UNASSIGNED_COLOR;
    const profiles = (this._settingsCache && this._settingsCache.userProfiles) || {};
    const custom = profiles[id] && profiles[id].color;
    if (custom) return custom;
    const idx = (this._users || []).findIndex((x) => x.id === id);
    return idx >= 0 ? PALETTE[idx % PALETTE.length] : UNASSIGNED_COLOR;
  }
  // What this timer is FOR - a chore/reward timer's snapshotted title, or a
  // standalone one's own label, falling back to a plain kind name so a
  // hurriedly-started unnamed timer still reads as something.
  _timerLabel(timer) {
    if (timer.title) return timer.title;
    if (timer.kind === "chore") return "Chore";
    if (timer.kind === "reward") return "Reward";
    return "Timer";
  }
  _timerKindLabel(kind) {
    return kind === "chore" ? "Chore" : kind === "reward" ? "Reward" : kind === "native" ? "HA Timer" : "Timer";
  }
  // Mirrors ws_cancel_timer's own rules exactly, so no button is offered
  // that the backend would refuse (it re-checks independently - this is
  // only about not showing a dead control):
  //   - chore/reward: your own always; someone else's needs the same grant
  //     completing/redeeming for them already needs.
  //   - standalone UNASSIGNED: anyone (it belongs to the room).
  //   - standalone ASSIGNED: the person it's for, whoever started it, or an
  //     admin.
  _canCancelTimer(timer) {
    if (!timer) return false;
    const me = this._myUserId();
    if (this._isAdmin()) return true;
    // v1.120.0+: a foreign HA timer.* entity has no owner/permission model
    // at all (unlike Family Hub's own timers, which always have a user_id
    // or are explicitly "the room's") - admin-only to stop, same as any
    // other raw entity control a non-admin shouldn't get from this board.
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
    // v1.120.0+: a foreign HA timer.* entity (synthetic uid "ha:<entity_id>",
    // see _foreignTimerEntities) has no family_hub/timers/cancel record at
    // all - stop it the plain HA way instead, straight through the timer
    // domain's own cancel service.
    if (uid.indexOf("ha:") === 0) {
      const entityId = uid.slice(3);
      try {
        await this._hass.callService("timer", "cancel", {}, { entity_id: entityId });
      } catch (e) {
        window.alert((e && e.message) || "Couldn't stop that timer.");
      }
      this._render();
      return;
    }
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/timers/cancel", uid });
    } catch (e) {
      window.alert((e && e.message) || "Couldn't stop that timer.");
    }
    await this._fetchTimers();
  }

  // --- Board ----------------------------------------------------------------
  _timerCardHtml(timer) {
    const color = this._userColor(timer.user_id);
    const unassigned = !timer.user_id;
    const left = this._timerRemainingSeconds(timer);
    const who = unassigned ? "Unassigned" : this._userName(timer.user_id);
    const cancel = this._canCancelTimer(timer)
      ? `<button class="timer-cancel-btn" data-uid="${this._esc(timer.uid)}" title="Stop this timer">&#10005;</button>`
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
        <div class="timer-total">of ${this._formatTimerLength(timer.duration_minutes)}</div>
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
      : `<div class="empty-state">Nothing's running right now. Tap &#65291; Start Timer to set one.</div>`;
    const count = this._root.querySelector(".timer-count");
    if (count) count.textContent = timers.length ? String(timers.length) : "";
  }

  // --- Quick-timer modal ----------------------------------------------------
  // "a pop up modal that has 3-4 common timer times, optional assign to user
  // and optional add time."
  //
  // Both a LABEL field and a CUSTOM MINUTES field are included. "add time"
  // in the request could plausibly mean either, and neither is expensive, so
  // this covers the ambiguity in both directions: the presets plus a custom
  // box answer "how long," and the label answers "what for" (which is what
  // makes a board of five simultaneous timers legible at all).
  _openQuickTimerModal() {
    const overlay = this._root.querySelector(".quick-timer-modal");
    const box = overlay.querySelector(".modal-box");
    this._draftMinutes = null;
    // v1.132.57+: household ask, verbatim - "why dont household timers
    // alert on the kiosks" - same 3-way "self/kiosks/everyone" tier
    // chores/rewards already have (see const.py's CHORE_KEY_ALARM_
    // AUDIENCE), now offered here too. Resets to "self" (the pre-existing
    // behavior) every time the modal opens, same as _draftMinutes above.
    this._draftAlarmAudience = "self";
    const presetBtns = TIMER_PRESETS.map(
      (m) => `<button type="button" class="preset-btn" data-minutes="${m}">${this._formatTimerLength(m)}</button>`
    ).join("");
    const userOptions = (this._users || [])
      .map((u) => `<option value="${this._esc(u.id)}">${this._esc(u.name)}</option>`)
      .join("");
    box.innerHTML = `
      <h3>Start a timer</h3>
      <div class="preset-row">${presetBtns}</div>
      <label>Or a custom length
        <div class="q-custom-row">
          <input type="number" class="q-minutes" min="0" max="1440" placeholder="min">
          <input type="number" class="q-seconds" min="0" max="59" placeholder="sec">
        </div>
      </label>
      <label>What's it for? (optional)<input type="text" class="q-label" maxlength="60" placeholder="Oven, Sam's turn, laundry..."></label>
      <label>Assign to (optional)<select class="q-user"><option value="">Nobody - just a house timer</option>${userOptions}</select></label>
      <label>Who hears this alarm
        <div class="q-audience-row">
          <button type="button" class="q-audience-btn active" data-value="self">Just them</button>
          <button type="button" class="q-audience-btn" data-value="kiosks">Them + kiosks</button>
          <button type="button" class="q-audience-btn" data-value="everyone">Everyone</button>
        </div>
      </label>
      <div class="modal-actions">
        <button type="button" class="cancel-btn">Cancel</button>
        <button type="button" class="save-btn" disabled>Start</button>
      </div>
      <div class="form-error"></div>
    `;
    const minutesInput = box.querySelector(".q-minutes");
    const secondsInput = box.querySelector(".q-seconds");
    const saveBtn = box.querySelector(".save-btn");
    const syncState = () => {
      // A preset chip and the custom min/sec boxes are two ways of
      // answering the same question, so typing in either box clears the
      // chip rather than leaving two contradictory selections visible.
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
  // v1.132.59+: household ask, verbatim - "can we make the timer accept
  // seconds." Reads the modal's minutes + seconds custom-length boxes
  // together and folds them into one fractional-minutes number (e.g. 1
  // min 30 sec -> 1.5), or null if both are empty - null means "use
  // whichever preset chip is active instead," same fallback the old
  // minutes-only box already had. Shared between syncState (enabling the
  // Start button / highlighting the active preset) and _submitQuickTimer
  // so the two can never disagree about what's currently entered.
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
        // v1.132.57+: "who hears this alarm" - see the button row's own
        // comment above.
        alarm_audience: this._draftAlarmAudience || "self",
      });
    } catch (e) {
      errEl.textContent = (e && e.message) || "Couldn't start that timer.";
      return;
    }
    overlay.classList.remove("open");
    await this._fetchTimers();
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
        <div class="header">
          <div class="title"></div>
          <span class="timer-count"></span>
          <button class="add-timer-btn">&#65291; Start Timer</button>
        </div>
        <div class="timers-board"></div>
      </ha-card>
      <div class="modal-overlay quick-timer-modal"><div class="modal-box"></div></div>
    `;
    this._root = root;
    root.querySelector(".add-timer-btn").addEventListener("click", () => this._openQuickTimerModal());
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
      ha-card { background: var(--fc-bg); color: var(--fc-text); padding: 14px; height: 100%; box-sizing: border-box; overflow-y: auto; }
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
      /* v1.120.0+: a plain HA timer.* entity, not one of Family Hub's own -
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
      /* v1.132.59+: "can we make the timer accept seconds" - the custom
         length row is now two inputs (min/sec) side by side instead of
         one; override the generic 100%-width input rule above so they
         share the row instead of each claiming the full width. */
      .q-custom-row { display: flex; gap: 8px; margin-top: 4px; }
      .q-custom-row input { width: auto; flex: 1 1 0; margin-top: 0; }
      /* v1.132.57+: "Who hears this alarm" 3-way row - same visual idiom
         as .preset-btn above (a small pill button group), for the quick-
         timer modal's new alarm_audience picker. */
      .q-audience-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
      .q-audience-btn { flex: 1 1 0; min-width: 88px; min-height: 40px; border: 2px solid var(--fc-border); border-radius: 10px; padding: 8px 6px; font-size: 12.5px; font-weight: 800; background: var(--fc-surface2); color: var(--fc-text); cursor: pointer; }
      .q-audience-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
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

// v1.111.0+: native "Edit Card" config editor - a thin wrapper around
// Home Assistant's own <ha-form>, needed only because the new
// theme_override field's option list has to be fetched live. See
// FamilyHubGoalsCardEditor in family-hub-goals-card.js for the identical
// pattern/reasoning.
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
