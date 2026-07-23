#!/bin/bash
# DynamoDB テーブル作成スクリプト（計測ロールアップ＝n再調整の根拠 §11.2⑦）
# 使い方: bash scripts/create-roaster-metrics-table.sh [preview]
#
# 主キー: roasterId(HASH) + month(RANGE, yyyy-mm) ＝ 月次ロールアップ。GSI不要（PK/SK直引き Get のみ）。
#   ※ 主要属性（キー外・定義不要）: gmvYen / orderCount / lostCount / purchasedG / soldG / wastedG。
#      注文paid・ロット廃棄・返金の各イベントで原子 ADD（集計Scan不要）。
#      実廃棄率=wasted/purchased・失注率=lost/(orders+lost)・月次GMV=gmvYen。§6.3 の運用パラメータ再調整もこの表を見る。

set -euo pipefail

if [ "${1:-}" = "preview" ]; then
  TABLE_NAME="siko-coffee-preview-roaster-metrics"
else
  TABLE_NAME="siko-coffee-roaster-metrics"
fi

REGION="ap-northeast-1"

echo "Creating table: $TABLE_NAME in $REGION"

aws dynamodb create-table \
  --table-name "$TABLE_NAME" \
  --attribute-definitions \
    AttributeName=roasterId,AttributeType=S \
    AttributeName=month,AttributeType=S \
  --key-schema \
    AttributeName=roasterId,KeyType=HASH \
    AttributeName=month,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION"

echo "Done: $TABLE_NAME created."
