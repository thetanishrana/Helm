# Plan and open work

Progress is measured in gates ([00-success-criteria.md](00-success-criteria.md)). This page was rewritten on 2026-11-18; the earlier version was a pre-build plan with effort estimates and is no longer accurate.

| Gate | State |
| --- | --- |
| 1 Working product | Done: both taps, policy, explainer, hold-for-decision, web UI, receipt, selector lookup, model judge, multi-agent supervision. 144 tests, 33 interface checks. |
| 2 Measured detection | Done with limits: [heldout-findings.md](heldout-findings.md), [writeup.md](writeup.md). |
| 3 Human evidence | Not done. No participant pool; the replay instrument is built and untested with real people. |
| 4 Activations | Not started; first on the cut list. |
| 5 Shareable package | Done: README, write-up, screenshots, demo script, clip recorders. |

## Open work, most valuable first
1. A fresh blind batch of false-pause-prone pages to test the judge's "different action" rule (prompt: `eval-pages/CHATGPT-PROMPT.md`).
2. Reduce false pauses without a vocabulary list: harmless "View ..." controls, words like "refill" in a link label; resolve `eval` snippet targets.
3. Multi-agent extras: a per-site view, cross-agent provenance hints, several agents in one shared browser ([multi-agent-design.md](multi-agent-design.md)).
4. A real usability pilot with the replay instrument (needs the researcher's own contact line and consent review).

## Costs
$0 recurring: local models, locally hosted attack pages, and a Claude subscription login for the opt-out model judge and any Claude evaluation runs (each such run needs the maintainer's approval). A paid API key is not needed. Any paid participant platform would need explicit approval.

## Risks that still matter
| Risk | Mitigation |
| --- | --- |
| Heuristics overfit to the authors' pages | Blind sets by other authors; freeze rules before scoring; report dev (in-sample) and clean figures separately |
| The judge attaches a plausible cause to a harmless false pause | Prompt rule ("a different action does not count"); still only tested in-sample |
| The judge sends page text and the request to Claude | Notice at start, `--no-judge`; never used for study participants |
| Anthropic terms for subscription traffic through a proxy | Proxy never stores credentials, localhost only, each user uses their own login; ask Anthropic if in doubt |
| Agent products change their internals (headers, tool formats, streaming) | Tolerant parsers; integration tests with a stub upstream |
| No human evidence | State it plainly; the thesis is a design hypothesis |

## Cut list (first to go)
1. Activation detector (Gate 4). 2. Extra agents/CLIs beyond Claude Code + `playwright-cli` and one local model. 3. Vision-based injection handling.
