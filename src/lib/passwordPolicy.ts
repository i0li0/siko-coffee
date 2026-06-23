import { createHash } from 'crypto'

// パスワード強度ポリシーと流出チェックの共通ロジック。
// 新規登録 / パスワード再設定の両方から利用する。

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 72 // bcrypt の上限（72バイト超は切り捨てられるため）

// よくある弱いパスワード。総当たり辞書の上位を最低限カバーする。
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwerty', 'qwertyui', 'qwerty123', 'abc12345', 'iloveyou', 'admin123',
  'welcome', 'welcome1', 'letmein', 'monkey', 'dragon', 'sunshine',
  'princess', 'football', 'baseball', 'passw0rd', 'p@ssw0rd', 'trustno1',
  '11111111', '00000000', 'aaaaaaaa', 'asdfghjk', 'zxcvbnm', '87654321',
])

export interface PasswordContext {
  email?: string
  name?: string | null
}

// ネットワークに依存しない同期的な強度検証。
export function validatePasswordStrength(password: string, ctx: PasswordContext = {}): { ok: boolean; error?: string } {
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return { ok: false, error: `パスワードは${PASSWORD_MIN}〜${PASSWORD_MAX}文字で入力してください` }
  }

  const lower = password.toLowerCase()

  if (COMMON_PASSWORDS.has(lower)) {
    return { ok: false, error: 'このパスワードは一般的すぎます。別のものを設定してください' }
  }

  // 同一文字の繰り返しのみ（例: "aaaaaaaa"）を拒否。
  if (/^(.)\1+$/.test(password)) {
    return { ok: false, error: 'このパスワードは単純すぎます。別のものを設定してください' }
  }

  // メールのローカル部・名前を含むパスワードを拒否（推測されやすいため）。
  const localPart = ctx.email?.split('@')[0]?.toLowerCase()
  if (localPart && localPart.length >= 3 && lower.includes(localPart)) {
    return { ok: false, error: 'メールアドレスを含むパスワードは使用できません' }
  }
  const name = ctx.name?.trim().toLowerCase()
  if (name && name.length >= 3 && lower.includes(name)) {
    return { ok: false, error: '名前を含むパスワードは使用できません' }
  }

  return { ok: true }
}

// HIBP Pwned Passwords の range API（k-匿名性）で流出済みパスワードを判定する。
// SHA-1 ハッシュの先頭5文字のみを送信し、平文・完全ハッシュは外部に渡さない。
// 外部障害時はフェイルオープン（false）として登録/再設定を止めない。
export async function isPasswordBreached(password: string): Promise<boolean> {
  try {
    const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase()
    const prefix = sha1.slice(0, 5)
    const suffix = sha1.slice(5)

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      // Add-Padding でレスポンス長から件数を推測されるのを防ぐ。
      headers: { 'Add-Padding': 'true' },
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return false
    const body = await res.text()
    for (const line of body.split('\n')) {
      const [hashSuffix, count] = line.split(':')
      if (hashSuffix?.trim().toUpperCase() === suffix && Number(count) > 0) {
        return true
      }
    }
    return false
  } catch {
    return false
  }
}

// 強度検証 + 流出チェックをまとめて行う。登録・再設定の共通入口。
export async function checkPassword(password: string, ctx: PasswordContext = {}): Promise<{ ok: boolean; error?: string }> {
  const strength = validatePasswordStrength(password, ctx)
  if (!strength.ok) return strength

  if (await isPasswordBreached(password)) {
    return { ok: false, error: 'このパスワードは過去の漏洩データで確認されています。別のものを設定してください' }
  }

  return { ok: true }
}
