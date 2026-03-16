import { useState, useCallback, useRef } from 'react';
import Editor, { type OnMount, loader } from '@monaco-editor/react';
import type * as monaco from 'monaco-editor';
import { analyzeSource, buildGraphData, type AnalysisResult, type GraphNode, type GraphEdge } from './lib/engine';
import { EXAMPLES } from './lib/examples';
import { cn } from './lib/utils';
import { FileCode, GitFork, AlertTriangle, CheckCircle, XCircle, ChevronDown, Zap, Download, Github, Copy, Terminal, X, ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';
import { SLANG_LANGUAGE_ID, languageConfiguration, monarchTokensProvider, SLANG_THEME } from './lib/slang-language';
import ZERO_SETUP_PROMPT from '../../ZERO_SETUP_PROMPT.md?raw';
import { createCompletionProvider, createHoverProvider, computeMarkers } from './lib/slang-monaco';

const DEFAULT_SOURCE = EXAMPLES.hello.source;

// Register SLANG language with Monaco before it loads
let languageRegistered = false;
function registerSlangLanguage(monacoInstance: typeof monaco) {
  if (languageRegistered) return;
  languageRegistered = true;

  monacoInstance.languages.register({ id: SLANG_LANGUAGE_ID, extensions: ['.slang'] });
  monacoInstance.languages.setLanguageConfiguration(SLANG_LANGUAGE_ID, languageConfiguration);
  monacoInstance.languages.setMonarchTokensProvider(SLANG_LANGUAGE_ID, monarchTokensProvider);
  monacoInstance.editor.defineTheme('slang-dark', SLANG_THEME);
}

export default function App() {
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const [analysis, setAnalysis] = useState<AnalysisResult>(() => analyzeSource(DEFAULT_SOURCE));
  const [activeTab, setActiveTab] = useState<'graph' | 'ast'>('graph');
  const [showExamples, setShowExamples] = useState(false);
  const [showRunModal, setShowRunModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const monacoRef = useRef<typeof monaco | null>(null);
  const editorInstanceRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const handleEditorWillMount = useCallback((monacoInstance: typeof monaco) => {
    registerSlangLanguage(monacoInstance);
  }, []);

  const handleEditorDidMount: OnMount = useCallback((editor, monacoInstance) => {
    monacoRef.current = monacoInstance;
    editorInstanceRef.current = editor;

    // Register completion & hover providers
    monacoInstance.languages.registerCompletionItemProvider(
      SLANG_LANGUAGE_ID,
      createCompletionProvider(() => sourceRef.current),
    );
    monacoInstance.languages.registerHoverProvider(
      SLANG_LANGUAGE_ID,
      createHoverProvider(() => sourceRef.current),
    );

    // Initial markers
    const model = editor.getModel();
    if (model) {
      monacoInstance.editor.setModelMarkers(model, 'slang', computeMarkers(source));
    }

    editor.focus();
  }, [source]);

  const handleSourceChange = useCallback((value: string | undefined) => {
    const newValue = value ?? '';
    setSource(newValue);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const result = analyzeSource(newValue);
      setAnalysis(result);

      // Update Monaco markers
      if (monacoRef.current && editorInstanceRef.current) {
        const model = editorInstanceRef.current.getModel();
        if (model) {
          monacoRef.current.editor.setModelMarkers(model, 'slang', computeMarkers(newValue));
        }
      }
    }, 300);
  }, []);


  const handleLoadExample = useCallback((key: string) => {
    const example = EXAMPLES[key];
    if (example) {
      setSource(example.source);
      setAnalysis(analyzeSource(example.source));
      setShowExamples(false);
    }
  }, []);

  const handleSave = useCallback(() => {
    const blob = new Blob([source], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'flow.slang';
    a.click();
    URL.revokeObjectURL(url);
  }, [source]);

  const handleCopyAndOpen = useCallback((target: 'chatgpt' | 'claude') => {
    const prompt = ZERO_SETUP_PROMPT + '\n\n---\n\nExecute this SLANG flow:\n\n```slang\n' + source + '\n```';
    navigator.clipboard.writeText(prompt).then(() => {
      const label = target === 'chatgpt' ? 'ChatGPT' : 'Claude';
      setToastMessage(`Prompt copied! Paste it (Ctrl+V) in ${label}`);
      setTimeout(() => setToastMessage(null), 6000);
      const url = target === 'chatgpt' ? 'https://chatgpt.com/' : 'https://claude.ai/new';
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }, [source]);

  const graphData = analysis.graph ? buildGraphData(analysis.graph) : null;
  const hasErrors = analysis.errors.length > 0;
  const hasWarnings = analysis.diagnostics.filter(d => d.level === 'warning').length > 0;
  const hasCritical = analysis.diagnostics.filter(d => d.level === 'error').length > 0;
  const hasDeadlocks = analysis.deadlocks.length > 0;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            <h1 className="text-lg font-bold tracking-tight">SLANG Playground</h1>
            <span className="text-xs text-zinc-500 font-mono">v0.7.5</span>
          </div>
          <span className="text-zinc-700 hidden sm:block">·</span>
          <p className="text-xs text-zinc-500 hidden sm:block">
            Write the workflow, your LLM runs it. No code needed.
          </p>
          <a
            href="https://github.com/riktar/slang"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            title="View on GitHub"
          >
            <Github className="w-4 h-4" />
            <span className="hidden md:inline">riktar/slang</span>
          </a>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors"
            title="Save as flow.slang"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Save</span>
          </button>
          <div className="relative">
            <button
              onClick={() => { setShowExamples(!showExamples); setShowRunModal(false); }}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors"
            >
              <FileCode className="w-4 h-4" />
              Examples
              <ChevronDown className="w-3 h-3" />
            </button>
            {showExamples && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50">
                {Object.entries(EXAMPLES).map(([key, ex]) => (
                  <button
                    key={key}
                    onClick={() => handleLoadExample(key)}
                    className="block w-full text-left px-4 py-2 text-sm hover:bg-zinc-700 first:rounded-t-lg last:rounded-b-lg transition-colors"
                  >
                    {ex.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <button
              onClick={() => { setShowRunModal(!showRunModal); setShowExamples(false); }}
              className="flex items-center gap-1.5 px-5 py-1.5 text-sm font-semibold bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white rounded-md transition-all shadow-lg shadow-violet-900/30 hover:shadow-violet-800/40"
            >
              <Zap className="w-4 h-4" />
              Run with your LLM
              <ChevronDown className="w-3 h-3" />
            </button>
            {showRunModal && (
              <div className="absolute right-0 top-full mt-1 w-80 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 p-1">
                <div className="px-3 py-2 text-xs text-zinc-400 border-b border-zinc-700 mb-1">
                  Your flow will be copied to clipboard. Paste it in the chat.
                </div>
                <button
                  onClick={() => { handleCopyAndOpen('chatgpt'); setShowRunModal(false); }}
                  className="flex items-center gap-3 w-full text-left px-3 py-2.5 text-sm hover:bg-zinc-700 rounded-md transition-colors"
                >
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="white"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg>
                  <div>
                    <div className="font-medium">Run in ChatGPT</div>
                    <div className="text-xs text-zinc-500">Opens chatgpt.com — paste with Ctrl+V</div>
                  </div>
                </button>
                <button
                  onClick={() => { handleCopyAndOpen('claude'); setShowRunModal(false); }}
                  className="flex items-center gap-3 w-full text-left px-3 py-2.5 text-sm hover:bg-zinc-700 rounded-md transition-colors"
                >
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 64 64" fill="white"><path d="M32 4L35.5 22.5L48 8L40.5 25.5L56 16L43.5 29.5L60 28L43 33L60 36L43.5 34.5L56 48L40.5 38.5L48 56L35.5 41.5L32 60L28.5 41.5L16 56L23.5 38.5L8 48L20.5 34.5L4 36L21 33L4 28L20.5 29.5L8 16L23.5 25.5L16 8L28.5 22.5Z"/></svg>
                  <div>
                    <div className="font-medium">Run in Claude</div>
                    <div className="text-xs text-zinc-500">Opens claude.ai — paste with Ctrl+V</div>
                  </div>
                </button>
                <div className="border-t border-zinc-700 my-1" />
                <button
                  onClick={() => { const prompt = ZERO_SETUP_PROMPT + '\n\n---\n\nExecute this SLANG flow:\n\n```slang\n' + source + '\n```'; navigator.clipboard.writeText(prompt); setToastMessage('Prompt + flow copied! Paste it in any LLM.'); setTimeout(() => setToastMessage(null), 5000); setShowRunModal(false); }}
                  className="flex items-center gap-3 w-full text-left px-3 py-2.5 text-sm hover:bg-zinc-700 rounded-md transition-colors"
                >
                  <Copy className="w-5 h-5 text-zinc-400 shrink-0" />
                  <div>
                    <div className="font-medium">Copy prompt</div>
                    <div className="text-xs text-zinc-500">For Gemini, Copilot, or any other LLM</div>
                  </div>
                </button>
                <div className="border-t border-zinc-700 my-1" />
                <button
                  onClick={() => { navigator.clipboard.writeText('npm install -g @riktar/slang'); setToastMessage('Install command copied!'); setTimeout(() => setToastMessage(null), 3000); setShowRunModal(false); }}
                  className="flex items-center gap-3 w-full text-left px-3 py-2.5 text-sm hover:bg-zinc-700 rounded-md transition-colors"
                >
                  <Terminal className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <div className="font-medium">Install CLI</div>
                    <div className="text-xs text-zinc-500 font-mono">npm i -g @riktar/slang</div>
                  </div>
                </button>
              </div>
            )}
          </div>

        </div>
      </header>

      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-5 py-3 bg-violet-600 text-white text-sm font-medium rounded-lg shadow-2xl shadow-violet-900/50 animate-bounce">
          <Copy className="w-5 h-5 shrink-0" />
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 hover:text-violet-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Editor */}
        <div className="w-1/2 flex flex-col border-r border-zinc-800">
          <div className="px-3 py-1.5 text-xs text-zinc-500 border-b border-zinc-800 bg-zinc-900/50 font-mono flex items-center gap-2">
            <FileCode className="w-3.5 h-3.5" />
            editor.slang
            {!hasErrors && <CheckCircle className="w-3.5 h-3.5 text-emerald-500 ml-auto" />}
            {hasErrors && <XCircle className="w-3.5 h-3.5 text-red-500 ml-auto" />}
          </div>
          <div className="flex-1 relative">
            <Editor
              language={SLANG_LANGUAGE_ID}
              theme="slang-dark"
              value={source}
              onChange={handleSourceChange}
              beforeMount={handleEditorWillMount}
              onMount={handleEditorDidMount}
              options={{
                fontSize: 14,
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace",
                fontLigatures: true,
                minimap: { enabled: false },
                lineNumbers: 'on',
                renderLineHighlight: 'line',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                insertSpaces: true,
                bracketPairColorization: { enabled: true },
                autoClosingBrackets: 'always',
                autoClosingQuotes: 'always',
                autoIndent: 'full',
                formatOnPaste: true,
                suggestOnTriggerCharacters: true,
                wordBasedSuggestions: 'off',
                quickSuggestions: true,
                padding: { top: 12 },
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,
                overviewRulerBorder: false,
                scrollbar: {
                  verticalScrollbarSize: 6,
                  horizontalScrollbarSize: 6,
                },
                glyphMargin: false,
                folding: true,
                lineDecorationsWidth: 8,
              }}
            />
          </div>

          {/* Error / Warning bar */}
          {(hasErrors || hasCritical || hasWarnings || hasDeadlocks) && (
            <div className="border-t border-zinc-800 bg-zinc-900/80 max-h-40 overflow-y-auto">
              {analysis.errors.map((err, i) => (
                <div key={`e-${i}`} className="flex items-start gap-2 px-3 py-1.5 text-xs border-b border-zinc-800/50">
                  <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                  <span className="text-red-400 font-mono">{err.code}</span>
                  <span className="text-zinc-400">{err.line}:{err.column}</span>
                  <span className="text-zinc-300">{err.message.split('(at ')[0]}</span>
                </div>
              ))}
              {analysis.diagnostics.filter(d => d.level === 'error').map((d, i) => (
                <div key={`de-${i}`} className="flex items-start gap-2 px-3 py-1.5 text-xs border-b border-zinc-800/50">
                  <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                  <span className="text-zinc-300">{d.message}</span>
                </div>
              ))}
              {analysis.diagnostics.filter(d => d.level === 'warning').map((d, i) => (
                <div key={`dw-${i}`} className="flex items-start gap-2 px-3 py-1.5 text-xs border-b border-zinc-800/50">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <span className="text-zinc-300">{d.message}</span>
                </div>
              ))}
              {analysis.deadlocks.map((cycle, i) => (
                <div key={`dl-${i}`} className="flex items-start gap-2 px-3 py-1.5 text-xs border-b border-zinc-800/50">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                  <span className="text-red-400">Deadlock:</span>
                  <span className="text-zinc-300">{cycle.join(' → ')} → {cycle[0]}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Tabs */}
        <div className="w-1/2 flex flex-col">
          {/* Tab bar */}
          <div className="flex border-b border-zinc-800 bg-zinc-900/50 shrink-0">
            <TabButton active={activeTab === 'graph'} onClick={() => setActiveTab('graph')}>
              <GitFork className="w-3.5 h-3.5" />
              Graph
            </TabButton>
            <TabButton active={activeTab === 'ast'} onClick={() => setActiveTab('ast')}>
              <FileCode className="w-3.5 h-3.5" />
              AST
            </TabButton>

          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0 overflow-auto">
            {activeTab === 'graph' && <GraphPanel graphData={graphData} deadlocks={analysis.deadlocks} diagnostics={analysis.diagnostics} hasErrors={hasErrors} />}
            {activeTab === 'ast' && <ASTPanel program={analysis.program} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab Button ───

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2",
        active
          ? "border-amber-400 text-zinc-100"
          : "border-transparent text-zinc-500 hover:text-zinc-300",
      )}
    >
      {children}
    </button>
  );
}

// ─── Graph Panel ───

function GraphPanel({ graphData, deadlocks, diagnostics, hasErrors }: { graphData: { nodes: GraphNode[]; edges: GraphEdge[] } | null; deadlocks: string[][]; diagnostics: AnalysisResult['diagnostics']; hasErrors: boolean }) {
  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
        Write a valid SLANG flow to see the dependency graph
      </div>
    );
  }

  const deadlockSet = new Set(deadlocks.flat());
  const errorDiags = diagnostics.filter(d => d.level === 'error');
  const warningDiags = diagnostics.filter(d => d.level === 'warning');

  // Determine convergence verdict
  const hasDeadlocks = deadlocks.length > 0;
  const hasNoCommit = warningDiags.some(d => d.message.includes('has no commit'));
  const verdict: 'ok' | 'deadlock' | 'warning' = hasDeadlocks ? 'deadlock' : (hasNoCommit || hasErrors) ? 'warning' : 'ok';

  // Simple layout: nodes in a circle
  const cx = 250, cy = 200, r = 140;
  const n = graphData.nodes.length;
  const nodePositions = graphData.nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    return { ...node, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });

  const posMap = new Map(nodePositions.map(n => [n.id, n]));

  // Deduplicate edges
  const edgeSet = new Set<string>();
  const deduped = graphData.edges.filter(e => {
    const key = `${e.from}->${e.to}:${e.type}`;
    if (edgeSet.has(key)) return false;
    edgeSet.add(key);
    return true;
  });

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="text-xs text-zinc-500 mb-3 flex items-center gap-4">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Ready
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Blocked
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Deadlocked
        </span>
        <span className="flex items-center gap-1">
          <span className="w-6 border-t border-cyan-500 inline-block" /> stake →
        </span>
        <span className="flex items-center gap-1">
          <span className="w-6 border-t border-dashed border-violet-500 inline-block" /> await ←
        </span>
      </div>
      <svg viewBox="0 0 500 400" className="flex-1 w-full max-h-[400px]">
        <defs>
          <marker id="arrowStake" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6" fill="#22d3ee" />
          </marker>
          <marker id="arrowAwait" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6" fill="#a78bfa" />
          </marker>
        </defs>

        {/* Edges */}
        {deduped.map((edge, i) => {
          const from = posMap.get(edge.from);
          const to = posMap.get(edge.to);
          if (!from || !to) return null;

          // Shorten line to not overlap with node circle
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const nx = dx / len;
          const ny = dy / len;
          const offsetStart = 28;
          const offsetEnd = 28;

          return (
            <line
              key={i}
              x1={from.x + nx * offsetStart}
              y1={from.y + ny * offsetStart}
              x2={to.x - nx * offsetEnd}
              y2={to.y - ny * offsetEnd}
              stroke={edge.type === 'stake' ? '#22d3ee' : '#a78bfa'}
              strokeWidth={1.5}
              strokeDasharray={edge.type === 'await' ? '4,3' : undefined}
              markerEnd={edge.type === 'stake' ? 'url(#arrowStake)' : 'url(#arrowAwait)'}
              opacity={0.7}
            />
          );
        })}

        {/* Nodes */}
        {nodePositions.map((node) => {
          const inDeadlock = deadlockSet.has(node.id);
          const color = inDeadlock ? '#ef4444' : node.isReady ? '#10b981' : '#f59e0b';

          return (
            <g key={node.id}>
              <circle
                cx={node.x}
                cy={node.y}
                r={24}
                fill={`${color}15`}
                stroke={color}
                strokeWidth={2}
              />
              <text
                x={node.x}
                y={node.y + 1}
                textAnchor="middle"
                dominantBaseline="central"
                className="text-xs font-medium fill-zinc-200"
              >
                {node.label}
              </text>
            </g>
          );
        })}
      </svg>
      {/* Flow Analysis */}
      <div className="border-t border-zinc-800 px-4 py-3 space-y-3">
        {/* Convergence verdict */}
        <div className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium",
          verdict === 'ok' && "bg-emerald-950/40 text-emerald-400 border border-emerald-900/50",
          verdict === 'deadlock' && "bg-red-950/40 text-red-400 border border-red-900/50",
          verdict === 'warning' && "bg-amber-950/40 text-amber-400 border border-amber-900/50",
        )}>
          {verdict === 'ok' && <><ShieldCheck className="w-4 h-4" /> Will converge</>}
          {verdict === 'deadlock' && <><ShieldAlert className="w-4 h-4" /> Deadlock detected</>}
          {verdict === 'warning' && <><ShieldQuestion className="w-4 h-4" /> May not converge</>}
        </div>

        {/* Deadlock cycles */}
        {deadlocks.length > 0 && (
          <div className="space-y-1">
            {deadlocks.map((cycle, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-red-400">
                <XCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Cycle: {cycle.join(' \u2192 ')} \u2192 {cycle[0]}</span>
              </div>
            ))}
          </div>
        )}

        {/* Diagnostics */}
        {(errorDiags.length > 0 || warningDiags.length > 0) && (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-zinc-600 font-semibold">Diagnostics</div>
            {errorDiags.map((d, i) => (
              <div key={`e-${i}`} className="flex items-start gap-2 text-xs">
                <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                <span className="text-zinc-300">{d.message}</span>
              </div>
            ))}
            {warningDiags.map((d, i) => (
              <div key={`w-${i}`} className="flex items-start gap-2 text-xs">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <span className="text-zinc-300">{d.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Agent status */}
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-600 font-semibold">Agents</div>
          {graphData.nodes.map(node => {
            const inDeadlock = deadlockSet.has(node.id);
            const noCommit = warningDiags.some(d => d.message.includes(`"${node.id}"`) && d.message.includes('no commit'));
            return (
              <div key={node.id} className="flex items-center gap-2 text-xs">
                <span className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  inDeadlock ? "bg-red-500" : node.isReady ? "bg-emerald-500" : "bg-amber-500",
                )} />
                <span className="text-zinc-200 font-mono">{node.id}</span>
                {node.isReady && <span className="text-emerald-600 text-[10px]">ready</span>}
                {inDeadlock && <span className="text-red-600 text-[10px]">deadlocked</span>}
                {!node.isReady && !inDeadlock && <span className="text-amber-600 text-[10px]">blocked</span>}
                {noCommit && <span className="text-amber-600 text-[10px]">(no commit)</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── AST Panel ───

function ASTPanel({ program }: { program: AnalysisResult['program'] }) {
  if (!program) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
        Write valid SLANG code to see the AST
      </div>
    );
  }

  return (
    <pre className="p-4 text-xs font-mono text-zinc-300 overflow-auto h-full leading-5">
      {JSON.stringify(program, null, 2)}
    </pre>
  );
}


