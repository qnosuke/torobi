import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages ではリポジトリ名がパスの先頭に付く
const BASE = '/torobi/';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? BASE : '/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      // やり方の動画は数が多いので先読みしない。一度見たものだけ端末に残す。
      workbox: {
        runtimeCaching: [{
          urlPattern: /\/howto\/.*\.mp4$/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'howto-video',
            rangeRequests: true,
            expiration: { maxEntries: 30 },
            cacheableResponse: { statuses: [0, 200] },
          },
        }],
      },
      manifest: {
        name: 'TOROBI',
        short_name: 'TOROBI',
        description: '12週プログラムのタイマー。強火にしない。',
        lang: 'ja',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#16120e',
        theme_color: '#16120e',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
}));
