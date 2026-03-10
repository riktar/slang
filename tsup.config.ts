import { defineConfig } from "tsup";

export default defineConfig([
  {
    // Library — ESM + CJS dual format
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    target: "node22",
    platform: "node",
    bundle: true,
    splitting: false,
    minify: true,
    dts: true,
    sourcemap: false,
    clean: true,
    outDir: "dist",
  },
  {
    // CLI — ESM only, single self-contained bundle
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    target: "node22",
    platform: "node",
    bundle: true,
    splitting: false,
    minify: true,
    dts: false,
    sourcemap: false,
    clean: false,
    outDir: "dist",
  },
  {
    // MCP server — stdio transport for Claude Code, Claude Desktop, OpenAI Desktop
    entry: { mcp: "src/mcp.ts" },
    format: ["esm"],
    target: "node22",
    platform: "node",
    bundle: true,
    splitting: false,
    minify: true,
    dts: false,
    sourcemap: false,
    clean: false,
    outDir: "dist",
  },
]);
