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
