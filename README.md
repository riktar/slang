<h1 align="center">🗣️ SLANG</h1>

<p align="center">
  <strong>The SQL of AI agents.</strong><br/>
  A declarative meta-language for orchestrating multi-agent workflows.<br/>
  Readable by humans. Executable by LLMs. Portable across models.
</p>

<p align="center">
  <a href="#two-ways-to-use-slang">How it works</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#why-slang">Why SLANG</a> •
  <a href="#ide-support">IDE Support</a> •
  <a href="#playground">Playground</a> •
  <a href="#cli">CLI</a> •
  <a href="#api">API</a> •
  <a href="#mcp-server">MCP</a> •
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
| `stake` | Produce content and send it to another agent |
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

You get 300+ models via [OpenRouter](https://openrouter.ai) with one API key. Different agents can use different providers in the same flow. Zero vendor lock-in. Switch by changing one line.

### Human-readable by design.

Read this flow out loud:

> *"The Researcher stakes gather on the competitors and sends it to the Analyst. The Analyst awaits the data, analyzes it, and sends to the Critic. The Critic challenges the analysis and sends feedback back. If the confidence is high enough, commit. Otherwise, escalate to a Human."*

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

SLANG has first-class editor support. Syntax highlighting, real-time diagnostics, autocompletion, go-to-definition, hover docs.

### VS Code

Install the **SLANG** extension from the Marketplace, or from `.vsix`:

```bash
cd packages/vscode-slang
npm run build
npx vsce package
code --install-extension vscode-slang-0.7.0.vsix
```

You get:
- **Syntax highlighting** — keywords, primitives, `@AgentRef`, strings, operators, comments
- **Real-time diagnostics** — parse errors, unknown agent references, deadlock detection, missing converge/budget warnings
- **Autocompletion** — keywords, `@AgentName` refs, meta keys
- **Go-to-definition** — click `@AgentName` → jumps to agent declaration
- **Hover** — keyword docs, agent info summary
- **Document outline** — flows → agents → operations
- **18 snippets** — `flow`, `agent`, `stake`, `await`, `commit`, `when-else`, `repeat`, `budget`, `converge`, `deliver`, and more

### Any LSP-compatible editor (Neovim, Emacs, Helix, Zed, etc.)

The SLANG LSP server works with any editor that supports the Language Server Protocol:

```bash
npm install -g @riktar/slang-lsp
```

Then configure your editor to use `slang-lsp` as the language server for `.slang` files (stdio transport).

<details>
<summary>Neovim (nvim-lspconfig)</summary>

```lua
vim.api.nvim_create_autocmd("FileType", {
  pattern = "slang",
  callback = function()
    vim.lsp.start({
      name = "slang-lsp",
      cmd = { "slang-lsp" },
      root_dir = vim.fn.getcwd(),
    })
  end,
})
```

</details>

<details>
<summary>Helix (~/.config/helix/languages.toml)</summary>

```toml
[[language]]
name = "slang"
scope = "source.slang"
file-types = ["slang"]
language-servers = ["slang-lsp"]
comment-token = "--"

[language-server.slang-lsp]
command = "slang-lsp"
```

</details>

### Vim/Neovim (syntax only, no LSP)

Copy the syntax files from `editors/vim/`:

```bash
cp editors/vim/syntax/slang.vim ~/.vim/syntax/
cp editors/vim/ftdetect/slang.vim ~/.vim/ftdetect/
```

### Sublime Text

Copy the syntax file to your Sublime packages:

```bash
cp editors/sublime/slang.sublime-syntax ~/Library/Application\ Support/Sublime\ Text/Packages/User/
# Linux: ~/.config/sublime-text/Packages/User/
```

### JetBrains (IntelliJ, WebStorm, PyCharm, etc.)

1. Go to **Settings → Editor → TextMate Bundles**
2. Click **+** and select `editors/jetbrains/` from this repository
3. Restart the IDE

Full setup instructions: [IDE_SUPPORT.md](IDE_SUPPORT.md)

---

## Playground

Built-in web editor. No API key needed.

```bash
slang playground              # Opens http://localhost:5174
slang playground --port 3000  # custom port
```

- **Editor**: write and see parsing errors in real-time
- **Dependency graph**: visualize flow as SVG (green = ready, yellow = waiting, red = stuck)
- **AST viewer**: inspect the parsed syntax tree
- **Run panel**: execute flows with the echo adapter, watch live events
- **Examples**: built-in samples to learn from

---

## CLI

```bash
slang init [dir]             # Scaffold a new project
slang run <file.slang>       # Execute a flow
slang parse <file.slang>     # Dump AST
slang check <file.slang>     # Dependency analysis + deadlock detection
slang prompt                 # Print the zero-setup system prompt
slang playground             # Launch the web playground
```

### Options

| Flag | Description |
|------|-------------|
| `--adapter` | `openai`, `anthropic`, `openrouter`, `echo` |
| `--api-key` | Your API key (or use `.env`) |
| `--model` | Override model (e.g. `gpt-4o`) |
| `--base-url` | Custom endpoint (Ollama, local models) |
| `--tools` | JS file with tool handlers (see [`examples/tools.js`](examples/tools.js)) |
| `--deliverers` | JS file with deliver handlers (post-convergence side effects) |
| `--debug` | Show full round-by-round agent output (silent by default) |
| `--port` | Playground port (default `5174`) |

### `.env` support

The CLI loads a `.env` file from the current directory automatically:

```env
SLANG_ADAPTER=openrouter
OPENROUTER_API_KEY=sk-or-...
SLANG_MODEL=openai/gpt-4o
```

`slang init` creates a `.env.example` template. System environment variables override `.env` if both exist.

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

const ast = parse(source)

const state = await runFlow(source, {
  adapter: createOpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY }),
  onEvent: (event) => console.log(event),
})
```

### Adapters

```typescript
import {
  createOpenAIAdapter,       // OpenAI / Ollama / any OpenAI-compatible
  createAnthropicAdapter,    // Anthropic
  createOpenRouterAdapter,   // OpenRouter (300+ models, one API key)
  createSamplingAdapter,     // MCP host delegation (no API key)
  createEchoAdapter,         // Testing
  createRouterAdapter,       // Multi-provider: different agents → different backends
} from '@riktar/slang'
```

### Functional Tools

Turn agent `tools:` declarations into real handlers:

```javascript
// tools.js
export default {
  async web_search(args) {
    const res = await fetch(`https://api.search.com?q=${encodeURIComponent(args.query)}`);
    return await res.text();
  },
};
```

```bash
slang run research.slang --adapter openrouter --tools tools.js
```

Or via the API:

```typescript
const state = await runFlow(source, {
  adapter,
  tools: {
    web_search: async (args) => fetchSearchResults(args.query as string),
  },
})
```

See [`examples/tools.js`](examples/tools.js) for template code with `web_search` and `code_exec`.

### Checkpoint & Resume

```typescript
import { runFlow, serializeFlowState, deserializeFlowState } from '@riktar/slang'

const state = await runFlow(source, {
  adapter,
  checkpoint: async (snapshot) => {
    await writeFile('checkpoint.json', serializeFlowState(snapshot))
  },
})

// Later: resume from checkpoint
const saved = deserializeFlowState(await readFile('checkpoint.json', 'utf8'))
const resumed = await runFlow(source, { adapter, resumeFrom: saved })
```

### Deliver & onConverge

Execute side effects after convergence using `deliver:` in the `.slang` file and `deliverers` in runtime options:

```slang
flow "report" {
  agent Writer {
    stake write(topic: "AI") -> @out
    commit
  }
  deliver: save_file(path: "report.md")
  deliver: webhook(url: "https://hooks.example.com/done")
  converge when: all_committed
}
```

```typescript
const state = await runFlow(source, {
  adapter,
  deliverers: {
    save_file: async (output, args) => {
      await writeFile(args.path as string, String(output))
    },
    webhook: async (output, args) => {
      await fetch(args.url as string, { method: 'POST', body: JSON.stringify(output) })
    },
  },
  onConverge: async (finalState) => {
    console.log(`Converged in ${finalState.round} rounds`)
  },
})
```

See [`examples/finalizer.slang`](examples/finalizer.slang) for the Finalizer pattern.

CLI usage:

```bash
slang run report.slang --adapter openrouter --deliverers deliverers.js
```

The `deliverers.js` file follows the same pattern as `tools.js` — default-export an object where each key is a handler name and each value is `async (output, args) => void`:

```js
// deliverers.js
export default {
  async save_file(output, args) {
    await writeFile(args.path, String(output))
  },
  async webhook(output, args) {
    await fetch(args.url, { method: 'POST', body: JSON.stringify(output) })
  },
}
```

### Static Analysis & Error Handling

```typescript
import { parse, resolveDeps, detectDeadlocks, analyzeFlow, parseWithRecovery } from '@riktar/slang'

// Deadlock detection
const graph = resolveDeps(parse(source).flows[0])
const deadlocks = detectDeadlocks(graph)

// Collect all errors instead of failing on first
const { program, errors } = parseWithRecovery(source)
// errors[0].code → "P201", errors[0].line → 3, errors[0].toJSON() → { code, message, line, column }
```

Error codes follow a convention: L1xx (lexer), P2xx (parser), R3xx (resolver), E4xx (runtime). All errors include line/column and human-friendly messages with source context.

---

## MCP Server

Built-in [Model Context Protocol](https://modelcontextprotocol.io/) server. No API key needed - delegates calls back to the host.

```bash
claude mcp add slang -- npx --package @riktar/slang slang-mcp
```

| Tool | What it does |
|------|-------------|
| `run_flow` | Execute a SLANG flow and return final state |
| `parse_flow` | Parse source to AST JSON |
| `check_flow` | Dependency graph + deadlock detection + diagnostics |
| `get_zero_setup_prompt` | Get the zero-setup system prompt |

<details>
<summary>Claude Desktop config</summary>

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

</details>

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

Check out the [`examples/`](examples/) folder for runnable flows covering every feature:

| File | Pattern | Features |
|------|---------|----------|
| [`hello.slang`](examples/hello.slang) | Minimal output | Single agent, `stake → @out`, `commit` |
| [`article.slang`](examples/article.slang) | Writer/Reviewer loop | `role`, `model`, `retry`, `when` blocks, `output` schema |
| [`research.slang`](examples/research.slang) | Research with escalation | 3 providers, `tools`, `escalate @Human`, `if` conditions, `tokens` + `rounds` budget |
| [`broadcast.slang`](examples/broadcast.slang) | Parallel broadcast | `@all` broadcast, `*` wildcard source, coordinator pattern |
| [`code-review.slang`](examples/code-review.slang) | Code review | `tools: [code_exec]`, structured `output` on multiple stakes, review loop |
| [`composition.slang`](examples/composition.slang) | Flow composition | `import ... as`, `count:` on await, orchestration |
| [`iterative.slang`](examples/iterative.slang) | Iterative review | `let`/`set` variables, `when`/`else`, `repeat until` |
| [`finalizer.slang`](examples/finalizer.slang) | Finalizer pattern | `deliver:` post-convergence, side effects, webhooks |
| [`tools.js`](examples/tools.js) | Tool handlers | `web_search` and `code_exec` stubs for `--tools` flag |

```bash
slang run examples/hello.slang
slang run examples/research.slang --adapter openrouter --tools examples/tools.js
slang check examples/broadcast.slang
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
