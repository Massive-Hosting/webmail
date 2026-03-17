/**
 * Playwright script to capture feature screenshots from the live webmail app.
 *
 * Usage: npx playwright test showcase/capture-screenshots.ts --project=chromium
 * Or:    cd web && npx playwright test ../showcase/capture-screenshots.ts
 */

import { test, expect, type Page } from "@playwright/test";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename2 = fileURLToPath(import.meta.url);
const __dirname2 = dirname(__filename2);

const BASE_URL = "https://webmail.massive-hosting.com";
const EMAIL = "info@acme.customer.mhst.io";
const PASSWORD = "test1234";
const SCREENSHOTS_DIR = join(__dirname2, "../../showcase/screenshots");

// Viewport for desktop screenshots
const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

async function login(page: Page) {
  await page.goto(BASE_URL);
  await page.waitForSelector('input[type="email"], input[placeholder*="email"], input[name="email"]', { timeout: 10000 });
  await page.fill('input[type="email"], input[placeholder*="email"], input[name="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  // Wait for inbox to load
  await page.waitForSelector('[role="treeitem"]', { timeout: 15000 });
  await page.waitForTimeout(2000); // Let animations settle
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: join(SCREENSHOTS_DIR, `${name}.png`), fullPage: false });
}

async function screenshotElement(page: Page, selector: string, name: string) {
  const el = page.locator(selector).first();
  await el.screenshot({ path: join(SCREENSHOTS_DIR, `${name}.png`) });
}

test.describe("Feature Screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
  });

  test("01 - Login page", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForSelector('input[type="email"], input[placeholder*="email"]', { timeout: 10000 });
    await page.waitForTimeout(500);
    await screenshot(page, "01-login");
  });

  test("02 - Three pane layout (inbox)", async ({ page }) => {
    await login(page);
    // Click first email to show reading pane
    const firstEmail = page.locator('.message-list-item').first();
    if (await firstEmail.isVisible()) {
      await firstEmail.click();
      await page.waitForTimeout(1500);
    }
    await screenshot(page, "02-inbox-three-pane");
  });

  test("03 - Dark mode", async ({ page }) => {
    await login(page);
    // Click first email
    const firstEmail = page.locator('.message-list-item').first();
    if (await firstEmail.isVisible()) {
      await firstEmail.click();
      await page.waitForTimeout(1000);
    }
    // Open settings to toggle dark mode
    await page.click('button[aria-label="User menu"], [title="Settings"], button:has-text("Settings")');
    await page.waitForTimeout(500);
    // Try clicking the dark theme option
    await page.click('text=Settings', { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
    // Set dark mode via JS
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
    });
    await page.waitForTimeout(500);
    // Close any open dialog
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    await screenshot(page, "03-dark-mode");
    // Reset to light
    await page.evaluate(() => {
      document.documentElement.classList.remove("dark");
    });
  });

  test("04 - Compose email", async ({ page }) => {
    await login(page);
    // Click new mail button
    await page.click('.action-bar__btn--primary, button:has-text("New mail")');
    await page.waitForTimeout(1500);
    await screenshot(page, "04-compose");
  });

  test("05 - Schedule send dropdown", async ({ page }) => {
    await login(page);
    await page.click('.action-bar__btn--primary, button:has-text("New mail")');
    await page.waitForTimeout(1000);
    // Click the schedule dropdown (chevron next to send)
    const scheduleBtn = page.locator('.compose-dialog__send-btn--dropdown');
    if (await scheduleBtn.isVisible()) {
      await scheduleBtn.click();
      await page.waitForTimeout(500);
    }
    await screenshot(page, "05-schedule-send");
  });

  test("06 - Thread / conversation view", async ({ page }) => {
    await login(page);
    // Look for a thread indicator (message count badge)
    const thread = page.locator('.message-list-item--thread-header').first();
    if (await thread.isVisible({ timeout: 3000 }).catch(() => false)) {
      await thread.click();
      await page.waitForTimeout(1500);
    }
    await screenshot(page, "06-thread-view");
  });

  test("07 - Search and advanced search", async ({ page }) => {
    await login(page);
    // Focus search input
    const searchInput = page.locator('#search-input, input[placeholder*="Search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.click();
      await page.waitForTimeout(500);
    }
    await screenshot(page, "07-search");
  });

  test("08 - Folder context menu (export/import/color)", async ({ page }) => {
    await login(page);
    // Right-click on inbox folder
    const inbox = page.locator('[role="treeitem"]').first();
    await inbox.click({ button: "right" });
    await page.waitForTimeout(500);
    await screenshot(page, "08-folder-context-menu");
    await page.keyboard.press("Escape");
  });

  test("09 - Message context menu", async ({ page }) => {
    await login(page);
    const firstEmail = page.locator('.message-list-item').first();
    if (await firstEmail.isVisible()) {
      await firstEmail.click({ button: "right" });
      await page.waitForTimeout(500);
    }
    await screenshot(page, "09-message-context-menu");
    await page.keyboard.press("Escape");
  });

  test("10 - Calendar month view", async ({ page }) => {
    await login(page);
    // Click calendar in activity bar
    const calendarBtn = page.locator('button[aria-label="Calendar"], [title="Calendar"]').first();
    if (await calendarBtn.isVisible()) {
      await calendarBtn.click();
    } else {
      // Try clicking the calendar icon in the activity bar
      await page.locator('nav button').nth(2).click();
    }
    await page.waitForTimeout(1500);
    await screenshot(page, "10-calendar-month");
  });

  test("11 - Calendar week view", async ({ page }) => {
    await login(page);
    await page.locator('nav button').nth(2).click().catch(() => {});
    await page.waitForTimeout(1000);
    // Click week view button
    await page.click('button:has-text("Week")').catch(() => {});
    await page.waitForTimeout(1000);
    await screenshot(page, "11-calendar-week");
  });

  test("12 - Calendar event creation", async ({ page }) => {
    await login(page);
    await page.locator('nav button').nth(2).click().catch(() => {});
    await page.waitForTimeout(1000);
    await page.click('button:has-text("New Event")').catch(() => {});
    await page.waitForTimeout(1000);
    await screenshot(page, "12-calendar-event-form");
  });

  test("13 - Contacts page", async ({ page }) => {
    await login(page);
    // Click contacts in activity bar
    await page.locator('nav button').nth(1).click().catch(() => {});
    await page.waitForTimeout(1500);
    await screenshot(page, "13-contacts");
  });

  test("14 - Settings dialog - General", async ({ page }) => {
    await login(page);
    // Open user menu then settings
    const userMenuBtn = page.locator('[title="Settings"], button[aria-label="Settings"]').first();
    if (await userMenuBtn.isVisible()) {
      await userMenuBtn.click();
    } else {
      // Try toolbar settings button
      await page.locator('button').filter({ hasText: /settings/i }).first().click().catch(() => {});
    }
    await page.waitForTimeout(1500);
    await screenshot(page, "14-settings-general");
  });

  test("15 - Settings - Signatures", async ({ page }) => {
    await login(page);
    await page.locator('[title="Settings"], button[aria-label="Settings"]').first().click().catch(() => {});
    await page.waitForTimeout(1000);
    await page.click('text=Signatures').catch(() => {});
    await page.waitForTimeout(500);
    await screenshot(page, "15-settings-signatures");
  });

  test("16 - Settings - Filter rules", async ({ page }) => {
    await login(page);
    await page.locator('[title="Settings"], button[aria-label="Settings"]').first().click().catch(() => {});
    await page.waitForTimeout(1000);
    await page.click('text=Filters').catch(() => {});
    await page.waitForTimeout(500);
    await screenshot(page, "16-settings-filters");
  });

  test("17 - Settings - Templates", async ({ page }) => {
    await login(page);
    await page.locator('[title="Settings"], button[aria-label="Settings"]').first().click().catch(() => {});
    await page.waitForTimeout(1000);
    await page.click('text=Templates').catch(() => {});
    await page.waitForTimeout(500);
    await screenshot(page, "17-settings-templates");
  });

  test("18 - Message details / security (SPF/DKIM/DMARC)", async ({ page }) => {
    await login(page);
    // Find "Real email!" subject
    const realEmail = page.locator('.message-list-item__subject:has-text("Real email!")').first();
    if (await realEmail.isVisible({ timeout: 3000 }).catch(() => false)) {
      await realEmail.click();
      await page.waitForTimeout(1500);
      // Open message details via context menu or properties button
      // Try the "more" button or properties icon
      await page.locator('button[title="Message details"], button[aria-label="Message details"]').first().click().catch(async () => {
        // Fallback: right-click the email in the list and select properties
        await realEmail.click({ button: "right" });
        await page.waitForTimeout(300);
        await page.click('text=Message details').catch(() => {});
      });
      await page.waitForTimeout(1000);
      // Scroll to security section
      const securitySection = page.locator('text=Security').last();
      if (await securitySection.isVisible({ timeout: 2000 }).catch(() => false)) {
        await securitySection.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
      }
    }
    await screenshot(page, "18-message-details-security");
  });

  test("19 - Keyboard shortcuts dialog", async ({ page }) => {
    await login(page);
    await page.keyboard.press("?");
    await page.waitForTimeout(800);
    await screenshot(page, "19-keyboard-shortcuts");
    await page.keyboard.press("Escape");
  });

  test("20 - Snooze and scheduled virtual folders", async ({ page }) => {
    await login(page);
    // Click snoozed virtual folder
    const snoozedItem = page.locator('button:has-text("Snoozed")').first();
    if (await snoozedItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await snoozedItem.click();
      await page.waitForTimeout(1000);
    }
    await screenshot(page, "20-snoozed-folder");
  });

  test("21 - Read/unread visual indicators", async ({ page }) => {
    await login(page);
    // Just capture the inbox showing read/unread difference
    await page.waitForTimeout(1000);
    const listPane = page.locator('.mail-list-pane').first();
    if (await listPane.isVisible()) {
      await listPane.screenshot({ path: join(SCREENSHOTS_DIR, "21-read-unread-indicators.png") });
    } else {
      await screenshot(page, "21-read-unread-indicators");
    }
  });

  test("22 - Mobile layout", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto(BASE_URL);
    await page.waitForSelector('input[type="email"], input[placeholder*="email"], input[name="email"]', { timeout: 10000 });
    await page.fill('input[type="email"], input[placeholder*="email"], input[name="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    // Mobile layout doesn't show treeitem — wait for message list or loading
    await page.waitForTimeout(5000);
    await screenshot(page, "22-mobile-layout");
  });

  test("23 - Saved searches in sidebar", async ({ page }) => {
    await login(page);
    // Capture the sidebar showing saved searches section
    const sidebar = page.locator('nav[role="navigation"]').first();
    if (await sidebar.isVisible()) {
      await sidebar.screenshot({ path: join(SCREENSHOTS_DIR, "23-saved-searches-sidebar.png") });
    } else {
      await screenshot(page, "23-saved-searches-sidebar");
    }
  });

  test("24 - Calendar sharing dialog", async ({ page }) => {
    await login(page);
    await page.locator('nav button').nth(2).click().catch(() => {});
    await page.waitForTimeout(1000);
    // Right-click a calendar in the sidebar
    const calItem = page.locator('button:has-text("Calendar")').first();
    if (await calItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await calItem.click({ button: "right" });
      await page.waitForTimeout(300);
      await page.click('text=Share').catch(() => {});
      await page.waitForTimeout(500);
    }
    await screenshot(page, "24-calendar-sharing");
  });

  test("25 - AI copilot panel", async ({ page }) => {
    await login(page);
    // Click first email to have context
    const firstEmail = page.locator('.message-list-item').first();
    if (await firstEmail.isVisible()) {
      await firstEmail.click();
      await page.waitForTimeout(1000);
    }
    // Look for AI button
    const aiBtn = page.locator('button:has-text("AI"), [title*="AI"]').first();
    if (await aiBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await aiBtn.click();
      await page.waitForTimeout(1000);
    }
    await screenshot(page, "25-ai-copilot");
  });

  test("26 - Vacation / Out of Office settings", async ({ page }) => {
    await login(page);
    await page.locator('[title="Settings"], button[aria-label="Settings"]').first().click().catch(() => {});
    await page.waitForTimeout(1000);
    await page.click('text=Out of Office').catch(() => page.click('text=Vacation').catch(() => {}));
    await page.waitForTimeout(500);
    await screenshot(page, "26-vacation-settings");
  });

  test("27 - PGP / Security settings", async ({ page }) => {
    await login(page);
    await page.locator('[title="Settings"], button[aria-label="Settings"]').first().click().catch(() => {});
    await page.waitForTimeout(1000);
    await page.click('text=Security').catch(() => {});
    await page.waitForTimeout(500);
    await screenshot(page, "27-pgp-security");
  });
});
