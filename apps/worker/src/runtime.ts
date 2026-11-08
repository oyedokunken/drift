import type { Env } from './env.ts';
import { consoleSink, createLogger, type Logger } from './log.ts';
import { DEFAULT_UPSTREAM, type UpstreamOptions } from './upstream.ts';

/** The real logger and upstream options, built from the environment. */
export function productionRuntime(env: Env): { log: Logger; upstream: UpstreamOptions } {
  const log = createLogger(env.TFL_APP_KEY, consoleSink);
  const upstream: UpstreamOptions = {
    ...DEFAULT_UPSTREAM,
    key: env.TFL_APP_KEY,
    // Wrapped, because calling the global fetch detached throws "Illegal invocation".
    fetch: (input, init) => fetch(input, init),
    log,
    sleep: (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
    random: Math.random,
  };
  return { log, upstream };
}
