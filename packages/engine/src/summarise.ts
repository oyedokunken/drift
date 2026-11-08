import type { ArrivalSummary, LineId, Prediction } from '@drift/shared';
import {
  FAR_HORIZON_SEC,
  MIN_PREDICTIONS_PER_PLATFORM,
  NEAR_HORIZON_SEC,
} from './config.ts';

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  if (sorted.length % 2 === 1) return upper;
  return ((sorted[middle - 1] ?? upper) + upper) / 2;
}

/** The median gap between consecutive trains at one platform, or null with too few trains. */
function platformHeadway(nearestByVehicle: ReadonlyMap<string, number>): number | null {
  if (nearestByVehicle.size < MIN_PREDICTIONS_PER_PLATFORM) return null;
  const times = [...nearestByVehicle.values()].sort((a, b) => a - b);
  const gaps = times.slice(1).map((time, index) => time - (times[index] ?? 0));
  return median(gaps);
}

/**
 * Reduce a line's raw predictions to the small summary the engine evaluates.
 * Pure: the fetch time is passed in.
 */
export function summarise(
  lineId: LineId,
  predictions: readonly Prediction[],
  fetchedAt: Date,
): ArrivalSummary {
  const usable = predictions.filter(
    (p) =>
      p.vehicleId.trim() !== '' &&
      p.timeToStation >= 0 &&
      p.timeToStation <= FAR_HORIZON_SEC,
  );

  const vehicles30 = new Set<string>();
  const vehicles15 = new Set<string>();
  const inbound15 = new Set<string>();
  const outbound15 = new Set<string>();
  const platforms = new Map<string, Map<string, number>>();

  for (const p of usable) {
    vehicles30.add(p.vehicleId);
    if (p.timeToStation <= NEAR_HORIZON_SEC) {
      vehicles15.add(p.vehicleId);
      if (p.direction === 'inbound') inbound15.add(p.vehicleId);
      if (p.direction === 'outbound') outbound15.add(p.vehicleId);
    }

    const key = `${p.naptanId}|${p.platformName}`;
    const byVehicle = platforms.get(key) ?? new Map<string, number>();
    const previous = byVehicle.get(p.vehicleId);
    byVehicle.set(
      p.vehicleId,
      previous === undefined ? p.timeToStation : Math.min(previous, p.timeToStation),
    );
    platforms.set(key, byVehicle);
  }

  const headways = [...platforms.values()]
    .map(platformHeadway)
    .filter((headway): headway is number => headway !== null);

  return {
    lineId,
    fetchedAt: fetchedAt.toISOString(),
    predictionCount: predictions.length,
    vehicles15: vehicles15.size,
    vehicles30: vehicles30.size,
    inbound15: inbound15.size,
    outbound15: outbound15.size,
    headwaySec: headways.length === 0 ? null : median(headways),
    platformsMeasured: headways.length,
  };
}
