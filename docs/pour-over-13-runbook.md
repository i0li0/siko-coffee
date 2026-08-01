# Pour Over 13 実行手順書（production デプロイ → 検証 → DNS 切替）

**この文書は当日そのまま上から実行するためのもの。** 背景と根拠は
`docs/aws-migration-feasibility.md`（計画）と `docs/pour-over-log.md`（実施ログと教訓）にある。
ここには**やること・確認すること・戻し方**だけを置く。

> 🔴 **13 は「デプロイ → 検証 → DNS 切替」の3段で、切替が最後にあることが安全性の源**である。
> 検証で問題が出たら切り替えなければよい。この順序を崩さないこと。
> （12 で `dns: false` にしてあるのはこのため。SST に DNS を触らせると1段目が3段目を兼ねてしまう。）

---

## 0. 実行可能条件

| # | 条件 | 状態 |
|---|---|---|
| 0-1 | **11（TTL 60s）から24時間以上** | ✅ 11 は **2026-08-01 17:50 UTC** に実施 → **2026-08-02 17:50 UTC（8/3 02:50 JST）以降** |
| 0-2 | ワイルドカード証明書が `ISSUED` | ✅ `01195002-…` / Issuer: Amazon / 2027-02-11 まで / `InUseBy` は空 |
| 0-3 | 本番 DynamoDB テーブルが存在 | ✅ `siko-coffee-*` が16本 |
| 0-4 | **production の secret が投入済み** | 🔴 **未（0本）**。下の 1 を先にやること |
| 0-5 | main が緑でデプロイも通っている | 実行直前に `gh run list --branch main --limit 1` で確認 |

🔴 **0-4 が最大の落とし穴。** `sst deploy --stage production` は `SECRET_NAMES` の
**7本が1本でも欠けると落ちる**。2026-08-01 時点で production の secret は **0本**だった。

---

## 1. production のシークレット投入（**13 の前日までにやる**）

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

### 1-2. 🔴 値は Vercel からコピーする。**作り直さない**

**soak（14）の間は AWS と Vercel の両方が本番を担う。** 乱数系を作り直すと、
**どちらのバックエンドに当たったかでユーザーの体験が割れる**:

| 値 | 作り直すと起きること |
|---|---|
| `AUTH_SECRET` | 片方で発行した NextAuth のセッションがもう片方で無効＝**ランダムにログアウト** |
| `ADMIN_SESSION_SECRET` | admin セッションが同上 |
| `ORDER_TOKEN_SECRET` | **切替前にメールで送った注文照会リンクが片方で 403** |
| `CRON_SECRET` | Vercel 側の cron が 401（soak 中は両方動く） |
| `REVALIDATE_SECRET` | オンデマンド再検証が片方で通らない |

📌 「dev には本番と同じ値を入れない」という方針（`sst.config.ts` の `SECRET_NAMES` コメント）は
**dev の話**で、production は Vercel と一致していなければならない。ここは逆になる。

### 1-3. 手順

```bash
# ① Vercel の production env をファイルへ落とす（値は画面に出さない）
umask 077
npx vercel env pull /tmp/po-prod.env --environment=production \
  --scope team_Evt7nWh10Bz1hbN6Sg75LsOt --project prj_BDqrRMJfhzlF5vrVEtbDK3UK1Vnv
```

```bash
# ② 投入する18本だけに絞る（AWS_* や STRIPE_* を絶対に混ぜない）
grep -E '^(AUTH_SECRET|ORDER_TOKEN_SECRET|CRON_SECRET|REVALIDATE_SECRET|MAIL_FROM|ADMIN_PASSWORD_HASH|ADMIN_SESSION_SECRET|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|LINE_CLIENT_ID|LINE_CLIENT_SECRET|ADMIN_TOTP_SECRET|ADMIN_TOTP_REQUIRED|NEXT_PUBLIC_SENTRY_DSN|NEXT_PUBLIC_GA_MEASUREMENT_ID|INSTAGRAM_ACCESS_TOKEN|WEBAUTHN_RP_ID|WEBAUTHN_ORIGIN)=' /tmp/po-prod.env > /tmp/po-sst.env
wc -l < /tmp/po-sst.env   # ← 18 になるはず
```

```bash
# ③ SST へ一括投入
eval "$(aws configure export-credentials --format env)"
npx sst secret load /tmp/po-sst.env --stage production
```

```bash
# ④ 後片付け（**必ずやる**）
rm -f /tmp/po-prod.env /tmp/po-sst.env
```

### 1-4. 検証（🔑 値を出さずに正しさを見る）

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
