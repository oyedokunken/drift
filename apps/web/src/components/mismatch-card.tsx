import type { Verdict } from '@drift/shared';
import { lineCode, lineName, observedText, ruleTitle } from '../lib/view.ts';
import { ConfidenceMeter } from './confidence-meter.tsx';
import { DriftTrack } from './drift-track.tsx';
import { VerdictLabel } from './verdict-label.tsx';

/** A line whose live trains disagree with its official status, in full. */
export function MismatchCard({ verdict }: { readonly verdict: Verdict }) {
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
        <div>
          <dt className="compare__label">Official</dt>
          <dd className="compare__value">{verdict.official.label}</dd>
        </div>
        <div>
          <dt className="compare__label">Live data</dt>
          <dd className="compare__value">{observedText(verdict)}</dd>
        </div>
      </dl>

      <DriftTrack verdict={verdict} showEnds />

      <p className="card__reason">{verdict.reason}</p>

      <div className="card__foot">
        <span className="card__rule">Rule: {ruleTitle(verdict.ruleId)}</span>
        <ConfidenceMeter confidence={verdict.confidence} />
      </div>
    </article>
  );
}
