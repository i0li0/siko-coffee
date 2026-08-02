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
| **2. production デプロイ** | **無し**（12 の `dns: false` により DNS を触らない） | ✅ **2026-08-02 に実施済み** |
| **3. 切替前の検証** | **無し**（`--resolve` で当てるので実 DNS を使わない） | ✅ **2026-08-02 に全項目合格** |
| **4. DNS 切替** | 🔴 **依存 F＝ 2026-08-02 17:50 UTC 以降** | ここだけが本当の門 |
| 5. 切替後の後始末 | 4 の後 | — |

🔑 **依存 F が守っているのは「切替の瞬間に旧 TTL が失効していること」**であって、
production ステージの存在ではない。2・3 は DNS に一切触らないので、原理的には先に打てる。

✅ **2026-08-02 に前倒しを実施した＝当日は 4 から始まる。** 以下は当時の判断材料（記録）。
🔑 **前倒しの利点は実際に回収された**: 1回目のデプロイが依存不足と資格情報切れで落ち、
state ロックまで残ったが、**切替の窓の外だったので落ち着いて直せた**（教訓38・39）。
当日にこれを踏んでいたら、依存 F の門の直後という最も時間の無いところで詰まっていた。

**2・3 を先に打つかどうかの判断材料**:

- ✅ **先に打つ利点**: デプロイ時にしか出ない失敗（#124 のトップレベル import がその類）を
  切替の窓の外で潰せる。当日の作業が「検証 → UPSERT」だけになり短く予測可能になる。
- ✅ **費用の代償は解消済み**: かつては「`WAF_STAGES` に dev と production が並んで月$16＝
  予算通知（$12）超え」が先に打つ代償だったが、**2026-08-02 に `'dev'` を外した**ので
  web ACL は production の1枚だけになる（5-5 は前倒しで消化済み）。
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
| 0-4 | **production の secret が投入済み** | ✅ **完了（2026-08-01）＝ 17/17**。Vercel 側の4本も新値に更新済み。下の 1 は**実施記録として残してある**（再実行は不要） |
| 0-5 | main が緑でデプロイも通っている | 実行直前に `gh run list --branch main --limit 1` で確認 |

📌 **0-4 は最大の落とし穴だった。** `sst deploy --stage production` は `SECRET_NAMES` の
**7本が1本でも欠けると落ちる**が、着手前の点検では production の secret が **0本**だった
＝ **13 はそのままでは1行目から進まなかった**。2026-08-01 に解消済み。

✅ **残っていた手作業（`/admin/settings` での TOTP 再登録）は 2026-08-02 に完了＝13 の手作業はゼロ。**
`ADMIN_TOTP_SECRET` は投入していないが、DynamoDB `siko-coffee-config` の `totp_secret` が正で、
そこに入れば **Vercel と AWS の両方が読む**（テーブルを共有しているため）。

🔑 **「登録された」ではなく「実際に通った」まで確認できる。** `totp_secret` に値があることに加えて、
**`totp_last_step` に step が記録されている**かを見る。[`setLastStep`](../src/lib/adminTotp.ts) は
**検証に成功したときにしか書かれない**ので、これがあれば「登録しただけ」ではなく
**コードが1回通った**ことの証拠になる（教訓32 の「保存された ≠ 正しい値が保存された」への答え）。

```bash
aws dynamodb get-item --table-name siko-coffee-config --region ap-northeast-1 \
  --key '{"configKey":{"S":"totp_last_step"}}' --query 'Item.step.N' --output text
```

⚠️ これが未登録のまま切り替えると、`ADMIN_TOTP_REQUIRED=true` を入れてあるので
**AWS 側の admin ログインがフェイルクローズで塞がる**
（`api/admin/auth` は「TOTP 必須なのに秘密が無い」を設定ミスとして拒否する）。

---

## 1. production のシークレット投入（✅ **2026-08-01 に完了**）

> **この節は実施済み。** 以下は**何をどう決めたかの記録**として残してある。
> 作り直しが必要になったときはここに戻る。実測値と罠は全て残してある。

### 1-1. 何を入れるか（**17本**・2026-08-01 に全項目を消費側から確認）

| 変数 | 区分 | 一致 | 備考 |
|---|---|---|---|
| `AUTH_SECRET` | **B** | 🔴 Vercel と一致 | NextAuth のセッション |
| `ADMIN_SESSION_SECRET` | **B** | 🔴 一致 | admin セッション Cookie |
| `ORDER_TOKEN_SECRET` | **B** | 🔴 一致 | 注文照会リンクの HMAC |
| `REVALIDATE_SECRET` | **B** | 🔴 一致 | 外部から叩かれる（リポジトリ内に呼び出し元なし） |
| `CRON_SECRET` | **B** | 🟢 **一致不要** | Vercel cron は Vercel のルート、AWS 中継は AWS のルートしか叩かず**経路が交差しない** |
| `MAIL_FROM` | A | — | `Sikō Coffee <noreply@sikocoffee.com>`（`src/lib/email.ts:5` の例と From ヘッダと dev の36文字が一致） |
| `ADMIN_PASSWORD_HASH` | A | — | **同じパスワードから再生成**。`scrypt:<salt>:<hash>` の168文字 |
| `GOOGLE_CLIENT_ID` / `_SECRET` | A | — | Google Cloud Console |
| `LINE_CLIENT_ID` / `_SECRET` | A | — | LINE Developers |
| `ADMIN_TOTP_REQUIRED` | A | — | `true`。🔴 欠けると admin がパスワードのみで通る |
| `NEXT_PUBLIC_SENTRY_DSN` | A | — | ✅ `src/instrumentation-client.ts:8` にハードコード済み |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | A | — | GA 管理画面 |
| `SLACK_WEBHOOK_URL` | A | — | dev と同じ webhook で可。**投稿先チャンネルは目視で確認** |
| `WEBAUTHN_RP_ID` / `_ORIGIN` | A | — | `www.sikocoffee.com` / `https://www.sikocoffee.com` |

#### 🟢 調べた結果「入れなくてよい」と分かったもの

| 変数 | 理由 |
|---|---|
| `ADMIN_TOTP_SECRET` | `src/lib/adminTotp.ts` は **DynamoDB → 無ければ env** の順で読む。`/admin/settings` から登録し直すと `siko-coffee-config` の `totp_secret` に入り、**Vercel と AWS が同じテーブルを共有する**ので自動的に揃う |
| `INSTAGRAM_ACCESS_TOKEN` | `src/lib/instagram.ts` の `getToken()` が同じ形。DynamoDB に実物がある（161文字・cron が更新中）。cron 側も `if (!currentToken)` の後段でしか env を見ない |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | **ビルド時**にしか使われない（`next.config.ts`）。Lambda の env に入れても効かない |
| `STRIPE_*` / `PAYMENTS_ENABLED` | 決済停止中（Phase 0 維持） |
| `BLOB_*` | 4 で S3 に置き換え済み |
| **`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`** | 🔴 実行ロールに置き換えるのが移行の目的。入れたら移行最大の改善を自分で捨てることになる |

🔑 **「必要そうに見えるが要らない」は実際に2本あった**（`ADMIN_TOTP_SECRET` と
`INSTAGRAM_ACCESS_TOKEN`）。どちらも **DynamoDB を先に読む実装**で、しかも
そのテーブルは Vercel と AWS が共有している。**env に入れるより DynamoDB に任せるほうが
soak の同期が自動で取れる**ぶん優れている。判断は「Vercel にあるか」ではなく
**「消費側が何を先に読むか」**で決める。

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

区分と取得元は **1-1 の表が正本**。ここには手を動かす部分だけ置く。

#### A（12本）… 他システムから復元。**Vercel は触らない**

```bash
# 既に確定している値（テンプレートに記入済み）
#   MAIL_FROM=Sikō Coffee <noreply@sikocoffee.com>
#   ADMIN_TOTP_REQUIRED=true
#   WEBAUTHN_RP_ID=www.sikocoffee.com
#   WEBAUTHN_ORIGIN=https://www.sikocoffee.com
#   NEXT_PUBLIC_SENTRY_DSN=（src/instrumentation-client.ts:8 の値）

# ADMIN_PASSWORD_HASH は同じパスワードから作り直す（履歴に残さない）
read -rs "?admin パスワード: " PW; echo
PW="$PW" node -e 'const{scryptSync,randomBytes}=require("crypto");const s=randomBytes(16).toString("hex");console.log(`scrypt:${s}:${scryptSync(process.env.PW,s,64,{N:32768,r:8,p:1,maxmem:67108864}).toString("hex")}`)'
unset PW
```

⚠️ `maxmem` の指定は必須（N=32768・r=8 で約33.5MB 要り、既定の 32MB 上限を超えるため）。
出力は **168文字**になる（dev の値と同じ長さ＝形式が合っている確認になる）。

#### B（5本）… 読めないので新しく作る

🔴 **うち4本は Vercel と AWS で一致が要る**（`AUTH_SECRET` / `ADMIN_SESSION_SECRET` /
`ORDER_TOKEN_SECRET` / `REVALIDATE_SECRET`）。soak 中は両方が本番を担い、
**同じ Cookie・同じリンクが両方に飛ぶ**ため。
🟢 **`CRON_SECRET` は一致不要**。Vercel の cron は Vercel 自身のルートだけを、
AWS の中継 Lambda は AWS のルートだけを叩き、**経路が交差しない**（`src/lib/cronAuth.ts` は
どちらの形式も受けるが、検証するのは**その環境自身の** `CRON_SECRET`）。

```bash
SCOPE=(--scope team_Evt7nWh10Bz1hbN6Sg75LsOt --project prj_BDqrRMJfhzlF5vrVEtbDK3UK1Vnv)
umask 077
: > /tmp/po-b.env
for K in AUTH_SECRET ADMIN_SESSION_SECRET ORDER_TOKEN_SECRET REVALIDATE_SECRET; do
  V=$(openssl rand -hex 32)
  printf '%s=%s\n' "$K" "$V" >> /tmp/po-b.env
  printf '%s' "$V" | npx vercel env add "$K" production --force --sensitive "${SCOPE[@]}"
done
printf 'CRON_SECRET=%s\n' "$(openssl rand -hex 32)" >> /tmp/po-b.env   # AWS 側だけ
```

📌 `--force` があるので `env rm` は要らない。値は **stdin 経由**なのでシェル履歴にも `ps` にも残らない。
🔴 **生成した値は今すぐパスワードマネージャに保存する。** Vercel に `sensitive` で入った時点で
二度と読み出せない（今回詰まった原因そのもの）。
📌 Vercel 側の反映には**再デプロイが要る**。main への push で自動デプロイされるので、
この後に何か1つマージすれば足りる。

**回すコストは本番データで実測済み（2026-08-01）**:

| 変数 | 影響 | 実測 |
|---|---|---|
| `ORDER_TOKEN_SECRET` | 既発行の注文照会リンクが無効 | 🟢 `siko-coffee-orders` **0件**＝壊れるリンクが無い |
| `AUTH_SECRET` | 全ユーザーが1回ログアウト | 🟢 `siko-coffee-auth` **7件**＝数名 |
| `ADMIN_SESSION_SECRET` | admin が1回ログアウト | 🟢 自分だけ |
| `REVALIDATE_SECRET` | 外部の呼び出し元 | 🟢 リポジトリ内に呼び出し元なし |

＝ **決済停止中で注文が無く利用者も数名の今が、いちばん安いタイミング。**

#### TOTP は env ではなく `/admin/settings` で登録し直す

`saveTotpSecret()` は **DynamoDB `siko-coffee-config` の `totp_secret`** に書く。
そのテーブルは **Vercel と AWS が共有する**ので、一度登録すれば両方が同じものを読む。
＝ `ADMIN_TOTP_SECRET` を投入する必要はない。**切替の前後どちらでもよい**（Vercel 側の
admin からやれば今できる）。

### 1-4. 手順

```bash
# ① A と B を1つにまとめる（17本）
umask 077
cat /tmp/po-a.env /tmp/po-b.env > /tmp/po-sst.env

# ② 🔴 投入前に必ず検査する（値は表示されない）
npm run check:secret-file /tmp/po-sst.env

# ③ ② が通ってから投入
eval "$(aws configure export-credentials --format env)"
npx sst secret load /tmp/po-sst.env --stage production

# ④ 後片付け（**必ずやる**）
rm -f /tmp/po-a.env /tmp/po-b.env /tmp/po-sst.env
```

`scripts/check-secret-file.mjs` が止めるもの:

- **値の重複**（＝復号漏れ・`[SENSITIVE]` の混入）… 2026-08-01 に実際に踏みかけた
- **形式の違い**（`ADMIN_PASSWORD_HASH` の `scrypt:<salt>:<hash>`、`ADMIN_TOTP_REQUIRED` の
  `true`/`false`、DSN や webhook の URL 形など）… **2026-08-01 に実際に踏んだ**。
  `<salt>:<hash>` は正しく作れていたのに **`scrypt:` の接頭辞が欠けており**（161文字／正しくは168）、
  `verifyScrypt` が即 false を返すため **本番の admin が絶対にログインできない**状態だった。
  しかも症状は「パスワードが違う」としか見えない。**長さも重複も通ってしまう**ので形で見る
- **空文字**（10 で踏んだ事故と同型）
- **入れてはいけない値の混入**（`AWS_*` / `STRIPE_*` / `BLOB_*` / `PAYMENTS_ENABLED` /
  ビルド時にしか効かない `SENTRY_ORG|PROJECT|AUTH_TOKEN` / `VERCEL*`）
- **必須7本の欠落**（`sst deploy` がこれで落ちる）

警告として出るもの: 任意の欠落（`ADMIN_TOTP_REQUIRED` は強調）、
および **DynamoDB が正のものを入れてしまっている場合**（`ADMIN_TOTP_SECRET` /
`INSTAGRAM_ACCESS_TOKEN`）。

出力は **key・length・sha の先頭8桁だけ**で、値は一切出ない。

📌 `sst secret load` は **引用符を剥がす**（dev のダミーで実測: `KEY="abc"` → `len=3`）。
`MAIL_FROM` のように空白を含む値も、クォート無しでそのまま書いてよい。

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

## 2. production へデプロイ（✅ **2026-08-02 に実施済み**）

> ✅ **完了。当日この節を再実行する必要は無い**（コードを変えたなら別）。
> 実施ログは `docs/pour-over-log.md`「2026-08-02 — 13 の 2 と 3」。
> **production の CloudFront は `d38zi1bm4zf9e3.cloudfront.net`**（alias に apex と www）。
>
> 🔴 **踏んだ罠2つ（再実行するなら先に潰す）**:
> ① **main リポの `node_modules` が古く**ビルドが `Module not found` で落ちた
>    （#106 の `@aws-sdk/client-s3` / `s3-request-presigner`）→ **先に `npm ci`**（教訓38）
> ② **資格情報が表示された期限より7分早く切れた** → 部分適用＋**state ロック残留**。
>    復旧は `npx sst unlock --stage production`（教訓39）。窓は実測 **10〜15分**しかないので、
>    **`npm run build` 単体で exit 0 を確認してから**デプロイに入る

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

## 3. DNS を切り替える**前**の検証（✅ **2026-08-02 に全項目合格**）

> ✅ **3-a〜3-i すべて合格済み**（実測値は `docs/pour-over-log.md` の同日の節）。
> 当日は **4（DNS 切替）から始めてよい**。ただしコードを変えたなら 3 をやり直すこと。
>
> 🔴 **3-b の `/account` は 200 ではなく 307 →`/login` が正しい。** 下の表の「200」は不正確だった。
>    同じ手段で測った **Vercel 本番も 307**＝移行による差ではない。
> 🔴 **レート制限（3-f）は想像より発火が早く、解除が遅い。**
>    dev の「T+45s から 403」と違い、production は **1発目から 403・解除まで約15分**
>    （無負荷にしても続くことを実測で確認済み）。**当日 admin ログインを連打して自分が
>    締め出されると15分待つ**ことになる。急いでいるときほど注意。

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
| 3-b | `/shop` `/shop/catalog` `/account` | `/shop` `/shop/catalog` は 200／**`/account` は 307 → `/login`**（Vercel も同じ。未ログインなので飛ぶのが正しい） |
| 3-c | **12: apex → www の 308** … `--resolve sikocoffee.com:443:$IP https://sikocoffee.com/shop?a=1` | **308** ＋ `location: https://www.sikocoffee.com/shop?a=1` ＋ `strict-transport-security` |
| 3-d | **9 が production に漏れていないこと**（負の対照） | **401 が返らない**／`x-robots-tag` が**付かない** |
| 3-e | **5 の再確認**（ステージごとに効く） | `aws lambda get-function-url-config` の `AuthType` が **`AWS_IAM`**、Function URL 直叩きが **403** |
| 3-f | **6 の実測**（✅ 2026-08-02 に合格。`WAF_STAGES` から `'dev'` を外したので web ACL は production のみ） | `/admin` が **202**（challenge）／`/api/admin/auth` の連打で **403**（dev と違い**1発目から**・解除まで**約15分**）／どのルールが撃ったかは `aws wafv2 get-sampled-requests --rule-metric-name siko-production-admin-*` で確定できる |
| 3-g | DynamoDB を本番テーブルに向いているか | `/shop` に実データが出る（preview の空データでない） |
| 3-h | 10 のアラーム | production では **SES の `Reputation.*` 2本が新規に**でき、計6本になる |
| 3-i | cron が**まだ止まっている**こと | production のスケジュールが **DISABLED**（`CRON_STAGES` に production が無い） |

🔴 **3-d は必ずやる。** 本番に `noindex` が漏れるのが最悪の事故で、
しかも**成功しているように見える**（サイトは普通に動く）。

### 3-2. 🔴 切替の直前に必ず確かめること — **production は main から取り残される**

**2・3 を前倒しした副作用で、`production` ステージだけが更新されない窓が開いている。**
`ci.yml` の `strategy.matrix.stage` は **`[dev]` のまま**なので、
**main に何をマージしても production には入らない**（5-4 をまだやっていないため）。

**検証済みの production は `10e8229` 時点のコード**である。切替の直前に必ず:

```bash
# production に入っているコードと、これから本番になる main がずれていないか
git fetch origin main
git log --oneline 10e8229..origin/main -- src/ sst.config.ts open-next.config.ts package.json
```

- **出力が空** … コードは動いていない。**そのまま 4 へ進んでよい。**
- **出力がある** … **`npm run sst:deploy -- --stage production` をやり直し、3-a〜3-i を再実行してから 4 へ**。
  でないと**検証していないコードに DNS を向けることになる**。

📌 **5-4（`matrix.stage` に `'production'` を足す）を「13 のあと」に置いていた理由は失効した。**
元の理由は「先に足すと本番ステージが CI から先に作られ、13 の検証手順が飛ぶ」だったが、
**production ステージはもう存在する**。今この順序を守る理由は
**「切替前に soak の運用（main への push が即本番ステージに入る状態）へ前倒しで入らない」**ことだけ。
＝ **5-4 を前倒しすればこの窓は閉じる**が、切替直前に増やす変数としては大きいので、
上のチェックで代替するほうが安全側。

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
| 5-4 | **9.5 の matrix に production を足す**（🔴 **これをやるまで production は main から取り残される**＝ §3-2 参照） | `.github/workflows/ci.yml` の `strategy.matrix.stage` に `production`。⚠️ 旧来の理由「**13 のあと**（先に足すと本番ステージが CI から先に作られ、この手順が飛ぶ）」は **2026-08-02 に失効**（production ステージはもう存在する）。今の理由は「切替前に soak の運用へ前倒しで入らない」だけなので、**切替後は速やかにやる**（放置するほど本番ステージが古くなる） |
| 5-5 | ~~**WAF_STAGES から `'dev'` を外す**~~ **✅ 2026-08-02 に前倒しで実施済み＝当日の作業は無い** | web ACL は**ステージごとに $8/月**。dev と production が並ぶと月$16 で予算通知（$12）を超えるため先に外した。🔴 **dev で WAF を試す道は無くなった**＝ 3 の検証が WAF の初回実測になる |
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
