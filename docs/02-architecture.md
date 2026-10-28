# Architecture

Everything marked **measured** was observed in the spikes under `spikes/` (Claude Code 2.1.308, @playwright/cli 0.1.22, Chrome 156, 2026-10-26/27); everything marked **design** is not yet built. Evidence and caveats are in each spike's README.

## Shape
Helm sits underneath the agent. It does not wrap the agent's interface; it watches the two channels the agent cannot avoid.

```
 user ── Helm UI (local web page) ◄─────────────────────────────────────┐
                                                                         │ events, approvals
 ┌─────────┐   model API    ┌──────────────┐  tool_use   ┌─────────────┐ │
 │  Agent  │ ─────────────► │  MODEL TAP   │ ───────────►│  Core       │─┘
 │ (Claude │ ◄───────────── │ (HTTP proxy) │ ◄───────────│ policy      │
 │  Code…) │  held/allowed  └──────┬───────┘   verdict   │ explainer   │
 └────┬────┘                       │ upstream            │ decisions   │
      │ shell cmd                  ▼                     │ event store │
      ▼                      model provider              └──────▲──────┘
 playwright-cli                                                  │ browser events
      │ CDP (WebSocket)                                          │
      ▼                                                          │
 ┌──────────────┐        ┌────────┐                              │
 │  BROWSER TAP │ ─────► │ Chrome │                              │
 │ (CDP proxy)  │ ◄───── └────────┘                              │
 └──────┬───────┘                                                 │
        └─────────────────────────────────────────────────────────┘
```

## Components

### Model tap (HTTP proxy on the model API) — measured
- Agent sets only `ANTHROPIC_BASE_URL`. With no credential variable set, Claude Code keeps using its saved claude.ai login (Anthropic's gateway docs); the tap forwards `anthropic-beta` unchanged and never persists credential headers. A local model works the same way through Ollama's Anthropic-compatible `/v1/messages` (needs `Host` set to the upstream).
- Parses each streamed response into text and `tool_use` blocks, and each request into the user's prompts and the tool results (the untrusted content in context).
- **Pre-execution gate:** a `tool_use` block that the policy marks risky is withheld from the stream while the tap sends its own SSE `ping` events, until the user decides. Allow flushes the block; deny replaces it with a text block and rewrites `stop_reason` to `end_turn`.
  - Pings are required: without them Claude Code aborted the stalled stream and re-sent the request three times. With pings a 25 s hold ran cleanly; the stream was abandoned at about 602 s, so plan for roughly 10 minutes per attempt.
  - Decisions are remembered by a semantic key (action, target label, last tool-result id) so a client retry re-attaches instead of asking again. Raw-input keys failed (retries re-sample the model).
- Rewriting a denied call into a harmless `echo` was **rejected**: the agent believed it had fabricated the refusal and told the user nothing was declined.

### Browser tap (CDP WebSocket proxy) — measured
- `playwright-cli attach --cdp=<proxy>` and Playwright `connectOverCDP` work unchanged; the proxy rewrites `webSocketDebuggerUrl`.
- Logs commands; maps a click to the element under the pointer by evaluating `document.elementFromPoint(x, y)` on the same session (frames and shadow DOM not handled).
- Can hold a command, but only for as long as the client's own timeout (Playwright CLI: 5 s default). Returning CDP errors does not communicate with the agent: Playwright retries and reports a generic timeout. So the CDP tap is a **backstop and logger**, not the approval point.
- Overhead: about 0.55 ms average per call on localhost (not a p95).

### Correlation — measured (time-based)
Browser actions are assigned to the latest model turn whose request had started. Claude Code runs a tool while the response is still streaming (a click fired 452 ms before the stream ended), so "after the response ended" is wrong. Valid for sequential tool calls; parallel calls in one turn need the command text matched to the action (design).

### Policy and explainer — measured on small synthetic sets
- `policy.mjs` classifies a `tool_use` (read, navigate, interact, opaque) for `playwright-cli`, `agent-browser`, MCP-style browser tools, computer-use input, `curl` with a body and browser-driving scripts; refs (including frame-prefixed `f14e5`) resolve to element labels from snapshots already in the request.
- `explain.mjs` decides: did the user ask for it (label words in the user's prompts), which page passage pushed it (instruction-like text sharing the label's words, or posing as the user/system/AI), how risky (label verbs such as send/pay/delete, secret fields, opaque code), and whether to interrupt.
- Interrupt rule: allow quietly if the user named the control; otherwise interrupt when high-risk or influenced; "follow the page" does not excuse a high-risk action.

### Counterfactual confirmer — measured, with limits
Re-asks the model with each candidate passage removed, **and with the agent's own restatements of the target blanked** (agents launder injections through their own earlier messages). About 8 calls per check. Confirmed 12 of 12 consistent compromises; correct on 3 of 3 negative controls; reported "not reproducible" on the one chance compromise. Runs after the card is shown and annotates it; it never gates the prompt.

### Viewer — built (v0), `src/server.mjs` and `src/ui/`
Local web UI served by the Helm process, **vanilla JS with no build step** (the plan said React + TypeScript; see decisions). Shows the ambient status line, decision cards, a timeline and a receipt dialog, fed by a server-sent-event stream of the event log. Chosen over Tauri because the user study runs in a browser anyway. Screens in [04-oversight-ux.md](04-oversight-ux.md); a screenshot of a live held action is `docs/assets/ui-pending.png`.
- Page text is untrusted, so the UI only ever sets text with `textContent` (a test fails if `innerHTML` and similar appear in `app.js`).
- Decisions need a per-run token embedded in the page, a Host check (DNS-rebinding guard) and an Origin check; the server binds to 127.0.0.1.

### Storage — built (v0), `src/store.mjs`
Append-only JSON-lines event log per task (`.helm/`, gitignored) plus derived state for the status line and receipt. Events: `task.start/end`, `model.turn`, `model.error`, `navigate`, `action`, `gate.allowed`, `gate.pending`, `gate.decided` (with latency and a reflexive flag), `gate.confirmed`, `gate.repeat-blocked`. Credential headers and raw request bodies are never written; request bodies exist only in memory for the counterfactual re-run. The receipt lists what was done, held, blocked and allowed quietly, pages visited, and says what it does **not** track (network requests and the data they carry, downloads, clipboard). No SQLite yet.

### Launcher — built (v0), `src/cli.mjs`
`node src/cli.mjs run [options] -- <agent command>` starts Chrome (or attaches), both taps and the UI, sets `ANTHROPIC_BASE_URL`, `HELM_CDP_URL` and `PLAYWRIGHT_MCP_TIMEOUT_ACTION` for the agent, runs it, and prints a summary and the receipt link when it exits. `--ollama MODEL` routes model requests to a local Ollama; `--confirm` turns on the counterfactual re-run. Run live against qwen3-coder:30b on the `turn_tag` page: the injected Send click was held within about 20 s, the card showed the injected passage, the re-run labelled it "confirmed" (8 model calls), Block ended the turn with the Helm message, and the receipt recorded 1 held, 1 blocked, 1 browser action.

## Technology
- **Taps and core: Node (plain JS now; TypeScript for the build).** The spikes are dependency-light Node (`ws` only); streaming proxies, WebSockets and the UI share one language. The ML parts stay separate.
- **Probes/ML (optional, Gate 4): Python.** Transformers/PyTorch on MPS or MLX for Fara1.5-9B; unmeasured here.
- **Local models for testing: Ollama.** Gives an Anthropic-compatible endpoint, so the same Claude Code harness drives it. Needs an enlarged context via `ollama create` and a minimal prompt to be usable on this machine.

## Interface-agnostic claim: what is and is not shown
Shown: Claude Code (two models) driving Chrome through `playwright-cli`. Designed but unrun: `agent-browser`, MCP browser tools, plain Playwright scripts, computer-use agents. Anything that does not pass through the model tap as a recognizable tool call (an in-process agent library) is only visible at the CDP tap, where holds are limited by the client's timeout.

## Known gaps
- Holds longer than about 10 minutes per attempt rely on retry re-attachment, which I simulated by dropping a connection but did not run across a natural timeout.
- CSS-hidden content: the explainer only sees what the accessibility snapshot shows the agent. Images and screenshots (vision agents) are not parsed.
- Multi-tool turns, parallel tool calls and subagents are untested.
- Request bodies contain whatever the agent read; storing them is a privacy decision to revisit.
