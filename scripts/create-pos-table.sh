#!/bin/bash
# DynamoDB テーブル作成スクリプト（発注＝Purchase Order・§11.2⑨ / §6.2）
# 使い方: bash scripts/create-pos-table.sh [preview]
#
# なぜ独立テーブルか:
#   発注は orders.procurement[] にも持つが、**焙煎者→自分宛の発注**を引くには逆引きが要る。
#   procurement はリスト属性で GSI キーにできず、orders の Scan は禁止（feedback-dynamodb-scan）。
#   → 注文×豆ごとに1行の PO レコードへ非正規化し、焙煎者を PK にする（§11.4 の「必要になったら後付け」）。
#
# 主キー: roasterId(HASH) + poKey(RANGE, 値="<orderId>#<beanId>")
# GSI by-status: gsiPk(HASH, 値="PO#<poStatus>") + gsiSk(RANGE, = timeoutAt ?? createdAt)
#   … cron は "PO#pending" を timeoutAt <= now で Query（48h無応答の抽出・§6.3）。
#     admin ダッシュボードは任意ステータスで Query（例外 T1/T2/T3 の監視・§13.2）。
#   ※ 主要属性（キー外・定義不要）: orderId / beanId / beanName / qtyG / poStatus
#      ("auto_approved"|"pending"|"accepted"|"declined"|"timeout") / timeoutAt / leadTimeDays /
#      respondedAt / comment。orders.procurement[] とは同じ値を両方に持つ（表示側の都合で二重化）。

set -euo pipefail

if [ "${1:-}" = "preview" ]; then
  TABLE_NAME="siko-coffee-preview-pos"
else
  TABLE_NAME="siko-coffee-pos"
fi

REGION="ap-northeast-1"

echo "Creating table: $TABLE_NAME in $REGION"

aws dynamodb create-table \
  --table-name "$TABLE_NAME" \
  --attribute-definitions \
    AttributeName=roasterId,AttributeType=S \
    AttributeName=poKey,AttributeType=S \
    AttributeName=gsiPk,AttributeType=S \
    AttributeName=gsiSk,AttributeType=S \
  --key-schema \
    AttributeName=roasterId,KeyType=HASH \
    AttributeName=poKey,KeyType=RANGE \
  --global-secondary-indexes \
    '[{
      "IndexName": "by-status",
      "KeySchema": [
        {"AttributeName": "gsiPk", "KeyType": "HASH"},
        {"AttributeName": "gsiSk", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"}
    }]' \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION"

echo "Done: $TABLE_NAME created."
