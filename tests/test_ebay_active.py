"""Offline contract tests. No eBay credentials or network calls are required."""
import unittest

from scripts.update_ebay_active import build_record, deduplicate, parse_listings, summarize

STAMP = "2026-11-04T06:00:00+00:00"


def listing(item_id="v1|123|0", price="75.50", currency="USD", url="https://www.ebay.com/itm/123", title="PSP-3000"):
    return {"itemId": item_id, "title": title, "price": {"value": price, "currency": currency}, "itemWebUrl": url, "condition": "Used"}


class EbayActiveTests(unittest.TestCase):
    def test_valid_listing_is_asking_price_only(self):
        result = parse_listings({"itemSummaries": [listing()]}, "PSP", STAMP)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["listing_price_usd"], 75.5)
        self.assertEqual(result[0]["price_type"], "active_listing_asking_price")
        self.assertNotIn("sold_price_usd", result[0])
        self.assertNotIn("profit", result[0])

    def test_reject_invalid_prices_and_non_ebay_links(self):
        bad = [
            listing(price="-1"), listing(price="0"), listing(price="NaN"),
            listing(price="Infinity"), listing(price="200000"), listing(currency="JPY"),
            listing(url="https://www.ebay.com.evil.test/itm/123"),
            listing(url="http://www.ebay.com/itm/123"),
            listing(url="https://www.ebay.com/other/123"),
            listing(title=" "),
        ]
        self.assertEqual(parse_listings({"itemSummaries": bad}, "PSP", STAMP), [])

    def test_malformed_payload_fails(self):
        with self.assertRaises(ValueError):
            parse_listings({"itemSummaries": {}}, "PSP", STAMP)

    def test_same_item_id_dedupes_across_queries(self):
        a = parse_listings({"itemSummaries": [listing()]}, "PSP", STAMP)
        b = parse_listings({"itemSummaries": [listing(price="77.00"), listing(item_id="v1|456|0", price="90", url="https://www.ebay.com/itm/456")]}, "Sony", STAMP)
        result = deduplicate(a + b)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["listing_price_usd"], 75.5)

    def test_median_and_range_are_descriptive(self):
        p = parse_listings({"itemSummaries": [
            listing(item_id="a", price="10", url="https://www.ebay.com/itm/1"),
            listing(item_id="b", price="30", url="https://www.ebay.com/itm/2"),
            listing(item_id="c", price="40", url="https://www.ebay.com/itm/3")
        ]}, "PSP", STAMP)
        group = summarize(p)[0]
        self.assertEqual(group["median_listing_price_usd"], 30)
        self.assertEqual(group["min_listing_price_usd"], 10)
        self.assertEqual(group["max_listing_price_usd"], 40)
        self.assertEqual(group["sample_count"], 3)

    def test_empty_feed_not_published(self):
        with self.assertRaises(ValueError):
            build_record([("PSP", {"itemSummaries": []})], STAMP)

    def test_record_never_claims_sold_data(self):
        record = build_record([("PSP", {"itemSummaries": [listing()]})], STAMP)
        self.assertEqual(record["source"], "ebay_browse_api")
        self.assertEqual(record["price_type"], "active_listing_asking_price")
        self.assertEqual(len(record["groups"]), 1)
        self.assertNotIn("sold_price", record)
        self.assertNotIn("sourcing_cost", record)


if __name__ == "__main__":
    unittest.main()
