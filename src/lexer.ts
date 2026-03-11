// ─── SLANG Lexer / Tokenizer ───

import { SlangError, SlangErrorCode, formatErrorMessage } from "./errors.js";

export enum TokenType {
  // Literals
  String = "String",
  Number = "Number",

  // Identifiers & refs
  Ident = "Ident",
  AgentRef = "AgentRef", // @Name

  // Keywords
  Flow = "flow",
  Agent = "agent",
  Stake = "stake",
  Await = "await",
  Commit = "commit",
  Escalate = "escalate",
  Import = "import",
  As = "as",
  When = "when",
  If = "if",
  Converge = "converge",
  Budget = "budget",
  Role = "role",
  Model = "model",
  Tools = "tools",
  Tokens = "tokens",
  Rounds = "rounds",
  Time = "time",
  Count = "count",
  Reason = "reason",
  Retry = "retry",
  Output = "output",
  True = "true",
  False = "false",

  // Punctuation
  LBrace = "{",
  RBrace = "}",
  LParen = "(",
  RParen = ")",
  LBracket = "[",
  RBracket = "]",
  Colon = ":",
  Comma = ",",
  Arrow = "->",
  BackArrow = "<-",
  Dot = ".",
  Star = "*",

  // Operators
  Gt = ">",
  Gte = ">=",
  Lt = "<",
  Lte = "<=",
  EqEq = "==",
  Neq = "!=",
  And = "&&",
  Or = "||",

  // Special
  EOF = "EOF",
}

const KEYWORDS: Record<string, TokenType> = {
  flow: TokenType.Flow,
  agent: TokenType.Agent,
  stake: TokenType.Stake,
  await: TokenType.Await,
  commit: TokenType.Commit,
  escalate: TokenType.Escalate,
  import: TokenType.Import,
  as: TokenType.As,
  when: TokenType.When,
  if: TokenType.If,
  converge: TokenType.Converge,
  budget: TokenType.Budget,
  role: TokenType.Role,
  model: TokenType.Model,
  tools: TokenType.Tools,
  tokens: TokenType.Tokens,
  rounds: TokenType.Rounds,
  time: TokenType.Time,
  count: TokenType.Count,
  reason: TokenType.Reason,
  retry: TokenType.Retry,
  output: TokenType.Output,
  true: TokenType.True,
  false: TokenType.False,
};

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
  offset: number;
}

export class LexerError extends SlangError {
  constructor(
    code: SlangErrorCode,
    message: string,
    line: number,
    column: number,
    source?: string,
  ) {
    super(code, message, line, column, source);
    this.name = "LexerError";
  }
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  let line = 1;
  let column = 1;

  function peek(): string {
    return source[pos] ?? "\0";
  }

  function peekAt(offset: number): string {
    return source[pos + offset] ?? "\0";
  }

  function advance(): string {
    const ch = source[pos] ?? "\0";
    pos++;
    if (ch === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
    return ch;
  }

  function makeToken(type: TokenType, value: string, startLine: number, startCol: number, startOffset: number): Token {
    return { type, value, line: startLine, column: startCol, offset: startOffset };
  }

  while (pos < source.length) {
    const ch = peek();

    // Skip whitespace
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      advance();
      continue;
    }

    // Skip comments  --
    if (ch === "-" && peekAt(1) === "-") {
      // Check it's not ->
      while (pos < source.length && peek() !== "\n") {
        advance();
      }
      continue;
    }

    const startLine = line;
    const startCol = column;
    const startOffset = pos;

    // Two-char tokens
    if (ch === "-" && peekAt(1) === ">") {
      advance(); advance();
      tokens.push(makeToken(TokenType.Arrow, "->", startLine, startCol, startOffset));
      continue;
    }
    if (ch === "<" && peekAt(1) === "-") {
      advance(); advance();
      tokens.push(makeToken(TokenType.BackArrow, "<-", startLine, startCol, startOffset));
      continue;
    }
    if (ch === ">" && peekAt(1) === "=") {
      advance(); advance();
      tokens.push(makeToken(TokenType.Gte, ">=", startLine, startCol, startOffset));
      continue;
    }
    if (ch === "<" && peekAt(1) === "=") {
      advance(); advance();
      tokens.push(makeToken(TokenType.Lte, "<=", startLine, startCol, startOffset));
      continue;
    }
    if (ch === "=" && peekAt(1) === "=") {
      advance(); advance();
      tokens.push(makeToken(TokenType.EqEq, "==", startLine, startCol, startOffset));
      continue;
    }
    if (ch === "!" && peekAt(1) === "=") {
      advance(); advance();
      tokens.push(makeToken(TokenType.Neq, "!=", startLine, startCol, startOffset));
      continue;
    }
    if (ch === "&" && peekAt(1) === "&") {
      advance(); advance();
      tokens.push(makeToken(TokenType.And, "&&", startLine, startCol, startOffset));
      continue;
    }
    if (ch === "|" && peekAt(1) === "|") {
      advance(); advance();
      tokens.push(makeToken(TokenType.Or, "||", startLine, startCol, startOffset));
      continue;
    }

    // Single-char tokens
    const SINGLE_CHAR: Record<string, TokenType> = {
      "{": TokenType.LBrace,
      "}": TokenType.RBrace,
      "(": TokenType.LParen,
      ")": TokenType.RParen,
      "[": TokenType.LBracket,
      "]": TokenType.RBracket,
      ":": TokenType.Colon,
      ",": TokenType.Comma,
      ".": TokenType.Dot,
      "*": TokenType.Star,
      ">": TokenType.Gt,
      "<": TokenType.Lt,
    };

    if (SINGLE_CHAR[ch]) {
      advance();
      tokens.push(makeToken(SINGLE_CHAR[ch], ch, startLine, startCol, startOffset));
      continue;
    }

    // String literal
    if (ch === '"') {
      advance(); // opening quote
      let str = "";
      while (pos < source.length && peek() !== '"') {
        const c = advance();
        if (c === "\\") {
          const escaped = advance();
          if (escaped === "n") str += "\n";
          else if (escaped === "t") str += "\t";
          else if (escaped === '"') str += '"';
          else if (escaped === "\\") str += "\\";
          else str += escaped;
        } else {
          str += c;
        }
      }
      if (pos >= source.length) {
        throw new LexerError(
          SlangErrorCode.L100,
          formatErrorMessage(SlangErrorCode.L100),
          startLine, startCol, source,
        );
      }
      advance(); // closing quote
      tokens.push(makeToken(TokenType.String, str, startLine, startCol, startOffset));
      continue;
    }

    // Number literal
    if (ch >= "0" && ch <= "9") {
      let num = "";
      while (pos < source.length && peek() >= "0" && peek() <= "9") {
        num += advance();
      }
      if (peek() === "." && peekAt(1) >= "0" && peekAt(1) <= "9") {
        num += advance(); // the dot
        while (pos < source.length && peek() >= "0" && peek() <= "9") {
          num += advance();
        }
      }
      tokens.push(makeToken(TokenType.Number, num, startLine, startCol, startOffset));
      continue;
    }

    // Agent reference @Name
    if (ch === "@") {
      advance(); // skip @
      let name = "";
      while (pos < source.length && /[a-zA-Z_0-9]/.test(peek())) {
        name += advance();
      }
      if (name === "") {
        throw new LexerError(
          SlangErrorCode.L102,
          formatErrorMessage(SlangErrorCode.L102),
          startLine, startCol, source,
        );
      }
      tokens.push(makeToken(TokenType.AgentRef, name, startLine, startCol, startOffset));
      continue;
    }

    // Identifier / keyword
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = "";
      while (pos < source.length && /[a-zA-Z_0-9]/.test(peek())) {
        ident += advance();
      }
      const keyword = KEYWORDS[ident];
      if (keyword) {
        tokens.push(makeToken(keyword, ident, startLine, startCol, startOffset));
      } else {
        tokens.push(makeToken(TokenType.Ident, ident, startLine, startCol, startOffset));
      }
      continue;
    }

    throw new LexerError(
      SlangErrorCode.L101,
      formatErrorMessage(SlangErrorCode.L101, { char: ch }),
      startLine, startCol, source,
    );
  }

  tokens.push(makeToken(TokenType.EOF, "", line, column, pos));
  return tokens;
}
