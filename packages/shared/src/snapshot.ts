import { z } from 'zod';
import { verdictSchema } from './verdict.ts';

/** What `GET /api/snapshot` returns and what the browser validates before rendering. */
export const snapshotSchema = z.object({
  /** When the Worker built this snapshot. */
  generatedAt: z.iso.datetime(),
  /** When the official statuses were fetched from TfL. */
  statusAsOf: z.iso.datetime(),
  /** When the oldest line summary was fetched, or null if there are none. */
  arrivalsAsOf: z.iso.datetime().nullable(),
  /** True when the Worker could not refresh and is serving its last good snapshot. */
  stale: z.boolean(),
  verdicts: z.array(verdictSchema),
});

export type Snapshot = z.infer<typeof snapshotSchema>;

export const ERROR_CODES = [
  'upstream_unavailable',
  'not_found',
  'method_not_allowed',
] as const;

/** Typed body for every non 2xx API response. Never a bare 500. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string().min(1),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
