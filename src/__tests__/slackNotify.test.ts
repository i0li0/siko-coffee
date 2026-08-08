import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as Sentry from '@sentry/nextjs'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

// 2026-08-08 の C-4 ローテーションで見つかった穴の回帰テスト。
// `SLACK_WEBHOOK_URL` を再発行したとき、値が間違っていても Slack は 403/404 を返すだけで
// `fetch` は reject しない ＝ **catch にも入らず、成功と区別が付かなかった**。
// ＝「再発行した値が正しいかを知る手段が無い」状態だった。
describe('notifySlack', () => {
  const ORIGINAL = process.env.SLACK_WEBHOOK_URL

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.SLACK_WEBHOOK_URL
    else process.env.SLACK_WEBHOOK_URL = ORIGINAL
    vi.unstubAllGlobals()
  })

  async function load() {
    return (await import('@/lib/slackNotify')).notifySlack
  }

  // 🔴 これがこの回帰テストの本体。
  it('HTTP エラー（無効な webhook）を握り潰さず Sentry に送る', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.example/invalid'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('invalid_token', { status: 403 })),
    )
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const notifySlack = await load()
    await expect(notifySlack('テスト')).resolves.toBeUndefined()

    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    expect(consoleErr).toHaveBeenCalled()
    consoleErr.mockRestore()
  })

  it('ネットワークエラーも握り潰さない', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.example/x'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const notifySlack = await load()
    await expect(notifySlack('テスト')).resolves.toBeUndefined()

    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    consoleErr.mockRestore()
  })

  it('成功時は何も鳴らさない（負の対照）', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.example/ok'
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })))

    const notifySlack = await load()
    await notifySlack('テスト')

    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  // 未設定は「想定内の失敗」として名指しで許す。dev / Vercel では空が正常で、
  // ここで鳴らすと本当に見たい失敗が埋もれる。
  it('未設定なら fetch もせず、鳴らしもしない', async () => {
    delete process.env.SLACK_WEBHOOK_URL
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const notifySlack = await load()
    await notifySlack('テスト')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  // webhook URL 自体が秘密なので、通知の中身に混ぜない。
  it('エラー内容に webhook URL を含めない', async () => {
    const url = 'https://hooks.slack.example/T000/B000/SUPERSECRETTOKEN'
    process.env.SLACK_WEBHOOK_URL = url
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('invalid_token', { status: 404 })),
    )
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const notifySlack = await load()
    await notifySlack('テスト')

    const reported = (Sentry.captureException as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Error
    expect(reported.message).not.toContain('SUPERSECRETTOKEN')
    expect(JSON.stringify(consoleErr.mock.calls)).not.toContain('SUPERSECRETTOKEN')
    consoleErr.mockRestore()
  })
})
