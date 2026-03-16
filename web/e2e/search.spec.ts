import { test, expect } from '@playwright/test';
import { login, waitForFolderTree } from './helpers';

test.describe('Search', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await waitForFolderTree(page);
  });

  test('search bar is visible and focusable', async ({ page }) => {
    const searchInput = page.locator('#search-input');
    await expect(searchInput).toBeVisible();

    await searchInput.click();
    await expect(searchInput).toBeFocused();
  });

  test('focusing search shows suggestions dropdown', async ({ page }) => {
    const searchInput = page.locator('#search-input');
    await searchInput.click();

    // On focus, the suggestions dropdown should appear with search guidance.
    await expect(
      page.getByText('Narrow your search').first(),
    ).toBeVisible();
  });

  test('submitting a search query triggers search', async ({ page }) => {
    const searchInput = page.locator('#search-input');
    await searchInput.fill('test');
    await searchInput.press('Enter');

    // Wait for the search to execute.  The "Current mailbox only" checkbox
    // appears when search is active.
    await expect(
      page.getByText(/Current mailbox only/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('clearing search returns to normal mailbox view', async ({ page }) => {
    const searchInput = page.locator('#search-input');
    await searchInput.fill('test');
    await searchInput.press('Enter');

    // Wait for search to be active.
    await expect(
      page.getByText(/Current mailbox only/i),
    ).toBeVisible({ timeout: 10_000 });

    // Press Escape to clear.
    await searchInput.press('Escape');

    // The "Current mailbox only" toggle should disappear.
    await expect(
      page.getByText(/Current mailbox only/i),
    ).toBeHidden();
  });

  test('advanced search button opens advanced search dialog', async ({ page }) => {
    // Click the advanced search button next to the search input.
    const advancedBtn = page.getByTitle('Advanced search');
    await expect(advancedBtn).toBeVisible();
    await advancedBtn.click();

    // The AdvancedSearchDialog should appear.
    await expect(
      page.getByText(/Advanced search/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
