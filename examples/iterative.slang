-- Iterative Review: demonstrates let/set, else, and repeat until
flow "iterative-review" {
  agent Writer {
    role: "Technical writer"

    let approved = false
    stake write(topic: "AI Safety") -> @Reviewer
    repeat until approved {
      await feedback <- @Reviewer
      when feedback.approved {
        set approved = true
        commit feedback
      } else {
        stake revise(feedback.notes) -> @Reviewer
      }
    }
  }

  agent Reviewer {
    role: "Senior editor"

    let done = false
    repeat until done {
      await draft <- @Writer
      let result = stake review(draft, criteria: ["clarity", "accuracy"]) -> @Writer
        output: { approved: "boolean", notes: "string" }
      set done = result.approved
    }
    commit
  }

  converge when: committed_count >= 1
  budget: rounds(5)
}
