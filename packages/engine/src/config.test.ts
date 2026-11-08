import { describe, expect, it } from 'vitest';
import * as config from './config.ts';

describe('engine thresholds', () => {
  it('orders the horizons', () => {
    expect(config.NEAR_HORIZON_SEC).toBeLessThan(config.FAR_HORIZON_SEC);
  });

  it('keeps high confidence bars above the base bars', () => {
    expect(config.FLOWING_HIGH_VEHICLES).toBeGreaterThan(config.FLOWING_MIN_VEHICLES);
    expect(config.WIDE_HEADWAY_HIGH_SEC).toBeGreaterThan(config.WIDE_HEADWAY_SEC);
    expect(config.SMALL_SAMPLE_PLATFORMS).toBeGreaterThan(
      config.MIN_PLATFORMS_FOR_HEADWAY,
    );
  });

  it('keeps the per line quiet floor at or below the general floor', () => {
    for (const floor of Object.values(config.QUIET_MIN_VEHICLES_BY_LINE)) {
      expect(floor).toBeLessThanOrEqual(config.QUIET_MIN_VEHICLES);
    }
  });
});
