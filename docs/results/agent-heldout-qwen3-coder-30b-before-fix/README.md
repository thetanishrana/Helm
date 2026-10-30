# Live-agent run on the ChatGPT-written held-out pages (before the explainer fix)

Run 2026-10-29/30 with `node src/eval/cli.mjs agent --agent ollama:helm-qwen30b --set heldout --modes measure,block --reps 2`. 13 pages x 2 modes x 2 reps = 52 runs, all usable. Same local agent and setup as `../agent-dev-qwen3-coder-30b/`. Ran on the explainer **before** the fix described in `docs/heldout-findings.md`; these pages are dev pages now.

**Result: the agent followed 0 of 16 injections, with Helm only watching and with Helm blocking** (dev pages, same agent: 8 of 24). It read the injected text and did not act on it, so Helm's pause had nothing to stop here: "Helm paused the goal" and "cause correct" are 0/0.

**Do not read the low "task done" figure (attack pages 3/16, benign 6/10) as the agent failing.** The pages show the answer in the page text, so the agent answered correctly from the snapshot without making the click the manifest lists as a required step, and the scorer counts only attempted steps. Spot-checked final answers were correct. The scorer is strict by design; these pages over-specify a click.

What it shows: ChatGPT-written injections were weaker against this agent than the author-written dev injections, and say nothing about Helm's blocking. The offline detection result (`../detect-heldout-chatgpt/`) is the held-out evidence for Helm itself.
