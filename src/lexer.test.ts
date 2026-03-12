import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tokenize, TokenType, LexerError } from "./lexer.js";

describe("Lexer", () => {
  // ─── Basic Tokens ───

  it("tokenizes empty input", () => {
    const tokens = tokenize("");
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0]!.type, TokenType.EOF);
  });

  it("tokenizes keywords", () => {
    const keywords = ["flow", "agent", "stake", "await", "commit", "escalate",
      "import", "as", "when", "if", "converge", "budget", "role", "model",
      "tools", "tokens", "rounds", "time", "count", "reason", "true", "false",
      "retry", "output"];

    for (const kw of keywords) {
      const tokens = tokenize(kw);
      assert.equal(tokens[0]!.type, kw, `keyword '${kw}' should tokenize`);
      assert.equal(tokens[0]!.value, kw);
    }
  });

  it("tokenizes identifiers distinct from keywords", () => {
    const tokens = tokenize("myAgent fooBar _private x123");
    assert.equal(tokens.filter(t => t.type === TokenType.Ident).length, 4);
    assert.equal(tokens[0]!.value, "myAgent");
    assert.equal(tokens[1]!.value, "fooBar");
    assert.equal(tokens[2]!.value, "_private");
    assert.equal(tokens[3]!.value, "x123");
  });

  it("tokenizes string literals", () => {
    const tokens = tokenize('"hello world"');
    assert.equal(tokens[0]!.type, TokenType.String);
    assert.equal(tokens[0]!.value, "hello world");
  });

  it("tokenizes string with escape sequences", () => {
    const tokens = tokenize('"line1\\nline2\\t\\"quoted\\""');
    assert.equal(tokens[0]!.type, TokenType.String);
    assert.equal(tokens[0]!.value, 'line1\nline2\t"quoted"');
  });

  it("throws on unterminated string", () => {
    assert.throws(() => tokenize('"unterminated'), LexerError);
  });

  it("tokenizes integer numbers", () => {
    const tokens = tokenize("42 0 100");
    assert.equal(tokens[0]!.type, TokenType.Number);
    assert.equal(tokens[0]!.value, "42");
    assert.equal(tokens[1]!.value, "0");
    assert.equal(tokens[2]!.value, "100");
  });

  it("tokenizes decimal numbers", () => {
    const tokens = tokenize("3.14 0.8");
    assert.equal(tokens[0]!.type, TokenType.Number);
    assert.equal(tokens[0]!.value, "3.14");
    assert.equal(tokens[1]!.value, "0.8");
  });

  it("tokenizes agent references", () => {
    const tokens = tokenize("@Analyst @Human @all @out @any");
    assert.equal(tokens.filter(t => t.type === TokenType.AgentRef).length, 5);
    assert.equal(tokens[0]!.value, "Analyst");
    assert.equal(tokens[1]!.value, "Human");
    assert.equal(tokens[2]!.value, "all");
    assert.equal(tokens[3]!.value, "out");
    assert.equal(tokens[4]!.value, "any");
  });

  it("throws on bare @", () => {
    assert.throws(() => tokenize("@ "), LexerError);
  });

  // ─── Punctuation ───

  it("tokenizes punctuation", () => {
    const tokens = tokenize("{ } ( ) [ ] : , . *");
    const types = tokens.slice(0, -1).map(t => t.type);
    assert.deepEqual(types, [
      TokenType.LBrace, TokenType.RBrace,
      TokenType.LParen, TokenType.RParen,
      TokenType.LBracket, TokenType.RBracket,
      TokenType.Colon, TokenType.Comma,
      TokenType.Dot, TokenType.Star,
    ]);
  });

  // ─── Operators ───

  it("tokenizes arrow operators", () => {
    const tokens = tokenize("-> <-");
    assert.equal(tokens[0]!.type, TokenType.Arrow);
    assert.equal(tokens[1]!.type, TokenType.BackArrow);
  });

  it("tokenizes comparison operators", () => {
    const tokens = tokenize("> >= < <= == !=");
    const types = tokens.slice(0, -1).map(t => t.type);
    assert.deepEqual(types, [
      TokenType.Gt, TokenType.Gte,
      TokenType.Lt, TokenType.Lte,
      TokenType.EqEq, TokenType.Neq,
    ]);
  });

  it("tokenizes logical operators", () => {
    const tokens = tokenize("&& ||");
    assert.equal(tokens[0]!.type, TokenType.And);
    assert.equal(tokens[1]!.type, TokenType.Or);
  });

  // ─── Comments ───

  it("skips single-line comments", () => {
    const tokens = tokenize("flow -- this is a comment\nagent");
    assert.equal(tokens[0]!.type, TokenType.Flow);
    assert.equal(tokens[1]!.type, TokenType.Agent);
  });

  it("skips inline comments", () => {
    const tokens = tokenize('stake gather("test") -- gather data\n-> @Analyst');
    assert.equal(tokens[0]!.type, TokenType.Stake);
    // Should have gather, (, "test", ), ->, @Analyst
    const types = tokens.slice(0, -1).map(t => t.type);
    assert.ok(types.includes(TokenType.Arrow));
    assert.ok(types.includes(TokenType.AgentRef));
  });

  // ─── Whitespace ───

  it("handles various whitespace", () => {
    const tokens = tokenize("flow\t\n\r\n  agent");
    assert.equal(tokens[0]!.type, TokenType.Flow);
    assert.equal(tokens[1]!.type, TokenType.Agent);
  });

  // ─── Position Tracking ───

  it("tracks line and column numbers", () => {
    const tokens = tokenize('flow "test" {\n  agent Foo {\n  }\n}');
    assert.equal(tokens[0]!.line, 1);
    assert.equal(tokens[0]!.column, 1);
    // "test" is at line 1, col 6
    assert.equal(tokens[1]!.line, 1);
    assert.equal(tokens[1]!.column, 6);
    // agent is on line 2
    assert.equal(tokens[3]!.line, 2);
  });

  // ─── Error Cases ───

  it("throws on unexpected character", () => {
    assert.throws(() => tokenize("flow ~"), LexerError);
  });

  // ─── Complex Tokenization ───

  it("tokenizes a complete minimal flow", () => {
    const source = `flow "hello" {
  agent Greeter {
    stake greet("world") -> @out
    commit
  }
  converge when: all_committed
}`;
    const tokens = tokenize(source);
    const types = tokens.slice(0, -1).map(t => t.type);
    assert.ok(types.includes(TokenType.Flow));
    assert.ok(types.includes(TokenType.Agent));
    assert.ok(types.includes(TokenType.Stake));
    assert.ok(types.includes(TokenType.Commit));
    assert.ok(types.includes(TokenType.Converge));
    assert.ok(types.includes(TokenType.When));
    assert.equal(tokens[tokens.length - 1]!.type, TokenType.EOF);
  });

  it("tokenizes budget declaration", () => {
    const tokens = tokenize("budget: tokens(50000), rounds(5)");
    const types = tokens.slice(0, -1).map(t => t.type);
    assert.ok(types.includes(TokenType.Budget));
    assert.ok(types.includes(TokenType.Tokens));
    assert.ok(types.includes(TokenType.Rounds));
  });

  it("tokenizes conditional expressions", () => {
    const tokens = tokenize("commit result if result.confidence > 0.8");
    const types = tokens.slice(0, -1).map(t => t.type);
    assert.deepEqual(types, [
      TokenType.Commit, TokenType.Ident, TokenType.If,
      TokenType.Ident, TokenType.Dot, TokenType.Ident,
      TokenType.Gt, TokenType.Number,
    ]);
  });

  it("tokenizes await with wildcard source", () => {
    const tokens = tokenize("await data <- *");
    assert.equal(tokens[0]!.type, TokenType.Await);
    assert.equal(tokens[1]!.type, TokenType.Ident);
    assert.equal(tokens[2]!.type, TokenType.BackArrow);
    assert.equal(tokens[3]!.type, TokenType.Star);
  });

  it("tokenizes list literals", () => {
    const tokens = tokenize('["a", "b", "c"]');
    assert.equal(tokens[0]!.type, TokenType.LBracket);
    assert.equal(tokens[1]!.type, TokenType.String);
    assert.equal(tokens[tokens.length - 2]!.type, TokenType.RBracket);
  });

  it("tokenizes import statement", () => {
    const tokens = tokenize('import "research" as research_flow');
    assert.equal(tokens[0]!.type, TokenType.Import);
    assert.equal(tokens[1]!.type, TokenType.String);
    assert.equal(tokens[1]!.value, "research");
    assert.equal(tokens[2]!.type, TokenType.As);
    assert.equal(tokens[3]!.type, TokenType.Ident);
  });

  it("tokenizes escalate with reason", () => {
    const tokens = tokenize('escalate @Human reason: "needs review"');
    assert.equal(tokens[0]!.type, TokenType.Escalate);
    assert.equal(tokens[1]!.type, TokenType.AgentRef);
    assert.equal(tokens[2]!.type, TokenType.Reason);
    assert.equal(tokens[3]!.type, TokenType.Colon);
    assert.equal(tokens[4]!.type, TokenType.String);
  });

  // ─── v0.2 Keywords ───

  it("tokenizes retry keyword", () => {
    const tokens = tokenize("retry: 3");
    assert.equal(tokens[0]!.type, TokenType.Retry);
    assert.equal(tokens[1]!.type, TokenType.Colon);
    assert.equal(tokens[2]!.type, TokenType.Number);
    assert.equal(tokens[2]!.value, "3");
  });

  it("tokenizes output keyword", () => {
    const tokens = tokenize('output: { approved: "boolean" }');
    assert.equal(tokens[0]!.type, TokenType.Output);
    assert.equal(tokens[1]!.type, TokenType.Colon);
    assert.equal(tokens[2]!.type, TokenType.LBrace);
    assert.equal(tokens[3]!.type, TokenType.Ident);
    assert.equal(tokens[3]!.value, "approved");
  });

  // ─── v0.6 Keywords ───

  it("tokenizes let keyword and = operator", () => {
    const tokens = tokenize('let summary = "hello"');
    assert.equal(tokens[0]!.type, TokenType.Let);
    assert.equal(tokens[1]!.type, TokenType.Ident);
    assert.equal(tokens[1]!.value, "summary");
    assert.equal(tokens[2]!.type, TokenType.Eq);
    assert.equal(tokens[3]!.type, TokenType.String);
    assert.equal(tokens[3]!.value, "hello");
  });

  it("tokenizes set keyword", () => {
    const tokens = tokenize('set total = 42');
    assert.equal(tokens[0]!.type, TokenType.Set);
    assert.equal(tokens[1]!.type, TokenType.Ident);
    assert.equal(tokens[2]!.type, TokenType.Eq);
    assert.equal(tokens[3]!.type, TokenType.Number);
  });

  it("tokenizes else keyword", () => {
    const tokens = tokenize("else {");
    assert.equal(tokens[0]!.type, TokenType.Else);
    assert.equal(tokens[1]!.type, TokenType.LBrace);
  });

  it("tokenizes otherwise keyword", () => {
    const tokens = tokenize("otherwise {");
    assert.equal(tokens[0]!.type, TokenType.Otherwise);
    assert.equal(tokens[1]!.type, TokenType.LBrace);
  });

  it("tokenizes repeat and until keywords", () => {
    const tokens = tokenize("repeat until done {");
    assert.equal(tokens[0]!.type, TokenType.Repeat);
    assert.equal(tokens[1]!.type, TokenType.Until);
    assert.equal(tokens[2]!.type, TokenType.Ident);
    assert.equal(tokens[3]!.type, TokenType.LBrace);
  });

  it("distinguishes = from ==", () => {
    const tokens = tokenize("x = 1 == 2");
    assert.equal(tokens[1]!.type, TokenType.Eq);
    assert.equal(tokens[3]!.type, TokenType.EqEq);
  });

  it("tokenizes deliver keyword", () => {
    const tokens = tokenize("deliver: save_file()");
    assert.equal(tokens[0]!.type, TokenType.Deliver);
    assert.equal(tokens[1]!.type, TokenType.Colon);
  });
});
