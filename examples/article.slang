-- SLANG Example: Writer/Reviewer Loop

flow "article" {

  agent Writer {
    role: "Technical writer specializing in clear, concise articles"
    stake write(topic: "Why multi-agent systems need a standard language") -> @Reviewer
    await feedback <- @Reviewer

    when feedback.approved {
      commit feedback
    }
    when feedback.rejected {
      stake revise(feedback) -> @Reviewer
    }
  }

  agent Reviewer {
    role: "Senior editor focused on clarity, accuracy, and completeness"
    await draft <- @Writer
    stake review(draft, criteria: ["clarity", "accuracy", "completeness"]) -> @Writer
  }

  converge when: committed_count >= 1
  budget: rounds(3)
}
