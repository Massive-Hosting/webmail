/**
 * Tauri bridge — detects the Tauri runtime and sets up native integrations.
 * Imported from main.tsx; no-op when running in a regular browser.
 */

export const isTauri = (): boolean => '__TAURI__' in window;

/**
 * Initialize Tauri-specific integrations.
 * Call once from main.tsx on app startup.
 */
export async function initTauriBridge(): Promise<void> {
  if (!isTauri()) return;

  const { listen } = await import('@tauri-apps/api/event');

  // Listen for tray "compose" action.
  await listen('tray-compose', () => {
    // Dispatch a custom DOM event that the React app can listen for.
    window.dispatchEvent(new CustomEvent('webmail:compose'));
  });

  // Listen for mailto: deep link events.
  await listen<string>('mailto', (event) => {
    const mailtoUrl = event.payload;
    window.dispatchEvent(
      new CustomEvent('webmail:mailto', { detail: parseMailto(mailtoUrl) })
    );
  });

  console.log('[tauri-bridge] initialized');
}

interface MailtoParams {
  to?: string;
  subject?: string;
  body?: string;
  cc?: string;
  bcc?: string;
}

function parseMailto(uri: string): MailtoParams {
  // Format: mailto:user@example.com?subject=Hello&body=Hi
  const [address, queryString] = uri.replace('mailto:', '').split('?');
  const params: MailtoParams = {};

  if (address) {
    params.to = decodeURIComponent(address);
  }

  if (queryString) {
    const searchParams = new URLSearchParams(queryString);
    if (searchParams.has('subject'))
      params.subject = searchParams.get('subject')!;
    if (searchParams.has('body')) params.body = searchParams.get('body')!;
    if (searchParams.has('cc')) params.cc = searchParams.get('cc')!;
    if (searchParams.has('bcc')) params.bcc = searchParams.get('bcc')!;
  }

  return params;
}
