"""My Pantry "extras" (v141+) - items a household wants to see on the My
Pantry card WITHOUT them being real Grocy stock. The card's main list is
backed directly by Grocy's own stock (see __init__.py's
_fetch_pantry_stock/_ws_get_pantry_stock and friends, right next to this
project's other Grocy passthrough helpers - there's no separate "pantry
stock" engine because there's no local state to own there, it's just Grocy's
own numbers read and written straight through the REST API, the same shape
as every other Grocy fetch/write already in this project).

Extras are the deliberate escape hatch from that: a backup roll of paper
towels in the garage, a case of water in the basement, a "grab bag" of
mismatched hardware - things a household wants to remember they have without
teaching Grocy about them as real trackable stock (a new product, a chosen
quantity unit, a location, min-stock-amount tuning, and so on). Rather than
half-heartedly represent that as a Grocy product with no real stock math
behind it, extras get their own tiny local record with no Grocy involvement
at all: a name, a free-text quantity (whatever a person types - "3 rolls,"
"a few," "1 case" - since there's no real unit-conversion reason to force a
number+unit split the way Grocy stock needs), a free-text location, an
optional expiration date, and notes.

Deliberately as simple as goal_engine.py's own create/update/delete shape
(see that module's docstring on why Goals/Routines/Pantry are each their own
small self-contained module rather than another bag of fields on something
bigger) - no status/state machine, no permission checks (those are
chores_websocket_api.py's job, same separation of concerns every other
engine module here already keeps), and no hass.bus event fired, since
nothing in this project reacts to a pantry-extra changing the way chores/
rewards/goals automations might want to.

Every function here operates on the caller's already-loaded `extras` dict
(extra_id -> extra record, same flat {id: record} shape store.py already
uses for chores/goals) and mutates it in place; callers own saving the Store
afterward."""
from __future__ import annotations

import uuid
from typing import Any

from homeassistant.util import dt as dt_util


class PantryError(Exception):
    """Raised for any invalid pantry-extra operation - see .code for a short
    machine-readable reason, same shape as GoalError/ChoreError/RewardError."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def new_pantry_extra_id() -> str:
    return f"px_{uuid.uuid4().hex[:12]}"


def _now_iso() -> str:
    return dt_util.utcnow().isoformat()


def default_pantry_extra(**overrides: Any) -> dict[str, Any]:
    """A fully-populated extra record with every schema field defaulted,
    then overridden by whatever the caller actually specified - same
    "single source of truth for the shape" role default_goal plays for
    goals, used by both create_extra and tests."""
    extra: dict[str, Any] = {
        "id": overrides.get("id") or new_pantry_extra_id(),
        "name": "",
        # Free text on purpose (see this module's own docstring) - "3
        # rolls," "a few," "1 case" all just pass through as typed, there's
        # no real quantity-unit math happening here the way Grocy's own
        # amount/qu_id_stock pair needs.
        "quantity": "",
        "location": "",
        "expiration_date": None,
        "notes": "",
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    extra.update(overrides)
    return extra


def create_extra(extras: dict[str, dict[str, Any]], payload: dict[str, Any]) -> dict[str, Any]:
    name = str(payload.get("name") or "").strip()
    if not name:
        raise PantryError("invalid_name", "This item needs a name.")
    extra = default_pantry_extra(
        id=new_pantry_extra_id(),
        name=name,
        quantity=str(payload.get("quantity") or "").strip(),
        location=str(payload.get("location") or "").strip(),
        expiration_date=payload.get("expiration_date") or None,
        notes=str(payload.get("notes") or "").strip(),
    )
    extras[extra["id"]] = extra
    return extra


def _get_extra(extras: dict[str, dict[str, Any]], extra_id: str) -> dict[str, Any]:
    extra = extras.get(extra_id)
    if extra is None:
        raise PantryError("not_found", f"No pantry item with id {extra_id!r}")
    return extra


_EDITABLE_FIELDS = ("name", "quantity", "location", "expiration_date", "notes")


def update_extra(extras: dict[str, dict[str, Any]], extra_id: str, fields: dict[str, Any]) -> dict[str, Any]:
    """Only touches keys the caller actually passed in `fields`, same
    partial-update convention as update_goal/update_chore - only fields in
    _EDITABLE_FIELDS are honored."""
    extra = _get_extra(extras, extra_id)
    if "name" in fields:
        name = str(fields["name"] or "").strip()
        if not name:
            raise PantryError("invalid_name", "This item needs a name.")
        extra["name"] = name
    if "quantity" in fields:
        extra["quantity"] = str(fields["quantity"] or "").strip()
    if "location" in fields:
        extra["location"] = str(fields["location"] or "").strip()
    if "expiration_date" in fields:
        extra["expiration_date"] = fields["expiration_date"] or None
    if "notes" in fields:
        extra["notes"] = str(fields["notes"] or "").strip()
    extra["updated_at"] = _now_iso()
    return extra


def delete_extra(extras: dict[str, dict[str, Any]], extra_id: str) -> None:
    if extra_id not in extras:
        raise PantryError("not_found", f"No pantry item with id {extra_id!r}")
    del extras[extra_id]
