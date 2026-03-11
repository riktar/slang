# SLANG — Super Language for Agent Negotiation & Governance

## Specification v0.3.0

---

## 1. Overview

SLANG is a minimal, LLM-native meta-language for orchestrating multi-agent workflows. It is designed to be:

- **Readable** by both humans and LLMs without tooling
- **Executable** by an LLM directly (zero-setup) or by a thin runtime (production)
- **Composable** — flows can import and nest other flows

SLANG has exactly **three primitives**: `stake`, `await`, `commit/escalate`.
Everything else is syntactic sugar over these three operations.

---

## 2. Core Concepts

### 2.1 Flow

A `flow` is the top-level unit. It defines a named, self-contained multi-agent workflow.

```slang
flow "name" {
  ...agents...
  ...constraints...
}
```

A flow contains:
- One or more `agent` declarations
- Optional `converge` condition
- Optional `budget` constraint
- Optional `import` statements

### 2.2 Agent

An `agent` is a named actor within a flow. Each agent has a sequence of operations.

```slang
agent Name {
  ...operations...
}
```

An agent can optionally have:
- A `role` descriptor (natural language string describing its purpose)
- A `model` preference (e.g., `model: "claude-sonnet"`)
- A `tools` list (e.g., `tools: [web_search, code_exec]`)
- A `retry` count (e.g., `retry: 3`) — max LLM call attempts on failure

```slang
agent Researcher {
  role: "Expert web researcher focused on primary sources"
  model: "claude-sonnet"
  tools: [web_search]
  retry: 3

  stake gather(topic) -> @Analyst
}
```

### 2.3 Primitives

#### `stake` — Produce & Send

```slang
stake <function>(<args...>) -> @<recipient>
  [output: { field: "type", ... }]
```

- Executes `function` with the given arguments
- Sends the result to `recipient`
- The function name is a **semantic label**, not a code reference — it tells the LLM *what* to do
- Arguments can be literals, references to previous data, or natural language descriptions
- The optional `output:` block declares a **structured output contract** — the runtime injects the schema into the LLM prompt, ensuring the response contains a JSON object with the specified fields

Multiple recipients:
```slang
stake analyze(data) -> @Critic, @Logger
```

Broadcast:
```slang
stake announce(result) -> @all
```

No recipient (output to flow):
```slang
stake summarize(findings) -> @out
```

#### `await` — Receive & Depend

```slang
await <binding> <- @<source>
```

- Blocks until `source` produces a `stake` directed at this agent
- Binds the received data to `binding` for use in subsequent operations

Multiple sources (wait for all):
```slang
await data <- @Researcher, @Scraper
```

Multiple sources with count:
```slang
await results <- @Workers (count: 3)
```

Any source:
```slang
await input <- @any
```

Wildcard (from anyone):
```slang
await signal <- *
```

#### `commit` — Accept & Terminate

```slang
commit <value>
```

- Declares that `value` is the accepted output of this agent
- Signals to the flow that this agent has converged
- A committed agent will not execute further operations

Conditional commit:
```slang
commit result if result.confidence > 0.8
```

#### `escalate` — Reject & Delegate

```slang
escalate @<target>
```

- Declares that this agent cannot resolve the current task
- Delegates to `target` (another agent or `@Human`)
- Passes all accumulated context to the target

Conditional escalate:
```slang
escalate @Arbiter if confidence < 0.5
```

With reason:
```slang
escalate @Human reason: "Conflicting data, need human judgment"
```

### 2.4 Conditionals

Inline conditionals using `if`:

```slang
commit result    if result.score > 0.8
escalate @Human  if result.score <= 0.8
```

Block conditionals using `when`:

```slang
when feedback.approved {
  commit feedback
}
when feedback.rejected {
  stake revise(draft, feedback.notes) -> @Validator
}
```

### 2.5 Flow-Level Constraints

#### `converge`

Defines when the flow terminates successfully:

```slang
converge when: committed_count >= 1
converge when: all_committed
converge when: @Analyst.committed && @Validator.committed
```

#### `budget`

Hard limits on resource consumption:

```slang
budget: tokens(50000)
budget: rounds(5)
budget: tokens(50000), rounds(5)
budget: time(60s)
```

When budget is exhausted, the flow terminates with a `budget_exceeded` status and returns whatever partial results exist.

### 2.6 Composition

#### `import`

Import another flow to use as a sub-flow:

```slang
flow "full-report" {
  import "research" as research_flow
  import "analysis" as analysis_flow

  agent Orchestrator {
    stake run(research_flow, topic: "AI market") -> @Compiler
    stake run(analysis_flow, data: @Researcher.output) -> @Compiler
  }

  agent Compiler {
    await results <- @Orchestrator (count: 2)
    stake compile(results) -> @out
    commit
  }
}
```

---

## 3. Data Model

### 3.1 Values

SLANG supports the following value types:

- **Strings**: `"hello"`, `"multi-word value"`
- **Numbers**: `42`, `3.14`, `0.8`
- **Booleans**: `true`, `false`
- **Lists**: `["a", "b", "c"]`, `[web_search, code_exec]`
- **Identifiers**: `result`, `feedback`, `data` — references to bound variables
- **Dot access**: `result.confidence`, `feedback.approved`
- **Agent references**: `@Analyst`, `@Human`, `@all`, `@any`, `@out`

### 3.2 Function Arguments

Function arguments are either positional or named:

```slang
stake gather("AI trends")                    -- positional
stake gather(topic: "AI trends")             -- named
stake validate(data, against: ["rule1"])      -- mixed
```

### 3.3 Agent State

Each agent has implicit state accessible via dot notation:

- `@Agent.output` — the last staked output
- `@Agent.committed` — boolean, whether the agent has committed
- `@Agent.status` — `idle | running | committed | escalated`

### 3.4 Flow State

The flow has implicit state:

- `committed_count` — number of agents that have committed
- `all_committed` — boolean, true when all agents have committed
- `round` — current round number
- `tokens_used` — total tokens consumed (runtime only)

---

## 4. Comments

Single-line comments use `--`:

```slang
-- This is a comment
agent Researcher {
  stake gather(data) -> @Analyst  -- inline comment
}
```

---

## 5. Execution Model

### 5.1 Dependency Resolution

The runtime (LLM or thin scheduler) resolves execution order as follows:

1. Parse all agents and their operations
2. Build a dependency graph from `stake -> @Target` and `await <- @Source`
3. Agents whose first operation is `stake` (no preceding `await`) are **ready**
4. Agents whose first operation is `await` are **blocked**
5. Execute ready agents, collect outputs, satisfy awaits, repeat

### 5.2 Parallel Execution

Within each round, **independent agents execute in parallel**. The runtime partitions executable agents into two groups:

1. **Parallelizable** — agents whose current operation is `stake`. These are dispatched concurrently via `Promise.all`, because they produce output via LLM calls and have no ordering dependency on each other.
2. **Sequential** — agents whose current operation is `await`, `commit`, `escalate`, or `when`. These modify shared state (mailbox, agent status) and are executed one at a time.

This means that if three agents all need to call an LLM at the same time, the three API calls happen concurrently, significantly reducing wall-clock time.

Parallel execution can be disabled by passing `parallel: false` in `RuntimeOptions` (useful for debugging or deterministic replay).

### 5.3 Multi-Endpoint Routing

The `model` field on an agent declaration is not just a hint — when using a **router adapter**, it determines which LLM backend handles that agent's calls. This enables flows where different agents run on different providers, endpoints, or even local models:

```slang
flow "hybrid-analysis" {
  agent Researcher {
    model: "gpt-4o"              -- routed to OpenAI
    stake gather(topic) -> @Analyst
  }
  agent Analyst {
    model: "claude-sonnet"        -- routed to Anthropic
    await data <- @Researcher
    stake analyze(data) -> @out
    commit
  }
  converge when: all_committed
}
```

The router adapter matches the `model` string against a list of pattern→adapter rules (first match wins). This is configured at the runtime level, not in the `.slang` file itself:

```typescript
const router = createRouterAdapter({
  routes: [
    { pattern: "claude-*", adapter: anthropicAdapter },
    { pattern: "gpt-*",    adapter: openaiAdapter },
    { pattern: "local/*",  adapter: ollamaAdapter },
  ],
  fallback: openaiAdapter,
});
```

### 5.4 Retry & Error Handling

When an agent declares `retry: N`, the runtime wraps each `stake` LLM call in a retry loop with exponential backoff:

- Attempt 1: immediate
- Attempt 2: after 1s
- Attempt 3: after 2s
- Attempt N: after min(2^(N-2)s, 8s)

If all attempts fail, the error propagates. The default is `retry: 1` (no retry).

The runtime emits `agent_retry` events so callers can monitor retry behavior.

### 5.5 Structured Output Contracts

The `output:` block on a `stake` operation declares the expected schema of the LLM response:

```slang
stake review(draft) -> @Decider
  output: { approved: "boolean", score: "number", notes: "string" }
```

The runtime injects a JSON schema requirement into the system prompt, asking the LLM to include a ```json block with the specified fields. The `resolveExprValue` engine then extracts JSON from the response using a multi-stage pipeline:

1. Try fenced ````json` block extraction
2. Try raw `JSON.parse` on the full response
3. Try extracting the first `{ ... }` block from the response
4. Fall back to regex patterns for well-known fields (`confidence`, `approved`, `rejected`, `score`)

This makes dot-access expressions like `result.approved` reliable even when the LLM wraps its JSON in prose.

### 5.6 Extended Static Analysis

The `analyzeFlow()` function performs extended static checks beyond deadlock detection:

| Check | Level | Description |
|-------|-------|-------------|
| Missing converge | warning | Flow has no converge statement |
| Missing budget | warning | Flow has no budget — default limits apply |
| Unknown recipient | error | `stake` directs to an agent not declared in the flow |
| Unknown source | error | `await` from an agent not declared in the flow |
| No commit | warning | Agent never commits — it will never signal completion |

The `check_flow` MCP tool now returns these diagnostics alongside deadlock analysis.

### 5.7 Checkpoint & Resume

The runtime supports **checkpointing** — persisting a snapshot of the `FlowState` after each round so that a flow can be resumed from that point if the process crashes or is interrupted.

#### Checkpoint Callback

Pass a `checkpoint` function in `RuntimeOptions`:

```typescript
const state = await runFlow(source, {
  adapter,
  checkpoint: async (snapshot) => {
    // snapshot is a deep clone of the FlowState at this point
    const json = serializeFlowState(snapshot);
    await fs.writeFile('checkpoint.json', json);
  },
});
```

The callback is invoked:
1. After each completed round (while the flow is still running)
2. After the flow terminates (final state)

#### Resume from Checkpoint

Pass a `resumeFrom` state to continue a previously interrupted flow:

```typescript
const saved = deserializeFlowState(
  await fs.readFile('checkpoint.json', 'utf8')
);
const state = await runFlow(source, {
  adapter,
  resumeFrom: saved,
});
```

The runtime skips agent initialization and continues from the stored `opIndex`, `bindings`, `mailbox`, and `round` values.

#### Serialization

`FlowState` contains `Map` objects which are not JSON-serializable. The runtime exports two helpers:

- `serializeFlowState(state: FlowState): string` — converts `Map` instances to a JSON-safe representation
- `deserializeFlowState(json: string): FlowState` — restores `Map` instances from JSON

The runtime emits `{ type: "checkpoint", round }` events when a checkpoint occurs.

### 5.8 Functional Tools

When an agent declares `tools: [web_search, code_exec]`, the runtime can make those tools **functional** — actually invoking real tool handlers during a `stake` operation.

#### Providing Tool Handlers

Pass a `tools` record in `RuntimeOptions`:

```typescript
const state = await runFlow(source, {
  adapter,
  tools: {
    web_search: async (args) => {
      const results = await search(args.query as string);
      return JSON.stringify(results);
    },
    code_exec: async (args) => {
      return eval(args.code as string);
    },
  },
});
```

Each handler receives a `Record<string, unknown>` of arguments and must return a `string` result.

#### How It Works

1. The runtime checks each agent's `tools:` declaration against the provided `RuntimeOptions.tools` record
2. Only tools that appear in **both** the agent declaration and the runtime options are made available
3. Available tool names are injected into the system prompt with a calling convention:
   ```
   TOOL_CALL: web_search({"query": "AI trends"})
   ```
4. After the LLM responds, the runtime scans for `TOOL_CALL:` patterns
5. If found, the matching handler is invoked, the result is appended to the conversation, and the LLM is called again
6. This loop continues until the LLM responds without a `TOOL_CALL` or until 10 tool calls are reached (safety limit)

The runtime emits two event types:
- `{ type: "tool_call", agent, tool, args }` — before executing a tool handler
- `{ type: "tool_result", agent, tool, result }` — after the handler returns

If `tools:` is declared in the `.slang` file but no matching handlers exist in `RuntimeOptions.tools`, the tools are silently ignored (backward compatible with v0.2).

### 5.9 Execution Modes

**Zero-Setup Mode**: An LLM reads the flow and executes it turn-by-turn in a single conversation, simulating each agent in sequence. The LLM maintains state as structured text.

**Thin Runtime Mode**: A scheduler program parses the flow, maintains state, and dispatches each agent as a separate LLM call. Supports real tools, parallel execution, and different models per agent.

### 5.10 Termination

A flow terminates when:
1. The `converge` condition is met (success)
2. The `budget` is exhausted (partial result)
3. An `escalate @Human` is reached (human-in-the-loop)
4. A deadlock is detected — no agent can proceed (error)

### 5.11 Round Model

A **round** is one full pass through all currently executable agents. The `budget: rounds(N)` constraint limits how many full passes occur. Within a round, independent agents run in parallel (see §5.2).

---

## 6. Reserved Words

```
flow, agent, stake, await, commit, escalate, import, as,
when, if, converge, budget, role, model, tools,
tokens, rounds, time, count, reason, retry, output,
true, false,
@out, @all, @any, @Human
```

---

## 7. File Extension

SLANG files use the `.slang` extension.

---

## 8. Examples

### Minimal Flow

```slang
flow "hello" {
  agent Greeter {
    stake greet("world") -> @out
    commit
  }
  converge when: all_committed
}
```

### Two-Agent Review

```slang
flow "review" {
  agent Writer {
    stake write(topic: "SLANG benefits") -> @Reviewer
    await feedback <- @Reviewer
    commit feedback if feedback.approved
    stake revise(feedback.notes) -> @Reviewer
  }

  agent Reviewer {
    await draft <- @Writer
    stake review(draft, criteria: ["clarity", "accuracy"]) -> @Writer
  }

  converge when: committed_count >= 1
  budget: rounds(3)
}
```

### Multi-Agent with Escalation

```slang
flow "research" {
  agent Researcher {
    role: "Web research specialist"
    tools: [web_search]
    stake gather(topic: "quantum computing 2026") -> @Analyst
  }

  agent Analyst {
    role: "Data analyst and strategist"
    await data <- @Researcher
    stake analyze(data, framework: "SWOT") -> @Critic
    await verdict <- @Critic
    commit verdict if verdict.confidence > 0.7
    escalate @Human reason: "Low confidence analysis" if verdict.confidence <= 0.7
  }

  agent Critic {
    role: "Adversarial reviewer"
    await analysis <- @Analyst
    stake challenge(analysis, mode: "steelmanning") -> @Analyst
  }

  converge when: committed_count >= 1
  budget: tokens(40000), rounds(4)
}
```
