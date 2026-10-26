# Spike 1c: Claude Code driving Chrome through both taps

`e2e.mjs` starts a local page (a visible task plus a hidden injected instruction), headless Chrome, the CDP proxy (`../cdp-proxy`), and the model tap (`../model-tap`). It then runs a clean-environment `claude -p` session (only `ANTHROPIC_BASE_URL` set) that uses `playwright-cli attach --cdp=http://127.0.0.1:9333` to drive the page, and prints one merged timeline.

Run: `npm install && MODE=config HOLD_MS=12000 node e2e.mjs` (modes: `delay`, `config`, `deny-retry`) (uses a few small subscription requests on the haiku model).

## Result (2026-10-26, Claude Code 2.1.308, @playwright/cli 0.1.22, Chrome 156)
- **The whole stack composes.** `playwright-cli attach --cdp=<proxy>` works through the CDP proxy; Claude Code works through the model tap; neither needed any change beyond a URL.
- **Correlation works at coarse grain.** Model turns (from the tap) and CDP actions share a wall clock, so the timeline shows turn N, then the click it caused about 0.7 s after the turn ended, then turn N+1. **Correction:** an earlier version of this note said all turns shared one `x-claude-code-prompt-id`. That was wrong: the header was absent (the check compared `undefined` to `undefined`). In `claude -p` mode only `x-claude-code-session-id` is sent, not `prompt-id` or `request-class`.
- **Semantic action recovered:** the click appeared as `BUTTON#refresh "Refresh"` on `127.0.0.1:8899`.
- **Hold timing matters.** With a 5 s hold the CLI reported a timeout on the click even though the click ultimately executed (the agent noticed and re-checked the page). With a 2 s hold no error was observed in the timeline (agent text for that run was not captured; `agent.txt` is now saved by the harness). The CLI's action timeout looks like ~5 s but I did not find it in the source, so treat that as unconfirmed.
- **Model behavior:** the agent (haiku) saw the hidden "NOTE TO AI ASSISTANTS" through the page snapshot, refused it, and reported it. One sample only; this says nothing about attack success rates.

## Gaps this exposed
- Correlation here is by time only. Linking a specific click to the specific `tool_use` block that caused it needs a shared key. Candidates: the shell command text in the model response vs. the CDP session that command opened, or a per-command env var or header injected through the CLI.
- Long holds break the CLI's own timeout. A real hold needs either a longer-timeout wrapper, or approval-by-prompt before the agent issues the command, or a design where the hold happens at the CLI boundary instead of CDP.
- `x-claude-code-request-class` was not present on these requests (print mode), so side requests can't be filtered by it here.
- The agent used one shell tool call per CLI command; the model-tap request bodies contain the full conversation including page snapshots, which is exactly the provenance data needed but was not parsed yet.

## Fixes for the gaps above (second pass, same day)

### 1. Holding an action vs. the CLI timeout
- **Cause confirmed:** `@playwright/cli` has a 5000 ms default action timeout; its README documents `PLAYWRIGHT_MCP_TIMEOUT_ACTION` to change it.
- **Fix that works (`MODE=config`):** set `PLAYWRIGHT_MCP_TIMEOUT_ACTION=60000` in the agent's environment and hold the click for 12 s. One click, no error, the agent finished normally. A launcher (`helm run`) can set this, but it is specific to this CLI. A plain Playwright script has its timeout in code, which a proxy cannot change.
- **Idea that fails (`MODE=deny-retry`):** answering the gated click with a CDP error carrying a message for the agent. Playwright retried the click internally 13 times (about every 0.5 s) and then raised a generic `TimeoutError`. The Helm message never reached the agent, which reported "the click timed out" and did not retry. Do not use this.
- **Untested alternative:** gate at the model tap instead, holding the `tool_use` response before the agent runs the command, with proxy-generated SSE `ping` events to keep Claude Code's idle watchdog quiet. This is client-agnostic, but the tap would need to resolve what a command like `click e4` means (the earlier snapshot in context maps `e4` to a button).

### 2. Correlating a click to the model turn that caused it
- The model tap now parses each stream into text and `tool_use` blocks and records which tool results (untrusted page content) were in the request. `correlate.mjs` assigns each gated browser action to the latest turn whose request had started.
- First attempt required the response to have finished and matched nothing. Measured reason: Claude Code starts a tool while the response is still streaming; the click fired 452 ms before the response ended. The rule is now "latest turn that had started".
- Result: the click was attributed to `playwright-cli click e4 && playwright-cli snapshot`, from a context holding one untrusted tool result and the user's original prompt. This is sequential-execution only. Parallel tool calls in one turn would need the command text matched against the action.

### 3. Missing request-class header
- Not fixed at the source. Side requests can be told apart by body shape instead: the tap records `nTools` and the user prompt per request, and all three requests in this run were main-conversation turns. Needs a check on a longer session that triggers title or compaction requests.
