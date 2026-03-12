-- Flow composition with import
-- Features: import ... as, count on await, orchestration of multiple sub-flows
-- Run with: slang run composition.slang --adapter openrouter --api-key $OPENROUTER_API_KEY
--
-- Import other .slang files as sub-flows and run them within
-- a parent flow. The Orchestrator launches two sub-flows,
-- and the Compiler awaits both results before producing output.

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
    commit
  }

  converge when: all_committed
  budget: rounds(5)
}
