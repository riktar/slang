export const EXAMPLES: Record<string, { name: string; source: string }> = {
  hello: {
    name: "Hello World",
    source: `flow "hello" {
  agent Greeter {
    role: "Friendly greeter"
    stake greet("world") -> @out
    commit
  }
  converge when: all_committed
}`,
  },
  review: {
    name: "Writer / Reviewer",
    source: `flow "article" {
  agent Writer {
    role: "Technical writer"
    model: "gpt-4o"

    let approved = false
    stake write(topic: "AI Safety") -> @Reviewer
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
    role: "Senior editor"
    model: "claude-sonnet"

    let done = false
    repeat until done {
      await draft <- @Writer
      let result = stake review(draft, criteria: ["clarity", "accuracy"]) -> @Writer
        output: { approved: "boolean", score: "number" }
      set done = result.approved
    }
    commit
  }

  converge when: committed_count >= 1
  budget: rounds(5)
}`,
  },
  research: {
    name: "Research + Escalation",
    source: `flow "research" {
  agent Researcher {
    role: "Web researcher"
    tools: [web_search]
    stake gather(topic: "quantum computing") -> @Analyst
  }

  agent Analyst {
    role: "Data analyst"
    await data <- @Researcher
    stake analyze(data, framework: "SWOT") -> @Critic
    await verdict <- @Critic
    commit verdict if verdict.confidence > 0.7
    escalate @Human reason: "Low confidence" if verdict.confidence <= 0.7
  }

  agent Critic {
    role: "Adversarial reviewer"
    await analysis <- @Analyst
    stake challenge(analysis, mode: "steelmanning") -> @Analyst
  }

  converge when: committed_count >= 1
  budget: tokens(40000), rounds(4)
}`,
  },
  broadcast: {
    name: "Broadcast Pattern",
    source: `flow "broadcast" {
  agent Coordinator {
    role: "Task coordinator"
    stake distribute("analyze market trends") -> @all
    await results <- *
    stake aggregate(results) -> @out
    commit
  }

  agent Analyst1 {
    role: "Market analyst (US)"
    await task <- @Coordinator
    stake research(task, region: "US") -> @Coordinator
    commit
  }

  agent Analyst2 {
    role: "Market analyst (EU)"
    await task <- @Coordinator
    stake research(task, region: "EU") -> @Coordinator
    commit
  }

  converge when: all_committed
  budget: rounds(5)
}`,
  },
  deadlock: {
    name: "Deadlock Example",
    source: `-- This flow has a deadlock: A waits for B, B waits for A
flow "deadlock" {
  agent A {
    await x <- @B
    stake process(x) -> @out
    commit
  }

  agent B {
    await y <- @A
    stake process(y) -> @out
    commit
  }

  converge when: all_committed
}`,
  },
  variables: {
    name: "Variables & Loops",
    source: `flow "iterative-review" {
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
}`,
  },
};
