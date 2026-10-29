"""Quick Add: turn one plain-English line into a Family Hub item.

"Soccer Tuesday 5pm for Emma"        -> an event on Emma's calendar
"tacos for dinner Friday"            -> Friday's dinner
"remind me to call the dentist at 3" -> a reminder
"chore: Leo empty the dishwasher tomorrow 3 stars" -> a chore
"reward ice cream trip 20 stars"     -> a reward in the catalog
"add milk to groceries"              -> an item on the Groceries list

Pure Python, no Home Assistant imports: everything it needs comes in a context
dict (now, people, lists, meal blocks, calendars), so the parser can be tested
on its own and shared by the More menu's Quick Add box and Assist (chat and voice).
English only for now. The result is a plain dict the apply step saves.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any, Optional

KIND_EVENT = "event"
KIND_REMINDER = "reminder"
KIND_MEAL = "meal"
KIND_CHORE = "chore"
KIND_REWARD = "reward"
KIND_LIST_ITEM = "list_item"
KINDS = (KIND_EVENT, KIND_REMINDER, KIND_MEAL, KIND_CHORE, KIND_REWARD, KIND_LIST_ITEM)

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
WEEKDAY_ABBR = {
    "mon": 0, "tue": 1, "tues": 1, "wed": 2, "weds": 2, "thu": 3, "thur": 3, "thurs": 3,
    "fri": 4, "sat": 5, "sun": 6,
}
RRULE_DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]
MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]
MONTH_ABBR = {m[:3]: i + 1 for i, m in enumerate(MONTHS)}
MONTH_ABBR["sept"] = 9
NUMBER_WORDS = {
    "a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
    "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "fifteen": 15, "twenty": 20, "thirty": 30,
}
DEFAULT_BLOCKS = ["Breakfast", "Lunch", "Dinner"]
MEAL_ALIASES = {"supper": "dinner", "brunch": "lunch"}
# times of day used when only a part of the day is given
PART_OF_DAY = {"morning": "09:00", "afternoon": "15:00", "evening": "18:00", "tonight": "19:00", "night": "19:00"}

_WD = r"(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday|s)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)"
_MONTH = r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
_AMPM = r"(?:a\.?m\.?|p\.?m\.?)"


def _weekday_index(word: str) -> Optional[int]:
    w = word.lower().rstrip(".")
    if w in WEEKDAYS:
        return WEEKDAYS.index(w)
    for full in WEEKDAYS:
        if w == full[:3] or w == full[:4]:
            return WEEKDAYS.index(full)
    return WEEKDAY_ABBR.get(w)


def _month_index(word: str) -> Optional[int]:
    w = word.lower().rstrip(".")
    for i, m in enumerate(MONTHS):
        if w == m or w == m[:3] or (w == "sept" and i == 8):
            return i + 1
    return None


def _norm(s: str) -> str:
    """lower case, letters and digits only - used for name matching ("Mary Ann" == "maryann")"""
    return re.sub(r"[^0-9a-z]", "", (s or "").lower())


def _close(a: str, b: str) -> bool:
    """one letter off (voice typos: "Ema" for "Emma"); only for words of 4+ letters"""
    if a == b:
        return True
    if min(len(a), len(b)) < 3 or max(len(a), len(b)) < 4 or abs(len(a) - len(b)) > 1:
        return False
    # Levenshtein distance <= 1
    if len(a) > len(b):
        a, b = b, a
    i = j = 0
    edits = 0
    while i < len(a) and j < len(b):
        if a[i] == b[j]:
            i += 1
            j += 1
            continue
        edits += 1
        if edits > 1:
            return False
        if len(a) == len(b):
            i += 1
        j += 1
    return edits + (len(b) - j) + (len(a) - i) <= 1


class _Text:
    """The line being parsed. Recognised parts are cut out, so what's left is the title."""

    def __init__(self, text: str) -> None:
        self.s = " " + re.sub(r"\s+", " ", text.strip()) + " "

    def take(self, pattern: str, flags: int = re.I) -> Optional[re.Match]:
        m = re.search(pattern, self.s, flags)
        if m:
            self.s = self.s[: m.start()] + " " + self.s[m.end():]
            self.s = re.sub(r"\s+", " ", self.s)
            if not self.s.startswith(" "):
                self.s = " " + self.s
            if not self.s.endswith(" "):
                self.s += " "
        return m

    def find(self, pattern: str, flags: int = re.I) -> Optional[re.Match]:
        return re.search(pattern, self.s, flags)

    def left(self) -> str:
        return self.s.strip()


def _clean_title(raw: str) -> str:
    t = raw.strip(" ,.;:-–—")
    filler = r"(?:at|on|for|with|to|by|from|the|a|an|and|is|are|due|in|of|this|next|every|add|put|new|create|please|we're|were|we|having|have|make|making)"
    prev = None
    while prev != t:
        prev = t
        t = re.sub(rf"^(?:{filler})\b\s*", "", t, flags=re.I).strip(" ,.;:-–—")
        t = re.sub(rf"\s*\b(?:at|on|for|with|to|by|from|the|and|is|due|in|of|this|next|every)$", "", t, flags=re.I).strip(" ,.;:-–—")
    t = re.sub(r"\s+", " ", t)
    if t and t[0].islower():
        t = t[0].upper() + t[1:]
    return t


def _to24(h: int, m: int, ampm: Optional[str], default_pm_until: int = 7) -> tuple[int, int]:
    if ampm:
        a = ampm.lower().replace(".", "")
        if a == "pm" and h < 12:
            h += 12
        if a == "am" and h == 12:
            h = 0
    elif 1 <= h <= default_pm_until:
        # "at 5" in a family calendar is nearly always 5 PM
        h += 12
    return h % 24, m


def _fmt_hm(h: int, m: int) -> str:
    return f"{h:02d}:{m:02d}"


def _parse_time(t: _Text, out: dict[str, Any]) -> None:
    hm = r"(\d{1,2})(?::(\d{2}))?"
    # a range: 5-7pm, 5:30 to 6:15 pm, from 5 to 7
    m = t.take(rf"\b(?:from\s+)?{hm}\s*({_AMPM})?\s*(?:-|–|to|until|till)\s*{hm}\s*({_AMPM})?(?=\s)")
    if m:
        h1, m1, a1, h2, m2, a2 = int(m.group(1)), int(m.group(2) or 0), m.group(3), int(m.group(4)), int(m.group(5) or 0), m.group(6)
        if h1 <= 24 and h2 <= 24 and m1 < 60 and m2 < 60:
            a1 = a1 or a2
            sh, sm = _to24(h1, m1, a1)
            eh, em = _to24(h2, m2, a2 or a1)
            if (eh, em) <= (sh, sm) and not a2:
                eh = (eh + 12) % 24
            out["time"], out["end_time"] = _fmt_hm(sh, sm), _fmt_hm(eh, em)
            return
    m = t.take(r"\b(?:at\s+)?(noon|midday|midnight)\b")
    if m:
        out["time"] = "12:00" if m.group(1).lower() != "midnight" else "00:00"
        return
    m = t.take(rf"\b(?:at\s+|@\s*)?{hm}\s*({_AMPM})(?=\s)")
    if not m:
        m = t.take(rf"\b(?:at\s+|@\s*){hm}(?=\s)")
    if not m:
        m = t.take(r"\b(\d{1,2}):(\d{2})(?=\s)()")
    if m:
        h, mi = int(m.group(1)), int(m.group(2) or 0)
        ampm = m.group(3) if m.lastindex and m.lastindex >= 3 else None
        if h <= 24 and mi < 60:
            if not ampm and t.find(r"\b(?:morning|a\.?m\.?)\b") and h < 12:
                ampm = "am"
            out["time"] = _fmt_hm(*_to24(h, mi, ampm))
    m = t.take(r"\b(?:in the |this |at )?(morning|afternoon|evening|tonight)\b|\b(?:at |in the )(night)\b")
    if m:
        part = (m.group(1) or m.group(2)).lower()
        if part == "tonight":
            out.setdefault("_date_hint", "today")
        if not out.get("time"):
            out["time"] = PART_OF_DAY[part]
    # a length: for 2 hours, for 30 minutes, for an hour, for half an hour
    m = t.take(r"\bfor\s+(half an hour|an? hour|\d+(?:\.\d+)?\s*(?:hours?|hrs?|h)|\d+\s*(?:minutes?|mins?|m))\b")
    if m:
        d = m.group(1).lower()
        if d.startswith("half"):
            mins = 30
        elif d.startswith(("an hour", "a hour")):
            mins = 60
        else:
            num = float(re.match(r"[\d.]+", d).group(0))
            mins = int(num * 60) if re.search(r"h", d) else int(num)
        out["duration_minutes"] = max(5, min(mins, 24 * 60))


def _next_weekday(today: date, wd: int, include_today: bool) -> date:
    delta = (wd - today.weekday()) % 7
    if delta == 0 and not include_today:
        delta = 7
    return today + timedelta(days=delta)


def _nth_weekday(year: int, month: int, wd: int, n: int) -> date:
    """n-th (1-based; -1 = last) weekday wd (Mon=0) of a month"""
    if n > 0:
        first = date(year, month, 1)
        return first + timedelta(days=(wd - first.weekday()) % 7 + 7 * (n - 1))
    last = (date(year + (month == 12), month % 12 + 1, 1) - timedelta(days=1))
    return last - timedelta(days=(last.weekday() - wd) % 7)


# US-style holidays people say instead of a date ("trick or treating on Halloween"); the next one, today included
_HOLIDAYS: list[tuple[str, Any]] = [
    (r"christmas\s+eve", lambda y: date(y, 12, 24)),
    (r"christmas(?:\s+day)?|xmas", lambda y: date(y, 12, 25)),
    (r"new\s+year'?s\s+eve", lambda y: date(y, 12, 31)),
    (r"new\s+year'?s(?:\s+day)?", lambda y: date(y, 1, 1)),
    (r"halloween", lambda y: date(y, 10, 31)),
    (r"valentine'?s(?:\s+day)?", lambda y: date(y, 2, 14)),
    (r"(?:st\.?\s+|saint\s+)?patrick'?s\s+day", lambda y: date(y, 3, 17)),
    (r"(?:the\s+)?(?:4th|fourth)\s+of\s+july|independence\s+day", lambda y: date(y, 7, 4)),
    (r"thanksgiving(?:\s+day)?", lambda y: _nth_weekday(y, 11, 3, 4)),
    (r"mother'?s\s+day", lambda y: _nth_weekday(y, 5, 6, 2)),
    (r"father'?s\s+day", lambda y: _nth_weekday(y, 6, 6, 3)),
    (r"memorial\s+day", lambda y: _nth_weekday(y, 5, 0, -1)),
    (r"labor\s+day", lambda y: _nth_weekday(y, 9, 0, 1)),
]


def _holiday_date(when: Any, today: date) -> date:
    d = when(today.year)
    return d if d >= today else when(today.year + 1)


def _parse_date(t: _Text, today: date, out: dict[str, Any]) -> None:
    # "on Halloween" / "for Christmas" is a date; a bare holiday name may be part of the title ("Halloween party Friday")
    for pattern, when in _HOLIDAYS:
        if t.take(rf"\b(?:on|for)\s+{pattern}\b"):
            out["date"] = _holiday_date(when, today)
            return
    _parse_date_words(t, today, out)
    if out.get("date") is None:
        for pattern, when in _HOLIDAYS:
            if t.take(rf"\b{pattern}\s*$"):  # at the end: "pumpkin carving halloween"
                out["date"] = _holiday_date(when, today)
                return
        for pattern, when in _HOLIDAYS:
            if t.find(rf"\b{pattern}\b"):  # "Halloween party at 6" - that day, name kept in the title
                out["date"] = _holiday_date(when, today)
                return


def _parse_date_words(t: _Text, today: date, out: dict[str, Any]) -> None:
    m = t.take(r"\b(?:the\s+)?day after tomorrow\b")
    if m:
        out["date"] = today + timedelta(days=2)
        return
    m = t.take(r"\b(today|tonight|tomorrow|tmrw|tmr)\b")
    if m:
        w = m.group(1).lower()
        out["date"] = today if w in ("today", "tonight") else today + timedelta(days=1)
        if w == "tonight" and not out.get("time"):
            out["time"] = PART_OF_DAY["tonight"]
        return
    m = t.take(r"\b(?:this\s+)?weekend\b")
    if m:
        out["date"] = _next_weekday(today, 5, include_today=True)
        return
    m = t.take(rf"\b(?:on\s+)?(this|next)?\s*({_WD})\b\.?")
    if m:
        wd = _weekday_index(m.group(2))
        if wd is not None:
            which = (m.group(1) or "").lower()
            d = _next_weekday(today, wd, include_today=(which != "next"))
            if which == "next" and (d - today).days < 7 and wd > today.weekday():
                # "next Friday" said on a Tuesday means the Friday of next week
                d += timedelta(days=7)
            out["date"] = d
            return
    m = t.take(r"\bin\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+(days?|weeks?)\b")
    if m:
        n = int(m.group(1)) if m.group(1).isdigit() else NUMBER_WORDS[m.group(1).lower()]
        out["date"] = today + timedelta(days=n * (7 if m.group(2).lower().startswith("week") else 1))
        return
    m = t.take(r"\bnext\s+week\b")
    if m:
        out["date"] = today + timedelta(days=7)
        return
    # Oct 30, October 30th, Oct. 30 2026
    m = t.take(rf"\b(?:on\s+)?({_MONTH})\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?(?:,?\s+(\d{{4}}))?\b")
    if not m:
        # 30 Oct, the 30th of October
        m2 = t.take(rf"\b(?:on\s+)?(?:the\s+)?(\d{{1,2}})(?:st|nd|rd|th)?\s+(?:of\s+)?({_MONTH})\.?(?:,?\s+(\d{{4}}))?\b")
        if m2:
            m = m2
            month, day, year = _month_index(m2.group(2)), int(m2.group(1)), m2.group(3)
        else:
            month = day = year = None
    else:
        month, day, year = _month_index(m.group(1)), int(m.group(2)), m.group(3)
    if m and month:
        y = int(year) if year else today.year
        try:
            d = date(y, month, day)
            if not year and d < today:
                d = date(y + 1, month, day)
            out["date"] = d
            return
        except ValueError:
            pass
    # 10/30, 10/30/2026 (month first, as Home Assistant's US default; day-first locales can type "30 Oct")
    m = t.take(r"\b(?:on\s+)?(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b")
    if m:
        month, day = int(m.group(1)), int(m.group(2))
        y = int(m.group(3)) if m.group(3) else today.year
        if y < 100:
            y += 2000
        try:
            d = date(y, month, day)
            if not m.group(3) and d < today:
                d = date(y + 1, month, day)
            out["date"] = d
            return
        except ValueError:
            pass
    m = t.take(r"\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b")
    if m:
        day = int(m.group(1))
        y, mo = today.year, today.month
        for _ in range(3):
            try:
                d = date(y, mo, day)
                if d >= today:
                    out["date"] = d
                    return
            except ValueError:
                pass
            mo += 1
            if mo > 12:
                mo, y = 1, y + 1


def _parse_repeat(t: _Text, out: dict[str, Any]) -> None:
    m = t.take(r"\b(?:every\s*day|daily)\b")
    if m:
        out["repeat"] = "FREQ=DAILY"
        return
    m = t.take(r"\bevery\s+weekdays?\b|\bweekdays\b")
    if m:
        out["repeat"] = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
        out["_repeat_days"] = [0, 1, 2, 3, 4]
        return
    m = t.take(rf"\bevery\s+(other\s+)?((?:{_WD})(?:\s*(?:,|and|&)\s*(?:{_WD}))*)s?\b")
    if m:
        days = sorted({_weekday_index(w) for w in re.findall(_WD, m.group(2), re.I)} - {None})
        if days:
            rule = "FREQ=WEEKLY" + (";INTERVAL=2" if m.group(1) else "") + ";BYDAY=" + ",".join(RRULE_DAYS[d] for d in days)
            out["repeat"] = rule
            out["_repeat_days"] = days
            return
    m = t.take(r"\b(?:every\s+(other\s+)?week|weekly)\b")
    if m:
        out["repeat"] = "FREQ=WEEKLY" + (";INTERVAL=2" if m.group(1) else "")
        return
    m = t.take(r"\b(?:every\s+month|monthly)\b")
    if m:
        out["repeat"] = "FREQ=MONTHLY"
        return
    m = t.take(r"\b(?:every\s+year|yearly|annually)\b")
    if m:
        out["repeat"] = "FREQ=YEARLY"


def _parse_stars(t: _Text, out: dict[str, Any]) -> None:
    m = t.take(r"\b(?:for\s+|worth\s+|costs?\s+)?(\d{1,4})\s*(?:stars?|⭐+)(?=\s)")
    if m:
        out["stars"] = int(m.group(1))


def _person_index(people: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """normalised name -> people; first names only when no one else shares them"""
    idx: dict[str, list[dict[str, Any]]] = {}
    firsts: dict[str, list[dict[str, Any]]] = {}
    for p in people:
        for name in [p.get("name")] + list(p.get("aliases") or []):
            key = _norm(name or "")
            if key:
                idx.setdefault(key, [])
                if p not in idx[key]:
                    idx[key].append(p)
        first = _norm((p.get("name") or "").split(" ")[0])
        if first:
            firsts.setdefault(first, []).append(p)
    for k, ps in firsts.items():
        if len(ps) == 1 and k not in idx:
            idx[k] = ps
    return idx


def _parse_people(t: _Text, ctx: dict[str, Any], out: dict[str, Any]) -> None:
    people = ctx.get("people") or []
    speaker = ctx.get("speaker") or None
    found: list[dict[str, Any]] = []

    def add(p: Optional[dict[str, Any]]) -> None:
        if p and all(p.get("user_id") != f.get("user_id") or p.get("name") != f.get("name") for f in found):
            found.append(p)

    # me / my / I
    if speaker and t.find(r"\b(?:for|with)\s+me\b|\bmy\b|\bme\b|\bI\b"):
        if t.take(r"\b(?:for|with)\s+me\b") or t.find(r"\bremind\s+me\b") or t.find(r"\bmy\b"):
            add(speaker)
    if not people:
        out["people"] = found
        return
    idx = _person_index(people)
    names_sorted = sorted(idx.keys(), key=len, reverse=True)
    # #Name tags (the same tags events use)
    for m in list(re.finditer(r"#([\w']+)", t.s)):
        key = _norm(m.group(1))
        if key in idx and len(idx[key]) == 1:
            add(idx[key][0])
            t.take(re.escape(m.group(0)))
    words = re.findall(r"[A-Za-z][A-Za-z'\-]*", t.s)
    # multi-word names first ("Mary Ann"), then single words, possessives ("Emma's") included
    for n in range(3, 0, -1):
        for i in range(len(words) - n + 1):
            phrase = " ".join(words[i:i + n])
            key = _norm(re.sub(r"'s$", "", phrase, flags=re.I))
            if not key:
                continue
            hits = idx.get(key)
            if not hits and n == 1 and len(key) >= 3:
                # voice typos, but only right after "for" / "with" / "remind", or as a possessive
                near = [k for k in names_sorted if _close(k, key)]
                if near and re.search(rf"\b(?:for|with|remind|and)\s+{re.escape(phrase)}\b|\b{re.escape(phrase)}'s\b", t.s, re.I):
                    hits = idx[near[0]]
            if hits and len(hits) == 1:
                p = hits[0]
                if phrase.lower().endswith("'s") or re.search(rf"\b{re.escape(phrase)}'s\b", t.s, re.I):
                    # "Leo's birthday party" keeps its name and still goes on Leo's calendar
                    add(p)
                    continue
                if t.take(rf"(?:\b(?:for|with|and|remind|tell)\s+)?\b{re.escape(phrase)}(?:'s)?\b(?:\s+(?:and|&|,)(?=\s))?"):
                    add(p)
    out["people"] = found


def _match_named(text_key: str, options: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
    """best list/calendar for a typed name: exact, then plural/singular, then contains, then one letter off"""
    if not text_key:
        return None
    for o in options:
        if _norm(o.get("name", "")) == text_key:
            return o
    for o in options:
        k = _norm(o.get("name", ""))
        if k.rstrip("s") == text_key.rstrip("s") or k.replace("list", "") == text_key.replace("list", ""):
            return o
    for o in options:
        k = _norm(o.get("name", ""))
        if len(text_key) >= 4 and (text_key in k or k in text_key):
            return o
    for o in options:
        k = _norm(o.get("name", ""))
        if _close(k, text_key):
            return o
        # grocery / groceries, shop / shopping
        shorter = min(len(k), len(text_key))
        common = len(_common_prefix(k, text_key))
        if shorter >= 4 and common >= max(4, shorter - 2):
            return o
    return None


def _common_prefix(a: str, b: str) -> str:
    i = 0
    while i < min(len(a), len(b)) and a[i] == b[i]:
        i += 1
    return a[:i]


def _block_names(ctx: dict[str, Any]) -> list[str]:
    blocks = [b for b in (ctx.get("blocks") or []) if isinstance(b, str) and b.strip()]
    return blocks or list(DEFAULT_BLOCKS)


def _find_block(t: _Text, ctx: dict[str, Any], take: bool) -> Optional[int]:
    """which meal slot is named; "for dinner" wins over a bare "dinner" ("Breakfast burritos for breakfast")"""
    keys = [b.lower() for b in _block_names(ctx)]
    words = [(k, i) for i, k in enumerate(keys)] + [(w, keys.index(tgt)) for w, tgt in MEAL_ALIASES.items() if tgt in keys]
    words.sort(key=lambda x: -len(x[0]))
    for lead in (r"(?:for|at)\s+", r"^\s*", ""):
        for word, i in words:
            pat = rf"{lead}\b{re.escape(word)}\b(?:\s+(?:is|will be))?" if lead != r"^\s*" else rf"^\s*{re.escape(word)}\b(?:\s+(?:is|will be))?"
            if t.find(pat):
                if take:
                    t.take(pat)
                return i
    return None


def _detect_kind(text: str, ctx: dict[str, Any]) -> tuple[str, str]:
    """(kind, text without the kind's own lead-in words)"""
    s = text.strip()
    low = s.lower()
    explicit = re.match(r"^(event|appointment|reminder|meal|chore|reward|list|todo|to-do)\s*[:\-]\s*", low)
    if explicit:
        word = explicit.group(1)
        rest = s[explicit.end():]
        kind = {"appointment": KIND_EVENT, "list": KIND_LIST_ITEM, "todo": KIND_LIST_ITEM, "to-do": KIND_LIST_ITEM}.get(word, word)
        if kind == KIND_REMINDER:
            rest = re.sub(r"^(?:to\s+)", "", rest, flags=re.I)
        return kind, rest
    m = re.match(r"^(?:add\s+|create\s+|new\s+|make\s+)?(?:a\s+|an\s+)?reward\b\s*(?:of|for|called|:)?\s*", low)
    if m:
        return KIND_REWARD, s[m.end():]
    m = re.match(r"^(?:add\s+|create\s+|new\s+|make\s+)?(?:a\s+|an\s+)?chore\b\s*(?:for|called|:)?\s*", low)
    if m:
        return KIND_CHORE, s[m.end():]
    if re.search(r"\bchore\b", low):
        return KIND_CHORE, re.sub(r"\s*\b(?:as\s+a\s+|a\s+)?chore\b\s*", " ", s, flags=re.I)
    m = re.match(r"^(?:add\s+|set\s+|create\s+)?(?:a\s+)?(?:remind(?:er)?)\b\s*(?:me\s+|to\s+|:\s*|that\s+)?", low)
    if m:
        rest = s[m.end():]
        if re.match(r"^remind\s+me\b", low):
            rest = re.sub(r"^(?:to|that|about)\s+", "", rest, flags=re.I)
            return KIND_REMINDER, "for me " + rest
        return KIND_REMINDER, re.sub(r"^(\S+)\s+(?:to|that|about)\s+", r"\1 ", rest, flags=re.I) if not re.match(r"^remind(?:er)?\b", rest, re.I) else rest
    # list items: "add milk to groceries", "put eggs on the shopping list", "milk to the grocery list"
    lists = ctx.get("lists") or []
    m = re.match(r"^(add\s+|put\s+)?(.+?)\s+(?:to|on|onto)\s+(?:the\s+|my\s+|our\s+)?(.+?)(\s+list)?$", s, flags=re.I)
    if m and lists and not re.search(r"\bcalendar\b", m.group(3), re.I):
        strong = bool(m.group(1) or m.group(4))
        key = _norm(m.group(3))
        target = _match_named(key, lists) if strong else next(
            (o for o in lists if _norm(o.get("name", "")).rstrip("s") == key.rstrip("s")), None)
        if target:
            return KIND_LIST_ITEM, s
    # meals: a meal block named in the text, with "for", "is", or at the start ("dinner friday tacos")
    t = _Text(s)
    if _find_block(t, ctx, take=False) is not None:
        blocks = [b.lower() for b in _block_names(ctx)] + list(MEAL_ALIASES)
        bpat = "|".join(re.escape(b) for b in sorted(blocks, key=len, reverse=True))
        dateword = rf"(?:is|today|tonight|tomorrow|this|next|on|{_WD}|{_MONTH}|\d)"
        if re.search(rf"\b(?:for|is|at)\s+(?:{bpat})\b|^(?:{bpat})\s+{dateword}|\b(?:{bpat})\s+(?:is|will be)\b|^(?:we're having|we are having|have|make|eat)\b", low):
            return KIND_MEAL, s
    return KIND_EVENT, s


def parse(text: str, ctx: dict[str, Any]) -> dict[str, Any]:
    """Parse one line. ctx: now (datetime), people [{name, aliases, user_id, calendar, reminders}],
    speaker (one of people, or None), lists [{entity, name}], calendars [{entity, name}], blocks [names]."""
    now: datetime = ctx.get("now") or datetime.now()
    today = now.date()
    raw = (text or "").strip()
    out: dict[str, Any] = {"text": raw, "kind": None, "title": "", "date": None, "time": None, "end_time": None,
                           "duration_minutes": None, "stars": None, "repeat": None, "people": [], "list": None,
                           "block": None, "calendar": None, "problems": []}
    if not raw:
        out["problems"].append("empty")
        return out
    kind, body = _detect_kind(raw, ctx)
    out["kind"] = kind
    t = _Text(body)

    if kind == KIND_LIST_ITEM:
        m = t.take(r"\s(?:to|on|onto)\s+(?:the\s+|my\s+|our\s+)?(\S.*?)(?:\s+list)?\s*$")
        target = _match_named(_norm(m.group(1)), ctx.get("lists") or []) if m else None
        out["list"] = target
        t.take(r"^\s*(?:add|put)\b")
        _parse_date(t, today, out)
        out["title"] = _clean_title(t.left())
        return _finish(out)

    if kind in (KIND_EVENT, KIND_REMINDER, KIND_CHORE):
        cal_m = t.find(r"\bon\s+(?:the\s+)?([\w' ]+?)\s+calendar\b")
        if cal_m:
            cal = _match_named(_norm(cal_m.group(1)), ctx.get("calendars") or [])
            if cal:
                out["calendar"] = cal
                t.take(re.escape(cal_m.group(0)))
            else:
                # "on Emma's calendar" / "on the jarets calendar" when Emma has no calendar by that name: it's for her
                who = re.sub(r"(?:'s|s')$", "", cal_m.group(1).strip(), flags=re.I)
                if who.lower() in ("my", "me"):
                    t.take(re.escape(cal_m.group(0)))
                    t.s += "for me "
                else:
                    probe: dict[str, Any] = {}
                    _parse_people(_Text("for " + _spoken_possessives(who, ctx)), ctx, probe)
                    if not probe.get("people"):
                        _parse_people(_Text("for " + who), ctx, probe)
                    if probe.get("people"):
                        t.take(re.escape(cal_m.group(0)))
                        t.s += "for " + probe["people"][0].get("name", who) + " "
    if kind == KIND_MEAL:
        out["block"] = _find_block(t, ctx, take=True)
        t.take(r"^\s*(?:we're having|we are having|have|make|eat)\b")
        t.take(r"\b(?:is|will be)\b")
    _parse_repeat(t, out)
    _parse_stars(t, out)
    _parse_time(t, out)
    _parse_date(t, today, out)
    if out.pop("_date_hint", None) == "today" and not out["date"]:
        out["date"] = today
    if not out["date"] and out.get("_repeat_days"):
        # "every Wednesday" starts on the next Wednesday (today counts)
        out["date"] = min(_next_weekday(today, d, include_today=True) for d in out["_repeat_days"])
    if kind != KIND_REWARD:
        _parse_people(t, ctx, out)
        # a reminder for "me" without a speaker still works; it just goes on the family list
        t.take(r"\b(?:for|with)\s+me\b")
    t.take(r"\b(?:by|due|on|at)\s*$")
    out["title"] = _clean_title(t.left())
    if kind == KIND_MEAL and out["block"] is None:
        out["block"] = len(_block_names(ctx)) - 1
    return _finish(out)


def _finish(out: dict[str, Any]) -> dict[str, Any]:
    if isinstance(out.get("date"), date):
        out["date"] = out["date"].isoformat()
    if out.get("time") and out.get("duration_minutes") and not out.get("end_time"):
        h, m = (int(x) for x in out["time"].split(":"))
        end = (h * 60 + m + out["duration_minutes"]) % (24 * 60)
        out["end_time"] = _fmt_hm(end // 60, end % 60)
    out.pop("_repeat_days", None)
    if not out["title"]:
        out["problems"].append("no_title")
    if out["kind"] == KIND_LIST_ITEM and not out.get("list"):
        out["problems"].append("no_list")
    if out["kind"] == KIND_REWARD and not out.get("stars"):
        out["problems"].append("no_stars")
    return out


def _fmt_date_words(d: str, today: date) -> str:
    dt = date.fromisoformat(d)
    diff = (dt - today).days
    if diff == 0:
        return "today"
    if diff == 1:
        return "tomorrow"
    if 1 < diff < 7:
        return dt.strftime("%A")
    return dt.strftime("%A, %B ") + str(dt.day)


def _fmt_time_words(hm: str) -> str:
    h, m = (int(x) for x in hm.split(":"))
    suffix = "AM" if h < 12 else "PM"
    h12 = h % 12 or 12
    return f"{h12}:{m:02d} {suffix}" if m else f"{h12} {suffix}"


def describe(p: dict[str, Any], today: date, block_names: Optional[list[str]] = None) -> str:
    """One English sentence for a parsed (and resolved) item - the preview line and what Assist says back."""
    title = p.get("title") or ""
    when = ""
    if p.get("date"):
        when = _fmt_date_words(p["date"], today)
    if p.get("time"):
        when = (when + " at " if when else "at ") + _fmt_time_words(p["time"])
        if p.get("end_time"):
            when += " to " + _fmt_time_words(p["end_time"])
    who = ", ".join(x.get("name", "") for x in (p.get("people") or []) if x.get("name"))
    repeat = ""
    if p.get("repeat"):
        r = p["repeat"]
        repeat = (" every other week" if "INTERVAL=2" in r else " every day" if "DAILY" in r else " every month" if "MONTHLY" in r
                  else " every year" if "YEARLY" in r else " every week")
    k = p.get("kind")
    if k == KIND_EVENT:
        cal = (p.get("calendar") or {}).get("name") or ""
        where = f" on {cal}'s calendar" if cal and not cal.lower().endswith(("calendar", "family")) else (f" on the {cal} calendar" if cal else "")
        return f"{title}{where}{(' ' + when) if when else ''}{repeat}" + (f" (with {who})" if who and len(p.get('people') or []) > 1 else "")
    if k == KIND_REMINDER:
        return f"Reminder: {title}" + (f" for {who}" if who else "") + (f", {when}" if when else "") + repeat
    if k == KIND_MEAL:
        names = block_names or DEFAULT_BLOCKS
        block = names[p["block"]] if isinstance(p.get("block"), int) and 0 <= p["block"] < len(names) else "a meal"
        return f"{title} for {block.lower()} {when or 'today'}"
    if k == KIND_CHORE:
        stars = f", {p['stars']} stars" if p.get("stars") else ""
        return f"Chore: {title}" + (f" for {who}" if who else " in the Chore Bin") + (f", due {when}" if when else "") + stars + repeat
    if k == KIND_REWARD:
        return f"Reward: {title}" + (f", {p['stars']} stars" if p.get("stars") else "")
    if k == KIND_LIST_ITEM:
        lst = (p.get("list") or {}).get("name") or "a list"
        return f"{title} on {lst}"
    return title


# ------------------------------------------------------------------ questions ("What's for dinner?")

TOPIC_MEALS = "meals"
TOPIC_CALENDAR = "calendar"
TOPIC_REMINDERS = "reminders"
TOPIC_CHORES = "chores"
TOPIC_STARS = "stars"


def parse_question(text: str, ctx: dict[str, Any]) -> dict[str, Any]:
    """What's being asked: {topic, date (ISO, default today), block (meals), person (one of ctx people, or None),
    me (asked about the speaker), everyone (chores for the whole household)}. topic None when it isn't a question we answer."""
    now: datetime = ctx.get("now") or datetime.now()
    today = now.date()
    raw = (text or "").strip().rstrip("?!. ")
    low = raw.lower()
    out: dict[str, Any] = {"text": raw, "topic": None, "date": None, "block": None, "person": None, "me": False, "everyone": False}
    t = _Text(raw)
    # the day first, so "Friday" never reads as a name
    tmp: dict[str, Any] = {}
    _parse_date(t, today, tmp)
    if t.find(r"\btonight\b") and not tmp.get("date"):
        tmp["date"] = today
    out["date"] = (tmp.get("date") or today).isoformat()
    if re.search(r"\bstars?\b", low) and re.search(r"\bhow many\b|\bbalance\b", low):
        out["topic"] = TOPIC_STARS
    elif re.search(r"\bchores?\b", low) or re.search(r"\bwhat(?:'s| is)? left\b|\bleft to do\b|\b(?:have|has|got) left\b", low):
        out["topic"] = TOPIC_CHORES
        out["everyone"] = not re.search(r"\b(?:i|me|my)\b", low)
    elif re.search(r"\breminders?\b", low):
        out["topic"] = TOPIC_REMINDERS
    else:
        block = _find_block(_Text(raw), ctx, take=False)
        if block is not None and re.search(r"\bwhat(?:'s| is| are we having| are we eating| we having)?\b|\bfor\b", low):
            out["topic"] = TOPIC_MEALS
            out["block"] = block
        elif re.search(r"\bcalendar\b|\bschedule\b|\bhappening\b|\bgoing on\b|\bdoing\b|\bplans?\b|\bwhat does\b|\bwhat do\b|\bagenda\b", low):
            out["topic"] = TOPIC_CALENDAR
    if out["topic"] in (TOPIC_STARS, TOPIC_CHORES, TOPIC_CALENDAR, TOPIC_REMINDERS):
        tmp = {}
        _parse_people(_Text(_spoken_possessives(raw, ctx)), ctx, tmp)
        people = [p for p in tmp.get("people") or [] if p is not ctx.get("speaker") or not re.search(r"\b(?:i|me|my)\b", low)]
        if people:
            out["person"] = people[0]
            out["everyone"] = False
        elif re.search(r"\b(?:i|me|my)\b", low):
            out["me"] = True
            out["person"] = ctx.get("speaker")
            out["everyone"] = False
    return out


def _spoken_possessives(raw: str, ctx: dict[str, Any]) -> str:
    """Voice and quick typing drop the apostrophe: "what are jarets chores" -> "what are jaret's chores",
    for names of people in the household (left alone when someone is actually called that, like "Chris"/"Chriss")."""
    names: set[str] = set()
    for person in ctx.get("people") or []:
        for n in [person.get("name") or ""] + list(person.get("aliases") or []):
            n = n.strip()
            if n:
                names.add(n.lower())
                names.add(n.split()[0].lower())
    for n in sorted(names, key=len, reverse=True):
        if len(n) < 2 or (n + "s") in names:
            continue
        raw = re.sub(r"\b(" + re.escape(n) + r")s\b", r"\1's", raw, flags=re.I)
    return raw


def spoken_list(items: list[str], limit: int = 6) -> str:
    """'a', 'a and b', 'a, b and c', '... and 3 more'"""
    items = [i for i in items if i]
    if len(items) > limit:
        rest = len(items) - (limit - 1)
        items = items[: limit - 1] + [f"{rest} more"]
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + " and " + items[-1]


def day_words(d: str, today: date) -> str:
    """'today', 'tomorrow', 'Friday', 'Friday, November 6'"""
    return _fmt_date_words(d, today)


def time_words(hm: str) -> str:
    return _fmt_time_words(hm)
