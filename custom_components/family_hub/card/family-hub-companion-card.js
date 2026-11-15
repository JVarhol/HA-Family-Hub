// FH-EINK START - source: tools/eink_kit.js, copied into each card by tools/sync_eink_kit.py
// 2026.11.1.16: E-ink screen and Accessibility for every card. Each card attaches with the bits that show a person's
// colour (dots, pills, avatars, tiles) and a little CSS of its own; this does the rest.
//  - E-ink screen (per device, from the calendar's Settings or ?fh_eink=...): black on white with outlines, no
//    shadows/blur/motion, each person's colour turned into the same pattern (black & white) or real ink (6 ink) the
//    calendar gives them, or a stronger version of it (Kaleido).
//  - Accessibility (household setting, settings.accessibility, with per-device overrides, like the rest of Settings):
//    Color vision (a shape and a pattern per person, not just a colour), High contrast (the black & white e-ink look on
//    any screen), Text size, Font (Atkinson Hyperlegible / Lexend, bundled), Reduce motion, Bigger buttons.
(function () {
if (window.__familyHubEink) return;
const MODES = ["bw", "color6", "kaleido"];
const PATTERNS = [
"linear-gradient(#000,#000)",
"repeating-linear-gradient(45deg,#000 0 3px,#fff 3px 6px)",
"radial-gradient(circle,#000 1.6px,#fff 1.9px) 0 0/6px 6px",
"repeating-linear-gradient(0deg,#000 0 2px,#fff 2px 5px)",
"repeating-linear-gradient(90deg,#000 0 2px,#fff 2px 4px)",
"repeating-linear-gradient(45deg,#000 0 1.5px,transparent 1.5px 5px),repeating-linear-gradient(-45deg,#000 0 1.5px,#fff 1.5px 5px)",
"repeating-conic-gradient(#000 0 25%,#fff 0 50%) 0 0/6px 6px",
"repeating-linear-gradient(-45deg,#000 0 6px,#fff 6px 10px)",
];
// Color vision: one shape per person, in the household's order (circle, square, diamond, hexagon, triangle, star,
// pentagon, cross) - used as a clip-path on their avatar/dot
const SHAPES = [
"circle(50% at 50% 50%)",
"inset(6% round 3px)",
"polygon(50% 0,100% 50%,50% 100%,0 50%)",
"polygon(25% 3%,75% 3%,100% 50%,75% 97%,25% 97%,0 50%)",
"polygon(50% 0,100% 95%,0 95%)",
"polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)",
"polygon(50% 0,100% 38%,82% 100%,18% 100%,0 38%)",
"polygon(33% 0,67% 0,67% 33%,100% 33%,100% 67%,67% 67%,67% 100%,33% 100%,33% 67%,0 67%,0 33%,33% 33%)",
];
const SHAPE_NAMES = ["circle", "square", "diamond", "hexagon", "triangle", "star", "pentagon", "cross"];
const INKS = [["red", "#d0201a", 0], ["yellow", "#f0c400", 50], ["green", "#1d8a3a", 130], ["blue", "#1a4fc0", 220]];
// a dashboard link can switch E-ink screen on for the device that opens it: ?fh_eink=bw|color6|kaleido|off
// (&fh_eink_tap=off) - for a frame showing only Today or Chores, where there's no calendar Settings to do it from
function fromUrl() {
try {
const q = new URLSearchParams(window.location.search);
const m = q.get("fh_eink");
if (m && (MODES.includes(m) || m === "off")) localStorage.setItem("familyHubEinkModeLocal", m);
const t = q.get("fh_eink_tap");
if (t === "on" || t === "off") localStorage.setItem("familyHubEinkTappableLocal", t);
} catch (e) {
}
}
fromUrl();
// ---- Accessibility ----
const A11Y = {
colorVision: ["familyHubA11yColorVisionLocal", ["off", "shapes"], "off"],
highContrast: ["familyHubA11yHighContrastLocal", ["off", "on"], "off"],
textScale: ["familyHubA11yTextScaleLocal", ["100", "125", "150", "175", "200"], "100"],
font: ["familyHubA11yFontLocal", ["theme", "legible", "dyslexia"], "theme"],
motion: ["familyHubA11yMotionLocal", ["device", "always", "off"], "device"],
bigButtons: ["familyHubA11yBigButtonsLocal", ["off", "on"], "off"],
};
function a11yClean(obj) {
const out = {};
Object.keys(A11Y).forEach((k) => {
const [, ok, def] = A11Y[k];
const v = obj && obj[k] !== undefined && obj[k] !== null ? String(obj[k]) : def;
out[k] = ok.includes(v) ? v : def;
});
return out;
}
function a11yHousehold() {
try {
const v = JSON.parse(localStorage.getItem("familyHubA11yHouseholdLocal") || "{}");
return a11yClean(v && typeof v === "object" ? v : {});
} catch (e) {
return a11yClean({});
}
}
// this device's own choices ("household" or nothing = follow the household)
function a11yDevice() {
const out = {};
Object.keys(A11Y).forEach((k) => {
try {
const v = localStorage.getItem(A11Y[k][0]);
if (v && v !== "household" && A11Y[k][1].includes(v)) out[k] = v;
} catch (e) {
}
});
return out;
}
function a11y() {
const v = Object.assign(a11yHousehold(), a11yDevice());
let reduce = v.motion === "always";
if (v.motion === "device") {
try {
reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
} catch (e) {
}
}
v.reduceMotion = reduce;
return v;
}
function setHousehold(obj) {
const next = JSON.stringify(a11yClean(obj || {}));
let before = null;
try {
before = localStorage.getItem("familyHubA11yHouseholdLocal");
} catch (e) {
}
if (before === next) return;
try {
localStorage.setItem("familyHubA11yHouseholdLocal", next);
} catch (e) {
}
refreshAll();
}
// 2026.11.2.11: "Card background: See-through" (household settings.seeThroughBackground): the cards leave their own
// background empty so the dashboard's (an animated background, a wallpaper) shows through; never in e-ink/high contrast,
// nor while a card shows a photo of its own (the calendar's full-screen holiday photo sets fh-own-bg)
function seeThrough() {
try {
return localStorage.getItem("familyHubSeeThroughLocal") === "1";
} catch (e) {
return false;
}
}
function setSeeThrough(on) {
const next = on ? "1" : "";
let before = "";
try {
before = localStorage.getItem("familyHubSeeThroughLocal") || "";
} catch (e) {
}
if (before === next) return;
try {
localStorage.setItem("familyHubSeeThroughLocal", next);
} catch (e) {
}
refreshAll();
}
const SEE_THROUGH_CSS = `
:host([fh-see-through]:not([fh-own-bg])) ha-card { background-color: transparent !important; background-image: none !important; box-shadow: none !important; }
:host([fh-see-through]:not([fh-own-bg])) ha-card::before { display: none !important; }
`;
function applySeeThrough(host) {
const on = seeThrough() && mode() === "off";
if (on) host.setAttribute("fh-see-through", "");
else host.removeAttribute("fh-see-through");
const root = host.shadowRoot;
if (on && root && !root.querySelector("style[data-fh-see-through]")) {
const s = document.createElement("style");
s.setAttribute("data-fh-see-through", "");
s.textContent = SEE_THROUGH_CSS;
root.appendChild(s);
}
}
// every card loads the household settings itself; this reads the Accessibility part of them, at most every 5 minutes
let householdFetch = null, householdAt = 0;
function loadHousehold(hass) {
if (!hass || !hass.connection || householdFetch || Date.now() - householdAt < 5 * 60 * 1000) return;
householdFetch = hass.connection.sendMessagePromise({ type: "family_hub/get_settings" })
.then((r) => {
const s = r && r.settings;
if (s && typeof s === "object") {
setHousehold(s.accessibility || {});
setSeeThrough(s.seeThroughBackground === true);
}
})
.catch(() => {})
.then(() => {
householdFetch = null;
householdAt = Date.now();
});
}
let fontsAdded = false;
function ensureFonts() {
if (fontsAdded || !document.head) return;
fontsAdded = true;
const face = (family, file, weight, range) => `@font-face { font-family: "${family}"; font-style: normal; font-display: swap; font-weight: ${weight}; src: url("/family_hub_fonts/${file}.woff2") format("woff2"); unicode-range: ${range}; }`;
const LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const EXT = "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";
const css = [];
[["FH Atkinson Hyperlegible", "atkinson-hyperlegible"], ["FH Lexend", "lexend"]].forEach(([family, file]) => {
[400, 700].forEach((w) => {
css.push(face(family, `${file}-latin-${w}-normal`, w, LATIN));
css.push(face(family, `${file}-latin-ext-${w}-normal`, w, EXT));
});
});
const st = document.createElement("style");
st.id = "family-hub-a11y-fonts";
st.textContent = css.join("\n");
document.head.appendChild(st);
}
// ---- E-ink ----
// the real E-ink screen setting of this device
function deviceMode() {
try {
const v = localStorage.getItem("familyHubEinkModeLocal");
return MODES.includes(v) ? v : "off";
} catch (e) {
return "off";
}
}
// the look: the device's E-ink screen, or High contrast (the black & white e-ink look on a normal screen)
function mode() {
const m = deviceMode();
if (m !== "off") return m;
return a11y().highContrast === "on" ? "bw" : "off";
}
function tappable() {
try {
return localStorage.getItem("familyHubEinkTappableLocal") !== "off";
} catch (e) {
return true;
}
}
function toHex(color) {
const c = String(color || "").trim().toLowerCase();
let m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
if (m) return m[1].length === 3 ? "#" + m[1].split("").map((x) => x + x).join("") : c;
m = c.match(/^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+))?/);
if (!m) return null;
if (m[4] !== undefined && parseFloat(m[4]) < 0.5) return null;
return "#" + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, "0")).join("");
}
function hsl(hex) {
const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
let h = 0, s = 0;
if (max !== min) {
const d = max - min;
s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
h *= 60;
}
return { h, s, l };
}
// the household's people colours in order, as the calendar last worked them out on this device
function household() {
try {
const v = JSON.parse(localStorage.getItem("familyHubEinkPeopleLocal") || "[]");
return Array.isArray(v) ? v.map((x) => toHex(x)).filter(Boolean) : [];
} catch (e) {
return [];
}
}
const seen = [];
let cache = { sig: "", map: {} };
function order() {
const list = household();
seen.forEach((c) => { if (!list.includes(c)) list.push(c); });
return list;
}
// where a colour sits in the household's order (new colours join the end, in the order they're seen)
function personIndex(hex) {
let list = order();
if (!list.includes(hex)) {
seen.push(hex);
list = order();
}
return list.indexOf(hex);
}
function mapFor(m) {
const list = order();
const sig = m + "|" + list.join(",");
if (cache.sig === sig) return cache.map;
const map = {};
const used = new Set();
list.forEach((c, i) => {
if (m === "bw") {
map[c] = PATTERNS[i % PATTERNS.length];
return;
}
const x = hsl(c);
const ranked = x.s < 0.12 ? [["black", "#000", 0]] : INKS.slice().sort((a, b) => {
const d = (k) => Math.min(Math.abs(x.h - k[2]), 360 - Math.abs(x.h - k[2]));
return d(a) - d(b);
}).concat([["black", "#000", 0]]);
const free = ranked.find((ink) => !used.has(ink[0]));
if (free) {
used.add(free[0]);
map[c] = `linear-gradient(${free[1]},${free[1]})`;
} else {
map[c] = `repeating-linear-gradient(45deg,${ranked[0][1]} 0 3px,#fff 3px 6px)`;
}
});
cache = { sig, map };
return map;
}
// the background a person's colour gets on this e-ink screen; null to leave it as it is
function background(color, m) {
m = m || mode();
if (m === "off") return null;
const hex = toHex(color);
if (!hex) return null;
const x = hsl(hex);
if (x.l > 0.94) return null; // white-ish: already fine
if (m === "kaleido") return `hsl(${Math.round(x.h)} ${Math.round(Math.min(1, Math.max(0.6, x.s * 1.6 + 0.15)) * 100)}% 58%)`;
if (!household().includes(hex) && !seen.includes(hex)) seen.push(hex);
return mapFor(m)[hex];
}
// Color vision: a person's shape, a darker shade of their colour (for the shape and the pattern) and their pattern in it
function darker(hex) {
const n = (i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.42);
return `rgb(${n(1)}, ${n(3)}, ${n(5)})`;
}
function cvFor(color) {
const hex = toHex(color);
if (!hex || hsl(hex).l > 0.94) return null;
const i = personIndex(hex);
const dark = darker(hex);
const pattern = PATTERNS[i % PATTERNS.length].replace(/#000/g, dark).replace(/#fff/g, "transparent");
return { shape: SHAPES[i % SHAPES.length], shapeName: SHAPE_NAMES[i % SHAPE_NAMES.length], dark, pattern, index: i };
}
const BASE_CSS = `
:host([eink]) > * { --fc-bg: #fff; --fc-card: #fff; --fc-card-opaque: #fff; --fc-card-menu: #fff; --fc-surface-alt: #fff; --fc-surface2: #fff; --fc-text: #000; --fc-text-secondary: #222; --fc-text-muted: #333; --fc-border: #000; --fc-accent: #000; --fc-accent-text: #fff; --fc-accent2: #000; --fc-accent3: #000; --fc-accent-soft: #fff; --fc-shadow: none; --fc-now: #000; --fc-now-text: #fff; --fc-glass-blur: 0px; --fc-bg-blur: 0px; --fc-bg-image: none; --fc-bg-overlay-image: none; --fc-danger: #000; }
:host([eink]) *, :host([eink]) *::before, :host([eink]) *::after { transition: none !important; animation: none !important; box-shadow: none !important; text-shadow: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
:host([eink]) ha-card { background: #fff !important; color: #000 !important; border: 2px solid #000 !important; border-radius: 8px !important; }
:host([eink]) button:not([data-fh-eink-dot]), :host([eink]) select, :host([eink]) input { border-color: #000 !important; }
:host([eink]) [data-fh-eink-dot] { outline: 1.5px solid #000; outline-offset: -1.5px; }
:host([eink="kaleido"]) [data-fh-eink-dot] { outline: none; }
:host([eink]) .confetti, :host([eink]) .confetti-piece, :host([eink]) .fh-confetti, :host([eink]) [class*="confetti"] { display: none !important; }
:host([eink]) .person-pill, :host([eink]) .pill { color: #000 !important; border: 2px solid #000 !important; }
:host([eink]) .person-pill *, :host([eink]) .pill * { color: #000 !important; }
:host([eink="bw"]) [data-fh-eink-strip], :host([eink="color6"]) [data-fh-eink-strip] { background: linear-gradient(90deg, transparent 0 10px, #fff 10px), var(--fh-eink-strip) !important; padding-left: 15px !important; color: #000 !important; border: 2px solid #000 !important; }
:host([eink="kaleido"]) [data-fh-eink-strip] { color: #000 !important; }
:host([eink]) button:disabled, :host([eink]) button[disabled] { background: #fff !important; color: #444 !important; border: 2px dashed #000 !important; opacity: 1 !important; }
:host([eink]) .person-pill.active-filter, :host([eink]) .pill.active { outline: 3px solid #000; outline-offset: 1px; }
:host([eink]) .person-pill.dimmed { opacity: 1 !important; border-style: dashed !important; }
:host([eink="bw"]) img, :host([eink="bw"]) .has-pic { filter: grayscale(1) contrast(1.3); }
:host([eink-static]) [class$="-fab"], :host([eink-static]) [class*="-fab "], :host([eink-static]) .fab { display: none !important; }
`;
// Accessibility styling every card shares (the calendar has the same rules for its own parts)
const A11Y_CSS = `
:host([a11y-cv]) [data-fh-cv-fill] { clip-path: var(--fh-cv-shape); border-radius: 0 !important; outline: none !important; min-width: 14px; min-height: 14px; }
:host([a11y-cv]) [data-fh-cv-strip] { background: linear-gradient(90deg, transparent 0 10px, var(--fh-cv-base) 10px), var(--fh-cv-pattern), var(--fh-cv-base) !important; padding-left: 15px !important; }
:host([a11y-cv]) [data-fh-cv-strip-avatar] .avatar:not(.has-pic), :host([a11y-cv]) [data-fh-cv-strip-avatar] .person-pill-avatar:not(.has-pic) { clip-path: var(--fh-cv-shape); border-radius: 0 !important; background: var(--fh-cv-dark) !important; color: #fff !important; }
:host([a11y-cv][eink]) [data-fh-cv-strip-avatar] .avatar:not(.has-pic), :host([a11y-cv][eink]) [data-fh-cv-strip-avatar] .person-pill-avatar:not(.has-pic) { background: #000 !important; border: none !important; }
:host([a11y-motion]) *, :host([a11y-motion]) *::before, :host([a11y-motion]) *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
:host([a11y-motion]) .confetti, :host([a11y-motion]) .confetti-piece, :host([a11y-motion]) [class*="confetti"] { display: none !important; }
:host([a11y-font="legible"]) > * { --fc-font-family: "FH Atkinson Hyperlegible", Verdana, sans-serif; font-family: "FH Atkinson Hyperlegible", Verdana, sans-serif !important; }
:host([a11y-font="dyslexia"]) > * { --fc-font-family: "FH Lexend", Verdana, sans-serif; font-family: "FH Lexend", Verdana, sans-serif !important; letter-spacing: 0.02em; word-spacing: 0.08em; }
:host([a11y-font]) button, :host([a11y-font]) input, :host([a11y-font]) select, :host([a11y-font]) textarea { font-family: inherit !important; letter-spacing: inherit; }
:host([a11y-scale]) > :not(style) { zoom: var(--fh-text-scale, 1); }
:host([a11y-scale]) * { -webkit-hyphens: auto; hyphens: auto; word-break: normal !important; overflow-wrap: break-word; }
:host([a11y-big]) button, :host([a11y-big]) select, :host([a11y-big]) [role="button"] { min-height: 46px; min-width: 46px; }
:host([a11y-big]) input[type="checkbox"], :host([a11y-big]) input[type="radio"] { width: 24px !important; height: 24px !important; }
:host([a11y-big]) [class$="-fab"], :host([a11y-big]) .fab { width: 72px !important; height: 72px !important; font-size: 34px !important; }
`;
const attached = new Map();
// what the kit changed on an element, so it can put it back when it's turned off
function restore(el) {
if (el.dataset.fhEinkSet === undefined) return;
el.dataset.fhEinkSet.split(",").filter(Boolean).forEach((prop) => el.style.removeProperty(prop));
if (el.dataset.fhEinkOrigBg) el.style.backgroundColor = el.dataset.fhEinkOrigBg;
const from = el.dataset.fhEinkFrom;
if (from && el.dataset.fhEinkOrig) {
if (from === "border") el.style.borderColor = el.dataset.fhEinkOrig;
else if (from.startsWith("--")) el.style.setProperty(from, el.dataset.fhEinkOrig);
}
["fhEinkFrom", "fhEinkMode", "fhEinkSet", "fhEinkOrig", "fhEinkOrigBg", "fhEinkStrip", "fhEinkDot", "fhCvFill", "fhCvStrip", "fhCvStripAvatar"].forEach((k) => delete el.dataset[k]);
}
function setProps(el, props) {
const names = [];
Object.keys(props).forEach((prop) => {
el.style.setProperty(prop, props[prop], prop.startsWith("--") ? "" : "important");
names.push(prop);
});
el.dataset.fhEinkSet = names.join(",");
}
// where a person's colour sits on an element: its background, its border, or a CSS variable (--person-color)
function colorOf(el, from) {
if (!from || from === "background") return el.style.backgroundColor;
if (from === "border") return el.style.borderTopColor || el.style.borderColor;
return el.style.getPropertyValue(from);
}
function recolor(host, st) {
const root = host.shadowRoot;
if (!root) return;
const m = mode();
const cv = a11y().colorVision === "shapes";
const key = m + (cv ? "+cv" : "");
const groups = [];
(st.opts.strip || []).forEach((sel) => groups.push([sel, "background", "strip"]));
(st.opts.stripFrom || []).forEach(([sel, from]) => groups.push([sel, from, "strip"]));
(st.opts.recolor || []).forEach((sel) => groups.push([sel, "background", "fill"]));
(st.opts.shapes || []).forEach((sel) => groups.push([sel, "background", "shape"]));
groups.forEach(([sel, from, kind]) => root.querySelectorAll(sel).forEach((el) => {
if (m === "off" && !cv) return restore(el);
if (kind !== "strip" && (el.classList.contains("has-pic") || /url\(/.test(el.style.backgroundImage || ""))) return;
const orig = el.dataset.fhEinkOrig !== undefined ? el.dataset.fhEinkOrig : colorOf(el, from);
if (!orig) return;
if (el.dataset.fhEinkOrig === orig && el.dataset.fhEinkMode === key) return;
const bg = m !== "off" && kind !== "shape" ? background(orig, m) : null;
const c = cv ? cvFor(orig) : null;
if (!bg && !c) {
if (el.dataset.fhEinkSet !== undefined) restore(el);
return;
}
if (el.dataset.fhEinkSet !== undefined) restore(el);
el.dataset.fhEinkOrig = orig;
el.dataset.fhEinkMode = key;
el.dataset.fhEinkFrom = from;
if (from === "background") el.dataset.fhEinkOrigBg = orig;
const props = {};
if (c) {
props["--fh-cv-shape"] = c.shape;
props["--fh-cv-dark"] = c.dark;
}
if (bg) {
if (kind === "fill") {
el.dataset.fhEinkDot = "1";
props.background = bg;
} else if (m === "kaleido") {
// a colour tablet keeps the person's colour, stronger: as the fill it was, or as the border/variable it came from
el.dataset.fhEinkStrip = "1";
if (from === "background") props.background = bg;
else if (from === "border") props["border-color"] = bg;
else props[from] = bg;
} else {
el.dataset.fhEinkStrip = "1";
props["--fh-eink-strip"] = bg;
}
}
if (c && (kind === "fill" || kind === "shape")) el.dataset.fhCvFill = "1";
if (c && kind === "strip" && !bg) {
// a strip down the left in the person's own pattern, over the colour the element already had
el.dataset.fhCvStrip = "1";
props["--fh-cv-pattern"] = c.pattern;
props["--fh-cv-base"] = from === "background" ? orig : `color-mix(in srgb, ${orig} 16%, white)`;
}
if (c && kind === "strip") el.dataset.fhCvStripAvatar = "1";
setProps(el, props);
}));
}
function applyA11y(host) {
const v = a11y();
const set = (name, on, value) => (on ? host.setAttribute(name, value === undefined ? "" : value) : host.removeAttribute(name));
set("a11y-cv", v.colorVision === "shapes");
set("a11y-motion", v.reduceMotion || deviceMode() !== "off");
set("a11y-big", v.bigButtons === "on");
set("a11y-font", v.font !== "theme", v.font);
set("a11y-scale", v.textScale !== "100");
if (v.textScale !== "100") host.style.setProperty("--fh-text-scale", String(parseInt(v.textScale, 10) / 100));
else host.style.removeProperty("--fh-text-scale");
if (v.font !== "theme") ensureFonts();
return v;
}
function anyA11y(v) {
return v.colorVision !== "off" || v.reduceMotion || v.bigButtons !== "off" || v.font !== "theme" || v.textScale !== "100";
}
function apply(host) {
const st = attached.get(host);
if (!st) return;
// the calendar loads the household settings itself (and hands the Accessibility part over with setHousehold)
if (!st.opts.a11yOnly) loadHousehold(host._hass || host.hass);
const v = applyA11y(host);
applySeeThrough(host);
const root = host.shadowRoot;
if (st.opts.a11yOnly) {
// the calendar draws its own e-ink and colour vision; this just gives it the shared accessibility attributes
if (root && !root.querySelector("style[data-fh-a11y]")) {
const s = document.createElement("style");
s.setAttribute("data-fh-a11y", "");
s.textContent = A11Y_CSS;
root.appendChild(s);
}
return;
}
const m = mode();
if (m !== "off") host.setAttribute("eink", m);
else host.removeAttribute("eink");
if (deviceMode() !== "off" && !tappable()) host.setAttribute("eink-static", "");
else host.removeAttribute("eink-static");
if (!root) return;
const on = m !== "off" || anyA11y(v);
let styleEl = root.querySelector("style[data-fh-eink]");
if (on && !styleEl) {
styleEl = document.createElement("style");
styleEl.setAttribute("data-fh-eink", "");
styleEl.textContent = BASE_CSS + A11Y_CSS + (st.opts.css || "");
root.appendChild(styleEl);
} else if (!on && styleEl) {
styleEl.remove();
}
recolor(host, st);
}
function attach(host, opts, tries) {
let st = attached.get(host);
if (!st) {
st = { opts: opts || {}, obs: null, timer: null, queued: false };
attached.set(host, st);
}
if (st.obs) return;
if (!host.shadowRoot) {
if ((tries || 0) < 120) st.timer = setTimeout(() => attach(host, opts, (tries || 0) + 1), 250);
apply(host);
return;
}
st.obs = new MutationObserver(() => {
if (st.queued) return;
st.queued = true;
Promise.resolve().then(() => {
st.queued = false;
if (mode() !== "off" || anyA11y(a11y()) || host.shadowRoot.querySelector("[data-fh-eink-orig],style[data-fh-eink],style[data-fh-a11y]")) apply(host);
else if (!st.opts.a11yOnly) loadHousehold(host._hass || host.hass);
});
});
st.obs.observe(host.shadowRoot, { childList: true, subtree: true });
apply(host);
}
function detach(host) {
const st = attached.get(host);
if (!st) return;
if (st.obs) st.obs.disconnect();
clearTimeout(st.timer);
attached.delete(host);
}
const refreshAll = () => attached.forEach((st, host) => apply(host));
window.addEventListener("family-hub-eink-changed", refreshAll);
window.addEventListener("storage", (e) => { if (!e.key || /^familyHub(Eink|A11y|SeeThrough)/.test(e.key)) refreshAll(); });
try {
if (window.matchMedia) {
const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
if (mq && mq.addEventListener) mq.addEventListener("change", refreshAll);
}
} catch (e) {
}
window.__familyHubEink = {
mode, deviceMode, tappable, background, cvFor, a11y, a11yClean, setHousehold, seeThrough, setSeeThrough, ensureFonts, A11Y_KEYS: A11Y, SHAPES, SHAPE_NAMES,
attach: (host, opts) => {
if (window.__familyHubKeepAlive) window.__familyHubKeepAlive.connected(host);
attach(host, opts, 0);
},
detach: (host) => {
detach(host);
if (window.__familyHubKeepAlive) window.__familyHubKeepAlive.disconnected(host);
},
refreshAll, BASE_CSS, A11Y_CSS,
};
})();
// 2026.11.2: keep an open pop-up open when you switch away from Home Assistant and come back. When the app comes back
// and reconnects, Home Assistant reloads the dashboard and builds every card again, so a card that had a pop-up open
// lost it. Now: when the page is hidden, each card notes whether it has a pop-up open; if Home Assistant then replaces
// that card (within a minute of coming back), the new copy steps aside for the old one, pop-up and all, and passes
// Home Assistant's updates on to it.
(function () {
if (window.__familyHubKeepAlive) return;
const live = new Set();
const parked = [];
let visibleAt = 0;
const WINDOW_MS = 60000;
const ADOPT_MS = 20000;
const keyOf = (host) => {
if (host.__fhKeepKey === undefined) {
let cfg = "";
try { cfg = JSON.stringify(host._config || null); } catch (e) { cfg = ""; }
host.__fhKeepKey = host.tagName + "|" + cfg;
}
return host.__fhKeepKey;
};
// a pop-up: something fixed on screen, showing, and covering a good part of it
function modalOpen(host) {
const root = host.shadowRoot;
if (!root) return false;
const min = (window.innerWidth || 0) * (window.innerHeight || 0) * 0.2;
const els = root.querySelectorAll('[class*="modal"],[class*="overlay"],[class*="dialog"],[class*="sheet"],[class*="popup"],[class*="picker"],[class*="viewer"]');
for (let i = 0; i < els.length; i++) {
const cs = getComputedStyle(els[i]);
if (cs.position !== "fixed" || cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) continue;
const r = els[i].getBoundingClientRect();
if (r.width * r.height >= min && min > 0) return true;
}
return false;
}
document.addEventListener("visibilitychange", () => {
if (document.visibilityState === "hidden") {
live.forEach((host) => {
try { host.__fhKeepModal = modalOpen(host); } catch (e) { host.__fhKeepModal = false; }
});
} else {
visibleAt = Date.now();
}
});
const recent = () => document.visibilityState === "hidden" || Date.now() - visibleAt < WINDOW_MS;
function disconnected(host) {
live.delete(host);
if (host.__fhKeepModal && recent()) parked.push({ host, key: keyOf(host), at: Date.now() });
}
let connected = function (host) {
live.add(host);
keyOf(host);
// after this card's own connectedCallback has run
setTimeout(() => {
const now = Date.now();
for (let i = parked.length - 1; i >= 0; i--) {
if (now - parked[i].at > ADOPT_MS || parked[i].host.isConnected) parked.splice(i, 1);
}
if (!host.isConnected || host.__fhAdopted) return;
const idx = parked.findIndex((p) => p.key === keyOf(host) && p.host !== host);
if (idx < 0) return;
const old = parked.splice(idx, 1)[0].host;
old.__fhKeepModal = false;
const latest = host._hass || host.hass;
try { host.replaceWith(old); } catch (e) { return; }
host.__fhAdopted = old;
// the card is back as it was, so nothing needs putting back from what was saved
try { localStorage.removeItem("familyHubResume:" + keyOf(old)); } catch (e) {}
// Home Assistant keeps talking to the card it made; pass it all on
Object.defineProperty(host, "hass", { configurable: true, get() { return old.hass; }, set(v) { old.hass = v; } });
host.setConfig = (c) => old.setConfig(c);
if (latest) old.hass = latest;
}, 0);
}
// --- after a full page reload (the iPhone app reloads the whole page after a while away) -------------------------
// Each card's pop-up openers are watched: what was opened, with what. When the page is hidden with a pop-up open, that
// list and what's typed in each open pop-up are saved on this device; when the same card loads again within 15
// minutes, the pop-ups are opened again, in order, and the typing put back.
const RESUME_MS = 15 * 60000;
const ready = {
calendar: (c) => !!c._settingsCache,
users: (c) => Array.isArray(c._notifyProfileUsersCache),
};
// per card: the pop-up openers to watch, what each needs before it can open again, and how to save/find its argument
const OPENERS = {
"FAMILY-WEEK-CALENDAR-CARD": {
__view: { ready: (c) => !!(c._settingsCache && c._viewMode) },
_openSettings: { ready: ready.calendar },
_setSettingsTab: { ready: ready.calendar, follows: true },
_openNotifyProfileModal: { ready: ready.users },
_openAddEvent: { ready: ready.calendar },
_openQuickAdd: { ready: ready.calendar },
_openEventInfo: {
save: (c, id) => { const d = (c._eventDetails || {})[id]; return d ? { uid: d.uid || "", start: d.start ? new Date(d.start).getTime() : 0, cal: d.calendarEntity || "", title: d.summary || "" } : null; },
find: (c, w) => {
const all = c._eventDetails || {};
return Object.keys(all).find((id) => { const d = all[id]; return d && (d.calendarEntity || "") === w.cal && (d.start ? new Date(d.start).getTime() : 0) === w.start && ((w.uid && d.uid === w.uid) || (!w.uid && d.summary === w.title)); });
},
},
_openEventInfoForEdit: { alias: "_openEventInfo" },
},
"FAMILY-HUB-CHORES-CARD": { _openCreateModal: {}, _openEditModal: {}, _openChoreDetailModal: {}, _openRoutineManageModal: {} },
"FAMILY-HUB-REWARDS-CARD": {
_openCreateRewardModal: {
save: (c, item) => (item && item.id ? { id: item.id } : null),
find: (c, w) => (c._catalog || []).find((it) => it.id === w.id),
optional: true,
},
_openGiftStarsModal: {}, _openManageStarsModal: {}, _openStarHistoryModal: {},
},
"FAMILY-HUB-TODO-CARD": { _openCreateModal: {}, _openItemDetailModal: {} },
};
const openOverlays = (host) => {
const root = host.shadowRoot;
if (!root) return [];
const out = [];
const min = (window.innerWidth || 0) * (window.innerHeight || 0) * 0.2;
root.querySelectorAll('[class*="modal"],[class*="overlay"],[class*="dialog"],[class*="sheet"],[class*="popup"],[class*="picker"],[class*="viewer"]').forEach((el) => {
const cs = getComputedStyle(el);
if (cs.position !== "fixed" || cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) return;
const r = el.getBoundingClientRect();
if (min > 0 && r.width * r.height >= min) out.push(el);
});
return out;
};
const FIELD = "input:not([type=file]):not([type=password]):not([type=hidden]):not([type=button]):not([type=submit]),textarea,select";
const sig = (el) => el.tagName + ":" + (el.type || "") + ":" + (el.className || "");
const readFields = (ov) => Array.prototype.map.call(ov.querySelectorAll(FIELD), (el) => [sig(el), el.type === "checkbox" || el.type === "radio" ? !!el.checked : el.value]);
function writeFields(ov, saved) {
if (!ov || !Array.isArray(saved)) return;
const els = ov.querySelectorAll(FIELD);
const touched = [];
saved.forEach((f, i) => {
const el = els[i];
if (!el || sig(el) !== f[0]) return;
if (el.type === "checkbox" || el.type === "radio") { if (el.checked !== !!f[1]) { el.checked = !!f[1]; touched.push([el, "change"]); } }
else if (el.value !== f[1]) { el.value = f[1]; touched.push([el, el.tagName === "SELECT" ? "change" : "input"]); }
});
touched.forEach((t) => { try { t[0].dispatchEvent(new Event(t[1], { bubbles: true })); } catch (e) {} });
}
const resumeKey = (host) => "familyHubResume:" + keyOf(host);
function track(host) {
const table = OPENERS[host.tagName];
if (!table || host.__fhTracked) return;
host.__fhTracked = true;
host.__fhCalls = [];
Object.keys(table).forEach((name) => {
if (name === "__view") return;
const orig = host[name];
if (typeof orig !== "function") return;
const spec = table[name];
const fn = spec.alias || name;
const fspec = table[fn] || spec;
host[name] = function () {
const args = Array.prototype.slice.call(arguments);
const outer = !host.__fhInOpener;
// (pop-ups opened again after a reload are watched too, so leaving again keeps them)
if (outer) {
const before = openOverlays(host);
if (!before.length && !fspec.follows) host.__fhCalls = [];
let saved = args;
if (fspec.save) { const w = fspec.save(host, args[0]); saved = w ? [{ __w: w }].concat(args.slice(1)) : (fspec.optional ? [] : null); }
if (saved) {
const call = { fn, args: saved, ov: null, edit: name === "_openEventInfoForEdit" };
host.__fhCalls.push(call);
// some open after loading something, so look a few times
[0, 300, 1200].forEach((ms) => setTimeout(() => { if (!call.ov) call.ov = openOverlays(host).find((o) => before.indexOf(o) < 0) || null; }, ms));
}
}
host.__fhInOpener = true;
try { return orig.apply(this, arguments); } finally { if (outer) host.__fhInOpener = false; }
};
});
}
function snapshot(host) {
const calls = host.__fhCalls || [];
const open = openOverlays(host);
// where the card was (the calendar's week, say), pop-up or not
let view = null;
try { view = typeof host._fhViewState === "function" ? host._fhViewState() : null; } catch (e) { view = null; }
if ((!open.length || !calls.length) && !view) { try { localStorage.removeItem(resumeKey(host)); } catch (e) {} return; }
let parentOpen = false;
const keep = [];
(open.length ? calls : []).forEach((c) => {
const isOpen = c.ov ? open.indexOf(c.ov) >= 0 : parentOpen;
if (c.ov) parentOpen = isOpen;
if (isOpen) keep.push({ fn: c.fn, args: c.args, edit: c.edit, fields: c.ov ? readFields(c.ov) : null });
});
try {
if (keep.length || view) localStorage.setItem(resumeKey(host), JSON.stringify({ at: Date.now(), calls: keep, view }));
else localStorage.removeItem(resumeKey(host));
} catch (e) {}
}
const waitFor = (test, ms) => new Promise((resolve) => {
const end = Date.now() + ms;
const tick = () => { let v = null; try { v = test(); } catch (e) { v = null; } if (v) resolve(v); else if (Date.now() > end) resolve(null); else setTimeout(tick, 200); };
tick();
});
async function resume(host) {
let saved = null;
try { saved = JSON.parse(localStorage.getItem(resumeKey(host)) || "null"); localStorage.removeItem(resumeKey(host)); } catch (e) { saved = null; }
if (!saved || !Array.isArray(saved.calls) || Date.now() - (saved.at || 0) > RESUME_MS) return;
const table = OPENERS[host.tagName] || {};
host.__fhReplaying = true;
try {
if (saved.view && typeof host._fhRestoreViewState === "function") {
const vready = (table.__view || {}).ready;
if (await waitFor(() => host._hass && (!vready || vready(host)), 10000)) {
try { host._fhRestoreViewState(saved.view); } catch (e) {}
}
}
for (const c of saved.calls) {
const spec = table[c.fn] || {};
if (!host.isConnected) return;
if (!(await waitFor(() => host._hass && (!spec.ready || spec.ready(host)), 10000))) return;
let args = c.args || [];
if (args[0] && args[0].__w && spec.find) {
const found = await waitFor(() => spec.find(host, args[0].__w), 10000);
if (!found) return;
args = [found].concat(args.slice(1));
}
const before = openOverlays(host);
const name = c.edit && typeof host._openEventInfoForEdit === "function" ? "_openEventInfoForEdit" : c.fn;
try { await host[name].apply(host, args); } catch (e) { return; }
if (c.fields) {
const ov = await waitFor(() => openOverlays(host).find((o) => before.indexOf(o) < 0), 3000);
await new Promise((r) => setTimeout(r, 150));
writeFields(ov, c.fields);
}
}
} finally {
host.__fhReplaying = false;
}
}
const snapAll = () => live.forEach((host) => { try { snapshot(host); } catch (e) {} });
document.addEventListener("visibilitychange", () => {
if (document.visibilityState === "hidden") { snapAll(); return; }
// back without a reload or a rebuild: what was saved isn't needed (a card loading later shouldn't jump back to it)
setTimeout(() => {
if (document.visibilityState !== "visible") return;
live.forEach((host) => { try { localStorage.removeItem(resumeKey(host)); } catch (e) {} });
}, WINDOW_MS);
});
window.addEventListener("pagehide", snapAll);
const _connected = connected;
connected = function (host) {
_connected(host);
track(host);
if (!host.__fhResumeChecked) {
host.__fhResumeChecked = true;
setTimeout(() => { if (host.isConnected && !host.__fhAdopted) resume(host); }, 300);
}
};
window.__familyHubKeepAlive = { connected: (h) => connected(h), disconnected, modalOpen, parked, snapshot, resume, track };
})();
// FH-EINK END
/* Family Hub Companion (2026.11.1) - a child's own bedside screen.
 *
 * One card for one child, made for small screens: a hacked smart clock (800x480), an 8" tablet on a stand, or a
 * cast display. Through the day it shows:
 *   sleep      a dim clock (or nothing), amber "stay in bed", sleep sounds, and a comfort button
 *   wake       "Good morning!", the weather and what to wear, and an alarm
 *   morning / afternoon / bedtime
 *              their Family Hub routine one big step at a time, First -> Then, a big Done button and stars
 *   day        a big clock, what's next on their calendar, their jobs, timers (as a shrinking circle) and stars
 *              (or the Family Hub screensaver - its video or live camera - when nobody has touched it for a while)
 * A bar along the bottom opens the screens their grown-ups chose for them (Settings > Users > Companion):
 *   My day, Jobs, Rewards, Wish list, Timers they can start, and Room buttons for their own lights.
 * Messages from grown-ups take over the screen, are read out loud, and stay until "Got it".
 * The part of the day, the room light and the messages come from companion.py; the settings are on the child's
 * profile (Settings > Users > Companion). A physical button (any Home Assistant event/button/binary sensor) does
 * whatever the big button on screen would.
 *
 * Colours follow the household's Family Hub theme (or this device's, or the card's own Theme option) on the day
 * screens; night, wake-up and routines keep their own colours because the colour is the message. E-ink screens and
 * Accessibility (text size, fonts, high contrast, reduce motion, bigger buttons) come from the shared kit (FH-EINK).
 *
 * Old Android browsers run this (smart clocks), so: no optional chaining, no ??, no flex gap, no color-mix,
 * no aspect-ratio, no :has - plain ES2017 and CSS that Chrome 61 understands.
 */
// Holiday themes, shared by every Family Hub card: a holiday background can switch the theme
// while it's showing. The backend works out the dates (family_hub/holiday_themes/get); this
// checks today against them, refreshes every 30 minutes, and tells cards to re-theme when the
// answer changes (including at midnight).
if (!window.__fhHolidayTheme) {
  window.__fhHolidayTheme = (function () {
    let schedule = null;
    let fetchedAt = 0;
    let loading = null;
    let midnightTimer = null;
    let lastId = null;
    const listeners = new Set();
    const todayKey = () => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const span = (s) => (Date.parse(s.end) - Date.parse(s.start)) || 0;
    function current() {
      if (!Array.isArray(schedule)) return "";
      const k = todayKey();
      // the most specific wins: a day beats a week, a week beats a month (same rule as the backgrounds)
      const hits = schedule.filter((s) => s && s.theme_id && s.start <= k && k <= s.end).sort((a, b) => span(a) - span(b));
      return hits.length ? hits[0].theme_id : "";
    }
    function notify() {
      const id = current();
      if (id === lastId) return;
      lastId = id;
      listeners.forEach((cb) => {
        try {
          cb();
        } catch (e) {
          // one card's error never stops the others
        }
      });
    }
    function armMidnight() {
      clearTimeout(midnightTimer);
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
      midnightTimer = setTimeout(() => {
        notify();
        armMidnight();
      }, next.getTime() - now.getTime());
    }
    function refresh(hass) {
      if (!hass || !hass.connection) return Promise.resolve();
      if (loading) return loading;
      loading = hass.connection
        .sendMessagePromise({ type: "family_hub/holiday_themes/get" })
        .then((r) => {
          schedule = (r && Array.isArray(r.schedule) && r.schedule) || [];
        })
        .catch(() => {
          schedule = schedule || [];
        })
        .then(() => {
          fetchedAt = Date.now();
          loading = null;
          armMidnight();
          notify();
        });
      return loading;
    }
    return {
      themeId(hass) {
        if (hass && !loading && Date.now() - fetchedAt > 30 * 60 * 1000) refresh(hass);
        return current();
      },
      subscribe(cb) {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      invalidate(hass) {
        fetchedAt = 0;
        return refresh(hass);
      },
    };
  })();
}
(function () {
  if (customElements.get("family-hub-companion-card")) return;

  const MODES = ["sleep", "wake", "morning", "day", "afternoon", "bedtime"];
  const ROUTINE_FOR_MODE = { wake: "morning", morning: "morning", afternoon: "afternoon", bedtime: "night" };
  // an event that starts with an emoji shows it big; built at run time because older browsers can't read this pattern
  let LEAD_EMOJI = null;
  try { LEAD_EMOJI = new RegExp("^\\s*(\\p{Extended_Pictographic}\\uFE0F?)", "u"); } catch (e) { LEAD_EMOJI = null; }
  // a picture for a step from the words in its name (the routine library's own icons come first)
  const EMOJI = [
    [/dish|plate|geschirr|vaisselle|platos|piatti|afwas|naczy|lou[cç]a/, "\u{1F37D}\uFE0F"],
    [/trash|garbage|rubbish|m[uü]ll|poubelle|basura|spazzatura|afval|[sś]mieci|lixo/, "\u{1F5D1}\uFE0F"],
    [/laundry|sock|w[aä]sche|linge|ropa|bucato|pranie|roupa/, "\u{1F9FA}"],
    [/vacuum|sweep|staubsaug|aspir|stofzuig|odkurz/, "\u{1F9F9}"],
    [/teeth|tooth|floss|z[aä]hne|dents|dientes|denti|tanden|z[eę]by|dentes/, "\u{1FAA5}"],
    [/\bbed\b|\bbett|\blit\b|\bcama\b|letto|[lł][oó]żk/, "\u{1F6CF}️"],
    [/pajama|pyjama|schlafanzug|pijama|pigiama|piżam/, "\u{1F6CC}"],
    [/dress|clothes|anzieh|habiller|vestir|aankleden|ubra/, "\u{1F455}"],
    [/breakfast|fr[uü]hst|petit[- ]d[eé]j|desayun|colazione|ontbijt|śniadan|caf[eé] da manh/, "\u{1F373}"],
    [/lunch|dinner|eat|essen|manger|comer|mangiare|eten|jeść/, "\u{1F37D}️"],
    [/shoe|schuh|chaussure|zapato|scarpe|schoen|sapato/, "\u{1F45F}"],
    [/backpack|bag|ranzen|cartable|mochila|zaino|rugzak|plecak/, "\u{1F392}"],
    [/hair|haare|cheveux|pelo|capelli|haar|w[lł]osy|cabelo/, "\u{1FAAE}"],
    [/wash|face|soap|waschen|laver|lavar|lavare|wassen|my[cć]/, "\u{1F9FC}"],
    [/bath|shower|baden|duschen|\bbain\b|douche|ba[nñ]o|ducha|bagno|doccia|k[aą]piel|banho/, "\u{1F6C1}"],
    [/toilet|potty|wc|klo/, "\u{1F6BD}"],
    [/read|book|lesen|lire|leer|leggere|lezen|czyta|ler\b/, "\u{1F4D6}"],
    [/homework|hausaufgab|devoirs|tarea|compiti|huiswerk|lekcj/, "\u{1F4DA}"],
    [/medicine|vitamin|pill|medizin|m[eé]dicament|medicina|medicijn|lek/, "\u{1F48A}"],
    [/pet|dog|cat|fish|hund|katze|chien|chat|perro|gato|cane|gatto|hond|kat|pies|kot/, "\u{1F43E}"],
    [/toy|tidy|clean|room|spielzeug|aufr[aä]um|jouet|ranger|juguete|ordenar|giocattol|riordin|speelgoed|opruim|zabawk|sprz[aą]t|brinquedo|arrumar/, "\u{1F9F8}"],
    [/water|drink|trinken|boire|beber|bere|drinken|pi[cć]/, "\u{1F4A7}"],
    [/music|piano|guitar|violin|practi|[uü]ben/, "\u{1F3B9}"],
    [/outside|play|exercise|draußen|dehors|afuera|fuori|buiten|dwor/, "\u{1F3C3}"],
    [/light|lamp|licht|lumi[eè]re|luz|luce|[sś]wiat/, "\u{1F4A1}"],
    [/hug|kiss|cuddle|kuschel|c[aâ]lin|abrazo|abbraccio|knuffel|przytul/, "\u{1F917}"],
    [/story|geschichte|histoire|cuento|storia|verhaal|bajk/, "\u{1F4D6}"],
    [/sleep|schlafen|dormir|dormire|slapen|spa[cć]/, "\u{1F634}"],
  ];
  // a picture for a calendar event from its words (an event starting with an emoji uses that)
  const EVENT_EMOJI = [
    [/school|schule|\b[eé]cole|escuela|scuola|\bschool|szko[lł]/, "\u{1F3EB}"],
    [/soccer|football|fu[sß]ball|f[uú]tbol|calcio|voetbal|pi[lł]ka/, "\u26BD"],
    [/swim|schwimm|natation|nataci|nuoto|zwem|p[lł]ywa/, "\u{1F3CA}"],
    [/dance|ballet|tanz|danse|baile|danza|dans|taniec/, "\u{1FA70}"],
    [/basketball|baseball|hockey|tennis|gym|sport|practice|training/, "\u{1F3C5}"],
    [/piano|music|guitar|violin|lesson|musik|musique|m[uú]sica|muziek|muzyk/, "\u{1F3B5}"],
    [/doctor|dentist|arzt|m[eé]dico|m[eé]decin|dottore|dokter|lekarz/, "\u{1FA7A}"],
    [/birthday|party|geburtstag|anniversaire|cumplea|compleanno|verjaardag|urodzin|festa/, "\u{1F382}"],
    [/dinner|lunch|breakfast|essen|d[iî]ner|cena|almuerzo|pranzo|eten|obiad/, "\u{1F37D}\uFE0F"],
    [/movie|film|cinema|kino/, "\u{1F3AC}"],
    [/church|kirche|[eé]glise|iglesia|chiesa|kerk|ko[sś]ci/, "\u26EA"],
    [/grandma|grandpa|nana|oma|opa|mamie|papi|abuel|nonn|babci|dziadk/, "\u{1F475}"],
    [/bus|car|drive|pick ?up|drop ?off|abholen/, "\u{1F697}"],
    [/play ?date|friend|freund|ami|amig|vriend|przyjaci/, "\u{1F46B}"],
  ];
  const WISH_MARK = "\n[fh:wishlist-data]\n";
  // the same description format as the To-Do card (_parseWishlistDescription / _buildWishlistDescription)
  const parseWish = (raw) => {
    const text = typeof raw === "string" ? raw : "";
    const i = text.indexOf(WISH_MARK);
    if (i < 0) return { note: text, data: {} };
    let data = {};
    try { data = JSON.parse(text.slice(i + WISH_MARK.length)) || {}; } catch (e) { data = {}; }
    return { note: text.slice(0, i), data: data && typeof data === "object" ? data : {} };
  };
  const buildWish = (note, data) => {
    const clean = {};
    Object.keys(data || {}).forEach((k) => { if (data[k] !== undefined && data[k] !== null && data[k] !== "") clean[k] = data[k]; });
    return Object.keys(clean).length ? (note || "") + WISH_MARK + JSON.stringify(clean) : (note || "");
  };
  // -- Themes: the same picks as every other Family Hub card (card Theme > holiday > this device > household) --------
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const rgba = (hex, a) => {
    const h = HEX.test(hex || "") ? hex.slice(1) : "000000";
    return "rgba(" + parseInt(h.substr(0, 2), 16) + "," + parseInt(h.substr(2, 2), 16) + "," + parseInt(h.substr(4, 2), 16) + "," + Math.max(0, Math.min(1, a)) + ")";
  };
  // a Home Assistant theme's variables in Theme Builder's names
  const haColors = (v) => {
    v = v || {};
    return {
      bg: v["primary-background-color"], card: v["card-background-color"] || v["ha-card-background"], border: v["divider-color"],
      text: v["primary-text-color"], textSecondary: v["secondary-text-color"], accent: v["primary-color"],
      accentText: v["text-primary-color"], surfaceAlt: v["secondary-background-color"],
    };
  };
  // any colour Home Assistant hands over (a name, rgb(), #abc) as #rrggbb
  const toHex = (c) => {
    const s = String(c || "").trim();
    if (HEX.test(s)) return s;
    let m = s.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/);
    if (m) return "#" + m[1] + m[1] + m[2] + m[2] + m[3] + m[3];
    m = s.match(/^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/);
    if (m) return "#" + [m[1], m[2], m[3]].map((n) => pad16(+n)).join("");
    return "";
  };
  const pad16 = (n) => (n < 16 ? "0" : "") + Math.max(0, Math.min(255, n)).toString(16);
  const THEME_KEYS = ["bg", "card", "border", "text", "textSecondary", "accent", "accentText", "surfaceAlt"];
  // a theme as the CSS variables the day screens use; null for the Companion's own warm colours
  const themeVars = (t) => {
    if (!t || !t.colors) return null;
    const c = {};
    THEME_KEYS.forEach((k) => { c[k] = toHex(t.colors[k]); });
    if (!c.bg || !c.text) return null;
    c.card = c.card || c.bg;
    c.border = c.border || c.card;
    c.textSecondary = c.textSecondary || c.text;
    c.accent = c.accent || "#f0a030";
    c.accentText = c.accentText || "#ffffff";
    c.surfaceAlt = c.surfaceAlt || c.card;
    const op = typeof t.cardOpacity === "number" ? Math.max(0, Math.min(100, t.cardOpacity)) / 100 : 1;
    const blur = typeof t.glassBlur === "number" ? Math.max(0, Math.min(40, t.glassBlur)) : 0;
    const vars = {
      "--c-bg": c.bg, "--c-card": rgba(c.card, op), "--c-border": c.border, "--c-text": c.text, "--c-sub": c.textSecondary,
      "--c-accent": c.accent, "--c-accent-text": c.accentText, "--c-soft": rgba(c.surfaceAlt, Math.min(1, op + 0.1)),
      "--c-blur": blur + "px", "--c-img": "none", "--c-img-size": "cover", "--c-img-pos": "center",
    };
    const bg = t.background;
    if (bg && typeof bg.image === "string" && bg.image) {
      const ov = rgba(HEX.test(bg.overlayColor || "") ? bg.overlayColor : "#000000", Number(bg.overlayOpacity) || 0);
      vars["--c-img"] = "linear-gradient(" + ov + "," + ov + "),url(\"" + bg.image.replace(/"/g, "\\\"") + "\")";
      vars["--c-img-size"] = bg.size === "repeat" ? "auto" : (bg.size || "cover");
      vars["--c-img-pos"] = bg.position || "center";
    }
    const font = typeof t.fontFamily === "string" ? t.fontFamily.trim() : "";
    vars["--c-font"] = /^[\w\s,'"\-]{1,200}$/.test(font) ? font : "";
    return vars;
  };
  const SCREEN_DEFAULTS = { myday: true, jobs: true, rewards: true, wishes: true, timers: false, room: false };
  // things already huge that Text size leaves alone (the words around them get bigger)
  const BIG_THINGS = ".inf-ico,.nav-lbl,.clock-time,.clock-ampm,.step-ico,.alldone .party,.vt,.moon,.msg-ico,.sun,.c-ico,.rw-ico,.tm-ico,.rm-ico,.md-ico,.wt-pic,.wt-plus,.nav-ico,.goal-ico,.then-ico,.burst,.breathe";
  // an e-ink screen (or Accessibility > High contrast): black on white, outlines instead of shading, every screen
  const EINK_CSS = [
    ":host([eink]) .wrap,:host([eink]) .m-sleep,:host([eink]) .m-wake,:host([eink]) .m-morning,:host([eink]) .m-afternoon,:host([eink]) .m-bedtime,:host([eink]) .m-day,:host([eink]) .night-off,:host([eink]) .comfort{background:#fff !important;background-image:none !important;color:#000 !important}",
    ":host([eink]) .info,:host([eink]) .inf,:host([eink]) .tm-own,:host([eink]) .tm-q,:host([eink]) .card,:host([eink]) .md-row,:host([eink]) .wt,:host([eink]) .rw,:host([eink]) .tm,:host([eink]) .rm,:host([eink]) .goal,:host([eink]) .wk,:host([eink]) .md-chip,:host([eink]) .trophy,:host([eink]) .wsec-h,:host([eink]) .then,:host([eink]) .tip,:host([eink]) .msg,:host([eink]) .gu,:host([eink]) .ask-n,:host([eink]) .ask-btn,:host([eink]) .nav-btn.on,:host([eink]) .step-stars,:host([eink]) .comfort-btn,:host([eink]) .gu-btn{background:#fff !important;color:#000 !important;border:0.12em solid #000 !important;box-shadow:none !important;opacity:1}",
    ":host([eink]) .tm-q.on,:host([eink]) .big-btn,:host([eink]) .rw-get,:host([eink]) .wk.today,:host([eink]) .nav-badge,:host([eink]) .md-tag,:host([eink]) .rm.on,:host([eink]) .sound-chip{background:#000 !important;color:#fff !important;box-shadow:none !important;border:none !important}",
    ":host([eink]) .bar{background:#fff !important;border:0.1em solid #000}:host([eink]) .bar i{background:#000 !important}",
    ":host([eink]) .dots i{background:#fff !important;border:0.1em solid #000}:host([eink]) .dots i.d,:host([eink]) .dots i.c{background:#000 !important}",
    ":host([eink]) .stay-dot{background:#000 !important}:host([eink]) .breathe{background:#000 !important}",
    ":host([eink]) .vt-bg{fill:#fff !important;stroke:#000 !important}:host([eink]) .vt-arc{fill:#000 !important}",
    ":host([eink]) .ok,:host([eink]) .stay,:host([eink]) .bed-line,:host([eink]) .jb-streak,:host([eink]) .p-msg,:host([eink]) .night .clock-time,:host([eink]) .night .clock-date,:host([eink]) .night .clock-ampm,:host([eink]) .md-tick,:host([eink]) .wt-plus,:host([eink]) .burst,:host([eink]) .gu-err,:host([eink]) .gu-close,:host([eink]) .moon{color:#000 !important;opacity:1 !important;text-shadow:none !important}",
    ":host([eink]) .rw.hearted{outline:0.2em solid #000;outline-offset:0.1em}:host([eink]) .md-row.cur{border-width:0.25em !important}",
    // grey dithers on e-ink: the small words are solid black, and the bar's chosen screen is the one with the outline
    ":host([eink]) .c-txt span,:host([eink]) .clock-date,:host([eink]) .clock-ampm,:host([eink]) .goal-txt span,:host([eink]) .md-time,:host([eink]) .wk-d,:host([eink]) .tm-min,:host([eink]) .rm-st,:host([eink]) .rw-cost,:host([eink]) .wsec-n,:host([eink]) .p-note,:host([eink]) .step-due,:host([eink]) .r-count,:host([eink]) .now-lbl,:host([eink]) .then-lbl,:host([eink]) .msg-from,:host([eink]) .nav-btn,:host([eink]) .w-temp small{color:#000 !important;opacity:1 !important}:host([eink]) .wk.today .wk-d{color:#fff !important}",
    ":host([eink]) .wt.add{border-color:#000 !important}:host([eink]) .wish-input,:host([eink]) .ask-input{background:#fff;color:#000;border-color:#000}",
    ":host([eink]) .overlay.on{background:rgba(255,255,255,0.6)}:host([eink]) .ssl{display:none !important}:host([eink]) .ss-on .screen{visibility:visible}",
  ].join("\n");
  const T = (h, key, fb, vars) => {
    let s = "";
    try { if (h && typeof h.localize === "function") s = h.localize("component.family_hub.fh_ui." + key) || ""; } catch (e) { s = ""; }
    if (!s) s = fb;
    if (vars) Object.keys(vars).forEach((k) => { s = s.split("%" + k + "%").join(String(vars[k])); });
    return s;
  };
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const pad = (n) => (n < 10 ? "0" : "") + n;
  const dayKey = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());

  // -- Sounds: made right here with Web Audio, so nothing to download and nothing to license ------------------------
  class CompanionSound {
    constructor() {
      this.ctx = null;
      this.noise = null;
      this.noiseKind = "";
      this.alarmTimer = null;
    }
    _ctx() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { this.ctx = new AC(); } catch (e) { return null; }
      }
      return this.ctx;
    }
    // browsers only let sound start after a tap; true once it can play
    unlock() {
      const c = this._ctx();
      if (c && c.state === "suspended" && c.resume) c.resume();
      return !!(c && c.state === "running");
    }
    get blocked() {
      const c = this._ctx();
      return !c || c.state !== "running";
    }
    note(freq, at, dur, vol, type) {
      const c = this._ctx();
      if (!c || c.state !== "running") return;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(freq, c.currentTime + at);
      g.gain.setValueAtTime(0.0001, c.currentTime + at);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), c.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + at + dur);
      o.connect(g);
      g.connect(c.destination);
      o.start(c.currentTime + at);
      o.stop(c.currentTime + at + dur + 0.05);
    }
    chirp(at, vol) {
      const c = this._ctx();
      if (!c || c.state !== "running") return;
      const o = c.createOscillator();
      const g = c.createGain();
      const t = c.currentTime + at;
      o.frequency.setValueAtTime(2600, t);
      o.frequency.exponentialRampToValueAtTime(4200, t + 0.08);
      o.frequency.exponentialRampToValueAtTime(2900, t + 0.16);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g);
      g.connect(c.destination);
      o.start(t);
      o.stop(t + 0.2);
    }
    ding() {
      this.note(1318.5, 0, 0.5, 0.25);
      this.note(1760, 0.12, 0.7, 0.2);
    }
    tada() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.note(f, i * 0.11, 0.6, 0.22, "triangle"));
    }
    message() {
      this.note(880, 0, 0.35, 0.2);
      this.note(1174.7, 0.18, 0.5, 0.2);
    }
    alarmOnce(kind) {
      if (kind === "birds") {
        [0, 0.25, 0.45, 1.1, 1.3, 1.55].forEach((t) => this.chirp(t, 0.18));
      } else if (kind === "marimba") {
        [[523.25, 0], [659.25, 0.18], [783.99, 0.36], [659.25, 0.54], [880, 0.9], [783.99, 1.08]].forEach((n) => this.note(n[0], n[1], 0.45, 0.3, "sine"));
      } else {
        [[659.25, 0], [783.99, 0.25], [1046.5, 0.5], [783.99, 0.75]].forEach((n) => this.note(n[0], n[1], 0.7, 0.22, "triangle"));
      }
    }
    startAlarm(kind, onEnd) {
      this.stopAlarm();
      if (!kind || kind === "off") return;
      let n = 0;
      const tick = () => {
        this.alarmOnce(kind);
        n += 1;
        // two minutes, then it gives up on its own
        if (n > 40) {
          this.stopAlarm();
          if (onEnd) onEnd();
        }
      };
      tick();
      this.alarmTimer = setInterval(tick, 3000);
    }
    stopAlarm() {
      if (this.alarmTimer) clearInterval(this.alarmTimer);
      this.alarmTimer = null;
    }
    get alarming() {
      return !!this.alarmTimer;
    }
    _noiseBuffer(kind) {
      const c = this._ctx();
      const len = c.sampleRate * 4;
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === "white") d[i] = w * 0.5;
        else if (kind === "brown" || kind === "waves") {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        } else {
          // pink (Paul Kellet's filter) - also the bed of the rain
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
          b6 = w * 0.115926;
          if (kind === "rain" && Math.random() < 0.0006) d[i] += (Math.random() - 0.5) * 0.6;
        }
      }
      return buf;
    }
    startNoise(kind, volume) {
      if (!kind || kind === "off") return this.stopNoise();
      const c = this._ctx();
      if (!c || c.state !== "running") return;
      if (this.noise && this.noiseKind === kind) {
        this.noise.gain.gain.setTargetAtTime(Math.max(0.0001, volume / 100) * 0.6, c.currentTime, 0.5);
        return;
      }
      this.stopNoise();
      const src = c.createBufferSource();
      src.buffer = this._noiseBuffer(kind);
      src.loop = true;
      const gain = c.createGain();
      gain.gain.value = 0.0001;
      let last = gain;
      if (kind === "rain") {
        const f = c.createBiquadFilter();
        f.type = "highpass";
        f.frequency.value = 400;
        src.connect(f);
        f.connect(gain);
      } else src.connect(gain);
      if (kind === "waves") {
        // a slow swell, like waves coming in
        const lfo = c.createOscillator();
        const depth = c.createGain();
        const swell = c.createGain();
        lfo.frequency.value = 0.09;
        depth.gain.value = 0.45;
        swell.gain.value = 0.55;
        lfo.connect(depth);
        depth.connect(swell.gain);
        gain.connect(swell);
        last = swell;
        lfo.start();
        this._lfo = lfo;
      }
      last.connect(c.destination);
      src.start();
      gain.gain.setTargetAtTime(Math.max(0.0001, volume / 100) * 0.6, c.currentTime, 2);
      this.noise = { src, gain };
      this.noiseKind = kind;
    }
    stopNoise() {
      if (!this.noise) return;
      const c = this._ctx();
      const n = this.noise;
      this.noise = null;
      this.noiseKind = "";
      try {
        n.gain.gain.setTargetAtTime(0.0001, c.currentTime, 0.6);
        setTimeout(() => { try { n.src.stop(); } catch (e) { /* already stopped */ } }, 2500);
        if (this._lfo) { const l = this._lfo; this._lfo = null; setTimeout(() => { try { l.stop(); } catch (e) { /* ok */ } }, 2500); }
      } catch (e) { /* the context went away */ }
    }
    stopAll() {
      this.stopAlarm();
      this.stopNoise();
    }
  }

  class FamilyHubCompanionCard extends HTMLElement {
    static getConfigElement() {
      return document.createElement("family-hub-companion-card-editor");
    }
    static getStubConfig() {
      return { person: "me" };
    }
    setConfig(config) {
      const c = config || {};
      this._config = {
        person: typeof c.person === "string" && c.person ? c.person : "me",
        button_entity: typeof c.button_entity === "string" ? c.button_entity.trim() : "",
        height: typeof c.height === "string" && c.height.trim() ? c.height.trim() : "100vh",
        clock_seconds: !!c.clock_seconds,
        theme_override: typeof c.theme_override === "string" ? c.theme_override : "",
      };
      if (this._root) { this._applyTheme(); this._render(); }
    }
    getCardSize() {
      return 8;
    }
    connectedCallback() {
      this._connected = true;
      if (!this._root) this._build();
      this._startLoops();
      if (this._hass) this._subscribe();
      if (window.__familyHubEink) window.__familyHubEink.attach(this, { css: EINK_CSS });
      this._applyTheme();
      if (!this._onScreen) {
        this._onScreen = () => this._onScreenResize();
        window.addEventListener("resize", this._onScreen);
        if (window.visualViewport) window.visualViewport.addEventListener("resize", this._onScreen);
      }
      // the dashboard lays itself out after the card arrives, so measure again once it has
      setTimeout(this._onScreen, 50);
      setTimeout(this._onScreen, 600);
    }
    disconnectedCallback() {
      this._connected = false;
      this._stopLoops();
      this._unsubscribe();
      if (this._sound) this._sound.stopAll();
      if (this._ro) { try { this._ro.disconnect(); } catch (e) { /* ok */ } }
      if (window.__familyHubEink) window.__familyHubEink.detach(this);
      if (this._onScreen) {
        window.removeEventListener("resize", this._onScreen);
        if (window.visualViewport) window.visualViewport.removeEventListener("resize", this._onScreen);
        this._onScreen = null;
      }
      if (this._holidayUnsub) { this._holidayUnsub(); this._holidayUnsub = null; }
    }
    // the shared kit sets these; text size changes the card's size unit, so it has to fit again
    static get observedAttributes() {
      return ["a11y-scale"];
    }
    attributeChangedCallback() {
      if (this._root && this._textScale() !== this._fitScale) this._fit();
    }
    set hass(hass) {
      const first = !this._hass;
      this._hass = hass;
      if (hass && typeof hass.loadBackendTranslation === "function" && !this._i18n) {
        this._i18n = true;
        hass.loadBackendTranslation("fh_ui", "family_hub").then(() => this._render(), () => {});
      }
      if (first) {
        this._refreshAll();
        if (this._connected) this._subscribe();
      }
      const th = hass && hass.themes;
      if (th !== this._haThemesRef) { this._haThemesRef = th; this._applyTheme(); }
      this._watchButton();
      if (this._panelOpen() && this._panel === "room") {
        const sig = (this._cfg().roomButtons || []).concat(this._cfg().infoSensors || []).map((id) => { const st = hass && hass.states && hass.states[id]; return st ? st.state : ""; }).join("|");
        if (sig !== this._roomSig) { this._roomSig = sig; this._render(); }
      }
    }
    get hass() {
      return this._hass;
    }
    _t(key, fb, vars) {
      return T(this._hass, key, fb, vars);
    }
    _uid() {
      const p = this._config ? this._config.person : "me";
      if (p && p !== "me") return p;
      const el = window.__familyHubKioskSession && window.__familyHubKioskSession.elevation;
      if (el && el.user_id) return el.user_id;
      return this._hass && this._hass.user ? this._hass.user.id : "";
    }

    // -- data ------------------------------------------------------------------------------------------------------
    async _ws(msg) {
      return this._hass.connection.sendMessagePromise(msg);
    }
    async _refreshAll() {
      if (!this._hass || !this._hass.connection) return;
      const uid = this._uid();
      if (!uid) return;
      const jobs = [
        this._ws({ type: "family_hub/companion/state", user_id: uid }).then((r) => { this._state = r; this._stateAt = Date.now(); }, () => {}),
        this._ws({ type: "family_hub/routines/list" }).then((r) => { this._routines = (r && r.items) || []; }, () => {}),
        this._ws({ type: "family_hub/chores/list" }).then((r) => { this._chores = (r && r.chores) || []; }, () => {}),
        this._ws({ type: "family_hub/rewards/get_state" }).then((r) => { this._rewards = r || {}; }, () => {}),
        this._ws({ type: "family_hub/timers/list" }).then((r) => { this._timers = (r && r.timers) || []; }, () => {}),
      ];
      if (!this._names) jobs.push(this._ws({ type: "family_hub/list_users" }).then((r) => { this._names = {}; ((r && r.users) || []).forEach((u) => { this._names[u.id] = u.name; }); }, () => {}));
      if (!this._library) jobs.push(this._ws({ type: "family_hub/routines/library" }).then((r) => { this._library = (r && (r.items || r.library)) || []; }, () => { this._library = []; }));
      if (!this._settings || Date.now() - (this._settingsAt || 0) > 10 * 60000) {
        jobs.push(this._ws({ type: "family_hub/get_settings" }).then((r) => { this._settings = (r && r.settings) || {}; this._settingsAt = Date.now(); }, () => {}));
        jobs.push(this._ws({ type: "theme_builder/list" }).then((r) => { this._themes = (r && Array.isArray(r.themes)) ? r.themes : []; }, () => { this._themes = this._themes || []; }));
      }
      await Promise.all(jobs);
      this._applyTheme();
      if (!this._bornAt) this._bornAt = Date.now();
      if (this._screenOn("jobs")) this._loadWeek();
      // after the settings, which say whose wish list it is
      if (this._screenOn("wishes") && this._wishEntity()) {
        try { const r = await this._ws({ type: "todo/item/list", entity_id: this._wishEntity() }); this._wishes = (r && r.items) || []; } catch (e) { /* next refresh */ }
      }
      this._refreshEvents();
      this._refreshWeather();
      this._render();
    }
    async _refreshEvents() {
      if (!this._hass || typeof this._hass.callApi !== "function") return;
      const prof = ((this._settings && this._settings.userProfiles) || {})[this._uid()] || {};
      const cals = [prof.primaryCalendar].concat(prof.extraCalendars || [], prof.subscribedCalendars || []).filter((e, i, a) => e && a.indexOf(e) === i);
      if (!cals.length) { this._events = []; return; }
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + 2 * 86400000);
      const out = [];
      await Promise.all(cals.map((ent) => this._hass.callApi("GET", "calendars/" + ent + "?start=" + encodeURIComponent(start.toISOString()) + "&end=" + encodeURIComponent(end.toISOString()))
        .then((list) => { (list || []).forEach((ev) => out.push(ev)); }, () => {})));
      this._events = out.map((ev) => {
        const s = ev.start && (ev.start.dateTime || ev.start.date);
        const e = ev.end && (ev.end.dateTime || ev.end.date);
        return { title: ev.summary || "", start: new Date(s && s.length === 10 ? s + "T00:00:00" : s), end: new Date(e && e.length === 10 ? e + "T00:00:00" : e), allDay: !!(ev.start && ev.start.date) };
      }).filter((ev) => !isNaN(ev.start.getTime())).sort((a, b) => a.start - b.start);
      this._render();
    }
    async _refreshWeather() {
      const ent = (this._settings && this._settings.weatherEntity) || "weather.forecast_home";
      if (!this._hass || !this._hass.states || !this._hass.states[ent]) { this._forecast = null; return; }
      if (this._forecastAt && Date.now() - this._forecastAt < 30 * 60000) return;
      this._forecastAt = Date.now();
      try {
        const r = await this._ws({ type: "call_service", domain: "weather", service: "get_forecasts", service_data: { type: "daily" }, target: { entity_id: ent }, return_response: true });
        const f = r && r.response && r.response[ent] && r.response[ent].forecast;
        this._forecast = Array.isArray(f) && f.length ? f[0] : null;
      } catch (e) {
        this._forecast = null;
      }
      this._render();
    }
    _subscribe() {
      if (this._unsub || this._subscribing || !this._hass || !this._hass.connection || typeof this._hass.connection.subscribeMessage !== "function") return;
      const uid = this._uid();
      if (!uid) return;
      this._subscribing = true;
      this._hass.connection.subscribeMessage(() => this._refreshState(), { type: "family_hub/companion/subscribe", user_id: uid })
        .then((unsub) => { this._unsub = unsub; this._subscribing = false; }, () => { this._subscribing = false; });
    }
    _unsubscribe() {
      if (this._unsub) { try { this._unsub(); } catch (e) { /* ok */ } }
      this._unsub = null;
    }
    async _refreshState() {
      try {
        this._state = await this._ws({ type: "family_hub/companion/state", user_id: this._uid() });
        this._stateAt = Date.now();
        // a Settings save may have changed the calendars or weather too
        this._settingsAt = 0;
      } catch (e) { /* next poll */ }
      this._render();
    }
    _startLoops() {
      this._stopLoops();
      this._clockTimer = setInterval(() => this._tick(), 1000);
      this._pollTimer = setInterval(() => this._refreshAll(), 30000);
    }
    _stopLoops() {
      if (this._clockTimer) clearInterval(this._clockTimer);
      if (this._pollTimer) clearInterval(this._pollTimer);
      this._clockTimer = this._pollTimer = null;
    }

    // -- what's on screen --------------------------------------------------------------------------------------------
    _cfg() {
      return (this._state && this._state.settings) || {};
    }
    _mode() {
      return (this._state && this._state.mode) || "day";
    }
    _name() {
      const uid = this._uid();
      const n = (this._names && this._names[uid]) || "";
      return n.split(" ")[0];
    }
    _routineSteps(category) {
      const uid = this._uid();
      const wd = (new Date().getDay() + 6) % 7; // 0 = Monday, like the routines
      return (this._routines || [])
        .filter((i) => i && i.user_id === uid && i.category === category && (!i.days_of_week || !i.days_of_week.length || i.days_of_week.indexOf(wd) >= 0))
        .sort((a, b) => {
          const sa = a.sort_order == null ? 1e9 : a.sort_order;
          const sb = b.sort_order == null ? 1e9 : b.sort_order;
          if (sa !== sb) return sa - sb;
          return String(a.created_at || "") < String(b.created_at || "") ? -1 : 1;
        });
    }
    _emoji(title) {
      const t = String(title || "").toLowerCase();
      const lib = (this._library || []).find((r) => r && String(r.title || "").toLowerCase() === t);
      if (lib && lib.icon) return lib.icon;
      for (let i = 0; i < EMOJI.length; i++) if (EMOJI[i][0].test(t)) return EMOJI[i][1];
      return "⭐";
    }
    _openChores() {
      const uid = this._uid();
      const now = Date.now();
      return (this._chores || []).filter((c) => c && c.assigned_to === uid && c.status === "open")
        .filter((c) => !c.due_date || new Date(c.due_date).getTime() < now + 86400000)
        .sort((a, b) => (!!b.important - !!a.important) || ((a.due_date ? Date.parse(a.due_date) : 9e15) - (b.due_date ? Date.parse(b.due_date) : 9e15)));
    }
    _myTimers() {
      const uid = this._uid();
      return (this._timers || []).filter((t) => t && t.user_id === uid && t.started_at);
    }
    _timerLeft(t) {
      const attrs = t.entity_id && this._hass && this._hass.states && this._hass.states[t.entity_id] ? this._hass.states[t.entity_id].attributes : null;
      const fin = attrs ? Date.parse(attrs.finishes_at) : NaN;
      if (isFinite(fin)) return Math.max(0, Math.round((fin - Date.now()) / 1000));
      const ends = Date.parse(t.started_at) + (Number(t.duration_minutes) || 0) * 60000;
      return Math.max(0, Math.round((ends - Date.now()) / 1000));
    }
    _balance() {
      return Number(((this._rewards && this._rewards.balances) || {})[this._uid()]) || 0;
    }
    _goal() {
      const items = ((this._rewards && this._rewards.catalog) || []).filter((i) => i && Number(i.cost_stars) > 0 && this._forMe(i));
      if (!items.length) return null;
      const bal = this._balance();
      let pinned = "";
      try { pinned = window.localStorage.getItem("familyHubRewardGoal_" + this._uid()) || ""; } catch (e) { pinned = ""; }
      const pin = items.find((i) => i.id === pinned);
      if (pin) return pin;
      const next = items.filter((i) => Number(i.cost_stars) > bal).sort((a, b) => a.cost_stars - b.cost_stars);
      return next[0] || items.sort((a, b) => b.cost_stars - a.cost_stars)[0];
    }
    _unreadMessage() {
      const msgs = (this._state && this._state.messages) || [];
      for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i] && !msgs[i].ack_at && (this._acked || []).indexOf(msgs[i].id) < 0) return msgs[i];
      return null;
    }
    _locale() {
      const h = this._hass;
      return (h && h.locale && h.locale.language) || (h && h.language) || undefined;
    }
    _hour12() {
      const tf = this._hass && this._hass.locale && this._hass.locale.time_format;
      if (tf === "12") return true;
      if (tf === "24") return false;
      try { return new Intl.DateTimeFormat(this._locale(), { hour: "numeric" }).resolvedOptions().hour12; } catch (e) { return true; }
    }
    _clockParts(d) {
      const h12 = this._hour12();
      let h = d.getHours();
      let ampm = "";
      if (h12) { ampm = h < 12 ? "AM" : "PM"; h = h % 12 || 12; }
      return { time: (h12 ? String(h) : pad(h)) + ":" + pad(d.getMinutes()) + (this._config.clock_seconds ? ":" + pad(d.getSeconds()) : ""), ampm };
    }
    _fmtTime(d) {
      try { return d.toLocaleTimeString(this._locale(), { hour: "numeric", minute: "2-digit", hour12: this._hour12() }); } catch (e) { return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
    }
    _fmtHHMM(hhmm) {
      const p = String(hhmm || "").split(":");
      const d = new Date();
      d.setHours(Number(p[0]) || 0, Number(p[1]) || 0, 0, 0);
      return this._fmtTime(d);
    }
    _wear() {
      const ent = (this._settings && this._settings.weatherEntity) || "weather.forecast_home";
      const st = this._hass && this._hass.states ? this._hass.states[ent] : null;
      if (!st) return null;
      const a = st.attributes || {};
      const f = this._forecast || {};
      const unit = String(a.temperature_unit || "").indexOf("F") >= 0 ? "F" : "C";
      const toC = (v) => (unit === "F" ? (v - 32) * 5 / 9 : v);
      const now = Number(a.temperature);
      const low = Number(f.templow);
      const high = Number(f.temperature);
      const cold = toC(isFinite(low) ? Math.min(low, isFinite(now) ? now : low) : now);
      const warm = toC(isFinite(high) ? high : now);
      const cond = String(f.condition || st.state || "");
      const tips = [];
      if (/snow/.test(cond)) tips.push(["\u{1F9E3}", this._t("companion.wear_snow", "Snow clothes and boots")]);
      else if (cold < 3) tips.push(["\u{1F9E5}", this._t("companion.wear_winter", "Winter coat, hat and gloves")]);
      else if (cold < 10) tips.push(["\u{1F9E5}", this._t("companion.wear_coat", "A warm coat")]);
      else if (cold < 16) tips.push(["\u{1F9E5}", this._t("companion.wear_jacket", "A jacket or sweater")]);
      if (/rain|pour|lightning/.test(cond) || Number(f.precipitation_probability) >= 50) tips.push(["☔", this._t("companion.wear_rain", "Raincoat or umbrella")]);
      if (warm >= 25) tips.push(["\u{1FA73}", this._t("companion.wear_hot", "Shorts and a water bottle")]);
      if (/sunny|clear/.test(cond) && warm >= 20) tips.push(["\u{1F9F4}", this._t("companion.wear_sun", "Sunscreen")]);
      if (!tips.length) tips.push(["\u{1F455}", this._t("companion.wear_mild", "A t-shirt is fine")]);
      const icon = /snow/.test(cond) ? "❄️" : /rain|pour/.test(cond) ? "\u{1F327}️" : /lightning/.test(cond) ? "⛈️" : /cloud/.test(cond) ? "☁️" : /fog/.test(cond) ? "\u{1F32B}️" : /night/.test(cond) ? "\u{1F319}" : "☀️";
      return { icon, now: isFinite(now) ? Math.round(now) : null, high: isFinite(high) ? Math.round(high) : null, low: isFinite(low) ? Math.round(low) : null, deg: unit === "F" ? "°F" : "°C", tips };
    }
    _nextEvent() {
      const now = Date.now();
      const today = dayKey(new Date());
      return (this._events || []).find((e) => !e.allDay && e.end.getTime() > now && dayKey(e.start) === today) || null;
    }
    _countdown() {
      const items = ((this._settings && this._settings.countdownItems) || []).filter((c) => c && c.date && c.label);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let best = null;
      items.forEach((c) => {
        const m = String(c.date).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return;
        const days = Math.round((new Date(+m[1], +m[2] - 1, +m[3]) - today) / 86400000);
        if (days >= 1 && days <= 60 && (!best || days < best.days)) best = { label: c.label, days };
      });
      return best;
    }

    // -- building and drawing ----------------------------------------------------------------------------------------
    _build() {
      this._root = this.attachShadow({ mode: "open" });
      this._root.innerHTML = "<style>" + this._css() + "</style><div class=\"wrap\"><div class=\"screen\"></div><div class=\"ssl\"></div><div class=\"nav\"></div><div class=\"overlay\"></div></div>";
      this._sound = new CompanionSound();
      const wrap = this._root.querySelector(".wrap");
      wrap.addEventListener("click", (e) => this._onClick(e));
      const touched = () => {
        const wasShowing = this._ssShowing;
        this._lastTouch = Date.now();
        if (this._panelOpen()) this._panelAt = Date.now();
        if (wasShowing) this._render();
      };
      ["pointerdown", "touchstart", "keydown", "input"].forEach((ev) => wrap.addEventListener(ev, touched, { passive: true }));
      wrap.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && e.target && e.target.classList && e.target.classList.contains("wish-input")) this._addWish();
        if (e.key === "Enter" && e.target && e.target.classList && e.target.classList.contains("rwask-input")) this._askReward();
        else if (e.key === "Enter" && e.target && e.target.classList && e.target.classList.contains("ask-input")) this._askStars();
      });
      // a long press on the clock opens the grown-ups' menu
      const startPress = (e) => {
        if (!e.target.closest || !e.target.closest(".clock")) return;
        this._pressTimer = setTimeout(() => { this._grownups = true; this._render(); }, 2500);
      };
      const endPress = () => { if (this._pressTimer) clearTimeout(this._pressTimer); this._pressTimer = null; };
      wrap.addEventListener("touchstart", startPress, { passive: true });
      wrap.addEventListener("mousedown", startPress);
      ["touchend", "touchcancel", "mouseup", "mouseleave"].forEach((ev) => wrap.addEventListener(ev, endPress));
      if (window.ResizeObserver) {
        this._ro = new ResizeObserver(() => this._fit());
        this._ro.observe(wrap);
      } else window.addEventListener("resize", () => this._fit());
      this._render();
    }
    // "Fill the screen" (100vh, the default): the space from the card's top edge to the bottom of what you can see, so
    // Home Assistant's header bar, a phone's address bar or a view's padding never push its bottom bar off the screen.
    // Any other height (480px, 60vh) is used as it is.
    _fills() {
      const h = this._config ? String(this._config.height || "") : "";
      return h === "100vh" || h === "100dvh" || h === "100%" || h === "fill";
    }
    _sizeToScreen(wrap) {
      if (!this._fills()) {
        wrap.style.height = this._config.height;
        return;
      }
      const vv = window.visualViewport;
      const seen = Math.round(vv && vv.height ? vv.height : window.innerHeight || 0);
      const top = Math.round(this.getBoundingClientRect().top);
      // scrolled out of view, or not on the page yet: keep the last good size (or the whole screen to start with)
      if (!(top >= 0 && top < seen * 0.6) && this._fillPx) return;
      let px = top >= 0 && top < seen * 0.6 ? seen - top : seen;
      // whatever the dashboard puts below the card (the padding of the few boxes it sits in) comes off too
      let below = 0;
      let n = this;
      for (let i = 0; i < 5 && n; i++) {
        n = n.parentNode && n.parentNode.nodeType === 11 ? n.parentNode.host : n.parentNode;
        if (!n || n.nodeType !== 1 || n === document.body || n === document.documentElement || !window.getComputedStyle) break;
        const cs = window.getComputedStyle(n);
        below += (parseFloat(cs.paddingBottom) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
      }
      px -= Math.round(Math.min(64, below));
      px = Math.max(240, px);
      this._fillPx = px;
      if (wrap.style.height !== px + "px") wrap.style.height = px + "px";
    }
    _onScreenResize() {
      const wrap = this._root && this._root.querySelector(".wrap");
      if (!wrap || !this._fills()) return;
      this._sizeToScreen(wrap);
      this._fit();
    }
    // the bar along the bottom always fits across: names under the pictures when side by side doesn't fit, and just the
    // pictures if even that's too wide
    _fitNav() {
      const bar = this._root && this._root.querySelector(".nav-in");
      if (!bar) return;
      const tooWide = () => bar.scrollWidth > bar.clientWidth + 1;
      // a name cut short ("Rew...") counts as not fitting too
      const cut = () => Array.prototype.some.call(bar.querySelectorAll(".nav-lbl"), (l) => l.scrollWidth > l.clientWidth + 1);
      bar.classList.remove("tight");
      if (bar.classList.contains("auto-many")) bar.classList.remove("many", "auto-many");
      if (!bar.classList.contains("many") && (tooWide() || cut())) bar.classList.add("many", "auto-many");
      if (tooWide()) bar.classList.add("tight");
    }
    // one size unit from the card's own size, so the same layout reads from across a bedroom on any screen
    _fit() {
      const wrap = this._root && this._root.querySelector(".wrap");
      if (!wrap) return;
      const w = wrap.clientWidth || 800;
      const h = wrap.clientHeight || 480;
      const tall = h > w * 1.1;
      // a portrait phone or tablet sizes off its width, a landscape screen off its height
      const u = tall ? Math.max(9, Math.min(w / 22, h / 40)) : Math.max(8, Math.min(w / 40, h / 24));
      // Accessibility > Text size makes the words bigger; the giant clock and pictures stay the size they were
      // (the Companion is already big print, and a landscape clock screen runs out of room first, so it grows less there)
      const asked = this._textScale();
      this._fitScale = asked;
      const ts = Math.min(asked, tall ? 1.4 : 1.25);
      wrap.style.fontSize = (u * ts).toFixed(1) + "px";
      let tsCss = this._root.querySelector("style.ts");
      if (ts !== 1 && !tsCss) { tsCss = document.createElement("style"); tsCss.className = "ts"; this._root.appendChild(tsCss); }
      if (tsCss) tsCss.textContent = ts === 1 ? "" : BIG_THINGS + "{zoom:" + (1 / ts).toFixed(3) + "}";
      wrap.classList.toggle("tall", tall);
      wrap.classList.toggle("tiny", (!tall && w < 520) || h < 340);
      this._fitNav();
    }
    _textScale() {
      const kit = window.__familyHubEink;
      if (!kit || !this.hasAttribute("a11y-scale")) return 1;
      const v = parseInt(kit.a11y().textScale, 10);
      return v > 100 && v <= 200 ? v / 100 : 1;
    }
    // which theme this screen shows: the card's Theme option, a holiday's theme, this device's, then the household's
    _theme() {
      const s = this._settings || {};
      const all = (this._themes || []).concat(this._haThemes());
      const find = (id) => { for (let i = 0; i < all.length; i++) if (all[i] && all[i].id === id) return all[i]; return null; };
      const pick = this._config ? this._config.theme_override : "";
      if (pick === "companion") return null;
      if (pick && find(pick)) return find(pick);
      if (window.__fhHolidayTheme) {
        if (!this._holidayUnsub) this._holidayUnsub = window.__fhHolidayTheme.subscribe(() => { if (this._connected) this._applyTheme(); });
        const hid = window.__fhHolidayTheme.themeId(this._hass);
        if (hid && find(hid)) return find(hid);
      }
      let device = "";
      try { device = localStorage.getItem("familyHubDeviceThemeOverrideLocal") || ""; } catch (e) { device = ""; }
      const useGlobal = device ? device !== "__default__" : s.useGlobalTheme !== false;
      const id = device ? (device === "__default__" ? "" : device) : (s.globalThemeId || "slate");
      if (useGlobal && id && find(id)) return find(id);
      // the household's own colours (Settings > Theme with the shared themes off)
      if (s.theme && s.theme.colors && !useGlobal) return s.theme;
      return null;
    }
    _haThemes() {
      const h = this._hass && this._hass.themes;
      if (!h) return [];
      const dark = !!h.darkMode;
      const vars = (name) => {
        const t = (h.themes || {})[name];
        if (!t) return {};
        const out = {};
        Object.keys(t).forEach((k) => { if (k !== "modes") out[k] = t[k]; });
        const m = t.modes && t.modes[dark ? "dark" : "light"];
        if (m) Object.keys(m).forEach((k) => { out[k] = m[k]; });
        return out;
      };
      let def = {};
      try {
        const cs = getComputedStyle(document.documentElement);
        ["primary-color", "text-primary-color", "primary-background-color", "secondary-background-color", "card-background-color", "primary-text-color", "secondary-text-color", "divider-color", "ha-card-background"]
          .forEach((k) => { const v = cs.getPropertyValue("--" + k); if (v && v.trim()) def[k] = v.trim(); });
      } catch (e) { def = {}; }
      return [{ id: "ha:__default__", colors: haColors(def) }].concat(Object.keys(h.themes || {}).map((n) => ({ id: "ha:" + n, colors: haColors(vars(n)) })));
    }
    _applyTheme() {
      const wrap = this._root && this._root.querySelector(".wrap");
      if (!wrap) return;
      // until the settings arrive, the colours this screen had last time (so it doesn't flash the wrong ones)
      const key = "familyHubCompanionThemeLocal:" + ((this._config && this._config.theme_override) || "");
      let vars = null;
      if (this._settings) {
        vars = themeVars(this._theme());
        try { localStorage.setItem(key, JSON.stringify(vars)); } catch (e) { /* private mode */ }
      } else {
        try { vars = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { vars = null; }
        if (!vars || typeof vars !== "object") vars = null;
      }
      const names = ["--c-bg", "--c-card", "--c-border", "--c-text", "--c-sub", "--c-accent", "--c-accent-text", "--c-soft", "--c-blur", "--c-img", "--c-img-size", "--c-img-pos", "--c-font"];
      names.forEach((n) => { if (vars && vars[n]) wrap.style.setProperty(n, vars[n]); else wrap.style.removeProperty(n); });
      const themed = !!vars;
      const font = !!(vars && vars["--c-font"]);
      if (themed !== this._themed || font !== this._themedFont) {
        this._themed = themed;
        this._themedFont = font;
        wrap.classList.toggle("themed", themed);
        wrap.classList.toggle("themed-font", font);
      }
    }
    _onClick(e) {
      if (this._sound) {
        const was = this._sound.blocked;
        this._sound.unlock();
        if (was && !this._sound.blocked) setTimeout(() => this._render(), 50);
      }
      const t = e.target.closest ? e.target.closest("[data-act]") : null;
      if (!t) {
        if (this._mode() === "sleep" && this._cfg().nightScreen === "off") { this._peekUntil = Date.now() + 10000; this._render(); }
        return;
      }
      const act = t.getAttribute("data-act");
      const id = t.getAttribute("data-id") || "";
      if (this._panelOpen()) this._panelAt = Date.now();
      if (act === "step") this._doneStep(id);
      else if (act === "timer-own") { this._customOpen = true; this._customMin = this._customMin || 10; this._render(); }
      else if (act === "timer-own-x") { this._customOpen = false; this._render(); }
      else if (act === "timer-own-set") { this._customMin = Number(id) || 10; this._render(); }
      else if (act === "timer-own-n") {
        const steps = [1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 45, 60, 75, 90, 120];
        const cur = this._customMin || 10;
        let i = steps.indexOf(cur);
        if (i < 0) i = steps.findIndex((n) => n > cur) - (Number(id) > 0 ? 1 : 0);
        this._customMin = steps[Math.max(0, Math.min(steps.length - 1, i + Number(id)))];
        this._render();
      }
      else if (act === "timer-own-go") this._startOwnTimer();
      else if (act === "chore") this._doneChore(id);
      else if (act === "ack") this._ack(id);
      else if (act === "up") this._stopAlarm(true);
      else if (act === "comfort") this._startComfort();
      else if (act === "comfort-stop") this._endComfort();
      else if (act === "sound") { this._sound.unlock(); this._render(); }
      else if (act === "gu-close") { this._grownups = false; this._render(); }
      else if (act === "gu-mode") this._setMode(id);
      else if (act === "nav-home") this._closePanel();
      else if (act === "open-jobs" || act === "open-rewards") this._openPanel(act === "open-jobs" ? "jobs" : "rewards");
      else if (act === "rw-goal") this._toggleGoal(id);
      else if (act === "rw-get") this._tapGet(id);
      else if (act === "rw-now") { this._sure = ""; this._getReward(id, false); }
      else if (act === "rw-save") { this._sure = ""; this._getReward(id, true); }
      else if (act === "rwask-open") { this._rwAskOpen = true; this._note = ""; this._render(); const i = this._root.querySelector(".rwask-input"); if (i) i.focus(); }
      else if (act === "rwask-cancel") { this._rwAskOpen = false; this._render(); }
      else if (act === "rwask-send") this._askReward();
      else if (act === "open-screen") this._openPanel(id);
      else if (act === "wish-heart") this._setHearts(id, Number(t.getAttribute("data-n")) || 0);
      else if (act === "wish-add") { this._wishAdding = true; this._render(); const i = this._root.querySelector(".wish-input"); if (i) i.focus(); }
      else if (act === "wish-save") this._addWish();
      else if (act === "wish-cancel") { this._wishAdding = false; this._render(); }
      else if (act === "wish-sec") { this._wishOpen = this._wishOpen || {}; this._wishOpen[id] = !this._wishOpen[id]; this._render(); }
      else if (act === "timer-start") this._startTimer(Number(id));
      else if (act === "timer-stop") this._stopTimer(id);
      else if (act === "room") this._roomTap(id);
      else if (act === "chore-timer") this._startChoreTimer(id);
      else if (act === "grab") this._grab(id);
      else if (act === "ask-open") { this._askOpen = true; this._askN = 1; this._note = ""; this._render(); const i = this._root.querySelector(".ask-input"); if (i) i.focus(); }
      else if (act === "ask-cancel") { this._askOpen = false; this._render(); }
      else if (act === "ask-n") { this._askN = Math.max(1, Math.min(10, (this._askN || 1) + Number(id))); this._render(); }
      else if (act === "ask-send") this._askStars();
      else if (act === "bank-use") this._tapUse(id);
    }
    // the physical button does whatever the big button on screen would
    _primaryAction() {
      const m = this._unreadMessage();
      if (m) return this._ack(m.id);
      if (this._sound && this._sound.alarming) return this._stopAlarm(true);
      if (this._comfortUntil) return this._endComfort();
      const btn = this._root && this._root.querySelector(".big-btn[data-act]");
      if (btn) return btn.click();
      if (this._mode() === "sleep") return this._startComfort();
      return null;
    }
    _watchButton() {
      const ent = this._config && this._config.button_entity;
      if (!ent || !this._hass || !this._hass.states) return;
      const st = this._hass.states[ent];
      if (!st) return;
      const key = st.state + "|" + st.last_changed + "|" + (st.last_updated || "");
      if (this._buttonKey === undefined) { this._buttonKey = key; return; }
      if (key === this._buttonKey) return;
      const prev = this._buttonState;
      this._buttonKey = key;
      this._buttonState = st.state;
      const domain = ent.split(".")[0];
      // event / button / input_button: any new press; binary_sensor / switch / input_boolean: turning on
      if (["binary_sensor", "switch", "input_boolean", "light"].indexOf(domain) >= 0 && (st.state !== "on" || prev === "on")) return;
      if (st.state === "unavailable" || st.state === "unknown") return;
      this._primaryAction();
    }
    async _event(kind, data) {
      try { await this._ws({ type: "family_hub/companion/event", user_id: this._uid(), kind, data: data || {} }); } catch (e) { /* the screen still works */ }
    }
    async _doneStep(id) {
      const item = (this._routines || []).find((i) => i.id === id);
      if (!item || item.done) return;
      item.done = true;
      this._celebrate(item.star_value ? "+" + item.star_value + " ⭐" : "✔️");
      this._render();
      try { await this._ws({ type: "family_hub/routines/toggle", item_id: id, done: true }); } catch (e) { item.done = false; }
      this._event("step_done", { title: item.title, category: item.category });
      const left = this._routineSteps(item.category).filter((i) => !i.done);
      if (!left.length) {
        this._allDoneUntil = Date.now() + 6000;
        if (this._sound) this._sound.tada();
        this._event("routine_done", { category: item.category });
      }
      this._refreshAll();
    }
    async _doneChore(id) {
      const c = (this._chores || []).find((x) => x.id === id);
      if (!c) return;
      c.status = "pending_verification";
      this._celebrate(c.star_value ? "+" + c.star_value + " ⭐" : "✔️");
      this._render();
      try { await this._ws(this._kioskToken({ type: "family_hub/chores/complete", chore_id: id })); } catch (e) { c.status = "open"; }
      this._refreshAll();
    }
    _celebrate(text) {
      if (this._sound) this._sound.ding();
      this._burst = { text, until: Date.now() + 1800 };
      setTimeout(() => this._render(), 1850);
    }
    async _ack(id) {
      this._acked = (this._acked || []).concat([id]);
      this._render();
      this._event("message_ack", { id });
    }
    _stopAlarm(byKid) {
      if (this._sound) this._sound.stopAlarm();
      this._alarmDoneFor = dayKey(new Date());
      try { window.localStorage.setItem("familyHubCompanionAlarm_" + this._uid(), this._alarmDoneFor); } catch (e) { /* ok */ }
      if (byKid) this._event("alarm_stopped", {});
      this._render();
    }
    _startComfort() {
      this._comfortUntil = Date.now() + 3 * 60000;
      this._event("comfort", {});
      this._render();
    }
    _endComfort() {
      this._comfortUntil = 0;
      this._render();
    }
    async _setMode(mode) {
      try {
        await this._ws({ type: "family_hub/companion/set_mode", user_id: this._uid(), mode, minutes: mode === "auto" ? 1 : 60 });
        this._grownups = false;
        this._guError = "";
      } catch (e) {
        this._guError = (e && e.message) || this._t("companion.gu_failed", "Couldn't change it - a grown-up needs to be signed in.");
      }
      this._refreshState();
    }
    // every second: the clock, timers, the alarm and the sleep sound
    _tick() {
      if (!this._root) return;
      const mode = this._mode();
      const cfg = this._cfg();
      const today = dayKey(new Date());
      if (this._alarmDoneFor === undefined) {
        try { this._alarmDoneFor = window.localStorage.getItem("familyHubCompanionAlarm_" + this._uid()) || ""; } catch (e) { this._alarmDoneFor = ""; }
      }
      if (this._sound) {
        if (mode === "wake" && cfg.alarm && cfg.alarm !== "off" && this._alarmDoneFor !== today && !this._sound.alarming && !this._sound.blocked) {
          this._sound.startAlarm(cfg.alarm, () => this._stopAlarm(false));
        }
        if (mode !== "wake" && this._sound.alarming) this._sound.stopAlarm();
        const wantNoise = mode === "sleep" && cfg.sound && cfg.sound !== "off";
        if (wantNoise && !this._sound.blocked) this._sound.startNoise(cfg.sound, cfg.soundVolume == null ? 40 : cfg.soundVolume);
        else if (!wantNoise && this._sound.noise) this._sound.stopNoise();
      }
      const msg = this._unreadMessage();
      if (msg && this._spokenId !== msg.id) {
        this._spokenId = msg.id;
        if (this._sound) this._sound.message();
        this._speak(msg.text);
      }
      if (this._comfortUntil && Date.now() > this._comfortUntil) this._comfortUntil = 0;
      // only redraw what moves; a full redraw when the minute (or the screen's state) changes
      // a camera picture every 10 seconds, the same as the Family Hub screensaver
      if (this._ssShowing && this._ssKind === "camera" && Date.now() - (this._ssCamAt || 0) > 10000) this._ssCamera();
      if (this._sigNow(mode) !== this._sig) this._render();
      else this._paintLive();
    }
    _sigNow(mode) {
      const now = Date.now();
      return [mode, Math.floor(now / 60000), !!this._comfortUntil, !!(this._burst && this._burst.until > now), !!(this._allDoneUntil && this._allDoneUntil > now), this._peekUntil > now, this._panelOpen() ? this._panel : "", this._sure || "", this._openChores().length, this._balance(), this._ssDue() ? "ss" : "", this._wishAdding ? "adding" : "", this._askOpen ? "ask" + (this._askN || 1) : "", this._rwAskOpen ? "rwask" : ""].join("|");
    }
    _speak(text) {
      try {
        if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
        const u = new SpeechSynthesisUtterance(text);
        const lang = this._locale();
        if (lang) u.lang = lang;
        u.rate = 0.95;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      } catch (e) { /* no voice on this screen */ }
    }
    _paintLive() {
      const d = new Date();
      const c = this._clockParts(d);
      this._root.querySelectorAll(".clock-time").forEach((el) => { el.textContent = c.time; });
      this._root.querySelectorAll("[data-timer]").forEach((el) => {
        const t = this._myTimers().find((x) => x.uid === el.getAttribute("data-timer"));
        if (!t) return;
        const left = this._timerLeft(t);
        const total = Math.max(1, (Number(t.duration_minutes) || 1) * 60);
        const lbl = el.querySelector(".vt-left");
        if (lbl) lbl.textContent = this._fmtLeft(left);
        const arc = el.querySelector(".vt-arc");
        if (arc) arc.setAttribute("d", this._arc(left / total));
      });
    }
    _fmtLeft(s) {
      const m = Math.floor(s / 60);
      return m >= 1 ? this._t("companion.min_left", "%n% min", { n: m + (s % 60 >= 30 ? 1 : 0) }) : this._t("companion.sec_left", "%n% sec", { n: s });
    }
    // the shrinking pie of the visual timer (fraction 0..1 left)
    _arc(frac) {
      const f = Math.max(0, Math.min(0.9999, frac));
      if (f <= 0) return "";
      const a = 2 * Math.PI * f;
      const x = 50 + 46 * Math.sin(a);
      const y = 50 - 46 * Math.cos(a);
      return "M50,50 L50,4 A46,46 0 " + (f > 0.5 ? 1 : 0) + ",1 " + x.toFixed(2) + "," + y.toFixed(2) + " Z";
    }
    _visualTimerHtml(t, row) {
      const left = this._timerLeft(t);
      const total = Math.max(1, (Number(t.duration_minutes) || 1) * 60);
      return "<div class=\"vt" + (row ? " vt-row card" : "") + "\" data-timer=\"" + esc(t.uid) + "\"><svg viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"50\" r=\"47\" class=\"vt-bg\"></circle><path class=\"vt-arc\" d=\"" + this._arc(left / total) + "\"></path></svg><div class=\"vt-txt\"><b>" + esc(t.title || this._t("companion.timer", "Timer")) + "</b><span class=\"vt-left\">" + esc(this._fmtLeft(left)) + "</span></div></div>";
    }
    _render() {
      if (!this._root || !this._config) return;
      const wrap = this._root.querySelector(".wrap");
      this._sizeToScreen(wrap);
      this._fit();
      const mode = this._mode();
      const now = Date.now();
      this._sig = this._sigNow(mode);
      const screen = this._root.querySelector(".screen");
      const overlay = this._root.querySelector(".overlay");
      if (!this._uid()) {
        screen.innerHTML = "<div class=\"center\"><p class=\"big-msg\">" + esc(this._t("companion.pick_child", "Pick a child in this card's settings.")) + "</p></div>";
        return;
      }
      let html;
      let theme = mode;
      const cat = ROUTINE_FOR_MODE[mode];
      const steps = cat ? this._routineSteps(cat) : [];
      const left = steps.filter((s) => !s.done);
      if (mode === "sleep") html = this._sleepHtml();
      else if (this._panelOpen()) { html = this._screenHtml(this._panel); if (mode !== "bedtime") theme = "day"; }
      else if (mode === "wake" && this._alarmDoneFor !== dayKey(new Date())) html = this._wakeHtml();
      else if (this._allDoneUntil && this._allDoneUntil > now) html = this._allDoneHtml(cat);
      else if (left.length) html = this._routineHtml(cat, steps, left);
      else { html = this._dayHtml(); if (mode !== "bedtime") theme = "day"; }
      const ssOn = theme === "day" && this._ssDue();
      this._ssPaint(ssOn);
      // the night screen stays dark and still, so no buttons to play with in bed (nor over the screensaver)
      const nav = mode === "sleep" || ssOn ? "" : this._navHtml();
      wrap.className = "wrap m-" + theme + (nav ? " has-nav" : "") + (ssOn ? " ss-on" : "") + (wrap.classList.contains("tall") ? " tall" : "") + (wrap.classList.contains("tiny") ? " tiny" : "") + (this._themed ? " themed" : "") + (this._themedFont ? " themed-font" : "");
      this._root.querySelector(".nav").innerHTML = nav;
      this._fitNav();
      // a wish being typed survives the redraw
      const typing = screen.querySelector(".wish-input, .ask-input");
      const typed = typing ? typing.value : null;
      const hadFocus = typing && this._root.activeElement === typing;
      screen.innerHTML = html;
      const again = screen.querySelector(".wish-input, .ask-input");
      if (again && typed !== null) { again.value = typed; if (hadFocus) again.focus(); }
      const cur = screen.querySelector(".md-row.cur, .md-row.next");
      const list = screen.querySelector(".md-list");
      if (cur && list) list.scrollTop = Math.max(0, cur.offsetTop - list.offsetTop - 8);
      // things on top: a message, the comfort breathing, the grown-ups' menu, a burst of stars
      let top = "";
      const msg = this._unreadMessage();
      if (msg) top = this._messageHtml(msg);
      else if (this._comfortUntil) top = this._comfortHtml();
      else if (this._grownups) top = this._grownupsHtml();
      if (this._burst && this._burst.until > now) top += "<div class=\"burst\">" + esc(this._burst.text) + "</div>";
      if (this._sound && this._sound.blocked && (this._needsSound() || msg)) top += "<button class=\"sound-chip\" data-act=\"sound\">\u{1F508} " + esc(this._t("companion.tap_for_sound", "Tap for sound")) + "</button>";
      overlay.innerHTML = top;
      overlay.className = "overlay" + (msg || this._comfortUntil || this._grownups ? " on" : "");
    }
    _needsSound() {
      const cfg = this._cfg();
      const mode = this._mode();
      return (mode === "wake" && cfg.alarm && cfg.alarm !== "off" && this._alarmDoneFor !== dayKey(new Date())) || (mode === "sleep" && cfg.sound && cfg.sound !== "off");
    }
    _clockHtml(extraCls) {
      const d = new Date();
      const c = this._clockParts(d);
      let date = "";
      try { date = d.toLocaleDateString(this._locale(), { weekday: "long", month: "long", day: "numeric" }); } catch (e) { date = ""; }
      return "<div class=\"clock " + (extraCls || "") + "\"><div class=\"clock-row\"><span class=\"clock-time\">" + esc(c.time) + "</span>" + (c.ampm ? "<span class=\"clock-ampm\">" + c.ampm + "</span>" : "") + "</div><div class=\"clock-date\">" + esc(date) + "</div></div>";
    }
    _starsHtml() {
      if (!this._screenOn("rewards")) return "";
      const bal = this._balance();
      const goal = this._goal();
      let g = "";
      if (goal) {
        const cost = Number(goal.cost_stars) || 1;
        const pct = Math.min(100, Math.round((bal / cost) * 100));
        const more = Math.max(0, cost - bal);
        g = "<div class=\"goal\"><span class=\"goal-ico\">" + esc(goal.icon || "\u{1F381}") + "</span><span class=\"goal-txt\"><b>" + esc(goal.title) + "</b><span>" + esc(more ? this._t("companion.n_more", "%n% more ⭐", { n: more }) : this._t("companion.can_get", "You can get it!")) + "</span><span class=\"bar\"><i style=\"width:" + pct + "%\"></i></span></span></div>";
      }
      return "<div class=\"stars\" data-act=\"open-rewards\"><div class=\"star-count\">⭐ " + bal + "</div>" + g + "</div>";
    }
    _sleepHtml() {
      const cfg = this._cfg();
      const dark = cfg.nightScreen === "off" && !(this._peekUntil > Date.now());
      const wake = this._state && this._state.wake_today ? this._state.wake_today : cfg.wake;
      // after midnight the next wake-up is today's; before, tomorrow's (the server already picks weekend times)
      const okLine = cfg.okToWake !== false ? "<div class=\"stay\"><span class=\"stay-dot\"></span>" + esc(this._t("companion.stay_in_bed", "Stay in bed until %time%", { time: this._fmtHHMM(wake) })) + "</div>" : "";
      if (dark) return "<div class=\"night-off\"></div>";
      return "<div class=\"center night\">" + this._clockHtml("clock-night") + "<div class=\"moon\">\u{1F319}</div>" + okLine + "<button class=\"comfort-btn\" data-act=\"comfort\">\u{1F49B} " + esc(this._t("companion.comfort", "I need a hug")) + "</button></div>";
    }
    _wakeHtml() {
      const name = this._name();
      const w = this._wear();
      let weather = "";
      if (w) {
        weather = "<div class=\"weather\"><span class=\"w-ico\">" + w.icon + "</span><span class=\"w-temp\">" + (w.now != null ? w.now + w.deg : "") + (w.high != null ? "<small>" + esc(this._t("companion.high_low", "High %h% · Low %l%", { h: w.high + "°", l: (w.low != null ? w.low : "-") + "°" })) + "</small>" : "") + "</span></div>"
          + "<div class=\"wear\">" + w.tips.map((t) => "<div class=\"tip\"><span>" + t[0] + "</span>" + esc(t[1]) + "</div>").join("") + "</div>";
      }
      return "<div class=\"center wake\"><div class=\"sun\">☀️</div><h1>" + esc(name ? this._t("companion.good_morning_name", "Good morning, %name%!", { name }) : this._t("companion.good_morning", "Good morning!")) + "</h1>"
        + "<div class=\"ok\">" + esc(this._t("companion.ok_to_get_up", "It's time to get up")) + "</div>" + this._clockHtml("clock-small") + weather
        + "<button class=\"big-btn up\" data-act=\"up\">" + esc(this._t("companion.im_up", "I'm up!")) + "</button></div>";
    }
    _routineTitle(cat) {
      return cat === "morning" ? this._t("companion.morning_routine", "Morning routine") : cat === "afternoon" ? this._t("companion.afternoon_routine", "After school") : this._t("companion.night_routine", "Bedtime routine");
    }
    _routineHtml(cat, steps, left) {
      const cur = left[0];
      const next = left[1];
      const doneN = steps.length - left.length;
      const dots = steps.map((s) => "<i class=\"" + (s.done ? "d" : s === cur ? "c" : "") + "\"></i>").join("");
      const due = cur.due_time ? "<div class=\"step-due\">" + esc(this._t("companion.by_time", "by %time%", { time: this._fmtHHMM(cur.due_time) })) + "</div>" : "";
      const stars = cur.star_value ? "<span class=\"step-stars\">+" + cur.star_value + " ⭐</span>" : "";
      const timers = this._myTimers();
      const then = next
        ? "<div class=\"then\"><span class=\"then-lbl\">" + esc(this._t("companion.then", "Then")) + "</span><span class=\"then-ico\">" + this._emoji(next.title) + "</span><span class=\"then-t\">" + esc(next.title) + "</span></div>"
        : "<div class=\"then last\"><span class=\"then-lbl\">" + esc(this._t("companion.then", "Then")) + "</span><span class=\"then-t\">" + esc(this._t("companion.all_done_short", "All done! \u{1F389}")) + "</span></div>";
      return "<div class=\"routine\"><div class=\"r-head\"><span class=\"r-title\">" + esc(this._routineTitle(cat)) + "</span><span class=\"dots\">" + dots + "</span><span class=\"r-count\">" + doneN + "/" + steps.length + "</span>" + this._clockHtml("clock-mini") + "</div>"
        + "<div class=\"r-body\"><div class=\"now\"><div class=\"step-ico\">" + this._emoji(cur.title) + "</div><div class=\"step-t\">" + esc(cur.title) + "</div>" + due + stars + "</div>"
        + (timers.length ? "<div class=\"r-side\">" + this._visualTimerHtml(timers[0]) + then + "</div>" : "<div class=\"r-side\">" + then + "</div>") + "</div>"
        + "<button class=\"big-btn\" data-act=\"step\" data-id=\"" + esc(cur.id) + "\">✔ " + esc(this._t("companion.done", "Done!")) + "</button></div>";
    }
    _allDoneHtml(cat) {
      return "<div class=\"center alldone\"><div class=\"party\">\u{1F389}</div><h1>" + esc(this._t("companion.routine_done", "%routine% done!", { routine: this._routineTitle(cat) })) + "</h1><p>" + esc(this._t("companion.great_job", "Great job!")) + "</p>" + this._starsHtml() + "</div>";
    }
    _dayHtml() {
      const mode = this._mode();
      const cfg = this._cfg();
      const ev = this._nextEvent();
      const chores = this._openChores();
      const timers = this._myTimers();
      const cd = this._countdown();
      const blocks = [];
      if (timers.length) blocks.push(this._visualTimerHtml(timers[0], true));
      if (ev) {
        const mins = Math.round((ev.start.getTime() - Date.now()) / 60000);
        const when = mins <= 0 ? this._t("companion.happening_now", "Now") : mins < 60 ? this._t("companion.in_min", "in %n% min", { n: mins }) : this._fmtTime(ev.start);
        const m = LEAD_EMOJI ? ev.title.match(LEAD_EMOJI) : null;
        blocks.push("<div class=\"card ev\"><span class=\"c-ico\">" + (m ? m[1] : "\u{1F552}") + "</span><span class=\"c-txt\"><b>" + esc(m ? ev.title.slice(m[0].length).trim() : ev.title) + "</b><span>" + esc(when) + "</span></span></div>");
      }
      if (chores.length && this._screenOn("jobs")) {
        const c = chores[0];
        blocks.push("<div class=\"card job\" data-act=\"open-jobs\"><span class=\"c-ico\">" + this._emoji(c.title) + "</span><span class=\"c-txt\"><b>" + esc(c.title) + "</b><span>" + esc(chores.length > 1 ? this._t("companion.jobs_left", "%n% jobs left", { n: chores.length }) : this._t("companion.one_job_left", "Your last job")) + "</span></span><button class=\"big-btn small\" data-act=\"chore\" data-id=\"" + esc(c.id) + "\">✔</button></div>");
      }
      if (cd && blocks.length < 3) blocks.push("<div class=\"card cd\"><span class=\"c-ico\">\u{1F31F}</span><span class=\"c-txt\"><b>" + esc(cd.days === 1 ? this._t("companion.one_sleep", "1 sleep until %what%!", { what: cd.label }) : this._t("companion.n_sleeps", "%n% sleeps until %what%!", { n: cd.days, what: cd.label })) + "</b></span></div>");
      let bedLine = "";
      if (mode === "bedtime") {
        const bt = this._state && this._state.bedtime_today ? this._state.bedtime_today : cfg.bedtime;
        bedLine = "<div class=\"bed-line\">\u{1F319} " + esc(this._t("companion.bedtime_at", "Bedtime at %time%", { time: this._fmtHHMM(bt) })) + "</div>";
      }
      return "<div class=\"day\"><div class=\"day-main\">" + this._clockHtml("clock-big") + this._infoRowHtml() + bedLine + this._starsHtml() + "</div><div class=\"day-side\">" + (blocks.join("") || "<div class=\"card free\"><span class=\"c-ico\">\u{1F60E}</span><span class=\"c-txt\"><b>" + esc(this._t("companion.free_time", "Free time!")) + "</b></span></div>") + "</div></div>";
    }
    // -- My jobs / My rewards: opened from the day screen, back to the clock after a minute without a tap --------------
    _panelOpen() {
      return !!this._panel && Date.now() - (this._panelAt || 0) < 60000;
    }
    _openPanel(which) {
      if (this._screens().indexOf(which) < 0) return;
      this._panel = which;
      this._panelAt = Date.now();
      this._sure = "";
      this._note = "";
      this._render();
    }
    _closePanel() {
      this._panel = "";
      this._wishAdding = false;
      this._askOpen = false;
      this._sure = "";
      this._note = "";
      this._render();
    }
    // redeeming for the Companion's child: the kiosk PIN login if that's who it is, otherwise their id (needs override permission)
    _asKid(msg) {
      const uid = this._uid();
      const el = window.__familyHubKioskSession && window.__familyHubKioskSession.elevation;
      if (el && el.user_id === uid && el.token) return Object.assign({}, msg, { elevation_token: el.token });
      if (this._hass && this._hass.user && this._hass.user.id !== uid) return Object.assign({}, msg, { user_id: uid });
      return msg;
    }
    _goalId() {
      try { return window.localStorage.getItem("familyHubRewardGoal_" + this._uid()) || ""; } catch (e) { return ""; }
    }
    _toggleGoal(id) {
      // same key the Rewards and Chores cards read
      try {
        if (this._goalId() === id) window.localStorage.removeItem("familyHubRewardGoal_" + this._uid());
        else window.localStorage.setItem("familyHubRewardGoal_" + this._uid(), id);
      } catch (e) { /* private window - the heart just doesn't stick */ }
      this._render();
    }
    _tapGet(id) {
      // two taps, so a bump doesn't spend the stars
      if (this._sure !== id) {
        this._sure = id;
        this._note = "";
        clearTimeout(this._sureTimer);
        this._sureTimer = setTimeout(() => { this._sure = ""; this._render(); }, 5000);
        this._render();
        return;
      }
      this._sure = "";
      this._getReward(id);
    }
    async _getReward(id, save) {
      const item = ((this._rewards && this._rewards.catalog) || []).find((i) => i && i.id === id);
      if (!item) return;
      try {
        if (Number(item.timer_minutes) > 0) await this._ws(this._asKid({ type: "family_hub/timers/start_reward", item_id: id }));
        else await this._ws(this._asKid(Object.assign({ type: "family_hub/rewards/redeem", item_id: id }, save ? { save: true } : {})));
        if (this._sound) this._sound.tada();
        this._celebrate(item.icon || "\u{1F389}");
        this._note = save
          ? this._t("companion.saved_note", "Saved! Use it whenever you like.")
          : item.requires_fulfillment
          ? this._t("companion.reward_asked", "A grown-up will help with %title%.", { title: item.title })
          : this._t("companion.reward_enjoy", "Enjoy %title%!", { title: item.title });
        if (this._goalId() === id) this._toggleGoal(id);
      } catch (e) {
        this._note = (e && e.message) || this._t("companion.not_enough", "Not enough stars yet.");
      }
      await this._refreshAll();
      this._render();
    }
    // the screens this child has: chosen by their grown-ups, and only those with something to show
    _screenOn(key) {
      const chosen = Object.assign({}, SCREEN_DEFAULTS, this._cfg().screens || {});
      return chosen[key] !== false;
    }
    _screens() {
      const cfg = this._cfg();
      return ["myday", "jobs", "rewards", "wishes", "timers", "room"].filter((k) => {
        if (!this._screenOn(k)) return false;
        if (k === "wishes") return !!this._wishEntity();
        if (k === "timers") return !!(cfg.timers || []).length || cfg.customTimer !== false;
        if (k === "room") return !!(cfg.roomButtons || []).length || !!(cfg.infoSensors || []).length;
        return true;
      });
    }
    _navHtml() {
      const on = this._panelOpen() ? this._panel : "home";
      const jobs = this._openChores().length;
      const NAV = {
        myday: ["\u{1F4C5}", this._t("companion.nav_myday", "My day")],
        jobs: ["✅", this._t("companion.nav_jobs", "Jobs")],
        rewards: ["⭐", this._t("companion.nav_rewards", "Rewards")],
        wishes: ["\u{1F381}", this._t("companion.nav_wishes", "Wishes")],
        timers: ["⏱️", this._t("companion.nav_timers", "Timers")],
        room: ["\u{1F4A1}", this._t("companion.nav_room", "Room")],
      };
      const b = (key, act, ico, label, badge) => "<button class=\"nav-btn" + (on === key ? " on" : "") + "\" data-act=\"" + act + "\" data-id=\"" + key + "\"><span class=\"nav-ico\">" + ico + "</span><span class=\"nav-lbl\">" + esc(label) + "</span>" + (badge ? "<span class=\"nav-badge\">" + esc(badge) + "</span>" : "") + "</button>";
      const list = this._screens();
      return "<div class=\"nav-in" + (list.length > 4 ? " many" : "") + "\">" + b("home", "nav-home", "\u{1F552}", this._t("companion.nav_clock", "Clock"), "")
        + list.map((k) => b(k, "open-screen", NAV[k][0], NAV[k][1], k === "jobs" && jobs ? String(jobs) : "")).join("") + "</div>";
    }
    _screenHtml(which) {
      if (which === "jobs") return this._jobsHtml();
      if (which === "rewards") return this._rewardsHtml();
      if (which === "myday") return this._mydayHtml();
      if (which === "wishes") return this._wishesHtml();
      if (which === "timers") return this._timersHtml();
      if (which === "room") return this._roomHtml();
      return this._dayHtml();
    }

    // -- My day: today as a picture timeline ---------------------------------------------------------------------
    _eventIcon(title) {
      const m = LEAD_EMOJI ? String(title || "").match(LEAD_EMOJI) : null;
      if (m) return { ico: m[1], title: String(title).slice(m[0].length).trim() };
      const low = String(title || "").toLowerCase();
      for (let i = 0; i < EVENT_EMOJI.length; i++) if (EVENT_EMOJI[i][0].test(low)) return { ico: EVENT_EMOJI[i][1], title: title };
      return { ico: "\u{1F5D3}\uFE0F", title: title };
    }
    _mydayHtml() {
      const now = Date.now();
      const today = dayKey(new Date());
      const evs = (this._events || []).filter((e) => (e.allDay ? e.start.getTime() <= now && e.end.getTime() > now : dayKey(e.start) === today));
      const allDay = evs.filter((e) => e.allDay).map((e) => { const x = this._eventIcon(e.title); return "<span class=\"md-chip\">" + x.ico + " " + esc(x.title) + "</span>"; }).join("");
      const timed = evs.filter((e) => !e.allDay);
      const nextIdx = timed.findIndex((e) => e.start.getTime() > now);
      const rows = timed.map((e, i) => {
        const x = this._eventIcon(e.title);
        const past = e.end.getTime() <= now;
        const cur = !past && e.start.getTime() <= now;
        const cls = past ? " past" : cur ? " cur" : i === nextIdx ? " next" : "";
        const tag = cur ? "<span class=\"md-tag\">" + esc(this._t("companion.now", "Now")) + "</span>" : past ? "<span class=\"md-tick\">✓</span>" : "";
        return "<div class=\"md-row" + cls + "\"><span class=\"md-time\">" + esc(this._fmtTime(e.start)) + "</span><span class=\"md-ico\">" + x.ico + "</span><span class=\"md-t\">" + esc(x.title) + "</span>" + tag + "</div>";
      });
      const bt = this._state && this._state.bedtime_today ? this._state.bedtime_today : this._cfg().bedtime;
      if (bt) rows.push("<div class=\"md-row bed\"><span class=\"md-time\">" + esc(this._fmtHHMM(bt)) + "</span><span class=\"md-ico\">\u{1F319}</span><span class=\"md-t\">" + esc(this._t("companion.bedtime_row", "Bedtime")) + "</span></div>");
      let day = "";
      try { day = new Date().toLocaleDateString(this._locale(), { weekday: "long" }); } catch (e) { day = ""; }
      return "<div class=\"panel\">" + this._panelHead(this._t("companion.my_day", "My day") + (day ? " · " + day : ""))
        + (allDay ? "<div class=\"md-chips\">" + allDay + "</div>" : "")
        + "<div class=\"md-list\">" + (timed.length ? "" : "<div class=\"p-note\">" + esc(this._t("companion.nothing_today", "Nothing on the calendar today.")) + "</div>") + rows.join("") + "</div></div>";
    }

    // -- Wish list: their own, as pictures with hearts; linked GoWish / Amazon lists fold up ----------------------
    _profile() {
      return ((this._settings && this._settings.userProfiles) || {})[this._uid()] || {};
    }
    _wishEntity() {
      const e = this._profile().wishlistEntity;
      return typeof e === "string" && e.indexOf("todo.") === 0 ? e : "";
    }
    _wishTile(it) {
      const w = parseWish(it.description);
      const hearts = Math.max(0, Math.min(3, Number(w.data.hearts) || 0));
      const img = typeof w.data.image === "string" && /^(https?:|\/|data:image)/.test(w.data.image) ? w.data.image : "";
      const pic = img ? "<span class=\"wt-pic\" style=\"background-image:url('" + img.replace(/["'()\\\s]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()) + "')\"></span>" : "<span class=\"wt-pic empty\">\u{1F381}</span>";
      const btns = [1, 2, 3].map((n) => "<button class=\"wt-heart" + (n <= hearts ? " on" : "") + "\" data-act=\"wish-heart\" data-id=\"" + esc(it.uid) + "\" data-n=\"" + n + "\">" + (n <= hearts ? "\u{1F496}" : "\u{1F90D}") + "</button>").join("");
      return "<div class=\"wt\">" + pic + "<b>" + esc(it.summary || "") + "</b><span class=\"wt-hearts\">" + btns + "</span></div>";
    }
    _wishesHtml() {
      const items = (this._wishes || []).filter((it) => it && it.status !== "completed");
      const own = [];
      const lists = {};
      const order = [];
      items.forEach((it) => {
        const link = String(parseWish(it.description).data.sourceList || "");
        if (!link) own.push(it);
        else { if (!lists[link]) { lists[link] = []; order.push(link); } lists[link].push(it); }
      });
      const byHearts = (arr) => arr.slice().sort((a, b) => (Number(parseWish(b.description).data.hearts) || 0) - (Number(parseWish(a.description).data.hearts) || 0));
      const names = this._profile().wishlistLinkNames || {};
      const open = this._wishOpen || {};
      const add = this._wishAdding
        ? "<div class=\"wish-form\"><input type=\"text\" class=\"wish-input\" maxlength=\"80\" placeholder=\"" + esc(this._t("companion.wish_placeholder", "What do you wish for?")) + "\" /><button class=\"rw-get\" data-act=\"wish-save\">" + esc(this._t("companion.add", "Add")) + "</button><button class=\"wf-x\" data-act=\"wish-cancel\">✕</button></div>"
        : "";
      const tiles = byHearts(own).map((it) => this._wishTile(it)).join("")
        + (this._wishAdding ? "" : "<button class=\"wt add\" data-act=\"wish-add\"><span class=\"wt-plus\">+</span><b>" + esc(this._t("companion.add_wish", "Add a wish")) + "</b></button>");
      const secs = order.map((link) => {
        const name = names[link] || (/gowish\./i.test(link) ? "GoWish" : /amazon\.|a\.co\//i.test(link) ? "Amazon" : this._t("companion.linked_list", "Linked list"));
        const isOpen = !!open[link];
        return "<div class=\"wsec\"><button class=\"wsec-h\" data-act=\"wish-sec\" data-id=\"" + esc(link) + "\"><span>" + (isOpen ? "▾" : "▸") + " \u{1F381} " + esc(name) + "</span><span class=\"wsec-n\">" + lists[link].length + "</span></button>"
          + (isOpen ? "<div class=\"w-grid\">" + byHearts(lists[link]).map((it) => this._wishTile(it)).join("") + "</div>" : "") + "</div>";
      }).join("");
      return "<div class=\"panel\">" + this._panelHead(this._t("companion.my_wishes", "My wishes")) + add
        + "<div class=\"p-list\"><div class=\"w-grid\">" + tiles + "</div>" + secs + "</div></div>";
    }
    async _setHearts(uid, n) {
      const it = (this._wishes || []).find((x) => x.uid === uid);
      const ent = this._wishEntity();
      if (!it || !ent) return;
      const w = parseWish(it.description);
      const cur = Number(w.data.hearts) || 0;
      const next = cur === n ? n - 1 : n;
      const data = Object.assign({}, w.data);
      if (next > 0) data.hearts = next;
      else delete data.hearts;
      it.description = buildWish(w.note, data);
      this._render();
      try { await this._hass.callService("todo", "update_item", { entity_id: ent, item: uid, description: it.description }); } catch (e) { /* the next refresh shows how it really is */ }
    }
    async _addWish() {
      const input = this._root.querySelector(".wish-input");
      const text = input ? input.value.trim() : "";
      const ent = this._wishEntity();
      if (!text || !ent) return;
      this._wishAdding = false;
      this._wishes = (this._wishes || []).concat([{ uid: "new-" + Date.now(), summary: text, status: "needs_action", description: "" }]);
      this._celebrate("\u{1F381}");
      this._render();
      try { await this._hass.callService("todo", "add_item", { entity_id: ent, item: text }); } catch (e) { /* shows up (or not) on the next refresh */ }
      this._refreshAll();
    }

    // -- Timers they can start, as the same shrinking circle ----------------------------------------------------
    _timersHtml() {
      const cfg = this._cfg();
      const running = this._myTimers();
      const top = running.length
        ? "<div class=\"tm-run\">" + this._visualTimerHtml(running[0]) + "<button class=\"rw-get stop\" data-act=\"timer-stop\" data-id=\"" + esc(running[0].uid) + "\">■ " + esc(this._t("companion.stop", "Stop")) + "</button></div>"
        : "";
      let tiles = (cfg.timers || []).map((tm, i) => "<button class=\"tm" + (running.length ? " off" : "") + "\" data-act=\"timer-start\" data-id=\"" + i + "\"" + (running.length ? " disabled" : "") + "><span class=\"tm-ico\">" + esc(tm.icon || "⏱️") + "</span><b>" + esc(tm.title) + "</b><span class=\"tm-min\">" + esc(this._t("companion.n_min", "%n% min", { n: tm.minutes })) + (tm.stars ? " · +" + tm.stars + " ⭐" : "") + "</span></button>").join("");
      // a timer of their own: any length, no stars
      let own = "";
      if (cfg.customTimer !== false && !running.length) {
        if (this._customOpen) {
          const m = this._customMin || 10;
          own = "<div class=\"tm-own\"><div class=\"tm-own-h\">⏱️ " + esc(this._t("companion.how_long", "How long?")) + "</div><div class=\"tm-own-row\"><button class=\"ask-n\" data-act=\"timer-own-n\" data-id=\"-1\">−</button><span class=\"tm-own-n\">" + esc(this._t("companion.n_min", "%n% min", { n: m })) + "</span><button class=\"ask-n\" data-act=\"timer-own-n\" data-id=\"1\">+</button></div>"
            + "<div class=\"tm-own-quick\">" + [5, 10, 15, 20, 30, 45, 60].map((n) => "<button class=\"tm-q" + (n === m ? " on" : "") + "\" data-act=\"timer-own-set\" data-id=\"" + n + "\">" + n + "</button>").join("") + "</div>"
            + "<div class=\"tm-own-row\"><button class=\"rw-get\" data-act=\"timer-own-go\">▶ " + esc(this._t("companion.start", "Start")) + "</button><button class=\"wf-x\" data-act=\"timer-own-x\">✕</button></div></div>";
        } else {
          tiles += "<button class=\"tm own\" data-act=\"timer-own\"><span class=\"tm-ico\">⏱️</span><b>" + esc(this._t("companion.pick_time", "Pick a time")) + "</b><span class=\"tm-min\">" + esc(this._t("companion.your_timer", "Your own timer")) + "</span></button>";
        }
      }
      return "<div class=\"panel\">" + this._panelHead(this._t("companion.timers_title", "Timers")) + "<div class=\"p-list\">" + top + own + "<div class=\"tm-grid\">" + tiles + "</div></div></div>";
    }
    async _startOwnTimer() {
      const m = this._customMin || 10;
      this._customOpen = false;
      if (this._myTimers().length) return;
      try {
        await this._ws({ type: "family_hub/companion/start_timer", user_id: this._uid(), minutes: m });
        if (this._sound) this._sound.ding();
      } catch (e) { this._note = (e && e.message) || ""; }
      await this._refreshAll();
    }
    async _startTimer(i) {
      const tm = (this._cfg().timers || [])[i];
      if (!tm || this._myTimers().length) return;
      try {
        await this._ws({ type: "family_hub/companion/start_timer", user_id: this._uid(), index: i });
        if (this._sound) this._sound.ding();
      } catch (e) { this._note = (e && e.message) || ""; }
      await this._refreshAll();
    }
    async _stopTimer(uid) {
      try { await this._ws({ type: "family_hub/timers/cancel", uid }); } catch (e) { /* already done */ }
      await this._refreshAll();
    }

    // -- Room buttons: big on/off tiles for their own lights and things ----------------------------------------
    _roomHtml() {
      const states = (this._hass && this._hass.states) || {};
      const ICON = { light: ["\u{1F4A1}", "\u{1F311}"], switch: ["\u{1F50C}", "\u{1F50C}"], fan: ["\u{1F300}", "\u{1F300}"], input_boolean: ["✅", "⬜"], media_player: ["\u{1F3B5}", "\u{1F3B5}"], cover: ["\u{1FA9F}", "\u{1FA9F}"], scene: ["✨", "✨"], script: ["▶️", "▶️"] };
      const tiles = (this._cfg().roomButtons || []).map((id) => {
        const st = states[id];
        const dom = id.split(".")[0];
        const on = !!st && ["on", "playing", "open", "opening"].indexOf(st.state) >= 0;
        const gone = !st || st.state === "unavailable";
        const name = (st && st.attributes && st.attributes.friendly_name) || id;
        const ico = (ICON[dom] || ["\u{1F518}", "\u{1F518}"])[on ? 0 : 1];
        return "<button class=\"rm" + (on ? " on" : "") + (gone ? " gone" : "") + "\" data-act=\"room\" data-id=\"" + esc(id) + "\"" + (gone ? " disabled" : "") + "><span class=\"rm-ico\">" + ico + "</span><b>" + esc(name) + "</b><span class=\"rm-st\">" + esc(gone ? this._t("companion.not_working", "Not working") : dom === "scene" || dom === "script" ? this._t("companion.tap_to_start", "Tap to start") : on ? this._t("companion.on", "On") : this._t("companion.off", "Off")) + "</span></button>";
      }).join("");
      const info = this._infoList().map((x) => "<div class=\"inf\"><span class=\"inf-ico\">" + x.icon + "</span><b>" + esc(x.value) + "</b><span>" + esc(x.name) + "</span></div>").join("");
      return "<div class=\"panel\">" + this._panelHead(this._t("companion.my_room", "My room")) + "<div class=\"p-list\">" + (info ? "<div class=\"inf-grid\">" + info + "</div>" : "") + "<div class=\"rm-grid\">" + tiles + "</div></div></div>";
    }
    // what their room is like: temperature, humidity, a door... (they can see these, not change them)
    _infoList() {
      const states = (this._hass && this._hass.states) || {};
      const ICONS = { temperature: "\u{1F321}\uFE0F", humidity: "\u{1F4A7}", carbon_dioxide: "\u{1FAE7}", pm25: "\u{1F32B}\uFE0F", illuminance: "\u{1F506}", battery: "\u{1F50B}", door: "\u{1F6AA}", garage_door: "\u{1F6AA}", window: "\u{1FA9F}", motion: "\u{1F3C3}", occupancy: "\u{1F3C3}", sound: "\u{1F50A}", moisture: "\u{1F4A6}", power: "\u26A1", energy: "\u26A1" };
      return (this._cfg().infoSensors || []).map((id) => {
        const st = states[id];
        if (!st) return null;
        const a = st.attributes || {};
        const dom = id.split(".")[0];
        const name = a.friendly_name || id;
        let value = "";
        let icon = ICONS[a.device_class] || "\u2139\uFE0F";
        const num = (v, unit) => { const n = Number(v); return isFinite(n) ? (Math.abs(n) >= 10 ? Math.round(n) : Math.round(n * 10) / 10) + (unit ? (/^°/.test(unit) || unit === "%" ? "" : " ") + unit : "") : String(v); };
        if (dom === "climate") { icon = "\u{1F321}\uFE0F"; value = a.current_temperature != null ? num(a.current_temperature, (this._hass.config && this._hass.config.unit_system && this._hass.config.unit_system.temperature) || "°") : st.state; }
        else if (dom === "weather") { icon = /rain|pour/.test(st.state) ? "\u{1F327}\uFE0F" : /snow/.test(st.state) ? "\u2744\uFE0F" : /cloud/.test(st.state) ? "\u2601\uFE0F" : "\u2600\uFE0F"; value = a.temperature != null ? num(a.temperature, a.temperature_unit || "°") : st.state; }
        else if (st.state === "unavailable" || st.state === "unknown") value = "–";
        else if (dom === "sensor" && isFinite(Number(st.state))) value = num(st.state, a.unit_of_measurement || "");
        else if (typeof this._hass.formatEntityState === "function") { try { value = this._hass.formatEntityState(st); } catch (e) { value = st.state; } }
        else value = st.state;
        return { id, icon, value, name };
      }).filter(Boolean);
    }
    _infoRowHtml() {
      const list = this._infoList();
      return list.length ? "<div class=\"info-row\">" + list.map((x) => "<span class=\"info\"><span>" + x.icon + "</span>" + esc(x.value) + "</span>").join("") + "</div>" : "";
    }
    _roomTap(id) {
      const dom = id.split(".")[0];
      const call = dom === "scene" || dom === "script" ? [dom, "turn_on"] : dom === "media_player" ? ["media_player", "media_play_pause"] : dom === "cover" ? ["cover", "toggle"] : ["homeassistant", "toggle"];
      if (this._sound) this._sound.ding();
      try { this._hass.callService(call[0], call[1], { entity_id: id }); } catch (e) { /* the tile shows the real state */ }
    }

    // -- Screensaver: the same video or live camera as the Family Hub screensaver (or this child's own), when nobody --
    // -- has touched the screen for a while, daytime only. Its own layer, so the clock ticking doesn't restart the video.
    _ssSource() {
      const cfg = this._cfg();
      if (cfg.screensaverSource === "video") return { kind: "video", url: cfg.screensaverVideoUrl || "" };
      if (cfg.screensaverSource === "camera") return { kind: "camera", entity: cfg.screensaverCamera || "" };
      const h = (this._settings && this._settings.screenSaver) || {};
      return h.sourceType === "camera" ? { kind: "camera", entity: h.cameraEntity || "" } : { kind: "video", url: h.videoUrl || "" };
    }
    _ssDue() {
      const cfg = this._cfg();
      if (!cfg.screensaver || this._panelOpen()) return false;
      // a moving picture on an e-ink screen is just flicker
      if (window.__familyHubEink && window.__familyHubEink.deviceMode() !== "off") return false;
      const mode = this._mode();
      if (mode !== "day" && mode !== "afternoon") return false;
      const src = this._ssSource();
      const ok = src.kind === "camera" ? !!(src.entity && this._hass && this._hass.states && this._hass.states[src.entity]) : !!src.url;
      return ok && Date.now() - (this._lastTouch || this._bornAt || Date.now()) > (Number(cfg.screensaverIdle) || 5) * 60000;
    }
    _ssPaint(on) {
      const layer = this._root.querySelector(".ssl");
      if (!layer) return;
      const was = this._ssShowing;
      this._ssShowing = on;
      if (!on) {
        const v = layer.querySelector("video");
        if (v) { try { v.pause(); } catch (e) { /* ok */ } }
        return;
      }
      const src = this._ssSource();
      const key = src.kind + "|" + (src.url || src.entity);
      if (this._ssKey !== key) {
        this._ssKey = key;
        this._ssKind = src.kind;
        layer.innerHTML = (src.kind === "video"
          ? "<video class=\"ss-media\" muted loop autoplay playsinline src=\"" + esc(src.url) + "\"></video>"
          : "<img class=\"ss-media\" alt=\"\">") + "<div class=\"ss-clock\">" + this._clockHtml("clock-small") + "</div>";
      }
      if (src.kind === "camera" && !was) this._ssCamera();
      const v = layer.querySelector("video");
      if (v && !was) {
        try { v.currentTime = 0; const p = v.play(); if (p && typeof p.catch === "function") p.catch(() => {}); } catch (e) { /* ok */ }
      }
    }
    _ssCamera() {
      this._ssCamAt = Date.now();
      const src = this._ssSource();
      const st = this._hass && this._hass.states && this._hass.states[src.entity];
      const pic = st && st.attributes && st.attributes.entity_picture;
      const img = this._root.querySelector(".ssl img");
      if (!pic || !img) return;
      img.src = pic + (pic.indexOf("?") < 0 ? "?" : "&") + "fhts=" + Date.now();
    }
    _panelHead(title) {
      return "<div class=\"p-head\"><span class=\"p-title\">" + esc(title) + "</span>" + this._clockHtml("clock-mini") + "</div>";
    }
    // the kiosk PIN login, when it's this child who logged in (for commands that only take that, not a user_id)
    _kioskToken(msg) {
      const el = window.__familyHubKioskSession && window.__familyHubKioskSession.elevation;
      return el && el.user_id === this._uid() && el.token ? Object.assign({}, msg, { elevation_token: el.token }) : msg;
    }
    _isMe() {
      const el = window.__familyHubKioskSession && window.__familyHubKioskSession.elevation;
      if (el && el.user_id === this._uid()) return true;
      return !!(this._hass && this._hass.user && this._hass.user.id === this._uid());
    }
    _isToday(iso) {
      if (!iso) return false;
      const d = new Date(iso);
      return !isNaN(d.getTime()) && dayKey(d) === dayKey(new Date());
    }
    _weekStart() {
      const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const fw = this._hass && this._hass.locale && this._hass.locale.first_weekday;
      const first = names.indexOf(fw) >= 0 ? names.indexOf(fw) : 0;
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - ((d.getDay() - first + 7) % 7));
      return d;
    }
    // what's coming this week, and what they earned on the days gone by - at most every 2 minutes
    async _loadWeek() {
      if (this._weekLoading || Date.now() - (this._weekAt || 0) < 120000) return;
      this._weekLoading = true;
      const start = this._weekStart();
      const end = new Date(start.getTime() + 7 * 86400000 + 3600000);
      try {
        const res = await Promise.all([
          this._ws({ type: "family_hub/chores/schedule", start: start.toISOString(), end: end.toISOString() }).then((r) => (r && r.items) || [], () => null),
          this._ws({ type: "family_hub/rewards/get_ledger", user_id: this._uid() }).then((r) => (r && r.ledger) || [], () => null),
        ]);
        if (res[0]) this._sched = res[0];
        if (res[1]) this._ledger = res[1];
        this._weekAt = Date.now();
      } finally { this._weekLoading = false; }
    }
    _weekHtml(finished, total) {
      const uid = this._uid();
      const start = this._weekStart();
      const today = dayKey(new Date());
      const EARN = ["chore_approved", "routine_approved", "goal_achieved", "timer_finished"];
      const cells = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start.getTime());
        d.setDate(d.getDate() + i);
        const key = dayKey(d);
        let wd = "";
        try { wd = d.toLocaleDateString(this._locale(), { weekday: "narrow" }); } catch (e) { wd = ""; }
        let mark;
        let cls;
        if (key < today) {
          const stars = (this._ledger || []).filter((e) => e && Number(e.delta) > 0 && EARN.indexOf(e.source) >= 0 && e.at && dayKey(new Date(e.at)) === key).reduce((n, e) => n + (Number(e.delta) || 0), 0);
          cls = "past" + (stars ? " earned" : "");
          mark = stars ? "⭐" + stars : "·";
        } else if (key === today) {
          cls = "today";
          mark = total && finished >= total ? "\u{1F389}" : total ? finished + "/" + total : "\u{1F31E}";
        } else {
          const n = (this._sched || []).filter((it) => it && it.assigned_to === uid && it.status !== "away" && it.due && dayKey(new Date(it.due)) === key).length;
          cls = "future";
          mark = n ? String(n) : "·";
        }
        cells.push("<span class=\"wk " + cls + "\"><span class=\"wk-d\">" + esc(wd) + "</span><span class=\"wk-m\">" + mark + "</span></span>");
      }
      return "<div class=\"wk-row\">" + cells.join("") + "</div>";
    }
    _jobRow(c, kind) {
      const timer = (this._timers || []).find((t) => t && t.chore_id === c.id && t.started_at);
      let right = "";
      let sub = c.star_value ? "+" + c.star_value + " ⭐" : "";
      if (kind === "waiting") sub = "⏳ " + this._t("companion.waiting", "Waiting for a grown-up");
      else if (kind === "done") right = "<span class=\"jb-done\">✓</span>";
      else if (kind === "grab") right = "<button class=\"rw-get\" data-act=\"grab\" data-id=\"" + esc(c.id) + "\">" + esc(this._t("companion.mine", "Mine!")) + "</button>";
      else if (timer) right = "<span class=\"jb-tm\" data-timer=\"" + esc(timer.uid) + "\">⏱ <span class=\"vt-left\">" + esc(this._fmtLeft(this._timerLeft(timer))) + "</span></span>";
      else if (Number(c.timer_minutes) > 0) { right = "<button class=\"big-btn small play\" data-act=\"chore-timer\" data-id=\"" + esc(c.id) + "\">▶</button>"; sub = "⏱ " + this._t("companion.n_min", "%n% min", { n: Number(c.timer_minutes) }) + (sub ? " · " + sub : ""); }
      else right = "<button class=\"big-btn small\" data-act=\"chore\" data-id=\"" + esc(c.id) + "\">✔</button>";
      return "<div class=\"card p-row jb-" + kind + "\"><span class=\"c-ico\">" + this._emoji(c.title) + "</span><span class=\"c-txt\"><b>" + esc(c.title) + "</b>" + (sub ? "<span>" + esc(sub) + "</span>" : "") + "</span>" + right + "</div>";
    }
    _jobsHtml() {
      const uid = this._uid();
      const mine = (this._chores || []).filter((c) => c && c.assigned_to === uid);
      const open = this._openChores();
      const waiting = mine.filter((c) => c.status === "pending_verification");
      const done = mine.filter((c) => c.status === "approved" && this._isToday(c.approved_at));
      const total = open.length + waiting.length + done.length;
      const finished = waiting.length + done.length;
      const streak = mine.reduce((m, c) => Math.max(m, Number(c.streak_count) || 0), 0);
      const progress = total
        ? "<div class=\"jb-prog\"><span>" + esc(finished >= total ? this._t("companion.all_done_jobs", "All done! Great job!") : this._t("companion.n_of_m", "%n% of %m% done", { n: finished, m: total })) + "</span>"
          + (streak >= 2 ? "<span class=\"jb-streak\">\u{1F525} " + esc(this._t("companion.streak", "%n% days in a row", { n: streak })) + "</span>" : "")
          + "<span class=\"bar\"><i style=\"width:" + Math.round((finished / total) * 100) + "%\"></i></span></div>"
        : "";
      const grabs = (this._chores || []).filter((c) => c && c.assigned_to === "chore_bin" && c.status === "open");
      const rows = open.map((c) => this._jobRow(c, "open")).concat(waiting.map((c) => this._jobRow(c, "waiting")), done.map((c) => this._jobRow(c, "done"))).join("");
      const grabHtml = grabs.length ? "<div class=\"p-sub\">\u{1F3AF} " + esc(this._t("companion.up_for_grabs", "Up for grabs")) + "</div>" + grabs.map((c) => this._jobRow(c, "grab")).join("") : "";
      let ask = "";
      if (this._cfg().askStars !== false) {
        ask = this._askOpen
          ? "<div class=\"ask\"><input type=\"text\" class=\"ask-input wish-like\" maxlength=\"120\" placeholder=\"" + esc(this._t("companion.ask_what", "What did you do?")) + "\" />"
            + "<div class=\"ask-row\"><button class=\"ask-n\" data-act=\"ask-n\" data-id=\"-1\">−</button><span class=\"ask-stars\">" + (this._askN || 1) + " ⭐</span><button class=\"ask-n\" data-act=\"ask-n\" data-id=\"1\">+</button>"
            + "<button class=\"rw-get\" data-act=\"ask-send\">" + esc(this._t("companion.send", "Send")) + "</button><button class=\"wf-x\" data-act=\"ask-cancel\">✕</button></div></div>"
          : "<button class=\"ask-btn\" data-act=\"ask-open\">⭐ " + esc(this._t("companion.ask_stars", "Ask for stars")) + "</button>";
      }
      const note = this._note ? "<div class=\"p-note p-msg\">" + esc(this._note) + "</div>" : "";
      return "<div class=\"panel\">" + this._panelHead(this._t("companion.my_jobs", "My jobs"))
        + "<div class=\"p-list\">" + progress + this._weekHtml(finished, total) + note
        + (rows || "<div class=\"p-empty sm\">\u{1F389} " + esc(this._t("companion.no_jobs", "No jobs right now!")) + "</div>")
        + grabHtml + ask + "</div></div>";
    }
    async _startChoreTimer(id) {
      try { await this._ws(this._kioskToken({ type: "family_hub/timers/start_chore", chore_id: id, source: "companion" })); if (this._sound) this._sound.ding(); }
      catch (e) { this._note = (e && e.message) || ""; }
      await this._refreshAll();
    }
    async _grab(id) {
      const c = (this._chores || []).find((x) => x.id === id);
      try {
        // their own login (or PIN) claims it; a grown-up's login on their screen gives it to them (needs assign permission)
        if (this._isMe()) await this._ws(this._kioskToken({ type: "family_hub/chores/claim", chore_id: id }));
        else await this._ws({ type: "family_hub/chores/assign", chore_id: id, target: this._uid() });
        if (c) { c.assigned_to = this._uid(); this._celebrate("\u{1F3AF}"); }
      } catch (e) { this._note = (e && e.message) || ""; }
      await this._refreshAll();
    }
    async _askReward() {
      const input = this._root.querySelector(".rwask-input");
      const title = input ? input.value.trim() : "";
      if (!title) { if (input) input.focus(); return; }
      try {
        await this._ws(this._asKid({ type: "family_hub/rewards/add_suggestion", title }));
        this._rwAskOpen = false;
        this._note = this._t("companion.ask_reward_sent", "Sent! A grown-up will decide how many stars it is.");
        if (this._sound) this._sound.ding();
      } catch (e) { this._note = (e && e.message) || ""; }
      await this._refreshAll();
    }
    async _askStars() {
      const input = this._root.querySelector(".ask-input");
      const title = input ? input.value.trim() : "";
      if (!title) { if (input) input.focus(); return; }
      const msg = this._kioskToken({ type: "family_hub/chores/request_stars", title, stars: this._askN || 1 });
      if (!this._isMe()) msg.for_user = this._uid();
      try {
        await this._ws(msg);
        this._askOpen = false;
        this._note = this._t("companion.asked_sent", "Sent! A grown-up will check it.");
        if (this._sound) this._sound.ding();
      } catch (e) { this._note = (e && e.message) || ""; }
      await this._refreshAll();
    }
    _rewardsHtml() {
      const bal = this._balance();
      const goalId = this._goalId();
      const items = ((this._rewards && this._rewards.catalog) || []).filter((i) => i && i.title && this._forMe(i)).slice()
        .sort((a, b) => (Number(a.cost_stars) || 0) - (Number(b.cost_stars) || 0));
      const tiles = items.map((it) => {
        const cost = Number(it.cost_stars) || 0;
        const left = Math.max(0, cost - bal);
        const hearted = goalId === it.id;
        let action;
        // a "Stacks up" reward's bank, or everyday rewards they saved for later (2026.11.2)
        const banked = this._bankFor(it);
        const canSave = this._canSave(it);
        if (this._sure === it.id && canSave && !left) action = "<span class=\"rw-two\"><button class=\"rw-get\" data-act=\"rw-now\" data-id=\"" + esc(it.id) + "\">" + esc(this._t("companion.use_now", "Use now")) + "</button><button class=\"rw-get save\" data-act=\"rw-save\" data-id=\"" + esc(it.id) + "\">\u{1F4E6} " + esc(this._t("companion.save_it", "Save it")) + "</button></span>";
        else if (left) action = "<span class=\"rw-need\">" + esc(this._t("companion.n_more", "%n% more ⭐", { n: left })) + "<span class=\"bar\"><i style=\"width:" + (cost ? Math.min(100, Math.round((bal / cost) * 100)) : 0) + "%\"></i></span></span>";
        else if (this._sure === it.id) action = "<button class=\"rw-get sure\" data-act=\"rw-get\" data-id=\"" + esc(it.id) + "\">" + esc(this._t("companion.sure", "Yes, get it!")) + "</button>";
        else action = "<button class=\"rw-get\" data-act=\"rw-get\" data-id=\"" + esc(it.id) + "\">" + esc(this._t("companion.get_it", "Get it!")) + "</button>";
        return "<div class=\"rw" + (left ? " locked" : "") + (hearted ? " hearted" : "") + "\">"
          + "<button class=\"rw-heart\" data-act=\"rw-goal\" data-id=\"" + esc(it.id) + "\" aria-pressed=\"" + (hearted ? "true" : "false") + "\">" + (hearted ? "\u{1F49A}" : "\u{1F90D}") + "</button>"
          + "<span class=\"rw-ico\">" + esc(it.icon || "\u{1F381}") + "</span><b>" + esc(it.title) + "</b>" + (banked ? this._bankHtml(it, banked) : "") + "<span class=\"rw-cost\">⭐ " + cost + (Number(it.timer_minutes) > 0 ? " · ⏱ " + Number(it.timer_minutes) + "m" : "") + "</span>" + action + "</div>";
      }).join("");
      const uid = this._uid();
      const waiting = ((this._rewards && this._rewards.redemptions) || []).filter((r) => r && r.user_id === uid && r.requires_fulfillment && !r.fulfilled).slice(0, 3);
      const wait = waiting.length ? "<div class=\"p-note\">⏳ " + esc(this._t("companion.waiting", "Waiting for a grown-up")) + ": " + esc(waiting.map((r) => r.title).join(", ")) + "</div>" : "";
      const note = this._note ? "<div class=\"p-note p-msg\">" + esc(this._note) + "</div>" : "";
      const got = ((this._rewards && this._rewards.redemptions) || []).filter((r) => r && r.user_id === uid && (!r.requires_fulfillment || r.fulfilled)).slice(0, 5);
      const shelf = got.length ? "<div class=\"p-sub\">\u{1F3C5} " + esc(this._t("companion.you_got", "You got")) + "</div><div class=\"shelf\">" + got.map((r) => {
        const it = ((this._rewards && this._rewards.catalog) || []).find((c) => c.id === r.item_id);
        return "<span class=\"trophy\">" + esc((it && it.icon) || "\u{1F381}") + " " + esc(r.title) + "</span>";
      }).join("") + "</div>" : "";
      const hint = tiles && !goalId && !note ? "<div class=\"p-note\">\u{1F90D} " + esc(this._t("companion.tap_heart", "Tap a heart to save up for it.")) + "</div>" : "";
      // rewards they've asked for that a grown-up hasn't priced yet, and the button to ask for another
      const asked = ((this._rewards && this._rewards.suggestions) || []).filter((sg) => sg && sg.submitted_by === uid);
      const askedHtml = asked.length ? "<div class=\"p-sub\">\u{1F4A1} " + esc(this._t("companion.asked_for", "You asked for")) + "</div><div class=\"shelf\">" + asked.map((sg) => "<span class=\"trophy\">⏳ " + esc(sg.title) + "</span>").join("") + "</div>" : "";
      let askHtml = "";
      if (this._cfg().askRewards !== false) {
        askHtml = this._rwAskOpen
          ? "<div class=\"ask\"><input type=\"text\" class=\"ask-input rwask-input\" maxlength=\"80\" placeholder=\"" + esc(this._t("companion.ask_reward_placeholder", "What would you like?")) + "\" />"
            + "<div class=\"ask-row\"><button class=\"rw-get\" data-act=\"rwask-send\">" + esc(this._t("companion.send", "Send")) + "</button><button class=\"wf-x\" data-act=\"rwask-cancel\">✕</button></div></div>"
          : "<button class=\"ask-btn\" data-act=\"rwask-open\">\u{1F4A1} " + esc(this._t("companion.ask_reward", "Ask for a new reward")) + "</button>";
      }
      return "<div class=\"panel\">" + this._panelHead(this._t("companion.my_rewards", "My rewards") + "  ⭐ " + bal)
        + note + wait + hint
        + "<div class=\"p-list\">" + (tiles ? "<div class=\"rw-grid\">" + tiles + "</div>" : "<div class=\"p-empty\">" + esc(this._t("companion.no_rewards", "No rewards yet.")) + "</div>") + askedHtml + shelf + askHtml + "</div></div>";
    }
    _bankFor(it) {
      const banks = (this._rewards && this._rewards.banks) || {};
      return Number((banks[this._uid()] || {})[it.id]) || 0;
    }
    // 2026.11.2: a reward can be for certain people only; this child only sees the ones they can get
    _forMe(it) {
      const who = (it && it.for_users) || [];
      return !who.length || who.indexOf(this._uid()) >= 0;
    }
    // an everyday reward without a timer can be kept for later (a one-time one disappears; a timer one starts its timer)
    _canSave(it) {
      return (!it.redeem_mode || it.redeem_mode === "instant") && !(Number(it.timer_minutes) > 0);
    }
    _bankStep(it, banked) {
      const step = it.redeem_mode === "banked" ? Number(it.stack_unit_amount) || 1 : 1;
      return Math.min(step, banked);
    }
    _bankHtml(it, banked) {
      const sure = this._sure === "bank:" + it.id;
      if (it.redeem_mode !== "banked") {
        // saved for later: "2 saved", one at a time
        return "<span class=\"rw-bank\">\u{1F4E6} " + esc(this._t("companion.saved_count", "%n% saved", { n: banked })) + "</span>"
          + "<button class=\"rw-get use" + (sure ? " sure" : "") + "\" data-act=\"bank-use\" data-id=\"" + esc(it.id) + "\">" + esc(sure ? this._t("companion.use_sure", "Yes, use it!") : this._t("companion.use_one", "Use one")) + "</button>";
      }
      const unit = it.stack_unit_label || "";
      return "<span class=\"rw-bank\">\u{1F3E6} " + esc(this._t("companion.saved", "%n% %unit% saved", { n: banked, unit })) + "</span>"
        + "<button class=\"rw-get use" + (sure ? " sure" : "") + "\" data-act=\"bank-use\" data-id=\"" + esc(it.id) + "\">" + esc(sure ? this._t("companion.use_sure", "Yes, use it!") : this._t("companion.use_n", "Use %n% %unit%", { n: this._bankStep(it, banked), unit })) + "</button>";
    }
    _tapUse(id) {
      if (this._sure !== "bank:" + id) {
        this._sure = "bank:" + id;
        this._note = "";
        clearTimeout(this._sureTimer);
        this._sureTimer = setTimeout(() => { this._sure = ""; this._render(); }, 5000);
        this._render();
        return;
      }
      this._sure = "";
      this._useBank(id);
    }
    async _useBank(id) {
      const it = ((this._rewards && this._rewards.catalog) || []).find((i) => i && i.id === id);
      if (!it) return;
      const amount = this._bankStep(it, this._bankFor(it));
      try {
        await this._ws(this._asKid({ type: "family_hub/rewards/use_bank", item_id: id, amount }));
        this._celebrate(it.icon || "\u{1F389}");
        this._note = it.requires_fulfillment
          ? this._t("companion.reward_asked", "A grown-up will help with %title%.", { title: it.title })
          : this._t("companion.reward_enjoy", "Enjoy %title%!", { title: it.title });
      } catch (e) { this._note = (e && e.message) || ""; }
      await this._refreshAll();
      this._render();
    }
    _messageHtml(m) {
      return "<div class=\"msg\"><div class=\"msg-ico\">\u{1F48C}</div><div class=\"msg-t\">" + esc(m.text) + "</div>" + (m.from_name ? "<div class=\"msg-from\">" + esc(this._t("companion.from", "From %name%", { name: m.from_name })) + "</div>" : "")
        + "<button class=\"big-btn\" data-act=\"ack\" data-id=\"" + esc(m.id) + "\">\u{1F44D} " + esc(this._t("companion.got_it", "Got it")) + "</button></div>";
    }
    _comfortHtml() {
      return "<div class=\"comfort\" data-act=\"comfort-stop\"><div class=\"breathe\"></div><div class=\"breathe-t\"><span class=\"in\">" + esc(this._t("companion.breathe_in", "Breathe in...")) + "</span><span class=\"out\">" + esc(this._t("companion.breathe_out", "...and out")) + "</span></div><div class=\"comfort-sub\">" + esc(this._t("companion.comfort_sub", "A grown-up knows. Tap to close.")) + "</div></div>";
    }
    _grownupsHtml() {
      const b = (mode, label) => "<button class=\"gu-btn\" data-act=\"gu-mode\" data-id=\"" + mode + "\">" + esc(label) + "</button>";
      return "<div class=\"gu\"><h2>\u{1F512} " + esc(this._t("companion.grownups", "Grown-ups")) + "</h2><p>" + esc(this._t("companion.gu_hint", "For the next hour:")) + "</p><div class=\"gu-row\">"
        + b("bedtime", this._t("companion.gu_bedtime", "Bedtime now")) + b("sleep", this._t("companion.gu_sleep", "Sleep now")) + b("day", this._t("companion.gu_day", "Day")) + b("auto", this._t("companion.gu_auto", "Back to the schedule"))
        + "</div>" + (this._guError ? "<p class=\"gu-err\">" + esc(this._guError) + "</p>" : "") + "<button class=\"gu-close\" data-act=\"gu-close\">✕ " + esc(this._t("companion.close", "Close")) + "</button></div>";
    }
    _css() {
      return [
        ":host{display:block}",
        ".wrap{position:relative;overflow:hidden;box-sizing:border-box;font-family:'Lexend','Atkinson Hyperlegible','Varela Round','Arial Rounded MT',Roboto,Arial,sans-serif;color:#3b352c;background:#fbf4e2;border-radius:var(--ha-card-border-radius,16px);min-height:240px;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}",
        ".wrap *{box-sizing:border-box}",
        ".screen{position:absolute;left:0;top:0;right:0;bottom:0;padding:1em 1.2em}",
        "button{font:inherit;cursor:pointer;border:none}",
        ".center{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}",
        ".center>*{margin:0.25em 0}",
        "h1{font-size:2.4em;margin:0.2em 0;line-height:1.1}",
        ".big-msg{font-size:1.6em}",
        ".clock{line-height:1}",
        ".clock-row{display:flex;align-items:flex-start;justify-content:center}",
        ".clock-time{font-size:6em;font-weight:700;letter-spacing:-0.02em}",
        ".clock-ampm{font-size:1.4em;font-weight:700;margin:0.4em 0 0 0.25em;opacity:0.7}",
        ".clock-date{font-size:1.3em;opacity:0.75;margin-top:0.3em}",
        ".clock-small .clock-time{font-size:2.2em}.clock-small .clock-date{display:none}",
        ".clock-mini{margin-left:auto}.clock-mini .clock-time{font-size:1.6em}.clock-mini .clock-ampm{font-size:0.8em;margin-top:0.2em}.clock-mini .clock-date{display:none}",
        ".clock-big .clock-time{font-size:7em}",
        // night: almost black, warm and dim so it doesn't keep anyone awake
        ".m-sleep{background:#000;color:#b5472a}",
        ".night .clock-time{font-size:7em;color:#c2502e;opacity:0.75}.night .clock-date{color:#7a3a24}.night .clock-ampm{color:#7a3a24}",
        ".night-off{position:absolute;left:0;top:0;right:0;bottom:0;background:#000}",
        ".moon{font-size:2.6em;opacity:0.5}",
        ".stay{display:flex;align-items:center;font-size:1.3em;color:#a8642a}",
        ".stay-dot{display:inline-block;width:0.8em;height:0.8em;border-radius:50%;background:#e08a1e;margin-right:0.5em;box-shadow:0 0 0.8em #e08a1e}",
        ".comfort-btn{margin-top:0.8em;background:#2a1a12;color:#d58a4a;border-radius:2em;padding:0.6em 1.4em;font-size:1.2em}",
        // wake: bright and green - ok to get up
        ".m-wake{background:#e3f6d8}",
        ".sun{font-size:2.4em;line-height:1}",
        ".wake h1{font-size:2em}.wake>*{margin:0.12em 0}.wake .big-btn{margin-top:0.3em}",
        ".ok{font-size:1.4em;font-weight:700;color:#2f7d32}",
        ".weather{display:flex;align-items:center;font-size:1.5em}.w-ico{font-size:1.6em;margin-right:0.3em}.w-temp{font-weight:700;display:flex;flex-direction:column;align-items:flex-start;line-height:1.1}.w-temp small{font-size:0.6em;font-weight:400;opacity:0.75}",
        ".wear{display:flex;flex-wrap:wrap;justify-content:center}.tip{background:#fff;border-radius:1em;padding:0.35em 0.8em;margin:0.2em;font-size:1.1em;font-weight:700}.tip span{margin-right:0.35em}",
        ".big-btn{background:#4caf50;color:#fff;font-size:1.9em;font-weight:800;border-radius:1.4em;padding:0.45em 1.6em;box-shadow:0 0.25em 0 #2f7d32;margin-top:0.4em}",
        ".big-btn:active{-webkit-transform:translateY(0.15em);transform:translateY(0.15em);box-shadow:0 0.1em 0 #2f7d32}",
        ".big-btn.up{background:#f0a030;box-shadow:0 0.25em 0 #b06d10}",
        ".big-btn.small{font-size:1.4em;padding:0.3em 0.75em;margin:0 0 0 0.5em}",
        // routines
        ".m-morning{background:#fff4d6}.m-afternoon{background:#e6f0fb}.m-bedtime{background:#2b2848;color:#efeaff}",
        ".routine{height:100%;display:flex;flex-direction:column}",
        ".r-head{display:flex;align-items:center;font-size:1.2em}",
        ".r-title{font-weight:800;margin-right:0.8em}",
        ".dots i{display:inline-block;width:0.7em;height:0.7em;border-radius:50%;background:rgba(0,0,0,0.15);margin-right:0.3em}.dots i.d{background:#4caf50}.dots i.c{background:#f0a030;width:1em;height:1em;vertical-align:-0.15em}",
        ".m-bedtime .dots i{background:rgba(255,255,255,0.25)}.m-bedtime .dots i.d{background:#7fc97f}.m-bedtime .dots i.c{background:#f0a030}",
        ".r-count{margin-left:0.5em;opacity:0.7;font-weight:700}",
        ".r-body{flex:1;display:flex;align-items:center;min-height:0}",
        ".now{flex:1.4;display:flex;flex-direction:column;align-items:center;text-align:center}",
        ".now-lbl,.then-lbl{font-size:1em;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;opacity:0.6}",
        ".step-ico{font-size:6em;line-height:1.1}",
        ".step-t{font-size:2.4em;font-weight:800;line-height:1.1}",
        ".step-due{font-size:1.2em;opacity:0.75;margin-top:0.2em}",
        ".step-stars{display:inline-block;margin-top:0.3em;background:#fff3c4;color:#8a6100;border-radius:1em;padding:0.15em 0.7em;font-weight:800;font-size:1.2em}",
        ".r-side{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center}",
        ".then{display:flex;flex-direction:column;align-items:center;text-align:center;background:rgba(255,255,255,0.6);border-radius:1.2em;padding:0.6em 1em;margin-top:0.6em;opacity:0.85}",
        ".m-bedtime .then{background:rgba(255,255,255,0.1)}",
        ".then-ico{font-size:2.6em}.then-t{font-size:1.3em;font-weight:700}",
        ".routine .big-btn{align-self:center}",
        // visual timer
        ".vt{position:relative;width:11em;height:11em}.vt svg{width:100%;height:100%}.vt-bg{fill:#fff;stroke:rgba(0,0,0,0.08);stroke-width:2}.vt-arc{fill:#e8554e}",
        ".vt-txt{position:absolute;left:0;right:0;bottom:-2.6em;text-align:center;line-height:1.15}.vt-txt b{display:block;font-size:1.1em}.vt-left{font-size:1.3em;font-weight:800}",
        // day
        ".m-day{background:#fbf4e2}",
        ".day{height:100%;display:flex;align-items:center}",
        ".day-main{flex:1;display:flex;flex-direction:column;align-items:center;text-align:center}",
        ".day-side{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;padding-left:1em}",
        ".vt-row{width:auto;height:auto}.vt-row svg{width:3.6em;height:3.6em;margin-right:0.5em;flex:0 0 auto}.vt-row .vt-txt{position:static;text-align:left}",
        ".card{display:flex;align-items:center;background:#fff;border-radius:1.1em;padding:0.6em 0.8em;margin:0.3em 0;box-shadow:0 0.15em 0 rgba(0,0,0,0.06)}",
        ".m-bedtime .card{background:rgba(255,255,255,0.12)}",
        ".c-ico{font-size:2.2em;margin-right:0.4em}.c-txt{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.15}.c-txt b{font-size:1.3em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.c-txt span{opacity:0.7;font-size:1.05em}",
        ".bed-line{font-size:1.4em;font-weight:700;color:#cfc4ff;margin:0.2em 0}",
        ".stars{display:flex;flex-direction:column;align-items:center;margin-top:0.6em}",
        ".star-count{font-size:2em;font-weight:800}",
        ".goal{display:flex;align-items:center;background:rgba(255,255,255,0.7);border-radius:1em;padding:0.4em 0.8em;margin-top:0.3em;min-width:14em}",
        ".m-bedtime .goal{background:rgba(255,255,255,0.12)}",
        ".goal-ico{font-size:1.8em;margin-right:0.4em}.goal-txt{flex:1;display:flex;flex-direction:column;text-align:left;line-height:1.2}.goal-txt span{font-size:0.95em;opacity:0.75}",
        ".bar{display:block;height:0.55em;background:rgba(0,0,0,0.1);border-radius:1em;overflow:hidden;margin-top:0.2em}.bar i{display:block;height:100%;background:#f0a030;border-radius:1em}",
        ".alldone .party{font-size:5em}.alldone p{font-size:1.5em;margin:0}",
        // My jobs / My rewards
        ".stars[data-act],.card.job{cursor:pointer}",
        ".panel{height:100%;display:flex;flex-direction:column}",
        ".p-head{display:flex;align-items:center;font-size:1.3em;margin-bottom:0.3em}",
        ".p-title{font-weight:800}",
        ".p-list,.rw-grid{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch}",
        ".p-done{opacity:0.6}",
        ".p-empty{font-size:1.8em;font-weight:800;text-align:center;margin-top:1.5em}",
        ".p-note{font-size:1.1em;margin:0.1em 0 0.3em;opacity:0.8}.p-msg{font-weight:800;opacity:1;color:#2f7d32}",
        ".rw-grid{display:flex;flex-wrap:wrap;align-content:flex-start;margin:0 -0.25em}",
        ".rw{position:relative;width:10.5em;margin:0.25em;background:#fff;border-radius:1.1em;padding:0.6em 0.5em;display:flex;flex-direction:column;align-items:center;text-align:center;box-shadow:0 0.15em 0 rgba(0,0,0,0.06)}",
        ".m-bedtime .rw{background:rgba(255,255,255,0.12)}",
        ".rw.hearted{box-shadow:0 0 0 0.18em #4caf50}",
        ".rw-heart{position:absolute;right:0.2em;top:0.2em;background:none;font-size:1.4em;padding:0.1em}",
        ".rw-ico{font-size:2.6em;line-height:1.1}.rw b{font-size:1.15em;line-height:1.15;margin-top:0.15em}.rw-cost{font-size:1em;opacity:0.75;margin:0.15em 0 0.3em}",
        ".rw.locked .rw-ico{opacity:0.55}",
        ".rw-need{width:100%;font-size:0.95em;font-weight:700;opacity:0.85}",
        ".rw-get{background:#4caf50;color:#fff;border-radius:1em;padding:0.35em 1em;font-size:1.15em;font-weight:800;box-shadow:0 0.15em 0 #2f7d32}",
        ".rw-get.sure{background:#f0a030;box-shadow:0 0.15em 0 #b06d10}",
        ".rw-two{display:flex;flex-wrap:wrap;justify-content:center}.rw-two .rw-get{margin:0.15em;padding:0.35em 0.7em;font-size:1.05em}.rw-get.save{background:#7b61c9;box-shadow:0 0.15em 0 #54409a}",
        // My day
        ".md-chips{display:flex;flex-wrap:wrap;margin-bottom:0.3em}.md-chip{background:rgba(255,255,255,0.7);border-radius:1em;padding:0.25em 0.8em;margin:0 0.4em 0.3em 0;font-weight:700;font-size:1.1em}",
        ".m-bedtime .md-chip{background:rgba(255,255,255,0.12)}",
        ".md-list{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch}",
        ".md-row{display:flex;align-items:center;background:#fff;border-radius:1em;padding:0.45em 0.8em;margin:0 0 0.4em;font-size:1.25em}",
        ".m-bedtime .md-row{background:rgba(255,255,255,0.12)}",
        ".md-time{width:5.2em;flex:0 0 auto;font-weight:700;opacity:0.7;font-size:0.85em}.md-ico{font-size:1.5em;margin-right:0.4em}.md-t{flex:1;min-width:0;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
        ".md-row.past{opacity:0.45}.md-row.cur{box-shadow:0 0 0 0.15em #f0a030}.md-row.bed{opacity:0.8}",
        ".md-tag{background:#f0a030;color:#fff;border-radius:1em;padding:0.1em 0.6em;font-size:0.75em;font-weight:800}.md-tick{color:#4caf50;font-weight:900}",
        // Wish list
        ".w-grid{display:flex;flex-wrap:wrap;margin:0 -0.25em}",
        ".wt{position:relative;width:8em;margin:0.25em;background:#fff;border-radius:1.1em;padding:0.5em;display:flex;flex-direction:column;align-items:center;text-align:center;color:inherit;font:inherit;box-shadow:0 0.15em 0 rgba(0,0,0,0.06)}",
        ".m-bedtime .wt{background:rgba(255,255,255,0.12)}",
        ".wt-pic{width:100%;height:3.8em;border-radius:0.8em;background:#f3ecd9 center/cover no-repeat;display:flex;align-items:center;justify-content:center;font-size:2.4em}",
        ".wt b{font-size:1.05em;line-height:1.15;margin:0.3em 0 0.1em;max-height:2.3em;overflow:hidden}",
        ".wt-heart{background:none;font-size:1.4em;padding:0 0.05em}",
        ".wt.add{border:0.15em dashed rgba(0,0,0,0.2);background:none;justify-content:center;min-height:7em}.wt-plus{font-size:2.6em;font-weight:900;color:#f0a030}",
        ".wish-form{display:flex;align-items:center;margin-bottom:0.4em}.wish-input{flex:1;min-width:0;font:inherit;font-size:1.3em;padding:0.4em 0.6em;border-radius:0.8em;border:0.1em solid rgba(0,0,0,0.2);margin-right:0.4em}",
        ".wf-x{background:none;color:inherit;font-size:1.3em;margin-left:0.3em}",
        ".wsec{margin-top:0.5em}.wsec-h{display:flex;justify-content:space-between;width:100%;background:rgba(255,255,255,0.7);color:inherit;border-radius:1em;padding:0.5em 0.9em;font:inherit;font-size:1.2em;font-weight:800}",
        ".m-bedtime .wsec-h{background:rgba(255,255,255,0.12)}.wsec-n{opacity:0.6}",
        // Jobs
        ".jb-prog{margin:0 0 0.4em;font-weight:800;font-size:1.1em}.jb-prog .bar{height:0.6em;margin-top:0.25em}.jb-streak{float:right;color:#9a5b16}",
        ".m-bedtime .jb-streak{color:#ffcf8a}",
        ".wk-row{display:flex;margin:0 -0.15em 0.5em}.wk{flex:1;margin:0 0.15em;background:rgba(255,255,255,0.7);border-radius:0.7em;padding:0.25em 0;text-align:center;line-height:1.15}",
        ".m-bedtime .wk{background:rgba(255,255,255,0.12)}",
        ".wk-d{display:block;font-size:0.8em;opacity:0.7;font-weight:700;text-transform:uppercase}.wk-m{display:block;font-weight:800;font-size:0.95em}",
        ".wk.today{background:#f0a030;color:#fff}.wk.past{opacity:0.6}.wk.earned{opacity:1}",
        ".jb-done{opacity:0.55}.jb-done .jb-done{color:#4caf50;font-weight:900;font-size:1.6em;margin-left:0.4em;opacity:1}",
        ".jb-tm{font-weight:800;font-size:1.2em;margin-left:0.4em;white-space:nowrap}",
        ".big-btn.play{background:#3b82c4;box-shadow:0 0.25em 0 #275d8f}",
        ".p-sub{font-weight:800;font-size:1.1em;margin:0.6em 0 0.2em}",
        ".p-empty.sm{font-size:1.3em;margin:0.6em 0}",
        ".ask-btn{display:block;margin:0.7em auto 0.2em;background:#fff3c4;color:#8a6100;border-radius:1em;padding:0.45em 1.2em;font-size:1.15em;font-weight:800}",
        ".ask{margin-top:0.6em}.ask-input{width:100%;font:inherit;font-size:1.2em;padding:0.4em 0.6em;border-radius:0.8em;border:0.1em solid rgba(0,0,0,0.2)}",
        ".ask-row{display:flex;align-items:center;margin-top:0.4em}.ask-n{background:#fff;color:inherit;border-radius:50%;width:2em;height:2em;font-size:1.2em;font-weight:900}",
        ".ask-stars{font-size:1.3em;font-weight:800;margin:0 0.5em}.ask-row .rw-get{margin-left:auto}",
        // Rewards extras
        ".rw-bank{display:block;font-size:0.95em;font-weight:700;margin:0.1em 0 0.3em}.rw-get.use{background:#3b82c4;box-shadow:0 0.15em 0 #275d8f;font-size:1em}",
        ".shelf{display:flex;flex-wrap:wrap}.trophy{background:rgba(255,255,255,0.7);border-radius:1em;padding:0.25em 0.7em;margin:0 0.3em 0.3em 0;font-weight:700}",
        ".m-bedtime .trophy{background:rgba(255,255,255,0.12)}",
        // Timers
        ".tm-run{display:flex;align-items:center;justify-content:center;margin:0.2em 0 2.8em}.tm-run .vt{width:7em;height:7em}.tm-run .rw-get{margin-left:1.2em}.rw-get.stop{background:#e8554e;box-shadow:0 0.15em 0 #a83a34}",
        ".tm-grid,.rm-grid{display:flex;flex-wrap:wrap;margin:0 -0.25em}",
        ".tm,.rm{width:8em;margin:0.25em;background:#fff;color:inherit;border-radius:1.1em;padding:0.7em 0.5em;display:flex;flex-direction:column;align-items:center;font:inherit;box-shadow:0 0.15em 0 rgba(0,0,0,0.06)}",
        ".m-bedtime .tm,.m-bedtime .rm{background:rgba(255,255,255,0.12)}",
        ".tm-ico,.rm-ico{font-size:2.6em;line-height:1.1}.tm b,.rm b{font-size:1.15em;margin-top:0.2em;max-height:2.3em;overflow:hidden}.tm-min,.rm-st{opacity:0.7;font-weight:700}",
        ".tm.own{border:0.15em dashed rgba(0,0,0,0.2);background:none;box-shadow:none}",
        ".tm-own{background:#fff;border-radius:1.1em;padding:0.6em 0.8em;margin:0 0 0.5em;text-align:center}.tm-own-h{font-weight:800;font-size:1.2em}.tm-own .ask-n{background:rgba(0,0,0,0.07)}",
        ".tm-own-row{display:flex;align-items:center;justify-content:center;margin-top:0.4em}.tm-own-n{font-size:1.8em;font-weight:800;margin:0 0.6em;min-width:4.2em}",
        ".tm-own-quick{display:flex;flex-wrap:wrap;justify-content:center;margin-top:0.3em}.tm-q{background:rgba(0,0,0,0.06);color:inherit;border-radius:1em;padding:0.3em 0.75em;margin:0.15em;font-weight:800;font-size:1.05em}.tm-q.on{background:#f0a030;color:#fff}",
        ".info-row{display:flex;flex-wrap:wrap;justify-content:center;margin-top:0.35em}.info{background:rgba(255,255,255,0.7);border-radius:1em;padding:0.2em 0.7em;margin:0.15em;font-weight:800;font-size:1.1em}.info span{margin-right:0.3em}",
        ".m-bedtime .info{background:rgba(255,255,255,0.12)}",
        ".inf-grid{display:flex;flex-wrap:wrap;margin:0 -0.25em 0.3em}.inf{width:8em;margin:0.25em;background:rgba(255,255,255,0.7);border-radius:1.1em;padding:0.5em;display:flex;flex-direction:column;align-items:center;text-align:center}.inf-ico{font-size:1.8em;line-height:1.1}.inf b{font-size:1.5em}.inf span:last-child{font-size:0.9em;opacity:0.7;max-height:2.3em;overflow:hidden}",
        ".m-bedtime .inf,.m-bedtime .tm-own{background:rgba(255,255,255,0.12)}.tall .inf{width:calc(50% - 0.5em)}",
        ".tm.off{opacity:0.45}.rm.on{background:#fff3c4;box-shadow:0 0 0 0.15em #f0a030}.rm.gone{opacity:0.4}",
        // Screensaver
        ".ssl{display:none;position:absolute;left:0;top:0;right:0;bottom:0;background:#000;color:#fff;overflow:hidden;border-radius:inherit}",
        ".ss-on .ssl{display:block}.ss-on .screen{visibility:hidden}",
        ".ss-media{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;background:#000}",
        ".ss-clock{position:absolute;left:0.8em;bottom:0.6em;text-shadow:0 0.05em 0.3em rgba(0,0,0,0.7)}.ss-clock .clock-time{font-size:3em}",
        // the bar along the bottom
        ".nav{position:absolute;left:0;right:0;bottom:0;height:3.4em;display:none;padding:0 0.6em 0.4em}",
        ".has-nav .nav{display:block}.has-nav .screen{bottom:3.4em}",
        ".nav-in{display:flex;height:100%}",
        ".nav-lbl{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}",
        ".nav-in.many .nav-btn{position:relative;flex-direction:column;font-size:0.8em;margin:0 0.1em;padding:0.1em 0.1em;min-width:0}",
        ".nav-in.many .nav-ico{margin:0;font-size:1.5em;line-height:1.1}.nav-in.many .nav-lbl{max-width:100%}",
        ".nav-in.many .nav-badge{position:absolute;top:0.1em;right:0.3em;margin:0}",
        ".nav-btn{flex:1;margin:0 0.25em;display:flex;align-items:center;justify-content:center;background:none;color:inherit;border-radius:1.2em;font-size:1.15em;font-weight:700;padding:0.25em 0.4em;opacity:0.55}",
        ".nav-btn.on{opacity:1;background:rgba(0,0,0,0.06)}",
        ".m-bedtime .nav-btn.on{background:rgba(255,255,255,0.14)}",
        ".nav-ico{font-size:1.2em;margin-right:0.35em}",
        ".nav-badge{margin-left:0.4em;background:#f0a030;color:#fff;border-radius:1em;padding:0 0.45em;font-size:0.8em;line-height:1.45}",
        ".tiny .nav-lbl{display:none}.tiny .nav-ico{margin-right:0}",
        ".nav-btn{min-width:0}.nav-in.tight .nav-lbl{display:none}.nav-in.tight .nav-ico{margin-right:0}",
        // on top
        ".overlay{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none}",
        ".overlay>*{pointer-events:auto}",
        ".overlay.on{background:rgba(0,0,0,0.25)}",
        ".msg{position:absolute;left:6%;right:6%;top:8%;bottom:8%;background:#fff;border-radius:1.4em;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:1em;box-shadow:0 0.5em 2em rgba(0,0,0,0.3)}",
        ".msg-ico{font-size:3.4em}.msg-t{font-size:2.2em;font-weight:800;line-height:1.15;margin:0.3em 0}.msg-from{font-size:1.2em;opacity:0.7}",
        ".m-sleep .msg{background:#1a1210;color:#d58a4a}",
        ".comfort{position:absolute;left:0;top:0;right:0;bottom:0;background:#0d1426;color:#bcd0ff;display:flex;flex-direction:column;align-items:center;justify-content:center}",
        ".breathe{width:10em;height:10em;border-radius:50%;background:#3b5998;opacity:0.7;-webkit-animation:breathe 10s ease-in-out infinite;animation:breathe 10s ease-in-out infinite}",
        "@-webkit-keyframes breathe{0%,100%{-webkit-transform:scale(0.55)}50%{-webkit-transform:scale(1.15)}}",
        "@keyframes breathe{0%,100%{transform:scale(0.55)}50%{transform:scale(1.15)}}",
        ".breathe-t{position:relative;height:1.6em;width:100%;margin-top:1.2em;font-size:1.6em;text-align:center}",
        ".breathe-t span{position:absolute;left:0;right:0;-webkit-animation:fadeA 10s infinite;animation:fadeA 10s infinite}.breathe-t .out{-webkit-animation-name:fadeB;animation-name:fadeB}",
        "@-webkit-keyframes fadeA{0%,45%{opacity:1}50%,95%{opacity:0}100%{opacity:1}}@keyframes fadeA{0%,45%{opacity:1}50%,95%{opacity:0}100%{opacity:1}}",
        "@-webkit-keyframes fadeB{0%,45%{opacity:0}50%,95%{opacity:1}100%{opacity:0}}@keyframes fadeB{0%,45%{opacity:0}50%,95%{opacity:1}100%{opacity:0}}",
        ".comfort-sub{margin-top:1.2em;font-size:1em;opacity:0.6}",
        ".gu{position:absolute;left:8%;right:8%;top:10%;background:#fff;border-radius:1.2em;padding:1em;text-align:center;box-shadow:0 0.5em 2em rgba(0,0,0,0.3);color:#3b352c}",
        ".gu h2{margin:0 0 0.2em;font-size:1.5em}.gu p{margin:0.2em 0}.gu-row{display:flex;flex-wrap:wrap;justify-content:center;margin:0.4em 0}",
        ".gu-btn{background:#efe6cf;border-radius:1em;padding:0.5em 0.9em;margin:0.25em;font-size:1.1em;font-weight:700;color:#3b352c}",
        ".gu-close{background:none;color:#8c7f6e;font-size:1em;margin-top:0.3em}.gu-err{color:#b5583c}",
        ".burst{position:absolute;left:0;right:0;top:35%;text-align:center;font-size:4em;font-weight:900;color:#f0a030;text-shadow:0 0.05em 0 #fff;pointer-events:none;-webkit-animation:pop 1.8s ease-out forwards;animation:pop 1.8s ease-out forwards}",
        "@-webkit-keyframes pop{0%{opacity:0;-webkit-transform:scale(0.5)}20%{opacity:1;-webkit-transform:scale(1.2)}70%{opacity:1;-webkit-transform:translateY(-0.3em)}100%{opacity:0;-webkit-transform:translateY(-1em)}}",
        "@keyframes pop{0%{opacity:0;transform:scale(0.5)}20%{opacity:1;transform:scale(1.2)}70%{opacity:1;transform:translateY(-0.3em)}100%{opacity:0;transform:translateY(-1em)}}",
        ".sound-chip{position:absolute;right:0.6em;bottom:0.6em;background:rgba(0,0,0,0.6);color:#fff;border-radius:1em;padding:0.4em 0.9em;font-size:1em}",
        // small clocks: one thing at a time
        ".tiny .r-side .then{display:none}.tiny .r-side{flex:0.7}.tiny .day-side .card.cd{display:none}.tiny .goal{min-width:0}",
        // portrait tablets: stack
        ".tall .r-body,.tall .day{flex-direction:column;justify-content:center}.tall .day-side{padding:0.6em 0 0;width:100%}",
        ".tall .wt,.tall .tm,.tall .rm,.tall .rw{width:calc(50% - 0.5em)}.tall .md-time{width:4.6em}.tall .clock-big .clock-time{font-size:5em}",
        ".tall .tm-run{margin-bottom:3.2em}",
        // a phone: the routine's name, dots and clock stay on one line
        ".tall .r-head{font-size:1em}.tall .r-title{white-space:nowrap;margin-right:0.5em}.tall .dots{white-space:nowrap}.tall .dots i{width:0.55em;height:0.55em;margin-right:0.2em}.tall .dots i.c{width:0.75em;height:0.75em}.tall .r-count{margin-left:0.3em}",
        // a phone with every screen on: smaller names under the pictures so they fit; the day screen sits together
        ".tall .nav-in.many .nav-lbl{font-size:0.72em}.tall .nav-in.many .nav-ico{font-size:1.35em}",
        ".tall .day{justify-content:flex-start;padding-top:1em}.tall .day-main{flex:0 0 auto}.tall .day-side{flex:0 0 auto;padding-top:1.2em}",
        // the household's theme on the day screens (and the screens in the bar); night, wake-up, routines and bedtime
        // keep their own colours
        ".themed.m-day{background-color:var(--c-bg);background-image:var(--c-img);background-size:var(--c-img-size);background-position:var(--c-img-pos);color:var(--c-text)}",
        ".themed-font.m-day{font-family:var(--c-font)}",
        ".themed.m-day .tm-own,.themed.m-day .card,.themed.m-day .md-row,.themed.m-day .wt,.themed.m-day .rw,.themed.m-day .tm,.themed.m-day .rm,.themed.m-day .ask-n{background:var(--c-card);color:var(--c-text);box-shadow:0 0 0 1px var(--c-border);-webkit-backdrop-filter:blur(var(--c-blur));backdrop-filter:blur(var(--c-blur))}",
        ".themed.m-day .info,.themed.m-day .inf,.themed.m-day .tm-q,.themed.m-day .goal,.themed.m-day .wk,.themed.m-day .md-chip,.themed.m-day .trophy,.themed.m-day .wsec-h,.themed.m-day .ask-btn{background:var(--c-soft);color:var(--c-text)}",
        ".themed.m-day .wt-pic{background-color:var(--c-soft)}.themed.m-day .vt-bg{fill:var(--c-card);stroke:var(--c-border)}",
        ".themed.m-day .c-txt span,.themed.m-day .clock-date,.themed.m-day .goal-txt span,.themed.m-day .md-time,.themed.m-day .wk-d,.themed.m-day .tm-min,.themed.m-day .rm-st,.themed.m-day .rw-cost,.themed.m-day .wsec-n,.themed.m-day .p-note{color:var(--c-sub);opacity:1}",
        ".themed.m-day .p-msg{color:#2f7d32}.themed.m-day .wk.today .wk-d{color:var(--c-accent-text);opacity:0.85}",
        ".themed.m-day .bar{background:var(--c-soft)}.themed.m-day .bar i{background:var(--c-accent)}",
        ".themed.m-day .tm-q.on,.themed.m-day .wk.today,.themed.m-day .nav-badge,.themed.m-day .md-tag{background:var(--c-accent);color:var(--c-accent-text)}",
        ".themed.m-day .md-row.cur,.themed.m-day .rm.on{box-shadow:0 0 0 0.15em var(--c-accent)}.themed.m-day .rm.on{background:var(--c-soft)}",
        ".themed.m-day .jb-streak,.themed.m-day .wt-plus{color:var(--c-accent)}.themed.m-day .wt.add{border-color:var(--c-border)}",
        ".themed.m-day .nav-btn.on{background:var(--c-card);box-shadow:0 0 0 1px var(--c-border)}",
        ".themed.m-day .wish-input,.themed.m-day .ask-input{background:var(--c-card);color:var(--c-text);border-color:var(--c-border)}",
        // the breathing circle is the comfort itself, so Reduce motion leaves it (slow and gentle)
        ":host([a11y-motion]) .breathe{-webkit-animation:breathe 10s ease-in-out infinite !important;animation:breathe 10s ease-in-out infinite !important}",
        ":host([a11y-motion]) .breathe-t span{-webkit-animation:fadeA 10s infinite !important;animation:fadeA 10s infinite !important}",
        ":host([a11y-motion]) .breathe-t .out{-webkit-animation-name:fadeB !important;animation-name:fadeB !important}",
        // Text size is done in _fit (the whole card is sized in em), not by zooming the card
        ":host([a11y-scale]) .wrap{zoom:1 !important}",
        // Accessibility > Font: the shared kit sets the font on the card; buttons and fields follow it
        ":host([a11y-font]) .wrap{font-family:inherit}",
      ].join("\n");
    }
  }
  customElements.define("family-hub-companion-card", FamilyHubCompanionCard);
  window.FamilyHubCompanionSound = CompanionSound;

  const THEME_FIRST = [{ value: "", label: "Family Hub theme (this device or household)" }, { value: "companion", label: "Companion's own warm colours" }];
  class FamilyHubCompanionCardEditor extends HTMLElement {
    setConfig(config) {
      this._config = Object.assign({}, config || {});
      this._render();
    }
    set hass(hass) {
      this._hass = hass;
      if (!this._people && !this._loading && hass && hass.connection) {
        this._loading = true;
        Promise.all([
          hass.connection.sendMessagePromise({ type: "family_hub/list_users" }).catch(() => null),
          hass.connection.sendMessagePromise({ type: "family_hub/get_settings" }).catch(() => null),
          hass.connection.sendMessagePromise({ type: "theme_builder/list" }).catch(() => null),
        ]).then((res) => {
          const ha = (hass.themes && hass.themes.themes) || {};
          this._themeOptions = THEME_FIRST.concat(((res[2] && res[2].themes) || []).filter((t) => t && t.id).map((t) => ({ value: t.id, label: "Theme Builder: " + (t.name || t.id) })))
            .concat([{ value: "ha:__default__", label: "Home Assistant: Default" }])
            .concat(Object.keys(ha).filter((n) => n.indexOf("Theme Builder - ") !== 0).sort().map((n) => ({ value: "ha:" + n, label: "Home Assistant: " + n })));
          const cur = this._config && this._config.theme_override;
          if (cur && !this._themeOptions.some((o) => o.value === cur)) this._themeOptions.push({ value: cur, label: cur + " (not found)" });
          const users = (res[0] && res[0].users) || [];
          const settings = (res[1] && res[1].settings) || {};
          const members = Array.isArray(settings.memberUserIds) && settings.memberUserIds.length ? settings.memberUserIds : null;
          const profiles = settings.userProfiles || {};
          this._people = [{ value: "me", label: "Whoever is signed in" }].concat(
            users.filter((u) => u && u.id && (!members || members.indexOf(u.id) >= 0))
              .sort((a, b) => (!!(profiles[b.id] || {}).isChildAccount - !!(profiles[a.id] || {}).isChildAccount))
              .map((u) => ({ value: u.id, label: u.name + ((profiles[u.id] || {}).isChildAccount ? " (child)" : "") })));
          this._render();
        });
      }
      if (this._form) this._form.hass = hass;
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
      if (this._hass) this._form.hass = this._hass;
      this._form.schema = [
        { name: "person", selector: { select: { mode: "dropdown", options: this._people || [{ value: "me", label: "Whoever is signed in" }] } } },
        { name: "button_entity", selector: { entity: { domain: ["event", "input_button", "button", "binary_sensor", "switch", "input_boolean", "sensor"] } } },
        { name: "height", selector: { text: {} } },
        { name: "clock_seconds", selector: { boolean: {} } },
        { name: "theme_override", selector: { select: { mode: "dropdown", options: this._themeOptions || THEME_FIRST } } },
      ];
      this._form.data = Object.assign({ person: "me", height: "100vh", clock_seconds: false, theme_override: "" }, this._config || {});
      this._form.computeLabel = (s) => ({ person: "Child", button_entity: "Physical button (optional)", height: "Height", clock_seconds: "Show seconds", theme_override: "Theme" })[s.name];
      this._form.computeHelper = (s) => ({
        person: "Whose Companion this is. Their wake-up, bedtime, sounds and room light are set in Family Hub Settings > Users > their profile > Companion.",
        button_entity: "A button by the bed: pressing it does what the big button on screen does (Done, Got it, I'm up). At night it starts the comfort breathing.",
        height: "100vh fills the space left on the screen below the dashboard's header (best in a Panel view). Or a fixed size like 480px.",
        theme_override: "Colours for the day screens. Night, wake-up and routines keep their own colours. E-ink and Accessibility follow Family Hub Settings for this device.",
      })[s.name];
    }
  }
  if (!customElements.get("family-hub-companion-card-editor")) customElements.define("family-hub-companion-card-editor", FamilyHubCompanionCardEditor);

  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === "family-hub-companion-card")) {
    window.customCards.push({
      type: "family-hub-companion-card",
      name: "Family Hub Companion",
      description: "A child's bedside screen: wake-up, routines one step at a time, timers, stars, messages and a comfort button.",
      preview: false,
    });
  }
})();
