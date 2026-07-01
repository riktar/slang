-- Flow composition with import and wait-all fan-in
-- Features: import ... as, multi-source await, orchestration of reusable sub-flows
-- Run with: slang run composition.slang --adapter openrouter --api-key $OPENROUTER_API_KEY
--
-- Import other .slang files as sub-flows and use their aliased outputs
-- as inputs to a parent flow. This example reuses existing example
-- flows and waits for both imported results before producing output.

flow "composed-report" {
  import "hello.slang" as greeting
  import "local-stake.slang" as article

  agent Compiler {
    await parts <- @greeting, @article
    stake compile(parts, format: "executive briefing") -> @out
    commit
  }

  converge when: all_committed
  budget: rounds(20), time(60s)
}
