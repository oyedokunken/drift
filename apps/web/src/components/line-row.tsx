import type { Verdict } from '@drift/shared';
import { lineCode, lineName, observedText } from '../lib/view.ts';
import { DriftTrack } from './drift-track.tsx';
import { VerdictLabel } from './verdict-label.tsx';

/** One line in the compact list: official beside observed, with the drift track. */
export function LineRow({ verdict }: { readonly verdict: Verdict }) {
  return (
    <article
      className={`row${verdict.outcome === 'mismatch' ? ' on-dark' : ''}`}
      data-outcome={verdict.outcome}
    >
      <div className="row__name">
        {lineName(verdict.lineId)}
        <span className="chip">{lineCode(verdict.lineId)}</span>
      </div>
      <div className="row__verdict">
        <VerdictLabel outcome={verdict.outcome} />
      </div>
      <div className="row__facts">
        <div className="row__side">
          <span className="row__label">Official</span>
          <span>{verdict.official.label}</span>
        </div>
        <div className="row__side">
          <span className="row__label">Live data</span>
          <span>{observedText(verdict)}</span>
        </div>
      </div>
      <div className="row__track">
        <DriftTrack verdict={verdict} />
      </div>
    </article>
  );
}
