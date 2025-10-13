// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from "@astrojs/tailwind";


export default defineConfig({
    integrations: [tailwind()],
    vite: {
      resolve: {
        alias: {
          '@assets': '/src/assets',
        },
      },
    },
  });