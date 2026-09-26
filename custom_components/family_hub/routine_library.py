"""A curated library of common routine items ("Brush teeth," "Make bed,"
etc.) that a household can pick from instead of typing a routine item out
by hand every time - household ask, verbatim: "Build a Routine Library - a
common library of routines that people can pick from to build out their
day. Brush teeth, make bed, etc etc etc."

Same spirit as grocery_reference.py's curated reference list: plain,
static data with no Store/schema of its own, exposed read-only via
family_hub/routines/library (see chores_websocket_api.ws_list_routine_library),
and consumed purely as a convenience that pre-fills the EXISTING routine
item creation form (routine_engine.create_item / ws_create_routine_item) -
picking a library entry is just a faster way to fill in title/category/
star_value, nothing about a routine item's own schema changes because this
exists. Extending this list over time is encouraged and low-risk: it's
plain data, no other code needs to change to add, remove, or tweak an
entry.

Each row: (title, category, icon). category is one of ROUTINE_CATEGORIES
(const.py) - the category a library entry is filed under is only ever a
suggestion for where it's LISTED in the picker; nothing stops a household
from adding any entry to any of their own routine slots regardless of
which category it's filed under here. icon is a single emoji, purely
decorative (shown next to the entry in the picker), never stored on the
resulting routine item itself.
"""
from __future__ import annotations

from .const import ROUTINE_CATEGORY_AFTERNOON, ROUTINE_CATEGORY_MORNING, ROUTINE_CATEGORY_NIGHT

# (title, category, icon)
_LIBRARY_ROWS: list[tuple[str, str, str]] = [
    # ------------------------------------------------------------------
    # Morning
    # ------------------------------------------------------------------
    ("Wake up on time", ROUTINE_CATEGORY_MORNING, "⏰"),
    ("Make bed", ROUTINE_CATEGORY_MORNING, "\U0001F6CF️"),
    ("Brush teeth", ROUTINE_CATEGORY_MORNING, "\U0001FAA5"),
    ("Wash face", ROUTINE_CATEGORY_MORNING, "\U0001F9FC"),
    ("Get dressed", ROUTINE_CATEGORY_MORNING, "\U0001F455"),
    ("Comb/brush hair", ROUTINE_CATEGORY_MORNING, "\U0001FA92"),
    ("Eat breakfast", ROUTINE_CATEGORY_MORNING, "\U0001F373"),
    ("Take vitamins/medicine", ROUTINE_CATEGORY_MORNING, "\U0001F48A"),
    ("Pack backpack/bag", ROUTINE_CATEGORY_MORNING, "\U0001F392"),
    ("Pack lunch", ROUTINE_CATEGORY_MORNING, "\U0001F371"),
    ("Feed pets", ROUTINE_CATEGORY_MORNING, "\U0001F415"),
    ("Put on shoes", ROUTINE_CATEGORY_MORNING, "\U0001F45F"),
    ("Check the weather", ROUTINE_CATEGORY_MORNING, "⛅"),
    # ------------------------------------------------------------------
    # Afternoon
    # ------------------------------------------------------------------
    ("Homework", ROUTINE_CATEGORY_AFTERNOON, "\U0001F4DA"),
    ("Practice instrument", ROUTINE_CATEGORY_AFTERNOON, "\U0001F3B9"),
    ("Read for 20 minutes", ROUTINE_CATEGORY_AFTERNOON, "\U0001F4D6"),
    ("Tidy room", ROUTINE_CATEGORY_AFTERNOON, "\U0001F9F9"),
    ("Put away shoes/coat", ROUTINE_CATEGORY_AFTERNOON, "\U0001F9E5"),
    ("Snack + water", ROUTINE_CATEGORY_AFTERNOON, "\U0001F34E"),
    ("Screen time check-in", ROUTINE_CATEGORY_AFTERNOON, "\U0001F4F1"),
    ("Outside/exercise time", ROUTINE_CATEGORY_AFTERNOON, "\U0001F3C3"),
    ("Empty backpack/bag", ROUTINE_CATEGORY_AFTERNOON, "\U0001F392"),
    # ------------------------------------------------------------------
    # Night
    # ------------------------------------------------------------------
    ("Brush teeth", ROUTINE_CATEGORY_NIGHT, "\U0001FAA5"),
    ("Floss", ROUTINE_CATEGORY_NIGHT, "\U0001F9B7"),
    ("Wash face", ROUTINE_CATEGORY_NIGHT, "\U0001F9FC"),
    ("Put on pajamas", ROUTINE_CATEGORY_NIGHT, "\U0001F6CC"),
    ("Lay out tomorrow's clothes", ROUTINE_CATEGORY_NIGHT, "\U0001F455"),
    ("Pack backpack/bag for tomorrow", ROUTINE_CATEGORY_NIGHT, "\U0001F392"),
    ("Tidy room", ROUTINE_CATEGORY_NIGHT, "\U0001F9F9"),
    ("Read before bed", ROUTINE_CATEGORY_NIGHT, "\U0001F4D6"),
    ("Charge devices", ROUTINE_CATEGORY_NIGHT, "\U0001F50C"),
    ("Lights out on time", ROUTINE_CATEGORY_NIGHT, "\U0001F4A4"),
]


def get_routine_library() -> list[dict[str, str]]:
    """The full library as plain dicts, ready to send over the websocket -
    see ws_list_routine_library in chores_websocket_api.py."""
    return [{"title": title, "category": category, "icon": icon} for title, category, icon in _LIBRARY_ROWS]
