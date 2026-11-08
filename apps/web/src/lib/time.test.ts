import { describe, expect, it } from 'vitest';
import { ageSeconds, formatAge } from './time.ts';

describe('ageSeconds', () => {
  const then = '2026-11-08T09:00:00.000Z';
  const thenMs = Date.parse(then);

  it('counts seconds since the timestamp', () => {
    expect(ageSeconds(then, thenMs + 40_000, 0)).toBe(40);
  });

  it('uses the server clock when the device clock is behind', () => {
    // The device thinks it is 09:00:10, but the server is a minute ahead of it.
    expect(ageSeconds(then, thenMs + 10_000, 60_000)).toBe(70);
  });

  it('uses the server clock when the device clock is ahead', () => {
    expect(ageSeconds(then, thenMs + 100_000, -60_000)).toBe(40);
  });

  it('never goes negative', () => {
    expect(ageSeconds(then, thenMs - 5_000, 0)).toBe(0);
  });

  it('treats an unreadable timestamp as no age', () => {
    expect(ageSeconds('not a date', thenMs, 0)).toBe(0);
  });
});

describe('formatAge', () => {
  it.each([
    [0, 'just now'],
    [4, 'just now'],
    [5, '5 seconds ago'],
    [40, '40 seconds ago'],
    [59, '59 seconds ago'],
    [60, '1 minute ago'],
    [119, '1 minute ago'],
    [120, '2 minutes ago'],
    [3599, '59 minutes ago'],
    [3600, '1 hour ago'],
    [7300, '2 hours ago'],
  ])('%i seconds reads %j', (seconds, expected) => {
    expect(formatAge(seconds)).toBe(expected);
  });
});
