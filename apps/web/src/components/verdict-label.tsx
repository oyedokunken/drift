import type { Verdict } from '@drift/shared';
import { OUTCOME_LABEL } from '../lib/view.ts';
import { CheckIcon, DashedIcon, DriftIcon } from './icons.tsx';

const ICON: Readonly<Record<Verdict['outcome'], () => React.JSX.Element>> = {
  mismatch: DriftIcon,
  match: CheckIcon,
  unknown: DashedIcon,
};

/** The outcome as an icon and a word, never colour alone. */
export function VerdictLabel({ outcome }: { readonly outcome: Verdict['outcome'] }) {
  const Icon = ICON[outcome];
  return (
    <span className="verdict">
      <Icon />
      {OUTCOME_LABEL[outcome]}
    </span>
  );
}
