import { z } from 'zod';
import {
  lineIdSchema,
  predictionSchema,
  type LineId,
  type LineStatus,
  type Prediction,
} from '@drift/shared';
import type { Logger } from './log.ts';
import { UpstreamError, fetchTflJson, type UpstreamOptions } from './upstream.ts';

/**
 * Strict on the fields Drift needs, tolerant of everything else TfL sends: extra
 * properties are ignored, and unknown lines or malformed items are dropped rather
 * than failing the whole response.
 */
const tflLineStatusSchema = z.object({
  id: z.string(),
  lineStatuses: z
    .array(
      z.object({
        statusSeverity: z.number().int(),
        statusSeverityDescription: z.string().min(1),
      }),
    )
    .min(1),
});

const tflPredictionSchema = z.object({
  lineId: lineIdSchema,
  vehicleId: z.string().optional(),
  naptanId: z.string(),
  platformName: z.string(),
  direction: z.string().optional(),
  timeToStation: z.number().int(),
});

function asDirection(value: string | undefined): Prediction['direction'] {
  return value === 'inbound' || value === 'outbound' ? value : undefined;
}

function toLineStatus(item: unknown): LineStatus | null {
  const parsed = tflLineStatusSchema.safeParse(item);
  if (!parsed.success) return null;
  const line = lineIdSchema.safeParse(parsed.data.id);
  if (!line.success) return null;
  const [first, ...rest] = parsed.data.lineStatuses.map((status) => ({
    severity: status.statusSeverity,
    label: status.statusSeverityDescription,
  }));
  return first === undefined ? null : { lineId: line.data, statuses: [first, ...rest] };
}

function toPrediction(item: unknown): Prediction | null {
  const parsed = tflPredictionSchema.safeParse(item);
  if (!parsed.success) return null;
  const { direction, vehicleId, ...rest } = parsed.data;
  const normalised = asDirection(direction);
  return predictionSchema.parse({
    ...rest,
    vehicleId: vehicleId ?? '',
    ...(normalised === undefined ? {} : { direction: normalised }),
  });
}

function asArray(body: unknown, what: string): unknown[] {
  if (!Array.isArray(body))
    throw new UpstreamError('parse', `${what} response was not a list`);
  return body as unknown[];
}

/** Official statuses for the Tube lines. Fails only if no line could be read. */
export async function fetchStatuses(options: UpstreamOptions): Promise<LineStatus[]> {
  const body = await fetchTflJson('/Line/Mode/tube/Status', options);
  const items = asArray(body, 'Status');
  const statuses = items.map(toLineStatus).filter((s): s is LineStatus => s !== null);
  if (statuses.length === 0) {
    throw new UpstreamError('parse', 'Status response held no readable Tube lines');
  }
  return statuses;
}

/** Fixed groups of lines fetched in parallel, balanced by prediction volume. */
export const LINE_GROUPS: readonly (readonly LineId[])[] = [
  ['northern'],
  ['piccadilly', 'victoria'],
  ['district', 'circle', 'jubilee', 'waterloo-city'],
  ['central', 'bakerloo'],
  ['metropolitan', 'hammersmith-city'],
];

export interface GroupResult {
  readonly lines: readonly LineId[];
  readonly predictions: readonly Prediction[];
}

/**
 * Predictions for one group of lines. An empty list is a valid answer. A non empty
 * response in which nothing is readable is a schema failure.
 */
export async function fetchGroupPredictions(
  lines: readonly LineId[],
  options: UpstreamOptions,
  log: Logger,
): Promise<GroupResult> {
  const body = await fetchTflJson(`/Line/${lines.join(',')}/Arrivals`, options);
  const items = asArray(body, 'Arrivals');
  const predictions = items.map(toPrediction).filter((p): p is Prediction => p !== null);

  if (items.length > 0 && predictions.length === 0) {
    throw new UpstreamError('parse', 'Arrivals response held no readable predictions');
  }
  const dropped = items.length - predictions.length;
  if (dropped > 0)
    log('warn', 'predictions_dropped', { lines: lines.join(','), dropped });

  return { lines, predictions };
}
