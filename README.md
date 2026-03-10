<h1 align="center">🗣️ SLANG</h1>

<p align="center">
  <strong>Super Language for Agent Negotiation & Governance</strong><br/>
  A minimal, LLM-native meta-language for orchestrating multi-agent workflows.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#why-slang">Why SLANG</a> •
  <a href="#exchange-algebra">Exchange Algebra</a> •
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

---

## Exchange Algebra

Every agent framework today thinks in pipelines: "do A, then B, then C." Even when they parallelize, the mental model is a directed graph — nodes and arrows.

**Exchange Algebra starts from a different observation**: if you look at what agents actually *do*, they only do three things:

1. Produce an output and direct it to someone → **`stake`**
2. Wait for input from someone → **`await`**
3. Decide whether the result is acceptable or another iteration is needed → **`commit | escalate`**

Everything else — pipelines, DAGs, loops, branching, error handling — is a combination of these three operations.

### Why `stake` and not `send`

The word `stake` is not accidental. It's not a simple "send message." It means **"I put forward a claim"** — like saying "I'd bet my life that...". This has a huge practical implication:

```
agent Analyst {
  stake find_trends(data) -> @Critic
}
```

The `Analyst` is not just sending data to the `Critic`. It is *declaring*: "I assert that these are the trends." This subtle semantic difference means:

- The output has an **owner** — the Analyst is accountable for it
- The output is **contestable** — the Critic can reject it
- The output has an **implicit cost** — tokens were spent to produce it

In a traditional framework, an agent produces output and that's it. There is no concept of ownership, contestability, or accountability. In SLANG, it's built into the language.

### Why `await` and not `receive`

`await` is not a simple "receive." It's a **dependency declaration**:

```
agent Critic {
  await claim <- @Analyst
  stake verify(claim, sources: 3) -> @Analyst
}
```

The `Critic` doesn't poll. It doesn't ask "is there something for me?". It *declares*: "I exist to receive claims from Analyst." This lets the runtime (or the LLM itself) to:

- Know **who depends on whom** without building an explicit DAG
- Know **what can run in parallel** — everything without pending `await`s
- **Detect deadlocks** — two agents waiting on each other with no pending `stake`

### Why `commit | escalate` is the Key Primitive

This is the primitive no other framework has:

```
commit verdict    if verdict.confidence > 0.8
escalate @Arbiter if verdict.confidence <= 0.8
```

**`commit`** means: "this result is acceptable, we stop here." It's a *local termination criterion* — each agent knows when it's done. No orchestrator needed to say "ok, enough."

**`escalate`** means: "I can't resolve this, someone else is needed." It's a *declarative fallback* — not error handling, not a try/catch. It's an explicit declaration that the local strategy has failed and a higher-level strategy is required.

This solves the biggest problem in multi-agent systems: **how do they stop?** Today the answer is: timers, `max_iterations`, or hope. With `commit`/`escalate`, termination is *emergent* — the system converges when enough agents have committed.

```
converge when: committed_count >= 1
budget: tokens(50k), rounds(5)
```

`converge` is the global safety net. `budget` is the hard constraint. But normal termination comes from local `commit`s.

### End-to-End Runtime Example

Here's how exchange algebra plays out in a real pricing strategy flow:

```
flow "pricing-strategy" {
  agent Researcher {
    stake gather(competitors: ["A", "B", "C"]) -> @Analyst
  }

  agent Analyst {
    await data <- @Researcher
    stake recommend(pricing_model, based_on: data) -> @Validator
    await feedback <- @Validator

    commit feedback   if feedback.approved
    escalate @Human   if feedback.rejected
  }

  agent Validator {
    await recommendation <- @Analyst
    stake validate(recommendation, against: [
      "margin > 20%",
      "market_share_impact > neutral"
    ]) -> @Analyst
  }

  converge when: committed_count >= 1
  budget: tokens(30k), rounds(3)
}
```

**What happens at runtime:**

1. The runtime reads the flow. Only `Researcher` has no pending `await` → it runs first.
2. `Researcher` stakes → output goes to `Analyst`. `Analyst`'s `await data <- @Researcher` is satisfied → it starts.
3. `Analyst` stakes a recommendation → goes to `Validator`. `Validator`'s `await` is satisfied → it starts.
4. `Validator` checks against explicit criteria. Stakes verdict back to `Analyst`.
5. `Analyst` receives feedback:
   - `feedback.approved` → **`commit`**. Flow terminates.
   - `feedback.rejected` → **`escalate @Human`**. A human must intervene.

> Nobody described a DAG. Nobody wrote `step_1 -> step_2 -> step_3`. Execution order *emerges* from `stake`/`await` dependencies. Add a fourth agent and you don't rewrite the flow — just declare what it produces and what it awaits.

### The Moat

The moat is not technical. Any framework can copy the syntax. The moat is **cognitive and network-based**, operating on three levels.

#### 1. LLM-Native Means Zero Tooling

SLANG doesn't need a separate runtime. An LLM can read, generate, and *execute* SLANG in the same conversation:

> "User: organize a research on X with three agents"
> "LLM: here's the SLANG flow → [generates it] → [executes it] → here's the result"

No other standard can do this. JSON Schema needs a parser. MCP needs a server. **SLANG is structured natural language — an LLM processes it natively. The runtime is the LLM itself.**

This means adoption at zero cost. Nothing to install, nothing to configure. Paste a SLANG flow in a chat and it works. The switching cost is zero to enter, but high to exit once you have a library of flows.

#### 2. Composability = Network Effect

```
flow "full-report" {
  import "pricing-strategy" as pricing
  import "competitor-analysis" as competitors
  import "market-sizing" as market

  agent Orchestrator {
    stake run(pricing)     -> @Compiler
    stake run(competitors) -> @Compiler
    stake run(market)      -> @Compiler
  }

  agent Compiler {
    await results <- @Orchestrator (count: 3)
    stake compile(results) -> @out
    commit
  }
}
```

SLANG flows are composable. Import one inside another. This creates a **network effect**: the more flows exist, the easier it is to build new ones, and the more expensive it is to migrate. Exactly like npm for JavaScript — the value is not in the package manager, it's in the catalog.

#### 3. The Language Is the Documentation

A SLANG flow is self-documenting. Read it out loud:

*"The Researcher stakes gather on competitors A, B, C and sends it to the Analyst. The Analyst awaits data from the Researcher, recommends a pricing model, and sends to the Validator. If the Validator approves, commit. If rejected, escalate to a Human."*

No comments needed. No documentation needed. No diagrams needed. **The code is the diagram.** This reduces onboarding cost to zero — anyone reading SLANG understands what the system does, including LLMs that have never seen it before.

### Traditional Frameworks vs. SLANG Exchange Algebra

| | Traditional Frameworks | SLANG Exchange Algebra |
|---|---|---|
| Mental model | Pipeline / DAG | Exchanges between agents |
| Execution order | Explicit (defined by human) | Emergent (from dependencies) |
| Termination | Timer / `max_iterations` | Local `commit` / `escalate` |
| Runtime required | Yes (SDK, server) | No — the LLM *is* the runtime |
| Composability | Limited | Native `import` / compose |
| Readability | Code or JSON | Structured natural language |

> **The moat**: zero adoption cost + network effect on flows + the LLM is the runtime. Anyone can copy the syntax. No one can copy a catalog of thousands of reusable flows.

---

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
