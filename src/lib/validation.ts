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
