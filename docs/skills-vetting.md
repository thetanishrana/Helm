# Design skills: what was found, what was vetted, what was added

2026-11-05. Goal: find GitHub skills that help avoid generic "AI-looking" interfaces, check they are safe, and add only what passes. A skill is text that steers an agent; the risk is not the prose but what it makes the agent run, fetch or change. So the checks were about that.

## Method
1. Searched GitHub (`gh search repos`) for design skills and anti-slop design skills; shortlisted by relevance, maintainer and activity.
2. For each candidate, read the repository tree through the API as inert data (nothing cloned into the project, nothing run), then downloaded the skill folder into a quarantine directory outside the repo.
3. Scanned every text file for: shell, network and install commands; `allowed-tools`, hook, or permission configuration; credential and path references; prompt-injection phrasing ("ignore previous", "do not tell the user"); hidden Unicode and HTML comments; external hosts.
4. Read the instruction file in full. Checked that no scripts are bundled, or, if scripts are bundled, what each can do.
5. Added only what is prose-only and clean, with its licence, its upstream commit and file hashes recorded.

## Results
| Candidate | What it is | Decision | Why |
| --- | --- | --- | --- |
| `anthropics/skills` -> `frontend-design` | Anthropic's official design skill (9 KB, one file plus licence, Apache-2.0) | **Added** to `.claude/skills/frontend-design/` unmodified, with `PROVENANCE.md` | Prose only. No commands, network references, tool grants, hooks or hidden text. It also contains a concrete catalogue of generated-UI defaults (cream and terracotta, acid green on black, uniform rounded cards with one soft shadow, tracked all-caps eyebrows, "A · B · C" strings, "→" on buttons) that this interface was checked against. |
| `Nutlope/hallmark` | A large anti-slop design skill (about 190 files: markdown references, theme images, and a `scripts/` folder) | **Not installed as a skill.** Its reference documents were read as design reading only | The prose is clean, but the package bundles Node scripts: `install-hook.mjs` (writes a PostToolUse hook into the agent's settings), `imagegen.mjs` (calls an image-generation API with an API key from the environment), puppeteer capture scripts, and a 4,400-line linter. Its `SKILL.md` instructs the agent to run them. A skill that tells an agent to modify its own hooks and call external APIs is not something to add on trust. (A first look at the file tree missed the scripts folder because the listing was cut off; the full scan caught it.) |
| `pbakaus/impeccable` | Large design-command skill | **Not installed** | Ships a command-line program and a 563 KB minified browser-injection bundle plus hooks documentation. That cannot be reviewed line by line, and it is more machinery than a design skill needs. Not read further. |
| Small community skills (`ui-ux-pro-max` variants, `anti-slop-design`, others) | Single-author, few stars | Not evaluated beyond the listing | Anthropic's official skill covers the need without adding a new trust relationship. |

## What was actually taken from Hallmark
Ideas only, read as documentation and applied by hand: for an application screen (a tool someone works in), earned familiarity beats decoration; one restrained accent; tabular numerals; every region has loading, empty, error and full states; motion is state, never decoration; a native `<dialog>` for overlays; dark mode is re-derived, not inverted; a destructive action is confirmed or undone. None of its code, scripts or hooks were added.

## One thing that was blocked
I also wanted to run Hallmark's static linter (`sloplint.mjs`; local file reads only, no network code, as far as a read of its imports and grep for network and process APIs could show) on the interface as a mechanical check, inside Node's permission sandbox. The Claude Code permission classifier blocked running third-party code, and that was respected. The audit above stands without it; the linter is an optional extra the owner could allow.

## Rule going forward
A third-party skill is added only if it contains no executable files and no instructions to run them, passes the scan in step 3, is read in full, and its source commit and hashes are recorded beside it. Anything with scripts is read, not installed.
