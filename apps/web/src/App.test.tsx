import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';
import {
  flowingVerdict,
  gapsVerdict,
  quietVerdict,
  snapshot,
  snapshotResponse,
  unknownVerdict,
} from './test-data.ts';

function stubFetch(handler: () => Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>(handler);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
}

function renderApp() {
  return render(<App />);
}

beforeEach(() => {
  setOnline(true);
  vi.setSystemTime(new Date('2026-11-08T09:00:40.000Z'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('loading', () => {
  it('shows a skeleton while the first answer is on its way', async () => {
    stubFetch(() => new Promise<Response>(() => undefined));
    const { container } = renderApp();
    const loading = screen.getByRole('status', { name: 'Loading live data' });
    expect(loading).toHaveAttribute('aria-busy', 'true');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('with mismatches', () => {
  const body = snapshot({}, [
    quietVerdict('central'),
    flowingVerdict('victoria'),
    gapsVerdict('piccadilly'),
  ]);

  it('leads with a plain sentence that counts the drifting lines', async () => {
    stubFetch(() => Promise.resolve(snapshotResponse(body)));
    renderApp();
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(
      '3 of 11 lines are drifting from their official status',
    );
  });

  it('shows each mismatch as a card with its evidence, rule and confidence', async () => {
    stubFetch(() => Promise.resolve(snapshotResponse(body)));
    renderApp();
    const drifting = await screen.findByRole('region', { name: 'Drifting now' });
    const cards = within(drifting).getAllByRole('article');
    expect(cards).toHaveLength(3);

    const central = cards.find((card) => within(card).queryByText('Central'));
    expect(central).toBeDefined();
    if (!central) return;
    expect(within(central).getByText('Drift detected')).toBeInTheDocument();
    expect(within(central).getByText('Good Service')).toBeInTheDocument();
    expect(
      within(central).getByText('1 train due within 15 minutes'),
    ).toBeInTheDocument();
    expect(within(central).getByText(/only 1 train is due/)).toBeInTheDocument();
    expect(within(central).getByText('Rule: Quiet while good')).toBeInTheDocument();
    expect(within(central).getByText('Medium confidence')).toBeInTheDocument();
  });

  it('lists every line, mismatches first, with a verdict label on each', async () => {
    stubFetch(() => Promise.resolve(snapshotResponse(body)));
    renderApp();
    const all = await screen.findByRole('region', { name: 'All lines' });
    const rows = within(all).getAllByRole('article');
    expect(rows).toHaveLength(11);
    expect(
      within(rows[0] as HTMLElement).getByText('Drift detected'),
    ).toBeInTheDocument();
    expect(within(rows[10] as HTMLElement).getByText('In step')).toBeInTheDocument();
  });

  it('keeps a sensible heading order and an accessible page', async () => {
    stubFetch(() => Promise.resolve(snapshotResponse(body)));
    const { container } = renderApp();
    await screen.findByRole('heading', { level: 1 });
    const levels = screen.getAllByRole('heading').map((h) => Number(h.tagName.slice(1)));
    expect(levels[0]).toBe(1);
    expect(
      levels.slice(1).every((level, index) => level - (levels[index] ?? 0) <= 1),
    ).toBe(true);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('announces the refresh result politely for screen readers', async () => {
    stubFetch(() => Promise.resolve(snapshotResponse(body)));
    renderApp();
    const live = await screen.findByText('Updated. 3 of 11 lines are drifting.');
    expect(live).toHaveAttribute('aria-live', 'polite');
  });

  it('says when the data was updated, using the server clock', async () => {
    stubFetch(() => Promise.resolve(snapshotResponse(body, '2026-11-08T09:00:40.000Z')));
    renderApp();
    expect(await screen.findByText('40 seconds ago')).toBeInTheDocument();
    expect(screen.getByText('40 seconds ago').closest('span')).toHaveTextContent(
      'Updated 40 seconds ago',
    );
  });
});

describe('everything in step', () => {
  it('says so and shows no mismatch cards', async () => {
    stubFetch(() => Promise.resolve(snapshotResponse(snapshot())));
    const { container } = renderApp();
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'Every line we can check is in step with its official status',
    );
    expect(screen.getByText(/Nothing is drifting/)).toBeInTheDocument();
    expect(
      screen.getByText('Updated. Every line we can check is in step.'),
    ).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('partial data', () => {
  it('explains lines that have no live trains yet, without alarm', async () => {
    const body = snapshot({}, [
      unknownVerdict('central', 'no-arrivals'),
      unknownVerdict('victoria', 'no-arrivals'),
    ]);
    stubFetch(() => Promise.resolve(snapshotResponse(body)));
    const { container } = renderApp();
    expect(await screen.findByText('Some train data is missing')).toBeInTheDocument();
    expect(
      screen.getByText(/Live trains have not arrived for 2 lines/),
    ).toBeInTheDocument();
    expect(screen.getByText('2 lines could not be checked')).toBeInTheDocument();
    expect(screen.getAllByText('Not enough data')).toHaveLength(2);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('stale data', () => {
  it('shows a calm banner with the age of the data when the server fell back', async () => {
    const body = snapshot({ stale: true, generatedAt: '2026-11-08T08:57:40.000Z' });
    stubFetch(() => Promise.resolve(snapshotResponse(body, '2026-11-08T09:00:40.000Z')));
    const { container } = renderApp();
    const banner = await screen.findByText('Showing earlier data');
    expect(banner).toBeInTheDocument();
    expect(screen.getByText(/last good reading, from/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('keeps the data on screen when a later refresh fails', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(snapshotResponse(snapshot())));
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole('heading', { level: 1 });

    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response('no', { status: 503 })),
    );
    window.dispatchEvent(new Event('online'));
    await waitFor(() => {
      expect(screen.getByText('Could not refresh')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(11);
    expect(user).toBeDefined();
  });
});

describe('offline', () => {
  it('keeps showing data and says you are offline', async () => {
    stubFetch(() => Promise.resolve(snapshotResponse(snapshot())));
    const { container } = renderApp();
    await screen.findByRole('heading', { level: 1 });

    setOnline(false);
    window.dispatchEvent(new Event('offline'));
    expect(await screen.findByText('You are offline')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(11);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('explains plainly when there is nothing to show yet', async () => {
    setOnline(false);
    stubFetch(() => Promise.reject(new TypeError('offline')));
    const { container } = renderApp();
    expect(await screen.findByText('You appear to be offline')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('hard error', () => {
  it('offers a retry that recovers when the service returns', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(new Response('no', { status: 503 })),
    );
    const user = userEvent.setup();
    const { container } = renderApp();

    expect(
      await screen.findByText('Live data is unavailable right now'),
    ).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    fetchMock.mockImplementation(() => Promise.resolve(snapshotResponse(snapshot())));
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'Every line we can check is in step',
    );
    expect(
      screen.queryByText('Live data is unavailable right now'),
    ).not.toBeInTheDocument();
  });

  it('refuses a response that does not match the schema instead of rendering it', async () => {
    stubFetch(() =>
      Promise.resolve(snapshotResponse({ verdicts: [{ lineId: 'central' }] })),
    );
    renderApp();
    expect(
      await screen.findByText('Live data is unavailable right now'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Central')).not.toBeInTheDocument();
  });
});

describe('footer', () => {
  it('carries the attribution and the two links', () => {
    stubFetch(() => new Promise<Response>(() => undefined));
    renderApp();
    expect(
      screen.getByText(/An independent project using TfL open data/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Powered by TfL Open Data/)).toBeInTheDocument();
    expect(
      screen.getByText(/Not affiliated with Transport for London/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'TfL open data licence' })).toHaveAttribute(
      'href',
      expect.stringContaining('tfl.gov.uk'),
    );
    expect(screen.getByRole('link', { name: 'Source on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/oyedokunken/drift',
    );
  });

  it('opens both links in a new tab without leaking the opener', () => {
    stubFetch(() => new Promise<Response>(() => undefined));
    renderApp();
    const links = within(
      screen.getByRole('navigation', { name: 'Project links' }),
    ).getAllByRole('link');
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });
});
