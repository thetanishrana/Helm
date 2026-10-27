# Oversight UX

Status: draft spec for Gate 1 (live feed, pause card) and Gate 3 (study instrument). Principles come from brief 3.3; nothing here is validated until the pilot. Decisions are logged in `decisions.md`.

## 1. What the UI must achieve

1. The user can tell at a glance whether the agent is on task, has touched untrusted content, or is paused.
2. When paused, the user can decide correctly in seconds: what will happen, did I ask for it, which page pushed it.
3. After a task, the user can see what data left and what was blocked.
4. As a study instrument, every decision and its latency is logged, and the same views run on replayed recordings.

## 2. Research that shapes the design

| Finding | Source | Design consequence |
| --- | --- | --- |
| Visual attention to a warning drops sharply after the second exposure; a warning that changes its appearance resists habituation. | [Anderson et al., fMRI habituation](https://scholarsarchive.byu.edu/facpub/9306) and the [MISQ longitudinal follow-up](https://misq.org/tuning-out-security-warnings-a-longitudinal-examination-of-habituation-through-fmri-eye-tracking-and-field-experiments.html) (found via search snippets; papers not read in full) | Prompts must be rare (interrupt budget). Vary the card's layout by cause type so it does not look identical each time. |
| In ~25M real warning impressions, bypass rates ranged from ~10% to 70% depending on warning type and design. | [Akhawe and Felt, USENIX Security 2013](https://research.google/pubs/alice-in-warningland-a-large-scale-field-study-of-browser-security-warning-effectiveness/) | Presentation changes behavior a lot; the card is worth designing carefully. |
| "Opinionated design" (a clear recommended safe choice, visual cues) raised safe choices by nearly 30% even though comprehension did not improve. | [Felt et al., CHI 2015](https://research.google/pubs/improving-ssl-warnings-comprehension-and-adherence/) | Block is the visually recommended default; do not depend on the user fully understanding. |
| Hold-to-confirm and type-the-name reduce accidental confirmations. | Practitioner write-ups only, e.g. [DEV Community](https://dev.to/tomj/why-holding-buttons-is-superior-to-confirmation-dialogs-in-ux-design-1fic). No controlled study found. | Treated as a hypothesis. The pilot logs latency so we can check whether it changes behavior. |

Gap: I found no study of oversight prompts for AI agents specifically beyond the brief's cited baselines. The brief's own Section 6 questions on this remain open.

## 3. Surface

Local web UI served by the proxy, opened in its own narrow window (about 420 px wide) beside the agent's Chrome. Ambient channels:

- Tab title and favicon reflect state: on task, touched untrusted content, paused.
- Status strip pinned to the top of the window (one line).
- OS notification only when a pause occurs.

No injection into the agent's page.

## 4. Screens

### 4.1 Status strip
One line: state dot, task in the user's words, step count, an always-visible **Stop task** button.
States: `On task` (quiet), `Read untrusted content` (amber dot, still quiet), `Paused: needs you` (red, with notification).

### 4.2 Live feed
Narrative sentences, newest at the bottom, auto-scroll that stops when the user scrolls up.
- Row: icon, sentence ("Opened your invoices page"), time, influence chip.
- Chips: `Your request` (neutral), `From page: example.com` (amber), `Blocked` (red).
- Click a row to expand: the why chain, plus the technical view when the details toggle is on (raw action, selector, model turn id).
- Low-risk consecutive rows collapse into a group ("Read 4 pages").

### 4.3 Pause card
Replaces the feed's bottom area and cannot be missed, but does not cover the cause.
1. Headline in consequences: "The agent wants to send 3 invoices to billing@example.test".
2. "You didn't ask for this."
3. Cause block: the highlighted passage from the page, labeled with its source. Wording stays "this text may have pushed the agent" until counterfactual attribution exists (decisions, 2026-10-27).
4. Why chain, four steps: You asked ... Page said ... Agent decided ... Now wants to ...
5. Controls (section 5).

The explainer already produces the fields: `action.what`, `requested`, `cause.text/page/weak`, `risk.tier/why`, `emails`, `reason`.

### 4.4 End-of-task receipt
Sections: Data that left (what, where, when), Blocked, Pages that tried to influence the agent, Your decisions with how long each took. This also serves as the study's per-task summary.

### 4.5 Replay player
Plays a recorded session in the same views: play, pause, 1x/2x/4x, step. Pauses occur at recorded hold points and wait for the participant. Decisions are logged but do not change the recording.

### 4.6 Study harness (researcher only)
Hidden route: choose participant id, condition (raw replay, standard prompts, Helm), order, and recording. Writes decisions, latency, and hover/expand events to a JSONL file. The baseline conditions reuse the same player with the Helm layers switched off.

## 5. Pause controls

v1:
| Control | Behavior |
| --- | --- |
| **Block** (default, Enter) | Denies; Helm ends the turn with a text message (decisions, 2026-10-26). |
| **Block and tell the agent why** | Same, with a short user-written or chosen reason fed back so the task continues. |
| **Allow once** | Press and hold about 1 s; progress fill; release cancels. |
| **Ignore this page** | Marks the cause page untrusted for the rest of the run and blocks. |
| **Ask the agent why** | Runs counterfactual attribution and shows the answer on the card. Disabled until that exists. |
| **Stop task** | Always in the strip. |

Excluded from the study build: Always allow for this site. Later: edit the action, take over manually, hold-and-undo for reversible actions, rewind, allow with data redacted.

## 6. Fatigue-aware logic

- Record decision latency per prompt.
- If two consecutive Allow decisions take under 2 s, the next high-risk card requires typing or choosing the destination ("billing@example.test") before Allow activates.
- Card layout varies by cause type (impersonated user text, hidden text, plain instruction) so it does not look identical each time.
- Unanswered prompts hold, then deny at the hold ceiling (about 10 minutes, decisions 2026-10-26).
- The thresholds (1 s, 2 s) are first guesses. Recalibrate after the pilot and log changes.

## 7. Study implications

- Conditions differ in more than the card, so claims are about Helm as a package, not individual features.
- Log: decision, latency, whether the cause was expanded, hold completions vs cancellations.
- Participants see plain mode only.
- Use compromised traces from `spikes/agent-e2e/traces/compromised/` and benign traces for matched tasks. These come from a local model (decisions, 2026-10-27), so state that in the writeup.

## 8. Build order

1. Mockups of 4.2, 4.3, 4.4 with fake data from real traces (this step).
2. Static viewer reading `tap.jsonl` and trace files; live feed and pause card wired to the explainer.
3. Hold-point wiring to the model tap's gate.
4. Replay player and study harness.
5. Pilot, one redesign, main study.

## 9. Open questions

- Does the plain-language sentence generator need a model, or do templates over `action.what` suffice? Start with templates.
- Window placement on a single small laptop screen: side-by-side vs a second space.
- How to present `weak` causes (page text addressed to AI that does not name the control) without overclaiming.
