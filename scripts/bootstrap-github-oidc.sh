#!/usr/bin/env bash
# Pour Over 9.5 の AWS 側の前提作業（**1度だけ**実行する）。
#
# ci.yml の deploy ジョブが引き受けるロールを作る。GitHub の OIDC プロバイダを
# 信頼して都度 STS の一時資格情報を発行させる＝**静的な AWS キーを増やさない**
# （パリティ表の項目12と同じ方向）。
#
# 🔴 これは **SST の管理外**に置いてある。sst.config.ts に入れると
#    「CI がデプロイするスタックが、その CI 自身のロールを管理する」という循環になり、
#    デプロイに失敗したときに CI がデプロイし直せなくなる。教訓6（IaC 管理下のものを
#    手でいじると次の deploy で巻き戻る）は SST が作ったリソースの話で、
#    ここは最初から SST の外なので当てはまらない。
#
# 使い方:
#   bash scripts/bootstrap-github-oidc.sh
#
# 前提: `aws login`（`~/.aws/config` の login_session）が有効であること。
#       リポジトリ変数の登録まで自動でやりたい場合は gh CLI も。

set -euo pipefail

REPO='i0li0/siko-coffee'
ROLE_NAME='siko-coffee-github-deploy'
PROVIDER_HOST='token.actions.githubusercontent.com'
# 🔴 main への push だけに限定する。ブランチを絞らないと、fork や任意のブランチの
#    ワークフローから本番アカウントの Administrator を引き受けられてしまう。
SUBJECT="repo:${REPO}:ref:refs/heads/main"

echo "── ① 資格情報の確認 ──"
account="$(aws sts get-caller-identity --query Account --output text)"
echo "✓ アカウント ${account}（$(aws sts get-caller-identity --query Arn --output text)）"

provider_arn="arn:aws:iam::${account}:oidc-provider/${PROVIDER_HOST}"

echo "── ② OIDC プロバイダ ──"
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$provider_arn" >/dev/null 2>&1; then
  echo "✓ 既にあります（${provider_arn}）"
else
  # thumbprint-list は現在の IAM では GitHub の OIDC に対して実質使われない
  # （AWS が信頼済みルート CA で検証する）が、API が必須項目として要求するため渡す。
  aws iam create-open-id-connect-provider \
    --url "https://${PROVIDER_HOST}" \
    --client-id-list 'sts.amazonaws.com' \
    --thumbprint-list '6938fd4d98bab03faadb97b34396831e3780aea1' >/dev/null
  echo "✓ 作成しました（${provider_arn}）"
fi

echo "── ③ 信頼ポリシー ──"
trust="$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Federated": "${provider_arn}" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "${PROVIDER_HOST}:aud": "sts.amazonaws.com",
          "${PROVIDER_HOST}:sub": "${SUBJECT}"
        }
      }
    }
  ]
}
JSON
)"

if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  aws iam update-assume-role-policy --role-name "$ROLE_NAME" --policy-document "$trust"
  echo "✓ 既存ロールの信頼ポリシーを更新しました（${ROLE_NAME}）"
else
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    `# IAM の description は Latin-1 しか受け付けない（日本語は ValidationError）` \
    --description 'Pour Over 9.5: role assumed by GitHub Actions to run sst deploy' \
    --max-session-duration 3600 \
    --assume-role-policy-document "$trust" >/dev/null
  echo "✓ 作成しました（${ROLE_NAME}）"
fi

echo "── ④ 権限 ──"
# SST/Pulumi は Lambda・CloudFront・S3・IAM・WAF・Scheduler・ACM・Route53 まで
# 広範に触るため、絞ると 13（本番切替）で AccessDenied が連発して切り分け不能になる。
# 防御は権限の狭さではなく **信頼ポリシー側**（main ブランチのみ・静的キーなし）に寄せる。
aws iam attach-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-arn 'arn:aws:iam::aws:policy/AdministratorAccess'
echo "✓ AdministratorAccess を付与しました"

role_arn="arn:aws:iam::${account}:role/${ROLE_NAME}"

echo "── ⑤ リポジトリ変数 ──"
if command -v gh >/dev/null 2>&1; then
  gh variable set AWS_DEPLOY_ROLE_ARN --repo "$REPO" --body "$role_arn"
  echo "✓ AWS_DEPLOY_ROLE_ARN を登録しました"
else
  echo "gh CLI が無いので手動で登録してください:"
  echo "  gh variable set AWS_DEPLOY_ROLE_ARN --repo ${REPO} --body '${role_arn}'"
fi

echo
echo "✓ 完了: ${role_arn}"
