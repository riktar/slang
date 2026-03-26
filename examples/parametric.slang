-- Parametric flow: flows become reusable functions with typed parameters.
-- Parameters are declared after the flow name and injected into every agent.

flow "deep-analysis" (topic: "string", depth: "number", style: "string") {
  agent Researcher {
    role: "expert researcher"

    stake research(topic, depth: depth) -> @Writer
    commit
  }

  agent Writer {
    role: "technical writer"

    await findings <- @Researcher
    stake write(findings, style: style) -> @out
    commit
  }

  converge when: all_committed
  budget: tokens(200000), rounds(10)
}
