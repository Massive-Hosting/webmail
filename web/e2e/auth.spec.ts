import { test, expect } from '@playwright/test';
import { ACCOUNT_INFO, login, logout, gotoLoginPage } from './helpers';

test.describe('Authentication', () => {
  test('shows login page for unauthenticated users', async ({ page }) => {
    await gotoLoginPage(page);
  });

  test('logs in with valid credentials and shows inbox', async ({ page }) => {
    await login(page);

    // After login, the folder tree navigation should be visible.
    await expect(
      page.getByRole('navigation', { name: /Mail folders/i }),
    ).toBeVisible();

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

    // Should display an error message (the login-page component shows a
    // translated error string from the API response).
    await expect(
      page.getByText(/Invalid email or password|An error occurred/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('shows validation error for empty password', async ({ page }) => {
    await gotoLoginPage(page);

    await page.getByLabel('Email address').fill(ACCOUNT_INFO.email);
    // Leave password empty.
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(
      page.getByText('Please enter your password'),
    ).toBeVisible();
  });

  test('shows validation error for invalid email format', async ({ page }) => {
    await gotoLoginPage(page);

    // Use an email without a dot in the domain, which fails the app's regex.
    await page.getByLabel('Email address').fill('user@localhost');
    await page.getByLabel('Password').fill('something');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(
      page.getByText('Please enter a valid email address'),
    ).toBeVisible();
  });

  test('logout clears session', async ({ page }) => {
    await login(page);

    // Use the shared logout helper which opens the user dropdown.
    await logout(page);

    // After logout, the login heading should appear.
    await expect(
      page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();
  });
});
