import { describe, expect, it } from 'vitest';
import * as config from './config.ts';

describe('engine thresholds', () => {
  it('orders the horizons', () => {
    expect(config.NEAR_HORIZON_SEC).toBeLessThan(config.FAR_HORIZON_SEC);
  });

  it('keeps high confidence bars above the base bars', () => {
    expect(config.FLOWING_HIGH_VEHICLES).toBeGreaterThan(config.FLOWING_MIN_VEHICLES);
    expect(config.WIDE_HEADWAY_HIGH_SEC).toBeGreaterThan(config.WIDE_HEADWAY_SEC);
    expect(config.SMALL_SAMPLE_PLATFORMS).toBeGreaterThan(config.MIN_PLATFORMS_MEASURED);
  });

  /*
   * The 30 minute lookahead once made the wide gaps threshold unreachable, so tests that
   * injected the gap passed while the rule could never fire on live data. Every threshold
   * measured in time must fit inside what a prediction can show.
   */
  it('keeps every time threshold reachable inside the lookahead', () => {
    expect(config.NEAR_HORIZON_SEC).toBeLessThanOrEqual(config.FAR_HORIZON_SEC);
    expect(config.LONG_WAIT_SEC).toBeLessThanOrEqual(config.FAR_HORIZON_SEC);
    expect(config.WIDE_HEADWAY_SEC).toBeLessThanOrEqual(config.FAR_HORIZON_SEC);
    expect(config.WIDE_HEADWAY_HIGH_SEC).toBeLessThanOrEqual(config.FAR_HORIZON_SEC);
  });

  it('keeps share thresholds between zero and one and in order', () => {
    expect(config.LONG_WAIT_PLATFORM_SHARE).toBeGreaterThan(0);
    expect(config.LONG_WAIT_HIGH_SHARE).toBeGreaterThan(config.LONG_WAIT_PLATFORM_SHARE);
    expect(config.LONG_WAIT_HIGH_SHARE).toBeLessThanOrEqual(1);
  });

  it('keeps the operating hours inside one day and in order', () => {
    expect(config.OPERATING_START_MIN).toBeLessThan(config.OPERATING_END_MIN);
    expect(config.OPERATING_END_MIN).toBeLessThanOrEqual(24 * 60);
  });

  it('keeps the per line quiet floor at or below the general floor', () => {
    for (const floor of Object.values(config.QUIET_MIN_VEHICLES_BY_LINE)) {
      expect(floor).toBeLessThanOrEqual(config.QUIET_MIN_VEHICLES);
    }
  });
});
