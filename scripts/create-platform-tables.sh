#!/bin/bash
# ブレンド共創プラットフォームのテーブルを一括作成（§11 / §13）
# 使い方: bash scripts/create-platform-tables.sh [preview]
#
# 新設6テーブル + 既存 blends への GSI 追加をまとめて実行する。
# 各スクリプトは冪等ではない（既存テーブルには ResourceInUseException で失敗する）ので、
# 途中まで作成済みの場合は失敗したテーブルの行を個別に実行し直すこと。
#
# 注記:
#  - 既存 orders への range key 付き GSI（userId+createdAt）は当面不要（§11.2⑥）。
#    当面は既存 userId-index Query＋クライアント側ソートで足りるため、ここでは追加しない。
#  - 既存 inventory は触らない（現行ショップ在庫として温存・§11.0）。ロットは create-lots-table.sh。

set -euo pipefail

ENV_ARG="${1:-}"   # "" (本番) or "preview"
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Creating platform tables (${ENV_ARG:-production}) ==="

bash "$DIR/create-roasters-table.sh"         "$ENV_ARG"
bash "$DIR/create-beans-table.sh"            "$ENV_ARG"
bash "$DIR/create-lots-table.sh"             "$ENV_ARG"
bash "$DIR/create-reservations-table.sh"     "$ENV_ARG"
bash "$DIR/create-roaster-metrics-table.sh"  "$ENV_ARG"
bash "$DIR/create-subscriptions-table.sh"    "$ENV_ARG"
bash "$DIR/create-pos-table.sh"              "$ENV_ARG"
bash "$DIR/add-blends-list-index.sh"         "$ENV_ARG"

echo "=== All platform table operations dispatched (${ENV_ARG:-production}) ==="
echo "Note: GSI/TTL は非同期。'aws dynamodb describe-table' で ACTIVE を確認してから利用開始すること。"
echo "Note: blends の GSI list-index は gsiPk/gsiSk のバックフィルが別途必要（add-blends-list-index.sh 参照）。"
