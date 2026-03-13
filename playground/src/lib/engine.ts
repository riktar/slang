// SLANG engine wrapper for the browser playground
import { tokenize } from "@slang/lexer.js";
import { parse, parseWithRecovery, type ParseResult } from "@slang/parser.js";
import { resolveDeps, detectDeadlocks, analyzeFlow, type DepGraph, type FlowDiagnostic } from "@slang/resolver.js";
import { runFlow, testFlow, type FlowState, type RuntimeEvent, type TestResult, type AssertionResult } from "@slang/runtime.js";
import { createEchoAdapter, createMockAdapter } from "@slang/adapter.js";
import { SlangError } from "@slang/errors.js";
import type { Program, FlowDecl, AgentDecl, ExpectStmt } from "@slang/ast.js";

export type { Program, FlowDecl, AgentDecl, DepGraph, FlowDiagnostic, FlowState, RuntimeEvent, ParseResult, TestResult, AssertionResult };
export { SlangError };

export interface AnalysisResult {
  program: Program | null;
  errors: Array<{ code: string; message: string; line: number; column: number }>;
  graph: DepGraph | null;
  diagnostics: FlowDiagnostic[];
  deadlocks: string[][];
}

export function analyzeSource(source: string): AnalysisResult {
  const result: AnalysisResult = {
    program: null,
    errors: [],
    graph: null,
    diagnostics: [],
    deadlocks: [],
  };

  if (!source.trim()) return result;

  try {
    const { program, errors } = parseWithRecovery(source);
    result.program = program;
    result.errors = errors.map((e: InstanceType<typeof SlangError>) => ({
      code: e.code,
      message: e.message,
      line: e.line,
      column: e.column,
    }));

    if (program.flows.length > 0) {
      const flow = program.flows[0]!;
      result.graph = resolveDeps(flow);
      result.deadlocks = detectDeadlocks(result.graph);
      result.diagnostics = analyzeFlow(flow);
    }
  } catch (e: unknown) {
    if (e instanceof SlangError) {
      result.errors.push({
        code: e.code,
        message: e.message,
        line: e.line,
        column: e.column,
      });
    } else {
      result.errors.push({
        code: "UNKNOWN",
        message: e instanceof Error ? e.message : String(e),
        line: 1,
        column: 1,
      });
    }
  }

  return result;
}

export interface RunResult {
  state: FlowState | null;
  events: RuntimeEvent[];
  error: string | null;
  /** Test results — only present when flow contains `expect` statements */
  testResult: TestResult | null;
}

export async function runSource(
  source: string,
  onEvent?: (event: RuntimeEvent) => void,
): Promise<RunResult> {
  const events: RuntimeEvent[] = [];

  // Check if source contains expect statements → run as test
  const hasExpect = sourceHasExpect(source);

  try {
    if (hasExpect) {
      const adapter = createMockAdapter({
        responses: {},
        defaultResponse: "[MOCK] Default test response\nCONFIDENCE: 0.9",
      });
      const result = await testFlow(source, {
        adapter,
        onEvent: (ev: RuntimeEvent) => {
          events.push(ev);
          onEvent?.(ev);
        },
      });
      return {
        state: result.state,
        events,
        error: result.error,
        testResult: result,
      };
    }

    const state = await runFlow(source, {
      adapter: createEchoAdapter(),
      onEvent: (ev: RuntimeEvent) => {
        events.push(ev);
        onEvent?.(ev);
      },
    });
    return { state, events, error: null, testResult: null };
  } catch (e) {
    return {
      state: null,
      events,
      error: e instanceof Error ? e.message : String(e),
      testResult: null,
    };
  }
}

function sourceHasExpect(source: string): boolean {
  try {
    const { program } = parseWithRecovery(source);
    if (program.flows.length === 0) return false;
    return program.flows[0]!.body.some((n): n is ExpectStmt => n.type === "ExpectStmt");
  } catch {
    return false;
  }
}

// Graph visualization helpers
export interface GraphNode {
  id: string;
  label: string;
  isReady: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: "stake" | "await";
}

export function buildGraphData(graph: DepGraph): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const [name, dep] of graph.agents) {
    nodes.push({
      id: name,
      label: name,
      isReady: dep.isReady,
    });

    for (const target of dep.stakesTo) {
      edges.push({ from: name, to: target, type: "stake" });
    }
    for (const source of dep.awaitsFrom) {
      edges.push({ from: source, to: name, type: "await" });
    }
  }

  return { nodes, edges };
}
