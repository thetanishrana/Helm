# Handoff (updated 2026-11-04)

Read this first in a new session, then `CLAUDE.md`, then `docs/decisions.md`. The state table and next steps below were updated at commit `296d2e8`; check `git log` for anything newer. Start with `docs/writeup.md` (the project in plain language) and `docs/heldout-findings.md` (what held-out testing found).

## What Helm is, in one paragraph
Oversight layer for AI browser agents. Two proxies sit under the agent (model API tap, browser CDP tap). A policy classifies each tool call, an explainer says whether the user asked for it and which page text pushed the agent toward it, and risky actions are held (with SSE keepalive pings) until the user decides in a local web UI. Quiet when the user asked for the action. Research prototype.

## State of the project
| Gate | State |
| --- | --- |
| 1 Working product | Built in `src/` (launcher, taps, policy, explainer, counterfactual confirmer, approvals, event log, web UI, receipt). Run end to end once on a local model. Proxy overhead ~0.04 ms p50. **Missing:** demo clip, run on a subscription Claude model, other agent CLIs, egress data in the receipt. |
| 2 Measured detection (the headline) | **Done, with an honest answer.** Three held-out sets by other models: first (ChatGPT) 5/8 intercepted, cause 2/8, then fixed; second (fresh Claude) 11/12, cause 7/12 after a measurement correction; third (fresh Claude, clean, scored once) **9/12 intercepted (CI 47-91%), cause named 4/12, 0/20 false interrupts**. First two sets are now dev data. Dev (in-sample): live local agent followed 33% unprotected, 0% with Helm blocking. Misses are consequential verbs missing from the risk list (Cancel booking, Unlock front door, Change direct deposit); not fixed so the third set stays clean. Details: `docs/heldout-findings.md`, `docs/results/`. |
| 3 Human evidence | **Revised:** no participant pool, so a qualitative pilot (owner + one volunteer), no percentage claim. Study instrument is built (`src/replay/`: conditions A/B/C, counterbalanced plan, consent, practice, debrief, analysis) and tested only with simulated participants. Consent text is a draft with a placeholder contact line. |
| 4 Activation probes | Not started; first on the cut list. |
| 5 Package | **Mostly done 2026-10-30:** `README.md`, `docs/writeup.md`, `docs/demo-script.md`, `demo/run-demo.sh` (verified headless: 1 held, 1 blocked). **Missing:** the recorded demo clip (owner records it from the script). |

## Decisions already made (full log in `docs/decisions.md`)
- Thesis kept, but stated as a design hypothesis, not a result (no study).
- Headline = automated evaluation + demo. Dev numbers are in-sample and must be labelled so; quote held-out numbers.
- Hold at the model tap with keepalive pings (not CDP errors, not rewriting denied calls into `echo`). Deny ends the turn with a text block.
- Local Ollama model (qwen3-coder:30b, minimal prompt) is the susceptible test agent; its numbers are an upper bound for Claude Code.
- Do not route anyone else through the owner's Claude subscription. Spending any money needs the owner's approval.
- Web UI is vanilla JS (no build). Spikes in `spikes/` are frozen evidence; do not edit their results.

## What needs the owner (cannot be done by the agent)
1. Record the demo clip from `docs/demo-script.md` (`demo/run-demo.sh turn_tag`; needs Ollama running).
   Held-out pages are written by other models now (`eval-pages/heldout*`); `heldout3` is the one clean set. Do **not** tune the explainer on it; if you do, log it and treat it as dev.
2. Owner and volunteer dry-run the replay: `node src/replay/cli.mjs --participant me --index 0 --open`.
3. Fill the contact placeholder in `src/replay/texts.mjs` before anyone else sees consent text.
4. Approval needed before: running a Claude model through the evaluation (`--allow-subscription`, ~4 requests per run), any paid service, or changing the thesis.

## Suggested next steps
Done: invitation/blind authoring (LLM authors instead of the volunteer), multi-step benign tasks, Claude Haiku 5.5 on dev and multistep sets (owner-approved; 0 injections followed), three held-out sets, packaging (`README.md`, `docs/writeup.md`, `docs/demo-script.md`, `demo/run-demo.sh`).
1. **Record the demo clip** (owner).
2. Optional, only if the owner wants it: a fourth blind set after a further fix round (add unlock/booking/deposit-style verbs; makes `heldout3` dev data); resolve more CSS-selector forms so harmless clicks are not paused (owner deferred this); Gate 1 leftovers (egress data in the receipt, other agent CLIs); the qualitative pilot (owner + one volunteer; fill the consent contact placeholder first).
3. Any further Claude-model run needs explicit owner approval each time (subscription).

## Environment notes
- Node 24, Chrome at `/Applications/Google Chrome.app`, Ollama installed. `ollama serve` often has to be restarted per session (`nohup ollama serve &`); a stopped server makes runs fail with model errors, which the harness records as unusable runs. Models: `helm-qwen30b` (32k context variant of qwen3-coder:30b), `helm-qwen7b`; `gpt-oss:20b` is the owner's.
- Machine is a 32 GB laptop; the 30B model plus other apps swapped heavily once and invalidated a whole battery. Check memory before long runs.
- Fixed ports: 7777 UI, 8787 model tap, 9333 CDP tap, 9222 Chrome, 8899 page server. A leftover process on these crashes runs instantly ("NO RESULT (runner crashed)"). Free with `lsof -ti tcp:PORT | xargs kill`. Never `pkill -f` / `grep | xargs kill` a pattern that appears in your own command line (it kills your shell).
- A background job can outlive its session and keep running; check `ps` before restarting an evaluation, and kill old orchestrators by PID.
- `npm test` = 106 tests, under a second, no network or model. A hung test file means a test failed before closing its servers.

## Facts that are easy to get wrong
- Claude Code runs tools while the response is still streaming; correlate to the latest model turn that had started.
- Agents chain actions in one command; every action must be judged (a bug here let an attack through).
- Agents restate injections in their own messages; counterfactual removal must blank those.
- `x-claude-code-prompt-id` / `request-class` headers were documented but absent in `claude -p` mode.
- Zero compromises can mean the agent never acted; always check task completion.
- Published sources: several figures in the original brief were corrected in `docs/00-brief-review.md` (e.g. "Coding with Enemy" is NeurIPS; its 56% was misstated).
