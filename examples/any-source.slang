-- Any-source routing
-- Features: @any await, parallel producers, first-available selection
-- Run with: slang run any-source.slang --adapter openrouter --api-key $OPENROUTER_API_KEY
--
-- The Picker waits for the first available delivery from any producer.
-- Which proposal wins is intentionally nondeterministic when producers run in parallel.

flow "any-source" {
  agent Alpha {
    role: "Proposal author focused on option A"
    stake propose(topic: "AI roadmap", angle: "operational simplicity") -> @Picker
    commit
  }

  agent Beta {
    role: "Proposal author focused on option B"
    stake propose(topic: "AI roadmap", angle: "aggressive growth") -> @Picker
    commit
  }

  agent Picker {
    role: "Decision-maker that acts on the first viable proposal"
    await first <- @any
    stake publish(first) -> @out
    commit
  }

  converge when: all_committed
  budget: rounds(5)
}
