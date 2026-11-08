// Generates Drift's brand assets.
//
//   pnpm brand
//
// Step 1 writes the SVG sources into brand/. The wordmark is outlined from the real
// Urbanist glyphs, so no SVG depends on a font being installed.
// Step 2 renders the PNG, ICO and Open Graph files into apps/web/public.

import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import opentype from 'opentype.js';

const root = path.resolve(import.meta.dirname, '..');
const brandDir = path.join(root, 'brand');
const publicDir = path.join(root, 'apps/web/public');
const require = createRequire(import.meta.url);
const fontDir = path.dirname(require.resolve('@expo-google-fonts/urbanist/package.json'));

const COLOR = {
  deep: '#0B2A6F',
  core: '#2563EB',
  light: '#BFD7FF',
  white: '#FFFFFF',
  ink: '#0A0B0F',
  grey: '#6B7280',
};

function loadFont(weightFolder, file) {
  const buffer = readFileSync(path.join(fontDir, weightFolder, file));
  return opentype.parse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );
}

const bold = loadFont('700Bold', 'Urbanist_700Bold.ttf');
const semibold = loadFont('600SemiBold', 'Urbanist_600SemiBold.ttf');

/** Text as an SVG path, positioned by its baseline. Returns the path data and its width. */
function outline(font, text, x, baseline, size) {
  return {
    d: font.getPath(text, x, baseline, size).toPathData(2),
    width: font.getAdvanceWidth(text, size),
  };
}

/**
 * The mark: two lines that start together and diverge, the official one staying level
 * and the real one lifting away. Drawn in a 48 by 48 box.
 */
function mark({ official, real }) {
  return [
    `<path d="M8 32 H40" fill="none" stroke="${official}" stroke-width="5" stroke-linecap="round"/>`,
    `<path d="M8 32 C20 32 26 14 40 14" fill="none" stroke="${real}" stroke-width="5" stroke-linecap="round"/>`,
  ].join('');
}

function svg(width, height, body, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;
}

// ---- Step 1: SVG sources -------------------------------------------------------

function logo(colors) {
  const size = 34;
  const word = outline(bold, 'drift', 60, 36, size);
  const width = Math.ceil(60 + word.width + 2);
  const body = `${mark(colors)}<path d="${word.d}" fill="${colors.word}"/>`;
  return svg(width, 48, body, 'Drift');
}

const files = {
  'logo.svg': logo({ official: COLOR.grey, real: COLOR.core, word: COLOR.deep }),
  'logo-mono.svg': logo({
    official: 'currentColor',
    real: 'currentColor',
    word: 'currentColor',
  }),
  'logo-on-dark.svg': logo({
    official: COLOR.light,
    real: COLOR.white,
    word: COLOR.white,
  }),
  'mark.svg': svg(48, 48, mark({ official: COLOR.grey, real: COLOR.core }), 'Drift'),
};

/** App icon: the mark on a deep blue rounded square, with room to breathe. */
function icon(size, { rounded }) {
  const radius = rounded ? size * 0.22 : 0;
  const scale = (size * 0.6) / 48;
  const offset = (size - 48 * scale) / 2;
  const body =
    `<rect width="${size}" height="${size}" rx="${radius}" fill="${COLOR.deep}"/>` +
    `<g transform="translate(${offset} ${offset}) scale(${scale})">${mark({ official: COLOR.light, real: COLOR.white })}</g>`;
  return svg(size, size, body, 'Drift');
}

files['favicon.svg'] = icon(64, { rounded: true });

/** Open Graph image, 1200 by 630. */
function openGraph() {
  const word = outline(bold, 'drift', 168, 150, 84);
  const lines = ['Where the official status', 'and the real network', 'drift apart.'].map(
    (text, index) => outline(semibold, text, 80, 330 + index * 84, 68),
  );
  const body =
    `<rect width="1200" height="630" fill="${COLOR.white}"/>` +
    `<rect x="0" y="618" width="1200" height="12" fill="${COLOR.deep}"/>` +
    `<g transform="translate(80 80) scale(1.75)">${mark({ official: COLOR.grey, real: COLOR.core })}</g>` +
    `<path d="${word.d}" fill="${COLOR.deep}"/>` +
    lines.map((line) => `<path d="${line.d}" fill="${COLOR.ink}"/>`).join('') +
    `<g transform="translate(700 90) scale(10)" opacity="0.14">${mark({ official: COLOR.deep, real: COLOR.deep })}</g>`;
  return svg(
    1200,
    630,
    body,
    'Drift: where the official status and the real network drift apart',
  );
}

files['og-image.svg'] = openGraph();

mkdirSync(brandDir, { recursive: true });
for (const [name, content] of Object.entries(files)) {
  writeFileSync(path.join(brandDir, name), content);
}

// ---- Step 2: generated files for the web app ----------------------------------

mkdirSync(publicDir, { recursive: true });
copyFileSync(path.join(brandDir, 'logo.svg'), path.join(publicDir, 'logo.svg'));
copyFileSync(path.join(brandDir, 'favicon.svg'), path.join(publicDir, 'favicon.svg'));

function png(svgText, width) {
  return new Resvg(svgText, { fitTo: { mode: 'width', value: width } }).render().asPng();
}

writeFileSync(
  path.join(publicDir, 'icon-192.png'),
  png(icon(512, { rounded: false }), 192),
);
writeFileSync(
  path.join(publicDir, 'icon-512.png'),
  png(icon(512, { rounded: false }), 512),
);
writeFileSync(
  path.join(publicDir, 'apple-touch-icon.png'),
  png(icon(512, { rounded: false }), 180),
);
writeFileSync(path.join(publicDir, 'og-image.png'), png(files['og-image.svg'], 1200));

/** An ICO file holding PNG images, which every current browser reads. */
function ico(sizes) {
  const images = sizes.map((size) => png(icon(256, { rounded: true }), size));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map((image, index) => {
    const size = sizes[index];
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size, 0);
    entry.writeUInt8(size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(image.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += image.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images]);
}

writeFileSync(path.join(publicDir, 'favicon.ico'), ico([16, 32, 48]));

process.stdout.write('Brand assets written to brand/ and apps/web/public/\n');
