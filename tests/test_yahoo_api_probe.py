"""Offline, synthetic tests; no real API request, no credentials."""
import importlib.util
import pathlib
import unittest
from unittest.mock import patch

SOURCE = pathlib.Path("scripts/probe_yahoo_shopping.py")
spec = importlib.util.spec_from_file_location("probe_yahoo_shopping", SOURCE)
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


class YahooShoppingProbeTests(unittest.TestCase):
    def test_real_shape_normalized(self):
        payload = {"hits": [
            {"name": " PSP-3000 ", "price": 4500, "url": "https://store.shopping.yahoo.co.jp/shop/psp.html"},
            {"name": "DS Lite", "price": 2000, "url": "https://store.shopping.yahoo.co.jp/shop/ds.html"}
        ]}
        items = api.extract_items(payload)
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["name"], "PSP-3000")
        self.assertEqual(items[0]["price_jpy"], 4500)
        self.assertEqual(items[0]["evidence_type"], "active_listing_not_sold")

    def test_rejects_untrusted_or_invalid_listings(self):
        items = api.extract_items({"hits": [
            {"name": "fake", "price": 2000, "url": "https://example.net/phishing"},
            {"name": "wrong money", "price": "2000", "url": "https://store.shopping.yahoo.co.jp/x"},
            {"name": "not https", "price": 1000, "url": "http://store.shopping.yahoo.co.jp/x"},
            {"name": "wrong type", "price": True, "url": "https://store.shopping.yahoo.co.jp/x"}
        ]})
        self.assertEqual(items, [])

    def test_missing_api_credentials_never_reaches_network(self):
        with patch.object(api, "urlopen", side_effect=AssertionError("Network must be skipped")):
            with self.assertRaisesRegex(ValueError, "missing"):
                api.query_items("", "PSP-3000")

    def test_malformed_payload_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "Unexpected"):
            api.extract_items({"wrong": []})

    def test_one_request_and_no_persistence(self):
        class DummyResponse:
            def __init__(self):
                self.calls = 0
            def read(self, n):
                self.calls += 1
                if self.calls == 1:
                    return b'{"hits":[{"name":"PSP-3000","price":4999,"url":"https://store.shopping.yahoo.co.jp/shop/x"}]}'
                return b""
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
        calls = []
        def fake_urlopen(req, timeout):
            calls.append(req)
            return DummyResponse()
        with patch.object(api, "urlopen", fake_urlopen):
            items = api.query_items("fake-client-id", "PSP-3000")
        self.assertEqual(len(calls), 1)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["price_jpy"], 4999)
        self.assertIn("appid=fake-client-id", calls[0].full_url)


if __name__ == "__main__":
    unittest.main()
