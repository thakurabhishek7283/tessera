import { expect, type Page, test } from '@playwright/test';

const count = (page: Page) => page.locator('tessera-hello output');
const add = (page: Page) => page.getByRole('button', { name: /^Add 1$/ });

test.describe('playground', () => {
  test('renders the hello feature from the default config', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Shared counter' })).toBeVisible();
    await expect(count(page)).toHaveText('0');
    await expect(page.getByText('transport: open')).toBeVisible();
  });

  test('keeps the counter in sync across tabs and shows how many are open', async ({ context }) => {
    const [a, b] = [await context.newPage(), await context.newPage()];
    await a.goto('/');
    await b.goto('/');
    await expect(a.getByText('2 tabs open')).toBeVisible();
    await expect(b.getByText('2 tabs open')).toBeVisible();

    await add(a).click();
    await add(a).click();
    await expect(count(a)).toHaveText('2');
    await expect(count(b)).toHaveText('2');

    await add(b).click();
    await expect(count(a)).toHaveText('3');

    await b.locator('tessera-hello').getByRole('button', { name: 'Reset' }).click();
    await expect(count(a)).toHaveText('0');

    await b.close();
    await expect(a.getByText('1 tab open')).toBeVisible();
  });

  test('toggles a feature at runtime', async ({ page }) => {
    await page.goto('/');
    await expect(count(page)).toBeVisible();
    await page.getByRole('button', { name: /Disable/ }).click();
    await expect(page.locator('tessera-hello output')).toHaveCount(0);
    await page.getByRole('button', { name: /Enable/ }).click();
    await expect(count(page)).toBeVisible();
  });

  test('reports invalid config instead of crashing, and a disabled feature never renders', async ({
    page,
  }) => {
    await page.goto('/');
    const editor = page.getByLabel('Config (JSON)');
    await editor.fill('{ not json');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByText(/Not valid JSON/)).toBeVisible();

    await editor.fill(JSON.stringify({ appId: 'Bad Id', features: {} }));
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByText(/appId/)).toBeVisible();

    await editor.fill(
      JSON.stringify({ appId: 'playground', features: { hello: { enabled: false } } }),
    );
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByText(/Not valid JSON|appId/)).toHaveCount(0);
    await expect(page.locator('tessera-hello output')).toHaveCount(0);
  });

  test('switches theme and language', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Theme').selectOption('dark');
    await expect(page.locator('tessera-root').first()).toHaveAttribute(
      'data-tessera-theme',
      'dark',
    );
    await page.getByLabel('Language').selectOption('de');
    await expect(page.getByRole('button', { name: 'Zurücksetzen' })).toBeVisible();
  });

  test('has no console errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('/');
    await expect(count(page)).toBeVisible();
    expect(errors).toEqual([]);
  });
});
