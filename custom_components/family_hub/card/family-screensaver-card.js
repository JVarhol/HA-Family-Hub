/* FH-SS-ENGINE START - the screensaver's widgets, shared word for word by the calendar card and the
   standalone Screen Saver card (tools/sync_ss_engine.py copies tools/ss_engine.js into both; a test checks they match).
   Whichever card loads first defines window.FamilyHubScreensaver; a newer copy replaces an older one.

   Widgets are placed by anchor (one of 9 spots on the screen) and size (S/M/L/XL), not by a box in percent, so the same
   layout works on a landscape TV, a portrait tablet or a square frame: sizes scale with the screen's shorter side and
   widgets in the same spot stack. Clock, weather, next-up, entity, camera and text are drawn here, straight on the
   picture; any Lovelace card still works as a "card" widget. */
(function () {
const ENGINE_VERSION = 4;
if (window.FamilyHubScreensaver && window.FamilyHubScreensaver.version >= ENGINE_VERSION) return;

const ANCHORS = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"];
const SIZES = { s: 0.7, m: 1, l: 1.4, xl: 2 };
const KINDS = ["clock", "weather", "clockweather", "nextup", "entity", "camera", "text", "card"];
const TOGGLE_DOMAINS = ["switch", "light", "fan", "input_boolean", "cover", "siren", "humidifier", "automation", "script"];
const esc = (s) => String(s === undefined || s === null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const newId = () => `sw-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const isDate = (d) => d && typeof d.getTime === "function" && !isNaN(d.getTime());

// -- the stored shape -------------------------------------------------------------------------------------------
// { id, kind, anchor, size, color ("auto" | "light" | "dark"), config: { type: "fh-<kind>", ...options }, transparent }
// config.type stays a non-empty string so older card versions that require one keep the widget instead of dropping it.
function legacyKind(cfg) {
  const t = cfg && cfg.type;
  if (t === "clock") return { kind: "clock", config: { style: "digits", seconds: !!cfg.show_seconds, date: false, format: cfg.time_format === "12" || cfg.time_format === "24" ? cfg.time_format : "auto" }, color: cfg.fh_style === "digits" && !cfg.fh_adaptive_color ? "light" : "auto" };
  if ((t === "weather-forecast" || t === "weather") && cfg.entity) return { kind: "weather", config: { entity: cfg.entity, show: "hilo" } };
  if (t === "markdown") return { kind: "text", config: { text: String(cfg.content || "").replace(/[#*_`>]/g, "").trim() } };
  return { kind: "card", config: { card: cfg } };
}
function anchorFromBox(w) {
  const num = (v, d) => (Number.isFinite(+v) ? +v : d);
  const x = num(w.x, 5), y = num(w.y, 5), ww = num(w.w, 30), hh = num(w.h, 20);
  const cx = x + ww / 2, cy = y + hh / 2;
  const col = cx < 100 / 3 ? "l" : cx < 200 / 3 ? "c" : "r";
  const row = cy < 100 / 3 ? "t" : cy < 200 / 3 ? "m" : "b";
  const size = hh < 12 ? "s" : hh < 25 ? "m" : hh < 40 ? "l" : "xl";
  return { anchor: row + col, size };
}
function normalizeWidget(w) {
  if (!w || typeof w !== "object") return null;
  let kind = KINDS.includes(w.kind) ? w.kind : null;
  let config = w.config && typeof w.config === "object" ? JSON.parse(JSON.stringify(w.config)) : {};
  let color = w.color;
  let anchor = w.anchor, size = w.size;
  if (!kind) {
    if (!config.type) return null;
    const mapped = legacyKind(config);
    kind = mapped.kind; config = mapped.config;
    if (!color && mapped.color) color = mapped.color;
    const placed = anchorFromBox(w);
    anchor = anchor || placed.anchor; size = size || placed.size;
  }
  if (kind === "card" && !(config.card && typeof config.card === "object" && config.card.type)) return null;
  config.type = "fh-" + kind;
  return {
    id: typeof w.id === "string" && w.id ? w.id : newId(),
    kind,
    anchor: ANCHORS.includes(anchor) ? anchor : "bl",
    size: SIZES[size] ? size : "m",
    color: color === "light" || color === "dark" ? color : "auto",
    config,
    transparent: !!w.transparent,
  };
}
function normalizeWidgets(list) {
  return (Array.isArray(list) ? list : []).map(normalizeWidget).filter(Boolean);
}
function normalizeOptions(ss) {
  ss = ss && typeof ss === "object" ? ss : {};
  const n = ss.night && typeof ss.night === "object" ? ss.night : {};
  const hhmm = (v, d) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : d);
  const dim = Number.isFinite(+n.dim) ? Math.min(100, Math.max(10, Math.round(+n.dim))) : 35;
  return {
    drift: ss.drift !== false,
    scrim: ss.scrim !== false,
    night: { enabled: !!n.enabled, start: hhmm(n.start, "22:00"), end: hhmm(n.end, "06:30"), dim, red: n.red !== false },
  };
}
function defaultConfig(kind) {
  switch (kind) {
    case "clock": return { type: "fh-clock", style: "digits", seconds: false, date: true, format: "auto" };
    case "weather": return { type: "fh-weather", entity: "", show: "hilo" };
    case "clockweather": return { type: "fh-clockweather", entity: "", format: "auto" };
    case "nextup": return { type: "fh-nextup", count: 2, calendars: [] };
    case "entity": return { type: "fh-entity", entity: "", name: "", tap: false };
    case "camera": return { type: "fh-camera", entity: "", trigger: "", hold: 30 };
    case "text": return { type: "fh-text", text: "" };
    default: return { type: "fh-card", card: { type: "markdown", content: "" } };
  }
}
const DEFAULT_ANCHOR = { clock: "bl", weather: "tr", clockweather: "bl", nextup: "br", entity: "tl", camera: "tr", text: "tc", card: "br" };

// -- time and text ----------------------------------------------------------------------------------------------
function locale(hass) { return (hass && hass.locale && hass.locale.language) || (hass && hass.language) || "en"; }
function hour12For(hass, fmt) {
  if (fmt === "12") return true;
  if (fmt === "24") return false;
  const tf = hass && hass.locale && hass.locale.time_format;
  if (tf === "24") return false;
  if (tf === "12") return true;
  try { return new Intl.DateTimeFormat(locale(hass), { hour: "numeric" }).resolvedOptions().hour12 !== false; } catch (e) { return true; }
}
function timeParts(hass, date, fmt, seconds) {
  const opts = { hour: "numeric", minute: "2-digit", hour12: hour12For(hass, fmt) };
  if (seconds) opts.second = "2-digit";
  const out = { h: "", m: "", s: "", ap: "" };
  try {
    new Intl.DateTimeFormat(locale(hass), opts).formatToParts(date).forEach((p) => {
      if (p.type === "hour") out.h = p.value;
      else if (p.type === "minute") out.m = p.value;
      else if (p.type === "second") out.s = p.value;
      else if (p.type === "dayPeriod") out.ap = p.value;
    });
  } catch (e) {
    out.h = String(date.getHours()); out.m = String(date.getMinutes()).padStart(2, "0");
  }
  return out;
}
function fmtTime(hass, date) {
  try { return new Intl.DateTimeFormat(locale(hass), { hour: "numeric", minute: "2-digit", hour12: hour12For(hass, "auto") }).format(date); } catch (e) { return date.toLocaleTimeString(); }
}
function fmtDate(hass, date, opts) {
  try { return new Intl.DateTimeFormat(locale(hass), opts).format(date); } catch (e) { return date.toDateString(); }
}
const WEATHER_ICONS = {
  "clear-night": "mdi:weather-night", cloudy: "mdi:weather-cloudy", exceptional: "mdi:alert-circle-outline", fog: "mdi:weather-fog",
  hail: "mdi:weather-hail", lightning: "mdi:weather-lightning", "lightning-rainy": "mdi:weather-lightning-rainy", partlycloudy: "mdi:weather-partly-cloudy",
  pouring: "mdi:weather-pouring", rainy: "mdi:weather-rainy", snowy: "mdi:weather-snowy", "snowy-rainy": "mdi:weather-snowy-rainy",
  sunny: "mdi:weather-sunny", windy: "mdi:weather-windy", "windy-variant": "mdi:weather-windy-variant",
};
const WEATHER_EMOJI = { "clear-night": "🌙", cloudy: "☁️", fog: "🌫️", hail: "🌨️", lightning: "🌩️", "lightning-rainy": "⛈️", partlycloudy: "⛅", pouring: "🌧️", rainy: "🌦️", snowy: "❄️", "snowy-rainy": "🌨️", sunny: "☀️", windy: "💨", "windy-variant": "💨", exceptional: "⚠️" };
function iconHtml(icon, emoji) {
  if (window.customElements && window.customElements.get("ha-icon")) return `<ha-icon icon="${esc(icon)}"></ha-icon>`;
  return `<span class="fh-ss-emoji">${emoji || "•"}</span>`;
}
const WEATHER_WORDS = { "clear-night": "Clear", cloudy: "Cloudy", exceptional: "Exceptional", fog: "Fog", hail: "Hail", lightning: "Lightning", "lightning-rainy": "Thunderstorms",
  partlycloudy: "Partly cloudy", pouring: "Pouring", rainy: "Rainy", snowy: "Snowy", "snowy-rainy": "Sleet", sunny: "Sunny", windy: "Windy", "windy-variant": "Windy" };
function stateText(hass, st) {
  if (!st) return "";
  try { if (hass && typeof hass.formatEntityState === "function") return hass.formatEntityState(st); } catch (e) { /* older HA */ }
  if (st.entity_id && st.entity_id.startsWith("weather.") && WEATHER_WORDS[st.state]) return WEATHER_WORDS[st.state];
  const unit = st.attributes && st.attributes.unit_of_measurement;
  const v = unit ? `${st.state} ${unit}` : st.state;
  return /^[a-z]/.test(v) ? v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, " ") : v;
}
function friendly(hass, id) {
  const st = hass && hass.states && hass.states[id];
  return (st && st.attributes && st.attributes.friendly_name) || id || "";
}
function tempText(v, hass, st) {
  if (v === undefined || v === null || v === "") return "";
  const unit = (st && st.attributes && st.attributes.temperature_unit) || (hass && hass.config && hass.config.unit_system && hass.config.unit_system.temperature) || "°";
  return `${Math.round(+v)}${unit === "°C" || unit === "°F" ? "°" : unit}`;
}

// -- people, for Next up's faces --------------------------------------------------------------------------------
function personPictureFor(hass, settings, calendarEntity) {
  if (!settings || settings.discreetModeEnabled || settings.showPersonPictures === false) return "";
  const states = (hass && hass.states) || {};
  const profiles = settings.userProfiles || {};
  let ent = "";
  for (const uid of Object.keys(profiles)) {
    const p = profiles[uid];
    if (!p || p.primaryCalendar !== calendarEntity) continue;
    ent = typeof p.presenceEntity === "string" && p.presenceEntity.startsWith("person.") ? p.presenceEntity
      : (Object.keys(states).find((id) => id.startsWith("person.") && states[id].attributes && states[id].attributes.user_id === uid) || "");
    break;
  }
  const pic = ent && states[ent] && states[ent].attributes && states[ent].attributes.entity_picture;
  if (!pic || typeof pic !== "string") return "";
  return typeof hass.hassUrl === "function" ? hass.hassUrl(pic) : pic;
}
function cssUrl(u) { return String(u).replace(/["'()\\\s]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")); }

// -- styles -----------------------------------------------------------------------------------------------------
const CSS = `
.fh-ss-layer { position: absolute; inset: 0; pointer-events: none; overflow: hidden; --u: 10px; color: #fff;
  font-family: var(--fh-ss-font, "Inter", "SF Pro Display", -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif);
  -webkit-font-smoothing: antialiased; transition: opacity 1.2s ease; }
.fh-ss-layer.fh-ss-hidden { opacity: 0; }
.fh-ss-veil { position: absolute; inset: 0; background: #000; opacity: 0; transition: opacity 2s ease; }
.fh-ss-scrim { position: absolute; inset: 0; transition: background 1s ease; }
.fh-ss-drift { position: absolute; inset: 0; transition: transform 3s ease-in-out; }
.fh-ss-still .fh-ss-drift, .fh-ss-still .fh-ss-drift * { animation: none !important; transition: none !important; }
.fh-ss-zone { position: absolute; display: flex; flex-direction: column; gap: calc(var(--u) * 2.4); width: max-content; }
.fh-ss-zone.z-tl, .fh-ss-zone.z-tc, .fh-ss-zone.z-tr { top: calc(var(--u) * 5); }
.fh-ss-zone.z-bl, .fh-ss-zone.z-bc, .fh-ss-zone.z-br { bottom: calc(var(--u) * 5); }
.fh-ss-zone.z-tl, .fh-ss-zone.z-ml, .fh-ss-zone.z-bl { left: calc(var(--u) * 5); align-items: flex-start; text-align: left; }
.fh-ss-zone.z-tr, .fh-ss-zone.z-mr, .fh-ss-zone.z-br { right: calc(var(--u) * 5); align-items: flex-end; text-align: right; }
.fh-ss-zone.z-tc, .fh-ss-zone.z-mc, .fh-ss-zone.z-bc { left: 50%; transform: translateX(-50%); align-items: center; text-align: center; }
.fh-ss-zone.z-ml, .fh-ss-zone.z-mr { top: 50%; transform: translateY(-50%); }
.fh-ss-zone.z-mc { top: 50%; transform: translate(-50%, -50%); }
.fh-ss-w { --k: 1; position: relative; line-height: 1.1; color: var(--fh-ss-fg, #fff);
  text-shadow: 0 1px 2px var(--fh-ss-sh1, rgba(0,0,0,0.35)), 0 0 calc(var(--u) * 2.4) var(--fh-ss-sh2, rgba(0,0,0,0.28)); transition: color 1.5s ease, opacity 0.8s ease; }
.fh-ss-w.c-dark { --fh-ss-fg: #15171a; --fh-ss-sh1: rgba(255,255,255,0.45); --fh-ss-sh2: rgba(255,255,255,0.35); }
.fh-ss-layer.night .fh-ss-w.night-red { --fh-ss-fg: #ff4a3d; --fh-ss-sh1: rgba(0,0,0,0.5); --fh-ss-sh2: rgba(0,0,0,0); opacity: 0.85; }
.fh-ss-w ha-icon { --mdc-icon-size: 100%; width: 1em; height: 1em; display: inline-flex; filter: drop-shadow(0 1px 2px var(--fh-ss-sh1, rgba(0,0,0,0.35))); }
.fh-ss-emoji { font-size: 0.9em; line-height: 1; }
.fh-ss-time { font-size: calc(var(--u) * 17 * var(--k)); font-weight: 200; letter-spacing: -0.035em; font-variant-numeric: tabular-nums; line-height: 0.95; white-space: nowrap; }
.fh-ss-time .colon { display: inline-block; animation: fhSsBlink 2s ease-in-out infinite; margin: 0 -0.02em; position: relative; top: -0.06em; }
.fh-ss-time .ap { font-size: 0.28em; font-weight: 400; letter-spacing: 0.02em; margin-left: 0.18em; vertical-align: 0.12em; opacity: 0.85; }
.fh-ss-time .sec { font-size: 0.36em; font-weight: 300; margin-left: 0.12em; opacity: 0.75; }
@keyframes fhSsBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.fh-ss-date { font-size: calc(var(--u) * 3.6 * var(--k)); font-weight: 400; opacity: 0.92; margin-top: calc(var(--u) * 1.2 * var(--k)); letter-spacing: 0.01em; white-space: nowrap; }
.fh-ss-clock.st-stacked .fh-ss-time { font-size: calc(var(--u) * 14 * var(--k)); }
.fh-ss-clock.st-stacked .fh-ss-weekday { font-size: calc(var(--u) * 3 * var(--k)); text-transform: uppercase; letter-spacing: 0.28em; font-weight: 600; opacity: 0.9; margin-bottom: calc(var(--u) * 0.8 * var(--k)); }
.fh-ss-clock.st-minimal { font-size: calc(var(--u) * 6.5 * var(--k)); font-weight: 300; white-space: nowrap; }
.fh-ss-clock.st-minimal .dot { opacity: 0.6; margin: 0 0.3em; }
.fh-ss-analog { width: calc(var(--u) * 26 * var(--k)); height: calc(var(--u) * 26 * var(--k)); filter: drop-shadow(0 1px 3px var(--fh-ss-sh1, rgba(0,0,0,0.35))); }
.fh-ss-analog line, .fh-ss-analog circle { stroke: var(--fh-ss-fg, #fff); }
.fh-ss-analog .hand-s { stroke: #ff6b4a; }
.fh-ss-weather { display: flex; flex-direction: column; }
.fh-ss-wx-now { display: flex; align-items: center; gap: calc(var(--u) * 1.6 * var(--k)); white-space: nowrap; }
.z-tr .fh-ss-wx-now, .z-mr .fh-ss-wx-now, .z-br .fh-ss-wx-now { flex-direction: row-reverse; }
.z-tc .fh-ss-wx-now, .z-mc .fh-ss-wx-now, .z-bc .fh-ss-wx-now { justify-content: center; }
.fh-ss-wx-icon { font-size: calc(var(--u) * 8 * var(--k)); display: inline-flex; }
.fh-ss-wx-temp { font-size: calc(var(--u) * 10 * var(--k)); font-weight: 200; letter-spacing: -0.03em; line-height: 1; }
.fh-ss-wx-cond { font-size: calc(var(--u) * 3.2 * var(--k)); opacity: 0.92; margin-top: calc(var(--u) * 0.6 * var(--k)); white-space: nowrap; }
.fh-ss-wx-hilo { font-size: calc(var(--u) * 2.8 * var(--k)); opacity: 0.8; margin-top: calc(var(--u) * 0.4 * var(--k)); white-space: nowrap; }
.fh-ss-wx-days { display: flex; gap: calc(var(--u) * 3.2 * var(--k)); margin-top: calc(var(--u) * 1.6 * var(--k)); }
.fh-ss-wx-day { display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 0.5 * var(--k)); font-size: calc(var(--u) * 2.6 * var(--k)); }
.fh-ss-wx-day .ic { font-size: calc(var(--u) * 4.4 * var(--k)); display: inline-flex; }
.fh-ss-wx-day .name { text-transform: uppercase; letter-spacing: 0.14em; font-weight: 600; opacity: 0.85; font-size: 0.85em; }
.fh-ss-wx-day .lo { opacity: 0.65; margin-left: 0.4em; }
.fh-ss-cw-line { font-size: calc(var(--u) * 3.6 * var(--k)); margin-top: calc(var(--u) * 1.2 * var(--k)); display: flex; align-items: center; gap: 0.45em; white-space: nowrap; opacity: 0.95; }
.z-tc .fh-ss-cw-line, .z-mc .fh-ss-cw-line, .z-bc .fh-ss-cw-line { justify-content: center; }
.z-tr .fh-ss-cw-line, .z-mr .fh-ss-cw-line, .z-br .fh-ss-cw-line { justify-content: flex-end; }
.fh-ss-cw-line .ic { display: inline-flex; font-size: 1.15em; }
.fh-ss-cw-line .dot { opacity: 0.55; }
.fh-ss-next { display: flex; flex-direction: column; gap: calc(var(--u) * 1.5 * var(--k)); }
.fh-ss-next-head { font-size: calc(var(--u) * 2.2 * var(--k)); text-transform: uppercase; letter-spacing: 0.24em; font-weight: 700; opacity: 0.75; }
.fh-ss-next-row { display: flex; align-items: center; gap: calc(var(--u) * 1.4 * var(--k)); }
.z-tr .fh-ss-next-row, .z-mr .fh-ss-next-row, .z-br .fh-ss-next-row { flex-direction: row-reverse; }
.fh-ss-face { width: calc(var(--u) * 5.2 * var(--k)); height: calc(var(--u) * 5.2 * var(--k)); border-radius: 50%; flex: 0 0 auto; background-size: cover; background-position: center;
  box-shadow: 0 0 0 calc(var(--u) * 0.3) rgba(255,255,255,0.75), 0 1px 4px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; font-size: calc(var(--u) * 2.4 * var(--k)); font-weight: 700; color: #fff; text-shadow: none; }
.fh-ss-next-title { font-size: calc(var(--u) * 3.6 * var(--k)); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: calc(var(--u) * 60); }
.fh-ss-next-when { font-size: calc(var(--u) * 2.7 * var(--k)); opacity: 0.82; white-space: nowrap; }
.fh-ss-next-when .now { color: #5be38d; font-weight: 700; }
.c-dark .fh-ss-next-when .now { color: #12803f; }
.fh-ss-entity { display: flex; align-items: center; gap: calc(var(--u) * 1.6 * var(--k)); }
.z-tr .fh-ss-entity, .z-mr .fh-ss-entity, .z-br .fh-ss-entity { flex-direction: row-reverse; }
.fh-ss-entity .ic { font-size: calc(var(--u) * 5.4 * var(--k)); display: inline-flex; width: 1em; height: 1em; transition: color 0.4s ease, filter 0.4s ease; }
.fh-ss-entity.is-on .ic { color: #ffd36b; filter: drop-shadow(0 0 calc(var(--u) * 1.4) rgba(255, 200, 80, 0.65)); }
.fh-ss-entity .name { font-size: calc(var(--u) * 2.5 * var(--k)); opacity: 0.8; text-transform: uppercase; letter-spacing: 0.16em; font-weight: 600; white-space: nowrap; }
.fh-ss-entity .state { font-size: calc(var(--u) * 4.6 * var(--k)); font-weight: 300; white-space: nowrap; }
.fh-ss-w.tappable { pointer-events: auto; cursor: pointer; }
.fh-ss-w.tappable:active { transform: scale(0.97); }
.fh-ss-camera { width: calc(var(--u) * 36 * var(--k)); aspect-ratio: 16 / 9; border-radius: calc(var(--u) * 1.8); overflow: hidden; background: rgba(0,0,0,0.4);
  box-shadow: 0 calc(var(--u) * 0.8) calc(var(--u) * 4) rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.18); transition: opacity 0.8s ease, transform 0.8s ease; }
.fh-ss-camera img { width: 100%; height: 100%; object-fit: cover; display: block; }
.fh-ss-camera .cap { position: absolute; left: calc(var(--u) * 1.2); bottom: calc(var(--u) * 1); font-size: calc(var(--u) * 2.2 * var(--k)); font-weight: 600; letter-spacing: 0.06em; }
.fh-ss-w.cam-waiting { opacity: 0; transform: translateY(calc(var(--u) * 2)); height: 0; margin: 0; overflow: hidden; }
.fh-ss-text { font-size: calc(var(--u) * 4 * var(--k)); font-weight: 400; white-space: pre-line; max-width: calc(var(--u) * 70); }
.fh-ss-card { width: calc(var(--u) * 40 * var(--k)); pointer-events: auto; }
.fh-ss-card.transparent { --ha-card-background: transparent; --card-background-color: transparent; --ha-card-box-shadow: none; --ha-card-border-width: 0; }
.fh-ss-zone .fh-ss-w { animation: fhSsIn 1.2s ease both; }
@keyframes fhSsIn { from { opacity: 0; transform: translateY(calc(var(--u) * 1.2)); } to { opacity: 1; transform: none; } }
.fh-ss-layer.preview .fh-ss-w { pointer-events: auto; cursor: grab; outline: 1px dashed transparent; outline-offset: calc(var(--u) * 0.8); border-radius: 4px; }
.fh-ss-layer.preview .fh-ss-w:hover, .fh-ss-layer.preview .fh-ss-w.selected { outline-color: rgba(255,255,255,0.85); }
.fh-ss-layer.preview .fh-ss-w.c-dark:hover, .fh-ss-layer.preview .fh-ss-w.c-dark.selected { outline-color: rgba(0,0,0,0.7); }
.fh-ss-layer.preview .fh-ss-w.dragging { opacity: 0.35; }
.fh-ss-layer.preview .fh-ss-w.cam-waiting { opacity: 0.55; height: auto; transform: none; }
.fh-ss-layer.preview .fh-ss-card { pointer-events: none; }
.fh-ss-drops { position: absolute; inset: 0; display: none; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); gap: 4px; padding: 4px; pointer-events: none; }
.fh-ss-drops.on { display: grid; }
.fh-ss-drops > div { border: 2px dashed rgba(255,255,255,0.45); border-radius: 8px; background: rgba(255,255,255,0.06); }
.fh-ss-drops > div.hot { border-color: #fff; background: rgba(255,255,255,0.22); }
`;

// -- the widget layer -------------------------------------------------------------------------------------------
class Layer {
  constructor(parent, opts) {
    this.opts = opts || {};
    this.parent = parent;
    this.el = document.createElement("div");
    this.el.className = "fh-ss-layer" + (this.opts.preview ? " preview" : "");
    this.el.innerHTML = `<style>${CSS}</style><div class="fh-ss-veil"></div><div class="fh-ss-scrim"></div><div class="fh-ss-drift">${ANCHORS.map((a) => `<div class="fh-ss-zone z-${a}" data-zone="${a}"></div>`).join("")}</div>`;
    this._applyStill();
    parent.appendChild(this.el);
    this.zones = {};
    this.el.querySelectorAll(".fh-ss-zone").forEach((z) => { this.zones[z.dataset.zone] = z; });
    this.items = {};
    this.ctx = {};
    this._measure = () => {
      const r = this.el.getBoundingClientRect();
      const u = Math.max(2, Math.min(r.width || 0, r.height || 0) / 100) || 10;
      this.el.style.setProperty("--u", `${u}px`);
      if (this.zones) requestAnimationFrame(() => this.fit());
    };
    if (window.ResizeObserver) { this._ro = new ResizeObserver(this._measure); this._ro.observe(this.el); }
    else window.addEventListener("resize", this._measure);
    this._measure();
  }
  update(ctx) {
    this.ctx = Object.assign({}, this.ctx, ctx);
    const hass = this.ctx.hass;
    const hidden = this.ctx.hiddenIds || [];
    const widgets = normalizeWidgets(this.ctx.widgets).filter((w) => !hidden.includes(w.id));
    const seen = {};
    widgets.forEach((w) => {
      seen[w.id] = true;
      let item = this.items[w.id];
      const key = JSON.stringify([w.kind, w.config, w.transparent]);
      if (!item || item.key !== key) {
        if (item) this._destroyItem(item);
        item = { w, key, el: document.createElement("div"), state: {} };
        item.el.dataset.wid = w.id;
        this.items[w.id] = item;
        this._build(item);
      }
      item.w = w;
      item.el.className = `fh-ss-w fh-ss-k-${w.kind}` + (item.extraClass || "");
      item.el.style.setProperty("--k", SIZES[w.size]);
      const zone = this.zones[w.anchor];
      if (item.el.parentNode !== zone) zone.appendChild(item.el);
      zone.appendChild(item.el); // keeps list order inside the zone
      this._refresh(item, hass);
    });
    Object.keys(this.items).forEach((id) => { if (!seen[id]) { this._destroyItem(this.items[id]); delete this.items[id]; } });
    this.applyColors();
    this._applyNight();
    this.fit();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.fit()).catch(() => {});
  }
  // -- each kind
  _build(item) {
    const { w, el } = item;
    const c = w.config;
    item.extraClass = "";
    if (w.kind === "clock" || w.kind === "clockweather") {
      el.innerHTML = c.style === "analog" && w.kind === "clock"
        ? `<svg class="fh-ss-analog" viewBox="0 0 100 100"><circle cx="50" cy="50" r="47" fill="none" stroke-width="1.6" opacity="0.55"/>${Array.from({ length: 12 }, (_, i) => { const a = (i * Math.PI) / 6; const r1 = i % 3 ? 40 : 36; return `<line x1="${50 + r1 * Math.sin(a)}" y1="${50 - r1 * Math.cos(a)}" x2="${50 + 44 * Math.sin(a)}" y2="${50 - 44 * Math.cos(a)}" stroke-width="${i % 3 ? 1.4 : 2.6}" stroke-linecap="round"/>`; }).join("")}<line class="hand-h" x1="50" y1="50" x2="50" y2="27" stroke-width="4.2" stroke-linecap="round"/><line class="hand-m" x1="50" y1="50" x2="50" y2="14" stroke-width="2.6" stroke-linecap="round"/>${c.seconds ? '<line class="hand-s" x1="50" y1="58" x2="50" y2="10" stroke-width="1.1" stroke-linecap="round"/>' : ""}<circle cx="50" cy="50" r="2.6" fill="currentColor" stroke-width="0"/></svg><div class="fh-ss-date"></div>`
        : `<div class="fh-ss-weekday"></div><div class="fh-ss-time"></div><div class="fh-ss-date"></div>${w.kind === "clockweather" ? '<div class="fh-ss-cw-line"></div>' : ""}`;
      item.extraClass = ` fh-ss-clock st-${w.kind === "clockweather" ? "digits" : c.style || "digits"} night-red`;
      if (w.kind === "clockweather") this._subscribeForecast(item);
    } else if (w.kind === "weather") {
      el.innerHTML = `<div class="fh-ss-weather"></div>`;
      this._subscribeForecast(item);
    } else if (w.kind === "nextup") {
      el.innerHTML = `<div class="fh-ss-next"></div>`;
      item.state.events = null;
      this._fetchNext(item);
      item.state.timer = setInterval(() => { if (this._timer || this.opts.preview) this._fetchNext(item); }, 5 * 60000);
    } else if (w.kind === "entity") {
      el.innerHTML = `<div class="fh-ss-entity"><span class="ic"></span><div><div class="name"></div><div class="state"></div></div></div>`;
      if (c.tap && !this.opts.preview) {
        const stop = (e) => { e.stopPropagation(); };
        el.addEventListener("pointerdown", stop);
        el.addEventListener("click", (e) => { e.stopPropagation(); this._toggle(item); });
        el.addEventListener("touchstart", stop, { passive: true });
      }
    } else if (w.kind === "camera") {
      el.innerHTML = `<div class="fh-ss-camera"><img alt=""><div class="cap"></div></div>`;
      item.state.timer = setInterval(() => this._refreshCamera(item, false), 3000);
    } else if (w.kind === "text") {
      el.innerHTML = `<div class="fh-ss-text"></div>`;
    } else if (w.kind === "card") {
      el.innerHTML = `<div class="fh-ss-card${w.transparent ? " transparent" : ""}"></div>`;
      this._mountCard(item);
    }
  }
  _refresh(item, hass) {
    const { w, el } = item;
    const c = w.config;
    if (w.kind === "clock" || w.kind === "clockweather") this._tickClock(item);
    else if (w.kind === "weather") this._renderWeather(item, hass);
    else if (w.kind === "nextup") this._renderNext(item);
    else if (w.kind === "entity") {
      const st = hass && hass.states && hass.states[c.entity];
      const box = el.querySelector(".fh-ss-entity");
      const icEl = el.querySelector(".ic");
      const domain = String(c.entity || "").split(".")[0];
      const on = st && ["on", "open", "unlocked", "playing", "home", "heat", "cool"].includes(st.state);
      box.classList.toggle("is-on", !!on && TOGGLE_DOMAINS.concat(["lock", "binary_sensor", "media_player", "climate"]).includes(domain));
      if (st && window.customElements && window.customElements.get("ha-state-icon")) {
        let si = icEl.querySelector("ha-state-icon");
        if (!si) { icEl.innerHTML = ""; si = document.createElement("ha-state-icon"); icEl.appendChild(si); }
        si.hass = hass; si.stateObj = st;
      } else if (st) {
        icEl.innerHTML = iconHtml((st.attributes && st.attributes.icon) || `mdi:${{ light: "lightbulb", switch: "toggle-switch", lock: "lock", fan: "fan", cover: "window-shutter", climate: "thermostat", sensor: "eye", binary_sensor: "radiobox-marked" }[domain] || "circle-outline"}`,
          { light: "💡", switch: "🔌", lock: st.state === "unlocked" ? "🔓" : "🔒", fan: "🌀", cover: "🪟", climate: "🌡️", sensor: "📟", binary_sensor: "⚪", media_player: "🎵", person: "🙂" }[domain] || "•");
      }
      el.querySelector(".name").textContent = c.name || friendly(hass, c.entity);
      el.querySelector(".state").textContent = st ? stateText(hass, st) : "—";
      item.extraClass = c.tap && TOGGLE_DOMAINS.includes(domain) && !this.opts.preview ? " tappable" : "";
      el.className = `fh-ss-w fh-ss-k-${w.kind}${item.extraClass}`;
    } else if (w.kind === "camera") this._refreshCamera(item, true);
    else if (w.kind === "text") el.querySelector(".fh-ss-text").textContent = c.text || "";
    else if (w.kind === "card") { const card = el.querySelector(".fh-ss-card > *"); if (card) card.hass = hass; }
  }
  _tickClock(item) {
    const { w, el } = item;
    const c = w.config;
    const hass = this.ctx.hass;
    const now = this.ctx.now ? this.ctx.now() : new Date();
    const dateEl = el.querySelector(".fh-ss-date");
    if (c.style === "analog" && w.kind === "clock") {
      const h = now.getHours() % 12, m = now.getMinutes(), s = now.getSeconds();
      const rot = (sel, deg) => { const n = el.querySelector(sel); if (n) n.setAttribute("transform", `rotate(${deg} 50 50)`); };
      rot(".hand-h", h * 30 + m * 0.5); rot(".hand-m", m * 6 + s * 0.1); rot(".hand-s", s * 6);
      if (dateEl) dateEl.textContent = c.date === false ? "" : fmtDate(hass, now, { weekday: "long", month: "long", day: "numeric" });
      return;
    }
    const style = w.kind === "clockweather" ? "digits" : c.style || "digits";
    const p = timeParts(hass, now, c.format, style !== "minimal" && !!c.seconds);
    const timeEl = el.querySelector(".fh-ss-time");
    const wdEl = el.querySelector(".fh-ss-weekday");
    if (style === "minimal") {
      el.querySelector(".fh-ss-time").innerHTML = "";
      wdEl.innerHTML = "";
      dateEl.innerHTML = "";
      if (!item.state.minimal) { item.state.minimal = document.createElement("div"); el.insertBefore(item.state.minimal, el.firstChild); }
      item.state.minimal.innerHTML = `${esc(p.h)}:${esc(p.m)}${p.ap ? ` <span style="font-size:0.6em;opacity:0.8">${esc(p.ap)}</span>` : ""}<span class="dot">·</span>${esc(fmtDate(hass, now, { weekday: "long" }))}`;
      return;
    }
    timeEl.innerHTML = `${esc(p.h)}<span class="colon">:</span>${esc(p.m)}${p.s ? `<span class="sec">${esc(p.s)}</span>` : ""}${p.ap ? `<span class="ap">${esc(p.ap)}</span>` : ""}`;
    wdEl.textContent = style === "stacked" ? fmtDate(hass, now, { weekday: "long" }) : "";
    wdEl.style.display = style === "stacked" ? "" : "none";
    const showDate = w.kind === "clockweather" ? false : c.date !== false;
    dateEl.textContent = showDate ? fmtDate(hass, now, style === "stacked" ? { month: "long", day: "numeric" } : { weekday: "long", month: "long", day: "numeric" }) : "";
    dateEl.style.display = showDate ? "" : "none";
    if (w.kind === "clockweather") {
      const st = hass && hass.states && hass.states[c.entity];
      const line = el.querySelector(".fh-ss-cw-line");
      const day = fmtDate(hass, now, { weekday: "long", month: "long", day: "numeric" });
      line.innerHTML = st
        ? `<span class="ic">${iconHtml(WEATHER_ICONS[st.state] || "mdi:weather-partly-cloudy", WEATHER_EMOJI[st.state])}</span><span>${esc(tempText(st.attributes.temperature, hass, st))}</span><span class="dot">·</span><span>${esc(day)}</span>`
        : `<span>${esc(day)}</span>`;
    }
  }
  _subscribeForecast(item) {
    const c = item.w.config;
    const hass = this.ctx.hass;
    item.state.forecast = null;
    if (!c.entity || !hass || !hass.connection || typeof hass.connection.subscribeMessage !== "function") return;
    try {
      const p = hass.connection.subscribeMessage((msg) => {
        item.state.forecast = (msg && msg.forecast) || null;
        this._refresh(item, this.ctx.hass);
      }, { type: "weather/subscribe_forecast", forecast_type: "daily", entity_id: c.entity });
      item.state.unsub = p;
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (e) { /* older HA: attributes.forecast is used instead */ }
  }
  _renderWeather(item, hass) {
    const c = item.w.config;
    const box = item.el.querySelector(".fh-ss-weather");
    const st = hass && hass.states && hass.states[c.entity];
    if (!st) { box.innerHTML = ""; return; }
    const fc = item.state.forecast || (st.attributes && st.attributes.forecast) || [];
    const cond = stateText(hass, st);
    const icon = iconHtml(WEATHER_ICONS[st.state] || "mdi:weather-partly-cloudy", WEATHER_EMOJI[st.state]);
    let html = `<div class="fh-ss-wx-now"><span class="fh-ss-wx-icon">${icon}</span><span class="fh-ss-wx-temp">${esc(tempText(st.attributes.temperature, hass, st))}</span></div><div class="fh-ss-wx-cond">${esc(cond)}</div>`;
    const t = this.ctx.t || ((k, f) => f);
    if (c.show !== "now" && fc[0]) {
      const hi = tempText(fc[0].temperature, hass, st), lo = tempText(fc[0].templow, hass, st);
      if (hi || lo) html += `<div class="fh-ss-wx-hilo">${esc(t("ss.high_low", "High %hi% · Low %lo%", { hi, lo }))}</div>`;
    }
    if (c.show === "days3" && fc.length > 1) {
      html += `<div class="fh-ss-wx-days">${fc.slice(1, 4).map((d) => {
        const dt = new Date(d.datetime);
        return `<div class="fh-ss-wx-day"><span class="name">${esc(isDate(dt) ? fmtDate(hass, dt, { weekday: "short" }) : "")}</span><span class="ic">${iconHtml(WEATHER_ICONS[d.condition] || "mdi:weather-partly-cloudy", WEATHER_EMOJI[d.condition])}</span><span>${esc(tempText(d.temperature, hass, st))}<span class="lo">${esc(tempText(d.templow, hass, st))}</span></span></div>`;
      }).join("")}</div>`;
    }
    box.innerHTML = html;
  }
  async _fetchNext(item) {
    const hass = this.ctx.hass;
    const settings = this.ctx.settings || {};
    if (!hass || typeof hass.callApi !== "function") return;
    const c = item.w.config;
    const people = Array.isArray(settings.people) ? settings.people : [];
    const cals = (Array.isArray(c.calendars) && c.calendars.length ? c.calendars : people.map((p) => p && p.entity)).filter((e) => typeof e === "string" && e.startsWith("calendar."));
    const start = new Date(), end = new Date(start.getTime() + 3 * 86400000);
    const all = [];
    await Promise.all(cals.map((cal) => hass.callApi("GET", `calendars/${cal}?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`)
      .then((evs) => (evs || []).forEach((ev) => {
        const s = new Date((ev.start && (ev.start.dateTime || ev.start.date)) || ev.start);
        const e = new Date((ev.end && (ev.end.dateTime || ev.end.date)) || ev.end);
        const allDay = !!(ev.start && ev.start.date && !ev.start.dateTime);
        if (!isDate(s) || allDay) return;
        all.push({ summary: ev.summary || "", start: s, end: isDate(e) ? e : s, cal });
      })).catch(() => {})));
    item.state.fetchedAt = Date.now();
    const seen = new Set();
    item.state.events = all.sort((a, b) => a.start - b.start).filter((ev) => { const k = ev.start.getTime() + "|" + ev.summary; if (seen.has(k)) return false; seen.add(k); return true; });
    this._renderNext(item);
  }
  _renderNext(item) {
    const hass = this.ctx.hass;
    const settings = this.ctx.settings || {};
    const t = this.ctx.t || ((k, f) => f);
    const box = item.el.querySelector(".fh-ss-next");
    if (settings.discreetModeEnabled) { box.innerHTML = ""; return; }
    const now = this.ctx.now ? this.ctx.now() : new Date();
    const n = Math.min(3, Math.max(1, +item.w.config.count || 2));
    const evs = (item.state.events || []).filter((ev) => ev.end > now).slice(0, n);
    if (item.state.events === null) { box.innerHTML = ""; return; }
    const people = Array.isArray(settings.people) ? settings.people : [];
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const rows = evs.map((ev) => {
      const person = people.find((p) => p && p.entity === ev.cal) || {};
      const pic = personPictureFor(hass, settings, ev.cal);
      const face = pic ? `<span class="fh-ss-face" style="background-image:url('${cssUrl(pic)}')"></span>`
        : `<span class="fh-ss-face" style="background:${esc(person.color || "#888")}">${esc(((person.name || "?").trim()[0] || "?").toUpperCase())}</span>`;
      const day = new Date(ev.start); day.setHours(0, 0, 0, 0);
      const dd = Math.round((day - today) / 86400000);
      let when;
      if (ev.start <= now) when = `<span class="now">${esc(t("ss.now", "Now"))}</span> · ${esc(t("ss.until", "until %time%", { time: fmtTime(hass, ev.end) }))}`;
      else if (dd === 0) when = esc(fmtTime(hass, ev.start));
      else if (dd === 1) when = esc(t("ss.tomorrow_at", "Tomorrow %time%", { time: fmtTime(hass, ev.start) }));
      else when = esc(`${fmtDate(hass, ev.start, { weekday: "long" })} ${fmtTime(hass, ev.start)}`);
      return `<div class="fh-ss-next-row">${face}<div><div class="fh-ss-next-title">${esc(ev.summary)}</div><div class="fh-ss-next-when">${when}</div></div></div>`;
    });
    box.innerHTML = rows.length ? `<div class="fh-ss-next-head">${esc(t("ss.next_up", "Next up"))}</div>${rows.join("")}` : "";
  }
  _toggle(item) {
    const hass = this.ctx.hass;
    const id = item.w.config.entity;
    const domain = String(id || "").split(".")[0];
    if (!hass || !TOGGLE_DOMAINS.includes(domain)) return;
    if (domain === "script") hass.callService("script", "turn_on", { entity_id: id });
    else if (domain === "cover") hass.callService("cover", "toggle", { entity_id: id });
    else hass.callService("homeassistant", "toggle", { entity_id: id });
  }
  _cameraActive(item) {
    const c = item.w.config;
    const hass = this.ctx.hass;
    if (!c.trigger || this.opts.preview) return true;
    const st = hass && hass.states && hass.states[c.trigger];
    if (!st) return false;
    const now = Date.now();
    const domain = c.trigger.split(".")[0];
    let firing = ["on", "open", "detected", "ringing", "motion", "home"].includes(st.state);
    if (domain === "event") {
      if (item.state.lastEvent === undefined) item.state.lastEvent = st.state;
      if (st.state !== item.state.lastEvent) { item.state.lastEvent = st.state; item.state.firedAt = now; }
      firing = false;
    }
    if (firing) item.state.firedAt = now;
    const hold = Math.max(5, +c.hold || 30) * 1000;
    return !!item.state.firedAt && now - item.state.firedAt < hold;
  }
  _refreshCamera(item, stateChanged) {
    const c = item.w.config;
    const hass = this.ctx.hass;
    const active = this._cameraActive(item);
    item.el.classList.toggle("cam-waiting", !active);
    const cap = item.el.querySelector(".cap");
    if (cap) cap.textContent = c.trigger ? friendly(hass, c.entity) : "";
    if (!active || (stateChanged && item.state.loaded)) return;
    if (!this._timer && !this.opts.preview && item.state.loaded) return; // not on screen: no point fetching pictures
    const st = hass && hass.states && hass.states[c.entity];
    const pic = st && st.attributes && st.attributes.entity_picture;
    const img = item.el.querySelector("img");
    if (!pic || !img) return;
    const sep = pic.indexOf("?") === -1 ? "?" : "&";
    const url = `${pic}${sep}fhts=${Date.now()}`;
    img.src = typeof hass.hassUrl === "function" ? hass.hassUrl(url) : url;
    item.state.loaded = true;
  }
  async _mountCard(item) {
    const host = item.el.querySelector(".fh-ss-card");
    try {
      if (typeof window.loadCardHelpers !== "function") return;
      const helpers = await window.loadCardHelpers();
      const card = helpers.createCardElement(item.w.config.card);
      card.hass = this.ctx.hass;
      host.innerHTML = "";
      host.appendChild(card);
    } catch (e) { /* a broken card config just shows nothing */ }
  }
  _destroyItem(item) {
    if (item.state.timer) clearInterval(item.state.timer);
    if (item.state.unsub && typeof item.state.unsub.then === "function") item.state.unsub.then((u) => { if (typeof u === "function") u(); }).catch(() => {});
    if (item.el.parentNode) item.el.parentNode.removeChild(item.el);
  }
  // Spots on the same row (or column) that would run into each other shrink together until they fit - so a big clock in
  // the bottom left and Next up in the bottom right still work on a narrow portrait screen.
  fit() {
    const W = this.el.clientWidth, H = this.el.clientHeight;
    if (!W || !H) return;
    const u = Math.min(W, H) / 100;
    const pad = 5 * u, gap = 3 * u;
    const BASE = { tc: "translateX(-50%)", bc: "translateX(-50%)", ml: "translateY(-50%)", mr: "translateY(-50%)", mc: "translate(-50%, -50%)" };
    const ORIGIN = { tl: "0 0", tc: "50% 0", tr: "100% 0", ml: "0 50%", mc: "50% 50%", mr: "100% 50%", bl: "0 100%", bc: "50% 100%", br: "100% 100%" };
    const f = {};
    const apply = () => ANCHORS.forEach((a) => {
      const z = this.zones[a];
      z.style.transformOrigin = ORIGIN[a];
      z.style.transform = f[a] < 0.999 ? `${BASE[a] || ""} scale(${f[a].toFixed(3)})`.trim() : BASE[a] || "";
    });
    ANCHORS.forEach((a) => { f[a] = 1; });
    apply();
    const lr = this.el.getBoundingClientRect();
    const used = ANCHORS.filter((a) => this.zones[a].children.length);
    // shrink anything wider or taller than the screen, then shrink both of any two spots that overlap, a step at a time
    used.forEach((a) => {
      const z = this.zones[a];
      const k = Math.min(1, (W - 2 * pad) / Math.max(1, z.offsetWidth), (H - 2 * pad) / Math.max(1, z.offsetHeight));
      f[a] = Math.max(0.45, k);
    });
    apply();
    for (let pass = 0; pass < 12; pass++) {
      const rects = {};
      used.forEach((a) => { rects[a] = this.zones[a].getBoundingClientRect(); });
      let hit = false;
      for (let i = 0; i < used.length; i++) {
        for (let j = i + 1; j < used.length; j++) {
          const A = rects[used[i]], B = rects[used[j]];
          if (A.left < B.right + gap && B.left < A.right + gap && A.top < B.bottom + gap && B.top < A.bottom + gap) {
            hit = true;
            [used[i], used[j]].forEach((a) => { f[a] = Math.max(0.45, f[a] * 0.92); });
          }
        }
      }
      if (!hit) break;
      apply();
    }
    void lr;
  }
  // -- every second while showing
  tick() {
    if (this.ctx.getHass) this.ctx.hass = this.ctx.getHass();
    const fresh = (this._ticks || 0) % 3 === 0;
    Object.keys(this.items).forEach((id) => {
      const item = this.items[id];
      if (item.w.kind === "clock" || item.w.kind === "clockweather") this._tickClock(item);
      else if (fresh && ["weather", "entity", "card"].includes(item.w.kind)) this._refresh(item, this.ctx.hass);
      else if (item.w.kind === "camera" && item.w.config.trigger) this._refreshCamera(item, true);
      if (item.w.kind === "nextup" && (this._ticks || 0) % 30 === 0) this._renderNext(item);
    });
    this._ticks = (this._ticks || 0) + 1;
    if (this._ticks % 15 === 0) this.applyColors();
    if (this._ticks % 5 === 0) this.fit();
    if (this._ticks % 30 === 0) this._applyNight();
    if (!this.opts.preview && this._ticks % 150 === 0) this.drift();
  }
  // Accessibility -> Reduce motion: widgets still move a little (burn-in), but jump instead of gliding, and nothing blinks
  _applyStill() {
    let still = false;
    try { still = !!(window.__familyHubEink && window.__familyHubEink.a11y().reduceMotion); } catch (e) {}
    if (this.el) this.el.classList.toggle("fh-ss-still", still);
  }
  drift() {
    this._applyStill();
    const o = normalizeOptions(this.ctx.options);
    const d = this.el.querySelector(".fh-ss-drift");
    if (!o.drift) { d.style.transform = ""; return; }
    const u = Math.min(this.el.clientWidth, this.el.clientHeight) / 100 || 10;
    const r = () => (Math.random() * 2 - 1) * 1.6 * u;
    d.style.transform = `translate(${r().toFixed(1)}px, ${r().toFixed(1)}px)`;
  }
  // -- light or dark text, per spot, from the picture behind it; and the soft shade that keeps it readable
  _zoneIsDark(anchor) {
    const media = this.ctx.getBackground ? this.ctx.getBackground() : null;
    if (!media) return null;
    try {
      const nw = media.videoWidth || media.naturalWidth || 0, nh = media.videoHeight || media.naturalHeight || 0;
      const W = this.el.clientWidth, H = this.el.clientHeight;
      if (!nw || !nh || !W || !H) return null;
      const zr = this.zones[anchor].getBoundingClientRect(), lr = this.el.getBoundingClientRect();
      if (!zr.width || !zr.height) return null;
      const scale = Math.max(W / nw, H / nh); // object-fit: cover
      const ox = (W - nw * scale) / 2, oy = (H - nh * scale) / 2;
      const sx = Math.max(0, (zr.left - lr.left - ox) / scale), sy = Math.max(0, (zr.top - lr.top - oy) / scale);
      const sw = Math.max(1, Math.min(nw - sx, zr.width / scale)), sh = Math.max(1, Math.min(nh - sy, zr.height / scale));
      if (!this._cv) { this._cv = document.createElement("canvas"); this._cv.width = 8; this._cv.height = 8; }
      const g = this._cv.getContext("2d");
      g.drawImage(media, sx, sy, sw, sh, 0, 0, 8, 8);
      const { data } = g.getImageData(0, 0, 8, 8);
      let tot = 0;
      for (let i = 0; i < data.length; i += 4) tot += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      return tot / 64 < 150;
    } catch (e) { return null; }
  }
  applyColors() {
    const o = normalizeOptions(this.ctx.options);
    const used = {};
    Object.keys(this.items).forEach((id) => {
      const item = this.items[id];
      const a = item.w.anchor;
      if (!(a in used)) used[a] = this._zoneIsDark(a);
      const dark = item.w.color === "dark" || (item.w.color === "auto" && used[a] === false);
      item.el.classList.toggle("c-dark", dark);
      item.dark = dark;
    });
    const POS = { tl: "0% 0%", tc: "50% 0%", tr: "100% 0%", ml: "0% 50%", mc: "50% 50%", mr: "100% 50%", bl: "0% 100%", bc: "50% 100%", br: "100% 100%" };
    const layers = [];
    if (o.scrim) {
      Object.keys(used).forEach((a) => {
        const anyLight = Object.keys(this.items).some((id) => this.items[id].w.anchor === a && !this.items[id].dark);
        const anyDark = Object.keys(this.items).some((id) => this.items[id].w.anchor === a && this.items[id].dark);
        const shade = anyLight ? "rgba(0,0,0,0.34)" : anyDark ? "rgba(255,255,255,0.28)" : "";
        if (shade) layers.push(`radial-gradient(ellipse ${a[1] === "c" ? "60%" : "55%"} ${a[0] === "m" ? "45%" : "50%"} at ${POS[a]}, ${shade}, transparent 72%)`);
      });
    }
    this.el.querySelector(".fh-ss-scrim").style.background = layers.join(", ");
  }
  _applyNight() {
    const o = normalizeOptions(this.ctx.options);
    const now = this.ctx.now ? this.ctx.now() : new Date();
    let on = false;
    if (o.night.enabled) {
      const mins = now.getHours() * 60 + now.getMinutes();
      const toMin = (s) => +s.slice(0, 2) * 60 + +s.slice(3);
      const a = toMin(o.night.start), b = toMin(o.night.end);
      on = a <= b ? mins >= a && mins < b : mins >= a || mins < b;
    }
    this.el.classList.toggle("night", on && o.night.red);
    this.el.querySelector(".fh-ss-veil").style.opacity = on ? String(1 - o.night.dim / 100) : "0";
    this.el.querySelector(".fh-ss-drift").style.opacity = on ? String(Math.min(1, 0.45 + (0.55 * o.night.dim) / 100)) : "";
    this.isNight = on;
  }
  show() {
    this.el.classList.add("fh-ss-hidden");
    void this.el.offsetWidth;
    this.el.classList.remove("fh-ss-hidden");
    Object.keys(this.items).forEach((id) => { const it = this.items[id]; it.el.style.animation = "none"; void it.el.offsetWidth; it.el.style.animation = ""; });
    this._measure();
    Object.keys(this.items).forEach((id) => {
      const it = this.items[id];
      if (it.w.kind === "nextup" && (!it.state.fetchedAt || Date.now() - it.state.fetchedAt > 5 * 60000)) this._fetchNext(it);
    });
    this.tick();
    this.fit();
    if (!this._timer) this._timer = setInterval(() => this.tick(), 1000);
    setTimeout(() => { this.applyColors(); this.fit(); }, 1500);
  }
  hide() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }
  destroy() {
    this.hide();
    Object.keys(this.items).forEach((id) => this._destroyItem(this.items[id]));
    this.items = {};
    if (this._ro) this._ro.disconnect();
    if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
  }
}

// -- the editor (Settings → Screen Saver → Widgets) -------------------------------------------------------------
const EDITOR_CSS = `
.fh-sse { display: flex; flex-direction: column; gap: 12px; color: var(--fc-text, inherit); font-size: 13px; }
.fh-sse-shapes { display: flex; gap: 6px; flex-wrap: wrap; }
.fh-sse-chip { border: 1px solid var(--fc-border, #ccc); background: var(--fc-card, #fff); color: var(--fc-text, #222); border-radius: 999px; padding: 5px 12px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
.fh-sse-chip.on { background: var(--fc-accent, #345); color: var(--fc-accent-text, #fff); border-color: transparent; }
.fh-sse-stage { display: flex; justify-content: center; }
.fh-sse-frame { position: relative; overflow: hidden; border-radius: 10px; background: #111 center / cover no-repeat; box-shadow: 0 2px 10px rgba(0,0,0,0.25); touch-action: none; }
.fh-sse-frame .bg { position: absolute; inset: 0; background: linear-gradient(160deg, #3d5a6c 0%, #7f8f7a 45%, #d8b98c 100%); }
.fh-sse-frame img.bg { width: 100%; height: 100%; object-fit: cover; }
.fh-sse-hint { font-size: 12px; color: var(--fc-text-secondary, #777); }
.fh-sse-list { display: flex; flex-direction: column; gap: 6px; }
.fh-sse-row { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 10px; background: var(--fc-surface-alt, rgba(0,0,0,0.04)); }
.fh-sse-row.selected { outline: 2px solid var(--fc-accent, #345); }
.fh-sse-row .lbl { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.fh-sse-row .meta { font-size: 11px; color: var(--fc-text-secondary, #777); white-space: nowrap; }
.fh-sse-row button, .fh-sse-mini { border: 1px solid var(--fc-border, #ccc); background: var(--fc-card, #fff); color: var(--fc-text, #222); border-radius: 8px; min-width: 30px; height: 28px; font: inherit; cursor: pointer; }
.fh-sse-add { border: 2px dashed var(--fc-border, #ccc); background: none; color: var(--fc-accent, #345); border-radius: 12px; padding: 9px; font: inherit; font-weight: 700; cursor: pointer; }
.fh-sse-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; }
.fh-sse-tile { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 10px 6px; border-radius: 12px; border: 2px solid var(--fc-border, #ccc); background: var(--fc-card, #fff); color: var(--fc-text, #222); cursor: pointer; font: inherit; text-align: center; }
.fh-sse-tile:hover { border-color: var(--fc-accent, #345); }
.fh-sse-tile .i { font-size: 22px; } .fh-sse-tile .n { font-weight: 700; font-size: 12px; } .fh-sse-tile .d { font-size: 10px; color: var(--fc-text-secondary, #777); line-height: 1.3; }
.fh-sse-form { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: 12px; border: 1px solid var(--fc-border, #ccc); background: var(--fc-surface-alt, rgba(0,0,0,0.03)); }
.fh-sse-form h4 { margin: 0; font-size: 14px; }
.fh-sse-f { display: flex; flex-direction: column; gap: 4px; }
.fh-sse-f > label { font-weight: 700; font-size: 12px; }
.fh-sse-f input[type=text], .fh-sse-f input[type=number], .fh-sse-f input[type=time], .fh-sse-f select, .fh-sse-f textarea { box-sizing: border-box; width: 100%; padding: 7px 9px; border-radius: 8px; border: 1px solid var(--fc-border, #ccc); background: var(--fc-card, #fff); color: var(--fc-text, #222); font: inherit; }
.fh-sse-f textarea { font-family: monospace; font-size: 12px; }
.fh-sse-check { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.fh-sse-check input { width: 18px; height: 18px; flex: 0 0 auto; }
.fh-sse-seg { display: inline-flex; flex-wrap: wrap; gap: 4px; }
.fh-sse-grid { display: grid; grid-template-columns: repeat(3, 34px); grid-template-rows: repeat(3, 24px); gap: 4px; }
.fh-sse-grid button { border: 1px solid var(--fc-border, #ccc); background: var(--fc-card, #fff); border-radius: 6px; cursor: pointer; padding: 0; }
.fh-sse-grid button.on { background: var(--fc-accent, #345); border-color: transparent; }
.fh-sse-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
.fh-sse-actions button { border-radius: 10px; padding: 8px 14px; font: inherit; font-weight: 700; cursor: pointer; border: 1px solid var(--fc-border, #ccc); background: var(--fc-card, #fff); color: var(--fc-text, #222); }
.fh-sse-actions .primary { background: var(--fc-accent, #345); color: var(--fc-accent-text, #fff); border-color: transparent; }
.fh-sse-actions .danger { color: var(--fc-danger, #c62828); margin-right: auto; }
.fh-sse-err { color: var(--fc-danger, #c62828); font-size: 12px; }
.fh-sse-section { display: flex; flex-direction: column; gap: 8px; padding-top: 6px; border-top: 1px solid var(--fc-border, #ddd); }
.fh-sse-section h4 { margin: 0; font-size: 13px; }
.fh-sse-inline { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.fh-sse-inline .fh-sse-f { flex: 1 1 120px; }
`;
const KIND_ICON = { clock: "🕐", weather: "⛅", clockweather: "🕐⛅", nextup: "📅", entity: "💡", camera: "📷", text: "📝", card: "🔧" };
function kindName(t, kind) {
  return {
    clock: t("ss.kind_clock", "Clock"), weather: t("ss.kind_weather", "Weather"), clockweather: t("ss.kind_clockweather", "Clock & weather"),
    nextup: t("ss.kind_nextup", "Next up"), entity: t("ss.kind_entity", "Entity"), camera: t("ss.kind_camera", "Camera"),
    text: t("ss.kind_text", "Text"), card: t("ss.kind_card", "Custom card"),
  }[kind] || kind;
}
function kindDesc(t, kind) {
  return {
    clock: t("ss.kind_clock_desc", "Big, thin digits, stacked, minimal or a clock face"),
    weather: t("ss.kind_weather_desc", "Now, today's high and low, or 3 days"),
    clockweather: t("ss.kind_clockweather_desc", "The time with the temperature and date under it"),
    nextup: t("ss.kind_nextup_desc", "The next event or two, with faces"),
    entity: t("ss.kind_entity_desc", "Any switch, light, sensor or lock; can be tapped"),
    camera: t("ss.kind_camera_desc", "A picture-in-picture camera, always or when something happens"),
    text: t("ss.kind_text_desc", "A line of your own text"),
    card: t("ss.kind_card_desc", "Any Lovelace card, as JSON"),
  }[kind] || "";
}
function widgetLabel(w, hass, t) {
  t = t || ((k, f) => f);
  const nw = normalizeWidget(w);
  if (!nw) return (w && w.id) || "";
  const c = nw.config;
  const ent = c.entity ? ` · ${friendly(hass, c.entity)}` : "";
  if (nw.kind === "text") return `${kindName(t, "text")}${c.text ? ` · ${String(c.text).slice(0, 24)}` : ""}`;
  if (nw.kind === "card") return `${kindName(t, "card")} · ${c.card.type}`;
  return kindName(t, nw.kind) + ent;
}
function anchorName(t, a) {
  return {
    tl: t("ss.pos_tl", "Top left"), tc: t("ss.pos_tc", "Top"), tr: t("ss.pos_tr", "Top right"),
    ml: t("ss.pos_ml", "Left"), mc: t("ss.pos_mc", "Middle"), mr: t("ss.pos_mr", "Right"),
    bl: t("ss.pos_bl", "Bottom left"), bc: t("ss.pos_bc", "Bottom"), br: t("ss.pos_br", "Bottom right"),
  }[a] || a;
}
class Editor {
  constructor(host, opts) {
    this.host = host;
    this.opts = opts;
    this.t = opts.t || ((k, f) => f);
    this.widgets = normalizeWidgets(opts.widgets);
    this.options = normalizeOptions(opts.options);
    this.shape = "screen";
    this.selected = null;
    this.mode = "list"; // list | gallery | form
    host.innerHTML = `<style>${EDITOR_CSS}</style><div class="fh-sse"></div>`;
    this.root = host.querySelector(".fh-sse");
    this.render();
  }
  get hass() { return this.opts.getHass ? this.opts.getHass() : this.opts.hass; }
  _changed() { if (this.opts.onChange) this.opts.onChange(JSON.parse(JSON.stringify(this.widgets)), JSON.parse(JSON.stringify(this.options))); }
  _aspect() {
    if (this.shape === "landscape") return 16 / 9;
    if (this.shape === "portrait") return 9 / 16;
    if (this.shape === "square") return 1;
    if (this.shape === "43") return 4 / 3;
    const w = window.innerWidth || 1280, h = window.innerHeight || 800;
    return w / h;
  }
  render() {
    const t = this.t;
    const shapes = [["screen", t("ss.shape_screen", "This screen")], ["landscape", t("ss.shape_landscape", "Landscape")], ["portrait", t("ss.shape_portrait", "Portrait")], ["square", t("ss.shape_square", "Square")], ["43", "4:3"]];
    this.root.innerHTML = `
<div class="fh-sse-shapes">${shapes.map(([k, n]) => `<button type="button" class="fh-sse-chip${this.shape === k ? " on" : ""}" data-shape="${k}">${esc(n)}</button>`).join("")}</div>
<div class="fh-sse-stage"><div class="fh-sse-frame"></div></div>
<div class="fh-sse-hint">${esc(t("ss.editor_hint", "Drag a widget to one of the 9 spots, or tap it to change it. Sizes follow the screen, so the same layout works on any shape."))}</div>
<div class="fh-sse-body"></div>`;
    this.root.querySelectorAll("[data-shape]").forEach((b) => b.addEventListener("click", () => { this.shape = b.dataset.shape; this.render(); }));
    this._renderPreview();
    this._renderBody();
  }
  _renderPreview() {
    const frame = this.root.querySelector(".fh-sse-frame");
    const ar = this._aspect();
    const maxW = Math.max(200, Math.min((this.host.clientWidth || 600) - 4, 640));
    const maxH = 340;
    let w = maxW, h = w / ar;
    if (h > maxH) { h = maxH; w = h * ar; }
    frame.style.width = `${Math.round(w)}px`;
    frame.style.height = `${Math.round(h)}px`;
    const bgUrl = this.opts.backgroundUrl ? this.opts.backgroundUrl() : "";
    frame.innerHTML = bgUrl ? `<img class="bg" alt="" src="${esc(bgUrl)}">` : `<div class="bg"></div>`;
    if (this.layer) this.layer.destroy();
    this.layer = new Layer(frame, { preview: true });
    const bgImg = frame.querySelector("img.bg");
    this.layer.update({ hass: this.hass, widgets: this.widgets, options: this.options, settings: this.opts.settings ? this.opts.settings() : {}, t: this.t, getBackground: () => (bgImg && bgImg.naturalWidth ? bgImg : null) });
    this.layer.show();
    if (bgImg) bgImg.addEventListener("load", () => this.layer && this.layer.applyColors());
    const drops = document.createElement("div");
    drops.className = "fh-ss-drops";
    drops.innerHTML = ANCHORS.map((a) => `<div data-drop="${a}"></div>`).join("");
    frame.appendChild(drops);
    Object.values(this.layer.items).forEach((item) => {
      item.el.classList.toggle("selected", item.w.id === this.selected);
      item.el.addEventListener("pointerdown", (e) => this._startDrag(e, item, frame, drops));
    });
  }
  _startDrag(e, item, frame, drops) {
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    let moved = false, target = null;
    const rect = frame.getBoundingClientRect();
    const zoneAt = (x, y) => {
      const c = Math.min(2, Math.max(0, Math.floor(((x - rect.left) / rect.width) * 3)));
      const r = Math.min(2, Math.max(0, Math.floor(((y - rect.top) / rect.height) * 3)));
      return "tmb"[r] + "lcr"[c];
    };
    const onMove = (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      moved = true;
      drops.classList.add("on");
      item.el.classList.add("dragging");
      target = zoneAt(ev.clientX, ev.clientY);
      drops.querySelectorAll("[data-drop]").forEach((d) => d.classList.toggle("hot", d.dataset.drop === target));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      drops.classList.remove("on");
      item.el.classList.remove("dragging");
      const w = this.widgets.find((x) => x.id === item.w.id);
      if (!w) return;
      if (moved && target) {
        if (w.anchor !== target) {
          // dropped in a new spot: it goes to the end of that spot's stack
          w.anchor = target;
          this.widgets = this.widgets.filter((x) => x.id !== w.id).concat([w]);
          this._changed();
        }
        this.selected = w.id;
        this.render();
      } else {
        this.selected = w.id;
        this._openForm(w.id);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  _renderBody() {
    const body = this.root.querySelector(".fh-sse-body");
    if (this.mode === "gallery") return this._renderGallery(body);
    if (this.mode === "form") return this._renderForm(body);
    const t = this.t;
    const hass = this.hass;
    const sizes = { s: "S", m: "M", l: "L", xl: "XL" };
    body.innerHTML = `
<div class="fh-sse-list">${this.widgets.map((w, i) => `<div class="fh-sse-row${w.id === this.selected ? " selected" : ""}" data-id="${esc(w.id)}">
<span>${KIND_ICON[w.kind] || "•"}</span><span class="lbl">${esc(widgetLabel(w, hass, t))}</span><span class="meta">${esc(anchorName(t, w.anchor))} · ${sizes[w.size]}</span>
<button type="button" data-act="up" title="${esc(t("ss.move_up", "Move up"))}"${i === 0 ? " disabled" : ""}>▲</button>
<button type="button" data-act="edit" title="${esc(t("ss.edit", "Edit"))}">✎</button>
<button type="button" data-act="del" title="${esc(t("ss.remove", "Remove"))}">✕</button></div>`).join("") || `<div class="fh-sse-hint">${esc(t("ss.no_widgets", "No widgets yet. A clock in the bottom left is a good start."))}</div>`}</div>
<button type="button" class="fh-sse-add">➕ ${esc(t("ss.add_widget", "Add widget"))}</button>
<div class="fh-sse-section">
<h4>${esc(t("ss.screen_options", "On the screen"))}</h4>
<label class="fh-sse-check"><input type="checkbox" data-opt="scrim"${this.options.scrim ? " checked" : ""}> <span>${esc(t("ss.opt_scrim", "Soft shade behind widgets, so they're readable on any picture"))}</span></label>
<label class="fh-sse-check"><input type="checkbox" data-opt="drift"${this.options.drift ? " checked" : ""}> <span>${esc(t("ss.opt_drift", "Move widgets slightly every few minutes (protects the screen from burn-in)"))}</span></label>
<label class="fh-sse-check"><input type="checkbox" data-opt="night"${this.options.night.enabled ? " checked" : ""}> <span>${esc(t("ss.opt_night", "Night mode: dim the screen at night"))}</span></label>
<div class="fh-sse-inline" data-night-fields style="${this.options.night.enabled ? "" : "display:none"}">
<div class="fh-sse-f"><label>${esc(t("ss.night_from", "From"))}</label><input type="time" data-night="start" value="${this.options.night.start}"></div>
<div class="fh-sse-f"><label>${esc(t("ss.night_to", "Until"))}</label><input type="time" data-night="end" value="${this.options.night.end}"></div>
<div class="fh-sse-f"><label>${esc(t("ss.night_brightness", "Brightness"))} <span data-dimval>${this.options.night.dim}%</span></label><input type="range" min="10" max="100" step="5" data-night="dim" value="${this.options.night.dim}"></div>
<label class="fh-sse-check"><input type="checkbox" data-night="red"${this.options.night.red ? " checked" : ""}> <span>${esc(t("ss.night_red", "Red clock at night"))}</span></label>
</div>
</div>`;
    body.querySelectorAll(".fh-sse-row").forEach((row) => {
      const id = row.dataset.id;
      row.querySelector('[data-act="edit"]').addEventListener("click", () => this._openForm(id));
      row.querySelector('[data-act="del"]').addEventListener("click", () => { this.widgets = this.widgets.filter((w) => w.id !== id); this._changed(); this.render(); });
      row.querySelector('[data-act="up"]').addEventListener("click", () => {
        const i = this.widgets.findIndex((w) => w.id === id);
        if (i > 0) { const [w] = this.widgets.splice(i, 1); this.widgets.splice(i - 1, 0, w); this._changed(); this.render(); }
      });
    });
    body.querySelector(".fh-sse-add").addEventListener("click", () => { this.mode = "gallery"; this._renderBody(); });
    body.querySelectorAll("[data-opt]").forEach((cb) => cb.addEventListener("change", () => {
      if (cb.dataset.opt === "night") { this.options.night.enabled = cb.checked; body.querySelector("[data-night-fields]").style.display = cb.checked ? "" : "none"; }
      else this.options[cb.dataset.opt] = cb.checked;
      this._changed(); this._renderPreview();
    }));
    body.querySelectorAll("[data-night]").forEach((inp) => inp.addEventListener(inp.type === "range" ? "input" : "change", () => {
      const k = inp.dataset.night;
      if (k === "red") this.options.night.red = inp.checked;
      else if (k === "dim") { this.options.night.dim = +inp.value; body.querySelector("[data-dimval]").textContent = `${inp.value}%`; }
      else if (inp.value) this.options.night[k] = inp.value;
      this._changed();
    }));
  }
  _renderGallery(body) {
    const t = this.t;
    body.innerHTML = `<div class="fh-sse-form"><h4>${esc(t("ss.add_widget", "Add widget"))}</h4><div class="fh-sse-gallery">${KINDS.map((k) => `<button type="button" class="fh-sse-tile" data-kind="${k}"><span class="i">${KIND_ICON[k]}</span><span class="n">${esc(kindName(t, k))}</span><span class="d">${esc(kindDesc(t, k))}</span></button>`).join("")}</div>
<div class="fh-sse-actions"><button type="button" data-act="cancel">${esc(t("ss.cancel", "Cancel"))}</button></div></div>`;
    body.querySelector('[data-act="cancel"]').addEventListener("click", () => { this.mode = "list"; this._renderBody(); });
    body.querySelectorAll("[data-kind]").forEach((b) => b.addEventListener("click", () => {
      const kind = b.dataset.kind;
      this.draft = { id: newId(), kind, anchor: DEFAULT_ANCHOR[kind], size: kind === "clock" || kind === "clockweather" ? "l" : "m", color: "auto", config: defaultConfig(kind), transparent: false, isNew: true };
      this.mode = "form"; this._renderBody();
    }));
  }
  _openForm(id) {
    const w = this.widgets.find((x) => x.id === id);
    if (!w) return;
    this.draft = JSON.parse(JSON.stringify(w));
    this.selected = id;
    this.mode = "form";
    this._renderBody();
    const f = this.root.querySelector(".fh-sse-form");
    if (f && f.scrollIntoView) f.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  _entityOptions(domains) {
    const states = (this.hass && this.hass.states) || {};
    return Object.keys(states).filter((id) => !domains || domains.includes(id.split(".")[0])).sort()
      .map((id) => `<option value="${esc(id)}">${esc(friendly(this.hass, id))}</option>`).join("");
  }
  _renderForm(body) {
    const t = this.t;
    const d = this.draft;
    const c = d.config;
    const uid = Math.random().toString(36).slice(2, 7);
    const entityField = (key, label, domains, help) => `<div class="fh-sse-f"><label>${esc(label)}</label><input type="text" data-c="${key}" value="${esc(c[key] || "")}" list="fh-sse-dl-${key}-${uid}" placeholder="${esc(domains ? domains[0] + "." : "")}…"><datalist id="fh-sse-dl-${key}-${uid}">${this._entityOptions(domains)}</datalist>${help ? `<div class="fh-sse-hint">${esc(help)}</div>` : ""}</div>`;
    const select = (key, label, opts) => `<div class="fh-sse-f"><label>${esc(label)}</label><select data-c="${key}">${opts.map(([v, n]) => `<option value="${v}"${String(c[key]) === String(v) ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></div>`;
    const check = (key, label) => `<label class="fh-sse-check"><input type="checkbox" data-c="${key}"${c[key] ? " checked" : ""}> <span>${esc(label)}</span></label>`;
    const fmt = select("format", t("ss.time_format", "Time format"), [["auto", t("ss.format_auto", "Like Home Assistant")], ["12", "12-hour"], ["24", "24-hour"]]);
    let fields = "";
    if (d.kind === "clock") {
      fields = select("style", t("ss.clock_style", "Style"), [["digits", t("ss.clock_digits", "Big digits")], ["stacked", t("ss.clock_stacked", "Stacked: weekday, time, date")], ["minimal", t("ss.clock_minimal", "Minimal: time · weekday")], ["analog", t("ss.clock_analog", "Clock face")]])
        + fmt + check("seconds", t("ss.show_seconds", "Show seconds")) + check("date", t("ss.show_date", "Show the date"));
    } else if (d.kind === "weather") {
      fields = entityField("entity", t("ss.weather_entity", "Weather entity"), ["weather"])
        + select("show", t("ss.weather_show", "Show"), [["now", t("ss.weather_now", "Now")], ["hilo", t("ss.weather_hilo", "Now, with today's high and low")], ["days3", t("ss.weather_days3", "Now and the next 3 days")]]);
    } else if (d.kind === "clockweather") {
      fields = entityField("entity", t("ss.weather_entity", "Weather entity"), ["weather"]) + fmt;
    } else if (d.kind === "nextup") {
      fields = select("count", t("ss.next_count", "How many"), [["1", "1"], ["2", "2"], ["3", "3"]])
        + `<div class="fh-sse-f"><label>${esc(t("ss.next_calendars", "Calendars"))}</label><input type="text" data-c="calendars" value="${esc((c.calendars || []).join(", "))}" placeholder="${esc(t("ss.next_calendars_all", "Everyone's (leave empty)"))}"><div class="fh-sse-hint">${esc(t("ss.next_calendars_hint", "Leave empty for everyone's calendars, or list calendar entities separated by commas."))}</div></div>`;
    } else if (d.kind === "entity") {
      fields = entityField("entity", t("ss.entity", "Entity"), null)
        + `<div class="fh-sse-f"><label>${esc(t("ss.entity_name", "Name (optional)"))}</label><input type="text" data-c="name" value="${esc(c.name || "")}"></div>`
        + check("tap", t("ss.entity_tap", "Tap to toggle it without waking the screen (switches, lights, fans, covers, scripts)"));
    } else if (d.kind === "camera") {
      fields = entityField("entity", t("ss.camera_entity", "Camera"), ["camera"])
        + entityField("trigger", t("ss.camera_trigger", "Only show when (optional)"), ["binary_sensor", "event", "input_boolean", "switch", "sensor"], t("ss.camera_trigger_hint", "A doorbell, motion sensor or event entity. Leave empty to always show the camera."))
        + `<div class="fh-sse-f"><label>${esc(t("ss.camera_hold", "Keep it up for (seconds)"))}</label><input type="number" min="5" max="600" data-c="hold" value="${esc(c.hold || 30)}"></div>`;
    } else if (d.kind === "text") {
      fields = `<div class="fh-sse-f"><label>${esc(t("ss.text", "Text"))}</label><textarea rows="2" data-c="text" style="font-family:inherit;font-size:13px">${esc(c.text || "")}</textarea></div>`;
    } else if (d.kind === "card") {
      fields = `<div class="fh-sse-f"><label>${esc(t("ss.card_json", "Card config (JSON)"))}</label><textarea rows="6" data-card-json>${esc(JSON.stringify(c.card, null, 2))}</textarea><div class="fh-sse-hint">${esc(t("ss.card_json_hint", "Any Lovelace card's config written as JSON, the same type and keys you'd use on a dashboard."))}</div></div>`
        + `<label class="fh-sse-check"><input type="checkbox" data-transparent${d.transparent ? " checked" : ""}> <span>${esc(t("ss.card_transparent", "No card background"))}</span></label>`;
    }
    const sizes = [["s", t("ss.size_s", "Small")], ["m", t("ss.size_m", "Medium")], ["l", t("ss.size_l", "Large")], ["xl", t("ss.size_xl", "Extra large")]];
    const colors = [["auto", t("ss.color_auto", "Automatic")], ["light", t("ss.color_light", "Light")], ["dark", t("ss.color_dark", "Dark")]];
    body.innerHTML = `<div class="fh-sse-form">
<h4>${KIND_ICON[d.kind]} ${esc(kindName(t, d.kind))}</h4>
${fields}
<div class="fh-sse-inline">
<div class="fh-sse-f" style="flex:0 0 auto"><label>${esc(t("ss.position", "Where"))}</label><div class="fh-sse-grid">${ANCHORS.map((a) => `<button type="button" data-anchor="${a}" class="${d.anchor === a ? "on" : ""}" title="${esc(anchorName(t, a))}"></button>`).join("")}</div></div>
<div class="fh-sse-f"><label>${esc(t("ss.size", "Size"))}</label><div class="fh-sse-seg">${sizes.map(([v, n]) => `<button type="button" class="fh-sse-chip${d.size === v ? " on" : ""}" data-size="${v}">${esc(n)}</button>`).join("")}</div>
<label style="margin-top:8px">${esc(t("ss.text_color", "Text color"))}</label><div class="fh-sse-seg">${colors.map(([v, n]) => `<button type="button" class="fh-sse-chip${d.color === v ? " on" : ""}" data-color="${v}">${esc(n)}</button>`).join("")}</div>
<div class="fh-sse-hint">${esc(t("ss.color_hint", "Automatic picks light or dark text from the picture behind it."))}</div></div>
</div>
<div class="fh-sse-err" style="display:none"></div>
<div class="fh-sse-actions">${d.isNew ? "" : `<button type="button" class="danger" data-act="del">${esc(t("ss.remove", "Remove"))}</button>`}<button type="button" data-act="cancel">${esc(t("ss.cancel", "Cancel"))}</button><button type="button" class="primary" data-act="save">${esc(d.isNew ? t("ss.add", "Add") : t("ss.save", "Save"))}</button></div>
</div>`;
    const preview = () => {
      // the preview follows the form as it's filled in
      const list = this.widgets.filter((w) => w.id !== d.id).concat([this._readForm(body, true)].filter(Boolean));
      if (this.layer) { this.layer.update({ widgets: d.isNew ? list : this.widgets.map((w) => (w.id === d.id ? this._readForm(body, true) || w : w)) }); this.layer.show(); }
    };
    body.querySelectorAll("[data-anchor]").forEach((b) => b.addEventListener("click", () => { d.anchor = b.dataset.anchor; body.querySelectorAll("[data-anchor]").forEach((x) => x.classList.toggle("on", x === b)); preview(); }));
    body.querySelectorAll("[data-size]").forEach((b) => b.addEventListener("click", () => { d.size = b.dataset.size; body.querySelectorAll("[data-size]").forEach((x) => x.classList.toggle("on", x === b)); preview(); }));
    body.querySelectorAll("[data-color]").forEach((b) => b.addEventListener("click", () => { d.color = b.dataset.color; body.querySelectorAll("[data-color]").forEach((x) => x.classList.toggle("on", x === b)); preview(); }));
    body.querySelectorAll("[data-c], [data-card-json], [data-transparent]").forEach((inp) => inp.addEventListener("change", preview));
    body.querySelector('[data-act="cancel"]').addEventListener("click", () => { this.mode = "list"; this.draft = null; this.render(); });
    const del = body.querySelector('[data-act="del"]');
    if (del) del.addEventListener("click", () => { this.widgets = this.widgets.filter((w) => w.id !== d.id); this.mode = "list"; this.selected = null; this._changed(); this.render(); });
    body.querySelector('[data-act="save"]').addEventListener("click", () => {
      const w = this._readForm(body, false);
      if (!w) return;
      const i = this.widgets.findIndex((x) => x.id === w.id);
      if (i >= 0) this.widgets[i] = w; else this.widgets.push(w);
      this.mode = "list"; this.selected = w.id; this.draft = null;
      this._changed(); this.render();
    });
  }
  _readForm(body, quiet) {
    const t = this.t;
    const d = this.draft;
    if (!d) return null;
    const c = Object.assign({}, d.config);
    const err = body.querySelector(".fh-sse-err");
    const fail = (msg) => { if (!quiet && err) { err.textContent = msg; err.style.display = ""; } return null; };
    body.querySelectorAll("[data-c]").forEach((inp) => {
      const k = inp.dataset.c;
      if (inp.type === "checkbox") c[k] = inp.checked;
      else if (k === "calendars") c[k] = inp.value.split(/[,\s]+/).map((s) => s.trim()).filter((s) => s.startsWith("calendar."));
      else if (k === "count" || k === "hold") c[k] = parseInt(inp.value, 10) || defaultConfig(d.kind)[k];
      else c[k] = inp.value.trim();
    });
    let transparent = d.transparent;
    const tr = body.querySelector("[data-transparent]");
    if (tr) transparent = tr.checked;
    const json = body.querySelector("[data-card-json]");
    if (json) {
      try { c.card = JSON.parse(json.value); } catch (e) { return fail(t("ss.card_json_invalid", "That's not valid JSON.")); }
      if (!c.card || typeof c.card !== "object" || !c.card.type) return fail(t("ss.card_json_type", "The card needs a \"type\", like a dashboard card."));
    }
    if (["weather", "clockweather", "entity", "camera"].includes(d.kind) && !c.entity) return fail(t("ss.entity_required", "Pick an entity first."));
    return normalizeWidget({ id: d.id, kind: d.kind, anchor: d.anchor, size: d.size, color: d.color, config: c, transparent });
  }
  destroy() { if (this.layer) this.layer.destroy(); this.host.innerHTML = ""; }
}

window.FamilyHubScreensaver = {
  version: ENGINE_VERSION,
  ANCHORS, SIZES, KINDS,
  normalizeWidget, normalizeWidgets, normalizeOptions, defaultConfig, widgetLabel,
  createLayer: (parent, opts) => new Layer(parent, opts),
  createEditor: (host, opts) => new Editor(host, opts),
};
})();
/* FH-SS-ENGINE END */
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
// A small companion card whose only job is to bring the Family Hub Auto Screen Saver to a dashboard that doesn't have the full Family Week
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

if (!window.__familyHubTimerAlarm) {
  // (timer + alarm overhaul): the on-screen half of a Family Hub timer alarm
  window.__familyHubTimerAlarm = (function () {
    let modalEl = null;
    let audioCtx = null;
    let beepHandle = null;
    const ringing = new Map(); // uid -> {title, body}
    const dismissedUids = new Set();
    let lastHass = null;
    function myClientId() {
      try {
        let id = sessionStorage.getItem("family_hub_client_id");
        if (!id) {
          id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
          sessionStorage.setItem("family_hub_client_id", id);
        }
        return id;
      } catch (e) {
        return "";
      }
    }
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
        '<div class="fh-timer-alarm-box" role="alertdialog" aria-live="assertive" style="background:#fff8ea;color:#3a352c;border-radius:22px;padding:30px 26px;max-width:400px;width:88vw;max-height:86vh;overflow:auto;text-align:center;box-shadow:0 14px 46px rgba(0,0,0,0.45);font-family:-apple-system,\'Segoe UI\',Roboto,sans-serif;">' +
        '<div style="font-size:48px;margin-bottom:6px;">&#9200;</div>' +
        ('<div data-fh-t="text.time_s_up" class="fh-timer-alarm-head" style="font-size:14px;color:#96877a;margin-bottom:14px;font-weight:700;">' + __fhT("text.time_s_up", "Time's up!", null, "h") + '</div>') +
        '<div class="fh-timer-alarm-list" style="display:flex;flex-direction:column;gap:12px;"></div>' +
        ('<button data-fh-t="text.stop_all" type="button" class="fh-timer-alarm-stop-all" style="display:none;margin-top:16px;min-height:46px;width:100%;border:2px solid #8f5a00;border-radius:14px;background:transparent;color:#8f5a00;font-size:16px;font-weight:800;cursor:pointer;">' + __fhT("text.stop_all", "Stop all", null, "h") + '</button>') +
        "</div>";
      document.body.appendChild(modalEl);
      modalEl.addEventListener("click", (e) => {
        const btn = e.target.closest && e.target.closest("button");
        if (!btn) return;
        if (btn.classList.contains("fh-timer-alarm-stop-all")) {
          Array.from(ringing.keys()).forEach((uid) => stop(uid));
        } else if (btn.dataset.uid) {
          stop(btn.dataset.uid);
        }
      });
      return modalEl;
    }
    function render() {
      const el = ensureModal();
      if (!ringing.size) {
        el.style.display = "none";
        return;
      }
      const list = el.querySelector(".fh-timer-alarm-list");
      list.innerHTML = "";
      ringing.forEach((info, uid) => {
        const row = document.createElement("div");
        const title = document.createElement("div");
        title.className = "fh-timer-alarm-title";
        title.style.cssText = "font-size:1.3em;font-weight:800;margin-bottom:4px;overflow-wrap:anywhere;";
        title.textContent = info.title || __fhT("text.timer", "Timer");
        row.appendChild(title);
        if (info.body) {
          const body = document.createElement("div");
          body.style.cssText = "font-size:14px;color:#6b5f52;margin-bottom:10px;overflow-wrap:anywhere;";
          body.textContent = info.body;
          row.appendChild(body);
        }
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "fh-timer-alarm-stop";
        btn.dataset.uid = uid;
        btn.textContent = __fhT("text.stop", "Stop");
        btn.style.cssText = "min-height:54px;width:100%;border:none;border-radius:14px;background:#8f5a00;color:#fff8ea;font-size:19px;font-weight:800;cursor:pointer;";
        row.appendChild(btn);
        list.appendChild(row);
      });
      el.querySelector(".fh-timer-alarm-stop-all").style.display = ringing.size > 1 ? "" : "none";
      el.style.display = "flex";
    }
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
    // A two-pitch alarm-clock trill via Web Audio (no sound file to ship).
    function beepOnce() {
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === "suspended") audioCtx.resume();
        const now = audioCtx.currentTime;
        [[0, 1046], [0.15, 1318], [0.3, 1046]].forEach(([offset, freq]) => playBeep(now + offset, freq));
      } catch (e) {
        // Autoplay blocked or no Web Audio - the modal is still the alarm.
      }
    }
    // Ends whichever Family Hub screensaver is showing (they all close on
    // pointerdown on their own overlay).
    function wakeAnyScreenSaver() {
      try {
        const overlay = document.querySelector("[data-family-hub-screensaver]");
        if (overlay && overlay.style.display !== "none") {
          overlay.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        }
      } catch (e) {
        // best-effort
      }
    }
    function start(uid, title, body, hass) {
      if (hass) lastHass = hass;
      if (!uid || dismissedUids.has(uid)) return;
      const isNew = !ringing.has(uid);
      ringing.set(uid, { title: title || (ringing.get(uid) || {}).title || "Timer", body: body || (ringing.get(uid) || {}).body || "" });
      if (!isNew) return;
      wakeAnyScreenSaver();
      render();
      if (!beepHandle) {
        beepOnce();
        beepHandle = setInterval(beepOnce, 950);
      }
    }
    function stop(uid) {
      if (!uid) return;
      dismissedUids.add(uid);
      const had = ringing.delete(uid);
      if (!ringing.size && beepHandle) {
        clearInterval(beepHandle);
        beepHandle = null;
      }
      render();
      if (had && lastHass && lastHass.connection && lastHass.connection.sendMessagePromise) {
        lastHass.connection.sendMessagePromise({ type: "family_hub/timers/dismiss_alarm", uid }).catch(() => {});
      }
    }
    return {
      // From a card's 1-second countdown tick: the tab that started a timer rings the moment it reaches zero (any timer it started
      check(timers, clientId, remainingSecondsFn, hass) {
        if (hass) lastHass = hass;
        const me = clientId || myClientId();
        if (!me) return;
        (timers || []).forEach((t) => {
          if (t && t.origin_client_id && t.origin_client_id === me && !dismissedUids.has(t.uid) && remainingSecondsFn(t) <= 0) {
            start(t.uid, t.title || "Timer", "", hass);
          }
        });
      },
      // The backend's ring event (and list_active_alarms on load).
      ringBroadcast(payload, hass, myUserId) {
        if (!payload || !payload.uid || dismissedUids.has(payload.uid)) return;
        const targets = payload.target_user_ids || [];
        const fromHere = !!payload.origin_client_id && payload.origin_client_id === myClientId();
        const shouldRing = !!payload.broadcast_all || fromHere || (myUserId && targets.includes(myUserId));
        if (!shouldRing) return;
        start(payload.uid, payload.timer_title || payload.title, payload.body, hass);
      },
      // Someone stopped it somewhere else.
      stopFromServer(uid) {
        if (!uid) return;
        dismissedUids.add(uid);
        if (ringing.delete(uid)) {
          if (!ringing.size && beepHandle) {
            clearInterval(beepHandle);
            beepHandle = null;
          }
          render();
        }
      },
      _ringing() {
        return Array.from(ringing.keys());
      },
    };
  })();
}

// Theme flash-of-default fix - Root cause: EVERY themed card's first paint happens with no theme CSS vars set at all
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
        // Best-effort only - the in-memory copy above still helps every OTHER card mounted later in this same page load even if localStorage itself
      }
    }
    return { get, set };
  })();
}

class FamilyScreensaverCard extends HTMLElement {
  static getStubConfig() {
    return { title: "Screen Saver", return_dashboard_path: "" };
  }
  // Same "let Home Assistant's own schema form handle it" approach as the Family Today card - this card's config is just a title
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
  // switched to getConfigElement (a real custom element) so the Theme picker below can list live Theme Builder + native HA themes
  static getConfigElement() {
    return document.createElement("family-hub-screensaver-card-editor");
  }
  setConfig(config) {
    config = config || {};
    // an optional wrapped `card:` (any Lovelace card config, built-in or custom:*) - for a panel-view dashboard
    const hasCard = config.card && typeof config.card === "object";
    this._config = {
      title: (config.title || "Screen Saver").toString(),
      // normalized (not just trimmed) - see the main card's family-week-calendar-card.js _normalizeDashboardPath for the full "tapping doesn't send
      return_dashboard_path: this._normalizeDashboardPath((config.return_dashboard_path || "").toString()),
      card: hasCard ? config.card : null,
      // per-card Theme override - see family-hub-goals-card.js's identical field/comment for the full precedence story.
      theme_override: (typeof config.theme_override === "string") ? config.theme_override : "",
    };
    if (this._settingsCache === undefined) this._settingsCache = null;
    if (this._screenSaverSettingsSnapshot === undefined) this._screenSaverSettingsSnapshot = null;
    if (this._dashboards === undefined) this._dashboards = null;
    if (this._editModeInternal === undefined) this._editModeInternal = false;
    if (this._globalThemes === undefined) this._globalThemes = [];
    if (!this._built) this._build();
    if (hasCard) this._ensureWrappedCardElement();
    this._render();
  }
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (this._wrappedCardEl) this._wrappedCardEl.hass = hass;
    if (this._screenSaverWidgetEls) {
      Object.values(this._screenSaverWidgetEls).forEach((wrap) => {
        const cardEl = wrap && wrap.firstElementChild;
        if (cardEl) cardEl.hass = hass;
      });
    }
    this._ensureTranslationsLoaded();
    if (first) {
      this._firstLoadPromise = this._initFirstLoad();
    }
  }
  // Lazily creates (once) and keeps mounted the actual child card element for the `card:` config option above
  async _ensureWrappedCardElement() {
    if (this._wrappedCardEl || !this._config.card) return;
    if (typeof window.loadCardHelpers !== "function") {
      // Extremely old frontend without the helper - not worth a manual fallback for a case this unlikely
      this._wrappedCardHelpersMissing = true;
      this._render();
      return;
    }
    const helpers = await window.loadCardHelpers();
    const el = helpers.createCardElement(this._config.card);
    el.hass = this._hass;
    this._wrappedCardEl = el;
    this._renderWrappedCard();
  }
  // Home Assistant's own dashboard editor sets this on any card element that defines it
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
    // always fetch (not just when useGlobalTheme is on) so a per-card theme_override can resolve even when the household hasn't turned on Global
    await this._fetchGlobalThemes();
    if (this._editModeInternal) await this._fetchDashboards();
    this._setupScreenSaverActivityListeners();
    this._resetScreenSaverIdleTimer();
    this._startPolling();
    // this is the standalone screensaver card itself, so it especially needs this.
    this._subscribeAlarmEvents();
  }
  _myUserId() {
    return this._hass && this._hass.user ? this._hass.user.id : null;
  }
  async _subscribeAlarmEvents() {
    if (this._alarmUnsub || !this._hass || !this._hass.connection) return;
    const myUserId = this._myUserId();
    try {
      const unsubRing = await this._hass.connection.subscribeEvents((event) => {
        if (window.__familyHubTimerAlarm) {
          window.__familyHubTimerAlarm.ringBroadcast(event.data, this._hass, typeof this._myUserId === "function" ? this._myUserId() : myUserId);
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
      // Best-effort - a dashboard that can't subscribe (e.g. a very old frontend build) simply never gets the WIDENED alarm reach
    }
    // Catch up on anything already ringing before this tab opened
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
  // Same 60s cadence as the full card - catches a Settings change (new idle time, a login toggled on/off
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
  // Tears everything down when this card leaves the page - most commonly because its dashboard/view was navigated away from.
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
  // Reports a minimal footprint - this card renders at zero height outside edit mode (see _render)
  getCardSize() {
    if (this._wrappedCardEl && typeof this._wrappedCardEl.getCardSize === "function") {
      try {
        const size = this._wrappedCardEl.getCardSize();
        if (typeof size === "number") return size;
      } catch (e) {
        // fall through to the standalone default below
      }
    }
    return 1;
  }
  getLayoutOptions() {
    if (this._wrappedCardEl && typeof this._wrappedCardEl.getLayoutOptions === "function") {
      try {
        return this._wrappedCardEl.getLayoutOptions();
      } catch (e) {
        // fall through
      }
    }
    return { grid_rows: 1, grid_columns: "full", min_rows: 1 };
  }
  getGridOptions() {
    if (this._wrappedCardEl && typeof this._wrappedCardEl.getGridOptions === "function") {
      try {
        return this._wrappedCardEl.getGridOptions();
      } catch (e) {
        // fall through
      }
    }
    return { columns: 12, rows: 1, min_rows: 1 };
  }
  // Only the screenSaver slice of the shared settings blob is read here - everything else (calendars, meal blocks, theme
  _defaultSettings() {
    return {
      screenSaver: {
        sourceType: "video",
        videoUrl: "",
        cameraEntity: "",
        idleSeconds: 180,
        usersEnabled: {},
      },
      screenSaverWidgets: [],
    };
  }
  // Same clamped-percentage, drop-malformed-entries normalization as the main calendar card's own screenSaverWidgets handling
  _normalizeScreenSaverWidgets(parsed) {
    return window.FamilyHubScreensaver.normalizeWidgets(parsed);
  }
  _normalizeSettings(parsed) {
    const defaults = this._defaultSettings();
    if (!parsed || typeof parsed !== "object") return defaults;
    const screenSaverWidgets = this._normalizeScreenSaverWidgets(parsed.screenSaverWidgets);
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
    const options = window.FamilyHubScreensaver.normalizeOptions(parsedScreenSaver);
    return { screenSaver: Object.assign({ sourceType, videoUrl, cameraEntity, idleSeconds, usersEnabled }, options), screenSaverWidgets };
  }
  // Same this-device-only localStorage key as the main calendar card's own _getScreenSaverHiddenWidgetIds - shared by name
  _getScreenSaverHiddenWidgetIds() {
    let raw = null;
    try {
      raw = localStorage.getItem("familyCalendarScreenSaverHiddenWidgetIdsLocal");
    } catch (e) {
    }
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string" && id) : [];
    } catch (e) {
      return [];
    }
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
      // _normalizeSettings above only keeps the screenSaver slice this card actually renders
      this._themeSettingsCache = parsed && typeof parsed === "object" ? parsed : null;
    } catch (e) {
      if (!this._settingsCache) this._settingsCache = this._defaultSettings();
    }
    this._maybeResetScreenSaverIdleTimer();
    this._applyThemeVars();
  }
  // -- Baseline theming (new for this card, v1.111.0+) - applies only to this card's own edit-mode "face" (the dashed-border box
  _defaultTheme() {
    return {
      colors: {
        bg: "#fbf7e5", card: "#f5f3f0", border: "#e6ddc4", text: "#423d34", textSecondary: "#96877a",
        accent: "#8f5a00", accentText: "#fff8ea", accent2: "#305545", accent3: "#b5583c",
        surfaceAlt: "#efe6cf", surface2: "#f2eede",
      },
    };
  }
  _defaultThemeSettings() {
    return { theme: this._defaultTheme(), useGlobalTheme: true, globalThemeId: "slate" };
  }
  // Same this-device-only theme-override key as every other standalone Family Hub card
  _getDeviceThemeOverride() {
    let raw = "";
    try {
      raw = localStorage.getItem("familyHubDeviceThemeOverrideLocal") || "";
    } catch (e) {
    }
    return raw;
  }
  _themeFromGlobalEntry(g) {
    const defaultTheme = this._defaultTheme();
    const colors = {};
    Object.keys(defaultTheme.colors).forEach((k) => {
      const v = g.colors && g.colors[k];
      colors[k] = typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : defaultTheme.colors[k];
    });
    const cardOpacity = typeof g.cardOpacity === "number" ? g.cardOpacity : 100;
    const glassBlur = typeof g.glassBlur === "number" ? g.glassBlur : 0;
    return { colors, fontFamily: (typeof g.fontFamily === "string" && /^[\w\s,'"\-]{1,200}$/.test(g.fontFamily.trim()) ? g.fontFamily.trim() : ""), cardOpacity, glassBlur };
  }
  // Reads settings.theme (the household's Theme Builder default) the same way every other card's own _resolveTheme does
  _resolveTheme() {
    const raw = this._themeSettingsCache;
    const settings = raw && typeof raw === "object" ? Object.assign(this._defaultThemeSettings(), raw) : this._defaultThemeSettings();
    const local = settings.theme || this._defaultTheme();
    // a per-card-placement Theme override (set from this card's own native "Edit Card" dialog) wins over everything else
    const cardOverride = this._config && this._config.theme_override;
    if (cardOverride) {
      const g = (this._globalThemes || []).find((t) => t && t.id === cardOverride);
      if (g) return this._themeFromGlobalEntry(g);
    }
    // a holiday background set to change the theme wins while it's showing
    if (window.__fhHolidayTheme) {
      if (!this.__fhHolidaySub) this.__fhHolidaySub = window.__fhHolidayTheme.subscribe(() => { if (this.isConnected) this._applyThemeVars(); });
      const holidayThemeId = window.__fhHolidayTheme.themeId(this._hass);
      const hg = holidayThemeId && (this._globalThemes || []).find((t) => t && t.id === holidayThemeId);
      if (hg) return this._themeFromGlobalEntry(hg);
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
  // see window.__familyHubThemeCache's own comment above the class for the full "why a key, not one shared blob" reasoning.
  _familyHubThemeCacheKey() {
    const cardOverride = this._config && this._config.theme_override;
    if (cardOverride) return `card:${cardOverride}`;
    const deviceOverride = this._getDeviceThemeOverride();
    if (deviceOverride) return `device:${deviceOverride}`;
    return "household";
  }
  _applyThemeVars() {
    const theme = this._resolveTheme();
    const cardOpacity = typeof theme.cardOpacity === "number" ? theme.cardOpacity : 100;
    this.style.setProperty("--fc-font-family", theme.fontFamily || "");
    this.style.setProperty("--fc-bg", theme.colors.bg);
    this.style.setProperty("--fc-card", this._hexToRgba(theme.colors.card, cardOpacity / 100));
    this.style.setProperty("--fc-border", theme.colors.border);
    this.style.setProperty("--fc-text", theme.colors.text);
    this.style.setProperty("--fc-text-secondary", theme.colors.textSecondary);
    this.style.setProperty("--fc-accent", theme.colors.accent);
    this.style.setProperty("--fc-accent-text", theme.colors.accentText);
    // snapshot exactly what was just set/removed above into the shared cache under this card/placement's key
    if (this._hass && window.__familyHubThemeCache) {
      const __familyHubCacheVarNames = [
      "--fc-bg",
      "--fc-card",
      "--fc-font-family",
      "--fc-border",
      "--fc-text",
      "--fc-text-secondary",
      "--fc-accent",
      "--fc-accent-text",
      ];
      const vars = {};
      __familyHubCacheVarNames.forEach((name) => {
        const v = this.style.getPropertyValue(name);
        if (v) vars[name] = v;
      });
      window.__familyHubThemeCache.set(this._familyHubThemeCacheKey(), vars);
    }
  }
  // applies whatever theme this device/placement last actually resolved to, SYNCHRONOUSLY
  _applyCachedThemeVarsIfAny() {
    if (!window.__familyHubThemeCache) return;
    const cached = window.__familyHubThemeCache.get(this._familyHubThemeCacheKey());
    if (!cached) return;
    Object.keys(cached).forEach((name) => {
      if (typeof cached[name] === "string") this.style.setProperty(name, cached[name]);
    });
  }
  async _fetchGlobalThemes() {
    let custom = [];
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "theme_builder/list" });
      custom = (result && Array.isArray(result.themes)) ? result.themes : [];
    } catch (e) {
      custom = [];
    }
    // also merge in every installed native Home Assistant theme - duplicated
    this._globalThemes = custom.concat(this._nativeHaThemeEntries());
    this._applyThemeVars();
  }
  // -- Native HA theme support (duplicated from family-week-calendar- card.js's identical methods
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
  // Populates the on-card dashboard picker (edit mode only) - listed dashboards only cover Home Assistant's own configured dashboards/strategy
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
  // Whether the current login should ever arm the idle timer - identical rule to the full card's own _screenSaverApplicable
  _screenSaverApplicable() {
    if (!this._hass || !this._hass.user || !this._hass.user.id) return false;
    const ss = this._getSettings().screenSaver;
    if (!ss) return false;
    const hasSource = ss.sourceType === "camera" ? !!ss.cameraEntity : !!ss.videoUrl;
    if (!hasSource) return false;
    return !!(ss.usersEnabled && ss.usersEnabled[this._hass.user.id]);
  }
  // same fix as the full calendar card's own _maybeResetScreenSaverIdleTimer - this card's 60s settings poll
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
  // Same document.body-level overlay trick as the full card's own _ensureScreenSaverOverlay (see its comment there for the full "why")
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
    const widgetsLayer = document.createElement("div");
    widgetsLayer.className = "screensaver-widgets";
    Object.assign(widgetsLayer.style, { position: "absolute", top: "0", left: "0", right: "0", bottom: "0", pointerEvents: "none" });
    el.appendChild(widgetsLayer);
    el.addEventListener("pointerdown", () => this._hideScreenSaver());
    document.body.appendChild(el);
    this._screenSaverOverlayEl = el;
    return el;
  }
  // The widgets are drawn by the screensaver engine this card shares with the calendar card (FH-SS-ENGINE, top of this file),
  // so a layout looks the same whichever card is showing the screensaver
  _renderScreenSaverWidgets(overlay) {
    const layerHost = overlay && overlay.querySelector(".screensaver-widgets");
    if (!layerHost || !window.FamilyHubScreensaver) return;
    if (!this._ssLayer || !this._ssLayer.el.isConnected) this._ssLayer = window.FamilyHubScreensaver.createLayer(layerHost);
    const raw = this._themeSettingsCache || {};
    this._ssLayer.update({
      hass: this._hass,
      getHass: () => this._hass,
      widgets: this._getSettings().screenSaverWidgets || [],
      hiddenIds: this._getScreenSaverHiddenWidgetIds(),
      options: this._getSettings().screenSaver,
      settings: raw,
      t: (k, f, v) => this._t(k, f, v),
      getBackground: () => {
        const v = overlay.querySelector(".screensaver-video");
        const img = overlay.querySelector(".screensaver-camera-image");
        if (v && v.style.display !== "none" && v.readyState >= 2) return v;
        if (img && img.style.display !== "none" && img.naturalWidth) return img;
        return null;
      },
    });
  }
  _showScreenSaver() {
    if (!this._screenSaverApplicable()) return;
    const overlay = this._ensureScreenSaverOverlay();
    const ss = this._getSettings().screenSaver;
    this._renderScreenSaverWidgets(overlay);
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
    if (this._ssLayer) this._ssLayer.show();
  }
  // Dismissing the screensaver is also the "wake" moment for the return-to-dashboard behavior this card exists to add: if a return dashboard is
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
    if (this._ssLayer) this._ssLayer.hide();
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
  // Bound to document/window rather than this card's own shadow root
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
  // see the main card's family-week-calendar-card.js own identical _navigateWithFallback for the full story
  _goToReturnDashboard() {
    const path = this._normalizeDashboardPath(this._config.return_dashboard_path || "");
    if (!path) return;
    this._navigateWithFallback(path);
  }
  _navigateWithFallback(path) {
    const before = window.location.href;
    // See family-week-calendar-card.js's own identical copy of this method for the full root-cause note
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
      if (window.location.href === before) this._hardNavigate(path);
    }, 300);
  }
  _hardNavigate(path) {
    window.location.assign(path);
  }
  // see the main card's family-week-calendar-card.js own identical helper for the full "tapping doesn't send you back to the set dashboard" bug
  _normalizeDashboardPath(raw) {
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (!trimmed) return "";
    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("/")) return trimmed;
    return "/" + trimmed;
  }
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
  _ensureTranslationsLoaded() {
    __fhUseHass(this._hass);
    if (!this._hass || typeof this._hass.loadBackendTranslation !== "function") return;
    const lang = this._baseLanguage(this._hass.language);
    if (this._i18nLoadedLang === lang) {
      // Home Assistant hands cards the hass object that actually knows the newly loaded strings a moment AFTER loadBackendTranslation resolves
      if (this._hass.localize !== this._i18nLocalize) {
        this._i18nLocalize = this._hass.localize;
        // redraw only when our strings changed - a new localize function alone made cards flicker (GitHub issue #16)
        let probe = "";
        try { probe = this._hass.localize("component.family_hub.fh_ui.nav.settings") || ""; } catch (e) { probe = ""; }
        probe = `${this._hass.language}|${probe}`;
        if (probe !== this._i18nLastProbe) {
          this._i18nLastProbe = probe;
          this._onTranslationsReady();
        }
      }
      return;
    }
    if (this._i18nLoading === lang) return;
    this._i18nLoading = lang;
    this._hass
      .loadBackendTranslation("fh_ui", "family_hub")
      .then(() => {
        this._i18nLoadedLang = lang;
        this._i18nLoading = null;
        this._i18nLocalize = this._hass.localize;
        this._onTranslationsReady();
      })
      .catch((e) => {
        this._i18nLoading = null;
        console.warn("[family_hub] failed to load \"" + lang + "\" translations - staying on English fallback text", e);
      });
  }
  // Redraws everything that shows translated text.
  _onTranslationsReady() {
    this._applyTranslations();
    this._render();
  }
  _applyTranslations() {
    __fhSweep(this._root || this.shadowRoot);
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
  _build() {
    this._built = true;
    // applied BEFORE attachShadow/the first innerHTML paint - see _applyCachedThemeVarsIfAny's own comment and window.__familyHub ThemeCache's
    this._applyCachedThemeVarsIfAny();
    const root = this.attachShadow ? this.attachShadow({ mode: "open" }) : this;
    this._root = root;
    root.innerHTML = `
<style>
:host {
display: block;
font-family: var(--fc-font-family, "Arial Rounded MT Std", "Arial Rounded MT", "Varela Round", -apple-system, "Segoe UI Rounded", "Segoe UI", Roboto, sans-serif);
/* v1.111.0+ defaults - same palette every other standalone Family Hub
   card's own _defaultTheme() returns, overridden by _applyThemeVars
   (inline style on the host, so it always wins over these) once
   settings/theme_override resolve. See this card's own _defaultTheme
   comment for why this card never had any of this before. */
--fc-bg: #fbf7e5;
--fc-card: #f5f3f0;
--fc-border: #e6ddc4;
--fc-text: #423d34;
--fc-text-secondary: #96877a;
--fc-accent: #8f5a00;
--fc-accent-text: #fff8ea;
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
background: var(--fc-card);
border: 2px dashed var(--fc-border);
color: var(--fc-text);
}
.title-row { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 800; margin-bottom: 4px; }
.badge { display: inline-flex; align-items: center; justify-content: center; padding: 2px 8px; border-radius: 10px; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; }
.hint { font-size: 12px; color: var(--fc-text-secondary); margin-bottom: 10px; line-height: 1.5; }
.field { margin-bottom: 4px; }
.field label { display: block; font-size: 12px; font-weight: 700; margin-bottom: 4px; }
.field select { width: 100%; box-sizing: border-box; font-size: 14px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-bg); color: var(--fc-text); font-family: inherit; }
.status { font-size: 11px; color: var(--fc-text-secondary); margin-top: 8px; font-style: italic; }
.wrapped-card-host { display: none; }
.wrapped-card-host.active { display: block; }
</style>
<div class="wrapped-card-host"></div>
<div class="card-root">
<div class="title-row"><span class="title-text"></span><span class="badge" data-i18n="screensaver.edit_mode_badge">Edit-mode only</span></div>
<div class="hint" data-i18n="screensaver.hint">Invisible once you're done editing this dashboard - it keeps the screensaver running in the background from wherever it's placed. Screen source, idle time, and which logins it's on for are all set from the full calendar card's own Settings &rarr; Screen Saver section.</div>
<div class="field">
<label data-i18n="screensaver.return_dashboard_label">Return to this dashboard on wake</label>
<select class="return-dashboard-select">
<option value="" data-i18n="screensaver.stay_on_dashboard">Stay on this dashboard</option>
</select>
</div>
<div class="status"></div>
</div>
`;
    root.querySelector(".return-dashboard-select").addEventListener("change", (e) => {
      const value = e.target.value || "";
      this._config = Object.assign({}, this._config, { return_dashboard_path: value });
      // Bubbles up through hui-card the same way a dedicated card editor's own live edits do
      this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config: this._config } }));
      this._updateStatus();
    });
    // this used to unconditionally call `_applyThemeVars()` here too
  }
  _render() {
    if (!this._root) return;
    const hasCard = !!this._config.card;
    // With a wrapped card configured, this card is meant to be the dashboard's actual visible content (a panel view's one-and-only card)
    this.classList.toggle("fh-ss-hidden", !hasCard && !this._editModeInternal);
    this._root.querySelector(".card-root").style.display = hasCard ? "none" : "";
    this._root.querySelector(".wrapped-card-host").classList.toggle("active", hasCard);
    if (hasCard) {
      this._renderWrappedCard();
      return;
    }
    this._root.querySelector(".title-text").textContent = this._config.title || __fhT("text.screen_saver", "Screen Saver");
    this._applyTranslations();
    if (this._editModeInternal) this._renderEditFace();
  }
  _renderWrappedCard() {
    const host = this._root && this._root.querySelector(".wrapped-card-host");
    if (!host) return;
    if (this._wrappedCardEl) {
      if (this._wrappedCardEl.parentElement !== host) host.appendChild(this._wrappedCardEl);
      return;
    }
    if (this._wrappedCardHelpersMissing) {
      host.textContent = this._t("screensaver.wrapped_card_unsupported", "This frontend version can't embed another card here - update Home Assistant, or use this card standalone instead.");
    }
  }
  _renderEditFace() {
    const root = this._root;
    if (!root) return;
    const select = root.querySelector(".return-dashboard-select");
    const current = this._config.return_dashboard_path || "";
    const dashboards = Array.isArray(this._dashboards) ? this._dashboards : [];
    const options = [{ value: "", label: this._t("screensaver.stay_on_dashboard", "Stay on this dashboard") }].concat(
      dashboards
        .filter((d) => d && d.url_path)
        .map((d) => ({ value: `/${d.url_path}/0`, label: d.title || d.url_path }))
    );
    // A manually-typed path (set via YAML or the Edit Card dialog) that doesn't match any listed dashboard's default view still needs to show up
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
      statusEl.textContent = this._t("screensaver.status_not_active", "Screensaver isn't active for your current login yet - enable it under the calendar card's Settings → Screen Saver → Enable for these logins.");
    } else {
      const path = (this._config.return_dashboard_path || "").trim();
      statusEl.textContent = path
        ? this._t("screensaver.status_active_wakes_to", "Active for your login - wakes back to %path%.", { path })
        : this._t("screensaver.status_active_stays", "Active for your login - stays on this dashboard when woken.");
    }
  }
}

if (!customElements.get("family-hub-screensaver-card")) {
  customElements.define("family-hub-screensaver-card", FamilyScreensaverCard);
}

// dedicated editor element for getConfigElement above - same pattern as family-hub-goals-card.js's own editor
class FamilyScreensaverCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    if (!this._themeOptions) this._fetchThemeOptions();
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
  _formData() {
    return {
      title: this._config.title,
      return_dashboard_path: this._config.return_dashboard_path,
      theme_override: (typeof this._config.theme_override === "string") ? this._config.theme_override : "",
    };
  }
  _schema() {
    const base = FamilyScreensaverCard.getConfigForm().schema;
    return base.concat([
      {
        name: "theme_override",
        selector: { select: { mode: "dropdown", options: this._themeOptions || [{ value: "", label: "Use device settings (default)" }] } },
      },
    ]);
  }
  _render() {
    const { computeLabel, computeHelper } = FamilyScreensaverCard.getConfigForm();
    if (this._built) {
      this._form.schema = this._schema();
      this._form.data = this._formData();
      return;
    }
    this._built = true;
    this.innerHTML = "";
    const form = document.createElement("ha-form");
    form.schema = this._schema();
    form.computeLabel = (s) => (s.name === "theme_override" ? "Theme" : computeLabel(s));
    form.computeHelper = (s) => (
      s.name === "theme_override"
        ? "Pin this one card to a specific theme, or leave on \"Use device settings\" to follow whatever this device/household normally shows."
        : computeHelper(s)
    );
    form.data = this._formData();
    if (this._hass) form.hass = this._hass;
    form.addEventListener("value-changed", (e) => {
      e.stopPropagation();
      const merged = Object.assign({}, this._config, e.detail.value);
      this._config = merged;
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: merged }, bubbles: true, composed: true }));
    });
    this._form = form;
    this.appendChild(form);
  }
}
if (!customElements.get("family-hub-screensaver-card-editor")) {
  customElements.define("family-hub-screensaver-card-editor", FamilyScreensaverCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "family-hub-screensaver-card")) {
  window.customCards.push({
    type: "family-hub-screensaver-card",
    name: "Family Hub Screen Saver",
    description: "Invisible outside edit mode - brings the Family Hub auto screensaver to any other dashboard, with an optional dashboard to return to on wake.",
  });
}
