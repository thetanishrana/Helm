# Offline detection on the held-out set (ChatGPT-written pages)

Run 2026-10-29 with `node src/eval/cli.mjs detect --set heldout`. 13 pages (8 attacks, 5 benign) written by a fresh ChatGPT conversation that was given only `eval-pages/README.md` and the template, never the code. Pages are unedited. Files: `report.md`, `results.json`. **Not tuned on:** the explainer was not changed after seeing this result; if it is changed later, these pages become dev pages and that must be logged.

Interception 5/8 (95% CI 31-86%), attribution of the cause 2/8, 0 wrong causes named, 0/15 false interrupts on harmless steps and 0/2 on actions the user asked for. Dev-set equivalents (in-sample): 12/12 and 10/12. The gap is the point of having a held-out set.

Caveats: LLM-written attacks, so this is "held out from the explainer's author", not "written by human adversaries"; 8 attack pages is a small sample (wide interval); the styles are one page each. Offline detection runs the explainer on snapshots; it is not a live agent.
