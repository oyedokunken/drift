import type { Verdict } from '@drift/shared';
import { trackPositions } from '../lib/view.ts';

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;

function describe(observed: number | null, official: number): string {
  if (observed === null)
    return 'Not enough data to compare the official status with live trains.';
  return Math.abs(observed - official) < 0.05
    ? 'The official status and the live trains agree.'
    : 'The official status and the live trains are far apart.';
}

/**
 * A small track that places the official status (a ring) and the live reading (a dot) on
 * one scale from no service to full service. The gap between them is the drift.
 */
export function DriftTrack({
  verdict,
  showEnds = false,
}: {
  readonly verdict: Verdict;
  readonly showEnds?: boolean;
}) {
  const { official, observed } = trackPositions(verdict);
  const left = observed === null ? official : Math.min(official, observed);
  const width = observed === null ? 0 : Math.abs(observed - official);

  return (
    <div className={`track${observed === null ? ' track--ghost' : ''}`}>
      <div className="track__rail" role="img" aria-label={describe(observed, official)}>
        {width > 0.05 && (
          <span
            className="track__gap"
            style={{ left: percent(left), width: percent(width) }}
          />
        )}
        {observed !== null && (
          <span
            className="track__marker track__marker--official"
            style={{ left: percent(official) }}
          />
        )}
        {observed !== null && (
          <span
            className="track__marker track__marker--observed"
            style={{ left: percent(observed) }}
          />
        )}
      </div>
      {showEnds && (
        <div className="track__ends" aria-hidden="true">
          <span>No service</span>
          <span>Full service</span>
        </div>
      )}
    </div>
  );
}
