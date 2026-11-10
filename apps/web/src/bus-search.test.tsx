import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BusResult } from '@drift/shared';
import { App } from './App.tsx';
import { snapshot, snapshotResponse } from './test-data.ts';

const RESULT: BusResult = {
  route: '207',
  name: '207',
  checkedAt: '2026-11-08T08:59:30.000Z',
  stale: false,
  verdict: {
    official: { severity: 10, label: 'Good Service' },
    observed: null,
    outcome: 'match',
    ruleId: 'in-step',
    reason: 'Live buses are consistent with the official status.',
    confidence: 'high',
  },
};

const MISMATCH: BusResult = {
  ...RESULT,
  route: 'W11',
  verdict: {
    ...RESULT.verdict,
    outcome: 'mismatch',
    ruleId: 'long-waits',
    reason: 'Official status is Good Service but 20 of 40 stops have no bus due.',
    confidence: 'medium',
  },
};

function deferred() {
  let resolve: (response: Response) => void = () => undefined;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const errorBody = (code: string) => ({ error: { code, message: 'A message.' } });

type BusAnswer = () => Promise<Response> | Response;

function stubFetch(bus: (route: string) => BusAnswer) {
  const fetchMock = vi.fn<typeof fetch>((input) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
      'https://drift.test',
    );
    if (url.pathname === '/api/snapshot') {
      return Promise.resolve(snapshotResponse(snapshot()));
    }
    const route = decodeURIComponent(url.pathname.replace('/api/bus/', ''));
    return Promise.resolve(bus(route)());
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const busCalls = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls
    .map(([input]) => (input instanceof Request ? input.url : input.toString()))
    .filter((url) => url.startsWith('/api/bus/'));

const ok = (result: BusResult) => () => snapshotResponse(result);
const failure =
  (status: number, code: string, headers: Record<string, string> = {}) =>
  () =>
    new Response(JSON.stringify(errorBody(code)), {
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
    });

beforeEach(() => {
  vi.setSystemTime(new Date('2026-11-08T09:00:40.000Z'));
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function openSearch(search = '') {
  render(<App search={search} />);
  const region = await screen.findByRole('region', { name: 'Check a bus route' });
  return {
    region,
    input: within(region).getByLabelText('Bus route'),
    status: within(region).getByRole('status'),
  };
}

describe('bus search form', () => {
  it('has a label, a hint and no native validation', async () => {
    stubFetch(() => ok(RESULT));
    const { region, input } = await openSearch();
    const form = region.querySelector('form');
    expect(form?.noValidate).toBe(true);
    for (const attribute of [
      'required',
      'pattern',
      'min',
      'max',
      'minlength',
      'maxlength',
    ]) {
      expect(input).not.toHaveAttribute(attribute);
    }
    expect(input).not.toHaveAttribute('type', 'number');
    expect(input).toHaveAccessibleDescription('For example 207 or W11.');
  });

  it('starts idle: nothing is checked until someone asks', async () => {
    const fetchMock = stubFetch(() => ok(RESULT));
    const { status } = await openSearch();
    expect(status).toBeEmptyDOMElement();
    expect(busCalls(fetchMock)).toEqual([]);
  });
});

describe('invalid input', () => {
  it.each([
    ['empty', ''],
    ['too long', '12345'],
    ['a symbol', '20-7'],
    ['spaces only', '   '],
  ])('says so and asks nobody when the route is %s', async (_name, text) => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => ok(RESULT));
    const { input, region } = await openSearch();
    if (text !== '') await user.type(input, text);
    await user.click(within(region).getByRole('button', { name: 'Check route' }));

    expect(
      await within(region).findByText(/one to four letters or digits/),
    ).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/one to four letters or digits/);
    expect(busCalls(fetchMock)).toEqual([]);
  });

  it('clears the message once a valid route is checked', async () => {
    const user = userEvent.setup();
    stubFetch(() => ok(RESULT));
    const { input, region } = await openSearch();
    await user.click(within(region).getByRole('button', { name: 'Check route' }));
    await within(region).findByText(/one to four letters or digits/);
    await user.type(input, '207');
    await user.click(within(region).getByRole('button', { name: 'Check route' }));
    expect(await within(region).findByText('Route 207')).toBeInTheDocument();
    expect(
      within(region).queryByText(/one to four letters or digits/),
    ).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });

  it('has no accessibility violations showing the message', async () => {
    const user = userEvent.setup();
    stubFetch(() => ok(RESULT));
    const { region } = await openSearch();
    await user.click(within(region).getByRole('button', { name: 'Check route' }));
    await within(region).findByText(/one to four letters or digits/);
    expect(await axe(document.body)).toHaveNoViolations();
  });
});

describe('a result', () => {
  it('shows the verdict, rule and confidence, and checks the upper cased route', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch((route) => ok({ ...RESULT, route }));
    const { input, region } = await openSearch();
    await user.type(input, ' w11 ');
    await user.click(within(region).getByRole('button', { name: 'Check route' }));

    expect(await within(region).findByText('Route W11')).toBeInTheDocument();
    expect(busCalls(fetchMock)).toEqual(['/api/bus/W11']);
    expect(within(region).getByText('In step')).toBeInTheDocument();
    expect(within(region).getByText('Good Service')).toBeInTheDocument();
    expect(
      within(region).getByText(/Rule: In step\. High confidence\./),
    ).toBeInTheDocument();
  });

  it('shows a mismatch with its evidence', async () => {
    const user = userEvent.setup();
    stubFetch(() => ok(MISMATCH));
    const { input, region } = await openSearch();
    await user.type(input, 'w11');
    await user.click(within(region).getByRole('button', { name: 'Check route' }));
    expect(await within(region).findByText('Drift detected')).toBeInTheDocument();
    expect(within(region).getByText(/20 of 40 stops/)).toBeInTheDocument();
    expect(
      within(region).getByText(/Rule: Long waits\. Medium confidence\./),
    ).toBeInTheDocument();
  });

  it('submits from the keyboard with Enter', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(() => ok(RESULT));
    const { input, region } = await openSearch();
    await user.type(input, '207{Enter}');
    expect(await within(region).findByText('Route 207')).toBeInTheDocument();
    expect(busCalls(fetchMock)).toEqual(['/api/bus/207']);
  });

  it('puts the route in the address so the page can be shared', async () => {
    const user = userEvent.setup();
    stubFetch(() => ok(RESULT));
    const { input, region } = await openSearch();
    await user.type(input, '207{Enter}');
    await within(region).findByText('Route 207');
    expect(window.location.search).toBe('?bus=207');
  });

  it('announces the result in a polite live region', async () => {
    const user = userEvent.setup();
    stubFetch(() => ok(RESULT));
    const { input, region, status } = await openSearch();
    expect(status).toHaveAttribute('aria-live', 'polite');
    await user.type(input, '207{Enter}');
    await within(region).findByText('Route 207');
    expect(status).toHaveTextContent('Route 207');
  });

  it('has no accessibility violations with a result showing', async () => {
    const user = userEvent.setup();
    stubFetch(() => ok(MISMATCH));
    const { input, region } = await openSearch();
    await user.type(input, 'w11{Enter}');
    await within(region).findByText('Route W11');
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('says when the result is the last good one because TfL could not be reached', async () => {
    const user = userEvent.setup();
    stubFetch(() => ok({ ...RESULT, stale: true }));
    const { input, region } = await openSearch();
    await user.type(input, '207{Enter}');
    expect(await within(region).findByText(/last good result/)).toBeInTheDocument();
    expect(within(region).getByText('Route 207')).toBeInTheDocument();
  });
});

describe('a shared address', () => {
  it('checks the route in ?bus= when the page opens', async () => {
    const fetchMock = stubFetch(() => ok(RESULT));
    const { region, input } = await openSearch('?bus=207');
    expect(await within(region).findByText('Route 207')).toBeInTheDocument();
    expect(input).toHaveValue('207');
    expect(busCalls(fetchMock)).toEqual(['/api/bus/207']);
  });

  it('normalises the route in the address', async () => {
    const fetchMock = stubFetch((route) => ok({ ...RESULT, route }));
    const { region } = await openSearch('?bus=w11');
    expect(await within(region).findByText('Route W11')).toBeInTheDocument();
    expect(busCalls(fetchMock)).toEqual(['/api/bus/W11']);
  });

  it.each(['?bus=', '?bus=<script>', '?bus=toolong', '?bus=a%20b'])(
    'ignores an invalid address %s and checks nothing',
    async (search) => {
      const fetchMock = stubFetch(() => ok(RESULT));
      const { status } = await openSearch(search);
      expect(status).toBeEmptyDOMElement();
      expect(busCalls(fetchMock)).toEqual([]);
    },
  );

  it('is not shown in sample mode, which stays fixture only', async () => {
    const fetchMock = stubFetch(() => ok(RESULT));
    render(<App search="?sample=1&bus=207" />);
    await screen.findByRole('heading', { level: 1 });
    expect(
      screen.queryByRole('region', { name: 'Check a bus route' }),
    ).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('every way a check can fail', () => {
  async function search(answer: BusAnswer, text = '9999') {
    const user = userEvent.setup();
    stubFetch(() => answer);
    const view = await openSearch();
    await user.type(view.input, `${text}{Enter}`);
    return view;
  }

  it('says a route is not found, calmly', async () => {
    const { region } = await search(failure(404, 'route_not_found'));
    expect(
      await within(region).findByText(/TfL has no bus route 9999/),
    ).toBeInTheDocument();
    expect(within(region).queryByText(/Route 9999/)).not.toBeInTheDocument();
  });

  it('says when it is busy and how long to wait', async () => {
    const { region } = await search(failure(429, 'busy', { 'Retry-After': '12' }));
    expect(await within(region).findByText(/in about 12 seconds/)).toBeInTheDocument();
  });

  it('says when it is busy with no wait given', async () => {
    const { region } = await search(failure(429, 'busy'));
    expect(await within(region).findByText(/in a moment/)).toBeInTheDocument();
  });

  it.each([
    ['upstream trouble', failure(503, 'upstream_unavailable')],
    ['an unexpected error code', failure(500, 'not_found')],
    ['a body that is not JSON', () => new Response('<html>', { status: 502 })],
    ['a result in the wrong shape', () => snapshotResponse({ route: 207 })],
  ])('says bus data is not available for %s', async (_name, answer) => {
    const { region } = await search(answer, '207');
    expect(
      await within(region).findByText(/Bus data is not available/),
    ).toBeInTheDocument();
  });

  it('says so when the network fails', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>((input) =>
        (input instanceof Request ? input.url : input.toString()) === '/api/snapshot'
          ? Promise.resolve(snapshotResponse(snapshot()))
          : Promise.reject(new TypeError('failed')),
      ),
    );
    const { input, region } = await openSearch();
    await user.type(input, '207{Enter}');
    expect(
      await within(region).findByText(/Bus data is not available/),
    ).toBeInTheDocument();
  });

  it('keeps showing the last result for a route when a refresh of it fails', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    stubFetch(() => () => {
      attempt += 1;
      return attempt === 1
        ? snapshotResponse(RESULT)
        : failure(503, 'upstream_unavailable')();
    });
    const { input, region } = await openSearch();
    await user.type(input, '207{Enter}');
    await within(region).findByText('Route 207');
    await user.click(within(region).getByRole('button', { name: 'Check route' }));

    expect(
      await within(region).findByText(/Bus data is not available/),
    ).toBeInTheDocument();
    expect(
      within(region).getByText(/Showing the last result for this route/),
    ).toBeInTheDocument();
    expect(within(region).getByText('Route 207')).toBeInTheDocument();
  });

  it('does not show another route as the earlier result', async () => {
    const user = userEvent.setup();
    stubFetch((route) =>
      route === '207' ? ok(RESULT) : failure(503, 'upstream_unavailable'),
    );
    const { input, region } = await openSearch();
    await user.type(input, '207{Enter}');
    await within(region).findByText('Route 207');
    await user.clear(input);
    await user.type(input, 'W11{Enter}');

    expect(
      await within(region).findByText(/Bus data is not available/),
    ).toBeInTheDocument();
    expect(within(region).queryByText('Route 207')).not.toBeInTheDocument();
  });

  it('has no accessibility violations on a failure', async () => {
    const { region } = await search(failure(404, 'route_not_found'));
    await within(region).findByText(/TfL has no bus route/);
    expect(await axe(document.body)).toHaveNoViolations();
  });
});

describe('searching again', () => {
  it('shows only the newest answer when an older one arrives late', async () => {
    const user = userEvent.setup();
    const slow = deferred();
    stubFetch((route) =>
      route === '207' ? () => slow.promise : ok({ ...RESULT, route }),
    );
    const { input, region } = await openSearch();

    await user.type(input, '207{Enter}');
    expect(await within(region).findByText(/Checking route 207/)).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, 'W11{Enter}');
    expect(await within(region).findByText('Route W11')).toBeInTheDocument();

    slow.resolve(snapshotResponse(RESULT));
    await waitFor(() => {
      expect(within(region).getByText('Route W11')).toBeInTheDocument();
    });
    expect(within(region).queryByText('Route 207')).not.toBeInTheDocument();
  });

  it('keeps the button usable while a check runs, so a new search can start', async () => {
    const user = userEvent.setup();
    const slow = deferred();
    stubFetch(() => () => slow.promise);
    const { input, region } = await openSearch();
    await user.type(input, '207{Enter}');
    expect(await within(region).findByText(/Checking route 207/)).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'Check route' })).toBeEnabled();
    slow.resolve(snapshotResponse(RESULT));
    expect(await within(region).findByText('Route 207')).toBeInTheDocument();
  });
});
