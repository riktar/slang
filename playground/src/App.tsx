import { useState, useCallback, useRef, useEffect } from 'react';
import Editor, { type OnMount, loader } from '@monaco-editor/react';
import type * as monaco from 'monaco-editor';
import { analyzeSource, runSource, buildGraphData, type AnalysisResult, type RunResult, type RuntimeEvent, type GraphNode, type GraphEdge } from './lib/engine';
import { EXAMPLES } from './lib/examples';
import { cn } from './lib/utils';
import { Play, FileCode, GitFork, AlertTriangle, CheckCircle, XCircle, ChevronDown, Zap, RotateCcw } from 'lucide-react';
import { SLANG_LANGUAGE_ID, languageConfiguration, monarchTokensProvider, SLANG_THEME } from './lib/slang-language';
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
  const [activeTab, setActiveTab] = useState<'graph' | 'ast' | 'run'>('graph');
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [liveEvents, setLiveEvents] = useState<RuntimeEvent[]>([]);
  const [showExamples, setShowExamples] = useState(false);
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

  const handleRun = useCallback(async () => {
    setIsRunning(true);
    setLiveEvents([]);
    setActiveTab('run');
    setRunResult(null);

    const result = await runSource(source, (ev) => {
      setLiveEvents(prev => [...prev, ev]);
    });

    setRunResult(result);
    setIsRunning(false);
  }, [source]);

  const handleLoadExample = useCallback((key: string) => {
    const example = EXAMPLES[key];
    if (example) {
      setSource(example.source);
      setAnalysis(analyzeSource(example.source));
      setRunResult(null);
      setLiveEvents([]);
      setShowExamples(false);
    }
  }, []);

  const graphData = analysis.graph ? buildGraphData(analysis.graph) : null;
  const hasErrors = analysis.errors.length > 0;
  const hasWarnings = analysis.diagnostics.filter(d => d.level === 'warning').length > 0;
  const hasCritical = analysis.diagnostics.filter(d => d.level === 'error').length > 0;
  const hasDeadlocks = analysis.deadlocks.length > 0;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-400" />
          <h1 className="text-lg font-bold tracking-tight">SLANG Playground</h1>
          <span className="text-xs text-zinc-500 font-mono">v0.4.0</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowExamples(!showExamples)}
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
          <button
            onClick={handleRun}
            disabled={isRunning || hasErrors}
            className={cn(
              "flex items-center gap-1 px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
              hasErrors
                ? "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-500 text-white",
            )}
          >
            {isRunning ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {isRunning ? 'Running...' : 'Run (Echo)'}
          </button>
        </div>
      </header>

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
            <TabButton active={activeTab === 'run'} onClick={() => setActiveTab('run')}>
              <Play className="w-3.5 h-3.5" />
              Run
              {runResult && (
                <span className={cn(
                  "ml-1 px-1.5 py-0.5 text-[10px] rounded font-medium",
                  runResult.state?.status === 'converged' ? "bg-emerald-900/50 text-emerald-400" :
                  runResult.state?.status === 'deadlock' ? "bg-red-900/50 text-red-400" :
                  "bg-amber-900/50 text-amber-400",
                )}>
                  {runResult.state?.status ?? 'error'}
                </span>
              )}
            </TabButton>
          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0 overflow-auto">
            {activeTab === 'graph' && <GraphPanel graphData={graphData} deadlocks={analysis.deadlocks} />}
            {activeTab === 'ast' && <ASTPanel program={analysis.program} />}
            {activeTab === 'run' && <RunPanel result={runResult} events={isRunning ? liveEvents : (runResult?.events ?? [])} isRunning={isRunning} error={runResult?.error ?? null} />}
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

function GraphPanel({ graphData, deadlocks }: { graphData: { nodes: GraphNode[]; edges: GraphEdge[] } | null; deadlocks: string[][] }) {
  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
        Write a valid SLANG flow to see the dependency graph
      </div>
    );
  }

  const deadlockSet = new Set(deadlocks.flat());

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

// ─── Run Panel ───

function RunPanel({ result, events, isRunning, error }: { result: RunResult | null; events: RuntimeEvent[]; isRunning: boolean; error: string | null }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  if (!result && !isRunning && events.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
        Click "Run (Echo)" to execute the flow with the echo adapter
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="p-4 overflow-auto h-full">
      {/* Events */}
      <div className="space-y-1">
        {events.map((ev, i) => (
          <EventLine key={i} event={ev} />
        ))}
      </div>

      {isRunning && (
        <div className="flex items-center gap-2 mt-3 text-xs text-zinc-500">
          <RotateCcw className="w-3 h-3 animate-spin" />
          Running...
        </div>
      )}

      {/* Final result */}
      {result && !isRunning && (
        <div className="mt-4 pt-3 border-t border-zinc-800">
          {error && (
            <div className="flex items-start gap-2 text-xs text-red-400 mb-2">
              <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          {result.state && (
            <div className="space-y-1 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="text-zinc-500">Status:</span>
                <span className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-medium",
                  result.state.status === 'converged' ? "bg-emerald-900/50 text-emerald-400" :
                  result.state.status === 'deadlock' ? "bg-red-900/50 text-red-400" :
                  result.state.status === 'escalated' ? "bg-amber-900/50 text-amber-400" :
                  "bg-zinc-800 text-zinc-400",
                )}>
                  {result.state.status}
                </span>
              </div>
              <div className="text-zinc-500">Rounds: <span className="text-zinc-300">{result.state.round}</span></div>
              <div className="text-zinc-500">Tokens: <span className="text-zinc-300">{result.state.tokensUsed}</span></div>
              {result.state.outputs.length > 0 && (
                <div className="mt-2">
                  <div className="text-zinc-500 mb-1">Outputs:</div>
                  {result.state.outputs.map((out: unknown, i: number) => (
                    <pre key={i} className="text-zinc-300 bg-zinc-900 rounded p-2 mb-1 text-[11px] leading-4 whitespace-pre-wrap break-words">
                      {typeof out === 'string' ? out : JSON.stringify(out, null, 2)}
                    </pre>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Event Line ───

function EventLine({ event }: { event: RuntimeEvent }) {
  switch (event.type) {
    case 'round_start':
      return (
        <div className="text-xs font-mono text-blue-400 font-bold mt-2">
          ═══ ROUND {event.round} ═══
        </div>
      );
    case 'agent_start':
      return (
        <div className="text-xs font-mono text-cyan-400">
          --- {event.agent}: {event.operation}
        </div>
      );
    case 'agent_output':
      return (
        <pre className="text-xs font-mono text-zinc-400 pl-4 whitespace-pre-wrap break-words">
          {event.output}
        </pre>
      );
    case 'agent_commit':
      return (
        <div className="text-xs font-mono text-emerald-400">
          ✓ {event.agent} COMMITTED
        </div>
      );
    case 'agent_escalate':
      return (
        <div className="text-xs font-mono text-amber-400">
          ↑ {event.agent} ESCALATED to @{event.target}{event.reason ? `: ${event.reason}` : ''}
        </div>
      );
    case 'agent_retry':
      return (
        <div className="text-xs font-mono text-amber-500">
          ⟳ {event.agent} retry #{event.attempt}: {event.error}
        </div>
      );
    case 'tool_call':
      return (
        <div className="text-xs font-mono text-violet-400">
          🔧 {event.agent} → {event.tool}({JSON.stringify(event.args)})
        </div>
      );
    case 'tool_result':
      return (
        <div className="text-xs font-mono text-zinc-500 pl-4">
          ← {event.result.slice(0, 200)}
        </div>
      );
    case 'flow_converged':
      return <div className="text-xs font-mono text-emerald-400 font-bold mt-1">═══ FLOW CONVERGED ═══</div>;
    case 'flow_budget_exceeded':
      return <div className="text-xs font-mono text-amber-400 font-bold mt-1">═══ BUDGET EXCEEDED (round {event.round}) ═══</div>;
    case 'flow_deadlock':
      return <div className="text-xs font-mono text-red-400 font-bold mt-1">═══ DEADLOCK: {event.agents.join(', ')} ═══</div>;
    case 'flow_escalated':
      return <div className="text-xs font-mono text-amber-400 font-bold mt-1">═══ ESCALATED TO @{event.target} ═══</div>;
    case 'checkpoint':
      return <div className="text-xs font-mono text-zinc-600">checkpoint (round {event.round})</div>;
    default:
      return null;
  }
}
