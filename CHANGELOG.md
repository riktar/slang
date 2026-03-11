# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
