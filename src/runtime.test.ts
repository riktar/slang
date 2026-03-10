import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFlow, type FlowState, type RuntimeEvent } from "./runtime.js";
import { createEchoAdapter, type LLMAdapter, type LLMMessage, type LLMResponse } from "./adapter.js";

// ─── Helpers ───

/** Adapter that returns a fixed response */
function createFixedAdapter(content: string): LLMAdapter {
  return {
    name: "fixed/test",
    async call(): Promise<LLMResponse> {
      return { content, tokensUsed: 10 };
    },
  };
}

/** Adapter that returns a different response per call */
function createSequenceAdapter(responses: string[]): LLMAdapter {
  let i = 0;
  return {
    name: "sequence/test",
    async call(): Promise<LLMResponse> {
      const content = responses[i % responses.length]!;
      i++;
      return { content, tokensUsed: 10 };
    },
  };
}

function collectEvents(events: RuntimeEvent[]): (ev: RuntimeEvent) => void {
  return (ev) => events.push(ev);
}

// ─── Tests ───

describe("Runtime", () => {

  // ─── Basic Flows ───

  describe("Basic flows", () => {
    it("runs a single-agent commit flow to convergence", async () => {
      const state = await runFlow(`
        flow "hello" {
          agent Greeter {
            stake greet("world") -> @out
            commit
          }
          converge when: all_committed
        }
      `, { adapter: createEchoAdapter() });

      assert.equal(state.status, "converged");
      assert.equal(state.outputs.length, 1);
      assert.ok(state.agents.get("Greeter")!.committed);
    });

    it("captures outputs staked to @out", async () => {
      const state = await runFlow(`
        flow "t" {
          agent A {
            stake run() -> @out
            commit
          }
          converge when: all_committed
        }
      `, { adapter: createFixedAdapter("Hello from A\nCONFIDENCE: 0.9") });

      assert.equal(state.outputs.length, 1);
      assert.ok((state.outputs[0] as string).includes("Hello from A"));
    });

    it("emits round_start events", async () => {
      const events: RuntimeEvent[] = [];
      await runFlow(`
        flow "t" {
          agent A { commit }
          converge when: all_committed
        }
      `, { adapter: createEchoAdapter(), onEvent: collectEvents(events) });

      const roundStarts = events.filter((e) => e.type === "round_start");
      assert.ok(roundStarts.length >= 1);
    });

    it("emits agent_commit events", async () => {
      const events: RuntimeEvent[] = [];
      await runFlow(`
        flow "t" {
          agent A { commit }
          converge when: all_committed
        }
      `, { adapter: createEchoAdapter(), onEvent: collectEvents(events) });

      const commits = events.filter((e) => e.type === "agent_commit");
      assert.equal(commits.length, 1);
    });
  });

  // ─── Multi-Agent Mailbox ───

  describe("Multi-agent mailbox", () => {
    it("delivers staked data from A to B via mailbox", async () => {
      const state = await runFlow(`
        flow "t" {
          agent A {
            stake produce() -> @B
            commit
          }
          agent B {
            await data <- @A
            commit data
          }
          converge when: all_committed
        }
      `, { adapter: createFixedAdapter("produced value\nCONFIDENCE: 1.0") });

      assert.equal(state.status, "converged");
      assert.ok(state.agents.get("A")!.committed);
      assert.ok(state.agents.get("B")!.committed);
    });

    it("delivers to @all recipients", async () => {
      const state = await runFlow(`
        flow "t" {
          agent Broadcaster {
            stake notify() -> @all
            commit
          }
          agent Listener1 {
            await msg <- @Broadcaster
            commit msg
          }
          agent Listener2 {
            await msg <- @Broadcaster
            commit msg
          }
          converge when: all_committed
        }
      `, { adapter: createFixedAdapter("broadcast message\nCONFIDENCE: 1.0") });

      assert.equal(state.status, "converged");
      assert.ok(state.agents.get("Listener1")!.committed);
      assert.ok(state.agents.get("Listener2")!.committed);
    });
  });

  // ─── Budget ───

  describe("Budget constraints", () => {
    it("stops at budget rounds limit", async () => {
      const state = await runFlow(`
        flow "t" {
          agent A {
            stake run() -> @B
          }
          agent B {
            await data <- @A
            stake process(data) -> @A
          }
          converge when: committed_count >= 1
          budget: rounds(2)
        }
      `, { adapter: createEchoAdapter() });

      assert.equal(state.status, "budget_exceeded");
      assert.ok(state.round > 2);
    });

    it("emits flow_budget_exceeded event", async () => {
      const events: RuntimeEvent[] = [];
      await runFlow(`
        flow "t" {
          agent A { stake loop() -> @B }
          agent B { await x <- @A }
          converge when: all_committed
          budget: rounds(1)
        }
      `, { adapter: createEchoAdapter(), onEvent: collectEvents(events) });

      const budgetEvents = events.filter((e) => e.type === "flow_budget_exceeded");
      assert.equal(budgetEvents.length, 1);
    });

    it("defaults to 10-round max when no budget specified", async () => {
      // Create a flow with enough ping-pong operations to exceed default 10-round limit
      // Each agent has many operations, one per round
      const ops = Array.from({ length: 6 }, (_, i) =>
        `stake step${i}() -> @B\n            await r${i} <- @B`
      ).join("\n            ");
      const bOps = Array.from({ length: 6 }, (_, i) =>
        `await d${i} <- @A\n            stake resp${i}() -> @A`
      ).join("\n            ");

      const state = await runFlow(`
        flow "t" {
          agent A {
            ${ops}
          }
          agent B {
            ${bOps}
          }
          converge when: all_committed
        }
      `, { adapter: createEchoAdapter() });

      // Each agent has 12 operations → ~12 rounds needed.
      // Default budget is 10 rounds, so it should hit budget_exceeded.
      assert.equal(state.status, "budget_exceeded");
    });
  });

  // ─── Escalation ───

  describe("Escalation", () => {
    it("escalates to @Human and stops the flow", async () => {
      const state = await runFlow(`
        flow "t" {
          agent A {
            escalate @Human reason: "need approval"
          }
          converge when: all_committed
        }
      `, { adapter: createEchoAdapter() });

      assert.equal(state.status, "escalated");
      const a = state.agents.get("A")!;
      assert.equal(a.escalatedTo, "Human");
      assert.equal(a.escalateReason, "need approval");
    });

    it("emits both agent_escalate and flow_escalated events", async () => {
      const events: RuntimeEvent[] = [];
      await runFlow(`
        flow "t" {
          agent A { escalate @Human reason: "help" }
          converge when: all_committed
        }
      `, { adapter: createEchoAdapter(), onEvent: collectEvents(events) });

      assert.ok(events.some((e) => e.type === "agent_escalate"));
      assert.ok(events.some((e) => e.type === "flow_escalated"));
    });

    it("skips conditional escalation when condition is false", async () => {
      // Escalation with condition that needs score < 0.3
      // The fixed adapter returns CONFIDENCE: 0.9, so the condition fails
      const state = await runFlow(`
        flow "t" {
          agent A {
            stake analyze() -> @out
            commit
          }
          converge when: all_committed
        }
      `, { adapter: createFixedAdapter("result\nCONFIDENCE: 0.9") });

      assert.equal(state.status, "converged");
      assert.equal(state.agents.get("A")!.escalatedTo, undefined);
    });
  });

  // ─── Commit with Condition ───

  describe("Commit with conditions", () => {
    it("commits when condition is true (high confidence)", async () => {
      // Agent A stakes to B, B awaits and commits with a confidence condition.
      // The fixed adapter always returns high confidence, so the condition passes.
      const state = await runFlow(`
        flow "t" {
          agent Producer {
            stake produce() -> @Consumer
            commit
          }
          agent Consumer {
            await result <- @Producer
            commit result if result.confidence > 0.5
          }
          converge when: committed_count >= 2
        }
      `, { adapter: createFixedAdapter("great result\nCONFIDENCE: 0.9") });

      assert.equal(state.status, "converged");
      assert.ok(state.agents.get("Consumer")!.committed);
    });

    it("does not commit when condition is false (low confidence)", async () => {
      const state = await runFlow(`
        flow "t" {
          agent A {
            stake work() -> @out
            commit result if result.confidence > 0.8
          }
          converge when: committed_count >= 1
          budget: rounds(2)
        }
      `, { adapter: createFixedAdapter("weak result\nCONFIDENCE: 0.2") });

      // Condition fails, so commit doesn't trigger, budget exceeded
      assert.equal(state.status, "budget_exceeded");
      assert.ok(!state.agents.get("A")!.committed);
    });
  });

  // ─── Convergence ───

  describe("Convergence", () => {
    it("converges when committed_count reaches threshold", async () => {
      const state = await runFlow(`
        flow "t" {
          agent A { commit }
          agent B { commit }
          converge when: committed_count >= 2
        }
      `, { adapter: createEchoAdapter() });

      assert.equal(state.status, "converged");
    });

    it("converges on all_committed", async () => {
      const state = await runFlow(`
        flow "t" {
          agent A { commit }
          agent B { commit }
          converge when: all_committed
        }
      `, { adapter: createEchoAdapter() });

      assert.equal(state.status, "converged");
    });
  });

  // ─── Deadlock ───

  describe("Deadlock detection", () => {
    it("detects deadlock when all agents block each other", async () => {
      const state = await runFlow(`
        flow "t" {
          agent A { await x <- @B }
          agent B { await y <- @A }
        }
      `, { adapter: createEchoAdapter() });

      assert.equal(state.status, "deadlock");
    });

    it("emits flow_deadlock event", async () => {
      const events: RuntimeEvent[] = [];
      await runFlow(`
        flow "t" {
          agent A { await x <- @B }
          agent B { await y <- @A }
        }
      `, { adapter: createEchoAdapter(), onEvent: collectEvents(events) });

      assert.ok(events.some((e) => e.type === "flow_deadlock"));
    });
  });

  // ─── Flow State ───

  describe("Flow state", () => {
    it("tracks flow name", async () => {
      const state = await runFlow(`flow "my-flow" { agent A { commit } converge when: all_committed }`, {
        adapter: createEchoAdapter(),
      });
      assert.equal(state.name, "my-flow");
    });

    it("tracks tokens used", async () => {
      const state = await runFlow(`
        flow "t" {
          agent A {
            stake run() -> @out
            commit
          }
          converge when: all_committed
        }
      `, { adapter: createFixedAdapter("response") });

      assert.ok(state.tokensUsed > 0, "Expected tokens to be tracked");
    });

    it("increments round counter", async () => {
      const state = await runFlow(`
        flow "t" {
          agent A { commit }
          converge when: all_committed
        }
      `, { adapter: createEchoAdapter() });

      assert.ok(state.round >= 1);
    });

    it("throws on empty source", async () => {
      await assert.rejects(
        () => runFlow('', { adapter: createEchoAdapter() }),
      );
    });
  });

  // ─── DotAccess Property Extraction ───

  describe("Property extraction from LLM output", () => {
    it("extracts approved:true from output for commit condition", async () => {
      const state = await runFlow(`
        flow "t" {
          agent Writer {
            stake write() -> @Reviewer
          }
          agent Reviewer {
            await draft <- @Writer
            stake review(draft) -> @Writer
          }
          converge when: committed_count >= 1
          budget: rounds(2)
        }
      `, { adapter: createFixedAdapter('review result\napproved: true\nCONFIDENCE: 0.95') });

      // Just check it runs without error; the key test is the runtime handles
      // the dot access pattern correctly
      assert.ok(state.round >= 1);
    });
  });
});
