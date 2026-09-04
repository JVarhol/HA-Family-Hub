// A small companion card whose only job is to bring the Family Hub Auto
// Screen Saver to a dashboard that doesn't have the full Family Week
// Calendar card on it - a kitchen tablet's "shopping list" dashboard, a
// hallway display's "chores" dashboard, whatever else the household has.
// It reads the exact same shared screensaver settings (source, idle time,
// which logins it's on for) that the full card's own Settings modal
// configures - there's nothing new to set up here except which dashboard
// this card lives on, and (optionally) which dashboard to jump back to
// once someone taps the screen awake again.
//
// It only ever shows its own face while ITS dashboard is in edit mode - the
// rest of the time it renders nothing (zero height), but keeps running in
// the background exactly like the full card's own screensaver does. Add it
// once per dashboard that should get the screensaver, anywhere in the
// layout; where on the page it sits doesn't matter since it's invisible in
// normal (non-edit) view.
class FamilyScreensaverCard extends HTMLElement {
  static getStubConfig() {
    return { title: "Screen Saver", return_dashboard_path: "" };
  }
  // Same "let Home Assistant's own schema form handle it" approach as the
  // Family Today card - this card's config is just a title (shown only in
  // edit mode, so it's mostly for telling two of these apart if a household
  // ever adds more than one) and the optional wake-navigation target. The
  // wake target is ALSO editable as a friendly dropdown right on the card's
  // own face while its dashboard is in edit mode (see _renderEditFace) -
  // this form is a second, guaranteed-to-save way to set the same field via
  // the card's own "Edit Card" dialog, in case the on-card dropdown doesn't
  // persist in a given Home Assistant version (a plain card sitting in the
  // dashboard grid isn't always wired the same way a dedicated card editor
  // is for saving live edits).
  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "return_dashboard_path", selector: { navigation: {} } },
      ],
      computeLabel: (schema) => {
        const labels = {
          title: "Title (shown only while this dashboard is in edit mode)",
          return_dashboard_path: "Return to this dashboard on wake",
        };
        return labels[schema.name] || undefined;
      },
      computeHelper: (schema) => {
        if (schema.name === "return_dashboard_path") {
          return "Optional. If the screensaver falls asleep here and gets tapped awake, it jumps to this dashboard/view instead of staying on this one. Leave blank to just stay put. Also settable as a dropdown on the card itself in edit mode - use this form instead if that dropdown doesn't stick.";
        }
        if (schema.name === "title") {
          return "Purely a label for telling cards apart in edit mode - never shown once editing is done.";
        }
        return undefined;
      },
    };
  }
  setConfig(config) {
    config = config || {};
    this._config = {
      title: (config.title || "Screen Saver").toString(),
      return_dashboard_path: (config.return_dashboard_path || "").toString().trim(),
    };
    if (this._settingsCache === undefined) this._settingsCache = null;
    if (this._screenSaverSettingsSnapshot === undefined) this._screenSaverSettingsSnapshot = null;
    if (this._dashboards === undefined) this._dashboards = null;
    if (this._editModeInternal === undefined) this._editModeInternal = false;
    if (!this._built) this._build();
    this._render();
  }
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) {
      this._firstLoadPromise = this._initFirstLoad();
    }
  }
  // Home Assistant's own dashboard editor sets this on any card element
  // that defines it, so the card can tell "someone is editing this
  // dashboard right now" apart from "this is just how the dashboard always
  // looks" - exactly the distinction this card exists to make. Falls back
  // to false (hidden) if the running frontend never sets it, which just
  // means this card stays invisible everywhere, same as before this
  // property existed.
  set editMode(value) {
    const next = !!value;
    if (next === this._editModeInternal) return;
    this._editModeInternal = next;
    this._render();
    if (next && this._hass && this._dashboards === null) this._fetchDashboards();
  }
  get editMode() {
    return !!this._editModeInternal;
  }
  async _initFirstLoad() {
    await this._fetchSettings();
    if (this._editModeInternal) await this._fetchDashboards();
    this._setupScreenSaverActivityListeners();
    this._resetScreenSaverIdleTimer();
    this._startPolling();
  }
  // Same 60s cadence as the full card - catches a Settings change (new
  // idle time, a login toggled on/off, a new video URL) made from any
  // dashboard within a minute, without needing this card's own dashboard
  // reloaded.
  _startPolling() {
    if (this._interval) return;
    this._interval = setInterval(() => {
      this._fetchSettings();
    }, 60 * 1000);
  }
  connectedCallback() {
    if (this._hass && !this._interval) {
      if (this._firstLoadPromise) {
        this._firstLoadPromise.then(() => {
          if (this.isConnected && this._hass && !this._interval) {
            this._resetScreenSaverIdleTimer();
            this._startPolling();
          }
        });
      } else {
        this._fetchSettings();
        this._resetScreenSaverIdleTimer();
        this._startPolling();
      }
    }
    this._setupScreenSaverActivityListeners();
  }
  // Tears everything down when this card leaves the page - most commonly
  // because its dashboard/view was navigated away from. That's exactly
  // right: this dashboard is no longer the one the household is looking
  // at, so nothing here should keep counting down or holding a full-screen
  // overlay open behind the scenes. Landing back on this dashboard later
  // re-mounts the card and starts fresh, same as the full card's own
  // reconnect behavior.
  disconnectedCallback() {
    if (this._interval) clearInterval(this._interval);
    this._interval = null;
    if (this._screenSaverTimer) {
      clearTimeout(this._screenSaverTimer);
      this._screenSaverTimer = null;
    }
    if (this._screenSaverCameraInterval) {
      clearInterval(this._screenSaverCameraInterval);
      this._screenSaverCameraInterval = null;
    }
    if (this._screenSaverOverlayEl) {
      this._screenSaverOverlayEl.remove();
      this._screenSaverOverlayEl = null;
    }
    this._teardownScreenSaverActivityListeners();
  }
  // Reports a minimal footprint - this card renders at zero height outside
  // edit mode (see _render), but a masonry/sections grid still reserves
  // some space for it based on these numbers rather than truly nothing;
  // 1 row is as small as that reservation gets. Shrinking or hiding that
  // reserved slot further is a Layout-tab/grid-card limitation, not
  // something this card can opt out of on its own.
  getCardSize() {
    return 1;
  }
  getLayoutOptions() {
    return { grid_rows: 1, grid_columns: "full", min_rows: 1 };
  }
  getGridOptions() {
    return { columns: 12, rows: 1, min_rows: 1 };
  }
  // Only the screenSaver slice of the shared settings blob is read here -
  // everything else (calendars, meal blocks, theme, ...) is simply ignored,
  // the same lenient/forward-compatible approach the Family Today card
  // takes toward the parts of Settings it doesn't render. An older or
  // newer settings shape never breaks this card; it just falls back to
  // defaults for anything it doesn't recognize.
  _defaultSettings() {
    return {
      screenSaver: {
        sourceType: "video",
        videoUrl: "",
        cameraEntity: "",
        idleSeconds: 180,
        usersEnabled: {},
      },
    };
  }
  _normalizeSettings(parsed) {
    const defaults = this._defaultSettings();
    if (!parsed || typeof parsed !== "object") return defaults;
    const parsedScreenSaver = parsed.screenSaver && typeof parsed.screenSaver === "object" ? parsed.screenSaver : {};
    const sourceType = parsedScreenSaver.sourceType === "camera" ? "camera" : "video";
    const videoUrl = typeof parsedScreenSaver.videoUrl === "string" ? parsedScreenSaver.videoUrl.trim() : defaults.screenSaver.videoUrl;
    const cameraEntity = typeof parsedScreenSaver.cameraEntity === "string" ? parsedScreenSaver.cameraEntity.trim() : defaults.screenSaver.cameraEntity;
    let idleSeconds = Number.isFinite(parsedScreenSaver.idleSeconds) ? Math.round(parsedScreenSaver.idleSeconds) : parseInt(parsedScreenSaver.idleSeconds, 10);
    if (!Number.isFinite(idleSeconds)) idleSeconds = defaults.screenSaver.idleSeconds;
    idleSeconds = Math.min(3600, Math.max(10, idleSeconds));
    const usersEnabled = {};
    if (parsedScreenSaver.usersEnabled && typeof parsedScreenSaver.usersEnabled === "object") {
      Object.keys(parsedScreenSaver.usersEnabled).forEach((userId) => {
        if (parsedScreenSaver.usersEnabled[userId]) usersEnabled[userId] = true;
      });
    }
    return { screenSaver: { sourceType, videoUrl, cameraEntity, idleSeconds, usersEnabled } };
  }
  _getSettings() {
    return this._settingsCache || this._defaultSettings();
  }
  async _fetchSettings() {
    if (!this._hass) return;
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_settings" });
      const parsed = result && result.settings && typeof result.settings === "object" ? result.settings : null;
      this._settingsCache = this._normalizeSettings(parsed);
    } catch (e) {
      if (!this._settingsCache) this._settingsCache = this._defaultSettings();
    }
    this._maybeResetScreenSaverIdleTimer();
  }
  // Populates the on-card dashboard picker (edit mode only) - listed
  // dashboards only cover Home Assistant's own configured
  // dashboards/strategy dashboards, each defaulting to that dashboard's
  // first view (view index 0); a household that wants a different specific
  // view can still fine-tune the path afterward via this card's own "Edit
  // Card" dialog (see getConfigForm), which accepts any path.
  async _fetchDashboards() {
    if (!this._hass) return;
    try {
      const list = await this._hass.connection.sendMessagePromise({ type: "lovelace/dashboards/list" });
      this._dashboards = Array.isArray(list) ? list : [];
    } catch (e) {
      this._dashboards = [];
    }
    this._renderEditFace();
  }
  // Whether the current login should ever arm the idle timer - identical
  // rule to the full card's own _screenSaverApplicable (same shared
  // settings, same per-login opt-in), just without that card's own
  // recipe-detail gate since this card never has a recipe view open on it.
  _screenSaverApplicable() {
    if (!this._hass || !this._hass.user || !this._hass.user.id) return false;
    const ss = this._getSettings().screenSaver;
    if (!ss) return false;
    const hasSource = ss.sourceType === "camera" ? !!ss.cameraEntity : !!ss.videoUrl;
    if (!hasSource) return false;
    return !!(ss.usersEnabled && ss.usersEnabled[this._hass.user.id]);
  }
  // v134+: same fix as the full calendar card's own
  // _maybeResetScreenSaverIdleTimer - this card's 60s settings poll
  // (_startPolling) used to call _resetScreenSaverIdleTimer() on every
  // single tick regardless of whether anything actually changed, which
  // clobbered and restarted any real idle countdown longer than 60s (the
  // poll interval - and the default idle time, 180s, is already above it)
  // before it could ever reach _showScreenSaver(). Only the real reset
  // fires when the screenSaver settings sub-object actually changed since
  // the last check (or on the very first call after this card loads).
  _maybeResetScreenSaverIdleTimer() {
    const key = JSON.stringify(this._getSettings().screenSaver || null);
    if (key === this._screenSaverSettingsSnapshot) return;
    this._screenSaverSettingsSnapshot = key;
    this._resetScreenSaverIdleTimer();
  }
  _resetScreenSaverIdleTimer() {
    if (this._screenSaverTimer) {
      clearTimeout(this._screenSaverTimer);
      this._screenSaverTimer = null;
    }
    if (!this._screenSaverApplicable()) return;
    if (this._screenSaverOverlayEl && this._screenSaverOverlayEl.style.display !== "none") return;
    const seconds = this._getSettings().screenSaver.idleSeconds || 180;
    this._screenSaverTimer = setTimeout(() => this._showScreenSaver(), seconds * 1000);
  }
  // Same document.body-level overlay trick as the full card's own
  // _ensureScreenSaverOverlay (see its comment there for the full "why") -
  // appended outside every shadow root and outside <ha-card>/Home
  // Assistant's own app shell so position:fixed actually reaches the real
  // viewport instead of getting trapped inside a containing block further
  // up the tree.
  _ensureScreenSaverOverlay() {
    if (this._screenSaverOverlayEl && this._screenSaverOverlayEl.isConnected) return this._screenSaverOverlayEl;
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
    el.addEventListener("pointerdown", () => this._hideScreenSaver());
    document.body.appendChild(el);
    this._screenSaverOverlayEl = el;
    return el;
  }
  _showScreenSaver() {
    if (!this._screenSaverApplicable()) return;
    const overlay = this._ensureScreenSaverOverlay();
    const ss = this._getSettings().screenSaver;
    const videoEl = overlay.querySelector(".screensaver-video");
    const imgEl = overlay.querySelector(".screensaver-camera-image");
    if (ss.sourceType === "camera") {
      if (videoEl) {
        videoEl.pause();
        videoEl.style.display = "none";
      }
      if (imgEl) imgEl.style.display = "";
      this._updateScreenSaverCameraImage();
      if (!this._screenSaverCameraInterval) {
        this._screenSaverCameraInterval = setInterval(() => this._updateScreenSaverCameraImage(), 10000);
      }
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
  // Dismissing the screensaver is also the "wake" moment for the
  // return-to-dashboard behavior this card exists to add: if a return
  // dashboard is configured, this is where the household actually lands
  // back somewhere useful instead of staying on whatever dashboard happened
  // to be showing when it fell asleep.
  _hideScreenSaver() {
    const overlay = this._screenSaverOverlayEl;
    if (!overlay || overlay.style.display === "none") return;
    overlay.style.display = "none";
    const videoEl = overlay.querySelector(".screensaver-video");
    if (videoEl) videoEl.pause();
    if (this._screenSaverCameraInterval) {
      clearInterval(this._screenSaverCameraInterval);
      this._screenSaverCameraInterval = null;
    }
    this._resetScreenSaverIdleTimer();
    this._goToReturnDashboard();
  }
  _updateScreenSaverCameraImage() {
    if (!this._hass) return;
    const overlay = this._screenSaverOverlayEl;
    const imgEl = overlay && overlay.querySelector(".screensaver-camera-image");
    if (!imgEl) return;
    const ss = this._getSettings().screenSaver;
    const entityId = ss && ss.cameraEntity;
    const state = entityId && this._hass.states[entityId];
    const picture = state && state.attributes && state.attributes.entity_picture;
    if (!picture) return;
    const sep = picture.indexOf("?") === -1 ? "?" : "&";
    imgEl.src = `${picture}${sep}fhts=${Date.now()}`;
  }
  // Bound to document/window rather than this card's own shadow root - the
  // full card can rely on its own root because it's the thing filling the
  // screen, but this card is a near-invisible sliver on a foreign
  // dashboard, so "activity anywhere on the page" is the only definition
  // of "not idle" that makes sense here. The overlay's own pointerdown
  // listener (set up in _ensureScreenSaverOverlay) handles dismissing an
  // already-showing screensaver; these listeners only need to worry about
  // resetting the countdown during ordinary use of whatever else is on the
  // page.
  _setupScreenSaverActivityListeners() {
    if (this._screenSaverActivityBound) return;
    this._screenSaverActivityBound = true;
    this._boundScreenSaverActivity = () => this._resetScreenSaverIdleTimer();
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach((evt) => {
      document.addEventListener(evt, this._boundScreenSaverActivity, { passive: true });
    });
  }
  _teardownScreenSaverActivityListeners() {
    if (!this._screenSaverActivityBound) return;
    this._screenSaverActivityBound = false;
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach((evt) => {
      document.removeEventListener(evt, this._boundScreenSaverActivity);
    });
    this._boundScreenSaverActivity = null;
  }
  // Same client-side navigation mechanism as the full card's own
  // dashboard-jump buttons (e.g. Family Today's _goToCalendar) - pushState
  // plus a "location-changed" event lets Home Assistant's own router swap
  // views instantly rather than a full page reload.
  _goToReturnDashboard() {
    const path = (this._config.return_dashboard_path || "").trim();
    if (!path) return;
    history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true, detail: { replace: false } }));
  }
  _build() {
    this._built = true;
    const root = this.attachShadow ? this.attachShadow({ mode: "open" }) : this;
    this._root = root;
    root.innerHTML = `
<style>
:host {
display: block;
font-family: "Arial Rounded MT Std", "Arial Rounded MT", "Varela Round", -apple-system, "Segoe UI Rounded", "Segoe UI", Roboto, sans-serif;
}
:host(.fh-ss-hidden) {
height: 0;
min-height: 0;
overflow: hidden;
pointer-events: none;
}
.card-root {
box-sizing: border-box;
padding: 14px 16px;
border-radius: 14px;
background: #f5f3f0;
border: 2px dashed #cbb98f;
color: #423d34;
}
.title-row { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 800; margin-bottom: 4px; }
.badge { display: inline-flex; align-items: center; justify-content: center; padding: 2px 8px; border-radius: 10px; background: #8f5a00; color: #fff8ea; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; }
.hint { font-size: 12px; color: #96877a; margin-bottom: 10px; line-height: 1.5; }
.field { margin-bottom: 4px; }
.field label { display: block; font-size: 12px; font-weight: 700; margin-bottom: 4px; }
.field select { width: 100%; box-sizing: border-box; font-size: 14px; padding: 8px 10px; border-radius: 8px; border: 1px solid #e6ddc4; background: #fff; color: #423d34; font-family: inherit; }
.status { font-size: 11px; color: #96877a; margin-top: 8px; font-style: italic; }
</style>
<div class="card-root">
<div class="title-row"><span class="title-text"></span><span class="badge">Edit-mode only</span></div>
<div class="hint">Invisible once you're done editing this dashboard - it keeps the screensaver running in the background from wherever it's placed. Screen source, idle time, and which logins it's on for are all set from the full calendar card's own Settings &rarr; Screen Saver section.</div>
<div class="field">
<label>Return to this dashboard on wake</label>
<select class="return-dashboard-select">
<option value="">Stay on this dashboard</option>
</select>
</div>
<div class="status"></div>
</div>
`;
    root.querySelector(".return-dashboard-select").addEventListener("change", (e) => {
      const value = e.target.value || "";
      this._config = Object.assign({}, this._config, { return_dashboard_path: value });
      // Bubbles up through hui-card the same way a dedicated card editor's
      // own live edits do, so a dashboard editor that's listening for it
      // saves the change immediately. If a given Home Assistant version
      // doesn't wire that up for a plain card sitting in the view (rather
      // than the "Edit Card" dialog's own editor element), the getConfigForm
      // field above is the guaranteed-to-save alternative for the same
      // setting.
      this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config: this._config } }));
      this._updateStatus();
    });
  }
  _render() {
    if (!this._root) return;
    this.classList.toggle("fh-ss-hidden", !this._editModeInternal);
    this._root.querySelector(".title-text").textContent = this._config.title || "Screen Saver";
    if (this._editModeInternal) this._renderEditFace();
  }
  _renderEditFace() {
    const root = this._root;
    if (!root) return;
    const select = root.querySelector(".return-dashboard-select");
    const current = this._config.return_dashboard_path || "";
    const dashboards = Array.isArray(this._dashboards) ? this._dashboards : [];
    const options = [{ value: "", label: "Stay on this dashboard" }].concat(
      dashboards
        .filter((d) => d && d.url_path)
        .map((d) => ({ value: `/${d.url_path}/0`, label: d.title || d.url_path }))
    );
    // A manually-typed path (set via YAML or the Edit Card dialog) that
    // doesn't match any listed dashboard's default view still needs to show
    // up as selected rather than silently reverting the dropdown to "Stay
    // on this dashboard" - added as its own option so the picker never
    // contradicts what's actually configured.
    if (current && !options.some((o) => o.value === current)) {
      options.push({ value: current, label: current });
    }
    select.innerHTML = options.map((o) => `<option value="${o.value.replace(/"/g, "&quot;")}">${o.label}</option>`).join("");
    select.value = current;
    this._updateStatus();
  }
  _updateStatus() {
    const root = this._root;
    if (!root) return;
    const statusEl = root.querySelector(".status");
    if (!statusEl) return;
    const applicable = this._screenSaverApplicable();
    if (!applicable) {
      statusEl.textContent = "Screensaver isn't active for your current login yet - enable it under the calendar card's Settings → Screen Saver → Enable for these logins.";
    } else {
      const path = (this._config.return_dashboard_path || "").trim();
      statusEl.textContent = path ? `Active for your login - wakes back to ${path}.` : "Active for your login - stays on this dashboard when woken.";
    }
  }
}

if (!customElements.get("family-hub-screensaver-card")) {
  customElements.define("family-hub-screensaver-card", FamilyScreensaverCard);
}
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "family-hub-screensaver-card")) {
  window.customCards.push({
    type: "family-hub-screensaver-card",
    name: "Family Hub Screen Saver",
    description: "Invisible outside edit mode - brings the Family Hub auto screensaver to any other dashboard, with an optional dashboard to return to on wake.",
  });
}
