import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'static',
  integrations: [react()],
  adapter: cloudflare(),
  vite: {
    ssr: {
      // Externalize Three.js and related packages for SSR compatibility
      external: ['three'],
    },
  },
});
