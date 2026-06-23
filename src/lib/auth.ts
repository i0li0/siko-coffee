import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { DynamoDBAdapter } from '@auth/dynamodb-adapter'
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { compare } from 'bcryptjs'
import { TABLE } from './db'
import { randomPresetId } from './avatars'
import { getClientIp } from './rateLimit'
import { checkLoginAllowed, recordLoginFailure, clearLoginFailures } from './userLoginRateLimit'

interface ExtendedUser {
  hashedPassword?: string
  emailVerified?: Date | null
  avatarPreset?: string | null
  avatarUrl?: string | null
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
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id
        token.emailVerified = (user as typeof user & ExtendedUser).emailVerified ?? null
        token.avatarPreset = (user as typeof user & ExtendedUser).avatarPreset ?? null
        token.avatarUrl = (user as typeof user & ExtendedUser).avatarUrl ?? null
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
