#!/usr/bin/env bash
# Pour Over R-9 の一部。IAM Access Analyzer（外部アクセス）を有効にする（**冪等**）。
#
# 何を見るものか: 「アカウントの外から到達できるようになっているリソース」を
# 継続的に洗い出す。対象は S3 バケットポリシー・**Lambda のリソースベースポリシー**・
# IAM ロールの信頼ポリシー・KMS・SQS など。
#
# 🔑 **このプロジェクトにとって具体的な価値がある。** 教訓41 で踏んだのは
#    「dev の server にだけ 5（protection）以前の残骸 `FunctionURLAllowInvokeAction`
#    （`Principal:"*"`）が残っていて、そこを中継が通っていた」という事故で、
#    **8 の「dev で実測検証済み」という根拠を丸ごと無効にした**。
#    `Principal:"*"` の Lambda リソースポリシーは、まさにこの Analyzer が
#    「外部アクセスあり」として挙げる対象である。
#    ＝ **あのとき有効になっていれば、残骸は一覧に載っていた。**
#    このプロジェクトは残骸の存在を記録していたが、それが何かを通していないかは
#    見ていなかった（「残骸だから無害」は測定ではなく分類）。Analyzer は
#    その「見ていなかった側」を継続的に埋める。
#
# 💰 **外部アクセスアナライザーは無料**（課金されるのは未使用アクセス分析のほう＝
#    ここでは作らない）。
#
# 🔴 **リージョンごとに1つ要る。** Analyzer は**リージョン単位**で、そのリージョンの
#    リソースしか見ない。このアカウントは **ap-northeast-1（本体）と us-east-1
#    （Lambda@Edge のレプリカ・WAF・CloudFront 系）の両方**にリソースを持つので
#    **2つ作る**。教訓43「列挙は必ず2リージョンで回す」と同じ理由で、
#    片方だけ作ると**母集団が欠けたまま「0件だから安全」と読める**。
#
# 🔴 これは **SST の管理外**に置く。Analyzer は**アカウント/リージョン単位の単一物**で
#    ステージの持ち物ではない。sst.config.ts に入れると dev と production で
#    2つ作ろうとして衝突する（`WAF_STAGES` のような配列ガードで片方に寄せることは
#    できるが、それは「production ステージが account 全体の設定を持つ」という
#    別のねじれを生む）。`scripts/bootstrap-github-oidc.sh` と同じ整理で、
#    **教訓6（IaC 管理下を手でいじると巻き戻る）は当てはまらない**＝最初から外にある。
#
# 使い方:
#   bash scripts/bootstrap-access-analyzer.sh
#
# 前提: `aws login`（`~/.aws/config` の login_session）が有効であること。

set -euo pipefail

ANALYZER_NAME='siko-coffee-external-access'
REGIONS=(ap-northeast-1 us-east-1)

echo "── ① 資格情報の確認 ──"
# 🔴 コマンド置換を echo の中に置かない（教訓33-b: $(...) が失敗しても echo は 0 を返し、
#    ARN が空のまま "✓" だけが残る）。必ず変数に受けて成否を見る。
if ! caller="$(aws sts get-caller-identity --query 'join(` / `, [Account, Arn])' --output text)"; then
  echo "✗ 資格情報が無効です。'aws login' を実行してください。" >&2
  exit 1
fi
echo "✓ ${caller}"

for region in "${REGIONS[@]}"; do
  echo "── ② ${region} ──"

  # 既存の ACCOUNT 型アナライザーを探す。名前ではなく **type** で探すのは、
  # 名前違いで既に1つある場合に2つ目を作ろうとして失敗させないため。
  existing="$(aws accessanalyzer list-analyzers --region "$region" \
    --query "analyzers[?type=='ACCOUNT'].name | [0]" --output text)"

  if [ "$existing" != "None" ] && [ -n "$existing" ]; then
    echo "✓ 既にあります（${existing}）"
  else
    aws accessanalyzer create-analyzer --region "$region" \
      --analyzer-name "$ANALYZER_NAME" --type ACCOUNT >/dev/null
    echo "✓ 作成しました（${ANALYZER_NAME}）"
  fi
done

echo
echo "── ③ 現在の検出結果（ACTIVE のみ） ──"
# ⚠️ 作成直後は初回スキャンが終わっておらず 0 件に見える。**「0 件だから安全」と
#    読まないこと**（教訓27 と同型: 作れたことは、見えていることの証明ではない）。
#    数分おいてから再実行するか、下のコマンドを直接叩いて確認する。
for region in "${REGIONS[@]}"; do
  arn="$(aws accessanalyzer list-analyzers --region "$region" \
    --query "analyzers[?type=='ACCOUNT'].arn | [0]" --output text)"
  n="$(aws accessanalyzer list-findings-v2 --region "$region" --analyzer-arn "$arn" \
    --filter '{"status":{"eq":["ACTIVE"]}}' --query 'length(findings)' --output text 2>/dev/null || echo '?')"
  printf "  %-16s ACTIVE=%s\n" "$region" "$n"
done

echo
echo "📌 再確認するとき:"
echo "  for r in ap-northeast-1 us-east-1; do"
echo "    arn=\$(aws accessanalyzer list-analyzers --region \$r --query \"analyzers[?type=='ACCOUNT'].arn | [0]\" --output text)"
echo "    aws accessanalyzer list-findings-v2 --region \$r --analyzer-arn \"\$arn\" \\"
echo "      --filter '{\"status\":{\"eq\":[\"ACTIVE\"]}}' \\"
echo "      --query 'findings[].[resourceType,resource]' --output text"
echo "  done"
