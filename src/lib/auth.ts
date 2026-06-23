import NextAuth, { CredentialsSignin } from 'next-auth'
import type { User } from 'next-auth'
import type { AdapterUser } from 'next-auth/adapters'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import Line from 'next-auth/providers/line'
import { DynamoDBAdapter } from '@auth/dynamodb-adapter'
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { compare } from 'bcryptjs'
import { TABLE } from './db'
import { randomPresetId } from './avatars'
import { getClientIp } from './rateLimit'
import { checkLoginAllowed, recordLoginFailure, clearLoginFailures } from './userLoginRateLimit'
import { decideOAuthSignIn } from './oauthLinking'

interface ExtendedUser {
  hashedPassword?: string
  emailVerified?: Date | null
  avatarPreset?: string | null
  avatarUrl?: string | null
}

// OAuth プロバイダはメール検証済みのアカウントにのみ自動リンクする（signIn callback で制御）。
// allowDangerousEmailAccountLinking は単体では危険だが、下の signIn guard で
// 「プロバイダ検証済み ∧ 既存が確認済み or 新規」のときだけ許可するため安全側に倒している。
const oauthEnabled = {
  google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  line: Boolean(process.env.LINE_CLIENT_ID && process.env.LINE_CLIENT_SECRET),
}

// authorize から throw すると `code` がクライアントの signIn 結果まで伝搬する
// （@auth/core が error=CredentialsSignin&code=<code> として返す）。
// UI 側で「未確認」「ロック中」を区別して案内するために専用コードを付与する。
class RateLimitedSignin extends CredentialsSignin {
  code = 'rate_limited'
}
class EmailNotVerifiedSignin extends CredentialsSignin {
  code = 'email_not_verified'
}

const dynamoClient = DynamoDBDocument.from(
  new DynamoDBClient({ region: 'ap-northeast-1' }),
  { marshallOptions: { removeUndefinedValues: true } }
)

const adapter = DynamoDBAdapter(dynamoClient, {
  tableName: TABLE.AUTH,
})

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, request) {
        const rawEmail = credentials?.email as string | undefined
        const password = credentials?.password as string | undefined
        if (!rawEmail || !password) return null
        const email = rawEmail.toLowerCase().trim()
        const ip = getClientIp((request as Request | undefined)?.headers ?? new Headers())

        // ① ロックアウト判定（IP 別・メール別）。総当たり中はパスワード検証前に弾く。
        const { allowed } = await checkLoginAllowed(ip, email)
        if (!allowed) throw new RateLimitedSignin()

        const user = await adapter.getUserByEmail!(email)
        const item = user as (typeof user & ExtendedUser) | null
        if (!user || !item?.hashedPassword) {
          await recordLoginFailure(ip, email)
          return null
        }

        const valid = await compare(password, item.hashedPassword)
        if (!valid) {
          await recordLoginFailure(ip, email)
          return null
        }

        // パスワードが正しければ失敗カウンタをクリア（正規ユーザーを誤ロックしない）。
        await clearLoginFailures(ip, email)

        // ② メール未確認はログイン拒否。UI で確認メール再送へ誘導する。
        if (!item.emailVerified) throw new EmailNotVerifiedSignin()

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: item.emailVerified ?? null,
          avatarPreset: item.avatarPreset ?? randomPresetId(),
          avatarUrl: item.avatarUrl ?? null,
        }
      },
    }),
    // 環境変数が無い環境（ローカル/CI）ではプロバイダを登録しない。
    ...(oauthEnabled.google
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true,
            profile(profile) {
              return {
                id: profile.sub,
                name: profile.name,
                email: profile.email,
                image: profile.picture,
                // Google は email_verified を返す。検証済みなら確定扱い。
                emailVerified: profile.email_verified ? new Date() : null,
                avatarPreset: randomPresetId(),
              } as User
            },
          }),
        ]
      : []),
    ...(oauthEnabled.line
      ? [
          Line({
            clientId: process.env.LINE_CLIENT_ID,
            clientSecret: process.env.LINE_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true,
            profile(profile) {
              return {
                id: profile.sub,
                name: profile.name,
                email: profile.email ?? null,
                image: profile.picture,
                // LINE は email スコープ許諾時のみ email を返す。その場合は検証済み扱い。
                emailVerified: profile.email ? new Date() : null,
                avatarPreset: randomPresetId(),
              } as User
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    // OAuth のアカウントリンク制御。Credentials は authorize 内で検証済みなので素通り。
    async signIn({ user, account, profile }) {
      if (!account || account.type !== 'oauth') return true

      const p = profile as { email?: string; email_verified?: boolean } | undefined
      const email = (user.email ?? p?.email ?? '').toLowerCase().trim()
      const providerEmailVerified =
        account.provider === 'google'
          ? p?.email_verified === true
          : account.provider === 'line'
            ? Boolean(p?.email)
            : false

      const existing = email ? await adapter.getUserByEmail!(email) : null
      const decision = decideOAuthSignIn({
        provider: account.provider,
        providerEmailVerified,
        email,
        existingUserExists: Boolean(existing),
        existingUserEmailVerified: (existing as (typeof existing & ExtendedUser) | null)?.emailVerified ?? null,
      })

      // 拒否時は理由付きで /login に戻し、UI で具体的に案内する。
      if (!decision.ok) return `/login?error=oauth_${decision.reason}`
      return true
    },
    async jwt({ token, user, account, trigger }) {
      if (user) {
        token.id = user.id
        token.emailVerified = (user as typeof user & ExtendedUser).emailVerified ?? null
        token.avatarPreset = (user as typeof user & ExtendedUser).avatarPreset ?? null
        token.avatarUrl = (user as typeof user & ExtendedUser).avatarUrl ?? null
      }

      // OAuth 初回ログイン: signIn guard を通過＝プロバイダ検証済みなので
      // emailVerified / avatarPreset を確定し DB にも反映する（Credentials 経路と整合）。
      if (account?.type === 'oauth' && user) {
        const ext = user as typeof user & ExtendedUser
        const patch: Record<string, unknown> = { id: user.id }
        let dirty = false
        if (!ext.emailVerified) {
          const now = new Date()
          token.emailVerified = now
          patch.emailVerified = now
          dirty = true
        }
        if (!ext.avatarPreset) {
          const preset = randomPresetId()
          token.avatarPreset = preset
          patch.avatarPreset = preset
          dirty = true
        }
        if (dirty) {
          try {
            await adapter.updateUser!(patch as Partial<AdapterUser> & { id: string })
          } catch {
            // 反映失敗時もセッションは発行（次回ログイン時に自己修復される）
          }
        }
      }

      if (token.id && trigger !== 'signIn') {
        const dbUser = await adapter.getUser!(token.id as string) as (typeof user & ExtendedUser) | null
        if (dbUser) {
          if (!token.emailVerified && dbUser.emailVerified) {
            token.emailVerified = dbUser.emailVerified
          }
          token.avatarPreset = dbUser.avatarPreset ?? token.avatarPreset
          token.avatarUrl = dbUser.avatarUrl ?? token.avatarUrl
        }
      }
      return token
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string
        const ext = session.user as typeof session.user & { emailVerified?: Date | null; avatarPreset?: string | null; avatarUrl?: string | null }
        ext.emailVerified = token.emailVerified ? new Date(token.emailVerified as string) : null
        ext.avatarPreset = (token.avatarPreset as string) ?? null
        ext.avatarUrl = (token.avatarUrl as string) ?? null
      }
      return session
    },
  },
})
