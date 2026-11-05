# Export Scout v5.6 — 3人共同運用・Firebase移行の設計案

> **設計だけ。Firebaseプロジェクトの作成・認証・Firestoreへの接続・データ同期・本番公開はまだ行っていない。** ローカルの取引記録やバックアップを公開リポジトリに保存しない。

## 今回実装した比較機能
- `assets/team_preview.js` はExport Scout v5.3+のJSONバックアップを担当A・B・Cに1つずつ読み込む。
- 取引履歴の構造を検証して、取引IDが同じなら**別の担当の間でも**二重計上を避けるため全件集計を停止する。
- 自己入力の売却済み利益・在庫仕入れ原価・売却件数を担当別と商品型番別に表示。未売却品を利益に含めない。
- 取引IDが異なっても同じ実取引を別々に手入力した場合は検知できない。SKUの表記揺れも自動解決しない。
- 共同集計JSON `export-scout-team-offline-review` は**別仕様**であり、Firebaseへの直接取込・現在のアプリの復元には使えない。
- すべて端末内の一時比較で、`localStorage`への保存・外部送信・GitHubへの取引データ反映はしない。
- 3人のバックアップを別々に更新した場合、再度取り込んで照合する必要がある。

## Firestore将来構成案（まだ未実装）
```text
teams/{teamId}                           # 管理者がプロビジョニングする共同事業
teams/{teamId}/members/{firebaseUid}     # 3名分の権限（管理者側だけで登録）
teams/{teamId}/transactions/{teamTxnId}  # 取引1件、作成者・旧ID・編集時刻
teams/{teamId}/research/{researchId}     # 商品調査・出典
teams/{teamId}/audit/{eventId}           # 編集/削除履歴（後続実装）
```

候補データ:
```json
{
  "schemaVersion": 1,
  "teamId": "server-generated-id",
  "transactionId": "memberUid__legacyRecordId",
  "createdByUid": "firebase-auth-uid",
  "legacyRecordId": "item_xxx",
  "sku": "Nintendo DS Lite USG-001 white",
  "purchaseDate": "2026-10-01",
  "purchaseCostJpy": 5000,
  "status": "sold",
  "saleDate": "2026-10-08",
  "payoutJpy": 12000,
  "shippingJpy": 1800,
  "otherJpy": 200
}
```

### セキュリティの必須条件
1. Firebase Authenticationによる3人の個別ログイン。**「ログインした全員」を許可しない。**
2. `teams/{teamId}/members/{uid}` のメンバー許可リストでデータへのアクセスを制限。メンバーの作成や管理権限の変更を一般クライアントに許可しない。
3. Firestore Rulesで**作成・編集・削除の権限を明示**し、各操作が意図しない他チームへの書込や作成者のすり替えを拒否する。
4. 同一取引の重複を避けるため、旧データの `legacyRecordId` と送信元 `memberUid` で複合IDを作る。複数端末の同じバックアップの二重取り込みをチェック。
5. 取引データ・APIシークレット・Firebaseのサービスアカウント鍵を**公開GitHubのファイルに置かない**。構成情報であっても本番デプロイは別途承認後。
6. データ復元・Firestore投入前に、件数、重複、マッピング、利益再計算、権限分離をローカルでテストし、ユーザーが最終承認してから実施。
7. Firestore Security RulesはFirebase Local Emulatorで**未ログイン・A/B/Cメンバー・部外者・他チーム・権限変更・不正なデータ・編集競合**についてテストしてから公開する。<https://firebase.google.com/docs/firestore/security/test-rules-emulator>

### 将来のアプリ構成
- 画面（`index.html`）→ 共有のロジック（利益計算/ランキング）→ `storageAdapter`
- `localAdapter` は既存の `localStorage` キーを保持。
- `firebaseAdapter` は許可された3人だけがFirestoreに読み書き。認証が未完了の場合は読取・書込を許可しない。
- 同期時に在庫・取引を勝手に最後の書込みで上書きしないよう、revision/updatedAtで競合を検知し、差分を確認できる画面を追加。
- Firebase本番導入まで、旧GitHub版を削除せず併用・バックアップを続ける。

## 未解決事項
- 各メンバーの実アカウント（Googleログイン等）、チーム所有者と招待方法
- 編集・削除を全員許可するか、操作履歴や承認を必要とするか
- 古い端末のデータとの競合、SKU表記ゆれ、返品・返金の会計処理
- Firestore無料枠と商用運用条件、Firebaseプロジェクト名
- Firebase SDK、Rulesのエミュレーター検証と実機動作

## v5.6 追加
- 現時点では**Firebase本番接続・Googleログイン・クラウド同期は未実装**。公開GitHub版はローカル保存のみ。
- メンバー限定アクセス用の候補ルールは `firebase/firestore.candidate.rules`、本番用のデフォルトは `firebase/firestore.rules`（すべて拒否）。
- `assets/team_migration_mapper.js` でローカル売却履歴をユーザーごとのID付きの新スキーマに変換（通信・保存なし）。
- `assets/firebase_readiness.js` で旧取引の移行可否を表示（読み取り専用）。
- Firebaseセキュリティ候補ルールのテストは `.github/workflows/test-firebase-candidate.yml` でエミュレーターを利用。結果の確認と採用判断は本番移行前の必須条件。
- 詳細な安全運用手順は `docs/FIREBASE_V56_STAGING.md` を参照。
