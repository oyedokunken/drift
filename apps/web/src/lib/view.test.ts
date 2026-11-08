import { describe, expect, it } from 'vitest';
import {
  flowingVerdict,
  gapsVerdict,
  quietVerdict,
  unknownVerdict,
  verdict,
} from '../test-data.ts';
import {
  OUTCOME_LABEL,
  countOutcomes,
  lineCode,
  lineName,
  observedText,
  ruleTitle,
  sortVerdicts,
  trackPositions,
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

describe('text', () => {
  it('describes train counts, singular and plural', () => {
    expect(observedText(quietVerdict('central'))).toBe('1 train due within 15 minutes');
    expect(observedText(verdict('central'))).toBe('30 trains due within 15 minutes');
  });

  it('describes the headway for wide gaps', () => {
    expect(observedText(gapsVerdict('central'))).toBe('Trains about 18 minutes apart');
  });

  it('says so when there was no live reading', () => {
    expect(observedText(unknownVerdict('central'))).toBe('No live reading');
  });

  it('has a title for every rule and a label for every outcome', () => {
    expect(ruleTitle('quiet-while-good')).toBe('Quiet while good');
    expect(ruleTitle('no-arrivals')).toBe('No live data');
    expect(OUTCOME_LABEL).toEqual({
      mismatch: 'Drift detected',
      match: 'In step',
      unknown: 'Not enough data',
    });
  });
});

describe('trackPositions', () => {
  it('has no observed marker when there is not enough data', () => {
    expect(trackPositions(unknownVerdict('central')).observed).toBeNull();
  });

  it('puts a match marker exactly on the official marker', () => {
    const { official, observed } = trackPositions(verdict('central'));
    expect(observed).toBe(official);
  });

  it('puts a quiet line far below the running position', () => {
    const { official, observed } = trackPositions(quietVerdict('central'));
    expect(observed).not.toBeNull();
    expect(official - (observed ?? 0)).toBeGreaterThan(0.4);
  });

  it('puts a flowing but suspended line far above the stopped position', () => {
    const { official, observed } = trackPositions(flowingVerdict('victoria'));
    expect((observed ?? 0) - official).toBeGreaterThan(0.4);
  });

  it('puts wide gaps part way down from running', () => {
    const { official, observed } = trackPositions(gapsVerdict('central'));
    expect(official - (observed ?? 0)).toBeGreaterThan(0.3);
  });

  it('keeps every position on the track', () => {
    for (const v of [
      quietVerdict('a' as never),
      flowingVerdict('a' as never),
      gapsVerdict('a' as never),
    ]) {
      const { official, observed } = trackPositions(v);
      for (const position of [official, observed ?? 0]) {
        expect(position).toBeGreaterThanOrEqual(0);
        expect(position).toBeLessThanOrEqual(1);
      }
    }
  });

  it('treats a match on a suspended line as official stopped', () => {
    const stopped = verdict('central', {
      official: { severity: 2, label: 'Suspended' },
      ruleId: 'in-step',
    });
    expect(trackPositions(stopped).official).toBeLessThan(0.2);
  });
});
