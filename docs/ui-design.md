# Interface design

How the Helm interface is meant to look, and why. Written before the build, reviewed against the generic defaults a generated interface falls into (the checklist comes from the `frontend-design` skill in `.claude/skills/`, plus design references read from the Hallmark project as reading material only; neither adds code to Helm).

## Subject, audience, job
A person supervising an AI agent that is driving their browser. Most of the time they glance; occasionally they must make one precise call in seconds: *is this something I asked for?* They read URLs, button labels, commands and quoted page text, where one misread character matters.

## Concept: the course
The person's request is the destination. The agent's steps are marks along a course. An action that is not part of the request leaves the course, in red, and waits for a decision. The gap between "what you asked" and "what the agent wants" is the interface; the rest is quiet. This is the one memorable element; everything else is deliberately plain.

## Tokens
**Colour** (every text pair checked against WCAG AA in both modes; field edges and focus rings at 3:1 or better)

| Role | Light | Dark |
| --- | --- | --- |
| Paper (cool grey, not cream) | `#F2F4F5` | `#0F1A24` |
| Surface (the one raised panel, dialogs) | `#FFFFFF` | `#16232F` |
| Ink (navy, not black) | `#0E2233` | `#E6EDF2` |
| Muted text | `#586B7C` | `#8FA2B2` |
| Course (the track, completed steps) | `#2D6EA6` | `#74AEE0` |
| Off course (held, blocked) | `#B3301B` | `#F28B76` |
| Caution (untrusted text quoted from a page) | `#7F4E00` on `#FBF0D5` | `#E8B650` on `#33290F` |
| Confirmed | `#17704A` | `#62C795` |

Red means one thing: an action outside the request. Colour is never the only signal; every state also has words or a shape. Dark mode is re-derived from the same hues, not inverted; raised surfaces are lighter than the canvas; no shadows in dark.

**Type.** One family, Atkinson Hyperlegible Next, plus its Mono companion reserved for literal technical strings (commands, URLs, quoted page text). Chosen because it was designed so look-alike characters cannot be confused, which is this interface's whole job, and bundled locally so nothing loads from a network. Scale 13 / 15.5 / 17.5 / 21 px (ratio about 1.15), sentence case everywhere, tabular numerals for times and counts.

**Shape.** Radius by role: 4 (chips, quotes), 8 (buttons, fields), 12 (the decision panel, dialogs). One raised container; everything else is flat and ruled by whitespace and hairlines. 44 px hit targets on every decision control.

**Motion.** State only: the paused dot pulses, the hold-to-confirm fill. Nothing enters, slides or fades on load. All of it respects `prefers-reduced-motion`.

## Layout
Narrow window (the intended use: beside the browser): one column, header, then "You asked", then the decision, then the course. At 880 px and up: a rail on the left (the request and any decision, sticky) and the course on the right, so a decision never scrolls away from view.

```
Helm            Needs your decision · 1              Receipt
-------------------------------------------------------------
You asked                  | The course
Click the Refresh button.  |  11:39:47  o  Task started
                           |  11:40:01  o  Opened 127.0.0.1:8899
Did you ask for this?      |  11:40:04  o  Click "Refresh"
 You asked  Click Refresh  |            |    You asked for this
 Agent wants  Click "Send" |  11:40:07  +--o  Held: click "Send all..."
 Why it was held ...       |
 [No, block it] [Yes, hold]|
```

## Reviewed against the defaults (what was dropped)
Cream background with a serif and terracotta accent; near-black with one acid accent; broadsheet hairline columns; the rounded-card kit with one radius, one soft shadow and gradient washes; a tracked ALL-CAPS eyebrow over every heading; "A · B · C" meta strings; spaced em dashes in labels; "→" on buttons; a mono face for small data labels; icon tiles; entrance animations on load; a colour-accented word in a heading; a left-border accent on cards. None of these are used. The first draft's status line used middle dots between count and state; it now uses words.

## Words
Plain verbs, active voice, sentence case. A decision says what it does ("No, block it", "Yes, I asked for this"); the same action keeps the same name in the course ("Blocked"). Errors say what happened and what to do. An empty course is an invitation ("Waiting for the agent...").

## States covered
Waiting (nothing yet), working, reading untrusted content, paused with one or several decisions, finished, connection lost; an empty course, an empty decision area; the decision panel while the re-run check is pending, confirmed, inconclusive, or off; hold-to-confirm in progress; the plain command prompt (study condition B); the raw log with a stop window (condition A); receipt, consent, intro, questionnaire and debrief dialogs.

## What this design is not
It has not been tried with a person. The wording, the hold-to-confirm friction and the "you asked / the agent wants" framing are hypotheses; the qualitative pilot is where they get tested.

## As built (2026-11-05)
Built in `src/ui/` (vanilla JavaScript, no build step), served with a strict content-security-policy, fonts bundled locally. What changed from the plan while building and looking at screenshots:
- **Hold to confirm.** "Yes, I asked for this" on a high-risk decision must be held for 1.2 s (pointer, or Space/Enter held) with a visible fill; an early release cancels. This replaces the old "Allow is disabled for 1.2 s" rule. A scripted click skips the hold, so the simulated participant used for pipeline tests still works. Lower-risk decisions are a plain click.
- **A live countdown** on every pending decision ("Helm blocks it in 4:33"), because the timeout is real.
- **The request reaches the interface.** The model tap now carries the person's original request on each model turn, so the live interface can say "You asked ..." next to "Agent wants ...". Until now only recorded study replays knew it. While a decision is pending, the request is shown inside the decision, not twice.
- **The re-run check says what it found** (confirmed, several passages, not from page text, could not be tested, off) instead of one tag.
- **The course merges "allowed without asking" with the action it allowed**, so a quiet step is one row ("Click button 'Refresh', you asked for this"), not two. Agent command lines are one truncated, expandable line each.
- **The plain prompt (study condition B) has two equal-weight buttons**, because it is the comparator for Helm and neither answer should be nudged.
- **Status is also in the tab**: the title shows the pending count and the tab icon changes colour with state.
- **Security headers** (`default-src 'none'`, no inline script or style, no framing) and a whitelist of served files. Everything on this page can contain text from untrusted web pages, so the page refuses to run or load anything unlisted.

## Checked
`npm run ui:check` drives the real interface in Chrome: no console errors or content-security-policy violations; hold-to-confirm needs a real hold with the pointer and with the keyboard, and an early release does not approve; a script click still works; Block works; no horizontal overflow at 320 to 1280 px; reduced motion stops the pulse; dark mode applies; every button has a name; idle shows how to start. `npm run ui:preview -- <state>` serves the real interface with scripted sessions for review (states: idle working untrusted paused checking blocked allowed multi long finished plain raw). A full simulated study session (consent, practice, three conditions, questionnaire, debrief) ran through the new interface with no page errors.

## Known gaps
- Not tried with a person.
- The floating-pill window, OS notifications, and rendering the page snapshot with the injected text outlined were in earlier notes and are not built.
- The window is designed to sit beside the browser; it has not been fitted to a real narrow window on screen.
- The status line could carry a "connection lost" action; it currently says to reload.

## Finish pass (2026-11-16)
The owner found the first rebuild too plain and clinical. CSS only (no markup or script changes, so behaviour and the checks are unchanged): a warm paper tone instead of cool white, brass as a second accent (brand tile, heading rules, header hairline), soft radial halos and a fine grain on the page, a translucent blurred header, layered shadows and a red top edge on the decision card, glowing track nodes, a rise-in for the card only (the course is rebuilt on every event, so it is not animated), and a deeper dark theme. Screenshots: `docs/assets/ui-2026-11-16-light.png`, `-dark.png`. Contrast was kept; `npm run ui:check` passes 21/21 (one expected dark-paper colour in the check was updated).
