#!/usr/bin/env python3
"""Read-only eBay Browse API references: active asking prices, not sold prices.

Production Buy API access requires eBay approval in addition to API credentials.
No scraping, no private tokens in the website, no inferred Japanese purchase costs.
"""
import base64
from collections import defaultdict
from datetime import datetime, timezone
import json
import math
import os
import pathlib
from statistics import median
import urllib.parse
import urllib.request

SEARCHES = ("Sony PSP 3000", "Nintendo DS Lite", "Nintendo 3DS", "PS Vita PCH-2000")
TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token"
SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search"


def request_json(url, headers, data=None):
    request = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(request, timeout=25) as response:
        return json.load(response)


def token(client_id, client_secret):
    basic = base64.b64encode((client_id + ":" + client_secret).encode()).decode()
    body = urllib.parse.urlencode({
        "grant_type": "client_credentials",
        "scope": "https://api.ebay.com/oauth/api_scope",
    }).encode()
    response = request_json(TOKEN_URL, {
        "Authorization": "Basic " + basic,
        "Content-Type": "application/x-www-form-urlencoded",
    }, body)
    access = response.get("access_token")
    if not isinstance(access, str) or not access:
        raise ValueError("No eBay OAuth application token")
    return access


def parse_listings(payload, query, checked_at):
    """Parse only valid, priced, active FIXED_PRICE marketplace items."""
    summaries = payload.get("itemSummaries", [])
    if not isinstance(summaries, list):
        raise ValueError("Unexpected Browse API result structure")
    found = []
    for item in summaries[:12]:
        if not isinstance(item, dict):
            continue
        price = item.get("price")
        if not isinstance(price, dict):
            continue
        try:
            amount = float(price.get("value"))
        except (TypeError, ValueError, OverflowError):
            continue
        title = item.get("title")
        url = item.get("itemWebUrl")
        if (price.get("currency") != "USD" or not math.isfinite(amount)
                or not 0 < amount < 100000 or not isinstance(title, str)
                or not title.strip() or not isinstance(url, str)):
            continue
        parts = urllib.parse.urlsplit(url)
        if (parts.scheme != "https" or parts.netloc != "www.ebay.com"
                or not parts.path.startswith("/itm/")):
            continue
        raw_id = item.get("itemId")
        item_id = raw_id if isinstance(raw_id, str) and raw_id else parts.path
        condition = item.get("condition")
        found.append({
            "item_id": item_id[:200],
            "query": query,
            "title": title.strip()[:200],
            "listing_price_usd": round(amount, 2),
            "currency": "USD",
            "condition": condition[:80] if isinstance(condition, str) else "未確認",
            "listing_url": url,
            "checked_at": checked_at,
            "price_type": "active_listing_asking_price",
        })
    return found


def deduplicate(items):
    """One entry per eBay listing ID across all search terms."""
    seen = set()
    unique = []
    for item in items:
        key = item["item_id"]
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


def summarize(items):
    """Descriptive active listing statistics only; not completed-sale averages."""
    prices = defaultdict(list)
    for item in items:
        prices[item["query"]].append(item["listing_price_usd"])
    return [{
        "query": query,
        "sample_count": len(values),
        "median_listing_price_usd": round(median(values), 2),
        "min_listing_price_usd": round(min(values), 2),
        "max_listing_price_usd": round(max(values), 2),
        "price_type": "active_listing_asking_price",
    } for query, values in sorted(prices.items())]


def build_record(payloads, checked_at):
    all_items = []
    for query, payload in payloads:
        all_items.extend(parse_listings(payload, query, checked_at))
    items = deduplicate(all_items)
    if not items:
        raise ValueError("No valid listings; refusing to publish empty data")
    return {
        "schema_version": 1,
        "generated_at": checked_at,
        "source": "ebay_browse_api",
        "price_type": "active_listing_asking_price",
        "items": items,
        "groups": summarize(items),
        "notice": "These are ACTIVE ASKING prices, not sold prices. Shipping, condition differences, and Japan sourcing costs are not normalized. No automatic profit rankings.",
    }


def main():
    client_id = os.environ.get("EBAY_CLIENT_ID")
    secret = os.environ.get("EBAY_CLIENT_SECRET")
    if not client_id or not secret:
        print("eBay production access not configured; existing data left unchanged")
        return
    access = token(client_id, secret)
    checked_at = datetime.now(timezone.utc).isoformat()
    payloads = []
    for query in SEARCHES:
        params = urllib.parse.urlencode({
            "q": query, "limit": 12, "filter": "buyingOptions:{FIXED_PRICE}",
        })
        response = request_json(SEARCH_URL + "?" + params, {
            "Authorization": "Bearer " + access,
            "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
            "Accept": "application/json",
        })
        payloads.append((query, response))
    record = build_record(payloads, checked_at)
    path = pathlib.Path("data/ebay_active.json")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Verified active listing references:", len(record["items"]), "groups:", len(record["groups"]))


if __name__ == "__main__":
    main()
