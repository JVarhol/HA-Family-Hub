"""Linked wish lists (2026.11.1): read a person's public GoWish and Amazon wish lists.

Each person can link any number of outside wish lists in their profile
(``wishlistLinks``). This module only knows how to *read* one link and turn it
into plain items; ``__init__._sync_linked_wishlists`` puts them on the person's
own Family Hub wish list.

GoWish: public lists are served by GoWish's own GraphQL API
(api.gowish.com/graphql), which answers without signing in for anything a
share link opens. Links look like ``gowish.com/wishlists/<id>`` (also with a
language prefix, ``/en/wishlists/<id>``), ``gowish.com/s/<code>`` or ``gowish.com/share/<slug>`` (share
links, which redirect to ``/wishlists/<id>``) or, for creators,
``gowish.com/creator/<slug>/wishlist/<id>``.

Amazon: a *public* list page (``amazon.<tld>/hz/wishlist/ls/<ID>``, or the
short ``a.co`` / ``amzn.to`` links that redirect there) is read like a browser
would, 10 items a page, following its "show more" link. Private and
shared-with-link-only Amazon lists can't be read without signing in.

Only these hosts are ever fetched (including after redirects), so a link can't
be pointed at the home network.
"""
from __future__ import annotations

import html as html_lib
import json
import re
from typing import Any
from urllib.parse import urljoin, urlsplit

GOWISH_GRAPHQL = "https://api.gowish.com/graphql"
MAX_ITEMS = 300
MAX_REDIRECTS = 6
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

GOWISH_WISHLIST_QUERY = (
    "query FamilyHubWishlist($id: ID!, $input: PaginationInput) { wishlist(id: $id) { id title "
    "owner { firstName } wishes(input: $input) { data { id title description price currency photos url quantity } "
    "totalCount nextCursor } } }"
)
GOWISH_CREATOR_LIST_QUERY = (
    "query FamilyHubCreatorList($id: String!, $input: PaginationInput) { creators { creatorList { getById(id: $id) { "
    "id title creatorProducts(input: $input) { data { id title description price currency photo url } nextCursor totalCount } } } } }"
)

AMAZON_TLD_CURRENCY = {
    "com": "USD", "ca": "CAD", "com.mx": "MXN", "com.br": "BRL", "co.uk": "GBP", "de": "EUR", "fr": "EUR",
    "it": "EUR", "es": "EUR", "nl": "EUR", "be": "EUR", "ie": "EUR", "se": "SEK", "pl": "PLN", "com.tr": "TRY",
    "ae": "AED", "sa": "SAR", "in": "INR", "co.jp": "JPY", "com.au": "AUD", "sg": "SGD", "eg": "EGP",
}
AMAZON_SHORT_HOSTS = ("a.co", "amzn.to", "amzn.eu", "amzn.asia")


class WishlistImportError(Exception):
    """A link couldn't be read; the message is shown to the person as it is."""


def _host(url: str) -> str:
    try:
        return (urlsplit(url).hostname or "").lower()
    except ValueError:
        return ""


def _amazon_tld(host: str) -> str | None:
    m = re.fullmatch(r"(?:www\.|smile\.)?amazon\.([a-z.]+)", host)
    return m.group(1) if m else None


def is_gowish_host(host: str) -> bool:
    return host == "gowish.com" or host.endswith(".gowish.com")


def allowed_host(host: str) -> bool:
    """The only places a linked list is fetched from (redirects included)."""
    return is_gowish_host(host) or _amazon_tld(host) is not None or host in AMAZON_SHORT_HOSTS


def classify(url: str) -> dict[str, Any] | None:
    """What kind of link this is, or None if it isn't one Family Hub can read.

    {"source": "gowish", "kind": "wishlist" | "creator" | "share", "id": ...}
    {"source": "amazon", "kind": "list" | "short", "id": ..., "tld": ...}
    """
    url = (url or "").strip()
    if not url:
        return None
    if not re.match(r"https?://", url, re.I):
        url = "https://" + url
    host = _host(url)
    path = urlsplit(url).path
    if is_gowish_host(host):
        m = re.search(r"/creator/[^/]+/wishlist/([A-Za-z0-9-]+)", path)
        if m:
            return {"source": "gowish", "kind": "creator", "id": m.group(1), "url": url}
        m = re.search(r"/wishlists/([A-Za-z0-9-]+)(?:/|$)", path)
        if m and m.group(1) not in ("my", "others"):
            return {"source": "gowish", "kind": "wishlist", "id": m.group(1), "url": url}
        if re.search(r"/(?:share|s)/[^/]+", path) or re.fullmatch(r"/[A-Za-z0-9_-]{4,}", path or ""):
            return {"source": "gowish", "kind": "share", "id": None, "url": url}
        return None
    tld = _amazon_tld(host)
    if tld:
        m = re.search(r"/(?:hz/)?wishlist/(?:ls/|genericItemsPage/|)([A-Z0-9]{8,16})(?:[/?]|$)", path, re.I)
        if m:
            return {"source": "amazon", "kind": "list", "id": m.group(1).upper(), "tld": tld, "url": url}
        return None
    if host in AMAZON_SHORT_HOSTS:
        return {"source": "amazon", "kind": "short", "id": None, "tld": None, "url": url}
    return None


async def _follow(session: Any, url: str, timeout: Any) -> tuple[str, str, int]:
    """GET a page, following redirects only to hosts Family Hub reads from. Returns (final_url, text, status)."""
    for _hop in range(MAX_REDIRECTS + 1):
        if not allowed_host(_host(url)):
            raise WishlistImportError("That link leads somewhere other than GoWish or Amazon.")
        async with session.get(url, headers=BROWSER_HEADERS, timeout=timeout, allow_redirects=False) as resp:
            location = (getattr(resp, "headers", None) or {}).get("Location")
            if resp.status in (301, 302, 303, 307, 308) and location:
                url = urljoin(url, location)
                continue
            text = await resp.text(errors="ignore")
            return url, text, resp.status
    raise WishlistImportError("That link redirected too many times.")


async def _resolve_short(session: Any, info: dict[str, Any], timeout: Any) -> dict[str, Any]:
    """A GoWish share link or an Amazon short link: follow it and classify where it lands."""
    final_url, text, status = await _follow(session, info["url"], timeout)
    found = classify(final_url)
    if found and found["kind"] not in ("share", "short"):
        return found
    # some share pages carry the list's own address in the page instead of redirecting
    for pat in (r"https://gowish\.com/(?:[a-z]{2}/)?wishlists/[A-Za-z0-9-]+", r"https://www\.amazon\.[a-z.]+/hz/wishlist/ls/[A-Z0-9]+"):
        m = re.search(pat, text or "")
        if m:
            found = classify(m.group(0))
            if found and found["kind"] not in ("share", "short"):
                return found
    if info["source"] == "gowish":
        raise WishlistImportError("That GoWish link didn't open a wish list. Open the list in GoWish, tap Share, then Copy link.")
    raise WishlistImportError("That Amazon link didn't open a wish list.")


def _num(value: Any) -> float | None:
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if f == f and f not in (float("inf"), float("-inf")) and f >= 0 else None


def _clean_text(value: Any, limit: int) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _item(source: str, sid: str, title: Any, link: Any, image: Any, price: Any, currency: Any, note: Any) -> dict[str, Any] | None:
    title = _clean_text(title, 200)
    if not title or not sid:
        return None
    link = str(link or "").strip()
    image = str(image or "").strip()
    return {
        "sourceId": f"{source}:{sid}",
        "title": title,
        "link": link if link.startswith(("http://", "https://")) else "",
        "image": image if image.startswith(("http://", "https://")) else "",
        "price": _num(price),
        "currency": str(currency or "").strip().upper()[:3],
        "note": _clean_text(note, 400),
    }


async def _gowish_query(session: Any, query: str, variables: dict[str, Any], timeout: Any) -> dict[str, Any]:
    async with session.post(
        GOWISH_GRAPHQL,
        json={"query": query, "variables": variables},
        headers={"User-Agent": BROWSER_HEADERS["User-Agent"], "Content-Type": "application/json", "Origin": "https://gowish.com"},
        timeout=timeout,
    ) as resp:
        if resp.status != 200:
            raise WishlistImportError(f"GoWish answered with HTTP {resp.status}. Try again later.")
        try:
            body = await resp.json(content_type=None)
        except Exception as err:  # noqa: BLE001
            raise WishlistImportError("GoWish sent something Family Hub couldn't read.") from err
    errors = body.get("errors") if isinstance(body, dict) else None
    if errors:
        first = errors[0] if isinstance(errors[0], dict) else {}
        code = (first.get("extensions") or {}).get("code")
        if code in (404, "404") or "does not exist" in str(first.get("message", "")):
            raise WishlistImportError("GoWish couldn't find that wish list. It may have been deleted.")
        if code in (401, 403, "401", "403", "FORBIDDEN", "UNAUTHENTICATED"):
            raise WishlistImportError("That GoWish list is private. In GoWish, share it with a link first.")
        raise WishlistImportError(f"GoWish said: {first.get('message') or 'unknown error'}")
    return (body or {}).get("data") or {}


def _page_cursor(next_cursor: Any) -> int | None:
    if next_cursor in (None, "", 0, "0"):
        return None
    try:
        return int(next_cursor)
    except (TypeError, ValueError):
        return None


async def fetch_gowish(session: Any, info: dict[str, Any], timeout: Any) -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    title = ""
    cursor: int | None = 0
    pages = 0
    while cursor is not None and len(items) < MAX_ITEMS and pages < 10:
        pages += 1
        if info["kind"] == "creator":
            data = await _gowish_query(session, GOWISH_CREATOR_LIST_QUERY, {"id": info["id"], "input": {"cursor": cursor, "limit": 50}}, timeout)
            lst = (((data.get("creators") or {}).get("creatorList") or {}).get("getById")) or None
            if not lst:
                raise WishlistImportError("GoWish couldn't find that wish list. It may have been deleted.")
            title = lst.get("title") or title
            block = lst.get("creatorProducts") or {}
            for w in block.get("data") or []:
                it = _item("gowish", w.get("id"), w.get("title"), w.get("url"), w.get("photo"), w.get("price"), w.get("currency"), w.get("description"))
                if it:
                    items.append(it)
        else:
            data = await _gowish_query(session, GOWISH_WISHLIST_QUERY, {"id": info["id"], "input": {"cursor": cursor, "limit": 50}}, timeout)
            lst = data.get("wishlist") or None
            if not lst:
                raise WishlistImportError("GoWish couldn't find that wish list. It may have been deleted.")
            title = lst.get("title") or title
            block = lst.get("wishes") or {}
            for w in block.get("data") or []:
                photos = w.get("photos") or []
                photo = photos[0] if isinstance(photos, list) and photos else (photos if isinstance(photos, str) else "")
                it = _item("gowish", w.get("id"), w.get("title"), w.get("url"), photo, w.get("price"), w.get("currency"), w.get("description"))
                if it:
                    items.append(it)
        cursor = _page_cursor(block.get("nextCursor"))
    return {"source": "gowish", "title": title, "items": items[:MAX_ITEMS]}


# ---- Amazon ----
_AMZ_LI = re.compile(r"<li\b[^>]*\bdata-itemid=\"([^\"]+)\"[^>]*>", re.I)


def _attr(tag: str, name: str) -> str:
    m = re.search(r"\b" + re.escape(name) + r"=\"([^\"]*)\"", tag, re.I) or re.search(r"\b" + re.escape(name) + r"='([^']*)'", tag, re.I)
    return html_lib.unescape(m.group(1)) if m else ""


def _span_text(chunk: str, id_prefix: str) -> str:
    m = re.search(r"<(?:span|a)\b[^>]*\bid=\"" + re.escape(id_prefix) + r"[^\"]*\"[^>]*>(.*?)</(?:span|a)>", chunk, re.I | re.S)
    if not m:
        return ""
    return html_lib.unescape(re.sub(r"<[^>]+>", " ", m.group(1))).strip()


def parse_amazon_page(html: str, base_url: str, tld: str) -> tuple[list[dict[str, Any]], str, str | None]:
    """One page of a public Amazon list: (items, list title, url of the next page or None)."""
    if "validateCaptcha" in html or "api-services-support@amazon.com" in html:
        raise WishlistImportError("Amazon asked for a robot check. Family Hub will try again later.")
    title_m = re.search(r"<span[^>]*\bid=\"profile-list-name\"[^>]*>(.*?)</span>", html, re.I | re.S)
    title = html_lib.unescape(re.sub(r"<[^>]+>", "", title_m.group(1))).strip() if title_m else ""
    currency = AMAZON_TLD_CURRENCY.get(tld, "")
    items: list[dict[str, Any]] = []
    starts = [(m.start(), m.group(1), m.group(0)) for m in _AMZ_LI.finditer(html)]
    for i, (pos, item_id, li_tag) in enumerate(starts):
        if "g-item-sortable" not in li_tag:
            continue
        end = starts[i + 1][0] if i + 1 < len(starts) else len(html)
        chunk = html[pos:end]
        name_tag_m = re.search(r"<a\b[^>]*\bid=\"itemName_[^\"]*\"[^>]*>", chunk, re.I)
        name = _attr(name_tag_m.group(0), "title") if name_tag_m else ""
        if not name:
            name = _span_text(chunk, "itemName_")
        href = _attr(name_tag_m.group(0), "href") if name_tag_m else ""
        link = urljoin(base_url, href.split("?", 1)[0]) if href else ""
        img_m = re.search(r"<div\b[^>]*\bid=\"itemImage_[^\"]*\"[^>]*>.*?<img\b([^>]*)>", chunk, re.I | re.S)
        image = _attr(img_m.group(1), "src") if img_m else ""
        if "no_image" in image:
            image = ""
        price = _num(_attr(li_tag, "data-price"))
        try:
            wanted = int(_span_text(chunk, "itemRequested_") or "1")
            has = int(_span_text(chunk, "itemPurchased_") or "0")
        except ValueError:
            wanted, has = 1, 0
        if has >= wanted > 0:
            continue  # already bought on Amazon
        note = _span_text(chunk, "itemComment_")
        it = _item("amazon", item_id, name, link, image, price, currency, note)
        if it:
            items.append(it)
    next_url = None
    m = re.search(r"<script[^>]*data-a-state='\{\"key\":\"scrollState\"\}'[^>]*>(.*?)</script>", html, re.I | re.S)
    if m:
        try:
            state = json.loads(m.group(1))
            if state.get("lastEvaluatedKey") and state.get("showMoreUrl"):
                next_url = urljoin(base_url, html_lib.unescape(state["showMoreUrl"]))
        except (ValueError, AttributeError):
            next_url = None
    return items, title, next_url


async def fetch_amazon(session: Any, info: dict[str, Any], timeout: Any) -> dict[str, Any]:
    base = f"https://www.amazon.{info['tld']}"
    url = f"{base}/hz/wishlist/ls/{info['id']}?viewType=list&filter=unpurchased"
    items: list[dict[str, Any]] = []
    title = ""
    seen: set[str] = set()
    for _page in range(30):
        final_url, text, status = await _follow(session, url, timeout)
        if status == 404:
            raise WishlistImportError("Amazon couldn't find that list. Check it still exists.")
        if status in (403, 503):
            raise WishlistImportError("Amazon asked for a robot check. Family Hub will try again later.")
        if status != 200:
            raise WishlistImportError(f"Amazon answered with HTTP {status}. Try again later.")
        if "/ap/signin" in final_url:
            raise WishlistImportError("That Amazon list is private. In Amazon, set the list to Public.")
        page_items, page_title, next_url = parse_amazon_page(text, base, info["tld"])
        title = title or page_title
        for it in page_items:
            if it["sourceId"] not in seen:
                seen.add(it["sourceId"])
                items.append(it)
        if not next_url or len(items) >= MAX_ITEMS:
            break
        url = next_url
    if not items and not title:
        raise WishlistImportError("Family Hub couldn't read that Amazon list. Make sure it's set to Public.")
    return {"source": "amazon", "title": title, "items": items[:MAX_ITEMS]}


async def fetch_list(session: Any, url: str, timeout: Any) -> dict[str, Any]:
    """Read one linked list: {"source", "title", "items": [...]} or raise WishlistImportError."""
    info = classify(url)
    if not info:
        raise WishlistImportError("Family Hub can read GoWish and public Amazon wish lists. That link isn't one of them.")
    if info["kind"] in ("share", "short"):
        info = await _resolve_short(session, info, timeout)
    if info["source"] == "gowish":
        return await fetch_gowish(session, info, timeout)
    return await fetch_amazon(session, info, timeout)


# ---- Putting linked items on a person's own Family Hub wish list ----
# Items are ordinary to-do items in the person's wishlistEntity. Their description uses the same
# "[fh:wishlist-data]" JSON tail the To-Do Lists card reads (link, image, claim...), plus:
#   source      "gowish:<id>" / "amazon:<id>" - which outside item this is
#   sourceList  the linked list's address, so removing a link removes its items
#   price, currency
# Rules: a new outside item is added once; one someone deleted here stays deleted (the store
# remembers what was added); one that's gone from the outside list is removed unless someone has
# claimed it or tied a reward to it; a link that can't be read leaves its items alone.
WISHLIST_DATA_MARKER = "\n[fh:wishlist-data]\n"
SYNC_EVERY_HOURS = 6


def parse_description(raw: Any) -> tuple[str, dict[str, Any]]:
    text = raw if isinstance(raw, str) else ""
    idx = text.find(WISHLIST_DATA_MARKER)
    if idx == -1:
        return text, {}
    try:
        data = json.loads(text[idx + len(WISHLIST_DATA_MARKER):])
    except ValueError:
        data = {}
    return text[:idx], data if isinstance(data, dict) else {}


def build_description(note: str, data: dict[str, Any]) -> str:
    clean = {k: v for k, v in data.items() if v not in (None, "")}
    if not clean:
        return note or ""
    return (note or "") + WISHLIST_DATA_MARKER + json.dumps(clean, separators=(",", ":"), ensure_ascii=False)


def normalize_links(raw: Any) -> list[str]:
    out: list[str] = []
    if not isinstance(raw, list):
        return out
    for value in raw:
        url = str(value or "").strip()
        if url and not re.match(r"https?://", url, re.I):
            url = "https://" + url
        if url and url not in out:
            out.append(url[:500])
    return out[:20]


def plan_changes(
    existing: list[dict[str, Any]],
    links: list[str],
    fetched: dict[str, dict[str, Any]],
    known: dict[str, list[str]],
) -> dict[str, Any]:
    """Work out what to add / update / remove on the person's list. Pure, so it's testable.

    existing: the to-do items ({uid, summary, description, status}).
    fetched:  {link: {"items": [...]}} for each link read this time (failed ones left out).
    known:    {link: [sourceId, ...]} added before (from the store).
    Returns {"add": [(link, item)], "update": [(uid, description)], "remove": [uid], "known": {...}}.
    """
    by_source: dict[str, dict[str, Any]] = {}
    for todo in existing:
        note, data = parse_description(todo.get("description"))
        if data.get("source"):
            by_source.setdefault(str(data["source"]), {"todo": todo, "note": note, "data": data})
    add: list[tuple[str, dict[str, Any]]] = []
    update: list[tuple[str, str]] = []
    remove: list[str] = []
    new_known: dict[str, list[str]] = {}
    taken: set[str] = set()
    for link in links:
        if link not in fetched:
            if link in known:
                new_known[link] = list(known[link])
            continue
        before = set(known.get(link) or [])
        now_known: list[str] = []
        wanted = {}
        for it in fetched[link].get("items") or []:
            if it["sourceId"] not in wanted:
                wanted[it["sourceId"]] = it
        for sid, it in wanted.items():
            if sid in taken:
                continue
            taken.add(sid)
            here = by_source.get(sid)
            if here:
                now_known.append(sid)
                data = dict(here["data"])
                changed = False
                for key, value in (("link", it["link"]), ("image", it["image"]), ("price", it["price"]), ("currency", it["currency"]), ("sourceList", link)):
                    if value not in (None, "") and data.get(key) != value:
                        data[key] = value
                        changed = True
                if changed:
                    update.append((here["todo"]["uid"], build_description(here["note"], data)))
            elif sid in before:
                now_known.append(sid)  # added before and deleted here since: leave it deleted
            else:
                add.append((link, it))
                now_known.append(sid)
        for sid, here in by_source.items():
            if here["data"].get("sourceList") != link or sid in wanted:
                continue
            if here["data"].get("claimedBy") or here["data"].get("rewardItemId"):
                continue
            remove.append(here["todo"]["uid"])
        new_known[link] = now_known
    # links taken off the person's profile: their unclaimed items go too
    for sid, here in by_source.items():
        src_list = here["data"].get("sourceList")
        if src_list and src_list not in links and not here["data"].get("claimedBy") and not here["data"].get("rewardItemId"):
            remove.append(here["todo"]["uid"])
    return {"add": add, "update": update, "remove": list(dict.fromkeys(remove)), "known": new_known}


def new_item_description(link: str, it: dict[str, Any]) -> str:
    return build_description(it.get("note") or "", {
        "link": it.get("link"), "image": it.get("image"), "source": it["sourceId"], "sourceList": link,
        "price": it.get("price"), "currency": it.get("currency"),
    })
