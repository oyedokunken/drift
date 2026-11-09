import { describe, expect, it } from 'vitest';
import type { LineId, LineStatus, Prediction, Verdict } from '@drift/shared';
import fixture from '../fixtures/predictions-2026-11-08-sunday-morning.json' with { type: 'json' };
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

function lineWith(
  lineId: LineId,
  platformTimes: readonly (readonly number[])[],
  at = NOW,
) {
  return summarise(
    lineId,
    platformTimes.flatMap((due, index) => platform(lineId, index + 1, due)),
    at,
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
const healthyNetwork = (at = NOW) =>
  HEALTHY_LINES.map((lineId) =>
    lineWith(
      lineId,
      Array.from({ length: 8 }, () => every(4)),
      at,
    ),
  );

function verdictFor(
  lineId: LineId,
  summaries: ReturnType<typeof lineWith>[],
  at = NOW,
): Verdict {
  const verdicts = evaluate([lineId, ...HEALTHY_LINES].map(status), summaries, at);
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

  describe('a line with half its platforms stranded', () => {
    const frequent = Array.from({ length: 5 }, () => every(4));
    const stranded = Array.from({ length: 5 }, () => [24]);

    it('is flagged though the line total of trains looks healthy', () => {
      const line = lineWith('central', [...frequent, ...stranded]);
      expect(line.vehicles15).toBeGreaterThanOrEqual(15);
      const verdict = verdictFor('central', [...healthyNetwork(), line]);
      expect(verdict).toMatchObject({
        outcome: 'mismatch',
        ruleId: 'long-waits',
        confidence: 'high',
      });
      expect(verdict.reason).toContain('5 of 10 platforms');
    });

    it('is not flagged when only a few platforms wait long', () => {
      const line = lineWith('central', [
        ...Array.from({ length: 9 }, () => every(4)),
        [24],
      ]);
      expect(verdictFor('central', [...healthyNetwork(), line]).outcome).toBe('match');
    });
  });

  describe('wide gaps', () => {
    it.each([15, 20, 25, 28])(
      'fires from live shaped predictions with trains %i minutes apart',
      (spacing) => {
        const platforms = Array.from({ length: 8 }, () => [2, 2 + spacing]);
        const verdict = verdictFor('central', [
          ...healthyNetwork(),
          lineWith('central', platforms),
        ]);
        expect(verdict).toMatchObject({ outcome: 'mismatch', ruleId: 'wide-gaps' });
      },
    );

    it('fires when only one train is due at each platform in the whole window', () => {
      const platforms = Array.from({ length: 8 }, () => [3]);
      const verdict = verdictFor('central', [
        ...healthyNetwork(),
        lineWith('central', platforms),
      ]);
      expect(verdict).toMatchObject({ outcome: 'mismatch', ruleId: 'wide-gaps' });
    });

    it('does not fire on a ten minute service, the slowest healthy line sampled', () => {
      const platforms = Array.from({ length: 8 }, () => every(10, 4));
      const verdict = verdictFor('central', [
        ...healthyNetwork(),
        lineWith('central', platforms),
      ]);
      expect(verdict).toMatchObject({ outcome: 'match', ruleId: 'in-step' });
    });
  });

  describe('a Good Service line with no trains', () => {
    const empty = (at: Date) =>
      verdictFor('central', [...healthyNetwork(at), lineWith('central', [], at)], at);

    it('is a mismatch during service hours', () => {
      expect(empty(NOW)).toMatchObject({ outcome: 'mismatch', ruleId: 'no-trains' });
    });

    it.each([
      ['overnight', '2026-11-08T02:00:00Z'],
      ['before the first trains', '2026-11-08T05:30:00Z'],
      ['after the last trains', '2026-11-08T23:30:00Z'],
    ])('stays unknown %s', (_name, at) => {
      expect(empty(new Date(at))).toMatchObject({
        outcome: 'unknown',
        ruleId: 'no-arrivals',
      });
    });

    it('is not a mismatch when the line is Service Closed with no trains', () => {
      const closed: LineStatus = {
        lineId: 'central',
        statuses: [{ severity: 20, label: 'Service Closed' }],
      };
      const summaries = [...healthyNetwork(), lineWith('central', [])];
      const verdicts = evaluate([closed, ...HEALTHY_LINES.map(status)], summaries, NOW);
      expect(verdicts[0]?.outcome).not.toBe('mismatch');
    });

    it('stays unknown when the whole feed is empty, as in a TfL outage', () => {
      const lines: LineId[] = ['central', ...HEALTHY_LINES];
      const summaries = lines.map((lineId) => lineWith(lineId, []));
      const verdicts = evaluate(lines.map(status), summaries, NOW);
      expect(verdicts.every((verdict) => verdict.outcome === 'unknown')).toBe(true);
    });

    it('stays unknown when two lines go empty together, as when one fetch group fails', () => {
      const summaries = [
        ...healthyNetwork(),
        lineWith('central', []),
        lineWith('piccadilly', []),
      ];
      const lines: LineId[] = ['central', 'piccadilly', ...HEALTHY_LINES];
      const verdicts = evaluate(lines.map(status), summaries, NOW);
      expect(verdicts.slice(0, 2).map((verdict) => verdict.outcome)).toEqual([
        'unknown',
        'unknown',
      ]);
    });

    it('stays unknown when the feed is stale', () => {
      const old = new Date(NOW.getTime() - 20 * MINUTE * 1000);
      const summaries = [...healthyNetwork(), lineWith('central', [], old)];
      expect(verdictFor('central', summaries).outcome).toBe('unknown');
    });
  });

  describe('on real captured data (Sunday morning, 2026-11-08)', () => {
    const captured = fixture.lines as unknown as Record<string, Prediction[]>;
    const lineIds = Object.keys(captured) as LineId[];

    it('raises no mismatch on the four healthy lines sampled', () => {
      const summaries = lineIds.map((lineId) =>
        summarise(lineId, captured[lineId] ?? [], NOW),
      );
      const verdicts = evaluate(lineIds.map(status), summaries, NOW);
      expect(verdicts.filter((verdict) => verdict.outcome === 'mismatch')).toEqual([]);
    });
  });
});
