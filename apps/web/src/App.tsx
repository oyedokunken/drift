import { m } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import type { Snapshot } from '@drift/shared';
import { BusSearch } from './components/bus-search.tsx';
import { Age } from './components/freshness.tsx';
import { Footer } from './components/footer.tsx';
import { Hero } from './components/hero.tsx';
import { LineRow } from './components/line-row.tsx';
import { MismatchCard } from './components/mismatch-card.tsx';
import { ModeSwitch } from './components/mode-switch.tsx';
import {
  AllClear,
  Banner,
  ErrorPanel,
  HeroSkeleton,
  LoadingSkeleton,
} from './components/states.tsx';
import { isSampleRequested } from './lib/sample-mode.ts';
import { useOnline } from './lib/use-clock.ts';
import { routeFromSearch } from './lib/use-bus.ts';
import { useSnapshot } from './lib/use-snapshot.ts';
import {
  MODE_LABELS,
  countOutcomes,
  filterByMode,
  sortVerdicts,
  type ModeFilter,
} from './lib/view.ts';
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
  const [mode, setMode] = useState<ModeFilter>('all');
  const sorted = sortVerdicts(snapshot.verdicts);
  const drifting = sorted.filter((verdict) => verdict.outcome === 'mismatch');
  const counts = countOutcomes(snapshot.verdicts);
  const shown = filterByMode(sorted, mode);

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
          {mode === 'all' ? 'All lines' : `${MODE_LABELS[mode]} lines`}
        </h2>
        <p className="section__lede">
          The official status beside what the live trains show.
        </p>
        <ModeSwitch value={mode} onChange={setMode} verdicts={snapshot.verdicts} />
        <m.ul className="stack" variants={listVariants} initial="hidden" animate="show">
          {shown.map((verdict) => (
            <m.li key={verdict.lineId} variants={itemVariants} layout="position">
              <LineRow verdict={verdict} />
            </m.li>
          ))}
        </m.ul>
      </section>
    </>
  );
}

/** The page frame shared by the live and the sample views. */
function Page({
  hero,
  banner,
  children,
}: {
  readonly hero: ReactNode;
  readonly banner?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <MotionRoot>
      <div className="shell">
        {banner}
        <div className="masthead">
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
            {hero}
          </div>
        </div>
        <main className="container">{children}</main>
        <Footer />
      </div>
    </MotionRoot>
  );
}

function LiveApp({ search }: { readonly search: string }) {
  const { status, data, failures, refreshing, refresh } = useSnapshot();
  const online = useOnline();

  return (
    <Page
      hero={
        <>
          {status === 'loading' && <HeroSkeleton />}
          {data !== null && (
            <Hero
              snapshot={data.snapshot}
              serverOffsetMs={data.serverOffsetMs}
              online={online}
            />
          )}
        </>
      }
    >
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
      <BusSearch initialRoute={routeFromSearch(search)} />
    </Page>
  );
}

/** Always visible in sample mode, so nobody mistakes the fixture for the live network. */
function SampleBanner() {
  return (
    <div className="sample-bar" role="note">
      <strong>Sample data, not live</strong>
      <a href="/">View live data</a>
    </div>
  );
}

/** `?sample=1`: fixture based mismatches, built by the real engine, with no network. */
function SampleApp() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import('./sample.ts').then(({ buildSampleSnapshot }) => {
      if (!cancelled) setSnapshot(buildSampleSnapshot(new Date()));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Page
      banner={<SampleBanner />}
      hero={
        snapshot === null ? (
          <HeroSkeleton />
        ) : (
          <Hero snapshot={snapshot} serverOffsetMs={0} online showFreshness={false} />
        )
      }
    >
      {snapshot === null ? (
        <LoadingSkeleton />
      ) : (
        <Dashboard snapshot={snapshot} serverOffsetMs={0} online failures={0} />
      )}
    </Page>
  );
}

export function App({ search = window.location.search }: { readonly search?: string }) {
  return isSampleRequested(search) ? <SampleApp /> : <LiveApp search={search} />;
}
