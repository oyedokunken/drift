import { describe, expect, it } from 'vitest';
import {
  LINE_IDS,
  MODE_IDS,
  modeOfLine,
  type LineId,
  type LineStatus,
  type Prediction,
  type Verdict,
} from '@drift/shared';
import predictionFixture from '../fixtures/predictions-2026-11-10-evening-other-modes.json' with { type: 'json' };
import statusFixture from '../fixtures/status-2026-11-10-evening-other-modes.json' with { type: 'json' };
import {
  LONG_WAIT_SEC,
  MODE_PROFILES,
  profileOf,
  rulesOf,
  type ModeProfile,
} from './config.ts';
import { evaluate } from './evaluate.ts';
import { summarise } from './summarise.ts';

/** A Tuesday at 14:00 in London, inside every service window. */
const NOW = new Date('2026-11-10T14:00:00.000Z');
const MINUTE = 60;
const TUBE_LINES: readonly LineId[] = [
  'bakerloo',
  'central',
  'jubilee',
  'northern',
  'victoria',
];

const GOOD: LineStatus['statuses'] = [{ severity: 10, label: 'Good Service' }];

function status(lineId: LineId, statuses = GOOD): LineStatus {
  return { lineId, statuses };
}

function platform(
  lineId: LineId,
  platformNumber: number,
  dueMinutes: readonly number[],
  vehicleIds = true,
): Prediction[] {
  return dueMinutes.map((minutes, index) => ({
    lineId,
    vehicleId: vehicleIds ? `${lineId}-${platformNumber}-${index}` : '',
    naptanId: `${lineId}-stop-${platformNumber}`,
    platformName: `Platform ${platformNumber}`,
    direction: platformNumber % 2 === 0 ? 'inbound' : 'outbound',
    timeToStation: Math.round(minutes * MINUTE),
  }));
}

function lineWith(
  lineId: LineId,
  platformTimes: readonly (readonly number[])[],
  at = NOW,
) {
  const vehicleIds = profileOf(lineId).vehicleIdsUsable;
  return summarise(
    lineId,
    platformTimes.flatMap((due, index) => platform(lineId, index + 1, due, vehicleIds)),
    at,
  );
}

/** `count` platforms, each with trains every `spacing` minutes from `first`. */
function evenly(count: number, spacing: number, first = 3): number[][] {
  const due: number[] = [];
  for (let minutes = first; minutes <= 30; minutes += spacing) due.push(minutes);
  return Array.from({ length: count }, () => due);
}

/** Five healthy Tube lines, so there is a running network around the line under test. */
function healthyTube(at = NOW) {
  return TUBE_LINES.map((lineId) => lineWith(lineId, evenly(10, 5), at));
}

function verdictFor(
  lineId: LineId,
  summary: ReturnType<typeof summarise>,
  statuses: LineStatus['statuses'] = GOOD,
  at = NOW,
): Verdict {
  const verdicts = evaluate(
    [status(lineId, statuses), ...TUBE_LINES.map((id) => status(id))],
    [summary, ...healthyTube(at)],
    at,
  );
  const verdict = verdicts.find((v) => v.lineId === lineId);
  if (verdict === undefined) throw new Error('no verdict');
  return verdict;
}

describe('mode profiles', () => {
  const profiles = Object.entries<ModeProfile>(MODE_PROFILES);

  it('has a profile for every mode and a mode for every line', () => {
    expect(Object.keys(MODE_PROFILES).sort()).toEqual([...MODE_IDS].sort());
    for (const lineId of LINE_IDS) {
      expect(MODE_PROFILES[modeOfLine(lineId)]).toBeDefined();
    }
  });

  /*
   * The wide gaps rule once could not fire because its threshold was longer than the
   * lookahead. Every profile is held to the same standard for every rule it enables.
   */
  describe.each(profiles)('%s', (_mode, profile) => {
    const allRuleSets = [profile.rules, ...Object.values(profile.lineRules)];

    it('keeps every enabled time threshold reachable inside the lookahead', () => {
      expect(profile.lookaheadSec).toBeGreaterThan(0);
      if (allRuleSets.some((r) => r.longWaits)) {
        expect(profile.longWaitSec).toBeLessThan(profile.lookaheadSec);
      }
      if (allRuleSets.some((r) => r.wideGaps)) {
        expect(profile.wideHeadwayHighSec).toBeLessThanOrEqual(profile.lookaheadSec);
        expect(profile.wideHeadwaySec).toBeLessThan(profile.wideHeadwayHighSec);
      }
    });

    it('keeps the share and sample thresholds in order', () => {
      expect(profile.longWaitShare).toBeGreaterThan(0);
      expect(profile.longWaitHighShare).toBeGreaterThan(profile.longWaitShare);
      expect(profile.longWaitHighShare).toBeLessThanOrEqual(1);
      expect(profile.smallSamplePlatforms).toBeGreaterThan(profile.minPlatforms);
    });

    it('only counts vehicles when the feed has vehicle ids', () => {
      if (!profile.vehicleIdsUsable) {
        for (const rules of allRuleSets) expect(rules.vehicleCounts).toBe(false);
      }
    });

    it('keeps each service window inside one day and in order', () => {
      for (const window of Object.values(profile.serviceWindows)) {
        expect(window.startMin).toBeLessThan(window.endMin);
        expect(window.endMin).toBeLessThanOrEqual(24 * 60);
      }
    });
  });

  it('uses one long wait length everywhere, because the interface prints it once', () => {
    for (const profile of Object.values(MODE_PROFILES)) {
      expect(profile.longWaitSec).toBe(LONG_WAIT_SEC);
    }
  });

  it('keeps the Tube exactly as it was', () => {
    expect(MODE_PROFILES.tube).toMatchObject({
      lookaheadSec: 1800,
      vehicleIdsUsable: true,
      allRulesInWindow: false,
      wideHeadwaySec: 900,
      longWaitSec: 1200,
      longWaitShare: 0.3,
    });
  });

  it.each([
    ['elizabeth', { wideGaps: false, longWaits: true, vehicleCounts: true }],
    ['dlr', { wideGaps: true, longWaits: true, vehicleCounts: false }],
    ['mildmay', { wideGaps: false, longWaits: true, vehicleCounts: true }],
    ['windrush', { wideGaps: false, longWaits: true, vehicleCounts: true }],
    ['weaver', { wideGaps: false, longWaits: false, vehicleCounts: false }],
    ['lioness', { wideGaps: false, longWaits: false, vehicleCounts: false }],
    ['liberty', { wideGaps: false, longWaits: false, vehicleCounts: false }],
    ['suffragette', { wideGaps: false, longWaits: false, vehicleCounts: false }],
  ] as const)('sets the rules for %s', (lineId, expected) => {
    expect(rulesOf(lineId)).toMatchObject({ ...expected, noTrains: true });
  });
});

describe('summarise on a feed with no vehicle ids (DLR)', () => {
  it('counts each prediction at a platform as a train and no vehicles', () => {
    const summary = lineWith('dlr', [[2, 7, 12], [4, 9], [20]]);
    expect(summary).toMatchObject({
      vehicles15: null,
      vehicles30: null,
      inbound15: null,
      outbound15: null,
      platformsMeasured: 3,
      longWaitPlatforms: 1,
      predictionCount: 6,
    });
    // Gaps are 5 min, 5 min and a lower bound of 30 - 20 = 10 min, so the median is 5.
    expect(summary.headwaySec).toBe(5 * MINUTE);
  });

  it('keeps the same train listed twice at one platform as one train', () => {
    const summary = summarise(
      'dlr',
      [...platform('dlr', 1, [4], false), ...platform('dlr', 1, [4], false)],
      NOW,
    );
    expect(summary.predictionCount).toBe(2);
    expect(summary.headwaySec).toBe(26 * MINUTE);
  });

  it('still reads vehicle ids on the Tube', () => {
    expect(lineWith('central', evenly(4, 5)).vehicles15).toBe(12);
  });
});

describe('Elizabeth line, end to end', () => {
  it('raises quiet while good when almost no trains are due', () => {
    const verdict = verdictFor('elizabeth', lineWith('elizabeth', [[5], [12]]));
    expect(verdict).toMatchObject({ mode: 'elizabeth-line', ruleId: 'quiet-while-good' });
  });

  it('never raises wide gaps, however irregular the spacing', () => {
    const verdict = verdictFor('elizabeth', lineWith('elizabeth', evenly(12, 20, 4)));
    expect(verdict.ruleId).not.toBe('wide-gaps');
    expect(verdict.outcome).toBe('match');
  });

  it('raises long waits only from 40 percent of platforms, not 30', () => {
    const waiting = (count: number) =>
      lineWith('elizabeth', [
        ...Array.from({ length: count }, () => [22]),
        ...evenly(10 - count, 5),
      ]);
    expect(verdictFor('elizabeth', waiting(3)).outcome).toBe('match');
    expect(verdictFor('elizabeth', waiting(5))).toMatchObject({
      outcome: 'mismatch',
      ruleId: 'long-waits',
      confidence: 'medium',
    });
  });

  it('raises no trains when the feed is empty inside the window', () => {
    const verdict = verdictFor('elizabeth', lineWith('elizabeth', []));
    expect(verdict).toMatchObject({ outcome: 'mismatch', ruleId: 'no-trains' });
  });

  it('is in step when trains run normally', () => {
    const verdict = verdictFor('elizabeth', lineWith('elizabeth', evenly(12, 6)));
    expect(verdict).toMatchObject({ outcome: 'match', ruleId: 'in-step' });
  });
});

describe('DLR, end to end', () => {
  it('raises wide gaps from per platform gaps, with no vehicle ids at all', () => {
    const verdict = verdictFor('dlr', lineWith('dlr', evenly(12, 20, 4)));
    expect(verdict).toMatchObject({
      mode: 'dlr',
      outcome: 'mismatch',
      ruleId: 'wide-gaps',
      observed: { vehicles15: null, platformsMeasured: 12 },
    });
  });

  it('raises long waits when half the platforms have nothing for 20 minutes', () => {
    const verdict = verdictFor(
      'dlr',
      lineWith('dlr', [...Array.from({ length: 6 }, () => [24]), ...evenly(6, 4)]),
    );
    expect(verdict).toMatchObject({ outcome: 'mismatch', ruleId: 'long-waits' });
  });

  it('raises no trains when the feed is empty inside the window', () => {
    expect(verdictFor('dlr', lineWith('dlr', []))).toMatchObject({
      outcome: 'mismatch',
      ruleId: 'no-trains',
    });
  });

  it('is in step when trains run normally', () => {
    expect(verdictFor('dlr', lineWith('dlr', evenly(12, 5)))).toMatchObject({
      outcome: 'match',
      ruleId: 'in-step',
    });
  });

  it('never raises quiet while good, which needs vehicle counts', () => {
    const verdict = verdictFor('dlr', lineWith('dlr', evenly(6, 12, 6)));
    expect(verdict.ruleId).not.toBe('quiet-while-good');
  });

  it.each([
    ['Suspended', 2],
    ['Service Closed', 20],
  ])('cannot check a %s status without vehicle counts', (label, severity) => {
    const verdict = verdictFor('dlr', lineWith('dlr', evenly(12, 5)), [
      { severity, label },
    ]);
    expect(verdict).toMatchObject({
      outcome: 'unknown',
      ruleId: 'not-measurable',
      confidence: 'low',
    });
  });
});

describe('Overground, end to end', () => {
  it('raises long waits on a frequent line, Windrush', () => {
    const summary = lineWith('windrush', [
      ...Array.from({ length: 6 }, () => [24]),
      ...evenly(6, 4),
    ]);
    expect(verdictFor('windrush', summary)).toMatchObject({
      mode: 'overground',
      outcome: 'mismatch',
      ruleId: 'long-waits',
    });
  });

  it('raises quiet while good on a frequent line, Mildmay', () => {
    expect(verdictFor('mildmay', lineWith('mildmay', [[5], [20]]))).toMatchObject({
      outcome: 'mismatch',
      ruleId: 'quiet-while-good',
    });
  });

  it('never raises wide gaps, as Weaver sat at a 15 minute median on Good Service', () => {
    const verdict = verdictFor('windrush', lineWith('windrush', evenly(12, 15, 5)));
    expect(verdict.ruleId).not.toBe('wide-gaps');
  });

  it.each(['liberty', 'lioness', 'suffragette', 'weaver'] as const)(
    'leaves the infrequent line %s unknown with low confidence',
    (lineId) => {
      // A line with a long wait everywhere would trip long waits anywhere else.
      const verdict = verdictFor(lineId, lineWith(lineId, evenly(12, 15, 20)));
      expect(verdict).toMatchObject({
        outcome: 'unknown',
        ruleId: 'not-measurable',
        confidence: 'low',
      });
    },
  );

  it('raises no trains on an infrequent line whose feed is empty', () => {
    expect(verdictFor('weaver', lineWith('weaver', []))).toMatchObject({
      outcome: 'mismatch',
      ruleId: 'no-trains',
    });
  });

  it('is in step on a frequent line running normally', () => {
    expect(verdictFor('windrush', lineWith('windrush', evenly(12, 6)))).toMatchObject({
      outcome: 'match',
      ruleId: 'in-step',
    });
  });
});

describe('service window outside the Tube', () => {
  it.each([
    ['elizabeth', '2026-11-10T23:30:00Z'],
    ['dlr', '2026-11-10T05:00:00Z'],
    ['windrush', '2026-11-15T19:30:00Z'],
    ['windrush', '2026-11-15T08:00:00Z'],
  ] as const)('holds %s to unknown at %s', (lineId, at) => {
    const when = new Date(at);
    const summary = lineWith(lineId, [[40]], when);
    const verdict = verdictFor(lineId, summary, GOOD, when);
    expect(verdict).toMatchObject({ outcome: 'unknown', ruleId: 'not-measurable' });
  });

  it('does not hold the Tube to the window', () => {
    const when = new Date('2026-11-10T23:30:00Z');
    const verdict = verdictFor('central', lineWith('central', [[40]], when), GOOD, when);
    expect(verdict.ruleId).not.toBe('not-measurable');
  });
});

describe('the evening feed from 2026-11-10 (real fixture)', () => {
  const at = new Date(predictionFixture.capturedAt);
  const statuses = statusFixture.statuses as LineStatus[];
  const lines = predictionFixture.lines as Record<string, Prediction[]>;
  const summaries = (Object.keys(lines) as LineId[]).map((lineId) =>
    summarise(lineId, lines[lineId] ?? [], at),
  );
  const verdicts = evaluate(statuses, summaries, at);
  const byLine = new Map(verdicts.map((v) => [v.lineId, v]));

  it('raises no mismatch on any line, a healthy evening with two real disruptions', () => {
    expect(verdicts.filter((v) => v.outcome === 'mismatch')).toEqual([]);
  });

  it('judges the frequent lines in step', () => {
    for (const lineId of ['elizabeth', 'dlr', 'windrush'] as const) {
      expect(byLine.get(lineId)).toMatchObject({ outcome: 'match', ruleId: 'in-step' });
    }
  });

  it('leaves the infrequent lines unknown', () => {
    for (const lineId of ['liberty', 'lioness', 'weaver'] as const) {
      expect(byLine.get(lineId)).toMatchObject({
        outcome: 'unknown',
        ruleId: 'not-measurable',
      });
    }
  });

  it('leaves the lines with a real disruption unknown, as delays and partial closures are', () => {
    expect(byLine.get('mildmay')?.ruleId).toBe('partial-status');
    expect(byLine.get('suffragette')?.ruleId).toBe('partial-status');
  });

  it('reads the DLR fixture, where every vehicle id is blank', () => {
    const dlr = predictionFixture.lines.dlr;
    expect(dlr.length).toBeGreaterThan(0);
    expect(dlr.every((p) => p.vehicleId === '')).toBe(true);
    expect(summaries.find((s) => s.lineId === 'dlr')?.vehicles15).toBeNull();
  });
});
