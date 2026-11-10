import { describe, expect, it } from 'vitest';
import { LINE_IDS, lineIdSchema, modeIdSchema, modeOfLine } from './lines.ts';

describe('lineIdSchema', () => {
  it.each(LINE_IDS)('accepts the line %s', (id) => {
    expect(lineIdSchema.safeParse(id).success).toBe(true);
  });

  it.each(['tram', 'elizabeth-line', 'overground', '', 'Central', 42, null, undefined])(
    'rejects %j',
    (value) => {
      expect(lineIdSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('modeOfLine', () => {
  it.each([
    ['central', 'tube'],
    ['waterloo-city', 'tube'],
    ['elizabeth', 'elizabeth-line'],
    ['dlr', 'dlr'],
    ['mildmay', 'overground'],
    ['windrush', 'overground'],
  ] as const)('puts %s in %s', (lineId, mode) => {
    expect(modeOfLine(lineId)).toBe(mode);
  });

  it('gives every line a mode', () => {
    for (const lineId of LINE_IDS) {
      expect(modeIdSchema.safeParse(modeOfLine(lineId)).success).toBe(true);
    }
  });
});
