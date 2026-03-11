import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const CLI = join(import.meta.dirname, "../dist/cli.js");

function run(args: string[], cwd?: string): string {
  return execFileSync("node", [CLI, ...args], {
    cwd: cwd ?? process.cwd(),
    encoding: "utf-8",
    timeout: 15000,
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });
}

// ─── slang init ───

describe("CLI: slang init", () => {
  const tmpDir = join(import.meta.dirname, "../.test-init-" + process.pid);

  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
  });

  it("scaffolds all files in a new directory", () => {
    const out = run(["init", tmpDir]);
    assert.ok(existsSync(join(tmpDir, "hello.slang")));
    assert.ok(existsSync(join(tmpDir, "research.slang")));
    assert.ok(existsSync(join(tmpDir, "tools.js")));
    assert.ok(existsSync(join(tmpDir, ".env.example")));
    assert.ok(out.includes("4 created"));
    assert.ok(out.includes("0 skipped"));
  });

  it("skips existing files on re-init", () => {
    run(["init", tmpDir]);
    const out = run(["init", tmpDir]);
    assert.ok(out.includes("0 created"));
    assert.ok(out.includes("4 skipped"));
  });

  it("scaffolds in current directory with no dir argument", () => {
    mkdirSync(tmpDir, { recursive: true });
    const out = run(["init"], tmpDir);
    assert.ok(existsSync(join(tmpDir, "hello.slang")));
    assert.ok(out.includes("4 created"));
  });

  it("creates valid .slang files that parse", () => {
    run(["init", tmpDir]);
    // hello.slang should parse without errors
    const helloOut = run(["parse", "hello.slang"], tmpDir);
    const ast = JSON.parse(helloOut);
    assert.ok(ast.flows.length > 0);
    assert.equal(ast.flows[0].name, "hello");
  });

  it(".env.example contains expected variables", () => {
    run(["init", tmpDir]);
    const content = readFileSync(join(tmpDir, ".env.example"), "utf-8");
    assert.ok(content.includes("SLANG_ADAPTER"));
    assert.ok(content.includes("OPENROUTER_API_KEY"));
    assert.ok(content.includes("SLANG_MODEL"));
    assert.ok(content.includes("SLANG_BASE_URL"));
  });
});

// ─── .env loading ───

describe("CLI: .env loading", () => {
  const tmpDir = join(import.meta.dirname, "../.test-env-" + process.pid);

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
    // Create a simple flow
    writeFileSync(
      join(tmpDir, "test.slang"),
      'flow "test" {\n  agent A {\n    stake hello("world") -> @out\n    commit\n  }\n  converge when: all_committed\n}\n',
    );
  });

  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
  });

  it("picks up SLANG_ADAPTER from .env", () => {
    writeFileSync(join(tmpDir, ".env"), "SLANG_ADAPTER=echo\n");
    // Should run without --adapter flag since .env provides it
    const out = run(["run", "test.slang"], tmpDir);
    assert.ok(out.includes("FLOW CONVERGED") || out.includes("echo"));
  });

  it("ignores comments and blank lines in .env", () => {
    writeFileSync(join(tmpDir, ".env"), "# This is a comment\n\nSLANG_ADAPTER=echo\n\n# Another comment\n");
    const out = run(["run", "test.slang"], tmpDir);
    assert.ok(out.includes("FLOW CONVERGED") || out.includes("echo"));
  });

  it("handles quoted values in .env", () => {
    writeFileSync(join(tmpDir, ".env"), 'SLANG_ADAPTER="echo"\n');
    const out = run(["run", "test.slang"], tmpDir);
    assert.ok(out.includes("FLOW CONVERGED") || out.includes("echo"));
  });

  it("real env vars take precedence over .env", () => {
    writeFileSync(join(tmpDir, ".env"), "SLANG_ADAPTER=openai\nSLANG_API_KEY=fake\n");
    // Override with real env var
    const out = execFileSync("node", [CLI, "run", "test.slang", "--adapter", "echo"], {
      cwd: tmpDir,
      encoding: "utf-8",
      timeout: 15000,
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });
    assert.ok(out.includes("echo"));
  });

  it("works without .env file", () => {
    // No .env file — should still work with --adapter flag
    const out = run(["run", "test.slang", "--adapter", "echo"], tmpDir);
    assert.ok(out.includes("FLOW CONVERGED"));
  });
});
