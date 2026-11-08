import type { OfficialStatus } from '@drift/shared';

export type StatusKind =
  /** Good Service, Minor Delays, No Issues: trains should be running normally. */
  | 'running'
  /** Suspended, Closed, Not Running: no trains should be running. */
  | 'down'
  /** Severe Delays: trains run but late, which traffic counts cannot contradict. */
  | 'delays'
  /** Service Closed: the line is shut for the night. */
  | 'closed'
  /** Part closures, planned works, mixed statuses: traffic cannot confirm or contradict. */
  | 'partial'
  /** A severity code Drift does not recognise. */
  | 'unclassified';

const GOOD_SERVICE = 10;

/**
 * Severity codes as returned by TfL's Line/Meta/Severity for Tube lines
 * (see docs/API-NOTES.md). Anything missing here is `unclassified`.
 */
const KIND_BY_SEVERITY: ReadonlyMap<number, StatusKind> = new Map<number, StatusKind>([
  [10, 'running'], // Good Service
  [9, 'running'], // Minor Delays
  [18, 'running'], // No Issues
  [2, 'down'], // Suspended
  [1, 'down'], // Closed
  [16, 'down'], // Not Running
  [6, 'delays'], // Severe Delays
  [20, 'closed'], // Service Closed
  [0, 'partial'], // Special Service
  [3, 'partial'], // Part Suspended
  [4, 'partial'], // Planned Closure
  [5, 'partial'], // Part Closure
  [7, 'partial'], // Reduced Service
  [8, 'partial'], // Bus Service
  [11, 'partial'], // Part Closed
  [12, 'partial'], // Exit Only
  [13, 'partial'], // No Step Free Access
  [14, 'partial'], // Change of frequency
  [15, 'partial'], // Diverted
  [17, 'partial'], // Issues Reported
  [19, 'partial'], // Information
]);

export interface Classification {
  readonly kind: StatusKind;
  /** The status that decided the kind: used for the verdict's official severity. */
  readonly driving: OfficialStatus;
  /** True only when every status is plain Good Service. */
  readonly allGoodService: boolean;
}

function kindOf(status: OfficialStatus): StatusKind {
  return KIND_BY_SEVERITY.get(status.severity) ?? 'unclassified';
}

/**
 * Reduce a line's statuses to one kind. Unrecognised codes win, then any partial
 * status or any mix of different kinds resolves to `partial`, so mixed signals
 * never produce a false alarm.
 */
export function classify(
  statuses: readonly [OfficialStatus, ...OfficialStatus[]],
): Classification {
  const kinds = statuses.map(kindOf);
  const allGoodService = statuses.every((status) => status.severity === GOOD_SERVICE);

  const unclassified = kinds.indexOf('unclassified');
  if (unclassified !== -1) {
    return {
      kind: 'unclassified',
      driving: statuses[unclassified] ?? statuses[0],
      allGoodService,
    };
  }

  const partial = kinds.indexOf('partial');
  if (partial !== -1) {
    return { kind: 'partial', driving: statuses[partial] ?? statuses[0], allGoodService };
  }

  const first = kinds[0] ?? 'partial';
  if (kinds.some((kind) => kind !== first)) {
    return { kind: 'partial', driving: statuses[0], allGoodService };
  }

  return { kind: first, driving: statuses[0], allGoodService };
}
