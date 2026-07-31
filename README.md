# Sikō Coffee

自家焙煎コーヒー豆のオンラインショップ。

**WEBサイト**: https://sikocoffee.com

## 技術スタック

| カテゴリ       | 技術                    |
| -------------- | ----------------------- |
| フレームワーク | Next.js 15 (App Router) |
| ホスティング   | Vercel                  |
| データベース   | Amazon DynamoDB         |
| 決済           | Stripe                  |
| ストレージ     | Vercel Blob             |
| エラー監視     | Sentry                  |
| 言語           | TypeScript              |

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

> **npm は 11 以降を使ってください**（`engines` にも記載）。10 系でビルドすると
> `next/image` の最適化が無言で壊れます（`npm run sst:deploy` が入口で弾きます）。
>
> npm 11 は install スクリプトを既定で実行しないため、許可した依存を `package.json` の
> `allowScripts` に列挙しています。新しい依存を足したときに
> `npm warn allow-scripts ... not yet covered by allowScripts` が出たら、
> **中身を確認したうえで**次を実行して差分をコミットします。
>
> ```bash
> npm install-scripts ls                              # 何が保留かを見る
> npm install-scripts approve <pkg> --no-allow-scripts-pin
> ```
>
> `--no-allow-scripts-pin` はバージョンを焼き込まない形（`"pkg": true`）で書きます。
> 付けないと `"pkg@1.2.3": true` になり、依存を上げるたびに陳腐化します。

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
