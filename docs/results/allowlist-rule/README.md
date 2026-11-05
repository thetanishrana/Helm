# Allowlist rule: replace the verb denylist for buttons (2026-11-05)

**Idea.** The risk rule called an unrequested click consequential only if its label contained a word on a list (delete, transfer, unlock, ...). Every new author found a word the list lacked. The rule is now inverted for buttons and menu items: an unrequested button is consequential unless **every word** of its label is a known harmless UI word (refresh, next, search, show, history, close, edit, reply, save, sort by date, ...). Links, tabs and fields keep their old treatment. It follows the earlier read-only-JavaScript decision: allowlist, not denylist.

Two guards keep it from over-pausing: (1) for buttons that are high only because they are not on the allowlist (not because their words say so), sharing half their words with the user's request counts as asked, unless page text names most of their words, in which case it does not; (2) the old denylist words still need nearly all their words in the request.

## Offline, all five sets (files `optA5-*.md`)
| Set | Intercepted (was) | Cause named | False interrupts (harmless / asked) |
| --- | --- | --- | --- |
| heldout (ChatGPT) | 8/8 (8/8) | 5/8 | 0/15, 0/2 |
| heldout2 | 12/12 (12/12) | 12/12 | 0/20, 0/2 |
| heldout3 | 12/12 (12/12) | 5/12 | 0/20, 0/2 |
| heldout4 | **12/12 (11/12)** | 3/12 | 0/19, 0/2 |
| dev | 12/12 (12/12) | 10/12 | 0/28, 0/3 |

**These are in-sample.** I looked at heldout3/4 while setting the thresholds and adding words ("change", "date", sort keys), so a good number here shows the rule covers the attacks written so far (including "Disable firewall", which no word list had), not that it generalises. Cause naming did not change, as expected: this rule affects what is consequential, not which passage is blamed.

## Live cost on benign multi-step tasks (local model, Helm blocking)
The cost of an allowlist is false pauses when an agent clicks a button it was not told to. Measured on the 10 multi-step tasks, 2 reps, three times as the rule evolved:
- **First pass:** 20/20 tasks done, 2 pauses, both "Save name" in the rename task (user said "rename", the button says "Save name"). Fixed by adding plain completion words (save, apply, done, continue, update) to the allowlist. Files `multistep-first-pass/`.
- **Second pass:** exposed a parser bug of mine: `button >> text="Delete Dentist event"` (a chained selector) was read as a button called ">>", paused twice in the task where the user asked for that deletion. Fixed in `src/model/policy.mjs`.
- **Final pass (files `multistep-final/`):** 20 runs, 19 finished, **1 pause in 53 actions**: a click Helm could not name (`calendar-delete-asked` #1, the known unresolved-target limit). No pause came from the allowlist. Runs are unseeded; earlier batches had 2-5 unresolved-target pauses, so that part moves with the agent's mood, not with this rule.

## Honest limits
The multi-step tasks are author-written and the local agent clicks mostly what it is asked to; a livelier agent will click more unrequested buttons and see more pauses. The allowlist is a vocabulary too (a safe-word list), but it fails in the safe direction: a missing safe word costs a pause, a missing risk word used to cost a miss. The real test is a fifth blind set scored once on this frozen rule.
