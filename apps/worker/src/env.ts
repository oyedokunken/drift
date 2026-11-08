import type { DriftStore } from './store-object.ts';

/** Bindings configured in wrangler.jsonc, plus the TfL key secret. */
export interface Env {
  /** TfL application key. A Cloudflare secret in production, `.dev.vars` locally. */
  readonly TFL_APP_KEY: string;
  /** The built web app. */
  readonly ASSETS: Fetcher;
  /** Durable Object holding line summaries and the last good snapshot. */
  readonly STORE: DurableObjectNamespace<DriftStore>;
}
