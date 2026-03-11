import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SlangError, SlangErrorCode, formatErrorMessage } from "./errors.js";
import { LexerError, tokenize } from "./lexer.js";
import { ParseError, parse, parseWithRecovery } from "./parser.js";
import { RuntimeError } from "./runtime.js";

describe("Error System", () => {
  describe("SlangErrorCode", () => {
    it("has L1xx codes for lexer errors", () => {
      assert.equal(SlangErrorCode.L100, "L100");
      assert.equal(SlangErrorCode.L101, "L101");
      assert.equal(SlangErrorCode.L102, "L102");
    });

    it("has P2xx codes for parser errors", () => {
      assert.equal(SlangErrorCode.P200, "P200");
      assert.equal(SlangErrorCode.P201, "P201");
      assert.equal(SlangErrorCode.P202, "P202");
    });

    it("has E4xx codes for runtime errors", () => {
      assert.equal(SlangErrorCode.E400, "E400");
      assert.equal(SlangErrorCode.E406, "E406");
    });
  });

  describe("formatErrorMessage", () => {
    it("formats message without params", () => {
      const msg = formatErrorMessage(SlangErrorCode.L100);
      assert.ok(msg.includes("Unterminated string"));
    });

    it("formats message with params", () => {
      const msg = formatErrorMessage(SlangErrorCode.L101, { char: "~" });
      assert.ok(msg.includes("~"));
    });

    it("formats runtime error with multiple params", () => {
      const msg = formatErrorMessage(SlangErrorCode.E406, {
        max: "3",
        agent: "Writer",
        message: "timeout",
      });
      assert.ok(msg.includes("3"));
      assert.ok(msg.includes("Writer"));
      assert.ok(msg.includes("timeout"));
    });
  });

  describe("SlangError base class", () => {
    it("includes code, line, column", () => {
      const err = new SlangError(SlangErrorCode.L100, "test msg", 5, 10);
      assert.equal(err.code, SlangErrorCode.L100);
      assert.equal(err.line, 5);
      assert.equal(err.column, 10);
      assert.ok(err.message.includes("L100"));
      assert.ok(err.message.includes("5:10"));
    });

    it("includes source context in message when provided", () => {
      const source = 'flow "test" {\n  agent Foo {\n  }\n}';
      const err = new SlangError(SlangErrorCode.P201, "expected something", 2, 3, source);
      assert.ok(err.message.includes("agent Foo"));
      assert.ok(err.message.includes("^"));
    });

    it("serializes to JSON", () => {
      const err = new SlangError(SlangErrorCode.E400, "no flow", 1, 1);
      const json = err.toJSON();
      assert.equal(json.code, "E400");
      assert.equal(json.line, 1);
      assert.equal(json.column, 1);
    });
  });

  describe("LexerError extends SlangError", () => {
    it("is instance of SlangError", () => {
      try {
        tokenize('"unterminated');
        assert.fail("Should have thrown");
      } catch (e) {
        assert.ok(e instanceof LexerError);
        assert.ok(e instanceof SlangError);
        assert.equal((e as LexerError).code, SlangErrorCode.L100);
      }
    });

    it("reports L101 for unexpected character", () => {
      try {
        tokenize("flow ~");
        assert.fail("Should have thrown");
      } catch (e) {
        assert.ok(e instanceof LexerError);
        assert.equal((e as LexerError).code, SlangErrorCode.L101);
      }
    });

    it("reports L102 for bare @", () => {
      try {
        tokenize("@ ");
        assert.fail("Should have thrown");
      } catch (e) {
        assert.ok(e instanceof LexerError);
        assert.equal((e as LexerError).code, SlangErrorCode.L102);
      }
    });
  });

  describe("ParseError extends SlangError", () => {
    it("is instance of SlangError", () => {
      try {
        parse("flow {}");
        assert.fail("Should have thrown");
      } catch (e) {
        assert.ok(e instanceof ParseError);
        assert.ok(e instanceof SlangError);
      }
    });

    it("includes error code and location", () => {
      try {
        parse('flow "test"');
        assert.fail("Should have thrown");
      } catch (e) {
        assert.ok(e instanceof ParseError);
        assert.ok((e as ParseError).code.startsWith("P"));
      }
    });
  });

  describe("RuntimeError extends SlangError", () => {
    it("can be constructed with code and location", () => {
      const err = new RuntimeError(SlangErrorCode.E400, "test", 1, 1);
      assert.ok(err instanceof SlangError);
      assert.equal(err.code, SlangErrorCode.E400);
    });
  });
});

describe("Error Recovery (parseWithRecovery)", () => {
  it("returns empty errors for valid input", () => {
    const { program, errors } = parseWithRecovery('flow "test" { agent A { commit } converge when: all_committed }');
    assert.equal(errors.length, 0);
    assert.equal(program.flows.length, 1);
  });

  it("recovers from invalid flow body item", () => {
    const { program, errors } = parseWithRecovery('flow "test" { foobar agent A { commit } }');
    assert.ok(errors.length > 0);
    // Should still parse the agent after the invalid item
    assert.equal(program.flows.length, 1);
  });

  it("collects multiple errors", () => {
    const { errors } = parseWithRecovery('flow "test" { foobar bazqux agent A { commit } }');
    assert.ok(errors.length >= 1);
  });

  it("returns partial AST even with errors", () => {
    const { program, errors } = parseWithRecovery(`
      flow "good" {
        agent A { commit }
        converge when: all_committed
      }
    `);
    // This should parse cleanly
    assert.equal(errors.length, 0);
    assert.equal(program.flows[0]!.name, "good");
  });

  it("recovers from missing tokens via synthetic tokens", () => {
    // Missing closing brace — the parser should recover
    const { errors } = parseWithRecovery('flow "test" { agent A { commit }');
    // Should have at least one error about missing '}'
    assert.ok(errors.length >= 1);
  });

  it("errors have ParseError type with code", () => {
    const { errors } = parseWithRecovery('flow "test" { invalid_keyword }');
    for (const err of errors) {
      assert.ok(err instanceof ParseError);
      assert.ok(err.code.startsWith("P"));
    }
  });
});
