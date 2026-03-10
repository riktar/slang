import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parse } from "./parser.js";
import { resolveDeps, detectDeadlocks, type DepGraph } from "./resolver.js";
import type { FlowDecl } from "./ast.js";

// ─── Helpers ───

function graphOf(source: string): DepGraph {
  const program = parse(source);
  const flow = program.flows[0]!;
  return resolveDeps(flow);
}

// ─── Tests ───

describe("Resolver", () => {

  // ─── Ready / Blocked ───

  describe("Ready / Blocked classification", () => {
    it("single agent without await is ready", () => {
      const graph = graphOf(`
        flow "t" {
          agent A { stake run() -> @out }
        }
      `);
      assert.deepEqual(graph.ready, ["A"]);
      assert.deepEqual(graph.blocked, []);
    });

    it("agent whose first op is await is blocked", () => {
      const graph = graphOf(`
        flow "t" {
          agent A { stake run() -> @B }
          agent B { await data <- @A }
        }
      `);
      assert.deepEqual(graph.ready, ["A"]);
      assert.deepEqual(graph.blocked, ["B"]);
    });

    it("agent whose first op is stake is ready even if it awaits later", () => {
      const graph = graphOf(`
        flow "t" {
          agent A {
            stake run() -> @B
            await feedback <- @B
            commit
          }
          agent B { await data <- @A }
        }
      `);
      assert.ok(graph.ready.includes("A"));
      assert.ok(graph.blocked.includes("B"));
    });

    it("all agents ready when none start with await", () => {
      const graph = graphOf(`
        flow "t" {
          agent A { stake a() -> @out }
          agent B { stake b() -> @out }
          agent C { commit }
        }
      `);
      assert.deepEqual(graph.ready.sort(), ["A", "B", "C"]);
      assert.deepEqual(graph.blocked, []);
    });
  });

  // ─── Dependency extraction ───

  describe("Dependency extraction", () => {
    it("extracts awaitsFrom sources", () => {
      const graph = graphOf(`
        flow "t" {
          agent Consumer {
            await data <- @ProducerA, @ProducerB
          }
        }
      `);
      const dep = graph.agents.get("Consumer")!;
      assert.deepEqual(dep.awaitsFrom.sort(), ["ProducerA", "ProducerB"]);
    });

    it("excludes * from awaitsFrom", () => {
      const graph = graphOf(`flow "t" { agent A { await data <- * } }`);
      assert.deepEqual(graph.agents.get("A")!.awaitsFrom, []);
    });

    it("extracts stakesTo recipients", () => {
      const graph = graphOf(`
        flow "t" {
          agent Sender { stake send() -> @RecvA, @RecvB }
        }
      `);
      const dep = graph.agents.get("Sender")!;
      assert.deepEqual(dep.stakesTo.sort(), ["RecvA", "RecvB"]);
    });

    it("excludes @out and @all from stakesTo", () => {
      const graph = graphOf(`
        flow "t" {
          agent A { stake x() -> @out }
          agent B { stake y() -> @all }
        }
      `);
      assert.deepEqual(graph.agents.get("A")!.stakesTo, []);
      assert.deepEqual(graph.agents.get("B")!.stakesTo, []);
    });

    it("deduplicates dependencies", () => {
      const graph = graphOf(`
        flow "t" {
          agent A {
            await x <- @B
            await y <- @B
          }
        }
      `);
      assert.deepEqual(graph.agents.get("A")!.awaitsFrom, ["B"]);
    });

    it("collects deps from when blocks", () => {
      const graph = graphOf(`
        flow "t" {
          agent W {
            stake write() -> @R
            await fb <- @R
            when fb.rejected {
              stake revise(fb) -> @R
            }
          }
          agent R {
            await draft <- @W
            stake review(draft) -> @W
          }
        }
      `);
      const w = graph.agents.get("W")!;
      assert.ok(w.awaitsFrom.includes("R"));
      assert.ok(w.stakesTo.includes("R"));
    });
  });

  // ─── Deadlock Detection ───

  describe("Deadlock detection", () => {
    it("no deadlock when at least one agent is ready", () => {
      const graph = graphOf(`
        flow "t" {
          agent A { stake run() -> @B }
          agent B { await data <- @A }
        }
      `);
      const deadlocks = detectDeadlocks(graph);
      assert.equal(deadlocks.length, 0);
    });

    it("detects cycle between two blocked agents", () => {
      const graph = graphOf(`
        flow "t" {
          agent A { await x <- @B }
          agent B { await y <- @A }
        }
      `);
      const deadlocks = detectDeadlocks(graph);
      assert.ok(deadlocks.length > 0, "Expected at least one deadlock cycle");
      // The cycle should involve A and B
      const cycle = deadlocks[0]!;
      assert.ok(cycle.includes("A") || cycle.includes("B"));
    });

    it("detects cycle in a three-agent ring", () => {
      const graph = graphOf(`
        flow "t" {
          agent A { await x <- @C }
          agent B { await y <- @A }
          agent C { await z <- @B }
        }
      `);
      const deadlocks = detectDeadlocks(graph);
      assert.ok(deadlocks.length > 0);
    });

    it("no deadlock when no blocked agents", () => {
      const graph = graphOf(`
        flow "t" {
          agent A { commit }
          agent B { commit }
        }
      `);
      const deadlocks = detectDeadlocks(graph);
      assert.equal(deadlocks.length, 0);
    });

    it("does not flag partial deadlock when mixed agents", () => {
      const graph = graphOf(`
        flow "t" {
          agent Ready { stake x() -> @Blocked }
          agent Blocked { await data <- @Ready }
        }
      `);
      const deadlocks = detectDeadlocks(graph);
      // Blocked agent awaits a ready agent, so no true deadlock
      assert.equal(deadlocks.length, 0);
    });
  });

  // ─── Complex Flow Graphs ───

  describe("Complex flows", () => {
    it("handles research pattern: 3-agent with escalation", () => {
      const graph = graphOf(`
        flow "research" {
          agent Researcher {
            stake gather(topic: "test") -> @Analyst
          }
          agent Analyst {
            await data <- @Researcher
            stake analyze(data) -> @Critic
            await verdict <- @Critic
            commit verdict if verdict.confidence > 0.7
            escalate @Human reason: "low confidence"
          }
          agent Critic {
            await analysis <- @Analyst
            stake challenge(analysis) -> @Analyst
          }
          converge when: committed_count >= 1
          budget: rounds(5)
        }
      `);
      assert.deepEqual(graph.ready, ["Researcher"]);
      assert.deepEqual(graph.blocked.sort(), ["Analyst", "Critic"]);

      const analyst = graph.agents.get("Analyst")!;
      assert.ok(analyst.awaitsFrom.includes("Researcher"));
      assert.ok(analyst.awaitsFrom.includes("Critic"));
      assert.ok(analyst.stakesTo.includes("Critic"));
    });

    it("empty flow has empty graph", () => {
      const graph = graphOf('flow "empty" {}');
      assert.equal(graph.agents.size, 0);
      assert.equal(graph.ready.length, 0);
      assert.equal(graph.blocked.length, 0);
    });
  });
});
