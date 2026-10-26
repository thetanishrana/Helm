# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

Helm is in a **pre-research phase**. The repo contains only `research brief.md`; there is no code, build system, linter, or test suite yet, so there are no build/test commands to record. Update this file once code exists.

`research brief.md` is the source of truth. Read it before doing anything. Its sections are the project's contract:

- Section 0: how to work. Research, validate, and design only; no production code.
- Section 7: the deliverables, which are `docs/01-prior-art.md` through `docs/06-plan.md`, `docs/decisions.md`, and throwaway prototypes in `spikes/`.

Read `docs/00-brief-review.md` alongside the brief: it corrects several brief claims (e.g. the activation-probe gap is closed, "Coding with Enemy" is NeurIPS and its 56% was misstated). `docs/00-success-criteria.md` defines the gates, and `docs/decisions.md` is the decision log.

## What Helm is

An oversight layer for AI browser agents that gives users *real* visibility (not just logs or approval prompts) into what an agent does, what untrusted content influenced it, and why. The claim is to be proven with a user study.

Proposed architecture (a hypothesis to challenge, not a settled design):

- **Browser tap:** a proxy on the CDP WebSocket between the agent's driver (Playwright, agent CLIs) and Chrome. It handles semantic action extraction, egress tracking, and holding actions for approval.
- **Model tap:** a proxy on the LLM API (via base-URL override). It records which untrusted content entered the model context.
- **Correlation** links each model response to the browser commands it caused.
- **Detection levels:** (1) semantic actions, (2) provenance (coarse taint tracking, plus counterfactual re-querying for high-risk actions), (3) activation-delta probes (TaskTracker-style) on a local open-weight model only. Closed models get levels 1-2.
- **Viewer UI:** Tauri desktop app or local web UI (React/TypeScript); the brief asks for a recommendation.

## Rules from the brief that constrain your work

- Treat every claim, statistic, and source in the brief as unverified, including "the gap is still open". Report findings that kill or reshape the idea plainly.
- **Ask the user before** spending money, changing the core thesis (brief Section 2), or choosing between options that would reshape the project. Decide everything else yourself and log it in `docs/decisions.md` with a one-line reason.
- Hard design constraints: do **not** build it as an MCP server, do not fork Chromium, do not build a consumer browser, and stay interface-agnostic (sit underneath the agent).
- Budget is near zero. The user has Claude/ChatGPT subscriptions, not API credits. Estimate API cost before proposing anything that needs it.
- Hardware is a laptop M5 with 32 GB, so local models are ~8B class (compare MLX vs PyTorch MPS).
- Feasibility matters more than ambition. The user would rather finish something doable.
- Link every claim in `docs/01-prior-art.md`.
- The phase ends with a short summary covering the recommended approach, the novelty claim, the MVP scope, and decisions needed from the user.
