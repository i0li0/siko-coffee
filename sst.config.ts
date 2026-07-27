// SST が生成する型はこの三重スラッシュ参照でしか供給されない（import 形式は不可）ため、
// このファイルに限りルールを無効化する。
/* eslint-disable-next-line @typescript-eslint/triple-slash-reference */
/// <reference path="./.sst/platform/config.d.ts" />

// SST v4 による AWS 移行の IaC（docs/aws-migration-feasibility.md Phase 1）。
//
// ✅ stage `dev` へデプロイ済み（2026-07-27）: https://d3ejmruzea0u7a.cloudfront.net
// Phase 1 の目的は「本番に影響を与えずプレビュー環境だけ AWS に立てて学ぶ」こと。
// **本番ステージはまだ作っていない**。下の「本番切替前に必須の作業」を消化してから。
//
// デプロイ手順（`login_session` の罠に注意）:
//   eval "$(aws configure export-credentials --profile default --format env)"
//   npx sst deploy --stage dev
// ※ `aws sts get-caller-identity` が通っても SST は落ちる。`~/.aws/config` の
//   `login_session` は aws CLI 独自で、SST(Pulumi の Go SDK) は解釈できないため。
//
// 型チェック: `$config` / `sst` は `.sst/platform/config.d.ts`（`sst install` で生成・
// gitignore 対象）が供給する。CI にはそれが無いため `tsconfig.json` の exclude に
// このファイルを入れてある。

export default $config({
  app(input) {
    return {
      name: 'siko-coffee',
      // 本番ステージだけは誤削除を防ぐ。Phase 1 のプレビューは作り直す前提。
      removal: input?.stage === 'production' ? 'retain' : 'remove',
      protect: input?.stage === 'production',
      home: 'aws',
      providers: {
        // DynamoDB / SES / S3 と同じリージョン。Vercel の hnd1 と等価。
        aws: { region: 'ap-northeast-1' },
      },
    }
  },

  async run() {
    const isProd = $app.stage === 'production'

    // ── シークレット ────────────────────────────────────────────
    // 値はコードにもリポジトリにも一切書かない。投入は CLI:
    //   sst secret set <NAME> <VALUE> --stage dev
    //   sst secret load ./secrets.dev.env --stage dev   （一括）
    //
    // ⚠️ **ここに列挙した名前は全て値が入っていないと `sst deploy` が失敗する。**
    //    使わない機能の変数は列挙しないこと（下の「任意」を参照）。
    // ⚠️ **本番と同じ値を dev に入れないこと。** dev の CloudFront URL は公開されており、
    //    dev 側の漏洩が本番の侵害に直結してはならない。乱数系は stage ごとに作り直す。
    const SECRET_NAMES = [
      'AUTH_SECRET',          // NextAuth。無いとログイン系が例外
      'ORDER_TOKEN_SECRET',   // 注文照会リンクの HMAC
      'CRON_SECRET',          // cron の Bearer 認可
      'REVALIDATE_SECRET',    // オンデマンド再検証
      'MAIL_FROM',            // SES 送信元
      'ADMIN_PASSWORD_HASH',  // admin ログイン
      'ADMIN_SESSION_SECRET', // admin セッション署名
      // ── 任意（その機能を dev で検証したくなったら追加する）──
      // 'ADMIN_TOTP_SECRET', 'ADMIN_TOTP_REQUIRED',
      // 'SLACK_WEBHOOK_URL', 'INSTAGRAM_ACCESS_TOKEN',
      // 'SENTRY_ORG', 'SENTRY_PROJECT', 'SENTRY_AUTH_TOKEN', 'NEXT_PUBLIC_SENTRY_DSN',
      // 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',   ※ OAuth 側にリダイレクトURI登録が別途必要
      // 'LINE_CLIENT_ID', 'LINE_CLIENT_SECRET',       ※ 同上
      //
      // ── 意図的に入れないもの ──
      // STRIPE_* / PAYMENTS_ENABLED … 決済停止中（Phase 0 を維持）
      // NEXT_PUBLIC_GA_MEASUREMENT_ID … dev のアクセスが本番 GA に混ざるため
      // BLOB_* … Vercel 固有。Phase 2 で S3 に置き換える
      // WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN … 未設定ならリクエスト元から自動導出されるので dev では不要
    ] as const

    const secretEnv = Object.fromEntries(
      SECRET_NAMES.map((name) => [name, new sst.Secret(name).value]),
    )

    new sst.aws.Nextjs('Web', {
      // ⚠️ 必須のピン留め。SST の既定は OpenNext **3.9.14**（Next.js 15 想定）で、
      // 本プロジェクトの Next 16.2.11 は OpenNext **4.1.0** 以上でないとビルドできない
      // （4.1.0 の peer は `>=15.5.21 <16 || >=16.2.11`）。
      // SST 4.17.1 が読む出力（origins default/imageOptimizer/s3・edgeFunctions・
      // additionalProps.revalidationFunction/initializationFunction）は
      // OpenNext 4.1.0 の出力と一致することを実物で照合済み。
      // buildId は output JSON ではなく `.next/BUILD_ID` から読まれるため欠落は問題にならない。
      openNextVersion: '4.1.0',

      // Lambda 実行ロールに与える権限。**静的 AWS キーを一切置かないための要**。
      // アプリは既定の認証情報チェーンで DynamoDB / SES / Rekognition を叩くので、
      // ここで権限を与えれば `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` は不要になる
      // （＝移行における最大のセキュリティ改善。docs の項目12）。
      permissions: [
        {
          actions: [
            'dynamodb:GetItem',
            'dynamodb:PutItem',
            'dynamodb:UpdateItem',
            'dynamodb:DeleteItem',
            'dynamodb:Query',
            'dynamodb:Scan',
            'dynamodb:BatchGetItem',
            'dynamodb:BatchWriteItem',
            'dynamodb:TransactWriteItems',
            'dynamodb:TransactGetItems',
          ],
          // Phase 1 はプレビュー用テーブルだけに絞る（本番テーブルには触らせない）。
          resources: isProd
            ? ['arn:aws:dynamodb:ap-northeast-1:654512230021:table/siko-coffee-*']
            : [
                'arn:aws:dynamodb:ap-northeast-1:654512230021:table/siko-coffee-preview-*',
                'arn:aws:dynamodb:ap-northeast-1:654512230021:table/siko-coffee-preview-*/index/*',
              ],
        },
        {
          actions: ['ses:SendEmail', 'ses:SendRawEmail'],
          resources: ['*'],
        },
        {
          actions: ['rekognition:DetectModerationLabels'],
          resources: ['*'],
        },
      ],

      environment: {
        // ⚠️ `AWS_REGION` は **Lambda の予約環境変数**でここから設定できない
        // （関数のリージョンが自動で入る）。アプリ側は process.env.AWS_REGION を
        // 読むだけなので、ap-northeast-1 にデプロイする限りそのまま動く。
        //
        // ⚠️ `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` は **意図的に置かない**
        // （上の permissions による実行ロールへ置き換えるのが移行の目的）。
        //
        // ⚠️ `PAYMENTS_ENABLED` も **意図的に置かない**＝決済は停止のまま
        // （AWS移行 Phase 0）。再開は Phase 4 で、手順は docs を参照。
        NODE_ENV: 'production',

        // 🔴 **AWS では必須**。NextAuth v5 は Vercel だと `VERCEL` 環境変数から
        // ホストを信頼できると判断するが、Lambda + CloudFront では判断できず
        // `UntrustedHost` で認証系が全滅する。`src/lib/auth.ts` に trustHost の
        // 指定が無いため、ここで明示する。
        AUTH_TRUST_HOST: 'true',

        // 投入済みシークレット（値は SSM 由来。ここには現れない）
        ...secretEnv,

        // ⚠️ **暫定措置**: `src/lib/db.ts` はテーブル名の接頭辞を `VERCEL_ENV === 'preview'`
        // で決めている。AWS には VERCEL_ENV が無いので、放っておくと非本番ステージが
        // **本番テーブル `siko-coffee-*` を向く**（上の permissions が preview 限定なので
        // AccessDenied で止まる＝フェイルクローズではあるが、意図としては誤り）。
        // Phase 2 の「VERCEL_ENV → STAGE 書き換え（4ファイル）」が済むまで、ここで値を与える。
        ...(isProd ? {} : { VERCEL_ENV: 'preview' }),

        // 📌 `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` はここでは設定しない（予約変数）が、
        // **Lambda は実行ロールの資格情報を同名の環境変数として自動注入する**。
        // `src/lib/db.ts` の `isDbConfigured()` はその存在を見て判定しているため、
        // 静的キーを剥がしても DynamoDB 呼び出しはスキップされない。この挙動に依存している。
      },

      server: {
        // 本番相当の余裕を持たせつつ、Hobby 並みのトラフィックに合わせた控えめな値。
        memory: '1024 MB',
        timeout: '30 seconds',
      },
    })
  },
})

// ─────────────────────────────────────────────────────────────
// 本番切替前に必須の作業（stage dev では未実施のまま動かしている）
//
// 0. 🔴 **next/image が最適化されない**（2026-07-27 実測）。w を変えても応答が
//    原本のまま（Vercel 4KB/webp に対し AWS 222KB/png ＝約53倍）。Lambda は起動し
//    パラメータ検証も効いており例外も無い＝変換をスキップしている。SST #6867 と
//    症状が一致。Lighthouse Perf 49 の本プロジェクトでは切替前に必須の解消項目。
//
// 1. シークレットの投入。`sst secret set <NAME> <VALUE> --stage <stage>` で入れ、
//    environment ではなく Secret 経由で参照するよう本ファイルを更新する。
//    最低限必要: AUTH_SECRET / ORDER_TOKEN_SECRET / CRON_SECRET / REVALIDATE_SECRET /
//    MAIL_FROM / ADMIN_PASSWORD_HASH / ADMIN_SESSION_SECRET / ADMIN_TOTP_SECRET /
//    ADMIN_TOTP_REQUIRED / WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN /
//    GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / LINE_CLIENT_ID / LINE_CLIENT_SECRET /
//    SLACK_WEBHOOK_URL / SENTRY_* / NEXT_PUBLIC_SENTRY_DSN / NEXT_PUBLIC_GA_MEASUREMENT_ID /
//    INSTAGRAM_ACCESS_TOKEN / STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET
//    （Stripe は決済停止中のため Phase 4 まで未設定でよい）
//
// 2. Vercel Blob の置き換え。`BLOB_*` は Vercel 固有で AWS には無い。
//    S3 バケットを作って `src/lib` のアップロード実装を差し替え、
//    `next.config.ts` の remotePatterns から `**.public.blob.vercel-storage.com` を外す。
//
// 3. cron 4本を EventBridge Scheduler へ。Vercel Hobby の「日次まで」制約が外れるので、
//    release-reservations は 10分毎に戻せる（docs の項目22・blend-platform-plan §14.3）。
//
// 4. WAF 3ルールの再構築（rate limit / bot challenge / geo≠JP deny）。
//
// 5. apex 正規化を CloudFront Function へ移設し、next.config.ts の redirects() を削除
//    （OpenNext #1202 の恒久対処。現在は明示アンカーで暫定回避している）。
// ─────────────────────────────────────────────────────────────
