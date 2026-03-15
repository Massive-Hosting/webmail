import { test, expect } from '@playwright/test';
import { login, ACCOUNT_SUPPORT, waitForFolderTree } from './helpers';

test.describe('Compose & Send', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await waitForFolderTree(page);
  });

  test('opens compose dialog via toolbar button', async ({ page }) => {
    // Click the Compose button in the toolbar.
    await page.getByRole('button', { name: /Compose/i }).click();

    // The compose dialog should appear — look for the Send button and
    // the Subject input or "To" recipient field.
    await expect(
      page.getByRole('button', { name: /Send/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('sends an email to the support account', async ({ page }) => {
    // Open compose.
    await page.getByRole('button', { name: /Compose/i }).click();

    // Wait for the compose panel to appear.
    await expect(
      page.getByRole('button', { name: /Send/i }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Fill in recipients — the RecipientInput is a custom component.
    // It uses an input with placeholder containing "Recipients" or similar.
    const toInput = page.getByPlaceholder(/recipients|to/i).first();
    await toInput.fill(ACCOUNT_SUPPORT.email);
    await toInput.press('Enter');

    // Fill in subject.
    const subjectInput = page.getByPlaceholder(/subject/i);
    await subjectInput.fill('E2E Test Message');

    // Type body text into the Tiptap editor.
    // The editor is a contenteditable div with role "textbox" or class ProseMirror.
    const editor = page.locator('.ProseMirror').first();
    if (await editor.isVisible()) {
      await editor.click();
      await editor.fill('This is an automated E2E test message.');
    }

    // Click Send.
    await page.getByRole('button', { name: /Send/i }).first().click();

    // Wait for success toast ("Message sent" or similar).
    await expect(
      page.getByText(/sent|delivered/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('compose can be closed without sending', async ({ page }) => {
    await page.getByRole('button', { name: /Compose/i }).click();
    await expect(
      page.getByRole('button', { name: /Send/i }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Close the compose dialog — there is an X / close button.
    // Use the close button (lucide X icon) in the compose panel header.
    const closeButton = page.locator('button').filter({ has: page.locator('svg.lucide-x') }).first();
    if (await closeButton.isVisible()) {
      await closeButton.click();
    }

    // Compose dialog should no longer show the Send button.
    await expect(
      page.getByRole('button', { name: /^Send$/i }),
    ).toBeHidden({ timeout: 5_000 });
  });
});
