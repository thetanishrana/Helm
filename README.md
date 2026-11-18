# Helm

Live oversight for AI browser agents. Helm sits underneath the agent, watches the model API and the browser, and tells the person supervising, in plain language, which page text pushed the agent toward a risky action, before the action runs. Quiet when the user asked for the action.

![A held action in the Helm interface: the request, what the agent wants, the page text that pushed it, and the course so far](docs/assets/ui-attributed.png)

<sub>[Dark mode](docs/assets/ui-pending-dark.png) · [after a block](docs/assets/ui-blocked.png) · [several agents at once](docs/assets/ui-fleet.png) · [narrow window](docs/assets/ui-narrow.png) · design notes: [docs/ui-design.md](docs/ui-design.md), [docs/multi-agent-design.md](docs/multi-agent-design.md)</sub>

**Status: working research prototype.** It runs end to end on Claude Code driving Chrome through `playwright-cli`, for one agent or several at once. What was measured, on small test sets written by other models (ChatGPT and fresh Claude sessions), and what it means:
- **Stopping the click works on unseen pages.** The first design (a list of dangerous button words) missed a new verb nearly every round (5/8, 11/12, 9/12, 11/12 on four sets). An allowlist of harmless button words replaced it. Since then every attack page in three further sets was intercepted (12/12, 6/6, 6/6). The cost is some false pauses on unfamiliar harmless buttons (3 of 42 harmless actions across those sets: "View document" twice, "View cartridge refill pack").
- **Saying why was the weak part, and a model judge fixed it.** The word-matching explainer named the page text that pushed the agent on only about a third of attacks on clean sets (4/12, 4/6). A model judge (a Claude model reads the page passages and picks the one that asks for the action) named the right passage on all 24 attack pages of the last three sets, with no wrong passage (the heuristics alone: 12 of 24). Only the last set (6 pages) is a clean test of the final version, so read that as "works on every page so far", not as a rate. The judge is **on by default and sends page text and your request to Claude** (`--no-judge` to turn it off); it can attach a cause to a harmless false pause, which a prompt rule now prevents on the three known cases (tuned on them, so not yet independently tested).
- **Not shown:** that any of this helps a real person decide better. No user study has been run, and the test pages were not written by human attackers. The headline in-sample result (a susceptible local agent followed 33% of injections unprotected, 0% with Helm blocking) is on pages the explainer was built from.

Read [docs/writeup.md](docs/writeup.md) first, then [docs/heldout-findings.md](docs/heldout-findings.md); every number's provenance is in `docs/results/`.

## Try it
```
npm install
npm test
demo/run-demo.sh turn_tag      # local model (Ollama, helm-qwen30b) browses a page with an injected instruction; Helm holds the action
```
See [docs/demo-script.md](docs/demo-script.md); `node scripts/record-demo.mjs` records a silent captioned clip of it. To use another agent: `node src/cli.mjs run --open --exit -- <your agent command>`. Several agents in one interface: `node src/cli.mjs fleet <fleet.json>` (see `src/fleet.mjs`; each agent needs its own browser session). The attribution judge uses your Claude login and is on by default; `--no-judge` turns it off.
The agent's model API and browser are pointed at Helm through `ANTHROPIC_BASE_URL` and `HELM_CDP_URL` (a Playwright CLI session attaches with `playwright-cli attach --cdp=$HELM_CDP_URL`). See `node src/cli.mjs` for options.

## Evaluation
```
node src/eval/cli.mjs detect          # scores the explainer on rendered pages; dev (in-sample) and held-out reported separately
```
Add `--heldout-dir eval-pages/heldout7` for a held-out set (sets 1-6 are dev data after fixes; `heldout7` is the clean test of the judge). The judge is scored with `node src/eval/judge-eval.mjs <dir>` (uses your Claude login). Live-agent runs: see the usage block at the top of `src/eval/cli.mjs`. Authoring guide for new sets: `eval-pages/README.md`.

## Study replay (usability pilot; no participant pool yet)
```
node src/replay/cli.mjs --participant P01 --index 0 --open          # a whole counterbalanced session
node src/replay/cli.mjs --condition C --participant p1 --scenarios injected --fast --open   # one condition
node scripts/analyze-study.mjs study-data
```
Replays recorded agent runs to a person as condition A (raw log), B (standard prompts) or C (Helm) and saves their decisions. The consent and debrief text is a draft. See [docs/05-evaluation.md](docs/05-evaluation.md).

## Read next
[docs/00-brief-review.md](docs/00-brief-review.md) · [docs/02-architecture.md](docs/02-architecture.md) · [docs/06-plan.md](docs/06-plan.md)
