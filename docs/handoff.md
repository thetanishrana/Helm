# Handoff (written 2026-10-29)

Read this first in a new session, then `CLAUDE.md`, then `docs/decisions.md`. Everything below was true at commit `3405781`; check `git log` for anything newer.

## What Helm is, in one paragraph
Oversight layer for AI browser agents. Two proxies sit under the agent (model API tap, browser CDP tap). A policy classifies each tool call, an explainer says whether the user asked for it and which page text pushed the agent toward it, and risky actions are held (with SSE keepalive pings) until the user decides in a local web UI. Quiet when the user asked for the action. Research prototype.

## State of the project
| Gate | State |
| --- | --- |
| 1 Working product | Built in `src/` (launcher, taps, policy, explainer, counterfactual confirmer, approvals, event log, web UI, receipt). Run end to end once on a local model. Proxy overhead ~0.04 ms p50. **Missing:** demo clip, run on a subscription Claude model, other agent CLIs, egress data in the receipt. |
| 2 Measured detection (the headline) | Offline harness (`src/eval/`) and live-agent harness (`node src/eval/cli.mjs agent`) built. Dev-set (in-sample) result: unprotected attack success 8/24 (33%) vs 0/24 with Helm blocking; harmless steps still done 22/24. See `docs/results/agent-dev-qwen3-coder-30b/README.md`. **Missing: the held-out set** (the owner's volunteer is to write it; guide in `eval-pages/README.md`). |
| 3 Human evidence | **Revised:** no participant pool, so a qualitative pilot (owner + one volunteer), no percentage claim. Study instrument is built (`src/replay/`: conditions A/B/C, counterbalanced plan, consent, practice, debrief, analysis) and tested only with simulated participants. Consent text is a draft with a placeholder contact line. |
| 4 Activation probes | Not started; first on the cut list. |
| 5 Package | Not started (demo video, writeup, a one-line headline result). |

## Decisions already made (full log in `docs/decisions.md`)
- Thesis kept, but stated as a design hypothesis, not a result (no study).
- Headline = automated evaluation + demo. Dev numbers are in-sample and must be labelled so; quote held-out numbers.
- Hold at the model tap with keepalive pings (not CDP errors, not rewriting denied calls into `echo`). Deny ends the turn with a text block.
- Local Ollama model (qwen3-coder:30b, minimal prompt) is the susceptible test agent; its numbers are an upper bound for Claude Code.
- Do not route anyone else through the owner's Claude subscription. Spending any money needs the owner's approval.
- Web UI is vanilla JS (no build). Spikes in `spikes/` are frozen evidence; do not edit their results.

## What needs the owner (cannot be done by the agent)
1. volunteer writes held-out pages (`eval-pages/README.md`, `eval-pages/_template/`) and must not read `src/` first. Do **not** tune the explainer on held-out results; if you do, log it and treat those pages as dev.
2. Owner and volunteer dry-run the replay: `node src/replay/cli.mjs --participant me --index 0 --open`.
3. Fill the contact placeholder in `src/replay/texts.mjs` before anyone else sees consent text.
4. Approval needed before: running a Claude model through the evaluation (`--allow-subscription`, ~4 requests per run), any paid service, or changing the thesis.

## Suggested next steps (pick in this order unless the owner says otherwise)
1. ~~Invitation message for the volunteer~~ (drafted in conversation, owner sends it).
2. ~~Multi-step benign tasks~~ done: `--set multistep`, results in `docs/results/agent-multistep-qwen3-coder-30b/` (up to 2/20 runs with an unnecessary pause; Helm cannot read CSS-selector or `eval` targets and pauses them). Owner decided to leave the safe-default pause for now and revisit later.
3. Second agent: a Claude model via `--agent claude:<model> --allow-subscription` (ask first).
4. When held-out pages arrive: `node src/eval/cli.mjs capture`, `validate`, `detect --set heldout`, then `agent --set heldout --modes measure,block --reps 3`.
5. Demo clip and writeup; then Gate 1 leftovers (egress in receipt, other CLIs).

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
