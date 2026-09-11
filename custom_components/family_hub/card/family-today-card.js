(function () {
  if (window.__familyCalendarFontLoaded) return;
  window.__familyCalendarFontLoaded = true;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Varela+Round&display=swap";
  document.head.appendChild(link);
})();

// A fixed accent color for reminder rows - reminders aren't tied to any
// one calendar (and so have no calendar color of their own), but still
// need to look consistent wherever they show up. Matches the same
// constant in family-week-calendar-card.js so the two cards agree.
const TODAY_REMINDER_COLOR = "#b58cd9";

// A small, single-day companion to the full Family Week Calendar card -
// meant to be pasted onto any dashboard (a phone's default view, a small
// tile next to other cards, etc.) to see just "what's going on today"
// without the week/month grid. Reads the exact same config + settings_entity
// as the full card, so it automatically matches its theme, calendars, meal
// blocks, and entities - there is nothing new to configure if you're
// already running the full card.
class FamilyTodayCard extends HTMLElement {
  // Lets the card be added via the dashboard's "+ Add Card" picker with
  // working defaults straight away - these match the entity ids the full
  // Family Week Calendar card's own Settings suggests/creates, so a family
  // already running the full card needs zero edits for the common case.
  static getStubConfig() {
    return {
      title: "Today",
      settings_entity: "todo.family_calendar_settings",
      meal_plan_entity: "todo.meal_plan",
      reminders_entity: "todo.family_reminders",
      weather_entity: "weather.forecast_home",
    };
  }
  // Uses Home Assistant's built-in schema-based form editor rather than a
  // hand-built custom editor element - this card's config is just a
  // handful of entity pickers plus a title, so the generic form covers the
  // common case with far less code to maintain. `people` is deliberately
  // left out of the form: in practice it's read from the shared
  // settings_entity's own Settings (see _getPeople) and only needs to be
  // set here directly for a rare standalone override, which is still fully
  // supported by hand-editing the YAML.
  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "settings_entity", selector: { entity: { domain: "todo" } } },
        { name: "meal_plan_entity", selector: { entity: { domain: "todo" } } },
        { name: "reminders_entity", selector: { entity: { domain: "todo" } } },
        { name: "weather_entity", selector: { entity: { domain: "weather" } } },
        { name: "calendar_dashboard_path", selector: { text: {} } },
        { name: "calendar_button_label", selector: { text: {} } },
      ],
      computeLabel: (schema) => {
        const labels = {
          title: "Title",
          settings_entity: "Settings to-do list (shared with the full card)",
          meal_plan_entity: "Meal plan to-do list",
          reminders_entity: "Reminders to-do list",
          weather_entity: "Weather entity",
          calendar_dashboard_path: "Calendar dashboard path",
          calendar_button_label: "Calendar button label",
        };
        return labels[schema.name] || undefined;
      },
      computeHelper: (schema) => {
        if (schema.name === "settings_entity") {
          return "Same to-do entity configured on the full Family Week Calendar card - reused here so the theme, people, and meal blocks automatically match.";
        }
        if (schema.name === "calendar_dashboard_path") {
          return "Optional. Set a relative path (e.g. /lovelace-family/0) and a 'Go to Calendar' button appears at the bottom of the card, jumping straight to your full calendar dashboard/view.";
        }
        return undefined;
      },
    };
  }
  setConfig(config) {
    config = config || {};
    const palette = ["#a9c6c2", "#dba99c", "#d9bf7e", "#a8bd93", "#b9a7c9", "#cf8f6c", "#a89a83"];
    const rawPeople = Array.isArray(config.people) ? config.people : [];
    this._config = {
      title: config.title || "Today",
      people: rawPeople.map((p, i) => ({
        entity: p.entity,
        name: p.name || p.entity,
        color: p.color || palette[i % palette.length],
        badges: Array.isArray(p.badges) ? p.badges : [],
      })),
      meal_plan_entity: config.meal_plan_entity || "todo.meal_plan",
      reminders_entity: config.reminders_entity || "todo.family_reminders",
      settings_entity: config.settings_entity || "todo.family_calendar_settings",
      weather_entity: config.weather_entity || "weather.forecast_home",
      // Optional footer button that jumps straight to a full calendar
      // dashboard/view - blank by default so nothing new appears unless
      // explicitly configured. calendar_dashboard_path is a relative path
      // like "/lovelace-family/0" (see the full card's own README for the
      // dashboard/view path format).
      calendar_dashboard_path: (config.calendar_dashboard_path || "").toString().trim(),
      calendar_button_label: (config.calendar_button_label || "").toString().trim(),
      // Accepted (and ignored) so the exact same YAML block used for the
      // full family-week-calendar-card can be pasted in here unedited.
      recipe_entity: config.recipe_entity || "todo.recipe_box",
      meal_templates_entity: config.meal_templates_entity || "todo.meal_plan_templates",
      suggestions_entity: config.suggestions_entity || "todo.meal_suggestions",
      birthdays_entity: config.birthdays_entity || "calendar.birthdays",
    };
    if (this._settingsCache === undefined) this._settingsCache = null;
    if (this._globalThemes === undefined) this._globalThemes = [];
    if (this._todayEvents === undefined) this._todayEvents = [];
    if (this._todayBadges === undefined) this._todayBadges = [];
    if (this._todayMeals === undefined) this._todayMeals = [];
    if (this._todayReminders === undefined) this._todayReminders = [];
    if (this._forecastToday === undefined) this._forecastToday = null;
    if (this._mealPlanRaw === undefined) this._mealPlanRaw = {};
    if (this._recurringMeals === undefined) this._recurringMeals = [];
    if (this._firstLoadPromise === undefined) this._firstLoadPromise = null;
    if (!this._built) this._build();
    this._renderHeader();
  }
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) {
      this._firstLoadPromise = this._initFirstLoad();
    }
  }
  async _initFirstLoad() {
    await this._fetchSettings();
    if ((this._getSettings().useGlobalTheme)) await this._fetchGlobalThemes();
    this._refreshAll();
    this._startPolling();
  }
  _refreshAll() {
    this._fetchTodayEvents();
    this._fetchTodayMeals();
    this._fetchTodayReminders();
    this._fetchWeather();
  }
  _startPolling() {
    if (this._interval) return;
    this._interval = setInterval(() => {
      this._fetchSettings();
      this._refreshAll();
    }, 60 * 1000);
  }
  connectedCallback() {
    if (this._hass && !this._interval) {
      if (this._firstLoadPromise) {
        this._firstLoadPromise.then(() => {
          if (this.isConnected && this._hass && !this._interval) {
            this._refreshAll();
            this._startPolling();
          }
        });
      } else {
        this._fetchSettings();
        this._refreshAll();
        this._startPolling();
      }
    }
    // Refresh at the next local midnight so a card left open overnight
    // rolls over to the new day's events/meals/reminders on its own,
    // without needing a manual refresh.
    this._scheduleMidnightRefresh();
  }
  disconnectedCallback() {
    if (this._interval) clearInterval(this._interval);
    this._interval = null;
    if (this._midnightTimeout) clearTimeout(this._midnightTimeout);
    this._midnightTimeout = null;
  }
  _scheduleMidnightRefresh() {
    if (this._midnightTimeout) clearTimeout(this._midnightTimeout);
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 5, 0);
    const ms = nextMidnight.getTime() - now.getTime();
    this._midnightTimeout = setTimeout(() => {
      this._renderHeader();
      this._refreshAll();
      this._scheduleMidnightRefresh();
    }, ms);
  }
  getCardSize() {
    return 4;
  }
  // Sections-view "Layout" tab sizing (current API). `rows` is left unset
  // so the card auto-fits its content height by default (a day with one
  // event looks shorter than a day with five) - but if someone manually
  // drags the card to a shorter height in the Layout tab, the grid DOES
  // impose a fixed height on this element, and the card's own CSS (:host
  // height:100%, .body-scroll flex:1 + overflow-y:auto) makes it scroll
  // internally rather than overflowing past its assigned space. Width is
  // resizable between a compact 4-column tile and a full 12-column row.
  getGridOptions() {
    return {
      columns: 6,
      min_columns: 4,
      max_columns: 12,
      min_rows: 4,
    };
  }
  // Older frontends only understand the deprecated grid_* keys - kept
  // alongside getGridOptions so the card still lays out sensibly there.
  getLayoutOptions() {
    return { grid_rows: "auto", grid_columns: 6, grid_min_rows: 4 };
  }
  _dateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  _toDate(part) {
    if (!part) return null;
    if (part.dateTime) return new Date(part.dateTime);
    if (part.date) return new Date(part.date + "T00:00:00");
    return null;
  }
  _defaultTheme() {
    return {
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
    };
  }
  _defaultSettings() {
    return {
      blocks: ["Breakfast", "Lunch", "Dinner"],
      weekendBreakfast: false,
      people: [],
      theme: this._defaultTheme(),
      useGlobalTheme: false,
      globalThemeId: "",
    };
  }
  // Only reads the handful of shared-settings fields this card actually
  // needs (blocks, weekend-breakfast, people, theme) - everything else in
  // the settings blob (countdown, Daily Digest, timeline range, etc.) is
  // simply ignored here since this card doesn't render any of it. This is
  // deliberately lenient/forward-compatible: an older or newer settings
  // blob shape never breaks this card, it just falls back to defaults for
  // any field it doesn't recognize.
  _normalizeSettings(parsed) {
    const defaults = this._defaultSettings();
    if (!parsed || typeof parsed !== "object") return defaults;
    const blocks = Array.isArray(parsed.blocks) && parsed.blocks.length ? parsed.blocks.map((b) => String(b)) : defaults.blocks;
    const weekendBreakfast = typeof parsed.weekendBreakfast === "boolean" ? parsed.weekendBreakfast : defaults.weekendBreakfast;
    const people = Array.isArray(parsed.people) ? parsed.people : defaults.people;
    const defaultTheme = defaults.theme;
    const parsedTheme = parsed.theme && typeof parsed.theme === "object" ? parsed.theme : {};
    const colors = {};
    Object.keys(defaultTheme.colors).forEach((k) => {
      const v = parsedTheme.colors && parsedTheme.colors[k];
      colors[k] = typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : defaultTheme.colors[k];
    });
    const fonts = {};
    Object.keys(defaultTheme.fonts).forEach((k) => {
      const raw = parsedTheme.fonts && parsedTheme.fonts[k];
      const n = typeof raw === "number" ? raw : parseInt(raw, 10);
      fonts[k] = Number.isFinite(n) && n >= 6 && n <= 72 ? n : defaultTheme.fonts[k];
    });
    const useGlobalTheme = typeof parsed.useGlobalTheme === "boolean" ? parsed.useGlobalTheme : defaults.useGlobalTheme;
    const globalThemeId = typeof parsed.globalThemeId === "string" ? parsed.globalThemeId : defaults.globalThemeId;
    return { blocks, weekendBreakfast, people, theme: { colors, fonts }, useGlobalTheme, globalThemeId };
  }
  _getSettings() {
    return this._settingsCache || this._defaultSettings();
  }
  _getPeople() {
    const settings = this._getSettings();
    if (Array.isArray(settings.people) && settings.people.length) {
      const palette = ["#a9c6c2", "#dba99c", "#d9bf7e", "#a8bd93", "#b9a7c9", "#cf8f6c", "#a89a83"];
      return settings.people
        .filter((p) => p && p.entity)
        .map((p, i) => ({
          entity: p.entity,
          name: p.name || p.entity,
          color: p.color || palette[i % palette.length],
          badges: Array.isArray(p.badges) ? p.badges : [],
          remindersEntity: p.remindersEntity || "",
        }));
    }
    return this._config.people;
  }
  _getBlocksForToday() {
    const settings = this._getSettings();
    const blocks = settings.blocks.slice();
    const dayIndex = new Date().getDay();
    const isWeekend = dayIndex === 0 || dayIndex === 6;
    if (settings.weekendBreakfast && isWeekend && !blocks.some((b) => /breakfast/i.test(b))) {
      blocks.unshift("Breakfast");
    }
    return blocks;
  }
  _resolveTheme(settings) {
    const local = settings.theme || this._defaultTheme();
    if (!settings.useGlobalTheme || !settings.globalThemeId) return local;
    const list = Array.isArray(this._globalThemes) ? this._globalThemes : [];
    const g = list.find((t) => t && t.id === settings.globalThemeId);
    if (!g) return local;
    const defaultTheme = this._defaultTheme();
    const colors = {};
    Object.keys(defaultTheme.colors).forEach((k) => {
      const v = g.colors && g.colors[k];
      colors[k] = typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : defaultTheme.colors[k];
    });
    const fonts = {};
    Object.keys(defaultTheme.fonts).forEach((k) => {
      const raw = g.fonts && g.fonts[k];
      const n = typeof raw === "number" ? raw : parseInt(raw, 10);
      fonts[k] = Number.isFinite(n) && n >= 6 && n <= 72 ? n : defaultTheme.fonts[k];
    });
    return { colors, fonts, effects: g.effects || null, background: g.background || null };
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
  _buildBoxShadow(effects) {
    if (!effects) return null;
    const shadow = effects.shadow || {};
    const glow = effects.glow || {};
    const layers = [];
    if (shadow.enabled !== false) {
      layers.push(
        `${shadow.offsetX || 0}px ${shadow.offsetY || 0}px ${shadow.blurRadius || 0}px ${shadow.spreadRadius || 0}px ${this._hexToRgba(shadow.color || "#000000", typeof shadow.opacity === "number" ? shadow.opacity : 0.16)}`
      );
    }
    if (glow.enabled) {
      layers.push(`0 0 ${glow.blurRadius || 0}px 0 ${this._hexToRgba(glow.color || "#ffd21a", typeof glow.opacity === "number" ? glow.opacity : 0.6)}`);
    }
    return layers.length ? layers.join(", ") : null;
  }
  _applyThemeVars() {
    const settings = this._getSettings();
    const theme = this._resolveTheme(settings);
    this.style.setProperty("--fc-bg", theme.colors.bg);
    this.style.setProperty("--fc-card", theme.colors.card);
    this.style.setProperty("--fc-border", theme.colors.border);
    this.style.setProperty("--fc-text", theme.colors.text);
    this.style.setProperty("--fc-text-secondary", theme.colors.textSecondary);
    this.style.setProperty("--fc-accent", theme.colors.accent);
    this.style.setProperty("--fc-accent-text", theme.colors.accentText);
    this.style.setProperty("--fc-accent2", theme.colors.accent2);
    this.style.setProperty("--fc-accent3", theme.colors.accent3);
    this.style.setProperty("--fc-surface-alt", theme.colors.surfaceAlt);
    this.style.setProperty("--fc-surface2", theme.colors.surface2);
    this.style.setProperty("--fs-header-title", `${theme.fonts.headerTitle}px`);
    this.style.setProperty("--fs-event", `${theme.fonts.event}px`);
    this.style.setProperty("--fs-chip", `${theme.fonts.chip}px`);
    this.style.setProperty("--fs-wx-temp", `${theme.fonts.wxTemp}px`);
    const shadowCss = this._buildBoxShadow(theme.effects);
    if (shadowCss) this.style.setProperty("--fc-shadow", shadowCss);
    else this.style.removeProperty("--fc-shadow");
    const bg = theme.background;
    if (bg && bg.image) {
      this.style.setProperty("--fc-bg-image", `url("${bg.image.replace(/"/g, '\\"')}")`);
      this.style.setProperty("--fc-bg-size", bg.size === "repeat" ? "auto" : bg.size || "cover");
      this.style.setProperty("--fc-bg-position", bg.position || "center");
      this.style.setProperty("--fc-bg-blur", `${bg.blur || 0}px`);
      this.style.setProperty("--fc-bg-image-opacity", typeof bg.opacity === "number" ? bg.opacity : 1);
      this.style.setProperty(
        "--fc-bg-overlay-image",
        `linear-gradient(${this._hexToRgba(bg.overlayColor || "#000000", bg.overlayOpacity || 0)}, ${this._hexToRgba(bg.overlayColor || "#000000", bg.overlayOpacity || 0)})`
      );
    } else {
      this.style.removeProperty("--fc-bg-image");
      this.style.removeProperty("--fc-bg-size");
      this.style.removeProperty("--fc-bg-position");
      this.style.removeProperty("--fc-bg-blur");
      this.style.removeProperty("--fc-bg-image-opacity");
      this.style.removeProperty("--fc-bg-overlay-image");
    }
  }
  async _fetchSettings() {
    if (!this._hass) return;
    try {
      const result = await this._hass.connection.sendMessagePromise({
        type: "call_service",
        domain: "todo",
        service: "get_items",
        service_data: { status: ["needs_action", "completed"] },
        target: { entity_id: this._config.settings_entity },
        return_response: true,
      });
      const items = (result && result.response && result.response[this._config.settings_entity] && result.response[this._config.settings_entity].items) || [];
      const matches = items.filter((it) => it.summary === "Settings");
      const item = matches.length ? matches[matches.length - 1] : items[0] || null;
      let parsed = null;
      if (item && item.description) {
        try {
          parsed = JSON.parse(item.description);
        } catch (e) {
          parsed = null;
        }
      }
      this._settingsCache = this._normalizeSettings(parsed);
    } catch (e) {
      if (!this._settingsCache) this._settingsCache = this._defaultSettings();
    }
    this._applyThemeVars();
    this._renderHeader();
  }
  async _fetchGlobalThemes() {
    if (!this._hass) return;
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "theme_builder/list" });
      this._globalThemes = (result && Array.isArray(result.themes)) ? result.themes : [];
    } catch (e) {
      this._globalThemes = [];
    }
    this._applyThemeVars();
  }
  async _getItems(entityId) {
    const result = await this._hass.connection.sendMessagePromise({
      type: "call_service",
      domain: "todo",
      service: "get_items",
      service_data: { status: ["needs_action", "completed"] },
      target: { entity_id: entityId },
      return_response: true,
    });
    return (result && result.response && result.response[entityId] && result.response[entityId].items) || [];
  }
  _parseDishDescription(raw) {
    if (!raw) return { description: "", link: "", color: null, block: 0, recur: null };
    try {
      const parsed = JSON.parse(raw);
      return {
        description: parsed.description || "",
        link: parsed.link || "",
        color: parsed.color || null,
        block: typeof parsed.block === "number" ? parsed.block : 0,
        recur: parsed.recur || null,
      };
    } catch (e) {
      return { description: raw, link: "", color: null, block: 0, recur: null };
    }
  }
  _parseReminderRollover(raw) {
    const match = /<!--rollover:1-->/.exec(raw || "");
    return { description: (raw || "").replace(/<!--rollover:1-->/, "").trim(), rollover: !!match };
  }
  async _fetchTodayEvents() {
    if (!this._hass) return;
    const today = new Date();
    const dayStart = new Date(today);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayStart.getDate() + 1);
    const people = this._getPeople();
    const results = [];
    // Deduped by "text|color" so two same-badge events today don't stack
    // duplicate bubbles next to the date - one bubble per distinct badge is
    // enough to signal "something's up today", same intent as the full
    // card's per-day custody badge.
    const badgeMap = new Map();
    await Promise.all(
      people.map(async (person) => {
        if (!person.entity) return;
        const personBadges = person.badges || [];
        try {
          const events = await this._hass.callApi(
            "GET",
            `calendars/${person.entity}?start=${encodeURIComponent(dayStart.toISOString())}&end=${encodeURIComponent(dayEnd.toISOString())}`
          );
          for (const ev of events || []) {
            const start = this._toDate(ev.start);
            const end = this._toDate(ev.end);
            if (!start) continue;
            const summaryLower = (ev.summary || "").toLowerCase();
            // A per-calendar "hide when contains" keyword drops the event
            // entirely (e.g. a background custody-schedule calendar) -
            // same as the full card's month/week grids.
            const hideMatched = personBadges.some((b) => {
              const hideMatch = (b.hideMatch || "").trim().toLowerCase();
              return hideMatch && summaryLower.includes(hideMatch);
            });
            if (hideMatched) continue;
            // A "show badge when contains" keyword swaps the full event
            // row for a small colored bubble next to today's date instead
            // - keeps the agenda from being cluttered by all-day custody
            // markers while still surfacing that something matched today.
            let matchedBadge = false;
            for (const b of personBadges) {
              const badgeMatch = (b.match || "").trim().toLowerCase();
              if (badgeMatch && summaryLower.includes(badgeMatch)) {
                matchedBadge = true;
                if (b.text) badgeMap.set(`${b.text}|${person.color}`, { text: b.text, color: person.color });
              }
            }
            if (matchedBadge) continue;
            results.push({
              summary: ev.summary || "(untitled)",
              start,
              end,
              allDay: !ev.start || !ev.start.dateTime,
              location: ev.location || "",
              description: ev.description || "",
              color: person.color,
              personName: person.name,
            });
          }
        } catch (e) {
          // One bad calendar shouldn't blank out the rest of today.
        }
      })
    );
    results.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.start - b.start;
    });
    this._todayEvents = results;
    this._todayBadges = Array.from(badgeMap.values());
    this._render();
  }
  async _fetchTodayMeals() {
    if (!this._hass) return;
    try {
      const items = await this._getItems(this._config.meal_plan_entity);
      const map = {};
      const recurring = [];
      for (const it of items) {
        const dateKey = (it.due || "").slice(0, 10);
        if (!dateKey) continue;
        const parsed = this._parseDishDescription(it.description);
        const blockIndex = parsed.block || 0;
        if (!map[dateKey]) map[dateKey] = {};
        map[dateKey][blockIndex] = {
          uid: it.uid,
          name: it.summary,
          description: parsed.description,
          link: parsed.link,
          color: parsed.color,
          recur: parsed.recur,
        };
        if (parsed.recur === "weekly") {
          const anchorDate = new Date(`${dateKey}T00:00:00`);
          recurring.push({
            uid: it.uid,
            weekday: anchorDate.getDay(),
            blockIndex,
            name: it.summary,
            description: parsed.description,
            link: parsed.link,
            color: parsed.color,
            anchorDateKey: dateKey,
          });
        }
      }
      this._mealPlanRaw = map;
      this._recurringMeals = recurring;
    } catch (e) {
      this._mealPlanRaw = {};
      this._recurringMeals = [];
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateKey = this._dateKey(today);
    const blocks = this._getBlocksForToday();
    this._todayMeals = blocks
      .map((label, blockIndex) => {
        const meal = this._getMealForDay(dateKey, today, blockIndex);
        return meal ? { label, blockIndex, ...meal } : null;
      })
      .filter(Boolean);
    this._render();
  }
  // Same resolution rule as the full card's _getMealForDay: an explicit
  // entry for this exact date always wins (whether it's a recurring
  // anchor or a one-off override), otherwise the nearest "repeat weekly"
  // anchor whose weekday + block match and whose own date is on or before
  // today (never projects backward).
  _getMealForDay(dateKey, dayDate, blockIndex) {
    const explicit = this._mealPlanRaw[dateKey] && this._mealPlanRaw[dateKey][blockIndex];
    if (explicit) return explicit;
    const weekday = dayDate.getDay();
    let best = null;
    for (const t of this._recurringMeals || []) {
      if (t.weekday !== weekday || t.blockIndex !== blockIndex) continue;
      if (dateKey < t.anchorDateKey) continue;
      if (!best || t.anchorDateKey > best.anchorDateKey) best = t;
    }
    if (!best) return null;
    return { uid: best.uid, name: best.name, description: best.description, link: best.link, color: best.color, recur: "weekly" };
  }
  // v144.2+ (task #21): mirrors the full calendar card's own v130+
  // multi-list subscription rule (see family-week-calendar-card.js's
  // _fetchReminders) instead of only ever pulling from the one shared
  // family list. Every logged-in profile also sees, folded into the same
  // this._todayReminders array: their OWN individual list (settings.
  // people[i].remindersEntity for whichever person their userProfile.
  // primaryCalendar points at), shown unconditionally - no subscription
  // needed for your own list - and every OTHER person's individual list
  // they're subscribed to at EITHER tier (remindersSubscriptions[personEntity]
  // === "calendar" or "calendar_alert"; both tiers are equivalent to
  // "visible" here, same as the calendar card). Each returned item is
  // tagged with which list it came from (listEntity), that list's color
  // (null for the family list) and personName (null for the family list)
  // so "Done" can target the right entity and items can be styled per
  // owner. A person whose individual list entity happens to equal the
  // family entity is only ever fetched once.
  async _fetchTodayReminders() {
    if (!this._hass) return;
    const familyEntity = this._config.reminders_entity;
    const lists = [{ entity: familyEntity, color: null, personName: null, isFamily: true }];
    try {
      const settings = this._getSettings();
      const profiles = settings.userProfiles || {};
      const myUserId = this._hass.user && this._hass.user.id;
      const myProfile = myUserId ? profiles[myUserId] : null;
      if (myProfile) {
        const people = this._getPeople();
        const subs = myProfile.remindersSubscriptions || {};
        const seenEntities = new Set([familyEntity]);
        for (const person of people) {
          if (!person.remindersEntity || seenEntities.has(person.remindersEntity)) continue;
          const isOwn = !!myProfile.primaryCalendar && person.entity === myProfile.primaryCalendar;
          const subLevel = subs[person.entity];
          const visible = isOwn || subLevel === "calendar" || subLevel === "calendar_alert";
          if (!visible) continue;
          seenEntities.add(person.remindersEntity);
          lists.push({ entity: person.remindersEntity, color: person.color, personName: person.name, isFamily: false });
        }
      }
    } catch (e) {
      // No profile/individual-list data yet (or something malformed about
      // it) - the shared family list above still works fine on its own.
    }
    const today = new Date();
    const dateKey = this._dateKey(today);
    try {
      const fetchedLists = await Promise.all(
        lists.map(async (list) => {
          try {
            const items = await this._getItems(list.entity);
            return items
              .filter((it) => it.status === "needs_action" && it.due)
              .map((it) => {
                const parsed = this._parseReminderRollover(it.description || "");
                const due = new Date(it.due);
                if (isNaN(due.getTime())) return null;
                return {
                  uid: it.uid,
                  summary: it.summary || "(untitled)",
                  due,
                  description: parsed.description,
                  rollover: parsed.rollover,
                  listEntity: list.entity,
                  color: list.color,
                  personName: list.personName,
                  isFamily: list.isFamily,
                };
              })
              .filter(Boolean);
          } catch (e) {
            // That particular list's to-do entity doesn't exist yet - skip
            // it, the other lists still show.
            return [];
          }
        })
      );
      this._todayReminders = fetchedLists
        .flat()
        .filter((r) => this._dateKey(r.due) === dateKey)
        .sort((a, b) => a.due - b.due);
    } catch (e) {
      this._todayReminders = [];
    }
    this._render();
  }
  async _markReminderDone(uid, listEntity) {
    if (!this._hass || !uid) return;
    try {
      await this._hass.callService("todo", "update_item", { item: uid, status: "completed" }, { entity_id: listEntity || this._config.reminders_entity });
    } catch (e) {
    }
    this._fetchTodayReminders();
  }
  async _fetchWeather() {
    if (!this._hass || !this._config.weather_entity) {
      this._forecastToday = null;
      this._render();
      return;
    }
    try {
      const result = await this._hass.connection.sendMessagePromise({
        type: "call_service",
        domain: "weather",
        service: "get_forecasts",
        service_data: { type: "daily" },
        target: { entity_id: this._config.weather_entity },
        return_response: true,
      });
      const bucket = result && result.response && result.response[this._config.weather_entity];
      const forecasts = (bucket && bucket.forecast) || [];
      const todayKey = this._dateKey(new Date());
      const todayForecast = forecasts.find((f) => (f.datetime || "").slice(0, 10) === todayKey);
      this._forecastToday = todayForecast
        ? { condition: todayForecast.condition, high: todayForecast.temperature, low: todayForecast.templow }
        : null;
    } catch (e) {
      this._forecastToday = null;
    }
    this._render();
  }
  _wxIcon(condition) {
    const map = {
      "clear-night": "\u{1F319}",
      cloudy: "\u{2601}\u{FE0F}",
      fog: "\u{1F32B}\u{FE0F}",
      hail: "\u{1F328}\u{FE0F}",
      lightning: "\u{26C8}\u{FE0F}",
      "lightning-rainy": "\u{26C8}\u{FE0F}",
      partlycloudy: "\u{26C5}",
      pouring: "\u{1F327}\u{FE0F}",
      rainy: "\u{1F327}\u{FE0F}",
      snowy: "\u{2744}\u{FE0F}",
      "snowy-rainy": "\u{1F328}\u{FE0F}",
      sunny: "\u{2600}\u{FE0F}",
      windy: "\u{1F4A8}",
      "windy-variant": "\u{1F4A8}",
      exceptional: "\u{26A0}\u{FE0F}",
    };
    return map[condition] || "";
  }
  _fmtTime(d) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  // Client-side navigation to another dashboard/view, the same mechanism
  // Home Assistant's own frontend uses for a "navigate" tap action -
  // pushState + a "location-changed" event lets the app's router swap
  // views instantly instead of a full page reload (which would also lose
  // any other cards' in-memory state on the page).
  _goToCalendar() {
    const path = (this._config.calendar_dashboard_path || "").trim();
    if (!path) return;
    history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true, detail: { replace: false } }));
  }
  // Same contrast heuristic as the full card's _textColorFor, so a badge
  // bubble's text stays readable against any configured badge color.
  _textColorFor(hex) {
    if (!hex) return "#4a3800";
    const c = hex.replace("#", "");
    if (c.length !== 6) return "#4a3800";
    const r = parseInt(c.substr(0, 2), 16);
    const g = parseInt(c.substr(2, 2), 16);
    const b = parseInt(c.substr(4, 2), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? "#3a2f00" : "#ffffff";
  }
  _build() {
    this._built = true;
    const root = this.attachShadow ? this.attachShadow({ mode: "open" }) : this;
    this._root = root;
    root.innerHTML = `
<style>
:host {
display: block;
height: 100%;
min-height: 0;
font-family: "Arial Rounded MT Std", "Arial Rounded MT", "Varela Round", -apple-system, "Segoe UI Rounded", "Segoe UI", Roboto, sans-serif;
--fc-shadow: 0 2px 8px rgba(58,53,44,0.12);
}
.card-root {
position: relative;
box-sizing: border-box;
height: 100%;
min-height: 0;
display: flex;
flex-direction: column;
padding: 16px;
border-radius: 16px;
overflow: hidden;
background: var(--fc-bg);
background-image: var(--fc-bg-image, none);
background-size: var(--fc-bg-size, cover);
background-position: var(--fc-bg-position, center);
color: var(--fc-text);
box-shadow: var(--fc-shadow);
}
.card-root::after {
content: "";
position: absolute;
inset: 0;
border-radius: 16px;
pointer-events: none;
background-image: var(--fc-bg-overlay-image, none);
}
.header { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; position: relative; }
.body-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; margin-right: -8px; padding-right: 8px; }
.date-title { display: flex; align-items: center; gap: 6px; font-size: var(--fs-header-title, 15px); font-weight: 800; color: var(--fc-text); }
.header-badges { display: inline-flex; align-items: center; gap: 4px; }
.custody-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px; font-size: 11px; font-weight: 800; box-shadow: var(--fc-shadow); }
.date-sub { font-size: var(--fs-chip, 13px); color: var(--fc-text-secondary); font-weight: 600; margin-top: 2px; }
.wx { display: flex; align-items: center; gap: 6px; font-size: var(--fs-wx-temp, 14px); color: var(--fc-text-secondary); font-weight: 700; }
.section { margin-bottom: 14px; position: relative; }
.section:last-child { margin-bottom: 0; }
.section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--fc-text-secondary); font-weight: 800; margin-bottom: 6px; }
.row { display: flex; align-items: center; gap: 10px; padding: 9px 11px; border-radius: 10px; background: var(--fc-surface-alt); margin-bottom: 6px; cursor: pointer; box-sizing: border-box; }
.row:last-child { margin-bottom: 0; }
.row .dot { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto; }
.row .label { flex: 1 1 auto; font-size: var(--fs-event, 14px); color: var(--fc-text); min-width: 0; overflow-wrap: break-word; }
.row .meta { font-size: var(--fs-chip, 13px); color: var(--fc-text-secondary); flex: 0 0 auto; white-space: nowrap; }
.reminder-owner { font-size: 0.85em; color: var(--fc-text-secondary); font-weight: 400; }
.row .done-btn { flex: 0 0 auto; border: none; border-radius: 8px; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 11px; font-weight: 700; padding: 6px 10px; cursor: pointer; }
.empty { font-size: var(--fs-event, 14px); color: var(--fc-text-secondary); font-style: italic; padding: 4px 2px; }
.footer-actions { flex: 0 0 auto; }
.footer-actions:empty { display: none; }
.go-to-calendar-btn { display: block; width: 100%; box-sizing: border-box; margin-top: 4px; border: none; border-radius: 10px; background: var(--fc-accent); color: var(--fc-accent-text); font-size: var(--fs-event, 14px); font-weight: 700; padding: 11px 12px; cursor: pointer; box-shadow: var(--fc-shadow); font-family: inherit; }
.modal-overlay { display: none; position: fixed; inset: 0; background: rgba(40,34,20,0.45); z-index: 1000; align-items: center; justify-content: center; }
.modal-overlay.open { display: flex; }
.modal-box { position: relative; background: var(--fc-card); color: var(--fc-text); border-radius: 14px; padding: 20px 20px 16px; width: min(92vw, 380px); max-height: 80vh; overflow-y: auto; box-shadow: 0 8px 30px rgba(58,53,44,0.3); }
.modal-close { position: absolute; top: 10px; right: 10px; border: none; background: var(--fc-surface-alt); color: var(--fc-text); width: 30px; height: 30px; border-radius: 8px; font-size: 14px; cursor: pointer; }
.detail-title { font-size: 17px; font-weight: 800; margin: 0 24px 8px 0; }
.detail-chip { display: inline-block; padding: 3px 9px; border-radius: 12px; font-size: 12px; font-weight: 700; margin-bottom: 8px; }
.detail-row { font-size: 14px; color: var(--fc-text); margin-bottom: 6px; }
.detail-row.secondary { color: var(--fc-text-secondary); }
.detail-actions { margin-top: 12px; display: flex; gap: 8px; }
.detail-open-link-btn, .detail-done-btn { flex: 1 1 auto; border: none; border-radius: 10px; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 13px; font-weight: 700; padding: 9px 12px; cursor: pointer; }
</style>
<div class="card-root">
<div class="header">
<div>
<div class="date-title"><span class="date-title-text"></span><span class="header-badges"></span></div>
<div class="date-sub"></div>
</div>
<div class="wx"></div>
</div>
<div class="body-scroll">
<div class="section">
<div class="section-title">Today's Events</div>
<div class="events-list"></div>
</div>
<div class="section">
<div class="section-title">Today's Meals</div>
<div class="meals-list"></div>
</div>
<div class="section">
<div class="section-title">Due Today</div>
<div class="reminders-list"></div>
</div>
</div>
<div class="footer-actions"></div>
</div>
<div class="modal-overlay detail-overlay">
<div class="modal-box">
<button type="button" class="modal-close" aria-label="Close">&#10005;</button>
<div class="detail-chip" style="display:none;"></div>
<div class="detail-title"></div>
<div class="detail-body"></div>
<div class="detail-actions"></div>
</div>
</div>
`;
    root.querySelector(".modal-close").addEventListener("click", () => this._closeDetail());
    root.querySelector(".detail-overlay").addEventListener("click", (e) => {
      if (e.target === root.querySelector(".detail-overlay")) this._closeDetail();
    });
  }
  _closeDetail() {
    if (!this._root) return;
    this._root.querySelector(".detail-overlay").classList.remove("open");
  }
  _openDetail({ chip, chipColor, title, rows, actionLabel, actionHandler }) {
    const root = this._root;
    const chipEl = root.querySelector(".detail-chip");
    if (chip) {
      chipEl.style.display = "";
      chipEl.style.background = chipColor || "var(--fc-accent)";
      chipEl.style.color = "#fff";
      chipEl.textContent = chip;
    } else {
      chipEl.style.display = "none";
    }
    root.querySelector(".detail-title").textContent = title || "";
    const body = root.querySelector(".detail-body");
    body.innerHTML = (rows || [])
      .map((r) => `<div class="detail-row${r.secondary ? " secondary" : ""}">${r.text}</div>`)
      .join("");
    const actions = root.querySelector(".detail-actions");
    if (actionLabel && actionHandler) {
      actions.innerHTML = `<button type="button" class="detail-open-link-btn">${actionLabel}</button>`;
      actions.querySelector("button").addEventListener("click", actionHandler);
    } else {
      actions.innerHTML = "";
    }
    root.querySelector(".detail-overlay").classList.add("open");
  }
  _renderHeader() {
    if (!this._root) return;
    const now = new Date();
    this._root.querySelector(".date-title-text").textContent = this._config.title || "Today";
    this._root.querySelector(".date-sub").textContent = now.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    // Per-calendar custody/status badges (Settings -> Calendars -> Add
    // badge) that matched one of today's events - same small colored
    // bubbles the full card shows next to the date in Week/Month view.
    const badgesEl = this._root.querySelector(".header-badges");
    if (badgesEl) {
      badgesEl.innerHTML = (this._todayBadges || [])
        .map((b) => `<span class="custody-badge" style="background:${b.color};color:${this._textColorFor(b.color)}">${b.text}</span>`)
        .join("");
    }
    this._renderFooterActions();
  }
  _render() {
    if (!this._root) return;
    this._renderHeader();
    const wxEl = this._root.querySelector(".wx");
    if (this._forecastToday) {
      const f = this._forecastToday;
      const high = typeof f.high === "number" ? Math.round(f.high) : "-";
      const low = typeof f.low === "number" ? Math.round(f.low) : "-";
      wxEl.textContent = `${this._wxIcon(f.condition)} ${high}°/${low}°`;
    } else {
      wxEl.textContent = "";
    }

    const eventsEl = this._root.querySelector(".events-list");
    if (!this._todayEvents.length) {
      eventsEl.innerHTML = `<div class="empty">Nothing on the calendar today.</div>`;
    } else {
      eventsEl.innerHTML = this._todayEvents
        .map((ev, idx) => {
          const meta = ev.allDay ? "All day" : this._fmtTime(ev.start);
          return `<div class="row" data-idx="${idx}"><span class="dot" style="background:${ev.color}"></span><span class="label">${ev.summary}</span><span class="meta">${meta}</span></div>`;
        })
        .join("");
      eventsEl.querySelectorAll(".row").forEach((row) => {
        row.addEventListener("click", () => {
          const ev = this._todayEvents[parseInt(row.dataset.idx, 10)];
          if (!ev) return;
          const rows = [];
          rows.push({ text: ev.allDay ? "All day" : `${this._fmtTime(ev.start)}${ev.end ? " - " + this._fmtTime(ev.end) : ""}` });
          if (ev.location) rows.push({ text: `\u{1F4CD} ${ev.location}`, secondary: true });
          if (ev.description) rows.push({ text: ev.description, secondary: true });
          this._openDetail({ chip: ev.personName, chipColor: ev.color, title: ev.summary, rows });
        });
      });
    }

    const mealsEl = this._root.querySelector(".meals-list");
    if (!this._todayMeals.length) {
      mealsEl.innerHTML = `<div class="empty">Nothing planned yet.</div>`;
    } else {
      mealsEl.innerHTML = this._todayMeals
        .map((m, idx) => `<div class="row" data-idx="${idx}"><span class="dot" style="background:${m.color || "var(--fc-accent2)"}"></span><span class="label">${m.name}</span><span class="meta">${m.label}</span></div>`)
        .join("");
      mealsEl.querySelectorAll(".row").forEach((row) => {
        row.addEventListener("click", () => {
          const m = this._todayMeals[parseInt(row.dataset.idx, 10)];
          if (!m) return;
          const rows = [];
          rows.push({ text: m.description || "No notes added.", secondary: !m.description });
          this._openDetail({
            chip: m.label,
            chipColor: m.color || null,
            title: m.name,
            rows,
            actionLabel: m.link ? "\u{1F517} Open recipe link" : null,
            actionHandler: m.link ? () => window.open(m.link, "_blank", "noopener") : null,
          });
        });
      });
    }

    const remindersEl = this._root.querySelector(".reminders-list");
    if (!this._todayReminders.length) {
      remindersEl.innerHTML = `<div class="empty">No reminders due today.</div>`;
    } else {
      remindersEl.innerHTML = this._todayReminders
        .map(
          (r, idx) =>
            `<div class="row" data-idx="${idx}"><span class="dot" style="background:${r.color || TODAY_REMINDER_COLOR}"></span><span class="label">&#128276; ${r.summary}${r.personName ? ` <span class="reminder-owner">(${r.personName})</span>` : ""}</span><span class="meta">${this._fmtTime(r.due)}</span><button type="button" class="done-btn" data-uid="${r.uid}" data-list-entity="${r.listEntity}">Done</button></div>`
        )
        .join("");
      remindersEl.querySelectorAll(".done-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          btn.disabled = true;
          this._markReminderDone(btn.dataset.uid, btn.dataset.listEntity);
        });
      });
      remindersEl.querySelectorAll(".row").forEach((row) => {
        row.addEventListener("click", (e) => {
          if (e.target.closest(".done-btn")) return;
          const r = this._todayReminders[parseInt(row.dataset.idx, 10)];
          if (!r) return;
          const rows = [{ text: `Due ${this._fmtTime(r.due)}` }];
          if (r.description) rows.push({ text: r.description, secondary: true });
          this._openDetail({
            chip: r.personName ? `Reminder • ${r.personName}` : "Reminder",
            chipColor: r.color || TODAY_REMINDER_COLOR,
            title: r.summary,
            rows,
            actionLabel: "✓ Mark done",
            actionHandler: () => {
              this._markReminderDone(r.uid, r.listEntity);
              this._closeDetail();
            },
          });
        });
      });
    }

    this._renderFooterActions();
  }
  // Optional footer button - only rendered when a dashboard path is
  // actually configured, so cards that don't want it look unchanged. Split
  // out from _render() (and also called from setConfig via _renderHeader)
  // so the button shows up immediately from config alone, without waiting
  // on hass/data to load first.
  _renderFooterActions() {
    if (!this._root) return;
    const footerEl = this._root.querySelector(".footer-actions");
    if (!footerEl) return;
    const calendarPath = (this._config.calendar_dashboard_path || "").trim();
    if (calendarPath) {
      const label = this._config.calendar_button_label || "\u{1F4C5} Go to Calendar";
      footerEl.innerHTML = `<button type="button" class="go-to-calendar-btn">${label}</button>`;
      footerEl.querySelector(".go-to-calendar-btn").addEventListener("click", () => this._goToCalendar());
    } else {
      footerEl.innerHTML = "";
    }
  }
}

if (!customElements.get("family-today-card")) {
  customElements.define("family-today-card", FamilyTodayCard);
}
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "family-today-card")) {
  window.customCards.push({
    type: "family-today-card",
    name: "Family Today",
    description: "A compact single-day companion to the Family Week Calendar card - today's events, meals, and due reminders at a glance.",
  });
}
