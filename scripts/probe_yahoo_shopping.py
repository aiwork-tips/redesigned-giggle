#!/usr/bin/env python3
"""One-shot REAL Yahoo! Shopping API smoke test; no caching, no stored credentials.

This is not a price-profit ranking and is not an eBay sold-listing API.
Usage: YAHOO_SHOPPING_APP_ID=... python scripts/probe_yahoo_shopping.py "PSP-3000"
Never commit or paste the Client ID into the source code.
"""
import json
import os
import sys
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

API_URL = "https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch"


def valid_product_url(url):
    try:
        parsed = urlparse(url)
        return (
            parsed.scheme == "https"
            and parsed.hostname in {
                "store.shopping.yahoo.co.jp",
                "shopping.yahoo.co.jp",
                "paypaymall.yahoo.co.jp",
            }
            and not parsed.username
            and not parsed.password
            and not parsed.port
        )
    except (ValueError, TypeError):
        return False


def extract_items(response):
    """Return minimal source-attributed *active listings*, not inferred sold prices."""
    if not isinstance(response, dict) or not isinstance(response.get("hits"), list):
        raise ValueError("Unexpected Yahoo Shopping API response format")
    result = []
    for hit in response["hits"][:10]:
        if not isinstance(hit, dict):
            continue
        name = hit.get("name")
        price = hit.get("price")
        url = hit.get("url")
        if (not isinstance(name, str)
                or not name.strip()
                or type(price) is not int
                or not 0 < price <= 100_000_000
                or not isinstance(url, str)
                or not valid_product_url(url)):
            continue
        result.append({
            "name": name.strip()[:160],
            "price_jpy": price,
            "item_url": url,
            "source": "Yahoo!ショッピング",
            "evidence_type": "active_listing_not_sold",
        })
    return result[:5]


def query_items(app_id, keyword):
    if not isinstance(app_id, str) or not app_id.strip():
        raise ValueError("YAHOO_SHOPPING_APP_ID is missing")
    if not isinstance(keyword, str) or not 2 <= len(keyword.strip()) <= 64:
        raise ValueError("Search query must be 2-64 characters")
    params = urlencode({
        "appid": app_id,
        "query": keyword.strip(),
        "results": 10,
        "in_stock": "true",
    })
    # Avoid logging the full request URL because it embeds the Client ID.
    request = Request(API_URL + "?" + params, headers={"User-Agent": "ExportScoutAPIProbe/1.0"})
    with urlopen(request, timeout=15) as response:
        body = response.read(600_000)
        if response.read(1):
            raise ValueError("Unexpected oversized API response")
    return extract_items(json.loads(body))


def main():
    keyword = sys.argv[1] if len(sys.argv) == 2 else "PSP-3000"
    try:
        items = query_items(os.getenv("YAHOO_SHOPPING_APP_ID", ""), keyword)
    except Exception as exc:
        # Never print exception details: URLs may include the private app ID.
        print("Yahoo!商品検索APIに接続できませんでした。ID・利用権限・API応答を確認してください。")
        print("Error type:", type(exc).__name__)
        return 1
    if not items:
        print("APIには接続しましたが、条件に合う商品を確認できませんでした。")
        return 2
    print("取得元: Yahoo!ショッピング 商品検索API / 出品中 / 売却実績ではありません")
    print("検索キーワード:", keyword)
    for i, item in enumerate(items, 1):
        print(f'{i}. {item["name"]} | {item["price_jpy"]:,}円 | {item["item_url"]}')
    print("確認数:", len(items), "件（リクエストは1回のみ／データ保存なし）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
