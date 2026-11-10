import { describe, expect, it, vi } from 'vitest';
import { createRefreshRuns } from './refresh-runs.ts';
import type { RefreshReport } from './refresh.ts';

const REPORT: RefreshReport = { refreshed: ['central'], failed: [] };

function controlled() {
  const resolvers: (() => void)[] = [];
  const run = vi.fn<(phase: number | undefined) => Promise<RefreshReport>>(
    () =>
      new Promise((resolve) => {
        resolvers.push(() => {
          resolve(REPORT);
        });
      }),
  );
  return {
    run,
    finishAll: () => {
      resolvers.splice(0).forEach((r) => {
        r();
      });
    },
  };
}

describe('createRefreshRuns', () => {
  it('shares one run between callers of the same phase', async () => {
    const { run, finishAll } = controlled();
    const refresh = createRefreshRuns(run, 2);
    const a = refresh(0);
    const b = refresh(0);
    expect(run).toHaveBeenCalledTimes(1);
    finishAll();
    await Promise.all([a, b]);
  });

  it('never lets one phase swallow the other', async () => {
    const { run, finishAll } = controlled();
    const refresh = createRefreshRuns(run, 2);
    const first = refresh(1);
    const second = refresh(0);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls.map(([phase]) => phase)).toEqual([1, 0]);
    finishAll();
    await Promise.all([first, second]);
  });

  it('lets a phase join a refresh of every line, which already covers it', async () => {
    const { run, finishAll } = controlled();
    const refresh = createRefreshRuns(run, 2);
    const all = refresh();
    const phase = refresh(0);
    expect(run).toHaveBeenCalledTimes(1);
    finishAll();
    await Promise.all([all, phase]);
  });

  it('runs a refresh of every line even while a phase runs', async () => {
    const { run, finishAll } = controlled();
    const refresh = createRefreshRuns(run, 2);
    const phase = refresh(0);
    const all = refresh();
    expect(run).toHaveBeenCalledTimes(2);
    finishAll();
    await Promise.all([phase, all]);
  });

  it('starts a new run once the last one finished, also after a failure', async () => {
    const run = vi
      .fn<(phase: number | undefined) => Promise<RefreshReport>>()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(REPORT);
    const refresh = createRefreshRuns(run, 2);
    await expect(refresh(0)).rejects.toThrow('down');
    await expect(refresh(0)).resolves.toEqual(REPORT);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('wraps a phase number past the number of phases', async () => {
    const { run, finishAll } = controlled();
    const refresh = createRefreshRuns(run, 2);
    const a = refresh(2);
    const b = refresh(0);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(0);
    finishAll();
    await Promise.all([a, b]);
  });
});
