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

/**
 * The clock the sample runs on: a Tuesday afternoon in London, inside every service
 * window. The engine holds the other modes to those windows, so a sample read at night
 * would otherwise show them as "not enough data" and no mismatch outside the Tube.
 */
const SAMPLE_CLOCK = new Date('2026-11-10T14:00:00.000Z');

/**
 * Train counts for the healthy lines, in the range seen on the live network. DLR has
 * none: its feed carries no vehicle ids, so trains are not counted there.
 */
const HEALTHY_VEHICLES: Readonly<Record<LineId, number | null>> = {
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
  elizabeth: 40,
  dlr: null,
  liberty: 3,
  lioness: 7,
  mildmay: 16,
  suffragette: 3,
  weaver: 6,
  windrush: 22,
};

/** Platforms with a train due, for the lines where the sample shows many waiting long. */
const LONG_WAIT_PLATFORMS: Readonly<Partial<Record<LineId, number>>> = {
  windrush: 24,
};

function summary(lineId: LineId, fetchedAt: string): ArrivalSummary {
  const vehicles15 = HEALTHY_VEHICLES[lineId];
  const counted = vehicles15 !== null;
  const half = counted ? Math.floor(vehicles15 / 2) : null;
  return {
    lineId,
    fetchedAt,
    predictionCount: (vehicles15 ?? 30) * 4,
    vehicles15,
    vehicles30: counted ? vehicles15 + 4 : null,
    inbound15: half,
    outbound15: counted && half !== null ? vehicles15 - half : null,
    headwaySec: lineId === 'piccadilly' ? 18 * 60 : 5 * 60,
    platformsMeasured: lineId === 'piccadilly' ? 30 : 40,
    longWaitPlatforms: LONG_WAIT_PLATFORMS[lineId] ?? 0,
  };
}

const OFFICIAL: Readonly<Partial<Record<LineId, { severity: number; label: string }>>> = {
  victoria: { severity: 2, label: 'Suspended' },
  bakerloo: { severity: 4, label: 'Planned Closure' },
  suffragette: { severity: 5, label: 'Part Closure' },
};

const GOOD_SERVICE = { severity: 10, label: 'Good Service' };

function status(lineId: LineId): LineStatus {
  return { lineId, statuses: [OFFICIAL[lineId] ?? GOOD_SERVICE] };
}

export function buildSampleSnapshot(now: Date): Snapshot {
  const shownAt = now.toISOString();
  const fetchedAt = SAMPLE_CLOCK.toISOString();
  return {
    generatedAt: shownAt,
    statusAsOf: shownAt,
    arrivalsAsOf: shownAt,
    stale: false,
    verdicts: evaluate(
      LINE_IDS.map(status),
      LINE_IDS.map((lineId) => summary(lineId, fetchedAt)),
      SAMPLE_CLOCK,
    ),
  };
}
