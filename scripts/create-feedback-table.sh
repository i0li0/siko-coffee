#!/bin/bash
# DynamoDB テーブル作成スクリプト（フィードバック用）
# 使い方: bash scripts/create-feedback-table.sh [preview]
#
# 主キー: feedbackId（Get/Delete 用）
# GSI list-index: gsiPk(=固定値 "FEEDBACK") + gsiSk(=createdAt) で新着降順 Query する。
# 個人情報（名前/メール/IP 等）は保存しないため、属性も主キー/GSI キーのみ定義すればよい。

set -euo pipefail

if [ "${1:-}" = "preview" ]; then
  TABLE_NAME="siko-coffee-preview-feedback"
else
  TABLE_NAME="siko-coffee-feedback"
fi

REGION="ap-northeast-1"

echo "Creating table: $TABLE_NAME in $REGION"

aws dynamodb create-table \
  --table-name "$TABLE_NAME" \
  --attribute-definitions \
    AttributeName=feedbackId,AttributeType=S \
    AttributeName=gsiPk,AttributeType=S \
    AttributeName=gsiSk,AttributeType=S \
  --key-schema \
    AttributeName=feedbackId,KeyType=HASH \
  --global-secondary-indexes \
    '[{
      "IndexName": "list-index",
      "KeySchema": [
        {"AttributeName": "gsiPk", "KeyType": "HASH"},
        {"AttributeName": "gsiSk", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"}
    }]' \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION"

echo "Done: $TABLE_NAME created."
