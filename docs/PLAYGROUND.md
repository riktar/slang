# Playground

Built-in web editor. Write, inspect, and visualize AI workflows in your browser — no code, no API key, no setup.

```bash
slang playground              # Opens http://localhost:5174
slang playground --port 3000  # custom port
```

## Features

- **Editor** — Write and see parsing errors in real-time
- **Dependency graph** — Visualize flow as SVG (green = ready, yellow = waiting, red = stuck)
- **AST viewer** — Inspect the parsed syntax tree
- **Examples** — Built-in samples to learn from
- **Prompt handoff** — Copy the zero-setup prompt + current flow and open ChatGPT or Claude from the UI
- **Save export** — Download the current flow as `flow.slang`
