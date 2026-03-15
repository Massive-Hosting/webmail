import { test, expect } from '@playwright/test';
import { ACCOUNT_INFO, login } from './helpers';

test.describe('Authentication', () => {
  test('redirects unauthenticated users to the login page', async ({ page }) => {
    await page.goto('/');
    // The app checks the session and should show the login page.
    await expect(
      page.getByRole('heading', { name: 'Sign in to Webmail' }),
    ).toBeVisible({ timeout: 15_000 });
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
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Sign in to Webmail' }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Email address').fill('nobody@example.com');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Should display an error message.
    await expect(
      page.getByText(/Invalid email or password|An error occurred/),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('shows validation error for empty password', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Sign in to Webmail' }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Email address').fill(ACCOUNT_INFO.email);
    // Leave password empty.
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(
      page.getByText('Please enter your password'),
    ).toBeVisible();
  });

  test('shows validation error for invalid email format', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Sign in to Webmail' }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Email address').fill('not-an-email');
    await page.getByLabel('Password').fill('something');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(
      page.getByText('Please enter a valid email address'),
    ).toBeVisible();
  });

  test('logout clears session', async ({ page }) => {
    await login(page);

    // Click the logout button (aria-label="Log out").
    await page.getByRole('button', { name: 'Log out' }).click();

    // After logout we should be redirected to login or see the login page.
    await expect(
      page.getByRole('heading', { name: 'Sign in to Webmail' }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
