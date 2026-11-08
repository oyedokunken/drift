import { config } from '@drift/engine';
import type { LineId, Verdict } from '@drift/shared';

interface LineNames {
  readonly name: string;
  /** A short code, so lines are identified without TfL's line colours. */
  readonly code: string;
}

const LINES: Readonly<Record<LineId, LineNames>> = {
  bakerloo: { name: 'Bakerloo', code: 'BAK' },
  central: { name: 'Central', code: 'CEN' },
  circle: { name: 'Circle', code: 'CIR' },
  district: { name: 'District', code: 'DIS' },
  'hammersmith-city': { name: 'Hammersmith and City', code: 'H&C' },
  jubilee: { name: 'Jubilee', code: 'JUB' },
  metropolitan: { name: 'Metropolitan', code: 'MET' },
  northern: { name: 'Northern', code: 'NOR' },
  piccadilly: { name: 'Piccadilly', code: 'PIC' },
  victoria: { name: 'Victoria', code: 'VIC' },
  'waterloo-city': { name: 'Waterloo and City', code: 'W&C' },
};

export function lineName(lineId: LineId): string {
  return LINES[lineId].name;
}

export function lineCode(lineId: LineId): string {
  return LINES[lineId].code;
}

export interface Counts {
  readonly mismatch: number;
  readonly match: number;
  readonly unknown: number;
  readonly total: number;
}

export function countOutcomes(verdicts: readonly Verdict[]): Counts {
  const count = (outcome: Verdict['outcome']) =>
    verdicts.filter((verdict) => verdict.outcome === outcome).length;
  return {
    mismatch: count('mismatch'),
    match: count('match'),
    unknown: count('unknown'),
    total: verdicts.length,
  };
}

const OUTCOME_ORDER: Readonly<Record<Verdict['outcome'], number>> = {
  mismatch: 0,
  match: 1,
  unknown: 2,
};

const CONFIDENCE_ORDER: Readonly<Record<Verdict['confidence'], number>> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** Mismatches first, strongest evidence first, then in step lines, then unchecked ones. */
export function sortVerdicts(verdicts: readonly Verdict[]): Verdict[] {
  return [...verdicts].sort(
    (a, b) =>
      OUTCOME_ORDER[a.outcome] - OUTCOME_ORDER[b.outcome] ||
      CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence] ||
      lineName(a.lineId).localeCompare(lineName(b.lineId)),
  );
}

const RULE_TITLES: Readonly<Record<Verdict['ruleId'], string>> = {
  'quiet-while-good': 'Quiet while good',
  'flowing-while-suspended': 'Flowing while suspended',
  'wide-gaps': 'Wide gaps',
  'closed-hours': 'Closed hours',
  'in-step': 'In step',
  'partial-status': 'Partial or planned status',
  'unclassified-status': 'Unrecognised status',
  'delays-unverifiable': 'Delays cannot be checked',
  'no-arrivals': 'No live data',
  'network-quiet': 'Network wide quiet',
};

export function ruleTitle(ruleId: Verdict['ruleId']): string {
  return RULE_TITLES[ruleId];
}

export const OUTCOME_LABEL: Readonly<Record<Verdict['outcome'], string>> = {
  mismatch: 'Drift detected',
  match: 'In step',
  unknown: 'Not enough data',
};

export const CONFIDENCE_LABEL: Readonly<Record<Verdict['confidence'], string>> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

/** The number that decided a verdict, with a short label to print beneath it. */
export interface LiveFigure {
  readonly value: number;
  readonly label: string;
}

/** What the live data showed: trains due soon, or the gap between trains for wide gaps. */
export function liveFigure(verdict: Verdict): LiveFigure | null {
  const { observed } = verdict;
  if (observed === null) return null;
  if (verdict.ruleId === 'wide-gaps' && observed.headwaySec !== null) {
    return {
      value: Math.round(observed.headwaySec / 60),
      label: 'minutes between trains',
    };
  }
  const { vehicles15 } = observed;
  return {
    value: vehicles15,
    label: vehicles15 === 1 ? 'train due in 15 min' : 'trains due in 15 min',
  };
}

/**
 * One measured value against the engine's own threshold, for the drift track. Nothing
 * here is illustrative: `value` and `threshold` are in the same unit and `domain` is
 * only the width of the axis.
 *
 * A `floor` is a minimum: fewer than the threshold raises a mismatch while service is
 * good. A `ceiling` is a maximum: the threshold or more raises a mismatch while service
 * is stopped, or while trains are too far apart.
 */
export interface TrackReading {
  readonly unit: 'trains' | 'minutes';
  readonly value: number;
  readonly threshold: number;
  readonly domain: number;
  readonly limit: 'floor' | 'ceiling';
}

/** The axis runs to twice the "clearly flowing" count, so healthy lines fill most of it. */
const TRAINS_DOMAIN = config.FLOWING_HIGH_VEHICLES * 2;

/** The axis runs to twice the wide gap threshold, past the "unambiguous" gap. */
const MINUTES_DOMAIN = (config.WIDE_HEADWAY_SEC * 2) / 60;

/** Suspended, Closed and Not Running read as "should be stopped". */
function isDown(verdict: Verdict): boolean {
  return [1, 2, 16, 20].includes(verdict.official.severity);
}

function trainsReading(verdict: Verdict, vehicles15: number): TrackReading {
  if (verdict.ruleId === 'flowing-while-suspended' || isDown(verdict)) {
    return {
      unit: 'trains',
      value: vehicles15,
      threshold: config.FLOWING_MIN_VEHICLES,
      domain: TRAINS_DOMAIN,
      limit: 'ceiling',
    };
  }
  return {
    unit: 'trains',
    value: vehicles15,
    threshold:
      config.QUIET_MIN_VEHICLES_BY_LINE[verdict.lineId] ?? config.QUIET_MIN_VEHICLES,
    domain: TRAINS_DOMAIN,
    limit: 'floor',
  };
}

/**
 * The reading to draw, or null when no honest comparison exists: no live data, a status
 * live traffic cannot judge, closed hours, or the lopsided directions case, which is
 * decided by direction rather than by the count the track would show.
 */
export function trackReading(verdict: Verdict): TrackReading | null {
  const { observed } = verdict;
  if (observed === null || verdict.outcome === 'unknown') return null;
  if (verdict.ruleId === 'closed-hours') return null;

  if (verdict.ruleId === 'wide-gaps') {
    if (observed.headwaySec === null) return null;
    return {
      unit: 'minutes',
      value: Math.round(observed.headwaySec / 60),
      threshold: config.WIDE_HEADWAY_SEC / 60,
      domain: MINUTES_DOMAIN,
      limit: 'ceiling',
    };
  }

  const reading = trainsReading(verdict, observed.vehicles15);
  const lopsided =
    verdict.outcome === 'mismatch' &&
    reading.limit === 'floor' &&
    reading.value >= reading.threshold;
  return lopsided ? null : reading;
}

const plural = (count: number, unit: string): string =>
  `${count} ${unit}${count === 1 ? '' : 's'}`;

const quantity = (count: number, unit: TrackReading['unit']): string =>
  unit === 'trains' ? plural(count, 'train') : plural(count, 'minute');

/** The rule of the threshold, in words, printed under the track. */
export function trackCaption(reading: TrackReading): string {
  const amount = quantity(reading.threshold, reading.unit);
  if (reading.unit === 'minutes') return `Alarm at ${amount} apart or more`;
  return reading.limit === 'floor'
    ? `Needs at least ${amount}`
    : `Alarm at ${amount} or more`;
}

/** The whole track as one sentence, for people who cannot see it. */
export function trackDescription(reading: TrackReading): string {
  const measured =
    reading.unit === 'trains'
      ? `${plural(reading.value, 'train')} due in 15 minutes`
      : `Trains about ${plural(reading.value, 'minute')} apart`;
  return `${measured}. ${trackCaption(reading)}.`;
}

/** Where the fill ends and the threshold sits, as shares of the axis from 0 to 1. */
export function trackShares(reading: TrackReading): { fill: number; tick: number } {
  const share = (amount: number): number =>
    Math.min(1, Math.max(0, amount / reading.domain));
  return { fill: share(reading.value), tick: share(reading.threshold) };
}
