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

// Star economy ledger: every household member's star balance, a browsable
// reward catalog with a one-click claim flow (instant self-serve - see
// reward_engine.py's own docstring for why redemption isn't gated behind
// admin approval), and a short recent-redemptions history. Admins get a
// lightweight "Manage catalog" toggle to add/remove reward items and
// adjust a balance directly (the "reward override" action from the spec).
const PALETTE = ["#a9c6c2", "#dba99c", "#d9bf7e", "#a8bd93", "#b9a7c9", "#cf8f6c", "#a89a83"];

// A small, self-contained emoji grid (no external picker library, per the
// household's own "Emoji picker" choice) for the reward catalog's optional
// icon field (reward_engine.py's plain-emoji-string `icon`, same shape the
// catalog item already had - see _catalogItemHtml's `item.icon || gift`
// fallback below). Deliberately reward/treat-flavored rather than a general
// emoji keyboard, matching what this catalog is actually for.
//
// v135+: grouped into named categories, each its own collapsed-by-default
// accordion section (see _iconPickerHtml/.m-icon-cat-toggle), rather than
// one long flat grid - a household reported the original ~18-choice flat
// grid felt cluttered even before this grew to ~70 choices across more
// categories. REWARD_ICON_CHOICES (the flattened list every category's
// emojis appended together) is kept as a derived constant purely so
// anything that still wants "just every choice" doesn't need its own
// flattening logic.
const REWARD_ICON_CATEGORIES = [
  { label: "Treats & Food", emojis: ["🍦", "🍩", "🍿", "🧁", "🍕", "🍪", "🍔", "🍟", "🧃", "🍫", "🍉", "🍎", "🥤", "🍰"] },
  { label: "Screens & Games", emojis: ["🎮", "🎬", "📱", "🎧", "💻", "📺", "🕹️", "🎵", "🎲", "🧩"] },
  { label: "Toys & Fun Stuff", emojis: ["🧸", "🎁", "🎨", "🚲", "🎫", "🛏️", "👟", "🎒", "🪁", "🖍️"] },
  { label: "Outings & Activities", emojis: ["🎪", "🏊", "🎳", "🎡", "🏕️", "🎣", "⚽", "🏀", "🎿", "🛹", "🎤"] },
  { label: "Money & Prizes", emojis: ["💵", "💰", "🏦", "💳", "🎟️"] },
  { label: "Achievement & Fun", emojis: ["⭐", "🏆", "🥇", "🎉", "👑", "💎", "🎯", "🚀"] },
];
const REWARD_ICON_CHOICES = REWARD_ICON_CATEGORIES.reduce((all, cat) => all.concat(cat.emojis), []);
// v134+: mirrors const.py's GOAL_STATUS_* (same duplicated-across-
// independently-loaded-files convention as everything else on this line) -
// powers the optional Goals section (see _goalsSectionEnabled).
const GOAL_STATUS_OPEN = "open";
const GOAL_STATUS_PENDING_VERIFICATION = "pending_verification";
const GOAL_STATUS_APPROVED = "approved";
// v144.15+: mirrors const.py's GOAL_STATUS_ARCHIVED - see
// family-hub-goals-card.js's own comment on this same constant for the
// full "Complete" button reasoning; here it's just used to hide an
// archived goal from this card's embedded Goals section entirely.
const GOAL_STATUS_ARCHIVED = "archived";

// Shared, dashboard-wide FAB coordinator - "when a user has more than one
// card on the same screen, the FAB buttons overlap, what is the solution?
// Can we detect and combine them? If they have the same tabs can we make
// them not duplicate?" Every Family Hub card with a floating "+" button
// (Calendar's Add Event, Chores, Rewards, Goals, To-Do) independently
// fixed-positions it at the same bottom-right spot, so two or more of
// these cards on one dashboard view (Chores+Rewards+Goals together is
// explicitly supported - see goalsShowInChores/goalsShowInRewards) stack
// their FABs directly on top of each other.
//
// Same shared-singleton shape as window.__familyHubScreenSaver just above
// (copy-pasted identically into every FAB-bearing card file, since these
// are independently-loaded Lovelace resources rather than ES modules that
// could import one shared file) - only the FIRST card whose script
// actually runs this block sets it up; every other card's identical copy
// just sees the flag already set and no-ops. Cards register on connect
// and unregister on disconnect, exactly mirroring registerClient/
// unregisterClient/_registerScreenSaver below, so a dashboard-edit that
// adds/removes a card (or switching HA tabs, which disconnects/reconnects
// every card on the old one) never leaves a stale slot reserved for a
// card that's gone, or fails to reserve one for a card that's arrived.
//
// DESIGN CHOICE - stack, don't merge. A single mega-FAB trying to stand in
// for "add a chore OR an event OR a reward" would hide which action does
// what behind an extra tap, for buttons that already open very different
// modals. Instead, each FAB stays itself but the coordinator assigns it a
// distinct vertical slot (via a --fh-fab-offset CSS custom property set on
// the card's own HOST element, which cascades into its shadow DOM the same
// way any inherited custom property does - no direct DOM/element handle
// needed, so this survives the card's own _render() rebuilding its shadow
// DOM on every data refresh without having to be re-applied each time),
// stacked in a fixed, deterministic order (FAB_KIND_ORDER below) so the
// same household always sees Calendar/Chores/Rewards/Goals/To-Do FABs in
// the same relative stack position regardless of which card's script
// happened to load or register first.
//
// DESIGN CHOICE - Goals tab de-duplication. Goals can appear on-screen
// from up to three sources at once: the standalone Goals card's own "+"
// FAB, AND a "Goal" tab on the Chores FAB (when goalsShowInChores is on),
// AND a "Goal" tab on the Rewards FAB (when goalsShowInRewards is on) -
// the same underlying add-a-goal action reachable three different ways.
// Rather than teaching the Chores/Rewards creation modals to strip their
// own Goal tab (which would mean each of those two files reaching across
// to know about the OTHER two, and about the standalone Goals card too -
// a combinatorial mess for marginal benefit, since a Goal tab embedded in
// a board the household is already looking at is not really "duplicate
// UI" so much as "the same action, conveniently placed"), only the
// LOWEST-RISK, clearest case is handled: when the coordinator sees ANY
// other registered card is already offering a Goal tab, the standalone
// Goals card suppresses its own add-goal-fab entirely (nothing left to
// add there that isn't one tap away already) - see registerClient's
// `meta.providesGoalTab` and the onLayout callback's `otherProvidesGoalTab`
// below, and family-hub-goals-card.js's own _applyFabCoordinatorState.
// Chores' and Rewards' own Goal tabs are left alone in both directions -
// a household running Chores+Rewards with both goals toggles on still
// sees a Goal tab on each, which is judged acceptable (accomplishing the
// same underlying thing twice from two boards you're already looking at
// is harmless, unlike a whole redundant floating button).
if (!window.__familyHubFabCoordinator) {
  window.__familyHubFabCoordinator = (function () {
    // Deterministic stacking order - unrecognized/future kinds sort last,
    // after everything named here, rather than crashing or colliding.
    const FAB_KIND_ORDER = ["calendar", "chores", "rewards", "goals", "todo"];
    // 56px button + 10px breathing room between stacked FABs.
    const SLOT_HEIGHT_PX = 66;
    const entries = new Map(); // client -> { kind, seq, meta, onUpdate }
    let seq = 0;

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
      // v1.110.7+: entries with takesSlot:false (a fab_position: "card"
      // client - see registerClient's own doc below) are skipped when
      // handing out stacking slots/offsets, but still walked here so they
      // still see otherProvidesGoalTab and still get an onUpdate call.
      const slotCount = list.filter(([, entry]) => entry.takesSlot).length;
      let slotIndex = 0;
      list.forEach(([client, entry]) => {
        const otherProvidesGoalTab = list.some(
          ([otherClient, otherEntry]) => otherClient !== client && otherEntry.meta && otherEntry.meta.providesGoalTab
        );
        const index = entry.takesSlot ? slotIndex++ : null;
        if (typeof entry.onUpdate === "function") {
          entry.onUpdate({ offsetPx: (index || 0) * SLOT_HEIGHT_PX, slotIndex: index, count: slotCount, otherProvidesGoalTab });
        }
      });
    }
    return {
      // `kind` is one of FAB_KIND_ORDER's entries (or anything else, which
      // just sorts last). `meta` is a plain object of extra facts other
      // cards' layout decisions might care about - today only
      // `providesGoalTab` (see this block's own docstring above). `onUpdate`
      // is called once immediately (so a lone card on an otherwise-empty
      // dashboard still gets offsetPx: 0) and again on every subsequent
      // register/unregister/updateClientMeta from ANY card, since adding a
      // second FAB changes where the first one's slot is too.
      //
      // v1.110.7+: `opts.takesSlot` (default true) - pass `{ takesSlot:
      // false }` for a card whose FAB has opted out of the shared
      // viewport-corner stack (fab_position: "card" - anchored to its own
      // card's box instead, see each card's own _registerFabCoordinator).
      // It's still a full member of the coordinator (still contributes/
      // reads `meta.providesGoalTab`, so goal-tab de-duplication keeps
      // working across a mixed dashboard/card-positioned set of FABs), it
      // just never occupies - or shifts - a stacking slot, since a
      // shared viewport-corner offset is meaningless once a FAB is
      // positioned relative to its own card instead.
      registerClient(client, kind, meta, onUpdate, opts) {
        const takesSlot = !(opts && opts.takesSlot === false);
        entries.set(client, { kind, seq: seq++, meta: meta || {}, onUpdate, takesSlot });
        recompute();
      },
      // Call whenever a fact in `meta` changes at runtime (e.g. the
      // household flips goalsShowInChores in Settings without reloading
      // the dashboard) - see chores/rewards cards' _fetchSettings.
      updateClientMeta(client, meta) {
        const entry = entries.get(client);
        if (!entry) return;
        entry.meta = Object.assign({}, entry.meta, meta || {});
        recompute();
      },
      // Call from disconnectedCallback. Frees this card's slot so every
      // remaining card's FAB shifts back down to close the gap, and (for
      // Goals) re-checks whether it's still safe to suppress its own FAB.
      unregisterClient(client) {
        if (entries.delete(client)) recompute();
      },
    };
  })();
}

// v1.110.7: one-tap common amounts for the Manage Stars modal, same idea
// as family-hub-active-timers-card.js's TIMER_PRESETS.
const MANAGE_STARS_PRESETS = [1, 5, 10];

// Shared, dashboard-wide kiosk PIN login session - the same "independently-
// loaded Lovelace card files have no built-in way to know about each
// other" problem the screensaver/FAB-stacking singletons above already
// solve, and the same fix: exactly one window-scoped singleton, copy-
// pasted identically into every kiosk-login-bearing card file (today:
// only Chores and Rewards have a Login button at all - Goals/My Chores/
// To-Do/Active Timers have no kiosk elevation UI of their own), guarded so
// only the first copy to actually load sets anything up.
//
// v1.110.8: fixes "Chores and rewards have a login button, logging into
// one logs into both. It should." Before this, `this._kioskElevation` was
// a plain instance field private to each card - logging in via Chores'
// own button had no way to reach Rewards' separate instance (or vice
// versa), so the same household member had to log in twice, once per
// card, and each card's own independent 45-second idle timer only reset
// on activity within THAT card's own root, so being actively tapping one
// card could still let the other silently time out first.
//
// This singleton now holds the ONE shared elevation (or null) and the ONE
// shared 45-second idle timer, and every registered card mirrors it onto
// its own `this._kioskElevation` via registerClient's onUpdate callback -
// so _isAdmin/_myUserId/_hasPermission/_kioskMsg (see each card's own copy
// of those methods) keep reading `this._kioskElevation` exactly as
// before, they just now always reflect the ONE shared login regardless of
// which card's button was actually clicked. The elevation
// verify/deelevate ws calls, the returned shape ({token, user_id, name,
// is_admin, permissions, expires_in}), and the 45-second inactivity
// window are all UNCHANGED from the pre-v1.110.8 per-card implementation -
// only where the state and the timer live moved, not how elevation itself
// works or what it grants.
//
// PERSISTENCE DECISION: deliberately in-memory only (a plain closure
// variable below, no sessionStorage/localStorage). A page reload already
// logged out a single-card kiosk session before this change -
// `this._kioskElevation` was never written anywhere but that one JS
// instance's own field, so refreshing the page always started fresh.
// Sharing the state across cards on the SAME already-loaded page is a
// different thing entirely from persisting it ACROSS a reload, and
// nobody asked for the latter - so this keeps "resets on reload" exactly
// as it always was, just now also "shared while the page stays loaded".
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
    // Activity anywhere on the dashboard resets the ONE shared idle clock -
    // bound at the document level (not a per-card root) precisely BECAUSE
    // this is now a shared session: tapping around on Rewards should keep
    // Chores' own elevated session alive too, not just its own. Standard
    // UI events like these already cross a shadow root boundary
    // (composed: true by default), so a single document-level listener
    // sees activity inside every card's shadow DOM without each card
    // needing its own copy. Bound once, the first time anyone ever logs
    // in - never torn down (harmless no-op the rest of the time; simpler
    // than re-binding/unbinding across every register/unregister).
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
      // Best-effort, same as the old per-card _kioskLogout - even offline,
      // the token's own KIOSK_ELEVATION_TTL_SECONDS backstop on the
      // backend still expires it; every card's own UI has already logged
      // out locally either way via the broadcast above. `hass` is
      // whichever registered card happened to trigger this (the one the
      // Log-out button was clicked on, or - for an idle timeout - null,
      // since no particular card "owns" that; the backend TTL is the
      // real backstop for that path exactly as it always was).
      if (prev && hass) {
        try {
          await hass.connection.sendMessagePromise({ type: "family_hub/kiosk/deelevate", token: prev.token });
        } catch (e) {
          /* best-effort */
        }
      }
    }
    return {
      // onUpdate is called once immediately on registration (so a card
      // that mounts AFTER someone already logged in on another card
      // immediately reflects that, not just future changes), and again on
      // every subsequent login/logout from ANY registered card.
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
      // Called from whichever card's own login modal submitted the PIN -
      // same family_hub/kiosk/elevate round trip and returned shape as
      // the old per-card _submitKioskLogin, just stored/broadcast here
      // instead of assigned onto a single instance field.
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
      // Test-only introspection - whether the shared idle timer is
      // currently armed, without exposing the raw timer handle (which,
      // unlike a single card's own `this._kioskIdleTimer` field before
      // this change, no longer belongs to any one card instance).
      _debugIdleTimerArmed() {
        return !!idleTimer;
      },
    };
  })();
}

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
    // and it sounds identical on every install. Repeated on an interval
    // (not one long tone) so it reads as an alarm rather than a single
    // chime, and so a tab that's autoplay-blocked the very first beep
    // (some browsers require a prior user gesture) gets another chance
    // shortly after - the very next tap ANYWHERE on the page (including
    // Stop itself) unblocks it going forward for the rest of this tab's
    // life, same as any other Web Audio use.
    function beepOnce() {
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === "suspended") audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "square";
        osc.frequency.value = 880;
        gain.gain.value = 0.0001;
        gain.gain.exponentialRampToValueAtTime(0.28, audioCtx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.32);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.34);
      } catch (e) {
        // Autoplay blocked, or no Web Audio at all - the modal is still
        // the primary alarm; sound is a bonus on top of it, not required.
      }
    }
    function stop() {
      if (activeUid) dismissedUids.add(activeUid);
      activeUid = null;
      if (beepHandle) {
        clearInterval(beepHandle);
        beepHandle = null;
      }
      if (modalEl) modalEl.style.display = "none";
    }
    function start(timer) {
      if (activeUid === timer.uid) return;
      activeUid = timer.uid;
      const el = ensureModal();
      el.querySelector(".fh-timer-alarm-title").textContent = timer.title || "Timer";
      el.style.display = "flex";
      beepOnce();
      if (beepHandle) clearInterval(beepHandle);
      beepHandle = setInterval(beepOnce, 1200);
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
      check(timers, clientId, remainingSecondsFn) {
        if (!clientId) return;
        const mine = (timers || []).find((t) => t.alarm && t.origin_client_id && t.origin_client_id === clientId);
        if (!mine || dismissedUids.has(mine.uid)) return;
        if (remainingSecondsFn(mine) <= 0) start(mine);
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

class FamilyHubRewardsCard extends HTMLElement {
  static getStubConfig() {
    return { title: "Rewards" };
  }
  // v1.111.0+: switched to getConfigElement (a real custom element) so the
  // Theme picker below can list live Theme Builder + native HA themes -
  // see family-hub-goals-card.js's identical comment for the full reasoning.
  static getConfigElement() {
    return document.createElement("family-hub-rewards-card-editor");
  }
  // v1.110.7+: see family-hub-chores-card.js's identical setConfig/
  // _registerFabCoordinator comment for the full "dashboard" vs "card"
  // design note - same option, same mechanism, on every FAB-bearing card.
  setConfig(config) {
    this._config = {
      title: (config && config.title) || "Rewards",
      fab_position: config && config.fab_position === "card" ? "card" : "dashboard",
      theme_override: (config && typeof config.theme_override === "string") ? config.theme_override : "",
    };
    this._registerFabCoordinator();
    if (this._settingsCache === undefined) this._settingsCache = null;
    if (this._globalThemes === undefined) this._globalThemes = [];
    if (this._users === undefined) this._users = [];
    if (this._balances === undefined) this._balances = {};
    if (this._catalog === undefined) this._catalog = [];
    if (this._redemptions === undefined) this._redemptions = [];
    // v127+: pending reward suggestions from someone without pricing
    // authority - see reward_engine.py's own module docstring and
    // const.py's PERMISSION_REWARD_ADD.
    if (this._suggestions === undefined) this._suggestions = [];
    // v128+: {user_id: {item_id: amount}} for "banked" redeem_mode rewards
    // (see const.py's REWARD_REDEEM_MODES docstring), and the spend-side
    // history for those banks - reward_engine.list_bank_usages, parallel
    // to _redemptions above but for spending FROM a bank rather than
    // earning INTO one.
    if (this._banks === undefined) this._banks = {};
    if (this._bankUsages === undefined) this._bankUsages = [];
    // On-demand per-user star history (family_hub/rewards/get_ledger) -
    // only fetched when the Star History modal is actually opened (see
    // _openHistoryModal), not on every poll like everything else above.
    if (this._historyLedger === undefined) this._historyLedger = [];
    if (this._myPermissions === undefined) this._myPermissions = {};
    if (this._manageOpen === undefined) this._manageOpen = false;
    // v134+: Goals, optionally embedded on the Rewards page (see
    // _goalsInRewardsEnabled/_fetchGoals) - only ever fetched/rendered when
    // the household's own goalsShowInRewards Settings toggle is on.
    if (this._goals === undefined) this._goals = [];
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
    await Promise.all([this._fetchSettings(), this._fetchUsers(), this._fetchRewardsState(), this._fetchMyPermissions()]);
    await this._fetchTimers();
    this._startTimerTicker();
    // v1.111.0+: always fetch (not just when useGlobalTheme is on) so a
    // per-card theme_override can resolve even when the household hasn't
    // turned on Global Theme - same change as every other themed card.
    await this._fetchGlobalThemes();
    if (this._goalsInRewardsEnabled()) await this._fetchGoals();
    // v144+ task #29: who (if anyone) can kiosk-PIN-login on this card -
    // decides whether the Login button even shows at all (see
    // _updateKioskLoginUi). Awaited, same as every other first-load fetch
    // here - _fetchKioskLoginUsers already fails soft (an empty list) on
    // any error, so this never blocks a household that's never touched the
    // feature for more than one quick round trip.
    await this._fetchKioskLoginUsers();
    this._updateKioskLoginUi();
    this._startPolling();
    this._registerScreenSaver();
    this._registerFabCoordinator();
    this._registerKioskSession();
    this._render();
  }
  // v1.110.8+: joins the shared kiosk-login session (see
  // family-hub-chores-card.js's identical _registerKioskSession/singleton
  // for the full design note - fixes "logging into one logs into both").
  _registerKioskSession() {
    if (window.__familyHubKioskSession) window.__familyHubKioskSession.registerClient(this, (elevation) => this._onKioskElevationChanged(elevation));
  }
  // Joins the shared, dashboard-wide screensaver controller rather than
  // standing up its own overlay/idle-timer/camera-poll - safe to call more
  // than once per card instance (a plain JS Set under the hood), which is
  // why this runs from both here and connectedCallback below with no extra
  // guard flag needed.
  _registerScreenSaver() {
    if (window.__familyHubScreenSaver && this._hass) window.__familyHubScreenSaver.registerClient(this, this._hass);
  }
  // v1.110.4+: joins the shared FAB-stacking coordinator - see
  // family-hub-chores-card.js's identical _registerFabCoordinator for the
  // full design note.
  _registerFabCoordinator() {
    // v1.110.7+: fab_position "card" registers with takesSlot:false - see
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
      },
      { takesSlot: !cardRelative }
    );
  }
  // v144.9+: the actual poll-refresh body, pulled out of _startPolling's
  // setInterval callback so connectedCallback (below) can also fire it
  // IMMEDIATELY on reconnect - rather than only via _startPolling(), whose
  // setInterval doesn't invoke its callback until the first tick 20s
  // later. Switching between HA dashboard views/tabs disconnects this
  // custom element from the DOM (disconnectedCallback) and reconnects it
  // when you switch back (connectedCallback) - "reload when you click
  // their tab" - so this makes that switch itself the trigger, with the
  // existing 20s interval remaining as the fallback the rest of the time.
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
        // Guard against a disconnect+reconnect happening again while THIS
        // SAME first-load promise is still pending (a masonry/grid
        // dashboard view re-parenting card elements while it lays itself
        // out can do this - see test_initial_load_race.js's own docstring
        // for the calendar card's version of this exact race) - without
        // this flag, each reconnect during that window would stack
        // another .then() and fire _pollTick() an extra time once the
        // promise finally resolves, duplicating the very first fetch.
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
  }
  getCardSize() {
    return 6;
  }
  getGridOptions() {
    return { columns: 8, min_columns: 6, max_columns: 12, min_rows: 6 };
  }
  // v144+ task #29: while a kiosk PIN elevation is active (this._kioskElevation -
  // v1.110.8+: a local mirror of window.__familyHubKioskSession's shared
  // state, kept in sync via _onKioskElevationChanged, see that singleton's
  // own docstring above), _isAdmin/_myUserId/_hasPermission all answer AS
  // that elevated household member instead of the real (usually shared,
  // unprivileged) kiosk HA login - same elevation-aware trio as family-hub-
  // chores-card.js's own copy (copy-pasted, not shared - independently-
  // loaded Lovelace resources, same convention as every other cross-file
  // duplication in this project). Almost everything on this card (which
  // balance is "mine", whose bank an item's "Use" button spends from, which
  // action buttons show) already keys off these three methods, so making
  // just these elevation-aware is enough to make the whole card behave as
  // if that person is genuinely logged in. The server calls this card makes
  // for a kiosk-elevatable action still separately carry elevation_token
  // (see _kioskMsg) - the real permission decision is always re-checked
  // there, this is only about what the UI shows.
  _isAdmin() {
    if (this._kioskElevation) return !!this._kioskElevation.is_admin;
    return !!(this._hass && this._hass.user && this._hass.user.is_admin);
  }
  _myUserId() {
    if (this._kioskElevation) return this._kioskElevation.user_id;
    return this._hass && this._hass.user ? this._hass.user.id : null;
  }
  // v127+: family_hub/permissions/get_mine is open to any authenticated
  // household member (unlike the admin-only family_hub/permissions/get the
  // calendar card's own Permissions tab uses) and returns only the
  // CALLER's own resolved grants - see chores_websocket_api.py's
  // ws_get_my_permissions and family-hub-chores-card.js's own identical
  // _fetchMyPermissions/_hasPermission pair, copied here rather than
  // shared (these are independently-loaded Lovelace resources, not ES
  // modules - same reasoning as every other cross-file duplication in this
  // project).

  // --- Timers (v1.110.0+) -----------------------------------------------------
  // "2 hours of gaming, when you click use reward a timer would start and
  // then a timer would go off at the end of the 2 hours. Or if you have a
  // chore thats like clean for 30 minutes..."
  //
  // Division of labour, and it matters: the BACKEND owns whether a timer is
  // done (a dedicated sweep every TIMER_SWEEP_SECONDS - see
  // _expire_due_timers in chores_websocket_api.py), so a timer still fires
  // with every dashboard closed and the tablet asleep. This card only owns
  // what the countdown LOOKS like, computed locally from started_at +
  // duration_minutes on a 1s ticker so the number ticks smoothly instead of
  // lurching once per poll.
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
  // Repaints just the countdown text in place, every second, without a full
  // re-render - a whole board re-render per second would fight scrolling,
  // drag-and-drop and any open modal. Elements opt in by carrying
  // data-timer-uid; everything else on the card is left completely alone.
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
  // Mirrors timer_engine.remaining_seconds exactly - derived, never a
  // stored counter, which is why a page reload (or a Home Assistant
  // restart) resumes at the right number instead of starting over.
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
    // Hours only appear once there actually are some - "1:05:00" for a
    // two-hour reward, but a plain "29:41" for a 30-minute chore rather
    // than a permanently-zero leading "0:".
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
    // v1.119.0+: kiosk-side sound+modal alarm for whichever ONE running
    // timer this exact browser tab started, if it opted into alarm-style
    // delivery - see window.__familyHubTimerAlarm's own top comment.
    // Deliberately every tick (not just on the local zero-crossing) so a
    // tab that was reloaded/backgrounded right as a timer finished still
    // catches up and alarms once its poll comes back with remaining<=0.
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
    // The moment a countdown visibly hits zero, ask the backend what
    // actually happened rather than guessing - it is the one that decides
    // whether the chore went to approval or paid out. Guarded so this
    // fires once per expiry, not once a second afterwards.
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
      // The realistic failures are "you've already got one running" and
      // "not enough stars" - both worth saying out loud rather than having
      // the button appear to do nothing.
      window.alert((e && e.message) || "Couldn't start that reward.");
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
  // v144+ task #29: kiosk PIN login. this._kioskElevation is null when
  // nobody's elevated, else {token, user_id, name, is_admin, permissions,
  // expires_in} - exactly what family_hub/kiosk/elevate returns. Every
  // server call this card makes for an action a kiosk login should be able
  // to do (claim/add a reward, approve/reject a suggestion, approve/reject
  // a goal) is wrapped through _kioskMsg so the backend can re-derive and
  // re-check the REAL permission itself - this card's own _isAdmin/
  // _myUserId/_hasPermission overrides above only ever control what the UI
  // shows, never what the server allows.
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
      btn.textContent = `\u{1F464} ${this._kioskElevation.name} · Log out`;
      btn.classList.add("active");
      btn.title = "Tap to log out of this kiosk session";
    } else {
      btn.textContent = "\u{1F512} Login";
      btn.classList.remove("active");
      btn.title = "Log in as a specific household member on this kiosk display";
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
        empty.textContent = "No one is set up for kiosk login yet - an admin can enable it under Settings > Users.";
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
      if (errEl) errEl.textContent = "Pick who's logging in first.";
      return;
    }
    if (!pin) {
      if (errEl) errEl.textContent = "Enter a PIN.";
      return;
    }
    try {
      // v1.110.8+: the actual elevate round trip and the shared elevation
      // state now live in window.__familyHubKioskSession (see
      // family-hub-chores-card.js's identical comment for the full design
      // note) - login() stores the result and broadcasts it to every
      // registered card (this one included), which is what actually
      // updates this._kioskElevation/_updateKioskLoginUi/_render via
      // _onKioskElevationChanged below. This just has to close the modal
      // on success; the singleton's own broadcast handles the rest.
      await window.__familyHubKioskSession.login(this._hass, userId, pin);
      this._closeKioskLoginModal();
    } catch (e) {
      if (errEl) errEl.textContent = (e && e.message) || "Incorrect PIN.";
      if (pinEl) {
        pinEl.value = "";
        pinEl.focus();
      }
    }
  }
  // v1.110.8+: called whenever window.__familyHubKioskSession's shared
  // elevation changes - from THIS card's own login/logout, or from
  // another kiosk-login-bearing card's - see family-hub-chores-card.js's
  // identical method for the full design note.
  _onKioskElevationChanged(elevation) {
    this._kioskElevation = elevation;
    if (!this._root) return;
    this._updateKioskLoginUi();
    // Everything on the card (whose balance is "mine", which action
    // buttons show) is derived from _myUserId/_hasPermission, both now
    // elevation-aware - re-rendering is what actually makes the card
    // reflect whoever is (or isn't) logged in.
    this._render();
  }
  // v1.110.8+: the 45-second inactivity timer and its document-wide
  // activity listeners now live entirely in window.__familyHubKioskSession
  // - see family-hub-chores-card.js's identical comment for why. Kept as
  // a thin instance method purely so the Login button's click handler and
  // existing call sites don't need to know that moved.
  async _kioskLogout() {
    if (window.__familyHubKioskSession) await window.__familyHubKioskSession.logout(this._hass);
  }
  // Whoever can add straight to the catalog with a price (and so is also
  // the audience for approving/rejecting someone else's suggestion) -
  // reward-override's broader authority already implies this narrower
  // one, mirroring chores_websocket_api.py's own _can_add_rewards exactly
  // (this is purely a UI-gating mirror of that server-side check, which
  // independently re-verifies on every add_catalog_item/approve_suggestion/
  // reject_suggestion call regardless of what this returns).
  _canAddRewardsDirectly() {
    return this._hasPermission("can_override_rewards") || this._hasPermission("can_add_rewards");
  }
  // v134+: the same PERMISSION_VERIFY tier family-hub-goals-card.js's own
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
  // v134+: goalsShowInRewards, same household-wide Settings-toggle shape as
  // family-hub-chores-card.js's own _goalsInChoresEnabled (see const.py's
  // SETTINGS_KEY_GOALS_IN_REWARDS) - set from the calendar card's Settings
  // -> General tab, off by default.
  _goalsInRewardsEnabled() {
    return !!(this._settingsCache && this._settingsCache.goalsShowInRewards);
  }
  // Shares the exact same family_hub/goals/list command the standalone
  // family-hub-goals-card.js and the Chores card's own embedded block poll,
  // so all three stay in sync with each other.
  async _fetchGoals() {
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/goals/list" });
      this._goals = (result && Array.isArray(result.goals)) ? result.goals : [];
    } catch (e) {
      /* keep whatever we had */
    }
    this._render();
  }
  async _logGoalProgress(id) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/goals/log_progress", goal_id: id });
      await this._fetchGoals();
    } catch (e) {
      /* no-op */
    }
  }
  async _approveGoal(id) {
    try {
      await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/goals/approve", goal_id: id }));
      await this._fetchGoals();
    } catch (e) {
      /* no-op */
    }
  }
  // v144.15+: was a window.prompt() (couldn't tell "Cancel the whole
  // action" from "send with an empty reason" - Cancel/Esc on a native
  // prompt still rejected with a blank reason) - converted to a real modal,
  // same .reject-modal/.cancel-btn/.save-btn/.modal-actions/.form-error
  // convention family-hub-chores-card.js's own _openRejectModal/
  // _submitReject and family-hub-goals-card.js's own reject modal already
  // use, just goal-only here (this card never rejects a chore).
  _openRejectModal(id) {
    const goal = this._goals.find((g) => g.id === id);
    if (!goal) return;
    const overlay = this._root.querySelector(".reject-modal");
    const box = overlay.querySelector(".modal-box");
    box.innerHTML = `
      <h3>Send back "${this._esc(goal.title)}"</h3>
      <label>Anything you want to tell them about why? (optional)<textarea class="f-reject-reason" rows="3" placeholder="Not quite - try again"></textarea></label>
      <div class="modal-actions">
        <button class="cancel-btn">Cancel</button>
        <button class="save-btn">Send back</button>
      </div>
      <div class="form-error"></div>
    `;
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
      /* no-op */
    }
    await this._fetchGoals();
  }
  // v144.15+: household report - achieved goals had no way to complete/
  // hide them here either (only the standalone Goals card got this in
  // v144.13, then family-hub-chores-card.js's own embedded block in
  // v144.15) - same family_hub/goals/archive ws command + no-reward-
  // side-effects contract as those. Re-fetching goals afterward drops the
  // now-archived goal out of _goalRowHtml's rendering (see the filter
  // added to wherever this card builds its goals list below).
  async _archiveGoal(id) {
    try {
      await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/goals/archive", goal_id: id }));
    } catch (e) {
      /* no-op */
    }
    await this._fetchGoals();
  }
  _goalRowHtml(goal) {
    const target = Math.max(1, goal.target_count || 1);
    const current = Math.min(target, goal.current_count || 0);
    const canLog = goal.status === GOAL_STATUS_OPEN && this._canLogGoalProgress(goal);
    const progressLabel = target > 1 ? `${current} / ${target} logged` : (current >= target ? "Done" : "Not yet done");
    let actions = "";
    if (canLog) actions += `<button type="button" class="goal-log-btn" data-id="${goal.id}">${target > 1 ? "Log progress" : "Mark done"}</button>`;
    if (goal.status === GOAL_STATUS_PENDING_VERIFICATION) {
      if (this._canVerify()) {
        actions += `<button type="button" class="goal-approve-btn" data-id="${goal.id}">Approve</button>`;
        actions += `<button type="button" class="goal-reject-btn" data-id="${goal.id}">Send back</button>`;
      } else actions += `<span class="suggestion-pending">Awaiting approval</span>`;
    } else if (goal.status === GOAL_STATUS_APPROVED) {
      actions += `<span class="suggestion-pending">&#10003; Achieved</span>`;
      if (goal.assigned_to === this._myUserId() || this._hasPermission("can_assign")) {
        actions += `<button type="button" class="goal-complete-btn" data-id="${goal.id}">Complete</button>`;
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
  // household-global branch below - factored out so the color-validation/
  // liquid-glass-fallback logic only needs to exist once in this file.
  _themeFromGlobalEntry(g) {
    const defaultTheme = this._defaultTheme();
    const colors = {};
    Object.keys(defaultTheme.colors).forEach((k) => {
      const v = g.colors && g.colors[k];
      colors[k] = typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : defaultTheme.colors[k];
    });
    // v144.5+: cardOpacity/glassBlur (the "liquid glass" look - see the
    // Liquid Glass/Liquid Glass Dark built-in presets) aren't part of
    // defaultTheme (a local/custom theme with neither set just means
    // "fully opaque, no blur"), so they're read straight off the global
    // theme rather than validated against a default-theme shape like
    // colors above - same fix family-week-calendar-card.js's own
    // _resolveTheme already applies for its own global-theme branch.
    const cardOpacity = typeof g.cardOpacity === "number" ? g.cardOpacity : 100;
    const glassBlur = typeof g.glassBlur === "number" ? g.glassBlur : 0;
    return { colors, cardOpacity, glassBlur };
  }
  _resolveTheme(settings) {
    const local = settings.theme || this._defaultTheme();
    // v1.111.0+: a per-card-placement Theme override (set from this card's
    // own native "Edit Card" dialog) wins over everything else, including
    // this device's own override and the household's Global Theme - same
    // "more specific wins" precedent the device override below already
    // established over the household setting.
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
    // v1.110.4+: keep the FAB coordinator's picture of "does this card
    // currently offer a Goal tab" in sync with a live Settings change -
    // see family-hub-chores-card.js's identical comment on its own copy.
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
  // Note: this card's own theme shape has no `fonts` concept - only
  // `colors`/`cardOpacity`/`glassBlur` are ever read via
  // _themeFromGlobalEntry, so these entries carry colors only.
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
      /* keep whatever we had */
    }
    this._render();
    // The Star History modal (if open) shows redemption/bank-usage rows
    // pulled from these same lists, filtered client-side - refresh it in
    // place on every poll tick too, same as the rest of the card, rather
    // than only updating when it's first opened.
    if (this._root.querySelector(".star-history-modal").classList.contains("open")) this._renderStarHistoryModal();
  }
  _userName(id) {
    const u = this._users.find((x) => x.id === id);
    return u ? u.name : id;
  }
  // A person's own custom color (settings.userProfiles[id].color, set on
  // the Users tab of the calendar card's Settings - see
  // _normalizeUserProfiles there) wins when they've set one; otherwise
  // falls back to the automatically assigned palette color, same as
  // before this existed. Same pattern as family-hub-chores-card.js's own
  // _userColor.
  _userColor(id) {
    const profiles = (this._settingsCache && this._settingsCache.userProfiles) || {};
    const custom = profiles[id] && profiles[id].color;
    if (custom) return custom;
    const idx = this._users.findIndex((x) => x.id === id);
    return idx >= 0 ? PALETTE[idx % PALETTE.length] : "#c9c2b3";
  }
  // memberUserIds lives on the Settings blob (see const.py's
  // SETTINGS_KEY_MEMBER_USER_IDS) - _fetchSettings already pulls the whole
  // blob in for theming, so it just rides along on this._settingsCache
  // rather than needing its own fetch. Same pattern as family-hub-
  // chores-card.js's _isFamilyHubMember/_memberUsers. Deliberately only
  // used to filter what's rendered in the balances grid below - _userName/
  // _userColor/_historyRowHtml still look a user up in the full
  // this._users list (not _memberUsers()) so a past redemption by someone
  // since removed from Family Hub still shows their real name in history,
  // matching the "removal only hides, never deletes" decision from the
  // membership feature.
  _isFamilyHubMember(userId) {
    const memberIds = (this._settingsCache && this._settingsCache.memberUserIds) || [];
    return memberIds.includes(userId);
  }
  // v121+: a second, narrower opt-out UNDER Family Hub membership - see
  // const.py's own "v121+" docstring right after SETTINGS_KEY_MEMBER_USER_IDS.
  // Same helper as family-hub-chores-card.js's own _isChoresIncluded -
  // a member with userProfiles[id].includeInChores explicitly false stays a
  // real Family Hub member (still shown on the Users/Permissions tabs) but
  // drops out of the balances grid below, same as the Chores board itself.
  _isChoresIncluded(userId) {
    if (!this._isFamilyHubMember(userId)) return false;
    const profiles = (this._settingsCache && this._settingsCache.userProfiles) || {};
    const profile = profiles[userId];
    return !profile || profile.includeInChores !== false;
  }
  _memberUsers() {
    return this._users.filter((u) => this._isChoresIncluded(u.id));
  }
  _esc(s) {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
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
          <div class="actions">
            <button class="manage-stars-btn" title="Manually add or subtract stars, with a reason - for bonuses, corrections, etc. outside chores/rewards/goals" hidden>&#11088; Manage stars</button>
            <button class="manage-btn" hidden>Manage catalog</button>
            <button class="kiosk-login-btn" title="Log in as a specific household member on this kiosk display" hidden>&#128274; Login</button>
          </div>
        </div>
        <div class="balances"></div>
        <div class="section-title">Reward catalog</div>
        <div class="catalog"></div>
        <div class="section-title goals-title" hidden>Goals</div>
        <div class="goals"></div>
        <div class="section-title suggestions-title" hidden>Suggested rewards</div>
        <div class="suggestions"></div>
        <div class="section-title pending-title" hidden>Pending rewards</div>
        <div class="pending"></div>
        <div class="section-title">Recent redemptions</div>
        <div class="history"></div>
      </ha-card>
      <div class="modal-overlay create-reward-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay star-history-modal"><div class="modal-box star-history-box"></div></div>
      <div class="modal-overlay gift-stars-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay manage-stars-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay reject-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay kiosk-login-overlay">
        <div class="modal-box kiosk-login-box">
          <button type="button" class="star-history-close-btn kiosk-login-close" title="Close">&#10005;</button>
          <h2>&#128274; Kiosk login</h2>
          <div class="kiosk-login-user-picker"></div>
          <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" class="kiosk-login-pin-input" placeholder="PIN" />
          <div class="kiosk-login-error"></div>
          <div class="modal-actions">
            <button class="cancel-btn kiosk-login-cancel">Cancel</button>
            <button class="save-btn kiosk-login-submit">Log in</button>
          </div>
        </div>
      </div>
      <button class="add-reward-fab" title="Add a reward" aria-haspopup="true">&#65291;</button>
    `;
    this._root = root;
    // A fixed round + button in the bottom-right corner, pixel-for-pixel
    // matching family-week-calendar-card.js's own add-event-fab and
    // family-hub-chores-card.js's own add-chore-fab - the household asked
    // for "the same" treatment here too. Unlike those two (gated to
    // whoever can create/assign), this one is open to EVERYONE: v127+,
    // anyone can tap it to add a reward - whether it lands straight in the
    // catalog or in the suggestions bin below depends on whether they can
    // price it (see _openCreateRewardModal/_canAddRewardsDirectly). Lives
    // as a *sibling* of <ha-card>, not nested inside it - a real household
    // report on the calendar card's own add-event-fab (see that file's
    // long comment on _ensureScreenSaverOverlay) found that <ha-card>
    // itself apparently establishes its own containing block for
    // position:fixed descendants regardless of this file's own overflow
    // rule on it, trapping anything fixed-positioned *inside* it to that
    // element's own box instead of the real viewport corner - a sibling
    // reliably escapes that, same proven fix reused here.
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
    // v1.110.5+: the manual stars-adjustment modal (task: "Need a stars
    // manage modal. Add, subtract, reasons for editing etc. follows
    // permissions.") - see _openManageStarsModal's own docstring.
    root.querySelector(".manage-stars-btn").addEventListener("click", () => this._openManageStarsModal());
    // v144+ task #29: kiosk PIN login - see _onKioskLoginBtnClick's own
    // docstring for the full picture.
    root.querySelector(".kiosk-login-btn").addEventListener("click", () => this._onKioskLoginBtnClick());
    root.querySelector(".kiosk-login-close").addEventListener("click", () => this._closeKioskLoginModal());
    root.querySelector(".kiosk-login-cancel").addEventListener("click", () => this._closeKioskLoginModal());
    root.querySelector(".kiosk-login-submit").addEventListener("click", () => this._submitKioskLogin());
    root.querySelector(".kiosk-login-pin-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._submitKioskLogin();
    });
    // v1.110.8+: the 45-second idle-reset activity listeners moved to
    // window.__familyHubKioskSession itself (document-level, shared) - see
    // family-hub-chores-card.js's identical comment. No per-card listener
    // needed here anymore.
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
    // v1.110.0+: a timed reward's Claim starts the countdown (and spends
    // the stars) in one backend call instead of just logging a redemption.
    if (claimBtn) {
      return Number(claimBtn.dataset.timer) > 0
        ? this._startRewardTimer(claimBtn.dataset.id)
        : this._claim(claimBtn.dataset.id);
    }
    const timerCancelBtn = e.target.closest(".catalog-timer-cancel-btn");
    if (timerCancelBtn) return this._cancelTimer(timerCancelBtn.dataset.uid);
    if (delBtn) return this._deleteItem(delBtn.dataset.id);
    // v129+: Edit an existing catalog item - opens the same Add-reward
    // modal pre-filled (see _openCreateRewardModal), only ever shown while
    // _manageOpen (admin-only, same gate the delete button already has).
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

    // v128+: click a person's name in the balances row to see their full
    // star history (chore stars earned/deducted, redemptions, bank
    // credits/spends - see _openStarHistoryModal). v1.110.7: for someone
    // who can_override_rewards, the name opens Manage Stars instead (see
    // _balanceCardHtml's own comment on why) - the backend re-checks the
    // permission independently either way.
    const balanceNameBtn = e.target.closest(".balance-name");
    if (balanceNameBtn) {
      if (this._hasPermission("can_override_rewards")) return this._openManageStarsModal(balanceNameBtn.dataset.user);
      return this._openStarHistoryModal(balanceNameBtn.dataset.user);
    }
    if (e.target.closest(".star-history-close-btn")) {
      this._root.querySelector(".star-history-modal").classList.remove("open");
      return;
    }

    // v128+: "Use" a banked reward - how much of the current balance to
    // spend right now (see _catalogItemHtml's own bank display). A plain
    // window.prompt, same lightweight single-value-input convention as
    // family-week-calendar-card.js's own template/shopping-list naming
    // prompts - this card had no precedent of its own, but building a
    // whole new modal for one number felt like overkill next to that.
    const useBankBtn = e.target.closest(".catalog-use-bank-btn");
    if (useBankBtn) return this._useBank(useBankBtn.dataset.id);

    // v128+: mark a pending (requires_fulfillment) redemption or bank use
    // as done - see _pendingRowHtml. Only rendered for someone who
    // _canAddRewardsDirectly, but the ws handlers re-check independently.
    const markRedemptionDoneBtn = e.target.closest(".pending-mark-done-btn[data-kind='redemption']");
    if (markRedemptionDoneBtn) return this._markFulfilled(markRedemptionDoneBtn.dataset.id);
    const markUsageDoneBtn = e.target.closest(".pending-mark-done-btn[data-kind='usage']");
    if (markUsageDoneBtn) return this._markBankUsageFulfilled(markUsageDoneBtn.dataset.id);

    // v127+: approve/reject a pending suggestion (see _suggestionRowHtml
    // below) - only rendered at all for someone who _canAddRewardsDirectly,
    // but the ws handlers re-check that independently regardless.
    const approveBtn = e.target.closest(".suggestion-approve-btn");
    if (approveBtn) {
      const row = approveBtn.closest(".suggestion-row");
      const costInput = row && row.querySelector(".suggestion-cost-input");
      const cost = parseInt(costInput && costInput.value, 10) || 0;
      return this._approveSuggestion(approveBtn.dataset.id, cost);
    }
    const rejectBtn = e.target.closest(".suggestion-reject-btn");
    if (rejectBtn) return this._rejectSuggestion(rejectBtn.dataset.id);

    // Icon picker for the "Add reward" form (now living in the
    // create-reward-modal - see _openCreateRewardModal) - a plain
    // toggle-button-plus-grid, same shape as any other popover in this
    // file, with no library
    // (matches the household's "Emoji picker" choice, scoped to a small
    // reward-flavored set rather than a full emoji keyboard).
    const iconToggle = e.target.closest(".m-icon-toggle");
    if (iconToggle) {
      const grid = iconToggle.parentElement.querySelector(".m-icon-grid");
      if (grid) grid.hidden = !grid.hidden;
      return;
    }
    // v135+: each emoji category collapses to its own accordion row (see
    // REWARD_ICON_CATEGORIES/the .m-icon-cat-toggle markup above) - the
    // flat ~18-choice grid this replaced felt cluttered even before more
    // categories/emojis were added on top of it. Same open/close-by-class
    // shape as the calendar card's own .accordion-toggle, just handled
    // here through this card's existing delegated click listener (the
    // picker's markup is rebuilt fresh every time the create/edit modal
    // opens, so there's no fixed DOM to wire a one-time listener onto).
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
    // Card color reset - same "Use default" convention as the user color
    // picker on the calendar card's Users tab (notify-profile-color-reset-btn):
    // clears the draft back to "" (meaning "use the default look") rather
    // than just resetting the swatch to whatever color it happens to show.
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
      if (statusEl) statusEl.textContent = "Not enough stars yet.";
    }
  }
  async _deleteItem(itemId) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/rewards/delete_catalog_item", item_id: itemId });
      await this._fetchRewardsState();
    } catch (e) {
      /* no-op */
    }
  }
  // v123+: "clear" a redemption history entry - removes it from the log,
  // balance untouched (see reward_engine.py's delete_redemption). For
  // tidying up the list itself (a duplicate entry, one already handled
  // another way) - contrast with _reverseRedemption below.
  async _deleteRedemption(redemptionId) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/rewards/delete_redemption", redemption_id: redemptionId });
      await this._fetchRewardsState();
    } catch (e) {
      /* no-op */
    }
  }
  // v123+: "reverse" a redemption - removes it AND refunds the stars back
  // to whoever claimed it (see reward_engine.py's reverse_redemption). For
  // undoing a mistaken claim entirely, not just tidying up the log.
  async _reverseRedemption(redemptionId) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/rewards/reverse_redemption", redemption_id: redemptionId });
      await this._fetchRewardsState();
    } catch (e) {
      /* no-op */
    }
  }
  // v127+: the + button's modal - same title/icon/color fields the old
  // inline "manage panel" add-form always had, but now shaped by whether
  // the caller _canAddRewardsDirectly: with that authority, a cost field
  // shows too and Add sends straight to the catalog exactly like before;
  // without it, there's no cost field at all (they have no authority to
  // set one) and the button submits a suggestion instead, landing in the
  // Suggested Rewards bin below for someone who does have that authority
  // to price and approve.
  //
  // v129+: this SAME modal doubles as the Edit form for an existing catalog
  // item - pass the item and every field pre-fills from it, the heading/
  // button read "Edit reward"/"Save", and _submitCreateReward routes to
  // update_catalog_item instead of add_catalog_item. Reachable only via
  // .manage-edit-btn, which only ever renders while _manageOpen - the same
  // admin-only gate "Manage catalog" itself already has - so canPrice
  // (_canAddRewardsDirectly) is always true here in practice; the modal
  // still computes it normally rather than assuming, so a future looser
  // Manage-catalog gate wouldn't silently show cost/mode fields to someone
  // without pricing authority.
  // v134+: whoever can create/assign a chore can also create a goal from
  // right here (same PERMISSION_ASSIGN tier the standalone Goals card and
  // family-hub-chores-card.js's own + button both gate on) - a UI-gating
  // mirror of what ws_create_goal already re-checks server-side.
  _canAssignGoals() {
    return this._hasPermission("can_assign");
  }
  _openCreateRewardModal(existingItem) {
    const overlay = this._root.querySelector(".create-reward-modal");
    const box = overlay.querySelector(".modal-box");
    const canPrice = this._canAddRewardsDirectly();
    const isEdit = !!existingItem;
    // The Goal tab only ever shows for a brand-new item (never while
    // editing an existing catalog reward - the two features aren't
    // related) and only for someone who _canAssignGoals - anyone without
    // that authority just sees the plain Reward form exactly as before,
    // same as this modal always worked pre-Goals.
    const showGoalTab = !isEdit && this._canAssignGoals();
    const memberUsersHtml = this._memberUsers().map((u) => `<option value="${u.id}">${this._esc(u.name)}</option>`).join("");
    box.innerHTML = `
      ${showGoalTab ? `
      <div class="modal-tabs">
        <button type="button" class="modal-tab active" data-tab="reward">Reward</button>
        <button type="button" class="modal-tab" data-tab="goal">Goal</button>
      </div>` : ""}
      <div class="tab-pane reward-pane">
      <h3>${isEdit ? "Edit reward" : canPrice ? "Add a reward" : "Suggest a reward"}</h3>
      ${!isEdit && !canPrice ? `<div class="m-hint">You can suggest a new reward, but only an admin (or someone granted reward-add/reward-override permission) can set its star cost - this'll wait in Suggested Rewards until they price and approve it.</div>` : ""}
      <label>Title<input type="text" class="m-title" placeholder="Movie night"></label>
      ${canPrice ? `<label>Cost (stars)<input type="number" class="m-cost" min="0" placeholder="5"></label>` : ""}
      ${
        canPrice
          ? `
      <label>What it's really worth (optional)<input type="text" class="m-value-note" placeholder="$20, or 2 hrs"></label>
      <label title="Optional - e.g. 120 for &quot;2 hours of gaming&quot;. Using this reward starts a countdown and sends a notification when it's up. One reward timer runs at a time per person.">Timer (optional - minutes)<input type="number" class="m-timer-minutes" min="1" max="1440" placeholder="Leave blank for no timer"></label>
      <label>How it works
        <select class="m-redeem-mode">
          <option value="instant">Redeem any time</option>
          <option value="banked">Stacks up (e.g. allowance, TV time)</option>
          <option value="one_time">One-time - disappears after use</option>
        </select>
      </label>
      <div class="m-banked-fields" hidden>
        <label>Adds this much per redemption
          <span class="m-stack-row"><input type="number" class="m-stack-amount" min="0" step="any" value="1"><input type="text" class="m-stack-label" placeholder="hours, $, etc."></span>
        </label>
      </div>
      <label class="m-checkbox-label"><input type="checkbox" class="m-requires-fulfillment"> Needs a parent to mark it done before it counts (e.g. cash allowance)</label>
      `
          : ""
      }
      <div class="m-icon-picker">
        <button type="button" class="m-icon-toggle" data-icon="" title="Pick an icon">&#127873;</button>
        <div class="m-icon-grid" hidden>
          ${REWARD_ICON_CATEGORIES.map(
            (cat, i) => `
          <div class="m-icon-category">
            <button type="button" class="m-icon-cat-toggle" data-cat-index="${i}">
              <span>${cat.label}</span>
              <span class="m-icon-cat-chevron">&#9660;</span>
            </button>
            <div class="m-icon-cat-body">
              ${cat.emojis.map((emoji) => `<button type="button" class="m-icon-choice" data-icon="${emoji}">${emoji}</button>`).join("")}
            </div>
          </div>`
          ).join("")}
          <button type="button" class="m-icon-clear">Use default icon &times;</button>
        </div>
      </div>
      <div class="m-color-row">
        <input type="color" class="m-color" value="#c9c2b3" data-touched="false" title="Card color">
        <button type="button" class="m-color-reset-btn">Use default</button>
      </div>
      </div>
      ${showGoalTab ? `
      <div class="tab-pane goal-pane" hidden>
        <label>Title<input type="text" class="g-title" placeholder="Get 3 Bs in math"></label>
        <label>For<select class="g-assigned">${memberUsersHtml}</select></label>
        <label>Target count (how many times to log before it's done)<input type="number" class="g-target" min="1" value="1"></label>
        ${this._goalRewardFieldsHtml(null)}
        <label>Due date (optional)<input type="datetime-local" class="g-due"></label>
        <label>Notes<textarea class="g-notes" rows="3" placeholder="Any details worth knowing"></textarea></label>
      </div>` : ""}
      <div class="modal-actions">
        <button class="cancel-btn">Cancel</button>
        <button class="save-btn">${isEdit ? "Save" : canPrice ? "Add" : "Submit for approval"}</button>
      </div>
      <div class="form-error"></div>
    `;
    if (showGoalTab) {
      this._wireGoalRewardFields(box);
      this._wireModalTabs(box, () => {
        box.querySelector(".save-btn").textContent = box.dataset.activeTab === "goal" ? "Create" : (isEdit ? "Save" : canPrice ? "Add" : "Submit for approval");
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
    // v129+: pre-fill every field from the item being edited. The icon/
    // color fields reuse the exact same "touched" mechanism Add already
    // has (see _submitCreateReward) rather than a separate edit-only code
    // path - pre-marking them touched here just means "this item's current
    // icon/color IS the intentional value," so leaving them alone on Save
    // keeps them, and changing them behaves exactly like Add's own picker.
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
  // Shared tab-row wiring (copy-pasted from family-hub-chores-card.js's own
  // identical _wireModalTabs - independently-loaded resources, not shared
  // code). onSwitch is an optional extra callback (used here to also
  // relabel the Save button per-tab, which the Chores card's own tab pair
  // doesn't need since both its tabs share the same "Create" label).
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
  // --- Goal reward fields (mirrors family-hub-goals-card.js's own
  // _rewardFieldsHtml/_wireRewardFields/_applyRewardFieldsToPayload exactly
  // - copy-pasted per this project's independently-loaded-card convention).
  // Unlike the Chores card's own copy of these three, this._catalog is
  // ALREADY loaded here (it's this card's own central data), so no lazy
  // on-demand fetch is needed for the reward-item picker. ---
  _goalRewardFieldsHtml(goal) {
    const g = goal || {};
    const rewardType = g.reward_type || "stars";
    const catalogOptions = this._catalog
      .map((it) => `<option value="${it.id}" ${g.reward_item_id === it.id ? "selected" : ""}>${this._esc(it.title)} (${it.cost_stars}&#11088;)</option>`)
      .join("");
    return `
      <label>Reward
        <select class="g-reward-type">
          <option value="stars" ${rewardType === "stars" ? "selected" : ""}>Stars</option>
          <option value="catalog_item" ${rewardType === "catalog_item" ? "selected" : ""}>A specific reward from the catalog</option>
        </select>
      </label>
      <label class="g-star-value-field">How many stars<input type="number" class="g-star-value" min="1" value="${g.star_value || 1}"></label>
      <label class="g-reward-item-field">Which reward<select class="g-reward-item">${catalogOptions}</select></label>
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
      errEl.textContent = "A goal needs a title.";
      return;
    }
    const assignedTo = box.querySelector(".g-assigned").value;
    if (!assignedTo) {
      errEl.textContent = "A goal needs someone it belongs to.";
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
      errEl.textContent = (e && e.message) || "Couldn't save this goal.";
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
      errEl.textContent = "A reward needs a title.";
      return;
    }
    const iconToggle = box.querySelector(".m-icon-toggle");
    const icon = (iconToggle && iconToggle.dataset.icon) || "";
    const colorInput = box.querySelector(".m-color");
    // Only send a color when it was actually touched - otherwise the
    // input's own browser-default value (e.g. #000000) would get sent as
    // if it were a deliberate choice. Same "untouched means no opinion"
    // idea as the icon picker defaulting to "" above - editing an item
    // that already has a color pre-marks the swatch touched (see
    // _openCreateRewardModal) so its current color counts as intentional
    // and round-trips unless actually changed.
    const color = colorInput && colorInput.dataset.touched === "true" ? colorInput.value : "";
    try {
      if (existingItem) {
        // v129+: Edit - always sends every field currently shown in the
        // form (not just changed ones) since update_catalog_item is a
        // partial update keyed by which fields are present at all; sending
        // the full form contents makes "what's in the modal" and "what
        // gets saved" the same thing, same as any ordinary edit form.
        const cost = parseInt(box.querySelector(".m-cost").value, 10) || 0;
        const valueNote = (box.querySelector(".m-value-note").value || "").trim();
        // v1.110.0+: null on blank, so clearing the box genuinely removes
        // the timer rather than leaving the old length in place.
        const timerMinutes = parseInt(box.querySelector(".m-timer-minutes").value, 10) || null;
        const redeemMode = box.querySelector(".m-redeem-mode").value || "instant";
        const requiresFulfillment = box.querySelector(".m-requires-fulfillment").checked;
        const payload = {
          type: "family_hub/rewards/update_catalog_item", item_id: existingItem.id, title, cost_stars: cost, icon, color,
          value_note: valueNote, redeem_mode: redeemMode, requires_fulfillment: requiresFulfillment,
          timer_minutes: timerMinutes,
        };
        if (redeemMode === "banked") {
          payload.stack_unit_amount = parseFloat(box.querySelector(".m-stack-amount").value) || 1;
          payload.stack_unit_label = (box.querySelector(".m-stack-label").value || "").trim();
        }
        await this._hass.connection.sendMessagePromise(payload);
      } else if (canPrice) {
        const cost = parseInt(box.querySelector(".m-cost").value, 10) || 0;
        const valueNote = (box.querySelector(".m-value-note").value || "").trim();
        // v1.110.0+: null on blank, so clearing the box genuinely removes
        // the timer rather than leaving the old length in place.
        const timerMinutes = parseInt(box.querySelector(".m-timer-minutes").value, 10) || null;
        const redeemMode = box.querySelector(".m-redeem-mode").value || "instant";
        const requiresFulfillment = box.querySelector(".m-requires-fulfillment").checked;
        const payload = {
          type: "family_hub/rewards/add_catalog_item", title, cost_stars: cost, icon, color,
          value_note: valueNote, redeem_mode: redeemMode, requires_fulfillment: requiresFulfillment,
          timer_minutes: timerMinutes,
        };
        if (redeemMode === "banked") {
          payload.stack_unit_amount = parseFloat(box.querySelector(".m-stack-amount").value) || 1;
          payload.stack_unit_label = (box.querySelector(".m-stack-label").value || "").trim();
        }
        // v1.132.9+: routed through _kioskMsg, same fix and same reason as
        // family-hub-todo-card.js's _openTieRewardModal - see
        // chores_websocket_api.py's ws_add_catalog_item for the server-side
        // half (this card's own add_catalog_item call had the identical gap:
        // no elevation_token meant a kiosk-elevated household member's own
        // permissions were never actually checked).
        await this._hass.connection.sendMessagePromise(this._kioskMsg(payload));
      } else {
        await this._hass.connection.sendMessagePromise({ type: "family_hub/rewards/add_suggestion", title, icon, color });
      }
      overlay.classList.remove("open");
      await this._fetchRewardsState();
    } catch (e) {
      errEl.textContent = (e && e.message) || "Couldn't save that - check the fields above.";
    }
  }
  async _approveSuggestion(suggestionId, costStars) {
    try {
      await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/rewards/approve_suggestion", suggestion_id: suggestionId, cost_stars: costStars }));
      await this._fetchRewardsState();
    } catch (e) {
      /* no-op */
    }
  }
  async _rejectSuggestion(suggestionId) {
    try {
      await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/rewards/reject_suggestion", suggestion_id: suggestionId }));
      await this._fetchRewardsState();
    } catch (e) {
      /* no-op */
    }
  }
  async _adjustBalance(userId, delta) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/rewards/adjust_balance", user_id: userId, delta });
      await this._fetchRewardsState();
    } catch (e) {
      /* no-op */
    }
  }
  // Task #31: give some of the viewer's OWN stars to another household
  // member - self-serve and instant, same "no admin approval needed" shape
  // _claim already has (see reward_engine.gift_stars' own docstring).
  // v144.7+: was a window.prompt() single-value input; converted to a
  // proper modal (matching every other Family Hub multi-field input, and
  // per the household's own request) since a bare browser prompt can't
  // show the recipient's name/current balance as anything but plain
  // interpolated text and has no room for a real validation message.
  // Routed through _kioskMsg so a kid elevated at a shared kiosk can gift
  // their own stars too (task #29's elevation-aware convention, same as
  // _claim).
  _openGiftStarsModal(toUserId, toName) {
    const overlay = this._root.querySelector(".gift-stars-modal");
    const box = overlay.querySelector(".modal-box");
    const myBalance = this._balances[this._myUserId()] || 0;
    box.innerHTML = `
      <h3>Gift stars to ${this._esc(toName || "them")}</h3>
      <div class="m-hint">You have ${myBalance} star${myBalance === 1 ? "" : "s"}.</div>
      <label>How many stars<input type="number" class="gift-amount-input" min="1" max="${myBalance}" placeholder="1"></label>
      <div class="form-error gift-stars-error" hidden></div>
      <div class="modal-actions">
        <button class="cancel-btn gift-stars-cancel-btn">Cancel</button>
        <button class="save-btn gift-stars-send-btn">Send gift</button>
      </div>
    `;
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
      errEl.textContent = "Enter how many stars to gift.";
      errEl.hidden = false;
      return;
    }
    try {
      await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/rewards/gift_stars", to_user_id: toUserId, amount }));
      await this._fetchRewardsState();
      this._closeGiftStarsModal();
    } catch (e) {
      errEl.textContent = (e && e.message) || "Couldn't send the gift - check the balance and try again.";
      errEl.hidden = false;
    }
  }
  // v1.110.5+: manual stars adjustment - "Need a stars manage modal. Add,
  // subtract, reasons for editing etc. follows permissions." Star balances
  // already change implicitly (chore/goal payouts, redemptions, overdue
  // penalties, the +/- quick buttons next to each balance) and every one
  // of those already goes through reward_engine.add_stars, which appends
  // an entry to the SAME per-person ledger the Star History modal reads
  // (family_hub/rewards/get_ledger) - there was already a backend command
  // for a bare "just move the balance" adjustment
  // (family_hub/rewards/adjust_balance, gated on PERMISSION_REWARD_
  // OVERRIDE) behind the quick +/- buttons, but nothing that also records
  // WHY, for the "grandma gave you 5 bonus stars" / "minus 3 for being
  // rude" case a family would want to look back on later. This modal is
  // that: pick a person (defaults to whoever's card/name was clicked, but
  // changeable - it's also reachable from the header for a general "manage
  // anyone's stars" entry point), a signed amount via separate Add/
  // Subtract buttons (matching this card's own Gift/Use-bank convention of
  // small purpose-built modals over one generic input) plus MANAGE_STARS_
  // PRESETS one-tap chips (same preset-row/preset-btn pattern as
  // family-hub-active-timers-card.js's quick-timer duration presets - tap
  // fills the amount box, typing a custom value still works exactly the
  // same way), and an OPTIONAL reason. v1.110.5 made the reason required;
  // the household asked for that friction removed in v1.110.7, so it's now
  // just a nice-to-have - reward_engine.add_stars already treats a missing
  // reason as "" and the history row (_starHistoryRows) already falls back
  // to a generic "Stars added"/"Stars deducted" label when reason is
  // blank, so nothing downstream needed to change to support this. Gated
  // entirely by _render()'s own manage-stars-btn.hidden check plus the
  // backend's own independent re-check in ws_adjust_balance - never trust
  // the button being hidden as the only gate.
  _openManageStarsModal(userId) {
    const overlay = this._root.querySelector(".manage-stars-modal");
    const box = overlay.querySelector(".modal-box");
    const members = this._memberUsers();
    const preselect = userId || (members[0] && members[0].id) || "";
    const presetBtns = MANAGE_STARS_PRESETS.map(
      (n) => `<button type="button" class="preset-btn manage-stars-preset-btn" data-amount="${n}">${n}</button>`
    ).join("");
    box.innerHTML = `
      <h3>Manage stars</h3>
      <label>Who
        <select class="manage-stars-user">
          ${members.map((u) => `<option value="${u.id}" ${u.id === preselect ? "selected" : ""}>${this._esc(u.name)} (${this._balances[u.id] || 0} &#11088;)</option>`).join("")}
        </select>
      </label>
      <button type="button" class="manage-stars-history-btn">&#128220; View star history</button>
      <div class="preset-row manage-stars-preset-row">${presetBtns}</div>
      <label>Or a custom amount<input type="number" class="manage-stars-amount" min="1" step="1" placeholder="e.g. 5"></label>
      <div class="manage-stars-sign-row">
        <button type="button" class="manage-stars-sign-btn manage-stars-add" data-sign="1">&#43; Add</button>
        <button type="button" class="manage-stars-sign-btn manage-stars-subtract" data-sign="-1">&#8722; Subtract</button>
      </div>
      <label>Reason (optional)<textarea class="manage-stars-reason" rows="2" placeholder="e.g. Grandma gave a bonus, or: was rude at dinner"></textarea></label>
      <div class="form-error manage-stars-error" hidden></div>
      <div class="modal-actions">
        <button class="cancel-btn manage-stars-cancel-btn">Cancel</button>
        <button class="save-btn manage-stars-save-btn">Save</button>
      </div>
    `;
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
    // Same "preset chip vs custom box, same field" relationship as the
    // quick-timer modal's preset-btn/custom-minutes pair: tapping a preset
    // just fills the amount input (it doesn't touch the sign toggle above),
    // so the manual field stays the single source of truth for what gets
    // submitted and any other amount is still one keystroke away.
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
    // v1.115.0+ bug report: "the new stars modal doesn't have the star
    // history on it we need to bring this back." Since v1.110.7 (see this
    // method's own docstring and _balanceCardHtml's comment), tapping a
    // person's name opens THIS modal instead of Star History for anyone
    // with can_override_rewards - a deliberate change the household asked
    // for at the time - but that left admins with no way at all to reach
    // Star History from the balances row anymore (a non-admin's name still
    // opens it, per the branch in the click handler above/below, but an
    // admin's never did again). Rather than revert that - the household
    // still wants the name-tap to open Manage Stars - this button reaches
    // Star History FROM here instead, for whichever person is currently
    // selected in the "Who" dropdown (read fresh at click time, not the
    // preselected id this modal opened with, so switching the dropdown
    // first still opens the right person's history). Closes this modal
    // first (both modals share the same "open" overlay convention and
    // there's no need for two full-screen-ish modals stacked at once).
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
      errEl.textContent = "Pick who this is for.";
      errEl.hidden = false;
      return;
    }
    if (!(amount > 0)) {
      errEl.textContent = "Enter a positive amount to add or subtract.";
      errEl.hidden = false;
      return;
    }
    // v1.110.7: reason is optional now (was required in v1.110.5) - only
    // sent when non-empty so an omitted reason doesn't show up as a blank
    // line in star history (add_stars/_renderStarHistoryModal already fall
    // back to a generic "Stars added"/"Stars deducted" label when reason
    // is "" or undefined).
    const delta = amount * (this._manageStarsSign === -1 ? -1 : 1);
    try {
      const msg = { type: "family_hub/rewards/adjust_balance", user_id: userId, delta };
      if (reason) msg.reason = reason;
      await this._hass.connection.sendMessagePromise(msg);
      await this._fetchRewardsState();
      this._closeManageStarsModal();
    } catch (e) {
      errEl.textContent = (e && e.message) || "Couldn't save that adjustment - only an admin or someone with reward-override permission can.";
      errEl.hidden = false;
    }
  }
  // v128+: spend part of a banked reward - see const.py's REWARD_REDEEM_MODES
  // docstring. Prompts for how much (pre-filled with the FULL current
  // balance, so "use it all" is just Enter) rather than a fixed amount,
  // since "use 1.5 of my 3 hours" was the household's own example.
  async _useBank(itemId) {
    const current = this._banks[this._myUserId()] && this._banks[this._myUserId()][itemId];
    const raw = window.prompt("How much to use now?", current != null ? String(current) : "1");
    if (raw === null) return;
    const amount = parseFloat(raw);
    if (!(amount > 0)) return;
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/rewards/use_bank", item_id: itemId, amount });
      await this._fetchRewardsState();
    } catch (e) {
      /* server reports the reason (e.g. insufficient_bank) via send_error; nothing actionable client-side beyond refreshing */
    }
  }
  async _markFulfilled(redemptionId) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/rewards/mark_fulfilled", redemption_id: redemptionId });
      await this._fetchRewardsState();
    } catch (e) {
      /* no-op */
    }
  }
  async _markBankUsageFulfilled(usageId) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/rewards/mark_bank_usage_fulfilled", usage_id: usageId });
      await this._fetchRewardsState();
    } catch (e) {
      /* no-op */
    }
  }
  // v128+: the per-user "click a name, see everything" history view - a
  // complete star ledger (chore approvals/overdue penalties/redemptions/
  // reversals/manual adjustments - fetched fresh on open, since it's the
  // one list this card doesn't already have loaded) merged chronologically
  // with this user's own redemptions and bank uses (both already loaded -
  // see _fetchRewardsState). Re-rendered on every poll tick too while open
  // (see _fetchRewardsState's own call to _renderStarHistoryModal).
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
  // Turns one ledger/redemption/bank-usage entry into a common
  // {at, icon, label, detail}-shaped row so _renderStarHistoryModal can
  // sort and render all three kinds of history entry identically without
  // three separate rendering paths.
  _historyEventRow(kind, entry) {
    if (kind === "ledger") {
      const positive = entry.delta > 0;
      const icons = { chore_approved: "&#11088;", chore_overdue: "&#9888;", redeemed: "&#127873;", redemption_reversed: "&#8634;", manual_adjustment: "&#9998;" };
      return {
        at: entry.at,
        icon: icons[entry.source] || (positive ? "&#11088;" : "&#9888;"),
        label: entry.reason || (positive ? "Stars added" : "Stars deducted"),
        detail: `${positive ? "+" : ""}${entry.delta} &#11088; (balance ${entry.balance_after})`,
      };
    }
    if (kind === "redemption") {
      const label = entry.bank_delta ? `Banked ${entry.title}` : `Redeemed ${entry.title}`;
      const pending = entry.requires_fulfillment && !entry.fulfilled ? " - pending" : "";
      return {
        at: entry.redeemed_at,
        icon: "&#127873;",
        label: `${label}${pending}`,
        detail: entry.bank_delta ? `+${entry.bank_delta} ${entry.unit_label || ""} (&minus;${entry.cost_stars} &#11088;)` : `&minus;${entry.cost_stars} &#11088;`,
      };
    }
    // "usage"
    const pending = entry.requires_fulfillment && !entry.fulfilled ? " - pending" : "";
    return {
      at: entry.used_at,
      icon: "&#128337;",
      label: `Used ${entry.title}${pending}`,
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
        <h3 class="star-history-title">${this._esc(this._userName(userId))}'s star history</h3>
        <button type="button" class="star-history-close-btn" title="Close">&#10005;</button>
      </div>
      <div class="star-history-list">
        ${
          rows.length
            ? rows.map((r) => `
              <div class="star-history-row">
                <span class="star-history-icon">${r.icon}</span>
                <span class="star-history-label">${this._esc(r.label)}</span>
                <span class="star-history-detail">${r.detail}</span>
                <span class="star-history-date">${r.at ? new Date(r.at).toLocaleDateString() : ""}</span>
              </div>
            `).join("")
            : `<div class="empty">Nothing yet.</div>`
        }
      </div>
    `;
  }

  _balanceCardHtml(user) {
    const bal = this._balances[user.id] || 0;
    const isAdmin = this._isAdmin();
    // Task #31: a "Gift" button on every OTHER household member's balance
    // card - self-serve, like redemption (see _giftStars' own docstring),
    // never shown on the viewer's own card (there's nothing to gift to
    // yourself - reward_engine.gift_stars rejects it server-side too, this
    // is just the frontend not offering a button that would always fail).
    const canGift = user.id !== this._myUserId();
    // v1.110.7: for someone who can_override_rewards, clicking the name
    // itself now opens the Manage Stars modal pre-selected to that person
    // (the household's own ask - "modal should pop up when you click the
    // person's name"), taking over the spot that used to always open Star
    // History. Someone WITHOUT that permission can't manage stars anyway,
    // so their name keeps doing exactly what it did before this change
    // (open Star History) - nothing about their affordance changes, so
    // there's no "non-functional pointer cursor" to worry about. The ✎
    // button stays too (same target, reachable without touching the name),
    // since some people scan for the icon rather than the name.
    const canManage = this._hasPermission("can_override_rewards");
    const nameTitle = canManage
      ? `Manually add or subtract ${this._esc(user.name)}'s stars`
      : `See ${this._esc(user.name)}'s full star history`;
    return `
      <div class="balance-card" style="border-color:${this._userColor(user.id)}">
        <span class="balance-dot" style="background:${this._userColor(user.id)}"></span>
        <button type="button" class="balance-name" data-user="${user.id}" title="${nameTitle}">${this._esc(user.name)}</button>
        <span class="balance-stars">&#11088; ${bal}</span>
        ${canGift ? `<button type="button" class="gift-stars-btn" data-user="${user.id}" data-name="${this._esc(user.name)}" title="Gift some of your own stars to ${this._esc(user.name)}">&#127873;</button>` : ""}
        ${canManage ? `<button type="button" class="manage-stars-for-btn" data-user="${user.id}" title="Manually add or subtract ${this._esc(user.name)}'s stars">&#9998;</button>` : ""}
        ${isAdmin ? `<span class="balance-adjust"><button class="adjust-minus-btn" data-user="${user.id}">-</button><button class="adjust-plus-btn" data-user="${user.id}">+</button></span>` : ""}
      </div>
    `;
  }
  // A malformed/missing color (anything not a clean #rrggbb hex string)
  // falls back to no inline style at all - the card just keeps its normal
  // .catalog-item look, same fail-safe convention as reward_engine.py's own
  // _normalize_hex_color on the way in.
  _catalogAccentStyle(item) {
    const color = item && item.color;
    if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color)) return "";
    return ` style="border: 2px solid ${color}; background: ${color}22;"`;
  }
  _catalogItemHtml(item) {
    const myBalance = this._balances[this._myUserId()] || 0;
    const affordable = myBalance >= (item.cost_stars || 0);
    const mode = item.redeem_mode || "instant";
    // v128+: purely cosmetic "what this is really worth" label (e.g. "$20"
    // or "2 hrs") - see reward_engine.add_catalog_item's own docstring on
    // value_note never being parsed/calculated with, just displayed.
    const valueNote = item.value_note ? `<div class="catalog-value-note">${this._esc(item.value_note)}</div>` : "";
    const modeBadge =
      mode === "one_time" ? `<div class="catalog-mode-badge">One-time</div>`
      : mode === "banked" ? `<div class="catalog-mode-badge">Stacks up</div>`
      : "";
    // A banked item shows the CURRENT VIEWER's own bank for it (not
    // everyone's - that's what the balances row / Star History modal are
    // for) plus a "Use" button once there's something to spend, right
    // alongside the ordinary Claim/Add button that keeps crediting it.
    const myBank = mode === "banked" ? (this._banks[this._myUserId()] && this._banks[this._myUserId()][item.id]) || 0 : 0;
    const bankDisplay =
      mode === "banked"
        ? `<div class="catalog-bank">Banked: ${myBank} ${this._esc(item.stack_unit_label || "")}</div>`
        : "";
    const useBankBtn = mode === "banked" && myBank > 0 ? `<button class="catalog-use-bank-btn" data-id="${item.id}">Use</button>` : "";
    // v1.110.0+: timed rewards ("2 hours of gaming"). The timer is an
    // INDEPENDENT property, not a fourth redeem_mode - the modes describe
    // how the star cost is consumed, the timer describes what happens
    // after - so the badge sits alongside the mode badge rather than
    // replacing it, and a banked-and-timed reward shows both.
    const timerMinutes = Number(item.timer_minutes) || 0;
    const timerBadge = timerMinutes > 0 ? `<div class="catalog-timer-badge" title="Starts a ${this._formatTimerLength(timerMinutes)} countdown when you use it">&#9201; ${this._formatTimerLength(timerMinutes)}</div>` : "";
    // One running reward timer per person: while this viewer has one going,
    // every timed reward's Claim is disabled and says why, rather than
    // letting them spend stars on something that would be refused. Their
    // own running one shows the live countdown and a cancel instead.
    const myRewardTimer = this._rewardTimerFor(this._myUserId());
    const isMyRunningItem = !!(myRewardTimer && myRewardTimer.item_id === item.id);
    const blockedByOtherTimer = timerMinutes > 0 && !!myRewardTimer && !isMyRunningItem;
    const runningRow = isMyRunningItem
      ? `<div class="catalog-timer-running">&#9201; <span data-timer-uid="${myRewardTimer.uid}">${this._formatTimerRemaining(this._timerRemainingSeconds(myRewardTimer))}</span> left
           <button class="catalog-timer-cancel-btn" data-uid="${myRewardTimer.uid}" title="Stop this timer">&#10005;</button>
         </div>`
      : "";
    const claimLabel = mode === "banked" ? "Add" : timerMinutes > 0 ? "Use" : "Claim";
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
        <button class="claim-btn" data-id="${item.id}" data-timer="${timerMinutes}" ${affordable && !blockedByOtherTimer && !isMyRunningItem ? "" : "disabled"} ${blockedByOtherTimer ? `title="You've already got &quot;${this._esc(myRewardTimer.title || "a reward")}&quot; running"` : ""}>${isMyRunningItem ? "Running" : claimLabel}</button>
        ${useBankBtn}
        <div class="claim-status"></div>
        ${this._manageOpen ? `<button class="manage-edit-btn" data-id="${item.id}" title="Edit">&#9998;</button><button class="manage-delete-btn" data-id="${item.id}" title="Remove">&times;</button>` : ""}
      </div>
    `;
  }
  _historyRowHtml(r) {
    // v123+: while managing, an admin gets a "clear" (delete, no refund)
    // and a "reverse" (delete + refund the stars) button per entry - see
    // reward_engine.py's delete_redemption/reverse_redemption for how the
    // two differ. Only shown alongside the catalog's own manage-delete-btn,
    // same _manageOpen-gated convention.
    const actions = this._manageOpen && this._isAdmin()
      ? `<span class="history-actions">
          <button type="button" class="history-reverse-btn" data-id="${r.id}" title="Reverse - delete and refund the stars">&#8634;</button>
          <button type="button" class="history-delete-btn" data-id="${r.id}" title="Clear - delete without refunding">&times;</button>
        </span>`
      : `<span class="history-actions"></span>`;
    return `
      <div class="history-row">
        <span>${this._esc(this._userName(r.user_id))}</span>
        <span>${this._esc(r.title)}</span>
        <span>&#11088; ${r.cost_stars}</span>
        <span class="history-date">${r.redeemed_at ? new Date(r.redeemed_at).toLocaleDateString() : ""}</span>
        ${actions}
      </div>
    `;
  }
  // v127+: one row per pending reward_engine suggestion (get_state's own
  // "suggestions" list, always included regardless of who's asking - see
  // ws_get_rewards_state's own comment on why visibility itself isn't
  // permission-gated). The Approve/Reject actions ARE gated, to the exact
  // same _canAddRewardsDirectly authority the backend independently
  // re-checks on both ws_approve_suggestion/ws_reject_suggestion - anyone
  // else (including the submitter themselves) sees a plain "Pending
  // approval" status instead, so a submitter can at least see their own
  // suggestion made it in and hasn't been resolved yet.
  _suggestionRowHtml(s) {
    const canResolve = this._canAddRewardsDirectly();
    const actions = canResolve
      ? `<span class="suggestion-actions">
          <input type="number" class="suggestion-cost-input" min="0" placeholder="Cost">
          <button type="button" class="suggestion-approve-btn" data-id="${s.id}" title="Approve and add to the catalog">&#10003;</button>
          <button type="button" class="suggestion-reject-btn" data-id="${s.id}" title="Reject">&times;</button>
        </span>`
      : `<span class="suggestion-pending">Pending approval</span>`;
    return `
      <div class="suggestion-row" data-id="${s.id}">
        <div class="suggestion-icon">${s.icon || "&#127873;"}</div>
        <div class="suggestion-title">${this._esc(s.title)}</div>
        <div class="suggestion-by">suggested by ${this._esc(this._userName(s.submitted_by))}</div>
        ${actions}
      </div>
    `;
  }

  // v128+: one row per pending (requires_fulfillment, not yet fulfilled)
  // redemption OR bank usage - see reward_engine.py's mark_redemption_
  // fulfilled/mark_bank_usage_fulfilled. Same visibility shape as
  // suggestions above: everyone sees the list (so the person waiting on
  // their allowance can see it's logged), only someone who
  // _canAddRewardsDirectly gets the Mark Done button.
  _pendingRowHtml(kind, entry) {
    const canResolve = this._canAddRewardsDirectly();
    const amountText = kind === "redemption" ? `&#11088; ${entry.cost_stars}` : `${entry.amount} ${this._esc(entry.unit_label || "")}`;
    const when = kind === "redemption" ? entry.redeemed_at : entry.used_at;
    const action = canResolve
      ? `<span class="suggestion-actions"><button type="button" class="pending-mark-done-btn" data-kind="${kind}" data-id="${entry.id}">Mark done</button></span>`
      : `<span class="suggestion-pending">Pending</span>`;
    return `
      <div class="suggestion-row" data-id="${entry.id}">
        <div class="suggestion-icon">${kind === "redemption" ? "&#127873;" : "&#128337;"}</div>
        <div class="suggestion-title">${this._esc(entry.title)}</div>
        <div class="suggestion-by">${this._esc(this._userName(entry.user_id))} - ${amountText}${when ? ` - ${new Date(when).toLocaleDateString()}` : ""}</div>
        ${action}
      </div>
    `;
  }
  _render() {
    if (!this._root) return;
    this._root.querySelector(".title").textContent = this._config.title;
    const manageBtn = this._root.querySelector(".manage-btn");
    manageBtn.hidden = !this._isAdmin();
    manageBtn.textContent = this._manageOpen ? "Done managing" : "Manage catalog";
    // v1.110.5+: gated on PERMISSION_REWARD_OVERRIDE specifically (not
    // plain _isAdmin like the catalog button above) - the same permission
    // that already gates overriding reward costs and reversing/clearing
    // history, since "can mess with someone's stars directly" is the
    // closest existing precedent for this. A real admin always has it.
    this._root.querySelector(".manage-stars-btn").hidden = !this._hasPermission("can_override_rewards");

    const memberUsers = this._memberUsers();
    this._root.querySelector(".balances").innerHTML = memberUsers.length
      ? memberUsers.map((u) => this._balanceCardHtml(u)).join("")
      : `<div class="empty">No one's been added to Family Hub yet - add people under Settings on the calendar dashboard.</div>`;

    this._root.querySelector(".catalog").innerHTML = this._catalog.length
      ? this._catalog.map((it) => this._catalogItemHtml(it)).join("")
      : `<div class="empty">No rewards in the catalog yet.</div>`;

    // v134+: an embedded Goals section, only ever shown when the
    // household's own goalsShowInRewards Settings toggle is on - same
    // "always visible when there's anything to show, actions gated"
    // shape the Suggested/Pending sections below already use.
    const goalsTitle = this._root.querySelector(".goals-title");
    const goalsList = this._root.querySelector(".goals");
    const goalsEnabled = this._goalsInRewardsEnabled();
    // v144.15+: archived goals (household hit "Complete" on them - see
    // _archiveGoal/goal-complete-btn above) are left out of this embedded
    // list entirely, same as family-hub-chores-card.js's own
    // _goalsBlockHtml filter and the standalone Goals card's _myGoals() -
    // there's no Completed accordion here, so "Complete" just means "hide."
    const visibleGoals = this._goals.filter((g) => g.status !== GOAL_STATUS_ARCHIVED);
    goalsTitle.hidden = !goalsEnabled || !visibleGoals.length;
    goalsList.innerHTML = goalsEnabled && visibleGoals.length ? visibleGoals.map((g) => this._goalRowHtml(g)).join("") : "";

    // v127+: pending suggestions are visible to EVERYONE whenever there
    // are any (not gated behind _manageOpen/_isAdmin like the catalog's
    // own delete buttons - approving/rejecting is its own always-relevant
    // action for whoever _canAddRewardsDirectly, not something that needs
    // "Manage catalog" toggled on first). The section itself (title +
    // list) just hides entirely when the bin is empty.
    const suggestionsTitle = this._root.querySelector(".suggestions-title");
    const suggestionsList = this._root.querySelector(".suggestions");
    const hasSuggestions = this._suggestions.length > 0;
    suggestionsTitle.hidden = !hasSuggestions;
    suggestionsList.innerHTML = hasSuggestions ? this._suggestions.map((s) => this._suggestionRowHtml(s)).join("") : "";

    // v128+: pending (requires_fulfillment, not yet fulfilled) redemptions
    // and bank uses, combined into one list, most-recent-first - same
    // "always visible, actions gated" shape as suggestions above.
    const pendingTitle = this._root.querySelector(".pending-title");
    const pendingList = this._root.querySelector(".pending");
    const pendingEntries = [
      ...this._redemptions.filter((r) => r.requires_fulfillment && !r.fulfilled).map((r) => ({ kind: "redemption", entry: r, at: r.redeemed_at })),
      ...this._bankUsages.filter((u) => u.requires_fulfillment && !u.fulfilled).map((u) => ({ kind: "usage", entry: u, at: u.used_at })),
    ].sort((a, b) => (b.at || "").localeCompare(a.at || ""));
    pendingTitle.hidden = !pendingEntries.length;
    pendingList.innerHTML = pendingEntries.length ? pendingEntries.map((p) => this._pendingRowHtml(p.kind, p.entry)).join("") : "";

    this._root.querySelector(".history").innerHTML = this._redemptions.length
      ? this._redemptions.slice(0, 10).map((r) => this._historyRowHtml(r)).join("")
      : `<div class="empty">Nothing redeemed yet.</div>`;
  }

  _css() {
    return `
      /* v1.110.7+: position:relative is the containing block .add-reward-fab
         needs when [fab-position="card"] switches it to position:absolute. */
      :host { display: block; height: 100%; position: relative; font-family: "Arial Rounded MT Std", "Arial Rounded MT", "Varela Round", -apple-system, "Segoe UI Rounded", "Segoe UI", Roboto, sans-serif;
        --fc-bg: #fbf7e5; --fc-card: #f5f3f0; --fc-border: #e6ddc4; --fc-text: #423d34; --fc-text-secondary: #96877a;
        --fc-accent: #8f5a00; --fc-accent-text: #fff8ea; --fc-accent2: #305545; --fc-accent3: #b5583c;
        --fc-surface-alt: #efe6cf; --fc-surface2: #f2eede; }
      ha-card { background: var(--fc-bg); color: var(--fc-text); padding: 14px; height: 100%; box-sizing: border-box; overflow-y: auto; }
      .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
      .title { font-size: 18px; font-weight: 800; }
      .actions { display: flex; align-items: center; gap: 8px; }
      .manage-btn { border: none; border-radius: 12px; padding: 6px 12px; font-size: 12px; font-weight: 700; background: var(--fc-surface-alt); color: var(--fc-text); cursor: pointer; }
      .manage-stars-btn { border: none; border-radius: 12px; padding: 6px 12px; font-size: 12px; font-weight: 700; background: var(--fc-surface-alt); color: var(--fc-text); cursor: pointer; }
      /* v144+ task #29: kiosk PIN login button + modal - same shape as
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
      /* v128+: the name is now a button (click for Star History) - reset
         it back to plain inline text visually, same font/weight/color the
         old plain <span> had, so this reads as a label that happens to be
         tappable rather than looking like a generic browser button. */
      .balance-name { border: none; background: none; padding: 0; margin: 0; font: inherit; font-weight: 700; color: var(--fc-text); cursor: pointer; text-decoration: underline dotted; text-underline-offset: 2px; }
      .balance-stars { color: var(--fc-accent); }
      .balance-adjust { display: flex; gap: 2px; margin-left: 4px; }
      .balance-adjust button { border: none; border-radius: 50%; width: 18px; height: 18px; line-height: 1; background: var(--fc-surface-alt); color: var(--fc-text); cursor: pointer; font-weight: 800; }
      .gift-stars-btn { border: none; border-radius: 50%; width: 20px; height: 20px; line-height: 1; background: var(--fc-surface-alt); cursor: pointer; font-size: 12px; padding: 0; }
      .manage-stars-for-btn { border: none; border-radius: 50%; width: 20px; height: 20px; line-height: 1; background: var(--fc-surface-alt); cursor: pointer; font-size: 11px; padding: 0; }
      /* v1.115.0+: the "View star history" link inside the Manage Stars
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
      /* v144.5+: "Liquid glass" support, same convention as
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
      /* v1.110.0+: timed rewards. The badge sits alongside the redeem-mode
         badge (they're independent properties, not alternatives), and the
         running row shows a live countdown with tabular figures so ticking
         seconds don't shift the card layout. */
      .catalog-timer-badge { font-size: 10px; font-weight: 800; color: var(--fc-accent2); background: var(--fc-surface-alt); border-radius: 6px; padding: 1px 6px; margin-top: 2px; }
      .catalog-timer-running { display: flex; align-items: center; justify-content: center; gap: 4px; font-size: 12px; font-weight: 800; color: var(--fc-accent2); font-variant-numeric: tabular-nums; margin-top: 4px; }
      .catalog-timer-cancel-btn { border: none; background: transparent; color: var(--fc-text-secondary); cursor: pointer; font-size: 12px; padding: 0 2px; }
      .claim-status { font-size: 10px; color: var(--fc-accent3); min-height: 12px; }
      .manage-delete-btn { position: absolute; top: 4px; right: 4px; border: none; background: none; color: var(--fc-accent3); font-size: 16px; cursor: pointer; }
      /* v129+: Edit sits just to the left of Delete, same absolute-corner treatment. */
      .manage-edit-btn { position: absolute; top: 4px; right: 26px; border: none; background: none; color: var(--fc-text-secondary); font-size: 14px; cursor: pointer; }
      /* v127+: same pixel-for-pixel FAB treatment as family-week-calendar-
         card.js's add-event-fab / family-hub-chores-card.js's
         add-chore-fab - see _build's own comment on why this lives as a
         sibling of <ha-card>. Unlike those two, never hidden/gated - every
         user gets this button, see _openCreateRewardModal for how its
         behavior itself branches on permission instead. */
      /* v1.110.4+: bottom offset by --fh-fab-offset - see family-hub-chores-card.js's identical comment. */
      .add-reward-fab { position: fixed; right: 18px; bottom: calc(18px + var(--fh-fab-offset, 0px)); z-index: 900; width: 56px; height: 56px; border-radius: 50%; border: none; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 28px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(58,53,44,0.35); transition: transform 0.15s ease, bottom 0.15s ease; }
      .add-reward-fab:active { transform: scale(0.94); }
      /* v1.110.7+: fab_position: "card" - see family-hub-chores-card.js's
         identical .add-chore-fab rule for the same mechanism. */
      :host([fab-position="card"]) .add-reward-fab { position: absolute; bottom: 18px; }
      /* The + button's modal - same shape as family-hub-chores-card.js's
         own create/edit modals (this card had no modal infrastructure at
         all before v127, everything used to render inline). */
      .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; align-items: center; justify-content: center; }
      .modal-overlay.open { display: flex; }
      .modal-box { background: var(--fc-bg); color: var(--fc-text); border-radius: 14px; padding: 18px; width: min(90vw, 420px); max-height: 85vh; overflow-y: auto; }
      .modal-box label { display: block; margin: 8px 0; font-size: 13px; font-weight: 700; }
      .modal-box input[type="text"], .modal-box input[type="number"] { width: 100%; box-sizing: border-box; margin-top: 4px; padding: 8px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 13px; font-family: inherit; }
      .m-hint { font-size: 12px; color: var(--fc-text-secondary); line-height: 1.5; margin: 4px 0 10px; }
      .modal-box select { width: 100%; box-sizing: border-box; margin-top: 4px; padding: 8px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 13px; font-family: inherit; }
      .m-checkbox-label { display: flex !important; align-items: center; gap: 6px; font-weight: 400 !important; }
      /* v134+: the Goal tab's own fields (g-* prefix, mirroring the m-*
         prefix the Reward tab's fields already use) - textarea/datetime-
         local inputs this card never needed before Goals existed. */
      .modal-box textarea, .modal-box input[type="datetime-local"] { width: 100%; box-sizing: border-box; margin-top: 4px; padding: 8px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 13px; font-family: inherit; }
      .modal-box textarea { resize: vertical; }
      .modal-tabs { display: flex; gap: 4px; margin-bottom: 10px; border-bottom: 1px solid var(--fc-border); }
      .modal-tab { flex: 1; border: none; background: none; color: var(--fc-text-secondary); font-weight: 800; font-size: 13px; padding: 8px 4px; cursor: pointer; border-bottom: 2px solid transparent; }
      .modal-tab.active { color: var(--fc-accent); border-bottom-color: var(--fc-accent); }
      .goal-pane[hidden], .reward-pane[hidden] { display: none; }
      .m-banked-fields { margin: 4px 0; }
      .m-stack-row { display: flex; gap: 6px; margin-top: 4px; }
      .m-stack-row input[type="number"] { width: 70px; }
      .m-stack-row input[type="text"] { flex: 1; }
      .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
      .modal-actions button { border: none; border-radius: 10px; padding: 8px 16px; font-weight: 700; cursor: pointer; }
      .save-btn { background: var(--fc-accent); color: var(--fc-accent-text); }
      .cancel-btn { background: var(--fc-surface-alt); color: var(--fc-text); }
      .form-error { color: var(--fc-accent3); font-size: 12px; margin-top: 8px; min-height: 14px; }
      .m-icon-picker { margin: 8px 0; }
      .m-icon-toggle { background: var(--fc-card); color: var(--fc-text); border: 1px solid var(--fc-border); border-radius: 8px; font-size: 16px; padding: 5px 8px; cursor: pointer; }
      /* v135+: the grid itself is a vertical stack of collapsed-by-default
         category accordions (see REWARD_ICON_CATEGORIES) instead of one
         long flat emoji grid. v136+: laid out in normal document flow
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
      /* v127+: pending reward_engine suggestions - see _suggestionRowHtml.
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
      /* v134+: embedded Goals section rows reuse .suggestion-row's own grid
         (see _goalRowHtml) - .goal-row-actions just needs its own button
         styling since Log Progress/Approve/Send Back are full text labels,
         not the suggestion row's small icon-only checkmark/X buttons. */
      .goal-row-actions { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }
      .goal-row-actions button { border: none; border-radius: 6px; padding: 4px 8px; font-size: 11px; font-weight: 700; cursor: pointer; background: var(--fc-accent2); color: #fff; white-space: nowrap; }
      .goal-reject-btn { background: var(--fc-surface-alt) !important; color: var(--fc-accent3) !important; }
      .empty { font-size: 12px; color: var(--fc-text-secondary); padding: 6px 0; }
      /* v128+: pending-fulfillment rows reuse .suggestion-row's own grid,
         see _pendingRowHtml. */
      .pending-mark-done-btn { border: none; border-radius: 8px; padding: 4px 8px; font-size: 11px; font-weight: 700; cursor: pointer; background: var(--fc-accent2); color: #fff; white-space: nowrap; }
      /* v128+: value_note/redeem_mode badges and the banked-item display
         on a catalog card - see _catalogItemHtml. */
      .catalog-value-note { font-size: 11px; color: var(--fc-text-secondary); margin-bottom: 4px; }
      .catalog-mode-badge { display: inline-block; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; color: var(--fc-accent2); background: var(--fc-surface-alt); border-radius: 6px; padding: 1px 6px; margin-bottom: 4px; }
      .catalog-bank { font-size: 11px; font-weight: 700; color: var(--fc-accent2); margin-bottom: 4px; }
      .catalog-use-bank-btn { border: none; border-radius: 8px; padding: 6px 10px; font-size: 12px; font-weight: 700; cursor: pointer; background: var(--fc-surface-alt); color: var(--fc-text); width: 100%; margin-top: 4px; }
      /* v128+: the Star History modal - reuses the same .modal-overlay/
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

// v1.111.0+: dedicated editor element for getConfigElement above - same
// pattern as family-hub-goals-card.js's own editor (see that file's
// comments for the full reasoning on each duplicated helper).
class FamilyHubRewardsCardEditor extends HTMLElement {
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
