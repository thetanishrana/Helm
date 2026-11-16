# Several agents, several sites: how it fits the interface (design, not built)

Status: **built 2026-11-16** (items 1-5 and 7 below; the Sites view, cross-agent taint and a shared-Chrome mode are not built). Written first as a proposal; this section records what exists.

## What was built, and what it does not do
- `node src/cli.mjs fleet <fleet.json>` (`src/fleet.mjs`): one process, one shared store, approvals and UI; each agent gets its own model tap (8787+i), browser tap (9333+i) and Chrome (9222+i). `demo/run-fleet.mjs` is a two-agent example (needs Ollama).
- Every event an agent causes carries `agent`; `Store` derives status, pending decisions and receipts per agent and in total; `Approvals` remembers declines per agent. A run with no registered agents behaves exactly as before (all earlier tests and UI checks pass unchanged).
- Interface (shown only when more than one agent is registered): a fleet strip with a chip per agent and its state; one decision queue across agents, each card naming its agent and that agent's request; one course lane per agent (click a chip to show just that lane); a receipt section per agent.
- Tested: 6 store/approvals/fleet tests, 10 UI checks on a scripted three-agent preview (`npm run ui:preview -- fleet`), and two live runs of two local-model agents. Run 1: both agents ran, one decision held and blocked, per-agent state correct. Run 2: the local model wandered and never reached the browser step within five minutes, so it shows nothing about detection. Two agents on one local model are slow; this was not measured further.
- **Agents must use separate browser sessions.** Two `playwright-cli` agents on the default session drove one shared browser in run 1, so their actions were credited to the wrong lane. Helm sees the Chrome each agent was given; it cannot tell agents apart inside one browser session. The fleet demo gives each agent `-s=<session>`.
- Not built: the Sites view (item 6), cross-agent taint (item 8), several agents in one shared Chrome, attaching an already-running agent to a running hub, and any test with a person.

Original proposal follows.

## What breaks with more than one agent
- `Store` derives status, pending decisions and the receipt from "events since the last `task.start`": one task.
- `Approvals` remembers declined actions by action text only, so two agents trying the same click would share a decline.
- `startServer` serves one store; `cli.mjs` starts one Chrome, one model tap (8787), one browser tap (9333) and one UI (7777), so a second run collides on every port.
- The UI has one decision column and one course.

## Proposed shape
1. **Hub.** One long-lived Helm process owns the store, approvals and UI. Each agent registers and gets its own model-tap and browser-tap ports (and optionally its own Chrome). `helm run` becomes "register an agent with the hub, then run it".
2. **Agent ID on every event** (`agent`, plus a name and colour assigned at registration). Derived state (status, pending, receipt) is computed per agent and in total. Decline memory is keyed by agent and action.
3. **Fleet strip** at the top: one chip per agent (colour, name, state); a red mark on any chip with a decision waiting; click to focus.
4. **One global decision queue**, most urgent first. Each card carries its agent's chip and that agent's "You asked" line, so a card is never ambiguous about whose request it is.
5. **Course lanes**: one lane per agent on a shared time axis; a held action branches off in red inside its own lane; lanes collapse to one line.
6. **Sites and tools**: each step carries an origin badge. A "Sites" view groups by origin: which agents touched it and which untrusted text came from it.
7. **Parallel tool calls** inside one agent are shown as stacked nodes on the same time slice; two held at once are two cards labelled as the same step.
8. **Cross-agent taint** (agent A read flagged text, agent B acts on related output) is a research idea, not a promise. A first version is only a hint: "this site was already flagged for another agent".

## Order, if built
Event model and hub first (tests green with one agent), then the UI (fleet strip, queue, lanes), then the Sites view. Each step must keep the single-agent path working and `npm run ui:check` passing.

## Open questions
- One Chrome shared by all agents, or one per agent? Shared makes site-level views easy but lets agents interfere with each other's tabs.
- Which agents beyond Claude Code driving Playwright need to be supported for this to matter? Only that one is tested.
