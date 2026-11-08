import { z } from 'zod';
import { lineIdSchema } from './lines.ts';

/** One official status entry as TfL reports it. */
export const officialStatusSchema = z.object({
  severity: z.number().int(),
  label: z.string().min(1),
});

export type OfficialStatus = z.infer<typeof officialStatusSchema>;

/** A line can carry several official statuses at once. */
export const lineStatusSchema = z.object({
  lineId: lineIdSchema,
  statuses: z.tuple([officialStatusSchema], officialStatusSchema),
});

export type LineStatus = z.infer<typeof lineStatusSchema>;
