// Which conditions and scenarios a participant sees. Every participant gets all three conditions in
// one of the six possible orders (so order effects cancel over six participants), and in each block
// two injected and two benign scenarios chosen so that, over many participants, each scenario is seen
// under each condition about equally often. Pure function of the participant index.
export const ORDERS = [['A', 'B', 'C'], ['B', 'C', 'A'], ['C', 'A', 'B'], ['A', 'C', 'B'], ['C', 'B', 'A'], ['B', 'A', 'C']];

// Order a pool so that neighbours come from different sites (first styles, then second styles).
function interleave(ids, siteOf) {
  const seen = new Map(); const first = [], second = [];
  for (const id of [...ids].sort()) { const s = siteOf(id); const n = (seen.get(s) ?? 0); seen.set(s, n + 1); (n === 0 ? first : second).push(id); }
  return [...first, ...second];
}
const rng = (seed) => { let h = seed >>> 0; return () => ((h = (h * 1664525 + 1013904223) >>> 0) / 2 ** 32); };

// Six participants (one of each condition order) balance perfectly: the 12 injected and the 12 benign
// scenarios form six pairs each; participants 0-2 see pairs 0,1,2 in blocks 1-3 and participants 3-5 see
// pairs 3,4,5, so every pair is seen once under each condition. Later cycles swap the two groups.
export function planFor(index, scenarios) {
  const all = Object.values(scenarios).filter((s) => !s.practice);
  const siteOf = (id) => scenarios[id].site ?? id.split('-')[0];
  const inj = interleave(all.filter((s) => s.injected).map((s) => s.id), siteOf);
  const ben = interleave(all.filter((s) => !s.injected).map((s) => s.id), siteOf);
  if (inj.length !== 12 || ben.length !== 12) throw new Error(`plan needs 12 injected and 12 benign scenarios, have ${inj.length} and ${ben.length}`);
  const i = index % 6, cycle = Math.floor(index / 6);
  const order = ORDERS[i]; const rnd = rng(index * 7919 + 17);
  const group = ((i < 3 ? 0 : 1) + cycle) % 2 === 0 ? [0, 1, 2] : [3, 4, 5];
  const blocks = order.map((condition, b) => {
    const pi = group[b], pb = (group[b] + 1 + cycle) % 6;   // benign pairs are a different bijection of the same slots
    const ids = [inj[2 * pi], inj[2 * pi + 1], ben[2 * pb], ben[2 * pb + 1]];
    for (let k = ids.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [ids[k], ids[j]] = [ids[j], ids[k]]; }
    return { condition, scenarios: ids };
  });
  return { index, order, practice: Object.values(scenarios).find((s) => s.practice)?.id ?? null, blocks };
}

// How evenly a set of plans covers (scenario, condition) pairs: returns { counts, spread }.
export function coverage(plans) {
  const counts = {};
  for (const p of plans) for (const b of p.blocks) for (const id of b.scenarios) { const k = `${id}|${b.condition}`; counts[k] = (counts[k] || 0) + 1; }
  return counts;
}
