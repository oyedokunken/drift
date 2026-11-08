import type { Snapshot } from '@drift/shared';
import { countOutcomes } from '../lib/view.ts';
import { AnimatedNumber } from './animated-number.tsx';
import { Freshness } from './freshness.tsx';

/** The headline sentence and how fresh the data behind it is. */
export function Hero({
  snapshot,
  serverOffsetMs,
  online,
}: {
  readonly snapshot: Snapshot;
  readonly serverOffsetMs: number;
  readonly online: boolean;
}) {
  const counts = countOutcomes(snapshot.verdicts);

  return (
    <section className="hero" aria-labelledby="headline">
      <h1 id="headline" className="hero__title">
        {counts.mismatch > 0 ? (
          <>
            <AnimatedNumber value={counts.mismatch} /> of {counts.total}{' '}
            {counts.total === 1 ? 'line is' : 'lines are'} drifting from{' '}
            {counts.total === 1 ? 'its' : 'their'} official status
          </>
        ) : (
          <>Every line we can check is in step with its official status</>
        )}
      </h1>
      <div className="hero__meta">
        <Freshness snapshot={snapshot} serverOffsetMs={serverOffsetMs} online={online} />
        {counts.unknown > 0 && (
          <span>
            {counts.unknown} {counts.unknown === 1 ? 'line' : 'lines'} could not be
            checked
          </span>
        )}
      </div>
    </section>
  );
}
