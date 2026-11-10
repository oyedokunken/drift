import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.join(import.meta.dirname, 'tokens.css'), 'utf8');

function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`).exec(css);
  if (match?.[1] === undefined) throw new Error(`Missing colour token --${name}`);
  return match[1];
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const [r = 0, g = 0, b = 0] = channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.2 contrast ratio between two colours. */
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

/** Mixes `top` over `bottom` at the given opacity, the way a translucent layer paints. */
function blend(top: string, bottom: string, opacity: number): string {
  const mixed = [1, 3, 5].map((start) => {
    const t = parseInt(top.slice(start, start + 2), 16);
    const b = parseInt(bottom.slice(start, start + 2), 16);
    return Math.round(t * opacity + b * (1 - opacity));
  });
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The lightest the masthead gets under text: the corner glow (core blue at 55 percent)
 * with the translucent pill (white at 12 percent) on top of it.
 */
const PILL_WORST_CASE = blend(
  '#ffffff',
  blend(token('blue-600'), token('blue-900'), 0.55),
  0.12,
);

/** The lightest the footer gets under a link: the faint mark (white at 12 percent). */
const FOOTER_MARK_WORST_CASE = blend('#ffffff', token('blue-900'), 0.12);

/** Pairs that carry text. Normal text needs 4.5:1 at the least (WCAG AA). */
const TEXT_PAIRS: readonly (readonly [string, string, string])[] = [
  [token('ink'), token('white'), 'body text'],
  [token('grey-700'), token('white'), 'secondary text and live figure labels'],
  [token('grey-700'), token('grey-50'), 'secondary text on sunken surface'],
  [token('ink'), token('wash'), 'headings and body on the page wash'],
  [token('grey-700'), token('wash'), 'section lede on the page wash'],
  [token('blue-900'), token('white'), 'links, live figures, buttons text on white'],
  [token('blue-900'), token('blue-200'), 'In step pill, banner heading'],
  [token('blue-900'), token('panel-soft'), 'all clear panel text'],
  [token('grey-700'), token('grey-200'), 'not enough data pill'],
  [token('white'), token('blue-900'), 'masthead, footer, cards, the button'],
  [token('white'), token('blue-600'), 'line code chip, button hover'],
  [token('blue-200'), token('blue-900'), 'labels, hero count and links on deep blue'],
  [token('blue-900'), token('white'), 'Drift detected pill and chip on a card'],
  [token('ink'), token('blue-200'), 'banner and sample banner text'],
  [token('white'), PILL_WORST_CASE, 'freshness pill at its lightest'],
  [token('blue-200'), FOOTER_MARK_WORST_CASE, 'footer links over the faint mark'],
  [token('white'), FOOTER_MARK_WORST_CASE, 'footer text over the faint mark'],
];

/** Pairs that draw shapes. Graphical objects need 3:1 (WCAG 1.4.11). */
const SHAPE_PAIRS: readonly (readonly [string, string, string])[] = [
  [token('grey-500'), token('wash'), 'dashed outline of an unknown line'],
  [token('grey-500'), token('wash'), 'outline of a mode switch button on the page wash'],
  [token('blue-600'), token('white'), 'drift track fill and row edge on white'],
  [token('blue-600'), token('grey-200'), 'drift track fill against its rail'],
  [token('blue-900'), token('grey-200'), 'threshold tick against the rail'],
  [token('blue-600'), token('blue-200'), 'In step check disc on its pill'],
  [token('grey-700'), token('grey-200'), 'dashed ring on the not enough data pill'],
  [token('blue-200'), token('blue-900'), 'drift track fill on a mismatch card'],
  [token('white'), token('blue-900'), 'threshold tick on a mismatch card'],
  [token('blue-900'), token('white'), 'drift icon disc on its white pill'],
];

describe('palette contrast', () => {
  it.each(TEXT_PAIRS)('%s on %s meets 4.5:1 (%s)', (foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SHAPE_PAIRS)('%s on %s meets 3:1 (%s)', (foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the page wash and soft panel as tints of the light blue on white', () => {
    expect(token('wash')).toBe(blend(token('blue-200'), '#ffffff', 0.25));
    expect(token('panel-soft')).toBe(blend(token('blue-200'), '#ffffff', 0.45));
  });

  it('defines exactly the agreed blues', () => {
    expect([token('blue-900'), token('blue-600'), token('blue-200')]).toEqual([
      '#0b2a6f',
      '#2563eb',
      '#bfd7ff',
    ]);
  });
});
