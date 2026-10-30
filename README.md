# Helm

Live oversight for AI browser agents. Helm sits underneath the agent, watches the model API and the browser, and tells the person supervising, in plain language, which page text pushed the agent toward a risky action, before the action runs. Quiet when the user asked for the action.

![A held action in the Helm UI](docs/assets/ui-pending.png)

**Status: working research prototype.** It runs end to end on Claude Code driving Chrome through `playwright-cli`. On two small sets of attack pages written by other models (ChatGPT, then a fresh Claude session) it stopped the consequential click on 5/8 and 11/12 unseen attacks but named the page text responsible on only 2/8 and 2/12. The headline in-sample result (a susceptible local agent followed 33% of injections unprotected, 0% with Helm blocking) is on pages the explainer was built from. No user study has been run. Read [docs/writeup.md](docs/writeup.md) first, then [docs/heldout-findings.md](docs/heldout-findings.md); every number's provenance is in `docs/results/`.

## Try it
```
npm install
npm test
demo/run-demo.sh turn_tag      # local model (Ollama, helm-qwen30b) browses a page with an injected instruction; Helm holds the action
```
See [docs/demo-script.md](docs/demo-script.md). To use another agent: `node src/cli.mjs run --open --exit -- <your agent command>`.
The agent's model API and browser are pointed at Helm through `ANTHROPIC_BASE_URL` and `HELM_CDP_URL` (a Playwright CLI session attaches with `playwright-cli attach --cdp=$HELM_CDP_URL`). See `node src/cli.mjs` for options.

## Evaluation
```
node src/eval/cli.mjs detect          # scores the explainer on rendered pages; dev (in-sample) and held-out reported separately
```
Add `--heldout-dir eval-pages/heldout2` for the second held-out set (`eval-pages/heldout/` is the first, now dev data after fixes). Live-agent runs: see the usage block at the top of `src/eval/cli.mjs`. Authoring guide for new sets: `eval-pages/README.md`.

## Study replay (usability pilot; no participant pool yet)
```
node src/replay/cli.mjs --participant P01 --index 0 --open          # a whole counterbalanced session
node src/replay/cli.mjs --condition C --participant p1 --scenarios injected --fast --open   # one condition
node scripts/analyze-study.mjs study-data
```
Replays recorded agent runs to a person as condition A (raw log), B (standard prompts) or C (Helm) and saves their decisions. The consent and debrief text is a draft. See [docs/05-evaluation.md](docs/05-evaluation.md).

## Read next
[docs/00-brief-review.md](docs/00-brief-review.md) · [docs/02-architecture.md](docs/02-architecture.md) · [docs/06-plan.md](docs/06-plan.md)
