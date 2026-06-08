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

export const TABLE = {
  PRODUCTS: 'siko-coffee-products',
  SALES: 'siko-coffee-sales',
  ORDERS: 'siko-coffee-orders',
  EXPENSES: 'siko-coffee-expenses',
  INVENTORY: 'siko-coffee-inventory',
  CONFIG: 'siko-coffee-config',
} as const;
