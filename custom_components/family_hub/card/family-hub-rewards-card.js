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

class FamilyHubRewardsCard extends HTMLElement {
  static getStubConfig() {
    return { title: "Rewards" };
  }
  static getConfigForm() {
    return { schema: [{ name: "title", selector: { text: {} } }], computeLabel: (s) => (s.name === "title" ? "Title" : undefined) };
  }
  setConfig(config) {
    this._config = { title: (config && config.title) || "Rewards" };
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
    await Promise.all([this._fetchSettings(), this._fetchUsers(), this._fetchRewardsState(), this._fetchMyPermissions()]);
    if (this._getSettings().useGlobalTheme) await this._fetchGlobalThemes();
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
  }
  disconnectedCallback() {
    if (this._interval) clearInterval(this._interval);
    this._interval = null;
    if (window.__familyHubScreenSaver) window.__familyHubScreenSaver.unregisterClient(this);
  }
  getCardSize() {
    return 6;
  }
  getGridOptions() {
    return { columns: 8, min_columns: 6, max_columns: 12, min_rows: 6 };
  }
  // v144+ task #29: while a kiosk PIN elevation is active (this._kioskElevation,
  // see _submitKioskLogin), _isAdmin/_myUserId/_hasPermission all answer AS
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
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/kiosk/elevate", user_id: userId, pin });
      this._kioskElevation = result;
      this._closeKioskLoginModal();
      this._updateKioskLoginUi();
      this._resetKioskIdleTimer();
      // Everything on the card (whose balance is "mine", which action
      // buttons show) is derived from _myUserId/_hasPermission, both now
      // elevation-aware - re-rendering is what actually makes the card
      // reflect the newly logged-in person.
      this._render();
    } catch (e) {
      if (errEl) errEl.textContent = (e && e.message) || "Incorrect PIN.";
      if (pinEl) {
        pinEl.value = "";
        pinEl.focus();
      }
    }
  }
  // Auto logout after 45 seconds of inactivity, per the spec - re-armed by
  // any tap/key/scroll on this card (see _build's own activity listeners)
  // while elevated; a no-op the rest of the time so this card isn't
  // running a timer nobody asked for.
  _resetKioskIdleTimer() {
    if (this._kioskIdleTimer) {
      clearTimeout(this._kioskIdleTimer);
      this._kioskIdleTimer = null;
    }
    if (!this._kioskElevation) return;
    this._kioskIdleTimer = setTimeout(() => this._kioskLogout(), 45000);
  }
  async _kioskLogout() {
    if (this._kioskIdleTimer) {
      clearTimeout(this._kioskIdleTimer);
      this._kioskIdleTimer = null;
    }
    const elevation = this._kioskElevation;
    this._kioskElevation = null;
    this._updateKioskLoginUi();
    this._render();
    if (elevation && this._hass) {
      try {
        // Best-effort - even if this fails (offline, etc.) the token's own
        // KIOSK_ELEVATION_TTL_SECONDS backstop on the backend still expires
        // it; the UI has already logged out locally either way.
        await this._hass.connection.sendMessagePromise({ type: "family_hub/kiosk/deelevate", token: elevation.token });
      } catch (e) {
        /* best-effort */
      }
    }
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
  _resolveTheme(settings) {
    const override = this._getDeviceThemeOverride();
    const useGlobalTheme = override ? override !== "__default__" : settings.useGlobalTheme;
    const globalThemeId = override ? (override === "__default__" ? "" : override) : settings.globalThemeId;
    const local = settings.theme || this._defaultTheme();
    if (!useGlobalTheme || !globalThemeId) return local;
    const g = (this._globalThemes || []).find((t) => t && t.id === globalThemeId);
    if (!g) return local;
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
  _hexToRgba(hex, alpha) {
    const h = (hex || "#000000").replace("#", "");
    if (h.length !== 6) return "rgba(0,0,0,0)";
    const r = parseInt(h.substr(0, 2), 16);
    const g = parseInt(h.substr(2, 2), 16);
    const b = parseInt(h.substr(4, 2), 16);
    const a = Math.max(0, Math.min(1, typeof alpha === "number" ? alpha : 1));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
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
    this.style.setProperty("--fc-bg", theme.colors.bg);
    this.style.setProperty("--fc-card", this._hexToRgba(theme.colors.card, cardOpacity / 100));
    this.style.setProperty("--fc-border", theme.colors.border);
    this.style.setProperty("--fc-text", theme.colors.text);
    this.style.setProperty("--fc-text-secondary", theme.colors.textSecondary);
    this.style.setProperty("--fc-accent", theme.colors.accent);
    this.style.setProperty("--fc-accent-text", theme.colors.accentText);
    this.style.setProperty("--fc-accent2", theme.colors.accent2);
    this.style.setProperty("--fc-accent3", theme.colors.accent3);
    this.style.setProperty("--fc-surface-alt", this._hexToRgba(theme.colors.surfaceAlt, cardOpacity / 100));
    this.style.setProperty("--fc-surface2", this._hexToRgba(theme.colors.surface2, cardOpacity / 100));
    this.style.setProperty("--fc-glass-blur", `${glassBlur}px`);
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
    this.attachShadow({ mode: "open" });
    const root = this.shadowRoot;
    root.innerHTML = `
      <style>${this._css()}</style>
      <ha-card>
        <div class="header">
          <div class="title"></div>
          <div class="actions">
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
    // v144+ task #29: kiosk PIN login - see _onKioskLoginBtnClick's own
    // docstring for the full picture.
    root.querySelector(".kiosk-login-btn").addEventListener("click", () => this._onKioskLoginBtnClick());
    root.querySelector(".kiosk-login-close").addEventListener("click", () => this._closeKioskLoginModal());
    root.querySelector(".kiosk-login-cancel").addEventListener("click", () => this._closeKioskLoginModal());
    root.querySelector(".kiosk-login-submit").addEventListener("click", () => this._submitKioskLogin());
    root.querySelector(".kiosk-login-pin-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._submitKioskLogin();
    });
    // Any tap/key/scroll anywhere on the card resets the 45-second idle
    // clock while elevated - same convention as family-hub-chores-card.js's
    // own identical listeners, scoped to this card's own root.
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach((evt) => {
      root.addEventListener(evt, () => this._resetKioskIdleTimer(), { passive: true });
    });
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
    if (claimBtn) return this._claim(claimBtn.dataset.id);
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
    const historyDeleteBtn = e.target.closest(".history-delete-btn");
    if (historyDeleteBtn) return this._deleteRedemption(historyDeleteBtn.dataset.id);
    const historyReverseBtn = e.target.closest(".history-reverse-btn");
    if (historyReverseBtn) return this._reverseRedemption(historyReverseBtn.dataset.id);

    // v128+: click a person's name in the balances row to see their full
    // star history (chore stars earned/deducted, redemptions, bank
    // credits/spends - see _openStarHistoryModal).
    const balanceNameBtn = e.target.closest(".balance-name");
    if (balanceNameBtn) return this._openStarHistoryModal(balanceNameBtn.dataset.user);
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
        const redeemMode = box.querySelector(".m-redeem-mode").value || "instant";
        const requiresFulfillment = box.querySelector(".m-requires-fulfillment").checked;
        const payload = {
          type: "family_hub/rewards/update_catalog_item", item_id: existingItem.id, title, cost_stars: cost, icon, color,
          value_note: valueNote, redeem_mode: redeemMode, requires_fulfillment: requiresFulfillment,
        };
        if (redeemMode === "banked") {
          payload.stack_unit_amount = parseFloat(box.querySelector(".m-stack-amount").value) || 1;
          payload.stack_unit_label = (box.querySelector(".m-stack-label").value || "").trim();
        }
        await this._hass.connection.sendMessagePromise(payload);
      } else if (canPrice) {
        const cost = parseInt(box.querySelector(".m-cost").value, 10) || 0;
        const valueNote = (box.querySelector(".m-value-note").value || "").trim();
        const redeemMode = box.querySelector(".m-redeem-mode").value || "instant";
        const requiresFulfillment = box.querySelector(".m-requires-fulfillment").checked;
        const payload = {
          type: "family_hub/rewards/add_catalog_item", title, cost_stars: cost, icon, color,
          value_note: valueNote, redeem_mode: redeemMode, requires_fulfillment: requiresFulfillment,
        };
        if (redeemMode === "banked") {
          payload.stack_unit_amount = parseFloat(box.querySelector(".m-stack-amount").value) || 1;
          payload.stack_unit_label = (box.querySelector(".m-stack-label").value || "").trim();
        }
        await this._hass.connection.sendMessagePromise(payload);
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
    return `
      <div class="balance-card" style="border-color:${this._userColor(user.id)}">
        <span class="balance-dot" style="background:${this._userColor(user.id)}"></span>
        <button type="button" class="balance-name" data-user="${user.id}" title="See ${this._esc(user.name)}'s full star history">${this._esc(user.name)}</button>
        <span class="balance-stars">&#11088; ${bal}</span>
        ${canGift ? `<button type="button" class="gift-stars-btn" data-user="${user.id}" data-name="${this._esc(user.name)}" title="Gift some of your own stars to ${this._esc(user.name)}">&#127873;</button>` : ""}
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
    const claimLabel = mode === "banked" ? "Add" : "Claim";
    return `
      <div class="catalog-item" data-id="${item.id}"${this._catalogAccentStyle(item)}>
        <div class="catalog-icon">${item.icon || "&#127873;"}</div>
        <div class="catalog-title">${this._esc(item.title)}</div>
        <div class="catalog-cost">&#11088; ${item.cost_stars}</div>
        ${valueNote}
        ${modeBadge}
        ${bankDisplay}
        <button class="claim-btn" data-id="${item.id}" ${affordable ? "" : "disabled"}>${claimLabel}</button>
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
      :host { display: block; height: 100%; font-family: "Arial Rounded MT Std", "Arial Rounded MT", "Varela Round", -apple-system, "Segoe UI Rounded", "Segoe UI", Roboto, sans-serif;
        --fc-bg: #fbf7e5; --fc-card: #f5f3f0; --fc-border: #e6ddc4; --fc-text: #423d34; --fc-text-secondary: #96877a;
        --fc-accent: #8f5a00; --fc-accent-text: #fff8ea; --fc-accent2: #305545; --fc-accent3: #b5583c;
        --fc-surface-alt: #efe6cf; --fc-surface2: #f2eede; }
      ha-card { background: var(--fc-bg); color: var(--fc-text); padding: 14px; height: 100%; box-sizing: border-box; overflow-y: auto; }
      .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
      .title { font-size: 18px; font-weight: 800; }
      .actions { display: flex; align-items: center; gap: 8px; }
      .manage-btn { border: none; border-radius: 12px; padding: 6px 12px; font-size: 12px; font-weight: 700; background: var(--fc-surface-alt); color: var(--fc-text); cursor: pointer; }
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
      .add-reward-fab { position: fixed; right: 18px; bottom: 18px; z-index: 900; width: 56px; height: 56px; border-radius: 50%; border: none; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 28px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(58,53,44,0.35); transition: transform 0.15s ease; }
      .add-reward-fab:active { transform: scale(0.94); }
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
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "family-hub-rewards-card")) {
  window.customCards.push({
    type: "family-hub-rewards-card",
    name: "Family Hub Rewards",
    description: "Star economy ledger - household star balances, a browsable reward catalog with a one-click claim, and recent redemption history.",
  });
}
