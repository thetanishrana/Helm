# Brief review: verified findings and corrections

Reviewed 2026-10-26 against the original project brief (a working document, not included in this repository). Only sources actually opened are marked **verified**; everything else is marked as such. Success gates are in [00-success-criteria.md](00-success-criteria.md).

## 1. Source checks

| Claim in brief | Result |
| --- | --- |
| Users approve 93% of Claude Code prompts | **Verified** in Anthropic's own post ([Mar 25, 2026](https://anthropic.com/engineering/claude-code-auto-mode)): "in practice users accept 93% of them anyway." Later coverage cites 97% (not verified). [The Register](https://www.theregister.com/a/5285326) (Aug 10, 2026) **confirms** the 1,053-paid-tester study: testers caught a deliberately inserted dangerous command 13.6% of the time and auto mode blocked 89% of the same commands. It attributes the study to Anthropic but gives no date or setup details, and it is secondary coverage, so find the primary report before quoting it in the writeup. |
| 40,000-run approval game | **Verified**, "Continue? Y/N" by Alex Wauters. Primary source: [scalex.dev](https://scalex.dev/blog/ai-agent-permissions-stats/) (read via a secondary summary at [mer.vin](https://mer.vin/news/human-in-the-loop-approval-misses-ai-agent-threats/)). 66.3% mean accuracy, about 34% of commands were threats, scope violations (e.g. reading `~/.aws/credentials`) had the highest miss rate at 35.0%. |
| "Coding with 'Enemy'" is ICML 2026 | **Wrong venue.** It is [NeurIPS 2026](https://arxiv.org/abs/2606.05647). 94% = 83 of 88 developers in no-monitor conditions. |
| "When a monitor flagged it, 56% still accepted it" | **Misstated.** The paper says sabotage still *succeeded in 9 of 16 sessions* where the monitor issued a correct alert. Do not repeat the brief's wording. |
| 48-participant oversight study | **Verified**: [2604.04918](https://arxiv.org/abs/2604.04918), 48 participants, 192 live sessions. Strategy changed exposure to problematic actions, not ability to intervene. Users judged whether an action was *correct*, not *safe*. Upfront approval reduced runtime scrutiny. |
| BioShocking compromised six AI browsers | **Verified**: LayerX, disclosed 2026-06-24, summarized in a [CSA note](https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-browser-prompt-injection-20260630-csa-s/). No model flaw needed. |
| Black Hat 2026, Brave engineer, "every browser analyzed was vulnerable" | **Partly verified.** The [Dark Reading page](https://www.darkreading.com/application-security/no-perfect-fix-ai-browser-prompt-injection-flaws) returns 403 both times. The [Aviatrix summary](https://aviatrix.ai/threat-research-center/no-perfect-fix-ai-browser-prompt-injection-flaws-2026/) (Aug 6, 2026) confirms Artem Chaikin presented at Black Hat USA 2026 on Opera's AI browser, Comet, and Atlas as susceptible. It does **not** state his employer, say the browsers were demoed, or claim every browser is vulnerable. **Resolved on a second pass:** Brave's [author page](https://brave.com/author/artem-chaikin/) lists Chaikin as a Security Engineer (it doesn't name the employer outright or mention Black Hat), and search results from Dark Reading describe him as "Brave security engineer" who found "every browser he analyzed" vulnerable, with live demos on Opera, Comet, and Atlas (hidden HTML, near-invisible text over images, Reddit spoiler tags). So the brief's wording is supported, but only through Dark Reading, which I could not open. Phrase it in the writeup as "Dark Reading reported that…". No primary Black Hat abstract or Brave post for the 2026 talk was found; Brave's closest post is [Jun 8, 2026](https://brave.com/blog/indirect-prompt-injection/). Do not use the "Brave analyzed every popular AI browser" paraphrase from secondary blogs. |
| DriftNet works on behavioral trajectories | **Verified**: [2609.10892](https://arxiv.org/abs/2609.10892), under 2M parameters, no activations. AgentDrift: 12,536 trajectories. No DriftNet code link; the [AgentDrift dataset](https://github.com/Asif-0209/AgentDrift) is public. |
| TaskTracker | **Verified**: [abstract](https://arxiv.org/abs/2406.00799) and [repo](https://github.com/microsoft/TaskTracker) (MIT). Supports Phi-3, Mistral-7B, Llama-3 8B/70B. Data is single-turn, RAG-style. Activation downloads require a request form. |
| PIShield, SeerGuard, DreamGuard, SafePred, WebDreamer, Laminar, Notte, others | **Not checked.** Verify in `docs/01-prior-art.md`. |

## 2. The activation-probe gap has closed

Activation probes for agent prompt injection are now published, so they cannot be Helm's headline novelty.

- [2608.02657](https://arxiv.org/abs/2608.02657) (Aug 2026): linear probes on hidden states across eight models, 0.90+ AUROC on unseen attacks, AgentDojo, plus a probe-gated defense. Code: [IPI-exposure-signal](https://github.com/jianshuod/IPI-exposure-signal).
- [2606.22864](https://arxiv.org/abs/2606.22864) (Jun 2026): hidden-state probes on a web computer-use agent (Qwen2.5-VL-7B, Mind2Web). Warns that AUC 0.998 may reflect "an injection surface is present," not "an attack is happening." An [ICML 2026 paper](https://icml.cc/virtual/2026/77934) makes a similar point.
- [2604.28129](https://arxiv.org/abs/2604.28129) (Apr 2026, single author): multi-turn activation-path-length features, 76.2% to 93.8% detection on synthetic data. Conversation setting, not a browser agent. No code stated. Probes are model-specific.
- [2606.04141](https://arxiv.org/abs/2606.04141) (Jun 2026): activation probes plus honeytokens and cumulative leakage accounting for credential exfiltration. Small synthetic multi-turn suite, authors call it preliminary, no code stated. Relevant to Helm's egress tracking.
- Counterfactual re-execution also has prior art: [AgentSentry](https://arxiv.org/abs/2602.22724) (AgentDojo). Helm differs by using it to *explain to a human*, not to purify context.

**Consequence:** activations become an optional, pluggable detector that reuses the 2608.02657 code and the 2606.22864 controls.

## 3. The oversight-UX gap still looks open

- [2606.08919](https://arxiv.org/abs/2606.08919): models reviewer fatigue as an inverted-U (more escalation can reduce safety), using *simulated* reviewers, and calls for a human study. Code: [headroom](https://github.com/turangenesis/headroom).
- [2607.13718](https://arxiv.org/abs/2607.13718): survey of 21 agent permission systems, no user study.
- I did not find a participant study of a provenance-explaining, fatigue-aware oversight UI for browser agents. This was a limited search, so the claim is "not found," not "does not exist." Re-check before publishing any novelty claim.

## 4. Model tap with a subscription

- **Verified in Anthropic's docs** ([gateway overview](https://code.claude.com/docs/en/llm-gateway), [compatibility guide](https://code.claude.com/docs/en/llm-gateway-protocol.md)): setting only `ANTHROPIC_BASE_URL`, with no gateway credential variable, keeps the saved claude.ai login as the active credential, so subscription limits and billing still apply. The proxy must forward `anthropic-beta` verbatim, because it carries the OAuth capability and stripping it gives `401`. Setting a gateway credential variable or `apiKeyHelper` replaces the subscription with per-token billing, so don't.
- Also from the guide: forward `anthropic-version`, `anthropic-*` headers and body fields unchanged; never buffer the SSE stream (Claude Code stalls, and an idle timeout fires if `ping` events are stripped); return `text/event-stream`; forward `anthropic-ratelimit-unified-*` and `x-should-retry` unchanged.
- **Useful for correlation:** every request carries `x-claude-code-session-id`, `x-claude-code-prompt-id` (groups all requests serving one user prompt, v2.1.283+), and `x-claude-code-request-class` (`main`, `subagent`, `auxiliary`, ...). The model tap can use these to group turns and ignore side requests.
- Third-party confirmation of the same pattern: [LiteLLM](https://docs.litellm.ai/docs/tutorials/claude_code_max_subscription), [Databricks](https://docs.databricks.com/aws/en/ai-gateway/claude-max-anthropic-enterprise-support), [Gravitee](https://documentation.gravitee.io/agent-management/build/llm-proxies/third-party-ai-tools/connect-claude-code-through-an-llm-proxy).
- **Still unverified:** an actual end-to-end run on this machine (Claude Code 2.1.308 is installed). Spike 1 does that.

### Terms-of-use risk (checked against Anthropic's [Legal and compliance page](https://code.claude.com/docs/en/legal-and-compliance))
- The page says OAuth is "intended exclusively for purchasers of … subscription plans" for "ordinary use of Claude Code." Developers building products "may not collect, store, or intermediate Claude.ai credentials or session tokens," and may not "route requests through Free, Pro, or Max plan credentials on behalf of their users." It explicitly does not prevent an end user from signing in to the **unmodified** Claude Code binary with their own subscription.
- Reading for Helm (my interpretation, not a legal opinion; the page does not mention local proxies at all): a user running unmodified Claude Code on their own subscription through their own local proxy is the closest to the permitted case. The risky parts are (1) a proxy that logs, stores or forwards the bearer token, and (2) **study participants using the researcher's subscription**, which looks like routing requests through one person's plan on behalf of others. Third-party coverage ([The Register, Feb 2026](https://www.theregister.com/software/2026/02/20/anthropic-clarifies-ban-on-third-party-tool-access-to-claude/5014546)) reports enforcement against third-party tools that used subscription tokens, and does not address this case; one blog says the wording changed again later (unverified).
- Mitigations to adopt now: the proxy never logs or persists `Authorization`/`x-api-key` (redact in memory and on disk); it binds to localhost only; the shipped tool tells each user to run their own Claude Code login; the user study uses **recorded sessions replayed through the Helm UI**, or a local model, or an API key you pay for with prior approval, never participants driving live agent runs on your subscription. If you want certainty, ask Anthropic through their [contact form](https://www.anthropic.com/contact-sales) before the study.
- Codex with ChatGPT login via a custom provider with `requires_openai_auth = true` is described in [Coder's docs](https://coder.com/docs/ai-coder/ai-bridge/clients/codex). More fragile; deferred.

## 5. Local agent model

[Fara1.5-9B](https://huggingface.co/microsoft/Fara1.5-9B): MIT, Qwen3.5-9B base, vision-only, coordinate actions, Online-Mind2Web 63.4. Community MLX 8-bit and GGUF builds exist. It must be used with its own harness (Fara CLI or MagenticLite), which affects how it plugs into Helm. Unverified: speed and activation extraction on the M5, and whether [nnsight](https://nnsight.net/) works on MPS (its page says only "any PyTorch model").

## 6. Ethics

Personal project, not coursework. NYU's [decision tree](https://www.nyu.edu/content/dam/nyu/research/documents/IRB/IRBDecisionTree.pdf) covers class projects and results used outside a course; a personal study run without NYU channels or affiliation appears to fall outside it. This is a reading of the policy, not legal advice, and the document is dated. Regardless: informed consent, a debrief after the injections, no sensitive personal data, and the writeup says "informal usability study, n=…". Revisit if a peer-reviewed venue is ever targeted.

## 7. Recommended USP

> Helm tells the person supervising a browser agent, live and in plain words, "you didn't ask for this; this page did," and stays quiet otherwise. A user study shows it works.

- **Engineering moat:** a cross-layer join of page content → model context → browser action. Observability tools see one layer after the fact; detectors output a score without a human-facing explanation.
- **Agent-agnostic and free:** sits under the agent, works with Claude Code + Playwright CLI on a subscription.
- **Evidence:** others modeled fatigue or measured failure; Helm measures a fix.
- **Activations:** a pluggable detector for local models, not the headline.
