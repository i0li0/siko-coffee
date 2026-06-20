import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { DynamoDBAdapter } from '@auth/dynamodb-adapter'
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { compare } from 'bcryptjs'
import { TABLE } from './db'
import { randomPresetId } from './avatars'

interface ExtendedUser {
  hashedPassword?: string
  emailVerified?: Date | null
  avatarPreset?: string | null
  avatarUrl?: string | null
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
      async authorize(credentials) {
        const rawEmail = credentials?.email as string | undefined
        const password = credentials?.password as string | undefined
        if (!rawEmail || !password) return null
        const email = rawEmail.toLowerCase().trim()

        const user = await adapter.getUserByEmail!(email)
        if (!user) return null

        const item = user as typeof user & ExtendedUser
        if (!item.hashedPassword) return null

        const valid = await compare(password, item.hashedPassword)
        if (!valid) return null

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
