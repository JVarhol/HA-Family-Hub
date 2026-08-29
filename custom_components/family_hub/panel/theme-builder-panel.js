const TB_MAX_THEMES = 8;
const TB_LEGACY_COLOR_KEY_MAP = { gold: "accent", goldText: "accentText", green: "accent2", terracotta: "accent3", chipBg: "surfaceAlt", blockBg: "surface2" };

class ThemeBuilderPanel extends HTMLElement {
  constructor() {
    super();
    this._themes = [];
    this._activeIndex = 0;
    this._dirty = false;
    this._loaded = false;
  }

  set hass(hass) {
    this._hass = hass;
    this.classList.toggle("dark", !!(hass && hass.themes && hass.themes.darkMode));
    if (!this._loaded) {
      this._loaded = true;
      this._init();
    }
    // This device's chosen theme may have changed on the backend since it
    // was picked (e.g. edited in Theme Builder itself) - keep it fresh.
    if (this._deviceThemeId && this._deviceThemeId !== "__default__") {
      this._applyDeviceThemeVars(this._resolveDeviceThemeVars(this._deviceThemeId));
    }
    if (this._root) this._renderDeviceThemeList();
  }

  get hass() {
    return this._hass;
  }

  set narrow(v) {
    this._narrow = v;
  }

  set route(v) {
    this._route = v;
  }

  set panel(v) {
    this._panel = v;
    // The panel property can arrive after the initial render - re-render
    // the header once it's available so the logo doesn't stay stuck as the
    // emoji fallback for a load that happened to race it.
    if (this._root) this._updateHeaderIcon();
  }

  _iconUrl() {
    return (this._panel && this._panel.config && this._panel.config.iconUrl) || "";
  }

  _updateHeaderIcon() {
    const titleEl = this._root && this._root.querySelector(".tb-header-title");
    if (!titleEl) return;
    const existing = titleEl.querySelector(".tb-logo, .tb-icon");
    const iconUrl = this._iconUrl();
    if (iconUrl && (!existing || existing.tagName !== "IMG")) {
      if (existing) existing.remove();
      const img = document.createElement("img");
      img.className = "tb-logo";
      img.src = iconUrl;
      img.alt = "Family Hub logo";
      titleEl.insertBefore(img, titleEl.firstChild);
    }
  }

  async _init() {
    this._build();
    await this._loadThemes();
  }

  _blankTheme(name, id) {
    return {
      id: id || `theme-${Date.now()}`,
      name: name || "New Theme",
      colors: {
        bg: "#fbf7e5",
        card: "#f5f3f0",
        border: "#e6ddc4",
        text: "#423d34",
        textSecondary: "#96877a",
        accent: "#8f5a00",
        accentText: "#fff8ea",
        accent2: "#305545",
        accent3: "#b5583c",
        surfaceAlt: "#efe6cf",
        surface2: "#f2eede",
      },
      fonts: {
        dayName: 13,
        dayNumber: 22,
        wxTemp: 14,
        event: 14,
        chip: 13,
        headerTitle: 15,
        countdown: 11,
        blockLabel: 9,
        blockMeal: 13,
      },
      borderWidth: 1,
      accentBorderWidth: 2,
      cardOpacity: 100,
      effects: {
        shadow: { enabled: true, color: "#000000", opacity: 0.16, blurRadius: 8, spreadRadius: 0, offsetX: 0, offsetY: 2 },
        glow: { enabled: false, color: "#8f5a00", opacity: 0.6, blurRadius: 16 },
      },
      background: { image: "", size: "cover", position: "center", opacity: 1, blur: 0, overlayColor: "#000000", overlayOpacity: 0 },
    };
  }

  // Normalizes a theme from the backend (or a stale cached copy) into the
  // current generic shape: renames legacy calendar-flavored color keys
  // (gold -> accent, etc.) and fills in defaults for any missing field,
  // including the newer effects/background objects. Safe to call on an
  // already-current theme.
  _migrateTheme(t) {
    const blank = this._blankTheme();
    const colors = Object.assign({}, (t && t.colors) || {});
    Object.keys(TB_LEGACY_COLOR_KEY_MAP).forEach((oldKey) => {
      const newKey = TB_LEGACY_COLOR_KEY_MAP[oldKey];
      if (oldKey in colors) {
        if (!(newKey in colors)) colors[newKey] = colors[oldKey];
        delete colors[oldKey];
      }
    });
    Object.keys(blank.colors).forEach((k) => {
      if (!(k in colors)) colors[k] = blank.colors[k];
    });
    const fonts = Object.assign({}, blank.fonts, (t && t.fonts) || {});
    const srcEffects = (t && t.effects) || {};
    const shadow = Object.assign({}, blank.effects.shadow, srcEffects.shadow || {});
    const glow = Object.assign({}, blank.effects.glow, srcEffects.glow || {});
    const background = Object.assign({}, blank.background, (t && t.background) || {});
    return {
      id: (t && t.id) || blank.id,
      name: (t && t.name) || blank.name,
      colors,
      fonts,
      borderWidth: t && typeof t.borderWidth === "number" ? t.borderWidth : blank.borderWidth,
      accentBorderWidth: t && typeof t.accentBorderWidth === "number" ? t.accentBorderWidth : blank.accentBorderWidth,
      cardOpacity: t && typeof t.cardOpacity === "number" ? t.cardOpacity : blank.cardOpacity,
      effects: { shadow, glow },
      background,
    };
  }

  async _loadThemes() {
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "theme_builder/list" });
      this._themes = (result && result.themes) || [];
    } catch (e) {
      this._themes = [];
    }
    if (!this._themes.length) {
      this._themes = [this._blankTheme("Default", "default")];
    }
    this._themes = this._themes.map((t) => this._migrateTheme(t));
    this._activeIndex = 0;
    this._dirty = false;
    this._renderAll();
  }

  _escape(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  _build() {
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host {
          display: block;
          height: 100vh;
          box-sizing: border-box;
          font-family: var(--paper-font-body1_-_font-family, -apple-system, "Segoe UI", Roboto, sans-serif);
          background: var(--primary-background-color, #f4f4f7);
          color: var(--primary-text-color, #212121);
          --tb-active-bg: rgba(3, 169, 244, 0.12);
          --tb-danger-bg: #fbe4de;
          --tb-danger-text: #a13c26;
        }
        :host(.dark) {
          --tb-active-bg: rgba(3, 169, 244, 0.22);
          --tb-danger-bg: rgba(165, 66, 38, 0.35);
          --tb-danger-text: #ff9a80;
        }
        .tb-root { display: flex; flex-direction: column; height: 100%; box-sizing: border-box; }
        .tb-header {
          flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between;
          padding: 14px 20px; background: var(--card-background-color, #fff);
          border-bottom: 1px solid var(--divider-color, #e0e0e0); box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }
        .tb-header-title { display: flex; align-items: center; gap: 10px; }
        .tb-icon { font-size: 22px; }
        .tb-logo { width: 32px; height: 32px; border-radius: 8px; object-fit: cover; display: block; }
        .tb-header-title h1 { font-size: 18px; margin: 0; font-weight: 700; color: var(--primary-text-color, #212121); }
        .tb-header-sub { font-size: 11px; color: var(--secondary-text-color, #888); margin: 2px 0 0; }
        .tb-header-actions { display: flex; align-items: center; gap: 14px; }
        .tb-status { font-size: 12px; color: var(--secondary-text-color, #7c7c7c); }
        .tb-status.dirty { color: var(--warning-color, #b5583c); font-weight: 600; }
        .tb-save-btn {
          border: none; border-radius: 8px; padding: 9px 18px; font-size: 13px; font-weight: 700;
          background: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff); cursor: pointer;
        }
        .tb-save-btn:disabled { opacity: 0.6; cursor: default; }
        .tb-device-theme { position: relative; }
        .tb-device-theme-btn {
          display: flex; align-items: center; gap: 6px; border: 1px solid var(--divider-color, #ddd);
          border-radius: 8px; padding: 7px 12px; font-size: 12px; background: var(--card-background-color, #fff);
          color: var(--secondary-text-color, #666); cursor: pointer;
        }
        .tb-device-theme-btn:hover, .tb-device-theme-btn.open { color: var(--primary-color, #03a9f4); border-color: var(--primary-color, #03a9f4); }
        .tb-device-theme-btn svg { width: 15px; height: 15px; }
        .tb-device-theme-btn.open svg { transform: rotate(35deg); }
        .tb-device-theme-btn svg { transition: transform 0.15s ease; }
        .tb-device-theme-label { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tb-device-theme-dropdown {
          display: none; position: absolute; top: calc(100% + 6px); right: 0; min-width: 220px; max-height: 320px;
          overflow-y: auto; background: var(--card-background-color, #fff); border: 1px solid var(--divider-color, #ddd);
          border-radius: 10px; box-shadow: 0 6px 20px rgba(0,0,0,0.18); z-index: 30;
        }
        .tb-device-theme-item {
          display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 14px;
          font-size: 13px; color: var(--primary-text-color, #212121); cursor: pointer;
        }
        .tb-device-theme-item:hover { background: var(--secondary-background-color, rgba(0,0,0,0.04)); }
        .tb-device-theme-item.active { font-weight: 700; color: var(--primary-color, #03a9f4); }
        .tb-device-theme-check { width: 16px; text-align: center; }
        .tb-body { flex: 1 1 auto; display: flex; min-height: 0; }
        .tb-sidebar {
          flex: 0 0 230px; background: var(--card-background-color, #fff);
          border-right: 1px solid var(--divider-color, #e0e0e0); padding: 14px 10px;
          display: flex; flex-direction: column; gap: 6px; overflow-y: auto;
        }
        .tb-sidebar-hint { font-size: 11px; color: var(--secondary-text-color, #888); padding: 0 4px 8px; line-height: 1.4; }
        .tb-tabs { display: flex; flex-direction: column; gap: 4px; }
        .tb-tab {
          display: flex; align-items: center; gap: 10px; border: none; background: none; text-align: left;
          padding: 10px 12px; border-radius: 8px; cursor: pointer; font-size: 14px; color: var(--primary-text-color, #333); width: 100%;
        }
        .tb-tab:hover { background: var(--secondary-background-color, #f0f0f0); }
        .tb-tab.active { background: var(--tb-active-bg); color: var(--primary-color, #0288d1); font-weight: 700; }
        .tb-tab-swatch { width: 16px; height: 16px; border-radius: 50%; flex: 0 0 auto; box-shadow: 0 0 0 1px rgba(0,0,0,0.15); }
        .tb-tab-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tb-add-theme {
          margin-top: 8px; border: 2px dashed var(--divider-color, #ccc); border-radius: 8px; background: none; padding: 10px;
          font-size: 13px; color: var(--secondary-text-color, #666); cursor: pointer;
        }
        .tb-add-theme:hover { border-color: var(--primary-color, #03a9f4); color: var(--primary-color, #03a9f4); }
        .tb-editor { flex: 1 1 auto; overflow-y: auto; padding: 20px 28px 60px; }
        .tb-editor-top { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
        .tb-name-input {
          flex: 1 1 auto; font-size: 18px; font-weight: 700; padding: 8px 12px; border-radius: 8px;
          border: 1px solid var(--divider-color, #ddd); max-width: 320px; box-sizing: border-box;
          background: var(--card-background-color, #fff); color: var(--primary-text-color, #212121);
        }
        .tb-delete-theme {
          border: none; border-radius: 8px; padding: 8px 14px; font-size: 13px; font-weight: 600;
          background: var(--tb-danger-bg); color: var(--tb-danger-text); cursor: pointer; white-space: nowrap;
        }
        .tb-delete-theme:disabled { opacity: 0.4; cursor: default; }
        .tb-preview { margin-bottom: 26px; }
        .tb-preview-label { font-size: 12px; color: var(--secondary-text-color, #888); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.03em; }
        .tb-preview-day {
          position: relative; overflow: hidden;
          width: 220px; border-radius: 10px; padding: 12px; box-sizing: border-box;
          background-color: var(--p-bg, #fff);
          border-style: solid;
          border-width: var(--p-border-width, 1px); border-color: var(--p-border, #ddd);
          color: var(--p-text, #222);
          box-shadow: var(--p-box-shadow, none);
        }
        .tb-preview-day::before {
          content: ""; position: absolute; inset: calc(-1 * var(--p-bg-blur-px, 0px)); z-index: 0;
          background-image: var(--p-bg-image, none);
          background-size: var(--p-bg-size, cover);
          background-position: var(--p-bg-position, center);
          background-repeat: no-repeat;
          filter: blur(var(--p-bg-blur-px, 0px));
          opacity: var(--p-bg-image-opacity, 1);
        }
        .tb-preview-day::after {
          content: ""; position: absolute; inset: 0; z-index: 1;
          background: var(--p-bg-overlay, transparent);
        }
        .tb-preview-daylabel, .tb-preview-daynum, .tb-preview-block, .tb-preview-event { position: relative; z-index: 2; }
        .tb-preview-daylabel { font-size: var(--p-day-name-size, 13px); text-transform: uppercase; color: var(--p-text-secondary, #888); text-align: center; }
        .tb-preview-daynum {
          font-size: var(--p-day-number-size, 22px); font-weight: 700; text-align: center; margin-bottom: 8px;
          border-bottom-style: solid; border-bottom-width: var(--p-accent-border-width, 2px); border-bottom-color: var(--p-accent, #999); padding-bottom: 6px;
        }
        .tb-preview-block {
          background: var(--p-block-bg, #eee); border-radius: 6px; padding: 6px 8px; font-size: var(--p-block-size, 13px);
          font-weight: 700; margin-bottom: 8px; text-align: center;
        }
        .tb-preview-event { display: flex; align-items: center; gap: 6px; font-size: var(--p-event-size, 14px); flex-wrap: wrap; }
        .tb-preview-chip {
          background: var(--p-chip-bg, #eee); border-radius: 10px; padding: 2px 8px; font-size: var(--p-chip-size, 13px); font-weight: 600;
        }
        .tb-section { margin-bottom: 28px; }
        .tb-section h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--secondary-text-color, #555); margin: 0 0 12px; }
        .tb-section-hint { font-size: 11px; color: var(--secondary-text-color, #888); margin: -6px 0 12px; line-height: 1.4; }
        .tb-color-grid, .tb-font-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
        .tb-color-row, .tb-font-row {
          display: flex; align-items: center; justify-content: space-between; gap: 10px; background: var(--card-background-color, #fff);
          border: 1px solid var(--divider-color, #eee); border-radius: 8px; padding: 8px 12px; font-size: 13px; color: var(--primary-text-color, #212121);
          margin-bottom: 8px;
        }
        .tb-color-input { width: 40px; height: 30px; border: none; padding: 0; background: none; cursor: pointer; }
        .tb-font-input {
          width: 60px; text-align: center; padding: 5px; border-radius: 6px; border: 1px solid var(--divider-color, #ddd);
          background: var(--card-background-color, #fff); color: var(--primary-text-color, #212121);
        }
        .tb-appearance-row {
          display: flex; align-items: center; justify-content: space-between; gap: 12px; background: var(--card-background-color, #fff);
          border: 1px solid var(--divider-color, #eee); border-radius: 8px; padding: 10px 14px; font-size: 13px; margin-bottom: 10px; max-width: 460px;
          color: var(--primary-text-color, #212121);
        }
        .tb-appearance-row input[type="number"] {
          width: 60px; text-align: center; padding: 5px; border-radius: 6px; border: 1px solid var(--divider-color, #ddd);
          background: var(--card-background-color, #fff); color: var(--primary-text-color, #212121);
        }
        .tb-appearance-row input[type="range"] { width: 160px; }
        .tb-appearance-row select {
          padding: 6px 8px; border-radius: 6px; border: 1px solid var(--divider-color, #ddd);
          background: var(--card-background-color, #fff); color: var(--primary-text-color, #212121); font-size: 13px;
        }
        .tb-bg-url-input {
          width: 100%; box-sizing: border-box; padding: 9px 12px; border-radius: 8px; font-size: 13px;
          border: 1px solid var(--divider-color, #ddd); background: var(--card-background-color, #fff);
          color: var(--primary-text-color, #212121); margin-bottom: 10px; max-width: 460px; display: block;
        }
        .tb-field-label { display: block; font-size: 12px; color: var(--secondary-text-color, #888); margin-bottom: 6px; }
        .tb-empty { padding: 40px; text-align: center; color: var(--secondary-text-color, #888); }
        @media (max-width: 700px) {
          .tb-body { flex-direction: column; }
          .tb-sidebar { flex-direction: row; flex: 0 0 auto; overflow-x: auto; border-right: none; border-bottom: 1px solid var(--divider-color, #e0e0e0); }
          .tb-tabs { flex-direction: row; }
        }
      </style>
      <div class="tb-root">
        <div class="tb-header">
          <div>
            <div class="tb-header-title">${this._iconUrl() ? `<img class="tb-logo" src="${this._iconUrl()}" alt="Family Hub logo" />` : `<span class="tb-icon">&#127912;</span>`}<h1>Theme Builder</h1></div>
            <div class="tb-header-sub">Colors auto-register as selectable Home Assistant themes. Shadows, glow, and background images are available to cards built to read them.</div>
          </div>
          <div class="tb-header-actions">
            <div class="tb-device-theme">
              <button class="tb-device-theme-btn" title="Set the theme for THIS device only - other devices/tablets are unaffected">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14,12.94c0.04,-0.3 0.06,-0.61 0.06,-0.94c0,-0.32 -0.02,-0.64 -0.07,-0.94l2.03,-1.58c0.18,-0.14 0.23,-0.41 0.12,-0.61l-1.92,-3.32c-0.12,-0.22 -0.37,-0.29 -0.59,-0.22l-2.39,0.96c-0.5,-0.38 -1.03,-0.7 -1.62,-0.94L14.4,2.81c-0.04,-0.24 -0.24,-0.41 -0.48,-0.41h-3.84c-0.24,0 -0.43,0.17 -0.47,0.41L9.25,5.35C8.66,5.59 8.12,5.92 7.63,6.29L5.24,5.33c-0.22,-0.08 -0.47,0 -0.59,0.22L2.74,8.87C2.62,9.08 2.66,9.34 2.86,9.48l2.03,1.58C4.84,11.36 4.8,11.69 4.8,12s0.02,0.64 0.07,0.94l-2.03,1.58c-0.18,0.14 -0.23,0.41 -0.12,0.61l1.92,3.32c0.12,0.22 0.37,0.29 0.59,0.22l2.39,-0.96c0.5,0.38 1.03,0.7 1.62,0.94l0.36,2.54c0.05,0.24 0.24,0.41 0.48,0.41h3.84c0.24,0 0.44,-0.17 0.47,-0.41l0.36,-2.54c0.59,-0.24 1.13,-0.56 1.62,-0.94l2.39,0.96c0.22,0.08 0.47,0 0.59,-0.22l1.92,-3.32c0.12,-0.22 0.07,-0.47 -0.12,-0.61L19.14,12.94z M12,15.6c-1.98,0 -3.6,-1.62 -3.6,-3.6s1.62,-3.6 3.6,-3.6s3.6,1.62 3.6,3.6S13.98,15.6 12,15.6z"/></svg>
                <span class="tb-device-theme-label">This device: Default</span>
              </button>
              <div class="tb-device-theme-dropdown"></div>
            </div>
            <span class="tb-status"></span>
            <button class="tb-save-btn">Save All</button>
          </div>
        </div>
        <div class="tb-body">
          <div class="tb-sidebar">
            <div class="tb-tabs"></div>
            <button class="tb-add-theme">&#10133; Add theme</button>
          </div>
          <div class="tb-editor"></div>
        </div>
      </div>
    `;
    this._root = root;
    root.querySelector(".tb-save-btn").addEventListener("click", () => this._save());
    root.querySelector(".tb-add-theme").addEventListener("click", () => this._addTheme());
    this._bindDeviceThemeSection();
  }

  // --- "This device's theme" picker ---------------------------------------
  // Lets THIS browser/tablet pick any Home Assistant theme (native themes.yaml
  // /HACS themes, or a Theme Builder theme - those auto-register as native HA
  // themes, see _register_ha_themes on the backend) to look at, without
  // affecting any other device. Deliberately does NOT call the
  // frontend.set_theme service, since that changes the theme for every
  // browser signed into the same HA account - not what you want on a
  // wall-mounted kiosk where each tablet might want its own look. Instead the
  // chosen theme's CSS variables are written directly onto <html> in this
  // browser only, and the choice is remembered in this browser's
  // localStorage. Same storage key and mechanism as the standalone "Theme
  // Selector" dashboard card, so picking a theme here or there stays in
  // sync on the same device.

  _deviceThemeStorageKey() {
    return "family-hub-device-theme";
  }

  _bindDeviceThemeSection() {
    const root = this._root;
    const btn = root.querySelector(".tb-device-theme-btn");
    const dropdown = root.querySelector(".tb-device-theme-dropdown");
    this._deviceThemeBtn = btn;
    this._deviceThemeDropdown = dropdown;
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this._toggleDeviceThemeDropdown();
    });
    if (!this._boundDeviceThemeOutsideClick) {
      this._boundDeviceThemeOutsideClick = (ev) => {
        if (!this._deviceThemeOpen) return;
        if (this.contains && this.contains(ev.target)) return;
        this._closeDeviceThemeDropdown();
      };
    }
    document.addEventListener("click", this._boundDeviceThemeOutsideClick);

    this._loadDeviceThemeChoice();
    if (this._deviceThemeId && this._deviceThemeId !== "__default__" && this._deviceThemeVars) {
      this._applyDeviceThemeVars(this._deviceThemeVars);
    }
    this._renderDeviceThemeList();
  }

  _loadDeviceThemeChoice() {
    try {
      const raw = localStorage.getItem(this._deviceThemeStorageKey());
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && saved.id) {
        this._deviceThemeId = saved.id;
        this._deviceThemeName = saved.name || saved.id;
        this._deviceThemeVars = saved.vars || null;
      }
    } catch (e) {
      // Corrupt/unavailable localStorage - fall back to the default look.
    }
  }

  _resolveDeviceThemeVars(name) {
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

  _applyDeviceThemeVars(vars) {
    const prevKeys = this._appliedDeviceThemeKeys || [];
    for (const key of prevKeys) document.documentElement.style.removeProperty(`--${key}`);
    const keys = Object.keys(vars || {});
    for (const key of keys) document.documentElement.style.setProperty(`--${key}`, vars[key]);
    this._appliedDeviceThemeKeys = keys;
  }

  _selectDeviceTheme(name) {
    if (name === "__default__") {
      this._applyDeviceThemeVars({});
      this._deviceThemeId = "__default__";
      this._deviceThemeName = "Default";
      this._deviceThemeVars = null;
      try {
        localStorage.setItem(this._deviceThemeStorageKey(), JSON.stringify({ id: "__default__" }));
      } catch (e) {}
    } else {
      const vars = this._resolveDeviceThemeVars(name);
      this._applyDeviceThemeVars(vars);
      this._deviceThemeId = name;
      this._deviceThemeName = name;
      this._deviceThemeVars = vars;
      try {
        localStorage.setItem(this._deviceThemeStorageKey(), JSON.stringify({ id: name, name, vars }));
      } catch (e) {}
    }
    this._closeDeviceThemeDropdown();
    this._renderDeviceThemeList();
  }

  _toggleDeviceThemeDropdown() {
    this._deviceThemeOpen = !this._deviceThemeOpen;
    if (this._deviceThemeDropdown) this._deviceThemeDropdown.style.display = this._deviceThemeOpen ? "block" : "none";
    if (this._deviceThemeBtn) this._deviceThemeBtn.classList.toggle("open", this._deviceThemeOpen);
    if (this._deviceThemeOpen) this._renderDeviceThemeList();
  }

  _closeDeviceThemeDropdown() {
    this._deviceThemeOpen = false;
    if (this._deviceThemeDropdown) this._deviceThemeDropdown.style.display = "none";
    if (this._deviceThemeBtn) this._deviceThemeBtn.classList.remove("open");
  }

  _renderDeviceThemeList() {
    const dropdown = this._deviceThemeDropdown;
    const btn = this._deviceThemeBtn;
    if (!dropdown || !btn) return;
    const themes = (this._hass && this._hass.themes && this._hass.themes.themes) || {};
    const names = Object.keys(themes).sort((a, b) => a.localeCompare(b));
    const rows = [{ id: "__default__", label: "Default (this device)" }, ...names.map((n) => ({ id: n, label: n }))];
    dropdown.innerHTML = "";
    const activeId = this._deviceThemeId || "__default__";
    for (const row of rows) {
      const item = document.createElement("div");
      item.className = "tb-device-theme-item" + (row.id === activeId ? " active" : "");
      item.textContent = row.label;
      const check = document.createElement("span");
      check.className = "tb-device-theme-check";
      check.textContent = row.id === activeId ? "✓" : "";
      item.appendChild(check);
      item.addEventListener("click", () => this._selectDeviceTheme(row.id));
      dropdown.appendChild(item);
    }
    const labelEl = btn.querySelector(".tb-device-theme-label");
    if (labelEl) labelEl.textContent = `This device: ${this._deviceThemeName || "Default"}`;
  }

  _renderAll() {
    this._renderTabs();
    this._renderEditor();
    this._updateStatus();
  }

  _renderTabs() {
    const wrap = this._root.querySelector(".tb-tabs");
    wrap.innerHTML = this._themes
      .map(
        (t, i) => `
        <button class="tb-tab ${i === this._activeIndex ? "active" : ""}" data-idx="${i}">
          <span class="tb-tab-swatch" style="background:${t.colors.accent}"></span>
          <span class="tb-tab-name">${this._escape(t.name || "Untitled")}</span>
        </button>
      `
      )
      .join("");
    wrap.querySelectorAll(".tb-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._activeIndex = parseInt(btn.dataset.idx, 10);
        this._renderTabs();
        this._renderEditor();
      });
    });
    const addBtn = this._root.querySelector(".tb-add-theme");
    addBtn.style.display = this._themes.length >= TB_MAX_THEMES ? "none" : "";
  }

  _renderEditor() {
    const theme = this._themes[this._activeIndex];
    const editor = this._root.querySelector(".tb-editor");
    if (!theme) {
      editor.innerHTML = `<div class="tb-empty">No themes yet.</div>`;
      return;
    }

    const colorFields = [
      ["bg", "Background"],
      ["card", "Card background"],
      ["border", "Border"],
      ["text", "Text"],
      ["textSecondary", "Secondary text"],
      ["accent", "Accent"],
      ["accentText", "Text on accent"],
      ["accent2", "Accent 2"],
      ["accent3", "Accent 3"],
      ["surfaceAlt", "Surface (alt)"],
      ["surface2", "Surface 2"],
    ];
    const fontFields = [
      ["dayName", "Day name"],
      ["dayNumber", "Day number"],
      ["wxTemp", "Weather temp"],
      ["event", "Event text"],
      ["chip", "Chip text"],
      ["headerTitle", "Header title"],
      ["countdown", "Countdown text"],
      ["blockLabel", "Block label"],
      ["blockMeal", "Block meal text"],
    ];
    const shadow = theme.effects.shadow;
    const glow = theme.effects.glow;
    const bg = theme.background;

    editor.innerHTML = `
      <div class="tb-editor-top">
        <input type="text" class="tb-name-input" value="${this._escape(theme.name)}" maxlength="24" placeholder="Theme name" />
        <button class="tb-delete-theme" ${this._themes.length <= 1 ? "disabled" : ""}>&#128465;&#65039; Delete theme</button>
      </div>
      <div class="tb-preview">
        <div class="tb-preview-label">Live preview</div>
        <div class="tb-preview-day">
          <div class="tb-preview-daylabel">MON</div>
          <div class="tb-preview-daynum">12</div>
          <div class="tb-preview-block">Dinner &mdash; Taco Night</div>
          <div class="tb-preview-event">
            <span class="tb-preview-chip">Family</span>
            <span>Soccer practice</span>
          </div>
        </div>
      </div>
      <div class="tb-section">
        <h2>Colors</h2>
        <div class="tb-color-grid">
          ${colorFields
            .map(
              ([key, label]) => `
            <label class="tb-color-row" data-key="${key}">
              <span>${label}</span>
              <input type="color" class="tb-color-input" data-key="${key}" value="${theme.colors[key] || "#000000"}" />
            </label>
          `
            )
            .join("")}
        </div>
      </div>
      <div class="tb-section">
        <h2>Fonts (px)</h2>
        <div class="tb-font-grid">
          ${fontFields
            .map(
              ([key, label]) => `
            <label class="tb-font-row" data-key="${key}">
              <span>${label}</span>
              <input type="number" class="tb-font-input" data-key="${key}" min="6" max="72" value="${theme.fonts[key]}" />
            </label>
          `
            )
            .join("")}
        </div>
      </div>
      <div class="tb-section">
        <h2>Appearance</h2>
        <label class="tb-appearance-row">
          <span>Border weight (px)</span>
          <input type="number" class="tb-border-width" min="0" max="8" value="${theme.borderWidth}" />
        </label>
        <label class="tb-appearance-row">
          <span>Accent border weight (px)</span>
          <input type="number" class="tb-accent-border-width" min="0" max="8" value="${theme.accentBorderWidth}" />
        </label>
        <label class="tb-appearance-row">
          <span>Card / chip transparency (<span class="tb-opacity-val">${theme.cardOpacity}</span>%)</span>
          <input type="range" class="tb-opacity" min="20" max="100" value="${theme.cardOpacity}" />
        </label>
      </div>
      <div class="tb-section">
        <h2>Shadow</h2>
        <label class="tb-appearance-row">
          <span>Enable drop shadow</span>
          <input type="checkbox" class="tb-shadow-enabled" ${shadow.enabled ? "checked" : ""} />
        </label>
        <label class="tb-color-row" style="max-width:460px;">
          <span>Shadow color</span>
          <input type="color" class="tb-shadow-color" value="${shadow.color}" />
        </label>
        <label class="tb-appearance-row">
          <span>Opacity (<span class="tb-shadow-opacity-val">${Math.round(shadow.opacity * 100)}</span>%)</span>
          <input type="range" class="tb-shadow-opacity" min="0" max="100" value="${Math.round(shadow.opacity * 100)}" />
        </label>
        <label class="tb-appearance-row">
          <span>Blur (px)</span>
          <input type="number" class="tb-shadow-blur" min="0" max="60" value="${shadow.blurRadius}" />
        </label>
        <label class="tb-appearance-row">
          <span>Spread (px)</span>
          <input type="number" class="tb-shadow-spread" min="-20" max="40" value="${shadow.spreadRadius}" />
        </label>
        <label class="tb-appearance-row">
          <span>Offset X (px)</span>
          <input type="number" class="tb-shadow-offset-x" min="-40" max="40" value="${shadow.offsetX}" />
        </label>
        <label class="tb-appearance-row">
          <span>Offset Y (px)</span>
          <input type="number" class="tb-shadow-offset-y" min="-40" max="40" value="${shadow.offsetY}" />
        </label>
      </div>
      <div class="tb-section">
        <h2>Glow</h2>
        <label class="tb-appearance-row">
          <span>Enable glow</span>
          <input type="checkbox" class="tb-glow-enabled" ${glow.enabled ? "checked" : ""} />
        </label>
        <label class="tb-color-row" style="max-width:460px;">
          <span>Glow color</span>
          <input type="color" class="tb-glow-color" value="${glow.color}" />
        </label>
        <label class="tb-appearance-row">
          <span>Opacity (<span class="tb-glow-opacity-val">${Math.round(glow.opacity * 100)}</span>%)</span>
          <input type="range" class="tb-glow-opacity" min="0" max="100" value="${Math.round(glow.opacity * 100)}" />
        </label>
        <label class="tb-appearance-row">
          <span>Blur (px)</span>
          <input type="number" class="tb-glow-blur" min="0" max="60" value="${glow.blurRadius}" />
        </label>
      </div>
      <div class="tb-section">
        <h2>Background image</h2>
        <div class="tb-section-hint">Cards that opt in to reading Theme Builder data (like the family calendar card) can show this behind their content. It does not apply to the native Home Assistant theme.</div>
        <span class="tb-field-label">Image URL (e.g. /local/my-bg.jpg or https://...)</span>
        <input type="text" class="tb-bg-url-input" value="${this._escape(bg.image)}" placeholder="No background image" />
        <label class="tb-appearance-row">
          <span>Fit</span>
          <select class="tb-bg-size">
            <option value="cover" ${bg.size === "cover" ? "selected" : ""}>Cover</option>
            <option value="contain" ${bg.size === "contain" ? "selected" : ""}>Contain</option>
            <option value="repeat" ${bg.size === "repeat" ? "selected" : ""}>Repeat (tile)</option>
          </select>
        </label>
        <label class="tb-appearance-row">
          <span>Position</span>
          <select class="tb-bg-position">
            <option value="center" ${bg.position === "center" ? "selected" : ""}>Center</option>
            <option value="top" ${bg.position === "top" ? "selected" : ""}>Top</option>
            <option value="bottom" ${bg.position === "bottom" ? "selected" : ""}>Bottom</option>
          </select>
        </label>
        <label class="tb-appearance-row">
          <span>Image opacity (<span class="tb-bg-opacity-val">${Math.round(bg.opacity * 100)}</span>%)</span>
          <input type="range" class="tb-bg-opacity" min="0" max="100" value="${Math.round(bg.opacity * 100)}" />
        </label>
        <label class="tb-appearance-row">
          <span>Blur (px)</span>
          <input type="number" class="tb-bg-blur" min="0" max="30" value="${bg.blur}" />
        </label>
        <label class="tb-color-row" style="max-width:460px;">
          <span>Overlay tint</span>
          <input type="color" class="tb-bg-overlay-color" value="${bg.overlayColor}" />
        </label>
        <label class="tb-appearance-row">
          <span>Overlay strength (<span class="tb-bg-overlay-val">${Math.round(bg.overlayOpacity * 100)}</span>%)</span>
          <input type="range" class="tb-bg-overlay-opacity" min="0" max="100" value="${Math.round(bg.overlayOpacity * 100)}" />
        </label>
      </div>
    `;

    editor.querySelector(".tb-name-input").addEventListener("input", (e) => {
      theme.name = e.target.value;
      this._markDirty();
      const tab = this._root.querySelector(`.tb-tab[data-idx="${this._activeIndex}"] .tb-tab-name`);
      if (tab) tab.textContent = e.target.value || "Untitled";
    });
    editor.querySelector(".tb-delete-theme").addEventListener("click", () => this._deleteTheme());
    editor.querySelectorAll(".tb-color-input").forEach((input) => {
      input.addEventListener("input", () => {
        theme.colors[input.dataset.key] = input.value;
        this._markDirty();
        this._updatePreview();
        if (input.dataset.key === "accent") {
          const swatch = this._root.querySelector(`.tb-tab[data-idx="${this._activeIndex}"] .tb-tab-swatch`);
          if (swatch) swatch.style.background = input.value;
        }
      });
    });
    editor.querySelectorAll(".tb-font-input").forEach((input) => {
      input.addEventListener("input", () => {
        const n = parseInt(input.value, 10);
        theme.fonts[input.dataset.key] = Number.isFinite(n) ? n : theme.fonts[input.dataset.key];
        this._markDirty();
        this._updatePreview();
      });
    });
    editor.querySelector(".tb-border-width").addEventListener("input", (e) => {
      theme.borderWidth = parseFloat(e.target.value) || 0;
      this._markDirty();
      this._updatePreview();
    });
    editor.querySelector(".tb-accent-border-width").addEventListener("input", (e) => {
      theme.accentBorderWidth = parseFloat(e.target.value) || 0;
      this._markDirty();
      this._updatePreview();
    });
    editor.querySelector(".tb-opacity").addEventListener("input", (e) => {
      theme.cardOpacity = parseInt(e.target.value, 10);
      const val = editor.querySelector(".tb-opacity-val");
      if (val) val.textContent = theme.cardOpacity;
      this._markDirty();
      this._updatePreview();
    });

    // Shadow
    editor.querySelector(".tb-shadow-enabled").addEventListener("change", (e) => {
      shadow.enabled = e.target.checked;
      this._markDirty();
      this._updatePreview();
    });
    editor.querySelector(".tb-shadow-color").addEventListener("input", (e) => {
      shadow.color = e.target.value;
      this._markDirty();
      this._updatePreview();
    });
    editor.querySelector(".tb-shadow-opacity").addEventListener("input", (e) => {
      shadow.opacity = parseInt(e.target.value, 10) / 100;
      const val = editor.querySelector(".tb-shadow-opacity-val");
      if (val) val.textContent = e.target.value;
      this._markDirty();
      this._updatePreview();
    });
    editor.querySelector(".tb-shadow-blur").addEventListener("input", (e) => {
      shadow.blurRadius = parseFloat(e.target.value) || 0;
      this._markDirty();
      this._updatePreview();
    });
    editor.querySelector(".tb-shadow-spread").addEventListener("input", (e) => {
      shadow.spreadRadius = parseFloat(e.target.value) || 0;
      this._markDirty();
      this._updatePreview();
    });
    editor.querySelector(".tb-shadow-offset-x").addEventListener("input", (e) => {
      shadow.offsetX = parseFloat(e.target.value) || 0;
      this._markDirty();
      this._updatePreview();
    });
    editor.querySelector(".tb-shadow-offset-y").addEventListener("input", (e) => {
      shadow.offsetY = parseFloat(e.target.value) || 0;
      this._markDirty();
      this._updatePreview();
    });

    // Glow
    editor.querySelector(".tb-glow-enabled").addEventListener("change", (e) => {
      glow.enabled = e.target.checked;
      this._markDirty();
      this._updatePreview();
    });
    editor.querySelector(".tb-glow-color").addEventListener("input", (e) => {
      glow.color = e.target.value;
      this._markDirty();
      this._updatePreview();
    });
    editor.querySelector(".tb-glow-opacity").addEventListener("input", (e) => {
      glow.opacity = parseInt(e.target.value, 10) / 100;
      const val = editor.querySelector(".tb-glow-opacity-val");
      if (val) val.textContent = e.target.value;
      this._markDirty();
      this._updatePreview();
    });
    editor.querySelector(".tb-glow-blur").addEventListener("input", (e) => {
      glow.blurRadius = parseFloat(e.target.value) || 0;
      this._markDirty();
      this._updatePreview();
    });

    // Background image
    editor.querySelector(".tb-bg-url-input").addEventListener("input", (e) => {
      bg.image = e.target.value.trim();
      this._markDirty();
      this._updatePreview();
    });
    editor.querySelector(".tb-bg-size").addEventListener("change", (e) => {
      bg.size = e.target.value;
      this._markDirty();
      this._updatePreview();
    });
    editor.querySelector(".tb-bg-position").addEventListener("change", (e) => {
      bg.position = e.target.value;
      this._markDirty();
      this._updatePreview();
    });
    editor.querySelector(".tb-bg-opacity").addEventListener("input", (e) => {
      bg.opacity = parseInt(e.target.value, 10) / 100;
      const val = editor.querySelector(".tb-bg-opacity-val");
      if (val) val.textContent = e.target.value;
      this._markDirty();
      this._updatePreview();
    });
    editor.querySelector(".tb-bg-blur").addEventListener("input", (e) => {
      bg.blur = parseFloat(e.target.value) || 0;
      this._markDirty();
      this._updatePreview();
    });
    editor.querySelector(".tb-bg-overlay-color").addEventListener("input", (e) => {
      bg.overlayColor = e.target.value;
      this._markDirty();
      this._updatePreview();
    });
    editor.querySelector(".tb-bg-overlay-opacity").addEventListener("input", (e) => {
      bg.overlayOpacity = parseInt(e.target.value, 10) / 100;
      const val = editor.querySelector(".tb-bg-overlay-val");
      if (val) val.textContent = e.target.value;
      this._markDirty();
      this._updatePreview();
    });

    this._updatePreview();
  }

  _hexToRgba(hex, alphaPct) {
    const c = (hex || "#000000").replace("#", "");
    if (c.length !== 6) return hex;
    const r = parseInt(c.substr(0, 2), 16);
    const g = parseInt(c.substr(2, 2), 16);
    const b = parseInt(c.substr(4, 2), 16);
    const a = Math.max(0, Math.min(100, alphaPct)) / 100;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  _buildBoxShadow(effects) {
    const shadow = (effects && effects.shadow) || {};
    const glow = (effects && effects.glow) || {};
    const layers = [];
    if (shadow.enabled !== false) {
      const opacity = typeof shadow.opacity === "number" ? shadow.opacity : 0.16;
      layers.push(
        `${shadow.offsetX || 0}px ${shadow.offsetY || 0}px ${shadow.blurRadius || 0}px ${shadow.spreadRadius || 0}px ${this._hexToRgba(
          shadow.color || "#000000",
          opacity * 100
        )}`
      );
    }
    if (glow.enabled) {
      const opacity = typeof glow.opacity === "number" ? glow.opacity : 0.6;
      layers.push(`0 0 ${glow.blurRadius || 0}px 0 ${this._hexToRgba(glow.color || "#ffd21a", opacity * 100)}`);
    }
    return layers.length ? layers.join(", ") : "none";
  }

  _updatePreview() {
    const theme = this._themes[this._activeIndex];
    if (!theme) return;
    const preview = this._root.querySelector(".tb-preview-day");
    if (!preview) return;
    const c = theme.colors;
    const bg = theme.background || {};
    preview.style.setProperty("--p-bg", this._hexToRgba(c.card, theme.cardOpacity));
    preview.style.setProperty("--p-border", c.border);
    preview.style.setProperty("--p-border-width", `${theme.borderWidth}px`);
    preview.style.setProperty("--p-accent-border-width", `${theme.accentBorderWidth}px`);
    preview.style.setProperty("--p-text", c.text);
    preview.style.setProperty("--p-text-secondary", c.textSecondary);
    preview.style.setProperty("--p-accent", c.accent);
    preview.style.setProperty("--p-accent-text", c.accentText);
    preview.style.setProperty("--p-block-bg", this._hexToRgba(c.surface2, theme.cardOpacity));
    preview.style.setProperty("--p-chip-bg", this._hexToRgba(c.surfaceAlt, theme.cardOpacity));
    preview.style.setProperty("--p-day-name-size", `${theme.fonts.dayName}px`);
    preview.style.setProperty("--p-day-number-size", `${theme.fonts.dayNumber}px`);
    preview.style.setProperty("--p-event-size", `${theme.fonts.event}px`);
    preview.style.setProperty("--p-chip-size", `${theme.fonts.chip}px`);
    preview.style.setProperty("--p-block-size", `${theme.fonts.blockMeal}px`);
    preview.style.setProperty("--p-box-shadow", this._buildBoxShadow(theme.effects));
    preview.style.setProperty("--p-bg-image", bg.image ? `url("${bg.image.replace(/"/g, '\\"')}")` : "none");
    preview.style.setProperty("--p-bg-size", bg.size === "repeat" ? "auto" : bg.size || "cover");
    preview.style.setProperty("--p-bg-position", bg.position || "center");
    preview.style.setProperty("--p-bg-blur-px", `${bg.blur || 0}px`);
    preview.style.setProperty("--p-bg-image-opacity", typeof bg.opacity === "number" ? bg.opacity : 1);
    preview.style.setProperty("--p-bg-overlay", this._hexToRgba(bg.overlayColor || "#000000", (bg.overlayOpacity || 0) * 100));
  }

  _markDirty() {
    this._dirty = true;
    this._updateStatus();
  }

  _updateStatus() {
    const status = this._root.querySelector(".tb-status");
    if (!status) return;
    status.textContent = this._dirty ? "Unsaved changes" : "All changes saved";
    status.classList.toggle("dirty", this._dirty);
  }

  _addTheme() {
    if (this._themes.length >= TB_MAX_THEMES) return;
    const id = `theme-${Date.now()}`;
    this._themes.push(this._blankTheme(`Theme ${this._themes.length + 1}`, id));
    this._activeIndex = this._themes.length - 1;
    this._markDirty();
    this._renderAll();
  }

  _deleteTheme() {
    if (this._themes.length <= 1) return;
    const theme = this._themes[this._activeIndex];
    if (!window.confirm(`Delete theme "${theme.name || "Untitled"}"? This can't be undone once saved.`)) return;
    this._themes.splice(this._activeIndex, 1);
    this._activeIndex = Math.max(0, this._activeIndex - 1);
    this._markDirty();
    this._renderAll();
  }

  async _save() {
    const btn = this._root.querySelector(".tb-save-btn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Saving...";
    }
    try {
      await this._hass.connection.sendMessagePromise({ type: "theme_builder/save", themes: this._themes });
      this._dirty = false;
      this._updateStatus();
    } catch (e) {
      window.alert("Failed to save themes: " + (e && e.message ? e.message : e));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Save All";
      }
    }
  }
}

if (!customElements.get("theme-builder-panel")) {
  customElements.define("theme-builder-panel", ThemeBuilderPanel);
}
