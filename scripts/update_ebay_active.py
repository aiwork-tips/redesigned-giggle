#!/usr/bin/env python3
"""Fetch eBay ACTIVE listing reference prices, never sold prices.

Requires EBAY_CLIENT_ID and EBAY_CLIENT_SECRET as GitHub Actions secrets.
Never logs credentials, and never infers sold prices or Japanese sourcing costs.
"""
import base64
import json
import os
import pathlib
import urllib.parse
import urllib.request
from datetime import datetime, timezone

SEARCHES = ["Sony PSP 3000", "Nintendo DS Lite", "Nintendo 3DS", "PS Vita PCH-2000"]
TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token"
SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search"

def request_json(url, headers, data=None):
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=25) as res:
        return json.load(res)

def token(client_id, client_secret):
    credentials = base64.b64encode((client_id + ":" + client_secret).encode()).decode()
    data = urllib.parse.urlencode({"grant_type": "client_credentials", "scope": "https://api.ebay.com/oauth/api_scope"}).encode()
    response = request_json(TOKEN_URL, {"Authorization": "Basic " + credentials, "Content-Type": "application/x-www-form-urlencoded"}, data)
    value = response.get("access_token")
    if not isinstance(value, str) or not value:
        raise ValueError("No OAuth access token")
    return value

def parse_listings(payload, query, now):
    if not isinstance(payload.get("itemSummaries", []), list):
        raise ValueError("Unexpected Browse API response")
    out = []
    for item in payload.get("itemSummaries", [])[:12]:
        price = item.get("price") or {}
        try:
            amount = float(price.get("value"))
        except (TypeError, ValueError):
            continue
        currency = price.get("currency")
        url = item.get("itemWebUrl")
        title = item.get("title")
        if currency != "USD" or not (0 < amount < 100000) or not isinstance(title, str) or not isinstance(url, str) or not url.startswith("https://www.ebay.com/itm/"):
            continue
        out.append({"query": query, "title": title[:200], "listing_price_usd": amount, "currency": "USD", "listing_url": url, "checked_at": now, "price_type": "active_listing_asking_price"})
    return out

def main():
    cid, secret = os.environ.get("EBAY_CLIENT_ID"), os.environ.get("EBAY_CLIENT_SECRET")
    if not cid or not secret:
        print("eBay API not configured; existing data left unchanged")
        return
    access = token(cid, secret)
    now = datetime.now(timezone.utc).isoformat()
    items = []
    for query in SEARCHES:
        params = urllib.parse.urlencode({"q": query, "limit": 12, "filter": "buyingOptions:{FIXED_PRICE}"})
        payload = request_json(SEARCH_URL + "?" + params, {"Authorization": "Bearer " + access, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US", "Accept": "application/json"})
        items.extend(parse_listings(payload, query, now))
    if not items:
        raise ValueError("No valid active listing data; refusing to replace existing feed")
    record = {"schema_version": 1, "generated_at": now, "source": "ebay_browse_api", "price_type": "active_listing_asking_price", "items": items, "notice": "Active listing asking prices, NOT sold prices. Japanese sourcing costs are not available. Do not use as realized profit."}
    dest = pathlib.Path("data/ebay_active.json")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Validated active listing references:", len(items))

if __name__ == "__main__":
    main()
