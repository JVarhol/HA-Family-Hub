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
      return { screenSaver: { sourceType: "video", videoUrl: "", cameraEntity: "", idleSeconds: 180, usersEnabled: {}, returnDashboardPath: "" } };
    }
    // v1.132.36+: same helper as the calendar card's/standalone screensaver
    // card's own _normalizeDashboardPath - a value missing its leading "/"
    // resolves as relative to whatever's currently showing rather than
    // root-relative, silently breaking navigation.
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
      return { screenSaver: { sourceType, videoUrl, cameraEntity, idleSeconds, usersEnabled, returnDashboardPath } };
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
    // v1.132.36+: household bug report, verbatim - "the navigate back to
    // page workes on the calendar page the card that has the actual
    // settings button but it doesnt work when the screen saver is called
    // by like chores or rewards card." Root cause: this shared singleton
    // (the screensaver that actually runs when a Chores/Rewards/My Chores
    // card - not the calendar card - is what's on screen when it's idle)
    // never had ANY return-dashboard navigation at all - the calendar
    // card's and standalone screensaver card's _goToReturnDashboard fixes
    // (v193 onward) were never ported here, so waking from this copy
    // always just hid the overlay and left you wherever you already were.
    // Now mirrors the other two copies exactly: read screenSaver.
    // returnDashboardPath off the same shared settings blob, and navigate
    // via the same smooth soft-route-with-hard-fallback helper (see
    // family-week-calendar-card.js's own _navigateWithFallback for the
    // full mechanism/history).
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
    // v1.132.63+: household bug report, verbatim - "Need to make it if
    // screensaver is set to return to the dashboard page it's currently
    // on it does nothing." See family-week-calendar-card.js's own
    // identical copy of this method for the full root-cause note - v193
    // onward's soft-route-with-hard-fallback mechanism, v1.132.61's own
    // attempted fix of skipping this function entirely when already on
    // the target page (which wrongly also skipped the hard-navigate
    // fallback for a genuinely broken soft route, not just the harmless
    // same-page no-op it meant to fix), and this version's actual fix -
    // still attempt the soft navigation unconditionally, only skip the
    // ambiguous before/after fallback check when nothing needed to
    // change AND pushState didn't throw.
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
      // Test-only hooks - not used by any real card. Lets a jsdom test
      // drive this shared controller directly (no full card element
      // needed) and stub the actual browser navigation, same reason every
      // class-based card's own _hardNavigate is a stubbable method rather
      // than calling window.location.assign inline (that API is non-
      // writable/non-configurable in jsdom).
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

// Full-screen Chores board: one column per household member plus a shared
// Chore Bin column, drag-and-drop between them, and a chore-creation form
// with an Advanced Settings accordion (sensor triggers + dependencies).
//
// v112+: this card has no Settings of its own anymore - card title comes
// from the native "Edit Card" dialog (getConfigForm below), and Permissions
// management moved into the main Family Hub calendar card's own Settings
// (a new "Permissions" tab there, admin-only) per the household's own
// request to keep every setting in one place. This card still READS
// permissions (_fetchMyPermissions/_hasPermission/_canAssign/_canVerify) to
// decide what buttons to show - it just no longer has UI to CHANGE them.
// Same story for who's even eligible for Chores at all: that used to be a
// per-user "Chores enabled" toggle on the Users tab; it's now folded into
// Family Hub membership itself (settings.memberUserIds - see
// SETTINGS_KEY_MEMBER_USER_IDS in const.py) - being added to Family Hub on
// the Users tab is what gives someone a column here and makes them
// offerable as an assignee, and this card only reads that list off the
// Settings blob (see _fetchSettings/_memberUsers) to decide. The backend
// enforces membership independently on every chores/* call too (see
// chore_engine.py's IsUserEnabled) - this is just about not showing
// controls someone can't use, same principle as the permissions gate.
//
// Talks to the backend purely over the family_hub/chores/*,
// family_hub/rewards/*, and family_hub/permissions/* websocket commands
// (see family_hub/chores_websocket_api.py) - no entity config needed beyond
// a title, matching family-hub-my-chores-card.js/family-hub-rewards-card.js.
// v211+: household ask, verbatim - "Chore assignments should be Direct,
// Auto Rotation, and Chore Bin (anyone can claim) remove chore bin from
// the assign to when using direct mode. make assignment mode buttons
// instead of a drop down". Down to 3 modes from 4 - "First come, first
// served" is gone as a separate mode, folded into Chore Bin instead. The
// two were already functionally identical everywhere that mattered: both
// only ever did `assigned_to = CHORE_BIN_SENTINEL` at creation
// (chore_engine._apply_assignment_mode) and the household's own claim_chore
// backend function only ever checks `assigned_to === CHORE_BIN_SENTINEL`,
// never assignment_mode - the ONE place they actually differed was this
// card's own Claim-button gate (_choreCardHtml used to only show Claim for
// assignment_mode === "first_come_first_served", leaving a plain Chore Bin
// chore admin-only-assignable with no self-serve claim at all). That gate
// is now just `status === "open" && isBin`, so every bin chore - old
// first_come_first_served ones, old admin-only chore_bin ones, and every
// new one going forward - is claimable by anyone, matching "Chore Bin
// (anyone can claim)". The backend keeps validating/normalizing the old
// "first_come_first_served" value unchanged (const.py's
// CHORE_ASSIGNMENT_MODES, chore_engine.py) purely for backward
// compatibility with whatever's already saved - it's just no longer
// offered here as a choice for a NEW chore.
const ASSIGNMENT_MODES = [
  { value: "direct", label: "Direct", title: "Assign to one specific person" },
  { value: "auto_rotation", label: "Auto Rotation", title: "Takes turns automatically among a rotation group" },
  { value: "chore_bin", label: "Chore Bin (anyone can claim)", title: "Sits unassigned until someone taps Claim" },
];
const CHORE_BIN_SENTINEL = "chore_bin";
// v131+: "remind me N minutes before this is due" - the exact same lead-
// time values the calendar card offers for its own event reminders (see
// that file's own minutesOptions in _renderEventInfoRemindSection), kept
// as a literal here rather than imported since this card is an
// independently-loaded Lovelace resource, same "small consts duplicated
// across independently-loaded files" convention already established
// elsewhere in this project.
const CHORE_REMINDER_MINUTES_CHOICES = [5, 10, 15, 30, 60, 120, 1440];
const PALETTE = ["#a9c6c2", "#dba99c", "#d9bf7e", "#a8bd93", "#b9a7c9", "#cf8f6c", "#a89a83"];
// Index 0-6 = Monday..Sunday, matching Python's own date.weekday()/the
// backend's recur_weekdays exactly (see chore_engine.py's
// _normalize_recur_weekdays) - so these indices round-trip to the server
// with no day-of-week convention translation anywhere.
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// v1.132.38+: same index convention as WEEKDAY_LABELS just above (Monday=0
// ...Sunday=6) - full names for the new "Recurs" preset dropdown's dynamic
// option text ("Weekly on Tuesday"), where an abbreviation would read oddly
// next to plain English sentences the way it doesn't in a compact button row.
const WEEKDAY_FULL_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
// Matches the existing recur_month_nth select's own wording (_recurFieldsHtml's
// nthOptions - "The 1st"/"The 2nd"/.../"The last") but lowercase and without
// "The", for use inline in a sentence ("Monthly on the fourth Tuesday").
const RECUR_NTH_WORDS = { "1": "first", "2": "second", "3": "third", "4": "fourth", "-1": "last" };
// v186+: household ask, verbatim - "Chores due x amount time before due on
// recurring chores. This will set the due date based on when the chore is
// recurred instead of when the chore was created." Presets for
// recur_due_offset_minutes (see chore_engine.CHORE_KEY_RECUR_DUE_OFFSET_
// MINUTES) - "0" (the default) means "due the moment it reopens." Minute
// counts rather than day-only granularity so a short-turnaround chore
// ("bring the trash bin in a couple hours after pickup") isn't forced into
// day-sized steps; a plain <select>, not a checkbox row like reminder_
// minutes, since a chore has exactly one due date, not several lead-time
// reminders.
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
// Fixed order/labels, matching const.py's ROUTINE_CATEGORIES/
// ROUTINE_CATEGORY_LABELS exactly - Routines has no per-household custom
// categories (unlike Chores' free-form titles), just these three daily
// checklists per person.
const ROUTINE_CATEGORIES = ["morning", "afternoon", "night"];
const ROUTINE_CATEGORY_LABELS = { morning: "Morning Routine", afternoon: "Afternoon Routine", night: "Night Routine" };
// v134+: mirrors const.py's GOAL_STATUS_* (same duplicated-across-
// independently-loaded-files convention as everything else on this line) -
// powers the optional per-person Goals block (see _goalsBlockHtml).
const GOAL_STATUS_OPEN = "open";
const GOAL_STATUS_PENDING_VERIFICATION = "pending_verification";
const GOAL_STATUS_APPROVED = "approved";
// v144.15+: mirrors const.py's GOAL_STATUS_ARCHIVED - see
// family-hub-goals-card.js's own comment on this same constant for the
// full "Complete" button reasoning; here it's just used to hide an
// archived goal from this condensed embedded block entirely (see
// _goalsBlockHtml).
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

class FamilyHubChoresCard extends HTMLElement {
  static getStubConfig() {
    return { title: "Chores" };
  }
  // v1.111.0+: switched to getConfigElement (a real custom element) so the
  // Theme picker below can list live Theme Builder + native HA themes -
  // see family-hub-goals-card.js's identical comment for the full reasoning.
  static getConfigElement() {
    return document.createElement("family-hub-chores-card-editor");
  }
  // v1.110.7+: "dashboard" (default) pins the + FAB to the viewport's
  // bottom-right corner, stacked with every other Family Hub card's FAB
  // via the shared window.__familyHubFabCoordinator (unchanged behavior
  // from v1.110.4) - "card" instead anchors it to THIS card's own box, for
  // a multi-column/sections dashboard where a viewport-fixed FAB would sit
  // disconnected from a card that isn't in the bottom-right column. See
  // _registerFabCoordinator's own comment for why "card" opts all the way
  // out of the shared stacking rather than trying to stack in its own
  // corner.
  setConfig(config) {
    this._config = {
      title: (config && config.title) || "Chores",
      fab_position: config && config.fab_position === "card" ? "card" : "dashboard",
      theme_override: (config && typeof config.theme_override === "string") ? config.theme_override : "",
    };
    this._registerFabCoordinator();
    if (this._settingsCache === undefined) this._settingsCache = null;
    if (this._globalThemes === undefined) this._globalThemes = [];
    if (this._chores === undefined) this._chores = [];
    if (this._users === undefined) this._users = [];
    if (this._myPermissions === undefined) this._myPermissions = {};
    // v1.110.0+: running chore/reward timers, household-wide, straight from
    // family_hub/timers/list. The VISIBLE countdown is computed from each
    // timer's started_at + duration_minutes on every tick (see
    // _timerRemainingSeconds) rather than from these fetches, so the number
    // on screen stays smooth and accurate between polls - the backend is
    // what actually decides a timer is done, this is only what it looks like.
    if (this._timers === undefined) this._timers = [];
    if (this._balances === undefined) this._balances = {};
    if (this._catalog === undefined) this._catalog = [];
    if (this._firstLoadPromise === undefined) this._firstLoadPromise = null;
    if (this._draggingId === undefined) this._draggingId = null;
    if (this._routineItems === undefined) this._routineItems = [];
    // Which Morning/Afternoon/Night accordion rows are expanded, keyed
    // "<userId>:<category>" - lives on the card instance (not re-derived
    // from anything server-side) so it survives the poll-driven re-renders
    // below instead of every accordion snapping shut every 20s.
    if (this._openRoutineSections === undefined) this._openRoutineSections = new Set();
    // Which per-column "Completed" accordions are expanded, keyed by
    // column (person) id - same "lives on the instance, survives the
    // poll-driven re-renders" reasoning as _openRoutineSections above.
    if (this._openCompletedSections === undefined) this._openCompletedSections = new Set();
    // v134+: Goals, optionally embedded per-person on the Chores board (see
    // _goalsInChoresEnabled/_goalsBlockHtml) - only ever fetched/rendered
    // when the household's own goalsShowInChores Settings toggle is on,
    // same "don't pay for a feature nobody turned on" principle as Routines
    // just above.
    if (this._goals === undefined) this._goals = [];
    if (!this._built) this._build();
    this._render();
  }
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    this._ensureTranslationsLoaded();
    // Keeps the shared screensaver controller's own hass reference fresh
    // on every update (not just the first), same as every other card that
    // registers with it - see the singleton block above _startPolling.
    if (window.__familyHubScreenSaver) window.__familyHubScreenSaver.updateHass(hass);
    if (first) this._firstLoadPromise = this._initFirstLoad();
  }
  async _initFirstLoad() {
    await Promise.all([this._fetchSettings(), this._fetchUsers(), this._fetchChores()]);
    // v1.111.0+: always fetch (not just when useGlobalTheme is on) so a
    // per-card theme_override can resolve even when the household hasn't
    // turned on Global Theme - same change as every other themed card.
    await this._fetchGlobalThemes();
    await this._fetchMyPermissions();
    await this._fetchTimers();
    this._startTimerTicker();
    if (this._showRewardsColumn()) await this._fetchRewardsState();
    if (this._routinesEnabled()) await this._fetchRoutines();
    if (this._goalsInChoresEnabled()) await this._fetchGoals();
    // v144+ task #29: who (if anyone) can kiosk-PIN-login on this board -
    // decides whether the Login button even shows at all (see
    // _updateKioskLoginUi). Awaited, same as every other first-load fetch
    // here - _fetchKioskLoginUsers already fails soft (an empty list) on
    // any error, so this never blocks a household that's never touched
    // the feature for more than one quick round trip.
    await this._fetchKioskLoginUsers();
    this._updateKioskLoginUi();
    this._startPolling();
    this._registerScreenSaver();
    this._registerFabCoordinator();
    this._registerKioskSession();
    // Household bug report, verbatim: "a household alarm or an assigned
    // alarm set to them plus kiosk doesnt alarm on the kiosk" - a widened
    // (kiosks/everyone) timer alarm only ever reached a dashboard through
    // this subscription, and until now only family-hub-active-timers-
    // card.js ever set it up. A kiosk whose dashboard shows Chores instead
    // of (or as well as) Active Timers never caught the broadcast at all.
    // See family-hub-active-timers-card.js's own copy of this method for
    // the full design note - kept byte-identical on purpose.
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
  // v1.110.8+: joins the shared kiosk-login session (see the singleton
  // block above this class) instead of tracking elevation as a private
  // instance field - registerClient immediately calls back with whatever
  // the CURRENT shared elevation is (null, or someone already logged in
  // from another card), and again on every future login/logout from any
  // card. Safe to call more than once, same Map-keyed-by-`this` reasoning
  // as _registerScreenSaver/_registerFabCoordinator above.
  _registerKioskSession() {
    if (window.__familyHubKioskSession) window.__familyHubKioskSession.registerClient(this, (elevation) => this._onKioskElevationChanged(elevation));
  }
  // Joins the shared, dashboard-wide screensaver controller (see the
  // singleton block above this class) rather than standing up its own
  // overlay/idle-timer/camera-poll - registerClient is safe to call more
  // than once for the same card instance (a plain JS Set, so a duplicate
  // add is a no-op), which is why this is called from both here and
  // connectedCallback below without needing its own extra guard flag.
  _registerScreenSaver() {
    if (window.__familyHubScreenSaver && this._hass) window.__familyHubScreenSaver.registerClient(this, this._hass);
  }
  // v1.110.4+: joins the shared FAB-stacking coordinator (see the singleton
  // block above this class) so this card's add-chore-fab gets a non-
  // overlapping slot when other Family Hub cards with their own FAB share
  // the same dashboard view. Safe to call more than once (a plain Map
  // keyed by `this`), same reasoning as _registerScreenSaver above.
  _registerFabCoordinator() {
    // v1.110.7+: fab_position "card" toggles the [fab-position="card"]
    // host attribute the CSS below keys off of (position:fixed -> :host-
    // relative position:absolute) and registers with takesSlot:false - it
    // stays a coordinator member (so Goal-tab de-duplication still works
    // against it), it just never occupies a shared viewport-corner slot,
    // since that's meaningless once this FAB is positioned relative to
    // its own card's box instead. See the coordinator singleton's own doc.
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
    // v190.1+: _fireConfetti's portals live in document.body, outside this
    // card's own shadow root (see that method's own comment for why) -
    // they're normally short-lived enough to just self-remove via their
    // own setTimeout, but a card torn down mid-burst (dashboard edit,
    // navigating away) must not leave one of those orphaned on the page.
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
  // v144+ task #29: while a kiosk PIN elevation is active (this._kioskElevation -
  // v1.110.8+: a local mirror of window.__familyHubKioskSession's shared
  // state, kept in sync via _onKioskElevationChanged, see that singleton's
  // own docstring above), _isAdmin/_myUserId/_hasPermission all answer AS
  // that elevated household member instead of the real (usually shared,
  // unprivileged) kiosk HA login - which is the whole point: the rest of
  // this card already keys almost everything (which column is "mine",
  // which buttons show) off these three methods, so making just these
  // elevation-aware makes the entire board render and behave as if that
  // person is genuinely logged in, no other rendering code needs to know
  // kiosk login exists at all. The actual server-side calls this card
  // makes still separately carry elevation_token (see _kioskMsg) - the
  // real permission decision is always re-checked there, this is only
  // about what the UI shows.
  _isAdmin() {
    if (this._kioskElevation) return !!this._kioskElevation.is_admin;
    return !!(this._hass && this._hass.user && this._hass.user.is_admin);
  }
  _myUserId() {
    if (this._kioskElevation) return this._kioskElevation.user_id;
    return this._hass && this._hass.user ? this._hass.user.id : null;
  }
  // v127+: reads this._myPermissions (see _fetchMyPermissions below), the
  // CALLER's own effective grants - {permission: bool}, already resolved
  // server-side (admin-or-not, granted-or-not) rather than this card
  // looking itself up inside the full permissions store the way it used
  // to. _isAdmin() is still checked here too, purely so this keeps working
  // instantly on first paint before that first fetch resolves (an admin's
  // own admin-ness needs no round trip to know).
  _hasPermission(key) {
    if (this._isAdmin()) return true;
    if (this._kioskElevation) return !!(this._kioskElevation.permissions && this._kioskElevation.permissions[key]);
    return !!this._myPermissions[key];
  }
  // --- Native HA frontend i18n (same trio as family-week-calendar-card.js;
  // see that file's own comment on _t/_ensureTranslationsLoaded/
  // _applyTranslations for the full mechanism - hass.loadBackendTranslation
  // + hass.localize, keyed by hass.language, no separate Family Hub
  // language setting. Copied rather than shared, like every other card in
  // this repo - none of the 11 card files share code. Chores-card UI
  // strings live under the SAME "frontend" translation category as the
  // Calendar card, namespaced "chores.*" so the two never collide. ---
  // v1.132.49+: v1.132.48's fix for the "Failed to format translation ...
  // [formatjs Error: MISSING_VALUE]" log spam (see that version's own
  // changelog entry) turned out to be WRONG and didn't actually stop it -
  // confirmed still logging on the household's instance after installing
  // v1.132.48 and a full Home Assistant restart, so the theory that
  // hass.localize(key, "name", value, ...) (flattened pairs, the OLD
  // Polymer-era HA frontend convention) was the right substitution
  // signature for this HA version (2026.9.1) was wrong. The REAL fix:
  // stop using "{x}"-style ICU placeholder syntax in the translation
  // JSON strings at all (see translations/en.json's own comment on this),
  // so hass.localize's internal formatjs call never sees an unresolved
  // argument in the first place, on ANY Home Assistant version, and never
  // logs anything - our own split/join below (now matching translations/
  // *.json's new "%x%" token instead of "{x}") does 100% of the
  // substitution work ourselves, exactly like this was always intended
  // to. hass.localize(key) is called with no extra arguments again.
  // Mirrors the identical fix in family-week-calendar-card.js's own copy
  // of this same trio.
  //
  // v1.132.51+: household report, verbatim - "I set my language to German
  // but the calendar and settings are still English" - confirmed Home
  // Assistant's own core UI (sidebar, other native pages) DID switch to
  // German, so hass.language really is "de" and the per-user profile
  // setting genuinely took effect; only Family Hub's own strings stayed
  // English. Root cause: the translation category this whole trio has used
  // since v1.132.44, "frontend", is not actually a free, collision-proof
  // name - it's also the literal domain/category name of Home Assistant's
  // OWN built-in frontend integration, which serves ITS OWN UI strings
  // (sidebar labels, common panel titles, etc.) through this exact same
  // generic backend translation API. hass.loadBackendTranslation caches
  // and batches its fetches per (language, category) - once HA's own core
  // frontend has already requested category "frontend" for the current
  // language (which it does on every app load, to translate its own UI),
  // this card's own later `hass.loadBackendTranslation("frontend",
  // "family_hub")` call could be satisfied entirely from that ALREADY-
  // cached (language, "frontend") result instead of actually performing a
  // fresh fetch scoped to include family_hub's own integration - silently
  // leaving hass.resources without any of family_hub's own German/Spanish
  // strings under that category, which is exactly what makes _t() fall
  // through to its own hard-coded English fallback for every single key,
  // forever, with nothing ever thrown or logged anywhere (this card's own
  // .catch() below never even fires, since the promise still resolves
  // successfully - it just resolves to translations that don't include
  // ours). Fixed by renaming this integration's OWN custom category from
  // "frontend" (a name it was never safe to reuse) to "fh_ui" - see
  // translations/en.json's own comment and _ensureTranslationsLoaded's
  // own loadBackendTranslation call below for the matching change. Also
  // added a console.warn on this trio's own .catch() (see
  // _ensureTranslationsLoaded below) so a genuine future load failure is
  // at least visible in the browser console instead of silently staying
  // English with zero trace anywhere, the way this exact bug did.
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
  // ROUTINE_CATEGORY_LABELS/WEEKDAY_LABELS are module-level consts (shared
  // with const.py's own fixed ordering - see their own comments above) and
  // so can't call this._t() directly; these small wrappers translate on the
  // way out instead of touching every call site's own English fallback.
  // (WEEKDAY_LABELS itself is translated only at the couple of call sites
  // this pass actually covers - see _routineItemCardHtml - not yet at every
  // one of its call sites; the rest belong to the still-untranslated
  // Create/Edit recurrence UI, a later pass.)
  _routineCategoryLabel(cat) {
    const fallback = ROUTINE_CATEGORY_LABELS[cat] || cat;
    return this._t(`chores.routine_category_${cat}`, fallback);
  }
  _weekdayLabel(idx) {
    const fallback = WEEKDAY_LABELS[idx] || "";
    return this._t(`chores.weekday_${idx}`, fallback);
  }
  _ensureTranslationsLoaded() {
    if (!this._hass || typeof this._hass.loadBackendTranslation !== "function") return;
    const lang = this._baseLanguage(this._hass.language);
    if (this._i18nLoadedLang === lang || this._i18nLoading === lang) return;
    this._i18nLoading = lang;
    this._hass
      .loadBackendTranslation("fh_ui", "family_hub")
      .then(() => {
        this._i18nLoadedLang = lang;
        this._i18nLoading = null;
        this._applyTranslations();
        this._render();
      })
      .catch((e) => {
        this._i18nLoading = null;
        // v1.132.51+: this used to fail completely silently (see _t's own
        // comment above) - a real load failure now at least leaves a
        // trace in the browser console instead of just staying English
        // with no way to tell why.
        console.warn("[family_hub] failed to load \"" + lang + "\" translations - staying on English fallback text", e);
      });
  }
  _applyTranslations() {
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
  // v144+ task #29: kiosk PIN login. this._kioskElevation is null when
  // nobody's elevated, else {token, user_id, name, is_admin, permissions,
  // expires_in} - exactly what family_hub/kiosk/elevate returns (see
  // chores_websocket_api.py's own ws_kiosk_elevate docstring). Every
  // server call this card makes for an action a kiosk login should be able
  // to do (complete/approve/reject a chore, redeem a reward, approve/
  // reject a goal) is wrapped through _kioskMsg so the backend can
  // re-derive and re-check the REAL permission itself - this card's own
  // _isAdmin/_myUserId/_hasPermission overrides above only ever control
  // what the UI shows, never what the server allows.
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
      // state now live in window.__familyHubKioskSession (see its own
      // docstring above) - login() stores the result and broadcasts it to
      // every registered card (this one included), which is what actually
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
  // another kiosk-login-bearing card's (see registerClient's own
  // immediate-call-on-register behavior too, which is what makes a card
  // that mounts AFTER someone's already logged in elsewhere pick up the
  // right state right away). Mirrors the broadcast value onto this
  // card's own this._kioskElevation so every other method here
  // (_isAdmin/_myUserId/_hasPermission/_kioskMsg/_updateKioskLoginUi) is
  // completely unchanged from the pre-v1.110.8 single-card version - they
  // still just read this._kioskElevation, it's only kept in sync
  // differently now.
  _onKioskElevationChanged(elevation) {
    this._kioskElevation = elevation;
    if (!this._root) return;
    this._updateKioskLoginUi();
    // Everything on the board (which column is "mine", which action
    // buttons show) is derived from _myUserId/_hasPermission, both now
    // elevation-aware - re-rendering is what actually makes the board
    // reflect whoever is (or isn't) logged in.
    this._render();
  }
  // v1.110.8+: the 45-second inactivity timer and its document-wide
  // activity listeners now live entirely in window.__familyHubKioskSession
  // (see its own docstring above on why - a shared session needs ONE
  // shared clock, not one independent clock per card that could each
  // expire on its own schedule) - this card no longer arms or owns a
  // timer itself. Kept as a thin instance method purely so the Login
  // button's click handler and existing call sites don't need to know
  // that moved.
  async _kioskLogout() {
    if (window.__familyHubKioskSession) await window.__familyHubKioskSession.logout(this._hass);
  }
  _canAssign() {
    return this._hasPermission("can_assign");
  }
  // v1.132.47+: household ask, verbatim - "Need a permission to add/delete
  // routines both add/delete self and all so someone can't modify others."
  // Mirrors chores_websocket_api.py's _can_write_routine_items(...) exactly
  // (see that function's own docstring for the full reasoning) - this is a
  // client-side echo of the same rule for showing/hiding routine-item
  // controls, the server call is still what actually enforces it. Allowed
  // if: can_assign (unchanged, existing precedent - an assign-permission
  // holder keeps managing every person's routines exactly as before); OR
  // the new can_manage_any_routines (same reach, scoped to just Routines);
  // OR the new can_manage_own_routines, but ONLY when userId is the
  // viewer's own id - unlike _canAssign() this one is ownership-aware, the
  // entire point of the household's ask ("so someone can't modify others").
  _canManageRoutinesFor(userId) {
    if (this._canAssign()) return true;
    if (this._hasPermission("can_manage_any_routines")) return true;
    if (this._hasPermission("can_manage_own_routines") && userId === this._myUserId()) return true;
    return false;
  }
  // v1.132.47+: true if the viewer has ANY routine-write grant at all (own,
  // any, or plain can_assign) - used to decide whether the "+" FAB and the
  // Routine tab inside it should be reachable for someone who has ONLY a
  // routines permission and not can_assign (see _render()'s FAB-visibility
  // check and _openCreateModal()'s tab gating, both below).
  _canManageAnyRoutines() {
    return this._canAssign() || this._hasPermission("can_manage_any_routines") || this._hasPermission("can_manage_own_routines");
  }
  _canVerify() {
    return this._hasPermission("can_verify");
  }
  // v144.4+: PERMISSION_EDIT_CHORE was split out of PERMISSION_ASSIGN -
  // can_assign alone is only enough to create/assign brand new chores now;
  // editing an EXISTING open chore needs this separate grant (or a real
  // admin, via _hasPermission's own admin bypass). Mirrors
  // ws_update_chore's own server-side gate in chores_websocket_api.py.
  _canEditChore() {
    return this._hasPermission("can_edit_chore");
  }
  // v144.4+: PERMISSION_STAR_OVERRIDE - gates the one specific field
  // (no_approval_required) that lets a chore's stars pay out instantly with
  // no verification step, on both create and edit. Mirrors the same
  // no_approval_required gate ws_create_chore/ws_update_chore enforce
  // server-side.
  _canStarOverride() {
    return this._hasPermission("can_star_override");
  }
  // v1.132.53+: household ask, verbatim - "For chores and routines make
  // needs approval check box 2 buttons one for requires approval and one
  // for don't require approval." Replaces the old single "Doesn't require
  // approval" checkbox with a 2-button toggle group (same active/inactive
  // visual pattern as .f-mode-btn-group's Direct/Auto Rotation/Chore Bin
  // buttons) in all four places it appears: the create-chore modal, the
  // edit-chore modal, and the Routine Library's add-item/edit-item forms.
  // Renders a hidden `<input type="checkbox" class="${inputClass}">`
  // alongside the two buttons so every existing read site (box.querySelector
  // (".f-no-approval").checked, etc.) and the one existing test asserting
  // ".f-no-approval" exists keep working completely unchanged - only the
  // visible control changed, not the underlying field's shape or class name.
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
  // Wires the two buttons rendered by _approvalToggleHtml above - clicking
  // one sets the hidden checkbox's .checked and toggles which button shows
  // "active", same drive-a-hidden-field-from-visible-buttons convention
  // _wireCreateForm's own .f-mode-btn row already uses for assignment mode.
  // Scoped to `scope` (a box or a single .rm-item-row) so the routine
  // list's per-row edit forms, which get rebuilt on every render, can
  // re-wire just their own row without touching any other row's buttons.
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
  // v1.132.55+: household ask, verbatim - "if a kid starts a clean room
  // for 30 minutes task they should get an alarm at the main kiosk, but if
  // they have siblings the siblings don't need that alarm. But maybe
  // parents want alarms to trigger everywhere." Same visual convention as
  // _approvalToggleHtml above (a hidden field driven by a row of buttons),
  // but three options instead of two, since there are three tiers - see
  // const.py's CHORE_KEY_ALARM_AUDIENCE. The hidden field is a plain text
  // input (not a checkbox) since the value itself is a 3-way string, not a
  // boolean.
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
  // Wires the three buttons rendered by _alarmAudienceToggleHtml above -
  // same drive-a-hidden-field-from-visible-buttons convention as
  // _wireApprovalToggle.
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
  // Same PERMISSION_VERIFY-or-PERMISSION_COMPLETE_ANY tier family-hub-
  // goals-card.js's own _canLogForOthers uses - lets a non-assignee log
  // progress on someone else's embedded goal, mirroring the same grant
  // ws_complete_chore/ws_log_goal_progress already accept server-side.
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
    // v200+: household report, verbatim - "the confetti animation is still
    // not working." Root cause: choresConfettiOnComplete is a schema-free
    // Settings key with no backend-side default at all (see
    // _confettiOnCompleteEnabled's own comment) - the ONLY place "defaults
    // to on" was ever actually implemented was family-week-calendar-card.js's
    // own local `defaults` object (used to build ITS OWN Settings-modal
    // form), which only ever takes effect once someone opens that modal and
    // hits Save, persisting the key to the shared settings blob for the
    // first time. Until that happens, family_hub/get_settings keeps
    // returning a blob with no choresConfettiOnComplete key at all, and
    // THIS card's own _defaultSettings() (used to fill in whatever the raw
    // blob leaves out - see _fetchSettings) never listed it either, so the
    // merged result was undefined/falsy here even though the calendar
    // card's Settings modal would have shown the toggle as "On." Added
    // here too, matching the calendar card's own default, so a household
    // that has never (re-)saved Settings since the "turn it on by default"
    // change actually gets confetti by default, not just once someone
    // happens to open and save that one settings screen.
    return { theme: this._defaultTheme(), useGlobalTheme: true, globalThemeId: "liquidglass", choresConfettiOnComplete: true };
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
    // v1.110.4+: goalsShowInChores can change out from under a card that's
    // already on screen (someone flips it in Settings and Saves without
    // reloading the dashboard) - keep the FAB coordinator's picture of
    // "does this card currently offer a Goal tab" in sync so the
    // standalone Goals card's own FAB-suppression decision stays correct.
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
  async _fetchChores() {
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/chores/list" });
      this._chores = (result && Array.isArray(result.chores)) ? result.chores : [];
    } catch (e) {
      this._chores = [];
    }
    this._render();
  }
  // v127+: fetched for EVERY user, not just admins - family_hub/
  // permissions/get_mine is open to any authenticated household member and
  // returns only the caller's own resolved grants, unlike the admin-only
  // family_hub/permissions/get (the whole store, used only by the
  // Permissions tab UI on the calendar card's own Settings). Before this
  // existed, a permission granted to a non-admin (can_verify,
  // can_add_rewards, ...) had no way to ever show up as usable UI on
  // THEIR OWN card instance, since the old fetch only ever ran when
  // hass.user.is_admin was already true.

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
  async _startChoreTimer(choreId) {
    if (!choreId || !this._hass) return;
    try {
      await this._hass.connection.sendMessagePromise(
        this._kioskMsg({ type: "family_hub/timers/start_chore", chore_id: choreId, client_id: this._familyHubClientId() })
      );
    } catch (e) {
      // Surfaced rather than swallowed - the realistic failures here are
      // "you've already got a chore timer running" and "that's not your
      // chore," both of which the person needs to be told about.
      window.alert((e && e.message) || "Couldn't start that timer.");
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
  // Powers the optional Rewards column (see _showRewardsColumn/
  // _rewardsColumnHtml below) - same family_hub/rewards/get_state call
  // family-hub-rewards-card.js polls, so both stay in sync with each
  // other. Only fetched when the column is actually showing, same "don't
  // pay for a feature nobody turned on" principle as the Grocy trackers.
  async _fetchRewardsState() {
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/rewards/get_state" });
      this._balances = (result && result.balances) || {};
      this._catalog = (result && result.catalog) || [];
    } catch (e) {
      /* keep whatever we had */
    }
    this._render();
  }
  // routinesEnabled is the per-household on/off switch for the whole
  // Routines feature (see const.py's SETTINGS_KEY_ROUTINES_ENABLED and the
  // household's own choice of a single household-wide toggle over a per-
  // person one, set from the calendar card's Settings -> General tab) -
  // same schema-free Settings blob as choresShowRewardsColumn just below,
  // and the same "don't fetch/render/poll a feature nobody turned on"
  // principle as the Rewards column.
  _routinesEnabled() {
    return !!(this._settingsCache && this._settingsCache.routinesEnabled);
  }
  // v134+: goalsShowInChores, same household-wide Settings-toggle shape as
  // routinesEnabled just above (see const.py's SETTINGS_KEY_GOALS_IN_CHORES) -
  // set from the calendar card's Settings -> General tab, off by default.
  _goalsInChoresEnabled() {
    return !!(this._settingsCache && this._settingsCache.goalsShowInChores);
  }
  // Powers the per-person Goals block (see _goalsBlockHtml) - one flat list
  // for the whole household, filtered client-side per person, same pattern
  // _fetchRoutines uses just below. Shares the exact same family_hub/
  // goals/list command the standalone family-hub-goals-card.js polls, so
  // both stay in sync with each other.
  async _fetchGoals() {
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/goals/list" });
      this._goals = (result && Array.isArray(result.goals)) ? result.goals : [];
    } catch (e) {
      /* keep whatever we had */
    }
    this._render();
  }
  // Powers the per-person Morning/Afternoon/Night accordions rendered into
  // each user's own column (see _routinesBlockHtml) - one flat list for
  // the whole household, filtered client-side per person/category rather
  // than one fetch per accordion row.
  async _fetchRoutines() {
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/routines/list" });
      this._routineItems = (result && Array.isArray(result.items)) ? result.items : [];
    } catch (e) {
      this._routineItems = [];
    }
    this._render();
  }
  // choresShowRewardsColumn lives on the same schema-free Settings blob as
  // everything else (see _fetchSettings) - opt-in/off by default, admin-
  // togglable via the header button (_toggleRewardsColumn), same
  // household-wide-not-per-device scope as every other Settings field.
  _showRewardsColumn() {
    return !!(this._settingsCache && this._settingsCache.choresShowRewardsColumn);
  }
  // v189+: household ask, verbatim - "Confetti pop when chore complete.
  // Add to chore settings to display a confetti pop animation on chore
  // completion." choresConfettiOnComplete lives on the same schema-free
  // Settings blob as choresShowRewardsColumn/routinesEnabled/goalsShow
  // InChores just above/below - household-wide, off by default, set from
  // the calendar card's own Settings -> General tab ("Confetti when a
  // chore is completed"). Purely a frontend display concern (same as
  // choreDueShowTime right next to it in that same tab) - the backend
  // never reads this key at all, so there's no const.py constant for it,
  // matching that field's own precedent.
  _confettiOnCompleteEnabled() {
    return !!(this._settingsCache && this._settingsCache.choresConfettiOnComplete);
  }
  // v190.1+: household report, verbatim - "the confetti animation doesn't
  // seem to work in home assistant app on my android phone." Root cause:
  // this used to append the overlay to `this._root` (the card's OWN
  // shadow root) and rely on `position: fixed` to cover the whole
  // screen. That only works if nothing between the shadow host and the
  // viewport creates its own CSS "containing block" (a `transform`,
  // `filter`, `perspective`, or `contain` on an ancestor) - a `position:
  // fixed` descendant of one of those is fixed to THAT ancestor's box
  // instead of the real viewport, and gets clipped to it if that
  // ancestor (or anything between it and the fixed element) also has
  // `overflow: hidden`. The official Home Assistant Android app's
  // dashboard/card grid does exactly this for its own panel/swipe
  // transitions, which is why a wall tablet's own browser/kiosk view can
  // look fine while the same card inside the Android app doesn't - this
  // project already hit the identical class of bug once before, for the
  // Grocy Recipe Viewer's full-screen modal (see _grocyViewerOverlay's
  // own "escapes the shadow root/dashboard grid" comment) and fixed it
  // the same way: build the whole thing as its own top-level "portal"
  // element appended straight to `document.body`, completely outside the
  // card's shadow root AND outside the dashboard grid's own DOM subtree,
  // so `position: fixed` has nothing above it to be contained by. Shadow
  // DOM encapsulation means the card's own `_css()` rules no longer reach
  // an element outside the shadow root at all, so the portal carries its
  // own tiny inline <style> (_confettiCss()) - the confetti CSS never
  // referenced any card/theme custom properties to begin with (all
  // colors are plain hex), so nothing else needs to come along with it.
  //
  // Otherwise unchanged from v189: plain vanilla-JS/CSS, no external
  // library/CDN (a custom Lovelace card resource has to work fully
  // offline on a wall tablet); self-removing after the longest piece's
  // own animation finishes, so nothing needs to track/cancel it elsewhere
  // in the common case (a second chore completed mid-burst just gets its
  // own independent overlay stacked on top). This card's
  // disconnectedCallback additionally force-removes any portals still
  // pending (tracked in this._confettiPortals) so a card that gets torn
  // down mid-animation - a dashboard edit, navigating away - never leaves
  // an orphaned full-screen overlay sitting on the page.
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
  // Reads a fresh copy of the settings blob right before writing, rather
  // than trusting this card's own (possibly long-stale - nothing here
  // polls Settings) this._settingsCache, to keep the window for stomping a
  // concurrent edit from the calendar card's own Settings modal as small
  // as possible. This is the first of these lightweight companion cards
  // (chores/rewards/my-chores) to ever write Settings - every other field
  // here is read-only from this card's point of view.
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
      /* no-op - button just stays in its last-known state */
    }
    this._render();
  }
  // Redeeming a reward from the mini Rewards column - named distinctly
  // from _claim(id) just above (chore claiming, an unrelated concept) to
  // avoid any confusion between the two. Mirrors family-hub-rewards-
  // card.js's own _claim(itemId) exactly (same ws command, same
  // affordability precheck isn't needed here since the button is already
  // disabled when unaffordable - see _rewardsCatalogItemHtml).
  async _claimReward(itemId) {
    const statusEl = this._root.querySelector(`.rewards-catalog-item[data-id="${itemId}"] .rewards-claim-status`);
    try {
      await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/rewards/redeem", item_id: itemId }));
      await this._fetchRewardsState();
    } catch (e) {
      if (statusEl) statusEl.textContent = "Not enough stars yet.";
    }
  }
  // memberUserIds lives on the Settings blob (see const.py's
  // SETTINGS_KEY_MEMBER_USER_IDS) - _fetchSettings already pulls the whole
  // blob in for theming, so it just rides along on this._settingsCache
  // rather than needing its own fetch. Opt-IN, unlike the retired
  // choresEnabled toggle this replaces: missing entirely means NOT a
  // member, not the other way around - matching the backend's own
  // treatment in __init__.py's _get_member_user_ids.
  _isFamilyHubMember(userId) {
    const memberIds = (this._settingsCache && this._settingsCache.memberUserIds) || [];
    return memberIds.includes(userId);
  }
  // v121+: a second, narrower opt-out UNDER Family Hub membership - see
  // const.py's own "v121+" docstring right after SETTINGS_KEY_MEMBER_USER_IDS
  // for the full picture. A member with userProfiles[id].includeInChores
  // explicitly set to false is still a real Family Hub member everywhere
  // else (Permissions tab, Routines, notifications) - just not eligible for
  // a board column, a Rewards balance, or a new chore assignment. Defaults
  // to included whenever the flag is missing, same as every other profile
  // field.
  _isChoresIncluded(userId) {
    if (!this._isFamilyHubMember(userId)) return false;
    const profiles = (this._settingsCache && this._settingsCache.userProfiles) || {};
    const profile = profiles[userId];
    return !profile || profile.includeInChores !== false;
  }
  // Being added to Family Hub AND included in Chores is the gate for the
  // Chores board (see _isChoresIncluded just above): someone who isn't a
  // member, or is a member but excluded from Chores, gets no board column
  // and is never offered as a NEW assignee anywhere - the "Assigned to"
  // dropdown, the rotation-group picker - matching what the backend
  // independently enforces on every chores/* call
  // (chores_websocket_api.py's _make_is_chores_eligible).
  _memberUsers() {
    return this._users.filter((u) => this._isChoresIncluded(u.id));
  }
  _userName(id) {
    if (id === CHORE_BIN_SENTINEL) return "Chore Bin";
    const u = this._users.find((x) => x.id === id);
    return u ? u.name : id || "Unassigned";
  }
  // A person's own custom color (settings.userProfiles[id].color, set on
  // the Users tab of the calendar card's Settings - see
  // _normalizeUserProfiles there) wins when they've set one; otherwise
  // falls back to the automatically assigned palette color, same as
  // before this existed.
  _userColor(id) {
    const profiles = (this._settingsCache && this._settingsCache.userProfiles) || {};
    const custom = profiles[id] && profiles[id].color;
    if (custom) return custom;
    const idx = this._users.findIndex((x) => x.id === id);
    return idx >= 0 ? PALETTE[idx % PALETTE.length] : "#c9c2b3";
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
            <button class="waiting-recur-toggle-btn" title="Show Waiting to Recur as a column" data-i18n-title="chores.waiting_recur_show">&#8635; <span class="waiting-recur-toggle-count"></span></button>
            <button class="rewards-toggle-btn" title="Show/hide the Rewards column" data-i18n-title="chores.rewards_toggle_title" hidden>&#11088;</button>
            <button class="kiosk-login-btn" title="Log in as a specific household member on this kiosk display" data-i18n-title="chores.kiosk_login_title" hidden>&#128274; <span data-i18n="chores.login">Login</span></button>
          </div>
        </div>
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
    // A fixed round + button in the bottom-right corner, matching
    // family-week-calendar-card.js's own add-event-fab pixel-for-pixel
    // (same size/position/colors) rather than the old plain "+ Add Chore"
    // text button that used to live in the header - the household asked
    // for this card to look "in line with how the calendar works". Lives
    // as a *sibling* of <ha-card>, not nested inside it, for the same
    // reason add-event-fab does: this card's own <ha-card> sets
    // overflow:hidden (needed to contain the board's scrolling), which
    // traps any position:fixed descendant to <ha-card>'s own box instead
    // of the real viewport corner - a sibling escapes that and anchors to
    // the true viewport like the calendar card's FAB already does.
    root.querySelector(".add-chore-fab").addEventListener("click", () => this._openCreateModal());
    root.querySelector(".rewards-toggle-btn").addEventListener("click", () => this._toggleRewardsColumn());
    root.querySelector(".waiting-recur-toggle-btn").addEventListener("click", () => this._toggleWaitingToRecurCollapsed());
    root.querySelectorAll(".modal-overlay").forEach((ov) => {
      ov.addEventListener("click", (e) => {
        if (e.target === ov) ov.classList.remove("open");
      });
    });
    root.querySelector(".board").addEventListener("click", (e) => this._onBoardClick(e));
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
    // window.__familyHubKioskSession itself (bound once, at the document
    // level, the first time anyone logs in - see its own bindActivity) so
    // activity on ANY kiosk-login-bearing card resets the ONE shared idle
    // clock, not just activity on this card's own root. No per-card
    // listener needed here anymore.
  }

  _onBoardClick(e) {
    // v1.110.0+: timer controls first - both live inside .chore-actions
    // alongside Done/Nudge, so they have to be claimed before the more
    // general handlers below get a look.
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
    // Edit jumps into the FAB modal's Routine tab pre-scoped to this item
    // (see _openRoutineManageModal) - checked/deleted are still handled
    // right here on the board, same as before.
    if (routineEditBtn) return this._openRoutineManageModal(routineEditBtn.dataset.id);
    if (routineDeleteBtn) return this._deleteRoutineItem(routineDeleteBtn.dataset.id);
    // Checked before routineHeader so tapping the checkbox itself (which
    // sits inside a row that also has a header) toggles the item instead
    // of also being interpreted as an accordion collapse - the checkbox is
    // its own element, not inside .routine-row-header, so in practice these
    // never both match the same click, but ordering it first keeps that
    // guarantee explicit rather than incidental.
    if (routineCheck) return this._toggleRoutineItem(routineCheck.dataset.id, routineCheck.checked);
    if (routineApproveBtn) return this._approveRoutineItem(routineApproveBtn.dataset.id);
    if (routineHeader) return this._toggleRoutineSection(routineHeader.dataset.user, routineHeader.dataset.category);
    if (completedHeader) return this._toggleCompletedSection(completedHeader.dataset.col);
    // Kanban-style "click the card for details" - falls through to here
    // only when the click landed on the card itself (or plain, non-button
    // content inside it, e.g. the title/meta row) rather than one of the
    // action buttons above, each of which already returned early. Every
    // .chore-card everywhere (a person's column, the Chore Bin, Waiting to
    // Recur) is eligible - see _openChoreDetailModal.
    const choreCard = e.target.closest(".chore-card");
    if (choreCard) return this._openChoreDetailModal(choreCard.dataset.id);
  }

  async _nudge(id) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/chores/nudge", chore_id: id });
    } catch (e) {
      /* best-effort */
    }
  }
  async _complete(id) {
    try {
      await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/chores/complete", chore_id: id }));
      // v189+: fire right after the server confirms the tap actually went
      // through (never on a failed/rejected call, and never speculatively
      // before awaiting) - see _fireConfetti/_confettiOnCompleteEnabled.
      // Fires for every successful complete tap, including a quantity
      // chore's non-final units ("2 of 3 loads done") - each tap earned
      // its own little celebration, not just the batch's last one.
      if (this._confettiOnCompleteEnabled()) this._fireConfetti();
      await this._fetchChores();
    } catch (e) {
      /* server already reports the reason via send_error; nothing actionable client-side beyond refreshing */
    }
  }
  async _approve(id) {
    try {
      await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/chores/approve", chore_id: id }));
      await this._fetchChores();
    } catch (e) {
      /* no-op */
    }
  }
  // v144.13+: was an optional, skippable window.prompt() for a short note
  // (see const.py's CHORE_KEY_REJECT_REASON docstring on why it's worth
  // having: a silent bounce-back leaves the assignee guessing what was
  // wrong) - replaced with a proper modal (household's own "send back
  // reason should be a modal" request), same _openRejectModal/_submitReject
  // shape used for _rejectGoal right below and for the standalone
  // family-hub-goals-card.js's own reject flow. A cancelled modal now
  // genuinely cancels the whole action - the old window.prompt() sent the
  // reject through with an empty reason even on Cancel/Esc, since a native
  // prompt can't tell "Cancel the reason" apart from "Cancel the reject."
  _reject(id) {
    this._openRejectModal(id, "chore");
  }
  _openRejectModal(id, kind) {
    const item = kind === "goal" ? this._goals.find((g) => g.id === id) : this._chores.find((c) => c.id === id);
    if (!item) return;
    const overlay = this._root.querySelector(".reject-modal");
    const box = overlay.querySelector(".modal-box");
    box.innerHTML = `
      <button type="button" class="modal-close reject-modal-close" aria-label="Close">&#10005;</button>
      <h2>Send back "${this._esc(item.title)}"</h2>
      <div class="field"><label>Anything you want to tell them about why? (optional)</label><textarea class="f-reject-reason" rows="3" placeholder="Not quite - try again"></textarea></div>
      <div class="modal-actions">
        <button class="cancel-btn">Cancel</button>
        <button class="save-btn">Send back</button>
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
        /* no-op */
      }
      return;
    }
    try {
      await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/chores/reject", chore_id: id, reason }));
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
  async _assign(id, target) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/chores/assign", chore_id: id, target });
      await this._fetchChores();
    } catch (e) {
      /* no-op */
    }
  }

  // Only Family Hub members get a standing column - "those are the only
  // ones that show up in the chore chart" (the household's own words). The
  // one deliberate exception: someone who was just removed from Family Hub
  // but still has a chore sitting open/pending_verification against them
  // keeps their column until that chore is resolved, so a removed person's
  // existing work (left alone on purpose - not force-reassigned, see
  // const.py) never silently disappears from view instead of just no
  // longer collecting new ones.
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

  // A recurring chore doesn't just sit in its assignee's column once it's
  // done - it moves HERE instead, into a dedicated always-visible column,
  // the moment it's approved (see _render()'s own per-person item filter
  // just below, which excludes anything this returns true for). "Done and
  // waiting to come back" is a meaningfully different state from "still
  // assigned to someone, go look at their column" - and an easy-to-miss
  // faded "&#10003; Done" card buried in whoever last did it was exactly
  // the household's own complaint this column exists to fix. Recurs on a
  // plain schedule (recur_type - see chore_engine.py's CHORE_RECUR_TYPE_*)
  // OR via a sensor automation (auto_create_trigger, pre-existing) OR
  // both; either one alone is enough to land a chore here.
  _isWaitingToRecur(chore) {
    return chore.status === "approved" && !!(chore.recur_type || chore.auto_create_trigger);
  }
  // A one-off approved chore stays visible (in the per-column Completed
  // accordion, see _completedChoresAccordionHtml) for 7 days after
  // approval, then quietly drops off the board entirely - "disappears
  // from the accordion after 7 days" per the household's own request.
  // Based on approved_at (when chore_engine.approve_chore actually set the
  // final status - or complete_chore's own auto-approve shortcut, same
  // field either way), not completed_at/created_at, since that's the
  // moment "done" actually became final.
  _choreApprovedWithinDays(chore, days) {
    if (!chore.approved_at) return false;
    const at = new Date(chore.approved_at).getTime();
    if (Number.isNaN(at)) return false;
    return Date.now() - at <= days * 24 * 60 * 60 * 1000;
  }
  _completedChoresAccordionHtml(colId, completedItems) {
    if (!completedItems.length) return "";
    const open = this._openCompletedSections.has(colId);
    // Most-recently-approved first - the opposite of the main column's
    // due-date ordering, since there's no "what's next" question here,
    // just "what did we just finish."
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
  // v185+: household ask, verbatim - "Better chore scheduling so you can
  // choose things like every third Wednesday or the first weekend of every
  // month." recur_month_nth (1-4 or -1 for "last") + recur_weekdays (one or
  // more weekdays - see chore_engine._nth_weekday_of_month's own comment)
  // together describe a monthly_nth chore's schedule; {Sat, Sun} at nth=1
  // gets its own friendlier "The 1st weekend" phrasing since that's the
  // household's own named example, rather than reading as "The 1st Sat/Sun."
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
      // v187+: household ask, verbatim - "chore scheduling needs some more
      // work potentially want to do every 2 months or every 3 months,
      // every 4th week or 7th week, every other day etc." recur_interval_
      // unit (missing on any chore saved before this existed) defaults to
      // "days" - the exact meaning "interval" always had before this
      // feature, so old chores read identically to how they always did.
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
    // recur_next_due only ever exists for a plain-schedule (recur_type)
    // chore - a purely sensor-triggered one has no predictable date, so it
    // just says it's waiting on the trigger instead of a next-due date it
    // can't actually know.
    const nextDateStr = chore.recur_next_due ? new Date(chore.recur_next_due).toLocaleDateString() : "";
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
  // Always INCLUDED (this data is never opt-in, unlike the Rewards
  // column), but how it's DISPLAYED is a per-device, space-saving choice -
  // full column (the original behavior, and still the default) or
  // collapsed into a single header-bar button on a smaller screen where a
  // whole extra column is a lot to spend on something that's often empty.
  // A plain localStorage flag rather than a Settings field on purpose: two
  // people looking at the same household's board on different devices (a
  // wall tablet vs. a phone) reasonably want different answers here, and
  // unlike e.g. choresShowRewardsColumn this never changes what data
  // exists, only how much room this one device gives it - see
  // _waitingToRecurColumnHtml/the .waiting-recur-toggle-btn wiring in
  // _render() for the two display modes.
  _waitingToRecurCollapsed() {
    try {
      return window.localStorage.getItem("familyHubChoresWaitingToRecurBar") === "on";
    } catch (e) {
      return false;
    }
  }
  _toggleWaitingToRecurCollapsed() {
    const next = !this._waitingToRecurCollapsed();
    try {
      window.localStorage.setItem("familyHubChoresWaitingToRecurBar", next ? "on" : "off");
    } catch (e) {
      /* no-op - this device just won't remember the choice across reloads */
    }
    this._render();
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

  // Embedded mini Rewards card - balance per member plus the full
  // browsable/claimable catalog, so a household running this board full-
  // screen doesn't need a second, separate Rewards card just to see/spend
  // stars. Same member-filtering as the balances grid on family-hub-
  // rewards-card.js (only people actually added to Family Hub, not every
  // real HA login - see the household's own request that Rewards match
  // who shows up on the Chores board).
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
      <div class="chore-column rewards-column">
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

  // --- Routines: per-person Morning/Afternoon/Night daily checklists,
  // rendered as collapsible accordion rows at the top of each person's own
  // column (never the Chore Bin/Waiting to Recur/Rewards columns - see
  // _render()'s `col.id !== CHORE_BIN_SENTINEL` guard). Deliberately
  // separate data/UI from Chores below it in this same column - no stars,
  // no verification, no assignment - just "did I do this today", reset
  // back to unchecked every local midnight by the backend (see
  // routine_engine.maybe_reset_daily). Only ever rendered at all when
  // _routinesEnabled() (the household-wide Settings toggle).
  //
  // v136+: items are managed (added/edited/deleted) exclusively from the
  // Routine tab of the "+" FAB modal now (see _routineManageState/
  // _renderRoutineManagePane below) - the board itself went from an
  // always-editable inline "Add item" input+button to a read-only-except-
  // checkbox display of card-style items (_routineItemCardHtml), each
  // optionally carrying a due time and/or specific days of the week (see
  // routine_engine.py's due_time/days_of_week). Because of days_of_week,
  // the board's own item list (_routineItemsFor) is filtered down to just
  // today's applicable items - an item scheduled for "Sat, Sun" simply
  // doesn't appear on the board Monday through Friday - while the FAB
  // modal's management list (_routineItemsForManage) deliberately shows
  // everything regardless of day, since you need to be able to find and
  // edit a Tue-only item on a Monday.
  //
  // Weekday numbering note: routine_engine.py's days_of_week uses Python's
  // date.weekday() convention (Monday=0..Sunday=6), NOT JS's own
  // Date#getDay() (Sunday=0..Saturday=6) - _jsDayToBackendDay converts
  // between the two everywhere this card touches a day-of-week number.
  // Conveniently this is the exact same Monday=0..Sunday=6 convention the
  // existing WEEKDAY_LABELS/recur_weekdays fields already use (see the
  // comment above WEEKDAY_LABELS's own definition), so routine day-of-week
  // badges/toggles reuse WEEKDAY_LABELS directly rather than needing a
  // second parallel constant.
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
  // Unfiltered by day - powers the manage list in the Routine tab (see
  // _renderRoutineManagePane) where the point is finding/editing an item
  // regardless of which days it's scheduled for. Sorted the same way as
  // the board (_routineSortCompare) so drag-reordering here and what the
  // board actually shows always agree.
  _routineItemsForManage(userId, category) {
    return this._routineItems
      .filter((it) => it.user_id === userId && it.category === category)
      .sort((a, b) => this._routineSortCompare(a, b));
  }
  // "7:30 AM" from a stored "07:30" (24h HH:MM, see routine_engine.py's
  // _DUE_TIME_RE) - kept deliberately simple (no Intl/locale formatting)
  // to match this file's existing due-date formatting elsewhere
  // (_choreCardHtml just uses toLocaleDateString for the date part; time-
  // of-day here is common enough - "get up by 7", "lights out by 8:30" -
  // that a plain 12-hour rendering reads better on a kitchen tablet than
  // a 24-hour one).
  _formatDueTime(hhmm) {
    const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${period}`;
  }
  // v211+: household ask, verbatim - "allow routine blocks to be drug
  // around and ordered in the routine modal, default is routine items with
  // time are sorted by when their time is." Minutes since midnight, for
  // comparing two due_time strings numerically.
  _routineDueTimeMinutes(hhmm) {
    const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
    return h * 60 + m;
  }
  // The comparator both _routineItemsFor (board) and _routineItemsForManage
  // (the Routine tab's manage list, where dragging actually happens) sort
  // by, so the board and the manage modal always agree on order. Two
  // regimes, checked in order:
  //   1) Manual (sort_order set, via reorder_items/the drag UI below) -
  //      sorted numerically by sort_order. Once ANY item in a person's
  //      category has been dragged, the backend stamps sort_order on
  //      every item in that section (see routine_engine.reorder_items), so
  //      this branch fully governs that section from then on - it's a
  //      full override of the time-based default, not a tiebreaker.
  //   2) Default (sort_order still null - a section nobody has dragged
  //      yet) - items with a due_time sort chronologically first, items
  //      with no due_time follow in whatever order the backend returned
  //      them (their original array position, since Array#sort is stable).
  // The one edge case - a manually-ordered item next to a stray unordered
  // one - shouldn't normally happen (reorder_items always stamps the whole
  // section at once), but is handled sanely anyway: manually-placed items
  // always sort first, ahead of anything still unordered.
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
    // v141+: stars for completing a routine item (routine_engine.py's
    // star_value/no_approval_required) - most items still show nothing
    // here, same as before this existed. "Awaiting approval" only shows
    // once it's actually pending (checked, star_value set, and
    // no_approval_required is false) - see toggle_item's own docstring.
    const starsBadge = item.star_value
      ? `<span class="routine-item-stars">&#11088; ${item.star_value}${item.pending_approval ? ` - ${this._t("chores.awaiting_approval", "awaiting approval")}` : ""}</span>`
      : "";
    const meta = dueBadge || daysBadge || starsBadge ? `<div class="routine-item-meta">${dueBadge}${daysBadge}${starsBadge}</div>` : "";
    // Editing/removing an item is an admin/assign-permission action
    // (matches the server's own _can_write_routine_items gate on
    // family_hub/routines/update and /delete - see chores_websocket_api.py);
    // checking it off is not (see _toggleRoutineItem/ws_toggle_routine_item)
    // - same split as the rest of this card's canAssign() gating.
    // v1.132.47+: household ask, verbatim - "Need a permission to add/
    // delete routines both add/delete self and all so someone can't modify
    // others" - was plain _canAssign(), now _canManageRoutinesFor(item.
    // user_id) so a can_manage_own_routines/can_manage_any_routines holder
    // (without can_assign) also sees these buttons for the sections they're
    // allowed to touch. Edit jumps straight into the FAB modal's Routine
    // tab, pre-scoped to this exact item (see _openRoutineManageModal).
    // Approving a pending star, like approving a chore, needs _canVerify()
    // specifically (PERMISSION_VERIFY or a real admin) - the same tier that
    // approves chore completions.
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
      // Splitting into Active/Completed sub-lists (rather than one flat
      // list with strikethrough) matches the household's own mockup for
      // this feature - a checked-off item visibly moves out of the way
      // instead of just staying in place looking crossed out.
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
  // v134+: a compact per-person Goals block, only ever rendered when
  // goalsShowInChores is on (see _goalsInChoresEnabled). Deliberately a
  // condensed view compared to the standalone family-hub-goals-card.js -
  // progress + the same Log Progress/Approve/Send Back actions, but no
  // reward-catalog lookup (this card doesn't otherwise fetch the Rewards
  // catalog unless the separate Rewards column is also on) and no Edit/
  // Delete (still only ever done from the standalone Goals card or this
  // card's own + button - see _openCreateModal's Goal tab).
  _goalsBlockHtml(userId) {
    if (!this._goalsInChoresEnabled()) return "";
    // v144.15+: archived goals (the household hit "Complete" on them, see
    // _archiveGoal/goal-complete-btn below) are deliberately left out of
    // this embedded block entirely, same as _myGoals() already does on the
    // standalone family-hub-goals-card.js - there's no room for a
    // Completed accordion in this condensed per-person view, so
    // "Complete" here just means "hide it," matching the household's own
    // framing of the request.
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
      // v144.15+: household report - achieved goals had no way to
      // complete/hide them from this embedded block either (only the
      // standalone Goals card got this in v144.13) - same permission as
      // there: the assignee themselves, or whoever can otherwise manage
      // goals (can_assign/admin, via _canAssign()).
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
  // v144.13+: same window.prompt() -> modal conversion as chore _reject
  // above - see that method's own comment. Shares the exact same
  // .reject-modal/_openRejectModal/_submitReject machinery, just routed to
  // the goals ws commands via kind === "goal".
  _rejectGoal(id) {
    this._openRejectModal(id, "goal");
  }
  // v144.15+: same family_hub/goals/archive ws command + no-reward-side-
  // effects contract as family-hub-goals-card.js's own _archive - see that
  // method's comment. Just re-fetches goals afterward, which drops the
  // now-archived goal out of _goalsBlockHtml's filter above.
  async _archiveGoal(id) {
    try {
      await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/goals/archive", goal_id: id }));
      // v1.132.37+: household ask, verbatim - "Confetti for completing
      // chores, can we also apply it to goals and when you complete all
      // tasks in a routine." Reuses the exact same choresConfettiOnComplete
      // setting/_fireConfetti machinery chore completion already uses (see
      // _complete above) rather than a new toggle - one household-wide "on/
      // off" for every kind of completion celebration this card can show.
      // Fires on "Complete" (archiving an already-approved goal), not on
      // reaching the goal's target or on approval - that's the moment with
      // its own literal "Complete" button, closest to a chore's Complete
      // tap.
      if (this._confettiOnCompleteEnabled()) this._fireConfetti();
    } catch (e) {
      /* no-op */
    }
    await this._fetchGoals();
  }
  async _toggleRoutineSection(userId, category) {
    const key = `${userId}:${category}`;
    if (this._openRoutineSections.has(key)) this._openRoutineSections.delete(key);
    else this._openRoutineSections.add(key);
    this._render();
  }
  // v1.132.37+: household ask, verbatim - "Confetti for completing chores,
  // can we also apply it to goals and when you complete all tasks in a
  // routine." Unlike a chore (one tap = one celebration, even for a
  // quantity chore's non-final units - see _complete's own comment),
  // firing per-item here would mean a burst on every single routine item
  // (brush teeth, get dressed, ...), which is far too frequent to feel
  // special. Instead this fires once, when checking THIS item off leaves
  // every item in its own section (this person's Morning/Afternoon/Night
  // list, i.e. exactly what _routineItemsFor(user_id, category) shows on
  // the board) done - captured as `item` (its user_id/category) BEFORE the
  // toggle call, since a failed toggle must never fire this, and the
  // completeness check itself has to run against the fresh list
  // _fetchRoutines() just pulled, not the stale one from before this
  // toggle. Unchecking an item (done: false) never fires this, even if it
  // happens to leave the section still "complete" in some edge case.
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
      /* no-op - a failed toggle just leaves the item as the server last had it, next poll corrects the checkbox */
    }
  }
  async _approveRoutineItem(itemId) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/routines/approve_item", item_id: itemId });
      await this._fetchRoutines();
    } catch (e) {
      /* server already reports the reason via send_error; next poll/render corrects the board either way */
    }
  }
  async _deleteRoutineItem(itemId) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/routines/delete", item_id: itemId });
      await this._fetchRoutines();
    } catch (e) {
      /* no-op */
    }
  }

  _choreCardHtml(chore) {
    const status = chore.status;
    const isBin = chore.assigned_to === CHORE_BIN_SENTINEL;
    // Quantity-based chores ("3 loads of laundry") - quantity_total is only
    // ever set on a chore created/edited with a count; quantity_remaining
    // can briefly be null right after creation is echoed back over an old
    // cached copy, so it falls back to the full total rather than showing
    // a stale/blank count. See chore_engine.complete_chore for the actual
    // decrement-then-only-verify-on-zero logic this button label reflects.
    const hasQuantity = !!chore.quantity_total;
    const qtyRemaining = hasQuantity
      ? (chore.quantity_remaining == null ? chore.quantity_total : chore.quantity_remaining)
      : null;
    // v1.110.0+: timed chores ("clean for 30 minutes"). A timed chore that
    // isn't running yet offers "Start (30m)" ALONGSIDE Done rather than
    // replacing it - Done still has to work, both because someone may
    // simply finish without using the timer and because the household's
    // own answer on what a timer ending should do was "it's the same as
    // Done." Once running, the Start button becomes a live countdown with
    // a cancel; Done stays available throughout, and tapping it just
    // completes early and drops the timer ("don't fight the user").
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
      actions += `<button class="chore-nudge-btn" data-id="${chore.id}" title="${this._t("chores.nudge", "Nudge")}">&#128276;</button>`;
    } else if (status === "open" && isBin) {
      // v211+: used to be gated to assignment_mode === "first_come_first_
      // served" only, leaving a plain Chore Bin chore admin-drag-only with
      // no self-serve Claim at all - see the ASSIGNMENT_MODES const's own
      // comment. Chore Bin now means "anyone can claim" itself, so any
      // chore actually sitting unassigned in the bin gets the Claim button,
      // whichever of the (now-merged) modes it was created under.
      actions += `<button class="chore-claim-btn" data-id="${chore.id}">${this._t("chores.claim", "Claim")}</button>`;
    } else if (status === "pending_verification") {
      if (this._canVerify()) {
        actions += `<button class="chore-approve-btn" data-id="${chore.id}">${this._t("chores.approve", "Approve")}</button>`;
        actions += `<button class="chore-reject-btn" data-id="${chore.id}" title="${this._t("chores.send_back_title", "Send back - not approved")}">${this._t("chores.reject", "Reject")}</button>`;
      } else actions += `<span class="chore-pending-label">${this._t("chores.awaiting_approval", "Awaiting approval")}</span>`;
    } else if (status === "approved") {
      actions += `<span class="chore-approved-label">&#10003; ${this._t("chores.done", "Done")}</span>`;
    }
    // Editing (title/stars/due date/dependencies/triggers/rotation group)
    // is only ever possible for an open chore - chore_engine.update_chore
    // itself refuses anything past that (pending_verification/approved
    // chores get re-opened via reset_recurring_chore or recreated instead,
    // never edited in place) - and only for whoever has PERMISSION_EDIT_CHORE
    // (v144.4+, split out of PERMISSION_ASSIGN - see _canEditChore's own
    // comment above), the exact same gate family_hub/chores/update enforces
    // server-side (see ws_update_chore in chores_websocket_api.py) - this is
    // a UI convenience matching an existing backend rule, not a new
    // permission of its own.
    if (status === "open" && this._canEditChore()) {
      actions += `<button class="chore-edit-btn" data-id="${chore.id}" title="${this._t("common.edit", "Edit")}">&#9998;</button>`;
    }
    const showDueTime = !!(this._settingsCache && this._settingsCache.choreDueShowTime);
    const dueStr = chore.due_date
      ? showDueTime
        ? new Date(chore.due_date).toLocaleString()
        : new Date(chore.due_date).toLocaleDateString()
      : "";
    const due = dueStr ? `<span class="chore-due">${this._t("chores.due_x", `Due ${dueStr}`, { x: dueStr })}</span>` : "";
    const streak = chore.streak_count > 0 ? `<span class="chore-streak">&#128293; ${chore.streak_count}</span>` : "";
    const quantityBadge =
      hasQuantity && status === "open" ? `<span class="chore-quantity">${qtyRemaining}/${chore.quantity_total}</span>` : "";
    // v128+: a small "sent back" flag while this chore sits open again
    // after chore_engine.reject_chore - rejected_by/rejected_at/reject_reason
    // are only ever set by a reject (see const.py's CHORE_KEY_REJECT_REASON
    // docstring) and only cleared once the redo is finally approved, so
    // this only shows during the redo window, never on a chore that's
    // simply open for the first time.
    const sentBack = status === "open" && chore.rejected_by ? `<span class="chore-rejected-badge" title="${this._esc(chore.reject_reason || this._t("chores.send_back_title", "Sent back - not approved"))}">&#8617; ${this._t("chores.sent_back", "Sent back")}</span>` : "";
    // v184+: household ask, verbatim - "Ability to Mark Chores Important.
    // Chore will have a red ! denoting importance, they always go to the
    // top of the list." The "always go to the top" half lives in
    // _sortChoresForColumn; this is just the visual marker.
    const importantBadge = chore.important ? `<span class="chore-important-badge" title="${this._t("chores.important", "Important")}">&#10071;</span>` : "";
    return `
      <div class="chore-card status-${status}${chore.important ? " chore-important" : ""}" draggable="${this._canAssign() && status === "open" ? "true" : "false"}" data-id="${chore.id}">
        <div class="chore-title">${importantBadge}${this._esc(chore.title)}</div>
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

  // --- Chore detail modal (kanban-card "click for more info") ---
  // Read-only info view, opened by clicking anywhere on a .chore-card that
  // isn't one of its own action buttons (see _onBoardClick). Shows
  // everything the board card itself doesn't have room for - most
  // importantly the free-text Notes field (see chore_engine.py's "notes",
  // v123+), plus due date/streak/recurrence/dependencies all in one place
  // instead of scattered across small badges. Offers an Edit button
  // (same permission/status gate as the board's own pencil icon - see
  // _choreCardHtml) rather than duplicating every action button (Done/
  // Approve/Claim/Nudge) in here too, keeping this a details view rather
  // than a second copy of the board card.
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
    const due = chore.due_date ? new Date(chore.due_date).toLocaleString() : "";
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
        <button type="button" class="detail-close-btn" title="Close">&#10005;</button>
      </div>
      <h3 class="detail-title">${this._esc(chore.title)}</h3>
      <div class="detail-row">
        <span class="detail-assignee-dot" style="background:${assigneeColor}"></span>
        <span>${this._esc(assigneeName)}</span>
      </div>
      <div class="detail-stats">
        <span class="detail-stat">&#11088; ${chore.star_value || 0} star${chore.star_value === 1 ? "" : "s"}</span>
        ${due ? `<span class="detail-stat">&#128197; Due ${this._esc(due)}</span>` : ""}
        ${chore.overdue_penalty ? `<span class="detail-stat">&#9888; -${chore.overdue_penalty} if overdue</span>` : ""}
        ${chore.streak_count > 0 ? `<span class="detail-stat">&#128293; ${chore.streak_count} streak</span>` : ""}
        ${chore.quantity_total ? `<span class="detail-stat">&#128203; ${chore.quantity_remaining == null ? chore.quantity_total : chore.quantity_remaining}/${chore.quantity_total} left</span>` : ""}
      </div>
      ${recurHtml ? `<div class="detail-recur">&#128260; Recurs: ${recurHtml}</div>` : ""}
      ${deps.length ? `<div class="detail-section-label">Waiting on</div><div class="detail-deps">${deps.join("")}</div>` : ""}
      ${
        // v128+: full feedback for a chore currently sitting in its
        // reject_chore redo window - see const.py's CHORE_KEY_REJECT_REASON
        // docstring. The board card itself only has room for a short
        // "Sent back" badge (see _choreCardHtml); this is where the actual
        // reason (if one was given) is readable in full.
        chore.status === "open" && chore.rejected_by
          ? `<div class="detail-section-label">Sent back</div><div class="detail-rejected-note">${chore.reject_reason ? this._esc(chore.reject_reason) : "No reason given."}</div>`
          : ""
      }
      <div class="detail-section-label">Notes</div>
      <div class="detail-notes ${notes ? "" : "empty"}">${notes ? this._esc(notes) : "No notes added."}</div>
      <div class="modal-actions">
        ${chore.status === "open" && this._canEditChore() ? `<button type="button" class="detail-edit-btn">Edit</button>` : ""}
        ${this._isAdmin() ? `<button type="button" class="detail-delete-btn">Delete</button>` : ""}
        <button type="button" class="detail-close-btn-2">Close</button>
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
    // Admin-only, and deliberately available regardless of status (open,
    // awaiting approval, or already approved) - unlike Edit, which
    // chore_engine.update_chore itself refuses past "open." Deleting a
    // chore stuck pending_verification/approved was previously only
    // possible by hand via a websocket call in devtools; this is the "a
    // way somewhere to edit and delete chores... off the hub" household
    // request - the card never previously offered any way to remove a
    // chore once it left "open", short of a manual websocket call in devtools.
    const deleteBtn = box.querySelector(".detail-delete-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", async () => {
        if (!window.confirm(`Delete "${chore.title}"? This can't be undone.`)) return;
        try {
          await this._hass.connection.sendMessagePromise({ type: "family_hub/chores/delete", chore_id: choreId });
        } catch (e) {
          window.alert((e && e.message) || "Couldn't delete this chore.");
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
  // _esc() alone is only safe inside HTML text content - it never escapes
  // `"`, which text-node serialization has no reason to touch but a
  // `value="..."` attribute absolutely does (an unescaped quote in
  // someone's chore title would truncate the attribute early and leak
  // the rest of their title as raw markup). Only needed by the Edit modal
  // below, which - unlike the Create modal - pre-fills real stored content
  // into attribute values; matches the same `.replace(/"/g, "&quot;")`
  // pattern already used for attribute-bound values elsewhere in this
  // project (see e.g. family-week-calendar-card.js's recipe-chip/category
  // rendering).
  _escAttr(s) {
    return this._esc(s).replace(/"/g, "&quot;");
  }
  // Converts a stored due_date (a UTC ISO string, same as what the Create
  // form's own new Date(dueVal).toISOString() produces) back into the
  // local-time value a <input type="datetime-local"> expects
  // ("YYYY-MM-DDTHH:MM"), so editing a chore shows its actual due date/time
  // in whoever's editing it own local clock, not raw UTC. Mirrors the
  // round-trip direction the Create form already relies on in reverse.
  _isoToLocalDatetimeInputValue(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // Soonest-due-first, same "what needs attention next" ordering whether
  // you're looking at Mom's column or a kid's - a chore with no due_date
  // at all can't be placed on that timeline, so those fall to the back of
  // the due-date group and are instead ordered newest-added-first among
  // themselves (a freshly assigned chore is usually the one someone's
  // about to ask "did you see the new one I added?" about, so it's the
  // one worth surfacing first when nothing's actually overdue/soon).
  // Deliberately a stable sort of a fresh copy (.slice()) - never mutates
  // this._chores itself, so nothing else that iterates that array (drag
  // handlers, other columns, the Waiting to Recur/Rewards columns built
  // separately) is affected by this column's own display order.
  _sortChoresForColumn(items) {
    return items.slice().sort((a, b) => {
      // v184+: household ask, verbatim - "Ability to Mark Chores
      // Important... they always go to the top of the list." Checked
      // FIRST, ahead of due-date/created-at, so an important chore always
      // sorts above every non-important one regardless of how those two
      // would otherwise compare - the due-date/created-at logic below only
      // ever breaks a tie WITHIN the same importance tier.
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
    const columns = this._columns();
    board.innerHTML = columns
      .map((col) => {
        // Excludes anything now sitting in the dedicated Waiting to Recur
        // column (see _isWaitingToRecur) - once a recurring chore is
        // approved it moves there instead of staying visible (faded, easy
        // to miss) in whoever last did it.
        // Split into what's still active (shown in the main scrolling
        // body) and what's already approved (moved into the collapsed
        // "Completed" accordion below it instead of cluttering the main
        // view forever - see _choreApprovedWithinDays/
        // _completedChoresAccordionHtml). A one-off approved chore older
        // than the 7-day window is simply excluded from both - it's not
        // deleted server-side, just no longer shown anywhere on the board
        // (still reachable via chore history/exports if you ever need it).
        const allItems = this._chores.filter((c) => c.assigned_to === col.id && !this._isWaitingToRecur(c));
        const activeItems = this._sortChoresForColumn(allItems.filter((c) => c.status !== "approved"));
        const completedItems = allItems.filter((c) => c.status === "approved" && this._choreApprovedWithinDays(c, 7));
        // Routines never apply to the shared Chore Bin (it isn't a person),
        // so this is skipped there the same way it's skipped for the
        // Waiting to Recur/Rewards columns (those are built separately,
        // outside this per-person map entirely).
        const routinesHtml = col.id !== CHORE_BIN_SENTINEL ? this._routinesBlockHtml(col.id) : "";
        const goalsHtml = col.id !== CHORE_BIN_SENTINEL ? this._goalsBlockHtml(col.id) : "";
        const choresLabel = routinesHtml || goalsHtml ? `<div class="chores-section-label">${this._t("chores.chores_label", "Chores")}</div>` : "";
        return `
          <div class="chore-column" data-col-id="${col.id}">
            <div class="chore-col-header" style="border-color:${col.color}">
              <span class="chore-col-dot" style="background:${col.color}"></span>
              <span>${this._esc(col.name)}</span>
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
      .join("") + (this._waitingToRecurCollapsed() ? "" : this._waitingToRecurColumnHtml()) + (this._showRewardsColumn() ? this._rewardsColumnHtml() : "");

    if (this._canAssign()) this._attachDragHandlers();
    // v1.132.47+: household ask, verbatim - "Need a permission to add/
    // delete routines both add/delete self and all so someone can't modify
    // others." Was plain _canAssign() - broadened to _canManageAnyRoutines()
    // (can_assign OR either new routine permission) so a
    // can_manage_own_routines/can_manage_any_routines holder without
    // can_assign can still reach the FAB at all. Safe to broaden: the
    // Chore and Goal tabs inside the modal this opens have their own,
    // independent server-side PERMISSION_ASSIGN gate (ws_create_chore/
    // ws_create_goal in chores_websocket_api.py) that this change doesn't
    // touch, and _openCreateModal() below now also hides those two tabs
    // client-side for anyone who can only manage routines, so they land
    // straight on the Routine tab instead of a tab they'd get rejected
    // from.
    this._root.querySelector(".add-chore-fab").style.display = this._canManageAnyRoutines() ? "" : "none";
    const rewardsToggleBtn = this._root.querySelector(".rewards-toggle-btn");
    if (rewardsToggleBtn) {
      rewardsToggleBtn.hidden = !this._isAdmin();
      rewardsToggleBtn.classList.toggle("active", this._showRewardsColumn());
      rewardsToggleBtn.title = this._showRewardsColumn() ? this._t("chores.hide_rewards_column", "Hide the Rewards column") : this._t("chores.show_rewards_column", "Show the Rewards column");
    }
    const waitingToggleBtn = this._root.querySelector(".waiting-recur-toggle-btn");
    if (waitingToggleBtn) {
      const collapsed = this._waitingToRecurCollapsed();
      const waitingCount = this._chores.filter((c) => this._isWaitingToRecur(c)).length;
      waitingToggleBtn.classList.toggle("active", collapsed);
      waitingToggleBtn.title = collapsed ? this._t("chores.waiting_recur_show", "Show Waiting to Recur as a column") : this._t("chores.waiting_recur_collapse", "Collapse Waiting to Recur to a button");
      waitingToggleBtn.querySelector(".waiting-recur-toggle-count").textContent = String(waitingCount);
    }
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

  // --- Plain-schedule recurrence fields, shared by the Create and Edit
  // modals (see chore_engine.py's CHORE_RECUR_TYPE_* / recur_next_due for
  // the backend half of this) - a SECOND, independent way for an approved
  // chore to cycle back to open on its own, alongside the pre-existing
  // sensor-driven Auto-create trigger further down in Advanced Settings. A
  // chore can have neither, one, or both; this block only ever touches
  // recur_type/recur_interval_days/recur_weekdays/recur_month_nth, never
  // auto_create_trigger.
  // v185+: household ask, verbatim - "Better chore scheduling so you can
  // choose things like every third Wednesday or the first weekend of every
  // month. Very similar to how Google calendar does it now." Added a third
  // "monthly_nth" schedule alongside the existing every-N-days/specific-
  // weekdays ones - its own nth select (1st/2nd/3rd/4th/last, matching
  // Google Calendar's own "Monthly on the ..." wording) plus a SECOND
  // weekday-toggle row (own class, .f-recur-monthly-weekdays, so it never
  // collides with the plain "weekdays" schedule's own toggles above it -
  // both fields exist in the DOM at once, only one is ever visible). A
  // "First weekend" shortcut button covers the household's own named
  // example in one tap (nth=1st, Sat+Sun) instead of requiring 3 clicks to
  // build the same selection by hand.
  // v1.132.38+: household ask, verbatim (with two screenshots of Google
  // Calendar's own "Does not repeat" dropdown and its "Custom recurrence"
  // dialog) - "we need to make the recur UI like this the additional
  // settings is what you click if you click custom." Before this, every
  // household saw the full "Custom recurrence"-style form (Recurs
  // type/interval/weekday/monthly-nth/due-offset fields, all always
  // visible) up front for every chore, even the vast majority that are
  // just "every day" or "weekly on Tuesday" - matching Google Calendar's
  // OWN pattern instead: a single "Recurs" dropdown with the common cases
  // spelled out in plain English (computed from the chore's own due date,
  // or today if none is set yet - same as Google computing its own labels
  // from the event's date), and a "Custom..." option at the bottom that
  // reveals the exact same detailed form as before, now hidden by default.
  // Deliberately NOT chasing Google's dropdown pixel-for-pixel - there's no
  // "Annually on <date>" here (this app's recurrence schema has no yearly
  // interval at all - see recur_interval_unit's own days/weeks/months-only
  // comment - and nobody's asked for one) and no "Ends" section (chores
  // recur forever; there's no concept of an end date/occurrence count
  // anywhere in chore_engine.py to hang one off of). Picking a plain-
  // English preset silently fills in the SAME hidden recur_type/interval/
  // weekday/month-nth fields the old form always used - _applyRecurFieldsToPayload
  // below is completely unchanged, it just reads whatever's sitting in
  // those fields, preset-picked or hand-customized, exactly as it always
  // has. Picking "Custom..." changes nothing about those fields' current
  // values - it just reveals them, pre-filled with whatever the last
  // preset (or the chore's own saved schedule, on Edit) left there, same
  // as Google Calendar's own Custom dialog opens pre-filled from whatever
  // simple option was showing.
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
    // v187+: household ask, verbatim - "chore scheduling needs some more
    // work potentially want to do every 2 months or every 3 months, every
    // 4th week or 7th week, every other day etc." A unit select alongside
    // the existing count input - "days" (the pre-existing/default
    // meaning, so a chore saved before this feature reads back exactly as
    // it always did), "weeks", "months".
    const intervalUnit = (chore && chore.recur_interval_unit) || "days";
    const intervalUnitOptions = [
      { value: "days", label: "day(s)" },
      { value: "weeks", label: "week(s)" },
      { value: "months", label: "month(s)" },
    ].map((o) => `<option value="${o.value}" ${intervalUnit === o.value ? "selected" : ""}>${o.label}</option>`).join("");
    // Anchor date for the preset dropdown's own dynamic labels ("Weekly on
    // Tuesday") - the chore's own due date when editing one that has one,
    // otherwise today (matches a brand-new chore with no due date picked
    // yet, and matches Google Calendar's own behavior of labeling off
    // "today" until you've actually chosen an event date).
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
      <label>Recurs
        <select class="f-recur-preset" data-anchor-weekday="${anchorInfo.weekday}" data-anchor-nth="${anchorInfo.nth}">${presetOptions}</select>
      </label>
      <div class="field f-recur-custom-panel">
        <label>Custom recurrence
          <select class="f-recur-type">
            <option value="" ${recurType === "" ? "selected" : ""}>Doesn't repeat on its own schedule</option>
            <option value="interval" ${recurType === "interval" ? "selected" : ""}>Every few days/weeks/months</option>
            <option value="weekdays" ${recurType === "weekdays" ? "selected" : ""}>Specific days of the week</option>
            <option value="monthly_nth" ${recurType === "monthly_nth" ? "selected" : ""}>A specific week each month (e.g. the 3rd Wednesday)</option>
          </select>
        </label>
        <label class="f-recur-interval-field">Repeat every <input type="number" class="f-recur-interval" min="1" value="${interval}"> <select class="f-recur-interval-unit">${intervalUnitOptions}</select></label>
        <div class="field f-recur-weekdays-field">
          <label>On these days</label>
          <div class="weekday-btn-row">${weekdayBtns}</div>
        </div>
        <div class="field f-recur-monthly-field">
          <label>Which week<select class="f-recur-month-nth">${nthOptions}</select></label>
          <label>On these days</label>
          <div class="weekday-btn-row">${monthlyWeekdayBtns}</div>
          <button type="button" class="recur-quickpick-btn f-recur-first-weekend">First weekend of the month</button>
        </div>
      </div>
      <label class="f-recur-due-offset-field">Due<select class="f-recur-due-offset">${dueOffsetOptions}</select>after it recurs</label>
    `;
  }
  // Which occurrence-of-the-weekday-in-its-month `date` is (1st/2nd/3rd/
  // 4th), or -1 ("last") for a 5th occurrence - a 5th only ever happens
  // when there's no 6th, so it's unambiguously also the last, and -1 is
  // the only one of the existing recur_month_nth values (1/2/3/4/-1, see
  // the nthOptions just above) that can represent it. Also returns the
  // WEEKDAY_LABELS/recur_weekdays-convention weekday index (Monday=0...
  // Sunday=6) via the same _jsDayToBackendDay helper the Routines feature
  // already uses for its own day-of-week math.
  _recurNthWeekdayInfo(date) {
    const day = date.getDate();
    const rawNth = Math.ceil(day / 7);
    return { nth: rawNth >= 5 ? -1 : rawNth, weekday: this._jsDayToBackendDay(date.getDay()) };
  }
  // Maps a chore's actual saved recur_* fields onto one of the preset
  // dropdown's plain-English options, so editing an existing chore shows
  // "Weekly on Tuesday" (not "Custom...") when that's genuinely what it's
  // set to - only a schedule that doesn't match any of the presets exactly
  // (a 3-day interval, only Tue+Thu of a "weekdays" schedule, an interval
  // in weeks/months, etc.) falls back to "Custom...", which then opens
  // showing that exact schedule, never a blank/reset form.
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
  // Silently fills in the hidden "Custom recurrence" panel's own fields to
  // match a plain-English preset - _applyRecurFieldsToPayload (unchanged)
  // reads those same fields regardless of whether a preset or manual Custom
  // editing put the values there, so nothing downstream needs to know which
  // one happened. No-op for "custom" itself - the panel already holds
  // whatever the last preset (or the chore's own saved schedule) left in
  // it, which is exactly what should show up once revealed.
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
      // Only meaningful for a chore that actually recurs on its own
      // schedule - "due X after it recurs" has nothing to anchor to for a
      // one-off (non-recurring) chore.
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
  // Reads the recur fields into `payload` in place - always sets every
  // recur_* key (never omits one just because a DIFFERENT type is
  // selected) so switching between types on the Edit form actually clears
  // the stale selection server-side too, matching how due_date/triggers
  // are always sent explicitly on _submitEdit rather than only-when-set.
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

  // v131+: "remind me N minutes before this is due" - deliberately the
  // exact same lead-time values/labels as the calendar card's own event-
  // reminder checkboxes (family-week-calendar-card.js's own minutesOptions
  // in _renderEventInfoRemindSection), so a household never has to learn a
  // second set of options for what's conceptually the same feature. Only
  // meaningful once a due date is set (see _wireRemindFields below for the
  // due-date-presence visibility toggle) and once the assignee has opted
  // into userProfiles[uid].notifyChoreDue under Settings > Notifications -
  // see const.py's own docstring for that flag.
  _remindFieldsHtml(chore) {
    const current = (chore && chore.reminder_minutes) || [];
    const optionsHtml = CHORE_REMINDER_MINUTES_CHOICES
      .map((m) => {
        const label = m >= 60 ? (m % 1440 === 0 ? `${m / 1440}d` : `${m / 60}h`) : `${m}m`;
        return `<label class="f-remind-opt"><input type="checkbox" class="f-remind-check" value="${m}"${current.includes(m) ? " checked" : ""} />${label}</label>`;
      })
      .join("");
    return `
      <label class="f-remind-field">Remind me
        <div class="f-remind-row">${optionsHtml}</div>
      </label>
    `;
  }

  // Ties the Remind-me checkbox row's visibility to whether a due date is
  // actually set - there's nothing to count down to otherwise, same
  // reasoning the calendar's own Add Event modal hides its own remind-me
  // row for all-day events (no specific moment to count down from there
  // either). Re-evaluated live on every edit to the due-date field, not
  // just once at modal-open time.
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

  // --- Create Chore modal ---
  // v134+: a Chore/Goal tab row at the top - selecting Goal swaps to a
  // second pane with its own create-goal form (mirroring family-hub-goals-
  // card.js's own create modal) and Save posts to family_hub/goals/create
  // instead of family_hub/chores/create. Lets a household create a goal
  // from right here without also needing the standalone Goals card on the
  // same dashboard - see const.py's SETTINGS_KEY_GOALS_IN_CHORES docstring
  // for why this exists even though the two features stay data-separate.
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
    // v136+: a third Routine tab, shown only when _routinesEnabled() (the
    // FAB itself is already canAssign()-gated - see _render() - so unlike
    // the Rewards card's own Goal tab, no extra _canAssignGoals()-style
    // permission gate is needed here on top of that).
    // v1.132.47+: household ask, verbatim - "Need a permission to add/
    // delete routines both add/delete self and all so someone can't modify
    // others." The FAB is now also reachable by a can_manage_own_routines/
    // can_manage_any_routines holder who lacks can_assign (see _render()'s
    // FAB-visibility change) - for that "routine-only" viewer the Chore and
    // Goal tabs are hidden here client-side (their own Save actions hit
    // ws_create_chore/ws_create_goal's unchanged, independent
    // PERMISSION_ASSIGN gate server-side regardless, so this is purely a UX
    // nicety, not the actual enforcement) and the modal opens straight on
    // Routine instead (see _wireModalTabs below for the matching default-
    // active-tab change).
    const routineOnly = !this._canAssign() && this._canManageAnyRoutines();
    const routineTab = this._routinesEnabled() ? `<button type="button" class="modal-tab${routineOnly ? " active" : ""}" data-tab="routine">Routine</button>` : "";
    const choreGoalTabsHtml = routineOnly
      ? ""
      : `
        <button type="button" class="modal-tab active" data-tab="chore">Chore</button>
        <button type="button" class="modal-tab" data-tab="goal">Goal</button>
      `;
    box.innerHTML = `
      <button type="button" class="modal-close create-modal-close" aria-label="Close">&#10005;</button>
      <h2 class="chore-modal-heading">&#10133; New</h2>
      <div class="modal-tabs">
        ${choreGoalTabsHtml}
        ${routineTab}
      </div>
      <div class="tab-pane chore-pane"${routineOnly ? " hidden" : ""}>
        <div class="field"><label>Title</label><input type="text" class="f-title" placeholder="Take out the trash"></div>
        <div class="field">
          <label>Assignment mode</label>
          <!-- v211+: buttons instead of a dropdown (household ask, see the
               ASSIGNMENT_MODES const's own comment) - the hidden native
               <select> right below stays the actual source of truth
               (.f-mode is still what _submitCreate/syncModeFields/every
               existing test reads and sets), the buttons just drive it:
               clicking one sets the select's value and dispatches "change"
               on it, so nothing downstream had to change at all. -->
          <div class="f-mode-btn-group">${ASSIGNMENT_MODES.map((m, i) => `<button type="button" class="f-mode-btn${i === 0 ? " active" : ""}" data-mode="${m.value}" title="${this._escAttr(m.title)}">${this._esc(m.label)}</button>`).join("")}</div>
          <select class="f-mode" style="display:none">${ASSIGNMENT_MODES.map((m) => `<option value="${m.value}">${m.label}</option>`).join("")}</select>
        </div>
        <!-- v211+: household ask, verbatim - "remove chore bin from the
             assign to when using direct mode" - Chore Bin is now its own
             assignment mode (see just above), so offering it again as an
             assignee choice inside Direct mode was a confusing duplicate
             way to reach the same "sits unassigned, anyone can claim" end
             state - a real person is the only thing Direct mode should
             ever hand this field. -->
        <div class="field f-direct-field"><label>Assigned to</label>
          <select class="f-assigned">${userOptions}</select>
        </div>
        <!-- v184+: household ask, verbatim - "Ability to Assign chores to
             multiple people. Each person is rewarded individually. Chore
             can be marked completed for each person individually." Only
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
        <!-- v196+: household ask, verbatim - "for chores everything from
             mark important down put under the advanced accordion" - so
             Important/No-approval, Quantity, Timer, Notes, Depends on, and
             Rotation group live inside "Advanced Settings". v198 then also
             moved Automate under Advanced as a sub-tab there - v211+
             (household ask, verbatim: "let's move the automate tab out of
             the advanced and put it under a new accordion same thing with
             repeat so you should see 3 accordions repeate advanced
             automate") pulled both the recurrence fields AND Automate back
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
          <!-- v184+: household ask, verbatim - "Ability to Mark Chores
               Important. Chore will have a red ! denoting importance, they
               always go to the top of the list." -->
          <div class="remind-check-row">
            <label class="remind-check-opt"><input type="checkbox" class="f-important" /> <span class="chore-important-badge">&#10071;</span> Mark as important (always sorts to the top)</label>
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
        <div class="field"><label>Due date (optional)</label><input type="datetime-local" class="g-due"></div>
        <div class="field"><label>Notes</label><textarea class="g-notes" rows="3" placeholder="Any details worth knowing"></textarea></div>
      </div>
      ${this._routinesEnabled() ? `<div class="tab-pane routine-pane"${routineOnly ? "" : " hidden"}>${this._routineManagePaneHtml()}</div>` : ""}
      <div class="modal-actions">
        <button class="cancel-btn">Cancel</button>
        <button class="save-btn">Create</button>
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
      // Leaving Direct mode entirely retires the multi-assign checkbox too
      // (its own field is already a .f-direct-field, so it's already
      // hidden right above - this just also resets the checked state/
      // selections so switching back to Direct later doesn't resurrect a
      // stale multi-select from a mode change nobody meant to trigger).
      if (modeSel.value !== "direct" && multiAssignToggle.checked) {
        multiAssignToggle.checked = false;
        box.querySelectorAll(".f-assigned-multi").forEach((cb) => { cb.checked = false; });
        syncMultiAssignFields();
      }
    };
    modeSel.addEventListener("change", syncModeFields);
    // v211+: the visible .f-mode-btn row drives the hidden .f-mode select -
    // clicking a button sets its value and fires "change" on it, which is
    // all syncModeFields (and everything else downstream) is listening
    // for, so it never needed to know buttons exist at all.
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
    this._wireRemindFields(box);
    this._wireGoalRewardFields(box);
    this._wireModalTabs(box);
    this._wireApprovalToggle(box, "f-no-approval");
    this._wireAlarmAudienceToggle(box, "f-alarm-audience");
    // Editing an item from the board (see _openRoutineManageModal) jumps
    // straight to the Routine tab pre-scoped to that item - everything
    // else defaults to a fresh, non-editing state on every open.
    this._routineManageEditingId = null;
    if (this._routinesEnabled()) this._wireRoutineManagePane(box);
    box.querySelector(".cancel-btn").addEventListener("click", () => overlay.classList.remove("open"));
    box.querySelector(".save-btn").addEventListener("click", () => {
      if (box.dataset.activeTab === "goal") this._submitCreateGoal(overlay, box);
      else this._submitCreate(overlay, box);
    });
    overlay.classList.add("open");
  }

  // Opens the FAB modal directly on the Routine tab, pre-scoped to one
  // existing item's person/category and already in edit mode for it - the
  // pencil icon on a board item-card (_routineItemCardHtml) wires here
  // instead of duplicating an edit form inline on the board itself.
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

  // Shared by both this modal and the Rewards card's own create-reward
  // modal (copy-pasted, per this project's "independently-loaded resources"
  // convention) - a plain two-button tab row that toggles which .tab-pane
  // is visible and clears any stale validation error from the pane being
  // left. box.dataset.activeTab is the single source of truth _submitCreate/
  // _submitCreateGoal read to decide which payload to send.
  // v194+: generic accordion wiring - same idiom as the calendar card's own
  // delegated .accordion-toggle click loop (no shared module between the
  // two cards, so this is its own independent copy of the same pattern),
  // reused for every .accordion-toggle/.accordion-body pair a given modal
  // box happens to contain - as of v211 that's three independent,
  // separately-collapsible accordions in the create/edit chore modals
  // (Repeat, Advanced Settings, Automate), each with its own data-target/
  // id pair; this loop drives all of them the same way with no changes
  // needed here. (The v198-era "Settings"/"Automate" sub-tabs inside a
  // single Advanced Settings accordion, and their own _wireAdvancedTabs
  // wiring, are gone as of v211 - Automate is now its own top-level
  // accordion instead of a tab nested inside another one.)
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
    // v1.132.47+: the Chore tab button doesn't exist at all for a
    // routine-only viewer (see _openCreateModal's routineOnly branch just
    // above), so default straight to Routine for them instead of a tab
    // they have no button for.
    box.dataset.activeTab = box.querySelector('.modal-tab[data-tab="chore"]') ? "chore" : "routine";
    if (box.dataset.activeTab === "routine") {
      // Mirrors the tab-click handler's own save-btn hiding just below,
      // for the routine-only viewer who lands on Routine by default (no
      // click ever fires to trigger that logic the normal way).
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
        // Routine tab has no Create/Save step of its own - every add/edit/
        // delete in there hits the server immediately (see
        // _addRoutineManageItem/_saveRoutineManageItem/
        // _deleteRoutineManageItem), so the modal's own Save button (which
        // only makes sense for "fill out a form, then submit it once") is
        // hidden while that tab is active; Cancel still just closes the
        // modal like normal.
        const saveBtn = box.querySelector(".save-btn");
        if (saveBtn) saveBtn.hidden = tab.dataset.tab === "routine";
        const errEl = box.querySelector(".form-error");
        if (errEl) errEl.textContent = "";
        // The reward-item picker needs the Rewards catalog, which this card
        // otherwise only ever fetches when the embedded Rewards column
        // itself is on (_showRewardsColumn) - fetch it on demand the first
        // time someone actually opens the Goal tab instead, so the picker
        // works regardless of whether that column is showing.
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
        // v184+: Routine Library picker (see _routineManagePaneHtml's own
        // comment) - same lazy-fetch-on-first-open pattern as the Goal
        // tab's reward-item picker just above, since the library is its
        // own extra round trip nobody needs unless they actually open the
        // Routine tab.
        if (tab.dataset.tab === "routine") this._populateRoutineLibraryPicker(box);
      });
    });
  }

  // Fetches routine_library.py's static list (cached after the first call -
  // it's read-only reference data, never changes during a session) and
  // fills the Routine tab's "Pick from library" select. Safe to call
  // whenever the Routine tab is opened; a stale box (modal closed/reopened
  // since the fetch started) is simply a no-op re-query, not an error.
  async _populateRoutineLibraryPicker(box) {
    if (!this._routineLibrary) {
      try {
        const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/routines/library" });
        this._routineLibrary = (result && result.items) || [];
      } catch (e) {
        this._routineLibrary = [];
      }
    }
    const box2 = this._root.querySelector(".create-modal .modal-box");
    const select = (box2 || box).querySelector(".rm-library-pick");
    if (!select) return;
    const byCategory = {};
    this._routineLibrary.forEach((entry) => {
      (byCategory[entry.category] = byCategory[entry.category] || []).push(entry);
    });
    const optgroups = ROUTINE_CATEGORIES.filter((c) => byCategory[c] && byCategory[c].length)
      .map((c) => `<optgroup label="${this._esc(this._routineCategoryLabel(c))}">${byCategory[c].map((entry) => `<option value="${this._escAttr(entry.title)}">${entry.icon} ${this._esc(entry.title)}</option>`).join("")}</optgroup>`)
      .join("");
    select.innerHTML = `<option value="">${this._t("chores.rm_pick_from_library", "Pick from library… (optional)")}</option>${optgroups}`;
  }

  // --- Routine tab (FAB modal) - "manage items" pane, v136+ ---
  // Replaces the old always-visible inline "Add item" row on the board
  // itself (see _routineRowHtml's own comment) with a proper manager: pick
  // a person + category, see every item for that combination regardless of
  // which days it's scheduled for (_routineItemsForManage, NOT the day-
  // filtered _routineItemsFor the board uses), add new ones via the form
  // pinned at the top, and edit/delete existing ones inline. Only one item
  // can be in edit mode at a time (_routineManageEditingId) - simpler than
  // tracking independent edit state per row, and matches how a person
  // actually uses this (fix one item, then the next).
  // v137.x fix: the person select used to just fall back to whichever
  // member _memberUsers() lists first, with nothing in the UI making that
  // obvious - easy to add an item, not notice the default person wasn't
  // who you meant, and have it "go missing" onto someone else's board
  // column. Defaulting to whoever's actually using the tablet (falling
  // back to the first member only if the current HA user isn't a Family
  // Hub member themselves, e.g. an admin adding on someone else's behalf)
  // makes the common case ("I'm adding a routine for myself") land right
  // without any extra clicks.
  _defaultRoutineManagePersonId(members) {
    const myId = this._myUserId();
    if (myId && members.some((u) => u.id === myId)) return myId;
    return members.length ? members[0].id : null;
  }
  _routineManagePaneHtml() {
    // v1.132.47+: household ask, verbatim - "Need a permission to add/
    // delete routines both add/delete self and all so someone can't modify
    // others." Only offer people the viewer is actually allowed to manage
    // routines for (see _canManageRoutinesFor) - a can_manage_own_routines
    // holder with no can_assign/can_manage_any_routines sees only
    // themselves here, so picking a person and adding an item never runs
    // into a surprise server-side rejection over the person picked rather
    // than anything about the item itself.
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
          <!-- v184+: household ask, verbatim - "Build a Routine Library - a
               common library of routines that people can pick from to
               build out their day. Brush teeth, make bed, etc etc etc."
               Purely a faster way to fill in the title below (see
               _wireRoutineLibraryPicker) - the library itself is read-only
               static data (routine_library.py), nothing about a routine
               item's own schema changes because this exists. Options are
               populated lazily the first time the Routine tab is opened
               (see _wireModalTabs) since the library is its own extra
               fetch, same lazy-load pattern the Goal tab's reward-item
               picker already uses. -->
          <select class="rm-library-pick"><option value="">${this._t("chores.rm_pick_from_library", "Pick from library… (optional)")}</option></select>
          <input type="text" class="rm-add-title" placeholder="${this._t("chores.rm_item_title_placeholder", "Item title (e.g. Brush teeth)")}">
          <input type="time" class="rm-add-time" title="${this._t("chores.rm_due_time_title", "Due time (optional)")}">
          <div class="rm-days" data-role="add">${dayToggles}</div>
          <div class="rm-hint">${this._t("chores.rm_days_hint", "Tap the days this applies to - leave them all off for every day.")}</div>
          <input type="number" class="rm-add-stars" min="0" placeholder="${this._t("chores.rm_stars_placeholder", "Stars for completing this (optional)")}">
          ${this._approvalToggleHtml("rm-add-no-approval", false, false, "")}
          <!-- v1.132.41+: household ask, verbatim - "add the account to
               automate routine completion based on sensors like we do with
               chores." Same single "sensor turns X -> item marked done"
               matcher shape as a chore's own auto_complete_trigger fieldset
               (see the create-chore modal's Automate accordion) - a routine
               item has no create/reopen lifecycle to mirror auto_create_
               trigger, so this is the one fieldset, not two.
               v1.132.52+: household ask, verbatim - "Routines put the
               automation stuff under an accordion that says automate" -
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
            <!-- v1.132.52+: same accordion treatment as the add-form's own
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
    // v211+: household ask, verbatim - "allow routine blocks to be drug
    // around and ordered in the routine modal" - draggable, same gate as
    // the Edit/Remove buttons right below (reordering is exactly as
    // privileged an edit as those - see ws_reorder_routine_items' own
    // comment). The drag handle is just a visual affordance; the WHOLE row
    // is draggable (see _wireRoutineDragAndDrop), same as the board's own
    // chore cards.
    // v1.132.47+: household ask, verbatim - "Need a permission to add/
    // delete routines both add/delete self and all so someone can't modify
    // others" - was plain _canAssign(), now _canManageRoutinesFor(item.
    // user_id) throughout this row (drag handle, draggable attribute, and
    // the Edit/Remove buttons, which previously had no client-side gate of
    // their own at all and relied solely on the FAB/modal being reachable -
    // now explicit here too, matching the server's own per-item check).
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
    // .rm-list is rebuilt via innerHTML above (every add/edit/delete/
    // reorder/filter change goes through this one method), so drag
    // listeners on the old row elements are gone along with them - rewire
    // fresh every time rather than needing every call site to remember to.
    this._wireRoutineDragAndDrop(box);
    // v1.132.52+: same reasoning - an item's own edit-form Automate
    // accordion (see _routineManageItemHtml) only exists in the DOM while
    // that one item is being edited, freshly rebuilt into .rm-list right
    // here, so it needs its own _wireAccordions pass every time too.
    // Scoped to .rm-list rather than the whole modal box so this never re-
    // wires (and double-fires clicks on) the add-form's own Automate
    // accordion just above .rm-list, which _openCreateModal's one-time
    // box-level _wireAccordions call already handles and which never gets
    // removed/recreated by this rebuild.
    const list = box.querySelector(".rm-list");
    if (list) this._wireAccordions(list);
  }
  // v211+: household ask, verbatim - "allow routine blocks to be drug
  // around and ordered in the routine modal" - native HTML5 drag-and-drop
  // within .rm-list, same idiom as the board's own card-to-column dragging
  // (_attachDragHandlers) but reordering WITHIN one list instead of moving
  // between columns. Only .rm-item-row[draggable="true"] rows exist at all
  // when _canManageRoutinesFor(item.user_id) is false (see
  // _routineManageItemHtml), so this is a no-op for anyone who couldn't
  // edit/remove that particular item either.
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
        // Which side of the target row the cursor dropped on decides
        // before-vs-after, same "upper half vs lower half" convention a
        // reorderable list typically uses.
        const rect = row.getBoundingClientRect();
        const insertBefore = e.clientY - rect.top < rect.height / 2;
        const droppedId = draggingId;
        draggingId = null;
        this._reorderRoutineManageItems(box, droppedId, row.dataset.id, insertBefore);
      });
    });
  }
  // Computes the section's full new order (dragged item removed, then
  // reinserted next to the drop target) and persists it via family_hub/
  // routines/reorder (routine_engine.reorder_items) - a full re-statement
  // of the section's order, matching what that backend function expects
  // (see its own docstring on why it's always the whole section, never a
  // partial move). Re-fetches afterward rather than optimistically
  // reordering in place, same pattern _saveRoutineManageItem/
  // _deleteRoutineManageItem already use for every other manage-list edit.
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
      // no-op - a failed reorder just leaves the old order in place; the
      // refetch just below re-renders from whatever the backend actually
      // has, so nothing here gets left in a stale, out-of-sync state.
    }
    await this._fetchRoutines();
    const box2 = this._root.querySelector(".create-modal .modal-box");
    if (box2) this._renderRoutineManagePane(box2);
  }
  // Reads the currently-active (.active) day toggles out of one .rm-days
  // container - shared by both the add-form's own toggles and whichever
  // item's edit-form toggles are currently showing.
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
    // v184+: Routine Library picker - selecting an entry just fills the
    // title box below (nothing about a routine item's schema changes; see
    // routine_library.py's own header comment), then resets itself back to
    // the placeholder so picking the same or another entry again always
    // fires a change event.
    const libraryPick = box.querySelector(".rm-library-pick");
    if (libraryPick) {
      libraryPick.addEventListener("change", () => {
        if (!libraryPick.value) return;
        const titleInput = box.querySelector(".rm-add-title");
        if (titleInput) titleInput.value = libraryPick.value;
        libraryPick.value = "";
      });
    }
    this._renderRoutineManagePane(box);
    // One delegated listener on the whole pane, since .rm-list is rebuilt
    // via innerHTML on every add/edit/delete/cancel - matches this file's
    // existing convention of wiring modal-specific interactions directly
    // rather than relying on the board's own _onBoardClick (that listener
    // is bound to .board only, not the modal - see _build()).
    box.querySelector(".routine-manage").addEventListener("click", (e) => {
      const dayToggle = e.target.closest(".rm-day-toggle");
      if (dayToggle) {
        dayToggle.classList.toggle("active");
        return;
      }
      // v1.132.53+: the Routine Library's own copy of the approval toggle
      // (rm-add-no-approval/rm-edit-no-approval) - handled here via the
      // same delegated listener rather than _wireApprovalToggle, since
      // .rm-list is rebuilt wholesale via innerHTML on every add/edit/
      // delete/cancel and per-element listeners from _wireApprovalToggle
      // would need re-wiring on every one of those anyway.
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
      errEl.textContent = "Add someone to Family Hub first.";
      return;
    }
    if (!title) {
      errEl.textContent = "A routine item needs a title.";
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
    // v137.x fix: say out loud who/what it was actually added to, since the
    // person/category selects above are easy to leave on their default and
    // not notice - this is the whole fix for "I added a routine but it's
    // not on my list" (it usually was added, just to a different person's
    // column or a different time-of-day accordion than the one being
    // looked at).
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
      errEl.textContent = "A routine item needs a title.";
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
      errEl.textContent = (e && e.message) || "Couldn't save this item.";
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
      /* no-op - a failed delete just leaves the item in place, next poll/render corrects it */
    }
    if (this._routineManageEditingId === itemId) this._routineManageEditingId = null;
    await this._fetchRoutines();
    const box2 = this._root.querySelector(".create-modal .modal-box");
    if (box2) this._renderRoutineManagePane(box2);
  }

  // --- Goal reward fields (mirrors family-hub-goals-card.js's own
  // _rewardFieldsHtml/_wireRewardFields/_applyRewardFieldsToPayload exactly
  // - copy-pasted per this project's independently-loaded-card convention,
  // not shared code). ---
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

  async _submitCreate(overlay, box) {
    const errEl = box.querySelector(".form-error");
    errEl.textContent = "";
    const title = box.querySelector(".f-title").value.trim();
    if (!title) {
      errEl.textContent = "A chore needs a title.";
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
      // v1.132.55+: "who hears this alarm" 3-way tier - see const.py's
      // CHORE_KEY_ALARM_AUDIENCE and _alarmAudienceToggleHtml's own comment.
      alarm_audience: box.querySelector(".f-alarm-audience").value,
      // Blank -> null (an ordinary chore) - see chore_engine._normalize_
      // quantity_total, which treats null/blank/anything under 1 the same.
      quantity_total: parseInt(box.querySelector(".f-quantity").value, 10) || null,
      // v1.110.0+: same null-on-blank shape as quantity_total just above -
      // the backend normalizes/clamps, so a blank box genuinely clears any
      // existing timer rather than leaving a stale length behind.
      timer_minutes: parseInt(box.querySelector(".f-timer-minutes").value, 10) || null,
      // v184+: "Ability to Mark Chores Important" - sorts to the top of the
      // board and shows a red ! badge (see _sortChoresForColumn/_choreCardHtml).
      important: box.querySelector(".f-important").checked,
    };
    this._applyRecurFieldsToPayload(box, payload);
    if (mode === "direct") {
      const multiAssignOn = box.querySelector(".f-multi-assign").checked;
      if (multiAssignOn) {
        // v184+: household ask, verbatim - "Ability to Assign chores to
        // multiple people. Each person is rewarded individually. Chore can
        // be marked completed for each person individually." Sent as a
        // list; ws_create_chore fans this out into one independent chore
        // per checked person (see chores_websocket_api.ws_create_chore),
        // all sharing one group_id, and replies with {chores: [...]}
        // instead of the usual single {chore}.
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
    // Same "omit entirely when there's nothing to say" rule due_date just
    // above already follows on Create - an empty array is what create_chore
    // already defaults reminder_minutes to, so there's no need to send it
    // explicitly unless something's actually checked.
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
      errEl.textContent = "Check at least one person to assign to multiple people.";
      return;
    }
    try {
      const result = await this._hass.connection.sendMessagePromise(payload);
      // Multi-assign fan-out replies with {chores: [...]} (one per person);
      // a normal create still replies with {chore: {...}} - see
      // ws_create_chore's own comment on this split.
      if (!result || (!result.chore && !(result.chores && result.chores.length))) throw new Error("no chore returned");
      overlay.classList.remove("open");
      await this._fetchChores();
    } catch (e) {
      errEl.textContent = (e && e.message) || "Couldn't create that chore - check the fields above.";
    }
  }

  // --- Edit Chore modal ---
  // Same field set as the Create modal minus what's permanently fixed once
  // a chore exists - assignment_mode/assigned_to (reassign via drag-and-
  // drop/the Chore Bin instead) and id/created_at - matching exactly what
  // chore_engine.update_chore actually honors (its own _EDITABLE_FIELDS).
  // Only ever opened via the Edit button, which is itself only shown for
  // open chores when _canAssign() (see _choreCardHtml) - the guard here is
  // just "does this chore still exist in our local cache", not a second
  // permission/status check, since the backend is the real enforcement
  // point either way (ws_update_chore re-checks PERMISSION_ASSIGN, and
  // update_chore itself re-checks status === open).
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
    // Rotation only means anything for an auto_rotation chore - since
    // assignment_mode itself can't be changed from this modal, there's no
    // reason to show (or let someone accidentally blank out) a rotation
    // group field on a chore that was never in that mode to begin with.
    const rotationFieldHtml = chore.assignment_mode === "auto_rotation"
      ? `<label class="f-rotation-field">Rotation group (in order)<select class="f-rotation" multiple>${userOptions}</select></label>`
      : "";
    box.innerHTML = `
      <button type="button" class="modal-close edit-modal-close" aria-label="Close">&#10005;</button>
      <h2>Edit chore</h2>
      <div class="field"><label>Title</label><input type="text" class="f-title" value="${this._escAttr(chore.title)}"></div>
      <div class="field"><label>Star value</label><input type="number" class="f-stars" min="0" value="${chore.star_value || 0}"></div>
      <div class="field"><label>Due date</label><input type="datetime-local" class="f-due" value="${this._isoToLocalDatetimeInputValue(chore.due_date)}"></div>
      ${this._remindFieldsHtml(chore)}
      <div class="field"><label>Overdue penalty (stars)</label><input type="number" class="f-penalty" min="0" value="${chore.overdue_penalty || 0}"></div>
      <!-- v196+: household ask, verbatim - "for chores everything from mark
           important down put under the advanced accordion" - see the
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
        <!-- v184+: household ask, verbatim - "Ability to Mark Chores
             Important. Chore will have a red ! denoting importance, they
             always go to the top of the list." Editable after creation
             too, unlike assignment_mode/assigned_to just above (see this
             modal's own header comment). -->
        <div class="remind-check-row">
          <label class="remind-check-opt"><input type="checkbox" class="f-important" ${chore.important ? "checked" : ""} /> <span class="chore-important-badge">&#10071;</span> Mark as important (always sorts to the top)</label>
        </div>
        ${this._approvalToggleHtml("f-no-approval", !!chore.no_approval_required, !(this._canStarOverride() || chore.no_approval_required), "Only an admin (or someone granted star-override permission) can mark a chore as not requiring approval.")}
        ${this._alarmAudienceToggleHtml("f-alarm-audience", chore.alarm_audience)}
        <div class="field" title="Optional - e.g. 3 for &quot;3 loads of laundry&quot;. Tapping Done counts down one unit at a time; only the last one triggers approval/stars. Changing this resets the current count."><label>Quantity (optional - e.g. 3 loads of laundry)</label><input type="number" class="f-quantity" min="1" placeholder="Leave blank for a normal chore" value="${chore.quantity_total || ""}"></div>
        <div class="field" title="Optional - e.g. 30 for &quot;clean for 30 minutes&quot;. Adds a Start button to the chore; when the countdown runs out the chore completes itself exactly as if Done had been tapped, so it still respects whatever approval rules already apply."><label>Timer (optional - minutes)</label><input type="number" class="f-timer-minutes" min="1" max="1440" placeholder="Leave blank for no timer" value="${chore.timer_minutes || ""}"></div>
        <div class="field"><label>Notes</label><textarea class="f-notes" rows="3" placeholder="Any details worth knowing - which bin, where to leave it, etc.">${this._esc(chore.notes || "")}</textarea></div>
        <div class="field"><label>Depends on</label><select class="f-deps" multiple>${depOptions}</select></div>
        ${rotationFieldHtml}
      </div>
      <button type="button" class="accordion-toggle" data-target="chore-edit-automate-body">
        <span class="theme-section-label">Automate</span>
        <span class="accordion-chevron">&#9660;</span>
      </button>
      <div class="accordion-body" id="chore-edit-automate-body">
        <fieldset>
          <legend>Auto-create trigger (e.g. "Dryer finished")</legend>
          <label>Entity ID<input type="text" class="f-create-entity" value="${this._escAttr(createTrigger.entity_id || "")}" placeholder="binary_sensor.dryer_done"></label>
          <label>From state (optional)<input type="text" class="f-create-from" value="${this._escAttr(createTrigger.from_state || "")}" placeholder="running"></label>
          <label>To state<input type="text" class="f-create-to" value="${this._escAttr(createTrigger.to_state || "")}" placeholder="off"></label>
        </fieldset>
        <fieldset>
          <legend>Auto-complete trigger (e.g. "Dishwasher opened")</legend>
          <label>Entity ID<input type="text" class="f-complete-entity" value="${this._escAttr(completeTrigger.entity_id || "")}" placeholder="binary_sensor.dishwasher_door"></label>
          <label>From state (optional)<input type="text" class="f-complete-from" value="${this._escAttr(completeTrigger.from_state || "")}" placeholder="closed"></label>
          <label>To state<input type="text" class="f-complete-to" value="${this._escAttr(completeTrigger.to_state || "")}" placeholder="open"></label>
        </fieldset>
      </div>
      <div class="modal-actions">
        <button class="cancel-btn">Cancel</button>
        <button class="save-btn">Save</button>
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
      errEl.textContent = "A chore needs a title.";
      return;
    }
    const payload = {
      type: "family_hub/chores/update",
      chore_id: choreId,
      title,
      star_value: parseInt(box.querySelector(".f-stars").value, 10) || 0,
      overdue_penalty: parseInt(box.querySelector(".f-penalty").value, 10) || 0,
      no_approval_required: box.querySelector(".f-no-approval").checked,
      // v1.132.55+: same field as the create form - see its own comment.
      alarm_audience: box.querySelector(".f-alarm-audience").value,
      // v184+: "Ability to Mark Chores Important" - editable after creation,
      // unlike assignment_mode/assigned_to (see this modal's header comment).
      important: box.querySelector(".f-important").checked,
      // Always sent explicitly (even as ""), same reasoning as due_date
      // just below - clearing the Notes box on purpose has to actually
      // clear it server-side, not be silently ignored.
      notes: box.querySelector(".f-notes").value.trim(),
      // Sent as exactly what the form shows selected, same as the Create
      // modal - unlike Create there IS a pre-existing value here, so an
      // admin who clears every selection is genuinely choosing to clear it
      // (matches how every other field below works: whatever's in the form
      // on Save replaces what was there).
      dependencies: Array.from(box.querySelector(".f-deps").selectedOptions).map((o) => o.value),
      // Always sent explicitly, same "blank on purpose still has to clear
      // it server-side" reasoning as notes/due_date - update_chore resets
      // quantity_remaining to match whenever this key is present at all
      // (see its own docstring), including clearing it back to null here.
      quantity_total: parseInt(box.querySelector(".f-quantity").value, 10) || null,
      // v1.110.0+: same null-on-blank shape as quantity_total just above -
      // the backend normalizes/clamps, so a blank box genuinely clears any
      // existing timer rather than leaving a stale length behind.
      timer_minutes: parseInt(box.querySelector(".f-timer-minutes").value, 10) || null,
    };
    const dueVal = box.querySelector(".f-due").value;
    // Unlike Create (which just omits due_date entirely when left blank),
    // this always includes the key - update_chore only touches a field
    // when its key is present at all, so leaving it out here would mean
    // "leave the existing due date alone" instead of "I cleared it",
    // silently ignoring someone blanking out the date field on purpose.
    payload.due_date = dueVal ? new Date(dueVal).toISOString() : null;
    // Same "always send explicitly" reasoning as due_date just above -
    // unlike Create (which omits the key entirely when nothing's checked,
    // relying on create_chore's own empty-list default), leaving this key
    // out here would mean "leave the existing reminder_minutes alone"
    // instead of "I unchecked everything on purpose."
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
      errEl.textContent = (e && e.message) || "Couldn't save that chore - check the fields above.";
    }
  }

  _css() {
    return `
      /* v1.110.7+: position:relative is the containing block .add-chore-fab
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
      ha-card { background: var(--fc-bg); color: var(--fc-text); padding: 12px; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; }
      .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
      .title { font-size: 18px; font-weight: 800; }
      .actions { display: flex; gap: 8px; }
      /* Same pixel-for-pixel treatment as family-week-calendar-card.js's own
         add-event-fab (size, corner offset, circle, colors, shadow, tap
         feedback) - a deliberately identical look across both cards rather
         than each having its own take on "the + button". */
      /* v1.110.4+: bottom is offset by --fh-fab-offset, set by the shared
         window.__familyHubFabCoordinator (see the singleton block near the
         top of this file) so this FAB stacks above any other Family Hub
         card's FAB sharing the same dashboard view instead of overlapping
         it - 0px (the default) when this is the only one on screen. */
      .add-chore-fab { position: fixed; right: 18px; bottom: calc(18px + var(--fh-fab-offset, 0px)); z-index: 900; width: 56px; height: 56px; border-radius: 50%; border: none; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 28px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(58,53,44,0.35); transition: transform 0.15s ease, bottom 0.15s ease; }
      .add-chore-fab:active { transform: scale(0.94); }
      /* v1.110.7+: fab_position: "card" - anchors to THIS card's own box
         instead of the viewport, and opts out of the shared coordinator
         offset entirely (see _registerFabCoordinator). */
      :host([fab-position="card"]) .add-chore-fab { position: absolute; bottom: 18px; }
      .rewards-toggle-btn { border: 1px solid var(--fc-border); border-radius: 12px; padding: 6px 12px; font-size: 12px; font-weight: 700; background: var(--fc-surface-alt); color: var(--fc-text); cursor: pointer; }
      .rewards-toggle-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      /* v144+ task #29: kiosk PIN login button + modal. .active here means
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
      /* Not .active until Waiting to Recur is actually collapsed to this
         bar button (see _toggleWaitingToRecurCollapsed) - the reverse of
         .rewards-toggle-btn's own active meaning ("shown"), since here the
         button itself IS the collapsed state, not a way into a hidden one. */
      .waiting-recur-toggle-btn { border: 1px solid var(--fc-border); border-radius: 12px; padding: 6px 12px; font-size: 12px; font-weight: 700; background: var(--fc-surface-alt); color: var(--fc-text); cursor: pointer; }
      .waiting-recur-toggle-btn.active { background: #8fa7b3; color: #fff; border-color: #8fa7b3; }
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
      .chore-col-body { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 8px; }
      .chore-col-body.drag-over { background: var(--fc-surface-alt); }
      .chore-col-empty { text-align: center; color: var(--fc-text-secondary); font-size: 12px; padding: 12px 0; }
      .routines-block { padding: 8px 8px 0; display: flex; flex-direction: column; gap: 4px; border-bottom: 1px solid var(--fc-border); }
      .routine-row { background: var(--fc-surface2); border-radius: 8px; overflow: hidden; }
      .routine-row-header { display: flex; align-items: center; gap: 6px; padding: 6px 8px; font-size: 12px; font-weight: 700; cursor: pointer; }
      .routine-toggle-icon { font-size: 9px; opacity: .65; width: 9px; flex-shrink: 0; }
      .routine-row-title { flex: 1; }
      .routine-row-badge { font-size: 11px; font-weight: 700; opacity: .75; background: var(--fc-card); border-radius: 8px; padding: 1px 7px; }
      .routine-row-body { padding: 2px 8px 8px; display: flex; flex-direction: column; gap: 4px; }
      .routine-section-label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: var(--fc-text-secondary); margin-top: 2px; }
      /* v136+: card-style item (mirrors .goal-item's visual language -
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
      /* --- Routine tab (FAB modal) - "manage items" pane, v136+ --- */
      .routine-manage { display: flex; flex-direction: column; gap: 8px; }
      .rm-filters { display: flex; gap: 6px; }
      .rm-filter-label { flex: 1; display: flex; flex-direction: column; gap: 2px; font-size: 10px; font-weight: 700; color: var(--fc-text-secondary); text-transform: uppercase; letter-spacing: 0.02em; }
      .rm-filters select { margin: 0; width: 100%; box-sizing: border-box; text-transform: none; font-weight: 400; letter-spacing: normal; font-size: 12px; }
      .rm-error.rm-success { color: var(--fc-accent2); }
      .rm-add-form { background: var(--fc-surface2); border-radius: 10px; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
      .rm-add-form input[type="text"], .rm-add-form input[type="time"] { box-sizing: border-box; width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 12px; font-family: inherit; }
      .rm-library-pick { box-sizing: border-box; width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 12px; font-family: inherit; }
      .rm-days { display: flex; flex-wrap: wrap; gap: 4px; }
      .rm-day-toggle { border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); border-radius: 6px; padding: 4px 8px; font-size: 11px; font-weight: 700; cursor: pointer; }
      .rm-day-toggle.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      .rm-hint { font-size: 10px; color: var(--fc-text-secondary); }
      .rm-add-btn, .rm-item-save-btn { border: none; border-radius: 8px; padding: 7px 10px; font-weight: 700; font-size: 12px; cursor: pointer; background: var(--fc-accent); color: var(--fc-accent-text); align-self: flex-start; }
      /* v195+: household ask, verbatim - "for routines instead of add item.
         make it say create and move it to the right hand side not left" -
         the Routine tab's own Add-item button only (its sibling .rm-item-
         save-btn, the per-item Edit-form Save button, is untouched and
         stays left-aligned like before). */
      .rm-add-btn { align-self: flex-end; }
      .rm-error { color: var(--fc-accent3); font-size: 11px; min-height: 13px; }
      .rm-list { display: flex; flex-direction: column; gap: 6px; }
      .rm-item-row { display: flex; align-items: flex-start; gap: 6px; background: var(--fc-card); border: 1px solid var(--fc-border); border-radius: 8px; padding: 6px 8px; }
      /* v211+: drag-and-drop reordering - see _wireRoutineDragAndDrop. The
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
      /* v144.5+: "Liquid glass" support, same convention as
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
      /* v184+ - "Mark Chores Important" (household ask, verbatim: "Chore
         will have a red ! denoting importance, they always go to the top
         of the list" - the sort itself is in _sortChoresForColumn, this is
         just the visual marker: a red "!" ahead of the title, plus a thin
         red left border on the whole card so it's easy to spot scanning a
         column even when the title is truncated). */
      .chore-card.chore-important { border-left: 3px solid #c0392b; }
      .chore-important-badge { color: #c0392b; font-weight: 900; margin-right: 3px; }
      .chore-title { font-weight: 700; font-size: 14px; margin-bottom: 4px; }
      .chore-meta { display: flex; gap: 8px; font-size: 12px; color: var(--fc-text-secondary); flex-wrap: wrap; }
      .chore-actions { margin-top: 6px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      /* v1.110.0+: chore timers. Start reads as a secondary action next to
         Done (which stays primary - finishing early is always allowed);
         once running it's replaced by a live countdown chip, monospace-ish
         tabular figures so the seconds ticking down don't shift the layout
         under the cursor every second. */
      .chore-timer-start-btn { background: var(--fc-surface-alt) !important; color: var(--fc-accent2) !important; }
      .chore-timer-live { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 800; color: var(--fc-accent2); background: var(--fc-surface-alt); border-radius: 8px; padding: 4px 8px; font-variant-numeric: tabular-nums; }
      .chore-timer-cancel-btn { background: transparent !important; color: var(--fc-text-secondary) !important; padding: 4px 6px !important; }
      .chore-actions button { border: none; border-radius: 8px; padding: 5px 10px; font-size: 12px; font-weight: 700; cursor: pointer; background: var(--fc-accent2); color: #fff; }
      .chore-nudge-btn { background: var(--fc-surface-alt) !important; color: var(--fc-text) !important; }
      .chore-edit-btn { background: var(--fc-surface-alt) !important; color: var(--fc-text) !important; }
      .chore-approve-btn { background: var(--fc-accent) !important; color: var(--fc-accent-text) !important; }
      .chore-reject-btn { background: var(--fc-surface-alt) !important; color: var(--fc-accent3) !important; }
      .chore-rejected-badge { display: inline-block; font-size: 11px; color: var(--fc-accent3); background: var(--fc-surface-alt); border-radius: 8px; padding: 2px 6px; margin-top: 4px; }
      .chore-pending-label, .chore-approved-label { font-size: 12px; color: var(--fc-text-secondary); }
      .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; align-items: center; justify-content: center; }
      .modal-overlay.open { display: flex; }
      .modal-box { position: relative; background: var(--fc-bg); color: var(--fc-text); border-radius: 14px; padding: 18px; width: min(92vw, 480px); max-height: 85vh; overflow-y: auto; }
      /* v194+: "make the chores and rewards modals more similar to the add
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
      /* v1.132.38+: the "Custom recurrence" panel revealed by picking
         "Custom..." in the Recurs preset dropdown - see _recurFieldsHtml's
         own comment. A left border + slight indent/tint, same visual
         language as an expanded accordion elsewhere in this card, so it
         reads as "extra detail tucked under the dropdown" rather than a
         separate, disconnected section of the form. */
      .f-recur-custom-panel { border-left: 3px solid var(--fc-border); padding-left: 10px; margin-top: 4px; margin-left: 2px; background: var(--fc-surface-alt); border-radius: 0 8px 8px 0; padding-top: 8px; padding-bottom: 8px; }
      /* v185+: "A specific week each month" schedule's own nth select +
         weekday row + "First weekend" shortcut - see _recurFieldsHtml's
         own comment. */
      .f-recur-monthly-field select { margin-bottom: 4px; }
      .recur-quickpick-btn { margin-top: 6px; border: 1px dashed var(--fc-border); border-radius: 8px; padding: 6px 10px; font-size: 12px; font-weight: 700; background: transparent; color: var(--fc-accent); cursor: pointer; }
      .recur-quickpick-btn:hover { background: var(--fc-surface-alt); }
      .f-remind-row { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
      .f-remind-opt { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--fc-border); border-radius: 8px; padding: 6px 8px; font-size: 12px; font-weight: 700; background: var(--fc-card); color: var(--fc-text); cursor: pointer; margin: 0; }
      .f-remind-opt input { width: auto; margin: 0; }
      /* v184+: "Assign to multiple people" checkbox list - same visual
         pattern as .f-remind-row/.f-remind-opt just above (a wrapping row
         of pill checkboxes) rather than the tall native multi-select the
         Rotation group field below uses, since picking 2-3 people out of a
         short household member list reads better as checkboxes. */
      .f-assigned-multi-list { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
      .f-assigned-multi-list label { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--fc-border); border-radius: 8px; padding: 6px 8px; font-size: 12px; font-weight: 700; background: var(--fc-card); color: var(--fc-text); cursor: pointer; margin: 0; }
      .f-assigned-multi-list input { width: auto; margin: 0; }
      /* v211+: Assignment mode buttons in place of the old dropdown - see
         the ASSIGNMENT_MODES const's own comment. Same flex-row-of-buttons
         idiom as .modal-tabs/.modal-tab just above, under its own class
         names since this row drives a hidden <select> (see _openCreateModal)
         rather than a .tab-pane. */
      .f-mode-btn-group { display: flex; gap: 6px; flex-wrap: wrap; }
      .f-mode-btn { flex: 1 1 0; min-width: 88px; min-height: 40px; padding: 8px 10px; border-radius: 10px; border: 2px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 12.5px; font-weight: 700; cursor: pointer; box-shadow: var(--fc-shadow); }
      .f-mode-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      .f-mode-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      /* v1.132.53+: household ask - "needs approval" checkbox replaced with
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
      /* v189+: household ask, verbatim - "Confetti pop when chore complete.
         Add to chore settings to display a confetti pop animation on
         chore completion." Gated on the choresConfettiOnComplete Settings
         field (off by default, same opt-in-cosmetic-feature convention as
         choresShowRewardsColumn/routinesEnabled) - see _fireConfetti.
         v190.1+: the actual .chore-confetti-overlay/-piece/@keyframes
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

// v1.111.0+: dedicated editor element for getConfigElement above - same
// pattern as family-hub-goals-card.js's own editor (see that file's
// comments for the full reasoning on each duplicated helper).
class FamilyHubChoresCardEditor extends HTMLElement {
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
