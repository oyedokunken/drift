import { describe, expect, it } from 'vitest';
import type { LineId, LineStatus, Prediction, Verdict } from '@drift/shared';
import { evaluate } from './evaluate.ts';
import { summarise } from './summarise.ts';

/**
 * End to end: raw predictions go through `summarise` and `evaluate`, so nothing the
 * engine reads is injected by hand. The unit tests elsewhere set summary fields
 * directly, which cannot show whether the real pipeline can reach a verdict.
 */

const NOW = new Date('2026-11-08T09:00:00.000Z');
const MINUTE = 60;

const GOOD_SERVICE: LineStatus['statuses'] = [{ severity: 10, label: 'Good Service' }];

function status(lineId: LineId): LineStatus {
  return { lineId, statuses: GOOD_SERVICE };
}

/**
 * The next trains at one platform, as TfL reports them: only those due inside the 30
 * minute lookahead. `dueMinutes` are minutes from now.
 */
function platform(
  lineId: LineId,
  platformNumber: number,
  dueMinutes: readonly number[],
): Prediction[] {
  return dueMinutes.map((minutes, index) => ({
    lineId,
    vehicleId: `${lineId}-${platformNumber}-${index}`,
    naptanId: `940GZZ${lineId}${platformNumber}`,
    platformName: `Platform ${platformNumber}`,
    direction: platformNumber % 2 === 0 ? 'inbound' : 'outbound',
    timeToStation: Math.round(minutes * MINUTE),
  }));
}

/** Trains every `spacing` minutes from `first`, kept inside the 30 minute lookahead. */
function every(spacing: number, first = 3): number[] {
  const due: number[] = [];
  for (let minutes = first; minutes <= 30; minutes += spacing) due.push(minutes);
  return due;
}

function lineWith(lineId: LineId, platformTimes: readonly (readonly number[])[]) {
  return summarise(
    lineId,
    platformTimes.flatMap((due, index) => platform(lineId, index + 1, due)),
    NOW,
  );
}

const HEALTHY_LINES: readonly LineId[] = [
  'bakerloo',
  'circle',
  'district',
  'jubilee',
  'northern',
  'victoria',
];

/** Six busy lines, so the network wide guard sees a normal network around the line under test. */
const healthyNetwork = () =>
  HEALTHY_LINES.map((lineId) =>
    lineWith(
      lineId,
      Array.from({ length: 8 }, () => every(4)),
    ),
  );

function verdictFor(lineId: LineId, summaries: ReturnType<typeof lineWith>[]): Verdict {
  const verdicts = evaluate([lineId, ...HEALTHY_LINES].map(status), summaries, NOW);
  const found = verdicts.find((verdict) => verdict.lineId === lineId);
  if (found === undefined) throw new Error(`No verdict for ${lineId}`);
  return found;
}

describe('end to end, from raw predictions to a verdict', () => {
  it('reads a healthy line as in step', () => {
    const verdict = verdictFor('central', [
      ...healthyNetwork(),
      lineWith(
        'central',
        Array.from({ length: 8 }, () => every(4)),
      ),
    ]);
    expect(verdict).toMatchObject({ outcome: 'match', ruleId: 'in-step' });
  });

  it('raises quiet while good when one train is due on a Good Service line', () => {
    const verdict = verdictFor('central', [
      ...healthyNetwork(),
      lineWith('central', [[6], [], [], []]),
    ]);
    expect(verdict).toMatchObject({ outcome: 'mismatch', ruleId: 'quiet-while-good' });
  });

  it('raises flowing while suspended when trains keep running on a suspended line', () => {
    const suspended: LineStatus = {
      lineId: 'central',
      statuses: [{ severity: 2, label: 'Suspended' }],
    };
    const summaries = [
      ...healthyNetwork(),
      lineWith(
        'central',
        Array.from({ length: 8 }, () => every(4)),
      ),
    ];
    const verdicts = evaluate([suspended, ...HEALTHY_LINES.map(status)], summaries, NOW);
    expect(verdicts[0]).toMatchObject({
      outcome: 'mismatch',
      ruleId: 'flowing-while-suspended',
    });
  });

  /*
   * The cases below describe what the product should detect and does not yet. Each is
   * written as the behaviour we want, and `it.fails` keeps CI green while it is not met.
   * When the engine is fixed the test starts passing, vitest reports that, and the
   * `.fails` is removed.
   */

  it.fails(
    'flags a line where half the platforms wait far too long, though the line total looks healthy',
    () => {
      const frequent = Array.from({ length: 5 }, () => every(4));
      const stranded = Array.from({ length: 5 }, () => [24]);
      const verdict = verdictFor('central', [
        ...healthyNetwork(),
        lineWith('central', [...frequent, ...stranded]),
      ]);
      expect(verdict.outcome).toBe('mismatch');
    },
  );

  it.fails('can reach the wide gaps rule from live shaped predictions', () => {
    const verdicts = [20, 22, 25, 28].map((spacing) => {
      const platforms = Array.from({ length: 8 }, () => [
        2,
        2 + spacing,
        2 + 2 * spacing,
      ]);
      return verdictFor('central', [...healthyNetwork(), lineWith('central', platforms)]);
    });
    expect(verdicts.some((verdict) => verdict.ruleId === 'wide-gaps')).toBe(true);
  });

  it.fails('treats a Good Service line with no trains at all as a mismatch', () => {
    const verdict = verdictFor('central', [...healthyNetwork(), lineWith('central', [])]);
    expect(verdict.outcome).toBe('mismatch');
  });
});
