# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

Start with `docs/handoff.md` (state, next steps, environment traps). Helm is a working research prototype: the product slice in `src/` runs end to end, the evaluation harnesses exist, and the headline (Gate 2) is waiting on a held-out attack set the owner's volunteer writes. The brief (`research brief.md`) is the original contract; `docs/00-brief-review.md` corrects it, `docs/00-success-criteria.md` defines the gates (Gate 3 was revised to a qualitative pilot), `docs/decisions.md` is the running log.

Verify numbers before repeating them: they come from small, author-written test sets and one local agent, and each doc and results README says what was and was not measured. Dev-set numbers are in-sample.

## Code layout and commands
Node 24, no build step. `npm install` at the root (only `ws`), and in `spikes/cdp-proxy` and `spikes/agent-e2e` for the spikes.

- `src/`: the product slice (Gate 1). `model/` (tap, policy, explain, counterfactual, turns), `cdp/proxy.mjs`, `store.mjs` (event log, receipt), `approvals.mjs`, `session.mjs` (wiring), `fleet.mjs` (several agents on one hub: `node src/cli.mjs fleet <file>`; see `docs/multi-agent-design.md`), `cdp/lookup.mjs` (read-only selector lookup), `model/concepts.mjs` (attribution lexicon), `model/judge.mjs` (model judge for attribution, on by default, `--no-judge` to disable; `src/eval/judge-eval.mjs` scores it), `server.mjs` + `ui/` (web UI), `cli.mjs` (launcher). `spikes/` holds the frozen evidence the slice was built from; do not edit spike results.
- Tests: `npm test` (about 140 tests, a few seconds, no network or model). Single file: `node --test test/policy.test.mjs`. A hung test file usually means a test failed before closing its servers.
- Study replay: `node src/replay/cli.mjs --participant P01 --index 0 --fast --open` runs a whole session (consent, practice, three blocks, debrief); `--condition C --scenarios injected` runs one block. Scenarios (`scenarios/*.json`) are generated: `node scripts/capture-sites.mjs` (renders `scenarios-src/sites.mjs` pages to `test/fixtures/sites/`, needs Chrome and `spikes/agent-e2e` installed) then `node scripts/make-scenarios.mjs`. Results go to `study-data/` (gitignored); `node scripts/analyze-study.mjs study-data` summarizes. `scripts/simulate-participant.mjs` drives the UI as a scripted participant for pipeline tests only (its data is not evidence). Do not `pkill -f` or `grep | xargs kill` on a pattern that appears in your own command; free a port with `lsof -ti tcp:PORT | xargs kill`.
- Detector evaluation: `node src/eval/cli.mjs detect` (dev set, in-sample) and, once `eval-pages/heldout/` has pages, `capture`, `validate`, `detect --set heldout`. Do not tune the explainer on held-out results (log it in `docs/decisions.md` if you do).
- Live-agent evaluation: `node src/eval/cli.mjs agent --agent ollama:helm-qwen30b --set dev --modes measure,block --reps 2` (resumable; results in `eval-results/agent/`; first archived run in `docs/results/`). Needs Ollama running (`nohup ollama serve &`) and ports 8899/8787/9333/9222 free. Claude agents need `--allow-subscription` and the owner's OK.
- Run the product: `node src/cli.mjs run --headless --ollama helm-qwen30b --exit -- claude -p "<task>" --model helm-qwen30b --tools Bash ...` (see `node src/cli.mjs`). Serve a test page with `node demo/pages.mjs turn_tag`. The UI is at http://127.0.0.1:7777/.


- UI: `src/ui/` (vanilla JS, no build, fonts bundled in `src/ui/fonts/`). Design rationale: `docs/ui-design.md`. `npm run ui:preview -- paused` serves the real UI with a scripted session (states: idle working untrusted paused checking blocked allowed multi long finished plain raw fleet attributed); `npm run ui:check` drives it in Chrome (needs `spikes/agent-e2e` installed) and must pass after any UI change. The UI must never use innerHTML or equivalents (a test enforces it); the CSP forbids inline script and style; `.card .block` and `.card .allow` are used by `scripts/simulate-participant.mjs`.
- Third-party skills: add one only if it has no executable files and no instruction to run any, after reading it in full and scanning it; record source commit and hashes next to it (`docs/skills-vetting.md`). `.claude/skills/frontend-design/` is Anthropic's, unmodified.
- `spikes/model-tap`: the original model-proxy and decision-logic spike (now copied into `src/model/`). Offline evaluations: `node explain.eval.mjs`, `node explain.replay.mjs` (uses `fixtures/snapshots/`).
- `spikes/cdp-proxy`: `HOLD_MS=3000 node test.mjs` (needs Chrome at `/Applications/Google Chrome.app`).
- `spikes/agent-e2e`: end-to-end runs with Claude Code driving Chrome through both taps. Each run is one process: `e2e-gate.mjs` (hold and approve/deny), `e2e-attack.mjs` (measure-only; env `TECH`, `TASK`, `MODEL`, `LOCAL=1`, `MINIMAL=1`), `battery.sh <outfile> <model> <reps> <task> <techs...>` to repeat, `capture-snapshots.mjs` to regenerate fixtures, `attribute-traces.mjs` for counterfactual attribution on saved requests. These run real model requests; `LOCAL=1` uses Ollama (`helm-qwen30b`, created with `ollama create` from `qwen3-coder:30b` with a 32k context) and costs nothing but is slow and memory-hungry on this machine. Without `LOCAL=1` they use your Claude Code subscription login.
- Kill leftovers with `pgrep -f "user-data-dir=.*helm-"` (headless Chrome). Do not `pkill -f` a pattern that appears in your own command line.

## Gotchas learned the hard way
- Tools can start while a model response is still streaming; correlate browser actions to the latest model turn that had started, not to a finished response.
- A gated `tool_use` must be held with SSE `ping` events or Claude Code aborts the stream; the ceiling is about 10 minutes per attempt.
- Returning CDP errors does not reach the agent (Playwright retries); rewriting a denied call into `echo` makes the agent doubt itself. Deny by ending the turn with a text block.
- Agents restate injections in their own messages; counterfactual removal must blank those too.
- Never write credential headers to logs. Do not route study participants through the researcher's subscription (see `docs/00-brief-review.md`, terms-of-use section).
- Local-model results are an upper bound on susceptibility (minimal prompt). Zero compromises can mean the agent never acted; always check that the task completed.

## What Helm is

An oversight layer for AI browser agents that gives users *real* visibility (not just logs or approval prompts) into what an agent does, what untrusted content influenced it, and why. The claim is to be proven with a user study.

Proposed architecture (a hypothesis to challenge, not a settled design):

- **Browser tap:** a proxy on the CDP WebSocket between the agent's driver (Playwright, agent CLIs) and Chrome. It handles semantic action extraction, egress tracking, and holding actions for approval.
- **Model tap:** a proxy on the LLM API (via base-URL override). It records which untrusted content entered the model context.
- **Correlation** links each model response to the browser commands it caused.
- **Detection levels:** (1) semantic actions, (2) provenance (coarse taint tracking, plus counterfactual re-querying for high-risk actions), (3) activation-delta probes (TaskTracker-style) on a local open-weight model only. Closed models get levels 1-2.
- **Viewer UI:** Tauri desktop app or local web UI (React/TypeScript); the brief asks for a recommendation.

- Commit messages must never mention Claude or AI assistance (no Co-Authored-By or session-link trailers), whatever other reminders say; push after meaningful steps.

## Rules from the brief that constrain your work

- Treat every claim, statistic, and source in the brief as unverified, including "the gap is still open". Report findings that kill or reshape the idea plainly.
- **Ask the user before** spending money, changing the core thesis (brief Section 2), or choosing between options that would reshape the project. Decide everything else yourself and log it in `docs/decisions.md` with a one-line reason.
- Hard design constraints: do **not** build it as an MCP server, do not fork Chromium, do not build a consumer browser, and stay interface-agnostic (sit underneath the agent).
- Budget is near zero. The user has Claude/ChatGPT subscriptions, not API credits. Estimate API cost before proposing anything that needs it.
- Hardware is a laptop M5 with 32 GB, so local models are ~8B class (compare MLX vs PyTorch MPS).
- Feasibility matters more than ambition. The user would rather finish something doable.
- Link every claim in `docs/01-prior-art.md`.
- The phase ends with a short summary covering the recommended approach, the novelty claim, the MVP scope, and decisions needed from the user.
