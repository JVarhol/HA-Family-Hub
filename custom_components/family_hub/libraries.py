"""Editable pick-lists of common routines, chores and rewards.

Each household starts with the built-in items below and can add, change and
remove items (stored per household; see chores_websocket_api's library_*
commands). Picking an item only fills in the existing create forms - a
library item is never linked to the routine/chore/reward made from it.

Self-contained (no import from the package's __init__.py), like the engines.
"""
from __future__ import annotations

import re
import uuid
from typing import Any, Optional

from . import routine_library
from .const import ROUTINE_CATEGORIES, ROUTINE_CATEGORY_MORNING

KIND_ROUTINES = "routines"
KIND_CHORES = "chores"
KIND_REWARDS = "rewards"
KINDS = (KIND_ROUTINES, KIND_CHORES, KIND_REWARDS)
MAX_ITEMS = 300
MAX_TITLE = 80

# (title, icon, stars)
_CHORE_ROWS: list[tuple[str, str, int]] = [
    ("Make your bed", "\U0001F6CF️", 1),
    ("Clean your room", "\U0001F9F9", 3),
    ("Put away laundry", "\U0001F455", 2),
    ("Fold laundry", "\U0001F9FA", 2),
    ("Start a load of laundry", "\U0001F9FA", 2),
    ("Load the dishwasher", "\U0001F37D️", 2),
    ("Unload the dishwasher", "\U0001F37D️", 2),
    ("Wash the dishes", "\U0001F9FD", 3),
    ("Set the table", "\U0001F374", 1),
    ("Clear the table", "\U0001F374", 1),
    ("Wipe the counters", "\U0001F9FD", 1),
    ("Sweep the floor", "\U0001F9F9", 2),
    ("Vacuum", "\U0001F9F9", 3),
    ("Mop the floor", "\U0001FAA3", 3),
    ("Dust", "\U0001FAB6", 2),
    ("Clean the bathroom", "\U0001F6C1", 4),
    ("Clean the toilet", "\U0001F6BD", 3),
    ("Take out the trash", "\U0001F5D1️", 1),
    ("Take out the recycling", "♻️", 1),
    ("Bring the bins back in", "\U0001F5D1️", 1),
    ("Feed the pet", "\U0001F43E", 1),
    ("Walk the dog", "\U0001F415", 2),
    ("Clean the litter box", "\U0001F408", 2),
    ("Water the plants", "\U0001FAB4", 1),
    ("Rake leaves", "\U0001F342", 4),
    ("Mow the lawn", "\U0001F33F", 5),
    ("Weed the garden", "\U0001F331", 3),
    ("Shovel snow", "❄️", 4),
    ("Put away groceries", "\U0001F6D2", 2),
    ("Tidy the living room", "\U0001F6CB️", 2),
    ("Pick up toys", "\U0001F9F8", 1),
    ("Change the sheets", "\U0001F6CF️", 2),
    ("Clean out the car", "\U0001F697", 3),
    ("Help cook dinner", "\U0001F373", 2),
    ("Homework done", "\U0001F4DA", 2),
    ("Practice instrument", "\U0001F3B9", 2),
    ("Read for 20 minutes", "\U0001F4D6", 2),
]

# (title, icon, cost in stars)
_REWARD_ROWS: list[tuple[str, str, int]] = [
    ("Pick the movie", "\U0001F3AC", 5),
    ("Movie night", "\U0001F37F", 10),
    ("30 minutes of screen time", "\U0001F4F1", 5),
    ("1 hour of video games", "\U0001F3AE", 10),
    ("Stay up 30 minutes late", "\U0001F319", 8),
    ("Pick dinner", "\U0001F355", 8),
    ("Dessert of your choice", "\U0001F366", 5),
    ("Treat from the store", "\U0001F36C", 6),
    ("Skip a chore", "\U0001F3AB", 10),
    ("Friend sleepover", "\U0001F3D5️", 25),
    ("Trip to the park", "\U0001F333", 10),
    ("Ice cream outing", "\U0001F368", 15),
    ("Board game with a parent", "\U0001F3B2", 6),
    ("Bake something together", "\U0001F9C1", 12),
    ("Choose the music in the car", "\U0001F3B5", 3),
    ("New book", "\U0001F4DA", 20),
    ("Small toy", "\U0001F9F8", 25),
    ("$5 allowance", "\U0001F4B5", 20),
    ("Day out of your choice", "\U0001F3A1", 50),
]


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


def _slug_id(prefix: str, title: str) -> str:
    """Stable ids for the built-in items, so restoring the defaults doesn't duplicate them."""
    return f"{prefix}_" + re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_")[:40]


def default_items(kind: str) -> list[dict[str, Any]]:
    if kind == KIND_ROUTINES:
        return [
            {"id": _slug_id("rt", r["title"]), "title": r["title"], "category": r["category"], "icon": r["icon"], "star_value": 0}
            for r in routine_library.get_routine_library()
        ]
    if kind == KIND_CHORES:
        return [{"id": _slug_id("ch", t), "title": t, "icon": i, "star_value": s} for t, i, s in _CHORE_ROWS]
    if kind == KIND_REWARDS:
        return [{"id": _slug_id("rw", t), "title": t, "icon": i, "cost_stars": c} for t, i, c in _REWARD_ROWS]
    raise ValueError(kind)


def _int(value: Any, lo: int, hi: int, default: int) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, n))


def clean_item(kind: str, raw: Any) -> Optional[dict[str, Any]]:
    """A stored item's shape, with limits. None when there's no usable title."""
    if not isinstance(raw, dict):
        return None
    title = str(raw.get("title") or "").strip()[:MAX_TITLE]
    if not title:
        return None
    item: dict[str, Any] = {
        "id": str(raw.get("id") or "").strip()[:40] or _new_id(),
        "title": title,
        "icon": str(raw.get("icon") or "").strip()[:8],
    }
    if kind == KIND_ROUTINES:
        category = raw.get("category")
        item["category"] = category if category in ROUTINE_CATEGORIES else ROUTINE_CATEGORY_MORNING
        item["star_value"] = _int(raw.get("star_value"), 0, 1000, 0)
    elif kind == KIND_CHORES:
        item["star_value"] = _int(raw.get("star_value"), 0, 1000, 0)
    else:
        item["cost_stars"] = _int(raw.get("cost_stars"), 0, 100000, 0)
    return item


def get_items(data: Optional[dict[str, Any]], kind: str) -> list[dict[str, Any]]:
    """This household's list, or the built-in one until they've changed it."""
    stored = (data or {}).get(kind)
    if isinstance(stored, list):
        return [i for i in (clean_item(kind, r) for r in stored) if i]
    return default_items(kind)


def save_item(data: dict[str, Any], kind: str, raw: Any) -> dict[str, Any]:
    """Adds an item, or replaces the one with the same id. Returns it."""
    item = clean_item(kind, raw)
    if item is None:
        raise ValueError("invalid_title")
    items = get_items(data, kind)
    for idx, existing in enumerate(items):
        if existing["id"] == item["id"]:
            items[idx] = item
            break
    else:
        if len(items) >= MAX_ITEMS:
            raise ValueError("too_many")
        items.append(item)
    data[kind] = items
    return item


def delete_item(data: dict[str, Any], kind: str, item_id: str) -> bool:
    items = get_items(data, kind)
    kept = [i for i in items if i["id"] != item_id]
    data[kind] = kept
    return len(kept) != len(items)


def reset(data: dict[str, Any], kind: str) -> list[dict[str, Any]]:
    """Adds back any built-in items that were removed. The household's own items and its
    changes to built-in ones are kept. Each one comes back next to where it was in the
    built-in list. Returns the items added back."""
    items = get_items(data, kind)
    have = {i["id"] for i in items}
    restored: list[dict[str, Any]] = []
    previous_id: Optional[str] = None
    for default in default_items(kind):
        if default["id"] not in have:
            if len(items) >= MAX_ITEMS:
                break
            pos = next((n + 1 for n, i in enumerate(items) if i["id"] == previous_id), 0) if previous_id else 0
            items.insert(pos, default)
            have.add(default["id"])
            restored.append(default)
        previous_id = default["id"]
    data[kind] = items
    return restored
