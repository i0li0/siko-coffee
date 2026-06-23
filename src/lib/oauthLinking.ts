/**
 * OAuth サインインの可否判定（純関数）。
 *
 * NextAuth の signIn callback から呼ぶ。DB アクセスは呼び出し側（auth.ts）で行い、
 * 判定に必要な値だけを渡すことで、NextAuth を起動せず単体テストできるようにする。
 *
 * セキュリティ方針（[[user-auth-plan]] Phase 3 / [[security-backlog]]）:
 * - プロバイダ側でメール所有が検証されていない OAuth は拒否（なりすまし防止）。
 * - 本システムはメールキー設計（GSI1=USER#email）のためメール必須。
 * - **既存アカウントへのリンクは「確認済みアカウントのみ」許可**。未確認の既存
 *   Credentials アカウントへ自動リンクすると pre-account-hijacking を招くため拒否する
 *   （攻撃者が被害者のメールで未確認登録→被害者の OAuth ログインで乗っ取り、を防ぐ）。
 */

export interface OAuthSignInInput {
  provider: string
  /** プロバイダ側でメール所有が検証済みか（Google: email_verified / LINE: email の有無） */
  providerEmailVerified: boolean
  /** プロバイダから取得したメール（正規化前で可。空・null は「無し」扱い） */
  email: string | null | undefined
  /** 同一メールの既存ユーザーが存在するか */
  existingUserExists: boolean
  /** 既存ユーザーの emailVerified（居なければ無視される） */
  existingUserEmailVerified: Date | string | null | undefined
}

export type OAuthSignInReason = 'provider_unverified' | 'no_email' | 'link_unverified'

export type OAuthSignInDecision =
  | { ok: true }
  | { ok: false; reason: OAuthSignInReason }

export function decideOAuthSignIn(input: OAuthSignInInput): OAuthSignInDecision {
  // プロバイダがメール所有を検証していない → なりすまし防止のため拒否
  if (!input.providerEmailVerified) return { ok: false, reason: 'provider_unverified' }

  // メール必須（メールキー設計のため）
  if (!input.email || !input.email.trim()) return { ok: false, reason: 'no_email' }

  // 新規ユーザーはアダプタが作成 → 許可
  if (!input.existingUserExists) return { ok: true }

  // 既存アカウントへのリンクは確認済みのみ許可（未確認への自動リンクは乗っ取り経路）
  if (!input.existingUserEmailVerified) return { ok: false, reason: 'link_unverified' }

  return { ok: true }
}
