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

class FamilyHubGoalsCard extends HTMLElement {
  static getStubConfig() {
    return { title: "My Goals" };
  }
  static getConfigForm() {
    return { schema: [{ name: "title", selector: { text: {} } }], computeLabel: (s) => (s.name === "title" ? "Title" : undefined) };
  }
  setConfig(config) {
    this._config = { title: (config && config.title) || "My Goals" };
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
    if (this._getSettings().useGlobalTheme) await this._fetchGlobalThemes();
    this._startPolling();
    this._render();
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
  }
  disconnectedCallback() {
    if (this._interval) clearInterval(this._interval);
    this._interval = null;
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
    this._root.querySelector(".add-goal-fab").hidden = !this._canManageGoals();
    this._root.querySelector(".board").innerHTML = this._boardHtml();
  }

  _css() {
    return `
      :host { display: block; font-family: 'Varela Round', sans-serif; }
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
      .add-goal-fab { position: fixed; right: 18px; bottom: 18px; z-index: 900; width: 56px; height: 56px; border-radius: 50%; border: none; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 28px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(58,53,44,0.35); }
      .add-goal-fab[hidden] { display: none; }
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

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "family-hub-goals-card")) {
  window.customCards.push({
    type: "family-hub-goals-card",
    name: "Family Hub My Goals",
    description: "Progress-tracked achievements with a reward attached - \"get 3 Bs in math,\" \"practice piano 2 times\" - shows only the logged-in viewer's own goals.",
  });
}
