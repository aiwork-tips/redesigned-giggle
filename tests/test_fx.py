"""Offline regression tests for automatic FX updates."""
import unittest
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
from scripts.update_fx import validate

NOW = datetime(2026, 11, 4, 5, 0, tzinfo=timezone.utc)

def payload(rate=150, when=NOW, result="success"):
    return {"result": result, "rates": {"JPY": rate}, "time_last_update_utc": format_datetime(when)}

class FXValidationTests(unittest.TestCase):
    def test_valid_rate(self):
        record = validate(payload(), NOW)
        self.assertEqual(record["rate"], 150)
        self.assertEqual(record["pair"], "USDJPY")

    def test_invalid_rates(self):
        for rate in [0, -1, 10, 500, float("nan"), float("inf")]:
            with self.subTest(rate=rate), self.assertRaises(ValueError):
                validate(payload(rate), NOW)

    def test_failed_response(self):
        with self.assertRaises(ValueError):
            validate(payload(result="error"), NOW)

    def test_stale(self):
        with self.assertRaises(ValueError):
            validate(payload(when=NOW-timedelta(days=8)), NOW)

    def test_future(self):
        with self.assertRaises(ValueError):
            validate(payload(when=NOW+timedelta(days=2)), NOW)

    def test_missing_timestamp(self):
        data = payload()
        del data["time_last_update_utc"]
        with self.assertRaises(ValueError):
            validate(data, NOW)

if __name__ == "__main__":
    unittest.main()
