// Structure a Messages API exchange: what the model said/asked to do, and what
// untrusted tool output was in its context.

// Accumulate an SSE stream (identity-encoded text) into content blocks.
export function parseSse(text) {
  const blocks = [];
  for (const frame of text.split('\n\n')) {
    const data = frame.split('\n').find((l) => l.startsWith('data: '));
    if (!data) continue;
    let e; try { e = JSON.parse(data.slice(6)); } catch { continue; }
    if (e.type === 'content_block_start') blocks[e.index] = { ...e.content_block, _json: '', text: e.content_block.text || '' };
    else if (e.type === 'content_block_delta' && blocks[e.index]) {
      if (e.delta.type === 'text_delta') blocks[e.index].text += e.delta.text;
      if (e.delta.type === 'input_json_delta') blocks[e.index]._json += e.delta.partial_json;
    }
  }
  const out = { text: '', toolUses: [] };
  for (const b of blocks.filter(Boolean)) {
    if (b.type === 'text') out.text += b.text;
    if (b.type === 'tool_use') {
      let input = {}; try { input = JSON.parse(b._json || '{}'); } catch {}
      out.toolUses.push({ id: b.id, name: b.name, input });
    }
  }
  return out;
}

const textOf = (c) => (typeof c === 'string' ? c : (c || []).map((x) => x.text || '').join('\n'));

// What did the request contain: the user's own words vs. tool output (untrusted).
export function analyzeRequest(j) {
  const msgs = Array.isArray(j.messages) ? j.messages : [];
  let userPrompt = null; const toolResults = [];
  msgs.forEach((m, i) => {
    const parts = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content || [];
    for (const p of parts) {
      if (m.role === 'user' && p.type === 'text' && !/^<system-reminder>/.test(p.text)) userPrompt = { msg: i, text: p.text.slice(0, 500) };
      if (m.role === 'user' && p.type === 'tool_result') toolResults.push({ msg: i, toolUseId: p.tool_use_id, text: textOf(p.content).slice(0, 4000) });
    }
  });
  return { nMessages: msgs.length, nTools: Array.isArray(j.tools) ? j.tools.length : 0, userPrompt, toolResults };
}
