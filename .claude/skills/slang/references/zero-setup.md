# SLANG Zero-Setup Execution

Execute SLANG flows in **any LLM chat** (ChatGPT, Claude, Gemini, etc.) without installing anything.

## How It Works

1. Copy the zero-setup system prompt (from `ZERO_SETUP_PROMPT.md` or via `slang prompt`)
2. Paste it into the LLM's system prompt (or as the first message)
3. Paste a `.slang` flow in the user message
4. The LLM executes it step-by-step

## Getting the Prompt

### CLI
```bash
slang prompt
```

### MCP
Use the `get_zero_setup_prompt` tool.

### File
See `ZERO_SETUP_PROMPT.md` in the project root.

## Execution Phases

The LLM follows 4 phases:

### Phase 1: PARSE
- Identify agents, their operations, and dependencies
- Determine which agents are READY (first op is `stake`) vs BLOCKED (first op is `await`)

### Phase 2: EXECUTE
Run agents turn by turn:
1. Pick a READY agent
2. Become that agent (adopt its role and context)
3. Execute the current operation:
   - `stake func(args) -> @Target` — Generate real content, deliver to mailbox
   - `stake func(args)` — Execute locally, store in agent output only
   - `let var = stake func(args)` — Execute and store in variable
   - `await binding <- @Source` — Check mailbox, bind data or skip if blocked
   - `commit` — Mark agent as DONE
   - `escalate @Target` — Delegate, `@Human` halts the flow
   - `when expr { ... }` — Conditional execution
   - `repeat until expr { ... }` — Loop
4. Print turn result with state tracking

### Phase 3: CHECK TERMINATION
After each turn:
- Is the `converge when:` condition met? → DONE
- Budget exceeded? → DONE (partial result)
- Deadlock (no agent can proceed)? → ERROR

### Phase 4: FINAL OUTPUT
Summary with status, rounds, token estimate, and collected outputs.
If `deliver:` statements exist, simulate them after convergence.

## Key Rules for Zero-Setup

1. **Generate REAL content** — no placeholders or simulations
2. **Maintain agent separation** — each agent reasons independently
3. **Parse conditions literally** — evaluate expressions, don't guess
4. **Respect budget** — count rounds, estimate tokens
5. **Escalate to human = STOP** — ask the user for input
6. **Role shapes behavior** — `role: "Adversarial reviewer"` means be genuinely critical
7. **`-> @out`** sends to flow output (final result)
8. **`-> @all`** broadcasts to every other agent
9. **`output: { field: "type" }`** means response MUST include JSON with those fields
10. **`tools: [name]`** means use matching real tools if available, otherwise simulate

## Differences from Runtime

| Aspect | Zero-Setup | Runtime |
|--------|-----------|---------|
| Execution | Single LLM simulates all agents | Separate LLM calls per agent |
| Parallelism | Sequential (turn by turn) | Parallel `Promise.all` for stakes |
| Tools | Simulated or host-provided | Real handlers via `--tools` |
| Deliver | Simulated description | Real handler execution |
| Budget tracking | Estimated | Precise token counting |
| Checkpoint/Resume | Not supported | Supported |

## Portability Principle

Every SLANG feature must work in both modes. If a feature only works in runtime, it must be clearly documented and never fail silently in zero-setup mode.
