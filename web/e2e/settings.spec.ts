import { test, expect } from '@playwright/test';
import { login, waitForFolderTree } from './helpers';

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await waitForFolderTree(page);
  });

  test('opens settings dialog from toolbar', async ({ page }) => {
    // Click the Settings button (aria-label="Settings").
    await page.getByRole('button', { name: 'Settings' }).click();

    // The SettingsDialog should appear with the title "Settings".
    await expect(
      page.getByRole('heading', { name: 'Settings' }).or(
        page.locator('#settings-title'),
      ),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('all settings tabs are present', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();

    // Wait for the dialog to appear.
    await expect(page.locator('#settings-title')).toBeVisible({ timeout: 10_000 });

    // Verify all tab triggers are visible.
    const tabs = ['General', 'Mail', 'Signatures', 'Filters', 'Shortcuts', 'Notifications', 'Storage', 'Security'];
    for (const tab of tabs) {
      await expect(
        page.getByRole('tab', { name: tab }),
      ).toBeVisible();
    }
  });

  test('switching between settings tabs works', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.locator('#settings-title')).toBeVisible({ timeout: 10_000 });

    // Click through a few tabs to ensure they load without errors.
    for (const tab of ['Mail', 'Signatures', 'Security', 'General']) {
      await page.getByRole('tab', { name: tab }).click();
      await page.waitForTimeout(300);
    }
  });

  test('settings dialog can be closed', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.locator('#settings-title')).toBeVisible({ timeout: 10_000 });

    // Close via the X button (aria-label="Close settings").
    await page.getByRole('button', { name: 'Close settings' }).click();

    // Settings dialog should disappear.
    await expect(page.locator('#settings-title')).toBeHidden({ timeout: 5_000 });
  });
});
