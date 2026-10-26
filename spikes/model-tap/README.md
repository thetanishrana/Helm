# Spike 1a: model tap passthrough

`proxy.mjs` is a zero-dependency logging passthrough for the Anthropic Messages API. Credential headers are redacted before logging, and it binds to 127.0.0.1.

Run: `node proxy.mjs`, then in another shell start the agent with only `ANTHROPIC_BASE_URL=http://127.0.0.1:8787` set (no credential variables).

## Result (2026-10-26)
A clean-environment `claude -p` session using the saved subscription login completed through the proxy:
- `POST /v1/messages?beta=true` returned 200 as `text/event-stream`, relayed unbuffered (7 SSE events, 1 ping, first byte at 1.2 s).
- The `anthropic-beta` header, including `oauth-2025-04-20`, was forwarded unchanged.
- `x-claude-code-session-id` and `x-claude-code-request-class` were present on the request.
- No credential strings appear in the log.
- Claude Code also called `GET /api/hello` through the proxy, so the proxy sees non-inference traffic too.

Not yet tested: tool-use turns, long thinking pauses with only pings, request bodies for correlation, and how held CDP actions interact with agent timeouts.
