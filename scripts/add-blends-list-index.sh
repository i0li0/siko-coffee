#!/bin/bash
# 既存 blends テーブルへ GSI list-index を追加（§11.2① / §13.6）
# 使い方: bash scripts/add-blends-list-index.sh [preview]
#
# 目的: 公開ブレンド一覧の既存 ScanCommand（src/app/api/admin/blends・/api/blends）を
#       GSI Query へ置換する（[[feedback-dynamodb-scan]]）。
# GSI list-index: gsiPk(HASH) + gsiSk(RANGE,=createdAt)
#   gsiPk の値運用: 公開カタログ="BLEND#PUBLIC" / 自分のブレンド="BLEND#USER#<uid>"（アプリが書く）。
#
# ⚠️ 非破壊だが「バックフィル」が必要:
#   既存ブレンドには gsiPk/gsiSk が無いため、追加直後は GSI に載らない。
#   別途データ移行で、公開ブレンドに gsiPk="BLEND#PUBLIC"・gsiSk=createdAt を書き込むこと。
#   移行が済むまでは旧 Scan 経路を残し、済んだら Query へ切り替える。
# ⚠️ 既存テーブルは PK "id" のみ（実機確認済み §11.0）。ここでは GSI 追加のみで主キーは触らない。

set -euo pipefail

if [ "${1:-}" = "preview" ]; then
  TABLE_NAME="siko-coffee-preview-blends"
else
  TABLE_NAME="siko-coffee-blends"
fi

REGION="ap-northeast-1"

echo "Adding GSI 'list-index' to table: $TABLE_NAME in $REGION"

aws dynamodb update-table \
  --table-name "$TABLE_NAME" \
  --attribute-definitions \
    AttributeName=gsiPk,AttributeType=S \
    AttributeName=gsiSk,AttributeType=S \
  --global-secondary-index-updates \
    '[{
      "Create": {
        "IndexName": "list-index",
        "KeySchema": [
          {"AttributeName": "gsiPk", "KeyType": "HASH"},
          {"AttributeName": "gsiSk", "KeyType": "RANGE"}
        ],
        "Projection": {"ProjectionType": "ALL"}
      }
    }]' \
  --region "$REGION"

echo "Done: GSI 'list-index' creation started on $TABLE_NAME (backfill of gsiPk/gsiSk is a separate migration)."
