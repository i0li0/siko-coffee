// SST が生成する型はこの三重スラッシュ参照でしか供給されない（import 形式は不可）ため、
// このファイルに限りルールを無効化する。
/* eslint-disable-next-line @typescript-eslint/triple-slash-reference */
/// <reference path="./.sst/platform/config.d.ts" />

// SST v4 による AWS 移行の IaC（docs/aws-migration-feasibility.md Phase 1）。
//
// ✅ stage `dev` へデプロイ済み（2026-07-27）: https://d3ejmruzea0u7a.cloudfront.net
// Phase 1 の目的は「本番に影響を与えずプレビュー環境だけ AWS に立てて学ぶ」こと。
// **本番ステージはまだ作っていない**。ファイル末尾の「本番切替までの作業順」を消化してから。
//
// この移行の呼称は **「Pour Over（ポアオーバー）」**。順序と依存関係の正本は
// docs/aws-migration-feasibility.md「Pour Over 実行順」、実装者向けの索引は本ファイル末尾。
//
// デプロイ手順:
//   npm run sst:deploy -- --stage dev
//
// 🔴 **素の `npx sst deploy` を直接打たないこと。** 忘れると壊れる前後処理が3つあり、
//    `scripts/deploy.sh` にまとめてある（打てば正しい状態になるようにしてある）:
//   ① npm 11 以降の確認 — 10 系だと OpenNext が image-optimization Lambda に入れる sharp が
//      wasm32 フォールバックに落ち、next/image が**無言で最適化されなくなる**（デプロイは成功する）。
//      詳細は open-next.config.ts の imageOptimization.install のコメント。
//   ② AWS 資格情報の環境変数への展開 — `aws sts get-caller-identity` が通っても SST は落ちる。
//      `~/.aws/config` の `login_session` は aws CLI 独自で、SST(Pulumi の Go SDK) は解釈できないため。
//   ③ デプロイ後の `verify:image-optimizer` — ①をすり抜けた場合の最後の網。
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
        // ⚠️ **本番切替前に 2048 MB へ上げる**（末尾の作業順 7）。
        // Lambda の CPU はメモリに比例し **1769 MB で 1 vCPU 相当**。つまり現行 1024 MB は
        // 約 0.58 vCPU で、**Vercel Hobby の 1 vCPU / 2 GB に対して6割**しかない。
        // GB-秒課金なので、メモリを上げて実行時間が縮めば費用はおおむね相殺される。
        memory: '1024 MB',
        // 📌 実効の上限はここではなく **CloudFront のオリジン ReadTimeout（実測 30秒）**。
        // 値はディストリビューションではなく **KVS の metadata**（`origin.timeouts.readTimeout`）にあり、
        // CloudFront Function の `setUrlOrigin()` が `cf.updateRequestOrigin()` で毎リクエスト適用する。
        // ディストリビューション側に見える 20 秒は `placeholder.sst.dev` オリジンのもので、
        // KVS の metadata を読めなかったときしか使われない。
        // Vercel は関数に 300 秒くれていたので、HTTP 経由の実行予算は **1/10 に縮む**。
        // 長い処理（cron・管理系の集約）は CloudFront を経由させない設計にすること（作業順 8）。
        // ⚠️ 下の 30 秒は **CloudFront の 30 秒と同値**。同時に切れるため、504 が返ったときに
        // 「関数が落ちた」のか「CF が切った」のかを区別できない。CF 側を長くするのが望ましい。
        timeout: '30 seconds',
      },
    })
  },
})

// ─────────────────────────────────────────────────────────────
// 本番切替までの作業順（プロジェクト「Pour Over」・2026-07-28 再監査・全20項目）
//
// 正本は docs/aws-migration-feasibility.md「Pour Over 実行順」。ここは実装者向けの索引。
// ✅ 完了: next/image の最適化（sharp のクロスビルド。open-next.config.ts 参照）
//
// ── 第0群｜地ならし（本番影響ゼロ・依存なし）────────────────────
// 0-a. ✅ npm 11 の恒久化。package.json の engines ＋ scripts/check-build-toolchain.mjs で
//      **デプロイ経路にゲート**を置いた。以後の入口は `npm run sst:deploy -- --stage <stage>`。
//      🔴 npm 10 でビルドすると sharp が wasm32 に落ち、next/image が無言で壊れたまま
//         デプロイは成功する。CI は next build のみなのでゲートを入れていない。
// 0-b. ⬜ CAA に `0 issue "amazon.com"` を追加 → 直後に ACM で試験発行し 12 の不確実性を消す。
// 0-c. ✅ Amplify を削除（association → app → AmplifyServiceRole → 孤児 CNAME 2本）。
//      公開コピーは停止、本番 DNS は無傷を確認済み。**依存 I は解消**。
// 0-d. ⬜ 予算アラートの閾値見直し（$0.01 通知 → 適正値 / 上限 $10 → $20）。
//
// ── 第1群｜下ごしらえ（本番無影響・並行可）────────────────────────
//  1. VERCEL_ENV → STAGE。本ファイルに `STAGE: $app.stage` を足し、暫定の VERCEL_ENV 注入を消す。
//     コード側4ファイル: src/lib/db.ts / sentry.server.config.ts / sentry.client.config.ts /
//     scripts/integration/platform-flow.test.ts。
//     ⚠️ db.ts は判定の**向きを反転**する（現行は未設定だと本番テーブルを向くフェイルオープン）。
//     ⚠️ sentry.*.config.ts は `tracesSampleRate: VERCEL_ENV==='production' ? 0.1 : 0` のため、
//        直さないと **AWS 本番で Performance が完全に無効**のまま切り替わる。
//     📌 Vercel にカスタム環境は無く VERCEL_ENV は3値だけ＝`STAGE==='production' ? 本番 : preview` で足りる。
//  2. cron 4ルートの catch に console.error を足す（EventBridge 後は CloudWatch が唯一の観測手段）。
//  3. Vercel 専用スクリプト（@vercel/analytics・@vercel/speed-insights）を条件付きレンダーにする。
//  4. Vercel Blob → S3。**presigned S3 PUT で実装すること**（理由は 5 の 1MB 制限）。
//     移送すべきデータは無い（本番の avatarUrl 保持ユーザーは0件・Blob ストアも空）＝コード置換のみ。
//     next.config.ts の remotePatterns と CSP img-src を**両方**更新する。
//
// ── 第2群｜AWS の防御と実行基盤（dev で検証）────────────────────
//  5. 🔴 **Function URL の保護**。OpenNext/SST は server Lambda の Function URL をオリジンにするが
//     AuthType=NONE・Principal=* で**全公開**。実測で直アクセスできる（/ =200, /admin =307）。
//     このままだと 6 の WAF も 11 の apex 正規化も 9 の noindex も**全部迂回される**。
//     さらに直叩きでは CFF を通らないため **x-forwarded-host を偽装できる**。
//     → SsrSite の `protection` を **"oac-with-edge-signing"** にする。
//     ✅ host 依存ロジック（CSRF/NextAuth/passkey/checkout）は**壊れない**。ORP は元から
//        Managed-AllViewerExceptHostHeader で、CFF が x-forwarded-host に退避している（検証済み）。
//     ⚠️ 完了判定は `get-function-url-config` の **AuthType: AWS_IAM**。公開ステートメントは
//        すべて AuthType=NONE 条件付きなので、切替時点で自動的に不発になる（残骸は無害な汚れ）。
//        protection は server と image-optimizer の**両方**を iam に切り替える。
//     "oac" は POST に x-amz-content-sha256 を要求し、Stripe webhook・NextAuth・フォーム送信が
//     壊れるため**採用不可**（本プロジェクトは POST ルートが20本以上）。
//  6. WAF 3ルール（rate limit / bot challenge / geo≠JP deny）を AWS WAF で再構築。
//     **CLOUDFRONT スコープ＝us-east-1 固定**。`transform.cdn` で `webAclArn` を渡す（直接の引数は無い）。
//     ⚠️ 対象パスは現行どおり /admin* と /api/admin/* に限定する。全パスに広げると 8 の cron を自分で止める。
//     費用は $5/ACL + $1/rule×3 = **月$8**＝移行後の AWS コストの大半がこれ。
//  7. server.memory を 1024 MB → **2048 MB** へ。Lambda の CPU はメモリ比例で 1769MB＝1vCPU 相当のため、
//     現行 1024MB は約0.58vCPU ＝ **Vercel(1vCPU/2GB) の6割**。GB-秒課金なので実行時間が縮めば費用は相殺。
//  8. cron 4本 → `sst.aws.Cron`（実体は **EventBridge Rules**。Scheduler ではない・4.17.1 で確認）
//     ＋中継 Lambda。
//     ⚠️ Rules は API Destinations で HTTPS を叩けるが **SigV4 非対応**。5 で IAM 認証にする以上
//        中継 Lambda が要る。同一アカウントなので中継側の**アイデンティティポリシーに
//        lambda:InvokeFunctionUrl** を与えれば足りる（対象は `web.nodes.server.url`）。
//     ⚠️ 中継先は CloudFront ではなく **Function URL を直接**（CloudFront のオリジン ReadTimeout は
//        実測30秒しかなく、Vercel の 300秒 から大幅に縮む）。5 で IAM 認証にするなら実行ロールで SigV4 署名する。
//     Hobby の日次制限が外れるので release-reservations は 10分毎に戻す。
//     📌 そもそも Vercel では release-reservations が**登録済みなのに実行されていなかった**（2026-07-28 実測）。
//  9. 非本番ステージに X-Robots-Tag: noindex（`edge.viewerResponse.injection`）＋アクセス制限。
//     Vercel は Deployment Protection で dev URL を守っていたが **AWS に同等機能は無い**。
//
// ── 第3群｜切替準備 ──────────────────────────────────────────
// 9.5 🆕 GitHub Actions ＋ OIDC ロールで `sst deploy` を自動化する（16項目の版で抜けていた）。
//     無いと 14 の soak 中に main へ push するたび **Vercel だけが更新され AWS が取り残される**。
// 10. CloudWatch Alarms を先に用意する（切替後ではなく切替前。観測できない状態で切り替えない）。
//     ⚠️ SNS トピックが 0 個＝通知先そのものが無い。トピック作成から。
// 11. Route53 の TTL を 60s へ。**切替の24時間以上前**（現行 www=500s / apex=300s）。
// 12. `domain` を設定（name: www.sikocoffee.com / aliases に apex）＋ apex→www の 308 と HSTS を
//     `edge.viewerRequest.injection` で出す。
//     ⚠️ **`domain.redirects` を使ってはいけない**。SST の HttpsRedirect は S3 website リダイレクトで
//        **HSTS ヘッダが付かず**、現行設計（リダイレクト応答にも完全な HSTS を乗せる）を壊す。
//     ⚠️ CloudFront Function は**1ビヘイビアに1つ**しか付かない。SST 生成の関数に injection が
//        合成される仕組みなので、独立した関数を足そうとしないこと。
//     🔴 **証明書は SST に自動作成させないこと。`domain.cert` に下記 ARN を渡す。**
//        arn:aws:acm:us-east-1:654512230021:certificate/01195002-424e-44b1-9425-aff38c879765
//        （sikocoffee.com + *.sikocoffee.com / Issuer: Amazon / 2027-02-11 まで）
//        理由: `www.sikocoffee.com` は Vercel への CNAME で、RFC 8659 により CA は
//        **CNAME 先の CAA** を見る。その先（724b9301c41a7c8f.vercel-dns-017.com）は
//        sectigo/globalsign/letsencrypt/pki.goog しか許可しておらず **amazon.com が無い**ため、
//        www 単独の証明書は自ゾーンの CAA を直しても **CAA_ERROR で発行できない**（0-b で実証）。
//        ワイルドカードなら評価が sikocoffee.com から始まるので通る。
//        ⚠️ 検証レコード `_c84c530444dc328407ddf8a6cf46916b.sikocoffee.com` を消さないこと
//           （このワイルドカード証明書の更新に使われている）。
//     ✅ 12 の前提だった2件は解消済み: ① CAA に amazon.com を追加（0-b）② Amplify の削除（0-c）。
//        詳細は docs/aws-migration-feasibility.md の第0群。
//
// ── 第4群｜切替と観測 ────────────────────────────────────────
// 13. production ステージへデプロイ → 検証 → DNS 切替。
//     シークレットは Vercel 本番の30本と突合済み（AWSキー3本は廃止・BLOB3本は不要）。
// 14. soak 期間。**Vercel は main 自動デプロイのまま生かしておく**＝ロールバック先が常に最新に保たれる。
//     この期間、Vercel の設定には一切触らない。
//
// ── 第5群｜後始末 ────────────────────────────────────────────
// 15. Vercel 解約 ＋ 決済再開（①Stripe 新キー投入 →②PAYMENTS_ENABLED=true →③再デプロイ の順厳守）。
// 16. Vercel 依存の撤去。🔴 **vercel.json だけ消すと build が全環境で落ちる**
//     （prebuild → scripts/check-cron-schedule.mjs が vercel.json を読めず exit 1。CI にも同ステップ）。
//     4点セットで消すこと: ①redirects() ②vercel.json ③check-cron-schedule.mjs + prebuild + check:cron
//     ④CI の該当ステップ ⑤src/__tests__/hostRedirects.test.ts
//     ⚠️ 12 が動いてからにすること。先に消すと apex が無正規化になる。
//
// ── 🔴 動かせない依存 ────────────────────────────────────────
//  A. 5 → 6      : Function URL を閉じないと WAF は迂回されるので無意味
//  B. 5 と 4     : 5 の Lambda@Edge はボディ 1MB 上限。だから 4 は presigned S3 PUT で作る
//  C. 6 → 13     : WAF 不在で切り替えると admin の防御が丸ごと消える
//  D. 1 → 13     : Sentry が無効のままだと切替後に何を観測しても信用できない
//  E. 8 → 15     : Instagram の長期トークンは月次 cron で延長。60日止まると恒久失効し手動再認証が要る
//  F. 11 → 13    : 24時間以上前でないと旧 TTL が失効せず引き下げが効かない
//  G. 12 → 16    : 先に redirects() を消すと apex が無正規化になる
//  H. 0-b(CAA修正) → 12 : Amazon CA が CAA で許可されていないと ACM が発行できない
//  I. ✅ 解消済（0-c で Amplify を削除した）
//  J. 0-a → 以降の全デプロイ : npm 10 だと next/image が無言で壊れたままデプロイが成功する
//  K. 9.5 → 14  : 無いと soak 中に AWS だけが古くなる
//  L. Instagram トークン更新確認 → 15 : 実測 refreshedAt=2026-07-01 / 60日 ＝ **失効 2026-08-30**。
//     次の更新機会は 2026-08-01 00:00 UTC。成否は siko-coffee-config の refreshedAt で判定できる。
// ─────────────────────────────────────────────────────────────
