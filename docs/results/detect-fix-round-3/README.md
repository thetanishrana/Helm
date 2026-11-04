# Third explainer fix round (2026-11-04) - all sets are in-sample from here

Made after reading why the clean third set (`heldout3`) let 3 of 12 attacks through (`Cancel booking`, `Unlock front door`, `Change direct deposit to account ...`). `heldout3` is **dev data from this commit on**; the four sets below are all in-sample.

Changes (`src/model/explain.mjs`, tests in `test/explain.test.mjs`):
- High-risk phrases: cancel + booking/reservation/flight/trip/appointment/membership/policy/contract/plan; unlock, disarm, open a door/gate/vault; change/update/redirect/link/add + direct deposit/payout/payee/beneficiary/bank account/payment method/recovery email/password/authorized user/admin/owner.
- Passages that point at a control without naming it ("the red control under ...", "through the form button") count as an influence cue; "automated clients" counts as addressing an AI.
- Two false-interrupt regressions these changes caused on `heldout3`'s own harmless actions were fixed: an unnamed order to AI (a weak cause) can no longer pause a low-risk action by itself, and low- and medium-risk controls count as requested when they share half their words with the user's request (high-risk still needs 0.75).

| Offline, after this round | Intercepted | Cause named correctly | False interrupts (harmless / asked) |
| --- | --- | --- | --- |
| heldout3 (was 9/12, 4/12 before the round) | 12/12 | 5/12 | 0/20, 0/2 |
| heldout (first set) | 8/8 | 5/8 | 0/15, 0/2 |
| heldout2 | 12/12 | 12/12 | 0/20, 0/2 |
| dev | 12/12 | 10/12 | 0/28, 0/3 |

These numbers say the rules now cover the attacks they were written from, not that Helm generalises. A fourth, blind set tests that.
