// ─── SLANG Parser: Tokens → AST ───

import { Token, TokenType, tokenize, LexerError } from "./lexer.js";
import type {
  Program, FlowDecl, FlowBodyItem, ImportStmt,
  AgentDecl, AgentMeta, Operation, StakeOp, AwaitOp,
  CommitOp, EscalateOp, WhenBlock, FuncCall, Argument,
  Recipient, Source, ConvergeStmt, BudgetStmt, BudgetItem,
  Expr, Span, Position,
} from "./ast.js";

export class ParseError extends Error {
  constructor(
    message: string,
    public token: Token,
  ) {
    super(`Parse error at ${token.line}:${token.column}: ${message} (got '${token.value}' [${token.type}])`);
    this.name = "ParseError";
  }
}

export function parse(source: string): Program {
  const tokens = tokenize(source);
  const parser = new Parser(tokens);
  return parser.parseProgram();
}

class Parser {
  private pos = 0;

  constructor(private tokens: Token[]) {}

  // ─── Token Helpers ───

  private peek(): Token {
    return this.tokens[this.pos]!;
  }

  private advance(): Token {
    const t = this.tokens[this.pos]!;
    this.pos++;
    return t;
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private match(...types: TokenType[]): Token | null {
    if (types.includes(this.peek().type)) {
      return this.advance();
    }
    return null;
  }

  private expect(type: TokenType, message?: string): Token {
    const t = this.peek();
    if (t.type !== type) {
      throw new ParseError(message ?? `Expected '${type}'`, t);
    }
    return this.advance();
  }

  private posOf(token: Token): Position {
    return { line: token.line, column: token.column, offset: token.offset };
  }

  private spanFrom(start: Token, end?: Token): Span {
    const e = end ?? this.tokens[this.pos - 1]!;
    return { start: this.posOf(start), end: this.posOf(e) };
  }

  // ─── Program ───

  parseProgram(): Program {
    const start = this.peek();
    const flows: FlowDecl[] = [];
    while (!this.check(TokenType.EOF)) {
      flows.push(this.parseFlowDecl());
    }
    return { type: "Program", flows, span: this.spanFrom(start) };
  }

  // ─── Flow ───

  private parseFlowDecl(): FlowDecl {
    const start = this.expect(TokenType.Flow);
    const name = this.expect(TokenType.String).value;
    this.expect(TokenType.LBrace);
    const body = this.parseFlowBody();
    const end = this.expect(TokenType.RBrace);
    return { type: "FlowDecl", name, body, span: this.spanFrom(start, end) };
  }

  private parseFlowBody(): FlowBodyItem[] {
    const items: FlowBodyItem[] = [];
    while (!this.check(TokenType.RBrace) && !this.check(TokenType.EOF)) {
      const t = this.peek();
      switch (t.type) {
        case TokenType.Import:
          items.push(this.parseImportStmt());
          break;
        case TokenType.Agent:
          items.push(this.parseAgentDecl());
          break;
        case TokenType.Converge:
          items.push(this.parseConvergeStmt());
          break;
        case TokenType.Budget:
          items.push(this.parseBudgetStmt());
          break;
        default:
          throw new ParseError("Expected 'import', 'agent', 'converge', or 'budget'", t);
      }
    }
    return items;
  }

  // ─── Import ───

  private parseImportStmt(): ImportStmt {
    const start = this.expect(TokenType.Import);
    const path = this.expect(TokenType.String).value;
    this.expect(TokenType.As);
    const alias = this.expect(TokenType.Ident).value;
    return { type: "ImportStmt", path, alias, span: this.spanFrom(start) };
  }

  // ─── Agent ───

  private parseAgentDecl(): AgentDecl {
    const start = this.expect(TokenType.Agent);
    const name = this.expect(TokenType.Ident).value;
    this.expect(TokenType.LBrace);

    const meta: AgentMeta = {};
    const operations: Operation[] = [];

    while (!this.check(TokenType.RBrace) && !this.check(TokenType.EOF)) {
      const t = this.peek();
      // Meta
      if (t.type === TokenType.Role) {
        this.advance();
        this.expect(TokenType.Colon);
        meta.role = this.expect(TokenType.String).value;
      } else if (t.type === TokenType.Model) {
        this.advance();
        this.expect(TokenType.Colon);
        meta.model = this.expect(TokenType.String).value;
      } else if (t.type === TokenType.Tools) {
        this.advance();
        this.expect(TokenType.Colon);
        meta.tools = this.parseToolsList();
      } else {
        operations.push(this.parseOperation());
      }
    }

    const end = this.expect(TokenType.RBrace);
    return { type: "AgentDecl", name, meta, operations, span: this.spanFrom(start, end) };
  }

  private parseToolsList(): string[] {
    this.expect(TokenType.LBracket);
    const tools: string[] = [];
    if (!this.check(TokenType.RBracket)) {
      tools.push(this.expect(TokenType.Ident).value);
      while (this.match(TokenType.Comma)) {
        tools.push(this.expect(TokenType.Ident).value);
      }
    }
    this.expect(TokenType.RBracket);
    return tools;
  }

  // ─── Operations ───

  private parseOperation(): Operation {
    const t = this.peek();
    switch (t.type) {
      case TokenType.Stake: return this.parseStakeOp();
      case TokenType.Await: return this.parseAwaitOp();
      case TokenType.Commit: return this.parseCommitOp();
      case TokenType.Escalate: return this.parseEscalateOp();
      case TokenType.When: return this.parseWhenBlock();
      default:
        throw new ParseError("Expected operation (stake, await, commit, escalate, when)", t);
    }
  }

  // ─── Stake ───

  private parseStakeOp(): StakeOp {
    const start = this.expect(TokenType.Stake);
    const call = this.parseFuncCall();
    this.expect(TokenType.Arrow);
    const recipients = this.parseRecipientList();
    const condition = this.parseOptionalCondition();
    return { type: "StakeOp", call, recipients, condition, span: this.spanFrom(start) };
  }

  private parseFuncCall(): FuncCall {
    const start = this.peek();
    const name = this.expect(TokenType.Ident).value;
    this.expect(TokenType.LParen);
    const args = this.parseArgList();
    this.expect(TokenType.RParen);
    return { type: "FuncCall", name, args, span: this.spanFrom(start) };
  }

  private parseArgList(): Argument[] {
    const args: Argument[] = [];
    if (this.check(TokenType.RParen)) return args;

    args.push(this.parseArgument());
    while (this.match(TokenType.Comma)) {
      args.push(this.parseArgument());
    }
    return args;
  }

  private parseArgument(): Argument {
    // Look ahead to see if this is a named argument: IDENT ":"
    if (this.check(TokenType.Ident) && this.tokens[this.pos + 1]?.type === TokenType.Colon) {
      const name = this.advance().value;
      this.advance(); // skip colon
      const value = this.parseExpr();
      return { name, value };
    }
    // Positional
    const value = this.parseExpr();
    return { value };
  }

  private parseRecipientList(): Recipient[] {
    const recipients: Recipient[] = [];
    recipients.push({ ref: this.expect(TokenType.AgentRef).value });
    while (this.match(TokenType.Comma)) {
      if (this.check(TokenType.AgentRef)) {
        recipients.push({ ref: this.advance().value });
      }
    }
    return recipients;
  }

  // ─── Await ───

  private parseAwaitOp(): AwaitOp {
    const start = this.expect(TokenType.Await);
    const binding = this.expect(TokenType.Ident).value;
    this.expect(TokenType.BackArrow);
    const sources = this.parseSourceList();

    const options: Record<string, Expr> = {};
    if (this.match(TokenType.LParen)) {
      if (!this.check(TokenType.RParen)) {
        this.parseAwaitOptions(options);
      }
      this.expect(TokenType.RParen);
    }

    return { type: "AwaitOp", binding, sources, options, span: this.spanFrom(start) };
  }

  private parseSourceList(): Source[] {
    const sources: Source[] = [];
    if (this.match(TokenType.Star)) {
      sources.push({ ref: "*" });
    } else {
      sources.push({ ref: this.expect(TokenType.AgentRef).value });
      while (this.match(TokenType.Comma)) {
        if (this.check(TokenType.AgentRef)) {
          sources.push({ ref: this.advance().value });
        }
      }
    }
    return sources;
  }

  private parseAwaitOptions(options: Record<string, Expr>): void {
    const key = this.expect(TokenType.Ident).value;
    this.expect(TokenType.Colon);
    options[key] = this.parseExpr();
    while (this.match(TokenType.Comma)) {
      const k = this.expect(TokenType.Ident).value;
      this.expect(TokenType.Colon);
      options[k] = this.parseExpr();
    }
  }

  // ─── Commit ───

  private parseCommitOp(): CommitOp {
    const start = this.expect(TokenType.Commit);
    let value: Expr | undefined;
    let condition: Expr | undefined;

    // commit  (bare)
    // commit <expr>
    // commit <expr> if <expr>
    // commit if <expr>   — shorthand for commit with only condition

    if (!this.check(TokenType.RBrace) && !this.check(TokenType.EOF) &&
        !this.isOperationStart() && !this.check(TokenType.If)) {
      value = this.parseExpr();
    }
    condition = this.parseOptionalCondition();
    return { type: "CommitOp", value, condition, span: this.spanFrom(start) };
  }

  // ─── Escalate ───

  private parseEscalateOp(): EscalateOp {
    const start = this.expect(TokenType.Escalate);
    const target = this.expect(TokenType.AgentRef).value;

    let reason: string | undefined;
    if (this.check(TokenType.Reason)) {
      this.advance();
      this.expect(TokenType.Colon);
      reason = this.expect(TokenType.String).value;
    }

    const condition = this.parseOptionalCondition();
    return { type: "EscalateOp", target, reason, condition, span: this.spanFrom(start) };
  }

  // ─── When ───

  private parseWhenBlock(): WhenBlock {
    const start = this.expect(TokenType.When);
    const condition = this.parseExpr();
    this.expect(TokenType.LBrace);
    const body: Operation[] = [];
    while (!this.check(TokenType.RBrace) && !this.check(TokenType.EOF)) {
      body.push(this.parseOperation());
    }
    const end = this.expect(TokenType.RBrace);
    return { type: "WhenBlock", condition, body, span: this.spanFrom(start, end) };
  }

  // ─── Flow Constraints ───

  private parseConvergeStmt(): ConvergeStmt {
    const start = this.expect(TokenType.Converge);
    this.expect(TokenType.When);
    this.expect(TokenType.Colon);
    const condition = this.parseExpr();
    return { type: "ConvergeStmt", condition, span: this.spanFrom(start) };
  }

  private parseBudgetStmt(): BudgetStmt {
    const start = this.expect(TokenType.Budget);
    this.expect(TokenType.Colon);
    const items: BudgetItem[] = [];
    items.push(this.parseBudgetItem());
    while (this.match(TokenType.Comma)) {
      items.push(this.parseBudgetItem());
    }
    return { type: "BudgetStmt", items, span: this.spanFrom(start) };
  }

  private parseBudgetItem(): BudgetItem {
    let kind: BudgetItem["kind"];
    const t = this.peek();
    if (t.type === TokenType.Tokens) { kind = "tokens"; this.advance(); }
    else if (t.type === TokenType.Rounds) { kind = "rounds"; this.advance(); }
    else if (t.type === TokenType.Time) { kind = "time"; this.advance(); }
    else { throw new ParseError("Expected 'tokens', 'rounds', or 'time'", t); }

    this.expect(TokenType.LParen);
    const value = this.parseExpr();
    this.expect(TokenType.RParen);
    return { kind, value };
  }

  // ─── Expressions ───

  private parseExpr(): Expr {
    return this.parseOr();
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.check(TokenType.Or)) {
      const op = this.advance();
      const right = this.parseAnd();
      left = {
        type: "BinaryExpr",
        op: "||",
        left,
        right,
        span: this.spanFrom(op),
      };
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseComparison();
    while (this.check(TokenType.And)) {
      const op = this.advance();
      const right = this.parseComparison();
      left = {
        type: "BinaryExpr",
        op: "&&",
        left,
        right,
        span: this.spanFrom(op),
      };
    }
    return left;
  }

  private parseComparison(): Expr {
    let left = this.parseAccess();
    const compOps = [TokenType.Gt, TokenType.Gte, TokenType.Lt, TokenType.Lte, TokenType.EqEq, TokenType.Neq];
    if (compOps.includes(this.peek().type)) {
      const op = this.advance();
      const right = this.parseAccess();
      left = {
        type: "BinaryExpr",
        op: op.value as any,
        left,
        right,
        span: this.spanFrom(op),
      };
    }
    return left;
  }

  private parseAccess(): Expr {
    let expr = this.parsePrimary();
    while (this.match(TokenType.Dot)) {
      const prop = this.expect(TokenType.Ident).value;
      expr = {
        type: "DotAccess",
        object: expr,
        property: prop,
        span: this.spanFrom(this.tokens[this.pos - 1]!),
      };
    }
    return expr;
  }

  private parsePrimary(): Expr {
    const t = this.peek();

    if (t.type === TokenType.Number) {
      this.advance();
      return { type: "NumberLit", value: parseFloat(t.value), span: this.spanFrom(t) };
    }

    if (t.type === TokenType.String) {
      this.advance();
      return { type: "StringLit", value: t.value, span: this.spanFrom(t) };
    }

    if (t.type === TokenType.True) {
      this.advance();
      return { type: "BoolLit", value: true, span: this.spanFrom(t) };
    }

    if (t.type === TokenType.False) {
      this.advance();
      return { type: "BoolLit", value: false, span: this.spanFrom(t) };
    }

    if (t.type === TokenType.Ident) {
      this.advance();
      return { type: "Ident", name: t.value, span: this.spanFrom(t) };
    }

    if (t.type === TokenType.AgentRef) {
      this.advance();
      return { type: "AgentRef", name: t.value, span: this.spanFrom(t) };
    }

    if (t.type === TokenType.LBracket) {
      return this.parseListLit();
    }

    if (t.type === TokenType.LParen) {
      this.advance();
      const expr = this.parseExpr();
      this.expect(TokenType.RParen);
      return expr;
    }

    throw new ParseError("Expected expression", t);
  }

  private parseListLit(): Expr {
    const start = this.expect(TokenType.LBracket);
    const elements: Expr[] = [];
    if (!this.check(TokenType.RBracket)) {
      elements.push(this.parseExpr());
      while (this.match(TokenType.Comma)) {
        elements.push(this.parseExpr());
      }
    }
    this.expect(TokenType.RBracket);
    return { type: "ListLit", elements, span: this.spanFrom(start) };
  }

  // ─── Helpers ───

  private parseOptionalCondition(): Expr | undefined {
    if (this.match(TokenType.If)) {
      return this.parseExpr();
    }
    return undefined;
  }

  private isOperationStart(): boolean {
    const t = this.peek().type;
    return t === TokenType.Stake || t === TokenType.Await ||
           t === TokenType.Commit || t === TokenType.Escalate ||
           t === TokenType.When;
  }
}
