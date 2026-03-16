import { test, expect } from '@playwright/test';
import { login, waitForFolderTree } from './helpers';

test.describe('Inbox & Message List', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('folder tree loads with standard folders', async ({ page }) => {
    await waitForFolderTree(page);

    const sidebar = page.getByRole('navigation', { name: /Mail folders/i });

    // Standard JMAP folders should appear in the sidebar.
    for (const folder of ['Inbox', 'Sent', 'Drafts', 'Trash', 'Junk']) {
      await expect(
        sidebar.getByRole('button', { name: new RegExp(folder, 'i') }).first(),
      ).toBeVisible();
    }
  });

  test('clicking a folder selects it', async ({ page }) => {
    await waitForFolderTree(page);

    const sidebar = page.getByRole('navigation', { name: /Mail folders/i });

    // Click the "Sent" folder.
    const sentButton = sidebar.getByRole('button', { name: /Sent/i }).first();
    await sentButton.click();

    // The main content area should remain visible (no crash).
    await expect(page.getByRole('main').first()).toBeVisible();

    // Click back to Inbox.
    const inboxButton = sidebar.getByRole('button', { name: /Inbox/i }).first();
    await inboxButton.click();

    // The main region should still be visible.
    await expect(page.getByRole('main').first()).toBeVisible();
  });

  test('message list renders (handles empty or populated state)', async ({ page }) => {
    await waitForFolderTree(page);

    // The message list is inside <main>.  It should either display messages
    // or an empty state.  We verify the main region is visible.
    const main = page.getByRole('main').first();
    await expect(main).toBeVisible();

    // Check for either message list items or an empty-state indicator.
    // Both are valid depending on the mailbox state.
    const messageItem = main.locator('[role="option"]').first();
    const emptyState = main.getByText(/no messages|select a message/i).first();

    // At least one of these should eventually appear.
    await expect(messageItem.or(emptyState)).toBeVisible({ timeout: 15_000 });
  });

  test('sidebar navigation region is accessible', async ({ page }) => {
    await waitForFolderTree(page);

    // The sidebar has proper ARIA labeling.
    const sidebar = page.getByRole('navigation', { name: /Mail folders/i });
    await expect(sidebar).toBeVisible();
  });
});
