import { describe, expect, it } from 'vitest';
import { LINE_IDS, lineIdSchema } from './lines.ts';

describe('lineIdSchema', () => {
  it.each(LINE_IDS)('accepts the Tube line %s', (id) => {
    expect(lineIdSchema.safeParse(id).success).toBe(true);
  });

  it.each(['dlr', 'elizabeth', '', 'Central', 42, null, undefined])(
    'rejects %j',
    (value) => {
      expect(lineIdSchema.safeParse(value).success).toBe(false);
    },
  );
});
