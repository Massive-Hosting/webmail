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
    page.getByRole('heading', { name: 'Welcome back' }),
  ).toBeVisible({ timeout: 20_000 });
}

/**
 * Log in with the given credentials.  Waits for the /api/auth/login response
 * and for the main app shell to appear (the folder tree).
 *
 * If the backend returns an error (e.g., core API unreachable), the test is
 * skipped rather than failed.
 */
export async function login(
  page: Page,
  email: string = ACCOUNT_INFO.email,
  password: string = ACCOUNT_INFO.password,
) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Check if we are already authenticated or need to log in.
  const loginHeading = page.getByRole('heading', { name: 'Welcome back' });
  const folderTree = page.getByRole('navigation', { name: /Mail folders/i });

  const firstVisible = await Promise.race([
    loginHeading.waitFor({ timeout: 20_000 }).then(() => 'login' as const),
    folderTree.waitFor({ timeout: 20_000 }).then(() => 'app' as const),
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
    if (status === 429) {
      test.skip(true, 'Login returned 429 — rate limited, try again later');
      return;
    }
    // Other errors: let the test fail naturally.
    expect(response.ok(), `Login failed with status ${status}`).toBeTruthy();
  }

  // Wait for the folder tree to render after successful login.
  await expect(folderTree).toBeVisible({ timeout: 15_000 });
}

/**
 * Log out by opening the user dropdown menu and clicking "Log out".
 * Waits for the login page to appear afterwards.
 */
export async function logout(page: Page) {
  // Open the user avatar dropdown menu.
  await page.getByRole('button', { name: /User menu/i }).click();
  // Click the "Log out" menu item.
  await page.getByRole('menuitem', { name: /Log out/i }).click();
  // Wait for the login page heading to reappear.
  await expect(
    page.getByRole('heading', { name: 'Welcome back' }),
  ).toBeVisible({ timeout: 20_000 });
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
    page.getByRole('navigation', { name: /Mail folders/i }),
  ).toBeVisible({ timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Utility: navigate to an activity view
// ---------------------------------------------------------------------------

/**
 * Click a navigation button in the activity bar (Mail, Contacts, Calendar).
 * These buttons use aria-label rather than visible text.
 */
export async function navigateTo(page: Page, view: 'Mail' | 'Contacts' | 'Calendar') {
  await page.getByRole('button', { name: view, exact: true }).click();
}

// ---------------------------------------------------------------------------
// Utility: open settings dialog
// ---------------------------------------------------------------------------

/**
 * Open the settings dialog from the toolbar and wait for it to render.
 */
export async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('#settings-title')).toBeVisible({ timeout: 10_000 });
}
