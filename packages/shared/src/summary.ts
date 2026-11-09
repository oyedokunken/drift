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
  /**
   * Typical gap between trains in seconds: the median over platforms of the gap between
   * the first and second train, or a lower bound when only one is due inside the horizon.
   * Null when no platform has a train.
   */
  headwaySec: z.number().nonnegative().nullable(),
  /** Platforms with at least one train due inside the horizon. */
  platformsMeasured: count,
  /** Platforms whose next train is due at or beyond the long wait threshold. */
  longWaitPlatforms: count,
});

export type ArrivalSummary = z.infer<typeof arrivalSummarySchema>;
