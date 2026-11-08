import { snapshotSchema } from '@drift/shared';
import { describe, expect, it } from 'vitest';
import { buildSampleSnapshot } from './sample.ts';

const NOW = new Date('2026-11-08T09:00:00.000Z');

describe('buildSampleSnapshot', () => {
  const snapshot = buildSampleSnapshot(NOW);

  it('is a valid snapshot covering every line', () => {
    expect(snapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(snapshot.verdicts).toHaveLength(11);
  });

  it('is stamped with the time it was given and is not stale', () => {
    expect(snapshot.generatedAt).toBe(NOW.toISOString());
    expect(snapshot.stale).toBe(false);
  });

  it('shows one mismatch for each of the three rules, decided by the real engine', () => {
    const mismatches = snapshot.verdicts
      .filter((verdict) => verdict.outcome === 'mismatch')
      .map((verdict) => [verdict.lineId, verdict.ruleId]);
    expect(mismatches).toEqual(
      expect.arrayContaining([
        ['central', 'quiet-while-good'],
        ['victoria', 'flowing-while-suspended'],
        ['piccadilly', 'wide-gaps'],
      ]),
    );
    expect(mismatches).toHaveLength(3);
  });

  it('includes a line that could not be checked, and lines in step', () => {
    const outcomes = snapshot.verdicts.map((verdict) => verdict.outcome);
    expect(outcomes).toContain('unknown');
    expect(outcomes.filter((outcome) => outcome === 'match').length).toBeGreaterThan(5);
  });
});
