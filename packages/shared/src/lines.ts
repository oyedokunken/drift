import { z } from 'zod';

/** The Tube lines Drift evaluates, using TfL's own line ids. */
export const LINE_IDS = [
  'bakerloo',
  'central',
  'circle',
  'district',
  'hammersmith-city',
  'jubilee',
  'metropolitan',
  'northern',
  'piccadilly',
  'victoria',
  'waterloo-city',
] as const;

export const lineIdSchema = z.enum(LINE_IDS);

export type LineId = z.infer<typeof lineIdSchema>;
