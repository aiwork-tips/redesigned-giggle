"""Offline specialist RSS product discovery (the fixtures are not real trades)."""
from datetime import datetime, timedelta, timezone
import unittest

from scripts.update_overseas_news import (
    FEEDS, build_record, parse_news_feed, valid_article_link,
)

NOW = datetime(2026, 11, 4, 6, tzinfo=timezone.utc)


def rss(title, site="www.timeextension.com", published="Wed, 04 Nov 2026 04:00:00 +0000"):
    return ('<?xml version="1.0" encoding="utf-8"?>'
            '<rss version="2.0"><channel><title>News</title>'
            '<item><title>' + title + '</title>'
            '<link>https://' + site + '/news/2026/11/product</link>'
            '<pubDate>' + published + '</pubDate></item></channel></rss>').encode()


class SpecialistRssTests(unittest.TestCase):
    def test_official_feed_urls(self):
        self.assertEqual(FEEDS["Time Extension"], "https://www.timeextension.com/feeds/news")
        self.assertEqual(FEEDS["Nintendo Life"], "https://www.nintendolife.com/feeds/news")

    def test_specialist_finds_gameboy_search_lead(self):
        result = parse_news_feed(rss("Rare Japanese Game Boy cart makes a comeback"),
                                 "Time Extension", NOW)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["product_name"], "ゲームボーイ")
        self.assertEqual(result[0]["term"], "Nintendo Game Boy Japanese")
        self.assertEqual(result[0]["signal_type"], "overseas_editorial_product_mention")
        self.assertNotIn("sold_price", result[0])

    def test_specific_model_only_when_named_in_headline(self):
        psp = parse_news_feed(rss("Rare Japanese PSP games spotted"),
                              "Time Extension", NOW)[0]
        self.assertEqual(psp["term"], "Sony PSP Japanese")
        psp3000 = parse_news_feed(rss("Sony PSP-3000 console revisited"),
                                  "Time Extension", NOW)[0]
        self.assertEqual(psp3000["term"], "Sony PSP 3000 Japanese")
        ds = parse_news_feed(rss("Nintendo DS game collection"),
                             "Time Extension", NOW)[0]
        self.assertEqual(ds["term"], "Nintendo DS Japanese")
        lite = parse_news_feed(rss("Nintendo DS Lite found in Japan"),
                               "Time Extension", NOW)[0]
        self.assertEqual(lite["term"], "Nintendo DS Lite Japanese")
        gba = parse_news_feed(rss("Game Boy Advance SP collector edition"),
                              "Time Extension", NOW)[0]
        self.assertEqual(gba["term"], "Nintendo Game Boy Advance SP Japanese")

    def test_generic_editorial_mention_is_not_sold_data(self):
        psp = parse_news_feed(rss("PSP homebrew update arrives"),
                              "Time Extension", NOW)[0]
        self.assertEqual(psp["signal_type"], "overseas_editorial_product_mention")
        self.assertNotIn("sold_count", psp)
        self.assertNotIn("asking_price", psp)

    def test_nintendo_life_parses_amiibo(self):
        data = rss("New Japanese amiibo edition", site="www.nintendolife.com")
        result = parse_news_feed(data, "Nintendo Life", NOW)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["product_name"], "amiibo")

    def test_genuine_link_required(self):
        self.assertFalse(valid_article_link("https://www.timeextension.com.evil.test/news/1", "Time Extension"))
        self.assertFalse(valid_article_link("http://www.timeextension.com/news/1", "Time Extension"))
        self.assertFalse(valid_article_link("https://www.timeextension.com/other/1", "Time Extension"))

    def test_irrelevant_or_old_article_not_recommended(self):
        none = parse_news_feed(rss("Weather and travel advice"), "Time Extension", NOW)
        self.assertEqual(none, [])
        old = rss("GameCube", published="Mon, 02 Feb 2026 04:00:00 +0000")
        self.assertEqual(parse_news_feed(old, "Time Extension", NOW), [])

    def test_missing_all_sources_fails_closed(self):
        with self.assertRaises(ValueError):
            build_record({}, NOW, FEEDS.keys())

    def test_source_unavailable_provenance(self):
        article = parse_news_feed(rss("Japanese Dreamcast games get a remake"),
                                  "Time Extension", NOW)
        result = build_record({"Time Extension": article}, NOW, ("Nintendo Life",))
        self.assertEqual(result["source"], "publisher_rss")
        self.assertEqual(len(result["articles"]), 1)
        self.assertEqual(result["failed_sources"], ["Nintendo Life"])

    def test_bad_xml_not_silent(self):
        for xml in (b"", b"Not XML", b"<rss/>", b"<html/>"):
            with self.subTest(xml=xml), self.assertRaises(ValueError):
                parse_news_feed(xml, "Time Extension", NOW)


if __name__ == "__main__":
    unittest.main()
