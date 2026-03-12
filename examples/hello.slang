-- Minimal hello world
-- The simplest possible SLANG flow: one agent, one output.
-- Run with: slang run hello.slang --adapter openrouter --api-key $OPENROUTER_API_KEY
-- Try without API key: slang run hello.slang  (uses echo adapter)
--
-- This flow has a single agent (Greeter) that produces one output
-- and immediately commits. The -> @out sends the result to the
-- flow's output channel.

flow "hello" {
  agent Greeter {
    stake greet("world") -> @out
    commit
  }
  converge when: all_committed
  budget: rounds(2)
}
