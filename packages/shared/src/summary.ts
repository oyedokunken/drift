import { z } from 'zod';
import { lineIdSchema } from './lines.ts';

const count = z.number().int().nonnegative();

/**
 * The few numbers the engine needs from a line's live predictions. Small enough
 * to store and ship, unlike the raw feed (hundreds of KB per line).
 */
export const arrivalSummarySchema = z.object({
  lineId: lineIdSchema,
  /** When the predictions were fetched from TfL. */
  fetchedAt: z.iso.datetime(),
  /** Predictions received, including ones that could not be attributed to a train. */
  predictionCount: count,
  /** Distinct vehicles due within 15 minutes. */
  vehicles15: count,
  /** Distinct vehicles due within the whole 30 minute horizon. */
  vehicles30: count,
  /** Distinct vehicles due within 15 minutes whose direction is known, by direction. */
  inbound15: count,
  outbound15: count,
  /** Typical gap between trains in seconds, or null when too few platforms could be measured. */
  headwaySec: z.number().nonnegative().nullable(),
  /** Platforms with enough predictions to measure a gap. */
  platformsMeasured: count,
});

export type ArrivalSummary = z.infer<typeof arrivalSummarySchema>;
