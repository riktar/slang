# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0]

### Added

- **Error System** — centralized error codes, human-friendly messages, and source context
  - `SlangErrorCode` enum with documented codes: L1xx (lexer), P2xx (parser), R3xx (resolver), E4xx (runtime)
  - `formatErrorMessage(code, params?)` for template-based human-readable messages
  - `SlangError` base class with `code`, `line`, `column`, source context display (caret pointer), and `toJSON()` serialization
  - `LexerError`, `ParseError`, `RuntimeError` all extend `SlangError` with proper error codes and location tracking
- **Parser Error Recovery** — `parseWithRecovery(source)` returns `{ program, errors }` instead of throwing on first error
  - Collects all parse errors and returns partial AST for IDE/playground use
  - Synchronizes to next valid token after encountering an error
  - Original `parse()` still fails fast for CLI/production use
- **Runtime Error Improvements** — `RuntimeError` carries line/column from AST operation spans
  - "No flow found" → `RuntimeError(E400)` with location
  - "Retries exhausted" → `RuntimeError(E406)` with agent name, retry count, and source location
- **SLANG Playground** — interactive web playground for writing and testing SLANG flows
  - React 19 + Vite 6 + Tailwind CSS v4 webapp
  - Online editor with real-time parsing and error display
  - SVG dependency graph visualization with color-coded nodes (ready/blocked/deadlocked)
  - AST viewer with JSON tree
  - Live execution with echo adapter and streaming event display
  - Example flows dropdown (hello, review, research, broadcast, deadlock)
  - CLI: `slang playground [--port N]` — launches the dev server (default port 5174)
- New exports: `parseWithRecovery`, `ParseResult`, `SlangError`, `SlangErrorCode`, `formatErrorMessage`, `RuntimeError`
- 21 new tests for error system and parser recovery (175 total)

## [0.3.2]

### Added

- **CLI: `--tools` flag** — load tool handlers from an external JS/TS file
  - `slang run flow.slang --adapter openrouter --tools tools.js`
  - The file must default-export an object `{ name: asyncHandler }` — each handler is `(args) => Promise<string>`
  - Dynamic import via `pathToFileURL` for cross-platform compatibility
  - Loaded tools are logged at startup and passed to the runtime
- Example tool handlers file: `examples/tools.js` (stubs for `web_search` and `code_exec`)
- CLI displays `tool_call` and `tool_result` events during execution

## [0.3.1]

### Added

- **OpenRouter Adapter** — `createOpenRouterAdapter()` for access to 300+ models via [OpenRouter](https://openrouter.ai) with a single API key
  - Supports `siteUrl` and `appName` options for OpenRouter analytics
  - `OpenRouterAdapterConfig` type exported from public API
- CLI: `--adapter openrouter` option; falls back to `OPENROUTER_API_KEY` env var
- MCP server: `openrouter` adapter option in `run_flow` tool and `SLANG_ADAPTER` env var
- README: CLI vs Zero-Setup feature comparison table

## [0.3.0]

### Added

- **Checkpoint & Resume** — persist `FlowState` after each round for crash recovery
  - `checkpoint` callback in `RuntimeOptions` — called with a deep-cloned snapshot after each round and on termination
  - `resumeFrom` in `RuntimeOptions` — resume a flow from a previously saved state
  - `serializeFlowState()` / `deserializeFlowState()` helpers for JSON-safe `Map` serialization
  - New `checkpoint` runtime event
- **Functional Tools** — agent `tools:` declarations become executable
  - `tools` record in `RuntimeOptions` — user-provided tool handler functions
  - Tool call loop in `executeStake`: LLM requests a tool via `TOOL_CALL: name(args)`, runtime executes the handler, feeds result back, LLM continues
  - Only tools declared in agent meta **and** provided in runtime options are available (intersection)
  - Safety limit of 10 tool calls per stake operation
  - New `tool_call` and `tool_result` runtime events
- `ToolHandler` type exported from public API
- MCP server logs tool_call, tool_result, and checkpoint events
- CLI version updated to 0.3.0
- Zero-setup prompt rule 13 for tools

## [0.2.0]

### Added

- **Retry & Error Handling** — `retry: N` in agent metadata with exponential backoff
- **Structured Output Contracts** — `output: { field: "type" }` on stake operations
- **Extended Static Analysis** — `analyzeFlow()` checks for missing converge, budget, unknown recipients/sources, uncommitted agents
- `agent_retry` runtime event
- `FlowDiagnostic` type with `level` + `message`
- `check_flow` MCP tool now returns extended diagnostics

## [0.1.0] - 2025-01-01

### Added

- Initial release of SLANG — Super Language for Agent Negotiation & Governance
- Three core primitives: `stake`, `await`, `commit` / `escalate`
- Agents with `role:`, `model:`, and `tools:` metadata
- Inline and block conditionals (`if`, `when`)
- Flow-level `converge when:` and `budget:` constraints
- `import` for flow composition
- Special recipients: `@out`, `@all`, `@Human`
- Agent state access via dot notation (`@Agent.output`, `@Agent.committed`)
- Flow state variables: `committed_count`, `all_committed`, `round`, `tokens_used`
- CLI with `run`, `parse`, `check`, `prompt` subcommands
- LLM adapters: MCP Sampling (default in MCP mode), OpenAI, Anthropic, Echo (testing)
- Custom base URL support for Ollama and OpenAI-compatible endpoints
- MCP server (`slang-mcp`) with 4 tools: `run_flow`, `parse_flow`, `check_flow`, `get_zero_setup_prompt`
- Zero-setup mode — system prompt for paste-into-any-LLM interpretation
- Static deadlock detection via DFS on the dependency graph
- Public TypeScript/ESM + CJS library with full type definitions
- Example flows: hello world, writer/reviewer loop, competitive research
- Formal EBNF grammar (`GRAMMAR.md`)
- Language specification (`SPEC.md`)
