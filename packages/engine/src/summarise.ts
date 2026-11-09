import type { ArrivalSummary, LineId, Prediction } from '@drift/shared';
import { FAR_HORIZON_SEC, LONG_WAIT_SEC, NEAR_HORIZON_SEC } from './config.ts';

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  if (sorted.length % 2 === 1) return upper;
  return ((sorted[middle - 1] ?? upper) + upper) / 2;
}

interface PlatformMeasure {
  /** Seconds until the next train. */
  readonly waitSec: number;
  /**
   * Seconds from the next train to the one after it. With only one train inside the
   * horizon the following train is at least a horizon away, so this is a lower bound.
   */
  readonly gapSec: number;
}

/** The next train wait and the gap after it at one platform, or null with no train due. */
function measurePlatform(
  nearestByVehicle: ReadonlyMap<string, number>,
): PlatformMeasure | null {
  const [first, second] = [...nearestByVehicle.values()].sort((a, b) => a - b);
  if (first === undefined) return null;
  return {
    waitSec: first,
    gapSec: second === undefined ? FAR_HORIZON_SEC - first : second - first,
  };
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

  const measures = [...platforms.values()]
    .map(measurePlatform)
    .filter((measure): measure is PlatformMeasure => measure !== null);

  return {
    lineId,
    fetchedAt: fetchedAt.toISOString(),
    predictionCount: predictions.length,
    vehicles15: vehicles15.size,
    vehicles30: vehicles30.size,
    inbound15: inbound15.size,
    outbound15: outbound15.size,
    headwaySec: measures.length === 0 ? null : median(measures.map((m) => m.gapSec)),
    platformsMeasured: measures.length,
    longWaitPlatforms: measures.filter((m) => m.waitSec >= LONG_WAIT_SEC).length,
  };
}
