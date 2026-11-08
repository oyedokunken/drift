import type { Verdict } from '@drift/shared';
import { CONFIDENCE_LABEL } from '../lib/view.ts';

const PIPS: Readonly<Record<Verdict['confidence'], number>> = {
  high: 3,
  medium: 2,
  low: 1,
};

/** Confidence as filled pips plus words, so it reads without colour. */
export function ConfidenceMeter({
  confidence,
}: {
  readonly confidence: Verdict['confidence'];
}) {
  return (
    <span className="meter">
      <span className="meter__pips" aria-hidden="true">
        {[1, 2, 3].map((pip) => (
          <span key={pip} className="meter__pip" data-on={pip <= PIPS[confidence]} />
        ))}
      </span>
      {CONFIDENCE_LABEL[confidence]}
    </span>
  );
}
