import { apiErrorSchema, snapshotSchema, type Snapshot } from '@drift/shared';

export type SnapshotFailure = 'network' | 'http' | 'invalid';

/** A failed snapshot request. `message` is safe to show to a reader. */
export class SnapshotError extends Error {
  readonly failure: SnapshotFailure;

  constructor(failure: SnapshotFailure, message: string) {
    super(message);
    this.name = 'SnapshotError';
    this.failure = failure;
  }
}

export interface FetchedSnapshot {
  readonly snapshot: Snapshot;
  /** Server clock minus device clock in milliseconds, 0 if the server did not say. */
  readonly serverOffsetMs: number;
}

function serverOffset(response: Response, receivedAtMs: number): number {
  const header = response.headers.get('X-Server-Time');
  if (header === null) return 0;
  const serverMs = Date.parse(header);
  return Number.isNaN(serverMs) ? 0 : serverMs - receivedAtMs;
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = apiErrorSchema.safeParse(await response.json());
    if (body.success) return body.data.error.message;
  } catch {
    // The body was not JSON, so fall through to the generic message.
  }
  return `The server replied with status ${response.status}.`;
}

/**
 * Fetch the snapshot and validate it before anything is rendered. Anything that does
 * not match the shared schema is rejected, so the interface never shows half trusted data.
 */
export async function fetchSnapshot(
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchedSnapshot> {
  let response: Response;
  try {
    // No custom headers, so the browser can reuse the request preloaded in index.html.
    response = await fetchImpl('/api/snapshot', { signal });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new SnapshotError('network', 'The network request failed.');
  }
  const receivedAtMs = Date.now();

  if (!response.ok) throw new SnapshotError('http', await errorMessage(response));

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new SnapshotError('invalid', 'The server sent something that was not JSON.');
  }

  const parsed = snapshotSchema.safeParse(body);
  if (!parsed.success) {
    throw new SnapshotError('invalid', 'The server sent data in an unexpected shape.');
  }
  return { snapshot: parsed.data, serverOffsetMs: serverOffset(response, receivedAtMs) };
}
