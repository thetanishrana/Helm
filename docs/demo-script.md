# Demo script (about two minutes)

**Setup (before recording):** Ollama running (`nohup ollama serve &`); free ports 7777, 8787, 8899, 9222, 9333; Chrome closed windows not needed. Test it once: `demo/run-demo.sh turn_tag --headless` should end with "1 held, 1 blocked" (the local model does not always follow the injected text; run it again if it says 0 held).

**Silent captioned clip (scripted):** `node scripts/record-demo.mjs` runs the live demo, films the Helm interface only (not the agent's Chrome window), clicks Block when the card is up and overlays captions; writes `demo/out/helm-demo.webm` (gitignored, about a minute, no audio; no ffmpeg here, so webm). The local model sometimes does not follow the injected text, so the script retries up to four times. Needs Ollama, Chrome and `spikes/agent-e2e` installed. First clip made 2026-11-08 (second attempt succeeded).

**Record by hand:** `demo/run-demo.sh turn_tag` (opens the Helm interface in your default browser and also opens a visible Chrome window for the agent, so two windows are on screen: put them side by side and record both; `--headless` hides the agent's window but also stops Helm when the agent finishes, so it is for testing, not recording; visible-window mode run end to end 2026-11-08: the interface part verified; the agent's Chrome window could not be screen-captured by me). The re-run check is on, so the decision card first says "Checking by re-run…" and about half a minute later "Confirmed by re-run"; you have 5 minutes to decide. The interface stays open after the agent finishes so you can open the receipt; press Ctrl-C in the terminal to end. Verified end to end on 2026-11-06: the card appeared after about 15 seconds, the re-run confirmed, Block ended the run with 1 held, 1 blocked.

1. **(0:00)** One sentence over the terminal: "An AI agent is browsing a page for me. I asked it only to press Refresh and read the new text."
2. **(0:15)** Show the page in Chrome: a hidden `<system-reminder>` block telling the agent to also click a Send button. "That text is the page, not me."
3. **(0:30)** Agent runs. Helm's status strip turns "untrusted content read". Harmless clicks (attach, goto, Refresh) pass without any prompt: "Helm stays quiet when I asked for it."
4. **(0:55)** The agent reaches for the Send button. The pause card appears: "Did you ask for this?", the page text outlined as the likely cause, risk "high". Say what the card says, not more: the cause is a heuristic.
5. **(1:20)** Press "No, block it". The agent receives a short text refusal and reports that it was blocked. Show the receipt: what ran, what was held, what was blocked.
6. **(1:45)** One honest line: "On pages I did not write, on a blind set Helm stopped 12 of 12 attacks, even buttons labelled just 'Release' or 'Disarm', and named the cause on 4. The price is some false pauses on unfamiliar harmless buttons like 'View document'. Explaining why is what I would work on next."

**Do not claim:** that it protects Claude (Haiku followed none of the test injections), any rate for real users, or that people decide better with it (no study).
