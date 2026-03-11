// ─── SLANG Thin Runtime / Scheduler ───
// A minimal scheduler that parses a SLANG flow and executes it
// by dispatching each agent as a separate LLM call.

import { parse } from "./parser.js";
import { resolveDeps, detectDeadlocks, type DepGraph } from "./resolver.js";
import type { LLMAdapter, LLMMessage } from "./adapter.js";
import type {
  FlowDecl, AgentDecl, Operation, StakeOp, AwaitOp,
  CommitOp, EscalateOp, WhenBlock, FuncCall, Argument,
  Expr, ConvergeStmt, BudgetStmt, BudgetItem,
} from "./ast.js";

// ─── Public Types ───

export type AgentStatus = "idle" | "running" | "committed" | "escalated" | "blocked";

export interface AgentState {
  name: string;
  status: AgentStatus;
  /** index of the next operation to execute */
  opIndex: number;
  /** data produced by this agent's last stake */
  output: unknown;
  /** data received via await bindings */
  bindings: Record<string, unknown>;
  /** whether this agent has committed */
  committed: boolean;
  /** escalation target, if escalated */
  escalatedTo?: string;
  /** escalation reason */
  escalateReason?: string;
}

export interface FlowState {
  name: string;
  round: number;
  tokensUsed: number;
  agents: Map<string, AgentState>;
  /** outputs staked to @out */
  outputs: unknown[];
  /** final status */
  status: "running" | "converged" | "budget_exceeded" | "escalated" | "deadlock";
  /** data staked between agents: key = "Source->Target" */
  mailbox: Map<string, unknown>;
}

export interface RuntimeOptions {
  adapter: LLMAdapter;
  /** callback for each event */
  onEvent?: (event: RuntimeEvent) => void;
  /** execute independent agents in parallel within a round (default: true) */
  parallel?: boolean;
}

export type RuntimeEvent =
  | { type: "round_start"; round: number }
  | { type: "agent_start"; agent: string; operation: string }
  | { type: "agent_output"; agent: string; output: string }
  | { type: "agent_commit"; agent: string; value: unknown }
  | { type: "agent_escalate"; agent: string; target: string; reason?: string }
  | { type: "agent_retry"; agent: string; attempt: number; error: string }
  | { type: "flow_converged"; outputs: unknown[] }
  | { type: "flow_budget_exceeded"; round: number }
  | { type: "flow_deadlock"; agents: string[] }
  | { type: "flow_escalated"; target: string; reason?: string };

// ─── Runtime ───

export async function runFlow(source: string, options: RuntimeOptions): Promise<FlowState> {
  const program = parse(source);
  if (program.flows.length === 0) {
    throw new Error("No flow found in source");
  }
  const flow = program.flows[0]!;
  return executeFlow(flow, options);
}

async function executeFlow(flow: FlowDecl, options: RuntimeOptions): Promise<FlowState> {
  const { adapter, onEvent, parallel = true } = options;
  const depGraph = resolveDeps(flow);
  const deadlocks = detectDeadlocks(depGraph);

  if (deadlocks.length > 0 && depGraph.ready.length === 0) {
    onEvent?.({ type: "flow_deadlock", agents: deadlocks[0]! });
    return createState(flow, "deadlock");
  }

  // Extract constraints
  const converge = flow.body.find((n): n is ConvergeStmt => n.type === "ConvergeStmt");
  const budgetNode = flow.body.find((n): n is BudgetStmt => n.type === "BudgetStmt");
  const maxRounds = extractBudgetValue(budgetNode, "rounds") ?? 10;
  const maxTokens = extractBudgetValue(budgetNode, "tokens") ?? Infinity;
  const agentDecls = flow.body.filter((n): n is AgentDecl => n.type === "AgentDecl");

  // Initialize state
  const state = createState(flow, "running");
  for (const agent of agentDecls) {
    state.agents.set(agent.name, {
      name: agent.name,
      status: depGraph.ready.includes(agent.name) ? "idle" : "blocked",
      opIndex: 0,
      output: undefined,
      bindings: {},
      committed: false,
    });
  }

  // ─── Main Loop ───
  while (state.status === "running") {
    state.round++;
    onEvent?.({ type: "round_start", round: state.round });

    // Budget check
    if (state.round > maxRounds) {
      state.status = "budget_exceeded";
      onEvent?.({ type: "flow_budget_exceeded", round: state.round });
      break;
    }
    if (state.tokensUsed > maxTokens) {
      state.status = "budget_exceeded";
      onEvent?.({ type: "flow_budget_exceeded", round: state.round });
      break;
    }

    // Find executable agents
    const executable = findExecutableAgents(agentDecls, state);
    if (executable.length === 0) {
      // Check if everyone committed or escalated
      const allDone = [...state.agents.values()].every(
        (a) => a.committed || a.escalatedTo
      );
      if (allDone) {
        state.status = "converged";
        onEvent?.({ type: "flow_converged", outputs: state.outputs });
        break;
      }
      state.status = "deadlock";
      const blockedNames = [...state.agents.values()]
        .filter((a) => !a.committed && !a.escalatedTo)
        .map((a) => a.name);
      onEvent?.({ type: "flow_deadlock", agents: blockedNames });
      break;
    }

    // Execute each ready agent's next operation
    // Partition into parallelizable (stake) and sequential (await/commit/escalate/when) ops
    const stakeAgents: AgentDecl[] = [];
    const seqAgents: AgentDecl[] = [];
    for (const agentDecl of executable) {
      const agentState = state.agents.get(agentDecl.name)!;
      const op = agentDecl.operations[agentState.opIndex];
      if (!op) continue;
      if (parallel && op.type === "StakeOp") {
        stakeAgents.push(agentDecl);
      } else {
        seqAgents.push(agentDecl);
      }
    }

    // Run parallelizable stake operations concurrently
    if (stakeAgents.length > 0) {
      const results = await Promise.all(stakeAgents.map(async (agentDecl) => {
        const agentState = state.agents.get(agentDecl.name)!;
        const op = agentDecl.operations[agentState.opIndex]!;
        return { agentDecl, result: await executeOperation(agentDecl, agentState, op, state, adapter, onEvent) };
      }));
      for (const { agentDecl, result } of results) {
        const agentState = state.agents.get(agentDecl.name)!;
        if (result === "commit") {
          agentState.committed = true;
          agentState.status = "committed";
          onEvent?.({ type: "agent_commit", agent: agentDecl.name, value: agentState.output });
        } else if (result === "escalate") {
          agentState.status = "escalated";
          onEvent?.({ type: "agent_escalate", agent: agentDecl.name, target: agentState.escalatedTo!, reason: agentState.escalateReason });
          if (agentState.escalatedTo === "Human") {
            state.status = "escalated";
            onEvent?.({ type: "flow_escalated", target: "Human", reason: agentState.escalateReason });
            break;
          }
        } else {
          agentState.opIndex++;
        }
      }
    }

    // Run sequential operations one at a time
    if (state.status === "running") {
      for (const agentDecl of seqAgents) {
        const agentState = state.agents.get(agentDecl.name)!;
        const op = agentDecl.operations[agentState.opIndex];
        if (!op) continue;

        const result = await executeOperation(agentDecl, agentState, op, state, adapter, onEvent);

        if (result === "commit") {
          agentState.committed = true;
          agentState.status = "committed";
          onEvent?.({ type: "agent_commit", agent: agentDecl.name, value: agentState.output });
        } else if (result === "escalate") {
          agentState.status = "escalated";
          onEvent?.({
            type: "agent_escalate",
            agent: agentDecl.name,
            target: agentState.escalatedTo!,
            reason: agentState.escalateReason,
          });
          if (agentState.escalatedTo === "Human") {
            state.status = "escalated";
            onEvent?.({
              type: "flow_escalated",
              target: "Human",
              reason: agentState.escalateReason,
            });
            break;
          }
        } else {
          agentState.opIndex++;
        }
      }
    }

    // Check convergence
    if (converge && state.status === "running") {
      if (evalConvergence(converge, state)) {
        state.status = "converged";
        onEvent?.({ type: "flow_converged", outputs: state.outputs });
        break;
      }
    }
  }

  return state;
}

// ─── Operation Execution ───

async function executeOperation(
  agentDecl: AgentDecl,
  agentState: AgentState,
  op: Operation,
  flowState: FlowState,
  adapter: LLMAdapter,
  onEvent?: (event: RuntimeEvent) => void,
): Promise<"continue" | "commit" | "escalate"> {
  switch (op.type) {
    case "StakeOp":
      return executeStake(agentDecl, agentState, op, flowState, adapter, onEvent);
    case "AwaitOp":
      return executeAwait(agentState, op, flowState);
    case "CommitOp":
      return executeCommit(agentState, op, flowState);
    case "EscalateOp":
      return executeEscalateOp(agentState, op, flowState);
    case "WhenBlock":
      return executeWhen(agentDecl, agentState, op, flowState, adapter, onEvent);
  }
}

async function executeStake(
  agentDecl: AgentDecl,
  agentState: AgentState,
  op: StakeOp,
  flowState: FlowState,
  adapter: LLMAdapter,
  onEvent?: (event: RuntimeEvent) => void,
): Promise<"continue" | "commit" | "escalate"> {
  // Check condition
  if (op.condition && !evalCondition(op.condition, agentState, flowState)) {
    return "continue";
  }

  const taskDescription = serializeFuncCall(op.call, agentState);
  onEvent?.({ type: "agent_start", agent: agentDecl.name, operation: taskDescription });

  // Build prompt for LLM
  const messages = buildAgentPrompt(agentDecl, agentState, taskDescription, flowState, op);

  // Retry with exponential backoff
  const maxAttempts = agentDecl.meta.retry ?? 1;
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await adapter.call(messages, agentDecl.meta.model);
      flowState.tokensUsed += response.tokensUsed;

      agentState.output = response.content;
      agentState.status = "idle";
      onEvent?.({ type: "agent_output", agent: agentDecl.name, output: response.content });

      // Deliver to mailbox
      for (const recipient of op.recipients) {
        if (recipient.ref === "out") {
          flowState.outputs.push(response.content);
        } else if (recipient.ref === "all") {
          for (const [name] of flowState.agents) {
            if (name !== agentDecl.name) {
              flowState.mailbox.set(`${agentDecl.name}->${name}`, response.content);
            }
          }
        } else {
          flowState.mailbox.set(`${agentDecl.name}->${recipient.ref}`, response.content);
        }
      }

      return "continue";
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts) {
        onEvent?.({ type: "agent_retry", agent: agentDecl.name, attempt, error: lastError.message });
        await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000));
      }
    }
  }

  // All retries exhausted — the error propagates
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function executeAwait(
  agentState: AgentState,
  op: AwaitOp,
  flowState: FlowState,
): "continue" | "commit" | "escalate" {
  // Check if data is available in mailbox
  for (const source of op.sources) {
    if (source.ref === "*") {
      // Accept from anyone
      for (const [key, value] of flowState.mailbox) {
        if (key.endsWith(`->${agentState.name}`)) {
          agentState.bindings[op.binding] = value;
          return "continue";
        }
      }
    } else {
      const key = `${source.ref}->${agentState.name}`;
      if (flowState.mailbox.has(key)) {
        agentState.bindings[op.binding] = flowState.mailbox.get(key);
        return "continue";
      }
    }
  }

  // Still waiting — stay blocked
  agentState.status = "blocked";
  return "continue";
}

function executeCommit(
  agentState: AgentState,
  op: CommitOp,
  flowState: FlowState,
): "continue" | "commit" | "escalate" {
  // Check condition
  if (op.condition && !evalCondition(op.condition, agentState, flowState)) {
    return "continue";
  }

  if (op.value) {
    agentState.output = resolveExprValue(op.value, agentState, flowState);
  }
  return "commit";
}

function executeEscalateOp(
  agentState: AgentState,
  op: EscalateOp,
  flowState: FlowState,
): "continue" | "commit" | "escalate" {
  if (op.condition && !evalCondition(op.condition, agentState, flowState)) {
    return "continue";
  }

  agentState.escalatedTo = op.target;
  agentState.escalateReason = op.reason;
  return "escalate";
}

async function executeWhen(
  agentDecl: AgentDecl,
  agentState: AgentState,
  op: WhenBlock,
  flowState: FlowState,
  adapter: LLMAdapter,
  onEvent?: (event: RuntimeEvent) => void,
): Promise<"continue" | "commit" | "escalate"> {
  if (!evalCondition(op.condition, agentState, flowState)) {
    return "continue";
  }
  for (const innerOp of op.body) {
    const result = await executeOperation(agentDecl, agentState, innerOp, flowState, adapter, onEvent);
    if (result !== "continue") return result;
  }
  return "continue";
}

// ─── Helpers ───

function findExecutableAgents(agentDecls: AgentDecl[], state: FlowState): AgentDecl[] {
  return agentDecls.filter((decl) => {
    const agentState = state.agents.get(decl.name)!;
    if (agentState.committed || agentState.escalatedTo) return false;
    if (agentState.opIndex >= decl.operations.length) return false;

    const nextOp = decl.operations[agentState.opIndex]!;
    if (nextOp.type === "AwaitOp") {
      // Check if data is available
      for (const source of nextOp.sources) {
        if (source.ref === "*") {
          for (const [key] of state.mailbox) {
            if (key.endsWith(`->${decl.name}`)) return true;
          }
        } else {
          if (state.mailbox.has(`${source.ref}->${decl.name}`)) return true;
        }
      }
      return false;
    }
    return true;
  });
}

function buildAgentPrompt(
  agentDecl: AgentDecl,
  agentState: AgentState,
  taskDescription: string,
  flowState: FlowState,
  stakeOp?: StakeOp,
): LLMMessage[] {
  let system = `You are agent "${agentDecl.name}" in a SLANG multi-agent workflow "${flowState.name}".`;
  if (agentDecl.meta.role) {
    system += `\nYour role: ${agentDecl.meta.role}`;
  }
  system += `\n\nYour task: ${taskDescription}`;
  system += `\n\nRespond with substantive, real content. Be thorough and precise.`;
  system += `\nAt the end of your response, add a line: CONFIDENCE: <0.0-1.0>`;

  // Structured output schema
  if (stakeOp?.output) {
    const schemaLines = stakeOp.output.fields.map(
      (f) => `  "${f.name}": <${f.fieldType}>`
    );
    system += `\n\nYou MUST include a JSON block in your response with this exact schema:`;
    system += `\n\`\`\`json\n{\n${schemaLines.join(",\n")}\n}\n\`\`\``;
  }

  let user = `Execute your task now.`;
  const contextParts: string[] = [];

  for (const [key, value] of Object.entries(agentState.bindings)) {
    contextParts.push(`[${key}]:\n${typeof value === "string" ? value : JSON.stringify(value, null, 2)}`);
  }

  if (contextParts.length > 0) {
    user = `Here is the context you received:\n\n${contextParts.join("\n\n")}\n\nExecute your task based on this context.`;
  }

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function serializeFuncCall(call: FuncCall, agentState: AgentState): string {
  const args = call.args.map((arg) => {
    const val = serializeArgValue(arg, agentState);
    return arg.name ? `${arg.name}: ${val}` : val;
  });
  return `${call.name}(${args.join(", ")})`;
}

function serializeArgValue(arg: Argument, agentState: AgentState): string {
  return exprToString(arg.value, agentState);
}

function exprToString(expr: Expr, agentState: AgentState): string {
  switch (expr.type) {
    case "StringLit": return `"${expr.value}"`;
    case "NumberLit": return String(expr.value);
    case "BoolLit": return String(expr.value);
    case "Ident": {
      if (agentState.bindings[expr.name] !== undefined) {
        const val = agentState.bindings[expr.name];
        return typeof val === "string" ? val : JSON.stringify(val);
      }
      return expr.name;
    }
    case "AgentRef": return `@${expr.name}`;
    case "ListLit": return `[${expr.elements.map((e) => exprToString(e, agentState)).join(", ")}]`;
    case "DotAccess": return `${exprToString(expr.object, agentState)}.${expr.property}`;
    case "BinaryExpr": return `${exprToString(expr.left, agentState)} ${expr.op} ${exprToString(expr.right, agentState)}`;
  }
}

function evalCondition(expr: Expr, agentState: AgentState, flowState: FlowState): boolean {
  const val = resolveExprValue(expr, agentState, flowState);
  return !!val;
}

function resolveExprValue(expr: Expr, agentState: AgentState, flowState: FlowState): unknown {
  switch (expr.type) {
    case "NumberLit": return expr.value;
    case "StringLit": return expr.value;
    case "BoolLit": return expr.value;
    case "Ident": {
      if (expr.name === "committed_count") {
        return [...flowState.agents.values()].filter((a) => a.committed).length;
      }
      if (expr.name === "all_committed") {
        return [...flowState.agents.values()].every((a) => a.committed);
      }
      if (expr.name === "round") return flowState.round;
      if (expr.name in agentState.bindings) return agentState.bindings[expr.name];
      return undefined;
    }
    case "AgentRef": {
      const a = flowState.agents.get(expr.name);
      return a ? { output: a.output, committed: a.committed, status: a.status } : undefined;
    }
    case "DotAccess": {
      const obj = resolveExprValue(expr.object, agentState, flowState) as any;
      if (obj == null) return undefined;
      // Try to parse as JSON if it's a string (LLM output)
      if (typeof obj === "string") {
        // Look for CONFIDENCE: pattern
        if (expr.property === "confidence") {
          const match = obj.match(/CONFIDENCE:\s*([\d.]+)/i);
          return match ? parseFloat(match[1]!) : 0.5;
        }

        // Try structured JSON extraction first
        const parsed = extractJSON(obj);
        if (parsed && expr.property in parsed) {
          return parsed[expr.property];
        }

        // Fallback: regex patterns for well-known fields
        if (expr.property === "approved") {
          const match = obj.match(/"?approved"?\s*[:=]\s*(true|false)/i);
          return match ? match[1]!.toLowerCase() === "true" : false;
        }
        if (expr.property === "rejected") {
          const match = obj.match(/"?rejected"?\s*[:=]\s*(true|false)/i);
          return match ? match[1]!.toLowerCase() === "true" : false;
        }
        if (expr.property === "score") {
          const match = obj.match(/"?score"?\s*[:=]\s*([\d.]+)/i);
          return match ? parseFloat(match[1]!) : 0;
        }
        return undefined;
      }
      return obj[expr.property];
    }
    case "BinaryExpr": {
      const left = resolveExprValue(expr.left, agentState, flowState);
      const right = resolveExprValue(expr.right, agentState, flowState);
      switch (expr.op) {
        case ">": return (left as number) > (right as number);
        case ">=": return (left as number) >= (right as number);
        case "<": return (left as number) < (right as number);
        case "<=": return (left as number) <= (right as number);
        case "==": return left === right;
        case "!=": return left !== right;
        case "&&": return left && right;
        case "||": return left || right;
      }
    }
    case "ListLit": return expr.elements.map((e) => resolveExprValue(e, agentState, flowState));
  }
}

function evalConvergence(converge: ConvergeStmt, state: FlowState): boolean {
  // Use a dummy agent state for evaluation
  const dummyAgent: AgentState = {
    name: "_flow",
    status: "idle",
    opIndex: 0,
    output: undefined,
    bindings: {},
    committed: false,
  };
  return !!resolveExprValue(converge.condition, dummyAgent, state);
}

function createState(flow: FlowDecl, status: FlowState["status"]): FlowState {
  return {
    name: flow.name,
    round: 0,
    tokensUsed: 0,
    agents: new Map(),
    outputs: [],
    status,
    mailbox: new Map(),
  };
}

function extractBudgetValue(budget: BudgetStmt | undefined, kind: BudgetItem["kind"]): number | undefined {
  if (!budget) return undefined;
  const item = budget.items.find((i) => i.kind === kind);
  if (!item) return undefined;
  if (item.value.type === "NumberLit") return item.value.value;
  return undefined;
}

/** Extract the first JSON object from an LLM response string. */
function extractJSON(text: string): Record<string, unknown> | undefined {
  // Try fenced ```json block first
  const fenced = text.match(/```json\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1]!.trim()); } catch { /* fall through */ }
  }
  // Try raw JSON parse
  try { return JSON.parse(text); } catch { /* fall through */ }
  // Try to find first { ... } block
  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    try { return JSON.parse(text.slice(braceStart, braceEnd + 1)); } catch { /* give up */ }
  }
  return undefined;
}
