import { NextRequest, NextResponse } from 'next/server'
import { generateSecret, verifySync } from 'otplib'
import QRCode from 'qrcode'
import { verifyAdminSession } from '@/lib/adminAuth'

export async function GET() {
  const denied = await verifyAdminSession()
  if (denied) return denied

  const secret = generateSecret()
  const otpauthUrl =
    `otpauth://totp/${encodeURIComponent('Sikō Coffee:admin')}` +
    `?secret=${secret}&issuer=${encodeURIComponent('Sikō Coffee')}`
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl)

  return NextResponse.json({ secret, qrCodeDataUrl })
}

export async function POST(request: NextRequest) {
  const denied = await verifyAdminSession()
  if (denied) return denied

  const { secret, code } = await request.json()

  if (!secret || !code) {
    return NextResponse.json({ error: 'secret and code are required' }, { status: 400 })
  }

  const result = verifySync({ token: String(code), secret })
  if (!result.valid) {
    return NextResponse.json({ error: '認証コードが違います' }, { status: 400 })
  }

  return NextResponse.json({ ok: true, secret })
}
