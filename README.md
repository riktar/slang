<h1 align="center">🗣️ SLANG</h1>

<p align="center">
  <strong>Super Language for Agent Negotiation & Governance</strong><br/>
  A minimal, LLM-native meta-language for orchestrating multi-agent workflows.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#why-slang">Why SLANG</a> •
  <a href="#language-overview">Language</a> •
  <a href="#examples">Examples</a> •
  <a href="#cli">CLI</a> •
  <a href="#api">API</a> •
  <a href="#mcp-server">MCP Server</a> •
  <a href="SPEC.md">Spec</a> •
  <a href="GRAMMAR.md">Grammar</a>
</p>

---

## Why SLANG?

Most agent frameworks require you to write glue code in Python or TypeScript. **SLANG is different** — it's a language that both humans and LLMs can read, write, and execute natively.

| Problem | SLANG Solution |
|---------|---------------|
| Agent workflows buried in code | Declarative `.slang` files — readable like pseudocode |
| LLMs can't understand framework boilerplate | Three primitives: `stake`, `await`, `commit` |
| Switching LLM providers = rewrite | Pluggable adapters (MCP Sampling, OpenAI, Anthropic, Ollama, any OpenAI-compatible) |
| No tooling? No execution. | **Zero-setup mode** — paste a prompt, any LLM becomes an interpreter |
| Hard to debug agent communication | Built-in dependency graph, deadlock detection, budget limits |

### Three primitives. That's the whole language.

```
stake   →  produce content and deliver it to an agent
await   →  block until another agent sends you data
commit  →  accept a final result and terminate
```

## Quick Start

### Install

```bash
npm install @riktar/slang
```

### Hello World

```
-- hello.slang
flow "hello" {
  agent Greeter {
    stake greet("world") -> @out
    commit
  }
  converge when: all_committed
}
```

```bash
npx slang run hello.slang --adapter openai --api-key $OPENAI_API_KEY
```

### Zero Setup (no install needed!)

Copy the [system prompt](ZERO_SETUP_PROMPT.md), paste it into ChatGPT / Claude / Gemini, then paste any `.slang` flow. The LLM interprets it natively — no runtime, no dependencies.

## Language Overview

SLANG builds on three operations applied to **agents** inside a **flow**:

```
flow "my-flow" {

  agent Writer {
    role: "Technical writer"
    model: "gpt-4o"

    stake write(topic: "AI agents") -> @Reviewer     -- produce & send
    await feedback <- @Reviewer                       -- wait for data

    when feedback.approved {
      commit feedback                                 -- done!
    }
    when feedback.rejected {
      stake revise(feedback) -> @Reviewer             -- try again
    }
  }

  agent Reviewer {
    role: "Senior editor"
    await draft <- @Writer
    stake review(draft) -> @Writer
  }

  converge when: committed_count >= 1
  budget: rounds(3)
}
```

### Key Features

- **Agents** with natural language `role:`, `model:` selection, `tools:` lists
- **Conditionals** — inline `if` on any operation; block `when expr { ... }`
- **Budget & convergence** — `budget: tokens(N), rounds(N), time(Ns)` + custom convergence conditions
- **Composition** — `import "other.slang" as alias` for reusable flows
- **Special recipients** — `@out` (flow output), `@all` (broadcast), `@Human` (human-in-the-loop)
- **State access** — `@Agent.output`, `@Agent.status`, `round`, `tokens_used`
- **Deadlock detection** — static analysis catches circular dependencies before execution

## Examples

### Writer/Reviewer Loop

```
flow "article" {
  agent Writer {
    role: "Technical writer specializing in clear, concise articles"
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
    await draft <- @Writer
    stake review(draft, criteria: ["clarity", "accuracy", "completeness"]) -> @Writer
  }

  converge when: committed_count >= 1
  budget: rounds(3)
}
```

### Competitive Research (3 agents)

```
flow "competitive-research" {
  agent Researcher {
    role: "Expert web researcher focused on primary sources and data"
    stake gather(competitors: ["OpenAI", "Anthropic", "Google DeepMind"],
                 focus: "AI agent frameworks 2026") -> @Analyst
  }

  agent Analyst {
    role: "Strategic analyst specializing in competitive positioning"
    await data <- @Researcher
    stake analyze(data, framework: "SWOT") -> @Critic
    await verdict <- @Critic

    commit verdict if verdict.confidence > 0.7
    escalate @Human reason: "Analysis confidence too low" if verdict.confidence <= 0.7
  }

  agent Critic {
    role: "Adversarial reviewer who challenges assumptions"
    await analysis <- @Analyst
    stake challenge(analysis, mode: "steelmanning") -> @Analyst
  }

  converge when: committed_count >= 1
  budget: tokens(40000), rounds(4)
}
```

## CLI

```bash
slang run <file.slang>       # Execute a flow
slang parse <file.slang>     # Dump AST (syntax validation)
slang check <file.slang>     # Dependency analysis + deadlock detection
slang prompt                 # Print the zero-setup system prompt
```

### Options

| Flag | Description |
|------|-------------|
| `--adapter` | `openai` \| `anthropic` \| `echo` (CLI only; MCP default is `sampling`) |
| `--api-key` | LLM API key (not required with `sampling`) |
| `--model` | Model name (e.g. `gpt-4o`, `claude-sonnet-4-20250514`) |
| `--base-url` | Custom endpoint (Ollama, local models) |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `SLANG_ADAPTER` | `sampling` (default in MCP) \| `openai` \| `anthropic` \| `echo` |
| `SLANG_API_KEY` | API key for `openai`/`anthropic` adapters (falls back to `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`). Not needed when using `sampling`. |
| `SLANG_MODEL` | Default model override |
| `SLANG_BASE_URL` | Custom base URL for OpenAI-compatible endpoints |

## API

SLANG is also a TypeScript/JavaScript library:

```typescript
import { parse, runFlow, createOpenAIAdapter } from '@riktar/slang'

// Parse a .slang file
const ast = parse(`
  flow "hello" {
    agent Greeter {
      stake greet("world") -> @out
      commit
    }
    converge when: all_committed
  }
`)

// Execute with an LLM adapter
const result = await runFlow(source, {
  adapter: createOpenAIAdapter({
    apiKey: process.env.OPENAI_API_KEY,
  }),
  onEvent: (event) => console.log(event),
})
```

### Static Analysis

```typescript
import { parse, resolveDeps, detectDeadlocks } from '@riktar/slang'

const program = parse(source)
const graph = resolveDeps(program.flows[0])
const deadlocks = detectDeadlocks(graph)

if (deadlocks.length > 0) {
  console.error('Deadlock detected:', deadlocks)
}
```

### Adapters

```typescript
import {
  createOpenAIAdapter,
  createAnthropicAdapter,
  createSamplingAdapter,
  createEchoAdapter,
} from '@riktar/slang'
import type { Server } from '@modelcontextprotocol/sdk/server/index.js'

// MCP Sampling — delegates to the host (Claude Code, Claude Desktop, etc.)
// No API key required: uses the subscription already active in the host.
const sampling = createSamplingAdapter(mcpServer as Server)

// OpenAI / OpenAI-compatible (Ollama, vLLM, etc.)
const openai = createOpenAIAdapter({
  apiKey: 'sk-...',
  defaultModel: 'gpt-4o',
  baseUrl: 'http://localhost:11434/v1', // optional: Ollama
})

// Anthropic
const anthropic = createAnthropicAdapter({
  apiKey: 'sk-ant-...',
  defaultModel: 'claude-sonnet-4-20250514',
})

// Echo (testing — returns the prompt as output)
const echo = createEchoAdapter()
```

## MCP Server

SLANG ships a built-in [Model Context Protocol](https://modelcontextprotocol.io/) server for tool-use integration:

```bash
# Add to Claude Code — no API key needed, uses your Claude subscription via MCP sampling
claude mcp add slang -- npx --package @riktar/slang slang-mcp

# Or run directly
npx --package @riktar/slang slang-mcp
```

### Available Tools

| Tool | Description |
|------|-------------|
| `run_flow` | Execute a SLANG flow, returns final state and outputs |
| `parse_flow` | Parse source to AST JSON |
| `check_flow` | Dependency graph analysis + deadlock detection |
| `get_zero_setup_prompt` | Get the zero-setup system prompt |

### Claude Desktop Config

```json
{
  "mcpServers": {
    "slang": {
      "command": "npx",
      "args": ["-y", "--package", "@riktar/slang", "slang-mcp"]
    }
  }
}
```

No API key needed — SLANG defaults to the `sampling` adapter and delegates LLM calls back to Claude through the MCP protocol. To use your own OpenAI/Anthropic key instead:

```json
{
  "mcpServers": {
    "slang": {
      "command": "npx",
      "args": ["-y", "--package", "@riktar/slang", "slang-mcp"],
      "env": {
        "SLANG_ADAPTER": "openai",
        "SLANG_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Architecture

```
Source (.slang) → Lexer → Parser → AST → Resolver → DepGraph → Runtime → FlowState
```

| Component | Description |
|-----------|-------------|
| **Lexer** | Hand-written tokenizer with line/column tracking |
| **Parser** | Recursive-descent parser producing a fully typed AST |
| **Resolver** | Builds dependency graphs, detects deadlocks via DFS |
| **Runtime** | Async round-based scheduler with mailbox communication |
| **Adapters** | Pluggable LLM backends (MCP Sampling, OpenAI, Anthropic, Echo) |

The runtime uses a **mailbox pattern** — agents communicate via `"Source->Target"` keyed messages. Each round, all executable (non-blocked) agents run in parallel, and convergence/budget conditions are checked.

## Project Structure

```
src/
├── index.ts          # Public API exports
├── lexer.ts          # Tokenizer
├── parser.ts         # Recursive-descent parser
├── ast.ts            # AST type definitions
├── resolver.ts       # Dependency graph & deadlock detection
├── runtime.ts        # Async execution engine
├── adapter.ts        # LLM adapters (MCP Sampling, OpenAI, Anthropic, Echo)
├── cli.ts            # CLI binary
└── mcp.ts            # MCP server binary
examples/
├── hello.slang       # Minimal hello world
├── article.slang     # Writer/Reviewer loop
└── research.slang    # 3-agent competitive research
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines. We welcome PRs for:

- New LLM adapters
- Language features
- Examples and documentation
- Bug fixes

## License

[MIT](LICENSE) © ArtiforgeAI
