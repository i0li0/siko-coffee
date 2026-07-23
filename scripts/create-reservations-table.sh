#!/bin/bash
# DynamoDB テーブル作成スクリプト（決済中の在庫確保・TTL失効 §11.2⑤ / §9）
# 使い方: bash scripts/create-reservations-table.sh [preview]
#
# 主キー: orderId(HASH) + lotKey(RANGE, 値="<beanId>#<roastDate>") ＝ 確保したロット。
# GSI by-expire: gsiPk(HASH,定数 "RSV") + expireAt(RANGE, N=epoch秒) … cron が失効ぶんを Query して reservedG を戻す。
# TTL: expireAt（epoch"秒"）で DynamoDB ネイティブ失効を有効化（下記で update-time-to-live）。
#   ※ TTL は最大48h遅延しうるため確実な戻しは by-expire GSI ＋ cron が主・TTL は保険（§13.4）。
#   ※ 主要属性（キー外・定義不要）: qtyG / state("held"|"committed"|"released")。
#      二重戻し防止は state="held" の ConditionExpression（§13.4）。

set -euo pipefail

if [ "${1:-}" = "preview" ]; then
  TABLE_NAME="siko-coffee-preview-reservations"
else
  TABLE_NAME="siko-coffee-reservations"
fi

REGION="ap-northeast-1"

echo "Creating table: $TABLE_NAME in $REGION"

aws dynamodb create-table \
  --table-name "$TABLE_NAME" \
  --attribute-definitions \
    AttributeName=orderId,AttributeType=S \
    AttributeName=lotKey,AttributeType=S \
    AttributeName=gsiPk,AttributeType=S \
    AttributeName=expireAt,AttributeType=N \
  --key-schema \
    AttributeName=orderId,KeyType=HASH \
    AttributeName=lotKey,KeyType=RANGE \
  --global-secondary-indexes \
    '[{
      "IndexName": "by-expire",
      "KeySchema": [
        {"AttributeName": "gsiPk", "KeyType": "HASH"},
        {"AttributeName": "expireAt", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"}
    }]' \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION"

echo "Waiting for $TABLE_NAME to become ACTIVE (for TTL setup)..."
aws dynamodb wait table-exists --table-name "$TABLE_NAME" --region "$REGION"

echo "Enabling native TTL on attribute: expireAt (epoch seconds)"
aws dynamodb update-time-to-live \
  --table-name "$TABLE_NAME" \
  --time-to-live-specification "Enabled=true, AttributeName=expireAt" \
  --region "$REGION"

echo "Done: $TABLE_NAME created (TTL on expireAt enabled)."
