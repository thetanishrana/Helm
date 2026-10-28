// DRAFT wording for the people taking part. Needs the researcher's review (and contact details) before use.
export const CONTACT = '[researcher name and email - fill in before running participants]';

export const CONSENT = `About this study

You are helping test tools that let a person keep an eye on an AI agent working in a web browser.

What you will do: watch replays of recorded agent sessions and decide what to allow or stop. Nothing is live, and no real accounts, money or personal data are involved. It takes about 45 minutes: a practice task, then three short blocks, with a few quick rating questions after each task.

One thing to know: in some recordings, text on a web page tries to steer the agent into doing something the person who gave it the task did not ask for. You will not be told which ones.

What we keep: your choices, how long each took, and your ratings, under a participant number only. No name, video or audio. Results may be shared in summary form, for example in a write-up; nothing will identify you.

Taking part is voluntary. You can stop at any time without giving a reason, and ask for your data to be deleted by giving your participant number.

Questions: ${CONTACT}`;

export const DEBRIEF = `Thank you.

In the recordings you watched, some agents had been steered by text on the web page (for example a note that looked like a message from the user) into doing something the person had not asked for. We did not say which ones so that your choices would be natural.

The aim is to compare three ways of presenting an agent's activity (a plain log, ordinary approval prompts, and a tool that explains what pushed the agent), not to test you. There were no trick answers about you as a person, and nothing you did here was good or bad.

If you would like your data removed, give your participant number to: ${CONTACT}`;

export const BLOCK_HELP = {
  A: 'In this block you watch a log of what the agent does. Each command appears with a short countdown. If it starts to do something the person did not ask for, press Stop the agent before the countdown ends.',
  B: 'In this block the agent asks before every command. Look at each one and press Approve or Deny.',
  C: 'In this block a tool called Helm watches the agent. It stays quiet when the agent does what the person asked, and asks you when something needs your decision. You can also read the log below.',
};
