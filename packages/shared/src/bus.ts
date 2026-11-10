import { z } from 'zod';
import {
  observedSchema,
  outcomeSchema,
  confidenceSchema,
  ruleIdSchema,
} from './verdict.ts';

/**
 * A bus route as a visitor types it: one to four letters or digits, as TfL's route ids
 * are (`207`, `W11`, `N207`, `X26`). Trimmed and upper cased, so what is stored, shown and
 * sent upstream is one spelling. Anything else is rejected before it goes anywhere.
 */
export const busRouteSchema = z
  .string()
  .trim()
  .regex(
    /^[a-z0-9]{1,4}$/i,
    'A bus route is one to four letters or digits, like 207 or W11.',
  )
  .transform((route) => route.toUpperCase());

export type BusRoute = z.infer<typeof busRouteSchema>;

/** The verdict for one bus route: a line verdict without a line or a mode. */
export const busVerdictSchema = z.object({
  official: z.object({ severity: z.number().int(), label: z.string().min(1) }),
  observed: observedSchema.nullable(),
  outcome: outcomeSchema,
  ruleId: ruleIdSchema,
  reason: z.string().min(1),
  confidence: confidenceSchema,
});

export type BusVerdict = z.infer<typeof busVerdictSchema>;

/** What `GET /api/bus/:route` returns. */
export const busResultSchema = z.object({
  route: z.string().min(1),
  /** TfL's name for the route, from the route list. */
  name: z.string().min(1),
  /** When the route's predictions were fetched from TfL. */
  checkedAt: z.iso.datetime(),
  /** True when TfL could not be reached and this is the last good result for the route. */
  stale: z.boolean(),
  verdict: busVerdictSchema,
});

export type BusResult = z.infer<typeof busResultSchema>;
