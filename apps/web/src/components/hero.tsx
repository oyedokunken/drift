import { m } from 'framer-motion';
import type { Snapshot } from '@drift/shared';
import { countOutcomes } from '../lib/view.ts';
import { itemVariants, listVariants } from '../motion/motion.tsx';
import { AnimatedNumber } from './animated-number.tsx';
import { Freshness } from './freshness.tsx';

/** The headline sentence and how fresh the data behind it is. */
export function Hero({
  snapshot,
  serverOffsetMs,
  online,
  showFreshness = true,
}: {
  readonly snapshot: Snapshot;
  readonly serverOffsetMs: number;
  readonly online: boolean;
  readonly showFreshness?: boolean;
}) {
  const counts = countOutcomes(snapshot.verdicts);

  return (
    <m.section
      className="hero"
      aria-labelledby="headline"
      variants={listVariants}
      initial="hidden"
      animate="show"
    >
      <m.h1 id="headline" className="hero__title" variants={itemVariants}>
        {counts.mismatch > 0 ? (
          <>
            <AnimatedNumber value={counts.mismatch} /> of {counts.total}{' '}
            {counts.total === 1 ? 'line is' : 'lines are'} drifting from{' '}
            {counts.total === 1 ? 'its' : 'their'} official status
          </>
        ) : (
          <>Every line we can check is in step with its official status</>
        )}
      </m.h1>
      <m.div className="hero__meta" variants={itemVariants}>
        {showFreshness && (
          <Freshness
            snapshot={snapshot}
            serverOffsetMs={serverOffsetMs}
            online={online}
          />
        )}
        {counts.unknown > 0 && (
          <span className="hero__note">
            {counts.unknown} {counts.unknown === 1 ? 'line' : 'lines'} could not be
            checked
          </span>
        )}
      </m.div>
    </m.section>
  );
}
