// ─── SLANG Dependency Resolver ───
// Analyzes a parsed flow to determine execution order

import type { FlowDecl, AgentDecl, Operation } from "./ast.js";

export interface AgentDep {
  name: string;
  /** agents this agent awaits data from before it can start */
  awaitsFrom: string[];
  /** agents this agent stakes output to */
  stakesTo: string[];
  /** true if the agent's first operation is NOT an await */
  isReady: boolean;
}

export interface DepGraph {
  agents: Map<string, AgentDep>;
  /** agents that can execute immediately (no initial await) */
  ready: string[];
  /** agents that are blocked until their awaits are fulfilled */
  blocked: string[];
}

export function resolveDeps(flow: FlowDecl): DepGraph {
  const agentNodes = flow.body.filter((n): n is AgentDecl => n.type === "AgentDecl");
  const agents = new Map<string, AgentDep>();

  for (const agent of agentNodes) {
    const awaitsFrom: string[] = [];
    const stakesTo: string[] = [];
    let firstOpIsAwait = false;

    for (let i = 0; i < agent.operations.length; i++) {
      const op = agent.operations[i]!;
      collectDeps(op, awaitsFrom, stakesTo);
      if (i === 0 && op.type === "AwaitOp") {
        firstOpIsAwait = true;
      }
    }

    agents.set(agent.name, {
      name: agent.name,
      awaitsFrom: [...new Set(awaitsFrom)],
      stakesTo: [...new Set(stakesTo)],
      isReady: !firstOpIsAwait,
    });
  }

  const ready: string[] = [];
  const blocked: string[] = [];

  for (const [name, dep] of agents) {
    if (dep.isReady) ready.push(name);
    else blocked.push(name);
  }

  return { agents, ready, blocked };
}

function collectDeps(op: Operation, awaitsFrom: string[], stakesTo: string[]): void {
  switch (op.type) {
    case "AwaitOp":
      for (const s of op.sources) {
        if (s.ref !== "*" && s.ref !== "any") {
          awaitsFrom.push(s.ref);
        }
      }
      break;
    case "StakeOp":
      for (const r of op.recipients) {
        if (r.ref !== "all" && r.ref !== "out") {
          stakesTo.push(r.ref);
        }
      }
      break;
    case "WhenBlock":
      for (const inner of op.body) {
        collectDeps(inner, awaitsFrom, stakesTo);
      }
      break;
  }
}

/** Detect simple deadlocks: cycles where every agent in the cycle is blocked */
export function detectDeadlocks(graph: DepGraph): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();

  for (const name of graph.blocked) {
    if (visited.has(name)) continue;
    const path: string[] = [];
    const inPath = new Set<string>();

    function dfs(current: string): boolean {
      if (inPath.has(current)) {
        const cycleStart = path.indexOf(current);
        cycles.push(path.slice(cycleStart));
        return true;
      }
      if (visited.has(current)) return false;

      visited.add(current);
      inPath.add(current);
      path.push(current);

      const dep = graph.agents.get(current);
      if (dep) {
        for (const awaited of dep.awaitsFrom) {
          const awaitedDep = graph.agents.get(awaited);
          if (awaitedDep && !awaitedDep.isReady) {
            dfs(awaited);
          }
        }
      }

      path.pop();
      inPath.delete(current);
      return false;
    }

    dfs(name);
  }

  return cycles;
}

// ─── Extended Static Analysis ───

export interface FlowDiagnostic {
  level: "error" | "warning";
  message: string;
}

/** Run extended static analysis on a flow declaration. */
export function analyzeFlow(flow: FlowDecl): FlowDiagnostic[] {
  const diagnostics: FlowDiagnostic[] = [];
  const agentNodes = flow.body.filter((n): n is AgentDecl => n.type === "AgentDecl");
  const agentNames = new Set(agentNodes.map((a) => a.name));

  // Check for converge statement
  const hasConverge = flow.body.some((n) => n.type === "ConvergeStmt");
  if (!hasConverge) {
    diagnostics.push({ level: "warning", message: "Flow has no converge statement — will stop only when all agents commit or budget is exceeded" });
  }

  // Check for budget statement
  const hasBudget = flow.body.some((n) => n.type === "BudgetStmt");
  if (!hasBudget) {
    diagnostics.push({ level: "warning", message: "Flow has no budget statement — default limits apply (10 rounds)" });
  }

  for (const agent of agentNodes) {
    let hasStake = false;
    let hasCommit = false;

    for (const op of agent.operations) {
      checkOperation(op);
    }

    if (!hasCommit) {
      diagnostics.push({ level: "warning", message: `Agent "${agent.name}" has no commit — it will never signal completion` });
    }

    function checkOperation(op: Operation): void {
      if (op.type === "StakeOp") {
        hasStake = true;
        for (const r of op.recipients) {
          if (r.ref !== "out" && r.ref !== "all" && !agentNames.has(r.ref)) {
            diagnostics.push({ level: "error", message: `Agent "${agent.name}" stakes to unknown agent "@${r.ref}"` });
          }
        }
      } else if (op.type === "AwaitOp") {
        for (const s of op.sources) {
          if (s.ref !== "*" && s.ref !== "any" && !agentNames.has(s.ref)) {
            diagnostics.push({ level: "error", message: `Agent "${agent.name}" awaits from unknown agent "@${s.ref}"` });
          }
        }
      } else if (op.type === "CommitOp") {
        hasCommit = true;
      } else if (op.type === "WhenBlock") {
        for (const inner of op.body) {
          checkOperation(inner);
        }
      }
    }
  }

  // Orphan detection: agents that stake but nobody awaits from them
  const awaitedAgents = new Set<string>();
  for (const agent of agentNodes) {
    for (const op of agent.operations) {
      if (op.type === "AwaitOp") {
        for (const s of op.sources) {
          if (s.ref !== "*" && s.ref !== "any") awaitedAgents.add(s.ref);
        }
      }
    }
  }
  for (const agent of agentNodes) {
    const dep = { stakesTo: [] as string[] };
    for (const op of agent.operations) {
      if (op.type === "StakeOp") {
        for (const r of op.recipients) {
          if (r.ref !== "out" && r.ref !== "all") dep.stakesTo.push(r.ref);
        }
      }
    }
    // Agent stakes to other agents but nobody awaits from it
    if (dep.stakesTo.length > 0 && !awaitedAgents.has(agent.name) && !agentNodes.some(a => a.operations.some(op => op.type === "StakeOp" && op.recipients.some(r => r.ref === "out") && a.name === agent.name))) {
      // Only warn if the agent doesn't stake to @out
      const stakesToOut = agent.operations.some(op => op.type === "StakeOp" && op.recipients.some(r => r.ref === "out"));
      if (!stakesToOut) {
        diagnostics.push({ level: "warning", message: `Agent "${agent.name}" produces output but no agent awaits from it` });
      }
    }
  }

  return diagnostics;
}
