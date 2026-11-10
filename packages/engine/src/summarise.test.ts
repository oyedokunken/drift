import { describe, expect, it } from 'vitest';
import type { Prediction } from '@drift/shared';
import fixture from '../fixtures/predictions-2026-11-08-sunday-morning.json' with { type: 'json' };
import { summarise } from './summarise.ts';

const FETCHED_AT = new Date('2026-11-08T09:00:00Z');

function prediction(overrides: Partial<Prediction> = {}): Prediction {
  return {
    lineId: 'central',
    vehicleId: 'v1',
    naptanId: 'stop-a',
    platformName: 'Eastbound - Platform 1',
    timeToStation: 60,
    ...overrides,
  };
}

function platform(
  naptanId: string,
  times: number[],
  platformName = 'Platform 1',
): Prediction[] {
  return times.map((timeToStation, index) =>
    prediction({
      naptanId,
      platformName,
      vehicleId: `${naptanId}-${platformName}-${index}`,
      timeToStation,
    }),
  );
}

describe('summarise', () => {
  it('returns zeros and a null headway for no predictions', () => {
    expect(summarise('central', [], FETCHED_AT)).toEqual({
      lineId: 'central',
      fetchedAt: '2026-11-08T09:00:00.000Z',
      predictionCount: 0,
      vehicles15: 0,
      vehicles30: 0,
      inbound15: 0,
      outbound15: 0,
      headwaySec: null,
      platformsMeasured: 0,
      longWaitPlatforms: 0,
    });
  });

  it('counts a vehicle once however many stations it is predicted at', () => {
    const rows = [
      prediction({ vehicleId: 'a', naptanId: 's1', timeToStation: 30 }),
      prediction({ vehicleId: 'a', naptanId: 's2', timeToStation: 200 }),
      prediction({ vehicleId: 'a', naptanId: 's3', timeToStation: 400 }),
    ];
    const result = summarise('central', rows, FETCHED_AT);
    expect(result.vehicles15).toBe(1);
    expect(result.predictionCount).toBe(3);
  });

  it.each([
    ['exactly 15 minutes is near', 900, 1, 1],
    ['one second past 15 minutes is far', 901, 0, 1],
    ['exactly 30 minutes is inside the horizon', 1800, 0, 1],
    ['past the horizon is ignored', 1801, 0, 0],
    ['a negative time is invalid and ignored', -1, 0, 0],
    ['zero is at the platform now', 0, 1, 1],
  ])('%s', (_name, timeToStation, near, far) => {
    const result = summarise('central', [prediction({ timeToStation })], FETCHED_AT);
    expect(result.vehicles15).toBe(near);
    expect(result.vehicles30).toBe(far);
  });

  it('ignores predictions with a blank vehicle id when counting trains', () => {
    const rows = [prediction({ vehicleId: '' }), prediction({ vehicleId: '  ' })];
    const result = summarise('central', rows, FETCHED_AT);
    expect(result.vehicles30).toBe(0);
    expect(result.predictionCount).toBe(2);
  });

  it('splits near vehicles by known direction and skips unknown ones', () => {
    const rows = [
      prediction({ vehicleId: 'a', direction: 'inbound' }),
      prediction({ vehicleId: 'b', direction: 'inbound' }),
      prediction({ vehicleId: 'c', direction: 'outbound' }),
      prediction({ vehicleId: 'd' }),
    ];
    const result = summarise('central', rows, FETCHED_AT);
    expect(result).toMatchObject({ vehicles15: 4, inbound15: 2, outbound15: 1 });
  });

  it('does not count a far vehicle in the near direction totals', () => {
    const rows = [
      prediction({ vehicleId: 'a', direction: 'inbound', timeToStation: 1500 }),
    ];
    expect(summarise('central', rows, FETCHED_AT)).toMatchObject({
      inbound15: 0,
      vehicles30: 1,
    });
  });

  describe('per platform waits and gaps', () => {
    it('measures the gap between the first two trains at a platform', () => {
      const result = summarise('central', platform('s1', [60, 360, 960]), FETCHED_AT);
      expect(result.headwaySec).toBe(300);
      expect(result.platformsMeasured).toBe(1);
    });

    it('takes a lower bound for the gap when only one train is due', () => {
      const result = summarise('central', platform('s1', [600]), FETCHED_AT);
      expect(result).toMatchObject({ headwaySec: 1200, platformsMeasured: 1 });
    });

    it('measures a platform with a single train due right now as a 30 minute gap', () => {
      const result = summarise('central', platform('s1', [0]), FETCHED_AT);
      expect(result.headwaySec).toBe(1800);
    });

    it('takes the median across platforms, not the largest gap', () => {
      const rows = [
        ...platform('s1', [0, 300, 600]),
        ...platform('s2', [0, 300, 600]),
        ...platform('s3', [0, 1500, 1800]),
      ];
      expect(summarise('central', rows, FETCHED_AT)).toMatchObject({
        headwaySec: 300,
        platformsMeasured: 3,
      });
    });

    it('averages the two middle platforms when the count is even', () => {
      const rows = [...platform('s1', [0, 200, 400]), ...platform('s2', [0, 400, 800])];
      expect(summarise('central', rows, FETCHED_AT).headwaySec).toBe(300);
    });

    it('uses the nearest prediction when a train repeats at one platform', () => {
      const rows = [
        prediction({ vehicleId: 'a', timeToStation: 100 }),
        prediction({ vehicleId: 'a', timeToStation: 700 }),
        prediction({ vehicleId: 'b', timeToStation: 400 }),
        prediction({ vehicleId: 'c', timeToStation: 700 }),
      ];
      expect(summarise('central', rows, FETCHED_AT).headwaySec).toBe(300);
    });

    it('keeps platforms at the same station separate', () => {
      const rows = [
        ...platform('s1', [0, 100, 200], 'Platform 1'),
        ...platform('s1', [0, 100, 200], 'Platform 2'),
      ];
      expect(summarise('central', rows, FETCHED_AT).platformsMeasured).toBe(2);
    });

    it.each([
      ['one second under the long wait', 1199, 0],
      ['exactly the long wait', 1200, 1],
      ['the edge of the horizon', 1800, 1],
    ])('counts a long waiting platform: %s', (_name, wait, expected) => {
      const result = summarise('central', platform('s1', [wait]), FETCHED_AT);
      expect(result.longWaitPlatforms).toBe(expected);
    });

    it('judges a platform by its next train, not by later ones', () => {
      const result = summarise('central', platform('s1', [60, 1500]), FETCHED_AT);
      expect(result.longWaitPlatforms).toBe(0);
    });
  });

  describe('on real captured data (Sunday morning, 2026-11-08)', () => {
    const rowsFor = (id: keyof typeof fixture.lines): Prediction[] =>
      fixture.lines[id] as Prediction[];

    it('Circle: 10 vehicles near and a headway around 10 minutes', () => {
      const result = summarise('circle', rowsFor('circle'), FETCHED_AT);
      expect(result.vehicles15).toBe(10);
      expect(result.headwaySec).toBeGreaterThanOrEqual(480);
      expect(result.headwaySec).toBeLessThanOrEqual(720);
    });

    it('Victoria: 23 vehicles near and a short headway', () => {
      const result = summarise('victoria', rowsFor('victoria'), FETCHED_AT);
      expect(result.vehicles15).toBe(23);
      expect(result.headwaySec).toBeLessThanOrEqual(240);
    });

    it('Waterloo and City: two trains, one at each of two platforms', () => {
      const result = summarise('waterloo-city', rowsFor('waterloo-city'), FETCHED_AT);
      expect(result).toMatchObject({ vehicles15: 2, platformsMeasured: 2 });
    });
  });
});
