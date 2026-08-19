// Render queue v3 — fire-timestamp matching. The v2 prompt-prefix matcher
// collided (shared world-block opening → ten copies of one render, caught by
// identical byte sizes). The lane is serial: the newest job created AFTER my
// fire IS my job. Also md5-checks each download against the previous one.
import fs from 'fs';
import { execSync } from 'child_process';

const SHOTS = process.argv[3] || '/Users/clawbot247/workspace/duskveil/trailer/shots';
const PROMPTS = process.argv[2] || '/Users/clawbot247/workspace/duskveil/trailer/prompts';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function cdp() {
  const list = await (await fetch('http://127.0.0.1:9224/json/list')).json();
  const t = list.filter(x => x.type === 'page' && /higgsfield/.test(x.url))[0];
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0;
  const call = (m, p = {}) => new Promise(res => {
    const i = ++id;
    const h = e => { const d = JSON.parse(e.data); if (d.id === i) { ws.removeEventListener('message', h); res(d); } };
    ws.addEventListener('message', h); ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
  const ev = async x => (await call('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }))?.result?.result?.value;
  return { ev };
}
async function newestJob(ev) {
  const out = await ev(`(async function(){
    var tok = await window.Clerk.session.getToken();
    var r = await fetch('https://fnf-api-gw.higgsfield.ai/fnf/jobs/accessible?job_set_type=seedance_2_5&page=1&page_size=3', {headers:{Authorization:'Bearer '+tok}});
    var j = await r.json();
    var x = j.jobs[0];
    return x ? JSON.stringify({id:x.id, st:x.status, url:(x.results&&x.results.raw)?x.results.raw.url:null,
      fail:(x.meta&&x.meta.fail_reason)||null, at:x.created_at}) : 'null';
  })()`);
  return out === 'null' ? null : JSON.parse(out);
}

const { ev } = await cdp();
let prevMd5 = '';
const prompts = fs.readdirSync(PROMPTS).filter(f => f.endsWith('.txt')).sort();
for (const pf of prompts) {
  const out = SHOTS + '/' + pf.replace('.txt', '.mp4');
  if (fs.existsSync(out) && fs.statSync(out).size > 500000) { console.log('have', pf); continue; }
  let fired = false;
  for (let attempt = 0; attempt < 2 && !fired; attempt++) {
    try {
      execSync(`node /tmp/fire-gated.mjs "${PROMPTS}/${pf}"`, { stdio: 'pipe', timeout: 90000 });
      fired = true;
    } catch (e) { console.log('fire attempt', attempt + 1, 'failed for', pf); await sleep(20000); }
  }
  if (!fired) { console.log('SKIP (fire failed twice)', pf); continue; }
  const t0 = Date.now() / 1000 - 30;
  console.log('fired', pf);
  const deadline = Date.now() + 15 * 60000;
  while (Date.now() < deadline) {
    await sleep(25000);
    const j = await newestJob(ev);
    if (!j || j.at < t0) continue;                       // newest is still an older job
    if (j.st === 'completed' && j.url) {
      execSync(`curl -sf -o "${out}" "${j.url}"`);
      const md5 = execSync(`md5 -q "${out}"`).toString().trim();
      if (md5 === prevMd5) { console.log('DUPE DETECTED for', pf, '— discarding'); fs.unlinkSync(out); }
      else { prevMd5 = md5; console.log('LANDED', pf, fs.statSync(out).size, md5.slice(0, 8)); }
      break;
    }
    if (j.st === 'failed' || j.fail) { console.log('RENDER FAILED', pf, j.fail || j.st); break; }
  }
}
console.log('QUEUE v3 COMPLETE:', fs.readdirSync(SHOTS).filter(f => f.endsWith('.mp4')).join(' '));
process.exit(0);
