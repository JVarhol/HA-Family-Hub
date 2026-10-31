// Must match const.py's MAX_THEMES - 6 original presets + Liquid Glass/
// Liquid Glass Dark = 8 built-ins, bumped to 10 so a fresh install still
// has room for 2 custom themes instead of the Add button being disabled
// from the first load.
// ---- Family Hub shared translation helper (v1.168.76) -------------------
// __fhT(key, english, vars, mode) looks a string up in Home Assistant's
// loaded "fh_ui" translations (translations/<language>.json → fh_ui.text.*)
// and falls back to the English text written right here in the source.
// vars fill %0%, %1%, ... placeholders. mode "h" escapes the translated
// text (not the vars, which callers already prepared) for use inside HTML
// markup or an attribute value. Identical copy in every Family Hub card and
// in the Theme Builder panel - whichever loads first sets it up.
// __fhSweep(root) re-translates markup that was drawn before the language
// file finished loading (elements tagged data-fh-t / data-fh-title /
// data-fh-placeholder / data-fh-aria / data-fh-alt), but only while they
// still show the English original, so text a card later replaced with
// something else is never overwritten.
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

// v1.168.76: 10 built-ins now (+ HA Light / HA Dark) - 12 keeps 2 custom slots.
const TB_MAX_THEMES = 12;
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
    __fhUseHass(hass);
    this._fhEnsureI18n();
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

  // v1.168.76: the Theme Builder page is a panel, not a card, so nothing
  // else loads Family Hub's "fh_ui" strings for it - do that here, then
  // re-translate what's already on screen and redraw the editor.
  _fhEnsureI18n() {
    const hass = this._hass;
    if (!hass || typeof hass.loadBackendTranslation !== "function") return;
    const lang = String(hass.language || "en");
    if (this._fhI18nLang === lang) {
      if (hass.localize !== this._fhI18nLocalize) {
        this._fhI18nLocalize = hass.localize;
        this._fhOnI18nReady();
      }
      return;
    }
    if (this._fhI18nLoading === lang) return;
    this._fhI18nLoading = lang;
    hass
      .loadBackendTranslation("fh_ui", "family_hub")
      .then(() => {
        this._fhI18nLang = lang;
        this._fhI18nLoading = null;
        this._fhI18nLocalize = this._hass && this._hass.localize;
        this._fhOnI18nReady();
      })
      .catch(() => {
        this._fhI18nLoading = null;
      });
  }

  _fhOnI18nReady() {
    if (!this._root) return;
    __fhSweep(this._root);
    try {
      if (this._themes && this._themes.length) this._renderAll();
    } catch (e) {
      // drawing is best-effort here - the next edit redraws anyway
    }
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
      img.alt = __fhT("text.family_hub_logo", "Family Hub logo");
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
      fontFamily: "",
      borderWidth: 1,
      accentBorderWidth: 2,
      cardOpacity: 100,
      glassBlur: 0,
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
      fontFamily: t && typeof t.fontFamily === "string" ? t.fontFamily : blank.fontFamily,
      borderWidth: t && typeof t.borderWidth === "number" ? t.borderWidth : blank.borderWidth,
      accentBorderWidth: t && typeof t.accentBorderWidth === "number" ? t.accentBorderWidth : blank.accentBorderWidth,
      cardOpacity: t && typeof t.cardOpacity === "number" ? t.cardOpacity : blank.cardOpacity,
      glassBlur: t && typeof t.glassBlur === "number" ? t.glassBlur : blank.glassBlur,
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
        .tb-preview-day { font-family: var(--p-font-family, inherit); }
        .tb-font-family-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 12px; }
        .tb-font-family-row select, .tb-font-family-row input { padding: 6px 8px; border-radius: 8px; border: 1px solid var(--divider-color, #ccc); background: var(--card-background-color, #fff); color: var(--primary-text-color, #222); font: inherit; }
        .tb-font-family-row input { flex: 1; min-width: 220px; }
        .tb-preview-label { font-size: 12px; color: var(--secondary-text-color, #888); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.03em; }
        .tb-preview-day {
          position: relative; overflow: hidden;
          width: 220px; border-radius: 10px; padding: 12px; box-sizing: border-box;
          background-color: var(--p-bg, #fff);
          border-style: solid;
          border-width: var(--p-border-width, 1px); border-color: var(--p-border, #ddd);
          color: var(--p-text, #222);
          box-shadow: var(--p-box-shadow, none);
          backdrop-filter: blur(var(--p-glass-blur, 0px));
          -webkit-backdrop-filter: blur(var(--p-glass-blur, 0px));
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
            <div class="tb-header-title">${this._iconUrl() ? `<img data-fh-alt="text.family_hub_logo" class="tb-logo" src="${this._iconUrl()}" alt="${__fhT("text.family_hub_logo", "Family Hub logo", null, "h")}" />` : `<span class="tb-icon">&#127912;</span>`}<h1 data-fh-t="text.theme_builder">${__fhT("text.theme_builder", "Theme Builder", null, "h")}</h1></div>
            <div data-fh-t="text.colors_auto_register_as_selectable_home" class="tb-header-sub">${__fhT("text.colors_auto_register_as_selectable_home", "Colors auto-register as selectable Home Assistant themes. Shadows, glow, and background images are available to cards built to read them.", null, "h")}</div>
          </div>
          <div class="tb-header-actions">
            <div class="tb-device-theme">
              <button data-fh-title="text.set_the_theme_for_this_device_only" class="tb-device-theme-btn" title="${__fhT("text.set_the_theme_for_this_device_only", "Set the theme for THIS device only - other devices/tablets are unaffected", null, "h")}">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14,12.94c0.04,-0.3 0.06,-0.61 0.06,-0.94c0,-0.32 -0.02,-0.64 -0.07,-0.94l2.03,-1.58c0.18,-0.14 0.23,-0.41 0.12,-0.61l-1.92,-3.32c-0.12,-0.22 -0.37,-0.29 -0.59,-0.22l-2.39,0.96c-0.5,-0.38 -1.03,-0.7 -1.62,-0.94L14.4,2.81c-0.04,-0.24 -0.24,-0.41 -0.48,-0.41h-3.84c-0.24,0 -0.43,0.17 -0.47,0.41L9.25,5.35C8.66,5.59 8.12,5.92 7.63,6.29L5.24,5.33c-0.22,-0.08 -0.47,0 -0.59,0.22L2.74,8.87C2.62,9.08 2.66,9.34 2.86,9.48l2.03,1.58C4.84,11.36 4.8,11.69 4.8,12s0.02,0.64 0.07,0.94l-2.03,1.58c-0.18,0.14 -0.23,0.41 -0.12,0.61l1.92,3.32c0.12,0.22 0.37,0.29 0.59,0.22l2.39,-0.96c0.5,0.38 1.03,0.7 1.62,0.94l0.36,2.54c0.05,0.24 0.24,0.41 0.48,0.41h3.84c0.24,0 0.44,-0.17 0.47,-0.41l0.36,-2.54c0.59,-0.24 1.13,-0.56 1.62,-0.94l2.39,0.96c0.22,0.08 0.47,0 0.59,-0.22l1.92,-3.32c0.12,-0.22 0.07,-0.47 -0.12,-0.61L19.14,12.94z M12,15.6c-1.98,0 -3.6,-1.62 -3.6,-3.6s1.62,-3.6 3.6,-3.6s3.6,1.62 3.6,3.6S13.98,15.6 12,15.6z"/></svg>
                <span data-fh-t="text.this_device_default" class="tb-device-theme-label">${__fhT("text.this_device_default", "This device: Default", null, "h")}</span>
              </button>
              <div class="tb-device-theme-dropdown"></div>
            </div>
            <span class="tb-status"></span>
            <button data-fh-t="text.save_all" class="tb-save-btn">${__fhT("text.save_all", "Save All", null, "h")}</button>
          </div>
        </div>
        <div class="tb-body">
          <div class="tb-sidebar">
            <div class="tb-tabs"></div>
            <button data-fh-t="text.add_theme" class="tb-add-theme">${__fhT("text.add_theme", "➕ Add theme", null, "h")}</button>
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
    if (labelEl) labelEl.textContent = __fhT("text.this_device_x", "This device: %0%", {0: this._deviceThemeName || "Default"});
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
      editor.innerHTML = `<div data-fh-t="text.no_themes_yet" class="tb-empty">${__fhT("text.no_themes_yet", "No themes yet.", null, "h")}</div>`;
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
        <input data-fh-placeholder="text.theme_name" type="text" class="tb-name-input" value="${this._escape(theme.name)}" maxlength="24" placeholder="${__fhT("text.theme_name", "Theme name", null, "h")}" />
        <button data-fh-t="text.delete_theme" class="tb-delete-theme" ${this._themes.length <= 1 ? "disabled" : ""}>${__fhT("text.delete_theme", "🗑️ Delete theme", null, "h")}</button>
      </div>
      <div class="tb-preview">
        <div data-fh-t="text.live_preview" class="tb-preview-label">${__fhT("text.live_preview", "Live preview", null, "h")}</div>
        <div class="tb-preview-day">
          <div class="tb-preview-daylabel">MON</div>
          <div class="tb-preview-daynum">12</div>
          <div data-fh-t="text.dinner_taco_night" class="tb-preview-block">${__fhT("text.dinner_taco_night", "Dinner — Taco Night", null, "h")}</div>
          <div class="tb-preview-event">
            <span data-fh-t="text.family" class="tb-preview-chip">${__fhT("text.family", "Family", null, "h")}</span>
            <span data-fh-t="text.soccer_practice">${__fhT("text.soccer_practice", "Soccer practice", null, "h")}</span>
          </div>
        </div>
      </div>
      <div class="tb-section">
        <h2 data-fh-t="text.colors">${__fhT("text.colors", "Colors", null, "h")}</h2>
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
        <h2 data-fh-t="text.font_family">${__fhT("text.font_family", "Font family", null, "h")}</h2>
        <div class="tb-font-family-row">
          <select class="tb-font-family-select">
            ${[...this._fontChoices(), ["__custom__", __fhT("text.font_family_custom", "Custom...", null, "h")]]
              .map(([value, label]) => `<option value="${value.replace(/"/g, "&quot;")}"${value === this._fontChoiceValue(theme.fontFamily) ? " selected" : ""}>${label}</option>`)
              .join("")}
          </select>
          <input type="text" class="tb-font-family-custom" maxlength="200" value="${(theme.fontFamily || "").replace(/"/g, "&quot;")}" placeholder="${__fhT("text.font_family_custom_placeholder", "CSS font-family, for example Georgia, serif", null, "h").replace(/"/g, "&quot;")}" style="${this._fontChoiceValue(theme.fontFamily) === "__custom__" ? "" : "display:none"}" />
        </div>
      </div>
      <div class="tb-section">
        <h2 data-fh-t="text.fonts_px">${__fhT("text.fonts_px", "Fonts (px)", null, "h")}</h2>
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
        <h2 data-fh-t="text.appearance">${__fhT("text.appearance", "Appearance", null, "h")}</h2>
        <label class="tb-appearance-row">
          <span data-fh-t="text.border_weight_px">${__fhT("text.border_weight_px", "Border weight (px)", null, "h")}</span>
          <input type="number" class="tb-border-width" min="0" max="8" value="${theme.borderWidth}" />
        </label>
        <label class="tb-appearance-row">
          <span data-fh-t="text.accent_border_weight_px">${__fhT("text.accent_border_weight_px", "Accent border weight (px)", null, "h")}</span>
          <input type="number" class="tb-accent-border-width" min="0" max="8" value="${theme.accentBorderWidth}" />
        </label>
        <label class="tb-appearance-row">
          <span>${__fhT("text.card_chip_transparency", "Card / chip transparency (", null, "h")}<span class="tb-opacity-val">${theme.cardOpacity}</span>%)</span>
          <input type="range" class="tb-opacity" min="20" max="100" value="${theme.cardOpacity}" />
        </label>
        <label class="tb-appearance-row">
          <span>${__fhT("text.glass_blur", "Glass blur (", null, "h")}<span class="tb-glass-blur-val">${theme.glassBlur}</span>${__fhT("text.px_pairs_with_transparency_above_for_a", "px) - pairs with transparency above for a \"liquid glass\" look", null, "h")}</span>
          <input type="range" class="tb-glass-blur" min="0" max="24" value="${theme.glassBlur}" />
        </label>
      </div>
      <div class="tb-section">
        <h2 data-fh-t="text.shadow">${__fhT("text.shadow", "Shadow", null, "h")}</h2>
        <label class="tb-appearance-row">
          <span data-fh-t="text.enable_drop_shadow">${__fhT("text.enable_drop_shadow", "Enable drop shadow", null, "h")}</span>
          <input type="checkbox" class="tb-shadow-enabled" ${shadow.enabled ? "checked" : ""} />
        </label>
        <label class="tb-color-row" style="max-width:460px;">
          <span data-fh-t="text.shadow_color">${__fhT("text.shadow_color", "Shadow color", null, "h")}</span>
          <input type="color" class="tb-shadow-color" value="${shadow.color}" />
        </label>
        <label class="tb-appearance-row">
          <span>${__fhT("text.opacity", "Opacity (", null, "h")}<span class="tb-shadow-opacity-val">${Math.round(shadow.opacity * 100)}</span>%)</span>
          <input type="range" class="tb-shadow-opacity" min="0" max="100" value="${Math.round(shadow.opacity * 100)}" />
        </label>
        <label class="tb-appearance-row">
          <span data-fh-t="text.blur_px">${__fhT("text.blur_px", "Blur (px)", null, "h")}</span>
          <input type="number" class="tb-shadow-blur" min="0" max="60" value="${shadow.blurRadius}" />
        </label>
        <label class="tb-appearance-row">
          <span data-fh-t="text.spread_px">${__fhT("text.spread_px", "Spread (px)", null, "h")}</span>
          <input type="number" class="tb-shadow-spread" min="-20" max="40" value="${shadow.spreadRadius}" />
        </label>
        <label class="tb-appearance-row">
          <span data-fh-t="text.offset_x_px">${__fhT("text.offset_x_px", "Offset X (px)", null, "h")}</span>
          <input type="number" class="tb-shadow-offset-x" min="-40" max="40" value="${shadow.offsetX}" />
        </label>
        <label class="tb-appearance-row">
          <span data-fh-t="text.offset_y_px">${__fhT("text.offset_y_px", "Offset Y (px)", null, "h")}</span>
          <input type="number" class="tb-shadow-offset-y" min="-40" max="40" value="${shadow.offsetY}" />
        </label>
      </div>
      <div class="tb-section">
        <h2 data-fh-t="text.glow">${__fhT("text.glow", "Glow", null, "h")}</h2>
        <label class="tb-appearance-row">
          <span data-fh-t="text.enable_glow">${__fhT("text.enable_glow", "Enable glow", null, "h")}</span>
          <input type="checkbox" class="tb-glow-enabled" ${glow.enabled ? "checked" : ""} />
        </label>
        <label class="tb-color-row" style="max-width:460px;">
          <span data-fh-t="text.glow_color">${__fhT("text.glow_color", "Glow color", null, "h")}</span>
          <input type="color" class="tb-glow-color" value="${glow.color}" />
        </label>
        <label class="tb-appearance-row">
          <span>${__fhT("text.opacity", "Opacity (", null, "h")}<span class="tb-glow-opacity-val">${Math.round(glow.opacity * 100)}</span>%)</span>
          <input type="range" class="tb-glow-opacity" min="0" max="100" value="${Math.round(glow.opacity * 100)}" />
        </label>
        <label class="tb-appearance-row">
          <span data-fh-t="text.blur_px">${__fhT("text.blur_px", "Blur (px)", null, "h")}</span>
          <input type="number" class="tb-glow-blur" min="0" max="60" value="${glow.blurRadius}" />
        </label>
      </div>
      <div class="tb-section">
        <h2 data-fh-t="text.background_image">${__fhT("text.background_image", "Background image", null, "h")}</h2>
        <div data-fh-t="text.cards_that_opt_in_to_reading_theme" class="tb-section-hint">${__fhT("text.cards_that_opt_in_to_reading_theme", "Cards that opt in to reading Theme Builder data (like the family calendar card) can show this behind their content. It does not apply to the native Home Assistant theme.", null, "h")}</div>
        <span data-fh-t="text.image_url_e_g_local_my_bg_jpg_or_https" class="tb-field-label">${__fhT("text.image_url_e_g_local_my_bg_jpg_or_https", "Image URL (e.g. /local/my-bg.jpg or https://...)", null, "h")}</span>
        <input data-fh-placeholder="text.no_background_image" type="text" class="tb-bg-url-input" value="${this._escape(bg.image)}" placeholder="${__fhT("text.no_background_image", "No background image", null, "h")}" />
        <label class="tb-appearance-row">
          <span data-fh-t="text.fit">${__fhT("text.fit", "Fit", null, "h")}</span>
          <select class="tb-bg-size">
            <option data-fh-t="text.cover" value="cover" ${bg.size === "cover" ? "selected" : ""}>${__fhT("text.cover", "Cover", null, "h")}</option>
            <option data-fh-t="text.contain" value="contain" ${bg.size === "contain" ? "selected" : ""}>${__fhT("text.contain", "Contain", null, "h")}</option>
            <option data-fh-t="text.repeat_tile" value="repeat" ${bg.size === "repeat" ? "selected" : ""}>${__fhT("text.repeat_tile", "Repeat (tile)", null, "h")}</option>
          </select>
        </label>
        <label class="tb-appearance-row">
          <span data-fh-t="text.position">${__fhT("text.position", "Position", null, "h")}</span>
          <select class="tb-bg-position">
            <option data-fh-t="text.center" value="center" ${bg.position === "center" ? "selected" : ""}>${__fhT("text.center", "Center", null, "h")}</option>
            <option data-fh-t="text.top" value="top" ${bg.position === "top" ? "selected" : ""}>${__fhT("text.top", "Top", null, "h")}</option>
            <option data-fh-t="text.bottom" value="bottom" ${bg.position === "bottom" ? "selected" : ""}>${__fhT("text.bottom", "Bottom", null, "h")}</option>
          </select>
        </label>
        <label class="tb-appearance-row">
          <span>${__fhT("text.image_opacity", "Image opacity (", null, "h")}<span class="tb-bg-opacity-val">${Math.round(bg.opacity * 100)}</span>%)</span>
          <input type="range" class="tb-bg-opacity" min="0" max="100" value="${Math.round(bg.opacity * 100)}" />
        </label>
        <label class="tb-appearance-row">
          <span data-fh-t="text.blur_px">${__fhT("text.blur_px", "Blur (px)", null, "h")}</span>
          <input type="number" class="tb-bg-blur" min="0" max="30" value="${bg.blur}" />
        </label>
        <label class="tb-color-row" style="max-width:460px;">
          <span data-fh-t="text.overlay_tint">${__fhT("text.overlay_tint", "Overlay tint", null, "h")}</span>
          <input type="color" class="tb-bg-overlay-color" value="${bg.overlayColor}" />
        </label>
        <label class="tb-appearance-row">
          <span>${__fhT("text.overlay_strength", "Overlay strength (", null, "h")}<span class="tb-bg-overlay-val">${Math.round(bg.overlayOpacity * 100)}</span>%)</span>
          <input type="range" class="tb-bg-overlay-opacity" min="0" max="100" value="${Math.round(bg.overlayOpacity * 100)}" />
        </label>
      </div>
    `;

    editor.querySelector(".tb-name-input").addEventListener("input", (e) => {
      theme.name = e.target.value;
      this._markDirty();
      const tab = this._root.querySelector(`.tb-tab[data-idx="${this._activeIndex}"] .tb-tab-name`);
      if (tab) tab.textContent = e.target.value || __fhT("text.untitled", "Untitled");
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
    const fontSelect = editor.querySelector(".tb-font-family-select");
    const fontCustom = editor.querySelector(".tb-font-family-custom");
    const fontPattern = /^[\w\s,'"\-]{0,200}$/;
    fontSelect.addEventListener("change", () => {
      if (fontSelect.value === "__custom__") {
        fontCustom.style.display = "";
        fontCustom.focus();
        return;
      }
      fontCustom.style.display = "none";
      theme.fontFamily = fontSelect.value;
      fontCustom.value = theme.fontFamily;
      this._markDirty();
      this._updatePreview();
    });
    fontCustom.addEventListener("input", () => {
      const value = fontCustom.value.trim();
      if (!fontPattern.test(value)) return;
      theme.fontFamily = value;
      this._markDirty();
      this._updatePreview();
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
    editor.querySelector(".tb-glass-blur").addEventListener("input", (e) => {
      theme.glassBlur = parseInt(e.target.value, 10);
      const blurVal = editor.querySelector(".tb-glass-blur-val");
      if (blurVal) blurVal.textContent = theme.glassBlur;
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

  _fontChoices() {
    return [
      ["", __fhT("text.font_family_default", "Default (rounded)", null, "h")],
      ['system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', __fhT("text.font_family_system", "System sans-serif", null, "h")],
      ['Georgia, "Times New Roman", serif', __fhT("text.font_family_serif", "Serif", null, "h")],
      ['ui-monospace, Menlo, Consolas, monospace', __fhT("text.font_family_mono", "Monospace", null, "h")],
    ];
  }
  _fontChoiceValue(fontFamily) {
    const value = fontFamily || "";
    return this._fontChoices().some(([v]) => v === value) ? value : "__custom__";
  }
  _updatePreview() {
    const theme = this._themes[this._activeIndex];
    if (!theme) return;
    const preview = this._root.querySelector(".tb-preview-day");
    if (!preview) return;
    const c = theme.colors;
    const bg = theme.background || {};
    preview.style.setProperty("--p-bg", this._hexToRgba(c.card, theme.cardOpacity));
    preview.style.setProperty("--p-glass-blur", `${theme.glassBlur || 0}px`);
    preview.style.setProperty("--p-border", c.border);
    preview.style.setProperty("--p-border-width", `${theme.borderWidth}px`);
    preview.style.setProperty("--p-accent-border-width", `${theme.accentBorderWidth}px`);
    preview.style.setProperty("--p-text", c.text);
    preview.style.setProperty("--p-text-secondary", c.textSecondary);
    preview.style.setProperty("--p-accent", c.accent);
    preview.style.setProperty("--p-accent-text", c.accentText);
    preview.style.setProperty("--p-block-bg", this._hexToRgba(c.surface2, theme.cardOpacity));
    preview.style.setProperty("--p-chip-bg", this._hexToRgba(c.surfaceAlt, theme.cardOpacity));
    preview.style.setProperty("--p-font-family", theme.fontFamily || "");
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
    status.textContent = this._dirty ? __fhT("text.unsaved_changes", "Unsaved changes") : __fhT("text.all_changes_saved", "All changes saved");
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
    if (!window.confirm(__fhT("text.delete_theme_x_this_can_t_be_undone", "Delete theme \"%0%\"? This can't be undone once saved.", {0: theme.name || "Untitled"}))) return;
    this._themes.splice(this._activeIndex, 1);
    this._activeIndex = Math.max(0, this._activeIndex - 1);
    this._markDirty();
    this._renderAll();
  }

  async _save() {
    const btn = this._root.querySelector(".tb-save-btn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = __fhT("text.saving_2", "Saving...");
    }
    try {
      await this._hass.connection.sendMessagePromise({ type: "theme_builder/save", themes: this._themes });
      this._dirty = false;
      this._updateStatus();
    } catch (e) {
      window.alert(__fhT("text.failed_to_save_themes_x", "Failed to save themes: %0%", {0: e && e.message ? e.message : e}));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = __fhT("text.save_all", "Save All");
      }
    }
  }
}

if (!customElements.get("theme-builder-panel")) {
  customElements.define("theme-builder-panel", ThemeBuilderPanel);
}
