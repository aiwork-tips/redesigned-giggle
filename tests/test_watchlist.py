"""Offline research-watchlist validation, no eBay access required."""
import json
from pathlib import Path
import tempfile
import unittest

from scripts.update_ebay_active import load_targets

ORIGINAL = json.loads(Path("data/research_targets.json").read_text(encoding="utf-8"))

class ResearchWatchlistTests(unittest.TestCase):
    def load(self, record):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "targets.json"
            file.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
            return load_targets(file)

    def test_configured_catalog_loads(self):
        queries = load_targets()
        self.assertEqual(len(queries), 18)
        self.assertIn("Nintendo DS Lite", queries)
        self.assertIn("Sony PSP 3000", queries)

    def test_disabled_targets_are_skipped(self):
        data = json.loads(json.dumps(ORIGINAL))
        data["targets"][0]["enabled"] = False
        self.assertEqual(len(self.load(data)), 17)

    def test_all_disabled_fails(self):
        data = json.loads(json.dumps(ORIGINAL))
        for item in data["targets"]:
            item["enabled"] = False
        with self.assertRaises(ValueError):
            self.load(data)

    def test_duplicate_query_fails(self):
        data = json.loads(json.dumps(ORIGINAL))
        data["targets"][1]["query"] = data["targets"][0]["query"]
        with self.assertRaises(ValueError):
            self.load(data)

    def test_duplicate_id_fails(self):
        data = json.loads(json.dumps(ORIGINAL))
        data["targets"][1]["id"] = data["targets"][0]["id"]
        with self.assertRaises(ValueError):
            self.load(data)

    def test_wildcard_and_control_character_fail(self):
        for invalid in ["PSP*", "Nin\ntendo"]:
            data = json.loads(json.dumps(ORIGINAL))
            data["targets"][0]["query"] = invalid
            with self.subTest(query=invalid), self.assertRaises(ValueError):
                self.load(data)

    def test_no_sold_price_claims(self):
        self.assertEqual(ORIGINAL["price_type"], "active_listing_asking_price")
        self.assertNotIn("sold", ORIGINAL["price_type"])


if __name__ == "__main__":
    unittest.main()
