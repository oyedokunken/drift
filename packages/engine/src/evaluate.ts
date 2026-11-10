import type {
  ArrivalSummary,
  Confidence,
  LineId,
  LineStatus,
  Observed,
  Outcome,
  RuleId,
  Verdict,
} from '@drift/shared';
import { classify, type Classification, type StatusKind } from './classify.ts';
import {
  ARRIVALS_MAX_AGE_SEC,
  CLOSED_MAX_VEHICLES,
  FLOWING_HIGH_VEHICLES,
  FLOWING_MIN_VEHICLES,
  LONG_WAIT_HIGH_SHARE,
  LONG_WAIT_PLATFORM_SHARE,
  LONG_WAIT_SEC,
  LOPSIDED_MIN_TOTAL,
  MIN_PLATFORMS_MEASURED,
  NEAR_THRESHOLD_MARGIN,
  NETWORK_MIN_LINES,
  NETWORK_QUIET_SHARE,
  NETWORK_QUIET_VEHICLES,
  NO_TRAINS_FAULT_LINES,
  NO_TRAINS_MIN_RUNNING_LINES,
  QUIET_MIN_VEHICLES,
  QUIET_MIN_VEHICLES_BY_LINE,
  SMALL_SAMPLE_PLATFORMS,
  WIDE_HEADWAY_HIGH_SEC,
  WIDE_HEADWAY_SEC,
} from './config.ts';
import { isWithinOperatingHours } from './hours.ts';

interface Result {
  readonly outcome: Outcome;
  readonly ruleId: RuleId;
  readonly reason: string;
  readonly confidence: Confidence;
}

const trains = (count: number): string =>
  `${count} ${count === 1 ? 'train is' : 'trains are'}`;

function observedFrom(summary: ArrivalSummary): Observed {
  return {
    vehicles15: summary.vehicles15,
    vehicles30: summary.vehicles30,
    inbound15: summary.inbound15,
    outbound15: summary.outbound15,
    headwaySec: summary.headwaySec,
    platformsMeasured: summary.platformsMeasured,
    longWaitPlatforms: summary.longWaitPlatforms,
  };
}

function ageSec(summary: ArrivalSummary, now: Date): number {
  return (now.getTime() - Date.parse(summary.fetchedAt)) / 1000;
}

function isFresh(
  summary: ArrivalSummary | undefined,
  now: Date,
): summary is ArrivalSummary {
  if (summary === undefined) return false;
  const age = ageSec(summary, now);
  return !Number.isNaN(age) && age <= ARRIVALS_MAX_AGE_SEC;
}

/**
 * A summary is usable when it is fresh and describes real trains. A feed where no
 * prediction could be tied to a vehicle is treated as missing data, because it cannot
 * tell a quiet line from a broken feed.
 */
function isUsable(
  summary: ArrivalSummary | undefined,
  now: Date,
): summary is ArrivalSummary {
  return isFresh(summary, now) && summary.predictionCount > 0 && summary.vehicles30 > 0;
}

/** What the other lines in the same refresh look like, for judging an empty line. */
interface Network {
  readonly quiet: boolean;
  /** Lines with at least the general quiet floor of trains due soon. */
  readonly runningLines: number;
  /** Lines whose fresh feed holds no predictions at all. */
  readonly emptyLines: number;
}

/** True when so many lines are quiet at once that service hours or a feed fault is likelier. */
function isNetworkQuiet(usable: readonly ArrivalSummary[]): boolean {
  if (usable.length < NETWORK_MIN_LINES) return false;
  const quiet = usable.filter((s) => s.vehicles15 < NETWORK_QUIET_VEHICLES).length;
  return quiet / usable.length >= NETWORK_QUIET_SHARE;
}

function describeNetwork(summaries: readonly ArrivalSummary[], now: Date): Network {
  const usable = summaries.filter((summary) => isUsable(summary, now));
  return {
    quiet: isNetworkQuiet(usable),
    runningLines: usable.filter((s) => s.vehicles15 >= QUIET_MIN_VEHICLES).length,
    emptyLines: summaries.filter((s) => isFresh(s, now) && s.predictionCount === 0)
      .length,
  };
}

function quietFloor(lineId: LineId): number {
  return QUIET_MIN_VEHICLES_BY_LINE[lineId] ?? QUIET_MIN_VEHICLES;
}

function evaluateRunning(
  lineId: LineId,
  label: string,
  classification: Classification,
  summary: ArrivalSummary,
): Result {
  const floor = quietFloor(lineId);

  if (classification.allGoodService) {
    if (summary.vehicles15 < floor) {
      return {
        outcome: 'mismatch',
        ruleId: 'quiet-while-good',
        reason: `Official status is ${label} but only ${trains(summary.vehicles15)} due in the next 15 minutes.`,
        confidence: summary.vehicles15 === 0 ? 'high' : 'medium',
      };
    }

    const known = summary.inbound15 + summary.outbound15;
    if (
      known >= LOPSIDED_MIN_TOTAL &&
      Math.min(summary.inbound15, summary.outbound15) === 0
    ) {
      return {
        outcome: 'mismatch',
        ruleId: 'quiet-while-good',
        reason: `Official status is ${label} but trains are due in only one direction (${summary.inbound15} inbound, ${summary.outbound15} outbound).`,
        confidence: 'medium',
      };
    }
  }

  const { headwaySec, platformsMeasured, longWaitPlatforms } = summary;
  const measurable = platformsMeasured >= MIN_PLATFORMS_MEASURED;
  const longWaitShare =
    platformsMeasured === 0 ? 0 : longWaitPlatforms / platformsMeasured;
  const smallSample = platformsMeasured < SMALL_SAMPLE_PLATFORMS;

  if (measurable && headwaySec !== null && headwaySec >= WIDE_HEADWAY_SEC) {
    let confidence: Confidence = 'medium';
    if (smallSample) confidence = 'low';
    else if (headwaySec >= WIDE_HEADWAY_HIGH_SEC) confidence = 'high';
    return {
      outcome: 'mismatch',
      ruleId: 'wide-gaps',
      reason: `Official status is ${label} but trains are typically ${Math.round(headwaySec / 60)} minutes apart.`,
      confidence,
    };
  }

  if (measurable && longWaitShare >= LONG_WAIT_PLATFORM_SHARE) {
    let confidence: Confidence = 'medium';
    if (smallSample) confidence = 'low';
    else if (longWaitShare >= LONG_WAIT_HIGH_SHARE) confidence = 'high';
    return {
      outcome: 'mismatch',
      ruleId: 'long-waits',
      reason: `Official status is ${label} but ${longWaitPlatforms} of ${platformsMeasured} platforms have no train due for ${LONG_WAIT_SEC / 60} minutes or more.`,
      confidence,
    };
  }

  const nearQuiet = summary.vehicles15 < floor * (1 + NEAR_THRESHOLD_MARGIN);
  const nearWide =
    measurable &&
    headwaySec !== null &&
    headwaySec > WIDE_HEADWAY_SEC * (1 - NEAR_THRESHOLD_MARGIN);
  const nearLongWait =
    measurable && longWaitShare > LONG_WAIT_PLATFORM_SHARE * (1 - NEAR_THRESHOLD_MARGIN);
  return {
    outcome: 'match',
    ruleId: 'in-step',
    reason: 'Live trains are consistent with the official status.',
    confidence: !measurable || nearQuiet || nearWide || nearLongWait ? 'medium' : 'high',
  };
}

/**
 * A Good Service line whose feed is fresh but holds no predictions. This only counts as
 * a mismatch when nothing else explains the silence: it is inside service hours, the
 * rest of the network is running, and it is not one of several lines emptied at once,
 * which would point to a feed fault. Otherwise the line stays unknown.
 */
function evaluateEmpty(
  label: string,
  classification: Classification,
  summary: ArrivalSummary,
  network: Network,
  now: Date,
): Result | null {
  const explained =
    !classification.allGoodService ||
    summary.predictionCount !== 0 ||
    network.quiet ||
    network.runningLines < NO_TRAINS_MIN_RUNNING_LINES ||
    network.emptyLines >= NO_TRAINS_FAULT_LINES ||
    !isWithinOperatingHours(now);
  if (explained) return null;
  return {
    outcome: 'mismatch',
    ruleId: 'no-trains',
    reason: `Official status is ${label} but no trains are due on this line, while ${network.runningLines} other lines are running.`,
    confidence: 'medium',
  };
}

function evaluateDown(label: string, summary: ArrivalSummary): Result {
  if (summary.vehicles15 >= FLOWING_MIN_VEHICLES) {
    return {
      outcome: 'mismatch',
      ruleId: 'flowing-while-suspended',
      reason: `Official status is ${label} but ${trains(summary.vehicles15)} due in the next 15 minutes.`,
      confidence: summary.vehicles15 >= FLOWING_HIGH_VEHICLES ? 'high' : 'medium',
    };
  }
  const nearFlowing =
    summary.vehicles15 > FLOWING_MIN_VEHICLES * (1 - NEAR_THRESHOLD_MARGIN);
  return {
    outcome: 'match',
    ruleId: 'in-step',
    reason: `Official status is ${label} and only ${trains(summary.vehicles15)} due, as expected.`,
    confidence: nearFlowing ? 'medium' : 'high',
  };
}

function evaluateClosed(label: string, summary: ArrivalSummary): Result {
  if (summary.vehicles15 <= CLOSED_MAX_VEHICLES) {
    return {
      outcome: 'match',
      ruleId: 'closed-hours',
      reason: `Official status is ${label} and almost no trains are due, as expected.`,
      confidence: 'high',
    };
  }
  return {
    outcome: 'unknown',
    ruleId: 'closed-hours',
    reason: `Official status is ${label} but ${trains(summary.vehicles15)} due. This is likely the start or end of service, so no alarm is raised.`,
    confidence: 'low',
  };
}

/** Verdicts decided by the official status alone, before any live data is consulted. */
function statusOnlyResult(kind: StatusKind, label: string): Result | null {
  switch (kind) {
    case 'unclassified':
      return {
        outcome: 'unknown',
        ruleId: 'unclassified-status',
        reason: `Official status "${label}" is not one Drift recognises, so no comparison is made.`,
        confidence: 'low',
      };
    case 'partial':
      return {
        outcome: 'unknown',
        ruleId: 'partial-status',
        reason: `Official status is ${label}. Live traffic cannot confirm or contradict a partial or planned status.`,
        confidence: 'low',
      };
    case 'delays':
      return {
        outcome: 'unknown',
        ruleId: 'delays-unverifiable',
        reason: `Official status is ${label}. Delayed trains still run, so live traffic cannot contradict it.`,
        confidence: 'low',
      };
    case 'running':
    case 'down':
    case 'closed':
      return null;
  }
}

function evaluateLine(
  status: LineStatus,
  summary: ArrivalSummary | undefined,
  network: Network,
  now: Date,
): Verdict {
  const classification = classify(status.statuses);
  const label = status.statuses.map((s) => s.label).join(' and ');
  const official = { severity: classification.driving.severity, label };
  const verdict = (result: Result, observed: Observed | null): Verdict => ({
    lineId: status.lineId,
    official,
    observed,
    ...result,
  });

  const statusOnly = statusOnlyResult(classification.kind, label);
  if (statusOnly !== null) return verdict(statusOnly, null);

  if (!isUsable(summary, now)) {
    if (isFresh(summary, now)) {
      const empty = evaluateEmpty(label, classification, summary, network, now);
      if (empty !== null) return verdict(empty, observedFrom(summary));
    }
    return verdict(
      {
        outcome: 'unknown',
        ruleId: 'no-arrivals',
        reason: 'No recent live train data for this line, so no comparison is made.',
        confidence: 'low',
      },
      null,
    );
  }

  const observed = observedFrom(summary);

  if (classification.kind === 'down')
    return verdict(evaluateDown(label, summary), observed);
  if (classification.kind === 'closed')
    return verdict(evaluateClosed(label, summary), observed);

  if (network.quiet) {
    return verdict(
      {
        outcome: 'unknown',
        ruleId: 'network-quiet',
        reason:
          'Almost every line shows few trains, which points to service hours or a data fault rather than this line.',
        confidence: 'low',
      },
      observed,
    );
  }

  return verdict(
    evaluateRunning(status.lineId, label, classification, summary),
    observed,
  );
}

/**
 * Compare each line's official status with its live summary. Pure and deterministic:
 * the clock is injected and nothing is read from outside. Returns one verdict per
 * status, in the order given. Lines with no summary resolve to `unknown`.
 */
export function evaluate(
  statuses: readonly LineStatus[],
  summaries: readonly ArrivalSummary[],
  now: Date,
): Verdict[] {
  const byLine = new Map(summaries.map((summary) => [summary.lineId, summary]));
  const network = describeNetwork([...byLine.values()], now);

  return statuses.map((status) =>
    evaluateLine(status, byLine.get(status.lineId), network, now),
  );
}
