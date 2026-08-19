// Render queue v2 — API-truth edition. Fires each trailer prompt on the free
// lane and collects finished videos straight from the fnf jobs API (status +
// result URL + fail_reason), no DOM scraping. Matches jobs by prompt prefix.
import fs from 'fs';
import { execSync } from 'child_process';

const SHOTS = '/Users/clawbot247/workspace/duskveil/trailer/shots';
const PROMPTS = '/Users/clawbot247/workspace/duskveil/trailer/prompts';
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
  return { ws, ev };
}
async function jobs(ev, n) {
  const out = await ev(`(async function(){
    var tok = await window.Clerk.session.getToken();
    var r = await fetch('https://fnf-api-gw.higgsfield.ai/fnf/jobs/accessible?job_set_type=seedance_2_5&page=1&page_size=${n}', {headers:{Authorization:'Bearer '+tok}});
    var j = await r.json();
    return JSON.stringify(j.jobs.map(function(x){return {id:x.id, st:x.status, head:(x.params.prompt||'').slice(0,80),
      url:(x.results&&x.results.raw)?x.results.raw.url:null, fail:(x.meta&&x.meta.fail_reason)||null, at:x.created_at}}));
  })()`);
  return JSON.parse(out || '[]');
}
function head(promptFile) {
  return fs.readFileSync(promptFile, 'utf8').replace(/\n/g, ' ').slice(0, 80).trim();
}

const { ev } = await cdp();
const prompts = fs.readdirSync(PROMPTS).filter(f => f.endsWith('.txt')).sort();
for (const pf of prompts) {
  const out = SHOTS + '/' + pf.replace('.txt', '.mp4');
  if (fs.existsSync(out) && fs.statSync(out).size > 500000) { console.log('have', pf); continue; }
  const h = head(PROMPTS + '/' + pf);
  // already fired earlier? look for a matching job first
  let js = await jobs(ev, 30);
  let mine = js.find(j => j.head.trim() === h);
  if (!mine) {
    console.log('firing', pf);
    try { execSync(`node /tmp/fire-gated.mjs "${PROMPTS}/${pf}"`, { stdio: 'inherit', timeout: 90000 }); }
    catch (e) { console.log('FIRE FAILED', pf); continue; }
  } else console.log('found existing job for', pf, mine.st);
  // poll until that prompt's newest job resolves
  const deadline = Date.now() + 18 * 60000;
  let done = false;
  while (Date.now() < deadline && !done) {
    await sleep(30000);
    js = await jobs(ev, 30);
    const matches = js.filter(j => j.head.trim() === h).sort((a, b) => b.at - a.at);
    const j = matches[0];
    if (!j) continue;
    if (j.st === 'completed' && j.url) {
      execSync(`curl -sf -o "${out}" "${j.url}"`);
      console.log('LANDED', pf, fs.statSync(out).size);
      done = true;
    } else if (j.st === 'failed' || j.st === 'nsfw' || j.fail) {
      console.log('FAILED', pf, 'reason:', j.fail || j.st);
      done = true;                                   // skip, keep the queue moving
    }
  }
  if (!done) console.log('TIMEOUT', pf);
}
console.log('QUEUE v2 COMPLETE');
process.exit(0);
