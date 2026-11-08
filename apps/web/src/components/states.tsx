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

/**
 * The hero band while the first answer is on its way. It is sized like a typical real
 * headline and row of pills (see `.skeleton--title` and `.hero__meta-space`), so the
 * page below barely moves when the data arrives.
 */
export function HeroSkeleton() {
  return (
    <div className="hero" aria-hidden="true">
      <div className="skeleton skeleton--title" />
      <div className="hero__meta-space">
        <div className="skeleton skeleton--line" />
      </div>
    </div>
  );
}

/**
 * Announced on the very first load. Nothing visible sits under the hero band while it
 * waits: the band grows to the height of the real headline, and any placeholder below
 * it would be pushed down by that growth, which the page would count as a layout shift.
 */
export function LoadingSkeleton() {
  return (
    <p
      className="visually-hidden"
      aria-busy="true"
      aria-label="Loading live data"
      role="status"
    >
      Loading live data
    </p>
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
      <CheckIcon size={56} />
      <p className="clear__text">
        Nothing is drifting. All {checked} lines we could check match their official
        status.
      </p>
    </div>
  );
}
