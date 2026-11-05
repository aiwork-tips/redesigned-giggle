# Export Scout v5.6 — Firebase 3人共同運用：実装準備

更新日：2026-11-05（JST）

## 現在の状態
- GitHub Pagesは現行のExport Scoutとして維持。販売候補・仕入れ/販売履歴は現在のブラウザの `localStorage` のまま。
- Firebase本番プロジェクト、Googleログイン、Firestoreへの接続、Cloud Hostingへの移行、取引データのクラウド送信は**未設定・未実装**。
- `firebase/firestore.rules` は、すべての外部要求を拒否する **deny-all** で維持。 `firebase.json` もこのファイルを参照している。
- `firebase/firestore.candidate.rules` は将来のメンバー限定アクセス用候補。本番へのデプロイは禁止し、エミュレーターテストを実施してから別途採用判断する。
- `assets/team_migration_mapper.js` は旧取引履歴を新しいスキーマに**メモリ上だけ**変換する。Firebaseへの書込みはしない。
- `assets/firebase_readiness.js` は現行の取引履歴を読み取り専用で事前確認。ユーザーID未設定時は一切アップロードしない。

## 段階的な導入手順（まだ実施しない）
1. Firebaseを新規作成。利用アカウントと事業用の所有者を明確にする。
2. AuthenticationでGoogleログイン等を設定し、**3人のユーザーIDを別々に確認**。APIキーはウェブ用Firebase設定情報（秘密鍵ではない）だが、サービスアカウント秘密鍵をGitHubに置かない。
3. 信頼できる管理者権限（FirebaseコンソールまたはAdmin SDK）だけを使い、`teams/{teamId}/members/{uid}` に `{active: true, role:'owner'|'member'}` を作成する。**クライアントからメンバーを追加させない**。
4. `firebase/firestore.candidate.rules` をローカルエミュレーターで完全にテスト。3人の正常アクセスだけでなく、未ログイン・部外者・無効メンバー・他チーム・取引の所有者偽装・編集のrevision競合・削除を検査。
5. セキュリティルールのテストが通り、ユーザーが移行を承認するまで、本番の `firebase/firestore.rules` は変更しない。
6. 一人ずつ既存バックアップを確認し、`createdByUid + '__' + legacyRecordId` を複合IDに使用。元の旧IDも保持。重複取引を照合し、既存レコードを勝手に上書きしない。
7. 取引の書き込みでは、クライアントが設定する `createdAt`・`updatedAt` の値を **serverTimestamp()** にして、`revision` を更新ごとに1加える。競合時はユーザーが再確認する。
8. 3人の別ブラウザ・実機で保存・共有・権限エラー・ログアウト・ネットワーク障害を確認してから切り替える。

## candidate rules の権限モデル
- `teams/{teamId}`：有効なメンバーだけ読み取り可。クライアントによるチームの作成・更新・削除は禁止。
- `teams/{teamId}/members/{uid}`：有効な本人のみ自分のレコードを読み取れる。他メンバーの名簿参照、招待・権限変更は不可。
- `teams/{teamId}/transactions/{uid__legacyId}`：有効なメンバーが読み取り可、本人が自分の取引のみ作成・更新可。本人以外のなりすまし編集は禁止。
- 新規作成は `revision==1`、`createdAt == request.time`、`updatedAt == request.time` を満たす必要がある。
- 編集はID・作成者・作成日時を不変、`revision` をちょうど+1し、更新時刻をサーバー時刻と一致させる。
- 取引の削除、メンバー追加、research/auditその他のデータへのクライアントアクセスは現段階では禁止。
- 日付は基本的な文字列形式で検査するが、業務上の完全な日付妥当性、返品・税務処理、同じ取引の別ID二重登録は別の検証を必要とする。

## ローカルエミュレーター用のテスト
- `firebase/tests/rules.cjs`：Firebase公式Rules Test SDKとFirestoreエミュレーターを使うテスト。
- 依存ライブラリは `firebase/package.json` にバージョン固定。
- `cd firebase && npm install && npm run test:rules`。Node 22／Java 21が必要。
- GitHub Actions `.github/workflows/test-firebase-candidate.yml` は同じ処理を、本番資格情報なしで実行する。
- 現時点でこのチャット内の検証はJS構文・データ変換・画面接続などの**ローカル模擬テスト**。Firebaseエミュレーターの結果と、本番権限の安全性は未確認。
- Firebase公式資料：https://firebase.google.com/docs/firestore/security/test-rules-emulator

## 重要事項
- パスワード、サービスアカウント鍵、管理者の秘密トークン、個別の顧客・販売取引データは公開GitHubにコミットしない。
- WebアプリのFirebase設定情報を追加する際は、認証ドメインとAPI制限をレビューする。FirebaseのウェブAPIキー自体は認証や認可の代替ではない。
- GitHub PagesとFirebase HostingではURLのオリジンが異なるため、旧端末の保存データが新サイトに自動移行することはない。v5.4のバックアップを保管する。
- 無料枠と商用運用条件、ログイン方法は本番プロジェクト作成時点で再確認する。
