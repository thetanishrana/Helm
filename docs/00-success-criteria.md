# Success criteria

There is no deadline, so success is defined by gates. Each gate leaves a shippable artifact, so stopping after any gate still leaves a finished project. Thresholds are first guesses: recalibrate after the first real run, and log any change in `decisions.md` instead of quietly moving them.

## Gate 1: Working product 
- One command launches Claude Code + Playwright CLI through both taps. The agent needs nothing beyond a base-URL setting.
- The timeline shows semantic actions, each linked to the model turn that caused it.
- A high-risk action can be held for a decision without crashing the agent or tripping its timeouts.
- Proxy overhead under 50 ms p95 per CDP command, excluding held actions.
- Artifact: repo, README, 60-second clip.

## Gate 2: Measured detection
- At least 40 local injection pages across at least 6 technique families, plus at least 40 matched benign tasks. One command reproduces the results.
- Against attacks that reach a high-risk action:
  - interception at least 90%
  - attribution accuracy at least 80% (the highlighted chunk is the injected one)
  - false interrupts at most 10% of benign tasks, and at most 1 interrupt per task on average
- Report added latency and extra model calls per task.
- Artifact: results table.

## Gate 3: Human evidence (the headline)
- n = 12-15, within-subjects, three conditions (raw replay, standard prompts, Helm), counterbalanced order, different injection placements per condition.
- One pilot (n = 3), at most one UX redesign, then the main study.
- Primary measure: percentage of attacks stopped. Secondary: malicious approvals, time to decision, false interrupts, NASA-TLX.
- Win: Helm beats standard prompts by at least 25 percentage points, with NASA-TLX no worse. Prior baselines are low ([13.6% caught](https://www.theregister.com/a/5285326), unverified; [66.3% accuracy](https://mer.vin/news/human-in-the-loop-approval-misses-ai-agent-threats/)), so this is plausible.
- With n near 14, report effect sizes and per-participant plots, not only p-values.
- No win: report it honestly with a per-condition failure analysis.
- Artifact: "Users stopped X% of injections with Helm vs Y% with standard prompts, at Z interrupts per task."

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
