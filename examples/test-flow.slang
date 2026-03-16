-- Test flow example: assertions with expect + contains
-- Run with: slang test examples/test-flow.slang

flow "greeting-test" {
  agent Greeter {
    role: "Friendly greeter"
    stake greet("world") -> @out
    commit
  }

  -- Assertions: evaluated after flow execution
  expect @Greeter.committed == true
  expect @Greeter.output contains "hello"

  converge when: all_committed
}
