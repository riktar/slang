# API

SLANG is also a TypeScript/JavaScript library for programmatic flow execution.

```typescript
import { parse, runFlow, createOpenAIAdapter } from '@riktar/slang'

const source = `
  flow "hello" {
    agent Greeter {
      stake greet("world") -> @out
      commit
    }
    converge when: all_committed
  }
`

const ast = parse(source)

const state = await runFlow(source, {
  adapter: createOpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY }),
  onEvent: (event) => console.log(event),
})
```

## Adapters

```typescript
import {
  createOpenAIAdapter,       // OpenAI / Ollama / any OpenAI-compatible
  createAnthropicAdapter,    // Anthropic
  createOpenRouterAdapter,   // OpenRouter (300+ models, one API key)
  createSamplingAdapter,     // MCP host delegation (no API key)
  createEchoAdapter,         // Testing
  createRouterAdapter,       // Multi-provider: different agents → different backends
} from '@riktar/slang'
```

## Functional Tools

Turn agent `tools:` declarations into real handlers:

```javascript
// tools.js
export default {
  async web_search(args) {
    const res = await fetch(`https://api.search.com?q=${encodeURIComponent(args.query)}`);
    return await res.text();
  },
};
```

```bash
slang run research.slang --adapter openrouter --tools tools.js
```

Or via the API:

```typescript
const state = await runFlow(source, {
  adapter,
  tools: {
    web_search: async (args) => fetchSearchResults(args.query as string),
  },
})
```

See [examples/tools.js](../examples/tools.js) for template code with `web_search` and `code_exec`.

## Checkpoint & Resume

```typescript
import { runFlow, serializeFlowState, deserializeFlowState } from '@riktar/slang'

const state = await runFlow(source, {
  adapter,
  checkpoint: async (snapshot) => {
    await writeFile('checkpoint.json', serializeFlowState(snapshot))
  },
})

// Later: resume from checkpoint
const saved = deserializeFlowState(await readFile('checkpoint.json', 'utf8'))
const resumed = await runFlow(source, { adapter, resumeFrom: saved })
```

## Deliver & onConverge

Execute side effects after convergence using `deliver:` in the `.slang` file and `deliverers` in runtime options:

```slang
flow "report" {
  agent Writer {
    stake write(topic: "AI") -> @out
    commit
  }
  deliver: save_file(path: "report.md")
  deliver: webhook(url: "https://hooks.example.com/done")
  converge when: all_committed
}
```

```typescript
const state = await runFlow(source, {
  adapter,
  deliverers: {
    save_file: async (output, args) => {
      await writeFile(args.path as string, String(output))
    },
    webhook: async (output, args) => {
      await fetch(args.url as string, { method: 'POST', body: JSON.stringify(output) })
    },
  },
  onConverge: async (finalState) => {
    console.log(`Converged in ${finalState.round} rounds`)
  },
})
```

See [examples/finalizer.slang](../examples/finalizer.slang) for the Finalizer pattern.

CLI usage:

```bash
slang run report.slang --adapter openrouter --deliverers deliverers.js
```

The `deliverers.js` file follows the same pattern as `tools.js` — default-export an object where each key is a handler name and each value is `async (output, args) => void`:

```js
// deliverers.js
export default {
  async save_file(output, args) {
    await writeFile(args.path, String(output))
  },
  async webhook(output, args) {
    await fetch(args.url, { method: 'POST', body: JSON.stringify(output) })
  },
}
```

## Static Analysis & Error Handling

```typescript
import { parse, resolveDeps, detectDeadlocks, analyzeFlow, parseWithRecovery } from '@riktar/slang'

// Deadlock detection
const graph = resolveDeps(parse(source).flows[0])
const deadlocks = detectDeadlocks(graph)

// Collect all errors instead of failing on first
const { program, errors } = parseWithRecovery(source)
// errors[0].code → "P201", errors[0].line → 3, errors[0].toJSON() → { code, message, line, column }
```

Error codes follow a convention: L1xx (lexer), P2xx (parser), R3xx (resolver), E4xx (runtime). All errors include line/column and human-friendly messages with source context.
