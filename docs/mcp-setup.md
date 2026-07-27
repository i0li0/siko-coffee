# MCP セットアップ / 運用メモ

Claude Code から使う MCP サーバの構成と、その運用ルール。
設定の実体は [`.mcp.json`](../.mcp.json)（サーバ定義）と `.claude/settings.json`（権限）。

## 前提

| 必要なもの | 備考 |
|---|---|
| `uv` / `uvx` | 4 サーバとも `uvx` 起動。`brew install uv` |
| AWS プロファイル `default` | `.mcp.json` が `--profile default` / `AWS_PROFILE=default` を指定 |
| リージョン `ap-northeast-1` | DynamoDB・SES と同一 |

ローカルの `default` プロファイルはセッション認証（静的キー無し）のため**期限切れする**。
切れたら `aws login` で再サインインする。

## サーバ一覧

| 名前 | パッケージ | 用途 |
|---|---|---|
| `aws-mcp` | `mcp-proxy-for-aws` | AWS 公式 MCP へのプロキシ。ドキュメント・スキル・リージョン情報 |
| `aws-docs` | `awslabs.aws-documentation-mcp-server` | AWS ドキュメント検索・取得 |
| `aws-pricing` | `awslabs.aws-pricing-mcp-server` | 料金 API・コスト見積り |
| `aws-iac` | `awslabs.aws-iac-mcp-server` | CloudFormation 検証 / CDK ドキュメント |

## ルール

### 1. バージョンは固定する

`@latest` は起動のたびにネットワーク解決が走って遅く、AWS labs 系は破壊的変更も入る。
4 本とも `==x.y.z` で固定し、**更新は PR で明示的に上げる**。

更新時の確認手順:

```
uvx <パッケージ>==<新バージョン> --help
```

解決できて正常終了すれば `.mcp.json` を書き換えて PR にする。

### 2. ⚠️ `aws-mcp` の `--read-only` は権限設定と連動している

`.mcp.json` の `aws-mcp` には `--read-only` が付いており、書き込み系の呼び出しは
プロキシ側で遮断される。これを前提に `.claude/settings.json` で
**`mcp__aws-mcp`（サーバ全体）を無確認許可**している。

**`--read-only` を外すなら、`mcp__aws-mcp` の許可も同時に外すこと。**
片方だけ変更すると、AWS への書き込みが無確認で通る状態になる。

書き込みが必要になった場合は `--read-only` を外すのではなく、
`aws-mcp-write` のような**別サーバとして定義し、普段は無効**にする。

### 3. 権限設定の置き場所

| ファイル | 用途 | git |
|---|---|---|
| `.claude/settings.json` | 共有する権限（AWS 読み取り系・MCP 読み取り系）と `.mcp.json` の承認 | 追跡する |
| `.claude/settings.local.json` | 個人用・一時的な許可 | 追跡しない |

`.mcp.json` の4サーバは `settings.json` の `enabledMcpjsonServers` で承認済みにしてある。
これが無いと、worktree を作るたび・clone するたびに承認プロンプトが出る
（承認を対話的に答えると `settings.local.json` に書かれ、その worktree 限りになる）。

⚠️ **`enabledMcpjsonServers` はフォルダを trust していないと無視される。** clone 直後は
一度 `claude` を起動して workspace trust のダイアログを承認する必要がある。それまで
サーバは `⏸ Pending approval` のままになる。

`.gitignore` は `.claude/*` + 個別再包含の **allowlist 方式**。
公開リポジトリなので、`.claude/` に何か追加したときは
「commit していいか」を明示的に判断してから `!` を足す。

MCP の権限ルールの書式（[公式ドキュメント](https://code.claude.com/docs/en/permissions)）:

- `mcp__aws-docs` — そのサーバの全ツール
- `mcp__aws-pricing__get_*` — 前方一致。ワイルドカードは `mcp__<サーバ名>__` の後ろでのみ有効
- `mcp__*` のようなアンカーの無い allow は**警告付きで無視される**（deny では有効）

## このリポジトリ外の MCP

Notion / Slack / Vercel などのプラグイン由来 MCP は個人の Claude Code 設定側にあり、
このリポジトリの `.mcp.json` とは無関係。認証が切れたら対話的な `claude` から `/mcp` で再認証する。

アプリ自身の外部連携（`src/lib/slackNotify.ts` の Slack 通知、`src/lib/email.ts` の SES）は
env ベースでコードに組み込まれており、**MCP の認証状態とは無関係に本番で動く**。混同しないこと。
