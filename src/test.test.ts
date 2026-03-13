import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tokenize, TokenType } from "./lexer.js";
import { parse } from "./parser.js";
import { testFlow, type TestResult, type RuntimeEvent } from "./runtime.js";
import { createMockAdapter, createEchoAdapter } from "./adapter.js";
import type { ExpectStmt, BinaryExpr } from "./ast.js";

// ─── Helpers ───

function firstFlow(source: string) {
  const program = parse(source);
  return program.flows[0]!;
}

// ─── Lexer: expect & contains tokens ───

describe("Test & Quality", () => {

  describe("Lexer — expect and contains tokens", () => {
    it("tokenizes expect keyword", () => {
      const tokens = tokenize("expect");
      assert.equal(tokens[0]!.type, TokenType.Expect);
      assert.equal(tokens[0]!.value, "expect");
    });

    it("tokenizes contains keyword", () => {
      const tokens = tokenize("contains");
      assert.equal(tokens[0]!.type, TokenType.Contains);
      assert.equal(tokens[0]!.value, "contains");
    });

    it("tokenizes expect with expression", () => {
      const tokens = tokenize('expect @Agent.output contains "hello"');
      assert.equal(tokens[0]!.type, TokenType.Expect);
      assert.equal(tokens[1]!.type, TokenType.AgentRef);
      assert.equal(tokens[2]!.type, TokenType.Dot);
      assert.equal(tokens[3]!.type, TokenType.Output); // 'output' is a keyword token
      assert.equal(tokens[4]!.type, TokenType.Contains);
      assert.equal(tokens[5]!.type, TokenType.String);
    });
  });

  // ─── Parser: expect statements ───

  describe("Parser — expect statements", () => {
    it("parses expect with contains expression", () => {
      const flow = firstFlow(`
        flow "test" {
          agent A { stake work() -> @out  commit }
          expect @A.output contains "hello"
        }
      `);
      const expectStmt = flow.body.find((n): n is ExpectStmt => n.type === "ExpectStmt");
      assert.ok(expectStmt, "Expected an ExpectStmt");
      assert.equal(expectStmt.expr.type, "BinaryExpr");
      const binExpr = expectStmt.expr as BinaryExpr;
      assert.equal(binExpr.op, "contains");
    });

    it("parses expect with equality", () => {
      const flow = firstFlow(`
        flow "test" {
          agent A { stake work() -> @out  commit }
          expect @A.committed == true
        }
      `);
      const expectStmt = flow.body.find((n): n is ExpectStmt => n.type === "ExpectStmt");
      assert.ok(expectStmt);
      assert.equal(expectStmt.expr.type, "BinaryExpr");
      assert.equal((expectStmt.expr as BinaryExpr).op, "==");
    });

    it("parses expect with dot access", () => {
      const flow = firstFlow(`
        flow "test" {
          agent A { stake work() -> @out  commit }
          expect @A.committed
        }
      `);
      const expectStmt = flow.body.find((n): n is ExpectStmt => n.type === "ExpectStmt");
      assert.ok(expectStmt);
      assert.equal(expectStmt.expr.type, "DotAccess");
    });

    it("parses multiple expect statements", () => {
      const flow = firstFlow(`
        flow "test" {
          agent A { stake work() -> @out  commit }
          expect @A.committed == true
          expect @A.output contains "test"
        }
      `);
      const expectStmts = flow.body.filter((n): n is ExpectStmt => n.type === "ExpectStmt");
      assert.equal(expectStmts.length, 2);
    });

    it("parses expect alongside other flow body items", () => {
      const flow = firstFlow(`
        flow "test" {
          agent A { stake work() -> @out  commit }
          converge when: all_committed
          budget: rounds(5)
          expect @A.committed == true
        }
      `);
      const expectStmts = flow.body.filter((n): n is ExpectStmt => n.type === "ExpectStmt");
      assert.equal(expectStmts.length, 1);
      assert.ok(flow.body.some((n) => n.type === "ConvergeStmt"));
      assert.ok(flow.body.some((n) => n.type === "BudgetStmt"));
    });
  });

  // ─── Mock Adapter ───

  describe("Mock Adapter", () => {
    it("returns agent-specific responses", async () => {
      const adapter = createMockAdapter({
        responses: {
          Writer: "Hello from Writer",
          Reviewer: "Looks good!",
        },
      });

      // Simulate a call from Writer
      const res = await adapter.call([
        { role: "system", content: 'You are agent "Writer" in a SLANG workflow.' },
        { role: "user", content: "Execute." },
      ]);
      assert.equal(res.content, "Hello from Writer");
    });

    it("returns default response for unknown agents", async () => {
      const adapter = createMockAdapter({
        responses: { Writer: "Hello" },
        defaultResponse: "Default mock",
      });

      const res = await adapter.call([
        { role: "system", content: 'You are agent "Unknown" in a SLANG workflow.' },
        { role: "user", content: "Execute." },
      ]);
      assert.equal(res.content, "Default mock");
    });

    it("returns zero tokens used", async () => {
      const adapter = createMockAdapter({ responses: {} });
      const res = await adapter.call([{ role: "user", content: "test" }]);
      assert.equal(res.tokensUsed, 0);
    });
  });

  // ─── testFlow ───

  describe("testFlow — test runner", () => {
    it("passes when expect assertions are true", async () => {
      const result = await testFlow(`
        flow "test-pass" {
          agent Writer {
            stake write("hello world") -> @out
            commit
          }
          converge when: all_committed
          expect @Writer.committed == true
        }
      `, {
        adapter: createMockAdapter({
          responses: { Writer: "hello world" },
        }),
      });

      assert.equal(result.passed, true);
      assert.equal(result.assertions.length, 1);
      assert.equal(result.assertions[0]!.passed, true);
      assert.equal(result.flowName, "test-pass");
    });

    it("fails when expect assertions are false", async () => {
      const result = await testFlow(`
        flow "test-fail" {
          agent Writer {
            stake write("hello") -> @out
            commit
          }
          converge when: all_committed
          expect @Writer.committed == false
        }
      `, {
        adapter: createMockAdapter({
          responses: { Writer: "hello" },
        }),
      });

      assert.equal(result.passed, false);
      assert.equal(result.assertions.length, 1);
      assert.equal(result.assertions[0]!.passed, false);
    });

    it("evaluates contains assertions", async () => {
      const result = await testFlow(`
        flow "test-contains" {
          agent Writer {
            stake write("hello world") -> @out
            commit
          }
          converge when: all_committed
          expect @Writer.output contains "world"
        }
      `, {
        adapter: createMockAdapter({
          responses: { Writer: "hello world! The world is great." },
        }),
      });

      assert.equal(result.passed, true);
      assert.equal(result.assertions[0]!.passed, true);
    });

    it("fails contains when substring not found", async () => {
      const result = await testFlow(`
        flow "test-no-match" {
          agent Writer {
            stake write("hello") -> @out
            commit
          }
          converge when: all_committed
          expect @Writer.output contains "notfound"
        }
      `, {
        adapter: createMockAdapter({
          responses: { Writer: "hello world" },
        }),
      });

      assert.equal(result.passed, false);
    });

    it("evaluates multiple assertions", async () => {
      const result = await testFlow(`
        flow "test-multi" {
          agent Writer {
            stake write("topic") -> @out
            commit
          }
          converge when: all_committed
          expect @Writer.committed == true
          expect @Writer.output contains "MOCK"
          expect @Writer.status == "committed"
        }
      `, {
        adapter: createMockAdapter({
          responses: {},
          defaultResponse: "[MOCK] Default response\nCONFIDENCE: 0.9",
        }),
      });

      assert.equal(result.passed, true);
      assert.equal(result.assertions.length, 3);
      assert.ok(result.assertions.every((a) => a.passed));
    });

    it("emits expect_pass and expect_fail events", async () => {
      const events: RuntimeEvent[] = [];
      await testFlow(`
        flow "test-events" {
          agent Writer {
            stake write("hi") -> @out
            commit
          }
          converge when: all_committed
          expect @Writer.committed == true
          expect @Writer.output contains "notfound"
        }
      `, {
        adapter: createMockAdapter({
          responses: { Writer: "hello" },
        }),
        onEvent: (ev) => events.push(ev),
      });

      const passEvents = events.filter((e) => e.type === "expect_pass");
      const failEvents = events.filter((e) => e.type === "expect_fail");
      assert.equal(passEvents.length, 1);
      assert.equal(failEvents.length, 1);
    });

    it("returns error when flow execution fails", async () => {
      const result = await testFlow("", {
        adapter: createEchoAdapter(),
      });
      assert.equal(result.passed, false);
      assert.ok(result.error);
    });

    it("returns flow state after test", async () => {
      const result = await testFlow(`
        flow "test-state" {
          agent A {
            stake work() -> @out
            commit
          }
          converge when: all_committed
          expect @A.committed == true
        }
      `, {
        adapter: createMockAdapter({ responses: {} }),
      });

      assert.ok(result.state);
      assert.equal(result.state!.status, "converged");
    });

    it("works with multi-agent flows", async () => {
      const result = await testFlow(`
        flow "test-multi-agent" {
          agent Writer {
            stake write("topic") -> @Reviewer
            await feedback <- @Reviewer
            commit
          }
          agent Reviewer {
            await draft <- @Writer
            stake review("the draft") -> @Writer
            commit
          }
          converge when: all_committed
          expect @Writer.committed == true
          expect @Reviewer.committed == true
        }
      `, {
        adapter: createMockAdapter({
          responses: {
            Writer: "Draft content",
            Reviewer: "Looks good! CONFIDENCE: 0.95",
          },
        }),
      });

      assert.equal(result.passed, true);
      assert.equal(result.assertions.length, 2);
    });
  });

  // ─── contains as expression operator ───

  describe("contains operator in expressions", () => {
    it("contains works in when blocks", async () => {
      const result = await testFlow(`
        flow "test-when-contains" {
          agent A {
            stake greet("hi") -> @out
            when @A.output contains "approved" {
              commit
            }
            commit
          }
          converge when: all_committed
          expect @A.committed == true
        }
      `, {
        adapter: createMockAdapter({
          responses: { A: "Request approved!" },
        }),
      });

      assert.equal(result.passed, true);
    });
  });
});
