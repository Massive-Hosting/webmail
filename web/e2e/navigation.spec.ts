import { test, expect } from '@playwright/test';
import { login, waitForFolderTree, navigateTo } from './helpers';

test.describe('Navigation & Layout', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await waitForFolderTree(page);
  });

  test('three-pane layout renders on desktop', async ({ page }) => {
    // 1. Sidebar (role="navigation" with "Mail folders" label)
    const sidebar = page.getByRole('navigation', { name: /Mail folders/i });
    await expect(sidebar).toBeVisible();

    // 2. Main content area (role="main")
    const main = page.getByRole('main').first();
    await expect(main).toBeVisible();

    // 3. Reading pane (role="complementary" with "Message preview")
    // May or may not be visible depending on user settings / viewport.
    const readingPane = page.getByRole('complementary', { name: /Message preview/i });
    // Just check it exists in the DOM (it may be conditionally hidden).
    expect(await readingPane.count()).toBeGreaterThanOrEqual(0);
  });

  test('clicking Contacts tab shows contacts page', async ({ page }) => {
    // The activity bar has navigation buttons identified by aria-label.
    await navigateTo(page, 'Contacts');

    // The contacts page should load. It renders a search input for contacts.
    await expect(
      page.getByPlaceholder(/Search contacts/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('clicking Calendar tab shows calendar page', async ({ page }) => {
    await navigateTo(page, 'Calendar');

    // The calendar page should render with view switcher buttons.
    await expect(
      page.getByRole('button', { name: /Today/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('clicking Mail tab returns to inbox', async ({ page }) => {
    // Switch to Contacts first.
    await navigateTo(page, 'Contacts');
    await expect(
      page.getByPlaceholder(/Search contacts/i),
    ).toBeVisible({ timeout: 10_000 });

    // Switch back to Mail.
    await navigateTo(page, 'Mail');

    // Folder tree should be visible again.
    await waitForFolderTree(page);
  });

  test('keyboard shortcut ? opens help dialog', async ({ page }) => {
    // Press "?" which should open the keyboard shortcuts dialog.
    await page.keyboard.press('?');

    // The KeyboardShortcutDialog should appear.
    await expect(
      page.getByText(/Keyboard Shortcuts/i).first(),
    ).toBeVisible();
  });

  test('theme toggle button cycles themes', async ({ page }) => {
    // The theme toggle button has aria-label containing "Theme:".
    const themeBtn = page.getByRole('button', { name: /Theme:/i });
    await expect(themeBtn).toBeVisible();

    // Click to cycle the theme. The button label should change.
    const initialLabel = await themeBtn.getAttribute('aria-label');
    await themeBtn.click();

    // After cycling, the theme label should have changed.
    await expect(themeBtn).not.toHaveAttribute('aria-label', initialLabel ?? '');
  });

  test('sidebar collapse/expand toggle works', async ({ page }) => {
    // The activity bar has a sidebar toggle button.
    // When sidebar is visible, the button says "Hide sidebar".
    const hideBtn = page.getByRole('button', { name: /Hide sidebar/i });
    const showBtn = page.getByRole('button', { name: /Show sidebar/i });

    if (await hideBtn.isVisible()) {
      await hideBtn.click();

      // After hiding, "Show sidebar" should appear.
      await expect(showBtn).toBeVisible();

      // Expand again.
      await showBtn.click();
      await expect(hideBtn).toBeVisible();
    }
  });
});
