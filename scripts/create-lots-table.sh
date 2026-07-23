#!/bin/bash
# DynamoDB テーブル作成スクリプト（在庫ロット＝販売者×焙煎日 §11.2④ / §7）
# 使い方: bash scripts/create-lots-table.sh [preview]
#
# 主キー: beanId(HASH) + roastDate(RANGE, yyyy-mm-dd) ＝ ロット。
#   ※ 既存 inventory テーブル（PK beanId のみ＝現行ショップ単一SKU在庫）とは別物。
#      複合キーに主キー変更できないため、プラットフォームのロットはこの新テーブルに分離（§11.0）。
# GSI by-freshBy: gsiPk(HASH,定数 "LOT") + gsiSk(RANGE,=freshBy) … 鮮度切れ間近ロットを Query（Scan回避）。
#   ※ 主要属性（キー外・定義不要）: roasterId / onHandG / reservedG / availableG / parRankG / freshBy /
#      status("fresh"|"discount"|"expired") / 計測 purchasedG / soldG / wastedG。
#      availableG = onHandG − reservedG を**実体で保持**する（ConditionExpression に算術式を書けないため。§11.2④）。
#      在庫確保は `availableG >= :qty` 条件での原子加算＋ブレンドは TransactWriteItems（§9・§13.3）。

set -euo pipefail

if [ "${1:-}" = "preview" ]; then
  TABLE_NAME="siko-coffee-preview-lots"
else
  TABLE_NAME="siko-coffee-lots"
fi

REGION="ap-northeast-1"

echo "Creating table: $TABLE_NAME in $REGION"

aws dynamodb create-table \
  --table-name "$TABLE_NAME" \
  --attribute-definitions \
    AttributeName=beanId,AttributeType=S \
    AttributeName=roastDate,AttributeType=S \
    AttributeName=gsiPk,AttributeType=S \
    AttributeName=gsiSk,AttributeType=S \
  --key-schema \
    AttributeName=beanId,KeyType=HASH \
    AttributeName=roastDate,KeyType=RANGE \
  --global-secondary-indexes \
    '[{
      "IndexName": "by-freshBy",
      "KeySchema": [
        {"AttributeName": "gsiPk", "KeyType": "HASH"},
        {"AttributeName": "gsiSk", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"}
    }]' \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION"

echo "Done: $TABLE_NAME created."
