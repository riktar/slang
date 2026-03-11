#!/usr/bin/env node
// ─── SLANG CLI ───

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, extname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { parse } from "./parser.js";
import { resolveDeps, detectDeadlocks } from "./resolver.js";
import { runFlow, type RuntimeEvent, type FlowState, type ToolHandler } from "./runtime.js";
import {
  createOpenAIAdapter,
  createAnthropicAdapter,
  createOpenRouterAdapter,
  createEchoAdapter,
  type LLMAdapter,
} from "./adapter.js";

// ─── Helpers ───

function printUsage(): void {
  console.log(`
  slang — SLANG interpreter v0.4.0

  USAGE:
    slang run <file.slang>       Execute a SLANG flow with an LLM
    slang parse <file.slang>     Parse and show AST (dry run)
    slang check <file.slang>     Parse and check dependencies
    slang prompt                 Print the zero-setup system prompt
    slang playground             Launch the web playground (React + Vite)

  OPTIONS:
    --adapter <openai|anthropic|openrouter|echo>   LLM adapter (default: echo)
    --model <model-name>                Model override
    --api-key <key>                     API key (or set OPENAI_API_KEY / ANTHROPIC_API_KEY / OPENROUTER_API_KEY)
    --tools <file.js|file.ts>           JS/TS file exporting tool handlers (default export)
    --port <number>                     Playground server port (default: 5174)

  EXAMPLES:
    slang parse examples/research.slang
    slang run examples/research.slang --adapter openai --model gpt-4o
    slang run examples/research.slang --adapter openrouter --tools tools.js
    slang prompt > system_prompt.txt
    slang playground
    slang playground --port 3000
  `);
}

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--") && i + 1 < args.length) {
      result[arg.slice(2)] = args[i + 1]!;
      i++;
    } else if (!arg.startsWith("--")) {
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
  const adapterName = args["adapter"] ?? "echo";
  const apiKey = args["api-key"] ?? process.env["OPENAI_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"] ?? process.env["OPENROUTER_API_KEY"] ?? "";

  switch (adapterName) {
    case "openai":
      if (!apiKey) {
        console.error("Error: --api-key or OPENAI_API_KEY required for OpenAI adapter");
        process.exit(1);
      }
      return createOpenAIAdapter({
        apiKey,
        defaultModel: args["model"],
        baseUrl: args["base-url"],
      });

    case "anthropic":
      if (!apiKey) {
        console.error("Error: --api-key or ANTHROPIC_API_KEY required for Anthropic adapter");
        process.exit(1);
      }
      return createAnthropicAdapter({
        apiKey,
        defaultModel: args["model"],
      });

    case "openrouter":
      if (!apiKey) {
        console.error("Error: --api-key or OPENROUTER_API_KEY required for OpenRouter adapter");
        process.exit(1);
      }
      return createOpenRouterAdapter({
        apiKey,
        defaultModel: args["model"],
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

function eventHandler(event: RuntimeEvent): void {
  switch (event.type) {
    case "round_start":
      console.log(`\n${COLORS.bold}${COLORS.blue}═══ ROUND ${event.round} ═══${COLORS.reset}`);
      break;
    case "agent_start":
      console.log(`\n${COLORS.cyan}--- ${event.agent} ---${COLORS.reset}`);
      console.log(`${COLORS.dim}Operation: ${event.operation}${COLORS.reset}`);
      break;
    case "agent_output":
      console.log(`\n${event.output}`);
      break;
    case "agent_commit":
      console.log(`${COLORS.green}✓ ${event.agent} COMMITTED${COLORS.reset}`);
      break;
    case "agent_escalate":
      console.log(`${COLORS.yellow}↑ ${event.agent} ESCALATED to @${event.target}${event.reason ? `: ${event.reason}` : ""}${COLORS.reset}`);
      break;
    case "flow_converged":
      console.log(`\n${COLORS.bold}${COLORS.green}═══ FLOW CONVERGED ═══${COLORS.reset}`);
      break;
    case "flow_budget_exceeded":
      console.log(`\n${COLORS.bold}${COLORS.yellow}═══ BUDGET EXCEEDED (round ${event.round}) ═══${COLORS.reset}`);
      break;
    case "flow_deadlock":
      console.log(`\n${COLORS.bold}${COLORS.red}═══ DEADLOCK: ${event.agents.join(", ")} ═══${COLORS.reset}`);
      break;
    case "flow_escalated":
      console.log(`\n${COLORS.bold}${COLORS.yellow}═══ ESCALATED TO @${event.target} ═══${COLORS.reset}`);
      if (event.reason) console.log(`Reason: ${event.reason}`);
      break;
    case "tool_call":
      console.log(`${COLORS.magenta}🔧 ${event.agent} → ${event.tool}(${JSON.stringify(event.args)})${COLORS.reset}`);
      break;
    case "tool_result":
      console.log(`${COLORS.dim}   ← ${event.result.slice(0, 200)}${COLORS.reset}`);
      break;
  }
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

  console.log(`${COLORS.bold}SLANG v0.4.0${COLORS.reset} — running ${file} with ${(adapter as any).name ?? args["adapter"] ?? "echo"}`);
  if (tools) {
    console.log(`${COLORS.dim}Tools loaded: ${Object.keys(tools).join(", ")}${COLORS.reset}`);
  }

  const state = await runFlow(source, { adapter, tools, onEvent: eventHandler });
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
  const args = parseArgs(process.argv.slice(2));
  const cmd = args["_cmd"];

  switch (cmd) {
    case "run":
      await cmdRun(args);
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
