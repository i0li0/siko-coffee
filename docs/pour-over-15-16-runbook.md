# Pour Over 15／16 実行手順書（決済再開 → Vercel 解約 → Vercel 依存の撤去）

Pour Over の**最後の2タスク**。13 の手順書（[`pour-over-13-runbook.md`](pour-over-13-runbook.md)）と
同じ体裁で、**実行可能条件 → 手順 → 検証 → 切り戻し**の順に書く。

> 🔴🔴 **13 との決定的な違い: 15 には切り戻しが無い。**
> 13 は Route53 を戻せば Vercel に帰れた。15 で Vercel を解約すると **帰る先が消える**。
> だから「実行可能条件」は 13 のときより厳しく、**S-3 は当日に引き直す**。

**最終更新: 2026-08-13**（① 実施。S-3 を引き直して **soak 完了**）

---

## 0. 実行可能条件

### 0-1. soak(14) の終了条件が全部埋まっていること

| # | 条件 | 現況（2026-08-13T17:55Z 実測） |
|---|---|---|
| S-1 | cron 4本が production で1回以上成功 | ✅ 達成（2026-08-09） |
| S-2 | `instagram-refresh` が AWS 経由で `refreshedAt` 更新 | ✅ 達成（`2026-08-09T03:30:13Z`・失効 2026-10-08） |
| S-3 | **アラーム遷移ゼロが7日連続** | ✅✅ **達成**。`2026-08-05T19:53:07Z` → `2026-08-13T17:55:35Z` の **7日22時間で遷移0件**（2リージョン・負の対照 20件/12件つき） |
| S-4 | 5xx 再発が無いか説明できる | ✅ 達成（#144） |
| S-5 | 本番でアイコンのアップロードを1回通す | ✅ 達成（2026-08-08・#153 で不具合1件） |
| S-6 | B-1／B-2 の採否を決める | ✅ 達成（2026-08-04） |

🟢🟢 **6条件すべて達成＝ 14（soak）完了。15 に着手してよい。**

🔴 **それでも S-3 は⑥（不可逆）の当日にもう一度引き直すこと。** 事故が1回でも起きれば
起算がそこまで後退する。**状態ではなく履歴**で、**2リージョン**で見る（教訓42・43）。

```bash
# 🔑 空が返ったら「遷移ゼロ」ではなく「クエリが効いていない」可能性を先に潰す。
#    窓を 08-01 まで広げて 12件出ることを確認してから、狭い窓の空を信じる（負の対照）。
for r in ap-northeast-1 us-east-1; do
  echo "=== $r ==="
  aws cloudwatch describe-alarm-history --region $r --history-item-type StateUpdate \
    --start-date 2026-08-05T19:53:07Z --end-date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --query 'AlarmHistoryItems[].{T:Timestamp,N:AlarmName,S:HistorySummary}' --output table
done
```

### 0-2. 決済再開の前提（オーナー作業・Claude では代われない）

| # | 前提 | なぜ |
|---|---|---|
| 1 | パスワードマネージャに `sk_live_...Nk7B` があること | Phase 0 で Rotate した新キー。**Vercel にも AWS にも未投入** |
| 2 | Stripe の **Webhook エンドポイント URL** が `https://www.sikocoffee.com/api/webhooks/stripe` を指していること | 🔴 **計画に無い項目**。Vercel 時代のまま古い URL を指していれば、解約後に webhook が全部死ぬ |
| 3 | そのエンドポイントの **署名シークレット**（`whsec_...`）を手元に出せること | `STRIPE_WEBHOOK_SECRET` に要る。**エンドポイントを作り直すと値が変わる**ので 1〜3 はこの順に |

---

## 🔴🔴 1. 計画の「販売再開の手順」はそのままでは使えない

正本（`aws-migration-feasibility.md`「🔑 販売再開の手順（順番が重要）」）はこう書いてある:

> 1. パスワードマネージャから `sk_live_...Nk7B` を取り出し、**Vercel 本番**の `STRIPE_SECRET_KEY` を更新
> 2. `PAYMENTS_ENABLED=true` を追加
> 3. 再デプロイ

**これは 2026-07-26（Phase 0）に書かれたもので、当時の本番は Vercel だった。**
13（2026-08-02）で本番は AWS に移り、15 では Vercel が消える。**投入先が違う。**

🔑 このプロジェクトが 5-2・5-3 で2回踏んだ
「**積み残しは『なぜ要るか』を持たないと腐る**」の3例目。今回は *理由* ではなく
***対象*** のほうが先に変わっていた。**着手前に、手順が名指ししている対象が今も本番かを見る。**

### 訂正版（3つ違う）

| | 計画 | 実際 |
|---|---|---|
| 投入先 | Vercel の env | **AWS**（`sst secret set --stage production`） |
| 本数 | 2本（`STRIPE_SECRET_KEY` / `PAYMENTS_ENABLED`） | **3本**（＋ **`STRIPE_WEBHOOK_SECRET`**） |
| 事前作業 | 無し | 🔴 **`sst.config.ts` への配線（PR）が先に要る** |

**3本目の根拠**: `src/app/api/webhooks/stripe/route.ts` が `process.env.STRIPE_WEBHOOK_SECRET` を読む。
無ければ webhook の署名検証が通らず、**決済は成立するのに注文が確定しない**（最悪の壊れ方）。

### 🔴🔴 `sst secret set` だけでは Lambda に届かない

`sst.config.ts:134` に**明示的に除外**と書いてある:

```
// ── 意図的に入れないもの ──
// STRIPE_* / PAYMENTS_ENABLED … 決済停止中（Phase 0 を維持）
```

＝ `SECRET_NAMES` にも `OPTIONAL_SECRET_NAMES` にも無い。**`sst secret set` は値を保管するだけで、
`environment` に配線されていなければ `process.env` には現れない。**

これは **#125（`OPTIONAL_SECRET_NAMES` 11本の欠落）・#128（`SLACK_WEBHOOK_URL`）・
#160（`/api/revalidate` の `Authorization`）と同じ「宣言 ≠ 配線」**。
このプロジェクトで**4回目**なので、ここでは先回りして手順に組み込む。

⚠️ **`SECRET_NAMES` に足すと dev のデプロイが落ちる**（値が無いと deploy が失敗する配列）。
`PAYMENTS_ENABLED` は**フェイルクローズなので空文字で安全** ＝ `OPTIONAL_SECRET_NAMES` 側が正しい。
`STRIPE_*` も同様（`isPaymentsEnabled()` が false なら Stripe を呼びに行かない）。

---

## 2. 実行順序 — **決済再開が先、Vercel 解約が後**

```
① sst.config.ts の配線 PR（コードのみ・決済はまだ止まったまま）
      ↓
② Stripe 側の準備（webhook URL の確認／署名シークレット取得）── オーナー
      ↓
③ 秘密3本を production に投入（sst secret set）
      ↓
④ 再デプロイ（🔴 静的生成の停止表示はこれをしないと消えない）
      ↓
⑤ 決済の検証（Vercel がまだ生きている状態で）
      ↓
━━━━━━━━━ ここまでは切り戻せる ━━━━━━━━━
      ↓
⑥ Vercel 解約 ＋ IAM アクセスキー削除（🔴 不可逆）
      ↓
⑦ 16（Vercel 依存の撤去）
```

🔑 **なぜこの順か。** 決済再開はこの移行で**いちばんリスクの高い変更**（金銭が動く）。
Vercel が生きているうちに通せば、致命的な問題が出ても **DNS を戻して site ごと退避**できる。
逆順（解約 → 決済再開）だと、いちばん危ない変更を**退路が無い状態**でやることになる。

📌 **切り戻した場合、Vercel 側の決済は止まったまま**（`PAYMENTS_ENABLED` 未設定＝フェイルクローズ）。
サイトは動くが買えない。**それでよい** — 新キーを Vercel にも入れると鍵の置き場が2つに増え、
15 で片方を消し忘れる。**退路はサイトの可用性のためであって、決済の継続のためではない。**

---

## 3. 手順

### 3-1. ① 配線 PR — ✅ **実施済み（2026-08-13）**

`sst.config.ts` の `OPTIONAL_SECRET_NAMES` に3本を足し、`SECRET_NAMES` の
「意図的に入れないもの」コメントから `STRIPE_*` / `PAYMENTS_ENABLED` の行を外す
（**コメントを残すと次に読む人が「入れてはいけない」と読む**）。

```bash
npm run check:sst          # 🔴 tsc --noEmit は sst.config.ts を見ない（exclude されている）
npm run check:sst-config   # トップレベル import の検査
```

⚠️ この PR の時点では**決済はまだ止まっている**（値が空文字＝`isPaymentsEnabled()` が false）。
**「配線した」と「有効にした」を1つのデプロイで混ぜない**（1デプロイで2変数動かさない・タスク7）。

#### 🔴🔴 実施して分かったこと: **ゲートは `sst.config.ts` だけではなかった**

この手順書の §3-2 は「投入前に必ず `npm run check:secret-file`」と書いているが、
**`scripts/check-secret-file.mjs` は③で入れる3本をちょうど弾く状態だった**
（`FORBIDDEN` に `/^STRIPE_/` と `/^PAYMENTS_ENABLED$/`）。さらに⑤「必須の充足」は
13 の**一括投入**前提なので、3本だけのファイルでは `必須が欠けている` が7件出て止まる。
＝ **手順どおりにやると必ず失敗し、失敗した人は検査を飛ばす方向に動く**（教訓55）。

同じ PR で直した（詳細は教訓56）:

- 3本を `FORBIDDEN` → `OPTIONAL` へ移動
- `FORMATS` に3本を追加 … `sk_live_` / `whsec_` / `true`（`sk_test_` と `pk_live_` を止める）
- **`--partial`** を追加 … **⑤だけ**を省く。①重複・②空値・③禁止・④形式は部分投入でも走る
- 重複検査から `PAYMENTS_ENABLED` / `ADMIN_TOTP_REQUIRED` を除外
  … 正しく設定すると**どちらも `true`**＝除外しないと**正しいファイルを誤検知で止める**

### 3-2. ③ 秘密の投入

ファイルは**3行だけ**（既存の production に足す形）:

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
PAYMENTS_ENABLED=true
```

```bash
eval "$(aws configure export-credentials --format env)"   # 🔴 これが無いと SST は資格情報を読めない
npm run check:secret-file -- --partial <file>              # 🔴 --partial は必須（3行なので⑤が落ちる）
npx sst secret load <file> --stage production
rm -P <file>                                               # 後片付けは必ず
```

📌 検証は**値を出さずに**。`npx sst secret list --stage production` は値を出すので使わず、
`scripts/check-secret-file.mjs` の長さ・形式検査で見る（教訓36）。
✅ `FORMATS` の正規表現は ① で投入済み（`sk_live_` / `whsec_` / `true`）＝
**`sk_test_` を本番に入れる**・**`pk_live_` を秘密キー欄に入れる**は、値を見ずに止まる。

### 3-3. ④ 再デプロイ

```bash
npm run sst:deploy -- --stage production
```

🔴 **env を変えるだけでは `/shop` と `/shop/product/[key]` の停止表示は消えない**
（静的生成でフラグがビルド時に焼き込まれる）。API 側の 503 解除は実行時なので即座に効く。
＝ **「買えるのに停止表示が出たまま」と「表示は消えたのに買えない」は別々に起こりうる。両方見る。**

### 3-4. ⑤ 決済の検証（Vercel が生きているうちに）

| # | 見るもの | 期待 |
|---|---|---|
| 1 | `POST /api/checkout` | **503 を返さなくなる** |
| 2 | `/shop`・`/shop/catalog`・`/shop/product/brazil` | 停止告知が**消えている**・購入ボタンが押せる |
| 3 | 構造化データの `availability` | `OutOfStock` → **`InStock`** に戻る |
| 4 | 🔴 **実際に1件買う**（少額・自分で） | Stripe セッション作成 → 決済 → **webhook で注文が確定** |
| 5 | 4 の注文照会リンク | 🔑 **`ORDER_TOKEN_SECRET` のローテーション検証がここで初めて閉じる**（C-4 の残り2本のうち1本） |
| 6 | 注文メール | SES で届く（R-5 を入れていれば configuration set のイベントにも出る） |

🔑 **4 を飛ばさない。** 1〜3 は「入口が開いた」までしか言わない。
`STRIPE_WEBHOOK_SECRET` の誤りは**決済が成功したあとに**顕在化するので、
**通しで1件買うまで「再開できた」と書かない**（教訓37 と同型＝機械で検査できない性質）。

---

## 4. ⑥ Vercel 解約（🔴 ここから不可逆）

### 4-1. 解約**前**に取り出しておくもの（解約と同時に永久に失われる）

| 対象 | 備考 |
|---|---|
| Speed Insights の基準値 | 🔴 **デスクトップ RES 97 / LCP 2.66s のみ**（モバイルは元からデータ無し）。R-2（CloudWatch RUM）の比較対象はこれしか無い |
| Vercel の runtime ログ | 保持は約1時間なので実質「今あるものだけ」 |
| Vercel の env | ⚠️ **`sensitive` 型で値は取り出せない**（`[SENSITIVE]` になる）＝ **取り出せないことが確定している**。必要な値は既に AWS 側にある（13 で17本投入済み） |

### 4-2. 🔴 解約しても消えないもの ＝ 手で消す

**Vercel の解約は AWS 側に何もしない。** 以下は AWS に残る。

```bash
# 🔴🔴 Vercel が持っている AdministratorAccess の静的キー。解約後も生き続ける。
aws iam get-access-key-last-used --access-key-id AKIAZQY7YB2C3BYMZCYG   # まず現況を見る
aws iam list-groups-for-user --user-name shun                            # administrator に属する
aws iam delete-access-key --user-name shun --access-key-id AKIAZQY7YB2C3BYMZCYG
```

🔑 **静的キーなので失効しない。** R-7（実行ロールを絞る）と同じ問題だが、
こちらは**期限が来ない分だけ悪い**。**15 の完了条件にこの削除を含める。**

⚠️ **削除の前に「最終使用」を見る。** 2026-08-02T20:02Z の dynamodb が最後なら、
それは Vercel が本番を担っていた頃の記録。**切替後の日付が出るなら、まだ何かが使っている**
＝ 消す前にそれが何かを突き止める（負の対照）。

### 4-3. DNS の作業は**発生しない**（2026-08-10 実測）

ゾーンに **Vercel を指すレコードは1本も残っていない**。apex・www とも
CloudFront への A(ALIAS)。13 の切替で `DELETE`＋`CREATE` した時点で消えている。

🔴 **消してはいけないレコード**（解約とは無関係に生きている）:

| レコード | 用途 |
|---|---|
| `_c84c530444dc328407ddf8a6cf46916b.sikocoffee.com` CNAME | **ACM ワイルドカード証明書の更新に使用中** |
| `*._domainkey.sikocoffee.com` CNAME **3本** | SES の DKIM |
| CAA **5本**（`amazon.com` を含む） | 🔴 `amazon.com` を落とすと**証明書の更新が `CAA_ERROR` で止まる**（依存 H） |
| apex TXT の `v=spf1 include:amazonses.com ~all` | SES の SPF |

📌 CAA と TXT は**複数値**。`--query 'ResourceRecords[0].Value'` で見ると
**1本しか無いように見える**（作成時にこれで誤読しかけた）。`dig` を権威 NS に直接打つこと。

### 4-4. 解約で止まるもの・止まらないもの

| | 解約後 |
|---|---|
| Vercel の cron 4本 | 止まる。✅ **AWS 側が S-1・S-2 で実証済み**＝影響なし |
| `instagram-refresh` の月次 | 止まる。✅ **AWS の週次が自走中**（依存 L 解消済み）＝影響なし |
| `siko-coffee.vercel.app` | 消える → 16 ① の `redirects()` が不要になる |
| Vercel Analytics / Speed Insights | 止まる → 16 ⑦ で依存ごと削除 |

---

## 5. ⑦ 16（Vercel 依存の撤去）

🔴 **`vercel.json` だけ消すと build が全環境で落ちる。**
`package.json` の `prebuild` が `scripts/check-cron-schedule.mjs` を呼び、それが `vercel.json` を読む。
**④まで同じ PR でまとめて消す。**

| # | 対象 |
|---|---|
| ① | `next.config.ts` の `redirects()`（`siko-coffee.vercel.app` 向け） |
| ② | `vercel.json` |
| ③ | `scripts/check-cron-schedule.mjs` ＋ `package.json` の `prebuild` / `check:cron` |
| ④ | CI の該当ステップ |
| ⑤ | `src/__tests__/hostRedirects.test.ts` |
| ⑥ | `src/lib/stage.ts` の `?? VERCEL_ENV` ＋ `stage.test.ts` の該当ケース。🔴 **`next.config.ts` の `env.NEXT_PUBLIC_STAGE` にも同じ式がある**（C-1 で追加）＝ `grep -rn VERCEL src/` では**漏れる**（`src/` の外） |
| ⑦ | `isVercelPlatform()` と `layout.tsx` の呼び出し ＋ `@vercel/analytics` / `@vercel/speed-insights` の依存 |
| ⑧ | `src/lib/cronAuth.ts` の `Authorization: Bearer` 分岐 |
| **⑨** | 🆕 **`src/lib/revalidateAuth.ts` の `Authorization: Bearer` 分岐**（#160 で追加）＝ ⑧ と同じ理由・同じタイミング |

### 📌 ⑧⑨ について分かっていること（#160・2026-08-10 実測）

**`Authorization` 分岐は AWS 経路では最初から一度も機能していない。**
CloudFront は OAC（`signingBehavior: "always"`）で SigV4 署名を `Authorization` に書くため、
**ビューワが送った `Authorization` はアプリに届かない**。Vercel 経路（CloudFront を通らない）
でだけ生きていた。＝ **解約すればこの分岐は「使われなくなる」のではなく「元から死んでいた側が消える」。**

だから ⑧⑨ の撤去は**挙動を変えない**。それでも消すのは、
**残しておくと「そのヘッダでも通るはず」という誤読を再生産する**から。

### 検証

```bash
npm run build              # ③ を消して prebuild が壊れていないか（16 でいちばん壊れやすい）
npx vitest run             # ⑤⑥ のテスト削除が過不足ないか
npm run check:sst
```

**マージ後に本番で見る**: `/` 200 ／ `/shop` 200 ／ cron が `x-cron-secret` で 200 ／
`/api/revalidate` が `x-revalidate-secret` で 200・`Authorization` で **401**（⑨ を消した後の期待値）。

---

## 6. 切り戻し

| 段階 | 戻せるか |
|---|---|
| ①〜⑤（決済再開まで） | 🟢 **戻せる**。Route53 を Vercel へ戻す（[13 runbook §6](pour-over-13-runbook.md) の `DELETE`＋`CREATE`）。決済は Vercel 側で停止のまま |
| ⑥（Vercel 解約） | 🔴 **戻せない** |
| ⑦（16 の撤去） | 🟡 コードは `git revert` できるが、**戻す先の Vercel が無い**ので実質意味は無い |

🔑 **不可逆点は⑥のただ1か所。** ①〜⑤で見つかる問題は全部そこより手前で潰しておく
＝ **§3-4 の検証6項目は⑥の前に終わらせる**（特に「実際に1件買う」）。

---

## 7. この手順書で意図的に「やらない」こと

- **B-1（arm64 統一）・B-2（warmer）** — soak 明けに**単独で**測ると決めた（S-6）。15 と混ぜない
- **R-5（SES の運用化）** — 15 とは独立。ただし④で注文メールが飛び始めるので、
  **入れるなら決済再開より前**のほうが得（バウンスが最初から見える）
- **C-3（`BLOB_READ_WRITE_TOKEN` の残存）** — Vercel の env なので**解約で自動的に消える**
  ＝ 16 の作業項目にする必要は無い
