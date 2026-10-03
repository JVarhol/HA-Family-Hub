# Family Hub — Project Context for a New Claude Session

Read this whole file before touching anything. It exists so a fresh Claude session doesn't have to re-derive the project's architecture, conventions, and gotchas from scratch.

## Important: this document alone is not enough

This file explains the project. It does **not** give a new session the actual source code by itself.

**As of v99, the fix is in place**: the folder `C:\Users\jaret\Documents\FamilyHub` is connected as this project's persistent home. A new session with that folder connected can read/write `family_hub/__init__.py`, the test files, README.md, etc. directly on disk - no zip upload needed. If a new session reports the folder isn't connected, reconnect it via the folder-connect feature in the Claude desktop app before doing anything else; the fallback (attach `family_hub_v99.zip` and/or a fresh zip of this whole folder, have Claude unzip into its own workspace) still works but loses the "both sessions read/write the same files" property and is why several early sessions' work products (a `family_calendar_reminders` test file with no matching source, an old session's local fake-`homeassistant` test harness) went missing between sessions - see below.

### Rebuilding the Python test harness in a fresh cloud workspace

The 15 `test_*.py` files import `family_hub` against a **fake `homeassistant` package** (see Testing Conventions below) that a much earlier session hand-built at `/tmp/hatest` (mirrored to `/tmp/fcrtest` for `test_family_hub.py`'s own sys.path entry) - real Home Assistant is never installed, since it's a huge, unrelated dependency tree. That fake package is **not part of this folder** - it only ever existed in that old session's ephemeral `/tmp`, so a fresh cloud-workspace session (one not running with local `device_bash` access to a real Home Assistant `/tmp`) has to rebuild it from scratch before any Python test can even import successfully. This was done once already (v99) by iterating on the actual `ModuleNotFoundError`/`AttributeError` tracebacks until all 15 files ran; a reasonably complete stand-in now exists and should be rebuilt the same way (fast - under 20 minutes) if a session needs it again: minimal stub modules for `homeassistant.core`, `.config_entries`, `.components.{websocket_api,panel_custom,http,file_upload,frontend}`, `.helpers.{aiohttp_client,event,storage,selector}`, `.util.{dt,slugify}`, with real (not stubbed) datetime logic in `util/dt.py` since several tests depend on it, and `ActiveConnection.send_result/send_error/send_message` actually recording calls since `test_family_hub.py` instantiates it directly rather than using a bespoke `FakeConnection`. Also needed: a `/tmp/badgetest/node_modules` symlink to wherever `npm install jsdom` actually put `node_modules` (the JS test files `require()` that exact hardcoded path), and a symlink from the stale hardcoded path `/sessions/sharp-stoic-ramanujan/mnt/outputs` to this project folder (all 42 JS test files and 2 Python test files reference that literal path from the original long-running session).

**`test_family_calendar_reminders.py` fails and needs a decision, not a fix**: it imports a `family_calendar_reminders` package (its own `config_flow.py`/`const.py`, `_parse_overrides`/`_split_notify_target`/`_dedup_key`) that predates the merge into Family Hub (see "bundling three things that used to be separate installs" above) and simply isn't present anywhere in this folder or either zip. Either that source was never migrated here, or the test itself is stale and should be deleted - ask the user rather than guessing, and don't try to reconstruct that integration's logic from the test's assertions alone.

## What this project is

**Family Hub** (`family_hub`) is a custom Home Assistant integration built for one household, bundling three things that used to be separate installs:

1. **Family Week Calendar card** — a Lovelace card showing a multi-person weekly/monthly calendar with custody badges, reminders, countdowns, and meal planning overlaid on it.
2. **Meal planning + Recipe Box** — a full recipe manager (grid/list view, ratings, search, suggestions) integrated with **Grocy** (a self-hosted grocery/inventory manager) for recipe import, ingredient matching, stock tracking, shopping lists, and a Daily Digest notification.
3. **Theme Builder** — a sidebar panel + Theme Selector card for custom dashboard theming. Ships and registers, but is intentionally **not a documented/supported feature yet** (de-emphasized in the README for the beta).

It's a single HA custom component (`family_hub`, `iot_class: local_polling`) with a config flow / options flow covering initial setup (calendars, Grocy connection, todo lists, dashboard, notifications, Daily Digest).

## Current state

- **Version: 1.132.52** (`family_hub/manifest.json`). This value was stale (said 1.110.8) even before an earlier bump - keep it current by hand whenever you touch this doc, since nothing else auto-syncs it.
- Distributed two ways:
  - **Flat zip** (`family_hub_vNN.zip`) — contains a `family_hub/` folder at the zip root. For manual copy into `<config>/custom_components/family_hub` or the integration's own self-update (zip-upload) flow.
  - **`family-hub-repo.zip`** — a git-ready HACS layout (`custom_components/family_hub/` + `hacs.json` + `LICENSE` (GPLv3, "Bordello Labs") + `.gitignore` + `README.md`) for the user to push to GitHub themselves. Claude has no GitHub connector in this session, so this has always been prepared locally and handed off for the user to `git push`. Note: this `family-hub-repo/` working directory (and its LICENSE/.gitignore/hacs.json) does NOT persist between sessions the way `family_hub/`/`README.md`/`PROJECT_CONTEXT.md` do (unclear why - possibly just never committed to the session's persisted workspace before) - confirmed empty/absent at the start of this session despite this doc describing it as an established artifact, so it had to be rebuilt from scratch (see the v137→"GitHub release readiness" entry below for what that involved).
- **Real GitHub repo, confirmed this session via WebFetch: `https://github.com/JVarhol/HA-Family-Hub`** (GPLv3, matches this project, exists) - was last confirmed pushed around v95/1.63.0 and NOT kept in sync since (dozens of releases behind as of v137/1.102.0). `family_hub/manifest.json`'s `documentation` field and the README's HACS one-click badge previously pointed to `github.com/jaretvarholick/family-hub`, which 404s - both fixed to the real repo/owner this session. User confirmed via AskUserQuestion that JVarhol/HA-Family-Hub is correct. Two still-open cautions from earlier sessions, never confirmed resolved by the user: (1) a HACS "Repository structure ... not compliant" error previously traced to Windows 8.3 short-filename mangling (`CUSTOM~1`/`GITIGN~1`/`HACS~1.JSO`) from extracting the zip into a very deep path - worth re-warning the user to extract `family-hub-repo.zip` somewhere with a short path before `git init`/`git push`; (2) every version bump needs a matching GitHub Release (same version tag) pushed to their repo or HACS will only offer the latest commit SHA as "version" and refuse install.
- The user is running this on a real Home Assistant instance with a real Grocy instance and has been reporting real bugs from actual use (not hypothetical) — treat bug reports as ground truth about real household data (real product names, real recipe sites' messy HTML, etc.).

## Repository / file layout (inside this session's outputs folder)

```
family_hub/                          <- the actual integration, root = custom_components/family_hub contents
  __init__.py                        <- ~7000+ lines: setup, all websocket_api handlers, Grocy API calls,
                                         ingredient parsing/matching, recipe import, digest, reminders poller,
                                         chore sensor-trigger listener + native service registration, etc.
  config_flow.py                     <- setup wizard + options flow (calendars, Grocy, dashboard, notifications, digest)
  const.py                           <- CONF_* keys, domain constant, chores/rewards/permissions constants (v110+)
  grocery_reference.py               <- curated GROCERY_REFERENCE catalog used as a matching fallback
  updater.py                         <- zip-upload self-update installer logic
  store.py                           <- (v110+) Store factories/loaders for chores/rewards/permissions JSON stores
  chore_engine.py                    <- (v110+) chore state machine — create/assign/claim/complete/approve/
                                         reset_recurring_chore/sweep_overdue_chores/send_nudge — self-contained,
                                         never imports from __init__.py (see Chores architecture section below)
  reward_engine.py                   <- (v110+) star balances, reward catalog CRUD, instant self-serve redemption
  chores_websocket_api.py            <- (v110+) all family_hub/chores|rewards|permissions/* websocket commands,
                                         permission-gating. NOT named websocket_api.py deliberately - see this
                                         file's own docstring for the real import bug that name would cause
                                         (colliding with the already-imported homeassistant.components.
                                         websocket_api). Imported and aliased as chores_ws_api in __init__.py.
  todo.py                            <- (v110+) native todo.family_hub_chores entity (TodoListEntity), forwarded
                                         via async_forward_entry_setups — discovered by HA's own platform loader,
                                         never imported directly by __init__.py
  services.yaml                      <- (v110+) native service field/selector definitions for create_chore/
                                         complete_chore/approve_chore/nudge_user
  manifest.json                      <- version lives here
  strings.json / translations/en.json
  card/
    family-week-calendar-card.js     <- the Lovelace card, ~8500+ lines, single file, no build step
    family-hub-chores-card.js        <- (v110+) full Chores board — user columns + shared Chore Bin, drag-and-drop,
                                         creation form w/ Advanced Settings accordion, admin-only Permissions tab
    family-hub-my-chores-card.js     <- (v110+) context-aware personal chores view (reads hass.user.id) + claimable bin
    family-hub-rewards-card.js       <- (v110+) star economy ledger — balances, reward catalog, redemption history
  panel/
    theme-builder-panel.js
    theme-selector-card.js
  icon.png, icon@2x.png, logo.png, logo@2x.png

family-week-calendar-card.js          <- ROOT-LEVEL MIRROR of family_hub/card/family-week-calendar-card.js.
                                          Must be kept byte-identical via `cp` after every card edit. Nothing
                                          reads this automatically — it's just kept in sync as a convenience
                                          copy. ALWAYS diff/cp after editing the card.

family-hub-repo/                      <- git-ready HACS layout, rebuilt from family_hub/ before every release
  custom_components/family_hub/       <- exact copy of family_hub/ (verify with `diff -rq`)
  hacs.json
  LICENSE                             <- GPLv3, "Copyright (C) 2026 Bordello Labs"
  .gitignore
  README.md                           <- exact copy of root README.md

README.md                             <- root-level; doubles as user-facing docs AND the changelog of record.
                                          Every release adds a "## Changelog" entry here (newest first).

test_*.py  (20 files)                 <- see Testing Conventions below — runs clean under real pytest
test_*.js  (37 files)                 <- jsdom-based card tests — see Testing Conventions below

family_hub_v*.zip                     <- one per historical release, oldest to newest (don't delete; the
                                          outputs folder doesn't allow deleting/renaming written files anyway)
family-hub-repo.zip                   <- always the LATEST family-hub-repo/ packaged, overwritten each release
```

## Testing conventions — read this before running any tests

### Python (`test_*.py`)

`pytest` is installed and `python3 -m pytest test_*.py -q` runs clean (221 passed, 0 failures) against the current 20-file set - this IS a reasonable way to run the whole backend suite in one shot. Each file is also still a standalone script (defines functions/`async def` functions, then at the bottom has an `asyncio.run(run())`-style orchestrator with a final `print("ALL ... TESTS PASSED")`) and can be run directly when iterating on just one file:
```bash
python3 test_grocy_recipe_importer.py
```

Each test file mocks Home Assistant itself (`sys.path.insert(0, "/tmp/hatest")` points at a fake `homeassistant` package) and Grocy's HTTP API (`FakeSession`/`FakeGetSession`/`FakeJsonGetResponse` classes local to each test file). `check(cond, msg)` is the plain assertion helper used everywhere instead of `assert`.

`test_family_hub.py`, `test_config_flow.py`, `test_grocy_integration.py`, and `test_family_calendar_reminders.py` (all named in older notes below/above) have since been removed from the repo - their coverage was folded into other files or they tested modules/steps that no longer exist. If any of those names show up in an old note in this doc, treat the note as historical, not current.

**How the suite got to zero known failures** (kept for context in case pytest ever goes red across a wide, seemingly-unrelated swath of files again): an unguarded module-level `asyncio.run(...)` in two files (no `if __name__ == "__main__":` guard) poisoned pytest's shared event loop for every file collected afterward, fixed by adding the missing guard plus `__test__ = False` so pytest leaves those two standalone-script files alone; and nine files' shared `run(coro)` helper was hardened to create+set a fresh event loop when `asyncio.get_event_loop()` raises, rather than assuming one always exists. All previously-documented "known, pre-existing failures" (stale config-flow step order, a removed `family_calendar_reminders` module, an old `complete_chore` call signature) were tied to files that have since been deleted or fixed outright - there are currently no known-broken Python tests.

### JavaScript (`test_*.js`)

37 files as of the most recent cleanup pass (down from 59 - see "Test file consolidation" below). jsdom-based: `new JSDOM(...)`, then `dom.window.eval(src)` loads the actual card source, then `document.createElement("family-week-calendar-card")` + `.setConfig(...)` + a mock `_hass` object drives it. `check(cond, msg)` throws on failure.

**Every JS test file MUST end with `process.exit(0)` after printing its PASSED message.** The card's `connectedCallback` starts background timers (auto-refresh, countdown ticker, etc.) that keep Node's event loop alive forever otherwise — a test file without `process.exit(0)` will hang/timeout even though all its assertions already passed.

Run with plain `node`:
```bash
node test_grocy_recipe_importer.js
```
Running the whole suite in one `node` invocation per file can hit a 2-minute tool timeout if run as one giant shell command — split into two batches (~19 files each) when running all of them in an automated session.

There are currently no known-broken JS tests (all 37 files pass cleanly as of the last full sweep). The old list of "three known pre-existing failures" (`test_reminder.js`, `test_servings_scaling.js`, `test_reminders_feature.js`) referred to files that no longer exist in this repo - they were fixed or removed in an earlier session and this doc was never updated until now.

**Three distinct end-of-file conventions exist across these files** (undocumented until this pass, discovered the hard way while merging files together - matters a lot if you ever write a script that mechanically transforms multiple test files):
- **Convention A** (the majority): `run().then(() => process.exit(0)).catch((e) => { console.error(e.stack || e.message); process.exit(1); });` as a trailing statement AFTER the `run()` function definition. The exit call lives entirely in this external driver.
- **Convention B**: `process.exit(0);` is called as the LAST statement literally INSIDE `run()`'s own body, right before its closing `}`, with just `run().catch((e) => { ...; process.exit(1); });` as the external driver (no `.then()` at all). A script that only strips the external driver and assumes it owns the only `process.exit(0)` will get this wrong.
- **Convention C** (rarer, e.g. `test_notify_profile_permissions.js` before it was merged): the success message and `process.exit(0)` both live inside the external `.then()` callback (`run().then(() => { console.log("ALL ... PASSED"); process.exit(0); }).catch(...)`) rather than either of the above. Assertions still run correctly via `run()` itself; only the console message is easy to lose if a merge script only keeps what's textually before `run()`.

### Test file consolidation (most recent cleanup pass)

To cut down the number of separate files to launch without dropping any coverage, 31 small/related standalone JS files were merged into 9 combined files, each source file's entire original content (including its own fresh `new JSDOM(...)` setup - required, since two files can't both call `customElements.define()` on the same tag in one registry) wrapped in its own `async function sectionName() { ...; await run(); }`, with a single shared orchestrator at the bottom of the merged file awaiting each section in turn and owning the one `process.exit(0)`/`process.exit(1)` for the whole file. This preserves every original assertion (same coverage, fewer files to launch) while cutting the JS file count from 59 to 37.

The 9 merged files and what went into them:
- `test_chores_card_modal_ui.js` ← `test_chore_advanced_accordions.js`, `test_chore_assignment_mode_buttons.js`, `test_chore_monthly_nth_frontend.js`, `test_chore_recur_due_offset_frontend.js`, `test_chore_recur_interval_unit_frontend.js`, `test_chore_recur_preset_ui.js`, `test_chores_important_multiassign_library_frontend.js`, `test_chores_confetti.js`
- `test_routines_ui.js` ← `test_routine_automate_ui.js`, `test_routine_drag_reorder.js`, `test_routine_permissions_frontend.js`
- `test_kiosk_login.js` ← `test_kiosk_pin_accordion.js`, `test_kiosk_session_shared.js`, `test_kiosk_login_chores_card.js`, `test_kiosk_login_rewards_card.js`, `test_kiosk_todo_reconnect_sync.js`
- `test_screensaver_wake_dashboard.js` ← `test_shared_screensaver_wake_dashboard.js`, `test_main_screensaver_wake_dashboard.js`
- `test_settings_visibility.js` ← `test_settings_nonadmin_restriction.js`, `test_settings_child_account.js`, `test_notify_profile_permissions.js`
- `test_grocy_recipe_viewer_extras.js` ← `test_grocy_recipe_viewer_tabs.js`, `test_grocy_recipe_viewer_day_editor.js`
- `test_meal_planning_extras.js` ← `test_meal_name_suggestion.js`, `test_meal_view_card.js`, `test_meal_leftovers.js`
- `test_month_view.js` (absorbed `test_month_view_default_variant.js` into itself, keeping its own filename)
- `test_timers_extras.js` ← `test_active_timers_foreign.js`, `test_timer_alarm_frontend.js`, `test_timers_cards.js`

Left standalone (either already ≥400 lines, so merging wouldn't meaningfully cut the file count further, or didn't fit the mechanical `run()`-wrapping pattern): `test_additional_recipes.js` (synchronous top-level `try/catch` + `process.exit(0)`, no `run()` function), `test_theme_selector_card.js` (no `run()` wrapper at all, pure top-level sequential statements), `test_theme_builder_panel.js` (uses `setTimeout(...)` for async sequencing instead of `run()`), `test_device_theme_override.js` (top-level synchronous code, bare `process.exit(0)` at module scope).

**If merging further test files in a future session**: reuse this same pattern (each original file's full content wrapped in its own `async function` with its own fresh JSDOM instance, one shared orchestrator awaiting each in sequence). Never reuse an input file's own name as the merged output's filename unless you've fully read that file's content into memory first and are certain nothing else still needs to read the original from disk - one merge in this pass briefly overwrote `test_month_view.js` with itself before its original content had been captured, and it had to be recovered from the user's synced copy on their computer. Safer to always pick a new, distinct output filename for a merged group.

## Release / packaging process — do this every time, in order

**The user only wants the flat `family_hub_vNN.zip` by default.** The
second, `family-hub-repo-vNN.zip` (HACS/GitHub repo layout), is built and
delivered ONLY when the user specifically asks for it in that session -
the user said so explicitly (verbatim: "You do not need to do a repo zip
file unless I specifically ask for it"), after several sessions in a row
where it was built and delivered unprompted alongside the flat zip every
single time. Steps 7 and 9's `family-hub-repo` half, and step 11's second
file, are conditional on that ask - everything else below still happens
every time.

1. Make the code change (usually in `family_hub/__init__.py` and/or `family_hub/card/family-week-calendar-card.js`).
2. Write/update tests for the change.
3. Run the **full** test sweep — `python3 -m pytest test_*.py -q`, all `test_*.js` files with `node`. Both suites are currently clean (0 known failures) - anything red is a real regression to chase down, not an accepted pre-existing failure.
4. If the card JS changed: `cp family_hub/card/family-week-calendar-card.js family-week-calendar-card.js` (root mirror) and `diff -q` to confirm.
5. Bump `family_hub/manifest.json`'s `"version"` (semver-ish, e.g. `1.66.0` → `1.67.0`).
6. Add a new entry at the top of `README.md`'s `## Changelog` section (newest first), and bump the version number mentioned in the README's opening paragraph. **Do not use a blind `replace_all` on version-number strings** — there are multiple different version numbers in the changelog history and a blind replace has previously corrupted old entries.
7. Strip `__pycache__`/`*.pyc` from `family_hub/` before zipping.
8. Build the flat zip: `zip -rq family_hub_vNN.zip family_hub` (flat layout, prefix intact — a past mistake zipped the *contents* of `family_hub/` at the zip root instead of the folder itself; always verify the zip listing has a `family_hub/` prefix on every entry). **Only if the user asked for the repo zip this session**, also rebuild `family-hub-repo/custom_components/family_hub/` from `family_hub/` (`rm -rf` + `cp -r`, then `diff -rq` to confirm byte-identical minus `__pycache__`), re-copy `README.md` into `family-hub-repo/README.md`, and `zip -rq family-hub-repo-vNN.zip family-hub-repo`.
9. Sanity-check the zip(s)' `manifest.json` version with `python3 -c "import zipfile,json; ..."`, and diff the flat zip's contents against source.
10. Deliver via `SendUserFile` — the flat zip alone by default, both only when the repo zip was asked for.
11. **Remind the user** (only relevant once they actually push a repo zip's contents): every version bump needs a matching GitHub Release (same version tag, e.g. `1.66.0`) pushed to their repo, or HACS will only ever offer the latest commit SHA as the "version" and refuse to let it be installed (`"The version <sha> for this integration can not be used with HACS"` — this exact error was hit and diagnosed earlier in this project).

## HACS / GitHub distribution — open item to reconcile

There's an **unresolved naming discrepancy** the user should confirm:
- `family_hub/manifest.json`'s `"documentation"` field and the README's HACS quick-add badge both say `github.com/jaretvarholick/family-hub`.
- The user's actual live HACS screenshots showed their repo as `github.com/JVarhol/HA-Family-Hub` (different owner casing/handle *and* a different repo name).

Ask the user which one is actually correct/live before generating any more GitHub links, and update `manifest.json`'s `documentation` field + the README's `hacs_repository` badge link (`owner=...&repository=...`) to match once confirmed.

Also previously diagnosed (not confirmed fixed by the user since): a HACS "Repository structure ... not compliant" error, traced to Windows 8.3 short-filename mangling (`CUSTOM~1`, `GITIGN~1`, `HACS~1.JSO` committed instead of `custom_components`, `.gitignore`, `hacs.json`) from extracting the zip into a very deep path. Worth re-asking the user if this ever got sorted out.

## Design conventions to follow when editing this codebase

- **"Simple over clever."** Ingredient matching is plain stdlib `difflib` + regex + a curated word list — no NLP, no ML, no external matching libraries. Follow that pattern for anything new in the same area.
- **The raw/original text is always preserved alongside any parsed/cleaned version.** Never let a parsing step silently discard what the user/recipe actually said — a wrong guess should always be visible and correctable, never silently destructive.
- **A manual picker or "+ Add new product" option is always the acknowledged fallback for a bad fuzzy match.** Features in this area are written expecting to sometimes get it wrong, with graceful, correctable fallbacks — not expected to be perfect.
- **Targeted, narrow fixes over broad algorithm rewrites**, especially for the ingredient-matching cutoff logic in `_ws_match_recipe_ingredients`. That function has accumulated several sequential, narrowly-scoped fixes (each with a comment explaining the exact real-world false-match it addresses) rather than one clever general-purpose rewrite — a new false-match report should get the same treatment: a small, well-commented, additive guard, not a refactor of the whole matching pipeline. Recent examples worth reading as a model: the `_pepper_kind` vegetable-vs-spice guard, `_whole_word_product_match`, `_split_combined_salt_pepper_line`.
- **"When in doubt, round up / err toward having enough"** — e.g. a recipe planned twice with different Servings values takes the larger value; a quantity range like "1-2" resolves to its upper bound. Apply the same bias for any new ambiguous-quantity situation.
- Every non-trivial helper function has a substantial docstring/comment explaining *why* it exists (usually citing the specific real household bug report that prompted it), not just what it does. Keep doing that — it's how this file stays maintainable at 4000+ lines with no other engineer around to ask.
- Comments avoid marketing language and are written in plain, specific, first-principles prose. Match that voice.

## Notification system architecture (as of v104, 1.72.0)

**This replaced the old flat, household-wide notify system - if you're reading old code/tests/comments that talk about `CONF_DEFAULT_NOTIFY`/`CONF_OVERRIDES_TEXT`/`notify_overrides` as if they're the live delivery path, they aren't anymore.**

Notifications are now per-user profiles, not a single admin-configured override table. Each Home Assistant login gets a profile stored in the schema-free Settings Store blob under `settings["userProfiles"][<hass_user_id>]`, shaped `{notifyTargets: [...], subscribedCalendars: [...], remindersEnabled: bool, digestEnabled: bool, digestSections: {calendar, reminders, meals, grocyExpiring, grocyLowStock}}` (`family_hub/const.py`'s `SETTINGS_KEY_USER_PROFILES`/`DEFAULT_DIGEST_SECTIONS`). Every notify-resolution call site in `family_hub/__init__.py` (`_run_poll`, `_poll_reminders_todo`, `_maybe_send_daily_digest`, `_build_daily_digest_message`, `_build_upcoming_summary`) now resolves targets via `_targets_for_calendar`/`_targets_for_reminders`/`_digest_recipients`, reading `profiles` loaded through `_get_settings_and_profiles(hass, entry_data)` — never the old `CONF_DEFAULT_NOTIFY`/`_parse_overrides` path. The Daily Digest is now built and sent **per recipient** (personalized by their own `digestSections`), not once for the whole household; dedup state is keyed `f"{entry_id}:{user_id}"` (`_digest_state_key`), not just by entry.

The old flat system (`CONF_DEFAULT_NOTIFY`, `CONF_OVERRIDES_TEXT`, `_parse_overrides`/`_overrides_to_text`, the `family_hub/get_notify_config`/`set_notify_overrides` websocket commands) was **deliberately left in place, not deleted** — it's dead as a delivery path but still serves as (1) the source data for a one-time, idempotent migration (`_migrate_notify_profiles`, guarded by `settings["notifyProfilesMigrated"]`) that runs once on integration load and converts any existing overrides into starting per-user profiles, and (2) legacy display in the Configure flow's options (now labeled "(Legacy)" in `strings.json`/`translations/en.json`). Don't "clean up" by deleting it without checking whether the migration or Configure's legacy display still reads it.

On the card side, Settings (`_openSettings`/`_saveSettings` in `family-week-calendar-card.js`) is now a wider modal with a top tab bar (`.settings-tabs`/`.settings-tab-btn`/`.settings-tab-panel`, horizontally scrollable on mobile) — **General** for everything Settings used to hold, **Notifications** for the new per-user system. The Notifications tab lists one row per Home Assistant user (`family_hub/list_users`, already existed for Screen Saver), each with an Edit button opening a per-person profile modal (`.notify-profile-overlay`) where calendar subscriptions/Reminders/Digest+sections are set; that modal's own "Notify targets" button opens a *nested* third-level modal (`.notify-devices-overlay`, the same add/remove-devices picker previously shared across 3 different old target shapes, now addressed by `userId` only) with a new **Auto-detect** button (own profile only — `family_hub/detect_notify_target`, which resolves strictly `connection.user.id`, never an arbitrary passed-in id) that matches a `person` entity's `device_trackers` to a live `notify.*` service. All of it is drafted in `_settingsUserProfilesDraft` (deep-cloned from `settings.userProfiles` on open) and written back wholesale into `settingsObj.userProfiles` on Save, same "whole-blob save" pattern the rest of Settings already uses.

**Explicitly deferred to a future update** (per the household's own request): multiple/targeted reminder delivery paths (routing one specific reminder to one specific person rather than everyone subscribed to it). The chores feature that was deferred here was built in v110 (1.77.0) — see below.

## Chores / Rewards / Permissions architecture (as of v110, 1.77.0)

A full household chore system, added as native Home Assistant citizens (services, events, a `todo` entity), not just cards. Three JSON stores parallel the existing Settings/Reminders stores, each created the same way (`Store(hass, VERSION, f"{PREFIX}_{entry.entry_id}")` in `store.py`, loaded in `async_setup_entry`, saved by the relevant websocket handler): `family_hub_chores.json` (chore records keyed by id), `family_hub_rewards.json` (`{balances, catalog, redemptions}`), `family_hub_permissions.json` (user_id → `{can_assign, can_verify, can_override_rewards}`).

**Circular-import avoidance**: `store.py`, `chore_engine.py`, `reward_engine.py`, `chores_websocket_api.py`, and `todo.py` are all self-contained — they import from `.const` and from each other where needed, but **never** from the package's own `__init__.py`. Instead they carry small local copies of tiny helpers (`_get_entry`/`_get_entry_data`, `_split_notify_target`) the same way `config_flow.py` already did before v110. `__init__.py` is the only file that imports them (aliasing the chores websocket module as `chores_ws_api`, and `store` as `chores_store`).

**A real bug hit and fixed post-delivery**: the chores websocket module was originally named `websocket_api.py` (matching the naming the rest of this doc still says in a couple of stale places if you find any). That broke the live integration with `Error during setup of component family_hub: module 'homeassistant.components.websocket_api' has no attribute 'async_register_all'` — a genuine Python import gotcha, not a typo: `__init__.py` already binds the module-level name `websocket_api` to `homeassistant.components.websocket_api` (`from homeassistant.components import panel_custom, websocket_api`, needed by the ~50 pre-existing `@websocket_api.websocket_command` decorators elsewhere in the file). A submodule of this package sharing that exact name means `from . import websocket_api as chores_ws_api` does **not** load the submodule at all — Python's `from package import name` only imports a same-named submodule when `hasattr(package, name)` is currently false, and it was already true (bound to the real HA module by that earlier import), so `chores_ws_api` silently ended up **being** `homeassistant.components.websocket_api` instead of the chores module. Confirmed empirically with a minimal repro before fixing. The fix was renaming the file to `chores_websocket_api.py` (not a workaround import order — renaming is the only fix that doesn't leave a fragile, order-dependent trap for the next edit), updating every `from . import websocket_api` / `import family_hub.websocket_api` reference (`__init__.py`, `test_chores_websocket_api.py`) to the new name, and updating comments across `chore_engine.py`/`reward_engine.py`/`store.py`/`todo.py`/`const.py` that mentioned the old filename. **Lesson for future modules in this package**: never name a new submodule the same as anything already imported by name (not aliased to something else) at the top of `__init__.py` — `websocket_api`, `panel_custom`, `Store`, etc. are all live landmines for this exact bug.

**Chore state machine** — exactly three statuses: `open` → `pending_verification` → `approved`. "open" covers both "unclaimed in the bin" and "assigned but not done"; `assigned_to` (person id, `"chore_bin"` sentinel, or `null`), not `status`, distinguishes those. There is no "overdue" status — overdue-ness is a computed condition against `due_date`, applied once via `sweep_overdue_chores` (called from the existing `_poll()` loop) and tracked with an internal `overdue_penalty_applied` bookkeeping flag so the one-time penalty never re-fires.

**Recurring chores**: a chore with an `auto_create_trigger` is its own reusable template — the SAME record cycles `approved → open` each time its trigger fires again (`reset_recurring_chore`), rather than spawning new records. This was a judgment call (the spec never explicitly defined recurrence); the schema having `auto_create_trigger` as a per-chore field, not a separate "template" concept, was the deciding signal.

**Permissions**: a real `hass.user.is_admin` account always has every permission, full stop — the permissions store can only ADD `can_assign`/`can_verify`/`can_override_rewards` to specific non-admin users on top of that baseline, never revoke from a real admin. Managing the permissions store itself (`family_hub/permissions/get`/`set`) is strictly real-admin-only — even a non-admin granted all three permissions can't open it. This is enforced in `chores_websocket_api.py` independent of what the Chores card's Settings → Permissions tab chooses to show (that tab is admin-only UI, per the household's own follow-up clarification during the build — "permissions management will be a new tab in the settings menu").

**Native services are NOT permission-gated** (deliberate, documented in `__init__.py`): a `family_hub.*` service call runs with whatever authority the household already gave the automation/script that invoked it, same as any other HA service (`light.turn_on` isn't per-user gated either). Only the interactive websocket API (the cards) is permission-checked.

**A second real bug, found right after v110 shipped (fixed in v111/1.77.1)**: none of the three new cards showed up in Home Assistant's "Add Card" picker. Every other card in this project (`family-week-calendar-card.js`, `family-today-card.js`, `family-hub-screensaver-card.js`) ends its file with a `window.customCards.push({type, name, description})` block, guarded by `window.customCards = window.customCards || []` and `if (!window.customCards.some(...))` - that array is specifically what HA's Lovelace card picker searches to build its visual "custom card" list; a card that only calls `customElements.define(...)` still *works* (it renders fine if you hand-type `type: custom:family-hub-chores-card` into a dashboard's YAML) but is invisible in the picker. The three v110 cards were missing this block entirely - copy-paste oversight, not caught by any test since the jsdom tests create the element directly via `document.createElement`, which doesn't touch `window.customCards` at all. This is also why the admin-only Permissions tab "seemed missing" - it lives inside `family-hub-chores-card`'s own Settings modal, so there was nowhere to find it until that card could actually be added to a dashboard. Fixed by adding the same `window.customCards.push(...)` block (plus a `customElements.get(...)` existence guard, matching the other cards, so a hot-reload doesn't throw "already been defined") to the end of all three files. **Lesson for any future new card in this project**: the `window.customCards` registration block is not optional boilerplate - a card without it is functionally broken for anyone using the visual card picker, and nothing in the existing jsdom test pattern catches its absence (worth adding a real check for `window.customCards` containing the right `type` to any new card test file's setup, not just `customElements.get(...)`).

**Sensor triggers**: rather than `async_track_state_change_event` per chore (the spec's suggestion), a single global `hass.bus.async_listen("state_changed", ...)` listener (`_async_setup_chore_sensor_listener` in `__init__.py`) scans all chores on every state change and filters internally — chosen because the watched entity set changes dynamically as chores are created/edited, and a global listener avoids re-subscription bookkeeping.

**Redemption is instant/self-serve** (confirmed with the household via AskUserQuestion): claiming a catalog item deducts stars and logs a redemption immediately, no admin approval step.

Cards: `family-hub-chores-card.js` (full board), `family-hub-my-chores-card.js` (personal view, reads `hass.user.id`), `family-hub-rewards-card.js` (ledger) — all follow the same self-contained theming pattern already established by `family-today-card.js`/`family-screensaver-card.js` (each fetches/resolves/applies its own `--fc-*` CSS vars via `family_hub/get_settings` + `theme_builder/list`, rather than inheriting document-level vars), and use the real custom-property names already in use across the codebase (`--fc-bg`, `--fc-card`, `--fc-border`, etc.) rather than the different names the original feature spec guessed. **As of v112 (1.78.0), the Permissions tab described above no longer lives inside `family-hub-chores-card.js`'s own Settings modal — see the next section.** `family-hub-chores-card.js` itself no longer has a Settings modal at all.

## Settings relocation + per-user Chores enablement (as of v112, 1.78.0)

Household request (verbatim, paraphrased down to the actionable parts): every Family Hub setting should live in one place — the Family Week Calendar card's own Settings modal — not scattered across each card's own Settings; the Notifications tab there should broaden into a Users page; chores should be enable-able per person, with only enabled people showing up on the Chores board; and the Daily Digest should be able to include a person's own pending chores.

**Settings relocation**: the admin-only Permissions tab (`can_assign`/`can_verify`/`can_override_rewards` checkboxes per Home Assistant user, wired to `family_hub/permissions/get`/`.../set` — see the v110 section above) moved out of `family-hub-chores-card.js`'s own Settings modal (deleted entirely — `_openSettingsModal`/`_permissionsTabHtml`/`_savePermission`, the `.settings-btn`, and all the related CSS are gone from that file) into a new **Permissions** tab (`.permissions-tab-panel`, `.perm-rows-list`) on `family-week-calendar-card.js`'s existing Settings modal, alongside General and the renamed Users tab. The backend commands themselves are completely unchanged — same strictly-admin-only enforcement in `chores_websocket_api.py`, independent of which card's UI happens to expose them (that enforcement is the whole reason moving the UI was safe to do without touching the backend at all). The calendar card only shows the Permissions tab button (`.permissions-tab-btn`) to `hass.user.is_admin` and fetches `family_hub/list_users` + `family_hub/permissions/get` once per Settings-open (`_fetchPermissionsData`); each checkbox saves immediately on change (`_savePermissionCheck`), matching exactly how the old chores-card Permissions tab behaved — this is the one part of Settings that does NOT wait for the modal's Save button.

**Notifications tab → Users**: same tab (`data-settings-tab="notifications"` internally, unchanged — only the visible button label changed, from "Notifications" to "Users", to avoid a much larger and riskier rename of the tab's DOM plumbing and every test that selects it by that attribute), same per-person profile list and `.notify-profile-overlay` editor modal, now covering more than notifications: it also has a **Chores** on/off toggle (`.notify-profile-chores-btn`) and a **"Their own pending chores"** Daily Digest checkbox (`.notify-profile-section-check[data-section="chores"]`).

**`choresEnabled` (full opt-out, default true)**: a new per-user profile field (`settings.userProfiles[uid].choresEnabled`), added to `_default_user_profile()` in `__init__.py`, `_get_user_profiles()`'s normalization there, `_defaultUserProfile()` and `_normalizeUserProfiles()` in `family-week-calendar-card.js`, and `SETTINGS_KEY_CHORES_ENABLED` in `const.py`. Defaults **true** (opt-out, not opt-in) everywhere it's read, specifically so installing this update doesn't silently drop any existing user off the Chores board or out of assignment pickers — every "is it enabled" check reads as "`choresEnabled !== False`", never a plain truthiness check that would treat "field doesn't exist yet" as false. Two AskUserQuestion decisions from the household settled the scope precisely:
- **Disable scope: "Full opt-out"** — turning `choresEnabled` off for someone hides their column on the Chores board (`family-hub-chores-card.js`'s `_columns()`) AND removes them from every new-assignment picker (the create-chore form's "Assigned to" dropdown and the rotation-group multi-select, both built from `_enabledUsers()` now instead of the raw user list) — but anything already assigned to them when they're disabled is left exactly as-is, not force-reassigned. My own resolution of the implied edge case (never explicitly specified): a disabled user who still has an outstanding (non-`approved`) chore keeps their board column, as a deliberate fallback so nothing gets silently orphaned or hidden — `_columns()` unions `_enabledUsers()` with "anyone who has a chore assigned to them that isn't approved yet", then drops in the Chore Bin column last.
- **Digest scope: "Just their open, not-done chores"** — the new Daily Digest section only counts chores with `status == "open"` assigned directly to them, not anything already `pending_verification` (that's done and waiting on someone else, not something they still need to act on).

**Backend enforcement is independent of the UI, not just hidden buttons**: `chore_engine.py` stays fully self-contained (never imports `__init__.py` or the Settings store, per its own module docstring — see the v110 circular-import-avoidance note above) but now accepts an optional `is_user_enabled: Optional[Callable[[str], bool]] = None` parameter on `create_chore`/`assign_chore`/`claim_chore`/`update_chore` (`chore_engine.IsUserEnabled`), the exact same dependency-injection shape as `send_nudge`'s pre-existing `split_notify_target` parameter. `None` means "not enforced" (tests, or a caller that genuinely wants to bypass it); every real caller builds and passes in the actual callback. `_check_user_enabled` (the shared internal helper) never checks `CHORE_BIN_SENTINEL` or `None` — sending a chore back to the bin, or leaving it unassigned, is always allowed regardless of anyone's enabled state; only naming a specific real person as the new assignee (direct `assigned_to`, a rotation-group member, an `assign_chore`/`claim_chore` target) triggers the check, raising `ChoreError("user_chores_disabled", ...)` if that person's chores are off. `chores_websocket_api.py` builds the real callback via `_make_is_user_enabled(entry_data)` (loads the Settings store fresh per call, closes over one load rather than re-loading per rotation-group member) and passes it into every relevant `chore_engine` call in `ws_create_chore`/`ws_update_chore`/`ws_assign_chore`/`ws_claim_chore`. `__init__.py`'s native `family_hub.create_chore` service does the same via an inline lambda in `_handle_create_chore`.

**Digest personalization**: `_build_daily_digest_message` in `__init__.py` gained a `user_id: str | None = None` parameter — unlike every other digest section (household-wide content gated only by a `digestSections` boolean), the new "pending chores" section is inherently about one specific person's own assignments, so it's skipped entirely without a `user_id` in hand (e.g. the Configure options-flow preview, which has no single recipient), regardless of `digestSections["chores"]`. `DEFAULT_DIGEST_SECTIONS` in `const.py` gained a `"chores": True` entry alongside every other section. Both real call sites (`_ws_send_daily_digest_now`, and `_maybe_send_daily_digest`'s per-recipient loop) already had `user_id` in scope and now pass it through as the 4th positional argument.

**Scope note**: "chore chart" in the household's own words means specifically the `family-hub-chores-card` board/columns — `choresEnabled` does NOT touch `family-hub-my-chores-card` (a disabled person's own personal chores view still works normally) or `family-hub-rewards-card` (redeeming rewards is unaffected); it's purely a Chores-board-columns-and-new-assignment-eligibility control.

New/extended test coverage: `test_chores_card.js` (rewritten — the old Permissions-tab assertions are gone since that UI no longer exists in this card; new assertions cover enabled-only board columns, the disabled-with-outstanding-chore column-retention fallback, and enabled-only "Assigned to"/rotation-group picker options), `test_chore_engine.py` (nine new tests: each of create/assign/claim/update's `is_user_enabled` enforcement, both the rejection and the "bin/None is always allowed" carve-out), `test_chores_websocket_api.py` (four new tests covering `_make_is_user_enabled`'s real wiring through `ws_create_chore`/`ws_assign_chore`/`ws_claim_chore`, including the default-true-with-no-profile-yet case), and a new `test_daily_digest_chores_section.py` (the digest section's sorting, the pending_verification/bin/other-user exclusions, the `digestSections["chores"] = False` override, and the no-`user_id` skip).

**Superseded as of v115 (1.80.0) — see the dedicated section below.** `choresEnabled` and `SETTINGS_KEY_CHORES_ENABLED` are gone entirely, replaced by `settings.memberUserIds`/`SETTINGS_KEY_MEMBER_USER_IDS` - a single opt-in gate that now also covers the Users tab and Permissions tab, not just the Chores board. Everything in this section is historical (accurate for what v112 actually shipped) - do not use it as a guide to current behavior.

## Explicit Family Hub membership (as of v115, 1.80.0)

Household request (verbatim, paraphrased): "redo the settings to select the users you would like to have as part of the calendar - right now it shows all users. You should have to add users individually to Family Hub and then they show up in Users tab and Permissions." Two AskUserQuestion decisions settled the scope precisely:
- **Gate scope: "Everywhere, including Chores"** — being "added" became the single gate for the Users tab, the Permissions tab, AND the Chores board/assignment pickers all at once. This is what retired v112's separate per-user `choresEnabled` toggle entirely, rather than keeping it as a second parallel concept alongside membership.
- **Removal behavior: "Leave it alone, just hide them"** — un-adding someone never deletes or reassigns their profile, permission grants, or existing chore assignments; it only hides them from pickers/tabs. Re-adding them later restores full visibility automatically, since nothing was ever actually removed from storage.

**The core polarity flip, and why it needed a migration**: `choresEnabled` was opt-OUT (defaulted `True`, so nobody regressed on upgrade). `memberUserIds` is deliberately opt-IN (`settings["memberUserIds"]`, a plain list of HA user ids — see its docstring in `const.py`) — nothing shows up unless explicitly added, matching the household's literal ask. But every household that had used Family Hub before this version already had everyone showing up everywhere (that was the bug being fixed), so simply defaulting to "nobody" would have made every existing user vanish from the Users tab, Permissions tab, and Chores board the instant this shipped. `_maybe_migrate_member_user_ids` in `__init__.py` (called once from `async_setup_entry`, right after both `settings_store` and the Permissions store are loaded — that ordering is why the call sits where it does, after `permissions` is loaded rather than up near `settings_store`'s own creation) backfills `memberUserIds` from `set(settings["userProfiles"].keys()) | set(permissions.keys())` — but **only** the very first time, guarded by the key's own presence (not a separate migrated flag): once it exists, even saved back as an explicitly empty list by someone removing everyone, it's never touched again. A genuinely fresh install (no prior `userProfiles`/`permissions` at all) backfills to an empty list — same net effect as if the household had added zero people by hand, which is the correct opt-in outcome for a brand new setup.

**Backend surface**: `_get_member_user_ids(settings)` in `__init__.py` is the defensive read helper (mirrors `_get_user_profiles`'s own defensiveness — malformed/missing degrades to "nobody", never raises, and critically never accidentally means "everybody", since fail-closed is the safe default for an opt-in gate). `chores_websocket_api.py`'s `_is_user_family_hub_member` (renamed from `_is_user_chores_enabled`) reads `settings["memberUserIds"]` the same way for the interactive websocket path; `__init__.py`'s native `family_hub.create_chore` service builds its own membership-checking lambda inline in `_handle_create_chore`. **Deliberately did NOT rename** `chore_engine.py`'s `IsUserEnabled` type, `is_user_enabled` parameter name, `_check_user_enabled` helper, or the `"user_chores_disabled"` error code — only their docstrings/comments and the user-facing error message text changed ("This person hasn't been added to Family Hub yet..." instead of "...has chores turned off..."). Renaming those would have been a large, purely-cosmetic ripple across `chore_engine.py`, every call site in `__init__.py`/`chores_websocket_api.py`, and every existing test, for zero behavioral gain — the dependency-injection shape (`Callable[[str], bool]`) is identical regardless of what real-world concept the callback happens to check today, and the type/param names already read fine either way.

**`family_hub/list_users` stays unfiltered on purpose** — it's still the raw pool of every real (non-system-generated) HA login, used for two different things that both genuinely need the full list: Screen Saver's own per-login toggle (unrelated to Family Hub membership entirely), and the new "Add a person" picker's pool of who's available to add. Filtering to members happens client-side, wherever membership actually matters.

**Frontend (`family-week-calendar-card.js`)**: `settings.memberUserIds` (`_normalizeMemberUserIds` — dedupes, drops blanks, fails closed to `[]` on anything malformed) joins `userProfiles` as a top-level Settings field, edited via a new `_settingsMemberIdsDraft` array populated fresh in `_openSettings()` (same fresh-copy-on-open, merged-back-on-Save pattern as `_settingsUserProfilesDraft`) and carried through `_saveSettings()` into the saved blob unchanged. The Users tab (`.notify-profiles-list`, `_renderNotifyProfilesList`) now filters to members only and gained an "Add a person" row (`.member-add-select`/`.member-add-btn`, `_renderMemberAddSelect`/`_addFamilyHubMember` — mirrors the existing notify-devices add-select/add-btn pattern) plus a per-row Remove button (`.notify-profile-row-remove-btn`, `_removeFamilyHubMember`) — no confirmation dialog, matching this file's own established convention (compare `.person-remove-btn`) that a fully reversible action doesn't need one. The Permissions tab (`_renderPermissionsList`) also filters to members, reading the same live `_settingsMemberIdsDraft` (not a saved/committed value) so adding or removing someone in the Users tab is reflected there immediately within the same Settings session, even though Permissions itself still saves each checkbox independently rather than waiting for the modal's Save button. The old `.notify-profile-chores-btn` on/off toggle (per-person profile modal) is gone entirely — `choresEnabled` was never a Settings-blob top-level field, so removing it was purely deleting the toggle's markup/populate/click-handler code, no data migration needed on the frontend side.

**`family-hub-chores-card.js`**: `_isUserChoresEnabled`/`_enabledUsers` renamed to `_isFamilyHubMember`/`_memberUsers`, now reading `this._settingsCache.memberUserIds` instead of a per-profile `choresEnabled` field. `_columns()`'s "still has an outstanding chore" fallback behavior is unchanged in shape — just triggered by non-membership instead of a disabled toggle. The `window.customCards` description text was also updated (no longer says "chores-enabled family member").

New/updated test coverage: a new `test_member_user_ids_migration.py` (backfill-from-union-of-profiles-and-permissions, never-runs-twice-even-if-saved-empty, fresh-install-backfills-to-empty-not-everyone, migration-also-writes-a-durable-backup-file, malformed-input handling, and `_get_member_user_ids`'s own defensive-defaults coverage). `test_chores_websocket_api.py`'s four `choresEnabled` tests rewritten around `memberUserIds` (including a new case: a completely empty Settings blob — no `memberUserIds` key at all — must reject, not allow, since default-false is the opposite of the old default-true test it replaces); `make_hass()` there also gained a default `settings={"memberUserIds": [...]}` (used only when the caller passes nothing at all) so the file's many unrelated permission/assignment tests didn't all have to opt in by hand under the new opt-in gate. Same pattern applied to `test_chores_todo_and_services.py`'s `make_entry_data()` and `test_chores_card.js`'s `makeHass()` default settings, and to three other JS test files (`test_multi_reminder_and_notify.js`, `test_countdown_list_and_digest.js`, `test_reminders_feature.js`) whose fixtures render the Users tab's profile-row list and needed an explicit `memberUserIds` to keep showing their fixture users. `test_chore_engine.py`'s existing `is_user_enabled` tests needed no behavioral changes at all (same callback shape, same param/type names) - only their comments were updated.

## Recent work (most recent first) — useful context for what's fresh

- **v223 (1.132.52)**: Household ask, verbatim: "Routines put the automation
  stuff under an accordion that says automate." Read as an imperative ("for
  Routines, put..."), matching what the code actually showed: the Routine
  tab's `.rm-automate-fieldset` (the single "Auto-complete trigger" entity/
  from-state/to-state fields, added back in v1.132.41 as the routine-item
  equivalent of a chore's own auto_complete_trigger) was a plain, always-
  visible `<fieldset>` on both the add-form (`_routineManagePaneHtml`) and
  each item's own inline edit-form (`_routineManageItemHtml`) - unlike the
  Chore create/edit modals' own Automate section, which has used the
  generic `.accordion-toggle`/`.accordion-body` pattern (`_wireAccordions`)
  since v211. Confirmed this reading against the existing code before
  touching anything (v1.132.41's own comment explicitly says the routine
  fieldset mirrors "the create-chore modal's own Automate accordion" in
  concept, just without ever actually getting the accordion wrapper).

  Implementation: wrapped both copies of the fieldset in the same
  `.accordion-toggle`/`.accordion-body` markup the Chore modals already
  use, with `data-i18n`-free but `_t`-driven labels (`chores.automate`,
  new key, "Automate"/"Automatisieren"/"Automatizar" - added to all three
  `translations/{en,de,es}.json` files and `strings.json` the same way the
  v1.132.51 category rename script did, via a small Python re-dump rather
  than hand-editing, inserted right before the existing `chores.auto` key
  for readability). Both accordions start closed by default, matching the
  Chore modal's own precedent (confirmed the Chore edit modal's Automate
  accordion does NOT auto-open even when a trigger is already configured -
  no special-casing needed here either, for consistency).

  Wiring needed care because the two copies have different lifecycles: the
  add-form's copy is part of the modal's static box HTML, built once when
  `_openCreateModal` opens it, so the existing one-time `this._wireAccordions
  (box)` call already there covers it for free - no code change needed
  beyond the markup itself. The per-item edit-form's copy, however, only
  exists in the DOM while that one item is being edited, and gets torn
  down and rebuilt via `.rm-list`'s `innerHTML` on every add/edit/delete/
  reorder/filter change (`_renderRoutineManagePane`) - so it needs its own
  `_wireAccordions` call every time that rebuild happens, or newly-added
  accordion toggles would sit there unwired and do nothing when clicked.
  Added exactly that: `_renderRoutineManagePane` now also calls `this.
  _wireAccordions(box.querySelector(".rm-list"))` right after the existing
  `_wireRoutineDragAndDrop(box)` call, scoped to `.rm-list` specifically
  (not the whole modal `box`) so it never re-wires (and double-fires
  clicks on) the add-form's own persistent Automate toggle, which lives
  outside `.rm-list` and was never destroyed/recreated by this rebuild.
  Gave the edit-form's accordion body a per-item id
  (`routine-edit-automate-body-${item.id}`) rather than reusing a single
  static id, since `_wireAccordions`'s own target lookup is a plain
  `box.querySelector(#id)` and only one item is ever mid-edit at a time in
  practice, but there's no reason to risk an id collision.

  Extended the existing `test_routine_automate_ui.js` (rather than adding
  a new file, since this is the same feature's own established test home)
  with two new blocks: the add-form's toggle exists, contains the right
  fields, starts closed, and actually opens/closes on click (also checking
  the toggle's own `.open` class flips, for the chevron rotation); and the
  edit-form's own copy, specifically proving it's still correctly wired
  AFTER a `.rm-list` rebuild (`_renderRoutineManagePane` called explicitly
  before checking) - the test that would have caught a "wired once at
  modal-open time, never rewired after rebuild" mistake if the fix had
  been implemented that way instead.

  Full suite re-run clean: all 61 JS test files (including the extended
  automate-UI test) and all 221 Python tests pass.

- **v222 (1.132.51)**: Bugfix, household report verbatim: "I set my language
  to German but the calendar and settings are still English." Came in
  right after v1.132.50's Calendar card crash fix, and initially looked
  like it might be the same investigation continuing, but turned out to be
  a genuinely separate, previously-undiscovered bug in the German/Spanish
  support feature shipped back in v1.132.44 - one that, as far as this
  investigation could tell, may never have actually worked end to end on a
  real household's Home Assistant instance (only ever verified via jsdom
  tests with a fully mocked `hass.localize`/`hass.loadBackendTranslation`,
  which can't catch a bug in how the REAL browser/backend resolve those
  calls).

  First ruled out the obvious alternative explanation by asking two direct
  questions rather than guessing: did the household actually install
  v1.132.50 and restart (yes), and - critically - did anything ELSE in
  Home Assistant switch to German besides Family Hub (yes - the sidebar
  and other core UI genuinely did). That second answer is what pinned this
  down as a real Family Hub bug rather than the language setting itself
  not having taken effect: `hass.language` on the browser side really was
  `"de"`.

  Tried to get direct browser console/network evidence next (the most
  reliable way to actually SEE what `hass.loadBackendTranslation` was
  doing), but the built-in browser pane still can't resolve `homeassistant.
  local` on this household's network (same mDNS/sandboxing issue hit
  earlier this session investigating the Calendar card crash - confirmed
  not transient, same failure on a second attempt after the MCP connection
  itself had dropped and reconnected mid-investigation). Asked the
  household whether to try Claude in Chrome (their real, actual browser)
  instead; they asked to skip browser access entirely and go straight to a
  code-based fix.

  Root cause, reasoned from the code and Home Assistant's known translation
  API behavior (not directly observed, given no browser access - see
  above): this whole i18n trio (`_t`/`_ensureTranslationsLoaded`/
  `_applyTranslations`, duplicated identically in both `family-week-
  calendar-card.js` and `family-hub-chores-card.js`) has used a custom
  translation category named `"frontend"` since v1.132.44, on the
  documented assumption that "nothing enforces a fixed category list at
  runtime" - true on the Python/backend side (`async_get_translations`
  does a generic `.get(category)` lookup, no enforced category whitelist),
  but this reasoning missed that `"frontend"` is ALSO the literal domain
  name of Home Assistant's OWN built-in frontend integration, which serves
  its own UI strings (sidebar labels, common panel titles, etc.) through
  this exact same generic backend translation API and almost certainly
  requests that same category for the current language on every app load.
  `hass.loadBackendTranslation` batches/caches its fetches per (language,
  category) on the frontend side - so once core's own request for
  `(language, "frontend")` had already been satisfied, Family Hub's own
  later `hass.loadBackendTranslation("frontend", "family_hub")` call could
  resolve from that same cache instead of ever actually performing a fresh
  fetch scoped to include Family Hub's own translations file - leaving
  `hass.resources` with core's own `"frontend"`-category data but NONE of
  Family Hub's own German/Spanish strings under it. Since `_t()`'s design
  already has `hass.localize()` return `""` (not the raw key, not a
  thrown error) whenever a key can't be found, this manifests as "every
  single Family Hub string silently falls through to its own hard-coded
  English fallback, forever" - not a crash, not a log entry anywhere
  (`_ensureTranslationsLoaded`'s own `.catch()` never even fires, since
  the promise still resolves "successfully" - it just resolves to
  translations that don't include Family Hub's own), which is exactly why
  extensive `ha_get_logs` searches for "translation" found nothing (unlike
  the v1.132.48/v1.132.49 formatjs bug, which genuinely did log every
  time), and exactly why this went unnoticed since v1.132.44 shipped - an
  English-speaking household would never trip this at all.

  Fix: renamed Family Hub's own custom translation category from
  `"frontend"` to `"fh_ui"` - a name nothing else in Home Assistant could
  plausibly already be using - in both card files' `_t()`/
  `_ensureTranslationsLoaded()` calls, all three `family_hub/translations/
  {en,de,es}.json` files' top-level key, and `family_hub/strings.json`'s
  own separate copy of that same top-level key (renamed via a small Python
  script re-dumping each file with `frontend` replaced by `fh_ui`,
  verified still-valid JSON with the expected top-level keys afterward).
  Also added a `console.warn` to both cards' own `_ensureTranslationsLoaded
  ().catch()` (previously a bare no-op) so that a genuine future load
  failure leaves a visible trace in the browser console instead of
  silently staying on English with zero trace anywhere, the same trap this
  bug itself fell into.

  Updated both `test_frontend_i18n.js` and `test_frontend_i18n_chores.js`
  fixtures/assertions from the old `"frontend"` category name to `"fh_ui"`
  (their `RESOURCES` mock keys and their `hass.__loadCalls[0].category`
  assertions) - these tests can't actually catch the underlying real-world
  caching-collision bug itself (their own `makeHass()` mock has no
  equivalent of Home Assistant's own core frontend pre-warming that cache
  first), but they do lock in the new category name going forward, and a
  comment on the assertion now explains why `"frontend"` wasn't safe.
  Remembered to also refresh both card files' cached copies under
  `/tmp/hatest_pkg/family_hub/card/` before re-running the suite (these
  two i18n test files, and ~30 other frontend test files, `require()` that
  cached copy rather than the repo path directly - editing the repo file
  alone doesn't change what they test until that copy is refreshed).

  Full suite re-run clean after the fix: all 61 JS test files (including
  the newly-updated i18n pair) and all 221 Python tests pass.

  Left honestly unresolved, and said so plainly in the changelog: this fix
  was shipped without ever directly observing the real bug in a browser
  console or network tab (browser access was offered and declined this
  round), so it's a well-reasoned diagnosis from the code and Home
  Assistant's documented translation-loading behavior, not a confirmed-via-
  observation root cause the way the v1.132.49 and v1.132.50 fixes were.
  The household needs to actually confirm German now shows correctly (and
  a hard-refresh of the dashboard is worth suggesting, in case their
  browser cached the empty/failed translation result from before) before
  this can be considered genuinely closed - if it isn't, the very next
  thing to ask for is the browser console output, now that a `console.warn`
  exists there to catch a genuine load failure.

- **v221 (1.132.50)**: Bugfix, household report verbatim: "The main card has
  a configuration error." This was reported right after v1.132.49's
  translation-log-spam fix and initially looked like it might be the same
  issue resurfacing, but it was a completely unrelated, pre-existing bug
  that had simply gone unnoticed until now. The household confirmed the
  affected card was the Family Week Calendar card, and — critically —
  Lovelace's own card-creation code catches whatever error a custom card's
  `setConfig()`/render path throws and shows a generic "Configuration
  error" box in the dashboard UI; that catch happens BEFORE the error ever
  reaches `window.onerror` or Home Assistant's server-side `system_log`, so
  extensive `ha_get_logs` searches (multiple search terms, `source="system"`,
  `level=ERROR`) never turned up anything for this card specifically, even
  though genuinely server-visible JS errors for OTHER unrelated cards
  (mushroom-badge-icon, a duplicate swipe-card custom-element registration)
  did show up that way. The real error message only ever existed in the
  browser's own UI - it took asking the household to open the dashboard in
  Edit mode / tap the error box directly to get the concrete detail text:
  **"this._t is not a function"**.

  Root cause, once that detail text was in hand: `family-week-calendar-
  card.js` and the newer standalone `family-hub-recipe-box-card.js` each
  define their own copy of a `window.__familyHubRecipeBoxShared` object -
  a set of methods (Recipe Box rendering/editing, plus, in the calendar
  card's copy only, `_t`/`_isAdmin`/`_myUserId`/`_hasPermission`/the
  permission-modal helpers/etc.) that both cards' classes pick up via
  `Object.assign(SomeClass.prototype, window.__familyHubRecipeBoxShared)`
  at the bottom of each file, so editing this shared block changes both
  cards identically (see `test_recipe_box_card_sharing.js`'s own header for
  why that matters to the household - "same exact code" was an explicit
  ask). Both files' own copies were guarded with `if (!window.__familyHub
  RecipeBoxShared) { window.__familyHubRecipeBoxShared = {...} }`, on the
  assumption that it didn't matter which file's copy "won" the race to
  define the global first, since `test_recipe_box_card_sharing.js` always
  evals the calendar card's file first and so never caught what happens in
  the other order. In reality, Home Assistant loads each registered
  dashboard resource as its own dynamically-imported ES module and does
  NOT guarantee execution order matches registration order - on this
  household's actual instance, the recipe box card's own file (whose copy
  of the shared object is smaller - only the ~54 Recipe-Box-specific
  methods it itself needs, never `_t` or the permission helpers, since it
  never calls any of those) was winning that race. Once
  `family-week-calendar-card.js`'s own `Object.assign(FamilyWeekCalendar
  Card.prototype, window.__familyHubRecipeBoxShared)` ran against that
  smaller object instead of its own, `_t` (and `_isAdmin`, `_myUserId`,
  `_hasPermission`, all the permission-modal methods, etc.) were simply
  never attached to `FamilyWeekCalendarCard.prototype` at all - so the
  very first call to `this._t(...)` during `_render()`/`setConfig()`
  threw immediately.

  Reproduced directly in a jsdom test before fixing anything: evaling
  `family-hub-recipe-box-card.js` before `family-week-calendar-card.js`
  left `FamilyWeekCalendarCard.prototype._t` as `undefined` (confirmed
  `typeof ... === "undefined"`), while evaling in the other order left it
  a function - proving this was a genuine, load-order-dependent race, not
  a guess.

  Fix: removed the `if (!window.__familyHubRecipeBoxShared)` guard from
  `family-week-calendar-card.js`'s own copy only - it now unconditionally
  (re)defines `window.__familyHubRecipeBoxShared` to its own complete,
  authoritative object every single time that module runs, immediately
  before its own `Object.assign` call uses it. This makes the calendar
  card immune to load order entirely: whichever file's module Home
  Assistant happens to execute first, by the time the calendar card's own
  `Object.assign` runs (always right after its own now-unconditional
  redefinition, within the same synchronous module evaluation), it's
  always using its own full object. `family-hub-recipe-box-card.js`'s own
  copy was deliberately left unchanged (still guarded the old way) - that
  file only needs its own smaller subset for standalone use when the
  calendar card's file isn't loaded at all, and if it happens to run
  first and do its own `Object.assign` against its own smaller object
  before the calendar card's file ever runs, that's harmless (it never
  calls any of the methods its own copy doesn't include).

  Re-verified with the same jsdom repro in both orders after the fix -
  `FamilyWeekCalendarCard.prototype._t` is a function either way now. Added
  a new dedicated regression test, `test_card_shared_object_load_order.js`,
  which evals the two card files in BOTH orders (the previously-broken
  recipe-box-first order, and the already-covered calendar-first order)
  and asserts the calendar card ends up with every method it needs
  (`_t`, `_isAdmin`, `_myUserId`, `_hasPermission`, `_canEditMenu`,
  `_canDeleteEvent`, `_removeSuggestion`, `_addSuggestion`, `_renderLoved`,
  `_upsertDish`) in either case, so this exact class of bug can't silently
  come back. Full existing suite re-run clean after the fix: all 61 JS
  test files and all 221 Python tests pass (`test_recipe_box_card_
  sharing.js`'s own "66 shared methods are the exact same Function object"
  assertion still passes unchanged, since the calendar-first order it
  always tests was never actually broken).

  Left deliberately unresolved / worth knowing: this bug's actual root
  cause (the load-order race) is very likely pre-existing since
  `family-hub-recipe-box-card.js` was added ("the new standalone... card"),
  not something this session's earlier v1.132.47/48/49 edits introduced -
  those only ever touched `_t`'s own method BODY and `_permissionDefs()`
  (confirmed inert at load/render time), never this file's position within
  the shared-object literal or the guard around it. The household's
  dashboard most likely just happened to hit the "wrong" load order for
  the first time recently (module load order across two independently-
  fetched dashboard resources can vary run to run depending on caching/
  network timing, not just be a fixed property of the install) - not
  something introduced by this session's own changes.

- **v220 (1.132.49)**: Follow-up bugfix - v1.132.48's own fix (immediately
  below) for the "Failed to format translation ... [formatjs Error:
  MISSING_VALUE]" log spam turned out to be WRONG. The household installed
  v1.132.48, did a full Home Assistant restart (confirmed - the boot's own
  "Waiting for integrations to complete setup" log entry timestamp,
  cross-checked against `ha_get_logs`, predates the next round of the same
  formatjs error by several minutes, so this wasn't a stale-restart false
  alarm), and the exact same `chores.next_x`/`chores.on_x`/`chores.
  last_done_by_x` MISSING_VALUE errors kept right on logging.

  v1.132.48's theory was that `hass.localize(key)` needed the substitution
  values passed directly into ITS OWN call, using what was assumed to be
  its accepted signature: flattened `(key, "name", value, "name2", value2,
  ...)` pairs - the older, Polymer-era Home Assistant frontend convention.
  That theory was wrong for this household's Home Assistant version
  (2026.9.1): passing `hass.localize(key, "x", "3pm")` most likely landed
  `"x"` itself as a single positional `values` argument in whatever this
  version's `localize()` actually expects (a single substitution object,
  `hass.localize(key, {x: "3pm"})`), so internally it tried to read `"x"`
  as if IT were the values object, found no `x` property on a plain
  string, and hit the identical MISSING_VALUE error as before - just
  masked behind different code.

  Rather than keep guessing Home Assistant's exact internal calling
  convention (which the household correctly pointed out had now failed
  once already), fixed this at the root instead: **the translation JSON
  files no longer use `{variable}`-style ICU placeholder syntax at all.**
  Every var-carrying key across `translations/en.json`, `translations/
  de.json`, `translations/es.json`, AND `strings.json` (the config_flow
  source-of-truth file - discovered it independently carries its own copy
  of the same `frontend` block, not auto-synced from `translations/
  en.json`, so it needed the identical fix or a future resync could
  silently reintroduce the bug) had every `{name}` token mechanically
  replaced with `%name%` (a short Python script walking the `frontend`
  subtree, matching `\{(\w+)\}` -> `%\1%`, run identically across all four
  files) - 18 keys total: `nav.label_weeks_out`, `nav.label_weeks_ago`,
  `event_info.block_fallback`, `event_info.replace_meal_confirm`,
  `event_info.delete_unsupported_alert`, `event_info.delete_confirm`,
  `settings.n_selected`, and eleven `chores.*` keys (`auto_completes_
  from_x`, `done_n_left`, `due_x`, `every_n_unit`, `last_done_by_x`,
  `next_x`, `on_x`, `rm_added_confirmation`, `start_n`, `the_x_weekend`,
  `the_x_y`). `%name%` isn't valid ICU MessageFormat syntax, so `hass.
  localize()`'s internal formatjs call never even recognizes it as an
  unresolved argument in the first place, on ANY Home Assistant version -
  no more guessing required.

  Both cards' own copy of `_t(key, fallback, vars)` (still independently
  copied, not shared, per this repo's usual convention) reverted to
  calling `hass.localize(key)` with no extra arguments at all, and their
  manual substitution step changed from `str.split(\`{${k}}\`)` to
  `str.split(\`%${k}%\`)` - so 100% of the variable substitution is done
  by this card's own code now, exactly as the ORIGINAL v1.132.44 i18n
  design always intended, just without the accidental curly-brace
  collision with formatjs's own syntax that caused this whole saga.

  Updated `test_frontend_i18n.js`'s and `test_frontend_i18n_chores.js`'s
  own RESOURCES mock fixtures and assertions to match (`{n}` ->
  `%n%` throughout - a mocked `hass.localize` doesn't run real formatjs at
  all, so these tests never actually exercised the bug itself, but they'd
  have silently drifted from the real translation files' new convention
  otherwise). Full Python suite (all `test_*.py`) and full JS suite (all
  56 `test_*.js`) re-run clean, individually timed rather than batched (a
  batched full-suite run hit the shell tool's own 2-minute cap purely on
  wall-clock, not a hang - each file exits cleanly on its own via
  `process.exit(0)`/`process.exit(1)`, confirmed by running them in two
  smaller batches instead).

  Left genuinely unresolved: whether this translation bug ever was, or
  ever was going to become, the actual cause of the household's separately
  -reported Calendar card "Configuration error" box - still no direct
  evidence either way (see v1.132.48's own entry below for the full
  investigation and what was ruled out). The household hasn't yet
  confirmed whether that box is still showing after this fix installs.

- **v219 (1.132.48)**: Bugfix, reported live by the household right after
  v1.132.47 went out: the Calendar card's main dashboard view was showing
  a bare Lovelace "Configuration error" box. Investigated at length (HA
  server-side logs via `ha_get_logs`, the running `family_hub` config
  entry's state, `node --check` on both changed card files, checking
  whether `_permissionDefs()`'s new entries were reachable from any
  setConfig/constructor-time code path - they weren't, that array is only
  ever read when the Notify Profile modal's Permissions accordion opens)
  never turned up a matching uncaught exception for the Calendar card
  specifically - Lovelace's own "Configuration error" box is generated by
  a try/catch INSIDE `createCardElement` that never reaches HA's server-
  side log or the browser's `window.onerror` handler, so this couldn't be
  confirmed or ruled out from the server side alone.

  What WAS found and confirmed real: the household pulled up Settings →
  System → Logs themselves and found `frontend.js.modern` logging
  `Failed to format translation for key 'component.family_hub.frontend.
  chores.next_x' ... [formatjs Error: MISSING_VALUE] The intl string
  context variable "x" was not provided` - **292 occurrences** in under an
  hour, for `chores.next_x`/`chores.on_x`/`chores.last_done_by_x`, in both
  `en` and `de`. Root cause: `_t(key, fallback, vars)` (the i18n helper
  copied into both `family-hub-chores-card.js` and `family-week-calendar-
  card.js`, v1.132.44+) called `hass.localize(`component.family_hub.
  frontend.${key}`)` with NO arguments, then tried to fill in `{x}`/`{n}`
  itself afterward via a manual `str.split("{k}").join(vars[k])` on the
  RETURNED string. But Home Assistant's own `localize()` runs the string
  through formatjs/ICU MessageFormat immediately, synchronously, as part
  of that same call - so it hits the unresolved `{x}` placeholder and logs
  a MISSING_VALUE error before this code's own find/replace ever gets a
  chance to run, then (per HA's own internal handling of that error, which
  the household's Chrome console apparently doesn't propagate as an
  "Uncaught error" the way the unrelated `mushroom-badge-icon` duplicate-
  registration crash logged elsewhere in the same window did - see that
  log entry, unrelated to Family Hub, from a different HACS card) falls
  back to `""`, silently discarding the translation and using the English
  fallback text even when the household's Home Assistant language is set
  to German. This never actually THREW past `_t()`'s own try/catch (so it
  wasn't crashing the render, just polluting the log at high volume and
  quietly losing German/Spanish text for every var-carrying string) -
  confirmed the Calendar card has the identical latent bug shape at its
  own var-carrying call sites (`nav.label_weeks_out`, `settings.
  n_selected`, `event_info.block_fallback`, `event_info.
  replace_meal_confirm`) even though none had shown up in the household's
  logs yet.

  Fixed in both cards' own copy of `_t()` (still copied, not shared - same
  "no code sharing across cards" convention as everything else in this
  repo): now builds an `["name", value, ...]` args array from `vars` and
  passes it straight into `hass.localize(key, ...args)`, which is
  `localize()`'s own documented substitution signature - so formatjs
  resolves the placeholder itself, correctly, in whatever language is
  active, instead of us guessing and patching the string after the fact.
  The old manual split/join is kept as-is right below, now only ever
  actually doing anything when `str` came from `fallback` (English, which
  still has a literal `{x}`/`{n}` in it, since `hass.localize` was never
  asked to resolve that string). Verified the fix by mocking `hass.
  localize` in a scratch jsdom script and confirming `_t("chores.next_x",
  "Next: {x}", { x: "3pm" })` now calls `localize("component.family_hub.
  frontend.chores.next_x", "x", "3pm")` and returns "Next: 3pm". Full
  existing Python and JS suites re-run clean, including the newest
  `test_routine_permissions*` files from v1.132.47 - no regressions.

  Left open: whether this translation-log-spam bug is actually what
  produced the household's "Configuration error" box, or whether that's a
  separate, still-unexplained issue - couldn't be confirmed either way
  without a browser DevTools console session on the affected device,
  which wasn't available this session (the built-in browser couldn't
  resolve `homeassistant.local` from its network context, and the desktop
  device's own local shell was blocked by an unrelated Windows-update
  issue preventing its mounted-folder access). If "Configuration error"
  recurs after this fix, the next step is getting the actual browser
  console error text (DevTools on a desktop browser pointed at the same
  dashboard, or long-pressing/tapping the error box on the tablet if the
  HA app surfaces more detail there) rather than guessing further from
  server-side logs alone, since Lovelace's own card-creation try/catch
  never reaches either the HA server log or `window.onerror`.

- **v218 (1.132.47)**: Two new granular Routines permissions, household ask
  verbatim: "Need a permission to add/delete routines both add/delete self
  and all so someone can't modify others." Before this, every routine-item
  write (create/update/delete/reorder - `ws_create_routine_item`/
  `ws_update_routine_item`/`ws_delete_routine_item`/
  `ws_reorder_routine_items` in `chores_websocket_api.py`) was gated on the
  single, broad `PERMISSION_ASSIGN` - so a non-admin without that grant
  couldn't touch even their OWN routine checklist (confirmed by
  `test_routine_reorder.py`'s own pre-existing forbidden-for-a-non-permitted-
  user case, which reorders that same user's own section and still gets
  rejected - left unchanged, still a valid regression guard for the
  default-deny baseline).

  **Backend (`const.py`/`chores_websocket_api.py`)**: added
  `PERMISSION_ROUTINES_MANAGE_OWN` (`can_manage_own_routines`) and
  `PERMISSION_ROUTINES_MANAGE_ANY` (`can_manage_any_routines`) to
  `const.py`, appended to `CHORE_PERMISSIONS`. Both are purely additive -
  `PERMISSION_ASSIGN`'s own existing reach over Routines is completely
  unchanged (an assign-permission holder, or a real admin, still manages
  every person's routines exactly as before). Added one shared helper,
  `_can_write_routine_items(entry_data, connection, target_user_id)`, that
  all four handlers now call instead of a flat `_has_permission(...,
  PERMISSION_ASSIGN)` check: allowed if a real admin, OR `PERMISSION_ASSIGN`
  (unchanged precedent), OR `PERMISSION_ROUTINES_MANAGE_ANY` (same reach,
  scoped to just Routines), OR `PERMISSION_ROUTINES_MANAGE_OWN` **but only**
  when `target_user_id` equals the acting user's own id - the one genuinely
  new pattern here, since every other permission in this file is a flat
  name lookup with no further comparison. `target_user_id` is whichever
  person's routine SECTION the write actually touches: the create/reorder
  request's own `user_id` field directly, or - for update/delete, which
  only ever carry an `item_id` - the EXISTING item's own `user_id`, looked
  up before the permission check now runs (both handlers were restructured
  to fetch-then-check instead of check-then-fetch, since there's nothing to
  check ownership against until the item's been found). Deliberately NOT
  elevation-aware (uses plain `_actor_id`/`_is_admin`/`_has_permission`, not
  `_effective_actor`/`_has_permission_ctx`) - the four routine-write
  handlers have never accepted an `elevation_token` in their websocket
  command schema, so this preserves that existing (if arguably incomplete)
  behavior rather than quietly expanding kiosk-elevation support as a side
  effect. New `test_routine_permissions.py` (15 cases) covers all four
  handlers × all five actor types (admin, `PERMISSION_ASSIGN` holder as a
  regression guard, `can_manage_any_routines` holder, `can_manage_own_
  routines` holder on their own vs. someone else's section, and no grants
  at all) against the project's usual `FakeUser`/`FakeConnection`/
  `FakeHass`/`FakeStore` fixtures (plus a new `FakeSettingsStore` for
  `_make_is_user_enabled`'s membership check, which `test_routine_
  reorder.py` never had to satisfy since it only ever called
  `routine_engine.create_item` directly for setup, never the `ws_create_
  routine_item` handler itself).

  **Frontend (`family-hub-chores-card.js`)**: added `_canManageRoutinesFor
  (userId)` (mirrors `_can_write_routine_items` exactly) and
  `_canManageAnyRoutines()` (true if the viewer holds ANY of the three
  grants at all - `can_assign` or either new one - used purely to decide
  reachability, e.g. the FAB). Replaced every routine-specific `_canAssign()`
  call site with `_canManageRoutinesFor(item.user_id)` /
  `_canManageRoutinesFor(userId)`: the board's per-item Edit/Remove buttons
  (`_routineItemCardHtml`), the per-person section's empty-state "manage
  items" hint (`_routineRowHtml`), and the Routine tab's own manage-list row
  (`_routineManageItemHtml` - drag handle, `draggable` attribute, AND its
  Edit/Remove buttons, which previously had no client-side gate of their
  own at all and relied solely on the FAB/modal being reachable). Left
  every unrelated `_canAssign()` call site alone (Goals, plain Chore cards,
  the general drag-handler attachment) - those aren't in scope for this ask.

  Discovered and fixed a blocking gap while wiring this up: the entire "+"
  FAB (the ONLY way to reach the Routine tab's manage pane at all) was
  unconditionally hidden via a flat `this._canAssign()` check in `_render()`
  - simply adding the new permissions server-side would have left them
  unreachable from the UI for anyone who had one but not `can_assign`. Fixed
  by broadening that check to `_canManageAnyRoutines()`. Confirmed this is
  safe to broaden (not just a client-side convenience) by reading
  `ws_create_chore`/`ws_create_goal`: both enforce their own, completely
  independent `PERMISSION_ASSIGN` check server-side regardless of what the
  FAB shows, so a routine-only viewer who somehow reached the Chore/Goal
  tabs would still get rejected there - but for better UX, `_openCreateModal
  ()` now also hides the Chore and Goal tab buttons entirely (and their
  panes stay hidden by default) for a "routine-only" viewer (`_canAssign()`
  false but `_canManageAnyRoutines()` true), landing them straight on
  Routine instead (`_wireModalTabs` defaults `box.dataset.activeTab` to
  `"routine"` when no Chore tab button exists, and pre-hides the modal's own
  Save button to match - Routine writes hit the server immediately per item,
  there's no batch Create/Save step for it). A `can_assign` holder still
  sees all three tabs with Chore active by default, unchanged. Also scoped
  the Routine tab's own person picker (`.rm-person` in
  `_routineManagePaneHtml`) to `this._memberUsers().filter(u =>
  this._canManageRoutinesFor(u.id))` instead of listing every household
  member unconditionally, so a `can_manage_own_routines`-only viewer only
  ever sees themselves there - picking a person and adding an item can
  never run into a surprise server-side rejection over the person chosen.

  Added the new `can_manage_own_routines`/`can_manage_any_routines` entries
  to `family-week-calendar-card.js`'s `_permissionDefs()` under a new
  "Routines" group (that one array/pair with `_savePermissionCheck` is what
  actually drives both the Settings → Permissions grid AND each person's
  own Notification Profile modal's Permissions accordion - without this
  there'd be no way for a household to actually grant either new
  permission to anyone, even with the backend/frontend gating above fully
  wired). New `test_routine_permissions_frontend.js` (12 assertions) covers
  `_canManageRoutinesFor`'s four grant combinations, FAB visibility
  broadening, `_openCreateModal()`'s tab-gating/default-tab/Save-button
  behavior for a routine-only vs. a `can_assign` viewer, the person
  picker's scoping, and the board-level item card's own edit-button gating.
  Full existing Python (all `test_*.py`) and JS (all `test_*.js`) suites
  re-run clean - zero regressions.

- **v217 (1.132.46)**: First i18n pass on `family-hub-chores-card.js`,
  continuing v215/v216 below. Household ask, verbatim: "Let's work on
  chores and routines next" - the second half of the ordering the household
  chose earlier ("Finish Settings, then Chores").

  This card's `_build()`-once static chrome is tiny compared to the
  Calendar card's (just the header action buttons and the Kiosk login
  modal - the four other modals, create/edit/detail/reject, all start as
  `<div class="modal-box"></div>` and get their real HTML written in fresh
  every time they open), so this pass leans almost entirely on the
  `_t()`-at-render-time strategy rather than `data-i18n` decoration - the
  board (`_render()`/`_choreCardHtml`), the Routines accordion
  (`_routineRowHtml`/`_routineItemCardHtml`), the Goals-in-Chores block
  (`_goalItemHtml`), the Waiting to Recur and Rewards columns, and the
  Routine Library "manage items" pane
  (`_routineManagePaneHtml`/`_routineManageItemHtml`) are all rebuilt from
  scratch on every render/toggle, so translating them is just wrapping each
  literal string in `this._t(key, fallback)` at the point it's already
  being built - no separate periodic sweep needed for any of it, unlike the
  Calendar card's `data-i18n` regions.

  Added the same `_t`/`_baseLanguage`/`_ensureTranslationsLoaded`/
  `_applyTranslations` quartet as the Calendar card (copied, not shared -
  see that file's own comment; still no code sharing across this repo's 11
  card files), wired into this card's own `set hass()`. New keys live under
  the SAME `"frontend"` category as the Calendar card's keys (both cards
  read/write `hass.resources` via the same `loadBackendTranslation("frontend",
  "family_hub")` call), just namespaced `chores.*` instead of `nav.*`/
  `settings.*`/etc., so the two cards' keys can never collide even though
  they share one translation file per language.

  Two module-level consts couldn't be translated directly since they sit
  outside the class and can't call `this._t()`: `ROUTINE_CATEGORY_LABELS`
  (Morning/Afternoon/Night) and `WEEKDAY_LABELS` (Mon/Tue/.../Sun - also
  used throughout the still-untranslated Create/Edit chore modals'
  recurrence UI). Added two small instance-method wrappers instead -
  `_routineCategoryLabel(cat)` and `_weekdayLabel(idx)` - that look up the
  module constant as fallback text and route it through `_t()` on the way
  out; every call site in today's covered surfaces (the board's Routines
  accordion, the recurrence description shared with the board's own
  Waiting to Recur cards, and the Routine Library manage pane) was switched
  to call these instead of indexing the const directly. `WEEKDAY_LABELS`
  itself is deliberately only translated at THESE specific call sites, not
  every one of its ~7 call sites in the file - the remainder
  (`_recurFieldsHtml`'s weekday-toggle buttons, the monthly-nth weekday
  row, the manage-pane's day toggles' OWN static labels at
  `_routineManagePaneHtml`'s dayToggles construction - already covered
  above - and a couple of spots inside the still-untranslated Create/Edit
  recurrence form) are left for the Create/Edit modals pass, so as not to
  half-translate a form that isn't otherwise touched yet.

  A `{n}`-substitution correctness check (learned from the "3/5/7 days"
  buttons bug fixed in v216): every dynamic string built this pass that
  needs a value spliced in (`chores.due_x`, `chores.next_x`,
  `chores.the_x_y`, `chores.every_n_unit`, `chores.done_n_left`,
  `chores.start_n`, etc.) goes through `_t(key, fallbackWithValueAlready
  InIt, {x: value})` - since this card's translation calls are all at
  render time (not a static sweep), `vars` substitution is always
  available and used consistently, unlike the Calendar card's static
  `data-i18n` sweep (which never passes `vars` at all - the whole reason
  that bug existed there). No equivalent bug exists in this pass because
  of that difference, but the fallback string is still written as already-
  interpolated English (e.g. `` `Due ${dueStr}` ``) with the SAME value
  also passed via `vars` under the literal `{x}` token the translation
  entries use - so English never depends on `vars` substitution actually
  firing (a translation-file typo in `{x}` would silently no-op on English,
  matching the Calendar card's existing tolerance for that class of typo).

  Backend: ~100 new `"chores.*"` keys (plus one new shared `"common.edit"`
  key, reused from the Calendar card's Edit-button pattern) added to
  `translations/en.json`, `de.json`, `es.json`, and `strings.json`, hand-
  translated for all three languages (not machine-translated) and cross-
  checked by script against every key the JS file actually references, to
  catch typos before shipping rather than relying on a translated string
  silently falling back to English at runtime.

  New `test_frontend_i18n_chores.js` (jsdom, all passing): the trio's
  `loadBackendTranslation("frontend","family_hub")` call; the static kiosk-
  login modal's heading/Cancel button/close-button title; a chore card's
  Done/Approve/Reject buttons; an empty column's placeholder text; the
  Rewards column's header/catalog-title once toggled on; the Routines
  accordion's category label AND `_weekdayLabel()` (exercised directly,
  not via a `days_of_week`-filtered board badge, since that would make the
  test's pass/fail depend on what day of the week it actually runs); the
  Routine Library manage pane's static form labels; plain English with no
  round trip; and no-`loadBackendTranslation`-at-all graceful fallback
  (this test needed `hass.localize` itself stubbed to always return `""`,
  not just `loadBackendTranslation` removed - see the test file's own
  comment on why: unlike the Calendar card's static sweep, this card's
  `_t()` calls happen at render time and read `hass.localize()` directly
  whenever it exists, regardless of whether THIS card's own
  `_ensureTranslationsLoaded` promise ever resolved). One fixture bug
  caught and fixed while writing the test, not a real code bug: an initial
  version of the Routines-accordion test used a fixed `days_of_week: [0,
  1]` (Mon/Tue) routine item, which silently failed depending on what day
  the test suite happened to run on - `_routineItemsFor()` filters to items
  that apply TODAY - fixed to `days_of_week: []` (applies every day)
  instead. Full suite re-run clean both before and after this pass's edits:
  all 58 JS test files, all 206 Python tests, zero regressions.

  Still English-only after this release: the Create/Edit chore modals'
  own fields (a large surface - recurrence UI, Advanced Settings,
  dependencies, auto-create/auto-complete triggers - deliberately deferred
  rather than rushed), the chore Detail modal's own labels (its shared
  `_recurDescriptionHtml`/`_statusLabel` pieces already translate, being
  reused from the board, but the rest of that modal's own template does
  not yet), the Reject modal, and every other companion card (Rewards,
  Goals, My Chores, Active Timers, Recipe Box, Pantry) - each maintains its
  own separate, currently-untranslated copy of this same
  `_t`/`_ensureTranslationsLoaded`/`_applyTranslations` pattern, since none
  of the 11 card files share code.

- **v216 (1.132.45)**: Second i18n pass, continuing v215 below. Household
  reply after v215 shipped: "how do we add the rest of the UI to the
  translation?" - explained the repeatable per-region pattern (data-i18n
  decoration for static `_build()`-once chrome vs. inline `_t()` calls for
  dynamically-rebuilt content), then asked which order to do the remaining
  passes in; household picked "Finish Settings, then Chores." This release
  finishes the Family Week Calendar card's own Settings panel (Chores card
  and the other companion cards are still next, not started).

  Also answered, mid-pass: "We need to do this in accordance with home
  assistance. best practices recommendations?" - dispatched a second
  research subagent (this time against developers.home-assistant.io
  directly, not just frontend/core source) rather than asserting
  confidence; confirmed no official HA doc exists for custom-card UI
  localization specifically, and that the v215 approach (loadBackendTranslation
  + hass.localize keyed by hass.language, category name "frontend") already
  matches the real-world community convention, which is the best available
  reference. Reported this honestly rather than overclaiming official
  sanction, then continued.

  Decorated with `data-i18n`/`data-i18n-title` (or, where a translated
  region has a nested element populated by separate dynamic JS - see the
  Reminders-hint bug below - via a direct `_t()` + `.innerHTML` call at
  that same dynamic call site instead): the rest of the Settings modal's
  General tab (Calendars, Reminders, Menu Blocks, Chores/Rewards/Routines,
  Countdown, Daily Digest, Grocy, Screen Saver accordions, and the Theme
  section's 11 color rows + 9 font-size rows + reset button); the Users
  tab body and the notify-devices overlay (notify-click-path, add-a-person,
  profiles hint, empty state, notify targets heading, autodetect); the full
  per-person Notification Profile editor (`.notify-profile-overlay` -
  color, Include in Chores & Rewards, Child account, the Notify targets
  button, and its Calendar/Lists/Instant notifications/Daily Digest/Kiosk
  PIN login/Permissions accordions); the Kiosk PIN modal; the Screen Saver
  logins modal; and the Debug Info popup's heading. ~180 new keys added to
  `translations/en.json`, `de.json`, `es.json`, and `strings.json`'s
  `"frontend".settings`/`"frontend".common` sections (hand-translated for
  all three, not machine-translated), bringing settings.* to 180 keys plus
  9 common.* keys, all three files verified to hold identical key sets.

  Two correctness bugs caught and fixed before shipping, neither via a
  failing test - both found by re-reading the freshly-decorated HTML
  against how `_applyTranslations()` actually works:

  1. The "3/5/7 days" buttons under Settings → Calendars → Days shown
     originally all shared one `data-i18n="settings.n_days"` key with a
     `{n} days` / `{n} Tage` template and a `data-i18n-fallback` override
     per button (`"3 days"`/`"5 days"`/`"7 days"`) - modeled on the pattern
     used elsewhere in this file for buttons sharing a key with different
     fallback text. But `_applyTranslations()`'s static sweep calls
     `this._t(key, fallback)` with NO third `vars` argument, so the `{n}`
     placeholder in the German/Spanish translation would never get
     substituted - German would show the literal string "{n} Tage" on all
     three buttons instead of "3 Tage"/"5 Tage"/"7 Tage". Root cause: the
     `data-i18n-fallback` trick is for sharing one key with different
     ENGLISH fallback text (already used correctly elsewhere in this pass
     for other buttons), not for var substitution, which the static sweep
     doesn't support at all. Fixed by giving each button its own plain,
     unique key (`settings.three_days`/`five_days`/`seven_days`, no
     placeholder) instead - removed the shared `n_days` key from all three
     translation files entirely (it had no other callers) rather than
     leaving a trap for future reuse. A new test
     (`test_frontend_i18n.js`, "N days" buttons block) asserts all three
     buttons translate independently and that none of them contain a
     literal `{n}` after translation.

  2. Same nested-dynamic-child hazard as v215's Reminders-hint fix (already
     documented below), rediscovered and reconfirmed while decorating the
     Notification Profile editor: the modal's `<h2>` contains a nested
     `<span class="notify-profile-name">` (its text set independently by
     `_openNotifyProfileModal()` to the selected person's name), and the
     "Notify targets" button contains a nested
     `<span class="notify-profile-targets-count">` (set independently to a
     live count). Neither element's PARENT got a `data-i18n` attribute for
     this reason - instead, only a plain inner `<span>` around the STATIC
     label text (e.g. `<span data-i18n="settings.notify_targets_label_full">Notify
     targets</span> <span class="notify-profile-targets-count">0</span>`)
     is decorated, leaving the dynamic sibling untouched by
     `_applyTranslations()`'s `el.textContent = ...` sweep. Also fixed the
     `.notify-profile-name` span's own JS-side English-only fallback
     (`|| "Notification profile"`) to go through `_t()` with a new
     `settings.notification_profile_default` key, so an unnamed/not-found
     profile shows the translated placeholder instead of hardcoded English.
     Separately, also caught and fixed (before it ever ran) a copy-paste
     slip in the Kiosk PIN modal's `<label>PIN<input.../></label>`: an
     early draft put `data-i18n="settings.pin_label"` on BOTH the outer
     `<label>` and a new inner `<span>` wrapping just the word "PIN" - had
     that shipped, `_applyTranslations()`'s sweep on the outer label would
     have called `el.textContent = ...` and silently deleted the nested
     `<input>` field itself on every translation pass. Fixed by removing
     `data-i18n` from the outer `<label>`, keeping it only on the inner
     `<span class="pin-label-text">`.

  `test_frontend_i18n.js` extended (all passing, jsdom): a Settings General
  tab theme-color-row label and the Users tab tab-button both resolve to
  German; the three "N days" buttons translate independently with no
  literal `{n}` left over (regression guard for bug #1 above); the
  Reminders-hint's nested `<code class="reminders-entity-label">` element
  (populated by `_openSettings()` with `this._config.reminders_entity`)
  survives both a direct `_applyTranslations()` call and a live
  `hass.language` switch, and the hint's own parent element carries no
  `data-i18n` attribute (regression guard for the nested-dynamic-child
  class of bug, now hit twice); and the Users tab's "+ Add a person"
  button translates. Full suite re-run clean both before and after: all
  57 JS test files, all 206 Python tests, zero regressions.

  Still English-only after this release: Chores, Rewards, Goals, the other
  companion cards (each maintains its own separate, currently-untranslated
  copy of this card's `_t()`/`_ensureTranslationsLoaded()`/
  `_applyTranslations()` trio, since none of the 11 card files share code)
  - Chores card is next per the household's explicit ordering choice
  ("Finish Settings, then Chores").

- **v215 (1.132.44)**: "Add German Support and Spanish (check HA default
  language) also have a setting for Language." Follow-up clarification,
  verbatim: "Use home assistance[sic]. Native front end UI translation
  system to translate the user interface into different languages.
  Definitely need German and Spanish but if we can add more languages I
  would like to do that there is no need to convert the code to
  multi-language only the front end UI" and "Let language for the card UI
  [be] the thing people actually interact with and use home assistant's
  native translation for it."

  Before writing any code, researched the actual Home Assistant frontend
  translation API (via a subagent fetching developer docs, community
  threads, and the home-assistant/frontend and home-assistant/core source)
  rather than guessing, since getting hass.loadBackendTranslation's real
  signature wrong would mean the whole feature silently does nothing.
  Confirmed: `hass.loadBackendTranslation(category, integration)` is real,
  works for a custom integration's own `translations/<lang>.json`, and the
  `category` string is NOT restricted to a fixed set at runtime (HA's own
  frontend TypeScript types constrain only ITS OWN built-in categories at
  compile time - a custom integration can invent any category name and
  Home Assistant's `/api/translations` endpoint + `homeassistant/helpers/
  translation.py`'s `async_get_translations` will serve it, no allow-list
  enforced server-side either). Working pattern confirmed from a real
  community example: `await hass.loadBackendTranslation("frontend",
  "family_hub")` then `hass.localize("component.family_hub.frontend.
  <path>")`. Also confirmed `hass.language` is a plain string directly on
  the hass object passed to any custom card (no extra API needed to read
  it), and that `hass.localize()` returns `""` - never the raw key, never
  a silent auto-fallback to English - when a key/resources aren't
  available, which is why `_t()` below always carries its own inline
  English fallback.

  This directly satisfies the household's pivot: no bespoke Family Hub
  Settings > Language dropdown was built at all - the card just follows
  whatever language the household's own Home Assistant account is already
  set to (HA's native per-account language setting IS the "setting for
  Language" the original ask wanted), and re-translates automatically if
  that ever changes.

  Backend: `family_hub/translations/en.json` (already existed, used only
  for the config_flow setup screens until now) gained a new top-level
  `"frontend"` key - a dotted-path dictionary of this card's own UI
  strings (nav.*, add_event.*, event_info.*, settings.*, common.*). Two
  new files, `translations/de.json` and `translations/es.json`, hold ONLY
  that same `"frontend"` key, fully translated - the config_flow content
  stays English-only for now (out of scope per the household's own "no
  need to convert the code... only the front end UI"). `strings.json` was
  kept in sync with the same `"frontend"` key for documentation, matching
  this repo's existing convention of keeping strings.json and
  translations/en.json identical. Adding a third language later is just a
  new `translations/<lang>.json` file with this same key - no code change.

  Frontend (`family-week-calendar-card.js`), new helpers: `_t(key,
  fallback, vars)` - synchronous, always safe (try/catch around
  hass.localize, falls back to the English text passed at the call site,
  supports `{varName}` substitution matching strings.json's own existing
  `{member_name}`-style convention). `_ensureTranslationsLoaded()` - called
  from the very top of the `hass` setter on every assignment; cheap no-op
  once `this._i18nLoadedLang` already matches `hass.language` (its base
  subtag - "en-GB" behaves as "en"), otherwise calls
  hass.loadBackendTranslation("frontend","family_hub") and, once it
  resolves, runs `_applyTranslations()` + `_renderGrid()`. Never blocks the
  synchronous first paint - _build() (which runs during setConfig, before
  hass is ever set at all) always paints in English first via _t()'s own
  fallback, exactly as if this feature didn't exist, for the very common
  case of a household already using English or before the round trip
  resolves. `_applyTranslations()` - sweeps `[data-i18n]` (textContent) and
  `[data-i18n-title]` (title/aria-label) elements under `this._root`; each
  element's ORIGINAL English text is cached once on the element itself (in
  `data-i18n-fallback`/`data-i18n-title-fallback`) so re-running this after
  a language change (or a change back to English) always translates from
  the true source text, never from a previous translation's leftover DOM
  state.

  Two translation strategies, chosen per how each piece of HTML is built:
  (1) the STATIC, built-ONCE `_build()` skeleton (top nav bar, Add Event
  modal's field labels, Settings modal's tab bar) - these never get their
  innerHTML regenerated after the very first render, so they're decorated
  with `data-i18n`/`data-i18n-title` and picked up by the
  `_applyTranslations()` sweep once translations resolve. (2) content
  that's REBUILT fresh on every open/interaction (the event-info popup's
  `_openEventInfo`, `_wireEventInfoDeleteButton`, the dynamic week-label
  text in `_updateNavLabel`) - these just call `_t()` directly inline,
  since they already re-run on every render pass and so naturally reflect
  whatever language is current with no separate re-application needed.

  Coverage this pass (the household's most-used surfaces, not literally
  everything in this ~16,350-line file - see the Changelog entry for the
  explicit list of what's translated vs. what's still English-only):
  nav bar (view buttons + titles, Suggestions/Recipe Box/More menu +
  dropdown, week-shortcuts row, the dynamic "This Week"/"Next Week"/"{n}
  Weeks Out"/"{n} Week(s) Ago" label), the Add Event/Reminder modal (tabs,
  every field label, Save/Cancel), the event-info popup (When/Location/
  Also for/Remind me/Details/Use as meal/Countdown/Delete, including every
  string from v1.132.43's delete feature - unsupported-integration alert,
  delete confirmation, in-flight "Deleting…" state), and the Settings
  modal's tab bar (heading, Debug Info, General/Users tabs). Explicitly
  NOT covered this pass: the rest of the Settings panel's own field labels,
  and every other card (Chores, Rewards, Goals, My Chores, Todo, Recipe
  Box, Pantry, Active Timers, Screensaver, Today) - noted as follow-up
  work, since this file alone is ~16,350 lines and the full card suite is
  ~39,000 lines across 11 files with no shared code between them.

  New `test_frontend_i18n.js` (14 cases): `_t()`'s fallback behavior with
  no hass at all, an unresolved key, a thrown `localize()`, and `{var}`
  substitution on both a resolved translation and the English fallback;
  `loadBackendTranslation("frontend","family_hub")` called exactly once
  per distinct `hass.language` (not re-fetched on every unrelated hass
  reassignment, e.g. a routine reconnect); the static chrome (nav buttons,
  Add Event modal, Settings tab bar) actually translating to German once
  resolved, with an untranslated key correctly falling back to its own
  original English text rather than going blank; Spanish resolving
  independently (not just "German or English"); English needing no round
  trip and showing the plain fallback; graceful no-throw behavior when
  hass has no `loadBackendTranslation` at all (older HA core); and
  switching `hass.language` mid-session re-fetching and re-translating in
  both directions (including back to English, verifying
  `_applyTranslations()` restores the TRUE original text rather than being
  stuck on a stale German DOM state). Full regression pass: all 56 JS test
  files and the full 206-case Python suite green; all three translation
  JSON files (en/de/es) and strings.json validated as parseable JSON.

- **v214 (1.132.43)**: "Deleting calendar events (Needs permission) if the
  calendar integration you're using supports delete, else gray out and
  when click give a pop up that says delete is not supported with your
  current integration please use [INTEGRATION] app to delete."

  New standalone permission `PERMISSION_DELETE_EVENT = "can_delete_event"`
  in const.py, appended to the `CHORE_PERMISSIONS` tuple (a legacy name
  that already covers Chores/Rewards/Menu/Wishlist/Calendar permissions,
  not just chores literally) and to the frontend's `_permissionDefs()`
  list under a "Calendar" group. Enforcement deliberately mirrors
  `PERMISSION_EDIT_MENU`'s simpler shape - a plain
  `chores_ws_api._has_permission(entry_data, connection, PERMISSION_
  DELETE_EVENT)` server-side check - rather than the kiosk-elevation-aware
  `_has_permission_ctx`/`_effective_actor` pattern chore actions use;
  deleting an event doesn't need "who's currently using this shared
  kiosk" resolution the way completing someone else's chore does.

  Two new websocket commands in `__init__.py`, deliberately split because
  HA core's `calendar.delete_event` service (unlike `create_event`) isn't
  universally implemented: `family_hub/calendar/delete_support` is a
  read-only, permission-free capability check (every household member's
  card calls it to decide how to DRAW the button, regardless of whether
  they personally have the permission to USE it) that checks a calendar
  entity's own `supported_features` state attribute against HA core's
  `CalendarEntityFeature.DELETE_EVENT` bit - not vendored/imported since
  this repo has no real Home Assistant dependency, so it's hardcoded as
  `CALENDAR_ENTITY_FEATURE_DELETE_EVENT = 2` in const.py with a comment
  explaining why - and resolves a human-facing integration name via the
  entity registry's `platform` field through a new const.py dict,
  `CALENDAR_PLATFORM_FRIENDLY_NAMES` (google, caldav, local_calendar,
  office365/o365, icloud, todoist, remote_calendar -> friendly names,
  falling back to a title-cased domain, or "your calendar's own app" if
  the registry has nothing). `family_hub/calendar/delete_event` is the
  actual mutation, gated on the permission, calling `hass.services.
  async_call("calendar", "delete_event", {entity_id, uid[, recurrence_
  id]}, blocking=True)`.

  Frontend (`family-week-calendar-card.js`): `_canDeleteEvent()` wraps the
  existing `_hasPermission` helper (admin always passes). The event-info
  popup's `_openEventInfo` draws a disabled "Checking…" Delete row
  synchronously - so the popup never flashes with no affordance at all for
  someone who has the permission - only when `!detail.isReminder &&
  this._canDeleteEvent()` (reminders are Family-Hub-owned to-do items with
  their own removal path, not real calendar events, so they never get this
  row). `_getCalendarDeleteSupport(entityId)` caches the capability-check
  result per calendar entity_id in `this._calendarDeleteSupport` (it's a
  property of the CALENDAR, not any one event, so it never changes between
  popups for the same person's calendar). `_wireEventInfoDeleteButton(id,
  detail)` resolves that promise, bails if the popup has moved on to a
  different event in the meantime (`this._eventInfoOpenId !== id`), then
  either wires a working button (`window.confirm` -> the websocket delete
  call -> on success, closes the modal and refetches events; on failure,
  `window.alert`s the error and re-enables the button without closing
  anything) or a greyed `.unsupported` button whose click just
  `window.alert`s the "please use [INTEGRATION] app" message the household
  asked for by name, using the integration name the backend resolved.

  A previously-discarded field, the calendar REST API's own `ev.uid`, is
  now captured into `_eventDetails` at all three real-calendar-event build
  sites (split-Month day-detail pane, `_buildDayColumnHtml` for Week view,
  and the Planner view) - `calendar.delete_event` requires a uid to target
  a specific occurrence, and an event whose GET response didn't carry one
  always shows as unsupported regardless of what the platform capability
  check says, rather than risk an unreliable delete.

  New CSS: `.event-info-delete-btn` uses a destructive-red border/
  background (distinct from the neutral `.event-info-countdown-btn` it's
  modeled on) so a working Delete button reads as consequential at a
  glance; `.event-info-delete-btn.unsupported` is dashed-border and muted
  instead, so it's visually obvious before tapping that nothing will
  actually happen.

  New `test_calendar_event_delete.js` (11 cases covering the frontend:
  no permission -> no row and no capability round trip at all; admin
  always passes with no explicit grant; the row appears disabled/
  "Checking…" before the round trip resolves; reminders never get a row;
  a supported calendar with a captured uid gets a working button whose
  click confirms, calls the websocket command with the right entity_id/
  uid, closes the modal, and refetches events; declining the confirm()
  dialog performs no delete; a websocket failure alerts and re-enables the
  button rather than closing the modal; an unsupported calendar gets a
  greyed button whose click alerts naming the integration; a supported
  calendar with NO captured uid still shows unsupported; the capability
  check is cached per calendar entity_id across two events on the same
  calendar; and opening a different event while an earlier capability
  round trip is still in flight never resurrects a stale button) and new
  `test_calendar_event_delete.py` (12 cases covering both websocket
  commands directly: delete_support's supported true/false from the
  feature bit, its "no state at all" case, its platform-name mapping/
  title-cased-fallback/generic-fallback resolution via a monkeypatched
  entity registry, and that it needs no permission at all; delete_event's
  forbidden-without-permission case with zero service calls, success for
  an admin with no explicit grant, success for a non-admin with an
  explicit grant, recurrence_id passed through when given and omitted
  when not, and a service-call exception surfaced as an error rather than
  crashing). Full regression pass: all 55 JS test files and the full
  206-case Python suite (`pytest test_*.py -q`) green.

- **v213 (1.132.42)**: "make a way to highlight a day of the week like is
  possible in month view so you can click add calendar event or reminder
  and it will default to that day, like we do in the month view."

  Investigated the existing Month-view feature first rather than assuming
  its shape: the split Month variant already had a "select a day" concept
  (`_monthSplitSelectedDate`, set by the `.month-cell` click branch in the
  `.grid` delegated click handler, rendering `.month-cell.selected` with
  an accent border+inset-shadow), and `_addEventDefaultDate()` (called by
  `_openAddEvent`, the shared Add Calendar Event/Add Reminder modal opener
  reached from the FAB) already consulted it when `_viewMode === "split"`
  - clicking a day does NOT open Add directly even in Month view, it just
  primes what date the FAB's Add flow defaults to next time it's opened.
  Matched that exact behavior for Week view rather than inventing a new
  "click opens Add directly" interaction, since that's what "like we do in
  month view" describes.

  New `_weekSelectedDate` field (initialized `null` alongside the other
  per-card state, `_buildDayColumnHtml`'s own top-of-method block). Each
  day column's `.day-header` now carries `data-date="${dateKey}"` (mirrors
  `.month-cell`'s own `data-date` convention) and an `isSelected` class.
  New `.grid` click branch (right after the `.month-cell` branch) reads
  `closest(".day-header")`: clicking toggles `_weekSelectedDate` (click
  the same day again to deselect - Week view has no "always something
  selected" baseline the way Month's split variant does, so a toggle is
  the only way to get back to "nothing selected, default to today").
  `_addEventDefaultDate()` gained a second check,
  `this._viewFamily(this._viewMode) === "week" && this._weekSelectedDate`
  - using `_viewFamily` (not a literal `_viewMode === "week"` check) so
  the selection also works in Portrait and the 3/5-day windows, not just
  the plain 7-day Week variant. New CSS `.day-header { cursor: pointer;
  border-radius: 6px; }` and `.day-header.selected { border: 2px solid
  var(--fc-accent); box-shadow: 0 0 0 2px var(--fc-accent) inset; }` -
  applied to the header itself rather than the whole `.day-col` (unlike
  Month's `.month-cell.selected`, which highlights the WHOLE cell) so the
  meal blocks/events below it don't visually shift when selected.

  Lifecycle/cleanup (no test for this existed to copy from - `_mealEditMode`
  reset was the closest existing precedent, in the `.view-btn` handler):
  `_setWeekOffset` (used by the nav arrows, week-shortcuts, AND swipe
  navigation - all three funnel through it) now clears `_weekSelectedDate`
  first, since a selection from a different week's Tuesday makes no sense
  once you've navigated away; the `.view-btn` handler also clears it when
  `_viewFamily(mode) !== "week"` (switching to Month), mirroring exactly
  where `_mealEditMode` already gets reset in that same handler.

  New `test_week_day_selection.js` (8 cases: every day header's data-date
  is correct; click selects + adds .selected; clicking the same header
  again deselects; clicking a different header moves the selection rather
  than stacking a second one, verified both by class and by an exact
  `.day-header.selected` count of 1; `_addEventDefaultDate` defaults to
  today with nothing selected and to the selected day once one is picked,
  confirmed end-to-end through `_openAddEvent` filling both the Add Event
  and Add Reminder date fields exactly like `test_month_view.js`'s
  existing split-Month equivalent test does; a Week-view selection is
  correctly ignored once `_viewMode` is split Month, since that path
  checks `_monthSplitSelectedDate` instead - the two selection fields
  don't leak into each other; `_setWeekOffset` clears the selection; and
  switching to Month view via the `.view-btn` clears it too). Full test
  suite re-run clean after this change (all 54 JS test files, since this
  touches `family-week-calendar-card.js`, one of the most shared files in
  the project) - `test_month_view.js`'s own pre-existing split-Month
  selection test in particular was re-checked since it's the file this
  feature was modeled on and asserts `_addEventDefaultDate()` falls back
  to today "when not in split Month view at all" using `_viewMode =
  "week"` with no selection, which still holds since `_weekSelectedDate`
  defaults to `null`.

- **v212 (1.132.41)**: two household asks in one release.

  1. "can we make the fuzzy match menu suggestuons up to 3 recipes with a
  little broader match" - a follow-up on v210's "Suggestive meal line"
  (`family-week-calendar-card.js`). `_findMealNameSuggestionMatch` (single
  best match) became `_findMealNameSuggestionMatches` (returns up to 3,
  score-sorted, deduped by recipe); `_tokensFuzzyMatch`'s word-level
  threshold went 0.34→0.45 and the whole-name threshold in the matcher
  went 0.2→0.3. The `.meal-name-suggestion` box's markup changed from one
  `<b class="meal-name-suggestion-match">`+one static `.meal-name-
  suggestion-use` button to a `.meal-name-suggestion-list` container that
  `_updateMealNameSuggestion` rebuilds via DOM nodes (not innerHTML string
  interpolation, to sidestep any injection risk from a typed name) on
  every keystroke; the click handler is now delegated on `.meal-name-
  suggestion-list` (rows come and go) rather than wired once on a single
  button, and `_applyMealNameSuggestion(uid)` looks the picked recipe up
  by uid from `this._mealNameSuggestionMatches` instead of a single cached
  match. `test_meal_name_suggestion.js` updated (helper functions
  `matchTexts`/`useButtons` for the now-plural elements) plus two new
  cases: up to 3 suggestions with independently-working buttons (picking
  the 2nd doesn't fill from the 1st), and a token-level near-miss
  ("Chedda" vs "Cheese", distance 3 on a 6-char word - 50%, past the old
  34% threshold but caught by the new 45%) confirming the broadening
  actually took effect without becoming promiscuous (a 5th unrelated typed
  word still correctly gets no match at all).

  2. "add the account to automate routine completion based on sensors like
  we do with chores" - routine items (`routine_engine.py`) get their own
  `auto_complete_trigger` field, the direct mirror of a chore's existing
  `auto_complete_trigger` (chores also have `auto_create_trigger`; a
  routine item has no open/reopen lifecycle to mirror that second field
  against, so routines only ever get the one). Same `{"entity_id",
  "from_state", "to_state"}` matcher shape, same "None/''/'*' means don't
  care" semantics. The matcher function `_chore_trigger_matches` in
  `__init__.py` was renamed `_sensor_trigger_matches` (one existing call
  site updated, no behavior change) since it's now shared by both. New
  `_async_handle_routine_sensor_trigger(hass, entry_data, entity_id,
  old_state, new_state)` scans `entry_data["routines"]["items"]` the same
  way `_async_handle_chore_sensor_trigger` scans chores, but - since a
  routine item has no status machine, just `done: bool` - calls
  `routine_engine.toggle_item(..., done=True)` (the SAME function the
  checkbox itself calls via `ws_toggle_routine_item`) rather than a
  bespoke completion path, so a sensor-driven completion pays out
  star_value/pending_approval and fires "item_toggled"/"routine_completed"
  identically to a household member tapping the checkbox - see that
  function's own docstring. Already-done items are skipped up front (both
  so a flapping sensor can't re-toggle something already checked, and so
  "was this the completing toggle" - which gates firing routine_completed
  - needs no separate tracking: only not-done items are ever considered).
  No second `hass.bus.async_listen("state_changed", ...)` subscription -
  `_async_setup_chore_sensor_listener`'s existing single listener now
  calls both handlers from the same `_handler` (renaming stayed at
  functions only; the entry_data key `cancel_chore_sensor_listener` and
  the setup function's own name were deliberately left alone to keep the
  blast radius small). Frontend: a new "Auto-complete trigger" `<fieldset>`
  (entity/from-state/to-state, `rm-add-automate-*` classes) added to the
  Routine tab's add-form, and a matching `rm-edit-automate-*` fieldset
  inside `_routineManageItemHtml`'s editing branch, pre-filled from
  `item.auto_complete_trigger`; `_addRoutineManageItem`/
  `_saveRoutineManageItem` build/send the `auto_complete_trigger` key
  (`null` when the entity field is blank, which is how Edit turns
  automation back off); a small "⚙️ Auto" badge shows in the read-only row
  when a trigger is configured. New `test_routine_sensor_automation.py`
  (14 cases: create/update persistence, the shared matcher, the handler's
  matching/skip-if-already-done/multi-item/star-payout/routine_completed
  behavior, and the two websocket handlers accepting and clearing the
  field) and `test_routine_automate_ui.js` (7 cases: create/edit payload
  shape, add-form field reset after a successful add, edit-form pre-fill,
  clearing the entity field on Edit sending null, and the read-only
  badge). Full suite re-run clean after this (194 Python tests, all JS
  files) - the `_chore_trigger_matches` rename in particular was checked
  against the full suite since it's a shared function with one pre-
  existing call site.

- **v211 (1.132.40)**: three separate household asks, shipped together
  since all three touch `family-hub-chores-card.js` and follow directly
  from each other in conversation.

  1. "for chores let's move the automate tab out of the advanced and put
  it under a new accordion  same thing with repeat so you should see 3
  accordions repeate advanced automate". The Create/Edit Chore modal used
  to have ONE "Advanced Settings" accordion with a v198-era "Settings"/
  "Automate" sub-tab pair inside it (recurrence fields lived in the
  "Settings" sub-tab, the two sensor-trigger fieldsets in "Automate").
  Pulled the recurrence fields AND the Automate fieldsets out into their
  own top-level accordions - Repeat, Advanced Settings, Automate, three
  siblings in that order - each with its own `data-target`/id pair
  (`chore-create-repeat-body`/`chore-create-advanced-body`/`chore-create-
  automate-body`, and the matching `chore-edit-*` ids in the Edit modal).
  `_wireAccordions` already looped over every `.accordion-toggle` in the
  box generically, so it needed zero changes to drive three instead of
  one; `_wireAdvancedTabs` and the `.advanced-tabs`/`.advanced-tab`/
  `.advanced-tab-pane` sub-tab UI it drove are gone entirely, along with
  their CSS. New `test_chore_advanced_accordions.js` (both modals: exactly
  3 accordions in the right order, right fields in the right accordion,
  each accordion opens/closes independently of the other two).

  2. "Chore assignments should be Direct, Auto Rotation, and Chore Bin
  (anyone can claim) remove chore bin from the assign to when using direct
  mode. make assignment mode buttons instead of a drop down". Down from 4
  assignment modes to 3 - "First come, first served" is gone as a separate
  mode, folded into Chore Bin. Investigated first rather than assuming:
  the two were already functionally identical in chore_engine.py (both
  just set `assigned_to = CHORE_BIN_SENTINEL` at creation, and
  `claim_chore` only ever checks `assigned_to`, never `assignment_mode`) -
  the ONE real difference was `family-hub-chores-card.js`'s own Claim-
  button gate, which used to only render Claim for `assignment_mode ===
  "first_come_first_served"`, leaving a plain Chore Bin chore admin-drag-
  only with no self-serve claim at all. That gate is now just `status ===
  "open" && isBin` - every bin chore, whichever of the (now-merged) modes
  created it, shows Claim. The backend (`const.py`'s
  `CHORE_ASSIGNMENT_MODES`, `chore_engine.py`) keeps validating the old
  `"first_come_first_served"` value unchanged, purely for backward
  compatibility with whatever's already saved - it's just no longer
  offered as a choice for a NEW chore. `ASSIGNMENT_MODES` trimmed to
  Direct/Auto Rotation/"Chore Bin (anyone can claim)", each with a `title`
  tooltip. The Create modal's `.f-mode` dropdown became a `.f-mode-btn-
  group` row of buttons - the native `<select class="f-mode">` stays in
  the DOM (`display:none`) as the actual read/write surface (still what
  `_submitCreate`/`syncModeFields`/every pre-existing test reads and sets
  directly), the buttons just set its `.value` and dispatch `change` on
  it, so nothing downstream needed to change. Direct mode's own "Assigned
  to" `<select class="f-assigned">` dropped its `<option value="chore_
  bin">Chore Bin</option>` - a real person is the only thing that field
  offers now. New `test_chore_assignment_mode_buttons.js` (button row
  order/default-active/click-wiring, Assigned-to no longer offering Chore
  Bin, create payload sends `"chore_bin"` not the retired value, a plain
  chore_bin chore now shows Claim, a legacy first_come_first_served chore
  still does too).

  3. "allow routine blocks to be drug around and ordered in the routine
  modal, default is routine items with time are sorted by when their time
  is". Routine items (`routine_engine.py`'s per-person Morning/Afternoon/
  Night checklist entries) never had any notion of order before this - the
  Routine tab's manage list just rendered whatever order the backend's
  `items` dict happened to iterate in. Added a `sort_order` field (`None`
  until a household actually drags something in that person+category
  section) and `routine_engine.reorder_items(routines, user_id, category,
  ordered_item_ids)`, which always re-stamps sequential `sort_order`
  (0..N-1) across the WHOLE section at once (never a partial move) and
  raises `RoutineError("invalid_order", ...)` if the given ids don't
  exactly match that section's current items (a stale/incomplete drag).
  `create_item`'s new item gets `sort_order = None` in an untouched
  section (stays in the frontend's time-sorted default) or `max(existing)
  + 1` in a section that's already been manually ordered (appends to the
  end of the manual order rather than reverting to a confusing time-sorted
  position among already-arranged siblings) - see the new
  `_next_sort_order_if_section_is_manually_ordered` helper.
  `update_item` never touches `sort_order`. New websocket command
  `family_hub/routines/reorder` (`ws_reorder_routine_items`, same
  `PERMISSION_ASSIGN` gate as create/update/delete) added to
  `chores_websocket_api.py`'s `ALL_COMMANDS`. Frontend:
  `_routineSortCompare(a, b)` - manually-ordered items (sort_order set)
  win outright and sort by that; otherwise items with a `due_time` sort
  chronologically first (`_routineDueTimeMinutes`), then no-due-time items
  keep their original/creation order (stable sort) - both `_routineItemsFor`
  (the board's per-person accordions) and `_routineItemsForManage` (the
  manage list) now `.sort()` by it, so the board and the manage modal
  always agree. Drag-and-drop lives entirely in the manage list
  (`.rm-list`/`.rm-item-row`) via native HTML5 drag-and-drop, same idiom
  as the board's own card-to-column dragging (`_attachDragHandlers`) but
  reordering within one list instead of moving between columns - new
  `_wireRoutineDragAndDrop(box)` (rewired fresh at the end of every
  `_renderRoutineManagePane` call, since `.rm-list` is rebuilt via
  `innerHTML` on every add/edit/delete/reorder/filter change) and
  `_reorderRoutineManageItems(box, draggedId, targetId, insertBefore)`
  (computes the section's full new id order, sends the reorder call, then
  refetches/re-renders - no optimistic in-place mutation, matching how
  `_saveRoutineManageItem`/`_deleteRoutineManageItem` already handle every
  other manage-list edit). Rows are only `draggable="true"` (with a drag-
  handle glyph) when `_canAssign()` - same gate as the Edit/Remove buttons
  right next to them. New backend `test_routine_reorder.py` (9 tests:
  `create_item` defaults to `sort_order` None, `reorder_items` happy path/
  rejects a mismatched id list/never touches a different section, a new
  item in an already-reordered section appends correctly, `update_item`
  preserves an existing `sort_order`, full `ws_reorder_routine_items`
  integration - success/forbidden/invalid_order) and frontend
  `test_routine_drag_reorder.js` (default chronological-then-creation-
  order sort, manual order fully overriding it, the board sorting the same
  way as the manage list, draggable-vs-not by permission, and an actual
  simulated drag-and-drop producing the right reorder call).

  Full JS suite (all `test_*.js`) and Python suite (180 passed, up from
  171 - the 9 new `test_routine_reorder.py` cases) both clean.

- **v210 (1.132.39)**: household ask, verbatim - "did we ever do this
  Suggestive meal line. When adding a new meal there should be a
  suggestion under the input field if the meal is similar to one already
  in the catalog ie. Cilli dogs - similar to: Chilli Cheese Dogs ( Use
  this instead?)". Investigated first (this is a "did we build this"
  status check, not a build request on its own message) - grepped the
  Recipe Box card, the calendar card's meal-planning code, and the full
  README/PROJECT_CONTEXT history for "similar to"/fuzzy-match/"did you
  mean" - nothing existed. "Meal Suggestions" (v84-86) is a different,
  unrelated feature (a wishlist of recipes flagged via a lightbulb icon),
  not a name-similarity check. Reported that finding back to the
  household and asked whether to build it; they said yes, explicitly
  "this is to hopefully prevent duplicates of meals being made."
  Found the field to hang this off: `.input-name` in
  `family-week-calendar-card.js`'s shared modal template is the SAME
  input used by both the day/menu editor (meal name) and the Recipe Box's
  own Add/Edit Recipe editor (recipe name) - one template, two modes
  (`.dish-hide-field`/`.dish-only-field` toggle the rest). Also found the
  app already had adjacent duplicate-detection machinery to build on:
  `_normalizeForDuplicateCheck`/`_levenshteinDistance`/
  `_findFuzzyDuplicate` already power a Save-time `confirm()` ("... is
  already in your Recipe Box and looks very similar. Add it as a separate
  recipe anyway?") in `_upsertDish`/`_addSuggestion`. That existing
  matcher alone wasn't enough for this feature's own example, though:
  `_findFuzzyDuplicate` is pure whole-string Levenshtein distance with a
  ~20%-of-length threshold, tuned for typos of the SAME overall name
  ("...Stuffing" vs "...Stuffing4") - "Cilli dogs" vs "Chilli Cheese
  Dogs" isn't a close edit distance at all (an entire missing word), even
  though it's obviously the same dish. Added a second matcher alongside
  it rather than changing the existing one (which the Save-time confirm
  still relies on, unchanged): `_findMealNameSuggestionMatch(name)` in
  `family-week-calendar-card.js`, which for each candidate recipe checks
  EITHER the existing whole-string closeness OR a new word-level
  closeness - every word actually typed (`_recipeNameTokens`, 2+ chars
  each) has to fuzzily land on some word in the candidate's name
  (`_tokensFuzzyMatch`: exact, a same-direction prefix of 3+ chars, or
  Levenshtein distance within ~34% of the longer token's length) - gated
  to typed names with 2+ words so typing one common word (e.g. "dogs")
  doesn't flag half the catalog on its own. An exact normalized match to
  an existing entry is excluded outright (already exactly right, nothing
  to suggest). Wired to a plain `input` listener on `.input-name`
  (`_updateMealNameSuggestion`, skips names under 3 characters) showing a
  new `.meal-name-suggestion` hint box right under the field: "Similar
  to: **\<name\>**" plus a "Use this instead?" button
  (`_applyMealNameSuggestion`) that fills name/description/link/rating/
  grocyRecipeId from the match and hides the hint - deliberately the same
  fields `_selectLovedDish` (the existing "Pick a Recipe" flow) fills,
  minus that flow's overlay-close/servings-reset since there's no picker
  open here to close. `_hideMealNameSuggestion()` is called everywhere
  the name field gets programmatically set instead of typed
  (`_openEditorForDate`, `_openDishEditor`, `_selectLovedDish` itself) so
  a stale hint from a previous slot/recipe never lingers into the next
  one. New test file `test_meal_name_suggestion.js` (7 cases): no hint on
  blank/1-char input; no hint on an exact match including a case/
  punctuation-only difference; the household's own "Cilli dogs" ->
  "Chilli Cheese Dogs" example produces the hint with the right matched
  name; an unrelated name shows no hint; clicking "Use this instead?"
  fills all the right fields and hides the hint; reopening the editor for
  a different/empty slot clears a stale hint; `_selectLovedDish` also
  clears a stray hint; and the same behavior works from the Recipe Box's
  own Add/Edit Recipe editor via the shared field, not just the day/menu
  editor. Full JS suite (all `test_*.js`) and Python suite (171 passed)
  both clean.

- **v209 (1.132.38)**: household ask, verbatim - "remember building a
  better recur ui for chores?" then, with two screenshots (Google
  Calendar's own "Does not repeat" dropdown, and its "Custom recurrence"
  dialog): "we need to make the recur UI like this the additional
  settings is what you click if you click custom." Before this, the
  Create/Edit Chore modal's recurrence section was always the full
  detailed form (a "Recurs" type select - Doesn't repeat/Every few days-
  weeks-months/Specific days of the week/A specific week each month - plus
  whichever of interval-count+unit/weekday-toggle-row/month-nth+weekday
  fields that type needs, plus a due-offset select) shown up front for
  every chore, even the common cases that are really just "every day" or
  "every Tuesday."
  Restructured `_recurFieldsHtml`/`_wireRecurFields` in
  `family-hub-chores-card.js` into a two-level UI matching Google
  Calendar's own pattern: a new `.f-recur-preset` dropdown ("Does not
  repeat" / "Daily" / "Weekly on \<weekday\>" / "Monthly on the \<nth\>
  \<weekday\>" / "Every weekday (Monday to Friday)" / "Custom...") is now
  the first, only-visible-by-default control; the entire pre-existing
  detailed form got wrapped in a new `.f-recur-custom-panel` div, hidden
  unless "Custom..." is selected. Deliberately NOT a pixel-for-pixel port
  of Google's own dropdown - no "Annually on \<date\>" option (this app's
  recurrence schema has no yearly interval at all; recur_interval_unit is
  days/weeks/months only, and nobody's asked for one) and no "Ends"
  section (chores recur forever - there is no end-date/occurrence-count
  concept anywhere in chore_engine.py to hang one off of).
  The two dynamic labels ("Weekly on Tuesday", "Monthly on the fourth
  Tuesday") are computed from an anchor date - the chore's own due date
  when editing one that has one, otherwise today (same as Google
  computing its own labels off the event's date, or today until one's
  picked) - via two new small helpers: `_recurNthWeekdayInfo(date)`
  (returns which occurrence-of-the-weekday-in-its-month a date is, 1-4,
  or -1/"last" for a theoretical 5th - a 5th occurrence only ever happens
  when there's no 6th, so it's unambiguously also the last, and -1 is the
  only one of the existing recur_month_nth values that can represent it)
  and `_detectRecurPreset(chore, anchorInfo)` (maps a chore's actual saved
  recur_type/recur_interval_days/recur_interval_unit/recur_weekdays/
  recur_month_nth onto one of the preset values, or "custom" when nothing
  matches exactly - e.g. a 3-day interval, a partial weekday set like just
  Tue+Thu, or an interval in weeks/months rather than a plain "every day").
  Picking a plain-English preset calls a third new method,
  `_applyRecurPresetToFields`, which silently writes the SAME values into
  the (possibly hidden) detailed-panel fields the old form always used -
  `_applyRecurFieldsToPayload` (which builds the actual create/update
  payload) is completely UNCHANGED, since it just reads whatever's sitting
  in those fields regardless of whether a preset or hand-editing inside
  Custom put them there. Picking "Custom..." itself is a no-op against
  those fields - it only toggles the panel's visibility, so it always
  opens showing whatever's actually there (the last preset's equivalent
  values, or - when editing an existing chore whose schedule didn't match
  any preset - that chore's own real saved schedule), never a blank/reset
  form.
  New WEEKDAY_FULL_LABELS ("Monday".."Sunday", same Monday=0 index
  convention as the existing WEEKDAY_LABELS abbreviations) and
  RECUR_NTH_WORDS ("first"/"second"/.../"last") constants added purely for
  this dropdown's inline-sentence wording, distinct from the existing
  abbreviated weekday buttons and the existing nth select's own "The 1st"/
  "The last" option text. A little CSS (`.f-recur-custom-panel`) gives the
  revealed panel a left-border/tinted-background treatment, the same
  "extra detail tucked under a control" visual language used elsewhere in
  this card, so it doesn't read as a disconnected second section of the
  form.
  New test file `test_chore_recur_preset_ui.js` (11 cases) covers: the
  Create modal defaulting to "Does not repeat" with the panel hidden and
  the preset dropdown's exact option list; each of the four simple presets
  (Daily, Weekly-on-today, Every-weekday, Monthly-on-the-Nth) correctly
  filling the hidden fields AND producing the right create-call payload,
  independently re-deriving the expected anchor weekday/nth in the test
  itself (not just trusting the same math the card uses) so a shared bug
  in both places couldn't hide undetected; picking Custom... revealing the
  panel pre-filled from the last preset (not blank) and still accepting a
  hand-edit inside it; and three Edit-modal detection cases - an "every
  day" schedule showing Daily, a schedule of just the chore's own due-date
  weekday (a fixed, deliberately-Tuesday fixture date, so the assertion
  never depends on what day the test happens to run) showing Weekly with
  the correct day name in its own label text, and two different
  non-matching schedules (a 3-day interval; a Tue+Thu partial weekday set)
  both correctly falling back to Custom... with their real values intact,
  not reset. All three pre-existing recur-related frontend test files
  (`test_chore_recur_interval_unit_frontend.js`,
  `test_chore_recur_due_offset_frontend.js`,
  `test_chore_monthly_nth_frontend.js`) and the general
  `test_chores_card.js` re-verified passing unmodified against the new
  code, confirming their existing pattern of driving `.f-recur-type` and
  its sub-fields directly (bypassing the new preset dropdown entirely,
  simulating "already inside Custom and hand-editing") still works exactly
  as before. Full Python (171 passed) and JS suites (now including the new
  file) re-verified clean.
- **v208 (1.132.37)**: household ask, verbatim - "Confetti for completing
  chores, can we also apply it to goals and when you complete all tasks
  in a routine." Extends the existing choresConfettiOnComplete feature
  (v189/v190, see v208's own predecessors) to two more completion
  moments, reusing the exact same setting and `_fireConfetti`/
  `_confettiCss` machinery rather than adding a new toggle - one
  household-wide on/off for every kind of completion celebration.
  Goals can be "completed" (archived, via the literal "Complete" button
  on an already-approved goal - not on reaching the target count or on
  approval, which are separate, earlier steps) from THREE surfaces: the
  standalone `family-hub-goals-card.js` (`_archive`), and the embedded
  Goals block on both `family-hub-chores-card.js` and
  `family-hub-rewards-card.js` (`_archiveGoal` on each). Only the chores
  card had any confetti machinery before this - the standalone Goals
  card and the Rewards card each got the full `_confettiOnCompleteEnabled`/
  `_confettiCss`/`_fireConfetti` trio ported in for the first time
  (byte-identical to the chores card's own copy, same "independently-
  loaded Lovelace resource, not an ES module that could share one file"
  convention as everything else duplicated across these files), plus
  `choresConfettiOnComplete: true` added to each's own `_defaultSettings()`
  (same "has to be listed here too, not just in the calendar card's
  Settings-form default" reasoning as the chores card's own v200 fix -
  otherwise a household that's never re-saved Settings since confetti
  defaulted ON would silently get none from these two cards) and a
  confetti-portal cleanup added to each's `disconnectedCallback()`.
  Routines have no other surface than the Chores board, so only
  `family-hub-chores-card.js`'s own `_toggleRoutineItem` needed a change.
  Unlike a chore (every tap gets its own burst, even a quantity chore's
  non-final units), firing per-item here would mean a burst on every
  single routine checkbox (brush teeth, get dressed, ...) - instead it
  fires exactly once, the moment checking an item off leaves every item
  in that same section (this person's Morning/Afternoon/Night list, i.e.
  `_routineItemsFor(user_id, category)` - the same day-filtered set the
  board itself renders) done. Implemented by capturing the toggled item's
  `user_id`/`category` BEFORE the toggle call (so a failed toggle can
  never fire this), then after `_fetchRoutines()` refreshes the list,
  checking whether every item in that section is now done; unchecking an
  item (`done: false`) never fires this, even in a hypothetical edge case
  where the section still reads as "complete" afterward.
  New test file `test_goals_routines_confetti.js` covers: the standalone
  Goals card's `_archive` gated on/off and defaulting ON with no saved
  key; the chores card's and rewards card's embedded `_archiveGoal` both
  firing (and the rewards card specifically getting `_fireConfetti` for
  the first time); completing the first of two routine items firing
  nothing, completing the second (last) firing once, and unchecking never
  firing; and the whole routine-completion check respecting the setting
  being off. Full Python (171 passed) and JS suites (now including this
  new file) re-verified clean.
- **v207 (1.132.36)**: direct, same-session double-correction of v206/
  1.132.35 above, from two pieces of separate household feedback.
  (1) "You borked the screen saver card it now goes to the page but it
  refreshes home assistant in the process and is very jaring it used to
  be very very smooth, but the screen saver card back and make the
  implementation the same for the other screen saver." v1.132.35's
  reasoning (a self-verifying soft navigation is fundamentally
  undiagnosable from JS, so just always hard-navigate) was sound in the
  abstract, but wrong as an actual product decision here: the standalone
  Screen Saver card's smooth in-app transition had genuinely always
  worked reliably for this household (confirmed - see below), and
  replacing it with an unconditional full-page reload was a real,
  user-visible regression on a card that was never broken. Reverted both
  `family-week-calendar-card.js`'s and `family-screensaver-card.js`'s
  `_goToReturnDashboard` back to the v1.132.34 shape - a smooth soft
  route (`history.pushState` + a dispatched `"location-changed"` event)
  attempted first, with a real hard navigation (`_hardNavigate`, `window.
  location.assign`) only as a fallback if `window.location` provably
  hasn't changed ~300ms later. The household's explicit ask - "make the
  implementation the same for the other screen saver" - is honored
  literally: both files' `_navigateWithFallback`/`_hardNavigate` are kept
  byte-identical on purpose, same established convention as their other
  duplicated helpers.
  (2) Separately, unprompted, the household reported: "I noticed
  something else, the navigate back to page workes on the calendar page
  the card that has the actual settings button but it doesnt work when
  the screen saver is called by like chores or rewards card." This turned
  out to be an entirely different, previously-unknown bug, not a
  consequence of anything in v1.132.33-35: a full audit (`grep` across
  every file in `family_hub/card/` for the screensaver's own method
  names) found a THIRD, independent implementation of the screensaver -
  `window.__familyHubScreenSaver`, a shared window-singleton copy-pasted
  byte-identically into `family-hub-chores-card.js`,
  `family-hub-rewards-card.js`, and `family-hub-my-chores-card.js` (same
  "independently-loaded Lovelace resources, not ES modules that could
  share one file" convention as this codebase's other window-singletons -
  `__familyHubFabCoordinator`, `__familyHubKioskSession`,
  `__familyHubTimerAlarm`). This is the screensaver that actually runs
  when a household member is looking at Chores/Rewards/My Chores (not the
  calendar card) when idle time elapses - and its own `hideScreenSaver()`
  had ZERO return-dashboard navigation logic at all, in any version, ever.
  The v193 feature request ("we added where the device should be when
  waking from screensaver in the screensaver card, but never added that
  functionality to the main screensaver") and every fix since (v204-v207)
  had only ever touched the calendar card's own screensaver and the
  standalone companion card's - this third copy was simply never on
  anyone's radar until this household happened to be on a Chores/Rewards
  view when their screensaver kicked in.
  Fixed by porting the full feature into all three identical copies of
  the singleton: `defaultSettings()`/`normalizeSettings()` gained
  `returnDashboardPath` (with the same `normalizeDashboardPath` leading-
  slash helper as the other two files' own `_normalizeDashboardPath`),
  and `hideScreenSaver()` now calls a new `goToReturnDashboard()` ->
  `navigateWithFallback()` -> `hardNavigate()` chain, functionally
  identical to the class-based cards' own `_goToReturnDashboard`/
  `_navigateWithFallback`/`_hardNavigate` trio (just as plain closure
  functions instead of instance methods, matching this file's existing
  style). No new Settings UI was needed - `screenSaver.returnDashboardPath`
  already lives in the same shared, household-wide settings blob the
  calendar card's own Settings -> Screen Saver section writes to; this
  singleton just wasn't reading it before.
  All three defining files (`family-hub-chores-card.js`,
  `family-hub-rewards-card.js`, `family-hub-my-chores-card.js`) also
  gained an exported `_test` object (test-only hooks - `showScreenSaver`,
  `hideScreenSaver`, `getSettings`, `normalizeSettings`, `overlayEl`
  getter, a `settingsCacheForTest` setter, and `setHardNavigate` for
  stubbing the actual browser call) purely so a jsdom test can drive this
  closure-based singleton directly without a full card element - it had
  no prior test coverage of its own at all before this version, unlike
  the calendar card and standalone card. New file
  `test_shared_screensaver_wake_dashboard.js` covers: `normalizeSettings`
  reading/normalizing `returnDashboardPath` (bare, already-prefixed, and
  blank), a configured path navigating via the smooth soft route on wake,
  a blank path navigating nowhere, and the hard-navigate fallback firing
  once a simulated `pushState` failure has had its 300ms grace period -
  loaded against `family-hub-rewards-card.js` specifically (any of the
  three would do, since they're kept byte-identical), which also serves
  as regression coverage for the other two copies silently drifting out
  of sync in a future edit. `test_main_screensaver_wake_dashboard.js` and
  `test_screensaver_card.js` both had their wake-navigation sections
  reverted back to asserting the smooth soft route (and the hard-navigate
  fallback under a simulated failure), undoing v206's rewrite to
  hard-navigate-only assertions. Full Python (171 passed) and JS suites
  (now including the new file) re-verified clean.
- **v206 (1.132.35)**: direct, same-session follow-up on v205/1.132.34
  above - the actual shipping version of the screensaver wake-navigation
  fix (v205 shipped but had zero effect; this is what finally worked).
  Household tested v1.132.34 on the real kiosk tablet and reported
  "still not working in browser or on HA app" - directly contradicting how
  v1.132.34 had been framed (a kiosk/WebView-specific fix). Ruled out
  hypotheses one at a time, live, with the household's own device and
  browser console, rather than guessing again blindly: (1) third-party
  kiosk app (Wallpanel) interference - household removed it entirely and
  retested, "I just removed wallpanel no effect"; (2) stale cached card JS
  - `console.log(typeof customElements.get("family-week-calendar-card")
  .prototype._navigateWithFallback)` in devtools returned `"function"`,
  confirming the browser tab really was running the v1.132.34 code, not an
  old cached copy; (3) a bad/unreachable stored path - both
  `document.querySelector("home-assistant").hass.callWS({type:
  "family_hub/get_settings"})` (confirmed `returnDashboardPath` was
  exactly `"/dashboard-tablet/family-calendar"`, correctly slash-prefixed
  and stored) and manually typing that same URL into the tablet's address
  bar (household confirmed: "that page is my dashboard") both came back
  clean; (4) a thrown JS exception in the dismiss handler - household ran
  `document.querySelector("[data-family-hub-screensaver]")
  .dispatchEvent(new PointerEvent("pointerdown", {bubbles:true}))`
  directly from devtools to trigger the real dismiss code path on demand
  (no waiting/timing a real tap needed), and reported "Screen saver
  stopped no IRL redirect" with no Family-Hub-related console errors (a
  screenshot showed only unrelated third-party card errors - Wallpanel,
  mushroom-badge-icon, a few weather/camera cards - and one unrelated
  404). Every external hypothesis was now ruled out with direct evidence,
  which meant the bug had to be in this codebase's own v1.132.34 fix
  itself.
  Found it by reasoning through what `history.pushState()` actually does:
  it updates `window.location` synchronously and unconditionally the
  instant it's called, completely independent of whether Home Assistant's
  router (or anything else) ever reacts to the dispatched
  `"location-changed"` event and actually re-renders the screen.
  v1.132.34's `_navigateWithFallback` compared `window.location` before vs.
  ~300ms after the soft attempt, and only forced a real navigation
  (`_hardNavigate`) if it saw no change - but since `pushState` always
  changes `window.location` regardless of whether the router responds,
  that check could never detect the exact failure mode it was built to
  catch (URL silently updates at the JS level, screen never visibly
  changes). This fully explains why v1.132.34 shipped but had zero effect
  for the household - the self-verification was watching the wrong thing.
  Household then said, unprompted: "This should function just like the
  screen saver card does. The screen saver card always works." - worth
  noting for the record: the standalone Screen Saver card's own
  `return_dashboard_path` has always been filled in through Home
  Assistant's built-in navigation picker (see v204's own writeup below),
  so it never actually hit the v1.132.33 missing-leading-slash bug in the
  first place, and there's no confirmed report of it ever having been
  specifically retested against the v1.132.34 mechanism either - so "always
  works" doesn't contradict the pushState-verification flaw just found,
  but it's still the right bar to hold the fix to either way: both cards'
  wake behavior should be identical and both should be provably reliable,
  not just the one no one happened to report a problem with.
  Given self-verification of a soft/in-app navigation is fundamentally
  impossible to do correctly from JS (the flaw above isn't a bug that can
  be patched - it's inherent to how `pushState` works), and the household
  had already independently proven a real/hard navigation to the exact
  configured path is 100% reliable on their own devices (the manual
  address-bar test above), both `family-week-calendar-card.js` and
  `family-screensaver-card.js` had their `_goToReturnDashboard` collapsed
  from the three-method v1.132.34 structure
  (`_goToReturnDashboard`/`_navigateWithFallback`/`_hardNavigate`) down to
  two methods: `_goToReturnDashboard()` now calls `_hardNavigate(path)`
  directly and unconditionally whenever a non-blank path is configured -
  no soft attempt, no verification, no setTimeout/grace-period logic to
  get wrong. `_hardNavigate(path) { window.location.assign(path); }` is
  unchanged from v1.132.34 (kept as its own tiny method specifically so
  tests can stub it, since `window.location.assign` is non-writable/
  non-configurable in jsdom - confirmed via
  `Object.getOwnPropertyDescriptor`). Both cards are now byte-for-byte
  identical in this mechanism, directly satisfying the household's "just
  like the screen saver card" ask - there is no longer a soft/hard
  distinction anywhere in either card's wake path to diverge between them.
  Rewrote the wake-navigation sections of both
  `test_main_screensaver_wake_dashboard.js` and `test_screensaver_card.js`
  to stub `_hardNavigate` and assert synchronously on the captured path
  (no more `window.location.pathname`/`location-changed` assertions, since
  neither `pushState` nor that event fire anymore, and no more
  `setTimeout`/300ms waits, since there's no more grace period at all);
  removed the two now-fully-obsolete v1.132.34 fallback-timing tests
  entirely (simulating `pushState` throwing, and confirming the fallback
  doesn't fire when the soft route succeeds - there is no soft route left
  to simulate failing or succeeding). Full Python (171 passed) and JS
  suites re-verified clean.
- **v205 (1.132.34)**: direct, same-session follow-up on v204/1.132.33
  above. Household, verbatim, after being told the leading-slash fix was
  ready but before installing it: "I havent sent that version yet but
  adding / didnt work" - meaning they manually edited the field to add
  the leading "/", clicked Save, tested directly on the wall-mounted kiosk
  tablet (confirmed via three follow-up questions), and it STILL didn't
  navigate on wake - the screensaver visibly dismissed but stayed on
  whatever was already showing. That ruled out the missing-slash theory as
  the *complete* explanation (it may still have been a real, separate bug
  - both fixes are legitimate and independent).
  Researched Home Assistant's own actual `navigate()` implementation
  (`frontend/src/common/navigate.ts` + `frontend/src/common/dom/
  fire_event.ts`, fetched from GitHub) to check this file's long-standing
  pushState+"location-changed" pattern against the real thing. Two
  differences stood out: HA's own version calls `history.pushState`/
  dispatches the event on `mainWindow` specifically (a helper that
  resolves the TRUE top-level window, escaping any iframe/cast nesting) -
  not necessarily the same object as the plain `window` this codebase has
  always used everywhere (this file, the standalone Screen Saver card, and
  Family Today's `_goToCalendar`); and it builds the event as a plain
  `Event` with `.detail` attached afterward rather than a `CustomEvent` -
  almost certainly not the actual difference that matters, but `mainWindow`
  vs `window` is exactly the kind of gap a kiosk app that wraps the
  dashboard in its own WebView/iframe chrome could hit, and no household
  should ever have to diagnose which of these an unfamiliar third-party
  kiosk app happens to be doing under the hood - or debug a thrown
  `pushState` SecurityError in an unusual origin/sandbox setup, which
  would abort silently right after the overlay had already hidden
  (matching the reported symptom exactly, since nothing here previously
  wrapped that call in a try/catch).
  Rather than chase the exact mechanism further (unverifiable without
  direct access to the household's actual kiosk app/device), both
  `family-week-calendar-card.js` and `family-screensaver-card.js` got a
  new `_navigateWithFallback(path)` that `_goToReturnDashboard` now calls
  instead of doing the pushState+dispatch inline: try the existing fast,
  in-app route first (wrapped in try/catch so a thrown pushState can never
  abort silently), then - after a generous 300ms grace period - check
  whether `window.location` actually changed; if it didn't, force a real
  navigation via a new one-line `_hardNavigate(path)` method (`window.
  location.assign(path)`, a full page reload). `_hardNavigate` is
  deliberately its own tiny method (not inlined) purely so tests can stub
  it - `window.location.assign` turned out to be non-writable/non-
  configurable in jsdom (confirmed via `Object.getOwnPropertyDescriptor`),
  so a test can't spy on the real browser API directly the way it can on
  an ordinary instance method. This approach is deliberately agnostic
  about the actual root cause on this specific household's device - it
  fixes ANY failure mode (wrong dispatch target, a WebView not
  propagating the synthetic event, a thrown exception, or anything else)
  by verifying the outcome rather than trusting the mechanism.
  New tests in both `test_main_screensaver_wake_dashboard.js` and
  `test_screensaver_card.js`: simulate the soft route failing outright
  (monkeypatching `history.pushState` to throw, mirroring a kiosk
  WebView's SecurityError) and confirm `_hardNavigate` fires with the
  right path once the 300ms grace period elapses; and confirm the
  fallback does NOT fire when the soft route already succeeded (the
  ordinary/working case - it's an opportunistic safety net, not a
  replacement for the smooth in-app transition). Full Python (171 passed)
  and JS suites re-verified clean.
- **v204 (1.132.33)**: household bug report, verbatim: "tapping with the
  screen saver running doesnt seem to send you back to the set dashboard."
  Diagnosed via two clarifying questions (which screensaver, and whether
  the field was actually filled in/saved) plus a third asking for the
  exact typed value, which turned out to be the whole story:
  `dashboard-tablet/family-calendar` - no leading `/`. `history.pushState
  (null, "", path)` resolves a path with no leading slash as RELATIVE to
  whatever page happens to be showing at that exact moment (e.g. producing
  something like `/lovelace-family/dashboard-tablet/family-calendar`
  instead of the intended `/dashboard-tablet/family-calendar`) rather than
  root-relative - Home Assistant's router has no panel matching that
  broken URL, so the dispatched `location-changed` event is a silent
  no-op. The screensaver still visibly dismisses on tap (that part never
  depended on the path at all), which is exactly why it read as "doesn't
  send you back" rather than "tapping doesn't do anything."
  This field (Settings -> General -> Screen Saver -> "Return to this
  dashboard on wake", `.screensaver-return-dashboard-input`) is a plain
  free-typed text input with zero validation - unlike the STANDALONE
  Screen Saver card's own `return_dashboard_path`, which is filled in
  through Home Assistant's own built-in navigation selector/picker
  (`getConfigForm`'s `selector: {navigation: {}}`) and so can only ever
  produce an already-correctly-prefixed path. That's why this bug only
  ever hit the built-in screensaver, not the standalone card.
  Fixed with a new shared helper, `_normalizeDashboardPath(raw)`, added to
  BOTH `family-week-calendar-card.js` and `family-screensaver-card.js`
  (kept as two copies, same precedent as `_defaultUserProfile`/
  `_goToReturnDashboard` themselves already being duplicated between the
  two files) - blank stays blank, an already-`/`-prefixed path or a full
  `http(s)://` URL is left untouched, anything else gets a leading `/`
  prepended. Applied at three layers on the main card (defense in depth,
  matching how seriously this file already treats settings-blob
  normalization elsewhere):
  1. `_normalizeSettings`'s own `screenSaverReturnDashboardPath` parsing -
     this is the one that matters most for an ALREADY-AFFECTED household:
     it runs on every `_fetchSettings()`, so a bad value already sitting
     in the store self-heals the very next time settings load, with zero
     action needed from the household (no reopening Settings, no
     retyping) - this household's own devices fix themselves the moment
     they update.
  2. `_saveSettings`'s own extraction of the input's `.value` - so
     retyping/resaving the same bare value never re-introduces the bug.
  3. `_goToReturnDashboard()` itself, at the actual point of use - a last
     line of defense against a value that reached the store some other
     way entirely (a direct `family_hub/set_settings` call, a restored
     backup, etc).
  The standalone card got the identical helper plus the identical
  three-layer treatment adapted to its own shape: `setConfig` (its
  "load"/normalize point, equivalent to `_normalizeSettings`) and
  `_goToReturnDashboard` - it has no separate "Save" step of its own
  beyond the yaml editor writing straight into `setConfig`.
  New tests: `test_main_screensaver_wake_dashboard.js` gained two new
  sections - the household's own exact reported value
  (`dashboard-tablet/family-calendar`) self-heals to
  `/dashboard-tablet/family-calendar` on load with NO Settings interaction
  at all, and wake then actually navigates there; and saving that same
  bare value through the Settings form persists it already
  slash-prefixed. `test_screensaver_card.js` gained one new assertion -
  `setConfig` adds the missing leading slash for the standalone card too.
  Full Python (171 passed) and JS suites re-verified clean.
- **v203 (1.132.32)**: household ask, verbatim: "there should be another
  permission level for [like] a child setting that hides the user tab too" -
  a direct, same-session follow-up to v202/1.132.31's non-admin Settings
  restriction. That version already cut a non-admin's Settings modal down
  to per-device display settings, theme, the calendar timeline range,
  Default view, and their OWN notification-profile row under the Users
  tab. This adds a second, narrower notch below that: a per-person "Child
  account" flag that, when it's the CURRENT viewer's own flag, additionally
  hides the whole Users tab - so a child can't reach even their own
  profile row.
  The flag itself (`isChildAccount`, default `false`) lives on the same
  per-user notification profile object as `includeInChores`/`color`/etc.
  (`SETTINGS_KEY_USER_PROFILES` -> `settings.userProfiles[uid]`) - NOT a
  new top-level settings key, NOT anything backend/Python touches at all
  (nothing server-side ever reads it; this is a pure frontend UI gate, same
  "belt-and-suspenders, not enforcement" caveat as the v202 gating and the
  original Danger Zone gate before it). Three frontend spots needed it,
  matching the exact pattern `includeInChores` already established:
  `_defaultUserProfile()` (new field, extensively commented on why it's
  safe/necessary), `_normalizeUserProfiles()` (`isChildAccount: !!p.
  isChildAccount` - CRITICAL per `_ws_set_settings`'s own docstring in
  `__init__.py`: that handler is a full REPLACE, not a merge, so any field
  the card's own JS doesn't know to read-and-resend on Save gets silently
  dropped from the store forever after the next save - skipping this step
  would have reproduced the exact "PIN silently wiped" class of bug that
  bit `pinHash`/`pinSalt` once already, just for this new field instead),
  and `_saveSettings()` needed NO change at all, since it already carries
  `this._settingsUserProfilesDraft` through unchanged/verbatim (comment:
  "this form has no fields of its own for it") - the draft itself already
  has the field once `_normalizeUserProfiles` puts it there at Settings-open
  time.
  UI: a new "Child account" On/Off field (`.notify-profile-child-field`/
  `.notify-profile-child-btn`) inside each person's own Notification
  Profile modal, placed right after "Include in Chores & Rewards" -
  admin-only, gated the exact same way (a plain `this._hass.user.is_admin`
  check, `style.display`) as the existing Kiosk PIN login and Permissions
  accordions already in that same modal - a child can never see or flip
  this about themselves, only an admin looking at ANY profile (including
  someone else's, or in principle their own) can. `_userProfileSummaryText`
  now leads with "Child account" when set, so an admin scanning the Users
  tab list sees it at a glance, same idea as leading with calendar count.
  Gating itself: a new block in `_openSettings()`, right after the existing
  `.admin-only-setting` loop from v202 - reads the CURRENT viewer's own
  entry out of `this._settingsUserProfilesDraft` (already populated by that
  point in the function) and, only when `!isAdmin && ownProfile.
  isChildAccount`, sets `display:none` on `.settings-tab-btn[data-
  settings-tab="notifications"]` (the Users tab button itself - the tab
  panel underneath was already unreachable once its own button is hidden,
  and `_setSettingsTab("general")` is already forced earlier in the same
  function regardless). An admin is never gated by this, even in the
  should-never-happen case their own profile somehow has the flag set -
  `isAdmin` short-circuits it exactly like it already does for the entire
  `.admin-only-setting` set.
  New test: `test_settings_child_account.js` - the Child account field
  itself is hidden for a non-admin viewer/shown for an admin inside
  `_openNotifyProfileModal`; clicking it updates the draft and the summary
  line; a non-admin flagged as a child loses the Users tab button AND
  keeps every other v202 restriction on top (not a different, disjoint
  set); an ordinary (non-flagged) non-admin still has the Users tab
  button; and an admin is never gated by this even with the flag somehow
  set on their own profile. Full Python (171 passed) and JS suites
  re-verified clean, including the pre-existing v202 test.
- **v202 (1.132.31)**: household ask, verbatim: "1. If a user is not an
  admin the only thing they should be able to see in settings is: THe per
  device settings, theme, calendar timeline range, week and month view
  items. Small screen mode etc. Whos reminders they subscribe to, and what
  calendar is associated with them." Before this, the calendar card's own
  in-dashboard Settings modal (⚙️, `_openSettings()`/`.settings-box`) had
  exactly ONE admin gate anywhere in it - the Chores/Rewards Danger Zone
  (`.chores-danger-zone`, `style="display:none"` by default, revealed only
  for `this._hass.user.is_admin`). Every other section - household
  calendar management (the `.people-list`/`+ Add calendar` controls inside
  the Calendars accordion), the informational Reminders accordion, "Grey
  out events" and "+ button position", Lock vertical scrolling, Menu
  Blocks, the whole Chores/Rewards/Routines accordion, Countdown, Daily
  Digest, Grocy, Screen Saver, the Notification tap destination field
  (Users tab), Add a person, and every OTHER member's own notification
  profile row - was fully visible (and editable) to any Family Hub member
  who could open the card, admin or not. `_isAdmin()` itself is unchanged
  (`!!(this._hass && this._hass.user && this._hass.user.is_admin)` - the
  real HA login, not kiosk-elevation-aware, same as before) - this only
  changes what the card SHOWS a non-admin.
  Implementation: every non-whitelisted `.field` wrapper (or, for the
  three bare elements inside the Calendars accordion body - `.people-hint`,
  `.people-list`, `.add-person-btn` - and the Notification tap destination/
  Add-a-person fields on the Users tab - the element itself) is tagged
  `admin-only-setting` directly in the Settings modal's HTML template. A
  new block at the end of `_openSettings()`, right before `_openModal(...)`,
  does `root.querySelectorAll(".admin-only-setting").forEach(el => el.
  style.display = isAdmin ? "" : "none")`, reusing the `isAdmin` local
  variable `_openSettings()` already computes just above (for the
  Permissions prefetch gate) rather than re-deriving it. Critically, this
  runs AFTER every field is already populated from the real saved
  settings/theme/screensaver objects (all the `.value`/`.checked`/
  `.classList.toggle("active", ...)` assignments earlier in the same
  function) - hiding is pure CSS, the DOM element and its real value are
  untouched, so a non-admin who opens and saves Settings can never
  silently blank out a household-wide field they never even saw (the Save
  handler reads the exact same DOM either way, admin or not). This is the
  same "wipe hidden fields" risk the `reminders` options-flow step's own
  docstring already calls out for a different surface - handled here by
  never actually removing/skipping population of the hidden fields, only
  hiding them visually.
  `_renderNotifyProfilesList()` (Users tab) got a second, independent
  change: the `members` filter now also requires `u.id === currentUserId`
  when the viewer isn't an admin, so a non-admin sees exactly one row -
  their own - satisfying "whos reminders they subscribe to, and what
  calendar is associated with them" (that row's Edit button still opens
  `_openNotifyProfileModal`, which is where calendar subscriptions/
  standalone-reminders/digest opt-in for that ONE person actually live -
  left completely unchanged, since everything in it is that person's own
  data, not a household-wide setting). The row's own ✕ Remove button is
  now conditionally rendered - omitted entirely for a non-admin (removing
  yourself, or anyone else, isn't part of the whitelist) - an admin still
  gets it on every row, including their own, unchanged. The already-
  existing Kiosk PIN and Permissions accordions inside that same profile
  modal were left as-is (already independently admin-gated via the same
  `isAdminForPin` check in `_openNotifyProfileModal` - not touched here).
  Judgment call, flagged rather than guessed silently: the profile modal
  itself (reminders on/off, chore/reward alert toggles, digest sections,
  timer alarm, etc.) was NOT further restricted beyond what already existed
  - the household's whitelist only names "which calendars/reminders" for
  the Users-tab list itself, and everything inside a person's own profile
  modal is that same person's own preference about themselves, not a
  household-wide value, so no request to lock any of it down was read into
  the ask.
  New test: `test_settings_nonadmin_restriction.js` - opens Settings as a
  non-admin and asserts every `.admin-only-setting` element is hidden
  while every whitelisted field (Default view, Week button shows, Timeline
  range, Small screen mode, Theme colors accordion, This device's theme)
  stays visible; asserts the Users tab renders exactly the non-admin's own
  row with no Remove button but a working Edit button; then repeats as an
  admin and asserts nothing is hidden and both members' rows (each with
  its own Remove button) render. Full Python (171 passed) and JS suites
  re-verified clean.
- **v201 (1.132.30)**: household ask, verbatim: "add a settings button to
  the integration settings page." Clarified via a follow-up question -
  offered "new menu item on the existing Configure flow" vs. "link to the
  card's own Settings modal" vs. "something else" - and the household
  picked the second: point the integration page at the card's own Settings
  modal, since that's where most day-to-day toggles (theme, per-person
  notifications, Chores & Rewards options, screensaver, etc.) actually
  live, not in `config_flow.py`'s options flow at all. Home Assistant's own
  "Configure" button (Settings -> Devices & Services -> Family Hub ->
  Configure) already opens `FamilyHubOptionsFlow`'s menu (reminders,
  grocy, test_notify, upcoming, update) - a config flow step can't reach
  into a Lovelace card's JS to open that modal directly (two completely
  separate surfaces: the flow renders as its own dialog in the Settings
  page, the card's modal lives inside a dashboard view), so this adds a
  new "Family Hub Settings" menu item at the TOP of that same menu whose
  step is purely informational (`async_step_settings`, `vol.Schema({})`,
  same "read-only, no fields" shape as the existing `async_step_upcoming`)
  - it just tells the admin where to actually find the gear icon
  (family-week-calendar-card.js's `.settings-btn`/`_openSettings()`, top-
  right corner of the card) rather than pretending to be a shortcut into
  it. New `strings.json`/`translations/en.json` entries: `options.step.
  init.menu_options.settings` and a new `options.step.settings` block with
  the pointing-you-there description. No existing Python test exercises
  the options flow menu at all, so nothing needed updating there; full
  JS + Python suites re-verified clean regardless.
- **v200 (1.132.29)**: household bug report, verbatim: "the confetti
  animation is still not working" - a THIRD confetti bug, distinct from
  v190's "make it default on" and v190.1's Android position:fixed-clipping
  fix (both already shipped). Root cause this time: `choresConfettiOnComplete`
  is a schema-free Settings key with NO backend-side default at all - the
  backend just stores/returns whatever's actually in the blob, nothing
  more. "Defaults to on" was only ever implemented as a local JS `defaults`
  object inside `family-week-calendar-card.js`'s own Settings-modal code
  (used to pre-select the "On" toggle button the FIRST time someone opens
  that modal, and to fill in the key when that modal's OWN Save handler
  builds its payload) - it only ever actually reaches the shared settings
  blob once someone opens Settings -> General and hits Save at least once.
  Until then, `family_hub/get_settings` keeps returning a blob with no
  `choresConfettiOnComplete` key whatsoever, and `family-hub-chores-
  card.js`'s own `_defaultSettings()` (used by `_fetchSettings` to fill in
  whatever the raw blob leaves out via `Object.assign(this._defaultSettings(),
  raw)`) never listed this key either - so `_confettiOnCompleteEnabled()`'s
  `!!(this._settingsCache && this._settingsCache.choresConfettiOnComplete)`
  silently evaluated to `false` for any household that had never (re-)
  saved that one settings screen, even though the Settings UI itself would
  have shown the toggle sitting on "On." This is exactly the gap a fresh
  install (or an existing household upgrading past v190 without ever
  reopening Settings) falls into - the two EARLIER confetti fixes were
  real and necessary, but this default-merge gap meant confetti could
  still just never fire at all, independent of both of them. Fixed by
  adding `choresConfettiOnComplete: true` to `_defaultSettings()` in
  `family-hub-chores-card.js`, matching the calendar card's own default,
  so the merge now actually produces `true` when the key is absent instead
  of `undefined`. New regression case in `test_chores_confetti.js`: a
  settings blob with no `choresConfettiOnComplete` key at all still reads
  as enabled and still spawns a confetti overlay on a successful complete.
  Full JS + Python suites re-verified clean.
- **v199 (1.132.28)**: household bug report, verbatim: "when logging in
  and trying to adjust stars I get an error that only an admin can adjust
  stars." Root cause: identical bug class to v1.132.9's ws_add_catalog_item
  fix (see that handler's own docstring), just never applied to
  `ws_adjust_balance` (`chores_websocket_api.py`) - the handler only ever
  checked the raw connection identity via `_has_permission(entry_data,
  connection, PERMISSION_REWARD_OVERRIDE)`, and its schema didn't even
  declare `elevation_token` as an accepted field. On a shared kiosk
  display, logging in as a specific household member (PIN-elevation, see
  `ws_kiosk_elevate`) is a Family-Hub-level concept layered on top of ONE
  shared underlying Home Assistant login for that physical device/browser -
  so "am I an admin" has to be re-resolved against the ELEVATED person, not
  the shared device's own HA account, and every other reward-side action
  (redeem, gift stars, approve/reject a suggestion, add a catalog item)
  already does this correctly by routing its websocket call through the
  card's `_kioskMsg()` wrapper (which rides the elevation token along) and
  having its handler resolve `(actor_id, is_admin)` via `_effective_actor`
  before checking permission via `_has_permission_ctx`. `ws_adjust_balance`
  did neither. Fixed on both ends: the handler now accepts an optional
  `elevation_token` and uses `_effective_actor`/`_has_permission_ctx`
  exactly like `ws_add_catalog_item` does; on the frontend
  (`family-hub-rewards-card.js`), both call sites that hit this
  endpoint - `_adjustBalance` (the quick +/- balance buttons) and
  `_submitManageStars` (the Manage Stars modal's Save) - now wrap their
  message through `this._kioskMsg(...)` instead of sending it bare. New
  regression coverage in `test_kiosk_login_rewards_card.js`'s existing
  `test_actions_while_elevated_carry_elevation_token` test: after PIN-
  elevating, `_adjustBalance` is called and the resulting `adjust_balance`
  websocket call is asserted to carry the elevation token, same shape as
  that test's existing redeem/approve_suggestion assertions. No dedicated
  Python-level test was added for this - there's no existing Python test
  coverage of `_effective_actor`/`_has_permission_ctx` at all in this repo
  (every kiosk-elevation test lives at the JS layer, asserting the
  outgoing message shape), and this fix reuses those two helpers exactly
  as several already-shipped, already-covered-elsewhere handlers do, so no
  new backend test infrastructure was invented for just this one handler.
  Full JS + Python suites re-verified clean. NOT fixed in this pass (same
  bug class, but the household only reported adjusting stars, so this was
  kept minimal/reviewable): `ws_delete_redemption`/`ws_reverse_redemption`
  have the identical plain-connection-check pattern and their frontend
  call sites also don't route through `_kioskMsg` - worth revisiting if a
  household ever reports the same symptom for clearing/reversing
  redemption history from an elevated kiosk login.
- **v198 (1.132.27)**: household ask, verbatim: "automate should be a ab
  under advanced" (read as "a tab") - a follow-up correcting v197's nested-
  accordion approach. Inside the chore create/edit modals' "Advanced
  Settings" `.accordion-body`, the sensor-trigger fieldsets are no longer
  their own nested accordion - they're now the "Automate" pane of a small
  two-tab row (`.advanced-tabs`/`.advanced-tab`), with everything else that
  used to sit loose in Advanced Settings (Important/No-approval, Quantity,
  Timer, Notes, Depends on, recurrence, Rotation group) grouped into the
  sibling "Settings" tab, active by default. New generic `_wireAdvancedTabs
  (box)` helper (delegated click-loop over `.advanced-tab`, toggling
  `.advanced-tab-pane[hidden]` by matching `data-adv-tab`/`data-adv-tab-
  panel`) - deliberately its own method rather than reusing `_wireModalTabs`,
  since that one is hardcoded to the OUTER Chore/Goal/Routine pane classes
  (`.chore-pane`/`.goal-pane`/`.routine-pane`) and would have tried to drive
  these too if the class names collided (`.modal-tab` was deliberately
  avoided for this reason - these are `.advanced-tab` instead). Called
  alongside the existing `_wireAccordions(box)` in both `_openCreateModal`
  and `_openEditModal`. New CSS block reusing `.modal-tabs`/`.modal-tab`'s
  visual language at a slightly smaller size. Full JS + Python suites
  re-verified clean.
- **v196/v197 (1.132.26)**: two household asks in the same turn, both about
  the chore create/edit modals' field ordering. First, verbatim: "for
  chores everything from mark important down put under the advanced
  accordion" - in both `_openCreateModal` and `_openEditModal` (family-hub-
  chores-card.js), the Important/No-approval `.remind-check-row`,
  Quantity, Timer, Notes, Depends on, the recurrence fields
  (`_recurFieldsHtml`), and the Rotation group field all moved from the
  main visible form into the existing "Advanced Settings"
  `.accordion-body` (`#chore-create-advanced-body`/`#chore-edit-advanced-
  body`), ahead of the sensor-trigger fieldsets that already lived there.
  The main form now ends at Overdue penalty before the Advanced Settings
  toggle. Then, mid-turn follow-up, verbatim: "put the automation stuff
  under an accordion that says automate" - the two sensor-trigger
  fieldsets (Auto-create trigger, Auto-complete trigger) that were sitting
  loose inside Advanced Settings got their own NESTED accordion, "Automate"
  (`#chore-create-automate-body`/`#chore-edit-automate-body`), one
  accordion inside another. No new wiring needed - `_wireAccordions(box)`
  already delegates over every `.accordion-toggle` in the box regardless of
  nesting depth, since each toggle's `data-target` is just an id looked up
  fresh at click time. No `.closest()`/positional-DOM lookups anywhere in
  this file depend on field order, so nothing else needed touching. Full
  JS + Python suites re-verified clean after both changes.
- **v195 (1.132.25)**: household ask, verbatim: "for routines instead of
  add item.make it say create and move it to the right hand side not left"
  - a small follow-up to v194's modal redesign, scoped to the Routine tab's
  own add-item form (`_routineManagePaneHtml`) in `family-hub-chores-
  card.js`. `.rm-add-btn`'s label changed from "Add Item" to "Create", and
  its CSS split out of the shared `.rm-add-btn, .rm-item-save-btn { ...
  align-self: flex-start; }` rule into its own `.rm-add-btn { align-self:
  flex-end; }` override so ONLY the add-item button moved to the right -
  its sibling `.rm-item-save-btn` (the per-item inline Edit form's Save
  button, a completely different button that happens to share styling)
  deliberately stays left-aligned, since the household only asked about
  the Routine tab's Add button. No markup/JS wiring changed, no test
  assertions referenced the old "Add Item" label. Full JS + Python suites
  re-verified clean.
- **v194 (1.132.24)**: household ask, verbatim: "lets work on making the
  chores and rewards modals more similar to the add calendar and add
  reminder modal" - clarified via a follow-up scoping question to be the
  "Full visual match" option: rebuild the Chores/Rewards modals' markup and
  CSS to reuse the same look as the calendar card's Add Event modal (header
  with icon, styled tabs, `.field`-style labels, toggle-button rows,
  styled accordion for Advanced Settings, matching buttons), NOT a rename
  of the underlying JS-facing class hooks. Ported the calendar card's own
  design-system CSS (`family-week-calendar-card.js`'s `.modal-close`/
  `.field`/`.modal-box h2`/`.size-btn-row`/`.accordion-*`/`.remind-check-*`
  rules - no shared module between the cards, so this is its own
  independent copy of the same look, same convention as every other
  cross-card CSS port in this project) into both `family-hub-chores-
  card.js`'s and `family-hub-rewards-card.js`'s own `_css()` methods,
  deliberately layered ONTO the existing `.modal-tab`/`.cancel-btn`/
  `.save-btn`/`.modal-actions`/`.modal-tabs` class names rather than
  renaming them, so none of the JS wiring that already queries those
  selectors (`_wireModalTabs`, the various `.cancel-btn`/`.save-btn` click
  handlers, etc.) needed to change - only the visuals did. Added a new
  `.modal-close` circular ✕ button (top-right, absolutely positioned - each
  modal box now needs `position: relative`) to every modal that didn't
  already have one: chores create/edit/reject, rewards create/edit/reject/
  gift-stars/manage-stars. Converted the plain "label wraps input" pattern
  to the calendar card's own `.field` wrapper (label above input, on its
  own line) for every top-level field in those same modals - fieldset-
  internal fields (the auto-create/auto-complete trigger sub-fields) were
  deliberately left in the old label-wraps-input style to limit blast
  radius, since they're a lower-visibility nested concern, not part of the
  modal's primary chrome. `.remind-check-opt` (used by the Important/No-
  approval/multi-assign checkboxes in the Chores card) had NO matching CSS
  rule before this - it rendered as a plain unstyled label - this is the
  first time it's actually been styled, reusing the calendar card's own
  pill-checkbox look. Converted the native `<details>/<summary>` "Advanced
  Settings" twist in both the chores create AND edit modals to the
  calendar card's generic `.accordion-toggle`/`.accordion-body`/
  `.accordion-chevron` pattern, wired via a new shared `_wireAccordions(box)`
  helper on the chores card (delegated click-loop, same idiom as the
  calendar card's own accordion wiring - no shared module, independently
  copied). Reward modal headings gained a leading 🎁/⭐ emoji and moved from
  `<h3>` to `<h2>` to match the calendar card's icon+heading convention;
  Manage Stars' "Who" field and the reason/amount fields moved to `.field`
  wrappers too. One real behavioral-adjacent risk handled carefully: the
  chores card's own `syncModeFields`/multi-assign toggle logic used to find
  the "Assigned to" select's wrapping element via `.closest("label")` -
  since that field moved to a `.field` div, this now reads `.closest
  (".field")` instead (both in the card itself and in `test_chores_
  important_multiassign_library_frontend.js`, which made the identical
  assumption). `test_rewards_card.js`'s three `h3`-heading assertions
  (Add/Suggest/Edit reward) were updated to `h2` plus the new emoji prefix.
  Full JS suite + full Python suite both re-verified clean after every
  round of edits (171 Python tests passed, every `test_*.js` file passed).
  Deliberately NOT touched in this pass (lower-visibility, left as-is to
  keep the change reviewable): the Rewards card's icon-picker category
  accordion (`.m-icon-category`/`.m-icon-cat-toggle` - it already had its
  own bespoke accordion styling, not a native `<details>`, so it wasn't a
  "still looks old" complaint) and the Star History modal (a read-only list
  view, no form fields to redesign).
- **v193 (1.132.23)**: household ask, verbatim: "Default dashboard on
  screen saver wake. We added where the device should be when waking from
  screensaver in the screensaver card, but never added that functionality
  to the main screensaver. Let's add it." "The screensaver card" is the
  standalone companion card (`family-screensaver-card.js`, near-invisible,
  placed on some OTHER dashboard to bring the auto screensaver there) -
  it's had a per-card yaml field (`return_dashboard_path`, a "navigation"
  selector in its Edit Card form) and its own `_goToReturnDashboard`
  (`history.pushState` + a bubbling `location-changed` event, called from
  `_hideScreenSaver` - the wake moment) since it was built. "The main
  screensaver" is `family-week-calendar-card.js`'s own built-in auto
  screensaver (Settings -> General -> Screen Saver) - a single
  household-wide feature, not something placed as its own card per
  dashboard, so this ports the same idea as a new plain string field,
  `screenSaver.returnDashboardPath`, on that same shared `screenSaver`
  settings sub-object (alongside `sourceType`/`videoUrl`/`cameraEntity`/
  `idleSeconds`/`usersEnabled`/`disableWhileRecipeOpen` - defaults to `""`,
  so upgrading changes nothing until a household sets one). New "Return to
  this dashboard on wake" text field added right after the existing
  "Disable while a recipe is open" field in that same Screen Saver
  accordion, wired through the same ~4 touch points a `screenSaver.*`
  field needs here (it's ONE shared object, not the ~8-touch-point pattern
  flat top-level booleans need): default in the `screenSaver` defaults
  object, parse line in `_normalizeSettings`, HTML field + populate-on-
  Settings-open, and DOM-read-on-save into the `screenSaver` object built
  there - the object itself (not each individual field) is what's already
  wired into the merged-settings return value and the `set_settings` save
  payload, so nothing else needed touching. New `_goToReturnDashboard()` on
  the calendar card - functionally identical to the companion card's own
  method of the same name (intentionally not shared/refactored into one
  place; these are two separate card files that don't import from each
  other) - called from `_hideScreenSaver()` right after the existing
  `_resetScreenSaverIdleTimer()` call. New `test_main_screensaver_wake_
  dashboard.js` (mirrors `test_screensaver_card.js`'s own "Wake
  navigation" section) - Settings field exists/defaults blank/round-trips
  through Save without disturbing the other `screenSaver.*` fields; waking
  with a configured path pushes it + fires `location-changed`; waking with
  a blank path (the default) doesn't navigate at all. Full suite (171
  Python + all JS) re-run clean, zero regressions.

- **v192 (1.132.22)**: bugfix, household report, verbatim: "the confetti
  animation doesn't seem to work in home assistant app on my android
  phone." Root cause: `_fireConfetti` (family-hub-chores-card.js) used to
  append its `.chore-confetti-overlay` (`position: fixed; inset: 0`)
  straight into `this._root` - the card's OWN shadow root. `position:
  fixed` only covers the true viewport when nothing between the element
  and the page root establishes its own CSS containing block (a
  `transform`/`filter`/`perspective`/`contain` on an ancestor) - if
  something does, a fixed descendant is fixed to THAT box instead, and
  gets clipped to it if anything in between also has `overflow: hidden`.
  The official Home Assistant Android app's dashboard/card grid does
  exactly this for its own panel/swipe transitions, so a card that looks
  fine in a plain browser or on a wall tablet's kiosk view can silently
  fail inside the Android app specifically - this project already hit the
  identical bug once before for the Grocy Recipe Viewer's full-screen
  modal (see `_grocyViewerOverlay`'s "escapes the shadow root/dashboard
  grid" comment, and its `.fh-grocy-viewer-portal` pattern) and fixed it
  the same way each time: build the overlay as its own top-level "portal"
  `<div>` appended straight to `document.body`, completely outside both
  the shadow root AND the dashboard grid's own DOM subtree, so `position:
  fixed` has nothing above it to be contained by. `_fireConfetti` now does
  this - new `_confettiCss()` returns the (unchanged) confetti CSS as a
  string, the portal carries its own inline `<style>` (shadow DOM
  encapsulation means the card's shadow-root stylesheet no longer reaches
  an element outside it at all - the confetti CSS never referenced any
  card/theme custom properties to begin with, all colors are plain hex,
  so nothing else needed to come along), and the three `.chore-confetti-*`
  rules were removed from `_css()`'s shadow-root stylesheet (dead there
  now) in favor of living only in `_confettiCss()`. Also switched
  `inset: 0` to explicit `top/right/bottom/left: 0` in that same CSS for
  slightly broader WebView compatibility, belt-and-suspenders alongside
  the real fix. Pending portals are tracked in `this._confettiPortals`
  (an array) and force-removed in `disconnectedCallback` too, so a card
  torn down mid-burst (dashboard edit, navigating away) never leaves an
  orphaned full-screen overlay sitting on the page - previously this was
  implicit (the overlay died along with the shadow root when the host was
  removed); now that it lives in document.body it needs explicit cleanup.
  `test_chores_confetti.js` updated throughout to query `document.body`
  instead of `el._root` for `.chore-confetti-overlay` (plus one new
  assertion that it's explicitly NOT in the shadow root, and a new case
  covering the disconnectedCallback force-cleanup) - still 6 cases, full
  suite re-run clean, zero regressions.

- **v191 (1.132.21)**: household follow-up, verbatim: "family hub is not
  showing as an integration with automation triggers and it's not showing
  if I type family into the trigger search." (The original ask this
  answers, v186's "routines should be able to be triggers for
  automations," had already shipped as a plain `hass.bus.async_fire`
  event - see ROUTINE_EVENT_TYPE in const.py - which technically worked
  as a manually-typed Event trigger, but Home Assistant's "Add Trigger"
  search only ever surfaces an integration by name for entities/DEVICES
  it owns; Family Hub had never registered a device at all, hence never
  showing up no matter what was typed.) Two pieces close the gap:
  `__init__.py`'s `async_setup_entry` now registers one "Family Hub"
  device per config entry (`device_registry.async_get_or_create`,
  identifiers `{(DOMAIN, entry.entry_id)}` - a household normally only
  has one config entry, so in practice one device). New
  `family_hub/device_trigger.py` implements Home Assistant's own device
  automation "trigger" platform contract for that device -
  `async_get_triggers` lists three trigger types (Routine completed /
  Routine item toggled / Routine item approved, 1:1 with the three
  `event` values `_fire_routine_event` already sends), guarded so a
  device from some OTHER integration never gets offered Family Hub's
  triggers; `async_get_trigger_capabilities` offers optional "Category"
  (Morning/Afternoon/Night Routine, from `ROUTINE_CATEGORY_LABELS`) and
  "Person" (every real household member, id->name, looked up live via
  `hass.auth.async_get_users()` and excluding system-generated accounts -
  same source `family_hub/list_users` already uses) narrowing fields, both
  optional/left-blank-means-any; `async_attach_trigger` doesn't reimplement
  any event-matching itself - it just resolves the trigger type to the
  actual payload `event` value, layers in `category`/`user_id` into
  `event_data` only when the household actually picked them, and delegates
  to Home Assistant's own `homeassistant.components.homeassistant.
  triggers.event.async_attach_trigger` (`platform_type="device"`). Added
  `device_automation.trigger_type.*` labels to both `strings.json` and
  `translations/en.json` so the three trigger types show friendly names
  instead of their raw slugs in the UI. A restart is needed after
  updating for the device to actually appear (device registration happens
  in `async_setup_entry`). Extended the fake HA test harness at
  `/tmp/hatest/homeassistant` with `const.py` (CONF_DEVICE_ID/DOMAIN/
  PLATFORM/TYPE), `helpers/device_registry.py`, `helpers/config_
  validation.py`, `helpers/trigger.py`, `helpers/typing.py`, `components/
  device_automation` (DEVICE_TRIGGER_BASE_SCHEMA), and `components/
  homeassistant/triggers/event.py` (a call-recording stand-in for HA's own
  already-tested Event trigger platform, not a reimplementation of it) -
  none of these existed before since this was the project's first use of
  the device automation platform contract. New `test_routine_device_
  trigger.py` (8 cases - triggers listed only for Family Hub's own device
  and empty for any other device/an unknown device id, trigger
  capabilities offer category + real-members-only person choices,
  attach resolves each of the three trigger types to its real event
  name, and category/user_id are layered into event_data only when
  explicitly chosen, never forced). Investigating why adding this new
  test file made an existing, previously-written-off "pre-existing pytest
  flakiness across ~134 unrelated tests" problem visibly worse led to
  actually root-causing and fixing that whole issue this session too -
  see the "Update, v190/v191 session" note in the Testing Conventions
  section above for the full story (two files with an unguarded
  module-level `asyncio.run()` that silently broke pytest collection for
  the entire suite, once you knew to look for it).

- **v190 (1.132.20)**: two default-flip asks in one message, verbatim:
  "turn it on by default also default month view should be month + day."
  (1) Confetti (v189, just above): the household changed their mind after
  seeing it off by default - `choresConfettiOnComplete`'s entry in
  `family-week-calendar-card.js`'s settings-defaults object flipped from
  `false` to `true`. Nothing else about the feature changed - it's still
  a per-household toggle on the same schema-free Settings blob, still
  fully off-able from Settings -> General. Because the parse logic
  (`typeof parsed.choresConfettiOnComplete === "boolean" ? parsed... :
  defaults...`) already falls back to `defaults.choresConfettiOnComplete`
  for any settings blob that's never explicitly saved this key, this one
  default-object edit is sufficient to flip it on for every household
  that hasn't touched the setting yet - no migration needed, and any
  household that already explicitly saved `false` keeps that choice.
  (2) Month view: `_getMonthViewVariant()`'s own fallback (for a device
  that's never saved `familyCalendarMonthViewVariantLocal` locally)
  changed from `"month"` (the classic single grid) to `"split"` ("Month +
  Day" - classic grid on one side, the selected day's event list on the
  other, added back in v145). Same this-device-only localStorage pattern
  as every other view-variant setting (`_getWeekViewVariant`, small
  screen mode) - a device that's already saved an explicit `"month"`
  choice is untouched, this only changes what a brand-new device (or one
  that's simply never opened Month view) starts on. Tests:
  `test_chores_confetti.js` updated in place (the calendar-card Settings
  section now asserts the On button is active by default and that
  turning it Off saves `choresConfettiOnComplete: false`, rather than the
  old off-by-default assertions) and new `test_month_view_default_variant.
  js` (4 cases - fresh device defaults to split, an explicit saved
  "month" choice is preserved, an explicit saved "split" choice is
  preserved, and the Settings -> General "Month + Day" button shows
  active by default on a fresh device).

- **v189 (1.132.19)**: household ask, verbatim: "Confetti pop when chore
  complete. Add to chore settings to display a confetti pop animation on
  chore completion." Purely a frontend cosmetic feature - no `const.py`
  entry, no backend involvement at all, same precedent as `choreDueShowTime`
  (both are pure display toggles the backend never reads). New setting
  `choresConfettiOnComplete` (default `false`) lives on the same
  schema-free household Settings blob as every other opt-in cosmetic
  toggle, added to `family-week-calendar-card.js`'s Settings -> General
  tab (new "Confetti when a chore is completed" field, Off/On buttons,
  wired through the same ~8 touch points every boolean setting on that
  blob needs: defaults object, parse line, merged-settings return object,
  HTML field, click-wiring, active-state sync on Settings-open, DOM-read-
  on-save, and the `settingsObj` save payload). `family-hub-chores-card.js`
  reads it via new `_confettiOnCompleteEnabled()` (checks
  `this._settingsCache.choresConfettiOnComplete`) and, when true, calls new
  `_fireConfetti()` right after a chore's `family_hub/chores/complete` call
  succeeds (never on a failed complete). `_fireConfetti()` is pure vanilla
  JS/CSS - no external library or CDN, matching this project's "must work
  fully offline on a wall tablet" convention that every other visual effect
  already follows. It builds a `position: fixed; inset: 0`
  `.chore-confetti-overlay` div (appended directly to `this._root`, so it
  covers the whole viewport regardless of where on the board the completed
  chore's card was) containing 70 randomized `.chore-confetti-piece` spans
  (random horizontal position, one of 8 colors, 1.5-2.7s fall duration,
  0-0.35s stagger delay, a random rotation via a `--chore-confetti-rot` CSS
  custom property, and a 50% chance of being circular vs. square), driven
  by a `@keyframes chore-confetti-fall` CSS animation, and the whole
  overlay self-removes via `setTimeout` shortly after the longest piece's
  animation would have finished. Tests: `test_chores_confetti.js` (7 cases
  across two sections - the chores card's burst-on-complete behavior gated
  on the setting, firing only after a successful complete call and never
  after a failed one, plus `_fireConfetti()` called directly self-cleaning
  up; and the calendar card's own Settings -> General round trip, covering
  that the Off/On buttons exist and default to Off, that clicking On flips
  the active state, and that Save both writes `choresConfettiOnComplete:
  true` into the `family_hub/set_settings` payload and updates the shared
  settings blob).

- **v188 (1.132.18)**: household ask, verbatim: "chore scheduling needs
  some more work potentially want to do every 2 months or every 3 months,
  every 4th week or 7th week, every other day etc." The "interval"
  recur_type used to ALWAYS mean "every N days" (recur_interval_days
  alone) - "every other day" already worked (N=2), but there was no way to
  express "every N weeks"/"every N months" at all. New field
  `CHORE_KEY_RECUR_INTERVAL_UNIT` (`recur_interval_unit`, values "days"
  (default)/"weeks"/"months") pairs with the existing count
  (`recur_interval_days`, kept as the field name for backward
  compatibility - a chore saved before this feature has no unit field at
  all, and `_normalize_recur_interval_unit` treats that exactly like an
  explicit "days," so nothing stored previously changes meaning).
  Interpreted "every 4th/7th week" as a plain N-week interval (weeks unit,
  N=4 or 7), not "the 4th week of some larger period" - consistent with
  "every 2/3 months" being a plain N-month interval, and distinct from
  `CHORE_RECUR_TYPE_MONTHLY_NTH` (v185), which already owns the OTHER kind
  of monthly pattern ("the 3rd Wednesday of every month"). New helper
  `_add_months(dt, months)` in chore_engine.py - adds calendar months,
  clamping the day-of-month to the target month's own last day when the
  original day doesn't exist there (Jan 31 + 1 month -> Feb 28, or Feb 29
  in a leap year), same "always resolvable" philosophy as `_nth_weekday_
  of_month`'s 1-4/-1 values. `_compute_next_recur_due`'s interval branch
  now branches on unit: days (unchanged - `from_dt + timedelta(days=n)`),
  weeks (`from_dt + timedelta(weeks=n)`), months (`_add_months(from_dt,
  n)`). Wired through `default_chore`/`create_chore`/`update_chore`/
  `_EDITABLE_FIELDS` exactly like every other recur_* field, plus the
  `chores_websocket_api.py` create/update schemas. Frontend
  (`family-hub-chores-card.js`): the interval field's plain "day(s)" text
  became a `.f-recur-interval-unit` `<select>` (days(default)/weeks/
  months) right next to the existing count input, read in `_applyRecur
  FieldsToPayload` (always sends "days" when the chore isn't an interval
  chore, matching how `recur_month_nth` etc. are always explicitly
  cleared too). `_recurDescriptionHtml`'s interval branch now says "Every
  other day" (a special-case for days+N=2, matching the household's own
  phrasing) or "Every N week(s)/month(s)/day(s)" otherwise - a chore with
  no `recur_interval_unit` at all (the pre-v188 shape) still reads as
  plain days, unaffected. Tests: `test_chore_recur_interval_unit.py` (19
  cases - unit normalization, `_add_months` including leap-year/month-end
  clamping and year rollover, `_compute_next_recur_due` for all three
  units including the "missing unit still means days" backward-
  compatibility case, create/update round-trip, full `approve_chore`
  integration for a months-unit chore) and `test_chore_recur_interval_
  unit_frontend.js` (6 cases - unit select exists/defaults, payload for
  months and weeks, payload forcing "days" for a non-recurring chore,
  Edit-modal pre-fill, and the friendly description-label wording
  including the pre-v188 no-unit-field case).

- **v187 (1.132.17)**: bugfix, household report, verbatim: "the days to
  repeat reminders on doesn't show when you click the rollover button."
  Root cause: v185's rolldays day-picker show/hide code (in three places -
  `family-week-calendar-card.js`'s Add Event "reminder" tab wiring, and
  both the initial-render and change-listener spots in `_renderEventInfo
  RemindSection`) set `rolldaysField.style.display = checked ? "" : "none"`
  to reveal the field. That's the correct pattern for most fields in this
  file, where the class's stylesheet rule defaults to a visible display
  and "" just means "go back to that default." But `.rolldays-field`
  itself has its OWN stylesheet rule of `display: none` (its hidden-by-
  default state, right above `.rolldays-hint` in the `<style>` block) -
  clearing the inline style back to "" doesn't override that rule at all,
  it just falls back to it, so the field silently stayed display:none
  regardless of the checkbox state. Fixed by setting an explicit `"block"`
  instead of `""` in all three spots. **Why the existing test suite didn't
  catch this**: `test_reminder_rollover_days_frontend.js`'s original
  assertions checked `rolldaysField.style.display !== "none"`, which
  reads the INLINE style attribute only (not the actual CSS-cascaded
  value) - an empty string is technically "not none" by that check even
  though the real rendered element was still hidden via the stylesheet.
  Strengthened both assertions to `=== "block"` (the actual fixed value)
  specifically so this class of bug (a JS toggle that's a no-op against a
  hidden-by-default CSS class) can't silently regress again. No backend
  changes - this was frontend-only, existing `<!--rolldays:...-->` marker
  read/write logic itself was already correct and tested.

- **v186 (1.132.16)**: two independent household asks handled in the same
  session:
  (1) verbatim "Chores due x amount time before due on recurring chores.
  This will set the due date based on when the chore is recurred instead of
  when the chore was created." Before this, `chore_engine.
  reset_recurring_chore` (the single reset point for every recurring
  chore - both plain-schedule via `sweep_due_recurrences` AND sensor-
  triggered via `auto_create_trigger`) never touched `due_date` at all, so
  it stayed frozen at whatever it was set to at creation/last edit no
  matter how many times the chore cycled open->approved->open. New field
  `CHORE_KEY_RECUR_DUE_OFFSET_MINUTES` (`recur_due_offset_minutes`,
  default 0 - "due the moment it reopens," a real behavior change from
  "keep the stale due_date") plus `_normalize_recur_due_offset_minutes`
  (same "opt-in numeric field, blank/negative/invalid collapses to the
  harmless default" style as `_normalize_recur_month_nth`). `reset_
  recurring_chore` now ALWAYS recomputes `due_date = dt_util.utcnow() +
  timedelta(minutes=offset)` on every reset, replacing whatever was there
  before. Wired through `default_chore`/`create_chore`/`update_chore`/
  `_EDITABLE_FIELDS` exactly like `recur_month_nth` was in v185, plus the
  `chores_websocket_api.py` create/update schemas
  (`vol.Optional(CHORE_KEY_RECUR_DUE_OFFSET_MINUTES): vol.Any(int, None)`).
  Frontend (`family-hub-chores-card.js`): new module-level
  `RECUR_DUE_OFFSET_OPTIONS` (immediately/1h/3h/6h/12h/1d/2d/3d/1wk, minute
  counts under the hood) and a `.f-recur-due-offset-field`/`.f-recur-due-
  offset` `<select>` appended to `_recurFieldsHtml`, shown/hidden in
  `_wireRecurFields` based on whether ANY recur_type is selected (not tied
  to one specific schedule type), and read in `_applyRecurFieldsToPayload`
  (always sends 0 when the chore isn't recurring, matching how
  `recur_month_nth` is always explicitly cleared too). Tests:
  `test_chore_recur_due_offset.py` (10 cases - normalize, default/create/
  update round-trip, `reset_recurring_chore` actually replacing a
  deliberately-stale original due_date for both the zero and nonzero
  offset case, the no-op-when-not-approved case, and the `sweep_due_
  recurrences` integration path) and `test_chore_recur_due_offset_
  frontend.js` (5 cases - field show/hide tied to recur_type, default
  value + preset list, payload for a nonzero offset, payload forcing 0 for
  a non-recurring chore, Edit-modal pre-fill).
  (2) verbatim "Routines should be able to be triggers for automations."
  Chores already fired `CHORE_EVENT_TYPE` on every status change (see
  v110/1.77.0 below); Routines (`routine_engine.py`'s per-person daily
  checklists) fired nothing onto `hass.bus` at all. `routine_engine.py`
  deliberately stays hass-free (its own module docstring) - unlike chores,
  which fire from inside `chore_engine.py` itself, the new firing lives in
  `chores_websocket_api.py` (`_fire_routine_event`, mirroring `chore_
  engine._fire_chore_event`'s "always fire, a misbehaving listener never
  breaks the actual action" shape), the one place `hass` is already on
  hand right after a routine websocket action saves. New event type
  `ROUTINE_EVENT_TYPE = "family_hub_routine_event"` in const.py, with
  THREE event shapes told apart by `event_data["event"]`: `"item_toggled"`
  (every checkbox flip, done True or False - fired from `ws_toggle_
  routine_item`), `"item_approved"` (a star-earning item's `approve_item`
  payout - fired from `ws_approve_routine_item`), and `"routine_completed"`
  (fired once, the moment the LAST item due TODAY in a given
  user_id+category flips to done - the actually-useful "when Mom's Morning
  Routine is done" trigger, not a per-item one). Two new pure helpers in
  `routine_engine.py`: `is_item_due_today(item, today_weekday=None)`
  (mirrors the card's own `_routineItemsFor` day-of-week filter exactly -
  empty/missing `days_of_week` means every day) and `is_routine_complete
  (routines, user_id, category, today_weekday=None)` (True only once every
  due-today item for that user+category is done; a user/category with
  NOTHING due today returns False, not vacuously True - never fires a
  completion event for an empty routine). `ws_toggle_routine_item` captures
  the item's `done` state BEFORE calling `toggle_item` so it can tell a
  genuine "this toggle just completed the whole routine" transition from
  toggling an already-complete routine's item off and back on (which must
  never re-fire `routine_completed`). Tests: `test_routine_automation_
  triggers.py` (12 cases - `is_item_due_today`/`is_routine_complete` in
  isolation, `_fire_routine_event`'s payload shape for both call
  shapes plus its own "never raises even if the bus misbehaves"
  guarantee, and full integration through `ws_toggle_routine_item`/`ws_
  approve_routine_item` with a real `FakeHass`/`FakeConnection`/`FakeConfig
  Entries` harness resolving through `_entry_data_or_error` exactly like
  production code does).

- **v185 (1.132.15)**: two independent scheduling asks from the same
  session, both frontend-plus-backend:
  (1) verbatim "Better roll over to next day for reminders that allows you
  to select what days you want it to apply to. Maybe you only want
  something to remind on friday saturday sunday, or mondays, etc." A
  standalone reminder's existing "roll over if not completed" opt-in
  (`<!--rollover:1-->`, appended to the to-do item's own description) gains
  a SECOND, optional marker - `<!--rolldays:0,4,5,6-->` (0=Monday..
  6=Sunday) - written only when the household actually restricted it to a
  genuine subset of the week (a full or empty selection omits the marker
  entirely, so it reads identically to a pre-v185 reminder). New const.py
  pattern `REMINDER_ROLLOVER_DAYS_MARKER_PATTERN`/`REMINDER_ROLLOVER_DAYS_RE`.
  New `_next_allowed_rollover_date(today_local_date, allowed_weekdays)` in
  `__init__.py` - empty set returns today unchanged (the exact old
  behavior); otherwise scans forward up to 7 days (today counts if its own
  weekday is allowed) for the nearest allowed day. `_roll_reminder_to_today`
  gained an `allowed_rollover_weekdays` parameter threading that through
  instead of always hard-coding "today." The poll loop
  (`_poll_one_reminders_todo_list`) now parses both markers off each
  item's description before deciding whether/where to roll it. Frontend
  (`family-week-calendar-card.js`): new `REMINDER_WEEKDAY_LABELS` (0=Mon..
  6=Sun, matching the Chores card's own convention) and a `.rolldays-btn`/
  `.rolldays-btn-row` toggle-button set (own CSS, same visual language as
  the Chores card's `.weekday-btn` - no shared module between the two card
  files, so it's an independent copy of the look) via new
  `_rolldaysBtnsHtml`/`_wireRolldaysToggle`/`_readRolldaysFromContainer`
  helpers. `_parseReminderRollover`/`_buildReminderDescription` both
  extended to read/write the new marker alongside the existing one. Wired
  into BOTH places a reminder's rollover can be set: the Add Reminder tab
  (`.add-event-reminder-rolldays-field`, shown/hidden by the rollover
  checkbox, defaults to every day pre-selected on a fresh open) and the
  Event Info popup's edit-reminder section (`.event-info-reminder-
  rolldays-field`, pre-filled from the reminder's own existing
  `rolloverDays`, rebuilt fresh each open same as the rest of that
  section). `family-today-card.js`'s own (display-only) `_parseReminder
  Rollover` updated to also strip the new marker out of what it shows,
  so the raw marker text never leaks into a displayed reminder description
  there. New `test_reminder_rollover_days.py` (8 tests: the date-picking
  helper directly, `_roll_reminder_to_today`'s own backward-compatible-vs-
  restricted behavior, and a full integration test through
  `_poll_one_reminders_todo_list` proving the marker-parsing wiring in the
  real poll loop, not just the helpers in isolation) and new
  `test_reminder_rollover_days_frontend.js` (marker parse/build round-
  trip including the "full or empty selection omits the marker" rule, the
  toggle-button helpers, and both UI entry points' show/hide + submitted
  payload).
  (2) verbatim "Better chore scheduling so you can choose things like
  every third Wednesday or the first weekend of every month. Very similar
  to how Google calendar does it now." A THIRD chore `recur_type`
  (`CHORE_RECUR_TYPE_MONTHLY_NTH`, "monthly_nth") alongside the pre-
  existing "interval" (every N days) and "weekdays" (specific weekdays,
  every week). Reuses the existing `recur_weekdays` field (now allowed to
  hold MORE than one weekday) plus a new `recur_month_nth` field (1-4 for
  "the Nth," -1 for "the last," matching Google Calendar's own "Monthly on
  the ..." wording - always resolvable since every weekday occurs at least
  4 times in any month, so nth 1-4 never has to skip a month). "The first
  weekend" is expressed as weekdays={Sat, Sun}, nth=1 - a plain date-by-
  date scan of the month naturally lands on the earliest Saturday (or, on
  the rare month that starts on a Sunday, that Sunday itself), so no
  dedicated "weekend" concept was needed. New `chore_engine.py` helpers:
  `_normalize_recur_month_nth` (opt-in numeric field, same "blank on
  anything unrecognized" pattern as every other one in this module) and
  `_nth_weekday_of_month(year, month, weekdays, nth)` (the actual date
  math). `_compute_next_recur_due` gained a `monthly_nth` branch that scans
  forward month-by-month (capped at 24) for the first candidate strictly
  after `from_dt`, same invariant the pre-existing "weekdays" branch
  already guarantees. `default_chore`/`create_chore`/`update_chore` (an
  explicit `if CHORE_KEY_RECUR_MONTH_NTH in fields:` block - this
  project's `_EDITABLE_FIELDS` tuple is vestigial, see the v184 entry
  below for why that matters) and both `chores_websocket_api.py` schemas
  all extended to carry it through. Frontend (`family-hub-chores-card.js`):
  `_recurFieldsHtml` gained a third "A specific week each month" option
  with its own nth `<select>` (1st/2nd/3rd/4th/Last) and its OWN weekday-
  toggle row (`.f-recur-monthly-weekday` - a distinct class from the
  plain-weekdays schedule's own toggles, since both rows exist in the DOM
  at once and only one is ever visible - picking days in one must never
  bleed into the other), plus a one-tap "First weekend of the month"
  shortcut button that sets nth=1st and toggles Sat+Sun. New
  `_recurMonthlyNthLabel` renders the friendly recurrence-summary text
  ("The 3rd Wed", or the special-cased "The 1st weekend" for the Sat+Sun
  selection) used by the existing `_recurDescriptionHtml`. New backend
  test file `test_chore_monthly_nth_recurrence.py` (17 tests: the date-
  math helper against known reference months including a month that
  starts on a Sunday, the normalizer, `_compute_next_recur_due`'s this-
  month-vs-rolls-to-next-month behavior, create/update round-trip, and a
  full `approve_chore` integration test) and new
  `test_chore_monthly_nth_frontend.js` (the new option's show/hide, the
  3rd-Wednesday and first-weekend payloads, proof the two weekday-toggle
  rows never cross-contaminate, and the Edit modal's pre-fill + friendly
  label). Full JS + Python suites green throughout both features.
- **v184 (1.132.14)**: three Chores features from one household message,
  verbatim: "1. Ability to Mark Chores Important. Chore will have a red !
  denoting importance, they always go to the top of the list. 2. Ability to
  Assign chores to multiple people. Each person is rewarded individually.
  Chore can be marked completed for each person individually 3. Build a
  Routine Library - a common library of routines that people can pick from
  to build out their day. Brush teeth, make bed, etc etc etc." All three
  ship together.
  (1) Important: new `important` chore field (const.py's
  `CHORE_KEY_IMPORTANT`, `chore_engine.default_chore()`/`create_chore()`/
  `update_chore()`), editable both at create and after the fact - NOTE the
  codebase's `_EDITABLE_FIELDS` tuple in chore_engine.py is vestigial
  (only referenced in a docstring, never iterated); `update_chore` actually
  needs an explicit `if CHORE_KEY_IMPORTANT in fields:` block, caught by a
  failing test when only the tuple was touched at first.
  `_sortChoresForColumn` (family-hub-chores-card.js) sorts important chores
  first, before due-date/created-at; `_choreCardHtml` renders a red "!"
  badge (`.chore-important-badge`) plus a `.chore-important` class (red
  left border). Both the create and edit modals gained an "Important"
  checkbox (`.f-important`).
  (2) Multi-assign: explicitly asked the household via AskUserQuestion how
  a multi-assigned chore should show on the board - "Separate chore per
  person" (fan-out into independent chores reusing the existing single-
  assignee state machine unchanged) was the confirmed choice over "one
  shared chore tracked per-person." `new_group_id()` (chore_engine.py,
  `grp_<12 hex>`) and a new `group_id` chore field (`CHORE_KEY_GROUP_ID`,
  None for an ordinary chore - "a group of one isn't a group") tag which
  fanned-out chores came from the same request, purely for bookkeeping;
  board rendering needed zero changes since each fanned-out chore is just
  an ordinary chore with its own `assigned_to`. `ws_create_chore`
  (chores_websocket_api.py) accepts an optional `assigned_to_list`; 2+
  unique entries triggers the fan-out loop (one `chore_engine.create_chore`
  call per assignee, shared `group_id`, rollback of every chore this same
  request already created if one assignee's create fails) and replies
  `{chores: [...]}` instead of the usual `{chore: {...}}`; a single-entry
  list behaves exactly like plain `assigned_to`. Frontend: create modal
  gained an "Assign to multiple people" checkbox (`.f-multi-assign`, Direct
  mode only) that swaps the single `.f-assigned` select for a
  `.f-assigned-multi-list` of per-member checkboxes; `syncModeFields` also
  resets/hides this state when the assignment mode changes away from
  Direct; `_submitCreate` sends `assigned_to_list` instead of `assigned_to`
  when it's on (blocked client-side with a form error if nothing's
  checked) and accepts either `{chore}` or `{chores}` back. Multi-assign is
  deliberately NOT offered in the Edit modal - assignment is fixed once a
  chore exists; reassignment is drag-and-drop, same as before.
  (3) Routine Library: new `family_hub/routine_library.py`, same static-
  reference-list pattern as the existing `grocery_reference.py` - a
  `_LIBRARY_ROWS` list of `(title, category, icon)` tuples across
  morning/afternoon/night (includes the household's own named examples,
  "Brush teeth" and "Make bed"), exposed read-only via a new
  `family_hub/routines/library` websocket command
  (`ws_list_routine_library`, no permission gate - same as
  `ws_list_routines`/`ws_list_chores`, it's just a menu of suggestions).
  Purely a UI convenience pre-filling the EXISTING routine-item create
  form - nothing about a routine item's own schema changed. Frontend: the
  FAB modal's Routine tab gained a "Pick from library…" `<select>`
  (`.rm-library-pick`, grouped into `<optgroup>`s by category), populated
  lazily the first time the Routine tab is opened (same lazy-fetch-on-
  first-open pattern the Goal tab's reward-item picker already used) via
  new `_populateRoutineLibraryPicker`; picking an entry just fills
  `.rm-add-title` and resets itself back to the placeholder.
  New backend test file `test_chore_important_multiassign_library.py` (10
  tests: important defaulting/create/update, `new_group_id()` distinctness,
  the fan-out logic directly against `chore_engine.create_chore`/
  `complete_chore` - each fanned-out chore stays fully independent after
  creation - and `routine_library.get_routine_library()`'s shape/category
  coverage/named-example presence). New frontend test file
  `test_chores_important_multiassign_library_frontend.js` (important
  checkbox on both modals + board sort/badge, multi-assign field
  show/hide + mode-change reset + payload shape + empty-selection
  validation + `{chores}` response handling, and the library picker's
  fetch-on-open/optgroup grouping/fill-and-reset behavior). Full JS + Python
  suites green.
- **v183 (1.132.13)**: two unrelated household asks handled in the same
  session, both frontend-plus-backend:
  (1) verbatim "If a day is highlighted in month view and you click add
  calendar or add reminder it should default to the selected day." The
  only "highlighted/selected" day concept Month view has is the split
  variant's `_monthSplitSelectedDate` (classic Month view has no
  persistent selection at all - clicking a day jumps straight into that
  week instead). New `_addEventDefaultDate()` returns that selected date
  (parsed as a local midnight Date) when `_viewMode === "split"` and a
  selection exists; falls back to `new Date()` (today) for every other
  case - Week view, classic Month view, or split Month with nothing
  selected yet - unchanged from before this existed. `_openAddEvent` now
  seeds both `.add-event-date` and `.add-event-reminder-date` from this
  instead of always from `now`; the time-of-day fields (next-hour
  start/end) still come from the real current time regardless of which
  day was selected - only the DATE changes, not a guessed time.
  (2) verbatim "There needs to be a checkbox next to the calendar badges
  that clicking makes the event showing the badge and event not showing
  the badge become hidden in daily digest." Badges
  (`{text, match, hideMatch}`) had always been a purely frontend/display
  concern - `match` shows a badge chip next to a matching event on the
  calendar grid, `hideMatch` hides the event (and badge) from the grid
  entirely - but the Daily Digest is built entirely server-side from raw
  `calendar.get_events` calls with zero badge awareness, so neither kind
  of event was ever excluded from it. Added a 4th field, `digestHide`
  (default false - existing badges never suddenly start hiding events on
  upgrade), plumbed through every existing badge read/write site on the
  frontend (`_normalizeBadges`, `_normalizeUserProfiles`'s badges mapping,
  both badge-add push sites, the final `_saveSettings` people[].badges
  serializer) and a NEW checkbox (`.person-badge-digest-hide`, "Hide from
  digest") added to both existing badge-row editors (`_renderPeopleSettings`'s
  Calendars-tab editor and `_renderNotifyProfileBadges`'s Users-tab
  profile editor - they share the same `.person-badge-row` markup/CSS, so
  one new CSS block covers both), with `_syncPeopleDraftFromDom`/
  `_syncNotifyProfileBadgesFromDom` both reading the checkbox back into
  their respective drafts. Backend: this is the FIRST time the backend has
  ever needed to actually read badges for anything besides pass-through
  storage, so `_get_user_profiles`'s existing inline badge normalization
  was extracted into a new shared `_normalize_badges(raw)` helper (also
  used by the new code below), and a new `_effective_badges_by_entity(settings)`
  mirrors the card's own `_primaryCalendarBadgesByEntity` override rule
  (a people[] row's own badges, overridden by whichever profile has that
  row's entity as `primaryCalendar` AND has at least one badge of its own
  - an empty profile badges list never blanks out badges already set the
  old way). `_build_daily_digest_message` gained a new
  `badges_by_entity` param (None-safe - an old/unwired caller just skips
  filtering, same as before); inside the "Today's events" loop, an event
  is now dropped when ANY of that calendar's effective badges has
  `digestHide=True` AND either its `match` or its `hideMatch` text is
  found in the event's summary - checked BEFORE the existing
  `seen_events` dedupe guard so a hidden event can't spuriously suppress
  a different real event sharing the same (summary, start, end). Both
  call sites (`_ws_send_daily_digest_now` and the scheduled-digest poller
  in `_maybe_send_daily_digest`) now compute `_effective_badges_by_entity(settings)`
  once and pass it through. New `test_digest_hide_badges.py` (new file -
  11 tests: `_normalize_badges` bool coercion/defaults/malformed-entry
  handling, `_effective_badges_by_entity`'s people-row-vs-profile-override
  rules, and `_build_daily_digest_message`'s actual match/hideMatch
  filtering, the off-by-default/no-effect-on-other-calendars guardrails,
  and the badges_by_entity=None backward-compat case). Extended
  `test_month_view.js` (Part 4: `_addEventDefaultDate`/`_openAddEvent`
  across week/split-no-selection/split-with-selection) and
  `test_user_calendar_settings.js` (both badge editors' new checkbox,
  plus two pre-existing exact-JSON-equality assertions on `_get_user_profiles`/
  `_normalizeUserProfiles` badges output updated to include the new
  `digestHide: false` field they now carry - not a regression, just an
  expected-value update since those two funnel through the changed
  normalizer). Full JS + the two relevant Python files green
  (`test_daily_digest.py` unaffected/still green since it never passes
  `badges_by_entity`; `test_user_profile_calendar_settings.py`'s two
  exact-badges-equality assertions updated the same way as the JS ones,
  for the same reason).
- **v182 (1.132.12)**: three related Month-view asks from the household,
  sent in quick succession, all landing in the shared cell-building
  function `_buildMonthCellsHtml` (`family-week-calendar-card.js`) - used
  by BOTH the classic Month view and the "split" Month variant's own
  calendar pane, so all three fixes apply to both automatically:
  (1) verbatim "In Month calendar view, all day events should be at the
  top" - `dayEvents` (both real calendar events and reminders) now carry
  `allDay`/`start`/`end` and get the exact same stable sort idiom already
  used by `_buildMonthSplitDetailHtml`'s day-agenda list and the Week
  view's `_buildDayColumnHtml`: `dayEvents.sort((a, b) => (a.allDay ===
  b.allDay ? a.start - b.start : a.allDay ? -1 : 1))` - all-day first, then
  timed events/reminders by start time within each group.
  (2) verbatim "Events that carry over should span the gap between days in
  month calendar vie[w]" - a multi-day event's pill now gets
  `.mc-continue-prev`/`.mc-continue-next` (computed per cell as `e.start <
  dayStart` / `e.end > dayEnd`) on the day(s) it carries over through: the
  rounded corner on the continuing side is squared off and the pill is
  pulled flush against that edge (negative margin cancels the cell's own
  4px padding), plus a small chevron (◂/▸) pointing the direction it
  continues - so a run of same-colored pills across consecutive days reads
  as one flowing event. Deliberately NOT a literal seamless bar painted
  across the cell border/gap - each day is still its own independently
  bordered/shadowed `.month-cell` card (background, border-radius,
  box-shadow, `overflow:hidden`), and making a bar actually bridge that
  would need a real layout rewrite (an absolutely-positioned overlay grid
  measured post-render, replacing the current per-cell-card visual design
  entirely) - flagged as a known, deliberate scope boundary if the
  household wants the literal Google-Calendar-style bar later. Reminders
  are excluded from continuation styling (a reminder is a single point in
  time, never multi-day, even if `due` lands near midnight).
  (3) verbatim "If grey out past events is checked we should do that in
  month view too" - copied `_buildDayColumnHtml`'s `isPastEvent` logic
  (today's events grey out one at a time as each ends; an earlier day
  greys out entirely, since the whole day's already over; a future day is
  never greyed) into `_buildMonthCellsHtml` as its own closure (not
  shared/extracted - it closes over that function's own per-cell
  `dayStart`/`dayEnd`/`today`/`isBeforeToday`, same "not worth a shared
  helper for a 4-line closure" call as elsewhere in this file), adding a
  `.past` class to `.mc-pill` (CSS: extended the existing `.event.past,
  .tl-event.past, .all-day-chip.past { opacity: 0.45; }` rule to include
  `.mc-pill.past` rather than duplicating the opacity value). New
  `test_month_view.js` (new file - no prior test in this project touched
  Month view's cell-building logic or set `_events`/`_settingsCache`
  directly on a real card instance for it at all) covering all three:
  all-day-before-timed ordering, a 2-day event's continuation classes on
  its first vs. last day vs. an ordinary same-day event never getting
  either class, and greyOutPastEvents off/on (today past/future,
  yesterday entirely, tomorrow never) - the grey-out assertions that
  depend on the real current hour are guarded to skip near
  midnight/early-morning, matching the real-clock-dependent-test guard
  style already used elsewhere in this project rather than risk a flaky
  5:30am/8:30pm failure. Full JS suite green (including the new file).
- **v181 (1.132.11)**: household report, verbatim: "The version 1.132.9 for
  this integration can not be used with HACS." This is the exact
  previously-flagged-but-never-confirmed-fixed issue from the "HACS /
  GitHub distribution" section above - re-checked the household's live
  repo (`github.com/JVarhol/HA-Family-Hub`) directly via its GitHub API/
  raw-file endpoints and confirmed it's STILL present: the root-level
  file HACS requires as exactly `hacs.json` is actually committed on
  their `main` branch as `HACS~1.JSO` (and `.gitignore` as `GITIGN~1`) -
  classic Windows 8.3 short-filename mangling, almost certainly from
  extracting a release zip via Windows Explorer into a long/deep folder
  path before committing. HACS's manifest lookup is exact-filename
  (`hacs.json`, lowercase, no variants), so it silently can't find any
  manifest at all on that repo right now, which is sufficient on its own
  to explain a real, tagged version being rejected as "can not be used
  with HACS" - `custom_components/family_hub/` itself was NOT mangled
  (confirmed via the repo's file-listing page), so this is isolated to
  the two loose root files, not the integration's own code. Separately,
  while investigating, found this project's OWN checked-in `hacs.json`
  (`/hacs.json` at repo root here, used as the packaging pipeline's
  source for every release zip's embedded copy) had gone stale: it still
  had the content from back when this project was a single Lovelace card
  (`{"name": "Family Week Calendar Card", "filename":
  "family-week-calendar-card.js", "content_in_root": true}`) rather than
  an integration manifest - `filename`/`content_in_root` are documented
  (hacs.xyz) as only applying to single-file item types (plugin/theme/
  template/python_scripts/zip_release), not to a normal
  `custom_components/<domain>/`-layout integration, and would have
  actively confused HACS's repository-type detection even once the
  filename itself is fixed. This means every release zip built by this
  project's packaging pipeline (back to whenever this stale copy was
  first introduced) has been shipping the wrong-shaped `hacs.json`.
  Fixed both: replaced the local `hacs.json` with a proper integration
  manifest (`{"name": "Family Hub", "render_readme": true,
  "homeassistant": "2024.1.0"}`), fixed the same stale copy cached at
  `/tmp/repo_prev/hacs.json` (the packaging pipeline's LICENSE/.gitignore/
  hacs.json source for the repo-zip build), and added the also-missing
  `issue_tracker` key to `family_hub/manifest.json` (hacs.xyz lists
  `domain`/`documentation`/`issue_tracker`/`codeowners`/`name`/`version`
  as the required keys for an integration's manifest.json - this repo's
  had every one except `issue_tracker`). Repackaged and delivered both
  zips. **This does NOT fix the household's actual GitHub repo** - I have
  no push access to it. The household must, on their end: (1) in the
  GitHub repo, delete/rename `HACS~1.JSO` → `hacs.json` and `GITIGN~1` →
  `.gitignore` at the repo root (or just push a fresh copy of this
  session's corrected `family-hub-repo-v1.132.11.zip` contents on top),
  and (2) going forward, avoid extracting/staging a release zip through
  Windows Explorer into a long/deeply-nested folder path before
  committing - that's what triggers the 8.3 short-name substitution;
  extracting near a drive root (e.g. `C:\dev\family-hub`) and committing
  from there with command-line git avoids it. Updated the "Known pending
  / open items" note below accordingly - do not re-diagnose this from
  scratch if it comes up again; check whether the household has actually
  pushed the fix yet first.
- **v180 (1.132.10)**: household report, verbatim: "the see claim status
  permission is not persistent on updates." Genuinely ambiguous on its
  face - "claim status" could mean the `can_see_wishlist_claims`
  permission checkbox itself, or an actual wish-list item's own claimed-by
  state - so asked a clarifying question via AskUserQuestion before
  digging further; household confirmed it's the permission checkbox
  (Settings > a person's own Notification Profile > Permissions
  accordion's "See claim status" row). Extensive static-analysis pass
  through `_maybe_migrate_wishlist_claims_permission_default` (the v1.132.5
  one-time grandfathering migration - see its own docstring and
  `test_wishlist_claims_permission_migration.py`) turned up nothing wrong
  with the migration's OWN guard logic (it's correctly gated on its own
  dedicated flag, `wishlistClaimsPermissionMigrated`, and that flag is
  written to the SAME settings_store both in-memory and via
  `_backup_settings` every time it runs) - the bug was one level removed,
  in `_ws_set_settings` (`family_hub/set_settings`, the handler behind
  every ordinary Settings-modal save). That handler's own docstring
  already documents this EXACT bug class happening twice before: once for
  `SETTINGS_KEY_NOTIFY_PROFILES_MIGRATED` and once for kiosk PIN
  `pinHash`/`pinSalt` - a backend-only bookkeeping value that the card's
  JS has no reason to read back, so it's never part of `settingsObj` in
  `_saveSettings`, so `_ws_set_settings`'s "full REPLACE, not a merge"
  contract silently drops it from the store on literally any unrelated
  Settings save (changing a color, a notify target, anything). Confirmed
  by grepping every frontend card file for `wishlistClaimsPermissionMigrated`
  - zero matches, exactly like `notifyProfilesMigrated` before its own fix,
  and unlike `memberUserIds`/`routinesEnabled`/`goalsShowInChores`/
  `goalsShowInRewards` (all four genuinely present in `settingsObj`, so
  none of those round-trip-strip). With the flag stripped, the NEXT full
  Home Assistant restart - "most noticeable right after updating, since
  that's when people usually restart Home Assistant," per that same
  existing docstring - sees `wishlistClaimsPermissionMigrated` as falsy
  again, so `_maybe_migrate_wishlist_claims_permission_default` reruns and
  unconditionally re-grants `can_see_wishlist_claims: True` to every
  current household member, silently reverting any explicit `False` an
  admin had set for someone in between. Fixed the identical way the other
  two carry-forwards already were, inside `_ws_set_settings`'s existing
  `if needs_existing:` block: added `SETTINGS_KEY_WISHLIST_CLAIMS_
  PERMISSION_MIGRATED not in new_settings` to the `needs_existing` OR-chain
  (so `existing` always actually gets loaded when this flag needs
  checking, not relying on it happening to already be true for unrelated
  reasons), then `if ... not in new_settings and existing.get(...): new_
  settings[...] = True` - only ever carries forward an EXISTING True,
  never fabricates one, and never overrides a value the caller actually
  sent (matches the notify-profiles-migrated carry-forward's own shape
  exactly). Three new regression tests added to `test_user_profile_
  calendar_settings.py` (reusing that file's existing `FakeHass`/
  `FakeConnection`/`FakeStore` end-to-end `_ws_set_settings` harness from
  the wishlist-entity-flagging tests right above them): the flag survives
  an ordinary unrelated save that omits it entirely; it's never conjured
  out of thin air on a household that's genuinely never had it set; and an
  explicitly-sent value (hypothetical future caller) still wins over the
  carried-forward existing one. This is the first automated test coverage
  for `_ws_set_settings`'s carry-forward behavior at all - the
  `notifyProfilesMigrated`/pinHash carry-forwards this fix mirrors have
  never had their own regression tests either, which is presumably how a
  second instance of the identical bug class shipped in the first place;
  worth eventually adding equivalent coverage for those two as well, not
  attempted here since they weren't reported as broken. Full regression
  suite (34 JS + 8 Python files, now 39 in this one file) re-run clean;
  `python3 -m py_compile __init__.py` re-verified.
- **v179 (1.132.9)**: household report, verbatim: "when logged in as
  elevated user on todo lists I cant assign a star value to items on the
  kiosk." Traced to `chores_websocket_api.py`'s `ws_add_catalog_item` (the
  handler behind BOTH `family-hub-todo-card.js`'s `_openTieRewardModal`
  "Add star value" tie button and `family-hub-rewards-card.js`'s own "+"
  button, when the person opening it `canPrice` a reward directly rather
  than only suggesting one) never having been made kiosk-elevation-aware
  in the first place. Every sibling reward handler that needed it already
  was - `ws_approve_suggestion`/`ws_reject_suggestion`/`ws_redeem_reward`
  all accept an optional `elevation_token`, resolve `(user_id, is_admin)`
  via `_effective_actor`, and check permissions against THAT via
  `_has_permission_ctx`/`_can_add_rewards_ctx` - `ws_add_catalog_item` alone
  still called the plain, connection-only `_can_add_rewards(entry_data,
  connection)`, which on a shared kiosk display always resolves to the
  kiosk's own generic Home Assistant login, never whichever household
  member had actually PIN-elevated. The card-side symptom was confusing
  precisely because the UI gating (`_hasPermission("can_add_rewards")` in
  `_wishlistItemHtml`, and the todo/rewards cards' own `_kioskElevation`-
  aware `_hasPermission`) DOES correctly read the elevated user's own
  permissions and shows the button - so the failure only ever showed up on
  the actual save, as a silent-looking "Couldn't save - forbidden" in the
  tie modal (or the rewards card's own create-modal), not as a missing
  button, which is presumably why it read as "I can't assign a star value"
  rather than "I don't see the option." `_can_add_rewards_ctx` (the
  elevation-aware twin of `_can_add_rewards`) already existed in this file
  - it's what `ws_approve_suggestion`/`ws_reject_suggestion` already use -
  so the backend fix was purely wiring `ws_add_catalog_item` up to the same
  pattern already established two functions away: added `vol.Optional(
  "elevation_token"): str` to its schema, and swapped its body to `actor_id,
  is_admin = await _effective_actor(hass, connection, entry_data, msg)`
  then `_can_add_rewards_ctx(entry_data, actor_id, is_admin)`. On the
  frontend, wrapped both call sites' payloads in `_kioskMsg(...)` (already
  the established pattern for every other kiosk-aware call in both cards -
  it's a no-op object passthrough when there's no active kiosk elevation,
  so ordinary non-kiosk saves are byte-for-byte unaffected): `family-hub-
  todo-card.js`'s `_openTieRewardModal` and `family-hub-rewards-card.js`'s
  create-reward modal's `canPrice` branch (its sibling `existingItem`
  branch, `update_catalog_item`, has the IDENTICAL gap - so does `ws_mark_
  fulfilled`/`ws_mark_bank_usage_fulfilled`, both still on the bare `_can_
  add_rewards(entry_data, connection)` - but none of those were reported
  and are out of scope for this fix; worth returning to since they're the
  same latent bug shape). New regression coverage added to `test_wishlist_
  reward_tie.js`: kiosk-logs-in as a non-admin household member whose
  server-side elevation carries `can_add_rewards: true`, confirms the tie
  button appears only after login (not for the shared kiosk login itself,
  which has no permissions), and confirms the resulting `add_catalog_item`
  call's `elevation_token` matches the login's own token - this is a
  frontend-only assertion (the JS test harness mocks `add_catalog_item`
  unconditionally succeeding, it doesn't re-implement the Python
  permission check), so it verifies the fix's frontend half; there is no
  Python test file in this project's tracked set that exercises `chores_
  websocket_api.py`'s reward handlers at all (confirmed via grep), so the
  backend half's correctness rests on code inspection plus this being the
  exact same pattern already proven correct by `ws_approve_suggestion`/
  `ws_reject_suggestion` above it in the same file - a gap worth closing
  with real backend test infrastructure at some point, not attempted here.
  Full regression suite (34 JS + 8 Python files) re-run clean; `python3 -m
  py_compile chores_websocket_api.py` also re-verified.
- **v178 (1.132.8)**: household ask, verbatim: "drop todo lists." Asked a
  clarifying question via AskUserQuestion first since "drop todo lists" was
  genuinely ambiguous (remove the wizard step entirely / just trim it down /
  remove the whole To-Do Lists card feature) - household picked "Remove the
  wizard step (Recommended)". Deleted `async_step_todo_lists` ("Meal Plan &
  Reminders lists", step 7, between Grocy and Notifications) from
  `config_flow.py`'s `FamilyHubConfigFlow` wizard entirely, along with
  `_build_todo_lists_schema`, the `_FEATURE_REMINDERS`/`"reminders"` entry
  in `_ALL_FEATURES`/`_FEATURE_LABELS`, the now-dead imports
  (`_create_local_todo_list`, `CONF_AUTO_CREATE_TODO_LISTS`,
  `DEFAULT_MEAL_PLAN_LIST_NAME`, `DEFAULT_REMINDERS_LIST_NAME`), and
  `_REMINDERS_NOTIFY_FIELD` (the Notifications step's reminders-specific
  notify-target picker, which only ever made sense keyed by this step's own
  output). `async_step_grocy`'s two `return await self.async_step_todo_lists()`
  calls now go straight to `async_step_notifications()`. Confirmed safe to
  drop outright, not just trim, by checking what actually reads
  `CONF_MEAL_PLAN_ENTITY`/`CONF_REMINDERS_ENTITY`: the calendar card's own
  `meal_plan_entity`/`reminders_entity` Lovelace config fields are the real
  source of truth (defaulting to `todo.meal_plan`/`todo.family_reminders` if
  never overridden - see the card's YAML options in README.md), and the
  running card already pushes whichever entity it's actually configured
  with into these same backend options every session via
  `_ws_set_reminders_entity`/`_ws_set_daily_digest` in `__init__.py` - so
  this wizard step never did anything the card doesn't already do on its
  own; it only ever saved someone the trouble of accepting the card's
  defaults or setting the field once on the card itself.
  `CONF_MEAL_PLAN_ENTITY`/`CONF_REMINDERS_ENTITY` themselves are untouched
  and still fully live options, kept in `const.py` and still used by
  `_build_dashboard_yaml`, just no longer collected by this wizard. Updated
  `strings.json` (removed the `todo_lists` step block, trimmed
  `notifications`'s description/data down to the one remaining field,
  simplified `finish`'s description placeholders) and re-copied it byte-
  for-byte into `translations/en.json` (confirmed identical via `diff`, as
  always). Module docstring and several step docstrings updated in place
  with a `v1.132.8+:` note explaining the removal and pointing at this
  entry's own reasoning, so a future reader hitting the old step names in
  git blame/history has the "why" right there. Left a dangling comment
  block that used to explain why `_create_local_todo_list` lives in
  `__init__.py` rather than `config_flow.py` removed too, since it only made
  sense next to the now-deleted step. Verified `python3 -m py_compile
  config_flow.py` (syntax OK) and both `strings.json`/`translations/en.json`
  as valid JSON. Python-only change - no JS impact, so no card-side test
  changes; none of the 8 present `test_*.py` files exercise `config_flow.py`
  directly (confirmed via grep), so the existing Python suite re-running
  green is a sanity check rather than direct coverage of this change. Two
  pre-existing stale test files on the household's own computer,
  `test_config_flow.py`/`test_family_hub.py` (already flagged elsewhere in
  this file as testing an even older wizard step order, from before
  `async_step_features` existed, and NOT part of this project's own tracked
  file set), were deliberately left untouched - `device_bash` is currently
  broken (see the Known environment issue note below) so they couldn't be
  patched in place even if in scope, and fixing stale tests unrelated to
  the change being made has been this project's consistent policy in prior
  entries too. This has not been explicitly confirmed with the household;
  worth raising if it becomes relevant.
- **v177 (1.132.7)**: household report, verbatim: "the small display mode
  needs to be device specific. only apply to the device its marked on."
  "Small screen mode" (v1.132.5) had been stored as a plain top-level
  field in the shared household Settings blob (`smallScreenMode`,
  round-tripped through `family_hub/set_settings`/`get_settings` like
  `fabPosition`/`theme`/etc.) - the exact same mechanism every OTHER
  Family Hub device reads, so turning it on on one tablet turned it on
  everywhere. `family-week-calendar-card.js` already had a well-
  established this-device-only pattern for exactly this kind of thing -
  `_getWeekViewVariant`/`_getWeekViewDayCount`/`_getMonthViewVariant`/
  `_getDeviceThemeOverride`, all reading a dedicated `localStorage` key
  rather than the shared blob. Added `_getSmallScreenMode()` following
  that same shape (not the OTHER established variant,
  `_getShowTimeline`'s live fall-through-to-shared-setting-if-never-
  touched-locally pattern - a live fallback would still let one device's
  toggle apply everywhere that hasn't opened Settings yet, which is
  exactly the bug). Hardcoded default `false` for a device that's never
  saved its own value AND never had the old shared field either. For a
  device that HAS an old shared `true` sitting in Settings from before
  this fix (the realistic case, since v1.132.5 shipped last version and
  probably already got turned on somewhere), added a one-time carry-
  forward migration inside the same getter: no local value yet + the
  legacy shared field is true → treat it as true for this one read AND
  immediately persist it to this device's own localStorage key, so it
  only ever happens once and every subsequent read on this device is
  purely local from then on - existing setups don't regress to "top bar
  suddenly reappears" the moment someone updates. One easy-to-miss trap
  while building this: the migration write must NOT fire off of
  `_getSettings()`'s DEFAULTS - `connectedCallback` calls
  `_registerFabCoordinator()` (which calls `_getSmallScreenMode()`)
  unconditionally on connect, which happens synchronously on
  `document.body.appendChild(el)` in tests (and for a real card, before
  `hass`'s first `_initFirstLoad` fetch has resolved) - at that point
  `this._settingsCache` is still `null`, so `_getSettings()` falls back to
  `_defaultSettings()` (`smallScreenMode: false`), and migrating off of
  THAT would permanently lock in "off" as this device's own local value
  before the real household settings ever got a chance to load. Fixed by
  checking `this._settingsCache` directly (not `_getSettings()`) and
  simply returning `false` with nothing written whenever it's still
  `null` - `_registerFabCoordinator` runs again once `_fetchSettings`/
  `_fetchLegacySettings` actually populate the cache, and THAT call does
  the real migration. Removed `smallScreenMode` from the `settingsObj`
  payload built in the Save handler entirely (the actual fix - it must
  never reach `family_hub/set_settings` again) and instead writes it to
  the new localStorage key there, same as `showTimeline`/
  `weekViewVariant`/etc. already do in that same function. Left the field
  itself still readable via `_normalizeSettings` purely so the migration
  above has something to read on a device that hasn't updated yet - never
  written to again, but not deleted from the schema either. Checkbox
  label changed to "Small screen mode — this device only" (matching the
  "— this device only" suffix convention `week-day-count-btn`/
  `month-variant-btn` already use) and the hint text now says explicitly
  it won't affect any other device.

  `test_small_screen_mode.js` needed a full rewrite, not just new cases -
  its old assertions (`savedSettings.smallScreenMode === true`) directly
  tested the exact behavior being removed. New file adds a tiny
  `fakeLocalStorage()` (an in-memory Map-backed stand-in) so two card
  instances in the SAME jsdom `window` can be given genuinely independent
  storage, standing in for two real, never-shared-storage physical
  tablets - without this, every card in one test file looks like the same
  device to jsdom's single real `localStorage`, which would have hidden
  the very bug being fixed. Covers: off by default (fresh device, fresh
  household); the one-time migration carrying an old shared `true`
  forward and persisting it locally; an explicit local `false` never
  getting re-migrated back to `true` even if the shared legacy field still
  says so; Save persisting to localStorage only, with an explicit
  assertion that `smallScreenMode` is NOT a key in the `family_hub/
  set_settings` payload at all; and the actual end-to-end scenario - two
  "devices" sharing one mocked household backend, turning it on via
  Settings on device A, then device B independently re-fetching the same
  shared settings and confirming it stayed off. Each new assertion
  confirmed to actually fail against the pre-fix behavior (re-added
  `smallScreenMode,` to the settingsObj payload; reverted the host-
  attribute check back to reading `_getSettings().smallScreenMode`
  directly) before trusting the fix. Full regression suite (34 JS + 8
  Python files) re-run clean.

- **v176 (1.132.6)**: three requests in one session, bundled into one
  release same as v1.132.5's precedent. Primary ask, verbatim: "Allow
  someone with the permission to add rewards to tie a wish list item to a
  reward. It will become a one time claim item and will show a star value
  to claim on the wish list and in the rewards. When claimed it should be
  removed from both locations." Entirely a `family-hub-todo-card.js`
  frontend feature - zero backend changes needed, since `reward_engine.py`'s
  `redeem_item` already auto-deletes a catalog item on redemption when its
  `redeem_mode` is `"one_time"`; the new "🎁 Add star value" flow
  (`_openTieRewardModal`, gated on the existing `can_add_rewards`
  permission or admin) just creates a catalog entry with that redeem_mode
  and folds its id/cost into the wish-list item's own description (the
  existing `WISHLIST_DATA_MARKER` JSON-tail encoding, extended with
  `rewardItemId`/`rewardCostStars` fields - every `_buildWishlistDescription`
  call site had to be updated to explicitly pass these through or they'd be
  silently dropped on the next save). The reward UI (star badge + Claim
  button) is shown to EVERYONE including the list's own owner, unlike the
  plain gift-claim button, since claiming it spends the claimer's own
  stars on their own listed wish - no surprise to spoil. `_claimWishlistReward`
  redeems (kiosk-elevation-aware, via a new `_kioskMsg` helper ported from
  `family-hub-chores-card.js`) then deletes the wish-list item too -
  "removed from both locations." A self-heal path (`_rewardsCatalogById`,
  refetched every poll tick and after tying) removes a wish-list item
  whose linked reward vanished from the catalog because it was redeemed
  straight from the Rewards card on a different device instead.

  New `test_wishlist_reward_tie.js` took real debugging to get green: its
  mock's `get_items`/`callService` originally returned/mutated live shared
  object references across multiple card instances in the same test file
  (unrealistic - a real HA `get_items` response is a fresh serialized
  snapshot every call), which let one card's tie-save "leak" into another
  already-loaded card's cached items without a real refetch, and then let
  that OTHER card's own (correctly, by design) stale local reward-catalog
  cache falsely self-heal-delete the real, still-shared item during an
  unrelated re-render (triggered by a kiosk logout broadcast). Fixed by
  deep-cloning `get_items` responses and adding real `update_item`
  mutation to the mock, matching actual HA semantics - not a source bug.

  Two smaller reports arrived mid-turn and are folded into this same
  release rather than shipped separately:

  1. Kiosk login/logout cross-screen sync, household report verbatim:
     "there is a weird issue where you login on one screen and logout on
     another the todo login tab doesnt seem to recognize the log out and
     stays indicating a logged in user." Root cause:
     `family-hub-todo-card.js`'s `connectedCallback` only ever re-joined
     `window.__familyHubFabCoordinator` on reconnect, never
     `window.__familyHubKioskSession` - unlike `family-hub-chores-card.js`/
     `family-hub-rewards-card.js`, whose `connectedCallback` calls
     `_registerKioskSession()` too. A Lovelace view switch disconnects then
     reconnects the card element; `disconnectedCallback` already
     unregisters it from the shared session, so after the first such round
     trip it was permanently dropped from `clients` and never heard
     another login/logout broadcast from any other card/screen again. Fix:
     added the missing `_registerKioskSession()` call alongside
     `_registerFabCoordinator()` in `connectedCallback` -
     `registerClient()` is idempotent and immediately re-syncs to the
     CURRENT elevation, so this alone self-corrects any stale state. New
     `test_kiosk_todo_reconnect_sync.js`.
  2. "Put Kiosk pin in an accordian hide this accordian from non admins."
     The Kiosk PIN Login field (each person's own Notification Profile
     modal) previously only admin-gated its "Set / change PIN..." button
     (`display:none` for non-admins) - the enable-login checkbox and hint
     text were visible, and freely toggleable, to anyone. Wrapped the
     whole field in a new `.notify-profile-kiosk-accordion.admin-only-block`
     (same collapsed-by-default `.accordion-toggle`/`.accordion-body`
     pattern, same `isAdminForPin` gate already used for the Permissions
     accordion right below it in the same modal). New
     `test_kiosk_pin_accordion.js`.

  Each new test file confirmed to actually fail against the pre-fix
  behavior before being trusted. Full regression suite (34 JS + 8 Python
  files) re-run clean.

- **v175 (1.132.5)**: follow-up pivot on v1.132.4's kiosk claim-visibility
  work. After shipping the per-card "hide claim status until login"
  toggle, the household asked twice more: first restating the same
  underlying need (confirmed it matched what already shipped), then
  explicitly "it should be a user setting under permissions instead" -
  abandoning the per-card toggle for a per-person Permissions grant. Asked
  a clarifying question on the new permission's default (every OTHER
  permission in `CHORE_PERMISSIONS` correctly defaults to False - nobody
  has it until granted - but this one is the opposite: before it existed,
  every household member could already see claims freely, so a naive
  False-default would silently regress every existing member's own
  device). Answered "on by default for existing members" - grandfather via
  a one-time migration, not a special-cased default in the permission
  lookup itself. Mid-turn, a second related instruction arrived: "lets also
  move permissions for each user to an accordian under their user account.
  keep it as admin only though" - relocating the ENTIRE standalone
  Permissions tab into each person's own Notification Profile modal.
  Two further requests arrived later in the same session and are folded
  into this same version rather than a separate release: a "Small screen
  mode" toggle for the calendar card (hide the top bar, move Settings into
  the + button's menu), and moving the Notification Profile modal's
  Calendar fields into their own accordion (matching Lists/Instant/Daily
  Digest).

  **New permission + migration** (`const.py`/`__init__.py`): added
  `PERMISSION_SEE_WISHLIST_CLAIMS = "can_see_wishlist_claims"` to
  `CHORE_PERMISSIONS` (the generic household permission catalog, despite
  its name). `_maybe_migrate_wishlist_claims_permission_default(hass,
  settings_store, permissions_store, permissions)` runs once in
  `async_setup_entry`, immediately after `_maybe_migrate_member_user_ids`
  (so `settings[SETTINGS_KEY_MEMBER_USER_IDS]` is already finalized) -
  guarded by its OWN flag, `SETTINGS_KEY_WISHLIST_CLAIMS_PERMISSION_
  MIGRATED`, in the main Settings blob (not key-presence in the
  permissions dict, since a permission being False for someone is
  indistinguishable from "never touched" by presence alone, unlike a
  list). It writes `True` unconditionally into every already-existing
  member's permissions entry the first time it runs, then never touches
  it again - an admin's later explicit revoke sticks. Deliberately kept
  entirely OUT of `_has_permission`/`_has_permission_ctx` (no special-case
  default-polarity branch there) to avoid touching those well-tested,
  security-relevant functions at all. `chores_websocket_api.py`'s
  `ws_set_permissions` schema needed `vol.Optional("can_see_wishlist_
  claims"): bool` added by hand (that schema doesn't derive its keys from
  `CHORE_PERMISSIONS` - a save carrying the field would otherwise be
  silently stripped by voluptuous before the handler ever saw it).
  `_has_permission_ctx`/`ws_get_my_permissions`/`ws_kiosk_elevate` all
  already derive their key sets generically from `CHORE_PERMISSIONS`, so
  needed no changes.

  **`family-hub-todo-card.js`**: reverted every v1.132.4 `hide_wishlist_
  claims` frontend bit (the field, `_fetchTodoCardConfig`'s handling, the
  List(s) tab's "Wish Lists" checkbox section, `_saveListsTab`'s payload/
  state) while keeping the unrelated `_myUserId()`-based `ownerUserId` fix
  in `_saveListsTab`. Added `_isAdmin()`/`_myPermissions`/
  `_fetchMyPermissions()`/`_hasPermission(key)`, mirroring `family-hub-
  chores-card.js`'s own copies exactly (admin bypass, kiosk-elevation-
  aware via `this._kioskElevation.permissions`). `_wishlistItemHtml`'s
  claim-gating changed from the reverted `hideClaimsUntilLogin` to
  `this._hasPermission("can_see_wishlist_claims")`; `_toggleWishlistClaim`
  gained a defensive (belt-and-suspenders, the button is never rendered in
  the first place) permission guard.

  **`family-week-calendar-card.js` — Permissions relocation**: the
  standalone `.permissions-tab-btn`/`.permissions-tab-panel` (Settings
  modal) are gone. `_permissionDefs()` gained a `can_see_wishlist_claims`
  entry (Wish Lists group) - this is a SEPARATE hardcoded JS array from
  const.py's `CHORE_PERMISSIONS` and had to be updated by hand.
  `_savePermissionCheck()`/`_fetchPermissionsData()` are unchanged and
  fully reused. `_renderPermissionsList()` (the old whole-grid-of-every-
  member renderer) is replaced by `_renderNotifyProfilePermissions(userId)`
  - renders only the ONE person whose Notification Profile modal is
  currently open, into a new admin-only `.notify-profile-permissions-
  accordion` / `.notify-profile-perm-rows-list` inside that modal (mirrors
  the existing `isAdminForPin`/`.notify-profile-kiosk-set-pin-btn` admin-
  only-visibility pattern, re-checked fresh every time the modal opens).
  `this._notifyProfileOpenUserId` is tracked so a permissions fetch still
  in flight when a profile modal is opened (or opened while Settings
  itself was still fetching) re-renders that accordion once real data
  arrives, rather than leaving a stale "Checking..." placeholder.
  `_fetchPermissionsData()` is still kicked off admin-gated when Settings
  itself opens (prefetching so each person's accordion is ready the moment
  they're tapped into), it just no longer re-renders a whole-grid panel
  that no longer exists.

  **`family-week-calendar-card.js` — Small screen mode**: new
  `settings.smallScreenMode` (boolean, default `false`) follows the exact
  same plumbing as `settings.fabPosition` (default object → normalize →
  save payload). Folded its host-attribute toggle into
  `_registerFabCoordinator()` (already called at every point settings
  load/save/refetch - first load, after Settings save, after re-fetch) -
  sets/removes `[small-screen-mode]` on the host element, which CSS keys
  off of: `:host([small-screen-mode]) .week-nav { display: none; }` hides
  the whole top bar (Settings/Week/Month/Edit Meals/nav arrows/week label/
  Suggestions/Recipe Box/More - all of it, matching the household's literal
  "hide the top bar" ask even though that also hides week navigation), and
  a new `.add-fab-settings` item in the + button's `.add-menu-list` (CSS
  `display: none` by default, `:host([small-screen-mode]) .add-fab-settings
  { display: block; }`) opens Settings via `_openSettings()` - the only
  entry point to Settings once the top bar's own gear icon is hidden.
  General tab gained a plain checkbox (`.small-screen-mode-check`, synced
  on Settings open, read back into the save payload) rather than a
  segmented on/off button row, since it's a single toggle.

  **`family-week-calendar-card.js` — Calendar accordion**: the
  Notification Profile modal's "Calendars" (subscribed-calendars list +
  primary-calendar star) and "Their own calendar" (entity input + badges)
  fields, previously two bare `.field` blocks sitting directly in the
  modal above the Lists accordion, are now wrapped in their own "Calendar"
  accordion (`data-target="notify-profile-calendar-body"`) - purely a
  markup move, no JS/rendering logic changed, since the generic delegated
  `.accordion-toggle` click handler (wired once in `_build()`, v1.132.3)
  picks up any new accordion automatically.

  New/updated test coverage: `test_wishlist_claims_permission_migration.py`
  (grants True to every existing member, preserves unrelated existing
  grants, never touches a non-member, idempotent against a later explicit
  revoke, grandfathers an existing explicit False on first run, safe no-op
  with no memberUserIds yet). `test_todo_card_config_storage.py`'s 4
  `hide_wishlist_claims` tests removed (field no longer exists).
  `test_todo_wishlist.js`'s "hide claims toggle" and "List(s) tab persists
  toggle" blocks replaced with permission-based equivalents (no-permission
  hides claim status/claiming for ANY item regardless of ownership,
  granted-via-kiosk-login restores it, a defensive `_toggleWishlistClaim`
  guard); the kiosk-attribution and owner-recognition-after-login tests
  from v1.132.4 were kept as-is (still valid, unrelated to the pivot); the
  `makeHass` stub gained a `family_hub/permissions/get_mine` handler
  defaulting to granted (`opts.myPermissions` overrides), matching what
  the real one-time migration does for every existing member. New
  `test_notify_profile_permissions.js` (accordion hidden for a non-admin,
  shown+rendered with only the open person's own row for an admin,
  checkbox change saves via `family_hub/permissions/set` with the right
  user_id/key, and a fetch that resolves after a profile modal is already
  open still refreshes that modal's own accordion). New
  `test_small_screen_mode.js` (off by default, `[small-screen-mode]` host
  attribute set from `settings.smallScreenMode`, the General tab checkbox
  reflects/round-trips the setting through a save, and the `.add-fab-
  settings` menu item opens Settings once visible). Every new/changed
  assertion was verified against a deliberately-broken scratch copy first
  (never-grant the migration, ignore the permission in `_wishlistItemHtml`,
  always-show the accordion regardless of admin, never-set the host
  attribute) to confirm each test actually fails before trusting it passes
  clean - same discipline established after the v1.132.0/v1.132.1
  incident. Full existing JS + Python regression suite (all 31 JS files,
  all 8 Python files) re-run clean after every change in this version.

- **v174 (1.132.4)**: household request, verbatim: "need a way to switch to
  other accounts for the wish lists, so people could mark things off on a
  kiosk. Also need a way to not allow kiosk devices to see claimed items on
  wish lists." Asked two clarifying questions before implementing, since
  both asks touch real privacy-sensitive behavior (gift surprises) and
  needed to interact coherently with the EXISTING "hidden from the owner"
  claim-status design rather than accidentally defeating it:
  (1) reuse the exact same Kiosk PIN Login already on Chores/Rewards for
  switching accounts - answered yes (recommended option); (2) how "hide
  claim status" should behave, given the tension that the claim feature
  already hides status from a list's own owner but a shared kiosk can't
  recognize anyone as an owner until they identify themselves - answered
  "hidden until someone logs in" (recommended option), i.e. a per-card
  toggle that hides ALL claim UI while nobody's kiosk-logged-in, and
  restores it normally (including the owner-hiding behavior) once someone
  does.

  Root cause of the underlying gap (why claim status was ever visible to a
  wish list's own owner on a kiosk in the first place, before either
  feature existed): `_isWishlistOwner`/`_toggleWishlistClaim` always read
  `this._hass.user.id`/`.name` directly - on a normal device that's
  whoever's actually signed in, but on a shared kiosk tablet it's always
  the SAME kiosk-wide Home Assistant login, which can never equal any
  specific household member's user id. So `_isWishlistOwner` could never
  fire true on a kiosk (nobody was ever recognized as "the owner"), and
  every claim made from a kiosk was attributed to the kiosk's own account
  instead of whoever actually tapped it.

  Fix, part 1 (kiosk login) - `family_hub/card/family-hub-todo-card.js`:
  ported the `window.__familyHubKioskSession` shared singleton
  byte-identically from `family-hub-chores-card.js`/`family-hub-rewards-
  card.js` (same "independently-loaded Lovelace resources, not ES modules"
  copy-paste convention every other `window.__familyHub*` singleton in
  this codebase already follows) - logging in on ANY of the three cards
  now elevates all three, with no second login. Added the card's own
  `_myUserId()`/`_myName()` (kiosk-elevation-aware; `_myName()` is new,
  since Chores/Rewards only ever needed the elevated user's id, never
  their display name), `_registerKioskSession`/`_onKioskElevationChanged`/
  `_openKioskLoginModal`/`_submitKioskLogin`/`_kioskLogout`/
  `_updateKioskLoginUi` (byte-identical copies of Chores' own), plus the
  header's own &#128274; Login button and kiosk-login modal (same markup/
  CSS classes, so the same shared stylesheet rules apply verbatim).
  `_isWishlistOwner` and `_toggleWishlistClaim` were switched from reading
  `this._hass.user` directly to `_myUserId()`/`_myName()` - once someone
  identifies themselves via the Login button, both now work exactly as
  they already do on a normal (non-kiosk) device: claims are attributed by
  name, and the list's own owner sees zero claim UI once THEY log in.

  Fix, part 2 (hide-until-login toggle) - new per-card-instance boolean,
  `hide_wishlist_claims`, added to the existing `family_hub/
  get_todo_card_config`/`set_todo_card_config` store (`__init__.py`) with
  the exact same merge-on-omit pattern `fit_to_screen` already established
  (a card build/save that doesn't know the field exists never resets it).
  `_wishlistItemHtml` now computes `hideClaimsUntilLogin =
  this._backendHideWishlistClaims && !this._kioskElevation` and suppresses
  claim UI whenever `!isOwner && !hideClaimsUntilLogin` is false for
  either reason - i.e. it's a strict OR with the pre-existing
  owner-hiding, never a replacement for it. A checkbox ("Hide claim status
  on this kiosk until someone logs in") was added to the FAB's List(s) tab
  under a new "Wish Lists" settings section, saved through the same
  `_saveListsTab`/`set_todo_card_config` round trip as every other List(s)
  tab control (draft-until-Save, applied optimistically).

  Tests: extended `test_todo_wishlist.js` with a new kiosk-login block -
  Login button hidden with nobody set up for it (regression-safe default);
  logging in attributes a claim to the real household member, not the
  shared kiosk account; logging in AS the list's own owner correctly hides
  claim status from them (proving `_isWishlistOwner` now reads the
  elevation); the hide-until-login toggle hides claim UI for everyone
  before login and restores it after; and the List(s) tab checkbox
  actually persists `hide_wishlist_claims` through the save round trip.
  Added matching backend tests to `test_todo_card_config_storage.py`
  (get/set round-trip, merge-on-omit preservation, per-card_id isolation)
  mirroring its own existing `fit_to_screen` tests field-for-field.
  Verified two of the new frontend tests actually catch their intended
  regressions (this project's standing discipline since the v1.132.0/
  v1.132.1 incident) by patching a scratch copy of the built JS - once to
  neutralize the hide-until-login gate, once to revert `_toggleWishlistClaim`
  back to reading `this._hass.user` directly - confirming each broke the
  right test with the right message, then confirming both pass clean again
  against the real fix. Full regression suite (28 JS + 10 Python files)
  re-run clean both before and after.

- **v173 (1.132.3)**: household request - "can we clean up the settings
  menu a bit instead of typed out helper notes make them an information
  bubble you can hover over or click. put the instant notifications and
  daily digest into accordions same with lists." Asked two clarifying
  questions before touching anything, given real ambiguity in scope:
  (1) which hint texts should become hover/click info bubbles - answered
  "let's skip this for now," so the hint-text → tooltip conversion was
  dropped entirely from this pass and not started; (2) what belongs in
  the new "Lists" accordion - answered "Also include 'Other people's
  reminder lists'," settling the scope as "Their reminders list" + "Their
  wish list" + "Other people's reminder lists" (not the Calendars/
  primary-calendar picker, which stays where it is).

  Change (`family_hub/card/family-week-calendar-card.js`, the per-person
  "Notification profile" modal template only - no other modal or tab was
  touched): wrapped three existing groups of fields in the established
  `.accordion-toggle`/`.accordion-body` markup pattern (originally from
  "task #172," already used elsewhere in the card, e.g. the General tab's
  own Daily Digest section) - a "Lists" accordion
  (`data-target="notify-profile-lists-body"`) around the reminders-list
  entity field, wish-list entity field, and the "Other people's reminder
  lists" subscription picker; an "Instant notifications" accordion
  (`data-target="notify-profile-instant-body"`) around the five
  instant-notification checkboxes (reward claimed, chore approved, chore
  rejected, chore due, timer alarm) and their hint text; a "Daily Digest"
  accordion (`data-target="notify-profile-digest-body"`) around the
  digest on/off toggle, the "In their digest" section checkboxes, and
  "Send test digest now." The standalone "Reminders" on/off toggle was
  deliberately left OUTSIDE any accordion (it wasn't one of the three
  named groups) between the new Lists and Instant notifications
  accordions. No JS logic was touched - `_build()`'s existing generic
  delegated click handler (`root.querySelectorAll(".accordion-toggle")`,
  wired once at `setConfig()` time) auto-wires the three new toggles since
  it queries fresh over the whole static template; every field kept its
  exact existing class name, `data-list-kind`/`data-section` attribute,
  and id, so no other method (`_openNotifyProfileModal`,
  `_renderNotifyProfileBadges`, `_syncNotifyProfileListAddButtons`,
  `_createNotifyProfileList`, `_renderNotifyProfileRemindersLists`, the
  digest-section checkbox wiring) needed any change - they're all
  class-based `querySelector`/`querySelectorAll` lookups unaffected by new
  wrapping ancestors. Matches the established "no code resets an
  accordion's open/closed state on modal open" behavior already used
  everywhere else this pattern appears - state simply persists across the
  DOM's lifetime, same as before.

  Tests: added a new block to `test_user_calendar_settings.js` covering
  all three new accordions - toggle+body both exist, the right fields
  live inside the right body, the Reminders toggle stays outside all
  three, all three start collapsed, clicking opens (button + body both
  get `"open"`), clicking again collapses independently of the other two
  still-open accordions, and a field inside a reopened accordion body
  (the reminders-list entity input) still updates the settings draft on
  input. Verified the new test actually catches a regression before
  trusting it (this project's standing discipline since the v1.132.0/
  v1.132.1 incident): patched a scratch copy of the built JS so the
  accordion-toggle click handler was a no-op, confirmed the new test
  failed against it with the expected assertion message, then confirmed
  it passes clean again against the real fix. Full regression suite (28
  JS files + 9 Python files) re-run clean both before and after.

- **v172 (1.132.2)**: fixed "what could cause a double event to appear on
  the daily digest" - household question, investigated and root-caused
  live against their own Home Assistant rather than guessing from the
  code alone.

  Investigation: `_build_daily_digest_message`'s "Today's events" section
  (`__init__.py`, reads `options[CONF_CALENDARS]` - the "Calendars to
  monitor" list set in Configure and auto-extended by
  `_ws_set_notify_overrides`/the calendar quick-add path) had zero
  de-duplication anywhere - it just looped every configured entity,
  called `calendar.get_events`, and concatenated every event line it got
  back, on the assumption that each configured calendar.* entity
  represents a distinct calendar contributing distinct events. Used the
  connected Home Assistant MCP tools to check that assumption against the
  household's real data: `ha_eval_template` with `{{ states.calendar |
  map(attribute='entity_id') | list }}` turned up `calendar.noelle` AND
  `calendar.noelle_2` (both friendly-named just "Noelle"), plus
  `calendar.holidays_in_united_states` / `_2` and THREE
  `calendar.birthdays`/`_2`/`_3` entities - all sharing identical friendly
  names. Called `calendar.get_events` directly (via `ha_call_service`)
  against `calendar.noelle` and `calendar.noelle_2` for the same date
  range and got back byte-identical results ("Tom's Week"/"Jess Week" from
  both) - confirmed smoking gun. This is a well-known Home Assistant/
  Google Calendar quirk: every connected Google account auto-syncs its
  own copy of Google's account-level "Holidays in <country>" and
  "Contacts' birthdays" calendars, so two connected accounts (or a
  calendar shared into a second account) naturally produces duplicate
  entities with identical events. If more than one of a duplicate pair
  ends up in `CONF_CALENDARS`, the digest was always going to print that
  day's events from it twice - Family Hub's own code was working exactly
  as written, just never defended against two entities describing the
  same calendar.

  Fix (`_build_daily_digest_message`'s calendar-events loop): two
  independent de-dup guards, since either alone would miss part of this
  household's real setup. `seen_calendar_entities` (a `set[str]`) skips a
  calendar_entity already processed in this same digest build - guards
  against a literal repeated entity id within `CONF_CALENDARS` itself
  (possible if that list was ever hand-edited, or a future bug
  reintroduces a duplicate the way v1.132.0's own decorator bug almost
  could have via a stray edit). `seen_events` (a `set[tuple[str, str,
  str]]`, keyed on `(summary, start, end)`) is the one that actually
  catches the household's real scenario - it's keyed on event CONTENT,
  not which entity it came from, which is exactly why it catches the same
  event arriving from two DIFFERENT entities (calendar.noelle vs.
  calendar.noelle_2) where an entity-only guard structurally cannot. Two
  distinct events sharing summary/start/end exactly by coincidence within
  one day's window was judged not a real-world risk worth guarding
  against (would require both text AND both timestamps to collide).

  Testing: first-ever backend test coverage for the digest's events
  section at all (`test_daily_digest.py`, new file, 6 tests) - a `FakeHass`
  whose `services.async_call` routes `calendar.get_events` by entity_id to
  a canned per-entity response, same pattern `test_timer_alarm.py`
  established for `notify.*` service-call testing. Tests:
  `test_same_event_from_two_duplicate_calendar_entities_appears_once`
  (the core regression - reproduces the household's own `calendar.noelle`
  /`_2` data directly, both entities still get queried but the event
  prints once), `test_literal_duplicate_entity_in_calendars_list_is_only_
  fetched_once` (the second guard, independently), `test_genuinely_
  different_events_are_never_merged`, `test_same_summary_different_time_
  is_not_treated_as_a_duplicate` (proves the key needs all three fields,
  not just summary), `test_timed_event_formatting_unchanged_by_the_dedup_
  fix` (no regression to the existing "%-I:%M %p - summary" formatting),
  and `test_no_calendars_configured_skips_the_events_section_entirely`.
  Learned from v1.132.1's own lesson (a test suite that imports clean
  proves nothing about runtime correctness on its own) and additionally
  verified the core regression test actually FAILS against a reproduction
  of the pre-fix code (reverting just the two new guards in a scratch
  copy) before trusting that it passing on the real fix meant anything -
  confirmed it fails with the exact literal duplication the household
  described ("Jess Week" / "Jess Week" / "Tom's Week" / "Tom's Week").

  Also re-ran the same AST-based decorator sanity sweep introduced in
  v1.132.1 (every `@websocket_api.websocket_command`-decorated node is an
  `AsyncFunctionDef`, every name passed to `async_register_command`
  actually carries that decorator) against this edit before considering
  it done - clean, no repeat of that mistake.

  Full regression suite re-run clean (36 test files: 7 Python + 29 JS,
  7 Python now includes the new `test_daily_digest.py`). `manifest.json` bumped 1.132.1 →
  1.132.2. Frontend unchanged - this was a backend-only digest-building
  fix; the calendar GRID's own event rendering was not investigated here
  since the household's report was specifically about the digest, though
  the same duplicate-calendar-entity root cause could plausibly surface
  there too if the household ever asks about it.

- **v171 (1.132.1)**: critical fix for v170, shipped minutes after it -
  the household reported the integration wouldn't load at all right after
  updating ("Family Hub... Not loaded", warning icon, in Settings →
  Devices & Services). Checked the household's live Home Assistant via the
  connected Home Assistant MCP tools (`ha_get_logs`, source="system",
  search="family_hub") and found the real root cause immediately:
  `AttributeError: 'function' object has no attribute '_ws_command'` in
  `websocket_api.async_register_command`, thrown while registering
  `_ws_get_settings` during `family_hub`'s own `async_setup`.

  Root cause: in v170's edit, `_migrate_people_reminders_into_profiles`'s
  full definition got inserted BETWEEN `_ws_get_settings`'s own
  `@websocket_api.websocket_command({vol.Required("type"):
  "family_hub/get_settings"})` / `@websocket_api.async_response` decorator
  pair and its `async def _ws_get_settings(...)` line - meaning those two
  decorators silently wrapped `_migrate_people_reminders_into_profiles`
  instead of `_ws_get_settings`, which the actual
  `websocket_api.async_register_command(hass, _ws_get_settings)` call
  further down still tried to register completely undecorated. Real Home
  Assistant's decorator stamps a `_ws_command`/`_ws_schema` attribute onto
  the function it wraps, which `async_register_command` reads off whatever
  function it's handed - so this failed hard, at integration setup, every
  time.

  Why every test passed anyway: this project's own mocked
  `homeassistant.components.websocket_api` module (`/tmp/hatest/
  homeassistant/components/websocket_api.py`) stubs
  `async_register_command(hass, func)` as a bare `return None` - it never
  reads any attribute off `func` at all, so a completely undecorated
  function (or the decorators landing on the wrong one entirely) is
  invisible to it. `ast.parse()`-based syntax checks also can't catch this
  class of bug, since `@decorator\ndef wrong_function` is perfectly valid
  Python syntax - it's simply attached to the wrong target. Confirmed via
  a static AST sweep of the whole file (checking every
  `websocket_command`/`async_response`-decorated node actually wraps an
  `AsyncFunctionDef`, and cross-referencing every decorated function name
  against every name actually passed to `async_register_command`) that
  this was an ISOLATED mistake in this one edit, not a wider pattern
  elsewhere in the file.

  Fix: moved `_migrate_people_reminders_into_profiles`'s definition back
  above both decorators (now completely undecorated, as a plain internal
  helper function - it was never meant to be a websocket command itself),
  and restored the two decorators directly above `async def
  _ws_get_settings(...)` where they originally belonged. The migration
  function's own logic/docstring is byte-for-byte unchanged from v1.132.0
  - this is purely a "which function has the decorators" fix.

  Added a permanent regression guard specifically for this bug class:
  `test_every_registered_websocket_command_is_actually_decorated_correctly`
  in `test_user_profile_calendar_settings.py`. It regex-extracts every
  function name actually passed to `websocket_api.async_register_command(hass,
  ...)` from `__init__.py`'s own source (`family_hub.__file__`), then for
  each one asserts it's (a) `asyncio.iscoroutinefunction` and (b)
  `hasattr(func, "_ws_schema")` - the attribute the real decorator stamps
  on, which this project's mock ALSO sets (unlike `_ws_command`, which the
  mock doesn't bother with - checked `/tmp/hatest/homeassistant/
  components/websocket_api.py`'s own `websocket_command()` implementation
  to confirm `_ws_schema` was the one safe, mock-visible attribute to
  assert on instead). Verified this test actually catches the bug class,
  not just passes trivially: reproduced the exact broken code in a scratch
  copy (decorators moved off `_ws_get_settings` onto a neighboring
  function, same shape as the real mistake), confirmed the `_ws_schema`
  check correctly reported `_ws_get_settings` missing it and the
  neighboring function having it instead, then discarded the scratch copy
  and confirmed the real (fixed) test file passes clean.

  Full regression suite re-run clean (35 test files, `test_user_profile_
  calendar_settings.py` now has 36 tests with the new guard).
  `manifest.json` bumped 1.132.0 → 1.132.1.

- **v170 (1.132.0)**: retired the Calendars tab's per-calendar "their own
  Reminders list" field entirely, folding it into each person's Users tab
  profile. Household ask, verbatim: *"move the linked reminders off of the
  calendar accordion, make sure that if there is a currently linked todo
  list on a calendar and a user that selected a calendar as theirs it
  transfers over to the new calendars and reminders area."*

  Backend (`family_hub/__init__.py`): new `_migrate_people_reminders_into_
  profiles(settings: dict) -> bool`, inserted right before `_ws_get_settings`.
  For every `people[i]` with its own `remindersEntity` still set, scans
  `userProfiles` for any profile whose `primaryCalendar == people[i]["entity"]`;
  for each match whose OWN `remindersEntity` is blank, copies the value
  across (never clobbers a profile that already chose its own list - same
  "only overrides when there's something to override with" rule as
  `_primaryCalendarColorByEntity`/`_primaryCalendarBadgesByEntity` on the
  frontend). If at least one profile matched, clears `people[i]["remindersEntity"]`
  back to `""` - deliberately a MOVE, not a copy, since the Calendars tab
  has no UI left to edit or clear that field by hand. A row whose calendar
  isn't anybody's `primaryCalendar` is left completely untouched (multiple
  profiles can legitimately claim the same calendar - not validated
  against uniqueness, same as `primaryCalendar` always - and each one gets
  the transferred value). Idempotent (a second call over already-migrated
  data is a pure no-op, verified by its own test) and safe against every
  malformed-input shape the rest of this file already guards against
  (`people`/`userProfiles` missing or not the right container type, and
  individual list/dict entries that aren't dicts). Called from TWO places:
  `_ws_get_settings` (after loading from the store, persisting via
  `store.async_save` if anything changed - the "existing installs
  self-heal the first time they're read after upgrading" path) and
  `_ws_set_settings` (on `new_settings` right before its own
  `store.async_save`, unconditionally - covers a stale, not-yet-reloaded
  browser tab that still posts an old people[] row's remindersEntity
  alongside an otherwise-current save).

  Frontend (`family-week-calendar-card.js`): removed the entire
  `.person-reminders-row`/`.person-reminders-entity` block from
  `_renderPeopleSettings`'s per-row template (was two lines directly under
  each `.person-row`, above `.person-badges`) plus its now-dead CSS rule.
  `_syncPeopleDraftFromDom` no longer reads that (now-nonexistent) DOM
  field - initially tried hardcoding `remindersEntity: ""` on every
  synced row, then caught my own mistake before shipping it: that would
  silently wipe an UNMIGRATED/orphaned calendar's reminders link (one
  nobody's claimed as their primaryCalendar, so the backend migration
  correctly leaves it alone) the very next time the household saved ANY
  unrelated Calendars-tab edit, since this function runs on every
  add/remove/badge-edit, not just the final Save. Fixed by carrying the
  PRIOR draft's value forward by index instead (`priorDraft[idx]?.
  remindersEntity || ""`) - safe because every call site that mutates the
  draft (remove/add-badge/remove-badge button handlers) already calls this
  BEFORE splicing/pushing, so the DOM and the old draft are still
  index-aligned at the moment of the read. Covered by a dedicated test
  (`test_user_calendar_settings.js`) that renders a row with an unmigrated
  remindersEntity, calls `_syncPeopleDraftFromDom`, and asserts the value
  survived.

  Critical follow-on bug caught before it shipped, not after: `_getPeople()`
  builds each REAL (non-synthesized) people[] row's `remindersEntity`
  straight from that row's own field - which is now "" for every calendar
  the migration just transferred (that's the whole point), meaning the
  calendar grid would have shown a migrated person as having NO individual
  reminders list, immediately undoing what the migration was supposed to
  preserve. Fixed with a new sibling helper, `_primaryCalendarRemindersByEntity()`
  (same shape/doc-comment pattern as `_primaryCalendarColorByEntity`/
  `_primaryCalendarBadgesByEntity` right above it), and wired into both of
  `_getPeople()`'s branches (the `settings.people` branch AND the static
  `_config.people` fallback branch) with the same override-only-when-
  present precedence color/badges already use. Covered by two new tests:
  one confirming the override actually fires for a migrated calendar, one
  confirming an untouched profile (no `remindersEntity` of its own) never
  blanks a still-unmigrated row's own value.

  `_renderNotifyProfileRemindersLists` (the "Other people's reminder
  lists" subscription picker in the Users tab profile modal) used to read
  ONLY `this._settingsPeopleDraft` filtered by `c.entity && c.remindersEntity`
  - after this version, that source is empty for anyone who's been
  migrated, silently breaking the ability to subscribe to a sibling's list.
  Rewrote it to merge two sources into one `others` array before rendering:
  legacy people[] rows (unchanged, still needed for the rare unmigrated/
  unclaimed-calendar case) PLUS every other profile's own `remindersEntity`,
  keyed by THAT profile's `primaryCalendar` (profiles with no primaryCalendar
  set have no identity to key a subscription on, so they're skipped - same
  limitation a people[] row with no matching profile already had). Reused
  `_notifyProfileUsersCache` for display names, same lookup
  `_createNotifyProfileList` already uses. Covered by a new test that sets
  up two profiles, confirms the second profile's list surfaces as
  subscribable keyed by ITS primaryCalendar, and that clicking a
  subscription level still writes into the right place
  (`remindersSubscriptions`).

  Docs: updated `const.py`'s two relevant comment blocks (the raw
  `people[i]["remindersEntity"]` field comment, and `SETTINGS_KEY_USER_PROFILES`'s
  own comment) to describe the new one-way migration instead of the old
  "two independent sources, prefer one" framing from v1.131.0.

  Backend: 6 new unit tests for `_migrate_people_reminders_into_profiles`
  itself (transfers+clears / never clobbers an already-set profile value
  (row still clears either way) / leaves an unclaimed row untouched /
  fans out to every profile that claims the same calendar / idempotent /
  defensive against every malformed-shape combination) plus 3 end-to-end
  tests through the real `_ws_get_settings`/`_ws_set_settings` handlers
  (migrates-and-persists on first load, doesn't resave when there's
  nothing to do, migrates a stale client's payload before saving) - all in
  `test_user_profile_calendar_settings.py`, 35 tests total in that file
  now. Frontend: 6 new assertions in `test_user_calendar_settings.js`
  (field gone from the Calendars tab / unmigrated value survives a DOM
  sync / grid override fires / grid override never blanks an unmigrated
  row / sibling's list surfaces in the subscription picker / clicking a
  subscription level still writes correctly). Full regression suite
  re-run clean (35 test files: 6 Python + 29 JS). `manifest.json` bumped
  1.131.1 → 1.132.0.

- **v169 (1.131.1)**: bugfix found by checking the household's actual live
  Home Assistant instance right after shipping v168, rather than just
  trusting the mock-harness test suite. The household reported the new
  "+ Add list" button on the Wish List field failing with "Couldn't create
  a list automatically" - queried the household's real HA via the connected
  Home Assistant MCP tools (`ha_get_logs`, `ha_search`) and found
  `todo.jaret_reminders` and `todo.jaret_wish_list` *already existed* as
  entities, with no exception/traceback anywhere in HA's logs. Root cause:
  `local_todo`'s own config flow guards against two lists sharing a storage
  key (`slugify(name)`) by returning an *abort* result rather than raising
  - so clicking "+ Add list" a second time for the same person (e.g. the
  modal was closed without hitting Save after the first click, then reopened
  later) silently hit that abort branch, and `_create_local_todo_list`
  treated "not create_entry" as unconditional failure, reporting the list
  couldn't be created even though the list from the first click was sitting
  there the whole time. Confirmed by testing `ha_call_service` with
  `ws_command="family_hub/create_todo_list"` directly against the live
  instance to reproduce (blocked by the auto-mode classifier as a
  "Production Deploy" action, so verification instead came from the log/
  entity evidence above, not a live repro call).
  Fix: `_create_local_todo_list` in `family_hub/__init__.py` now branches on
  the flow result - `create_entry` uses the fresh entry as before; anything
  else falls back to scanning `hass.config_entries.async_entries("local_todo")`
  for an existing entry whose `data["storage_key"]` matches `slugify(name)`,
  and if found, resolves and returns *that* entry's entity_id through the
  same registry-lookup/slugify-fallback path used for a fresh creation. An
  abort that matches no existing entry still correctly returns `None` (the
  original behavior for a genuine failure). Two new tests in
  `test_user_profile_calendar_settings.py`:
  `test_create_local_todo_list_self_heals_when_list_already_exists` (an
  abort whose storage_key matches an existing entry resolves and returns
  that entry's entity_id via the entity registry) and
  `test_create_local_todo_list_returns_none_when_abort_matches_no_existing_entry`
  (an abort matching nothing still returns `None`, not a false positive).
  `FakeHassForCreate` in that test file gained an `existing_entries` param
  and a working `config_entries.async_entries(domain)` fake to support this.
  Full regression suite re-run clean (35 test files: 6 Python + 29 JS).
  `manifest.json` bumped 1.131.0 → 1.131.1; this is a backend-only fix, no
  frontend changes.

- **v168 (1.131.0)**: consolidated a user's calendar/reminders/wish list
  under their own Users tab profile. Household ask, verbatim: *"This
  started as a calendar integration and we still have some weird things
  left from that. I would like to be able to set a user calendar, a user
  reminder todo list and a user wish list all under their settings. Allow
  users to still add calendars under calendars but also include a user's
  calendars under their name on the calendar. In addition, badges should
  come with the new place for calendars."* Follow-up, mid-turn: *"If there
  isnt a todo list for reminders or for wish list make the button say 'add
  list' and create it as username_Listname."*

  **The "weird leftover" this fixes**: before this version, a person's own
  calendar/reminders/wish-list setup was split across three only loosely
  connected places, all dating back to when this project was calendar-only:
  - Their CALENDAR was only ever "whichever settings.people[] row they
    starred as primaryCalendar" in the Users tab - meaning it had to
    ALREADY exist as a general Calendars-tab entry first, and its badges
    lived entirely on that people[] row, not the profile.
  - Their REMINDERS list was settings.people[i].remindersEntity - reachable
    only through whichever people[] row happened to be their starred
    primaryCalendar.
  - Their WISH LIST had no per-person home at all - flagging a todo.* list
    as a wish list was done per-entity from the To-Do Lists card's own
    List(s) tab, with only an ownerUserId stamped at flag time linking it
    back to a person.

  **Design decision**: rather than a bigger rename/migration, `primaryCalendar`
  keeps its existing key/meaning (a calendar entity id) so nothing already
  saved needs migrating, and three new fields join it directly on
  `userProfiles[uid]`: `remindersEntity`, `wishlistEntity`, `badges` (same
  `{text, match, hideMatch}` shape as a people[] row's own badges). The
  profile fields are preferred everywhere "this person's own X" gets
  resolved, with the legacy people[]-row lookup kept as a fallback so an
  already-configured household keeps working unchanged - see
  `SETTINGS_KEY_USER_PROFILES`'s big comment block in const.py for the full
  picture (added right above where it's defined).

  **Backend (`family_hub/__init__.py` + `const.py`)**:
  - `_default_user_profile()`/`_get_user_profiles()` gained the three new
    fields, normalized the same defensive way every other profile field is
    (a malformed entry degrades to the empty/default value, never raises).
  - `_resolve_profile_reminders_entity(profile, people)`: the one place
    "this profile's own reminders list" gets resolved - prefers
    `profile.remindersEntity`, falls back to the legacy people[]-row lookup
    via `primaryCalendar`, returns `""` when neither is set. Used by both
    `_poll_reminders_todo` (which now ALSO polls each profile's directly-set
    list that isn't already covered by a people[] row, with owner-only
    notify targets - cross-person subscription to a profile-only list is
    out of scope for this pass, since `remindersSubscriptions` is keyed by
    calendar entity id via `primaryCalendar`, which a profile-only list with
    no linked calendar has no way to be referenced by yet) and
    `_build_daily_digest_message`'s "Due today" section (labeled with the
    recipient's own HA display name, via `hass.auth.async_get_user`).
  - `_user_display_names(hass)`: `{user_id: name}` for every real HA user,
    used to label a profile-only reminders list's notifications
    (`_poll_reminders_todo`) since there's no people[]-row name to fall back
    on for one.
  - `_sync_profile_wishlist_flags(hass, entry_data, old_profiles,
    new_profiles)`: called from `_ws_set_settings` whenever a save touches
    `userProfiles` - diffs each user_id's `wishlistEntity` old vs new,
    flags a newly-chosen entity (ownerUserId = that user), and un-flags the
    old one UNLESS some other profile's `wishlistEntity` still points at
    it (the "still wanted by someone else" guard - a genuinely unlikely
    edge case, but cheap to get right: two profiles pointing at the same
    entity, one changes away, the other's flag must survive). A save that
    doesn't even mention `userProfiles` never touches the wish-list store
    at all.
  - `_create_local_todo_list` MOVED from config_flow.py into `__init__.py`
    (byte-identical logic, docstring updated) - config_flow.py already
    imports FROM `__init__.py` (`from . import (...)`), so the helper had
    to live on this side of that relationship for the new
    `family_hub/create_todo_list` websocket command (`_ws_create_todo_list`)
    to reuse it at RUNTIME (the Users tab's own "+ Add list" buttons), not
    just during the one-time setup wizard. config_flow.py now imports it
    back in; its own call sites (`async_step_todo_lists`) are unchanged.
    Verified: `_LOCAL_TODO_DOMAIN`/`_LOCAL_TODO_LIST_NAME_FIELD` moved
    alongside it, and the now-unused `entity_registry`/`slugify` imports
    were removed from config_flow.py (the whole reason they were imported
    there no longer exists in that file).

  **Frontend (`family-week-calendar-card.js`)**:
  - `_defaultUserProfile()`/`_normalizeUserProfiles()` mirror the backend's
    three new fields exactly (kept in sync per this file's own long-standing
    convention). One bug caught by the new test file before it ever
    shipped: the JS badges normalizer originally didn't guard `typeof b ===
    "object"` before reading `b.match`/`b.text` off each array entry - a
    plain STRING entry in a malformed `badges` array (e.g. from hand-edited
    storage) would pick up `String.prototype.match` (a real, truthy
    function reference) instead of being dropped, stringifying to
    `"function match() { [native code] }"`. Fixed by filtering to
    `b && typeof b === "object"` first, matching the backend's own
    `isinstance(b, dict)` guard exactly.
  - `_primaryCalendarBadgesByEntity()`: sibling of the pre-existing
    `_primaryCalendarColorByEntity()`, same "only overrides when the
    profile actually has something set" rule (an untouched profile's empty
    `badges: []` never blanks out badges a household configured the OLD
    way, directly on a people[] row).
  - `_getPeople()` rewritten to, in order: (1) build the existing
    people[]/_config.people list exactly as before, with the profile
    color/badges overrides now applied via BOTH sibling helpers rather than
    just color; (2) for every profile whose OWN `primaryCalendar` entity
    ISN'T already one of those entities, synthesize an extra column - named
    via `_householdMemberNamesById[uid]` (falling back to the raw user id),
    colored with the profile's own color, carrying the profile's own
    badges/remindersEntity, countdown off. Because literally every other
    render call site in this huge file (columns, badge keyword matching,
    colors, countdown eligibility) already reads `_getPeople()`'s return
    value generically, this ONE change point is what makes "include a
    user's calendars under their name on the calendar" AND "badges should
    come with the new place for calendars" both just work everywhere, with
    no changes needed at any of those other call sites.
  - `_householdMemberNamesById` / `_fetchHouseholdMemberNames()`: a NEW,
    always-on cache (populated via the existing `family_hub/list_users`
    command, added to `_refreshAllData()`'s existing poll-tick/first-load
    cycle) - `_getPeople()`'s synthesis needs a display name available at
    ALL times the calendar renders, not only while the Users tab's own,
    Settings-modal-scoped `_notifyProfileUsersCache` happens to be
    populated.
  - Users tab profile editor (`_openNotifyProfileModal` and its HTML
    template) gained three new fields: **Their own calendar** (a plain
    text entity input) with its own badges editor
    (`_renderNotifyProfileBadges`/`_syncNotifyProfileBadgesFromDom`,
    reusing the exact same `.person-badge-row`/`.person-badge-text`/
    `.person-badge-match`/`.person-badge-hide`/`.person-badge-remove-btn`
    CSS classes a people[] row's own badges editor already uses, just
    rendered into their own scoped container and read from/written to
    `profile.badges` instead of a people[]-row index), **Their reminders
    list**, and **Their wish list** (both a text entity input plus a
    `.notify-profile-list-add-btn` "+ Add list" button,
    `_syncNotifyProfileListAddButtons` hiding each one the instant its own
    field has a value).
  - `_createNotifyProfileList(listKind)`: the "+ Add list" button's
    handler - builds `"<PersonName>_<Reminders|Wish List>"` from
    `_notifyProfileUsersCache`'s own display name, calls the new
    `family_hub/create_todo_list` command, fills the field + draft on
    success, shows an inline error (styled via the new `.is-error` class on
    `.notify-profile-list-status`) on failure rather than doing nothing
    silently.

  **Deliberately out of scope for this pass** (noted for a future ask, not
  attempted here): `family-today-card.js` (the Family Today companion card)
  has its OWN, separate, smaller `_getPeople()` that does not synthesize
  profile-only calendars or apply the profile badges/color override - it
  still behaves exactly as before, unaffected by this change, just not
  equally enhanced. Cross-person subscription to a profile-only reminders
  list (one with no linked calendar at all) isn't supported yet, since
  `remindersSubscriptions` is keyed by calendar entity id via
  `primaryCalendar` - only the list OWNER's own notifications work for a
  profile-only list today (see `_resolve_profile_reminders_entity`'s
  own comment in `__init__.py`).

  **Tests**: `test_user_profile_calendar_settings.py` (new, 24 tests) -
  `_get_user_profiles` normalization of the three new fields (including
  malformed-entry defensiveness), `_resolve_profile_reminders_entity`
  (prefers profile field, falls back to legacy lookup, ignores other
  people's rows), `_sync_profile_wishlist_flags` (set/clear/reassign/
  "still wanted by someone else"/no-op-when-unchanged/missing-store-safe),
  an end-to-end `family_hub/set_settings` test proving the sync actually
  runs through the real handler (and that a save with no `userProfiles` key
  never touches the wish-list store at all), and
  `_create_local_todo_list`/`_ws_create_todo_list` (registry-resolved
  entity id, slugify fallback when the registry lookup fails/is
  unavailable, `None` on a non-`create_entry` flow result or a raised
  exception, and the websocket command's blank-name rejection).
  `test_user_calendar_settings.js` (new) - `_defaultUserProfile`/
  `_normalizeUserProfiles` (including the string-vs-object badges bug
  caught above), `_getPeople`'s synthesis-vs-override behavior in both
  directions (a profile-only calendar becomes its own column; a calendar
  already in people[] gets its color/badges overridden in place, but only
  when the profile actually has something set - an untouched profile never
  blanks an existing row's own config), the profile editor's new fields and
  badges editor end to end (typing, add/remove badge rows, add-list button
  visibility toggling on both direct typing and a successful creation), and
  the "+ Add list" button's success path (right list name, right entity id
  filled in, button disappears) and failure path (inline error, field stays
  blank). Full regression suite re-run clean: 29 JS test files, 6 Python
  test files.

- **v167 (1.130.0)**: To-Do Lists card gets "fit to screen" + drag-to-resize
  rows. Household ask, verbatim: *"add a way to todo card to fit to screen
  and also be able to resize rows."*

  **Clarified up front via AskUserQuestion** (two questions, both answered
  with the recommended option): resize happens by **dragging a handle
  between rows** (not a numeric input or a long-press menu), and "fit to
  screen" means **the card fills the remaining viewport height**, growing
  to the bottom of the screen below wherever it sits, with each list
  column scrolling its own items internally rather than the whole
  dashboard page scrolling.

  **Frontend (`family-hub-todo-card.js`)**:
  - `_fitToScreen()` reads `this._backendFitToScreen` (populated by
    `_fetchTodoCardConfig` from the backend's `fit_to_screen` field,
    defaulting to `false` on any fetch failure).
  - `_syncTodoCardHeight()` is a direct copy of
    `family-week-calendar-card.js`'s own `_syncHeight()` pattern:
    `getBoundingClientRect()` + `window.visualViewport` (falling back to
    `window.innerHeight`) computes how much viewport remains below the
    card's own top edge, clamped to a 200px floor, and sets it as an
    explicit pixel `height` on the host element. When fit-to-screen is
    off, any previously forced height is cleared back to `""` so the card
    reverts to its normal content-driven height. Wired into
    `connectedCallback`/`disconnectedCallback` with the same
    resize/orientationchange/`visualViewport` resize+scroll listener set
    plus a 1500ms polling fallback (for header-collapse-on-scroll, which
    fires no resize event) that the calendar card already established -
    deliberately NOT sharing `--fh-header-offset` with the calendar card,
    since this card isn't positioning a `position:fixed` overlay and
    computes its own height independently.
  - CSS: `:host([fit-screen])` turns `ha-card` into a column flexbox
    filling `height:100%`; `.board.fit-to-screen` becomes
    `flex:1 1 auto; min-height:0; overflow:hidden` so it's the one thing
    that actually gets constrained to the remaining space; each
    `.todo-board-row` gets `flex:1 1 0; min-height:0` (an EQUAL split by
    default - see `_rowHeightWeights` below for how a drag overrides that
    per-row); `.todo-column` scrolls its own `overflow-y:auto` with a
    `position:sticky` column header, so column headers stay pinned while
    that column's own items scroll underneath.
  - `_rowHeightWeights(rowCount)` returns the saved `_backendRowHeights`
    array when (and only when) its length still matches `rowCount`,
    otherwise an equal-weights fallback (`Array(rowCount).fill(1)`) -
    mirroring the backend's own GET-time self-healing so a stale array
    left over from a since-changed row count is never trusted on the
    frontend either, even between a save and the next fetch.
  - `_boardHtml()` applies each row's weight as an inline
    `style="flex:<weight> 1 0"` and inserts a
    `.todo-board-row-resize` handle between each adjacent pair of rows -
    but ONLY when fit-to-screen is on AND there's more than one row
    (`multi`); a single-row board or fit-to-screen-off board renders no
    handles at all, since dragging would mean nothing in either case.
  - Drag handling (`_onRowResizePointerDown`/`_onRowResizePointerMove`/
    `_onRowResizePointerUp`/`_endRowResizeDrag`) uses the Pointer Events
    API rather than the HTML5 drag-and-drop the item cards already use -
    deliberately, for continuous live position feedback while dragging
    (not just a single drop target) and free touch support, which matters
    for a card built for a wall-mounted kiosk tablet. Pointerdown captures
    the two adjacent rows' starting heights/weights (`pairHeight`,
    `pairWeight` = the sum of the two rows' weights, preserved exactly
    across the drag) and a 64px-or-half-the-pair-height minimum row
    height floor; pointermove computes a clamped ratio and applies it live
    to both rows; pointerup rounds the final weights (min 0.1) and calls
    `_persistRowHeights`, applying the result optimistically to
    `_backendRowHeights` first. `disconnectedCallback` also calls
    `_endRowResizeDrag()` so a card torn down mid-drag (switching
    dashboard views) never leaves a stray `window`-level pointermove/
    pointerup listener behind.
  - `_persistRowHeights(weights)` sends the SAME
    `family_hub/set_todo_card_config` command the List(s) tab's own Save
    uses, with `entities`/`grocy_list_ids`/`rows`/`fit_to_screen` all
    resent alongside the new `row_heights` so a drag-only save can't
    accidentally clear anything else. `_currentGrocyListIdsForSave()`
    exists specifically for this call site: `_grocySelectedListIds()`'s
    `null` ("every Grocy list") sentinel has to be resolved into a
    concrete array here, since `grocy_list_ids` is a REQUIRED
    plain-replace field on this command - sending `[]` in its place would
    silently wipe the selection down to nothing instead of leaving it
    alone.
  - List(s) tab: a new **Fit to screen** checkbox in the existing Layout
    section, draft-tracked the same way the row-count presets already are
    (`_listsTabFitScreenDraft`, applied to the card only on Save, not
    live). Its own hint text is re-rendered live off BOTH the draft row
    count and its own checked state (`syncFitScreenHint`, called from
    inside the existing `syncLayoutUi`), so it only mentions
    row-dragging once both are actually 2+/on - checking the box while
    still at 1 row, or bumping the row count while the box is unchecked,
    shows no dragging mention until both conditions are true together.
    `_saveListsTab` sends `fit_to_screen: this._listsTabFitScreenDraft` in
    the same `set_todo_card_config` call the row count already goes
    through, and clears `this._backendRowHeights` to `null` optimistically
    whenever that save actually changes the row count (mirroring the
    backend's own GET-time self-healing on the frontend too, so a stale
    array never even flashes onto a newly-resized board before the next
    fetch would have hidden it anyway).

  **Backend (`family_hub/__init__.py`)**: `fit_to_screen` (bool) and
  `row_heights` (list of floats) join the existing per-card_id record in
  `TODO_CARD_CONFIG_STORAGE_KEY_PREFIX`'s store, both merge-on-omit on
  `_ws_set_todo_card_config` - same reasoning as the existing `rows`
  field: an older card build (or a drag-resize save that intentionally
  sends only `row_heights`) must not reset a field it doesn't mention.
  `_ws_get_todo_card_config` only ever returns `row_heights` when its
  length exactly matches the row count CURRENTLY on file (falling back to
  1 when no row count has ever been chosen) and every entry is a positive
  number - a mismatched leftover array (from a row count the household
  has since changed) is simply never handed back at all, rather than
  something the frontend has to reconcile itself.

  **Tests**: `test_todo_card.js` gained a full new section (right after
  the existing v1.109.9 board-layout tests, reusing that same fixture
  data/pattern) covering: fit-to-screen off/on defaults and the resulting
  `[fit-screen]` attribute/`.fit-to-screen` class/forced pixel height;
  `_rowHeightWeights`'s equal-weights fallback both when nothing's ever
  been resized and when a saved array's length no longer matches the row
  count; `_boardHtml` rendering resize handles only for a fit-to-screen +
  multi-row board (verified for both a 2-row and a genuine 3-row board,
  the latter needing a third real fixture entity since `_boardRowGroups`
  won't manufacture empty rows); the List(s) tab checkbox's draft-until-
  Save behavior, its hint text's two-condition gating, a full
  save/reload/persisted round-trip for both `true` and an explicit `false`
  (not merge-on-omit-preserved), and the resize handles disappearing once
  toggled back off; and the drag handlers end to end - pointerdown/
  pointermove/pointerup persisting via `family_hub/set_todo_card_config`,
  stale `row_heights` invalidated on a row-count change made through the
  List(s) tab, and a clean `disconnectedCallback` teardown mid-drag. One
  jsdom-specific note worth remembering for future frontend work on this
  card: jsdom's CSSOM has NO support at all for the `flex` shorthand
  property - `el.style.flex = "..."` is silently dropped and unobservable
  through any DOM API (not `.style.flex`, not `getAttribute("style")`,
  not `cssText`), even though a `style="flex:..."` attribute present in
  parsed HTML IS readable via `getAttribute("style")`. The initial
  server-rendered per-row weight (set via a template string in
  `_boardHtml`) is verified that way; the LIVE weight while dragging
  (set via a JS property assignment in `_onRowResizePointerMove`) has to
  be verified through the drag's own internal `liveWeights` state
  instead, since jsdom gives no way to observe it in the DOM at all. Also
  needed a one-time global stub for `HTMLElement.prototype.
  setPointerCapture` (jsdom doesn't implement the Pointer Events capture
  API either) alongside the file's other bare-global mirrors.

  New `test_todo_card_config_storage.py` (first dedicated backend test
  file for this store) covers `_ws_get_todo_card_config`/
  `_ws_set_todo_card_config` directly: never-saved defaults, `true`/
  `false` round-tripping the new fields (not just truthiness), merge-on-
  omit preservation of both fields across saves that don't mention them,
  GET-time invalidation of `row_heights` on a row-count mismatch AND on a
  non-positive entry, and per-`card_id` isolation with the new fields
  mixed in.

  Full regression suite re-run clean: all 28 JS test files, all 5 Python
  test files.

- **v166 (1.129.0)**: Two fixes shipped together.

  **1) To-Do Lists card save - identity scheme rewritten from scratch.**
  Household report, verbatim, immediately after v1.128.0 shipped: *"the
  todo list is STILL broken, you need to make it so it saves the
  configuration as YAML in the card."*

  **Why v1.128.0 (and v1.125.0 before it) still weren't enough**: both
  were fixes to the SAME underlying design - `_ensureCardId` generating a
  random id, cached in `localStorage` under a key derived from "how many
  todo cards has this page session built so far" (a `window`-global
  ordinal). v1.125.0 memoized the id on the element instance so repeat
  `setConfig` calls didn't re-derive it; v1.128.0 debounce-reset the
  ordinal between construction bursts so a same-position card rebuilt
  without a page reload still landed on the same ordinal. Both were
  correct fixes for the specific drift mechanism they targeted - but the
  scheme itself was fundamentally still GUESSING this card's identity
  from runtime construction bookkeeping, and there was no way to
  enumerate every way that bookkeeping could still drift (a browser that
  clears storage on launch, a kiosk that restarts mid-session, a
  construction order the debounce window didn't fully cover, or simply
  the household not trusting an invisible browser-side heuristic to be
  the thing standing between them and their saved list selection).

  **Fix**: `_ensureCardId`/`_todoCardConfigFingerprint` in
  `family-hub-todo-card.js` now derive the card_id as a pure, stateless
  function of the card's own config - `JSON.stringify([path, title,
  sorted(entities), sorted(grocy_list_ids)])` run through a short djb2
  hash (`cfg-<hash>-<length>`). No `window` ordinal, no `localStorage`
  caching of the id itself, no `setTimeout`/debounce - nothing that
  depends on when, how many times, or in what order this card (or any
  OTHER todo card anywhere on the page) has ever been built. The exact
  same card - same view, same title, same entities/grocy_list_ids -
  resolves the exact same id every single time, unconditionally. An
  explicit `card_id:` set by hand in that card's own YAML/storage config
  still wins outright (checked first, unchanged) - that's the one
  genuinely YAML-anchored override this scheme was always able to offer,
  and the fix leans into it rather than trying to make the AUTO-generated
  path literally rewrite the household's dashboard YAML file (which
  nothing running in a browser card can actually do - Home Assistant's
  own config-changed event is only ever heard by the dashboard EDITING
  UI, never a plain page view, dashboard mode notwithstanding; this is
  why the backend Store-keyed-by-card_id design exists at all rather than
  round-tripping the list selection through Lovelace config directly).
  The one known trade-off, called out explicitly rather than hidden: two
  todo cards with the IDENTICAL title/entities/grocy_list_ids on the same
  view will now resolve the SAME id and share one backend record (there's
  no config difference left to key off of) - a hand-set `card_id:` is the
  way to tell two otherwise-identical cards apart, same as it always was.
  This is considered strictly better than the alternative: a household on
  a page with only ONE todo card (the overwhelmingly common case) now
  gets a card_id that is provably impossible to drift, ever, under any
  browser/construction condition, instead of one that mostly doesn't.

  **Tests**: rewrote the `test_todo_card.js` card_id-stability block -
  removed all ordinal-counter assertions (the mechanism no longer
  exists), added: the same config resolving the same id after several
  UNRELATED todo cards are built in between (no shared counter to
  perturb, no tick/setTimeout needed at all - a synchronous, immediate
  assertion where the old test needed `await new Promise(...setTimeout)`
  to let a debounce fire); the same config resolving the same id after an
  explicit `window.localStorage.clear()` (nothing stored there to lose
  any more); and an explicit `card_id:` in config still winning over the
  derived fingerprint. Full existing regression suite (all 28 test files)
  re-run clean.

  **2) Recipe Box card: tap a recipe, get the full-screen viewer in one
  tap, matching the calendar.** Household report, verbatim: *"the recipe
  box card open a menu in a modal but the recipe modal in the calendar
  opens the recipe full screen, the recipe box card needs to function the
  same."*

  **Background**: v1.121.0 already fixed a DIFFERENT bug with this same
  surface area - the full-screen Grocy Recipe Viewer rendering as a small
  modal confined to the card's own grid box instead of actually reaching
  the real viewport (a CSS containing-block issue, fixed by portaling the
  overlay onto `document.body`). That fix is unrelated to this one and
  still stands - the viewer genuinely does render full-screen once
  opened. This report is about a different step: REACHING that viewer at
  all from the Recipe Box's own browse list took two taps, not one.

  **Root cause**: `window.__familyHubRecipeBoxShared` (the object both
  `family-hub-recipe-box-card.js` and `family-week-calendar-card.js`
  `Object.assign` onto their own prototypes, byte-identical between the
  two files) has always routed a browse-list tap on ANY recipe - Grocy-
  linked or not - to `_openDishDetail`, a small `.dish-detail-overlay`
  "menu" (name/photo/rating/description, Suggest/Edit/Delete buttons, and
  a "View recipe" link). Only tapping that link opened the actual full-
  screen `_openGrocyRecipeViewer`. The calendar's OWN "tap a planned
  meal's recipe" call sites (day-cell chips, Expiring Soon list, the
  additional-recipes picker's preview icon, etc.) never went through
  `_openDishDetail` at all - every one of them calls
  `_openGrocyRecipeViewer` directly. Since `_openDishDetail`/
  `_openGrocyRecipeViewer` are the literal same shared function objects
  on both cards' prototypes (confirmed by this file's own "54 shared
  methods" test), the Recipe Box card's browse-list tap was never
  actually different code from the calendar's own browse-list tap inside
  its embedded Recipe Box - the asymmetry was specifically between
  BROWSING (always through the menu) and the calendar's MEAL-click
  shortcuts (never through it). The Recipe Box card has no meal slots, so
  browsing was its ONLY way to reach a recipe, and it always took the
  long way.

  **Fix**: in the shared block's browse-list click handler, a tap on a
  recipe with a `grocyRecipeId` now calls `_openGrocyRecipeViewer`
  directly (skipping `_openDishDetail` entirely) - a Grocy-linked recipe
  has real ingredients/instructions/servings to show, so there's no
  reason browsing it needs an extra tap through a menu screen first. A
  recipe with no Grocy link has nothing else to promote to full-screen
  (its dish-detail menu already shows everything there is - name/photo/
  description/link), so that case is completely unchanged. `_openGrocyRecipeViewer` gained a 6th parameter, `sourceRecipe` - the
  actual Recipe Box entry (not just its bare Grocy id) - stored as
  `this._grocyRecipeViewerSourceRecipe` and cleared on close. Every
  EXISTING call site (the calendar's meal chips, Expiring Soon, etc.)
  simply doesn't pass it, so `_grocyRecipeViewerSourceRecipe` stays
  `null` there and nothing about those call sites changes. When it IS
  set, three new footer buttons - Suggest/Edit/Delete, in a new
  `.grocy-recipe-viewer-recipe-actions` block, styled with the same
  shared `.modal-actions`/`.btn-cancel`/`.btn-clear` rules the old
  dish-detail menu's own buttons used - become visible and wire up to the
  exact same shared `_suggestDish`/`_openRecipeBoxEditor`/`_deleteDish`
  the dish-detail menu's buttons always called, so browsing this new,
  shorter way doesn't lose access to any of them. Both cards' HTML
  templates, `_openGrocyRecipeViewer`, `_closeGrocyRecipeViewer`, and
  their own `connectedCallback` wiring for the three new buttons were all
  updated identically (each card still wires its own overlay's buttons
  since they're two separate DOM trees, same established pattern as
  every other Grocy-viewer button).

  **Tests**: rewrote the relevant block of `test_recipe_box_card_
  sharing.js` - a Grocy-linked recipe tap now asserts the small dish-
  detail menu is SKIPPED and the viewer opens directly, in one tap, with
  no `window.open` call; a new block confirms the viewer's own Suggest/
  Edit/Delete footer buttons (visible only because the viewer was opened
  from the browse list) actually act on that same recipe - Suggest
  persists through `family_hub/set_suggestions`, Edit closes the viewer
  and opens the mini-editor pre-filled with that recipe, Delete removes
  it from the shared data layer through the same `confirm()` gate the old
  menu always used. The existing full-screen-escapes-the-shadow-root
  coverage (v1.121.0) was updated to drop its now-unnecessary
  `.dish-detail-open-link` intermediate click. Full existing regression
  suite (all 28 test files) re-run clean.

- **v165 (1.128.0)**: Fix - the To-Do Lists card's List(s) tab Save still
  didn't reliably persist, even after v1.125.0's card_id-stability fix.
  Household report, verbatim: *"todo card needs to save config when you
  click save. It still is not."*

  **Background**: v1.125.0 fixed a bug where Lovelace calling `setConfig`
  more than once on the *same* card element instance - a masonry/sections
  re-layout, an unrelated dashboard config recompute, anything outside
  actually editing the card - would fall through `_ensureCardId`'s ordinal/
  localStorage-mint fallback again and mint a brand-new `card_id` every
  time, because the config-changed event this card dispatches to round-trip
  its generated id back into Lovelace's own stored config is only ever
  heard by Home Assistant's dashboard EDITING UI, never by a plain page
  view. That fix memoized the already-resolved id on `this._config.cardId`
  so repeat `setConfig` calls on one instance stay idempotent.

  **Root cause (this version)**: the household kept hitting the identical
  symptom because the more common real-world trigger isn't a repeat
  `setConfig` call on the same instance at all - it's Lovelace tearing the
  OLD element down and constructing a *brand new* instance for the same
  logical card position, which happens on things as ordinary as switching
  away from a view and back, or certain layout re-renders. A new instance
  has no `this._config` yet, so v1.125.0's memoization guard never even
  gets a chance to run - it falls straight through to the ordinal/
  localStorage-mint logic, same as a genuine first-ever load. That logic
  was designed assuming the ordinal counter (`window.
  __familyHubTodoCardOrdinal`) only advances within a single "page load,"
  the same way it always resets to 0 on an actual browser refresh. But
  nothing ever reset it *within* a page session - it's a plain incrementing
  `window` global, so every card built anywhere on the page, on any view,
  for the entire time the tab stays open, advances the SAME counter and
  never gives it back. A todo card that was the 1st `family-hub-todo-card`
  constructed on its view at initial page load resolves posKey
  `familyHubTodoCardId::<path>::1` and gets some id A. Browse to a couple
  of other views (each with their own todo cards, each advancing this same
  global counter) and back to the original view - if Lovelace rebuilds that
  view's cards (a new instance, not a re-`setConfig` of the old one), the
  counter might now be sitting at, say, 6, so the SAME physical card
  resolves posKey `...::7` instead of `...::1` - a key nothing was ever
  cached under, so `_ensureCardId` mints a fresh random id B. From that
  point on, this instance's List(s) tab Save writes to card_id B while the
  household's actual saved selection still lives under card_id A -
  reading back on the very next fetch (`_fetchTodoCardConfig`, keyed by
  `this._config.cardId`, i.e. B) finds nothing, which looks exactly like
  "Save doesn't work," even though the save call itself never failed.

  **Fix**: `_ensureCardId` now debounces a reset of the ordinal counter
  back to 0 via `setTimeout(..., 0)`, re-armed (via `clearTimeout` +
  re-`setTimeout`) on every call, so the counter only stays nonzero while
  cards are actively being constructed in the current synchronous-ish
  burst and settles back to 0 shortly after that burst finishes - the same
  starting point a genuine page reload always gave it. That means the
  *next* burst of card construction - whether it's triggered by an actual
  page reload or a same-tab view rebuild - starts counting from 1 again,
  so a given view's cards keep resolving to the exact same posKey (and
  therefore the exact same `card_id`) every time they're built, not just
  across a literal page refresh. This is a minimal, fully backward-
  compatible change: the posKey format itself (`familyHubTodoCardId::
  <path>::<ordinal>`) is untouched, so every already-cached id in a
  household's `localStorage` keeps resolving exactly as before - the fix
  only changes when the counter that feeds it gets zeroed. No backend or
  stored-Store changes at all; this was purely a frontend identity-
  stability bug.

  **Tests**: extended `test_todo_card.js`'s existing card_id-stability
  block (from v1.125.0) with a new scenario that the old test couldn't
  catch, since it only ever re-`setConfig`'d the *same* element. The new
  block resets the ordinal to 0, builds a card (burst 1), then builds two
  more cards representing other views' cards in the same tab (advancing
  the ordinal past the original card's position), confirms the ordinal
  climbed as expected, awaits a real `setTimeout` tick so the debounced
  reset fires, confirms the counter settled back to 0, then builds a THIRD
  card in this new "burst 2" representing the original view's card getting
  rebuilt without a page reload, and confirms it resolves the identical
  `card_id` as the very first card rather than a new one. Full existing
  regression suite (all 28 test files) re-run clean.

- **v164 (1.127.0)**: Follow-up to Wish List photo uploads (v1.124.0).
  Household ask, verbatim: *"for the wish list, when you upload an image,
  upload it to home assistant as a photo and then call it from there."*

  **Background**: v1.124.0 shipped photo upload entirely client-side - the
  picked file was downscaled via `<canvas>` to a `data:` URL and written
  straight into the native todo item's own `description` field, because
  at the time this integration had no image-storage endpoint of its own
  and the only `file_upload` usage anywhere in the repo
  (`config_flow.py`'s backup-zip restore) is Config-Flow-only, not
  reachable from a card.

  **Researched first**: Home Assistant core ships its own built-in
  `image_upload` component (domain `image_upload`), the exact thing the
  frontend already uses for Person/Area picture pickers. Ground truth
  pulled from HA core's own source
  (`homeassistant/components/image_upload/__init__.py`):
  - `POST /api/image/upload`, multipart/form-data, field name `file`,
    content type restricted to `image/gif`/`image/jpeg`/`image/png` (400
    on anything else), 10 MB cap. Requires normal auth (any signed-in
    user, not admin) - `HomeAssistantView` default. Returns `{"id": "<32
    hex chars>", "filesize", "content_type", "name", "uploaded_at"}` on
    success.
  - `GET /api/image/serve/<id>/original` (or `<id>/<256|512>x<same>` for a
    generated square thumbnail) - `requires_auth = False`, so it's a
    plain, tokenless `<img src>` anywhere, same as a pasted `https://`
    link.
  - Upload is HTTP-only by design (`ws_create_item` is explicitly
    `NotImplementedError` on the websocket side); `image/delete` exists
    over websocket but requires HA **admin**, which doesn't line up with
    this integration's own (non-admin-gated) per-member wish-list
    permissions - so this pass does NOT add any cleanup/delete of
    replaced or orphaned uploads, same "smallest correct fix" scoping as
    everything else in this file's history. Worth revisiting later if
    upload accumulation becomes a real problem for a household.

  **Fix**: `family_hub/manifest.json` gained `"image_upload"` as a new
  dependency (alongside the pre-existing `file_upload`), so Home Assistant
  always loads it with this integration. `family-hub-todo-card.js`:
  - `_wishlistImageDataUrlFromFile` (the old data:-URL-only path) was
    replaced with `_wishlistBlobToUploadFromFile` (same FileReader→Image→
    `<canvas>` re-encode as before, but now bumped to 1600px max
    dimension/85% JPEG quality since the goal shifted from "keep the
    `description` field small" - irrelevant now, a serve URL is a few
    dozen characters - to "keep the upload itself fast and under
    image_upload's 10 MB cap, and normalize the content type" - same
    best-effort fallback to the ORIGINAL un-re-encoded file if canvas
    isn't available or decoding fails/times out) - it now returns a
    `{blob, name}` pair to upload rather than a `data:` string.
  - New `_wishlistFetchWithAuth(path, opts)`: thin wrapper preferring
    `hass.fetchWithAuth` (the frontend's real authenticated-fetch helper),
    with a manual `Authorization: Bearer <token>` fallback for safety.
  - New `_wishlistUploadImage(file)`: builds a `FormData` with the
    re-encoded (or original) blob under field `"file"`, POSTs to
    `/api/image/upload` via `_wishlistFetchWithAuth`, and returns
    `/api/image/serve/<id>/original` from the JSON response - throwing a
    clear error on a non-ok response or a missing `id` so the caller's
    existing try/catch shows the right failure status.
  - `_wireWishlistImageUpload` (shared by both the Add modal and the item
    detail modal - no changes needed to either modal's own markup/wiring)
    now calls `_wishlistUploadImage` instead of
    `_wishlistImageDataUrlFromFile`, storing the returned serve URL into
    the same Image URL text field a pasted link already fills - nothing
    downstream (`_buildWishlistDescription`/`_parseWishlistDescription`,
    the board's own `<img>` rendering, the hidden-from-owner claim logic)
    needed to change at all, since a relative `/api/image/serve/...` URL
    is exactly as valid an `<img src>`/stored string as a `data:` URL or
    an `https://` one always was.

  **Tests**: `test_todo_wishlist.js` - `makeHass` grew a stubbed
  `fetchWithAuth` (overridable via `opts.fetchWithAuth` for the failure
  case) that records the call and returns a fake `{id: "img_abc123", ...}`
  success response; `global.FormData`/`global.fetch` mirrored onto Node's
  global realm alongside the pre-existing FileReader/Image/File mirrors
  (same `dom.window.eval` bare-global quirk). The upload test block now
  asserts: exactly one `fetchWithAuth` call, to `/api/image/upload`, with
  a file in the body; the Image URL field fills with
  `/api/image/serve/img_abc123/original` (not a `data:` URL); the preview
  updates; the status message reads "Photo added."; and NO
  `family_hub/*`/`theme_builder/*`-style websocket call happens (the
  upload bypasses this integration's own websocket API entirely). A new
  failure-path case (`fetchWithAuth` stubbed to return `{ok: false,
  status: 400}`) confirms a rejected upload shows "Couldn't upload that
  photo…" and leaves the Image URL field empty rather than filling it
  with something broken. Full existing regression suite re-run clean.

- **v163 (1.126.0)**: Fix — every themed card rendered with the hardcoded
  default color palette for a moment before switching to the household's
  actual theme. Household report, verbatim: *"When you load a card it
  tends to load the default theme first then it switches over to the
  theme you set how can we always make it load the set theme first."*

  **Root cause**: every themed card's theme-resolution chain
  (`_getSettings()` → `_resolveTheme(settings)` → `_applyThemeVars()`) only
  ever gets called for real from `_fetchSettings()` (which fetches
  `family_hub/get_settings`) and `_fetchGlobalThemes()` (which fetches
  `theme_builder/list` - required for a household Global Theme OR a
  per-card `theme_override` to resolve into real colors, since both are
  just an id until matched against the fetched list). Both are awaited
  websocket round trips kicked off from `_initFirstLoad()`, itself fired
  off (unawaited) from the card's `hass` setter - meanwhile `_build()`
  (called synchronously from `setConfig()`, before `hass` is ever set) has
  already rendered the card's first paint with zero theme CSS vars applied
  at all, falling back to `_defaultTheme()`'s hardcoded palette. There was
  no way for that first paint to know the real colors before those two
  round trips finished, however fast the network is.

  **Fix**: a new shared `window.__familyHubThemeCache` singleton (same
  "only the first card whose script actually runs this block sets it up"
  pattern as `__familyHubFabCoordinator`/`__familyHubKioskSession`/
  `__familyHubScreenSaver`/`__familyHubTimerAlarm` - copy-pasted byte-
  identically into every themed card file, since these are independently-
  loaded Lovelace resources rather than ES modules), caching the last set
  of CSS var values a card actually applied - in memory for the rest of
  the page load, in `localStorage` (key prefix
  `familyHubThemeVarsCache::`) across reloads. Cached under a KEY, not one
  shared blob, via a new `_familyHubThemeCacheKey()` method: a per-card
  `theme_override` (`card:<id>`) wins if set, else a per-device override
  (`device:<id>`, from the existing `familyHubDeviceThemeOverrideLocal`
  localStorage key), else the shared `"household"` bucket - so an
  overridden card/device never flashes the UN-overridden household theme
  on its way to its own theme, or vice versa. `_applyThemeVars()` (or each
  card's equivalent) now builds its CSS vars as a plain object, applies
  them, THEN caches that same object under its key - so what's cached is
  always exactly what was just visually applied. A new
  `_applyCachedThemeVarsIfAny()` looks up that key and applies whatever's
  there, synchronously, called from `_build()` BEFORE `attachShadow`/the
  first `_render()` - so a reload shows last-known-good colors immediately
  instead of the hardcoded default, and the real fetch-driven
  `_applyThemeVars()` call still runs exactly as before and reconciles
  once it resolves (a no-op re-application when nothing changed, which is
  the overwhelming majority of loads; a visible switch only when the
  household's theme has genuinely changed since this device last saw it -
  unavoidable, since nothing can know about a change before asking).

  **Applied to all ten themed cards** (`family-hub-chores-card.js`,
  `-rewards-card.js`, `-goals-card.js`, `-pantry-card.js`,
  `-my-chores-card.js`, `-todo-card.js`, `-active-timers-card.js`,
  `-recipe-box-card.js`, `family-screensaver-card.js`,
  `family-today-card.js`, `family-week-calendar-card.js`), each getting
  the singleton block, `_familyHubThemeCacheKey()`, a refactored theme-
  applying method, `_applyCachedThemeVarsIfAny()`, and the new call at the
  top of `_build()`. Seven of the ten (chores/rewards/goals/pantry/my-
  chores/todo/active-timers/recipe-box) share a near-identical
  `_applyThemeVars()` body and were patched mechanically from the same
  template (my-chores-card.js's extra trailing `--fs-header-title` logic
  and recipe-box-card.js's extra `if (!this._root) return;` guard both
  preserved as-is). Three needed individual handling:
  - `family-screensaver-card.js` and `family-today-card.js` each apply a
    different, smaller/larger set of CSS vars than the standard eight
    cards (screensaver: 7 vars, no fonts/background; today: adds fonts, a
    box-shadow, and a whole conditional background-image group with
    `removeProperty` branches) - both use a "snapshot" caching approach
    instead of a hand-built `vars` object: after all the existing
    `setProperty`/`removeProperty` calls run unchanged, a fixed list of
    that card's own var names is read back off `this.style` and cached,
    skipping any name that isn't currently set (so a background image
    that's ON in the cache never gets stuck OFF, or vice versa, just from
    what's missing). `family-today-card.js` also has no per-device
    override concept at all (only `family-week-calendar-card.js`, the
    Settings-owning card, and the five original mini-cards have one), so
    its `_familyHubThemeCacheKey()` is two-tier (card override / shared
    household), not three.
  - `family-week-calendar-card.js` (the source-of-truth Settings card,
    and the most involved of the ten): this file's method bodies use zero
    indentation throughout (a pre-existing style quirk of just this
    file), matched in every line added here. Its combined
    `_applySizeVars()` (theme vars AND non-theme size vars in one method,
    no separate `_applyThemeVars()`) uses the same snapshot-caching
    approach as screensaver/today, covering both. It has no per-card
    `theme_override` concept (only Settings-modal-configured Global Theme
    and the per-device override), so its key is two-tier (device
    override / household) too.

  **A real bug found and fixed along the way, not just mechanical
  replication** - two different sub-issues, both caught by the new test
  coverage failing before they were understood:
  1. `family-hub-recipe-box-card.js` and `family-screensaver-card.js` each
     had a pre-existing unconditional call to their theme-applying method
     at the very end of `_build()` (there from before this fix, so the
     card would paint *some* colors immediately rather than nothing at
     all, before the first real fetch). Once that same method started
     *caching* its result too, this call became actively harmful: running
     it there means resolving against `_settingsCache`/`_globalThemes`
     that are still their just-initialized empty defaults (the real
     values only arrive from the awaited fetches later), so it always
     resolves to the plain local default - and caching THAT immediately
     overwrote the correct value `_applyCachedThemeVarsIfAny()` had just
     applied two lines earlier in that same `_build()`, defeating the fix
     for exactly the cards it touched. Fixed by removing both calls
     entirely - `_applyCachedThemeVarsIfAny()` already covers the "show
     something before hass is set" job they used to do, and both cards'
     `:host` CSS fallback colors are verified byte-identical to
     `_defaultTheme()`'s own colors, so this changes nothing visually on
     a genuine first-ever load with nothing cached yet.
  2. `family-week-calendar-card.js`'s `set hass(hass)` was found (while
     chasing the same class of bug in this file's own dedicated test) to
     unconditionally call `_applySizeVars()` on EVERY assignment,
     including the very first one - unlike every other themed card in
     this project, none of which resolve theme vars synchronously from
     their `hass` setter at all (only from the awaited fetch). Since
     Lovelace assigns `hass` immediately after `setConfig()`, this ran
     `_applySizeVars()` synchronously before `_initFirstLoad()`'s own
     awaited fetches could possibly have completed - resolving (and now
     caching) the plain local default and overwriting whatever `_build()`
     had just correctly painted from cache moments earlier. This is
     almost certainly the literal mechanism behind the household's
     original report for this specific card (their most-used one) - fixed
     by skipping that call on the first `hass` assignment only (repeat
     assignments, where `_settingsCache`/`_globalThemes` are already
     populated from an earlier fetch, still call it as before, so live
     re-resolution on subsequent `hass` updates is unaffected).

  **Tests**: new coverage added to `test_chores_card.js` (the reference
  implementation, written first and fully proven before replicating),
  `test_goals_card.js`, `test_my_chores_card.js`, `test_pantry_card.js`,
  `test_rewards_card.js`, `test_todo_card.js`,
  `test_active_timers_card.js`, `test_recipe_box_card_sharing.js`, and
  `test_screensaver_card.js` - each: a first card resolves some accent
  color after its own load; a second card, mounted before its own `hass`
  is even set, already shows that SAME cached accent (no flash); a card
  with its own `theme_override` gets its own distinct cached entry, which
  a second card with the SAME override also gets instantly; and a card
  with NO override gets the household bucket, not another card's override
  entry. `test_today_card.js` got the same coverage minus the per-device
  tier (this card has none). `test_device_theme_override.js` got a
  dedicated block for `family-week-calendar-card.js` covering the same
  shape via its `_applySizeVars()`/device-override tier, PLUS a specific
  regression check for bug #2 above: assigning `hass` (with a
  `connection.sendMessagePromise` that deliberately never resolves, so no
  fetch can possibly complete) to a freshly-built, already-cached card
  must NOT synchronously clobber the cached theme it's already showing.
  Every test file needed `global.localStorage = dom.window.localStorage;`
  added to its jsdom setup (the new singleton's bare `localStorage`
  references only resolve if mirrored onto Node's own global realm - the
  same `dom.window.eval` quirk documented elsewhere in this file). Full
  existing regression suite (all `test_*.js` and `test_*.py`) re-run
  clean throughout, including after both bug fixes above.

- **v162 (1.125.0)**: Fix — the To-Do Lists card's List(s) tab selection
  (which lists are shown, board layout, and the new Wish List flags) could
  silently fail to survive a page refresh. Household report, verbatim:
  *"seems the list card doesnt save its settings after page refresh."*

  **Diagnosed via a delegated research subagent** first (read-only), which
  traced the actual mechanism rather than guessing: this card's list
  selection lives in its own small backend Store
  (`TODO_CARD_CONFIG_STORAGE_KEY_PREFIX`), keyed by a per-card-instance
  `card_id` that `_ensureCardId()` generates once and tries to persist two
  ways - (1) round-tripped back into the card's own Lovelace config via a
  `config-changed` event (only ever actually heard by Home Assistant
  inside the "Edit Card" dialog, NOT on a normal page view - a known,
  already-documented limitation), and (2) a localStorage fallback keyed by
  `familyHubTodoCardId::<path>::<ordinal>`, where `ordinal` comes from a
  `window.__familyHubTodoCardOrdinal` counter meant to increment once per
  Todo card instance per page load.

  **Root cause**: `_ensureCardId` had no memoization - it only short-
  circuited when `config.card_id` was already a string (i.e. the
  config-changed round trip had actually landed, which on a plain page
  view it never does). Lovelace calls a card's `setConfig` more than once
  per page load in perfectly ordinary situations unrelated to editing (a
  masonry/sections re-layout, switching dashboard views away and back, any
  unrelated config recompute elsewhere on the dashboard) - and every
  REPEAT call, still missing the id, fell through to the SAME ordinal-
  increment-and-mint-a-fresh-random-id logic a genuinely new card would
  use, silently overwriting `this._config.cardId` with a brand new value.
  `_saveListsTab`'s Save always writes under whatever `card_id` is current
  at that moment - so a household could save their selection, see the
  optimistic UI update apply instantly, and still lose it on the very next
  reload if a second `setConfig` call had snuck in beforehand (the
  ordinal/localStorage lookup on THAT reload no longer lines up with
  where the save actually landed).

  **Fix** (`family_hub/card/family-hub-todo-card.js`, `_ensureCardId`):
  added a guard right after the existing `config.card_id` check - `if
  (this._config && typeof this._config.cardId === "string" &&
  this._config.cardId) return this._config.cardId;` - so a repeat
  `setConfig` call on the same element instance reuses whatever id it
  already resolved, rather than re-deriving one every time. The ordinal
  counter now only ever advances once per physical card position per page
  load, exactly as originally intended.

  **Tests**: new coverage in `test_todo_card.js` - a second `setConfig`
  call with no `card_id` (simulating the exact "repeat call, round trip
  never landed" scenario) reuses the same `card_id` and does NOT advance
  the ordinal counter again; a genuinely different card element still
  gets its own distinct id (confirms the fix doesn't collapse every card
  into sharing one). Full existing regression suite re-run clean.

- **v161 (1.124.0)**: Another follow-up to Wish Lists (v1.122.0). Household
  ask, verbatim: *"we need to make the wishlist modal be able to upload an
  image."*

  **Researched first** (via a delegated subagent) whether this codebase
  already had an established local-file-upload pattern to replicate - it
  does not. The ONLY `file_upload` component usage anywhere in the repo is
  `config_flow.py`'s `_read_uploaded_zip_bytes` (restoring a Settings
  backup .zip), which only works inside Home Assistant's own Config Flow
  UI via `selector.FileSelector` + `homeassistant.components.file_upload.
  process_uploaded_file` - not reachable from a card at all, no websocket
  or HTTP view wraps it. The closest thing to "image upload" is the Grocy
  recipe-photo path (`__init__.py`'s `_grocy_api_upload_file`/
  `_grocy_api_get_file_bytes`), which is a server-to-server fetch-and-PUT
  to Grocy's own file API, not a browser file-picker flow, and Wish Lists
  has no Grocy-equivalent storage backend to PUT to anyway.

  **Design decision**: rather than build a new backend websocket upload
  command plus a place on disk to keep the files (real new surface area
  for what's a small convenience), the picked photo is read via
  `FileReader.readAsDataURL` and downscaled entirely CLIENT-SIDE (draw
  onto an off-screen `<canvas>` at max 480px on the long edge, re-encode
  via `canvas.toDataURL("image/jpeg", 0.72)`) into a `data:` URL, written
  straight into the SAME `image` field a pasted Image URL already fills
  (see `_buildWishlistDescription`/`_parseWishlistDescription` from
  v1.122.0) - a `data:` URL renders in `<img src>` identically to an
  `https://` one, so no other part of the wishlist feature (rendering,
  the description-field JSON-tail encoding, the hidden-from-owner claim
  logic) needs to know the difference, and there's no new backend command
  or storage location at all. Downscaling is best-effort only: a short
  1.5s timeout alongside the `Image` element's own `onload`/`onerror`
  falls back to the original, un-downscaled data URL if canvas 2D context
  is unavailable, decoding fails, or nothing fires in time - notably this
  project's own jsdom test suite, which stubs out real image decoding
  entirely, always takes this fallback path.

  **Frontend** (`family_hub/card/family-hub-todo-card.js`): new
  `_wishlistImageDataUrlFromFile(file)` (the read+downscale) and
  `_wireWishlistImageUpload(fileInput, textInput, previewEl, statusEl)`
  (wires a hidden `<input type="file" accept="image/*">` behind a styled
  "Upload photo…" label, plus a small thumbnail preview and status text -
  also wires the existing Image URL text input's own `input` event so
  typing a URL by hand updates the same live preview, keeping "paste a
  link" and "upload a photo" feeling like one field). Reused as-is by
  both the Add modal (`_renderAddItemTab`) and the item detail modal
  (`_openItemDetailModal`) - same shared method, different DOM node
  references passed in.

  **Tests**: new coverage in `test_todo_wishlist.js` - the Upload photo
  control shows/hides exactly alongside the existing Link/Image fields;
  picking a file fills the Image URL field with a `data:image/png` URL
  and shows the preview; uploading makes NO backend/websocket call
  whatsoever (confirms this is genuinely client-side only); typing a URL
  by hand also updates the preview. The test harness needed `FileReader`/
  `Image`/`File` mirrored onto Node's global object alongside `document`/
  `window` (same `dom.window.eval` runs-in-Node's-own-realm quirk this
  project's test files already work around for those) - see
  `test_todo_wishlist.js`'s own comment where they're added. Full existing
  regression suite re-run clean.

- **v160 (1.123.0)**: Small follow-up to Wish Lists (v1.122.0, directly
  above). Household ask, verbatim: *"can we add a tag to the wish lists
  like we do Grocy lists?"* `_columnHtml` in `family-hub-todo-card.js` now
  renders a `wishlistTag` (`<span class="todo-column-source-tag wishlist-
  column-tag">Wish List</span>`) in the column header whenever `_isWishlist
  List(key)` is true, right alongside the existing `grocyTag` - same
  element/class as the Grocy tag (`.todo-column-source-tag`) for the base
  look, plus a small `.wishlist-column-tag` rule overriding just the
  background color (`var(--fc-accent3)` instead of Grocy's `--fc-accent2`)
  so the two read as distinct at a glance on a board that has both kinds
  of tagged column. New checks in `test_todo_wishlist.js` (the tag
  appears with the right text on a flagged column; a non-flagged column
  gets none). Full existing regression suite re-run clean.

- **v159 (1.122.0)**: Feature — Wish Lists, built entirely on top of Home
  Assistant's native `todo.*` list functionality (no new parallel storage
  system for the items themselves). Household ask, verbatim: *"home
  assistant has native list functionality and we use it a lot in family
  Hub but it's not super robust. I want to use the native list
  functionality to be able to do wish lists link name image description
  that kind of thing but all built on top of the native list
  functionality. I think that we can embed most of this data into the
  description of a list but we will need a way to make a list a wish list
  and display it as such in the list card."*

  Three design decisions were clarified with the household up front
  (AskUserQuestion, all three answered with the recommended option):
  **claiming** — yes, per-item "claimed by" status, hidden from the wish
  list's own owner (visible to everyone else) — classic gift-registry
  behavior, with an acknowledged limitation that the owner could still see
  raw claim data by opening the same list in HA's own built-in Todo UI,
  since this is a genuinely native HA list, not something Family Hub
  fully controls access to; **encoding** — readable text + a small JSON
  tail: an item's free-text note stays plain, human-readable text at the
  top of the native `description` field, with a compact JSON blob for
  link/image/claim data appended after a marker line, so HA's own Todo
  UI, voice assistants, and phone widgets keep seeing normal readable
  notes and simply ignore the tail as unread trailing text; **flag
  scope** — global, per todo entity, via a new small dedicated backend
  Store (`TODO_WISHLIST_CONFIG_STORAGE_KEY_PREFIX` in const.py, following
  this project's established "one small dedicated Store per feature"
  convention — see `TODO_CARD_CONFIG_STORAGE_KEY_PREFIX`'s own comment for
  the historical bug that convention exists to avoid), so a list is a wish
  list everywhere it's shown, not just on one card placement.

  **Backend** (`family_hub/const.py`, `family_hub/__init__.py`): a new
  `todo_wishlist_config_store` (shape `{"<todo entity_id>": {"ownerUserId":
  "<HA user id>"}}` — only flagged entities appear as keys at all) plus
  two new websocket commands: `family_hub/get_wishlist_config` (returns
  every flagged entity + its owner) and `family_hub/set_wishlist_flag`
  (entity_id + is_wishlist bool — turning it ON (re-)stamps `ownerUserId`
  as the CALLING websocket connection's own signed-in user, `connection.
  user.id`, never a value the frontend supplies itself; turning it OFF
  removes the entity's key entirely).

  **Frontend** (`family_hub/card/family-hub-todo-card.js`): `WISHLIST_DATA_
  MARKER` + `_parseWishlistDescription`/`_buildWishlistDescription`
  (module-level, exposed on `window` for direct unit testing) do the
  encode/decode — a description with no marker parses as 100% plain note
  with no link/image/claim (every item before its list became a wish
  list), and a marker whose JSON tail doesn't parse falls back the same
  way rather than breaking the render. `_fetchWishlistConfig`/
  `_isWishlistList`/`_isWishlistOwner` mirror the existing `_fetchTodoCard
  Config` pattern. A wish-list column's items render via a new
  `_wishlistItemHtml` (image thumbnail or placeholder, note, a View link,
  a Claim/Claimed button — the claim button/status is left off entirely
  for the list's own owner) instead of the plain checklist row. Claiming
  (`_toggleWishlistClaim`) reads the item's current description, flips
  only the claim fields, and writes it back via `todo.update_item` -
  optimistic like every other mutation on this card. The item detail modal
  and the Add modal both grow Link/Image fields, shown only for a todo.*
  entity that's both flagged as a wish list AND supports the native
  `description` field at all (`TODO_FEATURE_DESCRIPTION`) - the whole
  scheme depends on that field being writable. The List(s) tab grows a
  small "Wish list" checkbox next to each todo.* entity row, saved via
  `family_hub/set_wishlist_flag` (only for entities whose checkbox
  actually changed, not a blanket resend).

  **Tests**: new `test_todo_wishlist.py` (backend store/flag handlers -
  empty-by-default, owner stamped from the connection not the payload,
  OFF removes the key, re-flagging by a different user reassigns
  ownership, non-todo.* entity_id rejected, two entities stay independent)
  and new `test_todo_wishlist.js` (encode/decode round-trips including a
  corrupted tail falling back gracefully; a non-flagged list renders
  exactly as before - regression coverage; a flagged column renders gift-
  registry cards; claiming/releasing and the backend call it produces;
  a second household member sees "Claimed by X" and can't claim an
  already-claimed item; the SAME item shows no claim UI at all to the
  list's own owner; the List(s) tab checkbox and its selective save; the
  Add modal's Link/Image fields appearing only for a wish-list selection).
  Full existing regression suite (all `test_*.js`/`test_*.py`) re-run
  clean alongside it.

- **v158 (1.121.0)**: Fix — the Grocy Recipe Viewer opened from the
  standalone Recipe Box card now actually renders full-screen. Household
  report, verbatim: *"recipe card opens recipes in a modal instead of the
  full screen like the recipe modal does."*

  **Root cause**: the viewer's CSS (`.grocy-recipe-viewer-overlay` et al,
  part of `window.__familyHubRecipeBoxShared`) has always used
  `position: fixed` sized to `100vw`/`100vh` to render full-screen, and
  that CSS is byte-identical (confirmed via diff) between
  `family-hub-recipe-box-card.js` and `family-week-calendar-card.js` - so
  the divergence in behavior was never a CSS bug. `position: fixed` is
  positioned relative to the initial containing block (the real viewport)
  *unless* some ancestor establishes a new containing block (`transform`,
  `filter`, `contain`, `will-change: transform`, etc.), in which case it
  behaves like `position: absolute` relative to THAT ancestor instead. The
  calendar card is normally deployed as a Home Assistant panel-view
  dashboard, which fills the whole screen on its own, so even if some
  ancestor were doing this, the effect would be invisible - the "trapped"
  box already IS the full screen. The Recipe Box card is normally placed
  as one card among others in a masonry/sections grid, where Home
  Assistant's own dashboard grid container does establish exactly this
  kind of containing block (for virtualization/performance) - trapping
  the overlay inside a card-sized box instead of the real viewport. This
  integration had already diagnosed and fixed the IDENTICAL problem once
  before, for the screensaver overlay (`family-screensaver-card.js`'s
  `_ensureScreenSaverOverlay`, comment: "position:fixed actually reaches
  the real viewport instead of getting trapped inside a containing block
  further up the tree") - this fix follows that exact established
  pattern.

  **Fix**: a new shared method, `_grocyViewerOverlay()` (added to
  `window.__familyHubRecipeBoxShared`, so both cards get it identically),
  promotes the `.grocy-recipe-viewer-overlay` element out of the card's
  shadow root onto `document.body` the first time the viewer is opened,
  lazily, and caches the reference afterward (`this.
  _grocyRecipeViewerOverlayEl`). Every one of the ~40 query call sites
  across the shared block's 15 Grocy-viewer methods that used to read
  `root.querySelector(".grocy-recipe-viewer-*")`/`this._root.querySelector
  (...)` now goes through this accessor instead, since once moved the
  element is no longer a descendant of the shadow root at all. One
  additional stray call site outside the shared block,
  `family-week-calendar-card.js`'s own `_recipeViewOpen()` (used to
  decide whether the screensaver should be suppressed while a recipe is
  open), needed the same fix.

  **The one thing a bare move doesn't get for free**: this overlay's
  entire look comes from the card's own shadow-root `<style>` (`._css()`)
  - CSS defined inside a shadow root only ever applies to elements still
  inside that same shadow tree, so moving the bare element to
  `document.body` on its own would leave it completely unstyled (no
  colors, no layout, nothing). Fixed by wrapping the moved element in a
  small "portal" `<div class="fh-grocy-viewer-portal">` that carries its
  own `<style>` - a copy of the card's ENTIRE `_css()` output, with the
  one substitution it needs: `:host` (which only ever matches the actual
  shadow host, meaningless outside a shadow root) swapped for the portal
  wrapper's own class, which plays the identical "single top-level
  selector" role. That reproduces every rule and every `:host`-declared
  CSS variable DEFAULT correctly. What it does NOT capture on its own:
  the household's actual chosen THEME, which `_applyThemeVars()` applies
  as a live INLINE override of the same `--fc-*` variables directly on
  the card element itself (`this`) - a completely different DOM node the
  portal, now living outside this card's tree, no longer inherits from.
  So `_grocyViewerOverlay()` also re-copies the current computed value of
  every one of those theme variables (`--fc-bg`, `--fc-card`, `--fc-
  border`, `--fc-text`, `--fc-text-secondary`, `--fc-accent`, `--fc-
  accent-text`, `--fc-accent2`, `--fc-accent3`, `--fc-surface-alt`, `--fc-
  surface2`, `--fc-glass-blur`, plus `--fh-header-offset` for the
  calendar card's kiosk-mode header height) from `this` onto the portal
  on EVERY call, not just the first move - so a viewer left open across a
  theme change stays visually correct rather than freezing on whatever
  theme was active the first time it moved.

  **Cleanup**: since the portal lives on `document.body`, entirely
  outside the card's own DOM, each card's own `disconnectedCallback()`
  now explicitly removes it - otherwise a dashboard edit or Lovelace
  simply re-creating the card element would leave an orphaned full-screen
  overlay floating on the page forever.

  **New/updated test coverage**: a new test block in
  `test_recipe_box_card_sharing.js` proves the overlay actually leaves the
  shadow root once opened, lands inside its own portal wrapper (with its
  own `<style>`) as a direct child of `document.body`, still renders
  correctly once relocated, reuses the same element on reopen rather than
  duplicating it, and that two separate card instances on the same
  dashboard keep entirely separate portals rather than colliding. Every
  existing test that used to reach into `el._root.querySelector(".grocy-
  recipe-viewer-*")` directly (`test_grocy_recipe_viewer.js`,
  `test_grocy_recipe_viewer_day_editor.js`,
  `test_grocy_recipe_viewer_tabs.js`, `test_meal_view_card.js`,
  `test_recipe_box_card_sharing.js`) was updated to go through
  `el._grocyViewerOverlay()` instead, matching the new architecture. Full
  existing regression suite (30 test files total after this session's
  other additions) re-run clean.

- **v157 (1.120.0)**: Feature — the Active Timers card shows every running
  timer in the house, not just Family Hub's own. Household ask, verbatim:
  *"can we make the timers card show all active timers not just from
  family hub."*

  **Design**: rather than a second polling/storage system, the card's
  existing `family_hub/timers/list` result (its own chore/reward/
  standalone timers) is now merged, purely client-side, with every OTHER
  `timer.*` domain entity currently sitting in `state === "active"` in
  `hass.states` — a new `_foreignTimerEntities()` scans for them, a new
  `_allTimers()` is what `_render()`/`_renderTimerCountdowns()` now read
  instead of `this._timers` directly. An entity Family Hub has itself
  adopted for one of its own tracked timers (`timer.entity_id` — see
  `_ensureTimerHelpers`/`timer_engine.py`'s own `entity_id` field) is
  explicitly excluded from the foreign scan, since it's already shown as
  its own full Family Hub timer card.

  A foreign entry is a synthetic object with a `"ha:<entity_id>"` uid,
  `kind: "native"`, and a `foreign: true` marker: its title comes from the
  entity's own `friendly_name` (falling back to a humanized entity id,
  e.g. `timer.family_movie_night` → "Family Movie Night"), its remaining
  time reuses `_timerRemainingSeconds`'s existing `finishes_at`-attribute
  path completely unchanged (that path already worked for ANY entity_id,
  not just Family Hub-adopted ones — it just never had anything routed
  into it before), and its total-length label comes from a new
  `_parseHaDurationMinutes()` parsing the entity's own `"HH:MM:SS"`
  `duration` attribute.

  Because there is no ownership model at all for an arbitrary HA entity
  (unlike a Family Hub timer, which always has a `user_id` or is
  explicitly "the room's"), a foreign card renders with the same neutral/
  unassigned tinting PLUS a dashed border (`.foreign-timer` — vs. Family
  Hub's own solid-border cards) and a "HA Timer" kind label, and its Stop
  button is admin-only (`_canCancelTimer` returns `false` outright for
  `kind === "native"` on anyone non-admin). Clicking it
  (`_cancelTimer`, branching on the `"ha:"` uid prefix) calls the plain
  `timer.cancel` service via `this._hass.callService("timer", "cancel",
  {}, { entity_id })` directly against that entity — never
  `family_hub/timers/cancel`, which has no record of a foreign timer at
  all.

  **Staying live without a new poll**: `_renderTimerCountdowns()` (the
  existing 1-second ticker) now also diffs the SET of currently-rendered
  timer uids against `_allTimers()`'s current set on every tick; any
  mismatch (a foreign entity someone else's automation just started or
  stopped, invisible to `family_hub/timers/list`) triggers an immediate
  full `_render()` rather than waiting on the next 20-second
  `family_hub/timers/list` poll or trying to patch one card in and out of
  the DOM by hand.

  **New test coverage**: `test_active_timers_foreign.js` — a foreign
  active entity appears on the board; a friendly_name-less entity falls
  back to a humanized label; idle/paused foreign entities are excluded;
  an entity Family Hub already adopted is never shown twice; Stop is
  admin-only on a foreign timer and calls `timer.cancel` directly (never
  `family_hub/timers/cancel`); and the per-second ticker itself notices a
  foreign timer appearing and disappearing with no
  `family_hub/timers/list` poll involved. Full existing regression suite
  (28 JS + 3 Python test files after this session's other additions)
  re-run clean alongside it.

- **v156 (1.119.0)**: Feature — timer alarms. Household ask, verbatim:
  *"How do we use someones notify device to set off an alarm like audio or
  vibration alarm that they have to click to turn off on their phone when
  a timer goes off, like end of a chore or reward"*, followed by *"route
  this through alarm notifications for the person the timer is for, if
  it's started by a device with a kiosk still open can we make sounds and
  pop up a modal that requires you to click stop?"*

  **Research** (answered before writing any code): the HA Companion App
  exposes exactly two "bypass silent mode" delivery mechanisms, one per
  platform, both driven by the notify `data` payload rather than anything
  Family Hub has to build itself — Android's `channel: "alarm_stream_max"`
  (routes the notification sound through the phone's Alarm audio stream at
  max volume, the same stream a real alarm clock uses) and iOS Critical
  Alerts (`push.sound.critical` / `push["interruption-level"]: "critical"`,
  gated behind an Apple entitlement Nabu Casa/HA Cloud push already has,
  self-hosted does not without applying to Apple directly). Neither
  platform has a push type that itself demands a tap to silence — that
  "must tap Stop" experience has to be the client-side modal instead.

  **Two design decisions confirmed via clarifying questions before
  building**:
  1. *Scope* — "Only the originating tab" (not every kiosk screen logged
     in as that person). Implemented via a `sessionStorage`-backed per-tab
     `client_id`, generated once and stable across a reload of the SAME
     tab but gone once that tab actually closes — sent on every
     `family_hub/timers/start_chore|start_reward|start_standalone` call
     and echoed back onto the timer as `origin_client_id` so the tab that
     started it (and only that tab) recognizes "this one's mine" on its
     own local per-second countdown, no backend round-trip needed.
  2. *Default* — "Opt-in per user" via a new `notifyTimerAlarm` profile
     flag (Settings → per-person notifications → "One of my timers goes
     off"), off by default, same shape/pattern as the existing
     `notifyChoreApproved`/`notifyRewardClaimed`/etc. flags. Snapshotted
     onto the timer at start time (`alarm` field), same "snapshot, don't
     re-check later" convention as `title`/`notify_targets`.

  **Backend** (`timer_engine.py`, `chores_websocket_api.py`, `const.py`,
  `__init__.py`): `start_timer()` gained `alarm`/`client_id` params that
  land on the stored timer as `alarm` (bool) and `origin_client_id`
  (stripped string); a new `_timer_alarm_enabled_for_user()` raw-reads the
  profile flag the same way `_notify_targets_for_user()` reads
  `notifyTargets`; a new `_send_alarm_notification()` mirrors
  `_send_instant_notification()`'s best-effort per-target send loop but
  with the enriched Android/iOS alarm `data` payload; all three firing
  paths (`_fire_chore_timer`/`_fire_reward_timer`/`_fire_standalone_timer`)
  branch on `timer.get("alarm")` to pick which sender to use.

  **Frontend** (`family-hub-chores-card.js`, `family-hub-rewards-card.js`,
  `family-hub-active-timers-card.js` — the three cards that actually start
  timers — plus a `notifyTimerAlarm` checkbox added to
  `family-week-calendar-card.js`'s per-person notification profile editor):
  a new shared `window.__familyHubTimerAlarm` singleton (same
  window-singleton-guarded-by-`if (!window.X)` pattern as
  `__familyHubRecipeBoxShared`/`__familyHubFabCoordinator`/
  `__familyHubKioskSession`/`__familyHubScreenSaver`) owns a full-screen
  modal (Web Audio API repeating beep, no bundled sound asset needed) and
  a `check(timers, clientId, remainingSecondsFn)` entry point hooked into
  each card's existing per-second `_renderTimerCountdowns()` ticker —
  fires only for a timer that is BOTH `alarm: true` AND
  `origin_client_id === clientId`, only once its locally-computed
  remaining time hits zero, and never re-fires for a timer uid once its
  Stop button has been tapped (dismissal is per-timer, not global — a
  second alarm timer in the same tab can still pop after an earlier one
  was dismissed). Each of the three cards got a small `_familyHubClientId()`
  helper (reads/creates the `sessionStorage` id) and now sends
  `client_id: this._familyHubClientId()` on its own timer-start call.

  **Tests added**: `test_timer_alarm.py` (backend — the new
  `start_timer` fields default off/carry through/coerce correctly,
  `_timer_alarm_enabled_for_user` reads the flag and defaults false for no
  user/no profile/missing flag, `_send_alarm_notification`'s payload and
  best-effort-per-target behavior, and the three `_fire_*_timer` functions'
  alarm-vs-instant branching) and `test_timer_alarm_frontend.js`
  (frontend, jsdom — all three cards send a non-empty, tab-stable
  `client_id`; the shared singleton fires only for "my tab + alarm:true +
  remaining:0", never for another tab's timer or a non-alarm timer, never
  double-fires on a repeat check, dismissal sticks per-timer-uid but
  doesn't block a different timer). Full existing regression suite (26 JS
  + 3 Python test files) re-run clean alongside these.

- **v155 (1.118.0)**: Feature — the standalone Recipe Box card
  (`family-hub-recipe-box-card.js`) now opens the real, live in-card Grocy
  Recipe Viewer for a Grocy-linked dish, instead of just opening the
  plain external `grocy.link`. Household report, verbatim: *"the recipe
  box card tries to send you to the external grocy link for recipes. this
  needs to use the internal recipe viewer."*

  **Why it was like that**: this card's own top-of-file comment
  (unchanged from v1.110.6, when the card was created) explicitly called
  out "the full in-card Grocy Recipe Viewer" as "out of scope for this
  card (large, calendar-entangled subsystems)" and had its own
  `_openGrocyRecipeViewer(recipeId, fallbackName, fallbackLink)` stub that
  just did `if (fallbackLink) window.open(fallbackLink, "_blank",
  "noopener")` - the real, full implementation
  (`_openGrocyRecipeViewer`/`_closeGrocyRecipeViewer`/
  `_consumeGrocyRecipeIngredients`/`_fetchGrocyRecipeDetail(sBatch)`/
  `_renderActiveGrocyRecipeViewerTab`/`_switchGrocyRecipeViewerTab`/
  `_renderGrocyRecipeDetail`/`_renderGrocyRecipeDescription`/
  `_scaleIngredientsDescriptionHtml`/`_parseQuantityToken`/
  `_formatScaledQuantityToken`/`_renderGrocyRecipeIngredients`/
  `_formatScaledIngredientAmount`/`_adjustGrocyRecipeViewerServings` - 15
  methods, ~550 lines) lived only on `FamilyWeekCalendarCard.prototype`,
  never shared.

  **Fix**: rather than reimplement a second, separately-maintained copy
  (which would drift from the calendar card's over time, the exact
  failure mode this project's Recipe Box sharing architecture exists to
  prevent - see `family-hub-recipe-box-card.js`'s own top comment on
  `window.__familyHubRecipeBoxShared`), moved all 15 methods bodily into
  that same shared singleton object (defined byte-for-byte identically in
  both card files, guarded by `if (!window.__familyHubRecipeBoxShared)`,
  `Object.assign`'d onto both prototypes) - the exact established pattern
  already used for `_renderLoved`/`_upsertDish`/`_deleteDish`/etc. Checked
  first that every one of these 15 methods only ever touches `this._hass`,
  `this._root`, `this._openModal`, `this._resetScreenSaverIdleTimer`, and
  their own `this._grocyRecipeViewer*` state fields - all things both
  cards already have - so nothing else needed to move. Deliberately NOT
  shared: `_selectGrocyRecipe`/`_renderGrocyPicker` (the "Add from Grocy"
  SEARCH picker, a different feature - browsing/adding new dishes from
  Grocy, which the Recipe Box card has never supported and still doesn't).

  `family-hub-recipe-box-card.js` also needed, added fresh for this card:
  the `.grocy-recipe-viewer-overlay` markup (copied verbatim from the
  calendar card's own template - same classes, same structure) inserted
  between its existing `.dish-detail-overlay` and `.rb-editor-overlay`;
  the matching CSS (~100 lines, copied verbatim, plus the generic
  `.accordion-toggle`/`.accordion-body`/`.accordion-chevron`/
  `.theme-section-label` base rules the ingredients-accordion sub-feature
  needs, which this card never had before since it had no accordions);
  and its own copy of the 7-line click-wiring block (close/back/tabs/
  open-in-grocy/consume/scale buttons) in its own `_build()`, since the
  two cards' overlays are separate DOM trees even though the methods that
  populate them are the exact same shared functions. Removed the now-dead
  `_openGrocyRecipeViewer` stub from `FamilyHubRecipeBoxCard`'s own class
  body (Object.assign would have silently overwritten it anyway, but
  leaving a stub with a docstring claiming "out of scope" right next to
  the real Object.assign'd version would have been actively misleading to
  a future reader).

  Both files' top-of-file comments updated to reflect that the viewer is
  no longer out of scope - only the search picker still is.

  New test in `test_recipe_box_card_sharing.js`: a Grocy-linked dish's
  recipe link opens `.grocy-recipe-viewer-overlay` (not `window.open`),
  fetches live detail via `family_hub/get_grocy_recipe_detail` with the
  right `recipe_id`, and its own Close button works - stubbing
  `window.open` for the duration of that one check to prove it's never
  called. Full JS test sweep (every `test_*.js` in the workspace) green
  after the change, including `test_recipe_box_card_sharing.js`'s own
  Function-identity check, which now also covers these 15 newly-shared
  methods (53 shared methods total, up from 38).

- **v154 (1.117.0)**: Fix — full-card sizing audit following v1.116.0's
  Chores/Rewards header fix. Household request, verbatim: *"can you check
  across all the cards?"*

  Compared `.title` and header-action-button CSS across every board-style
  card: `family-hub-chores-card.js`, `family-hub-rewards-card.js`,
  `family-hub-goals-card.js`, `family-hub-todo-card.js`, `family-hub-
  active-timers-card.js`, `family-hub-pantry-card.js`.

  **Found and fixed**:
  - `family-hub-pantry-card.js`'s `.title` was still `font-size: 20px` -
    its own in-file comment ("see family-hub-chores-card.js's own
    ha-card/.header/.board rules, which these are copied from") confirms
    it was deliberately copied from Chores at some point and simply never
    updated when Chores's rule was fixed in v1.116.0 (or diverged before
    that). Changed to 18px, matching Chores/Rewards/Goals/To-Do.
  - `.add-timer-btn` (Active Timers' "+ Start Timer" header button) used
    `border-radius: 10px; padding: 8px 12px; font-size: 13px`, while
    `.add-stock-btn`/`.add-extra-btn` (Pantry's "+ Add stock") - the only
    other card with an inline accent-colored CTA button living directly
    in the header rather than a floating FAB - use `border-radius: 12px;
    padding: 10px 16px; font-size: 14px`. Brought Active Timers' button
    up to match Pantry's exactly.

  **Checked and confirmed already consistent (no change needed)**:
  - All five floating "+" FABs (`.add-chore-fab`, `.add-goal-fab`,
    `.add-todo-fab`, `.add-reward-fab`, and the calendar's
    `.add-event-fab`) are byte-for-byte identical CSS rules already -
    same size/radius/color/shadow/transition/fab-position override.
  - `family-hub-my-chores-card.js`'s `.title` and `family-today-card.js`'s
    `.date-title` / `family-week-calendar-card.js`'s `.week-label` all use
    `font-size: var(--fs-header-title, 15px)` rather than a fixed pixel
    value - this is a separate, older, deliberate system (see v122/
    1.87.0's "My Chores card's heading hardcoded to 18px" fix) tied to
    Theme Builder's configurable "Header title" font setting, not
    something that should be unified with the fixed-18px cards.

  Verified via `node --check` on both changed files plus
  `test_pantry_card.js` and `test_timers_cards.js` (both pre-existing,
  neither asserts exact CSS pixel values, both pass unmodified).

- **v153 (1.116.0)**: Fix — Chores card header title and header buttons
  rendered visibly larger than the Rewards card's. Household report,
  verbatim: *"chores and rewards buttons and header titles are different
  sizes can you look into why?"*

  **Root cause**: `family-hub-chores-card.js`'s `.title` rule was
  `font-size: 20px`, while `family-hub-rewards-card.js`, `family-hub-
  goals-card.js`, `family-hub-todo-card.js`, and `family-hub-active-
  timers-card.js` all use `font-size: 18px` for the same `.title` class -
  20px was the outlier, not the standard. Separately, the Chores card's
  three header action buttons (`.waiting-recur-toggle-btn`,
  `.rewards-toggle-btn`, `.kiosk-login-btn`) never declared their own
  `font-size`, so they rendered at the card's larger ambient body text
  size, and used `border-radius: 14px` / `padding: 8px 12px` - Rewards'
  equivalent buttons (`.manage-stars-btn`, `.manage-btn`, its own
  `.kiosk-login-btn`) all explicitly set `font-size: 12px`,
  `border-radius: 12px`, `padding: 6px 12px`.

  **Fix**: `family-hub-chores-card.js` - `.title` to 18px; `.waiting-
  recur-toggle-btn`, `.rewards-toggle-btn`, `.kiosk-login-btn` all now set
  `font-size: 12px`, `border-radius: 12px`, `padding: 6px 12px`, matching
  Rewards pixel-for-pixel (border style/color left as-is - both cards'
  `.kiosk-login-btn` already used the same `1px solid var(--fc-border)`).
  Purely visual - no markup, class names, or behavior changed, so no test
  assertions needed updating; `test_chores_card.js` and `test_kiosk_login
  _chores_card.js` both still pass unmodified.

- **v152 (1.115.0)**: Fix — star history unreachable from the new Manage
  Stars modal. Household report, verbatim: *"the new stars modal doesn't
  have the star history on it we need to bring this back."*

  **Root cause**: v1.110.7 deliberately changed the click-routing logic
  (`if (this._hasPermission("can_override_rewards")) return
  this._openManageStarsModal(...); return this._openStarHistoryModal(...);`)
  so that tapping a person's name/balance opens Manage Stars instead of
  Star History for anyone with `can_override_rewards` - itself an explicit
  prior household ask ("clicking the name itself now opens the Manage
  Stars modal pre-selected to that person"). That change didn't add any
  replacement path back to Star History for those users, so admins/
  override users lost the ability to view history from that tap.

  **Fix (additive, not a revert)**: v1.110.7's routing was a deliberate,
  requested change, so reverting it would remove functionality the
  household asked for. Instead, `_openManageStarsModal` in
  `family-hub-rewards-card.js` now renders a "📋 View star history" link
  (`.manage-stars-history-btn`) right under the Who picker. Clicking it
  reads the currently-selected user id out of `.manage-stars-user`, closes
  Manage Stars (`_closeManageStarsModal`), and opens Star History for that
  id (`_openStarHistoryModal`) - so it follows whichever person is
  selected in the dropdown, not just whoever the modal originally opened
  for. The pre-existing ✎ per-person Manage Stars button and the non-
  admin name-tap-opens-history behavior are both untouched.

  Tested in `test_rewards_card.js`: clicking a name opens Manage Stars
  pre-selected, switching the Who picker to a different person and
  clicking "View star history" closes Manage Stars and opens Star History
  for the *newly selected* person (not the originally-clicked one), and
  the history modal's close button still works normally afterward.

- **v151 (1.114.0)**: Feature — multi-recipe tabs in the Grocy Recipe
  Viewer. Household request, verbatim: *"the meal cards already support
  multi recipe, now if they have multiple recipes and there is more than
  1 in grocy, opening one should display all the recipes in grocy for
  that meal card as tabs so you can quickly switch between tabs to see
  all the recipes for that meal."*

  **Data model** (pre-existing, not new): a meal block already has a main
  `grocyRecipeId` plus an `additionalRecipes` array of `{name, link,
  grocyRecipeId}` entries (sides/sauces/desserts) - `additionalRecipes`
  is what the household meant by "already supports multi recipe." Before
  this feature, opening the Recipe Viewer only ever showed the ONE recipe
  it was called with - `additionalRecipes` entries were only reachable
  one at a time as separate links (`.mvar-link` in view mode, `.additional
  -recipe-name.has-link` rows in edit mode), each click replacing whatever
  was in the viewer rather than showing everything together.

  **Backend** (`family_hub/__init__.py`): the single-recipe fetch/assemble
  logic inside `_ws_get_grocy_recipe_detail` was extracted into a shared
  `_fetch_one_grocy_recipe_detail(session, url, api_key, recipe_id,
  get_products_units)` helper, so a new batch handler could reuse it
  without duplicating ~150 lines of ingredient-resolution/photo-fetch/
  prep-cook-time-parsing logic that the two calls must never disagree
  about. New `family_hub/get_grocy_recipe_details` (plural) websocket
  command (`_ws_get_grocy_recipe_details`) takes `recipe_ids: [int]`,
  de-dupes them, fetches every recipe CONCURRENTLY via `asyncio.gather`,
  and returns `{"configured", "recipes": {"<id>": {...}}, "errors":
  {"<id>": "message"}}` - successful and failed ids are kept in separate
  dicts (not a null mixed into `recipes`) so the frontend can tell "no
  such tab" apart from "this tab failed to load."

  `get_products_units` is a lazily-fetched-once-per-call closure
  (`_make_grocy_products_units_loader`, `asyncio.Lock`-guarded so
  concurrent `asyncio.gather` tasks can't each trigger their own redundant
  fetch) rather than pre-fetched dicts passed straight in - this
  preserves an existing, already-tested optimization: a recipe id that
  turns out not to exist in Grocy should never cost 2 extra requests
  resolving ingredients for a recipe that isn't there, and for the batch
  handler specifically, the two lists should still only ever be fetched
  ONCE no matter how many of the batch's recipe ids actually exist. Caught
  via `test_grocy_recipe_detail.py`'s pre-existing `test_recipe_not_found`
  regressing during an early version of this refactor that fetched
  products/units unconditionally up front - fixed by moving to the lazy
  closure instead of reordering by hand for each caller.

  **Frontend** (`family-week-calendar-card.js`): `_openGrocyRecipeViewer`
  gained an optional 5th `tabs` param - an array of `{id, name}` covering
  every Grocy recipe a meal resolves to (main first). 2+ entries render a
  new `.grocy-recipe-viewer-tabs` row (same button-row idiom as
  `.shopping-tabs`/`.settings-tabs` elsewhere in this file - a flex row of
  buttons, one `.active`, built dynamically since a meal's recipe count
  varies) and switch to the batch fetch (`_fetchGrocyRecipeDetailsBatch`)
  instead of the single-recipe one; 0-1 entries (including every
  pre-1.114.0 call site - additional-recipe single-item links, Expiring
  Soon suggestion chips, Recipe Box dish detail, the picker preview icon -
  none of which pass `tabs` at all) render no tab row and behave exactly
  as before. Tab clicks (`_switchGrocyRecipeViewerTab`, delegated on the
  tabs container since its buttons are rebuilt fresh per open - same
  reason `.additional-recipes-list`'s own handler is delegated) never
  re-fetch anything, just swap which already-cached recipe's data feeds
  the existing `_renderGrocyRecipeDetail` render targets
  (`_renderActiveGrocyRecipeViewerTab`, shared between the initial batch-
  fetch callback and tab-click handling so there's one render path, not
  two). A failed tab (present in the batch response's `errors`, not
  `recipes`) shows a friendly per-tab status message with every render
  target cleared, rather than stale data from whichever tab loaded before
  it or a broken-looking blank panel.

  New `_buildGrocyRecipeViewerTabsForCurrentMeal()` helper (main recipe id
  from `this._currentGrocyRecipeId`/the name field, plus every entry in
  `this._editingAdditionalRecipes` - the meal editor's own live
  in-progress additional-recipes state - that has a `grocyRecipeId`) is
  shared by all three meal-editor entry points that can open the viewer:
  the main "View Recipe" button (`_openCurrentMenuLink`), the view-mode
  additional-recipe link list, and the edit-mode additional-recipes list -
  so no matter WHICH of a meal's recipes someone opens from, they see the
  exact same complete tab set, with the one they clicked pre-selected as
  active.

  New test coverage: `test_grocy_recipe_viewer_tabs.js` (new file - tab
  rendering/ordering/active-state, the batch call used instead of N
  single calls, tab switching purely from cache with zero extra
  websocket traffic, per-tab error handling that doesn't disturb other
  tabs, the single-recipe-meal "no tab row" regression case, a
  single-entry `tabs` array also collapsing to no tab row, an
  additional-recipe-with-only-a-plain-link never becoming a tab or
  triggering a Grocy fetch, and the end-to-end `_openCurrentMenuLink`
  path building tabs from the meal editor's own live state) and 5 new
  batch-handler tests in `test_grocy_recipe_detail.py` (not-configured,
  products/units fetched exactly once across a multi-recipe batch,
  duplicate recipe ids de-duplicated to one fetch, success/error
  separation, and no wasted products/units call when every id in the
  batch is missing). Full existing suite (`test_recipe_box.js`,
  `test_meal_view_card.js`, `test_grocy_recipe_viewer.js`,
  `test_grocy_recipe_viewer_day_editor.js`, `test_additional_recipes.js`,
  `test_meal_leftovers.js`, `test_grocy_recipe_detail.py`,
  `test_grocy_recipe_importer.py`) re-verified passing after the change.

- **v150 (1.113.0)**: Bug fix, direct follow-up to v149 below — household
  reported "paprika" specifically still not auto-tying to the real,
  already-existing Grocy product ("Its in the list, but it doesn't get
  matched automatically") and asked for the core issue: "before
  suggesting an ingredient we need to crosscheck the Grocy ingredient
  lists." Root cause distinct from all three v149 fixes: real recipes
  essentially never call for bare "paprika" - "sweet paprika"/"smoked
  paprika"/"Hungarian paprika" are the common real-world phrasings, and
  those multi-word strings score well under the 0.6 real-product cutoff
  ("Hungarian paprika" 0.583, "sweet Hungarian paprika" 0.467 - confirmed
  via actual `difflib.SequenceMatcher.ratio()`, not estimated), with no
  single-word fallback able to help a 2-3 word phrase. Every real-product
  matching tier through v149 only ever compared the ingredient's own
  raw/cleaned TEXT against real product names - none of them looked at
  what `_match_grocery_reference`/`GROCERY_REFERENCE` (the curated lookup
  table) itself already knows this ingredient's real canonical name is,
  even though that table is specifically built to resolve messy ingredient
  text like this down to a clean name ("Paprika") - it's exactly what
  powered the old, now-redundant "+ Add new product: Paprika" suggestion
  the household kept seeing instead of a real tie-in.

  **The fix** (in `_ws_match_recipe_ingredients`, right before the
  existing "only compute `suggested_new_product` when there's no real
  match yet" block): whenever none of the real-product tiers found a
  match but `_match_grocery_reference` recognizes the ingredient, cross-
  check that reference entry's own `name` and `aliases` directly against
  `product_candidates` for an EXACT, case-insensitive match - and tie to
  that real product instead of ever computing a suggestion. Still runs
  through `_pepper_kind`/`_ingredient_form_kind` as defense-in-depth, but
  since these are exact string matches (not fuzzy), those guards realistically
  never fire here.

  **Deliberately exact-match only — no fuzzy fallback.** A first attempt
  added a fuzzy crosscheck (`_best_text_match(name, product_candidates,
  cutoff=0.75)`) as a second tier when the exact check found nothing.
  Running the full existing suite immediately caught a real regression:
  the curated "Vegetable Broth" entry (correctly resolved via its
  "vegetable stock" alias for "chicken or vegetable stock") fuzzy-matched
  an unrelated real "Vegetable Oil" product at 0.786 - clearing that 0.75
  cutoff and silently attaching the wrong product, exactly the "shared
  word inflates a short-string difflib ratio" failure shape the 0.6
  real-product cutoff earlier in this same function was raised to
  prevent (see that cutoff's own comment), reintroduced one level removed
  by comparing a clean reference name instead of raw ingredient text
  against real products. Removed the fuzzy tier entirely rather than
  tune the cutoff further - an exact name match structurally cannot have
  this failure mode (there's no "shared word" risk when the strings are
  identical), so it's the only crosscheck kept.

  New tests in `test_grocy_recipe_importer.py`:
  `test_match_ingredients_crosschecks_reference_name_against_real_products_for_paprika_phrasing`
  (Hungarian paprika / sweet Hungarian paprika / smoked paprika, all tying
  to a real "Paprika" product) and
  `test_match_ingredients_reference_crosscheck_does_not_reintroduce_the_vegetable_oil_false_match`
  (a permanent regression lock for the exact false-match the fuzzy-fallback
  attempt caused, sitting right next to the pre-existing "chicken or
  vegetable stock" test from the original 0.6-cutoff fix). Full existing
  suite re-verified passing after settling on the exact-match-only design.

- **v149 (1.112.0)**: Bug fix — the recipe importer's real-Grocy-product
  matching in `_ws_match_recipe_ingredients` (`family_hub/__init__.py`).
  Household report, verbatim: *"the importer seeing an ingredient like
  pepper or mustard, paprika, boneless chicken etc etc etc that it
  recognizes from the look up table, and it EXISTS in grocy under the
  exact same name but it doesn't tie it together."* Diagnosed via actual
  `difflib.SequenceMatcher.ratio()` computation (not guesswork) against
  the reported words, confirming three independent causes layered under
  the existing `_pepper_kind`/`_ingredient_form_kind` guards and matching
  tiers:

  1. **Reject-and-give-up, not reject-and-retry.** `_pepper_kind` and
     `_ingredient_form_kind` only ever set `product_match = None` when
     they rejected the current top-scoring candidate — there was no retry
     against the next-best remaining one. A bare "pepper" scores HIGHER
     against an existing "Bell Pepper" product (0.706) than the correct
     "Black Pepper" (0.667), so `_best_text_match`'s single-highest-score
     pick chose Bell Pepper, got correctly rejected as the wrong kind of
     pepper, and the ingredient was simply abandoned — the correct match
     sitting right behind it was never tried. **Fix**: the whole
     real-product matching block (previously a flat sequence of "try tier,
     keep if better" calls) is now a `while True:` loop that excludes each
     rejected candidate's id and retries every tier against the shrinking
     candidate list, until a candidate passes both guards or none are left
     above cutoff.
  2. **`_ingredient_form_kind`'s blanket "unqualified = ambiguous"
     assumption is wrong for mustard.** The ratio itself passes for
     "ground mustard"/"dry mustard" vs. plain "Mustard" (0.667/0.778), but
     the guard rejected it because the ingredient names the processed form
     and "Mustard" carries no qualifier — correct behavior for
     garlic/onion/herbs (a bare "Garlic" really is usually the fresh
     form), wrong for mustard, whose bare product name virtually always
     already IS the ground/prepared condiment. **Fix**: new
     `_BARE_PRODUCT_IS_PROCESSED_WORDS = {"mustard"}` — an unqualified
     match on one of these words now counts as already satisfying
     "processed" rather than being rejected. Deliberately a tiny,
     evidence-based exception list, not a change to the guard's general
     behavior for every other word in `_BASE_INGREDIENT_WORDS`.
  3. **The 0.6 real-product cutoff has no descriptor-word cleaning for
     meat cuts.** "boneless skinless chicken breasts" scores 0.596 against
     "Chicken Breast" — just under cutoff — purely from the two trim
     words. The reference-suggestion matcher's much more aggressive
     `_clean_ingredient_reference_text` isn't reused here on purpose (it
     also strips "or"/"and", which reintroduces the "chicken or vegetable
     stock" → "Vegetable Oil" false match the 0.6 cutoff itself exists to
     prevent — see that cutoff's own comment). **Fix**: new, narrow
     `_MEAT_CUT_WORDS = {"boneless", "skinless", "bone-in", "skin-on",
     "skin-off"}` and `_strip_meat_cut_words()`, tried as an additional
     tier alongside the existing `_strip_oil_grade_words()` tier — same
     "tiny, evidence-backed word list" shape as that oil-grade fix, not a
     general prep-word stripper.

  **Also added, on top of all three**: an ingredient whose cleaned text is
  an EXACT, case-insensitive name match for a real Grocy product now wins
  outright, checked BEFORE any fuzzy tier and before the pepper-kind/
  ingredient-form-kind guards run at all — an identical name can't be "the
  wrong kind" or "the wrong form" by definition, so there's nothing left
  for those guards to correctly reject. This is the direct fix for the
  exact shape of the household's complaint (recognized by the lookup
  table AND already existing in Grocy under that literal name) and covers
  "paprika," which isn't in `_BASE_INGREDIENT_WORDS` or a pepper word at
  all — it was never actually blocked by either guard, it just needed a
  match at all, and the exact-match path guarantees one whenever the name
  is identical.

  New test coverage in `test_grocy_recipe_importer.py` (4 new end-to-end
  websocket tests + 1 new unit test for `_strip_meat_cut_words`):
  `test_match_ingredients_pepper_retries_next_candidate_after_bell_pepper_is_rejected`,
  `test_match_ingredients_exact_name_match_bypasses_the_pepper_and_form_guards`,
  `test_match_ingredients_ground_and_dry_mustard_match_existing_plain_mustard_product`,
  `test_match_ingredients_boneless_skinless_chicken_breasts_matches_existing_chicken_breast_product`,
  `test_strip_meat_cut_words`. Full existing suite (all pre-existing tests
  in that file, including the bell-pepper/garlic-powder/ground-chicken/
  extra-virgin-olive-oil regression tests this fix sits right next to)
  re-verified passing after the change — none of the three fixes touch
  the raw-text/asides-stripped/oil-grade-stripped tiers' own behavior,
  only add a retry loop around the guards and one more stripping tier.

- **v148 (1.111.0)**: Feature — a per-card Theme override, editable right
  from each card's own native "Edit Card" dialog, on every Family Hub
  card EXCEPT the calendar card (household request, confirmed via
  AskUserQuestion: lives in the native Edit Card dialog, not an in-card
  settings UI; applies to all cards but the calendar; the theme list
  matches the existing Global Theme picker — Theme Builder custom themes
  plus every installed native Home Assistant theme — plus a new default
  "Use device settings" option).

  **Precedence** (highest wins): per-card `theme_override` config field >
  per-device `localStorage["familyHubDeviceThemeOverrideLocal"]` override
  (the calendar card's own "This device's theme" setting) > household-wide
  `settings.useGlobalTheme`/`globalThemeId` (the calendar card's own
  Global Theme picker) > the card's own local default theme. `""` (the
  default, untouched by every existing dashboard) means "Use device
  settings," i.e. exactly the pre-1.111.0 behavior — this ships with zero
  visible change for anyone who doesn't open a card's Edit dialog and
  explicitly pick something.

  **Mechanism, one card at a time** (`family-hub-goals-card.js`,
  `family-today-card.js`, `family-hub-active-timers-card.js`,
  `family-hub-pantry-card.js`, `family-hub-my-chores-card.js`,
  `family-hub-rewards-card.js`, `family-hub-todo-card.js`,
  `family-hub-chores-card.js`, `family-hub-recipe-box-card.js`,
  `family-screensaver-card.js`): `getConfigForm()` replaced (or, on a card
  that already had a custom `getConfigElement()` for an unrelated reason —
  `family-hub-todo-card.js`'s `grocy_list_ids`-preserving editor,
  `family-screensaver-card.js`'s `return_dashboard_path` navigation field
  — extended) with a dedicated `<card>-editor` custom element wrapping a
  live `<ha-form>`, since the options list needs a real `hass` connection
  (`theme_builder/list` + `hass.themes`) that Home Assistant's own
  schema-only `getConfigForm()` auto-editor can't provide. `setConfig`
  gained a `theme_override` field (default `""`). `_resolveTheme` (or the
  card's own equivalent) now checks `_config.theme_override` first via a
  lookup in `_globalThemes`, falling through to the pre-existing device-
  override-then-household-Global-Theme chain unchanged if empty or if the
  id no longer resolves (a deleted/renamed theme falls back rather than
  going blank, same "never leave a stale reference broken" convention as
  a stale `primaryCalendar`). `_initFirstLoad` now always calls
  `_fetchGlobalThemes()` (previously gated behind
  `settings.useGlobalTheme`) so a per-card override can resolve even for a
  household that has never turned on Global Theme. `_fetchGlobalThemes`
  now merges in every native HA theme too (`_nativeHaThemeEntries`,
  `_haVarsToBuilderColors`, `_haThemeCssVars`, `_haDefaultCssVars` —
  duplicated, not shared/imported, from `family-week-calendar-card.js`'s
  identical methods, same "independently loaded Lovelace resources
  duplicate small helpers" convention as everything else in this
  codebase) so a `theme_override` can point at `ha:ThemeName` exactly like
  the household's own Global Theme picker already allows.

  **Two cards needed baseline theming built from scratch**, not just the
  override on top of an existing system: `family-hub-recipe-box-card.js`
  (previously hardcoded `--fc-*` values directly in its `:host {}` CSS
  block with zero settings/theme fetch at all) and
  `family-screensaver-card.js` (its edit-mode-only "face" — the dashed-
  border box, never the actual full-screen video/camera overlay itself,
  which has no themable surface — used hardcoded literal colors). Both
  gained the full `_defaultTheme`/`_getSettings`/`_getDeviceThemeOverride`/
  `_resolveTheme`/`_applyThemeVars`/`_fetchSettings`/`_fetchGlobalThemes`/
  native-theme-helper set from scratch, same shape (colors-only, no
  fonts) as every other simple standalone card. The screensaver card's own
  `_fetchSettings` already normalizes the shared settings blob down to
  just its `screenSaver` slice (`_normalizeSettings`), which would have
  silently dropped `theme`/`useGlobalTheme`/`globalThemeId` — fixed by
  keeping a second, separate `_themeSettingsCache` of the raw response
  just for `_resolveTheme` to read, alongside the existing normalized one.

  **One card's `_resolveTheme` also drives something other than colors**:
  `family-hub-my-chores-card.js`'s `_headerTitleFontSize` (added in v122)
  separately resolves the header title's font size using the same
  device-override/household-Global-Theme precedence — factored the
  override lookup into its own `_cardOverrideThemeEntry()` helper so both
  `_resolveTheme` and `_headerTitleFontSize` agree on which theme entry a
  `theme_override` resolves to, rather than duplicating that lookup
  (and risking them drifting out of sync) in both places.

  **Test coverage**: every one of the ten cards above got new assertions
  covering the default (`theme_override` empty → local/device/household
  resolution unchanged), a Theme Builder override winning over a
  household's own Global Theme, a native `ha:ThemeName` override
  resolving correctly, and the new editor's schema/options/`config-changed`
  dispatch (`test_goals_card.js`, `test_today_card.js`,
  `test_active_timers_card.js`, `test_pantry_card.js`,
  `test_my_chores_card.js`, `test_rewards_card.js`, `test_todo_card.js`,
  `test_chores_card.js`, `test_recipe_box_card_sharing.js`,
  `test_screensaver_card.js`). A Node 22 + jsdom gotcha hit repeatedly
  while adding these: inside `dom.window.eval(src)`, a bare `CustomEvent`
  reference inside the card's own source resolves to Node's own global
  `CustomEvent` (built into Node 19+), not `dom.window.CustomEvent` —
  different classes, so `dispatchEvent(new CustomEvent(...))` throws
  "parameter 1 is not of type 'Event'" unless the test file explicitly
  sets `global.CustomEvent = dom.window.CustomEvent;` before evaluating
  the card source (this was already present in a couple of older test
  files that predated any `getConfigElement`-style editor; missing from
  the rest until now).

- **v147.8 (1.110.8)**: Bug fix — Chores' and Rewards' kiosk PIN login
  buttons now share one login instead of each card keeping its own,
  private `this._kioskElevation`. Verbatim report: *"Chores and rewards
  have a login button, logging into one logs into both."* / *"it
  should."* Scoped to `family-hub-chores-card.js` and
  `family-hub-rewards-card.js` only — grepped `_kioskElevation`,
  `kiosk-login-btn`, and `_kioskMsg` across `family-hub-goals-card.js`,
  `family-hub-my-chores-card.js`, and `family-hub-active-timers-card.js`
  and got zero matches, so no other card has this login affordance to
  join.

  **Mechanism**: a new `window.__familyHubKioskSession` singleton,
  identical in shape to the existing `window.__familyHubScreenSaver` and
  `window.__familyHubFabCoordinator` singletons (the established fix for
  "independent Lovelace card instances have no built-in way to know about
  each other" — see those two implementations, and this one's own
  docstring right above where it's defined in `family-hub-chores-card.js`,
  for the full precedent/rationale). Each card calls
  `window.__familyHubKioskSession.registerClient(this, onUpdate)` in
  `connectedCallback()`/`_initFirstLoad()` and `unregisterClient(this)` in
  `disconnectedCallback()`, identical to the FAB coordinator's own
  register/unregister calls. The singleton holds the ONE real elevation
  (`null`, or `{token, user_id, name, is_admin, permissions,
  expires_in}`) and broadcasts it to every registered card's `onUpdate`
  callback, which just does `this._kioskElevation = elevation` — so
  `_isAdmin()`/`_myUserId()`/`_hasPermission()`/`_kioskMsg()` on both
  cards needed zero code changes, they just now always read the one
  shared value. `_submitKioskLogin()`/`_kioskLogout()` now delegate to
  `window.__familyHubKioskSession.login(hass, userId, pin)` /
  `.logout(hass)` instead of managing `this._kioskElevation` and a PIN
  verify/deelevate call directly. The 45-second inactivity auto-logout
  timer and its `pointerdown`/`keydown`/`wheel`/`touchstart` activity
  listeners also moved into the singleton (document-level listeners,
  since those events are `composed: true` and cross shadow-DOM
  boundaries) — previously each card only reset its own timer off
  activity within its own shadow root, so being active on one card could
  still let the OTHER card's login silently expire first; now activity on
  either card keeps the one shared login alive. Nothing about what
  elevation grants, the backend `family_hub/kiosk/elevate` /
  `family_hub/kiosk/deelevate` ws commands, the PIN-verification request
  shape, or "click to logout" changed — only where the state and timer
  live moved.

  **Persistence decision**: in-memory only, no `sessionStorage`/
  `localStorage` — deliberately preserving the pre-existing single-card
  behavior (a reload already logged out a single-card kiosk session,
  since `_kioskElevation` was never written anywhere durable), rather
  than introducing new across-reload persistence nobody asked for.
  Sharing state across cards already on one loaded page is a distinct
  question from persisting across a reload.

  New test file `test_kiosk_session_shared.js` covers: login via Chores
  immediately elevates Rewards (and vice versa) with no second login;
  logout from either card logs out both; a disconnected card stops
  syncing while a newly-connecting card immediately joins whatever's
  currently elevated; a failed PIN leaves both cards logged out.
  `test_kiosk_login_chores_card.js`/`test_kiosk_login_rewards_card.js`
  were adapted (an async `makeCard()` now resets the shared singleton
  before creating each card, to avoid one test's elevation leaking into
  the next, since the singleton is a true page/process-wide global; the
  idle-timer test now asserts via a new test-only
  `window.__familyHubKioskSession._debugIdleTimerArmed()` instead of a
  per-card timer handle that no longer exists) but their actual
  single-card permission-gating behavior is unchanged.

- **v147.7 (1.110.7)**: Two rounds of refinement on real household use, no
  new backend surface needed for either.

  **1. Manage Stars modal refinements** (`family-hub-rewards-card.js`).
  Verbatim: *"Stars manage modal should pop up when you click the persons
  name in rewards, a reason should not be necessary, add common star
  amounts, 1,5,10."*
    - Clicking a balance card's **name** (`.balance-name`) now opens the
      Manage Stars modal pre-selected to that person, for anyone with
      `can_override_rewards` - previously it always opened Star History.
      Gated in `_handleClick`'s `.balance-name` branch (checks the same
      permission the header/✎ buttons already check) and in
      `_balanceCardHtml` (title text/attribute swap). Someone WITHOUT that
      permission sees zero change - their name keeps opening Star History
      exactly like before v1.110.7, since it was already a legitimate,
      functional affordance for them (not a dead pointer cursor waiting to
      be unlocked). The ✎ button (`.manage-stars-for-btn`) was kept
      alongside rather than removed - low-cost redundancy, and some people
      look for the icon rather than the name.
    - Reason went from required (v1.110.5's deliberate choice) back to
      optional - `_submitManageStars` no longer blocks on an empty
      `.manage-stars-reason` value, and only includes `reason` in the
      `family_hub/rewards/adjust_balance` ws payload when it's non-empty
      (the backend's `reward_engine.add_stars` already treated a missing
      reason as `""`, and the history row already fell back to a generic
      "Stars added"/"Stars deducted" label - zero backend changes needed).
    - Added `MANAGE_STARS_PRESETS = [1, 5, 10]` one-tap chips
      (`.preset-row`/`.preset-btn`, reusing the exact class names/visual
      shape `family-hub-active-timers-card.js`'s `TIMER_PRESETS` chips use
      for its Quick Timer modal, and the same "preset fills the field,
      custom field still fully usable" relationship) above the manual
      `.manage-stars-amount` input. Tapping a preset just sets the input's
      value - the sign toggle (Add/Subtract) and manual override both keep
      working exactly as before.

  **2. `fab_position` card config option** - `"dashboard"` (default,
  unchanged) vs `"card"`. Verbatim: *"add a options when setting up the
  card to make the FAB at the right corner of the dashboard or right
  corner of the card."* Every FAB-bearing card's "+" button
  (`position: fixed`) has always anchored to the *viewport's* bottom-right
  corner regardless of where the card itself sits in a multi-column/
  sections/grid Lovelace layout - confirmed by reading the actual CSS on
  Chores' `.add-chore-fab` and Rewards' `.add-reward-fab` before making any
  change. `fab_position: "card"` switches that to `position: absolute` off
  the card's own host element (`:host` gained `position: relative` on all
  5 cards to serve as that containing block - checked for conflicts with
  each card's existing layout CSS first; harmless everywhere since none of
  them previously set `position` on `:host`). On Chores/Rewards/Goals/
  To-Do it's a normal `getConfigForm` schema field (`select` selector,
  dropdown) plus a `setConfig` default, matching how these 4 cards already
  expose their other simple options; Calendar has no YAML visual editor at
  all (see that card's own "no getConfigForm" docstring - v33/v34 history),
  so its `fabPosition` lives in the same shared Settings-modal blob as
  `greyOutPastEvents` etc. instead (a new "+ button position"
  Settings → Calendars field, `.fab-position-btn` on/off pair, same
  wiring shape end to end).

  **Stacking-coordinator decision**: `window.__familyHubFabCoordinator`'s
  `registerClient(client, kind, meta, onUpdate, opts)` gained a 5th,
  optional `opts.takesSlot` (default `true`). `recompute()` now hands out
  stacking slots/offsets only to `takesSlot` entries, but still calls
  `onUpdate` for every entry regardless - so a `fab_position: "card"` card
  passes `{ takesSlot: false }` and opts OUT of the shared viewport-corner
  stacking (a shared screen-corner offset is meaningless once a FAB is
  positioned relative to its own card instead - the option considered and
  rejected was keeping the same fixed slot machinery and letting it stack
  wrong), but stays a FULL coordinator member otherwise - it still
  contributes/reads `meta.providesGoalTab`, so the Goals card's own FAB
  self-suppression logic (v1.110.4) keeps working correctly even in a
  mixed dashboard/card-positioned setup (verified in
  `test_fab_coordinator.js`'s new coverage). Default is `"dashboard"`
  everywhere, so nobody's existing dashboard changes on upgrade.

  New/updated tests: `test_rewards_card.js` (blank-reason submission +
  ws-payload shape, the three presets alone/combined with Subtract/
  alongside a manual amount, the name-click entry point pre-selecting the
  right person and gated correctly by permission, the pre-existing Star
  History name-click test moved to a non-override user since that's now
  the only case where a name click still opens history);
  `test_fab_coordinator.js` (fab_position defaulting to "dashboard" and
  setting `[fab-position="card"]` on all 5 cards, a card-relative FAB not
  leaving a stacking gap for the still-viewport-stacked cards, Goal-tab
  de-duplication still correct across a mixed card-relative/dashboard
  setup); new `test_calendar_fab_position.js` (settings normalization
  defaulting/falling-back to "dashboard", the Settings-modal on/off pair).
  Full regression sweep run - no new failures beyond the known
  pre-existing set (`test_grey_out_past_events.js`, `test_reminder.js`,
  `test_reminders_feature.js`, `test_servings_scaling.js`,
  `test_chores_todo_and_services.py`, `test_config_flow.py`,
  `test_family_calendar_reminders.py`, `test_family_hub.py`). One
  ADDITIONAL pre-existing Python failure not in that list was also found
  this session, entirely unrelated to this work (no Python files were
  touched): `test_todo_card_config_storage.py`'s
  `test_set_then_get_round_trips` fails against the backend as-is
  (`get_todo_card_config` returns `{'entities': None, 'grocy_list_ids':
  None, 'rows': None}` instead of what was saved) - flagging for whoever
  picks this up next rather than silently leaving it undocumented.

- **v147.6 (1.110.6)**: "Create a card for the menu box in case people want
  to see it as its own tab of the dashboard, it should use the same exact
  code from the modal so changing the modal changes the card."

  **"The menu box" identity.** No literal "menu box" string exists anywhere
  in this codebase. Resolved by matching intent against the two candidates
  that could plausibly be meant: the week/month meal-plan grid (not a modal
  at all - it's the calendar card's whole body, ruled out) and the Recipe
  Box ("Loved Dishes") modal - the one self-contained, searchable/
  filterable/sortable "box" of saved dishes a household would plausibly want
  pinned open as its own tab. README.md's own long-standing feature name,
  "Recipe box (\"Loved Dishes\")", is the same identification. Worked
  through autonomously per the task's own instruction, documented in both
  new/touched files' comments and here rather than asking.

  **The sharing mechanism.** Lovelace custom cards are independently-loaded
  resources, not ES modules - no import/export between two card files is
  possible. What CAN be shared is the actual Function objects: a new
  `window.__familyHubRecipeBoxShared` object (defined identically, byte-for-
  byte, in both `family-week-calendar-card.js` and the new
  `family-hub-recipe-box-card.js`, guarded by `if
  (!window.__familyHubRecipeBoxShared)` so whichever file's script tag loads
  first "wins" and the second is a no-op) holds 38 method bodies pulled out
  of `FamilyWeekCalendarCard`'s class body - browse/render/search/filter/
  sort (`_renderLoved`, `_sortRecipeBoxList`, `_renderRecipeBoxCategoryChips`,
  view-mode toggles), the data layer (`_fetchRecipes`/`_persistRecipes`,
  `_fetchSuggestions`/`_persistSuggestions`, `_upsertDish`, `_deleteDish`,
  `_addSuggestion`/`_removeSuggestion`, `_suggestDish`), fuzzy-duplicate
  detection (`_normalizeForDuplicateCheck`/`_levenshteinDistance`/
  `_findFuzzyDuplicate`), dish detail (`_openDishDetail`/`_closeDishDetail`),
  bulk-select delete, Grocy image hydration, and the menu-edit permission
  helpers (`_isAdmin`/`_hasPermission`/`_canEditMenu`/`_fetchMyPermissions`).
  Both `FamilyWeekCalendarCard.prototype` and
  `FamilyHubRecipeBoxCard.prototype` then do
  `Object.assign(prototype, window.__familyHubRecipeBoxShared)` - a
  reference copy of the SAME function objects onto both prototypes, not a
  mixin function re-evaluated per class (which would produce textually-
  identical but reference-DISTINCT closures). This is strictly stronger than
  "looks the same": `FamilyWeekCalendarCard.prototype._renderLoved ===
  FamilyHubRecipeBoxCard.prototype._renderLoved` is literally `true` at
  runtime. Proven, not asserted on faith - `test_recipe_box_card_sharing.js`
  loads both card files into one jsdom window and asserts `===` for every
  one of the 38 shared methods, failing loudly and by name if any future
  edit ever re-implements one of them separately instead of touching the
  shared block. Same window-singleton, guarded-by-`if` shape as the existing
  `window.__familyHubFabCoordinator` (the only cross-card-coordination
  precedent this codebase already had).

  **Deliberately NOT shared** (each card supplies its own, documented on the
  shared object's own comment in both files): `_openDishEditor`/
  `_saveDishEditor` - fused with the calendar card's `.edit-overlay`, the
  same modal the day/meal-plan editor uses, and not cleanly separable from
  meal-plan editing; the standalone card gets a new, separate, small add/
  edit-dish mini-modal instead, which still calls the SAME shared
  `_upsertDish`/`_deleteDish` to actually write the change. `_openModal` -
  the calendar card's version drives a mobile back-button/history-stack
  system shared by every modal on that card; general navigation infra, not
  Recipe Box logic, so the standalone card gets a trivial version of its
  own. "Add from Grocy", "Import from a link", and the full in-card Grocy
  Recipe Viewer - large, calendar-entangled subsystems, out of scope; the
  standalone card's `_openGrocyRecipeViewer` stub just opens the plain link.
  The screensaver idle-timer reset (`_resetScreenSaverIdleTimer`) is a no-op
  stub on the standalone card, which has no screensaver feature.

  **New file**: `family_hub/card/family-hub-recipe-box-card.js` -
  `FamilyHubRecipeBoxCard`, same lifecycle shape as every other standalone
  card (`setConfig`/`hass` setter/`connectedCallback`/`disconnectedCallback`/
  `getCardSize`/`getGridOptions`), config is title-only (same minimal
  convention as Active Timers/Screen Saver - the Recipe Box's data is
  already backend/Store-shared household-wide, nothing else needed per
  card instance), 60s polling. Registered the same four-step way every
  other card is (`RECIPE_BOX_CARD_JS_URL` in `const.py`,
  `recipe_box_card_path`/static path/content-hash/versioned URL/
  `_register_dashboard_resource` in `__init__.py`'s existing registration
  block, right alongside Active Timers).

  **Testing**: `test_recipe_box_card_sharing.js` (new) covers both the
  sharing proof above and the standalone card's own lifecycle (config
  default/override, connect/disconnect/reconnect polling), rendering
  (both recipes shown from the shared `family_hub/get_recipes` data),
  search/filter, category-chip filter, heart-toggle persisting through the
  shared `_upsertDish`, add-a-dish through the card's own mini-editor
  landing through the same shared data layer, and dish-detail opening with
  the right recipe. Full regression sweep after the extraction + new card +
  `__init__.py`/`const.py` changes: 97 JS pass / 3 pre-existing fails
  (`test_reminder.js`, `test_reminders_feature.js`,
  `test_servings_scaling.js`) + the new sharing test passing separately, and
  32 Python pass / 4 pre-existing fails (`test_chores_todo_and_services.py`,
  `test_config_flow.py`, `test_family_calendar_reminders.py`,
  `test_family_hub.py`) - no new failures either language. Note: this
  session discovered the test suite's `.js`/`.py` files load the card/
  backend source from THREE different locations by hardcoded absolute path
  depending on which test file you're looking at (this project's own
  `family_hub/` folder, `/tmp/hatest_pkg/family_hub/`, `/tmp/hatest/`, and
  `/sessions/<session-id>/mnt/outputs/family_hub/` - leftovers from
  different points across many earlier sessions) - kept all of them synced
  by hand this session; worth eventually standardizing every test file on
  one path.

- **v147.5 (1.110.5)**: five independent items from one user pass — "1. Need
  a stars manage modal... 2. Display X days for smaller displays... 3. Todo
  card is the same config for all instances... 4. When adding a recipe to
  grocy, if you click do not include in amounts the ingredient doesnt show
  on the top of the recipe viewer... 5. When adding a recipe to grocery,
  clicking add doesnt give you any feedback."

  **1. Manual stars adjustment.** The backend already had everything except
  a UI for this: `family_hub/rewards/adjust_balance` (chores_websocket_api.py,
  gated on `PERMISSION_REWARD_OVERRIDE`) already wrote into `reward_engine.
  add_stars`'s shared per-person `rewards["ledger"]` with an optional
  `reason` field and a `LEDGER_SOURCE_MANUAL_ADJUSTMENT` default source; the
  Star History modal (`_openStarHistoryModal`/`_historyEventRow` in
  family-hub-rewards-card.js) already rendered `manual_adjustment` ledger
  rows with their `reason` as the label. What was missing was any UI to
  actually call it WITH a reason (the pre-existing quick +/- buttons next
  to each balance call it with no reason at all, and are gated on plain
  `_isAdmin()` rather than the narrower `can_override_rewards` grant). Added
  a `.manage-stars-modal` (person picker defaulting to whichever balance
  card it was opened from, Add/Subtract sign buttons, amount, a *required*
  reason textarea) via a new `.manage-stars-btn` in the card header (gated
  `!this._hasPermission("can_override_rewards")`) and a per-person
  `.manage-stars-for-btn` (✎) next to each balance card, same gate. Submits
  `{type: "family_hub/rewards/adjust_balance", user_id, delta, reason}` —
  no backend changes needed at all. Scope decision, documented in the
  modal's own comment: did NOT add reverse/delete for individual ledger
  entries (unlike redemptions, which already have both) — undoing an
  arbitrary point in a running balance ledger would mean recomputing
  `balance_after` for every later entry, a materially bigger feature than
  what was asked; a mistaken manual adjustment can already be corrected
  with an equal-and-opposite one, which is itself visible with its own
  reason. Tests: `test_rewards_card.js` gained the modal's gating (admin
  sees it, a `can_override_rewards` grant without admin also sees it, a
  plain non-admin does not), required-reason validation (no ws call when
  reason is blank), and a full submit round trip asserting the exact
  `{user_id, delta, reason}` payload plus the modal closing on success.

  **2. Configurable 3/5/7-day calendar view.** Reused the existing Week-view
  day-column renderer exactly as instructed ("the week view, but showing N
  days instead of 7") rather than a fourth view mode: `_renderWeekGrid`'s
  `for (let i = 0; i < 7; i++)` loop now loops `_weekViewDayCount()` times,
  and a `.day-count-3`/`.day-count-5` CSS modifier class overrides
  `grid-template-columns` (base `.grid.mode-week` rule stays `repeat(7,
  ...)`  unchanged for the default). The actual date-range math lives in
  `_weekStart()` (the one place it already lived for Week/Portrait) — now
  branches on `_weekViewDayCount()`: 7 keeps the exact old Sunday-start-plus-
  `this._weekOffset*7` logic; 3/5 instead treat `this._weekOffset` as
  counting whole **N-day windows** from today (`center = today + offset*n`,
  `start = center - floor(n/2)`), so today is always exactly the middle
  index and forward/back navigation (unchanged callers, still just
  `_setWeekOffset(offset ± 1)`) shifts and re-centers that window. Because
  `_weekStart()` always computes off a fresh `new Date()` rather than a
  stored anchor date, a midnight rollover while the dashboard stays open
  needs no special handling — the very next render just centers on the new
  "today" automatically. New `_weekViewDayCount()` indirection scopes this
  to `this._viewMode === "week"` ONLY — Portrait (own 4-then-3 split of the
  same 7 columns) and Planner both keep hardcoded 7 regardless of the
  stored device setting, since neither has anywhere sane to put a narrower
  window. Setting itself (`_getWeekViewDayCount`, localStorage key
  `familyCalendarWeekDayCountLocal`) is **device-specific**, same precedent
  as the existing `_getWeekViewVariant`/`_getMonthViewVariant`/
  `_getShowTimeline` (default-view choices are per-device; the shared
  `family_hub/set_settings` blob is for things that should genuinely match
  household-wide, like theme/timeline range) — new "Days shown in Week
  view" button row added right in Settings → Calendars, next to "Week
  button shows". Two real pre-existing bugs surfaced and fixed while wiring
  this in (both were latent no-ops at 7 days, since a 7-day window always
  happened to start on Sunday until now): (a) the day-column header used
  `dayNames[i]` (loop INDEX, not the actual date's weekday) — fixed to
  `dayNames[dayStart.getDay()]`; (b) `_updateNavLabel`'s week-label
  hardcoded `start + 6` and "This Week"/"N Weeks Out" phrasing — now
  computes `start + dayCount - 1` and only uses the weeks-out phrasing (and
  shows the week-shortcut row) when `dayCount === 7`, otherwise a plain date
  range with the shortcut row hidden (jumping by whole weeks doesn't apply
  to an N-day window). New `test_week_day_count.js`: default-is-7,
  out-of-range-falls-back-to-7, Portrait/Planner ignore the device setting,
  7 unchanged (Sunday-start), 3-day centers at index 1, 5-day centers at
  index 2, forward/back navigation recenters correctly, a live day-count
  change is picked up with nothing cached, the weekday-header bug fix
  (asserts against each column's REAL computed weekday, not loop index),
  and the CSS modifier class matches the chosen count.

  **3. To-Do card per-instance config (the important one — real data-model
  bug, not just missing UI).** Confirmed via re-reading the actual current
  code (not last session's summary) that `family_hub/get_todo_card_config`/
  `set_todo_card_config` (`__init__.py`) were backed by ONE Store record
  keyed only by `entry_id` — since a household has exactly one Family Hub
  config entry, EVERY `family-hub-todo-card` instance on every dashboard
  shared that one record; whichever card saved last silently overwrote
  every other card's list selection. Fixed by keying every record by a
  `card_id` string instead: store shape is now `{"cards": {<card_id>:
  {entities, grocy_list_ids, rows}}}` — one Store, a dict-of-records inside
  it (not one Store file per card instance, to avoid an unbounded file
  count as people add/remove cards). Both websocket commands gained an
  optional `card_id` field. **Migration** (`_todo_card_cards_map` helper,
  shared by both handlers): a store saved before this version has no
  `"cards"` key at all, just the old flat record at the top level. The
  FIRST call (get OR set) that supplies a `card_id` against a store still
  in that flat shape migrates it verbatim into `cards[<that card_id>]` and
  persists the new shape immediately — one-time, same "never runs twice"
  spirit as `SETTINGS_KEY_NOTIFY_PROFILES_MIGRATED` (cited directly in the
  new code's own comment as the cautionary precedent to not repeat). Any
  OTHER/later `card_id` (a second, brand-new card added post-upgrade) gets
  its own empty record, never the migrated one. Frontend
  (`family-hub-todo-card.js`): `_ensureCardId(config)` generates a card_id
  once in `setConfig` when the card's own YAML/stored config doesn't
  already carry one, and — since `getConfigElement`'s existing custom
  editor (`FamilyHubTodoCardEditor`, from v1.109.4/9.5, built specifically
  because HA's default editor was dropping fields it didn't know about)
  already merges `e.detail.value` into a COPY of the full config rather
  than replacing it outright — a generated id survives round-tripping
  through that editor for free. Persisted back via the same `config-
  changed` event channel the editor itself uses (best-effort — depends on
  the dashboard being in storage mode and honoring a card-initiated
  config-changed outside the edit dialog); ALSO cached in localStorage
  keyed by `location.pathname` + this card's ordinal position among To-Do
  cards on the page, so a YAML-mode dashboard (which can never truly be
  written back to from a card) still gets a stable, if device-local rather
  than YAML-persisted, identity across reloads instead of silently
  "losing" its selection every reload. Both `family_hub/get_todo_card_
  config`/`set_todo_card_config` calls now send `card_id: this._config.
  cardId`. Tests: rewrote `test_todo_card_config_storage.py`'s existing
  round-trip/rows tests to pass an explicit `card_id` (previously
  implicit/shared), and added `test_two_different_card_ids_are_fully_
  independent`, `test_legacy_single_record_migrates_into_first_card_id`,
  `test_second_new_card_after_migration_starts_independent_and_empty`, and
  `test_legacy_record_migrates_on_set_too_if_no_get_happened_first` (the
  defensive set-before-any-get case) — the exact "existing single-record
  household upgrades and keeps its data, then a second new card starts
  independent and empty" scenario the task called out by name.

  **4. Recipe Viewer: "don't count toward stock" ingredients weren't
  actually being filtered out of the display anywhere findable in the
  current code** — extensive tracing of the full pipeline (`_ws_create_
  grocy_recipe`'s recipes_pos creation → `_ws_get_grocy_recipe_detail`'s
  positions→ingredients resolution → `_renderGrocyRecipeIngredients`'s
  own render) found every position included in the ingredients list
  unconditionally already, with `not_check_stock_fulfillment` never even
  surfaced to the frontend at all (so nothing there COULD have been
  filtering on it, whatever a stale/earlier build may have done). Given
  that, hardened rather than "fixed" a missing bug: added `not_check_
  stock_fulfillment` as plain metadata on each ingredient in the `_ws_get_
  grocy_recipe_detail` response, with an explicit comment on both the
  backend loop and `_renderGrocyRecipeIngredients` that this flag is a
  STOCK-MATH concern only and must never gate whether an ingredient is
  included in the list — closing the gap for whatever future code reads
  it, and giving this a permanent regression test:
  `test_grocy_recipe_detail.py`'s existing 3-ingredient fixture had its
  "to taste" Salt row marked `not_check_stock_fulfillment: True`, with new
  assertions that it's still present (not dropped) and that the flag comes
  through correctly on both it and an ordinary ingredient.

  **5. Save confirmation.** Checked all three "add" flows in the meal-
  planning area (per the task's explicit instruction to check all three):
  the recipe IMPORTER's own "Add to Grocy" (`_createImportedGrocyRecipe`)
  already had a real status line plus an auto-close-after-a-brief-delay —
  left untouched. The day/menu editor's Save (`_saveEditor`) and the Recipe
  Box editor's Save (`_saveDishEditor`) both already closed their modal on
  save (`_closeEditor()`), but gave zero positive feedback that anything
  had happened — closing with no visible sign reads exactly like "nothing
  happened" on a quick tap, matching the report. No toast/snackbar pattern
  existed anywhere else in this codebase (checked every card file) — added
  one, `_showToast(message)` + a `.fh-toast` fixed pill (bottom-center,
  above the FAB, respecting `--fh-fab-offset` so it never collides with the
  FAB coordinator's own stacking), self-contained in
  family-week-calendar-card.js since cards don't share JS modules. Wired
  into both save paths, phrased "added"/"updated" based on whether an
  existing meal/dish was being edited. Tests: `test_additional_recipes.js`
  and `test_recipe_box.js` both gained toast-visible + correct-text
  assertions right after their existing save calls, plus a modal-actually-
  closed assertion.

  Full regression sweep after all five: only the documented pre-existing
  failures (test_grey_out_past_events.js, test_reminder.js, test_reminders_
  feature.js, test_servings_scaling.js, test_chores_todo_and_services.py,
  test_config_flow.py, test_family_calendar_reminders.py,
  test_family_hub.py) — no new failures.

- **v147.4 (1.110.4)**: "when a user has more than one card on the same
  screen, the FAB buttons overlap, what is the solution? Can we detect and
  combine them? If they have the same tabs can we make them not
  duplicate?" Five Family Hub cards each render their own floating "+"
  button, ALL identically `position: fixed; right: 18px; bottom: 18px;`:
  `family-week-calendar-card.js` (add-event-fab), `family-hub-chores-card.js`
  (add-chore-fab), `family-hub-rewards-card.js` (add-reward-fab),
  `family-hub-goals-card.js` (add-goal-fab), `family-hub-todo-card.js`
  (add-todo-fab) - confirmed by grepping every card file for `.fab`/
  `position: *fixed`. `family-hub-my-chores-card.js`,
  `family-hub-active-timers-card.js` and `family-hub-pantry-card.js` have
  no FAB at all, so they were never part of the problem.

  **The precedent found and reused**: `window.__familyHubScreenSaver` (see
  the Chores architecture note two entries below and the singleton block
  at the top of `family-hub-chores-card.js`/`family-hub-my-chores-card.js`/
  `family-hub-rewards-card.js`) already solves the structurally identical
  problem - several independent custom-element instances on one dashboard
  needing exactly ONE shared idle-timer/overlay/camera-poll rather than one
  per card. Its shape: a module-level `window.__familyHub*` singleton
  IIFE, guarded by `if (!window.__X)` so only the FIRST card's copy of the
  script actually builds it and every other identical copy just finds the
  flag already set; cards join/leave via `registerClient(client, ...)` /
  `unregisterClient(client)` called from `_initFirstLoad`/
  `connectedCallback`/`disconnectedCallback`. Lovelace gives custom
  elements on the same view no other way to discover each other (no
  sibling-card API), so `window` really is the only available coordination
  channel here, same as it was for the screensaver - confirmed by reading
  how that one actually works rather than assuming.

  **New sibling singleton, same shape**: `window.__familyHubFabCoordinator`
  (copy-pasted identically into all five FAB-bearing card files, matching
  this project's established "independently-loaded Lovelace resources, not
  ES modules" convention for the screensaver controller too). Holds a
  `Map<client, {kind, seq, meta, onUpdate}>`; `registerClient(client, kind,
  meta, onUpdate)` / `updateClientMeta(client, meta)` /
  `unregisterClient(client)` each recompute and call every registered
  card's `onUpdate({offsetPx, slotIndex, count, otherProvidesGoalTab})`.

  **Stacking, not merging** (explicit design call): a single mega-FAB
  standing in for "add a chore OR event OR reward" would hide which action
  does what behind an extra tap for buttons that already open very
  different modals - judged clearly worse than a small vertical stack of
  distinct buttons. Each card's FAB stays exactly itself; the coordinator
  assigns a deterministic slot (`FAB_KIND_ORDER = ["calendar", "chores",
  "rewards", "goals", "todo"]`, ties broken by registration order,
  unrecognized kinds sort last) and 66px per slot (56px button + 10px
  gap). Implementation deliberately avoids touching each card's FAB DOM
  element directly (which gets rebuilt on every `_render()`) - instead the
  coordinator sets a `--fh-fab-offset` CSS custom property on the card's
  own HOST element (`this.style.setProperty(...)`, inline style survives a
  shadow-DOM `_render()` rebuild since it's outside it), and every FAB's
  CSS rule reads `bottom: calc(18px + var(--fh-fab-offset, 0px))` - a
  custom property cascades through the shadow boundary like any other
  inherited property, so no DOM handle to the FAB button itself is ever
  needed. A `bottom 0.15s ease` transition (added alongside the existing
  `transform 0.15s ease` on FABs that already had one) makes a slot change
  (another card connecting/disconnecting) a smooth reflow instead of a
  jump.

  **Goals-tab de-duplication** (the "same tabs" half of the ask): Goals is
  reachable up to three ways at once - the standalone Goals card's own
  FAB, a "Goal" tab on the Chores FAB (`goalsShowInChores`), and a "Goal"
  tab on the Rewards FAB (`goalsShowInRewards`). Judged NOT worth teaching
  Chores/Rewards to strip their own Goal tab (would mean each of those two
  files reaching across to know about the other AND about the standalone
  Goals card - a combinatorial mess for marginal benefit, since a Goal tab
  embedded in a board you're already looking at isn't really "duplicate
  UI"). Only the clearest, lowest-risk direction was implemented: each
  Chores/Rewards card registers with `meta.providesGoalTab` = its own
  `_goalsInChoresEnabled()`/`_goalsInRewardsEnabled()` (kept live via a new
  `updateClientMeta` call added to the end of each card's own
  `_fetchSettings()`, so flipping the Settings toggle without a dashboard
  reload still updates it), and the standalone Goals card's `onUpdate`
  callback reads `otherProvidesGoalTab` to hide its own `add-goal-fab`
  entirely when true (`_applyFabVisibility()`, folded into the existing
  `_canManageGoals()` visibility gate in `_render()`). Chores' and
  Rewards' own Goal tabs are left alone in both directions - two boards
  both offering the same Goal tab is accepted as harmless, unlike a whole
  redundant floating button.

  Lifecycle: `registerClient` called from each card's `_initFirstLoad` (so
  a lone card gets `offsetPx: 0` immediately) and `connectedCallback`
  (Lovelace disconnects/reconnects a card's custom element on some
  view/tab switches - same reconnect case the screensaver controller
  already handles); `unregisterClient` from `disconnectedCallback`, so a
  dashboard edit that removes a card (or the tab-switch disconnect itself)
  never leaves a stale slot reserved for a card that's gone, and every
  remaining card's FAB shifts back down to close the gap.

  New `test_fab_coordinator.js`: a lone card gets offset 0; four cards
  (Calendar+Chores+Rewards+Goals - the exact "Chores + Rewards + Goals"
  combination this app already documents as supported, registered
  DELIBERATELY out of kind order to prove the sort is what matters, not
  registration order) stack 66px apart in deterministic kind order;
  disconnecting one frees its slot and reflows the rest; Goals' FAB is
  suppressed when a Chores board with `goalsShowInChores` on is also on
  screen, stays visible with nothing else on screen, and stays visible
  when Chores has that toggle OFF (proving only an ACTUAL Goal tab
  triggers suppression, not just the Chores card's mere presence).
  `family-hub-todo-card.js`'s registration is structurally identical (no
  meta) and wasn't separately re-tested for that reason. No backend
  changes at all - this is entirely `card/*.js`, so nothing in
  `const.py`/`chores_websocket_api.py`/etc. changed and no Python tests
  were added for it.

- **v147.3 (1.110.3)**: Two follow-up requests to the v1.110.0-1.110.2
  timer subsystem, both handled this release.

  **Task 1 - auto-provision timer helpers.** "Creating a user should
  automatically create a timer helper for family hub a
  timer.family_hub.Username and there should be an additional 4 timer
  entities for family these are for is you need a timer and dont set a
  user." This directly follows up on v1.110.2's conclusion that Family Hub
  can't create native timer.* entities. **That conclusion was RE-VERIFIED,
  not overturned, but its scope was wrong** - v1.110.2 conflated two
  different questions: "can an integration create a `timer.*` ENTITY the
  way `todo.py` creates a `todo.*` entity" (no - confirmed again, `timer`
  is absent from `entity_platforms.py`) with "can `timer` HELPER instances
  be created programmatically at all" (yes - `timer` is a
  storage-collection helper, exposed as `timer/create`/`timer/list`/
  `timer/update`/`timer/delete` websocket commands - exactly what Home
  Assistant's own "+ Add Helper -> Timer" button calls, a fully public,
  documented surface, not a private-internals hack). The only catch: those
  commands live on an authenticated frontend connection, not in Python, so
  creation has to be driven from a CARD, not from `__init__.py`/
  `chores_websocket_api.py`.

  **Confidence level and how it was checked, in order of strength:** (1)
  LIVE-INSTANCE VERIFICATION this session - called `timer/create` against
  the household's actual running Home Assistant via the ha-mcp tooling,
  got back a real `timer.family_hub_test_verify` entity in state `idle`
  with `duration`/`restore`/`icon` reflected exactly as sent, then deleted
  it the same way (`ha_remove_helpers_integrations`) - nothing was left
  behind. (2) The HA best-practices reference bundled with that same
  tooling, verified current as of HA core 2026.8.3 per its own text,
  explicitly categorizes `timer` under "storage-collection helpers
  (`<domain>/create`)" - a disjoint list from the config-entry/config-flow
  helpers (`generic_thermostat`, `threshold`, etc.). (3) A second read of
  `components/timer/`'s own source, same as v1.110.2 did. All three agree.
  This is about as confident as this integration can get on an HA
  internals question without HA core's own test suite.

  **What got built:** `_ensureTimerHelpers()` (new, duplicated per this
  project's established per-card convention, in both
  `family-week-calendar-card.js` - called right after every successful
  Settings save, since memberUserIds only changes there - and
  `family-hub-active-timers-card.js` - called once on first load, so an
  existing household gets backfilled without re-saving Settings). Creates
  one **"Family Hub \<Name\>"** helper per member (entity_id
  `timer.family_hub_<slug>`, HA's own slugify - a JS port,
  `_slugifyForEntity`, mirrors the backend's existing `slugify_for_entity`
  in `chores_websocket_api.py`) plus **4 always-present shared ones**,
  `"Family Hub Family 1"`-`"Family Hub Family 4"` ->
  `timer.family_hub_family_1..4`, for timers nobody's assigned to.
  Idempotent (skips any entity_id already in `hass.states`) and
  best-effort (every failure swallowed - a Settings save must never fail
  because a helper couldn't be created; `restore:true` is retried without
  it if an older core rejects the extra key). The backend's existing
  adoption chain (`_pick_native_timer` in `chores_websocket_api.py`,
  already built in v1.110.2/early v1.110.3 work) already preferred, in
  order: the assigned person's own dedicated helper (predicted via
  `dedicated_timer_entity_id`, which derives it from their CURRENT display
  name rather than a stored mapping - nothing to migrate, nothing that can
  go stale on a rename) -> the shared family pool -> any other adoptable
  `timer.family_hub*` helper (the old v1.110.2 behavior, for backward
  compatibility with hand-made extras) -> unbacked. **Cleanup decision: a
  removed member's dedicated helper is deliberately LEFT IN PLACE** -
  removing someone from Family Hub is already a fully reversible act that
  never deletes their profile/permissions/assignments elsewhere (see
  `SETTINGS_KEY_MEMBER_USER_IDS`'s own comment), and their old helper
  becomes generally re-adoptable by anyone once they're off
  `memberUserIds` rather than staying reserved for nobody.

  **Task 2 - automation visibility.** "We also need to have a way to
  understand what the timer is doing to tie into automations... how do we
  know what the reward or chore behind the timer is so we can use them in
  automations?" A native `timer.*` helper's own schema (duration/
  remaining/finishes_at/etc.) has no room for custom attributes, so that
  mapping only ever lived in Family Hub's own in-memory timers Store -
  invisible to a plain HA automation. Two complementary mechanisms, built
  together since they serve different needs:
    - New `family_hub/sensor.py` platform (forwarded alongside `todo` in
      `async_forward_entry_setups`, same self-contained-module convention
      as `todo.py`): one `FamilyHubTimerSensor` per currently-RUNNING
      timer, dynamically added/removed as timers start/end (there's no
      fixed count) rather than pre-declared. State = the timer's `kind`
      (chore/reward/standalone); attributes carry `chore_id`,
      `reward_item_id`, `title`, `user_id`, `user_name`,
      `native_timer_entity_id` (the adopted `timer.*` helper, if any - the
      cross-reference an automation triggering off THAT entity needs),
      `started_at`, `duration_minutes`, `finishes_at`. Entities created at
      the same 3 call sites that already adopt a native timer
      (`ws_start_chore_timer`/`ws_start_reward_timer`/
      `ws_start_standalone_timer`) and removed at every place that already
      calls `timer_engine.remove_timer`/`remove_timers_for_chore`
      (`handle_native_timer_event`, `_expire_due_timers`,
      `ws_cancel_timer`, `_clear_chore_timers`) - `create_timer_sensor`/
      `remove_timer_sensor`/`remove_timer_sensors` in `sensor.py`, best-
      effort (a silent no-op if the platform hasn't finished loading yet -
      the timer itself still runs and fires normally either way). Also
      backfills a sensor for each already-running timer in
      `async_setup_entry`, so a mid-countdown HA restart doesn't leave
      automations blind until the next start.
    - New `EVENT_FAMILY_HUB_TIMER_FINISHED` (`family_hub_timer_finished`)
      in `const.py`, fired from the single `_fire_timer` dispatcher (which
      both the native-event path and the backstop sweep already funnel
      through - one call site covers all three kinds and both completion
      paths) with the same identifying fields as the sensor's attributes.
      Deliberately NOT fired on cancel - "finished" means it ran out, same
      semantics as HA's own `timer.finished`.

  See the README's Timers section for the concrete "when Sam's
  screen-time reward ends, lock his computer" automation YAML (both an
  event-trigger and a sensor-state-trigger variant).

  **Tests:** 15 new in `test_timers.py` (own-dedicated-helper preference,
  never-borrows-someone-elses, a removed member's helper becoming
  generally adoptable again, the shared-pool and other-adoptable
  fallbacks, the custom event firing with correct data for all three kinds
  via both the native-event and sweep paths and NOT firing on cancel, the
  sensor's state/attributes/availability, its removal on both fire and
  cancel, sensor creation being a no-op before the platform has loaded,
  and the platform backfilling already-running timers on setup) - all via
  `FakeBus.async_fire` now actually recording calls (previously a no-op)
  and a new `FakeAddEntities` capturing entities `async_add_entities`
  would receive. New `test_timer_helper_autoprovision.js` (slugify parity
  with the backend, idempotency, the shared-pool creation, and the
  `restore:true`-rejected-by-an-older-core fallback). Full sweep run - see
  below for the result.

- **v147.2 (1.110.2)**: "this should use the home assistant native timer.*"
  Rearchitecture of the v1.110.0/v1.110.1 timer subsystem onto HA's native
  `timer` domain. Zero user-facing behavior change by design - this is a
  refactor of the foundation, not a rebuild.

  **THE RESEARCH, because the obvious approach is genuinely impossible
  rather than merely awkward, and this is the kind of thing a future session
  will otherwise re-litigate.** The question was whether a custom
  integration can create `timer.*` entities per running timer, the way
  `family_hub/todo.py` dynamically creates a `todo.*` entity. It cannot:

    - `homeassistant/generated/entity_platforms.py` - HA's own canonical
      list of domains an integration may provide entities for - contains
      `todo` but NOT `timer`. There is no `Platform.TIMER`, so
      `async_forward_entry_setups(entry, ["timer"])` has nothing to forward
      to. This alone is conclusive.
    - Corroborating it in `components/timer/__init__.py`: no
      `async_setup_entry`, no `PLATFORM_SCHEMA`, and it never calls
      `component.async_setup(config)` - all three of which
      `components/todo/__init__.py` DOES have (todo: `PLATFORM_SCHEMA` at
      L49, `await component.async_setup(config)` at L195, `async_setup_entry`
      at L199). `timer` is a HELPER domain, same family as input_boolean /
      counter / schedule: entities come only from YAML or the Helpers UI via
      a `TimerStorageCollection`, and that collection is a LOCAL VARIABLE in
      `async_setup`, never published to `hass.data`, so no other integration
      has a handle on it either.
    - `Timer.extra_state_attributes` is a FIXED schema (duration, editable,
      last_transition, finishes_at, remaining, restore) - no arbitrary
      custom attributes - so a side-table mapping entity_id -> {kind,
      chore_id/item_id, user_id, ...} is required regardless of approach.
      It DOES expose `finishes_at` and `remaining`, which the frontend can
      read.
    - The only remaining route is the private
      `hass.data["entity_components"]["timer"]` EntityComponent plus a
      hand-rolled subclass of HA's private `Timer` (a
      `collection.CollectionEntity`), bypassing `sync_entity_lifecycle`.
      Unsupported, invisible to the Helpers UI, and precisely the
      private-internals coupling that breaks silently on an HA refactor -
      the same class of risk this codebase already declined for the menu
      encoder in v146.6. **Deliberately not done.**
    - Live-instance check: the household has the `timer` integration loaded
      (all six services present) but **zero** timer helper entities - so any
      design requiring pre-created helpers would have been dead on arrival
      without a fallback.

  **OUTCOME: (B), but an active one - Family Hub ADOPTS native timers
  rather than creating them.** Any helper the household creates whose
  entity_id starts with `TIMER_ENTITY_PREFIX` (`timer.family_hub`) and is
  sitting `idle` is an adoptable pool entity. On start,
  `_adopt_native_timer` claims a free one and calls the real `timer.start`
  service with an `HH:MM:SS` duration; the binding is stored as `entity_id`
  on the timer record. Completion becomes **event-driven**:
  `handle_native_timer_event` (registered in `async_setup_entry` against
  HA's own `timer.finished` / `timer.cancelled` bus events) resolves the
  event's entity_id back to the Family Hub timer via
  `timer_engine.timer_for_entity` and fires it. A timer running this way is
  a genuine first-class HA entity - Developer Tools, dashboards, automation
  triggers - which is presumably the whole point of the request.

  **Naming convention rather than a Settings picker** - no UI, no migration,
  nothing to keep in sync; a household opts in purely by creating helpers.
  Only `idle` + unbound entities are adopted, so someone's own kitchen timer
  is never hijacked (tested).

  **What did NOT change, and the mechanism that guarantees it.** The three
  `_fire_chore_timer` / `_fire_reward_timer` / `_fire_standalone_timer`
  functions are **byte-identical** to v1.110.1. A new `_fire_timer`
  dispatcher was factored out so both completion paths - HA's event and the
  sweep - go through one place, which is what makes "only the trigger moved"
  literally true rather than aspirational. So the chore-timer-reuses-Done
  guarantee, no_approval_required/PERMISSION_AUTO_APPROVE, the
  one-reward-timer-per-person rule, the full cancel-permission matrix, the
  colour-coding, the quick-timer modal and the notify behavior are all
  untouched.

  **The 30s sweep stays, demoted to a backstop** (`TIMER_SWEEP_SECONDS`'s
  comment updated to say so). Two reasons: most timers have no native entity
  behind them, and an event can be missed (HA restarting mid-countdown on a
  helper with `restore` off). A countdown that silently never ends is a far
  worse failure than one that ends a few seconds late. When the sweep does
  catch a bound-but-unfired timer it releases the helper back to the pool.

  **Zero-setup path is fully preserved and explicitly tested**: with no
  helpers present, `_adopt_native_timer` no-ops, no `timer.*` service is
  called at all, and everything behaves exactly as v1.110.1 did.

  **Frontend**: `_timerRemainingSeconds` in all four cards now prefers HA's
  own `finishes_at` attribute when the timer is entity-backed, falling back
  to the original `started_at + duration` math otherwise (and also falling
  back if the entity is unknown, so a stale binding can't pin a countdown at
  0). Both paths stay derived rather than a stored counter.

  `manifest.json` gained `after_dependencies: ["timer"]` - not
  `dependencies`, because Family Hub works perfectly well with the timer
  integration absent; this only asks HA to set it up first when it IS
  present, so the adoption pool is populated on our first start.

  **Tests**: `test_timers.py` 34 -> **47** cases. The harness gained
  `FakeState`/`FakeStates`/`FakeEvent` and a `native_timers=` fixture, and
  `FakeServices` now models `timer.start`/`timer.cancel` flipping a helper
  between active/idle. New cases: adoption picks the first free entity, a
  second timer takes the next one, nothing free still starts unbacked, an
  unprefixed helper is never hijacked, no-helpers-at-all is completely
  unaffected, `timer.finished` completes a chore identically to the sweep
  (both approval outcomes), reward and standalone firing through the event,
  `timer.cancelled` clears without completing, unknown/malformed events
  ignored, a fired helper is reusable, cancel and manual-Done both release
  the helper, and the sweep still backstops a missed event.
  `test_active_timers_card.js` gained a case proving HA's `finishes_at` is
  genuinely preferred (fixture whose start+duration math would say 0) plus
  the unknown-entity fallback.

- **v147.1 (1.110.1)**: "We should also build an active timers card that
  shows all the timers active in the house, color coded if they are assigned
  to someone based on their user color. You should be able to have a pop up
  modal that has 3-4 common timer times, optional assign to user and optional
  add time, will show up as a card on the active timers screen." Patch bump
  on top of v1.110.0 rather than another minor - this EXTENDS the timer
  subsystem shipped an hour earlier rather than introducing a second one.

  **New card `family-hub-active-timers-card.js`**, wired through the usual
  four-step static-path / content-hash / `_register_dashboard_resource`
  pattern (`ACTIVE_TIMERS_CARD_JS_URL`). Config is an optional `title` only,
  matching the Chores/Rewards/Goals convention - no entities. Theme/settings/
  users boilerplate is copy-pasted from the goals card per this project's
  established per-card convention.

  **Standalone timers: a third `kind` in the SAME store, not a second
  system.** `TIMER_KIND_STANDALONE` joins `"chore"`/`"reward"` in the existing
  `timers` store, with `chore_id`/`item_id` absent and the `title` carrying
  the free-text label. It shares the entire lifecycle - the same expiry
  sweep, the same `remaining_seconds` math, the same notification plumbing,
  the same cancel command - and the ONLY divergence is what firing does
  (`_fire_standalone_timer`: notify, and nothing else; no chore completed, no
  stars). One new websocket command, `family_hub/timers/start_standalone`,
  following the shape of the two v1.110.0 start commands.

  **Colour source (decision):** reuses each person's EXISTING colour, resolved
  exactly as `family-hub-chores-card.js`'s `_userColor` does -
  `settings.userProfiles[id].color` (set on the calendar card's Users tab)
  when present, otherwise their `PALETTE[index]` slot. Copy-pasted rather
  than reinvented specifically so recolouring someone in Settings changes
  them on this board too. An unassigned timer gets `UNASSIGNED_COLOR`
  (neutral grey) plus an `.unassigned` class rather than borrowing an
  arbitrary person's colour - tested in both directions, including that a
  custom profile colour beats the palette slot.

  **Label AND custom-minutes, both (decision):** "optional add time" in the
  request could plausibly mean either a free-text note or a custom duration.
  Neither field is expensive, so the modal has both - four presets
  (`TIMER_PRESET_MINUTES = 5/15/30/60`, chosen for the household-timer use
  case: 5 for turn-taking, 15/30 for cooking and screen-time slices, 60 for
  the long one) plus a custom-minutes box that overrides a selected preset
  (typing clears the chip, so two contradictory selections can never show),
  plus an optional label. The label is what makes a board of five
  simultaneous timers legible at all.

  **Duration comes from the client here**, unlike the other two kinds, because
  there is no chore or catalog item to read it off -
  `normalize_timer_minutes` still clamps 1..24h, tested with 0 and 999999.

  **Assignment is optional and ungated (decision):** anyone can start one and
  assign it to anyone. It costs nothing, gates nothing and takes nothing away
  from the assignee, so a permission check would be friction for no benefit -
  this is the one timer command with no permission check at all, and that
  asymmetry is deliberate (the other two start a chore completion and a star
  spend respectively). `started_by` is recorded so the cancel rules stay
  recoverable.

  **Cancel default for standalone (decision):** an UNASSIGNED timer can be
  stopped by anyone - it belongs to the room, and making people hunt down
  whoever tapped Start to silence the kitchen would be absurd. An ASSIGNED
  one can be stopped by the person it's for, by whoever started it (so a
  mis-assignment is immediately undoable by the person who made it), or by an
  admin. Looser than the chore/reward rules precisely because nothing is lost
  by cancelling - no stars, no chore. The card's `_canCancelTimer` mirrors
  all of this so no dead button is ever offered; the backend re-checks
  independently.

  **Notify on expiry (decision):** an ASSIGNED standalone timer notifies that
  person's own snapshotted targets, consistent with how reward timers already
  tell their owner. An UNASSIGNED one has nobody of its own, so it falls back
  to `_all_household_notify_targets` (every configured target, de-duplicated)
  - which is the point of unassigned timers: "the oven is done" is news for
  whoever is nearest the kitchen.

  **Per-person cap:** deliberately does NOT apply to unassigned standalone
  timers (the oven, the pasta and a board game must be able to run at once);
  an assigned one is capped like the other kinds.

  **Board rendering:** responsive `auto-fill/minmax(150px,1fr)` grid, sorted
  soonest-finishing first, `font-variant-numeric: tabular-nums` on countdowns
  so ticking seconds never reflow, and a gentle `.is-finishing` pulse under
  the last minute. The 1s ticker and derived `started_at + duration` math are
  the same mechanism the chore/reward cards already use, copy-pasted.

  **Tests**: `test_timers.py` grew from 23 to **34** cases (standalone kind in
  the shared store, unassigned-allowed-but-only-for-standalone, the
  not-capped-when-unassigned rule, label normalization, preset sanity,
  client-duration clamping, notify-on-expiry for both assigned and
  unassigned, all four standalone cancel outcomes, and Store resume). New
  `test_active_timers_card.js` covers config, all three kinds on one board
  from the single list command, colour-coding both ways, the derived
  countdown and ticker, the full modal (presets / custom override / label /
  assign / what gets sent), the cancel gating matrix, and the empty state.

- **v147.0 (1.110.0)**: "We need to be able to make chores and rewards have
  timer associated to them... 2 hours of gaming, when you click use reward a
  timer would start and then a timer would go off at the end of the 2 hours.
  Or if you have a chore thats like clean for 30 minutes, at the end of 30
  minutes it would set off a timer, and either go to approval mode or
  complete the award." Minor version bump rather than another patch - this
  is a new subsystem (an engine module, a Store, four websocket commands, a
  second scheduled interval) rather than a tweak.

  **Three design questions were put to the household first; their answers
  shaped the whole thing and are worth recording:**

  1. *What a chore timer ending should do* - "the chore already has a does
     not require approval and the users already have a permission for does
     not require approval on chores, this should handle it already." So a
     chore timer expiring is **an alternate way of pressing Done**, full
     stop. `ws_complete_chore`'s post-completion half was factored out into
     `_apply_chore_completion_effects`, and `_fire_chore_timer` calls the
     same `chore_engine.complete_chore` + that helper. **No completion logic
     is duplicated or re-implemented.** Awaiting-Approval vs instant payout
     is decided exactly where it always was, off the chore's own
     `no_approval_required` (v146.6) and the completer's
     `PERMISSION_AUTO_APPROVE`. Both directions are tested.
  2. *Backend-driven* - "Yes, backend-driven (recommended)."
  3. *One active reward timer per person* - "Yes, one active timer per
     person (recommended)."

  **Storage/engine**: new `timer_engine.py` (pure functions over a dict, no
  HA imports, same shape as chore_engine/reward_engine/goal_engine) plus a
  `TIMERS_STORAGE_KEY_PREFIX` Store wired into `entry_data` as
  `timers`/`timers_store`, following the todo_card_config/menu_suggestions
  template. A record is `{uid, kind, chore_id|item_id, title, user_id,
  started_at, duration_minutes, notify_targets}` and exists **only while
  counting down** - firing or cancelling deletes it, because both outcomes
  are already recorded elsewhere (on the chore; in the redemption log).
  `title` and `notify_targets` are **snapshotted at start** so a renamed
  chore or an edited profile mid-countdown still produces a sensible push.
  Stored as **start + duration, never a ticking counter** - which is what
  makes a Home Assistant restart or page reload resume at the correct
  remaining time instead of starting over.

  **Poll interval - a deliberate second interval.** The main `_poll` runs
  every `CONF_POLL_MINUTES` (default 5). That is right for "remind me 30
  minutes before an event" and wrong for a countdown someone is watching
  hit zero - a 30-minute chore timer firing up to 5 minutes late reads as
  broken. So timers get their own `async_track_time_interval` at
  `TIMER_SWEEP_SECONDS` (30s), registered alongside `_poll` in
  `async_setup_entry` with its own `cancel_timer_sweep` in
  `async_unload_entry`. It is explicitly **not** a second general-purpose
  poller: it shares no work with `_poll`, does no network or entity work,
  and returns immediately when nothing has expired (the common case). In
  `_expire_due_timers` a timer is **removed and persisted BEFORE its action
  runs** - a timer that somehow threw on completion would otherwise retry
  every 30s forever, turning one bad record into an endless notification
  loop; firing at most once and logging the failure is the safer half.

  **Rewards schema**: `timer_minutes` is an **independent optional field, not
  a fourth `redeem_mode`**. The three modes describe how the STAR COST is
  consumed (one-off / accumulating bank / once-ever); a timer describes what
  happens AFTER redeeming. They compose - "1 hour of TV, banked" both adds to
  a bank and starts a countdown - and folding the timer into the mode
  enumeration would have made that unexpressible. `ws_start_reward_timer`
  does the ordinary `reward_engine.redeem_item` (same stars, same
  `_notify_reward_claimed`) and starts the timer on top; **the
  one-per-person check runs BEFORE redeem_item**, so a refused second timer
  never charges anybody for a reward that didn't start (tested).

  **One-per-person UX: block, not queue** - documented in timer_engine's own
  docstring. Queuing was the alternative and is worse here: you would tap
  Use, be charged, and see nothing happen for two hours with no natural place
  to show a queue. The cap is per PERSON per KIND, so a cleaning timer and a
  screen-time timer coexist (an ordinary afternoon) while a second of either
  is refused with "you've already got X running, N minutes left." A chore
  also allows only one timer regardless of who started it, since it is one
  piece of work. `ws_cancel_timer` exists because a mis-tapped two-hour timer
  with no way out is a real hole - and with the cap it would also lock that
  person out of every other timed reward. Cancelling a reward timer
  deliberately does **not** refund stars (that is what reverse-redemption is
  for; conflating them would let someone start/cancel repeatedly).

  **Permissions** mirror the non-timer equivalents exactly, on the principle
  that starting a timer is a way of doing the thing it ends in: your own
  chore/reward needs nothing extra; someone else's needs
  `PERMISSION_VERIFY` **or** `PERMISSION_COMPLETE_ANY` for chores (matching
  `ws_complete_chore`) and `PERMISSION_REWARD_OVERRIDE` for rewards
  (matching `ws_redeem_reward`). A chore timer started by a parent for a
  child **belongs to the child** - counted against the child's cap, notifying
  the child's devices. Cancel follows the same split, plus "always your own."

  **Edge cases**, all tested: completing by hand mid-timer clears it ("don't
  fight the user"); deleting a chore clears it; **reassigning** clears it
  (silently transferring "12 minutes left to clean" to someone who never
  agreed, or leaving it counting for the ex-assignee, are both worse than
  making the new assignee tap Start); a timer whose chore vanished or was
  already completed fires silently; a corrupt `started_at` reads as expired
  rather than becoming an un-killable stuck timer.

  **Frontend**: both boards fetch `family_hub/timers/list` and run a **1s
  ticker that repaints only `[data-timer-uid]` text in place** - a full
  re-render every second would fight scrolling, drag-and-drop and open
  modals. The visible countdown is computed locally from
  `started_at + duration_minutes` (mirroring `timer_engine.remaining_seconds`)
  so it ticks smoothly between polls, while the backend remains the only
  thing that decides a timer is done; when a countdown visibly hits zero the
  card re-fetches once (guarded) to find out what actually happened. Chores:
  Start **alongside** Done, countdown + cancel while running. Rewards: timer
  badge next to the mode badge, Use starts the timer, every other timed
  reward disabled with a title saying what's running, untimed rewards
  unaffected. My Chores shows both **read-only** (start/cancel live on the
  full boards - three places to keep in sync wasn't worth it). Countdowns use
  `font-variant-numeric: tabular-nums` so ticking seconds don't reflow rows.

  **Tests**: new `test_timers.py` (23 cases - engine math/clamping/ordering,
  Store round-trip resuming at the right remaining time, permissions both
  directions, the completion-path reuse in **both** approval outcomes,
  reward-end notify-only, no-stars-spent-on-refusal, and all the lifecycle
  cleanups) and `test_timers_cards.js` (6 groups - shared remaining-time
  math, chores Start/countdown/cancel with Done still present, the modal
  fields, rewards badge/Use/one-per-person block/cancel, and a sibling's
  timer not blocking yours).

- **v146.9 (1.109.9)**: "We should make the todo card fully customizable,
  add rows columns, etc so you can have your lists shown how you want a
  line of lists, 2 stacks, 3 stacks etc." Configurable board layout for
  `family-hub-todo-card.js`.

  **Research first, per this repo's convention for anything substantial.**
  Today the board was `_boardHtml()` returning exactly ONE
  `<div class="todo-board-row">` (`display:flex; overflow-x:auto`) holding
  every column, with `.todo-column { flex: 1 1 240px; max-width: 340px }`
  and a `@media (max-width:700px)` rule turning each column into
  `flex: 0 0 82vw` (one per screen, swipe for the next).

  **The drag-and-drop risk turned out to be a non-issue, and it's worth
  recording why** since it's the obvious thing to fear here. All five drag
  listeners (`dragstart/dragend/dragover/dragleave/drop`) are attached ONCE
  in `_build` to the `.board` element, which `_render()` never replaces (it
  only rewrites `.board.innerHTML`), and every handler resolves its target
  through `e.target.closest(".todo-column-items")` / `.closest(".todo-item")`.
  None of them walk the DOM upward past the column, reference
  `.todo-board-row`, or assume sibling ordering. So rendering N sibling
  rows inside the same `.board` changes nothing about drag behavior -
  cross-ROW dragging is just cross-column dragging. Verified end to end
  rather than by inspection (see tests below), including that `dragover`
  still highlights a container in a different row.

  **Design call: ROWS (stacks), not columns.** Two reasons. It's the
  household's own framing ("a line of lists, 2 stacks, 3 stacks"), and it's
  the formulation that survives a varying list count - "3 columns" is
  meaningless with two lists selected and awkward with seven, whereas "3
  stacks" always describes something real and the per-row column count
  falls out of it. The existing CSS already agreed: the board has always
  rendered one `.todo-board-row`, so N rows is an extension, not a rewrite.
  **Control: a segmented row of preset buttons** (`1 row` / `2 rows` /
  `3 rows` / `4 rows`, one `.active`) rather than a number stepper - four
  options is few enough to show every choice at once, and one-active-button
  is this app's existing shape for a short enumerated choice (compare the
  calendar card's On/Off profile toggles). A `.layout-hint` under it
  describes the result against the CURRENT selection count, since the real
  question when picking is "what will MY board look like."

  **Implementation**: `_boardRows()` (clamped 1..`TODO_CARD_MAX_BOARD_ROWS`,
  defaults 1), `_boardRowGroups()` (chunks `_listDescriptors()` by
  `ceil(total/rows)`, so remainder lands on the LAST row - 5 lists in 2 rows
  is 3+2, reading like a paragraph - and empty rows are dropped when more
  rows are chosen than lists exist), and `_boardHtml()` emitting one
  `.todo-board-row` per group with a `.multi-row` modifier. The layout
  control deliberately does NOT reorder anything: `_listDescriptors()` order
  (i.e. the List(s) tab's own selection order) still decides which list
  lands where, the layout only decides where that sequence wraps.
  `.multi-row` drops `overflow-x:auto` and switches columns to
  `flex: 1 1 0; max-width:none` so stacked rows genuinely tile - leaving the
  scroll on would have produced N independently side-scrolling strips, which
  reads as broken. Under 700px the `.multi-row` tiling is deliberately
  undone (columns go back to `0 0 82vw`, rows scroll): the stacks and their
  order are still honoured, they just each behave like the single-row
  layout, because tiling 2-4 columns into a phone width gives slivers. The
  saved setting is untouched by this - it is purely a rendering decision.

  **Persistence**: a new `rows` field in the SAME `todo_card_config`
  backend store as the list selection, for exactly the reason v146.5 moved
  that selection off Lovelace config - a `config-changed` event dispatched
  from a plain, non-editing view is heard by nothing, so the setting would
  silently evaporate on the next reload. New `TODO_CARD_MAX_BOARD_ROWS = 4`
  in `const.py` (mirrored as a JS const in the card), clamped on both write
  and read so neither a stale client nor a hand-edited `.storage` file can
  hand the card a nonsense layout. One notable asymmetry, deliberate and
  commented: `rows` is **merge-on-omit** in `_ws_set_todo_card_config`,
  while the two list fields stay a full replace. An older card build saving
  its list selection doesn't know `rows` exists and won't send it, and a
  full replace would reset a household's layout to one row every time
  someone on a stale browser tab changed which lists they show. `rows` is
  `vol.Optional` for the same reason - an older client must not be rejected.

  **Tests**: `test_todo_card_config_storage.py` gained four cases (round-trip
  surviving a simulated reload, clamping on write AND on read, omit-preserves,
  never-set-stays-absent) and its whole-dict equality assertions were
  loosened to field checks since the response legitimately grew a field.
  `test_todo_card.js` gained: default-is-still-one-row, `_boardRowGroups`
  distribution/order/clamping/no-empty-rows, the DOM actually rendering two
  rows with `.multi-row` and the right list in each, the preset buttons
  (count, labels, active marker, draft-not-applied-until-Save), save
  round-tripping through the store and surviving a fresh card instance, and
  **the cross-row drag**: dragstart in row 1, dragover highlighting a
  container in row 2, drop producing `todo.add_item` on the row-2 list plus
  `todo.remove_item` on the row-1 list - plus a within-row reorder still
  producing `todo.move_item` under a 2-row layout.

- **v146.8 (1.109.8)**: "we never implemented the cleaner UI for additional
  recipe picker did we? when you select to add a recipe not from grocy it
  just gives you 2 boxes, name and link and says save. trying to get away
  from the popup UI on this item." Confirmed: `_addAdditionalRecipeFromLink`
  was literally two sequential blocking `window.prompt()` calls ("Recipe
  name:", then "Recipe link (optional):"). Not a custom modal - browser
  chrome, stacked over the meal editor, and genuinely unreliable where this
  card lives (several Android kiosk WebViews suppress `window.prompt`
  outright, so the button could silently do nothing).

  Replaced with an **inline** add/edit form inside the same
  `.additional-recipes-field`, no new modal layer:
  `.additional-recipe-inline-form` (name input + link input +
  Cancel/Add), shown by `_openAdditionalRecipeForm(editIdx)` and hidden by
  `_closeAdditionalRecipeForm()`. Matches this file's existing inline-add
  convention (compare `.member-add-row` on the Users tab) rather than
  inventing a surface: the two "+" buttons hide while the form is open so
  there's one clear thing to do, and Cancel/Add put them back. Add is
  **disabled until a name is typed** instead of raising an alert - a
  disabled button is the non-popup way to say the same thing. Enter
  commits, Escape cancels. `_updateAdditionalRecipeFormState()` drives the
  disabled state off an `input` listener.

  The same form doubles as an **edit** surface (new `.additional-recipe-edit`
  pencil per row, `_additionalRecipeEditIdx` is null when adding): there was
  previously no way to fix a typo at all, only remove-and-re-add.
  `_commitAdditionalRecipeForm` replaces in place when editing and
  **preserves `grocyRecipeId`**, so renaming a Recipe-Box/Grocy-sourced side
  dish doesn't quietly sever its link to the live recipe. The row name's
  existing click-to-open-recipe behavior is untouched (the pencil is a
  separate button), as is `_addAdditionalRecipeFromLoved` / `_openLoved("additional")`.
  Nothing downstream changed at all: the form still only writes
  `this._editingAdditionalRecipes`, the same scratch array the prompt path
  wrote to, which `_saveEditor` still passes to
  `_upsertMealPlan`/`_upsertMealPlanByUid`'s `additionalRecipes` parameter.
  `_renderAdditionalRecipesList` closes the form at the top of every render,
  so a removed/replaced entry can never leave it editing a stale index.

  **Gating change worth noting**: the Additional recipes field gained
  `menu-edit-only-field`, so it is now hidden for a non-`_canEditMenu()`
  user like repeat-weekly/leftovers/move already were. It was NOT gated
  before - a suggest-only user could edit the list, but
  `_suggestMealFromEditor` deliberately doesn't carry `additionalRecipes`,
  so it was a dead-end control whose contents were silently discarded.
  Hiding it is the honest version of what already happened.

  `test_additional_recipes.js` rewritten off the prompt stub and onto the
  real DOM affordances (the "+ From a link" button, the inputs, the Add
  button), plus new cases: form collapsed until opened, + buttons step
  aside, Add disabled-then-enabled, **zero `window.prompt` calls fired**,
  Cancel adds nothing and reopens empty, Escape cancels / Enter commits,
  and edit-in-place preserving `grocyRecipeId` without appending.
  `test_menu_permission_card.js` gained explicit assertions for the newly
  gated field in both directions.

- **v146.7 (1.109.7)**: "left overs should be an accordian." Pure UI tweak
  in `family-week-calendar-card.js`. The meal editor's leftovers day-picker
  (`.leftover-days-picker`, 13 checkboxes from `_renderLeftoverDaysPicker`)
  was an always-expanded block and is the tallest single field in that
  modal. Wrapped it in this file's **existing** accordion pattern - a
  `.accordion-toggle[data-target]` header + `.accordion-body#menu-leftovers-body`,
  driven by the one generic `root.querySelectorAll(".accordion-toggle")`
  click handler already wired in `_build` - rather than inventing a new
  collapsible. It's a NESTED accordion (it lives inside the editor's own
  "More options" `.accordion-body`), so `.leftovers-accordion-toggle` is
  styled flat/transparent to read as a sub-section instead of competing
  with its parent header.

  New `_syncLeftoversAccordion(pickedCount)`, called from
  `_renderLeftoverDaysPicker`: **collapsed by default, auto-expanded when
  the meal already has leftoverDates**. That exception is deliberate -
  hiding a setting that's actually ON behind a closed drawer is how someone
  forgets a meal is still set to reappear on Thursday; the accordion exists
  to get 13 checkboxes out of the way in the common no-leftovers case, not
  to conceal live state. The header carries the count either way
  (`_leftoversAccordionLabelHtml`), and a change listener on each checkbox
  calls `_updateLeftoversAccordionLabel()` so the count stays honest live
  without re-collapsing the drawer someone just opened. The sync runs on
  every editor open because the modal's DOM is persistent - without an
  explicit reset the previous meal's drawer state would carry over.

  **Permission gating is unaffected**: the accordion wrapper is the same
  `.field dish-hide-field menu-edit-only-field` element as before (now also
  `.leftovers-field`), so `_applyMenuEditPermissionUi` still hides the whole
  thing for a non-`_canEditMenu()` user via `style.display`, independent of
  expand/collapse state. `test_meal_leftovers.js` gained coverage for all of
  it: expanded-with-count for a meal that has leftovers, collapsed-with-plain-header
  for one that doesn't, click-to-collapse/re-expand through the generic
  handler, live count update that doesn't collapse, per-open state reset,
  and the field still hidden for a suggest-only user / visible for an editor.

- **v146.6 (1.109.6)**: "need a permission to edit menu, prevents kids from
  messing with the menu, anyone can suggest but only ones with edit menu
  permission can edit. also we need to make the permissions cleaner, and
  more compact the UI is quite long." Two things in one version.

  **1. `PERMISSION_EDIT_MENU` (`can_edit_menu`).** Added to `const.py` and
  to the `CHORE_PERMISSIONS` tuple - that tuple is the single generic list
  every permission loop keys off (the store's default entry,
  `ws_set_permissions`'s write loop, `ws_get_my_permissions`'s response),
  so adding it there is all that was needed on the read side; only
  `ws_set_permissions`'s own `websocket_command` schema needed an explicit
  `vol.Optional("can_edit_menu"): bool` since voluptuous schemas can't be
  built from a tuple at decoration time the way the loops can. Rationale:
  the menu had **zero** permission gating before this - any household
  member could rewrite the whole week. Shaped as a grant-to-elevate (like
  `PERMISSION_REWARD_ADD`), not a hard block: without it you can still open
  a meal slot and compose something, you just can't commit it.

  **2. Menu suggestions (new store + four websocket commands).** New
  `MENU_SUGGESTIONS_STORAGE_KEY_PREFIX`/`_VERSION` in `const.py` and a
  `menu_suggestions_store` in `async_setup_entry`/`entry_data`, following
  the `todo_card_config_store` template exactly (one Store per feature, so
  no feature's full-replace save can clobber another's keys). Each entry is
  `{uid, date_key, block_index, name, description, link, grocy_recipe_id,
  servings, suggested_by, suggested_by_name, created_at}` - day- AND
  block-specific, which is why this is NOT folded into the existing
  `SUGGESTIONS_STORAGE_KEY_PREFIX` wishlist (that one is flat, date-less,
  has no suggester identity and no apply step). Commands in `__init__.py`:
  `family_hub/get_menu_suggestions` and `add_menu_suggestion` are open to
  any authenticated user ("anyone can suggest"; identity fields are
  stamped server-side and aren't even in the add schema, so they can't be
  spoofed); `apply_menu_suggestion` requires
  `_has_permission(..., PERMISSION_EDIT_MENU)`; `remove_menu_suggestion`
  passes on `PERMISSION_EDIT_MENU` **or** `suggested_by == _actor_id(...)`
  so a kid can retract their own but not a sibling's.

  **The deliberate enforcement split - read before "fixing" it.** The meal
  plan is not Family Hub data: it lives on a native HA `todo.*` entity
  (`CONF_MEAL_PLAN_ENTITY`) and the calendar card has always written to it
  directly from the browser via `hass.callService("todo", ...)`, with
  per-meal metadata JSON-packed into each item's `description`
  (`_upsertMealPlan` encodes, `_parseDishDescription` decodes). There is no
  Family Hub command in that write path at all - unlike Chores, where
  every mutation goes through a `_has_permission` handler. Fully enforcing
  the menu server-side would mean re-implementing that entire CRUD surface
  in Python, including a byte-exact twin of the JS description encoder
  (recurring anchors, leftovers day-pickers, additional recipes, colors,
  Grocy servings) and keeping the two in lockstep forever - a large, risky
  duplication whose most likely failure mode is silent drift corrupting
  real meal data, for a threat model of "stop a kid from rearranging
  dinner." So: **committing a suggestion IS genuinely backend-enforced**
  (`_ws_apply_menu_suggestion` re-derives the permission and calls
  `hass.services.async_call("todo", "add_item"/"update_item", ...)` itself,
  server-side, via a small `_encode_dish_description` helper that mirrors
  the JS field names exactly); **ordinary edit/move/delete of an
  already-placed meal stays frontend-gated only**, the same caveat that
  already applies to every other frontend-gated action in this app, and no
  worse than the pre-v146.6 status quo of no gating whatsoever. The long
  design note above `_encode_dish_description` in `__init__.py` says all of
  this in place; if the menu is ever migrated off `todo.*` onto a Family
  Hub store, the limitation disappears on its own.

  **Frontend (`family-week-calendar-card.js`).** This card had **no**
  permission-fetching code at all before now - `_isAdmin`/`_myUserId`/
  `_hasPermission`/`_fetchMyPermissions` (+ a `_canEditMenu()` wrapper)
  were introduced here, mirroring `family-hub-chores-card.js`'s convention
  exactly, including its "this is UX only, the server re-derives anything
  that matters" caveat comment. `_fetchMyPermissions()` is **awaited** in
  `_initFirstLoad` (not fire-and-forget) so the first editor opened in a
  session already knows the answer rather than briefly offering Save to a
  kid. `_applyMenuEditPermissionUi()` hides `.btn-save`, `.btn-clear` and
  the new `.menu-edit-only-field` group (repeat-weekly / leftovers / move)
  and reveals `.btn-suggest-meal` + `.menu-suggest-hint`; it's called at
  the end of `_openEditorForDate` **and** again from
  `_setMealEditorViewMode`, which toggles `.btn-save`'s own display and
  would otherwise hand Save straight back when the pencil Edit button is
  tapped. `_saveEditor` also degrades to `_suggestMealFromEditor()` rather
  than writing, belt-and-braces, since Save is reachable by paths other
  than its own click handler. `_renderMenuSuggestions()` draws the pending
  strip (`.menu-suggestions-field`) filtered to the open slot, offering
  "Add to menu" only to `_canEditMenu()` holders and the dismiss × to them
  plus the suggestion's own author - matching exactly what the backend
  will allow, so no button is offered that would just fail. The Recipe
  Box's own dish editor shares the same modal and is explicitly exempted
  (`this._dishEditorMode`) - it isn't the menu and has always been open to
  everyone.

  **Permissions tab compaction.** `_renderPermissionsList` previously
  emitted 8+ hardcoded `<label class="remind-check-opt">` full-sentence
  lines per member, inline in the template - so the tab grew a screen
  taller with every new permission and adding one meant editing markup in
  two places. Replaced with a single `_permissionDefs()` array of
  `{key, label, group, hint}`, rendered by looping and grouping: `Chores`
  (assign / edit open / skip-approval / approve / complete anyone's / no
  approval needed), `Rewards` (override star costs / add to catalog),
  `Menu` (edit the menu). Labels are now short - the group header carries
  the context the old sentences had to - with the long explanation moved to
  a `title=` tooltip, and `.perm-group-opts` lays them out as a
  `repeat(auto-fit, minmax(150px, 1fr))` grid that's two columns in a
  tablet-width Settings modal and one on a phone with no media query.
  `_savePermissionCheck` needed no change at all (it only ever reads
  `check.dataset.user`/`.dataset.key`, both still set); a JS test asserts
  every `CHORE_PERMISSIONS` key is still rendered with both attributes so
  the compaction can't silently drop a grantable permission.

  **Tests**: new `test_menu_suggestions.py` (15 cases - the constant in
  `CHORE_PERMISSIONS`, `permissions/set` -> `permissions/get_mine`
  round-trip for a non-admin grantee, add open to a kid, client-supplied
  identity ignored, name/date validation, apply forbidden-for-a-kid **with
  a positive assertion that nothing was written to the meal-plan entity**,
  apply allowed for a grantee and for a bare admin, the applied
  description payload's exact JS field names, update-vs-add in an occupied
  slot, a different block left alone, a failed write leaving the
  suggestion pending for retry, and remove's three-way grantee/author/
  third-party outcomes) and `test_menu_permission_card.js` (6 cases -
  compacted grouped Permissions UI, permitted user still gets a direct
  meal-plan write, admin always passes, unpermitted user gets Suggest and
  never touches `todo.*`, `_saveEditor` degrades, and the suggestions strip
  offering Apply/dismiss to exactly who the backend allows).

- **v146.5 (1.109.5)**: "if you set the lists via the FAB and reload they
  all disappear the card should be able to be fully configured from the
  FAB." The deeper, real version of v146.4 bug #3 - that fix only stopped
  Home Assistant's "Edit Card" dialog from DROPPING grocy_list_ids on
  save. It didn't address the actual root cause: the List(s) tab's own
  save (`_saveListsTab`) only ever persisted through `this.setConfig(...)`
  + `this.dispatchEvent(new CustomEvent("config-changed", ...))` - the
  exact convention `family-screensaver-card.js`'s own `return-dashboard-
  select` field established for a plain (non-editor) card to save its own
  in-card config edits, believed to work generally in this codebase. It
  does NOT: that event is only ever listened for by Home Assistant's own
  dashboard *editing* machinery (the code path behind opening "Edit Card"
  or a dashboard in edit mode) - a card just being VIEWED, which is what
  the FAB is, has nothing listening for it at all. So every selection made
  through the List(s) tab lived only in the live card instance's own
  in-memory `this._config` and silently reverted to whatever the
  dashboard's own stored YAML/storage config still said (usually nothing)
  on the very next plain page reload - Edit Card never even had to be
  opened for this to happen; v146.4's fix addressed a real but secondary
  bug on top of one that was there since v146.2's original Settings modal.
  Root-caused this properly this time by first confirming, via real
  Home_Assistant MCP access + a source read of HA's own Lovelace frontend
  behavior around config-changed, that a plain viewed (non-editing) card
  dispatching that event has no listener at all - not by re-guessing from
  jsdom test behavior, which can't distinguish "persisted" from
  "updated the live instance's own config, but nothing saved it anywhere."
  **Fix**: gave this card's own list selection a dedicated, small backend
  Store, completely separate from the shared family_hub/get_settings blob
  used by the calendar card's own Settings modal - new
  `TODO_CARD_CONFIG_STORAGE_KEY_PREFIX`/`_VERSION` in const.py, a
  `todo_card_config_store` created in `__init__.py`'s `async_setup_entry`
  right alongside the other per-entry Stores and stashed in `entry_data`
  the same way, and two new websocket commands,
  `family_hub/get_todo_card_config` (returns `{"entities": null,
  "grocy_list_ids": null}` when nothing's ever been saved here yet - both
  null, not empty arrays, so the frontend can tell "never saved" apart
  from "saved, and explicitly nothing selected") and
  `family_hub/set_todo_card_config` (`{"entities": [...], "grocy_list_ids":
  [...]}`, a full replace - safe here, unlike family_hub/set_settings,
  because NOTHING else ever writes to this store, so there's no risk of
  clobbering a field some other saver doesn't know about - see
  `_ws_set_settings`'s own docstring for that exact bug class happening
  for real with SETTINGS_KEY_NOTIFY_PROFILES_MIGRATED). 4 new Python tests
  in `test_todo_card_config_storage.py` (empty store returns both null,
  round-trip, an explicitly empty selection round-trips as `[]` not
  `null`, a second save fully replaces the first, `set_todo_card_config`
  never touches the unrelated `settings_store`, both commands' `not_found`
  path). Frontend: new `_fetchTodoCardConfig()` (called from
  `_initFirstLoad`, right after `_fetchSettings`/before `_fetchAllLists`)
  populates `this._backendEntities`/`this._backendGrocyListIds` (both
  `null` until fetched, same as "nothing saved" - deliberately not
  distinguished, since both cases want the same fallback). New
  `_selectedTodoEntities()` and the updated `_grocySelectedListIds()` now
  check the backend fields FIRST, falling back to `this._config.entities`/
  `grocyListIds`/`includeGrocyShoppingLists` only as the legacy path for a
  card that predates this store (still round-tripped through
  `setConfig`/`FamilyHubTodoCardEditor` from v146.4, kept for that one
  reason - genuinely dead weight otherwise, but harmless to leave in place
  as the migration source). `_saveListsTab` is now `async`: applies the new
  selection optimistically to `_backendEntities`/`_backendGrocyListIds`
  and calls `this._render()` immediately (so the board updates the instant
  Save is clicked, before the network round trip even resolves), THEN
  calls `family_hub/set_todo_card_config` - and no longer touches
  `setConfig`/dispatches `config-changed` at all for this data; the FAB is
  now the single, fully durable source of truth once it's ever been used.
  New JS test coverage in `test_todo_card.js`: `makeHass`'s mock backend
  (`todoCardConfig`, a mutable closure variable seeded via `opts.
  todoCardConfig`, mutated by a `family_hub/set_todo_card_config` call the
  same way the real Store would be, and readable via a new
  `hass.__getTodoCardConfig()` accessor) lets a test literally simulate "a
  second, freshly-built card/hass reads back whatever the first one just
  saved" - the actual reload scenario the bug report described - rather
  than only asserting on the outgoing websocket call in isolation. The new
  regression test builds a first card, saves an explicit selection through
  the List(s) tab, then builds a SECOND card with DELIBERATELY DIFFERENT
  legacy YAML config (an extra todo.* entity, `include_grocy_shopping_
  lists: true`) but the same backend store object, and confirms the
  second card shows exactly the first card's saved selection, not a mix
  with its own legacy config - proving the backend selection genuinely
  wins rather than merely happening to agree with a same-config re-render.

- **v146.4 (1.109.4)**: four real bugs the household hit immediately after
  v146.3 (the tabbed FAB modal + Trello-style item detail modal) shipped -
  all fixed together, no new tests-passing-in-isolation surprises since
  live HA-instance access (via the Home_Assistant MCP tools + the built-in
  browser, both available this session) confirmed the root causes rather
  than guessing from jsdom test behavior alone (the browser pane itself
  couldn't load the real dashboard reliably enough to screenshot through,
  so the actual fixes were still driven by careful code-level reasoning +
  HA core domain knowledge, cross-checked against `family_hub/todo.py`'s
  own supported_features and `getConfigForm`'s schema).
  1. **"the modal doesn't show title, the done check mark is [not]
     labeled."** The item detail modal's checkbox and title input sat side
     by side with no label text at all - genuinely looked broken/blank
     next to the Add Item tab's own labeled fields. Fixed by wrapping both
     in their own visible label (`.detail-check-label` = "Done",
     `.detail-field-label` = "Title") in `_openItemDetailModal`.
  2. **"moving a card with a due date you get the error entity doesn't
     support setting field due date."** HA's `todo` domain only allows a
     `due_date`/`description` field on `todo.update_item`/`add_item` when
     the SPECIFIC entity's own `supported_features` bitmask
     (`TodoListEntityFeature` from HA core) actually advertises it - this
     integration's own `family_hub/todo.py` Chores-as-a-todo-list entity
     is itself a real example of one that doesn't (CREATE/UPDATE/DELETE
     only), and HA's stock "Shopping List" integration is another. Every
     call site that sends either field now checks first
     (`_todoEntitySupportsDueDate`/`_todoEntitySupportsDescription`,
     reading bits 16/32 (SET_DUE_DATE_ON_ITEM/SET_DUE_DATETIME_ON_ITEM)
     and 64 (SET_DESCRIPTION_ON_ITEM) off `hass.states[entity].attributes.
     supported_features`) - `_addItem`, `_moveItemAcrossLists` (the actual
     reported bug - dragging a due-dated item onto a list that can't take
     one used to throw and abort the whole recreate-then-remove move), and
     `_updateTodoItemDetails`. The Add form's due-date field and the item
     detail modal's description/due-date fields now hide themselves
     entirely for an unsupported entity (`syncDueVisibility` extended;
     `supportsDescription`/`supportsDueDate` computed once per
     `_openItemDetailModal` call) rather than show a control that just
     errors on submit - a `.detail-unsupported-hint` note explains why
     when a Grocy... no, a todo.* item supports neither.
  3. **"the card settings for what lists to show overrides the settings
     modal changes."** Root cause: this card's `getConfigForm()` schema
     only knows about `title`/`entities`/`include_grocy_shopping_lists` -
     `grocy_list_ids` (written only by the in-card List(s) tab, see
     v146.3's own entry below) isn't part of it at all. Home Assistant, in
     the absence of a `getConfigElement()`, auto-builds a generic "Edit
     Card" editor straight from that schema, and its own save handler
     treats `ha-form`'s emitted value (only ever those three fields) as
     the WHOLE new config - so opening "Edit Card" from the dashboard's
     own 3-dot menu and hitting Save, even without touching anything,
     silently dropped `grocy_list_ids` back to the legacy all-or-nothing
     `include_grocy_shopping_lists` fallback. Fixed with a small custom
     editor element, `FamilyHubTodoCardEditor` (registered via
     `FamilyHubTodoCard.getConfigElement()`), that renders the exact same
     `ha-form`/schema but on `value-changed` merges the emitted patch into
     a COPY of the full existing config (`Object.assign({}, this._config,
     e.detail.value)`) before firing `config-changed`, instead of
     replacing the config outright - `grocy_list_ids` (and any other key
     this card owns itself) now survives a save made through that generic
     dialog. New test coverage builds the editor element directly
     (`document.createElement("family-hub-todo-card-editor")`) and
     exercises its inner `ha-form`'s own `value-changed` event, since
     `ha-form` itself isn't loaded in the jsdom test harness - only this
     card's own merge logic needs covering, not `ha-form`'s rendering.
  New JS test coverage for #2/#3: a `todo.no_extras` fixture entity
  (`makeHass`'s `includeNoExtrasEntity` option, opt-in so it doesn't throw
  off every other test's "N todo.* checkboxes" style assertions) with
  `supported_features` limited to CREATE|UPDATE|DELETE (no due-date/
  description bits) - covers the Add form hiding its due-date field, a
  due-dated add never sending `due_date`, the item detail modal hiding
  both fields with the unsupported-hint shown, a save from that modal
  never sending either field, and a cross-list move never carrying either
  field onto the destination `add_item` call. All two of this integration's
  own existing fixture entities (`todo.shopping`/`todo.chores_misc`) had to
  be given `supported_features: 127` (every `TodoListEntityFeature` bit) to
  keep their own long-standing due-date/description assertions passing
  once the guard checks were added, since a bare fixture `states` entry
  with no `supported_features` attribute at all now defaults to "supports
  nothing."

- **v146.3 (1.109.3)**: "when you click the FAB there should be a second
  tab called List(s) that allows you to add and remove lists also Todo
  lists natively have descriptions and due dates when you click an item it
  should open a Trello style modal to see the details." Two changes to the
  To-Do Lists card, landed together.
  **Tabbed FAB modal.** Asked (AskUserQuestion) what "add and remove lists"
  should mean, since HA's `todo` domain has no generic create/delete API
  (every todo.* list belongs to its own separate integration - only Grocy
  could genuinely support create/delete), and the user picked "pick which
  EXISTING lists show" - same capability as v146.2's Settings modal, just
  relocated. So the standalone gear-icon Settings modal (`.todo-settings-btn`)
  is gone; the "+" FAB (`_openCreateModal`) now opens one modal with a
  `.modal-tabs` bar switching between an "Add Item" tab
  (`_renderAddItemTab`, the original quick-add form, now rendering into a
  `[data-tab-panel="add"]` div instead of the modal box directly) and a
  "List(s)" tab (`_renderListsTab`/`_saveListsTab`, renamed from
  `_renderSettingsModalBody`/`_saveSettingsModal`, logic unchanged). Both
  panels coexist in the DOM at once (toggled via the `hidden` attribute, not
  removed/recreated) via a `switchTab(name)` closure, so the List(s) tab's
  buttons needed their own `.lists-save-btn`/`.lists-cancel-btn` classes
  alongside the shared `.save-btn`/`.cancel-btn` to avoid collisions with
  the Add Item tab's identically-classed buttons. The "no lists configured
  yet" empty state in the Add Item tab now has a button that calls
  `switchTab("lists")` instead of just closing the modal.
  **Trello-style item detail modal.** Clicking an item's text (`.todo-item-
  text`, never the checkbox/delete/put-away buttons or a drag - gated in
  `_onBoardClick`) opens a new `.item-detail-modal` overlay
  (`_openItemDetailModal`) showing that item's full details. For a todo.*
  item: an editable title, an editable description textarea, and an
  editable due-date input, saved via a new `_updateTodoItemDetails` which
  calls `todo.update_item` with `item`/`description`/`due_date` and an
  optional `rename` (omitted when the title wasn't changed) - the exact
  same field shape `family-week-calendar-card.js`'s own meal-plan/settings
  storage already uses on this same service, just used here for its real,
  literal meaning (a genuine description/due date) instead of repurposed
  JSON storage. For a Grocy row: an editable note textarea and an editable
  amount input, plus (for a product-linked row only) a Put Away shortcut
  button that closes the detail modal and opens the existing Put Away modal
  in its place - saved via a new `_updateGrocyItemDetails`, which calls a
  brand-new backend command, `family_hub/update_grocy_shopping_list_item`
  (`_ws_update_grocy_shopping_list_item` in `__init__.py`): a generic
  partial `PUT /api/objects/shopping_list/{id}` including only whichever of
  `name`/`note`/`amount` were actually given, same convention
  `_ws_toggle_grocy_shopping_list_item`'s `{"done": ...}` PUT and the
  purchase-quantity adjuster's own `{"amount", "qu_id"}` PUT already
  establish - 4 new Python tests in `test_grocy_shopping_list.py`
  (not-configured skip, only-given-fields sent, no-fields no-op, soft
  error on failure). A Grocy row Grocy has already linked to a real product
  (`item.productId != null`) shows its title read-only (`.detail-title-
  readonly`) rather than editable, and never sends `name` on save - Grocy
  always displays such a row using the linked product's own name, not the
  row's own `name` field, so an edit here would silently do nothing once
  the next poll re-resolves the display name from the product record
  anyway; a freetext row (no product_id) shows an editable title and does
  send `name` when changed. The modal deliberately reuses the board's own
  existing `_toggleItem`/`_deleteItem`/`_openPutAwayModal` for its
  checkbox/Delete/Put-Away controls rather than duplicating that logic -
  it only owns the new save-details behavior. New JS test coverage: a
  large "Item detail modal (v146.3+)" block in `test_todo_card.js` (title/
  description/due-date prefill and save for a todo item, rename omitted
  when unchanged, checkbox/Close/Delete from inside the modal, read-only
  title + note/amount-only save + Put Away shortcut for a product-linked
  Grocy item, editable title + name-included save for a freetext Grocy
  item). One test-only gotcha worth remembering: toggling an item complete
  from inside the still-open detail modal moves that item into the board's
  collapsed-by-default "Completed" section, so a test that re-queries the
  board for that item afterward needs to toggle it back first (or expand
  the Completed section) - the detail modal itself stays open and
  unaffected by the board re-render either way, since `_render()` only
  touches `.board`'s innerHTML, never the modal overlays.

- **v146.2 (1.109.2)**: two more asks landed right on top of v146.1's Grocy
  integration, in the same conversation: "user should be able to select
  what Grocy lists they want, todo and Grocy list selection should be in a
  settings modal under the FAB" and "need fuzzy match to try and link
  shopping list items to grocy items when you are putting away, also add
  the put away features to the new Todo cards."
  **Settings modal.** List selection moved off the YAML/UI config editor
  entirely into an in-card modal (gear icon, `.todo-settings-btn`, stacked
  44px above the existing 56px "+" FAB) - the household ticks todo.*
  entities and specific Grocy lists without ever opening "Edit Card".
  Config grew a `grocy_list_ids` array (parsed/validated in `setConfig`
  alongside the existing `entities` array) replacing the old all-or-
  nothing `include_grocy_shopping_lists` boolean's role as the source of
  truth - `_grocySelectedListIds()` is the one place that reconciles both:
  an explicit `grocyListIds` array wins when present; otherwise the legacy
  boolean is read as a `null` "all lists" sentinel (so a config saved
  before v146.2 keeps showing every Grocy list exactly as before, rather
  than silently narrowing to nothing on upgrade) until the household opens
  the new modal once and saves, which always writes an explicit array from
  then on. Saving calls `this.setConfig(newConfig)` (reusing the same
  normalization/validation setConfig already does for a YAML edit) then
  `this.dispatchEvent(new CustomEvent("config-changed", ...))` to persist
  through Lovelace - the exact mechanism `family-screensaver-card.js`'s own
  `return-dashboard-select` field already established in this codebase for
  a plain (non-editor) card to save its own in-card config edits, reused
  here rather than inventing a second pattern. `_fetchGrocyLists()` also
  had to stop being gated on `include_grocy_shopping_lists` and fetch
  unconditionally now (every poll tick), since the Settings modal needs
  the full Grocy list-of-lists to build its own checklist even when
  nothing is currently selected - it also now tracks `_grocyConfigured`
  (true/false/undefined-until-first-fetch) so the modal can tell "Grocy
  has no lists" apart from "Grocy isn't set up in Family Hub at all" and
  show the right hint either way.
  **Put Away.** Every active item in a Grocy-backed column now gets a 📦
  button (`_itemHtml`, Grocy columns only) opening a new Put Away modal -
  a location, optional expiration date, optional purchase price, then one
  call to the EXISTING `family_hub/put_away_grocy_shopping_list_item`
  command (built back in the calendar card's own Grocy Shopping List
  viewer, reused as-is). The calendar card's viewer only ever offers this
  for a row Grocy already linked to a product (`product_id` set) - a
  freetext row (added by hand, or from Grocy's own site with no exact-name
  match) has always been unable to be put away at all. This is the actual
  new capability the household asked for: for a freetext row, the modal
  runs a new `family_hub/match_grocy_product` command (fuzzy difflib-ratio
  matching against the full Grocy product catalog, same scoring
  `_best_text_match`/`_whole_word_product_match` already use for the
  recipe importer's own ingredient matching, reused via a new small
  `_match_grocy_products` helper that returns a ranked list instead of
  just the single best hit) automatically on open, and shows up to 6
  ranked candidates (name + rounded score) to confirm - or a re-searchable
  text box for typing a different product name - before the location/date/
  price step appears. A put-away writes real Grocy stock immediately on
  confirm (unlike the recipe importer's fuzzy match, which only ever
  pre-fills a review screen still gated by a final Import click), so this
  deliberately never auto-applies the top match silently.
  That fuzzy-matched product still has no genuine row-level link in
  Grocy's own data, which mattered for the OTHER backend change here: the
  existing put-away command always finished by calling Grocy's
  remove-product endpoint (`POST /api/stock/shoppinglist/remove-product`),
  which matches a shopping-list row BY `product_id` - a freetext row with
  no real link would be invisible to that call, so stock would get added
  but the stale row would stay on the list. `_ws_put_away_grocy_shopping_
  list_item` gained an `unlink_by_row_id` flag (default `False`, so the
  calendar card's own viewer - which never sends it - keeps its original,
  unchanged behavior exactly): `True` deletes the row directly by its own
  `item_id` (`DELETE /api/objects/shopping_list/{id}`, the same call
  `_ws_remove_grocy_shopping_list_item` already makes) instead, which
  works regardless of whether Grocy itself ever linked the row. The
  frontend sets it to `!wasLinked` - true only for a row put away via the
  fuzzy-match path, false for one that already had `product_id` from
  Grocy itself.
  `_getGrocyItems`'s row normalization grew four more fields the Put Away
  modal needed and the plain board never used before (rawName, productId,
  amount, defaultLocationId, defaultBestBeforeDays) - carried straight
  through from the raw shopping-list row rather than re-fetched separately.
  Backend tests extended in `test_grocy_expiring_and_putaway.py`: an
  `unlink_by_row_id` test confirming the DELETE-by-id path fires (and
  remove-product does NOT) when set, a companion test confirming the
  default still uses remove-product unchanged, and a new test section for
  `match_grocy_product` (not-configured, ranked results, the same
  single-word whole-word fallback the recipe importer relies on, no-match
  returns an empty list, a fetch failure surfaces as a soft error) -
  `FakeSession` gained a `delete()` method and a `PRODUCTS` fixture for
  these. `test_todo_card.js` extended with Settings-modal coverage
  (checklist rendering/checked-state from config, the Grocy-not-configured
  hint, Save persisting an explicit `grocy_list_ids` and firing config-
  changed) and Put-Away coverage (a linked item skips straight to the
  location/date/price step with defaults prefilled; a freetext item
  auto-searches, renders ranked candidates, and confirms with
  `unlink_by_row_id: true` using the CHOSEN candidate's product_id, not the
  row's own null one; a no-match item shows an explanatory message and
  guards against confirming with nothing chosen). One test-environment
  wrinkle worth remembering: the jsdom test setup didn't have a global
  `CustomEvent` before this (nothing had dispatched one from card code
  under test until now) - had to add `global.CustomEvent = dom.window.
  CustomEvent` alongside the file's other jsdom globals, or `new
  CustomEvent(...)` inside the card's own eval'd code threw a
  cross-realm "not of type Event" error from jsdom's dispatchEvent.

- **v146.1 (1.109.1)**: the To-Do Lists card (`family-hub-todo-card.js`,
  v146.0 above) now also speaks **Grocy shopping lists**, per the immediate
  follow-up ask right after v146.0 shipped: "We should make this card also
  work with shopping lists from grocy." Investigated first whether any new
  backend code was needed and found the answer was no - `__init__.py`
  already had a complete, already-tested, already-registered set of Grocy
  shopping-list websocket commands (`get_grocy_shopping_list`,
  `add_grocy_shopping_list_item`, `remove_grocy_shopping_list_item`,
  `toggle_grocy_shopping_list_item`, `get_grocy_shopping_lists`,
  `create_grocy_shopping_list`, `move_grocy_shopping_list_item`) built for
  the Family Week Calendar card's own in-card Grocy Shopping List viewer -
  this feature reuses every one of them as-is, so v146.1 touched only the
  card's own frontend, zero `__init__.py`/`const.py` changes.
  The card's data model had been entity-id-keyed (`_lists[entityId]`),
  which had no way to represent a Grocy list (no `todo.*` entity_id of its
  own). Rewrote it around a **descriptor** abstraction instead -
  `{ key, kind: "todo"|"grocy", entity?, listId?, name? }` - where `key` is
  the entity_id for a `todo.*` list or `"grocy:<id>"` for a Grocy list, and
  every rendering/mutation code path (`_itemHtml`, `_columnHtml`,
  `_toggleItem`, `_deleteItem`, `_addItem`, `_reorderItem`,
  `_moveItemAcrossLists`) dispatches on `descriptor.kind` rather than
  needing a parallel set of "grocy column" functions. `data-entity`
  attributes throughout the DOM became `data-list-key` to match. Config
  grew one new boolean, `include_grocy_shopping_lists` ("Also show Grocy
  shopping list(s)" in `getConfigForm`) - off by default so existing cards
  don't suddenly grow extra columns on update; when on, `_fetchGrocyLists()`
  calls `family_hub/get_grocy_shopping_lists` once per poll tick and every
  list it returns becomes its own column, tagged with a small "Grocy"
  `.todo-column-source-tag` pill in the header so it's visually obvious
  which columns are shared with Grocy's own separate app/website (someone
  might check things off there too) versus a plain HA to-do list nobody
  else touches. Grocy rows (`_getGrocyItems`) normalize into the card's
  common item shape - `amount_display` (e.g. "2 pieces") folds into the
  summary in parentheses since this card has no separate amount column the
  way the Recipe Box's own Grocy viewer does; `due` is always null (Grocy
  shopping list rows have no due date).
  Two deliberate asymmetries between the two backends, both documented
  inline: (1) **same-list reorder is a no-op for Grocy columns** -
  `_ws_get_grocy_shopping_list` always re-sorts its rows by `(done, name)`
  server-side on every fetch (matching Grocy's own shopping list page), so
  there's no persisted custom order to move within; `_reorderItem` returns
  early rather than firing a backend call that would silently do nothing.
  (2) **cross-list moves use three different backend calls depending on
  which kinds are on each end** - grocy→grocy uses the real
  `family_hub/move_grocy_shopping_list_item` (a PUT that just repoints the
  row's `shopping_list_id` column, preserving the item's own identity/
  product link - strictly better than recreate-and-delete when it's
  available); todo→todo keeps the existing recreate-then-remove
  (`todo.add_item` then `todo.remove_item`, no native cross-entity move in
  HA's `todo` integration); either direction crossing between a `todo.*`
  list and a Grocy list has no shared "move" primitive at all, so it's the
  same recreate-then-remove shape just crossing from one backend's add
  call to the other's remove call. In every recreate-based case add still
  happens before remove (unchanged ordering reasoning from v146.0 - a
  failed remove leaves the item existing somewhere instead of vanishing).
  Add modal: the list `<select>` now lists Grocy options with a "(Grocy)"
  suffix; picking one hides the due-date field entirely (`dueLabel.hidden`,
  toggled on the select's `change` event) rather than leaving a control
  visible that would silently be ignored on submit, since Grocy rows have
  no due date to set.
  `test_todo_card.js` extended (not replaced) with Grocy-specific coverage
  on top of the existing todo.*-only tests: a mixed board renders a Grocy
  column with its tag/name/item-count/amount_display-folded-in summaries;
  checkbox/delete/add on a Grocy item call `toggle_grocy_shopping_list_item`/
  `remove_grocy_shopping_list_item`/`add_grocy_shopping_list_item` (and
  never the `todo.*` service equivalents); the Add modal's due-date field
  hides once a Grocy list is selected; a grocy→grocy drag calls the real
  `move_grocy_shopping_list_item` and NOT the recreate add/remove pair; a
  todo→grocy drag calls `add_grocy_shopping_list_item` before
  `todo.remove_item`; and a same-list drag within a Grocy column issues
  zero backend calls. One test-writing wrinkle worth remembering for next
  time: the test's mock `sendMessagePromise` handler is static (doesn't
  persist mutations across a `_fetchAllLists()` refetch), so an item
  "moved" by an earlier drag test snaps back to its original list on the
  next automatic refetch - later assertions that need an item to still be
  in its post-move location have to pick an item whose mock state doesn't
  depend on a prior mutation sticking, rather than assuming call-order
  alone determines subsequent DOM state.

- **v146.0 (1.109.0)**: new standalone **To-Do Lists card**
  (`family-hub-todo-card.js`) - the household's own ask: "can we create a
  family hub style and brand way to display Todo lists, maybe the ability
  to display multiple lists, drag and drop between lists, FAB for adding
  a nice family hub style add modal etc." Three `AskUserQuestion` answers
  shaped the design: list source is "any `todo.*` entities" (config-picked,
  same pattern as the calendar card's own `people` config, not narrowed to
  just Family Hub's own reminders lists); layout is "side-by-side columns"
  (kanban-style, all lists visible at once, not a tabs-one-list-at-a-time
  design); completed items get "a collapsible Completed section" (same
  pattern as Chores' per-column Completed accordion and Goals' single-list
  one), not strikethrough-in-place or auto-remove.
  The one architectural choice that shaped everything else: this card has
  **NO backend storage of its own**. Every other Family Hub feature (Chores,
  Rewards, Goals, Pantry) has a matching engine module + Store + websocket
  commands in `chores_websocket_api.py`/`__init__.py`; this one instead
  reads and writes straight through Home Assistant's own native `todo`
  domain services - `todo.get_items` (via `call_service`+`return_response`,
  the exact same shape `family-week-calendar-card.js`'s own `_getItems`/
  `_fetchReminders` already use for its reminders lists) for reading, and
  `todo.add_item`/`update_item`/`remove_item`/`move_item` for every
  mutation - the same services that file's reminders/meal-plan/settings
  features already lean on for their own to-do-backed storage. That means
  this card works against ANY to-do list already in the household's Home
  Assistant instance (their real shopping list, some third-party integration's
  to-do entity, not just Family Hub's own), and needed ZERO new websocket
  commands or engine/Store code - the only backend change at all was the
  usual four-step card-registration wiring (`TODO_CARD_JS_URL` in
  `const.py`, then the static-path/hash/versioned-URL/dashboard-resource
  block in `__init__.py`'s `async_setup_entry`, copy-pasted from
  `PANTRY_CARD_JS_URL`'s own four call sites - see that constant's own
  comment on why v144.3 had to backfill this exact wiring for Pantry after
  it shipped once already without it; this feature never repeats that
  mistake since the wiring landed in the same pass as the card itself).
  Card design (`family-hub-todo-card.js`, new file): standalone, independently
  addable to any dashboard, copy-pasting its own `PALETTE`/theme-resolution/
  `_esc`/`_escAttr` boilerplate rather than importing it - identical
  convention to every other Family Hub card (`family-hub-goals-card.js` was
  the closest template: same `_defaultTheme`/`_resolveTheme`/`_applyThemeVars`/
  `_getDeviceThemeOverride` block verbatim, same FAB shape/position/style as
  `add-chore-fab`/`add-reward-fab`/`add-goal-fab`, same `.modal-overlay`/
  `.modal-box` Add-modal shape). Config is just `title` + `entities` (an
  array of `todo.*` entity ids), using a native `selector: { entity: {
  domain: "todo", multiple: true } }` picker in `getConfigForm` - the exact
  selector `family-today-card.js` already uses for its own single-entity
  todo pickers, just with `multiple: true`. Each configured entity renders
  as its own `.todo-column` (list name from `hass.states[entity].attributes.
  friendly_name`, a stable PALETTE color by config-array index - same
  by-index PALETTE assignment `_userColor` uses elsewhere). Polls every 20s
  (same cadence as Chores/Goals - a to-do list is exactly the kind of thing
  someone else, or Home Assistant's own built-in To-do UI, might be editing
  concurrently).
  Drag and drop: plain native HTML5 drag/drop, no library - `draggable=
  "true"` on every ACTIVE `.todo-item` (completed items are deliberately
  not draggable, matching the Completed accordion's own "these are done,
  not being organized" framing). `_closestItemBelow` resolves a drop
  position by comparing the pointer's Y to each item's own vertical
  midpoint (`getBoundingClientRect`), so a drop lands roughly where it
  visually looks like it's landing rather than always snapping to the top
  or bottom of the column. Same-list drop calls `todo.move_item` with
  whichever item now sits just above the drop point as `previous_uid`
  (omitted for "move to the very top" - `move_item`'s own convention);
  wrapped in try/catch same as every other `todo.*` service call in this
  project, since a third-party todo platform that doesn't implement
  `move_item` should degrade to "the reorder just doesn't happen," not
  break the card. Cross-list drop has no native HA primitive for it (no
  "move to a different entity" service exists) - recreates the item on the
  destination via `add_item` (carrying over summary/description/due date)
  FIRST, then `remove_item`s it off the source; add-before-remove was a
  deliberate ordering choice so a mid-drag failure (list goes offline,
  etc.) leaves the item still existing somewhere rather than vanishing
  outright.
  New test file `test_todo_card.js`: no-lists-configured shows the hint
  and the FAB's Add modal explains rather than opening a broken form;
  multiple configured lists each get their own column with the right
  name/color/active-item count (completed items excluded from the count
  and the active list, but present in the collapsed-then-expandable
  Completed accordion); the checkbox calls `todo.update_item` with
  `status: "completed"`/`"needs_action"`; the delete button calls
  `todo.remove_item`; the Add modal's list picker has one option per
  configured entity, submitting calls `todo.add_item` against whichever
  list is selected (including an optional due date), and a blank summary
  shows an inline validation error without calling `add_item` or closing
  the modal; a same-list drag calls `todo.move_item` with the dragged
  item's uid (completed items confirmed non-draggable via their `draggable`
  attribute); and a cross-list drag calls `todo.add_item` on the
  destination BEFORE `todo.remove_item` on the source, both targeting the
  right entities. One test-writing gotcha worth remembering: this card's
  `hass` field must be set via the real property setter (`card.hass = ...`,
  which is what actually kicks off `_initFirstLoad`/`_firstLoadPromise`),
  not by assigning the underlying `card._hass = ...` field directly the
  way a test that only needs `hass` for read access elsewhere (like
  `test_month_split_view.js`'s calendar-card test) can get away with -
  the property setter is what triggers the fetch/render pipeline this
  test actually needs to await.
  Full JS+Python sweep: 90/94 JS passing, 29/33 Python passing - same
  4+4 pre-existing/unrelated failures as every prior release this session
  (JS: `test_reminder.js`, `test_reminders_feature.js`,
  `test_servings_scaling.js`, `test_grey_out_past_events.js`; Python:
  `test_chores_todo_and_services.py`, `test_config_flow.py`,
  `test_family_calendar_reminders.py`, `test_family_hub.py` - spot-checked
  `test_family_hub.py`'s failure specifically to confirm it's still the
  same pre-existing `config_flow`-wizard assertion, unrelated to this
  session's `async_setup_entry` card-registration edit).

- **v145.0 (1.108.21)**: new Month-family view variant, "split" - the
  household's own ask: "I want to create a new month view that shows the
  month on the left and you can click a day and see all the events listed
  on the right for that day. for portrait mode the calendar is on the top
  events are on the bottom, also is a button to click to go to that week.
  this is a view that you can select as your default month view in
  settings." Landed on top of the v144 task #28 "view family / variant"
  infrastructure that was deliberately built ahead of time for exactly
  this - `_getMonthViewVariant()`'s getter/localStorage key already
  existed and only accepted "month"; every one of its call sites
  (`_renderGrid`, the month-cell click handler, `_initFirstLoad`) was
  already variant-agnostic by design, so none of them needed touching
  beyond the new dispatch branch itself.
  What changed:
  - `_getMonthViewVariant()` now also accepts `"split"` (still localStorage
    key `familyCalendarMonthViewVariantLocal`, this-device-only, same
    pattern as `_getWeekViewVariant()`).
  - `_viewFamily(mode)` now treats `"split"` as part of the Month family
    (`mode === "month" || mode === "split"`) alongside `"month"` - every
    call site across the file that used to compare
    `this._viewMode === "month"` directly (the month/year label + hiding
    week-shortcuts in `_updateNavLabel`, `_fetchEvents`'s date-range
    choice, the nav-prev/nav-next/swipe/Today handlers, and the debug
    info dump) now goes through `this._viewFamily(this._viewMode) ===
    "month"` instead, so `"split"` automatically gets the same month-grid
    date range, nav-arrow behavior, and month/year label as plain Month
    without needing its own copy of each of those checks. The
    `_renderGrid()` dispatcher itself keeps a literal `"month"` /
    `"split"` distinction, since that's exactly where the two variants'
    actual rendering diverges.
  - `_renderMonthGrid()`'s ~130-line cell-building loop (badges, events,
    reminders, meals, the capped-at-3 pills) was extracted verbatim into a
    new `_buildMonthCellsHtml(selectedDateKey)` so the plain Month view and
    the new split view's calendar pane share it instead of drifting apart
    as two copies - `selectedDateKey` (null for plain Month) adds a
    `.selected` class to the matching cell for split's calendar pane to
    highlight.
  - New `_renderMonthSplitGrid()`: renders `.grid.mode-month-split` as two
    panes, `.month-split-cal` (built from the shared
    `_buildMonthCellsHtml`) and `.month-split-detail`. Tracks
    `this._monthSplitSelectedDate` (a dateKey string, this._monthSplitAnchorKey`
    tracks which month it belongs to) - defaults to today when today falls
    within the currently-displayed month grid, else the 1st of that month;
    re-defaults automatically whenever the household navigates to a
    different month (anchor key changes on a later render), but NOT on the
    very first render, so a selection set before that first render (tests
    do this; a future caller reasonably might too) isn't immediately
    clobbered - distinguishing "never rendered yet" from "already showing
    this exact month" needed an explicit `isFirstRender` flag, since
    comparing only against the anchor key can't tell those two apart the
    first time (`_monthSplitAnchorKey` starts out `undefined` either way).
  - New `_buildMonthSplitDetailHtml(dateKey)`: the detail pane itself -
    re-gathers that one day's events/reminders (same filtering rules as
    the month-cell loop: badge hide-match, legend/type filters, multi-
    person event surfacing) but UNCAPPED (no "+N more"), each item wired
    into `this._eventDetails` under its own id exactly like
    `_buildDayColumnHtml` already does for Week view, so clicking one opens
    the normal event-info popup via the existing generic
    `.event, .tl-event, .all-day-chip` click handler - no new click-path
    code needed for that part. Items sort all-day-first then by start
    time. Planned meals (when `showMealsInMonth` is on) render above the
    event list, matching v141's "meals lead" ordering in the month-cell
    pills. A day with nothing scheduled shows an explicit "Nothing
    scheduled" empty state rather than a blank pane. Header carries the
    full weekday+month+day date, a "Today" tag when applicable, and the
    "Go to this week →" button (`.msd-goto-week-btn`, `data-date`) that
    just calls the existing `_goToWeekFromDate()` - no new navigation logic
    needed there either.
  - Click handling: in the `.grid` click-delegation handler, a
    `.month-cell` click now branches on `this._viewMode === "split"` -
    split sets `this._monthSplitSelectedDate` to the clicked cell's date
    and calls `_renderGrid()` (selects the day, stays in Month) instead of
    the plain Month view's original `_goToWeekFromDate()` (jumps straight
    into that week) - the whole point of split is previewing a day without
    leaving Month. A new early branch handles `.msd-goto-week-btn` clicks.
  - Settings modal: new "Month button shows — this device only" field
    (Calendars accordion, right under the existing "Week button shows"
    field) with `.month-variant-btn` buttons ("Month" / "Month + Day"),
    wired with the exact same three-part pattern as `.week-variant-btn`
    (click-toggle .active, populate .active from `_getMonthViewVariant()`
    on modal open, read the `.active` button's value into
    `familyCalendarMonthViewVariantLocal` on save).
  - CSS: `.grid.mode-month-split` is a flex row by default (calendar pane
    ~55%, detail pane ~45%, side by side) that flips to a flex column
    under `@media (orientation: portrait)` - calendar on top, detail pane
    below, capped to 45% max-height so the calendar keeps most of the
    vertical space - matching the household's literal "for portrait mode
    the calendar is on the top events are on the bottom" ask. This uses
    actual device/viewport orientation, deliberately NOT the existing
    manually-selected "portrait" WEEK variant (`.grid.mode-portrait`,
    unrelated - that one stacks week day-columns, this stacks split
    Month's two panes) - the comments in both places cross-reference each
    other to head off that mix-up in a future session. `.month-cell.selected`
    gets the same accent-colored border treatment as `.month-cell.today`
    (a 2px accent border) plus an inset box-shadow so it's visually
    distinguishable from "today" when they're different days.
  New test file `test_month_split_view.js`: variant plumbing
  (`_viewFamily("split")` is Month family), `_renderGrid()` dispatches to
  `.mode-month-split`, the selected cell carries `.selected`, the detail
  pane shows only the selected day's events (not another day's, confirming
  the per-day filtering is actually scoped correctly) and each event item
  is wired into `_eventDetails`, the Go-to-week button carries the right
  date, clicking a different cell reselects instead of jumping to that
  week, an empty day shows the "Nothing scheduled" state, and the plain
  Month view's original click-to-jump-to-week behavior is unchanged.
  Re-ran the same ten targeted tests as the last several releases
  (test_meal_block_count_none.js, test_planner_view.js,
  test_portrait_view.js, test_month_meals_on_top.js, test_move_meal.js,
  test_multi_day_events.js, test_go_to_calendar_button.js,
  test_countdown_ticker.js, test_more_menu.js, test_mobile_ui.js) plus the
  new test_month_split_view.js - all passed. Full JS+Python sweep pending
  confirmation as this entry was written (see whichever session/commit
  actually shipped v1.108.21 for the final pass/fail counts, same 4+4
  pre-existing/unrelated failures expected).

- **v144.20 (1.108.20)**: immediate household follow-up on v144.19 -
  "For the tablet style week view the date range needs to be centered on
  the screen." v144.19's `grid-template-columns: auto 1fr auto` sized the
  left/right `.week-nav-side` columns to their own content, and since the
  left group (Settings/Week/Month/Edit - 4 buttons) is much wider than the
  right group (just More - 1 button), the leftover center column - even
  with its own content centered inside it - ended up visibly off-center,
  shifted toward the narrower right side instead of sitting on the true
  center of the row.
  Fix: reverted `.week-nav`'s `grid-template-columns` for this
  `@media (min-width: 701px) and (max-width: 960px)` tier from
  `auto 1fr auto` back to `1fr auto 1fr` - the SAME value the unscoped/
  desktop rule above already uses. Two equal-width flexible side columns
  (rather than content-sized ones) is what actually centers the middle
  column on the full row, regardless of how much content either side
  holds; kept `.week-nav-side.left { justify-self: start; justify-content:
  flex-start }`, `.week-nav-side.right { justify-self: end; justify-
  content: flex-end }`, `.week-nav-center { justify-content: center }` so
  the buttons still hug their respective edges within their now-equal-
  width columns instead of centering within them. Still scoped to
  `min-width: 701px` so the ≤700px phone tier is untouched, same reasoning
  as v144.18/v144.19.
  Pure CSS change (no markup/JS touched) - re-ran the same ten targeted
  tests as v144.18/v144.19 (test_meal_block_count_none.js,
  test_planner_view.js, test_portrait_view.js, test_month_meals_on_top.js,
  test_move_meal.js, test_multi_day_events.js,
  test_go_to_calendar_button.js, test_countdown_ticker.js,
  test_more_menu.js, test_mobile_ui.js) - all passed. Full JS sweep:
  88/92 passing (same 4 pre-existing/unrelated failures as every prior
  sweep this session: test_reminder.js, test_reminders_feature.js,
  test_servings_scaling.js, test_grey_out_past_events.js). Full Python
  sweep: 29/33 passing (same 4 pre-existing/unrelated failures as every
  prior sweep this session: test_chores_todo_and_services.py,
  test_config_flow.py, test_family_calendar_reminders.py,
  test_family_hub.py).

- **v144.19 (1.108.19)**: immediate household follow-up on v144.18 (see
  that entry below) - "the week month edit more button etc should be on
  the same line as the date range." v144.18 had read the original
  "calendar cards directly under the date range, date range right at the
  top" request as two rows (date range alone on top, buttons row under
  it); what was actually wanted was the original single-row desktop
  layout, just with the 960px tier's already-trimmed button set (no
  Suggestions/Recipe Box, no Edit label, no separate week-shortcuts row)
  so it fits on one line at 5"/7" width instead of wrapping.
  Fix: replaced the `@media (min-width: 701px) and (max-width: 960px)`
  block's grid-template-areas two-row layout with a single-row one -
  `grid-template-columns: auto 1fr auto` (left/right hug their own
  content instead of the base rule's equal 1fr/1fr, since the left group
  now has 4 buttons and the right group only has 1 - equal columns would
  leave a lopsided gap next to More) with `.week-nav-side.left { justify-
  content: flex-start }`, `.week-nav-side.right { justify-content: flex-
  end }`, `.week-nav-center { justify-content: center }` - i.e. the same
  three-columns-in-source-order shape the unscoped base rule already
  uses, just letting the outer two columns shrink to their content so the
  center date-range column gets the leftover space. Still scoped to
  `min-width: 701px` so the ≤700px phone tier is untouched, same reasoning
  as v144.18.
  One authoring mistake caught before shipping: the first draft of this
  comment used backtick-quoted CSS snippets (`` `grid-template-columns:
  ...` ``) for readability, not realizing this whole block lives inside
  _css()'s own backtick template-literal string - those inner backticks
  terminated the JS string early and broke the file's syntax (caught
  immediately by the usual `node -e "new (require('vm').Script)(...)"`
  syntax check, before any test ran). Fixed by dropping the backticks
  from the comment text; every other CSS-comment in this file already
  avoids backticks for the same reason, so this is a useful thing to
  remember for any future comment inside this method.
  Pure CSS change (no markup/JS touched) - re-ran the same ten targeted
  tests as v144.18 (test_meal_block_count_none.js, test_planner_view.js,
  test_portrait_view.js, test_month_meals_on_top.js, test_move_meal.js,
  test_multi_day_events.js, test_go_to_calendar_button.js,
  test_countdown_ticker.js, test_more_menu.js, test_mobile_ui.js) - all
  passed. Full JS sweep: 88/92 passing (same 4 pre-existing/unrelated
  failures as every prior sweep this session). Full Python sweep: 29/33
  passing (same 4 pre-existing/unrelated failures as every prior sweep
  this session).

- **v144.18 (1.108.18)**: household follow-up on v144.16's 960px "small-
  tablet header declutter" tier (see that entry below) - after trying it
  on an actual 7" panel, the header still read as cluttered: with
  .week-nav's plain `grid-template-columns: 1fr` at that tier, the three
  DOM-order children (`.week-nav-side.left`, `.week-nav-center`,
  `.week-nav-side.right`) simply stack as three centered rows - a button
  row, THEN the date range, THEN the More button's own row - pushing the
  week grid further down than necessary and burying the date range below
  the first button row instead of leading with it. Explicit ask: "move
  the settings week month and edit buttons to the left hand side. move
  the more button to the right hand side, this should put the calendar
  cards directly under the date range. and the date range right at the
  top, only do this for that 5-7 inch range don't do it for mobile phone
  layout."
  Fix: added a second, narrower-scoped media query right after the 960px
  block - `@media (min-width: 701px) and (max-width: 960px)` - using
  `grid-template-areas` instead of relying on source order:
  `"center center" / "left right"`, with `.week-nav-center { grid-area:
  center }`, `.week-nav-side.left { grid-area: left; justify-self: start;
  justify-content: flex-start }`, `.week-nav-side.right { grid-area:
  right; justify-self: end; justify-content: flex-end }`. Net effect: the
  date range/nav arrows now sit alone on the top row (full width,
  centered - unchanged from the 960px block's own `.week-nav-center {
  justify-content: center }`), Settings/Week/Month/Edit and More share
  ONE row directly under it (left- and right-aligned), and the week grid
  starts right after - one row shorter than the plain 960px stacking, date
  range first.
  The `min-width: 701px` lower bound is the whole point of using a
  *separate* media query rather than just editing the 960px block in
  place: without it, this reordering would also reach the ≤700px phone
  tier (media queries aren't mutually exclusive - a 400px-wide viewport
  matches both `max-width: 960px` and `max-width: 700px` simultaneously),
  which the household explicitly asked NOT to touch. A phone still gets
  exactly the same plain three-rows-in-source-order stacking from the
  960px block as before this change - nothing in that block or the 700px
  block below it was touched.
  Pure CSS change (no markup/JS touched) - per this project's own
  established convention (see test_mobile_ui.js's own header comment,
  and v144.16's entry below), raw `@media` rules aren't unit-tested since
  jsdom doesn't evaluate stylesheet media queries against a simulated
  viewport width. Re-ran ten existing targeted tests that touch this
  file's markup/behavior (test_meal_block_count_none.js,
  test_planner_view.js, test_portrait_view.js, test_month_meals_on_top.js,
  test_move_meal.js, test_multi_day_events.js,
  test_go_to_calendar_button.js, test_countdown_ticker.js,
  test_more_menu.js, test_mobile_ui.js) - all passed, confirming the new
  media query didn't disturb anything DOM/behavior-level. Full JS sweep:
  88/92 passing (the same 4 pre-existing/unrelated failures as every
  prior sweep this session). Full Python sweep: 29/33 passing (the same 4
  pre-existing/unrelated failures as every prior sweep this session).

- **v144.17 (1.108.17)**: household request - "full CRUD abilities" on the
  My Pantry card: edit all the Grocy properties of an ingredient (unit of
  measure, price, category, name, expiration, quantity on hand), sort by
  location, a search bar, show expired/show expiring soon. Before this,
  the card could only create a product (via Add Stock's "new product"
  toggle, minimal fields only) and edit a stock entry's amount/best-before
  - there was no way to edit a product's own name/category/location/units/
  min-stock-amount, no way to delete a product, no category (Grocy's
  "product group") support anywhere in this project at all, and no search/
  sort/filter on the stock list.
  Backend (family_hub/__init__.py): added `_ws_get_grocy_categories`/
  `_ws_create_grocy_category` (GET/POST /api/objects/product_groups, same
  shape as the existing `_ws_get_grocy_locations`/`_ws_create_grocy_
  location` pair); `_ws_get_grocy_product_details` (GET /api/objects/
  products/{id}, mapped to the editable subset: name, location_id,
  qu_id_stock, qu_id_purchase, product_group_id, min_stock_amount,
  description); `_ws_update_grocy_product` (PUT, same fields - deliberately
  never touches quantity_unit_conversions the way `_ws_create_grocy_
  product` does, since changing units on an existing product is a Grocy/
  household concern same as doing it by hand in Grocy's own UI); and
  `_ws_delete_grocy_product` (DELETE, Grocy's own error surfaced as-is if
  something still references the product). `_fetch_pantry_stock` (feeding
  `get_pantry_stock`) now also resolves each row's location_name/
  category_name/unit_name plus min_stock_amount/low_stock (amount below
  min_stock_amount) - each of the three extra lookups (locations/
  product_groups/quantity_units) is wrapped in its own try/except so a
  household on an older Grocy that 404s on one of these still gets a
  working stock list, just without that particular badge/sort key (see
  the function's own updated docstring). `_ws_update_grocy_stock_entry`
  gained optional price/location_id (Grocy's stock entries really do carry
  both columns - this was already exposed nowhere), and `_ws_get_grocy_
  stock_entries` now returns them too. All five new websocket commands
  registered alongside the existing pantry ones.
  Frontend (family-hub-pantry-card.js): a new toolbar (search input +
  sort select + Expired/Expiring-soon checkboxes) between the header and
  the board - `_visibleStock()` applies all of it client-side over
  `this._stock` (search also filters the Also Tracking extras list), so
  nothing sends an extra websocket message per keystroke/toggle. Each
  stock row now shows location/category badges and a Low stock badge when
  flagged, plus the resolved unit name next to its amount. A new "gear"
  icon button per row (`.stock-editproduct-btn`, alongside the existing
  pencil "Edit entries" and minus "Remove") opens `_openEditProductModal`
  - a full Name/Category/Location/Stock unit/Purchase unit/Min stock
  amount/Description form, with Category and Location as selects offering
  a "+ New..." option that creates the category/location first (via the
  new backend calls) before saving the product itself; a Delete button
  (confirm-gated, same `window.confirm` convention as the extras list's
  own delete) rounds out the CRUD. The existing "Edit entries" modal's
  rows gained Price and Location fields per entry (optional - a blank
  price/location just omits that field from the save, matching the
  backend's own "only touch what's passed" convention).
  Tests: extended test_pantry_websocket_api.py (enrichment defaults-to-
  none when the extra lookups aren't stubbed, resolves correctly with a
  richer FakeSession, price/location on update/get, and full coverage for
  the five new handlers) and test_pantry_card.js (search/sort/location-
  sort/expired-filter/expiring-filter, the Edit Product modal's load/
  save/"+ new category"/delete flows, and price/location round-tripping
  through Edit entries). Did a revert-and-confirm-fails spot check on both
  the backend's low_stock computation and the frontend's search filter
  (each temporarily broken, confirmed the corresponding new test failed
  with the expected message, then restored). Full JS sweep: 88/92 passing
  (the same 4 pre-existing/unrelated failures as every prior sweep this
  session). Full Python sweep: 29/33 passing (the same 4 pre-existing/
  unrelated failures as every prior sweep this session).

- **v144.16 (1.108.16)**: household report - the Family Week Calendar
  header is "very cluttered" on a 7" tablet-style kiosk panel (a Lenovo
  Smart Display), with "how many buttons are at the top" called out as the
  specific complaint (the day-grid itself was NOT the complaint). Root
  cause: the card's only existing decluttering breakpoint,
  `@media (max-width: 700px)` (folds `.suggestions-btn` into the `+`
  button, `.loved-btn` into the More menu, collapses `.week-shortcuts`
  behind `.week-shortcuts-toggle`, and stacks the `.week-nav` left/center/
  right groups into centered rows), is tuned for actual phone-width
  portrait screens. A 7" panel's typical landscape viewport (~1024px or
  similar) sits well above that threshold, so this already-built
  decluttering logic simply never activated for this device class - the
  full, uncollapsed header (4 buttons in `.week-nav-side.left` + the
  3-part center nav + 3 buttons in `.week-nav-side.right` + the separate
  3-button `.week-shortcuts` row) rendered in full every time.
  Fix: added a second, wider `@media (max-width: 960px)` block in
  `family_hub/card/family-week-calendar-card.js`, placed immediately
  before the existing 700px block, containing ONLY the header-related
  rules moved (not duplicated - 960px is a strict superset of 700px for
  these specific rules) out of the narrower block: `.week-label-wrap`,
  `.week-nav`/`.week-nav-side`/`.week-nav-center` stacking,
  `.suggestions-btn`/`.loved-btn`/`.loved-menu-item` folding, and the
  `.week-shortcuts-toggle`/`.week-shortcuts` collapse. Grid/day-layout-
  specific rules (`.grid.mode-week`, `.grid.mode-portrait`/`.portrait-row`,
  `.day-col`, `.planner-grid`, `.day-header`, `.events`, the `:host`/
  `ha-card` height:auto overrides) were deliberately left exclusive to the
  700px block, since a 7" landscape panel still has room to show the week
  grid in columns fine - only the chrome above it needed fixing. 960px was
  picked as a deliberately generous cutoff (comfortably above a 7" panel's
  usual ~1024px-or-less landscape width) rather than reverse-engineered
  from one exact device spec; a wider tablet or browser window getting the
  same decluttered header is a harmless side effect, not a regression.
  Also added a new `.edit-meals-label` span wrapping the `.edit-meals-btn`
  button's "Edit" text (markup only - its separate, pre-existing JS show/
  hide-the-whole-button logic in `_render()` is unchanged) so the new
  960px tier can drop just the text label and keep the pencil icon,
  without touching whether the button appears at all.
  No new automated test was added for the CSS itself: this project has an
  explicit precedent (see `test_mobile_ui.js`'s own header comment) that
  raw `@media` query rules aren't unit-tested, since jsdom doesn't
  evaluate stylesheet media queries against a simulated viewport width -
  DOM/behavior coverage is what's relied on instead. Re-ran eight existing
  targeted tests that touch this file's markup/behavior after the edit
  (`test_meal_block_count_none.js`, `test_planner_view.js`,
  `test_portrait_view.js`, `test_month_meals_on_top.js`,
  `test_move_meal.js`, `test_multi_day_events.js`,
  `test_go_to_calendar_button.js`, `test_countdown_ticker.js`) - all
  passed, confirming the new `<span class="edit-meals-label">` wrapper and
  the CSS-block reshuffle didn't break any existing markup/`.style.display`
  assertions. Full JS sweep: 88/92 passing; the 4 failures are all
  pre-existing/unrelated - the same 3 as every prior sweep this session
  (test_reminder.js/test_reminders_feature.js: missing
  `requestAnimationFrame` in the jsdom harness; test_servings_scaling.js:
  an unrelated recipe-grouping assertion) plus one newly-noticed
  `test_grey_out_past_events.js` failure ("expected greying to never apply
  to a future day...") that was explicitly verified to fail identically
  against the pristine, pre-this-session copy of the file staged fresh
  from the user's device - confirmed pre-existing, not caused by this
  change. Full Python sweep: same 4 pre-existing failures as every prior
  sweep this session (test_chores_todo_and_services.py's `complete_chore()`
  signature mismatch, and three config_flow wizard-step-order failures).

- **v144.15 (1.108.15)**: household report - "Goals on the chores screen
  and rewards screen still do not have a way to complete and hide a goal
  when they are achieved." v144.13's "Complete" button (see that entry
  below) was built only on the standalone family-hub-goals-card.js. What I
  missed at the time: family-hub-chores-card.js and family-hub-rewards-
  card.js EACH carry their own separate, copy-pasted rendering of an
  embedded Goals block/section (`_goalItemHtml`/`.goals-block` on Chores,
  `_goalRowHtml`/`.goals` on Rewards - same duplicated-across-independently-
  loaded-files pattern as the GOAL_STATUS_* consts themselves, and the same
  class of gap the shared-screensaver-singleton bug from earlier this
  project exploited: a fix landed in one copy and never ported to the
  others). Neither embedded copy got a Complete button, so an achieved
  goal still just sat there forever on those two boards even after
  v144.13 shipped. Fixed by porting the same pattern to both: added
  GOAL_STATUS_ARCHIVED to each file's own top-of-file const block (mirrors
  const.py, same duplication convention), added a Complete button to an
  achieved goal's actions (same permission as the standalone card - the
  assignee, or can_assign/admin), added `_archiveGoal` (sends
  family_hub/goals/archive, then re-fetches), and filtered `status !==
  "archived"` wherever each file builds its goals list for rendering -
  no Completed accordion in either condensed embedded view, so completing
  one there just hides it (matches the household's own framing: "complete
  and hide"). While in family-hub-rewards-card.js's goal-reject code I also
  found its "send back" reason was STILL a bare `window.prompt()` - v144.13's
  modal conversion only ever covered family-hub-chores-card.js (both its
  own chore reject and its embedded goal reject) and the standalone Goals
  card; the Rewards card's separate copy was missed. Converted it to the
  same .reject-modal/_openRejectModal/_submitRejectGoal pattern while
  already in this code, since it's the identical bug class and cheap to
  fix alongside. Extended test_chores_card.js and test_rewards_card.js
  with new tests for all of this (Complete button visibility/permission,
  archive-then-disappears, already-archived-goal-stays-hidden, and for
  Rewards specifically the reject-modal's open/cancel/submit flow) -
  revert-and-confirm-fails run on every change. Full JS sweep re-run
  clean (same 3 pre-existing unrelated failures as every prior sweep this
  session: test_reminder.js/test_reminders_feature.js missing
  requestAnimationFrame in the jsdom harness, test_servings_scaling.js an
  unrelated recipe-grouping assertion).

- **v144.14 (1.108.14)**: the other half of the household's Pantry request
  from v144.13 below - "pantry card should be a full screen card theme."
  Asked the user what "full screen card theme" meant (no established
  convention for this elsewhere in the project) via AskUserQuestion - they
  picked "match the Chores/Rewards board" (full board chrome, larger touch
  targets) over a kiosk-style takeover or just-bigger-as-is. Restyled
  family-hub-pantry-card.js accordingly: a real .header/.actions bar (was
  a plain title + button), Grocy Stock and Also Tracking as two
  side-by-side .board columns (.pantry-column/.pantry-col-header/
  .pantry-col-body, same shape as the Chores board's .chore-column/
  .chore-col-header) instead of one stacked list, the same 700px
  stack-to-column-per-row mobile breakpoint the Chores/calendar boards
  already use, and larger rows/buttons/touch targets throughout (e.g.
  stock-actions buttons 26px->34px). _render()'s own logic didn't need to
  change - it still only ever touches .stock-list/.extras-list, which kept
  their class names inside the new column markup. test_pantry_card.js
  still passes unmodified (asserts by class name, not DOM shape).

- **v144.13 (1.108.13)**: three unrelated changes shipped together.
  (1) Household report - "why do achieved goals not show a complete button
  to archive the goal into the completed accordian?" - this was a genuine
  missing feature, not a bug: no archive/completed-accordion concept
  existed anywhere. Added `GOAL_STATUS_ARCHIVED` (const.py), `goal_engine.
  archive_goal` (approved -> archived, no reward side effects - the reward
  already disbursed at approval time), `ws_archive_goal` in
  chores_websocket_api.py (permission: the assignee themselves, OR
  can_assign/PERMISSION_ASSIGN, OR admin - deliberately NOT gated on
  verify-tier permission since nothing is being disbursed/reversed), and on
  the goals-card JS a "Complete" button on achieved goals plus a
  collapsed-by-default "Completed" accordion at the bottom of My Goals,
  with the reward shown inline in the "Achieved!" badge.
  (2) Household report - "send back chore / goal reason should be a modal."
  Converted three separate `window.prompt()` reject-reason call sites
  (chores-card's own chore reject, chores-card's embedded goal reject, and
  goals-card's own standalone reject) into proper modals - a `prompt()`'s
  Cancel/Esc used to still send the rejection through with a blank reason,
  which a real modal's Cancel button no longer does (zero websocket calls).
  (3) Household report - "pantry card should be a full screen card theme,
  and it should pull from the stock overview of grocy." Investigation
  revealed the "pull from Grocy" half was a real, major pre-existing bug:
  ALL TEN websocket commands family-hub-pantry-card.js has always called
  (family_hub/get_pantry_stock, get_grocy_stock_entries,
  get_pantry_picker_data, pantry_add_stock, pantry_consume_stock,
  update_grocy_stock_entry, and the four pantry_extras/* CRUD commands)
  had zero backend implementation anywhere in __init__.py or
  chores_websocket_api.py - the Pantry card's Grocy Stock section could
  never have shown real stock, ever, despite the frontend and its own
  pre-written tests (test_pantry_card.js) assuming all ten existed. Built
  the full missing backend this session: the six Grocy-stock passthrough
  handlers in __init__.py (following this file's existing
  _grocy_api_get/post/put/delete + configured/soft-error conventions,
  same as every other Grocy passthrough handler here already), plus a new
  pantry-extras Store (const.py's PANTRY_EXTRAS_STORAGE_KEY_PREFIX/
  VERSION/BACKUP_FILENAME, store.py's create_pantry_extras_store/
  async_load_pantry_extras/backup_pantry_extras/
  maybe_restore_pantry_extras_backup, all mirroring the Goals store
  exactly) wired into async_setup_entry alongside goals, and four thin
  pantry_extras/list|create|update|delete ws handlers wrapping
  pantry_engine.py's already-existing create_extra/update_extra/
  delete_extra. New test_pantry_websocket_api.py covers all ten commands.
  Asked the user what "full screen card theme" meant (no established
  convention for this elsewhere in the project) via AskUserQuestion - they
  picked "match the Chores/Rewards board" (full board chrome, larger touch
  targets) over a kiosk-style takeover or just-bigger-as-is. Restyled
  family-hub-pantry-card.js accordingly: a real .header/.actions bar (was
  a plain title + button), Grocy Stock and Also Tracking as two
  side-by-side .board columns (.pantry-column/.pantry-col-header/
  .pantry-col-body, same shape as the Chores board's .chore-column/
  .chore-col-header) instead of one stacked list, the same 700px
  stack-to-column-per-row mobile breakpoint the Chores/calendar boards
  already use, and larger rows/buttons/touch targets throughout (e.g.
  stock-actions buttons 26px->34px). _render()'s own logic didn't need to
  change - it still only ever touches .stock-list/.extras-list, which kept
  their class names inside the new column markup. test_pantry_card.js
  still passes unmodified (asserts by class name, not DOM shape).

- **v144.12 (1.108.12)**: household report - "you can look into screensaver
  sometimes it feels it hangs on the chore or rewards card and doesn't
  activate." Root cause: `family-hub-chores-card.js`/`family-hub-rewards-card.js`/
  `family-hub-my-chores-card.js` each copy-paste an identical, shared,
  dashboard-wide `window.__familyHubScreenSaver` singleton (only the first
  card to load actually constructs it; the others just register/unregister
  as refcounted clients - see that block's own extensive comment). Its
  `fetchSettings()` (the singleton's own 60-second settings poll, armed by
  `startPolling()` once the first client registers) called
  `resetIdleTimer()` **unconditionally** at the end of every single fetch,
  whether or not the `screenSaver` settings sub-object had actually
  changed. Since the default idle time (180s) - and any household value
  above 60s - exceeds that 60-second poll interval, a genuinely idle
  household running any of these three cards could never actually see the
  screensaver fire: its countdown got clobbered and restarted from zero by
  the poll itself before it could ever survive one full cycle
  uninterrupted. This is the exact same class of bug already found and
  fixed once before in the calendar card's own, entirely SEPARATE,
  per-instance screensaver implementation via
  `_maybeResetScreenSaverIdleTimer` (a `JSON.stringify` settings-snapshot
  guard - see that method's own comment) - but that fix was never ported
  into the shared singleton the other three cards use, so the calendar card
  itself was never affected by this.

  Fix: added a `settingsSnapshot` closure variable and a new
  `maybeResetIdleTimer()` wrapper to the singleton (byte-identical across
  all three files, confirmed via `diff` before AND after the edit) -
  `fetchSettings()` now calls `maybeResetIdleTimer()` instead of
  `resetIdleTimer()` directly; it only calls the real reset when
  `JSON.stringify(getSettings().screenSaver || null)` differs from the
  last-seen snapshot (or on the very first call), leaving a genuinely
  in-progress countdown alone on a poll tick that finds nothing new. A real
  settings change (new idle time, source, or a login toggled on/off) still
  re-arms immediately with the fresh value, same as before.

  New coverage: `test_shared_screensaver_idle_poll_starvation.js`, loading
  `family-hub-chores-card.js` (representative of all three identical
  copies) through the real `registerClient`/`_registerScreenSaver` path.
  Since the singleton only exposes `registerClient`/`unregisterClient`/
  `updateHass` (no way to poke `settingsCache` directly the way the
  calendar card's own equivalent test does, and `normalizeSettings` floors
  `idleSeconds` at 10 - too slow to wait out directly in a test), the test
  instead installs `setInterval`/`setTimeout` interceptors via an eval'd
  string in the jsdom realm (`dom.window.eval()` runs against Node's real
  global object, not a separate sandboxed window global - assigning
  `dom.window.setInterval = ...` from outside that eval silently does
  nothing) and asserts on how many NEW idle-timer `setTimeout` calls get
  scheduled: a no-op poll must schedule zero, a poll with a genuine
  settings change must schedule exactly one more. Revert-and-confirm-fails
  performed (temporarily reverted `maybeResetIdleTimer()` back to a direct
  `resetIdleTimer()` call, confirmed the new test fails with the expected
  "must not schedule a new idle timer" message, restored the fix,
  reconfirmed passing). Full JS+Python sweep: same previously-documented
  pre-existing failures only (`test_reminder.js`, `test_servings_scaling.js`,
  `test_reminders_feature.js` in JS; `test_family_calendar_reminders.py`,
  `test_config_flow.py`, `test_family_hub.py`'s config-flow block,
  `test_chores_todo_and_services.py` in Python), nothing newly broken.

- **v144.11 (1.108.11)**: three separate user requests batched into one
  release.

  (1) "portrait mode needs to force a gap between the top cards and the
  bottom" (screenshot showed the two Portrait rows nearly flush). The
  row-to-row gap and the within-row column gap were both the same 8px,
  sharing `.grid.mode-portrait`'s `gap` with `.portrait-row`'s own - split
  them apart: `.grid.mode-portrait`'s unscoped rule now uses `gap: 24px`
  for a clearly visible row-to-row break, while `.portrait-row` keeps its
  8px column gap unchanged. The narrow (<=700px) media-query override
  (which collapses Portrait into one continuous 7-day scrolling column,
  where the two "rows" become invisible) got an explicit `gap: 10px`
  added so it doesn't inherit the new 24px and read as an odd out-of-place
  break between two otherwise-evenly-spaced day-cols there. New assertions
  in `test_portrait_view.js` grep the stylesheet text directly for both
  values, since jsdom doesn't evaluate `@media` rules for computed styles.

  (2) "left overs should let you choose what days you have the leftovers
  on!" - replaced the whole spanDays ("show this meal for the next N days
  in a row") model with an explicit `leftoverDates` array (any day(s),
  not necessarily contiguous with the cooked day or each other).
  `_parseDishDescription` now also parses/validates `leftoverDates`
  (regex-checked `YYYY-MM-DD` strings, malformed entries dropped, same
  defensive pattern as `additionalRecipes`). `_fetchMealPlan` prefers an
  explicit `leftoverDates` list when present; for OLD data (spanDays only,
  no leftoverDates - anything saved before this release) it synthesizes
  the same contiguous run it always did, so nothing already saved changes
  behavior. `_getMealForDay`'s leftover-matching loop now checks
  `lo.dates.includes(dateKey)` instead of the old `0 < diffDays <
  spanDays` range check. `_upsertMealPlan` gained a new trailing
  `leftoverDates` parameter (appended after `additionalRecipes`, so every
  existing call site with fewer args still works unchanged, just always
  saving `leftoverDates: []`) and writes it into the JSON payload;
  `_moveMealPlan`'s source/dest carry-over payloads also now preserve
  `leftoverDates` the same way they already preserved `spanDays`. UI: the
  single `<input type="number" class="input-leftover-days">` (Settings ->
  day/menu editor) is gone, replaced by `.leftover-days-picker`, populated
  by a new `_renderLeftoverDaysPicker(cookedDayDate, checkedDateKeys)`
  with one checkbox per one of the next 13 days (matching the old input's
  max=13 range) styled as the same pill-checkbox look as
  `.remind-check-opt`; `_readLeftoverDaysPicker()` reads back whichever
  are checked as a plain array, passed straight through to
  `_upsertMealPlan`. spanDays itself is now written as a constant `1` on
  every NEW save (from `_saveEditor`) - it's kept in the schema and in
  `_fetchMealPlan`'s fallback ONLY for reading pre-existing data, never
  produced going forward.

  (3) "clicking a left over card opens the original 'primary' card to
  edit" - `_openEditorForDate` now checks `existing.leftover &&
  existing.sourceDateKey` right after resolving `existing` via
  `_getMealForDay`, and if so immediately redirects (recursive call +
  `return`) to `_openEditorForDate(new Date(existing.sourceDateKey +
  "T00:00:00"), this._editingBlockIndex)` instead of opening an editor
  scoped to the leftover day itself. This makes `_saveEditor`'s existing
  `wasLeftoverProjection` "create a same-day Skipped override" branch
  unreachable through the normal click-a-card path (left in place,
  documented as defensive-only, in case something else ever calls
  `_openEditorForDate` directly on a leftover day).

  Rewrote `test_meal_leftovers.js` end to end for the new model (explicit
  non-contiguous day picks project correctly and nowhere else; same-block-
  only; explicit-entry-always-wins; a NEW legacy-fallback case exercises
  the real `_fetchMealPlan` path with spanDays-only data via an overridden
  `_getItems`, confirming old data still projects its old contiguous run;
  `_upsertMealPlan` payload assertions now check `leftoverDates` instead
  of `spanDays`; editor-prefill and save-through-the-picker cases; and a
  new case proving the click-redirect lands on the source day with the
  picker reflecting the source's own picks). Also fixed
  `test_additional_recipes.js`, which still referenced the now-removed
  `.input-leftover-days` element and would otherwise have thrown on
  `_saveEditor()` - unrelated to that test's own actual subject, just
  collateral from this same UI element's removal.

- **v144.10 (1.108.10)**: user request, verbatim: "Grey out event should be
  under calendars not menu blocks Should apply to all days before it as
  well." Two independent changes to the existing v141+ greyOutPastEvents
  Settings toggle in `family-week-calendar-card.js`:
  (1) UI location - the `.grey-out-past-btn` field (markup only; no JS
  wiring change needed, since every binding already targets it purely by
  class, never by its position in the DOM) moved from the `#menu-blocks-
  body` accordion into `#calendars-body`, right after the existing
  Timeline range field, with an updated hint line explaining the new
  before-today behavior below.
  (2) Behavior - `_buildDayColumnHtml`'s `isPastEvent`/`greyOutPast` used
  to only ever grey TODAY's column, event by event, as each one's own end
  time (or a reminder's due time) passed. Added a new `isBeforeToday`
  check (`dayStart.getTime() < today.getTime()`) so `greyOutPast` now also
  activates for any earlier day - but for those days `isPastEvent` returns
  true unconditionally (skipping the per-event end/due-time comparison
  entirely), since the WHOLE DAY is already over, not just some of its
  events. Today's own column keeps the original one-event-at-a-time
  behavior unchanged; a FUTURE day is still never greyed. Updated
  `test_grey_out_past_events.js`: a new case confirms an earlier day's
  event/reminder is greyed even when its own clock-time technically
  hasn't "ended" yet relative to now (proving the whole-day-not-per-event
  distinction), a matching off-by-default case for an earlier day, and a
  DOM check that `.grey-out-past-btn` now lives inside `#calendars-body`
  and no longer inside `#menu-blocks-body`.

- **v144.9 (1.108.9)**: user request, verbatim: "the chore board and the
  rewards board seem to take a while to refresh, can we make the cards
  reload when you click their tab, if not every 60 seconds." Both
  `family-hub-chores-card.js` and `family-hub-rewards-card.js` already
  poll every 20s via `_startPolling()`'s `setInterval` (well under the
  requested 60s fallback - no interval change needed) - the actual gap was
  that `connectedCallback` only restarted that timer, and `setInterval`
  doesn't invoke its callback until the FIRST TICK, so a reconnect (which
  is exactly what switching HA dashboard views/tabs does to these custom
  elements - not connected/disconnected content, only cards on the
  now-inactive view get physically detached from the DOM) could leave up
  to 20s-stale data showing right after switching back. Fix: pulled the
  setInterval callback body out into a new `_pollTick()` method on both
  cards, and `connectedCallback` now calls it immediately (in addition to
  `_startPolling()`) whenever it's reconnecting with `_hass` already set.
  Guarded against the exact class of race `test_initial_load_race.js`
  already covers for the calendar card's own first-load flow (a
  disconnect+reconnect firing again while the very first load's
  `_firstLoadPromise` is still pending, e.g. a masonry/grid dashboard
  re-parenting elements while it lays out) with a new
  `_reconnectPollPending` instance flag - without it, each reconnect
  during that window would stack another `.then()` on the same promise
  and fire `_pollTick()` an extra time once it resolves, duplicating the
  very first fetch (the exact bug that test file's docstring describes
  for the calendar card, just reintroduced here by this change if left
  unguarded). New `test_card_reconnect_refresh.js`: both cards fetch
  immediately on disconnect+reconnect (not just on the next 20s tick), and
  a race scenario (two reconnects while the first settings fetch is
  artificially delayed) still produces at most one extra fetch, never two.
  No changes to `family-hub-goals-card.js`/`family-hub-pantry-card.js`/
  `family-hub-my-chores-card.js` or the calendar card - the user only
  named the Chores and Rewards boards.

- **v144.8 (1.108.8)**: user request, verbatim: "1. Gift stars should be a
  modal / 2. Add chore pin should be a modal" (item #2 - "chore pin" here
  is the kiosk PIN set in a person's own Notifications-tab profile, the
  same feature the earlier "chore passwords dont save when you update"
  bug report was about; item #1 shipped as v144.7/1.108.7 above).
  `family-week-calendar-card.js`'s `_openKioskSetPinPrompt` (a bare
  `window.prompt()`/`window.alert()` pair) replaced with a proper
  `.kiosk-pin-modal` overlay - `_openKioskSetPinModal()` (resets the input
  and any leftover error, opens the modal, focuses the input),
  `_closeKioskSetPinModal()`, and `async _submitKioskSetPin()` (same
  4-8-digit validation as before, but now writes to a `.kiosk-pin-error`
  slot instead of `alert()`-ing, then sends `family_hub/kiosk/set_pin` and
  closes the modal on success - a thrown/rejected save shows the backend's
  message in that same slot and leaves the modal open, exactly like the
  Gift Stars modal's own error handling one release earlier). Deliberately
  used THIS FILE's own existing modal button-class convention
  (`.btn-cancel`/`.btn-save`, and a dedicated `.kiosk-pin-error` div
  matching this file's `.add-event-error` "one CSS class per feature"
  error-styling pattern) rather than copying family-hub-rewards-card.js's
  `.cancel-btn`/`.save-btn`/`.form-error`+`hidden` convention verbatim -
  the two card files have never shared a common modal-button naming
  convention, and there was no reason to introduce a second one into this
  file just because the two features shipped back-to-back. New
  `test_kiosk_pin_set_modal.js`: admin-only visibility, blank input/no
  error on open, Cancel sends nothing, a too-short PIN shows an inline
  error and keeps the modal open, a valid PIN calls `set_pin` and shows
  "PIN set.", a blank PIN clears it ("PIN cleared."), and a thrown backend
  error surfaces inline without closing the modal. No backend changes -
  `family_hub/kiosk/set_pin` itself, and its documented pinHash/pinSalt
  carry-forward fix, are unchanged; this was purely a frontend
  prompt-to-modal conversion, same shape as v144.7.

- **v144.7 (1.108.7)**: user request, verbatim: "1. Gift stars should be a
  modal / 2. Add chore pin should be a modal" (item #1 only; item #2 is
  still queued). `family-hub-rewards-card.js`'s `_giftStars(toUserId,
  toName)` used to be a bare `window.prompt()`/`window.alert()` pair -
  replaced with a proper `.modal-overlay.gift-stars-modal` following the
  same `.modal-box`/`.modal-actions`/`.cancel-btn`/`.save-btn`/
  `.form-error` convention every other modal in this codebase uses (the
  generic outside-click-to-close wiring already covers any `.modal-overlay`
  automatically, so no extra plumbing needed there). Three new methods:
  `_openGiftStarsModal(toUserId, toName)` (builds the modal body fresh each
  open - shows the sender's own current balance, a number input capped at
  that balance via `max`, and focuses the input), `_closeGiftStarsModal()`,
  and `async _submitGiftStars(toUserId)` (validates `amount > 0` inline
  - `.gift-stars-error` shown in the modal instead of an `alert()` - sends
  `family_hub/rewards/gift_stars`, refetches rewards state, and closes the
  modal on success; a rejected/failed gift surfaces the backend's error
  message in that same inline `.gift-stars-error` slot and leaves the modal
  open rather than closing or failing silently). `test_rewards_card.js`'s
  gift-stars block rewritten end to end to open the modal via `.gift-
  stars-btn`, drive `.gift-amount-input`/`.gift-stars-send-btn`/`.gift-
  stars-cancel-btn`, and assert on `.gift-stars-error` for both the empty-
  amount and rejected-gift cases, plus a new cancel-sends-nothing case. No
  backend (`reward_engine.py`/`chores_websocket_api.py`) changes - the
  `family_hub/rewards/gift_stars` websocket command already existed and is
  unchanged; this was purely a frontend prompt-to-modal conversion.

- **v144.6 (1.108.6)**: user request, verbatim: "theme should be per
  device." Family Hub already has a fully separate "per-device theme"
  mechanism (`theme-builder-panel.js`'s own "This device" dropdown,
  `theme-selector-card.js`) - but that one only ever applies raw native HA
  theme colors (`_register_ha_themes`/`_theme_to_ha_vars` explicitly only
  carry over colors + a synthesized shadow, "those stay available only via
  theme_builder/list for cards built to use them") to `document.
  documentElement`, completely independent of and invisible to Family
  Hub's OWN card-level theme system (`settings.theme`/`useGlobalTheme`/
  `globalThemeId`, the `--fc-*` vars every card computes in its own
  `_resolveTheme`/`_applyThemeVars`, including `cardOpacity`/`glassBlur`).
  That Family Hub theme choice was a single shared value in the household
  Settings blob - identical on every tablet - so there was no way for one
  device to show Liquid Glass while another showed something else. Ported
  the SAME device-local-override-with-fallback pattern
  `_getShowTimeline`/`_getWeekViewVariant` already use for other per-device
  preferences (localStorage, not the shared Settings blob): a new shared
  key `familyHubDeviceThemeOverrideLocal` holds either `""` (nothing saved
  - follow the household setting, the default, so nothing changes for
  anyone who hasn't touched this), `"__default__"` (force this device's
  own plain/local look regardless of what the household picked), or a
  specific theme id (overrides the household's `globalThemeId`). Every
  Family Hub card's `_resolveTheme` now computes `useGlobalTheme`/
  `globalThemeId` through this override before falling back to
  `settings.useGlobalTheme`/`settings.globalThemeId` - a single, minimal,
  localized change per card (one function each), same "copy-pasted
  boilerplate, not shared" convention every other per-card theme fix this
  batch used. `family-hub-my-chores-card.js`'s own separate
  `_headerTitleFontSize` (it independently re-resolves the global theme
  for its font-size-only needs, rather than reusing `_resolveTheme`) also
  updated to the same precedence, so its header font always matches
  whichever theme actually ends up applied. UI lives ONLY on the calendar
  card's Settings modal (Appearance section) - a new "This device's
  theme" `<select>` right below the existing shared "Use global theme"
  toggle, offering "Match household setting" + "This device's own plain
  look" + every theme the shared picker already lists (Theme Builder
  custom AND native HA, reusing `_globalThemes`) - consistent with every
  other Family Hub setting living only there ("this card no longer owns a
  Settings modal" applies to all five other cards). Saves straight to
  localStorage on change with no Save button involved (matches the
  Permissions tab's own instant-save convention) and reapplies
  `_applySizeVars()` immediately so the calendar card itself updates live;
  the other five cards pick it up on their own next render since they read
  the identical localStorage key. New `test_device_theme_override.js`
  covers the precedence logic on all six cards (no override falls through
  to household setting; `"__default__"` forces local even when the
  household has a global theme on; a specific override wins over the
  household's own `globalThemeId`; an override still applies even when the
  household's `useGlobalTheme` is off) plus the calendar card's own Settings
  UI (the select exists, lists options, reflects the saved value, and
  writes to localStorage on change). Verified via the mandatory
  revert-and-confirm-fails check before trusting it. Full sweep: only the
  same two pre-existing/unrelated JS failures from the v144.4/v144.5
  entries above reproduced, nothing newly broken.

- **v144.5 (1.108.5)**: user request, verbatim: "Can it make the cards
  appear liquid glass too, aka slighly transparent and foggy" - a
  follow-up right after confirming the Liquid Glass/Liquid Glass Dark
  presets (v139/1.104.0) already existed. Those presets' translucent/
  blurred "glass" look (`cardOpacity`/`glassBlur`) only ever actually
  rendered on `family-week-calendar-card.js` - every other Family Hub card
  (`family-hub-chores-card.js`, `family-hub-rewards-card.js`,
  `family-hub-goals-card.js`, `family-hub-pantry-card.js`,
  `family-hub-my-chores-card.js`) had copy-pasted the calendar card's OLD,
  pre-glass `_resolveTheme`/`_applyThemeVars` shape (from before v139) and
  was never updated when glass support was added there, so picking Liquid
  Glass on any of those cards just silently rendered plain opaque colors.
  Ported the exact same fix to all five: `_resolveTheme`'s global-theme
  branch now also reads `cardOpacity`/`glassBlur` off the matched global
  theme (100/0 fallback, so every existing custom/local theme renders
  unchanged); each card gained its own `_hexToRgba(hex, alpha)` helper
  (none had one before - only the calendar card did); `_applyThemeVars`
  now sets `--fc-card`/`--fc-surface-alt`/`--fc-surface2` via
  `_hexToRgba(..., cardOpacity/100)` instead of a plain opaque hex, and
  sets a new `--fc-glass-blur` var; each card's CSS gained one
  `backdrop-filter: blur(var(--fc-glass-blur, 0px))` rule (with the
  `-webkit-` prefix for Safari/iOS) targeting that card's own "surface"
  classes - `.chore-card`/`.chore-column`/`.chore-col-header`/routine and
  reminder rows/kiosk-login buttons on the Chores card,
  `.catalog-item`/`.balance-card`/icon-picker controls on Rewards,
  `.goal-card` on Goals, `.stock-row`/`.extra-row` on Pantry, `.chore-row`
  on the mini My Chores card. Each card's `.modal-box` was deliberately
  left alone (unlike the calendar card's own modal, these five cards'
  dialogs use `var(--fc-bg)`, not `--fc-card`, i.e. already always-opaque
  by design, for form-legibility reasons that predate this task - not a
  bug to fix). New `test_cards_liquid_glass.js` covers all five cards in
  one file (mirroring `test_liquid_glass_theme.js`'s own structure): the
  no-theme-configured case stays byte-for-byte opaque/zero-blur, a global
  Liquid-Glass-shaped theme's `cardOpacity`/`glassBlur` reach the live
  `--fc-card`/`--fc-glass-blur`/`--fc-surface-alt` vars, and each card's
  CSS actually has a `backdrop-filter` rule wired to its own surface
  classes (not just computed-but-unused vars). Verified via the mandatory
  revert-and-confirm-fails check before trusting it. Full sweep: all five
  cards' existing test files pass unchanged, plus the pre-existing
  `test_liquid_glass_theme.js`; the same two pre-existing/unrelated JS
  failures from the v144.4 entry above (`test_chores_card.js`'s column-
  placement check, `test_rewards_card.js`'s gift-button check) reproduced
  identically, confirmed unrelated to this change.

- **v144.4 (1.108.4)**: user request, verbatim: "We need to add a couple
  permissions, Edit Chore, prevents a kid from adding stars to an open
  chore, and allow star override, prevents a kid from making random chores
  that dont need approval and getting stars." Splits two more narrow
  permissions out of the existing all-or-nothing `PERMISSION_ASSIGN`, same
  precedent as `PERMISSION_COMPLETE_ANY`/`PERMISSION_REWARD_ADD` splitting
  out of their own broader permissions in v121/v127 (`CHORE_PERMISSIONS`
  now has 8 entries). **`PERMISSION_EDIT_CHORE`** (`can_edit_chore`):
  `ws_update_chore`'s base gate changed from `PERMISSION_ASSIGN` to this new
  permission - `ws_create_chore` is unchanged (still `PERMISSION_ASSIGN`
  only), so a household that wants someone to create/assign chores without
  also letting them come back and edit any existing open chore's
  star_value/due_date/etc. can now grant one without the other.
  **`PERMISSION_STAR_OVERRIDE`** (`can_star_override`): gates flipping
  `no_approval_required` to `True` on either create or update - without it,
  someone with `PERMISSION_ASSIGN`/`PERMISSION_EDIT_CHORE` can still
  create/edit ordinary chores, just can't make one that pays out stars
  instantly with zero verification. Turning it OFF (or omitting the field)
  never needs this, only turning it ON does. A real subtlety caught while
  building this: the chores card's edit form always resends whatever the
  no-approval checkbox currently shows, whether the person touched it or
  not, so `ws_update_chore`'s star-override gate compares against the
  chore's CURRENT stored value rather than just the incoming field's
  truthiness - otherwise someone with `can_edit_chore` but not
  `can_star_override` would be blocked from saving an unrelated edit (e.g.
  notes) on a chore an admin had already marked `no_approval_required=True`,
  since the resend of that unchanged value would itself trip the gate.
  Frontend (`family-hub-chores-card.js`): new `_canEditChore()`/
  `_canStarOverride()` helpers alongside the existing `_canAssign()`/
  `_canVerify()`; the chore-list and detail-view Edit buttons both swapped
  from `_canAssign()` to `_canEditChore()`; the no-approval checkbox in
  both the create and edit modals is disabled (with an explanatory
  `title`) when the viewer lacks `can_star_override` - the edit modal's
  checkbox stays enabled if the chore is ALREADY `no_approval_required` so
  a `can_edit_chore`-only user can still turn it back OFF, just can't turn
  it on. `family-week-calendar-card.js`'s Permissions tab gained two more
  `.perm-check` rows (`can_edit_chore`, `can_star_override`) - purely
  additive, the same generic `data-key`-driven checkbox-save wiring already
  handles them with no other JS change needed. New backend tests in
  `test_chores_websocket_api.py`: create rejected/allowed on
  `no_approval_required` with/without `can_star_override` (admin bypasses);
  update rejected/allowed with/without `can_edit_chore` (admin bypasses);
  update's `no_approval_required` rejected/allowed with/without
  `can_star_override` on top of `can_edit_chore`; the unchanged-resend case
  described above explicitly covered; `ws_set_permissions` accepts and
  persists both new keys. Verified via the mandatory revert-and-confirm-
  fails check on all three new/changed backend gates (base edit-chore gate,
  star-override gate, and the existing-value comparison fix) before
  trusting them. Full project sweep: only the same previously-documented
  pre-existing Python failures reproduced
  (`test_chores_todo_and_services.py`, `test_config_flow.py`/
  `test_family_hub.py`'s shared config-flow step-order issue,
  `test_family_calendar_reminders.py`); two JS failures newly observed
  during this sweep (`test_chores_card.js`'s "approved chore stays in its
  assignee's column" and `test_rewards_card.js`'s gift-button check) were
  confirmed to be pre-existing and unrelated - reproduced identically
  against the untouched v1.108.2 shipped build, look tied to the advancing
  wall-clock date rather than anything this task touched - flagged here
  rather than silently ignored, but out of scope to chase down as part of
  this permission-split work.

- **v144.3 (1.108.3)**: Bug fix - the My Pantry card (shipped back in
  v140-v142/1.107.0) could never actually be added to a dashboard - it
  simply never showed up in the "Add Card" search no matter what you
  searched for. Root cause, confirmed directly via this session's new live
  Home Assistant introspection tools
  (`mcp__remote-devices__Home_Assistant__ha_config_list_dashboard_resources`):
  unlike every other Family Hub card, the pantry card's JS file was never
  wired into `__init__.py`'s own frontend/dashboard-resource registration
  on startup, so Home Assistant had literally never served it or
  registered it as a dashboard resource at all. Fixed by adding
  `PANTRY_CARD_JS_URL` to `const.py` and wiring the pantry card into the
  same four-step static-path/dashboard-resource registration pattern
  `async_setup_entry` already uses for every other card (chores/rewards/
  goals/etc.) - static path config, content-hash cache-busting suffix,
  dashboard-resource registration call. Full sweep confirmed only the
  same previously-documented pre-existing failures, nothing newly broken.

- **v144.2 (1.108.2)**: closed out the last three open items on the task
  list (task #21, #31, #32) autonomously under a standing "work straight
  through" instruction, right after the v144.1/1.108.1 kiosk-PIN emergency
  patch shipped.

  **Task #32 - Planner view hides badge-matched events**
  (`family-week-calendar-card.js`) - `_renderPlannerGrid`'s `dayPool` build
  only ever excluded an event for a badge's `hideMatch` rule, never for its
  `match` rule, even though Week/Portrait's own `_buildDayColumnHtml` has
  always excluded both. Added the same `matchedBadge` check/`continue`
  right after the existing `hideMatched` one - the badge itself still
  renders (computed separately into `dayBadges` earlier in the same loop),
  only the underlying event list entry for it is suppressed now. This item
  had previously been marked completed on the task list in error (see the
  v144.1 entry's own task-list-audit note) before being caught and
  reverted to in_progress; this is the actual fix.

  **Task #21 - Today card shows all subscribed todo lists**
  (`family-today-card.js`) - `_fetchTodayReminders` previously only ever
  read `this._config.reminders_entity` (the one shared family list), even
  though a test file's own comments described a v142+ multi-list
  subscription rule as already shipped. Rewrote it to mirror the full
  calendar card's own v130+ `_fetchReminders` logic exactly: the shared
  family list, plus the viewer's own individual list unconditionally, plus
  any other person's list they're subscribed to at either tier
  (`remindersSubscriptions[personEntity]` === `"calendar"` or
  `"calendar_alert"`). Each item is tagged `listEntity`/`color`/`personName`
  so "Done" targets the right list and items can show whose list they came
  from. Also fixed `_getPeople()`, which was silently dropping
  `remindersEntity` off every person object - the actual root cause of why
  individual lists could never have worked here even before the
  subscription logic existed, since `myProfile.primaryCalendar`/
  `person.entity` matching had nothing to look up a `remindersEntity`
  through.

  **Task #31 - Gift stars between users** (new feature, no prior test
  coverage or prior attempt) - a household member can now give some of
  their OWN star balance to another member. Backend: `reward_engine.py`
  gained `gift_stars(rewards, from_user_id, to_user_id, amount, ...)` -
  validates both ids present, rejects a self-gift (`invalid_recipient`),
  validates a positive `amount`, checks the giver's balance covers it
  (`insufficient_balance`, same shape as `redeem_item`'s own check), then
  debits the giver and credits the recipient via two `add_stars` calls
  (new `LEDGER_SOURCE_GIFT_SENT`/`LEDGER_SOURCE_GIFT_RECEIVED` ledger
  sources) so the gift shows up in both people's Star History like any
  other transaction. `chores_websocket_api.py` gained
  `family_hub/rewards/gift_stars` (`ws_gift_stars`) - self-serve and
  instant like `ws_redeem_reward`, elevation-aware via `_effective_actor`
  (a kid logged in at a shared kiosk can gift their own stars), but
  deliberately has **no** "on behalf of someone else" mode at all - a gift
  only ever spends the real caller's own balance, so there's nothing for a
  reward-override permission to unlock. Resolves both display names via
  `_user_display_name` for the ledger reason text ("Gift to Kid" / "Gift
  from Mom"). Frontend: `family-hub-rewards-card.js`'s `_balanceCardHtml`
  gained a small gift-emoji button on every OTHER member's balance card
  (never the viewer's own), which prompts for an amount
  (`window.prompt`, same lightweight convention `_useBank` already uses)
  and sends the ws call, surfacing a rejected gift via `window.alert`
  rather than failing silently. New tests: `test_reward_engine.py` (5
  cases), `test_chores_websocket_api.py` (4 cases), `test_kiosk_pin_login.py`
  (1 elevation case), `test_rewards_card.js` (button visibility + prompt
  flow + cancel + error alert). All verified via revert-and-confirm-fails.

  Also corrected two things in this doc's own known-JS-failures list while
  investigating: `test_planner_badge_hides_event.js`/`test_planner_mobile.js`
  (task #32) and `test_today_card_reminders.js` (task #21) are no longer
  failures (see the "Three known" list above, down from six) - both were
  genuine feature gaps, now actually fixed, not just re-verified as
  already working.

- **v140-v142 (1.107.0)**: a 24-item batch (18 items given up front, plus 7
  more added mid-session, minus one - "Update README for removed Todo
  lists wording" - explicitly withdrawn by the user before it was ever
  started) worked through autonomously under a standing "work straight
  through" instruction: batch by size (small fixes first), no version
  bump or changelog entry after each item, just one bump at the very end
  covering the whole list - hence three internal `v14x+` code-comment
  tags (v140/v141/v142) landing in a single shipped release here. **This
  entry only has full first-hand detail for the items completed in the
  post-compaction portion of that session** (roughly the back half of the
  list) - the earlier items were done in a portion of the conversation
  that got compacted away before this entry was written, so their detail
  below is necessarily thinner; grep each file's own `v140+`/`v141+`
  comments for anything not covered here.

  **Move a planned meal to another week** (`family-week-calendar-card.js`)
  - a date-picker + Move button in the day/menu editor's More Options
  accordion, reusing the same `_moveMealPlan` primitive in-week drag-and-
  drop already used (swaps with the destination slot's existing meal
  rather than overwriting it). Fixed a real bug along the way:
  `_moveMealPlan` was dropping `spanDays` on every move, silently
  resetting a moved leftovers entry back to a plain 1-day meal.

  **Portrait view** (4-days-on-top/3-on-bottom calendar layout) was
  requested again in this batch but turned out to already be fully
  shipped as of v139 - confirmed via this doc's own v139 entry, no code
  changes needed.

  **My Pantry card** - a new standalone card (`family-hub-pantry-card.js`,
  `pantry_engine.py`, new `pantry`/`pantry_store` Store) for tracking
  what's on hand beyond Grocy's own stock: a "Grocy Stock" section (list/
  add-stock/consume/edit-entries against Grocy's real `/api/stock/*`
  endpoints, gracefully degraded when Grocy isn't configured) plus an
  "Also Tracking" section of simple extras (name/quantity/location/
  expiration/notes) that don't warrant a full Grocy stock record - its
  own engine module and 10 new `family_hub/pantry_*` / `pantry_extras/*`
  websocket commands, deliberately no permission gate (same low-stakes
  shared-kitchen-tablet posture as routine item toggling).

  **Day/menu editor's read-only view card now shows the meal's own
  description/notes** - previously the only way to see what was typed
  there was to tap Edit first. Same "hide the row when empty" pattern as
  every other optional fact on that card.

  **Month view now renders a day's planned meal ABOVE its events/
  reminders**, not after them, so dinner is the first thing a glance at
  Month view surfaces on a busy day.

  **"Grey out events/reminders that already passed today"** - new opt-in
  Settings toggle (`greyOutPastEvents`, off by default), applies only to
  TODAY's column, purely visual (`opacity: 0.45`, no pointer-events/cursor
  change - still fully tappable). A reminder counts as past once its own
  due moment arrives; a real event counts as past only once fully over
  (end time), not merely started. Affects both Week's and Portrait's
  shared `_buildDayColumnHtml` rendering path.

  **Additional recipes** - a planned meal can now have any number of
  side/dessert/sauce recipes attached alongside its one main recipe
  (which still alone drives the card's name/description/prep-cook-serves/
  color). Stored as `additionalRecipes: [{name, link, grocyRecipeId}]`
  inside the same JSON payload every other meal-plan field already lives
  in (`_parseDishDescription`/`_upsertMealPlan`/`_upsertMealPlanByUid`/
  `_moveMealPlan` all carry it through). Added either via a third
  `_openLoved` picker mode (`"additional"`, alongside the existing
  true/false) that appends instead of overwriting the slot's main fields,
  or via a plain two-prompt "name + link" flow for something that isn't
  (and doesn't need to be) in the Recipe Box at all. Shown read-only in
  the view card as "Also: ...", each name clickable when it has somewhere
  to go (Grocy viewer if `grocyRecipeId` is set, otherwise the plain
  link).

  **Planner view now supports custody badges** - it was the one view
  with zero badge support at all, unlike Week/Month. Same per-day
  `match`/`hideMatch` substring-matching logic those two views already
  use, ported into `_renderPlannerGrid`'s day-row loop and rendered into
  the day-name column's date number the same way.

  **Family Today card (`family-today-card.js`) now shows every todo list
  the logged-in user is subscribed to**, not just the shared Family list
  - it had never picked up the full calendar card's own v130+ multi-list
  reminders-subscription rule. `_fetchTodayReminders` rewritten to mirror
  the calendar card's `_fetchReminders` exactly (family list always +
  own individual list unconditionally + every other subscribed list at
  either tier), each item tagged with `listEntity`/`color`/`personName`
  so "Done" hits the right list and a combined view stays legible about
  whose item is whose. Required adding `remindersEntity` to this card's
  own `_getPeople()`, which had been silently dropping it.

  **A more mobile-friendly Planner view** - below the same 700px
  breakpoint every other view already collapses at, `_renderPlannerGrid`
  now swaps its wide sideways-scrolling person-columns grid for a stacked
  "day card, then each person's events underneath" layout instead (a
  person with nothing planned that day gets no section at all, not an
  empty one). Decided via `matchMedia` at render time rather than pure
  CSS (the reshape needs different markup, not just a reflow), with a
  matchMedia change listener wired into `connectedCallback` so rotating/
  resizing while Planner is already open picks it up live.

  **From the compacted earlier portion of this same batch** (thinner
  detail - see each file's own comments): routine checklist items
  (`routine_engine.py`) can now optionally award stars on completion,
  either auto-paid immediately or gated behind the same approval flow
  Chores already uses (`star_value`/`no_approval_required`, default 0/off
  - most items are unaffected) - `reward_engine.py` gained the ledger
  source for it. Several other smaller fixes/refinements from the same
  session are not individually detailed here; check `git blame`-equivalent
  (file mtimes / `v140+`/`v141+` comment tags) if a specific behavior
  needs tracing back.

  **Testing**: every item above got a dedicated permanent jsdom/pytest
  test file (`test_move_meal.js`, `test_pantry_engine.py`,
  `test_pantry_card.js`, `test_meal_view_description.js`,
  `test_month_meals_on_top.js`, `test_grey_out_past_events.js`,
  `test_additional_recipes.js`, `test_planner_badges.js`,
  `test_today_card_reminders.js`, `test_planner_mobile.js`), each
  verified via this project's revert-and-confirm-fails-then-restore
  convention, plus a regression sweep of adjacent existing tests after
  every change - all green, including the pre-existing documented-stale
  exclusions (`test_reminder.js`, `test_servings_scaling.js`,
  `test_family_calendar_reminders.py`, `test_portrait_view.js`'s stale
  hardcoded sandbox path, `test_planner_view.js`'s stale button-count
  assumption, `test_chores_card.js`'s stale accordion assumption).

  **Not yet done as part of this release**: the full packaging pipeline
  (steps 3/4/7-11 of "Release / packaging process" above - full 20-file
  Python + 50+-file JS test sweep in a rebuilt fake-`homeassistant`
  harness, root `family-week-calendar-card.js` mirror sync, rebuilding
  `family-hub-repo/`, building both release zips, delivering them) was
  NOT run this session due to a context-budget cutoff right after the
  version bump/changelog - manifest.json and README.md were bumped/
  updated, but no zip exists yet for 1.107.0 and no GitHub Release has
  been cut. A follow-up session should run that full pipeline before
  telling the user this release is actually installable via HACS/zip
  upload.

- **v139 (1.104.0)**: two requests handled together in one autonomous pass
  (no clarifying questions needed - both were concrete enough to proceed):
  "I want to add another view for the calendar I want 4 days on top and 3
  days on bottom, this is going to be better for people who want to use
  portrait displays. While you are at it, look at the themes and create
  another one that is more of a liquid glass type theme in both light and
  dark modes." **(1) Portrait view.** A 4th view-switcher mode (peer of
  Week/Month/Planner) for portrait-oriented wall tablets. Rather than
  duplicate Week's per-day rendering, `_renderWeekGrid()` was refactored
  into `_buildWeekLikeContext()` (shared setup) + `_buildDayColumnHtml(i,
  ctx)` (the exact original per-day HTML-building logic, extracted
  verbatim) + `_afterRenderDayColumns(ctx)` (shared post-render: timeline
  scroll + meal-drag handler attach); Week itself now goes through these
  same helpers. New `_renderPortraitGrid()` calls `_buildDayColumnHtml` for
  all 7 days and splits them `cols.slice(0,4)`/`cols.slice(4,7)` into two
  `.portrait-row` flex wrappers. Since Portrait drags the same day-column
  banners Week does, Edit Meals stays available (unlike Month/Planner,
  where it's hidden). Wired through `_viewMode`, `defaultView` settings
  (`_initFirstLoad`/`_normalizeSettings`), the view-switcher and Settings'
  Default View button rows, and `_printView()`. New `test_portrait_view.js`
  (4 view buttons, grid shape 4-then-3 with 7 total day-cols, today
  highlighting, event placement pinned to fixed day-indices 1/5 rather than
  "today" itself to avoid this project's own documented real-clock date-rot
  flake class, meal banners per column, Default View round-trip). **(2)
  Liquid Glass theme, light + dark.** Two new built-in presets
  (`"liquidglass"`/`"liquidglassdark"`) with a frosted/translucent look
  (`cardOpacity` 62/55) plus a new `glassBlur` field (16px/18px) rendered
  via `backdrop-filter`/`-webkit-backdrop-filter`, each shipping its own
  bundled aurora-mesh SVG background (inline `data:image/svg+xml;base64,`,
  generated by a new `_liquid_glass_bg_image(dark)` helper, no network/
  build-step dependency - same pattern as the existing `HALLOWEEN_BG_IMAGE`
  on the card side). Building this surfaced and fixed two real pre-existing
  gaps: `_applySizeVars()` computed `--fc-card`/`--fc-surface-alt`/
  `--fc-surface2` from theme colors but never applied `cardOpacity` at all
  (Theme Builder's own live preview respected it; the actual dashboard
  card silently never did), and `_resolveTheme()`'s GLOBAL-theme branch (a
  shared Theme Builder theme selected via `useGlobalTheme`/`globalThemeId`)
  rebuilt its returned object from scratch and silently dropped
  `cardOpacity`/`glassBlur` on the floor even though the websocket data had
  them. Both fixed. Theme Builder panel (`theme-builder-panel.js`) gained
  a `.tb-glass-blur` range slider (0-24) next to the existing transparency
  slider, wired through `_blankTheme`/`_migrateTheme`/`_updatePreview`/
  save, same shape as the pre-existing opacity slider. **A cap regression
  caught before shipping**: the built-in preset count grew 6 -> 8, and
  `MAX_THEMES` (`const.py`) / `TB_MAX_THEMES` (theme-builder-panel.js) were
  both already hardcoded to 8 (6 presets + 2 custom-theme headroom) - left
  unchanged, a fresh install would seed all 8 slots with presets and Theme
  Builder's "Add theme" button would be permanently disabled from the very
  first load. Bumped both to 10 to restore the 2-custom-theme headroom;
  verified (AST-extraction simulation of `_load_themes`' migration loop,
  see below) that this also means households already sitting at the OLD
  cap of 8 (6 presets + 2 custom) automatically receive both new presets
  on upgrade without displacing their custom themes. New
  `test_liquid_glass_theme.js` (panel slider + save round-trip; card
  `_applySizeVars`/`_resolveTheme` translucency/blur wiring, both the
  default-theme backward-compat case and the global-theme bug fix).
  **Verification note**: this session's `device_bash` VM had neither the
  fake-`homeassistant` Python harness (`/tmp/fcrtest`) nor `node_modules/
  jsdom` (`/tmp/badgetest`) that earlier sessions built - `npm install`
  is 403-blocked here the same way it is in the cloud workspace, and
  rebuilding the ~20-minute fake HA harness wasn't done this pass. Verified
  instead via: (a) a minimal hand-rolled non-jsdom DOM shim calling the
  card's real prototype methods directly (`_applySizeVars`, `_resolveTheme`,
  `_hexToRgba`) - 5/5 checks passed for both the portrait grid and the
  glass theme wiring; (b) AST-extraction of `_seed_themes`/`_migrate_theme`/
  `MAX_THEMES` straight out of the real `__init__.py`/`const.py` source,
  exercising every new assertion added to `test_family_hub.py`'s
  `theme_tests()` (8-preset id set, strict translucency/blur bounds,
  distinct backgrounds, hex-color format, every non-glass preset still
  defaulting `glassBlur` to 0, migration topping up correctly under the new
  cap in 4 scenarios including a household genuinely AT the new cap) - all
  passed against the real, current function bodies. `test_family_hub.py`/
  `test_portrait_view.js`/`test_liquid_glass_theme.js` were written but not
  run end-to-end via the project's own `python3 test_family_hub.py` / a
  real jsdom `node test_*.js` invocation this session - flagged to the user
  so a future session (or the user's own machine, if `npm install`/harness
  rebuild works there) can run the full suite for final confirmation.

- **v138.1 (1.103.1)**: user reported a real-world failure right after
  installing v138 — the new "Meal Plan & Reminders lists" wizard screen
  (`async_step_todo_lists` / `_build_todo_lists_schema` in
  `config_flow.py`) rejected submission with "Entity is neither a valid
  entity ID nor a valid UUID" on both entity fields, even though they were
  intentionally left blank (the normal way to trigger "Create missing
  lists for me"). Root cause: `CONF_MEAL_PLAN_ENTITY`/`CONF_REMINDERS_ENTITY`
  are `vol.Optional(..., default="")` validated by a bare
  `selector.EntitySelector(...)`, and real HA's `EntitySelector.__call__`
  validates through `homeassistant.helpers.config_validation.entity_id_or_uuid`,
  which rejects `""` outright — so a never-configured install's own default
  value failed the schema the moment the form was submitted as-is. This
  bug is pre-existing (the `todo_lists` step's schema itself wasn't touched
  by the v138 wizard rebuild) but was only now getting exercised, since the
  step is otherwise identical to before. Fixed by wrapping both fields as
  `vol.Any("", selector.EntitySelector(...))`, the standard HA pattern for
  an optional entity picker. Added `test_todo_lists_schema_allows_blank_entity_fields`
  in `test_config_flow.py`, which calls the schema's own validator directly
  (structural check: the field's validator must be `vol.Any`, and calling
  it with `""` must not raise) — this is a schema-level test that none of
  the existing step-level tests are, deliberately, since the fake
  `homeassistant.helpers.selector.EntitySelector` stub used by every other
  test in this file is an unvalidated passthrough (by design — it exists
  only to give `config_flow.py` something importable to build form
  metadata with), so it can never itself catch a real-HA validation
  rejection like this one. Verified via revert-and-confirm-fails. No other
  files changed; full Python regression suite still green.

- **v138 (1.103.0)**: two separate user requests handled back to back -
  a Settings reorganization, then a first-time setup wizard rebuild that
  turned into a real bug fix too.

  **Settings reorg** ("let's move chores, rewards, and routine settings
  into their own accordion in the general settings tab", then "let's move
  default view hours of the day. and timeline range under the calendars
  accordion put them at the bottom below the calendar selection" -
  `family-week-calendar-card.js`): wrapped the three loose Routines/Goals-
  on-Chores/Goals-on-Rewards fields in a new `<div class="field">` +
  `accordion-toggle`/`accordion-body#chores-rewards-body` pair titled
  "Chores, Rewards & Routines" - same generic `.accordion-toggle`
  click-wiring (`querySelectorAll(".accordion-toggle")`, keyed by
  `data-target`/`id`) every other General-tab section already uses, so no
  JS changes were needed beyond the markup move itself. Then moved
  Default view/Show hours of the day (timeline)/Timeline range out of
  their old bare-field spot (between Menu Blocks and the new
  Chores/Rewards/Routines accordion) into the END of `#calendars-body`
  (after the `+ Add calendar` button), leaving `Lock vertical scrolling`
  behind as a standalone bare field. All three moved fields keep their
  exact same class-based selectors (`.default-view-btn`/`.timeline-btn`/
  `.timeline-start-select`/`.timeline-end-select`), so `_wireModalTabs`-
  style delegated JS wiring needed zero changes either - purely a markup
  relocation. New coverage added to `test_routines_settings_toggle.js`
  (despite the name - this file already had General-tab-structure
  coverage from the accordion check, so both new checks landed there):
  the accordion exists/starts closed/contains all three toggles/opens on
  click, and the timeline fields now live inside `#calendars-body`,
  positioned after the calendar-selection list. Both verified via revert-
  and-confirm-fails.

  **Setup wizard rebuild** (user: "let's update the initial install
  prompts to ask which features do you want add users. set up chores for
  users. add calendars. do you want to set up reminders? if they do want
  to set up reminders, give an option to automatically create the to-do
  lists and Link them to the calendars currently, the automatic to-do
  list creation doesn't work unless we fix it, I don't remember"). Used
  `AskUserQuestion` to lock down two open design points before building:
  which four features the opening screen offers (Chores/Rewards/Routines/
  Goals, Grocy, Reminders & Meal Plan, Daily Digest), and how deep the
  new "chores setup" step goes (chose: toggles + per-member color/
  include-in-chores, not just toggles alone, and not a full starter-chore
  wizard either).

  **The bug, found and fixed first**: dispatched two research subagents
  against the real `home-assistant/core` GitHub source (not guessed from
  memory) to check `_create_local_todo_list`'s assumption that a newly
  auto-created Local To-do list's entity_id could be reliably predicted
  as `f"todo.{slugify(name)}"`. Confirmed genuinely broken: local_todo's
  own duplicate-name guard (`_async_abort_entries_match`) only checks
  against ITS OWN other lists, not a global `todo.*` entity_id collision
  with some other integration's entity - Home Assistant silently appends
  `_2`/`_3` in that case, which the old code never accounted for, so it
  could hand back an entity_id pointing at nothing (or the wrong thing).
  Also confirmed (second subagent, tracing `ConfigEntriesFlowManager`'s
  real source) that `hass.config_entries.flow.async_init(...)` fully
  awaits the new entry's setup - no detached/background task - so by the
  time it returns a create_entry result, it's safe to look the real
  entity_id up immediately via `entity_registry.async_get(hass)
  .async_get_entity_id("todo", "local_todo", entry.entry_id)` (local_todo
  sets that unique_id to the new config entry's own entry_id). Fixed
  `_create_local_todo_list` to do exactly that, falling back to the old
  slugify guess only if the registry lookup comes up empty. Required
  adding a missing `homeassistant.helpers.entity_registry` stub module to
  both `/tmp/hatest` and its `/tmp/fcrtest` mirror (this project's fake
  HA test harness never needed it before) - `async_get(hass)` there reads
  a test-controlled `hass._entity_registry` attribute, defaulting to an
  always-empty registry. New coverage in `test_config_flow.py`
  (`FakeConfigEntry`/`FakeEntityRegistry` fixtures): the registry path
  taking precedence when available, a fabricated collision scenario
  proving the fix actually resolves to the REAL (suffixed) entity id
  rather than the naive guess, and the slugify fallback still firing when
  the registry comes up empty or no `"result"` object is present at all
  (old flow-result shape) - all verified via revert-and-confirm-fails.

  **The wizard itself** (`config_flow.py`): `async_step_user` now goes to
  a new `async_step_features` first - a `SelectSelector(multiple=True)`
  checklist (`_FEATURE_CHORES`/`_FEATURE_GROCY`/`_FEATURE_REMINDERS`/
  `_FEATURE_DIGEST`, all checked by default so clicking straight through
  behaves exactly like the wizard always did) that decides both routing
  (`self._selected_features`, checked via `self._feature_selected(...)`
  at the top of `async_step_grocy`/`async_step_todo_lists`/
  `async_step_digest` - unchecked means that step's form is never shown
  at all, silently chaining straight to the next one) and whether
  `async_step_users` runs. `async_step_users` is the actual "add users"
  step - a `SelectSelector` of Home Assistant login accounts built by a
  new `_list_member_choices(hass)` helper that deliberately mirrors
  `__init__.py`'s existing `family_hub/list_users` websocket command
  (`_ws_list_users` - same id/name/system_generated filtering,
  `hass.auth.async_get_users()`), just callable a step earlier since no
  websocket connection (or config entry) exists yet. Real users don't
  exist as a selectable schema type in HA core - a second research
  subagent confirmed there's no `UserSelector`/`PersonSelector` in
  current `homeassistant/helpers/selector.py` at all, ruling that out
  before it got built. Picking members queues them into
  `self._member_setup_queue`, then `async_step_member_profile` shows ONE
  small screen per member (board color from `_PEOPLE_COLOR_PALETTE`,
  defaulting by cycling through it same as the dashboard-YAML generator
  already does per-calendar; Include in Chores & Rewards, default on) by
  re-invoking itself, popping the front of the queue each submission -
  deliberately one-at-a-time rather than one big dynamic form, since HA's
  translation strings are per FIELD NAME and can't cover an
  unbounded/variable set of member ids, but CAN cover a title/description
  with a member's name interpolated in via `description_placeholders`
  reused across iterations. Once the queue drains (including immediately,
  for zero members picked), `async_step_chores_features` asks the same
  three Routines/Goals-on-Chores/Goals-on-Rewards toggles Settings' new
  accordion has (see above), folds the accumulated `self._member_profiles`
  into `CONF_INITIAL_USER_PROFILES`, then continues into the pre-existing
  `async_step_calendars` chain unchanged.

  **The entry.options → runtime Settings handoff** - the actual hard part:
  Family Hub membership/profiles/Routines/Goals toggles all live in a
  Store-backed runtime "Settings" blob (`chores_websocket_api.py`'s
  `family_hub/set_settings`), which doesn't exist until the config entry
  itself does - config_flow runs BEFORE that, so it can only write into
  `entry.options` (via the existing `self._collected_options` /
  `async_step_finish` mechanism), never the Settings store directly. Five
  new transient `CONF_INITIAL_*` constants (`const.py`:
  `CONF_INITIAL_MEMBER_USER_IDS`/`CONF_INITIAL_USER_PROFILES`/
  `CONF_INITIAL_ROUTINES_ENABLED`/`CONF_INITIAL_GOALS_IN_CHORES`/
  `CONF_INITIAL_GOALS_IN_REWARDS`) carry the wizard's picks into
  `entry.options`, then a new `__init__.py` function,
  `_maybe_seed_settings_from_setup_wizard(hass, entry, settings_store)`,
  consumes them exactly once during `async_setup_entry` - guarded the
  same way `_maybe_migrate_member_user_ids` already guards itself
  (`if SETTINGS_KEY_MEMBER_USER_IDS in settings: return`), and
  deliberately called BEFORE that older function so a wizard-seeded
  household short-circuits its union-of-profiles-and-permissions backfill
  entirely (both share the guard) rather than the two fighting over the
  same key. `entry.options.get(CONF_INITIAL_MEMBER_USER_IDS) is None`
  (key entirely absent - an upgraded pre-wizard install, or Chores was
  unchecked on Features) is a deliberate no-op, distinct from an explicit
  empty list (Users step reached, nobody picked - still seeds
  `memberUserIds: []`, same "explicit empty is not never-set" rule
  `_maybe_migrate_member_user_ids`'s own tests already established).
  Leftover `CONF_INITIAL_*` keys are deliberately never stripped from
  `entry.options` afterward (harmless, never-read-again - same shape as
  the permanent `SETTINGS_KEY_NOTIFY_PROFILES_MIGRATED` marker already
  living in the Settings blob forever). New `test_setup_wizard_seed.py`
  (mirroring `test_member_user_ids_migration.py`'s own conventions
  closely - `FakeStore`/`FakeConfig`/`FakeHass`, `FakeEntry` new for
  `.options`): full seed from every field at once (including the seeded
  profile correctly merged onto `_default_user_profile()`'s full shape,
  not just the two wizard-collected fields), explicit-empty-still-seeds,
  no-op-when-absent, never-runs-twice-even-with-options-still-present,
  durable backup file written, and malformed (non-dict) per-member
  profile entries skipped rather than raised. Verified via revert-and-
  confirm-fails against the actual function body (not just the
  `async_setup_entry` call site, which - like
  `_maybe_migrate_member_user_ids` itself - isn't separately unit-tested
  here).

  **Test updates required by the routing change**: `test_config_flow.py`
  gained `FakeUser`/`FakeAuth` (mirroring `test_family_hub.py`'s own
  `_FakeUser`/`_FakeAuth`) and a `features=` kwarg on its `make_flow()`
  helper (`None` = every feature stays checked, so every PRE-EXISTING
  per-step test that calls a later step directly - never touching
  `async_step_features` - keeps exercising that step completely
  unrestricted, exactly as before); ~20 new tests cover the Features/
  Users/member-profile/chores-features steps individually, the full
  chain both with everything on and everything off, and each of
  Grocy/Reminders/Digest's own skip-when-unchecked behavior in isolation.
  `test_family_hub.py`'s own `config_flow_tests()` end-to-end walk
  (FakeFlowHass has no `.auth` at all, so `_list_member_choices` swallows
  that via its own defensive try/except and the Users step comes back
  with zero choices - same "leave it for later" shape as every other
  step left at its default) was extended with the three new steps in the
  middle rather than rewritten. Full regression sweep clean across every
  `test_*.py` file except the pre-existing, already-documented, unrelated
  `test_family_calendar_reminders.py` failure (a stale test for a
  pre-merge module that was never migrated into this repo - see this
  doc's own dedicated note on that, not something this session touched
  or should try to fix without asking first).

  Also updated: `strings.json`/`translations/en.json` (kept byte-
  identical, this project's own convention) gained `features`/`users`/
  `member_profile`/`chores_features` step entries and a lightly-reworded
  `calendars` step description (no longer "First:", since three steps
  can now precede it).

- **v137.1 (1.102.1)**: Live bug report right after v137 shipped, verbatim: "i ADDED A ROUTINE VIA THE MODAL BUT IT ISNT on my routine list." Checked HA's own system/error logs first (`ha_get_logs`, sources `system`/`error_log`, searched "routine"/"family_hub") - no server-side exceptions at all, so this wasn't a crash. Root cause found on code review instead: `_routineManagePaneHtml()`'s `.rm-person` `<select>` had no default-selection logic - it just fell back to whichever member `_memberUsers()` happened to list first, with nothing in the UI indicating which person/category the Add form was actually scoped to. Since the FAB is a single global "+" button (not per-person/per-column), it's entirely plausible to open it, type a title, hit Add, and have the item silently land on a different family member's board column than the one you were looking at - the item genuinely was created (confirmed: `ws_create_routine_item`/`routine_engine.create_item` had no bug, `_fetchRoutines` correctly re-pulled and re-rendered), it just wasn't where the user expected. Two-part fix in `family-hub-chores-card.js`: (1) new `_defaultRoutineManagePersonId(members)` defaults `.rm-person` to `this._myUserId()` (the signed-in HA user) when they're a Family Hub member, falling back to the first member only when the signed-in user isn't one (e.g. an admin adding on someone else's behalf) - this covers the overwhelmingly common case (someone adding a routine item for themselves) with zero extra clicks; (2) `_addRoutineManageItem` now writes a confirmation into `.rm-error` (styled green via a new `.rm-success` class, `--fc-accent2`) after a successful add, e.g. `Added "Pack backpack" for Kid • Morning Routine.` - so even when the defaults land somewhere unexpected, the user immediately sees where. Also added small `.rm-filter-label` "Person"/"Time of day" captions above the two selects for clarity, and clear the confirmation message when switching person/category filters (`_wireRoutineManagePane`'s `refresh`). New/updated coverage in `test_routines_card.js`: the old `.rm-person`/first-member assertion (which happened to pass either way since that fixture's signed-in user and first member were the same person) got its comment corrected for accuracy, plus a new dedicated block - one hass fixture with the signed-in user second in the member list (still defaults to them, not the first member), asserting both the default selection itself and the post-add confirmation text, and a second fixture where the signed-in user isn't a Family Hub member at all (falls back to the first member). Verified via this project's revert-and-confirm-fails-then-restore convention (temporarily reverted `_defaultRoutineManagePersonId` to always return the first member - the new test failed exactly as expected, then restored and re-confirmed passing). Full regression sweep clean (`test_routines_card.js` plus five other JS card test files, `test_routine_engine.py`/`test_chores_websocket_api.py` - 90 passed); no backend changes were needed this time, frontend-only fix.

- **v137 (1.102.0)**: Routines management overhaul, requested by the user directly ("I would like to make Routines a little more like Chores and Goals where the line item is a little more like a card. I also want to remove the add item line from the routine I would like to have a routine modal that you can manage the items, set due times, set days of week, etc. can we work that into the FAB").

  **Data model (`routine_engine.py`/`chores_websocket_api.py`)**: routine items gained two new optional fields - `due_time` ("HH:MM" 24-hour, validated by a new `_DUE_TIME_RE`-backed `_validate_due_time`) and `days_of_week` (a list of weekday ints, validated/deduped/sorted by `_validate_days_of_week`; empty/omitted means every day - the same default behavior the feature always had). Deliberately used Python's own `date.weekday()` convention (Monday=0..Sunday=6) rather than JS's `Date#getDay()` (Sunday=0..Saturday=6) or ISO-8601 - this happens to be the exact same convention `const.py`'s existing chore-recurrence `recur_weekdays`/the frontend's `WEEKDAY_LABELS` already use, so the frontend could reuse `WEEKDAY_LABELS` directly for routine day-of-week badges/toggles instead of needing a second parallel day-label constant, at the cost of the frontend needing a small `_jsDayToBackendDay` conversion helper anywhere it compares "today" against a stored days_of_week (`(jsDay + 6) % 7`). Added `routine_engine.update_item` (title/due_time/days_of_week - deliberately can't move an item to a different person/category, since the manage UI doesn't need that) and a new `family_hub/routines/update` websocket command, same `PERMISSION_ASSIGN` gate as create/delete (editing is exactly as privileged as adding/removing, unlike the no-permission-check checkbox toggle).

  **Board display (`family-hub-chores-card.js`)**: `_routineItemRowHtml` became `_routineItemCardHtml` - a `.routine-item-card` styled like `.goal-item` (surface2/card chip, icon-equivalent checkbox + body + actions) instead of a bare flex row, now showing a due-time badge (12-hour, e.g. "7:30 AM" via a new `_formatDueTime`, turning red/`.overdue` past that time if still unchecked via `_isRoutineItemOverdue`) and/or a days-of-week badge when set. The old always-visible `.routine-add-row` (input + button) under each accordion section is gone entirely, along with its Enter-to-submit keydown listener and `_addRoutineItem` - adding is now exclusively a Routine-tab-in-the-modal action (see below). Because items can now be day-restricted, `_routineItemsFor` (what the board actually renders/counts in its badges) filters to only items applying TODAY (`_routineItemAppliesToday`, using `_todayBackendWeekday`) - a Saturday-only item simply isn't on the board Monday-Friday. A parallel `_routineItemsForManage` deliberately does NOT day-filter, since the whole point of the management list is finding/editing an item regardless of which days it's scheduled for.

  **Routine tab (the FAB modal)**: `_openCreateModal` gained a third `data-tab="routine"` button (shown only when `_routinesEnabled()` - no extra permission gate needed on top of that since the FAB itself is already `_canAssign()`-gated, unlike the Rewards card's open-to-everyone Goal tab) and a `.routine-pane` built by `_routineManagePaneHtml()`: a person+category filter row, an always-visible add-item mini-form (title/time/day-toggle-chips), and an `.rm-list` of every item for that person+category (unfiltered by day). `_wireModalTabs` also hides the modal's own Save button while this tab is active, since every action in it (`_addRoutineManageItem`/`_saveRoutineManageItem`/`_deleteRoutineManageItem`) hits the server immediately rather than being gathered into one submit. Editing is inline, one row at a time (`_routineManageEditingId` tracks which, reset to null on every modal open, tab switch away, or person/category change) - `_routineManageItemHtml` renders either the read-only row or (when it's the item being edited) an inline form with its own day-toggle chips pre-checked from the item's current `days_of_week`, wired via one delegated click listener on `.routine-manage` itself (not `_onBoardClick`, which is bound to `.board` only, not the modal - matches this file's existing convention of wiring modal-specific interactions directly rather than trying to reuse the board's delegated handler). The pencil icon on a board item-card (`.routine-item-edit`) calls a new `_openRoutineManageModal(itemId)` that opens the FAB modal, clicks straight to the Routine tab, sets the person/category selects to that item's own, and pre-opens its inline edit form - a shortcut into the same manage UI rather than a separate edit flow.

  New/updated test coverage: `test_routine_engine.py` gained due_time/days_of_week validation coverage (valid + several invalid shapes each) and a full set of `update_item` tests (success, clearing both fields back to defaults, missing title, unknown id, bad due_time/days_of_week). `test_chores_websocket_api.py` gained `test_routines_update_requires_assign_permission` (forbidden for a non-permitted user with no side effect, success + persisted store save for an admin, not_found for an unknown id) and extended the existing create test to assert due_time/days_of_week actually round-trip through the websocket schema. `test_routines_card.js` was substantially rewritten: the old inline-add-row coverage is gone (replaced by Routine-tab coverage), added today-vs-not-today badge/board filtering (using a `todayBackendWeekday()` helper mirroring the frontend's own conversion, so the test is correct regardless of which real calendar day it happens to run on), due-time badge formatting, and full Routine-tab coverage (tab visibility gated on `routinesEnabled`, add/edit/cancel/delete, person/category switching resetting in-progress edits, and the board pencil icon jumping into a pre-scoped, pre-opened edit). Two of the day-filtering/edit-jump checks were deliberately verified against a reverted version of the underlying fix first (temporarily made `_routineItemAppliesToday` always return true, and separately no-opped the board's edit-pencil handler) to confirm each actually fails without its fix, following this project's established regression-test verification convention, before being accepted as real coverage.

- **v136 (1.101.0)**: Fast follow-up bug fix on the v135 emoji-picker accordion, reported directly by the user ("the emoji selector for rewards draws over the add and cancel buttons sometimes can we make the emoji picker accordians full modal width and move the add and cancel button to under them?"). Root cause: `.m-icon-grid` was `position: absolute` (a floating popover anchored under the `.m-icon-toggle` button, fixed at `width: 236px`), so it never took up document-flow space - opening a category grew the popover taller and it just floated over `.m-color-row`/`.modal-actions` below it instead of pushing them down. Fix is CSS-only: `.m-icon-grid` dropped `position: absolute`/`top`/`left`/`z-index`/the fixed `width: 236px` and its own `max-height`/`overflow-y: auto` scroll, replaced with `width: 100%; box-sizing: border-box;` in normal flow - since the DOM order was already `.m-icon-picker` → `.m-color-row` → `.modal-actions` (Add/Cancel), removing the absolute positioning was enough on its own to push everything below it down the page in the exact order the user asked for, no markup/JS changes needed. The inner scroll area was deliberately dropped rather than kept (which would have "fixed" the overlap a different way) since `.modal-box` itself already has `overflow-y: auto; max-height: 85vh`, and nesting a second scrollable region inside it felt like exactly the kind of clutter the accordion redesign was trying to get away from.

- **v135 (1.100.0)**: Reward-creation emoji picker cleanup, requested by the user directly ("the emoji box is pretty messy can we clean it up into an accordian and add some more emojis") off two screenshots of the old flat grid.

  **`family-hub-rewards-card.js`**: the old flat `REWARD_ICON_CHOICES` array (18 emojis) is now `REWARD_ICON_CATEGORIES`, an array of `{label, emojis}` objects covering six categories (Treats & Food, Screens & Games, Toys & Fun Stuff, Outings & Activities, Money & Prizes, Achievement & Fun; 14/10/10/11/5/8 emojis respectively, 58 total, verified zero duplicates via a standalone dedup script). `REWARD_ICON_CHOICES` is kept as a derived constant (`REWARD_ICON_CATEGORIES.reduce((all, cat) => all.concat(cat.emojis), [])`) so anything that still wants "just every choice" doesn't need its own flattening logic. The `.m-icon-picker` markup inside `_openCreateRewardModal` now renders one `.m-icon-category` block per category (a `.m-icon-cat-toggle` header with a label and chevron, plus a `.m-icon-cat-body` grid of `.m-icon-choice` buttons), toggled open/closed via an `.open` class - all categories start collapsed. This does NOT reuse the pre-existing `.accordion-toggle`/`.accordion-body`/`data-target` convention from `family-week-calendar-card.js` (that pattern is wired via a one-time `querySelectorAll` pass at modal-open time, which doesn't fit here since the icon-picker markup is rebuilt fresh via `innerHTML` on every modal open) - instead the rewards card's own existing delegated click handler (`_onClick(e)`) gained a `.m-icon-cat-toggle` branch (toggles `.open` on the closest `.m-icon-category`, returns) inserted right before the existing `.m-icon-choice` handling, keeping the same visual accordion vocabulary (chevron rotation, collapsed body) as elsewhere in the app without forcing an ill-fitting wiring mechanism. Pre-fill/edit-mode and submit logic were unaffected since both only read/write the toggle button's own `dataset.icon`, never the grid's internal structure.

  New coverage in `test_rewards_card.js` (appended after the existing icon-picker "clear button" check): categories start collapsed, clicking a category header toggles `.open` on/off, an emoji inside an expanded category can still be picked (closing the whole grid, same as before), and every category has at least one choice with a combined total > 18 (the pre-change flat count). One jsdom gotcha hit while writing it: a CSS attribute selector with an emoji value (`.m-icon-choice[data-icon="🍩"]`) silently returns `null` in jsdom even though the exact codepoint is genuinely present in the DOM - fixed (matching this file's own pre-existing convention for the pizza-emoji test) by switching to `Array.from(...).find(b => b.dataset.icon === "\u{1F369}")`. Confirmed passing (`ALL REWARDS CARD TESTS PASSED`) and clean across the full regression sweep (same 3 pre-existing unrelated failures as before, nothing new).

- **v134 (1.99.0)**: Two things - embedding Goals into Chores/Rewards, and a real screensaver idle-timer bug fix.

  **Goals embedding + tabs**: the user asked for Goals to "also be shown in Chores or Rewards (option enable-able in the settings)" and to be creatable "from the Chores FAB or the Rewards FAB, its a tab at the top of the modal." Two existing embedding precedents had to be chosen between - `choresShowRewardsColumn` (a header-button-toggled flat extra column) vs `routinesEnabled` (a Settings->General-tab toggle that embeds a PER-PERSON block into each Chores column). Since the user said "enable-able in the settings" (a genuine Settings toggle, not a card-header button) and goal data is inherently per-person (each goal has one `assigned_to`, like Routines, not a flat catalog like Rewards), the Routines pattern was mirrored: two new independent `const.py` flags, `SETTINGS_KEY_GOALS_IN_CHORES` (`goalsShowInChores`) and `SETTINGS_KEY_GOALS_IN_REWARDS` (`goalsShowInRewards`), both off by default, each with its own Settings -> General -> On/Off button pair in `family-week-calendar-card.js` (`.goals-in-chores-btn`/`.goals-in-rewards-btn`) - deliberately two separate flags rather than one combined switch, since a household might want goals on the Chores board (where the kids already look) without cluttering Rewards, or vice versa. `family-hub-chores-card.js` gained a per-person `.goals-block` (rendered right after the existing `.routines-block`, same "only render for a person who actually has one" rule Routines uses) with Log Progress/Approve/Send Back wired to the same `family_hub/goals/*` commands and `can_assign`/`can_verify`/`can_complete_any` permission tiers the standalone Goals card already uses; goals are fetched via `_fetchGoals()` only when `goalsShowInChores` is on, wired into the same first-load/poll cycle as chores. `family-hub-rewards-card.js` gained a flat Goals section (`.goals-title`/`.goals`) reusing the exact `.suggestion-row` CSS grid the Suggested Rewards bin already uses (`_goalRowHtml` needed its own `.suggestion-icon` div added to match that grid - caught by reading `_suggestionRowHtml`'s real markup before shipping a broken layout), same fetch-gated-by-toggle + same action wiring.

  **Modal tabs**: both cards' `+` (create) modal gained a `.modal-tabs` row (`.chore-pane`/`.goal-pane` for Chores; `.reward-pane`/`.goal-pane` for Rewards, with an extra `onSwitch` callback to relabel the Save button per-tab since "Create"/"Add"/"Submit for approval" differ there) - `box.dataset.activeTab` is the single source of truth the Save handler reads. Chores' `+` FAB is already gated by `can_assign`, so its Goal tab always shows; Rewards' `+` FAB is open to everyone (self-serve suggest workflow), so a new `_canAssignGoals()` (`can_assign` permission) gates the Goal tab there, and it's only shown for a brand-new item (never while editing an existing catalog reward - `showGoalTab = !isEdit && this._canAssignGoals()`), since `ws_create_goal` has no "suggest a goal" fallback the way reward suggestions do. The Chores card doesn't otherwise always have the Rewards catalog loaded (gated behind the separate `_showRewardsColumn()` toggle), so its Goal tab's reward-item picker does a lazy on-demand `_fetchRewardsState()` the first time the tab opens (`this._catalogLoadedForGoalForm` guard); the Rewards card needs no such trick since its own catalog is always loaded. `GOAL_STATUS_*` consts, `_wireModalTabs`, and the `_goalRewardFieldsHtml`/`_wireGoalRewardFields`/`_applyGoalRewardFieldsToPayload` trio are independently copy-pasted into both card files (and already existed in `family-hub-goals-card.js`) per this project's "independently-loaded Lovelace resources, not ES modules" convention. Covered by new Goals sections in `test_chores_card.js` and `test_rewards_card.js` (embedding visibility/permission-gating, tab wiring, submit routing to `family_hub/goals/create` vs the chore/reward path) and a new `test_goals_settings_toggle.js` (mirrors `test_routines_settings_toggle.js`'s coverage shape for the two new independent toggles - both off by default, independent on/off reflection when Settings reopens, both surviving a save, and `_normalizeSettings` round-tripping/defaulting each one separately).

  **Screensaver idle-timer poll-starvation bug** (found while answering an unrelated "why isn't the screensaver working" question - diagnosed via the live HA instance's actual `family_hub/get_settings`-backed settings, dashboard config, and person/user-id mapping, which ruled out a settings misconfiguration before the code itself was suspected): `_startPolling()` re-fetches settings every 60s on both `family-week-calendar-card.js` and the standalone `family-screensaver-card.js`, and `_fetchSettings()` on both used to call `_resetScreenSaverIdleTimer()` unconditionally at the end of every successful fetch - regardless of whether the screenSaver settings sub-object had actually changed. Since the poll always fires before any idle time above 60s can elapse (and the DEFAULT idle time is 180s), a genuinely idle card had its countdown clobbered and restarted from zero every single poll tick, so the screensaver could never actually reach `_showScreenSaver()` for almost any real household's configuration. Fixed with a new `_maybeResetScreenSaverIdleTimer()` wrapper (both files) that snapshots `JSON.stringify(screenSaver settings)` and only calls the real reset when that snapshot changed since the last check (or on the very first call) - a poll that finds nothing new leaves a real in-progress countdown alone; a genuine change (idle time, source, `disableWhileRecipeOpen`, or a login toggled) still rearms immediately with the fresh value. Direct interaction-driven resets (activity listeners, screensaver dismiss, recipe-view open/close) were deliberately left calling `_resetScreenSaverIdleTimer()` directly, unconditionally - those are real state-change events, not blind polls. New `test_screensaver_idle_poll_starvation.js` (full card) and a new section appended to `test_screensaver_card.js` (companion card) prove both that repeated no-op polls leave an already-armed timer's object identity untouched AND that a short countdown actually fires on schedule despite several no-op polls landing while it counts down (idleSeconds's 10s floor in `_normalizeSettings` meant the "actually fires" checks needed a direct `_settingsCache` assignment rather than going through `_normalizeSettings`, matching `test_screensaver_settings.js`'s own existing convention for real-timer tests) - both new tests were verified to actually fail against the pre-fix code (temporarily reverted, confirmed the exact regression, then restored) before being accepted as real regression coverage, not just tests that happen to pass.

  Full regression sweep: all Goals-embedding, tab, settings-toggle, and screensaver tests pass; same pre-existing documented failures reproduced (`test_reminder.js`, `test_servings_scaling.js`) plus `test_grocy_recipe_importer.js` timing out under the sweep's per-file timeout (unrelated code area, not touched this session - flagged rather than chased down, since nothing here shares any code path with it).

- **v133 (1.98.0)**: New feature - **Goals**, progress-tracked achievements a household attaches a reward to ("get 3 Bs in math," "practice piano 2 times"), as distinct from a Chore's "do this one concrete thing, on a schedule." Three `AskUserQuestion` answers shaped the design: progress logging is "kid self-reports, parent approves once" (mirrors the Chores open -> pending_verification -> approved gate exactly); the reward payout is "either, chosen per goal" (a goal picks stars OR one specific catalog reward at creation, never both); placement is "same page or separate" (resolved by building ONE standalone card rather than an embedded-in-Chores-board toggle, since a standalone card satisfies both answers - drop it on the same dashboard view as Chores, or its own view). New backend module `goal_engine.py` - a deliberately separate, lighter-weight sibling to `chore_engine.py`/`reward_engine.py` (same "separate self-contained module" precedent `routine_engine.py` already set for Routines): `create_goal`/`log_progress`/`approve_goal`/`reject_goal`/`update_goal`/`delete_goal`, `GoalError`, `default_goal`. A goal has `target_count`/`current_count` (default target 1, so a plain one-shot fact like "3 Bs" just works; "practice piano 2 times" sets target_count=2 and each practice session is its own `log_progress` call, appended to `log_history`) - Goals deliberately has NO assignment modes, rotation, Chore Bin, dependencies, sensor triggers, recurrence, overdue penalty, or due-date reminders; a household wanting any of that belongs back in Chores. Rejecting a goal resets BOTH `current_count` and `log_history` (unlike `reject_chore`, which only clears completion fields) - "send it back" for a counted goal means genuinely trying again, not silent partial credit. `reward_engine.py` gained `grant_item()` - hands a catalog item to someone without spending stars (reuses `redeem_item`'s exact redemption-record shape, `cost_stars` forced to 0, a `granted: True` marker), used by `approve_goal` for a `catalog_item`-reward goal; a since-deleted catalog item is logged and swallowed rather than blocking the approval. Goals' `family_hub/goals/*` websocket commands were added directly into the EXISTING `chores_websocket_api.py` (not a new file - see that file's own header comment: every feature area's websocket commands live in this one unified file, only the engines are split out; an initial plan to create `goals_websocket_api.py` was self-corrected before writing any code once this was actually re-read in full), reusing the exact same `PERMISSION_ASSIGN`/`PERMISSION_VERIFY`/`PERMISSION_COMPLETE_ANY` tiers and `_make_is_chores_eligible` assignee pool Chores already has - no new Permissions-tab checkboxes. New Settings profile flags `notifyGoalApproved`/`notifyGoalRejected` (default False, same "opt in to nothing" convention as every other notify flag), sent from `_notify_goal_approved`/`_notify_goal_rejected` in `chores_websocket_api.py`, same instant/synchronous shape as the chore approve/reject notify pair. New standalone card `family-hub-goals-card.js` - independently addable to any dashboard (deliberately NOT nested inside `family-hub-chores-card.js`), per-person board columns (same "outstanding goal keeps a non-member's column visible" fallback Chores already has), Create/Edit modals with a reward-type select that toggles between a star-value field and a catalog-item picker, Log Progress/Approve/Send Back/Edit/Delete actions gated by permission, and a "(reward no longer available)" fallback when a goal's `reward_item_id` points at a since-deleted catalog item. Deliberately omits the shared screensaver-controller integration (`window.__familyHubScreenSaver`) other cards have, as a documented scope reduction. Covered by new `test_goal_engine.py` (engine state-machine coverage, mirroring `test_chore_engine.py`'s structure), a new Goals section added into `test_chores_websocket_api.py` (permission-gating + notify-flag coverage, mirroring its existing Chores section - `make_hass()` there gained a `goals=`/`goals_store` kwarg), and new `test_goals_card.js` (board rendering, modal validation/payload construction, button wiring, permission-gated visibility). Full regression sweep: all Python/JS Goals tests pass; the same three pre-existing documented failures reproduced (`test_family_calendar_reminders.py`, `test_reminder.js`, `test_servings_scaling.js`), plus a newly-observed `test_reminders_feature.js` failure ("expected 2 rendered event blocks, got 3") in `family-week-calendar-card.js` - untouched this session and looks tied to the current wall-clock date rather than anything Goals-related; flagged here rather than silently ignored, but out of scope to chase down as part of this feature.
- **v132 (1.97.0)**: "on rewards page always justify the claim button to bottom" - a pure cosmetic fix, no backend touch. Both places a reward catalog item card renders got the same treatment: `family-hub-rewards-card.js`'s own `.catalog-item` (the main Rewards page) and `family-hub-chores-card.js`'s `.rewards-catalog-item` (the optional embedded Rewards column on the Chores board, which was already a flex column - only its button needed the change). Root cause: a catalog item's Claim button previously just flowed directly after whatever variable-height content sat above it (title that may wrap to 1-2 lines, an optional `value_note`, an optional "One-time"/"Stacks up" mode badge, an optional banked-amount line) - since CSS grid stretches every item in a row to the same height by default, neighboring cards already matched in overall height, but the button itself landed at a different vertical position in each one depending on how much sat above it. Fixed with the standard flexbox pattern: `.catalog-item` (rewards card) gained `display: flex; flex-direction: column;` (the chores-card equivalent already had this), and `.claim-btn`/`.rewards-claim-btn` both gained `margin-top: auto` - this absorbs all remaining vertical space above the button within its own flex column, pushing the button (and anything still after it, like the banked-mode Use button/claim-status line) flush to the card's bottom edge regardless of what's above. `.manage-edit-btn`/`.manage-delete-btn` (absolutely positioned in the corner) are unaffected since `position: absolute` removes them from flex flow. Verified via `test_rewards_card.js`/`test_chores_card.js` (both pass unchanged - this was styling-only, no markup/behavior change) plus a full JS regression sweep (same two pre-existing, already-documented, unrelated exclusions: `test_reminder.js`, `test_servings_scaling.js`); Python suite untouched since no backend file changed.
- **v131 (1.96.0)**: One message: "need to have a way to be able to make chores. send reminder notifications at the same intervals before the chore as the calendar supports" - interpreted as: chores need a due-date reminder feature offering the exact same lead-time-before options the calendar card's own event reminders already support (5/10/15/30/60/120/1440 minutes before), pushing at those intervals counting down to a chore's `due_date`. No AskUserQuestion needed this time - the targeting/opt-in shape was already strongly established by `notifyChoreApproved`/`notifyChoreRejected` (v123/v128), so it was followed directly. **New schema fields** (`const.py`): `CHORE_KEY_REMINDER_MINUTES` (`reminder_minutes` - a plain, editable per-chore field like `due_date`/`star_value`, set via the Create/Edit Chore modal's own "Remind me" checkboxes; empty list = no reminders configured) and `CHORE_KEY_REMINDERS_FIRED` (`reminders_fired` - internal bookkeeping, which of THIS occurrence's own `reminder_minutes` have already fired, mirroring `CHORE_KEY_OVERDUE_PENALTY_APPLIED`'s own "never re-fire, but reset for a fresh occurrence" pattern exactly). New profile flag `userProfiles[uid].notifyChoreDue` (default `false`, same "opt in to nothing" convention as every other instant-notification flag) gates delivery, sent only to the chore's own `assigned_to` (not a broadcast, unlike `notifyRewardClaimed` - a chore has exactly one responsible person). **`chore_engine.py`**: new `_normalize_reminder_minutes()` (dedups/sorts, accepts any positive integer - same "UI offers a fixed menu, backend doesn't gatekeep against it" relationship the calendar's own event-reminder minutes already have); `create_chore`/`update_chore`/`reset_recurring_chore` all wired to set/reset `reminder_minutes`/`reminders_fired` at the right lifecycle points - `reminders_fired` clears whenever `due_date` OR `reminder_minutes` itself changes (a new schedule deserves a fresh chance to fire, exactly like `overdue_penalty_applied`'s own reset) and on every new recurring cycle. **`chores_websocket_api.py`**: `reminder_minutes: [int]` added to both the create and update command schemas. **`__init__.py`**: new `_poll_chore_due_reminders()` sweep, wired into the existing `_poll()` closure alongside `sweep_overdue_chores`/`sweep_due_recurrences` - only ever considers a chore that's `open`, has a `due_date`, has a non-empty `reminder_minutes`, and has a real (non-Chore-Bin) assignee; each lead time fires independently and is tracked on the chore's own `reminders_fired` (not the generic `notified` dict the calendar-event reminders use, since chores have well-defined lifecycle reset points that dict-based dedup doesn't naturally follow); mirrors `_run_poll`'s own "never fires late for a missed window" rule - a lead time whose target moment has already passed by the time a poll tick notices it simply never fires, rather than firing after the deadline had already passed (which would be actively misleading, not helpful) - same reasoning that led to modeling this after calendar EVENT reminders rather than standalone TO-DO reminders (which always fire "late" once due). **Frontend**: `family-hub-chores-card.js` gained `CHORE_REMINDER_MINUTES_CHOICES` (a literal duplicate of the calendar card's own values, per this project's established "small consts duplicated across independently-loaded files" convention), `_remindFieldsHtml()`/`_wireRemindFields()` (a checkbox row shown/hidden based on whether the Due date field currently has a value - nothing to count down to otherwise) wired into both Create (`reminder_minutes` sent only when something's checked, matching how `due_date` itself is only sent when set on Create) and Edit (always sent explicitly, even as `[]`, matching how `due_date`/`notes` already work on Edit - `update_chore` only touches a field whose key is present at all, so omitting it would silently mean "leave alone" instead of "I cleared it"). `family-week-calendar-card.js` gained `notifyChoreDue` in `_defaultUserProfile()`/`_normalizeUserProfiles()`, a new "One of my chores is due soon" checkbox in the Notifications tab's existing Instant notifications block (mirroring `notifyChoreApproved`/`notifyChoreRejected` exactly), and a `_userProfileSummaryText()` bullet. New backend tests: 5 in `test_chore_engine.py` (normalize/default/edit/due-date-change-resets/recurring-reset), 2 in `test_chores_websocket_api.py` (create/update schema acceptance), a new `chore_due_reminder_tests()` section in `test_family_hub.py` (10 cases: eligible-lead-fires, no-resend-same-poll, later-poll-fires-remaining-lead, notifyChoreDue-off, no-due-date, no-reminder-minutes, unassigned/Chore-Bin, non-open-status, missed-window-marks-without-sending, all-targets-fail-leaves-for-retry) - one test-design correction along the way (an initial due=8-min-out fixture had BOTH configured leads already past their own moments, which is correct poller behavior, not a bug; redesigned around a due=20-min-out fixture plus a second call with `now` advanced 10 minutes to isolate each lead independently) and one `fh.CHORE_STATUS_PENDING_VERIFICATION`-doesn't-exist fix (that constant isn't imported into `__init__.py`'s own namespace - used the literal string instead). New frontend coverage: a Remind-me section in `test_chores_card.js` (visibility tied to due-date presence on Create, the same 7 choices as the calendar card, payload only-when-checked on Create vs. always-explicit on Edit, pre-fill from an existing chore's `reminder_minutes` on Edit, clearing everything still sends `[]`) and `notifyChoreDue` assertions folded into `test_countdown_list_and_digest.js`'s existing instant-notifications block (default-unchecked, writes its own draft field independent of the others, persists through the real save round-trip, appears in the row summary text). Full project test sweep after all of the above - all green (same three pre-existing, unrelated, already-documented exclusions: `test_reminder.js`, `test_servings_scaling.js`, `test_family_calendar_reminders.py`). `family-hub-repo/` was not present in this session (same gap noted, unresolved, in the v130 entry above) - only the flat `family_hub_v131.zip` was produced.
- **v130 (1.95.0)**: One message, two requests: (1) "setting a calendar as a user primary calendar doesn't seem to save. can you fix that" (bug report against the v125 primary-calendar feature); (2) "also add multi user Todo lists, other users can subscribe to individuals Todo lists in 3 ways, do not subscribe subscribe add to calendar and subscribe, add to calendar and alert. there should still be a family reminder as well. reminders default to the users color" (a new feature, scoped via AskUserQuestion: exactly those 3 subscription tiers, any subscriber - not just the alert tier - can also ADD to a list they're subscribed to, and the shared family list keeps its fixed purple - only individual lists use the owner's color). **(1) Primary-calendar save fix.** Extensive investigation (full round-trip save/reload simulation across two card instances sharing a mock backend store) could NOT reproduce the reported failure - the existing code path was already correct. Given the inability to reproduce, shipped the most defensible fix available: `_saveSettings()`'s `family_hub/set_settings` websocket call (the authoritative save) had a silently-swallowed `catch (e) {}` - ANY real failure (a dropped connection, a backend mismatch) looked EXACTLY like a successful save: modal closes, nothing shown, edit silently lost. Now that catch sets a visible `.settings-save-status.is-error` message and returns early, leaving the modal open with the user's edit intact, instead of calling `_closeSettings()`. New `.settings-save-status` element in the modal-actions row; the settings-populate function clears any stale status text left over from a previous open. Test: `test_notify_profile_calendars.js`'s `runSaveErrorTest()` (a second card instance whose `set_settings` mock throws - asserts the error class/text and that the modal stays open). **(2) Multi-user individual Reminders lists.** New data: `settings.people[i].remindersEntity` (optional `todo.*` entity, that person's own list, fully separate from the existing single `reminders_entity` family list) and `userProfiles[uid].remindersSubscriptions: {personCalendarEntity: "calendar"|"calendar_alert"}` (absent key = not subscribed). Ownership of an individual list is determined by reusing the EXISTING `primaryCalendar` field (v125) rather than inventing a new one - whichever profile has `primaryCalendar === person.entity` owns that list unconditionally (no subscription needed), same as the family list's own `remindersEnabled`-gates-notifications-only semantics. `const.py` gained `REMINDER_SUBSCRIPTION_CALENDAR`/`_CALENDAR_ALERT`/`_LEVELS` (frontend duplicates the two literal strings directly rather than importing, matching this project's established "small consts duplicated across independently-loaded files" convention). Backend (`__init__.py`): `_get_user_profiles` extended to extract `primaryCalendar` (a real pre-existing gap - it was never read into this function's output at all before now) and `remindersSubscriptions` (validated against the level enum, invalid entries dropped); new `_get_people(settings)` (defensive `[{entity, name, remindersEntity}]` extraction, mirrors `_get_user_profiles`'s own style); new `_targets_for_individual_reminders(profiles, person_entity)` = union of the owner's notify targets (gated by their own `remindersEnabled`) + every alert-tier subscriber's targets (NOT gated by their own `remindersEnabled` - the alert subscription itself is the opt-in; the plain "calendar" tier contributes zero notification targets, it only affects visibility). The reminders poller was generalized: `_poll_one_reminders_todo_list` (the original per-list fetch/dedupe/notify logic, now parameterized instead of hardcoded to the family entity) is called once for the family list and once per configured individual list from a new `_poll_reminders_todo` orchestrator (skips an individual list whose entity matches the family entity, to avoid double-polling/double-notifying); notification titles gain a `(List label)` suffix for individual-list items. `_build_daily_digest_message` extended with `people`/`profile_for_digest` params - the "due today" section now also folds in the recipient's own list plus every list they're subscribed to at EITHER tier (the digest is a visibility surface like the calendar grid, not an alert surface, so the plain tier counts here even though it grants no push notification) - both call sites (test-digest websocket handler, the scheduled digest loop) updated to pass both. Frontend (`family-week-calendar-card.js`, the only other file touched): a "Reminders list" text input added to each person row in the Calendars editor; `_defaultUserProfile`/`_normalizeUserProfiles` gained `remindersSubscriptions`; a new "Other people's reminder lists" field in the notify-profile modal with a per-other-person 3-button row (`_renderNotifyProfileRemindersLists`, wired into `_openNotifyProfileModal` AND into the existing primary-calendar star handler, since changing whose list is "mine" changes which list this same picker should exclude) - clicking a level writes/deletes the key in the profile's `remindersSubscriptions` draft. **A real bug caught and fixed while wiring this up**: `_getPeople()` (the function that turns `settings.people` into the `{entity, name, color, ...}` shape most of the card reads from) was NOT including `remindersEntity` in its returned object at all - since `_settingsPeopleDraft` (what both the Calendars editor's own field AND the new subscription picker actually read from) is reseeded via `JSON.parse(JSON.stringify(this._getPeople()))` every time Settings reopens, this silently dropped every person's configured Reminders-list entity on every reopen, breaking both surfaces. Fixed by adding `remindersEntity` to `_getPeople()`'s returned shape. `_fetchReminders()` rewritten to fetch the family list PLUS (for the logged-in user) their own individual list and everything they're subscribed to at either tier, each item tagged with `listEntity`/`color`/`personName` (color/personName null for the family list, so render call sites fall back to the fixed `REMINDER_COLOR`/"Reminder" label); `_markReminderDone` and the event-info popup's reminder Save/Mark-done handlers now target the item's own `listEntity` (via a new `detail.calendarEntity` on the reminder's event-info detail) instead of always the fixed family entity - marking an individual-list item done was previously guaranteed to silently no-op against the wrong to-do entity. Month/Week grid render sites use `r.color || REMINDER_COLOR` for the pill/detail color. New `_addableRemindersLists()` (same "which lists can I see" set as `_fetchReminders`, from the add-rights angle - any subscriber can add, not just the alert tier) powers a new "List" `<select>` on the Add Reminder tab (`_openAddEvent` populates it fresh each open; the missing-entity warning, refactored into `_refreshAddReminderMissingWarn()`, now tracks whichever list is currently selected rather than always the fixed family entity); `_saveAddReminder()` posts `todo.add_item` to the selected list. New test files: `test_reminders_subscription_picker.js` (picker renders only OTHER people's configured lists excluding the viewer's own, 3-way button wiring including delete-on-None, round-trips through save, and the primary-calendar-change-mid-edit sync case), `test_reminders_multilist_fetch.js` (multi-person fetch/merge/tag correctness, color/entity tagging on rendered event-info details, Mark-done routing to the correct list, unmapped-user and shared-entity-not-double-polled edge cases), `test_add_reminder_list_picker.js` (picker options including the plain "calendar" tier granting add rights per the explicit design choice, save targeting the selected list, per-selection missing-entity warning, unmapped-user fallback to family-only). Backend: `test_family_hub.py` gained `individual_reminders_lists_tests()` (a `MultiListFakeHass` fixture supporting distinct items per to-do entity, covering `_get_people`/`_targets_for_individual_reminders`/`_get_user_profiles`'s new fields/the full poller integration/dedup/no-lists/same-entity-as-family); new `test_individual_reminders_digest.py` (own-list/subscribed-list-either-tier/no-relationship/section-off/same-entity/missing-params-degrades-gracefully). Full project test sweep after both pieces (same standing exclusions as every prior sweep, plus one newly-confirmed-stale file this session: `test_family_calendar_reminders.py` fails with `ModuleNotFoundError: No module named 'family_calendar_reminders'` - that module doesn't exist anywhere in this folder, same pre-v99-merge staleness already flagged elsewhere in this doc, not a regression) - all green. #49 (the still-unreproduced notify-device-persistence report) remains the only other open item, still `pending`.
- **v129 (1.94.0)**: Three requests: (1) "right now we have calendars for each person, but some events may be for more than one person how can we be able to have a way to have multi person or family events where myltiple people do something and the card is a collage of those people's colors, like skylight calendar does it" (the primary piece, this version's main build); (2) mid-turn interrupt, "need a way to be able to edit rewards" (Add/Delete existed on the catalog, Edit didn't - the backend `update_catalog_item` command was already there, just never called from the frontend); (3) mid-turn interrupt, "settings need to be saved under a file not in the integraions folder this is the best way to prevent an update over writing the settings" - investigated and confirmed this concern was already fully satisfied by the existing architecture (every `Store(...)` writes to `<config>/.storage/`, durable backups live at `<config>/family_hub_backups/`, and the self-update zip installer only ever touches `custom_components/family_hub/` - none of it collides), explained this to the user via a plain message rather than changing any code. **(1) Multi-person calendar events.** Design settled via AskUserQuestion (tag people in Family Hub rather than duplicating the event onto every calendar; show in every involved person's own column; diagonal split-stripe collage, Skylight's own look) then adapted mid-build to the ACTUAL render architecture discovered by re-reading the code: Week/Month views are per-DAY (`_renderWeekGrid`/`_renderMonthGrid`, 7/42 iterations merging every person's events into one shared list per day, each event solid-colored by its owner) - only Planner view (`_renderPlannerGrid`) is genuinely per-person-column. So the literal "show in every involved person's own column" answer only applies to Planner; Week/Month instead render the event ONCE per day with a collage background instead of a solid one. An event still lives on exactly one real external calendar - Family Hub has no event storage of its own - "who else it's also for" is a lightweight new override store, `event_people_overrides`, mirroring the existing `reminder_overrides` mechanism exactly: same composite key (`_event_override_key`/`_eventOverrideKey` = `f"{calendar_entity}|{int(start_ts)}|{summary}"` / the JS equivalent), same per-entry `Store`, same "most calendar platforms only support create_event/get_items, you can't rewrite an existing event" reasoning for why this has to be a side-channel rather than an edit. Backend (`const.py`/`__init__.py`): `EVENT_PEOPLE_OVERRIDES_STORAGE_KEY_PREFIX`/`_VERSION`, `family_hub/get_event_people_overrides` (read the whole map) and `family_hub/set_event_people_override` (`calendar_entity`/`start`/`summary`/`people` - people list deduped+sorted, the event's own calendar stripped out even if sent, an EMPTY people list DELETES the key entirely rather than storing `[]`, unlike reminder overrides which do store `[]` - a deliberate difference since "tagged to nobody else" and "explicitly tagged to an empty set" are the same state here, whereas a reminder override's `[]` means "explicitly no reminders", a real distinct state). Frontend (`family-week-calendar-card.js`, the only file touched for this piece): `_fetchEventPeopleOverrides()` (proactive - called from `_refreshAllData()` every poll tick and once up front in `_initFirstLoad()`, unlike reminder overrides which only fetch when the popup opens, since every render pass now needs to know who's tagged) plus `_eventPeopleEntities(calendarEntity, start, summary, people)` (owner first, then known/still-on-roster extras from the override store, self-reference and removed people silently dropped) and `_eventCollageStyle(entities, people, colorMap)` (a plain `background:${color}` unchanged for 1 person; a `repeating-linear-gradient(135deg, ...)` with one 22px hard-edged band per color, cycling, for 2+). Both Week/Month's event-collection loops changed from iterating only the currently-filtered `eventPeople` to iterating ALL `people` unconditionally, with inclusion now decided by `peopleEntities.some((e) => filterEntitySet.has(e))` - fixes a real correctness gap the filter previously had (a multi-person event tagged to someone but physically owned by someone else's calendar would silently vanish when filtered to the tagged person, since the old loop only ever pulled events from each filtered-in person's OWN calendar). Planner view restructured into a per-day `dayPool` (built once over all `people`, each pooled event carrying its own `peopleEntities`/`bg`) that each visible column then filters itself against, so the same event legitimately renders once per involved column. Event-info popup gained an "Also for" row/section (`_renderEventInfoPeopleSection`/`_saveEventPeopleOverride`, gated off for reminders - there's no owning calendar to tag onto) - checkboxes for every OTHER person (never the event's own owner), pre-checked from the override store, each `change` immediately calls `set_event_people_override` with the full checked set. Tagging is popup-only, not available at event creation time - a deliberate scope call (not explicitly asked for either way): computing a start-timestamp key at creation time that's guaranteed to byte-match the same event's later re-fetched `detail.start` is fragile (especially for all-day events), whereas tagging after the event's already been fetched back through the same code path reminder overrides already use is fully robust; this tradeoff hasn't yet been surfaced to the user for a reaction. Two related render-invalidation bugs caught and fixed while building this: `_fetchEventPeopleOverrides()`/`_saveEventPeopleOverride()` must NEVER call `_renderGrid()` (it wipes+rebuilds `_eventDetails`, regenerating every event's synthetic id, which would invalidate an open popup's own `eventId` out from under it mid-session) - same discipline `_fetchReminderOverrides()` already established for the identical reason; the accepted tradeoff is the grid picks up fresh collage colors on its own next natural render (poll tick, week nav, popup close+reopen) rather than an immediate-but-unsafe one. New test file `test_multi_person_events.js` (3-person fixture, covers `_eventPeopleEntities`/`_eventCollageStyle` directly, Week view rendering a tagged event exactly once with the gradient vs. a solo event's unchanged plain background, the legend-filter fix surfacing a tagged-non-owner and hiding a fully-uninvolved filter, Planner view showing the same event in all 3 involved columns plus the filtered-to-one-person case, the popup's Also-for checkboxes/save round-trip, and a standalone reminder getting no Also-for section at all) - one test-authoring bug caught on first run (the override key seeded in the `_eventPeopleEntities`-direct test used a raw `1000` for `start` expecting seconds, but the function treats a raw number the same as `Date.getTime()` - i.e. ms - same as `_eventOverrideKey` does for a real Date; fixed the test's expected key, not the implementation, since the implementation's ms-consistency with `_eventOverrideKey` is what real call sites depend on). **(2) Edit rewards** (`family-hub-rewards-card.js`): a `.manage-edit-btn` pencil button beside the existing delete button on each catalog item, Manage-mode-gated same as delete; `_openCreateRewardModal(existingItem)` now takes an optional item - pre-fills every field (title/cost/value note/redeem mode incl. banked-fields visibility set directly rather than via a synthetic change event/stack amount+label/requires-fulfillment/icon/color, the color swatch's existing `data-touched` convention pre-marked `true` so its current value round-trips as intentional) and changes the heading/Save-button label/submit target (`family_hub/rewards/update_catalog_item` instead of `add_catalog_item`, sending every field currently in the form - "what's in the modal is what gets saved," not a diff against `update_catalog_item`'s own actual partial-update backend semantics). New tests in `test_rewards_card.js` (3 blocks: editing a plain item incl. round-tripping untouched fields, editing a banked item incl. banked-fields pre-visible with no change event needed, a non-admin never sees the Edit button) - all green, no regressions. Full project test sweep after both pieces (same standing exclusions as every prior sweep: `test_reminder.js`, `test_servings_scaling.js`, `test_family_calendar_reminders.py`) - all green, including the new `test_multi_person_events.js` and the new `event_people_override_websocket_tests()` block in `test_family_hub.py`. #49 (the still-unreproduced notify-device-persistence report) remains the only open item, still `pending`.
- **v128 (1.93.0)**: Four fresh, un-batched requests arriving in quick succession after v127 wrapped: (1) "what repro do you need" (my own question back to the user about the still-open #49 notify-device-persistence report - answered with 3 clarifying questions, still unanswered, #49 remains `pending`); (2) "need a a button for if you do not approve a task" (a Reject button for chore verification, parallel to Approve); (3) "need to have a way that you can click a user's name in the rewards area and see a complete history of points given and points taken away... we also need to add a way that rewards can be shown for a user... it can show that it's pending on an account and then I can mark it as done... the reward might be 2 hours of TV time and you can redeem that at any time"; (4), sent immediately after (3): "maybe you have the allowance example where you can redeem it multiple times and the amount of money grows over time or like the TV time... the time can stack... then the time can be reduced over time, let's say you have 3 hours of TV time and you want to use 1.5... rewards should also be able to be one time redeem so after it's redeemed it disappears" - (3)/(4) treated as one connected feature (a full rewards ledger + fulfillment + banking system), (2) built independently first since it's much smaller and unrelated. **(2) Reject a chore submission** (`chore_engine.py`): new `CHORE_KEY_REJECTED_BY`/`CHORE_KEY_REJECTED_AT`/`CHORE_KEY_REJECT_REASON` fields on every chore (added to `default_chore()`), and a new `reject_chore(chores, hass, chore_id, rejecter, reason=None)` sibling to `approve_chore` - validates `status == CHORE_STATUS_PENDING_VERIFICATION`, sends it back to `CHORE_STATUS_OPEN` for the SAME assignee (unlike `reset_recurring_chore`, which re-resolves assignment), clears `completed_by`/`completed_at` so the redo can re-complete, sets the three reject fields (reason stripped, empty→`None`) so they persist through the redo-and-resubmit cycle - `approve_chore` now clears all three back to `None` on a clean approval ("a clean approval has nothing left to explain"). New `family_hub/chores/reject` websocket command (`ws_reject_chore`, gated by the existing `PERMISSION_VERIFY`) and a matching native `family_hub.reject_chore` service (`SERVICE_REJECT_CHORE`, registered in `__init__.py`'s `_async_register_chore_services`, its own duplicated `_notify_chore_rejected_native` helper - same "duplicate small helpers across independently-loaded files" convention as every other native/websocket pair in this project, to avoid circular imports) plus a new `notifyChoreRejected` profile flag (sent only to the chore's own assignee, carries the reject reason in the body, mirrors `notifyChoreApproved` in all 5 of its usual spots in `family-week-calendar-card.js`: default profile object, normalize, summary text, Notifications-tab checkbox, checked-state load). Frontend (`family-hub-chores-card.js`): a `.chore-reject-btn` alongside the existing `.chore-approve-btn` on a `pending_verification` card, wired to a new `_reject(id)` that uses `window.prompt` for an optional reason (matches this project's own established "one value, no new modal" convention, e.g. the calendar card's template-naming prompts) and calls `family_hub/chores/reject`; a `.chore-rejected-badge` ("Sent back") shown on an `open` chore that still has `rejected_by` set, and a "Sent back" section in the chore detail modal showing who rejected it, when, and the reason. New tests: `test_chore_engine.py` (5), `test_chores_websocket_api.py` (3: permission gating + both notify branches), `test_chores_todo_and_services.py` (native service registration + end-to-end), `test_chores_card.js` (button visibility/click/reason-passthrough, non-permitted user sees no button, badge + detail-modal reason render) - all green. **(3)/(4) Rewards ledger, fulfillment, and "banked" (stacking) rewards**: `const.py` gained `REWARD_REDEEM_MODE_INSTANT`/`_BANKED`/`_ONE_TIME` (a catalog item's `redeem_mode`, default `instant` = today's plain one-off redemption unchanged) as ONE axis, and a separate orthogonal boolean `requires_fulfillment` (does the "spend" step need someone with pricing authority to mark it done before it counts, or is it self-serve) as the OTHER axis - deliberately kept independent rather than folding "needs approval" into the mode enum, since a banked TV-time reward might never need approval while a banked cash-allowance reward always does. Critically, for a BANKED item `requires_fulfillment` NEVER gates the earning/banking step itself (that's always instant/self-serve, same as today's plain redemption always was) - it only ever gates the later `use_bank` SPEND. `store.py`'s `default_rewards()` grew from 4 to 7 keys: `ledger` (every single `add_stars()` call, of any kind - chore approval, overdue penalty, redemption, reversal, manual adjustment - now appends `{id, user_id, delta, balance_after, reason, source, at}`, replacing the old explicit "a second parallel star-transaction log isn't needed yet" design note in `add_stars`'s docstring with the opposite conclusion now that the user asked for exactly that), `banks` (`{user_id: {item_id: amount}}`, a running balance, not a chronological list - only the current total matters), `bank_usages` (parallel to `redemptions` but for the SPEND side of a bank, via `use_bank`, same fulfillment-gating shape). `reward_engine.py` (the most-changed backend file): `add_catalog_item`/`update_catalog_item` gained `redeem_mode`/`requires_fulfillment`/`value_note` (a purely cosmetic free-text "what this is really worth" label like "$20" or "2 hrs" - confirmed via AskUserQuestion the household wanted a simple text field over a structured amount+unit type, and it's never parsed/calculated with anywhere, only displayed)/`stack_unit_amount`/`stack_unit_label`, validating mode membership and a positive stack amount when banked. `redeem_item` now always builds `requires_fulfillment`/`fulfilled`/`fulfilled_at`/`fulfilled_by` onto every redemption record; for `banked` mode it also calls a new shared `_adjust_bank(rewards, user_id, item_id, delta)` helper (rounds to 4 decimals, clamps near-zero to exactly 0 to avoid float noise on values like "1.5 hours") and stamps `bank_delta`/`unit_label`/`bank_balance_after` onto the redemption, forcing `fulfilled=True` for that banking step regardless of the item's `requires_fulfillment` flag (per the earn-vs-spend split above); for `one_time` mode it calls `delete_catalog_item` right after logging the redemption, so the item can't be claimed a second time by anyone. New `use_bank(rewards, user_id, item_id, amount)` spends part of a bank down (raises on insufficient balance), logging a `bank_usages` entry with the same fulfillment shape; new `mark_redemption_fulfilled`/`mark_bank_usage_fulfilled` flip a pending entry's `fulfilled` flag. `delete_catalog_item` deliberately does NOT touch any bank balance for that item (documented in its own docstring) - a bank intentionally OUTLIVES its catalog item, since stars/hours a person already banked shouldn't be trapped by an admin's later catalog cleanup; `use_bank` tolerates a missing item, falling back to a generic `"(removed reward)"` title and `requires_fulfillment=False` (nobody left with authority to gate it). `reverse_redemption` (an edge case not explicitly asked for but a real gap once banking existed) now also claws the credited amount back out of the bank via `_adjust_bank` when reversing a banked redemption, clamped to `min(bank_delta, current)` so it can never claw back more than is still actually banked, in case some was already spent via `use_bank` in the meantime. `approve_suggestion`'s signature grew the same 5 optional fields, all defaulting to the exact pre-v128 behavior so every existing call site/test kept working unchanged (the frontend's suggestion-approval UI was deliberately NOT extended with these fields - kept simple, scope-managed). `chores_websocket_api.py`: `ws_get_rewards_state` now always includes `banks`/`bank_usages` for every caller (same "visibility itself is never permission-gated" convention `suggestions` already established); `ws_add_catalog_item`/`ws_update_catalog_item` schemas extended with the 5 new optional fields; new `ws_mark_fulfilled`/`ws_mark_bank_usage_fulfilled` (both gated by the existing `_can_add_rewards`, same tier as suggestion approval); new `ws_use_bank` (self-serve for your OWN bank, `PERMISSION_REWARD_OVERRIDE` required to spend someone else's - mirrors `ws_redeem_reward`'s own self-serve-vs-override shape exactly rather than inventing a new authorization shape); new `ws_get_ledger` (any `user_id`, no permission gate at all, capped at 500 entries - same full-transparency convention as `balances`/`redemptions`/`suggestions`). Frontend (`family-hub-rewards-card.js`, the most-changed frontend file): `.balance-name` converted from a `<span>` to a `<button>` (class name deliberately kept identical, not renamed, to avoid breaking ~5 pre-existing test assertions that already query `.balance-name`) - clicking it opens a new Star History modal (`_openStarHistoryModal`/`_renderStarHistoryModal`/`_historyEventRow`) that fetches that person's full `get_ledger` result fresh on open and merges it chronologically with their own already-loaded `redemptions`/`bank_usages` into one common `{at, icon, label, detail}` shape, re-rendered on every poll tick while open. A banked catalog item's card now shows the CURRENT VIEWER's own bank amount (not everyone's - that's what the Star History modal is for) plus a `.catalog-use-bank-btn` once there's something to spend, wired to `_useBank` (a `window.prompt`, pre-filled with the full current balance so "use it all" is just Enter - matches the household's own "use 1.5 of my 3 hours" example). A new always-visible "Pending rewards" section (`.pending-title`/`.pending`, same always-visible-but-gated-actions shape as the Suggested Rewards bin) lists every `requires_fulfillment && !fulfilled` redemption/bank-usage, most-recent-first; a `.pending-mark-done-btn` renders only for someone `_canAddRewardsDirectly`. The Add-reward modal (canPrice branch only) gained a value-note text input, a redeem-mode `<select>` (Redeem any time / Stacks up / One-time - disappears after use), a conditional `.m-banked-fields` block (amount-per-redemption + unit label) that un-hides only when "Stacks up" is selected, and a "Needs a parent to mark it done" checkbox - `_submitCreateReward` sends all of these when `canPrice`, only sending `stack_unit_amount`/`stack_unit_label` when the mode is actually banked. New tests: `test_reward_engine.py` (16 new, covering the full v128 backend surface including the bank-survives-deleted-item and reverse-redemption-clawback edge cases), `test_chores_websocket_api.py` (6 new: permission gating on mark_fulfilled/use_bank self-vs-override/mark_bank_usage_fulfilled, get_ledger's open-to-anyone-but-scoped-by-user_id shape, get_state including banks/bank_usages), `test_rewards_card.js` (Star History modal open/fetch/merge/sort/close, banked item's bank display + conditional Use button + use_bank wiring, empty-bank shows no Use button, Pending section hidden-when-empty/visible-to-everyone/Mark-Done-gated-to-resolvers-only for both entry kinds and re-hides once everything's fulfilled, the extended Add-reward modal's redeem-mode select/conditional banked fields/value-note/requires-fulfillment checkbox all present only for someone who canPrice and all sent correctly on submit, including that switching back to instant sends no stack_unit_amount at all). One caught-early naming/CSS-collision near-miss during this build (not shipped): the Star History modal was initially drafted with `.history-modal`/`.history-box`/`.detail-header` class names before noticing (via grep) that `.history-row`/`.detail-header` etc. already mean something else elsewhere in this same file/its sibling card - renamed to the `.star-history-*` prefix before it caused any confusion, no test ever saw the wrong names. Full project test sweep after both pieces (same standing exclusions as every prior sweep: `test_reminder.js`, `test_servings_scaling.js`, `test_family_calendar_reminders.py`; `test_grocy_recipe_importer.js` again ran slow enough under a tight per-file timeout to look like a hang but passed cleanly given more time) - all green. #49 (the still-unreproduced notify-device-persistence report) remains the only open item, still `pending` awaiting the user's answer to the 3 clarifying questions asked this version.
- **v127 (1.92.0)**: Two fresh, un-batched requests that arrived after the v122 batch had fully wrapped up (all 14 items done except the still-`pending` #49): (1) "make the add chore button more in line with how the calendar works with a + button in the corner", then, mid-response, (2) "we should do the same with rewards and an add rewards modal open" followed immediately by (3) "also need a permission for add reward, if you do not have add capabilities you can still add rewards but they go into a suggestion bin and someone like a parent with add capabilities can approve and set star cost" - all three treated as one connected piece of work rather than three separate follow-ups, since (2)/(3) reshape what (1)'s equivalent button on the Rewards card actually needs to do. **(1) Chores: `+ Add Chore` text button → corner FAB.** `family-hub-chores-card.js`'s header `.add-btn` (a plain rectangular button, permission-gated to `_canAssign()`) removed entirely; a new `.add-chore-fab` added as a *sibling* of `<ha-card>` (not nested inside it - this card's own `<ha-card>` sets `overflow:hidden` to contain the board's scrolling, which traps any `position:fixed` descendant to the card's own box instead of the real viewport corner, a real bug already hit and fixed on `family-week-calendar-card.js`'s own `add-event-fab` - reused that exact fix here rather than rediscovering it), styled pixel-for-pixel identically to that same `add-event-fab` (56px circle, `right:18px; bottom:18px`, accent background, `+` glyph, matching shadow/tap-scale). Same permission gating as before (`style.display` toggled by `_canAssign()`), same click target (`_openCreateModal()`). **(2) Rewards: the old "Manage catalog" inline add-form → a `+` FAB opening a real modal.** This card had NO modal infrastructure at all before this version - the "Add reward" form (title/cost/icon-picker/color-swatch) used to live inline inside `.manage-panel`, shown only while an admin had "Manage catalog" toggled on. Added the exact same `.modal-overlay`/`.modal-box`/`.modal-actions`/`.cancel-btn`/`.save-btn`/`.form-error` CSS/markup shape `family-hub-chores-card.js` already uses for its own create/edit modals (copied, not shared - independently-loaded Lovelace resources), a `.add-reward-fab` sibling of `<ha-card>` (same overflow-trapping reason as the Chores FAB), and a new `_openCreateRewardModal()`/`_submitCreateReward()` pair. `.manage-panel` and its render block are gone entirely - "Manage catalog" now only ever gates the pre-existing per-item delete buttons on catalog items/history rows, nothing else. **(3) Rewards: a new `can_add_rewards` permission (const.py's `PERMISSION_REWARD_ADD`) splits "add straight to the catalog with a price" out of the much broader `can_override_rewards`** - same precedent as `PERMISSION_COMPLETE_ANY` splitting out of `can_verify` back in v121 (`CHORE_PERMISSIONS` now has 5 entries). `_can_add_rewards(entry_data, connection)` (`chores_websocket_api.py`) is `PERMISSION_REWARD_OVERRIDE OR PERMISSION_REWARD_ADD` (mirrors `ws_complete_chore`'s own `can_complete_for_others` OR-shape) - gates the existing `ws_add_catalog_item` (now accepts either permission, not override alone) plus two brand-new commands, `ws_approve_suggestion`/`ws_reject_suggestion`. **New suggestions bin** (`reward_engine.py`): `rewards["suggestions"]` (added to `default_rewards()`'s shape, store.py's merge-fill logic backfills it for older saves automatically) holds pending entries with NO `cost_stars` field at all (not even 0 - a submitter has no authority to price one) via new `add_suggestion`/`list_suggestions`/`_pop_suggestion`/`approve_suggestion`/`reject_suggestion` (mirrors `redemption`'s own `_pop_redemption`/`delete_redemption`/`reverse_redemption` shape exactly). `approve_suggestion` validates `cost_stars >= 0` **before** popping the suggestion off the list, so a bad request never destroys it; on success it calls the existing `add_catalog_item` internally (title/icon/color carried over from the suggestion unless the approver passes explicit overrides) and returns the new catalog item. A brand-new `family_hub/rewards/add_suggestion` command is deliberately open to ANY authenticated user with no permission check at all (`submitted_by` = the caller's own actor id) - this command IS the "you can't price it yourself" path; the frontend decides which of `add_catalog_item`/`add_suggestion` to call based on what it already knows about its own permissions, and the backend independently re-checks regardless of that client-side choice, same defense-in-depth every other gate here already follows. `ws_get_rewards_state` now always includes `"suggestions"` in its result for EVERY caller (visibility of the pending list itself was deliberately never permission-gated - only the approve/reject actions are - so a submitter can see their own suggestion is still pending). **Fixed a real latent gap found while building this**: every card's own `_hasPermission`/`_canAssign`-style gating only ever worked for a REAL admin, because `family_hub/permissions/get` (the endpoint `_fetchPermissions` called) is - correctly - strictly admin-only, and the old code only ever called it `if (this._isAdmin())`, meaning a permission actually GRANTED to a non-admin (e.g. `can_verify` for an older sibling, or this version's own new `can_add_rewards`) could never surface as usable UI on that non-admin's own card instance, even though the backend would have allowed the action all along. Fixed with a new `family_hub/permissions/get_mine` command (open to any authenticated user, returns ONLY the caller's own resolved `{permission: bool}` grants via the same `_has_permission` check every gated action already uses server-side - never other users' grants, so it can't be used to leak the Permissions store's contents to a non-admin) - `family-hub-chores-card.js`'s `_fetchPermissions`/`this._permissions` renamed to `_fetchMyPermissions`/`this._myPermissions` and now fetched unconditionally (every user, not just admins), and `family-hub-rewards-card.js` gained the identical pair from scratch (it had none before - this card only ever used `_isAdmin()`). The calendar card's own Permissions tab (`family-week-calendar-card.js`, admin-only management UI, untouched otherwise) gained one more `.perm-check` row for `can_add_rewards` - purely additive, the same generic `data-key`-driven checkbox-save wiring already handles it with no other JS change needed. New/updated tests: `test_reward_engine.py` (7 new suggestion-lifecycle tests, including the pop-before-validate ordering and icon/color override-vs-inherit); `test_chores_websocket_api.py` (11 new tests: `can_add_rewards` alone unlocks `add_catalog_item`, `add_suggestion` open to anyone/rejects a disconnected caller, `get_state` always includes suggestions, approve/reject both permission-gated and leave a forbidden attempt's suggestion untouched, `set_permissions` accepts `can_add_rewards`, and `get_my_permissions` proven to return an admin's every-permission-true / a granted non-admin's own true grant plus every other false / and critically that one non-admin's grant never leaks into another's result); `test_chores_permissions_settings_ui.js` (the new checkbox renders and saves); `test_chores_card.js` (`.add-btn`→`.add-chore-fab` rename throughout, plus a new `permissions/get_mine` mock branch added to both of this file's `makeHass` helpers); `test_rewards_card.js` had its entire "Manage catalog reveals the add-form" block rewritten for the FAB/modal flow, plus wholly new coverage for the priced-vs-suggestion branch, the Suggested Rewards section's always-visible-but-differently-gated rendering, approve/reject wiring, and a `can_add_rewards`-granted-non-admin getting the same unlocked experience as an admin. Full project sweep after all three pieces (same standing exclusions as every prior sweep, `test_grocy_recipe_importer.js` again ran slow enough under a tight per-file timeout to look like a hang but passed cleanly given more time) - all green.
- **v126 (1.91.0)**: The last unstarted item from the v122 batch, task #51 ("support all Home Assistant themes" - the user's own clarification: extend the EXISTING Global Theme picker under Settings > Theme Builder to ALSO list installed/native Home Assistant themes as selectable options, not auto-inherit the dashboard's active theme). Only #49 (still-unreproduced notify-device-persistence report, `pending`) remains open from the whole 14-item batch after this. Entirely frontend, entirely inside `family-week-calendar-card.js` - no backend/websocket changes at all, because of a discovery made while reading `family_hub/panel/theme-builder-panel.js`'s existing (unrelated) "This device's theme" picker: every card's own `hass` object already exposes every native/installed HA theme (native `themes.yaml`/HACS themes, AND any Theme Builder theme, since those auto-register back into HA via the backend's existing `_register_ha_themes`) directly as `hass.themes.themes` - no new websocket command was needed to read them, HA's frontend already hands this to every card for free. `_fetchGlobalThemes()` now concats the household's own custom Theme Builder themes (from the existing `theme_builder/list` call, unchanged) with a new `_nativeHaThemeEntries()` list before assigning `this._globalThemes` - kept as ONE flat list (not two separately-tracked arrays) specifically so `_resolveTheme()` and `_populateGlobalThemeSelect()` need zero changes to their own lookup logic to treat a native entry exactly like a custom one; each native entry is shaped identically to a Theme Builder theme (`{id, name, colors, fonts, effects: null, background: null}`) plus one extra `native: true` flag used only for cosmetic grouping in the dropdown. `_nativeHaThemeEntries()` always includes a synthesized `"Default (Home Assistant)"` entry first (id `ha:__default__` - HA's own base look has no actual named entry in `hass.themes.themes`, so this is built from a live `getComputedStyle(document.documentElement)` snapshot via new `_haDefaultCssVars()`, degrading to `{}`/all-defaults in any environment without a real stylesheet cascade, e.g. the jsdom test harness), then one entry per name in `hass.themes.themes` via new `_haThemeCssVars(name)` (a duplicated, not shared, copy of `theme-builder-panel.js`'s own `_resolveDeviceThemeVars` - merges in that theme's `modes.light`/`modes.dark` block per `hass.themes.darkMode`, same reasoning as every other cross-file duplication in this project) - filtering out any name already starting with `"Theme Builder - "` (the exact prefix `__init__.py`'s `HA_THEME_PREFIX`/`_register_ha_themes` uses when writing Family Hub's own themes into that same registry, mirrored here as a new `HA_THEME_PREFIX_MARKER` const so a household's own Theme Builder themes never show up twice under two different names). New `_haVarsToBuilderColors(vars)` is the reverse of `__init__.py`'s existing `_theme_to_ha_vars` (primary-color→accent, text-primary-color→accentText, primary-background-color→bg, secondary-background-color→surfaceAlt (also reused for surface2, which has no native HA equivalent), card-background-color→card (falling back to ha-card-background), primary-text-color→text, secondary-text-color→textSecondary, divider-color→border, accent-color→accent2 (falling back to primary-color/accent when absent), warning-color→accent3) - deliberately does NO hex validation of its own, since `_resolveTheme` already validates every color key with the same `/^#[0-9a-fA-F]{6}$/` regex and silently falls back to the default theme's own value per-key for anything invalid (a native theme's vars are often `var()` references, `rgb()`, 3-digit hex, or named colors - all safely degrade key-by-key rather than rejecting the whole theme). Fonts for every native entry just reuse `_defaultTheme().fonts` verbatim - HA's own theme system has no per-element font-size concept to map from, matching the exact same limitation `_theme_to_ha_vars` already documents in the other direction. `_populateGlobalThemeSelect()` now renders two `<optgroup>`s ("Theme Builder" / "Home Assistant") when both a custom and a native theme are present, falling back to one flat `<select>` list otherwise (e.g. a household with zero custom Theme Builder themes yet still sees a clean single list, not an empty "Theme Builder" group) - purely a label grouping for clarity about which entries are editable in the Theme Builder panel itself vs. just being read from HA, `<option value>`s and `_resolveTheme` lookups are unaffected either way. Confirmed via reading `theme-selector-card.js` (the standalone "Theme Selector" dashboard card) that it already reads `hass.themes.themes` directly on its own and needed no changes - this task was specifically scoped to the Global Theme picker inside Family Hub's own Settings modal, a separate surface. New test file `test_global_theme_native_themes.js`: `_haVarsToBuilderColors` field-by-field mapping plus its two fallback cases (accent2→primary-color, card→ha-card-background); `_haThemeCssVars` reading a named theme and correctly merging light vs. dark mode vars per `hass.themes.darkMode`, returning `{}` for an unknown name; `_nativeHaThemeEntries` always leading with the synthesized default, one entry per native theme, every entry flagged `native: true`, and Theme Builder's own auto-registered `"Theme Builder - X"` entries correctly filtered back out; `_fetchGlobalThemes` merging custom + native into one list; `_populateGlobalThemeSelect` rendering both optgroups with correct labels and preselecting a currently-saved native theme id; and `_resolveTheme` successfully resolving a native theme id exactly like a custom one, including per-key degrade-to-default for any color the native theme didn't set. Full project test sweep after (same standing exclusions as every prior sweep: `test_reminder.js`, `test_servings_scaling.js`, `test_reminders_feature.js`, `test_family_calendar_reminders.py`) - all green, including the two pre-existing Theme Builder test files (`test_theme_builder_panel.js`, `test_theme_selector_card.js`), neither of which touches anything this change modified. Only #49 remains open from the original v122 batch - the still-unreproduced notify-device-persistence report, intentionally left `pending` awaiting a more specific repro from the user rather than guessed at.
- **v125 (1.90.0)**: The last two items from the v122 batch (#46 per-user primary calendar, #47 card-style calendar picker), leaving only #51 (Theme Builder listing installed HA themes) and #49 (still-unreproduced notify-device-persistence report, `pending`, awaiting the user's repro) open from that whole 14-item batch. Both changes live entirely in `family-week-calendar-card.js` - no backend touched, since (like `userProfiles[id].color` itself) this is purely cosmetic data with no Python-side consumer. **`userProfiles[uid].primaryCalendar`** (new string field, default `""` = none set, an entity id from `settings.people`): `_defaultUserProfile()`/`_normalizeUserProfiles()` gained it (a non-string value degrades to `""`, same fail-safe convention as every other profile field - no uniqueness/entity-existence validation, since a stale reference to a since-removed calendar just harmlessly matches nothing at render time). New `_primaryCalendarColorByEntity()` builds a one-shot `{entity: color}` map by scanning every profile for a set `primaryCalendar` + a set `color` (last-writer-wins if two profiles somehow point at the same calendar - not guarded against, not worth it); `_getPeople()` (the function that turns `settings.people`/`this._config.people` into the `{entity, name, color, ...}` shape every event-rendering function reads `.color` from) now consults this map FIRST, before falling back to the calendar's own configured color or the default palette - importantly, applied in BOTH of `_getPeople()`'s branches (the normal `settings.people` path AND the static-Lovelace-config fallback path used by any household that's never opened Settings' own Calendars editor), a gap caught and fixed during test-writing (the first pass only patched the `settings.people` branch, and a test using the config-only fallback path silently got the calendar's own color instead of the override). **Card-style calendar picker**: `_renderNotifyProfileCalendars(userId)` (Users tab profile editor - Calendars field) rewritten from a plain checkbox+label row per calendar to a clickable `.notify-profile-calendar-card` (colored swatch dot using `--cal-card-color`, calendar name, and a separate `.notify-profile-calendar-primary-btn` star) - tapping the card body toggles `subscribedCalendars` exactly like the old checkbox did (`.selected` class mirrors "checked"), tapping the star (its own click handler, `stopPropagation()`'d so it never also toggles the subscription) sets/clears `primaryCalendar` - setting a new one implicitly clears whichever calendar was previously primary for that same person, since it's a single string field not a list. `.is-primary`/`.selected` CSS classes give each state its own visual treatment (a `color-mix()`-based tinted background for selected, degrading gracefully to a plain `--fc-surface-alt` fallback on older WebViews where `color-mix()` isn't supported - the whole declaration is dropped at parse time on an unsupported browser, not just the value, so the earlier plain-background rule right above it is what actually shows there). Discovered mid-implementation that this file (unlike `family-hub-chores-card.js`/`family-hub-rewards-card.js`) has NO `_esc()`/HTML-escaping helper anywhere at all - every existing calendar/person name interpolation in this ~10,000-line file is unescaped by long-standing convention - so the new card's name span matches that existing (unescaped) convention rather than introducing a one-off inconsistency by inventing an escape call that doesn't exist as a method. New standalone test file `test_notify_profile_calendars.js` (cards render instead of checkboxes and the old classes are gone; tapping a card toggles subscription; tapping a star sets primary without also subscribing; tapping a different star moves primary rather than allowing two; tapping the same star again clears it; the change persists through the real `_saveSettings()`/`family_hub/set_settings` round trip; `_getPeople()` returns the primary-setter's own color for their chosen calendar and leaves every other calendar's own color alone; a primary-setter with no custom color set falls back to the calendar's own color rather than some blank/broken value; `_normalizeUserProfiles` degrades a malformed `primaryCalendar` to `""`). Also fixed `test_reminders_feature.js` (a known pre-existing "excluded from the regression sweep" flake for unrelated real-clock-dependent reasons) since it referenced the now-deleted checkbox classes directly - not a flake fix, a real regression from this change that happened to live in an already-excluded file, fixed anyway since leaving genuinely broken test code around (even in an excluded file) would bite the next person who un-excludes it. Full project test sweep after both pieces - all green, including `test_reminders_feature.js` itself this run (its own docstring's "only near UTC midnight" caveat still stands as a separate, unrelated pre-existing risk, not something this change touches).
- **v124 (1.89.0)**: Continuing the same v122 batch after the user's blanket "keep working on those tasks" - this pass did tasks #54/#55 (reward icon/color picker), #56 (reward-claimed notification), #58 (chore-approved notification), and #57 (admin clear/reverse redemptions), in that order (the two catalog-item cosmetic fields first since they're edited in the same Add form, then the two new instant-notification settings since they share the same profile-flag/send-loop shape, then the redemption-history admin actions last since they're independent of everything else in the batch). (1) **Reward catalog icon/color picker**: backend (`reward_engine.py`) already had `add_catalog_item`/`update_catalog_item` accept `icon`/`color` from an earlier part of this same session (a `_normalize_hex_color` helper - `re.fullmatch(r"#[0-9a-fA-F]{6}", value)`, degrading anything malformed to `""` same as every other stored color in this project) and `chores_websocket_api.py`'s two catalog-item websocket schemas already had `vol.Optional("color"): str` added - this pass was almost entirely frontend. Confirmed via `grep -rn "update_catalog_item" family_hub/card/*.js` that no frontend code called the update command at all (only Add + Delete existed), so scoped this to the Add form only rather than also building a full edit-existing-item UI - consistent with the product's existing Add/Delete-only capability, not something the user asked for. `family-hub-rewards-card.js` gained a `REWARD_ICON_CHOICES` array (18 reward-flavored emoji - gift, ice cream, popcorn, movie, game, pizza, teddy bear, phone, palette, star, trophy, donut, bike, money, ticket, bed, cupcake, headphones - deliberately NOT a general emoji keyboard, matching the "Emoji picker" AskUserQuestion answer from earlier in this session), a self-contained `.m-icon-picker` toggle-button-plus-grid popover (no external library) and a `.m-color` `<input type="color">` + "Use default" reset button, both added to the Add-item form in the manage panel. The color swatch uses a `data-touched` attribute (set on its own `input` event listener, reset by "Use default") so an admin who never touches the swatch sends `color: ""` on Add rather than the browser's own default black - same "untouched means no opinion" idea as the icon toggle defaulting to `""` until a grid emoji is actually picked. New `_catalogAccentStyle(item)` (`family-hub-rewards-card.js`) / `_rewardsCatalogAccentStyle(item)` (the mirrored read-only version in `family-hub-chores-card.js`'s embedded Rewards column) render a valid item color as an inline `border`/`background` accent on `.catalog-item`/`.rewards-catalog-item`, falling back to no inline style at all for anything malformed or unset - both re-validate the hex format client-side (`/^#[0-9a-fA-F]{6}$/`) rather than trusting the backend's own validation blindly. New tests: `test_rewards_card.js` (icon grid opens/closes/selects/clears, color swatch touched-tracking and Use-default reset, Add sends `icon`/`color` only when actually set, catalog-item accent style renders for a valid color and falls back cleanly for a malformed/missing one) and `test_chores_card.js` (the embedded read-only Rewards column shows the same accent). (2) **Two new instant, non-digest notification settings** (`notifyRewardClaimed`/`notifyChoreApproved`, both new boolean fields on `settings.userProfiles[uid]`, default `false`, documented at length in `const.py`'s own `SETTINGS_KEY_USER_PROFILES` docstring): unlike every other notification in this project these are NOT digest-batched and NOT gated by `digestEnabled` - they fire the moment the underlying event happens. `notifyRewardClaimed` is deliberately household-wide (sent to EVERY profile that's opted in, not just an admin and not scoped to "my own claims") since the real use case is a parent wanting to know the instant ANY reward gets claimed, not just their own; `notifyChoreApproved` is scoped the opposite way, sent ONLY to the chore's own assignee, never anyone else, as the "yes, you're all set, stars disbursed" confirmation. Backend send logic lives at the call sites, not inside `reward_engine.py`/`chore_engine.py` themselves (both modules deliberately stay hass-free per their own docstrings, same reasoning `send_nudge` already established) - `chores_websocket_api.py` gained `_notify_reward_claimed`/`_notify_chore_approved` (called from `ws_redeem_reward`/`ws_approve_chore` respectively, after their saves) plus shared helpers `_send_instant_notification`/`_user_display_name`/a local `_notification_click_data` copy (this file stays import-independent of `__init__.py` on purpose, same reasoning documented at the top of the file for `_split_notify_target`'s own local copy). Approval can ALSO happen via the native `family_hub.approve_chore` service (automations/voice assistants) - `__init__.py`'s `_handle_approve_chore` closure gained a call to a new `_notify_chore_approved_native`, a deliberately duplicated (not shared/imported) version of the websocket-side function, for the same circular-import reason. Frontend: `family-week-calendar-card.js`'s `_defaultUserProfile()`/`_normalizeUserProfiles()` gained both new fields, and the Notifications tab's per-person profile modal gained a new "Instant notifications" field block (two checkboxes, `.notify-profile-reward-claimed-check`/`.notify-profile-chore-approved-check`) between Reminders and Daily Digest, wired the same way as the existing digest-section checkboxes; `_userProfileSummaryText` also gained "Reward-claimed alerts on"/"Chore-approved alerts on" tags so an admin can see who's opted into what from the profile list without opening each one. New backend tests: `test_chores_websocket_api.py` gained a `FakeAuth`/`FakeServices`-recording upgrade to `make_hass()` (previously `hass.services.async_call` was a bare no-op with no way to assert against it) plus 4 new tests (reward-claimed sent to every opted-in profile including the claimer, no-op when nobody's opted in, chore-approved sent only to the assignee even when someone else also opted in, no-op when the assignee hasn't); `test_family_hub.py` gained `chore_approved_notify_tests()` covering the native-service path's own duplicated function directly (opted-in send, not-opted-in no-op, no-assignee no-crash). New frontend test: `test_countdown_list_and_digest.js`'s existing Notifications-tab test block extended to cover both new checkboxes (default unchecked, independent of each other, saved through `_saveSettings`, reflected in the row summary). (3) **Admin clear/reverse redemptions**: `reward_engine.py` gained `delete_redemption` (removes a history entry, balance untouched - for tidying up a duplicate/already-handled entry) and `reverse_redemption` (removes the entry AND refunds `cost_stars` back to whoever claimed it via the same `add_stars` every other star adjustment uses - for undoing a mistaken claim entirely), both built on a shared `_pop_redemption` lookup-and-remove helper, both raising `RewardError("not_found")` on an unknown id. New `family_hub/rewards/delete_redemption`/`family_hub/rewards/reverse_redemption` websocket commands in `chores_websocket_api.py`, both gated by `PERMISSION_REWARD_OVERRIDE` (same permission catalog management already needs) and registered in `ALL_COMMANDS`. Frontend: `family-hub-rewards-card.js`'s `_historyRowHtml` gained a 5th grid column (`.history-actions`) shown ONLY while `_manageOpen && _isAdmin()` - a reverse button (&#8634;, "delete and refund") and a clear button (&times;, "delete without refunding"), wired in `_onClick` to new `_deleteRedemption`/`_reverseRedemption` methods that call the two new commands and re-fetch state. New tests: `test_reward_engine.py` (delete leaves balance untouched, reverse refunds and returns `new_balance`, both raise `not_found` on a repeat call against an already-removed id), `test_chores_websocket_api.py` (permission gating for both commands, delete leaves the balance alone, reverse refunds and echoes `new_balance`), `test_rewards_card.js` (clear/reverse buttons only render while managing as admin, both wired to their own websocket calls). Full project test sweep after all four pieces (same standing exclusions as every prior sweep: `test_reminder.js`, `test_servings_scaling.js`, `test_reminders_feature.js`, `test_family_calendar_reminders.py`; `test_grocy_recipe_importer.js` ran slow enough under a tight per-file timeout to look like a hang but passed cleanly given more time - not a real failure) - all green. Still open from the v122 batch: #46/#47 (per-user primary calendar + card-style calendar picker), #51 (Theme Builder listing installed HA themes), #49 (the still-unreproduced notify-device-persistence report from v122, left `pending` awaiting a more specific repro from the user).
- **v123 (1.88.0)**: Continuing the same v122 batch (14 requests, see that entry for the full original list and the AskUserQuestion answers that shaped scope) - the user said "keep working on those tasks" so this pass did four more in one sitting: task #45 (chore detail modal + Notes), #53 (mobile vertical scroll), #52 (Waiting to Recur collapsible), in that order (bugs/quick-wins first per the earlier answer, then the largest well-scoped item that was ready to build against the answered clarifying questions). (1) **Chore detail modal + a new `notes` field** (chore_engine.py): added `"notes": ""` to `default_chore()`'s schema, a `notes` branch in both `create_chore` (trimmed, defaults empty) and `update_chore` (added to `_EDITABLE_FIELDS`, same trim-on-write, clearable back to `""`) - deliberately unvalidated/uninterpreted by the engine itself (unlike e.g. `dependencies`), purely informational. `chores_websocket_api.py`'s `ws_create_chore`/`ws_update_chore` voluptuous schemas both needed `vol.Optional("notes"): str` added explicitly (same "every key must be spelled out" rule as `can_complete_any` in v121). Frontend (`family-hub-chores-card.js`): a `<textarea class="f-notes">` added to both Create and Edit modals (Edit's pre-fills from `chore.notes`, sent trimmed either way; Edit always sends the key even when empty, matching the existing due_date "always explicit so clearing it actually clears it" convention); `.modal-box textarea` added to the shared input-styling CSS rule (previously only covered `input`/`select` - textareas would have rendered unstyled). The bigger piece: `.chore-card`'s base cursor changed from `grab` to `pointer` (every card is now clickable, not just draggable-when-open-and-assignable ones) and a new fallback case added to the very end of the existing `_onBoardClick` delegated handler - `const choreCard = e.target.closest(".chore-card"); if (choreCard) return this._openChoreDetailModal(...)` - placed after every action-button `if` so a click on Done/Nudge/Approve/Claim/Edit still only fires that one action (each of those returns early), never also opening the detail view. New `_openChoreDetailModal(choreId)`/`_statusLabel(chore)` build a read-only view (assignee name+color dot via the existing `_userName`/`_userColor`, star value, due date, overdue penalty, streak, `_recurDescriptionHtml` reused verbatim for the recurrence line, unmet-dependency chips resolved by id against `this._chores`, and the notes block itself with an explicit empty-state message/class when blank) into a third modal overlay (`.detail-modal`, added alongside the pre-existing `.create-modal`/`.edit-modal` in `_build()`'s innerHTML - automatically covered by the same generic `.modal-overlay` backdrop-click-closes wiring, no new plumbing needed there) with an Edit button (shown only under the exact same `status === "open" && this._canAssign()` gate the board's own pencil icon already uses) that closes the detail view and opens the real Edit modal via the existing `_openEditModal`. New tests: `test_chore_engine.py` (`notes` trimmed/defaulted on create, edited/cleared/left-alone-when-omitted on update), `test_chores_websocket_api.py` (schema accepts `notes`, round-trips create→update over the real websocket handlers), `test_chores_card.js` (clicking a card opens the modal with the right title/notes/stats/empty-state, clicking a button instead still only fires that action and does NOT also open the modal, the modal's Edit button hands off to the real Edit modal pre-filled, Create sends `notes` in its payload). (2) **Mobile vertical scroll**: `.board`'s CSS was a plain horizontally-scrolling flex row (`overflow-x: auto; overflow-y: hidden`) with no responsive behavior at all - fine wide, bad narrow (sideways scroll to see past the first column, each column's own internal vertical scroll fighting the page's). Added one `@media (max-width: 700px)` block - the exact breakpoint `family-week-calendar-card.js` already uses for its own mobile layout, kept consistent rather than inventing a new one - that flips `.board` to `flex-direction: column` with the scroll axis swapped (`overflow-x: hidden; overflow-y: auto`), resets `.chore-column`/`.rewards-column` to full-width/auto-height (`flex: 0 0 auto; min-width: 0; width: 100%`), and un-scrolls each column's own body (`.chore-col-body`/`.waiting-recur-col-body` → `overflow-y: visible`) so the WHOLE board is one vertical list rather than a stack of independently-scrolling panes. New regression-guard test in `test_chores_card.js`: a plain source-text regex match on the media-query block confirming it sets `flex-direction: column`/`overflow-y: auto` on `.board` (not a rendered-layout assertion - jsdom doesn't evaluate `@media` for computed style, same limitation already noted for the v122 color-picker fix's own regression guard). (3) **Waiting to Recur: collapsible to a header-bar button**: deliberately built as a **per-device localStorage preference** (`familyHubChoresWaitingToRecurBar`, `"on"`/`"off"`, default off/full-column - unset reads as not-collapsed so every existing install looks unchanged until someone opts in on that specific screen), NOT a household-wide Settings field like `choresShowRewardsColumn` - the request was explicitly framed as "space saving for smaller displays," and two people looking at the same board on different devices (a cramped wall tablet vs. a spacious desktop browser) reasonably want different answers, unlike every other Settings-blob field in this project which is genuinely household-wide. Matches the project's own pre-existing device-level-preference convention (see e.g. Recipe Box's grid/list view, `familyHubRecipeBoxView`) rather than the `_toggleRewardsColumn`-style fetch-merge-save-to-Settings pattern right next to it in the same file - two different toggle buttons in the same header, two intentionally different persistence models, both commented in place to explain why. New `_waitingToRecurCollapsed()`/`_toggleWaitingToRecurCollapsed()` (both wrap the localStorage call in try/catch, returning/no-op-ing safe defaults - same defensiveness this project already applies to `window.navigator.clipboard`, given real households here run kiosk WebViews of unknown provenance), a new always-visible `.waiting-recur-toggle-btn` in the header actions row (unlike `.rewards-toggle-btn` this is NOT admin-gated - it's a display preference, not a data change, so anyone on that device can flip it) showing a live count badge, and `_render()` now conditionally omits `_waitingToRecurColumnHtml()` from the board entirely when collapsed rather than hiding it with CSS (actually saves the layout space, not just visually collapses it). Clicking the button is a plain two-way toggle (collapsed ↔ column), not a popover/dropdown of the waiting chores - considered and deliberately skipped as unnecessary added surface area, since toggling back to the column view is one tap away already. New tests in `test_chores_card.js`, placed last in the file and explicitly resetting the localStorage key back out afterward (`window.localStorage.removeItem(...)`) so this per-device state can't leak into any earlier assertion in the same run that assumes the column shows by default: the button renders with a live count, starts un-collapsed, collapsing hides the column and persists `"on"` to localStorage, a SECOND card instance created afterward (same simulated device) also starts collapsed (confirming this is device-scoped, not per-card-instance state), and clicking again un-collapses back to the column. Full JS+Python regression sweep after all three (same standing exclusions as every prior sweep: `test_reminder.js`, `test_servings_scaling.js`, `test_reminders_feature.js`, `test_family_calendar_reminders.py`) - all green. Still open from the v122 batch: #46/#47 (per-user primary calendar + card-style calendar picker), #51 (Theme Builder listing installed HA themes - user's own clarification: NOT auto-inheriting the dashboard theme, extending the existing Global Theme picker's option list instead), #49 (the still-unreproduced notify-device-persistence report), #54/#55 (reward emoji icon picker + reward card color), #56/#57/#58 (reward-claimed notification, admin redemption reversal, chore-approved notification).
- **v122 (1.87.0)**: A large batch of 14 requests arrived in one message (verbatim, one per line): chore cards as a clickable kanban-modal with descriptions/info; a per-user primary calendar that follows the user's color; the Users-tab calendar picker as selectable cards instead of checkboxes; "The color picker in the user box doesnt show color when you set it, just a white box with a black line"; "the user settings now stay for user notify device does not carry over"; My Chores card's heading matching Family Today's; support for all Home Assistant themes; a space-saving collapsible Waiting to Recur column; Chores scrolling vertically (not horizontally) on mobile; a reward icon picker; a per-reward-item card color; a new "reward claimed" notification setting; admin ability to clear/reverse redemptions; and a new "chore approved" notification tab. Given the size, asked (AskUserQuestion) how to sequence it and got: bugs-first-then-features; an emoji picker (not mdi:) for reward icons, matching the existing plain-emoji-string `icon` field reward_engine.py already has; for "all HA themes," the user clarified this ISN'T about auto-inheriting the dashboard's active HA theme - there's already a theme picker in Settings, under Theme Builder (the Global Theme select, `settings.useGlobalTheme`/`globalThemeId` reading from `family_hub/global_themes/*`), and Theme Builder itself should ALSO be able to include/list the household's actual installed Home Assistant themes (e.g. "Default") as selectable options there, not just its own custom-built ones - this reshapes that future task into extending the existing Global Theme picker's option list rather than building a wholly separate integration, and is not yet implemented (tracked as its own task, unstarted); for the chore detail modal, add a real free-text Notes/Description field (chores have none today) rather than just reformatting existing fields into a bigger view - also not yet implemented. Created 14 new tracked follow-up tasks (#45-#58) for the full list up front so nothing gets lost across what's clearly a multi-session effort, then did the two bug fixes tagged as first-in-line (title read: "quick" - both landed same day): (1) **Color picker showing white instead of the set color** (`family-week-calendar-card.js`'s `.notify-profile-color-input`, the swatch on the Users-tab profile-editor's Notification profile modal - reused for the "Include in Chores" work too, see v121): its CSS set an author `background: var(--fc-card)` (plus `padding: 2px`) directly on the `<input type="color">` element itself. Root cause: several browsers/WebViews (Firefox confirmed, and per the household's own report - a wall-mounted Android kiosk tablet - very plausibly whatever WebView renders Fully Kiosk Browser or similar) paint an author-specified `background` on a native color input OVER its internal `::-webkit-color-swatch`/equivalent rather than behind it, so the swatch always rendered as a flat white box with only the CSS border visible, completely independent of the (already-correct) `.value` assignment/on-input-write wiring in `_openNotifyProfileModal`/the `input` listener - the JS was never the problem. Confirmed by comparison: `.theme-color-row input[type="color"]` (Theme Builder's own 9 color pickers, immediately above in the same file) has never been reported broken and deliberately uses `background: none; padding: 0` - copied that exact pattern onto `.notify-profile-color-input` (kept its own border/box-shadow look rather than fully matching Theme Builder's, just dropped the two conflicting properties). New regression-guard assertion added to `test_chores_permissions_settings_ui.js` (a plain source-text regex check that the CSS rule contains no `background: var(--fc-card)`, not a rendered-style assertion - jsdom doesn't apply this file's own `<style>` block to `getComputedStyle`, so an actual visual-render test isn't meaningfully possible in this test harness). (2) **My Chores card's heading (`.title`) hardcoded to 18px, ignoring Theme Builder's "Header title" font-size entirely** - unlike `family-today-card.js` and `family-week-calendar-card.js`, both of which already read `settings.theme.fonts.headerTitle` (default 15) into a shared `--fs-header-title` CSS custom property they each set on their own host element via `_applySizeVars`/an equivalent. `family-hub-my-chores-card.js`'s own `_applyThemeVars`/`_resolveTheme` had only ever wired up `theme.colors` (11 CSS vars) - font sizing was never part of its theme pipeline at all, local OR global-theme lookup. Added a small, deliberately scoped `_headerTitleFontSize(settings)` helper (mirrors the calendar card's own global-theme-fonts-fallback logic - checks `settings.useGlobalTheme`+`globalThemeId` against `this._globalThemes` first, else falls back to `settings.theme.fonts.headerTitle`, defaulting to 15 either way) rather than building out this card's full font-theming system to match the other two cards (`dayName`/`dayNumber`/`wxTemp`/etc. - none of those apply to this card's own layout, which has no calendar grid), called from `_applyThemeVars()` to set `--fs-header-title`, and changed `.title`'s CSS from the hardcoded `18px` to `var(--fs-header-title, 15px)` - same fallback value as the other two cards, so a household not using Theme Builder at all sees zero visual change other than 18px→15px (a closer, intentional match to what "Family Today" already showed at its own default). New assertions in `test_my_chores_card.js`: default (no `settings.theme`) resolves to the shared 15px fallback, and a fixture with `settings.theme.fonts.headerTitle: 24` carries through to the card's own `--fs-header-title` custom property. (3) **"Notify device doesn't carry over"** - investigated but NOT fixed this pass; no defect found despite a thorough audit (the Notify Devices modal's add/auto-detect/remove wiring all mutate `_settingsUserProfilesDraft[userId].notifyTargets` in place correctly; `_saveSettings`'s `settingsObj` literal does include `userProfiles` - confirmed by grep, not just by reading the one function; `_fetchSettings`'s post-save reload correctly re-normalizes from the just-written store value; the backend's `_ws_set_settings`/`_get_user_profiles` round-trip `notifyTargets` losslessly) and a synthetic full round-trip test (add a device → `_saveSettings()` → re-run `_normalizeUserProfiles` on exactly what was sent, simulating a fresh load) preserved the target with no loss - written as a throwaway repro script (`/tmp/repro_notify_persist.js`, NOT added to the permanent test suite since it didn't actually catch anything and a "test" that only proves the absence of a bug I couldn't otherwise find isn't durable regression coverage). Left task #49 `pending` (not `completed`) with a note asking the user for a more specific repro (manual add vs. Auto-detect button; same session/device or after closing the app/switching devices/an HA restart; does it revert immediately after Save or only later) rather than guessing at a fix for something not actually reproduced - this is the one item in the whole v122 batch NOT shipped working. Full JS regression sweep after both fixes (the usual pre-existing/unrelated exclusions: `test_reminder.js`, `test_servings_scaling.js`, `test_reminders_feature.js`) - all green. Backend untouched this pass (both fixes were pure frontend CSS/JS).
- **v121 (1.86.0)**: User request, verbatim: "we need to have an include in chores toggle for each user and need some better permissions I have a wall tablet where people should be able to done all tasks, nudge, and move tasks from the chore bin to their name etc. need to have a way to permission that account." Two AskUserQuestion clarifications shaped the scope: (1) "For the per-user 'Include in Chores' toggle - what should turning it OFF actually do for that person?" → user chose "Remove them from Chores AND Rewards" (not Chores alone); (2) "For the wall tablet account marking OTHER people's chores done... Should I split it into its own permission?" → user chose "New separate 'Can mark any chore done' permission" over reusing `can_verify`. Nudging a chore and drag-and-drop reassignment out of the Chore Bin already worked with zero changes needed - nudge has no permission gate at all, and reassignment was already covered by the pre-existing `PERMISSION_ASSIGN` grant - so the actual new surface area was just the toggle and the new permission. **Include in Chores & Rewards toggle**: a SECOND, narrower opt-out nested UNDER the existing all-or-nothing `settings.memberUserIds` gate (v115, 1.80.0) rather than replacing it - `settings.userProfiles[uid].includeInChores` (bool, default `True` when absent/malformed, same fail-safe-for-existing-installs shape as every other `userProfiles` field like `color`/`digestEnabled`). Membership alone still gates the Users tab, Permissions tab, Routines, and general visibility; `includeInChores` additionally gates Chores-board-column/Rewards-balance-row/new-assignment eligibility specifically. Deliberately does NOT gate Routines, per the user's literal "Chores AND Rewards" answer - documented as an accepted side effect that toggling it off still hides the whole shared per-person board column (Routines included, since Routines renders inside that same column), since the primary real-world use case (a wall-tablet login) has no routines to lose anyway. Backend: `chores_websocket_api.py` gained `_is_chores_eligible(settings, user_id)` (membership check first, then the profile flag) and `_make_is_chores_eligible(entry_data)` - a second `IsUserEnabled`-shaped factory alongside the pre-existing `_make_is_user_enabled`, which is now membership-only and used exclusively by Routines' `ws_create_routine_item`. `_make_is_chores_eligible` replaced `_make_is_user_enabled` at the other four call sites: `ws_create_chore`/`ws_update_chore`/`ws_assign_chore`/`ws_claim_chore` (all four `chore_engine.py` mutation entry points). `chore_engine.py`'s own `_check_user_enabled`/`IsUserEnabled` docstrings updated to describe both callables since the same type now serves two different eligibility definitions depending on caller; its `user_chores_disabled` error message changed from "hasn't been added to Family Hub yet" to "not eligible... (not a Family Hub member, or excluded from Chores)" to cover both rejection reasons truthfully. Frontend: `family-week-calendar-card.js`'s `_defaultUserProfile()`/`_normalizeUserProfiles()` gained `includeInChores` (default `true`) alongside the existing profile fields; the `.notify-profile-overlay` modal (the same per-person editor already used for notification settings, opened from the Users tab's per-row Edit button - the modal is instance-shared and re-themed per section rather than duplicated) gained a new "Include in Chores & Rewards" On/Off field (`.notify-profile-chores-btn` pair) right after the color field, wired the same way as the existing `.notify-profile-reminders-btn` pair - writes into `this._settingsUserProfilesDraft[userId].includeInChores` on click, prefilled in `_openNotifyProfileModal`. `family-hub-chores-card.js`/`family-hub-rewards-card.js` each gained a new `_isChoresIncluded(userId)` (membership AND-ed with the profile flag, mirroring the backend's own `_is_chores_eligible`) and had `_memberUsers()` switched from `_isFamilyHubMember` to `_isChoresIncluded` - a single choke point that cascades correctly into `_columns()` (board columns; the pre-existing "still has an outstanding chore" fallback for a removed non-member is preserved and layers on top, unchanged), the Create/Edit "Assigned to" dropdown, the rotation-group picker, and the embedded/standalone Rewards balance grid, while leaving `_userName`/`_userColor`/history rendering on the full unfiltered user list (a chores-excluded person's name/color still needs to resolve correctly wherever their past history is shown). **New `can_complete_any` permission**: split out of the existing `can_verify` grant rather than folding into it - `const.py` gained `PERMISSION_COMPLETE_ANY = "can_complete_any"` (added to the `CHORE_PERMISSIONS` tuple), with a docstring explaining the wall-tablet motivation directly. `ws_complete_chore`'s gate changed from `is_assignee OR has(PERMISSION_VERIFY)` to `is_assignee OR has(PERMISSION_VERIFY) OR has(PERMISSION_COMPLETE_ANY)` - either grant alone unblocks it, and critically `can_complete_any` alone does NOT also unlock `ws_approve_chore` (that stays strictly `PERMISSION_VERIFY`-gated, unchanged), so a kiosk login can be handed "mark anyone's chore done" without also getting "finalize everyone's star payouts." `ws_set_permissions`'s voluptuous websocket schema needed `vol.Optional("can_complete_any"): bool` added explicitly (the handler body's `for key in CHORE_PERMISSIONS: if key in msg` save loop was already generic and needed no changes) - a reminder that this project's websocket schemas must list every accepted key by name, unlike the handler logic beneath them which is often already permission-agnostic. Frontend: `family-week-calendar-card.js`'s `_renderPermissionsList()` (Permissions tab, admin-only, each checkbox saves immediately via `_savePermissionCheck` rather than waiting for a modal Save) gained a 4th `.perm-check` checkbox (`data-key="can_complete_any"`) between the existing `can_verify` and `can_override_rewards` rows - zero new JS wiring needed since `_savePermissionCheck`'s `querySelectorAll(".perm-check")` attachment was already key-agnostic. New backend tests in `test_chores_websocket_api.py`: chores-excluded member rejected on create/assign/claim with `user_chores_disabled` (same error code as a non-member) while a still-included member stays assignable; `includeInChores` confirmed to NOT gate `ws_create_routine_item`; `can_complete_any` alone unblocks `ws_complete_chore` for a non-assignee but does NOT also unblock `ws_approve_chore`; a stranger with neither grant still gets `forbidden`; `ws_set_permissions` accepts and persists `can_complete_any`. New frontend tests: `test_chores_card.js`/`test_rewards_card.js` each gained an `includeInChores:false` fixture confirming the excluded member gets no board column/balance card and is dropped from the Assigned-to/rotation pickers while a plain member is unaffected. New `test_chores_permissions_settings_ui.js` covers the calendar card's own Settings UI pieces directly (no prior test file existed for this card's Users-tab profile modal or Permissions tab specifically, despite being referenced by comments in `test_chores_card.js`/`test_routines_card.js` as `test_calendar_card.js` - that file was never actually created in an earlier session; this new file fills the gap for the two fields this task touched rather than attempting full retroactive coverage of that whole modal): the Include in Chores toggle defaults On, prefills Off for an excluded fixture, writes into the live draft on click, survives `_saveSettings` into `set_settings`'s nested `userProfiles`, and round-trips through `_normalizeUserProfiles`; the Permissions tab renders the new checkbox unchecked by default, independent of `can_verify`, and checking it fires `family_hub/permissions/set` with `can_complete_any: true`. Full project test sweep after all of the above (Python: every `test_*.py` except the pre-existing unrelated `test_family_calendar_reminders.py`; JS: every `test_*.js` except the pre-existing `test_reminder.js`/`test_servings_scaling.js` flakes) - all green, nothing newly broken.
- **v120 (1.85.0)**: Three features requested in the same conversation, delivered together. (1) **Recurring chores, plain-schedule**: user request verbatim, "Chores should be able to be recurring there should be a place to see chores that have not been assigned and are waiting to recur or are waiting to pop up when an automation triggers them" - clarified via AskUserQuestion that recurrence should support BOTH "Simple interval" (every N days) AND "Specific weekdays" patterns, and that the waiting-chores view should be "A new 'Waiting to Recur' column" on the board itself. This is a SECOND, independent recurrence mechanism alongside the pre-existing sensor-driven `auto_create_trigger`/`reset_recurring_chore` (a chore can have neither, either, or both). New `chore_engine.py` fields: `recur_type` (`"interval"`/`"weekdays"`/`None`), `recur_interval_days`, `recur_weekdays` (list of ints, Monday=0..Sunday=6 matching Python's own `date.weekday()`), `recur_next_due` (a UTC ISO string, computed once at `approve_chore` time via new `_compute_next_recur_due`, cleared whenever `reset_recurring_chore` fires - regardless of which mechanism, sensor or schedule, triggered the reset, since both funnel through the same state-transition function). New `sweep_due_recurrences(chores, hass, now=None)` mirrors the existing `sweep_overdue_chores` pattern and is wired into `__init__.py`'s `_poll()` alongside it. Frontend: `family-hub-chores-card.js` gained shared `_recurFieldsHtml`/`_wireRecurFields`/`_applyRecurFieldsToPayload` helpers spliced into both the Create and Edit modals (always sends all three payload keys explicitly on Edit, never omits, so clearing recurrence back to "Doesn't repeat" actually clears it server-side - matches the existing due-date/trigger "always send explicitly" convention), and a new always-visible **Waiting to Recur** column (`_isWaitingToRecur`/`_recurDescriptionHtml`/`_waitingToRecurColumnHtml`) that such chores move into instead of sitting faded in their old assignee's column - deliberately not opt-in like the Rewards column, since "an easy-to-miss faded checkmark buried in whoever last did it" was the household's own original complaint. Its body uses class `.waiting-recur-col-body`, NOT `.chore-col-body`, so `_attachDragHandlers`'s selector never treats it as a drop target (same isolation trick already used for `.rewards-col-body`). New `test_chore_recurrence.py` (interval/weekday date math via `_compute_next_recur_due`, `sweep_due_recurrences` selectivity, create/update validation) and matching additions to `test_chores_websocket_api.py`/`test_chores_card.js`. (2) **Routines**: user request verbatim, "Go ahead and build a way to do routines like on the card I showed you allow routines to be enabled or disabled in settings," then "This is an idea on how to do routines, things to do daily that can be checked off can be stored in an accordian," alongside an attached mockup screenshot (4 person-columns, each with collapsible Morning/Afternoon/Night Routine rows showing a done/total badge, Active/Completed checklist sections, "Add item +"). Clarified via AskUserQuestion that the enable/disable toggle should be "A per-household on/off for the whole Routines feature," not per-person. Deliberately separate, lighter-weight sibling to Chores/Rewards - no assignment modes, no star rewards, no verification gate, just "add an item under one of a person's three fixed categories, check it off, it resets at local midnight." New `family_hub/routine_engine.py` (`create_item`/`toggle_item`/`delete_item`/`maybe_reset_daily`), new `ROUTINES_STORAGE_KEY_PREFIX`/`ROUTINE_CATEGORIES` (`morning`/`afternoon`/`night`, fixed order, no custom categories)/`ROUTINE_CATEGORY_LABELS`/`SETTINGS_KEY_ROUTINES_ENABLED` in `const.py`, `create_routines_store`/`default_routines`/`async_load_routines`/`backup_routines`/`maybe_restore_routines_backup` in `store.py` (4th feature to reuse the shared `_backup_data`/`_maybe_restore_backup` helper pair, alongside chores/rewards/permissions). Permission model mirrors Chores' own split: creating/deleting an item needs `PERMISSION_ASSIGN` (`ws_create_routine_item`/`ws_delete_routine_item`); toggling done/not-done needs NO permission at all (`ws_toggle_routine_item`) - same low-stakes self-serve principle as `ws_claim_chore`, since this is a personal daily checklist on a shared kitchen tablet, not a reward-bearing chore. Caught and fixed a real daily-reset race during test-writing: `maybe_reset_daily` must run once at `async_setup_entry` time (before any websocket handler is reachable) AND on every later poll tick, NEVER from inside individual websocket handlers - otherwise an item created/checked before the very first reset-of-the-day call would be wiped by that first call treating `last_reset_date == None` as "needs reset." Wired into `__init__.py` exactly that way (once in `async_setup_entry`, once in `_poll()` alongside the chore sweeps). Frontend: `family-hub-chores-card.js` renders three `_routineRowHtml` accordion rows (`_routinesBlockHtml`) at the top of each person's own column - never the Chore Bin/Waiting to Recur/Rewards columns - gated behind `_routinesEnabled()` reading `settings.routinesEnabled`, with `_openRoutineSections` (a `Set` keyed `"<userId>:<category>"`) tracking which accordions are expanded so poll-driven re-renders don't snap them shut. Add/delete gated by `_canAssign()` (matches the server's `PERMISSION_ASSIGN` gate); the checkbox itself is not. The household-wide toggle lives on `family-week-calendar-card.js`'s General tab (`routinesEnabled`, mirroring the existing `grocyExpiringEnabled` field's full round-trip exactly: `_defaultSettings`/`_normalizeSettings`/the `.routines-enabled-btn` On/Off pair/`_saveSettings`'s `settingsObj`) rather than the chores card's own self-contained `choresShowRewardsColumn` pattern (fetch-merge-write directly from that card) - **on purpose**: `_saveSettings()` builds `settingsObj` as an explicit field whitelist with no `...spread` of the previously-fetched blob, and `_ws_set_settings` is a full REPLACE not a merge (see v118 below for the exact same class of bug), so anything not in that whitelist gets silently dropped on the next Settings save from that modal. `choresShowRewardsColumn` is NOT in that whitelist today, meaning it's already exposed to exactly this wipe risk (confirmed by reading `_saveSettings` - it's a real, pre-existing, unaddressed gap, not something introduced here) - flagged for the user rather than fixed in this pass to keep this change scoped to what was asked. New `test_routine_engine.py` (10 tests, including the daily-reset race itself), `test_routines_card.js` (accordion expand/collapse survives re-render, add/toggle/delete wiring and payloads, canAssign gating, off-by-default, never on the Chore Bin column), `test_routines_settings_toggle.js` (default-off, prefill on reopen, save carries `routinesEnabled` through `_saveSettings`, round-trips through `_normalizeSettings`), plus the routines section of `test_chores_websocket_api.py`. (3) **Screensaver on all companion cards, "mindful of the device"**: user request verbatim, "also the screen saver should be available to be on all cards but still mindful of the device." Before this, only the full calendar card and the small purpose-built `family-hub-screensaver-card.js` companion card had the Auto Screen Saver (shared `settings.screenSaver` blob: source/idle time/per-login opt-in) - `family-hub-chores-card.js`/`family-hub-rewards-card.js`/`family-hub-my-chores-card.js` had none, meaning a household wanting it on a Chores-only dashboard had to also add the separate invisible companion card. Naively copy-pasting that companion card's ~150-line per-instance overlay/idle-timer/camera-poll-interval implementation into all three would mean a dashboard with more than one of these cards (e.g. Chores + Rewards side by side) stood up duplicate full-page overlays and duplicate camera-image polls hitting Home Assistant every 10 seconds - exactly what "mindful of the device" was flagging. Solved with a shared, refcounted singleton (`window.__familyHubScreenSaver`) instead: an identical ~260-line IIFE block, guarded by `if (!window.__familyHubScreenSaver) {...}`, copy-pasted verbatim into the top of `family-hub-chores-card.js`/`family-hub-rewards-card.js`/`family-hub-my-chores-card.js` (these are independently-loaded Lovelace resources, not ES modules that could import one shared file - same reasoning as the existing per-file Google Font loader IIFE already duplicated the same way at the very top of each). Whichever card's script executes first actually creates the singleton (owns the settings cache, the one `[data-family-hub-screensaver]` overlay element, the one idle timer, the one camera-poll interval, the one set of document-level activity listeners); every other card's byte-identical copy of the same guarded block just sees the flag already set and becomes a no-op. Each card calls `registerClient(this, this._hass)` from both `_initFirstLoad` and `connectedCallback` (harmless to call twice - a plain JS `Set` under the hood), `unregisterClient(this)` from `disconnectedCallback`, and `updateHass(hass)` from `set hass` on every update (not just the first) so the shared controller's own hass reference never goes stale. The controller only stands up its timers/listeners/overlay when the client count goes 0→1, and only tears them down when it drops back to 0 - so any number of these three cards can coexist on one dashboard and only ever pay for one screensaver. **Scope decision, made deliberately**: did NOT refactor `family-week-calendar-card.js`'s own independent screensaver implementation or `family-hub-screensaver-card.js`'s own independent one onto this same singleton - both already work, are already covered by their own existing tests (`test_screensaver_settings.js`/`test_screensaver_recipe_disable.js` assert directly on the calendar card's own `_showScreenSaver`/`_screenSaverOverlayEl`/etc. as instance methods/properties; `test_screensaver_card.js` does the same for the companion card), and a household realistically has at most one calendar card (their main dashboard) and at most one companion card per *other* dashboard - the actual duplication risk this task is about is specifically multiple of the three NEW cards sharing one dashboard, which the singleton fully solves. If a household still has the separate `family-hub-screensaver-card.js` companion card on a dashboard that now also has one of these three, they'd get two overlays (the companion card's own independent implementation + this singleton) - flagged to the user in the delivery message with the fix being simply "remove the now-redundant companion card from that dashboard," not a code change. New `test_screensaver_shared_controller.js` (two different companion card types on one page share the exact same controller instance and at most one overlay element; disconnecting one of two registered cards does not tear the shared state down while the other is still using it; disconnecting the last one does; a lone card with no others present still works). Full project test sweep after all three: only the same pre-existing/unrelated failures as every prior sweep (`test_reminder.js` stale selector, `test_servings_scaling.js` date-dependent flake now visibly triggered by real calendar time having passed the hardcoded fixture week, `test_family_calendar_reminders.py` missing unrelated legacy module) - nothing newly broken.
- **v119 (1.84.0)**: User request, verbatim: "chores should be able to be edited by people who can assign them." Investigation found the backend already did exactly this - `ws_update_chore` (chores_websocket_api.py) has always gated `family_hub/chores/update` behind `PERMISSION_ASSIGN`, the identical check `ws_create_chore`/`ws_delete_chore`/`ws_assign_chore` use - but `family-hub-chores-card.js` never actually exposed any UI to call it: there was a Create Chore modal and zero way to edit an existing one short of deleting and recreating it. So this was a frontend-only gap, not a permission-model change. Added a pencil "Edit" button (`.chore-edit-btn`) to `_choreCardHtml`, shown only when both `status === "open"` (chore_engine.update_chore itself refuses anything else - pending_verification/approved chores can only be re-opened via reset_recurring_chore or recreated, never edited in place) and `_canAssign()` (mirrors the backend's own PERMISSION_ASSIGN gate - this is a UI convenience matching an existing rule, not a new permission). New `_openEditModal(choreId)`/`_submitEdit(choreId, overlay, box)` pair, plus a second `.edit-modal` overlay added in `_build()` (the existing `.modal-overlay` close-on-backdrop-click handler already covers it via its `querySelectorAll` loop). The edit form mirrors the Create form's fields exactly EXCEPT `assignment_mode`/`assigned_to` (permanently fixed once a chore exists per `chore_engine.py` - reassignment still only happens via drag-and-drop/the Chore Bin, matching `ws_update_chore`'s own schema which has no such fields at all) and shows the rotation-group field only when `chore.assignment_mode === "auto_rotation"` (editing it means nothing otherwise, and it's simply omitted from the update payload when hidden so the existing value is left alone - `update_chore` only touches a field whose key is present in `fields` at all). Two new small helpers: `_escAttr(s)` (`_esc(s).replace(/"/g, "&quot;")` - `_esc` alone only escapes `&`/`<`/`>` via text-node serialization, never `"`, which matters here because unlike the Create form this one pre-fills real stored content into `value="..."` attributes; same `.replace(/"/g, "&quot;")` pattern already used elsewhere in this project, e.g. family-week-calendar-card.js's recipe-chip/category rendering) and `_isoToLocalDatetimeInputValue(iso)` (round-trips a stored due_date - a UTC ISO string, exactly what the Create form's own `new Date(dueVal).toISOString()` produces - back into the local-time string a `datetime-local` input expects, using the browser's own local Date getters, the same implicit local-time interpretation the Create form already relies on in reverse). Due date, auto-create/auto-complete trigger fields are always sent (even as `null` when cleared) unlike Create's omit-when-blank approach, specifically so clearing a field in the edit form actually clears the stored value instead of being silently ignored by `update_chore`'s "only touch fields whose key is present" rule. New tests in `test_chores_card.js`: Edit button present on an open chore for someone who can assign, absent on a pending_verification chore even for an admin, absent everywhere for someone without assign permission; opening the modal pre-fills title/stars/overdue-penalty/due-date (verified via the same `_isoToLocalDatetimeInputValue` conversion the card itself uses, so the assertion isn't hardcoded to one timezone) and omits the rotation field for a direct-assignment chore; saving sends the edited fields via `family_hub/chores/update` and closes the modal. Full project test sweep after this change: only the same 3 pre-existing/unrelated failures as every prior sweep (`test_reminder.js`, `test_servings_scaling.js`, `test_family_calendar_reminders.py`) - nothing newly broken. Backend (`chores_websocket_api.py`/`chore_engine.py`) untouched - this was purely a frontend gap.
- **v118 (1.83.0)**: Fixed a real, previously-undocumented data-loss bug reported directly from production use: "every time I manually put a new version on [via a plain file copy into `custom_components`, no HACS, no self-update zip, no removing/re-adding the integration] and restart, notification settings of the users is wiped" — confirmed via AskUserQuestion that the loss is total and permanent (re-entered by hand each time), which ruled out the existing v109/v114 backup/restore mechanism ever getting a chance to help (that only restores into a genuinely orphaned Store from a *new* `entry_id`, i.e. remove-and-re-add; a plain file copy + restart never changes `entry_id`, so this is a completely different failure mode). Root cause traced by reading `_ws_set_settings` closely: it does `store.async_save(msg["settings"])` — a full REPLACE of the whole stored blob, not a merge — and the card's JS has never round-tripped `SETTINGS_KEY_NOTIFY_PROFILES_MIGRATED` (`notifyProfilesMigrated`) because it's a pure backend bookkeeping flag with no UI representation, unlike e.g. `memberUserIds`/`userProfiles` which the JS does carry through as real user-facing data. So every single Settings save from the card (the very first thing a lot of people do right after noticing an update) silently dropped that flag from storage; the next restart's `_migrate_notify_profiles` saw it missing, assumed this household had never migrated, and re-derived + overwrote everyone's real per-user profiles from the old flat pre-migration override system. Fixed with two independent, defense-in-depth changes rather than one: (1) `_ws_set_settings` now loads the existing store first and carries `SETTINGS_KEY_NOTIFY_PROFILES_MIGRATED` forward into the new blob whenever the incoming payload omits it and the existing store had it `True` (an incoming payload that mentions the key explicitly, even as `False`, still wins outright — this is a fill-in, not an override); (2) `_migrate_notify_profiles` gained a second, independent self-healing guard immediately after its existing early-return: if `SETTINGS_KEY_USER_PROFILES` already holds real (non-empty dict) data, that alone is proof migration already happened regardless of whether the flag survived, so it just re-stamps the flag and returns rather than ever re-deriving fresh profiles on top of real current data. Both fixes are covered by new regression tests: `test_settings_storage.py` gained `test_set_settings_preserves_notify_profiles_migrated_flag_when_omitted`/`test_set_settings_does_not_invent_flag_when_never_migrated`/`test_set_settings_respects_explicit_notify_profiles_migrated_value`; `test_settings_backup.py` gained `test_migrate_notify_profiles_self_heals_when_flag_missing_but_profiles_real`/`test_migrate_notify_profiles_still_migrates_when_genuinely_empty` (also confirms the self-heal doesn't re-save on every subsequent call once healed, and that a genuinely fresh/empty install still goes through normal auto-detect migration rather than getting stuck early). Full project test sweep run after this change (Python + JS): only the same 4 pre-existing/unrelated failures as every prior sweep this whole project (`test_reminder.js` stale selector, `test_servings_scaling.js` date-dependent flake, `test_family_calendar_reminders.py` missing unrelated module, `test_grocy_recipe_importer.js` occasional hang/flake) — nothing newly broken. No JS/card changes in this fix — backend-only (`family_hub/__init__.py`). Note: `test_settings_backup.py`'s file-level docstring still describes only the entry-removal/recreation scenario as "the one way" the Store gets orphaned — that's still accurate for *that specific mechanism* (the backup/restore pair it documents), it's just no longer the only class of settings-data-loss bug in the codebase; the new tests at the bottom of that file cover this second, unrelated class (the migration self-heal) and say so in their own docstrings, so the file wasn't rewritten top-to-bottom to avoid overstating what the backup/restore mechanism itself does.
- **v117 (1.82.0)**: Four Chores/Rewards improvements requested together
  from real use:
  1. **Chore column min-width, not fixed width**
     (`family-hub-chores-card.js`'s `.chore-column`): was `flex: 0 0
     220px` (fixed, never grows or shrinks); now `flex: 1 0 220px; min-
     width: 220px` - `flex-grow: 1` lets columns stretch to fill leftover
     dashboard space when there are only a couple of people, `flex-
     shrink: 0` + the explicit `min-width` guarantee they never get
     squeezed below 220px, so `.board`'s existing `overflow-x: auto`
     still takes over (horizontal scroll) once there are enough columns
     that 220px each no longer fits. Pure CSS, no JS/settings/backend
     change.
  2. **Rewards card membership filtering** (`family-hub-rewards-card.js`):
     was showing a balance card for every real HA login
     (`family_hub/list_users`, unfiltered) - now filtered through the same
     `_isFamilyHubMember`/`_memberUsers()` pattern `family-hub-chores-
     card.js` already had from the v115 membership feature (reads
     `settings.memberUserIds`, already available since this card already
     fetches the full settings blob for theming). Deliberately narrow:
     only the balances grid (and therefore who gets +/- adjust buttons) is
     filtered - `_userName`/`_userColor`/the redemption-history list still
     look a user up in the full unfiltered `this._users`, so a past
     redemption by someone since removed from Family Hub still shows
     their real name in history, matching the "removal only hides, never
     deletes" decision from v115.
  3. **Per-user custom color** (`settings.userProfiles[id].color`, a new
     hex-string field alongside `notifyTargets`/`digestEnabled`/etc. -
     `_defaultUserProfile()`/`_normalizeUserProfiles()` in `family-week-
     calendar-card.js`): a color picker (new `.notify-profile-color-input`
     `<input type="color">` + a "Use default" reset button) in each
     person's profile modal on the Users tab. Purely cosmetic - never read
     by any backend notification logic, so (unlike every other field in
     that profile) there's deliberately no matching field added to the
     Python side's `_default_user_profile()`/`_get_user_profiles()` in
     `__init__.py`; the schema-free settings Store just round-trips it
     untouched. `family-hub-chores-card.js`/`family-hub-rewards-card.js`'s
     own `_userColor(id)` now check `settings.userProfiles[id].color`
     first, falling back to the same automatically-assigned palette color
     as before when unset - `family-hub-my-chores-card.js` has no color
     usage at all (single-person view) so needed no change.
  4. **Optional "Rewards" column on the Chores board**
     (`family-hub-chores-card.js`): a new admin-only toggle button
     (`.rewards-toggle-btn`, a star icon in the board's header) flips
     `settings.choresShowRewardsColumn` (off by default) and, when on,
     appends an embedded mini Rewards card - each Family Hub member's
     balance plus the full claimable catalog - as an extra column after
     the per-person ones, reusing `family_hub/rewards/get_state`/
     `family_hub/rewards/redeem` (the exact same ws commands `family-hub-
     rewards-card.js` uses) so both stay in sync. The claim handler is
     named `_claimReward` (not `_claim`, which this card already uses for
     *chore* claiming - a real naming collision that would've been easy to
     introduce by copying `family-hub-rewards-card.js`'s method name
     as-is). The new column's inner scroll container is deliberately
     `.rewards-col-body`, NOT `.chore-col-body` - `_attachDragHandlers`
     wires drag/drop onto every `.chore-col-body` in the board, and the
     Rewards column must never become a chore drop target. **First time
     any of the three lightweight companion cards (chores/rewards/my-
     chores) writes Settings** (`family_hub/set_settings`) rather than
     only reading it - `_toggleRewardsColumn` re-fetches a fresh copy of
     the full settings blob immediately before merging in the one changed
     field and writing it back, to keep the window for stomping a
     concurrent edit from the calendar card's own Settings modal (a
     known, pre-existing risk of the single-blob schema-free Store design,
     not new here) as small as possible.

  Scoped via two AskUserQuestion decisions: the Rewards column shows both
  balances AND the full catalog (not just balances, not just catalog), and
  the color picker is one setting per person that applies everywhere (not
  a separate color per card). Test coverage: new assertions in
  `test_chores_card.js` (min-width CSS untested directly - cosmetic;
  custom-color override on `_userColor`; the full toggle-on/render/claim
  flow for the Rewards column, including a non-admin never seeing the
  toggle and the settings write preserving the rest of the blob) and
  `test_rewards_card.js` (membership filtering incl. an explicit "no one
  added yet" empty state; custom-color override); new color-picker
  coverage (populate/edit/reset/persist) added to `test_countdown_list_
  and_digest.js`'s existing Notifications-tab flow rather than a new file.
- **v116 (1.81.0)**: Removed the household-level "Grocy in Daily Digest"
  gate (`grocyExpiringDigestEnabled`/`grocyLowStockDigestEnabled` in the
  Settings blob, `CONF_GROCY_EXPIRING_DIGEST_ENABLED`/`CONF_GROCY_LOW_
  STOCK_DIGEST_ENABLED` in config entry options) reported by the household
  as redundant with each person's own per-profile digest checkbox. What
  used to be a three-way Daily Digest gate (household tracker toggle +
  household digest-inclusion toggle + per-user checkbox) is now two-way
  (household tracker toggle + per-user checkbox only) - the household
  digest-inclusion layer added nothing the per-user checkbox didn't
  already cover and just gave a second place things could be silently
  turned off. Fully retired rather than just hidden: the `.notify-grocy-
  household` block (and its two `grocy-*-digest-enabled-btn` toggles) is
  gone from the Users tab HTML, `_syncGrocyNotifyVisibility()` no longer
  touches it (still handles the per-user checkbox visibility gated by the
  Track toggle, unchanged), `_ws_set_grocy_expiring_enabled`/`_ws_set_
  grocy_low_stock_enabled` no longer accept/store a `digest_enabled` param,
  and the two `CONF_GROCY_*_DIGEST_ENABLED` constants are gone from
  `const.py` (a comment there marks them superseded, same convention as
  the v115 `choresEnabled` note). The underlying Grocy tracker on/off
  toggles (`grocyExpiringEnabled`/`grocyLowStockEnabled`, General tab) and
  the per-user checkbox visibility-depends-on-tracker logic are untouched.
  Updated `test_grocy_expiring_and_putaway.py`/`test_grocy_low_stock_and_
  extras.py` (dropped the now-nonexistent digest_enabled assertions/tests)
  and `test_countdown_list_and_digest.js` (dropped the household-toggle
  assertions; the per-user-checkbox-respects-Track-toggle coverage a few
  lines below was already independent of the household toggle and needed
  no change). Also fixed a real gap surfaced while running the full test
  sweep for this change: `test_reminders_feature.js`'s Part 5 never
  actually triggered `_fetchSettings()` (its `el._hass` is assigned
  directly, bypassing the `hass` setter that normally kicks off the first
  fetch), so `_settingsMemberIdsDraft` was always empty and its Users-tab
  profile-row assertion was failing before this session even started -
  unrelated to this change but caught in the same sweep, fixed by awaiting
  `el._fetchSettings()` before `_openSettings()` in that test.
- **v115 (1.80.0)**: Explicit Family Hub membership — see the dedicated architecture section above for the full design (both AskUserQuestion decisions: gate scope "everywhere including Chores", removal behavior "leave it alone, just hide them"). Short version: `settings.memberUserIds` (opt-in) replaces v112's `choresEnabled` (opt-out) as the one gate for the Users tab, Permissions tab, and Chores board/assignment pickers; a one-time migration (`_maybe_migrate_member_user_ids`) backfills existing installs from `userProfiles` ∪ permissions keys so nobody already-visible disappears on upgrade; removing someone only ever edits the membership list, never touches their profile/permissions/chore data. New `test_member_user_ids_migration.py`; updated `test_chores_websocket_api.py`, `test_chores_todo_and_services.py`, `test_chores_card.js`, and three other JS test files whose fixtures needed an explicit `memberUserIds` under the new opt-in default.
- **v114 (1.79.0)**: Household asked for a way to keep "all the user settings" across an update. Investigation found this was already half-solved: v109/1.76.0 built a durable backup/restore for the general Settings blob specifically because removing and re-adding the Family Hub config entry (not a plain file update, which never touches `.storage/`) hands the next setup a brand-new `entry_id` and therefore a brand-new, empty Store - but that fix only covered `settings_store`, not the three separate Chores/Rewards/Permissions stores (`chores_store`/`rewards_store`/`permissions_store` in `store.py`, also keyed by `entry.entry_id`), which would still be wiped by the exact same scenario. Confirmed with the household via AskUserQuestion that the fix should cover everything, not just Chores/Rewards/Permissions alone. Generalized the mechanism: `store.py` gained `_backup_file_path`/`_write_backup_file`/`_read_backup_file`/`_backup_data`/`_maybe_restore_backup` (near-identical copies of `__init__.py`'s existing `_settings_backup_path`/`_write_settings_backup_file`/`_read_settings_backup_file` helpers, deliberately NOT shared/imported - see below) plus three public pairs built on them: `backup_chores`/`maybe_restore_chores_backup`, `backup_rewards`/`maybe_restore_rewards_backup`, `backup_permissions`/`maybe_restore_permissions_backup`. New filename constants in `const.py`: `CHORES_BACKUP_FILENAME`/`REWARDS_BACKUP_FILENAME`/`PERMISSIONS_BACKUP_FILENAME`, all under the same existing `SETTINGS_BACKUP_DIR_NAME` (`family_hub_backups/`) folder as `SETTINGS_BACKUP_FILENAME`. **Why this lives in `store.py`, not `__init__.py` alongside the settings version**: every real chores/rewards/permissions save happens through `chores_websocket_api.py`'s `_save_chores`/`_save_rewards`/`_save_permissions` helpers, and that module must stay import-independent of `__init__.py` (the same circular-import constraint documented in the v110 section above) - `store.py` is the shared, self-contained sibling both `__init__.py` and `chores_websocket_api.py` already import from, so it's the only place this could live without either duplicating the file I/O logic a third time or breaking that convention. Wired in at every real save site: `chores_websocket_api.py`'s three `_save_*` helpers now take `hass` (threaded through from their ~15 call sites, all of which already had it in scope) and call the matching `backup_*` after every `Store.async_save`; `__init__.py` had 6 more raw save sites of its own (the sensor-trigger listener, the three native `family_hub.*` chore services, and the overdue-sweep in `_poll()`) that got the same treatment directly. Restore is wired into `async_setup_entry` right after each store is created, before its data is loaded - same ordering `_maybe_restore_settings_backup` already uses relative to `_migrate_notify_profiles`. Same design tradeoffs as the original settings backup, deliberately kept consistent rather than special-cased per store: never backs up a falsy/empty dict (so a fresh install's first empty load, or a chores store legitimately at zero right now, can't stomp a real backup), only restores into a COMPLETELY empty store (any real content, even an intentionally-cleared one, is left alone), and every failure (write or read) is logged and swallowed rather than blocking the real save or crashing setup. New `test_chores_rewards_permissions_backup.py` (table-driven across all three stores - write, empty-never-overwrites, failure-swallowed, restore-fills-empty, no-restore-with-content, no-restore-no-backup, corrupt-file, and one test confirming the three backup files are genuinely independent of each other) plus three new wiring tests in `test_chores_websocket_api.py` confirming a real `ws_create_chore`/`ws_approve_chore`/`ws_set_permissions` call actually leaves the matching backup file on disk (which also required giving that file's `FakeHass` a real `hass.config.path(...)`, since `store.py`'s backup functions need it and the old fixture didn't have one - previously-passing tests had been silently swallowing an `AttributeError` from the backup call every time, logged as a warning but never asserted on).
- **v113 (1.78.1)**: Fixed the Chores board's columns (`family-hub-chores-card.js`) not visually matching the rest of the household look, reported right after v112 shipped. `.chore-column` was using `--fc-surface2` (not `--fc-card`, the color every other card-like container in the project uses - `.day-col`, `.month-cell`, `.planner-grid`/`.month-cell`, `.recipe-row`), a 14px border radius instead of the established 10px, and had no `border`/`box-shadow` at all - fixed by matching `.day-col`'s exact formula (`background: var(--fc-card); border: 1px solid var(--fc-border); border-radius: 10px; box-shadow: var(--fc-shadow);`) and giving `.chore-col-header` the same `--fc-surface-alt` background `.planner-header-cell` uses. Also caught a real latent bug while investigating: this card's `_applyThemeVars()` never set a `--fc-shadow` CSS variable (only the color vars), and its `:host` block never defined a default for it either - so every `box-shadow: var(--fc-shadow)` in this card's CSS (not just the new column rule) was silently resolving to no shadow. Fixed by adding the same literal `:host` default the calendar card carries (`--fc-shadow: 0 2px 5px rgba(58, 53, 44, 0.16);`). **Known remaining gap, not fixed here** (flagged, not addressed, since it's a bigger lift than what was asked): if the household later picks a **global** Theme Builder theme with custom shadow/glow *effects*, `family-week-calendar-card.js` and `family-today-card.js` pick that up dynamically via `_buildBoxShadow`/`_hexToRgba` (see those files) - `family-hub-chores-card.js`, `family-hub-my-chores-card.js`, and `family-hub-rewards-card.js` don't have that wiring at all (true since v110, not introduced by this fix) and would still show a flat default shadow even with a themed effect active elsewhere. Worth doing as its own follow-up across all three v110 cards if the household actually uses custom shadow/glow effects.
- **v112 (1.78.0)**: Settings relocation + per-user Chores enablement — see the dedicated architecture section above for the full design (the two AskUserQuestion decisions: full opt-out disable scope, and open-not-done-only digest scope). Short version: the admin-only Permissions tab moved from `family-hub-chores-card.js`'s own (now-deleted) Settings modal into a new Permissions tab on `family-week-calendar-card.js`'s Settings; the Notifications tab there is now labeled Users and gained a per-person Chores on/off toggle plus a "their own pending chores" Daily Digest checkbox; a new `choresEnabled` per-user field (default true) controls both the Chores board's columns (`_columns()`'s enabled-user-or-still-has-an-outstanding-chore union) and eligibility for new assignments, enforced independently on the backend via a new `is_user_enabled` dependency-injection parameter threaded through `chore_engine.py`'s create/assign/claim/update functions (mirrors `send_nudge`'s existing `split_notify_target` pattern, keeping `chore_engine.py` import-free of `__init__.py`/the Settings store); the Daily Digest gained a personalized "Your pending chores" section (`_build_daily_digest_message` now takes a `user_id`). New/updated tests: rewrote `test_chores_card.js` (old Permissions-tab assertions removed since that UI no longer exists there; new coverage for enabled-only columns/pickers), nine new `is_user_enabled` tests in `test_chore_engine.py`, four new wiring tests in `test_chores_websocket_api.py`, and a new `test_daily_digest_chores_section.py`.
- **v111 (1.77.1)**: Two fixes to v110, both found from real use right after it shipped - see the "second real bug" callout in the Chores architecture section above for the full story. (1) The three new cards never registered themselves in `window.customCards`, so none of them showed up in the Add Card picker (they'd still work if hand-typed into dashboard YAML) - fixed by adding the same registration block every other card in this project already has, to all three files. (2) The chores websocket module was originally named `websocket_api.py`, colliding with the already-imported `homeassistant.components.websocket_api` and breaking the live integration on startup - fixed by renaming to `chores_websocket_api.py` (see the "real bug hit and fixed post-delivery" callout above). Added regression tests for both: `test_chores_card.js`/`test_my_chores_card.js`/`test_rewards_card.js` now assert `window.customCards` contains the right `type`, and `test_chores_todo_and_services.py` now calls the real `family_hub.async_setup()` end-to-end and checks `chores_ws_api` is genuinely the chores module.
- **v110 (1.77.0)**: Built the full Chores/Rewards/Permissions feature — see the dedicated architecture section above for the design decisions (recurring-chore model, permission model, sensor-listener shape, instant redemption). New backend modules: `store.py` (three new Stores), `chore_engine.py` (state machine: create/assign/claim/complete/approve/reset_recurring_chore/sweep_overdue_chores/update_chore/delete_chore/send_nudge), `reward_engine.py` (balances/catalog/redemption), `chores_websocket_api.py` (17 new `family_hub/chores|rewards|permissions/*` commands, all permission-gated via `_has_permission`/`_is_admin`), `todo.py` (native `todo.family_hub_chores` entity, forwarded as a platform via `async_forward_entry_setups`), `services.yaml` (native `family_hub.create_chore`/`complete_chore`/`approve_chore`/`nudge_user` services, registered idempotently in `__init__.py`, deliberately not permission-gated). `__init__.py` also gained a single global `state_changed` listener for `auto_create_trigger`/`auto_complete_trigger` sensor wiring and fires a `family_hub_chore_event` on every chore status change. Three new cards: `family-hub-chores-card.js` (full board — user columns + Chore Bin, drag-and-drop, creation form with an Advanced Settings accordion for sensor triggers/dependencies/rotation groups, one-click Nudge, admin-only Permissions tab in Settings), `family-hub-my-chores-card.js` (personal view keyed off `hass.user.id` + embedded claimable bin), `family-hub-rewards-card.js` (star ledger, catalog, instant self-serve claim, admin-only catalog management). Two AskUserQuestion decisions from the household: rotation-group membership is a per-chore list set in the creation form's Advanced Settings (not a separate global concept), and reward redemption is instant/self-serve rather than admin-approved. Covered by four new Python test files (`test_chore_engine.py`, `test_reward_engine.py`, `test_chores_websocket_api.py`, `test_chores_todo_and_services.py`) and three new JS test files (`test_chores_card.js`, `test_my_chores_card.js`, `test_rewards_card.js`); required extending the fake HA test harness (both `/tmp/hatest` and its `/tmp/fcrtest` mirror) with `ServiceCall`/`Context`/`homeassistant.helpers.entity.Entity`/`homeassistant.components.todo`, none of which existed before since this was the project's first use of native HA services or entity platforms.
- **v109 (1.76.0)**: Notification profiles (and every other card setting) now survive the Family Hub config entry being removed and re-added. Root cause, confirmed by reading the storage code: `family_hub` is single-instance (`config_flow.py`'s `FamilyHubConfigFlow.async_step_user` does `await self.async_set_unique_id(DOMAIN); self._abort_if_unique_id_configured()`), and every Store (`reminders_store`, `settings_store`, etc., all created in `async_setup_entry`) is keyed by `f"{PREFIX}_{entry.entry_id}"`. Neither `updater.py`'s self-update zip-install nor a HACS file update ever touches `.storage/` - both only overwrite files under `custom_components/family_hub/`. The one thing that DOES orphan a Store is the config entry itself being deleted and re-added: that generates a brand-new `entry_id`, so the next `async_setup_entry` gets a brand-new, empty `settings_store` while the old one's `.storage` file just sits there unused. Fix: `_backup_settings(hass, settings)` (new, in `__init__.py`) writes the *whole* settings blob to a plain JSON file at `<config>/family_hub_backups/settings_backup.json` (same folder `updater.py` already uses for its own zip-update backups, chosen because it's outside both `.storage/` and `custom_components/family_hub/`) via `hass.async_add_executor_job` + `os.replace` for an atomic write; called after both real write paths (`_ws_set_settings`, and `_migrate_notify_profiles`'s own `settings_store.async_save`). Deliberately never backs up an empty dict, so a blank in-between state can never stomp a real backup. `_maybe_restore_settings_backup(hass, settings_store)` (new) is called in `async_setup_entry` right after `settings_store` is created and BEFORE `_migrate_notify_profiles` runs (ordering matters: `_migrate_notify_profiles` does its own `settings_store.async_load()` and, seeing an empty store, would otherwise treat it as "never migrated" and write a fresh empty profile set + set the migrated flag - which would make the store look non-empty by the time anything else could restore it). It only triggers when the store's `async_load()` comes back completely empty (`None` or `{}}` - not just missing `userProfiles`), so a store with genuine content (even an intentionally-cleared profiles dict) is never touched; a truly fresh install with no prior backup file correctly does nothing. Both backup-path constants (`SETTINGS_BACKUP_DIR_NAME`, `SETTINGS_BACKUP_FILENAME`) live in `const.py` next to the existing `SETTINGS_STORAGE_*` constants. Restoration is automatic and silent aside from an `_LOGGER.info` line (confirmed with the user via AskUserQuestion: whole-settings-blob scope, quiet auto-restore, both "Recommended"). Covered by new `test_settings_backup.py` (write/no-clobber-on-empty/restore-into-empty-store/no-restore-with-real-content/no-restore-with-no-backup/corrupt-backup-file/read-or-write-failure-swallowed/end-to-end simulated remove-and-readd) plus a new assertion in `test_settings_storage.py` that a real `family_hub/set_settings` call also leaves a backup file on disk.
- **v108 (1.75.0)**: New "Send test digest now" button in each person's Notifications-tab profile modal (`.notify-profile-send-digest-btn`, `_sendDailyDigestNow()`). Sends that person's Daily Digest immediately, using the modal's *live, possibly-unsaved* state (`_settingsUserProfilesDraft[userId].notifyTargets` + the currently-checked `.notify-profile-section-check` boxes), not the last-saved profile - so you can flip a digest-section checkbox and test it right away without a Save/reload round trip. Backend: new `family_hub/send_daily_digest_now` websocket command (`_ws_send_daily_digest_now` in `family_hub/__init__.py`) that reuses `_build_daily_digest_message`/`_split_notify_target`/`_notification_click_data` (the same machinery the scheduled poller uses) but sends synchronously and returns `{success, sent, failed}` (or `{error: "no_notify_target"}`) instead of writing to the dedupe/`digest_state` store - repeatable test sends don't get silently swallowed by the "already sent today" guard the real schedule uses. Frontend shows a status line under the button: full success, partial failure ("Sent to N of M devices..."), full failure, the no-notify-target guidance (both client-side, before any ws call, and mirrored from the backend's own `no_notify_target` response), or an unreachable-backend message; button is disabled while the request is in flight; opening a different person's profile clears any leftover status text so it can't bleed onto the wrong person. Covered by `test_send_digest_now.js` (new).
- **v107 (1.74.0)**: New "Planner" view (`_renderPlannerGrid`, `.grid.mode-planner`/`.planner-*` CSS) - a third view mode (button + `_viewMode === "planner"` branch in `_renderGrid`) alongside Week/Month: days down the side (current week only, via the same `_weekStart()`/`_weekOffset` Week already uses), one column per person (from `_getPeople()`). Deliberately reuses only `.event`-class chips (not the timeline/badges/meal-banner machinery `_renderWeekGrid` has) so clicking one falls through the existing `[data-event-id]` delegated click handler into `_openEventInfo` for free. Honors a calendar's hideMatch keyword (never shows a fully-hidden event) but not badge-swap (no header slot to put a badge in, in this layout - a badge-matched event just renders normally instead of disappearing). Also added "planner" as a third `defaultView` option (Settings → General, `_normalizeSettings`/`_updateNavLabel`/the view-mode init at the top of `_initFirstLoad`). The Edit Meals button (Week-only, drags menu banners) is now hidden in both Month and Planner, not just Month. Covered by `test_planner_view.js` (new).
- **v106 (1.73.0)**: New companion card `family-hub-screensaver-card` (`family_hub/card/family-screensaver-card.js`, served/registered via `SCREENSAVER_CARD_JS_URL` in `const.py`/`__init__.py`) - only shows its face while its own dashboard is in edit mode (`set editMode`), otherwise renders at zero height but keeps running the same idle-timer/overlay logic as the full card's screensaver in the background, reading the same shared `family_hub/get_settings` screenSaver slice (no legacy to-do fallback needed - Store-backed and card-independent). Adds a "Return to this dashboard on wake" dropdown built into the card face (edit mode only, populated from `lovelace/dashboards/list`, dispatches `config-changed`) plus a `getConfigForm()` `selector: {navigation:{}}` field as a guaranteed-to-persist fallback for the same setting, since a live `config-changed` from a plain grid-mounted card (vs. the dedicated "Edit Card" dialog editor) isn't reliably wired up in every Home Assistant version - this is flagged to the user as an open question, not fully verified in this environment. Also added `settings.screenSaver.disableWhileRecipeOpen` (off by default) to the full card - when on, `_screenSaverApplicable`/`_recipeViewOpen` pause the idle countdown while `.dish-detail-overlay` or `.grocy-recipe-viewer-overlay` is open (not `.loved-overlay`, the browse/list view); `_openDishDetail`/`_closeDishDetail`/`_openGrocyRecipeViewer`/`_closeGrocyRecipeViewer` all call `_resetScreenSaverIdleTimer()` so opening a recipe clears any pending countdown and closing it re-arms a fresh one, rather than just gating `_showScreenSaver` at fire time. Covered by `test_screensaver_card.js` (new) and `test_screensaver_recipe_disable.js` (new).
- **v105 (1.72.1)**: Moved Grocy's household "Include in Daily Digest" toggles (expiring items / low stock) from the General tab's Grocy accordion onto the Notifications tab, next to the per-person Grocy digest-section checkboxes they gate the visibility of - frontend-only, no backend/schema change (same `grocyExpiringDigestEnabled`/`grocyLowStockDigestEnabled` fields, just read from a different DOM location via `_syncGrocyNotifyVisibility`/`_grocyFeatureLiveEnabled`, which also made that visibility react live to the Track toggles instead of only after Save+reopen).
- **v104 (1.72.0)**: Reworked notifications from a flat, household-wide override table to per-user subscription profiles (see the dedicated architecture section above), plus a Settings modal overhaul into a wider, tabbed layout (General / Notifications). One-time automatic migration of existing overrides into starting profiles; old system kept intact as migration source + legacy Configure-flow display, never deleted.
- **v98 (1.66.0)**: Fixed "bell pepper" fuzzy-matching an existing "Black Pepper" spice product (added `_pepper_kind` vegetable-vs-spice disambiguation guard). Fixed a quantity range ("1-2", "3-4") resolving to its upper bound instead of failing to parse (was defaulting "Don't count toward stock" to checked for very ordinary countable ingredients like "1-2 russet potatoes"). Both fixed in `_parse_quantity_token`/`_parseQuantityToken` (kept in sync between backend and card) and the matching loop in `_ws_match_recipe_ingredients`.
- **v97 (1.65.0)**: Fixed short seasoning words ("Salt", "pepper" — left over after the v96 split) not matching an already-existing, more-specifically-named real Grocy product (`_whole_word_product_match`). Fixed doubly-HTML-escaped ingredient text (`&amp;amp;`) garbling the split (`_fully_unescape_html`).
- **v96 (1.64.0)**: The "Salt and Pepper Problem" — combined ingredient lines like "Salt and freshly ground black pepper" or "salt & pepper, to taste" now split into two independently-matchable lines (`_split_combined_salt_pepper_line`), for both the link-import and paste-in-text import paths (they converge on the single `_ws_match_recipe_ingredients` websocket handler, which is why the fix lives there).
- **v95 (1.63.0)**: Packaged for GitHub/HACS distribution — `custom_components/family_hub/` layout, `hacs.json`, GPLv3 `LICENSE` ("Bordello Labs"), de-emphasized the Theme Builder panel in docs (still ships, still registers, just not a documented beta feature).
- **v94 (1.62.0)**: Retired the standalone Meal Suggestions modal entirely — suggestions are now just Recipe Box entries filtered to "💡 Suggested"; the Recipe Box (`_openLoved`/`_selectLovedDish`/`_openDishDetail`) is now the single unified browse/pick surface for meals, replacing several older, now-dead code paths (`_selectSuggestion`, `.suggestions-overlay`, etc. — if you see references to those in an old test or comment, they're stale).

For anything older than v94, the README's own `## Changelog` section (bottom of the file) has the full history back through v1 — it's more complete and better-maintained than trying to keep a second copy of it here.

## Known pending / open items

- **HACS repo owner/name discrepancy** (see above) — needs the user to confirm the real repo.
- **HACS~1.JSO / GITIGN~1 short-filename mangling on the live GitHub repo** (v181/1.132.11) — CONFIRMED STILL PRESENT via a live check of `github.com/JVarhol/HA-Family-Hub` on `main`. This is almost certainly the actual cause of the household's "version 1.132.9 ... can not be used with HACS" report. Local source's own `hacs.json` was also fixed (was stale card-manifest content) and `manifest.json` gained the missing `issue_tracker` key, and v1.132.11 zips were rebuilt/delivered with both fixes - but the household still needs to push a corrected `hacs.json`/`.gitignore` (proper filenames) to their actual GitHub repo themselves; I have no push access. Re-check with the household whether this got pushed before re-diagnosing a future HACS complaint from scratch.
- **GitHub Release tagging** — needs the user to confirm they've been cutting a matching release per version bump; not verifiable from this session.
- **`test_servings_scaling.js` date rot** — cosmetic test-only issue, not a real bug, described above.
- There's a stray old task titled "Merge Grocery List into Shopping List as a tab" that looks superseded — that merge was actually completed under later, more specific work (shipped in v93, "Merge Grocy List + Shopping List into one tab; fix missing Put Away mode"). Treat that item as done/stale, not outstanding, unless the user says otherwise.
- Longstanding, never-reprioritized items from the README's own "To Do / Ideas" list: editing/deleting existing calendar events, drag-to-reorder meals in Month view, and eventually submitting to HACS's official default store (distinct from the custom-repository setup already done).

## If the user reports a new ingredient-matching bug

This has been the most active area recently and will likely keep generating reports as the user imports more real recipes. The pattern that's worked well:
1. Get the exact ingredient text and the exact real Grocy product name(s) involved from the user (screenshots have been the norm).
2. Reproduce the false match/miss with `difflib.SequenceMatcher(...).ratio()` in a scratch Python snippet before writing any fix, to confirm the actual numeric cause (as opposed to guessing).
3. Add a narrow, well-commented guard or fallback tier in `_ws_match_recipe_ingredients` (see the sequence of fixes there for the pattern), never a broad rewrite of `_best_text_match`'s cutoff/algorithm itself — that function is shared by other things (unit matching) and past attempts to "fix" it broadly have caused regressions elsewhere.
4. Write both a direct unit test of the new helper and an end-to-end test through `_ws_match_recipe_ingredients` reproducing the household's exact scenario.
5. Full test sweep, sync, version bump, README changelog entry, repackage both zips, deliver.
