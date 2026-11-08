import { describe, expect, it } from 'vitest';
import type { ArrivalSummary, LineId, LineStatus, Verdict } from '@drift/shared';
import statusFixture from '../fixtures/status-2026-11-08-sunday-morning.json' with { type: 'json' };
import predictionFixture from '../fixtures/predictions-2026-11-08-sunday-morning.json' with { type: 'json' };
import type { Prediction } from '@drift/shared';
import { evaluate } from './evaluate.ts';
import { summarise } from './summarise.ts';

const NOW = new Date('2026-11-08T09:00:00Z');

const LABELS: Record<number, string> = {
  0: 'Special Service',
  1: 'Closed',
  2: 'Suspended',
  3: 'Part Suspended',
  4: 'Planned Closure',
  5: 'Part Closure',
  6: 'Severe Delays',
  7: 'Reduced Service',
  8: 'Bus Service',
  9: 'Minor Delays',
  10: 'Good Service',
  11: 'Part Closed',
  12: 'Exit Only',
  13: 'No Step Free Access',
  14: 'Change of frequency',
  15: 'Diverted',
  16: 'Not Running',
  17: 'Issues Reported',
  18: 'No Issues',
  19: 'Information',
  20: 'Service Closed',
};

function status(lineId: LineId, first: number, ...rest: number[]): LineStatus {
  const entry = (severity: number) => ({
    severity,
    label: LABELS[severity] ?? 'Mystery',
  });
  return { lineId, statuses: [entry(first), ...rest.map(entry)] };
}

function summary(overrides: Partial<ArrivalSummary> = {}): ArrivalSummary {
  return {
    lineId: 'central',
    fetchedAt: new Date(NOW.getTime() - 30_000).toISOString(),
    predictionCount: 400,
    vehicles15: 30,
    vehicles30: 40,
    inbound15: 15,
    outbound15: 15,
    headwaySec: 300,
    platformsMeasured: 40,
    ...overrides,
  };
}

function one(
  lineStatus: LineStatus,
  lineSummary: ArrivalSummary | null = summary({ lineId: lineStatus.lineId }),
): Verdict {
  const [verdict] = evaluate(
    [lineStatus],
    lineSummary === null ? [] : [lineSummary],
    NOW,
  );
  if (!verdict) throw new Error('expected one verdict');
  return verdict;
}

describe('guards on arrivals data', () => {
  it('is unknown when the line has no summary', () => {
    const verdict = one(status('central', 10), null);
    expect(verdict).toMatchObject({
      outcome: 'unknown',
      ruleId: 'no-arrivals',
      confidence: 'low',
    });
    expect(verdict.observed).toBeNull();
  });

  it.each([
    ['fresh at the age limit', 240, 'match'],
    ['one second past the age limit', 241, 'unknown'],
    ['very old', 3600, 'unknown'],
  ])('%s', (_name, ageSeconds, outcome) => {
    const fetchedAt = new Date(NOW.getTime() - ageSeconds * 1000).toISOString();
    expect(one(status('central', 10), summary({ fetchedAt })).outcome).toBe(outcome);
  });

  it.each([
    ['an unparseable timestamp', { fetchedAt: 'not a date' }],
    ['an empty feed', { predictionCount: 0, vehicles15: 0, vehicles30: 0 }],
    ['predictions with no usable vehicle', { vehicles15: 0, vehicles30: 0 }],
  ])('is unknown for %s, never a mismatch', (_name, change) => {
    const verdict = one(status('central', 10), summary(change));
    expect(verdict).toMatchObject({ outcome: 'unknown', ruleId: 'no-arrivals' });
  });
});

describe('official status that traffic cannot contradict', () => {
  it.each([0, 3, 4, 5, 7, 8, 11, 12, 13, 14, 15, 17, 19])(
    'severity %i resolves to unknown even with no trains at all',
    (severity) => {
      const quiet = summary({ vehicles15: 0, vehicles30: 1 });
      const verdict = one(status('central', severity), quiet);
      expect(verdict).toMatchObject({ outcome: 'unknown', ruleId: 'partial-status' });
      expect(verdict.observed).toBeNull();
    },
  );

  it('resolves Severe Delays to unknown', () => {
    expect(one(status('central', 6))).toMatchObject({
      outcome: 'unknown',
      ruleId: 'delays-unverifiable',
    });
  });

  it('resolves a severity code it does not know to unknown', () => {
    expect(one(status('central', 99))).toMatchObject({
      outcome: 'unknown',
      ruleId: 'unclassified-status',
    });
  });

  it.each([
    ['Severe Delays plus Part Suspended', 6, 3],
    ['Good Service plus Suspended (mixed kinds)', 10, 2],
    ['Good Service plus Planned Closure', 10, 4],
    ['Suspended plus Severe Delays', 2, 6],
  ])('treats %s as partial', (_name, first, second) => {
    expect(one(status('central', first, second)).ruleId).toBe('partial-status');
  });

  it('judges Good Service plus Minor Delays as running, without the quiet rule', () => {
    const verdict = one(
      status('central', 10, 9),
      summary({ vehicles15: 0, vehicles30: 5 }),
    );
    expect(verdict.ruleId).not.toBe('quiet-while-good');
  });

  it('puts every label in the official text and the deciding severity in the severity', () => {
    const verdict = one(status('bakerloo', 6, 3));
    expect(verdict.official).toEqual({
      severity: 3,
      label: 'Severe Delays and Part Suspended',
    });
  });
});

describe('Service Closed', () => {
  it.each([
    [0, 'match'],
    [2, 'match'],
    [3, 'unknown'],
    [30, 'unknown'],
  ])('with %i vehicles near is %s', (vehicles15, outcome) => {
    const verdict = one(status('central', 20), summary({ vehicles15 }));
    expect(verdict.outcome).toBe(outcome);
    expect(verdict.ruleId).toBe('closed-hours');
  });

  it('never raises a mismatch, however many trains run', () => {
    expect(one(status('central', 20), summary({ vehicles15: 60 })).outcome).not.toBe(
      'mismatch',
    );
  });
});

describe('rule 1: quiet while good', () => {
  it.each([
    ['0 trains near', 0, 'mismatch', 'high'],
    ['1 train near', 1, 'mismatch', 'medium'],
    ['2 trains near', 2, 'mismatch', 'medium'],
    ['3 trains near (the floor)', 3, 'match', 'medium'],
    ['4 trains near', 4, 'match', 'high'],
    ['30 trains near', 30, 'match', 'high'],
  ])('%s', (_name, vehicles15, outcome, confidence) => {
    const verdict = one(
      status('central', 10),
      summary({ vehicles15, vehicles30: 20, inbound15: 0, outbound15: 0 }),
    );
    expect(verdict).toMatchObject({ outcome, confidence });
    if (outcome === 'mismatch') expect(verdict.ruleId).toBe('quiet-while-good');
  });

  it('applies a lower floor to Waterloo and City, a two train line', () => {
    const wc = (vehicles15: number) =>
      one(
        status('waterloo-city', 10),
        summary({ lineId: 'waterloo-city', vehicles15, vehicles30: 2 }),
      );
    expect(wc(1).outcome).toBe('match');
    expect(wc(0)).toMatchObject({ outcome: 'mismatch', ruleId: 'quiet-while-good' });
  });

  it('does not apply to Minor Delays', () => {
    const verdict = one(status('central', 9), summary({ vehicles15: 0, vehicles30: 5 }));
    expect(verdict.ruleId).not.toBe('quiet-while-good');
  });

  describe('one direction empty', () => {
    it.each([
      ['8 inbound and none outbound', 8, 0, 'mismatch'],
      ['0 inbound and 8 outbound', 0, 8, 'mismatch'],
      ['7 inbound and none outbound (too few to tell)', 7, 0, 'match'],
      ['8 inbound and 1 outbound', 8, 1, 'match'],
      ['balanced', 10, 10, 'match'],
    ])('%s', (_name, inbound15, outbound15, outcome) => {
      const verdict = one(
        status('central', 10),
        summary({ inbound15, outbound15, vehicles15: 30 }),
      );
      expect(verdict.outcome).toBe(outcome);
      if (outcome === 'mismatch') {
        expect(verdict).toMatchObject({
          ruleId: 'quiet-while-good',
          confidence: 'medium',
        });
        expect(verdict.reason).toContain('one direction');
      }
    });

    it('ignores direction when the feed gave none', () => {
      const verdict = one(
        status('central', 10),
        summary({ inbound15: 0, outbound15: 0 }),
      );
      expect(verdict.outcome).toBe('match');
    });
  });
});

describe('rule 2: flowing while suspended', () => {
  it.each([
    ['0 trains', 0, 'match', 'high'],
    ['4 trains', 4, 'match', 'high'],
    ['5 trains (near the bar)', 5, 'match', 'medium'],
    ['6 trains (the bar)', 6, 'mismatch', 'medium'],
    ['11 trains', 11, 'mismatch', 'medium'],
    ['12 trains', 12, 'mismatch', 'high'],
    ['40 trains', 40, 'mismatch', 'high'],
  ])('Suspended with %s', (_name, vehicles15, outcome, confidence) => {
    const verdict = one(
      status('victoria', 2),
      summary({ lineId: 'victoria', vehicles15 }),
    );
    expect(verdict).toMatchObject({ outcome, confidence });
    expect(verdict.ruleId).toBe(
      outcome === 'mismatch' ? 'flowing-while-suspended' : 'in-step',
    );
  });

  it.each([1, 16])('also applies to severity %i', (severity) => {
    const verdict = one(
      status('victoria', severity),
      summary({ lineId: 'victoria', vehicles15: 20 }),
    );
    expect(verdict).toMatchObject({
      outcome: 'mismatch',
      ruleId: 'flowing-while-suspended',
    });
  });

  it('names the status and the train count in the reason', () => {
    const verdict = one(
      status('victoria', 2),
      summary({ lineId: 'victoria', vehicles15: 14 }),
    );
    expect(verdict.reason).toBe(
      'Official status is Suspended but 14 trains are due in the next 15 minutes.',
    );
  });
});

describe('rule 3: wide gaps', () => {
  const platformsOk = 10;

  it.each([
    ['one second under 15 minutes', 899, platformsOk, 'match', 'medium'],
    ['15 minutes exactly', 900, platformsOk, 'mismatch', 'medium'],
    ['24 minutes 59 seconds', 1499, platformsOk, 'mismatch', 'medium'],
    ['25 minutes', 1500, platformsOk, 'mismatch', 'high'],
    ['wide but only 9 platforms measured', 1800, 9, 'mismatch', 'low'],
    ['wide but only 5 platforms measured', 900, 5, 'mismatch', 'low'],
    ['wide but only 4 platforms measured', 1800, 4, 'match', 'medium'],
  ])('%s', (_name, headwaySec, platformsMeasured, outcome, confidence) => {
    const verdict = one(
      status('piccadilly', 10),
      summary({ lineId: 'piccadilly', headwaySec, platformsMeasured }),
    );
    expect(verdict).toMatchObject({ outcome, confidence });
    expect(verdict.ruleId).toBe(outcome === 'mismatch' ? 'wide-gaps' : 'in-step');
  });

  it('also applies to Minor Delays', () => {
    const verdict = one(
      status('piccadilly', 9),
      summary({ lineId: 'piccadilly', headwaySec: 1200 }),
    );
    expect(verdict).toMatchObject({ outcome: 'mismatch', ruleId: 'wide-gaps' });
  });

  it('rounds the minutes in the reason', () => {
    const verdict = one(
      status('piccadilly', 10),
      summary({ lineId: 'piccadilly', headwaySec: 1080 }),
    );
    expect(verdict.reason).toBe(
      'Official status is Good Service but trains are typically 18 minutes apart.',
    );
  });

  it('is a match with medium confidence when no headway could be measured', () => {
    const verdict = one(
      status('piccadilly', 10),
      summary({ lineId: 'piccadilly', headwaySec: null, platformsMeasured: 0 }),
    );
    expect(verdict).toMatchObject({ outcome: 'match', confidence: 'medium' });
  });

  it.each([
    ['at 675 seconds, comfortably clear', 675, 'high'],
    ['at 676 seconds, near the bar', 676, 'medium'],
  ])('reports a match %s', (_name, headwaySec, confidence) => {
    const verdict = one(
      status('piccadilly', 10),
      summary({ lineId: 'piccadilly', headwaySec }),
    );
    expect(verdict).toMatchObject({ outcome: 'match', confidence });
  });

  it('checks the quiet rule before the gap rule', () => {
    const verdict = one(
      status('piccadilly', 10),
      summary({ lineId: 'piccadilly', vehicles15: 1, headwaySec: 1800 }),
    );
    expect(verdict.ruleId).toBe('quiet-while-good');
  });
});

describe('network wide quiet guard', () => {
  const ids: LineId[] = [
    'central',
    'circle',
    'district',
    'jubilee',
    'northern',
    'victoria',
    'bakerloo',
    'metropolitan',
    'piccadilly',
    'hammersmith-city',
  ];

  function network(quietCount: number, total: number, staleCount = 0) {
    const lines = ids.slice(0, total);
    const statuses = lines.map((id) => status(id, 10));
    const summaries = lines.map((lineId, index) =>
      summary({
        lineId,
        vehicles15: index < quietCount ? 1 : 30,
        vehicles30: index < quietCount ? 1 : 40,
        fetchedAt:
          index >= total - staleCount
            ? new Date(NOW.getTime() - 600_000).toISOString()
            : summary().fetchedAt,
      }),
    );
    return evaluate(statuses, summaries, NOW);
  }

  it.each([
    ['5 of 6 quiet', 5, 6, 'network-quiet'],
    ['4 of 6 quiet (67 percent)', 4, 6, 'quiet-while-good'],
    ['7 of 10 quiet (exactly 70 percent)', 7, 10, 'network-quiet'],
    ['6 of 10 quiet', 6, 10, 'quiet-while-good'],
    ['4 of 4 quiet (too few lines for the guard)', 4, 4, 'quiet-while-good'],
    ['5 of 5 quiet (the fewest lines for the guard)', 5, 5, 'network-quiet'],
  ])('%s', (_name, quiet, total, expected) => {
    const verdicts = network(quiet, total);
    expect(verdicts[0]?.ruleId).toBe(expected);
    expect(verdicts[0]?.outcome).toBe(
      expected === 'network-quiet' ? 'unknown' : 'mismatch',
    );
  });

  it('does not count stale lines towards the guard', () => {
    const verdicts = network(3, 8, 5);
    expect(verdicts[0]?.ruleId).toBe('quiet-while-good');
  });

  it('keeps the observed metrics on a network-quiet verdict', () => {
    expect(network(5, 6)[0]?.observed?.vehicles15).toBe(1);
  });

  it('leaves suspended lines to the flowing rule', () => {
    const lines = ids.slice(0, 6);
    const statuses = lines.map((id, index) => status(id, index === 5 ? 2 : 10));
    const summaries = lines.map((lineId, index) =>
      summary({ lineId, vehicles15: index === 5 ? 20 : 1, vehicles30: 25 }),
    );
    const verdicts = evaluate(statuses, summaries, NOW);
    expect(verdicts[0]?.ruleId).toBe('network-quiet');
    expect(verdicts[5]).toMatchObject({
      outcome: 'mismatch',
      ruleId: 'flowing-while-suspended',
    });
  });
});

describe('shape and determinism', () => {
  it('returns one verdict per status in input order and ignores unrelated summaries', () => {
    const statuses = [status('victoria', 10), status('central', 10)];
    const summaries = [summary({ lineId: 'central' }), summary({ lineId: 'jubilee' })];
    const verdicts = evaluate(statuses, summaries, NOW);
    expect(verdicts.map((v) => v.lineId)).toEqual(['victoria', 'central']);
  });

  it('returns nothing for no statuses', () => {
    expect(evaluate([], [summary()], NOW)).toEqual([]);
  });

  it('is deterministic and does not mutate its inputs', () => {
    const statuses = [status('central', 10)];
    const summaries = [summary()];
    const frozenStatuses = Object.freeze(statuses.map((s) => Object.freeze(s)));
    const frozenSummaries = Object.freeze(summaries.map((s) => Object.freeze(s)));
    const first = evaluate(frozenStatuses, frozenSummaries, NOW);
    expect(evaluate(frozenStatuses, frozenSummaries, NOW)).toEqual(first);
  });

  it('copies the observed metrics from the summary', () => {
    const verdict = one(status('central', 10));
    expect(verdict.observed).toEqual({
      vehicles15: 30,
      vehicles30: 40,
      inbound15: 15,
      outbound15: 15,
      headwaySec: 300,
      platformsMeasured: 40,
    });
  });
});

describe('on real captured data (Sunday morning, 2026-11-08)', () => {
  const statuses: LineStatus[] = statusFixture
    .filter((line) => line.id in predictionFixture.lines)
    .map((line) => {
      const [first, ...rest] = line.lineStatuses.map((s) => ({
        severity: s.statusSeverity,
        label: s.statusSeverityDescription,
      }));
      return {
        lineId: line.id as LineId,
        statuses: [first ?? { severity: 0, label: '' }, ...rest],
      };
    });

  const summaries = Object.entries(predictionFixture.lines).map(([id, rows]) =>
    summarise(id as LineId, rows as Prediction[], NOW),
  );

  const verdicts = new Map(evaluate(statuses, summaries, NOW).map((v) => [v.lineId, v]));

  it('finds Circle and Victoria in step', () => {
    expect(verdicts.get('circle')).toMatchObject({ outcome: 'match', ruleId: 'in-step' });
    expect(verdicts.get('victoria')).toMatchObject({
      outcome: 'match',
      ruleId: 'in-step',
    });
  });

  it('leaves Bakerloo (Severe Delays plus Part Suspended) unknown', () => {
    expect(verdicts.get('bakerloo')).toMatchObject({
      outcome: 'unknown',
      ruleId: 'partial-status',
    });
  });

  it('leaves Waterloo and City (Planned Closure) unknown', () => {
    expect(verdicts.get('waterloo-city')).toMatchObject({
      outcome: 'unknown',
      ruleId: 'partial-status',
    });
  });

  it('raises no mismatch on any of the captured lines', () => {
    expect([...verdicts.values()].filter((v) => v.outcome === 'mismatch')).toEqual([]);
  });
});
