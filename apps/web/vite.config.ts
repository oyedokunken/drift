import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/** Self-hosted font files from @fontsource, so no third party request is made. */
const fontFiles = path.resolve(
  import.meta.dirname,
  'node_modules/@fontsource-variable/urbanist/files',
);

/**
 * Preload the latin Urbanist file so text renders in the right font on first paint.
 * The file name carries a content hash, so the tag is added after the bundle is known.
 */
function preloadFont(): Plugin {
  return {
    name: 'preload-urbanist',
    transformIndexHtml: {
      order: 'post',
      handler(_html, context) {
        const file = Object.keys(context.bundle ?? {}).find((name) =>
          name.includes('urbanist-latin-wght-normal'),
        );
        if (file === undefined) return [];
        return [
          {
            tag: 'link',
            attrs: {
              rel: 'preload',
              as: 'font',
              type: 'font/woff2',
              href: `/${file}`,
              crossorigin: '',
            },
            injectTo: 'head-prepend',
          },
        ];
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), preloadFont()],
  resolve: { alias: { '@fonts': fontFiles } },
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  build: { target: 'es2022', sourcemap: false },
});
