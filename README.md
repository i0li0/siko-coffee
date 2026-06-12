# siko.coffee

自家焙煎コーヒー豆のオンラインショップ。

**本番サイト**: https://siko.coffee

## 技術スタック

| カテゴリ | 技術 |
|---|---|
| フレームワーク | Next.js 15 (App Router) |
| ホスティング | Vercel |
| データベース | Amazon DynamoDB |
| 決済 | Stripe |
| ストレージ | Vercel Blob |
| エラー監視 | Sentry |
| 言語 | TypeScript |

## ローカル開発

```bash
# 依存関係インストール
npm install

# 環境変数を Vercel からプル
vercel env pull .env.local

# 開発サーバー起動
npm run dev
```

http://localhost:3000 で確認できます。

## コマンド

```bash
npm run dev        # 開発サーバー（Turbopack）
npm run build      # 本番ビルド
npm run lint       # ESLint
npm run e2e        # E2E テスト（Playwright）
```

## ブランチ戦略

- `main` — 本番環境に直結。PR + CI 通過が必須。
- `claude/*` — AI による作業ブランチ。マージ後自動削除。
