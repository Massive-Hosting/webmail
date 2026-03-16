import { test, expect } from '@playwright/test';
import { login, waitForFolderTree, navigateTo } from './helpers';

test.describe('Calendar', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await waitForFolderTree(page);
    await navigateTo(page, 'Calendar');

    // Wait for the calendar page to render (Today button is always present).
    await expect(
      page.getByRole('button', { name: /Today/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('calendar page renders with toolbar and view switcher', async ({ page }) => {
    // Navigation buttons should be visible.
    await expect(page.getByTitle(/Previous/i)).toBeVisible();
    await expect(page.getByTitle(/Next/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Today/i })).toBeVisible();

    // View switcher buttons: Month, Week, Day.
    await expect(page.getByRole('button', { name: 'Month' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Week' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Day' })).toBeVisible();
  });

  test('switching between month, week, and day views', async ({ page }) => {
    // Click Week view.
    await page.getByRole('button', { name: 'Week' }).click();
    // The view should render (no crash). The title in the toolbar updates.
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible();

    // Click Day view.
    await page.getByRole('button', { name: 'Day' }).click();
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible();

    // Click Month view.
    await page.getByRole('button', { name: 'Month' }).click();
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
  });

  test('navigating forward and backward updates the title', async ({ page }) => {
    const title = page.getByRole('heading', { level: 2 });
    const initialTitle = await title.textContent();

    // Navigate forward.
    await page.getByTitle(/Next/i).click();
    await expect(title).not.toHaveText(initialTitle ?? '');

    // Navigate backward twice to go to the previous period.
    await page.getByTitle(/Previous/i).click();
    await page.getByTitle(/Previous/i).click();
    await expect(title).not.toHaveText(initialTitle ?? '');

    // Click "Today" to return to current period.
    await page.getByRole('button', { name: /Today/i }).click();
    await expect(title).toHaveText(initialTitle ?? '');
  });

  test('clicking "New Event" button opens event form', async ({ page }) => {
    // The calendar sidebar has a "New Event" button.
    await page.getByRole('button', { name: /New Event/i }).click();

    // The event form dialog should appear with a title input and a Create button.
    await expect(
      page.getByPlaceholder(/Event title/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('calendar sidebar shows calendars list', async ({ page }) => {
    // The sidebar should have a "Calendars" section header.
    await expect(
      page.getByText('Calendars'),
    ).toBeVisible();
  });
});
