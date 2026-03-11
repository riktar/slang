<h1 align="center">🗣️ SLANG</h1>

<p align="center">
  <strong>The SQL of AI agents.</strong><br/>
  A declarative meta-language for orchestrating multi-agent workflows.<br/>
  Readable by humans. Executable by LLMs. Portable across models.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#zero-setup">Zero Setup</a> •
  <a href="#examples">Examples</a> •
  <a href="#cli">CLI</a> •
  <a href="#api">API</a> •
  <a href="#playground">Playground</a> •
  <a href="#mcp-server">MCP Server</a> •
  <a href="SPEC.md">Spec</a> •
  <a href="GRAMMAR.md">Grammar</a>
</p>

---

## Quick Start

### 1. Install

```bash
npm install -g @riktar/slang
```

### 2. Create a project

```bash
slang init my-project
cd my-project
```

This generates `hello.slang`, `research.slang`, `tools.js`, and `.env.example`.

### 3. Configure (optional)

```bash
cp .env.example .env
# Edit .env with your API key — SLANG loads it automatically
```

### 4. Run

```bash
slang run hello.slang                                    # echo adapter (no API key needed)
slang run hello.slang --adapter openrouter               # uses OPENROUTER_API_KEY from .env
slang run research.slang --adapter openai --tools tools.js
```

### 5. Explore the playground

```bash
slang playground
# Open http://localhost:5174 — edit, visualize, and run flows in the browser
```

---

## SLANG is not a framework.

> SLANG is the acronymous for <strong>Super Language for Agent Negotiation & Governance</strong>

Frameworks like LangChain, CrewAI, and AutoGen are SDKs — Python/TypeScript libraries with classes, decorators, and configuration files. SLANG is none of those things.

**SLANG is a language.** Like SQL is a language for querying data, SLANG is a language for orchestrating agents.

| SQL | SLANG |
|-----|-------|
| Didn't replace C/Java for business logic | Doesn't replace TypeScript/Python for complex pipelines |
| Created a new category: declarative queries | Creates a new category: declarative agent orchestration |
| Anyone reads it, anyone understands it | Anyone reads a `.slang` file, anyone understands the workflow |
| Portable: same SQL runs on Postgres, MySQL, SQLite | Portable: same `.slang` runs on GPT, Claude, Llama, Gemini — via OpenRouter, 300+ models with one API key |
| LLMs generate it natively (text-to-SQL) | LLMs generate it natively (text-to-SLANG) |
| Not Turing-complete — and that's the point | Not general-purpose — and that's the point |

---

## Three primitives. That's it.

```
stake   →  produce content and send it to an agent
await   →  block until another agent sends you data
commit  →  accept the result and stop
```

Every multi-agent workflow — pipelines, DAGs, loops, reviews, escalations — is a combination of these three operations. Nothing else to learn. An LLM picks it up in 30 seconds. Your PM reads it without documentation.

Compare: CrewAI has 50+ classes. LangGraph needs decorators, typed state, and YAML config. SLANG has three words.

---

## Zero Setup

No install. No API key. No runtime.

1. Copy the [system prompt](ZERO_SETUP_PROMPT.md)
2. Paste it into ChatGPT, Claude, Gemini — any LLM
3. Paste a `.slang` flow
4. It runs.

The LLM **is** the runtime. No `pip install`, no `npm install`, no configuration. This is something no SDK can offer — because an SDK requires an SDK.

---

## Same flow, any model.

```
flow "hybrid-analysis" {
  agent Researcher {
    model: "gpt-4o"              -- routed to OpenAI
    tools: [web_search]
    stake gather(topic: "quantum computing") -> @Analyst
  }
  agent Analyst {
    model: "claude-sonnet"       -- routed to Anthropic
    await data <- @Researcher
    stake analyze(data) -> @out
    commit
  }
  converge when: all_committed
}
```

The same `.slang` file runs on GPT-4o, Claude, Llama via Ollama, or **300+ models via [OpenRouter](https://openrouter.ai)** with a single API key. With the router adapter, **different agents use different providers in the same execution**. No vendor lock-in. Switch models by changing one line.

---

## Human-readable by design.

Read this flow out loud:

> *"The Researcher stakes gather on the competitors and sends it to the Analyst. The Analyst awaits the data, analyzes it, and sends to the Critic. The Critic challenges the analysis and sends feedback back. If the confidence is high enough, commit. Otherwise, escalate to a Human."*

No diagrams. No comments. No onboarding. **A `.slang` file is its own documentation.**

---

## Who is SLANG for?

### PMs, analysts, researchers — no code needed

Orchestrate AI agents by describing what you want. Paste a flow into ChatGPT and it runs. Like Zapier democratized integrations, SLANG democratizes multi-agent AI.

### Developers prototyping fast

Prototype a multi-agent workflow in 10 lines, run it in 60 seconds. Then decide if you need a full SDK. SLANG is the napkin sketch that actually executes.

### Platform teams building agent products

A portable format for agent workflows. The Dockerfile of AI orchestration. Share `.slang` files across teams, import flows like packages, run them on any backend.

---

## Examples

### Minimal — Hello World

```
flow "hello" {
  agent Greeter {
    stake greet("world") -> @out
    commit
  }
  converge when: all_committed
}
```

### Writer/Reviewer loop with conditionals

```
flow "article" {
  agent Writer {
    role: "Technical writer specializing in clear, concise articles"
    model: "gpt-4o"
    retry: 2

    stake write(topic: "Why multi-agent systems need a standard language") -> @Reviewer
    await feedback <- @Reviewer

    when feedback.approved {
      commit feedback
    }
    when feedback.rejected {
      stake revise(feedback) -> @Reviewer
    }
  }

  agent Reviewer {
    role: "Senior editor focused on clarity, accuracy, and completeness"
    model: "claude-sonnet"

    await draft <- @Writer
    stake review(draft, criteria: ["clarity", "accuracy", "completeness"]) -> @Writer
      output: { approved: "boolean", score: "number", notes: "string" }
  }

  converge when: committed_count >= 1
  budget: rounds(3)
}
```

Features shown: `role:`, `model:`, `retry:`, `when` blocks, `output:` schema, `converge`, `budget`.

### Competitive research with escalation and tools

```
flow "competitive-research" {
  agent Researcher {
    role: "Expert web researcher focused on primary sources and data"
    model: "openai/gpt-4o"
    tools: [web_search]
    retry: 3

    stake gather(competitors: ["OpenAI", "Anthropic", "Google DeepMind"],
                 focus: "AI agent frameworks") -> @Analyst
  }

  agent Analyst {
    role: "Strategic analyst specializing in competitive positioning"
    model: "anthropic/claude-sonnet-4-20250514"
    await data <- @Researcher
    stake analyze(data, framework: "SWOT") -> @Critic
      output: { strengths: "string", weaknesses: "string", score: "number" }
    await verdict <- @Critic

    commit verdict if verdict.confidence > 0.7
    escalate @Human reason: "Analysis confidence too low, need human review" if verdict.confidence <= 0.7
  }

  agent Critic {
    role: "Adversarial reviewer who challenges assumptions"
    model: "google/gemini-2.5-pro"
    await analysis <- @Analyst
    stake challenge(analysis, mode: "steelmanning") -> @Analyst
  }

  converge when: committed_count >= 1
  budget: tokens(40000), rounds(4)
}
```

Features shown: `model:` with OpenRouter model IDs (3 different providers in same flow), `tools:`, `retry:`, `output:`, `escalate @Human`, `if` conditions, `tokens` + `rounds` budget.

### Broadcast and multi-source aggregation

```
flow "parallel-report" {
  agent Coordinator {
    role: "Project coordinator who distributes tasks and compiles results"
    stake assign(sections: ["market", "technology", "finance"]) -> @all
    await results <- *
    stake compile(results) -> @out
    commit
  }

  agent MarketAnalyst {
    role: "Market research specialist"
    await task <- @Coordinator
    stake research(task, focus: "market trends and sizing") -> @Coordinator
  }

  agent TechAnalyst {
    role: "Technology trend analyst"
    await task <- @Coordinator
    stake research(task, focus: "technology landscape and innovation") -> @Coordinator
  }

  agent FinanceAnalyst {
    role: "Financial analyst specializing in projections"
    await task <- @Coordinator
    stake research(task, focus: "financial projections and unit economics") -> @Coordinator
  }

  converge when: all_committed
  budget: rounds(3)
}
```

Features shown: `@all` broadcast, `*` wildcard source, 4 parallel agents, coordinator pattern.

### Code review with tools and structured output

```
flow "code-review" {
  agent Developer {
    role: "Senior software engineer"
    tools: [code_exec]
    retry: 2

    stake implement(spec: "REST API endpoint for user registration",
                    language: "TypeScript") -> @Reviewer
      output: { code: "string", tests: "string", language: "string" }
    await feedback <- @Reviewer

    when feedback.approved {
      commit feedback
    }
    when feedback.rejected {
      stake revise(feedback.notes, original: feedback) -> @Reviewer
        output: { code: "string", tests: "string", language: "string" }
    }
  }

  agent Reviewer {
    role: "Staff engineer focused on security, performance, and best practices"
    tools: [code_exec]

    await code <- @Developer
    stake review(code, checks: ["security", "performance", "error handling"]) -> @Developer
      output: { approved: "boolean", score: "number", notes: "string" }
  }

  converge when: committed_count >= 1
  budget: rounds(4)
}
```

Features shown: `tools: [code_exec]`, `output:` on multiple stakes, `when` blocks, review loop pattern.

### Composition — importing flows

```
flow "full-report" {
  import "research" as research_flow
  import "article" as article_flow

  agent Orchestrator {
    stake run(research_flow, topic: "AI agents market 2026") -> @Compiler
    stake run(article_flow, topic: "Executive summary") -> @Compiler
  }

  agent Compiler {
    await results <- @Orchestrator (count: 2)
    stake compile(results, format: "executive briefing") -> @out
    commit
  }

  converge when: all_committed
  budget: rounds(5)
}
```

Features shown: `import ... as`, flow composition, `count:` on await, orchestration pattern.

---

## CLI

```bash
slang init [dir]             # Scaffold a new SLANG project
slang run <file.slang>       # Execute a flow
slang parse <file.slang>     # Dump AST (syntax validation)
slang check <file.slang>     # Dependency analysis + deadlock detection
slang prompt                 # Print the zero-setup system prompt
slang playground             # Launch the web playground
```

### Options

| Flag | Description |
|------|-------------|
| `--adapter` | `openai` \| `anthropic` \| `openrouter` \| `echo` (CLI only; MCP default is `sampling`) |
| `--api-key` | LLM API key (not required with `sampling`) |
| `--model` | Model name (e.g. `gpt-4o`, `claude-sonnet-4-20250514`, `openai/gpt-4o`) |
| `--base-url` | Custom endpoint (Ollama, local models — OpenAI adapter only) |
| `--tools` | JS/TS file exporting tool handlers (see [Functional Tools](#functional-tools)) |
| `--port` | Playground server port (default: `5174`) |

### Environment Variables

The CLI loads a `.env` file from the current directory automatically. No extra setup — just create the file.

```env
SLANG_ADAPTER=openrouter
OPENROUTER_API_KEY=sk-or-...
SLANG_MODEL=openai/gpt-4o
```

| Variable | Description |
|----------|-------------|
| `SLANG_ADAPTER` | `sampling` (default in MCP) \| `openai` \| `anthropic` \| `openrouter` \| `echo` |
| `SLANG_API_KEY` | API key (falls back to `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY`). Not needed with `sampling`. |
| `SLANG_MODEL` | Default model override |
| `SLANG_BASE_URL` | Custom base URL for OpenAI-compatible endpoints |

Real environment variables take precedence over `.env` values. `slang init` generates a `.env.example` template.

---

## Playground

SLANG ships a built-in web playground for writing, parsing, and running flows interactively in the browser.

```bash
slang playground              # Start on default port 5174
slang playground --port 3000  # Custom port
```

Features:
- **Editor** — write SLANG with real-time parsing and inline error display
- **Dependency graph** — SVG visualization with color-coded nodes (green = ready, amber = blocked, red = deadlocked)
- **AST viewer** — inspect the parsed syntax tree as JSON
- **Run panel** — execute flows with the echo adapter and see streaming events live
- **Examples** — dropdown with built-in sample flows (hello, review, research, broadcast, deadlock)
- **Error recovery** — uses `parseWithRecovery()` to show all errors at once, not just the first

The playground runs entirely in the browser (no API key needed) using the echo adapter.

---

## API

SLANG is also a TypeScript/JavaScript library:

```typescript
import { parse, runFlow, createOpenAIAdapter } from '@riktar/slang'

const source = `
  flow "hello" {
    agent Greeter {
      stake greet("world") -> @out
      commit
    }
    converge when: all_committed
  }
`

// Parse to AST
const ast = parse(source)

// Execute with an LLM
const state = await runFlow(source, {
  adapter: createOpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY }),
  onEvent: (event) => console.log(event),
})

console.log(state.status)   // "converged"
console.log(state.outputs)  // ["Hello, world! ..."]
```

### Adapters

```typescript
import {
  createOpenAIAdapter,       // OpenAI / Ollama / any OpenAI-compatible
  createAnthropicAdapter,    // Anthropic
  createOpenRouterAdapter,   // OpenRouter (300+ models, one API key)
  createSamplingAdapter,     // MCP host delegation (no API key)
  createEchoAdapter,         // Testing
  createRouterAdapter,       // Multi-provider routing
} from '@riktar/slang'

// OpenRouter — access any model with a single key
const openrouter = createOpenRouterAdapter({
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultModel: 'openai/gpt-4o',
})

// Router — different agents, different backends
const router = createRouterAdapter({
  routes: [
    { pattern: 'claude-*',  adapter: anthropicAdapter },
    { pattern: 'gpt-*',     adapter: openaiAdapter },
    { pattern: 'local/*',   adapter: ollamaAdapter },
  ],
  fallback: openrouter,  // fallback to OpenRouter
})
```

### Functional Tools

Make agent `tools:` declarations real — from the **CLI** or via **API**.

#### CLI: `--tools` flag

Create a JS/TS file that default-exports an object of tool handlers:

```javascript
// tools.js
export default {
  async web_search(args) {
    const res = await fetch(`https://api.search.com?q=${encodeURIComponent(args.query)}`);
    return await res.text();
  },
  async code_exec(args) {
    // run in a sandbox...
    return JSON.stringify({ status: "success", output: "..." });
  },
};
```

Then pass it to `slang run`:

```bash
slang run research.slang --adapter openrouter --tools tools.js
```

The CLI loads the file, logs the available tools, and passes them to the runtime. A ready-to-use example is in [`examples/tools.js`](examples/tools.js).

#### API: `tools` option

```typescript
const state = await runFlow(source, {
  adapter,
  tools: {
    web_search: async (args) => {
      return await fetchSearchResults(args.query as string)
    },
    code_exec: async (args) => {
      return runSandbox(args.code as string)
    },
  },
})
```

Only tools listed in the agent's `tools: [...]` declaration **and** provided in runtime options (or the `--tools` file) are available. The LLM invokes them via `TOOL_CALL: name(args)` in its response; the runtime executes the handler, feeds the result back, and the LLM continues.

### Checkpoint & Resume

Persist state after each round. Resume after crash:

```typescript
import { runFlow, serializeFlowState, deserializeFlowState } from '@riktar/slang'

// Run with checkpointing
const state = await runFlow(source, {
  adapter,
  checkpoint: async (snapshot) => {
    await writeFile('checkpoint.json', serializeFlowState(snapshot))
  },
})

// Resume later
const saved = deserializeFlowState(await readFile('checkpoint.json', 'utf8'))
const resumed = await runFlow(source, { adapter, resumeFrom: saved })
```

### Static Analysis

```typescript
import { parse, resolveDeps, detectDeadlocks, analyzeFlow } from '@riktar/slang'

const program = parse(source)
const flow = program.flows[0]
const graph = resolveDeps(flow)
const deadlocks = detectDeadlocks(graph)
const diagnostics = analyzeFlow(flow)
// diagnostics: missing converge, unknown recipients, uncommitted agents, etc.
```

### Error Handling

SLANG provides structured errors with error codes, human-friendly messages, and source context:

```typescript
import { parseWithRecovery, SlangError, SlangErrorCode, formatErrorMessage } from '@riktar/slang'

// Error recovery — collect all errors instead of failing on the first
const { program, errors } = parseWithRecovery(source)

for (const err of errors) {
  console.log(err.code)     // "P201"
  console.log(err.line)     // 3
  console.log(err.column)   // 5
  console.log(err.message)  // 'P201: Expected `{` but got `agent` (at 3:5)\n   3 | agent Writer\n       ^'
  console.log(err.toJSON()) // { code, message, line, column }
}

// Error codes follow a convention:
// L1xx — Lexer errors (bad characters, unterminated strings)
// P2xx — Parser errors (unexpected tokens, missing brackets)
// R3xx — Resolver errors (unknown agents, deadlocks)
// E4xx — Runtime errors (no flow, retries exhausted, budget exceeded)

// Format a message from a code
const msg = formatErrorMessage(SlangErrorCode.E406, { max: 3, agent: 'Writer', message: 'timeout' })
```

All runtime errors (`RuntimeError`) include line/column from the AST, so stack traces point to the exact `.slang` source location.

---

## MCP Server

SLANG ships a built-in [Model Context Protocol](https://modelcontextprotocol.io/) server. No API key needed — it delegates LLM calls back to the host via MCP sampling.

```bash
# Add to Claude Code
claude mcp add slang -- npx --package @riktar/slang slang-mcp
```

### Available Tools

| Tool | Description |
|------|-------------|
| `run_flow` | Execute a SLANG flow and return final state |
| `parse_flow` | Parse source to AST JSON |
| `check_flow` | Dependency graph + deadlock detection + diagnostics |
| `get_zero_setup_prompt` | Get the zero-setup system prompt |

### Claude Desktop Config

```json
{
  "mcpServers": {
    "slang": {
      "command": "npx",
      "args": ["--package", "@riktar/slang", "slang-mcp"]
    }
  }
}
```

---

## Why not just use an SDK?

| | SDK (LangChain, CrewAI, etc.) | SLANG |
|---|---|---|
| Time to first workflow | Hours (install, configure, learn API) | 60 seconds (paste and run) |
| Who can read it | Developers only | Anyone — including LLMs |
| Portability | Locked to one language/provider | Same file runs anywhere |
| Composability | Import code | Import workflows (`import "research" as r`) |
| The LLM can generate it | No (framework boilerplate is opaque) | Yes (text-to-SLANG, like text-to-SQL) |
| Runtime required | Always | Optional (zero-setup mode) |
| Documentation | Separate from code | The flow **is** the documentation |

SLANG doesn't replace SDKs any more than SQL replaced Java. It creates a new category: **declarative agent orchestration**. Use SLANG to describe *what* agents should do. Use an SDK when you need fine-grained control over *how*.

---

## Architecture

```
Source (.slang) → Lexer → Parser → AST → Resolver → DepGraph → Runtime → FlowState
                                    ↓
                              Error Recovery → ParseResult { program, errors[] }
```

| Component | Description |
|-----------|-------------|
| **Lexer** | Hand-written tokenizer with line/column tracking |
| **Parser** | Recursive-descent parser producing a fully typed AST; error recovery mode via `parseWithRecovery()` |
| **Error System** | Centralized error codes (L/P/R/E), human-friendly messages, source context with caret pointer |
| **Resolver** | Dependency graphs, deadlock detection, static analysis |
| **Runtime** | Async round-based scheduler with mailbox, parallel dispatch, checkpoint, tool execution |
| **Adapters** | Pluggable LLM backends (MCP Sampling, OpenAI, Anthropic, OpenRouter, Router, Echo) |
| **Playground** | React + Vite web app with editor, dependency graph visualization, AST viewer, and echo runner |

## CLI vs Zero-Setup: feature comparison

SLANG runs in two modes. Not all features are available in both.

| Feature | Zero-Setup (paste in LLM) | CLI / API / MCP |
|---------|:---:|:---:|
| Parse & execute flows | ✅ | ✅ |
| `stake`, `await`, `commit`, `escalate` | ✅ | ✅ |
| `role:` agent metadata | ✅ | ✅ |
| `when` / `if` conditionals | ✅ | ✅ |
| `converge` / `budget` | ✅ | ✅ |
| `@out`, `@all`, `@Human` | ✅ | ✅ |
| `import` composition | ✅ simulated | ✅ |
| `model:` multi-provider routing | ❌ single LLM | ✅ |
| `tools:` functional tool execution | ❌ simulated | ✅ (API or CLI `--tools`) |
| `retry:` with exponential backoff | ❌ | ✅ |
| `output:` structured output contracts | ✅ best-effort | ✅ enforced |
| Parallel agent execution | ❌ sequential | ✅ `Promise.all` |
| Checkpoint & resume | ❌ | ✅ |
| Static analysis & deadlock detection | ❌ | ✅ |
| Error codes & recovery mode | ❌ | ✅ |
| Web playground | ❌ | ✅ (`slang playground`) |
| Project scaffolding | ❌ | ✅ (`slang init`) |
| `.env` file support | ❌ | ✅ |
| OpenRouter / multi-provider | ❌ single LLM | ✅ |

**Zero-setup** is perfect for prototyping, demos, and non-developers. Move to the **CLI/API** when you need real tools, multi-model routing, parallel execution, or production reliability.

## Project Structure

```
src/
├── index.ts          # Public API exports
├── lexer.ts          # Tokenizer
├── parser.ts         # Recursive-descent parser (+ error recovery)
├── ast.ts            # AST type definitions
├── errors.ts         # Error codes, messages, and SlangError base class
├── resolver.ts       # Dependency graph & deadlock detection
├── runtime.ts        # Async execution engine
├── adapter.ts        # LLM adapters (MCP Sampling, OpenAI, Anthropic, OpenRouter, Echo, Router)
├── cli.ts            # CLI binary (init, run, parse, check, prompt, playground)
└── mcp.ts            # MCP server binary
playground/
├── src/              # React + Vite web playground (editor, graph, AST, runner)
├── vite.config.ts    # Vite config with @slang alias
└── package.json      # Playground dependencies
examples/
├── hello.slang       # Minimal hello world
├── article.slang     # Writer/Reviewer loop with conditionals
├── research.slang    # Competitive research with escalation
├── broadcast.slang   # Parallel broadcast and aggregation
├── code-review.slang # Code review with tools and structured output
├── composition.slang # Flow composition with import
└── tools.js          # Example tool handlers for CLI --tools flag
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
