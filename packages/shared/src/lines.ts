import { z } from 'zod';

/** The modes Drift evaluates, using TfL's own mode names. Buses are checked on demand. */
export const MODE_IDS = ['tube', 'elizabeth-line', 'dlr', 'overground'] as const;

export const modeIdSchema = z.enum(MODE_IDS);

export type ModeId = z.infer<typeof modeIdSchema>;

/** The Tube lines, using TfL's own line ids. */
export const TUBE_LINE_IDS = [
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

/**
 * The Overground lines. TfL split the Overground into six named lines in 2024, listed by
 * its mode listing (`/Line/Mode/overground`) as these ids.
 */
export const OVERGROUND_LINE_IDS = [
  'liberty',
  'lioness',
  'mildmay',
  'suffragette',
  'weaver',
  'windrush',
] as const;

/** Every line Drift evaluates on a schedule, using TfL's own line ids. */
export const LINE_IDS = [
  ...TUBE_LINE_IDS,
  'elizabeth',
  'dlr',
  ...OVERGROUND_LINE_IDS,
] as const;

export const lineIdSchema = z.enum(LINE_IDS);

export type LineId = z.infer<typeof lineIdSchema>;

const TUBE: ReadonlySet<string> = new Set(TUBE_LINE_IDS);
const OVERGROUND: ReadonlySet<string> = new Set(OVERGROUND_LINE_IDS);

/** The mode a line belongs to. */
export function modeOfLine(lineId: LineId): ModeId {
  if (TUBE.has(lineId)) return 'tube';
  if (OVERGROUND.has(lineId)) return 'overground';
  return lineId === 'dlr' ? 'dlr' : 'elizabeth-line';
}
