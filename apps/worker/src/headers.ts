/**
 * The app loads only its own scripts, styles, fonts and images, and talks only to
 * its own origin. Nothing else is permitted.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
};

/** Cache policies, chosen per kind of response rather than left to defaults. */
export const CACHE = {
  /** Live data: browsers may reuse it briefly, the Worker's cache holds it longer. */
  snapshot: 'public, max-age=15',
  /** Errors and health checks must never be reused. */
  none: 'no-store',
  /** Vite fingerprints everything under /assets/, so it can be kept forever. */
  immutable: 'public, max-age=31536000, immutable',
  /** The HTML shell names the current fingerprinted files, so always revalidate. */
  revalidate: 'no-cache',
  /** Icons, manifest and social image change rarely and are not fingerprinted. */
  daily: 'public, max-age=86400',
} as const;

/** A copy of the response with the security headers and the given cache policy. */
export function secured(response: Response, cacheControl: string): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  headers.set('Cache-Control', cacheControl);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
