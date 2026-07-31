#!/usr/bin/env bash
# Pour Over の正規デプロイ手順（docs/aws-migration-feasibility.md）。
#
# 素の `sst deploy` を直接打たないこと。忘れると壊れる前後処理が3つあるため、
# ここに閉じ込めて「打てば正しい」状態にしてある。
#
#   ① npm 11 以降であることの確認
#      npm 10 だと image-optimization Lambda の sharp が wasm32 にフォールバックし、
#      next/image が無言で最適化されなくなる（それでもデプロイは成功する）。
#   ② AWS 資格情報の環境変数展開
#      `aws sts get-caller-identity` が通っても SST は落ちることがある。~/.aws/config の
#      `login_session` は aws CLI 独自の仕組みで、SST(Pulumi の Go SDK) は解釈できない。
#   ③ デプロイ後の画像最適化の検証
#      ①をすり抜けた場合の最後の網。OpenNext の installDependencies は npm install の
#      失敗をログに出すだけでビルドを止めないため、事後の機械検査が要る。
#
# 使い方:
#   npm run sst:deploy -- --stage dev
#   npm run sst:deploy -- --stage production
#
# 環境変数:
#   AWS_PROFILE  資格情報の取得元プロファイル（既定: default）
#
# CI（GitHub Actions ＋ OIDC）からも**この同じ入口を通す**。②だけは条件分岐する
# （既に環境変数へ入っているので export-credentials は不要かつ不可能）。
# CI 専用のデプロイ経路を別に作ると ①③④ が丸ごと抜けるため、分岐はここに閉じ込める。

set -euo pipefail

cd "$(dirname "$0")/.."

profile="${AWS_PROFILE:-default}"

echo "── ① ツールチェーンの確認 ──"
node scripts/check-build-toolchain.mjs

if [[ -n "${AWS_ACCESS_KEY_ID:-}" ]]; then
  # CI（GitHub Actions ＋ OIDC）では configure-aws-credentials が資格情報を
  # 既に環境変数へ入れており、~/.aws/config が無いので export-credentials は使えない。
  # SST が求めているのは「環境変数にあること」なので、その場合は ② を飛ばす。
  echo "── ② AWS 資格情報は環境変数から取得済み ──"
  echo "✓ $(aws sts get-caller-identity --query Arn --output text)"
else
  echo "── ② AWS 資格情報を環境変数へ展開（profile: ${profile}）──"
  if ! creds="$(aws configure export-credentials --profile "$profile" --format env 2>&1)"; then
    echo "✗ 資格情報を取得できませんでした（profile: ${profile}）:" >&2
    echo "$creds" >&2
    exit 1
  fi
  eval "$creds"
  : "${AWS_ACCESS_KEY_ID:?資格情報の展開に失敗しました}"
  echo "✓ 展開しました（$(aws sts get-caller-identity --query Arn --output text)）"
fi

echo "── ③ sst deploy ──"
npx sst deploy "$@"

echo "── ④ 画像最適化の検証 ──"
npm run verify:image-optimizer

echo "✓ 完了"
