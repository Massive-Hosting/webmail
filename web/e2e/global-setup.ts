/**
 * Playwright global setup -- runs once before all test files.
 *
 * Checks that the backend and frontend dev servers are reachable.
 * If either is down the entire suite is skipped with a clear message.
 * Includes retry logic for flaky CI where servers may take a moment to start.
 */

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2_000;
const REQUEST_TIMEOUT_MS = 5_000;

async function fetchWithRetry(
  url: string,
  label: string,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      return resp;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        console.warn(
          `[global-setup] ${label} not reachable (attempt ${attempt}/${MAX_RETRIES}), retrying in ${RETRY_DELAY_MS}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }
  throw lastError;
}

async function globalSetup() {
  const baseURL = process.env.BASE_URL ?? 'http://localhost:5173';

  // Check frontend dev server
  try {
    const res = await fetchWithRetry(baseURL, 'Frontend');
    if (!res.ok && res.status !== 304) {
      console.warn(`[global-setup] Frontend returned ${res.status} -- tests may fail.`);
    }
  } catch {
    console.error(
      '\n' +
      '='.repeat(70) + '\n' +
      '[global-setup] FAILED: Frontend dev server is not reachable.\n' +
      `  URL: ${baseURL}\n` +
      '\n' +
      '  To start it, run:\n' +
      '    cd web && npm run dev\n' +
      '    (or: just dev-ui)\n' +
      '='.repeat(70) + '\n',
    );
    process.exit(1);
  }

  // Check backend API
  try {
    const res = await fetchWithRetry(`${baseURL}/api/auth/session`, 'Backend API');
    // 401 is fine -- it means the server is up but we are unauthenticated.
    if (res.status >= 500) {
      console.warn(
        `[global-setup] Backend returned ${res.status} -- the server is running but may be misconfigured.`,
      );
    }
  } catch {
    console.error(
      '\n' +
      '='.repeat(70) + '\n' +
      '[global-setup] FAILED: Backend API is not reachable.\n' +
      `  URL: ${baseURL}/api/auth/session\n` +
      '\n' +
      '  To start the Go backend, run:\n' +
      '    just dev\n' +
      '    (or: cd .. && go run ./cmd/webmail-api)\n' +
      '\n' +
      '  Make sure the Vite proxy is configured to forward /api/ to the backend.\n' +
      '='.repeat(70) + '\n',
    );
    process.exit(1);
  }

  console.log('[global-setup] Frontend and backend are reachable.');
}

export default globalSetup;
