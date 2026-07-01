-- Import example: compose flows by embedding sub-flows as agents.
-- The imported sub-flow runs to completion; its output is accessible
-- in the parent flow via `await data <- @alias`.

flow "full-report" {
  import "hello.slang" as greeting       -- runs sub-flow; alias acts as committed agent

  agent Editor {
    role: "senior editor"

    await greeting_text <- @greeting      -- receive sub-flow output
    stake edit(greeting_text, format: "markdown") -> @out
    commit
  }

  converge when: all_committed
  budget: tokens(300000), rounds(20)
}
