<h1 align="center">🗣️ SLANG</h1>

<p align="center">
  <img src="slang.png" alt="SLANG" width="200"/>
</p>

<p align="center">
  <strong>The SQL of AI agents.</strong><br/>
  A declarative meta-language for orchestrating multi-agent workflows.<br/>
  Readable by humans. Executable by LLMs. Portable across models.
</p>

<p align="center">
  <a href="#two-ways-to-use-slang">How it works</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#why-slang">Why SLANG</a> •
  <a href="docs/IDE.md">IDE Support</a> •
  <a href="docs/PLAYGROUND.md">Playground</a> •
  <a href="docs/CLI.md">CLI</a> •
  <a href="docs/API.md">API</a> •
  <a href="docs/MCP.md">MCP</a> •
  <a href="SPEC.md">Spec</a> •
  <a href="GRAMMAR.md">Grammar</a>
</p>

---

## The entire language in 30 seconds.

```
flow "research" {
  agent Researcher {
    tools: [web_search]
    stake gather(topic: "quantum computing") -> @Analyst
  }
  agent Analyst {
    await data <- @Researcher
    stake analyze(data) -> @out
    commit
  }
  converge when: all_committed
}
```

That's it. Three primitives. You can read it, your PM can read it, your LLM can read it.

Everything else follows from these:

| Primitive | What it does |
|-----------|---------|
| `stake` | Produce content and send it to another agent (or execute locally) |
| `await` | Block until another agent sends you data |
| `commit` | Accept the result and stop |

Plus control flow: `when`/`else` conditionals, `let`/`set` variables, `repeat until` loops.

---

## Two ways to use SLANG

Here's the thing: the same `.slang` file runs two different ways. Paste it into ChatGPT? Works. CLI? Works. API? Works. You pick.

<table>
<tr>
<td width="50%" valign="top">

### 🧠 Zero-Setup Mode

No install, no API key, no runtime.

1. Copy the [system prompt](ZERO_SETUP_PROMPT.md)
2. Paste into ChatGPT, Claude, Gemini (pick any LLM)
3. Paste your `.slang` flow
4. Done

The LLM becomes your runtime. Great for prototyping, one-offs, or when you just want it to work without setup. No SDK can do this, because that's contradictory.

</td>
<td width="50%" valign="top">

### ⚡ CLI / API / MCP Mode

Full runtime. Real tools. 300+ models via OpenRouter. Parallel execution.

```bash
npm install -g @riktar/slang
slang init my-project && cd my-project
slang run hello.slang
```

Checkpoint and resume. Deadlock detection. Structured output. Everything you need for real workflows.

</td>
</tr>
</table>

| Feature | Zero-Setup | CLI / API / MCP |
|---------|:---:|:---:|
| Parse & execute flows | ✅ | ✅ |
| All primitives (`stake`, `await`, `commit`, `escalate`) | ✅ | ✅ |
| Conditionals (`when` / `if` / `else`) | ✅ | ✅ |
| Variables (`let` / `set`) | ✅ | ✅ |
| Loops (`repeat until`) | ✅ | ✅ |
| `deliver:` post-convergence hooks | ❌ | ✅ real handlers |
| `model:` multi-provider routing | ❌ single LLM | ✅ 300+ models |
| `tools:` functional execution | ❌ simulated | ✅ real handlers |
| Parallel agents | ❌ sequential | ✅ `Promise.all` |
| `retry:` with exponential backoff | ❌ | ✅ |
| `output:` structured contracts | ✅ best-effort | ✅ enforced |
| Checkpoint & resume | ❌ | ✅ |
| Static analysis & deadlock detection | ❌ | ✅ |
| IDE support (LSP, syntax highlighting) | ❌ | ✅ |
| Web playground | ❌ | ✅ |

Start with zero-setup to prototype. Move to CLI or API when you're ready to ship. Same file both ways.

---

## Quick Start

### 1. Install

```bash
npm install -g @riktar/slang
```

### 2. Scaffold a project

```bash
slang init my-project
cd my-project
```

This creates `hello.slang`, `research.slang`, `tools.js`, and `.env.example`. Everything you need.

### 3. Configure your API key

```bash
cp .env.example .env    # edit with your API key (SLANG loads it automatically)
```

### 4. Run your first flow

```bash
slang run hello.slang                        # echo adapter (no API key needed)
slang run hello.slang --adapter openrouter   # uses OPENROUTER_API_KEY from .env
```

### 5. Open the playground

```bash
slang playground
# Opens http://localhost:5174 - write, visualize, run flows in the browser
```

---

## Why SLANG?

### It's not a framework.

> SLANG is **Super Language for Agent Negotiation & Governance**

LangChain, CrewAI, AutoGen - they're SDKs. Python/TypeScript libraries. Classes, decorators, config files. SLANG isn't any of that.

**SLANG is a language.** Like SQL is a language for querying data, SLANG is a language for orchestrating agents.

| SQL | SLANG |
|-----|-------|
| Doesn't replace C/Java | Doesn't replace Python/TypeScript |
| Created a new category | New category: declarative |
| Readable by humans | Same - anyone reads it |
| Portable across DBs | Portable across LLMs |
| LLMs generate it | LLMs generate it |
| Not complete. That's the point | Not general-purpose. That's the point |

### Same flow, any model.

```
flow "hybrid-analysis" {
  agent Researcher {
    tools: [web_search]
    stake gather(topic: "quantum computing") -> @Analyst
    commit
  }
  agent Analyst {
    await data <- @Researcher
    stake analyze(data) -> @out
    commit
  }
  converge when: all_committed
}
```

You get 300+ models via [OpenRouter](https://openrouter.ai) with one API key. Different agents can use different providers in the same flow. Zero vendor lock-in. Switch by changing one line.

### Human-readable by design.

Read this flow out loud:

> *"The Researcher stakes gather on "quantum computer" topic and sends it to the Analyst. The Analyst awaits the data, analyzes it, and sends the output to the user. The flow stop when the Researcher and the Analyst have committed their job"*

No diagrams, no comments, no docs needed. The `.slang` file is the documentation.

### Who is SLANG for?

| Audience | Why |
|----------|-----|
| **PMs, analysts** | No code needed: just describe what agents should do. Paste into ChatGPT and it works. Zapier for AI. |
| **Developers prototyping** | 10 lines, 60 seconds, it runs. Your napkin sketch actually executes. |
| **Platform teams** | Portable workflow format. The Dockerfile of agent orchestration. Share files, use any backend. |

### SDK comparison

| | SDK (LangChain, CrewAI) | SLANG |
|---|---|---|
| Time to first workflow | Hours | 60 seconds |
| Who reads it | Developers only | Anyone, including LLMs |
| Portability | Locked to language/provider | Works everywhere |
| LLMs can generate it | No (boilerplate is messy) | Yes (text-to-SLANG like text-to-SQL) |
| Runtime needed | Yes | Optional (zero-setup mode) |
| Docs | Separate files | Built into the flow |

SLANG isn't trying to replace SDKs. Like SQL didn't replace Java. It's a different category: declarative orchestration.

---

## IDE Support

See [docs/IDE.md](docs/IDE.md) for VS Code, Neovim, Vim, Sublime, JetBrains, and other LSP-compatible editors.

---

## Playground

See [docs/PLAYGROUND.md](docs/PLAYGROUND.md) for web editor features and usage.

---

## CLI

See [docs/CLI.md](docs/CLI.md) for all commands, options, and environment variables.

---

## API

See [docs/API.md](docs/API.md) for programmatic usage, adapters, tools, and checkpointing.

---

## MCP Server

See [docs/MCP.md](docs/MCP.md) for Model Context Protocol integration with Claude Desktop.

---

## How it works

Your `.slang` file goes through these stages:

```
Source → Lexer → Parser → AST → Resolver → Graph → Runtime → Result
```

| Stage | What happens |
|-------|-------------|
| Lexer | Breaks source into tokens (with line/column info) |
| Parser | Recursive-descent, builds typed AST, recovers from errors |
| Resolver | Builds dependency graph, checks for deadlocks |
| Runtime | Schedules agents, mailbox, parallel dispatch, tools |
| Adapters | Connect to LLMs (OpenAI, Anthropic, OpenRouter, etc) |
| LSP | Language Server: diagnostics, completion, go-to-def, hover |
| Playground | Web editor (React + Vite) with visualization, tests |

## Examples

Examples are in the [`examples/`](examples/) folder. Each demonstrates different patterns and features:

```bash
slang run examples/hello.slang                                     # Minimal flow
slang run examples/research.slang --adapter openrouter --tools examples/tools.js
slang check examples/broadcast.slang                               # Dependency analysis
```

See each `.slang` file for inline documentation.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
