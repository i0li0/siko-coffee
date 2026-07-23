#!/bin/bash
# DynamoDB テーブル作成スクリプト（掲載豆＝焙煎者の申告5項目 §11.2③ / §6.2.1）
# 使い方: bash scripts/create-beans-table.sh [preview]
#
# 主キー: beanId で Get/Update。
# GSI by-roaster: roasterId(HASH) + createdAt(RANGE) … 焙煎者の豆一覧・状態波及。
# GSI list-index: gsiPk(HASH,定数 "BEAN#PUBLIC") + gsiSk(RANGE,=createdAt) … 公開豆カタログ（新着降順）。
#   ※ 主要属性（アプリが書く・キーではないので定義不要）:
#      roasterId / name / greenOrigin / roastLevel / pricePer100g(税込・価格決定権) /
#      weeklyCapKg(受注上限=自動承認の入力源) / leadTimeDays / orderStatus("on"|"off"|"paused")

set -euo pipefail

if [ "${1:-}" = "preview" ]; then
  TABLE_NAME="siko-coffee-preview-beans"
else
  TABLE_NAME="siko-coffee-beans"
fi

REGION="ap-northeast-1"

echo "Creating table: $TABLE_NAME in $REGION"

aws dynamodb create-table \
  --table-name "$TABLE_NAME" \
  --attribute-definitions \
    AttributeName=beanId,AttributeType=S \
    AttributeName=roasterId,AttributeType=S \
    AttributeName=createdAt,AttributeType=S \
    AttributeName=gsiPk,AttributeType=S \
    AttributeName=gsiSk,AttributeType=S \
  --key-schema \
    AttributeName=beanId,KeyType=HASH \
  --global-secondary-indexes \
    '[{
      "IndexName": "by-roaster",
      "KeySchema": [
        {"AttributeName": "roasterId", "KeyType": "HASH"},
        {"AttributeName": "createdAt", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"}
    },
    {
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
