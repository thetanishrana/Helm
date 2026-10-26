# Spike 1c: Claude Code driving Chrome through both taps

`e2e.mjs` starts a local page (a visible task plus a hidden injected instruction), headless Chrome, the CDP proxy (`../cdp-proxy`), and the model tap (`../model-tap`). It then runs a clean-environment `claude -p` session (only `ANTHROPIC_BASE_URL` set) that uses `playwright-cli attach --cdp=http://127.0.0.1:9333` to drive the page, and prints one merged timeline.

Run: `npm install && HOLD_MS=2000 node e2e.mjs` (uses a few small subscription requests on the haiku model).

## Result (2026-10-26, Claude Code 2.1.308, @playwright/cli 0.1.22, Chrome 156)
- **The whole stack composes.** `playwright-cli attach --cdp=<proxy>` works through the CDP proxy; Claude Code works through the model tap; neither needed any change beyond a URL.
- **Correlation works at coarse grain.** Model turns (from the tap) and CDP actions share a wall clock, so the timeline shows turn N, then the click it caused about 0.7 s after the turn ended, then turn N+1. All turns carried the same `x-claude-code-prompt-id`.
- **Semantic action recovered:** the click appeared as `BUTTON#refresh "Refresh"` on `127.0.0.1:8899`.
- **Hold timing matters.** With a 5 s hold the CLI reported a timeout on the click even though the click ultimately executed (the agent noticed and re-checked the page). With a 2 s hold no error was observed in the timeline (agent text for that run was not captured; `agent.txt` is now saved by the harness). The CLI's action timeout looks like ~5 s but I did not find it in the source, so treat that as unconfirmed.
- **Model behavior:** the agent (haiku) saw the hidden "NOTE TO AI ASSISTANTS" through the page snapshot, refused it, and reported it. One sample only; this says nothing about attack success rates.

## Gaps this exposed
- Correlation here is by time only. Linking a specific click to the specific `tool_use` block that caused it needs a shared key. Candidates: the shell command text in the model response vs. the CDP session that command opened, or a per-command env var or header injected through the CLI.
- Long holds break the CLI's own timeout. A real hold needs either a longer-timeout wrapper, or approval-by-prompt before the agent issues the command, or a design where the hold happens at the CLI boundary instead of CDP.
- `x-claude-code-request-class` was not present on these requests (print mode), so side requests can't be filtered by it here.
- The agent used one shell tool call per CLI command; the model-tap request bodies contain the full conversation including page snapshots, which is exactly the provenance data needed but was not parsed yet.
