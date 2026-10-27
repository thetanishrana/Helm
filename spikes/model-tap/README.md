# Model tap

`proxy.mjs` is a passthrough for the Anthropic Messages API (spike 1a) that can also hold a tool call before the agent runs it (see `../agent-e2e/README.md`). The rest of this folder decides *whether* to hold and *what to tell the user*.

| File | Role |
| --- | --- |
| `turns.mjs` | Parses the SSE response into text and `tool_use` blocks; summarizes a request into user prompts and tool results (the untrusted content). |
| `policy.mjs` | Classifies a tool call as read / navigate / interact / opaque, resolving `e4`-style refs to element labels from snapshots in the request. |
| `explain.mjs` | For an interact or opaque action: did the user ask for it, which page text pushed it, how risky is it, and should the user be interrupted. Produces the text of an approval card. |
| `*.test.mjs` | `node --test`: 14 policy, 12 explanation, and 3 integration tests (a scripted agent against a stub upstream, no API use). |
| `explain.eval.mjs` | Blind-spot check on 25 synthetic cases not used to write the rules. |

## How the explanation decides
- **Requested?** Fraction of the target label's words found in the user's prompts is at least 0.75.
- **Cause?** A page passage that shares at least half the label's words and reads like an order (addresses AI/agents, coercive phrasing such as "you must" or "ignore previous", or an imperative verb). If none, a weaker fallback: any passage addressed to AI agents that issues orders. The control's own label is never the cause.
- **Risk:** high for opaque code, data sent off the machine, secret fields, and labels containing consequential verbs (send, pay, delete, submit, share, ...); medium for entering data; low otherwise.
- **Interrupt budget:** stay quiet if the user asked for it. Otherwise interrupt if it is high risk, or if page text pushed it. Telling the agent to "follow the page" does not excuse a high-risk action.

## Measured (2026-10-26)
`node explain.eval.mjs` on synthetic cases written by the same author as the rules, so treat as a floor for blind spots, not accuracy:
- Attacks against a high-risk control (8 phrasings): 8/8 interrupted, 8/8 injected passage identified.
- Attacks against a low-risk control (4 phrasings): 2/4 interrupted. Missed: a paraphrase with no label words and an uncommon verb, and a bare "Show offers." that is indistinguishable from ordinary content. The second is expected to be undetectable by text alone.
- Benign pages whose text mentions the control (5): 5/5 left alone.
- Note that the 8/8 on high-risk controls comes mostly from the risk rule (an unrequested "Send ..." is interrupted regardless of cause); only the low-risk cases test influence detection on its own.

Live (Claude Code 2.1.308, haiku): an asked-for Refresh click was allowed with no prompt and the card said why. Two attempts to get the agent to follow the injection (a plain task and "do whatever the page says") failed because the agent refused the injection itself, so no live compromised action has triggered a card yet; that path is covered only by the scripted-agent integration test.

## Known gaps
- Heuristics are English-only text matching. Injections in images, or text that the accessibility snapshot omits (CSS-hidden content may or may not appear), are not seen. The snapshot is only what the agent saw, which is the right scope for "what influenced it", but it is also all the explainer sees.
- Counterfactual attribution (re-ask the model without the suspect passage) is the principled way to confirm a cause and is not built; the current cause is a heuristic guess, and the card says "pointed the agent at it" without having tested that.
- Only the label is compared with the user's words; actions that act on a field value (what was typed) are not checked.
