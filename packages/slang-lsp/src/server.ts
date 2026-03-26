// ─── SLANG Language Server ───

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  Diagnostic,
  DiagnosticSeverity,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  DefinitionParams,
  Location,
  Range,
  Position,
  Hover,
  DocumentSymbol,
  SymbolKind,
} from "vscode-languageserver/node.js";

import { TextDocument } from "vscode-languageserver-textdocument";

import {
  parseWithRecovery,
  analyzeFlow,
  resolveDeps,
  detectDeadlocks,
  TokenType,
} from "@riktar/slang";

import type {
  Program,
  FlowDecl,
  AgentDecl,
  ImportStmt,
  Span,
  ParseResult,
  FlowDiagnostic,
} from "@riktar/slang";

// ─── Connection Setup ───

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// Cache: uri → last parse result
const parseCache = new Map<string, { program: Program; version: number }>();

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      completionProvider: {
        triggerCharacters: ["@", ":", "."],
      },
      definitionProvider: true,
      hoverProvider: true,
      documentSymbolProvider: true,
    },
  };
});

// ─── Diagnostics ───

documents.onDidChangeContent((change) => {
  validateDocument(change.document);
});

function validateDocument(doc: TextDocument): void {
  const source = doc.getText();
  const diagnostics: Diagnostic[] = [];

  const result = parseWithRecovery(source);
  parseCache.set(doc.uri, { program: result.program, version: doc.version });

  // Parse errors
  for (const err of result.errors) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: (err.line ?? 1) - 1, character: (err.column ?? 1) - 1 },
        end: { line: (err.line ?? 1) - 1, character: (err.column ?? 1) + 10 },
      },
      message: err.message,
      source: "slang",
      code: err.code,
    });
  }

  // Static analysis diagnostics
  for (const flow of result.program.flows) {
    const flowDiags = analyzeFlow(flow);
    for (const d of flowDiags) {
      diagnostics.push({
        severity: d.level === "error" ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
        range: spanToRange(flow.span),
        message: d.message,
        source: "slang",
      });
    }

    // Deadlock detection
    const graph = resolveDeps(flow);
    const deadlocks = detectDeadlocks(graph);
    for (const cycle of deadlocks) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: spanToRange(flow.span),
        message: `Deadlock detected: ${cycle.join(" → ")} → ${cycle[0]}`,
        source: "slang",
      });
    }
  }

  connection.sendDiagnostics({ uri: doc.uri, diagnostics });
}

// ─── Completion ───

connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];

  const text = doc.getText();
  const offset = doc.offsetAt(params.position);
  const lineText = text.substring(text.lastIndexOf("\n", offset - 1) + 1, offset);

  const items: CompletionItem[] = [];

  // Agent ref completions after @
  if (lineText.endsWith("@") || /@\w*$/.test(lineText)) {
    const cached = parseCache.get(doc.uri);
    if (cached) {
      const agents = collectAgentNames(cached.program);
      for (const name of agents) {
        items.push({
          label: `@${name}`,
          kind: CompletionItemKind.Reference,
          detail: "Agent reference",
          insertText: name,
        });
      }
      // Special refs
      for (const special of ["out", "all", "Human", "any"]) {
        items.push({
          label: `@${special}`,
          kind: CompletionItemKind.Keyword,
          detail: "Special reference",
          insertText: special,
        });
      }
    }
    return items;
  }

  // Meta key completions after agent body opening
  if (/^\s*$/.test(lineText) || /^\s*\w*$/.test(lineText)) {
    // Keywords
    const keywords = [
      { label: "flow", kind: CompletionItemKind.Keyword, detail: "Declare a flow" },
      { label: "agent", kind: CompletionItemKind.Keyword, detail: "Declare an agent" },
      { label: "stake", kind: CompletionItemKind.Keyword, detail: "Produce & send (or execute locally)" },
      { label: "await", kind: CompletionItemKind.Keyword, detail: "Wait for input" },
      { label: "commit", kind: CompletionItemKind.Keyword, detail: "Accept & stop" },
      { label: "escalate", kind: CompletionItemKind.Keyword, detail: "Delegate upward" },
      { label: "when", kind: CompletionItemKind.Keyword, detail: "Conditional block" },
      { label: "if", kind: CompletionItemKind.Keyword, detail: "Conditional (alias)" },
      { label: "else", kind: CompletionItemKind.Keyword, detail: "Else branch" },
      { label: "otherwise", kind: CompletionItemKind.Keyword, detail: "Else branch (alias)" },
      { label: "let", kind: CompletionItemKind.Keyword, detail: "Declare variable" },
      { label: "set", kind: CompletionItemKind.Keyword, detail: "Update variable" },
      { label: "repeat", kind: CompletionItemKind.Keyword, detail: "Loop block" },
      { label: "converge", kind: CompletionItemKind.Keyword, detail: "Convergence condition" },
      { label: "budget", kind: CompletionItemKind.Keyword, detail: "Resource limits" },
      { label: "deliver", kind: CompletionItemKind.Keyword, detail: "Post-convergence handler" },
      { label: "import", kind: CompletionItemKind.Keyword, detail: "Import another flow" },
      { label: "role", kind: CompletionItemKind.Property, detail: "Agent role (meta)" },
      { label: "model", kind: CompletionItemKind.Property, detail: "LLM model (meta)" },
      { label: "tools", kind: CompletionItemKind.Property, detail: "Tool list (meta)" },
      { label: "retry", kind: CompletionItemKind.Property, detail: "Retry count (meta)" },
      { label: "output", kind: CompletionItemKind.Property, detail: "Structured output schema" },
    ];
    items.push(...keywords);
  }

  return items;
});

// ─── Go to Definition ───

connection.onDefinition((params: DefinitionParams): Location | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;

  const cached = parseCache.get(doc.uri);
  if (!cached) return null;

  const text = doc.getText();
  const offset = doc.offsetAt(params.position);

  // Find @AgentRef at cursor
  const agentRefMatch = findAgentRefAtOffset(text, offset);
  if (!agentRefMatch) return null;

  // Find the agent declaration
  for (const flow of cached.program.flows) {
    for (const item of flow.body) {
      if (item.type === "AgentDecl" && item.name === agentRefMatch) {
        return {
          uri: doc.uri,
          range: spanToRange(item.span),
        };
      }
    }
  }

  return null;
});

// ─── Hover ───

connection.onHover((params: TextDocumentPositionParams): Hover | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;

  const cached = parseCache.get(doc.uri);
  if (!cached) return null;

  const text = doc.getText();
  const offset = doc.offsetAt(params.position);

  // Hover on @AgentRef
  const agentRefName = findAgentRefAtOffset(text, offset);
  if (agentRefName) {
    for (const flow of cached.program.flows) {
      for (const item of flow.body) {
        if (item.type === "AgentDecl" && item.name === agentRefName) {
          const agent = item as AgentDecl;
          const lines = [`**agent ${agent.name}**`];
          if (agent.meta.role) lines.push(`- role: "${agent.meta.role}"`);
          if (agent.meta.model) lines.push(`- model: \`${agent.meta.model}\``);
          if (agent.meta.tools?.length) lines.push(`- tools: [${agent.meta.tools.join(", ")}]`);
          if (agent.meta.retry) lines.push(`- retry: ${agent.meta.retry}`);
          lines.push(`- operations: ${agent.operations.length}`);
          return { contents: { kind: "markdown", value: lines.join("\n") } };
        }
      }
    }
    // Special references
    const specials: Record<string, string> = {
      out: "**@out** — Flow output. Stakes sent here become the flow result.",
      all: "**@all** — Broadcast. Sends to all other agents in the flow.",
      Human: "**@Human** — Human escalation target.",
      any: "**@any** — Await from any agent that has staked to this agent.",
    };
    if (specials[agentRefName]) {
      return { contents: { kind: "markdown", value: specials[agentRefName] } };
    }
  }

  // Hover on keywords
  const word = getWordAtOffset(text, offset);
  const keywordDocs: Record<string, string> = {
    stake: "**stake** — Produce content and send to recipients, or execute locally.\n\n`stake func(args) -> @Target`\n`stake func(args)` (local)\n`let var = stake func(args)`",
    await: "**await** — Block until data arrives from a source agent.\n\n`await binding <- @Source`",
    commit: "**commit** — Accept the result and stop this agent.\n\n`commit [value] [if condition]`",
    escalate: "**escalate** — Reject and delegate to another agent.\n\n`escalate @Target [reason: \"...\"] [if condition]`",
    flow: "**flow** — Top-level workflow declaration.\n\n`flow \"name\" { ... }`\n`flow \"name\" (param: \"type\", ...) { ... }` (parametric)",
    agent: "**agent** — Declare an autonomous agent.\n\n`agent Name { ... }`",
    converge: "**converge** — Define when the flow should stop.\n\n`converge when: condition`",
    budget: "**budget** — Set resource limits.\n\n`budget: tokens(N), rounds(N), time(N)`",
    deliver: "**deliver** — Post-convergence side effect.\n\n`deliver: handler(args)`",
    when: "**when** — Conditional execution block.\n\n`when condition { ... } else { ... }`",
    repeat: "**repeat** — Loop until a condition is met.\n\n`repeat until condition { ... }`",
    let: "**let** — Declare a local variable.\n\n`let name = value`\n`let name = stake func(args)` (execute & store)",
    set: "**set** — Update a local variable.\n\n`set name = value`\n`set name = stake func(args)` (execute & update)",
  };
  if (word && keywordDocs[word]) {
    return { contents: { kind: "markdown", value: keywordDocs[word] } };
  }

  return null;
});

// ─── Document Symbols (Outline) ───

connection.onDocumentSymbol((params): DocumentSymbol[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];

  const cached = parseCache.get(doc.uri);
  if (!cached) return [];

  const symbols: DocumentSymbol[] = [];

  for (const flow of cached.program.flows) {
    const flowChildren: DocumentSymbol[] = [];

    for (const item of flow.body) {
      if (item.type === "AgentDecl") {
        const agentChildren: DocumentSymbol[] = [];

        for (const op of item.operations) {
          if (op.type === "StakeOp") {
            agentChildren.push({
              name: `stake ${op.call.name}(...)`,
              kind: SymbolKind.Function,
              range: spanToRange(op.span),
              selectionRange: spanToRange(op.span),
            });
          } else if (op.type === "AwaitOp") {
            agentChildren.push({
              name: `await ${op.binding}`,
              kind: SymbolKind.Event,
              range: spanToRange(op.span),
              selectionRange: spanToRange(op.span),
            });
          } else if (op.type === "CommitOp") {
            agentChildren.push({
              name: "commit",
              kind: SymbolKind.Event,
              range: spanToRange(op.span),
              selectionRange: spanToRange(op.span),
            });
          }
        }

        flowChildren.push({
          name: `agent ${item.name}`,
          kind: SymbolKind.Class,
          range: spanToRange(item.span),
          selectionRange: spanToRange(item.span),
          children: agentChildren,
        });
      } else if (item.type === "ConvergeStmt") {
        flowChildren.push({
          name: "converge",
          kind: SymbolKind.Property,
          range: spanToRange(item.span),
          selectionRange: spanToRange(item.span),
        });
      } else if (item.type === "BudgetStmt") {
        flowChildren.push({
          name: "budget",
          kind: SymbolKind.Property,
          range: spanToRange(item.span),
          selectionRange: spanToRange(item.span),
        });
      } else if (item.type === "DeliverStmt") {
        flowChildren.push({
          name: `deliver: ${item.call.name}(...)`,
          kind: SymbolKind.Function,
          range: spanToRange(item.span),
          selectionRange: spanToRange(item.span),
        });
      } else if (item.type === "ImportStmt") {
        const imp = item as ImportStmt;
        flowChildren.push({
          name: `import "${imp.path}" as ${imp.alias}`,
          kind: SymbolKind.Module,
          range: spanToRange(item.span),
          selectionRange: spanToRange(item.span),
        });
      }
    }

    const paramsSuffix = flow.params?.length
      ? ` (${flow.params.map((p: { name: string; paramType: string }) => `${p.name}: "${p.paramType}"`).join(", ")})`
      : "";

    symbols.push({
      name: `flow "${flow.name}"${paramsSuffix}`,
      kind: SymbolKind.Module,
      range: spanToRange(flow.span),
      selectionRange: spanToRange(flow.span),
      children: flowChildren,
    });
  }

  return symbols;
});

// ─── Helpers ───

function spanToRange(span: Span): Range {
  return {
    start: { line: span.start.line - 1, character: span.start.column - 1 },
    end: { line: span.end.line - 1, character: span.end.column - 1 },
  };
}

function collectAgentNames(program: Program): string[] {
  const names: string[] = [];
  for (const flow of program.flows) {
    for (const item of flow.body) {
      if (item.type === "AgentDecl") {
        names.push(item.name);
      }
    }
  }
  return names;
}

function findAgentRefAtOffset(text: string, offset: number): string | null {
  // Search backwards for @
  const before = text.substring(Math.max(0, offset - 50), offset + 50);
  const relOffset = Math.min(50, offset);
  const regex = /@([A-Za-z_][A-Za-z0-9_]*)/g;
  let match;
  while ((match = regex.exec(before)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (relOffset >= start && relOffset <= end) {
      return match[1];
    }
  }
  return null;
}

function getWordAtOffset(text: string, offset: number): string | null {
  let start = offset;
  let end = offset;
  while (start > 0 && /[a-zA-Z_]/.test(text[start - 1])) start--;
  while (end < text.length && /[a-zA-Z_]/.test(text[end])) end++;
  const word = text.substring(start, end);
  return word.length > 0 ? word : null;
}

// ─── Start ───

documents.listen(connection);
connection.listen();
