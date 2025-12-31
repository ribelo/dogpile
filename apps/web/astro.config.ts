import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'
import solidJs from '@astrojs/solid-js'
import tailwind from '@astrojs/tailwind'

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [
    solidJs(),
    tailwind(),
  ],
  i18n: {
    defaultLocale: "pl",
    locales: ["pl", "en"],
    routing: {
      prefixDefaultLocale: false,
      redirectToDefaultLocale: true
    }
  }
})
