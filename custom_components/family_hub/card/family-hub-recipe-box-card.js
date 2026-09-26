// Family Hub Recipe Box card (v1.110.6+) - "Create a card for the menu box in
// case people want to see it as its own tab of the dashboard, it should use
// the same exact code from the modal so changing the modal changes the
// card."
//
// "The menu box" = the Recipe Box ("Loved Dishes") modal on
// family-week-calendar-card.js. There is no literal "menu box" anywhere in
// this codebase to key off of, so this was resolved by matching intent: the
// Recipe Box is the one self-contained, searchable/filterable/sortable
// "box" of saved dishes a household would plausibly want pinned open as its
// own dashboard tab - the week/month meal-plan grid isn't a modal at all
// (it's the calendar card's whole body), and the day/meal editor edits one
// specific date/block slot, which doesn't make sense as a persistent tab.
// README.md's own long-standing feature name, "Recipe box (\"Loved
// Dishes\")", is the same identification.
//
// "Use the same exact code from the modal so changing the modal changes the
// card": Lovelace custom cards are independently-loaded resources, not ES
// modules - there's no import/export between two card files, so the two
// classes below and FamilyWeekCalendarCard can't literally share a file.
// What they CAN share, and do, is the actual Function objects the Recipe
// Box's methods are made of: window.__familyHubRecipeBoxShared (defined
// once, right below) holds every one of those method bodies exactly once in
// the whole source; both this card's FamilyHubRecipeBoxCard.prototype and
// family-week-calendar-card.js's FamilyWeekCalendarCard.prototype get them
// via Object.assign(SomeClass.prototype, window.__familyHubRecipeBoxShared)
// - a straight reference copy of the SAME function objects onto both
// prototypes, not a mixin re-evaluated per class (which would produce
// textually-identical but reference-DISTINCT closures). That means e.g.
// FamilyWeekCalendarCard.prototype._renderLoved ===
// FamilyHubRecipeBoxCard.prototype._renderLoved is literally true at
// runtime - proven by test_recipe_box_card_sharing.js, which asserts that
// for every shared method - so editing the Recipe Box's logic in either
// file's copy of the shared block changes both cards identically, and there
// is exactly one place (per file, byte-for-byte identical between the two
// files) where the actual behavior is written.
//
// What this card does NOT share with the modal (each side keeps its own,
// documented on window.__familyHubRecipeBoxShared's own comment below):
// add/editing a dish uses a new, separate, small mini-modal here rather than
// the calendar card's .edit-overlay (which is fused with day/meal-plan
// editing there and isn't cleanly separable) - it calls the SAME shared
// _upsertDish/_deleteDish to actually write the change, so the underlying
// data behavior is still identical, only the editing form's markup differs.
// "Add from Grocy" and "Import from a link" (the calendar card's own Grocy
// recipe SEARCH picker) are still out of scope for this card - there's no
// "add a new dish by browsing Grocy" flow here, only viewing/editing dishes
// already in the Recipe Box.
// The screensaver idle-timer reset the modal does on open/close is a no-op
// here (this card has no screensaver feature to protect).
// v1.118.0+: the full in-card Grocy Recipe Viewer is NOT out of scope
// anymore - household report: "the recipe box card tries to send you to the
// external grocy link for recipes. this needs to use the internal recipe
// viewer." Tapping a Grocy-linked dish's recipe link here now opens the
// exact same live viewer (fetches the recipe fresh from Grocy, lets you
// scale servings, mark it consumed, etc.) as the calendar card's own -
// shared via window.__familyHubRecipeBoxShared, see that block's own
// comment. A dish with no grocyRecipeId (a plain link, or none at all)
// behaves exactly as before: opens the plain link in a new tab, or nothing.
//
// Config is deliberately minimal - just an optional title, same as every
// other standalone Family Hub card with no backend storage decisions of its
// own to make (Active Timers, Screen Saver). The Recipe Box's data
// (family_hub/get_recipes|set_recipes, get_suggestions|set_suggestions) is
// already backend/Store-backed and household-wide, not per-card-instance,
// so there's nothing else this card needs configured - it shows the exact
// same Recipe Box every calendar card on the same Home Assistant instance
// does.

// -------------------------------------------------------------------------
// Recipe Box ("Loved Dishes") shared logic (v1.110.6+) - "the menu box" the
// household asked to also see as its own dashboard tab. There is no literal
// "menu box" anywhere else in this codebase; this modal - searchable/
// filterable/sortable, add/edit/delete a dish, heart it, suggest it for a
// meal - is the only self-contained thing that reads as a "box" someone
// would want pinned open as its own tab, as opposed to the week/month grid
// (not a modal at all) or the day/meal editor (edits one specific slot, not
// something you'd browse as a tab). See README.md's own long-standing
// "Recipe box (\"Loved Dishes\")" feature entry for the same name.
//
// This object is the ONE place these methods' bodies live. Both this card's
// own FamilyWeekCalendarCard.prototype AND the new standalone
// family-hub-recipe-box-card.js's FamilyHubRecipeBoxCard.prototype get them
// via `Object.assign(SomeClass.prototype, window.__familyHubRecipeBoxShared)`
// after their own class bodies - not a mixin function re-evaluated per class
// (which would create textually-identical but reference-DISTINCT closures),
// but a single object literal assigned by reference to both prototypes, so
// e.g. FamilyWeekCalendarCard.prototype._renderLoved ===
// FamilyHubRecipeBoxCard.prototype._renderLoved is literally true at runtime
// (see test_recipe_box_card_sharing.js, which asserts exactly that for every
// method here) - editing the modal's code in this one block is guaranteed to
// change the standalone card's behavior identically, and vice versa.
//
// Same window-singleton, guarded-by-`if` shape as window.__familyHubFabCoordinator
// above (the only cross-card-coordination precedent this codebase already had) -
// whichever of this file or the standalone card's file loads first "wins" and
// defines it; the second file's identical guarded block becomes a no-op.
//
// Deliberately NOT included here (kept card-specific, each side supplies its
// own): _openDishEditor/_saveDishEditor - fused with the day/menu editor's
// shared `.edit-overlay` modal on this card, not cleanly separable from meal-
// plan editing, so the standalone card gets its own small, separate add/edit-
// dish mini-modal that calls the SAME shared _upsertDish/_deleteDish below;
// _openModal (this card's version drives the mobile back-button history
// stack shared by every modal on this card - general navigation infra, not
// Recipe Box logic); "Add from Grocy"/"Import from a link" and the full Grocy
// Recipe Viewer (out of scope - large, calendar-entangled subsystems); the
// screensaver idle-timer and "+ picker mode" used only from the day/menu
// editor's "Pick a Recipe"/"+ From Recipe Box" buttons (_selectLovedDish,
// _addAdditionalRecipeFromLoved) - calendar-only call sites.
if (!window.__familyHubRecipeBoxShared) {
window.__familyHubRecipeBoxShared = {
_genId() {
return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
},
_parseDishDescription(raw) {
if (!raw) return { description: "", link: "", rating: null, color: null, block: 0, recur: null, grocyRecipeId: null, servings: null, category: "", image: "", additionalRecipes: [], leftoverDates: [] };
try {
const parsed = JSON.parse(raw);
return {
description: parsed.description || "",
link: parsed.link || "",
rating: parsed.rating || null,
color: parsed.color || null,
// Recipe Box-only fields (see _upsertDish) - harmlessly blank on
// every other kind of item this same parser also handles (a planned
// meal, a recurring-meal anchor, a suggestion), since none of those
// ever set them.
category: parsed.category || "",
image: parsed.image || "",
block: typeof parsed.block === "number" ? parsed.block : 0,
// "weekly" if this meal-plan entry is the anchor of a "repeat weekly"
// meal - see _getMealForDay for how that anchor gets projected onto
// every future week's matching day-of-week + block.
recur: parsed.recur || null,
// Set only for suggestions added via "Add from Grocy" - lets the
// suggestions list open the in-card Recipe Viewer (which fetches
// live from Grocy) instead of just opening the plain link, which
// would hit Grocy's own login wall (see _openGrocyRecipeViewer).
grocyRecipeId: parsed.grocyRecipeId || null,
// How many people this specific planned meal is meant to feed - only
// meaningful alongside grocyRecipeId. null means "use whatever the
// Grocy recipe's own desired_servings is currently set to" rather
// than any specific number - see _ws_push_grocery_list's docstring
// for how this becomes a real (persistent) edit to the recipe in
// Grocy at push time.
servings: typeof parsed.servings === "number" ? parsed.servings : null,
// v141+: leftovers - how many EXTRA days (beyond the day it's actually
// entered on) this same meal should keep showing for, same block, on
// the immediately following days. 1 (the default) means "just this one
// day," identical to every meal entered before this existed. v144.10+:
// superseded by leftoverDates below for anything saved from here on
// (an explicit, non-contiguous day picker instead of "the next N days
// in a row") - spanDays is kept ONLY so pre-v144.10 data (which never
// had leftoverDates) still projects the same contiguous run it always
// did; see _fetchMealPlan for the actual fallback logic, since a single
// number here can no longer represent an arbitrary day selection.
spanDays: typeof parsed.spanDays === "number" && parsed.spanDays > 1 ? parsed.spanDays : 1,
// v144.10+: "leftovers should let you choose what days you have the
// leftovers on" - an explicit list of "YYYY-MM-DD" date keys this same
// meal should ALSO show on (same block), replacing spanDays' "next N
// days in a row" assumption with an arbitrary pick of any day(s), not
// necessarily contiguous with each other or with the day it was cooked.
// Malformed/non-string entries are dropped defensively, same reasoning
// as additionalRecipes just below.
leftoverDates: Array.isArray(parsed.leftoverDates) ? parsed.leftoverDates.filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) : [],
// v142+: "additional recipes" - any number of side/dessert/sauce
// recipes attached alongside this one main recipe (see _upsertMealPlan
// and the day/menu editor's Additional Recipes field). Each entry is
// {name, link, grocyRecipeId} - name-less/malformed entries are
// dropped defensively since this is user-editable JSON going back
// years before this field existed.
additionalRecipes: Array.isArray(parsed.additionalRecipes)
? parsed.additionalRecipes
.filter((r) => r && typeof r.name === "string" && r.name.trim())
.map((r) => ({ name: r.name, link: r.link || "", grocyRecipeId: r.grocyRecipeId || null }))
: [],
};
} catch (e) {
return { description: raw, link: "", rating: null, color: null, block: 0, recur: null, grocyRecipeId: null, servings: null, category: "", image: "", spanDays: 1, additionalRecipes: [], leftoverDates: [] };
}
},
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
},
_normalizeForDuplicateCheck(name) {
return (name || "")
.toString()
.normalize("NFKD")
.replace(/[̀-ͯ]/g, "")
.toLowerCase()
.replace(/[^a-z0-9]+/g, " ")
.trim()
.replace(/\s+/g, " ");
},
_levenshteinDistance(a, b) {
if (a === b) return 0;
if (!a.length) return b.length;
if (!b.length) return a.length;
let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
for (let i = 1; i <= a.length; i++) {
const cur = [i];
for (let j = 1; j <= b.length; j++) {
cur[j] =
a[i - 1] === b[j - 1]
? prev[j - 1]
: 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
}
prev = cur;
}
return prev[b.length];
},
_findFuzzyDuplicate(name, list, getName) {
const norm = this._normalizeForDuplicateCheck(name);
if (!norm) return null;
let best = null;
let bestDistance = Infinity;
for (const item of list || []) {
const otherNorm = this._normalizeForDuplicateCheck(getName(item));
if (!otherNorm) continue;
const distance = otherNorm === norm ? 0 : this._levenshteinDistance(norm, otherNorm);
const threshold = otherNorm === norm ? 0 : Math.max(1, Math.round(Math.max(norm.length, otherNorm.length) * 0.2));
if (distance <= threshold && distance < bestDistance) {
best = item;
bestDistance = distance;
}
}
return best;
},
async _fetchRecipes() {
if (!this._hass) return;
try {
const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_recipes" });
if (!result.migrated) {
const items = this._config.recipe_entity ? await this._getItems(this._config.recipe_entity) : [];
this._recipes = items.map((it) => {
const parsed = this._parseDishDescription(it.description);
return {
uid: it.uid,
name: it.summary,
description: parsed.description,
link: parsed.link,
rating: parsed.rating,
grocyRecipeId: parsed.grocyRecipeId,
category: parsed.category,
image: parsed.image,
};
});
await this._persistRecipes();
} else {
this._recipes = result.recipes || [];
}
} catch (e) {
this._recipes = [];
}
this._renderLoved();
this._renderGrid();
},
async _persistRecipes() {
if (!this._hass) return;
try {
await this._hass.connection.sendMessagePromise({ type: "family_hub/set_recipes", recipes: this._recipes });
} catch (e) {
}
},
async _fetchSuggestions() {
if (!this._hass) return;
try {
const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/get_suggestions" });
if (!result.migrated) {
const items = this._config.suggestions_entity ? await this._getItems(this._config.suggestions_entity) : [];
this._suggestions = items.map((it) => {
const parsed = this._parseDishDescription(it.description);
return { uid: it.uid, name: it.summary, description: parsed.description, link: parsed.link, grocyRecipeId: parsed.grocyRecipeId };
});
await this._persistSuggestions();
} else {
this._suggestions = result.suggestions || [];
}
} catch (e) {
this._suggestions = [];
}
// No standalone Suggestions modal to re-render into anymore - "viewing
// suggestions" is just the Recipe Box's own "💡 Suggested" filter now
// (_openSuggestedRecipes), which reads this._suggestions fresh each time
// it renders rather than needing a push here.
},
async _persistSuggestions() {
if (!this._hass) return;
try {
await this._hass.connection.sendMessagePromise({ type: "family_hub/set_suggestions", suggestions: this._suggestions });
} catch (e) {
}
},
async _addSuggestion(name, description, link, grocyRecipeId) {
if (!name) return;
const dupe = this._findFuzzyDuplicate(name, this._suggestions, (s) => s.name);
if (dupe) {
const isExact = this._normalizeForDuplicateCheck(dupe.name) === this._normalizeForDuplicateCheck(name);
if (isExact) return;
if (!window.confirm(`"${dupe.name}" is already suggested and looks very similar. Add "${name}" as a separate suggestion anyway?`)) {
return;
}
}
this._suggestions.push({ uid: this._genId(), name, description: description || "", link: link || "", grocyRecipeId: grocyRecipeId || null });
await this._persistSuggestions();
},
async _removeSuggestion(uid) {
if (!uid) return;
this._suggestions = this._suggestions.filter((s) => s.uid !== uid);
await this._persistSuggestions();
},
_isAdmin() {
return !!(this._hass && this._hass.user && this._hass.user.is_admin);
},
_myUserId() {
return this._hass && this._hass.user ? this._hass.user.id : null;
},
_hasPermission(key) {
// Admin first, so this answers correctly on the very first paint,
// before _fetchMyPermissions has resolved - an admin's own admin-ness
// needs no round trip to know.
if (this._isAdmin()) return true;
return !!(this._myPermissions && this._myPermissions[key]);
},
_canEditMenu() {
return this._hasPermission("can_edit_menu");
},
async _fetchMyPermissions() {
if (!this._hass) return;
try {
const result = await this._hass.connection.sendMessagePromise({ type: "family_hub/permissions/get_mine" });
this._myPermissions = (result && result.permissions) || {};
} catch (e) {
// An older backend (or a transient failure) means "no extra grants" -
// never "everything allowed". An admin still passes via _isAdmin().
this._myPermissions = {};
}
},
async _upsertDish(name, description, link, rating, uidOverride, grocyRecipeId, category, image, checkDuplicates) {
if (!name) return;
const existing = uidOverride
? this._recipes.find((r) => r.uid === uidOverride)
: this._recipes.find((r) => r.name.toLowerCase() === name.toLowerCase());
// Only worth asking about when this is about to become a genuinely new
// Recipe Box entry - an exact-name match above already merges in place
// (existing truthy), and that's the desired behavior, not a duplicate to
// warn about. This is the same fuzzy check _addSuggestion uses, applied
// to the household's actual data gap that prompted it: Grocy recipes and
// hand-typed entries piling up as separate near-identical cards ("Our
// Favorite Buttery Herb Stuffing" vs "...Stuffing4") with no nudge that
// one might already exist.
if (!existing && checkDuplicates) {
const dupe = this._findFuzzyDuplicate(name, this._recipes, (r) => r.name);
if (dupe && !window.confirm(`"${dupe.name}" is already in your Recipe Box and looks very similar. Add "${name}" as a separate recipe anyway?`)) {
return;
}
}
// category/image are Recipe Box-only fields that not every caller knows
// about - the day/menu editor's "also save this as a loved dish" path
// (see _saveEditor) calls this without them, and a heart click straight
// from a Recipe Box card (see _renderLoved) only ever wants to flip the
// rating, not silently blank out a category or photo someone already
// set. Passing undefined here means "leave it alone" (falls back to
// whatever the existing entry already had); pass an empty string
// explicitly to actually clear one.
const finalCategory = category !== undefined ? category : (existing ? existing.category || "" : "");
const finalImage = image !== undefined ? image : (existing ? existing.image || "" : "");
const record = {
uid: existing ? existing.uid : this._genId(),
name,
description: description || "",
link: link || "",
rating: rating || null,
grocyRecipeId: grocyRecipeId || null,
category: finalCategory,
image: finalImage,
};
if (existing) {
this._recipes[this._recipes.indexOf(existing)] = record;
} else {
this._recipes.push(record);
}
await this._persistRecipes();
this._renderLoved();
this._renderGrid();
},
async _deleteDish(uid, grocyRecipeId) {
if (!uid) return;
if (grocyRecipeId) {
try {
await this._hass.connection.sendMessagePromise({
type: "family_hub/delete_grocy_recipe",
recipe_id: grocyRecipeId,
});
} catch (e) {
}
}
this._recipes = this._recipes.filter((r) => r.uid !== uid);
await this._persistRecipes();
this._renderLoved();
this._renderGrid();
},
async _suggestDish(recipe) {
const name = (recipe.name || "").trim().toLowerCase();
const existing = (this._suggestions || []).find((s) => (s.name || "").trim().toLowerCase() === name);
if (existing) {
await this._removeSuggestion(existing.uid);
} else {
await this._addSuggestion(recipe.name, recipe.description, recipe.link, recipe.grocyRecipeId);
}
// _addSuggestion/_removeSuggestion (Store-backed - see _fetchSuggestions)
// update this._suggestions in memory before persisting, so it's already
// current here - no extra re-fetch needed before re-rendering the
// suggest icon's highlighted state.
this._renderLoved();
},
_openLoved(pickerMode) {
// v142+: pickerMode is now also allowed to be the string "additional"
// (the day/menu editor's "+ From Recipe Box" additional-recipe button -
// see _addAdditionalRecipeFromLoved), on top of the existing true/false.
// Both true and "additional" are equally "picker mode" for every
// existing truthy check below (hides bulk-select, shows the hint, tap-
// to-close instead of opening dish detail) - only the exact click
// behavior and title text differ, handled where _pickerMode is compared
// with === rather than just used as a boolean.
this._pickerMode = pickerMode === "additional" ? "additional" : !!pickerMode;
this._lovedSearchTerm = "";
this._recipeBoxCategory = "All";
this._recipeBoxSort = "default";
this._recipeBoxSelectMode = false;
this._recipeBoxSelectedUids.clear();
this._root.querySelector(".loved-search").value = "";
this._root.querySelector(".recipe-sort-select").value = "default";
this._fetchRecipes();
// Picker mode (opened from the day/menu editor's single "Pick a
// Recipe" button - see the pick-btn-group HTML) is now the exact same
// searchable/filterable/sortable grid-or-list browse experience as the
// full Recipe Box, not a separate, narrower loved-only list - it just
// fills in the editor and closes on tap instead of opening dish detail
// (see _renderLoved's click wiring), and hides the bulk-select/delete
// entry point since that's not a task that belongs mid-picking.
this._root.querySelector(".loved-title").textContent =
this._pickerMode === "additional"
? "\u{1F37D}\u{FE0F} Add Additional Recipe"
: this._pickerMode
? "\u{1F37D}\u{FE0F} Pick a Recipe"
: "\u{1F37D}\u{FE0F} Recipe Box";
this._root.querySelector(".loved-hint").style.display = this._pickerMode ? "block" : "none";
this._root.querySelector(".recipe-box-select-btn").style.display = this._pickerMode ? "none" : "";
this._openModal(this._root.querySelector(".loved-overlay"));
},
_closeLoved() {
this._root.querySelector(".loved-overlay").classList.remove("open");
},
_openSuggestedRecipes() {
this._openLoved(false);
this._recipeBoxCategory = "💡 Suggested";
this._renderLoved();
},
_renderLoved() {
if (!this._root) return;
const list = this._root.querySelector(".loved-list");
const viewMode = this._getRecipeBoxViewMode();
list.classList.toggle("recipe-grid", viewMode !== "list");
list.classList.toggle("recipe-list", viewMode === "list");
this._updateRecipeBoxViewButtons();
this._renderRecipeBoxCategoryChips();
this._updateRecipeBoxSelectBar();
// Fire-and-forget: fills in photos for Grocy-imported dishes that don't
// have one yet (see _hydrateGrocyRecipeImages) and re-renders once they
// land, so the grid doesn't have to wait on Grocy before showing names/
// placeholders first.
this._hydrateGrocyRecipeImages();
let recipes = this._recipes.slice();
// Matches a Recipe Box entry to a Meal Suggestions entry by name
// (case-insensitive) since the two aren't otherwise linked records -
// same matching rule _sortRecipeBoxList's "suggested" sort already uses.
// Computed once here so both the "Suggested" filter chip below and each
// card/row's suggest-icon highlight (see the .map() further down) agree
// on the same answer for the same render.
const suggestedNameSet = new Set((this._suggestions || []).map((s) => (s.name || "").trim().toLowerCase()));
const term = (this._lovedSearchTerm || "").trim().toLowerCase();
if (term) {
recipes = recipes.filter(
(r) =>
(r.name || "").toLowerCase().includes(term) ||
(r.description || "").toLowerCase().includes(term) ||
(r.category || "").toLowerCase().includes(term)
);
}
const activeCategory = this._recipeBoxCategory || "All";
if (activeCategory === "❤️ Loved") {
recipes = recipes.filter((r) => r.rating === "up");
} else if (activeCategory === "💡 Suggested") {
recipes = recipes.filter((r) => suggestedNameSet.has((r.name || "").trim().toLowerCase()));
} else if (activeCategory !== "All") {
recipes = recipes.filter((r) => (r.category || "Uncategorized") === activeCategory);
}
recipes = this._sortRecipeBoxList(recipes);
if (!recipes.length) {
list.innerHTML = `<div class="loved-empty">${
term || activeCategory !== "All"
? "No recipes match this search/filter."
: "Your Recipe Box is empty - tap “+ Add Recipe” or “\u{1F517} Import from a link” above to get started."
}</div>`;
return;
}
const isListView = viewMode === "list";
const selectMode = this._recipeBoxSelectMode && !this._pickerMode;
list.innerHTML = recipes
.map((r, idx) => {
const isLoved = r.rating === "up";
const isSuggested = suggestedNameSet.has((r.name || "").trim().toLowerCase());
const isSelected = selectMode && this._recipeBoxSelectedUids.has(r.uid);
const initial = (r.name || "?").trim().charAt(0).toUpperCase();
if (isListView) {
const media = r.image
? `<div class="recipe-row-media" style="background-image:url('${String(r.image).replace(/'/g, "%27")}')"></div>`
: `<div class="recipe-row-media recipe-row-media-placeholder"><span>${initial}</span></div>`;
const category = r.category ? `<span class="recipe-row-category">${r.category}</span>` : "";
const trailing = selectMode
? `<div class="recipe-row-select-badge">${isSelected ? "&#10003;" : ""}</div>`
: `<div class="recipe-row-actions">
<button type="button" class="recipe-row-heart ${isLoved ? "is-loved" : ""}" data-idx="${idx}" title="${isLoved ? "Remove from loved" : "Love this dish"}">${isLoved ? "&#10084;&#65039;" : "&#129293;"}</button>
<button type="button" class="recipe-row-suggest ${isSuggested ? "is-suggested" : ""}" data-idx="${idx}" title="${isSuggested ? "Remove from Suggestions" : "Suggest this for a meal"}">&#128161;</button>
</div>`;
return `<div class="recipe-row ${isSelected ? "is-selected" : ""}" data-idx="${idx}">
${media}
<div class="recipe-row-body">
<div class="recipe-row-name">${r.name}</div>
${category}
</div>
${trailing}
</div>`;
}
const media = r.image
? `<div class="recipe-card-media" style="background-image:url('${String(r.image).replace(/'/g, "%27")}')"></div>`
: `<div class="recipe-card-media recipe-card-media-placeholder"><span>${initial}</span></div>`;
const category = r.category ? `<span class="recipe-card-category">${r.category}</span>` : "";
const overlay = selectMode
? `<div class="recipe-card-select-badge">${isSelected ? "&#10003;" : ""}</div>`
: `<button type="button" class="recipe-card-heart ${isLoved ? "is-loved" : ""}" data-idx="${idx}" title="${isLoved ? "Remove from loved" : "Love this dish"}">${isLoved ? "&#10084;&#65039;" : "&#129293;"}</button>
<button type="button" class="recipe-card-suggest ${isSuggested ? "is-suggested" : ""}" data-idx="${idx}" title="${isSuggested ? "Remove from Suggestions" : "Suggest this for a meal"}">&#128161;</button>`;
return `<div class="recipe-card ${isSelected ? "is-selected" : ""}" data-idx="${idx}">
${media}
${overlay}
<div class="recipe-card-body">
<div class="recipe-card-name">${r.name}</div>
${category}
</div>
</div>`;
})
.join("");
const cardSelector = isListView ? ".recipe-row" : ".recipe-card";
list.querySelectorAll(cardSelector).forEach((el) => {
el.addEventListener("click", () => {
const idx = parseInt(el.dataset.idx, 10);
const recipe = recipes[idx];
if (selectMode) {
this._toggleRecipeBoxSelected(recipe.uid);
} else if (this._pickerMode === "additional") {
this._addAdditionalRecipeFromLoved(recipe);
} else if (this._pickerMode) {
this._selectLovedDish(recipe);
} else if (recipe.grocyRecipeId) {
// v1.129.0+: household report, verbatim: "the recipe box card open
// a menu in a modal but the recipe modal in the calendar opens the
// recipe full screen, the recipe box card needs to function the
// same." Root cause: browsing the Recipe Box always opened the
// small `.dish-detail-overlay` "menu" first (name/photo/rating/
// description plus Suggest/Edit/Delete and a "View recipe" link) -
// reaching the actual full-screen Grocy Recipe Viewer took a
// SECOND tap on that link. The calendar's own "click a planned
// meal's recipe" call sites (its day-cell chips, the Expiring Soon
// list, etc.) never went through that menu at all - they call
// _openGrocyRecipeViewer directly, straight to full-screen, in one
// tap. A recipe imported from Grocy has real ingredients/
// instructions/servings to show, so there's no reason browsing IT
// needed an extra tap through a menu screen first; a recipe with
// only a name/description/link (no Grocy import) has nothing else
// to promote to full-screen, so THAT case still opens the small
// menu exactly as before, unchanged. The `recipe` argument here
// (the actual Recipe Box entry, not just its Grocy id) is new -
// see _openGrocyRecipeViewer's own comment on
// _grocyRecipeViewerSourceRecipe for why it's passed through, and
// this file's own connectedCallback for the Suggest/Edit/Delete
// footer buttons it unlocks so browsing this way doesn't lose
// those actions.
this._openGrocyRecipeViewer(recipe.grocyRecipeId, recipe.name, recipe.link, false, null, recipe);
} else {
this._openDishDetail(recipe);
}
});
});
if (!selectMode) {
const heartSelector = isListView ? ".recipe-row-heart" : ".recipe-card-heart";
const suggestSelector = isListView ? ".recipe-row-suggest" : ".recipe-card-suggest";
list.querySelectorAll(heartSelector).forEach((el) => {
el.addEventListener("click", (e) => {
e.stopPropagation();
const idx = parseInt(el.dataset.idx, 10);
this._toggleDishLoved(recipes[idx]);
});
});
list.querySelectorAll(suggestSelector).forEach((el) => {
el.addEventListener("click", (e) => {
e.stopPropagation();
const idx = parseInt(el.dataset.idx, 10);
this._suggestDish(recipes[idx]);
});
});
}
},
_sortRecipeBoxList(recipes) {
const mode = this._recipeBoxSort || "default";
if (mode === "name") {
return recipes.slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}
if (mode === "suggested") {
const suggestedNames = new Set((this._suggestions || []).map((s) => (s.name || "").trim().toLowerCase()));
return recipes
.map((r, i) => ({ r, i, suggested: suggestedNames.has((r.name || "").trim().toLowerCase()) }))
.sort((a, b) => {
if (a.suggested !== b.suggested) return a.suggested ? -1 : 1;
return a.i - b.i;
})
.map((x) => x.r);
}
return recipes;
},
_getRecipeBoxViewMode() {
return window.localStorage.getItem("familyHubRecipeBoxView") === "list" ? "list" : "grid";
},
_setRecipeBoxViewMode(mode) {
window.localStorage.setItem("familyHubRecipeBoxView", mode === "list" ? "list" : "grid");
this._renderLoved();
},
_updateRecipeBoxViewButtons() {
const root = this._root;
if (!root) return;
const mode = this._getRecipeBoxViewMode();
root.querySelectorAll(".recipe-view-btn").forEach((btn) => {
btn.classList.toggle("active", btn.dataset.view === mode);
});
},
_toggleRecipeBoxSelectMode(active) {
this._recipeBoxSelectMode = !!active;
if (!this._recipeBoxSelectMode) this._recipeBoxSelectedUids.clear();
this._renderLoved();
},
_toggleRecipeBoxSelected(uid) {
if (this._recipeBoxSelectedUids.has(uid)) {
this._recipeBoxSelectedUids.delete(uid);
} else {
this._recipeBoxSelectedUids.add(uid);
}
this._renderLoved();
},
_updateRecipeBoxSelectBar() {
const root = this._root;
if (!root) return;
const active = this._recipeBoxSelectMode && !this._pickerMode;
const bar = root.querySelector(".recipe-box-select-bar");
const actions = root.querySelector(".recipe-box-actions");
if (bar) bar.style.display = active ? "flex" : "none";
if (actions) actions.style.display = active ? "none" : "";
const countEl = root.querySelector(".recipe-box-select-count");
if (countEl) {
const n = this._recipeBoxSelectedUids.size;
countEl.textContent = `${n} selected`;
}
},
async _deleteSelectedRecipeBoxItems() {
const uids = Array.from(this._recipeBoxSelectedUids);
if (!uids.length) return;
const recipesToDelete = uids.map((uid) => this._recipes.find((r) => r.uid === uid)).filter(Boolean);
if (!recipesToDelete.length) return;
const hasGrocy = recipesToDelete.some((r) => r.grocyRecipeId);
const label = recipesToDelete.length === 1 ? `"${recipesToDelete[0].name}"` : `these ${recipesToDelete.length} recipes`;
const grocyNote = hasGrocy ? " This will also delete the linked recipe(s) from Grocy." : "";
if (!window.confirm(`Delete ${label} from the Recipe Box?${grocyNote}`)) return;
for (const recipe of recipesToDelete) {
await this._deleteDish(recipe.uid, recipe.grocyRecipeId);
}
this._recipeBoxSelectMode = false;
this._recipeBoxSelectedUids.clear();
this._renderLoved();
},
async _hydrateGrocyRecipeImages() {
if (!this._hass) return;
// _fetchRecipes() replaces this._recipes wholesale from the Store on
// every load, reconnect, AND the 60s poll (see _refreshAllData) - and
// the Store itself never persists a Grocy-fetched photo (see
// _persistRecipes) - so a recipe whose photo was already resolved into
// _grocyImageCache on an earlier call shows up here again with a fresh
// object and image: null. Re-apply anything already cached BEFORE
// deciding what still needs a network fetch, or a photo that loaded
// fine once quietly disappears again at the very next poll (this was
// the actual bug behind "recipe box still isn't pulling images from
// Grocy" - it briefly worked, then reverted).
let reapplied = false;
(this._recipes || []).forEach((r) => {
if (r.grocyRecipeId && !r.image && this._grocyImageCache[r.grocyRecipeId]) {
r.image = this._grocyImageCache[r.grocyRecipeId];
reapplied = true;
}
});
const targets = (this._recipes || []).filter(
(r) =>
r.grocyRecipeId &&
!r.image &&
!(r.grocyRecipeId in this._grocyImageCache) &&
!this._grocyImageFetching.has(r.grocyRecipeId)
);
if (!targets.length) {
if (
reapplied &&
this._root &&
this._root.querySelector(".loved-overlay") &&
this._root.querySelector(".loved-overlay").classList.contains("open") &&
!this._pickerMode
) {
this._renderLoved();
}
return;
}
targets.forEach((r) => this._grocyImageFetching.add(r.grocyRecipeId));
const results = await Promise.all(
targets.map(async (r) => {
let image = null;
try {
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/get_grocy_recipe_detail",
recipe_id: r.grocyRecipeId,
});
image = (result && result.recipe && result.recipe.image) || null;
} catch (e) {
image = null;
} finally {
this._grocyImageFetching.delete(r.grocyRecipeId);
}
return { id: r.grocyRecipeId, image };
})
);
let changed = false;
results.forEach(({ id, image }) => {
this._grocyImageCache[id] = image;
if (image) changed = true;
});
if (!changed && !reapplied) return;
(this._recipes || []).forEach((r) => {
if (r.grocyRecipeId && !r.image && this._grocyImageCache[r.grocyRecipeId]) {
r.image = this._grocyImageCache[r.grocyRecipeId];
}
});
// Guard against re-entering the picker's plain list or a since-closed
// modal - a slow Grocy response could land well after the Recipe Box
// itself moved on.
if (
this._root &&
this._root.querySelector(".loved-overlay") &&
this._root.querySelector(".loved-overlay").classList.contains("open") &&
!this._pickerMode
) {
this._renderLoved();
}
},
_toggleDishLoved(recipe) {
const newRating = recipe.rating === "up" ? null : "up";
this._upsertDish(recipe.name, recipe.description, recipe.link, newRating, recipe.uid, recipe.grocyRecipeId);
},
_renderRecipeBoxCategoryChips() {
const root = this._root;
if (!root) return;
const container = root.querySelector(".recipe-box-categories");
if (!container) return;
const categories = Array.from(
new Set((this._recipes || []).map((r) => (r.category || "").trim()).filter(Boolean))
).sort((a, b) => a.localeCompare(b));
const chips = ["All", "❤️ Loved", "💡 Suggested", ...categories];
if (!this._recipeBoxCategory || !chips.includes(this._recipeBoxCategory)) {
this._recipeBoxCategory = "All";
}
container.innerHTML = chips
.map(
(c) =>
`<button type="button" class="recipe-chip ${c === this._recipeBoxCategory ? "active" : ""}" data-category="${c.replace(/"/g, "&quot;")}">${c}</button>`
)
.join("");
container.querySelectorAll(".recipe-chip").forEach((el) => {
el.addEventListener("click", () => {
this._recipeBoxCategory = el.dataset.category;
this._renderLoved();
});
});
},
_openDishDetail(recipe) {
const root = this._root;
this._dishDetailRecipe = recipe;
root.querySelector(".dish-detail-title").textContent = recipe.name || "(untitled)";
const photo = root.querySelector(".dish-detail-photo");
if (photo) {
if (recipe.image) {
photo.src = recipe.image;
photo.style.display = "block";
} else {
photo.src = "";
photo.style.display = "none";
}
}
const ratingHtml =
(recipe.rating === "up"
? `<span class="event-info-chip" style="background:#f2ddd4">&#10084;&#65039; Loved</span>`
: recipe.rating === "down"
? `<span class="event-info-chip" style="background:#d8e3e0">&#128078; Not a fan</span>`
: "") + (recipe.category ? `<span class="event-info-chip">${recipe.category}</span>` : "");
root.querySelector(".dish-detail-rating").innerHTML = ratingHtml;
root.querySelector(".dish-detail-desc").textContent = recipe.description || "No notes added.";
const suggestBtn = root.querySelector(".dish-detail-suggest-btn");
if (suggestBtn) {
suggestBtn.textContent = "\u{1F4A1} Suggest this";
suggestBtn.onclick = () => {
this._suggestDish(recipe);
suggestBtn.textContent = "\u{2705} Added to Suggestions";
setTimeout(() => {
suggestBtn.textContent = "\u{1F4A1} Suggest this";
}, 1600);
};
}
const linkRow = root.querySelector(".dish-detail-link-row");
if (recipe.link) {
const label = recipe.grocyRecipeId ? "&#128279; View recipe" : "&#128279; Open recipe link";
linkRow.innerHTML = `<button type="button" class="pick-loved-btn dish-detail-open-link">${label}</button>`;
linkRow.querySelector(".dish-detail-open-link").addEventListener("click", () => {
if (recipe.grocyRecipeId) {
this._openGrocyRecipeViewer(recipe.grocyRecipeId, recipe.name, recipe.link);
} else {
window.open(recipe.link, "_blank", "noopener");
}
});
} else {
linkRow.innerHTML = "";
}
this._openModal(root.querySelector(".dish-detail-overlay"));
// Re-evaluate the screensaver idle timer now that a recipe detail view is
// open - when "Disable while a recipe is open" is on, _screenSaverApplicable
// now returns false, so this clears any pending countdown outright
// (nothing to reschedule to) rather than leaving it running underneath.
this._resetScreenSaverIdleTimer();
},
_closeDishDetail() {
this._root.querySelector(".dish-detail-overlay").classList.remove("open");
// Mirror of the open-side call above: closing the recipe detail view
// means _screenSaverApplicable can be true again, so this restarts the
// idle countdown fresh rather than leaving it dormant until some other
// activity happens to trigger it.
this._resetScreenSaverIdleTimer();
},
_populateDishCategoryOptions() {
const root = this._root;
if (!root) return;
const datalist = root.querySelector("#dish-category-options");
if (!datalist) return;
const categories = Array.from(
new Set((this._recipes || []).map((r) => (r.category || "").trim()).filter(Boolean))
).sort((a, b) => a.localeCompare(b));
datalist.innerHTML = categories.map((c) => `<option value="${c.replace(/"/g, "&quot;")}"></option>`).join("");
},
// v1.118.0+: the full in-card Grocy Recipe Viewer, moved here from being
// a FamilyWeekCalendarCard-only set of methods so this card can open the
// exact same live viewer for a Grocy-linked dish instead of just opening
// the plain external Grocy link (household report: "the recipe box card
// tries to send you to the external grocy link for recipes. this needs
// to use the internal recipe viewer"). Not shared: _selectGrocyRecipe/
// _renderGrocyPicker (the "Add from Grocy" search picker) - this card has
// no such picker and doesn't need one, same as before.
// v1.121.0+: household report, verbatim: "recipe card opens recipes in a
// modal instead of the full screen like the recipe modal does." Root
// cause: wherever this shared viewer is running, if the card sits in a
// normal masonry/sections dashboard grid (rather than filling the whole
// screen, which is how a panel-view deployment usually hides this
// entirely) Home Assistant's own grid container establishes a CSS
// containing block around the card - which traps this overlay's
// `position: fixed` inside that card-sized box instead of letting it
// reach the real viewport, so what's meant to be a full-screen viewer
// renders as a small modal confined to the card instead. Same root cause,
// and same fix, as this file's own screensaver overlay (see
// family-screensaver-card.js's _ensureScreenSaverOverlay for the fuller
// "why"): promote the overlay out of the shadow root and the dashboard
// grid entirely by parking it directly on document.body, where
// position:fixed is guaranteed to mean the actual screen.
//
// The one thing that trick doesn't get for free here (unlike the
// screensaver's own plain, inline-styled overlay): this overlay's look
// comes entirely from THIS card's shadow-root <style> (._css(), all the
// .grocy-recipe-viewer-* rules plus the --fc-* theme variables) - CSS
// defined inside a shadow root only ever applies to elements still
// inside that same shadow tree, so moving the bare element out to
// document.body on its own would leave it completely unstyled. Fixed by
// moving it inside its own small "portal" wrapper instead of straight
// onto document.body: a plain div carrying a COPY of this card's entire
// stylesheet, with the one substitution that copy actually needs -
// ":host" (meaningless outside an actual shadow root, since it only ever
// matches THE shadow host element) swapped for the portal wrapper's own
// class, which plays the exact same "single top-level selector" role.
// That reproduces every rule/variable default correctly, but a THEME
// value that's picked at runtime (_applyThemeVars, called on config/
// theme changes) is set as a live inline override on `this` - the card
// element itself, back in the light DOM - which the portal, now
// disconnected from this card's tree entirely, no longer inherits from.
// So each call ALSO re-copies the current computed value of every one of
// those theme variables from `this` onto the portal, keeping a
// full-screen viewer that's been open across a theme change visually
// correct rather than frozen on whatever theme was active the first time
// it moved. Moving itself is still done once, lazily, the first time the
// viewer is opened (not eagerly in _build, since there's no reason to do
// this before the viewer's ever used) and cached afterward via
// this._grocyRecipeViewerPortalEl - every other call site below goes
// through this accessor instead of querying `root`/`this._root`
// directly, both so the move only has to happen once and so a query
// issued after that move still finds the right element (it's no longer
// a descendant of the shadow root at all once moved). Each card's own
// disconnectedCallback removes this portal too, so it doesn't outlive
// the card itself (a dashboard edit, or Lovelace simply re-creating the
// element, must not leave an orphaned full-screen viewer floating on
// the page).
_grocyViewerOverlay() {
if (!this._grocyRecipeViewerOverlayEl) {
const root = this._root;
this._grocyRecipeViewerOverlayEl = root && root.querySelector(".grocy-recipe-viewer-overlay");
}
const overlay = this._grocyRecipeViewerOverlayEl;
if (overlay && !this._grocyRecipeViewerPortalEl) {
const portal = document.createElement("div");
portal.className = "fh-grocy-viewer-portal";
if (typeof this._css === "function") {
const style = document.createElement("style");
style.textContent = this._css().split(":host").join(".fh-grocy-viewer-portal");
portal.appendChild(style);
}
portal.appendChild(overlay);
document.body.appendChild(portal);
this._grocyRecipeViewerPortalEl = portal;
}
if (this._grocyRecipeViewerPortalEl && typeof getComputedStyle === "function") {
const live = getComputedStyle(this);
[
"--fc-bg", "--fc-card", "--fc-border", "--fc-text", "--fc-text-secondary",
"--fc-accent", "--fc-accent-text", "--fc-accent2", "--fc-accent3",
"--fc-surface-alt", "--fc-surface2", "--fc-glass-blur", "--fh-header-offset",
].forEach((name) => {
const value = live.getPropertyValue(name);
if (value && value.trim()) this._grocyRecipeViewerPortalEl.style.setProperty(name, value.trim());
});
}
return overlay;
},
_openGrocyRecipeViewer(recipeId, fallbackName, fallbackLink, isPreview, tabs, sourceRecipe) {
if (!recipeId) return;
this._grocyRecipeViewerRecipeId = recipeId;
this._grocyRecipeViewerFallbackLink = fallbackLink || "";
// v1.129.0+: the actual Recipe Box entry this viewer was opened FROM, if
// any - only ever passed by the Recipe Box's own primary browse click
// (see that click handler's own comment, just below in this file), never
// by a meal-preview/Expiring-Soon/additional-recipe call site elsewhere,
// which only ever have a bare Grocy recipe id and no local uid to act on.
// Drives whether the Suggest/Edit/Delete footer buttons show at all -
// see the .grocy-recipe-viewer-recipe-actions toggle a few lines down.
this._grocyRecipeViewerSourceRecipe = sourceRecipe || null;
const overlay = this._grocyViewerOverlay();
// Preview mode (task #177's picker preview icon) opens the exact same
// viewer, but over a picker that's deliberately left open underneath -
// show a "Back" button instead of relying on the plain close (X) to
// implicitly reveal it, so it reads as "look, then come back" rather
// than "close this and lose your place".
overlay.classList.toggle("preview-mode", !!isPreview);
// "block", not "" - .grocy-recipe-viewer-back-btn's CSS rule defaults to
// display:none (same gotcha as the photo elements above), so clearing
// the inline style here would silently leave it hidden even in preview
// mode instead of showing it.
this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-back-btn").style.display = isPreview ? "block" : "none";
// v1.129.0+: same "block", not "" gotcha as the back button above -
// .grocy-recipe-viewer-recipe-actions defaults to display:none in CSS.
this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-recipe-actions").style.display = this._grocyRecipeViewerSourceRecipe ? "flex" : "none";
this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-title").textContent = fallbackName || "Recipe";
this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-stats").innerHTML = "";
this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-servings").textContent = "";
this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-ingredients").innerHTML = "";
this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-instructions").innerHTML = "";
this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-description").innerHTML = "";
this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-scale-row").style.display = "none";
this._grocyRecipeViewerIngredients = [];
this._grocyRecipeViewerBaseServings = 1;
this._grocyRecipeViewerServings = 1;
this._grocyRecipeViewerRawDescription = "";
const photoEl = this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-photo");
photoEl.style.display = "none";
photoEl.src = "";
// The full-screen modal-box scrolls its own content (overflow-y: auto);
// without this, reopening the viewer after scrolling through a previous
// recipe reused the same stale scrollTop and opened mid-page with the
// title scrolled out of view above the fold.
this._grocyViewerOverlay().querySelector(".modal-box").scrollTop = 0;
// v1.114.0+ multi-recipe tabs - see this method's own doc note in the
// CSS above (.grocy-recipe-viewer-tabs) for the feature this serves. An
// optional `tabs` array of {id, name} covering every Grocy recipe a
// meal resolves to (main recipe first, then any additionalRecipes
// entries that themselves have a grocyRecipeId - a plain external link
// with no grocyRecipeId was never a "Grocy recipe" to begin with and
// stays exactly as before, a plain link). Omitted, empty, or a single
// entry all mean "just recipeId itself" - the pre-1.114.0 behavior every
// other call site (additional-recipe links, Expiring Soon chips, Recipe
// Box dish detail, the picker preview icon) still gets unchanged.
const dedupedTabs = [];
const seenTabIds = new Set();
(tabs || []).forEach((t) => {
const tid = t && t.id != null ? String(t.id) : "";
if (tid && !seenTabIds.has(tid)) {
seenTabIds.add(tid);
dedupedTabs.push(t);
}
});
this._grocyRecipeViewerTabs = dedupedTabs.length > 1 ? dedupedTabs : null;
this._grocyRecipeViewerDetailsById = {};
this._grocyRecipeViewerTabErrors = {};
const tabsEl = this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-tabs");
if (this._grocyRecipeViewerTabs) {
tabsEl.innerHTML = this._grocyRecipeViewerTabs
.map(
(t) =>
`<button type="button" class="grocy-recipe-viewer-tab-btn ${String(t.id) === String(recipeId) ? "active" : ""}" data-recipe-tab-id="${t.id}">${t.name || "Recipe"}</button>`
)
.join("");
tabsEl.style.display = "flex";
} else {
tabsEl.innerHTML = "";
tabsEl.style.display = "none";
}
this._openModal(this._grocyViewerOverlay());
if (this._grocyRecipeViewerTabs) {
this._fetchGrocyRecipeDetailsBatch(this._grocyRecipeViewerTabs.map((t) => t.id), recipeId);
} else {
this._fetchGrocyRecipeDetail(recipeId);
}
// Same screensaver idle-timer re-check as _openDishDetail - see its
// comment for why.
this._resetScreenSaverIdleTimer();
},
_closeGrocyRecipeViewer() {
this._grocyViewerOverlay().classList.remove("open");
// v1.129.0+: don't let a stale Recipe Box entry leak into the NEXT
// viewer open (a bare-recipe-id call site, e.g. a meal preview, that
// forgets to pass a 6th argument would otherwise inherit whatever was
// last set here rather than correctly showing no Suggest/Edit/Delete
// buttons at all).
this._grocyRecipeViewerSourceRecipe = null;
// Same screensaver idle-timer re-check as _closeDishDetail - see its
// comment for why.
this._resetScreenSaverIdleTimer();
},
// "I made this" button - calls Grocy's own /consume endpoint, which is a
// real, one-way stock deduction (see the backend handler's docstring),
// the same thing clicking "Consume all ingredients needed" on the
// recipe's own page in Grocy does. Confirmed first since there's no undo
// here beyond manually re-adding stock in Grocy afterward.
async _consumeGrocyRecipeIngredients() {
const recipeId = this._grocyRecipeViewerRecipeId;
if (!recipeId || !this._hass) return;
if (!window.confirm("Deduct this recipe's ingredients from your Grocy stock now? This can't be undone from here.")) {
return;
}
const statusEl = this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-status");
statusEl.textContent = "Consuming ingredients in Grocy…";
statusEl.classList.remove("is-error");
try {
// Only sent when the viewer's own scaler has been moved off the
// recipe's base servings - leaving it out otherwise means an
// untouched recipe consumes at whatever desired_servings was already
// saved in Grocy, instead of this call silently overwriting it back
// to the base count for recipes plenty of people leave scaled up.
const servings =
this._grocyRecipeViewerServings && this._grocyRecipeViewerServings !== this._grocyRecipeViewerBaseServings
? this._grocyRecipeViewerServings
: undefined;
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/consume_grocy_recipe",
recipe_id: recipeId,
...(servings ? { servings } : {}),
});
if (result.configured === false) {
statusEl.textContent = "Grocy isn't connected — set it up under Settings > Devices & Services > Family Hub > Configure > Grocy.";
statusEl.classList.add("is-error");
return;
}
if (!result.success) {
statusEl.textContent = `Couldn't consume this recipe's ingredients: ${result.error || "unknown error"}`;
statusEl.classList.add("is-error");
return;
}
statusEl.textContent = "Ingredients deducted from Grocy stock.";
statusEl.classList.remove("is-error");
} catch (e) {
statusEl.textContent = "Couldn't reach Grocy.";
statusEl.classList.add("is-error");
}
},
async _fetchGrocyRecipeDetail(recipeId) {
if (!this._hass) return;
const statusEl = this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-status");
statusEl.textContent = "Loading recipe from Grocy…";
statusEl.classList.remove("is-error");
try {
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/get_grocy_recipe_detail",
recipe_id: recipeId,
});
if (result.configured === false) {
statusEl.textContent = "Grocy isn't connected — set it up under Settings > Devices & Services > Family Hub > Configure > Grocy.";
return;
}
if (result.error || !result.recipe) {
statusEl.textContent = `Couldn't load this recipe from Grocy: ${result.error || "not found"}`;
statusEl.classList.add("is-error");
return;
}
statusEl.textContent = "";
this._renderGrocyRecipeDetail(result.recipe);
} catch (e) {
statusEl.textContent = "Couldn't reach Grocy.";
statusEl.classList.add("is-error");
}
},
// v1.114.0+ batch counterpart to _fetchGrocyRecipeDetail above, for the
// multi-recipe tabs _openGrocyRecipeViewer sets up when it's passed more
// than one recipe id (see that method's own comment). Fetches every
// tab's recipe detail in ONE round trip (family_hub/get_grocy_recipe_
// details, plural - __init__.py's _ws_get_grocy_recipe_details) rather
// than one call per tab, caches all of them in
// this._grocyRecipeViewerDetailsById keyed by id (string, since that's
// how the backend's JSON response keys them and how _switchGrocyRecipe
// ViewerTab looks them up), and renders whichever one is `activeId` -
// the recipe the viewer was actually opened for - so the tab a person
// clicked stays the one they see once loading finishes, even if the
// other tabs' recipes come back in Grocy's own arbitrary iteration order.
async _fetchGrocyRecipeDetailsBatch(recipeIds, activeId) {
if (!this._hass) return;
const statusEl = this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-status");
statusEl.textContent = "Loading recipes from Grocy…";
statusEl.classList.remove("is-error");
try {
const result = await this._hass.connection.sendMessagePromise({
type: "family_hub/get_grocy_recipe_details",
recipe_ids: recipeIds,
});
if (result.configured === false) {
statusEl.textContent = "Grocy isn't connected — set it up under Settings > Devices & Services > Family Hub > Configure > Grocy.";
return;
}
this._grocyRecipeViewerDetailsById = result.recipes || {};
this._grocyRecipeViewerTabErrors = result.errors || {};
this._renderActiveGrocyRecipeViewerTab(activeId);
} catch (e) {
statusEl.textContent = "Couldn't reach Grocy.";
statusEl.classList.add("is-error");
}
},
// Shared by the batch fetch above (once all tabs' details have loaded)
// and _switchGrocyRecipeViewerTab (when someone clicks a different tab
// that's already cached, or one that failed to load) - renders whichever
// recipe id is asked for from the cache if present, or a friendly
// per-tab error state (clearing every render target, same "nothing
// stale left showing" approach _openGrocyRecipeViewer's own reset uses)
// if that id came back in `errors` instead of `recipes`.
_renderActiveGrocyRecipeViewerTab(recipeId) {
const statusEl = this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-status");
const detail = (this._grocyRecipeViewerDetailsById || {})[String(recipeId)];
if (detail) {
statusEl.textContent = "";
statusEl.classList.remove("is-error");
this._renderGrocyRecipeDetail(detail);
return;
}
const err = (this._grocyRecipeViewerTabErrors || {})[String(recipeId)];
const tabInfo = ((this._grocyRecipeViewerTabs || []).find((t) => String(t.id) === String(recipeId)) || {});
this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-title").textContent = tabInfo.name || "Recipe";
this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-stats").innerHTML = "";
this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-servings").textContent = "";
this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-ingredients").innerHTML = "";
this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-instructions").innerHTML = "";
this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-description").innerHTML = "";
this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-scale-row").style.display = "none";
this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-photo").style.display = "none";
statusEl.textContent = `Couldn't load this recipe from Grocy: ${err || "not found"}`;
statusEl.classList.add("is-error");
},
// Tab-row click handler (delegated, see the connectedCallback wiring on
// .grocy-recipe-viewer-tabs) - just swaps which cached recipe's data is
// showing and moves the .active highlight; never re-fetches anything,
// since _fetchGrocyRecipeDetailsBatch already loaded every tab's detail
// up front when the viewer opened.
_switchGrocyRecipeViewerTab(recipeId) {
if (!this._grocyRecipeViewerTabs) return;
this._grocyViewerOverlay().querySelectorAll(".grocy-recipe-viewer-tab-btn").forEach((btn) => {
btn.classList.toggle("active", String(btn.dataset.recipeTabId) === String(recipeId));
});
this._grocyRecipeViewerRecipeId = recipeId;
this._renderActiveGrocyRecipeViewerTab(recipeId);
this._grocyViewerOverlay().querySelector(".modal-box").scrollTop = 0;
},
_renderGrocyRecipeDetail(recipe) {
const photoEl = this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-photo");
if (recipe.image) {
photoEl.src = recipe.image;
// NOT "" - .grocy-recipe-viewer-photo's own CSS rule sets
// `display: none` as its base/default (so it stays hidden for
// recipes with no photo without extra markup) - clearing the inline
// style here would just fall back to that class rule and the image
// would silently never show even though src is set correctly.
photoEl.style.display = "block";
} else {
photoEl.style.display = "none";
photoEl.src = "";
}
this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-title").textContent = recipe.name || "Recipe";
// Prep/Cook/Total stat pills (task #250/mockup) - only the ones this
// recipe actually has real data for; a manually-typed Grocy recipe with
// none of the three published just gets an empty (and, per the
// :empty CSS rule, invisible) stats row instead of a placeholder.
const statsEl = this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-stats");
const statDefs = [
["Prep", recipe.prep_time],
["Cook", recipe.cook_time],
["Total", recipe.total_time],
].filter(([, value]) => (value || "").trim());
statsEl.innerHTML = statDefs
.map(([label, value]) => `<div class="grocy-recipe-stat"><span class="grocy-recipe-stat-label">${label}</span><span class="grocy-recipe-stat-value">${value}</span></div>`)
.join("");
this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-servings").textContent = recipe.servings
? `Makes ${recipe.servings} serving${recipe.servings === 1 ? "" : "s"}`
: "";
// The picker only ever had the list-page link; once the detail call
// resolves we have the authoritative one from the recipe object itself
// (same value in practice, but this is the one that should win).
this._grocyRecipeViewerFallbackLink = recipe.link || this._grocyRecipeViewerFallbackLink || "";

const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
this._grocyRecipeViewerIngredients = ingredients;
// The scaler (task #173) works off the recipe's own base_servings - the
// serving count Grocy's recipes_pos amounts are actually calibrated for -
// separate from "servings" above, which can reflect a previously-saved
// desired_servings override instead. Falls back gracefully to whatever's
// available so old/partial responses (or the plain "amount" string with
// no raw amount_value) still render exactly as before.
const baseServings = Number(recipe.base_servings) > 0 ? Number(recipe.base_servings) : (Number(recipe.servings) > 0 ? Number(recipe.servings) : 1);
this._grocyRecipeViewerBaseServings = baseServings;
this._grocyRecipeViewerServings = Number(recipe.servings) > 0 ? Number(recipe.servings) : baseServings;
const scaleRow = this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-scale-row");
const canScale = ingredients.some((ing) => typeof ing.amount_value === "number");
scaleRow.style.display = canScale ? "flex" : "none";
this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-scale-value").textContent = String(this._grocyRecipeViewerServings);
this._renderGrocyRecipeIngredients();

// The description/instructions HTML can itself embed a plain-text
// ingredients list (see _createImportedGrocyRecipe's "Ingredients"
// <ul> block, added for recipes imported via the card's "Import a
// recipe from a link" flow, task #158) - kept unscaled here so
// _renderGrocyRecipeDescription can re-derive the scaled version from
// the original every time the stepper changes, rather than scaling an
// already-scaled string a second time.
this._grocyRecipeViewerRawDescription = recipe.description || "";
this._renderGrocyRecipeDescription();
},
// Recomputes the description/instructions block against the current
// servings ratio - mirrors _renderGrocyRecipeIngredients, but for the
// plain-text "Ingredients" list some recipes also carry inside their
// description HTML (see the comment above). Recipes without that exact
// block (hand-typed directly in Grocy, or from before task #158) simply
// pass through _scaleIngredientsDescriptionHtml unchanged.
_renderGrocyRecipeDescription() {
if (!this._root) return;
const descEl = this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-description");
const instructionsEl = this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-instructions");
if (!descEl) return;
const raw = this._grocyRecipeViewerRawDescription || "";
if (!raw) {
if (instructionsEl) instructionsEl.innerHTML = "";
descEl.innerHTML = `<div class="loved-empty">No instructions added in Grocy.</div>`;
return;
}
const baseServings = this._grocyRecipeViewerBaseServings || 1;
const servings = this._grocyRecipeViewerServings || baseServings;
const ratio = baseServings > 0 ? servings / baseServings : 1;
let html = this._scaleIngredientsDescriptionHtml(raw, ratio);

// Recipes imported via this card's own "Import a recipe from a link"
// flow (_createImportedGrocyRecipe, task #158/#223) write a predictable
// "<p><strong>Preparation</strong></p><p>step 1</p><p>step 2</p>..."
// block, followed by (optionally) the Prep/Cook line and/or a Source
// line, each of which starts with its own "<p><strong>". Recipes without
// that exact shape (hand-typed directly in Grocy, older imports, plain
// pasted text with no parsed steps) simply have no match here and fall
// through to the untouched raw-HTML rendering exactly as before this
// feature existed - nothing about them changes.
const stepsMatch = html.match(/<p><strong>Preparation<\/strong><\/p>([\s\S]*?)(?=<p><strong>|$)/i);
const steps = [];
if (stepsMatch) {
const stepRe = /<p>([\s\S]*?)<\/p>/gi;
let m;
while ((m = stepRe.exec(stepsMatch[1]))) {
const text = m[1].trim();
if (text) steps.push(text);
}
}

if (instructionsEl) {
instructionsEl.innerHTML = steps.length
? `<div class="grocy-recipe-instructions-title">Instructions</div>` +
steps
.map(
(step, i) =>
`<div class="grocy-recipe-instruction-row"><span class="grocy-recipe-instruction-badge">${i + 1}</span><span class="grocy-recipe-instruction-text">${step}</span></div>`
)
.join("")
: "";
}

// Once a block has its own dedicated element above (structured
// ingredients list, numbered Instructions), it'd otherwise appear twice
// on the page. The Ingredients block needs real care though: an
// ingredient the importer couldn't match (or the person left unmatched/
// skipped) never becomes a recipes_pos row at all (see
// _ws_create_grocy_recipe's "skipped" list), so the structured list
// above can be a strict SUBSET of what's in the raw text - and outright
// removing the raw block used to hide those skipped ingredients
// entirely (a real household report: "not including the ingredients in
// the preparation section"). Rather than try to judge redundancy and
// hide it, this always keeps the raw written-out list available - just
// tucked behind a collapsed-by-default accordion, so it's a tap away
// when needed (a skipped ingredient, double-checking exact wording,
// etc.) without permanently duplicating the structured list above for
// the common case where every ingredient already matched.
const ingredientsBlockMatch = html.match(/<p><strong>Ingredients<\/strong><\/p><ul>([\s\S]*?)<\/ul>/i);
if (ingredientsBlockMatch) {
const accordionHtml =
`<div class="grocy-recipe-ingredients-accordion">` +
`<button type="button" class="accordion-toggle recipe-viewer-ingredients-toggle" data-target="recipe-viewer-ingredients-body">` +
`<span class="theme-section-label">Written-out ingredients list</span>` +
`<span class="accordion-chevron">&#9660;</span>` +
`</button>` +
`<div class="accordion-body" id="recipe-viewer-ingredients-body"><ul>${ingredientsBlockMatch[1]}</ul></div>` +
`</div>`;
html = html.replace(ingredientsBlockMatch[0], accordionHtml);
}
if (steps.length) {
html = html.replace(stepsMatch[0], "");
}
// The Prep/Cook line is now always shown as its own stat pills whenever
// it exists at all (see _renderGrocyRecipeDetail), so it's always
// redundant here - safe to strip unconditionally.
html = html.replace(/<p>[\s\S]*?<strong>(?:Prep|Cook):<\/strong>[\s\S]*?<\/p>/i, "");
html = html.trim();
descEl.innerHTML = html || `<div class="loved-empty">No additional notes.</div>`;
const ingredientsToggle = descEl.querySelector(".recipe-viewer-ingredients-toggle");
if (ingredientsToggle) {
ingredientsToggle.addEventListener("click", () => {
const body = descEl.querySelector(`#${ingredientsToggle.dataset.target}`);
ingredientsToggle.classList.toggle("open");
if (body) body.classList.toggle("open");
});
}
},
// Finds the "Ingredients" <ul> block _createImportedGrocyRecipe writes
// into a recipe's description (raw scraped lines like "2 cups flour",
// not the structured recipes_pos data the main ingredients list above
// uses) and scales just the LEADING quantity of each line by ratio,
// leaving everything else - product names, notes, and especially the
// Preparation instructions below it (so "bake for 20 minutes" never gets
// mistaken for a scalable quantity) - untouched. A line whose quantity
// isn't a plain number/fraction (a range like "3-4 cloves", or no
// leading number at all, e.g. "a pinch of salt") is left exactly as
// written rather than guessed at. Recipes with no such block (hand-typed
// directly in Grocy) pass through completely unchanged.
_scaleIngredientsDescriptionHtml(html, ratio) {
if (!html) return html;
const blockRe = /(<p><strong>Ingredients<\/strong><\/p><ul>)([\s\S]*?)(<\/ul>)/i;
const match = html.match(blockRe);
if (!match) return html;
const qtyRe = /^(\s*)(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?[¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]?|[¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])(?=\s|$)/;
const scaledItems = match[2].replace(/<li>([\s\S]*?)<\/li>/gi, (full, inner) => {
const qm = inner.match(qtyRe);
if (!qm) return full;
const value = this._parseQuantityToken(qm[2]);
if (value === null || !isFinite(value)) return full;
const scaledText = this._formatScaledQuantityToken(value * ratio);
const rest = inner.slice(qm[0].length);
return `<li>${qm[1]}${scaledText}${rest}</li>`;
});
return html.slice(0, match.index) + match[1] + scaledItems + match[3] + html.slice(match.index + match[0].length);
},
// "1 1/2" / "1/2" / "1½" / "½" / "2" / "2.5" / "1-2" -> a plain decimal.
// A plain range ("1-2", "3-4") resolves to its upper bound rather than
// failing outright - see the backend's _parse_quantity_token (kept in
// sync deliberately) for why: a household reported ordinary countable
// ingredients like "1-2 russet potatoes" defaulting to "Don't count
// toward stock" every time, since that checkbox's own default just
// follows whether a usable number came back at all. Returns null for
// anything else (non-numeric text) so the caller knows to leave that
// line alone rather than silently mangling it.
_parseQuantityToken(token) {
token = (token || "").trim();
const FRACTION_MAP = {
"¼": 0.25, "½": 0.5, "¾": 0.75,
"⅓": 1 / 3, "⅔": 2 / 3,
"⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8,
"⅙": 1 / 6, "⅚": 5 / 6,
"⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
};
let m = token.match(/^(\d+)\s+(\d+)\/(\d+)$/);
if (m) return parseInt(m[1], 10) + parseInt(m[2], 10) / parseInt(m[3], 10);
m = token.match(/^(\d+)\/(\d+)$/);
if (m) return parseInt(m[1], 10) / parseInt(m[2], 10);
m = token.match(/^(\d+(?:\.\d+)?)?([¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])?$/);
if (m && (m[1] || m[2])) {
const whole = m[1] ? parseFloat(m[1]) : 0;
const frac = m[2] ? FRACTION_MAP[m[2]] : 0;
return whole + frac;
}
m = token.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
if (m) return parseFloat(m[2]);
return null;
},
// The inverse of _parseQuantityToken - renders a scaled decimal back as
// a recipe-friendly whole/fraction string (e.g. "1 1/2" rather than
// "1.5") when it lands close to a common cooking fraction (halves,
// thirds, quarters, fifths, sixths, eighths), falling back to a plain
// rounded decimal otherwise.
_formatScaledQuantityToken(value) {
const rounded = Math.round(value * 100) / 100;
const whole = Math.floor(rounded + 1e-6);
const frac = rounded - whole;
const FRACTIONS = [
[1 / 8, "1/8"], [1 / 6, "1/6"], [0.2, "1/5"], [0.25, "1/4"],
[1 / 3, "1/3"], [0.375, "3/8"], [0.4, "2/5"], [0.5, "1/2"],
[0.6, "3/5"], [0.625, "5/8"], [2 / 3, "2/3"], [0.75, "3/4"],
[0.8, "4/5"], [5 / 6, "5/6"], [0.875, "7/8"],
];
if (frac > 0.03) {
for (const [f, label] of FRACTIONS) {
if (Math.abs(frac - f) < 0.03) {
return whole > 0 ? `${whole} ${label}` : label;
}
}
}
return String(rounded);
},
// Recomputes just the ingredients list against
// this._grocyRecipeViewerServings/_grocyRecipeViewerBaseServings, without
// re-fetching from Grocy - called on initial render and again every time
// the scale stepper changes.
//
// v1.110.5+ bug report: "if you click do not include in amounts the
// ingredient doesnt show on the top of the recipe viewer. It should."
// this._grocyRecipeViewerIngredients (set in _renderGrocyRecipeDetail from
// the backend's own family_hub/get_grocy_recipe_detail response) already
// includes every ingredient unconditionally - see that handler's own
// comment. This method must keep doing the same: not_check_stock_
// fulfillment ("don't count toward stock") is a STOCK-MATH concern only,
// never a reason to skip a row here.
_renderGrocyRecipeIngredients() {
if (!this._root) return;
const ingredientsEl = this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-ingredients");
if (!ingredientsEl) return;
const ingredients = this._grocyRecipeViewerIngredients || [];
if (!ingredients.length) {
ingredientsEl.innerHTML = "";
return;
}
const baseServings = this._grocyRecipeViewerBaseServings || 1;
const servings = this._grocyRecipeViewerServings || baseServings;
const ratio = baseServings > 0 ? servings / baseServings : 1;
let lastGroup = null;
ingredientsEl.innerHTML = ingredients
.map((ing, idx) => {
let groupHtml = "";
const group = ing.group || "";
if (group !== lastGroup) {
lastGroup = group;
if (group) groupHtml = `<div class="grocy-recipe-ingredient-group">${group}</div>`;
}
const note = ing.note ? ` <span class="grocy-recipe-ingredient-note">(${ing.note})</span>` : "";
const amountText = this._formatScaledIngredientAmount(ing, ratio);
// Numbered circular badge (task #251/mockup) in place of the amount
// leading the row - the amount itself moves down alongside the
// product name so nothing shown before is lost.
return `${groupHtml}<div class="grocy-recipe-ingredient-row"><span class="grocy-recipe-ingredient-badge">${idx + 1}</span><span><span class="grocy-recipe-ingredient-amount">${amountText}</span> ${ing.product || ""}${note}</span></div>`;
})
.join("");
},
// A free-text amount ("to taste") can't be scaled - passed through as-is.
// Anything without a raw numeric amount_value (an older/partial response)
// falls back to the pre-formatted "amount" string, matching the exact
// behavior before this feature existed.
_formatScaledIngredientAmount(ing, ratio) {
if (ing.variable_amount) return ing.variable_amount;
if (typeof ing.amount_value !== "number") return ing.amount || "";
const scaled = ing.amount_value * ratio;
const rounded = Math.round(scaled * 100) / 100;
const unit = (rounded === 1 ? (ing.unit_name || ing.unit_name_plural) : (ing.unit_name_plural || ing.unit_name)) || "";
return `${rounded} ${unit}`.trim();
},
_adjustGrocyRecipeViewerServings(delta) {
const next = Math.max(1, (this._grocyRecipeViewerServings || 1) + delta);
if (next === this._grocyRecipeViewerServings) return;
this._grocyRecipeViewerServings = next;
const valueEl = this._grocyViewerOverlay().querySelector(".grocy-recipe-viewer-scale-value");
if (valueEl) valueEl.textContent = String(next);
this._renderGrocyRecipeIngredients();
this._renderGrocyRecipeDescription();
},
};
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

class FamilyHubRecipeBoxCard extends HTMLElement {
  static getStubConfig() {
    return { title: "Recipe Box" };
  }
  static getConfigForm() {
    return {
      schema: [{ name: "title", selector: { text: {} } }],
      computeLabel: (s) => (s.name === "title" ? "Title" : undefined),
    };
  }
  static getConfigElement() {
    return document.createElement("family-hub-recipe-box-card-editor");
  }
  setConfig(config) {
    this._config = {
      title: (config && config.title) || "Recipe Box",
      // v1.111.0+: per-card Theme override - see family-hub-goals-card.js's
      // identical field/comment for the full precedence story. This card
      // never had any theming at all before this (see _css's hardcoded
      // :host custom properties) - _defaultTheme/_resolveTheme/
      // _applyThemeVars below are new baseline theming built from scratch,
      // matching every other standalone Family Hub card's own shape.
      theme_override: (config && typeof config.theme_override === "string") ? config.theme_override : "",
    };
    if (this._settingsCache === undefined) this._settingsCache = null;
    if (this._globalThemes === undefined) this._globalThemes = [];
    // Everything below mirrors the Recipe Box state family-week-calendar-
    // card.js's own constructor sets up (same field names, same defaults) -
    // the shared methods above read/write these exact fields on `this`
    // regardless of which class they're actually running on.
    if (this._recipes === undefined) this._recipes = [];
    if (this._suggestions === undefined) this._suggestions = [];
    if (this._myPermissions === undefined) this._myPermissions = {};
    if (this._grocyImageCache === undefined) this._grocyImageCache = {};
    if (this._grocyImageFetching === undefined) this._grocyImageFetching = new Set();
    if (this._recipeBoxSort === undefined) this._recipeBoxSort = "default";
    if (this._recipeBoxSelectMode === undefined) this._recipeBoxSelectMode = false;
    if (this._recipeBoxSelectedUids === undefined) this._recipeBoxSelectedUids = new Set();
    if (this._lovedSearchTerm === undefined) this._lovedSearchTerm = "";
    if (this._recipeBoxCategory === undefined) this._recipeBoxCategory = "All";
    // This card is never a "picker" for some other editor - it's always the
    // full browse/manage experience, same as the modal opened NOT in picker
    // mode (see _renderLoved/_openLoved's own pickerMode handling above).
    this._pickerMode = false;
    if (this._topModalZ === undefined) this._topModalZ = 1006;
    if (this._firstLoadPromise === undefined) this._firstLoadPromise = null;
    if (!this._built) this._build();
    if (this._root) this._root.querySelector(".fh-recipe-box-title").textContent = this._config.title;
  }
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._firstLoadPromise = this._initFirstLoad();
  }
  async _initFirstLoad() {
    // v1.111.0+: baseline theming, new for this card - see setConfig's own
    // comment. Fetched alongside everything else so a per-card
    // theme_override resolves on first paint, same as every other
    // standalone Family Hub card.
    await this._fetchSettings();
    await this._fetchGlobalThemes();
    await this._fetchMyPermissions();
    await this._fetchRecipes();
    await this._fetchSuggestions();
    this._startPolling();
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
  _startPolling() {
    if (this._interval) return;
    // Same 60s cadence as the calendar card's own _refreshAllData poll -
    // this card shows the same household-wide, backend-Store-backed Recipe
    // Box, so it should notice another device's edits on a similar cadence.
    this._interval = setInterval(() => {
      this._fetchRecipes();
      this._fetchSuggestions();
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
    // v1.121.0+: the Grocy Recipe Viewer's portal (see _grocyViewerOverlay's
    // own comment) lives on document.body, outside this card's own DOM
    // entirely - it must be torn down here explicitly, or a dashboard edit/
    // Lovelace re-creating this element would leave an orphaned full-screen
    // viewer behind forever.
    if (this._grocyRecipeViewerPortalEl) {
      this._grocyRecipeViewerPortalEl.remove();
      this._grocyRecipeViewerPortalEl = null;
      this._grocyRecipeViewerOverlayEl = null;
    }
  }
  getCardSize() {
    return 8;
  }
  getGridOptions() {
    return { columns: 12, min_columns: 6, max_columns: 12, min_rows: 6 };
  }
  // -------------------------------------------------------------------------
  // Small card-local infra the shared block above calls into, that this
  // card supplies its own (deliberately simple) version of - see
  // window.__familyHubRecipeBoxShared's own comment for why each of these
  // stays card-specific instead of being folded into the shared object.
  _openModal(el) {
    if (!el) return;
    this._topModalZ = (this._topModalZ || 1006) + 1;
    el.style.zIndex = String(this._topModalZ);
    el.classList.add("open");
  }
  _closeModal(el) {
    if (el) el.classList.remove("open");
  }
  _renderGrid() {
    // No meal-plan grid on this card - the shared _fetchRecipes/_upsertDish/
    // _deleteDish call this unconditionally after touching this._recipes,
    // same as they do on the calendar card. A no-op here is intentional,
    // not a missing feature.
  }
  _resetScreenSaverIdleTimer() {
    // This card has no Screen Saver feature to protect - the shared
    // _openDishDetail/_closeDishDetail call this unconditionally, same as
    // on the calendar card, where it actually does something.
  }
  // v1.118.0+: _openGrocyRecipeViewer itself (and its whole supporting cast)
  // is no longer a card-local stub here - it's the real, shared implementation
  // from window.__familyHubRecipeBoxShared (assigned onto this prototype
  // below), same live viewer the calendar card uses. See this file's own top
  // comment and the shared block's own comment for why.
  _updateRatingButtons() {
    if (!this._root) return;
    const heart = this._root.querySelector(".rb-btn-heart");
    const thumbsdown = this._root.querySelector(".rb-btn-thumbsdown");
    if (heart) heart.classList.toggle("active-up", this._currentRbRating === "up");
    if (thumbsdown) thumbsdown.classList.toggle("active-down", this._currentRbRating === "down");
  }
  // -------------------------------------------------------------------------
  // This card's own small add/edit-dish mini-modal (NOT shared with the
  // calendar card's .edit-overlay - see this file's top comment for why).
  // Writes go through the exact same shared _upsertDish/_deleteDish as the
  // modal's own dish editor, so the actual data behavior is identical.
  _openRecipeBoxEditor(recipe) {
    const root = this._root;
    if (!root) return;
    this._editingDishUid = recipe ? recipe.uid : null;
    this._editingDishGrocyRecipeId = (recipe && recipe.grocyRecipeId) || null;
    root.querySelector(".rb-editor-title").textContent = recipe ? "Edit Recipe" : "Add Recipe";
    root.querySelector(".rb-input-name").value = recipe ? recipe.name || "" : "";
    root.querySelector(".rb-input-description").value = recipe ? recipe.description || "" : "";
    root.querySelector(".rb-input-link").value = recipe ? recipe.link || "" : "";
    root.querySelector(".input-category").value = recipe ? recipe.category || "" : "";
    this._populateDishCategoryOptions();
    root.querySelector(".rb-input-add-suggestion").checked = false;
    this._setRecipeBoxEditorImage(recipe ? recipe.image || "" : "");
    this._currentRbRating = recipe ? recipe.rating || null : null;
    this._updateRatingButtons();
    root.querySelector(".rb-editor-delete-btn").style.display = recipe ? "" : "none";
    this._closeDishDetail();
    this._openModal(root.querySelector(".rb-editor-overlay"));
  }
  _closeRecipeBoxEditor() {
    this._closeModal(this._root.querySelector(".rb-editor-overlay"));
  }
  _setRecipeBoxEditorImage(url) {
    const root = this._root;
    if (!root) return;
    const input = root.querySelector(".rb-input-image");
    const preview = root.querySelector(".rb-image-preview");
    if (input) input.value = url || "";
    if (!preview) return;
    if (url) {
      preview.src = url;
      preview.style.display = "block";
    } else {
      preview.src = "";
      preview.style.display = "none";
    }
  }
  _saveRecipeBoxEditor() {
    const root = this._root;
    if (!root) return;
    const name = root.querySelector(".rb-input-name").value.trim();
    const description = root.querySelector(".rb-input-description").value.trim();
    const link = root.querySelector(".rb-input-link").value.trim();
    const category = root.querySelector(".input-category").value.trim();
    const image = root.querySelector(".rb-input-image").value.trim();
    const addAsSuggestion = root.querySelector(".rb-input-add-suggestion").checked;
    if (name) {
      // checkDuplicates=true - this IS the deliberate "add/edit a Recipe Box
      // entry" action, same as the modal's own _saveDishEditor.
      this._upsertDish(name, description, link, this._currentRbRating, this._editingDishUid, this._editingDishGrocyRecipeId, category, image, true);
      if (addAsSuggestion) {
        this._addSuggestion(name, description, link, this._editingDishGrocyRecipeId);
      }
    }
    this._closeRecipeBoxEditor();
  }
  _deleteRecipeBoxEditorDish() {
    if (!this._editingDishUid) return;
    const root = this._root;
    const name = root.querySelector(".rb-input-name").value.trim();
    const grocyNote = this._editingDishGrocyRecipeId ? " This will also delete it from Grocy." : "";
    if (!window.confirm(`Delete "${name}" from the Recipe Box?${grocyNote}`)) return;
    this._deleteDish(this._editingDishUid, this._editingDishGrocyRecipeId);
    this._closeRecipeBoxEditor();
  }
  // -------------------------------------------------------------------------
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
        <div class="fh-recipe-box-header">
          <div class="fh-recipe-box-title"></div>
          <button type="button" class="suggestion-add-btn add-dish-btn">+ Add Recipe</button>
        </div>
        <div class="recipe-box-actions">
          <button type="button" class="suggestion-add-btn recipe-box-select-btn">&#9989; Select</button>
        </div>
        <div class="recipe-box-select-bar" style="display:none;">
          <span class="recipe-box-select-count">0 selected</span>
          <div class="recipe-box-select-actions">
            <button type="button" class="recipe-box-select-cancel">Cancel</button>
            <button type="button" class="recipe-box-select-delete">Delete</button>
          </div>
        </div>
        <div class="recipe-box-search-row">
          <input type="text" class="loved-search" placeholder="&#128269; Search recipes..." />
          <div class="recipe-view-toggle">
            <button type="button" class="recipe-view-btn" data-view="grid" title="Grid view" aria-label="Grid view">&#9638;</button>
            <button type="button" class="recipe-view-btn" data-view="list" title="List view" aria-label="List view">&#9776;</button>
          </div>
        </div>
        <select class="recipe-sort-select">
          <option value="default">Sort: Default order</option>
          <option value="name">Sort: Name (A-Z)</option>
          <option value="suggested">Sort: Suggested first</option>
        </select>
        <div class="recipe-box-categories"></div>
        <div class="loved-list"></div>
      </ha-card>
      <div class="modal-overlay dish-detail-overlay">
        <div class="modal-box dish-detail-box">
          <button class="modal-close dish-detail-close" aria-label="Close">&#10005;</button>
          <h2 class="dish-detail-title"></h2>
          <img class="dish-detail-photo" style="display:none;" alt="" />
          <div class="dish-detail-rating"></div>
          <div class="dish-detail-desc"></div>
          <div class="dish-detail-link-row"></div>
          <div class="modal-actions">
            <button class="btn-cancel dish-detail-suggest-btn">&#128161; Suggest this</button>
            <button class="btn-cancel dish-detail-edit-btn">&#9999;&#65039; Edit</button>
            <button class="btn-clear dish-detail-delete-btn">&#128465;&#65039; Delete</button>
          </div>
        </div>
      </div>
      <div class="modal-overlay grocy-recipe-viewer-overlay">
        <div class="modal-box loved-box">
          <button class="modal-close grocy-recipe-viewer-close" aria-label="Close">&#10005;</button>
          <button type="button" class="grocy-recipe-viewer-back-btn" style="display:none;">&#8592; Back</button>
          <h2 class="grocy-recipe-viewer-title"></h2>
          <div class="grocy-recipe-viewer-tabs" style="display:none;"></div>
          <div class="grocy-recipe-viewer-status"></div>
          <div class="grocy-recipe-viewer-stats"></div>
          <div class="grocy-recipe-viewer-columns">
            <div class="grocy-recipe-viewer-main-col">
              <div class="grocy-recipe-viewer-servings"></div>
              <div class="grocy-recipe-viewer-scale-row" style="display:none;">
                <span class="grocy-recipe-viewer-scale-label">Scale ingredients for</span>
                <button type="button" class="grocy-recipe-viewer-scale-down" aria-label="Fewer servings">&#8722;</button>
                <span class="grocy-recipe-viewer-scale-value"></span>
                <span class="grocy-recipe-viewer-scale-unit">servings</span>
                <button type="button" class="grocy-recipe-viewer-scale-up" aria-label="More servings">&#43;</button>
              </div>
              <div class="grocy-recipe-viewer-ingredients"></div>
            </div>
            <img class="grocy-recipe-viewer-photo" style="display:none;" alt="" />
          </div>
          <div class="grocy-recipe-viewer-instructions"></div>
          <div class="grocy-recipe-viewer-description"></div>
          <div class="grocy-recipe-viewer-footer">
            <button type="button" class="suggestion-add-btn grocy-recipe-viewer-consume-btn">&#127860; Mark Consumed (deduct from Grocy stock)</button>
            <button type="button" class="suggestion-add-btn grocy-recipe-viewer-open-btn">&#128279; Open in Grocy</button>
            <div class="modal-actions grocy-recipe-viewer-recipe-actions" style="display:none;">
              <button type="button" class="btn-cancel grocy-recipe-viewer-suggest-btn">&#128161; Suggest this</button>
              <button type="button" class="btn-cancel grocy-recipe-viewer-edit-btn">&#9999;&#65039; Edit</button>
              <button type="button" class="btn-clear grocy-recipe-viewer-delete-btn">&#128465;&#65039; Delete</button>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-overlay rb-editor-overlay">
        <div class="modal-box">
          <button class="modal-close rb-editor-close" aria-label="Close">&#10005;</button>
          <h2 class="rb-editor-title">Add Recipe</h2>
          <label>Name<input type="text" class="rb-input-name" maxlength="120" /></label>
          <label>Notes<textarea class="rb-input-description" rows="2" maxlength="500"></textarea></label>
          <label>Link<input type="url" class="rb-input-link" placeholder="https://..." maxlength="500" /></label>
          <label>Category<input type="text" class="input-category" list="dish-category-options" placeholder="e.g. Dinner" maxlength="40" /><datalist id="dish-category-options"></datalist></label>
          <label>Photo URL<input type="url" class="rb-input-image" placeholder="https://..." maxlength="500" /></label>
          <img class="rb-image-preview" style="display:none;" alt="" />
          <div class="rating-row">
            <button type="button" class="rating-btn rb-btn-heart" title="Love it">&#10084;&#65039;</button>
            <button type="button" class="rating-btn rb-btn-thumbsdown" title="Not a fan">&#128078;</button>
          </div>
          <label class="remind-check-opt"><input type="checkbox" class="rb-input-add-suggestion" />&#128161; Also add to Meal Suggestions</label>
          <div class="modal-actions">
            <button class="btn-clear rb-editor-delete-btn" style="display:none;">Delete</button>
            <button class="btn-cancel rb-editor-cancel-btn">Cancel</button>
            <button class="btn-save rb-editor-save-btn">Save</button>
          </div>
        </div>
      </div>
    `;
    this._root = root;
    root.querySelector(".fh-recipe-box-title").textContent = this._config.title;
    root.querySelector(".add-dish-btn").addEventListener("click", () => this._openRecipeBoxEditor(null));
    root.querySelector(".loved-search").addEventListener("input", (e) => {
      this._lovedSearchTerm = e.target.value;
      this._renderLoved();
    });
    root.querySelectorAll(".recipe-view-btn").forEach((btn) => {
      btn.addEventListener("click", () => this._setRecipeBoxViewMode(btn.dataset.view));
    });
    root.querySelector(".recipe-sort-select").addEventListener("change", (e) => {
      this._recipeBoxSort = e.target.value;
      this._renderLoved();
    });
    root.querySelector(".recipe-box-select-btn").addEventListener("click", () => this._toggleRecipeBoxSelectMode(true));
    root.querySelector(".recipe-box-select-cancel").addEventListener("click", () => this._toggleRecipeBoxSelectMode(false));
    root.querySelector(".recipe-box-select-delete").addEventListener("click", () => this._deleteSelectedRecipeBoxItems());
    root.querySelector(".dish-detail-close").addEventListener("click", () => this._closeDishDetail());
    root.querySelector(".dish-detail-edit-btn").addEventListener("click", () => {
      const recipe = this._dishDetailRecipe;
      if (recipe) this._openRecipeBoxEditor(recipe);
    });
    root.querySelector(".dish-detail-delete-btn").addEventListener("click", () => {
      const recipe = this._dishDetailRecipe;
      if (!recipe) return;
      const grocyNote = recipe.grocyRecipeId ? " This will also delete it from Grocy." : "";
      if (!window.confirm(`Delete "${recipe.name}" from the Recipe Box?${grocyNote}`)) return;
      this._deleteDish(recipe.uid, recipe.grocyRecipeId);
      this._closeDishDetail();
    });
    // v1.118.0+: the same Grocy Recipe Viewer wiring as family-week-calendar-
    // card.js's own connectedCallback (see that file's own comment on this
    // exact block) - the viewer's methods are shared, but each card still
    // wires its own overlay's buttons since they're two separate DOM trees.
    root.querySelector(".grocy-recipe-viewer-close").addEventListener("click", () => this._closeGrocyRecipeViewer());
    root.querySelector(".grocy-recipe-viewer-back-btn").addEventListener("click", () => this._closeGrocyRecipeViewer());
    root.querySelector(".grocy-recipe-viewer-tabs").addEventListener("click", (e) => {
      const btn = e.target.closest(".grocy-recipe-viewer-tab-btn");
      if (!btn) return;
      this._switchGrocyRecipeViewerTab(btn.dataset.recipeTabId);
    });
    root.querySelector(".grocy-recipe-viewer-open-btn").addEventListener("click", () => {
      if (this._grocyRecipeViewerFallbackLink) window.open(this._grocyRecipeViewerFallbackLink, "_blank", "noopener");
    });
    root.querySelector(".grocy-recipe-viewer-consume-btn").addEventListener("click", () => this._consumeGrocyRecipeIngredients());
    root.querySelector(".grocy-recipe-viewer-scale-down").addEventListener("click", () => this._adjustGrocyRecipeViewerServings(-1));
    root.querySelector(".grocy-recipe-viewer-scale-up").addEventListener("click", () => this._adjustGrocyRecipeViewerServings(1));
    // v1.129.0+: Suggest/Edit/Delete for whichever Recipe Box entry this
    // viewer was opened FROM (see _openGrocyRecipeViewer's own comment on
    // _grocyRecipeViewerSourceRecipe) - only ever visible when there IS
    // one, i.e. when the viewer was opened by tapping a recipe straight
    // from the Recipe Box's own browse list, not from a meal preview or
    // any other call site that only ever has a bare Grocy recipe id.
    root.querySelector(".grocy-recipe-viewer-suggest-btn").addEventListener("click", (e) => {
      const recipe = this._grocyRecipeViewerSourceRecipe;
      if (!recipe) return;
      this._suggestDish(recipe);
      const btn = e.currentTarget;
      btn.textContent = "\u{2705} Added to Suggestions";
      setTimeout(() => {
        btn.textContent = "\u{1F4A1} Suggest this";
      }, 1600);
    });
    root.querySelector(".grocy-recipe-viewer-edit-btn").addEventListener("click", () => {
      const recipe = this._grocyRecipeViewerSourceRecipe;
      if (!recipe) return;
      this._closeGrocyRecipeViewer();
      this._openRecipeBoxEditor(recipe);
    });
    root.querySelector(".grocy-recipe-viewer-delete-btn").addEventListener("click", () => {
      const recipe = this._grocyRecipeViewerSourceRecipe;
      if (!recipe) return;
      if (!window.confirm(`Delete "${recipe.name}" from the Recipe Box? This will also delete it from Grocy.`)) return;
      this._deleteDish(recipe.uid, recipe.grocyRecipeId);
      this._closeGrocyRecipeViewer();
    });
    root.querySelectorAll(".rating-btn.rb-btn-heart").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._currentRbRating = this._currentRbRating === "up" ? null : "up";
        this._updateRatingButtons();
      });
    });
    root.querySelectorAll(".rating-btn.rb-btn-thumbsdown").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._currentRbRating = this._currentRbRating === "down" ? null : "down";
        this._updateRatingButtons();
      });
    });
    root.querySelector(".rb-input-image").addEventListener("input", (e) => this._setRecipeBoxEditorImage(e.target.value.trim()));
    root.querySelector(".rb-editor-close").addEventListener("click", () => this._closeRecipeBoxEditor());
    root.querySelector(".rb-editor-cancel-btn").addEventListener("click", () => this._closeRecipeBoxEditor());
    root.querySelector(".rb-editor-save-btn").addEventListener("click", () => this._saveRecipeBoxEditor());
    root.querySelector(".rb-editor-delete-btn").addEventListener("click", () => this._deleteRecipeBoxEditorDish());
    this._recipeBoxCategory = "All";
    this._renderRecipeBoxCategoryChips();
    this._updateRecipeBoxViewButtons();
    this._renderLoved();
    // v1.126.0+: this used to unconditionally call `_applyThemeVars()` here
    // too, but that ran the REAL theme resolution before `_hass`/
    // `_globalThemes` could possibly have anything in them yet, so it
    // always resolved to the plain local default - harmless on its own
    // (identical to this same class's `:host` CSS defaults above, so it
    // was a visual no-op) until `_applyThemeVars()` also started caching
    // its result: then this call would immediately overwrite whatever
    // `_applyCachedThemeVarsIfAny()` just applied two lines up in this
    // same `_build()` with that same premature default, defeating the
    // whole fix for this card specifically. Removed - `_applyCachedTheme
    // VarsIfAny()` already covers the "show something before hass is set"
    // job this line used to do, and the real `_applyThemeVars()` still
    // runs (and re-caches) once `_fetchSettings`/`_fetchGlobalThemes`
    // resolve for real, same as it always has.
  }
  // --- Baseline theming (new for this card, v1.111.0+) - see setConfig's
  // own comment on why this card never had any theming at all before. Same
  // shape (colors-only, no fonts) as every other simple standalone Family
  // Hub card (family-hub-rewards-card.js, family-hub-todo-card.js, etc.) -
  // duplicated (not shared/imported), same "independently loaded resources
  // duplicate small helpers" convention as everything else in this project. ---
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
  // Family Hub card - see family-hub-pantry-card.js's own
  // _getDeviceThemeOverride for the full reasoning (Settings lives only on
  // the calendar card).
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
    if (!this._root) return;
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
    // v1.126.0+: only cache once `_hass` is actually set. `_build()` (see its
    // own comment) calls this method once synchronously, before `hass` is
    // ever assigned, purely so a brand-new card with nothing cached yet
    // still shows SOME accent color instead of nothing at all. At that
    // point `_getSettings()`/`_globalThemes` can't have resolved a real
    // theme_override yet, so caching THAT premature fallback would
    // overwrite a perfectly good value left by an earlier page load with
    // the wrong one, on every single reload - the opposite of this fix's
    // whole point. Once `_hass` is set, this same method runs again for
    // real (from `_fetchSettings`/`_fetchGlobalThemes`) and caches the
    // actually-resolved value.
    if (this._hass && window.__familyHubThemeCache) window.__familyHubThemeCache.set(this._familyHubThemeCacheKey(), vars);
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
  _css() {
    return `
      :host {
        --fc-bg: #fbf7e5; --fc-card: #f5f3f0; --fc-border: #e6ddc4; --fc-text: #423d34;
        --fc-text-secondary: #96877a; --fc-accent: #8f5a00; --fc-accent-text: #fff8ea;
        --fc-accent2: #305545; --fc-accent3: #b5583c; --fc-surface-alt: #efe6cf;
        --fc-surface2: #f2eede; --fc-shadow: 0 2px 5px rgba(58, 53, 44, 0.16);
        display: block; font-family: inherit;
      }
      * { box-sizing: border-box; }
      ha-card { background: var(--fc-bg); color: var(--fc-text); border-radius: 14px; padding: 16px; }
      .fh-recipe-box-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
      .fh-recipe-box-title { font-size: 1.25em; font-weight: 800; }
      .recipe-box-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
      .recipe-box-select-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
      .recipe-box-select-actions { display: flex; gap: 8px; }
      .recipe-box-search-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
      .loved-search { flex: 1 1 auto; box-sizing: border-box; font-size: 15px; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-family: inherit; }
      .recipe-view-toggle { display: flex; gap: 4px; flex-shrink: 0; }
      .recipe-view-btn { border: 2px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); border-radius: 8px; width: 40px; height: 40px; font-size: 15px; cursor: pointer; }
      .recipe-view-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      .recipe-sort-select { width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 13px; margin-bottom: 10px; }
      .recipe-box-categories { display: flex; gap: 6px; flex-wrap: wrap; margin: -2px 0 12px; }
      .recipe-chip { border: 1px solid var(--fc-border); border-radius: 20px; padding: 5px 12px; font-size: 12px; font-weight: 700; background: var(--fc-card); color: var(--fc-text-secondary); cursor: pointer; white-space: nowrap; }
      .recipe-chip.active { background: var(--fc-accent); border-color: var(--fc-accent); color: var(--fc-accent-text); }
      .suggestion-add-btn { flex: 0 0 auto; min-height: 40px; padding: 0 16px; border: none; border-radius: 10px; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: var(--fc-shadow); }
      .loved-list.recipe-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 14px; }
      .loved-list.recipe-list { display: flex; flex-direction: column; gap: 8px; }
      .loved-empty { color: var(--fc-text-secondary); font-style: italic; text-align: center; padding: 20px 0; grid-column: 1 / -1; }
      .recipe-card { position: relative; border-radius: 16px; overflow: hidden; background: var(--fc-card); box-shadow: var(--fc-shadow); cursor: pointer; display: flex; flex-direction: column; transition: transform 0.12s ease; }
      .recipe-card:active { transform: scale(0.97); }
      .recipe-card-media { width: 100%; aspect-ratio: 1 / 1; background-size: cover; background-position: center; background-color: var(--fc-surface-alt); }
      .recipe-card-media-placeholder { display: flex; align-items: center; justify-content: center; background-image: linear-gradient(135deg, var(--fc-surface-alt), var(--fc-surface2)); }
      .recipe-card-media-placeholder span { font-size: 34px; font-weight: 800; color: var(--fc-text-secondary); opacity: 0.6; }
      .recipe-card-heart, .recipe-card-suggest { position: absolute; top: 8px; width: 30px; height: 30px; border-radius: 50%; border: none; background: rgba(255,255,255,0.88); font-size: 15px; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,0.2); padding: 0; }
      .recipe-card-heart { right: 8px; }
      .recipe-card-heart.is-loved { background: rgba(255,255,255,0.95); }
      .recipe-card-suggest.is-suggested { background: #ffe9a8; box-shadow: 0 0 0 2px #f2c94c inset, 0 1px 4px rgba(0,0,0,0.2); }
      .recipe-card-suggest { left: 8px; }
      .recipe-card-body { padding: 8px 10px 10px; flex: 1 1 auto; }
      .recipe-card-name { font-size: 13px; font-weight: 800; line-height: 1.25; color: var(--fc-text); word-break: break-word; }
      .recipe-card-category { display: inline-block; margin-top: 4px; font-size: 10px; font-weight: 700; color: var(--fc-text-secondary); background: var(--fc-surface-alt); border-radius: 8px; padding: 2px 7px; }
      .recipe-row { display: flex; align-items: center; gap: 10px; border-radius: 12px; padding: 8px; background: var(--fc-card); box-shadow: var(--fc-shadow); cursor: pointer; }
      .recipe-row:active { background: var(--fc-surface-alt); }
      .recipe-row-media { width: 52px; height: 52px; flex-shrink: 0; border-radius: 10px; background-size: cover; background-position: center; background-color: var(--fc-surface-alt); display: flex; align-items: center; justify-content: center; }
      .recipe-row-media.recipe-row-media-placeholder { background-image: linear-gradient(135deg, var(--fc-surface-alt), var(--fc-surface2)); }
      .recipe-row-media-placeholder span { font-size: 18px; font-weight: 800; color: var(--fc-text-secondary); opacity: 0.6; }
      .recipe-row-body { flex: 1 1 auto; min-width: 0; }
      .recipe-row-name { font-size: 14px; font-weight: 800; color: var(--fc-text); word-break: break-word; }
      .recipe-row-category { display: inline-block; margin-top: 3px; font-size: 10px; font-weight: 700; color: var(--fc-text-secondary); background: var(--fc-surface-alt); border-radius: 8px; padding: 2px 7px; }
      .recipe-row-actions { display: flex; gap: 6px; flex-shrink: 0; }
      .recipe-row-heart, .recipe-row-suggest { border: none; background: var(--fc-surface-alt); width: 32px; height: 32px; border-radius: 50%; font-size: 15px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
      .recipe-row-heart.is-loved { background: var(--fc-accent); }
      .recipe-row-suggest.is-suggested { background: #ffe9a8; box-shadow: 0 0 0 2px #f2c94c inset; }
      .recipe-row-select-badge, .recipe-card-select-badge { width: 24px; height: 24px; border-radius: 50%; border: 2px solid var(--fc-border); background: var(--fc-card); display: flex; align-items: center; justify-content: center; font-size: 13px; }
      .recipe-card-select-badge { position: absolute; top: 8px; right: 8px; }
      .recipe-card.is-selected, .recipe-row.is-selected { outline: 3px solid var(--fc-accent); }
      .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(40,34,20,0.45); z-index: 1000; align-items: center; justify-content: center; }
      .modal-overlay.open { display: flex; }
      .modal-box { position: relative; background: var(--fc-card); color: var(--fc-text); border-radius: 14px; padding: 24px 22px 18px; width: min(92vw, 480px); max-height: 85vh; overflow-y: auto; box-shadow: 0 8px 30px rgba(58,53,44,0.3); }
      .modal-close { position: absolute; top: 10px; right: 10px; width: 36px; height: 36px; border-radius: 50%; border: none; background: var(--fc-surface-alt); color: var(--fc-text); font-size: 18px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: var(--fc-shadow); }
      .modal-box h2 { margin: 0 26px 14px 0; font-size: 1.2em; color: var(--fc-text); }
      .modal-actions { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
      .modal-actions button { flex: 1 1 auto; min-height: 44px; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; box-shadow: var(--fc-shadow); }
      .btn-save { background: var(--fc-accent); color: var(--fc-accent-text); }
      .btn-clear { background: var(--fc-accent3); color: #fff8ea; }
      .btn-cancel { background: var(--fc-surface-alt); color: var(--fc-text); }
      .dish-detail-photo { width: 100%; max-height: 220px; object-fit: cover; border-radius: 12px; margin-bottom: 10px; }
      .dish-detail-rating { margin-bottom: 8px; }
      .event-info-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 14px; font-size: 13px; font-weight: 700; color: #3a352c; box-shadow: var(--fc-shadow); margin-right: 6px; }
      .pick-loved-btn { border: none; border-radius: 10px; background: var(--fc-surface-alt); color: var(--fc-text); font-size: 14px; font-weight: 700; padding: 10px 14px; cursor: pointer; box-shadow: var(--fc-shadow); }
      .rb-editor-overlay label { display: block; font-size: 12px; font-weight: 700; color: var(--fc-text-secondary); margin: 10px 0 4px; }
      .rb-editor-overlay input[type="text"], .rb-editor-overlay input[type="url"], .rb-editor-overlay textarea { width: 100%; box-sizing: border-box; font-size: 15px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--fc-border); background: var(--fc-bg); color: var(--fc-text); font-family: inherit; }
      .remind-check-opt { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 400; margin-top: 12px; }
      .rb-image-preview { width: 100%; max-height: 140px; object-fit: cover; border-radius: 10px; margin-top: 8px; }
      .rating-row { display: flex; gap: 10px; margin-top: 12px; }
      .rating-btn { flex: 1 1 auto; min-height: 48px; border-radius: 10px; border: 2px solid var(--fc-border); background: var(--fc-card); font-size: 22px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: var(--fc-shadow); }
      .rating-btn.active-up { background: #f2ddd4; border-color: #cf8f6c; }
      // v1.118.0+: the full in-card Grocy Recipe Viewer's CSS, copied
      // verbatim from family-week-calendar-card.js's own rules for these
      // same classes (the markup and the shared methods that populate it
      // are the exact same ones too) - see this file's own top comment.
      // --fh-header-offset (the calendar card's kiosk-mode header height)
      // has no equivalent on this card, so its var() fallback (0px) is
      // always what applies here - correct, since this card has no such
      // header to offset around.
      .grocy-recipe-viewer-overlay { top: var(--fh-header-offset, 0px); z-index: 1002; align-items: stretch; justify-content: stretch; padding: 0; }
      .grocy-recipe-viewer-overlay .modal-box { background: var(--fc-bg); width: 100%; max-width: 100%; height: calc(100vh - var(--fh-header-offset, 0px)); max-height: calc(100vh - var(--fh-header-offset, 0px)); border-radius: 0; box-shadow: none; box-sizing: border-box; padding: 28px max(22px, calc(50% - 380px)) 60px; overflow-y: auto; }
      .grocy-recipe-viewer-overlay .grocy-recipe-viewer-close { position: fixed; top: calc(14px + var(--fh-header-offset, 0px)); right: 14px; }
      /* Shown only when the viewer was opened via a picker's preview icon (task
      #177) rather than the normal "click a suggestion/meal's link" flow - lets
      someone check out a recipe without it feeling like they've left the
      picker underneath, which stays open and is exactly what "Back" returns
      them to (see _closeGrocyRecipeViewer). */
      .grocy-recipe-viewer-back-btn { display: none; }
      .grocy-recipe-viewer-overlay .grocy-recipe-viewer-back-btn { position: fixed; top: calc(14px + var(--fh-header-offset, 0px)); left: 14px; border: 1px solid var(--fc-border); background: var(--fc-surface-alt); color: var(--fc-text); border-radius: 20px; padding: 8px 16px; font-size: 14px; font-weight: 700; cursor: pointer; }
      .grocy-recipe-viewer-overlay .grocy-recipe-viewer-back-btn:active { background: var(--fc-border); }
      .grocy-recipe-viewer-overlay .grocy-recipe-viewer-title { font-size: 1.8em; text-align: center; margin: 4px 50px 6px; color: var(--fc-accent); }
      .grocy-recipe-viewer-overlay.preview-mode .grocy-recipe-viewer-title { margin-left: 70px; margin-right: 70px; }
      /* v1.114.0+ multi-recipe tabs (task: a meal card with more than one Grocy
      recipe attached - its main recipe plus any "additional recipes" that are
      themselves imported Grocy recipes, not just plain links - now shows every
      one of them as a tab here, so switching between e.g. a main dish and its
      side doesn't mean backing out and re-opening a different recipe). Same
      button-row idiom as .shopping-tabs/.shopping-tab-btn and .settings-tabs/
      .settings-tab-btn elsewhere in this file - a flex row of equal-width
      buttons, one highlighted .active - built dynamically in
      _openGrocyRecipeViewer instead of fixed markup, since a meal's recipe
      count varies. Hidden entirely (see the base "display:none" on the inline
      style in the DOM template) whenever a viewer is opened for just one
      recipe, which is every OTHER call site (additional-recipe links, Expiring
      Soon chips, Recipe Box dish detail, the picker preview icon) as well as a
      meal with only a main recipe. */
      .grocy-recipe-viewer-tabs { display: flex; gap: 8px; margin: 0 0 14px; flex-wrap: wrap; justify-content: center; }
      .grocy-recipe-viewer-tab-btn { flex: 0 1 auto; min-height: 36px; padding: 7px 14px; border-radius: 10px; border: 2px solid var(--fc-border); background: var(--fc-card); color: var(--fc-text); font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: var(--fc-shadow); }
      .grocy-recipe-viewer-tab-btn.active { background: var(--fc-accent); color: var(--fc-accent-text); border-color: var(--fc-accent); }
      /* The photo grabbed during recipe import (see create_grocy_recipe's
      picture upload) or added by hand in Grocy - hidden entirely when the
      recipe has none, in which case the ingredients column below just takes
      the full width (see .grocy-recipe-viewer-columns). */
      .grocy-recipe-viewer-photo { display: none; flex: 1 1 260px; min-width: 220px; max-width: 100%; max-height: 320px; object-fit: cover; border-radius: 12px; align-self: flex-start; }
      .grocy-recipe-viewer-status { font-size: 12px; color: var(--fc-text-secondary); padding: 2px 2px 10px; text-align: center; }
      .grocy-recipe-viewer-status.is-error { color: #b5583c; }
      /* Prep/Cook/Total stat pills (task #250) - only ever populated with real
      values parsed off the recipe (see _renderGrocyRecipeDetail); a recipe with
      none of the three published stays an empty, invisible row via :empty
      rather than showing a blank card, same treatment as every other optional
      field on this page. */
      .grocy-recipe-viewer-stats { display: flex; justify-content: center; gap: 10px; margin: 0 0 16px; flex-wrap: wrap; }
      .grocy-recipe-viewer-stats:empty { display: none; margin: 0; }
      .grocy-recipe-stat { background: var(--fc-surface-alt); border: 1px solid var(--fc-border); border-radius: 10px; padding: 8px 18px; text-align: center; min-width: 78px; }
      .grocy-recipe-stat-label { display: block; font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--fc-text-secondary); margin-bottom: 2px; }
      .grocy-recipe-stat-value { display: block; font-size: 15px; font-weight: 800; color: var(--fc-text); }
      /* Two-column reading layout (task #251) - ingredients (with their own
      scaler) on one side, hero photo on the other; wraps to a single stacked
      column on narrow widths via flex-wrap, and the photo simply isn't in the
      DOM's visible flow at all when the recipe has none (display:none above),
      so the ingredients column naturally takes the full width instead of
      leaving an empty gap next to it. */
      .grocy-recipe-viewer-columns { display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; margin-bottom: 10px; }
      .grocy-recipe-viewer-main-col { flex: 1 1 280px; min-width: 240px; }
      .grocy-recipe-viewer-servings { font-size: 12px; color: var(--fc-text-secondary); margin-bottom: 10px; }
      .grocy-recipe-viewer-scale-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--fc-text-secondary); margin-bottom: 14px; }
      .grocy-recipe-viewer-scale-row button { border: 1px solid var(--fc-border); background: var(--fc-surface-alt); color: var(--fc-text); border-radius: 8px; width: 28px; height: 28px; font-size: 16px; font-weight: 800; line-height: 1; cursor: pointer; flex-shrink: 0; }
      .grocy-recipe-viewer-scale-row button:active { background: var(--fc-border); }
      .grocy-recipe-viewer-scale-value { font-weight: 800; color: var(--fc-text); min-width: 20px; text-align: center; }
      .grocy-recipe-viewer-ingredients { margin-bottom: 14px; }
      .grocy-recipe-ingredient-group { font-size: 12px; font-weight: 700; color: var(--fc-text-secondary); text-transform: uppercase; letter-spacing: 0.03em; margin: 10px 0 4px; }
      .grocy-recipe-ingredient-group:first-child { margin-top: 0; }
      .grocy-recipe-ingredient-row { display: flex; align-items: flex-start; gap: 10px; padding: 6px 0; font-size: 14px; color: var(--fc-text); border-bottom: 1px solid var(--fc-border); }
      /* Numbered circular badge (task #251/mockup) standing in for the plain
      amount text that used to lead each row - the amount itself moved into the
      row's second line/span alongside the product name so nothing that used to
      be shown is lost, just restyled. */
      .grocy-recipe-ingredient-badge { flex: 0 0 auto; width: 24px; height: 24px; border-radius: 50%; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 12px; font-weight: 800; display: flex; align-items: center; justify-content: center; margin-top: 1px; }
      .grocy-recipe-ingredient-amount { font-weight: 600; color: var(--fc-text-secondary); }
      .grocy-recipe-ingredient-note { font-size: 12px; color: var(--fc-text-secondary); font-style: italic; }
      /* Numbered Instructions steps (task #252) - parsed from the recipe's own
      "Preparation" block when it has one (see _renderGrocyRecipeDescription);
      recipes without that exact structure never populate this element at all,
      so it stays empty/invisible via :empty and the raw description below
      carries the full instructions instead, same as before this feature. */
      .grocy-recipe-viewer-instructions:empty { display: none; }
      .grocy-recipe-instructions-title { font-size: 1.1em; font-weight: 800; color: var(--fc-accent); margin: 6px 0 10px; }
      .grocy-recipe-instruction-row { display: flex; align-items: flex-start; gap: 12px; padding: 8px 0; font-size: 14px; line-height: 1.5; color: var(--fc-text); }
      .grocy-recipe-instruction-badge { flex: 0 0 auto; width: 26px; height: 26px; border-radius: 50%; background: var(--fc-accent); color: var(--fc-accent-text); font-size: 13px; font-weight: 800; display: flex; align-items: center; justify-content: center; margin-top: 1px; }
      .grocy-recipe-instruction-text { padding-top: 3px; }
      .grocy-recipe-viewer-description { font-size: 14px; line-height: 1.5; color: var(--fc-text); }
      .grocy-recipe-viewer-description img { max-width: 100%; }
      .grocy-recipe-ingredients-accordion { margin: 10px 0; }
      .grocy-recipe-ingredients-accordion .accordion-toggle { font-size: 13px; padding: 8px 10px; }
      .grocy-recipe-ingredients-accordion .accordion-body { padding-left: 4px; }
      .grocy-recipe-viewer-footer { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
      .grocy-recipe-viewer-open-btn { width: 100%; box-sizing: border-box; }
      /* Consuming ingredients is a real, one-way Grocy stock deduction (see
         _consumeGrocyRecipeIngredients) - kept visually secondary next to Open in
         Grocy's solid accent button so it doesn't read as the default/expected
         tap, closer to how a "destructive-ish but sometimes wanted" action would
         look in a settings list than a bright primary call to action. */
      .grocy-recipe-viewer-consume-btn { width: 100%; box-sizing: border-box; background: var(--fc-surface-alt, #fff); color: var(--fc-text); border: 1px solid var(--fc-border); box-shadow: none; }
      .grocy-recipe-viewer-overlay .grocy-recipe-viewer-servings { font-size: 14px; }
      .grocy-recipe-viewer-overlay .grocy-recipe-ingredient-row { font-size: 15px; padding: 7px 0; }
      .grocy-recipe-viewer-overlay .grocy-recipe-instruction-row { font-size: 15px; }
      .grocy-recipe-viewer-overlay .grocy-recipe-viewer-description { font-size: 16px; line-height: 1.6; }
      .grocy-recipe-viewer-overlay .grocy-recipe-viewer-footer { max-width: 320px; margin: 14px auto 0; }
      // Base accordion/section-label classes the ingredients-accordion
      // rules above build on (.grocy-recipe-ingredients-accordion
      // .accordion-toggle/.accordion-body) - also copied verbatim from the
      // calendar card, which already has these for its OTHER accordions
      // (this card had none before now).
      .theme-section-label { font-size: 13px; font-weight: 800; color: var(--fc-text); margin: 6px 0 8px; text-transform: uppercase; letter-spacing: 0.02em; }
      .accordion-toggle { width: 100%; display: flex; align-items: center; justify-content: space-between; background: var(--fc-surface-alt); border: none; border-radius: 10px; padding: 10px 12px; cursor: pointer; box-shadow: var(--fc-shadow); }
      .accordion-toggle .theme-section-label { margin: 0; }
      .accordion-chevron { font-size: 12px; color: var(--fc-text-secondary); transition: transform 0.2s ease; }
      .accordion-toggle.open .accordion-chevron { transform: rotate(180deg); }
      .accordion-body { display: none; margin-top: 10px; }
      .accordion-body.open { display: block; }
      .rating-btn.active-down { background: #d8e3e0; border-color: #6f9a94; }
    `;
  }
}

class FamilyHubRecipeBoxCardEditor extends HTMLElement {
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
      theme_override: (typeof this._config.theme_override === "string") ? this._config.theme_override : "",
    };
  }
  _schema() {
    const base = FamilyHubRecipeBoxCard.getConfigForm().schema;
    return base.concat([
      {
        name: "theme_override",
        selector: { select: { mode: "dropdown", options: this._themeOptions || [{ value: "", label: "Use device settings (default)" }] } },
      },
    ]);
  }
  _render() {
    const { computeLabel } = FamilyHubRecipeBoxCard.getConfigForm();
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
      const merged = Object.assign({}, this._config, e.detail.value);
      this._config = merged;
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: merged }, bubbles: true, composed: true }));
    });
    this._form = form;
    this.appendChild(form);
  }
}

// v1.110.6+: applies the Recipe Box shared-logic object above onto this
// card's own prototype - see that object's own comment for why this is
// real sharing (same Function references), not a copy.
Object.assign(FamilyHubRecipeBoxCard.prototype, window.__familyHubRecipeBoxShared);

customElements.define("family-hub-recipe-box-card", FamilyHubRecipeBoxCard);
customElements.define("family-hub-recipe-box-card-editor", FamilyHubRecipeBoxCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "family-hub-recipe-box-card")) {
  window.customCards.push({
    type: "family-hub-recipe-box-card",
    name: "Family Hub Recipe Box",
    description: "Your Family Hub Recipe Box (\"Loved Dishes\") as its own dashboard tab - browse, search, add, edit, heart, and suggest dishes. Runs on the exact same shared logic as the Recipe Box modal in the weekly calendar card, so the two always behave identically.",
  });
}
