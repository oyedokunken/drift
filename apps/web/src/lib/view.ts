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

const trains = (count: number): string => `${count} ${count === 1 ? 'train' : 'trains'}`;

/** What the live data showed, in one short plain phrase. */
export function observedText(verdict: Verdict): string {
  const { observed } = verdict;
  if (observed === null) return 'No live reading';
  if (verdict.ruleId === 'wide-gaps' && observed.headwaySec !== null) {
    return `Trains about ${Math.round(observed.headwaySec / 60)} minutes apart`;
  }
  return `${trains(observed.vehicles15)} due within 15 minutes`;
}

/**
 * Where the two markers sit on a drift track, from 0 (no service) to 1 (full service).
 * The official marker comes from the status. The observed marker comes from the metric
 * that decided the verdict. The track illustrates the shape and size of the
 * disagreement, it is not a measured scale.
 */
export interface TrackPositions {
  readonly official: number;
  readonly observed: number | null;
}

const RUNNING = 0.88;
const STOPPED = 0.1;

export function trackPositions(verdict: Verdict): TrackPositions {
  const { observed } = verdict;
  if (verdict.outcome === 'unknown' || observed === null) {
    return { official: RUNNING, observed: null };
  }

  const suspended = verdict.ruleId === 'flowing-while-suspended' || isDown(verdict);
  const official = suspended ? STOPPED : RUNNING;
  if (verdict.outcome === 'match') return { official, observed: official };

  switch (verdict.ruleId) {
    case 'quiet-while-good':
      return { official, observed: 0.08 + 0.22 * Math.min(1, observed.vehicles15 / 3) };
    case 'wide-gaps':
      return { official, observed: 0.4 };
    case 'flowing-while-suspended':
      return { official, observed: 0.55 + 0.35 * Math.min(1, observed.vehicles15 / 20) };
    default:
      return { official, observed: official };
  }
}

/** Suspended, Closed and Not Running read as "should be stopped". */
function isDown(verdict: Verdict): boolean {
  return [1, 2, 16, 20].includes(verdict.official.severity);
}
