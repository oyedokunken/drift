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

/** Modes whose official status is read in one call. Trams are returned too and ignored. */
const STATUS_MODES = 'tube,elizabeth-line,dlr,overground';

/** Official statuses for every line Drift evaluates. Fails only if no line could be read. */
export async function fetchStatuses(options: UpstreamOptions): Promise<LineStatus[]> {
  const body = await fetchTflJson(`/Line/Mode/${STATUS_MODES}/Status`, options);
  const items = asArray(body, 'Status');
  const statuses = items.map(toLineStatus).filter((s): s is LineStatus => s !== null);
  if (statuses.length === 0) {
    throw new UpstreamError('parse', 'Status response held no readable lines');
  }
  return statuses;
}

type LineGroups = readonly (readonly LineId[])[];

/**
 * Fixed groups of lines fetched in parallel, balanced by prediction volume. Parsing is
 * the cost, and it is set by the size of the feed: measured in Node on 2026-11-10 the
 * Tube groups take about 30 ms in all and the other modes about 30 ms, the Elizabeth line
 * alone about 10 ms for 1.3 MB.
 */
const TUBE_GROUPS: LineGroups = [
  ['northern'],
  ['piccadilly', 'victoria'],
  ['district', 'circle', 'jubilee', 'waterloo-city'],
  ['central', 'bakerloo'],
  ['metropolitan', 'hammersmith-city'],
];

const OTHER_MODE_GROUPS: LineGroups = [
  ['elizabeth'],
  ['windrush'],
  ['mildmay'],
  ['lioness', 'weaver'],
  ['dlr', 'liberty', 'suffragette'],
];

/**
 * The cron tick alternates between these two sets of groups, so a tick parses about as
 * much as the Tube alone did in v0.1.0, and every line is refreshed at least every two
 * minutes, well inside the 4 minute freshness limit of the engine.
 */
export const REFRESH_PHASES: readonly LineGroups[] = [TUBE_GROUPS, OTHER_MODE_GROUPS];

/** Every group, for the first refresh after a deploy or on empty storage. */
export const LINE_GROUPS: LineGroups = REFRESH_PHASES.flat();

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
