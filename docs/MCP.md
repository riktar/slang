# MCP Server

Built-in [Model Context Protocol](https://modelcontextprotocol.io/) server. No API key needed - delegates calls back to the host.

```bash
claude mcp add slang -- npx --package @riktar/slang slang-mcp
```

## Tools

| Tool | What it does |
|------|-------------|
| `run_flow` | Execute a SLANG flow and return final state |
| `parse_flow` | Parse source to AST JSON |
| `check_flow` | Dependency graph + deadlock detection + diagnostics |
| `get_zero_setup_prompt` | Get the zero-setup system prompt |

## Claude Desktop Configuration

Add this to your `claude_desktop_config.json`:

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

Then restart Claude Desktop.
