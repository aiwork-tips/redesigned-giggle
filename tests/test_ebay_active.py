"""Offline validation of eBay Browse active listing parser."""
import unittest
from scripts.update_ebay_active import parse_listings

class EbayActiveTests(unittest.TestCase):
    def test_valid_listing(self):
        result = parse_listings({"itemSummaries":[{"title":"PSP-3000","price":{"value":"75.50","currency":"USD"},"itemWebUrl":"https://www.ebay.com/itm/123"}]}, "PSP", "2026-11-04T00:00:00+00:00")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["price_type"], "active_listing_asking_price")
        self.assertNotIn("sold_price_usd", result[0])

    def test_reject_invalid(self):
        data = {"itemSummaries":[{"title":"Bad","price":{"value":"-1","currency":"USD"},"itemWebUrl":"https://www.ebay.com/itm/123"},{"title":"Wrong currency","price":{"value":"100","currency":"JPY"},"itemWebUrl":"https://www.ebay.com/itm/456"}]}
        self.assertEqual(parse_listings(data, "PSP", "now"), [])

    def test_malformed(self):
        with self.assertRaises(ValueError):
            parse_listings({"itemSummaries":{}}, "PSP", "now")

if __name__ == "__main__":
    unittest.main()
