# Contributing to SLANG

Thank you for your interest in contributing to SLANG! This document provides guidelines and instructions for contributing.

## Getting Started

1. **Fork** the repository
2. **Clone** your fork:
   ```bash
   git clone https://github.com/<your-username>/slang.git
   cd slang
   ```
3. **Install** dependencies:
   ```bash
   npm install
   ```
4. **Build** the project:
   ```bash
   npm run build
   ```
5. **Run tests**:
   ```bash
   npm test
   ```

## Development Workflow

### Branch Naming

- `feat/description` — new features
- `fix/description` — bug fixes
- `docs/description` — documentation changes
- `refactor/description` — code refactoring

### Building

```bash
npm run build       # Full build
npm run dev         # Watch mode (rebuilds on changes)
```

### Testing

```bash
npm test            # Run all tests
```

Tests use Node's built-in test runner with `tsx`. Test files are co-located with source files (`*.test.ts`).

### Project Structure

```
src/
├── lexer.ts / lexer.test.ts       # Tokenizer
├── parser.ts / parser.test.ts     # Recursive-descent parser
├── ast.ts                         # AST type definitions
├── resolver.ts / resolver.test.ts # Dependency graph & deadlock detection
├── runtime.ts / runtime.test.ts   # Async execution engine
├── adapter.ts                     # LLM adapters
├── cli.ts                         # CLI binary
├── mcp.ts                         # MCP server
└── index.ts                       # Public API exports
```

## Making Changes

### Code Style

- TypeScript with strict mode
- No external linting dependencies — keep the codebase minimal
- Prefer explicit types at module boundaries, infer elsewhere
- Keep functions focused and small

### Adding a New Adapter

1. Implement the `LLMAdapter` interface in `src/adapter.ts`:
   ```typescript
   export function createMyAdapter(config: MyConfig): LLMAdapter {
     return {
       async call(messages, model) {
         // Your implementation
         return { content: '...', tokensUsed: 0 }
       }
     }
   }
   ```
2. Export it from `src/index.ts`
3. Add CLI support in `src/cli.ts`
4. Add tests

### Adding Language Features

1. Add token types in `src/lexer.ts` if needed
2. Add AST node types in `src/ast.ts`
3. Update the parser in `src/parser.ts`
4. Update the resolver in `src/resolver.ts` if it affects dependencies
5. Update the runtime in `src/runtime.ts`
6. Add tests for each layer
7. Update `GRAMMAR.md` and `SPEC.md`

## Pull Request Process

1. Ensure all tests pass (`npm test`)
2. Ensure the project builds (`npm run build`)
3. Update documentation if you changed behavior
4. Write a clear PR title and description
5. Link any related issues

### PR Title Format

```
feat: add Gemini adapter
fix: correct deadlock detection for self-referencing agents
docs: add MCP setup guide for Cursor
```

## Reporting Issues

When reporting a bug, please include:

- The `.slang` file that triggers the issue (minimal reproduction)
- The command you ran
- Expected vs actual behavior
- Node.js version (`node --version`)
- SLANG version (`npx slang --version` or `package.json`)

## Feature Requests

We welcome ideas! Open an issue with the `enhancement` label and describe:

- The problem you're trying to solve
- Your proposed solution
- Example `.slang` syntax if applicable

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
