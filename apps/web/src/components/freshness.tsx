import type { Snapshot } from '@drift/shared';
import { useNow } from '../lib/use-clock.ts';
import { ageSeconds, formatAge } from '../lib/time.ts';

/** Past this age the dot stops pulsing, because the data is no longer live. */
const LIVE_WITHIN_SECONDS = 150;

/** "3 minutes ago", ticking live, measured on the server's clock. */
export function Age({
  iso,
  serverOffsetMs,
}: {
  readonly iso: string;
  readonly serverOffsetMs: number;
}) {
  const now = useNow();
  return <time dateTime={iso}>{formatAge(ageSeconds(iso, now, serverOffsetMs))}</time>;
}

/** How old the status and the train data are. Ages come from server timestamps. */
export function Freshness({
  snapshot,
  serverOffsetMs,
  online,
}: {
  readonly snapshot: Snapshot;
  readonly serverOffsetMs: number;
  readonly online: boolean;
}) {
  const now = useNow();
  const age = ageSeconds(snapshot.generatedAt, now, serverOffsetMs);
  const live = online && !snapshot.stale && age <= LIVE_WITHIN_SECONDS;

  return (
    <>
      <span className="fresh pill" data-state={live ? 'live' : 'stale'}>
        <span className="fresh__dot" aria-hidden="true" />
        <span>
          Updated <time dateTime={snapshot.generatedAt}>{formatAge(age)}</time>
        </span>
      </span>
      {snapshot.arrivalsAsOf !== null && (
        <span className="pill">
          Train data from{' '}
          <time dateTime={snapshot.arrivalsAsOf}>
            {formatAge(ageSeconds(snapshot.arrivalsAsOf, now, serverOffsetMs))}
          </time>
        </span>
      )}
    </>
  );
}
