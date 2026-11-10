import { createApp } from './app.ts';
import type { Env } from './env.ts';
import { productionRuntime } from './runtime.ts';
import { createSnapshotService } from './snapshot.ts';
import { DriftStore } from './store-object.ts';

export { DriftStore };

function storeStub(env: Env): DurableObjectStub<DriftStore> {
  return env.STORE.get(env.STORE.idFromName('drift'));
}

/** Built once per isolate, so request coalescing spans every request it serves. */
let app: ((request: Request) => Promise<Response>) | undefined;

function getApp(env: Env): (request: Request) => Promise<Response> {
  if (app) return app;
  const { log, upstream } = productionRuntime(env);
  app = createApp({
    now: () => new Date(),
    snapshot: createSnapshotService({
      upstream,
      log,
      now: () => new Date(),
      warmUp: () => storeStub(env).refresh(),
      store: {
        saveSummaries: (summaries) => storeStub(env).saveSummaries(summaries),
        loadSummaries: () => storeStub(env).loadSummaries(),
        saveSnapshot: (snapshot) => storeStub(env).saveSnapshot(snapshot),
        loadSnapshot: () => storeStub(env).loadSnapshot(),
      },
    }),
    // The Workers cache is a global with a `default` namespace.
    bus: (route) => storeStub(env).checkBus(route),
    cache: (caches as unknown as { default: Cache }).default,
    assets: (request) => env.ASSETS.fetch(request),
  });
  return app;
}

export default {
  fetch(request, env) {
    return getApp(env)(request);
  },

  scheduled(controller, env, ctx) {
    // One phase per minute, alternating, so each tick parses only some of the lines.
    const phase = Math.floor(controller.scheduledTime / 60_000) % 2;
    ctx.waitUntil(storeStub(env).refresh(phase));
  },
} satisfies ExportedHandler<Env>;
