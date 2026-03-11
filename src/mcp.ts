#!/usr/bin/env node
// ─── SLANG MCP Server ───
// Exposes SLANG as an MCP server via stdio transport.
// Works with Claude Code, Claude Desktop, OpenAI Desktop, and any MCP-compatible host.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parse } from "./parser.js";
import { resolveDeps, detectDeadlocks, analyzeFlow } from "./resolver.js";
import { runFlow } from "./runtime.js";
import {
  createOpenAIAdapter,
  createAnthropicAdapter,
  createEchoAdapter,
  createSamplingAdapter,
} from "./adapter.js";
import type { RuntimeEvent } from "./runtime.js";

// ─── Helpers ───

// getAdapter is called after `server` is defined so it can reference it.
function getAdapter() {
  // Default to "sampling" when running inside an MCP host (Claude Code, etc.)
  // so the user's existing subscription is used without an API key.
  const adapterName = process.env.SLANG_ADAPTER ?? "sampling";
  const apiKey = process.env.SLANG_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? "";
  const model = process.env.SLANG_MODEL;
  const baseUrl = process.env.SLANG_BASE_URL;

  switch (adapterName) {
    case "openai":
      return createOpenAIAdapter({ apiKey, defaultModel: model, baseUrl });
    case "anthropic":
      return createAnthropicAdapter({ apiKey, defaultModel: model });
    case "sampling":
      return createSamplingAdapter(server, model);
    default:
      return createEchoAdapter();
  }
}

// ─── MCP Server ───

const server = new Server(
  { name: "slang", version: "0.3.0" },
  { capabilities: { tools: {} } },
);

// ─── Tool: list_tools ───

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "run_flow",
      description:
        "Execute a SLANG multi-agent flow. Returns the final flow state including all agent outputs, committed results, and termination status.",
      inputSchema: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description: "The SLANG source code to execute.",
          },
          adapter: {
            type: "string",
            enum: ["sampling", "openai", "anthropic", "echo"],
            description:
              "LLM adapter to use. 'sampling' (default) delegates to the MCP host (Claude Code, etc.) — no API key needed. Use 'openai' or 'anthropic' for direct API access.",
          },
          api_key: {
            type: "string",
            description:
              "API key for 'openai' or 'anthropic' adapters. Not required when using 'sampling'. Defaults to SLANG_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY env vars.",
          },
          model: {
            type: "string",
            description:
              "Model name override (e.g. 'gpt-4o', 'claude-opus-4-5'). Defaults to adapter's default.",
          },
          base_url: {
            type: "string",
            description:
              "Custom base URL for OpenAI-compatible endpoints (e.g. local Ollama).",
          },
        },
        required: ["source"],
      },
    },
    {
      name: "parse_flow",
      description:
        "Parse a SLANG source file and return the AST as JSON. Useful for validating syntax and inspecting flow structure.",
      inputSchema: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description: "The SLANG source code to parse.",
          },
        },
        required: ["source"],
      },
    },
    {
      name: "check_flow",
      description:
        "Analyse a SLANG flow's dependency graph and detect deadlocks or unreachable agents.",
      inputSchema: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description: "The SLANG source code to analyse.",
          },
        },
        required: ["source"],
      },
    },
    {
      name: "get_zero_setup_prompt",
      description:
        "Return the SLANG zero-setup system prompt. Paste it into any LLM's system prompt to turn that LLM into a SLANG interpreter without any runtime tooling.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  ],
}));

// ─── Tool: call_tool ───

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    // ── run_flow ──
    case "run_flow": {
      const source = args?.source as string;
      if (!source) {
        return { content: [{ type: "text", text: "Error: 'source' is required." }], isError: true };
      }

      // Resolve adapter — tool args > env vars
      let adapter = getAdapter();
      const argAdapter = args?.adapter as string | undefined;
      const argApiKey = args?.api_key as string | undefined;
      const argModel = args?.model as string | undefined;
      const argBaseUrl = args?.base_url as string | undefined;

      if (argAdapter) {
        switch (argAdapter) {
          case "openai":
            adapter = createOpenAIAdapter({
              apiKey: argApiKey ?? process.env.OPENAI_API_KEY ?? "",
              defaultModel: argModel,
              baseUrl: argBaseUrl,
            });
            break;
          case "anthropic":
            adapter = createAnthropicAdapter({
              apiKey: argApiKey ?? process.env.ANTHROPIC_API_KEY ?? "",
              defaultModel: argModel,
            });
            break;
          case "sampling":
            adapter = createSamplingAdapter(server, argModel);
            break;
          default:
            adapter = createEchoAdapter();
        }
      }

      const events: RuntimeEvent[] = [];
      let logText = "";

      try {
        const state = await runFlow(source, {
          adapter,
          onEvent(ev) {
            events.push(ev);
            switch (ev.type) {
              case "round_start":
                logText += `\n=== Round ${ev.round} ===\n`;
                break;
              case "agent_start":
                logText += `  [${ev.agent}] starting…\n`;
                break;
              case "agent_output":
                logText += `  [${ev.agent}] → ${String(ev.output).slice(0, 200)}\n`;
                break;
              case "agent_commit":
                logText += `  [${ev.agent}] committed\n`;
                break;
              case "agent_escalate":
                logText += `  [${ev.agent}] escalated to ${ev.target}\n`;
                break;
              case "agent_retry":
                logText += `  [${ev.agent}] retry attempt ${ev.attempt}: ${ev.error}\n`;
                break;
              case "tool_call":
                logText += `  [${ev.agent}] tool call: ${ev.tool}(${JSON.stringify(ev.args)})\n`;
                break;
              case "tool_result":
                logText += `  [${ev.agent}] tool result: ${ev.result.slice(0, 200)}\n`;
                break;
              case "checkpoint":
                logText += `  [checkpoint] round ${ev.round}\n`;
                break;
              case "flow_converged":
                logText += `\nFlow converged.\n`;
                break;
              case "flow_budget_exceeded":
                logText += `\nBudget exceeded after round ${ev.round}.\n`;
                break;
              case "flow_deadlock":
                logText += `\nDeadlock detected.\n`;
                break;
              case "flow_escalated":
                logText += `\nEscalated to ${ev.target}.\n`;
                break;
            }
          },
        });

        const result = {
          status: state.status,
          rounds: state.round,
          tokensUsed: state.tokensUsed,
          outputs: state.outputs,
          agents: Object.fromEntries(
            [...state.agents.entries()].map(([k, v]) => [
              k,
              {
                status: v.status,
                committed: v.committed,
                output: v.output,
                escalatedTo: v.escalatedTo,
                escalateReason: v.escalateReason,
              },
            ]),
          ),
          log: logText.trim(),
        };

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
      }
    }

    // ── parse_flow ──
    case "parse_flow": {
      const source = args?.source as string;
      if (!source) {
        return { content: [{ type: "text", text: "Error: 'source' is required." }], isError: true };
      }
      try {
        const ast = parse(source);
        return { content: [{ type: "text", text: JSON.stringify(ast, null, 2) }] };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Parse error: ${msg}` }], isError: true };
      }
    }

    // ── check_flow ──
    case "check_flow": {
      const source = args?.source as string;
      if (!source) {
        return { content: [{ type: "text", text: "Error: 'source' is required." }], isError: true };
      }
      try {
        const ast = parse(source);
        const flow = ast.flows[0];
        if (!flow) {
          return { content: [{ type: "text", text: "Error: No flow found in source." }], isError: true };
        }
        const graph = resolveDeps(flow);
        const deadlocks = detectDeadlocks(graph);
        const diagnostics = analyzeFlow(flow);
        const report = {
          agents: Object.fromEntries(
            [...graph.agents.entries()].map(([k, v]) => [k, v]),
          ),
          initiallyReady: graph.ready,
          blocked: graph.blocked,
          deadlocks,
          diagnostics,
          ok: deadlocks.length === 0 && diagnostics.every((d) => d.level !== "error"),
        };
        return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }] };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
      }
    }

    // ── get_zero_setup_prompt ──
    case "get_zero_setup_prompt": {
      try {
        // Try to load from the package's own file; fall back to the bundled constant.
        const candidates = [
          resolve(process.cwd(), "ZERO_SETUP_PROMPT.md"),
          new URL("../ZERO_SETUP_PROMPT.md", import.meta.url).pathname,
        ];
        let content = "";
        for (const p of candidates) {
          try {
            content = readFileSync(p, "utf8");
            break;
          } catch {
            // try next
          }
        }
        if (!content) {
          content = FALLBACK_PROMPT;
        }
        return { content: [{ type: "text", text: content }] };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
      }
    }

    default:
      return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }
});

// ─── Fallback prompt (bundled at build time) ───

const FALLBACK_PROMPT = `You are a SLANG interpreter. SLANG is a meta-language for orchestrating multi-agent workflows with three primitives: stake (produce & send), await (receive & depend), commit/escalate (accept or delegate). Execute each agent in dependency order, producing real substantive output for each stake operation.`;

// ─── Start ───

const transport = new StdioServerTransport();
await server.connect(transport);
