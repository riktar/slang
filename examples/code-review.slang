-- Code review with tools and structured output
-- Features: tools (code_exec), output on multiple stakes, when blocks, review loop
-- Run with: slang run code-review.slang --adapter openrouter --tools examples/tools.js

flow "code-review" {
  agent Developer {
    role: "Senior software engineer"
    tools: [code_exec]
    retry: 2

    stake implement(spec: "REST API endpoint for user registration",
                    language: "TypeScript") -> @Reviewer
      output: { code: "string", tests: "string", language: "string" }
    await feedback <- @Reviewer

    when feedback.approved {
      commit feedback
    } else {
      stake revise(feedback.notes, original: feedback) -> @Reviewer
        output: { code: "string", tests: "string", language: "string" }
    }
  }

  agent Reviewer {
    role: "Staff engineer focused on security, performance, and best practices"
    tools: [code_exec]

    await code <- @Developer
    stake review(code, checks: ["security", "performance", "error handling"]) -> @Developer
      output: { approved: "boolean", score: "number", notes: "string" }
    commit
  }

  converge when: all_committed
  budget: rounds(4)
}
