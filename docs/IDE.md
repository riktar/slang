# IDE & Editor Support

SLANG provides first-class editor support through the **Language Server Protocol** (LSP), **TextMate grammars**, and editor-specific syntax files.

---

## Architecture

```
┌─────────────┐     stdio      ┌──────────────┐
│  VS Code    │ ◄────────────► │  slang-lsp   │
│  Neovim     │                │              │
│  Helix      │                │  parseWith   │
│  Emacs      │                │  Recovery()  │
│  Zed        │                │  analyzeFlow │
│  ...        │                │  resolveDeps │
└─────────────┘                └──────────────┘
```

The LSP server (`@riktar/slang-lsp`) runs as a standalone process communicating via **stdio**. It reuses the existing SLANG core:

- `parseWithRecovery()` — error-recovering parser that always returns an AST + error list
- `analyzeFlow()` — static analysis (missing converge, missing budget, unknown agents, missing commit)
- `resolveDeps()` + `detectDeadlocks()` — dependency graph and cycle detection

Any editor with LSP support can connect to `slang-lsp` and get diagnostics, completions, hover, go-to-definition, and document symbols.

---

## Features

| Feature | LSP | VS Code | Vim | Sublime | JetBrains |
|---------|:---:|:-------:|:---:|:-------:|:---------:|
| Syntax highlighting | — | ✅ | ✅ | ✅ | ✅ |
| Bracket matching | — | ✅ | — | — | ✅ |
| Comment toggling (`--`) | — | ✅ | — | — | — |
| Code folding | — | ✅ | — | — | ✅ |
| Snippets (18 patterns) | — | ✅ | — | — | — |
| Real-time diagnostics | ✅ | ✅ | ✅* | — | — |
| Autocompletion | ✅ | ✅ | ✅* | — | — |
| Go-to-definition | ✅ | ✅ | ✅* | — | — |
| Hover documentation | ✅ | ✅ | ✅* | — | — |
| Document outline | ✅ | ✅ | ✅* | — | — |

\* Via LSP client (nvim-lspconfig, coc.nvim, etc.)

---

## VS Code

### Installation

**Option A — From Marketplace** (when published):

Search for "SLANG" in the VS Code Extensions panel and install.

**Option B — From source** (development):

```bash
cd packages/vscode-slang
npm install
npm run build
npx @vscode/vsce package
code --install-extension vscode-slang-0.7.0.vsix
```

### What you get

- **Syntax highlighting** — full TextMate grammar covering all 31 keywords, primitives, `@AgentRef` references, strings with escape sequences, numbers, operators, comments
- **Real-time diagnostics** — parse errors appear inline as you type, with static analysis warnings for missing converge, budget, commit; deadlock detection
- **Autocompletion** — triggers on `@` for agent references (with all declared agents + `@out`, `@all`, `@Human`, `@any`), and on empty lines for all keywords and meta keys
- **Go-to-definition** — `Ctrl+Click` / `Cmd+Click` on `@AgentName` navigates to the agent declaration
- **Hover** — hover over keywords for syntax reference, hover over `@AgentName` for agent metadata (role, model, tools, retry, operation count)
- **Document outline** — `Ctrl+Shift+O` shows the flow structure: flows → agents → operations (stakes, awaits, commits)
- **Snippets** — 18 snippets for rapid development:

| Prefix | Description |
|--------|-------------|
| `flow` | Flow declaration with agent and converge |
| `agent` | Agent with role and model |
| `agent-tools` | Agent with tools |
| `stake` | Produce & send |
| `stake-output` | Stake with output schema |
| `await` | Wait for input |
| `commit` | Accept result |
| `escalate` | Delegate upward |
| `when` | Conditional block |
| `when-else` | Conditional with else |
| `repeat` | Loop until condition |
| `let` | Declare variable |
| `set` | Update variable |
| `converge` | Convergence condition |
| `budget` | Resource limits |
| `deliver` | Post-convergence handler |
| `import` | Import another flow |
| `flow-research` | Full research flow template |

- **Language configuration** — bracket matching (`{}`/`[]`/`()`), auto-closing pairs, auto-indentation on `{`, comment toggling with `--`

---

## Any LSP-compatible editor (Neovim, Emacs, Helix, Zed, etc.)

The SLANG LSP server works with any editor that supports the Language Server Protocol:

```bash
npm install -g @riktar/slang-lsp
```

Then configure your editor to use `slang-lsp` as the language server for `.slang` files (stdio transport).

<details>
<summary>Neovim (nvim-lspconfig)</summary>

```lua
vim.api.nvim_create_autocmd("FileType", {
  pattern = "slang",
  callback = function()
    vim.lsp.start({
      name = "slang-lsp",
      cmd = { "slang-lsp" },
      root_dir = vim.fn.getcwd(),
    })
  end,
})
```

</details>

<details>
<summary>Helix (~/.config/helix/languages.toml)</summary>

```toml
[[language]]
name = "slang"
scope = "source.slang"
file-types = ["slang"]
language-servers = ["slang-lsp"]
comment-token = "--"

[language-server.slang-lsp]
command = "slang-lsp"
```

</details>

## Vim/Neovim (syntax only, no LSP)

Copy the syntax files from `editors/vim/`:

```bash
cp editors/vim/syntax/slang.vim ~/.vim/syntax/
cp editors/vim/ftdetect/slang.vim ~/.vim/ftdetect/
```

## Sublime Text

Copy the syntax file to your Sublime packages:

```bash
cp editors/sublime/slang.sublime-syntax ~/Library/Application\ Support/Sublime\ Text/Packages/User/
# Linux: ~/.config/sublime-text/Packages/User/
```

## JetBrains (IntelliJ, WebStorm, PyCharm, etc.)

1. Go to **Settings → Editor → TextMate Bundles**
2. Click **+** and select `editors/jetbrains/` from this repository
3. Restart the IDE
