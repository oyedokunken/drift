import { evaluate } from '@drift/engine';
import {
  LINE_IDS,
  type ArrivalSummary,
  type LineId,
  type LineStatus,
  type Snapshot,
} from '@drift/shared';

/**
 * Hand built inputs for `?sample=1`, so the mismatch design can be reviewed when the
 * real network is healthy. The verdicts are not written by hand: they come out of the
 * real engine, so the reasons and rules shown are the ones it would produce.
 */

/** Train counts for the healthy lines, in the range seen on the live network. */
const HEALTHY_VEHICLES: Readonly<Record<LineId, number>> = {
  bakerloo: 14,
  central: 1,
  circle: 11,
  district: 31,
  'hammersmith-city': 12,
  jubilee: 26,
  metropolitan: 17,
  northern: 38,
  piccadilly: 12,
  victoria: 14,
  'waterloo-city': 2,
};

function summary(lineId: LineId, fetchedAt: string): ArrivalSummary {
  const vehicles15 = HEALTHY_VEHICLES[lineId];
  const half = Math.floor(vehicles15 / 2);
  return {
    lineId,
    fetchedAt,
    predictionCount: vehicles15 * 4,
    vehicles15,
    vehicles30: vehicles15 + 4,
    inbound15: half,
    outbound15: vehicles15 - half,
    headwaySec: lineId === 'piccadilly' ? 18 * 60 : 5 * 60,
    platformsMeasured: lineId === 'piccadilly' ? 30 : 40,
    longWaitPlatforms: 0,
  };
}

const OFFICIAL: Readonly<Partial<Record<LineId, { severity: number; label: string }>>> = {
  victoria: { severity: 2, label: 'Suspended' },
  bakerloo: { severity: 4, label: 'Planned Closure' },
};

const GOOD_SERVICE = { severity: 10, label: 'Good Service' };

function status(lineId: LineId): LineStatus {
  return { lineId, statuses: [OFFICIAL[lineId] ?? GOOD_SERVICE] };
}

export function buildSampleSnapshot(now: Date): Snapshot {
  const fetchedAt = now.toISOString();
  return {
    generatedAt: fetchedAt,
    statusAsOf: fetchedAt,
    arrivalsAsOf: fetchedAt,
    stale: false,
    verdicts: evaluate(
      LINE_IDS.map(status),
      LINE_IDS.map((lineId) => summary(lineId, fetchedAt)),
      now,
    ),
  };
}
