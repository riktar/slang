# CLI

Command-line interface for SLANG. Initialize projects, run flows, parse, and check for deadlocks.

```bash
slang init [dir]             # Scaffold a new project
slang run <file.slang>       # Execute a flow
slang parse <file.slang>     # Dump AST
slang check <file.slang>     # Dependency analysis + deadlock detection
slang prompt                 # Print the zero-setup system prompt
slang playground             # Launch the web playground
```

## Options

| Flag | Description |
|------|-------------|
| `--adapter` | `openai`, `anthropic`, `openrouter`, `echo` |
| `--api-key` | Your API key (or use `.env`) |
| `--model` | Override model (e.g. `gpt-4o`) |
| `--base-url` | Custom endpoint (Ollama, local models) |
| `--tools` | JS file with tool handlers (see [`examples/tools.js`](../examples/tools.js)) |
| `--deliverers` | JS file with deliver handlers (post-convergence side effects) |
| `--debug` | Show full round-by-round agent output (silent by default) |
| `--port` | Playground port (default `5174`) |

## Environment Variables

The CLI loads a `.env` file from the current directory automatically:

```env
SLANG_ADAPTER=openrouter
OPENROUTER_API_KEY=sk-or-...
SLANG_MODEL=openai/gpt-4o
```

`slang init` creates a `.env.example` template. System environment variables override `.env` if both exist.
