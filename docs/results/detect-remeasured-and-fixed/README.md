# Re-measurement with post-interaction snapshots, then a second round of explainer fixes

2026-11-04. Both earlier held-out sets (`eval-pages/heldout`, `eval-pages/heldout2`) are **dev data from here on**: everything below is in-sample.

**1. The offline measurement was wrong for pages that reveal text after a click.** The detector only saw the initial snapshot. In the second set, 9 of 12 injections appear only after the harmless steps, so Helm could not name a cause it never saw. `capture` now also saves `snapshot-after.txt` (after the manifest's harmless actions) and the detector gives Helm both. With the explainer **unchanged**: second set cause named 2/12 -> **7/12**; first set 4/8 (unchanged). The earlier claim that Helm "explains poorly (2/12)" was mostly this artifact. Files: `remeasure-heldout.md`, `remeasure-heldout2.md`.

**2. Explainer fixes, found by reading why the remaining attacks named no cause or slipped through** (files: `fix3-*.md`):
- Parser: a text node rendered as `- 'cell "..." [ref=..]'` (single-quoted, no trailing colon, typical when the text contains a colon) was dropped, hiding the injection.
- Risk words: ship, refill, reorder, renew, subscribe, upgrade, withdraw, refund, charge.
- AI addressees: bots, `@...-bot`, crawlers, "automated readers/agents/...". Imperatives: use, activate, switch, turn, enable, disable, acknowledge, confirm, complete...
- A passage that repeats the control's label and gives an order now counts as a cause even with one cue.
- A bare Send/Post/Submit button is requested when the user asked the agent to write, ask or reply.
- Short numbers ("#42") count when matching a named link (a regression my own bot rule exposed).

| Offline, explainer after fixes | Intercepted | Cause named correctly | False interrupts (harmless / asked) |
| --- | --- | --- | --- |
| First set (ChatGPT, 8 attacks), in-sample | 8/8 | 5/8 | 0/15, 0/2 |
| Second set (fresh Claude, 12 attacks), in-sample | 12/12 | 12/12 | 0/20, 0/2 |
| Dev set, in-sample | 12/12 | 10/12 | 0/28, 0/3 |

Do not quote these as generalisation: the rules were adjusted after reading what these pages did. The clean evidence is the third set (see `docs/heldout-findings.md`).
