#!/usr/bin/env python3
"""Export Scout v6: conservative, one-shot real marketplace research collector.

Requires Yahoo Shopping Client ID (and optionally Soldgraph key) via environment.
A run calls Yahoo exactly once and Soldgraph at most once. No scheduling, writes,
credential echoing, automatic publication, or unsupported cross-market pairing.

The generated JSON is an EPHEMERAL REVIEW FILE, not an approved published feed.
Run in GitHub Actions and retain at most 1 day; never commit live API data automatically.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import re
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

YAHOO = "https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch"
SG = "https://api.soldgraph.com"
MAX_BYTES = 700_000
SAFE_SHOPPING_HOSTS = {"store.shopping.yahoo.co.jp", "shopping.yahoo.co.jp"}
MAX_REQUESTS_SOLDGRAPH = 1
SEARCH_CATEGORIES = {
    "game": "ゲーム・ホビー",
    "watch": "時計・アクセサリー",
    "camera": "カメラ・光学機器",
    "electronics": "家電・オーディオ",
    "fashion": "ファッション",
    "craft": "雑貨・工芸品",
    "collectible": "コレクター用品",
    "book": "本・音楽",
    "other": "その他",
}


class CollectorError(Exception):
    """A safe, non-credential-bearing error type."""


def valid_shop_url(value: object) -> bool:
    if not isinstance(value, str) or len(value) > 1000:
        return False
    try:
        u = urlparse(value)
        return (u.scheme == "https"
                and u.hostname in SAFE_SHOPPING_HOSTS
                and not u.username and not u.password and u.port is None)
    except ValueError:
        return False


def get_json(url: str, headers: dict | None = None):
    # No redirects; secrets must never flow to another host.
    from urllib.request import build_opener, HTTPRedirectHandler

    class NoRedirect(HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, hdrs, newurl):
            return None

    req = Request(url, headers={"User-Agent": "ExportScout-PrivateProbe/0.1", **(headers or {})})
    with build_opener(NoRedirect).open(req, timeout=25) as resp:
        raw = resp.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise CollectorError("APIの応答サイズが上限を超えました")
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise CollectorError("APIから想定外のデータ型が返りました")
    return data


def yahoo_request(client_id: str, keyword: str):
    if not client_id:
        raise CollectorError("Yahoo Shopping Client ID がGitHub Secretにありません")
    # 1 request, 10 listed products. No retries, no persisted credentials.
    url = YAHOO + "?" + urlencode({
        "appid": client_id, "query": keyword,
        "results": 10, "in_stock": "true",
    })
    try:
        return get_json(url)
    except (HTTPError, URLError, ValueError, json.JSONDecodeError) as exc:
        # Never print urllib errors; their message may contain credentialed query URL.
        raise CollectorError("Yahoo Shoppingの取得に失敗しました (" + type(exc).__name__ + ")") from None


def yahoo_normalize(payload: dict, category: str, observed_at: str):
    hits = payload.get("hits")
    if not isinstance(hits, list):
        raise CollectorError("Yahoo Shoppingの商品レスポンスが不正です")
    found = []
    seen = set()
    for hit in hits[:10]:
        if not isinstance(hit, dict):
            continue
        name, price, link = hit.get("name"), hit.get("price"), hit.get("url")
        if not (isinstance(name, str) and 2 <= len(name.strip()) <= 200
                and type(price) is int and 0 < price <= 100_000_000
                and valid_shop_url(link)):
            continue
        if link in seen:
            continue
        seen.add(link)
        code = hit.get("code")
        stable = str(code)[:90] if isinstance(code, str) and code else link
        item_id = "yahoo:" + hashlib.sha256(stable.encode("utf-8")).hexdigest()[:24]
        found.append({
            "id": item_id,
            "name": name.strip(),
            "category": SEARCH_CATEGORIES[category],
            "japanRelation": "sourced_in_japan",
            "domestic": {
                "source": "yahoo_shopping", "currency": "JPY",
                "priceJpy": price, "url": link, "observedAt": observed_at
            },
            "overseas": None,
            "assumptions": None
        })
    return found


def safe_soldgraph_job_url(path: object) -> str:
    if not isinstance(path, str) or not re.fullmatch(r"/v1/jobs/[A-Za-z0-9_-]{6,128}", path):
        raise CollectorError("Soldgraphのジョブパスが不正です")
    return SG + path + "?wait=20"


def soldgraph_research(api_key: str, keyword: str):
    """At most one credit-bearing sold search; polls are free per provider."""
    if not api_key:
        return {"state": "not_configured", "description": "Soldgraph API key未設定"}

    url = SG + "/v1/ebay/sold?" + urlencode({
        "q": keyword, "country": "us", "sort": "recently_sold",
        "page": 1, "count": 40
    })
    headers = {"Authorization": "Bearer " + api_key}
    try:
        payload = get_json(url, headers)
        polls = 0
        while payload.get("status") == "pending":
            polls += 1
            if polls > 4:
                raise CollectorError("Soldgraphのジョブが完了しませんでした。再検索せず停止します")
            payload = get_json(safe_soldgraph_job_url(payload.get("poll_url")), headers)
        if payload.get("status") != "complete":
            raise CollectorError("Soldgraphの取得は完了しませんでした")
    except (HTTPError, URLError, json.JSONDecodeError, ValueError) as exc:
        raise CollectorError("Soldgraphの取得に失敗しました (" + type(exc).__name__ + ")") from None
    result = payload.get("result")
    if not isinstance(result, dict) or result.get("provider") != "ebay" or result.get("country") != "us":
        raise CollectorError("Soldgraphの取得元・地域が想定外です")
    summary = result.get("summary")
    if not isinstance(summary, dict):
        raise CollectorError("Soldgraphの要約が不足しています")
    priced = summary.get("priced_count")
    if type(priced) is not int or not 0 <= priced <= 200:
        raise CollectorError("Soldgraphの比較件数が不正です")

    median = summary.get("median_excluding_best_offer")
    if type(median) not in (int, float) or median <= 0 or median > 1_000_000:
        median = None
    currency = summary.get("currency")
    if currency != "USD":
        median = None
    return {
        "state": "complete",
        "provider": "soldgraph",
        "marketplace": "ebay",
        "country": "us",
        "keyword": keyword,
        "priced_count_on_page": priced,
        "median_excluding_best_offer_usd": median,
        "source_page_is_complete_history": False,
        "data_basis": "One seller-marketplace results page. No SKU identity confirmation.",
        "observed_at": result.get("collected_at") if isinstance(result.get("collected_at"), str) else None,
        "credits_reported": payload.get("credits") if type(payload.get("credits")) is int else None
    }


def choose_auto_target(day=None):
    """Rotate broad cross-category research targets: one keyword per day.

    Selection is free; repeating the paid API fetch still consumes credits.
    """
    if day is None:
        day = datetime.now(timezone.utc).date()
    source = Path(__file__).resolve().parents[1] / "data" / "research_targets.json"
    raw = json.loads(source.read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or raw.get("schemaVersion") != 1:
        raise CollectorError("自動検索リストの形式が不正")
    targets = raw.get("targets")
    if not isinstance(targets, list) or not 1 <= len(targets) <= 100:
        raise CollectorError("自動検索リストが空、または不正")
    for item in targets:
        if (not isinstance(item, dict)
                or not isinstance(item.get("keyword"), str)
                or not 2 <= len(item["keyword"].strip()) <= 70
                or item.get("category") not in SEARCH_CATEGORIES):
            raise CollectorError("自動検索キーワードに不備があります")
    from datetime import date
    index = (day - date(2026, 1, 1)).days % len(targets)
    return targets[index]["keyword"], targets[index]["category"]


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--keyword", default="", help="省略するとジャンル横断の自動ローテーション")
    parser.add_argument("--category", default="auto", choices=["auto", *SEARCH_CATEGORIES])
    parser.add_argument("--output", required=True)
    parser.add_argument("--soldgraph", action="store_true",
                        help="Spend at most 1 Soldgraph free credit for one query, if key configured")
    args = parser.parse_args(argv)
    keyword = args.keyword.strip()
    if not keyword:
        keyword, selected_category = choose_auto_target()
    else:
        selected_category = args.category if args.category != "auto" else "other"
    if not (2 <= len(keyword) <= 70) or any(ord(c) < 32 for c in keyword):
        raise CollectorError("検索語は2〜70文字の通常テキストにしてください")
    yahoo_key = os.environ.get("YAHOO_SHOPPING_APP_ID", "")
    soldgraph_key = os.environ.get("SOLDGRAPH_KEY", "") if args.soldgraph else ""
    if args.soldgraph and not soldgraph_key:
        raise CollectorError("Soldgraphを有効にしたけどAPIキーが設定されていません")

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    yahoo_payload = yahoo_request(yahoo_key, keyword)
    items = yahoo_normalize(yahoo_payload, selected_category, now)
    if not items:
        raise CollectorError("Yahoo Shoppingで有効な出品商品が確認できなかったため、ファイルは生成しません")
    soldgraph = soldgraph_research(soldgraph_key, keyword)
    report = {
        "kind": "export-scout-discovery-v6",
        "schemaVersion": 1,
        "generatedAt": now,
        "items": items,
        "research_context": {
            "keyword": keyword,
            "category": SEARCH_CATEGORIES[selected_category],
            "soldgraph": soldgraph,
            "automatically_matched_skus": 0,
            "warnings": [
                "国内出品価格は国内商品の販売実績ではありません",
                "海外の比較値は検索キーワード単位の参考であり、国内商品と同一SKUとは限りません",
                "実際の売却価格・送料・各種手数料は確認が必要です"
            ]
        }
    }
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    dest = Path(args.output)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(encoded, encoding="utf-8")
    print("今回の調査キーワード：", keyword)
    print("実在する国内出品商品：", len(items), "件")
    print("海外の参考データ：", "取得" if soldgraph.get("state") == "complete" else "未取得")
    print("日本商品・同一SKU・利益判定：未確認（自動判定しません）")
    print("検証用JSON生成：完了（GitHubリポジトリへのコミットは行いません）")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except CollectorError as exc:
        print("収集を停止しました：" + str(exc))
        raise SystemExit(1) from None
