import { defineConfig } from "tsup";

export default defineConfig({
  entry: { server: "src/server.ts" },
  format: ["esm"],
  target: "node22",
  platform: "node",
  bundle: true,
  splitting: false,
  minify: true,
  dts: false,
  sourcemap: false,
  clean: true,
  outDir: "dist",
  banner: { js: "#!/usr/bin/env node" },
});
