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
      // BLOB_* … ✅ 4 で S3 に置き換え済み。Vercel 側の3本も 15 で捨ててよい
      // WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN … 未設定ならリクエスト元から自動導出されるので dev では不要
    ] as const

    const secretEnv = Object.fromEntries(
      SECRET_NAMES.map((name) => [name, new sst.Secret(name).value]),
    )

    // ── アバター画像の保管（Pour Over 4: Vercel Blob → S3）──────────
    //
    // 🔴 **バケットを2つに分けるのは検閲の順序が逆転するから。**
    // Blob 版は「Rekognition に通してから put()」だったが、presigned PUT では
    // **アップロードが先・検閲が後**になる。同じバケットのプレフィクス違いで
    // CDN を被せると、`pending/` も配信対象になってしまう（ビヘイビアで塞ぐ運用に頼ることになる）。
    // 置き場自体を分ければ「公開される場所に未検閲物を置けない」ことが構造で保証される。
    //
    // 🔴 **13（切替）より前に本番で使い始める**ため、サイト本体の CloudFront には
    // 相乗りできない（本番ステージがまだ無い）。専用の Router を立てる。
    // CloudFront は無料枠（1TB / 1000万リクエスト）の内側なので費用はほぼ増えない。
    // 13 の後にサイト側のディストリビューションへ統合してもよい。

    // 非公開。presigned PUT の宛先で、**検閲前の未確認オブジェクトだけ**が入る。
    const avatarUploads = new sst.aws.Bucket('AvatarUploads', {
      // ブラウザから直接 PUT するので CORS が要る。
      // ⚠️ オリジンを絞らないのは、**認可は presigned URL 自体**（署名・5分・単一キー）が
      // 担っており、かつ soak 期間は Vercel と AWS の2オリジンから叩かれるため。
      // 許可するメソッドは PUT だけに限定する。
      cors: {
        allowMethods: ['PUT'],
        allowOrigins: ['*'],
        allowHeaders: ['content-type'],
        maxAge: '1 hour',
      },
    })

    // 🔴 放置された未検閲オブジェクトの掃除。**これが無いと「confirm を呼ばずに
    // 上げ続ける」だけで課金対象のゴミが無限に溜まる**。
    new aws.s3.BucketLifecycleConfigurationV2('AvatarUploadsLifecycle', {
      bucket: avatarUploads.name,
      rules: [
        {
          id: 'expire-pending',
          status: 'Enabled',
          filter: { prefix: 'pending/' },
          expiration: { days: 1 },
          abortIncompleteMultipartUpload: { daysAfterInitiation: 1 },
        },
      ],
    })

    // 公開用。CloudFront(OAC) からのみ読める＝バケット自体は公開しない。
    // **検閲を通ったものだけ**がここへコピーされる。
    const avatarPublic = new sst.aws.Bucket('Avatars', {
      access: 'cloudfront',
    })

    const avatarCdn = new sst.aws.Router('AvatarCdn', {
      routes: { '/*': { bucket: avatarPublic } },
    })

    // ── admin の防御層（Pour Over 6: Vercel WAF → AWS WAF）──────────
    //
    // Vercel の現行3ルールをそのまま移す。値は推測ではなく
    // `vercel firewall rules ls --json` で採取した live 設定（2026-07-31）:
    //   ① Admin login rate limit … /api/admin/auth と /api/admin/passkey/login に
    //      IP 別 30req/60s（fixed_window）→ 超過で deny
    //   ② Admin UI bot challenge … /admin* に challenge
    //   ③ Admin geo restrict JP  … /admin* と /api/admin/* で geo_country ≠ JP なら deny
    //
    // 🔴 **対象パスは admin に限定する。** 全パスへ広げると 8（EventBridge → cron）を
    //    自分でレート制限することになる。公開ページは default action の allow を素通りする。
    //
    // 🔴 **scope: 'CLOUDFRONT' の web ACL は us-east-1 にしか作れない。** アプリ本体は
    //    ap-northeast-1 なので、このリソースだけ専用のプロバイダを立てる。
    //
    // ⚠️ **依存 A**: 5（Function URL の保護）が無いと Lambda の Function URL を直叩きする
    //    だけでこの web ACL は丸ごと迂回される。5 は適用済み（AuthType: AWS_IAM）。
    //
    // ⚠️ **海外渡航時は admin にアクセスできなくなる**（③）。Vercel では
    //    `vercel firewall rules disable <id>` で一時解除していたが、AWS では
    //    この配列から 'JP' 以外の国を足すのではなく、**ルールの action を count に変えて
    //    デプロイし直す**のが手順になる（IaC 管理下のリソースを CLI で触らない＝教訓6）。
    //
    // 💰 $5/web ACL + $1/rule × 3 = **月$8**。移行後の AWS コストの大半がこれ。
    //    ステージごとに1枚できるため、dev と production が並ぶ soak 期間は倍かかる。
    //    → **dev での検証が済んだら下の配列から 'dev' を外して再デプロイする。**
    //    ⚠️ 9（非本番のアクセス制限）で web ACL を**もう1枚作らないこと**（+$5/月）。
    //       必要ならこの ACL を dev のディストリビューションと共有する。
    const WAF_STAGES = ['production', 'dev']

    // Vercel の path 条件は前方一致（op: 'pre'）。AWS では uriPath の STARTS_WITH に対応する。
    // ⚠️ 変換を2段かけているのは **エンコードによる迂回を塞ぐため**。素の uriPath だけを見ると
    //    `/%61dmin` や `/Admin` が条件をすり抜けたうえで、オリジン側では /admin として
    //    解決されうる（Next のルーティングは大文字小文字を区別するので後者は 404 になるが、
    //    「WAF が見た文字列」と「アプリが解釈するパス」がずれること自体を作らない）。
    const pathStartsWith = (
      prefix: string,
    ): aws.types.input.wafv2.WebAclRuleStatement => ({
      byteMatchStatement: {
        searchString: prefix,
        positionalConstraint: 'STARTS_WITH',
        fieldToMatch: { uriPath: {} },
        textTransformations: [
          { priority: 0, type: 'URL_DECODE' },
          { priority: 1, type: 'LOWERCASE' },
        ],
      },
    })

    const wafVisibility = (metricName: string) => ({
      cloudwatchMetricsEnabled: true,
      sampledRequestsEnabled: true,
      metricName,
    })

    // 「admin 系のどれか」＝ UI と API の両方。③が対象にするパス。
    const adminPaths: aws.types.input.wafv2.WebAclRuleStatement = {
      orStatement: {
        statements: [pathStartsWith('/admin'), pathStartsWith('/api/admin')],
      },
    }

    const adminWaf = WAF_STAGES.includes($app.stage)
      ? new aws.wafv2.WebAcl(
          'AdminWaf',
          {
            scope: 'CLOUDFRONT',
            // 公開サイトは素通り。ルールに当たった admin 系だけを止める。
            defaultAction: { allow: {} },
            visibilityConfig: wafVisibility(`siko-${$app.stage}-admin-waf`),
            // 🔴 **既定の 300 秒では admin の画面遷移に割り込む。**
            // App Router のクライアント遷移は同じ /admin* パスへ RSC の fetch を投げる。
            // dev で実測したところ `RSC: 1` 付きのリクエストも 202（challenge）になったので、
            // トークンが切れた瞬間の遷移は RSC ペイロードの代わりに challenge の HTML を受け取る。
            // admin セッションは 25 時間（api/admin/auth の cookie maxAge）なので、
            // 免疫時間を1時間に伸ばして「セッション中に何度も割り込まれる」のを避ける。
            // 📌 challenge は静かな JS チャレンジで、突破コストはヘッドレスブラウザなら
            //    1時間でも5分でも変わらない。実効的な統制は geo deny とレート制限のほう。
            challengeConfig: { immunityTimeProperty: { immunityTime: 3600 } },
            rules: [
              // ① レート制限。Vercel と同じ「IP 別 30req/60s を超えたら deny」。
              // 📌 挙動は完全に同じではない: Vercel の fixed_window は窓の境界でカウンタが
              //    リセットされるが、AWS は約30秒ごとに直近の窓を再評価し、**レートが
              //    しきい値を下回るまでブロックが続く**。移行で緩む方向ではないので採用する。
              {
                name: 'AdminLoginRateLimit',
                priority: 0,
                action: { block: {} },
                statement: {
                  rateBasedStatement: {
                    limit: 30,
                    evaluationWindowSec: 60,
                    aggregateKeyType: 'IP',
                    scopeDownStatement: {
                      orStatement: {
                        statements: [
                          pathStartsWith('/api/admin/auth'),
                          pathStartsWith('/api/admin/passkey/login'),
                        ],
                      },
                    },
                  },
                },
                visibilityConfig: wafVisibility(
                  `siko-${$app.stage}-admin-login-rate-limit`,
                ),
              },
              // ② geo 制限。**Vercel では challenge の後ろにあったが、ここでは前に置く。**
              //    どちらの順でも最終的な応答は deny で同じだが、これから拒否する相手に
              //    challenge のページを出して往復させる意味がないため。
              {
                name: 'AdminGeoRestrictJp',
                priority: 1,
                action: { block: {} },
                statement: {
                  andStatement: {
                    statements: [
                      {
                        notStatement: {
                          statements: [
                            { geoMatchStatement: { countryCodes: ['JP'] } },
                          ],
                        },
                      },
                      adminPaths,
                    ],
                  },
                },
                visibilityConfig: wafVisibility(
                  `siko-${$app.stage}-admin-geo-restrict-jp`,
                ),
              },
              // ③ bot チャレンジ。対象は **UI の /admin* だけ**（Vercel も同じ条件で、
              //    /api/admin/* は前方一致に含まれない）。API に challenge を掛けると
              //    JS を実行できないクライアントが正規の経路でも通れなくなる。
              //    📌 challenge は CAPTCHA と違い**追加課金が無い**（CAPTCHA は $0.40/1000）。
              {
                name: 'AdminUiBotChallenge',
                priority: 2,
                action: { challenge: {} },
                statement: pathStartsWith('/admin'),
                visibilityConfig: wafVisibility(
                  `siko-${$app.stage}-admin-ui-bot-challenge`,
                ),
              },
            ],
          },
          {
            provider: new aws.Provider('WafUsEast1', { region: 'us-east-1' }),
          },
        )
      : undefined

    new sst.aws.Nextjs('Web', {
      // ⚠️ 必須のピン留め。SST の既定は OpenNext **3.9.14**（Next.js 15 想定）で、
      // 本プロジェクトの Next 16.2.11 は OpenNext **4.1.0** 以上でないとビルドできない
      // （4.1.0 の peer は `>=15.5.21 <16 || >=16.2.11`）。
      // SST 4.17.1 が読む出力（origins default/imageOptimizer/s3・edgeFunctions・
      // additionalProps.revalidationFunction/initializationFunction）は
      // OpenNext 4.1.0 の出力と一致することを実物で照合済み。
      // buildId は output JSON ではなく `.next/BUILD_ID` から読まれるため欠落は問題にならない。
      openNextVersion: '4.1.0',

      // ── Function URL の保護（Pour Over 5）─────────────────────────
      //
      // 🔴 **既定（"none"）だと server と image-optimizer の Function URL が全公開になる。**
      // OpenNext/SST は Lambda の Function URL を CloudFront のオリジンにするが、その
      // AuthType は `NONE`・リソースポリシーは `Principal: *` で CloudFront 限定の条件が無い。
      // 実測で `https://<32文字>.lambda-url.ap-northeast-1.on.aws/` に直アクセスでき、
      // `/` = 200 / `/admin` = 307 が返る。つまり CloudFront の前に何を置いても
      // **6 の WAF も 9 の noindex も 12 の apex 正規化も、この URL を直接叩けば全部素通りする**。
      // さらに直叩きでは CloudFront Function を経由しないため、下記の `x-forwarded-host`
      // 退避が走らず **ホストを偽装できる**。URL は推測困難だが obscurity は統制ではない。
      //
      // ⚠️ **"oac" は採用できない。** POST に `x-amz-content-sha256` を自前で付ける必要があり、
      // 本プロジェクトは POST ルートが20本以上ある。Stripe webhook・NextAuth・ブラウザの
      // フォーム送信は**そのヘッダを付けられない**ので、まとめて壊れる。
      // → Lambda@Edge が自動署名する `"oac-with-edge-signing"` が唯一の現実解。
      //
      // ✅ host 依存ロジック（`src/middleware.ts` の CSRF・NextAuth・パスキーの rpID 導出・
      // checkout のホスト許可）は**壊れない**。オリジンリクエストポリシーが元から
      // `Managed-AllViewerExceptHostHeader` で Host を転送しておらず、SST の CloudFront Function が
      // `setForwardedHost()` で `x-forwarded-host` に本来のホストを退避しているため
      // （dev への実プローブで裏取り済み）。
      //
      // 🔗 **依存 B**: このモードは Lambda@Edge を経路に挟むので **リクエストボディが 1MB 上限**。
      // 4 でアバターを presigned S3 PUT にしてあるのはこのため（大きなボディは
      // CloudFront/Lambda を通らず S3 へ直接行く）。1MB 超のボディを持つルートは他に無い
      // （Server Actions は未使用）。
      //
      // ⚠️ **完了判定は `Principal:*` の掃除ではなく AuthType を見ること。**
      //   aws lambda get-function-url-config --function-name <server> --query AuthType
      //   → `AWS_IAM` になっていれば完了。公開ステートメントは5本残るが、すべて
      //   `Condition: lambda:FunctionUrlAuthType = NONE` 付きなので切替時点で不発になる
      //   （SST は世代違いの古いステートメントを掃除しないが、それは無害な汚れ）。
      //   protection は server と image-optimizer の**両方**を iam に切り替える。
      //
      // ⚠️ **外す（"none" に戻す）ときは 5〜10 分かかる。** Lambda@Edge のレプリカが
      //   全エッジロケーションから消えるまで削除がブロックされるため。
      protection: 'oac-with-edge-signing',

      // ── WAF の紐付け（Pour Over 6）───────────────────────────────
      // `sst.aws.Nextjs` には webAcl を渡す引数が無く、内部の Cdn コンポーネントの
      // `webAclArn` を transform 経由で埋めるのが唯一の経路（Cdn は直接生成しない）。
      // 📌 CloudFront の API はこのフィールドを紛らわしくも `webAclId` と呼ぶが、
      //    WAFv2 では **ARN を渡す**。SST 側が名前の差を吸収している。
      transform: {
        cdn: (cdnArgs) => {
          if (adminWaf) cdnArgs.webAclArn = adminWaf.arn
        },
      },

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
        // アバター（Pour Over 4）。**バケットごとに必要な操作だけ**を与える。
        // ⚠️ Rekognition は「サービスが勝手に読む」のではなく **呼び出し元の権限**で
        // S3 を読む。`Image: { S3Object }` にした以上、アップロード用バケットの
        // `s3:GetObject` が無いと検閲が丸ごと失敗する（＝全部 `safe:false` になる）。
        {
          actions: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
          resources: [$interpolate`${avatarUploads.arn}/pending/*`],
        },
        {
          actions: ['s3:PutObject', 's3:DeleteObject'],
          resources: [$interpolate`${avatarPublic.arn}/avatars/*`],
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

        // ステージ判定の入力（Pour Over 1 で `VERCEL_ENV` から移行済み）。
        // `src/lib/stage.ts` がこれを読み、`src/lib/db.ts` のテーブル接頭辞と
        // `sentry.*.config.ts` の environment / tracesSampleRate を決める。
        // 判定はフェイルクローズなので、**本番ステージ以外では preview テーブルを向く**。
        STAGE: $app.stage,

        // アバターの保管先（Pour Over 4）。`src/lib/avatarStorage.ts` が読む。
        // ⚠️ 3本そろっていないとアップロードは 503 で止まる（フェイルクローズ）。
        // soak 期間は **Vercel 側にも同じ3本**を入れる必要がある（同じバケットを使う）。
        AVATAR_UPLOAD_BUCKET: avatarUploads.name,
        AVATAR_BUCKET: avatarPublic.name,
        AVATAR_BASE_URL: avatarCdn.url,

        // 📌 `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` はここでは設定しない（予約変数）が、
        // **Lambda は実行ロールの資格情報を同名の環境変数として自動注入する**。
        // `src/lib/db.ts` の `isDbConfigured()` はその存在を見て判定しているため、
        // 静的キーを剥がしても DynamoDB 呼び出しはスキップされない。この挙動に依存している。
      },

      server: {
        // ✅ 作業順 7（2026-07-31 実施）。1024 MB → 2048 MB。
        // Lambda の CPU はメモリに比例し **1769 MB で 1 vCPU 相当**。旧値 1024 MB は
        // 約 0.58 vCPU で、**Vercel Hobby の 1 vCPU / 2 GB に対して6割**しかなかった。
        // 2048 MB で **約 1.16 vCPU**＝ Vercel を上回り、8 の実行予算（30秒）にも効く。
        //
        // 🔑 **これはメモリ不足の解消ではなく純粋な CPU 増強**。変更の前後とも
        // `maxMemoryUsed` は **231 → 230 MB**＝ RAM は元から 77% 余っていた。OOM 対策ではない。
        //
        // 📊 dev で実測（CloudWatch の REPORT・コールドとウォームを分けて集計）:
        //    ウォーム p50 73.8 → **51.3 ms**（n=123）
        //    コールド p50 2,041 → **1,068 ms（−48%）**（n=21）  ← 効いたのは主にここ
        //
        // 💰 「GB-秒課金なので費用は相殺される」は**言い過ぎだった**。変更前のコールド率(15.6%)で
        // 加重平均すると 0.381 → 0.420 GB-秒＝**約 +10%**（実行時間の短縮が2倍のメモリを
        // 完全には打ち消さない）。ただし 5.5K invocations/月では**月 $0.003 の差**＝誤差。
        // コストの主役は依然 WAF($8/月)。
        //
        // 📌 arm64 化は**ここでは行わない**。server は x86_64、image-optimizer は arm64 と
        // アーキテクチャが不一致で揃える余地はあるが、同時に変えると
        // 「速くなったのはメモリか arm64 か」を切り分けられなくなる。別途1変数で測る。
        memory: '2048 MB',
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
// 本番切替までの作業順（プロジェクト「Pour Over」・2026-07-28 再監査・**全21項目**）
// 📌 2026-07-31 訂正: 長らく「全20項目」と書いていたが、実数は 21（第0群 4 ＋ 本編 17）。
//    20 は 9.5 を足す前の数で、合計だけが取り残されていた。**番号は動かしていない。**
// 進捗（2026-07-31）: 11 / 21。第0群 4/4・第1群 4/4・第2群 3/5（5・6・7 が完了）。
//
// 正本は docs/aws-migration-feasibility.md「Pour Over 実行順」。ここは実装者向けの索引。
// ✅ 完了: next/image の最適化（sharp のクロスビルド。open-next.config.ts 参照）
//
// ── 第0群｜地ならし（本番影響ゼロ・依存なし）────────────────────
// 0-a. ✅ npm 11 の恒久化。package.json の engines ＋ scripts/check-build-toolchain.mjs で
//      **デプロイ経路にゲート**を置いた。以後の入口は `npm run sst:deploy -- --stage <stage>`。
//      🔴 npm 10 でビルドすると sharp が wasm32 に落ち、next/image が無言で壊れたまま
//         デプロイは成功する。CI は next build のみなのでゲートを入れていない。
// 0-b. ✅ CAA に `0 issue "amazon.com"` を追加。試験発行で **www 単独の証明書は
//      Vercel 側の CAA に阻まれて発行できない**ことが判明し、`sikocoffee.com` +
//      `*.sikocoffee.com` のワイルドカード証明書で解決した。**依存 H は解消**。
//      🔴 12 では SST に証明書を作らせず、この ARN を `domain.cert` に渡すこと:
//         arn:aws:acm:us-east-1:654512230021:certificate/01195002-424e-44b1-9425-aff38c879765
// 0-c. ✅ Amplify を削除（association → app → AmplifyServiceRole → 孤児 CNAME 2本）。
//      公開コピーは停止、本番 DNS は無傷を確認済み。**依存 I は解消**。
// 0-d. ✅ 予算アラートの閾値見直し（上限 $10 → $20 / 通知 $0.01 → $12）。
//
// ── 第1群｜下ごしらえ（本番無影響・並行可）────────────────────────
//  1. ✅ VERCEL_ENV → STAGE。本ファイルで `STAGE: $app.stage` を注入し、暫定の VERCEL_ENV 注入は撤去。
//     判定は `src/lib/stage.ts` に集約し、`src/lib/db.ts` と `sentry.server/edge.config.ts` が使う。
//     ⚠️ **soak 期間（14）は AWS と Vercel の両方が本番を担う**ため、stage.ts は
//        `STAGE ?? VERCEL_ENV` のフォールバックを持つ。**Vercel 解約（15〜16）でこの一行を消す**。
//        単純置換にすると Vercel 本番が preview テーブルを向いて本番障害になる。
//     ✅ db.ts は判定の向きを反転済み（未設定なら preview に倒すフェイルクローズ）。
//     📌 実地調査で判明した差分: sentry.edge.config.ts は VERCEL_ENV ではなく
//        **environment 自体が無かった**（ウィザード既定のまま・DSN もハードコード・
//        tracesSampleRate は全ステージ 100%）。environment のみ補い、サンプリング率は別途判断。
//        sentry.client.config.ts は Next 16 では**死にコード**（実体は src/instrumentation-client.ts）
//        だったため削除した。scripts/integration/platform-flow.test.ts の VERCEL_ENV=preview
//        ガードは stage.ts のフォールバックによりそのまま有効。
//  2. ✅ cron 4ルートの観測性。`src/lib/cronLog.ts` に集約（cronStart / cronDone / cronFail /
//     cronWarn / cronAlert）し、**console と Sentry の両方**へ出す。EventBridge 移行（8）後は
//     CloudWatch Logs が唯一の観測手段になるため、Sentry だけに寄せない。
//     `cronDone` が件数を出すので **「動いたが0件」と「動いていない」を区別できる**
//     （＝ release-reservations の件を CloudWatch だけで切り分けられる）。
//     Sentry の tags.route は既存値（`cron/...`）を維持。回帰テストは
//     src/__tests__/cron-observability.test.ts。
//  3. ✅ Vercel 専用スクリプト（@vercel/analytics・@vercel/speed-insights）を条件付きレンダーに。
//     src/lib/stage.ts の isVercelPlatform() が判定し、layout.tsx は Vercel 上でのみ描画する。
//     判定は VERCEL と VERCEL_ENV の**両方**を見る（VERCEL の注入はプロジェクト設定のトグル依存で
//     確実でなく、外すと Vercel 側の計測が静かに止まって soak の比較材料を失うため）。
//     ⚠️ 撤去は 16 のリスト⑦（⑥と同じく stage.ts に集めてある）。
//  4. ✅ Vercel Blob → S3。presigned S3 PUT（理由は 5 の 1MB 制限＝依存 B）。
//     upload-url → S3 へ直接 PUT → confirm の3段。src/lib/avatarStorage.ts と avatarAccount.ts。
//     🔴 **バケットは2つ**。presigned では PUT が先・検閲が後に逆転するため、
//        未検閲の置き場（非公開・1日で自動削除）と公開先（CloudFront OAC）を分けてある。
//        同一バケットのプレフィクス分割だと CDN が pending/ も配信してしまう。
//     🔴 **13 より前に本番で使い始める**ので、サイト本体の CloudFront には相乗りできない
//        （本番ステージがまだ無い）。アバター専用の Router を立てている。
//     ✅ dev のバケット・ライフサイクル・Router は作成済み（2026-07-29 実測: 両バケットとも
//        Public Access Block 4項目 True / 直 GET は 403 / pending/ は1日で失効 / CORS は PUT のみ）。
//     🔴 **本番のアップロードは 503 のまま据え置き（13 まで）。オーナー判断・2026-07-29。**
//        「AVATAR_* を Vercel 側にも入れる」の *同じバケット* とは **production ステージの**
//        バケットのことで、それが出来るのは 13。dev のバケットに本番を向けると
//        本番ユーザーの画像が `sst remove --stage dev` で消える。
//        → **②Vercel への env 投入と ③Vercel の IAM ユーザーへの S3 権限追加は 13 の直後に行う。**
//        本番の avatarUrl 保持者は 0 件なので、それまでの実害は「新しいアイコンを設定できない」だけ。
//
// ── 第2群｜AWS の防御と実行基盤（dev で検証）────────────────────
//  5. ✅ **Function URL の保護**。OpenNext/SST は server Lambda の Function URL をオリジンにするが
//     AuthType=NONE・Principal=* で**全公開**だった。実測で直アクセスできた（/ =200, /admin =307）。
//     このままだと 6 の WAF も 11 の apex 正規化も 9 の noindex も**全部迂回される**。
//     さらに直叩きでは CFF を通らないため **x-forwarded-host を偽装できる**。
//     → 上の Nextjs コンポーネントに `protection: 'oac-with-edge-signing'` を入れた（理由は同所）。
//     ✅ **dev で実測済み（2026-07-29）**: AuthType は server / image-optimizer とも AWS_IAM、
//        直叩きは 200 → **403**、CloudFront 経由は 200/200/307 で不変、host 依存ロジックも無傷
//        （/api/admin への POST が正しい Origin のみ通過）。
//     ⚠️ **ステージごとにデプロイして初めて閉じる。** production ステージ（13）でも同じ確認をすること。
//     ✅ host 依存ロジック（CSRF/NextAuth/passkey/checkout）は**壊れない**。ORP は元から
//        Managed-AllViewerExceptHostHeader で、CFF が x-forwarded-host に退避している（検証済み）。
//     ⚠️ 完了判定は `get-function-url-config` の **AuthType: AWS_IAM**。公開ステートメントは
//        すべて AuthType=NONE 条件付きなので、切替時点で自動的に不発になる（残骸は無害な汚れ）。
//        protection は server と image-optimizer の**両方**を iam に切り替える。
//     "oac" は POST に x-amz-content-sha256 を要求し、Stripe webhook・NextAuth・フォーム送信が
//     壊れるため**採用不可**（本プロジェクトは POST ルートが20本以上）。
//  6. ✅ **WAF 3ルールを AWS WAF で再構築**（上の `AdminWaf`）。値は推測ではなく
//     `vercel firewall rules ls --json` の live 設定から採った（rate limit 30req/60s・
//     /admin* に challenge・admin 系で geo≠JP なら deny）。
//     **CLOUDFRONT スコープ＝us-east-1 固定**。`transform.cdn` で `webAclArn` を渡す（直接の引数は無い）。
//     ⚠️ 対象パスは現行どおり /admin* と /api/admin/* に限定してある。全パスに広げると 8 の cron を自分で止める。
//     ✅ **dev で実測済み（2026-07-31）**: 公開パスは 200 のまま不変、/admin と /admin/login は
//        200/307 → **202（x-amzn-waf-action: challenge）**、/api/admin/auth は 40連打で全部 405 →
//        **T+45s 以降 403**（レート制限が発火）。`/%61dmin` `/Admin` も 202＝変換2段が効いている。
//     ⚠️ **ステージごとに1枚できる**（$8/月）。dev の検証が済んだら WAF_STAGES から 'dev' を外す。
//     ⚠️ 13 で production ステージにもデプロイして同じ確認をすること（5 と同じ理由）。
//  7. ✅ server.memory を 1024 MB → **2048 MB**（2026-07-31・dev で実測検証）。Lambda の CPU は
//     メモリ比例で 1769MB＝1vCPU 相当。旧 1024MB は約0.58vCPU＝**Vercel(1vCPU/2GB) の6割**、
//     2048MB で約1.16vCPU。実測は **コールド p50 2,041→1,068ms（−48%）/ ウォーム p50 73.8→51.3ms**。
//     🔑 **メモリ不足対策ではない**。maxMemoryUsed は前後とも **231→230MB** で RAM は余っており、
//        効いたのはコールド経路の実行時間だけ。OOM を直す作業だと誤解しないこと。
//     💰 費用は「相殺」ではなく **GB-秒で約 +10%**（月 $0.003 相当＝誤差）。詳細は pour-over-log.md。
//     📌 arm64 化は**同時にやらない**（server=x86_64 / image-optimizer=arm64 の不一致は残す）。
//        1回のデプロイで2変数動かすと、速くなった原因を切り分けられなくなる。
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
//     🔴 **5 の確認をこのステージでもやり直す**（protection はステージごと。dev で閉じても production は別）。
//     🔴 **4 の積み残し②③をここで回収する**（production のバケット名で Vercel に AVATAR_* を投入し、
//        Vercel の IAM ユーザーに S3 権限を追加）。それまで本番のアイコン設定は 503 のまま。
//     シークレットは Vercel 本番の30本と突合済み（AWSキー3本は廃止・BLOB3本は不要）。
// 14. soak 期間。**Vercel は main 自動デプロイのまま生かしておく**＝ロールバック先が常に最新に保たれる。
//     この期間、Vercel の設定には一切触らない。
//
// ── 第5群｜後始末 ────────────────────────────────────────────
// 15. Vercel 解約 ＋ 決済再開（①Stripe 新キー投入 →②PAYMENTS_ENABLED=true →③再デプロイ の順厳守）。
// 16. Vercel 依存の撤去。🔴 **vercel.json だけ消すと build が全環境で落ちる**
//     （prebuild → scripts/check-cron-schedule.mjs が vercel.json を読めず exit 1。CI にも同ステップ）。
//     ①〜⑦をまとめて消すこと: ①redirects() ②vercel.json ③check-cron-schedule.mjs + prebuild + check:cron
//     ④CI の該当ステップ ⑤src/__tests__/hostRedirects.test.ts
//     ⑥src/lib/stage.ts の `?? VERCEL_ENV`（1 で soak 中の Vercel 本番を守るために入れたもの）
//     ⑦src/lib/stage.ts の isVercelPlatform() と layout.tsx の呼び出し ＋
//       @vercel/analytics / @vercel/speed-insights の依存（3 で入れたもの）
//     📌 ⑥⑦とも stage.ts に集めてあるので、撤去の起点は `grep -rn VERCEL src/` でよい。
//        ⑥⑦は src/__tests__/stage.test.ts の該当ケースと同時に消す。
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
