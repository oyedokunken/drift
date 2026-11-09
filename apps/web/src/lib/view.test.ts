import { config } from '@drift/engine';
import { describe, expect, it } from 'vitest';
import {
  flowingVerdict,
  gapsVerdict,
  longWaitsVerdict,
  quietVerdict,
  unknownVerdict,
  verdict,
} from '../test-data.ts';
import {
  OUTCOME_LABEL,
  countOutcomes,
  lineCode,
  lineName,
  ruleTitle,
  sortVerdicts,
  liveFigure,
  trackCaption,
  trackDescription,
  trackReading,
  trackShares,
} from './view.ts';

describe('line names', () => {
  it.each([
    ['hammersmith-city', 'Hammersmith and City', 'H&C'],
    ['waterloo-city', 'Waterloo and City', 'W&C'],
    ['central', 'Central', 'CEN'],
  ] as const)('%s', (id, name, code) => {
    expect(lineName(id)).toBe(name);
    expect(lineCode(id)).toBe(code);
  });
});

describe('countOutcomes', () => {
  it('counts each outcome and the total', () => {
    const counts = countOutcomes([
      quietVerdict('central'),
      flowingVerdict('victoria'),
      verdict('circle'),
      unknownVerdict('bakerloo'),
    ]);
    expect(counts).toEqual({ mismatch: 2, match: 1, unknown: 1, total: 4 });
  });

  it('handles no verdicts', () => {
    expect(countOutcomes([])).toEqual({ mismatch: 0, match: 0, unknown: 0, total: 0 });
  });
});

describe('sortVerdicts', () => {
  it('puts mismatches first, then matches, then unknown', () => {
    const sorted = sortVerdicts([
      unknownVerdict('bakerloo'),
      verdict('circle'),
      quietVerdict('central'),
    ]);
    expect(sorted.map((v) => v.outcome)).toEqual(['mismatch', 'match', 'unknown']);
  });

  it('puts the strongest evidence first within an outcome', () => {
    const sorted = sortVerdicts([quietVerdict('central'), flowingVerdict('victoria')]);
    expect(sorted.map((v) => v.confidence)).toEqual(['high', 'medium']);
  });

  it('falls back to the line name, and does not change its input', () => {
    const input = [verdict('victoria'), verdict('central'), verdict('bakerloo')];
    expect(sortVerdicts(input).map((v) => v.lineId)).toEqual([
      'bakerloo',
      'central',
      'victoria',
    ]);
    expect(input.map((v) => v.lineId)).toEqual(['victoria', 'central', 'bakerloo']);
  });
});

describe('liveFigure', () => {
  it('counts trains, singular and plural', () => {
    expect(liveFigure(quietVerdict('central'))).toEqual({
      value: 1,
      label: 'train due in 15 min',
    });
    expect(liveFigure(verdict('central'))).toEqual({
      value: 30,
      label: 'trains due in 15 min',
    });
  });

  it('gives the gap in minutes for wide gaps', () => {
    expect(liveFigure(gapsVerdict('central'))).toEqual({
      value: 18,
      label: 'minutes between trains',
    });
  });

  it('shows the share of platforms waiting long for long waits', () => {
    expect(liveFigure(longWaitsVerdict('central'))).toEqual({
      value: 50,
      label: 'percent of platforms wait 20 min or more',
    });
  });

  it('has no figure when there was no live reading', () => {
    expect(liveFigure(unknownVerdict('central'))).toBeNull();
  });
});

describe('text', () => {
  it('has a title for every rule and a label for every outcome', () => {
    expect(ruleTitle('quiet-while-good')).toBe('Quiet while good');
    expect(ruleTitle('no-arrivals')).toBe('No live data');
    expect(ruleTitle('long-waits')).toBe('Long waits');
    expect(OUTCOME_LABEL).toEqual({
      mismatch: 'Drift detected',
      match: 'In step',
      unknown: 'Not enough data',
    });
  });
});

describe('trackReading', () => {
  it('compares trains with the floor while service is good', () => {
    expect(trackReading(verdict('central'))).toEqual({
      unit: 'trains',
      value: 30,
      threshold: config.QUIET_MIN_VEHICLES,
      domain: config.FLOWING_HIGH_VEHICLES * 2,
      limit: 'floor',
    });
  });

  it('uses the lower floor for a line with its own', () => {
    expect(trackReading(verdict('waterloo-city'))?.threshold).toBe(
      config.QUIET_MIN_VEHICLES_BY_LINE['waterloo-city'],
    );
  });

  it('compares trains with the ceiling while the line is suspended', () => {
    const reading = trackReading(flowingVerdict('victoria'));
    expect(reading).toMatchObject({
      unit: 'trains',
      value: 30,
      threshold: config.FLOWING_MIN_VEHICLES,
      limit: 'ceiling',
    });
  });

  it('treats an in step line that should be stopped as a ceiling', () => {
    const stopped = verdict('central', { official: { severity: 2, label: 'Suspended' } });
    expect(trackReading(stopped)?.limit).toBe('ceiling');
  });

  it('compares the gap in minutes with the wide gap threshold', () => {
    expect(trackReading(gapsVerdict('central'))).toEqual({
      unit: 'minutes',
      value: 18,
      threshold: config.WIDE_HEADWAY_SEC / 60,
      domain: (config.WIDE_HEADWAY_SEC * 2) / 60,
      limit: 'ceiling',
    });
  });

  it('draws the share of platforms waiting long against its threshold', () => {
    expect(trackReading(longWaitsVerdict('central'))).toEqual({
      unit: 'percent',
      value: 50,
      threshold: 30,
      domain: 60,
      limit: 'ceiling',
    });
  });

  it('draws a zero share when no platform could be measured', () => {
    const empty = longWaitsVerdict('central');
    const reading = trackReading({
      ...empty,
      observed: empty.observed && { ...empty.observed, platformsMeasured: 0 },
    });
    expect(reading?.value).toBe(0);
  });

  it('draws nothing without live data or for an unknown verdict', () => {
    expect(trackReading(unknownVerdict('central'))).toBeNull();
    expect(
      trackReading(verdict('central', { outcome: 'unknown', ruleId: 'network-quiet' })),
    ).toBeNull();
  });

  it('draws nothing for closed hours, which has its own rule', () => {
    expect(trackReading(verdict('central', { ruleId: 'closed-hours' }))).toBeNull();
  });

  it('draws nothing when a gap verdict has no headway', () => {
    const noHeadway = gapsVerdict('central');
    expect(
      trackReading({
        ...noHeadway,
        observed: noHeadway.observed && { ...noHeadway.observed, headwaySec: null },
      }),
    ).toBeNull();
  });

  it('draws nothing for the one sided case, which the count cannot explain', () => {
    const oneSided = verdict('central', {
      outcome: 'mismatch',
      ruleId: 'quiet-while-good',
    });
    expect(trackReading(oneSided)).toBeNull();
  });

  it('keeps the quiet verdict below its floor', () => {
    const reading = trackReading(quietVerdict('central'));
    expect(reading).not.toBeNull();
    expect(reading?.value).toBeLessThan(reading?.threshold ?? 0);
  });
});

describe('track words and shares', () => {
  const floor = trackReading(quietVerdict('central'));
  const ceiling = trackReading(flowingVerdict('victoria'));
  const minutes = trackReading(gapsVerdict('central'));

  it('states the rule in words for each kind of threshold', () => {
    expect(floor && trackCaption(floor)).toBe('Needs at least 3 trains');
    expect(ceiling && trackCaption(ceiling)).toBe('Alarm at 6 trains or more');
    expect(minutes && trackCaption(minutes)).toBe('Alarm at 15 minutes apart or more');
    const percent = trackReading(longWaitsVerdict('central'));
    expect(percent && trackCaption(percent)).toBe(
      'Alarm at 30 percent of platforms waiting 20 minutes or more',
    );
    expect(percent && trackDescription(percent)).toBe(
      '50 percent of platforms waiting 20 minutes or more. Alarm at 30 percent of platforms waiting 20 minutes or more.',
    );
  });

  it('describes the whole track in one sentence', () => {
    expect(floor && trackDescription(floor)).toBe(
      '1 train due in 15 minutes. Needs at least 3 trains.',
    );
    expect(minutes && trackDescription(minutes)).toBe(
      'Trains about 18 minutes apart. Alarm at 15 minutes apart or more.',
    );
  });

  it('places the fill and the tick as shares of the axis', () => {
    expect(floor && trackShares(floor)).toEqual({ fill: 1 / 24, tick: 3 / 24 });
  });

  it('never draws past the ends of the axis', () => {
    const busy = verdict('central', {
      observed: {
        vehicles15: 90,
        vehicles30: 99,
        inbound15: 45,
        outbound15: 45,
        headwaySec: 120,
        platformsMeasured: 40,
        longWaitPlatforms: 0,
      },
    });
    const reading = trackReading(busy);
    expect(reading && trackShares(reading).fill).toBe(1);
  });
});
