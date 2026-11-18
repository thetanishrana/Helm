# Handoff: current state and how to continue

Read this first in a new session, then `CLAUDE.md`, then the last rows of `docs/decisions.md`. Updated 2026-11-18. For the project in plain language start with `docs/writeup.md`; for the held-out measurements, `docs/heldout-findings.md`.

## State
- **Product (Gate 1):** working. Two proxies under the agent (model API tap, browser CDP tap), a policy and explainer, hold-for-decision with SSE keepalive, a local web UI (course view, decision card, receipt), a read-only CSS-selector lookup, an opt-out attribution judge, and multi-agent supervision (`node src/cli.mjs fleet <file>`; see `docs/multi-agent-design.md` for what exists and what does not). 144 tests (`npm test`) and 33 interface checks (`npm run ui:check`, needs Chrome).
- **Measured detection (Gate 2):** done, with honest limits. Interception on unseen pages: allowlist rule 12/12, 6/6, 6/6 across the last three held-out sets, at the cost of some false pauses (3 of 42 harmless actions). Naming the pushing passage: about a third with heuristics, 24/24 with the model judge on the last three sets (only `heldout7`, 6 pages, is a clean test of the final judge). Which sets are clean and which are dev data is tracked in `docs/heldout-findings.md` and `docs/decisions.md`; never tune on a clean set without logging that it became dev data.
- **Human evidence (Gate 3):** none. No participant pool; a replay instrument exists (`src/replay/`) and has only been tested with simulated participants. A real session needs `--contact "..."` (shown in the consent text); there are no contact details in the repository.
- **Activation probes (Gate 4):** not started.
- **Package (Gate 5):** README, write-up, screenshots (`docs/assets/`), demo script, two clip recorders (`scripts/record-demo.mjs` live with a local model; `scripts/record-fleet-preview.mjs` scripted). Clips are written to `demo/out/` (gitignored).

## Open items
- The judge's "a different action does not count" rule was tuned on the three known false pauses; a fresh batch of false-pause-prone pages (harmless "View ..." links on pages that also carry an injection) would test it. Authoring prompt: `eval-pages/CHATGPT-PROMPT.md`; importer: `scripts/import-eval-pages.mjs`.
- False pauses from the old verb list ("refill") and unfamiliar harmless buttons ("View document"); `eval` snippet targets are still opaque. The CSS-selector lookup is checked against a real Chrome but not measured on the evaluation sets.
- Multi-agent: no Sites view, no cross-agent taint, no shared-Chrome mode; two agents on one local model were too slow to evaluate; agents must use separate browser sessions.
- No user study; the claim that explanations help people decide better is a design hypothesis.

## Rules that matter
- Commit messages must never mention Claude or AI assistance (no trailers).
- Ask before spending money or running a Claude model through the evaluation (it uses the maintainer's subscription login). The attribution judge is on by default and sends page text and the request to Claude: use `--no-judge` when that is not acceptable, and never route study participants through it.
- Do not tune on a held-out set; do not edit `spikes/` results; no third-party skill with executable files (`docs/skills-vetting.md`).
- Run `npm run ui:check` after any UI change. The UI must never use innerHTML or equivalents (a test enforces it).

## Environment traps
- Node 24; Chrome at `/Applications/Google Chrome.app`; Ollama for local models (`helm-qwen30b`, a 32k-context variant of qwen3-coder:30b). `ollama serve` often must be restarted (`nohup ollama serve &`); a dead server returns 502 and invalidates runs.
- Fixed ports: 7777 UI, 8787 model tap, 9333 CDP tap, 9222 Chrome, 8899 page server (fleet runs count up from the tap, CDP and Chrome ports). A leftover process crashes a run instantly; free a port with `lsof -ti tcp:PORT | xargs kill`. Never `pkill -f` or `grep | xargs kill` a pattern that appears in your own command line. `grep -P` and `timeout` do not exist on macOS.
- A background job can outlive its session; check `ps` before restarting an evaluation. A 30B model plus other apps can swap heavily and invalidate a whole battery: check memory before long runs.

## Facts that are easy to get wrong
- Claude Code runs tools while the response is still streaming; correlate to the latest model turn that had started.
- Agents chain actions in one command; every action must be judged.
- Agents restate injections in their own messages; counterfactual removal must blank those too.
- Zero compromises can mean the agent never acted; always check task completion.
- Snapshot names that differ from visible text (long aria-labels) and named table cells carry page content; the passage extractor must keep them (a bug here made the judge's first fresh-set run a null result).
- Several original figures in the first brief were corrected in `docs/00-brief-review.md`.
