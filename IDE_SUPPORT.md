# IDE & Editor Support

> **Note**: This documentation has moved to [docs/IDE.md](docs/IDE.md). This file is maintained for backward compatibility.

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

## Neovim

### LSP Setup (recommended)

Install the LSP server globally:

```bash
npm install -g @riktar/slang-lsp
```

Add to your Neovim config:

```lua
-- Filetype detection
vim.filetype.add({
  extension = {
    slang = "slang",
  },
})

-- LSP configuration
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

### Syntax highlighting only (no LSP)

Copy the syntax files:

```bash
mkdir -p ~/.config/nvim/syntax ~/.config/nvim/ftdetect
cp editors/vim/syntax/slang.vim ~/.config/nvim/syntax/
cp editors/vim/ftdetect/slang.vim ~/.config/nvim/ftdetect/
```

Or for classic Vim:

```bash
cp editors/vim/syntax/slang.vim ~/.vim/syntax/
cp editors/vim/ftdetect/slang.vim ~/.vim/ftdetect/
```

Or via a plugin manager (lazy.nvim):

```lua
{
  "riktar/slang",
  config = function(plugin)
    vim.opt.rtp:append(plugin.dir .. "/editors/vim")
  end,
}
```

---

## Helix

Install the LSP server:

```bash
npm install -g @riktar/slang-lsp
```

Add to `~/.config/helix/languages.toml`:

```toml
[[language]]
name = "slang"
scope = "source.slang"
file-types = ["slang"]
language-servers = ["slang-lsp"]
comment-token = "--"
indent = { tab-width = 2, unit = "  " }

[language-server.slang-lsp]
command = "slang-lsp"
```

---

## Emacs

Install the LSP server:

```bash
npm install -g @riktar/slang-lsp
```

With `lsp-mode`:

```elisp
(define-derived-mode slang-mode prog-mode "SLANG"
  "Major mode for SLANG files."
  (setq-local comment-start "-- ")
  (setq-local comment-end ""))

(add-to-list 'auto-mode-alist '("\\.slang\\'" . slang-mode))

(with-eval-after-load 'lsp-mode
  (add-to-list 'lsp-language-id-configuration '(slang-mode . "slang"))
  (lsp-register-client
    (make-lsp-client
      :new-connection (lsp-stdio-connection '("slang-lsp"))
      :activation-fn (lsp-activate-on "slang")
      :server-id 'slang-lsp)))

(add-hook 'slang-mode-hook #'lsp)
```

With `eglot` (Emacs 29+):

```elisp
(define-derived-mode slang-mode prog-mode "SLANG"
  (setq-local comment-start "-- ")
  (setq-local comment-end ""))

(add-to-list 'auto-mode-alist '("\\.slang\\'" . slang-mode))

(with-eval-after-load 'eglot
  (add-to-list 'eglot-server-programs '(slang-mode . ("slang-lsp"))))

(add-hook 'slang-mode-hook #'eglot-ensure)
```

---

## Sublime Text

### Syntax highlighting

Copy the syntax file to your Sublime packages directory:

**macOS:**
```bash
cp editors/sublime/slang.sublime-syntax ~/Library/Application\ Support/Sublime\ Text/Packages/User/
```

**Linux:**
```bash
cp editors/sublime/slang.sublime-syntax ~/.config/sublime-text/Packages/User/
```

**Windows:**
```bash
cp editors/sublime/slang.sublime-syntax %APPDATA%/Sublime Text/Packages/User/
```

### LSP support

Install the [LSP](https://packagecontrol.io/packages/LSP) package, then add to `LSP.sublime-settings`:

```json
{
  "clients": {
    "slang": {
      "enabled": true,
      "command": ["slang-lsp"],
      "selector": "source.slang"
    }
  }
}
```

---

## JetBrains (IntelliJ IDEA, WebStorm, PyCharm, etc.)

### TextMate bundle (syntax highlighting)

1. Open your JetBrains IDE
2. Go to **Settings → Editor → TextMate Bundles**
3. Click the **+** button
4. Select the `editors/jetbrains/` directory from this repository
5. Click **OK** and restart the IDE

This gives you syntax highlighting for `.slang` files using the same TextMate grammar as VS Code.

---

## Zed

Install the LSP server:

```bash
npm install -g @riktar/slang-lsp
```

Add to Zed settings (`~/.config/zed/settings.json`):

```json
{
  "languages": {
    "SLANG": {
      "tab_size": 2
    }
  },
  "lsp": {
    "slang-lsp": {
      "binary": {
        "path": "slang-lsp"
      }
    }
  }
}
```

---

## LSP Server Reference

### Capabilities

| Capability | Description |
|------------|-------------|
| `textDocument/publishDiagnostics` | Parse errors + static analysis + deadlock detection |
| `textDocument/completion` | Keywords, `@Agent` refs, meta keys |
| `textDocument/definition` | Navigate to agent declarations |
| `textDocument/hover` | Keyword docs, agent info, special ref descriptions |
| `textDocument/documentSymbol` | Outline: flows → agents → operations |

### Diagnostics

The LSP produces three categories of diagnostics:

1. **Parse errors** (from `parseWithRecovery()`) — syntax errors with error recovery, so you always get an AST even with errors
2. **Static analysis** (from `analyzeFlow()`) — warnings for missing converge/budget/commit, errors for unknown agent references
3. **Deadlock detection** (from `detectDeadlocks()`) — errors when agents are waiting on each other in a cycle

### Running standalone

```bash
# Install globally
npm install -g @riktar/slang-lsp

# Run (stdio transport — editors connect to stdin/stdout)
slang-lsp
```

Or via npx (no install):

```bash
npx @riktar/slang-lsp
```

---

## Developing

### Building from source

```bash
# From the repository root
npm install
npm run build           # Build core
npm run build:lsp       # Build LSP server
npm run build:vscode    # Build VS Code extension
npm run build:all       # Build everything
```

### Testing the VS Code extension locally

```bash
cd packages/vscode-slang
npm run build
# Press F5 in VS Code to launch Extension Development Host
```

### Modifying the grammar

The TextMate grammar lives at `packages/vscode-slang/syntaxes/slang.tmLanguage.json`. After changes:

1. Rebuild the VS Code extension: `npm run build:vscode`
2. Copy to JetBrains bundle: `cp packages/vscode-slang/syntaxes/slang.tmLanguage.json editors/jetbrains/Syntaxes/`
3. The Sublime and Vim grammars are separate files and need manual updates
