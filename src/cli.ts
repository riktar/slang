#!/usr/bin/env node
// ─── SLANG CLI ───

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, extname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { parse } from "./parser.js";
import { resolveDeps, detectDeadlocks } from "./resolver.js";
import { runFlow, testFlow, type RuntimeEvent, type FlowState, type ToolHandler, type DeliverHandler, type TestResult } from "./runtime.js";
import {
  createOpenAIAdapter,
  createAnthropicAdapter,
  createOpenRouterAdapter,
  createEchoAdapter,
  createMockAdapter,
  type LLMAdapter,
} from "./adapter.js";

// ─── Helpers ───

function printUsage(): void {
  console.log(`
  slang — SLANG interpreter v0.7.4

  USAGE:
    slang init [dir]               Scaffold a new SLANG project
    slang run <file.slang>         Execute a SLANG flow with an LLM
    slang test <file.slang>        Run a .slang file as a test (mock adapter + expect assertions)
    slang parse <file.slang>       Parse and show AST (dry run)
    slang check <file.slang>       Parse and check dependencies
    slang prompt                   Print the zero-setup system prompt
    slang playground               Launch the web playground

  OPTIONS:
    --adapter <openai|anthropic|openrouter|echo>   LLM adapter (default: echo)
    --model <model-name>                Model override
    --api-key <key>                     API key (or set via .env file)
    --mock <agent=response,...>          Mock responses for test (default: auto-generates)
    --tools <file.js|file.ts>           JS/TS file exporting tool handlers (default export)
    --deliverers <file.js|file.ts>      JS/TS file exporting deliver handlers (default export)
    --debug                             Show full round-by-round agent output
    --port <number>                     Playground server port (default: 5174)

  ENVIRONMENT:
    Place a .env file in the project root. SLANG loads it automatically.
    Supported variables: SLANG_ADAPTER, SLANG_API_KEY, SLANG_MODEL, SLANG_BASE_URL,
    OPENAI_API_KEY, ANTHROPIC_API_KEY, OPENROUTER_API_KEY

  EXAMPLES:
    slang init my-project
    slang run hello.slang --adapter openrouter
    slang run research.slang --adapter openai --tools tools.js
    slang run report.slang --adapter openrouter --deliverers deliverers.js
    slang prompt > system_prompt.txt
    slang playground
  `);
}

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        // --key=value
        result[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else if (i + 1 < args.length && !args[i + 1]!.startsWith("--")) {
        // --key value
        result[arg.slice(2)] = args[i + 1]!;
        i++;
      } else {
        // --flag (boolean)
        result[arg.slice(2)] = "true";
      }
    } else {
      if (!result["_cmd"]) result["_cmd"] = arg;
      else if (!result["_file"]) result["_file"] = arg;
    }
  }
  return result;
}

function readSlangFile(filePath: string): string {
  const absolute = resolve(filePath);
  try {
    return readFileSync(absolute, "utf-8");
  } catch {
    console.error(`Error: cannot read file '${filePath}'`);
    process.exit(1);
  }
}

function getAdapter(args: Record<string, string>): LLMAdapter {
  const adapterName = args["adapter"] ?? process.env["SLANG_ADAPTER"] ?? "echo";
  const apiKey = args["api-key"] ?? process.env["SLANG_API_KEY"] ?? process.env["OPENAI_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"] ?? process.env["OPENROUTER_API_KEY"] ?? "";
  const model = args["model"] ?? process.env["SLANG_MODEL"];
  const baseUrl = args["base-url"] ?? process.env["SLANG_BASE_URL"];

  switch (adapterName) {
    case "openai":
      if (!apiKey) {
        console.error("Error: --api-key or OPENAI_API_KEY required for OpenAI adapter");
        process.exit(1);
      }
      return createOpenAIAdapter({
        apiKey,
        defaultModel: model,
        baseUrl,
      });

    case "anthropic":
      if (!apiKey) {
        console.error("Error: --api-key or ANTHROPIC_API_KEY required for Anthropic adapter");
        process.exit(1);
      }
      return createAnthropicAdapter({
        apiKey,
        defaultModel: model,
      });

    case "openrouter":
      if (!apiKey) {
        console.error("Error: --api-key or OPENROUTER_API_KEY required for OpenRouter adapter");
        process.exit(1);
      }
      return createOpenRouterAdapter({
        apiKey,
        defaultModel: model,
      });

    case "echo":
      return createEchoAdapter();

    default:
      console.error(`Error: unknown adapter '${adapterName}'. Use: openai, anthropic, openrouter, echo`);
      process.exit(1);
  }
}

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
};

function createEventHandler(debug: boolean): (event: RuntimeEvent) => void {
  return (event: RuntimeEvent) => {
    switch (event.type) {
      case "round_start":
        if (debug) {
          console.log(`\n${COLORS.bold}${COLORS.blue}═══ ROUND ${event.round} ═══${COLORS.reset}`);
        } else {
          process.stdout.write(`\r${COLORS.dim}⏳ Round ${event.round}...${COLORS.reset}`);
        }
        break;
      case "agent_start":
        if (debug) {
          console.log(`\n${COLORS.cyan}--- ${event.agent} ---${COLORS.reset}`);
          console.log(`${COLORS.dim}Operation: ${event.operation}${COLORS.reset}`);
        }
        break;
      case "agent_output":
        if (debug) {
          console.log(`\n${event.output}`);
        }
        break;
      case "agent_commit":
        if (debug) {
          console.log(`${COLORS.green}✓ ${event.agent} COMMITTED${COLORS.reset}`);
        }
        break;
      case "agent_escalate":
        if (debug) {
          console.log(`${COLORS.yellow}↑ ${event.agent} ESCALATED to @${event.target}${event.reason ? `: ${event.reason}` : ""}${COLORS.reset}`);
        }
        break;
      case "flow_converged":
        if (!debug) process.stdout.write("\r\x1b[K");
        console.log(`\n${COLORS.bold}${COLORS.green}═══ FLOW CONVERGED ═══${COLORS.reset}`);
        break;
      case "flow_budget_exceeded":
        if (!debug) process.stdout.write("\r\x1b[K");
        console.log(`\n${COLORS.bold}${COLORS.yellow}═══ BUDGET EXCEEDED (round ${event.round}) ═══${COLORS.reset}`);
        break;
      case "flow_deadlock":
        if (!debug) process.stdout.write("\r\x1b[K");
        console.log(`\n${COLORS.bold}${COLORS.red}═══ DEADLOCK: ${event.agents.join(", ")} ═══${COLORS.reset}`);
        break;
      case "flow_escalated":
        if (!debug) process.stdout.write("\r\x1b[K");
        console.log(`\n${COLORS.bold}${COLORS.yellow}═══ ESCALATED TO @${event.target} ═══${COLORS.reset}`);
        if (event.reason) console.log(`Reason: ${event.reason}`);
        break;
      case "tool_call":
        if (debug) {
          console.log(`${COLORS.magenta}🔧 ${event.agent} → ${event.tool}(${JSON.stringify(event.args)})${COLORS.reset}`);
        }
        break;
      case "tool_result":
        if (debug) {
          console.log(`${COLORS.dim}   ← ${event.result.slice(0, 200)}${COLORS.reset}`);
        }
        break;
    }
  };
}

function printFlowResult(state: FlowState): void {
  console.log(`\n${COLORS.bold}─── RESULT ───${COLORS.reset}`);
  console.log(`Status: ${state.status}`);
  console.log(`Rounds: ${state.round}`);
  console.log(`Tokens: ${state.tokensUsed}`);
  console.log(`Agents:`);
  for (const [name, agent] of state.agents) {
    console.log(`  ${name}: ${agent.status}${agent.committed ? " ✓" : ""}`);
  }

  // Show committed agent outputs
  const committedWithOutput = [...state.agents.entries()].filter(
    ([, a]) => a.committed && a.output != null
  );
  if (committedWithOutput.length > 0) {
    for (const [name, agent] of committedWithOutput) {
      console.log(`\n${COLORS.bold}─── ${name} ───${COLORS.reset}`);
      console.log(typeof agent.output === "string" ? agent.output : JSON.stringify(agent.output, null, 2));
    }
  }

  // Show explicit @out outputs (if any)
  if (state.outputs.length > 0) {
    console.log(`\n${COLORS.bold}─── OUTPUTS ───${COLORS.reset}`);
    for (const output of state.outputs) {
      console.log(typeof output === "string" ? output : JSON.stringify(output, null, 2));
    }
  }
}

// ─── Tool Loading ───

async function loadTools(toolsPath: string): Promise<Record<string, ToolHandler>> {
  const absolute = resolve(toolsPath);
  const fileUrl = pathToFileURL(absolute).href;
  try {
    const mod = await import(fileUrl);
    const tools = mod.default ?? mod;
    if (typeof tools !== "object" || tools === null) {
      console.error(`Error: tools file must export an object { name: handler }`);
      process.exit(1);
    }
    return tools as Record<string, ToolHandler>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: cannot load tools file '${toolsPath}': ${msg}`);
    process.exit(1);
  }
}

async function loadDeliverers(deliverersPath: string): Promise<Record<string, DeliverHandler>> {
  const absolute = resolve(deliverersPath);
  const fileUrl = pathToFileURL(absolute).href;
  try {
    const mod = await import(fileUrl);
    const deliverers = mod.default ?? mod;
    if (typeof deliverers !== "object" || deliverers === null) {
      console.error(`Error: deliverers file must export an object { name: handler }`);
      process.exit(1);
    }
    return deliverers as Record<string, DeliverHandler>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: cannot load deliverers file '${deliverersPath}': ${msg}`);
    process.exit(1);
  }
}

// ─── .env Loader ───

function loadEnv(): void {
  const envPath = resolve(".env");
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf-8");
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // Only set if not already in environment (real env vars take precedence)
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// ─── Scaffold Templates ───

const INIT_HELLO_SLANG = `-- My first SLANG flow
-- Run with: slang run hello.slang

flow "hello" {
  agent Greeter {
    stake greet("world") -> @out
    commit
  }
  converge when: all_committed
}
`;

const INIT_TOOLS_JS = `// tools.js — Tool handlers for SLANG flows
// Usage: slang run flow.slang --adapter openrouter --tools tools.js
//
// Each export is an async function: (args) => Promise<string>
// Only tools declared in the agent's tools: [...] AND present here are available.

export default {
  async web_search(args) {
    const query = args.query ?? Object.values(args).join(" ");
    // Replace with a real search API call
    return JSON.stringify({ query, results: [{ title: "Example result", url: "https://example.com" }] });
  },

  async code_exec(args) {
    const code = args.code ?? "";
    // Replace with a sandboxed execution environment
    return JSON.stringify({ status: "success", output: "..." });
  },
};
`;

const INIT_ENV_EXAMPLE = `# SLANG Environment Configuration
# Copy this file to .env and fill in your values.
# SLANG loads .env automatically — no extra setup needed.

# Adapter: openai | anthropic | openrouter | echo
SLANG_ADAPTER=openrouter

# API keys (set the one matching your adapter)
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
OPENROUTER_API_KEY=sk-or-...

# Default model (optional — adapter default is used otherwise)
# SLANG_MODEL=openai/gpt-4o

# Custom base URL for OpenAI-compatible endpoints (optional)
# SLANG_BASE_URL=http://localhost:11434/v1
`;

const INIT_RESEARCH_SLANG = `-- Research flow with tool usage
-- Run with: slang run research.slang --tools tools.js

flow "research" {
  agent Researcher {
    role: "Web research specialist"
    tools: [web_search]
    retry: 2

    stake gather(topic: "AI agents") -> @Analyst
  }

  agent Analyst {
    role: "Data analyst and strategist"
    await data <- @Researcher
    stake analyze(data, framework: "SWOT") -> @out
      output: { strengths: "string", weaknesses: "string", score: "number" }
    commit
  }

  converge when: all_committed
  budget: rounds(3)
}
`;

function cmdInit(args: Record<string, string>): void {
  const dir = resolve(args["_file"] ?? ".");

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const files: Array<[string, string]> = [
    ["hello.slang", INIT_HELLO_SLANG],
    ["research.slang", INIT_RESEARCH_SLANG],
    ["tools.js", INIT_TOOLS_JS],
    [".env.example", INIT_ENV_EXAMPLE],
  ];

  let created = 0;
  let skipped = 0;
  for (const [name, content] of files) {
    const filePath = join(dir, name);
    if (existsSync(filePath)) {
      console.log(`${COLORS.dim}  skip${COLORS.reset}  ${name} (already exists)`);
      skipped++;
    } else {
      writeFileSync(filePath, content, "utf-8");
      console.log(`${COLORS.green}  create${COLORS.reset}  ${name}`);
      created++;
    }
  }

  const relDir = dir === resolve(".") ? "." : args["_file"]!;
  console.log(`\n${COLORS.bold}${COLORS.cyan}⚡ SLANG project initialized${COLORS.reset} (${created} created, ${skipped} skipped)`);
  console.log(`\n  ${COLORS.dim}Next steps:${COLORS.reset}`);
  if (relDir !== ".") {
    console.log(`  ${COLORS.dim}  cd ${relDir}${COLORS.reset}`);
  }
  console.log(`  ${COLORS.dim}  cp .env.example .env       # add your API key${COLORS.reset}`);
  console.log(`  ${COLORS.dim}  slang run hello.slang       # run with echo adapter${COLORS.reset}`);
  console.log(`  ${COLORS.dim}  slang playground            # open the web playground${COLORS.reset}`);
}

// ─── Commands ───

async function cmdRun(args: Record<string, string>): Promise<void> {
  const file = args["_file"];
  if (!file) {
    console.error("Error: specify a .slang file");
    process.exit(1);
  }

  const source = readSlangFile(file);
  const adapter = getAdapter(args);
  const tools = args["tools"] ? await loadTools(args["tools"]) : undefined;
  const deliverers = args["deliverers"] ? await loadDeliverers(args["deliverers"]) : undefined;
  const debug = args["debug"] === "true";

  console.log(`${COLORS.bold}SLANG v0.7.4${COLORS.reset} — running ${file} with ${(adapter as any).name ?? args["adapter"] ?? "echo"}`);
  if (tools) {
    console.log(`${COLORS.dim}Tools loaded: ${Object.keys(tools).join(", ")}${COLORS.reset}`);
  }
  if (deliverers) {
    console.log(`${COLORS.dim}Deliverers loaded: ${Object.keys(deliverers).join(", ")}${COLORS.reset}`);
  }

  const state = await runFlow(source, { adapter, tools, deliverers, onEvent: createEventHandler(debug) });
  printFlowResult(state);
}

function cmdParse(args: Record<string, string>): void {
  const file = args["_file"];
  if (!file) {
    console.error("Error: specify a .slang file");
    process.exit(1);
  }

  const source = readSlangFile(file);
  const ast = parse(source);
  console.log(JSON.stringify(ast, null, 2));
}

function cmdCheck(args: Record<string, string>): void {
  const file = args["_file"];
  if (!file) {
    console.error("Error: specify a .slang file");
    process.exit(1);
  }

  const source = readSlangFile(file);
  const ast = parse(source);

  for (const flow of ast.flows) {
    console.log(`\n${COLORS.bold}Flow: "${flow.name}"${COLORS.reset}`);

    const deps = resolveDeps(flow);
    console.log(`  Ready agents: ${deps.ready.join(", ") || "(none)"}`);
    console.log(`  Blocked agents: ${deps.blocked.join(", ") || "(none)"}`);

    for (const [name, dep] of deps.agents) {
      console.log(`\n  ${COLORS.cyan}${name}${COLORS.reset}:`);
      console.log(`    awaits: ${dep.awaitsFrom.join(", ") || "(none)"}`);
      console.log(`    stakes to: ${dep.stakesTo.join(", ") || "(none)"}`);
      console.log(`    ready: ${dep.isReady}`);
    }

    const deadlocks = detectDeadlocks(deps);
    if (deadlocks.length > 0) {
      console.log(`\n  ${COLORS.red}⚠ Potential deadlocks:${COLORS.reset}`);
      for (const cycle of deadlocks) {
        console.log(`    ${cycle.join(" → ")} → ${cycle[0]}`);
      }
    } else {
      console.log(`\n  ${COLORS.green}✓ No deadlocks detected${COLORS.reset}`);
    }
  }
}

function cmdPrompt(): void {
  const promptPath = new URL("../ZERO_SETUP_PROMPT.md", import.meta.url);
  try {
    const content = readFileSync(promptPath, "utf-8");
    console.log(content);
  } catch {
    console.error("Error: ZERO_SETUP_PROMPT.md not found");
    process.exit(1);
  }
}

// ─── Test Command ───

function parseMockResponses(mockArg: string): Record<string, string> {
  const responses: Record<string, string> = {};
  for (const pair of mockArg.split(",")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx !== -1) {
      const agent = pair.slice(0, eqIdx).trim();
      const response = pair.slice(eqIdx + 1).trim();
      responses[agent] = response;
    }
  }
  return responses;
}

async function cmdTest(args: Record<string, string>): Promise<void> {
  const file = args["_file"];
  if (!file) {
    console.error("Error: specify a .slang file");
    process.exit(1);
  }

  const source = readSlangFile(file);
  const debug = args["debug"] === "true";

  // Build mock adapter
  const mockResponses = args["mock"]
    ? parseMockResponses(args["mock"])
    : {};
  const adapter = createMockAdapter({
    responses: mockResponses,
    defaultResponse: "[MOCK] Default test response\nCONFIDENCE: 0.9",
  });

  console.log(`${COLORS.bold}SLANG v0.7.4${COLORS.reset} — testing ${file}`);

  const result = await testFlow(source, {
    adapter,
    onEvent: (event: RuntimeEvent) => {
      if (debug) {
        switch (event.type) {
          case "round_start":
            console.log(`\n${COLORS.dim}⏳ Round ${event.round}...${COLORS.reset}`);
            break;
          case "agent_output":
            console.log(`${COLORS.dim}  ${event.agent}: ${event.output.slice(0, 100)}${COLORS.reset}`);
            break;
        }
      }
      if (event.type === "expect_pass") {
        console.log(`  ${COLORS.green}✓${COLORS.reset} expect ${event.message} ${COLORS.dim}(line ${event.line})${COLORS.reset}`);
      } else if (event.type === "expect_fail") {
        console.log(`  ${COLORS.red}✗${COLORS.reset} expect ${event.message} ${COLORS.dim}(line ${event.line})${COLORS.reset}`);
      }
    },
  });

  console.log();
  if (result.error) {
    console.log(`${COLORS.red}ERROR${COLORS.reset}: ${result.error}`);
    process.exit(1);
  }

  const passCount = result.assertions.filter((a) => a.passed).length;
  const failCount = result.assertions.filter((a) => !a.passed).length;

  if (result.passed) {
    console.log(`${COLORS.bold}${COLORS.green}✓ ${passCount} assertion${passCount !== 1 ? "s" : ""} passed${COLORS.reset} — flow "${result.flowName}"`);
  } else {
    console.log(`${COLORS.bold}${COLORS.red}✗ ${failCount} failed${COLORS.reset}, ${passCount} passed — flow "${result.flowName}"`);
    process.exit(1);
  }
}

function cmdPlayground(args: Record<string, string>): void {
  const port = Number(args["port"] ?? "5174");

  // Resolve playground/dist relative to CLI location
  const cliDir = dirname(fileURLToPath(import.meta.url));
  const distDir = resolve(cliDir, "../playground/dist");

  if (!existsSync(distDir)) {
    console.error(`Error: playground build not found at ${distDir}`);
    console.error(`Run 'npm run build:playground' first.`);
    process.exit(1);
  }

  const MIME_TYPES: Record<string, string> = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
  };

  const server = createServer((req, res) => {
    let pathname = new URL(req.url ?? "/", `http://localhost:${port}`).pathname;

    // Strip /slang/ base path from production build
    if (pathname.startsWith("/slang/")) {
      pathname = pathname.slice("/slang".length);
    } else if (pathname === "/slang") {
      pathname = "/";
    }

    // Serve index.html for SPA routes
    let filePath = join(distDir, pathname);
    if (!extname(pathname)) {
      filePath = join(distDir, "index.html");
    }

    try {
      const data = readFileSync(filePath);
      const ext = extname(filePath);
      res.writeHead(200, { "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream" });
      res.end(data);
    } catch {
      // Fallback to index.html for SPA
      try {
        const index = readFileSync(join(distDir, "index.html"));
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(index);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    }
  });

  server.listen(port, () => {
    console.log(`${COLORS.bold}${COLORS.cyan}⚡ SLANG Playground${COLORS.reset}`);
    console.log(`${COLORS.dim}Serving at${COLORS.reset} http://localhost:${port}`);
  });
}

// ─── Main ───

async function main(): Promise<void> {
  loadEnv();

  const args = parseArgs(process.argv.slice(2));
  const cmd = args["_cmd"];

  switch (cmd) {
    case "init":
      cmdInit(args);
      break;
    case "run":
      await cmdRun(args);
      break;
    case "test":
      await cmdTest(args);
      break;
    case "parse":
      cmdParse(args);
      break;
    case "check":
      cmdCheck(args);
      break;
    case "prompt":
      cmdPrompt();
      break;
    case "playground":
      cmdPlayground(args);
      break;
    default:
      printUsage();
      break;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
