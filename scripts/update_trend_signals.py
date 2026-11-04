#!/usr/bin/env python3
"""Read Google Trends' official RSS export by country; flag related interest only.

This does not retrieve purchase volume, sales, eBay sold prices, or merchandise
bestseller rankings. It writes only matched search terms, timestamps, country,
and links to Google's original Trends interface, never full articles.
"""
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import json
from pathlib import Path
import re
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
EVIDENCE = ROOT / "data" / "trend_evidence.json"
BRAND_TOPICS = ROOT / "data" / "trend_brand_watchlist.json"
OUTPUT = ROOT / "data" / "trend_signals.json"
REGIONS = ("US", "GB", "CA", "AU", "TW", "HK")
ALIASES = {
    "beyblade_x": (r"\bbeyblade\b", "ベイブレード"),
    "neo_geo_ss": (r"\bneo[\s-]?geo\b", r"\bsamurai shodown\b", "サムライスピリッツ"),
    "neo_geo_kof": (r"\bking of fighters\b", r"\bkof\b"),
    "mofusand": (r"\bmofusand\b", "モフサンド"),
    "tamon_acrylic": (r"\btamon[\s-]?kun\b", "多聞くん"),
    "kaguya_acrylic": (r"\bsuper princess kaguya\b", "超かぐや姫"),
    "pokemon_tcg": (r"\bpok[eé]mon\b", "ポケモン", "ポケットモンスター"),
    "demon_goods": (r"\bdemon slayer\b", r"\bkimetsu\b", "鬼滅の刃"),
    "seiko_used": (r"\bseiko\b", "セイコー"),
    "japan_fishing": (r"\bshimano\b", r"\bdaiwa\b"),
    "graded_manga": (r"\bone piece\b", "ワンピース"),
}
MAX_RSS_BYTES = 1_200_000


def rss_url(geo):
    if geo not in REGIONS:
        raise ValueError("Unsupported geo")
    return "https://trends.google.com/trending/rss?geo=" + geo


def feed_items(xml_bytes, now=None):
    """Parse limited RSS bytes, return fresh title/timestamp only."""
    now = now or datetime.now(timezone.utc)
    if not isinstance(xml_bytes, bytes) or not xml_bytes or len(xml_bytes) > MAX_RSS_BYTES:
        raise ValueError("Unexpected RSS size")
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as exc:
        raise ValueError("Invalid Google Trends XML") from exc
    if root.tag != "rss":
        raise ValueError("Unexpected RSS root")
    channel = root.find("channel")
    if channel is None:
        raise ValueError("RSS channel missing")
    titles = []
    for item in channel.findall("item")[:250]:
        title = item.findtext("title")
        date = item.findtext("pubDate")
        if not isinstance(title, str) or not title.strip() or not date:
            continue
        try:
            published = parsedate_to_datetime(date)
        except (TypeError, ValueError, IndexError, OverflowError):
            continue
        if published.tzinfo is None:
            continue
        published = published.astimezone(timezone.utc)
        if now - timedelta(days=7) <= published <= now + timedelta(hours=1):
            titles.append((title.strip()[:160], published))
    return titles


def validated_brand_topics(data):
    """Watch terms are research prompts, never evidence of a completed sale."""
    if data is None:
        return []
    rows = data.get("topics")
    if (data.get("schema_version") != 1
            or data.get("document_type") != "japanese_brand_related_search_watchlist"
            or not isinstance(rows, list) or not 1 <= len(rows) <= 100):
        raise ValueError("Invalid brand-topic catalog")
    seen = set()
    validated = []
    for x in rows:
        if not isinstance(x, dict):
            raise ValueError("Invalid topic entry")
        ident, name, term, aliases = (x.get("id"), x.get("name"), x.get("term"), x.get("aliases"))
        if (not isinstance(ident, str) or not re.fullmatch(r"[a-z0-9_]{3,45}", ident)
                or ident in seen or not isinstance(name, str) or not name.strip()
                or not isinstance(term, str) or not 2 <= len(term) <= 120
                or not isinstance(x.get("enabled"), bool) or not isinstance(aliases, list)
                or not 1 <= len(aliases) <= 10):
            raise ValueError("Invalid or duplicate topic")
        for pattern in aliases:
            if not isinstance(pattern, str) or not 2 <= len(pattern) <= 100:
                raise ValueError("Invalid alias pattern")
            try:
                re.compile(pattern, re.IGNORECASE)
            except re.error as exc:
                raise ValueError("Invalid search alias regex") from exc
        seen.add(ident)
        if x["enabled"]:
            validated.append((ident, name, term, aliases))
    return validated


def extract_signals(region_feed, evidence, now=None, topics=None):
    """Map official RSS search rises to *research prompts*, not product sales."""
    now = now or datetime.now(timezone.utc)
    picks = evidence.get("picks")
    if evidence.get("schema_version") != 1 or not isinstance(picks, list):
        raise ValueError("Invalid evidence catalog")
    by_id = {x["id"]: x for x in picks}
    if set(ALIASES) - set(by_id):
        raise ValueError("Missing named research candidate")
    watched = [(pid, by_id[pid]["name"], by_id[pid]["term"], patterns,
                "reported_crossborder_demand") for pid, patterns in ALIASES.items()]
    watched += [(pid, name, term, patterns, "curated_brand_interest")
                for pid, name, term, patterns in validated_brand_topics(topics)]
    ids = [x[0] for x in watched]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate research signal IDs")
    results, seen = [], set()
    for geo, items in region_feed.items():
        if geo not in REGIONS:
            raise ValueError("Unsupported region")
        for headline, published in items:
            normalized = headline.casefold()
            for product_id, name, term, patterns, evidence_class in watched:
                if not any(re.search(p, normalized, re.IGNORECASE) for p in patterns):
                    continue
                key = (product_id, geo)
                if key in seen:
                    continue
                seen.add(key)
                results.append({
                    "id": product_id + "_" + geo,
                    "product_id": product_id,
                    "name": name,
                    "term": term,
                    "matched_query": headline,
                    "region": geo,
                    "observed_at": published.isoformat(),
                    "signal_type": "google_trends_related_keyword",
                    "evidence_class": evidence_class,
                    "source_url": "https://trends.google.com/trending?geo=" + geo,
                    "note": "A related search term was rising; this does NOT prove these Japanese goods sold or will sell.",
                })
    return sorted(results, key=lambda x: x["observed_at"], reverse=True)[:40]


def retrieve_region(geo):
    url = rss_url(geo)
    req = urllib.request.Request(url, headers={
        "User-Agent": "ExportScout-Research/1.0 (public RSS; https://github.com/aiwork-tips/redesigned-giggle)",
        "Accept": "application/rss+xml,application/xml,text/xml",
    })
    with urllib.request.urlopen(req, timeout=12) as response:
        if response.status != 200:
            raise ValueError("RSS HTTP failure")
        raw = response.read(MAX_RSS_BYTES + 1)
    return raw


def build_record(feeds, evidence, now=None, failed=(), topics=None):
    now = now or datetime.now(timezone.utc)
    if not feeds:
        raise ValueError("No country RSS source verified; preserve previous data")
    signals = extract_signals(feeds, evidence, now, topics)
    return {
        "schema_version": 1,
        "generated_at": now.isoformat(),
        "source": "google_trends_rss",
        "signal_type": "google_trends_related_keyword",
        "checked_regions": list(feeds),
        "failed_regions": list(failed),
        "signals": signals,
        "notice": "Related Google Trends searches from reported cross-border topics and curated Japan-origin brand watch terms. NOT product sales or current bestseller rankings.",
    }


def main():
    now = datetime.now(timezone.utc)
    evidence = json.loads(EVIDENCE.read_text(encoding="utf-8"))
    brand_topics = json.loads(BRAND_TOPICS.read_text(encoding="utf-8"))
    feeds, failed = {}, []
    for geo in REGIONS:
        try:
            rows = feed_items(retrieve_region(geo), now)
            feeds[geo] = rows
            print(f"Google Trends {geo}: {len(rows)} recent queries")
        except Exception as exc:
            failed.append(geo)
            print(f"Google Trends {geo}: unavailable ({type(exc).__name__})")
    result = build_record(feeds, evidence, now, failed, brand_topics)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Research signals: {len(result['signals'])}; countries checked: {len(feeds)}; failed: {len(failed)}")


if __name__ == "__main__":
    main()
