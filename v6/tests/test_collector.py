"""Synthetic API collector tests. Network disabled, no credentials involved."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "collector_v6", Path("v6/scripts/collect_discovery.py")
)
collector = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(collector)


def payload_yahoo():
    return {"hits": [
        {"name": " Seiko Watch SNE001 ", "price": 8000,
         "code": "seiko-watch-sne001",
         "url": "https://store.shopping.yahoo.co.jp/legit/item1.html"},
        {"name": " Sony PSP-3000 ", "price": 4500,
         "code": "psp-3000",
         "url": "https://store.shopping.yahoo.co.jp/legit/item2.html"},
        {"name": "Other", "price": -10,
         "url": "https://store.shopping.yahoo.co.jp/legit/bad.html"},
        {"name": "Fake", "price": 99999,
         "url": "https://evil.example/private"},
        {"name": "Duplicate", "price": 8200,
         "url": "https://store.shopping.yahoo.co.jp/legit/item1.html"}
    ]}


def soldgraph_complete():
    return {
        "status": "complete", "credits": 1,
        "result": {
            "provider": "ebay", "country": "us",
            "collected_at": "2026-11-05T11:00:00Z",
            "summary": {
                "priced_count": 12,
                "currency": "USD",
                "median_excluding_best_offer": 92.5,
            }
        }
    }


class CollectorTests(unittest.TestCase):
    def test_yahoo_shape_and_dedupe(self):
        result = collector.yahoo_normalize(
            payload_yahoo(), "watch", "2026-11-05T11:00:00Z")
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["name"], "Seiko Watch SNE001")
        self.assertEqual(result[0]["category"], "時計・アクセサリー")
        self.assertEqual(result[0]["japanRelation"], "sourced_in_japan")
        self.assertEqual(result[0]["domestic"]["priceJpy"], 8000)
        self.assertIsNone(result[0]["overseas"])
        self.assertIsNone(result[0]["assumptions"])
        self.assertTrue(result[0]["id"].startswith("yahoo:"))

    def test_cross_category_rotation(self):
        from datetime import date, timedelta
        targets = []
        for n in range(16):
            k, category = collector.choose_auto_target(
                date(2026, 1, 1) + timedelta(days=n)
            )
            targets.append((k, category))
            self.assertIn(category, collector.SEARCH_CATEGORIES)
        self.assertEqual(len(set(targets)), 16, "Rotating searches cover all 16 seeds")
        self.assertEqual(
            collector.choose_auto_target(date(2026, 1, 17)),
            targets[0],
        )

    def test_automatic_keyword_with_no_manual_input(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = str(Path(tmp) / "auto.json")
            with patch.dict(collector.os.environ, {
                "YAHOO_SHOPPING_APP_ID": "test-client", "SOLDGRAPH_KEY": ""
            }), patch.object(collector, "yahoo_request",
                            return_value=payload_yahoo()) as call:
                status = collector.main(["--output", dest])
            self.assertEqual(status, 0)
            self.assertEqual(call.call_count, 1)
            packet = json.loads(Path(dest).read_text("utf-8"))
            self.assertEqual(packet["research_context"]["automatically_matched_skus"], 0)
            self.assertEqual(len(packet["items"]), 2)

    def test_strict_url_filter(self):
        for url in (
            "http://store.shopping.yahoo.co.jp/item",
            "https://evil.example/x",
            "https://store.shopping.yahoo.co.jp@evil.example/secret",
            "javascript:alert(1)",
            "https://store.shopping.yahoo.co.jp:444/item",
        ):
            self.assertFalse(collector.valid_shop_url(url))
        self.assertTrue(collector.valid_shop_url(
            "https://store.shopping.yahoo.co.jp/ok/item"))

    def test_soldgraph_pending_then_complete(self):
        calls = []
        values = [
            {"status": "pending", "poll_url": "/v1/jobs/abc12345"},
            soldgraph_complete()
        ]

        def fake_fetch(url, headers=None):
            calls.append((url, headers))
            return values.pop(0)

        with patch.object(collector, "get_json", fake_fetch):
            result = collector.soldgraph_research("secret-key", "PSP-3000")
        self.assertEqual(len(calls), 2)
        self.assertTrue(calls[0][0].startswith(
            "https://api.soldgraph.com/v1/ebay/sold?"))
        self.assertTrue(calls[1][0].startswith(
            "https://api.soldgraph.com/v1/jobs/abc12345?"))
        self.assertIn("secret-key", calls[0][1]["Authorization"])
        self.assertEqual(result["priced_count_on_page"], 12)
        self.assertEqual(result["median_excluding_best_offer_usd"], 92.5)
        self.assertFalse(result["source_page_is_complete_history"])

    def test_no_secret_no_soldgraph_request(self):
        with patch.object(collector, "get_json",
                          side_effect=AssertionError("must not call")):
            result = collector.soldgraph_research("", "PSP-3000")
        self.assertEqual(result["state"], "not_configured")

    def test_reject_bad_job_url(self):
        for path in (
            "https://evil.example/steal",
            "//evil.example/jobs/12345678",
            "/v1/jobs/../../badbad",
            "/v1/notjobs/abc12345"
        ):
            with self.assertRaises(collector.CollectorError):
                collector.safe_soldgraph_job_url(path)

    def test_single_call_and_no_soldgraph_expense(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = str(Path(tmp) / "feed.json")
            with patch.dict(collector.os.environ, {
                    "YAHOO_SHOPPING_APP_ID": "synthetic-client",
                    "SOLDGRAPH_KEY": ""
            }), patch.object(collector, "yahoo_request",
                            return_value=payload_yahoo()) as yahoo, patch.object(
                                collector, "get_json",
                                side_effect=AssertionError("no calls")):
                status = collector.main([
                    "--keyword", "PSP-3000", "--category", "game",
                    "--output", output
                ])
            self.assertEqual(status, 0)
            yahoo.assert_called_once_with("synthetic-client", "PSP-3000")
            packet = json.loads(Path(output).read_text("utf-8"))
            self.assertEqual(packet["kind"], "export-scout-discovery-v6")
            self.assertEqual(len(packet["items"]), 2)
            self.assertIsNone(packet["items"][0]["overseas"])
            self.assertEqual(
                packet["research_context"]["automatically_matched_skus"], 0)
            self.assertEqual(
                packet["research_context"]["soldgraph"]["state"], "not_configured")

    def test_cannot_generate_fake_feed_without_yahoo(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = str(Path(tmp) / "feed.json")
            with patch.dict(collector.os.environ, {
                    "YAHOO_SHOPPING_APP_ID": ""
            }):
                with self.assertRaises(collector.CollectorError):
                    collector.main([
                        "--keyword", "PSP-3000", "--output", output
                    ])
            self.assertFalse(Path(output).exists())


if __name__ == "__main__":
    unittest.main()
