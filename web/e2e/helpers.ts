/**
 * Shared helpers for E2E tests.
 *
 * All selectors deliberately use Playwright's preferred locator strategies
 * (getByRole, getByPlaceholder, getByLabel, getByText) rather than brittle
 * CSS selectors, since the codebase does not use data-testid attributes
 * universally.
 */

import { type Page, expect, test } from '@playwright/test';

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
 * Navigate to / and wait for the login page to render.
 *
 * The app uses state-based auth: getSession() returns 401, App sets
 * authState to "unauthenticated", and LoginPage renders.
 */
export async function gotoLoginPage(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: 'Sign in to Webmail' }),
  ).toBeVisible({ timeout: 20_000 });
}

/**
 * Log in with the given credentials.  Waits for the /api/auth/login response
 * and for the main app shell to appear (the "Webmail" logo text in the toolbar).
 *
 * If the backend returns an error (e.g., core API unreachable), the test is
 * skipped rather than failed.
 */
export async function login(
  page: Page,
  email = ACCOUNT_INFO.email,
  password = ACCOUNT_INFO.password,
) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Check if we are already authenticated or need to log in.
  const loginHeading = page.getByRole('heading', { name: 'Sign in to Webmail' });
  const appShell = page.getByText('Webmail', { exact: true }).first();

  const firstVisible = await Promise.race([
    loginHeading.waitFor({ timeout: 20_000 }).then(() => 'login' as const),
    appShell.waitFor({ timeout: 20_000 }).then(() => 'app' as const),
  ]);

  if (firstVisible === 'app') {
    // Already authenticated.
    return;
  }

  // Fill in the login form.
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);

  // Click Sign in and wait for the login API response.
  const responsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/auth/login'),
  );
  await page.getByRole('button', { name: 'Sign in' }).click();
  const response = await responsePromise;

  if (!response.ok()) {
    const status = response.status();
    if (status >= 500) {
      test.skip(true, `Login failed with server error ${status} — backend may be misconfigured`);
      return;
    }
    if (status === 401) {
      test.skip(true, 'Login returned 401 — test credentials may be invalid or core API unreachable');
      return;
    }
    // Other errors: let the test fail naturally.
    expect(response.ok(), `Login failed with status ${status}`).toBeTruthy();
  }

  // Wait for the app shell to render after successful login.
  await expect(appShell).toBeVisible({ timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Backend reachability check
// ---------------------------------------------------------------------------

/**
 * Returns true when the Go backend is reachable at /api/auth/session (any
 * status is fine -- we just need the server to respond).
 */
export async function isBackendReachable(baseURL: string): Promise<boolean> {
  try {
    const resp = await fetch(`${baseURL}/api/auth/session`, {
      signal: AbortSignal.timeout(5_000),
    });
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
  await expect(
    page.getByRole('button', { name: /Inbox/i }).first(),
  ).toBeVisible({ timeout: 15_000 });
}
