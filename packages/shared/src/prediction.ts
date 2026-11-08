import { z } from 'zod';
import { lineIdSchema } from './lines.ts';

/**
 * One live train prediction, reduced to the fields Drift uses. The worker parses
 * TfL's much larger prediction object into this shape and drops everything else.
 */
export const predictionSchema = z.object({
  lineId: lineIdSchema,
  /** Blank on some TfL modes, in which case the prediction cannot be attributed to a train. */
  vehicleId: z.string(),
  naptanId: z.string(),
  platformName: z.string(),
  /** TfL omits this on a share of predictions. */
  direction: z.enum(['inbound', 'outbound']).optional(),
  /** Seconds until the train reaches the station. */
  timeToStation: z.number().int(),
});

export type Prediction = z.infer<typeof predictionSchema>;
