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
// v1.109.9: "We should make the todo card fully customizable, add rows
// columns, etc so you can have your lists shown how you want a line of
// lists, 2 stacks, 3 stacks etc." The board's layout is now the
// household's choice: the List(s) tab gained a Layout section (1-4 stacked
// rows, TODO_CARD_MAX_BOARD_ROWS), persisted as a `rows` field in the very
// same todo_card_config backend store the list selection uses, for the
// same reload-survival reason. See _boardRows/_boardRowGroups/_boardHtml.
// Default 1 = the exact single-row board every earlier version had, so no
// existing card changes on upgrade. Drag-and-drop needed NO changes to
// work across rows - see _boardHtml's own comment for why.
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

// Must match const.py's own TODO_CARD_MAX_BOARD_ROWS - the backend clamps
// the stored value to this range too, so the two only ever disagree if one
// side is edited without the other. See that constant's own comment for why
// the ceiling is 4 rather than unbounded.
const TODO_CARD_MAX_BOARD_ROWS = 4;

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

// Wish Lists (v1.122.0+) - the household's own ask: "I want to use the
// native list functionality to be able to do wish lists link name image
// description that kind of thing but all built on top of the native list
// functionality. I think that we can embed most of this data into the
// description of a list." A wish-list item is a completely ordinary
// todo.* item (native `summary`/`status`/`due`) whose native `description`
// field carries TWO things back to back: first the household's own plain,
// human-readable note text (exactly what a non-wish-list item's
// description already is, and exactly what HA's own built-in Todo UI,
// voice assistants, and phone widgets keep showing/reading unchanged),
// then - only when this item actually has link/image/claim data at all -
// this marker line followed by a single-line JSON blob carrying it. This
// was the household's own explicit choice ("readable text + a small JSON
// tail") over either a whole-field JSON envelope (what family-week-
// calendar-card.js's meal-plan feature does to `description`, which would
// make the note itself unreadable outside Family Hub) or a second parallel
// storage system keyed off the item's uid (which the household explicitly
// wanted to avoid building - "built on top of the native list
// functionality"). See _parseWishlistDescription/_buildWishlistDescription
// below for the actual encode/decode, and TODO_WISHLIST_CONFIG_STORAGE_
// KEY_PREFIX in const.py for the separate (backend) per-entity flag this
// rendering is gated on.
const WISHLIST_DATA_MARKER = "\n[fh:wishlist-data]\n";

// Decodes one todo.* item's native `description` field into
// {note, link, image, claimedBy, claimedByName} - see WISHLIST_DATA_MARKER
// above. Never throws: a description with no marker at all (every item on
// a list before it became a wish list, or a plain note someone typed by
// hand) is simply treated as 100% note with no link/image/claim, and a
// marker whose tail isn't valid JSON (hand-edited, corrupted, or written
// by something else entirely) falls back the exact same way rather than
// breaking the item's render.
function _parseWishlistDescription(raw) {
  const text = typeof raw === "string" ? raw : "";
  const idx = text.indexOf(WISHLIST_DATA_MARKER);
  if (idx === -1) return { note: text, link: "", image: "", claimedBy: null, claimedByName: "" };
  const note = text.slice(0, idx);
  const tail = text.slice(idx + WISHLIST_DATA_MARKER.length);
  let data = null;
  try {
    data = JSON.parse(tail);
  } catch (e) {
    data = null;
  }
  if (!data || typeof data !== "object") return { note, link: "", image: "", claimedBy: null, claimedByName: "", rewardItemId: null, rewardCostStars: null };
  return {
    note,
    link: typeof data.link === "string" ? data.link : "",
    image: typeof data.image === "string" ? data.image : "",
    claimedBy: typeof data.claimedBy === "string" && data.claimedBy ? data.claimedBy : null,
    claimedByName: typeof data.claimedByName === "string" ? data.claimedByName : "",
    // v1.132.6+: "tie a wish list item to a reward" - see
    // _wishlistItemHtml/_openTieRewardModal/_claimWishlistReward's own
    // comments for the full picture. rewardItemId is the linked
    // family_hub/rewards catalog item's id (always created with
    // redeem_mode "one_time" - see _openTieRewardModal); rewardCostStars
    // is a display-only snapshot of its cost_stars taken at link time, so
    // the star badge renders instantly without waiting on a rewards fetch
    // (the live catalog lookup, via _rewardsCatalogById, is still what's
    // trusted for "does this reward still exist" self-healing - see
    // _wishlistItemHtml).
    rewardItemId: typeof data.rewardItemId === "string" && data.rewardItemId ? data.rewardItemId : null,
    rewardCostStars: Number.isFinite(data.rewardCostStars) ? data.rewardCostStars : null,
  };
}
// Inverse of _parseWishlistDescription - rebuilds a single description
// string from a plain note plus {link, image, claimedBy, claimedByName,
// rewardItemId, rewardCostStars}. The JSON tail is only appended at all
// when there's actually something to carry - a note with none of these
// round-trips as plain text, byte-identical to what a non-wish-list item
// would store, so flagging a list as a wish list never rewrites items
// that have no wish-list data yet.
function _buildWishlistDescription(note, { link, image, claimedBy, claimedByName, rewardItemId, rewardCostStars } = {}) {
  const cleanNote = typeof note === "string" ? note : "";
  const data = {};
  if (link) data.link = link;
  if (image) data.image = image;
  if (claimedBy) {
    data.claimedBy = claimedBy;
    if (claimedByName) data.claimedByName = claimedByName;
  }
  if (rewardItemId) {
    data.rewardItemId = rewardItemId;
    if (Number.isFinite(rewardCostStars)) data.rewardCostStars = rewardCostStars;
  }
  if (!Object.keys(data).length) return cleanNote;
  return cleanNote + WISHLIST_DATA_MARKER + JSON.stringify(data);
}
// Exposed on window purely so this encoding is unit-testable on its own
// (see test_todo_wishlist.js) without needing a full card instance - top-
// level function declarations in a plain <script>-loaded Lovelace
// resource like this one already become window properties in a real
// browser; this just makes that explicit for jsdom, whose window.eval
// doesn't do that hoisting on its own.
if (typeof window !== "undefined") {
  window._parseWishlistDescription = _parseWishlistDescription;
  window._buildWishlistDescription = _buildWishlistDescription;
}

// Shared, dashboard-wide FAB coordinator - "when a user has more than one
// card on the same screen, the FAB buttons overlap, what is the solution?
// Can we detect and combine them? If they have the same tabs can we make
// them not duplicate?" Every Family Hub card with a floating "+" button
// (Calendar's Add Event, Chores, Rewards, Goals, To-Do) independently
// fixed-positions it at the same bottom-right spot, so two or more of
// these cards on one dashboard view (Chores+Rewards+Goals together is
// explicitly supported - see goalsShowInChores/goalsShowInRewards) stack
// their FABs directly on top of each other.
//
// Same shared-singleton shape as window.__familyHubScreenSaver just above
// (copy-pasted identically into every FAB-bearing card file, since these
// are independently-loaded Lovelace resources rather than ES modules that
// could import one shared file) - only the FIRST card whose script
// actually runs this block sets it up; every other card's identical copy
// just sees the flag already set and no-ops. Cards register on connect
// and unregister on disconnect, exactly mirroring registerClient/
// unregisterClient/_registerScreenSaver below, so a dashboard-edit that
// adds/removes a card (or switching HA tabs, which disconnects/reconnects
// every card on the old one) never leaves a stale slot reserved for a
// card that's gone, or fails to reserve one for a card that's arrived.
//
// DESIGN CHOICE - stack, don't merge. A single mega-FAB trying to stand in
// for "add a chore OR an event OR a reward" would hide which action does
// what behind an extra tap, for buttons that already open very different
// modals. Instead, each FAB stays itself but the coordinator assigns it a
// distinct vertical slot (via a --fh-fab-offset CSS custom property set on
// the card's own HOST element, which cascades into its shadow DOM the same
// way any inherited custom property does - no direct DOM/element handle
// needed, so this survives the card's own _render() rebuilding its shadow
// DOM on every data refresh without having to be re-applied each time),
// stacked in a fixed, deterministic order (FAB_KIND_ORDER below) so the
// same household always sees Calendar/Chores/Rewards/Goals/To-Do FABs in
// the same relative stack position regardless of which card's script
// happened to load or register first.
//
// DESIGN CHOICE - Goals tab de-duplication. Goals can appear on-screen
// from up to three sources at once: the standalone Goals card's own "+"
// FAB, AND a "Goal" tab on the Chores FAB (when goalsShowInChores is on),
// AND a "Goal" tab on the Rewards FAB (when goalsShowInRewards is on) -
// the same underlying add-a-goal action reachable three different ways.
// Rather than teaching the Chores/Rewards creation modals to strip their
// own Goal tab (which would mean each of those two files reaching across
// to know about the OTHER two, and about the standalone Goals card too -
// a combinatorial mess for marginal benefit, since a Goal tab embedded in
// a board the household is already looking at is not really "duplicate
// UI" so much as "the same action, conveniently placed"), only the
// LOWEST-RISK, clearest case is handled: when the coordinator sees ANY
// other registered card is already offering a Goal tab, the standalone
// Goals card suppresses its own add-goal-fab entirely (nothing left to
// add there that isn't one tap away already) - see registerClient's
// `meta.providesGoalTab` and the onLayout callback's `otherProvidesGoalTab`
// below, and family-hub-goals-card.js's own _applyFabCoordinatorState.
// Chores' and Rewards' own Goal tabs are left alone in both directions -
// a household running Chores+Rewards with both goals toggles on still
// sees a Goal tab on each, which is judged acceptable (accomplishing the
// same underlying thing twice from two boards you're already looking at
// is harmless, unlike a whole redundant floating button).
if (!window.__familyHubFabCoordinator) {
  window.__familyHubFabCoordinator = (function () {
    // Deterministic stacking order - unrecognized/future kinds sort last,
    // after everything named here, rather than crashing or colliding.
    const FAB_KIND_ORDER = ["calendar", "chores", "rewards", "goals", "todo"];
    // 56px button + 10px breathing room between stacked FABs.
    const SLOT_HEIGHT_PX = 66;
    const entries = new Map(); // client -> { kind, seq, meta, onUpdate }
    let seq = 0;

    function orderIndex(kind) {
      const i = FAB_KIND_ORDER.indexOf(kind);
      return i === -1 ? FAB_KIND_ORDER.length : i;
    }
    function recompute() {
      const list = Array.from(entries.entries()).sort((a, b) => {
        const oa = orderIndex(a[1].kind);
        const ob = orderIndex(b[1].kind);
        if (oa !== ob) return oa - ob;
        return a[1].seq - b[1].seq;
      });
      // v1.110.7+: entries with takesSlot:false (a fab_position: "card"
      // client - see registerClient's own doc below) are skipped when
      // handing out stacking slots/offsets, but still walked here so they
      // still see otherProvidesGoalTab and still get an onUpdate call.
      const slotCount = list.filter(([, entry]) => entry.takesSlot).length;
      let slotIndex = 0;
      list.forEach(([client, entry]) => {
        const otherProvidesGoalTab = list.some(
          ([otherClient, otherEntry]) => otherClient !== client && otherEntry.meta && otherEntry.meta.providesGoalTab
        );
        const index = entry.takesSlot ? slotIndex++ : null;
        if (typeof entry.onUpdate === "function") {
          entry.onUpdate({ offsetPx: (index || 0) * SLOT_HEIGHT_PX, slotIndex: index, count: slotCount, otherProvidesGoalTab });
        }
      });
    }
    return {
      // `kind` is one of FAB_KIND_ORDER's entries (or anything else, which
      // just sorts last). `meta` is a plain object of extra facts other
      // cards' layout decisions might care about - today only
      // `providesGoalTab` (see this block's own docstring above). `onUpdate`
      // is called once immediately (so a lone card on an otherwise-empty
      // dashboard still gets offsetPx: 0) and again on every subsequent
      // register/unregister/updateClientMeta from ANY card, since adding a
      // second FAB changes where the first one's slot is too.
      //
      // v1.110.7+: `opts.takesSlot` (default true) - pass `{ takesSlot:
      // false }` for a card whose FAB has opted out of the shared
      // viewport-corner stack (fab_position: "card" - anchored to its own
      // card's box instead, see each card's own _registerFabCoordinator).
      // It's still a full member of the coordinator (still contributes/
      // reads `meta.providesGoalTab`, so goal-tab de-duplication keeps
      // working across a mixed dashboard/card-positioned set of FABs), it
      // just never occupies - or shifts - a stacking slot, since a
      // shared viewport-corner offset is meaningless once a FAB is
      // positioned relative to its own card instead.
      registerClient(client, kind, meta, onUpdate, opts) {
        const takesSlot = !(opts && opts.takesSlot === false);
        entries.set(client, { kind, seq: seq++, meta: meta || {}, onUpdate, takesSlot });
        recompute();
      },
      // Call whenever a fact in `meta` changes at runtime (e.g. the
      // household flips goalsShowInChores in Settings without reloading
      // the dashboard) - see chores/rewards cards' _fetchSettings.
      updateClientMeta(client, meta) {
        const entry = entries.get(client);
        if (!entry) return;
        entry.meta = Object.assign({}, entry.meta, meta || {});
        recompute();
      },
      // Call from disconnectedCallback. Frees this card's slot so every
      // remaining card's FAB shifts back down to close the gap, and (for
      // Goals) re-checks whether it's still safe to suppress its own FAB.
      unregisterClient(client) {
        if (entries.delete(client)) recompute();
      },
    };
  })();
}

// Shared, dashboard-wide kiosk-PIN-login session (v1.132.4+, extended to
// this card from Chores/Rewards) - household ask, verbatim: "need a way to
// switch to other accounts for the wish lists, so people could mark things
// off on a kiosk." Byte-identical copy of the singleton family-hub-chores-
// card.js/family-hub-rewards-card.js already define (see either one's own
// docstring right above this same block for the full design note) - same
// "independently-loaded Lovelace resources, not ES modules" reasoning as
// every other window.__familyHub* singleton in this file, so only the
// FIRST card whose script actually runs this block sets anything up, and
// logging in on THIS card immediately elevates Chores/Rewards too (and
// vice versa) with no second login, exactly like those two already do for
// each other.
if (!window.__familyHubKioskSession) {
  window.__familyHubKioskSession = (function () {
    const clients = new Map(); // client -> onUpdate
    let elevation = null; // null, or {token, user_id, name, is_admin, permissions, expires_in}
    let idleTimer = null;
    let activityBound = false;

    function broadcast() {
      clients.forEach((onUpdate) => {
        if (typeof onUpdate === "function") onUpdate(elevation);
      });
    }
    function bindActivity() {
      if (activityBound) return;
      activityBound = true;
      ["pointerdown", "keydown", "wheel", "touchstart"].forEach((evt) => {
        document.addEventListener(evt, resetIdleTimer, { passive: true });
      });
    }
    function resetIdleTimer() {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      if (!elevation) return;
      idleTimer = setTimeout(() => doLogout(null), 45000);
    }
    async function doLogout(hass) {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      const prev = elevation;
      elevation = null;
      broadcast();
      if (prev && hass) {
        try {
          await hass.connection.sendMessagePromise({ type: "family_hub/kiosk/deelevate", token: prev.token });
        } catch (e) {
          /* best-effort */
        }
      }
    }
    return {
      registerClient(client, onUpdate) {
        clients.set(client, onUpdate);
        if (typeof onUpdate === "function") onUpdate(elevation);
      },
      unregisterClient(client) {
        clients.delete(client);
      },
      getElevation() {
        return elevation;
      },
      async login(hass, userId, pin) {
        const result = await hass.connection.sendMessagePromise({ type: "family_hub/kiosk/elevate", user_id: userId, pin });
        elevation = result;
        bindActivity();
        resetIdleTimer();
        broadcast();
        return result;
      },
      logout(hass) {
        return doLogout(hass);
      },
      resetIdleTimer,
      _debugIdleTimerArmed() {
        return !!idleTimer;
      },
    };
  })();
}

// Household-wide timer alarm sound+modal (v1.119.0+, widened in
// v1.132.55+) - see family-hub-active-timers-card.js's own top comment
// above this same block for the full design note. Added here in
// v1.132.59+ after a household bug report, verbatim: "a household
// alarm or an assigned alarm set to them plus kiosk doesnt alarm on the
// kiosk" - this card never carried this singleton or subscribed to
// the widened-alarm broadcast at all, so a kiosk whose dashboard shows
// it silently never rang for anyone else's widened timer alarm. Kept
// byte-identical to every other card's copy on purpose.
if (!window.__familyHubTimerAlarm) {
  window.__familyHubTimerAlarm = (function () {
    let modalEl = null;
    let audioCtx = null;
    let beepHandle = null;
    let activeUid = null;
    // A timer's uid, once dismissed, stays dismissed - otherwise the very
    // next poll's countdown tick (still <= 0 for a few more seconds until
    // the backend's own sweep, up to TIMER_SWEEP_SECONDS later, actually
    // removes it from family_hub/timers/list) would immediately re-open
    // the modal a person just tapped Stop on. Unbounded but negligible: a
    // few bytes per timer this ONE tab ever alarmed for in its lifetime.
    const dismissedUids = new Set();
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
        '<div style="background:#fff8ea;color:#3a352c;border-radius:22px;padding:38px 30px;max-width:360px;width:88vw;text-align:center;box-shadow:0 14px 46px rgba(0,0,0,0.45);font-family:-apple-system,\'Segoe UI\',Roboto,sans-serif;">' +
        '<div style="font-size:48px;margin-bottom:12px;">&#9200;</div>' +
        '<div class="fh-timer-alarm-title" style="font-size:1.3em;font-weight:800;margin-bottom:6px;"></div>' +
        '<div style="font-size:14px;color:#96877a;margin-bottom:24px;">Time\'s up!</div>' +
        '<button type="button" class="fh-timer-alarm-stop" style="min-height:54px;width:100%;border:none;border-radius:14px;background:#8f5a00;color:#fff8ea;font-size:19px;font-weight:800;cursor:pointer;">Stop</button>' +
        "</div>";
      document.body.appendChild(modalEl);
      modalEl.querySelector(".fh-timer-alarm-stop").addEventListener("click", () => stop());
      return modalEl;
    }
    // A plain oscillator beep via the Web Audio API - deliberately not a
    // bundled sound file: no extra media asset for HACS/manual installs to
    // ship or for a self-hosted install's network policy to worry about,
    // and it sounds identical on every install.
    //
    // Household ask, verbatim: "can we make it sound more like an alarm
    // and less like a ticking bomb." The original v1.119.0+ sound was one
    // flat square-wave tone repeated once a second - metronomic, which is
    // exactly what read as a countdown-bomb tick rather than an alarm. This
    // plays a quick alternating two-pitch TRIPLET (a classic digital-alarm-
    // clock trill) each cycle instead of a single tone, which is what
    // actually reads as "alarm" to the ear - the alternating pitch is what
    // a lone repeated tone can't give you, no matter how loud.
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
    // Scheduled via Web Audio's own clock (osc.start(atTime)) rather than
    // three back-to-back setTimeout calls, so the triplet's timing stays
    // tight even if the main JS thread is briefly busy - it's the crisp,
    // even spacing that makes it read as a trill instead of a stutter.
    function beepOnce() {
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === "suspended") audioCtx.resume();
        const now = audioCtx.currentTime;
        [[0, 1046], [0.15, 1318], [0.3, 1046]].forEach(([offset, freq]) => playBeep(now + offset, freq));
      } catch (e) {
        // Autoplay blocked, or no Web Audio at all - the modal is still
        // the primary alarm; sound is a bonus on top of it, not required.
      }
    }
    // v1.132.55+: which hass connection to tell "dismiss this everywhere"
    // when Stop is tapped - set by whichever card most recently called
    // ring()/check() with one, since this singleton is shared across every
    // card on the dashboard and any of them may have `hass` by now. Best-
    // effort only (see stop() below): a same-tab-only local alarm (the
    // original v1.119.0+ behavior this singleton already had) never had a
    // server-side record to begin with, so the dismiss call below simply
    // no-ops for it (ws_dismiss_timer_alarm pops a uid that was never
    // registered - see its own docstring for why that's silent, not an
    // error).
    let lastHass = null;
    function stop() {
      if (activeUid) dismissedUids.add(activeUid);
      const uid = activeUid;
      activeUid = null;
      if (beepHandle) {
        clearInterval(beepHandle);
        beepHandle = null;
      }
      if (modalEl) modalEl.style.display = "none";
      // v1.132.55+: household's explicit choice - "first tap wins, from
      // anyone" - so tapping Stop here also clears the alarm everywhere
      // else (other kiosks, other people's phones-that-are-dashboards)
      // rather than just silencing this one tab. No permission gate, by
      // design.
      if (uid && lastHass && lastHass.connection && lastHass.connection.sendMessagePromise) {
        lastHass.connection.sendMessagePromise({ type: "family_hub/timers/dismiss_alarm", uid }).catch(() => {});
      }
    }
    // Household bug report, verbatim: "a household alarm or an assigned
    // alarm set to them plus kiosk doesnt alarm on the kiosk, it should end
    // the screen saver and pop up the timer ended modal and make noise."
    // This modal already outranks the screensaver's own overlay (z-index
    // 2147483647 vs 2147483000, set in ensureModal() above), so it was
    // always painting on top of it - but a screensaver left running
    // underneath still means its video/camera poll keeps going, and the
    // household asked for it to actually END, not just be covered up.
    // There are THREE independent screensaver implementations in this
    // project (the calendar card's own, the shared window.__familyHub
    // ScreenSaver controller used by Chores/Rewards/My Chores/etc., and the
    // standalone family-screensaver-card.js) and this singleton has no
    // reference to whichever one might be running on this particular
    // dashboard. Rather than importing all three, every one of them marks
    // its overlay element with the same data-family-hub-screensaver
    // attribute and already dismisses itself (hides, stops video/camera
    // polling, navigates to its configured return dashboard) on its own
    // overlay's "pointerdown" listener - so a synthetic pointerdown on
    // whichever overlay is actually showing reuses each implementation's
    // own real dismiss path for free, with zero coupling to which one it
    // is.
    function wakeAnyScreenSaver() {
      try {
        const overlay = document.querySelector("[data-family-hub-screensaver]");
        if (overlay && overlay.style.display !== "none") {
          overlay.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        }
      } catch (e) {
        // Best-effort - worst case the alarm modal still shows ON TOP of a
        // running screensaver rather than ending it outright.
      }
    }
    function start(timer, hass) {
      if (hass) lastHass = hass;
      if (activeUid === timer.uid) return;
      activeUid = timer.uid;
      wakeAnyScreenSaver();
      const el = ensureModal();
      el.querySelector(".fh-timer-alarm-title").textContent = timer.title || "Timer";
      el.style.display = "flex";
      beepOnce();
      if (beepHandle) clearInterval(beepHandle);
      // Shorter gap than the old single-tone version (1200ms) since each
      // cycle is now a ~450ms triplet, not a single ~340ms tone - this
      // keeps the alarm feeling urgent/continuous rather than sparse.
      beepHandle = setInterval(beepOnce, 950);
    }
    return {
      // Call once a second from a card's own countdown ticker (the same
      // tick that already repaints the visible "X:XX left" text), passing:
      //   timers        - that card's own freshly-fetched timers list
      //   clientId      - this tab's own id (see _familyHubClientId below)
      //   remainingSecondsFn - a (timer) => seconds function, so this
      //                   singleton reuses the CALLING card's own
      //                   native-timer-aware math (_timerRemainingSeconds)
      //                   instead of a second, potentially-drifting copy
      //                   of it living here with no access to `hass`.
      // Only a timer whose origin_client_id matches THIS tab's own id and
      // whose alarm flag is on can ever trigger anything - a timer someone
      // else started, or one this same tab started but didn't opt into
      // alarms for, is silently ignored here exactly as before this
      // feature existed.
      check(timers, clientId, remainingSecondsFn, hass) {
        if (!clientId) return;
        const mine = (timers || []).find((t) => t.alarm && t.origin_client_id && t.origin_client_id === clientId);
        if (!mine || dismissedUids.has(mine.uid)) return;
        if (remainingSecondsFn(mine) <= 0) start(mine, hass);
      },
      // v1.132.55+: the WIDENED half - a household_timer_alarm_ring bus
      // event (fired by chores_websocket_api.py's _dispatch_timer_alarm/
      // _reannounce_active_alarms) that THIS login should also ring for,
      // because it's either the timer's own owner, a login flagged as an
      // always-on alarm kiosk, or the tier was "everyone." Unlike check()
      // above (which only ever recognizes the ONE tab that started the
      // timer, by origin_client_id), this recognizes a login/account -
      // every open tab logged in as a matching user rings, on every
      // dashboard, which is the whole point of the widened tiers. Re-fired
      // on every re-announcement (see _reannounce_active_alarms), so
      // calling this again for an already-ringing uid is a deliberate
      // no-op (start() already short-circuits on activeUid === timer.uid).
      ringBroadcast(payload, hass, myUserId) {
        if (!payload || !payload.uid || dismissedUids.has(payload.uid)) return;
        const targets = payload.target_user_ids || [];
        const shouldRing = !!payload.broadcast_all || (myUserId && targets.includes(myUserId));
        if (!shouldRing) return;
        start({ uid: payload.uid, title: payload.title }, hass);
      },
      // The STOP half of the same broadcast pair - fired the instant
      // ANY device dismisses (see ws_dismiss_timer_alarm's own "first tap
      // wins" docstring), including a dismiss that originated from THIS
      // singleton's own stop() above (that call's own dismiss already
      // covers this tab; the event still arrives here a moment later and
      // is a harmless no-op via stop()'s own activeUid !== uid guard, or
      // via dismissedUids already containing it).
      stopFromServer(uid) {
        if (uid) dismissedUids.add(uid);
        if (activeUid === uid) stop();
      },
    };
  })();
}

// Theme flash-of-default fix (v1.126.0+) - household report, verbatim:
// "When you load a card it tends to load the default theme first then it
// switches over to the theme you set how can we always make it load the
// set theme first." Root cause: EVERY themed card's first paint happens
// with no theme CSS vars set at all (falls back to _defaultTheme()'s own
// hardcoded palette), because resolving the household's actual theme
// takes two sequential, awaited websocket round trips after `hass` is
// first set - family_hub/get_settings (_fetchSettings), THEN
// theme_builder/list (_fetchGlobalThemes, which is what a Global Theme
// selection actually needs to resolve into real colors) - both happening
// well after `_build()` has already rendered the card once. There was no
// way to know the real colors before those round trips finished.
//
// Fix: cache the last set of CSS var values this device actually applied
// (in memory for the rest of this page load, in localStorage across
// reloads), and apply that cache SYNCHRONOUSLY in `_build()` - before the
// very first paint, before any fetch has even started - so a reload shows
// last-known-good colors immediately instead of _defaultTheme()'s
// hardcoded ones. Once the real fetches resolve, `_applyThemeVars()` runs
// as it always has and reconciles - a no-op re-application (no visible
// change) if nothing changed since last time, which is the overwhelmingly
// common case on an ordinary refresh; a visible switch only when the
// household's theme has genuinely changed since this device last saw it,
// which is unavoidable (nothing can know about a change before asking).
//
// Same shared-singleton, "only the first card whose script actually runs
// this block sets it up" pattern as window.__familyHubFabCoordinator/
// __familyHubKioskSession/__familyHubScreenSaver/__familyHubTimerAlarm
// above - copy-pasted byte-identically into every themed card file, since
// these are independently-loaded Lovelace resources rather than ES
// modules that could import one shared file (same reasoning as those).
//
// Cached under a KEY, not one single blob, because different cards (or
// even the SAME card on a different dashboard placement) can legitimately
// resolve to different colors at once - a per-card-placement Theme
// override (`_config.theme_override`) or a per-device override
// (`_getDeviceThemeOverride()`) both exist specifically so one card can
// look different from the household's shared theme. Caching under one
// shared key would "fix" the flash for the common case but introduce a
// WRONG flash for an overridden card (briefly showing the household's
// theme before its own override kicks in) - a strictly worse bug than
// the one being fixed. The key is derived the same way every time
// (`_familyHubThemeCacheKey`, called identically from `_build()` before
// first paint and from `_applyThemeVars()` after resolving for real), so
// a card with no override at all shares one cache entry with every other
// un-overridden card/placement (the common case this exists for), while
// an overridden card/placement gets its own.
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
        // Best-effort only - the in-memory copy above still helps every
        // OTHER card mounted later in this same page load even if
        // localStorage itself is unavailable.
      }
    }
    return { get, set };
  })();
}

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
        {
          name: "fab_position",
          selector: { select: { mode: "dropdown", options: [
            { value: "dashboard", label: "Dashboard corner (default)" },
            { value: "card", label: "This card's own corner" },
          ] } },
        },
      ],
      computeLabel: (s) =>
        s.name === "title" ? "Title" : s.name === "entities" ? "Lists to show" : s.name === "include_grocy_shopping_lists" ? "Also show Grocy shopping list(s)" : s.name === "fab_position" ? "+ button position" : undefined,
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
  // v1.110.5+: this card's own stable per-instance identity, so two
  // different Todo cards on two different views (or the same view) never
  // share the ONE family_hub_todo_card_config backend record - see
  // __init__.py's _ws_get_todo_card_config/_ws_set_todo_card_config and
  // const.py's TODO_CARD_CONFIG_STORAGE_KEY_PREFIX comment for the full
  // bug report and migration story this fixes ("Todo card is the same
  // config for all instances"). Preferred source is the card's own
  // persisted YAML/storage config (config.card_id) - generated once below
  // and written back the same way getConfigElement's editor already
  // writes other fields back (a config-changed event; on a storage-mode
  // dashboard Home Assistant persists that same as any other card-
  // initiated config migration).
  //
  // v1.129.0+ REWRITE: every generation scheme this method used to fall
  // back to when config.card_id wasn't already set - a random id cached
  // in localStorage under a per-page-load ordinal (pre-v1.128.0), then an
  // ordinal that debounce-reset between construction bursts (v1.128.0) -
  // was still, at bottom, guessing this card's identity from RUNTIME
  // bookkeeping (how many todo cards had been built so far, in what
  // order, in this browser, in this tab). Every one of those fixes closed
  // one specific way that guess could drift, and the household kept
  // finding the next one: "todo card needs to save config when you click
  // save. It still is not" (twice, verbatim). The actual fix is to stop
  // guessing: derive the id straight from the card's own config - the
  // literal YAML/storage config this card was handed - so it's the exact
  // same value every single time this exact card (this view, this title,
  // this entities list) is built, with NO dependency on construction
  // order, browser storage, or session history at all. Two todo cards
  // that select the very same entities on the very same view WILL still
  // collide onto one shared id (there is no config difference between
  // them for this to key off of) - a hand-set `card_id:` in that card's
  // YAML (still checked first, immediately below) is the way to tell two
  // otherwise-identical cards apart, exactly as it always could be.
  _ensureCardId(config) {
    if (config && typeof config.card_id === "string" && config.card_id) {
      return config.card_id;
    }
    // Reuse the id THIS element instance already resolved, rather than
    // re-deriving it on every repeat setConfig call - purely a minor
    // optimization now (re-deriving would produce the identical value
    // anyway, since it's a pure function of config), not a correctness
    // requirement the way it was for the old ordinal-based scheme.
    if (this._config && typeof this._config.cardId === "string" && this._config.cardId) {
      return this._config.cardId;
    }
    return this._todoCardConfigFingerprint(config);
  }
  // A short, stable, deterministic id derived from this card's own view
  // path plus its title/entities/grocy_list_ids - see _ensureCardId's own
  // comment above for why. Sorting the two list fields means reordering
  // the SAME selection (which the List(s) tab's own checkboxes could
  // easily produce in a different DOM/save order) doesn't change the
  // fingerprint. djb2 is not cryptographic - collision-resistance beyond
  // "two genuinely different configs essentially never land on the same
  // few billion buckets" was never the goal, just a short opaque string.
  _todoCardConfigFingerprint(config) {
    // window.location, not the bare global - a couple of this project's
    // own jsdom test harnesses eval this card's source without ever
    // binding a bare `location` identifier.
    const path = (window.location && window.location.pathname) || "";
    const entities = Array.isArray(config && config.entities)
      ? config.entities.filter((e) => typeof e === "string").slice().sort()
      : [];
    const grocyListIds = Array.isArray(config && config.grocy_list_ids)
      ? config.grocy_list_ids.map((v) => parseInt(v, 10)).filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
      : [];
    const title = (config && typeof config.title === "string") ? config.title : "";
    const raw = JSON.stringify([path, title, entities, grocyListIds]);
    let hash = 5381;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) + hash + raw.charCodeAt(i)) | 0;
    }
    return `cfg-${(hash >>> 0).toString(36)}-${raw.length}`;
  }
  setConfig(config) {
    const cardId = this._ensureCardId(config);
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
      cardId,
      // v1.110.7+: see family-hub-chores-card.js's identical setConfig/
      // _registerFabCoordinator comment for the full "dashboard" vs "card"
      // design note.
      fab_position: config && config.fab_position === "card" ? "card" : "dashboard",
      // v1.111.0+: per-card Theme override - see family-hub-goals-card.js's
      // identical field/comment for the full precedence story.
      theme_override: (config && typeof config.theme_override === "string") ? config.theme_override : "",
    };
    this._registerFabCoordinator();
    if (!(config && config.card_id === cardId)) {
      // Best-effort persist the generated id back into this card's own
      // stored config, same channel the editor uses (see _ensureCardId's
      // own comment above). Harmless no-op on a dashboard that doesn't
      // listen for this outside the edit dialog, or on a YAML dashboard -
      // the localStorage fallback in _ensureCardId keeps this card's
      // identity stable on THIS browser either way.
      const merged = Object.assign({}, config || {}, { card_id: cardId });
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: merged }, bubbles: true, composed: true }));
    }
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
    // v1.109.9+: how many stacked rows to spread the list columns across -
    // see _boardRows/_boardHtml. null until the first fetch resolves AND
    // until the household has ever picked one; both cases mean "1", i.e.
    // the single side-by-side row this card has always had.
    if (this._backendBoardRows === undefined) this._backendBoardRows = null;
    // v1.130.0+: "fit to screen" - see _fitToScreen/_syncTodoCardHeight.
    // null/false both mean off (today's always-grow-with-content behavior,
    // unchanged) until the first fetch resolves AND the household has
    // actually turned it on once.
    if (this._backendFitToScreen === undefined) this._backendFitToScreen = false;
    // v1.130.0+: per-row height weights for the "fit to screen" layout's
    // drag-to-resize handles - see _rowHeightWeights/_persistRowHeights.
    // null means "never resized," which _rowHeightWeights treats as every
    // row getting an equal share, same as the board's always looked with
    // 2+ rows before this existed.
    if (this._backendRowHeights === undefined) this._backendRowHeights = null;
    // Wish Lists (v1.122.0+): {[entity_id]: {ownerUserId}} for every
    // todo.* entity currently flagged as a wish list, household-wide -
    // fetched once from its own backend Store (family_hub/
    // get_wishlist_config, see _fetchWishlistConfig) alongside the rest of
    // this card's first-load fetches. {} (not null) until that first fetch
    // resolves, so every wishlist check is a plain, always-safe lookup
    // rather than needing its own null guard everywhere it's read.
    if (this._wishlistConfig === undefined) this._wishlistConfig = {};
    // v1.132.5+: this card's own effective permission grants, resolved
    // server-side - see _fetchMyPermissions/_hasPermission. {} until the
    // first fetch resolves, same convention as family-hub-chores-card.js.
    if (this._myPermissions === undefined) this._myPermissions = {};
    // v1.132.6+: "tie a wish list item to a reward" - live map of
    // {catalog_item_id: catalog_item} from family_hub/rewards/get_state,
    // see _fetchRewardsCatalog/_wishlistItemHtml. null (not {}) until the
    // first fetch resolves, so a reward-tied item's star badge/self-heal
    // logic can tell "no reward data yet" apart from "fetched, and this
    // reward genuinely isn't in the catalog anymore" - the latter is what
    // triggers self-healing removal.
    if (this._rewardsCatalogById === undefined) this._rewardsCatalogById = null;
    // v1.132.4+: kiosk PIN login, joined from the shared
    // window.__familyHubKioskSession singleton (see that block above this
    // class) - mirrors family-hub-chores-card.js's identical
    // this._kioskElevation/_kioskLoginUsers fields.
    if (this._kioskElevation === undefined) this._kioskElevation = null;
    if (this._kioskLoginUsers === undefined) this._kioskLoginUsers = [];
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
    // v1.111.0+: always fetch (not just when useGlobalTheme is on) so a
    // per-card theme_override can resolve even when the household hasn't
    // turned on Global Theme - same change as every other themed card.
    await this._fetchGlobalThemes();
    await this._fetchTodoCardConfig();
    await this._fetchWishlistConfig();
    await this._fetchAllLists();
    // v1.132.4+: who (if anyone) can kiosk-PIN-login on this card - decides
    // whether the Login button even shows at all (see _updateKioskLoginUi).
    // Same "awaited, fails soft to an empty list" convention as Chores/
    // Rewards' own identical fetch.
    await this._fetchKioskLoginUsers();
    this._updateKioskLoginUi();
    // v1.132.5+: this card's own effective grants (see _hasPermission) -
    // needed before the first render so claim-status visibility is correct
    // immediately, not just after a later re-render.
    await this._fetchMyPermissions();
    // v1.132.6+: only bothers fetching the rewards catalog at all if this
    // card actually has a wish list configured - see _hasAnyWishlist's
    // own comment.
    if (this._hasAnyWishlist()) await this._fetchRewardsCatalog();
    this._startPolling();
    this._registerFabCoordinator();
    this._registerKioskSession();
    // Household bug report, verbatim: "a household alarm or an assigned
    // alarm set to them plus kiosk doesnt alarm on the kiosk" - see this
    // file's own copy of the window.__familyHubTimerAlarm singleton
    // (below) for the full design note. Kept byte-identical to every
    // other card's copy on purpose.
    this._subscribeAlarmEvents();
  }
  // v1.132.59+: household-wide timer alarms - subscribe to the two bus
  // events chores_websocket_api.py's _dispatch_timer_alarm/
  // _reannounce_active_alarms fire (see const.py's
  // EVENT_FAMILY_HUB_TIMER_ALARM_RING/_STOP), and hand each one to the
  // shared window.__familyHubTimerAlarm singleton below - same "one modal/
  // audio loop shared by every card on the dashboard" convention its own
  // top comment describes. Subscribed once per card instance (guarded by
  // _alarmUnsub so a re-run of _initFirstLoad, which shouldn't happen but
  // costs nothing to guard against, never double-subscribes).
  async _subscribeAlarmEvents() {
    if (this._alarmUnsub || !this._hass || !this._hass.connection) return;
    const myUserId = this._myUserId();
    try {
      const unsubRing = await this._hass.connection.subscribeEvents((event) => {
        if (window.__familyHubTimerAlarm) {
          window.__familyHubTimerAlarm.ringBroadcast(event.data, this._hass, myUserId);
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
      // Best-effort - a dashboard that can't subscribe (e.g. a very old
      // frontend build) simply never gets the WIDENED alarm reach; the
      // same-tab-only local alarm (window.__familyHubTimerAlarm.check,
      // unaffected by any of this) still works exactly as before.
    }
    // Catch up on anything already ringing before this tab opened, rather
    // than waiting up to ALARM_REANNOUNCE_SECONDS for the next re-
    // announcement's RING event.
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
  // v1.110.4+: joins the shared FAB-stacking coordinator - see
  // family-hub-chores-card.js's identical _registerFabCoordinator for the
  // full design note. This card offers no Goal tab, so it registers with
  // no meta at all - just a slot in the stack.
  //
  // v1.110.7+: fab_position "card" toggles the [fab-position="card"] host
  // attribute (position:fixed -> :host-relative position:absolute) and
  // registers with takesSlot:false - see family-hub-chores-card.js's
  // identical comment for the full reasoning.
  _registerFabCoordinator() {
    if (!window.__familyHubFabCoordinator) return;
    const cardRelative = this._config && this._config.fab_position === "card";
    if (cardRelative) this.setAttribute("fab-position", "card");
    else this.removeAttribute("fab-position");
    window.__familyHubFabCoordinator.registerClient(this, "todo", {}, (state) => {
      this.style.setProperty("--fh-fab-offset", `${state.offsetPx}px`);
    }, { takesSlot: !cardRelative });
  }
  // v1.132.4+: joins the shared kiosk-login session - byte-identical
  // reasoning to family-hub-chores-card.js's own _registerKioskSession.
  // Logging in on Chores/Rewards immediately elevates this card too (and
  // vice versa), with no second login.
  _registerKioskSession() {
    if (window.__familyHubKioskSession) window.__familyHubKioskSession.registerClient(this, (elevation) => this._onKioskElevationChanged(elevation));
  }
  // v1.132.4+: kiosk PIN login - see family-hub-chores-card.js's own
  // _myUserId/_myName/_openKioskLoginModal/_submitKioskLogin/
  // _onKioskElevationChanged for the full picture; this card's copies are
  // functionally identical except _myName is new here (Chores/Rewards only
  // ever need the elevated user's ID, never their display name - this card
  // needs it for claimedByName, see _toggleWishlistClaim).
  _myUserId() {
    if (this._kioskElevation) return this._kioskElevation.user_id;
    return this._hass && this._hass.user ? this._hass.user.id : null;
  }
  _myName() {
    if (this._kioskElevation) return this._kioskElevation.name || "";
    return (this._hass && this._hass.user && this._hass.user.name) || "";
  }
  // v1.132.5+: mirrors family-hub-chores-card.js's own _isAdmin/_hasPermission
  // exactly (see that file's comment above them for the full picture) - this
  // card previously never needed either, but now uses _hasPermission("can_see_wishlist_claims")
  // to gate claim-status visibility (see _wishlistItemHtml) instead of the
  // reverted per-card "hide claims until login" toggle.
  _isAdmin() {
    if (this._kioskElevation) return !!this._kioskElevation.is_admin;
    return !!(this._hass && this._hass.user && this._hass.user.is_admin);
  }
  _hasPermission(key) {
    if (this._isAdmin()) return true;
    if (this._kioskElevation) return !!(this._kioskElevation.permissions && this._kioskElevation.permissions[key]);
    return !!this._myPermissions[key];
  }
  // v1.132.6+: mirrors family-hub-chores-card.js's own _kioskMsg exactly
  // (see that file's comment above it) - wraps a websocket message with
  // this card's own kiosk elevation_token (if any) so a server call made
  // from a kiosk-logged-in session (right now, only
  // family_hub/rewards/redeem - see _claimWishlistReward) is attributed
  // to and re-checked against the ACTUAL elevated household member, not
  // the shared kiosk login.
  _kioskMsg(base) {
    return this._kioskElevation ? Object.assign({}, base, { elevation_token: this._kioskElevation.token }) : base;
  }
  async _fetchMyPermissions() {
    if (!this._hass) return;
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/permissions/get_mine" });
      this._myPermissions = (result && result.permissions) || {};
    } catch (e) {
      this._myPermissions = {};
    }
  }
  // v1.132.6+: "tie a wish list item to a reward" - family_hub/rewards/
  // get_state is open to any authenticated household member (no
  // permission gate on the read itself, same as the Rewards card's own
  // fetch), so this card can safely read the full catalog just to look up
  // one linked item's live cost_stars/existence - see _wishlistItemHtml.
  // On failure, deliberately left at whatever it was before (null on
  // first load, meaning "don't self-heal yet, we don't actually know") -
  // a transient fetch failure must never look like "this reward is gone"
  // and start deleting people's wish-list items.
  async _fetchRewardsCatalog() {
    if (!this._hass) return;
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/rewards/get_state" });
      const catalog = (result && result.catalog) || [];
      const byId = {};
      catalog.forEach((it) => {
        if (it && it.id) byId[it.id] = it;
      });
      this._rewardsCatalogById = byId;
    } catch (e) {
      // Leave this._rewardsCatalogById as-is - see this method's own
      // docstring for why a failed fetch must never be treated as "the
      // catalog is now empty."
    }
  }
  // Whether ANY currently-configured list on this card is flagged as a
  // wish list at all - used to skip the periodic rewards-catalog refetch
  // (see _fetchAllLists) entirely for a household that's never used Wish
  // Lists, rather than adding an extra websocket round trip to every
  // poll tick unconditionally.
  _hasAnyWishlist() {
    return Object.keys(this._wishlistConfig || {}).length > 0;
  }
  async _fetchKioskLoginUsers() {
    if (!this._hass) return;
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/kiosk/list_login_users" });
      this._kioskLoginUsers = (result && result.users) || [];
    } catch (e) {
      this._kioskLoginUsers = [];
    }
  }
  _updateKioskLoginUi() {
    const root = this._root;
    if (!root) return;
    const btn = root.querySelector(".kiosk-login-btn");
    if (!btn) return;
    btn.hidden = !this._kioskElevation && !(this._kioskLoginUsers && this._kioskLoginUsers.length);
    if (this._kioskElevation) {
      btn.textContent = `\u{1F464} ${this._kioskElevation.name} · Log out`;
      btn.classList.add("active");
      btn.title = "Tap to log out of this kiosk session";
    } else {
      btn.textContent = "\u{1F512} Login";
      btn.classList.remove("active");
      btn.title = "Log in as a specific household member on this kiosk display";
    }
  }
  async _onKioskLoginBtnClick() {
    if (this._kioskElevation) await this._kioskLogout();
    else await this._openKioskLoginModal();
  }
  async _openKioskLoginModal() {
    await this._fetchKioskLoginUsers();
    const root = this._root;
    if (!root) return;
    const overlay = root.querySelector(".kiosk-login-overlay");
    const pickerEl = root.querySelector(".kiosk-login-user-picker");
    const errEl = root.querySelector(".kiosk-login-error");
    const pinEl = root.querySelector(".kiosk-login-pin-input");
    if (errEl) errEl.textContent = "";
    if (pinEl) pinEl.value = "";
    this._kioskLoginSelectedUserId = null;
    if (pickerEl) {
      pickerEl.textContent = "";
      if (!this._kioskLoginUsers.length) {
        const empty = document.createElement("div");
        empty.className = "kiosk-login-empty";
        empty.textContent = "No one is set up for kiosk login yet - an admin can enable it under Settings > Users.";
        pickerEl.appendChild(empty);
      } else {
        this._kioskLoginUsers.forEach((u) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "kiosk-login-user-btn";
          btn.dataset.userId = u.id;
          btn.textContent = u.name;
          btn.addEventListener("click", () => {
            pickerEl.querySelectorAll(".kiosk-login-user-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            this._kioskLoginSelectedUserId = u.id;
            if (pinEl) pinEl.focus();
          });
          pickerEl.appendChild(btn);
        });
      }
    }
    if (overlay) overlay.classList.add("open");
    if (pinEl) pinEl.focus();
  }
  _closeKioskLoginModal() {
    const overlay = this._root && this._root.querySelector(".kiosk-login-overlay");
    if (overlay) overlay.classList.remove("open");
  }
  async _submitKioskLogin() {
    const root = this._root;
    if (!root || !this._hass) return;
    const errEl = root.querySelector(".kiosk-login-error");
    const pinEl = root.querySelector(".kiosk-login-pin-input");
    const userId = this._kioskLoginSelectedUserId;
    const pin = pinEl ? pinEl.value.trim() : "";
    if (!userId) {
      if (errEl) errEl.textContent = "Pick who's logging in first.";
      return;
    }
    if (!pin) {
      if (errEl) errEl.textContent = "Enter a PIN.";
      return;
    }
    try {
      await window.__familyHubKioskSession.login(this._hass, userId, pin);
      this._closeKioskLoginModal();
    } catch (e) {
      if (errEl) errEl.textContent = (e && e.message) || "Incorrect PIN.";
      if (pinEl) {
        pinEl.value = "";
        pinEl.focus();
      }
    }
  }
  // v1.132.4+: called whenever window.__familyHubKioskSession's shared
  // elevation changes - from THIS card's own login/logout, or from
  // Chores/Rewards. _myUserId/_myName/_isWishlistOwner all re-derive off
  // this._kioskElevation, so re-rendering is what actually makes the board
  // reflect whoever is (or isn't) logged in - same as Chores/Rewards' own
  // identical handler.
  _onKioskElevationChanged(elevation) {
    this._kioskElevation = elevation;
    if (!this._root) return;
    this._updateKioskLoginUi();
    this._render();
  }
  async _kioskLogout() {
    if (window.__familyHubKioskSession) await window.__familyHubKioskSession.logout(this._hass);
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
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_todo_card_config", card_id: this._config.cardId });
      this._backendEntities = Array.isArray(result && result.entities)
        ? result.entities.filter((e) => typeof e === "string" && e.startsWith("todo."))
        : null;
      this._backendGrocyListIds = Array.isArray(result && result.grocy_list_ids)
        ? result.grocy_list_ids.map((v) => parseInt(v, 10)).filter((v) => Number.isFinite(v))
        : null;
      // v1.109.9+: board layout. The backend already clamps this to
      // 1..TODO_CARD_MAX_BOARD_ROWS and sends null when it's never been
      // set, so this only has to reject a non-number.
      const rows = result && result.rows;
      this._backendBoardRows = Number.isFinite(rows) ? rows : null;
      // v1.130.0+: "fit to screen" + its per-row height weights - see
      // __init__.py's _ws_get_todo_card_config for why row_heights only
      // ever comes back here when it still matches the row count above (a
      // leftover from a row count the household has since changed away
      // from is simply never sent, not something this card has to detect).
      this._backendFitToScreen = !!(result && result.fit_to_screen === true);
      this._backendRowHeights = Array.isArray(result && result.row_heights)
        ? result.row_heights.filter((v) => typeof v === "number" && Number.isFinite(v) && v > 0)
        : null;
      if (this._backendRowHeights && !this._backendRowHeights.length) this._backendRowHeights = null;
    } catch (e) {
      this._backendEntities = null;
      this._backendGrocyListIds = null;
      this._backendBoardRows = null;
      this._backendFitToScreen = false;
      this._backendRowHeights = null;
    }
  }
  // Wish Lists (v1.122.0+) - which todo.* entities are flagged as wish
  // lists, household-wide (family_hub/get_wishlist_config - see its
  // docstring in __init__.py and TODO_WISHLIST_CONFIG_STORAGE_KEY_PREFIX
  // in const.py). Refetched on every open of the FAB's List(s) tab (see
  // _renderListsTab) so a flag flipped from another browser tab/device
  // shows up there without waiting on a page reload, same spirit as
  // _fetchGrocyLists being refreshed on every modal open.
  async _fetchWishlistConfig() {
    if (!this._hass) return;
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_wishlist_config" });
      const wishlists = (result && result.wishlists && typeof result.wishlists === "object") ? result.wishlists : {};
      const cleaned = {};
      Object.keys(wishlists).forEach((entityId) => {
        const rec = wishlists[entityId];
        cleaned[entityId] = { ownerUserId: (rec && typeof rec.owner_user_id === "string") ? rec.owner_user_id : null };
      });
      this._wishlistConfig = cleaned;
    } catch (e) {
      // Leave whatever was already cached (probably {}) rather than
      // wiping every list back to "not a wish list" on a transient
      // network blip.
    }
  }
  // Is this list key a todo.* entity currently flagged as a wish list?
  // Grocy-backed columns (key = "grocy:<id>") are never wish lists - the
  // whole feature is built on native todo.* item descriptions, which
  // Grocy shopping-list rows don't have (see _getGrocyItems - they use
  // their own separate `note` field instead).
  _isWishlistList(key) {
    return typeof key === "string" && key.startsWith("todo.") && !!this._wishlistConfig[key];
  }
  // True only for the specific signed-in household member who flagged this
  // list as a wish list (see _ws_set_wishlist_flag's docstring on
  // ownerUserId) - drives hiding claim status from that one person so the
  // "surprise" isn't spoiled, per the household's own explicit choice when
  // asked about claiming. Nobody else, on this same list, sees anything
  // hidden. v1.132.4+: reads _myUserId() (kiosk-elevation-aware) instead of
  // this._hass.user.id directly - on a shared kiosk device this._hass.user
  // is always the kiosk's own HA login, never any specific household
  // member, so before kiosk login existed here this could never actually
  // match an ownerUserId; once someone logs in via the kiosk PIN modal,
  // this correctly recognizes them as the owner again.
  _isWishlistOwner(key) {
    const rec = this._wishlistConfig[key];
    const myId = this._myUserId();
    return !!(rec && rec.ownerUserId && myId && rec.ownerUserId === myId);
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
    this._registerFabCoordinator();
    // v1.132.6+: re-join the shared kiosk session too, not just the FAB
    // coordinator - household report, verbatim: "there is a weird issue
    // where you login on one screen and logout on another the todo login
    // tab doesnt seem to recognize the log out and stays indicating a
    // logged in user." Root cause: _registerKioskSession() was only ever
    // called once, from _initFirstLoad (first `hass` set) - unlike
    // Chores/Rewards, this card's connectedCallback never called it again.
    // A Lovelace view switch away and back disconnects/reconnects this
    // element (disconnectedCallback already unregisters it from the
    // session), so after the first such round trip this card was
    // permanently dropped from window.__familyHubKioskSession's clients
    // Map and never heard another login/logout broadcast again - it just
    // kept showing whatever was true at the moment it was last connected.
    // registerClient() is idempotent (a Map keyed by `this`) and always
    // immediately re-syncs the caller to the CURRENT elevation as soon as
    // it's called, so simply calling it again here self-corrects any stale
    // state the instant the view becomes visible again.
    this._registerKioskSession();
    // v1.130.0+: "fit to screen" - same resize/orientation/interval-
    // polling pattern family-week-calendar-card.js's own _syncHeight uses
    // (see that method's comment for why an interval on top of the resize
    // listeners: some sources of a card's own on-screen position changing
    // - the HA header collapsing on scroll, a sidebar opening - fire no
    // resize/orientation event at all). A no-op whenever fit-to-screen is
    // off, which is every card that hasn't turned it on.
    if (!this._boundSyncTodoCardHeight) this._boundSyncTodoCardHeight = this._syncTodoCardHeight.bind(this);
    window.addEventListener("resize", this._boundSyncTodoCardHeight);
    window.addEventListener("orientationchange", this._boundSyncTodoCardHeight);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", this._boundSyncTodoCardHeight);
      window.visualViewport.addEventListener("scroll", this._boundSyncTodoCardHeight);
    }
    if (!this._todoCardHeightInterval) {
      this._todoCardHeightInterval = setInterval(this._boundSyncTodoCardHeight, 1500);
    }
    requestAnimationFrame(this._boundSyncTodoCardHeight);
    setTimeout(this._boundSyncTodoCardHeight, 300);
  }
  disconnectedCallback() {
    if (this._interval) clearInterval(this._interval);
    this._interval = null;
    if (window.__familyHubFabCoordinator) window.__familyHubFabCoordinator.unregisterClient(this);
    if (window.__familyHubKioskSession) window.__familyHubKioskSession.unregisterClient(this);
    if (this._todoCardHeightInterval) {
      clearInterval(this._todoCardHeightInterval);
      this._todoCardHeightInterval = null;
    }
    if (this._boundSyncTodoCardHeight) {
      window.removeEventListener("resize", this._boundSyncTodoCardHeight);
      window.removeEventListener("orientationchange", this._boundSyncTodoCardHeight);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", this._boundSyncTodoCardHeight);
        window.visualViewport.removeEventListener("scroll", this._boundSyncTodoCardHeight);
      }
    }
    this._endRowResizeDrag();
  }
  // v1.130.0+: pins this card's own height to "however much viewport is
  // left below it" when (and only when) fit-to-screen is on - see
  // family-week-calendar-card.js's own _syncHeight for the identical
  // rect/visualViewport math this is copied from (that card runs this
  // unconditionally; this one gates it on _fitToScreen() since growing
  // with content is still the default here). Turning fit-to-screen back
  // off clears the inline height instead of leaving it pinned to whatever
  // it last measured.
  _syncTodoCardHeight() {
    if (!this.isConnected) return;
    if (!this._fitToScreen()) {
      if (this.style.height) this.style.height = "";
      return;
    }
    const rect = this.getBoundingClientRect();
    const vv = window.visualViewport;
    const viewportHeight = vv ? vv.height : window.innerHeight;
    const viewportTop = vv ? vv.offsetTop : 0;
    const available = Math.max(200, Math.floor(viewportHeight - (rect.top - viewportTop)));
    if (this.style.height !== `${available}px`) {
      this.style.height = `${available}px`;
    }
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
    return { theme: this._defaultTheme(), useGlobalTheme: true, globalThemeId: "liquidglass" };
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
  // Shared by both the new per-card override branch and the existing
  // household-global branch below - factored out so the color-validation
  // logic only needs to exist once in this file.
  _themeFromGlobalEntry(g) {
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
  _resolveTheme(settings) {
    const local = settings.theme || this._defaultTheme();
    // v1.111.0+: a per-card-placement Theme override (set from this card's
    // own native "Edit Card" dialog) wins over everything else, including
    // this device's own override and the household's Global Theme.
    const cardOverride = this._config && this._config.theme_override;
    if (cardOverride) {
      const g = (this._globalThemes || []).find((t) => t && t.id === cardOverride);
      if (g) return this._themeFromGlobalEntry(g);
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
  // v1.126.0+ - see window.__familyHubThemeCache's own comment above the
  // class for the full "why a key, not one shared blob" reasoning. Called
  // identically from here (after resolving the REAL theme) and from
  // `_build()` (before the real theme is known yet, to look up whatever
  // was cached last time) - both call sites MUST derive the same key for
  // a given card/placement, or the cache lookup in `_build()` would never
  // find what `_applyThemeVars()` just wrote for it.
  _familyHubThemeCacheKey() {
    const cardOverride = this._config && this._config.theme_override;
    if (cardOverride) return `card:${cardOverride}`;
    const deviceOverride = this._getDeviceThemeOverride();
    if (deviceOverride) return `device:${deviceOverride}`;
    return "household";
  }
  _applyThemeVars() {
    const theme = this._resolveTheme(this._getSettings());
    const cardOpacity = typeof theme.cardOpacity === "number" ? theme.cardOpacity : 100;
    const glassBlur = typeof theme.glassBlur === "number" ? theme.glassBlur : 0;
    // v1.126.0+: built as a plain object first (rather than each var going
    // straight into its own setProperty call, as before) purely so the
    // exact same values that get applied here also get cached - see
    // window.__familyHubThemeCache's own comment for why this fixes the
    // household's reported "loads the default theme first" flash.
    const vars = {
      "--fc-bg": theme.colors.bg,
      "--fc-card": this._hexToRgba(theme.colors.card, cardOpacity / 100),
      "--fc-border": theme.colors.border,
      "--fc-text": theme.colors.text,
      "--fc-text-secondary": theme.colors.textSecondary,
      "--fc-accent": theme.colors.accent,
      "--fc-accent-text": theme.colors.accentText,
      "--fc-accent2": theme.colors.accent2,
      "--fc-accent3": theme.colors.accent3,
      "--fc-surface-alt": this._hexToRgba(theme.colors.surfaceAlt, cardOpacity / 100),
      "--fc-surface2": this._hexToRgba(theme.colors.surface2, cardOpacity / 100),
      "--fc-glass-blur": `${glassBlur}px`,
    };
    Object.keys(vars).forEach((name) => this.style.setProperty(name, vars[name]));
    if (window.__familyHubThemeCache) window.__familyHubThemeCache.set(this._familyHubThemeCacheKey(), vars);
  }
  // v1.126.0+: applies whatever theme this device/placement last actually
  // resolved to, SYNCHRONOUSLY, before the real fetches that would
  // otherwise be the only way to know it - see window.__familyHubTheme
  // Cache's own comment above the class. Called once from `_build()`,
  // before the very first `_render()`/paint. A no-op (does nothing,
  // leaves `_defaultTheme()`'s plain colors as the first paint exactly
  // like before this fix) on the very first time ANY card resolves this
  // particular key - there's nothing to have cached yet.
  _applyCachedThemeVarsIfAny() {
    if (!window.__familyHubThemeCache) return;
    const cached = window.__familyHubThemeCache.get(this._familyHubThemeCacheKey());
    if (!cached) return;
    Object.keys(cached).forEach((name) => {
      if (typeof cached[name] === "string") this.style.setProperty(name, cached[name]);
    });
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
    let custom = [];
    try {
      const result = await this._hass.connection.sendMessagePromise({ type: "theme_builder/list" });
      custom = (result && Array.isArray(result.themes)) ? result.themes : [];
    } catch (e) {
      custom = [];
    }
    // v1.111.0+: also merge in every installed native Home Assistant theme -
    // duplicated (not shared/imported) from family-week-calendar-card.js's
    // own _fetchGlobalThemes/_nativeHaThemeEntries, same "independently
    // loaded Lovelace resources duplicate small helpers" convention as
    // every native/websocket pair elsewhere in this project.
    this._globalThemes = custom.concat(this._nativeHaThemeEntries());
    this._applyThemeVars();
  }
  // --- Native HA theme support (duplicated from family-week-calendar-
  // card.js's identical methods - see that file's own comments for the
  // full reasoning on each) ---
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
  // Note: this card's own theme shape has no `fonts` concept - only
  // `colors`/`cardOpacity`/`glassBlur` are ever read via
  // _themeFromGlobalEntry, so these entries carry colors only.
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
  // -- Board layout (v1.109.9+) ----------------------------------------------
  // "We should make the todo card fully customizable, add rows columns, etc
  // so you can have your lists shown how you want a line of lists, 2
  // stacks, 3 stacks etc."
  //
  // Expressed as a ROW (stack) count rather than a column count, for two
  // reasons. First, it's the household's own framing - "a line of lists, 2
  // stacks, 3 stacks." Second, it's the one that survives a varying number
  // of lists: "3 columns" is meaningless with two lists selected and
  // awkward with seven, whereas "3 stacks" always describes something real,
  // and the per-row column count falls out of it. The existing CSS already
  // agreed - the board has always rendered exactly one `.todo-board-row`,
  // so N rows is a direct extension rather than a rewrite.
  //
  // 1 (the default, and what a card that's never been configured reports)
  // is byte-for-byte the layout this card has always had, so upgrading
  // changes nobody's board until they go and pick something else.
  _boardRows() {
    const rows = this._backendBoardRows;
    if (!Number.isFinite(rows)) return 1;
    return Math.max(1, Math.min(TODO_CARD_MAX_BOARD_ROWS, Math.round(rows)));
  }
  // Splits the descriptors (in their existing _listDescriptors order, which
  // is what the List(s) tab's own selection order already determines - the
  // layout control deliberately does NOT reorder anything, it only decides
  // where the existing sequence wraps) into `rows` chunks, filling each row
  // left-to-right, top-to-bottom.
  //
  // Chunk size is ceil(total/rows), so any remainder lands on the LAST row
  // and earlier rows are never shorter than later ones - with 5 lists in 2
  // rows that's 3 then 2, reading the way a paragraph does. Rows that would
  // come out empty (more rows chosen than lists selected) are dropped
  // rather than rendered as blank strips.
  _boardRowGroups() {
    const descriptors = this._listDescriptors();
    const rows = this._boardRows();
    if (rows <= 1 || descriptors.length <= 1) return [descriptors];
    const perRow = Math.ceil(descriptors.length / rows);
    const groups = [];
    for (let i = 0; i < descriptors.length; i += perRow) {
      groups.push(descriptors.slice(i, i + perRow));
    }
    return groups;
  }
  // -- Fit to screen + row resizing (v1.130.0+) ------------------------------
  // "add a way to todo card to fit to screen and also be able to resize
  // rows." Off by default (see setConfig's own _backendFitToScreen init) -
  // every card that's never turned this on keeps growing with its content
  // and letting the dashboard page scroll, byte-for-byte the only behavior
  // this card has ever had. Only once a household turns it on does the
  // host element's own height get pinned to "however much viewport is left
  // below it" (_syncTodoCardHeight) and each row/column start scrolling on
  // its own instead of the page.
  _fitToScreen() {
    return !!this._backendFitToScreen;
  }
  // One weight per row group, defaulting to an even split (every row the
  // same size) exactly like the board always looked before per-row
  // resizing existed. Only meaningful (and only ever rendered as drag
  // handles) once _fitToScreen() is on AND there's more than one row -
  // resizing rows against each other means nothing when there's only one,
  // or when the board is free to just grow with its content instead of
  // dividing up a fixed height.
  _rowHeightWeights(rowCount) {
    const saved = this._backendRowHeights;
    if (Array.isArray(saved) && saved.length === rowCount) return saved;
    return Array(rowCount).fill(1);
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
    const fetches = descriptors.map(async (d) => {
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
    });
    // v1.132.6+: refreshed on every poll tick too (not just first load) so
    // a reward-tied wish-list item notices when its reward was redeemed
    // straight from the Rewards card, on a DIFFERENT device, and self-
    // heals (see _wishlistItemHtml) without needing this card reloaded.
    if (this._hasAnyWishlist()) fetches.push(this._fetchRewardsCatalog());
    await Promise.all(fetches);
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
    const removedItem = list ? list.items.find((it) => it.uid === uid) : null;
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
    // v1.132.6+: deleting a wish-list item that still has a reward tied to
    // it (see _openTieRewardModal) also cleans up the now-orphaned catalog
    // entry, so removing the item from the wish list doesn't leave a
    // priced reward sitting in the Rewards catalog with nothing pointing
    // to it anymore. Best-effort and non-blocking - deleting a catalog
    // item needs reward-override permission (stronger than the can_add_
    // rewards this whole feature is otherwise gated on), so someone
    // without it still successfully deletes the wish-list item itself;
    // the catalog entry is just left for an admin to clean up from the
    // Rewards card instead.
    if (this._isWishlistList(key) && removedItem) {
      const removedParsed = _parseWishlistDescription(removedItem.description || "");
      if (removedParsed.rewardItemId) {
        try {
          await this._hass.connection.sendMessagePromise({ type: "family_hub/rewards/delete_catalog_item", item_id: removedParsed.rewardItemId });
        } catch (e) {
        }
      }
    }
    this._fetchAllLists();
  }
  async _addItem(key, summary, dueDate, wishlistExtra) {
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
        // Wish Lists (v1.122.0+) - link/image typed in the Add modal
        // (see _renderAddItemTab) get folded straight into the new
        // item's own description at creation time, same encoding as
        // every other wishlist item (see _buildWishlistDescription).
        if (wishlistExtra && (wishlistExtra.link || wishlistExtra.image) && this._todoEntitySupportsDescription(key)) {
          data.description = _buildWishlistDescription("", { link: wishlistExtra.link, image: wishlistExtra.image });
        }
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
  // Wish Lists (v1.122.0+) - claims/releases one item for the SIGNED-IN
  // household member, never offered at all to the list's own owner (see
  // _wishlistItemHtml/_isWishlistOwner) and never offered for an item
  // someone else already has claimed (the button renders `disabled` in
  // that case - see _wishlistItemHtml). Only this item's own claim fields
  // in the JSON tail change; the plain note text and any link/image are
  // read back off the item's CURRENT description and carried through
  // untouched, so claiming something never touches what the owner
  // themselves wrote for it.
  //
  // v1.132.4+: "the signed-in household member" now means _myUserId()/
  // _myName() (kiosk-elevation-aware), not this._hass.user directly - on a
  // shared kiosk device, claiming with the raw kiosk HA login would
  // attribute every claim to "the kiosk" instead of whoever actually
  // tapped it, and never match anyone's real ownerUserId for
  // _isWishlistOwner either. Once someone logs in via the kiosk PIN modal,
  // claims are attributed to them by name exactly as they would be signed
  // in on their own device.
  async _toggleWishlistClaim(key, uid) {
    const item = this._itemsFor(key).find((it) => it.uid === uid);
    if (!item) return;
    const parsed = _parseWishlistDescription(item.description || "");
    const myId = this._myUserId();
    if (!myId) return;
    // v1.132.5+: defensive only - _wishlistItemHtml already never renders
    // this button at all for a non-owner lacking can_see_wishlist_claims,
    // but a stale click event handler is worth guarding server-side-of-UI
    // too rather than trusting the DOM was never stale.
    if (!this._isWishlistOwner(key) && !this._hasPermission("can_see_wishlist_claims")) return;
    const claimedByMe = parsed.claimedBy === myId;
    const myName = this._myName();
    const nextDescription = _buildWishlistDescription(parsed.note, {
      link: parsed.link,
      image: parsed.image,
      claimedBy: claimedByMe ? null : myId,
      claimedByName: claimedByMe ? "" : myName,
      // v1.132.6+: preserve a reward tie through this rebuild - this
      // "claim for someone else" toggle is unreachable at all once a
      // reward is tied (see _wishlistItemHtml, which renders the star
      // claim button instead of this one for a rewardItemId item), but
      // carried through defensively rather than silently dropped.
      rewardItemId: parsed.rewardItemId,
      rewardCostStars: parsed.rewardCostStars,
    });
    // Optimistic update, same spirit as _toggleItem - the button reflects
    // the new claim state instantly rather than waiting a round trip.
    item.description = nextDescription;
    this._render();
    if (!this._todoEntitySupportsDescription(key)) return;
    try {
      await this._hass.callService("todo", "update_item", { item: uid, description: nextDescription }, { entity_id: key });
    } catch (e) {
    }
    this._fetchAllLists();
  }
  // v1.132.6+: "tie a wish list item to a reward" - opens a small modal
  // (title prefilled from the item's own summary, editable; a star cost)
  // that, on Save, creates a BRAND NEW Rewards catalog entry (always
  // redeem_mode "one_time" - see reward_engine.redeem_item's own
  // docstring for why that mode alone already deletes the catalog entry
  // the instant it's redeemed, which is exactly "removed from... the
  // rewards" for free) via the same family_hub/rewards/add_catalog_item
  // command the Rewards card's own + button uses, then folds the new
  // item's id into this wish-list item's description (see
  // _buildWishlistDescription's rewardItemId/rewardCostStars). Gated on
  // can_add_rewards in _wishlistItemHtml (UX only - add_catalog_item
  // itself independently re-checks the exact same permission server-side,
  // same as everywhere else this permission is used).
  async _openTieRewardModal(key, uid) {
    const item = this._itemsFor(key).find((it) => it.uid === uid);
    if (!item) return;
    const overlay = this._root.querySelector(".tie-reward-modal");
    const box = overlay.querySelector(".modal-box");
    box.innerHTML = `
      <h3>&#127873; Add a star value</h3>
      <div class="remind-hint">Turns this into a one-time reward: it'll show a star cost here and in the Rewards catalog, and claiming it (from either place) removes it from both.</div>
      <label>Title<input type="text" class="tie-reward-title" maxlength="120"></label>
      <label>Cost (stars)<input type="number" class="tie-reward-cost" min="0" step="1" inputmode="numeric"></label>
      <div class="form-error"></div>
      <div class="modal-actions">
        <button class="cancel-btn">Cancel</button>
        <button class="save-btn tie-reward-save-btn">Save</button>
      </div>
    `;
    box.querySelector(".tie-reward-title").value = item.summary || "";
    box.querySelector(".cancel-btn").addEventListener("click", () => overlay.classList.remove("open"));
    box.querySelector(".tie-reward-save-btn").addEventListener("click", async () => {
      const titleInput = box.querySelector(".tie-reward-title");
      const costInput = box.querySelector(".tie-reward-cost");
      const errorEl = box.querySelector(".form-error");
      errorEl.textContent = "";
      const title = titleInput.value.trim();
      const cost = parseInt(costInput.value, 10);
      if (!title) {
        errorEl.textContent = "A title is required.";
        return;
      }
      if (!Number.isFinite(cost) || cost < 0) {
        errorEl.textContent = "Enter a star cost of 0 or more.";
        return;
      }
      try {
        // v1.132.9+: routed through _kioskMsg (was a bare sendMessagePromise
        // before) - household report, verbatim: "when logged in as elevated
        // user on todo lists I cant assign a star value to items on the
        // kiosk." Without the elevation_token, the backend had no way to
        // know a household member had PIN-elevated on this kiosk and
        // checked the shared kiosk HA login's own (typically nonexistent)
        // permissions instead - see chores_websocket_api.py's
        // ws_add_catalog_item for the server-side half of this fix.
        const result = await this._hass.connection.sendMessagePromise(this._kioskMsg({
          type: "family_hub/rewards/add_catalog_item",
          title,
          cost_stars: cost,
          redeem_mode: "one_time",
        }));
        const newItemId = result && result.item && result.item.id;
        if (!newItemId) throw new Error("no item id returned");
        const parsed = _parseWishlistDescription(item.description || "");
        const nextDescription = _buildWishlistDescription(parsed.note, {
          link: parsed.link,
          image: parsed.image,
          claimedBy: parsed.claimedBy,
          claimedByName: parsed.claimedByName,
          rewardItemId: newItemId,
          rewardCostStars: cost,
        });
        item.description = nextDescription;
        await this._hass.callService("todo", "update_item", { item: uid, description: nextDescription }, { entity_id: key });
        overlay.classList.remove("open");
        await this._fetchRewardsCatalog();
        this._fetchAllLists();
      } catch (e) {
        errorEl.textContent = "Couldn't save - " + (e && e.message ? e.message : "try again.");
      }
    });
    overlay.classList.add("open");
  }
  // v1.132.6+: claims a reward tied to a wish-list item - a thin wrapper
  // around the exact same family_hub/rewards/redeem command the Rewards
  // card's own Claim button uses (deducts this person's own stars, and -
  // since this reward was always created with redeem_mode "one_time" -
  // deletes the catalog entry server-side the instant it succeeds). This
  // card's own job on top of that is just removing the wish-list item
  // itself, so "removed from both locations" holds regardless of which
  // side the claim came from.
  async _claimWishlistReward(key, uid) {
    const item = this._itemsFor(key).find((it) => it.uid === uid);
    if (!item) return;
    const parsed = _parseWishlistDescription(item.description || "");
    if (!parsed.rewardItemId) return;
    if (!this._myUserId()) return;
    try {
      await this._hass.connection.sendMessagePromise(this._kioskMsg({ type: "family_hub/rewards/redeem", item_id: parsed.rewardItemId }));
    } catch (e) {
      // Most commonly insufficient_balance - left on the wish list so the
      // person can see the star cost and try again once they've saved up,
      // rather than silently doing nothing.
      return;
    }
    await this._deleteItem(key, uid);
    await this._fetchRewardsCatalog();
  }
  // Upload a photo (v1.124.0+, v1.127.0+) - household ask, verbatim: "we
  // need to make the wishlist modal be able to upload an image", followed
  // up with: "for the wish list, when you upload an image, upload it to
  // home assistant as a photo and then call it from there." v1.124.0's
  // first cut stored a downscaled data: URL directly in the native todo
  // item's own `description` field, entirely client-side, since this
  // integration had no image-upload endpoint of its own at the time. This
  // version switches to Home Assistant CORE's own built-in image_upload
  // component instead (the same one the frontend already uses for Person/
  // Area picture pickers) - now a manifest.json dependency, so it's always
  // loaded alongside this integration. The photo is POSTed to its
  // `/api/image/upload` endpoint, and the small `/api/image/serve/<id>/
  // original` URL that comes back is what gets stored in the exact same
  // `image` field a pasted Image URL already fills (see
  // _buildWishlistDescription/_parseWishlistDescription) - image_upload's
  // own serve endpoint needs no auth token to view (`requires_auth =
  // False` on its ImageServeView), so this URL works as a plain <img src>
  // anywhere the card renders, same as a pasted https:// link always did.
  // No new backend command or storage location of THIS integration's own
  // is needed - image_upload already does the storing.
  //
  // Downscaled to at most 1600px on the long edge and re-encoded as an
  // 85%-quality JPEG before uploading - this is no longer about keeping
  // the todo item's own `description` field small (a `/api/image/serve/
  // ...` URL is only a few dozen characters either way, unlike the old
  // data: URL approach), it's purely to keep the upload itself fast on a
  // slow tablet connection and comfortably under image_upload's own 10 MB
  // cap, and - as a side effect of re-encoding through <canvas> - to
  // normalize whatever format the browser decoded (HEIC, WebP, ...) into
  // one of the three content types image_upload's own upload endpoint
  // actually accepts (image/jpeg, image/png, image/gif; anything else is
  // rejected with a 400). Re-encoding is best-effort: any failure (an
  // environment with no canvas 2D context - notably this project's own
  // jsdom test suite - a corrupt/unsupported image, or simply running out
  // the decode timeout) falls back to uploading the ORIGINAL, un-
  // re-encoded file as-is, which still works fine as long as its own
  // content type is already one of the three image_upload accepts.
  async _wishlistBlobToUploadFromFile(file) {
    let blob = file;
    let name = (file && file.name) || "photo.jpg";
    try {
      const rawDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error("Couldn't read that file."));
        reader.readAsDataURL(file);
      });
      // A short timeout alongside onload/onerror - some environments
      // (notably this project's own jsdom test suite, which stubs out
      // real image decoding entirely) never fire either event at all, so
      // waiting on them alone would hang forever instead of falling back.
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("Couldn't decode that image."));
        el.src = rawDataUrl;
        setTimeout(() => reject(new Error("timed out decoding image")), 1500);
      });
      const maxDim = 1600;
      const width = img.width || maxDim;
      const height = img.height || maxDim;
      const scale = Math.min(1, maxDim / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext && canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const reEncoded = await new Promise((resolve) => {
          if (typeof canvas.toBlob === "function") {
            canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85);
          } else {
            resolve(null);
          }
        });
        if (reEncoded) {
          blob = reEncoded;
          name = "photo.jpg";
        }
      }
    } catch (e) {
      // Best-effort only - falls through to uploading the original file.
    }
    return { blob, name };
  }
  // Small wrapper around `hass.fetchWithAuth` (the frontend's own helper
  // for an authenticated fetch() against Home Assistant's REST API,
  // attaching/refreshing the Bearer token automatically) with a manual
  // fallback in case a given `hass` shape ever lacks it - same Bearer-
  // token header `fetchWithAuth` sets internally, so the fallback behaves
  // identically when it's needed at all.
  async _wishlistFetchWithAuth(path, opts) {
    if (this._hass && typeof this._hass.fetchWithAuth === "function") {
      return this._hass.fetchWithAuth(path, opts);
    }
    const token = this._hass && this._hass.auth && this._hass.auth.data && this._hass.auth.data.access_token;
    const headers = Object.assign({}, opts && opts.headers, token ? { authorization: `Bearer ${token}` } : {});
    return fetch(path, Object.assign({}, opts, { headers }));
  }
  // Uploads a picked file to Home Assistant's own image_upload component
  // and returns the `/api/image/serve/<id>/original` URL to store - see
  // _wishlistBlobToUploadFromFile's own comment for the full reasoning.
  async _wishlistUploadImage(file) {
    if (!file) return null;
    const { blob, name } = await this._wishlistBlobToUploadFromFile(file);
    const formData = new FormData();
    formData.append("file", blob, name);
    const response = await this._wishlistFetchWithAuth("/api/image/upload", { method: "POST", body: formData });
    if (!response || !response.ok) {
      throw new Error(`image upload failed (${response && response.status})`);
    }
    const result = await response.json();
    if (!result || !result.id) throw new Error("image upload response had no id");
    return `/api/image/serve/${result.id}/original`;
  }
  // Wires one Upload-photo file input to one Image URL text input plus its
  // small preview/status elements, shared by both the Add modal
  // (_renderAddItemTab) and the item detail modal (_openItemDetailModal) -
  // see _wishlistUploadImage's own comment for why an upload just writes
  // a `/api/image/serve/...` URL into the SAME text field a pasted link
  // already uses, rather than being a separate field/concept. `preview`
  // and `statusEl` are optional (harmless no-ops when omitted) purely so
  // this one method covers both modals even if one ever drops either.
  _wireWishlistImageUpload(fileInput, textInput, previewEl, statusEl) {
    if (!fileInput || !textInput) return;
    // Pasting/editing the URL by hand also updates the preview, not just
    // an upload - keeps the two entry paths (paste a link, upload a
    // photo) feeling like the same one field rather than two disconnected
    // controls.
    if (previewEl) {
      textInput.addEventListener("input", () => {
        const value = textInput.value.trim();
        previewEl.src = value;
        previewEl.hidden = !value;
        if (statusEl) statusEl.textContent = "";
      });
    }
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (statusEl) statusEl.textContent = "Uploading…";
      try {
        const imageUrl = await this._wishlistUploadImage(file);
        if (!imageUrl) throw new Error("empty");
        textInput.value = imageUrl;
        if (previewEl) {
          previewEl.src = imageUrl;
          previewEl.hidden = false;
        }
        if (statusEl) statusEl.textContent = "Photo added.";
      } catch (e) {
        if (statusEl) statusEl.textContent = "Couldn't upload that photo - try a different file or paste a link instead.";
      } finally {
        // Reset so picking the SAME file again (e.g. after an error)
        // still fires another change event.
        fileInput.value = "";
      }
    });
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
    // Wish Lists (v1.122.0+) - a wish-list item renders as a small
    // gift-registry card (image thumbnail, name, link, note) instead of a
    // plain checklist row, with a Claim button - unless the viewer IS this
    // list's own owner, in which case claim status/controls are left off
    // entirely (see _isWishlistOwner's own comment on why).
    if (this._isWishlistList(key) && descriptor && descriptor.kind !== "grocy") {
      return this._wishlistItemHtml(key, item, completed);
    }
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
  // See _itemHtml's own comment. Kept as a separate method rather than
  // folded inline so the far more common (non-wish-list) row above stays
  // exactly as simple as it always was.
  _wishlistItemHtml(key, item, completed) {
    const parsed = _parseWishlistDescription(item.description || "");
    const isOwner = this._isWishlistOwner(key);
    const myId = this._myUserId();
    const claimedByMe = !!(parsed.claimedBy && myId && parsed.claimedBy === myId);
    const imageHtml = parsed.image
      ? `<img class="wishlist-item-image" src="${this._escAttr(parsed.image)}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : `<div class="wishlist-item-image wishlist-item-image-placeholder">&#127873;</div>`;
    const linkHtml = parsed.link
      ? `<a class="wishlist-item-link" href="${this._escAttr(parsed.link)}" target="_blank" rel="noopener noreferrer" title="Open link">&#128279; View</a>`
      : "";
    // Claim UI is left off entirely for the list's own owner - see
    // _isWishlistOwner's own comment for the "hidden from the owner"
    // design and its acknowledged limitation.
    //
    // v1.132.5+: ALSO left off for anyone lacking the can_see_wishlist_claims
    // permission (see its own docstring in const.py; checked here via
    // _hasPermission, admin- and kiosk-elevation-aware the same as every
    // other permission check on this card). Household ask, verbatim: "need
    // a way to not allow kiosk devices to see claimed items on wish
    // lists." This used to be a per-card "hide until login" toggle
    // (v1.132.4); the household asked for it to be a per-person Permissions
    // grant instead, so a shared/unidentified kiosk login (which has no
    // grant unless an admin explicitly adds one) never sees claim status,
    // while every household member who already had visibility before this
    // existed keeps it via the one-time migration in __init__.py. Claiming -
    // and its duplicate-purchase protection - stays fully available to
    // anyone with the permission, including someone who's kiosk-logged-in
    // as themselves via the Login button.
    // v1.132.6+: "tie a wish list item to a reward" - household ask,
    // verbatim: "Allow someone with the permission to add rewards to tie a
    // wish list item to a reward. It will become a one time claim item and
    // will show a star value to claim on the wish list and in the
    // rewards. When claimed it should be removed from both locations."
    // A reward tie (parsed.rewardItemId, see _openTieRewardModal) is a
    // DIFFERENT mechanic from the plain gift-claim above - it's not "I'll
    // buy this for you," it's a real Rewards catalog item (always created
    // with redeem_mode "one_time") that this item's own star badge lets
    // anyone identified spend their OWN stars on, same as redeeming it
    // straight from the Rewards card would. Because of that it's shown to
    // EVERYONE, including the list's own owner (unlike the plain claim
    // button above, which is deliberately hidden from them) - the whole
    // point is usually the owner themselves saving up to claim their own
    // wish, and there's no "surprise" to spoil over a price tag.
    //
    // this._rewardsCatalogById (see _fetchRewardsCatalog) is the live
    // source of truth for whether the tied reward still exists - null
    // until the first fetch resolves (nothing rendered either way until
    // then, same "don't flash a wrong state before data arrives"
    // convention used elsewhere on this card). Once fetched, a
    // rewardItemId that's no longer in the catalog means it was already
    // redeemed from the OTHER side (the Rewards card directly) - self-
    // heals by removing this now-stale wish-list item too, so "removed
    // from both locations" holds no matter which side triggered the
    // claim. _healingWishlistRewardUids guards against calling
    // _deleteItem more than once for the same item while that async
    // cleanup is still in flight (a poll tick can re-render before it
    // resolves).
    let rewardHtml = "";
    let claimHtml = "";
    if (parsed.rewardItemId) {
      const rewardItem = this._rewardsCatalogById ? this._rewardsCatalogById[parsed.rewardItemId] : undefined;
      const rewardOrphaned = this._rewardsCatalogById && !rewardItem;
      if (rewardOrphaned) {
        if (!this._healingWishlistRewardUids) this._healingWishlistRewardUids = new Set();
        if (!this._healingWishlistRewardUids.has(item.uid)) {
          this._healingWishlistRewardUids.add(item.uid);
          // Deliberately not awaited here (a render function must stay
          // synchronous) - _deleteItem itself calls _render() again once
          // it's actually removed the item, which is what makes this row
          // disappear.
          this._deleteItem(key, item.uid);
        }
      } else {
        const cost = rewardItem ? rewardItem.cost_stars : parsed.rewardCostStars;
        const canClaimReward = !!myId;
        rewardHtml = `
          <div class="wishlist-reward-row">
            <span class="wishlist-reward-badge" title="Redeems this reward and removes it from both the wish list and the Rewards catalog">&#11088; ${Number.isFinite(cost) ? cost : "?"}</span>
            <button type="button" class="wishlist-claim-reward-btn" data-list-key="${this._escAttr(key)}" data-uid="${this._escAttr(item.uid)}" ${canClaimReward ? "" : "disabled"} title="${canClaimReward ? "" : "Log in to claim"}">Claim</button>
          </div>
        `;
      }
    } else {
      const canSeeClaims = this._hasPermission("can_see_wishlist_claims");
      if (!isOwner && canSeeClaims) {
        if (parsed.claimedBy) {
          claimHtml = `<button type="button" class="wishlist-claim-btn claimed${claimedByMe ? " claimed-by-me" : ""}" data-list-key="${this._escAttr(key)}" data-uid="${this._escAttr(item.uid)}" ${claimedByMe ? "" : "disabled"}>${claimedByMe ? "Claimed by you – tap to release" : `Claimed${parsed.claimedByName ? ` by ${this._esc(parsed.claimedByName)}` : ""}`}</button>`;
        } else {
          claimHtml = `<button type="button" class="wishlist-claim-btn" data-list-key="${this._escAttr(key)}" data-uid="${this._escAttr(item.uid)}">Claim</button>`;
        }
      }
      // Only offered once (no reward tied yet) and only to whoever can add
      // straight to the Rewards catalog (_hasPermission's own admin bypass
      // covers an admin automatically) - the backend independently
      // re-checks the exact same permission when this modal actually
      // submits (family_hub/rewards/add_catalog_item), so this is UX only,
      // not the real security boundary.
      if (this._hasPermission("can_add_rewards")) {
        claimHtml += `<button type="button" class="wishlist-tie-reward-btn" data-list-key="${this._escAttr(key)}" data-uid="${this._escAttr(item.uid)}" title="Tie this item to a one-time Rewards catalog entry">&#127873; Add star value</button>`;
      }
    }
    return `
      <div class="todo-item wishlist-item${completed ? " completed" : ""}" data-list-key="${this._escAttr(key)}" data-uid="${this._escAttr(item.uid)}" draggable="${completed ? "false" : "true"}">
        <input type="checkbox" class="todo-check" ${completed ? "checked" : ""} data-list-key="${this._escAttr(key)}" data-uid="${this._escAttr(item.uid)}">
        ${imageHtml}
        <div class="todo-item-text wishlist-item-text">
          <div class="todo-item-summary">${this._esc(item.summary || "(untitled)")}</div>
          ${parsed.note ? `<div class="wishlist-item-note">${this._esc(parsed.note)}</div>` : ""}
          <div class="wishlist-item-row">${linkHtml}${claimHtml}</div>
          ${rewardHtml}
        </div>
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
    // Wish Lists (v1.122.0+): same small tag treatment as the Grocy one
    // above, so a wish-list-flagged column is just as obvious at a glance
    // on the board itself, not only once you open an item (see
    // _isWishlistList).
    const wishlistTag = this._isWishlistList(key) ? `<span class="todo-column-source-tag wishlist-column-tag">Wish List</span>` : "";
    return `
      <div class="todo-column" data-list-key="${this._escAttr(key)}">
        <div class="todo-column-header" style="border-top-color:${color}">
          <span class="todo-column-title">${this._esc(this._listName(descriptor))}</span>
          ${grocyTag}
          ${wishlistTag}
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
    // v1.109.9+: one `.todo-board-row` per chosen stack. Crucially these are
    // still siblings INSIDE the same persistent `.board` element that every
    // drag/drop/click listener is delegated on (see _build) - _render only
    // ever replaces .board's innerHTML, never the .board node itself - so
    // dragging an item from a column in row 1 onto a column in row 2 works
    // with no changes to the drag code at all: _onDragOver/_onDrop resolve
    // their destination purely through e.target.closest(".todo-column-items"),
    // which knows nothing about rows.
    const groups = this._boardRowGroups();
    const multi = groups.length > 1;
    // v1.130.0+: when fit-to-screen is on and there's more than one row,
    // each row gets an inline flex-grow weight (see _rowHeightWeights) so
    // dragging a resize handle can shift height from one row to the next,
    // and a handle goes between each adjacent pair of rows to do the
    // dragging. Resizing rows against each other means nothing when the
    // board is free to just grow with its content (fit-to-screen off) or
    // when there's only one row to begin with, so `weights` - and every
    // handle - simply don't exist in either of those cases.
    const weights = this._fitToScreen() && multi ? this._rowHeightWeights(groups.length) : null;
    return groups
      .map((group, i) => {
        const weightStyle = weights ? ` style="flex:${weights[i]} 1 0"` : "";
        const rowHtml = `<div class="todo-board-row${multi ? " multi-row" : ""}"${weightStyle}>${group.map((d) => this._columnHtml(d)).join("")}</div>`;
        const handleHtml =
          weights && i < groups.length - 1
            ? `<div class="todo-board-row-resize" data-row-index="${i}" title="Drag to resize rows"><span class="todo-board-row-resize-grip"></span></div>`
            : "";
        return rowHtml + handleHtml;
      })
      .join("");
  }
  _render() {
    if (!this._root) return;
    const board = this._root.querySelector(".board");
    board.innerHTML = this._boardHtml();
    // v1.130.0+: toggled on the persistent `.board` node itself (unlike
    // everything _boardHtml returns, which gets thrown away and rebuilt on
    // every render) so the CSS rules that depend on it stay in sync with
    // whatever was last fetched/saved, not just whatever _boardHtml
    // happened to compute for THIS render pass.
    board.classList.toggle("fit-to-screen", this._fitToScreen());
    // Mirrors onto a host attribute too (same [fab-position="card"]-style
    // pattern _registerFabCoordinator already uses) so the CSS that needs
    // to reshape `ha-card`/`.header` - ancestors of `.board`, not
    // descendants - can select off it without needing `:has()`.
    if (this._fitToScreen()) this.setAttribute("fit-screen", "");
    else this.removeAttribute("fit-screen");
    this._syncTodoCardHeight();
  }

  // -- Build / events ----------------------------------------------------------

  _build() {
    this._built = true;
    // v1.126.0+: applied BEFORE attachShadow/the first innerHTML paint -
    // see _applyCachedThemeVarsIfAny's own comment and window.__familyHub
    // ThemeCache's above the class for why this is what actually fixes
    // the household's reported "loads the default theme first" flash.
    this._applyCachedThemeVarsIfAny();
    this.attachShadow({ mode: "open" });
    const root = this.shadowRoot;
    root.innerHTML = `
      <style>${this._css()}</style>
      <ha-card>
        <div class="header">
          <div class="title"></div>
          <div class="actions">
            <button class="kiosk-login-btn" title="Log in as a specific household member on this kiosk display" hidden>&#128274; Login</button>
          </div>
        </div>
        <div class="board todo-board"></div>
      </ha-card>
      <div class="modal-overlay create-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay putaway-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay item-detail-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay tie-reward-modal"><div class="modal-box"></div></div>
      <div class="modal-overlay kiosk-login-overlay">
        <div class="modal-box kiosk-login-box">
          <button type="button" class="detail-close-btn kiosk-login-close" title="Close">&#10005;</button>
          <h2>&#128274; Kiosk login</h2>
          <div class="kiosk-login-user-picker"></div>
          <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" class="kiosk-login-pin-input" placeholder="PIN" />
          <div class="kiosk-login-error"></div>
          <div class="modal-actions">
            <button class="cancel-btn kiosk-login-cancel">Cancel</button>
            <button class="save-btn kiosk-login-submit">Log in</button>
          </div>
        </div>
      </div>
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
    // v1.132.4+: kiosk PIN login - see _onKioskLoginBtnClick's own
    // docstring for the full picture. Byte-identical wiring to Chores/
    // Rewards' own copy.
    root.querySelector(".kiosk-login-btn").addEventListener("click", () => this._onKioskLoginBtnClick());
    root.querySelector(".kiosk-login-close").addEventListener("click", () => this._closeKioskLoginModal());
    root.querySelector(".kiosk-login-cancel").addEventListener("click", () => this._closeKioskLoginModal());
    root.querySelector(".kiosk-login-submit").addEventListener("click", () => this._submitKioskLogin());
    root.querySelector(".kiosk-login-pin-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._submitKioskLogin();
    });
    const board = root.querySelector(".board");
    board.addEventListener("click", (e) => this._onBoardClick(e));
    board.addEventListener("change", (e) => this._onBoardChange(e));
    board.addEventListener("dragstart", (e) => this._onDragStart(e));
    board.addEventListener("dragend", (e) => this._onDragEnd(e));
    board.addEventListener("dragover", (e) => this._onDragOver(e));
    board.addEventListener("dragleave", (e) => this._onDragLeave(e));
    board.addEventListener("drop", (e) => this._onDrop(e));
    board.addEventListener("pointerdown", (e) => this._onRowResizePointerDown(e));
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
    // Wish Lists (v1.122.0+): the Claim/Claimed button and the "View"
    // link both live inside .todo-item-text (see _wishlistItemHtml) but
    // must never fall through to opening the item detail modal below -
    // the link needs its own default browser navigation to actually
    // happen (target="_blank"), and the claim button has its own action.
    const claimBtn = e.target.closest(".wishlist-claim-btn");
    if (claimBtn) {
      if (!claimBtn.disabled) this._toggleWishlistClaim(claimBtn.dataset.listKey, claimBtn.dataset.uid);
      return;
    }
    // v1.132.6+: "tie a wish list item to a reward" - see
    // _openTieRewardModal/_claimWishlistReward's own comments.
    const tieRewardBtn = e.target.closest(".wishlist-tie-reward-btn");
    if (tieRewardBtn) {
      this._openTieRewardModal(tieRewardBtn.dataset.listKey, tieRewardBtn.dataset.uid);
      return;
    }
    const claimRewardBtn = e.target.closest(".wishlist-claim-reward-btn");
    if (claimRewardBtn) {
      if (!claimRewardBtn.disabled) this._claimWishlistReward(claimRewardBtn.dataset.listKey, claimRewardBtn.dataset.uid);
      return;
    }
    if (e.target.closest(".wishlist-item-link")) return;
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

  // -- Row resizing (v1.130.0+) -----------------------------------------------
  // "add a way to todo card to fit to screen and also be able to resize
  // rows." A drag handle between each adjacent pair of stacked rows (see
  // _boardHtml) - only rendered at all when fit-to-screen is on AND there's
  // more than one row, since dragging two rows against each other means
  // nothing when the board is free to just grow with its content, or when
  // there's only one row to divide height with in the first place.
  //
  // Uses pointer events (not the same HTML5 drag-and-drop the item cards
  // use) because this needs live, continuous position feedback while
  // dragging, not a single drop target - and touch support for free, which
  // matters a lot for a card built for a wall-mounted kiosk tablet.
  _onRowResizePointerDown(e) {
    const handle = e.target.closest(".todo-board-row-resize");
    if (!handle) return;
    e.preventDefault();
    const board = this._root.querySelector(".board");
    const rows = Array.from(board.querySelectorAll(".todo-board-row"));
    const i = parseInt(handle.dataset.rowIndex, 10);
    const rowAbove = rows[i];
    const rowBelow = rows[i + 1];
    if (!rowAbove || !rowBelow) return;
    const weights = this._rowHeightWeights(rows.length).slice();
    const startHeightAbove = rowAbove.getBoundingClientRect().height;
    const startHeightBelow = rowBelow.getBoundingClientRect().height;
    const pairHeight = startHeightAbove + startHeightBelow;
    const pairWeight = (weights[i] || 1) + (weights[i + 1] || 1);
    // Below this, a row reads as broken (its own header barely fits, let
    // alone anything under it) - same floor a household dragging a handle
    // to one extreme would hit on any other app with resizable panes.
    const MIN_ROW_PX = 64;
    this._rowResizeDrag = {
      handle, weights, i, startY: e.clientY, startHeightAbove, pairHeight, pairWeight,
      minHeight: Math.min(MIN_ROW_PX, pairHeight / 2),
    };
    handle.classList.add("dragging");
    handle.setPointerCapture(e.pointerId);
    if (!this._boundRowResizeMove) this._boundRowResizeMove = this._onRowResizePointerMove.bind(this);
    if (!this._boundRowResizeUp) this._boundRowResizeUp = this._onRowResizePointerUp.bind(this);
    window.addEventListener("pointermove", this._boundRowResizeMove);
    window.addEventListener("pointerup", this._boundRowResizeUp);
    window.addEventListener("pointercancel", this._boundRowResizeUp);
  }
  _onRowResizePointerMove(e) {
    const drag = this._rowResizeDrag;
    if (!drag) return;
    const deltaY = e.clientY - drag.startY;
    const rawHeightAbove = drag.startHeightAbove + deltaY;
    const clampedHeightAbove = Math.max(drag.minHeight, Math.min(drag.pairHeight - drag.minHeight, rawHeightAbove));
    const ratioAbove = drag.pairHeight > 0 ? clampedHeightAbove / drag.pairHeight : 0.5;
    const weightAbove = drag.pairWeight * ratioAbove;
    const weightBelow = drag.pairWeight - weightAbove;
    drag.liveWeights = drag.weights.slice();
    drag.liveWeights[drag.i] = weightAbove;
    drag.liveWeights[drag.i + 1] = weightBelow;
    const board = this._root.querySelector(".board");
    const rows = board.querySelectorAll(".todo-board-row");
    if (rows[drag.i]) rows[drag.i].style.flex = `${weightAbove} 1 0`;
    if (rows[drag.i + 1]) rows[drag.i + 1].style.flex = `${weightBelow} 1 0`;
  }
  _onRowResizePointerUp() {
    const drag = this._rowResizeDrag;
    if (!drag) return;
    const finalWeights = (drag.liveWeights || drag.weights).map((w) => Math.max(0.1, Math.round(w * 100) / 100));
    this._endRowResizeDrag();
    this._backendRowHeights = finalWeights;
    this._persistRowHeights(finalWeights);
  }
  // Tears down whatever a resize drag left behind - the window-level
  // pointermove/pointerup listeners (pointer capture alone isn't enough,
  // since the drag started on an element _render is free to throw away and
  // rebuild mid-drag on a poll tick) and the handle's own "dragging" look.
  // Called on a normal pointerup/pointercancel AND from disconnectedCallback,
  // so a card that gets torn down mid-drag (switching dashboard views)
  // never leaves a stray window listener behind.
  _endRowResizeDrag() {
    const drag = this._rowResizeDrag;
    if (drag && drag.handle) drag.handle.classList.remove("dragging");
    this._rowResizeDrag = null;
    if (this._boundRowResizeMove) window.removeEventListener("pointermove", this._boundRowResizeMove);
    if (this._boundRowResizeUp) {
      window.removeEventListener("pointerup", this._boundRowResizeUp);
      window.removeEventListener("pointercancel", this._boundRowResizeUp);
    }
  }
  // The concrete Grocy list-id selection to send on a save that isn't
  // driven by the List(s) tab's own checkboxes (i.e. this file's own
  // _persistRowHeights) - see _grocySelectedListIds for why its own `null`
  // ("every Grocy list, via the legacy includeGrocyShoppingLists flag") has
  // to be resolved into a concrete array here: family_hub/
  // set_todo_card_config's own `grocy_list_ids` is a REQUIRED plain-replace
  // field, so sending an empty array in place of null would silently clear
  // that selection down to nothing instead of leaving it alone.
  _currentGrocyListIdsForSave() {
    if (Array.isArray(this._backendGrocyListIds)) return this._backendGrocyListIds;
    const resolved = this._grocySelectedListIds();
    if (Array.isArray(resolved)) return resolved;
    return (this._grocyLists || []).map((l) => l.id);
  }
  // Persists the row-height weights a resize drag just settled on, through
  // the very same family_hub/set_todo_card_config store the List(s) tab's
  // own Save uses - see _saveListsTab's own comment for why this can't go
  // through setConfig/config-changed instead. Applied optimistically to
  // this._backendRowHeights (by the caller, _onRowResizePointerUp) before
  // this even resolves, same "board updates instantly, network call
  // catches up" pattern as every other save in this file.
  async _persistRowHeights(weights) {
    if (!this._hass) return;
    try {
      await this._hass.connection.sendMessagePromise({
        type: "family_hub/set_todo_card_config",
        entities: this._selectedTodoEntities(),
        grocy_list_ids: this._currentGrocyListIdsForSave(),
        rows: this._boardRows(),
        fit_to_screen: this._fitToScreen(),
        row_heights: weights,
        card_id: this._config.cardId,
      });
    } catch (e) {
    }
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
      <label class="f-wishlist-link-label">Link (optional)<input type="url" class="f-wishlist-link" placeholder="https://…"></label>
      <label class="f-wishlist-image-label">Image URL (optional)<input type="url" class="f-wishlist-image" placeholder="https://…"></label>
      <div class="f-wishlist-image-controls-wrap wishlist-image-controls">
        <label class="wishlist-upload-btn">Upload photo…<input type="file" accept="image/*" class="f-wishlist-image-file" hidden></label>
        <img class="wishlist-image-preview" alt="" hidden>
        <span class="wishlist-image-upload-status"></span>
      </div>
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
    const wishlistLinkLabel = panel.querySelector(".f-wishlist-link-label");
    const wishlistImageLabel = panel.querySelector(".f-wishlist-image-label");
    const wishlistImageControlsWrap = panel.querySelector(".f-wishlist-image-controls-wrap");
    // Grocy shopping list rows have no due date - hide the field entirely
    // once a Grocy list is selected, rather than showing a control that
    // would silently be ignored on submit (see _addItem). Same for a
    // todo.* list whose own entity doesn't advertise due-date support
    // (see the TODO_FEATURE_* comment up top) - showing the field there
    // used to throw a hard error on submit instead of being ignored. Link/
    // Image (v1.122.0+) show only when the selected list is itself
    // flagged as a wish list (see _isWishlistList) AND supports
    // description at all, since that's where they're embedded.
    const syncFieldVisibility = () => {
      const selected = listSelect.options[listSelect.selectedIndex];
      const key = selected && selected.value;
      const isGrocy = !!(selected && selected.dataset.kind === "grocy");
      dueLabel.hidden = isGrocy || !(key && this._todoEntitySupportsDueDate(key));
      const showWishlistFields = !isGrocy && key && this._isWishlistList(key) && this._todoEntitySupportsDescription(key);
      wishlistLinkLabel.hidden = !showWishlistFields;
      wishlistImageLabel.hidden = !showWishlistFields;
      wishlistImageControlsWrap.hidden = !showWishlistFields;
    };
    syncFieldVisibility();
    listSelect.addEventListener("change", syncFieldVisibility);
    // Upload a photo (v1.124.0+) - see _wireWishlistImageUpload's own
    // comment for why this writes straight into the same Image URL text
    // input rather than a separate field.
    this._wireWishlistImageUpload(
      panel.querySelector(".f-wishlist-image-file"),
      panel.querySelector(".f-wishlist-image"),
      panel.querySelector(".wishlist-image-preview"),
      panel.querySelector(".wishlist-image-upload-status")
    );
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
      const wishlistExtra = wishlistLinkLabel.hidden ? undefined : {
        link: panel.querySelector(".f-wishlist-link").value.trim(),
        image: panel.querySelector(".f-wishlist-image").value.trim(),
      };
      this._addItem(listKey, summary, due || null, wishlistExtra);
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
        <div class="settings-check-row settings-todo-row">
          <label class="settings-check-row-main">
            <input type="checkbox" class="settings-todo-check" value="${this._escAttr(id)}" ${selectedEntities.has(id) ? "checked" : ""}>
            <span>${this._esc(this._todoEntityLabel(id))}</span>
          </label>
          <label class="settings-wishlist-check-wrap" title="Show this list as a wish list - image, link and description per item, with claiming.">
            <input type="checkbox" class="settings-wishlist-check" value="${this._escAttr(id)}" ${this._isWishlistList(id) ? "checked" : ""}>
            <span>Wish list</span>
          </label>
        </div>`
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

    const currentRows = this._boardRows();
    const layoutBtnsHtml = Array.from({ length: TODO_CARD_MAX_BOARD_ROWS }, (_, i) => i + 1)
      .map(
        (n) =>
          `<button type="button" class="layout-btn${n === currentRows ? " active" : ""}" data-rows="${n}">${n === 1 ? "1 row" : `${n} rows`}</button>`
      )
      .join("");

    panel.innerHTML = `
      <div class="settings-section">
        <div class="settings-section-title">To-Do Lists</div>
        <div class="settings-check-list">${todoRowsHtml}</div>
      </div>
      <div class="settings-section">
        <div class="settings-section-title">Grocy Shopping Lists</div>
        <div class="settings-check-list">${grocySectionHtml}</div>
      </div>
      <div class="settings-section layout-section">
        <div class="settings-section-title">Layout</div>
        <div class="layout-row">${layoutBtnsHtml}</div>
        <div class="layout-hint"></div>
        <label class="settings-check-row fit-screen-row">
          <input type="checkbox" class="settings-fit-screen-check" ${this._fitToScreen() ? "checked" : ""}>
          <span>Fit to screen - the card fills the space below it instead of growing the page; each list scrolls on its own${currentRows > 1 ? ", and rows can be resized by dragging the handle between them" : ""}.</span>
        </label>
      </div>
      <div class="modal-actions">
        <button class="cancel-btn lists-cancel-btn">Cancel</button>
        <button class="save-btn lists-save-btn">Save</button>
      </div>
      <div class="form-error"></div>
    `;
    // v1.109.9+: the layout picker is a small row of preset buttons rather
    // than a number stepper. Four options is few enough that presets show
    // every choice at once (no hunting up and down a counter to find out
    // what's available), and a segmented "one active option" row is this
    // app's existing convention for a short enumerated choice - compare
    // family-week-calendar-card.js's own On/Off profile toggles and view
    // pickers, which use the same .active-on-one-button shape. The draft
    // lives on the panel until Save, like every other control in this tab.
    this._listsTabRowsDraft = this._boardRows();
    // v1.130.0+: same draft-until-Save pattern as the row count above - the
    // hint text mentioning row-dragging only makes sense once BOTH this and
    // the row count are actually 2+, so it's re-rendered off the live
    // checkbox state rather than baked into the innerHTML once above.
    this._listsTabFitScreenDraft = this._fitToScreen();
    const syncFitScreenHint = () => {
      const hint = panel.querySelector(".fit-screen-row span");
      const rows = this._listsTabRowsDraft || 1;
      hint.textContent = `Fit to screen - the card fills the space below it instead of growing the page; each list scrolls on its own${rows > 1 ? ", and rows can be resized by dragging the handle between them" : ""}.`;
    };
    const syncLayoutUi = () => {
      panel.querySelectorAll(".layout-btn").forEach((btn) => {
        btn.classList.toggle("active", parseInt(btn.dataset.rows, 10) === this._listsTabRowsDraft);
      });
      panel.querySelector(".layout-hint").textContent = this._layoutHintText(this._listsTabRowsDraft);
      syncFitScreenHint();
    };
    panel.querySelectorAll(".layout-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._listsTabRowsDraft = parseInt(btn.dataset.rows, 10) || 1;
        syncLayoutUi();
      });
    });
    panel.querySelector(".settings-fit-screen-check").addEventListener("change", (e) => {
      this._listsTabFitScreenDraft = !!e.target.checked;
    });
    syncLayoutUi();
    panel.querySelector(".lists-cancel-btn").addEventListener("click", () => overlay.classList.remove("open"));
    panel.querySelector(".lists-save-btn").addEventListener("click", () => this._saveListsTab(panel, overlay));
  }
  // Describes the chosen layout in terms of the lists actually selected
  // right now ("6 lists across 2 rows - 3 per row"), rather than an
  // abstract description - the useful question when picking is "what will
  // MY board look like," and with a live count that's answerable.
  _layoutHintText(rows) {
    const total = this._listDescriptors().length;
    if (rows <= 1) return total ? `All ${total} list${total === 1 ? "" : "s"} side by side in one row.` : "All lists side by side in one row.";
    if (!total) return `Lists split across ${rows} stacked rows.`;
    const perRow = Math.ceil(total / rows);
    const usedRows = Math.ceil(total / perRow);
    if (usedRows < rows) {
      return `${total} list${total === 1 ? "" : "s"} only fill ${usedRows} row${usedRows === 1 ? "" : "s"} - pick more lists to use all ${rows}.`;
    }
    return `${total} lists across ${rows} rows - up to ${perRow} per row.`;
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
    // v1.109.9+: board layout, saved through the very same store as the
    // list selection (and in the same round trip) - deliberately NOT
    // through the card's Lovelace config, for exactly the reason v146.5
    // moved the list selection off it: a config-changed event dispatched
    // from a plain, non-editing view is heard by nothing, so the setting
    // would silently evaporate on the next page reload.
    const rows = Math.max(1, Math.min(TODO_CARD_MAX_BOARD_ROWS, this._listsTabRowsDraft || 1));
    // Wish Lists (v1.122.0+) - only the entities whose checkbox actually
    // CHANGED get a family_hub/set_wishlist_flag call (comparing against
    // this._wishlistConfig, the last-fetched state) - this is a
    // household-wide flag, not this card instance's own, so there's no
    // reason to re-send it for every entity on every Save. Applied
    // optimistically, same as _backendEntities/_backendGrocyListIds just
    // below, so the board's wish-list rendering updates the instant Save
    // is clicked.
    const wishlistChecked = new Set(Array.from(panel.querySelectorAll(".settings-wishlist-check:checked")).map((el) => el.value));
    const wishlistChanges = [];
    panel.querySelectorAll(".settings-wishlist-check").forEach((el) => {
      const id = el.value;
      const isWishlist = wishlistChecked.has(id);
      if (isWishlist !== this._isWishlistList(id)) wishlistChanges.push({ entity_id: id, is_wishlist: isWishlist });
    });
    wishlistChanges.forEach(({ entity_id, is_wishlist }) => {
      if (is_wishlist) {
        this._wishlistConfig[entity_id] = { ownerUserId: this._myUserId() };
      } else {
        delete this._wishlistConfig[entity_id];
      }
    });
    // v1.130.0+: "Fit to screen" is saved through this very same round trip.
    // If the row count actually changed, any previously-saved row_heights
    // no longer line up with the new row count, so they're cleared
    // optimistically here too - mirroring the backend's own GET-time
    // self-healing (_ws_get_todo_card_config only ever returns row_heights
    // when its length matches the current row count).
    const fitToScreen = !!this._listsTabFitScreenDraft;
    if (rows !== this._backendBoardRows) this._backendRowHeights = null;
    this._backendEntities = entities;
    this._backendGrocyListIds = grocyListIds;
    this._backendBoardRows = rows;
    this._backendFitToScreen = fitToScreen;
    overlay.classList.remove("open");
    this._render();
    try {
      await this._hass.connection.sendMessagePromise({
        type: "family_hub/set_todo_card_config",
        entities,
        grocy_list_ids: grocyListIds,
        rows,
        fit_to_screen: fitToScreen,
        card_id: this._config.cardId,
      });
    } catch (e) {
    }
    await Promise.all(
      wishlistChanges.map(({ entity_id, is_wishlist }) =>
        this._hass.connection.sendMessagePromise({ type: "family_hub/set_wishlist_flag", entity_id, is_wishlist }).catch(() => {})
      )
    );
    if (wishlistChanges.length) await this._fetchWishlistConfig();
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
    // Wish Lists (v1.122.0+) - only offered on a todo.* item whose list is
    // flagged AND whose entity actually supports description (link/image
    // are embedded straight into that same field - see WISHLIST_DATA_
    // MARKER's own comment). The Description field itself shows/edits
    // just the plain note text (parsed.note), never the raw field with
    // its JSON tail - see the save handler below for how the two are
    // recombined, carrying any existing claim data through untouched.
    const isWishlist = !isGrocy && this._isWishlistList(key);
    const wishlistParsed = isWishlist ? _parseWishlistDescription(item.description || "") : null;

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
        : `<label ${supportsDescription ? "" : "hidden"}>Description<textarea class="detail-description" rows="4" placeholder="Add a description…">${this._esc(isWishlist ? wishlistParsed.note : (item.description || ""))}</textarea></label>
           ${isWishlist ? `
           <label>Link<input type="url" class="detail-wishlist-link" placeholder="https://…" value="${this._escAttr(wishlistParsed.link)}"></label>
           <label>Image URL<input type="url" class="detail-wishlist-image" placeholder="https://…" value="${this._escAttr(wishlistParsed.image)}"></label>
           <div class="wishlist-image-controls">
             <label class="wishlist-upload-btn">Upload photo…<input type="file" accept="image/*" class="detail-wishlist-image-file" hidden></label>
             <img class="wishlist-image-preview" alt="" src="${this._escAttr(wishlistParsed.image)}" ${wishlistParsed.image ? "" : "hidden"}>
             <span class="wishlist-image-upload-status"></span>
           </div>` : ""}
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
    if (isWishlist) {
      this._wireWishlistImageUpload(
        box.querySelector(".detail-wishlist-image-file"),
        box.querySelector(".detail-wishlist-image"),
        box.querySelector(".wishlist-image-preview"),
        box.querySelector(".wishlist-image-upload-status")
      );
    }
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
        let description = supportsDescription ? box.querySelector(".detail-description").value : undefined;
        if (isWishlist && supportsDescription) {
          // Recombine the edited note with the link/image just typed and
          // whatever claim data this item already had (never editable
          // from here - only _toggleWishlistClaim ever changes that) -
          // see _buildWishlistDescription/_parseWishlistDescription.
          description = _buildWishlistDescription(box.querySelector(".detail-description").value, {
            link: box.querySelector(".detail-wishlist-link").value.trim(),
            image: box.querySelector(".detail-wishlist-image").value.trim(),
            claimedBy: wishlistParsed.claimedBy,
            claimedByName: wishlistParsed.claimedByName,
            // v1.132.6+: a reward tie (see _openTieRewardModal) is never
            // editable from this plain note/link/image editor - preserve
            // it through the rebuild rather than silently dropping it.
            rewardItemId: wishlistParsed.rewardItemId,
            rewardCostStars: wishlistParsed.rewardCostStars,
          });
        }
        this._updateTodoItemDetails(key, uid, {
          title: newTitle,
          originalTitle,
          description,
          dueDate: supportsDueDate ? (box.querySelector(".detail-due").value || null) : undefined,
        });
      }
      overlay.classList.remove("open");
    });
    overlay.classList.add("open");
  }

  _css() {
    return `
      /* v1.110.7+: position:relative is the containing block .add-todo-fab
         needs when [fab-position="card"] switches it to position:absolute. */
      :host { display: block; position: relative; font-family: 'Varela Round', sans-serif; }
      ha-card { background: var(--fc-bg); color: var(--fc-text); padding: 14px; }
      .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
      .title { font-size: 18px; font-weight: 800; }
      .actions { display: flex; gap: 8px; }
      .board { display: block; }
      /* v1.130.0+: "fit to screen" - see _fitToScreen/_syncTodoCardHeight.
         Off by default (no [fit-screen] attribute, no .fit-to-screen
         class), in which case every rule below is simply inert and the
         card looks exactly like it always has: it grows with its content
         and the dashboard page scrolls. Once on, _syncTodoCardHeight pins
         :host's own height to whatever viewport is left below it, and
         these rules turn that fixed height into a flex chain all the way
         down to each list's own items, so every column scrolls on its own
         instead of the page having anything left to scroll. */
      :host([fit-screen]) ha-card { display: flex; flex-direction: column; height: 100%; box-sizing: border-box; }
      :host([fit-screen]) .header { flex: 0 0 auto; }
      .board.fit-to-screen { flex: 1 1 auto; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
      .board.fit-to-screen .todo-board-row { flex: 1 1 0; min-height: 0; }
      /* Only multi-row loses the single-row rule's own horizontal scroll -
         evenly-shared columns never need it - a single fit-to-screen row
         keeps scrolling sideways if there are more columns than fit, same
         as it always has. */
      .board.fit-to-screen .todo-board-row.multi-row { overflow: hidden; }
      .board.fit-to-screen .todo-column { height: 100%; overflow-y: auto; }
      .board.fit-to-screen .todo-column-header { position: sticky; top: 0; background: var(--fc-surface2); z-index: 1; }
      /* v1.130.0+: the drag handle between two adjacent rows - only ever
         rendered (see _boardHtml) when fit-to-screen is on AND there's
         more than one row, since dragging two rows against each other
         means nothing otherwise. touch-action:none stops a touchscreen
         from also trying to scroll the page while dragging one. */
      .todo-board-row-resize { flex: 0 0 auto; height: 14px; margin: -3px 0; display: flex; align-items: center; justify-content: center; cursor: row-resize; touch-action: none; }
      .todo-board-row-resize-grip { width: 48px; height: 5px; border-radius: 3px; background: var(--fc-border); transition: background-color 0.1s ease; }
      .todo-board-row-resize:hover .todo-board-row-resize-grip,
      .todo-board-row-resize.dragging .todo-board-row-resize-grip { background: var(--fc-accent); }
      .empty-state { font-size: 12px; color: var(--fc-text-secondary); padding: 8px 2px; }
      /* v1.109.9+: the board is now one or more stacked rows (see
         _boardRowGroups). A SINGLE row is untouched from every version
         before this - one scrolling line of fixed-ish-width columns - so
         the default layout is byte-for-byte what it always was. Only when
         the household actually picks 2+ stacks does .multi-row kick in and
         switch the columns to sharing the width evenly, which is the whole
         point of stacking: two genuinely tiled rows, not two independently
         side-scrolling strips (which is what leaving overflow-x:auto on
         would have produced, and reads as broken). */
      /* v1.109.9+: Layout picker in the FAB's List(s) tab - a segmented
         row of presets, one active, matching this app's existing shape for
         a short enumerated choice. */
      .layout-row { display: flex; flex-wrap: wrap; gap: 6px; }
      .layout-btn { flex: 1 1 auto; border: 2px solid var(--fc-border, rgba(0,0,0,0.12)); border-radius: 10px; padding: 8px 10px; font-size: 12px; font-weight: 700; background: var(--fc-surface2); color: var(--fc-text); cursor: pointer; }
      .layout-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      .layout-hint { font-size: 11px; color: var(--fc-text-secondary); margin-top: 6px; }
      .todo-board { display: flex; flex-direction: column; gap: 12px; }
      .todo-board-row { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 6px; }
      .todo-board-row.multi-row { overflow-x: visible; }
      .todo-board-row.multi-row > .todo-column { flex: 1 1 0; min-width: 0; max-width: none; }
      .todo-column { flex: 1 1 240px; min-width: 220px; max-width: 340px; display: flex; flex-direction: column; background: var(--fc-surface2); border-radius: 12px; padding: 8px; box-shadow: var(--fc-shadow, 0 2px 5px rgba(0,0,0,0.06)); }
      .todo-column-header { display: flex; align-items: center; gap: 6px; padding: 4px 4px 8px; border-top: 4px solid; border-radius: 3px 3px 0 0; margin: -8px -8px 6px; padding-top: 8px; padding-left: 8px; padding-right: 8px; }
      .todo-column-title { font-weight: 800; font-size: 13px; flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
      .todo-column-source-tag { flex: 0 0 auto; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; background: var(--fc-accent2); color: var(--fc-accent-text); border-radius: 6px; padding: 1px 6px; }
      /* Wish Lists (v1.122.0+): its own color, distinct from the Grocy
         tag's, so the two are never confused at a glance when a board has
         both kinds of tagged column. */
      .wishlist-column-tag { background: var(--fc-accent3); }
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
      /* v1.110.4+: bottom offset by --fh-fab-offset - see family-hub-chores-card.js's identical comment. */
      .add-todo-fab { position: fixed; right: 18px; bottom: calc(18px + var(--fh-fab-offset, 0px)); z-index: 900; width: 56px; height: 56px; border-radius: 50%; border: none; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 28px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(58,53,44,0.35); transition: transform 0.15s ease, bottom 0.15s ease; }
      .add-todo-fab:active { transform: scale(0.94); }
      /* v1.110.7+: fab_position: "card" - see family-hub-chores-card.js's
         identical .add-chore-fab rule for the same mechanism. */
      :host([fab-position="card"]) .add-todo-fab { position: absolute; bottom: 18px; }
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
      /* Wish Lists (v1.122.0+): each to-do entity row in the List(s) tab
         gets a second, smaller "Wish list" checkbox alongside its main
         show/hide one - see _renderListsTab. Both classes on the labels
         below deliberately outrank the generic .modal-box label rule
         (display:block/margin:8px 0) so they stay a tight inline row
         rather than stacking. */
      .settings-todo-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 2px 6px; border-radius: 6px; }
      .settings-todo-row:hover { background: var(--fc-surface-alt); }
      .settings-todo-row .settings-check-row-main { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; margin: 4px 0; flex: 1 1 auto; min-width: 0; }
      .settings-todo-row .settings-wishlist-check-wrap { display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; margin: 4px 0; color: var(--fc-text-secondary); white-space: nowrap; flex: 0 0 auto; }
      .settings-todo-row input { width: auto; margin: 0; accent-color: var(--fc-accent); }
      /* Wish Lists (v1.122.0+): item rendering on the board itself - see
         _wishlistItemHtml. */
      .wishlist-item { align-items: flex-start; }
      .wishlist-item-image { flex: 0 0 auto; width: 40px; height: 40px; border-radius: 8px; object-fit: cover; background: var(--fc-surface-alt); }
      .wishlist-item-image-placeholder { display: flex; align-items: center; justify-content: center; font-size: 18px; }
      .wishlist-item-text { display: flex; flex-direction: column; gap: 2px; }
      .wishlist-item-note { font-size: 11px; color: var(--fc-text-secondary); overflow-wrap: anywhere; }
      .wishlist-item-row { display: flex; align-items: center; gap: 8px; margin-top: 2px; flex-wrap: wrap; }
      .wishlist-item-link { font-size: 11px; font-weight: 700; color: var(--fc-accent); text-decoration: none; }
      .wishlist-item-link:hover { text-decoration: underline; }
      .wishlist-claim-btn { border: none; border-radius: 8px; padding: 3px 8px; font-size: 10px; font-weight: 800; cursor: pointer; background: var(--fc-accent2); color: var(--fc-accent-text); }
      .wishlist-claim-btn.claimed { background: var(--fc-surface-alt); color: var(--fc-text-secondary); cursor: default; }
      .wishlist-claim-btn.claimed-by-me { background: var(--fc-accent3); color: var(--fc-accent-text); cursor: pointer; }
      /* v1.132.6+: "tie a wish list item to a reward" - see
         _wishlistItemHtml/_openTieRewardModal/_claimWishlistReward. */
      .wishlist-tie-reward-btn { border: none; border-radius: 8px; padding: 3px 8px; font-size: 10px; font-weight: 700; cursor: pointer; background: var(--fc-surface-alt); color: var(--fc-text-secondary); }
      .wishlist-reward-row { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
      .wishlist-reward-badge { font-size: 11px; font-weight: 800; color: var(--fc-text); background: var(--fc-surface-alt); border-radius: 8px; padding: 3px 8px; }
      .wishlist-claim-reward-btn { border: none; border-radius: 8px; padding: 3px 10px; font-size: 10px; font-weight: 800; cursor: pointer; background: var(--fc-accent2); color: var(--fc-accent-text); }
      .wishlist-claim-reward-btn:disabled { background: var(--fc-surface-alt); color: var(--fc-text-secondary); cursor: default; }
      .tie-reward-modal .modal-box label { display: block; margin-bottom: 10px; font-size: 13px; font-weight: 700; color: var(--fc-text); }
      .tie-reward-modal .modal-box input { display: block; width: 100%; box-sizing: border-box; margin-top: 4px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 14px; font-family: inherit; }
      /* Upload a photo (v1.124.0+) - the Add/item detail modals' Upload
         photo control, see _wireWishlistImageUpload. */
      .wishlist-image-controls { display: flex; align-items: center; gap: 10px; margin: 8px 0; }
      .wishlist-upload-btn { display: inline-flex; align-items: center; margin: 0; border: 2px dashed var(--fc-border, rgba(0,0,0,0.2)); border-radius: 10px; padding: 6px 12px; font-size: 12px; font-weight: 700; color: var(--fc-text-secondary); cursor: pointer; }
      .wishlist-upload-btn:hover { border-color: var(--fc-accent); color: var(--fc-accent); }
      .wishlist-image-preview { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; background: var(--fc-surface-alt); }
      .wishlist-image-upload-status { font-size: 11px; color: var(--fc-text-secondary); }
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
      /* v1.132.4+: kiosk PIN login - byte-identical to family-hub-chores-
         card.js/family-hub-rewards-card.js's own copy of these rules. */
      .detail-close-btn { border: none; background: none; color: var(--fc-text-secondary); font-size: 16px; cursor: pointer; line-height: 1; padding: 4px; }
      .kiosk-login-btn { border: 1px solid var(--fc-border); border-radius: 12px; padding: 6px 12px; font-size: 12px; font-weight: 700; background: var(--fc-surface-alt); color: var(--fc-text); cursor: pointer; }
      .kiosk-login-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      .kiosk-login-box { max-width: 360px; }
      .kiosk-login-user-picker { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
      .kiosk-login-user-btn { border: 2px solid var(--fc-border); border-radius: 12px; padding: 10px 14px; font-weight: 700; background: var(--fc-card); color: var(--fc-text); cursor: pointer; }
      .kiosk-login-user-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      .kiosk-login-empty { color: var(--fc-text-secondary); font-size: 13px; }
      .kiosk-login-pin-input { width: 100%; box-sizing: border-box; font-size: 22px; letter-spacing: 6px; text-align: center; padding: 10px; border-radius: 10px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); }
      .kiosk-login-error { color: #b3462c; font-size: 13px; min-height: 18px; margin-top: 6px; }
      @media (max-width: 700px) {
        .todo-board-row { gap: 8px; }
        .todo-column { flex: 0 0 82vw; min-width: 0; }
        /* On a phone, stacking is undone deliberately: at this width a
           column is already a full screen wide (82vw, swipe for the next),
           so tiling 2-4 of them per row would give slivers nothing fits in.
           The chosen row COUNT is still honoured - the lists stay grouped
           into the same stacks, in the same order - each stack just goes
           back to being its own side-scrolling line, exactly like the
           single-row layout. Nothing about the saved setting changes; this
           is purely how it renders narrow, keeping the card's existing
           small-display behavior intact. */
        .todo-board-row.multi-row { overflow-x: auto; }
        .todo-board-row.multi-row > .todo-column { flex: 0 0 82vw; max-width: none; }
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
    if (!this._themeOptions) this._fetchThemeOptions();
  }
  // v1.111.0+: per-card Theme override options - duplicated (not shared/
  // imported) from family-hub-goals-card.js's own editor, same
  // "independently loaded resources duplicate small helpers" convention.
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
      entities: this._config.entities,
      include_grocy_shopping_lists: this._config.include_grocy_shopping_lists,
      fab_position: this._config.fab_position === "card" ? "card" : "dashboard",
      theme_override: (typeof this._config.theme_override === "string") ? this._config.theme_override : "",
    };
  }
  _schema() {
    const base = FamilyHubTodoCard.getConfigForm().schema;
    return base.concat([
      {
        name: "theme_override",
        selector: { select: { mode: "dropdown", options: this._themeOptions || [{ value: "", label: "Use device settings (default)" }] } },
      },
    ]);
  }
  _render() {
    const { computeLabel } = FamilyHubTodoCard.getConfigForm();
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
        : undefined
    );
    form.data = this._formData();
    if (this._hass) form.hass = this._hass;
    form.addEventListener("value-changed", (e) => {
      e.stopPropagation();
      // ha-form's own emitted value only ever carries the schema's fields -
      // merge it into a COPY of the full config (preserving grocy_list_ids
      // and anything else this card owns) rather than replacing the config
      // outright.
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
