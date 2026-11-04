#!/usr/bin/env python3
"""Pick *research topics* from overseas retro-gaming publishers' official RSS.

The articles signal editorial attention, NOT completed sales, prices or buyer demand.
Only public feed titles, publication dates and links are retained; no article scraping.
"""
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import json
from pathlib import Path
import re
from urllib.parse import urlsplit
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "data" / "overseas_news_signals.json"
FEEDS = {
    "Nintendo Life": "https://www.nintendolife.com/feeds/news",
    "Time Extension": "https://www.timeextension.com/feeds/news",
}
PRODUCT_TERMS = (
    ("Nintendo 3DS", r"\bnintendo 3ds\b|\b3ds\b", "Nintendo 3DS Japanese"),
    ("Nintendo DS", r"\bnintendo ds\b|\bnds\b", "Nintendo DS Japanese"),
    ("PSP", r"\bpsp\b|\bplaystation portable\b", "Sony PSP Japanese"),
    ("PS Vita", r"\b(ps vita|playstation vita)\b", "Sony PS Vita Japanese"),
    ("ゲームボーイ", r"\bgame[\s-]?boy\b", "Nintendo Game Boy Japanese"),
    ("ゲームキューブ", r"\bgamecube\b", "Nintendo GameCube Japanese"),
    ("NINTENDO64", r"\bnintendo 64\b|\bn64\b", "Nintendo 64 Japanese"),
    ("スーパーファミコン", r"\bsuper famicom\b|\bsnes\b", "Super Famicom Japanese game"),
    ("NEOGEO", r"\bneo[\s-]?geo\b|\bneogeo\b", "SNK Neo Geo Japanese game"),
    ("PCエンジン", r"\bpc engine\b|\bturbografx\b", "NEC PC Engine Japanese"),
    ("セガサターン", r"\bsega saturn\b", "Sega Saturn Japanese"),
    ("ドリームキャスト", r"\bdreamcast\b", "Sega Dreamcast Japanese"),
    ("ファミコン", r"\bfamicom\b|\bnes\b", "Nintendo Famicom Japanese game"),
    ("たまごっち", r"\btamagotchi\b", "Bandai Tamagotchi Japanese"),
    ("amiibo", r"\bamiibo\b", "Nintendo amiibo Japanese"),
)


def evidence_matched_search_term(label, headline, broad_term):
    """Only narrow to a model *explicitly named* in the article headline."""
    patterns = {
        "PSP": (
            (r"\bpsp[\s-]?3000\b", "Sony PSP 3000 Japanese"),
            (r"\bpsp[\s-]?2000\b", "Sony PSP 2000 Japanese"),
            (r"\bpsp[\s-]?1000\b", "Sony PSP 1000 Japanese"),
        ),
        "Nintendo DS": (
            (r"\bnintendo ds lite\b|\bds lite\b", "Nintendo DS Lite Japanese"),
        ),
        "ゲームボーイ": (
            (r"\bgame boy advance sp\b|\bgba sp\b", "Nintendo Game Boy Advance SP Japanese"),
            (r"\bgame boy advance\b|\bgba\b", "Nintendo Game Boy Advance Japanese"),
        ),
    }
    for regex, term in patterns.get(label, ()):
        if re.search(regex, headline, re.IGNORECASE):
            return term
    return broad_term

MAX_BYTES = 1_200_000


def valid_article_link(link, publisher):
    if not isinstance(link, str) or len(link) > 500:
        return False
    url = urlsplit(link)
    host = urlsplit(FEEDS[publisher]).hostname
    return (url.scheme == "https" and url.hostname == host
            and not url.username and not url.password and url.port is None
            and url.path.startswith("/news/"))


def parse_news_feed(raw, publisher, now=None):
    now = now or datetime.now(timezone.utc)
    if publisher not in FEEDS or not isinstance(raw, bytes) or not 0 < len(raw) <= MAX_BYTES:
        raise ValueError("Invalid publisher RSS input")
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as exc:
        raise ValueError("Invalid RSS XML") from exc
    if root.tag != "rss":
        raise ValueError("Not an RSS feed")
    channel = root.find("channel")
    if channel is None:
        raise ValueError("RSS channel missing")
    findings = []
    for item in channel.findall("item")[:200]:
        title, link, date = item.findtext("title"), item.findtext("link"), item.findtext("pubDate")
        if not isinstance(title, str) or not title.strip() or not date or not valid_article_link(link, publisher):
            continue
        try:
            published = parsedate_to_datetime(date)
        except (ValueError, TypeError, IndexError, OverflowError):
            continue
        if published.tzinfo is None:
            continue
        published = published.astimezone(timezone.utc)
        if not now - timedelta(days=7) <= published <= now + timedelta(hours=1):
            continue
        normalized = title.casefold()
        for label, pattern, search_term in PRODUCT_TERMS:
            if re.search(pattern, normalized, flags=re.IGNORECASE):
                findings.append({
                    "id": publisher.lower().replace(" ", "_") + "_" + str(len(findings)),
                    "product_name": label,
                    "term": evidence_matched_search_term(label, normalized, search_term),
                    "article_title": title.strip()[:180],
                    "article_url": link,
                    "publisher": publisher,
                    "published_at": published.isoformat(),
                    "signal_type": "overseas_editorial_product_mention",
                })
                break  # One lead per article to prevent inflated counts
    return findings


def build_record(source_feeds, now=None, failed=()):
    now = now or datetime.now(timezone.utc)
    if not source_feeds:
        raise ValueError("All foreign RSS publishers unavailable; previous feed must be preserved")
    findings = []
    seen = set()
    for publisher, articles in source_feeds.items():
        if publisher not in FEEDS:
            raise ValueError("Unknown publisher")
        for item in articles:
            key = (publisher, item["product_name"])
            if key in seen:
                continue
            seen.add(key)
            findings.append(item)
    findings.sort(key=lambda item: item["published_at"], reverse=True)
    return {
        "schema_version": 1,
        "source": "publisher_rss",
        "signal_type": "overseas_editorial_product_mention",
        "generated_at": now.isoformat(),
        "checked_sources": list(source_feeds),
        "failed_sources": list(failed),
        "articles": findings[:24],
        "notice": "Overseas retro-game press RSS mentions; NOT sales or proof of a profitable Japanese export. Follow each original article and verify eBay sold prices.",
    }


def fetch_feed(publisher):
    url = FEEDS[publisher]
    request = urllib.request.Request(url, headers={
        "User-Agent": "ExportScout-Research/1.0 (official RSS source; https://github.com/aiwork-tips/redesigned-giggle)",
        "Accept": "application/rss+xml,application/xml,text/xml",
    })
    with urllib.request.urlopen(request, timeout=12) as response:
        if response.status != 200:
            raise ValueError("Unexpected RSS status")
        return response.read(MAX_BYTES + 1)


def main():
    now = datetime.now(timezone.utc)
    parsed, failed = {}, []
    for publisher in FEEDS:
        try:
            parsed[publisher] = parse_news_feed(fetch_feed(publisher), publisher, now)
            print(f"{publisher}: {len(parsed[publisher])} product-related article leads")
        except Exception as exc:
            failed.append(publisher)
            print(f"{publisher}: feed unavailable ({type(exc).__name__})")
    record = build_record(parsed, now, failed)
    OUTPUT.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Overseas editorial mentions: {len(record['articles'])}; publishers checked: {len(parsed)}")


if __name__ == "__main__":
    main()
