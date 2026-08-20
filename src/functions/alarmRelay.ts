// CloudWatch アラームの通知中継 Lambda（Pour Over 10）。
//
// CloudWatch Alarm → SNS トピック → **この関数** → Slack Incoming Webhook。
//
// 🔑 **なぜ SNS のメール購読ではなく Lambda なのか**
// メール購読は購読確認リンクのクリックが要る＝ IaC で完結せず、`sst deploy` の後に
// 手作業が1回挟まる（しかもステージを作り直すたびに再発する）。加えて通知先が
// メールだけになり、既にフィードバック通知が流れている Slack と分断される。
// Lambda 経由なら全部 sst.config.ts の中で閉じ、教訓6（IaC 管理下のものを
// コンソールで触らない）を崩さずに済む。
//
// 🔑 **なぜ `src/lib/slackNotify.ts` を使い回さないのか**
// あれは Next 側のコードで、この関数は node 組み込み以外に依存しない方針
// （cronRelay.ts と同じ理由）。加えて `notifySlack()` は **失敗を握り潰し
// `r.ok` も見ない**。ユーザー操作をブロックしない目的ではそれで正しいが、
// **アラートの中継でそれをやると「鳴ったのに届かない」が無言で起きる**。
// ここでは逆に、送れなかったら**必ず例外にする**（下記）。
//
// 🔴 **既知の死角: この関数自身が壊れると、その事実を知らせる経路も同時に死ぬ。**
// AlarmRelay の Errors にもアラームを張ってあるが、その通知もこの関数を通る。
// ただし無意味ではない — 一過性の失敗（Slack 側の 5xx・スロットル）なら次の
// 呼び出しで復旧し、遅れて届く。**恒久的な故障は CloudWatch の Errors を
// 自分で見に行くまで分からない**。これは cronRelay が Sentry に出ないのと同種の
// 「中継自身は中継できない」問題で、構造上ここでは解けない。
//   → 実運用では月1回でも `aws cloudwatch describe-alarms --state-value ALARM` を
//     見る習慣で補う（14 の soak 中の点検項目）。

/** CloudWatch Alarm が SNS に流す本文。必要な分だけ。 */
interface CloudWatchAlarmMessage {
  AlarmName?: string;
  AlarmDescription?: string | null;
  NewStateValue?: string;
  OldStateValue?: string;
  NewStateReason?: string;
  StateChangeTime?: string;
  Region?: string;
  AlarmArn?: string;
  Trigger?: {
    Namespace?: string;
    MetricName?: string;
    Statistic?: string;
    Period?: number;
    Threshold?: number;
    ComparisonOperator?: string;
  };
}

/**
 * SES の設定セットが SNS に流すイベント本文（R-5）。必要な分だけ。
 *
 * 🔑 **`Reputation.*` のアラーム（10 の⑥⑦）とは見ているものが違う。**
 * あちらは**アカウント全体の率**で「もう手遅れに近い」ことしか教えない。
 * こちらは**1通ごと**で、どの宛先がなぜ弾かれたかが分かる。
 * ＝ 検知（率）と診断（個別）は別の投資（教訓44 と同じ整理）。
 */
interface SesEventMessage {
  eventType?: string;
  mail?: {
    timestamp?: string;
    source?: string;
    messageId?: string;
    destination?: string[];
  };
  bounce?: {
    bounceType?: string;
    bounceSubType?: string;
    bouncedRecipients?: { emailAddress?: string; diagnosticCode?: string }[];
  };
  complaint?: {
    complaintFeedbackType?: string;
    complainedRecipients?: { emailAddress?: string }[];
  };
  reject?: { reason?: string };
  deliveryDelay?: { delayType?: string };
  failure?: { errorMessage?: string };
}

interface SnsEventRecord {
  Sns?: {
    Message?: string;
    Subject?: string | null;
    Timestamp?: string;
  };
}

export interface AlarmRelayEvent {
  Records?: SnsEventRecord[];
}

const PREFIX = '[alarm] relay';

// Slack 側の一時的な失敗で取りこぼさないための再試行。SNS も Lambda 失敗時に
// 再試行するが（既定2回）、そちらは**数十秒〜数分空く**ので、まず自前で詰める。
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 300;

const STATE_MARK: Record<string, string> = {
  ALARM: '🔴 ALARM',
  OK: '✅ OK',
  INSUFFICIENT_DATA: '⚠️ INSUFFICIENT_DATA',
};

/**
 * 鳴ったときに「どう引くか」を通知そのものに入れる（教訓58）。
 *
 * 🔴 **なぜ要るのか。** R-4 の CloudFront アクセスログは 2026-08-03 から動いていたのに、
 * **17日間一度も引かれなかった**。その間に未知の障害が2件（08-13 のスキャナ・08-17 の
 * Instagram 署名URL失効）記録されたまま放置され、08-20 に至っては調査の初手で
 * 「アクセスログが無い」と誤結論している。**入れっぱなしの診断は静かに腐る。**
 *
 * 🔑 **対処は「人が思い出す」ではなく「検知の隣に置く」。** 鳴った瞬間に届く文面に
 * そのまま貼れるクエリが入っていれば、引くまでの距離が0になる。
 *
 * 📌 ここには**実際に踏んだ罠だけ**を書く。一般論を足すと文面が伸びて読まれなくなる。
 */
function investigationHint(alarmName: string, stage: string): string | undefined {
  if (alarmName.endsWith('-cloudfront-5xx')) {
    return [
      `🔎 原因を引く（Logs Insights / *us-east-1* / \`siko-${stage}-cloudfront-access-logs\`）`,
      '```',
      'fields @timestamp, `sc-status`, `cs-method`, `cs-uri-stem`, `x-edge-detailed-result-type`, `c-ip`, `cs(User-Agent)`',
      '| filter `sc-status` >= 500',
      '| sort @timestamp asc | limit 50',
      '```',
      '🔴 `filter-log-events` はハイフン入りフィールドを弾く＝Insights でバッククォート。' +
        'UA は `cs(User-Agent)`（`cs-user-agent` という名前は**無い**）。',
    ].join('\n');
  }

  if (alarmName.endsWith('-errors') || alarmName.endsWith('-throttles')) {
    return [
      '🔎 該当 Lambda のログを探す',
      '```',
      `aws logs describe-log-groups --log-group-name-prefix /aws/lambda/siko-coffee-${stage}`,
      '```',
      '🔴 SST のロググループ名は関数名と**接尾辞が違う**。`/aws/lambda/<関数名>` を' +
        '組み立てると `ResourceNotFoundException` になるので、必ず prefix で探す。',
    ].join('\n');
  }

  return undefined;
}

function formatAlarm(alarm: CloudWatchAlarmMessage, stage: string): string {
  const state = alarm.NewStateValue ?? 'UNKNOWN';
  const mark = STATE_MARK[state] ?? `❔ ${state}`;
  const trigger = alarm.Trigger

  const lines = [
    `${mark} *${alarm.AlarmName ?? '(no name)'}*  _[${stage}]_`,
  ]

  if (alarm.AlarmDescription) lines.push(alarm.AlarmDescription)
  if (alarm.NewStateReason) lines.push('```' + alarm.NewStateReason + '```')

  const meta: string[] = []
  if (trigger?.Namespace && trigger?.MetricName) {
    meta.push(`metric: ${trigger.Namespace}/${trigger.MetricName}`)
  }
  if (alarm.OldStateValue) meta.push(`from: ${alarm.OldStateValue}`)
  if (alarm.Region) meta.push(`region: ${alarm.Region}`)
  if (alarm.StateChangeTime) meta.push(`at: ${alarm.StateChangeTime}`)
  if (meta.length > 0) lines.push(meta.join(' | '))

  // 🔑 調べ方は **ALARM のときだけ**付ける。復旧(OK)にも付けると、
  //    通知の半分が定型文になって**肝心のときに読み飛ばされる**。
  if (state === 'ALARM') {
    const hint = investigationHint(alarm.AlarmName ?? '', stage)
    if (hint) lines.push(hint)
  }

  return lines.join('\n')
}

const SES_MARK: Record<string, string> = {
  bounce: '📮 BOUNCE',
  complaint: '🚩 COMPLAINT',
  reject: '⛔ REJECT',
  deliverydelay: '🕒 DELIVERY DELAY',
  renderingfailure: '💥 RENDERING FAILURE',
};

function formatSesEvent(ev: SesEventMessage, stage: string): string {
  const type = ev.eventType ?? 'unknown';
  const mark = SES_MARK[type.toLowerCase().replace(/[^a-z]/g, '')] ?? `📧 ${type.toUpperCase()}`;

  const lines = [`${mark} *SES*  _[${stage}]_`];

  // 🔑 **いちばん知りたいのは「どの宛先が」**。率のアラームには出ない情報。
  const recipients =
    ev.bounce?.bouncedRecipients?.map((r) => r.emailAddress).filter(Boolean) ??
    ev.complaint?.complainedRecipients?.map((r) => r.emailAddress).filter(Boolean) ??
    ev.mail?.destination ??
    [];
  if (recipients.length > 0) lines.push(`to: ${recipients.join(', ')}`);

  const detail: string[] = [];
  if (ev.bounce?.bounceType) {
    // 🔴 Permanent は**その宛先に二度と送ってはいけない**（送り続けると評判が落ちる）。
    detail.push(`${ev.bounce.bounceType}/${ev.bounce.bounceSubType ?? '-'}`);
  }
  if (ev.complaint?.complaintFeedbackType) detail.push(ev.complaint.complaintFeedbackType);
  if (ev.reject?.reason) detail.push(ev.reject.reason);
  if (ev.deliveryDelay?.delayType) detail.push(ev.deliveryDelay.delayType);
  if (ev.failure?.errorMessage) detail.push(ev.failure.errorMessage);
  if (detail.length > 0) lines.push(detail.join(' | '));

  const diagnostic = ev.bounce?.bouncedRecipients?.find((r) => r.diagnosticCode)?.diagnosticCode;
  if (diagnostic) lines.push('```' + diagnostic.slice(0, 500) + '```');

  const meta: string[] = [];
  if (ev.mail?.source) meta.push(`from: ${ev.mail.source}`);
  if (ev.mail?.messageId) meta.push(`messageId: ${ev.mail.messageId}`);
  if (ev.mail?.timestamp) meta.push(`at: ${ev.mail.timestamp}`);
  if (meta.length > 0) lines.push(meta.join(' | '));

  return lines.join('\n');
}

async function postToSlack(webhookUrl: string, text: string): Promise<void> {
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(5_000),
      })

      // 🔴 **`r.ok` を必ず見る。** Slack の Incoming Webhook は無効な URL でも
      // TCP レベルでは成功し、`404 invalid_token` / `403 action_prohibited` を
      // 本文で返す。fetch が解決しただけで「送れた」と見なすと、
      // **設定ミスの間じゅうアラートが無音で捨てられる**。
      if (res.ok) return

      const body = (await res.text()).slice(0, 200)
      lastError = new Error(`${PREFIX} slack responded ${res.status}: ${body}`)

      // 4xx は再試行しても同じ（トークン失効・URL 間違い）。すぐ諦めて例外にする。
      if (res.status < 500) break
    } catch (err) {
      lastError = err
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * attempt))
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`${PREFIX} slack post failed: ${String(lastError)}`)
}

export async function handler(event: AlarmRelayEvent): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  const stage = process.env.STAGE ?? 'unknown'

  const records = event?.Records ?? []
  if (records.length === 0) {
    // スキーマ違いを黙って成功させない（＝「動いているのに何も送らない」を作らない）。
    throw new Error(`${PREFIX} event had no SNS records: ${JSON.stringify(event).slice(0, 300)}`)
  }

  if (!webhookUrl) {
    // 🔴 **握り潰さない。** 未設定のまま「アラームは鳴っているのに Slack に来ない」
    // 状態が続くのが最悪なので、名指しで落として Errors メトリクスに出す。
    // 内容は捨てずにログへ残す（CloudWatch には届く）。
    for (const record of records) {
      console.error(`${PREFIX} SLACK_WEBHOOK_URL is not set. dropped: ${record.Sns?.Message}`)
    }
    throw new Error(
      `${PREFIX} SLACK_WEBHOOK_URL is not set ` +
        `(sst secret set SLACK_WEBHOOK_URL '<url>' --stage ${stage})`,
    )
  }

  for (const record of records) {
    const raw = record.Sns?.Message
    if (!raw) continue

    let text: string
    try {
      const parsed = JSON.parse(raw) as CloudWatchAlarmMessage & SesEventMessage
      // CloudWatch アラーム／SES の設定セットイベント／それ以外（手動 publish）の3系統。
      // 🔑 **判別は「そのスキーマにしか無いキー」で行う**（`AlarmName` / `eventType`）。
      //    どちらでもないものは素通しで届ける＝**知らない形を黙って捨てない**。
      if (parsed.AlarmName) {
        text = formatAlarm(parsed, stage)
      } else if (parsed.eventType && parsed.mail) {
        text = formatSesEvent(parsed, stage)
      } else {
        text = `📣 *${record.Sns?.Subject ?? 'notification'}*  _[${stage}]_\n\`\`\`${raw.slice(0, 1500)}\`\`\``
      }
    } catch {
      text = `📣 *${record.Sns?.Subject ?? 'notification'}*  _[${stage}]_\n${raw.slice(0, 1500)}`
    }

    console.log(`${PREFIX} forwarding: ${text.split('\n')[0]}`)
    await postToSlack(webhookUrl, text)
  }
}
