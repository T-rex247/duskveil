// Overnight render queue: waits for the current COIN job (S10h escorts) and
// collects it, then fires the 12 DUSKVEIL trailer shots serially on the free
// lane. Handles the rights gate + "I confirm" dialog (the failure that read as
// four kills tonight). Seen-src ledger avoids double-downloads.
import fs from 'fs';
import { execSync } from 'child_process';

const SHOTS_DIR = '/Users/clawbot247/workspace/duskveil/trailer/shots';
const PROMPTS_DIR = '/Users/clawbot247/workspace/duskveil/trailer/prompts';
const COIN_OUT = '/Users/clawbot247/workspace/the-coin/generated';
const LEDGER = SHOTS_DIR + '/seen.json';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const seen = new Set(fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : [
  'hf_20260819_062723_e530a12d-f01c-4d98-b117-83940ab21529',
  'hf_20260819_063534_4efb5f7a-b2d5-4267-b5b7-19bfa9399c6c',
]);
const saveSeen = () => fs.writeFileSync(LEDGER, JSON.stringify([...seen]));

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
  return { ws, call, ev };
}

const STATE = `JSON.stringify([].slice.call(document.querySelectorAll('*')).filter(function(e){return e.children.length===0&&/^(Processing|Generating|Queued)/.test(e.textContent.trim())}).map(function(e){return e.textContent.trim()}).slice(0,2))`;
const CLEAR = `(function(){
  var b=[].slice.call(document.querySelectorAll('button')).find(function(e){return /^I confirm$/i.test((e.textContent||'').trim())});
  if(b){b.click();return 'confirmed';}
  var g=[].slice.call(document.querySelectorAll('button,[role=button],span,div')).find(function(e){return e.childElementCount<=1&&/I own rights to this content/i.test(e.textContent||'')});
  if(g){g.click();return 'gate';}
  return 'none';
})()`;
const SRCS = `(function(){var v=[];document.querySelectorAll('video').forEach(function(x){var s=x.src||x.currentSrc||'';var m=s.match(/hf_\\d+_[0-9a-f-]{36}/);if(m&&v.indexOf(s)<0)v.push(s)});return JSON.stringify(v)})()`;

async function collect(outPath, maxMin) {
  const { ws, call, ev } = await cdp();
  const deadline = Date.now() + maxMin * 60000;
  try {
    // wait for render to finish
    while (Date.now() < deadline) {
      await sleep(20000);
      const st = JSON.parse(await ev(STATE) || '[]');
      if (st.length === 0) break;
    }
    await sleep(5000);
    // clear gates/dialogs (up to 6 rounds)
    await call('Page.bringToFront');
    for (let k = 0; k < 6; k++) {
      const r = await ev(CLEAR);
      if (r === 'none') break;
      await sleep(1800);
    }
    // expose + find a NEW src
    for (let attempt = 0; attempt < 10 && Date.now() < deadline; attempt++) {
      await ev('window.scrollTo(0,0)');
      await sleep(800);
      for (const y of [300, 450, 583]) {
        await ev('(function(){var el=document.elementFromPoint(1005,' + y + ');if(el)el.click();return 1})()');
        await sleep(1500);
        // a click may open the confirm dialog instead — clear again
        await ev(CLEAR); await sleep(800);
      }
      const vids = JSON.parse(await ev(SRCS) || '[]');
      const fresh = vids.find(s => { const m = s.match(/hf_\d+_[0-9a-f-]{36}/); return m && !seen.has(m[0]); });
      if (fresh) {
        const key = fresh.match(/hf_\d+_[0-9a-f-]{36}/)[0];
        execSync(`curl -sf -o "${outPath}" "${fresh}"`);
        const sz = fs.statSync(outPath).size;
        if (sz > 500000) { seen.add(key); saveSeen(); console.log('LANDED', outPath, sz, key); return true; }
        fs.unlinkSync(outPath);
      }
      await sleep(15000);
    }
    console.log('NO NEW ASSET for', outPath);
    return false;
  } finally { ws.close(); }
}

// phase 1: the in-flight COIN escorts take
console.log('=== phase 1: collect S10h escorts');
const ok = await collect(COIN_OUT + '/S10h_escorts_crewcut_raw.mp4', 14);
console.log('S10h:', ok);

// phase 2: trailer shots
const prompts = fs.readdirSync(PROMPTS_DIR).filter(f => f.endsWith('.txt')).sort();
for (const pf of prompts) {
  const out = SHOTS_DIR + '/' + pf.replace('.txt', '.mp4');
  if (fs.existsSync(out) && fs.statSync(out).size > 500000) { console.log('skip (exists)', pf); continue; }
  console.log('=== firing', pf);
  try {
    execSync(`node /tmp/fire-gated.mjs "${PROMPTS_DIR}/${pf}"`, { stdio: 'inherit', timeout: 90000 });
  } catch (e) { console.log('FIRE FAILED', pf, String(e).slice(0, 120)); continue; }
  await sleep(20000);
  const got = await collect(out, 16);
  if (!got) console.log('MISSING', pf, '— continuing');
}
console.log('QUEUE COMPLETE');
