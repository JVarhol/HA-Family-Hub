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
const ASSIGNMENT_MODES = [
  { value: "direct", label: "Direct (assign to one person)" },
  { value: "chore_bin", label: "Chore Bin (an admin assigns it later)" },
  { value: "auto_rotation", label: "Auto-rotation (takes turns)" },
  { value: "first_come_first_served", label: "First come, first served (anyone can claim)" },
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

class FamilyHubChoresCard extends HTMLElement {
  static getStubConfig() {
    return { title: "Chores" };
  }
  static getConfigForm() {
    return { schema: [{ name: "title", selector: { text: {} } }], computeLabel: (s) => (s.name === "title" ? "Title" : undefined) };
  }
  setConfig(config) {
    this._config = { title: (config && config.title) || "Chores" };
    if (this._settingsCache === undefined) this._settingsCache = null;
    if (this._globalThemes === undefined) this._globalThemes = [];
    if (this._chores === undefined) this._chores = [];
    if (this._users === undefined) this._users = [];
    if (this._myPermissions === undefined) this._myPermissions = {};
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
    // Keeps the shared screensaver controller's own hass reference fresh
    // on every update (not just the first), same as every other card that
    // registers with it - see the singleton block above _startPolling.
    if (window.__familyHubScreenSaver) window.__familyHubScreenSaver.updateHass(hass);
    if (first) this._firstLoadPromise = this._initFirstLoad();
  }
  async _initFirstLoad() {
    await Promise.all([this._fetchSettings(), this._fetchUsers(), this._fetchChores()]);
    if (this._getSettings().useGlobalTheme) await this._fetchGlobalThemes();
    await this._fetchMyPermissions();
    if (this._showRewardsColumn()) await this._fetchRewardsState();
    if (this._routinesEnabled()) await this._fetchRoutines();
    if (this._goalsInChoresEnabled()) await this._fetchGoals();
    this._startPolling();
    this._registerScreenSaver();
    this._render();
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
  _startPolling() {
    if (this._interval) return;
    this._interval = setInterval(() => {
      this._fetchChores();
      if (this._showRewardsColumn()) this._fetchRewardsState();
      if (this._routinesEnabled()) this._fetchRoutines();
      if (this._goalsInChoresEnabled()) this._fetchGoals();
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
    return 8;
  }
  getGridOptions() {
    return { columns: 12, min_columns: 8, max_columns: 12, min_rows: 8 };
  }
  _isAdmin() {
    return !!(this._hass && this._hass.user && this._hass.user.is_admin);
  }
  _myUserId() {
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
    return !!this._myPermissions[key];
  }
  _canAssign() {
    return this._hasPermission("can_assign");
  }
  _canVerify() {
    return this._hasPermission("can_verify");
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
    return { theme: this._defaultTheme(), useGlobalTheme: false, globalThemeId: "" };
  }
  _getSettings() {
    return this._settingsCache || this._defaultSettings();
  }
  _resolveTheme(settings) {
    const local = settings.theme || this._defaultTheme();
    if (!settings.useGlobalTheme || !settings.globalThemeId) return local;
    const g = (this._globalThemes || []).find((t) => t && t.id === settings.globalThemeId);
    if (!g) return local;
    const defaultTheme = this._defaultTheme();
    const colors = {};
    Object.keys(defaultTheme.colors).forEach((k) => {
      const v = g.colors && g.colors[k];
      colors[k] = typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : defaultTheme.colors[k];
    });
    return { colors };
  }
  _applyThemeVars() {
    const theme = this._resolveTheme(this._getSettings());
    this.style.setProperty("--fc-bg", theme.colors.bg);
    this.style.setProperty("--fc-card", theme.colors.card);
    this.style.setProperty("--fc-border", theme.colors.border);
    this.style.setProperty("--fc-text", theme.colors.text);
    this.style.setProperty("--fc-text-secondary", theme.colors.textSecondary);
    this.style.setProperty("--fc-accent", theme.colors.accent);
    this.style.setProperty("--fc-accent-text", theme.colors.accentText);
    this.style.setProperty("--fc-accent2", theme.colors.accent2);
    this.style.setProperty("--fc-accent3", theme.colors.accent3);
    this.style.setProperty("--fc-surface-alt", theme.colors.surfaceAlt);
    this.style.setProperty("--fc-surface2", theme.colors.surface2);
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
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "theme_builder/list" });
      this._globalThemes = (result && Array.isArray(result.themes)) ? result.themes : [];
    } catch (e) {
      this._globalThemes = [];
    }
    this._applyThemeVars();
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
      await this._hass.connection.sendMessagePromise({ type: "family_hub/rewards/redeem", item_id: itemId });
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
    this.attachShadow({ mode: "open" });
    const root = this.shadowRoot;
    root.innerHTML = `
      <style>${this._css()}</style>
      <ha-card>
        <div class="header">
          <div class="title"></div>
          <div class="actions">
            <button class="waiting-recur-toggle-btn" title="Show Waiting to Recur as a column">&#8635; <span class="waiting-recur-toggle-count"></span></button>
            <button class="rewards-toggle-btn" title="Show/hide the Rewards column" hidden>&#11088;</button>
          </div>
        </div>
        <div class="board"></div>
      </ha-card>
      <div class="modal-overlay create-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay edit-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay detail-modal"><div class="modal-box"></div></div>
      <button class="add-chore-fab" title="Add a chore" aria-haspopup="true">&#65291;</button>
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
  }

  _onBoardClick(e) {
    const nudgeBtn = e.target.closest(".chore-nudge-btn");
    const doneBtn = e.target.closest(".chore-done-btn");
    const approveBtn = e.target.closest(".chore-approve-btn");
    const rejectBtn = e.target.closest(".chore-reject-btn");
    const claimBtn = e.target.closest(".chore-claim-btn");
    const rewardsClaimBtn = e.target.closest(".rewards-claim-btn");
    const editBtn = e.target.closest(".chore-edit-btn");
    const routineHeader = e.target.closest(".routine-row-header");
    const routineEditBtn = e.target.closest(".routine-item-edit");
    const routineDeleteBtn = e.target.closest(".routine-item-delete");
    const routineCheck = e.target.closest(".routine-item-check");
    const goalLogBtn = e.target.closest(".goal-log-btn");
    const goalApproveBtn = e.target.closest(".goal-approve-btn");
    const goalRejectBtn = e.target.closest(".goal-reject-btn");
    if (goalLogBtn) return this._logGoalProgress(goalLogBtn.dataset.id);
    if (goalApproveBtn) return this._approveGoal(goalApproveBtn.dataset.id);
    if (goalRejectBtn) return this._rejectGoal(goalRejectBtn.dataset.id);
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
    if (routineHeader) return this._toggleRoutineSection(routineHeader.dataset.user, routineHeader.dataset.category);
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
      await this._hass.connection.sendMessagePromise({ type: "family_hub/chores/complete", chore_id: id });
      await this._fetchChores();
    } catch (e) {
      /* server already reports the reason via send_error; nothing actionable client-side beyond refreshing */
    }
  }
  async _approve(id) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/chores/approve", chore_id: id });
      await this._fetchChores();
    } catch (e) {
      /* no-op */
    }
  }
  // v128+: the other way out of the verification gate - an optional,
  // skippable window.prompt for a short note (see const.py's
  // CHORE_KEY_REJECT_REASON docstring on why it's worth having: a silent
  // bounce-back leaves the assignee guessing what was wrong). Cancelling
  // the prompt (null, not just an empty string) still rejects with no
  // reason - only an actual Cancel/Esc on the browser's OWN "are you sure"
  // for the whole action would stop it, and this card doesn't have one of
  // those (matches _approve right above having none either - Approve/
  // Reject are both a single tap, no confirm() step).
  async _reject(id) {
    const reason = window.prompt("Anything you want to tell them about why? (optional)", "");
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/chores/reject", chore_id: id, reason: reason || "" });
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
  _recurDescriptionHtml(chore) {
    const parts = [];
    if (chore.recur_type === "interval") {
      const days = chore.recur_interval_days || 1;
      parts.push(`Every ${days} day${days === 1 ? "" : "s"}`);
    } else if (chore.recur_type === "weekdays") {
      const days = (chore.recur_weekdays || []).map((d) => WEEKDAY_LABELS[d]).join(", ");
      if (days) parts.push(`On ${days}`);
    }
    if (chore.auto_create_trigger) parts.push("an automation trigger");
    const schedule = parts.length ? parts.join(" + ") : "Waiting";
    // recur_next_due only ever exists for a plain-schedule (recur_type)
    // chore - a purely sensor-triggered one has no predictable date, so it
    // just says it's waiting on the trigger instead of a next-due date it
    // can't actually know.
    const next = chore.recur_next_due
      ? `Next: ${new Date(chore.recur_next_due).toLocaleDateString()}`
      : (chore.auto_create_trigger ? "Waiting for the trigger to fire" : "");
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
        <div class="waiting-recur-owner">Last done by ${this._esc(this._userName(chore.assigned_to))}</div>
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
      : `<div class="chore-col-empty">Nothing waiting to recur right now</div>`;
    return `
      <div class="chore-column waiting-recur-column" data-col-id="waiting_to_recur">
        <div class="chore-col-header" style="border-color:#8fa7b3">
          <span class="chore-col-dot" style="background:#8fa7b3"></span>
          <span>&#8635; Waiting to Recur</span>
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
        <button type="button" class="rewards-claim-btn" data-id="${item.id}" ${affordable ? "" : "disabled"}>Claim</button>
        <div class="rewards-claim-status"></div>
      </div>
    `;
  }
  _rewardsColumnHtml() {
    const memberUsers = this._memberUsers();
    const balances = memberUsers.length
      ? memberUsers.map((u) => this._rewardsBalanceRowHtml(u)).join("")
      : `<div class="chore-col-empty">No one's been added to Family Hub yet</div>`;
    const catalog = this._catalog.length
      ? this._catalog.map((it) => this._rewardsCatalogItemHtml(it)).join("")
      : `<div class="chore-col-empty">No rewards in the catalog yet</div>`;
    return `
      <div class="chore-column rewards-column">
        <div class="chore-col-header" style="border-color:#f4c95d">
          <span class="chore-col-dot" style="background:#f4c95d"></span>
          <span>&#11088; Rewards</span>
        </div>
        <div class="rewards-col-body">
          <div class="rewards-balances">${balances}</div>
          <div class="rewards-catalog-title">Reward catalog</div>
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
    return this._routineItems.filter((it) => it.user_id === userId && it.category === category && this._routineItemAppliesToday(it));
  }
  // Unfiltered by day - powers the manage list in the Routine tab (see
  // _renderRoutineManagePane) where the point is finding/editing an item
  // regardless of which days it's scheduled for.
  _routineItemsForManage(userId, category) {
    return this._routineItems.filter((it) => it.user_id === userId && it.category === category);
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
  _isRoutineItemOverdue(item) {
    if (item.done || !item.due_time) return false;
    const [h, m] = item.due_time.split(":").map((n) => parseInt(n, 10));
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() > h * 60 + m;
  }
  _routineItemCardHtml(item) {
    const overdue = this._isRoutineItemOverdue(item);
    const dueBadge = item.due_time ? `<span class="routine-item-due ${overdue ? "overdue" : ""}">${overdue ? "&#9888; " : ""}${this._esc(this._formatDueTime(item.due_time))}</span>` : "";
    const daysBadge = item.days_of_week && item.days_of_week.length ? `<span class="routine-item-days">${item.days_of_week.map((d) => WEEKDAY_LABELS[d]).join(" ")}</span>` : "";
    const meta = dueBadge || daysBadge ? `<div class="routine-item-meta">${dueBadge}${daysBadge}</div>` : "";
    // Editing/removing an item is an admin/assign-permission action
    // (matches the server's own PERMISSION_ASSIGN gate on family_hub/
    // routines/update and /delete); checking it off is not (see
    // _toggleRoutineItem/ws_toggle_routine_item) - same split as the rest
    // of this card's canAssign() gating. Edit jumps straight into the FAB
    // modal's Routine tab, pre-scoped to this exact item (see
    // _openRoutineManageModal).
    const actions = this._canAssign()
      ? `
        <button type="button" class="routine-item-edit" data-id="${item.id}" title="Edit">&#9998;</button>
        <button type="button" class="routine-item-delete" data-id="${item.id}" title="Remove">&times;</button>
      `
      : "";
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
          ${active.length ? `<div class="routine-section-label">Active</div>${active.map((it) => this._routineItemCardHtml(it)).join("")}` : ""}
          ${completed.length ? `<div class="routine-section-label">Completed</div>${completed.map((it) => this._routineItemCardHtml(it)).join("")}` : ""}
          ${items.length ? "" : `<div class="routine-row-empty">Nothing on today's list${this._canAssign() ? " - manage items from the + button" : ""}</div>`}
        </div>
      `;
    }
    return `
      <div class="routine-row">
        <div class="routine-row-header" data-user="${userId}" data-category="${category}">
          <span class="routine-toggle-icon">${open ? "&#9662;" : "&#9656;"}</span>
          <span class="routine-row-title">${ROUTINE_CATEGORY_LABELS[category]}</span>
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
    const goals = this._goals.filter((g) => g.assigned_to === userId);
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
    const progressLabel = target > 1 ? `${current} / ${target}` : (current >= target ? "Done" : "Not yet done");
    let actions = "";
    if (canLog) actions += `<button type="button" class="goal-log-btn" data-id="${goal.id}">${target > 1 ? "Log" : "Mark done"}</button>`;
    if (goal.status === GOAL_STATUS_PENDING_VERIFICATION) {
      if (this._canVerify()) {
        actions += `<button type="button" class="goal-approve-btn" data-id="${goal.id}">Approve</button>`;
        actions += `<button type="button" class="goal-reject-btn" data-id="${goal.id}">Send back</button>`;
      } else actions += `<span class="goal-pending-label">Awaiting approval</span>`;
    } else if (goal.status === GOAL_STATUS_APPROVED) {
      actions += `<span class="goal-approved-label">&#10003; Achieved</span>`;
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
      await this._hass.connection.sendMessagePromise({ type: "family_hub/goals/approve", goal_id: id });
      await this._fetchGoals();
    } catch (e) {
      /* no-op */
    }
  }
  async _rejectGoal(id) {
    const reason = window.prompt("Why is this being sent back? (optional)", "");
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/goals/reject", goal_id: id, reason: reason || "" });
      await this._fetchGoals();
    } catch (e) {
      /* no-op */
    }
  }
  async _toggleRoutineSection(userId, category) {
    const key = `${userId}:${category}`;
    if (this._openRoutineSections.has(key)) this._openRoutineSections.delete(key);
    else this._openRoutineSections.add(key);
    this._render();
  }
  async _toggleRoutineItem(itemId, done) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/routines/toggle", item_id: itemId, done: !!done });
      await this._fetchRoutines();
    } catch (e) {
      /* no-op - a failed toggle just leaves the item as the server last had it, next poll corrects the checkbox */
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
    let actions = "";
    if (status === "open" && !isBin) {
      actions += `<button class="chore-done-btn" data-id="${chore.id}">Done</button>`;
      actions += `<button class="chore-nudge-btn" data-id="${chore.id}" title="Nudge">&#128276;</button>`;
    } else if (status === "open" && isBin && chore.assignment_mode === "first_come_first_served") {
      actions += `<button class="chore-claim-btn" data-id="${chore.id}">Claim</button>`;
    } else if (status === "pending_verification") {
      if (this._canVerify()) {
        actions += `<button class="chore-approve-btn" data-id="${chore.id}">Approve</button>`;
        actions += `<button class="chore-reject-btn" data-id="${chore.id}" title="Send back - not approved">Reject</button>`;
      } else actions += `<span class="chore-pending-label">Awaiting approval</span>`;
    } else if (status === "approved") {
      actions += `<span class="chore-approved-label">&#10003; Done</span>`;
    }
    // Editing (title/stars/due date/dependencies/triggers/rotation group)
    // is only ever possible for an open chore - chore_engine.update_chore
    // itself refuses anything past that (pending_verification/approved
    // chores get re-opened via reset_recurring_chore or recreated instead,
    // never edited in place) - and only for whoever can already assign
    // chores, the exact same PERMISSION_ASSIGN gate family_hub/chores/
    // update enforces server-side (see ws_update_chore in
    // chores_websocket_api.py) - this is a UI convenience matching an
    // existing backend rule, not a new permission of its own.
    if (status === "open" && this._canAssign()) {
      actions += `<button class="chore-edit-btn" data-id="${chore.id}" title="Edit">&#9998;</button>`;
    }
    const due = chore.due_date ? `<span class="chore-due">Due ${new Date(chore.due_date).toLocaleDateString()}</span>` : "";
    const streak = chore.streak_count > 0 ? `<span class="chore-streak">&#128293; ${chore.streak_count}</span>` : "";
    // v128+: a small "sent back" flag while this chore sits open again
    // after chore_engine.reject_chore - rejected_by/rejected_at/reject_reason
    // are only ever set by a reject (see const.py's CHORE_KEY_REJECT_REASON
    // docstring) and only cleared once the redo is finally approved, so
    // this only shows during the redo window, never on a chore that's
    // simply open for the first time.
    const sentBack = status === "open" && chore.rejected_by ? `<span class="chore-rejected-badge" title="${this._esc(chore.reject_reason || "Sent back - not approved")}">&#8617; Sent back</span>` : "";
    return `
      <div class="chore-card status-${status}" draggable="${this._canAssign() && status === "open" ? "true" : "false"}" data-id="${chore.id}">
        <div class="chore-title">${this._esc(chore.title)}</div>
        <div class="chore-meta">
          <span class="chore-stars">&#11088; ${chore.star_value || 0}</span>
          ${due}
          ${streak}
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
    if (this._isWaitingToRecur(chore)) return "Waiting to recur";
    switch (chore.status) {
      case "open":
        return chore.assigned_to === CHORE_BIN_SENTINEL ? "In the Chore Bin" : "Open";
      case "pending_verification":
        return "Awaiting approval";
      case "approved":
        return "Done";
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
        ${chore.status === "open" && this._canAssign() ? `<button type="button" class="detail-edit-btn">Edit</button>` : ""}
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
        const items = this._chores.filter((c) => c.assigned_to === col.id && !this._isWaitingToRecur(c));
        // Routines never apply to the shared Chore Bin (it isn't a person),
        // so this is skipped there the same way it's skipped for the
        // Waiting to Recur/Rewards columns (those are built separately,
        // outside this per-person map entirely).
        const routinesHtml = col.id !== CHORE_BIN_SENTINEL ? this._routinesBlockHtml(col.id) : "";
        const goalsHtml = col.id !== CHORE_BIN_SENTINEL ? this._goalsBlockHtml(col.id) : "";
        const choresLabel = routinesHtml || goalsHtml ? `<div class="chores-section-label">Chores</div>` : "";
        return `
          <div class="chore-column" data-col-id="${col.id}">
            <div class="chore-col-header" style="border-color:${col.color}">
              <span class="chore-col-dot" style="background:${col.color}"></span>
              <span>${this._esc(col.name)}</span>
              <span class="chore-col-count">${items.length}</span>
            </div>
            ${routinesHtml}
            ${goalsHtml}
            ${choresLabel}
            <div class="chore-col-body" data-col-id="${col.id}">
              ${items.length ? items.map((c) => this._choreCardHtml(c)).join("") : `<div class="chore-col-empty">Nothing here</div>`}
            </div>
          </div>
        `;
      })
      .join("") + (this._waitingToRecurCollapsed() ? "" : this._waitingToRecurColumnHtml()) + (this._showRewardsColumn() ? this._rewardsColumnHtml() : "");

    if (this._canAssign()) this._attachDragHandlers();
    this._root.querySelector(".add-chore-fab").style.display = this._canAssign() ? "" : "none";
    const rewardsToggleBtn = this._root.querySelector(".rewards-toggle-btn");
    if (rewardsToggleBtn) {
      rewardsToggleBtn.hidden = !this._isAdmin();
      rewardsToggleBtn.classList.toggle("active", this._showRewardsColumn());
      rewardsToggleBtn.title = this._showRewardsColumn() ? "Hide the Rewards column" : "Show the Rewards column";
    }
    const waitingToggleBtn = this._root.querySelector(".waiting-recur-toggle-btn");
    if (waitingToggleBtn) {
      const collapsed = this._waitingToRecurCollapsed();
      const waitingCount = this._chores.filter((c) => this._isWaitingToRecur(c)).length;
      waitingToggleBtn.classList.toggle("active", collapsed);
      waitingToggleBtn.title = collapsed ? "Show Waiting to Recur as a column" : "Collapse Waiting to Recur to a button";
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
  // recur_type/recur_interval_days/recur_weekdays, never auto_create_
  // trigger.
  _recurFieldsHtml(chore) {
    const recurType = (chore && chore.recur_type) || "";
    const interval = chore && chore.recur_interval_days ? chore.recur_interval_days : 1;
    const selectedDays = new Set((chore && chore.recur_weekdays) || []);
    const weekdayBtns = WEEKDAY_LABELS.map(
      (label, idx) => `<button type="button" class="weekday-btn ${selectedDays.has(idx) ? "active" : ""}" data-day="${idx}">${label}</button>`
    ).join("");
    return `
      <label>Recurs
        <select class="f-recur-type">
          <option value="" ${recurType === "" ? "selected" : ""}>Doesn't repeat on its own schedule</option>
          <option value="interval" ${recurType === "interval" ? "selected" : ""}>Every few days</option>
          <option value="weekdays" ${recurType === "weekdays" ? "selected" : ""}>Specific days of the week</option>
        </select>
      </label>
      <label class="f-recur-interval-field">Repeat every <input type="number" class="f-recur-interval" min="1" value="${interval}"> day(s)</label>
      <div class="field f-recur-weekdays-field">
        <label>On these days</label>
        <div class="weekday-btn-row">${weekdayBtns}</div>
      </div>
    `;
  }
  _wireRecurFields(box) {
    const typeSel = box.querySelector(".f-recur-type");
    const intervalField = box.querySelector(".f-recur-interval-field");
    const weekdaysField = box.querySelector(".f-recur-weekdays-field");
    const syncRecurFields = () => {
      intervalField.style.display = typeSel.value === "interval" ? "" : "none";
      weekdaysField.style.display = typeSel.value === "weekdays" ? "" : "none";
    };
    typeSel.addEventListener("change", syncRecurFields);
    syncRecurFields();
    box.querySelectorAll(".weekday-btn").forEach((btn) => {
      btn.addEventListener("click", () => btn.classList.toggle("active"));
    });
  }
  // Reads the recur fields into `payload` in place - always sets all three
  // keys (never omits recur_interval_days/recur_weekdays just because the
  // OTHER type is selected) so switching from e.g. weekdays back to "no
  // recurrence" on the Edit form actually clears the stale weekday
  // selection server-side too, matching how due_date/triggers are always
  // sent explicitly on _submitEdit rather than only-when-set.
  _applyRecurFieldsToPayload(box, payload) {
    const recurType = box.querySelector(".f-recur-type").value || null;
    payload.recur_type = recurType;
    payload.recur_interval_days = recurType === "interval" ? Math.max(1, parseInt(box.querySelector(".f-recur-interval").value, 10) || 1) : 0;
    payload.recur_weekdays = recurType === "weekdays"
      ? Array.from(box.querySelectorAll(".weekday-btn.active")).map((btn) => parseInt(btn.dataset.day, 10))
      : [];
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
    const routineTab = this._routinesEnabled() ? `<button type="button" class="modal-tab" data-tab="routine">Routine</button>` : "";
    box.innerHTML = `
      <div class="modal-tabs">
        <button type="button" class="modal-tab active" data-tab="chore">Chore</button>
        <button type="button" class="modal-tab" data-tab="goal">Goal</button>
        ${routineTab}
      </div>
      <div class="tab-pane chore-pane">
        <label>Title<input type="text" class="f-title" placeholder="Take out the trash"></label>
        <label>Assignment mode
          <select class="f-mode">${ASSIGNMENT_MODES.map((m) => `<option value="${m.value}">${m.label}</option>`).join("")}</select>
        </label>
        <label class="f-direct-field">Assigned to
          <select class="f-assigned"><option value="${CHORE_BIN_SENTINEL}">Chore Bin</option>${userOptions}</select>
        </label>
        <label>Star value<input type="number" class="f-stars" min="0" value="0"></label>
        <label>Due date<input type="datetime-local" class="f-due"></label>
        ${this._remindFieldsHtml(null)}
        <label>Overdue penalty (stars)<input type="number" class="f-penalty" min="0" value="0"></label>
        <label>Notes<textarea class="f-notes" rows="3" placeholder="Any details worth knowing - which bin, where to leave it, etc."></textarea></label>
        <label>Depends on<select class="f-deps" multiple>${depOptions}</select></label>
        ${this._recurFieldsHtml(null)}
        <details class="advanced">
          <summary>Advanced Settings</summary>
          <label class="f-rotation-field">Rotation group (in order)<select class="f-rotation" multiple>${userOptions}</select></label>
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
        </details>
      </div>
      <div class="tab-pane goal-pane" hidden>
        <label>Title<input type="text" class="g-title" placeholder="Get 3 Bs in math"></label>
        <label>For<select class="g-assigned">${userOptions}</select></label>
        <label>Target count (how many times to log before it's done)<input type="number" class="g-target" min="1" value="1"></label>
        ${this._goalRewardFieldsHtml(null)}
        <label>Due date (optional)<input type="datetime-local" class="g-due"></label>
        <label>Notes<textarea class="g-notes" rows="3" placeholder="Any details worth knowing"></textarea></label>
      </div>
      ${this._routinesEnabled() ? `<div class="tab-pane routine-pane" hidden>${this._routineManagePaneHtml()}</div>` : ""}
      <div class="modal-actions">
        <button class="cancel-btn">Cancel</button>
        <button class="save-btn">Create</button>
      </div>
      <div class="form-error"></div>
    `;
    const modeSel = box.querySelector(".f-mode");
    const directField = box.querySelector(".f-direct-field");
    const rotationField = box.querySelector(".f-rotation-field");
    const syncModeFields = () => {
      directField.style.display = modeSel.value === "direct" ? "" : "none";
      rotationField.style.display = modeSel.value === "auto_rotation" ? "" : "none";
    };
    modeSel.addEventListener("change", syncModeFields);
    syncModeFields();
    this._wireRecurFields(box);
    this._wireRemindFields(box);
    this._wireGoalRewardFields(box);
    this._wireModalTabs(box);
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
  _wireModalTabs(box) {
    box.dataset.activeTab = "chore";
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
      });
    });
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
    const members = this._memberUsers();
    const defaultPersonId = this._defaultRoutineManagePersonId(members);
    const personOptions = members
      .map((u) => `<option value="${u.id}" ${u.id === defaultPersonId ? "selected" : ""}>${this._esc(u.name)}</option>`)
      .join("");
    const categoryOptions = ROUTINE_CATEGORIES.map((c) => `<option value="${c}">${ROUTINE_CATEGORY_LABELS[c]}</option>`).join("");
    const dayToggles = WEEKDAY_LABELS.map((label, i) => `<button type="button" class="rm-day-toggle" data-day="${i}">${label}</button>`).join("");
    return `
      <div class="routine-manage">
        ${members.length ? "" : `<div class="rm-empty">Add someone to Family Hub first (Settings &rarr; Users) before giving them routine items.</div>`}
        <div class="rm-filters">
          <label class="rm-filter-label">Person<select class="rm-person">${personOptions}</select></label>
          <label class="rm-filter-label">Time of day<select class="rm-category">${categoryOptions}</select></label>
        </div>
        <div class="rm-add-form">
          <input type="text" class="rm-add-title" placeholder="Item title (e.g. Brush teeth)">
          <input type="time" class="rm-add-time" title="Due time (optional)">
          <div class="rm-days" data-role="add">${dayToggles}</div>
          <div class="rm-hint">Tap the days this applies to - leave them all off for every day.</div>
          <button type="button" class="rm-add-btn">Add Item</button>
        </div>
        <div class="rm-error"></div>
        <div class="rm-list"></div>
      </div>
    `;
  }
  _routineManageItemHtml(item) {
    if (this._routineManageEditingId === item.id) {
      const dayToggles = WEEKDAY_LABELS.map(
        (label, i) => `<button type="button" class="rm-day-toggle ${item.days_of_week && item.days_of_week.includes(i) ? "active" : ""}" data-day="${i}">${label}</button>`
      ).join("");
      return `
        <div class="rm-item-row" data-id="${item.id}">
          <div class="rm-item-edit-form">
            <input type="text" class="rm-edit-title" value="${this._escAttr(item.title)}">
            <input type="time" class="rm-edit-time" value="${item.due_time || ""}">
            <div class="rm-days" data-role="edit">${dayToggles}</div>
            <div class="rm-item-edit-actions">
              <button type="button" class="rm-item-save-btn" data-id="${item.id}">Save</button>
              <button type="button" class="rm-item-cancel-btn" data-id="${item.id}">Cancel</button>
            </div>
          </div>
        </div>
      `;
    }
    const dueBadge = item.due_time ? `<span>${this._esc(this._formatDueTime(item.due_time))}</span>` : "";
    const daysBadge = `<span>${item.days_of_week && item.days_of_week.length ? item.days_of_week.map((d) => WEEKDAY_LABELS[d]).join(" ") : "Every day"}</span>`;
    return `
      <div class="rm-item-row" data-id="${item.id}">
        <div class="rm-item-body">
          <div class="rm-item-title">${this._esc(item.title)}</div>
          <div class="rm-item-meta">${dueBadge}${daysBadge}</div>
        </div>
        <div class="rm-item-actions">
          <button type="button" class="rm-item-edit-btn" data-id="${item.id}" title="Edit">&#9998;</button>
          <button type="button" class="rm-item-delete-btn" data-id="${item.id}" title="Remove">&times;</button>
        </div>
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
      : `<div class="rm-empty">No items yet - add one above.</div>`;
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
    try {
      await this._hass.connection.sendMessagePromise({
        type: "family_hub/routines/create",
        user_id: personId,
        category,
        title,
        due_time: dueTime,
        days_of_week: daysOfWeek,
      });
    } catch (e) {
      errEl.textContent = (e && e.message) || "Couldn't add this item.";
      return;
    }
    await this._fetchRoutines();
    const box2 = this._root.querySelector(".create-modal .modal-box");
    if (!box2) return;
    box2.querySelector(".rm-add-title").value = "";
    box2.querySelector(".rm-add-time").value = "";
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
      addedErrEl.textContent = `Added "${title}" for ${addedPerson ? addedPerson.name : "that person"} • ${ROUTINE_CATEGORY_LABELS[category] || category}.`;
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
    try {
      await this._hass.connection.sendMessagePromise({
        type: "family_hub/routines/update",
        item_id: itemId,
        title,
        due_time: dueTime,
        days_of_week: daysOfWeek,
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
    };
    this._applyRecurFieldsToPayload(box, payload);
    if (mode === "direct") payload.assigned_to = box.querySelector(".f-assigned").value;
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
    try {
      const result = await this._hass.connection.sendMessagePromise(payload);
      if (!result || !result.chore) throw new Error("no chore returned");
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
      <h3>Edit chore</h3>
      <label>Title<input type="text" class="f-title" value="${this._escAttr(chore.title)}"></label>
      <label>Star value<input type="number" class="f-stars" min="0" value="${chore.star_value || 0}"></label>
      <label>Due date<input type="datetime-local" class="f-due" value="${this._isoToLocalDatetimeInputValue(chore.due_date)}"></label>
      ${this._remindFieldsHtml(chore)}
      <label>Overdue penalty (stars)<input type="number" class="f-penalty" min="0" value="${chore.overdue_penalty || 0}"></label>
      <label>Notes<textarea class="f-notes" rows="3" placeholder="Any details worth knowing - which bin, where to leave it, etc.">${this._esc(chore.notes || "")}</textarea></label>
      <label>Depends on<select class="f-deps" multiple>${depOptions}</select></label>
      ${this._recurFieldsHtml(chore)}
      <details class="advanced">
        <summary>Advanced Settings</summary>
        ${rotationFieldHtml}
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
      </details>
      <div class="modal-actions">
        <button class="cancel-btn">Cancel</button>
        <button class="save-btn">Save</button>
      </div>
      <div class="form-error"></div>
    `;
    this._wireRecurFields(box);
    this._wireRemindFields(box);
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
      :host { display: block; height: 100%; font-family: "Arial Rounded MT Std", "Arial Rounded MT", "Varela Round", -apple-system, "Segoe UI Rounded", "Segoe UI", Roboto, sans-serif;
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
      .title { font-size: 20px; font-weight: 800; }
      .actions { display: flex; gap: 8px; }
      /* Same pixel-for-pixel treatment as family-week-calendar-card.js's own
         add-event-fab (size, corner offset, circle, colors, shadow, tap
         feedback) - a deliberately identical look across both cards rather
         than each having its own take on "the + button". */
      .add-chore-fab { position: fixed; right: 18px; bottom: 18px; z-index: 900; width: 56px; height: 56px; border-radius: 50%; border: none; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 28px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(58,53,44,0.35); transition: transform 0.15s ease; }
      .add-chore-fab:active { transform: scale(0.94); }
      .rewards-toggle-btn { border: 1px solid var(--fc-border); border-radius: 14px; padding: 8px 12px; font-weight: 700; background: var(--fc-surface-alt); color: var(--fc-text); cursor: pointer; }
      .rewards-toggle-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      /* Not .active until Waiting to Recur is actually collapsed to this
         bar button (see _toggleWaitingToRecurCollapsed) - the reverse of
         .rewards-toggle-btn's own active meaning ("shown"), since here the
         button itself IS the collapsed state, not a way into a hidden one. */
      .waiting-recur-toggle-btn { border: 1px solid var(--fc-border); border-radius: 14px; padding: 8px 12px; font-weight: 700; background: var(--fc-surface-alt); color: var(--fc-text); cursor: pointer; }
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
      /* --- Routine tab (FAB modal) - "manage items" pane, v136+ --- */
      .routine-manage { display: flex; flex-direction: column; gap: 8px; }
      .rm-filters { display: flex; gap: 6px; }
      .rm-filter-label { flex: 1; display: flex; flex-direction: column; gap: 2px; font-size: 10px; font-weight: 700; color: var(--fc-text-secondary); text-transform: uppercase; letter-spacing: 0.02em; }
      .rm-filters select { margin: 0; width: 100%; box-sizing: border-box; text-transform: none; font-weight: 400; letter-spacing: normal; font-size: 12px; }
      .rm-error.rm-success { color: var(--fc-accent2); }
      .rm-add-form { background: var(--fc-surface2); border-radius: 10px; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
      .rm-add-form input[type="text"], .rm-add-form input[type="time"] { box-sizing: border-box; width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 12px; font-family: inherit; }
      .rm-days { display: flex; flex-wrap: wrap; gap: 4px; }
      .rm-day-toggle { border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); border-radius: 6px; padding: 4px 8px; font-size: 11px; font-weight: 700; cursor: pointer; }
      .rm-day-toggle.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      .rm-hint { font-size: 10px; color: var(--fc-text-secondary); }
      .rm-add-btn, .rm-item-save-btn { border: none; border-radius: 8px; padding: 7px 10px; font-weight: 700; font-size: 12px; cursor: pointer; background: var(--fc-accent); color: var(--fc-accent-text); align-self: flex-start; }
      .rm-error { color: var(--fc-accent3); font-size: 11px; min-height: 13px; }
      .rm-list { display: flex; flex-direction: column; gap: 6px; }
      .rm-item-row { display: flex; align-items: flex-start; gap: 6px; background: var(--fc-card); border: 1px solid var(--fc-border); border-radius: 8px; padding: 6px 8px; }
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
      .chore-card.status-pending_verification { opacity: .85; }
      .chore-card.status-approved { opacity: .55; }
      .chore-title { font-weight: 700; font-size: 14px; margin-bottom: 4px; }
      .chore-meta { display: flex; gap: 8px; font-size: 12px; color: var(--fc-text-secondary); flex-wrap: wrap; }
      .chore-actions { margin-top: 6px; display: flex; gap: 6px; align-items: center; }
      .chore-actions button { border: none; border-radius: 8px; padding: 5px 10px; font-size: 12px; font-weight: 700; cursor: pointer; background: var(--fc-accent2); color: #fff; }
      .chore-nudge-btn { background: var(--fc-surface-alt) !important; color: var(--fc-text) !important; }
      .chore-edit-btn { background: var(--fc-surface-alt) !important; color: var(--fc-text) !important; }
      .chore-approve-btn { background: var(--fc-accent) !important; color: var(--fc-accent-text) !important; }
      .chore-reject-btn { background: var(--fc-surface-alt) !important; color: var(--fc-accent3) !important; }
      .chore-rejected-badge { display: inline-block; font-size: 11px; color: var(--fc-accent3); background: var(--fc-surface-alt); border-radius: 8px; padding: 2px 6px; margin-top: 4px; }
      .chore-pending-label, .chore-approved-label { font-size: 12px; color: var(--fc-text-secondary); }
      .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; align-items: center; justify-content: center; }
      .modal-overlay.open { display: flex; }
      .modal-box { background: var(--fc-bg); color: var(--fc-text); border-radius: 14px; padding: 18px; width: min(90vw, 480px); max-height: 85vh; overflow-y: auto; }
      .modal-box label { display: block; margin: 8px 0; font-size: 13px; font-weight: 700; }
      .modal-box input, .modal-box select, .modal-box textarea { width: 100%; box-sizing: border-box; margin-top: 4px; padding: 8px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 13px; font-family: inherit; }
      .modal-box textarea { resize: vertical; }
      .modal-box fieldset { border: 1px solid var(--fc-border); border-radius: 8px; margin: 8px 0; }
      .modal-tabs { display: flex; gap: 4px; margin-bottom: 10px; border-bottom: 1px solid var(--fc-border); }
      .modal-tab { flex: 1; border: none; background: none; color: var(--fc-text-secondary); font-weight: 800; font-size: 13px; padding: 8px 4px; cursor: pointer; border-bottom: 2px solid transparent; }
      .modal-tab.active { color: var(--fc-accent); border-bottom-color: var(--fc-accent); }
      .goal-pane[hidden], .chore-pane[hidden] { display: none; }
      .g-star-value-field, .g-reward-item-field { display: block; }
      .weekday-btn-row { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
      .weekday-btn { border: 1px solid var(--fc-border); border-radius: 8px; padding: 6px 8px; font-size: 12px; font-weight: 700; background: var(--fc-card); color: var(--fc-text); cursor: pointer; }
      .weekday-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      .f-remind-row { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
      .f-remind-opt { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--fc-border); border-radius: 8px; padding: 6px 8px; font-size: 12px; font-weight: 700; background: var(--fc-card); color: var(--fc-text); cursor: pointer; margin: 0; }
      .f-remind-opt input { width: auto; margin: 0; }
      .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
      .modal-actions button { border: none; border-radius: 10px; padding: 8px 16px; font-weight: 700; cursor: pointer; }
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
    `;
  }
}

if (!customElements.get("family-hub-chores-card")) {
  customElements.define("family-hub-chores-card", FamilyHubChoresCard);
}
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "family-hub-chores-card")) {
  window.customCards.push({
    type: "family-hub-chores-card",
    name: "Family Hub Chores",
    description: "Full-screen chores board - one column per family member added to Family Hub plus a shared Chore Bin, drag-and-drop assignment, a creation form (and matching edit form for open chores) with sensor-trigger/rotation Advanced Settings, and one-click Nudge. Manage who's added to Family Hub and their permissions from the Family Hub calendar card's own Settings.",
  });
}
