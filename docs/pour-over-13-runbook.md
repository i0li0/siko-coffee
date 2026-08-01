# Pour Over 13 実行手順書（production デプロイ → 検証 → DNS 切替）

**この文書は当日そのまま上から実行するためのもの。** 背景と根拠は
`docs/aws-migration-feasibility.md`（計画）と `docs/pour-over-log.md`（実施ログと教訓）にある。
ここには**やること・確認すること・戻し方**だけを置く。

> 🔴 **13 は「デプロイ → 検証 → DNS 切替」の3段で、切替が最後にあることが安全性の源**である。
> 検証で問題が出たら切り替えなければよい。この順序を崩さないこと。
> （12 で `dns: false` にしてあるのはこのため。SST に DNS を触らせると1段目が3段目を兼ねてしまう。）

---

## 0. 実行可能条件

### 🕒 どこが時刻で縛られているか（**文書全体ではない**）

| 節 | 時刻の縛り | いつやるか |
|---|---|---|
| **1. シークレット投入** | **無し** | **今すぐやってよい**。むしろ前日までに済ませる |
| **2. production デプロイ** | **無し**（12 の `dns: false` により DNS を触らない） | 下記の判断による |
| **3. 切替前の検証** | **無し**（`--resolve` で当てるので実 DNS を使わない） | 同上 |
| **4. DNS 切替** | 🔴 **依存 F＝ 2026-08-02 17:50 UTC 以降** | ここだけが本当の門 |
| 5. 切替後の後始末 | 4 の後 | — |

🔑 **依存 F が守っているのは「切替の瞬間に旧 TTL が失効していること」**であって、
production ステージの存在ではない。2・3 は DNS に一切触らないので、原理的には先に打てる。

**2・3 を先に打つかどうかの判断材料**:

- ✅ **先に打つ利点**: デプロイ時にしか出ない失敗（#124 のトップレベル import がその類）を
  切替の窓の外で潰せる。当日の作業が「検証 → UPSERT」だけになり短く予測可能になる。
- 🔴 **先に打つ代償**: `WAF_STAGES` に `production` があるので **web ACL がもう1枚できて +$8/月**。
  dev と並ぶと月$16 で**予算通知（$12）を超える**。先に打つなら**同時に `WAF_STAGES` から
  `'dev'` を外す**（6 の検証は完了済みなので外してよい＝5-5 を前倒しする形）。
- ⚠️ production は `protect: true` / `removal: 'retain'`。作った後は消しにくい。
  また 5（`oac-with-edge-signing`）の Lambda@Edge は外すのに5〜10分かかる。

📌 **迷うなら計画どおり 2〜4 を1回のセッションでやる**のが安全側。上の前倒しは
「当日の窓を短くしたい」ときの選択肢であって、必須ではない。

### 前提条件

| # | 条件 | 状態 |
|---|---|---|
| 0-1 | **11（TTL 60s）から24時間以上**（※ **4 の直前にだけ効く**） | ✅ 11 は **2026-08-01 17:50 UTC** に実施 → **2026-08-02 17:50 UTC（8/3 02:50 JST）以降** |
| 0-2 | ワイルドカード証明書が `ISSUED` | ✅ `01195002-…` / Issuer: Amazon / 2027-02-11 まで / `InUseBy` は空 |
| 0-3 | 本番 DynamoDB テーブルが存在 | ✅ `siko-coffee-*` が16本 |
| 0-4 | **production の secret が投入済み** | 🔴 **未（0本）**。下の 1 を先にやること。**🔴 これはオーナー本人が対話的なターミナルでやる**（エージェント経由だと Vercel CLI が値を復号せずプレースホルダを返す＝1-3） |
| 0-5 | main が緑でデプロイも通っている | 実行直前に `gh run list --branch main --limit 1` で確認 |

🔴 **0-4 が最大の落とし穴。** `sst deploy --stage production` は `SECRET_NAMES` の
**7本が1本でも欠けると落ちる**。2026-08-01 時点で production の secret は **0本**だった。

---

## 1. production のシークレット投入（**時刻の縛り無し＝今すぐやってよい**）

### 1-1. 何を入れるか

**必須7本**（`SECRET_NAMES`・欠けると deploy が落ちる）:

```
AUTH_SECRET  ORDER_TOKEN_SECRET  CRON_SECRET  REVALIDATE_SECRET
MAIL_FROM    ADMIN_PASSWORD_HASH  ADMIN_SESSION_SECRET
```

**任意11本**（`OPTIONAL_SECRET_NAMES`・未設定でも deploy は通るが**機能が欠けた本番**になる）:

```
GOOGLE_CLIENT_ID  GOOGLE_CLIENT_SECRET  LINE_CLIENT_ID  LINE_CLIENT_SECRET
ADMIN_TOTP_SECRET  ADMIN_TOTP_REQUIRED
NEXT_PUBLIC_SENTRY_DSN  NEXT_PUBLIC_GA_MEASUREMENT_ID
INSTAGRAM_ACCESS_TOKEN  WEBAUTHN_RP_ID  WEBAUTHN_ORIGIN
```

🔴 **`ADMIN_TOTP_REQUIRED` を落とすと admin がパスワードのみで通る。**
他の任意項目は「機能が消える」だけだが、これは**防御が消える**（フェイルオープン）。

**入れないもの**: `STRIPE_*` / `PAYMENTS_ENABLED`（Phase 0 維持）、`BLOB_*`（4 で不要）、
**`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`（実行ロールに置き換えるのが移行の目的＝
入れたら移行最大の改善を自分で捨てることになる）**、`SENTRY_ORG` / `SENTRY_PROJECT` /
`SENTRY_AUTH_TOKEN`（**ビルド時にしか使われない**ので Lambda の env に入れても効かない）。

### 1-2. 🔴🔴 **Vercel からは値を取り出せない**（2026-08-01 実測・当初の想定は誤り）

当初この手順書には「値は Vercel からコピーする。作り直さない」と書いてあった。**実行できない。**

`vercel env pull` が書くのはリテラル **`[SENSITIVE]`** で、実測では対象18本の
**相異なる値がちょうど1つ**、`AUTH_SECRET` と `STRIPE_SECRET_KEY` の sha が一致した。

これは Vercel の環境変数の型 **`sensitive`** による。`plain` / `encrypted` と違い、
**作成後は誰も復号できない**（ダッシュボードでも REST API でも CLI でも）。
チームポリシーで production に強制されている場合もある。
⚠️ **エージェント経由かどうかは関係ない。対話的なターミナルで取り直しても同じ結果になる**
（実際にオーナーの手元でも `[SENSITIVE]` が返った）。

### 1-3. だから2つに分けて用意する

#### A. 他システムから復元できる（＝作り直しではない）

| 変数 | 取得元 |
|---|---|
| `MAIL_FROM` | SES の送信元アドレス（既知の値） |
| `ADMIN_PASSWORD_HASH` | **同じ admin パスワード**から再生成する。ハッシュ値は変わるがログインは変わらない |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console |
| `LINE_CLIENT_ID` / `LINE_CLIENT_SECRET` | LINE Developers |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry のプロジェクト設定（そもそも秘密ではない） |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | GA の管理画面（同上） |
| `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` | `www.sikocoffee.com` / `https://www.sikocoffee.com` |
| `ADMIN_TOTP_REQUIRED` | `true` |
| `INSTAGRAM_ACCESS_TOKEN` | ✅ **DynamoDB `siko-coffee-config`** に実物がある（cron が更新している。2026-08-01 時点で 161文字・`refreshedAt` は `2026-08-01T00:21:11Z`） |

🔴 `ADMIN_TOTP_SECRET` だけは注意。**認証アプリの登録と一致していないといけない**ので、
手元に控えが無ければ**新しい秘密を作って再登録**する（＝下の B と同じ扱いになる）。

```bash
# INSTAGRAM_ACCESS_TOKEN は AWS 側から取れる
aws dynamodb get-item --table-name siko-coffee-config --region ap-northeast-1 \
  --key '{"configKey":{"S":"INSTAGRAM_ACCESS_TOKEN"}}' --query "Item.value.S" --output text
```

#### B. 読めないので**両側を同じ新しい値に回す**（5本）

```
AUTH_SECRET  ADMIN_SESSION_SECRET  ORDER_TOKEN_SECRET  CRON_SECRET  REVALIDATE_SECRET
```

soak 中は AWS と Vercel の両方が本番を担うので、**片方だけ変えると割れる**。
**新しい値を作り、Vercel と AWS の両方に同じものを入れる**のが唯一の整合する道。

**影響を本番データで実測した（2026-08-01）**:

| 変数 | 作り直すと | 実測した規模 |
|---|---|---|
| `ORDER_TOKEN_SECRET` | 既発行の注文照会リンクが無効 | 🟢 **`siko-coffee-orders` は 0件**＝壊れるリンクが存在しない |
| `AUTH_SECRET` | 全ユーザーが1回ログアウト | 🟢 `siko-coffee-auth` は **7件**（users/accounts/sessions 合計）＝数名 |
| `ADMIN_SESSION_SECRET` | admin が1回ログアウト | 🟢 自分だけ |
| `CRON_SECRET` | Vercel cron の認可 | 🟢 内部のみ。両側同時に変えれば無影響 |
| `REVALIDATE_SECRET` | オンデマンド再検証の呼び出し元 | 🟢 内部のみ |

＝ **今なら回すコストはほぼゼロ**。決済停止中で注文が無く、利用者もごく少数のうちに済ませられる。

**順序**（Vercel を先に、AWS は 13 のデプロイで入る）:

```bash
# ① 新しい値を作る（例）
openssl rand -hex 32

# ② Vercel を更新して再デプロイ（再デプロイしないと反映されない）
npx vercel env rm AUTH_SECRET production --yes --scope … --project …
npx vercel env add AUTH_SECRET production --scope … --project …

# ③ 同じ値を SST にも入れる（下の 1-4）
```

⚠️ **`ADMIN_PASSWORD_HASH` は「同じパスワードの別ハッシュ」でよい**（照合はハッシュ同士ではない）。
逆に **B の5本は文字列そのものが一致していないといけない**。

### 1-4. 手順

🔴 **`vercel env pull` からは作れない**（1-2）。1-3 の A（他システムから復元）と
B（両側ローテーション）で用意した値を、自分で `.env` 形式のファイルに書く。

```bash
# ① 投入用ファイルを作る（★ 値は 1-3 で用意したもの）
umask 077
cat > /tmp/po-sst.env <<'EOF'
AUTH_SECRET=...
ORDER_TOKEN_SECRET=...
（… 18本 …）
EOF
```

```bash
# ②（参考）Vercel から取れる非 sensitive の値だけ確認したい場合
npx vercel env pull /tmp/po-prod.env --environment=production \
  --scope team_Evt7nWh10Bz1hbN6Sg75LsOt --project prj_BDqrRMJfhzlF5vrVEtbDK3UK1Vnv
# ⚠️ sensitive のものは [SENSITIVE] になる。絞り込みだけなら次のコマンド
grep -E '^(AUTH_SECRET|ORDER_TOKEN_SECRET|CRON_SECRET|REVALIDATE_SECRET|MAIL_FROM|ADMIN_PASSWORD_HASH|ADMIN_SESSION_SECRET|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|LINE_CLIENT_ID|LINE_CLIENT_SECRET|ADMIN_TOTP_SECRET|ADMIN_TOTP_REQUIRED|NEXT_PUBLIC_SENTRY_DSN|NEXT_PUBLIC_GA_MEASUREMENT_ID|INSTAGRAM_ACCESS_TOKEN|WEBAUTHN_RP_ID|WEBAUTHN_ORIGIN)=' /tmp/po-prod.env > /tmp/po-sst.env
```

```bash
# ③ 🔴 投入前に必ず検査する（値は表示されない）
npm run check:secret-file /tmp/po-sst.env
```

`scripts/check-secret-file.mjs` が止めるもの:

- **値の重複**（＝復号漏れ・プレースホルダ）… 今回の事故がこれ
- **空文字**（10 で踏んだ事故と同型）
- **入れてはいけない値の混入**（`AWS_*` / `STRIPE_*` / `BLOB_*` / `PAYMENTS_ENABLED` /
  `SENTRY_ORG|PROJECT|AUTH_TOKEN` / `VERCEL*`）
- **必須7本の欠落**（`sst deploy` がこれで落ちる）
- 任意11本の欠落は**警告**（`ADMIN_TOTP_REQUIRED` だけ赤字で強調される）

出力は **key・length・sha の先頭8桁だけ**で、値は一切出ない。

```bash
# ④ SST へ一括投入（③ が通ってから）
eval "$(aws configure export-credentials --format env)"
npx sst secret load /tmp/po-sst.env --stage production
```

```bash
# ⑤ 後片付け（**必ずやる**）
rm -f /tmp/po-prod.env /tmp/po-sst.env
```

📌 `sst secret load` は **引用符を剥がす**（dev のダミーで実測: `KEY="abc"` → `len=3`）。
Vercel の pull は `KEY="value"` 形式なので、そのまま渡してよい。

### 1-5. 投入後の検証（🔑 値を出さずに正しさを見る）

```bash
npx sst secret list --stage production | sed 's/=.*/=<set>/'
```

**教訓32: 「保存された」と「正しい値が保存された」は別。**
`<redacted>` に潰すだけの確認では**空文字で保存された事故を見逃す**（10 で実際に踏んだ）。
長さ・接頭辞・ホスト名なら値を露出せずに正誤を判定できる:

```bash
npx sst secret list --stage production \
  | awk -F= '{k=$1; v=substr($0, index($0,"=")+1); printf "%-32s len=%d head=%.4s\n", k, length(v), v}'
```

- `MAIL_FROM` … `@` を含むか
- `NEXT_PUBLIC_SENTRY_DSN` … `http` で始まるか
- `ADMIN_TOTP_REQUIRED` … **`true` そのものか**（`len=4`）
- 乱数系 … `len` が 0 でないか

---

## 2. production へデプロイ

```bash
npm run sst:deploy -- --stage production
```

🔴 **素の `npx sst deploy` を打たない**（0-a）。`scripts/deploy.sh` が
①ツールチェーン検査 ②資格情報の展開 ③deploy ④画像最適化の検証 を内包している。

📌 `app()` は production だけ `removal: 'retain'` / `protect: true` になる（誤削除防止）。
📌 このデプロイでは **DNS レコードは作られない**（12 の `dns: false`）。
   ＝ **この時点ではまだ本番トラフィックは Vercel のまま**。

デプロイ後、出力された CloudFront ドメイン（`d…….cloudfront.net`）を控える。

---

## 3. DNS を切り替える**前**の検証

🔴 **`*.cloudfront.net` は 403 になる**（`domain` を設定すると SST が
`CF_BLOCK_CLOUDFRONT_URL_INJECTION` で塞ぐ）。**CloudFront の URL では検証できない。**

→ **SNI と Host を本番ドメインのまま、接続先だけ CloudFront に向ける**:

```bash
CF=d0000000000000.cloudfront.net          # 2 で控えたドメイン
IP=$(dig +short $CF | head -1)
echo "$CF -> $IP"

curl -s -o /dev/null -w "%{http_code}\n" --resolve www.sikocoffee.com:443:$IP https://www.sikocoffee.com/
```

### 3-1. 必ず見る項目

| # | 確認 | 期待 |
|---|---|---|
| 3-a | `https://www.sikocoffee.com/`（--resolve） | **200** |
| 3-b | `/shop` `/shop/catalog` `/account` | 200 |
| 3-c | **12: apex → www の 308** … `--resolve sikocoffee.com:443:$IP https://sikocoffee.com/shop?a=1` | **308** ＋ `location: https://www.sikocoffee.com/shop?a=1` ＋ `strict-transport-security` |
| 3-d | **9 が production に漏れていないこと**（負の対照） | **401 が返らない**／`x-robots-tag` が**付かない** |
| 3-e | **5 の再確認**（ステージごとに効く） | `aws lambda get-function-url-config` の `AuthType` が **`AWS_IAM`**、Function URL 直叩きが **403** |
| 3-f | **6 の再確認** | `/admin` が **202**（challenge）、`/api/admin/auth` 40連打で **T+45s 以降 403** |
| 3-g | DynamoDB を本番テーブルに向いているか | `/shop` に実データが出る（preview の空データでない） |
| 3-h | 10 のアラーム | production では **SES の `Reputation.*` 2本が新規に**でき、計6本になる |
| 3-i | cron が**まだ止まっている**こと | production のスケジュールが **DISABLED**（`CRON_STAGES` に production が無い） |

🔴 **3-d は必ずやる。** 本番に `noindex` が漏れるのが最悪の事故で、
しかも**成功しているように見える**（サイトは普通に動く）。

⚠️ **CloudFront 生成のエラーには viewer-response 関数が走らない**ので、
ヘッダの確認を 404/403 でやると誤判定する（9 で踏んだ）。**200 の応答で見ること。**

---

## 4. DNS 切替（ここから本番が動く）

> 🔴 **ここが依存 F の門。2026-08-02 17:50 UTC（8/3 02:50 JST）より前に打たないこと。**
> それより前だと旧 TTL（www 500s / apex 300s）を掴んだリゾルバが残っており、
> **切り戻しに引き下げた 60s が効かない**。

```bash
CFZONE=Z2FDTNDATAQYW2      # CloudFront の固定 HostedZoneId
CF=d0000000000000.cloudfront.net

cat > /tmp/cutover.json <<EOF
{ "Comment": "Pour Over 13: cut over to CloudFront",
  "Changes": [
    { "Action": "UPSERT", "ResourceRecordSet": {
        "Name": "sikocoffee.com.", "Type": "A",
        "AliasTarget": { "HostedZoneId": "$CFZONE", "DNSName": "$CF", "EvaluateTargetHealth": false } } },
    { "Action": "UPSERT", "ResourceRecordSet": {
        "Name": "www.sikocoffee.com.", "Type": "A",
        "AliasTarget": { "HostedZoneId": "$CFZONE", "DNSName": "$CF", "EvaluateTargetHealth": false } } }
  ] }
EOF

aws route53 change-resource-record-sets --hosted-zone-id Z0281603UIOXAI0M8P8R \
  --change-batch file:///tmp/cutover.json
```

⚠️ **www は既存が CNAME なので、A（ALIAS）への UPSERT で型が変わる。**
Route53 は同名の CNAME と A を共存させないため、UPSERT で置き換わる。
📌 切替後 www は ALIAS（A）になり、以後 CAA は自ゾーンで評価される（0-b の制約から外れる）。
⚠️ **`_c84c530444dc328407ddf8a6cf46916b.sikocoffee.com`（ACM 検証）と SES DKIM 3本は触らない。**

```bash
# 反映を待ってから権威 NS 4本すべてで確認する（1本だけ見ない）
aws route53 wait resource-record-sets-changed --id <change-id>
for ns in ns-17.awsdns-02.com ns-983.awsdns-58.net ns-1155.awsdns-16.org ns-1600.awsdns-08.co.uk; do
  echo "$ns: $(dig @$ns +short www.sikocoffee.com | head -1) / $(dig @$ns +short sikocoffee.com | head -1)"
done
```

---

## 5. 切替**後**にやること（順序厳守）

| # | 作業 | 注意 |
|---|---|---|
| 5-1 | 3-a〜3-h を**実 DNS で**やり直す | `--resolve` 無しで同じ結果になるか |
| 5-2 | **4 の積み残し②③を回収** | production のバケット名で Vercel 本番に `AVATAR_UPLOAD_BUCKET` / `AVATAR_BUCKET` / `AVATAR_BASE_URL` を投入し、Vercel の IAM ユーザーに S3 権限を追加。**それまで本番のアイコン設定は 503** |
| 5-3 | **8 の cron を有効化** | `sst.config.ts` の `CRON_STAGES` に `'production'` を足して**再デプロイ**。🔴 **DNS 切替のあと**にやる。先にやると `instagram-refresh` が Vercel と二重に走り**長期トークンの更新が競合**する |
| 5-4 | **9.5 の matrix に production を足す** | `.github/workflows/ci.yml` の `strategy.matrix.stage` に `production`。🔴 **13 のあと**（先に足すと本番ステージが CI から先に作られ、この手順が飛ぶ） |
| 5-5 | **WAF_STAGES から `'dev'` を外す** | web ACL は**ステージごとに $8/月**。soak 中に dev と production が並ぶと月$16 で予算通知（$12）を超える |
| 5-6 | Instagram トークンの確認 | `siko-coffee-config` の `refreshedAt`。**次の機会は 2026-09-01 00:00 UTC**（Hobby の flexible window で 00:21 頃に発火＝朝イチに見ると空振りする） |

---

## 6. 切り戻し（ロールバック）

🔑 **DNS を戻すだけでよい。** これが 11（TTL 60s）と 12（`dns: false`）の投資の回収先。

```bash
cat > /tmp/rollback.json <<'EOF'
{ "Comment": "Pour Over 13: rollback to Vercel",
  "Changes": [
    { "Action": "UPSERT", "ResourceRecordSet": {
        "Name": "sikocoffee.com.", "Type": "A", "TTL": 60,
        "ResourceRecords": [{ "Value": "216.198.79.1" }] } },
    { "Action": "UPSERT", "ResourceRecordSet": {
        "Name": "www.sikocoffee.com.", "Type": "CNAME", "TTL": 60,
        "ResourceRecords": [{ "Value": "724b9301c41a7c8f.vercel-dns-017.com." }] } }
  ] }
EOF

aws route53 change-resource-record-sets --hosted-zone-id Z0281603UIOXAI0M8P8R \
  --change-batch file:///tmp/rollback.json
```

🔴 **「60s だから1分で戻る」と見積もらないこと。** 24時間の待ちは 500s から計算した値ではなく、
TTL を守らない／独自の下限を持つリゾルバと OS・ブラウザのキャッシュを吸収するための余裕。
期待できるのは 5〜8分が**1分台に近づく**ところまで。

📌 **Vercel は soak 中ずっと `main` 自動デプロイのまま生かしておく**（14）。
だから戻し先は常に最新である。**15（解約）までは Vercel の設定に一切触らない。**

⚠️ 5-3 を済ませたあとに切り戻す場合は、**`CRON_STAGES` から production を外して再デプロイ**する
（Vercel の cron と二重に走るため）。DNS だけ戻して cron を放置しない。

---

## 7. この手順書で意図的に「やらない」こと

- **`sst remove --stage dev`** … soak 中は dev も比較対象として残す。消すのは 15 以降。
- **Vercel の設定変更** … 14 の間は触らない（ロールバック先を壊さないため）。
- **決済の再開** … 15。順序は ①Stripe 新キー投入 →②`PAYMENTS_ENABLED=true` →③再デプロイ。
- **`vercel.json` などの撤去** … 16。先に消すと apex 正規化とテストが同時に壊れる（依存 G）。
