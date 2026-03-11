# SLANG Language Playbook

> Complete syntax reference, formal grammar, and annotated examples for  
> **SLANG v0.3.1** — Super Language for Agent Negotiation & Governance.

---

## Table of Contents

1. [Quick Reference Card](#1-quick-reference-card)
2. [Lexical Elements](#2-lexical-elements)
3. [Program Structure](#3-program-structure)
4. [Agents](#4-agents)
5. [Primitives](#5-primitives)
   - [stake](#51-stake--produce--send)
   - [await](#52-await--receive--depend)
   - [commit](#53-commit--accept--terminate)
   - [escalate](#54-escalate--reject--delegate)
6. [Conditionals](#6-conditionals)
7. [Flow Constraints](#7-flow-constraints)
8. [Composition](#8-composition)
9. [Expressions & Data Model](#9-expressions--data-model)
10. [Execution Model](#10-execution-model)
11. [Formal Grammar (EBNF)](#11-formal-grammar-ebnf)
12. [Reserved Words](#12-reserved-words)

---

## 1. Quick Reference Card

```
flow "name" {
  agent Name {
    role: "description"           -- optional: natural language role
    model: "model-name"           -- optional: LLM model to use
    tools: [tool1, tool2]         -- optional: available tools
    retry: 3                      -- optional: max retry attempts on failure

    stake func(args) -> @Target   -- produce & send
      output: { key: "type" }     -- optional: structured output contract
    await binding <- @Source      -- wait for input
    commit [value] [if cond]      -- accept & stop
    escalate @Target [reason: ""] [if cond]  -- delegate upward

    when expr {                   -- conditional block
      ...operations...
    }
  }

  converge when: condition        -- when does the flow end?
  budget: tokens(N), rounds(N)   -- hard resource limits
}
```

### Special Recipients

| Recipient | Meaning |
|-----------|---------|
| `@AgentName` | Send to a specific agent |
| `@out` | Send to flow output (collected as final result) |
| `@all` | Broadcast to every other agent in the flow |
| `@Human` | Escalate to a human operator — halts the flow |
| `@any` | Accept from any single agent |
| `*` | Wildcard — accept from anyone (await only) |

### Agent State (accessible via dot notation)

| Expression | Type | Description |
|------------|------|-------------|
| `@Agent.output` | any | Last staked output from the agent |
| `@Agent.committed` | boolean | Whether the agent has committed |
| `@Agent.status` | string | `idle`, `running`, `committed`, `escalated`, `blocked` |

### Flow State (global)

| Expression | Type | Description |
|------------|------|-------------|
| `committed_count` | number | Number of agents that have committed |
| `all_committed` | boolean | True when every agent has committed |
| `round` | number | Current round number |
| `tokens_used` | number | Total tokens consumed (runtime only) |

---

## 2. Lexical Elements

### Whitespace & Comments

Whitespace (spaces, tabs, newlines) is insignificant except as token separator.
Comments start with `--` and extend to end of line:

```slang
-- This is a full-line comment
agent Researcher {  -- This is an inline comment
  stake gather() -> @out
}
```

### Identifiers

Identifiers name agents, variables, functions, and properties.
They start with a letter or underscore, followed by letters, digits, or underscores:

```
Researcher    my_agent    step2    _internal
```

### String Literals

Strings are enclosed in double quotes:

```
"hello world"    "AI agent frameworks 2026"    "SWOT"
```

### Number Literals

Numbers are integers or decimals, optionally negative:

```
42    3.14    0.8    -1    50000
```

### Boolean Literals

```
true    false
```

### Agent References

Agent references are identifiers prefixed with `@`:

```
@Researcher    @Human    @all    @any    @out
```

---

## 3. Program Structure

A SLANG program consists of one or more `flow` declarations:

```slang
flow "flow-name" {
  ...body...
}
```

A flow body may contain (in any order):
- `import` statements — include external flows
- `agent` declarations — define actors
- `converge` statement — define success condition
- `budget` statement — define resource limits

**Minimal valid program:**

```slang
flow "hello" {
  agent Greeter {
    stake greet("world") -> @out
    commit
  }
  converge when: all_committed
}
```

---

## 4. Agents

An agent is a named actor with a sequence of operations:

```slang
agent Name {
  ...metadata...
  ...operations...
}
```

### Metadata (all optional)

```slang
agent Researcher {
  role: "Expert web researcher focused on primary sources"
  model: "claude-sonnet"
  tools: [web_search, code_exec]

  stake gather(topic: "AI") -> @Analyst
}
```

| Meta | Syntax | Purpose |
|------|--------|---------|
| `role` | `role: "string"` | Natural language description — becomes part of the agent's system prompt |
| `model` | `model: "string"` | LLM model preference; the router adapter dispatches to the matching backend |
| `tools` | `tools: [id, ...]` | List of tools available to this agent || `retry` | `retry: N` | Max number of attempts when the LLM call fails (default: 1 = no retry) |
**`model` and multi-endpoint routing:**  
When using a router adapter, the `model` field determines which LLM backend handles this agent's calls. Different agents can use different providers and endpoints:

```slang
agent Researcher {
  model: "claude-sonnet"        -- routed to Anthropic
  stake gather(topic) -> @Analyst
}
agent Analyst {
  model: "gpt-4o"               -- routed to OpenAI
  await data <- @Researcher
  stake analyze(data) -> @out
  commit
}
```

---

## 5. Primitives

SLANG has exactly three primitives. Everything else is syntactic sugar.

### 5.1 `stake` — Produce & Send

```slang
stake <function>(<args...>) -> <recipients> [if <cond>]
  [output: { field: "type", ... }]
```

Executes a semantic function and delivers the result to one or more recipients.
The function name is a **semantic label** — it tells the LLM *what* to do, not a code reference.

The optional `output:` block declares a **structured output contract**. The runtime injects the schema into the LLM prompt, forcing the response to include a JSON object with the specified fields. Field types can be `"string"`, `"number"`, or `"boolean"`.

**Examples:**

```slang
-- Basic: single recipient
stake gather(topic: "AI trends") -> @Analyst

-- Multiple recipients
stake analyze(data) -> @Critic, @Logger

-- Broadcast to all agents
stake announce(result) -> @all

-- Output to flow (final result)
stake summarize(findings) -> @out

-- Positional and named arguments
stake validate(data, against: ["margin > 20%", "growth > 5%"]) -> @Analyst

-- With condition
stake retry(analysis) -> @Critic if feedback.rejected

-- With structured output contract
stake review(draft) -> @Decider
  output: { approved: "boolean", score: "number", notes: "string" }
```

### 5.2 `await` — Receive & Depend

```slang
await <binding> <- <sources> [(<options>)]
```

Blocks until the specified source(s) produce a `stake` directed at this agent.
Binds the received data to a variable for later use.

**Examples:**

```slang
-- Single source
await data <- @Researcher

-- Multiple sources (wait for all)
await data <- @Researcher, @Scraper

-- Any source
await input <- @any

-- Wildcard
await signal <- *

-- With count option (wait for N deliveries)
await results <- @Workers (count: 3)
```

### 5.3 `commit` — Accept & Terminate

```slang
commit [<value>] [if <condition>]
```

Declares that a result is accepted — this agent is done.
A committed agent executes no further operations.

**Examples:**

```slang
-- Unconditional commit
commit

-- Commit with value
commit result

-- Conditional commit
commit verdict if verdict.confidence > 0.8
```

### 5.4 `escalate` — Reject & Delegate

```slang
escalate @<target> [reason: "<string>"] [if <condition>]
```

Declares that this agent cannot resolve the task and delegates to another agent.
Escalating to `@Human` halts the entire flow.

**Examples:**

```slang
-- Escalate to another agent
escalate @Arbiter

-- With reason
escalate @Human reason: "Conflicting data, need human judgment"

-- Conditional
escalate @Human reason: "Low confidence" if verdict.confidence <= 0.5
```

---

## 6. Conditionals

### Inline `if`

Any `stake`, `commit`, or `escalate` can have a trailing `if` condition:

```slang
commit result    if result.score > 0.8
escalate @Human  if result.score <= 0.8
stake retry(x)   -> @Reviewer if feedback.rejected
```

### Block `when`

Groups multiple operations under a condition:

```slang
when feedback.approved {
  commit feedback
}
when feedback.rejected {
  stake revise(draft, feedback.notes) -> @Reviewer
}
```

`when` blocks are not exclusive — both can execute if both conditions are true.
Use mutually exclusive conditions (e.g. `.approved` / `.rejected`) for if/else semantics.

---

## 7. Flow Constraints

### `converge`

Defines when the flow terminates successfully:

```slang
converge when: committed_count >= 1
converge when: all_committed
converge when: @Analyst.committed && @Validator.committed
```

### `budget`

Hard limits on resource consumption. When exhausted, the flow terminates with `budget_exceeded`:

```slang
budget: tokens(50000)
budget: rounds(5)
budget: tokens(50000), rounds(5)
budget: time(60s)
budget: tokens(50000), rounds(5), time(120s)
```

| Constraint | Meaning |
|------------|---------|
| `tokens(N)` | Max total tokens consumed across all LLM calls |
| `rounds(N)` | Max number of execution rounds |
| `time(Ns)` | Max wall-clock time in seconds |

If no budget is specified, the runtime defaults to `rounds(10)`.

---

## 8. Composition

### `import`

Import another `.slang` file to use as a sub-flow:

```slang
flow "full-report" {
  import "research.slang" as research
  import "analysis.slang" as analysis

  agent Orchestrator {
    stake run(research, topic: "AI market") -> @Compiler
    stake run(analysis, data: @Researcher.output) -> @Compiler
  }

  agent Compiler {
    await results <- @Orchestrator (count: 2)
    stake compile(results) -> @out
    commit
  }

  converge when: all_committed
}
```

---

## 9. Expressions & Data Model

### Value Types

| Type | Examples | Notes |
|------|----------|-------|
| String | `"hello"`, `"multi word"` | Double-quoted |
| Number | `42`, `3.14`, `0.8` | Integer or decimal |
| Boolean | `true`, `false` | |
| List | `["a", "b"]`, `[web_search]` | Comma-separated, brackets |
| Identifier | `result`, `data` | Reference to a bound variable |
| Agent ref | `@Analyst`, `@Human` | Reference to an agent |

### Dot Access

Access properties on values or agent state:

```slang
result.confidence     -- property of a bound variable
feedback.approved     -- boolean property
@Analyst.output       -- agent's last staked output
@Analyst.committed    -- agent's committed status
```

### Binary Operators

| Operator | Meaning |
|----------|---------|
| `>` `>=` `<` `<=` | Numeric comparison |
| `==` `!=` | Equality |
| `&&` `\|\|` | Logical AND / OR |

### Function Arguments

```slang
stake gather("AI trends")                         -- positional
stake gather(topic: "AI trends")                   -- named
stake validate(data, against: ["rule1", "rule2"])   -- mixed
```

---

## 10. Execution Model

### Dependency Resolution

1. Parse all agents and their operations
2. Build a dependency graph from `stake -> @Target` and `await <- @Source`
3. Agents whose first operation is `stake` (no preceding `await`) → **ready**
4. Agents whose first operation is `await` → **blocked**
5. Execute ready agents, collect outputs, satisfy awaits, repeat

### Parallel Execution

Within each round, **independent agents execute in parallel**. Two agents are independent when their current operations don't have data dependencies on each other:

- All agents whose current operation is `stake` run concurrently via `Promise.all`
- `await`, `commit`, `escalate`, and `when` operations are executed sequentially (they are state-dependent)

This means a flow with three independent researchers will fire all three LLM calls simultaneously, not sequentially.

To disable parallelism (e.g. for debugging), pass `parallel: false` to `RuntimeOptions`.

### Multi-Endpoint Routing

The **router adapter** dispatches LLM calls to different backends based on the agent's `model` field:

```typescript
const router = createRouterAdapter({
  routes: [
    { pattern: "claude-*",  adapter: anthropicAdapter },
    { pattern: "gpt-*",     adapter: openaiAdapter },
    { pattern: "local/*",   adapter: ollamaAdapter },
  ],
  fallback: openRouterAdapter,  // OpenRouter as fallback for 300+ models
});
```

With this configuration, `model: "claude-sonnet"` routes to Anthropic, `model: "gpt-4o"` routes to OpenAI, `model: "local/llama3"` routes to a local Ollama instance, and unmatched models fall back to OpenRouter — all within the same flow.

Available adapters: MCP Sampling, OpenAI, Anthropic, OpenRouter, Echo, Router.

### Execution Modes

**Zero-Setup Mode**: An LLM reads the flow and executes it turn-by-turn in a single conversation, simulating each agent in sequence. No runtime needed.

**Thin Runtime Mode**: A scheduler program parses the flow, maintains state, and dispatches each agent as a separate LLM call. Supports real tools, parallel execution, and different models per agent.

### Termination

A flow terminates when:
1. The `converge` condition is met → `converged`
2. The `budget` is exhausted → `budget_exceeded`
3. An `escalate @Human` is reached → `escalated`
4. A deadlock is detected (no agent can proceed) → `deadlock`

### Round Model

A **round** is one full pass through all currently executable agents. Within a round, independent agents run in parallel. The `budget: rounds(N)` constraint limits how many full passes occur.

### Checkpoint & Resume

The runtime can **checkpoint** the `FlowState` after each round, enabling crash recovery and persistence:

```typescript
const state = await runFlow(source, {
  adapter,
  checkpoint: async (snapshot) => {
    await fs.writeFile('cp.json', serializeFlowState(snapshot));
  },
});
```

To resume a previously interrupted flow:

```typescript
const saved = deserializeFlowState(await fs.readFile('cp.json', 'utf8'));
const state = await runFlow(source, { adapter, resumeFrom: saved });
```

The `serializeFlowState` / `deserializeFlowState` helpers handle `Map` serialization. The runtime emits `checkpoint` events.

### Functional Tools

When an agent declares `tools: [web_search]` **and** the runtime provides matching tool handlers, the tools become functional:

```typescript
const state = await runFlow(source, {
  adapter,
  tools: {
    web_search: async (args) => {
      return await fetchResults(args.query as string);
    },
  },
});
```

During a `stake` operation, the LLM can invoke tools by including `TOOL_CALL: tool_name({"arg": "value"})` in its response. The runtime:

1. Detects the tool call pattern
2. Executes the matching handler
3. Appends the result to the conversation
4. Re-calls the LLM with the tool result
5. Repeats until no more tool calls (max 10 per stake)

Only tools declared in the agent's `tools:` metadata **and** provided in the runtime options are available. The runtime emits `tool_call` and `tool_result` events.

---

## 11. Formal Grammar (EBNF)

```ebnf
(* Whitespace and comments *)
WHITESPACE  = { " " | "\t" | "\r" | "\n" } ;
COMMENT     = "--" { ANY_CHAR - "\n" } "\n" ;

(* Identifiers and literals *)
IDENT       = LETTER { LETTER | DIGIT | "_" } ;
STRING      = '"' { ANY_CHAR - '"' } '"' ;
NUMBER      = [ "-" ] DIGIT { DIGIT } [ "." DIGIT { DIGIT } ] ;
BOOLEAN     = "true" | "false" ;
AGENT_REF   = "@" ( IDENT | "all" | "any" | "out" | "Human" ) ;

LETTER      = "a"-"z" | "A"-"Z" | "_" ;
DIGIT       = "0"-"9" ;
```

```ebnf
(* Top-level *)
program         = { flow_decl } ;

flow_decl       = "flow" STRING "{" flow_body "}" ;

flow_body       = { import_stmt | agent_decl | converge_stmt | budget_stmt } ;

(* Import *)
import_stmt     = "import" STRING "as" IDENT ;

(* Agent *)
agent_decl      = "agent" IDENT "{" agent_body "}" ;

agent_body      = { agent_meta | operation } ;

agent_meta      = role_decl | model_decl | tools_decl | retry_decl ;

role_decl       = "role" ":" STRING ;
model_decl      = "model" ":" STRING ;
tools_decl      = "tools" ":" list_literal ;
retry_decl      = "retry" ":" NUMBER ;

(* Operations *)
operation       = stake_op | await_op | commit_op | escalate_op | when_block ;

stake_op        = "stake" func_call "->" recipient_list [ condition ] [ output_schema ] ;

output_schema   = "output" ":" "{" output_field { "," output_field } "}" ;
output_field    = IDENT ":" STRING ;

await_op        = "await" IDENT "<-" source_list [ "(" await_opts ")" ] ;

commit_op       = "commit" [ expression ] [ condition ] ;

escalate_op     = "escalate" AGENT_REF [ "reason" ":" STRING ] [ condition ] ;

when_block      = "when" expression "{" { operation } "}" ;

(* Function calls *)
func_call       = IDENT "(" [ arg_list ] ")" ;

arg_list        = argument { "," argument } ;

argument        = [ IDENT ":" ] expression ;

(* Recipients and sources *)
recipient_list  = recipient { "," recipient } ;
recipient       = AGENT_REF ;

source_list     = source { "," source } ;
source          = AGENT_REF | "*" ;

await_opts      = await_opt { "," await_opt } ;
await_opt       = IDENT ":" expression ;

(* Conditions *)
condition       = "if" expression ;

(* Flow constraints *)
converge_stmt   = "converge" "when" ":" expression ;

budget_stmt     = "budget" ":" budget_item { "," budget_item } ;

budget_item     = ( "tokens" | "rounds" | "time" ) "(" expression ")" ;

(* Expressions *)
expression      = comparison ;

comparison      = access [ comp_op access ] ;

comp_op         = ">" | ">=" | "<" | "<=" | "==" | "!=" | "&&" | "||" ;

access          = primary { "." IDENT } ;

primary         = NUMBER
                | STRING
                | BOOLEAN
                | IDENT
                | AGENT_REF
                | list_literal
                | "(" expression ")"
                ;

list_literal    = "[" [ expression { "," expression } ] "]" ;
```

---

## 12. Reserved Words

```
flow, agent, stake, await, commit, escalate, import, as,
when, if, converge, budget, role, model, tools,
tokens, rounds, time, count, reason, retry, output,
true, false,
@out, @all, @any, @Human
```
