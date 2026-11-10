import { describe, expect, it } from 'vitest';
import { isWithinOperatingHours } from './hours.ts';

describe('isWithinOperatingHours', () => {
  it.each([
    ['weekday, one minute before the start', '2026-01-15T06:59:00Z', false],
    ['weekday, the start', '2026-01-15T07:00:00Z', true],
    ['weekday, the last minute', '2026-01-15T21:59:00Z', true],
    ['weekday, the end', '2026-01-15T22:00:00Z', false],
    ['weekday, midnight', '2026-01-15T00:00:00Z', false],
    ['weekday summer, 06:59 in London is 05:59 UTC', '2026-07-15T05:59:00Z', false],
    ['weekday summer, 07:00 in London is 06:00 UTC', '2026-07-15T06:00:00Z', true],
    ['weekday summer, 22:00 in London is 21:00 UTC', '2026-07-15T21:00:00Z', false],
    ['Friday, 23:59 is outside', '2026-11-13T23:59:00Z', false],
    ['Saturday, one minute before the start', '2026-11-14T07:59:00Z', false],
    ['Saturday, the start', '2026-11-14T08:00:00Z', true],
    ['Saturday, the last minute', '2026-11-14T21:29:00Z', true],
    ['Saturday, the end', '2026-11-14T21:30:00Z', false],
    ['Saturday, midnight', '2026-11-14T00:00:00Z', false],
    ['Sunday, one minute before the start', '2026-11-15T08:59:00Z', false],
    ['Sunday, the start', '2026-11-15T09:00:00Z', true],
    ['Sunday, the last minute', '2026-11-15T19:29:00Z', true],
    ['Sunday, the end', '2026-11-15T19:30:00Z', false],
    [
      'Sunday evening 21:30, where the probe saw lines stopping',
      '2026-11-15T21:30:00Z',
      false,
    ],
    ['Sunday, midnight', '2026-11-15T00:00:00Z', false],
    ['Monday, midnight after Sunday', '2026-11-16T00:00:00Z', false],
  ])('%s', (_name, at, expected) => {
    expect(isWithinOperatingHours(new Date(at))).toBe(expected);
  });

  describe('around the clock changes', () => {
    it.each([
      // 2026-03-29 is a Sunday and the clocks go forward at 01:00 UTC, so London is BST.
      ['clocks forward Sunday, 09:00 BST is 08:00 UTC', '2026-03-29T08:00:00Z', true],
      ['clocks forward Sunday, 08:59 BST is 07:59 UTC', '2026-03-29T07:59:00Z', false],
      ['clocks forward Sunday, 19:30 BST is 18:30 UTC', '2026-03-29T18:30:00Z', false],
      ['clocks forward Sunday, 19:29 BST is 18:29 UTC', '2026-03-29T18:29:00Z', true],
      // The day before is a Saturday still on GMT.
      ['clocks forward Saturday, 08:00 GMT is 08:00 UTC', '2026-03-28T08:00:00Z', true],
      // 2026-10-25 is a Sunday and the clocks go back at 01:00 UTC, so London is GMT.
      ['clocks back Sunday, 09:00 GMT is 09:00 UTC', '2026-10-25T09:00:00Z', true],
      ['clocks back Sunday, 08:59 GMT is 08:59 UTC', '2026-10-25T08:59:00Z', false],
      ['clocks back Sunday, 19:30 GMT is 19:30 UTC', '2026-10-25T19:30:00Z', false],
      ['the repeated hour after the clocks go back', '2026-10-25T01:30:00Z', false],
      // The day before is a Saturday still on BST.
      ['clocks back Saturday, 08:00 BST is 07:00 UTC', '2026-10-24T07:00:00Z', true],
      ['clocks back Saturday, 21:30 BST is 20:30 UTC', '2026-10-24T20:30:00Z', false],
    ])('%s', (_name, at, expected) => {
      expect(isWithinOperatingHours(new Date(at))).toBe(expected);
    });
  });

  it('is outside the hours for an invalid date', () => {
    expect(isWithinOperatingHours(new Date(Number.NaN))).toBe(false);
  });
});
