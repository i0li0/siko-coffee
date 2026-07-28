import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { isProductionStage } from '@/lib/stage';

const REGION = 'ap-northeast-1';

let _docClient: DynamoDBDocumentClient | undefined;

export function getDocClient(): DynamoDBDocumentClient {
  if (!_docClient) {
    _docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
  }
  return _docClient;
}

// AWS 認証情報が無い環境（CI のモック実行など）では DynamoDB を呼ばず、
// 公開 API は空データ扱いにして 500 を返さないようにする。
export function isDbConfigured(): boolean {
  return Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

// 本番以外のステージは別テーブルを使い、本番データへの誤書き込みを防ぐ。
//
// 🔴 判定は**フェイルクローズ**（`src/lib/stage.ts`）。本番と明示されたときだけ
// `siko-coffee-*` を向き、それ以外は全て `siko-coffee-preview-*` に倒す。
// 以前は `VERCEL_ENV === 'preview'` のときだけ preview を向いていたため、
// **環境変数が無い環境（AWS など）では本番テーブルを向いていた**。
const prefix = isProductionStage() ? 'siko-coffee-' : 'siko-coffee-preview-';

export const TABLE = {
  PRODUCTS:  `${prefix}products`,
  SALES:     `${prefix}sales`,
  ORDERS:    `${prefix}orders`,
  BLENDS:    `${prefix}blends`,
  EXPENSES:  `${prefix}expenses`,
  INVENTORY: `${prefix}inventory`,
  CONFIG:    `${prefix}config`,
  AUTH:      `${prefix}auth`,
  FEEDBACK:  `${prefix}feedback`,
  // ブレンド共創プラットフォーム（docs/blend-platform-plan.md §11）
  ROASTERS:        `${prefix}roasters`,
  BEANS:           `${prefix}beans`,
  LOTS:            `${prefix}lots`,
  RESERVATIONS:    `${prefix}reservations`,
  ROASTER_METRICS: `${prefix}roaster-metrics`,
  SUBSCRIPTIONS:   `${prefix}subscriptions`,
  POS:             `${prefix}pos`,
} as const;
