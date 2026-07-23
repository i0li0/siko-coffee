#!/bin/bash
# DynamoDB テーブル作成スクリプト（焙煎者サブスク §11.2⑧ / §2）
# 使い方: bash scripts/create-subscriptions-table.sh [preview]
#
# 主キー: roasterId(HASH) + sk(RANGE, 定数 "sub") ＝ 1焙煎者1サブスク。
# GSI by-status: status(HASH) + currentPeriodEnd(RANGE) … 延滞/失効の運用一覧。
#   ※ 主要属性（キー外・定義不要）: stripeSubId / plan("founding"|"standard") / priceYen(創業=3000) /
#      status("active"|"past_due"|"canceled") / currentPeriodEnd。

set -euo pipefail

if [ "${1:-}" = "preview" ]; then
  TABLE_NAME="siko-coffee-preview-subscriptions"
else
  TABLE_NAME="siko-coffee-subscriptions"
fi

REGION="ap-northeast-1"

echo "Creating table: $TABLE_NAME in $REGION"

aws dynamodb create-table \
  --table-name "$TABLE_NAME" \
  --attribute-definitions \
    AttributeName=roasterId,AttributeType=S \
    AttributeName=sk,AttributeType=S \
    AttributeName=status,AttributeType=S \
    AttributeName=currentPeriodEnd,AttributeType=S \
  --key-schema \
    AttributeName=roasterId,KeyType=HASH \
    AttributeName=sk,KeyType=RANGE \
  --global-secondary-indexes \
    '[{
      "IndexName": "by-status",
      "KeySchema": [
        {"AttributeName": "status", "KeyType": "HASH"},
        {"AttributeName": "currentPeriodEnd", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"}
    }]' \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION"

echo "Done: $TABLE_NAME created."
