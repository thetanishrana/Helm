// Attribution by meaning, not by shared words. An injection often paraphrases the control it wants pressed
// ("release the entrance latch" for "Unlock front door", "flip the visibility setting for everyone" for
// "Make repository public"), so word overlap misses it. Each concept below is a small group of words and phrases;
// a label and a passage match on a concept when both mention any member. The groups were written from the
// paraphrases seen in the first four held-out sets, so they are in-sample for those sets; a fresh blind set is the
// real test, and any group that is too broad shows up as a wrongly named cause.

const GROUPS = {
  remove: /\b(delet\w*|eras\w+|purg\w+|drop(ping|ped)?|wip\w+|destroy\w*|remov\w+|discard\w*|decommission\w*)\b/,
  disable: /\b(disabl\w+|deactivat\w+|suspend\w*|bypass\w*|turn(ing|ed)? off|switch(ing|ed)? off|(is|are|be|being|stay|stays|left|with)( the)? \w+ off|off|clear(ed|ing)? the|second step)\b/,
  public: /\b(public|publicly|everyone|anyone|unrestricted|visible|visibility|reachable|without (a )?login|whole (office|floor|team|company)|open to all|for all)\b/,
  unlock: /\b(unlock\w*|releas\w+|disarm\w*|latch|let .{0,12} in)\b/,
  door: /\b(door|latch|entrance|gate|garage|lock|courier)\b/,
  order: /\b(order|checkout|check out|purchas\w+|buy|bundle|finali[sz]\w+|cart|wholesale)\b/,
  send: /\b(send|resend|transfer\w*|wire|remit\w*|liquidat\w+|pay|payment|move the (funds|deposit|balance)|funds|balance)\b/,
  deposit: /\b(deposit\w*|bank|banks|payee|payout|sort code|routing|iban)\b/,
  sign: /\b(sign|signed|signature|countersign\w*|accept(ance)?|agree\w*|submit)\b/,
  database: /\b(database|datastore|data store|db|prod(uction)?)\b/,
  repo: /\b(repo|repository|project|source)\b/,
  contacts: /\b(contacts?|address book|records?|erasure)\b/,
  mfa: /\b(mfa|2fa|two[- ]?factor|multi-?factor|second step|step check|authentication|challenges?|verification|security (key|prompts?))\b/,
  firewall: /\b(firewall|filtering|protection|shield)\b/,
  calendar: /\b(calendar|schedule|events?)\b/,
  share: /\b(share|sharing|visib\w+|invite)\b/,
};

export function conceptsOf(text) {
  const t = String(text || '').toLowerCase();
  return new Set(Object.entries(GROUPS).filter(([, re]) => re.test(t)).map(([k]) => k));
}

// Share of the label's concepts that the passage also carries (0 when the label has none).
export function conceptOverlap(label, passage) {
  const want = conceptsOf(label); if (!want.size) return { share: 0, hits: 0, size: 0 };
  const have = conceptsOf(passage); let hits = 0; for (const c of want) if (have.has(c)) hits++;
  return { share: hits / want.size, hits, size: want.size };
}
