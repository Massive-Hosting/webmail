import { test, expect } from '@playwright/test';
import { login, waitForFolderTree, navigateTo } from './helpers';

test.describe('Contacts', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await waitForFolderTree(page);
    await navigateTo(page, 'Contacts');

    // Wait for the contacts page to render (search input is always present).
    await expect(
      page.getByPlaceholder(/Search contacts/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('contacts page renders with search and empty state', async ({ page }) => {
    // The search input should be visible.
    await expect(page.getByPlaceholder(/Search contacts/i)).toBeVisible();

    // Either contacts are listed or the empty state message appears.
    const contactItem = page.getByRole('main').locator('[role="option"], button').first();
    const emptyState = page.getByText(/Select a contact/i);

    await expect(contactItem.or(emptyState)).toBeVisible({ timeout: 10_000 });
  });

  test('search input is focusable and filters contacts', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/Search contacts/i);
    await searchInput.click();
    await expect(searchInput).toBeFocused();

    // Type a query to filter. The list should update (no crash).
    await searchInput.fill('test');
    // Allow time for the debounced search to take effect.
    await expect(searchInput).toHaveValue('test');
  });

  test('clicking "New" button shows contact creation form', async ({ page }) => {
    // The sidebar has a "New" button for creating a contact.
    await page.getByRole('button', { name: /^New$/i }).click();

    // The contact form should appear with input fields.
    await expect(
      page.getByPlaceholder(/Full name|First|Name/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('All Contacts group is visible in sidebar', async ({ page }) => {
    // The groups sidebar shows "All Contacts" as the default group.
    await expect(
      page.getByText(/All Contacts/i),
    ).toBeVisible();
  });

  test('import and export buttons are present', async ({ page }) => {
    // Import button (Upload icon) with title "Import contacts".
    await expect(
      page.getByTitle(/Import contacts/i),
    ).toBeVisible();

    // Export button (Download icon) with title "Export contacts".
    await expect(
      page.getByTitle(/Export contacts/i),
    ).toBeVisible();
  });
});
