# SLANG for JetBrains IDEs

JetBrains IDEs (IntelliJ IDEA, WebStorm, PyCharm, etc.) support TextMate grammar bundles natively.

## Installation

1. Open your JetBrains IDE
2. Go to **Settings → Editor → TextMate Bundles**
3. Click **+** and select the `editors/jetbrains/` directory from this repository
4. Restart the IDE

The TextMate grammar (`slang.tmLanguage.json`) in this directory provides syntax highlighting for `.slang` files.

## What you get

- Full syntax highlighting for SLANG keywords, primitives, agent references, strings, numbers, operators
- Comment toggling with `--`
- Bracket matching for `{}`, `[]`, `()`
