import { defineConfig } from "astro/config"
import solidJs from "@astrojs/solid-js"
import tailwind from "@astrojs/tailwind"
import cloudflare from "@astrojs/cloudflare"

export default defineConfig({
  output: "server",
  adapter: cloudflare(),
  integrations: [
    solidJs(),
    tailwind(),
  ],
})
