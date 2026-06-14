import { test, expect } from '@playwright/test';

test.describe('ホームページ', () => {
  test('ページタイトルが正しい', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Sikō Coffee/);
  });

  test('ナビゲーションが表示される', async ({ page }) => {
    await page.goto('/');
    // TerminalLoader 完了を待つ（最大 15 秒）
    // ページには複数の nav（メイン / セクションナビ）があるため先頭に限定する。
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: /shop/i })).toBeVisible();
  });

  test('ヒーローテキストが表示される', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('暗闇の向こうに、光がある。')).toBeVisible({ timeout: 15_000 });
  });

  test('shop ページへのリンクが機能する', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /shop/i }).first().click();
    await expect(page).toHaveURL('/shop');
  });

  test('meta description が設定されている', async ({ page }) => {
    await page.goto('/');
    const desc = await page.locator('meta[name="description"]').getAttribute('content');
    expect(desc).toBeTruthy();
    expect(desc!.length).toBeGreaterThan(10);
  });

  test('canonical が www ドメイン', async ({ page }) => {
    await page.goto('/');
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toMatch(/^https:\/\/www\.sikocoffee\.com/);
  });
});
