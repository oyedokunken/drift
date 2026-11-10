import { describe, expect, it } from 'vitest';
import {
  apiErrorSchema,
  arrivalSummarySchema,
  lineStatusSchema,
  predictionSchema,
  snapshotSchema,
  verdictSchema,
} from './index.ts';

const prediction = {
  lineId: 'central',
  vehicleId: '026',
  naptanId: '940GZZLUQWY',
  platformName: 'Westbound - Platform 1',
  direction: 'inbound',
  timeToStation: 120,
};

const summary = {
  lineId: 'central',
  fetchedAt: '2026-11-08T09:00:00Z',
  predictionCount: 400,
  vehicles15: 44,
  vehicles30: 44,
  inbound15: 23,
  outbound15: 19,
  headwaySec: 360,
  platformsMeasured: 68,
  longWaitPlatforms: 0,
};

const verdict = {
  lineId: 'central',
  official: { severity: 10, label: 'Good Service' },
  observed: null,
  outcome: 'unknown',
  ruleId: 'no-arrivals',
  reason: 'No live data.',
  confidence: 'low',
};

describe('predictionSchema', () => {
  it('accepts a prediction and drops extra fields', () => {
    const parsed = predictionSchema.parse({ ...prediction, towards: 'Ealing' });
    expect(parsed).toEqual(prediction);
  });

  it('accepts a missing direction and a blank vehicle id', () => {
    const rest = Object.fromEntries(
      Object.entries(prediction).filter(([key]) => key !== 'direction'),
    );
    expect(predictionSchema.safeParse({ ...rest, vehicleId: '' }).success).toBe(true);
  });

  it.each([
    ['unknown line', { lineId: 'dlr' }],
    ['non numeric time', { timeToStation: '120' }],
    ['fractional time', { timeToStation: 1.5 }],
    ['bad direction', { direction: 'sideways' }],
    ['missing platform', { platformName: undefined }],
  ])('rejects %s', (_name, change) => {
    expect(predictionSchema.safeParse({ ...prediction, ...change }).success).toBe(false);
  });
});

describe('lineStatusSchema', () => {
  it('requires at least one status', () => {
    expect(lineStatusSchema.safeParse({ lineId: 'central', statuses: [] }).success).toBe(
      false,
    );
  });

  it('accepts several statuses', () => {
    const value = {
      lineId: 'bakerloo',
      statuses: [
        { severity: 6, label: 'Severe Delays' },
        { severity: 3, label: 'Part Suspended' },
      ],
    };
    expect(lineStatusSchema.parse(value)).toEqual(value);
  });
});

describe('arrivalSummarySchema', () => {
  it('accepts a null headway', () => {
    expect(arrivalSummarySchema.safeParse({ ...summary, headwaySec: null }).success).toBe(
      true,
    );
  });

  it.each([
    ['negative count', { vehicles15: -1 }],
    ['bad timestamp', { fetchedAt: 'yesterday' }],
    ['fractional count', { vehicles30: 2.5 }],
    ['negative headway', { headwaySec: -5 }],
  ])('rejects %s', (_name, change) => {
    expect(arrivalSummarySchema.safeParse({ ...summary, ...change }).success).toBe(false);
  });
});

describe('verdictSchema and snapshotSchema', () => {
  it('accepts a verdict with no observed data', () => {
    expect(verdictSchema.safeParse(verdict).success).toBe(true);
  });

  it('rejects an unknown rule id', () => {
    expect(verdictSchema.safeParse({ ...verdict, ruleId: 'made-up' }).success).toBe(
      false,
    );
  });

  it('accepts a snapshot and rejects one with a malformed verdict', () => {
    const snapshot = {
      generatedAt: '2026-11-08T09:00:00Z',
      statusAsOf: '2026-11-08T09:00:00Z',
      arrivalsAsOf: null,
      stale: false,
      verdicts: [verdict],
    };
    expect(snapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(
      snapshotSchema.safeParse({ ...snapshot, verdicts: [{ lineId: 'central' }] })
        .success,
    ).toBe(false);
  });
});

describe('apiErrorSchema', () => {
  it('accepts a typed error and rejects an unknown code', () => {
    const body = {
      error: { code: 'upstream_unavailable', message: 'TfL is unreachable.' },
    };
    expect(apiErrorSchema.safeParse(body).success).toBe(true);
    expect(
      apiErrorSchema.safeParse({ error: { code: 'boom', message: 'x' } }).success,
    ).toBe(false);
  });
});
