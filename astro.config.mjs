// @ts-check
import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import netlify from "@astrojs/netlify";

const localDev =
  process.env.ATB_LOCAL_DEV === "true";

export default defineConfig({
  integrations: [
    tailwind(),
  ],

  adapter: localDev
    ? undefined
    : netlify(),

  security: {
    checkOrigin: false,
  },

  vite: {
    resolve: {
      alias: {
        "@assets": "/src/assets",
      },
    },
  },
});