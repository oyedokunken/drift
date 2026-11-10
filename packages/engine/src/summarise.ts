import type { ArrivalSummary, LineId, Prediction } from '@drift/shared';
import { NEAR_HORIZON_SEC, profileOf, type ModeProfile } from './config.ts';

/** A prediction without the line it belongs to, so a bus route can be summarised too. */
export type TrainPrediction = Omit<Prediction, 'lineId'>;

/** A summary without the line it describes. */
export type SummaryBody = Omit<ArrivalSummary, 'lineId'>;

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
  nearestByTrain: ReadonlyMap<string, number>,
  lookaheadSec: number,
): PlatformMeasure | null {
  const [first, second] = [...nearestByTrain.values()].sort((a, b) => a - b);
  if (first === undefined) return null;
  return {
    waitSec: first,
    gapSec: second === undefined ? lookaheadSec - first : second - first,
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
  return { lineId, ...summariseWith(profileOf(lineId), predictions, fetchedAt) };
}

/** The same reduction for any profile, which is how a bus route is summarised. */
export function summariseWith(
  profile: ModeProfile,
  predictions: readonly TrainPrediction[],
  fetchedAt: Date,
): SummaryBody {
  const usable = predictions.filter(
    (p) =>
      (!profile.vehicleIdsUsable || p.vehicleId.trim() !== '') &&
      p.timeToStation >= 0 &&
      p.timeToStation <= profile.lookaheadSec,
  );

  const vehicles30 = new Set<string>();
  const vehicles15 = new Set<string>();
  const inbound15 = new Set<string>();
  const outbound15 = new Set<string>();
  const platforms = new Map<string, Map<string, number>>();

  for (const p of usable) {
    // Without vehicle ids each prediction at a platform is one train, told apart by when
    // it is due. The same train is never listed twice at one platform.
    const train = profile.vehicleIdsUsable ? p.vehicleId : String(p.timeToStation);
    vehicles30.add(train);
    if (p.timeToStation <= NEAR_HORIZON_SEC) {
      vehicles15.add(train);
      if (p.direction === 'inbound') inbound15.add(train);
      if (p.direction === 'outbound') outbound15.add(train);
    }

    const key = `${p.naptanId}|${p.platformName}`;
    const byTrain = platforms.get(key) ?? new Map<string, number>();
    const previous = byTrain.get(train);
    byTrain.set(
      train,
      previous === undefined ? p.timeToStation : Math.min(previous, p.timeToStation),
    );
    platforms.set(key, byTrain);
  }

  const measures = [...platforms.values()]
    .map((byTrain) => measurePlatform(byTrain, profile.lookaheadSec))
    .filter((measure): measure is PlatformMeasure => measure !== null);

  const counted = (set: ReadonlySet<string>): number | null =>
    profile.vehicleIdsUsable ? set.size : null;

  return {
    fetchedAt: fetchedAt.toISOString(),
    predictionCount: predictions.length,
    vehicles15: counted(vehicles15),
    vehicles30: counted(vehicles30),
    inbound15: counted(inbound15),
    outbound15: counted(outbound15),
    headwaySec: measures.length === 0 ? null : median(measures.map((m) => m.gapSec)),
    platformsMeasured: measures.length,
    longWaitPlatforms: measures.filter((m) => m.waitSec >= profile.longWaitSec).length,
  };
}
