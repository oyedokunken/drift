import { describe, expect, it } from 'vitest';
import { isWithinOperatingHours } from './hours.ts';

describe('isWithinOperatingHours', () => {
  it.each([
    ['winter, one minute before the start', '2026-01-15T06:59:00Z', false],
    ['winter, the start', '2026-01-15T07:00:00Z', true],
    ['winter, the last minute', '2026-01-15T21:59:00Z', true],
    ['winter, the end', '2026-01-15T22:00:00Z', false],
    ['summer, 06:59 in London is 05:59 UTC', '2026-07-15T05:59:00Z', false],
    ['summer, 07:00 in London is 06:00 UTC', '2026-07-15T06:00:00Z', true],
    ['summer, 22:00 in London is 21:00 UTC', '2026-07-15T21:00:00Z', false],
    ['the night the clocks go back', '2026-10-25T02:00:00Z', false],
    ['the evening the clocks go forward', '2026-03-29T20:59:00Z', true],
  ])('%s', (_name, at, expected) => {
    expect(isWithinOperatingHours(new Date(at))).toBe(expected);
  });

  it('is outside the hours for an invalid date', () => {
    expect(isWithinOperatingHours(new Date(Number.NaN))).toBe(false);
  });
});
