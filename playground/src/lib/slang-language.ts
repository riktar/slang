// Monaco Editor language definition for SLANG
import type * as monaco from 'monaco-editor';

export const SLANG_LANGUAGE_ID = 'slang';

export const languageConfiguration: monaco.languages.LanguageConfiguration = {
  comments: {
    lineComment: '--',
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"', notIn: ['string'] },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
  ],
  folding: {
    markers: {
      start: /\{/,
      end: /\}/,
    },
  },
  indentationRules: {
    increaseIndentPattern: /\{\s*$/,
    decreaseIndentPattern: /^\s*\}/,
  },
  wordPattern: /@?[a-zA-Z_][a-zA-Z0-9_]*/,
};

export const monarchTokensProvider: monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.slang',

  keywords: [
    'flow', 'agent', 'import', 'as', 'deliver',
    'converge', 'budget',
    'when', 'if', 'else', 'otherwise',
    'repeat', 'until',
    'let', 'set',
    'expect', 'contains',
  ],

  primitives: ['stake', 'await', 'commit', 'escalate'],

  meta: ['role', 'model', 'tools', 'tokens', 'rounds', 'time', 'count', 'reason', 'retry', 'output'],

  booleans: ['true', 'false'],

  operators: ['->', '<-', '==', '!=', '>=', '<=', '>', '<', '&&', '||', '='],

  symbols: /[=><!~?:&|+\-*\/\^%]+/,

  tokenizer: {
    root: [
      // Comments
      [/--.*$/, 'comment'],

      // Agent references (special)
      [/@(out|all|Human|any)\b/, 'variable.special'],
      // Agent references (general)
      [/@[A-Za-z_][A-Za-z0-9_]*/, 'variable.agent-ref'],

      // flow "name" pattern
      [/\b(flow)\s+("(?:[^"\\]|\\.)*")/, ['keyword.flow', 'string']],
      // agent Name pattern
      [/\b(agent)\s+([A-Z][a-zA-Z0-9_]*)/, ['keyword.flow', 'type.agent']],

      // Identifiers and keywords
      [/[a-zA-Z_]\w*/, {
        cases: {
          '@primitives': 'keyword.primitive',
          '@keywords': 'keyword',
          '@meta': 'keyword.meta',
          '@booleans': 'constant.boolean',
          '@default': 'identifier',
        },
      }],

      // Whitespace
      [/\s+/, 'white'],

      // Strings
      [/"/, 'string', '@string'],

      // Numbers
      [/\b\d+(\.\d+)?\b/, 'number'],

      // Operators
      [/->|<-/, 'operator.arrow'],
      [/==|!=|>=|<=/, 'operator.comparison'],
      [/&&|\|\|/, 'operator.logical'],
      [/[><=]/, 'operator'],

      // Punctuation
      [/[{}]/, 'delimiter.bracket'],
      [/[[\]]/, 'delimiter.square'],
      [/[()]/, 'delimiter.parenthesis'],
      [/[:,.]/, 'delimiter'],

      // Wildcard
      [/\*/, 'operator.wildcard'],
    ],

    string: [
      [/\\[nrt"\\]/, 'string.escape'],
      [/"/, 'string', '@pop'],
      [/[^"\\]+/, 'string'],
    ],
  },
};

// Theme rules for SLANG tokens
export const slangThemeRules: monaco.editor.ITokenThemeRule[] = [
  { token: 'comment.slang', foreground: '6A9955', fontStyle: 'italic' },
  { token: 'keyword.slang', foreground: 'C586C0' },
  { token: 'keyword.flow.slang', foreground: 'C586C0', fontStyle: 'bold' },
  { token: 'keyword.primitive.slang', foreground: '569CD6', fontStyle: 'bold' },
  { token: 'keyword.meta.slang', foreground: '9CDCFE' },
  { token: 'type.agent.slang', foreground: '4EC9B0', fontStyle: 'bold' },
  { token: 'variable.agent-ref.slang', foreground: '4FC1FF' },
  { token: 'variable.special.slang', foreground: '4FC1FF', fontStyle: 'italic' },
  { token: 'string.slang', foreground: 'CE9178' },
  { token: 'string.escape.slang', foreground: 'D7BA7D' },
  { token: 'number.slang', foreground: 'B5CEA8' },
  { token: 'constant.boolean.slang', foreground: '569CD6' },
  { token: 'operator.arrow.slang', foreground: 'D4D4D4', fontStyle: 'bold' },
  { token: 'operator.comparison.slang', foreground: 'D4D4D4' },
  { token: 'operator.logical.slang', foreground: 'D4D4D4' },
  { token: 'operator.slang', foreground: 'D4D4D4' },
  { token: 'operator.wildcard.slang', foreground: '4FC1FF' },
  { token: 'delimiter.bracket.slang', foreground: 'FFD700' },
  { token: 'delimiter.square.slang', foreground: 'DA70D6' },
  { token: 'delimiter.parenthesis.slang', foreground: 'D4D4D4' },
  { token: 'delimiter.slang', foreground: 'D4D4D4' },
  { token: 'identifier.slang', foreground: 'D4D4D4' },
];

export const SLANG_THEME: monaco.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: slangThemeRules,
  colors: {
    'editor.background': '#09090b',
    'editor.foreground': '#d4d4d4',
    'editorLineNumber.foreground': '#505050',
    'editorLineNumber.activeForeground': '#909090',
    'editor.selectionBackground': '#264f7844',
    'editor.lineHighlightBackground': '#ffffff08',
    'editorCursor.foreground': '#f59e0b',
    'editorIndentGuide.background': '#303030',
  },
};
