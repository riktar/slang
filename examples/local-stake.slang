-- Local stake: chain multiple LLM calls within one agent
-- Features: let = stake (local execution), variable chaining, no inter-agent messaging
-- Run with: slang run local-stake.slang --adapter openrouter --api-key $OPENROUTER_API_KEY
--
-- The Writer agent performs three LLM calls sequentially:
-- 1. Research a topic → store in variable
-- 2. Summarize the research → store in another variable
-- 3. Publish the final article to flow output
-- No second agent or await needed.

flow "local-stake" {
  agent Writer {
    role: "Technical writer who researches, summarizes, and publishes"

    let research = stake gather(topic: "AI safety in 2026")
    let outline = stake plan(research, structure: "intro, body, conclusion")
    let article = stake write(outline, style: "clear and engaging")
    stake publish(article) -> @out
    commit
  }

  converge when: all_committed
}
