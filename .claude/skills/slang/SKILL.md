---
name: slang
description: "Write, review, debug, and explain SLANG flows. Use when creating multi-agent workflows, writing .slang files, designing agent orchestration, or when the user asks about SLANG syntax, primitives (stake/await/commit), flow structure, or agent coordination patterns."
argument-hint: "[task description or .slang file path]"
---

# SLANG — Super Language for Agent Negotiation & Governance

SLANG is a minimal, LLM-native meta-language for orchestrating multi-agent workflows.
It has exactly **3 primitives**: `stake`, `await`, `commit/escalate`. Everything else is syntactic sugar.

## Quick Reference

```slang
flow "name" {
  agent Name {
    role: "description"           -- optional
    model: "model-name"           -- optional
    tools: [tool1, tool2]         -- optional
    retry: 3                      -- optional

    let var = value               -- declare variable
    set var = value               -- update variable

    stake func(args) -> @Target   -- produce & send
    stake func(args)              -- local execution (no recipient)
    let var = stake func(args)    -- execute & store result
      output: { key: "type" }     -- optional structured output contract
    await binding <- @Source      -- wait for input
    commit [value] [if cond]      -- accept & stop
    escalate @Target [reason: ""] [if cond]  -- delegate upward

    when expr { ... } else { ... }  -- conditional
    repeat until expr { ... }       -- loop
  }

  converge when: condition        -- flow termination
  budget: tokens(N), rounds(N)   -- resource limits
  deliver: handler(args)         -- post-convergence side effect
  expect expr                    -- test assertion
}
```

## The 3 Primitives

### `stake` — Produce & Send
```slang
stake func(args) -> @Target           -- send output to agent
stake func(args) -> @Target, @Other   -- multiple recipients
stake func(args) -> @all              -- broadcast
stake func(args) -> @out              -- send to flow output
stake func(args)                      -- local (no send)
let result = stake func(args)         -- capture in variable
let result = stake func(args) -> @out -- capture AND send
  output: { field: "type" }           -- structured output contract
```

Function names are **semantic labels** (not code references). They tell the LLM what to do.
Arguments can be positional, named, or mixed: `stake func(data, format: "json")`.

### `await` — Receive & Depend
```slang
await data <- @Agent              -- from specific agent
await data <- @Agent1, @Agent2    -- from multiple (wait all)
await data <- @any                -- from any single agent
await data <- *                   -- wildcard (anyone)
await data <- @Workers (count: 3) -- wait for N deliveries
```

### `commit` / `escalate` — Accept or Reject
```slang
commit                            -- done (no value)
commit result                     -- done with value
commit result if result.score > 0.8  -- conditional
escalate @Arbiter                 -- delegate to agent
escalate @Human reason: "Need help"  -- halt flow, ask human
escalate @Human if confidence < 0.5  -- conditional
```

## Special Recipients & Sources

| Symbol | As Recipient (`->`) | As Source (`<-`) |
|--------|---------------------|------------------|
| `@AgentName` | Send to specific agent | Wait for specific agent |
| `@out` | Send to flow output | — |
| `@all` | Broadcast to all agents | — |
| `@Human` | — (use with `escalate`) | — |
| `@any` | — | Accept from any single agent |
| `*` | — | Wildcard, accept from anyone |

## Agent State & Flow State

```slang
-- Agent state (dot notation)
@Agent.output      -- last staked output
@Agent.committed   -- boolean
@Agent.status      -- idle | running | committed | escalated

-- Flow state (globals)
committed_count    -- number of committed agents
all_committed      -- true when all committed
round              -- current round number
tokens_used        -- total tokens consumed
```

## Control Flow

### Conditionals
```slang
when feedback.approved {
  commit feedback
} else {
  stake revise(feedback.notes) -> @Reviewer
}
-- "otherwise" is an alias for "else"
```

### Variables
```slang
let msg = "hello"                    -- declare
set msg = "updated"                  -- update
let data = stake research(topic)     -- execute LLM & store
set draft = stake revise(draft)      -- re-execute & update
```

### Loops
```slang
repeat until done {
  stake process(data) -> @Checker
  await result <- @Checker
  set done = result.approved
}
-- Safety limit: 100 iterations max
```

## Flow-Level Constructs

### Converge (when does the flow end?)
```slang
converge when: all_committed
converge when: committed_count >= 2
converge when: @Analyst.committed && @Validator.committed
```

### Budget (resource limits)
```slang
budget: tokens(50000)
budget: rounds(5)
budget: tokens(50000), rounds(5), time(60s)
-- Default if omitted: rounds(10)
```

### Deliver (post-convergence side effects)
```slang
deliver: save_file(path: "report.md", format: "markdown")
deliver: webhook(url: "https://hooks.example.com/done")
-- Only runs on successful convergence
```

### Import (composition)
```slang
import "research.slang" as research_flow
```

## Common Patterns

### 1. Simple Pipeline
```slang
flow "pipeline" {
  agent Researcher {
    stake gather(topic: "AI") -> @Writer
    commit
  }
  agent Writer {
    await data <- @Researcher
    stake write(data) -> @out
    commit
  }
  converge when: all_committed
}
```

### 2. Iterative Review Loop
```slang
flow "review" {
  agent Writer {
    let approved = false
    stake write(topic: "AI Safety") -> @Reviewer
    repeat until approved {
      await feedback <- @Reviewer
      when feedback.approved {
        set approved = true
        commit feedback
      } else {
        stake revise(feedback.notes) -> @Reviewer
      }
    }
  }
  agent Reviewer {
    let done = false
    repeat until done {
      await draft <- @Writer
      let result = stake review(draft, criteria: ["clarity"]) -> @Writer
        output: { approved: "boolean", notes: "string" }
      set done = result.approved
    }
    commit
  }
  converge when: all_committed
}
```

### 3. Parallel Fan-Out
```slang
flow "parallel-report" {
  agent Coordinator {
    stake assign(sections: ["market", "tech", "finance"]) -> @all
    await results <- *
    stake compile(results) -> @out
    commit
  }
  agent MarketAnalyst {
    await task <- @Coordinator
    stake research(task, focus: "market trends") -> @Coordinator
    commit
  }
  agent TechAnalyst {
    await task <- @Coordinator
    stake research(task, focus: "technology") -> @Coordinator
    commit
  }
  converge when: all_committed
}
```

### 4. Local Stake Chain (single agent, no messaging)
```slang
flow "local" {
  agent Writer {
    let research = stake gather(topic: "AI safety")
    let outline = stake plan(research)
    let article = stake write(outline, style: "engaging")
    stake publish(article) -> @out
    commit
  }
  converge when: all_committed
}
```

## Design Principles

1. **3 Primitives Only**: `stake`, `await`, `commit/escalate`. New constructs must be syntactic sugar over these.
2. **LLM-Native**: If an LLM cannot generate the syntax within 30 seconds, it's too complex.
3. **Minimalism**: Challenge every feature — can it be expressed with existing primitives?
4. **Portability**: Every feature must work in both zero-setup (LLM-only) and runtime modes.

## Writing Guidelines

When writing SLANG flows:
- Use descriptive agent names (`Researcher`, `Critic`, not `Agent1`)
- Use semantic function names that describe the action (`gather`, `analyze`, `review`)
- Always include `converge when:` — flows need a termination condition
- Add `budget:` for production flows to prevent runaway execution
- Use `role:` metadata to shape agent behavior
- Use `output:` contracts when downstream agents need structured data via dot access
- Prefer `let var = stake func()` for chaining LLM calls within one agent
- Use `repeat until` + `when/else` for review loops
- Comments use `--` (not `//` or `#`)

## Execution Modes

### 1. Runtime (production)
```bash
slang run flow.slang --adapter openrouter --api-key $API_KEY
slang run flow.slang --adapter openai --model gpt-4o
slang run flow.slang --adapter anthropic
slang run flow.slang --adapter echo  # debug mode
```

### 2. Zero-Setup (any LLM chat)
Paste the zero-setup prompt into any LLM's system prompt, then paste the `.slang` flow.
The LLM executes it step-by-step without any tooling.

### 3. MCP Server
```bash
claude mcp add slang -- npx --package @riktar/slang slang-mcp
```
Tools: `run_flow`, `parse_flow`, `check_flow`, `get_zero_setup_prompt`

## Additional Resources

- For the complete formal grammar (EBNF), see [grammar.md](./references/grammar.md)
- For annotated examples, see [examples.md](./references/examples.md)
- For the zero-setup LLM prompt, see [zero-setup.md](./references/zero-setup.md)
- Full specification: `SPEC.md` in the project root
- Full grammar playbook: `GRAMMAR.md` in the project root
