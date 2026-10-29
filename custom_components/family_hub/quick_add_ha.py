"""Quick Add, the Home Assistant side: who and what Family Hub knows about
(the parser's context), saving each kind of item the same way its own card does,
the websocket commands behind the More menu's Quick Add box, the
family_hub.quick_add action, and Assist (chat and voice) sentences.

The parser itself (quick_add.py) knows nothing about Home Assistant.
"""
from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import date, datetime, time, timedelta
from typing import Any, Optional

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from . import chore_engine, quick_add, reward_engine
from . import chores_websocket_api as chores_ws
from .const import (
    CONF_MEAL_PLAN_ENTITY,
    CONF_REMINDERS_ENTITY,
    DEFAULT_REMINDERS_ENTITY,
    DOMAIN,
    PERMISSION_ASSIGN,
    PERMISSION_EDIT_MENU,
)

_LOGGER = logging.getLogger(__name__)

CALENDAR_CREATE_EVENT = 1  # CalendarEntityFeature.CREATE_EVENT
DEFAULT_MEAL_PLAN_ENTITY = "todo.meal_plan"
DEFAULT_EVENT_MINUTES = 60
DEFAULT_CHORE_TIME = time(18, 0)
# Family Hub's own lists that aren't shopping/to-do lists people add things to
INTERNAL_LIST_HINTS = ("meal_plan", "recipe_box", "meal_suggestions", "meal_plan_templates", "family_calendar_settings", "family_hub_chores")


class QuickAddError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def _entry():
    from . import _get_family_hub_entry, _get_family_hub_entry_data  # late import: avoids a circular import

    return _get_family_hub_entry, _get_family_hub_entry_data


def _is_holiday_row(row: dict[str, Any]) -> bool:
    if isinstance(row.get("holiday"), bool):
        return row["holiday"]
    return bool(re.search(r"holiday", f"{row.get('entity', '')} {row.get('name', '')}", re.I))


async def build_context(hass: HomeAssistant, entry_data: dict[str, Any], user_id: Optional[str]) -> dict[str, Any]:
    """Everything the parser needs, from the household's Settings and Home Assistant."""
    settings = await chores_ws._load_settings(entry_data)
    profiles = settings.get("userProfiles") if isinstance(settings.get("userProfiles"), dict) else {}
    member_ids = [str(u) for u in (settings.get("memberUserIds") or []) if str(u).strip()]
    rows = [r for r in (settings.get("people") or []) if isinstance(r, dict) and r.get("entity")]
    try:
        users = await hass.auth.async_get_users()
        names = {u.id: (u.name or u.id) for u in users if not getattr(u, "system_generated", False)}
    except Exception:  # noqa: BLE001 - a missing name just means fewer ways to match someone
        names = {}
    rows_by_entity = {r["entity"]: r for r in rows}
    people: list[dict[str, Any]] = []
    claimed: set[str] = set()
    for uid in member_ids:
        prof = profiles.get(uid) if isinstance(profiles.get(uid), dict) else {}
        if prof.get("isKioskAccount"):
            continue
        cal = prof.get("primaryCalendar") if isinstance(prof.get("primaryCalendar"), str) else ""
        row = rows_by_entity.get(cal) or {}
        name = names.get(uid) or row.get("name") or uid
        aliases = [n for n in {row.get("name") or "", names.get(uid) or ""} if n and n != name]
        people.append({
            "name": name, "aliases": aliases, "user_id": uid, "calendar": cal or None,
            "reminders": (prof.get("remindersEntity") or "").strip() or row.get("remindersEntity") or None,
        })
        if cal:
            claimed.add(cal)
    calendars: list[dict[str, Any]] = []
    for r in rows:
        if _is_holiday_row(r):
            continue
        calendars.append({"entity": r["entity"], "name": r.get("name") or r["entity"]})
        if r["entity"] not in claimed and r.get("name"):
            # a calendar row with nobody's login (a younger child, "Family") still counts as a who
            people.append({"name": r["name"], "aliases": [], "user_id": None, "calendar": r["entity"],
                           "reminders": r.get("remindersEntity") or None})
    lists: list[dict[str, Any]] = []
    for st in hass.states.async_all("todo"):
        eid = st.entity_id
        if any(h in eid for h in INTERNAL_LIST_HINTS) or eid.endswith("_chores"):
            continue
        lists.append({"entity": eid, "name": st.attributes.get("friendly_name") or eid.split(".", 1)[1].replace("_", " ")})
    blocks = settings.get("blocks") if isinstance(settings.get("blocks"), list) else None
    speaker = next((p for p in people if user_id and p.get("user_id") == user_id), None)
    return {
        "now": dt_util.now().replace(tzinfo=None),
        "people": people,
        "speaker": speaker,
        "lists": lists,
        "calendars": calendars,
        "blocks": [b for b in (blocks or quick_add.DEFAULT_BLOCKS) if isinstance(b, str)],
        "_settings": settings,
    }


def _writable_calendar(hass: HomeAssistant, entity: Optional[str]) -> bool:
    st = hass.states.get(entity) if entity else None
    return bool(st and (int(st.attributes.get("supported_features") or 0) & CALENDAR_CREATE_EVENT))


def resolve(hass: HomeAssistant, parsed: dict[str, Any], ctx: dict[str, Any], options: dict[str, Any]) -> dict[str, Any]:
    """Fill in where it goes: which calendar, which list, who gets the chore."""
    p = dict(parsed)
    kind = p.get("kind")
    people = p.get("people") or []
    speaker = ctx.get("speaker")
    settings = ctx.get("_settings") or {}
    if kind == quick_add.KIND_EVENT:
        cal = p.get("calendar")
        if not cal:
            for person in people + ([speaker] if speaker and not people else []):
                if person and person.get("calendar") and _writable_calendar(hass, person["calendar"]):
                    cal = next((c for c in ctx["calendars"] if c["entity"] == person["calendar"]), None) or {
                        "entity": person["calendar"], "name": person.get("name")}
                    if cal.get("name") != person.get("name"):
                        cal = {"entity": cal["entity"], "name": person.get("name")}
                    break
        if not cal:
            claimed = {x.get("calendar") for x in ctx["people"] if x.get("user_id")}
            shared = [c for c in ctx["calendars"] if c["entity"] not in claimed and _writable_calendar(hass, c["entity"])]
            anyw = [c for c in ctx["calendars"] if _writable_calendar(hass, c["entity"])]
            cal = (shared or anyw or [None])[0]
        p["calendar"] = cal
        if not cal:
            p["problems"] = list(p.get("problems") or []) + ["no_calendar"]
    elif kind == quick_add.KIND_REMINDER:
        target = None
        for person in people:
            if person.get("reminders"):
                target = {"entity": person["reminders"], "name": f"{person['name']}'s reminders"}
                break
        if not target:
            fam = options.get(CONF_REMINDERS_ENTITY) or DEFAULT_REMINDERS_ENTITY
            target = {"entity": fam, "name": "Family Reminders"}
        p["list"] = target
    elif kind == quick_add.KIND_MEAL:
        entity = (settings.get("mealPlanEntity") or "").strip() or options.get(CONF_MEAL_PLAN_ENTITY) or DEFAULT_MEAL_PLAN_ENTITY
        p["list"] = {"entity": entity, "name": "Meal plan"}
        if not p.get("date"):
            p["date"] = ctx["now"].date().isoformat()
    elif kind == quick_add.KIND_CHORE:
        assignee = next((x for x in people if x.get("user_id")), None)
        p["assignee"] = assignee
        if people and not assignee:
            p["problems"] = list(p.get("problems") or []) + ["chore_needs_login"]
    return p


def _date(p: dict[str, Any], ctx: dict[str, Any]) -> date:
    return date.fromisoformat(p["date"]) if p.get("date") else ctx["now"].date()


def _hm(s: str) -> time:
    h, m = (int(x) for x in s.split(":"))
    return time(h, m)


def summary(p: dict[str, Any], ctx: dict[str, Any]) -> str:
    return quick_add.describe(p, ctx["now"].date(), ctx.get("blocks"))


PROBLEM_TEXT = {
    "empty": "Type what to add.",
    "no_title": "What should it be called?",
    "no_list": "Which list? Say \"to\" and the list's name, like \"add milk to Groceries\".",
    "no_stars": "How many stars? Like \"reward movie night 30 stars\".",
    "no_calendar": "There's no calendar to add it to. Add one under Settings > Calendars first.",
    "chore_needs_login": "Chores can only go to someone with a Home Assistant login.",
}


async def apply(hass: HomeAssistant, entry_data: dict[str, Any], p: dict[str, Any], ctx: dict[str, Any],
                user_id: Optional[str], is_admin: bool) -> dict[str, Any]:
    """Save one resolved item. Returns {ok, kind, message}. Uses the same permissions as the cards."""
    problems = [x for x in (p.get("problems") or []) if x in PROBLEM_TEXT]
    if problems:
        raise QuickAddError(problems[0], PROBLEM_TEXT[problems[0]])
    kind = p.get("kind")
    say = summary(p, ctx)
    d = _date(p, ctx)

    if kind == quick_add.KIND_EVENT:
        cal = p["calendar"]["entity"]
        data: dict[str, Any] = {"summary": p["title"]}
        extra = [x for x in (p.get("people") or []) if x.get("calendar") and x.get("calendar") != cal]
        if extra:
            # the calendar's own #Name tags put it on everyone else's calendar too
            data["description"] = " ".join("#" + re.sub(r"\s+", "", x["name"]) for x in extra)
        if p.get("time"):
            start = datetime.combine(d, _hm(p["time"]))
            end = datetime.combine(d, _hm(p["end_time"])) if p.get("end_time") else start + timedelta(minutes=DEFAULT_EVENT_MINUTES)
            if end <= start:
                end += timedelta(days=1)
            data["start_date_time"] = start.strftime("%Y-%m-%d %H:%M:%S")
            data["end_date_time"] = end.strftime("%Y-%m-%d %H:%M:%S")
        else:
            data["start_date"] = d.isoformat()
            data["end_date"] = (d + timedelta(days=1)).isoformat()
        if p.get("repeat"):
            from homeassistant.components.calendar import DATA_COMPONENT
            from . import _build_entity_event_fields

            entity = hass.data[DATA_COMPONENT].get_entity(cal)
            if entity is None:
                raise QuickAddError("not_found", "That calendar isn't available right now.")
            await entity.async_create_event(**_build_entity_event_fields({**data, "rrule": p["repeat"]}))
        else:
            await hass.services.async_call("calendar", "create_event", {"entity_id": cal, **data}, blocking=True)
        return {"ok": True, "kind": kind, "message": f"Added {say}."}

    if kind == quick_add.KIND_REMINDER:
        entity = p["list"]["entity"]
        if not hass.states.get(entity):
            raise QuickAddError("not_found", f"The reminders list {entity} doesn't exist yet.")
        data = {"entity_id": entity, "item": p["title"]}
        if p.get("time"):
            data["due_datetime"] = datetime.combine(d, _hm(p["time"])).strftime("%Y-%m-%d %H:%M:%S")
        else:
            data["due_date"] = d.isoformat()
        if p.get("repeat"):
            data["description"] = f"<!--repeat:{p['repeat']}-->"
        await hass.services.async_call("todo", "add_item", data, blocking=True)
        return {"ok": True, "kind": kind, "message": f"Added {say[0].lower() + say[1:]}."}

    if kind == quick_add.KIND_MEAL:
        block = int(p.get("block") or 0)
        date_key = d.isoformat()
        if chores_ws._has_permission_ctx(entry_data, user_id, is_admin, PERMISSION_EDIT_MENU):
            await _write_meal(hass, p["list"]["entity"], date_key, block, p["title"])
            return {"ok": True, "kind": kind, "message": f"Added {say}."}
        from . import _load_menu_suggestions, _save_menu_suggestions

        suggestions = await _load_menu_suggestions(entry_data)
        speaker = ctx.get("speaker") or {}
        suggestions.append({
            "uid": uuid.uuid4().hex, "date_key": date_key, "block_index": block, "name": p["title"],
            "description": "", "link": "", "grocy_recipe_id": None, "servings": None,
            "suggested_by": user_id, "suggested_by_name": speaker.get("name") or "Quick Add",
            "created_at": dt_util.utcnow().isoformat(),
        })
        await _save_menu_suggestions(entry_data, suggestions)
        return {"ok": True, "kind": kind, "suggested": True,
                "message": f"Suggested {say}. Someone who can edit the menu will decide."}

    if kind == quick_add.KIND_CHORE:
        if not chores_ws._has_permission_ctx(entry_data, user_id, is_admin, PERMISSION_ASSIGN):
            raise QuickAddError("forbidden", "Only an admin, or someone who can assign chores, can add chores.")
        assignee = p.get("assignee")
        payload: dict[str, Any] = {
            "title": p["title"],
            "star_value": int(p.get("stars") or 0),
            "assignment_mode": "direct" if assignee else "chore_bin",
            "assigned_to": assignee["user_id"] if assignee else "chore_bin",
        }
        if p.get("date"):
            local = datetime.combine(d, _hm(p["time"]) if p.get("time") else DEFAULT_CHORE_TIME)
            payload["due_date"] = dt_util.as_utc(local.replace(tzinfo=dt_util.get_default_time_zone())).isoformat()
        rule = p.get("repeat") or ""
        if rule.startswith("FREQ=DAILY"):
            payload.update({"recur_type": "interval", "recur_interval_days": 1, "recur_interval_unit": "days"})
        elif rule.startswith("FREQ=WEEKLY") and "BYDAY=" in rule:
            days = [quick_add.RRULE_DAYS.index(c) for c in rule.split("BYDAY=")[1].split(";")[0].split(",") if c in quick_add.RRULE_DAYS]
            payload.update({"recur_type": "weekdays", "recur_weekdays": days})
        elif rule.startswith("FREQ=WEEKLY"):
            payload.update({"recur_type": "interval", "recur_interval_days": 2 if "INTERVAL=2" in rule else 1, "recur_interval_unit": "weeks"})
        elif rule.startswith("FREQ=MONTHLY"):
            payload.update({"recur_type": "interval", "recur_interval_days": 1, "recur_interval_unit": "months"})
        settings = ctx.get("_settings") or {}
        try:
            chore_engine.create_chore(
                entry_data["chores"], hass, payload, await chores_ws._make_is_chores_eligible(entry_data))
        except chore_engine.ChoreError as err:
            raise QuickAddError(err.code if hasattr(err, "code") else "invalid", str(err)) from err
        await chores_ws._save_chores(hass, entry_data)
        return {"ok": True, "kind": kind, "message": f"Added {say[0].lower() + say[1:]}."}

    if kind == quick_add.KIND_REWARD:
        if chores_ws._can_add_rewards_ctx(entry_data, user_id, is_admin):
            reward_engine.add_catalog_item(entry_data["rewards"], p["title"], int(p.get("stars") or 0))
            await chores_ws._save_rewards(hass, entry_data)
            return {"ok": True, "kind": kind, "message": f"Added {say[0].lower() + say[1:]} to the catalog."}
        if not user_id:
            raise QuickAddError("forbidden", "Rewards need someone signed in.")
        reward_engine.add_suggestion(entry_data["rewards"], user_id, p["title"])
        await chores_ws._save_rewards(hass, entry_data)
        return {"ok": True, "kind": kind, "suggested": True,
                "message": f"Suggested the reward {p['title']}. Someone who can add rewards will set its price."}

    if kind == quick_add.KIND_LIST_ITEM:
        entity = p["list"]["entity"]
        data = {"entity_id": entity, "item": p["title"]}
        st = hass.states.get(entity)
        if p.get("date") and st and int(st.attributes.get("supported_features") or 0) & 16:
            data["due_date"] = p["date"]
        await hass.services.async_call("todo", "add_item", data, blocking=True)
        return {"ok": True, "kind": kind, "message": f"Added {say}."}

    raise QuickAddError("unknown", "Couldn't tell what to add.")


async def _write_meal(hass: HomeAssistant, entity: str, date_key: str, block: int, name: str) -> None:
    """Put a dish on the meal plan for one day and slot, replacing what's there - same format the calendar card writes."""
    from . import _encode_dish_description

    if not hass.states.get(entity):
        raise QuickAddError("not_found", "There's no meal plan list yet. Open Settings > Menu Blocks on the calendar to set one up.")
    payload = _encode_dish_description(description="", link="", color="", block_index=block)
    existing_uid = None
    try:
        response = await hass.services.async_call(
            "todo", "get_items", {"entity_id": entity, "status": ["needs_action", "completed"]},
            blocking=True, return_response=True)
        for item in ((response or {}).get(entity) or {}).get("items", []) or []:
            if str(item.get("due") or "")[:10] != date_key:
                continue
            try:
                parsed = json.loads(item.get("description") or "{}")
            except (ValueError, TypeError):
                parsed = {}
            if isinstance(parsed, dict) and int(parsed.get("block") or 0) == block and not parsed.get("recur"):
                existing_uid = item.get("uid")
                break
    except Exception as err:  # noqa: BLE001 - a list we can't read just means "add a new item"
        _LOGGER.debug("Family Hub Quick Add: couldn't read %s: %s", entity, err)
    if existing_uid:
        await hass.services.async_call("todo", "update_item", {
            "entity_id": entity, "item": existing_uid, "rename": name, "description": payload, "due_date": date_key}, blocking=True)
    else:
        await hass.services.async_call("todo", "add_item", {
            "entity_id": entity, "item": name, "description": payload, "due_date": date_key}, blocking=True)


async def run(hass: HomeAssistant, text: str, user_id: Optional[str], is_admin: bool,
              force_kind: Optional[str] = None, dry_run: bool = False) -> dict[str, Any]:
    """Parse, resolve and (unless dry_run) save. Returns {ok, kind, message, summary, item, problems}."""
    get_entry, get_entry_data = _entry()
    entry_data = get_entry_data(hass)
    entry = get_entry(hass)
    if entry_data is None:
        raise QuickAddError("not_found", "Family Hub is not set up.")
    ctx = await build_context(hass, entry_data, user_id)
    text = (text or "").strip()
    if force_kind in quick_add.KINDS:
        prefix = {"list_item": "list", "event": "event"}.get(force_kind, force_kind)
        if not re.match(rf"^{prefix}\s*:", text, re.I):
            text = f"{prefix}: {text}"
    parsed = quick_add.parse(text, ctx)
    item = resolve(hass, parsed, ctx, dict(entry.options) if entry else {})
    problems = [x for x in (item.get("problems") or []) if x in PROBLEM_TEXT]
    result: dict[str, Any] = {
        "kind": item.get("kind"),
        "summary": summary(item, ctx) if item.get("title") else "",
        "item": _public(item),
        "problems": [{"code": x, "message": PROBLEM_TEXT[x]} for x in problems],
        "note": _permission_note(entry_data, item, user_id, is_admin),
    }
    if dry_run:
        result["ok"] = not problems
        return result
    applied = await apply(hass, entry_data, item, ctx, user_id, is_admin)
    result.update(applied)
    return result


def _permission_note(entry_data: dict[str, Any], item: dict[str, Any], user_id: Optional[str], is_admin: bool) -> str:
    kind = item.get("kind")
    if kind == quick_add.KIND_MEAL and not chores_ws._has_permission_ctx(entry_data, user_id, is_admin, PERMISSION_EDIT_MENU):
        return "This will be a suggestion: someone who can edit the menu decides."
    if kind == quick_add.KIND_REWARD and not chores_ws._can_add_rewards_ctx(entry_data, user_id, is_admin):
        return "This will be a suggestion: someone who can add rewards sets the price."
    if kind == quick_add.KIND_CHORE and not chores_ws._has_permission_ctx(entry_data, user_id, is_admin, PERMISSION_ASSIGN):
        return "You can't add chores. Ask someone who can assign chores."
    return ""


def _public(item: dict[str, Any]) -> dict[str, Any]:
    """What the card needs to show the preview (no internal fields)"""
    keep = ("kind", "title", "date", "time", "end_time", "stars", "repeat", "block")
    out = {k: item.get(k) for k in keep}
    out["people"] = [x.get("name") for x in item.get("people") or []]
    for k in ("calendar", "list"):
        v = item.get(k)
        out[k] = {"entity": v.get("entity"), "name": v.get("name")} if isinstance(v, dict) else None
    a = item.get("assignee")
    out["assignee"] = a.get("name") if isinstance(a, dict) else None
    return out


# ------------------------------------------------------------------ websocket + action

@websocket_api.websocket_command({vol.Required("type"): "family_hub/quick_add/parse", vol.Required("text"): str,
                                  vol.Optional("kind"): vol.In(quick_add.KINDS)})
@websocket_api.async_response
async def ws_parse(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Preview: what this line would add, and where. Saves nothing."""
    try:
        result = await run(hass, msg["text"], chores_ws._actor_id(connection), chores_ws._is_admin(connection),
                           force_kind=msg.get("kind"), dry_run=True)
    except QuickAddError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command({vol.Required("type"): "family_hub/quick_add/add", vol.Required("text"): str,
                                  vol.Optional("kind"): vol.In(quick_add.KINDS)})
@websocket_api.async_response
async def ws_add(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Parse the line again on the server (nothing about the item is trusted from the client) and save it."""
    try:
        result = await run(hass, msg["text"], chores_ws._actor_id(connection), chores_ws._is_admin(connection),
                           force_kind=msg.get("kind"))
    except QuickAddError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    except Exception as err:  # noqa: BLE001 - surfaced to the person as-is
        _LOGGER.warning("Family Hub Quick Add failed for %r: %s", msg.get("text"), err)
        connection.send_error(msg["id"], "failed", f"Couldn't add that: {err}")
        return
    connection.send_result(msg["id"], result)


async def _user_is_admin(hass: HomeAssistant, user_id: Optional[str]) -> bool:
    if not user_id:
        return False
    try:
        user = await hass.auth.async_get_user(user_id)
    except Exception:  # noqa: BLE001
        return False
    return bool(user and user.is_admin)


async def say(hass: HomeAssistant, text: str, user_id: Optional[str]) -> str:
    """Run one line for Assist or the action and return what to say back."""
    try:
        result = await run(hass, text, user_id, await _user_is_admin(hass, user_id))
        return result.get("message") or "Done."
    except QuickAddError as err:
        return str(err)
    except Exception as err:  # noqa: BLE001
        _LOGGER.warning("Family Hub Quick Add failed for %r: %s", text, err)
        return "Sorry, I couldn't add that."


def register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_parse)
    websocket_api.async_register_command(hass, ws_add)
    if not hass.services.has_service(DOMAIN, "quick_add"):
        from homeassistant.core import ServiceCall

        try:
            from homeassistant.core import SupportsResponse

            response_kw: dict[str, Any] = {"supports_response": SupportsResponse.OPTIONAL}
        except ImportError:  # very old Home Assistant: the action still works, it just can't return the message
            response_kw = {}

        async def _handle(call: ServiceCall) -> dict[str, Any]:
            caller = getattr(call.context, "user_id", None)
            user_id = caller
            # acting as someone else is only for automations (no caller) and admins - never a way around permissions
            if call.data.get("user_id") and (caller is None or await _user_is_admin(hass, caller)):
                user_id = call.data["user_id"]
            message = await say(hass, str(call.data.get("text") or ""), user_id)
            return {"message": message}

        async def _handle_ask(call: ServiceCall) -> dict[str, Any]:
            caller = getattr(call.context, "user_id", None)
            user_id = caller
            if call.data.get("user_id") and (caller is None or await _user_is_admin(hass, caller)):
                user_id = call.data["user_id"]
            return {"answer": await answer(hass, str(call.data.get("question") or ""), user_id)}

        hass.services.async_register(
            DOMAIN, "ask", _handle_ask,
            schema=vol.Schema({vol.Required("question"): str, vol.Optional("user_id"): str}),
            **response_kw,
        )
        hass.services.async_register(
            DOMAIN, "quick_add", _handle,
            schema=vol.Schema({vol.Required("text"): str, vol.Optional("user_id"): str}),
            **response_kw,
        )


# ------------------------------------------------------------------ Assist (chat and voice)

# Each sentence's {text} is the rest of what was said; the prefix puts back the words the sentence itself used up.
ASSIST_SENTENCES: list[tuple[list[str], str]] = [
    (["quick add {text}", "family hub [add] {text}"], ""),
    (["add {text} to [the|my|our] calendar", "put {text} on [the|my|our] calendar", "add [an] event {text}",
      # "add trick or treating to my calendar saturday at 6": the when can come after the calendar too
      "add {text} to [the|my|our] calendar {when}", "put {text} on [the|my|our] calendar {when}",
      "add {text} (to|on) [the] {cal} calendar", "add {text} (to|on) [the] {cal} calendar {when}",
      "put {text} on [the] {cal} calendar", "put {text} on [the] {cal} calendar {when}",
      "add {text} to my schedule", "add {text} to my schedule {when}", "put {text} on my schedule", "put {text} on my schedule {when}",
      "schedule {text}", "(book|set up) [an|a] (appointment|event) [for] {text}"], "event: "),
    (["remind me (to|about|that) {text}", "i need to remember (to|about|that) {text}", "(don't|do not) let me forget (to|about|that) {text}",
      "help me remember (to|about|that) {text}"], "remind me to "),
    (["remind {text}"], "remind "),
    (["add [a] reminder {text}", "set [a] reminder {text}",
      # "add call the dentist to my reminders [tomorrow]", "add pack gym bag to Emma's reminders"
      "add {text} to [the|our] reminders [list]", "add {text} to [the|our] reminders [list] {when}",
      "add {text} to {who} reminders [list]", "add {text} to {who} reminders [list] {when}"], "reminder: "),
    (["add [a] chore {text}", "new chore {text}", "create [a] chore {text}",
      # "add take out the trash to my chores", "add feed the cat to Emma's chores tomorrow", "add sweep to the chore bin"
      "add {text} to [the|our] (chores|chore list) [list]", "add {text} to [the|our] (chores|chore list) [list] {when}",
      "add {text} to {who} (chores|chore list) [list]", "add {text} to {who} (chores|chore list) [list] {when}",
      "add {text} to [the] chore bin", "add {text} to [the] chore bin {when}",
      "give {who} a chore {text}", "give {who} the chore [of] {text}"], "chore: "),
    (["add [a] reward {text}", "new reward {text}", "create [a] reward {text}",
      "add {text} to [the] (rewards|reward catalog|reward list) [list]"], "reward: "),
    (["plan {text}", "add {text} for (breakfast|lunch|dinner|supper)", "add {text} for (breakfast|lunch|dinner|supper) {when}",
      "we're having {text}", "we are having {text}", "we'll have {text} for (breakfast|lunch|dinner|supper) [{when}]",
      "(make|cook|making|cooking) {text} for (breakfast|lunch|dinner|supper)", "(make|cook|making|cooking) {text} for (breakfast|lunch|dinner|supper) {when}"], ""),
]


# People talk to Assist politely: "can you remind me to ...", "please add ... to my chores", "hey, what's for dinner".
# Every sentence also matches with these in front (and "please" / "for me" ... at the end handled by Quick Add itself).
_POLITE_START = "[(hey|hi|ok|okay|so)] [(can|could|would|will) you] [please] [(go ahead and|just)]"
_ASK_START = "[(hey|hi|ok|okay|so)] [(can|could|would|will) you] [please] [(tell me|let me know|remind me)]"


def _polite(sentences: list[str], start: str = _POLITE_START) -> list[str]:
    return [f"{start} {s} [please]" for s in sentences]


def register_assist(hass: HomeAssistant) -> list:
    """Teach Home Assistant's built-in Assist agent the Quick Add sentences. Returns the unregister callbacks.
    Works for the Assist chat and voice alike; an LLM pipeline needs "Prefer handling commands locally" on."""
    try:
        from homeassistant.components.conversation.agent_manager import get_agent_manager
    except Exception as err:  # noqa: BLE001 - an older or newer Home Assistant without this API
        _LOGGER.info("Family Hub: Assist sentences not available on this Home Assistant (%s)", err)
        return []
    manager = get_agent_manager(hass)
    unregisters = list(register_ask(hass))
    for sentences, prefix in ASSIST_SENTENCES:
        async def _callback(user_input, result, _prefix=prefix):
            ents = getattr(result, "entities", None) or {}
            ent = ents.get("text")
            spoken = (ent.text if ent is not None else "").strip()
            whole = getattr(user_input, "text", "") or ""
            if _prefix == "" and re.search(r"\bfor\s+(breakfast|lunch|dinner|supper)\b", whole, re.I) and not spoken.lower().startswith("quick"):
                # "add tacos for dinner Friday": keep the meal words, drop the leading verb
                spoken = re.sub(r"^\s*(?:(?:hey|hi|ok|okay|so)\b[\s,]*)?(?:(?:can|could|would|will) you\s+)?(?:please\s+)?(?:go ahead and\s+|just\s+)?"
                                r"(?:add|plan|make|cook|making|cooking|we'll have)\s+", "", whole, flags=re.I)
            else:
                cal = ents.get("cal")
                if cal is not None and (cal.text or "").strip().lower() not in ("", "my", "our", "the"):
                    # "add soccer to the family calendar" - Quick Add reads "on the family calendar" itself
                    spoken += f" on the {cal.text.strip()} calendar"
                who = ents.get("who")
                who_text = re.sub(r"'s$|s'$", "", (who.text if who is not None else "") or "").strip()
                if who_text and who_text.lower() not in ("the", "our"):
                    # "to my chores" -> for me; "to Emma's chores" -> for Emma (Quick Add drops a stray "s" itself)
                    spoken += " for me" if who_text.lower() in ("my", "me", "mine") else f" for {who_text}"
                when = ents.get("when")
                if when is not None and (when.text or "").strip():
                    # "add trick or treating to my calendar saturday at 6"
                    spoken += " " + when.text.strip()
            spoken = re.sub(r"[\s,]+please[.!?]*\s*$", "", spoken, flags=re.I).strip(" ?!.")
            context = getattr(user_input, "context", None)
            return await say(hass, _prefix + spoken, getattr(context, "user_id", None))

        try:
            unregisters.append(manager.register_trigger(_polite(sentences), _callback))
        except Exception as err:  # noqa: BLE001 - one bad sentence never stops the rest
            _LOGGER.warning("Family Hub: couldn't register Assist sentences %s: %s", sentences, err)
    return unregisters


# ------------------------------------------------------------------ questions ("What's for dinner?")

def _strip_markers(text: str) -> str:
    """event titles as people would say them: no <!--markers-->, no #tags"""
    t = re.sub(r"<!--.*?-->", "", text or "", flags=re.S)
    t = re.sub(r"(^|\s)#[\w']+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def _day_bounds(d: date) -> tuple[datetime, datetime]:
    tz = dt_util.get_default_time_zone()
    start = datetime.combine(d, time(0, 0)).replace(tzinfo=tz)
    return start, start + timedelta(days=1)


def _parse_when(value: Any) -> tuple[Optional[datetime], bool]:
    """(local datetime, all_day) for a calendar.get_events start/end value"""
    if isinstance(value, dict):
        value = value.get("dateTime") or value.get("date")
    s = str(value or "")
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return datetime.combine(date.fromisoformat(s), time(0, 0)), True
    try:
        dtv = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None, False
    if dtv.tzinfo is not None:
        dtv = dt_util.as_local(dtv).replace(tzinfo=None)
    return dtv, False


def _possessive(name: str) -> str:
    return f"{name}'" if name.endswith("s") else f"{name}'s"


def _day_phrase(d: str, today: date, *, meal: Optional[str] = None) -> str:
    """'today' / 'tonight' (dinner) / 'tomorrow' / 'Friday' ..."""
    words = quick_add.day_words(d, today)
    if meal and words == "today" and meal.lower() in ("dinner", "supper"):
        return "tonight"
    return words


async def _meal_answer(hass: HomeAssistant, ctx: dict[str, Any], options: dict[str, Any], q: dict[str, Any]) -> str:
    settings = ctx.get("_settings") or {}
    entity = (settings.get("mealPlanEntity") or "").strip() or options.get(CONF_MEAL_PLAN_ENTITY) or DEFAULT_MEAL_PLAN_ENTITY
    blocks = ctx.get("blocks") or quick_add.DEFAULT_BLOCKS
    block = int(q.get("block") or 0)
    block_name = blocks[block] if 0 <= block < len(blocks) else "dinner"
    today = ctx["now"].date()
    date_key = q["date"]
    when = _day_phrase(date_key, today, meal=block_name)
    if not hass.states.get(entity):
        return "There's no meal plan yet."
    response = await hass.services.async_call(
        "todo", "get_items", {"entity_id": entity, "status": ["needs_action", "completed"]}, blocking=True, return_response=True)
    items = ((response or {}).get(entity) or {}).get("items", []) or []
    explicit = None
    leftover = None
    recurring = None
    target = date.fromisoformat(date_key)
    for it in items:
        key = str(it.get("due") or "")[:10]
        if not key:
            continue
        try:
            parsed = json.loads(it.get("description") or "{}")
        except (ValueError, TypeError):
            parsed = {}
        if not isinstance(parsed, dict):
            parsed = {}
        if int(parsed.get("block") or 0) != block:
            continue
        name = it.get("summary") or ""
        cook = parsed.get("cook") or ""
        if key == date_key:
            explicit = (name, cook)
        lo_dates = [x for x in (parsed.get("leftoverDates") or []) if isinstance(x, str)]
        span = int(parsed.get("spanDays") or 1)
        if not lo_dates and span > 1:
            start = date.fromisoformat(key)
            lo_dates = [(start + timedelta(days=i)).isoformat() for i in range(1, span)]
        if date_key in lo_dates:
            leftover = (name, cook)
        if parsed.get("recur") == "weekly":
            anchor = date.fromisoformat(key)
            if anchor.weekday() == target.weekday() and key <= date_key and (recurring is None or key > recurring[2]):
                recurring = (name, cook, key)
    if explicit:
        name, cook, prefix = explicit[0], explicit[1], ""
    elif leftover:
        name, cook, prefix = leftover[0], leftover[1], "leftover "
    elif recurring:
        name, cook, prefix = recurring[0], recurring[1], ""
    else:
        return f"Nothing's planned for {block_name.lower()} {when} yet."
    if when in ("today", "tonight", "tomorrow"):
        head = {"today": "Today's", "tonight": "Tonight's", "tomorrow": "Tomorrow's"}[when]
    else:
        head = _possessive(when.split(",")[0])
    sentence = f"{head} {block_name.lower()} is {prefix}{name}."
    if cook:
        sentence += f" {cook} is cooking."
    return sentence


async def _calendar_answer(hass: HomeAssistant, entry_data: dict[str, Any], ctx: dict[str, Any], q: dict[str, Any]) -> str:
    settings = ctx.get("_settings") or {}
    if (entry_data.get("privacy_mode") or {}).get("enabled"):
        return "Privacy Mode is on, so I can't read the calendar out."
    if settings.get("discreetModeEnabled"):
        return "Discreet Mode is on, so I can't read the calendar out."
    today = ctx["now"].date()
    when = quick_add.day_words(q["date"], today)
    rows = [r for r in (settings.get("people") or []) if isinstance(r, dict) and r.get("entity")]
    holiday_rows = [r for r in rows if _is_holiday_row(r)]
    rows = [r for r in rows if not _is_holiday_row(r)]
    person = q.get("person")
    profiles = settings.get("userProfiles") if isinstance(settings.get("userProfiles"), dict) else {}
    if person:
        prof = profiles.get(person.get("user_id")) if person.get("user_id") else None
        own = {person.get("calendar")} | set((prof or {}).get("extraCalendars") or [])
        own.discard(None)
        entities = [r["entity"] for r in rows]
    else:
        own = set()
        entities = [r["entity"] for r in rows]
    entities = [e for e in entities if hass.states.get(e)]
    hol_entities = [r["entity"] for r in holiday_rows if hass.states.get(r["entity"])]
    if not entities and not hol_entities:
        return "There are no calendars to read yet."
    start, end = _day_bounds(date.fromisoformat(q["date"]))
    try:
        response = await hass.services.async_call(
            "calendar", "get_events",
            {"entity_id": entities + hol_entities, "start_date_time": start.isoformat(), "end_date_time": end.isoformat()},
            blocking=True, return_response=True)
    except Exception as err:  # noqa: BLE001
        _LOGGER.debug("Family Hub ask: couldn't read calendars: %s", err)
        return "Sorry, I couldn't read the calendar."
    names = {r["entity"]: r.get("name") or r["entity"] for r in rows}
    tag = re.sub(r"\s+", "", (person or {}).get("name") or "").lower()
    seen: set = set()
    by_cal: dict[str, list[tuple]] = {}
    holidays: list[str] = []
    for ent, payload in (response or {}).items():
        for ev in (payload or {}).get("events", []) or []:
            summary = _strip_markers(ev.get("summary") or "")
            if not summary:
                continue
            if ent in hol_entities:
                holidays.append(summary)
                continue
            if person:
                text = f"{ev.get('summary') or ''} {ev.get('description') or ''}".lower()
                tagged = bool(tag) and re.search(rf"#{re.escape(tag)}\b", text.replace(" ", "")) is not None
                if ent not in own and not tagged:
                    continue
            st, all_day = _parse_when(ev.get("start"))
            key = (summary.lower(), st)
            if key in seen:
                continue
            seen.add(key)
            by_cal.setdefault(ent, []).append((0 if all_day else 1, st, summary, all_day))
    lead = f"{quick_add.spoken_list(sorted(set(holidays)))}. " if holidays and not person else ""
    if lead:
        lead = ("It's " + lead) if when == "today" else (f"{when[0].upper() + when[1:]} is " + lead)

    def spoken(items):
        items.sort(key=lambda x: (x[0], x[1] or datetime.min))
        return quick_add.spoken_list([s if all_day or not st else f"{s} at {quick_add.time_words(st.strftime('%H:%M'))}" for _, st, s, all_day in items])

    if person:
        items = [x for lst in by_cal.values() for x in lst]
        if not items:
            return f"{person['name']} has nothing on the calendar {when}."
        return f"{when[0].upper() + when[1:]} {person['name']} has {spoken(items)}."
    if not by_cal:
        return lead + f"Nothing's on the calendar {when}."
    parts = []
    for ent in [r["entity"] for r in rows if r["entity"] in by_cal]:
        parts.append(f"{names.get(ent, ent)} has {spoken(by_cal[ent])}")
    return lead + f"{when[0].upper() + when[1:]}: " + ". ".join(parts) + "."


async def _reminders_answer(hass: HomeAssistant, entry_data: dict[str, Any], ctx: dict[str, Any], options: dict[str, Any], q: dict[str, Any]) -> str:
    if (entry_data.get("privacy_mode") or {}).get("enabled"):
        return "Privacy Mode is on, so I can't read reminders out."
    today = ctx["now"].date()
    when = quick_add.day_words(q["date"], today)
    person = q.get("person")
    me = bool(q.get("me"))
    family = options.get(CONF_REMINDERS_ENTITY) or DEFAULT_REMINDERS_ENTITY
    lists: list[str] = []
    if person and not me:
        # "what reminders does Emma have": just her own list
        if person.get("reminders"):
            lists.append(person["reminders"])
    else:
        # mine, or "any reminders": the family list plus the asker's own
        lists.append(family)
        speaker = ctx.get("speaker") or {}
        if speaker.get("reminders"):
            lists.append(speaker["reminders"])
    found = []
    for entity in dict.fromkeys(lists):
        if not hass.states.get(entity):
            continue
        response = await hass.services.async_call(
            "todo", "get_items", {"entity_id": entity, "status": ["needs_action"]}, blocking=True, return_response=True)
        for it in ((response or {}).get(entity) or {}).get("items", []) or []:
            due = str(it.get("due") or "")
            if due[:10] != q["date"]:
                continue
            st, all_day = _parse_when(due)
            found.append((None if all_day else st, it.get("summary") or ""))
    if person and not me:
        subject, verb = person["name"], "has"
    elif me:
        subject, verb = "You", "have"
    else:
        subject, verb = "", ""
    if not found:
        return f"{subject} {verb} no reminders {when}." if subject else f"No reminders {when}."
    found.sort(key=lambda x: (x[0] is not None, x[0] or datetime.min))
    items = [f"{s} at {quick_add.time_words(t.strftime('%H:%M'))}" if t else s for t, s in found]
    count = "1 reminder" if len(found) == 1 else f"{len(found)} reminders"
    if subject:
        return f"{subject} {verb} {count} {when}: {quick_add.spoken_list(items)}."
    return f"{count[0].upper() + count[1:]} {when}: {quick_add.spoken_list(items)}."


def _chores_answer(entry_data: dict[str, Any], ctx: dict[str, Any], q: dict[str, Any]) -> str:
    chores = [c for c in (entry_data.get("chores") or {}).values()
              if isinstance(c, dict) and c.get("status") == "open" and not c.get("star_request")]
    person = q.get("person")
    if q.get("me") and not person:
        return "I don't know who's asking. Ask in the Assist chat while signed in, or say a name."
    if person:
        if not person.get("user_id"):
            return f"{person['name']} doesn't have chores; chores go to people with a login."
        mine = [c for c in chores if c.get("assigned_to") == person["user_id"]]
        you = q.get("me")
        if not mine:
            return "You're all done!" if you else f"{person['name']} is all done!"
        titles = quick_add.spoken_list([c.get("title") or "" for c in sorted(mine, key=lambda c: (not c.get("important"), c.get("due_date") or "9"))])
        n = len(mine)
        what = "1 chore" if n == 1 else f"{n} chores"
        return f"You have {what} left: {titles}." if you else f"{person['name']} has {what} left: {titles}."
    names = {p["user_id"]: p["name"] for p in ctx.get("people") or [] if p.get("user_id")}
    counts: dict[str, int] = {}
    bin_count = 0
    for c in chores:
        uid = c.get("assigned_to")
        if uid in (None, "", "chore_bin"):
            bin_count += 1
        elif uid in names:
            counts[uid] = counts.get(uid, 0) + 1
    if not counts and not bin_count:
        return "All the chores are done!"
    parts = [f"{names[u]} has {n}" for u, n in counts.items()]
    if bin_count:
        parts.append(f"{bin_count} {'is' if bin_count == 1 else 'are'} in the Chore Bin")
    return quick_add.spoken_list(parts, limit=8) + "."


def _stars_answer(entry_data: dict[str, Any], q: dict[str, Any]) -> str:
    person = q.get("person")
    if not person:
        return "Whose stars? Say a name, or ask in the Assist chat while signed in."
    if not person.get("user_id"):
        return f"{person['name']} doesn't have stars; stars go to people with a login."
    bal = reward_engine.get_balance(entry_data.get("rewards") or {}, person["user_id"])
    star = "star" if abs(bal) == 1 else "stars"
    if q.get("me"):
        return f"You have {bal} {star}." if bal >= 0 else f"You owe {-bal} {star}."
    return f"{person['name']} has {bal} {star}." if bal >= 0 else f"{person['name']} owes {-bal} {star}."


async def answer(hass: HomeAssistant, text: str, user_id: Optional[str]) -> str:
    """Answer one question in a sentence: meals, the calendar, reminders, chores or stars."""
    get_entry, get_entry_data = _entry()
    entry_data = get_entry_data(hass)
    entry = get_entry(hass)
    if entry_data is None:
        return "Family Hub isn't set up."
    try:
        ctx = await build_context(hass, entry_data, user_id)
        q = quick_add.parse_question(text, ctx)
        options = dict(entry.options) if entry else {}
        topic = q.get("topic")
        if topic == quick_add.TOPIC_MEALS:
            return await _meal_answer(hass, ctx, options, q)
        if topic == quick_add.TOPIC_CALENDAR:
            return await _calendar_answer(hass, entry_data, ctx, q)
        if topic == quick_add.TOPIC_REMINDERS:
            return await _reminders_answer(hass, entry_data, ctx, options, q)
        if topic == quick_add.TOPIC_CHORES:
            return _chores_answer(entry_data, ctx, q)
        if topic == quick_add.TOPIC_STARS:
            return _stars_answer(entry_data, q)
    except Exception as err:  # noqa: BLE001
        _LOGGER.warning("Family Hub ask failed for %r: %s", text, err)
        return "Sorry, I couldn't look that up."
    return "Sorry, I can answer what's for dinner, what's on the calendar, reminders, chores and stars."


_WHAT = "(what's|what is|whats)"
_MEAL = "(breakfast|lunch|dinner|supper)"
ASK_SENTENCES: list[str] = [
    f"{_WHAT} for {_MEAL}", f"{_WHAT} for {_MEAL} {{day}}",
    f"what are we having for {_MEAL}", f"what are we having for {_MEAL} {{day}}",
    f"what are we eating for {_MEAL}", f"what are we eating for {_MEAL} {{day}}",
    f"{_WHAT} on [the|my|our] calendar", f"{_WHAT} on [the|my|our] calendar {{day}}",
    f"{_WHAT} (happening|going on) {{day}}", f"{_WHAT} [the] (schedule|agenda) [for] {{day}}",
    f"{_WHAT} on [the|my|our] (agenda|schedule)", f"{_WHAT} on [the|my|our] (agenda|schedule) {{day}}",
    f"{_WHAT} [(my|our)] (schedule|agenda)", f"{_WHAT} [(my|our)] (schedule|agenda) [for] {{day}}",
    "what do we have [going on] {day}", "what does my day look like", "what does {day} look like",
    f"{_WHAT} {{name}} doing", f"{_WHAT} {{name}} doing {{day}}",
    "what does {name} have", "what does {name} have {rest}", "what do i have", "what do i have {rest}",
    "[do i have] any reminders", "[do i have] any reminders {day}", "what reminders do i have", "what reminders do i have {day}",
    "what are my reminders", "what are [the] reminders [for] {day}",
    "what chores do i have [left]", "what chores does {name} have [left]", "what chores are left", f"{_WHAT} left for {{name}}",
    "what chores do i have {rest}", "what chores does {name} have {rest}", "what chores are left {rest}",
    "what are my chores", "what are my chores {rest}", "what are [the] chores", "what are [the] chores {rest}",
    "what are {name} chores", "what are {name} chores {rest}", "[do i have|have i got] any chores [left]", "does {name} have any chores [left]",
    "(list|tell me|read) my chores", "(list|tell me|read) {name} chores", "my chores", f"{_WHAT} on my chore list",
    "how many stars do i have", "how many stars does {name} have",
]


def register_ask(hass: HomeAssistant) -> list:
    """Teach the built-in Assist agent the questions. Returns the unregister callbacks."""
    try:
        from homeassistant.components.conversation.agent_manager import get_agent_manager
    except Exception as err:  # noqa: BLE001
        _LOGGER.info("Family Hub: Assist questions not available on this Home Assistant (%s)", err)
        return []

    async def _callback(user_input, result):
        context = getattr(user_input, "context", None)
        return await answer(hass, getattr(user_input, "text", "") or "", getattr(context, "user_id", None))

    try:
        return [get_agent_manager(hass).register_trigger(_polite(ASK_SENTENCES, _ASK_START), _callback)]
    except Exception as err:  # noqa: BLE001
        _LOGGER.warning("Family Hub: couldn't register Assist questions: %s", err)
        return []
