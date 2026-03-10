import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parse, ParseError } from "./parser.js";
import type {
  FlowDecl, AgentDecl, StakeOp, AwaitOp, CommitOp,
  EscalateOp, WhenBlock, ImportStmt, ConvergeStmt,
  BudgetStmt, StringLit, NumberLit, BoolLit, Ident,
  AgentRef, ListLit, DotAccess, BinaryExpr,
} from "./ast.js";

// ─── Helpers ───

function firstFlow(source: string): FlowDecl {
  const program = parse(source);
  assert.equal(program.type, "Program");
  assert.ok(program.flows.length > 0, "Expected at least one flow");
  return program.flows[0]!;
}

function firstAgent(source: string): AgentDecl {
  const flow = firstFlow(source);
  const agent = flow.body.find((n): n is AgentDecl => n.type === "AgentDecl");
  assert.ok(agent, "Expected at least one agent");
  return agent;
}

function firstOp<T>(source: string, opType: string): T {
  const agent = firstAgent(source);
  const op = agent.operations.find((o) => o.type === opType);
  assert.ok(op, `Expected operation of type ${opType}`);
  return op as T;
}

// ─── Tests ───

describe("Parser", () => {
  // ─── Program & Flow ───

  describe("Program & Flow", () => {
    it("parses empty flow", () => {
      const flow = firstFlow('flow "empty" {}');
      assert.equal(flow.name, "empty");
      assert.equal(flow.body.length, 0);
    });

    it("parses flow name", () => {
      const flow = firstFlow('flow "my-research-flow" {}');
      assert.equal(flow.name, "my-research-flow");
    });

    it("parses multiple flows", () => {
      const program = parse('flow "a" {} flow "b" {}');
      assert.equal(program.flows.length, 2);
      assert.equal(program.flows[0]!.name, "a");
      assert.equal(program.flows[1]!.name, "b");
    });

    it("rejects flow without name", () => {
      assert.throws(() => parse("flow {}"), ParseError);
    });

    it("rejects flow without braces", () => {
      assert.throws(() => parse('flow "test"'), ParseError);
    });
  });

  // ─── Agent ───

  describe("Agent", () => {
    it("parses empty agent", () => {
      const agent = firstAgent('flow "t" { agent Foo {} }');
      assert.equal(agent.name, "Foo");
      assert.equal(agent.operations.length, 0);
    });

    it("parses agent with role", () => {
      const agent = firstAgent('flow "t" { agent A { role: "Expert analyst" } }');
      assert.equal(agent.meta.role, "Expert analyst");
    });

    it("parses agent with model", () => {
      const agent = firstAgent('flow "t" { agent A { model: "gpt-4o" } }');
      assert.equal(agent.meta.model, "gpt-4o");
    });

    it("parses agent with tools", () => {
      const agent = firstAgent('flow "t" { agent A { tools: [web_search, code_exec] } }');
      assert.deepEqual(agent.meta.tools, ["web_search", "code_exec"]);
    });

    it("parses agent with empty tools list", () => {
      const agent = firstAgent('flow "t" { agent A { tools: [] } }');
      assert.deepEqual(agent.meta.tools, []);
    });

    it("parses agent with all meta", () => {
      const agent = firstAgent(`flow "t" {
        agent Researcher {
          role: "Web researcher"
          model: "claude-sonnet"
          tools: [web_search]
          stake gather("test") -> @out
        }
      }`);
      assert.equal(agent.meta.role, "Web researcher");
      assert.equal(agent.meta.model, "claude-sonnet");
      assert.deepEqual(agent.meta.tools, ["web_search"]);
      assert.equal(agent.operations.length, 1);
    });

    it("parses multiple agents", () => {
      const flow = firstFlow(`flow "t" {
        agent A { commit }
        agent B { commit }
        agent C { commit }
      }`);
      const agents = flow.body.filter((n): n is AgentDecl => n.type === "AgentDecl");
      assert.equal(agents.length, 3);
      assert.deepEqual(agents.map(a => a.name), ["A", "B", "C"]);
    });
  });

  // ─── Stake ───

  describe("Stake", () => {
    it("parses stake with no args", () => {
      const op = firstOp<StakeOp>(
        'flow "t" { agent A { stake run() -> @out } }',
        "StakeOp",
      );
      assert.equal(op.call.name, "run");
      assert.equal(op.call.args.length, 0);
      assert.deepEqual(op.recipients, [{ ref: "out" }]);
    });

    it("parses stake with positional string arg", () => {
      const op = firstOp<StakeOp>(
        'flow "t" { agent A { stake greet("world") -> @out } }',
        "StakeOp",
      );
      assert.equal(op.call.args.length, 1);
      assert.equal(op.call.args[0]!.name, undefined);
      assert.equal((op.call.args[0]!.value as StringLit).value, "world");
    });

    it("parses stake with named args", () => {
      const op = firstOp<StakeOp>(
        'flow "t" { agent A { stake gather(topic: "AI", depth: 3) -> @B } }',
        "StakeOp",
      );
      assert.equal(op.call.args.length, 2);
      assert.equal(op.call.args[0]!.name, "topic");
      assert.equal((op.call.args[0]!.value as StringLit).value, "AI");
      assert.equal(op.call.args[1]!.name, "depth");
      assert.equal((op.call.args[1]!.value as NumberLit).value, 3);
    });

    it("parses stake with list arg", () => {
      const op = firstOp<StakeOp>(
        'flow "t" { agent A { stake gather(items: ["a", "b"]) -> @B } }',
        "StakeOp",
      );
      const list = op.call.args[0]!.value as ListLit;
      assert.equal(list.type, "ListLit");
      assert.equal(list.elements.length, 2);
    });

    it("parses stake with multiple recipients", () => {
      const op = firstOp<StakeOp>(
        'flow "t" { agent A { stake run() -> @B, @C } }',
        "StakeOp",
      );
      assert.equal(op.recipients.length, 2);
      assert.equal(op.recipients[0]!.ref, "B");
      assert.equal(op.recipients[1]!.ref, "C");
    });

    it("parses stake to @all", () => {
      const op = firstOp<StakeOp>(
        'flow "t" { agent A { stake notify() -> @all } }',
        "StakeOp",
      );
      assert.deepEqual(op.recipients, [{ ref: "all" }]);
    });

    it("parses stake with condition", () => {
      const op = firstOp<StakeOp>(
        'flow "t" { agent A { stake run() -> @B if ready } }',
        "StakeOp",
      );
      assert.ok(op.condition);
      assert.equal((op.condition as Ident).name, "ready");
    });
  });

  // ─── Await ───

  describe("Await", () => {
    it("parses basic await", () => {
      const op = firstOp<AwaitOp>(
        'flow "t" { agent B { await data <- @A } }',
        "AwaitOp",
      );
      assert.equal(op.binding, "data");
      assert.equal(op.sources.length, 1);
      assert.equal(op.sources[0]!.ref, "A");
    });

    it("parses await from wildcard", () => {
      const op = firstOp<AwaitOp>(
        'flow "t" { agent B { await data <- * } }',
        "AwaitOp",
      );
      assert.equal(op.sources[0]!.ref, "*");
    });

    it("parses await from multiple sources", () => {
      const op = firstOp<AwaitOp>(
        'flow "t" { agent C { await data <- @A, @B } }',
        "AwaitOp",
      );
      assert.equal(op.sources.length, 2);
      assert.equal(op.sources[0]!.ref, "A");
      assert.equal(op.sources[1]!.ref, "B");
    });

    it("parses await with options", () => {
      const op = firstOp<AwaitOp>(
        'flow "t" { agent C { await results <- @Workers (limit: 3) } }',
        "AwaitOp",
      );
      assert.ok(op.options["limit"]);
      assert.equal((op.options["limit"] as NumberLit).value, 3);
    });
  });

  // ─── Commit ───

  describe("Commit", () => {
    it("parses bare commit", () => {
      const op = firstOp<CommitOp>(
        'flow "t" { agent A { commit } }',
        "CommitOp",
      );
      assert.equal(op.value, undefined);
      assert.equal(op.condition, undefined);
    });

    it("parses commit with value", () => {
      const op = firstOp<CommitOp>(
        'flow "t" { agent A { commit result } }',
        "CommitOp",
      );
      assert.ok(op.value);
      assert.equal((op.value as Ident).name, "result");
    });

    it("parses commit with condition", () => {
      const op = firstOp<CommitOp>(
        'flow "t" { agent A { commit result if result.score > 0.8 } }',
        "CommitOp",
      );
      assert.ok(op.value);
      assert.ok(op.condition);
      const cond = op.condition as BinaryExpr;
      assert.equal(cond.op, ">");
    });

    it("parses commit with dot access value and condition", () => {
      const op = firstOp<CommitOp>(
        'flow "t" { agent A { commit verdict if verdict.confidence > 0.7 } }',
        "CommitOp",
      );
      const val = op.value as Ident;
      assert.equal(val.name, "verdict");
      const cond = op.condition as BinaryExpr;
      assert.equal(cond.op, ">");
      const left = cond.left as DotAccess;
      assert.equal(left.property, "confidence");
    });
  });

  // ─── Escalate ───

  describe("Escalate", () => {
    it("parses basic escalate", () => {
      const op = firstOp<EscalateOp>(
        'flow "t" { agent A { escalate @Human } }',
        "EscalateOp",
      );
      assert.equal(op.target, "Human");
      assert.equal(op.reason, undefined);
      assert.equal(op.condition, undefined);
    });

    it("parses escalate with reason", () => {
      const op = firstOp<EscalateOp>(
        'flow "t" { agent A { escalate @Human reason: "need help" } }',
        "EscalateOp",
      );
      assert.equal(op.target, "Human");
      assert.equal(op.reason, "need help");
    });

    it("parses escalate with condition", () => {
      const op = firstOp<EscalateOp>(
        'flow "t" { agent A { escalate @Arbiter if confidence < 0.5 } }',
        "EscalateOp",
      );
      assert.equal(op.target, "Arbiter");
      assert.ok(op.condition);
    });

    it("parses escalate with reason and condition", () => {
      const op = firstOp<EscalateOp>(
        'flow "t" { agent A { escalate @Human reason: "low conf" if score < 0.3 } }',
        "EscalateOp",
      );
      assert.equal(op.reason, "low conf");
      assert.ok(op.condition);
    });
  });

  // ─── When Block ───

  describe("When Block", () => {
    it("parses when block with operations", () => {
      const op = firstOp<WhenBlock>(`flow "t" {
        agent A {
          when feedback.approved {
            commit feedback
          }
        }
      }`, "WhenBlock");
      assert.ok(op.condition);
      assert.equal(op.body.length, 1);
      assert.equal(op.body[0]!.type, "CommitOp");
    });

    it("parses when block with multiple operations", () => {
      const op = firstOp<WhenBlock>(`flow "t" {
        agent A {
          when feedback.rejected {
            stake revise(feedback) -> @Reviewer
            escalate @Human reason: "revision needed"
          }
        }
      }`, "WhenBlock");
      assert.equal(op.body.length, 2);
      assert.equal(op.body[0]!.type, "StakeOp");
      assert.equal(op.body[1]!.type, "EscalateOp");
    });
  });

  // ─── Flow Constraints ───

  describe("Flow Constraints", () => {
    it("parses converge statement", () => {
      const flow = firstFlow('flow "t" { converge when: committed_count >= 1 }');
      const converge = flow.body.find((n): n is ConvergeStmt => n.type === "ConvergeStmt");
      assert.ok(converge);
      const expr = converge.condition as BinaryExpr;
      assert.equal(expr.op, ">=");
    });

    it("parses converge with all_committed", () => {
      const flow = firstFlow('flow "t" { converge when: all_committed }');
      const converge = flow.body.find((n): n is ConvergeStmt => n.type === "ConvergeStmt");
      assert.ok(converge);
      assert.equal((converge.condition as Ident).name, "all_committed");
    });

    it("parses budget with tokens", () => {
      const flow = firstFlow('flow "t" { budget: tokens(50000) }');
      const budget = flow.body.find((n): n is BudgetStmt => n.type === "BudgetStmt");
      assert.ok(budget);
      assert.equal(budget.items.length, 1);
      assert.equal(budget.items[0]!.kind, "tokens");
      assert.equal((budget.items[0]!.value as NumberLit).value, 50000);
    });

    it("parses budget with multiple items", () => {
      const flow = firstFlow('flow "t" { budget: tokens(40000), rounds(5) }');
      const budget = flow.body.find((n): n is BudgetStmt => n.type === "BudgetStmt");
      assert.ok(budget);
      assert.equal(budget.items.length, 2);
      assert.equal(budget.items[0]!.kind, "tokens");
      assert.equal(budget.items[1]!.kind, "rounds");
    });

    it("parses budget with time", () => {
      const flow = firstFlow('flow "t" { budget: time(60) }');
      const budget = flow.body.find((n): n is BudgetStmt => n.type === "BudgetStmt");
      assert.ok(budget);
      assert.equal(budget.items[0]!.kind, "time");
    });
  });

  // ─── Import ───

  describe("Import", () => {
    it("parses import statement", () => {
      const flow = firstFlow('flow "t" { import "research" as research_flow }');
      const imp = flow.body.find((n): n is ImportStmt => n.type === "ImportStmt");
      assert.ok(imp);
      assert.equal(imp.path, "research");
      assert.equal(imp.alias, "research_flow");
    });
  });

  // ─── Expressions ───

  describe("Expressions", () => {
    it("parses dot access chain", () => {
      const op = firstOp<CommitOp>(
        'flow "t" { agent A { commit result.data.value } }',
        "CommitOp",
      );
      const expr = op.value as DotAccess;
      assert.equal(expr.type, "DotAccess");
      assert.equal(expr.property, "value");
      const inner = expr.object as DotAccess;
      assert.equal(inner.property, "data");
    });

    it("parses boolean literals in conditions", () => {
      const op = firstOp<CommitOp>(
        'flow "t" { agent A { commit result if true } }',
        "CommitOp",
      );
      assert.ok(op.condition);
      assert.equal((op.condition as BoolLit).value, true);
    });

    it("parses complex binary expressions", () => {
      const flow = firstFlow('flow "t" { converge when: committed_count >= 1 && round < 10 }');
      const converge = flow.body.find((n): n is ConvergeStmt => n.type === "ConvergeStmt");
      const expr = converge!.condition as BinaryExpr;
      assert.equal(expr.op, "&&");
    });

    it("parses OR expressions", () => {
      const flow = firstFlow('flow "t" { converge when: all_committed || round >= 5 }');
      const converge = flow.body.find((n): n is ConvergeStmt => n.type === "ConvergeStmt");
      const expr = converge!.condition as BinaryExpr;
      assert.equal(expr.op, "||");
    });

    it("parses agent ref in expression", () => {
      const flow = firstFlow('flow "t" { converge when: @Analyst.committed }');
      const converge = flow.body.find((n): n is ConvergeStmt => n.type === "ConvergeStmt");
      const expr = converge!.condition as DotAccess;
      assert.equal(expr.property, "committed");
      assert.equal((expr.object as AgentRef).name, "Analyst");
    });

    it("parses != operator", () => {
      const flow = firstFlow('flow "t" { converge when: committed_count != 0 }');
      const converge = flow.body.find((n): n is ConvergeStmt => n.type === "ConvergeStmt");
      const expr = converge!.condition as BinaryExpr;
      assert.equal(expr.op, "!=");
    });

    it("parses == operator", () => {
      const flow = firstFlow('flow "t" { converge when: round == 3 }');
      const converge = flow.body.find((n): n is ConvergeStmt => n.type === "ConvergeStmt");
      const expr = converge!.condition as BinaryExpr;
      assert.equal(expr.op, "==");
    });
  });

  // ─── Full Flow Parsing ───

  describe("Full Flows", () => {
    it("parses minimal hello flow", () => {
      const flow = firstFlow(`
        flow "hello" {
          agent Greeter {
            stake greet("world") -> @out
            commit
          }
          converge when: all_committed
        }
      `);
      assert.equal(flow.name, "hello");
      const agents = flow.body.filter((n): n is AgentDecl => n.type === "AgentDecl");
      assert.equal(agents.length, 1);
      assert.equal(agents[0]!.operations.length, 2);
    });

    it("parses two-agent review flow", () => {
      const flow = firstFlow(`
        flow "review" {
          agent Writer {
            stake write(topic: "test") -> @Reviewer
            await feedback <- @Reviewer
            commit feedback if feedback.approved
          }
          agent Reviewer {
            await draft <- @Writer
            stake review(draft) -> @Writer
          }
          converge when: committed_count >= 1
          budget: rounds(3)
        }
      `);
      const agents = flow.body.filter((n): n is AgentDecl => n.type === "AgentDecl");
      assert.equal(agents.length, 2);
      assert.equal(agents[0]!.name, "Writer");
      assert.equal(agents[1]!.name, "Reviewer");
      assert.equal(agents[0]!.operations.length, 3);
      assert.equal(agents[1]!.operations.length, 2);
    });

    it("parses three-agent research flow with escalation", () => {
      const flow = firstFlow(`
        flow "research" {
          agent Researcher {
            role: "Web researcher"
            tools: [web_search]
            stake gather(topic: "quantum") -> @Analyst
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
        }
      `);
      const agents = flow.body.filter((n): n is AgentDecl => n.type === "AgentDecl");
      assert.equal(agents.length, 3);
      assert.equal(agents[0]!.meta.role, "Web researcher");
      assert.deepEqual(agents[0]!.meta.tools, ["web_search"]);

      // Analyst has: await, stake, await, commit, escalate = 5 ops
      assert.equal(agents[1]!.operations.length, 5);
      assert.equal(agents[1]!.operations[4]!.type, "EscalateOp");
    });

    it("parses flow with when blocks", () => {
      const flow = firstFlow(`
        flow "article" {
          agent Writer {
            stake write(topic: "test") -> @Reviewer
            await feedback <- @Reviewer
            when feedback.approved {
              commit feedback
            }
            when feedback.rejected {
              stake revise(feedback) -> @Reviewer
            }
          }
          agent Reviewer {
            await draft <- @Writer
            stake review(draft, criteria: ["clarity"]) -> @Writer
          }
          converge when: committed_count >= 1
          budget: rounds(3)
        }
      `);
      const writer = flow.body.find((n): n is AgentDecl => n.type === "AgentDecl" && n.name === "Writer")!;
      assert.equal(writer.operations.length, 4); // stake, await, when, when
      assert.equal(writer.operations[2]!.type, "WhenBlock");
      assert.equal(writer.operations[3]!.type, "WhenBlock");
    });
  });

  // ─── Error Cases ───

  describe("Error Cases", () => {
    it("throws on missing agent name", () => {
      assert.throws(() => parse('flow "t" { agent { } }'), ParseError);
    });

    it("throws on invalid operation keyword", () => {
      assert.throws(() => parse('flow "t" { agent A { foobar } }'), ParseError);
    });

    it("throws on missing arrow in stake", () => {
      assert.throws(() => parse('flow "t" { agent A { stake run() @out } }'), ParseError);
    });

    it("throws on missing source in await", () => {
      assert.throws(() => parse('flow "t" { agent A { await data } }'), ParseError);
    });

    it("throws on unexpected top-level item in flow body", () => {
      assert.throws(() => parse('flow "t" { foobar }'), ParseError);
    });
  });
});
