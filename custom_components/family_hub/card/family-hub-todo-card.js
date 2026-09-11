// Family Hub To-Do Lists card (v146+, Grocy shopping lists v146.1+, list
// picker + Put Away v146.2+) - the household's own ask: "can we create a
// family hub style and brand way to display Todo lists, maybe the ability
// to display multiple lists, drag and drop between lists, FAB for adding a
// nice family hub style add modal etc," followed by "we should make this
// card also work with shopping lists from grocy," then "user should be able
// to select what Grocy lists they want, todo and Grocy list selection
// should be in a settings modal under the FAB," and finally "need fuzzy
// match to try and link shopping list items to grocy items when you are
// putting away, also add the put away features to the new Todo cards."
// Unlike every other Family Hub card, this one owns NO backend storage of
// its own - it's a themed, kanban-style front end over two different kinds
// of existing list, mixed freely in the same board:
//
//   - Native Home Assistant todo.* entities (their real shopping lists,
//     reminders lists, whatever - see setConfig's `entities` array), read
//     and written through the native `todo` domain's own services
//     (todo.get_items/add_item/update_item/remove_item/move_item) - the
//     exact same services family-week-calendar-card.js's own reminders/
//     meal-plan/settings features already lean on for their own to-do-
//     backed storage (see that file's _getItems/_fetchReminders and every
//     _hass.callService("todo", ...) call).
//   - Grocy's own shopping list(s) (v146.1+, when a Grocy instance is
//     configured - see setConfig's `includeGrocyShoppingLists` flag), read
//     and written through the SAME family_hub/*_grocy_shopping_list*
//     websocket commands __init__.py already exposes for the calendar
//     card's in-card Grocy Shopping List viewer (_ws_get_grocy_shopping_
//     list/_ws_add_grocy_shopping_list_item/_ws_remove_grocy_shopping_
//     list_item/_ws_toggle_grocy_shopping_list_item/_ws_get_grocy_shopping_
//     lists/_ws_move_grocy_shopping_list_item) - already fully built,
//     tested (test_grocy_shopping_list.py/.js) and registered, so this
//     integration needed zero new backend code, same as the todo.* side.
//
// v146.1's Grocy support needed zero new websocket commands - only the
// usual card-registration wiring (see __init__.py's TODO_CARD_JS_URL block,
// right alongside every other card's identical four-step static-path/hash/
// resource pattern). v146.2 adds two: family_hub/match_grocy_product (a
// fuzzy text->product search, same difflib approach the recipe importer's
// own ingredient matching already uses, reused here for Grocy shopping-list
// rows that have no product link of their own) and an
// unlink_by_row_id flag on the existing family_hub/put_away_grocy_shopping_
// list_item command (deletes the specific row by id instead of Grocy's
// product_id-matched remove-product call, for a row that was only linked
// to a product via that fuzzy match rather than a genuine Grocy-native
// link) - see both commands' own docstrings in __init__.py.
//
// v146.2 also moves list selection off the YAML/UI config editor and into
// an in-card Settings modal (opened from a small gear button stacked above
// the Add FAB) - the household can now tick which todo.* entities AND
// which specific Grocy shopping lists to show without ever opening "Edit
// Card". Saved selections still round-trip through the card's own config
// (a `grocy_list_ids` array alongside the existing `entities` array), using
// the same this.dispatchEvent(new CustomEvent("config-changed", ...))
// mechanism family-screensaver-card.js's own in-card field already
// established for a plain (non-editor) card to persist its own config
// edits back through Lovelace. A config saved before v146.2 (just the
// all-or-nothing `include_grocy_shopping_lists` boolean, no explicit
// `grocy_list_ids` yet) keeps behaving as "all lists" until the household
// opens the new Settings modal once and saves - see _grocySelectedListIds.
//
// v146.3: "when you click the FAB there should be a second tab called
// List(s) that allows you to add and remove lists also Todo lists natively
// have descriptions and due dates when you click an item it should open a
// Trello style modal to see the details." Two changes:
//
//   - The separate gear-button Settings modal from v146.2 is gone. The
//     "+" FAB now opens a single tabbed modal (_openCreateModal) with an
//     "Add Item" tab (_renderAddItemTab, the original Add form) and a
//     "List(s)" tab (_renderListsTab/_saveListsTab, the former Settings
//     modal body, unchanged in behavior) side by side, switched via a
//     small `.modal-tabs` bar. Asked the household whether "add and remove
//     lists" should mean real list creation/deletion; the answer was to
//     keep it to picking which EXISTING lists show, same as v146.2 - HA's
//     todo domain has no generic create/delete API (each todo.* list
//     belongs to its own separate integration), only Grocy could support
//     genuine create/delete, and an inconsistent UX between the two list
//     kinds wasn't worth it. So this is a placement change (one modal
//     instead of two), not a capability change.
//   - Clicking an item's text (not its checkbox/delete/put-away button or
//     a drag) now opens a Trello-style item detail modal
//     (_openItemDetailModal, a new `.item-detail-modal` overlay) showing
//     the item's full details: for a todo.* item, its native `description`
//     and `due_date` fields (real fields the `todo` domain already
//     supports - the exact same todo.update_item field shape family-week-
//     calendar-card.js's own meal-plan/settings storage already uses,
//     `item`/`rename`/`description`/`due_date`, just used here for its
//     literal meaning instead of repurposed JSON storage), editable and
//     saved via the new _updateTodoItemDetails; for a Grocy row, its own
//     `note` and `amount` fields, saved via a new backend command,
//     family_hub/update_grocy_shopping_list_item (_updateGrocyItemDetails)
//     - a generic partial PUT to /api/objects/shopping_list/{id}, same
//     partial-update convention _ws_toggle_grocy_shopping_list_item and
//     the purchase-quantity adjuster already use. A product-linked Grocy
//     row (has a product_id) shows its title read-only, since Grocy always
//     displays such a row using the linked product's own name, not the
//     row's `name` field - editing it here would silently do nothing once
//     the next fetch re-resolves the display name; a freetext row (no
//     product_id) shows an editable title instead. The modal reuses the
//     board's own _toggleItem/_deleteItem/_openPutAwayModal for its
//     checkbox, Delete, and (Grocy-only) Put Away shortcut rather than
//     duplicating that logic - it only owns the new save-details behavior.
//
// v146.4 fixed four real bugs the household hit right after v146.3
// shipped:
//   - The item detail modal's checkbox and title had no visible label at
//     all, just a bare checkbox and input side by side - read as broken.
//     Both now sit under an explicit "Done"/"Title" label
//     (_openItemDetailModal's `.detail-check-label`/`.detail-field-label`).
//   - "moving a card with a due date you get the error entity doesn't
//     support setting field due date." HA's todo domain only allows a
//     due_date/description field when the SPECIFIC entity's own
//     supported_features bitmask (TodoListEntityFeature) advertises it -
//     plenty of real todo.* entities don't, including this very
//     integration's own read-only Chores-as-a-todo-list entity
//     (family_hub/todo.py) and HA's built-in "Shopping List" integration.
//     Sending either field to an entity that doesn't support it throws a
//     hard service error and aborts the whole call. Every place this card
//     sends `due_date`/`description` now checks the destination entity's
//     own supported_features first (see the TODO_FEATURE_* constants and
//     _todoEntitySupportsDueDate/_todoEntitySupportsDescription up top) -
//     _addItem, _moveItemAcrossLists (the actual bug that was reported),
//     and _updateTodoItemDetails - and the Add form / item detail modal
//     hide the corresponding input entirely for an unsupported entity
//     rather than show a control that just errors on submit.
//   - "the card settings for what lists to show overrides the settings
//     modal changes." Home Assistant auto-builds a generic "Edit Card"
//     editor straight from getConfigForm()'s own schema
//     (title/entities/include_grocy_shopping_lists) - that generic
//     editor's own save event carries ONLY those three fields as the
//     WHOLE new config, with no idea `grocy_list_ids` (written only by
//     this card's own in-card List(s) tab) exists at all. Opening "Edit
//     Card" from the dashboard UI and hitting Save - even without
//     touching anything - silently wiped the household's Grocy list
//     picks. Fixed with a small custom getConfigElement/
//     FamilyHubTodoCardEditor that wraps the very same ha-form/schema but
//     merges its emitted patch into a COPY of the card's full existing
//     config instead of replacing it outright, so grocy_list_ids (and any
//     other key this card owns itself) survives a save made through that
//     generic dialog.
//
// v146.5 fixed the deeper version of that same v146.4 bug #3: "if you set
// the lists via the FAB and reload they all disappear." v146.4 stopped
// "Edit Card" from DROPPING the selection, but the List(s) tab itself
// still only ever persisted through setConfig + a dispatched
// config-changed event - and NOTHING listens for that event outside of
// Home Assistant's own dashboard EDITING flow. Using the FAB isn't
// "editing the card," so that event went nowhere, and the very next plain
// page reload just re-read whatever was already saved in the dashboard's
// own stored YAML/storage config (usually nothing) - the selection never
// actually reached durable storage at all, Edit Card or not. Fixed by
// giving the card its own small backend Store instead
// (family_hub/get_todo_card_config / set_todo_card_config in __init__.py,
// its own TODO_CARD_CONFIG_STORAGE_KEY_PREFIX - deliberately separate from
// the shared family_hub/get_settings blob so a save here can never be
// clobbered by, or clobber, the calendar card's own Settings modal, the
// same class of bug _ws_set_settings's own docstring already documents
// happening for real with SETTINGS_KEY_NOTIFY_PROFILES_MIGRATED). Fetched
// once at load (_fetchTodoCardConfig, alongside _fetchSettings) into
// _backendEntities/_backendGrocyListIds, which _selectedTodoEntities/
// _grocySelectedListIds now prefer over the card's own config.entities/
// grocyListIds - those fields are kept only as the LEGACY fallback for a
// card that's never had anything saved through the FAB yet.
// _saveListsTab now calls family_hub/set_todo_card_config directly
// (applied optimistically first, so the board updates immediately) and no
// longer touches setConfig/config-changed at all for this data - the FAB
// is now the one fully reliable way to configure which lists show,
// exactly as it was meant to be.
//
// A standalone card, independently addable to any dashboard - same
// self-contained, independently-loaded-Lovelace-resource shape as every
// other Family Hub card, copy-pasting its own PALETTE/theme handling/_esc/
// _escAttr boilerplate rather than importing it, matching this project's
// established convention for every Family Hub card.
//
// Layout: one column per configured list (todo.* entities AND, when
// enabled, every Grocy shopping list), side by side - a horizontally-
// scrolling row on a narrow screen, same "columns everywhere, scroll for
// overflow" shape as the Chores/Rewards boards use for their own per-person
// columns; the household picked "columns" over "tabs" explicitly. Drag an
// item card onto another column to move it there; drag it up/down within
// its own column to reorder in place (todo.* lists only - see
// _reorderItem's own comment on why a Grocy list can't be reordered this
// way). Checked-off items collapse into a per-column "Completed" accordion,
// same collapsed-by-default pattern as family-hub-chores-card.js's own
// per-column Completed accordion and family-hub-goals-card.js's single-list
// one.
//
// Every list this card touches is described internally as a small
// "descriptor" object - { key, kind: "todo"|"grocy", entity?, listId?,
// name? } - rather than a bare entity id string, since a Grocy shopping
// list has no todo.* entity_id of its own to key off. `key` is what shows
// up in every data-list-key attribute and _lists/_completedOpen lookup:
// the entity id itself for a todo.* list, "grocy:<list id>" for a Grocy
// list. See _listDescriptors/_descriptorByKey.

const PALETTE = ["#a9c6c2", "#dba99c", "#d9bf7e", "#a8bd93", "#b9a7c9", "#cf8f6c", "#a89a83", "#7fa7b0", "#c98fa0"];

// Home Assistant's `todo` domain only lets an item carry a due date or a
// description when the SPECIFIC entity's own integration advertises that
// via its `supported_features` bitmask (TodoListEntityFeature, defined in
// HA core's homeassistant/components/todo/__init__.py) - plenty of real
// todo.* entities don't, including this very integration's own read-only
// Chores-as-a-todo-list entity (family_hub/todo.py's
// FamilyHubChoresTodoListEntity, CREATE/UPDATE/DELETE only - no due date or
// description bits at all) and HA's own built-in "Shopping List"
// integration. Calling todo.update_item/add_item with a `due_date` or
// `description` field the entity doesn't support throws a hard
// ServiceValidationError ("entity doesn't support setting field ...") -
// every place this card sends either field checks the bit first (see
// _todoEntitySupportsDueDate/_todoEntitySupportsDescription below), and the
// Add form / item detail modal hide the corresponding input entirely for
// an unsupported entity rather than show a control that would silently do
// nothing (or now, error) on submit.
const TODO_FEATURE_DUE_DATE = 16; // SET_DUE_DATE_ON_ITEM
const TODO_FEATURE_DUE_DATETIME = 32; // SET_DUE_DATETIME_ON_ITEM
const TODO_FEATURE_DESCRIPTION = 64; // SET_DESCRIPTION_ON_ITEM

class FamilyHubTodoCard extends HTMLElement {
  static getStubConfig() {
    return { title: "To-Do Lists", entities: [], include_grocy_shopping_lists: false };
  }
  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "entities", selector: { entity: { domain: "todo", multiple: true } } },
        { name: "include_grocy_shopping_lists", selector: { boolean: {} } },
      ],
      computeLabel: (s) =>
        s.name === "title" ? "Title" : s.name === "entities" ? "Lists to show" : s.name === "include_grocy_shopping_lists" ? "Also show Grocy shopping list(s)" : undefined,
    };
  }
  // A custom editor element (v146.3+) rather than letting Home Assistant
  // auto-build one straight from getConfigForm's own schema. That auto
  // editor's own "value-changed" event carries ONLY the schema's three
  // fields (title/entities/include_grocy_shopping_lists) as the WHOLE new
  // config - it has no idea `grocy_list_ids` (the household's actual
  // Grocy list picks, saved only by the in-card List(s) tab, see
  // _saveListsTab) exists at all, so opening "Edit Card" from the
  // dashboard's own UI and hitting Save - even without touching
  // anything - would silently wipe that selection, undoing whatever the
  // household picked in the List(s) tab. This wraps the very same
  // ha-form/schema instead, but merges its emitted patch into a COPY of
  // the card's full existing config before firing config-changed, so any
  // key this card owns itself that isn't part of the schema survives.
  static getConfigElement() {
    return document.createElement("family-hub-todo-card-editor");
  }
  setConfig(config) {
    const entities = Array.isArray(config && config.entities) ? config.entities.filter((e) => typeof e === "string" && e.startsWith("todo.")) : [];
    // grocy_list_ids (v146.2+) is the household's explicit pick of WHICH
    // Grocy shopping lists to show, saved by the new Settings modal - see
    // _grocySelectedListIds for how this and the older all-or-nothing
    // include_grocy_shopping_lists boolean combine (undefined here means
    // "the Settings modal has never saved a selection yet").
    const grocyListIds = Array.isArray(config && config.grocy_list_ids)
      ? config.grocy_list_ids.map((v) => parseInt(v, 10)).filter((v) => Number.isFinite(v))
      : undefined;
    this._config = {
      title: (config && config.title) || "To-Do Lists",
      entities,
      includeGrocyShoppingLists: !!(config && config.include_grocy_shopping_lists),
      grocyListIds,
    };
    if (this._settingsCache === undefined) this._settingsCache = null;
    if (this._globalThemes === undefined) this._globalThemes = [];
    // { [listKey]: { items: [{uid, summary, status, due}] } } - listKey is
    // an entity id for a todo.* list, "grocy:<id>" for a Grocy list (see
    // this file's own top-of-file comment on the descriptor shape).
    if (this._lists === undefined) this._lists = {};
    // Grocy's own shopping lists, [{id, name}] - fetched every poll tick
    // (family_hub/get_grocy_shopping_lists) regardless of whether any are
    // currently selected, since the Settings modal needs the full list to
    // build its own checklist even before the household has picked any.
    // Grocy list NAMES live only in Grocy itself (unlike a todo.* entity's
    // friendly_name, which hass.states already has) so this is this
    // card's own cache of them, refreshed alongside everything else.
    if (this._grocyLists === undefined) this._grocyLists = [];
    // Whether the last get_grocy_shopping_lists fetch found Grocy
    // configured at all - undefined until the first fetch resolves, then
    // true/false. Drives whether the Settings modal's Grocy section shows
    // a checklist or a "Grocy isn't set up yet" hint.
    if (this._grocyConfigured === undefined) this._grocyConfigured = undefined;
    // { [listKey]: boolean } - per-column Completed-accordion open state,
    // device-local UI state only (same "no reason this survives a reload"
    // spirit as family-hub-pantry-card.js's own search/sort/filter fields).
    if (this._completedOpen === undefined) this._completedOpen = {};
    // Grocy locations, cached once per card session for the Put Away
    // modal's own location picker - same one-fetch-then-cache convention
    // family-week-calendar-card.js's own _fetchGrocyLocations uses.
    if (this._grocyLocationsCache === undefined) this._grocyLocationsCache = null;
    if (this._firstLoadPromise === undefined) this._firstLoadPromise = null;
    if (this._dragState === undefined) this._dragState = null;
    // The household's actual saved list selection (v146.5+), fetched once
    // from the backend's own small Store - see _fetchTodoCardConfig and
    // _selectedTodoEntities/_grocySelectedListIds. null until the first
    // fetch resolves (during which _selectedTodoEntities/
    // _grocySelectedListIds fall back to the legacy config fields below,
    // same as they would once fetched and finding nothing saved yet).
    if (this._backendEntities === undefined) this._backendEntities = null;
    if (this._backendGrocyListIds === undefined) this._backendGrocyListIds = null;
    if (!this._built) this._build();
    this._render();
  }
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._firstLoadPromise = this._initFirstLoad();
  }
  async _initFirstLoad() {
    await this._fetchSettings();
    if (this._getSettings().useGlobalTheme) await this._fetchGlobalThemes();
    await this._fetchTodoCardConfig();
    await this._fetchAllLists();
    this._startPolling();
  }
  // The household's actual saved list selection (v146.5+) - see
  // family_hub/get_todo_card_config's own docstring in __init__.py for why
  // this now lives in its own small backend Store instead of only ever
  // round-tripping through the card's own Lovelace config (setConfig +
  // config-changed): that event is only ever listened for by Home
  // Assistant's own dashboard EDITING UI, so a save made from the FAB's
  // List(s) tab - which isn't "editing the card," just using it - never
  // actually reached anything that would persist it, and silently reverted
  // on the very next plain page reload. Both fields come back `null` when
  // nothing's ever been saved this way yet (see
  // _selectedTodoEntities/_grocySelectedListIds for the legacy
  // config-field fallback in that case).
  async _fetchTodoCardConfig() {
    if (!this._hass) return;
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_todo_card_config" });
      this._backendEntities = Array.isArray(result && result.entities)
        ? result.entities.filter((e) => typeof e === "string" && e.startsWith("todo."))
        : null;
      this._backendGrocyListIds = Array.isArray(result && result.grocy_list_ids)
        ? result.grocy_list_ids.map((v) => parseInt(v, 10)).filter((v) => Number.isFinite(v))
        : null;
    } catch (e) {
      this._backendEntities = null;
      this._backendGrocyListIds = null;
    }
  }
  _startPolling() {
    if (this._interval) return;
    // Same 20s cadence as Chores/Goals - a to-do/shopping list is exactly
    // the kind of thing someone else in the household (or Home Assistant's
    // own built-in To-do UI, or Grocy's own separate website) might be
    // editing at the same time as this card is open, so it shouldn't lag
    // far behind.
    this._interval = setInterval(() => this._fetchAllLists(), 20 * 1000);
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
    return { columns: 12, min_columns: 6, max_columns: 12, min_rows: 6 };
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
  // Same this-device-only theme-override key as every other standalone
  // Family Hub card - see family-hub-pantry-card.js's own _getDeviceThemeOverride
  // for the full reasoning (Settings lives only on the calendar card).
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
  _esc(s) {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  }
  _escAttr(s) {
    return this._esc(s).replace(/"/g, "&quot;");
  }

  // -- List descriptors ----------------------------------------------------
  // See this file's own top-of-file comment for the descriptor shape. Order
  // is stable and drives both column order and PALETTE color assignment:
  // configured todo.* entities first (in their configured order), then
  // every Grocy shopping list (in id order, matching _ws_get_grocy_shopping_
  // lists's own sort), so adding/removing a Grocy list never reshuffles an
  // existing todo.* column's color.

  _listDescriptors() {
    const todoDescriptors = this._selectedTodoEntities().map((entity) => ({ key: entity, kind: "todo", entity }));
    const selected = this._grocySelectedListIds();
    const grocyDescriptors = (this._grocyLists || [])
      .filter((l) => selected === null || selected.includes(l.id))
      .map((l) => ({ key: `grocy:${l.id}`, kind: "grocy", listId: l.id, name: l.name }));
    return todoDescriptors.concat(grocyDescriptors);
  }
  _descriptorByKey(key) {
    return this._listDescriptors().find((d) => d.key === key) || null;
  }
  // Which todo.* entities to show as columns (v146.5+). Prefers the
  // household's actual saved pick from the backend's own small Store
  // (family_hub/get_todo_card_config, fetched once at load - see
  // _fetchTodoCardConfig) over the card's own YAML/dashboard config
  // (`entities`) - that config field is now only ever consulted as the
  // LEGACY fallback for a card that's never had anything saved through the
  // FAB's List(s) tab yet (this._backendEntities still null at that
  // point). See _fetchTodoCardConfig's own comment for why a plain
  // Lovelace config field could never be trusted for this in the first
  // place - dispatching config-changed from a plain (non-editing) view
  // never gets picked up by anything, so it silently never survived a
  // page reload.
  _selectedTodoEntities() {
    return Array.isArray(this._backendEntities) ? this._backendEntities : (this._config.entities || []);
  }
  // Which Grocy list ids to show as columns (v146.5+). Same backend-first,
  // config-as-legacy-fallback shape as _selectedTodoEntities above -
  // prefers the backend's own saved array, then the older
  // config.grocy_list_ids (v146.2-146.4, still round-tripped through
  // setConfig for a card that predates the backend store entirely), then
  // `null` as an "all lists" sentinel for a config from even before that
  // (only the all-or-nothing include_grocy_shopping_lists boolean) - kept
  // as "all" rather than silently narrowing to nothing on upgrade, until
  // the household opens the List(s) tab once and saves a real selection
  // (which always writes an explicit array to the backend from then on,
  // even an empty one, and that's the one that wins from then on).
  _grocySelectedListIds() {
    if (Array.isArray(this._backendGrocyListIds)) return this._backendGrocyListIds;
    if (Array.isArray(this._config.grocyListIds)) return this._config.grocyListIds;
    return this._config.includeGrocyShoppingLists ? null : [];
  }

  // -- Data ------------------------------------------------------------------

  async _getTodoItems(entityId) {
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
  // Normalizes a Grocy shopping_list row (see __init__.py's
  // _ws_get_grocy_shopping_list docstring for the raw shape) into this
  // card's common item shape. amount_display (e.g. "2 pieces") is folded
  // into the display summary in parentheses when present, since this card
  // has no separate amount column the way the Recipe Box's Grocy Shopping
  // List viewer does - `rawName` keeps the plain product/freetext name on
  // its own (no amount folded in) for the Put Away modal's product search
  // seed and confirmation label. `productId`/`amount`/`defaultLocationId`/
  // `defaultBestBeforeDays` carry straight through from the row for the
  // same modal - see _openPutAwayModal.
  async _getGrocyItems(listId) {
    const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_grocy_shopping_list", list_id: listId });
    const rows = (result && Array.isArray(result.items)) ? result.items : [];
    return rows.map((row) => ({
      uid: String(row.id),
      summary: row.amount_display ? `${row.name} (${row.amount_display})` : row.name,
      status: row.done ? "completed" : "needs_action",
      due: null,
      rawName: row.name,
      productId: row.product_id != null ? row.product_id : null,
      amount: typeof row.amount === "number" && row.amount > 0 ? row.amount : 1,
      // note (v146.3+): the shopping-list row's own free-text note field -
      // the closest Grocy equivalent to a todo.* item's description, shown
      // and edited from the item detail modal (see _openItemDetailModal).
      note: row.note || "",
      defaultLocationId: row.default_location_id != null ? row.default_location_id : null,
      defaultBestBeforeDays: typeof row.default_best_before_days === "number" ? row.default_best_before_days : null,
    }));
  }
  // Always fetches (not gated on any selection) - the Settings modal needs
  // the full list-of-lists to build its own checklist even when nothing
  // is currently selected, or nothing has been picked yet. Also tracks
  // whether Grocy is configured at all, for that same modal's hint text.
  async _fetchGrocyLists() {
    if (!this._hass) return;
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_grocy_shopping_lists" });
      this._grocyConfigured = !!(result && result.configured);
      this._grocyLists = (result && result.configured && Array.isArray(result.lists)) ? result.lists : [];
    } catch (e) {
      this._grocyConfigured = false;
      this._grocyLists = [];
    }
  }
  async _fetchAllLists() {
    if (!this._hass) return;
    // Grocy's own list-of-lists first (it drives which Grocy columns even
    // exist this render), THEN every list's items in parallel.
    await this._fetchGrocyLists();
    const descriptors = this._listDescriptors();
    await Promise.all(
      descriptors.map(async (d) => {
        try {
          const items = d.kind === "grocy" ? await this._getGrocyItems(d.listId) : await this._getTodoItems(d.entity);
          this._lists[d.key] = { items };
        } catch (e) {
          // That list doesn't exist/isn't reachable right now (a todo.*
          // entity removed from HA, a Grocy list deleted mid-session, a
          // typo'd config, Grocy itself unreachable) - keep whatever we
          // last had (probably nothing) rather than throwing the whole
          // board's render.
          if (!this._lists[d.key]) this._lists[d.key] = { items: [] };
        }
      })
    );
    this._render();
  }
  _listName(descriptor) {
    if (descriptor.kind === "grocy") return descriptor.name || `Grocy list #${descriptor.listId}`;
    const st = this._hass && this._hass.states && this._hass.states[descriptor.entity];
    return (st && st.attributes && st.attributes.friendly_name) || descriptor.entity.replace(/^todo\./, "").replace(/_/g, " ");
  }
  // See the TODO_FEATURE_* constants' own comment up top for why this
  // check exists at all - a bare bitwise AND against the entity's own
  // supported_features state attribute, 0 (nothing supported) when the
  // entity can't be found at all rather than throwing.
  _todoEntitySupportsFeature(entityId, bit) {
    const st = this._hass && this._hass.states && this._hass.states[entityId];
    const features = (st && st.attributes && st.attributes.supported_features) || 0;
    return (features & bit) === bit;
  }
  _todoEntitySupportsDueDate(entityId) {
    return this._todoEntitySupportsFeature(entityId, TODO_FEATURE_DUE_DATE) || this._todoEntitySupportsFeature(entityId, TODO_FEATURE_DUE_DATETIME);
  }
  _todoEntitySupportsDescription(entityId) {
    return this._todoEntitySupportsFeature(entityId, TODO_FEATURE_DESCRIPTION);
  }
  _listColor(key) {
    const idx = this._listDescriptors().findIndex((d) => d.key === key);
    return PALETTE[(idx >= 0 ? idx : 0) % PALETTE.length];
  }
  _itemsFor(key) {
    return (this._lists[key] && this._lists[key].items) || [];
  }
  _activeItems(key) {
    return this._itemsFor(key).filter((it) => it.status !== "completed");
  }
  _completedItems(key) {
    return this._itemsFor(key).filter((it) => it.status === "completed");
  }

  // -- Mutations -------------------------------------------------------------

  async _toggleItem(key, uid, completed) {
    // Optimistic flip so the checkbox responds instantly instead of
    // waiting a round trip - _fetchAllLists (on the next poll, or right
    // after this call resolves) reconciles with whatever the real backend
    // (Home Assistant's todo integration, or Grocy) actually ended up with.
    const item = this._itemsFor(key).find((it) => it.uid === uid);
    if (item) item.status = completed ? "completed" : "needs_action";
    this._render();
    const descriptor = this._descriptorByKey(key);
    try {
      if (descriptor && descriptor.kind === "grocy") {
        await this._hass.connection.sendMessagePromise({ type: "family_hub/toggle_grocy_shopping_list_item", item_id: parseInt(uid, 10), done: completed });
      } else {
        await this._hass.callService("todo", "update_item", { item: uid, status: completed ? "completed" : "needs_action" }, { entity_id: key });
      }
    } catch (e) {
    }
    this._fetchAllLists();
  }
  async _deleteItem(key, uid) {
    const list = this._lists[key];
    if (list) list.items = list.items.filter((it) => it.uid !== uid);
    this._render();
    const descriptor = this._descriptorByKey(key);
    try {
      if (descriptor && descriptor.kind === "grocy") {
        await this._hass.connection.sendMessagePromise({ type: "family_hub/remove_grocy_shopping_list_item", item_id: parseInt(uid, 10) });
      } else {
        await this._hass.callService("todo", "remove_item", { item: uid }, { entity_id: key });
      }
    } catch (e) {
    }
    this._fetchAllLists();
  }
  async _addItem(key, summary, dueDate) {
    if (!summary || !summary.trim()) return;
    const descriptor = this._descriptorByKey(key);
    try {
      if (descriptor && descriptor.kind === "grocy") {
        // Grocy shopping list rows have no due date - dueDate is simply
        // never sent here, same as the Add modal hiding that field once a
        // Grocy list is selected (see _openCreateModal).
        await this._hass.connection.sendMessagePromise({ type: "family_hub/add_grocy_shopping_list_item", text: summary.trim(), list_id: descriptor.listId });
      } else {
        const data = { item: summary.trim() };
        if (dueDate && this._todoEntitySupportsDueDate(key)) data.due_date = dueDate;
        await this._hass.callService("todo", "add_item", data, { entity_id: key });
      }
    } catch (e) {
    }
    this._fetchAllLists();
  }
  // Item detail modal saves (v146.3+) - a todo.* item's native description
  // and due date (todo.update_item's own `description`/`due_date` fields,
  // the same ones family-week-calendar-card.js already uses for its own
  // repurposed to-do-backed storage, just used here for their literal
  // plain-English meaning rather than a JSON payload). `rename` is only
  // sent when the title actually changed, so an unrelated update never
  // accidentally touches Grocy/HA's own "when was this last renamed"-style
  // bookkeeping for no reason.
  async _updateTodoItemDetails(key, uid, { title, originalTitle, description, dueDate }) {
    const data = { item: uid };
    if (title && title.trim() && title.trim() !== originalTitle) data.rename = title.trim();
    // Only ever sent when the entity itself supports the field (see the
    // TODO_FEATURE_* comment up top and _openItemDetailModal, which hides
    // the corresponding input entirely for an unsupported entity) - the
    // caller may still pass one through anyway (e.g. a stale form), so
    // this is the actual last line of defense against the hard
    // "entity doesn't support setting field ..." service error.
    if (this._todoEntitySupportsDescription(key)) data.description = description || "";
    if (dueDate && this._todoEntitySupportsDueDate(key)) data.due_date = dueDate;
    try {
      await this._hass.callService("todo", "update_item", data, { entity_id: key });
    } catch (e) {
    }
    this._fetchAllLists();
  }
  // A Grocy row's `note` is the closest equivalent to a todo.* item's
  // description; `name` only actually changes anything for a freetext row
  // (see __init__.py's _ws_update_grocy_shopping_list_item docstring) -
  // the item detail modal only offers to rename a Grocy item when it has
  // no product link, so `name` is passed through only in that case.
  async _updateGrocyItemDetails(uid, { name, note, amount }) {
    const msg = { type: "family_hub/update_grocy_shopping_list_item", item_id: parseInt(uid, 10), note: note || "" };
    if (name && name.trim()) msg.name = name.trim();
    if (typeof amount === "number" && amount > 0) msg.amount = amount;
    try {
      await this._hass.connection.sendMessagePromise(msg);
    } catch (e) {
    }
    this._fetchAllLists();
  }
  // In-list reorder (drag within the same column). previousUid null/undefined
  // means "move to the very top" - todo.move_item's own convention. Grocy
  // shopping lists have no persisted custom order to move WITHIN - Grocy's
  // own _ws_get_grocy_shopping_list handler always re-sorts by (done, name)
  // server-side on every fetch (matching Grocy's own shopping list page),
  // so there is no backend call that could make a same-list Grocy reorder
  // stick; it's a deliberate no-op rather than a call that would silently
  // do nothing anyway. Dragging a Grocy item onto a DIFFERENT list still
  // fully works - see _moveItemAcrossLists.
  async _reorderItem(key, uid, previousUid) {
    const descriptor = this._descriptorByKey(key);
    if (descriptor && descriptor.kind === "grocy") return;
    try {
      await this._hass.callService(
        "todo",
        "move_item",
        previousUid ? { item: uid, previous_uid: previousUid } : { item: uid },
        { entity_id: key }
      );
    } catch (e) {
      // A third-party todo platform that doesn't implement move_item - the
      // drag itself is still harmless, the list just won't reorder. Every
      // other action on this card (add/toggle/delete/cross-list move) is
      // unaffected either way.
    }
    this._fetchAllLists();
  }
  // Cross-list move (drag onto a different column) - dispatches on the
  // SOURCE and DESTINATION kinds, since the three combinations need three
  // different backend calls:
  //   - grocy -> grocy: Grocy has a real move endpoint
  //     (family_hub/move_grocy_shopping_list_item, a PUT changing just the
  //     row's shopping_list_id column) that preserves the item's own
  //     identity/product link - used whenever both ends are Grocy lists,
  //     in preference to the recreate-and-delete every other combination
  //     needs.
  //   - todo -> todo: HA's todo integration has no native cross-entity
  //     move - recreated on the destination (todo.add_item) then removed
  //     from the source (todo.remove_item).
  //   - todo <-> grocy (either direction): no shared "move" primitive
  //     exists between the two backends at all - same recreate-then-remove
  //     shape, just crossing from one backend's add call to the other's
  //     remove call (or vice versa).
  // In every recreate-based case, add happens BEFORE remove - if the
  // remove somehow fails (list offline mid-drag, etc.) the item still
  // exists somewhere rather than vanishing outright.
  async _moveItemAcrossLists(sourceKey, item, destKey) {
    const source = this._descriptorByKey(sourceKey);
    const dest = this._descriptorByKey(destKey);
    if (!source || !dest) return;
    try {
      if (source.kind === "grocy" && dest.kind === "grocy") {
        await this._hass.connection.sendMessagePromise({ type: "family_hub/move_grocy_shopping_list_item", item_id: parseInt(item.uid, 10), list_id: dest.listId });
      } else if (dest.kind === "grocy") {
        await this._hass.connection.sendMessagePromise({ type: "family_hub/add_grocy_shopping_list_item", text: item.summary || "(untitled)", list_id: dest.listId });
        if (source.kind === "grocy") {
          await this._hass.connection.sendMessagePromise({ type: "family_hub/remove_grocy_shopping_list_item", item_id: parseInt(item.uid, 10) });
        } else {
          await this._hass.callService("todo", "remove_item", { item: item.uid }, { entity_id: source.entity });
        }
      } else {
        // dest is a todo.* list; source is either todo.* or grocy. Only
        // carry description/due date over when the DESTINATION entity
        // actually supports that field (see the TODO_FEATURE_* comment up
        // top) - sending either to an entity that doesn't throws a hard
        // error and would abort the whole move.
        const data = { item: item.summary || "(untitled)" };
        if (item.description && this._todoEntitySupportsDescription(dest.entity)) data.description = item.description;
        if (item.due && this._todoEntitySupportsDueDate(dest.entity)) data.due_date = item.due;
        await this._hass.callService("todo", "add_item", data, { entity_id: dest.entity });
        if (source.kind === "grocy") {
          await this._hass.connection.sendMessagePromise({ type: "family_hub/remove_grocy_shopping_list_item", item_id: parseInt(item.uid, 10) });
        } else {
          await this._hass.callService("todo", "remove_item", { item: item.uid }, { entity_id: source.entity });
        }
      }
    } catch (e) {
    }
    this._fetchAllLists();
  }

  // -- Rendering ---------------------------------------------------------------

  _itemHtml(key, item) {
    const completed = item.status === "completed";
    // Put Away (v146.2+): offered on every ACTIVE Grocy item, not just
    // ones Grocy already linked to a product - unlike the calendar card's
    // own Grocy Shopping List viewer (product_id-only), a freetext row
    // here still gets the button; _openPutAwayModal runs a fuzzy product
    // search for it instead of assuming a known product. Opens a modal
    // (built fresh each time, like the Add modal) rather than an inline
    // panel, so a poll-tick re-render of the board never wipes mid-entry.
    const descriptor = this._descriptorByKey(key);
    const putawayBtn = descriptor && descriptor.kind === "grocy" && !completed
      ? `<button class="todo-putaway-btn" title="Put away" data-list-key="${this._escAttr(key)}" data-uid="${this._escAttr(item.uid)}">&#128230;</button>`
      : "";
    return `
      <div class="todo-item${completed ? " completed" : ""}" data-list-key="${this._escAttr(key)}" data-uid="${this._escAttr(item.uid)}" draggable="${completed ? "false" : "true"}">
        <input type="checkbox" class="todo-check" ${completed ? "checked" : ""} data-list-key="${this._escAttr(key)}" data-uid="${this._escAttr(item.uid)}">
        <div class="todo-item-text">
          <div class="todo-item-summary">${this._esc(item.summary || "(untitled)")}</div>
          ${item.due ? `<div class="todo-item-due">${this._esc(item.due)}</div>` : ""}
        </div>
        ${putawayBtn}
        <button class="todo-delete-btn" title="Delete" data-list-key="${this._escAttr(key)}" data-uid="${this._escAttr(item.uid)}">&#10005;</button>
      </div>
    `;
  }
  _completedAccordionHtml(key) {
    const completed = this._completedItems(key);
    if (!completed.length) return "";
    const open = !!this._completedOpen[key];
    const body = open ? `<div class="completed-body">${completed.map((it) => this._itemHtml(key, it)).join("")}</div>` : "";
    return `
      <div class="completed-row">
        <div class="completed-header" data-list-key="${this._escAttr(key)}">
          <span class="completed-toggle-icon">${open ? "&#9662;" : "&#9656;"}</span>
          <span class="completed-title">Completed</span>
          <span class="completed-badge">${completed.length}</span>
        </div>
        ${body}
      </div>
    `;
  }
  _columnHtml(descriptor) {
    const key = descriptor.key;
    const color = this._listColor(key);
    const active = this._activeItems(key);
    const itemsHtml = active.length
      ? active.map((it) => this._itemHtml(key, it)).join("")
      : `<div class="empty-state">Nothing here</div>`;
    // v146.1+: a small "Grocy" tag on Grocy-backed columns, so the board
    // makes it obvious at a glance which lists are shared with Grocy's own
    // separate app/website (someone might also add/check items there) vs.
    // a plain Home Assistant to-do list nobody else touches.
    const grocyTag = descriptor.kind === "grocy" ? `<span class="todo-column-source-tag">Grocy</span>` : "";
    return `
      <div class="todo-column" data-list-key="${this._escAttr(key)}">
        <div class="todo-column-header" style="border-top-color:${color}">
          <span class="todo-column-title">${this._esc(this._listName(descriptor))}</span>
          ${grocyTag}
          <span class="todo-column-count">${active.length}</span>
        </div>
        <div class="todo-column-items" data-list-key="${this._escAttr(key)}">${itemsHtml}</div>
        ${this._completedAccordionHtml(key)}
      </div>
    `;
  }
  _boardHtml() {
    const descriptors = this._listDescriptors();
    if (!descriptors.length) {
      const hint = this._grocyConfigured
        ? "No lists configured yet - tap the gear icon to pick one or more to-do or Grocy lists to show."
        : "No lists configured yet - tap the gear icon to pick one or more to-do lists to show.";
      return `<div class="empty-state">${hint}</div>`;
    }
    return `<div class="todo-board-row">${descriptors.map((d) => this._columnHtml(d)).join("")}</div>`;
  }
  _render() {
    if (!this._root) return;
    this._root.querySelector(".board").innerHTML = this._boardHtml();
  }

  // -- Build / events ----------------------------------------------------------

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
      <div class="modal-overlay putaway-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay item-detail-modal"><div class="modal-box"></div></div>
      <button class="add-todo-fab" title="Add an item" aria-haspopup="true">&#65291;</button>
    `;
    this._root = root;
    root.querySelector(".title").textContent = this._config.title;
    root.querySelector(".add-todo-fab").addEventListener("click", () => this._openCreateModal());
    root.querySelectorAll(".modal-overlay").forEach((overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.classList.remove("open");
      });
    });
    const board = root.querySelector(".board");
    board.addEventListener("click", (e) => this._onBoardClick(e));
    board.addEventListener("change", (e) => this._onBoardChange(e));
    board.addEventListener("dragstart", (e) => this._onDragStart(e));
    board.addEventListener("dragend", (e) => this._onDragEnd(e));
    board.addEventListener("dragover", (e) => this._onDragOver(e));
    board.addEventListener("dragleave", (e) => this._onDragLeave(e));
    board.addEventListener("drop", (e) => this._onDrop(e));
  }
  _onBoardClick(e) {
    const completedHeader = e.target.closest(".completed-header");
    if (completedHeader) {
      const key = completedHeader.dataset.listKey;
      this._completedOpen[key] = !this._completedOpen[key];
      this._render();
      return;
    }
    const putawayBtn = e.target.closest(".todo-putaway-btn");
    if (putawayBtn) {
      this._openPutAwayModal(putawayBtn.dataset.listKey, putawayBtn.dataset.uid);
      return;
    }
    const deleteBtn = e.target.closest(".todo-delete-btn");
    if (deleteBtn) {
      this._deleteItem(deleteBtn.dataset.listKey, deleteBtn.dataset.uid);
      return;
    }
    // Trello-style item detail (v146.3+) - only the text/summary part of a
    // row opens it, never the checkbox/delete/put-away buttons or a drag
    // gesture, so those keep working exactly as before.
    const itemText = e.target.closest(".todo-item-text");
    if (itemText) {
      const itemEl = itemText.closest(".todo-item");
      if (itemEl) this._openItemDetailModal(itemEl.dataset.listKey, itemEl.dataset.uid);
    }
  }
  _onBoardChange(e) {
    const check = e.target.closest(".todo-check");
    if (check) {
      this._toggleItem(check.dataset.listKey, check.dataset.uid, check.checked);
    }
  }

  // -- Drag and drop -----------------------------------------------------------
  // Native HTML5 drag/drop (no library) - draggable="true" on each active
  // .todo-item (see _itemHtml; completed items are deliberately not
  // draggable, matching the "completed items are done, not being organized"
  // framing the Completed accordion already implies elsewhere in Family
  // Hub). Drop target resolution finds the nearest item boundary under the
  // pointer within the destination column, so a drop lands where it visibly
  // looks like it's landing rather than always at the top or bottom -
  // matching the household's plain "drag and drop between lists" ask
  // without needing a heavier drag-and-drop library for a single card. This
  // works identically for todo.* and Grocy-backed columns alike - the drop
  // handler dispatches on kind (via _descriptorByKey) only when deciding
  // WHICH backend call(s) to make, never in how the drag itself is tracked.

  _onDragStart(e) {
    const el = e.target.closest(".todo-item");
    if (!el || el.classList.contains("completed")) return;
    const key = el.dataset.listKey;
    const uid = el.dataset.uid;
    const item = this._itemsFor(key).find((it) => it.uid === uid);
    if (!item) return;
    this._dragState = { sourceKey: key, item };
    el.classList.add("dragging");
    try {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", uid);
    } catch (err) {
      // Some test/headless DOM environments don't implement dataTransfer
      // fully - the drag still works off this._dragState alone.
    }
  }
  _onDragEnd(e) {
    const el = e.target.closest(".todo-item");
    if (el) el.classList.remove("dragging");
    this._root.querySelectorAll(".todo-column-items.drag-over").forEach((c) => c.classList.remove("drag-over"));
    this._dragState = null;
  }
  _closestItemBelow(container, clientY) {
    const items = Array.from(container.querySelectorAll(".todo-item:not(.dragging)"));
    let closest = null;
    let closestOffset = -Infinity;
    for (const item of items) {
      const box = item.getBoundingClientRect();
      const offset = clientY - box.top - box.height / 2;
      if (offset < 0 && offset > closestOffset) {
        closestOffset = offset;
        closest = item;
      }
    }
    return closest;
  }
  _onDragOver(e) {
    if (!this._dragState) return;
    const container = e.target.closest(".todo-column-items");
    if (!container) return;
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = "move";
    } catch (err) {
    }
    this._root.querySelectorAll(".todo-column-items.drag-over").forEach((c) => {
      if (c !== container) c.classList.remove("drag-over");
    });
    container.classList.add("drag-over");
  }
  _onDragLeave(e) {
    const container = e.target.closest(".todo-column-items");
    if (container && e.target === container) container.classList.remove("drag-over");
  }
  _onDrop(e) {
    const container = e.target.closest(".todo-column-items");
    const state = this._dragState;
    if (!container || !state) return;
    e.preventDefault();
    container.classList.remove("drag-over");
    const destKey = container.dataset.listKey;
    const below = this._closestItemBelow(container, e.clientY);
    if (destKey === state.sourceKey) {
      // Same-list reorder: previous_uid is whichever item now sits right
      // above the drop point (null/undefined at the very top). See
      // _reorderItem's own comment on why this is a no-op for a Grocy
      // column specifically.
      const previousUid = below ? this._prevSiblingUid(below) : this._lastItemUid(container);
      if (previousUid !== state.item.uid) this._reorderItem(destKey, state.item.uid, previousUid);
    } else {
      this._moveItemAcrossLists(state.sourceKey, state.item, destKey);
    }
    this._dragState = null;
  }
  _prevSiblingUid(itemEl) {
    const prev = itemEl.previousElementSibling;
    return prev && prev.classList.contains("todo-item") ? prev.dataset.uid : undefined;
  }
  _lastItemUid(container) {
    const items = Array.from(container.querySelectorAll(".todo-item:not(.dragging)"));
    const last = items[items.length - 1];
    return last ? last.dataset.uid : undefined;
  }

  // -- Add / List(s) modal ---------------------------------------------------
  // v146.3+: a two-tab modal opened by the FAB - "Add Item" (the original
  // Add form) and "List(s)" (the v146.2 Settings modal's own todo.*/Grocy
  // checklist, folded in here per the household's own ask: "when you click
  // the FAB there should be a second tab called List(s) that allows you to
  // add and remove lists"). Both tabs share one overlay/box - only one
  // panel is visible at a time (`hidden`), so switching tabs never re-fetches
  // or loses whatever's already been typed in the other one.

  _openCreateModal() {
    const overlay = this._root.querySelector(".create-modal");
    const box = overlay.querySelector(".modal-box");
    box.innerHTML = `
      <div class="modal-tabs">
        <button type="button" class="modal-tab-btn active" data-tab="add">Add Item</button>
        <button type="button" class="modal-tab-btn" data-tab="lists">List(s)</button>
      </div>
      <div class="modal-tab-panel" data-tab-panel="add"></div>
      <div class="modal-tab-panel" data-tab-panel="lists" hidden></div>
    `;
    const switchTab = (name) => {
      box.querySelectorAll(".modal-tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
      box.querySelectorAll(".modal-tab-panel").forEach((p) => { p.hidden = p.dataset.tabPanel !== name; });
    };
    box.querySelectorAll(".modal-tab-btn").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
    overlay.classList.add("open");
    this._renderAddItemTab(box.querySelector('[data-tab-panel="add"]'), overlay, switchTab);
    this._renderListsTab(box.querySelector('[data-tab-panel="lists"]'), overlay);
    // Refresh the Grocy list-of-lists on every open so a list created/
    // renamed/deleted in Grocy itself since the card last polled shows up
    // immediately in the List(s) tab, rather than waiting up to 20s for
    // the next poll tick.
    this._fetchGrocyLists().then(() => this._renderListsTab(box.querySelector('[data-tab-panel="lists"]'), overlay));
  }
  _renderAddItemTab(panel, overlay, switchTab) {
    const descriptors = this._listDescriptors();
    if (!descriptors.length) {
      panel.innerHTML = `<div class="empty-state">No lists configured yet - switch to the List(s) tab to pick one or more to-do or Grocy lists first.</div><div class="modal-actions"><button type="button" class="goto-lists-btn">List(s)</button></div>`;
      panel.querySelector(".goto-lists-btn").addEventListener("click", () => switchTab("lists"));
      return;
    }
    const listOptions = descriptors
      .map((d) => `<option value="${this._escAttr(d.key)}" data-kind="${d.kind}">${this._esc(this._listName(d))}${d.kind === "grocy" ? " (Grocy)" : ""}</option>`)
      .join("");
    panel.innerHTML = `
      <label>List<select class="f-list">${listOptions}</select></label>
      <label>What do you need to do/get?<input type="text" class="f-summary" placeholder="e.g. Milk" autofocus></label>
      <label class="f-due-label">Due date (optional)<input type="date" class="f-due"></label>
      <div class="modal-actions">
        <button class="cancel-btn">Cancel</button>
        <button class="save-btn">Add</button>
      </div>
      <div class="form-error"></div>
    `;
    const listSelect = panel.querySelector(".f-list");
    if (this._dragState && this._dragState.sourceKey) listSelect.value = this._dragState.sourceKey;
    const dueLabel = panel.querySelector(".f-due-label");
    // Grocy shopping list rows have no due date - hide the field entirely
    // once a Grocy list is selected, rather than showing a control that
    // would silently be ignored on submit (see _addItem). Same for a
    // todo.* list whose own entity doesn't advertise due-date support
    // (see the TODO_FEATURE_* comment up top) - showing the field there
    // used to throw a hard error on submit instead of being ignored.
    const syncDueVisibility = () => {
      const selected = listSelect.options[listSelect.selectedIndex];
      const key = selected && selected.value;
      const isGrocy = !!(selected && selected.dataset.kind === "grocy");
      dueLabel.hidden = isGrocy || !(key && this._todoEntitySupportsDueDate(key));
    };
    syncDueVisibility();
    listSelect.addEventListener("change", syncDueVisibility);
    const summaryInput = panel.querySelector(".f-summary");
    setTimeout(() => summaryInput.focus(), 0);
    const submit = () => {
      const errEl = panel.querySelector(".form-error");
      const listKey = listSelect.value;
      const summary = summaryInput.value;
      const due = panel.querySelector(".f-due").value;
      if (!summary || !summary.trim()) {
        errEl.textContent = "Give the item a name.";
        return;
      }
      this._addItem(listKey, summary, due || null);
      overlay.classList.remove("open");
    };
    panel.querySelector(".cancel-btn").addEventListener("click", () => overlay.classList.remove("open"));
    panel.querySelector(".save-btn").addEventListener("click", submit);
    summaryInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
  }
  // List selection - the household ticks which todo.* entities and which
  // specific Grocy shopping lists to show, without ever opening "Edit
  // Card". Saving still writes back into the card's own config (entities +
  // grocy_list_ids) through setConfig + a config-changed event, same as
  // every other in-card config edit in this codebase (see
  // family-screensaver-card.js's own return-dashboard-select for the
  // established config-changed pattern this reuses).
  _renderListsTab(panel, overlay) {
    const todoEntityIds = Object.keys((this._hass && this._hass.states) || {})
      .filter((id) => id.startsWith("todo."))
      .sort((a, b) => this._todoEntityLabel(a).localeCompare(this._todoEntityLabel(b)));
    const selectedEntities = new Set(this._selectedTodoEntities());
    const todoRowsHtml = todoEntityIds.length
      ? todoEntityIds
          .map(
            (id) => `
        <label class="settings-check-row">
          <input type="checkbox" class="settings-todo-check" value="${this._escAttr(id)}" ${selectedEntities.has(id) ? "checked" : ""}>
          <span>${this._esc(this._todoEntityLabel(id))}</span>
        </label>`
          )
          .join("")
      : `<div class="empty-state">No to-do lists found on this Home Assistant instance yet.</div>`;

    const grocySelected = this._grocySelectedListIds();
    let grocySectionHtml;
    if (this._grocyConfigured === false) {
      grocySectionHtml = `<div class="empty-state">Grocy isn't set up in Family Hub yet - add it under Settings &rarr; Devices &amp; Services &rarr; Family Hub &rarr; Configure &rarr; Grocy to show its shopping lists here.</div>`;
    } else if (this._grocyConfigured === undefined) {
      grocySectionHtml = `<div class="settings-loading">Loading…</div>`;
    } else if (!(this._grocyLists || []).length) {
      grocySectionHtml = `<div class="empty-state">No Grocy shopping lists found yet.</div>`;
    } else {
      grocySectionHtml = this._grocyLists
        .map((l) => {
          const checked = grocySelected === null || grocySelected.includes(l.id);
          return `
        <label class="settings-check-row">
          <input type="checkbox" class="settings-grocy-check" value="${l.id}" ${checked ? "checked" : ""}>
          <span>${this._esc(l.name)}</span>
        </label>`;
        })
        .join("");
    }

    panel.innerHTML = `
      <div class="settings-section">
        <div class="settings-section-title">To-Do Lists</div>
        <div class="settings-check-list">${todoRowsHtml}</div>
      </div>
      <div class="settings-section">
        <div class="settings-section-title">Grocy Shopping Lists</div>
        <div class="settings-check-list">${grocySectionHtml}</div>
      </div>
      <div class="modal-actions">
        <button class="cancel-btn lists-cancel-btn">Cancel</button>
        <button class="save-btn lists-save-btn">Save</button>
      </div>
      <div class="form-error"></div>
    `;
    panel.querySelector(".lists-cancel-btn").addEventListener("click", () => overlay.classList.remove("open"));
    panel.querySelector(".lists-save-btn").addEventListener("click", () => this._saveListsTab(panel, overlay));
  }
  _todoEntityLabel(entityId) {
    const st = this._hass && this._hass.states && this._hass.states[entityId];
    return (st && st.attributes && st.attributes.friendly_name) || entityId.replace(/^todo\./, "").replace(/_/g, " ");
  }
  // Persists straight to the backend (v146.5+ - family_hub/
  // set_todo_card_config) rather than through setConfig + a config-changed
  // event - see _fetchTodoCardConfig's own comment for why that never
  // actually survived a plain page reload (config-changed is only ever
  // heard by Home Assistant's own dashboard EDITING flow, not a normal
  // view). Applied optimistically to this._backendEntities/
  // _backendGrocyListIds and re-rendered immediately, before the network
  // call even resolves, so the board updates the instant Save is clicked
  // rather than waiting on a round trip.
  async _saveListsTab(panel, overlay) {
    const entities = Array.from(panel.querySelectorAll(".settings-todo-check:checked")).map((el) => el.value);
    // Only meaningful when the Grocy section actually rendered checkboxes
    // (Grocy configured and at least one list exists) - otherwise there's
    // nothing to select from, so the saved selection stays whatever it
    // already was rather than being wiped to an empty array.
    const grocyCheckboxes = panel.querySelectorAll(".settings-grocy-check");
    const grocyListIds = grocyCheckboxes.length
      ? Array.from(grocyCheckboxes)
          .filter((el) => el.checked)
          .map((el) => parseInt(el.value, 10))
      : this._grocySelectedListIds() || [];
    this._backendEntities = entities;
    this._backendGrocyListIds = grocyListIds;
    overlay.classList.remove("open");
    this._render();
    try {
      await this._hass.connection.sendMessagePromise({
        type: "family_hub/set_todo_card_config",
        entities,
        grocy_list_ids: grocyListIds,
      });
    } catch (e) {
    }
    this._fetchAllLists();
  }

  // -- Put Away modal (v146.2+) ---------------------------------------------
  // Grocy's own "scan it home" flow: add a shopping-list item into real
  // Grocy stock (a location, an optional expiration date and purchase
  // price) and take it off the shopping list in the same step - see
  // __init__.py's _ws_put_away_grocy_shopping_list_item docstring for the
  // two Grocy calls this makes. Only ever offered on Grocy-backed columns
  // (see _itemHtml). A row Grocy already linked to a product (item.productId
  // set) skips straight to the location/date/price step; a freetext row
  // (no link) runs family_hub/match_grocy_product first and asks the
  // household to confirm - or search for a different product - before
  // that step, rather than silently guessing which real product it means.

  async _openPutAwayModal(key, uid) {
    const descriptor = this._descriptorByKey(key);
    const item = this._itemsFor(key).find((it) => it.uid === uid);
    if (!descriptor || descriptor.kind !== "grocy" || !item) return;
    const overlay = this._root.querySelector(".putaway-modal");
    const box = overlay.querySelector(".modal-box");

    // Resolved product for this put-away - starts as the row's own
    // product_id when Grocy already linked one, else null until a fuzzy
    // match/search result is picked. `wasLinked` remembers which case
    // this was, since that's what decides unlink_by_row_id on confirm.
    let selectedProductId = item.productId;
    let selectedProductName = item.productId != null ? item.rawName : null;
    const wasLinked = item.productId != null;

    const renderShell = () => {
      box.innerHTML = `
        <h3>Put away</h3>
        <div class="putaway-item-name">${this._esc(item.rawName || item.summary || "")}</div>
        <div class="putaway-product-section"></div>
        <div class="putaway-fields" hidden>
          <label>Location<select class="pa-location"><option value="">Loading…</option></select></label>
          <label>Expires<input type="date" class="pa-date"></label>
          <label>Price<input type="number" class="pa-price" min="0" step="0.01" placeholder="Optional"></label>
        </div>
        <div class="modal-actions">
          <button class="cancel-btn">Cancel</button>
          <button class="save-btn putaway-confirm-btn">Put Away</button>
        </div>
        <div class="form-error"></div>
      `;
      box.querySelector(".cancel-btn").addEventListener("click", () => overlay.classList.remove("open"));
      box.querySelector(".putaway-confirm-btn").addEventListener("click", confirm);
    };

    const fieldsEl = () => box.querySelector(".putaway-fields");
    const productSectionEl = () => box.querySelector(".putaway-product-section");

    const showFields = async () => {
      fieldsEl().hidden = false;
      const locationSelect = box.querySelector(".pa-location");
      const dateInput = box.querySelector(".pa-date");
      if (item.defaultBestBeforeDays != null && item.defaultBestBeforeDays > 0 && !dateInput.value) {
        const d = new Date();
        d.setDate(d.getDate() + item.defaultBestBeforeDays);
        dateInput.value = d.toISOString().slice(0, 10);
      }
      const locations = await this._fetchGrocyLocationsCached();
      const defaultId = item.defaultLocationId != null && locations.some((loc) => loc.id === item.defaultLocationId) ? item.defaultLocationId : null;
      locationSelect.innerHTML = locations.length
        ? locations.map((loc) => `<option value="${loc.id}"${defaultId === loc.id ? " selected" : ""}>${this._esc(loc.name)}</option>`).join("")
        : `<option value="">No locations yet</option>`;
    };

    const renderProductSection = () => {
      const sectionEl = productSectionEl();
      if (selectedProductId != null) {
        sectionEl.innerHTML = `
          <div class="putaway-product-label">Product: <strong>${this._esc(selectedProductName || "")}</strong>
            ${wasLinked ? "" : `<button type="button" class="putaway-change-btn">Change</button>`}
          </div>
        `;
        const changeBtn = sectionEl.querySelector(".putaway-change-btn");
        if (changeBtn) changeBtn.addEventListener("click", () => { selectedProductId = null; selectedProductName = null; fieldsEl().hidden = true; renderProductSection(); });
        showFields();
        return;
      }
      fieldsEl().hidden = true;
      sectionEl.innerHTML = `
        <div class="putaway-search-row">
          <input type="text" class="pa-search-text" value="${this._escAttr(item.rawName || "")}" placeholder="Search Grocy products">
          <button type="button" class="pa-search-btn">Search</button>
        </div>
        <div class="putaway-match-list"><div class="putaway-searching">Searching…</div></div>
      `;
      const searchInput = sectionEl.querySelector(".pa-search-text");
      const searchBtn = sectionEl.querySelector(".pa-search-btn");
      const runSearch = async () => {
        const matchListEl = sectionEl.querySelector(".putaway-match-list");
        matchListEl.innerHTML = `<div class="putaway-searching">Searching…</div>`;
        const text = searchInput.value.trim();
        if (!text) {
          matchListEl.innerHTML = `<div class="empty-state">Type a product name to search.</div>`;
          return;
        }
        try {
          const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/match_grocy_product", text });
          if (result && result.configured === false) {
            matchListEl.innerHTML = `<div class="empty-state">Grocy isn't connected yet.</div>`;
            return;
          }
          const matches = (result && Array.isArray(result.matches)) ? result.matches : [];
          if (!matches.length) {
            matchListEl.innerHTML = `<div class="empty-state">No close matches found - try a different search.</div>`;
            return;
          }
          matchListEl.innerHTML = matches
            .map(
              (m) => `<button type="button" class="putaway-match-option" data-product-id="${m.product_id}" data-name="${this._escAttr(m.name)}">${this._esc(m.name)} <span class="putaway-match-score">${Math.round(m.score * 100)}%</span></button>`
            )
            .join("");
          matchListEl.querySelectorAll(".putaway-match-option").forEach((btn) => {
            btn.addEventListener("click", () => {
              selectedProductId = parseInt(btn.dataset.productId, 10);
              selectedProductName = btn.dataset.name;
              renderProductSection();
            });
          });
        } catch (e) {
          matchListEl.innerHTML = `<div class="empty-state">Couldn't reach Grocy.</div>`;
        }
      };
      searchBtn.addEventListener("click", runSearch);
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") runSearch();
      });
      runSearch();
    };

    const confirm = async () => {
      const errEl = box.querySelector(".form-error");
      if (selectedProductId == null) {
        errEl.textContent = "Pick a product first.";
        return;
      }
      const locationSelect = box.querySelector(".pa-location");
      const locationId = parseInt(locationSelect.value, 10);
      if (!locationId) {
        errEl.textContent = "Pick a location before putting this away.";
        return;
      }
      const dateInput = box.querySelector(".pa-date");
      const priceInput = box.querySelector(".pa-price");
      const priceRaw = priceInput.value.trim();
      const price = priceRaw ? parseFloat(priceRaw) : undefined;
      errEl.textContent = "";
      const confirmBtn = box.querySelector(".putaway-confirm-btn");
      confirmBtn.disabled = true;
      try {
        const result = await this._hass.connection.sendMessagePromise({
          type: "family_hub/put_away_grocy_shopping_list_item",
          item_id: parseInt(item.uid, 10),
          product_id: selectedProductId,
          amount: item.amount || 1,
          location_id: locationId,
          best_before_date: dateInput.value || undefined,
          price: price != null && !Number.isNaN(price) ? price : undefined,
          list_id: descriptor.listId,
          // True whenever the product link came from a fuzzy match/search
          // here rather than Grocy's own row-to-product link - see
          // __init__.py's own docstring on why that changes which Grocy
          // call removes the row afterward.
          unlink_by_row_id: !wasLinked,
        });
        if (result && result.configured === false) {
          errEl.textContent = "Grocy isn't connected yet.";
          confirmBtn.disabled = false;
          return;
        }
        if (!result || !result.success) {
          errEl.textContent = `Couldn't put that away: ${(result && result.error) || "unknown error"}`;
          confirmBtn.disabled = false;
          return;
        }
        overlay.classList.remove("open");
        this._fetchAllLists();
      } catch (e) {
        errEl.textContent = "Couldn't reach Grocy.";
        confirmBtn.disabled = false;
      }
    };

    renderShell();
    overlay.classList.add("open");
    renderProductSection();
  }
  // Cached for the card's session, same convention as
  // family-week-calendar-card.js's own _fetchGrocyLocations - the location
  // list rarely changes, and every Put Away open would otherwise re-fetch
  // it from Grocy.
  async _fetchGrocyLocationsCached() {
    if (this._grocyLocationsCache) return this._grocyLocationsCache;
    if (!this._hass) return [];
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_grocy_locations" });
      const locations = Array.isArray(result.locations) ? result.locations : [];
      this._grocyLocationsCache = locations;
      return locations;
    } catch (e) {
      return [];
    }
  }

  // -- Item detail modal (v146.3+) ------------------------------------------
  // "Todo lists natively have descriptions and due dates when you click an
  // item it should open a Trello style modal to see the details" - clicking
  // an item's text/summary (see _onBoardClick) opens this instead of the
  // Add modal: a title, description/note, and (todo.* only) a due date, all
  // editable in place with one Save, plus quick Delete and (Grocy only)
  // Put Away shortcuts - the same two mutations that already exist
  // elsewhere on the board, just reachable from the detail view too so a
  // household doesn't have to close it first.

  _openItemDetailModal(key, uid) {
    const descriptor = this._descriptorByKey(key);
    const item = this._itemsFor(key).find((it) => it.uid === uid);
    if (!descriptor || !item) return;
    const overlay = this._root.querySelector(".item-detail-modal");
    const box = overlay.querySelector(".modal-box");
    const isGrocy = descriptor.kind === "grocy";
    const completed = item.status === "completed";
    const originalTitle = isGrocy ? (item.rawName || "") : (item.summary || "");
    // A Grocy row already linked to a product shows its title read-only -
    // that name always comes from the linked product record in Grocy
    // itself, not this row's own `name` field (see __init__.py's own
    // docstring on _ws_update_grocy_shopping_list_item) - editing it here
    // would silently do nothing once Grocy re-resolves the display name.
    const titleEditable = !isGrocy || item.productId == null;
    // A todo.* item's description/due-date fields are only shown when the
    // list's own entity actually supports them (see the TODO_FEATURE_*
    // comment up top) - showing a field that would just error on Save is
    // worse than not showing it at all.
    const supportsDescription = isGrocy || this._todoEntitySupportsDescription(key);
    const supportsDueDate = isGrocy || this._todoEntitySupportsDueDate(key);

    box.innerHTML = `
      <div class="detail-header">
        <label class="detail-check-wrap">
          <input type="checkbox" class="detail-check" ${completed ? "checked" : ""}>
          <span class="detail-check-label">Done</span>
        </label>
        <div class="detail-title-field">
          <span class="detail-field-label">Title</span>
          ${titleEditable
            ? `<input type="text" class="detail-title" value="${this._escAttr(originalTitle)}">`
            : `<div class="detail-title detail-title-readonly">${this._esc(originalTitle)}</div>`}
        </div>
      </div>
      ${isGrocy
        ? `<label>Note<textarea class="detail-note" rows="4" placeholder="Add a note…">${this._esc(item.note || "")}</textarea></label>
           <label>Amount<input type="number" class="detail-amount" min="0" step="0.01" value="${item.amount || 1}"></label>`
        : `<label ${supportsDescription ? "" : "hidden"}>Description<textarea class="detail-description" rows="4" placeholder="Add a description…">${this._esc(item.description || "")}</textarea></label>
           <label ${supportsDueDate ? "" : "hidden"}>Due date<input type="date" class="detail-due" value="${item.due ? this._escAttr(item.due) : ""}"></label>
           ${(!supportsDescription && !supportsDueDate) ? `<div class="detail-unsupported-hint">This list doesn't support descriptions or due dates.</div>` : ""}`}
      <div class="modal-actions detail-actions">
        <button type="button" class="detail-delete-btn">Delete</button>
        ${isGrocy ? `<button type="button" class="detail-putaway-btn">Put away</button>` : ""}
        <span class="detail-actions-spacer"></span>
        <button type="button" class="cancel-btn">Close</button>
        <button type="button" class="save-btn detail-save-btn">Save</button>
      </div>
      <div class="form-error"></div>
    `;
    box.querySelector(".cancel-btn").addEventListener("click", () => overlay.classList.remove("open"));
    box.querySelector(".detail-check").addEventListener("change", (e) => this._toggleItem(key, uid, e.target.checked));
    box.querySelector(".detail-delete-btn").addEventListener("click", () => {
      this._deleteItem(key, uid);
      overlay.classList.remove("open");
    });
    const putawayBtn = box.querySelector(".detail-putaway-btn");
    if (putawayBtn) {
      putawayBtn.addEventListener("click", () => {
        overlay.classList.remove("open");
        this._openPutAwayModal(key, uid);
      });
    }
    box.querySelector(".detail-save-btn").addEventListener("click", () => {
      const titleInput = box.querySelector(".detail-title:not(.detail-title-readonly)");
      const newTitle = titleInput ? titleInput.value : originalTitle;
      if (isGrocy) {
        this._updateGrocyItemDetails(uid, {
          name: titleEditable ? newTitle : undefined,
          note: box.querySelector(".detail-note").value,
          amount: parseFloat(box.querySelector(".detail-amount").value) || undefined,
        });
      } else {
        this._updateTodoItemDetails(key, uid, {
          title: newTitle,
          originalTitle,
          description: supportsDescription ? box.querySelector(".detail-description").value : undefined,
          dueDate: supportsDueDate ? (box.querySelector(".detail-due").value || null) : undefined,
        });
      }
      overlay.classList.remove("open");
    });
    overlay.classList.add("open");
  }

  _css() {
    return `
      :host { display: block; font-family: 'Varela Round', sans-serif; }
      ha-card { background: var(--fc-bg); color: var(--fc-text); padding: 14px; }
      .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
      .title { font-size: 18px; font-weight: 800; }
      .board { display: block; }
      .empty-state { font-size: 12px; color: var(--fc-text-secondary); padding: 8px 2px; }
      .todo-board-row { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 6px; }
      .todo-column { flex: 1 1 240px; min-width: 220px; max-width: 340px; display: flex; flex-direction: column; background: var(--fc-surface2); border-radius: 12px; padding: 8px; box-shadow: var(--fc-shadow, 0 2px 5px rgba(0,0,0,0.06)); }
      .todo-column-header { display: flex; align-items: center; gap: 6px; padding: 4px 4px 8px; border-top: 4px solid; border-radius: 3px 3px 0 0; margin: -8px -8px 6px; padding-top: 8px; padding-left: 8px; padding-right: 8px; }
      .todo-column-title { font-weight: 800; font-size: 13px; flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
      .todo-column-source-tag { flex: 0 0 auto; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; background: var(--fc-accent2); color: var(--fc-accent-text); border-radius: 6px; padding: 1px 6px; }
      .todo-column-count { flex: 0 0 auto; background: var(--fc-surface-alt); color: var(--fc-accent2); border-radius: 8px; padding: 1px 7px; font-size: 11px; font-weight: 700; }
      .todo-column-items { display: flex; flex-direction: column; gap: 6px; min-height: 40px; border-radius: 8px; transition: background-color 0.1s ease; }
      .todo-column-items.drag-over { background: var(--fc-surface-alt); outline: 2px dashed var(--fc-accent); outline-offset: 2px; }
      .todo-item { display: flex; align-items: center; gap: 8px; background: var(--fc-card); border-radius: 10px; padding: 8px 10px; box-shadow: var(--fc-shadow, 0 2px 5px rgba(0,0,0,0.08)); cursor: grab; }
      .todo-item.dragging { opacity: 0.4; }
      .todo-item.completed { opacity: 0.55; cursor: default; }
      .todo-item, .cancel-btn {
        backdrop-filter: blur(var(--fc-glass-blur, 0px));
        -webkit-backdrop-filter: blur(var(--fc-glass-blur, 0px));
      }
      .todo-check { flex: 0 0 auto; width: 18px; height: 18px; cursor: pointer; accent-color: var(--fc-accent); }
      .todo-item-text { flex: 1 1 auto; min-width: 0; }
      .todo-item-summary { font-size: 13px; font-weight: 700; overflow-wrap: anywhere; }
      .todo-item.completed .todo-item-summary { text-decoration: line-through; }
      .todo-item-due { font-size: 10px; color: var(--fc-text-secondary); margin-top: 1px; }
      .todo-delete-btn { flex: 0 0 auto; border: none; background: transparent; color: var(--fc-text-secondary); font-size: 12px; cursor: pointer; padding: 2px 4px; border-radius: 6px; }
      .todo-delete-btn:hover { color: var(--fc-accent3); }
      .todo-putaway-btn { flex: 0 0 auto; border: none; background: transparent; color: var(--fc-text-secondary); font-size: 14px; cursor: pointer; padding: 2px 4px; border-radius: 6px; }
      .todo-putaway-btn:hover { color: var(--fc-accent); }
      .completed-row { border-top: 1px solid var(--fc-border); margin-top: 8px; padding-top: 4px; }
      .completed-header { display: flex; align-items: center; gap: 6px; padding: 6px 2px; font-size: 11px; font-weight: 700; cursor: pointer; color: var(--fc-text-secondary); }
      .completed-title { flex: 1; }
      .completed-badge { background: var(--fc-surface-alt); color: var(--fc-accent2); border-radius: 8px; padding: 1px 6px; font-size: 10px; }
      .completed-body { display: flex; flex-direction: column; gap: 6px; margin-top: 2px; }
      .add-todo-fab { position: fixed; right: 18px; bottom: 18px; z-index: 900; width: 56px; height: 56px; border-radius: 50%; border: none; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 28px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(58,53,44,0.35); transition: transform 0.15s ease; }
      .add-todo-fab:active { transform: scale(0.94); }
      .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; align-items: center; justify-content: center; }
      .modal-tabs { display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 1px solid var(--fc-border); }
      .modal-tab-btn { border: none; background: none; color: var(--fc-text-secondary); font-weight: 700; font-size: 13px; padding: 8px 4px 10px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
      .modal-tab-btn.active { color: var(--fc-accent); border-bottom-color: var(--fc-accent); }
      .modal-overlay.open { display: flex; }
      .modal-box { background: var(--fc-bg); color: var(--fc-text); border-radius: 14px; padding: 18px; width: min(90vw, 420px); max-height: 85vh; overflow-y: auto; }
      .modal-box label { display: block; margin: 8px 0; font-size: 13px; font-weight: 700; }
      .modal-box label[hidden] { display: none; }
      .modal-box input, .modal-box select, .modal-box textarea { width: 100%; box-sizing: border-box; margin-top: 4px; padding: 8px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 13px; font-family: inherit; }
      .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
      .modal-actions button { border: none; border-radius: 10px; padding: 8px 16px; font-weight: 700; cursor: pointer; }
      .save-btn { background: var(--fc-accent); color: var(--fc-accent-text); }
      .cancel-btn { background: var(--fc-surface-alt); color: var(--fc-text); }
      .form-error { color: var(--fc-accent3); font-size: 12px; margin-top: 6px; }
      .settings-section { margin-top: 10px; }
      .settings-section-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; color: var(--fc-text-secondary); margin-bottom: 6px; }
      .settings-check-list { display: flex; flex-direction: column; gap: 2px; max-height: 180px; overflow-y: auto; border: 1px solid var(--fc-border); border-radius: 10px; padding: 6px; }
      .settings-check-row { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; padding: 4px 6px; margin: 0; border-radius: 6px; }
      .settings-check-row:hover { background: var(--fc-surface-alt); }
      .settings-check-row input { width: auto; margin: 0; accent-color: var(--fc-accent); }
      .settings-loading { font-size: 12px; color: var(--fc-text-secondary); padding: 6px 2px; font-style: italic; }
      .putaway-item-name { font-size: 13px; font-weight: 700; margin: 4px 0 10px; }
      .putaway-product-section { margin-bottom: 4px; }
      .putaway-product-label { font-size: 13px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .putaway-change-btn { border: none; background: var(--fc-surface-alt); color: var(--fc-accent2); font-size: 11px; font-weight: 700; border-radius: 8px; padding: 3px 8px; cursor: pointer; }
      .putaway-search-row { display: flex; gap: 6px; }
      .putaway-search-row input { margin-top: 0; }
      .putaway-search-row .pa-search-btn { flex: 0 0 auto; border: none; border-radius: 8px; padding: 0 12px; font-weight: 700; cursor: pointer; background: var(--fc-accent); color: var(--fc-accent-text); }
      .putaway-match-list { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; max-height: 160px; overflow-y: auto; }
      .putaway-match-option { display: flex; align-items: center; justify-content: space-between; gap: 8px; text-align: left; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); border-radius: 8px; padding: 6px 10px; font-size: 13px; cursor: pointer; }
      .putaway-match-option:hover { background: var(--fc-surface-alt); }
      .putaway-match-score { flex: 0 0 auto; font-size: 10px; color: var(--fc-text-secondary); }
      .putaway-searching { font-size: 12px; color: var(--fc-text-secondary); padding: 4px 2px; font-style: italic; }
      .detail-header { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 6px; }
      .detail-check-wrap { display: flex; flex-direction: column; align-items: center; gap: 2px; flex: 0 0 auto; cursor: pointer; padding-top: 4px; }
      .detail-check { width: 20px; height: 20px; cursor: pointer; accent-color: var(--fc-accent); margin: 0; }
      .detail-check-label { font-size: 10px; font-weight: 700; color: var(--fc-text-secondary); }
      .detail-title-field { flex: 1 1 auto; min-width: 0; }
      .detail-field-label { display: block; font-size: 11px; font-weight: 700; color: var(--fc-text-secondary); margin-bottom: 2px; }
      .detail-title { width: 100%; box-sizing: border-box; font-size: 16px; font-weight: 800; margin: 0 !important; padding: 4px 6px; }
      .detail-title-readonly { border: 1px solid transparent; padding: 4px 6px; color: var(--fc-text); overflow-wrap: anywhere; }
      .detail-unsupported-hint { font-size: 12px; color: var(--fc-text-secondary); margin: 8px 0; }
      .detail-actions { align-items: center; }
      .detail-actions-spacer { flex: 1 1 auto; }
      .detail-delete-btn, .detail-putaway-btn { border: none; border-radius: 10px; padding: 8px 14px; font-weight: 700; cursor: pointer; background: var(--fc-surface-alt); color: var(--fc-accent3); }
      .detail-putaway-btn { color: var(--fc-accent2); }
      @media (max-width: 700px) {
        .todo-board-row { gap: 8px; }
        .todo-column { flex: 0 0 82vw; min-width: 0; }
      }
    `;
  }
}

// See FamilyHubTodoCard.getConfigElement's own comment for why this exists
// at all instead of just returning getConfigForm() and letting Home
// Assistant auto-build the editor. Reuses that exact same schema/labels -
// this only changes what happens to the OTHER config keys (grocy_list_ids)
// when the form's value changes.
class FamilyHubTodoCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }
  _formData() {
    return {
      title: this._config.title,
      entities: this._config.entities,
      include_grocy_shopping_lists: this._config.include_grocy_shopping_lists,
    };
  }
  _render() {
    if (this._built) {
      this._form.data = this._formData();
      return;
    }
    this._built = true;
    this.innerHTML = "";
    const { schema, computeLabel } = FamilyHubTodoCard.getConfigForm();
    const form = document.createElement("ha-form");
    form.schema = schema;
    form.computeLabel = computeLabel;
    form.data = this._formData();
    if (this._hass) form.hass = this._hass;
    form.addEventListener("value-changed", (e) => {
      e.stopPropagation();
      // ha-form's own emitted value only ever carries the schema's three
      // fields - merge it into a COPY of the full config (preserving
      // grocy_list_ids and anything else this card owns) rather than
      // replacing the config outright.
      const merged = Object.assign({}, this._config, e.detail.value);
      this._config = merged;
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: merged }, bubbles: true, composed: true }));
    });
    this._form = form;
    this.appendChild(form);
  }
}

customElements.define("family-hub-todo-card", FamilyHubTodoCard);
customElements.define("family-hub-todo-card-editor", FamilyHubTodoCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "family-hub-todo-card")) {
  window.customCards.push({
    type: "family-hub-todo-card",
    name: "Family Hub To-Do Lists",
    description: "A Family Hub-styled board over your Home Assistant to-do lists and (optionally) Grocy shopping lists - multiple lists side by side, drag and drop between them, and a FAB to quickly add an item.",
  });
}
