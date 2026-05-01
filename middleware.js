export const config = {
  matcher: '/(.*)',
  runtime: 'edge',
};

export default function middleware(request) {
  const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;
  const CRON_SECRET = process.env.CRON_SECRET;

  // ── Allow Vercel Cron requests through without Basic Auth ─────────────────
  // Vercel injects: Authorization: Bearer <CRON_SECRET> on all cron calls.
  // The cron endpoint itself also validates this header as a second check.
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization');
    if (authHeader === `Bearer ${CRON_SECRET}`) {
      return; // Let cron requests pass
    }
  }

  // ── Dashboard Basic Auth ──────────────────────────────────────────────────
  if (!DASHBOARD_PASSWORD) {
    return new Response('Server misconfiguration: DASHBOARD_PASSWORD environment variable is not set.', {
      status: 503,
    });
  }

  const authHeader = request.headers.get('authorization');

  if (authHeader && authHeader.startsWith('Basic ')) {
    const base64Credentials = authHeader.slice('Basic '.length);
    const credentials = atob(base64Credentials);
    const colonIndex = credentials.indexOf(':');
    const password = credentials.slice(colonIndex + 1);

    if (password === DASHBOARD_PASSWORD) {
      return; // Valid password — allow through
    }
  }

  // No valid credentials — trigger browser's native Basic Auth dialog
  return new Response('Unauthorized — Access to this dashboard is restricted.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Crypto Trading Dashboard", charset="UTF-8"',
    },
  });
}
