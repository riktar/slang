// Monaco integration: completions, diagnostics, hover — reusing SLANG core
import type * as monaco from 'monaco-editor';
import { analyzeSource } from './engine';
import type { Program, FlowDecl, AgentDecl } from '@slang/ast.js';

// ─── Completion Provider ───

const PRIMITIVE_COMPLETIONS = [
  { label: 'stake', detail: 'Produce content and send it', insertText: 'stake ${1:action}(${2:args}) -> @${3:Target}', kind: 1 },
  { label: 'await', detail: 'Block until data arrives', insertText: 'await ${1:data} <- @${2:Source}', kind: 1 },
  { label: 'commit', detail: 'Accept result and stop', insertText: 'commit', kind: 1 },
  { label: 'escalate', detail: 'Delegate to another agent', insertText: 'escalate @${1:Target} reason: "${2:reason}"', kind: 1 },
];

const KEYWORD_COMPLETIONS = [
  { label: 'flow', detail: 'Flow declaration', insertText: 'flow "${1:name}" {\n\t${0}\n}', kind: 14 },
  { label: 'agent', detail: 'Agent declaration', insertText: 'agent ${1:Name} {\n\trole: "${2:description}"\n\t${0}\n}', kind: 7 },
  { label: 'when', detail: 'Conditional block', insertText: 'when ${1:condition} {\n\t${0}\n}', kind: 14 },
  { label: 'repeat', detail: 'Loop construct', insertText: 'repeat until ${1:condition} {\n\t${0}\n}', kind: 14 },
  { label: 'converge', detail: 'Convergence condition', insertText: 'converge when: ${1:all_committed}', kind: 14 },
  { label: 'budget', detail: 'Budget constraint', insertText: 'budget: ${1|rounds,tokens,time|}(${2:value})', kind: 14 },
  { label: 'deliver', detail: 'Post-convergence handler', insertText: 'deliver {\n\t${0}\n}', kind: 14 },
  { label: 'import', detail: 'Import another flow', insertText: 'import "${1:path}" as ${2:Name}', kind: 14 },
  { label: 'let', detail: 'Declare a variable', insertText: 'let ${1:name} = ${2:value}', kind: 14 },
  { label: 'set', detail: 'Update a variable', insertText: 'set ${1:name} = ${2:value}', kind: 14 },
];

const META_COMPLETIONS = [
  { label: 'role:', detail: 'Agent role description', insertText: 'role: "${1:description}"', kind: 10 },
  { label: 'model:', detail: 'LLM model to use', insertText: 'model: "${1:gpt-4o}"', kind: 10 },
  { label: 'tools:', detail: 'Available tools', insertText: 'tools: [${1:tool_name}]', kind: 10 },
  { label: 'output:', detail: 'Output schema', insertText: 'output: { ${1:key}: "${2:type}" }', kind: 10 },
  { label: 'retry:', detail: 'Retry configuration', insertText: 'retry: ${1:3}', kind: 10 },
];

const SPECIAL_REFS = [
  { label: '@out', detail: 'Flow output', insertText: '@out', kind: 6 },
  { label: '@all', detail: 'Broadcast to all agents', insertText: '@all', kind: 6 },
  { label: '@Human', detail: 'Human-in-the-loop', insertText: '@Human', kind: 6 },
  { label: '@any', detail: 'Any available agent', insertText: '@any', kind: 6 },
];

export function createCompletionProvider(getSource: () => string): monaco.languages.CompletionItemProvider {
  return {
    triggerCharacters: ['@', ' ', '\n'],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range: monaco.IRange = {
        startLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: word.endColumn,
      };

      const lineContent = model.getLineContent(position.lineNumber);
      const charBefore = lineContent[position.column - 2];

      const suggestions: monaco.languages.CompletionItem[] = [];

      // After @, suggest agent names from source + special refs
      if (charBefore === '@') {
        const atRange: monaco.IRange = {
          ...range,
          startColumn: range.startColumn - 1,
        };

        // Extract agent names from the source
        const source = getSource();
        const agentNames = extractAgentNames(source);
        for (const name of agentNames) {
          suggestions.push({
            label: `@${name}`,
            kind: 6 as monaco.languages.CompletionItemKind,
            insertText: `@${name}`,
            range: atRange,
            detail: 'Agent reference',
          });
        }

        for (const ref of SPECIAL_REFS) {
          suggestions.push({
            ...ref,
            kind: ref.kind as monaco.languages.CompletionItemKind,
            range: atRange,
          });
        }

        return { suggestions };
      }

      // General completions
      for (const item of [...PRIMITIVE_COMPLETIONS, ...KEYWORD_COMPLETIONS, ...META_COMPLETIONS]) {
        suggestions.push({
          label: item.label,
          kind: item.kind as monaco.languages.CompletionItemKind,
          insertText: item.insertText,
          insertTextRules: 4, // InsertAsSnippet
          range,
          detail: item.detail,
        });
      }

      return { suggestions };
    },
  };
}

function extractAgentNames(source: string): string[] {
  const names: string[] = [];
  const re = /\bagent\s+([A-Z][a-zA-Z0-9_]*)/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    names.push(m[1]);
  }
  return names;
}

// ─── Diagnostics (Markers) ───

export function computeMarkers(source: string): monaco.editor.IMarkerData[] {
  const result = analyzeSource(source);
  const markers: monaco.editor.IMarkerData[] = [];

  for (const err of result.errors) {
    markers.push({
      severity: 8, // MarkerSeverity.Error
      message: err.message,
      startLineNumber: err.line,
      startColumn: err.column,
      endLineNumber: err.line,
      endColumn: err.column + 1,
      source: 'slang',
    });
  }

  for (const d of result.diagnostics) {
    markers.push({
      severity: d.level === 'error' ? 8 : 4, // Error : Warning
      message: d.message,
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 1,
      source: 'slang',
    });
  }

  for (const cycle of result.deadlocks) {
    markers.push({
      severity: 8,
      message: `Deadlock: ${cycle.join(' → ')} → ${cycle[0]}`,
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 1,
      source: 'slang',
    });
  }

  return markers;
}

// ─── Hover Provider ───

const KEYWORD_DOCS: Record<string, string> = {
  stake: '**stake** — Produce content and send it to another agent (or execute locally).\n\nSyntax: `stake action(args) -> @Target`',
  await: '**await** — Block until another agent sends you data.\n\nSyntax: `await variable <- @Source`',
  commit: '**commit** — Accept the result and stop the agent.\n\nSyntax: `commit [value] [if condition]`',
  escalate: '**escalate** — Delegate to another agent (e.g. human).\n\nSyntax: `escalate @Target reason: "why"`',
  flow: '**flow** — Declare a multi-agent workflow.\n\nSyntax: `flow "name" { ... }`',
  agent: '**agent** — Declare an agent within a flow.\n\nSyntax: `agent Name { role: "..." ... }`',
  converge: '**converge** — Define the convergence condition for the flow.\n\nSyntax: `converge when: all_committed`',
  budget: '**budget** — Set resource limits for the flow.\n\nSyntax: `budget: rounds(N), tokens(N), time(N)`',
  when: '**when** — Conditional block.\n\nSyntax: `when condition { ... }`',
  repeat: '**repeat** — Loop until a condition is met.\n\nSyntax: `repeat until condition { ... }`',
  let: '**let** — Declare a local variable.\n\nSyntax: `let name = value`',
  set: '**set** — Update a variable.\n\nSyntax: `set name = value`',
  deliver: '**deliver** — Post-convergence handler.\n\nSyntax: `deliver { ... }`',
  import: '**import** — Import another flow.\n\nSyntax: `import "path" as Name`',
};

export function createHoverProvider(getSource: () => string): monaco.languages.HoverProvider {
  return {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      const text = word.word;

      if (KEYWORD_DOCS[text]) {
        return {
          range: {
            startLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endLineNumber: position.lineNumber,
            endColumn: word.endColumn,
          },
          contents: [{ value: KEYWORD_DOCS[text] }],
        };
      }

      // Check if it's an agent ref
      const lineContent = model.getLineContent(position.lineNumber);
      const charBeforeWord = lineContent[word.startColumn - 2];
      if (charBeforeWord === '@') {
        const source = getSource();
        const agentNames = extractAgentNames(source);
        if (agentNames.includes(text)) {
          return {
            range: {
              startLineNumber: position.lineNumber,
              startColumn: word.startColumn - 1,
              endLineNumber: position.lineNumber,
              endColumn: word.endColumn,
            },
            contents: [{ value: `**@${text}** — Agent reference` }],
          };
        }
      }

      return null;
    },
  };
}
