/**
 * Shared helpers for E2E tests.
 *
 * All selectors deliberately use Playwright's preferred locator strategies
 * (getByRole, getByPlaceholder, getByLabel, getByText) rather than brittle
 * CSS selectors, since the codebase does not use data-testid attributes
 * universally.
 */

import { type Page, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Test accounts
// ---------------------------------------------------------------------------
export const ACCOUNT_INFO = {
  email: 'info@acme.customer.mhst.io',
  password: 'test1234',
} as const;

export const ACCOUNT_SUPPORT = {
  email: 'support@acme.customer.mhst.io',
  password: 'test1234',
} as const;

// ---------------------------------------------------------------------------
// Login helper
// ---------------------------------------------------------------------------

/**
 * Log in with the given credentials.  Waits for the /api/auth/login response
 * and for the main app shell to appear (the "Webmail" logo text in the toolbar).
 */
export async function login(
  page: Page,
  email = ACCOUNT_INFO.email,
  password = ACCOUNT_INFO.password,
) {
  await page.goto('/');

  // The app first checks the session; if unauthenticated it shows the login
  // page.  Wait for either the login heading or the app shell.
  const loginHeading = page.getByRole('heading', { name: 'Sign in to Webmail' });
  const appShell = page.getByText('Webmail', { exact: true }).first();

  const firstVisible = await Promise.race([
    loginHeading.waitFor({ timeout: 15_000 }).then(() => 'login' as const),
    appShell.waitFor({ timeout: 15_000 }).then(() => 'app' as const),
  ]);

  if (firstVisible === 'app') {
    // Already authenticated — nothing to do.
    return;
  }

  // Fill in the login form.
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);

  // Submit and wait for the API response.
  const [response] = await Promise.all([
    page.waitForResponse(
      (resp) => resp.url().includes('/api/auth/login') && resp.status() < 400,
    ),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ]);

  expect(response.ok()).toBeTruthy();

  // Wait for the app shell to render after successful login.
  await expect(appShell).toBeVisible({ timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Backend reachability check
// ---------------------------------------------------------------------------

/**
 * Returns true when the Go backend is reachable at /api/auth/session (any
 * status is fine — we just need the server to respond).
 */
export async function isBackendReachable(baseURL: string): Promise<boolean> {
  try {
    const resp = await fetch(`${baseURL}/api/auth/session`, {
      signal: AbortSignal.timeout(5_000),
    });
    // Any HTTP response means the backend is up.
    return resp.status > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Utility: wait for folder tree to load
// ---------------------------------------------------------------------------

/**
 * Wait until at least the Inbox folder is visible in the sidebar.
 */
export async function waitForFolderTree(page: Page) {
  // The folder tree renders mailbox names as buttons.  "Inbox" is always present.
  await expect(
    page.getByRole('button', { name: /Inbox/i }).first(),
  ).toBeVisible({ timeout: 15_000 });
}
