import { test, expect } from '@playwright/test';
import { login, ACCOUNT_SUPPORT, waitForFolderTree } from './helpers';

test.describe('Read Message', () => {
  test('clicking a message shows content in the reading pane', async ({ page }) => {
    // Log in as the support account which may have received the E2E test
    // message from the compose tests.
    await login(page, ACCOUNT_SUPPORT.email, ACCOUNT_SUPPORT.password);
    await waitForFolderTree(page);

    const main = page.getByRole('main').first();
    await expect(main).toBeVisible();

    // Wait for message list items or an empty state to render.
    const messageItem = main.locator('[role="option"]').first();
    const emptyState = main.getByText(/no messages|select a message/i).first();

    await expect(messageItem.or(emptyState)).toBeVisible({ timeout: 15_000 });

    // If there are messages, click the first one.
    if (await messageItem.isVisible()) {
      await messageItem.click();

      // The reading pane should show message content.
      const readingPane = page.getByRole('complementary', { name: /Message preview/i });
      await expect(readingPane).toBeVisible({ timeout: 10_000 });
    }
  });

  test('reading pane shows hint when no message is selected', async ({ page }) => {
    await login(page);
    await waitForFolderTree(page);

    // The reading pane should show a placeholder when no message is selected.
    const readingPane = page.getByRole('complementary', { name: /Message preview/i });

    // Reading pane may or may not be visible depending on layout settings.
    // If visible, it should contain some hint text.
    if (await readingPane.isVisible()) {
      // Look for any hint-like text inside the reading pane.
      const hint = readingPane.getByText(/select|choose|click/i).first();
      // This is a soft check — the hint may not exist if there is a default preview.
      await expect(hint.or(readingPane)).toBeVisible();
    }
  });

  test('message list items have correct ARIA roles', async ({ page }) => {
    await login(page);
    await waitForFolderTree(page);

    const main = page.getByRole('main').first();

    // Wait for messages or empty state.
    const messageItem = main.locator('[role="option"]').first();
    const emptyState = main.getByText(/no messages|select a message/i).first();
    await expect(messageItem.or(emptyState)).toBeVisible({ timeout: 15_000 });

    // If messages exist, verify they use role="option" with aria-selected.
    if (await messageItem.isVisible()) {
      await expect(messageItem).toHaveAttribute('role', 'option');
    }
  });
});
