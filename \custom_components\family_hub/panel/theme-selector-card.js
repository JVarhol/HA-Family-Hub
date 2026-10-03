// Theme Builder: Theme Selector card - the dashboard-card counterpart to
// the "this device's theme" picker in the Theme Builder page itself (see
// theme-builder-panel.js). A gear icon that opens a list of every theme
// Home Assistant currently knows about (themes.yaml, HACS themes, and any
// Theme Builder theme, since those are auto-registered as native HA themes -
// see _register_ha_themes in __init__.py) and applies the chosen one.
//
// Deliberately device-specific: picking a theme here does NOT call the
// frontend.set_theme service, because that service changes the theme for
// every browser/tablet signed in as the same HA user - not what you want on
// a wall-mounted kiosk where each device should be able to look different.
// Instead the chosen theme's CSS custom properties are written directly
// onto <html> in THIS browser only, and the choice is remembered in this
// browser's localStorage so it survives reloads without touching any other
// device. Same pattern as the calendar card's device-specific "show
// timeline" toggle.
const STORAGE_KEY = "family-hub-device-theme";
const DEFAULT_ID = "__default__";

class ThemeSelectorCard extends HTMLElement {
setConfig(config) {
this._config = Object.assign({ title: "Theme" }, config || {});
if (!this._built) this._build();
}

set hass(hass) {
this._hass = hass;
if (!this._built) this._build();
// The theme this device has picked may have changed on the backend
// (e.g. someone edited it in Theme Builder) - re-resolve and reapply
// from the live definition so this device stays current, not just
// whatever snapshot was saved at selection time.
if (this._activeId && this._activeId !== DEFAULT_ID) {
this._applyThemeVars(this._resolveThemeVars(this._activeId));
}
this._renderList();
}

get hass() {
return this._hass;
}

getCardSize() {
return 1;
}

connectedCallback() {
// Apply whatever this device last chose immediately, from the stored
// snapshot, so there's no flash of the default look while waiting for
// `hass` to be set and themes to load.
if (!this._appliedStoredOnConnect) {
this._appliedStoredOnConnect = true;
this._loadStoredChoice();
if (this._activeId && this._activeId !== DEFAULT_ID && this._activeVars) {
this._applyThemeVars(this._activeVars);
}
}
document.addEventListener("click", this._boundOutsideClick || (this._boundOutsideClick = this._onOutsideClick.bind(this)));
}

disconnectedCallback() {
document.removeEventListener("click", this._boundOutsideClick);
}

_loadStoredChoice() {
try {
const raw = localStorage.getItem(STORAGE_KEY);
if (!raw) return;
const saved = JSON.parse(raw);
if (saved && saved.id) {
this._activeId = saved.id;
this._activeName = saved.name || saved.id;
this._activeVars = saved.vars || null;
}
} catch (e) {
// Corrupt/unavailable localStorage - just fall back to the default look.
}
}

_themeNames() {
const themes = (this._hass && this._hass.themes && this._hass.themes.themes) || {};
return Object.keys(themes).sort((a, b) => a.localeCompare(b));
}

_resolveThemeVars(name) {
const themes = (this._hass && this._hass.themes && this._hass.themes.themes) || {};
const theme = themes[name];
if (!theme) return {};
const vars = {};
for (const key of Object.keys(theme)) {
if (key === "modes") continue;
vars[key] = theme[key];
}
// Newer-style HA themes can split light/dark-only variables under
// "modes" - overlay whichever one currently applies on top of the
// shared vars above.
if (theme.modes) {
const dark = !!(this._hass && this._hass.themes && this._hass.themes.darkMode);
const modeVars = theme.modes[dark ? "dark" : "light"] || {};
for (const key of Object.keys(modeVars)) {
vars[key] = modeVars[key];
}
}
return vars;
}

_applyThemeVars(vars) {
// Clear whatever this card applied last time before applying the new
// set, so a var that existed in the old theme but not the new one
// doesn't linger.
const prevKeys = this._appliedKeys || [];
for (const key of prevKeys) {
document.documentElement.style.removeProperty(`--${key}`);
}
const keys = Object.keys(vars || {});
for (const key of keys) {
document.documentElement.style.setProperty(`--${key}`, vars[key]);
}
this._appliedKeys = keys;
}

_selectTheme(name) {
if (name === DEFAULT_ID) {
this._applyThemeVars({});
this._activeId = DEFAULT_ID;
this._activeName = "Default";
this._activeVars = null;
try {
localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: DEFAULT_ID }));
} catch (e) {}
} else {
const vars = this._resolveThemeVars(name);
this._applyThemeVars(vars);
this._activeId = name;
this._activeName = name;
this._activeVars = vars;
try {
localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: name, name, vars }));
} catch (e) {}
}
this._closeDropdown();
this._renderList();
}

_onOutsideClick(ev) {
if (!this._open) return;
if (this.contains && this.contains(ev.target)) return;
this._closeDropdown();
}

_closeDropdown() {
this._open = false;
if (this._dropdownEl) this._dropdownEl.style.display = "none";
if (this._gearBtn) this._gearBtn.classList.remove("open");
}

_toggleDropdown() {
this._open = !this._open;
if (this._dropdownEl) this._dropdownEl.style.display = this._open ? "block" : "none";
if (this._gearBtn) this._gearBtn.classList.toggle("open", this._open);
if (this._open) this._renderList();
}

_renderList() {
if (!this._listEl) return;
const names = this._themeNames();
const rows = [];
rows.push({ id: DEFAULT_ID, label: "Default (this device)" });
for (const name of names) rows.push({ id: name, label: name });

this._listEl.innerHTML = "";
for (const row of rows) {
const item = document.createElement("div");
item.className = "ts-item";
const active = (this._activeId || DEFAULT_ID) === row.id;
if (active) item.classList.add("active");
item.textContent = row.label;
const check = document.createElement("span");
check.className = "ts-check";
check.textContent = active ? "✓" : "";
item.appendChild(check);
item.addEventListener("click", () => this._selectTheme(row.id));
this._listEl.appendChild(item);
}

if (this._labelEl) {
this._labelEl.textContent = this._activeName || "Default";
}
}

_build() {
this._built = true;
const root = this.attachShadow ? this.attachShadow({ mode: "open" }) : this;

const style = document.createElement("style");
style.textContent = `
:host { display: block; }
ha-card, .ts-card {
display: block;
border-radius: var(--ha-card-border-radius, 12px);
background: var(--card-background-color, #fff);
box-shadow: var(--ha-card-box-shadow, 0 2px 6px rgba(0,0,0,0.12));
border: 1px solid var(--ha-card-border-color, var(--divider-color, transparent));
overflow: visible;
position: relative;
}
.ts-row {
display: flex;
align-items: center;
gap: 10px;
padding: 12px 16px;
cursor: pointer;
color: var(--primary-text-color, #212121);
user-select: none;
}
.ts-gear {
display: flex;
align-items: center;
justify-content: center;
width: 28px;
height: 28px;
border-radius: 50%;
color: var(--secondary-text-color, #727272);
transition: transform 0.15s ease, color 0.15s ease;
flex: 0 0 auto;
}
.ts-gear.open, .ts-row:hover .ts-gear {
color: var(--primary-color, #03a9f4);
}
.ts-gear.open svg { transform: rotate(35deg); }
.ts-gear svg { transition: transform 0.15s ease; width: 20px; height: 20px; }
.ts-title { font-weight: 600; font-size: 14px; }
.ts-active-name {
margin-left: auto;
font-size: 12px;
color: var(--secondary-text-color, #727272);
}
.ts-dropdown {
display: none;
position: absolute;
top: calc(100% + 4px);
right: 8px;
min-width: 200px;
max-height: 320px;
overflow-y: auto;
background: var(--card-background-color, #fff);
border: 1px solid var(--divider-color, #ddd);
border-radius: 10px;
box-shadow: 0 6px 20px rgba(0,0,0,0.18);
z-index: 20;
}
.ts-item {
display: flex;
align-items: center;
justify-content: space-between;
gap: 8px;
padding: 10px 14px;
font-size: 13px;
color: var(--primary-text-color, #212121);
cursor: pointer;
}
.ts-item:hover { background: var(--secondary-background-color, rgba(0,0,0,0.04)); }
.ts-item.active { font-weight: 700; color: var(--primary-color, #03a9f4); }
.ts-check { width: 16px; text-align: center; }
`;

const card = document.createElement("div");
card.className = "ts-card";

const rowEl = document.createElement("div");
rowEl.className = "ts-row";

const gear = document.createElement("div");
gear.className = "ts-gear";
gear.innerHTML =
'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14,12.94c0.04,-0.3 0.06,-0.61 0.06,-0.94c0,-0.32 -0.02,-0.64 -0.07,-0.94l2.03,-1.58c0.18,-0.14 0.23,-0.41 0.12,-0.61l-1.92,-3.32c-0.12,-0.22 -0.37,-0.29 -0.59,-0.22l-2.39,0.96c-0.5,-0.38 -1.03,-0.7 -1.62,-0.94L14.4,2.81c-0.04,-0.24 -0.24,-0.41 -0.48,-0.41h-3.84c-0.24,0 -0.43,0.17 -0.47,0.41L9.25,5.35C8.66,5.59 8.12,5.92 7.63,6.29L5.24,5.33c-0.22,-0.08 -0.47,0 -0.59,0.22L2.74,8.87C2.62,9.08 2.66,9.34 2.86,9.48l2.03,1.58C4.84,11.36 4.8,11.69 4.8,12s0.02,0.64 0.07,0.94l-2.03,1.58c-0.18,0.14 -0.23,0.41 -0.12,0.61l1.92,3.32c0.12,0.22 0.37,0.29 0.59,0.22l2.39,-0.96c0.5,0.38 1.03,0.7 1.62,0.94l0.36,2.54c0.05,0.24 0.24,0.41 0.48,0.41h3.84c0.24,0 0.44,-0.17 0.47,-0.41l0.36,-2.54c0.59,-0.24 1.13,-0.56 1.62,-0.94l2.39,0.96c0.22,0.08 0.47,0 0.59,-0.22l1.92,-3.32c0.12,-0.22 0.07,-0.47 -0.12,-0.61L19.14,12.94z M12,15.6c-1.98,0 -3.6,-1.62 -3.6,-3.6s1.62,-3.6 3.6,-3.6s3.6,1.62 3.6,3.6S13.98,15.6 12,15.6z"/></svg>';
this._gearBtn = gear;

const title = document.createElement("div");
title.className = "ts-title";
title.textContent = this._config.title || "Theme";

const activeName = document.createElement("div");
activeName.className = "ts-active-name";
this._labelEl = activeName;

rowEl.appendChild(gear);
rowEl.appendChild(title);
rowEl.appendChild(activeName);
rowEl.addEventListener("click", (ev) => {
ev.stopPropagation();
this._toggleDropdown();
});

const dropdown = document.createElement("div");
dropdown.className = "ts-dropdown";
this._dropdownEl = dropdown;
const list = document.createElement("div");
this._listEl = list;
dropdown.appendChild(list);

card.appendChild(rowEl);
card.appendChild(dropdown);

root.appendChild(style);
root.appendChild(card);

this._loadStoredChoice();
this._renderList();
}
}

customElements.define("theme-selector-card", ThemeSelectorCard);

window.customCards = window.customCards || [];
window.customCards.push({
type: "theme-selector-card",
name: "Theme Builder: Theme Selector",
description: "A Theme Builder card - a gear icon that lets this device pick its own Home Assistant theme, independent of other devices.",
});
