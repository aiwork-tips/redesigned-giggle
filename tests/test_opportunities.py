"""Offline tests: only adequately sourced, condition-matched opportunities qualify."""
from datetime import datetime, timedelta, timezone
from copy import deepcopy
import unittest

from scripts.build_opportunities import build_pairs, read_feed, source_link

NOW = datetime(2026, 11, 4, 6, tzinfo=timezone.utc)
ISO = lambda d: d.isoformat()
CATALOG = {"schema_version":1, "targets":[
    {"id":"t04","query":"Sony PSP 3000","category":"携帯ゲーム","enabled":True},
    {"id":"t05","query":"Nintendo DS Lite","category":"携帯ゲーム","enabled":False},
]}

def sold(item=1, amount=80, condition="used", target="t04", days=3):
    return {
        "target_id": target, "condition": condition, "buyer_paid_total_usd": amount,
        "source_url": f"https://www.ebay.com/itm/{item}", "sale_status": "completed",
        "sold_at": ISO(NOW-timedelta(days=days)),
        "checked_at": ISO(NOW-timedelta(hours=2))
    }

def offer(item=1, amount=4500, condition="used", target="t04", days=1):
    return {
        "target_id": target, "condition": condition, "domestic_delivered_cost_jpy": amount,
        "source_url": f"https://jp.mercari.com/item/m{item}", "availability": "active",
        "checked_at": ISO(NOW-timedelta(days=days)),
    }

class OpportunitiesTests(unittest.TestCase):
    def test_empty_input_never_claims_a_candidate(self):
        out=build_pairs(CATALOG, [], [], NOW)
        self.assertEqual(out["items"], [])
        self.assertEqual(out["source"], "not_connected")

    def test_at_least_two_distinct_completions_required(self):
        self.assertEqual(build_pairs(CATALOG,[sold()],[offer()], NOW)["items"],[])
        rows=build_pairs(CATALOG,[sold(1,70),sold(2,90)],[offer()],NOW)["items"]
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]["median_completed_sale_total_usd"],80)
        self.assertEqual(rows[0]["completed_sale_samples"],2)
        self.assertEqual(rows[0]["min_domestic_delivered_cost_jpy"],4500)
        self.assertNotIn("estimated_profit",rows[0])
        self.assertNotIn("revenue_jpy",rows[0])

    def test_cheapest_active_offer_and_unique_sold_links(self):
        rows=build_pairs(CATALOG,[sold(1,50),sold(1,55),sold(2,100)],
                         [offer(1,6000),offer(2,4000)],NOW)["items"]
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]["completed_sale_samples"],2)
        self.assertEqual(rows[0]["median_completed_sale_total_usd"],75)
        self.assertEqual(rows[0]["min_domestic_delivered_cost_jpy"],4000)
        self.assertIn("m2",rows[0]["domestic_offer_url"])

    def test_condition_must_match(self):
        out=build_pairs(CATALOG,[sold(1),sold(2)],
                        [offer(condition="new")],NOW)
        self.assertEqual(out["items"],[])

    def test_stale_offer_excluded(self):
        self.assertEqual(build_pairs(CATALOG,[sold(1),sold(2)],[offer(days=10)],NOW)["items"],[])

    def test_old_sale_excluded(self):
        self.assertEqual(build_pairs(CATALOG,[sold(1,days=95),sold(2)],[offer()],NOW)["items"],[])

    def test_active_asking_prices_not_accepted_as_sold(self):
        bad = sold()
        bad["sale_status"]="active"
        with self.assertRaises(ValueError):
            build_pairs(CATALOG,[bad,sold(2)],[offer()],NOW)

    def test_nonfinite_negative_and_unknown_targets_rejected(self):
        for bad_value in (float("nan"),float("inf"),-2,0,"80"):
            bad=sold()
            bad["buyer_paid_total_usd"]=bad_value
            with self.subTest(value=bad_value),self.assertRaises(ValueError):
                build_pairs(CATALOG,[bad],[offer()],NOW)
        with self.assertRaises(ValueError):
            build_pairs(CATALOG,[sold(target="t05")],[offer()],NOW)

    def test_link_host_is_not_forged(self):
        for url in ("http://www.ebay.com/itm/1","https://www.ebay.com.evil.test/itm/1",
                    "https://www.ebay.com@evil.test/itm/1","https://www.ebay.com/sch/i.html"):
            with self.subTest(url=url),self.assertRaises(ValueError):
                source_link(url, "sold")

    def test_inactive_offer_is_rejected(self):
        bad=offer()
        bad["availability"]="sold"
        with self.assertRaises(ValueError):
            build_pairs(CATALOG,[sold(1),sold(2)],[bad],NOW)

    def test_legacy_empty_contracts_load(self):
        self.assertEqual(read_feed("data/completed_sales.json","sold"),[])
        self.assertEqual(read_feed("data/domestic_offers.json","domestic"),[])

if __name__=="__main__":
    unittest.main()
