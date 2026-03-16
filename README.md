<h1 align="center">🗣️ SLANG</h1>

<p align="center">
  <img src="slang.png" alt="SLANG" width="200"/>
</p>

<p align="center">
  <strong>Your AI workflow in a format anyone on the team can read, edit, and validate.</strong><br/>
  Write the workflow in SLANG, your favorite LLM runs it. No code needed.<br/>
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

That's it. Three primitives. Your PM can read it. Your analyst can edit it. Your LLM can run it. No Python, no TypeScript — just intent.

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

The LLM becomes your runtime. Perfect for non-developers, quick prototyping, or when you just want it to work — no install, no code, no friction.

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

### It's not a framework. It's a shared language for your team.

> SLANG is **Super Language for Agent Negotiation & Governance**

LangChain, CrewAI, AutoGen — they're SDKs. Python/TypeScript libraries. Only developers can use them. Everyone else has to wait, ask, or guess what the workflow actually does.

**SLANG is a language anyone can read and write.** Your PM defines the workflow. Your analyst tweaks the logic. Your developer hooks it up to real tools. Everyone works on the same `.slang` file.

| SQL | SLANG |
|-----|-------|
| Doesn't replace C/Java | Doesn't replace Python/TypeScript |
| Non-devs write queries | Non-devs write workflows |
| Readable by the whole team | Same — anyone reads and edits it |
| LLMs generate it | LLMs generate it |
| Not complete. That's the point | Not general-purpose. That's the point |

### No code needed.

Describe what your agents should do. SLANG reads like plain English:

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

Paste it into ChatGPT and it runs. Use the CLI for production with 300+ models via [OpenRouter](https://openrouter.ai). Same file, zero vendor lock-in.

### The `.slang` file is the documentation.

Read this flow out loud:

> *"The Researcher stakes gather on "quantum computer" topic and sends it to the Analyst. The Analyst awaits the data, analyzes it, and sends the output to the user. The flow stop when the Researcher and the Analyst have committed their job"*

No diagrams, no comments, no docs needed. Show the `.slang` file in a meeting and everyone understands what the AI workflow does.

### Who is SLANG for?

| Audience | Why |
|----------|-----|
| **PMs & business people** | Write AI workflows without code. Describe what agents should do, paste into ChatGPT, and it runs. Your automation, your way. |
| **Analysts & ops** | Edit and validate workflows yourself. No waiting for engineering. Review the logic, tweak parameters, run it. |
| **Developers** | 10 lines, 60 seconds, it runs. Skip the boilerplate, hook up real tools when you need them. |
| **Teams** | One `.slang` file everyone can read. The PM writes it, the dev ships it, the analyst audits it. Same source of truth. |

### SDK comparison

| | SDK (LangChain, CrewAI) | SLANG |
|---|---|---|
| Who can use it | Developers only | Anyone on the team |
| Time to first workflow | Hours | 60 seconds |
| Who reads / reviews it | Developers only | PMs, analysts, developers, LLMs |
| LLMs can generate it | No (boilerplate is messy) | Yes (text-to-SLANG like text-to-SQL) |
| Runtime needed | Yes, always | Optional — paste into ChatGPT and it works |
| Docs | Separate files | The `.slang` file is the documentation |

SLANG isn't trying to replace SDKs. Like SQL didn't replace Java. It's a different category: workflows that everyone on the team can own.

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
