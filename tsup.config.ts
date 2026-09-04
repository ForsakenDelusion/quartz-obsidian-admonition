import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  external: ["unist-util-visit", "@quartz-community/types", "mdast"],
  sourcemap: true,
})
