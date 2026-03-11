-- Minimal hello world
-- The simplest possible SLANG flow: one agent, one output
-- Run with: slang run hello.slang --adapter openrouter --api-key $OPENROUTER_API_KEY

flow "hello" {
  agent Greeter {
    stake greet("world") -> @out
    commit
  }
  converge when: all_committed
}
