// ─── SLANG Thin Runtime / Scheduler ───
// A minimal scheduler that parses a SLANG flow and executes it
// by dispatching each agent as a separate LLM call.

import { parse } from "./parser.js";
import { resolveDeps, detectDeadlocks, type DepGraph } from "./resolver.js";
import { SlangError, SlangErrorCode, formatErrorMessage } from "./errors.js";
import type { LLMAdapter, LLMMessage } from "./adapter.js";
import type {
  FlowDecl, AgentDecl, Operation, StakeOp, AwaitOp,
  CommitOp, EscalateOp, WhenBlock, LetOp, SetOp, RepeatBlock,
  FuncCall, Argument, DeliverStmt, ExpectStmt, ImportStmt,
  Expr, ConvergeStmt, BudgetStmt, BudgetItem,
} from "./ast.js";

// ─── Runtime Error ───

export class RuntimeError extends SlangError {
  constructor(
    code: SlangErrorCode,
    message: string,
    line: number,
    column: number,
    source?: string,
  ) {
    super(code, message, line, column, source);
    this.name = "RuntimeError";
  }
}

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
  /** local variables declared with let/set */
  variables: Record<string, unknown>;
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
  /** flow-level parameters injected at startup */
  params: Record<string, unknown>;
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

export type DeliverHandler = (output: unknown, args: Record<string, unknown>) => void | Promise<void>;

export interface RuntimeOptions {
  adapter: LLMAdapter;
  /** callback for each event */
  onEvent?: (event: RuntimeEvent) => void;
  /** execute independent agents in parallel within a round (default: true) */
  parallel?: boolean;
  /** checkpoint callback — called after each round with a serializable snapshot of the flow state */
  checkpoint?: (state: FlowState) => void | Promise<void>;
  /** resume from a previously checkpointed state instead of starting fresh */
  resumeFrom?: FlowState;
  /** tool handler implementations — keys match tool names declared in agent `tools:` metadata */
  tools?: Record<string, ToolHandler>;
  /** callback invoked after the flow converges successfully */
  onConverge?: (state: FlowState) => void | Promise<void>;
  /** deliver handler implementations — keys match handler names used in `deliver:` statements */
  deliverers?: Record<string, DeliverHandler>;
  /** flow parameters matched against `flow "name" (param: "type") { ... }` declarations */
  params?: Record<string, unknown>;
  /** loader for imported sub-flows — receives the path string from `import "path" as alias` */
  importLoader?: (path: string) => string | Promise<string>;
}

export type RuntimeEvent =
  | { type: "round_start"; round: number }
  | { type: "agent_start"; agent: string; operation: string }
  | { type: "agent_output"; agent: string; output: string }
  | { type: "agent_commit"; agent: string; value: unknown }
  | { type: "agent_escalate"; agent: string; target: string; reason?: string }
  | { type: "agent_retry"; agent: string; attempt: number; error: string }
  | { type: "tool_call"; agent: string; tool: string; args: Record<string, unknown> }
  | { type: "tool_result"; agent: string; tool: string; result: string }
  | { type: "checkpoint"; round: number }
  | { type: "deliver"; handler: string; args: Record<string, unknown> }
  | { type: "on_converge" }
  | { type: "flow_converged"; outputs: unknown[] }
  | { type: "flow_budget_exceeded"; round: number }
  | { type: "flow_deadlock"; agents: string[] }
  | { type: "flow_escalated"; target: string; reason?: string }
  | { type: "expect_pass"; message: string; line: number; column: number }
  | { type: "expect_fail"; message: string; line: number; column: number };

// ─── Runtime ───

export async function runFlow(source: string, options: RuntimeOptions): Promise<FlowState> {
  const program = parse(source);
  if (program.flows.length === 0) {
    throw new RuntimeError(
      SlangErrorCode.E400,
      formatErrorMessage(SlangErrorCode.E400),
      1, 1, source,
    );
  }
  const flow = program.flows[0]!;
  return executeFlow(flow, options);
}

async function executeFlow(flow: FlowDecl, options: RuntimeOptions): Promise<FlowState> {
  const { adapter, onEvent, parallel = true, checkpoint, resumeFrom, tools, onConverge, deliverers, params: inputParams = {}, importLoader } = options;
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
  const deliverStmts = flow.body.filter((n): n is DeliverStmt => n.type === "DeliverStmt");

  // Initialize state (or resume from checkpoint)
  const state: FlowState = resumeFrom
    ? { ...cloneFlowState(resumeFrom), status: "running" }
    : createState(flow, "running", inputParams);

  if (!resumeFrom) {
    for (const agent of agentDecls) {
      state.agents.set(agent.name, {
        name: agent.name,
        status: depGraph.ready.includes(agent.name) ? "idle" : "blocked",
        opIndex: 0,
        output: undefined,
        bindings: {},
        variables: {},
        committed: false,
      });
    }
    // Execute imports — each imported sub-flow becomes a synthetic committed agent
    if (importLoader) {
      const importStmts = flow.body.filter((n): n is ImportStmt => n.type === "ImportStmt");
      for (const importStmt of importStmts) {
        await executeImport(importStmt, state, options);
      }
    }
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
        return { agentDecl, result: await executeOperation(agentDecl, agentState, op, state, adapter, onEvent, tools) };
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

        const result = await executeOperation(agentDecl, agentState, op, state, adapter, onEvent, tools);

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

    // Checkpoint after each round
    if (checkpoint && state.status === "running") {
      onEvent?.({ type: "checkpoint", round: state.round });
      await checkpoint(cloneFlowState(state));
    }
  }

  // Final checkpoint on termination
  if (checkpoint) {
    onEvent?.({ type: "checkpoint", round: state.round });
    await checkpoint(cloneFlowState(state));
  }

  // Post-flow: execute deliver statements and onConverge hook
  // Delivers run on any terminal status (converged, budget_exceeded, deadlock, escalated)
  {
    // Execute deliver statements
    if (deliverStmts.length > 0 && deliverers) {
      // Collect flow output: prefer explicit @out outputs, fallback to last committed agent output
      let flowOutput: unknown;
      if (state.outputs.length > 0) {
        flowOutput = state.outputs[state.outputs.length - 1];
      } else {
        // Build a map of all committed agent outputs
        const committedOutputs: Record<string, unknown> = {};
        for (const [name, agentState] of state.agents) {
          if (agentState.committed && agentState.output != null) {
            committedOutputs[name] = agentState.output;
          }
        }
        const keys = Object.keys(committedOutputs);
        if (keys.length === 1) {
          flowOutput = committedOutputs[keys[0]!];
        } else if (keys.length > 1) {
          flowOutput = committedOutputs;
        }
      }

      for (const deliver of deliverStmts) {
        const handler = deliverers[deliver.call.name];
        if (handler) {
          const args: Record<string, unknown> = {};
          for (const arg of deliver.call.args) {
            const key = arg.name ?? `arg${deliver.call.args.indexOf(arg)}`;
            const val = arg.value;
            if (val.type === "StringLit") args[key] = val.value;
            else if (val.type === "NumberLit") args[key] = val.value;
            else if (val.type === "BoolLit") args[key] = val.value;
            else if (val.type === "Ident") {
              // Resolve ident: check agent outputs, then fallback to the name string
              const agentState = state.agents.get(val.name);
              if (agentState && agentState.output != null) {
                args[key] = agentState.output;
              } else {
                args[key] = flowOutput;
              }
            }
          }
          onEvent?.({ type: "deliver", handler: deliver.call.name, args });
          await handler(flowOutput, args);
        }
      }
    }

    // Execute onConverge hook
    if (onConverge) {
      onEvent?.({ type: "on_converge" });
      await onConverge(state);
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
  tools?: Record<string, ToolHandler>,
): Promise<"continue" | "commit" | "escalate"> {
  switch (op.type) {
    case "StakeOp":
      return executeStake(agentDecl, agentState, op, flowState, adapter, onEvent, tools);
    case "AwaitOp":
      return executeAwait(agentState, op, flowState);
    case "CommitOp":
      return executeCommit(agentState, op, flowState);
    case "EscalateOp":
      return executeEscalateOp(agentState, op, flowState);
    case "WhenBlock":
      return executeWhen(agentDecl, agentState, op, flowState, adapter, onEvent, tools);
    case "LetOp":
      return executeLet(agentState, op, flowState);
    case "SetOp":
      return executeSet(agentState, op, flowState);
    case "RepeatBlock":
      return executeRepeat(agentDecl, agentState, op, flowState, adapter, onEvent, tools);
  }
}

async function executeStake(
  agentDecl: AgentDecl,
  agentState: AgentState,
  op: StakeOp,
  flowState: FlowState,
  adapter: LLMAdapter,
  onEvent?: (event: RuntimeEvent) => void,
  tools?: Record<string, ToolHandler>,
): Promise<"continue" | "commit" | "escalate"> {
  // Check condition
  if (op.condition && !evalCondition(op.condition, agentState, flowState)) {
    return "continue";
  }

  const taskDescription = serializeFuncCall(op.call, agentState, flowState);
  onEvent?.({ type: "agent_start", agent: agentDecl.name, operation: taskDescription });

  // Determine which tools are available for this agent
  const agentTools = resolveAgentTools(agentDecl, tools);

  // Build prompt for LLM
  const messages = buildAgentPrompt(agentDecl, agentState, taskDescription, flowState, op, agentTools ? Object.keys(agentTools) : undefined);

  // Retry with exponential backoff
  const maxAttempts = agentDecl.meta.retry ?? 1;
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      let conversation = [...messages];
      let response = await adapter.call(conversation, agentDecl.meta.model);
      flowState.tokensUsed += response.tokensUsed;

      // Tool call loop
      if (agentTools) {
        const MAX_TOOL_CALLS = 10;
        let toolCallCount = 0;
        while (toolCallCount < MAX_TOOL_CALLS) {
          const toolCall = parseToolCall(response.content);
          if (!toolCall) break;

          const handler = agentTools[toolCall.name];
          if (!handler) break;

          onEvent?.({ type: "tool_call", agent: agentDecl.name, tool: toolCall.name, args: toolCall.args });

          const result = await handler(toolCall.args);
          onEvent?.({ type: "tool_result", agent: agentDecl.name, tool: toolCall.name, result });

          // Append the exchange and re-call LLM
          conversation.push({ role: "assistant", content: response.content });
          conversation.push({ role: "user", content: `Tool "${toolCall.name}" returned:\n${result}\n\nContinue with your task.` });

          response = await adapter.call(conversation, agentDecl.meta.model);
          flowState.tokensUsed += response.tokensUsed;
          toolCallCount++;
        }
      }

      agentState.output = response.content;
      agentState.status = "idle";
      onEvent?.({ type: "agent_output", agent: agentDecl.name, output: response.content });

      // Store in variable if binding (let/set x = stake ...)
      if (op.binding) {
        agentState.variables[op.binding] = response.content;
      }

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

  // All retries exhausted — the error propagates with location info
  throw new RuntimeError(
    SlangErrorCode.E406,
    formatErrorMessage(SlangErrorCode.E406, {
      max: String(maxAttempts),
      agent: agentDecl.name,
      message: lastError?.message ?? "unknown error",
    }),
    op.span.start.line,
    op.span.start.column,
  );
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
  tools?: Record<string, ToolHandler>,
): Promise<"continue" | "commit" | "escalate"> {
  if (!evalCondition(op.condition, agentState, flowState)) {
    // Condition is false — execute else block if present
    if (op.elseBlock) {
      for (const innerOp of op.elseBlock.body) {
        const result = await executeOperation(agentDecl, agentState, innerOp, flowState, adapter, onEvent, tools);
        if (result !== "continue") return result;
      }
    }
    return "continue";
  }
  for (const innerOp of op.body) {
    const result = await executeOperation(agentDecl, agentState, innerOp, flowState, adapter, onEvent, tools);
    if (result !== "continue") return result;
  }
  return "continue";
}

function executeLet(
  agentState: AgentState,
  op: LetOp,
  flowState: FlowState,
): "continue" | "commit" | "escalate" {
  agentState.variables[op.name] = resolveExprValue(op.value, agentState, flowState);
  return "continue";
}

function executeSet(
  agentState: AgentState,
  op: SetOp,
  flowState: FlowState,
): "continue" | "commit" | "escalate" {
  agentState.variables[op.name] = resolveExprValue(op.value, agentState, flowState);
  return "continue";
}

async function executeRepeat(
  agentDecl: AgentDecl,
  agentState: AgentState,
  op: RepeatBlock,
  flowState: FlowState,
  adapter: LLMAdapter,
  onEvent?: (event: RuntimeEvent) => void,
  tools?: Record<string, ToolHandler>,
): Promise<"continue" | "commit" | "escalate"> {
  const MAX_ITERATIONS = 100; // safety limit
  let iterations = 0;
  while (!evalCondition(op.condition, agentState, flowState)) {
    iterations++;
    if (iterations > MAX_ITERATIONS) break;
    for (const innerOp of op.body) {
      const result = await executeOperation(agentDecl, agentState, innerOp, flowState, adapter, onEvent, tools);
      if (result !== "continue") return result;
    }
  }
  return "continue";
}

// ─── Import Execution ───

/**
 * Execute an imported sub-flow and register its result as a synthetic committed
 * agent in the parent flow. Parent agents can then `await data <- @alias` to
 * receive the sub-flow's output.
 */
async function executeImport(
  importStmt: ImportStmt,
  parentState: FlowState,
  options: RuntimeOptions,
): Promise<void> {
  if (!options.importLoader) return;

  let source: string;
  try {
    source = await options.importLoader(importStmt.path);
  } catch {
    // Import loader failed — skip so the parent flow continues
    return;
  }

  const program = parse(source);
  if (program.flows.length === 0) return;

  const subflow = program.flows[0]!;

  // Run sub-flow with shared adapter/tools but isolated state
  const subOptions: RuntimeOptions = {
    adapter: options.adapter,
    tools: options.tools,
    onEvent: options.onEvent,
    parallel: options.parallel,
    // Deliberately omit: checkpoint, resumeFrom, onConverge, deliverers, importLoader
  };

  const subState = await executeFlow(subflow, subOptions);

  // Collect sub-flow output: prefer @out outputs, else collect committed agent outputs
  let output: unknown;
  if (subState.outputs.length > 0) {
    output = subState.outputs.length === 1 ? subState.outputs[0] : subState.outputs;
  } else {
    const committedOutputs: Record<string, unknown> = {};
    for (const [name, agentSt] of subState.agents) {
      if (agentSt.committed && agentSt.output != null) {
        committedOutputs[name] = agentSt.output;
      }
    }
    const keys = Object.keys(committedOutputs);
    output = keys.length === 1
      ? committedOutputs[keys[0]!]
      : keys.length > 1 ? committedOutputs : undefined;
  }

  // Register alias as a synthetic committed agent in the parent flow
  parentState.agents.set(importStmt.alias, {
    name: importStmt.alias,
    status: "committed",
    opIndex: 0,
    output,
    bindings: {},
    variables: {},
    committed: true,
  });

  // Pre-populate mailbox so any parent agent can `await data <- @alias`
  for (const [agentName] of parentState.agents) {
    if (agentName !== importStmt.alias) {
      parentState.mailbox.set(`${importStmt.alias}->${agentName}`, output);
    }
  }
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
  availableTools?: string[],
): LLMMessage[] {
  let system = `You are agent "${agentDecl.name}" in a SLANG multi-agent workflow "${flowState.name}".`;
  if (agentDecl.meta.role) {
    system += `\nYour role: ${agentDecl.meta.role}`;
  }
  if (Object.keys(flowState.params).length > 0) {
    system += `\n\nFlow parameters:`;
    for (const [key, value] of Object.entries(flowState.params)) {
      system += `\n  ${key}: ${typeof value === "string" ? `"${value}"` : JSON.stringify(value)}`;
    }
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

  // Tool descriptions
  if (availableTools && availableTools.length > 0) {
    system += `\n\nYou have the following tools available:`;
    for (const tool of availableTools) {
      system += `\n- ${tool}`;
    }
    system += `\n\nTo use a tool, include this exact format in your response:`;
    system += `\nTOOL_CALL: tool_name({"arg1": "value1"})`;
    system += `\nYou will receive the result and can continue your task.`;
    system += `\nOnly use one tool call per response.`;
  }

  let user = `Execute your task now.`;
  const contextParts: string[] = [];

  for (const [key, value] of Object.entries(agentState.bindings)) {
    contextParts.push(`[${key}]:\n${typeof value === "string" ? value : JSON.stringify(value, null, 2)}`);
  }

  for (const [key, value] of Object.entries(agentState.variables)) {
    contextParts.push(`[var:${key}]:\n${typeof value === "string" ? value : JSON.stringify(value, null, 2)}`);
  }

  if (contextParts.length > 0) {
    user = `Here is the context you received:\n\n${contextParts.join("\n\n")}\n\nExecute your task based on this context.`;
  }

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function serializeFuncCall(call: FuncCall, agentState: AgentState, flowState?: FlowState): string {
  const args = call.args.map((arg) => {
    const val = serializeArgValue(arg, agentState, flowState);
    return arg.name ? `${arg.name}: ${val}` : val;
  });
  return `${call.name}(${args.join(", ")})`;
}

function serializeArgValue(arg: Argument, agentState: AgentState, flowState?: FlowState): string {
  return exprToString(arg.value, agentState, flowState);
}

function exprToString(expr: Expr, agentState: AgentState, flowState?: FlowState): string {
  switch (expr.type) {
    case "StringLit": return `"${expr.value}"`;
    case "NumberLit": return String(expr.value);
    case "BoolLit": return String(expr.value);
    case "Ident": {
      if (agentState.variables[expr.name] !== undefined) {
        const val = agentState.variables[expr.name];
        return typeof val === "string" ? val : JSON.stringify(val);
      }
      if (agentState.bindings[expr.name] !== undefined) {
        const val = agentState.bindings[expr.name];
        return typeof val === "string" ? val : JSON.stringify(val);
      }
      if (flowState && expr.name in flowState.params) {
        const val = flowState.params[expr.name];
        return typeof val === "string" ? val : JSON.stringify(val);
      }
      return expr.name;
    }
    case "AgentRef": return `@${expr.name}`;
    case "ListLit": return `[${expr.elements.map((e) => exprToString(e, agentState, flowState)).join(", ")}]`;
    case "DotAccess": return `${exprToString(expr.object, agentState, flowState)}.${expr.property}`;
    case "BinaryExpr": return `${exprToString(expr.left, agentState, flowState)} ${expr.op} ${exprToString(expr.right, agentState, flowState)}`;
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
      if (expr.name in agentState.variables) return agentState.variables[expr.name];
      if (expr.name in agentState.bindings) return agentState.bindings[expr.name];
      if (expr.name in flowState.params) return flowState.params[expr.name];
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
        case "contains": return String(left ?? "").includes(String(right ?? ""));
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
    variables: {},
  };
  return !!resolveExprValue(converge.condition, dummyAgent, state);
}

function createState(flow: FlowDecl, status: FlowState["status"], params: Record<string, unknown> = {}): FlowState {
  return {
    name: flow.name,
    round: 0,
    tokensUsed: 0,
    agents: new Map(),
    outputs: [],
    status,
    mailbox: new Map(),
    params,
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

// ─── Tool Helpers ───

function resolveAgentTools(
  agentDecl: AgentDecl,
  tools?: Record<string, ToolHandler>,
): Record<string, ToolHandler> | undefined {
  if (!tools || !agentDecl.meta.tools || agentDecl.meta.tools.length === 0) return undefined;
  const matched: Record<string, ToolHandler> = {};
  for (const name of agentDecl.meta.tools) {
    if (tools[name]) matched[name] = tools[name]!;
  }
  return Object.keys(matched).length > 0 ? matched : undefined;
}

function parseToolCall(content: string): { name: string; args: Record<string, unknown> } | undefined {
  const match = content.match(/TOOL_CALL:\s*(\w+)\(([\s\S]*?)\)\s*$/m);
  if (!match) return undefined;
  const name = match[1]!;
  const argsStr = match[2]!.trim();
  try {
    const args = argsStr ? JSON.parse(argsStr) : {};
    return { name, args };
  } catch {
    return { name, args: {} };
  }
}

// ─── Test Runner ───

export interface AssertionResult {
  passed: boolean;
  message: string;
  line: number;
  column: number;
}

export interface TestResult {
  passed: boolean;
  flowName: string;
  assertions: AssertionResult[];
  state: FlowState | null;
  error: string | null;
}

export async function testFlow(source: string, options: RuntimeOptions): Promise<TestResult> {
  let program;
  try {
    program = parse(source);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { passed: false, flowName: "", assertions: [], state: null, error };
  }
  if (program.flows.length === 0) {
    return { passed: false, flowName: "", assertions: [], state: null, error: "No flow found in source" };
  }

  const flow = program.flows[0]!;
  const expectStmts = flow.body.filter((n): n is ExpectStmt => n.type === "ExpectStmt");

  let state: FlowState | null = null;
  let error: string | null = null;
  try {
    state = await executeFlow(flow, options);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    return { passed: false, flowName: flow.name, assertions: [], state: null, error };
  }

  // Evaluate expect statements against final flow state
  const dummyAgent: AgentState = {
    name: "_test",
    status: "idle",
    opIndex: 0,
    output: undefined,
    bindings: {},
    committed: false,
    variables: {},
  };

  const assertions: AssertionResult[] = [];
  for (const expect of expectStmts) {
    const value = resolveExprValue(expect.expr, dummyAgent, state);
    const passed = !!value;
    const message = formatExpectExpr(expect.expr);
    assertions.push({
      passed,
      message,
      line: expect.span.start.line,
      column: expect.span.start.column,
    });
    if (passed) {
      options.onEvent?.({ type: "expect_pass", message, line: expect.span.start.line, column: expect.span.start.column });
    } else {
      options.onEvent?.({ type: "expect_fail", message, line: expect.span.start.line, column: expect.span.start.column });
    }
  }

  const allPassed = assertions.every((a) => a.passed);
  return { passed: allPassed, flowName: flow.name, assertions, state, error: null };
}

function formatExpectExpr(expr: Expr): string {
  switch (expr.type) {
    case "BinaryExpr": {
      const left = formatExpectExpr(expr.left);
      const right = formatExpectExpr(expr.right);
      return `${left} ${expr.op} ${right}`;
    }
    case "DotAccess": return `${formatExpectExpr(expr.object)}.${expr.property}`;
    case "AgentRef": return `@${expr.name}`;
    case "Ident": return expr.name;
    case "StringLit": return `"${expr.value}"`;
    case "NumberLit": return String(expr.value);
    case "BoolLit": return String(expr.value);
    case "ListLit": return `[${expr.elements.map(formatExpectExpr).join(", ")}]`;
  }
}

// ─── Serialization ───

export function serializeFlowState(state: FlowState): string {
  return JSON.stringify(state, (_key, value) => {
    if (value instanceof Map) {
      return { __type: "Map", entries: Array.from(value.entries()) };
    }
    return value;
  });
}

export function deserializeFlowState(json: string): FlowState {
  return JSON.parse(json, (_key, value) => {
    if (value && typeof value === "object" && value.__type === "Map") {
      return new Map(value.entries);
    }
    return value;
  });
}

function cloneFlowState(state: FlowState): FlowState {
  return deserializeFlowState(serializeFlowState(state));
}
