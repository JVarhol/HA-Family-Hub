// Family Hub Goals card (v133+, v143+ "My Goals") - progress-tracked
// achievements a household attaches a reward to ("get 3 Bs in math,"
// "practice piano 2 times"), as opposed to family-hub-chores-card.js's own
// "do this one concrete thing, on a schedule" chores. See goal_engine.py's
// own module docstring for the full backend picture (open ->
// pending_verification -> approved, same shape as Chores' own verification
// gate) and const.py's GOAL_REWARD_TYPE_* docstring for the per-goal
// stars-vs-catalog-item reward choice.
//
// v143+ task #30: this used to render one column PER household member (a
// shared board, same shape as Chores' own board) - the household asked for
// it to become a personal "My Goals" card instead, showing only the logged-
// in viewer's own goals, so a kiosk/tablet parked in one person's room (or
// several people sharing one dashboard) doesn't have to scroll past
// everyone else's goals to find their own. See _boardHtml below for the
// single-list rendering this replaced the per-person columns with. The
// custom element tag (family-hub-goals-card) and every websocket command it
// calls are UNCHANGED - only what gets displayed narrowed - so an existing
// dashboard that already has this card keeps working with no reconfiguration;
// create/edit still lets someone with manage authority set a goal up for any
// household member (a parent setting up a goal for a kid from their own
// tablet), it just won't show back up on the CREATOR's own board unless it's
// also assigned to them - same as My Chores never showing chores assigned to
// someone else.
//
// A standalone card, independently addable to any dashboard - deliberately
// NOT nested inside family-hub-chores-card.js (the household's own answer to
// "same page or separate" was "either is fine," and a standalone card is the
// one shape that supports BOTH: put it on its own view for "separate," or
// drop it onto the same dashboard view right below the Chores board for
// "same page" - either way it's the identical card, no toggle to build or
// maintain).
//
// Same self-contained, independently-loaded-Lovelace-resource shape as every
// other Family Hub card - small constants (PALETTE) and helpers (_esc/
// _escAttr/_isoToLocalDatetimeInputValue) are copy-pasted rather than
// imported, matching this project's established convention.

const PALETTE = ["#a9c6c2", "#dba99c", "#d9bf7e", "#a8bd93", "#b9a7c9", "#cf8f6c", "#a89a83"];
const GOAL_REWARD_TYPE_STARS = "stars";
const GOAL_REWARD_TYPE_CATALOG_ITEM = "catalog_item";
const GOAL_STATUS_OPEN = "open";
const GOAL_STATUS_PENDING_VERIFICATION = "pending_verification";
const GOAL_STATUS_APPROVED = "approved";
// v144.13+: household report - "show goal reward (stars) when a goal is
// complete, add a button to complete (moves to the completed accordion)."
// An approved goal used to just sit in the same flat My Goals list forever
// (see _goalCardHtml's own `.status-approved { opacity: 0.6 }` - the only
// concession that was ever made for it), same complaint as chores had
// before their own Completed accordion existed, except chores age
// themselves out automatically and goals had no equivalent at all - see
// goal_engine.archive_goal's own docstring.
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

class FamilyHubGoalsCard extends HTMLElement {
  static getStubConfig() {
    return { title: "My Goals" };
  }
  // v1.111.0+: switched from getConfigForm (a static schema) to
  // getConfigElement (a real custom element with its own hass/config
  // lifecycle) solely so the new theme_override field below can offer a
  // live-fetched list of themes - see FamilyHubGoalsCardEditor at the
  // bottom of this file for the full reasoning and the rest of the form.
  static getConfigElement() {
    return document.createElement("family-hub-goals-card-editor");
  }
  // v1.110.7+: see family-hub-chores-card.js's identical setConfig/
  // _registerFabCoordinator comment for the full "dashboard" vs "card"
  // design note - same option, same mechanism, on every FAB-bearing card.
  setConfig(config) {
    this._config = {
      title: (config && config.title) || "My Goals",
      fab_position: config && config.fab_position === "card" ? "card" : "dashboard",
      // v1.111.0+: per-card-placement Theme override, set from this card's
      // own "Edit Card" dialog - "" (the default, untouched by every
      // existing dashboard) means "Use device settings," i.e. exactly the
      // pre-1.111.0 behavior (device override, else household Global
      // Theme, else this card's own local theme). See _resolveTheme below
      // for where this actually takes priority.
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
    if (first) this._firstLoadPromise = this._initFirstLoad();
  }
  async _initFirstLoad() {
    await Promise.all([this._fetchSettings(), this._fetchUsers(), this._fetchGoals(), this._fetchCatalog(), this._fetchMyPermissions()]);
    // v1.111.0+: always fetched now, not just when the household has
    // useGlobalTheme on - a per-card theme_override needs this list
    // regardless of the household's own Global Theme setting.
    await this._fetchGlobalThemes();
    this._startPolling();
    this._registerFabCoordinator();
    this._render();
  }
  // v1.110.4+: joins the shared FAB-stacking coordinator (see the
  // singleton block above this class) - unlike Chores/Rewards this card
  // never SETS `providesGoalTab` (it has no tab, just its own single FAB),
  // but it READS `otherProvidesGoalTab` off every layout update to decide
  // whether to suppress its own add-goal-fab - see the coordinator block's
  // own docstring for the full reasoning on why only this direction is
  // handled.
  //
  // v1.110.7+: fab_position "card" toggles the [fab-position="card"] host
  // attribute (position:fixed -> :host-relative position:absolute) and
  // registers with takesSlot:false - it stays a full coordinator member
  // (so it still reads otherProvidesGoalTab and still suppresses itself
  // correctly even while card-relative), it just never occupies a shared
  // viewport-corner stacking slot. See family-hub-chores-card.js's
  // identical comment for the fuller reasoning.
  _registerFabCoordinator() {
    if (!window.__familyHubFabCoordinator) return;
    const cardRelative = this._config && this._config.fab_position === "card";
    if (cardRelative) this.setAttribute("fab-position", "card");
    else this.removeAttribute("fab-position");
    window.__familyHubFabCoordinator.registerClient(this, "goals", {}, (state) => {
      this.style.setProperty("--fh-fab-offset", `${state.offsetPx}px`);
      this._fabSuppressedByOther = state.otherProvidesGoalTab;
      this._applyFabVisibility();
    }, { takesSlot: !cardRelative });
  }
  _applyFabVisibility() {
    const fab = this._root && this._root.querySelector(".add-goal-fab");
    if (fab) fab.hidden = !this._canManageGoals() || !!this._fabSuppressedByOther;
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
  // Same family_hub/permissions/get_mine pattern as every other Family Hub
  // card - see family-hub-rewards-card.js's own identical _fetchMyPermissions
  // for the full reasoning on why this is copy-pasted rather than shared.
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
  // Same PERMISSION_ASSIGN tier Chores itself uses for create/edit/delete -
  // chores_websocket_api.py's own ws_create_goal/ws_update_goal/ws_delete_goal
  // gate on this same permission server-side (see that file's Goals
  // section), this is purely the UI-gating mirror of that check.
  _canManageGoals() {
    return this._hasPermission("can_assign");
  }
  // Same PERMISSION_VERIFY-or-PERMISSION_COMPLETE_ANY tier ws_complete_chore
  // already uses, mirrored here for "can log progress on someone else's
  // goal" - the assignee themselves never needs this (see _canLogProgress).
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
  // liquid-glass-fallback logic (see the v144.5+ comment this used to live
  // under) only needs to exist once in this file.
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
    // v1.111.0+: a per-card-placement Theme override (set from this card's
    // own native "Edit Card" dialog) wins over everything else, including
    // this device's own override and the household's Global Theme - it's
    // the most specific choice available, same "more specific wins"
    // precedent the device override below already established over the
    // household setting. "" (untouched/default) falls straight through to
    // the exact pre-1.111.0 behavior.
    const cardOverride = this._config && this._config.theme_override;
    if (cardOverride) {
      const g = (this._globalThemes || []).find((t) => t && t.id === cardOverride);
      if (g) return this._themeFromGlobalEntry(g);
      // An override pointing at a theme that's since been deleted/renamed
      // falls back to the normal device/household resolution below rather
      // than silently going blank - same "never leave a stale reference
      // broken, just fall through" convention as a stale primaryCalendar.
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
    // - duplicated (not shared/imported) from family-week-calendar-card.js's
    // own _fetchGlobalThemes/_nativeHaThemeEntries, same "independently
    // loaded Lovelace resources duplicate small helpers" convention as
    // every native/websocket pair elsewhere in this project. Needed so a
    // per-card theme_override can point at a native theme too, matching
    // exactly what the household's own Global Theme picker already offers.
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
  // Note: this card's own theme shape has no `fonts` concept (unlike
  // family-week-calendar-card.js's version of this same method) - only
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
  async _fetchGoals() {
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/goals/list" });
      this._goals = (result && Array.isArray(result.goals)) ? result.goals : [];
    } catch (e) {
      /* keep whatever we had */
    }
    this._render();
  }
  // Only the catalog array is actually used here (the reward-item picker on
  // the Create/Edit modal, and showing a chosen item's own title/icon on a
  // goal card) - family_hub/rewards/get_state is the only websocket command
  // that exposes it, so the rest of its response is simply ignored.
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
  // Same narrower includeInChores opt-out Chores/Rewards already read -
  // Goals shares the exact same assignee-eligibility pool as Chores (see
  // chores_websocket_api.py's own _make_is_chores_eligible reuse for the
  // Goals commands), so there's no separate "includeInGoals" flag to check
  // here either.
  _isChoresIncluded(userId) {
    if (!this._isFamilyHubMember(userId)) return false;
    const profiles = (this._settingsCache && this._settingsCache.userProfiles) || {};
    const profile = profiles[userId];
    return !profile || profile.includeInChores !== false;
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
        </div>
        <div class="board"></div>
      </ha-card>
      <div class="modal-overlay create-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay edit-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay reject-modal"><div class="modal-box"></div></div>
      <button class="add-goal-fab" title="Add a goal" aria-haspopup="true" hidden>&#65291;</button>
    `;
    this._root = root;
    root.querySelector(".title").textContent = this._config.title;
    root.querySelector(".add-goal-fab").addEventListener("click", () => this._openCreateModal());
    root.querySelectorAll(".modal-overlay").forEach((overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.classList.remove("open");
      });
    });
    // Delegated click handling for every goal-card action button, same
    // pattern family-hub-chores-card.js's own board uses - the board's
    // innerHTML gets fully rebuilt on every render, so binding once on a
    // stable ancestor (not per-button, per-render) is what actually keeps
    // working after a re-render.
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
      /* server already validated/permission-gated this - a stale click just no-ops */
    }
    await this._fetchGoals();
  }
  async _approve(goalId) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/goals/approve", goal_id: goalId });
    } catch (e) {
      /* ignore */
    }
    await this._fetchGoals();
  }
  // v144.13+: was a bare window.prompt() for the optional reason - replaced
  // with a proper modal (the household's own "send back reason should be a
  // modal" request, applied here and to both of family-hub-chores-card.js's
  // own reject flows - chores and its embedded Goals view - the same way).
  // Same "reason is always optional, Cancel truly cancels (unlike the old
  // prompt(), where hitting Cancel/Esc still sent the reject through with
  // an empty reason - a real modal can actually tell 'Cancel the whole
  // thing' apart from 'Send back with nothing written')" behavior, just in
  // a modal instead of a native browser prompt.
  _openRejectModal(goalId) {
    const goal = this._goals.find((g) => g.id === goalId);
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
      /* server already validated/permission-gated this - a stale click just no-ops */
    }
    await this._fetchGoals();
  }
  // The "Complete" button on an achieved goal - tucks it into the
  // Completed accordion below the active list instead of leaving it
  // sitting in place forever. No confirmation prompt (unlike _delete) -
  // this isn't destructive, the goal and its reward history are untouched,
  // it's just moving to a different section of the same list.
  async _archive(goalId) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/goals/archive", goal_id: goalId });
    } catch (e) {
      /* server already validated/permission-gated this - a stale click just no-ops */
    }
    await this._fetchGoals();
  }
  async _delete(goalId) {
    if (!window.confirm("Delete this goal? This can't be undone.")) return;
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/goals/delete", goal_id: goalId });
    } catch (e) {
      /* ignore */
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
      <label>Reward
        <select class="f-reward-type">
          <option value="${GOAL_REWARD_TYPE_STARS}" ${rewardType === GOAL_REWARD_TYPE_STARS ? "selected" : ""}>Stars</option>
          <option value="${GOAL_REWARD_TYPE_CATALOG_ITEM}" ${rewardType === GOAL_REWARD_TYPE_CATALOG_ITEM ? "selected" : ""}>A specific reward from the catalog</option>
        </select>
      </label>
      <label class="f-star-value-field">How many stars<input type="number" class="f-star-value" min="1" value="${g.star_value || 1}"></label>
      <label class="f-reward-item-field">Which reward<select class="f-reward-item">${catalogOptions}</select></label>
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
      <h3>Add a goal</h3>
      <label>Title<input type="text" class="f-title" placeholder="Get 3 Bs in math"></label>
      <label>For<select class="f-assigned">${userOptions}</select></label>
      <label>Target count (how many times to log before it's done)<input type="number" class="f-target" min="1" value="1"></label>
      ${this._rewardFieldsHtml(null)}
      <label>Due date (optional)<input type="datetime-local" class="f-due"></label>
      <label>Notes<textarea class="f-notes" rows="3" placeholder="Any details worth knowing"></textarea></label>
      <div class="modal-actions">
        <button class="cancel-btn">Cancel</button>
        <button class="save-btn">Save</button>
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
      errEl.textContent = "A goal needs a title.";
      return;
    }
    const assignedTo = box.querySelector(".f-assigned").value;
    if (!assignedTo) {
      errEl.textContent = "A goal needs someone it belongs to.";
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
      errEl.textContent = (e && e.message) || "Couldn't save this goal.";
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
      <h3>Edit goal</h3>
      <label>Title<input type="text" class="f-title" value="${this._escAttr(goal.title)}"></label>
      <label>For<select class="f-assigned">${userOptions}</select></label>
      <label>Target count (how many times to log before it's done)<input type="number" class="f-target" min="1" value="${goal.target_count || 1}"></label>
      ${this._rewardFieldsHtml(goal)}
      <label>Due date (optional)<input type="datetime-local" class="f-due" value="${this._isoToLocalDatetimeInputValue(goal.due_date)}"></label>
      <label>Notes<textarea class="f-notes" rows="3">${this._esc(goal.notes || "")}</textarea></label>
      <div class="modal-actions">
        <button class="cancel-btn">Cancel</button>
        <button class="save-btn">Save</button>
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
      errEl.textContent = "A goal needs a title.";
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
      errEl.textContent = (e && e.message) || "Couldn't save this goal.";
      return;
    }
    overlay.classList.remove("open");
    await this._fetchGoals();
  }

  // --- Rendering ----------------------------------------------------------

  _rewardSummary(goal) {
    if (goal.reward_type === GOAL_REWARD_TYPE_CATALOG_ITEM) {
      const item = this._catalogItem(goal.reward_item_id);
      return item ? `${item.icon || "&#127873;"} ${this._esc(item.title)}` : "(reward no longer available)";
    }
    const stars = goal.star_value || 0;
    return `&#11088; ${stars} star${stars === 1 ? "" : "s"}`;
  }

  _goalCardHtml(goal) {
    const target = Math.max(1, goal.target_count || 1);
    const current = Math.min(target, goal.current_count || 0);
    const canLog = goal.status === GOAL_STATUS_OPEN && this._canLogProgress(goal);
    const canManage = this._canManageGoals();
    const canVerify = this._canVerify();
    // Only an achieved (not yet archived) goal can be archived - the same
    // "owner or manager" pool _canLogProgress already checks, since this is
    // just as much "acting on your own goal" as logging progress on it was.
    const canArchive = goal.status === GOAL_STATUS_APPROVED && (goal.assigned_to === this._myUserId() || canManage);
    const progressLabel = target > 1 ? `${current} / ${target} logged` : (current >= target ? "Done" : "Not yet done");
    let statusBadge = "";
    if (goal.status === GOAL_STATUS_PENDING_VERIFICATION) statusBadge = `<span class="goal-badge pending">Awaiting approval</span>`;
    // v144.13+: the achieved badge now shows the reward inline ("Achieved!
    // +5 stars" / "Achieved! Movie night 🎬") instead of leaving the reward
    // to the separate, much less noticeable `.goal-reward` line below -
    // the household specifically asked to "show goal reward (stars) when a
    // goal is complete." The plain `.goal-reward` line still renders too
    // (goals not yet approved still want to say what they're working
    // toward), just no longer the only place a just-approved reward shows.
    else if (goal.status === GOAL_STATUS_APPROVED || goal.status === GOAL_STATUS_ARCHIVED) {
      statusBadge = `<span class="goal-badge approved">Achieved! ${this._rewardSummary(goal)}</span>`;
    }
    if (goal.rejected_at && goal.status === GOAL_STATUS_OPEN) {
      const reason = goal.reject_reason ? `: ${this._esc(goal.reject_reason)}` : "";
      statusBadge += `<span class="goal-badge rejected">Sent back${reason}</span>`;
    }
    let actions = "";
    if (canLog) actions += `<button class="goal-log-btn" data-id="${goal.id}">${target > 1 ? "Log progress" : "Mark done"}</button>`;
    if (goal.status === GOAL_STATUS_PENDING_VERIFICATION && canVerify) {
      actions += `<button class="goal-approve-btn" data-id="${goal.id}">Approve</button>`;
      actions += `<button class="goal-reject-btn" data-id="${goal.id}">Send back</button>`;
    }
    if (canArchive) actions += `<button class="goal-complete-btn" data-id="${goal.id}">Complete</button>`;
    if (goal.status === GOAL_STATUS_OPEN && canManage) {
      actions += `<button class="goal-edit-btn" data-id="${goal.id}">Edit</button>`;
    }
    if (canManage) actions += `<button class="goal-delete-btn" data-id="${goal.id}">&times;</button>`;
    const dueHtml = goal.due_date ? `<div class="goal-due">Due ${new Date(goal.due_date).toLocaleString()}</div>` : "";
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

  // v143+ task #30: "My Goals" - a single flat list of just the logged-in
  // viewer's own goals, replacing the old one-column-per-household-member
  // board (see this file's own header comment for the reasoning). Someone
  // not logged in at all (a kiosk display with no hass.user) sees a plain
  // prompt instead of every goal in the house.
  // Archived goals are excluded here (see _archivedGoals below) - the
  // active list only ever shows something still being worked toward,
  // awaiting approval, or freshly achieved and not yet tidied away.
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
  // Most-recently-archived first - same "what did we just finish" framing
  // as the chores card's own Completed accordion, no time-window cutoff
  // here though (a goal is a deliberate one-off "Complete" tap, not
  // something that should silently vanish on a timer the way a recurring
  // chore's own one-off completion does).
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
          <span class="completed-goals-title">Completed</span>
          <span class="completed-goals-badge">${archived.length}</span>
        </div>
        ${body}
      </div>
    `;
  }
  _boardHtml() {
    if (!this._myUserId()) {
      return `<div class="empty-state">Log in to see your goals.</div>`;
    }
    const goals = this._myGoals();
    const listHtml = goals.length
      ? `<div class="goal-list">${goals.map((g) => this._goalCardHtml(g)).join("")}</div>`
      : `<div class="empty-state">No goals yet.</div>`;
    return `${listHtml}${this._completedGoalsAccordionHtml()}`;
  }

  _render() {
    if (!this._root) return;
    this._applyFabVisibility();
    this._root.querySelector(".board").innerHTML = this._boardHtml();
  }

  _css() {
    return `
      /* v1.110.7+: position:relative is the containing block .add-goal-fab
         needs when [fab-position="card"] switches it to position:absolute. */
      :host { display: block; position: relative; font-family: 'Varela Round', sans-serif; }
      ha-card { background: var(--fc-bg); color: var(--fc-text); padding: 14px; }
      .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
      .title { font-size: 18px; font-weight: 800; }
      .board { display: block; }
      .goal-list { display: flex; flex-direction: column; gap: 8px; }
      .empty-state { font-size: 12px; color: var(--fc-text-secondary); padding: 8px 2px; }
      .goal-card { background: var(--fc-card); border-radius: 10px; padding: 10px; box-shadow: var(--fc-shadow, 0 2px 5px rgba(0,0,0,0.08)); display: flex; flex-direction: column; gap: 4px; }
      /* v144.5+: "Liquid glass" support, same convention as
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
      /* v144.13+: the Completed accordion - same collapsed-by-default,
         click-to-expand shape as family-hub-chores-card.js's own per-column
         Completed accordion (_completedChoresAccordionHtml), just a single
         one here since My Goals is already one flat list, not one per
         column. */
      .completed-goals-row { border-top: 1px solid var(--fc-border); margin-top: 10px; padding-top: 6px; }
      .completed-goals-header { display: flex; align-items: center; gap: 6px; padding: 8px 2px; font-size: 12px; font-weight: 700; cursor: pointer; color: var(--fc-text-secondary); }
      .completed-goals-title { flex: 1; }
      .completed-goals-badge { background: var(--fc-surface2); color: var(--fc-accent2); border-radius: 8px; padding: 1px 7px; font-size: 11px; }
      .completed-goals-body { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
      /* v1.110.4+: bottom offset by --fh-fab-offset - see family-hub-chores-card.js's identical comment. */
      .add-goal-fab { position: fixed; right: 18px; bottom: calc(18px + var(--fh-fab-offset, 0px)); z-index: 900; width: 56px; height: 56px; border-radius: 50%; border: none; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 28px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(58,53,44,0.35); transition: bottom 0.15s ease; }
      .add-goal-fab[hidden] { display: none; }
      /* v1.110.7+: fab_position: "card" - see family-hub-chores-card.js's
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

// v1.111.0+: the card's native "Edit Card" config editor - a thin wrapper
// around Home Assistant's own <ha-form> (every field here is a plain text/
// select the generic form already renders fine) rather than a hand-built
// form, needed ONLY because the new theme_override field's option list has
// to be fetched live (theme_builder/list + hass.themes.themes) - something
// getConfigForm's static schema object can't do since it's called with no
// hass in scope. See FamilyHubGoalsCard.getConfigElement above.
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
  // Duplicated (not shared/imported) from the card class's own
  // _fetchGlobalThemes/_nativeHaThemeEntries just above - this editor is a
  // separate custom element instance with its own independent hass/
  // lifecycle, same "independently loaded resources duplicate small
  // helpers" convention as everything else in this project. Only builds
  // {value, label} pairs for the dropdown; the actual color/effects
  // resolution for whichever id gets picked still happens in the card's
  // own _resolveTheme once it's saved into config.
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
