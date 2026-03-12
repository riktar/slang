-- Writer/Reviewer loop with structured output, retry, and model routing
-- Features: role, model, retry, output schema, when blocks, converge, budget
-- Run with: slang run article.slang --adapter openrouter --api-key $OPENROUTER_API_KEY

flow "article" {
  agent Writer {
    model: "inception/mercury-2"
    role: "Technical writer specializing in clear, concise articles"
    retry: 2

    stake write(topic: "Why multi-agent systems need a standard language") -> @Reviewer
    await feedback <- @Reviewer

    when feedback.approved {
      commit feedback
    } else {
      stake revise(feedback) -> @Reviewer
    }
  }

  agent Reviewer {
    role: "Senior editor focused on clarity, accuracy, and completeness"

    await draft <- @Writer
    stake review(draft, criteria: ["clarity", "accuracy", "completeness"]) -> @Writer
      output: { approved: "boolean", score: "number", notes: "string" }
    commit
  }

  converge when: all_committed
  budget: rounds(3)
}
