#!/bin/bash
# DynamoDB テーブル作成スクリプト（販売者＝焙煎者：ブレンド共創プラットフォーム §11.2②）
# 使い方: bash scripts/create-roasters-table.sh [preview]
#
# 主キー: roasterId（= userId・アカウント統一）で Get/Update。
# GSI by-status:      status(HASH) + updatedAt(RANGE) … 休止/退会の運用一覧。
# GSI license-expiry: licenseGsiPk(HASH,定数 "LICENSE") + licenseExpiry(RANGE) … 許可の期限監視。
#   ※ この GSI は「許可（期限あり）」の焙煎者だけを対象にする sparse index。
#      アプリは 許可 の場合のみ item に licenseGsiPk="LICENSE" と licenseExpiry(=期限日) を書く。
#      届出（期限なし）は両属性を書かない → GSI に載らない（監視対象外で正しい）。
#   ※ 設計 §11.2 の「license.expiry」ネスト値は GSI キーに使えないため、
#      GSI 用に licenseExpiry をトップレベルへ非正規化して持つ（表示用の license{no,expiry} とは別属性）。

set -euo pipefail

if [ "${1:-}" = "preview" ]; then
  TABLE_NAME="siko-coffee-preview-roasters"
else
  TABLE_NAME="siko-coffee-roasters"
fi

REGION="ap-northeast-1"

echo "Creating table: $TABLE_NAME in $REGION"

aws dynamodb create-table \
  --table-name "$TABLE_NAME" \
  --attribute-definitions \
    AttributeName=roasterId,AttributeType=S \
    AttributeName=status,AttributeType=S \
    AttributeName=updatedAt,AttributeType=S \
    AttributeName=licenseGsiPk,AttributeType=S \
    AttributeName=licenseExpiry,AttributeType=S \
  --key-schema \
    AttributeName=roasterId,KeyType=HASH \
  --global-secondary-indexes \
    '[{
      "IndexName": "by-status",
      "KeySchema": [
        {"AttributeName": "status", "KeyType": "HASH"},
        {"AttributeName": "updatedAt", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"}
    },
    {
      "IndexName": "license-expiry",
      "KeySchema": [
        {"AttributeName": "licenseGsiPk", "KeyType": "HASH"},
        {"AttributeName": "licenseExpiry", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"}
    }]' \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION"

echo "Done: $TABLE_NAME created."
