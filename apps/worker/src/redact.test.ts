import { describe, expect, it } from 'vitest';
import { redact, safeUrl } from './redact.ts';

const KEY = 'abc123SECRET';

describe('redact', () => {
  it.each([
    [
      'a query string value',
      'GET https://x.test/a?app_key=abc123SECRET&b=1',
      'GET https://x.test/a?app_key=[REDACTED]&b=1',
    ],
    [
      'a value at the end',
      'https://x.test/a?app_key=abc123SECRET',
      'https://x.test/a?app_key=[REDACTED]',
    ],
    [
      'the literal key anywhere',
      'failed with abc123SECRET in body',
      'failed with [REDACTED] in body',
    ],
    [
      'the key more than once',
      'abc123SECRET and abc123SECRET',
      '[REDACTED] and [REDACTED]',
    ],
    ['a different key under app_key', 'x?app_key=otherkey123', 'x?app_key=[REDACTED]'],
    ['upper case parameter names', 'x?APP_KEY=abc123SECRET', 'x?APP_KEY=[REDACTED]'],
    ['text with nothing to hide', 'all good', 'all good'],
  ])('handles %s', (_name, input, expected) => {
    expect(redact(input, KEY)).toBe(expected);
  });

  it('does not mangle text when the key is empty', () => {
    expect(redact('plain text', '')).toBe('plain text');
  });

  it('redacts inside JSON strings', () => {
    const line = JSON.stringify({ url: `https://x.test/?app_key=${KEY}` });
    expect(redact(line, KEY)).not.toContain(KEY);
  });
});

describe('safeUrl', () => {
  it('hides the key in a URL', () => {
    const url = new URL(`https://api.tfl.gov.uk/Line?app_key=${KEY}`);
    expect(safeUrl(url, KEY)).toBe('https://api.tfl.gov.uk/Line?app_key=[REDACTED]');
  });
});
