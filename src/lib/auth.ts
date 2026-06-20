import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { DynamoDBAdapter } from '@auth/dynamodb-adapter'
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { compare } from 'bcryptjs'
import { TABLE } from './db'

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
        const email = credentials?.email as string | undefined
        const password = credentials?.password as string | undefined
        if (!email || !password) return null

        const user = await adapter.getUserByEmail!(email)
        if (!user) return null

        const item = user as typeof user & { hashedPassword?: string }
        if (!item.hashedPassword) return null

        const valid = await compare(password, item.hashedPassword)
        if (!valid) return null

        return { id: user.id, email: user.email, name: user.name }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string
      }
      return session
    },
  },
})
