# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] — Language Server Protocol & IDE Support

### Added

- **LSP Server** (`@riktar/slang-lsp`) — full Language Server Protocol implementation for `.slang` files
  - Real-time diagnostics from `parseWithRecovery()` + `analyzeFlow()` + `detectDeadlocks()`
  - **Autocompletion** — keywords, `@AgentRef` references, meta keys (`role:`, `model:`, `tools:`, etc.)
  - **Go-to-definition** — click on `@AgentName` to jump to the agent declaration
  - **Hover information** — keyword docs, agent metadata summary, special ref descriptions (`@out`, `@all`, `@Human`)
  - **Document symbols** — outline view with flows, agents, operations
  - Communicates via stdio — works with any LSP-compatible editor
- **VS Code Extension** (`vscode-slang`) — first-class IDE support
  - TextMate grammar for full syntax highlighting (keywords, primitives, agent refs, strings, operators)
  - Language configuration: bracket matching, auto-closing, comment toggling (`--`), folding
  - 18 snippets for common patterns: `flow`, `agent`, `stake/await/commit`, `when/else`, `repeat until`, `converge`, `budget`, `deliver`, `import`, and a full `flow-research` template
  - LSP client for real-time diagnostics, completions, hover, go-to-definition
- **Editor grammars** for Vim, Sublime Text, and JetBrains IDEs
  - **Vim/Neovim**: syntax file (`editors/vim/syntax/slang.vim`) + filetype detection (`editors/vim/ftdetect/slang.vim`)
  - **Sublime Text**: `.sublime-syntax` definition (`editors/sublime/slang.sublime-syntax`)
  - **JetBrains**: TextMate bundle ready for import (`editors/jetbrains/`)
- **IDE documentation** — new [IDE_SUPPORT.md](IDE_SUPPORT.md) with setup instructions for all editors
- Monorepo workspace support via npm workspaces (`packages/slang-lsp`, `packages/vscode-slang`)
- New build scripts: `build:lsp`, `build:vscode`, `build:all`

## [0.6.6]

### Added

- **Silent output by default** — round-by-round agent outputs are now hidden during flow execution. Only a progress indicator and the final result are shown.
- **`--debug` flag** — pass `--debug` to restore full verbose output (round headers, agent operations, LLM responses, tool calls).
- **Committed agent outputs in result** — the final result section now always displays each committed agent's output, so the flow content is always visible at the end.

## [0.6.5]

### Fixed

- **Deliver output resolution** — `deliver:` handlers now receive actual agent output instead of `undefined`. When no agent stakes to `@out`, the flow collects committed agents' outputs as the deliver payload (single agent → its output directly, multiple agents → a `{ AgentName: output }` map).
- **Deliver ident args resolve to agent output** — identifier arguments in `deliver: handler(AgentName)` now resolve to the named agent's committed output instead of passing the agent name as a plain string.

## [0.6.4]

### Fixed

- **CLI `--key=value` argument parsing** — flags like `--deliverers=tools.js` and `--tools=handlers.js` now work correctly. Previously only `--key value` (space-separated) was supported, causing `--key=value` to silently ignore the flag.
- **Deliver handlers always fire** — `deliver:` statements and `onConverge` now execute on any terminal flow status (`converged`, `budget_exceeded`, `deadlock`, `escalated`) instead of only on `converged`.

## [0.6.3]

### Fixed

- **Deliver handlers always fire** — `deliver:` statements and `onConverge` now execute on any terminal flow status (`converged`, `budget_exceeded`, `deadlock`, `escalated`) instead of only on `converged`. This ensures side effects are never silently skipped when a flow ends due to budget exhaustion or a deadlock.

## [0.6.2]

### Added

- **`--deliverers` CLI flag** — pass a JS/TS file with post-convergence deliver handlers via `slang run ... --deliverers deliverers.js` (same pattern as `--tools`)

### Fixed

- `evalConvergence` dummy `AgentState` was missing the `variables` field (TypeScript error)
- CLI version string was showing v0.5.0 instead of v0.6.0

## [0.6.1]

> Internal release — skipped in changelog.

## [0.6.0]

### Added

- **Variables & State** — `let` / `set` statements for agent-local variables
  - `let name = expression` — declare a new variable scoped to the agent
  - `set name = expression` — update an existing variable's value
  - Variables persist across rounds and are included in the agent's LLM prompt context
  - Variables are resolved before `await` bindings in expression evaluation
- **Conditionals: `else` / `otherwise`** — mutually exclusive branches for `when` blocks
  - `when expr { ... } else { ... }` — execute the else block when the condition is false
  - `otherwise` is an alias for `else`
  - Backward compatible: `when` blocks without `else` behave as before
- **Loops: `repeat until`** — explicit iteration
  - `repeat until condition { ...operations... }` — repeat the body until the condition is true
  - Safety limit of 100 iterations prevents infinite loops
- **Deliver: post-convergence side effects** — `deliver:` flow-level statement
  - `deliver: handler(args)` — declares a handler to execute after flow convergence
  - Multiple deliver statements execute in declaration order
  - Handlers provided via `RuntimeOptions.deliverers` (same pattern as `tools`)
  - Only runs on successful convergence — not on budget_exceeded, escalated, or deadlock
- **`onConverge` runtime hook** — `RuntimeOptions.onConverge` callback fires after all deliver handlers complete
- **`--deliverers` CLI flag** — pass a JS/TS file with deliver handlers via `slang run ... --deliverers deliverers.js`
- New AST node types: `LetOp`, `SetOp`, `RepeatBlock`, `ElseBlock`, `DeliverStmt`
- New tokens: `Let`, `Set`, `Else`, `Otherwise`, `Repeat`, `Until`, `Eq`, `Deliver`
- New runtime types: `DeliverHandler`, `RuntimeEvent` deliver/on_converge events
- New example: `examples/finalizer.slang` — Finalizer pattern with deliver
- 38 new tests (223 total)

## [0.5.0]

### Added

- **`slang init [dir]`** — scaffold a new SLANG project
  - Generates `hello.slang`, `research.slang`, `tools.js`, `.env.example`
  - Idempotent: skips files that already exist
  - Prints next-steps guide after scaffolding
- **`.env` support** — the CLI automatically loads a `.env` file from the current directory
  - Standard `KEY=VALUE` format with comments (`#`) and optional quotes
  - Real environment variables take precedence over `.env` values
  - Supported: `SLANG_ADAPTER`, `SLANG_API_KEY`, `SLANG_MODEL`, `SLANG_BASE_URL`, plus provider-specific keys
- CLI now reads `SLANG_ADAPTER`, `SLANG_MODEL`, and `SLANG_BASE_URL` from environment (not just `--flags`)
- 10 new CLI tests for init scaffolding and .env loading (185 total)

### Changed

- **Playground packaging** — only `playground/dist/` is included in the npm package (380 KB vs 145 MB)
  - CLI serves pre-built static files via `node:http` instead of spawning Vite
  - `build:playground` script added for pre-build step
- CLI version updated to 0.5.0

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
