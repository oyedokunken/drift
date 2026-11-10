import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';
import {
  allModesSnapshot,
  longWaitsVerdict,
  quietVerdict,
  snapshotResponse,
  unknownVerdict,
} from './test-data.ts';

const body = allModesSnapshot([
  quietVerdict('central'),
  longWaitsVerdict('windrush'),
  unknownVerdict('weaver', 'not-measurable'),
]);

beforeEach(() => {
  vi.setSystemTime(new Date('2026-11-08T09:00:40.000Z'));
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() => Promise.resolve(snapshotResponse(body))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function openList() {
  render(<App />);
  return screen.findByRole('region', { name: 'All lines' });
}

const titles = (list: HTMLElement) =>
  within(list)
    .getAllByRole('article')
    .map((row) => row.querySelector('.row__title')?.textContent);

describe('mode switch', () => {
  it('counts drift across every mode in the headline', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      '2 of 19 lines are drifting',
    );
  });

  it('offers All and each mode, with All pressed first', async () => {
    await openList();
    const group = screen.getByRole('group', { name: 'Show lines by mode' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual([
      'All2 drifting',
      'Tube1 drifting',
      'Elizabeth line',
      'DLR',
      'Overground1 drifting',
    ]);
    expect(within(group).getByRole('button', { name: /^All/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows all 19 lines by default', async () => {
    const list = await openList();
    expect(within(list).getAllByRole('article')).toHaveLength(19);
  });

  it('narrows the list to one mode and renames the section', async () => {
    const user = userEvent.setup();
    await openList();
    await user.click(screen.getByRole('button', { name: /^Overground/ }));

    const list = screen.getByRole('region', { name: 'Overground lines' });
    expect(titles(list).sort()).toEqual([
      'Liberty',
      'Lioness',
      'Mildmay',
      'Suffragette',
      'Weaver',
      'Windrush',
    ]);
    expect(screen.getByRole('button', { name: /^Overground/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /^All/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('shows the DLR and Elizabeth line on their own', async () => {
    const user = userEvent.setup();
    await openList();
    await user.click(screen.getByRole('button', { name: 'DLR' }));
    expect(titles(screen.getByRole('region', { name: 'DLR lines' }))).toEqual(['DLR']);
    await user.click(screen.getByRole('button', { name: 'Elizabeth line' }));
    expect(titles(screen.getByRole('region', { name: 'Elizabeth line lines' }))).toEqual([
      'Elizabeth line',
    ]);
  });

  it('keeps a drifting line from another mode in Drifting now', async () => {
    const user = userEvent.setup();
    await openList();
    await user.click(screen.getByRole('button', { name: 'DLR' }));
    const drifting = screen.getByRole('region', { name: 'Drifting now' });
    expect(within(drifting).getByText('Windrush')).toBeInTheDocument();
    expect(within(drifting).getByText('Central')).toBeInTheDocument();
  });

  it('works from the keyboard', async () => {
    const user = userEvent.setup();
    await openList();
    screen.getByRole('button', { name: /^All/ }).focus();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('region', { name: 'Tube lines' })).toBeInTheDocument();
  });

  it('has no accessibility violations with every mode showing', async () => {
    render(<App />);
    await screen.findByRole('region', { name: 'All lines' });
    const { container } = { container: document.body };
    expect(await axe(container)).toHaveNoViolations();
  });
});
