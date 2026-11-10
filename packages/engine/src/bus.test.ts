import { describe, expect, it } from 'vitest';
import type { OfficialStatus } from '@drift/shared';
import { BUS_PROFILE } from './config.ts';
import { evaluateBus, type BusCheck } from './bus.ts';
import { summariseWith, type SummaryBody, type TrainPrediction } from './summarise.ts';

/** A Tuesday at 14:00 in London, inside the service window. */
const NOW = new Date('2026-11-10T14:00:00.000Z');
const MINUTE = 60;

const GOOD: [OfficialStatus, ...OfficialStatus[]] = [
  { severity: 10, label: 'Good Service' },
];

function stop(index: number, dueMinutes: readonly number[]): TrainPrediction[] {
  return dueMinutes.map((minutes, bus) => ({
    vehicleId: `BUS${index}-${bus}`,
    naptanId: `stop-${index}`,
    platformName: 'A',
    direction: 'outbound' as const,
    timeToStation: Math.round(minutes * MINUTE),
  }));
}

/** Predictions for `count` stops, each with the same buses due. */
function stops(
  count: number,
  dueMinutes: readonly number[],
  firstIndex = 0,
): TrainPrediction[] {
  return Array.from({ length: count }, (_, i) => stop(firstIndex + i, dueMinutes)).flat();
}

function reading(predictions: readonly TrainPrediction[], at = NOW): SummaryBody {
  return summariseWith(BUS_PROFILE, predictions, at);
}

function check(overrides: Partial<BusCheck> & Pick<BusCheck, 'summary'>): BusCheck {
  return {
    routeId: '207',
    statuses: GOOD,
    lastRunningAt: null,
    feedHealthy: true,
    now: NOW,
    ...overrides,
  };
}

describe('bus route with buses, end to end from raw predictions', () => {
  it('is in step when buses are spread evenly across the stops', () => {
    const verdict = evaluateBus(check({ summary: reading(stops(40, [3, 9, 15])) }));
    expect(verdict).toMatchObject({
      outcome: 'match',
      ruleId: 'in-step',
      confidence: 'high',
      observed: { platformsMeasured: 40, longWaitPlatforms: 0 },
    });
  });

  it('raises long waits when many stops of a frequent route have nothing for 20 minutes', () => {
    const waiting = stops(20, [24]);
    const running = stops(20, [3, 9], 20);
    const verdict = evaluateBus(check({ summary: reading([...waiting, ...running]) }));
    expect(verdict).toMatchObject({ outcome: 'mismatch', ruleId: 'long-waits' });
    expect(verdict.reason).toContain('20 of 40 stops');
    expect(verdict.confidence).toBe('medium');
  });

  it('is high confidence when 60 percent of 40 stops are waiting', () => {
    const verdict = evaluateBus(
      check({ summary: reading([...stops(24, [24]), ...stops(16, [3, 9], 24)]) }),
    );
    expect(verdict).toMatchObject({ ruleId: 'long-waits', confidence: 'high' });
  });

  it('is low confidence on a small sample of stops', () => {
    const verdict = evaluateBus(
      check({ summary: reading([...stops(10, [24]), ...stops(10, [3, 9], 10)]) }),
    );
    expect(verdict).toMatchObject({ ruleId: 'long-waits', confidence: 'low' });
  });

  it('stays in step just under the 40 percent bar, at lower confidence', () => {
    const verdict = evaluateBus(
      check({ summary: reading([...stops(14, [24]), ...stops(26, [3, 9], 14)]) }),
    );
    expect(verdict).toMatchObject({ outcome: 'match', confidence: 'medium' });
  });

  it('leaves a route with too few stops unknown', () => {
    const verdict = evaluateBus(check({ summary: reading(stops(10, [24])) }));
    expect(verdict).toMatchObject({
      outcome: 'unknown',
      ruleId: 'not-measurable',
      confidence: 'low',
    });
    expect(verdict.reason).toContain('Only 10 stops');
  });

  it('leaves an infrequent route unknown, as a 20 minute wait is normal on it', () => {
    const verdict = evaluateBus(check({ summary: reading(stops(30, [5, 25])) }));
    expect(verdict).toMatchObject({ outcome: 'unknown', ruleId: 'not-measurable' });
    expect(verdict.reason).toContain('too far apart');
  });

  it('leaves a night route unknown, even when buses are running', () => {
    const verdict = evaluateBus(
      check({ routeId: 'N207', summary: reading(stops(40, [3, 9, 15])) }),
    );
    expect(verdict).toMatchObject({ outcome: 'unknown', ruleId: 'not-measurable' });
    expect(verdict.reason).toContain('Night routes');
  });

  it('does not take a route starting with N followed by a letter for a night route', () => {
    const verdict = evaluateBus(
      check({ routeId: 'NX1', summary: reading(stops(40, [3, 9, 15])) }),
    );
    expect(verdict.outcome).toBe('match');
  });
});

describe('bus route with no buses predicted', () => {
  const silent = reading([]);
  const earlier = new Date('2026-11-10T13:30:00.000Z');

  it('is a mismatch when the route had buses 30 minutes ago and the feed is healthy', () => {
    const verdict = evaluateBus(check({ summary: silent, lastRunningAt: earlier }));
    expect(verdict).toMatchObject({
      outcome: 'mismatch',
      ruleId: 'no-buses',
      confidence: 'medium',
    });
    expect(verdict.reason).toContain('30 minutes ago');
  });

  it.each([
    ['there is no earlier reading', { lastRunningAt: null }],
    [
      'the route last had buses over 90 minutes ago',
      { lastRunningAt: new Date('2026-11-10T12:00:00.000Z') },
    ],
    [
      'the rest of the feed looks unhealthy',
      { lastRunningAt: earlier, feedHealthy: false },
    ],
    ['it is a night route', { lastRunningAt: earlier, routeId: 'N207' }],
    [
      'the status is Minor Delays, not Good Service',
      { lastRunningAt: earlier, statuses: [{ severity: 9, label: 'Minor Delays' }] },
    ],
  ] as const)('stays unknown when %s', (_name, overrides) => {
    const verdict = evaluateBus(check({ summary: silent, ...overrides }));
    expect(verdict.outcome).toBe('unknown');
    expect(verdict.ruleId).not.toBe('no-buses');
  });

  it.each([
    ['Sunday evening', '2026-11-15T19:30:00.000Z'],
    ['early morning', '2026-11-10T05:00:00.000Z'],
    ['Saturday night', '2026-11-14T22:00:00.000Z'],
  ])('stays unknown outside the service window: %s', (_name, at) => {
    const now = new Date(at);
    const verdict = evaluateBus(
      check({
        summary: reading([], now),
        lastRunningAt: now,
        now,
      }),
    );
    expect(verdict).toMatchObject({ outcome: 'unknown', ruleId: 'not-measurable' });
  });
});

describe('bus route status', () => {
  const running = reading(stops(40, [3, 9, 15]));

  it.each([
    ['Special Service', 0, 'partial-status'],
    ['Severe Delays', 6, 'delays-unverifiable'],
    ['Reduced Service', 7, 'partial-status'],
    ['Something New', 99, 'unclassified-status'],
  ])('resolves %s to unknown without reading the buses', (label, severity, ruleId) => {
    const verdict = evaluateBus(
      check({ summary: running, statuses: [{ severity, label }] }),
    );
    expect(verdict).toMatchObject({ outcome: 'unknown', ruleId, observed: null });
  });

  it('cannot check a suspended route, as buses are not counted', () => {
    const verdict = evaluateBus(
      check({ summary: running, statuses: [{ severity: 2, label: 'Suspended' }] }),
    );
    expect(verdict).toMatchObject({ outcome: 'unknown', ruleId: 'not-measurable' });
  });

  it('keeps every status label when a route has several', () => {
    const verdict = evaluateBus(
      check({
        summary: running,
        statuses: [
          { severity: 10, label: 'Good Service' },
          { severity: 9, label: 'Minor Delays' },
        ],
      }),
    );
    expect(verdict.official.label).toBe('Good Service and Minor Delays');
  });
});
