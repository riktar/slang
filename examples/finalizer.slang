-- Finalizer Pattern: side effects after flow convergence
-- Uses deliver to save the final report and send a webhook notification

flow "report-with-delivery" {
  agent Researcher {
    role: "Web research specialist"
    tools: [web_search]
    stake gather(topic: "AI agent frameworks 2025") -> @Writer
  }

  agent Writer {
    role: "Technical writer"
    await data <- @Researcher
    stake write(data, style: "executive summary") -> @out
      output: { title: "string", body: "string" }
    commit
  }

  deliver: save_file(path: "report.md", format: "markdown")
  deliver: webhook(url: "https://hooks.example.com/reports")

  converge when: committed_count >= 1
  budget: rounds(3)
}
