// Family Hub My Pantry card (v141+) - a household's stock at a glance, in
// two parts: a live Grocy Stock list (every product currently in stock,
// read/written straight through Grocy's own REST API - see __init__.py's
// _fetch_pantry_stock/_ws_get_pantry_stock and friends, right alongside
// this project's other Grocy passthrough handlers) and a separate "Also
// Tracking" list of plain household notes that were deliberately never
// taught to Grocy as real stock (see pantry_engine.py's own module
// docstring for the full reasoning on why that split exists rather than
// forcing everything through Grocy's product/quantity-unit machinery).
//
// A standalone card, independently addable to any dashboard - same
// "either put it on its own view, or drop it below another Family Hub card"
// shape as family-hub-goals-card.js, and copy-pasting that same file's
// boilerplate (PALETTE/theme handling/_esc/_escAttr) rather than importing
// it, matching this project's established convention for every Family Hub
// card.

class FamilyHubPantryCard extends HTMLElement {
  static getStubConfig() {
    return { title: "My Pantry" };
  }
  static getConfigForm() {
    return { schema: [{ name: "title", selector: { text: {} } }], computeLabel: (s) => (s.name === "title" ? "Title" : undefined) };
  }
  setConfig(config) {
    this._config = { title: (config && config.title) || "My Pantry" };
    if (this._settingsCache === undefined) this._settingsCache = null;
    if (this._globalThemes === undefined) this._globalThemes = [];
    if (this._configured === undefined) this._configured = true;
    if (this._stock === undefined) this._stock = [];
    if (this._extras === undefined) this._extras = [];
    if (this._pickerProducts === undefined) this._pickerProducts = [];
    if (this._pickerUnits === undefined) this._pickerUnits = [];
    if (this._locations === undefined) this._locations = [];
    // v144.17+: full-CRUD pass - categories (Grocy's "product groups"),
    // plus the toolbar's own live search/sort/filter state. These are
    // deliberately plain instance fields rather than persisted Settings -
    // same "just how much room THIS device gives a feature right now"
    // spirit as the calendar/chores cards' own device-local UI toggles,
    // except even more transient: there's no reason a search term or a
    // "show expired only" toggle should survive a page reload.
    if (this._categories === undefined) this._categories = [];
    if (this._searchQuery === undefined) this._searchQuery = "";
    if (this._sortBy === undefined) this._sortBy = "name";
    if (this._filterExpired === undefined) this._filterExpired = false;
    if (this._filterExpiring === undefined) this._filterExpiring = false;
    if (this._firstLoadPromise === undefined) this._firstLoadPromise = null;
    if (!this._built) this._build();
    this._render();
  }
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._firstLoadPromise = this._initFirstLoad();
  }
  async _initFirstLoad() {
    await Promise.all([this._fetchSettings(), this._fetchStock(), this._fetchExtras()]);
    if (this._getSettings().useGlobalTheme) await this._fetchGlobalThemes();
    this._startPolling();
    this._render();
  }
  _startPolling() {
    if (this._interval) return;
    // 60s, slower than Goals' 20s - stock levels don't change nearly as
    // often as chore/goal state, and every tick is a real Grocy HTTP round
    // trip (unlike Goals/Chores, which just read this project's own Store).
    this._interval = setInterval(() => {
      this._fetchStock();
      this._fetchExtras();
    }, 60 * 1000);
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
  async _fetchStock() {
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_pantry_stock" });
      this._configured = !!(result && result.configured);
      this._stock = (result && Array.isArray(result.stock)) ? result.stock : [];
    } catch (e) {
      /* keep whatever we had */
    }
    this._render();
  }
  async _fetchExtras() {
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/pantry_extras/list" });
      this._extras = (result && Array.isArray(result.extras)) ? result.extras : [];
    } catch (e) {
      /* keep whatever we had */
    }
    this._render();
  }
  async _fetchPickerData() {
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_pantry_picker_data" });
      this._pickerProducts = (result && Array.isArray(result.products)) ? result.products : [];
      this._pickerUnits = (result && Array.isArray(result.units)) ? result.units : [];
    } catch (e) {
      this._pickerProducts = [];
      this._pickerUnits = [];
    }
  }
  async _fetchLocations() {
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_grocy_locations" });
      this._locations = (result && Array.isArray(result.locations)) ? result.locations : [];
    } catch (e) {
      this._locations = [];
    }
  }
  async _fetchCategories() {
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_grocy_categories" });
      this._categories = (result && Array.isArray(result.categories)) ? result.categories : [];
    } catch (e) {
      this._categories = [];
    }
  }
  _esc(s) {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  }
  _escAttr(s) {
    return this._esc(s).replace(/"/g, "&quot;");
  }
  // Days-until display for a best-before date, mirroring the calendar
  // card's own "expiring soon" framing so the two features read the same
  // way to a household ("today"/"tomorrow"/"in N days"/"expired").
  _daysUntilLabel(dateStr) {
    if (!dateStr) return "";
    const days = this._daysUntil(dateStr);
    if (days < 0) return `<span class="expired">Expired ${this._esc(dateStr)}</span>`;
    if (days === 0) return `<span class="expiring-soon">Expires today</span>`;
    if (days === 1) return `<span class="expiring-soon">Expires tomorrow</span>`;
    if (days <= 7) return `<span class="expiring-soon">Expires in ${days} days</span>`;
    return `Expires ${this._esc(dateStr)}`;
  }
  // Plain integer days-until (negative once past) - the numeric half of
  // _daysUntilLabel above, split out so the toolbar's "Show expired"/
  // "Show expiring soon" filters can test a date without re-parsing/
  // re-formatting it themselves.
  _daysUntil(dateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr + "T00:00:00");
    return Math.round((d - today) / 86400000);
  }

  _build() {
    this._built = true;
    this.attachShadow({ mode: "open" });
    const root = this.shadowRoot;
    // v144.13+: restyled to match the Chores/Rewards board's own chrome
    // (see this card's own docstring at the top of the file) - a real
    // .header + .actions bar and a .board of side-by-side columns, same
    // classes/shapes those cards already use, rather than the old single
    // stacked-list layout. _render() below still only ever touches
    // .stock-list/.extras-list, so none of that logic needed to change.
    root.innerHTML = `
      <style>${this._css()}</style>
      <ha-card>
        <div class="header">
          <div class="title"></div>
          <div class="actions">
            <button type="button" class="add-stock-btn">&#65291; Add stock</button>
          </div>
        </div>
        <div class="not-configured-hint" hidden>
          Connect Grocy under Family Hub's Settings to track real stock here. Your "Also Tracking" list below still works either way.
        </div>
        <div class="toolbar">
          <input type="search" class="pantry-search" placeholder="Search pantry...">
          <select class="pantry-sort" title="Sort Grocy Stock by">
            <option value="name">Sort: Name</option>
            <option value="location">Sort: Location</option>
            <option value="category">Sort: Category</option>
            <option value="expiration">Sort: Expiration</option>
          </select>
          <label class="filter-toggle"><input type="checkbox" class="filter-expired"> Expired</label>
          <label class="filter-toggle"><input type="checkbox" class="filter-expiring"> Expiring soon</label>
        </div>
        <div class="board">
          <div class="pantry-column stock-column">
            <div class="pantry-col-header">Grocy Stock</div>
            <div class="pantry-col-body stock-list"></div>
          </div>
          <div class="pantry-column extras-column">
            <div class="pantry-col-header">Also Tracking <span class="extras-hint">(not counted in Grocy)</span></div>
            <div class="pantry-col-body extras-list"></div>
            <button type="button" class="add-extra-btn">&#65291; Track something else</button>
          </div>
        </div>
      </ha-card>
      <div class="modal-overlay add-stock-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay edit-stock-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay edit-product-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay extra-modal"><div class="modal-box"></div></div>
    `;
    this._root = root;
    root.querySelector(".title").textContent = this._config.title;
    root.querySelector(".add-stock-btn").addEventListener("click", () => this._openAddStockModal());
    root.querySelector(".add-extra-btn").addEventListener("click", () => this._openExtraModal(null));
    root.querySelectorAll(".modal-overlay").forEach((overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.classList.remove("open");
      });
    });
    root.querySelector(".stock-list").addEventListener("click", (e) => this._onStockListClick(e));
    root.querySelector(".extras-list").addEventListener("click", (e) => this._onExtrasListClick(e));
    // Toolbar: search/sort/filter are all pure client-side over whatever
    // stock/extras this card already has loaded - none of these send a
    // websocket message, they just re-run _render() below.
    root.querySelector(".pantry-search").addEventListener("input", (e) => {
      this._searchQuery = e.target.value || "";
      this._render();
    });
    root.querySelector(".pantry-sort").addEventListener("change", (e) => {
      this._sortBy = e.target.value || "name";
      this._render();
    });
    root.querySelector(".filter-expired").addEventListener("change", (e) => {
      this._filterExpired = !!e.target.checked;
      this._render();
    });
    root.querySelector(".filter-expiring").addEventListener("change", (e) => {
      this._filterExpiring = !!e.target.checked;
      this._render();
    });
  }

  _onStockListClick(e) {
    const removeBtn = e.target.closest(".stock-remove-btn");
    const editBtn = e.target.closest(".stock-edit-btn");
    const editProductBtn = e.target.closest(".stock-editproduct-btn");
    if (removeBtn) return this._promptConsume(removeBtn.dataset.productId, removeBtn.dataset.name);
    if (editBtn) return this._openEditStockModal(editBtn.dataset.productId, editBtn.dataset.name);
    if (editProductBtn) return this._openEditProductModal(editProductBtn.dataset.productId, editProductBtn.dataset.name);
  }
  _onExtrasListClick(e) {
    const editBtn = e.target.closest(".extra-edit-btn");
    const deleteBtn = e.target.closest(".extra-delete-btn");
    if (editBtn) return this._openExtraModal(editBtn.dataset.id);
    if (deleteBtn) return this._deleteExtra(deleteBtn.dataset.id);
  }

  // --- Grocy Stock: add / remove / edit ------------------------------

  async _openAddStockModal() {
    await Promise.all([this._fetchPickerData(), this._fetchLocations()]);
    const overlay = this._root.querySelector(".add-stock-modal");
    const box = overlay.querySelector(".modal-box");
    const productOptions = this._pickerProducts.map((p) => `<option value="${p.id}">${this._esc(p.name)}</option>`).join("");
    const locationOptions = `<option value="">(product's default)</option>` + this._locations.map((l) => `<option value="${l.id}">${this._esc(l.name)}</option>`).join("");
    const unitOptions = this._pickerUnits.map((u) => `<option value="${u.id}">${this._esc(u.name)}</option>`).join("");
    box.innerHTML = `
      <h3>Add stock</h3>
      <label class="existing-product-field">Product
        <select class="f-product">${productOptions}</select>
      </label>
      <label class="new-product-toggle"><input type="checkbox" class="f-new-product"> This isn't in Grocy yet - add it as a new product</label>
      <div class="new-product-fields" hidden>
        <label>New product name<input type="text" class="f-new-name" placeholder="e.g. Canned tomatoes"></label>
        <label>Stock unit<select class="f-new-unit">${unitOptions}</select></label>
      </div>
      <label>Amount<input type="number" class="f-amount" min="0" step="any" value="1"></label>
      <label>Location<select class="f-location">${locationOptions}</select></label>
      <label>Best-before date (optional)<input type="date" class="f-best-before"></label>
      <div class="modal-actions">
        <button class="cancel-btn">Cancel</button>
        <button class="save-btn">Add</button>
      </div>
      <div class="form-error"></div>
    `;
    const newToggle = box.querySelector(".f-new-product");
    const newFields = box.querySelector(".new-product-fields");
    const existingField = box.querySelector(".existing-product-field");
    newToggle.addEventListener("change", () => {
      newFields.hidden = !newToggle.checked;
      existingField.hidden = newToggle.checked;
    });
    box.querySelector(".cancel-btn").addEventListener("click", () => overlay.classList.remove("open"));
    box.querySelector(".save-btn").addEventListener("click", () => this._submitAddStock(overlay, box));
    overlay.classList.add("open");
  }

  async _submitAddStock(overlay, box) {
    const errEl = box.querySelector(".form-error");
    errEl.textContent = "";
    const amount = parseFloat(box.querySelector(".f-amount").value);
    if (!(amount > 0)) {
      errEl.textContent = "Amount must be greater than 0.";
      return;
    }
    const locationVal = box.querySelector(".f-location").value;
    const bestBefore = box.querySelector(".f-best-before").value;
    let productId = box.querySelector(".f-product").value ? parseInt(box.querySelector(".f-product").value, 10) : null;

    if (box.querySelector(".f-new-product").checked) {
      const name = box.querySelector(".f-new-name").value.trim();
      const unitId = box.querySelector(".f-new-unit").value;
      if (!name) {
        errEl.textContent = "The new product needs a name.";
        return;
      }
      if (!unitId || !locationVal) {
        errEl.textContent = "A new product needs both a stock unit and a location.";
        return;
      }
      try {
        const created = await this._hass.connection.sendMessagePromise({
          type: "family_hub/create_grocy_product", name, location_id: parseInt(locationVal, 10), qu_id: parseInt(unitId, 10),
        });
        if (!created || !created.success) {
          errEl.textContent = (created && created.error) || "Couldn't create this product in Grocy.";
          return;
        }
        productId = created.product_id;
      } catch (e) {
        errEl.textContent = (e && e.message) || "Couldn't create this product in Grocy.";
        return;
      }
    }
    if (!productId) {
      errEl.textContent = "Pick a product (or add it as new).";
      return;
    }

    const payload = { type: "family_hub/pantry_add_stock", product_id: productId, amount };
    if (locationVal) payload.location_id = parseInt(locationVal, 10);
    if (bestBefore) payload.best_before_date = bestBefore;
    try {
      const result = await this._hass.connection.sendMessagePromise(payload);
      if (!result || !result.success) {
        errEl.textContent = (result && result.error) || "Couldn't add this stock.";
        return;
      }
    } catch (e) {
      errEl.textContent = (e && e.message) || "Couldn't add this stock.";
      return;
    }
    overlay.classList.remove("open");
    await this._fetchStock();
  }

  async _promptConsume(productId, name) {
    const raw = window.prompt(`Remove how much "${name}"?`, "1");
    if (raw === null) return;
    const amount = parseFloat(raw);
    if (!(amount > 0)) return;
    try {
      await this._hass.connection.sendMessagePromise({
        type: "family_hub/pantry_consume_stock", product_id: parseInt(productId, 10), amount,
      });
    } catch (e) {
      /* server already validated this - a stale click just no-ops */
    }
    await this._fetchStock();
  }

  async _openEditStockModal(productId, name) {
    const overlay = this._root.querySelector(".edit-stock-modal");
    const box = overlay.querySelector(".modal-box");
    box.innerHTML = `<h3>Edit ${this._esc(name)}</h3><div class="entries-loading">Loading...</div>`;
    overlay.classList.add("open");
    const [entriesResult] = await Promise.all([
      this._hass.connection.sendMessagePromise({
        type: "family_hub/get_grocy_stock_entries", product_id: parseInt(productId, 10),
      }).catch(() => null),
      this._fetchLocations(),
    ]);
    const entries = (entriesResult && Array.isArray(entriesResult.entries)) ? entriesResult.entries : [];
    const locationOptions = `<option value="">(product's default)</option>` + this._locations.map((l) => `<option value="${l.id}">${this._esc(l.name)}</option>`).join("");
    // v144.17+: price/location per entry, alongside the original amount/
    // best-before - see _ws_update_grocy_stock_entry's own docstring on why
    // both are optional on the backend (a blank price field just omits
    // price from that entry's save, same as before this existed).
    const rowsHtml = entries.length
      ? entries
          .map(
            (en) => `
        <div class="entry-row" data-entry-id="${en.id}">
          <div class="entry-row-fields">
            <label>Amount<input type="number" class="entry-amount" min="0" step="any" value="${en.amount}"></label>
            <label>Best before<input type="date" class="entry-best-before" value="${en.best_before_date || ""}"></label>
          </div>
          <div class="entry-row-fields">
            <label>Price<input type="number" class="entry-price" min="0" step="any" placeholder="e.g. 3.99" value="${en.price != null ? en.price : ""}"></label>
            <label>Location<select class="entry-location">${locationOptions}</select></label>
          </div>
        </div>`
          )
          .join("")
      : `<div class="empty-state">No individual stock entries found.</div>`;
    box.innerHTML = `
      <h3>Edit ${this._esc(name)}</h3>
      <div class="entries-list">${rowsHtml}</div>
      <div class="modal-actions">
        <button class="cancel-btn">Cancel</button>
        <button class="save-btn">Save</button>
      </div>
      <div class="form-error"></div>
    `;
    // Pre-select each entry's current location, if it has one.
    entries.forEach((en) => {
      if (en.location_id == null) return;
      const sel = box.querySelector(`.entry-row[data-entry-id="${en.id}"] .entry-location`);
      if (sel) sel.value = String(en.location_id);
    });
    box.querySelector(".cancel-btn").addEventListener("click", () => overlay.classList.remove("open"));
    box.querySelector(".save-btn").addEventListener("click", () => this._submitEditStock(overlay, box));
  }

  async _submitEditStock(overlay, box) {
    const errEl = box.querySelector(".form-error");
    errEl.textContent = "";
    const rows = Array.from(box.querySelectorAll(".entry-row"));
    try {
      for (const row of rows) {
        const entryId = parseInt(row.dataset.entryId, 10);
        const amount = parseFloat(row.querySelector(".entry-amount").value);
        const bestBefore = row.querySelector(".entry-best-before").value || null;
        const priceRaw = row.querySelector(".entry-price").value;
        const locationRaw = row.querySelector(".entry-location").value;
        const payload = {
          type: "family_hub/update_grocy_stock_entry", entry_id: entryId, amount, best_before_date: bestBefore,
        };
        if (priceRaw !== "") payload.price = parseFloat(priceRaw);
        if (locationRaw !== "") payload.location_id = parseInt(locationRaw, 10);
        await this._hass.connection.sendMessagePromise(payload);
      }
    } catch (e) {
      errEl.textContent = (e && e.message) || "Couldn't save one of these entries.";
      return;
    }
    overlay.classList.remove("open");
    await this._fetchStock();
  }

  // --- Edit product (full CRUD on the Grocy product itself) -----------
  // v144.17+: Add/Read/Update/Delete on a product's own core fields (name,
  // category, default location, stock/purchase quantity unit, min stock
  // amount, description) - as opposed to _openEditStockModal just above,
  // which only ever touched individual stock purchases (amount/best-before/
  // price/entry-location). Create already existed (the Add Stock modal's
  // "this isn't in Grocy yet" flow); this rounds out Read/Update/Delete on
  // the product record behind that "gear" icon per stock row.

  async _openEditProductModal(productId, name) {
    const overlay = this._root.querySelector(".edit-product-modal");
    const box = overlay.querySelector(".modal-box");
    box.innerHTML = `<h3>Edit product</h3><div class="entries-loading">Loading...</div>`;
    overlay.classList.add("open");
    const [detailsResult] = await Promise.all([
      this._hass.connection.sendMessagePromise({
        type: "family_hub/get_grocy_product_details", product_id: parseInt(productId, 10),
      }).catch(() => null),
      this._fetchLocations(),
      this._fetchCategories(),
      this._fetchPickerData(),
    ]);
    const product = detailsResult && detailsResult.product;
    if (!product) {
      box.innerHTML = `<h3>Edit product</h3><div class="empty-state">Couldn't load this product's details.</div><div class="modal-actions"><button class="cancel-btn">Close</button></div>`;
      box.querySelector(".cancel-btn").addEventListener("click", () => overlay.classList.remove("open"));
      return;
    }
    const categoryOptions =
      `<option value="">(none)</option>` +
      this._categories.map((c) => `<option value="${c.id}">${this._esc(c.name)}</option>`).join("") +
      `<option value="__new__">+ New category...</option>`;
    const locationOptions =
      this._locations.map((l) => `<option value="${l.id}">${this._esc(l.name)}</option>`).join("") +
      `<option value="__new__">+ New location...</option>`;
    const unitOptions = this._pickerUnits.map((u) => `<option value="${u.id}">${this._esc(u.name)}</option>`).join("");
    box.innerHTML = `
      <h3>Edit product</h3>
      <label>Name<input type="text" class="f-name" value="${this._escAttr(product.name)}"></label>
      <label>Category<select class="f-category">${categoryOptions}</select></label>
      <input type="text" class="f-new-category-name" hidden placeholder="New category name">
      <label>Location<select class="f-location">${locationOptions}</select></label>
      <input type="text" class="f-new-location-name" hidden placeholder="New location name">
      <label>Stock unit<select class="f-qu-stock">${unitOptions}</select></label>
      <label>Purchase unit<select class="f-qu-purchase">${unitOptions}</select></label>
      <label>Min stock amount<input type="number" class="f-min-stock" min="0" step="any" value="${product.min_stock_amount || 0}"></label>
      <label>Description<textarea class="f-description" rows="2">${this._esc(product.description || "")}</textarea></label>
      <div class="modal-actions product-modal-actions">
        <button class="delete-btn">Delete product</button>
        <button class="cancel-btn">Cancel</button>
        <button class="save-btn">Save</button>
      </div>
      <div class="form-error"></div>
    `;
    if (product.category_id != null || product.product_group_id != null) box.querySelector(".f-category").value = String(product.product_group_id);
    if (product.location_id != null) box.querySelector(".f-location").value = String(product.location_id);
    if (product.qu_id_stock != null) box.querySelector(".f-qu-stock").value = String(product.qu_id_stock);
    box.querySelector(".f-qu-purchase").value = String(product.qu_id_purchase != null ? product.qu_id_purchase : product.qu_id_stock);
    const categorySelect = box.querySelector(".f-category");
    const newCategoryInput = box.querySelector(".f-new-category-name");
    categorySelect.addEventListener("change", () => {
      newCategoryInput.hidden = categorySelect.value !== "__new__";
    });
    const locationSelect = box.querySelector(".f-location");
    const newLocationInput = box.querySelector(".f-new-location-name");
    locationSelect.addEventListener("change", () => {
      newLocationInput.hidden = locationSelect.value !== "__new__";
    });
    box.querySelector(".cancel-btn").addEventListener("click", () => overlay.classList.remove("open"));
    box.querySelector(".save-btn").addEventListener("click", () => this._submitEditProduct(overlay, box, product.id));
    box.querySelector(".delete-btn").addEventListener("click", () => this._deleteProduct(overlay, box, product.id, product.name));
  }

  async _submitEditProduct(overlay, box, productId) {
    const errEl = box.querySelector(".form-error");
    errEl.textContent = "";
    const name = box.querySelector(".f-name").value.trim();
    if (!name) {
      errEl.textContent = "This product needs a name.";
      return;
    }
    let categoryVal = box.querySelector(".f-category").value;
    let locationVal = box.querySelector(".f-location").value;

    try {
      if (categoryVal === "__new__") {
        const newName = box.querySelector(".f-new-category-name").value.trim();
        if (!newName) {
          errEl.textContent = "Give the new category a name.";
          return;
        }
        const created = await this._hass.connection.sendMessagePromise({ type: "family_hub/create_grocy_category", name: newName });
        if (!created || !created.success) {
          errEl.textContent = (created && created.error) || "Couldn't create this category.";
          return;
        }
        categoryVal = String(created.category.id);
      }
      if (locationVal === "__new__") {
        const newName = box.querySelector(".f-new-location-name").value.trim();
        if (!newName) {
          errEl.textContent = "Give the new location a name.";
          return;
        }
        const created = await this._hass.connection.sendMessagePromise({ type: "family_hub/create_grocy_location", name: newName });
        if (!created || !created.success) {
          errEl.textContent = (created && created.error) || "Couldn't create this location.";
          return;
        }
        locationVal = String(created.location.id);
      }
      if (!locationVal) {
        errEl.textContent = "Pick a location.";
        return;
      }
      const payload = {
        type: "family_hub/update_grocy_product",
        product_id: productId,
        name,
        location_id: parseInt(locationVal, 10),
        qu_id_stock: parseInt(box.querySelector(".f-qu-stock").value, 10),
        qu_id_purchase: parseInt(box.querySelector(".f-qu-purchase").value, 10),
        product_group_id: categoryVal ? parseInt(categoryVal, 10) : null,
        min_stock_amount: parseFloat(box.querySelector(".f-min-stock").value) || 0,
        description: box.querySelector(".f-description").value.trim(),
      };
      const result = await this._hass.connection.sendMessagePromise(payload);
      if (!result || !result.success) {
        errEl.textContent = (result && result.error) || "Couldn't save this product.";
        return;
      }
    } catch (e) {
      errEl.textContent = (e && e.message) || "Couldn't save this product.";
      return;
    }
    overlay.classList.remove("open");
    await this._fetchStock();
  }

  async _deleteProduct(overlay, box, productId, name) {
    if (!window.confirm(`Delete "${name}" from Grocy entirely? This can't be undone.`)) return;
    const errEl = box.querySelector(".form-error");
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/delete_grocy_product", product_id: productId });
      if (!result || !result.success) {
        errEl.textContent = (result && result.error) || "Couldn't delete this product - it may still be used elsewhere in Grocy (a recipe, a shopping list, etc.).";
        return;
      }
    } catch (e) {
      errEl.textContent = (e && e.message) || "Couldn't delete this product.";
      return;
    }
    overlay.classList.remove("open");
    await this._fetchStock();
  }

  // --- Also Tracking (extras) ------------------------------------------

  _openExtraModal(extraId) {
    const extra = extraId ? this._extras.find((x) => x.id === extraId) : null;
    const overlay = this._root.querySelector(".extra-modal");
    const box = overlay.querySelector(".modal-box");
    box.innerHTML = `
      <h3>${extra ? "Edit item" : "Track something else"}</h3>
      <label>Name<input type="text" class="f-name" value="${extra ? this._escAttr(extra.name) : ""}" placeholder="e.g. Paper towels (garage backup)"></label>
      <label>Quantity<input type="text" class="f-quantity" value="${extra ? this._escAttr(extra.quantity || "") : ""}" placeholder="e.g. 2 rolls"></label>
      <label>Location<input type="text" class="f-location" value="${extra ? this._escAttr(extra.location || "") : ""}" placeholder="e.g. Garage shelf"></label>
      <label>Expiration date (optional)<input type="date" class="f-expiration" value="${extra && extra.expiration_date ? extra.expiration_date : ""}"></label>
      <label>Notes<textarea class="f-notes" rows="2">${extra ? this._esc(extra.notes || "") : ""}</textarea></label>
      <div class="modal-actions">
        <button class="cancel-btn">Cancel</button>
        <button class="save-btn">Save</button>
      </div>
      <div class="form-error"></div>
    `;
    box.querySelector(".cancel-btn").addEventListener("click", () => overlay.classList.remove("open"));
    box.querySelector(".save-btn").addEventListener("click", () => this._submitExtra(overlay, box, extraId));
    overlay.classList.add("open");
  }

  async _submitExtra(overlay, box, extraId) {
    const errEl = box.querySelector(".form-error");
    errEl.textContent = "";
    const name = box.querySelector(".f-name").value.trim();
    if (!name) {
      errEl.textContent = "This item needs a name.";
      return;
    }
    const payload = {
      type: extraId ? "family_hub/pantry_extras/update" : "family_hub/pantry_extras/create",
      name,
      quantity: box.querySelector(".f-quantity").value.trim(),
      location: box.querySelector(".f-location").value.trim(),
      expiration_date: box.querySelector(".f-expiration").value || null,
      notes: box.querySelector(".f-notes").value.trim(),
    };
    if (extraId) payload.extra_id = extraId;
    try {
      await this._hass.connection.sendMessagePromise(payload);
    } catch (e) {
      errEl.textContent = (e && e.message) || "Couldn't save this item.";
      return;
    }
    overlay.classList.remove("open");
    await this._fetchExtras();
  }

  async _deleteExtra(extraId) {
    if (!window.confirm("Stop tracking this item?")) return;
    try {
      await this._hass.connection.sendMessagePromise({ type: "family_hub/pantry_extras/delete", extra_id: extraId });
    } catch (e) {
      /* ignore */
    }
    await this._fetchExtras();
  }

  // --- Rendering ----------------------------------------------------------

  _stockRowHtml(item) {
    const bestBeforeHtml = item.best_before_date ? `<div class="stock-expiry">${this._daysUntilLabel(item.best_before_date)}</div>` : "";
    const badgeBits = [];
    if (item.location_name) badgeBits.push(`<span class="stock-badge">${this._esc(item.location_name)}</span>`);
    if (item.category_name) badgeBits.push(`<span class="stock-badge">${this._esc(item.category_name)}</span>`);
    if (item.low_stock) badgeBits.push(`<span class="stock-badge low-stock-badge">Low stock</span>`);
    const badgesHtml = badgeBits.length ? `<div class="stock-badges">${badgeBits.join("")}</div>` : "";
    const unitHtml = item.unit_name ? ` ${this._esc(item.unit_name)}` : "";
    return `
      <div class="stock-row" data-product-id="${item.product_id}">
        <div class="stock-info">
          <div class="stock-name">${this._esc(item.name)}</div>
          ${badgesHtml}
          ${bestBeforeHtml}
        </div>
        <div class="stock-amount">${item.amount}${unitHtml}</div>
        <div class="stock-actions">
          <button class="stock-editproduct-btn" data-product-id="${item.product_id}" data-name="${this._escAttr(item.name)}" title="Edit product">&#9881;&#65039;</button>
          <button class="stock-edit-btn" data-product-id="${item.product_id}" data-name="${this._escAttr(item.name)}" title="Edit entries">&#9999;&#65039;</button>
          <button class="stock-remove-btn" data-product-id="${item.product_id}" data-name="${this._escAttr(item.name)}" title="Remove stock">&minus;</button>
        </div>
      </div>
    `;
  }

  _extraRowHtml(extra) {
    const expiryHtml = extra.expiration_date ? `<div class="stock-expiry">${this._daysUntilLabel(extra.expiration_date)}</div>` : "";
    const metaBits = [extra.quantity, extra.location].filter((x) => x).map((x) => this._esc(x));
    const metaHtml = metaBits.length ? `<div class="extra-meta">${metaBits.join(" &middot; ")}</div>` : "";
    const notesHtml = extra.notes ? `<div class="extra-notes">${this._esc(extra.notes)}</div>` : "";
    return `
      <div class="extra-row" data-id="${extra.id}">
        <div class="stock-info">
          <div class="stock-name">${this._esc(extra.name)}</div>
          ${metaHtml}
          ${notesHtml}
          ${expiryHtml}
        </div>
        <div class="stock-actions">
          <button class="extra-edit-btn" data-id="${extra.id}" title="Edit">&#9999;&#65039;</button>
          <button class="extra-delete-btn" data-id="${extra.id}" title="Stop tracking">&times;</button>
        </div>
      </div>
    `;
  }

  // v144.17+: the toolbar's search/sort/expired/expiring-soon controls, all
  // applied client-side over whatever this._stock already holds (no extra
  // round trip per keystroke/toggle) - _render() below calls this instead
  // of using this._stock directly.
  _visibleStock() {
    const query = this._searchQuery.trim().toLowerCase();
    let items = this._stock.filter((it) => {
      if (query && !it.name.toLowerCase().includes(query)) return false;
      if (this._filterExpired || this._filterExpiring) {
        if (!it.best_before_date) return false;
        const days = this._daysUntil(it.best_before_date);
        const isExpired = days < 0;
        const isExpiringSoon = days >= 0 && days <= 7;
        if (this._filterExpired && this._filterExpiring) {
          if (!isExpired && !isExpiringSoon) return false;
        } else if (this._filterExpired) {
          if (!isExpired) return false;
        } else if (this._filterExpiring) {
          if (!isExpiringSoon) return false;
        }
      }
      return true;
    });
    items = items.slice();
    if (this._sortBy === "location") {
      items.sort((a, b) => (a.location_name || "￿").localeCompare(b.location_name || "￿") || a.name.localeCompare(b.name));
    } else if (this._sortBy === "category") {
      items.sort((a, b) => (a.category_name || "￿").localeCompare(b.category_name || "￿") || a.name.localeCompare(b.name));
    } else if (this._sortBy === "expiration") {
      items.sort((a, b) => {
        if (!a.best_before_date && !b.best_before_date) return a.name.localeCompare(b.name);
        if (!a.best_before_date) return 1;
        if (!b.best_before_date) return -1;
        return a.best_before_date.localeCompare(b.best_before_date) || a.name.localeCompare(b.name);
      });
    } else {
      items.sort((a, b) => a.name.localeCompare(b.name));
    }
    return items;
  }

  _render() {
    if (!this._root) return;
    this._root.querySelector(".not-configured-hint").hidden = this._configured;
    this._root.querySelector(".add-stock-btn").hidden = !this._configured;
    const stockList = this._root.querySelector(".stock-list");
    if (!this._configured) {
      stockList.innerHTML = "";
    } else {
      const visible = this._visibleStock();
      if (!this._stock.length) {
        stockList.innerHTML = `<div class="empty-state">Nothing in stock yet - use "Add stock" above.</div>`;
      } else if (!visible.length) {
        stockList.innerHTML = `<div class="empty-state">Nothing matches your search/filters.</div>`;
      } else {
        stockList.innerHTML = visible.map((it) => this._stockRowHtml(it)).join("");
      }
    }
    const extrasList = this._root.querySelector(".extras-list");
    const query = this._searchQuery.trim().toLowerCase();
    const visibleExtras = this._extras
      .filter((ex) => !query || ex.name.toLowerCase().includes(query))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    extrasList.innerHTML = visibleExtras.length
      ? visibleExtras.map((ex) => this._extraRowHtml(ex)).join("")
      : `<div class="empty-state">${this._extras.length ? "Nothing matches your search." : "Nothing else being tracked."}</div>`;
  }

  _css() {
    return `
      :host { display: block; font-family: 'Varela Round', sans-serif; }
      /* v144.13+: matches the Chores/Rewards board's own ha-card chrome
         pixel-for-pixel (same padding/flex/overflow rules) so Pantry reads
         as another full board alongside them rather than a small stacked
         card - see family-hub-chores-card.js's own ha-card/.header/.board
         rules, which these are copied from. */
      ha-card { background: var(--fc-bg); color: var(--fc-text); padding: 12px; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; }
      .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; gap: 8px; }
      .title { font-size: 20px; font-weight: 800; }
      .actions { display: flex; align-items: center; gap: 8px; }
      .add-stock-btn, .add-extra-btn { border: none; border-radius: 12px; padding: 10px 16px; font-size: 14px; font-weight: 700; cursor: pointer; background: var(--fc-accent); color: var(--fc-accent-text); }
      .add-extra-btn { margin: 10px; }
      .not-configured-hint { font-size: 12px; color: var(--fc-text-secondary); background: var(--fc-surface-alt); border-radius: 10px; padding: 8px 10px; margin-bottom: 10px; }
      .not-configured-hint[hidden] { display: none; }
      /* v144.17+: full-CRUD pass - search/sort/filter toolbar, sitting
         between the header and the board same as it would on any list
         view. Wraps to multiple lines on a narrow dashboard rather than
         needing its own breakpoint. */
      .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
      .pantry-search { flex: 1 1 160px; min-width: 120px; box-sizing: border-box; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 13px; font-family: inherit; }
      .pantry-sort { padding: 8px 10px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 13px; font-family: inherit; }
      .filter-toggle { display: flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; white-space: nowrap; }
      .filter-toggle input { width: auto; margin: 0; }
      /* Same board-of-columns shape as the Chores/Rewards board (see
         .board/.chore-column/.chore-col-header there) - Grocy Stock and
         Also Tracking sit side by side on a wide dashboard and stack
         top-to-bottom below the same 700px breakpoint those cards use. */
      .board { flex: 1; display: flex; gap: 10px; overflow-x: auto; overflow-y: hidden; }
      .pantry-column { flex: 1 0 300px; min-width: 300px; display: flex; flex-direction: column; background: var(--fc-card); border: 1px solid var(--fc-border); border-radius: 10px; box-shadow: var(--fc-shadow, 0 2px 5px rgba(0,0,0,0.08)); overflow: hidden; }
      .pantry-col-header { display: flex; align-items: center; gap: 6px; padding: 12px; font-weight: 800; font-size: 15px; background: var(--fc-surface-alt); border-bottom: 3px solid var(--fc-border); }
      .extras-hint { text-transform: none; font-weight: 400; letter-spacing: 0; font-size: 12px; }
      .pantry-col-body { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
      .empty-state { font-size: 13px; color: var(--fc-text-secondary); padding: 10px 4px; }
      .stock-row, .extra-row { display: flex; align-items: center; gap: 10px; background: var(--fc-surface2, var(--fc-bg)); border-radius: 12px; padding: 12px 14px; box-shadow: var(--fc-shadow, 0 2px 5px rgba(0,0,0,0.08)); }
      /* v144.5+: "Liquid glass" support, same convention as
         family-week-calendar-card.js - see that file's own comment on its
         backdrop-filter rule for the full reasoning. Zero-cost for every
         existing theme (blur(0px) is a no-op); -webkit- prefix needed for
         Safari/iOS webviews. */
      .stock-row, .extra-row, .cancel-btn, .not-configured-hint {
        backdrop-filter: blur(var(--fc-glass-blur, 0px));
        -webkit-backdrop-filter: blur(var(--fc-glass-blur, 0px));
      }
      .stock-info { flex: 1; min-width: 0; }
      .stock-name { font-weight: 700; font-size: 14px; }
      .stock-expiry { font-size: 12px; color: var(--fc-text-secondary); }
      .stock-expiry .expiring-soon { color: var(--fc-accent3); font-weight: 700; }
      .stock-expiry .expired { color: var(--fc-accent3); font-weight: 800; }
      .extra-meta, .extra-notes { font-size: 12px; color: var(--fc-text-secondary); }
      /* v144.17+: location/category/low-stock badges on a stock row. */
      .stock-badges { display: flex; flex-wrap: wrap; gap: 4px; margin: 3px 0; }
      .stock-badge { font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 8px; background: var(--fc-surface-alt); color: var(--fc-text-secondary); }
      .low-stock-badge { background: var(--fc-accent3); color: #fff; }
      .stock-amount { font-weight: 800; font-size: 15px; color: var(--fc-accent2); min-width: 2em; text-align: right; }
      .stock-actions { display: flex; gap: 6px; }
      .stock-actions button { border: none; border-radius: 10px; width: 34px; height: 34px; font-size: 16px; cursor: pointer; background: var(--fc-surface-alt); color: var(--fc-text); }
      .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; align-items: center; justify-content: center; }
      .modal-overlay.open { display: flex; }
      .modal-box { background: var(--fc-bg); color: var(--fc-text); border-radius: 14px; padding: 18px; width: min(90vw, 420px); max-height: 85vh; overflow-y: auto; }
      .modal-box label { display: block; margin: 8px 0; font-size: 13px; font-weight: 700; }
      .modal-box input, .modal-box select, .modal-box textarea { width: 100%; box-sizing: border-box; margin-top: 4px; padding: 8px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 13px; font-family: inherit; }
      .modal-box textarea { resize: vertical; }
      .new-product-toggle { display: flex; align-items: center; gap: 6px; font-weight: 400; }
      .new-product-toggle input { width: auto; margin: 0; }
      .new-product-fields[hidden], .existing-product-field[hidden] { display: none; }
      .entries-list { display: flex; flex-direction: column; gap: 10px; margin: 10px 0; }
      /* v144.17+: each stock entry now edits amount+best-before AND
         price+location, so a row is two label/input pairs stacked instead
         of the original two bare inputs side by side. */
      .entry-row { display: flex; flex-direction: column; gap: 6px; padding-bottom: 8px; border-bottom: 1px solid var(--fc-border); }
      .entry-row:last-child { border-bottom: none; padding-bottom: 0; }
      .entry-row-fields { display: flex; gap: 8px; }
      .entry-row-fields label { flex: 1; margin: 0; font-size: 11px; font-weight: 700; }
      .entries-loading { font-size: 12px; color: var(--fc-text-secondary); padding: 10px 0; }
      .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
      .modal-actions button { border: none; border-radius: 10px; padding: 8px 16px; font-weight: 700; cursor: pointer; }
      .save-btn { background: var(--fc-accent); color: var(--fc-accent-text); }
      .cancel-btn { background: var(--fc-surface-alt); color: var(--fc-text); }
      /* v144.17+: the Edit Product modal's Delete button sits at the far
         left of the same .modal-actions row, visually separated from
         Cancel/Save by margin-right: auto so a household never mistakes
         it for a third "confirm" option next to Save. */
      .product-modal-actions { justify-content: flex-start; }
      .product-modal-actions .delete-btn { margin-right: auto; background: transparent; color: var(--fc-accent3); box-shadow: none; }
      .form-error { color: var(--fc-accent3); font-size: 12px; margin-top: 6px; }
      /* Same breakpoint family-hub-chores-card.js/family-week-calendar-card.js
         already use for their own board - stack top-to-bottom instead of a
         horizontally-scrolling row once the dashboard is this narrow. */
      @media (max-width: 700px) {
        .board { flex-direction: column; overflow-x: hidden; overflow-y: auto; }
        .pantry-column { flex: 0 0 auto; min-width: 0; width: 100%; }
        .pantry-col-body { overflow-y: visible; }
      }
    `;
  }
}

customElements.define("family-hub-pantry-card", FamilyHubPantryCard);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "family-hub-pantry-card")) {
  window.customCards.push({
    type: "family-hub-pantry-card",
    name: "Family Hub My Pantry",
    description: "Household stock at a glance - live Grocy stock plus a separate list for items you're tracking without counting toward Grocy's own totals.",
  });
}
