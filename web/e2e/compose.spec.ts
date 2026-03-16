import { test, expect } from '@playwright/test';
import { login, ACCOUNT_SUPPORT, waitForFolderTree } from './helpers';

test.describe('Compose & Send', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await waitForFolderTree(page);
  });

  test('opens compose dialog via toolbar button', async ({ page }) => {
    // The compose button in the action bar reads "New mail".
    await page.getByRole('button', { name: /New mail/i }).click();

    // The compose dialog should appear with a Send button and
    // a Subject input or "To" recipient field.
    await expect(
      page.getByRole('button', { name: /Send/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('sends an email to the support account', async ({ page }) => {
    // Open compose.
    await page.getByRole('button', { name: /New mail/i }).click();

    // Wait for the compose panel to appear.
    await expect(
      page.getByRole('button', { name: /Send/i }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Fill in recipients -- the RecipientInput uses an input with
    // placeholder containing "Recipients" or "to".
    const toInput = page.getByPlaceholder(/recipients|to/i).first();
    await toInput.fill(ACCOUNT_SUPPORT.email);
    await toInput.press('Enter');

    // Fill in subject.
    const subjectInput = page.getByPlaceholder(/subject/i);
    await subjectInput.fill('E2E Test Message');

    // Type body text into the Tiptap editor.
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
    await page.getByRole('button', { name: /New mail/i }).click();
    await expect(
      page.getByRole('button', { name: /Send/i }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Close the compose dialog using the X button.
    const closeButton = page.locator('button').filter({ has: page.locator('svg.lucide-x') }).first();
    if (await closeButton.isVisible()) {
      await closeButton.click();
    } else {
      // Fallback: press Escape to close the dialog.
      await page.keyboard.press('Escape');
    }

    // Compose dialog should no longer show the Send button.
    await expect(
      page.getByRole('button', { name: /^Send$/i }),
    ).toBeHidden();
  });

  test('keyboard shortcut opens compose', async ({ page }) => {
    // Press "c" which is the keyboard shortcut for compose.
    await page.keyboard.press('c');

    // The compose dialog should appear.
    await expect(
      page.getByRole('button', { name: /Send/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
