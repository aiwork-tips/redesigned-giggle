# Export Scout — 商品自動取得を最優先とする開発方針（2026-11-05）

## 成功判定（先に達成する）
ユーザーの要望は「アプリを開くと**自動取得された実在の商品**が、出典・価格・仕入れ先とともに並ぶこと」。
**手入力で作ったサンプルや人気商品リストを、実際に取得した商品として表示しない。**

1. 日本の商品APIから、実在の出品商品の**商品名・価格・商品URL**を取得する（API応答の実ログで確認）。
2. 価格・商品ID/URL・取得日時・出典を保存して表示する。表示期間、クレジット表記、商用利用条件に従う。
3. 海外の売却実績（成約価格・件数）を**合法かつ利用可能なデータソース**から取得できた場合だけ、確度を上げて利益候補として算定する。
4. 成約データのない場合は「国内仕入れ候補／海外利益未検証」と明示し、架空の利益ランキングにしない。
5. その後にUI、3人共有、Firebase移行へ進む。

## 現在の実証機能
- `scripts/probe_yahoo_shopping.py`：Yahoo!ショッピング商品検索v3を1回だけ呼び出し、出品中の上位5件を確認する。
- `.github/workflows/probe-yahoo-shopping.yml`：**手動実行のみ**。勝手に定期実行しない。
- `tests/test_yahoo_api_probe.py`：テストの架空レスポンスでフィールド、URLと価格の検証を行う。**ライブAPI取得の成功を示すテストではない。**
- 取得結果は標準出力のみ。GitHubのリポジトリ内ファイル・JSON・Webアプリ画面にはまだ保存しない。
- Yahoo!の商品情報は**現在出品中の価格**。販売済みの成約価格や販売件数ではない。
- 現行のExport Scout v5.6、販売台帳、過去のバックアップ、Firebase準備コードは変更しない。

## 手動テストに必要なユーザー作業
1. Yahoo!デベロッパーネットワークで、**Yahoo!ショッピング商品検索APIが使えるClient ID**を発行する。
   公式案内 https://developer.yahoo.co.jp/webapi/shopping/help/application.html
2. GitHubリポジトリ `aiwork-tips/redesigned-giggle` の
   **Settings → Secrets and variables → Actions → New repository secret** に、名前 `YAHOO_SHOPPING_APP_ID` でIDを保存する。
   **チャットや公開リポジトリにID/秘密情報を貼らない。**
3. リポジトリの **Actions → Export Scout Yahoo 商品API — 実データ単発検証 → Run workflow** を選択して、型番（例 `PSP-3000`）を入力して実行する。
4. ログの一覧に「出品中の実在の商品名・価格・商品URL」が表示されるか確認。認証エラー、429の制限、データなしの場合は成功として扱わない。

## API利用の注意事項
- Yahoo商品検索v3公式仕様 https://developer.yahoo.co.jp/webapi/shopping/v3/itemsearch.html
  - Client IDが必要。商品情報取得APIにはYahoo! ID連携は不要。
  - 呼出しの繰返しは**1クエリ/秒以下**を前提に設計する。
  - 商品の出品価格≠実際に売れた価格。
- 楽天の2026-07版商品検索API https://webservice.rakuten.co.jp/documentation/ichiba-item-search
  - アプリIDとアクセスキーが必要。
  - 楽天公式の価格・在庫情報キャッシュ目安は24時間。価格を長期間固定表示しない。
  - ガイドラインと表示義務、商用利用条件をAPI導入前に再確認する。
- eBay Marketplace Insights APIは新規ユーザーへ一般公開されていない。
  https://developer.ebay.com/api-docs/buy/ref-marketplace-supported.html

## Firebaseについて
Firebaseへ移行しただけでは商品の海外相場が入手できるようにならない。
商品APIで取得が実証できるまで、Firebase移行・共同ダッシュボードなどの優先順位を下げる。
