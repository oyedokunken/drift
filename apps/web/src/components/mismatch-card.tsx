import type { Verdict } from '@drift/shared';
import { lineCode, lineName, ruleTitle, trackReading } from '../lib/view.ts';
import { ConfidenceMeter } from './confidence-meter.tsx';
import { DriftTrack } from './drift-track.tsx';
import { LiveFigure } from './live-figure.tsx';
import { VerdictLabel } from './verdict-label.tsx';

/** A line whose live trains disagree with its official status, in full. */
export function MismatchCard({ verdict }: { readonly verdict: Verdict }) {
  const reading = trackReading(verdict);

  return (
    <article className="card on-dark" data-outcome={verdict.outcome}>
      <div className="card__head">
        <h3 className="card__name">
          {lineName(verdict.lineId)}
          <span className="chip">{lineCode(verdict.lineId)}</span>
        </h3>
        <VerdictLabel outcome={verdict.outcome} />
      </div>

      <dl className="card__compare">
        <div className="side">
          <dt className="side__label">Official</dt>
          <dd className="side__value side__value--large">{verdict.official.label}</dd>
        </div>
        <div className="side">
          <dt className="side__label">Live data</dt>
          <dd className="side__live">
            <LiveFigure verdict={verdict} />
          </dd>
        </div>
      </dl>

      {reading !== null && <DriftTrack reading={reading} />}

      <p className="card__reason">{verdict.reason}</p>

      <div className="card__foot">
        <span className="card__rule">Rule: {ruleTitle(verdict.ruleId)}</span>
        <ConfidenceMeter confidence={verdict.confidence} />
      </div>
    </article>
  );
}
