# Prior art and the gap

Checked 2026-10-26/27. Each row says what I actually read. "Abstract only" means I did not read the paper body, so I cannot vouch for details beyond the abstract. Corrections to the brief are in [00-brief-review.md](00-brief-review.md).

## Verdict
The gap is **narrower than the brief says but still open**. Activation probes for agent prompt injection are no longer novel, and counterfactual re-execution has been published. What I did **not** find, after a limited search, is a system that (a) joins what the page said, what the model read and what the browser did, (b) turns that join into a plain-language "this page caused it" explanation shown live to the person supervising, and (c) tests it against standard approval prompts with real people. "Did not find" is not "does not exist"; recheck before publishing any novelty claim.

## Landscape

### Agent observability (developer tools, after the fact)
| Tool | What it does | Source |
| --- | --- | --- |
| Laminar | Browser session replay synced with traces; integrations for Browser Use, Stagehand, Puppeteer, Playwright, Skyvern; input masking. Its docs do not mention injection detection or live human approval. | [docs](https://laminar.sh/docs/tracing/browser-agent-observability) |
| Notte, Browserbase, Anchor, AWS AgentCore Browser | Listed in the brief; **not checked** here. |  |

### Vendor guardrails inside AI browsers
| Product | What it does | Source |
| --- | --- | --- |
| Brave AI browsing | A second model, the "alignment checker", reviews the task model's output against the user prompt (it does not see raw page content). Brave says this reduces, not removes, the risk; one article notes page content can still attack the checker through the task model's output. New isolated browser profile for AI browsing. | [Brave](https://brave.com/blog/ai-browsing/), [Privacy Guides](https://www.privacyguides.org/news/2025/12/12/brave-adds-experimental-agentic-ai-browsing-feature/) |

### Detection research
| Work | Approach | Notes | Source |
| --- | --- | --- | --- |
| TaskTracker | Linear probes on activation deltas, single-turn RAG-style data | Phi-3, Mistral-7B, Llama-3 8B/70B; MIT code; activation downloads need a request form | [paper](https://arxiv.org/abs/2406.00799), [repo](https://github.com/microsoft/TaskTracker) |
| PIShield | Residual-stream features plus a linear classifier; white-box | Abstract only. Code: github.com/weizou52/PIShield | [paper](https://arxiv.org/abs/2510.14005) |
| Hidden-state exposure probes | Probes on agent hidden states, 8 models, AgentDojo, probe-gated defense | 0.90+ AUROC on unseen attacks; code public | [paper](https://arxiv.org/abs/2608.02657), [code](https://github.com/jianshuod/IPI-exposure-signal) |
| "When AUC 0.998 Is Not Enough" | Probes on a web computer-use agent (Qwen2.5-VL-7B, Mind2Web); warns high AUC can mean "injection surface present" | Single model and benchmark | [paper](https://arxiv.org/abs/2606.22864) |
| DriftNet | Transformer over logged tool-call trajectories (no activations); detects and localizes injection | <2M parameters; AgentDrift 12.5k trajectories; no code found, dataset public | [paper](https://arxiv.org/abs/2609.10892), [data](https://github.com/Asif-0209/AgentDrift) |
| AgentSentry | Counterfactual re-execution at tool-return boundaries to find takeover points, then context purification | AgentDojo; for automatic mitigation, not human explanation | [paper](https://arxiv.org/abs/2602.22724) |
| LlamaFirewall (PromptGuard 2, AlignmentCheck, CodeShield) | Jailbreak classifier, chain-of-thought goal-drift auditor, code analyzer | Abstract and secondary coverage only for the numbers | [paper](https://arxiv.org/abs/2505.03574) |
| CaMeL | Separates control flow and data flow so untrusted data cannot change the plan; capabilities on values | Reports completing 77% of AgentDojo tasks with provable security in the later version (67% in v1); secondary sources, check the paper | [paper](https://arxiv.org/abs/2503.18813), [code](https://github.com/google-research/camel-prompt-injection) |

### World-model guardrails (predict consequences before acting)
| Work | Target | Notes | Source |
| --- | --- | --- | --- |
| SeerGuard | Mobile GUI agents | Safety-augmented world model; abstract only | [paper](https://arxiv.org/abs/2607.15550) |
| DreamGuard | Tool-calling LLM agents | Latent world model, 25 ms per call; abstract only | [paper](https://arxiv.org/abs/2608.05695) |
| SafePred | Computer-using agents | Prunes risky actions; reports 97.6% safety performance; abstract only | [paper](https://arxiv.org/abs/2602.01725) |
| WebDreamer, World-Model-Augmented web agents | Web agents | **Not checked** |  |

### Benchmarks
| Name | Notes | Source |
| --- | --- | --- |
| AgentDojo | 97 tasks, 629 security test cases, multi-step tool use; figures from the abstract listing and a secondary summary | [NeurIPS 2024](https://proceedings.neurips.cc/paper_files/paper/2024/hash/97091a5177d8dc64b1da8bf3e1f6fb54-Abstract.html) |
| WASP | Web-agent injection benchmark, Meta FAIR; code is CC BY-NC-SA 4.0 (non-commercial) | [paper](https://www.arxiv.org/pdf/2504.18575) |
| VPI-Bench | Visual prompt injection for computer-use agents, 306 test cases (secondary summary) | [ICLR 2026](https://arxiv.org/pdf/2506.02456v2) |
| InjecAgent, WebArena, Mind2Web | **Not checked** here |  |

### Human oversight and warning UX
| Work | Finding | Source |
| --- | --- | --- |
| Anthropic, Claude Code auto mode | Users accept 93% of permission prompts; motivates auto mode | [post](https://anthropic.com/engineering/claude-code-auto-mode) |
| "Continue? Y/N" game | 409k decisions; players missed about 1 in 3 threats; scope violations (credential files) missed most | [summary](https://mer.vin/news/human-in-the-loop-approval-misses-ai-agent-threats/) |
| Comparing Human Oversight Strategies for Computer-Use Agents | 48 participants, 192 sessions; strategy changed exposure, not ability to intervene; users judged correctness, not safety | [paper](https://arxiv.org/abs/2604.04918) |
| Coding with "Enemy" (NeurIPS 2026) | 83 of 88 developers without a monitor missed sabotage; sabotage succeeded in 9 of 16 sessions with a correct alert | [paper](https://arxiv.org/abs/2606.05647) |
| Oversight Has a Capacity | Models reviewer fatigue (inverted-U); **simulated** reviewers; calls for a human study | [paper](https://arxiv.org/abs/2606.08919) |
| How Agents Ask for Permission | Survey of 21 user-level permission systems; no user study | [paper](https://arxiv.org/abs/2607.13718) |
| Alice in Warningland (USENIX Security 2013) | 25M warning impressions; users clicked through 70.2% of Chrome SSL warnings; extra clicks to bypass did not help | [paper](https://www.usenix.org/conference/usenixsecurity13/technical-sessions/presentation/akhawe) |
| Bravo-Lillo et al., attractors | Inhibitive attractors made informed decisions 2-3x more likely; only 14% noticed a changed dialog after habituation (secondary source) | [PDF](https://microsoft.com/en-us/research/wp-content/uploads/2016/02/a6_Bravo-Lillo.pdf) |

## Novelty claim (candidate wording)
> Helm joins page content, model context and browser action for any shell- or CDP-driven browser agent, and uses that join to tell the supervising person, in plain language and before the action runs, which passage on which page pushed the agent toward it, quietly allowing the actions the person asked for. We evaluate it against standard approval prompts and raw session replay in a controlled study.

An engineer can still point at AgentSentry (counterfactuals), Brave (alignment checker) and 2606.08919 (fatigue model). The answer is that none of those shows the cause to a human before the action, joins the three layers, or measures human catch rates. That answer holds only if the study is run; until then the claim is a design intent, not a result.
