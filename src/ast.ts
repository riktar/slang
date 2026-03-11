// ─── AST Node Types for SLANG ───

export interface Position {
  line: number;
  column: number;
  offset: number;
}

export interface Span {
  start: Position;
  end: Position;
}

// ─── Base ───

interface BaseNode {
  span: Span;
}

// ─── Top Level ───

export interface Program extends BaseNode {
  type: "Program";
  flows: FlowDecl[];
}

export interface FlowDecl extends BaseNode {
  type: "FlowDecl";
  name: string;
  body: FlowBodyItem[];
}

export type FlowBodyItem = ImportStmt | AgentDecl | ConvergeStmt | BudgetStmt;

// ─── Import ───

export interface ImportStmt extends BaseNode {
  type: "ImportStmt";
  path: string;
  alias: string;
}

// ─── Agent ───

export interface AgentDecl extends BaseNode {
  type: "AgentDecl";
  name: string;
  meta: AgentMeta;
  operations: Operation[];
}

export interface AgentMeta {
  role?: string;
  model?: string;
  tools?: string[];
  retry?: number;
}

// ─── Operations ───

export type Operation = StakeOp | AwaitOp | CommitOp | EscalateOp | WhenBlock;

export interface StakeOp extends BaseNode {
  type: "StakeOp";
  call: FuncCall;
  recipients: Recipient[];
  condition?: Expr;
  output?: OutputSchema;
}

export interface OutputSchema {
  fields: OutputField[];
}

export interface OutputField {
  name: string;
  fieldType: string; // "string" | "number" | "boolean"
}

export interface AwaitOp extends BaseNode {
  type: "AwaitOp";
  binding: string;
  sources: Source[];
  options: Record<string, Expr>;
}

export interface CommitOp extends BaseNode {
  type: "CommitOp";
  value?: Expr;
  condition?: Expr;
}

export interface EscalateOp extends BaseNode {
  type: "EscalateOp";
  target: string; // agent ref without @
  reason?: string;
  condition?: Expr;
}

export interface WhenBlock extends BaseNode {
  type: "WhenBlock";
  condition: Expr;
  body: Operation[];
}

// ─── Function Call ───

export interface FuncCall extends BaseNode {
  type: "FuncCall";
  name: string;
  args: Argument[];
}

export interface Argument {
  name?: string; // named argument key, undefined if positional
  value: Expr;
}

// ─── Recipients / Sources ───

export interface Recipient {
  ref: string; // "Analyst", "all", "out", "Human"
}

export interface Source {
  ref: string; // "Analyst", "any", "*"
}

// ─── Flow Constraints ───

export interface ConvergeStmt extends BaseNode {
  type: "ConvergeStmt";
  condition: Expr;
}

export interface BudgetStmt extends BaseNode {
  type: "BudgetStmt";
  items: BudgetItem[];
}

export interface BudgetItem {
  kind: "tokens" | "rounds" | "time";
  value: Expr;
}

// ─── Expressions ───

export type Expr =
  | NumberLit
  | StringLit
  | BoolLit
  | Ident
  | AgentRef
  | ListLit
  | DotAccess
  | BinaryExpr;

export interface NumberLit extends BaseNode {
  type: "NumberLit";
  value: number;
}

export interface StringLit extends BaseNode {
  type: "StringLit";
  value: string;
}

export interface BoolLit extends BaseNode {
  type: "BoolLit";
  value: boolean;
}

export interface Ident extends BaseNode {
  type: "Ident";
  name: string;
}

export interface AgentRef extends BaseNode {
  type: "AgentRef";
  name: string; // without @
}

export interface ListLit extends BaseNode {
  type: "ListLit";
  elements: Expr[];
}

export interface DotAccess extends BaseNode {
  type: "DotAccess";
  object: Expr;
  property: string;
}

export interface BinaryExpr extends BaseNode {
  type: "BinaryExpr";
  op: ">" | ">=" | "<" | "<=" | "==" | "!=" | "&&" | "||";
  left: Expr;
  right: Expr;
}
