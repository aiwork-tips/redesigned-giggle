"""Offline RSS fixtures: verify candidate matching and non-sales provenance."""
from datetime import datetime, timedelta, timezone
import json
from copy import deepcopy
from pathlib import Path
import unittest

from scripts.update_trend_signals import REGIONS, build_record, extract_signals, feed_items, rss_url, validated_brand_topics

NOW = datetime(2026, 11, 4, 6, tzinfo=timezone.utc)
EVIDENCE = json.loads(Path("data/trend_evidence.json").read_text(encoding="utf-8"))
BRAND_TOPICS = json.loads(Path("data/trend_brand_watchlist.json").read_text(encoding="utf-8"))


def sample_rss(headline, published="Wed, 04 Nov 2026 04:00:00 +0000"):
    return ('<?xml version="1.0" encoding="UTF-8"?>'
            '<rss version="2.0"><channel><title>Trends</title><item><title>'
            + headline + '</title><pubDate>' + published +
            '</pubDate></item></channel></rss>').encode("utf-8")


class TrendsFeedTests(unittest.TestCase):
    def test_known_google_trends_rss_url(self):
        self.assertEqual(rss_url("US"), "https://trends.google.com/trending/rss?geo=US")
        with self.assertRaises(ValueError):
            rss_url("XX")

    def test_fresh_keyword_signal_not_sales(self):
        rows = feed_items(sample_rss("Beyblade X world championship"), NOW)
        self.assertEqual(len(rows), 1)
        signals = extract_signals({"TW": rows}, EVIDENCE, NOW)
        self.assertEqual(len(signals), 1)
        self.assertEqual(signals[0]["product_id"], "beyblade_x")
        self.assertEqual(signals[0]["region"], "TW")
        self.assertEqual(signals[0]["signal_type"], "google_trends_related_keyword")
        self.assertNotIn("sales", signals[0])
        self.assertNotIn("sold_price", signals[0])

    def test_multiple_regions_are_distinct(self):
        rows = feed_items(sample_rss("Mofusand anime plush"), NOW)
        signals = extract_signals({"US": rows, "GB": rows}, EVIDENCE, NOW)
        self.assertEqual(len(signals), 2)
        self.assertEqual({x["region"] for x in signals}, {"US", "GB"})

    def test_same_product_same_country_deduplicated(self):
        rows = [
            ("Beyblade X", NOW - timedelta(hours=2)),
            ("Beyblade new tournament", NOW - timedelta(hours=1))
        ]
        self.assertEqual(len(extract_signals({"TW": rows}, EVIDENCE, NOW)), 1)

    def test_unrelated_headline_not_falsely_selected(self):
        rows = feed_items(sample_rss("Football final score"), NOW)
        self.assertEqual(extract_signals({"US": rows}, EVIDENCE, NOW), [])

    def test_old_trend_excluded(self):
        rows = feed_items(sample_rss("Pokemon", "Wed, 07 Oct 2026 04:00:00 +0000"), NOW)
        self.assertEqual(rows, [])

    def test_malformed_feed_rejected(self):
        for bad in [b"", b"broken", b"<rss/>", b"<html/>"]:
            with self.subTest(feed=bad), self.assertRaises(ValueError):
                feed_items(bad, NOW)

    def test_all_regions_unavailable_leaves_existing_file_untouched(self):
        with self.assertRaises(ValueError):
            build_record({}, EVIDENCE, NOW, REGIONS)

    def test_valid_country_with_no_matches_does_not_invent_picks(self):
        result = build_record({"US": []}, EVIDENCE, NOW, ("GB",))
        self.assertEqual(result["source"], "google_trends_rss")
        self.assertEqual(result["signals"], [])
        self.assertEqual(result["failed_regions"], ["GB"])

    def test_brand_topics_curated_separate_from_report_sales(self):
        self.assertEqual(len(validated_brand_topics(BRAND_TOPICS)), 22)
        now_rows = feed_items(sample_rss("Hatsune Miku 2026"), NOW)
        signals = extract_signals({"US": now_rows}, EVIDENCE, NOW, BRAND_TOPICS)
        self.assertEqual(len(signals), 1)
        self.assertEqual(signals[0]["name"], "初音ミク関連")
        self.assertEqual(signals[0]["evidence_class"], "curated_brand_interest")
        self.assertEqual(signals[0]["signal_type"], "google_trends_related_keyword")
        self.assertNotIn("profit", signals[0])
        self.assertNotIn("sales_count", signals[0])

    def test_brand_topics_are_not_reported_transactions(self):
        result = build_record(
            {"US": [("Sonny Angel", NOW - timedelta(hours=2))]},
            EVIDENCE, NOW, (), BRAND_TOPICS
        )
        self.assertEqual(len(result["signals"]), 1)
        self.assertEqual(result["signals"][0]["product_id"], "sonny_angel")
        self.assertEqual(result["signals"][0]["evidence_class"], "curated_brand_interest")

    def test_invalid_or_duplicate_topic_rejected(self):
        for mode in ("duplicate", "broken_pattern", "wrong_status"):
            bad = deepcopy(BRAND_TOPICS)
            if mode == "duplicate":
                bad["topics"][1]["id"] = bad["topics"][0]["id"]
            elif mode == "broken_pattern":
                bad["topics"][0]["aliases"] = ["[not closed"]
            else:
                bad["topics"][0]["enabled"] = "yes"
            with self.subTest(case=mode), self.assertRaises(ValueError):
                validated_brand_topics(bad)

    def test_no_fake_current_sales_in_evidence_catalog(self):
        self.assertEqual(EVIDENCE["document_type"], "editorial_product_research_candidates")
        self.assertGreaterEqual(len(EVIDENCE["picks"]), 10)
        for entry in EVIDENCE["picks"]:
            self.assertEqual(entry["signal_type"], "reported_crossborder_demand")
            self.assertFalse(entry["confirmed_live_sales"])
            self.assertTrue(entry["source_url"].startswith("https://"))
            self.assertTrue(entry["source_date"])


if __name__ == "__main__":
    unittest.main()
