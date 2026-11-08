import type { Verdict } from '@drift/shared';
import { liveFigure } from '../lib/view.ts';

/** The live number, large, with a small label beneath. */
export function LiveFigure({ verdict }: { readonly verdict: Verdict }) {
  const figure = liveFigure(verdict);
  if (figure === null) return <span className="side__value">No live reading</span>;

  return (
    <>
      <span className="figure">{figure.value}</span>
      <span className="figure__label">{figure.label}</span>
    </>
  );
}
