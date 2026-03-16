-- Writer/Reviewer loop with structured output, retry, and model routing
-- Features: role, model, retry, output schema, when blocks, converge, budget
-- Run with: slang run article.slang --adapter openrouter --api-key $OPENROUTER_API_KEY

flow "article" {
  agent Writer {
    model: "inception/mercury-2"
    role: "Technical writer specializing in clear, concise articles"
    retry: 2

    let approved = false
    stake write(topic: "Why multi-agent systems need a standard language") -> @Reviewer
    repeat until approved {
      await feedback <- @Reviewer
      when feedback.approved {
        set approved = true
        commit feedback
      } else {
        stake revise(feedback) -> @Reviewer
      }
    }
  }

  agent Reviewer {
    role: "Senior editor focused on clarity, accuracy, and completeness"

    let done = false
    repeat until done {
      await draft <- @Writer
      let result = stake review(draft, criteria: ["clarity", "accuracy", "completeness"]) -> @Writer
        output: { approved: "boolean", score: "number", notes: "string" }
      set done = result.approved
    }
    commit
  }

  converge when: all_committed
  budget: rounds(5)
}
