#!/usr/bin/env bash
# Pour Over C-4 ①。SST の state バケットから `eventlog/<app>/<stage>/` を削除する。
#
# ── 🔴🔴 なぜ要るか ─────────────────────────────────────────────
#
# **`eventlog/` にはデプロイのたびに本番シークレットが平文で入る。**
# PR #146（`command:local:Command` の `environment` を Pulumi の secret にする）は
# **checkpoint（`app/`）にしか効かない**。実測した中身は Pulumi の**デバッグ診断**で:
#
#   severity = "debug"
#   message  = 'RegisterResource RPC finished: resource:WebBuilder[command:local:Command]; …
#               …,environment,,,,,<値>,,,<値>,ACTIONS_ID_TOKEN_REQUEST_TOKEN,,,<値>,…'
#
# ＝ **RPC 応答の構造体をそのままフラットに吐いたもの**で、secret のマスクを通らない。
# 1ファイルに `SST_SECRET_*` **17本の値** ＋ STS セッショントークン2本が入っていた（実測）。
#
# 🔴 **`sst deploy` 側に止める手段が無い。** `--verbose` は「増やす」フラグで、
#    減らす／イベントログを書かない指定は無い（`sst deploy --help` で確認）。
#    素の `npx sst deploy` でもデバッグ診断は `eventlog/` に入る。
#    → **書かせない**のではなく**書かれた直後に消す**しかない、というのが現状の結論。
#
# ⚠️ **これは緩和であって完全な封じ込めではない。** 書き込みから削除までの
#    **数秒〜数十秒**は S3 上に平文が存在する。ライフサイクル（1日＝実効最長2日）よりは
#    桁で短いが、ゼロではない。**恒久策は upstream 側の対応が要る。**
#
# 🔑 **失う物**: `eventlog/` は SST のトラブルシュート用データ。消すと過去デプロイの
#    詳細ログは追えなくなる。**4MB のデバッグログに本番シークレットが入っている**以上、
#    トレードオフは削除側に倒す。必要ならその場で `--print-logs` を使う。
#
# 使い方:
#   bash scripts/purge-sst-eventlog.sh <stage>
#   bash scripts/purge-sst-eventlog.sh <stage> --dry-run
set -euo pipefail

STAGE="${1:-}"
DRY_RUN=0
[ "${2:-}" = "--dry-run" ] && DRY_RUN=1

if [ -z "$STAGE" ]; then
  echo "usage: $0 <stage> [--dry-run]" >&2
  exit 2
fi

# バケット名は決め打ちにしない（bootstrap の SSM パラメータが正本）。
BUCKET="${SST_STATE_BUCKET:-}"
if [ -z "$BUCKET" ]; then
  BUCKET=$(aws ssm get-parameter --region "${AWS_REGION:-ap-northeast-1}" --name /sst/bootstrap \
    --query 'Parameter.Value' --output text 2>/dev/null \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["state"])' 2>/dev/null || true)
fi
if [ -z "$BUCKET" ]; then
  echo "! state バケットを特定できませんでした（/sst/bootstrap を読めない）。スキップします。" >&2
  exit 0
fi

# 🔴 対象は `eventlog/` 配下、かつパスに `/<stage>/` を含むものだけ。
#    アプリ名を決め打ちしないために、prefix ではなくキーの照合で絞る。
#    **`app/` には絶対に触れない**（現行の state を消すと復旧できない）。
LIST=$(aws s3api list-object-versions --bucket "$BUCKET" --prefix "eventlog/" --output json 2>/dev/null || echo '{}')

MANIFEST=$(printf '%s' "$LIST" | STAGE="$STAGE" python3 -c '
import json,sys,os
stage=os.environ["STAGE"]
d=json.load(sys.stdin)
objs=[]
for o in d.get("Versions",[])+d.get("DeleteMarkers",[]):
    k=o["Key"]
    if not k.startswith("eventlog/"): continue      # 二重の安全確認
    if f"/{stage}/" not in k: continue
    objs.append({"Key":k,"VersionId":o["VersionId"]})
print(json.dumps({"Objects":objs,"Quiet":True}))
')

COUNT=$(printf '%s' "$MANIFEST" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["Objects"]))')

if [ "$COUNT" = "0" ]; then
  echo "  eventlog/ に stage=${STAGE} の対象なし"
  exit 0
fi

if [ "$DRY_RUN" = "1" ]; then
  echo "  --dry-run: ${COUNT} 件が対象（削除しない）"
  printf '%s' "$MANIFEST" | python3 -c 'import json,sys; [print("   ",o["Key"]) for o in json.load(sys.stdin)["Objects"]]'
  exit 0
fi

printf '%s' "$MANIFEST" > /tmp/sst-eventlog-purge-$$.json
aws s3api delete-objects --bucket "$BUCKET" --delete "file:///tmp/sst-eventlog-purge-$$.json" >/dev/null
rm -f /tmp/sst-eventlog-purge-$$.json

# 🔴 「消した」で終わらせない。実際に 0 になったかを問い合わせて確定させる。
REMAIN=$(aws s3api list-object-versions --bucket "$BUCKET" --prefix "eventlog/" --output json 2>/dev/null \
  | STAGE="$STAGE" python3 -c '
import json,sys,os
stage=os.environ["STAGE"]; d=json.load(sys.stdin)
print(sum(1 for o in d.get("Versions",[]) if f"/{stage}/" in o["Key"]))')

echo "  eventlog/ の stage=${STAGE} を ${COUNT} 件削除 → 残り ${REMAIN} 件"
if [ "$REMAIN" != "0" ]; then
  echo "! eventlog/ が残っています（stage=${STAGE}・残り ${REMAIN}）" >&2
  exit 1
fi
