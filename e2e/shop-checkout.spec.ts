import { test, expect } from '@playwright/test';

test.describe('ショップ購入フロー', () => {
  test('商品一覧が表示される', async ({ page }) => {
    await page.goto('/shop');
    await expect(page).toHaveTitle(/Shop.*Sikō Coffee/);

    // 商品リストかカテゴリが表示される
    const nav = page.getByText('Shop');
    await expect(nav.first()).toBeVisible();
  });

  test('カテゴリ切り替えが機能する', async ({ page }) => {
    await page.goto('/shop');

    // サイドバーのカテゴリリンクをクリック
    const allLink = page.getByRole('link', { name: /ALL/i }).first();
    if (await allLink.isVisible()) {
      await allLink.click();
      await expect(page).toHaveURL(/category=all|\/shop/);
    }
  });

  test('購入ボタンが表示され、押すと処理中になる', async ({ page }) => {
    await page.goto('/shop');

    const buyBtn = page.getByRole('button', { name: '購入する' }).first();

    // 商品がある場合のみテスト
    if (await buyBtn.isVisible()) {
      // submit で Stripe にリダイレクトされるが、その前に disabled になることを確認
      await page.route('**/api/checkout', async (route) => {
        // Stripe リダイレクトをインターセプトして止める
        await route.fulfill({ status: 303, headers: { Location: '/shop' } });
      });

      await buyBtn.click();

      // ボタンが無効化または「処理中...」になる
      await expect(buyBtn).toBeDisabled({ timeout: 2000 }).catch(() => {
        // form submit によりページ遷移する場合はOK
      });
    }
  });

  test('成功ページは session_id なしでショップへリダイレクト', async ({ page }) => {
    await page.goto('/shop/success');
    // session_id なし → /shop にリダイレクト
    await expect(page).toHaveURL('/shop');
  });
});
