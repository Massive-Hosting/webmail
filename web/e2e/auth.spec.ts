import { test, expect } from '@playwright/test';
import { ACCOUNT_INFO, login, gotoLoginPage } from './helpers';

test.describe('Authentication', () => {
  test('shows login page for unauthenticated users', async ({ page }) => {
    await gotoLoginPage(page);
  });

  test('logs in with valid credentials and shows inbox', async ({ page }) => {
    await login(page);

    // After login the app shell should render with the Webmail brand.
    await expect(page.getByText('Webmail', { exact: true }).first()).toBeVisible();

    // The session endpoint should now return 200.
    const session = await page.request.get('/api/auth/session');
    expect(session.ok()).toBeTruthy();
    const body = await session.json();
    expect(body.email).toBe(ACCOUNT_INFO.email);
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await gotoLoginPage(page);

    await page.getByLabel('Email address').fill('nobody@example.com');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Should display an error message.
    await expect(
      page.getByText(/Invalid email or password|An error occurred/),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('shows validation error for empty password', async ({ page }) => {
    await gotoLoginPage(page);

    await page.getByLabel('Email address').fill(ACCOUNT_INFO.email);
    // Leave password empty.
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(
      page.getByText('Please enter your password'),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('shows validation error for invalid email format', async ({ page }) => {
    await gotoLoginPage(page);

    // Use an email that passes browser's native type="email" validation
    // but fails the app's regex (which requires a dot in the domain).
    await page.getByLabel('Email address').fill('user@localhost');
    await page.getByLabel('Password').fill('something');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(
      page.getByText('Please enter a valid email address'),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('logout clears session', async ({ page }) => {
    await login(page);

    // Click the logout button (aria-label="Log out").
    await page.getByRole('button', { name: 'Log out' }).click();

    // After logout, the app redirects to /login. Wait for the login page.
    await expect(
      page.getByRole('heading', { name: 'Sign in to Webmail' }),
    ).toBeVisible({ timeout: 20_000 });
  });
});
