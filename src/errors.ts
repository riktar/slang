// ─── SLANG Error System ───
// Centralized error codes, human-friendly messages, and formatters.

// ─── Error Codes ───

export enum SlangErrorCode {
  // Lexer errors (L1xx)
  L100 = "L100", // Unterminated string
  L101 = "L101", // Unexpected character
  L102 = "L102", // Expected agent name after @

  // Parser errors (P2xx)
  P200 = "P200", // Unexpected token
  P201 = "P201", // Expected token
  P202 = "P202", // Expected expression
  P203 = "P203", // Expected operation
  P204 = "P204", // Expected flow body item
  P205 = "P205", // Expected budget kind
  P206 = "P206", // Expected agent name
  P207 = "P207", // Expected flow name
  P208 = "P208", // Unclosed block

  // Resolver errors (R3xx)
  R300 = "R300", // Unknown agent reference
  R301 = "R301", // Deadlock detected
  R302 = "R302", // No commit in agent
  R303 = "R303", // Orphan agent (produces but nobody consumes)
  R304 = "R304", // Missing converge
  R305 = "R305", // Missing budget

  // Runtime errors (E4xx)
  E400 = "E400", // No flow found
  E401 = "E401", // Adapter call failed
  E402 = "E402", // Budget exceeded
  E403 = "E403", // Deadlock at runtime
  E404 = "E404", // Tool handler not found
  E405 = "E405", // Tool execution error
  E406 = "E406", // Retries exhausted
}

// ─── Error Messages ───

const ERROR_MESSAGES: Record<SlangErrorCode, string> = {
  [SlangErrorCode.L100]: "Unterminated string literal — did you forget the closing `\"`?",
  [SlangErrorCode.L101]: "Unexpected character `{char}` — SLANG doesn't recognize this symbol",
  [SlangErrorCode.L102]: "Expected an agent name after `@` — e.g. `@Writer`, `@out`",

  [SlangErrorCode.P200]: "Unexpected {got} — expected {expected}",
  [SlangErrorCode.P201]: "Expected `{expected}` but got `{got}`",
  [SlangErrorCode.P202]: "Expected an expression (number, string, identifier, or `[`)",
  [SlangErrorCode.P203]: "Expected an operation: `stake`, `await`, `commit`, `escalate`, or `when`",
  [SlangErrorCode.P204]: "Expected `import`, `agent`, `converge`, or `budget` inside a flow body",
  [SlangErrorCode.P205]: "Expected `tokens`, `rounds`, or `time` in budget declaration",
  [SlangErrorCode.P206]: "Expected an agent name (identifier) after `agent`",
  [SlangErrorCode.P207]: "Expected a flow name (string) after `flow`",
  [SlangErrorCode.P208]: "Unclosed `{open}` block — expected `{close}` before end of file",

  [SlangErrorCode.R300]: "Agent `{agent}` references unknown agent `@{ref}` — make sure it is declared",
  [SlangErrorCode.R301]: "Deadlock detected: {cycle} — these agents are waiting on each other in a cycle",
  [SlangErrorCode.R302]: "Agent `{agent}` has no `commit` — it will never signal completion",
  [SlangErrorCode.R303]: "Agent `{agent}` produces output but no agent awaits from it",
  [SlangErrorCode.R304]: "Flow has no `converge` statement — will stop only when all agents commit or budget is exceeded",
  [SlangErrorCode.R305]: "Flow has no `budget` statement — default limits apply (10 rounds)",

  [SlangErrorCode.E400]: "No flow found in source — define at least one `flow \"name\" { ... }`",
  [SlangErrorCode.E401]: "LLM adapter call failed: {message}",
  [SlangErrorCode.E402]: "Budget exceeded at round {round} — increase `budget:` limits or simplify the flow",
  [SlangErrorCode.E403]: "Runtime deadlock: agents {agents} cannot make progress",
  [SlangErrorCode.E404]: "Tool `{tool}` was declared but no handler was provided in runtime options",
  [SlangErrorCode.E405]: "Tool `{tool}` execution failed: {message}",
  [SlangErrorCode.E406]: "All {max} retries exhausted for agent `{agent}`: {message}",
};

// ─── Formatting ───

export function formatErrorMessage(code: SlangErrorCode, params?: Record<string, string | number>): string {
  let msg = ERROR_MESSAGES[code] ?? `Unknown error (${code})`;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      msg = msg.replaceAll(`{${key}}`, String(value));
    }
  }
  return msg;
}

function formatLocation(line: number, column: number): string {
  return `${line}:${column}`;
}

function formatSourceLine(source: string | undefined, line: number, column: number): string {
  if (!source) return "";
  const lines = source.split("\n");
  const srcLine = lines[line - 1];
  if (!srcLine) return "";

  const lineNum = String(line).padStart(4);
  const pointer = " ".repeat(4 + 3 + column - 1) + "^";
  return `\n${lineNum} | ${srcLine}\n${pointer}`;
}

// ─── Base SLANG Error ───

export class SlangError extends Error {
  constructor(
    public code: SlangErrorCode,
    message: string,
    public line: number,
    public column: number,
    public source?: string,
  ) {
    const loc = formatLocation(line, column);
    const srcContext = formatSourceLine(source, line, column);
    super(`${code}: ${message} (at ${loc})${srcContext}`);
    this.name = "SlangError";
  }

  /** JSON-serializable representation for playground / API consumers */
  toJSON() {
    return {
      code: this.code,
      message: this.message,
      line: this.line,
      column: this.column,
    };
  }
}
