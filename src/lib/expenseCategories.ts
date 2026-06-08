export const CATEGORIES: { value: string; label: string }[] = [
  { value: 'rent',          label: '地代家賃' },
  { value: 'purchase',      label: '仕入高' },
  { value: 'supplies',      label: '消耗品費' },
  { value: 'communication', label: '通信費' },
  { value: 'advertising',   label: '広告宣伝費' },
  { value: 'transport',     label: '旅費交通費' },
  { value: 'outsourcing',   label: '外注費' },
  { value: 'utilities',     label: '水道光熱費' },
  { value: 'misc',          label: '雑費' },
]

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map(c => [c.value, c.label])
)
