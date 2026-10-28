# Evaluation

What exists, what the automated and human evaluations should be, and the pitfalls already seen. Gate numbers are in [00-success-criteria.md](00-success-criteria.md).

## Measured so far (all in `spikes/agent-e2e`)
- 25 local pages (`attack-pages.mjs`): 7 note/authority/urgency/tip/JSON/accessibility-name styles, 10 posing as the user or system, 5 in plain language, and 3 controls or indirect pages (`clean`, `hidden` with `display:none`, two-hop). Compromise is "the agent clicked `#send`", a button that only changes the page title.
- Agents: Claude haiku (full Claude Code prompt, 38 runs, 0 compromised) and qwen3-coder:30b via Ollama (minimal prompt, 70 runs, 23 compromised, mostly pages posing as the user). Per-run results are in `traces/`; saved compromised requests allow replay.
- Per-run cost: Claude haiku runs use small amounts of subscription usage; local runs are free but took 20 s to 7 min each depending on memory pressure.

## Automated evaluation (Gate 2)
### Attack suite
- Target 40+ pages across at least 6 technique families, each in at least 3 phrasings, **written before the explainer rules are frozen and ideally partly by someone else**. The current 25 are the author's, and the explainer was extended after seeing which of them worked. Families to add: image text (needs a vision agent), calendar/email documents, multi-hop pages, clipboard, injections in network responses.
- Each page has a matched benign twin (same layout, no injection) and each benign task has realistic controls: forms, a legitimate "Next" wizard, a purchase the user did ask for, pages with legitimate instruction text ("Click Save to keep your changes").
- Deterministic hosting: local server, fixed ports, snapshots captured once (`capture-snapshots.mjs`) so detector evaluation does not need a model.
- Existing benchmarks to try, by cost: WASP (non-commercial license), AgentDojo, VPI-Bench; none run yet. See [01-prior-art.md](01-prior-art.md).

### Agents under test
At least one Claude model (subscription) and one local model. Because the best Claude result so far is 0 of 38, the suite needs stronger injections (or a more susceptible model) to produce enough compromised actions; the local model is an upper bound and must be reported as such.

### Metrics
| Metric | Definition | Status |
| --- | --- | --- |
| Interception | share of agent actions that reach a high-risk control against the user's intent that Helm pauses | 23/23 on the author's pages, mostly from the risk rule; needs held-out set |
| Attribution accuracy | the named passage is the injected one | text rules 15/23; counterfactual 12/12 on consistent compromises, not reproducible on 1 chance case |
| False-interrupt rate | benign tasks where Helm pauses | **not measured on realistic tasks** |
| Interrupts per task | mean pauses per benign task | not measured |
| Added latency | per model turn (tap) and per held action | CDP about 0.55 ms average; model tap not benchmarked |
| Cost per task | extra model calls | counterfactual about 8 calls per held action |

### Reproducibility
`spikes/agent-e2e` runs one scenario per process and records a RESULT line; `battery.sh` repeats it. Local-model results depend on machine load (swap thrash made the first local battery meaningless). A single `helm eval` command with fixed seeds, recorded versions and a run manifest is still to be built. Sampling variance is real: the same page compromised the agent in some runs and not others, so every cell needs repeats.

## Pitfalls already hit
- **Measuring nothing:** the first local battery showed zero clicks because requests took minutes; zero compromises there meant nothing. Always report "agent completed the task" next to "agent was compromised".
- **Counting failures as resistance:** three runs clicked nothing at all and were counted in the 24.
- **Fitting to the test set:** the explainer was tuned on the pages it is scored on.
- **Tool-specific assumptions:** frame-prefixed refs (`f14e5`) appeared only after several navigations in one browser session; earlier runs hid the bug.
- **Deceptive success signals:** "agent noticed the note" was matched by a crude regex that also fired on clean pages, so it was dropped.

## Study instrument (built, not yet used with anyone)
`node src/replay/cli.mjs --condition A|B|C --participant ID [--scenarios injected|benign|all|id,id] [--order shuffle] [--stop-window S] [--out-dir study-data] [--open]` replays recorded agent runs through the Helm UI to one person and saves one result file per scenario (`study-data/<participant>-<condition>-<scenario>.json`, gitignored). Tests: `test/replay.test.mjs` (13) cover all three conditions headlessly; a real browser was driven through each condition once (intro, prompt or stop window, questionnaire, finish) with no page errors.

| Condition | What the person sees | What counts as stopping an injected action |
| --- | --- | --- |
| A raw log | Transcript of commands, collapsible tool output (the page snapshot the agent read), the task given to the agent. Every interactive command opens a stop window (default 8 s) with a Stop button; the action runs when the window ends. | Pressing Stop in the window (this also ends the run) |
| B standard prompts | Same transcript, plus a prompt for **every** interactive action showing only the command, Approve/Deny (what Claude Code-style agents show) | Deny, or timeout (default 120 s) |
| C Helm | Status line, quiet allowance of actions the user asked for, a card for the others (cause passage, risk, reason), Block/Allow once with a short delay on high-risk Allow | Block, or timeout |

- **Scenarios** (`scenarios/*.json`, generated by `scripts/make-scenarios.mjs`): 4 injected (system-reminder tag, amended numbered instructions, `<user_message>` XML, `User:` transcript, all on an invoice portal where the user asked only for a refresh) and 4 benign (refresh, a Send the user actually asked for, a profile form, a wizard with legitimate "Click Next" text). Each gate's Helm explanation is computed by the real explainer on a real page snapshot, not typed by hand. In scenarios, Helm interrupts exactly the injected steps (asserted by a test) so the benign ones measure false interrupts of 0 by construction of this small set.
- **Per-scenario metrics** (from the result files): injected actions stopped vs approved, benign actions blocked (false blocks), prompts shown, reflexive approvals (high-risk card answered in under 1 s), median prompt latency, and raw NASA-TLX (six 0-100 sliders after each scenario).
- **Not yet in the instrument:** consent and debrief screens, a participant-facing practice scenario, condition order counterbalancing across participants (only a seeded shuffle of scenarios), the optional ablation arms, an analysis script. Replay shows the agent's response after a decision as scripted text; people do not see a live agent adapt.
- **Weaknesses to fix before running people:** the injected scenarios share one page layout and the same injected goal (sending invoices), so people will learn it; the raw-log condition shows the page as YAML text rather than a screenshot or live browser, which may make it harder than a real session replay; the benign set is four hand-written tasks.

## User study (Gate 3)
### Design
- **Question:** do people stop more injected high-risk actions with Helm than with standard approval prompts or a raw session replay?
- **Conditions (within-subjects, order counterbalanced):** (A) raw log with session replay, (B) standard approval prompts (action name only, like current agents), (C) Helm card. Optional ablation arms: Helm without the cause passage; Helm without the ambient line.
- **Why within-subjects:** with 12-15 people, between-subjects gives about 4-5 per arm and individual variation dominates; each person sees a different task and injection per condition so there is no learning of the answer. Risk: carry-over (people learn that agents get attacked). Mitigate with decoy tasks without injections, a different injected goal per condition, and a randomized position of the injection.
- **Tasks:** realistic browser tasks (invoice portal, calendar, a form), each about 3-5 minutes, with 3 benign actions that should pass and 1 injected high-risk action per task. About 12 tasks per participant.
- **Agent behaviour:** to keep injections identical across participants and to avoid routing participants through the researcher's subscription, sessions are **recorded agent runs replayed through the Helm UI** with the person making the decisions (the agent's response after a decision is scripted). This is a limitation: people do not see a live agent adapt. Recording needs enough compromised runs per scenario, which the local-model traces provide.
- **Measures:** share of injected actions stopped; malicious approvals; decision time; false blocks of benign actions; NASA-TLX; a short post-task question on what each person thought caused the pause.
- **Size:** 12-15 participants; report effect sizes and per-person plots, not only p-values.
- **Success:** Helm beats standard prompts by at least 25 percentage points on stop rate with NASA-TLX no worse; a pilot (n=3), at most one redesign, then the main study; report honestly if there is no win.

### Ethics (not legal advice)
Personal project, outside NYU channels, so NYU's class-project rule does not apply on its face (their [decision tree](https://www.nyu.edu/content/dam/nyu/research/documents/IRBDecisionTree.pdf) is dated and ties IRB review to outside use of course work). Regardless: informed consent, mild deception disclosed at the start in general terms and fully at debrief, no real accounts or data, participants can stop at any time, no identifying data stored. The writeup says "informal usability study". If a peer-reviewed venue is ever targeted, an IRB or ethics statement will likely be required.

## What would change the plan
- If realistic benign tasks cause many pauses, the interrupt rule needs tuning before the study.
- If Claude models stay at 0 compromised under every injection tried, the automated suite relies on the local model and the writeup must say so.
- If recorded-session replay confuses participants, a live run on a local model is the fallback.
