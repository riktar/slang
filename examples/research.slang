-- SLANG Example: Competitive Research Flow
-- Run with: slang run examples/research.slang --adapter openai

flow "competitive-research" {

  agent Researcher {
    role: "Expert web researcher focused on primary sources and data"
    stake gather(competitors: ["OpenAI", "Anthropic", "Google DeepMind"], focus: "AI agent frameworks 2026") -> @Analyst
  }

  agent Analyst {
    role: "Strategic analyst specializing in competitive positioning"
    await data <- @Researcher
    stake analyze(data, framework: "SWOT") -> @Critic
    await verdict <- @Critic

    commit verdict if verdict.confidence > 0.7
    escalate @Human reason: "Analysis confidence too low, need human review" if verdict.confidence <= 0.7
  }

  agent Critic {
    role: "Adversarial reviewer who challenges assumptions"
    await analysis <- @Analyst
    stake challenge(analysis, mode: "steelmanning") -> @Analyst
  }

  converge when: committed_count >= 1
  budget: tokens(40000), rounds(4)
}
