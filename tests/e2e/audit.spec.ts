import { expect, test } from '@playwright/test';

test('homepage renders the sitewide audit flow without horizontal overflow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Audit the entire website, not just the homepage.' })).toBeVisible();
  await expect(page.getByLabel('Website to audit')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run website audit' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBeFalsy();
});

test('security headers are present on the app shell', async ({ request }) => {
  const response = await request.get('/');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-security-policy']).toContain("default-src 'self'");
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(response.headers()['x-frame-options']).toBe('DENY');
});

test('private network addresses are rejected in plain language', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Website to audit').fill('http://127.0.0.1');
  await page.getByRole('button', { name: 'Run website audit' }).click();
  await expect(page.locator('.errorMessage')).toContainText('Private network addresses cannot be audited.');
});

test('a website can be audited without typing http or https', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
  await page.getByLabel('Website to audit').fill('example.com');
  await page.getByLabel('Audit coverage').selectOption('quick');
  await page.getByRole('button', { name: 'Run website audit' }).click();
  await expect(page.getByText('Audit complete', { exact: true })).toBeVisible({ timeout: 90000 });
  await expect(page.getByRole('heading', { name: 'example.com' })).toBeVisible();
});

test('sitewide report shows coverage, expert review status, findings, and remediation prompts', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
  await page.getByLabel('Website to audit').fill('https://example.com');
  await page.getByLabel('Audit coverage').selectOption('quick');
  await page.getByRole('button', { name: 'Run website audit' }).click();
  await expect(page.getByText('Audit complete', { exact: true })).toBeVisible({ timeout: 90000 });
  await expect(page.getByText('Expert review layer', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /specialist review completed/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What was actually reviewed' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What needs to change' })).toBeVisible();
  await expect(page.getByText('Vibe-code remediation prompt').first()).toBeVisible();
  await page.getByText('Vibe-code remediation prompt').first().click();
  await expect(page.getByRole('button', { name: 'Copy full prompt' }).first()).toBeVisible();
  await expect(page.getByText('Page-by-page coverage')).toBeVisible();
});

test('a public website audit completes and CSV export works', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
  await page.getByLabel('Website to audit').fill('https://example.com');
  await page.getByLabel('Audit coverage').selectOption('quick');
  await page.getByRole('button', { name: 'Run website audit' }).click();
  await expect(page.getByText('Audit complete', { exact: true })).toBeVisible({ timeout: 90000 });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^website-audit-\d{4}-\d{2}-\d{2}\.csv$/);
});
