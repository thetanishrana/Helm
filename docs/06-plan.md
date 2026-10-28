# Plan

No deadline, so progress is measured in gates ([00-success-criteria.md](00-success-criteria.md)). Estimates below are in focused working hours, based on how long the spikes took; they are guesses.

## Where the work stands
| Gate | State |
| --- | --- |
| 1 Working product | First vertical slice built in `src/` (63 tests): launcher, both taps, policy and explainer, approval round-trip over HTTP, event log, web UI with status line, cards, timeline and receipt. Run live once end to end on a local model (injected click held, explained, blocked). Proxy overhead measured: about 0.04 ms p50 and no measurable p95 difference per CDP `evaluate` (localhost, `spikes/cdp-proxy/bench.mjs`), well inside the 50 ms target. Missing: fatigue-aware friction beyond a fixed Allow delay, ambient menu-bar item, replay mode, receipt egress data, README quick start polish, demo clip, support for agents other than Claude Code + `playwright-cli`, long-hold retry run, subscription-model run of the live flow. |
| 2 Measured detection | Early numbers on 25 author-written pages (see [03-detection.md](03-detection.md)); no realistic benign tasks, no held-out set, one susceptible agent. |
| 3 Human evidence | Design only ([05-evaluation.md](05-evaluation.md)). |
| 4 Activations | Not started. |
| 5 Shareable package | Not started. |

## Minimum viable product (smallest thing with a real headline)
One command starts Claude Code or a local model through the taps with the web UI; injected high-risk actions are held with the cause card; asked-for actions pass quietly; a receipt is produced; a recorded-session replay mode exists for the study. Headline: "people stopped X% of injected actions with Helm vs Y% with standard prompts."

## Phases
1. **Gate 1 build (about 30-40 h).** Convert spikes to a TypeScript package: launcher, event store, approval round-trip (the policy's `ask` becomes a UI decision), web UI with ambient status, card, timeline, receipt. Keep `node --test` suites; port the replay and integration tests.
2. **Realistic tasks and held-out attacks (about 20-30 h).** Benign task set with legitimate instruction text, a blind attack set (ask a volunteer to write 15), at least two agents. Measure false interrupts honestly. Tune the interrupt rule once.
3. **Replay mode and study materials (about 15-20 h).** Record compromised and benign runs, scripted outcomes, consent and debrief text, NASA-TLX form, data capture of decisions and latencies, pilot with 3 people, one redesign.
4. **Main study (about 15-20 h over a few weeks of scheduling).** 12-15 participants, analysis, per-person plots.
5. **Optional: activation detector (about 25-40 h).** Only if time allows; success test is whether it improves Level 2 precision on the local agent.
6. **Package (about 20 h).** Demo video, writeup, README, one-command eval.

## Costs
- $0 recurring so far. Claude haiku runs used small subscription usage; local runs used no API. Counterfactual checks on a subscription model would use about 8 extra requests per held action; keep them off by default for subscription models, or run them on the local model only.
- A paid API key is not needed unless the study moves to live runs on a hosted model. That would need your approval first.
- Participants: unpaid volunteers assumed. A small participant payment budget would be a spend that needs approval.

## Top risks and mitigations
| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Few compromised runs from realistic agents | The suite and the study need positives; Claude resisted 38 of 38 simple injections | Use the local model for the suite and record its compromises; add stronger techniques; be explicit that local results are an upper bound |
| Heuristics overfit to my pages | Reported rates would be inflated | Blind attack set written by others; freeze rules before scoring; report in-sample vs held-out separately |
| Anthropic terms for subscription traffic through a proxy | Documented only for organization gateways | Proxy never stores credentials, localhost only, each user uses their own login; study uses replay or local models, not participants on the researcher's account; ask Anthropic if in doubt |
| Study shows no benefit | Headline gone | Allowed outcome per your instruction: one redesign, then report honestly with a failure analysis |
| Agent products change their internals (headers, tool formats, streaming) | The tap parses specific shapes (`prompt-id` header was documented but absent) | Pin versions in the manifest; keep parsers tolerant; integration tests with a stub upstream |
| Machine contention | A 30B model plus other apps swapped heavily and invalidated one battery | Check memory before runs, record load, use the minimal-prompt mode, repeat runs |
| Replay hides agent adaptation | Participants do not see a live agent react | State it as a limitation; compare a small live local-model session as a sanity check |
| Scope creep into detection research | Large time sink with unproven value | Gate 4 only after Gate 3 data exists |

## Cut list (first to go)
1. Activation detector (Gate 4).
2. Ablation arms in the study (keep the three main conditions).
3. Extra agents/CLIs beyond Claude Code + `playwright-cli` and one local model.
4. Counterfactual confirmation in the UI (keep it as an offline analysis for the writeup).
5. Ambient status line (keep card, timeline, receipt).
6. Vision-based injection handling.

## Decisions waiting for you
1. Recorded replay vs live runs for the study (design leans to replay because of the terms question and repeatability).
2. Whether to ask Anthropic about proxying a subscription login, and whether to spend on a paid API key for live Claude runs.
3. Who writes the blind attack pages and who is willing to be a pilot participant.
4. Whether the activation detector stays on the list.
