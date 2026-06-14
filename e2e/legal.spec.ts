import { test, expect } from '@playwright/test';

test.describe('法令ページ', () => {
  test('特定商取引法ページが表示される', async ({ page }) => {
    await page.goto('/legal/tokushoho');
    await expect(page).toHaveTitle(/特定商取引|Sikō Coffee/);
    await expect(page.getByText(/特定商取引/)).toBeVisible();
  });

  test('プライバシーポリシーページが表示される', async ({ page }) => {
    await page.goto('/legal/privacy');
    await expect(page).toHaveTitle(/プライバシー|Sikō Coffee/);
    // 本文中にも「プライバシー」が出現するため見出しに限定する。
    await expect(page.getByRole('heading', { name: /プライバシー/ })).toBeVisible();
  });

  test('存在しないページは 404', async ({ page }) => {
    const res = await page.goto('/legal/nonexistent');
    expect(res?.status()).toBe(404);
  });
});
