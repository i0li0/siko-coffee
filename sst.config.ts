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
    // 🔴 **トップレベル import は使えない。** SST は設定を読むときに
    //    `Your sst.config.ts has top level imports - this is not allowed.` で**落ちる**。
    //    自前のモジュールは `run()` の中で**動的 import** すること。
    //    ⚠️ `npm run check:sst`（tsc）は型検査なのでこの制約を知らず、**通ってしまう**。
    //       実際に 12 でトップレベル import を書いて `check:sst` は exit 0、CI の
    //       `SST Deploy` だけが赤くなった（教訓27 と同型／教訓35）。
    // 📌 **相対パスで書くこと**（`@/` エイリアスは効かない）。SST はこの設定を esbuild で
    //    束ねるだけで、`tsconfig.json` の paths は解決されない。
    // 🔑 12 のリダイレクト本体をここに直書きせず切り出しているのは、**このファイルが
    //    CI で型検査されない唯一のファイル**であり、かつ 12 のコードは dev では一度も
    //    実行されないため（理由と検証方法は当該ファイルの冒頭）。
    const { APEX_HOST, SITE_HOST, buildApexRedirectInjection } = await import(
      './src/lib/apexRedirect'
    )

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
      // ── 意図的に入れないもの ──
      // STRIPE_* / PAYMENTS_ENABLED … 決済停止中（Phase 0 を維持）
      // BLOB_* … ✅ 4 で S3 に置き換え済み。Vercel 側の3本も 15 で捨ててよい
      // AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY … 実行ロールに置き換えるのが移行の目的
      // SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN … **ビルド時**にしか使われない
      //   （`next.config.ts`）。Lambda の env に入れても効かないので、ここではなく
      //   ビルド環境（GitHub Actions）側の話になる。未設定なら `sourcemaps.disable` が
      //   効くだけで、Vercel でも同じ状態＝移行で失うものは無い（実測済み）。
    ] as const

    const secretEnv = Object.fromEntries(
      SECRET_NAMES.map((name) => [name, new sst.Secret(name).value]),
    )

    // ── 任意のシークレット（Pour Over 13 の前提）──────────────────
    //
    // 🔴🔴 **これが無いと production は「デプロイは成功するのに機能が欠けた本番」になる。**
    // 2026-08-01 の 13 の準備で判明した:（`SECRET_NAMES` は7本しか無く、Lambda の
    // `environment` に入るのもその7本だけだった）。計画の「シークレットは Vercel 本番の
    // 30本と突合済みで過不足なし」は **値が Vercel に在ることの確認**であって、
    // **`sst.config.ts` に配線されていることの確認ではなかった**。
    //
    // 欠けたときに起きること（すべて消費側を grep して確認済み）:
    //   GOOGLE_/LINE_CLIENT_*   → `src/lib/auth.ts` の `oauthEnabled` が false
    //                             ＝ **ソーシャルログインが黙って消える**
    //   ADMIN_TOTP_SECRET       → `src/lib/adminTotp.ts` が null を返す
    //   ADMIN_TOTP_REQUIRED     → `=== 'true'` が false ＝ **admin がパスワードのみで通る**
    //                             🔴 **これだけはフェイルオープン**。他は機能が消えるだけだが、
    //                             これは**防御が消える**。soak 中の本番で起きるので最も危険。
    //   NEXT_PUBLIC_SENTRY_DSN  → `sentry.server.config.ts` の dsn が undefined
    //                             ＝ **サーバ Sentry が無効**（依存 D が成立しなくなる）
    //   NEXT_PUBLIC_GA_MEASUREMENT_ID → `src/app/layout.tsx` が GA を描画しない
    //   INSTAGRAM_ACCESS_TOKEN  → `src/lib/instagram.ts` の初期トークン（依存 E・L）
    //   WEBAUTHN_RP_ID/ORIGIN   → 未設定ならリクエスト元から導出。Vercel は明示していたので揃える
    //
    // 🔑 **`SECRET_NAMES` に足すのではなく既定値付きにするのが要点。**
    //    あの配列に載せた名前は**値が無いと `sst deploy` 自体が落ちる**ので、
    //    足すと dev にも本番用の秘密の投入を強いることになる（そして
    //    「本番と同じ値を dev に入れない」という上の方針と正面から衝突する）。
    //    既定値 `''` なら **dev は今までどおり（機能オフ）／production だけ実値**にできる。
    //    ⚠️ 消費側が**すべて falsy ガード**であることを確認済みなので `''` は安全に「無効」を意味する
    //       （`Boolean(a && b)` / `x || null` / `=== 'true'` / `{x && <C/>}`）。
    //    📌 同じ形は 10 の `SLACK_WEBHOOK_URL` で先に使っている。
    // ⚠️ **値は deploy 時に env へ焼き込まれる＝ `sst secret set` だけでは効かず再デプロイが要る。**
    // 📌 **`ADMIN_TOTP_SECRET` と `INSTAGRAM_ACCESS_TOKEN` は宣言してあるが、
    //    production には投入していない**（2026-08-01 の点検で不要と確定）。どちらも
    //    消費側が **DynamoDB（`siko-coffee-config`）を先に読み、無ければ env** という実装で、
    //    そのテーブルは **Vercel と AWS が共有する**ため soak 中の同期が自動で取れる。
    //    ここに残してあるのは「env にも置ける」という逃げ道を消さないためで、
    //    **空文字のまま＝未設定と同じ**。🔑 **「宣言されている」は「投入が要る」ではない。**
    const OPTIONAL_SECRET_NAMES = [
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'LINE_CLIENT_ID',
      'LINE_CLIENT_SECRET',
      'ADMIN_TOTP_SECRET',
      'ADMIN_TOTP_REQUIRED',
      'NEXT_PUBLIC_SENTRY_DSN',
      'NEXT_PUBLIC_GA_MEASUREMENT_ID',
      'INSTAGRAM_ACCESS_TOKEN',
      'WEBAUTHN_RP_ID',
      'WEBAUTHN_ORIGIN',
    ] as const

    const optionalSecretEnv = Object.fromEntries(
      OPTIONAL_SECRET_NAMES.map((name) => [
        name,
        new sst.Secret(name, '').value,
      ]),
    )

    // 🔴 **アプリ本体と 10 の中継 Lambda の両方が要る**ので、ここで1回だけ宣言して共有する。
    //    2026-08-01 に判明: これは 10 で中継 Lambda 用にだけ宣言されており、
    //    **web の `environment` に入っていなかった**。`src/lib/slackNotify.ts` は
    //    未設定なら `return` するだけなので、AWS 本番では **6か所の Slack 通知
    //    （ユーザー登録・パスキー登録/管理・フィードバック・配送遅延）が黙って止まる**。
    //    ＝ #125 で塞いだ「配線されていない任意シークレット」の同型がもう1本あった。
    // 📌 `OPTIONAL_SECRET_NAMES` に入れないのは、同じ名前で `new sst.Secret` が
    //    2回走るとリソースが重複するため（下の中継 Lambda もこの値を使う）。
    // ⚠️ 値は deploy 時に焼き込まれる＝ `sst secret set` だけでは効かず再デプロイが要る。
    const slackWebhookUrl = new sst.Secret('SLACK_WEBHOOK_URL', '')

    // ── 非本番ステージの遮蔽（Pour Over 9）────────────────────────
    //
    // Vercel は Deployment Protection（Vercel Authentication = Require Log In）で
    // プレビュー URL を守っていた。実測で **1.2k req/h の自動巡回がこの壁で弾かれていた**
    // ＝ 飾りではなく実際に効いている統制である。**AWS に同等の機能は無い**ので、
    // 切替でここだけは確実に劣化する。移行の前に等価物を用意する。
    //
    // 🔴 **アクセス制限に WAF を使わないこと。** web ACL は**ステージごとに1枚**で
    //    $5/月 + $1/ルール。6 の `AdminWaf` とは別に dev 用をもう1枚作ると、
    //    移行後の AWS コスト（大半が WAF）がさらに上がる。CloudFront Function は
    //    **リクエスト課金だけ**（$0.10/百万・実測 103K req/月＝月 $0.01）で、
    //    しかも 5 の Lambda@Edge より手前で完結するので Lambda の起動すら要らない。
    //
    // 🔑 **2段構えにするのは目的が別だから。**
    //    ① `X-Robots-Tag: noindex` … 検索エンジンに載らないようにする（robots.txt は
    //       `Allow: /` で、しかも `public/robots.txt` は全ステージ同じものが配られる）。
    //    ② Basic 認証 … 人間と巡回ボットの目に触れないようにする。①だけでは
    //       「インデックスされないだけで誰でも読める」ままで、Vercel の壁の代替にならない。
    //
    // ⚠️ **これは秘匿ではなく遮蔽**。資格情報は CloudFront Function のコードに
    //    平文で焼き込まれるので、`cloudfront:GetFunction` を持つ相手からは読める。
    //    比較も定数時間ではない。本物の秘密（本番の認証情報・鍵）を dev に置かない
    //    という既存の方針（SECRET_NAMES のコメント）と合わせて初めて成立する。
    //
    // 🔗 **12 との衝突に注意**: apex 正規化と HSTS も `edge.viewerRequest.injection` を使う。
    //    CloudFront Function は**1ビヘイビアに1つ**しか付かず、SST は injection を
    //    自前の関数に合成する方式なので、**注入口は1つしかない**。今は
    //    「9 は非本番だけ／12 は本番だけ」で排他なので衝突しないが、両方を要する
    //    ステージができたら**文字列を連結する**こと（関数を足そうとしないこと）。
    // 🔑 **`public/robots.txt` を書き換える案は採らない。** あれは静的配信物で、
    //    ステージごとに差し替えるとビルド成果物がステージ依存になる（同じ成果物を
    //    どのステージにも置ける、という現在の性質を失う）。ヘッダなら S3 由来の
    //    静的アセットにも Lambda 由来の HTML にも等しく乗る。
    //    📌 このディストリビューションは**ビヘイビアが default の1つだけ**なので、
    //       viewer-response 関数は**全経路**（HTML・_next/static・画像・API）に掛かる。
    const NOINDEX_INJECTION =
      "event.response.headers['x-robots-tag'] = { value: 'noindex, nofollow' };"

    // 非本番だけで要る秘密。SECRET_NAMES に混ぜると **production の 13 でも投入を
    // 強いられる**（あの配列に載せた名前は値が無いと deploy 自体が失敗する）ので分ける。
    //   sst secret set PREVIEW_BASIC_AUTH 'user:password' --stage dev
    // ⚠️ 値は下の CloudFront Function のコードに焼き込まれる。**回すには再デプロイが要る**
    //    （`sst secret set` だけでは配信中の関数は変わらない）。
    const previewEdge = isProd
      ? undefined
      : {
          // 🔴 **injection の中で `${...}` を書かないこと。** SST 側は
          //    interpolate のテンプレートリテラルに埋め込むので、こちらに
          //    テンプレートリテラルがあると先に展開されて壊れる。連結だけで書く。
          //
          // 📌 挿入位置は SST の request 関数の**先頭**（ssr-site.ts の
          //    createRequestFunction: userInjection → CloudFront URL ブロック →
          //    ルーティング本体 の順）。ここで応答を返せば KVS 参照も
          //    オリジンへの転送も 5 の Lambda@Edge も一切走らない。
          viewerRequest: {
            injection: new sst.Secret('PREVIEW_BASIC_AUTH').value.apply(
              (credentials) => {
                // deploy 時に base64 化して、実行時は**1回の文字列比較**で済ませる。
                // CloudFront Function には atob も Buffer も crypto も無いので、
                // 受け取ったヘッダを復号するのではなく期待値の方を先に作っておく。
                const expected =
                  'Basic ' + Buffer.from(credentials).toString('base64')
                // 変数名は SST 側の注入コード（routeSite など）と衝突しないよう
                // 独自の接頭辞を付ける。同じ関数スコープに同居するため。
                return [
                  'var sikoPreviewAuth = event.request.headers.authorization;',
                  'if (!sikoPreviewAuth || sikoPreviewAuth.value !== ' +
                    JSON.stringify(expected) +
                    ') {',
                  '  return {',
                  '    statusCode: 401,',
                  "    statusDescription: 'Unauthorized',",
                  '    headers: {',
                  // realm が無いとブラウザが入力欄を出さない。
                  "      'www-authenticate': { value: " +
                    JSON.stringify(
                      'Basic realm="siko-coffee (non-production)"',
                    ) +
                    ' },',
                  // 401 にも自前で付ける。**viewer-response 関数は
                  // viewer-request 関数が生成した応答には走らない**ため、
                  // 下の viewerResponse には頼れない。
                  "      'x-robots-tag': { value: 'noindex, nofollow' },",
                  "      'cache-control': { value: 'no-store' },",
                  '    },',
                  '  };',
                  '}',
                ].join('\n')
              },
            ),
          },
          viewerResponse: { injection: NOINDEX_INJECTION },
        }

    // ── 本番ドメインと apex 正規化（Pour Over 12）─────────────────
    //
    // 🔴 **証明書は SST に作らせない。** 既定では `domain.name` に対して証明書を作るが、
    //    `www.sikocoffee.com` は Vercel への CNAME で、RFC 8659 により CA は
    //    **CNAME 先の CAA** を見る。その先は amazon.com を許可していないので
    //    www 単独の証明書は自ゾーンの CAA を直しても `CAA_ERROR` になる（0-b で実証）。
    //    → 0-b で発行済みの**ワイルドカード**証明書の ARN を渡す（評価が
    //      sikocoffee.com から始まるので通る／apex も SAN に含まれる）。
    //    ⚠️ 検証レコード `_c84c530444dc328407ddf8a6cf46916b.sikocoffee.com` を消さないこと。
    const SITE_CERT_ARN =
      'arn:aws:acm:us-east-1:654512230021:certificate/01195002-424e-44b1-9425-aff38c879765'

    // 🔴🔴 **`dns: false` にしてある＝ SST に Route53 レコードを作らせない。**
    //   計画には「`dns` は有効のままでよい／`dns: false` が要るのは非対応 DNS
    //   プロバイダの場合だけ」と書いてあったが、**実装時に SST のソースを読んで誤りと判明した**。
    //   `cdn.ts` の `createDnsRecords()` は `domain.name` と `aliases` の**すべて**について
    //   `dns.createAlias()` を呼び、CloudFront への A/AAAA ALIAS を作る。つまり
    //   **`dns` を有効にしたまま production を deploy すると、その deploy 自体が DNS 切替になる**。
    //   これは 13 の手順「production デプロイ → **検証** → DNS 切替」を成立させない。
    //   しかも `allowOverwrite` は既定 false なので、実際には www に既存の CNAME・
    //   apex に既存の A があるぶん**デプロイが衝突で落ちる**公算が高い（落ちなければ
    //   予告なく本番が切り替わる）。どちらも受け入れられない。
    //
    // 🔑 **11 で TTL を 60s にした意味を保つのはこちら側。** レコードを SST の管理外に
    //   置けば、切り戻しは Route53 の UPSERT 1回＝秒で終わる。IaC 管理下に置くと
    //   ロールバックが「`domain` を外して再デプロイ」になり、CloudFront の更新待ちで
    //   数分〜十数分かかる（教訓6 の「CLI で触らない」は SST が作ったリソースの話で、
    //   最初から SST の外に置いたものには当てはまらない＝ 9.5 の OIDC ロールと同じ整理）。
    //
    // 📌 副作用: `domain` を付けると SST が `*.cloudfront.net` 宛を自動で 403 にする
    //   （CF_BLOCK_CLOUDFRONT_URL_INJECTION）。**13 の事前検証を CloudFront の URL では
    //   できない**ので、`curl --resolve www.sikocoffee.com:443:<配信IP>` の形で
    //   SNI と Host を本番ドメインにしたまま当てること。
    const prodDomain = isProd
      ? {
          name: SITE_HOST,
          aliases: [APEX_HOST],
          cert: SITE_CERT_ARN,
          dns: false as const,
        }
      : undefined

    // apex → www の 308 と HSTS。**`domain.redirects` を使ってはいけない**（SST の
    // HttpsRedirect は S3 website リダイレクト＋CloudFront で Response Headers Policy が
    // 付かない＝ HSTS が乗らず、`next.config.ts` の現行設計を壊す）。
    //
    // 🔗 **9 との関係**: CloudFront Function は1ビヘイビアに1つしか付かず、SST は
    //    injection を自前の関数へ合成する方式なので **注入口は1つしかない**。
    //    9（非本番のみ）と 12（本番のみ）は**排他**なので今は選択で足りる。
    //    🔴 両方を要するステージができたら**文字列を連結する**こと（関数を足そうとしない）。
    const prodEdge = isProd
      ? { viewerRequest: { injection: buildApexRedirectInjection() } }
      : undefined

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
      routes: {
        '/*': {
          bucket: avatarPublic,
          // 9（非本番の遮蔽）はこちらにも要る。**ただし noindex だけ**。
          // 🔴 Basic 認証は付けられない: これは別オリジンで、`<img src>` は資格情報を
          //    送らないので dev サイト上のアイコンが全部壊れる。画像を守るのは
          //    「バケットは非公開・CloudFront OAC 経由のみ・鍵は presigned」という
          //    4 の構造の側であって、ここのアクセス制限ではない。
          //
          // 🔴 **`edge` は Router の直下ではなくルートの中に書く。** `RouterArgs` にも
          //    同名の `edge` があり**型検査は通る**が、`routes` をインラインで書いた場合
          //    SST が読むのはルート側だけで、直下の `edge` は**黙って無視される**
          //    （router.ts: handleInlineRoutes は route.edge、直下の args.edge を読むのは
          //    後から `route()` で足す handleLazyRoutes の方）。実際に直下へ書いて
          //    デプロイし、CloudFront Function が1つも作られないことを実測した。
          edge: isProd
            ? undefined
            : { viewerResponse: { injection: NOINDEX_INJECTION } },
        },
      },
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

    const web = new sst.aws.Nextjs('Web', {
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

      // ── 本番ドメイン（Pour Over 12）──────────────────────────────
      // 非本番は `undefined`＝ `*.cloudfront.net` のまま（dev に本番ドメインは付けない）。
      domain: prodDomain,

      // ── エッジで返すもの（Pour Over 9 / 12）──────────────────────
      // 9（noindex ＋ Basic 認証）は**非本番のみ**、12（apex→www の 308 ＋ HSTS）は
      // **本番のみ**で、注入口は1つしかないため排他に選ぶ。
      // 本番に noindex が漏れるのが最悪の事故なので、判定はこの1か所だけに置く。
      edge: isProd ? prodEdge : previewEdge,

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

        // 任意のシークレット（未設定なら `''`＝機能オフ）。production では 13 の
        // 前に実値を入れる。詳細は上の OPTIONAL_SECRET_NAMES のコメント。
        ...optionalSecretEnv,

        // 🔴 `src/lib/slackNotify.ts` が読む。無いと6か所の Slack 通知
        // （ユーザー登録・パスキー登録/管理・フィードバック・配送遅延）が**黙って止まる**
        // （あの関数は未設定なら `return` するだけ）。10 の中継 Lambda と同じ値を共有する。
        SLACK_WEBHOOK_URL: slackWebhookUrl.value,

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

    // ── cron（Pour Over 8: Vercel Cron → EventBridge Scheduler）──────
    //
    // 経路は **Scheduler → 中継 Lambda → server の Function URL（SigV4）→ cron ルート**。
    //
    // 🔑 **なぜ中継 Lambda を挟むのか。** EventBridge は Rules の API Destinations で
    //    任意の HTTPS を叩けるが、対応する認証は API key / Basic / OAuth だけで
    //    **SigV4 に対応しない**。5 で Function URL を `AWS_IAM` にした以上、
    //    署名できる実行主体が要る。Scheduler に至っては HTTPS を直接叩けない。
    //    ＝ **中継は省略できない**（計画段階からの結論。SST 4.17.1 のソースでも再確認）。
    //
    // 🔑 **なぜ CloudFront ではなく Function URL 直なのか。** CloudFront のオリジン
    //    ReadTimeout が実測 30 秒で、WAF（6）の評価も挟まる。cron がブラウザ向けの
    //    経路に相乗りする理由がない。
    //    ⚠️ ただし **server 側の timeout も 30 秒**なので実行予算は 30 秒のまま。
    //       伸ばすなら上の `server.timeout` を上げる（CloudFront 経由の web は CF 側の
    //       30 秒で切れるので挙動は変わらない）。1回のデプロイで2変数動かさないため別作業。
    //
    // 📌 **`sst.aws.Cron` ではなく `CronV2` を使う。** 4.17.1 で `Cron` は **deprecated**
    //    （実体は EventBridge **Rules**）。`CronV2` は **EventBridge Scheduler** で、
    //    `timezone` と `retries` を持つ。計画文書の「Scheduler ではなく Rules」は
    //    `Cron` についての記述で、非推奨でない方は Scheduler が正しい。
    const cronRelay = new sst.aws.Function('CronRelay', {
      handler: 'src/functions/cronRelay.handler',
      // 実体は HTTP を1本投げて待つだけ。CPU ではなく server 側の処理待ちが支配的。
      memory: '256 MB',
      // server の 30 秒より長くしておく。ここが先に切れると「アプリが遅い」のか
      // 「中継が諦めた」のかを切り分けられない（ハンドラ側は 35 秒で abort する）。
      timeout: '40 seconds',
      environment: {
        // Function URL は SST が払い出す。**手で控えて貼らない**（デプロイのたびに変わりうる）。
        CRON_TARGET_URL: web.nodes.server!.apply((fn) => fn.url),
        // 認可の2重化。①IAM（このロールでしか Function URL を叩けない）②CRON_SECRET。
        // ⚠️ `Authorization` は SigV4 が占有するので、中継は `x-cron-secret` で送る。
        CRON_SECRET: secretEnv.CRON_SECRET,
      },
      // 🔑 同一アカウントなので**アイデンティティ側だけで足りる**
      //    （Function URL のリソースポリシーに足す必要はない）。
      permissions: [
        {
          actions: ['lambda:InvokeFunctionUrl'],
          resources: [web.nodes.server!.apply((fn) => fn.arn)],
        },
      ],
    })

    // 🔴 **実際に発火させるステージ。** 13（production デプロイ）の時点では
    //    **Vercel の cron がまだ生きている**（soak 中は Vercel を触らない方針）。
    //    両方が同時に回ると `instagram-refresh` が競合する（同じ長期トークンを
    //    2か所から更新し、後勝ちで無効な方が残りうる）。
    //    → **13 で DNS を切り替えたあとに 'production' を足す**。それまで production の
    //      スケジュールは作られるが DISABLED で、`aws scheduler list-schedules` に見える。
    //    WAF_STAGES と同じ運用（1か所の配列で切り替える）に揃えてある。
    const CRON_STAGES = ['dev']

    // 📌 スケジュールは **EventBridge Scheduler の書式**（cron は6フィールドで、
    //    day-of-month と day-of-week のどちらかを `?` にする）。時刻は UTC のまま
    //    `vercel.json` と揃えてあるので、移行の前後で発火時刻は変わらない。
    const CRON_JOBS = [
      {
        name: 'CronInstagramRefresh',
        path: '/api/cron/instagram-refresh',
        // 🔴 **月次から週次へ上げた（依存 E・L）。** 長期トークンは 60 日で失効し、
        //    切れると手動の再認証が要る。月次だと 60 日の窓に**更新機会が2回**しかなく、
        //    1回失敗しただけで残り1回に追い込まれる（実際 2026-07 はその状態になった）。
        //    週次なら8回。Hobby の日次制限が外れたのでコストなしで取れる余裕。
        //    📌 Instagram 側は「24時間以上経過したトークン」しか更新できないので、
        //       これ以上詰めても意味はない。日曜 00:00 UTC ＝ 月曜 09:00 JST。
        schedule: 'cron(0 0 ? * SUN *)',
        // dev では動かない（CRON_SECRET 以外に INSTAGRAM_ACCESS_TOKEN が要り、
        // 設定値は本番テーブル `siko-coffee-config` にしかない）。動かすと毎回
        // `no Instagram token found` で Sentry が鳴るだけなので production 限定。
        prodOnly: true,
      },
      {
        name: 'CronCleanupPending',
        path: '/api/cron/cleanup-pending',
        schedule: 'cron(0 18 * * ? *)',
      },
      {
        name: 'CronReleaseReservations',
        path: '/api/cron/release-reservations',
        // 🔑 **これが 8 の本命。** Vercel Hobby は日次までなので `10 18 * * *` に
        //    落としていた（しかも実測では**登録済みなのに実行されていなかった**）。
        //    在庫確保の失効戻しは本来もっと短い周期で回るべきもの。
        schedule: 'rate(10 minutes)',
      },
      {
        name: 'CronPoTimeouts',
        path: '/api/cron/po-timeouts',
        schedule: 'cron(20 18 * * ? *)',
      },
    ] as const

    for (const job of CRON_JOBS) {
      new sst.aws.CronV2(job.name, {
        // Function インスタンスを渡すと**再利用**される（新しい関数は作られない）。
        // 4本のスケジュールが1つの中継関数を共有し、パスは event で渡す。
        function: cronRelay,
        event: { path: job.path },
        schedule: job.schedule,
        enabled: CRON_STAGES.includes($app.stage) && (isProd || !('prodOnly' in job)),
        // 一時的な失敗（server のコールド + 遅延で 35 秒超過など）で
        // 日次ジョブが丸1日落ちるのを避ける。Scheduler 側の再試行。
        retries: 2,
      })
    }

    // ── 監視（Pour Over 10: CloudWatch Alarms）────────────────────────
    //
    // 経路は **CloudWatch Alarm → SNS → 中継 Lambda → Slack Incoming Webhook**。
    //
    // 🔑 **なぜメール購読ではないのか。** SNS のメール購読は**購読確認リンクの
    //    クリックが要る**＝ IaC で完結せず、ステージを作り直すたびに手作業が復活する
    //    （教訓6 の「コンソールで触ったものは次の deploy で巻き戻る」と同じ穴）。
    //    Lambda 経由なら全部このファイルの中で閉じ、通知先も既にフィードバック通知が
    //    流れている Slack に揃う。
    //
    // 🔴 **Vercel には無かった機構＝移行で明確に良くなる項目。** 逆に言うと、
    //    ここを作らずに 13（切替）へ進むと **Vercel の Observability を失ったまま
    //    代替が無い**状態で本番が AWS に載る。11・12 より前に置く理由がこれ。
    //
    // 🔴 **リージョンが2つ要る。** CloudWatch アラームのアクション（SNS）は
    //    **アラームと同じリージョン**になければならず、**CloudFront のメトリクスは
    //    us-east-1 にしか出ない**。→ トピックを2本立て、中継 Lambda 1本に集約する。
    //    SNS → Lambda のクロスリージョン配信は既定有効リージョン間では公式にサポート
    //    されている（us-east-1 と ap-northeast-1 はいずれも既定有効）。
    //    ⚠️ **購読リソースはトピック側のリージョンで作る**必要があるので、
    //       us-east-1 の TopicSubscription には provider を渡している。
    //
    // 📌 **`WafUsEast1` を使い回さず新しい provider を足しているのは意図的。**
    //    provider の論理名を変えると、それを使っている既存リソース（web ACL）が
    //    置き換え対象になりうる。web ACL は CloudFront に関連付いていて削除に
    //    時間がかかるため、触らない。provider 自体は AWS 上のリソースではないので
    //    2つあっても費用も副作用も無い。
    // 📌 **中継のログを読むときの注意（実際に踏んだ）。** SST はロググループを
    //    関数とは**別のランダム接尾辞**で作り、`LoggingConfig.LogGroup` で結び付ける。
    //    つまり `/aws/lambda/<関数名>` は**存在しない**（`ResourceNotFoundException` になる）。
    //    正しい経路はこれ:
    //      aws lambda get-function-configuration --function-name <fn> --query LoggingConfig
    //    「ログが無い＝呼ばれていない」と誤診しやすいので、まず宛先を確認すること。
    const usEast1 = new aws.Provider('AlarmsUsEast1', { region: 'us-east-1' })

    // 🔑 **SECRET_NAMES には入れない。** あの配列に載せた名前は**値が無いと
    //    `sst deploy` 自体が落ちる**ので、混ぜると 13（production）でも投入を強いられる。
    //    9 の PREVIEW_BASIC_AUTH と同じ扱いだが、あちらは非本番だけで生成されるのに対し
    //    こちらは全ステージで要るため、**placeholder（空文字）付きで宣言**して
    //    「未設定でもデプロイは通る／鳴ったときに名指しで失敗する」形にする。
    //      sst secret set SLACK_WEBHOOK_URL '<incoming webhook url>' --stage <stage>
    //    🔴 **値は deploy 時に環境変数へ焼き込まれる＝ `sst secret set` だけでは効かず、
    //       再デプロイが要る**（9 の PREVIEW_BASIC_AUTH と同じ性質）。SST のリンク機能で
    //       実行時に解決させれば再デプロイは不要になるが、それには Lambda に SST の SDK が
    //       要り、この関数の「node 組み込み以外に依存しない」方針を崩すので採らない。
    //    ⚠️ 未設定のままだと alarmRelay が例外で終わる（＝ Errors に出る）。
    //       黙って捨てないのは意図的で、理由は src/functions/alarmRelay.ts の冒頭。
    //       ✅ dev で実測: 未設定のまま5回発火し、**毎回ペイロード全文を CloudWatch に
    //          残したうえで例外**になった（＝ Slack に出ないだけで内容は失われない）。
    // 🔴 宣言は上の「任意のシークレット」ブロックへ移した。**アプリ本体も同じ値を要る**
    //    ため（`src/lib/slackNotify.ts`）、ここで初めて宣言すると web の environment に
    //    間に合わない。同じ名前で2回 `new sst.Secret` するとリソースが重複する。

    const alarmRelay = new sst.aws.Function('AlarmRelay', {
      handler: 'src/functions/alarmRelay.handler',
      // Slack へ HTTP を1本投げるだけ。CPU も RAM も要らない。
      memory: '128 MB',
      // 自前で最大3回（指数バックオフ）試すので、その合計より余裕を持たせる。
      timeout: '30 seconds',
      environment: {
        SLACK_WEBHOOK_URL: slackWebhookUrl.value,
        // dev と production のアラートを見分けるため。これが無いと
        // soak 期間に「どっちのアラートか分からない」通知が並ぶ。
        STAGE: $app.stage,
      },
    })

    // メインリージョン（Lambda・SES）用のトピック。
    const alarmTopic = new aws.sns.Topic('AlarmTopic', {
      name: `siko-${$app.stage}-alarms`,
    })

    // CloudFront 用。**メトリクスが us-east-1 にしか無い**ため別立て。
    const alarmTopicGlobal = new aws.sns.Topic(
      'AlarmTopicGlobal',
      { name: `siko-${$app.stage}-alarms-global` },
      { provider: usEast1 },
    )

    for (const [label, topic, provider] of [
      ['Main', alarmTopic, undefined],
      ['Global', alarmTopicGlobal, usEast1],
    ] as const) {
      // SNS がこの関数を呼べるようにする。**関数側のリソースポリシー**なので
      // 作るのは関数のリージョン（ap-northeast-1）＝ provider は渡さない。
      new aws.lambda.Permission(`AlarmRelayInvokeFrom${label}`, {
        action: 'lambda:InvokeFunction',
        function: alarmRelay.arn,
        principal: 'sns.amazonaws.com',
        sourceArn: topic.arn,
      })

      // 購読は**トピックのリージョン**で作る（クロスリージョン配信の要件）。
      new aws.sns.TopicSubscription(
        `AlarmTopic${label}ToRelay`,
        {
          topic: topic.arn,
          protocol: 'lambda',
          endpoint: alarmRelay.arn,
        },
        provider ? { provider } : undefined,
      )
    }

    // 既定値。**`notBreaching` が要点**で、これが無いとトラフィックの無い dev で
    // 「データが来ない」だけで INSUFFICIENT_DATA が鳴り続ける。
    // 📌 `okActions` も付けてある。復旧を知らせないと「鳴りっぱなしなのか直ったのか」が
    //    Slack だけでは分からず、結局コンソールを見に行くことになる。
    const alarmBase = {
      evaluationPeriods: 1,
      treatMissingData: 'notBreaching',
      actionsEnabled: true,
    } as const

    // 引数の型から既定値のキーを除いてあるので、**既定値を上書きしたい場合は
    // alarmBase 側を直す**（呼び出し側で個別に書けないのは意図的な制約）。
    const makeAlarm = (
      logicalName: string,
      args: Omit<aws.cloudwatch.MetricAlarmArgs, keyof typeof alarmBase>,
      opts?: { provider?: aws.Provider },
    ) =>
      new aws.cloudwatch.MetricAlarm(
        logicalName,
        { ...alarmBase, ...args },
        opts?.provider ? { provider: opts.provider } : undefined,
      )

    const mainActions = [alarmTopic.arn]

    // ① 🔴 **中継 Lambda（8 の申し送り）。** cronRelay は `@sentry/nextjs` を
    //    引き込まない方針なので **失敗しても Sentry に出ない**。ここが唯一の検知手段。
    //    cron の実行そのものが落ちている状態は、これが無いと誰も気づけない。
    makeAlarm('CronRelayErrorsAlarm', {
      name: `siko-${$app.stage}-cron-relay-errors`,
      alarmDescription:
        'cron の中継 Lambda が失敗した。cron ルートが呼ばれていない可能性がある（Sentry には出ない）',
      namespace: 'AWS/Lambda',
      metricName: 'Errors',
      dimensions: { FunctionName: cronRelay.nodes.function.name },
      statistic: 'Sum',
      period: 300,
      threshold: 1,
      comparisonOperator: 'GreaterThanOrEqualToThreshold',
      alarmActions: mainActions,
      okActions: mainActions,
    })

    // ② server Lambda のクラッシュ・タイムアウト。
    //    📌 Next.js が握って 500 を返した分はここに出ない（Lambda としては成功）。
    //       それは Sentry の担当。ここで拾うのは**未捕捉の異常終了**で、
    //       月 5.5K invocations の規模なら 1 件でも十分な信号になる。
    makeAlarm('WebServerErrorsAlarm', {
      name: `siko-${$app.stage}-web-server-errors`,
      alarmDescription:
        'サイト本体の Lambda が異常終了した（未捕捉例外・タイムアウト・OOM）',
      namespace: 'AWS/Lambda',
      metricName: 'Errors',
      dimensions: { FunctionName: web.nodes.server!.apply((fn) => fn.name) },
      statistic: 'Sum',
      period: 300,
      threshold: 1,
      comparisonOperator: 'GreaterThanOrEqualToThreshold',
      alarmActions: mainActions,
      okActions: mainActions,
    })

    // ③ 同時実行の頭打ち。アカウントの同時実行上限に当たると**リクエストが捨てられる**。
    //    Errors には出ないので別建てが要る。
    makeAlarm('WebServerThrottlesAlarm', {
      name: `siko-${$app.stage}-web-server-throttles`,
      alarmDescription:
        'サイト本体の Lambda がスロットルされた（同時実行の上限。リクエストは失われる）',
      namespace: 'AWS/Lambda',
      metricName: 'Throttles',
      dimensions: { FunctionName: web.nodes.server!.apply((fn) => fn.name) },
      statistic: 'Sum',
      period: 300,
      threshold: 1,
      comparisonOperator: 'GreaterThanOrEqualToThreshold',
      alarmActions: mainActions,
      okActions: mainActions,
    })

    // ④ 中継 Lambda 自身。⚠️ **これが鳴っても通知はこの関数を通る**ので、
    //    恒久的な故障では届かない（詳細は alarmRelay.ts 冒頭の「既知の死角」）。
    //    一過性の失敗なら次の呼び出しで復旧して遅れて届くため、無意味ではない。
    makeAlarm('AlarmRelayErrorsAlarm', {
      name: `siko-${$app.stage}-alarm-relay-errors`,
      alarmDescription:
        'アラート中継 Lambda が失敗した。Slack に届いていないアラートがある可能性がある',
      namespace: 'AWS/Lambda',
      metricName: 'Errors',
      dimensions: { FunctionName: alarmRelay.nodes.function.name },
      statistic: 'Sum',
      period: 300,
      threshold: 1,
      comparisonOperator: 'GreaterThanOrEqualToThreshold',
      alarmActions: mainActions,
      okActions: mainActions,
    })

    // ⑤ CloudFront の 5xx 率。**us-east-1**。
    //    🔑 image-optimizer の Lambda は SST が nodes に公開しておらず個別に
    //       アラームを張れないが、その失敗は CloudFront では 5xx として現れる
    //       ＝ この1本が実質的にオリジン全体の受け皿になる。
    //    📌 `Region: 'Global'` のディメンションは CloudFront のメトリクスでは必須。
    makeAlarm(
      'CloudFront5xxAlarm',
      {
        name: `siko-${$app.stage}-cloudfront-5xx`,
        alarmDescription:
          'CloudFront の 5xx 率が高い（オリジン障害・image-optimizer の失敗・Lambda@Edge の異常）',
        namespace: 'AWS/CloudFront',
        metricName: '5xxErrorRate',
        dimensions: {
          DistributionId: web.nodes.cdn!.nodes.distribution.id,
          Region: 'Global',
        },
        statistic: 'Average',
        period: 300,
        // 単発の 5xx で鳴らさない。率（%）なので 5 = 5%。
        threshold: 5,
        comparisonOperator: 'GreaterThanThreshold',
        alarmActions: [alarmTopicGlobal.arn],
        okActions: [alarmTopicGlobal.arn],
      },
      { provider: usEast1 },
    )

    // ⑥⑦ SES の評判（B-11）。**バウンス・苦情が誰にも届いていない**状態の受け皿。
    //
    // 🔴 **production ステージでだけ作る。** `Reputation.*` は**アカウント全体**の
    //    メトリクスで、ステージごとの値ではない。dev にも作ると soak 期間に
    //    同じ事象で2回鳴り、しかも dev が本番の送信評判について鳴ることになる。
    // 📌 配信停止のしきい値は AWS 側でバウンス 10% / 苦情 0.5%。**その手前で**気づける
    //    値にしてある。設定セット無しでアカウント単位に自動発行されるメトリクスなので、
    //    アプリ側の送信コードには一切手を入れていない。
    // ⚠️ 個々のバウンスを掴んで宛先を止める仕組み（設定セット + イベント宛先）は
    //    **これとは別**。率が上がってからでは遅い運用になるが、送信量が桁で増えるまでは
    //    アカウント停止を避ける方が実利がある。必要になったら別タスクで足す。
    if (isProd) {
      makeAlarm('SesBounceRateAlarm', {
        name: `siko-${$app.stage}-ses-bounce-rate`,
        alarmDescription:
          'SES のバウンス率が上昇（10% で送信停止。宛先の質かメール内容を確認する）',
        namespace: 'AWS/SES',
        metricName: 'Reputation.BounceRate',
        statistic: 'Average',
        period: 900,
        threshold: 0.05,
        comparisonOperator: 'GreaterThanThreshold',
        alarmActions: mainActions,
        okActions: mainActions,
      })

      makeAlarm('SesComplaintRateAlarm', {
        name: `siko-${$app.stage}-ses-complaint-rate`,
        alarmDescription:
          'SES の苦情率が上昇（0.5% で送信停止。受信者がスパム報告している）',
        namespace: 'AWS/SES',
        metricName: 'Reputation.ComplaintRate',
        statistic: 'Average',
        period: 900,
        threshold: 0.001,
        comparisonOperator: 'GreaterThanThreshold',
        alarmActions: mainActions,
        okActions: mainActions,
      })
    }
  },
})

// ─────────────────────────────────────────────────────────────
// 本番切替までの作業順（プロジェクト「Pour Over」・2026-07-28 再監査・**全21項目**）
// 📌 2026-07-31 訂正: 長らく「全20項目」と書いていたが、実数は 21（第0群 4 ＋ 本編 17）。
//    20 は 9.5 を足す前の数で、合計だけが取り残されていた。**番号は動かしていない。**
// 進捗（2026-08-01）: **15 / 21**。第0群 4/4・第1群 4/4・第2群 5/5・**9.5 完了・10 完了**。
//    次は 11（DNS TTL を 60s へ・**13 の24時間以上前**に打つ必要がある）。
// 🔴 **9.5 以降、main への push は必ず AWS へデプロイする。＝ マージ順が実害を持つ。**
//    壊れた状態を直す PR より先に無関係な PR をマージすると、無関係な変更が原因に見える赤が出る。
//    📌 PR の CI が緑でもデプロイ可否は保証されない（deploy は push 限定で PR ではスキップ）。
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
//  8. ✅ cron 4本 → **`sst.aws.CronV2`（EventBridge Scheduler）＋ 中継 Lambda**（上の `CronRelay`）。
//     📌 **`sst.aws.Cron` は 4.17.1 で deprecated**（実体は EventBridge Rules）。非推奨でない
//        `CronV2` は **Scheduler** で timezone / retries を持つ。旧記述「Scheduler ではない」は
//        `Cron` についての話で、採用したのは `CronV2`。
//     ⚠️ どちらにせよ **中継 Lambda は必須**。Rules の API Destinations は **SigV4 非対応**、
//        Scheduler はそもそも任意の HTTPS を叩けない。5 で Function URL を IAM 認証にした以上、
//        署名できる実行主体が要る。同一アカウントなので中継側の**アイデンティティポリシーに
//        lambda:InvokeFunctionUrl** を与えれば足りた（対象は `web.nodes.server` の url / arn）。
//     ⚠️ 中継先は CloudFront ではなく **Function URL を直接**（CloudFront のオリジン ReadTimeout は
//        実測30秒しかなく、WAF の評価も挟まる）。ただし **server 側の timeout も 30 秒**なので
//        実行予算は 30 秒のまま＝ここを伸ばすなら `server.timeout` を上げる（別作業）。
//     🔴 **`Authorization` は SigV4 が占有する**ので CRON_SECRET は **`x-cron-secret`** で送る。
//        判定は `src/lib/cronAuth.ts` に集約し、soak 中は Vercel の `Authorization: Bearer` も
//        受け続ける（撤去は 16 の⑧）。この秘密ヘッダは**署名対象に含めてある**。
//     🔑 `release-reservations` は日次 → **rate(10 minutes)**、`instagram-refresh` は月次 → **週次**
//        （依存 E・L の更新機会が 60日で2回 → 8回になる）。
//     📌 そもそも Vercel では release-reservations が**登録済みなのに実行されていなかった**（2026-07-28 実測）。
//     🔴 **production のスケジュールは DISABLED で作られる。** `CRON_STAGES` に 'production' を
//        足すのは **13 で DNS を切り替えたあと**（先に有効化すると Vercel の cron と二重に走り、
//        instagram-refresh が同じ長期トークンを競合して更新する）。
//  9. ✅ 非本番ステージに X-Robots-Tag: noindex ＋ Basic 認証（上の `previewEdge` / `NOINDEX_INJECTION`）。
//     Vercel は Deployment Protection で dev URL を守っていたが **AWS に同等機能は無い**。
//     🔴 **アクセス制限に WAF を使っていない**（web ACL はステージごとに $5/月）。CloudFront Function は
//        リクエスト課金だけで、5 の Lambda@Edge より手前で完結する。
//     ✅ **dev で実測済み（2026-07-31）**: 公開パスは 200 → **401**（`www-authenticate` ＋
//        `x-robots-tag` ＋ `cache-control: no-store`／`x-cache: FunctionGeneratedResponse`＝
//        エッジで完結しオリジンに届いていない）、資格情報ありで 200 ＋ `x-robots-tag`、誤り 401。
//        回帰も確認: 5 は AuthType 維持・直叩き 403／6 は公開パス 40連打で全部 200／
//        8 は中継 Lambda 手動実行で 200（cron は CloudFront を通らない）／next/image も 31,590→216B。
//     🔴 **WAF は CloudFront Function より先に評価される**＝ `/admin*` は資格情報の有無に関わらず
//        202（challenge）のまま。防御が重なる順序は WAF → viewer-request CFF → キャッシュ → オリジン。
//     📌 **12 で `domain` を付けると SST が `*.cloudfront.net` 宛を自動で 403 にする**
//        （CF_BLOCK_CLOUDFRONT_URL_INJECTION）。この作業を production へ広げる必要は無い。
//
// ── 第3群｜切替準備 ──────────────────────────────────────────
// 9.5 ✅ GitHub Actions ＋ OIDC ロールで `sst deploy` を自動化する（**完了・実測検証済み**）。
//     無いと 14 の soak 中に main へ push するたび **Vercel だけが更新され AWS が取り残される**。
//     実体は `.github/workflows/ci.yml` の `deploy` ジョブ（`needs: [lint-typecheck, e2e]`）と
//     `scripts/bootstrap-github-oidc.sh`（ロール作成・**SST の管理外**・1度だけ実行）。
//     🔴 **デプロイ先ステージは ci.yml の `strategy.matrix.stage` の1か所で決める。**
//        今は `[dev]` のみ。`WAF_STAGES` / `CRON_STAGES` と同様、**'production' を足すのは
//        13 で DNS を切り替えた後**（先に足すと本番ステージが CI から先に出来てしまう）。
// 10. ✅ CloudWatch Alarms（切替後ではなく切替前。観測できない状態で切り替えない）。
//     実体は上の「監視（Pour Over 10）」ブロックと `src/functions/alarmRelay.ts`。
//     経路は **Alarm → SNS → 中継 Lambda → Slack**（メール購読は購読確認のクリックが要り
//     IaC で完結しないので採らない）。
//     🔴 **トピックは2本**。CloudWatch のアクションはアラームと同じリージョンにある必要があり、
//        **CloudFront のメトリクスは us-east-1 にしか出ない**ため。中継 Lambda は1本に集約し、
//        us-east-1 → ap-northeast-1 のクロスリージョン配信で受ける（既定有効リージョン間は公式サポート）。
//     🔴 **SES の Reputation.* はアカウント全体のメトリクス**なので production でだけ作る
//        （dev にも作ると soak 中に同じ事象で2回鳴り、dev が本番の送信評判で鳴る）。
//     ⚠️ `SLACK_WEBHOOK_URL` は **SECRET_NAMES に入れない**（未設定で deploy が落ちるのを避け、
//        placeholder 付きで宣言）。未設定のまま鳴ると中継が例外で終わる＝ Errors に出る。
// 11. ✅ Route53 の TTL を 60s へ（**完了 2026-08-01**）。apex A 300→60 / www CNAME 500→60。
//     依存 F は解消＝ **13 は 2026-08-02 17:50 UTC 以降ならいつでも打てる**。
// 12. ✅ `domain` を設定（name: www.sikocoffee.com / aliases に apex）＋ apex→www の 308 と HSTS を
//     `edge.viewerRequest.injection` で出す（**実装済み。実測は 13 で行う**）。
//     実体は上の「本番ドメインと apex 正規化」ブロックと `src/lib/apexRedirect.ts`、
//     回帰テストは `src/__tests__/apexRedirect.test.ts`（13ケース・生成コードを実際に評価する）。
//     🔴🔴 **`dns: false` にしてある。** 計画の「`dns` は有効のままでよい」は**誤りだった**
//        （SST のソースで確認）。`cdn.ts` の `createDnsRecords()` は name と aliases の
//        すべてに CloudFront への A/AAAA ALIAS を作るので、**有効のままだと production の
//        deploy 自体が DNS 切替になり、13 の「デプロイ → 検証 → 切替」が成立しない**。
//        しかも `allowOverwrite` 既定 false ＋ 既存レコードありなので**衝突で落ちる**公算が高い。
//        → レコードは SST の管理外に置き、切替も切り戻しも Route53 の UPSERT で行う
//          （11 で TTL を 60s にした意味はこの構成でだけ生きる）。
//     📌 `domain` を付けると SST が `*.cloudfront.net` 宛を自動で 403 にするため、
//        **13 の事前検証は `curl --resolve www.sikocoffee.com:443:<配信IP>` で行う**。
//     ⚠️ **`domain.redirects` を使ってはいけない**。SST の HttpsRedirect は S3 website リダイレクトで
//        **HSTS ヘッダが付かず**、現行設計（リダイレクト応答にも完全な HSTS を乗せる）を壊す。
//     ⚠️ CloudFront Function は**1ビヘイビアに1つ**しか付かない。SST 生成の関数に injection が
//        合成される仕組みなので、独立した関数を足そうとしないこと。
//        9（非本番のみ）と 12（本番のみ）は排他なので今は選択で足りる。
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
//     🔴 **DNS 切替は手作業**（12 で `dns: false` にしたため）。Route53 の apex A と www CNAME を
//        CloudFront への ALIAS へ UPSERT する。**切り戻しは同じ操作で Vercel へ戻すだけ**。
//     🔴 **事前検証は CloudFront の URL ではできない**（`domain` を付けると 403 になる）。
//        `curl --resolve www.sikocoffee.com:443:<配信IP> https://www.sikocoffee.com/...` の形で
//        SNI と Host を本番ドメインにしたまま当てる。**12 の apex 308 と HSTS はここで初めて実測できる**。
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
//  E. 8 → 15     : Instagram の長期トークンは cron で延長。60日止まると恒久失効し手動再認証が要る
//                  ✅ 8 で月次 → 週次にしたので、60日の窓の更新機会は 2回 → 8回
//  F. 11 → 13    : 24時間以上前でないと旧 TTL が失効せず引き下げが効かない
//  G. 12 → 16    : 先に redirects() を消すと apex が無正規化になる
//  H. 0-b(CAA修正) → 12 : Amazon CA が CAA で許可されていないと ACM が発行できない
//  I. ✅ 解消済（0-c で Amplify を削除した）
//  J. 0-a → 以降の全デプロイ : npm 10 だと next/image が無言で壊れたままデプロイが成功する
//  K. 9.5 → 14  : 無いと soak 中に AWS だけが古くなる
//  L. Instagram トークン更新確認 → 15 : ✅ **2026-08-01 の更新に成功**（実測 refreshedAt が
//     2026-07-01T00:51:23Z → **2026-08-01T00:21:11.206Z**）＝ **失効は 2026-09-30 へ後退**。
//     次の機会は 2026-09-01 00:00 UTC。🔴 AWS の週次スケジュールは 13 まで DISABLED なので、
//     **13 が 9/1 を跨ぐならその時点でも頼れるのは Vercel の月次 `0 0 1 * *` 1本**。
//     成否は siko-coffee-config の refreshedAt で判定できる。
// ─────────────────────────────────────────────────────────────
