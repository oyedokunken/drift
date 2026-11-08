import { m } from 'framer-motion';
import type { Snapshot } from '@drift/shared';
import { Age } from './components/freshness.tsx';
import { Footer } from './components/footer.tsx';
import { Hero } from './components/hero.tsx';
import { BackdropMark } from './components/mark.tsx';
import { LineRow } from './components/line-row.tsx';
import { MismatchCard } from './components/mismatch-card.tsx';
import {
  AllClear,
  Banner,
  ErrorPanel,
  HeroSkeleton,
  LoadingSkeleton,
} from './components/states.tsx';
import { useOnline } from './lib/use-clock.ts';
import { useSnapshot } from './lib/use-snapshot.ts';
import { countOutcomes, sortVerdicts } from './lib/view.ts';
import { MotionRoot, itemVariants, listVariants } from './motion/motion.tsx';

/** Verdicts that are unknown only because no live train data arrived for the line. */
function missingLiveData(snapshot: Snapshot): number {
  return snapshot.verdicts.filter((verdict) => verdict.ruleId === 'no-arrivals').length;
}

/** Plain words for screen reader users each time the data refreshes. */
function announcement(snapshot: Snapshot): string {
  const counts = countOutcomes(snapshot.verdicts);
  return counts.mismatch === 0
    ? 'Updated. Every line we can check is in step.'
    : `Updated. ${counts.mismatch} of ${counts.total} lines are drifting.`;
}

function Notices({
  snapshot,
  serverOffsetMs,
  online,
  failures,
}: {
  readonly snapshot: Snapshot;
  readonly serverOffsetMs: number;
  readonly online: boolean;
  readonly failures: number;
}) {
  const missing = missingLiveData(snapshot);
  const age = <Age iso={snapshot.generatedAt} serverOffsetMs={serverOffsetMs} />;

  return (
    <>
      {!online && (
        <Banner title="You are offline">
          Showing the last data we received, from {age}. It will refresh when you
          reconnect.
        </Banner>
      )}
      {online && snapshot.stale && (
        <Banner title="Showing earlier data">
          TfL could not be reached just now, so this is the last good reading, from {age}.
        </Banner>
      )}
      {online && !snapshot.stale && failures > 0 && (
        <Banner title="Could not refresh">
          Showing data from {age}. We will try again shortly.
        </Banner>
      )}
      {missing > 0 && (
        <Banner title="Some train data is missing">
          Live trains have not arrived for {missing} {missing === 1 ? 'line' : 'lines'},
          so {missing === 1 ? 'it is' : 'they are'} shown as not enough data.
        </Banner>
      )}
    </>
  );
}

function Dashboard({
  snapshot,
  serverOffsetMs,
  online,
  failures,
}: {
  readonly snapshot: Snapshot;
  readonly serverOffsetMs: number;
  readonly online: boolean;
  readonly failures: number;
}) {
  const sorted = sortVerdicts(snapshot.verdicts);
  const drifting = sorted.filter((verdict) => verdict.outcome === 'mismatch');
  const counts = countOutcomes(snapshot.verdicts);

  return (
    <>
      <Notices
        snapshot={snapshot}
        serverOffsetMs={serverOffsetMs}
        online={online}
        failures={failures}
      />

      <section className="section" aria-labelledby="drifting-title">
        <h2 id="drifting-title" className="section__title">
          Drifting now
        </h2>
        {drifting.length > 0 ? (
          <>
            <p className="section__lede">
              These lines show a gap between the official status and the trains the live
              data expects.
            </p>
            <m.ul
              className="stack stack--cards"
              variants={listVariants}
              initial="hidden"
              animate="show"
            >
              {drifting.map((verdict) => (
                <m.li key={verdict.lineId} variants={itemVariants} layout="position">
                  <MismatchCard verdict={verdict} />
                </m.li>
              ))}
            </m.ul>
          </>
        ) : (
          <AllClear checked={counts.match} />
        )}
      </section>

      <section className="section" aria-labelledby="all-lines-title">
        <h2 id="all-lines-title" className="section__title">
          All lines
        </h2>
        <p className="section__lede">
          The official status beside what the live trains show.
        </p>
        <m.ul className="stack" variants={listVariants} initial="hidden" animate="show">
          {sorted.map((verdict) => (
            <m.li key={verdict.lineId} variants={itemVariants} layout="position">
              <LineRow verdict={verdict} />
            </m.li>
          ))}
        </m.ul>
      </section>
    </>
  );
}

export function App() {
  const { status, data, failures, refreshing, refresh } = useSnapshot();
  const online = useOnline();

  return (
    <MotionRoot>
      <div className="shell">
        <div className="masthead">
          <BackdropMark className="masthead__mark" />
          <div className="container">
            <header className="site-header">
              <img
                className="site-header__logo"
                src="/logo-on-dark.svg"
                alt="Drift"
                width="140"
                height="32"
              />
            </header>
            {status === 'loading' && <HeroSkeleton />}
            {data !== null && (
              <Hero
                snapshot={data.snapshot}
                serverOffsetMs={data.serverOffsetMs}
                online={online}
              />
            )}
          </div>
        </div>

        <main className="container">
          {status === 'loading' && <LoadingSkeleton />}
          {status === 'failed' && (
            <ErrorPanel offline={!online} retrying={refreshing} onRetry={refresh} />
          )}
          {data !== null && (
            <>
              <p className="visually-hidden" role="status" aria-live="polite">
                {announcement(data.snapshot)}
              </p>
              <Dashboard
                snapshot={data.snapshot}
                serverOffsetMs={data.serverOffsetMs}
                online={online}
                failures={failures}
              />
            </>
          )}
        </main>

        <Footer />
      </div>
    </MotionRoot>
  );
}
