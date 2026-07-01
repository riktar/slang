-- Time-boxed flow
-- Features: time budget syntax, rounds budget, explicit timeboxing
-- Run with: slang run time-budget.slang --adapter openrouter --api-key $OPENROUTER_API_KEY
--
-- This example intentionally uses `time(0)` so the flow deterministically
-- terminates with `budget_exceeded`, making the time-budget semantics easy
-- to verify even with the echo adapter.

flow "time-boxed-review" {
  agent Writer {
    stake draft(topic: "AI governance") -> @out
    commit
  }

  converge when: all_committed
  budget: rounds(50), time(0)
}
