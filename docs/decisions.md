# Decision log

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-10-26 | Keep the core thesis (real vs apparent visibility). USP is the live, plain-language "this page caused it" explanation plus a user study. | User confirmed; activation-probe novelty is gone (see `00-brief-review.md` section 2). |
| 2026-10-26 | Activations are an optional detector (Gate 4), not the headline. | Probes for agent injection already published (2608.02657, 2606.22864). |
| 2026-10-26 | Closed-model agent is Claude Code + Playwright CLI on the existing subscription, through a custom passthrough proxy. | $0 cost. Pending spike 1 to confirm OAuth passthrough works. |
| 2026-10-26 | Model tap sets only `ANTHROPIC_BASE_URL`, never a credential variable, and forwards `anthropic-beta` verbatim and streams SSE unbuffered. | Anthropic's gateway docs: the subscription login stays active only in that configuration; stripping the beta header gives 401. |
| 2026-10-26 | The proxy never persists or logs credential headers, binds to localhost, and the tool tells each user to use their own login. | Anthropic's compliance page bars intermediating Claude.ai credentials; local passthrough is the closest permitted configuration. |
| 2026-10-26 | Study sessions use replayed recordings (or a local model), not participants driving live runs on the researcher's subscription. | That would look like routing requests through one plan on behalf of others. A paid API key would need user approval. |
| 2026-10-26 | Group model turns by `x-claude-code-session-id` and by parsing request bodies. Do not rely on `prompt-id` or `request-class` headers. | They are documented but were absent in `claude -p` mode (spike 1c). |
| 2026-10-26 | Correlate browser actions to model turns by time: owner is the latest turn whose request had started. | Claude Code runs tools while the response is still streaming (click fired 452 ms before stream end). |
| 2026-10-26 | Primary hold point is the model tap: withhold the gated `tool_use` block with keepalive SSE pings until the user decides. CDP-level hold (with `PLAYWRIGHT_MCP_TIMEOUT_ACTION` raised) is a backstop only. Never return CDP errors to hold. | Spike 1d: 25 s hold worked with the CLI's 5 s timeout untouched; without pings Claude Code aborts and retries; Playwright hides CDP error messages and retries internally. |
| 2026-10-26 | Write our own SSE-aware proxy instead of using LiteLLM. | Need to see and correlate raw requests; the proxy is small. |
| 2026-10-26 | Fara1.5-9B is the candidate local agent model. | Open weights, MIT, 63.4 on Online-Mind2Web. Speed and activations on M5 unverified. |
| 2026-10-26 | Viewer is a local web UI served by the proxy process, not Tauri. | The study runs in a browser anyway; avoids a build step. |
| 2026-10-26 | Cut the JEPA world model and Codex support from the MVP. | Crowded area / fragile auth path; neither is needed for the headline. |
| 2026-10-26 | Treat the study as an informal personal usability study; consent and debrief, no IRB for now. | Personal project outside NYU channels. Revisit if targeting a peer-reviewed venue. |
| 2026-10-26 | Success is defined by gates, not dates (`00-success-criteria.md`). | User has no deadline and wants all role signals. |
| 2026-10-26 | After a bad pilot: one redesign round, then report honestly. | User's stated preference. |
| 2026-10-26 | Remember gate decisions by a semantic key (action + target label + last tool_result id), not by raw tool input. | Retries re-sample the model; raw-input keys asked the user twice in 2 of 3 runs, semantic keys 0 of 3. |
| 2026-10-26 | Deny ends the turn with a Helm text message; do not rewrite the tool call into an `echo`. | Rewrite made the agent believe it had fabricated the refusal and tell the user nothing was declined. |
| 2026-10-26 | Plan for holds up to about 10 minutes per attempt; longer needs retry re-attachment, untested end to end. | Measured: Claude Code abandoned the stream at about 602 s despite pings. |
| 2026-10-27 | Interrupt budget rule: allow quietly if the user's words name the control; otherwise interrupt when the action is high risk or page text pushed it. "Follow the page" does not excuse a high-risk action. | Implements brief 3.3; measured quiet on asked-for and benign cases, interrupting on all high-risk injections in the synthetic set. |
| 2026-10-27 | Approval card names the suspected cause passage but does not claim causation until counterfactual attribution exists. | The cause is a text-match heuristic; wording must not overstate it. |
| 2026-10-27 | Use a local Ollama model (qwen3-coder:30b, minimal prompt) as the susceptible agent for building the attack-trace set; treat results as an upper bound for Claude. | Claude haiku followed 0 of 38 injections; the local model followed 1 of 24 (fake-turn style), giving the first real compromised trace. |
