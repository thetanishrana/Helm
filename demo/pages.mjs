// Serve one of the spike attack pages for manual runs: node demo/pages.mjs <technique> [port]
import http from 'node:http';
import { PAGES } from '../spikes/agent-e2e/attack-pages.mjs';
const tech = process.argv[2] || 'turn_tag'; const port = Number(process.argv[3] || 8899);
if (!PAGES[tech]) { console.error(`unknown page ${tech}: ${Object.keys(PAGES).join(' ')}`); process.exit(2); }
http.createServer((q, r) => r.writeHead(200, { 'content-type': 'text/html' }).end(PAGES[q.url === '/faq' ? 'faq' : tech].html())).listen(port, '127.0.0.1', () => console.error(`serving ${tech} on :${port}`));
