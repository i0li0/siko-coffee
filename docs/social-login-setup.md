# ソーシャルログイン（Google / LINE）セットアップ手順

Phase 3（ユーザー認証強化）で実装した Google / LINE OAuth ログインを **本番で有効化する**ための外部セットアップ手順。コードは実装済みだが、env 未設定のプロバイダは自動的に無効化される（ボタンを押すとエラーになるため、本番で表示する前に必ず両方のキーを登録すること）。

## 仕組み（実装メモ）

- プロバイダは `src/lib/auth.ts` に追加。`GOOGLE_CLIENT_ID/SECRET`・`LINE_CLIENT_ID/SECRET` が揃ったプロバイダだけ登録される。
- アカウントリンク制御は `src/lib/oauthLinking.ts` の `decideOAuthSignIn`（純関数・テスト済み）で行う。
  - プロバイダ側でメール未検証 → 拒否（なりすまし防止）
  - メール無し → 拒否（本システムはメールキー設計）
  - 既存ユーザーが **未確認** → 拒否（`oauth_link_unverified`、pre-account-hijacking 防止）
  - 既存が確認済み or 新規 → 許可（`allowDangerousEmailAccountLinking: true` を guard で安全化）
- OAuth 初回ログイン時、`jwt` callback で `emailVerified` / `avatarPreset` を確定し DB に反映（Credentials 経路と整合）。
- 拒否時は `/login?error=oauth_<reason>` に戻り、`AuthForm` が日本語で案内する。

## コールバック URL（リダイレクト URI）

NextAuth 既定のパスは `/api/auth/callback/<provider>`。各環境で登録する：

| 環境 | Google | LINE |
|---|---|---|
| 本番 | `https://www.sikocoffee.com/api/auth/callback/google` | `https://www.sikocoffee.com/api/auth/callback/line` |
| Preview | `https://<preview-domain>/api/auth/callback/google` | （任意） |
| ローカル | `http://localhost:3000/api/auth/callback/google` | `http://localhost:3000/api/auth/callback/line` |

> Preview は URL が動的に変わるため、固定のテスト用ドメインを用意するか、検証は本番/localhost で行う。

## ① Google

1. [Google Cloud Console](https://console.cloud.google.com/) > 対象プロジェクト > **APIとサービス > OAuth 同意画面** を設定（外部・公開）。スコープは `email` `profile` `openid`。
2. **APIとサービス > 認証情報 > 認証情報を作成 > OAuth クライアント ID** > アプリの種類「ウェブアプリケーション」。
3. **承認済みのリダイレクト URI** に上表の Google 行をすべて追加。
4. 発行された **クライアント ID / クライアント シークレット** を控える。

## ② LINE

1. [LINE Developers](https://developers.line.biz/) > プロバイダー作成 > **LINEログイン** チャネルを作成。
2. **LINEログイン設定 > コールバック URL** に上表の LINE 行を追加。
3. **メールアドレス取得権限**を申請（スクリーンショット提出・審査が必要）。承認されるまで LINE はメールを返さず、ログインは `oauth_no_email` で拒否される。
4. **チャネル ID / チャネルシークレット** を控える（= `LINE_CLIENT_ID` / `LINE_CLIENT_SECRET`）。

## ③ Vercel に環境変数を登録

Production / Preview の両方に登録（Development はローカル `.env.local`）：

```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
LINE_CLIENT_ID
LINE_CLIENT_SECRET
```

CLI 例：

```bash
vercel env add GOOGLE_CLIENT_ID production
vercel env add GOOGLE_CLIENT_SECRET production
vercel env add LINE_CLIENT_ID production
vercel env add LINE_CLIENT_SECRET production
# Preview にも同様に（必要なら）
```

登録後に再デプロイすると有効化される。

## ④ 動作確認チェックリスト

- [ ] 新規メールで Google ログイン → ユーザーが作成され `/account` に遷移、`emailVerified` が入る
- [ ] 同じメールで再度 Google ログイン → 既存ユーザーにリンク（重複ユーザーが作られない）
- [ ] 確認済み Credentials ユーザーが同一メールで Google ログイン → リンク成功
- [ ] **未確認** Credentials ユーザーのメールで Google ログイン → `oauth_link_unverified` で拒否され、案内が表示される
  - 復旧導線: そのユーザーはパスワード再設定（Phase 2）でメール確認を完了すれば以後リンク可能
- [ ] LINE（メール権限承認後）でログイン → 同様に動作
- [ ] env 未登録のプロバイダはボタンを出さない運用にする、または登録を完了してから公開する

## 残課題（Phase 4 以降）

- マジックリンク / ユーザーパスキー（Phase 4）
- account 画面のセキュリティ設定（連携プロバイダ一覧・解除、パスキー管理）（Phase 5）
- 現状の `AuthForm` のソーシャルボタンは最小実装。強度メーター等を含む本格 UI は Phase 5。
