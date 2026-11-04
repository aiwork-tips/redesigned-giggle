# Export Scout v4.5: 成約・国内仕入れ価格の照合契約

この仕様は自動取得の**受け皿**であり、eBay成約履歴・メルカリ仕入れ情報の取得成功を意味しません。外部API未接続では、両入力は空、比較対象も0件です。

## データファイル

- `data/research_targets.json`: 対象ID、正式な検索語、ジャンル、利用フラグ。
- `data/completed_sales.json`: 成約例の証拠データ。初期状態は空。
- `data/domestic_offers.json`: 国内の掲載中の仕入れ先の証拠データ。初期状態は空。
- `data/opportunity_pairs.json`: 上記を照合した出力。初期状態は空。
- `data/ebay_active.json`: eBay販売中の出品価格専用。**成約例として使用禁止**。

## 成約例レコード（source_linked時のみ）

```json
{
  "target_id": "t04",
  "condition": "used",
  "buyer_paid_total_usd": 80.0,
  "source_url": "https://www.ebay.com/itm/EXAMPLE",
  "sale_status": "completed",
  "sold_at": "2026-11-03T12:00:00+00:00",
  "checked_at": "2026-11-04T12:00:00+00:00"
}
```

販売価格には購入者の送料を含む総額が必要。送料不明の販売例を無理に合算・推測しない。上記は**仕様サンプルであり実測データではない**。実際のデータファイルに例示データを書き込まない。

## 国内仕入れレコード（source_linked時のみ）

```json
{
  "target_id": "t04",
  "condition": "used",
  "domestic_delivered_cost_jpy": 4500,
  "source_url": "https://jp.mercari.com/item/mEXAMPLE",
  "availability": "active",
  "checked_at": "2026-11-04T12:00:00+00:00"
}
```

購入者の国内送料込み総額で記録する。販売済み・仕入れ条件が不明・状態不一致の商品は対象外。

**両ファイルの最上位：** `schema_version:1`、`price_type`（それぞれ `completed_sale_total_usd` / `domestic_delivered_asking_price_jpy`）、`source:"source_linked"`、`items:[...]`。未接続なら `source:"not_connected"`、`items:[]`。

## 比較条件

- 調査対象IDが一致し、有効化されている
- `condition` が used/new で一致
- 完了した成約例が**異なる出典URLで2件以上**、過去90日以内の履歴
- 成約例の確認時刻が14日以内、国内掲載確認が7日以内
- 国内仕入れ先は現在掲載中。候補の中から最も安い送料込みの価格を使う
- 価格は正の有限数、出典は許可したHTTPSの商品ページのみ
- 照合では利益額を生成せず、過去の成約総額中央値USD・現在の国内仕入れ掲載総額JPYの組を出力する
- ブラウザで本人のレート・送料・手数料・その他費用を使用して参考利益を計算する
- 推定参考利益の高い順に**独立した参考一覧**として表示し、既存の手入力ランキングには混ぜない

## 正確性の限界

URL形式・日時・数値の検証は、外部の商品が本当に売れたことや国内で購入可能であることの証明ではない。データ供給側で合法な取得手段・出典検証・販売条件整合を別途確保すること。為替・送料・関税・返金・損傷・価格変動の不確実性も残る。

現時点の接続状態は**成約履歴未接続／国内価格未接続**。eBay Browse API で取得できる現行の出品価格を売れた価格に置き換えてはいけない。

## テスト・更新

- `python -m unittest discover -s tests -v`
- `python scripts/build_opportunities.py`
- `python scripts/check_site.py`
- `node tests/test_opportunity_ui.cjs`
- `.github/workflows/build-opportunities.yml`：更新時・日次・手動起動。データ未接続なら空の出力。
- `.github/workflows/test-export-scout.yml`：各種検証。

**GitHubに設定を追加したことと、GitHub Actions・実際の外部データ取得が成功したことは別。**
