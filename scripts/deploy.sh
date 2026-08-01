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
#      `sst secret set` など**この入口を通らないコマンド**を打つときは、同じ展開を手で
#      やることになる（`eval "$(aws configure export-credentials --format env)"`）。
#      手で展開したものは**そのシェルに残しっぱなしにしないこと**。期限切れになっても
#      変数は居座り、`aws` 単体は profile で通るのに SST だけ ExpiredTokenException で
#      落ちる、という誤診しやすい状態になる（2026-08-01 に発生）。
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
# CI（GitHub Actions ＋ OIDC）からも**この同じ入口を通す**。②だけは GITHUB_ACTIONS /
# CI の有無で分岐する（既に環境変数へ入っているので export-credentials は不要かつ不可能）。
# CI 専用のデプロイ経路を別に作ると ①③④ が丸ごと抜けるため、分岐はここに閉じ込める。

set -euo pipefail

cd "$(dirname "$0")/.."

profile="${AWS_PROFILE:-default}"

echo "── ① ツールチェーンの確認 ──"
node scripts/check-build-toolchain.mjs

# 分岐の条件は「CI かどうか」。「AWS_ACCESS_KEY_ID が入っているか」では分岐できない。
# 手で展開した資格情報は期限切れ後もシェルに居座るため、旧条件はそれを CI と同じ枝へ流し、
# 腐った値のまま sst deploy に渡していた（冒頭 ② の注意書きを参照）。
# GitHub Actions では GITHUB_ACTIONS が必ず入る。CI 側は ~/.aws/config が無く
# export-credentials を使えないので、CI では確実にこの枝へ入る必要がある。
if [[ -n "${GITHUB_ACTIONS:-}" || -n "${CI:-}" ]]; then
  # CI（GitHub Actions ＋ OIDC）では configure-aws-credentials が資格情報を
  # 既に環境変数へ入れている。SST が求めているのは「環境変数にあること」なので展開は不要。
  echo "── ② AWS 資格情報は環境変数から取得済み（CI）──"
  # 🔴 `echo "✓ $(aws sts ...)"` と書かないこと。終了ステータスが echo のものになり、
  #    認証できていなくても ✓ を出して次へ進む（教訓23 と同じ取り違え）。
  if ! arn="$(aws sts get-caller-identity --query Arn --output text)"; then
    echo "✗ 環境変数の資格情報で認証できませんでした。" >&2
    exit 1
  fi
  echo "✓ ${arn}"
else
  echo "── ② AWS 資格情報を環境変数へ展開（profile: ${profile}）──"
  # 手動展開の残骸を必ず捨ててから取り直す。残したまま上書きすると、例えば静的キーの
  # profile を展開したときに古い AWS_SESSION_TOKEN だけが残って認証が通らなくなる。
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_CREDENTIAL_EXPIRATION
  if ! creds="$(aws configure export-credentials --profile "$profile" --format env 2>&1)"; then
    echo "✗ 資格情報を取得できませんでした（profile: ${profile}）:" >&2
    echo "$creds" >&2
    exit 1
  fi
  eval "$creds"
  : "${AWS_ACCESS_KEY_ID:?資格情報の展開に失敗しました}"
  if ! arn="$(aws sts get-caller-identity --query Arn --output text)"; then
    echo "✗ 展開した資格情報で認証できませんでした（profile: ${profile}）。" >&2
    exit 1
  fi
  echo "✓ 展開しました（${arn}${AWS_CREDENTIAL_EXPIRATION:+ / 期限 ${AWS_CREDENTIAL_EXPIRATION}}）"
fi

echo "── ③ sst deploy ──"
npx sst deploy "$@"

echo "── ④ 画像最適化の検証 ──"
npm run verify:image-optimizer

echo "✓ 完了"
