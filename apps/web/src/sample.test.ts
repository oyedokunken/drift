import { LINE_IDS, snapshotSchema } from '@drift/shared';
import { describe, expect, it } from 'vitest';
import { buildSampleSnapshot } from './sample.ts';

const NOW = new Date('2026-11-08T09:00:00.000Z');

describe('buildSampleSnapshot', () => {
  const snapshot = buildSampleSnapshot(NOW);

  it('is a valid snapshot covering every line', () => {
    expect(snapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(snapshot.verdicts).toHaveLength(LINE_IDS.length);
  });

  it('is stamped with the time it was given and is not stale', () => {
    expect(snapshot.generatedAt).toBe(NOW.toISOString());
    expect(snapshot.stale).toBe(false);
  });

  it('shows a mismatch on the Tube and one outside it, decided by the real engine', () => {
    const mismatches = snapshot.verdicts
      .filter((verdict) => verdict.outcome === 'mismatch')
      .map((verdict) => [verdict.lineId, verdict.ruleId]);
    expect(mismatches).toEqual(
      expect.arrayContaining([
        ['central', 'quiet-while-good'],
        ['victoria', 'flowing-while-suspended'],
        ['piccadilly', 'wide-gaps'],
        ['windrush', 'long-waits'],
      ]),
    );
    expect(mismatches).toHaveLength(4);
  });

  it('gives a non Tube line a mismatch whatever the time of day it is opened', () => {
    const night = buildSampleSnapshot(new Date('2026-11-08T02:00:00.000Z'));
    const windrush = night.verdicts.find((verdict) => verdict.lineId === 'windrush');
    expect(windrush).toMatchObject({ mode: 'overground', outcome: 'mismatch' });
  });

  it('shows the DLR in step without counting its trains', () => {
    const dlr = snapshot.verdicts.find((verdict) => verdict.lineId === 'dlr');
    expect(dlr).toMatchObject({ outcome: 'match', observed: { vehicles15: null } });
  });

  it('includes a line that could not be checked, and lines in step', () => {
    const outcomes = snapshot.verdicts.map((verdict) => verdict.outcome);
    expect(outcomes).toContain('unknown');
    expect(outcomes.filter((outcome) => outcome === 'match').length).toBeGreaterThan(5);
  });
});
