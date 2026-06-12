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

// Preview デプロイは別テーブルを使い、本番データへの誤書き込みを防ぐ。
// VERCEL_ENV: 'production' | 'preview' | 'development'
const prefix = process.env.VERCEL_ENV === 'preview' ? 'siko-coffee-preview-' : 'siko-coffee-';

export const TABLE = {
  PRODUCTS:  `${prefix}products`,
  SALES:     `${prefix}sales`,
  ORDERS:    `${prefix}orders`,
  EXPENSES:  `${prefix}expenses`,
  INVENTORY: `${prefix}inventory`,
  CONFIG:    `${prefix}config`,
} as const;
