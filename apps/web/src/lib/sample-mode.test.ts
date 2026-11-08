import { describe, expect, it } from 'vitest';
import { isSampleRequested } from './sample-mode.ts';

describe('isSampleRequested', () => {
  it.each(['?sample=1', 'sample=1', '?a=b&sample=1', '?sample=1&a=b'])(
    'turns on for %s',
    (search) => {
      expect(isSampleRequested(search)).toBe(true);
    },
  );

  it.each([
    '',
    '?',
    '?sample',
    '?sample=',
    '?sample=0',
    '?sample=true',
    '?sample=11',
    '?sample=%31%31',
    '?Sample=1',
    '?samples=1',
    '?xsample=1',
    '?other=sample',
    '#sample=1',
  ])('stays off for %j', (search) => {
    expect(isSampleRequested(search)).toBe(false);
  });
});
