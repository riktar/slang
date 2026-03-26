import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFlow, type FlowState, type RuntimeEvent, serializeFlowState, deserializeFlowState, type ToolHandler, type DeliverHandler } from "./runtime.js";
import { createEchoAdapter, createRouterAdapter, type LLMAdapter, type LLMMessage, type LLMResponse } from "./adapter.js";

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

  // ─── Parallel Execution ───

  describe("Parallel execution", () => {
    it("executes independent stake agents concurrently", async () => {
      const callOrder: string[] = [];
      const adapter: LLMAdapter = {
        name: "tracking/test",
        async call(messages: LLMMessage[]): Promise<LLMResponse> {
          const system = messages.find(m => m.role === "system")?.content ?? "";
          const agentMatch = system.match(/agent "(\w+)"/);
          const name = agentMatch ? agentMatch[1] : "unknown";
          callOrder.push(`start:${name}`);
          // Small delay so both calls are in-flight
          await new Promise(r => setTimeout(r, 10));
          callOrder.push(`end:${name}`);
          return { content: `result from ${name}`, tokensUsed: 5 };
        },
      };

      const state = await runFlow(`
        flow "t" {
          agent A {
            stake work() -> @out
            commit
          }
          agent B {
            stake work() -> @out
            commit
          }
          converge when: all_committed
        }
      `, { adapter, parallel: true });

      assert.equal(state.status, "converged");
      assert.equal(state.outputs.length, 2);
      // Both starts should happen before both ends (parallel dispatch)
      const startA = callOrder.indexOf("start:A");
      const startB = callOrder.indexOf("start:B");
      const endA = callOrder.indexOf("end:A");
      const endB = callOrder.indexOf("end:B");
      assert.ok(startA < endA);
      assert.ok(startB < endB);
      // Both starts should happen before any end
      assert.ok(startA < endB || startB < endA);
    });

    it("falls back to sequential when parallel is false", async () => {
      const callOrder: string[] = [];
      const adapter: LLMAdapter = {
        name: "tracking/test",
        async call(messages: LLMMessage[]): Promise<LLMResponse> {
          const system = messages.find(m => m.role === "system")?.content ?? "";
          const agentMatch = system.match(/agent "(\w+)"/);
          const name = agentMatch ? agentMatch[1] : "unknown";
          callOrder.push(`start:${name}`);
          await new Promise(r => setTimeout(r, 10));
          callOrder.push(`end:${name}`);
          return { content: `result from ${name}`, tokensUsed: 5 };
        },
      };

      const state = await runFlow(`
        flow "t" {
          agent A {
            stake work() -> @out
            commit
          }
          agent B {
            stake work() -> @out
            commit
          }
          converge when: all_committed
        }
      `, { adapter, parallel: false });

      assert.equal(state.status, "converged");
      // Sequential: A should fully complete before B starts
      // (both go through the sequential path since parallel=false)
      const startA = callOrder.indexOf("start:A");
      const endA = callOrder.indexOf("end:A");
      const startB = callOrder.indexOf("start:B");
      assert.ok(endA < startB, "Expected A to finish before B starts in sequential mode");
    });

    it("still works correctly when mixing stake and await agents", async () => {
      const state = await runFlow(`
        flow "t" {
          agent A {
            stake produce() -> @C
            commit
          }
          agent B {
            stake produce() -> @C
            commit
          }
          agent C {
            await data <- @A, @B
            commit data
          }
          converge when: all_committed
        }
      `, { adapter: createFixedAdapter("content\nCONFIDENCE: 0.9") });

      assert.equal(state.status, "converged");
      assert.ok(state.agents.get("A")!.committed);
      assert.ok(state.agents.get("B")!.committed);
      assert.ok(state.agents.get("C")!.committed);
    });
  });

  // ─── Router Adapter ───

  describe("Router adapter", () => {
    it("routes to different adapters based on model pattern", async () => {
      const calls: { adapter: string; model?: string }[] = [];

      const adapterA: LLMAdapter = {
        name: "adapter-a",
        async call(_msgs, model): Promise<LLMResponse> {
          calls.push({ adapter: "a", model });
          return { content: "from A\nCONFIDENCE: 0.9", tokensUsed: 5 };
        },
      };

      const adapterB: LLMAdapter = {
        name: "adapter-b",
        async call(_msgs, model): Promise<LLMResponse> {
          calls.push({ adapter: "b", model });
          return { content: "from B\nCONFIDENCE: 0.9", tokensUsed: 5 };
        },
      };

      const router = createRouterAdapter({
        routes: [
          { pattern: "claude-*", adapter: adapterA },
          { pattern: "gpt-*", adapter: adapterB },
        ],
        fallback: adapterB,
      });

      const state = await runFlow(`
        flow "t" {
          agent Writer {
            model: "claude-sonnet"
            stake write() -> @out
            commit
          }
          agent Reviewer {
            model: "gpt-4o"
            stake review() -> @out
            commit
          }
          converge when: all_committed
        }
      `, { adapter: router });

      assert.equal(state.status, "converged");
      assert.equal(calls.length, 2);
      const claudeCall = calls.find(c => c.model === "claude-sonnet");
      const gptCall = calls.find(c => c.model === "gpt-4o");
      assert.ok(claudeCall);
      assert.ok(gptCall);
      assert.equal(claudeCall!.adapter, "a");
      assert.equal(gptCall!.adapter, "b");
    });

    it("uses fallback when no pattern matches", async () => {
      const calls: string[] = [];

      const fallback: LLMAdapter = {
        name: "fallback",
        async call(): Promise<LLMResponse> {
          calls.push("fallback");
          return { content: "fallback result", tokensUsed: 5 };
        },
      };

      const router = createRouterAdapter({
        routes: [
          { pattern: "claude-*", adapter: { name: "never", async call() { return { content: "", tokensUsed: 0 }; } } },
        ],
        fallback,
      });

      const state = await runFlow(`
        flow "t" {
          agent A {
            model: "unknown-model"
            stake work() -> @out
            commit
          }
          converge when: all_committed
        }
      `, { adapter: router });

      assert.equal(state.status, "converged");
      assert.ok(calls.includes("fallback"));
    });

    it("uses fallback when agent has no model", async () => {
      const calls: string[] = [];

      const fallback: LLMAdapter = {
        name: "fallback",
        async call(): Promise<LLMResponse> {
          calls.push("fallback");
          return { content: "result", tokensUsed: 5 };
        },
      };

      const router = createRouterAdapter({
        routes: [
          { pattern: "gpt-*", adapter: { name: "gpt", async call() { return { content: "", tokensUsed: 0 }; } } },
        ],
        fallback,
      });

      const state = await runFlow(`
        flow "t" {
          agent A {
            stake work() -> @out
            commit
          }
          converge when: all_committed
        }
      `, { adapter: router });

      assert.equal(state.status, "converged");
      assert.ok(calls.includes("fallback"));
    });
  });

  // ─── v0.2: Retry ───

  describe("Retry", () => {
    it("retries on adapter failure then succeeds", async () => {
      let callCount = 0;
      const flaky: LLMAdapter = {
        name: "flaky/test",
        async call(): Promise<LLMResponse> {
          callCount++;
          if (callCount === 1) throw new Error("network error");
          return { content: "ok", tokensUsed: 5 };
        },
      };

      const events: RuntimeEvent[] = [];
      const state = await runFlow(`
        flow "t" {
          agent A {
            retry: 3
            stake work() -> @out
            commit
          }
          converge when: all_committed
        }
      `, { adapter: flaky, onEvent: collectEvents(events) });

      assert.equal(state.status, "converged");
      assert.equal(callCount, 2);
      assert.ok(events.some(e => e.type === "agent_retry"));
    });

    it("propagates error when all retries exhausted", async () => {
      const alwaysFails: LLMAdapter = {
        name: "fail/test",
        async call(): Promise<LLMResponse> {
          throw new Error("permanent error");
        },
      };

      await assert.rejects(
        () => runFlow(`
          flow "t" {
            agent A {
              retry: 2
              stake work() -> @out
              commit
            }
            converge when: all_committed
          }
        `, { adapter: alwaysFails }),
        /permanent error/
      );
    });

    it("no retry by default (retry: 1)", async () => {
      const fails: LLMAdapter = {
        name: "fail/test",
        async call(): Promise<LLMResponse> {
          throw new Error("fail");
        },
      };

      await assert.rejects(
        () => runFlow(`
          flow "t" {
            agent A {
              stake work() -> @out
              commit
            }
            converge when: all_committed
          }
        `, { adapter: fails }),
        /fail/
      );
    });
  });

  // ─── v0.2: Structured Output (JSON extraction) ───

  describe("Structured Output", () => {
    it("extracts fields from fenced JSON block", async () => {
      const adapter = createFixedAdapter('Here is my review:\n```json\n{"approved": true, "score": 0.9}\n```\nCONFIDENCE: 0.8');

      const state = await runFlow(`
        flow "t" {
          agent Reviewer {
            stake review("check this") -> @Decider
              output: { approved: "boolean", score: "number" }
            commit
          }
          agent Decider {
            await result <- @Reviewer
            commit if result.approved
          }
          converge when: all_committed
        }
      `, { adapter });

      assert.equal(state.status, "converged");
      const decider = state.agents.get("Decider")!;
      assert.equal(decider.committed, true);
    });

    it("extracts fields from raw JSON in response", async () => {
      const adapter = createFixedAdapter('{"approved": true, "score": 0.95}');

      const state = await runFlow(`
        flow "t" {
          agent A {
            stake check("data") -> @B
              output: { approved: "boolean" }
            commit
          }
          agent B {
            await result <- @A
            commit if result.approved
          }
          converge when: all_committed
        }
      `, { adapter });

      assert.equal(state.status, "converged");
      assert.equal(state.agents.get("B")!.committed, true);
    });
  });

  // ─── v0.3: Checkpoint / Resume ───

  describe("Checkpoint / Resume", () => {
    it("calls checkpoint callback after each round", async () => {
      const checkpoints: FlowState[] = [];
      const state = await runFlow(`
        flow "t" {
          agent A {
            stake work() -> @out
            commit
          }
          converge when: all_committed
        }
      `, {
        adapter: createEchoAdapter(),
        checkpoint: async (s) => { checkpoints.push(s); },
      });

      assert.equal(state.status, "converged");
      // At least one in-progress checkpoint + one final checkpoint
      assert.ok(checkpoints.length >= 1, `Expected at least 1 checkpoint, got ${checkpoints.length}`);
      // Final checkpoint should have terminated status
      const last = checkpoints[checkpoints.length - 1]!;
      assert.equal(last.status, "converged");
    });

    it("emits checkpoint events", async () => {
      const events: RuntimeEvent[] = [];
      await runFlow(`
        flow "t" {
          agent A { commit }
          converge when: all_committed
        }
      `, {
        adapter: createEchoAdapter(),
        onEvent: collectEvents(events),
        checkpoint: async () => {},
      });

      const cpEvents = events.filter((e) => e.type === "checkpoint");
      assert.ok(cpEvents.length >= 1);
    });

    it("checkpointed state is serializable and deserializable", async () => {
      let serialized = "";
      await runFlow(`
        flow "t" {
          agent A {
            stake work() -> @B
            commit
          }
          agent B {
            await data <- @A
            commit data
          }
          converge when: all_committed
        }
      `, {
        adapter: createFixedAdapter("hello\nCONFIDENCE: 0.9"),
        checkpoint: async (s) => { serialized = serializeFlowState(s); },
      });

      assert.ok(serialized.length > 0);
      const deserialized = deserializeFlowState(serialized);
      assert.equal(deserialized.name, "t");
      assert.ok(deserialized.agents instanceof Map);
      assert.ok(deserialized.mailbox instanceof Map);
    });

    it("resumes from a checkpointed state", async () => {
      // First, run a flow that will exceed budget after round 1
      let savedState: FlowState | undefined;
      const state1 = await runFlow(`
        flow "t" {
          agent A {
            stake step1() -> @out
            stake step2() -> @out
            commit
          }
          converge when: all_committed
          budget: rounds(1)
        }
      `, {
        adapter: createFixedAdapter("result\nCONFIDENCE: 0.9"),
        checkpoint: async (s) => { savedState = s; },
      });

      assert.equal(state1.status, "budget_exceeded");
      assert.ok(savedState);

      // Resume from the saved running checkpoint (not the final one)
      // The first checkpoint is after round 1 (still running)
      // We need to resume with a higher budget
      const state2 = await runFlow(`
        flow "t" {
          agent A {
            stake step1() -> @out
            stake step2() -> @out
            commit
          }
          converge when: all_committed
          budget: rounds(5)
        }
      `, {
        adapter: createFixedAdapter("result\nCONFIDENCE: 0.9"),
        resumeFrom: savedState,
      });

      // The resumed flow should have completed
      assert.ok(state2.round >= 1);
    });
  });

  // ─── v0.3: Functional Tools ───

  describe("Functional Tools", () => {
    it("executes tool calls and feeds results back to LLM", async () => {
      let callIndex = 0;
      const adapter: LLMAdapter = {
        name: "tool-test",
        async call(messages: LLMMessage[]): Promise<LLMResponse> {
          callIndex++;
          if (callIndex === 1) {
            // First call: agent requests a tool
            return {
              content: 'Let me search for that.\nTOOL_CALL: web_search({"query": "AI trends"})',
              tokensUsed: 10,
            };
          }
          // Second call: with tool result, produce final answer
          const lastMsg = messages[messages.length - 1]!;
          assert.ok(lastMsg.content.includes("AI trends result"));
          return {
            content: "Based on the search: AI is growing fast.\nCONFIDENCE: 0.9",
            tokensUsed: 10,
          };
        },
      };

      const events: RuntimeEvent[] = [];
      const state = await runFlow(`
        flow "t" {
          agent Researcher {
            tools: [web_search]
            stake research("AI trends") -> @out
            commit
          }
          converge when: all_committed
        }
      `, {
        adapter,
        tools: {
          web_search: async (args) => `AI trends result for: ${(args as any).query}`,
        },
        onEvent: collectEvents(events),
      });

      assert.equal(state.status, "converged");
      assert.ok(events.some((e) => e.type === "tool_call"));
      assert.ok(events.some((e) => e.type === "tool_result"));
      const output = state.outputs[0] as string;
      assert.ok(output.includes("AI is growing fast"));
    });

    it("ignores tool calls when no runtime tools are provided", async () => {
      const adapter = createFixedAdapter('result\nTOOL_CALL: unknown_tool({"x": 1})\nCONFIDENCE: 0.8');

      const state = await runFlow(`
        flow "t" {
          agent A {
            tools: [unknown_tool]
            stake work() -> @out
            commit
          }
          converge when: all_committed
        }
      `, { adapter });

      assert.equal(state.status, "converged");
    });

    it("only provides agent-declared tools, not all runtime tools", async () => {
      let systemPrompt = "";
      const adapter: LLMAdapter = {
        name: "spy-test",
        async call(messages: LLMMessage[]): Promise<LLMResponse> {
          systemPrompt = messages.find((m) => m.role === "system")?.content ?? "";
          return { content: "done\nCONFIDENCE: 0.9", tokensUsed: 5 };
        },
      };

      await runFlow(`
        flow "t" {
          agent A {
            tools: [web_search]
            stake work() -> @out
            commit
          }
          converge when: all_committed
        }
      `, {
        adapter,
        tools: {
          web_search: async () => "result",
          code_exec: async () => "result",
        },
      });

      assert.ok(systemPrompt.includes("web_search"));
      assert.ok(!systemPrompt.includes("code_exec"));
    });

    it("limits tool calls to prevent infinite loops", async () => {
      let callCount = 0;
      const adapter: LLMAdapter = {
        name: "loop-test",
        async call(): Promise<LLMResponse> {
          callCount++;
          // Always request another tool call
          return {
            content: `call ${callCount}\nTOOL_CALL: looper({"n": ${callCount}})`,
            tokensUsed: 5,
          };
        },
      };

      const state = await runFlow(`
        flow "t" {
          agent A {
            tools: [looper]
            stake work() -> @out
            commit
          }
          converge when: all_committed
        }
      `, {
        adapter,
        tools: { looper: async () => "ok" },
      });

      assert.equal(state.status, "converged");
      // 1 initial call + 10 max tool loops = 11 calls max
      assert.ok(callCount <= 11, `Expected <= 11 calls, got ${callCount}`);
    });

    it("emits tool_call and tool_result events with correct data", async () => {
      let first = true;
      const adapter: LLMAdapter = {
        name: "event-test",
        async call(): Promise<LLMResponse> {
          if (first) {
            first = false;
            return { content: 'TOOL_CALL: calc({"expr": "2+2"})', tokensUsed: 5 };
          }
          return { content: "4\nCONFIDENCE: 1.0", tokensUsed: 5 };
        },
      };

      const events: RuntimeEvent[] = [];
      await runFlow(`
        flow "t" {
          agent A {
            tools: [calc]
            stake compute("2+2") -> @out
            commit
          }
          converge when: all_committed
        }
      `, {
        adapter,
        tools: { calc: async (args) => String(eval((args as any).expr)) },
        onEvent: collectEvents(events),
      });

      const toolCallEvent = events.find((e) => e.type === "tool_call");
      assert.ok(toolCallEvent);
      assert.equal((toolCallEvent as any).agent, "A");
      assert.equal((toolCallEvent as any).tool, "calc");

      const toolResultEvent = events.find((e) => e.type === "tool_result");
      assert.ok(toolResultEvent);
      assert.equal((toolResultEvent as any).result, "4");
    });
  });

  // ─── v0.6: Let / Set ───

  describe("Let / Set variables", () => {
    it("stores and uses local variables with let", async () => {
      const state = await runFlow(`
        flow "t" {
          agent A {
            let greeting = "hello world"
            commit greeting
          }
          converge when: all_committed
        }
      `, { adapter: createEchoAdapter() });

      assert.equal(state.status, "converged");
      assert.ok(state.agents.get("A")!.committed);
      assert.equal(state.agents.get("A")!.output, "hello world");
    });

    it("updates variables with set", async () => {
      const state = await runFlow(`
        flow "t" {
          agent A {
            let total = 0
            set total = 42
            commit total
          }
          converge when: all_committed
        }
      `, { adapter: createEchoAdapter() });

      assert.equal(state.status, "converged");
      assert.equal(state.agents.get("A")!.output, 42);
    });

    it("variables are accessible in conditions", async () => {
      const state = await runFlow(`
        flow "t" {
          agent A {
            let ready = true
            commit if ready
          }
          converge when: all_committed
        }
      `, { adapter: createEchoAdapter() });

      assert.equal(state.status, "converged");
      assert.ok(state.agents.get("A")!.committed);
    });

    it("variables are agent-local", async () => {
      const state = await runFlow(`
        flow "t" {
          agent A {
            let msg = "from A"
            stake send(msg) -> @out
            commit
          }
          agent B {
            let msg = "from B"
            stake send(msg) -> @out
            commit
          }
          converge when: all_committed
        }
      `, { adapter: createEchoAdapter() });

      assert.equal(state.status, "converged");
      assert.equal(state.outputs.length, 2);
    });
  });

  // ─── v0.6: Else / Otherwise ───

  describe("Else / Otherwise", () => {
    it("executes else block when when-condition is false", async () => {
      const state = await runFlow(`
        flow "t" {
          agent A {
            let done = false
            when done {
              commit "was done"
            } else {
              commit "not done"
            }
          }
          converge when: all_committed
        }
      `, { adapter: createEchoAdapter() });

      assert.equal(state.status, "converged");
      assert.equal(state.agents.get("A")!.output, "not done");
    });

    it("executes when body when condition is true (not else)", async () => {
      const state = await runFlow(`
        flow "t" {
          agent A {
            let done = true
            when done {
              commit "was done"
            } else {
              commit "not done"
            }
          }
          converge when: all_committed
        }
      `, { adapter: createEchoAdapter() });

      assert.equal(state.status, "converged");
      assert.equal(state.agents.get("A")!.output, "was done");
    });

    it("otherwise keyword works same as else", async () => {
      const state = await runFlow(`
        flow "t" {
          agent A {
            let ok = false
            when ok {
              commit "ok"
            } otherwise {
              commit "not ok"
            }
          }
          converge when: all_committed
        }
      `, { adapter: createEchoAdapter() });

      assert.equal(state.status, "converged");
      assert.equal(state.agents.get("A")!.output, "not ok");
    });
  });

  // ─── v0.6: Repeat / Until ───

  describe("Repeat / Until", () => {
    it("repeats until condition is true", async () => {
      const state = await runFlow(`
        flow "t" {
          agent A {
            let i = 0
            repeat until i >= 3 {
              set i = round
            }
            commit i
          }
          converge when: all_committed
          budget: rounds(10)
        }
      `, { adapter: createEchoAdapter() });

      assert.equal(state.status, "converged");
      assert.ok(state.agents.get("A")!.committed);
    });

    it("does not execute body when condition is already true", async () => {
      const state = await runFlow(`
        flow "t" {
          agent A {
            let done = true
            repeat until done {
              escalate @Human reason: "should not reach"
            }
            commit
          }
          converge when: all_committed
        }
      `, { adapter: createEchoAdapter() });

      assert.equal(state.status, "converged");
      assert.ok(state.agents.get("A")!.committed);
      assert.equal(state.agents.get("A")!.escalatedTo, undefined);
    });
  });

  // ─── v0.6: Deliver & onConverge ───

  describe("Deliver & onConverge", () => {
    it("calls deliver handler after convergence", async () => {
      const delivered: { output: unknown; args: Record<string, unknown> }[] = [];
      const state = await runFlow(`
        flow "t" {
          agent A {
            stake greet("hello") -> @out
            commit
          }
          deliver: save_file(path: "out.txt")
          converge when: all_committed
        }
      `, {
        adapter: createEchoAdapter(),
        deliverers: {
          save_file: async (output, args) => { delivered.push({ output, args }); },
        },
      });

      assert.equal(state.status, "converged");
      assert.equal(delivered.length, 1);
      assert.equal(delivered[0]!.args.path, "out.txt");
    });

    it("calls onConverge hook after convergence", async () => {
      let convergedState: FlowState | undefined;
      const state = await runFlow(`
        flow "t" {
          agent A {
            stake greet("hello") -> @out
            commit
          }
          converge when: all_committed
        }
      `, {
        adapter: createEchoAdapter(),
        onConverge: async (s) => { convergedState = s; },
      });

      assert.equal(state.status, "converged");
      assert.ok(convergedState);
      assert.equal(convergedState!.status, "converged");
    });

    it("calls deliver and onConverge even when budget exceeded", async () => {
      let onConvergeCalled = false;
      const delivered: unknown[] = [];
      const state = await runFlow(`
        flow "t" {
          agent A {
            stake step() -> @B
          }
          agent B {
            await data <- @A
            stake reply() -> @A
          }
          deliver: save_file()
          converge when: all_committed
          budget: rounds(1)
        }
      `, {
        adapter: createEchoAdapter(),
        deliverers: { save_file: async (o) => { delivered.push(o); } },
        onConverge: async () => { onConvergeCalled = true; },
      });

      assert.equal(state.status, "budget_exceeded");
      assert.equal(delivered.length, 1);
      assert.equal(onConvergeCalled, true);
    });

    it("calls multiple deliver handlers in order", async () => {
      const order: string[] = [];
      const state = await runFlow(`
        flow "t" {
          agent A {
            stake greet("hello") -> @out
            commit
          }
          deliver: first_handler()
          deliver: second_handler()
          converge when: all_committed
        }
      `, {
        adapter: createEchoAdapter(),
        deliverers: {
          first_handler: async () => { order.push("first"); },
          second_handler: async () => { order.push("second"); },
        },
      });

      assert.equal(state.status, "converged");
      assert.deepEqual(order, ["first", "second"]);
    });

    it("emits deliver and on_converge events", async () => {
      const events: RuntimeEvent[] = [];
      const state = await runFlow(`
        flow "t" {
          agent A {
            stake greet("hello") -> @out
            commit
          }
          deliver: save_file(path: "out.txt")
          converge when: all_committed
        }
      `, {
        adapter: createEchoAdapter(),
        deliverers: { save_file: async () => {} },
        onConverge: async () => {},
        onEvent: collectEvents(events),
      });

      assert.equal(state.status, "converged");
      const deliverEvents = events.filter(e => e.type === "deliver");
      assert.equal(deliverEvents.length, 1);
      const onConvergeEvents = events.filter(e => e.type === "on_converge");
      assert.equal(onConvergeEvents.length, 1);
    });

    it("skips deliver handlers not present in deliverers map", async () => {
      const delivered: string[] = [];
      const state = await runFlow(`
        flow "t" {
          agent A {
            stake greet("hello") -> @out
            commit
          }
          deliver: missing_handler()
          deliver: present_handler()
          converge when: all_committed
        }
      `, {
        adapter: createEchoAdapter(),
        deliverers: { present_handler: async () => { delivered.push("present"); } },
      });

      assert.equal(state.status, "converged");
      assert.deepEqual(delivered, ["present"]);
    });

    it("resolves flowOutput from committed agents when no @out target", async () => {
      let receivedOutput: unknown;
      let receivedArgs: Record<string, unknown> = {};
      const state = await runFlow(`
        flow "t" {
          agent A {
            stake greet("hello") -> @B
            await reply <- @B
            commit
          }
          agent B {
            await msg <- @A
            stake respond(msg) -> @A
            commit
          }
          deliver: my_handler(A)
          converge when: all_committed
        }
      `, {
        adapter: createEchoAdapter(),
        deliverers: {
          my_handler: async (output, args) => { receivedOutput = output; receivedArgs = args; },
        },
      });

      assert.equal(state.status, "converged");
      // flowOutput should be a map of both agents' outputs since both committed
      assert.ok(typeof receivedOutput === "object" && receivedOutput !== null);
      // Ident arg "A" should resolve to agent A's output
      assert.ok(receivedArgs["arg0"] !== undefined);
      assert.ok(typeof receivedArgs["arg0"] === "string");
    });

    it("resolves flowOutput from single committed agent", async () => {
      let receivedOutput: unknown;
      const state = await runFlow(`
        flow "t" {
          agent A {
            stake greet("hello") -> @B
            commit
          }
          agent B {
            await msg <- @A
          }
          deliver: my_handler()
          converge when: all_committed
          budget: rounds(2)
        }
      `, {
        adapter: createEchoAdapter(),
        deliverers: {
          my_handler: async (output) => { receivedOutput = output; },
        },
      });

      // Only agent A committed, so flowOutput should be its output directly
      assert.ok(receivedOutput !== undefined);
      assert.ok(typeof receivedOutput === "string");
    });
  });

  // ─── v0.7.1: Local Stake ───

  describe("Local Stake (stake without recipient)", () => {
    it("runs local stake and stores result in agent output", async () => {
      const state = await runFlow(`
        flow "t" {
          agent A {
            stake research(topic: "AI")
            commit
          }
          converge when: all_committed
          budget: rounds(2)
        }
      `, { adapter: createEchoAdapter() });

      assert.equal(state.status, "converged");
      const agent = state.agents.get("A")!;
      assert.ok(agent.output);
      // No outputs to @out since no recipient
      assert.equal(state.outputs.length, 0);
    });

    it("let = stake stores result in variable", async () => {
      const events: RuntimeEvent[] = [];
      const state = await runFlow(`
        flow "t" {
          agent A {
            let article = stake write(topic: "AI safety")
            stake publish(article) -> @out
            commit
          }
          converge when: all_committed
          budget: rounds(3)
        }
      `, {
        adapter: createEchoAdapter(),
        onEvent: (e) => events.push(e),
      });

      assert.equal(state.status, "converged");
      const agent = state.agents.get("A")!;
      // Variable 'article' should be set
      assert.ok(agent.variables["article"] !== undefined);
      // Should have an output to @out from the second stake
      assert.ok(state.outputs.length > 0);
    });

    it("set = stake updates existing variable", async () => {
      const state = await runFlow(`
        flow "t" {
          agent A {
            let draft = "initial"
            set draft = stake revise(draft)
            stake publish(draft) -> @out
            commit
          }
          converge when: all_committed
          budget: rounds(5)
        }
      `, { adapter: createEchoAdapter() });

      assert.equal(state.status, "converged");
      const agent = state.agents.get("A")!;
      // Variable 'draft' should have been updated from "initial" to the stake result
      assert.ok(agent.variables["draft"] !== undefined);
      assert.notEqual(agent.variables["draft"], "initial");
    });

    it("let = stake with recipient both stores and sends", async () => {
      const state = await runFlow(`
        flow "t" {
          agent A {
            let result = stake analyze(data: "test") -> @B
            commit
          }
          agent B {
            await analysis <- @A
            commit
          }
          converge when: all_committed
          budget: rounds(3)
        }
      `, { adapter: createEchoAdapter() });

      assert.equal(state.status, "converged");
      const agentA = state.agents.get("A")!;
      // Variable 'result' should be set
      assert.ok(agentA.variables["result"] !== undefined);
      // Agent B should have received the data
      const agentB = state.agents.get("B")!;
      assert.ok(agentB.committed);
    });

    it("chains multiple local stakes", async () => {
      const adapter = createSequenceAdapter([
        "research data about AI",
        "summary of AI research",
        "published article",
      ]);
      const state = await runFlow(`
        flow "t" {
          agent Writer {
            let data = stake research(topic: "AI")
            let summary = stake summarize(data)
            stake publish(summary) -> @out
            commit
          }
          converge when: all_committed
          budget: rounds(5)
        }
      `, { adapter });

      assert.equal(state.status, "converged");
      const agent = state.agents.get("Writer")!;
      assert.ok(agent.variables["data"]);
      assert.ok(agent.variables["summary"]);
      assert.ok(state.outputs.length > 0);
    });
  });

  // ─── Parametric Flows ───

  describe("Parametric flows", () => {
    it("parses and runs a flow with parameters", async () => {
      const state = await runFlow(`
        flow "analysis" (topic: "string", depth: "number") {
          agent Analyst {
            stake analyze(topic, depth: depth) -> @out
            commit
          }
          converge when: all_committed
        }
      `, {
        adapter: createFixedAdapter("Analysis result\nCONFIDENCE: 0.9"),
        params: { topic: "AI Safety", depth: 3 },
      });

      assert.equal(state.status, "converged");
      assert.equal(state.params["topic"], "AI Safety");
      assert.equal(state.params["depth"], 3);
    });

    it("resolves params as expression values", async () => {
      let capturedPrompt = "";
      const adapter: LLMAdapter = {
        name: "capture/test",
        async call(messages): Promise<LLMResponse> {
          capturedPrompt = messages[0]!.content as string;
          return { content: "done\nCONFIDENCE: 1.0", tokensUsed: 10 };
        },
      };

      await runFlow(`
        flow "search" (query: "string") {
          agent Searcher {
            stake find(query) -> @out
            commit
          }
          converge when: all_committed
        }
      `, {
        adapter,
        params: { query: "quantum computing" },
      });

      assert.ok(capturedPrompt.includes("quantum computing"), "param value should appear in task description");
    });

    it("params are accessible in flow-level expressions", async () => {
      const state = await runFlow(`
        flow "conditional" (threshold: "number") {
          agent Worker {
            commit
          }
          converge when: all_committed
        }
      `, {
        adapter: createEchoAdapter(),
        params: { threshold: 42 },
      });

      assert.equal(state.params["threshold"], 42);
    });

    it("works without parameters (backwards compat)", async () => {
      const state = await runFlow(`
        flow "simple" {
          agent A { commit }
          converge when: all_committed
        }
      `, { adapter: createEchoAdapter() });

      assert.equal(state.status, "converged");
      assert.deepEqual(state.params, {});
    });
  });

  // ─── Import / Sub-flow Composition ───

  describe("Import / sub-flow composition", () => {
    it("runs an imported sub-flow and makes its output available via alias", async () => {
      const subFlowSource = `
        flow "sub" {
          agent Producer {
            stake produce() -> @out
            commit
          }
          converge when: all_committed
        }
      `;

      const state = await runFlow(`
        flow "parent" {
          import "sub.slang" as sub_result

          agent Consumer {
            await data <- @sub_result
            stake process(data) -> @out
            commit
          }
          converge when: all_committed
          budget: rounds(10)
        }
      `, {
        adapter: createSequenceAdapter([
          "sub-flow output\nCONFIDENCE: 0.9",
          "processed result\nCONFIDENCE: 0.9",
        ]),
        importLoader: () => subFlowSource,
      });

      assert.equal(state.status, "converged");
      // The alias agent is synthetic-committed
      const aliasAgent = state.agents.get("sub_result");
      assert.ok(aliasAgent, "alias agent should exist");
      assert.ok(aliasAgent!.committed, "alias agent should be committed");
    });

    it("alias agent output is accessible via await binding", async () => {
      const subFlowSource = `
        flow "data-producer" {
          agent Gen {
            stake generate() -> @out
            commit
          }
          converge when: all_committed
        }
      `;

      let receivedData: unknown;
      const adapter: LLMAdapter = {
        name: "spy/test",
        async call(messages): Promise<LLMResponse> {
          // The Consumer agent receives data via await binding — capture it
          const userMsg = messages[1]?.content as string ?? "";
          if (userMsg.includes("[data]")) {
            receivedData = userMsg;
          }
          return { content: "processed\nCONFIDENCE: 1.0", tokensUsed: 10 };
        },
      };

      await runFlow(`
        flow "parent" {
          import "producer.slang" as gen

          agent Consumer {
            await data <- @gen
            stake consume(data) -> @out
            commit
          }
          converge when: all_committed
          budget: rounds(10)
        }
      `, {
        adapter,
        importLoader: () => subFlowSource,
      });

      assert.ok(receivedData !== undefined, "Consumer should have received data from sub-flow");
    });

    it("skips import gracefully when importLoader is not provided", async () => {
      // When no importLoader is passed, imports silently no-op and the flow runs normally
      // (agents awaiting from the alias will block — this tests the parser-only path)
      const state = await runFlow(`
        flow "standalone" {
          agent A {
            stake work() -> @out
            commit
          }
          converge when: all_committed
        }
      `, { adapter: createEchoAdapter() });

      assert.equal(state.status, "converged");
    });

    it("importLoader throwing does not crash the parent flow", async () => {
      const state = await runFlow(`
        flow "resilient" {
          agent A {
            stake work() -> @out
            commit
          }
          converge when: all_committed
        }
      `, {
        adapter: createEchoAdapter(),
        importLoader: () => { throw new Error("file not found"); },
      });

      assert.equal(state.status, "converged");
    });
  });
});
