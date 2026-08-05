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
