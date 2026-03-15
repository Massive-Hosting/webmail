/**
 * Playwright global setup — runs once before all test files.
 *
 * Checks that the backend and frontend dev servers are reachable.
 * If either is down the entire suite is skipped with a clear message.
 */

async function globalSetup() {
  const baseURL = process.env.BASE_URL ?? 'http://localhost:5173';

  // Check frontend dev server
  try {
    const res = await fetch(baseURL, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok && res.status !== 304) {
      console.warn(`[global-setup] Frontend returned ${res.status} — tests may fail.`);
    }
  } catch {
    console.error(
      `[global-setup] Frontend dev server is not reachable at ${baseURL}.\n` +
      `  Start it with: cd web && npm run dev  (or: just dev-ui)`,
    );
    process.exit(1);
  }

  // Check backend API
  try {
    const res = await fetch(`${baseURL}/api/auth/session`, {
      signal: AbortSignal.timeout(5_000),
    });
    // 401 is fine — it means the server is up.
    if (res.status >= 500) {
      console.warn(`[global-setup] Backend returned ${res.status} — tests may fail.`);
    }
  } catch {
    console.error(
      `[global-setup] Backend API is not reachable via ${baseURL}/api/.\n` +
      `  Start it with: just dev  (or: cd .. && go run ./cmd/webmail-api)`,
    );
    process.exit(1);
  }

  console.log('[global-setup] Frontend and backend are reachable.');
}

export default globalSetup;
