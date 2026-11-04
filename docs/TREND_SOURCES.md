# Export Scout v4.6 — 海外トレンド発掘ソースと注意点

基準日：2026-11-04。公開データを無断収集・スクレイピングせず、元サイトへ移動することを基本とする。

## 公式・公開の調査元

| 情報源 | URL | 調べられること | 更新頻度・制限 |
| --- | --- | --- | --- |
| eBay Product Research | https://www.ebay.com/sh/research | eBay販売実績、平均成約価格、販売数量、売れ行き、最大3年 | eBayセラーのSeller Hubへのログインが必要。基本機能無料 |
| eBay Japan 第2四半期レポート | https://ebay.co.jp/release/20260828 | 2026年4〜6月、日本セラーの越境ECカテゴリー動向 | 2026-08-28公開の**過去四半期の情報**。最新版は https://www.ebay.co.jp/release/ |
| Google Trends 米国 | https://trends.google.com/trending?geo=US&hl=ja | 検索が急増した話題を確認 | 直近24時間〜7日など画面で変更。**日本商品限定でも実売順位でもない** |
| ZenMarket 2026商材ランキング | https://journal.zen.one/japanese-item-ranking/ | 2025年7月〜2026年6月の海外購入データによる日本商品カテゴリーTOP10 | 2026-09-30公開。TOP100資料には会員登録等の条件がある |
| Buyee 人気特集 | https://media.buyee.jp/content/en/recommend-en/mercari-en/ | 海外購入者向けの人気カテゴリー・編集部の推奨商品の紹介 | 特集・選定情報、更新間隔不明。実売数量ランキングと断定しない |

## 調査の流れ

1. 公開の情報源から気になる商品・カテゴリーを発見
2. 「調査待ちに追加」で**商品名だけ**を端末へ保存（キー `export-scout-trend-inbox-v1`）
3. 「価格調査へ」で①の商品検索欄を自動入力
4. eBay販売済み・eBay Product Researchで成約例を調査、国内メルカリ/ヤフオクなどで仕入れ価格を確認
5. 価格を入力して、従来の利益試算と候補保存を使う

「調査待ち」は価格を記録しない独立リスト。従来の `export-scout-items-v1`、CSV取込/出力、既存の利益ランキングには変更を加えない。共有したい場合は「調査待ちリストをCSV保存」を使う。

## しないこと

- 日本製品の**今週の実売ランキング**が自動更新されるような表示
- Googleの検索量を売上数量として見せること
- 他社の有料情報をサイト内へコピーして公開すること
- 未確認の商品を「儲かる商品」・「トレンド確定」・「成約済み」と表記すること
- 外部サイトのHTMLを無許可で取り込むこと

## 開発者向け

表示コード：`assets/trends.js`（価格不要のメモ、検索リンク、CSV出力）。
自動テスト：`tests/test_trends_ui.cjs`、`scripts/check_site.py`。実データのAPI・スクレイピング・自動チャート更新は未実装である。
