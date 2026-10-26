# Spike 1b: CDP proxy with Playwright

`proxy.mjs` is a WebSocket proxy between a CDP client and Chrome. It logs every command, maps a click to the DOM element under the pointer, and can hold a click. `test.mjs` launches headless Chrome on :9222, the proxy on :9333, and drives it with `playwright-core` `connectOverCDP`.

Run: `npm install && HOLD_MS=3000 node test.mjs`

## Result (2026-10-26, Chrome 156, playwright-core 1.56.1)
- `connectOverCDP('http://127.0.0.1:9333')` worked unchanged. The proxy rewrites `webSocketDebuggerUrl` in `/json/version`, and Playwright's single flattened-session WebSocket needs nothing more.
- A click was held for 3 s at `Input.dispatchMouseEvent` `mousePressed`. The click then completed (page title changed to "sent") with no Playwright error. Total click time was 3.26 s.
- Semantic mapping works: the held click was resolved to `{tag: BUTTON, id: "send", text: "Send invoices"}` by an injected `Runtime.evaluate` of `document.elementFromPoint(x, y)` on the same session. The proxy answers its own lookup with reserved ids so the client never sees it.
- Overhead: 0.55 ms average per `page.evaluate` round trip through the proxy (20 calls, localhost, not a p95).
- Commands for one click-and-evaluate script: 4 `Input.dispatchMouseEvent`, 30 `Runtime.callFunctionOn`. Plenty of noise; gating needs an allowlist of side-effecting methods.

## Caveats
- Only a 3 s hold was tested, under Playwright's default 30 s action timeout. Longer holds, and how agent CLIs (Playwright CLI, agent-browser, browser-use) time out, are untested.
- Holding blocks the whole connection queue by design. Whether blocking all commands or only the gated one is better is an open design question.
- `elementFromPoint` ignores iframes and shadow DOM; production needs frame-aware resolution (`DOM.getNodeForLocation` or per-frame sessions).
- Mouse movement before the press has already happened when the hold starts, so hover effects fire first.
- Only a headless data-page was used; no real site, no keyboard (`Input.insertText`/`dispatchKeyEvent`) and no navigation gating yet.
