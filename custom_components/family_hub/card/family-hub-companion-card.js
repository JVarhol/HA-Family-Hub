/* Family Hub Companion (2026.11.1) - a child's own bedside screen.
 *
 * One card for one child, made for small screens: a hacked smart clock (800x480), an 8" tablet on a stand, or a
 * cast display. Through the day it shows:
 *   sleep      a dim clock (or nothing), amber "stay in bed", sleep sounds, and a comfort button
 *   wake       "Good morning!", the weather and what to wear, and an alarm
 *   morning / afternoon / bedtime
 *              their Family Hub routine one big step at a time, First -> Then, a big Done button and stars
 *   day        a big clock, what's next on their calendar, their jobs, timers (as a shrinking circle) and stars
 * Messages from grown-ups take over the screen, are read out loud, and stay until "Got it".
 * The part of the day, the room light and the messages come from companion.py; the settings are on the child's
 * profile (Settings > Users > Companion). A physical button (any Home Assistant event/button/binary sensor) does
 * whatever the big button on screen would.
 *
 * Old Android browsers run this (smart clocks), so: no optional chaining, no ??, no flex gap, no color-mix,
 * no aspect-ratio, no :has - plain ES2017 and CSS that Chrome 61 understands.
 */
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
      };
      if (this._root) this._render();
    }
    getCardSize() {
      return 8;
    }
    connectedCallback() {
      this._connected = true;
      if (!this._root) this._build();
      this._startLoops();
      if (this._hass) this._subscribe();
    }
    disconnectedCallback() {
      this._connected = false;
      this._stopLoops();
      this._unsubscribe();
      if (this._sound) this._sound.stopAll();
      if (this._ro) { try { this._ro.disconnect(); } catch (e) { /* ok */ } }
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
      this._watchButton();
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
      }
      await Promise.all(jobs);
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
      const items = ((this._rewards && this._rewards.catalog) || []).filter((i) => i && Number(i.cost_stars) > 0);
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
      this._root.innerHTML = "<style>" + this._css() + "</style><div class=\"wrap\"><div class=\"screen\"></div><div class=\"overlay\"></div></div>";
      this._sound = new CompanionSound();
      const wrap = this._root.querySelector(".wrap");
      wrap.addEventListener("click", (e) => this._onClick(e));
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
    // one size unit from the card's own size, so the same layout reads from across a bedroom on any screen
    _fit() {
      const wrap = this._root && this._root.querySelector(".wrap");
      if (!wrap) return;
      const w = wrap.clientWidth || 800;
      const h = wrap.clientHeight || 480;
      const u = Math.max(8, Math.min(w / 40, h / 24));
      wrap.style.fontSize = u.toFixed(1) + "px";
      wrap.classList.toggle("tall", h > w * 1.1);
      wrap.classList.toggle("tiny", w < 520 || h < 340);
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
      if (act === "step") this._doneStep(id);
      else if (act === "chore") this._doneChore(id);
      else if (act === "ack") this._ack(id);
      else if (act === "up") this._stopAlarm(true);
      else if (act === "comfort") this._startComfort();
      else if (act === "comfort-stop") this._endComfort();
      else if (act === "sound") { this._sound.unlock(); this._render(); }
      else if (act === "gu-close") { this._grownups = false; this._render(); }
      else if (act === "gu-mode") this._setMode(id);
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
      try { await this._ws({ type: "family_hub/chores/complete", chore_id: id }); } catch (e) { c.status = "open"; }
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
      const sig = [mode, Math.floor(Date.now() / 60000), !!this._comfortUntil, !!(this._burst && this._burst.until > Date.now()), !!(this._allDoneUntil && this._allDoneUntil > Date.now()), this._peekUntil > Date.now()].join("|");
      if (sig !== this._sig) this._render();
      else this._paintLive();
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
      wrap.style.height = this._config.height;
      this._fit();
      const mode = this._mode();
      const now = Date.now();
      this._sig = [mode, Math.floor(now / 60000), !!this._comfortUntil, !!(this._burst && this._burst.until > now), !!(this._allDoneUntil && this._allDoneUntil > now), this._peekUntil > now].join("|");
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
      else if (mode === "wake" && this._alarmDoneFor !== dayKey(new Date())) html = this._wakeHtml();
      else if (this._allDoneUntil && this._allDoneUntil > now) html = this._allDoneHtml(cat);
      else if (left.length) html = this._routineHtml(cat, steps, left);
      else { html = this._dayHtml(); if (mode !== "bedtime") theme = "day"; }
      wrap.className = "wrap m-" + theme + (wrap.classList.contains("tall") ? " tall" : "") + (wrap.classList.contains("tiny") ? " tiny" : "");
      screen.innerHTML = html;
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
      const bal = this._balance();
      const goal = this._goal();
      let g = "";
      if (goal) {
        const cost = Number(goal.cost_stars) || 1;
        const pct = Math.min(100, Math.round((bal / cost) * 100));
        const more = Math.max(0, cost - bal);
        g = "<div class=\"goal\"><span class=\"goal-ico\">" + esc(goal.icon || "\u{1F381}") + "</span><span class=\"goal-txt\"><b>" + esc(goal.title) + "</b><span>" + esc(more ? this._t("companion.n_more", "%n% more ⭐", { n: more }) : this._t("companion.can_get", "You can get it!")) + "</span><span class=\"bar\"><i style=\"width:" + pct + "%\"></i></span></span></div>";
      }
      return "<div class=\"stars\"><div class=\"star-count\">⭐ " + bal + "</div>" + g + "</div>";
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
        + "<div class=\"r-body\"><div class=\"now\"><span class=\"now-lbl\">" + esc(this._t("companion.now", "Now")) + "</span><div class=\"step-ico\">" + this._emoji(cur.title) + "</div><div class=\"step-t\">" + esc(cur.title) + "</div>" + due + stars + "</div>"
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
      if (chores.length) {
        const c = chores[0];
        blocks.push("<div class=\"card job\"><span class=\"c-ico\">" + this._emoji(c.title) + "</span><span class=\"c-txt\"><b>" + esc(c.title) + "</b><span>" + esc(chores.length > 1 ? this._t("companion.jobs_left", "%n% jobs left", { n: chores.length }) : this._t("companion.one_job_left", "Your last job")) + "</span></span><button class=\"big-btn small\" data-act=\"chore\" data-id=\"" + esc(c.id) + "\">✔</button></div>");
      }
      if (cd && blocks.length < 3) blocks.push("<div class=\"card cd\"><span class=\"c-ico\">\u{1F31F}</span><span class=\"c-txt\"><b>" + esc(cd.days === 1 ? this._t("companion.one_sleep", "1 sleep until %what%!", { what: cd.label }) : this._t("companion.n_sleeps", "%n% sleeps until %what%!", { n: cd.days, what: cd.label })) + "</b></span></div>");
      let bedLine = "";
      if (mode === "bedtime") {
        const bt = this._state && this._state.bedtime_today ? this._state.bedtime_today : cfg.bedtime;
        bedLine = "<div class=\"bed-line\">\u{1F319} " + esc(this._t("companion.bedtime_at", "Bedtime at %time%", { time: this._fmtHHMM(bt) })) + "</div>";
      }
      return "<div class=\"day\"><div class=\"day-main\">" + this._clockHtml("clock-big") + bedLine + this._starsHtml() + "</div><div class=\"day-side\">" + (blocks.join("") || "<div class=\"card free\"><span class=\"c-ico\">\u{1F60E}</span><span class=\"c-txt\"><b>" + esc(this._t("companion.free_time", "Free time!")) + "</b></span></div>") + "</div></div>";
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
        ".day-main{flex:1.2;display:flex;flex-direction:column;align-items:center;text-align:center}",
        ".day-side{flex:1;display:flex;flex-direction:column;justify-content:center;padding-left:0.8em}",
        ".vt-row{width:auto;height:auto}.vt-row svg{width:3.6em;height:3.6em;margin-right:0.5em;flex:0 0 auto}.vt-row .vt-txt{position:static;text-align:left}",
        ".card{display:flex;align-items:center;background:#fff;border-radius:1.1em;padding:0.6em 0.8em;margin:0.3em 0;box-shadow:0 0.15em 0 rgba(0,0,0,0.06)}",
        ".m-bedtime .card{background:rgba(255,255,255,0.12)}",
        ".c-ico{font-size:2.2em;margin-right:0.4em}.c-txt{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.15}.c-txt b{font-size:1.3em}.c-txt span{opacity:0.7;font-size:1.05em}",
        ".bed-line{font-size:1.4em;font-weight:700;color:#cfc4ff;margin:0.2em 0}",
        ".stars{display:flex;flex-direction:column;align-items:center;margin-top:0.6em}",
        ".star-count{font-size:2em;font-weight:800}",
        ".goal{display:flex;align-items:center;background:rgba(255,255,255,0.7);border-radius:1em;padding:0.4em 0.8em;margin-top:0.3em;min-width:14em}",
        ".m-bedtime .goal{background:rgba(255,255,255,0.12)}",
        ".goal-ico{font-size:1.8em;margin-right:0.4em}.goal-txt{flex:1;display:flex;flex-direction:column;text-align:left;line-height:1.2}.goal-txt span{font-size:0.95em;opacity:0.75}",
        ".bar{display:block;height:0.55em;background:rgba(0,0,0,0.1);border-radius:1em;overflow:hidden;margin-top:0.2em}.bar i{display:block;height:100%;background:#f0a030;border-radius:1em}",
        ".alldone .party{font-size:5em}.alldone p{font-size:1.5em;margin:0}",
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
      ].join("\n");
    }
  }
  customElements.define("family-hub-companion-card", FamilyHubCompanionCard);
  window.FamilyHubCompanionSound = CompanionSound;

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
        ]).then((res) => {
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
      ];
      this._form.data = Object.assign({ person: "me", height: "100vh", clock_seconds: false }, this._config || {});
      this._form.computeLabel = (s) => ({ person: "Child", button_entity: "Physical button (optional)", height: "Height", clock_seconds: "Show seconds" })[s.name];
      this._form.computeHelper = (s) => ({
        person: "Whose Companion this is. Their wake-up, bedtime, sounds and room light are set in Family Hub Settings > Users > their profile > Companion.",
        button_entity: "A button by the bed: pressing it does what the big button on screen does (Done, Got it, I'm up). At night it starts the comfort breathing.",
        height: "100vh fills the screen (use a Panel view). Or a size like 480px.",
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
