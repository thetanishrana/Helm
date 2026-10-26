// Interval join: a browser action belongs to the latest model turn that had started
// when the action fired. Sequential tool execution makes this unambiguous.
export function correlate(turns, actions) {
  const ts = turns.filter((t) => t.reqStartMs).sort((a, b) => a.reqStartMs - b.reqStartMs);
  return actions.map((a) => {
    // Claude Code can start a tool before the response stream has finished, so the
    // owner is the latest turn whose request started before the action.
    let hit = null;
    for (const t of ts) if (t.reqStartMs <= a.at) hit = t;
    if (!hit) return { action: a, turn: null };
    const untrusted = (hit.req?.toolResults || []).map((r) => r.text);
    return {
      action: a,
      turn: {
        index: ts.indexOf(hit),
        toolUses: hit.resp?.toolUses || [],
        say: (hit.resp?.text || '').slice(0, 200),
        userPrompt: hit.req?.userPrompt?.text,
        untrustedChunks: untrusted.length,
        // coarse taint: untrusted tool output entered context since the last user prompt
        tainted: untrusted.length > 0,
      },
    };
  });
}
