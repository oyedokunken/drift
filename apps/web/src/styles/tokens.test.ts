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

/** Pairs that carry text. Normal text needs 4.5:1 at the least (WCAG AA). */
const TEXT_PAIRS = [
  ['ink', 'white', 'body text'],
  ['grey-700', 'white', 'secondary text'],
  ['grey-700', 'grey-50', 'secondary text on sunken surface'],
  ['blue-900', 'white', 'links, match label, buttons text on white'],
  ['white', 'blue-900', 'text on a mismatch card and the button'],
  ['blue-200', 'blue-900', 'labels on a mismatch card'],
  ['white', 'blue-600', 'button hover'],
  ['blue-600', 'white', 'hero count and link hover'],
  ['ink', 'blue-200', 'banner text'],
  ['blue-900', 'blue-200', 'banner heading'],
] as const;

/** Pairs that draw shapes. Graphical objects need 3:1 (WCAG 1.4.11). */
const SHAPE_PAIRS = [
  ['grey-500', 'white', 'dashed outline of an unknown line'],
  ['blue-600', 'white', 'drift track on a match row'],
  ['blue-200', 'blue-900', 'drift track on a mismatch card'],
  ['blue-900', 'white', 'official ring'],
] as const;

describe('palette contrast', () => {
  it.each(TEXT_PAIRS)('%s on %s meets 4.5:1 (%s)', (foreground, background) => {
    expect(contrast(token(foreground), token(background))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SHAPE_PAIRS)('%s on %s meets 3:1 (%s)', (foreground, background) => {
    expect(contrast(token(foreground), token(background))).toBeGreaterThanOrEqual(3);
  });

  it('defines exactly the agreed blues', () => {
    expect([token('blue-900'), token('blue-600'), token('blue-200')]).toEqual([
      '#0b2a6f',
      '#2563eb',
      '#bfd7ff',
    ]);
  });
});
