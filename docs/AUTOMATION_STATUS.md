# Export Scout 自動更新・接続状況（v4.4）

## 稼働対象・制約

- 公開アプリ：GitHub Pages 上の `index.html`
- 既存の候補保存：端末 `localStorage` / CSV（現行形式を維持）
- 為替レート：ページ表示時に無料の ExchangeRate-API を直接取得。原則日次更新。端末内キャッシュあり。相場のリアルタイムレートや実際の換金レートではない
- eBay成約価格：自動取得は未接続。検索リンクから手動確認
- eBay出品価格：公式 Browse API 接続プログラムを用意済み。ただし本番APIの承認と認証情報がないため実取得未確認
- 国内仕入れ価格：自動取得は未接続
- 自動利益ランキング：手入力した保存候補のみ対象。出品価格を成約実績として扱わない

## 自動調査対象

`data/research_targets.json` が公式 eBay API 向けの検索対象設定。初期18種類、6ジャンル。実価格・実売数を含まない。

- `enabled: false` で対象を無効化できる
- `query` が eBay 検索語
- 重複・不正な検索語・設定形式は処理開始前に検出する
- アプリの③以前の固定候補一覧とは独立した **API用設定**。価格取得の成功を意味しない

## 接続に必要な工程

1. eBay Developer Program でアカウントを用意
2. eBay Buy / Browse API の本番利用審査・許可を得る（認可は保証されない）
3. GitHub リポジトリの Actions secrets に `EBAY_CLIENT_ID` と `EBAY_CLIENT_SECRET` を登録。**HTML・公開JSON・Issue・チャットにキーを書かない**
4. `.github/workflows/update-ebay-active.yml` の動作を確認
5. 確認できた出品データと、成約データ・国内仕入れデータを区別して集計する

参考：eBay公式 https://developer.ebay.com/api-docs/buy/buy-requirements.html

## 自動テスト

- Python: `python -m unittest discover -s tests -v`
- ページ構造/JS構文: `python scripts/check_site.py`
- 為替画面の模擬検証: `node tests/test_fx_ui.cjs`

CI定義: `.github/workflows/test-export-scout.yml`

**注意**：GitHubへコードを登録したことと、GitHub Actions上でのテスト成功・実際の価格取得成功は別。外部APIは未接続で、現在の実動作確認は完了していない。
