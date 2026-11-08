import type { ReactNode } from 'react';
import { CheckIcon } from './icons.tsx';

/** A calm notice. It informs, it never alarms. */
export function Banner({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="banner" role="status">
      <div>
        <p className="banner__title">{title}</p>
        <p>{children}</p>
      </div>
    </div>
  );
}

/** Shown on the very first load, shaped like the page that is coming. */
export function LoadingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading live data" role="status">
      <section className="hero">
        <div className="skeleton skeleton--title" />
        <div className="skeleton skeleton--line" />
      </section>
      <div className="stack">
        {[1, 2, 3, 4, 5].map((n) => (
          <div key={n} className="skeleton skeleton--row" />
        ))}
      </div>
    </div>
  );
}

/** No data and the last try failed. Offers a retry. */
export function ErrorPanel({
  offline,
  retrying,
  onRetry,
}: {
  readonly offline: boolean;
  readonly retrying: boolean;
  readonly onRetry: () => void;
}) {
  return (
    <section className="panel" aria-labelledby="error-title">
      <h1 id="error-title" className="panel__title">
        {offline ? 'You appear to be offline' : 'Live data is unavailable right now'}
      </h1>
      <p>
        {offline
          ? 'Drift needs a connection to load live data. It will try again when you are back online.'
          : 'We could not reach the live data and have nothing earlier to show. This is usually brief.'}
      </p>
      <button type="button" className="button" onClick={onRetry} disabled={retrying}>
        {retrying ? 'Trying' : 'Try again'}
      </button>
    </section>
  );
}

/** Shown in place of the cards when nothing is drifting. */
export function AllClear({ checked }: { readonly checked: number }) {
  return (
    <div className="clear">
      <CheckIcon />
      <p className="clear__text">
        Nothing is drifting. All {checked} lines we could check match their official
        status.
      </p>
    </div>
  );
}
