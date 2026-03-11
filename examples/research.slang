-- Competitive research with tools, retry, structured output, and escalation
-- Features: tools, retry, output schema, commit if, escalate if, model routing, budget
-- Run with: slang run research.slang --adapter openrouter --api-key $OPENROUTER_API_KEY

flow "competitive-research" {
  agent Researcher {
    role: "Expert web researcher focused on primary sources and data"
    model: "openai/gpt-4o"
    tools: [web_search]
    retry: 3

    stake gather(competitors: ["OpenAI", "Anthropic", "Google DeepMind"],
                 focus: "AI agent frameworks") -> @Analyst
  }

  agent Analyst {
    role: "Strategic analyst specializing in competitive positioning"
    model: "anthropic/claude-sonnet-4-20250514"
    await data <- @Researcher
    stake analyze(data, framework: "SWOT") -> @Critic
      output: { strengths: "string", weaknesses: "string", score: "number" }
    await verdict <- @Critic

    commit verdict if verdict.confidence > 0.7
    escalate @Human reason: "Analysis confidence too low, need human review" if verdict.confidence <= 0.7
  }

  agent Critic {
    role: "Adversarial reviewer who challenges assumptions"
    model: "google/gemini-2.5-pro"
    await analysis <- @Analyst
    stake challenge(analysis, mode: "steelmanning") -> @Analyst
  }

  converge when: committed_count >= 1
  budget: tokens(40000), rounds(4)
}
