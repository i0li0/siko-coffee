#!/usr/bin/env bash
# Pour Over C-4 の一部。SST の state バケットのライフサイクルを設定する（**冪等**）。
#
# 🔴 **なぜスクリプトにしたか。** このライフサイクルは 2026-08-04 に**手で**入れられ、
#    記録は docs の散文にしかなかった。誰も再現できず、変更履歴も残らず、
#    「今どうなっているか」を確かめるには毎回 CLI を叩く必要があった。
#    ＝ 教訓1「無言で失敗するものは手順書ではなく実行可能な形で防ぐ」の対象。
#    **このバケットは `sst.config.ts` の管理下ではない**（SST の bootstrap が作る）ので、
#    IaC には載せられない。だからスクリプトで冪等に当てる。
#
# ── 🔴🔴 `eventlog/` を 30日 → 1日に詰めた理由（2026-08-08）───────────────
#
# C-4 の調査で、**`eventlog/` にはデプロイのたびに平文の秘密が書かれている**ことが
# 分かった（production は `SST_SECRET_*` 17本すべての**値**＋ STS セッショントークン2本）。
# PR #146 は `command:local:Command` の `environment` を Pulumi の secret にする修正で、
# **checkpoint（`app/`）には効くが、Pulumi のイベントログには効かない**。
#
# ⚠️ **これは「塞ぐ」対処ではない。** 書き込み自体は止まっていない。
#    できるのは**露出している時間を 30日から約1日に縮めること**だけ。
#    恒久策（① を本当に塞ぐ）は別途必要で、それまでの当座の緩和である。
#
# ⚠️ **S3 のライフサイクルは即時ではない。** `Days: 1` は「作成から1日経過後に
#    削除対象になる」であって、実際の削除は**さらに最大24時間ほど遅れる**
#    （S3 は1日1回の非同期バッチで評価する）。＝ 実効の露出は**最長で約2日**。
#    「1日で消える」と読まないこと。
#
# 🔑 **`Days` の最小値は 1。** 0 は指定できないので、ライフサイクルだけで
#    「デプロイ直後に消す」は原理的に作れない。それが要るならデプロイ後の明示的な削除になる。
#
# 使い方:
#   bash scripts/harden-sst-state-bucket.sh          # 適用
#   bash scripts/harden-sst-state-bucket.sh --dry-run # 差分だけ見る
set -euo pipefail

BUCKET="${SST_STATE_BUCKET:-sst-state-ntadsuobcmvm}"
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

# 🔴 バケットは実在確認してから触る（名前の打ち間違いで別のバケットを壊さない）
if ! aws s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1; then
  echo "ERROR: バケット $BUCKET に到達できない（名前 or 資格情報を確認）" >&2
  exit 1
fi

DESIRED=$(cat <<'JSON'
{
  "Rules": [
    {
      "ID": "expire-noncurrent-state-versions",
      "Filter": { "Prefix": "app/" },
      "Status": "Enabled",
      "NoncurrentVersionExpiration": { "NoncurrentDays": 14, "NewerNoncurrentVersions": 10 }
    },
    {
      "ID": "expire-eventlog",
      "Filter": { "Prefix": "eventlog/" },
      "Status": "Enabled",
      "Expiration": { "Days": 1 },
      "NoncurrentVersionExpiration": { "NoncurrentDays": 1 }
    },
    {
      "ID": "expire-snapshot",
      "Filter": { "Prefix": "snapshot/" },
      "Status": "Enabled",
      "Expiration": { "Days": 7 },
      "NoncurrentVersionExpiration": { "NoncurrentDays": 1 }
    },
    {
      "ID": "cleanup-delete-markers",
      "Filter": { "Prefix": "" },
      "Status": "Enabled",
      "Expiration": { "ExpiredObjectDeleteMarker": true }
    },
    {
      "ID": "abort-incomplete-multipart-uploads",
      "Filter": { "Prefix": "" },
      "Status": "Enabled",
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
    }
  ]
}
JSON
)

echo "=== 現在の設定 ==="
aws s3api get-bucket-lifecycle-configuration --bucket "$BUCKET" \
  --query 'Rules[].{ID:ID,Status:Status,ExpDays:Expiration.Days,NoncurrentDays:NoncurrentVersionExpiration.NoncurrentDays}' \
  --output table 2>/dev/null || echo "  (未設定)"

if [ "$DRY_RUN" = "1" ]; then
  echo
  echo "=== --dry-run なので適用しない。入れようとしている内容: ==="
  echo "$DESIRED"
  exit 0
fi

aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" \
  --lifecycle-configuration "$DESIRED"

echo
echo "=== 適用後（実測で確認）==="
aws s3api get-bucket-lifecycle-configuration --bucket "$BUCKET" \
  --query 'Rules[].{ID:ID,Status:Status,ExpDays:Expiration.Days,NoncurrentDays:NoncurrentVersionExpiration.NoncurrentDays}' \
  --output table

# 🔴 「入れた」で終わらせない。狙った値になっているかを問い合わせて確定させる。
GOT=$(aws s3api get-bucket-lifecycle-configuration --bucket "$BUCKET" \
  --query "Rules[?ID=='expire-eventlog']|[0].Expiration.Days" --output text)
if [ "$GOT" != "1" ]; then
  echo "ERROR: expire-eventlog の Expiration.Days が $GOT（期待 1）" >&2
  exit 1
fi
echo
echo "OK: expire-eventlog の Expiration.Days = $GOT"
echo "⚠️ 実際の削除は最大24時間ほど遅れる（S3 の評価は1日1回の非同期バッチ）。"
