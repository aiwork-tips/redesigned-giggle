#!/usr/bin/env python3
"""Build provenance-labelled comparison inputs, NEVER a claim of realized profit.

Only source-linked completed-sale totals and active Japanese delivered-cost offers
may be paired. Missing/old/mismatched evidence fails closed. No network scraping,
hardcoded prices, or automatic promotion of active eBay asking prices.
"""
from collections import defaultdict
from datetime import datetime, timedelta, timezone
import json
import math
from pathlib import Path
from statistics import median
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
SOLD_PATH = ROOT / "data/completed_sales.json"
DOMESTIC_PATH = ROOT / "data/domestic_offers.json"
TARGETS_PATH = ROOT / "data/research_targets.json"
OUTPUT_PATH = ROOT / "data/opportunity_pairs.json"

ALLOWED_DOMESTIC_HOSTS = {"jp.mercari.com", "auctions.yahoo.co.jp"}
ALLOWED_CONDITIONS = {"used", "new"}
MAX_RECORDS = 2000


def checked_date(value, now, max_age_days, field):
    if not isinstance(value, str):
        raise ValueError(f"Missing {field}")
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"Invalid {field}") from exc
    if dt.tzinfo is None:
        raise ValueError(f"Timezone required: {field}")
    utc = dt.astimezone(timezone.utc)
    if utc > now + timedelta(hours=1) or now - utc > timedelta(days=max_age_days):
        return None  # Expired/future evidence must never be ranked
    return utc


def positive_number(value, field, ceiling):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"Non-numeric {field}")
    if not math.isfinite(value) or not 0 < value < ceiling:
        raise ValueError(f"Out-of-range {field}")
    return value


def source_link(url, service):
    if not isinstance(url, str) or len(url) > 500:
        raise ValueError("Missing or excessive source URL")
    parts = urlsplit(url)
    hosts = {"www.ebay.com"} if service == "sold" else ALLOWED_DOMESTIC_HOSTS
    if parts.scheme != "https" or parts.hostname not in hosts or parts.username or parts.password or parts.port:
        raise ValueError("Invalid source host")
    if service == "sold" and not parts.path.startswith("/itm/"):
        raise ValueError("Not an eBay item link")
    if service == "domestic" and parts.hostname == "jp.mercari.com" and not parts.path.startswith("/item/"):
        raise ValueError("Not a Mercari product link")
    if service == "domestic" and parts.hostname == "auctions.yahoo.co.jp" and not parts.path.startswith("/jp/auction/"):
        raise ValueError("Not a Yahoo Auctions item link")
    return url


def read_feed(path, kind):
    feed = json.loads(Path(path).read_text(encoding="utf-8"))
    expected = "completed_sale_total_usd" if kind == "sold" else "domestic_delivered_asking_price_jpy"
    if feed.get("schema_version") != 1 or feed.get("price_type") != expected:
        raise ValueError("Incompatible evidence feed")
    items = feed.get("items")
    if not isinstance(items, list) or len(items) > MAX_RECORDS:
        raise ValueError("Invalid evidence row count")
    if items and feed.get("source") != "source_linked":
        raise ValueError("Non-empty feed must declare source_linked provenance")
    if not items and feed.get("source") not in ("not_connected", "source_linked"):
        raise ValueError("Invalid empty-feed source")
    return items


def build_pairs(catalog, sold_rows, domestic_rows, now=None):
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("Aware current time required")
    if catalog.get("schema_version") != 1 or not isinstance(catalog.get("targets"), list):
        raise ValueError("Invalid target catalog")
    targets = {row["id"]: row for row in catalog["targets"] if row.get("enabled") is True}
    sales, offers = defaultdict(list), defaultdict(list)
    for kind, rows, grouped in (("sold", sold_rows, sales), ("domestic", domestic_rows, offers)):
        if not isinstance(rows, list) or len(rows) > MAX_RECORDS:
            raise ValueError("Invalid input size")
        used_urls = set()
        for item in rows:
            if not isinstance(item, dict):
                raise ValueError("Malformed evidence row")
            target = item.get("target_id")
            condition = item.get("condition")
            if not isinstance(target, str) or target not in targets or condition not in ALLOWED_CONDITIONS:
                raise ValueError("Unknown target or product condition")
            url = source_link(item.get("source_url"), kind)
            if url in used_urls:
                continue
            used_urls.add(url)
            checked = checked_date(item.get("checked_at"), now, 14 if kind == "sold" else 7, "checked_at")
            if kind == "sold":
                date = checked_date(item.get("sold_at"), now, 90, "sold_at")
                amount = positive_number(item.get("buyer_paid_total_usd"), "buyer_paid_total_usd", 100000)
                if item.get("sale_status") != "completed":
                    raise ValueError("Non-completed eBay listing cannot be sold evidence")
            else:
                date = checked
                amount = positive_number(item.get("domestic_delivered_cost_jpy"), "domestic_delivered_cost_jpy", 10000000)
                if item.get("availability") != "active":
                    raise ValueError("Domestic offer is not currently active")
            if date is None or checked is None:
                continue
            grouped[(target, condition)].append((amount, url, checked))
    pairs = []
    for key, sales_for_key in sales.items():
        domestic_for_key = offers.get(key)
        if len(sales_for_key) < 2 or not domestic_for_key:
            continue  # Require at least two distinct completed-sale examples
        target_id, condition = key
        target = targets[target_id]
        best_offer = min(domestic_for_key, key=lambda row: row[0])
        price_median = round(median(v[0] for v in sales_for_key), 2)
        pairs.append({
            "target_id": target_id,
            "query": target["query"],
            "category": target["category"],
            "condition": condition,
            "median_completed_sale_total_usd": price_median,
            "completed_sale_samples": len(sales_for_key),
            "sample_sale_urls": [v[1] for v in sales_for_key[:5]],
            "min_domestic_delivered_cost_jpy": round(best_offer[0]),
            "domestic_offer_url": best_offer[1],
            "last_sale_checked_at": max(v[2] for v in sales_for_key).isoformat(),
            "domestic_offer_checked_at": best_offer[2].isoformat(),
            "price_type": "historical_sale_vs_active_domestic_offer",
        })
    pairs.sort(key=lambda x: (x["target_id"], x["condition"]))
    return {
        "schema_version": 1,
        "source": "source_linked_evidence" if pairs else "not_connected",
        "price_type": "historical_sale_vs_active_domestic_offer",
        "generated_at": max((max(x["last_sale_checked_at"], x["domestic_offer_checked_at"]) for x in pairs), default=None),
        "items": pairs,
        "notice": "Only format, dates and URL hosts were checked, NOT the truth of the external listings. Historical sale totals and active Japanese offers are not simultaneously executable. Shipping, eBay fees and currency are personal assumptions. No guaranteed profit.",
    }


def main():
    catalog = json.loads(TARGETS_PATH.read_text(encoding="utf-8"))
    sales = read_feed(SOLD_PATH, "sold")
    offers = read_feed(DOMESTIC_PATH, "domestic")
    result = build_pairs(catalog, sales, offers)
    OUTPUT_PATH.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Paired reference candidates: {len(result['items'])}; price feeds connected: {bool(sales and offers)}")


if __name__ == "__main__":
    main()
