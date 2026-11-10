import type { BusVerdict, Observed, OfficialStatus } from '@drift/shared';
import {
  BUS_FREQUENT_MAX_HEADWAY_SEC,
  BUS_HISTORY_MAX_AGE_SEC,
  BUS_PROFILE,
} from './config.ts';
import { classify } from './classify.ts';
import { statusOnlyResult, type Result } from './evaluate.ts';
import { isWithinOperatingHours } from './hours.ts';
import type { SummaryBody } from './summarise.ts';

/** Night routes are numbered N1, N207 and so on. Their hours are not the day windows. */
const NIGHT_ROUTE = /^N\d/i;

export interface BusCheck {
  readonly routeId: string;
  readonly statuses: readonly [OfficialStatus, ...OfficialStatus[]];
  readonly summary: SummaryBody;
  /** When this route last had buses predicted, to tell "stopped" from "not running". */
  readonly lastRunningAt: Date | null;
  /** True when the Tube and the other modes are being reported normally right now. */
  readonly feedHealthy: boolean;
  readonly now: Date;
}

const unknown = (reason: string): Result => ({
  outcome: 'unknown',
  ruleId: 'not-measurable',
  reason,
  confidence: 'low',
});

function observedFrom(summary: SummaryBody): Observed {
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

function secondsSince(then: Date, now: Date): number {
  return (now.getTime() - then.getTime()) / 1000;
}

/** A route with nothing predicted: a mismatch only if it was running a moment ago. */
function evaluateSilent(check: BusCheck, label: string, allGood: boolean): Result {
  const { lastRunningAt, now, feedHealthy } = check;
  const wasRunning =
    lastRunningAt !== null && secondsSince(lastRunningAt, now) <= BUS_HISTORY_MAX_AGE_SEC;

  if (allGood && feedHealthy && lastRunningAt !== null && wasRunning) {
    return {
      outcome: 'mismatch',
      ruleId: 'no-buses',
      reason: `Official status is ${label} but no buses are predicted on this route, and it had buses ${Math.round(secondsSince(lastRunningAt, now) / 60)} minutes ago.`,
      confidence: 'medium',
    };
  }
  return unknown(
    feedHealthy
      ? 'No buses are predicted, and nothing shows this route was running earlier, so it may simply not be running.'
      : 'No buses are predicted, but TfL data looks unhealthy overall, so no comparison is made.',
  );
}

/** A route with buses: only a long wait across many stops of a frequent route is an alarm. */
function evaluateRunning(summary: SummaryBody, label: string): Result {
  const { platformsMeasured: stops, longWaitPlatforms, headwaySec } = summary;
  const profile = BUS_PROFILE;

  if (stops < profile.minPlatforms) {
    return unknown(
      `Only ${stops} stops have a bus due, too few to judge this route from one reading.`,
    );
  }
  if (headwaySec === null || headwaySec > BUS_FREQUENT_MAX_HEADWAY_SEC) {
    return unknown(
      'Buses on this route are too far apart for a long wait to mean anything, so no comparison is made.',
    );
  }

  const share = longWaitPlatforms / stops;
  if (share >= profile.longWaitShare) {
    let confidence: Result['confidence'] = 'medium';
    if (stops < profile.smallSamplePlatforms) confidence = 'low';
    else if (share >= profile.longWaitHighShare) confidence = 'high';
    return {
      outcome: 'mismatch',
      ruleId: 'long-waits',
      reason: `Official status is ${label} but ${longWaitPlatforms} of ${stops} stops have no bus due for ${profile.longWaitSec / 60} minutes or more, on a route that normally runs every ${Math.round(headwaySec / 60)} minutes.`,
      confidence,
    };
  }
  return {
    outcome: 'match',
    ruleId: 'in-step',
    reason: 'Live buses are consistent with the official status.',
    confidence: share > profile.longWaitShare * 0.75 ? 'medium' : 'high',
  };
}

/**
 * Compare a bus route's official status with its live predictions. Pure: the clock, the
 * route's earlier reading and whether the rest of the feed is healthy are all passed in.
 * Anything doubtful, which includes night routes, thin samples and infrequent routes,
 * resolves to unknown, because a false alarm is worse than a missed one.
 */
export function evaluateBus(check: BusCheck): BusVerdict {
  const { statuses, summary, routeId, now } = check;
  const classification = classify(statuses);
  const label = statuses.map((s) => s.label).join(' and ');
  const official = { severity: classification.driving.severity, label };
  const done = (result: Result, observed: Observed | null): BusVerdict => ({
    official,
    observed,
    ...result,
  });

  const statusOnly = statusOnlyResult(classification.kind, label);
  if (statusOnly !== null) return done(statusOnly, null);

  const observed = observedFrom(summary);
  if (classification.kind === 'down' || classification.kind === 'closed') {
    return done(
      unknown(
        `Official status is ${label}, but Drift does not count buses, so it cannot be checked.`,
      ),
      observed,
    );
  }
  if (!isWithinOperatingHours(now, BUS_PROFILE.serviceWindows)) {
    return done(
      unknown(
        'This is outside the hours Drift trusts for bus routes, so no comparison is made.',
      ),
      observed,
    );
  }
  if (NIGHT_ROUTE.test(routeId)) {
    return done(
      unknown(
        'Night routes run to schedules Drift does not know, so no comparison is made.',
      ),
      observed,
    );
  }
  if (summary.predictionCount === 0) {
    return done(evaluateSilent(check, label, classification.allGoodService), observed);
  }
  return done(evaluateRunning(summary, label), observed);
}
