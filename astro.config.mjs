import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://rr-dev-ai.github.io',
  base: '/form-factor',
  trailingSlash: 'ignore',
  devToolbar: { enabled: false },
  build: {
    format: 'directory',
  },
});
