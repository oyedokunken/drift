import type { Verdict } from '@drift/shared';
import { MODE_FILTERS, MODE_LABELS, filterByMode, type ModeFilter } from '../lib/view.ts';

const label = (filter: ModeFilter): string =>
  filter === 'all' ? 'All' : MODE_LABELS[filter];

/**
 * Choose which mode the list of lines shows. A group of toggle buttons rather than
 * tabs, since it filters one list and does not swap panels. A mode with a line that is
 * drifting says so in words as well as a number, so the count does not rely on colour.
 */
export function ModeSwitch({
  value,
  onChange,
  verdicts,
}: {
  readonly value: ModeFilter;
  readonly onChange: (filter: ModeFilter) => void;
  readonly verdicts: readonly Verdict[];
}) {
  return (
    <div className="mode-switch" role="group" aria-label="Show lines by mode">
      {MODE_FILTERS.map((filter) => {
        const drifting = filterByMode(verdicts, filter).filter(
          (verdict) => verdict.outcome === 'mismatch',
        ).length;
        return (
          <button
            key={filter}
            type="button"
            className="mode-switch__option"
            aria-pressed={value === filter}
            onClick={() => {
              onChange(filter);
            }}
          >
            {label(filter)}
            {drifting > 0 && (
              <span className="mode-switch__count">
                {drifting}
                <span className="visually-hidden"> drifting</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
