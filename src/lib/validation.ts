import { z } from 'zod';
import { FEEDBACK_CATEGORIES, FEEDBACK_CONTENT_MAX } from '@/lib/feedback';

// --- Feedback (public, anonymous) ---

export const feedbackSchema = z.object({
  content: z.string().trim().min(1).max(FEEDBACK_CONTENT_MAX),
  category: z.enum(FEEDBACK_CATEGORIES).optional().default('opinion'),
  from: z.string().max(40).optional(),
  // ハニーポット: bot が埋めがちな隠しフィールド。値の有無はルート側で判定し、
  // bot には成功を装って静かに破棄する（検出を悟らせない）。
  website: z.string().max(200).optional(),
});

// --- Checkout (blend) ---

export const blendCartItemSchema = z.object({
  name: z.string().min(1).max(40),
  ratios: z.array(z.number().min(0).max(100)).length(3).refine(
    (r) => Math.abs(r.reduce((a, b) => a + b, 0) - 100) <= 1,
    { message: 'Ratios must sum to 100' },
  ),
  grind: z.string().max(20).optional(),
  grams: z.number().refine((g) => [100, 150, 200, 250, 300, 350, 400, 450, 500].includes(g)).optional(),
  custom: z.boolean().optional(),
  single: z.boolean().optional(),
  publish: z.boolean().optional(),
});

export const blendCheckoutSchema = z.object({
  items: z.array(blendCartItemSchema).min(1).max(20),
});

// --- Admin: Products ---

const productStatusSchema = z.enum(['active', 'paused', 'discontinued']);

export const createProductSchema = z.object({
  name: z.string().min(1).max(100),
  nameJp: z.string().max(100).optional().default(''),
  price: z.number().int().min(0),
  description: z.string().max(1000).optional().default(''),
  type: z.string().min(1).max(50),
  isPublic: z.boolean().optional().default(false),
  canCustomize: z.boolean().optional().default(false),
  status: productStatusSchema.optional().default('active'),
  recipe: z.string().max(2000).optional(),
  unit: z.string().max(20).optional(),
  sortOrder: z.number().int().optional(),
});

// --- Admin: Inventory ---

export const createInventorySchema = z.object({
  beanId: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  origin: z.string().max(100).optional().default(''),
  purchaseAmount: z.number().min(0),
  purchasePrice: z.number().min(0).optional(),
  alertThreshold: z.number().int().min(0).optional().default(500),
  category: z.enum(['coffee', 'supply']).optional().default('coffee'),
  stockType: z.string().max(50).optional(),
  unit: z.string().max(20).optional(),
  date: z.string().optional(),
});

export const updateInventorySchema = z.object({
  beanId: z.string().min(1),
  currentStock: z.number().min(0).optional(),
  name: z.string().min(1).max(100).optional(),
  origin: z.string().max(100).optional(),
  stockType: z.string().max(50).optional(),
});

// --- ブレンド共創プラットフォーム: 焙煎者昇格（§6.1.1 / §13.5） ---

// 昇格申請。資格＝製造・加工の許可(permit)/届出(notification)を持つこと。
// permit は期限監視のため licenseExpiry 必須（notification は期限なし）。
export const roasterApplySchema = z
  .object({
    displayName: z.string().trim().min(1).max(60),
    licenseType: z.enum(['permit', 'notification']),
    licenseNo: z.string().trim().min(1).max(60),
    licenseExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'yyyy-mm-dd 形式で入力してください').optional(),
    invoiceRegNo: z.string().trim().regex(/^T\d{13}$/, 'T+13桁で入力してください').optional(),
    termsVersion: z.string().trim().min(1).max(20),
    optIns: z.object({
      allowBlend: z.boolean(),
      allowNameStory: z.boolean(),
      allowSelloutAfterExit: z.boolean(),
    }),
  })
  .refine((d) => d.licenseType !== 'permit' || !!d.licenseExpiry, {
    message: '許可（permit）には有効期限（licenseExpiry）が必要です',
    path: ['licenseExpiry'],
  });

// admin による焙煎者ステータス遷移（承認＝active / 停止・退会など）
export const adminRoasterUpdateSchema = z.object({
  status: z.enum(['active', 'paused', 'withdrawn', 'selling_out']),
});

// --- ブレンド共創プラットフォーム: 掲載豆（§6.2.1 申告5項目 / §13.5） ---

// 焙煎度（8段階）。src/types/platform.ts の RoastLevel と同期させること。
export const ROAST_LEVELS = ['light', 'cinnamon', 'medium', 'high', 'city', 'full_city', 'french', 'italian'] as const;

const orderStatusSchema = z.enum(['on', 'off', 'paused']);

// 掲載豆の作成＝§6.2.1 の5項目（+ leadTime / orderStatus）。価格は税込・円/100g（§6.1.2）。
export const beanCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  greenOrigin: z.string().trim().min(1).max(100),
  roastLevel: z.enum(ROAST_LEVELS),
  pricePer100g: z.number().int().min(1).max(1_000_000),
  weeklyCapKg: z.number().min(0).max(1000),
  leadTimeDays: z.number().int().min(0).max(365),
  orderStatus: orderStatusSchema.optional().default('on'),
});

// 部分更新（価格・週上限・リードタイム・ON/OFF の変更を含む）
export const beanUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    greenOrigin: z.string().trim().min(1).max(100).optional(),
    roastLevel: z.enum(ROAST_LEVELS).optional(),
    pricePer100g: z.number().int().min(1).max(1_000_000).optional(),
    weeklyCapKg: z.number().min(0).max(1000).optional(),
    leadTimeDays: z.number().int().min(0).max(365).optional(),
    orderStatus: orderStatusSchema.optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: '更新項目がありません' });
