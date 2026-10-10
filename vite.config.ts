import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// Must match the GitHub repository name (Pages serves the site under /<repo>/).
const base = '/stitches/';

export default defineConfig({
  base,
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png', 'favicon.svg'],
      manifest: {
        name: 'Stitches – cross-stitch designer',
        short_name: 'Stitches',
        description: 'Design cross-stitch patterns in DMC colours.',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#f4ecd8',
        theme_color: '#7a2e2e',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,png,svg,json,webmanifest}'] },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
