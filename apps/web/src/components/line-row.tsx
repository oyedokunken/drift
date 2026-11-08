import type { Verdict } from '@drift/shared';
import { lineCode, lineName, trackReading } from '../lib/view.ts';
import { DriftTrack } from './drift-track.tsx';
import { LiveFigure } from './live-figure.tsx';
import { VerdictLabel } from './verdict-label.tsx';

/** One line in the compact list: official beside observed, with the drift track. */
export function LineRow({ verdict }: { readonly verdict: Verdict }) {
  const reading = trackReading(verdict);

  return (
    <article
      className={`row${verdict.outcome === 'mismatch' ? ' on-dark' : ''}`}
      data-outcome={verdict.outcome}
    >
      <div className="row__head">
        <div className="row__name">
          <span className="row__title">{lineName(verdict.lineId)}</span>
          <span className="chip">{lineCode(verdict.lineId)}</span>
        </div>
        <VerdictLabel outcome={verdict.outcome} />
      </div>
      <div className="row__body">
        <div className="side row__official">
          <span className="side__label">Official</span>
          <span className="side__value">{verdict.official.label}</span>
        </div>
        <div className="side row__live">
          <span className="side__label">Live data</span>
          <LiveFigure verdict={verdict} />
        </div>
        {reading !== null && (
          <div className="row__track">
            <DriftTrack reading={reading} />
          </div>
        )}
      </div>
    </article>
  );
}
