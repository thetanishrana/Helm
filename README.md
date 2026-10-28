# Helm

Live oversight for AI browser agents. Helm sits underneath the agent, watches the model API and the browser, and tells the person supervising, in plain language, which page text pushed the agent toward a risky action, before the action runs. Quiet when the user asked for the action.

![A held action in the Helm UI](docs/assets/ui-pending.png)

**Status: early.** The first slice works end to end on Claude Code driving Chrome through `playwright-cli`, tested mostly against a local model and author-written attack pages. Treat every number as preliminary: read [docs/03-detection.md](docs/03-detection.md) and [docs/05-evaluation.md](docs/05-evaluation.md) for what was and was not measured. No user study has been run yet.

## Try it
```
npm install
npm test
node demo/pages.mjs turn_tag &            # a page with an injected instruction
node src/cli.mjs run --open --exit -- <your agent command>
```
The agent's model API and browser are pointed at Helm through `ANTHROPIC_BASE_URL` and `HELM_CDP_URL` (a Playwright CLI session attaches with `playwright-cli attach --cdp=$HELM_CDP_URL`). See `node src/cli.mjs` for options.

## Study replay (for the user study)
```
node src/replay/cli.mjs --condition C --participant p1 --scenarios injected --fast --open
```
Replays recorded agent runs to a person as condition A (raw log), B (standard prompts) or C (Helm) and saves their decisions. See [docs/05-evaluation.md](docs/05-evaluation.md).

## Read next
[docs/00-brief-review.md](docs/00-brief-review.md) · [docs/02-architecture.md](docs/02-architecture.md) · [docs/06-plan.md](docs/06-plan.md)
