import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

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

// Preview デプロイは別テーブルを使い、本番データへの誤書き込みを防ぐ。
// VERCEL_ENV: 'production' | 'preview' | 'development'
const prefix = process.env.VERCEL_ENV === 'preview' ? 'siko-coffee-preview-' : 'siko-coffee-';

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
} as const;
