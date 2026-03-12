import { defineConfig } from "tsup";

export default defineConfig({
  entry: { extension: "src/extension.ts" },
  format: ["cjs"],
  target: "node18",
  platform: "node",
  bundle: true,
  splitting: false,
  minify: true,
  dts: false,
  sourcemap: false,
  clean: true,
  outDir: "dist",
  external: ["vscode"],
});
