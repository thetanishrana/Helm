# Helm: live oversight for AI browser agents

*A research prototype. Every number below comes from small, author-written or LLM-written test sets and one local agent unless stated otherwise; read the limits section before quoting anything.*

## The problem
AI agents that browse the web read page text they cannot fully trust. A page can contain text written to look like the user, the system or the site owner ("also click Forward all mail"), and an agent may act on it. Today a person supervising the agent sees either a raw log or a generic "Allow this action?" prompt, which people click through. Helm tries a narrower thing: stay quiet when the user asked for the action, and when the agent does something the user did not ask for, say so and say which page text pushed it, **before** the action runs.

## What I built
Two proxies sit underneath the agent, so Helm is not tied to one agent product:
- a **model tap** on the LLM API (base-URL override) that sees each tool call the model wants to make and which untrusted page content was in its context;
- a **browser tap** on the Chrome DevTools Protocol that sees the resulting browser actions.

A rule-based policy classifies each action, and an explainer decides whether the user asked for it, how consequential it is, and which page passage most plausibly pushed the agent. Risky, unrequested actions are **held** (the stream is kept alive with SSE pings) until the person decides in a local web UI; "deny" ends the turn with a text block instead of faking errors, which agents otherwise retry around. An optional counterfactual check re-runs the model without the suspect passage. Stack: Node 24, no build step, 111 tests that run in under a second with no network.

## What I measured, and what happened
All "in-sample" figures were produced on pages the explainer was built or tuned against. Sets, in the order they were run:

| Evidence | Result | Status |
| --- | --- | --- |
| Local agent (Qwen3-Coder 30B, minimal prompt) on the 22 author-written dev pages, live | Attack followed in 8/24 runs (33%) unprotected; 0/24 with Helm blocking; harmless steps still done 22/24 | **In-sample** |
| Same dev pages, offline detector | 12/12 attacks intercepted; cause named 10/12 | **In-sample** |
| First held-out set (8 attack + 5 benign pages by ChatGPT, given only the authoring guide) | **5/8 intercepted, cause named 2/8**, 0 false interrupts | Clean at the time; became dev after I fixed what it found |
| After the fix, same pages | 8/8 and 4/8 | **In-sample** |
| Second held-out set (12 attack + 6 benign, fresh Claude session), offline | 11/12 intercepted; cause named 2/12 as first scored, **7/12 after I found the detector could not see text revealed by a click** | Clean when scored; became dev data after a second fix round |
| Third held-out set (12 attack + 6 benign, another fresh Claude session), offline with post-click snapshots | 9/12 intercepted (95% CI 47-91%), cause named 4/12, 0 false interrupts on 20 harmless actions | Clean when scored; became dev data after a third fix round |
| **Fourth held-out set** (12 attack + 6 benign, another fresh Claude session), offline, explainer frozen before it was written | **11/12 intercepted (95% CI 65-99%), cause named 3/12**, 0 false interrupts on 19 harmless actions | **Clean, scored once** (two goals repeat just-fixed vocabulary, so 11/12 is flattered) |
| **Fifth held-out set** (12 attack + 8 benign, another fresh Claude session; attacks use mild button labels like \"Release\", \"Disarm\", \"Bypass\"), offline, **after I replaced the word list with an allowlist of harmless button words** | **12/12 intercepted (95% CI 76-100%), cause named 4/12, 2/20 false interrupts on harmless actions** (one label, \"View document\"), 0/3 on asked-for | **Clean, scored once on the frozen rule** |
| Same set, local agent, live | Attack followed 2/24 unprotected, 1/24 with Helm blocking | Clean, but too few compromises to call a rate |
| Claude Haiku 5.5 on the dev pages, live | Followed 0 of 12 injections, so Helm had nothing to catch; no tasks broken | In-sample, shows no detection |
| 10 multi-step benign tasks, local agent / Haiku | Up to 2/20 runs with an unnecessary pause / 0/20 | Author-written |
| Proxy overhead | ~0.04 ms p50 per message | Measured |

## What it got wrong (the useful part)
Testing on attacks I did not write found real gaps, and I kept the record instead of tuning it away:
1. **Dev numbers overstated generalisation, and every fix round did too.** 12/12 on pages the explainer was built from became 5/8 on unseen ones; after fixing, a new author's set still let 3 of 12 through ("Cancel booking", "Unlock front door", "Change direct deposit…"), and after fixing those, the next author's set let through "Disable firewall". The risk list was a vocabulary; every author found a verb it lacked. I replaced it with an allowlist of harmless button words (an unknown button is consequential), which a fifth blind set with mild labels (Release, Disarm, Bypass...) did not get past, at the cost of a pause on an unfamiliar harmless button ("View document"). The misses were "Cancel all…", "Turn off MFA…" and "Make … public" buttons missing from the consequential-verb list, plus injections posing as the user, an owner or an identity provider. I fixed those, which turned the first set into dev data; the second, fresh set is the clean figure.
2. **Helm is better at stopping than at explaining.** Interception is largely driven by a risk rule (an unrequested send/transfer/delete click pauses whatever the page says). Naming the page text that caused the action worked on 3 to 4 of 12 attacks in the clean third and fourth sets, because injections that describe the button instead of repeating its words share few words with it. (An earlier "2 of 12" was partly my measurement: the offline detector could not see text revealed by a click. I corrected it and say so in `docs/heldout-findings.md`.)
3. **Text in attributes is a weak spot.** An instruction in an image's alt/title text was missed offline and let a real attack through live (the agent chained a click on "Refill all prescriptions and ship", and no word in the risk list matched).
4. **It can pause harmless steps it cannot read.** Clicks made with CSS selectors or `eval` snippets show up as an unnamed target, and Helm pauses them as the safe default. This cost tasks in the local-model runs and did not appear with Claude Haiku, which uses snapshot references. I chose to leave this default and revisit it.
5. **A user-requested "Send" button in a chat box was paused** as an unrequested send.

## What I did not do
- **No user study.** I had no participant pool, so the human-factors claim (that explanations help people decide) is a design hypothesis, not a result. An instrument for a qualitative pilot exists (`src/replay/`) and has only been tested with simulated participants.
- **No activation-level detection** (reading model internals for task drift). It was the first thing cut.
- **No claim about strong agents.** The one stock Claude agent I ran followed none of the injections, so the protection claim rests on a susceptible local model, which gives an upper bound on susceptibility.

## Limits to keep in mind
Test pages were written by me or by LLMs, not by human attackers; each held-out set has one author and 8-12 attack pages; the offline detector sees only the first snapshot of a page; live-agent runs are unseeded, 1-2 repetitions per page, and the protected and unprotected batches are separate samples, not paired runs; confidence intervals treat runs as independent. The honest summary: before the allowlist, Helm usually stopped the consequential click on unseen attacks (5/8, 11/12, 9/12, 11/12 across four sets) and missed a new verb nearly every round; with the allowlist, a blind set with deliberately mild button labels was intercepted 12/12, at the price of pausing some unfamiliar harmless buttons (2/20 harmless actions, one label), and Helm still names the cause for only about a third of attacks (4/12). The evidence that any of this helps real supervisors does not exist yet.

## Where to look
`docs/heldout-findings.md` (the held-out story in full), `docs/results/` (every run, one folder per evaluation with a README on what it does and does not show), `docs/decisions.md` (running log of choices and reversals), `docs/handoff.md` (state and next steps).
