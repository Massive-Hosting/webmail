import { test, expect } from '@playwright/test';
import { login, waitForFolderTree, openSettings } from './helpers';

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await waitForFolderTree(page);
  });

  test('opens settings dialog from toolbar', async ({ page }) => {
    await openSettings(page);

    // The dialog title should be visible.
    await expect(page.locator('#settings-title')).toContainText(/Settings/i);
  });

  test('all settings tabs are present', async ({ page }) => {
    await openSettings(page);

    // Verify all tab triggers are visible.  The settings dialog uses Radix
    // Tabs, which renders each trigger with role="tab".
    const tabs = [
      'General',
      'Mail',
      'Signatures',
      'Out of Office',
      'Filters',
      'Shortcuts',
      'Notifications',
      'Storage',
      'Security',
    ];
    for (const tab of tabs) {
      await expect(
        page.getByRole('tab', { name: tab }),
      ).toBeVisible();
    }
  });

  test('switching between settings tabs works', async ({ page }) => {
    await openSettings(page);

    // Click through several tabs to ensure they load without errors.
    for (const tab of ['Mail', 'Signatures', 'Security', 'General']) {
      await page.getByRole('tab', { name: tab }).click();

      // Verify the tab is now selected (aria-selected="true").
      await expect(
        page.getByRole('tab', { name: tab }),
      ).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('settings dialog can be closed', async ({ page }) => {
    await openSettings(page);

    // Close via the X button (aria-label="Close settings").
    await page.getByRole('button', { name: /Close settings/i }).click();

    // Settings dialog should disappear.
    await expect(page.locator('#settings-title')).toBeHidden();
  });
});
