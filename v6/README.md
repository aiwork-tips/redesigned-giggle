# Export Scout v6.0 — 自動商品発掘 DEV

## 開発状況
- **本番サイトはv5.6のまま**：`https://aiwork-tips.github.io/redesigned-giggle/`
- このv6.0は `dev/v6-auto-discovery` ブランチ内の `v6/` にのみ作成。正式ページへの切替・データのクラウド送信はしない。
- `archive/v5.6` は、現行アプリを後から見返すための保護ブランチ。
- 開発版のホーム画面、出典リンク付きの商品表示、ジャンル横断検索、利益条件の絞り込み、売却根拠の区別を実装。
- **商品取得APIへの本接続はまだない**。`v6/data/latest.json` の `items: []` は意図した状態。架空の商品でランキングを埋めない。
- これまでの保存データ・販売履歴・Firebase構成にはアクセスせず、v6画面は現在のユーザーデータを変更しない。

## 主役は商品を自動発掘すること
対象：日本製／日本ブランド／日本限定／日本由来のホビー・コレクター商品／日本で仕入れられる商品。
**ジャンル制限なし**。機械的に検索するジャンルは段階的に追加し、事前に「利益が出るジャンル」などと断定しない。

## 入力データ
`v6/data/latest.json` を同一サイト内で取得する。商品APIの認証キーは、このJSONやブラウザのコードに含めない。

```json
{
  "kind":"export-scout-discovery-v6",
  "schemaVersion":1,
  "generatedAt":"2026-11-05T10:59:00Z",
  "items":[{
    "id":"provider:external-product-id",
    "name":"APIから実際に取得した商品名",
    "category":"任意ジャンル",
    "japanRelation":"japan_brand",
    "domestic":{
      "source":"yahoo_shopping",
      "currency":"JPY",
      "priceJpy":5000,
      "url":"https://store.shopping.yahoo.co.jp/...",
      "observedAt":"2026-11-05T10:58:00Z"
    },
    "overseas":null,
    "assumptions":null
  }]
}
```

上記の商品名・価格・ID・日付は**形式説明用**であり、実データではない。実際の空フィードには入れない。

海外相場のある場合：
- `overseas.source`：取得元（例 `soldgraph`、`ebay`、`etsy`）
- `overseas.price`：海外の参考価格、`overseas.currency`：ISO4217通貨コード
- `overseas.evidence`：`active_listing` または `sold_comparable`
- `overseas.soldCount`：取得できた件数、未提供なら `null`
- `overseas.url`：根拠の元サイト、`overseas.observedAt`：取得日時
- `assumptions.fxJpyPerUnit`：参考換算レート、`shippingJpy`、`feePercent`、`otherJpy`：試算の仮定

### ランキングの安全条件
- 売却参考データ `sold_comparable`、販売例件数が正、費用と参考為替がある場合だけ利益を試算する。
- 国内出品価格の取得から24時間超の場合はランキングから除外して再確認欄に移す。
- 出品中の販売希望価格と売却済みの参考価格を混同しない。
- 試算利益が赤字の品はランキングにせず「要確認」に分ける。
- 販売実績や送料・手数料がない商品に架空の利益を出さない。
- 海外の「成約参考」には返金・割引交渉後の実額と差があり、正確な利益は確定できない。API提供元の商用利用・再表示・キャッシュ期間を必ず確認してから公開する。

## 最初のAPI実証
まず `scripts/probe_yahoo_shopping.py`（現行mainに用意済み）で、Yahoo!ショッピングから実際の商品名・価格・商品URLを取得できるか確認する。
- Yahoo!ショッピングのClient IDをGitHub Actions Secretへ保存し、手動で単発検証する。
- その後、価格の更新・商品名とJAN/型番の同定精度・取得制限・商用表示義務を確認。
- 海外の実際の売却情報取得は別途実証（第三者サービスの無料試用を前提に無断で利用規約に反する収集はしない）。
- **実データ取得が確認できるまでは正式v6へ切り替えない。**

## 検証
`node v6/tests/model.test.mjs`

このテストのサンプルは**テスト専用の合成データ**。公開データ `v6/data/latest.json` は空のまま。
