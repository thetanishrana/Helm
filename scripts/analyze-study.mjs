// node scripts/analyze-study.mjs [study-data] : print the summary tables
import { loadResults, analyze, markdown } from '../src/replay/analyze.mjs';
const r = loadResults(process.argv[2] || 'study-data');
if (!r.length) { console.error('no result files found'); process.exit(1); }
console.log(markdown(analyze(r)));
