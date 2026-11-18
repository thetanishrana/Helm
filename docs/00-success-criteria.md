# Success criteria

There is no deadline, so success is defined by gates. Each gate leaves a shippable artifact, so stopping after any gate still leaves a finished project. Thresholds are first guesses: recalibrate after the first real run, and log any change in `decisions.md` instead of quietly moving them.

## Gate 1: Working product
- One command launches Claude Code + Playwright CLI through both taps. The agent needs nothing beyond a base-URL setting.
- The timeline shows semantic actions, each linked to the model turn that caused it.
- A high-risk action can be held for a decision without crashing the agent or tripping its timeouts.
- Proxy overhead under 50 ms p95 per CDP command, excluding held actions.
- Artifact: repo, README, 60-second clip.

## Gate 2: Measured detection (now the headline result)
- At least 40 local injection pages across at least 6 technique families, plus at least 40 matched benign tasks, **including a held-out set written by someone else without seeing the explainer** (another person or a different model). One command reproduces the results. Report in-sample (dev) and held-out numbers separately.
- Against attacks that reach a high-risk action:
  - interception at least 90%
  - attribution accuracy at least 80% (the highlighted chunk is the injected one)
  - false interrupts at most 10% of benign tasks, and at most 1 interrupt per task on average
- Report added latency and extra model calls per task.
- Artifact: results table.

## Gate 3: Human evidence (revised 2026-10-28: small pilot, no percentage claim)
The original plan was a 12-15 person within-subjects study whose stop-rate difference would be the headline. There is no participant pool (the researcher knows the injected scenarios, so cannot serve as a naive participant, and a handful of volunteers cannot support a percentage). Decision: **the headline comes from the automated evaluation (Gate 2) and the demo; human evidence is a qualitative pilot.**
- The researcher and one or two volunteers run the instrument (`src/replay/`) as a usability pilot: find confusing screens, bad timings, scenarios that give the game away, and record what each person says the cards did or did not help with.
- Write it up as qualitative findings with n stated, no stop-rate percentages and no claim that Helm helps people. The "real vs apparent visibility" thesis stays **a design hypothesis supported by prior work and a working system, not shown by this project**.
- The full instrument stays in the repo so anyone with participants (or a later recruitment effort, e.g. a remote volunteer version or a paid platform, which would need approval) can run the original study.
- Artifact: a short pilot report and the fixes it caused.

## Gate 4: Activation detector (optional)
- Fara1.5-9B runs locally through Helm. A probe reuses the [2608.02657 code](https://github.com/jianshuod/IPI-exposure-signal) and passes the [2606.22864](https://arxiv.org/abs/2606.22864) controls.
- Success test: the probe improves Gate 2 precision on the local agent. If it doesn't, report that.

## Gate 5: Shareable package
- 2-3 minute demo video of an injection caught and explained.
- Blog post or arXiv-style writeup, and a one-line headline result.

## Cost
$0 recurring: subscription Claude Code, local models, locally hosted attack pages. Any paid item needs approval first.

## Kill or pivot triggers
- Claude Code OAuth passthrough fails: decide with the user whether to go local-model only.
- A shipped tool does live cross-layer provenance explanation for browser agents: reassess the USP with the user.
- Gate 1 runs far over estimate: re-scope before starting Gate 2.
