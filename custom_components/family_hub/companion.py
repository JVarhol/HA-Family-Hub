"""Family Hub Companion (2026.11.1): a child's own bedside screen.

The Companion card shows one child's day: an ok-to-wake screen, their routines one step at a time, a visual timer,
their stars, a big clock, messages from their grown-ups and a comfort button. Its settings live on the child's
profile (``userProfiles[uid]["companion"]``) so every screen, and the room light, follow the same schedule.

This module works out which part of the day it is for each child (sleep, wake, morning, day, afternoon, bedtime),
changes the child's room light when that changes (nightlight, sunrise, ok-to-wake), keeps the messages sent to them,
and fires ``family_hub_companion_event`` for automations. Screens ask for their state and subscribe to changes.
"""
from __future__ import annotations

from . import people as people_mod

import logging
import re
import uuid
from datetime import datetime, timedelta
from typing import Any, Optional

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect, async_dispatcher_send
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

_LOGGER = logging.getLogger(__name__)

DOMAIN = "family_hub"
STORE_VERSION = 1
EVENT_TYPE = "family_hub_companion_event"
SIGNAL = "family_hub_companion_update"
MODES = ("sleep", "wake", "morning", "day", "afternoon", "bedtime")
ALARMS = ("off", "chime", "birds", "marimba")
SOUNDS = ("off", "white", "pink", "brown", "rain", "waves")
NIGHT_SCREENS = ("dim", "off")
# what their lights do when it's time to get up: green (ok to get up, then the room light goes off),
# bright (a warm, bright light that stays on) or sunrise (stay as the sunrise ended)
WAKE_LIGHTS = ("green", "bright", "sunrise")
WAKE_ACTION_DOMAINS = ("scene", "script", "automation")
MAX_MESSAGES = 20
# the screens a grown-up can turn on or off for each child (the clock is always there)
SCREENS = ("myday", "jobs", "rewards", "wishes", "timers", "room")
SCREEN_DEFAULTS = {"myday": True, "jobs": True, "rewards": True, "wishes": True, "timers": False, "room": False}
ROOM_DOMAINS = ("light", "switch", "fan", "input_boolean", "media_player", "cover", "scene", "script")
# things they can see but not change: their room temperature, humidity, a door, the weather
INFO_DOMAINS = ("sensor", "binary_sensor", "climate", "weather")
MAX_TIMERS = 12
# the lengths a child can pick for a timer of their own
CUSTOM_TIMER_MAX = 120
DEFAULT_TIMERS = [
    {"title": "Reading", "minutes": 20, "icon": "\U0001F4DA"},
    {"title": "Practice", "minutes": 15, "icon": "\U0001F3B9"},
    {"title": "Tidy up", "minutes": 10, "icon": "\U0001F9F8"},
]
EVENT_KINDS = ("step_done", "routine_done", "comfort", "message_ack", "alarm_stopped", "sound_on", "sound_off")

DEFAULTS: dict[str, Any] = {
    "wake": "07:00",            # Monday-Friday
    "wakeWeekend": "08:00",     # Saturday, Sunday
    "bedtime": "19:30",         # Sunday-Thursday nights
    "bedtimeWeekend": "20:30",  # Friday, Saturday nights
    "afternoon": "15:30",       # after school
    "windDown": 30,             # minutes of bedtime routine before bedtime
    "wakeWindow": 30,           # minutes the "good morning" screen stays up
    "alarm": "chime",
    "sound": "off",
    "soundVolume": 40,
    "nightScreen": "dim",
    "light": "",
    "nightlight": True,
    "sunrise": True,
    "sunriseMinutes": 20,
    "okToWake": True,
    "wakeLight": "green",
    "wakeLights": [],
    "wakeAction": "",
    "comfortNotify": [],
    "screensaver": False,
    "screensaverIdle": 5,              # minutes without a tap before it starts
    "screensaverSource": "household",  # household = the Family Hub screensaver's own video or camera
    "screensaverVideoUrl": "",
    "screensaverCamera": "",
}
SCREENSAVER_SOURCES = ("household", "video", "camera")

_TIME_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


def _time(value: Any, default: str) -> str:
    return value if isinstance(value, str) and _TIME_RE.match(value) else default


def _int(value: Any, lo: int, hi: int, default: int) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, n))


def _timers(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return [dict(t) for t in DEFAULT_TIMERS]
    out = []
    for t in raw:
        if not isinstance(t, dict):
            continue
        title = str(t.get("title") or "").strip()[:30]
        if not title:
            continue
        icon = str(t.get("icon") or "").strip()[:8] or "\u23F1\uFE0F"
        out.append({"title": title, "minutes": _int(t.get("minutes"), 1, 180, 10), "icon": icon, "stars": _int(t.get("stars"), 0, 20, 0)})
    return out[:MAX_TIMERS]


def normalize(raw: Any) -> dict[str, Any]:
    """A child's Companion settings with every value checked and filled in from DEFAULTS."""
    r = raw if isinstance(raw, dict) else {}
    light = r.get("light")
    action = r.get("wakeAction")
    action = action.strip() if isinstance(action, str) else ""
    wake_light = r.get("wakeLight")
    if wake_light not in WAKE_LIGHTS:
        # before 2026.11.1's wake-up choices there was only "turn green at wake-up" on or off
        wake_light = "sunrise" if r.get("okToWake") is False else "green"
    main = light.strip() if isinstance(light, str) and light.strip().startswith("light.") else ""
    return {
        "wake": _time(r.get("wake"), DEFAULTS["wake"]),
        "wakeWeekend": _time(r.get("wakeWeekend"), DEFAULTS["wakeWeekend"]),
        "bedtime": _time(r.get("bedtime"), DEFAULTS["bedtime"]),
        "bedtimeWeekend": _time(r.get("bedtimeWeekend"), DEFAULTS["bedtimeWeekend"]),
        "afternoon": _time(r.get("afternoon"), DEFAULTS["afternoon"]),
        "windDown": _int(r.get("windDown"), 0, 120, DEFAULTS["windDown"]),
        "wakeWindow": _int(r.get("wakeWindow"), 5, 120, DEFAULTS["wakeWindow"]),
        "alarm": r.get("alarm") if r.get("alarm") in ALARMS else DEFAULTS["alarm"],
        "sound": r.get("sound") if r.get("sound") in SOUNDS else DEFAULTS["sound"],
        "soundVolume": _int(r.get("soundVolume"), 0, 100, DEFAULTS["soundVolume"]),
        "nightScreen": r.get("nightScreen") if r.get("nightScreen") in NIGHT_SCREENS else DEFAULTS["nightScreen"],
        "light": main,
        "nightlight": r.get("nightlight") is not False,
        "sunrise": r.get("sunrise") is not False,
        "sunriseMinutes": _int(r.get("sunriseMinutes"), 5, 60, DEFAULTS["sunriseMinutes"]),
        "okToWake": r.get("okToWake") is not False,
        "wakeLight": wake_light,
        # more lights that join the sunrise and the wake-up (not the nightlight)
        "wakeLights": list(dict.fromkeys(e.strip() for e in (r.get("wakeLights") or []) if isinstance(e, str) and e.strip().startswith("light.") and e.strip() != main))[:6],
        "wakeAction": action if action.split(".")[0] in WAKE_ACTION_DOMAINS and "." in action else "",
        "comfortNotify": [u for u in (r.get("comfortNotify") or []) if isinstance(u, str) and u][:10],
        # 2026.11.2: what's on this child's screen, chosen by their grown-ups
        "screens": {k: (r.get("screens") or {}).get(k, SCREEN_DEFAULTS[k]) is not False if isinstance(r.get("screens"), dict) else SCREEN_DEFAULTS[k] for k in SCREENS},
        "timers": _timers(r.get("timers")),
        # Jobs has an "Ask for stars" button (for something that isn't on the chart; a grown-up approves it)
        "askStars": r.get("askStars") is not False,
        # Rewards has an "Ask for a new reward" button (a grown-up sets its stars and approves it, like any suggestion)
        "askRewards": r.get("askRewards") is not False,
        "roomButtons": list(dict.fromkeys(e.strip() for e in (r.get("roomButtons") or []) if isinstance(e, str) and e.strip().split(".")[0] in ROOM_DOMAINS and "." in e))[:6],
        "infoSensors": list(dict.fromkeys(e.strip() for e in (r.get("infoSensors") or []) if isinstance(e, str) and e.strip().split(".")[0] in INFO_DOMAINS and "." in e))[:4],
        "customTimer": r.get("customTimer") is not False,
        # the same screensaver as the rest of Family Hub (a video or a live camera), when nobody has touched the screen
        "screensaver": r.get("screensaver") is True,
        "screensaverIdle": _int(r.get("screensaverIdle"), 1, 60, DEFAULTS["screensaverIdle"]),
        "screensaverSource": r.get("screensaverSource") if r.get("screensaverSource") in SCREENSAVER_SOURCES else "household",
        "screensaverVideoUrl": r.get("screensaverVideoUrl").strip()[:500] if isinstance(r.get("screensaverVideoUrl"), str) else "",
        "screensaverCamera": r.get("screensaverCamera").strip() if isinstance(r.get("screensaverCamera"), str) and r.get("screensaverCamera").strip().startswith("camera.") else "",
    }


def _minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


# 2026.11.2: is a day a no-school day (days_off.DaysOff.is_off, set by __init__); a no-school day gets weekend times
_days_off_checker = None


def set_days_off_checker(fn) -> None:
    global _days_off_checker
    _days_off_checker = fn


def _no_school(day: Any, uid: Optional[str] = None) -> bool:
    if _days_off_checker is None:
        return False
    try:
        return bool(_days_off_checker(day.date() if isinstance(day, datetime) else day, "school", uid))
    except Exception:  # noqa: BLE001 - a lookup problem is never a reason to change a child's wake-up
        return False


def wake_time(cfg: dict[str, Any], day: datetime) -> str:
    # weekends, and days with no school (a holiday marked No school)
    return cfg["wakeWeekend"] if day.weekday() >= 5 or _no_school(day, cfg.get("_uid")) else cfg["wake"]


def bedtime(cfg: dict[str, Any], day: datetime) -> str:
    # Friday and Saturday nights are the weekend ones, and the night before a day with no school
    return cfg["bedtimeWeekend"] if day.weekday() in (4, 5) or _no_school(day + timedelta(days=1), cfg.get("_uid")) else cfg["bedtime"]


def mode_for(cfg: dict[str, Any], now: datetime) -> str:
    """Which part of the day it is for this child at `now` (local time)."""
    t = now.hour * 60 + now.minute
    wake = _minutes(wake_time(cfg, now))
    bed = _minutes(bedtime(cfg, now))
    afternoon = _minutes(cfg["afternoon"])
    if t < wake or t >= bed:
        return "sleep"
    if t < wake + cfg["wakeWindow"]:
        return "wake"
    if t >= bed - cfg["windDown"]:
        return "bedtime"
    if t >= afternoon:
        return "afternoon"
    if t < 12 * 60:
        return "morning"
    return "day"


def _profiles(settings: dict[str, Any]) -> dict[str, dict[str, Any]]:
    raw = settings.get("userProfiles") if isinstance(settings, dict) else None
    return {str(k): v for k, v in raw.items() if isinstance(v, dict)} if isinstance(raw, dict) else {}


def _entry_data(hass: HomeAssistant) -> Optional[dict[str, Any]]:
    entries = (hass.data.get(DOMAIN) or {}).get("entries") or {}
    return next(iter(entries.values()), None) if entries else None


def store_for(hass: HomeAssistant, entry_id: str) -> Store:
    return Store(hass, STORE_VERSION, f"family_hub_companion_{entry_id}")


class Companion:
    """One per config entry: messages, mode overrides, and the room-light schedule."""

    def __init__(self, hass: HomeAssistant, entry_data: dict[str, Any], store: Store) -> None:
        self.hass = hass
        self.entry_data = entry_data
        self.store = store
        self.data: dict[str, Any] = {"messages": {}, "overrides": {}}
        self.last_mode: dict[str, str] = {}
        self.sunrise_done: dict[str, str] = {}

    async def async_load(self) -> None:
        saved = await self.store.async_load() or {}
        self.data["messages"] = saved.get("messages") if isinstance(saved.get("messages"), dict) else {}
        self.data["overrides"] = saved.get("overrides") if isinstance(saved.get("overrides"), dict) else {}

    async def _save(self) -> None:
        await self.store.async_save(self.data)

    async def settings(self) -> dict[str, Any]:
        store = self.entry_data.get("settings_store")
        return (await store.async_load() or {}) if store else {}

    async def config_for(self, uid: str) -> dict[str, Any]:
        cfg = normalize((_profiles(await self.settings()).get(uid) or {}).get("companion"))
        cfg["_uid"] = uid  # whose days off count (a break only some children have)
        return cfg

    def override_for(self, uid: str, now: Optional[datetime] = None) -> Optional[dict[str, Any]]:
        o = self.data["overrides"].get(uid)
        if not isinstance(o, dict) or o.get("mode") not in MODES:
            return None
        until = dt_util.parse_datetime(o.get("until") or "")
        if until is None or until <= (now or dt_util.utcnow()):
            return None
        return o

    def mode_now(self, uid: str, cfg: dict[str, Any], now: Optional[datetime] = None) -> str:
        now = now or dt_util.now()
        o = self.override_for(uid, now)
        return o["mode"] if o else mode_for(cfg, now)

    def notify(self, uid: Optional[str] = None) -> None:
        async_dispatcher_send(self.hass, SIGNAL, uid)

    async def state(self, uid: str) -> dict[str, Any]:
        cfg = await self.config_for(uid)
        now = dt_util.now()
        msgs = [m for m in (self.data["messages"].get(uid) or []) if isinstance(m, dict)]
        return {
            "user_id": uid,
            "settings": cfg,
            "mode": self.mode_now(uid, cfg, now),
            "override": self.override_for(uid, now),
            "messages": msgs[-10:],
            "now": now.isoformat(),
            "wake_today": wake_time(cfg, now),
            "bedtime_today": bedtime(cfg, now),
        }

    def fire(self, uid: str, kind: str, **data: Any) -> None:
        try:
            self.hass.bus.async_fire(EVENT_TYPE, {"user_id": uid, "type": kind, **data})
        except Exception as err:  # noqa: BLE001 - an event listener must never break the action
            _LOGGER.debug("Family Hub: companion event failed: %s", err)

    async def send_message(self, uid: str, text: str, sender: Optional[str] = None, sender_name: str = "") -> dict[str, Any]:
        text = str(text or "").strip()[:280]
        if not text:
            raise ValueError("Type a message first.")
        msg = {"id": uuid.uuid4().hex[:12], "text": text, "from": sender or "", "from_name": sender_name, "at": dt_util.utcnow().isoformat(), "ack_at": None}
        lst = self.data["messages"].setdefault(uid, [])
        lst.append(msg)
        del lst[:-MAX_MESSAGES]
        await self._save()
        self.fire(uid, "message_sent", message_id=msg["id"], text=text)
        self.notify(uid)
        return msg

    async def ack(self, uid: str, msg_id: str) -> bool:
        for m in self.data["messages"].get(uid) or []:
            if isinstance(m, dict) and m.get("id") == msg_id and not m.get("ack_at"):
                m["ack_at"] = dt_util.utcnow().isoformat()
                await self._save()
                self.notify(uid)
                return True
        return False

    async def set_override(self, uid: str, mode: str, minutes: int = 60) -> None:
        if mode == "auto":
            self.data["overrides"].pop(uid, None)
        else:
            if mode not in MODES:
                raise ValueError(f"Unknown mode {mode}")
            until = dt_util.utcnow() + timedelta(minutes=max(1, min(24 * 60, int(minutes or 60))))
            self.data["overrides"][uid] = {"mode": mode, "until": until.isoformat()}
        await self._save()
        await self.tick()
        self.notify(uid)

    async def _light(self, entity_id: str, **data: Any) -> None:
        if not entity_id or self.hass.states.get(entity_id) is None:
            return
        try:
            await self.hass.services.async_call("light", "turn_on", {"entity_id": entity_id, **data}, blocking=False)
        except Exception:  # noqa: BLE001 - a light without colour gets brightness only
            data.pop("rgb_color", None)
            data.pop("color_temp_kelvin", None)
            try:
                await self.hass.services.async_call("light", "turn_on", {"entity_id": entity_id, **data}, blocking=False)
            except Exception as err:  # noqa: BLE001
                _LOGGER.debug("Family Hub: companion light %s failed: %s", entity_id, err)

    async def _light_off(self, entity_id: str) -> None:
        if not entity_id or self.hass.states.get(entity_id) is None:
            return
        try:
            await self.hass.services.async_call("light", "turn_off", {"entity_id": entity_id}, blocking=False)
        except Exception as err:  # noqa: BLE001
            _LOGGER.debug("Family Hub: companion light %s failed: %s", entity_id, err)

    async def _wake_action(self, entity_id: str) -> None:
        if not entity_id:
            return
        domain = entity_id.split(".")[0]
        service = "trigger" if domain == "automation" else "turn_on"
        try:
            await self.hass.services.async_call(domain, service, {"entity_id": entity_id}, blocking=False)
        except Exception as err:  # noqa: BLE001 - a missing scene must never stop the morning
            _LOGGER.debug("Family Hub: companion wake-up action %s failed: %s", entity_id, err)

    async def _on_mode_change(self, uid: str, cfg: dict[str, Any], old: Optional[str], new: str) -> None:
        light = cfg["light"]
        extra = cfg["wakeLights"]
        if new == "sleep":
            if light and cfg["nightlight"]:
                # amber, very dim: it's still night, stay in bed
                await self._light(light, rgb_color=[255, 120, 0], brightness_pct=4)
            elif light:
                await self._light_off(light)
            for e in extra:
                await self._light_off(e)
        elif new == "wake":
            # the sunrise (if any) has just finished; now the alarm goes off on the screen
            if cfg["wakeLight"] == "green" and light:
                await self._light(light, rgb_color=[40, 200, 90], brightness_pct=60)
            elif cfg["wakeLight"] == "bright":
                for e in [light] + extra:
                    if e:
                        await self._light(e, color_temp_kelvin=3500, brightness_pct=100, transition=2)
            await self._wake_action(cfg["wakeAction"])
        elif old in ("wake", "sleep") and light and (cfg["wakeLight"] == "green" or old == "sleep"):
            # the green "ok to get up" light (or a nightlight nobody turned off) goes off once the morning starts
            await self._light_off(light)
        if old is not None:
            self.fire(uid, "mode", mode=new, previous=old)
        self.notify(uid)

    async def tick(self, _now: Any = None) -> None:
        """Every minute: notice each child's part of the day changing, and start the sunrise."""
        settings = await self.settings()
        now = dt_util.now()
        for uid, profile in _profiles(settings).items():
            if not isinstance(profile.get("companion"), dict):
                continue
            cfg = normalize(profile.get("companion"))
            cfg["_uid"] = uid
            mode = self.mode_now(uid, cfg, now)
            old = self.last_mode.get(uid)
            if old != mode:
                self.last_mode[uid] = mode
                # the first look after a restart only remembers it; nothing switches
                if old is not None:
                    await self._on_mode_change(uid, cfg, old, mode)
            if (cfg["light"] or cfg["wakeLights"]) and cfg["sunrise"] and not self.override_for(uid, now):
                start = _minutes(wake_time(cfg, now)) - cfg["sunriseMinutes"]
                t = now.hour * 60 + now.minute
                key = now.date().isoformat()
                if start <= t < start + 2 and self.sunrise_done.get(uid) != key:
                    self.sunrise_done[uid] = key
                    # a warm glow that slowly brightens, finishing right when the alarm goes off
                    for e in [cfg["light"]] + cfg["wakeLights"]:
                        if e:
                            await self._light(e, color_temp_kelvin=2700, brightness_pct=100, transition=cfg["sunriseMinutes"] * 60)

    async def comfort(self, uid: str) -> None:
        cfg = await self.config_for(uid)
        self.fire(uid, "comfort")
        if not cfg["comfortNotify"]:
            return
        from . import chores_websocket_api as cws  # local import: chores_websocket_api imports a lot

        profiles = _profiles(await self.settings())
        targets: list[str] = []
        for parent in cfg["comfortNotify"]:
            targets.extend((profiles.get(parent) or {}).get("notifyTargets") or [])
        if not targets:
            return
        name = await cws._user_display_name(self.hass, uid)
        await cws._send_instant_notification(self.hass, targets, "Family Hub", f"{name} pressed the comfort button.")


def get(hass: HomeAssistant) -> Optional[Companion]:
    entry_data = _entry_data(hass)
    return entry_data.get("companion") if entry_data else None


async def _user_id_for(hass: HomeAssistant, value: Any) -> str:
    """A Home Assistant user id, a person entity, or a name - '' if nobody matches."""
    text = str(value or "").strip()
    if not text:
        return ""
    users = await people_mod.async_get_users(hass)
    if any(u.id == text for u in users):
        return text
    if text.startswith("person."):
        st = hass.states.get(text)
        return str((st.attributes.get("user_id") if st else "") or "")
    low = text.lower()
    for u in users:
        if (u.name or "").lower() == low:
            return u.id
    for st in hass.states.async_all("person"):
        if str(st.attributes.get("friendly_name") or "").lower() == low:
            return str(st.attributes.get("user_id") or "")
    return ""


def _is_child(settings: dict[str, Any], uid: Optional[str]) -> bool:
    return bool(uid and (_profiles(settings).get(uid) or {}).get("isChildAccount"))


@websocket_api.websocket_command({vol.Required("type"): "family_hub/companion/state", vol.Optional("user_id"): str})
@websocket_api.async_response
async def ws_state(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    comp = get(hass)
    uid = msg.get("user_id") or (connection.user.id if connection.user else "")
    if comp is None or not uid:
        connection.send_error(msg["id"], "not_found", "Family Hub is not set up")
        return
    connection.send_result(msg["id"], await comp.state(uid))


@websocket_api.websocket_command({vol.Required("type"): "family_hub/companion/subscribe", vol.Required("user_id"): str})
@websocket_api.async_response
async def ws_subscribe(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    uid = msg["user_id"]

    @callback
    def _changed(changed_uid: Optional[str]) -> None:
        if changed_uid in (None, uid):
            connection.send_message(websocket_api.event_message(msg["id"], {"changed": True}))

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(hass, SIGNAL, _changed)
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {vol.Required("type"): "family_hub/companion/event", vol.Required("user_id"): str, vol.Required("kind"): vol.In(EVENT_KINDS), vol.Optional("data"): dict}
)
@websocket_api.async_response
async def ws_event(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    comp = get(hass)
    if comp is None:
        connection.send_error(msg["id"], "not_found", "Family Hub is not set up")
        return
    uid, kind, data = msg["user_id"], msg["kind"], msg.get("data") or {}
    if kind == "comfort":
        await comp.comfort(uid)
    elif kind == "message_ack":
        if await comp.ack(uid, str(data.get("id") or "")):
            comp.fire(uid, "message_ack", message_id=str(data.get("id") or ""))
    else:
        safe = {k: v for k, v in data.items() if isinstance(k, str) and isinstance(v, (str, int, float, bool))}
        comp.fire(uid, kind, **safe)
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command({vol.Required("type"): "family_hub/companion/send", vol.Required("user_id"): str, vol.Required("text"): str})
@websocket_api.async_response
async def ws_send(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    comp = get(hass)
    if comp is None:
        connection.send_error(msg["id"], "not_found", "Family Hub is not set up")
        return
    sender = connection.user.id if connection.user else None
    if _is_child(await comp.settings(), sender) and not (connection.user and connection.user.is_admin):
        connection.send_error(msg["id"], "forbidden", "Only a grown-up can send Companion messages.")
        return
    try:
        sent = await comp.send_message(msg["user_id"], msg["text"], sender, connection.user.name if connection.user else "")
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_format", str(err))
        return
    connection.send_result(msg["id"], {"message": sent})


@websocket_api.websocket_command(
    {vol.Required("type"): "family_hub/companion/set_mode", vol.Required("user_id"): str, vol.Required("mode"): vol.In(("auto",) + MODES), vol.Optional("minutes"): int}
)
@websocket_api.async_response
async def ws_set_mode(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    comp = get(hass)
    if comp is None:
        connection.send_error(msg["id"], "not_found", "Family Hub is not set up")
        return
    sender = connection.user.id if connection.user else None
    if _is_child(await comp.settings(), sender) and not (connection.user and connection.user.is_admin):
        connection.send_error(msg["id"], "forbidden", "Only a grown-up can change this.")
        return
    await comp.set_override(msg["user_id"], msg["mode"], msg.get("minutes") or 60)
    connection.send_result(msg["id"], await comp.state(msg["user_id"]))


@websocket_api.websocket_command(
    {vol.Required("type"): "family_hub/companion/start_timer", vol.Required("user_id"): str, vol.Optional("index"): int, vol.Optional("minutes"): int, vol.Optional("client_id"): str}
)
@websocket_api.async_response
async def ws_start_timer(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    """Start one of the timers a grown-up set up for this child. The length and the stars come from their settings,
    never from the screen, so finishing one pays exactly what the grown-ups chose (stopping it early pays nothing)."""
    comp = get(hass)
    if comp is None:
        connection.send_error(msg["id"], "not_found", "Family Hub is not set up")
        return
    uid = msg["user_id"]
    cfg = await comp.config_for(uid)
    timers = cfg.get("timers") or []
    if "index" in msg:
        index = msg["index"]
        if index < 0 or index >= len(timers):
            connection.send_error(msg["id"], "not_found", "That timer isn't set up any more.")
            return
        t = timers[index]
    elif "minutes" in msg:
        # a timer of their own: any length up to two hours, and never any stars (so it can't be used to earn them)
        if not cfg.get("customTimer", True):
            connection.send_error(msg["id"], "forbidden", "Timers of their own are turned off.")
            return
        minutes = msg["minutes"]
        if minutes < 1 or minutes > CUSTOM_TIMER_MAX:
            connection.send_error(msg["id"], "invalid_format", f"A timer can be 1 to {CUSTOM_TIMER_MAX} minutes.")
            return
        t = {"title": "Timer", "minutes": minutes, "icon": "\u23F1\uFE0F", "stars": 0}
    else:
        connection.send_error(msg["id"], "invalid_format", "Pick a timer or a length.")
        return
    from . import chores_websocket_api as cwa  # noqa: PLC0415 - imported here; it imports half of Family Hub
    from .timer_engine import TimerError  # noqa: PLC0415
    try:
        timer = await cwa.async_start_standalone_timer(
            hass, comp.entry_data, minutes=t["minutes"], label=((t.get("icon") or "") + " " + t["title"]).strip(),
            user_id=uid, actor_id=connection.user.id if connection.user else None, client_id=msg.get("client_id"), source="companion",
        )
    except TimerError as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    if t.get("stars"):
        timer["companion_stars"] = int(t["stars"])
        await cwa._save_timers(hass, comp.entry_data)  # noqa: SLF001
    connection.send_result(msg["id"], {"timer": timer})


def register(hass: HomeAssistant) -> None:
    for cmd in (ws_state, ws_subscribe, ws_event, ws_send, ws_set_mode, ws_start_timer):
        websocket_api.async_register_command(hass, cmd)

    async def _svc_message(call: ServiceCall) -> None:
        comp = get(hass)
        uid = await _user_id_for(hass, call.data.get("person"))
        if comp is None or not uid:
            _LOGGER.warning("Family Hub: companion_message - nobody called %r", call.data.get("person"))
            return
        await comp.send_message(uid, call.data.get("message") or "", None, str(call.data.get("from") or ""))

    async def _svc_mode(call: ServiceCall) -> None:
        comp = get(hass)
        uid = await _user_id_for(hass, call.data.get("person"))
        if comp is None or not uid:
            _LOGGER.warning("Family Hub: companion_mode - nobody called %r", call.data.get("person"))
            return
        await comp.set_override(uid, call.data.get("mode") or "auto", call.data.get("minutes") or 60)

    hass.services.async_register(
        DOMAIN, "companion_message", _svc_message,
        schema=vol.Schema({vol.Required("person"): str, vol.Required("message"): str, vol.Optional("from"): str}),
    )
    hass.services.async_register(
        DOMAIN, "companion_mode", _svc_mode,
        schema=vol.Schema({vol.Required("person"): str, vol.Required("mode"): vol.In(("auto",) + MODES), vol.Optional("minutes"): vol.Coerce(int)}),
    )


def settings_changed(hass: HomeAssistant) -> None:
    """A Settings save: screens fetch their (maybe new) schedule again."""
    comp = get(hass)
    if comp is not None:
        comp.notify(None)

