# SLANG — Installation Guide

SLANG ships as both a **CLI tool** and an **MCP server**, so it plugs into every major AI environment without friction. No code needed to get started — write your workflow, your LLM runs it.

---

## Quick install (npm)

```bash
npm install -g @riktar/slang
```

This installs two binaries:

| Binary | Purpose |
|--------|---------|
| `slang` | CLI: run, parse, check, prompt |
| `slang-mcp` | MCP server over stdio |

---

## Environment Variables

All adapters can be configured through environment variables instead of passing flags each time:

| Variable | Description |
|----------|-------------|
| `SLANG_ADAPTER` | `sampling` (default) \| `openai` \| `anthropic` \| `echo`. When running inside an MCP host (Claude Code, Claude Desktop) the default `sampling` delegates LLM calls to the host — no API key required. |
| `SLANG_API_KEY` | API key for `openai`/`anthropic` adapters (falls back to `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`). Not required for `sampling`. |
| `SLANG_MODEL` | Model override (e.g. `gpt-4o`, `claude-opus-4-5`) |
| `SLANG_BASE_URL` | Custom base URL for OpenAI-compatible endpoints |

---

## Claude Code

Add SLANG as an MCP server so Claude Code can run, parse, and check `.slang` files directly.

```bash
claude mcp add slang -- npx --package @riktar/slang slang-mcp
```

No API key needed — SLANG defaults to the `sampling` adapter, which delegates LLM calls back to Claude through the MCP protocol using your existing Claude subscription.

If you prefer to use a separate API key (e.g. to charge to a different account):

```bash
claude mcp add slang -- env SLANG_ADAPTER=anthropic SLANG_API_KEY=sk-ant-... npx --package @riktar/slang slang-mcp
```

Verify it's registered:

```bash
claude mcp list
```

Claude Code will now have four tools: `run_flow`, `parse_flow`, `check_flow`, `get_zero_setup_prompt`.

---

## Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or  
`%APPDATA%\Claude\claude_desktop_config.json` (Windows):

**Zero-key setup (recommended)** — uses your Claude subscription:

```json
{
  "mcpServers": {
    "slang": {
      "command": "slang-mcp"
    }
  }
}
```

SLANG defaults to the `sampling` adapter, which delegates all LLM calls back to Claude Desktop through the MCP protocol. No API key needed.

**With a separate Anthropic key:**

```json
{
  "mcpServers": {
    "slang": {
      "command": "slang-mcp",
      "env": {
        "SLANG_ADAPTER": "anthropic",
        "SLANG_API_KEY": "sk-ant-YOUR_KEY_HERE"
      }
    }
  }
}
```

**With an OpenAI key:**

```json
{
  "mcpServers": {
    "slang": {
      "command": "slang-mcp",
      "env": {
        "SLANG_ADAPTER": "openai",
        "SLANG_API_KEY": "sk-YOUR_OPENAI_KEY"
      }
    }
  }
}
```

---

## OpenAI Desktop (ChatGPT)

OpenAI Desktop supports MCP servers through its settings:

1. Open **ChatGPT → Settings → Connected apps → Add MCP server**
2. Fill in:
   - **Name**: `slang`
   - **Command**: `slang-mcp`
3. Click **Save** and reload the app.

SLANG will use the `sampling` adapter by default, which asks the ChatGPT host to run the LLM calls. If you want to force a specific model or use your own key, add environment variables:

```
SLANG_ADAPTER=openai
SLANG_API_KEY=sk-YOUR_KEY
```

---

## Any MCP-compatible host (generic config)

Any host that accepts the standard MCP JSON config block. Minimal config — no API key needed thanks to the `sampling` default:

```json
{
  "mcpServers": {
    "slang": {
      "command": "slang-mcp"
    }
  }
}
```

With an explicit adapter and key:

```json
{
  "mcpServers": {
    "slang": {
      "command": "slang-mcp",
      "args": [],
      "env": {
        "SLANG_ADAPTER": "openai",
        "SLANG_API_KEY": "sk-..."
      }
    }
  }
}
```

For hosts that require an absolute path (e.g. some Docker setups):

```json
{
  "command": "node",
  "args": ["/usr/local/lib/node_modules/@riktar/slang/dist/mcp.js"]
}
```

---

## Local / Ollama (zero-cost)

Point SLANG at a local OpenAI-compatible endpoint:

```json
{
  "mcpServers": {
    "slang": {
      "command": "slang-mcp",
      "env": {
        "SLANG_ADAPTER": "openai",
        "SLANG_API_KEY": "ollama",
        "SLANG_BASE_URL": "http://localhost:11434/v1",
        "SLANG_MODEL": "llama3.2"
      }
    }
  }
}
```

---

## Zero-setup (no runtime, any LLM)

No install required. Get the interpreter prompt and paste it into any LLM's system prompt:

```bash
slang prompt
```

Or via MCP:

```
Tool: get_zero_setup_prompt
```

Then paste the output as the **system prompt** in ChatGPT, Claude.ai, Gemini, etc. — the LLM becomes a SLANG interpreter and can execute any `.slang` flow pasted in the chat.

---

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `run_flow` | Execute a SLANG flow; returns final state, agent outputs, status |
| `parse_flow` | Parse source to AST JSON; validates syntax |
| `check_flow` | Dependency graph analysis + deadlock detection |
| `get_zero_setup_prompt` | Returns the zero-setup system prompt for paste-into-LLM use |

---

## CLI Reference

```bash
slang run <file.slang>        # execute a flow
slang parse <file.slang>      # dump AST as JSON
slang check <file.slang>      # dependency + deadlock report
slang prompt                  # print zero-setup system prompt

# Adapter flags
--adapter openai|anthropic|echo   # (MCP mode defaults to 'sampling')
--api-key sk-...                  # not required with MCP sampling
--model gpt-4o
--base-url http://localhost:11434/v1
```
