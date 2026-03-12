-- Parallel broadcast and multi-source aggregation
-- Features: @all broadcast, * wildcard source, 4 parallel agents, coordinator pattern
-- Run with: slang run broadcast.slang --adapter openrouter --api-key $OPENROUTER_API_KEY
--
-- The Coordinator sends a single message to ALL agents via @all,
-- then collects all responses with the * wildcard source.
-- All analysts run in parallel — the runtime dispatches them concurrently.

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
  }

  agent TechAnalyst {
    role: "Technology trend analyst"
    await task <- @Coordinator
    stake research(task, focus: "technology landscape and innovation") -> @Coordinator
  }

  agent FinanceAnalyst {
    role: "Financial analyst specializing in projections"
    await task <- @Coordinator
    stake research(task, focus: "financial projections and unit economics") -> @Coordinator
  }

  converge when: all_committed
  budget: rounds(3)
}
