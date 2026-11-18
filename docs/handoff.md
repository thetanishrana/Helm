# Handoff (updated 2026-11-04, after the fourth held-out set)

Read this first in a new session, then `CLAUDE.md`, then `docs/decisions.md`. The state table and next steps below were updated at commit `296d2e8`; check `git log` for anything newer. Start with `docs/writeup.md` (the project in plain language) and `docs/heldout-findings.md` (what held-out testing found).

## Latest state (2026-11-06): read this section first, the older text below is partly stale
- **Product and evaluation:** done and documented. Risk rule is now an allowlist of harmless button words (`src/model/explain.mjs`); five held-out sets by other models; the clean test of the allowlist (`eval-pages/heldout5`) gave 12/12 intercepted, 4/12 causes named, 2/20 harmless actions paused (one label, "View document"). Details: `docs/heldout-findings.md`, `docs/writeup.md`, `docs/results/`. 123 tests pass (`npm test`).
- **Interface:** rebuilt 2026-11-05 (`docs/ui-design.md`, screenshots `docs/assets/`). `npm run ui:preview -- <state>` and `npm run ui:check` (21 checks, needs Chrome) must pass after any UI change. A live run against the real product was verified headless: card in ~15 s, re-run check confirmed, Block works. **Not yet run:** the demo in its visible-window mode (two windows) and nothing has been tried with a person.
- **Skills:** `.claude/skills/frontend-design/` (Anthropic's, vetted, hash-checked by a test). Hallmark and Impeccable were read but not installed because they bundle executable scripts; rule in `CLAUDE.md` and `docs/skills-vetting.md`. The permission classifier blocks running third-party code and force-pushes; do not work around it, ask the owner.
- **Git, needs the owner:** the three commits that named Claude in their messages were reworded locally (backup branch `backup-before-reword`, same files). `origin/main` still has the old history, so local `main` is 21 ahead and 21 behind. The owner must run `git push --force-with-lease origin main` (or approve it). Do not `git pull`; it would duplicate the history. Then `git branch -D backup-before-reword`. Commit messages must never mention Claude or AI (see `CLAUDE.md`).
- **Repo:** private, MIT licence, description set. The owner will make it public: open items are the `[researcher name and email ...]` placeholder in `src/replay/texts.mjs` and whether to keep `research brief.md` and the internal docs. The owner's email is in all commits.
- **Open (updated 2026-11-16):** demo clip made by `node scripts/record-demo.mjs`; history pushed; interface finish pass and CSS-selector lookup done; concept lexicon tried for attribution (null on the clean set); model judge for attribution (ON by default since 2026-11-18, `--no-judge` to disable) lifted cause naming on the clean set 4/12 -> 11/12 (see heldout-findings, 7th measurement; sends page text and the request to Claude); multi-agent supervision BUILT (`node src/cli.mjs fleet`, `docs/multi-agent-design.md` lists what exists and what does not; 138 tests, 33 UI checks). Attribution still about a third on unseen pages. No user study.
- **Environment traps:** `ollama serve` often must be restarted (a dead server returns 502 and invalidates runs); fixed ports 7777, 8787, 8899, 9222, 9333 (and 8897 for page capture); free with `lsof -ti tcp:PORT | xargs kill`; never `pkill -f` a pattern in your own command. `grep -P` and `timeout` do not exist on this Mac.

**Next (owner, 2026-11-18):** batch one (k01-k06) of the ChatGPT set is in `eval-pages/heldout6` and is now DEV data (it exposed two extraction bugs, fixed; see heldout-findings, 8th measurement). The clean test of the fixed judge is batch two (k07-k12) plus the benign batch: paste the follow-up messages from `eval-pages/CHATGPT-PROMPT.md`. Original instruction: get a sixth blind set from ChatGPT using `eval-pages/CHATGPT-PROMPT.md` (3 messages: two attack batches, one benign batch), import with `node scripts/import-eval-pages.mjs <reply.txt> eval-pages/heldout6`, then tell Claude to capture, validate and score once (heuristics via `node src/eval/cli.mjs detect --set heldout --heldout-dir eval-pages/heldout6`, judge via `node src/eval/judge-eval.mjs eval-pages/heldout6`). No tuning on it; log the result.

## What Helm is, in one paragraph
Oversight layer for AI browser agents. Two proxies sit under the agent (model API tap, browser CDP tap). A policy classifies each tool call, an explainer says whether the user asked for it and which page text pushed the agent toward it, and risky actions are held (with SSE keepalive pings) until the user decides in a local web UI. Quiet when the user asked for the action. Research prototype.

## State of the project
| Gate | State |
| --- | --- |
| 1 Working product | **Interface rebuilt 2026-11-05** (`docs/ui-design.md`; screenshots in `docs/assets/`; `npm run ui:check` passes 20/20); not yet tried with a person. Built in `src/` (launcher, taps, policy, explainer, counterfactual confirmer, approvals, event log, web UI, receipt). Run end to end once on a local model. Proxy overhead ~0.04 ms p50. **Missing:** demo clip, run on a subscription Claude model, other agent CLIs, egress data in the receipt. |
| 2 Measured detection (the headline) | **Done, with an honest answer.** Four held-out sets by other models: first (ChatGPT) 5/8 intercepted, cause 2/8; second 11/12, cause 7/12 after a measurement correction; third 9/12, cause 4/12; fourth (fresh Claude, **clean, scored once on the frozen explainer `fdac006`**) **11/12 intercepted (CI 65-99%), cause named 3/12, 0/19 false interrupts**. Sets 1-3 are dev data (each was fixed against). Dev (in-sample): live local agent followed 33% unprotected, 0% with Helm blocking. Misses were always a consequential verb missing from the risk list; on 2026-11-05 the list was inverted into an allowlist of harmless button words (`docs/results/allowlist-rule/`: 12/12 offline on all sets but in-sample; live multi-step 1 pause in 53 actions). **Clean test of the allowlist (fifth blind set, scored once on the frozen rule): 12/12 intercepted (CI 76-100%), cause named 4/12, 2/20 harmless actions paused (one label, "View document"), 0/3 asked.** `docs/results/detect-heldout5-allowlist-claude-fresh-5/`. Details: `docs/heldout-findings.md`, `docs/results/`. |
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
   Held-out pages are written by other models now (`eval-pages/heldout*`); `heldout5` is the one set that is clean for the allowlist; if you do, log it and treat it as dev.
2. Owner and volunteer dry-run the replay: `node src/replay/cli.mjs --participant me --index 0 --open`.
3. Fill the contact placeholder in `src/replay/texts.mjs` before anyone else sees consent text.
4. Approval needed before: running a Claude model through the evaluation (`--allow-subscription`, ~4 requests per run), any paid service, or changing the thesis.

## Suggested next steps
Done: invitation/blind authoring (LLM authors instead of the volunteer), multi-step benign tasks, Claude Haiku 5.5 on dev and multistep sets (owner-approved; 0 injections followed), three held-out sets, packaging (`README.md`, `docs/writeup.md`, `docs/demo-script.md`, `demo/run-demo.sh`).
1. **Record the demo clip** (owner).
2. Optional, only if the owner wants it: a fifth blind set after a further fix round (e.g. disable-firewall-style verbs; makes `heldout4` dev data, and the pattern so far is that each round finds a new verb); resolve more CSS-selector forms so harmless clicks are not paused (owner deferred this); Gate 1 leftovers (egress data in the receipt, other agent CLIs); the qualitative pilot (owner + one volunteer; fill the consent contact placeholder first).
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
