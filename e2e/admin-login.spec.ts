import { test, expect } from '@playwright/test';

test.describe('Admin ログインフロー', () => {
  test('ログインページが表示される', async ({ page }) => {
    await page.goto('/admin/login');

    await expect(page.getByText('Sikō Coffee')).toBeVisible();
    await expect(page.getByPlaceholder('パスワード')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ログイン', exact: true })).toBeVisible();
  });

  test('空パスワードでログインボタンが無効', async ({ page }) => {
    await page.goto('/admin/login');

    const loginBtn = page.getByRole('button', { name: 'ログイン', exact: true });
    await expect(loginBtn).toBeDisabled();
  });

  test('パスワード入力でログインボタンが有効になる', async ({ page }) => {
    await page.goto('/admin/login');

    await page.getByPlaceholder('パスワード').fill('testpassword');
    const loginBtn = page.getByRole('button', { name: 'ログイン', exact: true });
    await expect(loginBtn).toBeEnabled();
  });

  test('誤パスワードでエラーが表示される', async ({ page }) => {
    await page.goto('/admin/login');

    await page.getByPlaceholder('パスワード').fill('wrongpassword');
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();

    // エラーメッセージが表示される（レート制限 or 認証失敗）
    await expect(
      page.getByText(/パスワード|エラー|試行|ください/)
    ).toBeVisible({ timeout: 5000 });
  });

  test('未認証で admin ページにアクセスすると /admin にリダイレクト', async ({ page }) => {
    await page.goto('/admin/dashboard');
    // 認証なしはログインページか /admin にリダイレクト
    await expect(page).toHaveURL(/\/admin(\/login)?$/);
  });
});
