import { useId, useState, type SyntheticEvent } from 'react';
import type { BusResult } from '@drift/shared';
import { useBusSearch, type BusState } from '../lib/use-bus.ts';
import { CONFIDENCE_LABEL, ruleTitle } from '../lib/view.ts';
import { Age } from './freshness.tsx';
import { VerdictLabel } from './verdict-label.tsx';

function ResultCard({ result }: { readonly result: BusResult }) {
  const { verdict } = result;
  return (
    <article
      className={`bus-result${verdict.outcome === 'mismatch' ? ' on-dark' : ''}`}
      data-outcome={verdict.outcome}
    >
      <div className="bus-result__head">
        <h3 className="bus-result__title">Route {result.route}</h3>
        <VerdictLabel outcome={verdict.outcome} />
      </div>
      <p className="bus-result__official">
        <span className="side__label">Official</span> {verdict.official.label}
      </p>
      <p>{verdict.reason}</p>
      <p className="bus-result__meta">
        Rule: {ruleTitle(verdict.ruleId)}. {CONFIDENCE_LABEL[verdict.confidence]}. Checked{' '}
        <Age iso={result.checkedAt} serverOffsetMs={0} />.
      </p>
    </article>
  );
}

/** Calm wording for every state the search can be in, the result included. */
function Outcome({ state }: { readonly state: BusState }) {
  switch (state.phase) {
    case 'idle':
      return null;
    case 'invalid':
      return null;
    case 'loading':
      return <p>Checking route {state.route}. This can take a few seconds.</p>;
    case 'result':
      return (
        <>
          {state.result.stale && (
            <p className="bus-note">
              TfL could not be reached just now, so this is the last good result, from{' '}
              <Age iso={state.result.checkedAt} serverOffsetMs={0} />.
            </p>
          )}
          <ResultCard result={state.result} />
        </>
      );
    case 'not-found':
      return (
        <p>
          TfL has no bus route {state.route}. Check the number and try again, for example
          207 or W11.
        </p>
      );
    case 'trouble':
      return (
        <>
          <p className="bus-note">
            {state.reason === 'busy'
              ? `Lots of routes are being checked just now. Please try again${
                  state.retryAfterSeconds === null
                    ? ' in a moment'
                    : ` in about ${state.retryAfterSeconds} seconds`
                }.`
              : 'Bus data is not available right now. Please try again shortly.'}
          </p>
          {state.previous !== null && (
            <>
              <p className="bus-note">
                Showing the last result for this route, from{' '}
                <Age iso={state.previous.checkedAt} serverOffsetMs={0} />.
              </p>
              <ResultCard result={state.previous} />
            </>
          )}
        </>
      );
  }
}

/**
 * Check one bus route. Buses are checked when asked, never polled, so this is a search
 * and not a list. The form has no native validation: the route is validated with Zod and
 * the message is shown in the page, where a screen reader announces it.
 */
export function BusSearch({ initialRoute }: { readonly initialRoute: string | null }) {
  const { state, submit } = useBusSearch(initialRoute);
  const [input, setInput] = useState(initialRoute ?? '');
  const id = useId();
  const errorId = `${id}-error`;
  const invalid = state.phase === 'invalid';

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    submit(input);
  }

  return (
    <section className="section" aria-labelledby="bus-title">
      <h2 id="bus-title" className="section__title">
        Check a bus route
      </h2>
      <p className="section__lede">
        Search a route number to compare its official status with its live buses. Routes
        are checked when you ask, not all the time.
      </p>
      <form className="bus-form" noValidate onSubmit={onSubmit}>
        <label className="bus-form__label" htmlFor={id}>
          Bus route
        </label>
        <div className="bus-form__row">
          <input
            id={id}
            className="bus-form__input"
            name="route"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={input}
            placeholder="For example 207 or W11"
            aria-describedby={invalid ? errorId : undefined}
            aria-invalid={invalid}
            onChange={(event) => {
              setInput(event.target.value);
            }}
          />
          <button type="submit" className="button">
            Check route
          </button>
        </div>
        {state.phase === 'invalid' && (
          <p id={errorId} className="bus-form__error">
            {state.message}
          </p>
        )}
      </form>
      <div className="bus-status" role="status" aria-live="polite">
        <Outcome state={state} />
      </div>
    </section>
  );
}
