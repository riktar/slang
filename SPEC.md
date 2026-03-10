# SLANG — Super Language for Agent Negotiation & Governance

## Specification v0.1.0

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

```slang
agent Researcher {
  role: "Expert web researcher focused on primary sources"
  model: "claude-sonnet"
  tools: [web_search]

  stake gather(topic) -> @Analyst
}
```

### 2.3 Primitives

#### `stake` — Produce & Send

```slang
stake <function>(<args...>) -> @<recipient>
```

- Executes `function` with the given arguments
- Sends the result to `recipient`
- The function name is a **semantic label**, not a code reference — it tells the LLM *what* to do
- Arguments can be literals, references to previous data, or natural language descriptions

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

### 5.2 Execution Modes

**Zero-Setup Mode**: An LLM reads the flow and executes it turn-by-turn in a single conversation, simulating each agent in sequence. The LLM maintains state as structured text.

**Thin Runtime Mode**: A scheduler program parses the flow, maintains state, and dispatches each agent as a separate LLM call. Supports real tools, parallel execution, and different models per agent.

### 5.3 Termination

A flow terminates when:
1. The `converge` condition is met (success)
2. The `budget` is exhausted (partial result)
3. An `escalate @Human` is reached (human-in-the-loop)
4. A deadlock is detected — no agent can proceed (error)

### 5.4 Round Model

A **round** is one full pass through all currently executable agents. The `budget: rounds(N)` constraint limits how many full passes occur. Within a round, agents may execute in any order consistent with their dependencies.

---

## 6. Reserved Words

```
flow, agent, stake, await, commit, escalate, import, as,
when, if, converge, budget, role, model, tools,
tokens, rounds, time, count, reason,
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
