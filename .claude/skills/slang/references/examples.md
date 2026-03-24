# SLANG Examples

Annotated examples covering all major patterns.

---

## 1. Hello World — Minimal Flow

The simplest possible flow: one agent, one output.

```slang
flow "hello" {
  agent Greeter {
    stake greet("world") -> @out
    commit
  }
  converge when: all_committed
}
```

**Key points**: `stake` sends to `@out` (flow output). `commit` signals the agent is done. `converge when: all_committed` ends the flow when all agents commit.

---

## 2. Writer/Reviewer Loop — Iterative Refinement

A review loop using `repeat until`, `when/else`, `let/set`, and structured output.

```slang
flow "article" {
  agent Writer {
    model: "inception/mercury-2"
    role: "Technical writer specializing in clear, concise articles"
    retry: 2

    let approved = false
    stake write(topic: "Why multi-agent systems need a standard language") -> @Reviewer
    repeat until approved {
      await feedback <- @Reviewer
      when feedback.approved {
        set approved = true
        commit feedback
      } else {
        stake revise(feedback) -> @Reviewer
      }
    }
  }

  agent Reviewer {
    role: "Senior editor focused on clarity, accuracy, and completeness"

    let done = false
    repeat until done {
      await draft <- @Writer
      let result = stake review(draft, criteria: ["clarity", "accuracy", "completeness"]) -> @Writer
        output: { approved: "boolean", score: "number", notes: "string" }
      set done = result.approved
    }
    commit
  }

  converge when: all_committed
}
```

**Key points**: `output:` declares a structured JSON contract so `result.approved` and `result.notes` are reliable. `repeat until` loops until the condition is true. `when/else` branches on feedback.

---

## 3. Parallel Fan-Out — Broadcast & Collect

A coordinator broadcasts to multiple analysts, then collects all results.

```slang
flow "parallel-report" {
  agent Coordinator {
    role: "Project coordinator who distributes tasks and compiles results"
    stake assign(sections: ["market", "technology", "finance"]) -> @all
    await results <- *
    stake compile(results) -> @out
    commit
  }

  agent MarketAnalyst {
    role: "Market research specialist"
    await task <- @Coordinator
    stake research(task, focus: "market trends and sizing") -> @Coordinator
    commit
  }

  agent TechAnalyst {
    role: "Technology trend analyst"
    await task <- @Coordinator
    stake research(task, focus: "technology landscape and innovation") -> @Coordinator
    commit
  }

  agent FinanceAnalyst {
    role: "Financial analyst specializing in projections"
    await task <- @Coordinator
    stake research(task, focus: "financial projections and unit economics") -> @Coordinator
    commit
  }

  converge when: all_committed
}
```

**Key points**: `-> @all` broadcasts to every other agent. `await results <- *` collects from anyone. Independent agents run in parallel automatically.

---

## 4. Local Stake Chain — Single Agent Pipeline

Multiple LLM calls chained within one agent, no messaging needed.

```slang
flow "local-stake" {
  agent Writer {
    role: "Technical writer who researches, summarizes, and publishes"

    let research = stake gather(topic: "AI safety in 2026")
    let outline = stake plan(research, structure: "intro, body, conclusion")
    let article = stake write(outline, style: "clear and engaging")
    stake publish(article) -> @out
    commit
  }

  converge when: all_committed
}
```

**Key points**: `let var = stake func()` executes an LLM call and stores the result without sending it anywhere. Chain multiple local stakes for sequential processing.

---

## 5. Code Review with Tools

Agents use tools and structured output in a review loop.

```slang
flow "code-review" {
  agent Developer {
    role: "Senior software engineer"
    tools: [code_exec]
    retry: 2

    let approved = false
    stake implement(spec: "REST API endpoint for user registration",
                    language: "TypeScript") -> @Reviewer
      output: { code: "string", tests: "string", language: "string" }
    repeat until approved {
      await feedback <- @Reviewer
      when feedback.approved {
        set approved = true
        commit feedback
      } else {
        stake revise(feedback.notes, original: feedback) -> @Reviewer
          output: { code: "string", tests: "string", language: "string" }
      }
    }
  }

  agent Reviewer {
    role: "Staff engineer focused on security, performance, and best practices"
    tools: [code_exec]

    let done = false
    repeat until done {
      await code <- @Developer
      let result = stake review(code, checks: ["security", "performance", "error handling"]) -> @Developer
        output: { approved: "boolean", score: "number", notes: "string" }
      set done = result.approved
    }
    commit
  }

  converge when: all_committed
}
```

**Key points**: `tools: [code_exec]` makes tools available to the agent. Tool handlers are provided via CLI (`--tools tools.js`) or runtime options.

---

## 6. Finalizer Pattern — Post-Convergence Side Effects

Use `deliver:` for actions after the flow completes successfully.

```slang
flow "report-with-delivery" {
  agent Researcher {
    role: "Web research specialist"
    tools: [web_search]
    stake gather(topic: "AI agent frameworks 2025") -> @Writer
    commit
  }

  agent Writer {
    role: "Technical writer"
    await data <- @Researcher
    stake write(data, style: "executive summary") -> @out
      output: { title: "string", body: "string" }
    commit
  }

  deliver: save_file(path: "report.md", format: "markdown")
  deliver: webhook(url: "https://hooks.example.com/reports")

  converge when: all_committed
}
```

**Key points**: `deliver:` handlers run only on successful convergence. They receive the flow output and declared arguments.

---

## 7. Composition — Import Sub-Flows

Compose larger workflows from smaller `.slang` files.

```slang
flow "full-report" {
  import "research" as research_flow
  import "article" as article_flow

  agent Orchestrator {
    stake run(research_flow, topic: "AI agents market 2026") -> @Compiler
    stake run(article_flow, topic: "Executive summary") -> @Compiler
  }

  agent Compiler {
    await results <- @Orchestrator (count: 2)
    stake compile(results, format: "executive briefing") -> @out
  }

  converge when: all_committed
}
```

**Key points**: `import "file" as alias` brings in external flows. Use `await ... (count: N)` to wait for multiple deliveries from the same source.

---

## 8. Test Assertions

Use `expect` to write test assertions that are validated after execution.

```slang
flow "greeting-test" {
  agent Greeter {
    role: "Friendly greeter"
    stake greet("world") -> @out
    commit
  }

  expect @Greeter.committed == true
  expect @Greeter.output contains "hello"

  converge when: all_committed
}
```

Run tests with: `slang test examples/test-flow.slang`
