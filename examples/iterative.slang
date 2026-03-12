-- Iterative Review: demonstrates let/set, else, and repeat until
flow "iterative-review" {
  agent Writer {
    role: "Technical writer"
    let draft = "initial draft"
    stake write(topic: "AI Safety") -> @Reviewer
    await feedback <- @Reviewer
    when feedback.approved {
      commit feedback
    } else {
      set draft = feedback.notes
      stake revise(draft) -> @Reviewer
    }
  }

  agent Reviewer {
    role: "Senior editor"
    let reviewed = false
    repeat until reviewed {
      await draft <- @Writer
      stake review(draft, criteria: ["clarity", "accuracy"]) -> @Writer
        output: { approved: "boolean", notes: "string" }
      set reviewed = true
    }
    commit
  }

  converge when: committed_count >= 1
  budget: rounds(5)
}
