import { expect, test } from '@playwright/test';

test('homepage renders the primary audit flow without horizontal overflow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find what makes a website feel unfinished.' })).toBeVisible();
  await expect(page.getByLabel('Website to audit')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run website audit' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBeFalsy();
});

test('private network addresses are rejected in plain language', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Website to audit').fill('http://127.0.0.1');
  await page.getByRole('button', { name: 'Run website audit' }).click();
  await expect(page.locator('.errorMessage')).toContainText('Private network addresses cannot be audited.');
});

test('a public website audit completes and report exports work', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/');
  await page.getByLabel('Website to audit').fill('https://example.com');
  await page.getByLabel('Audit depth').selectOption('quick');
  await page.getByRole('button', { name: 'Run website audit' }).click();
  await expect(page.getByText('Audit complete')).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('heading', { name: 'example.com' })).toBeVisible();
  await expect(page.getByText('pages checked')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^website-audit-\d{4}-\d{2}-\d{2}\.csv$/);
});
