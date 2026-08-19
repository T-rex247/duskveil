'use strict';
/* PROJECT DUSKVEIL — hero-command battle arena (HALCYON universe).
 * One lane, two cores, minion waves, jungle camps, four legends.
 * Single-file, no build step; art = HALCYON atlas sheets (mirror-facing). */

/* ============================ helpers ============================ */
const $ = id => document.getElementById(id);
/* ?demo=fight — a staged 3v3 teamfight at the altar, all ults online, camera
 * locked on the clash. Exists so the graphics review loop grades the same
 * scene every round. */
const DEMOF = typeof location !== 'undefined' && /[?&]demo=fight/.test(location.search);
const NET = { on: false, guest: false, peer: null, conn: null, conns: [], seat: 0, evq: [], snapT: 0, myHk: '', myHid: -1, taken: [], pendingHk: '' };
let MODE = 'solo', roomCode = '';
const ICE = { config: { iceServers: [ { urls: 'stun:stun.l.google.com:19302' }, { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' } ] } };
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const TAU = Math.PI * 2;

/* ============================ world ============================ */
/* 3v3 twin-lane arena (Twisted-Treeline-shaped, original): two lanes over a
 * jungle midfield with a capturable central altar. */
const WORLD = { w: 3000, h: 1900 };
const LANES = [360, 1540];
const MID_Y = 950;
const LANE_Y = MID_Y;                    // base/core height
const cv = $('cv'), cx = cv.getContext('2d');
let VW = 0, VH = 0, DPR = 1, ZOOM = 1;
let camX = 0, camY = 0, shake = 0, shakeT = 0;
function resize() {
  DPR = Math.min(2, devicePixelRatio || 1);
  VW = innerWidth; VH = innerHeight;
  cv.width = VW * DPR; cv.height = VH * DPR;
  ZOOM = clamp(Math.min(VW / 1250, VH / 800), 0.62, 1.12);
  if (VW < 700) ZOOM = Math.max(ZOOM, 0.78);
}
addEventListener('resize', resize); resize();

/* ============================ teams ============================ */
const TEAM = [
  { name: 'DAWN', main: '#5aa2ff', rgb: '90,162,255', light: '255,233,168' },
  { name: 'MAW', main: '#ff5a5a', rgb: '255,90,90', light: '255,150,90' },
  { name: 'WILD', main: '#c9b37e', rgb: '201,179,126', light: '235,220,170' },
];

/* ============================ art loading ============================ */
const ANIMS = {};           // key -> {idle:{img,n,fw,fh,fps}, walk, attack}
const FX = {};              // fxkey -> sheet
const PLATES = {};          // plate key -> img
const UNIT_SHEETS = ['vectra_sovereign', 'dawnmarch_corwen', 'dawnmarch_liora', 'dawnmarch_squire', 'dawnmarch_sunbow',
  'vectra_bastille', 'mawborn_ravener', 'mawborn_cinderling', 'mawborn_imp', 'mawborn_fiend', 'mawborn_pitbrute'];
const FX_SHEETS = ['fx_hit_gold', 'fx_hit_cyan', 'fx_hit_ember', 'fx_muzzle_gold', 'fx_muzzle_cyan', 'fx_muzzle_ember',
  'fx_death_dawnmarch', 'fx_death_vectra', 'fx_death_mawborn', 'fx_proj_lightarrow', 'fx_proj_ionbolt_v3',
  'fx_proj_shell_v3', 'fx_proj_emberspit', 'fx_ability_finallight', 'fx_ability_daybreak'];
const PLATE_FILES = { keep: 'dawnmarch_keep', tower_d: 'dawnmarch_watchtower', spire: 'mawborn_brimstonespire', heart: 'mawborn_pitheart' };
const TILE_FILES = {
  meadow: 'ground_meadowstone', dirt: 'ground_neutraldirt', cratered: 'ground_cratered',
  crystal_rich: 'crystal_rich_256', crystal_full: 'crystal_full_256', painting: 'mapgen',
  rock: 'doodad_rockoutcrop_256', tree: 'doodad_deadtree_256',
  ruins: 'doodad_ruinpillars_256', bones: 'doodad_bonespire_256',
};
const TILES = {};

function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
async function loadAll() {
  const jobs = [];
  let done = 0, total = UNIT_SHEETS.length * 3 + FX_SHEETS.length + Object.keys(PLATE_FILES).length;
  const tick = () => { done++; $('loadin').style.width = Math.round(done / total * 100) + '%'; };
  for (const u of UNIT_SHEETS) {
    ANIMS[u] = {};
    for (const a of ['idle', 'walk', 'attack']) {
      jobs.push((async () => {
        try {
          const meta = await (await fetch(`assets/anim/${u}_${a}.atlas.json`)).json();
          const img = await loadImg(`assets/anim/${u}_${a}.png`);
          ANIMS[u][a] = { img, n: meta.frame_count, fw: meta.frame_w, fh: meta.frame_h, fps: meta.fps || 12, hold: meta.hold_last_frame };
        } catch (e) { /* missing sheet degrades to idle */ }
        tick();
      })());
    }
  }
  for (const f of FX_SHEETS) {
    jobs.push((async () => {
      try {
        const meta = await (await fetch(`assets/fx/${f}.atlas.json`)).json();
        const img = await loadImg(`assets/fx/${f}.png`);
        FX[f] = { img, n: meta.frame_count, fw: meta.frame_w, fh: meta.frame_h, fps: meta.fps || 12 };
      } catch (e) { }
      tick();
    })());
  }
  for (const [k, f] of Object.entries(TILE_FILES)) {
    jobs.push(loadImg(`assets/tiles/${f}.png`).then(i => { TILES[k] = i; }).catch(() => {}));
  }
  for (const [k, f] of Object.entries(PLATE_FILES)) {
    jobs.push(loadImg(`assets/plates/${f}.png`).then(i => { PLATES[k] = i; tick(); }).catch(tick));
  }
  await Promise.all(jobs);
}

/* Feather fx cells so a full-cell frame never shows its rectangle (HALCYON R4 lesson). */
const FEATHERED = {};
function feathered(sheet, key) {
  if (FEATHERED[key] !== undefined) return FEATHERED[key] || sheet.img;
  const w = sheet.img.naturalWidth, h = sheet.img.naturalHeight;
  if (w * h > 9e6) { FEATHERED[key] = null; return sheet.img; }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(sheet.img, 0, 0);
  g.globalCompositeOperation = 'destination-in';
  for (let i = 0; i < sheet.n; i++) {
    const cxm = i * sheet.fw + sheet.fw / 2, cym = sheet.fh / 2, r = Math.min(sheet.fw, sheet.fh) / 2;
    const rg = g.createRadialGradient(cxm, cym, r * 0.62, cxm, cym, r * 0.96);
    rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(i * sheet.fw, 0, sheet.fw, sheet.fh);
    // wide cells: the radial misses the horizontal edges — feather all four sides too
    const m = Math.round(sheet.fw * 0.10);
    let eg = g.createLinearGradient(i * sheet.fw, 0, i * sheet.fw + m, 0);
    eg.addColorStop(0, 'rgba(0,0,0,0)'); eg.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = eg; g.fillRect(i * sheet.fw, 0, m, sheet.fh);
    eg = g.createLinearGradient((i + 1) * sheet.fw, 0, (i + 1) * sheet.fw - m, 0);
    eg.addColorStop(0, 'rgba(0,0,0,0)'); eg.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = eg; g.fillRect((i + 1) * sheet.fw - m, 0, m, sheet.fh);
    const mv = Math.round(sheet.fh * 0.10);
    eg = g.createLinearGradient(0, 0, 0, mv);
    eg.addColorStop(0, 'rgba(0,0,0,0)'); eg.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = eg; g.fillRect(i * sheet.fw, 0, sheet.fw, mv);
    eg = g.createLinearGradient(0, sheet.fh, 0, sheet.fh - mv);
    eg.addColorStop(0, 'rgba(0,0,0,0)'); eg.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = eg; g.fillRect(i * sheet.fw, sheet.fh - mv, sheet.fw, mv);
  }
  FEATHERED[key] = c;
  return c;
}
const FX_F0 = { fx_hit_gold: 2, fx_hit_cyan: 2, fx_hit_ember: 2, fx_ability_daybreak: 2, fx_ability_finallight: 2, fx_death_dawnmarch: 1, fx_death_vectra: 1, fx_death_mawborn: 1 };

/* ============================ heroes ============================ */
const HEROES = {
  liora: {
    key: 'dawnmarch_liora', name: 'LIORA', role: 'STORM ELDER', fac: 'dawnmarch', icon: '⚡',
    desc: 'Ranged caster. Bolts of daylight, a burst of storm, a shield of dawn — and one beam that ends arguments.',
    hp: 520, hpG: 62, dmg: 52, dmgG: 7, range: 330, cd: 1.05, speed: 175, r: 16,
    abilities: [
      { k: 'Q', name: 'LIGHTBOLT', icon: '☄', type: 'bolt', cd: 4, range: 560, dmg: l => 70 + 26 * l, speed: 900 },
      { k: 'W', name: 'SUNBURST', icon: '☀', type: 'aoe', cd: 9, range: 520, radius: 130, delay: 0.55, dmg: l => 90 + 32 * l },
      { k: 'E', name: 'AEGIS', icon: '⛨', type: 'shield', cd: 12, amount: l => 90 + 40 * l, dur: 3 },
      { k: 'R', name: 'FINAL LIGHT', icon: '✴', type: 'beam', cd: 55, range: 950, width: 70, dmg: l => 260 + 120 * l, ult: true },
    ],
  },
  corwen: {
    key: 'dawnmarch_corwen', name: 'CORWEN', role: 'BLADE LORD', fac: 'dawnmarch', icon: '⚔',
    desc: 'Melee bruiser. Cleaves ranks, charges the backline, and turns the whole field gold when Daybreak spins.',
    hp: 680, hpG: 84, dmg: 64, dmgG: 9, range: 70, cd: 0.95, speed: 185, r: 17,
    abilities: [
      { k: 'Q', name: 'CLEAVE', icon: '⚔', type: 'arc', cd: 5, radius: 160, dmg: l => 85 + 30 * l },
      { k: 'W', name: 'CHARGE', icon: '➤', type: 'dash', cd: 10, range: 430, radius: 100, dmg: l => 60 + 24 * l },
      { k: 'E', name: 'RALLY', icon: '⛨', type: 'shield', cd: 13, amount: l => 110 + 45 * l, dur: 3, haste: 1.3 },
      { k: 'R', name: 'DAYBREAK', icon: '✹', type: 'whirl', cd: 60, radius: 230, ticks: 3, dmg: l => 110 + 55 * l, ult: true },
    ],
  },
  bastille: {
    key: 'vectra_bastille', name: 'BASTILLE', role: 'WALKER ACE', fac: 'vectra', icon: '⚙',
    desc: 'Piloted twin-cannon frame. Sustained fire, rocket volleys, and an artillery barrage that erases a screen.',
    hp: 600, hpG: 72, dmg: 46, dmgG: 6, range: 300, cd: 0.62, speed: 168, r: 18,
    abilities: [
      { k: 'Q', name: 'TWIN BURST', icon: '◎', type: 'burst', cd: 6, range: 480, shots: 3, dmg: l => 42 + 16 * l },
      { k: 'W', name: 'ROCKETS', icon: '♨', type: 'aoe', cd: 10, range: 540, radius: 140, delay: 0.5, dmg: l => 100 + 34 * l },
      { k: 'E', name: 'OVERDRIVE', icon: '⏩', type: 'haste', cd: 12, dur: 3.5, haste: 1.45 },
      { k: 'R', name: 'BARRAGE', icon: '☠', type: 'barrage', cd: 65, range: 700, radius: 250, shells: 7, dmg: l => 95 + 45 * l, ult: true },
    ],
  },
  sovereign: {
    key: 'vectra_sovereign', name: 'SOVEREIGN', role: 'SKY DREADNOUGHT', fac: 'vectra', icon: '⚓',
    desc: 'A VECTRA capital ship answering the front in person. Broadsides, a point-defense screen, an overdrive ram — and a spinal lance that splits the field.',
    hp: 940, hpG: 105, dmg: 58, dmgG: 8, range: 340, cd: 1.1, speed: 132, r: 24,
    abilities: [
      { k: 'Q', name: 'BROADSIDE', icon: '◫', type: 'burst', cd: 7, range: 520, shots: 6, dmg: l => 30 + 12 * l },
      { k: 'W', name: 'AEGIS SCREEN', icon: '⬡', type: 'shield', cd: 13, dur: 3.5, amount: l => 180 + 60 * l },
      { k: 'E', name: 'OVERDRIVE RAM', icon: '⏩', type: 'dash', cd: 11, range: 340, radius: 130, dmg: l => 70 + 26 * l },
      { k: 'R', name: 'YAMATO LANCE', icon: '☄', type: 'beam', cd: 75, range: 820, width: 120, dmg: l => 300 + 120 * l, ult: true },
    ],
  },
  ravener: {
    key: 'mawborn_ravener', name: 'RAVENER', role: 'SWARM QUEEN', fac: 'mawborn', icon: '☠',
    desc: 'The pit answers her. Acid, broodlings, a killing lunge — and an orbital brimstone strike called down from the dark.',
    hp: 580, hpG: 70, dmg: 50, dmgG: 7, range: 260, cd: 0.9, speed: 180, r: 17,
    abilities: [
      { k: 'Q', name: 'ACID SPIT', icon: '☢', type: 'bolt', cd: 4.5, range: 520, dmg: l => 65 + 24 * l, speed: 780 },
      { k: 'W', name: 'BROOD', icon: '♟', type: 'spawn', cd: 16, count: 3, life: 18 },
      { k: 'E', name: 'LUNGE', icon: '➤', type: 'dash', cd: 9, range: 380, radius: 90, dmg: l => 55 + 20 * l },
      { k: 'R', name: 'ORBITAL BRIMSTONE', icon: '♨', type: 'nuke', cd: 80, range: 1500, radius: 270, delay: 2.2, dmg: l => 420 + 160 * l, ult: true },
    ],
  },
};
const MINIONS = {
  0: [{ key: 'dawnmarch_squire', hp: 190, dmg: 16, range: 55, speed: 120, r: 12, cd: 1.0 },
      { key: 'dawnmarch_sunbow', hp: 130, dmg: 22, range: 240, speed: 120, r: 11, cd: 1.2 }],
  1: [{ key: 'mawborn_cinderling', hp: 190, dmg: 16, range: 55, speed: 120, r: 12, cd: 1.0 },
      { key: 'mawborn_imp', hp: 130, dmg: 22, range: 230, speed: 120, r: 11, cd: 1.2 }],
};
const JUNGLE = [
  { x: 1000, y: 950, big: false, buff: 'WARDLIGHT' }, { x: 2000, y: 950, big: false, buff: 'WARDLIGHT' },
  { x: 1500, y: 700, big: true, buff: 'EMBERBRAND' }, { x: 1500, y: 1210, big: true, buff: 'EMBERBRAND' },
];
/* The ALTAR: hold the circle alone for 2.5 s to claim a 45 s team-wide
 * EMBERBRAND + gold. The 3v3 map's reason to fight in the jungle. */
const ALTAR = { x: 1500, y: 950, r: 90, prog: 0, owner: -1, lockT: 0 };

/* Shop items — League archetypes, original names. Bought at your own core. */
const ITEMS = [
  { id: 'blade',   n: 'Pilgrim Blade',    cost: 350,  ic: '🗡', ad: 10,                     d: '+10 attack damage' },
  { id: 'charm',   n: 'Ember Charm',      cost: 350,  ic: '🔥', hp: 80,                     d: '+80 max health' },
  { id: 'boots',   n: 'Duskstriders',     cost: 300,  ic: '🥾', ms: 25,                     d: '+25 move speed' },
  { id: 'sigil',   n: 'Storm Sigil',      cost: 800,  ic: '⚡', cdr: 0.1,                   d: '10% cooldown reduction' },
  { id: 'fang',    n: 'Ravener Fang',     cost: 900,  ic: '🩸', ad: 15, ls: 0.12,           d: '+15 AD · 12% lifesteal' },
  { id: 'aegisp',  n: 'Aegis Plate',      cost: 1000, ic: '🛡', hp: 220,                    d: '+220 max health' },
  { id: 'edge',    n: 'Dawnforged Edge',  cost: 1600, ic: '⚔', ad: 35,                     d: '+35 attack damage' },
  { id: 'crown',   n: 'Veilpiercer Crown',cost: 2200, ic: '👑', ad: 25, cdr: 0.15, hp: 150, d: '+25 AD · 15% CDR · +150 HP' },
  { id: 'heart',   n: 'Pit Heart',        cost: 2400, ic: '💗', hp: 450,                    d: '+450 max health' },
  { id: 'reaver',  n: 'Final Reaver',     cost: 3000, ic: '☄', ad: 55, ls: 0.18,           d: '+55 AD · 18% lifesteal' },
];
function itemStat(u, k) { let v = 0; for (const id of (u.items || [])) { const it = ITEMS.find(i => i.id === id); if (it && it[k]) v += it[k]; } return v; }
function atShop(u) { const c = coreOf(u.team); return c && dist(u, c) < 420; }
function buyItem(u, id) {
  const it = ITEMS.find(i => i.id === id);
  if (!it || (u.items || []).length >= 6 || !atShop(u) || u.dead) return false;
  if (u === player) { if (gold < it.cost) return false; gold -= it.cost; }
  u.items = u.items || []; u.items.push(id);
  heroStat(u); u.hp = Math.min(u.maxHp, u.hp + (it.hp || 0));
  fxPush({ kind: 'shock', x: u.x, y: u.y, life: .4, max: .4, r: 46, c: '255,217,138' });
  if (u === player) { feed('Bought ' + it.n + '.'); paintShop(); }
  return true;
}
function sellItem(u, idx) {
  const id = (u.items || [])[idx]; if (id === undefined) return;
  const it = ITEMS.find(i => i.id === id);
  u.items.splice(idx, 1); heroStat(u);
  if (u === player) { gold += Math.round(it.cost * 0.7); feed('Sold ' + it.n + ' (+' + Math.round(it.cost * 0.7) + 'g)'); paintShop(); }
}

/* ============================ entities ============================ */
let units = [], towers = [], fx = [], beams = [], corpses = [], telegraphs = [];
let eid = 0, time = 0, over = false, started = false;
let player = null, heroes = [], kills = 0, deaths = 0, gold = 0;
let waveT = 5, buffMsgT = 0;

function mkUnit(team, key, x, y, stats, kind) {
  return {
    id: eid++, team, key, kind: kind || 'minion', x, y, face: team === 0 ? 0 : Math.PI,
    hp: stats.hp, maxHp: stats.hp, dmg: stats.dmg, range: stats.range, speed: stats.speed,
    r: stats.r, cd: stats.cd, cdT: 0, dead: false, atkT: -9, hitT: -9,
    vScale: 0.9 + Math.random() * 0.22, vMirror: Math.random() < 0.5,
    order: null, target: null, sh: 0, shT: 0, haste: 1, hasteT: 0,
    kbx: 0, kby: 0, kbT: -9, camp: null, vPhase: Math.random(),
  };
}
function mkHero(team, hkey, x, y) {
  const h = HEROES[hkey];
  const u = mkUnit(team, h.key, x, y, h, 'hero');
  u.hero = h; u.hkey = hkey; u.level = 1; u.xp = 0; u.respT = 0;
  u.abCd = [0, 0, 0, 0]; u.buff = null; u.buffT = 0; u.recallT = 0;
  u.maxHp = h.hp; u.hp = h.hp;
  return u;
}
function heroStat(u) {
  const h = u.hero, l = u.level;
  u.maxHp = Math.round((h.hp + h.hpG * (l - 1)) * 1.45) + itemStat(u, 'hp');
  u.dmg = h.dmg + h.dmgG * (l - 1);
  if (DEMOF) u.maxHp = Math.round(u.maxHp * (u.kind === 'hero' ? (u === player ? 14 : 8) : 3));
}
function xpNeed(l) { return Math.round(90 * Math.pow(l, 1.35)); }
function grantXp(u, amt) {
  if (NET.guest) return;
  if (!u || u.kind !== 'hero' || u.dead) return;
  u.xp += amt;
  while (u.level < 9 && u.xp >= xpNeed(u.level)) {
    u.xp -= xpNeed(u.level); u.level++;
    const before = u.maxHp; heroStat(u);
    u.hp = Math.min(u.maxHp, u.hp + (u.maxHp - before));
    fxPush({ kind: 'shock', x: u.x, y: u.y, life: .5, max: .5, r: 60, c: TEAM[u.team].light });
    if (u === player) feed('Level ' + u.level + '.');
  }
}

/* ============================ setup ============================ */
function stage() {
  units = []; towers = []; fx = []; beams = []; corpses = []; telegraphs = [];
  time = 0; over = false; waveT = 5; kills = 0; deaths = 0; gold = DEMOF ? 0 : 1400;
  ALTAR.prog = 0; ALTAR.owner = -1; ALTAR.lockT = 60; ALTAR.capTeam = -1;   // altar opens at 1:00
  for (const team of [0, 1]) {
    const M = x => team === 0 ? x : WORLD.w - x;
    const pl = team === 0 ? 'tower_d' : 'spire', cr = team === 0 ? 'keep' : 'heart';
    towers.push(
      { id: eid++, team, core: true, x: M(210), y: MID_Y, hp: 2100, maxHp: 2100, r: 66, range: 340, dmg: 66, cdT: 0, plate: cr, size: 240 },
      { id: eid++, team, inner: true, x: M(560), y: MID_Y, hp: 1350, maxHp: 1350, r: 34, range: 310, dmg: 52, cdT: 0, plate: pl, size: 150 },
      { id: eid++, team, lane: 0, x: M(1020), y: LANES[0], hp: 1250, maxHp: 1250, r: 34, range: 300, dmg: 48, cdT: 0, plate: pl, size: 150 },
      { id: eid++, team, lane: 1, x: M(1020), y: LANES[1], hp: 1250, maxHp: 1250, r: 34, range: 300, dmg: 48, cdT: 0, plate: pl, size: 150 },
    );
  }
  for (const c of JUNGLE) spawnCamp(c);
}
/* Lane waypoints from a team's base toward the enemy core along one lane. */
function lanePath(team, lane) {
  const y = LANES[lane];
  if (team === 0) return [{ x: 760, y }, { x: 2240, y }, { x: 2440, y: MID_Y }, { x: 2700, y: MID_Y }];
  return [{ x: 2240, y }, { x: 760, y }, { x: 560, y: MID_Y }, { x: 300, y: MID_Y }];
}
function spawnCamp(c) {
  const defs = c.big
    ? [{ key: 'mawborn_pitbrute', hp: 520, dmg: 34, range: 60, speed: 95, r: 16, cd: 1.2 },
       { key: 'mawborn_fiend', hp: 260, dmg: 22, range: 60, speed: 110, r: 13, cd: 1.0 }]
    : [{ key: 'mawborn_fiend', hp: 260, dmg: 22, range: 60, speed: 110, r: 13, cd: 1.0 },
       { key: 'mawborn_fiend', hp: 260, dmg: 22, range: 60, speed: 110, r: 13, cd: 1.0 }];
  c.units = defs.map((d, i) => {
    const u = mkUnit(2, d.key, c.x + (i ? 54 : -20), c.y + (i ? 26 : -10), d, 'monster');
    u.camp = c; u.home = { x: u.x, y: u.y };
    units.push(u); return u;
  });
  c.alive = true;
}
let waveN = 0;
/* League wave model (LeagueSandbox lane logic): 3 melee front + 3 casters behind,
 * every 3rd wave adds a SIEGE minion (fat, ranged, +100% vs towers, big bounty). */
function spawnWave() {
  waveN++;
  for (const team of [0, 1]) {
    const x0 = team === 0 ? 380 : WORLD.w - 380;
    for (const lane of [0, 1]) {
      const comp = [];
      for (let i = 0; i < 3; i++) comp.push({ d: MINIONS[team][0], role: 'melee', gold: 21, xp: 60 });
      if (waveN % 3 === 0) comp.push({ d: MINIONS[team][0], role: 'siege', gold: 74, xp: 93 });
      for (let i = 0; i < 3; i++) comp.push({ d: MINIONS[team][1], role: 'caster', gold: 14, xp: 29 });
      comp.forEach((c, i) => {
        const st = c.role === 'siege'
          ? { ...c.d, hp: Math.round(c.d.hp * 3.4), dmg: Math.round(c.d.dmg * 1.7), range: 300, r: 15, cd: 1.4 }
          : c.d;
        const u = mkUnit(team, c.d.key, x0 + (Math.random() - .5) * 30, MID_Y - 40 + i * 26, st);
        u.role = c.role; u.bounty = c.gold; u.xpVal = c.xp;
        if (c.role === 'siege') u.vScale = 1.4;
        u.path = lanePath(team, lane); u.wp = 0;
        u.order = { ...u.path[0] };
        units.push(u);
      });
    }
  }
}

/* ============================ combat ============================ */
function foesOf(u) { return t => !t.dead && t.team !== u.team && (t.team !== 2 || u.kind !== 'minion'); }
function nearestEnemy(u, r) {
  let best = null, bd = r;
  for (const t of units) {
    if (t.dead || t.team === u.team) continue;
    if (t.team === 2 && u.kind === 'minion') continue;       // minions ignore jungle
    if (u.team === 2 && t.kind === 'minion') continue;       // jungle ignores minions
    const d = dist(u, t); if (d < bd) { bd = d; best = t; }
  }
  return best;
}
function nearestTower(u, r) {
  let best = null, bd = r;
  if (u.team === 2) return null;
  for (const t of towers) {
    if (t.hp <= 0 || t.team === u.team) continue;
    const d = dist(u, t); if (d < bd) { bd = d; best = t; }
  }
  return best;
}
function effDmg(u) {
  let d = u.dmg + (u.kind === 'hero' ? itemStat(u, 'ad') : 0);
  if (u.buff === 'EMBERBRAND') d *= 1.25;
  return Math.round(d);
}
function dealDamage(t, amt, src) {
  if (NET.guest) return;
  if (DEMOF && t.plate) return;                    // demo: structures stay pristine
  if (t.hp === undefined || t.dead) return;
  if (t.sh > 0) { const a = Math.min(t.sh, amt); t.sh -= a; amt -= a; }
  t.hp -= amt; t.hitT = time;
  if (t.kind === 'hero' && src && src.kind) { t.lastHitBy = src; t.lastHitAt = time; }
  const okNum = !t._dmgAt || time - t._dmgAt > 0.18; if (okNum) t._dmgAt = time;
  if (amt >= 1 && okNum) {
    t._dmgSlot = ((t._dmgSlot || 0) + 1) % 3;
    const dn = { kind: 'dmg', x: t.x + (t._dmgSlot - 1) * 34, y: t.y - (t.r || 20) - 26 - t._dmgSlot * 16,
      vy: -56, life: 1.15, max: 1.15, amt: Math.round(amt),
      c: (src === player) ? '255,220,120' : (t === player ? '255,110,90' : '245,248,255') };
    fxPush(dn);
    if (NET.on && !NET.guest && NET.evq.length < 120) NET.evq.push(['fx', dn]);
  }
  if (t.r !== undefined && t.kind) {                        // unit knockback
    const a = Math.atan2(t.y - (src ? src.y : t.y), t.x - (src ? src.x : t.x - 1));
    t.kbx = Math.cos(a) * 5; t.kby = Math.sin(a) * 5; t.kbT = time;
  }
  if (t.hp <= 0) kill(t, src);
}
function kill(t, src) {
  if (t.maxHp && t.range !== undefined && t.kind) {          // a unit
    if (t.dead) return;
    t.dead = true;
    boom(t);
    if (t.kind === 'hero') {
      fxPush({ kind: 'shock', x: t.x, y: t.y, life: .9, max: .9, r: 110, c: TEAM[t.team].light });
      fxPush({ kind: 'ghost', key: t.key, x: t.x, y: t.y - 10, face: t.face, life: 1.3, max: 1.3, size: 120, rise: true });
    }
    const srcHero = src && src.kind === 'hero' ? src : null;
    if (t.kind === 'minion') {
      if (srcHero && srcHero === player) gold += (t.bounty || 21);            // last-hit gold
      const near = heroes.filter(h => !h.dead && h.team !== t.team && dist(h, t) < 550);
      const xpEach = Math.round((t.xpVal || 45) / Math.max(1, near.length) * (near.length > 1 ? 1.3 : 1));
      for (const h of near) grantXp(h, xpEach);                               // XP needs presence, not last hits
    } else if (t.kind === 'monster') {
      if (srcHero) {
        grantXp(srcHero, 70); if (srcHero === player) gold += 42;
        if (t.camp && t.camp.units.every(m => m.dead)) {
          t.camp.alive = false; t.camp.respawnAt = time + 75;
          srcHero.buff = t.camp.buff; srcHero.buffT = time + 60;
          feed((srcHero === player ? 'You claim ' : 'Enemy claims ') + t.camp.buff + '.');
        }
      }
    } else if (t.kind === 'hero') {
      if (t === player) { deaths++; feed('You have fallen. Respawning…'); }
      else if (t.team === 1) {
        if (src === player) { kills++; gold += 300; feed(t.hero.name + ' slain! +300 gold'); }
        else feed(t.hero.name + ' slain by your ally.');
      } else feed('Your ally ' + t.hero.name + ' has fallen.');
      if (srcHero) grantXp(srcHero, 150 + 40 * t.level);
      t.respT = time + (DEMOF ? 1.5 : 4 + 1.5 * t.level);
      t.recallT = 0;
    } else if (t.kind === 'brood') { /* nothing */ }
  } else if (t.plate) {                                      // a tower
    boomTower(t);
    if (t.core) endGame(t.team !== 0);
    else feed(t.team === 1 ? 'Enemy tower destroyed! +150 gold' : 'Your tower has fallen.');
    if (t.team === 1) gold += 150;
    for (const h of heroes) if (h.team !== t.team) grantXp(h, 120);
  }
}

function fireAt(u, t) {
  u.face = Math.atan2(t.y - u.y, t.x - u.x);
  u.atkT = time; u.cdT = time + u.cd / (u.hasteT > time ? u.haste : 1);
  fireFx(u, t);
  if (NET.on && !NET.guest && NET.evq.length < 120) NET.evq.push(['atk', u.id, t.id]);
  const _dm = effDmg(u);
  dealDamage(t, _dm, u);
  if (u.kind === 'hero') { const ls = itemStat(u, 'ls'); if (ls > 0) u.hp = Math.min(u.maxHp, u.hp + _dm * ls); }
}
function fireFx(u, t) {
  const fac = u.key.split('_')[0];
  const lrgb = { dawnmarch: '255,233,168', vectra: '159,232,255', mawborn: '255,150,90' }[fac] || '220,235,255';
  const melee = u.range <= 80;
  const mx = u.x + Math.cos(u.face) * (u.r + 6), my = u.y + Math.sin(u.face) * (u.r + 6);
  if (!melee) {
    fxPush({ kind: 'laser', x1: mx, y1: my, x2: t.x, y2: t.y, life: .24, max: .24, c: 'rgb(' + lrgb + ')' });
    fxPush({ kind: 'mflash', x: mx, y: my, rot: u.face, life: .18, max: .18, c: lrgb, r: u.kind === 'hero' ? 18 : 12 });
    sheetFx('fx_proj_' + (fac === 'dawnmarch' ? 'lightarrow' : fac === 'vectra' ? 'ionbolt_v3' : 'emberspit'),
      { x: mx, y: my, x2: t.x, y2: t.y, dur: clamp(dist(u, t) / 1050, .16, .34), travel: true, size: u.kind === 'hero' ? 64 : 50 });
  }
  const hitKey = fac === 'dawnmarch' ? 'fx_hit_gold' : fac === 'vectra' ? 'fx_hit_cyan' : 'fx_hit_ember';
  sheetFx(hitKey, { x: t.x, y: t.y, size: u.kind === 'hero' ? 104 : 76 });
  sparks(t.x, t.y, u.face, lrgb, u.kind === 'hero' ? 1.2 : 0.8);
}
function towerFx(tw, t) {
  const lrgb = tw.team === 0 ? '255,233,168' : '255,150,90';
  fxPush({ kind: 'laser', x1: tw.x, y1: tw.y - 60, x2: t.x, y2: t.y, life: .14, max: .14, c: 'rgb(' + lrgb + ')' });
  fxPush({ kind: 'flash', x: t.x, y: t.y, life: .12, max: .12, r: 15 });
  sparks(t.x, t.y, Math.atan2(t.y - tw.y, t.x - tw.x), lrgb, 1.2);
}
function towerFire(tw, t, mul) {
  towerFx(tw, t);
  if (NET.on && !NET.guest && NET.evq.length < 120) NET.evq.push(['twr', towers.indexOf(tw), t.id]);
  tw.cdT = time + 1.1;
  dealDamage(t, Math.round(tw.dmg * (mul || 1)), tw);
}

/* ============================ fx ============================ */
function fxPush(e) { fx.push(e); if (fx.length > 200) fx.shift(); }
function sparks(x, y, ang, rgb, mag) {
  const n = Math.round(6 * mag);
  for (let i = 0; i < n; i++) {
    const a = ang + Math.PI + (Math.random() - .5) * 1.9;
    const sp = 90 + Math.random() * 240 * mag;
    fxPush({ kind: 'spk', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: .22 + Math.random() * .2, max: .42, c: rgb });
  }
  fxPush({ kind: 'flash', x, y, life: .1, max: .1, r: 13 * mag });
}
const sheetFxList = [];
function sheetFx(key, o) {
  const s = FX[key]; if (!s) return;
  if (!o.travel) { o.size = (o.size || 60) * (0.8 + Math.random() * 0.5); o.spin = (Math.random() - .5) * 1.4; }
  sheetFxList.push({ key, s, t0: time, dur: o.dur || s.n / s.fps, ...o });
  if (sheetFxList.length > 80) sheetFxList.shift();
}
function boom(u) {
  const fac = u.key.split('_')[0];
  const lrgb = { dawnmarch: '255,233,168', vectra: '159,232,255', mawborn: '255,150,90' }[fac] || '220,235,255';
  fxPush({ kind: 'flash', x: u.x, y: u.y, life: .16, max: .16, r: u.kind === 'hero' ? 40 : 22 });
  fxPush({ kind: 'shock', x: u.x, y: u.y, life: .4, max: .4, r: u.kind === 'hero' ? 70 : 44, c: lrgb });
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * TAU, sp = 110 + Math.random() * 190;
    fxPush({ kind: 'spk', x: u.x, y: u.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: .3 + Math.random() * .2, max: .5, c: lrgb });
  }
  sheetFx('fx_death_' + fac, { x: u.x, y: u.y, size: u.kind === 'hero' ? 150 : 110 });
  addShake(u.x, u.y, u.kind === 'hero' ? 8 : 2.5);
}
function boomTower(tw) {
  const lrgb = tw.team === 0 ? '255,233,168' : '255,150,90';
  fxPush({ kind: 'flash', x: tw.x, y: tw.y, life: .25, max: .25, r: 70 });
  fxPush({ kind: 'shock', x: tw.x, y: tw.y, life: .6, max: .6, r: 150, c: lrgb });
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * TAU, sp = 80 + Math.random() * 320;
    fxPush({ kind: 'spk', x: tw.x, y: tw.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: .4 + Math.random() * .4, max: .8, c: lrgb });
  }
  addShake(tw.x, tw.y, 12);
}
function addShake(x, y, mag) {
  if (!player) return;
  const d = Math.hypot(x - player.x, y - player.y);
  const m = mag * clamp(1 - d / 900, 0, 1);
  if (m > shake) { shake = m; shakeT = time; }
}

/* ============================ abilities ============================ */
function castAbility(u, i, tx, ty, force) {
  const ab = u.hero.abilities[i];
  if (!ab) return false;
  const need = ab.ult ? 6 : [1, 2, 3][i] || 1;
  if (u.dead) return false;
  if (!force && (u.level < need || time < u.abCd[i])) return false;
  if (NET.on && !NET.guest && NET.evq.length < 120) NET.evq.push(['cast', u.id, i, tx, ty]);
  u.castT = time; u.face = Math.atan2(ty - u.y, tx - u.x) || u.face;
  const l = u.level, fac = u.hero.fac;
  const lrgb = { dawnmarch: '255,233,168', vectra: '159,232,255', mawborn: '255,150,90' }[fac];
  let cdMul = (u.buff === 'WARDLIGHT' ? 0.8 : 1) * (1 - Math.min(0.4, itemStat(u, 'cdr')));
  const ang = Math.atan2(ty - u.y, tx - u.x);
  const capTo = (r) => { const d = Math.hypot(tx - u.x, ty - u.y); if (d > r) { tx = u.x + (tx - u.x) / d * r; ty = u.y + (ty - u.y) / d * r; } };
  switch (ab.type) {
    case 'bolt': {
      u.face = ang;
      fxPush({ kind: 'mflash', x: u.x, y: u.y, rot: ang, life: .2, max: .2, c: lrgb, r: 26 });
      fxPush({ kind: 'shock', x: u.x, y: u.y, life: .25, max: .25, r: 34, c: lrgb });
      sparks(u.x, u.y, ang, lrgb, 1.4);
      const proj = { x: u.x, y: u.y, ang, sp: ab.speed, left: ab.range, dmg: ab.dmg(l), team: u.team, src: u, c: lrgb };
      projectiles.push(proj);
      break;
    }
    case 'aoe': {
      capTo(ab.range);
      const X = tx, Y = ty;
      telegraphs.push({ x: X, y: Y, r: ab.radius, at: time + ab.delay, team: u.team, c: lrgb, born: time, cb: () => {
        aoeDamage(X, Y, ab.radius, ab.dmg(l), u);
        fxPush({ kind: 'column', x: X, y: Y, life: .55, max: .55, r: ab.radius * 1.1, c: lrgb });
        fxPush({ kind: 'shock', x: X, y: Y, life: .5, max: .5, r: ab.radius, c: lrgb });
        fxPush({ kind: 'flash', x: X, y: Y, life: .22, max: .22, r: ab.radius * .6 });
        fxPush({ kind: 'scorch', x: X, y: Y, life: 2.4, max: 2.4, r: ab.radius * 0.7, c: lrgb });
        sparks(X, Y, -Math.PI / 2, lrgb, 2.2);
        addShake(X, Y, 8);
      } });
      break;
    }
    case 'shield':
      u.sh = ab.amount(l); u.shT = time + ab.dur;
      if (ab.haste) { u.haste = ab.haste; u.hasteT = time + ab.dur; }
      fxPush({ kind: 'shock', x: u.x, y: u.y, life: .4, max: .4, r: 50, c: lrgb });
      fxPush({ kind: 'runes', x: u.x, y: u.y, life: ab.dur, max: ab.dur, r: 42, c: lrgb, follow: u });
      break;
    case 'haste':
      u.haste = ab.haste; u.hasteT = time + ab.dur;
      fxPush({ kind: 'shock', x: u.x, y: u.y, life: .35, max: .35, r: 44, c: lrgb });
      break;
    case 'arc': {
      u.face = ang; u.atkT = time;
      fxPush({ kind: 'crescent', x: u.x, y: u.y, life: .38, max: .38, r: ab.radius, ang: ang - 0.5, sweep: 1.4, c: lrgb });
      sheetFx('fx_ability_daybreak', { x: u.x, y: u.y, size: ab.radius * 1.6 });
      for (const t of units) if (foesOf(u)(t) && dist(u, t) < ab.radius && Math.abs(Math.atan2(Math.sin(Math.atan2(t.y - u.y, t.x - u.x) - ang), Math.cos(Math.atan2(t.y - u.y, t.x - u.x) - ang))) < 1.2)
        dealDamage(t, ab.dmg(l), u);
      for (const tw of towers) if (tw.hp > 0 && tw.team !== u.team && dist(u, tw) < ab.radius) dealDamage(tw, ab.dmg(l), u);
      addShake(u.x, u.y, 4);
      break;
    }
    case 'dash': {
      capTo(ab.range);
      const X = tx, Y = ty;
      fxPush({ kind: 'laser', x1: u.x, y1: u.y, x2: X, y2: Y, life: .2, max: .2, c: 'rgb(' + lrgb + ')' });
      for (let g2 = 1; g2 <= 3; g2++) fxPush({ kind: 'ghost', key: u.key, x: lerp(u.x, X, g2 / 4), y: lerp(u.y, Y, g2 / 4), face: u.face, life: .34, max: .34, size: 120 });
      u.x = X; u.y = Y; u.order = null; u.face = ang;
      if (ab.dmg) aoeDamage(X, Y, ab.radius, ab.dmg(l), u);
      fxPush({ kind: 'shock', x: X, y: Y, life: .35, max: .35, r: ab.radius || 80, c: lrgb });
      addShake(X, Y, 5);
      break;
    }
    case 'whirl': {
      let n = 0;
      const iv = setInterval(() => {
        if (u.dead || n >= ab.ticks) { clearInterval(iv); return; }
        n++;
        sheetFx('fx_ability_daybreak', { x: u.x, y: u.y, size: ab.radius * 1.9 });
        fxPush({ kind: 'crescent', x: u.x, y: u.y, life: .3, max: .3, r: ab.radius * 0.9, ang: n * 2.1, sweep: 2.2, c: lrgb });
        fxPush({ kind: 'shock', x: u.x, y: u.y, life: .4, max: .4, r: ab.radius, c: lrgb });
        aoeDamage(u.x, u.y, ab.radius, ab.dmg(l), u);
        addShake(u.x, u.y, 6);
      }, 500);
      break;
    }
    case 'burst': {
      const t0 = nearestEnemy(u, ab.range);
      if (!t0) return false;
      let n = 0;
      const iv = setInterval(() => {
        if (u.dead || n >= ab.shots) { clearInterval(iv); return; }
        const t = !t0.dead ? t0 : nearestEnemy(u, ab.range);
        if (t) {
          u.face = Math.atan2(t.y - u.y, t.x - u.x);
          fxPush({ kind: 'laser', x1: u.x, y1: u.y, x2: t.x, y2: t.y, life: .1, max: .1, c: 'rgb(' + lrgb + ')' });
          fxPush({ kind: 'mflash', x: u.x, y: u.y, rot: u.face, life: .09, max: .09, c: lrgb, r: 14 });
          sparks(t.x, t.y, u.face, lrgb, 1);
          dealDamage(t, ab.dmg(l), u);
        }
        n++;
      }, 200);
      break;
    }
    case 'spawn': {
      if (DEMOF) return false;                 // demo: broodling piles read as a lattice
      for (let i2 = 0; i2 < ab.count; i2++) {
        const b = mkUnit(u.team, 'mawborn_imp', u.x + (Math.random() - .5) * 60, u.y + (Math.random() - .5) * 60,
          { hp: 110 + 25 * l, dmg: 18 + 5 * l, range: 60, speed: 165, r: 10, cd: 0.9 }, 'brood');
        b.dieAt = time + ab.life;
        units.push(b);
      }
      fxPush({ kind: 'shock', x: u.x, y: u.y, life: .4, max: .4, r: 60, c: lrgb });
      fxPush({ kind: 'scorch', x: u.x, y: u.y, life: 1.6, max: 1.6, r: 55, c: lrgb });
      sparks(u.x, u.y, -Math.PI / 2, lrgb, 2);
      break;
    }
    case 'beam': {
      u.face = ang;
      beams.push({ x: u.x, y: u.y, ang, len: ab.range, w: ab.width, t0: time, dur: .5, c: 'rgb(' + lrgb + ')' });
      sheetFx('fx_ability_finallight', { x: u.x, y: u.y, size: 140 });
      const ex = u.x + Math.cos(ang) * ab.range, ey = u.y + Math.sin(ang) * ab.range;
      sparks(ex, ey, ang, lrgb, 1.8);
      fxPush({ kind: 'shock', x: ex, y: ey, life: .35, max: .35, r: 46, c: lrgb });
      for (const t of units) {
        if (!foesOf(u)(t)) continue;
        const dx = t.x - u.x, dy = t.y - u.y;
        const proj = dx * Math.cos(ang) + dy * Math.sin(ang);
        if (proj < 0 || proj > ab.range) continue;
        const off = Math.abs(-dx * Math.sin(ang) + dy * Math.cos(ang));
        if (off < ab.width) dealDamage(t, ab.dmg(l), u);
      }
      for (const tw of towers) {
        if (tw.hp <= 0 || tw.team === u.team) continue;
        const dx = tw.x - u.x, dy = tw.y - u.y;
        const proj = dx * Math.cos(ang) + dy * Math.sin(ang);
        if (proj > 0 && proj < ab.range && Math.abs(-dx * Math.sin(ang) + dy * Math.cos(ang)) < ab.width + tw.r) dealDamage(tw, ab.dmg(l), u);
      }
      addShake(u.x, u.y, 8);
      break;
    }
    case 'nuke': {
      capTo(ab.range);
      const X = tx, Y = ty;
      feed(u === player ? 'ORBITAL BRIMSTONE inbound…' : '⚠ ENEMY NUKE INBOUND — MOVE!');
      fxPush({ kind: 'meteor', x: X, y: Y, life: ab.delay, max: ab.delay });
      telegraphs.push({ x: X, y: Y, r: ab.radius, at: time + ab.delay, team: u.team, c: lrgb, born: time, nuke: true, cb: () => {
        aoeDamage(X, Y, ab.radius, ab.dmg(l), u);
        fxPush({ kind: 'column', x: X, y: Y, life: .7, max: .7, r: ab.radius * 1.2, c: '255,170,80' });
        fxPush({ kind: 'scorch', x: X, y: Y, life: 4, max: 4, r: ab.radius * 0.85, c: '255,140,60' });
        for (const tw of towers) if (tw.hp > 0 && tw.team !== u.team && dist({ x: X, y: Y }, tw) < ab.radius) dealDamage(tw, Math.round(ab.dmg(l) * .5), u);
        fxPush({ kind: 'flash', x: X, y: Y, life: .4, max: .4, r: ab.radius });
        fxPush({ kind: 'shock', x: X, y: Y, life: .8, max: .8, r: ab.radius * 1.25, c: lrgb });
        for (let i2 = 0; i2 < 26; i2++) {
          const a = Math.random() * TAU, sp = 120 + Math.random() * 420;
          fxPush({ kind: 'spk', x: X, y: Y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, life: .4 + Math.random() * .5, max: .9, c: lrgb });
        }
        sheetFx('fx_death_mawborn', { x: X, y: Y, size: ab.radius * 1.7 });
        addShake(X, Y, 16);
      } });
      break;
    }
    case 'barrage': {
      capTo(ab.range);
      const X = tx, Y = ty;
      for (let s2 = 0; s2 < ab.shells; s2++) {
        const dx2 = (Math.random() - .5) * ab.radius * 1.6, dy2 = (Math.random() - .5) * ab.radius * 1.2;
        telegraphs.push({ x: X + dx2, y: Y + dy2, r: 80, at: time + .5 + s2 * .3, team: u.team, c: lrgb, born: time + s2 * .3, cb: (function (bx, by) { return () => {
          aoeDamage(bx, by, 85, ab.dmg(l), u);
          for (const tw of towers) if (tw.hp > 0 && tw.team !== u.team && dist({ x: bx, y: by }, tw) < 90) dealDamage(tw, Math.round(ab.dmg(l) * .6), u);
          sheetFx('fx_death_vectra', { x: bx, y: by, size: 120 });
          fxPush({ kind: 'shock', x: bx, y: by, life: .4, max: .4, r: 85, c: lrgb });
          addShake(bx, by, 7);
        }; })(X + dx2, Y + dy2) });
      }
      break;
    }
  }
  u.abCd[i] = time + ab.cd * cdMul;
  return true;
}
function aoeDamage(x, y, r, dmg, src) {
  for (const t of units) if (foesOf(src)(t) && Math.hypot(t.x - x, t.y - y) < r + t.r) dealDamage(t, dmg, src);
}
const projectiles = [];

/* ============================ sim ============================ */
function stepUnit(u, dt) {
  if (u.dead) return;
  if (u.dieAt && time > u.dieAt) { u.dead = true; boom(u); return; }
  if (u.shT && time > u.shT) u.sh = 0;
  if (u.hasteT && time < u.hasteT === false) u.haste = 1;
  const sp = (u.speed + (u.kind === 'hero' ? itemStat(u, 'ms') : 0)) * (u.hasteT > time ? u.haste : 1) * (u.recallT ? 0 : 1);
  if (u.kind === 'monster') {                                // leashed camp
    const t = heroes.find(h => !h.dead && dist(u, h) < 260) || null;
    if (t && dist(u, t.camp ? t : t) < 420) {
      if (dist(u, t) > u.range) moveToward(u, t.x, t.y, sp, dt);
      else if (time >= u.cdT) fireAt(u, t);
    } else if (dist(u, u.home) > 20) { moveToward(u, u.home.x, u.home.y, sp, dt); u.hp = Math.min(u.maxHp, u.hp + 40 * dt); }
    return;
  }
  // heroes + minions + brood
  let t = u.target && !u.target.dead && (u.target.hp === undefined || u.target.hp > 0) ? u.target : null;
  if (u.kind !== 'hero') {
    /* League acquisition order: (1) enemy hero attacking a nearby ally hero
     * (call-for-help), (2) nearest enemy minion, (3) nearest enemy hero.
     * Targets are STICKY and re-evaluated on a timer, not per frame. */
    if (u.kind === 'minion' && t && time < (u.aggroT || 0)) {
      // keep the held target
    } else if (u.kind === 'minion') {
      u.aggroT = time + 1.5;
      let pick = null;
      for (const h of heroes) {
        if (h.dead || h.team !== u.team) continue;
        if (dist(u, h) < 450 && h.lastHitBy && !h.lastHitBy.dead && h.lastHitBy.kind === 'hero' && time - (h.lastHitAt || -9) < 3 && dist(u, h.lastHitBy) < 500) { pick = h.lastHitBy; break; }
      }
      if (!pick) { let bd2 = u.kind === 'brood' ? 420 : 300; for (const e2 of units) { if (e2.dead || e2.team === u.team || e2.team === 2 || e2.kind === 'hero') continue; const d2 = dist(u, e2); if (d2 < bd2) { bd2 = d2; pick = e2; } } }
      if (!pick) pick = nearestEnemy(u, 300);
      t = pick; u.target = pick;
    } else t = nearestEnemy(u, 420);
    const tw = nearestTower(u, 260);
    if (!t && tw) { // hit towers
      if (dist(u, tw) > u.range + tw.r) moveToward(u, tw.x, tw.y, sp, dt);
      else if (time >= u.cdT) { u.atkT = time; u.cdT = time + u.cd; towerHit(u, tw); }
      return;
    }
  }
  if (t && t.hp !== undefined && t.plate) {                  // tower target
    if (dist(u, t) > u.range + t.r) moveToward(u, t.x, t.y, sp, dt);
    else if (time >= u.cdT) { u.atkT = time; u.cdT = time + u.cd; towerHit(u, t); }
    return;
  }
  if (t) {
    if (dist(u, t) > u.range) moveToward(u, t.x, t.y, sp, dt);
    else if (time >= u.cdT) fireAt(u, t);
    return;
  }
  if (u.order) {
    if (moveToward(u, u.order.x, u.order.y, sp, dt)) {
      if (u.path && u.wp < u.path.length - 1) { u.wp++; u.order = { ...u.path[u.wp] }; }
      else u.order = null;
    }
    if (u.kind !== 'hero') {
      const e = nearestEnemy(u, 260);
      if (e) u.target = e;
    }
  } else if (u.kind !== 'hero') {
    const e = nearestEnemy(u, 300);
    if (e) u.target = e;
    else if (u.path) u.order = { ...u.path[u.wp] };   // resume the lane after a fight
  }
}
function towerHit(u, tw) {
  if (u.role === 'siege') { dealDamage(tw, effDmg(u), u); }   // siege: double damage to towers
  const fac = u.key.split('_')[0];
  const lrgb = { dawnmarch: '255,233,168', vectra: '159,232,255', mawborn: '255,150,90' }[fac] || '220,235,255';
  u.face = Math.atan2(tw.y - u.y, tw.x - u.x);
  fxPush({ kind: 'laser', x1: u.x, y1: u.y, x2: tw.x, y2: tw.y - 30, life: .1, max: .1, c: 'rgb(' + lrgb + ')' });
  sparks(tw.x, tw.y - 30, u.face, lrgb, .8);
  dealDamage(tw, effDmg(u), u);
}
function moveToward(u, x, y, sp, dt) {
  const d = Math.hypot(x - u.x, y - u.y);
  if (d < 6) return true;
  u.face = Math.atan2(y - u.y, x - u.x);
  u.moving = true;
  u.x += (x - u.x) / d * sp * dt;
  u.y += (y - u.y) / d * sp * dt;
  u.x = clamp(u.x, 20, WORLD.w - 20); u.y = clamp(u.y, 20, WORLD.h - 20);
  return false;
}
function separation() {
  for (let i = 0; i < units.length; i++) {
    const a = units[i]; if (a.dead) continue;
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j]; if (b.dead) continue;
      let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      const min = a.r + b.r + 6;
      if (d < min) {
        if (d < .01) { dx = 1; dy = 0; d = 1; }
        const push = (min - d) / 2;
        a.x -= dx / d * push; a.y -= dy / d * push;
        b.x += dx / d * push; b.y += dy / d * push;
      }
    }
  }
}
function towersThink(dt) {
  for (const tw of towers) {
    if (tw.hp <= 0) continue;
    // League protection rule: an enemy hero who damages an allied hero in range
    // draws tower aggro and KEEPS it until leaving range or dying.
    for (const h of heroes) {
      if (h.dead || h.team !== tw.team || dist(tw, h) > tw.range) continue;
      const a = h.lastHitBy;
      if (a && !a.dead && a.kind === 'hero' && time - (h.lastHitAt || -9) < 0.6 && dist(tw, a) < tw.range) { tw.hold = a; tw.heat = 0; }
    }
    if (tw.hold && (tw.hold.dead || dist(tw, tw.hold) > tw.range)) { tw.hold = null; tw.heat = 0; }
    if (time < tw.cdT) continue;
    let pick = tw.hold || null;
    if (!pick) {
      // priority: siege > melee > caster > hero, nearest within class
      let bestScore = -1, bd = 1e9;
      for (const t of units) {
        if (t.dead || t.team === tw.team || t.team === 2) continue;
        const d = dist(tw, t);
        if (d > tw.range) continue;
        const score = t.kind === 'hero' ? 0 : t.role === 'siege' ? 3 : t.role === 'caster' ? 1 : 2;
        if (score > bestScore || (score === bestScore && d < bd)) { bestScore = score; bd = d; pick = t; }
      }
    }
    if (pick) {
      // heat ramp: consecutive shots on a hero hit ~37.5% harder, twice
      if (pick.kind === 'hero') { tw.heat = Math.min(2, (tw.lastT === pick ? (tw.heat || 0) : 0) + (tw.lastT === pick ? 1 : 0)); }
      else tw.heat = 0;
      tw.lastT = pick;
      const mul = pick.kind === 'hero' ? 1 + 0.375 * (tw.heat || 0) : 1;
      towerFire(tw, pick, mul);
    }
  }
}
function coreOf(team) { return towers.find(t => t.core && t.team === team); }
function heroesThink(dt) {
  // player recall
  for (const h of heroes) {
    if (h.recallT && time >= h.recallT && !h.dead) {
      h.recallT = 0;
      const c = coreOf(h.team); h.x = c.x + (h.team === 0 ? 90 : -90); h.y = c.y; h.order = null;
      fxPush({ kind: 'shock', x: h.x, y: h.y, life: .5, max: .5, r: 60, c: '255,233,168' });
    }
  }
  // respawn + regen — every hero on the field
  for (const h of heroes) {
    if (h.dead && time >= h.respT) {
      h.dead = false; h.hp = h.maxHp;
      const c = coreOf(h.team);
      if (DEMOF) { h.x = ALTAR.x + (h.team === 0 ? -1 : 1) * (250 + Math.random() * 80); h.y = ALTAR.y + (Math.random() - .5) * 260; }
      else { h.x = c.x + (h.team === 0 ? 90 : -90); h.y = c.y + (Math.random() - .5) * 80; }
      h.order = null; h.target = null;
      fxPush({ kind: 'shock', x: h.x, y: h.y, life: .5, max: .5, r: 70, c: TEAM[h.team].light });
    }
    if (!h.dead) {
      const nearCore = dist(h, coreOf(h.team)) < 320;
      const inCombat = time - (h.hitT || -9) < 6;
      const regen = nearCore ? h.maxHp * .06 : (h.buff === 'WARDLIGHT' ? 8 : (inCombat ? 1.6 : h.maxHp * 0.008));
      h.hp = Math.min(h.maxHp, h.hp + regen * dt);
      if (h.buffT && time > h.buffT) h.buff = null;
    }
  }
  // AI brain for every non-player hero
  for (const e of heroes) {
    if ((e === player && !DEMOF) || e.dead) continue;   // demo drives the player too
    if (e.human && e !== player) continue;               // a guest commands this hero
    if (time < (e.aiT || 0)) continue;
    e.aiT = time + 0.5;
    const home = coreOf(e.team);
    if (!DEMOF && !e.human && e !== player && atShop(e) && Math.random() < 0.3) {
      e.aiGold = (e.aiGold || 0) + 60 + time * 0.4;
      const buyable = ITEMS.filter(i => i.cost <= e.aiGold && (e.items || []).length < 6);
      if (buyable.length) { const it = buyable[buyable.length - 1]; e.aiGold -= it.cost; buyItem(e, it.id) || (e.items = e.items || [], e.items.push(it.id), heroStat(e)); }
    }
    const low = !DEMOF && e.hp < e.maxHp * 0.32;
    if (low) { e.target = null; e.order = { x: home.x + (e.team === 0 ? 90 : -90), y: home.y }; continue; }
    const foeHero = heroes.find(h => !h.dead && h.team !== e.team && dist(e, h) < 520);
    const m = nearestEnemy(e, 460);
    if (foeHero && e.level >= 6 && time >= e.abCd[3]) castAbility(e, 3, foeHero.x, foeHero.y);
    else if (foeHero && time >= e.abCd[0]) castAbility(e, 0, foeHero.x, foeHero.y);
    else if (m && time >= e.abCd[1] && e.level >= 2) castAbility(e, 1, m.x, m.y);
    else if (e.hp < e.maxHp * .6 && time >= e.abCd[2] && e.level >= 3) castAbility(e, 2, e.x, e.y);
    if (foeHero && foeHero.hp < foeHero.maxHp * .5) { e.target = foeHero; continue; }
    if (m) { e.target = m; continue; }
    e.target = null;
    if (DEMOF) { e.order = { x: ALTAR.x + (Math.random() - .5) * 380, y: ALTAR.y + (Math.random() - .5) * 300 }; continue; }
    // jungler contests the altar when it's hot; laners walk their lane
    if (e.lane === 2 && ALTAR.owner !== e.team && time > ALTAR.lockT) {
      e.order = { x: ALTAR.x + (Math.random() - .5) * 40, y: ALTAR.y + (Math.random() - .5) * 40 };
    } else {
      const lane = e.lane === 2 ? (Math.random() < .5 ? 0 : 1) : e.lane;
      const y = LANES[lane];
      const dir = e.team === 0 ? 1 : -1;
      let tx = clamp(e.x + dir * 260, 420, WORLD.w - 420);
      // walk WITH the wave: never push far past your own minion frontline —
      // an uncapped AI sprinted to the enemy tower before wave one arrived
      let front = e.team === 0 ? 480 : WORLD.w - 480;
      for (const m2 of units) {
        if (m2.dead || m2.kind !== 'minion' || m2.team !== e.team) continue;
        front = e.team === 0 ? Math.max(front, m2.x) : Math.min(front, m2.x);
      }
      tx = e.team === 0 ? Math.min(tx, front + 160) : Math.max(tx, front - 160);
      e.order = { x: tx, y: y + (Math.random() - .5) * 90 };
    }
    // don't tank towers without minion cover
    const twD = nearestTower(e, 340);
    if (twD && !units.some(m2 => !m2.dead && m2.team === e.team && m2.kind === 'minion' && dist(m2, twD) < 300)) {
      e.target = null; e.order = { x: e.x + (e.team === 0 ? -220 : 220), y: e.y };
    }
  }
  // the ALTAR: one team's heroes alone inside the ring make capture progress
  if (time > ALTAR.lockT) {
    const inside = [0, 0];
    for (const h of heroes) if (!h.dead && Math.hypot(h.x - ALTAR.x, h.y - ALTAR.y) < ALTAR.r) inside[h.team]++;
    if (inside[0] > 0 !== inside[1] > 0) {
      const team = inside[0] > 0 ? 0 : 1;
      ALTAR.prog += dt / 2.5 * (ALTAR.capTeam === team ? 1 : -1);
      if (ALTAR.capTeam !== team && ALTAR.prog <= 0) { ALTAR.capTeam = team; ALTAR.prog = 0; }
      if (ALTAR.prog >= 1) {
        ALTAR.prog = 0; ALTAR.owner = team; ALTAR.lockT = time + 90;
        for (const h of heroes) if (h.team === team) { h.buff = 'EMBERBRAND'; h.buffT = time + 45; }
        if (team === 0) gold += 80;
        feed(team === 0 ? '⚑ Your team claims the ALTAR — team EMBERBRAND!' : '⚑ Enemy team claims the ALTAR.');
        fxPush({ kind: 'shock', x: ALTAR.x, y: ALTAR.y, life: .8, max: .8, r: 130, c: TEAM[team].light });
      }
    } else ALTAR.prog = Math.max(0, ALTAR.prog - dt / 4);
  }
}

/* ============================ input ============================ */
const keys = {};
let mouse = { x: 0, y: 0 };
function worldXY(ev) {
  const r = cv.getBoundingClientRect();
  const sx = (ev.clientX - r.left), sy = (ev.clientY - r.top);
  return { x: camX + sx / ZOOM, y: camY + sy / ZOOM };
}
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  if (!started || over || !player || player.dead) return;
  const w = worldXY(e);
  const isMove = e.button === 2 || e.pointerType === 'touch';
  if (isMove || e.button === 2) {
    orderPlayer(w.x, w.y);
  } else if (e.button === 0) {
    // left click: also issue move on touch-like simplicity
    orderPlayer(w.x, w.y);
  }
});
cv.addEventListener('pointermove', e => { const w = worldXY(e); mouse = w; });
function orderPlayer(x, y) {
  if (NET.guest) netSend({ t: 'order', x: Math.round(x), y: Math.round(y) });
  orderFor(player, x, y);
}
function orderFor(player, x, y) {
  // attack if clicking near an enemy
  let best = null, bd = 60;
  for (const t of units) {
    if (t.dead || t.team === player.team || !isVisible(t)) continue;
    const d = Math.hypot(t.x - x, t.y - y);
    if (d < bd) { bd = d; best = t; }
  }
  let bt = null;
  for (const tw of towers) {
    if (tw.hp <= 0 || tw.team === player.team) continue;
    if (Math.hypot(tw.x - x, tw.y - y) < 80) bt = tw;
  }
  player.recallT = 0;
  if (best) { player.target = best; player.order = null; }
  else if (bt) { player.target = bt; player.order = null; }
  else { player.target = null; player.order = { x, y }; }
  fxPush({ kind: 'ping', x, y, life: .5, max: .5, c: best || bt ? '255,90,90' : '140,255,140' });
}
addEventListener('keydown', e => {
  if (!started || over || !player) return;
  const k = e.key.toLowerCase();
  if (k === 'q') tryCast(0, mouse.x, mouse.y);
  else if (k === 'w') tryCast(1, mouse.x, mouse.y);
  else if (k === 'e') tryCast(2, mouse.x, mouse.y);
  else if (k === 'r') tryCast(3, mouse.x, mouse.y);
  else if (k === 'b' && !player.dead && !player.recallT) {
    if (NET.guest) { netSend({ t: 'recall' }); feed('Recalling…'); }
    else { player.recallT = time + 4; feed('Recalling…'); }
  }
  else if (k === 's') { if (NET.guest) netSend({ t: 'stop' }); player.order = null; player.target = null; }
  else if (k === 'p' && !NET.guest) { const sh = $('shop'); if (sh && atShop(player)) { sh.classList.toggle('hidden'); if (!sh.classList.contains('hidden')) paintShop(); } }
});

/* mobile ability buttons cast at nearest enemy / self */
function bindBar() {
  const bar = $('bar'); bar.innerHTML = '';
  player.hero.abilities.forEach((ab, i) => {
    const d = document.createElement('div');
    d.className = 'ab' + (ab.ult ? ' ult' : '');
    d.style.backgroundImage = 'linear-gradient(180deg, rgba(8,11,16,.05) 45%, rgba(8,11,16,.82)), url(assets/icons/' + player.hkey + '_' + i + '.jpg)';
    d.style.backgroundSize = 'cover'; d.style.backgroundPosition = 'center';
    d.innerHTML = `<span class="k">${ab.k}</span><span class="n">${ab.name}</span><div class="cd hidden"></div>`;
    d.addEventListener('pointerdown', e => {
      e.stopPropagation();
      let tx = mouse.x, ty = mouse.y;
      const near = nearestEnemy(player, 700);
      if ((e.pointerType === 'touch' || (mouse.x === 0 && mouse.y === 0)) && near) { tx = near.x; ty = near.y; }
      tryCast(i, tx, ty);
    });
    bar.appendChild(d);
  });
}
function paintBar() {
  if (!player) return;
  const kids = $('bar').children;
  player.hero.abilities.forEach((ab, i) => {
    const el = kids[i]; if (!el) return;
    const cdel = el.querySelector('.cd');
    const need = ab.ult ? 6 : [1, 2, 3][i] || 1;
    if (player.level < need) { cdel.classList.remove('hidden'); cdel.textContent = 'L' + need; }
    else {
      const left = player.abCd[i] - time;
      if (left > 0) {
        cdel.classList.remove('hidden'); cdel.textContent = Math.max(1, Math.ceil(left));
        const ic1 = el.querySelector('.ic'); if (ic1) ic1.style.opacity = '0.22';
        const pct = Math.max(0, Math.min(100, left / ab.cd * 100));
        cdel.style.background = 'conic-gradient(rgba(5,7,10,.88) ' + pct + '%, rgba(5,7,10,.25) ' + pct + '%)';
      }
      else {
        cdel.classList.add('hidden');
        const ic2 = el.querySelector('.ic'); if (ic2) ic2.style.opacity = '1';
        if (ab.ult) el.classList.add('ready-ult');
      }
      if (ab.ult && left > 0) el.classList.remove('ready-ult');
    }
  });
}

/* ============================ feed / hud ============================ */
function feed(t) {
  if (NET.on && !NET.guest && /ALTAR|slain/.test(t) && NET.evq.length < 120) NET.evq.push(['feed', t]);
  const f = $('feed');
  if (feed._last === t && time - (feed._lastAt || 0) < 3) return;
  feed._last = t; feed._lastAt = time;
  const d = document.createElement('div');
  d.textContent = t;
  if (/Your ally|You /.test(t)) d.className = 't0';
  else if (/Enemy|slain by your ally/.test(t)) d.className = 't1';
  if (/gold|ALTAR/.test(t)) d.className += ' gold';
  f.appendChild(d);
  while (f.children.length > 3) f.removeChild(f.firstChild);
  setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, DEMOF ? 3000 : 6000);
}
function paintShop() {
  const sh = $('shop'); if (!sh) return;
  const grid = $('shopGrid'); grid.innerHTML = '';
  for (const it of ITEMS) {
    const d = document.createElement('button');
    d.className = 'shopIt' + (gold >= it.cost ? '' : ' poor');
    d.innerHTML = '<span class="si">' + it.ic + '</span><span class="sn">' + it.n + '</span><span class="sd">' + it.d + '</span><span class="sc">' + it.cost + 'g</span>';
    d.addEventListener('click', () => buyItem(player, it.id));
    grid.appendChild(d);
  }
  const inv = $('shopInv'); inv.innerHTML = '';
  (player.items || []).forEach((id, i) => {
    const it = ITEMS.find(x => x.id === id);
    const d = document.createElement('button');
    d.className = 'shopIt own';
    d.title = 'Sell for ' + Math.round(it.cost * 0.7) + 'g';
    d.innerHTML = '<span class="si">' + it.ic + '</span><span class="sn">' + it.n + '</span><span class="sc">sell ' + Math.round(it.cost * 0.7) + 'g</span>';
    d.addEventListener('click', () => sellItem(player, i));
    inv.appendChild(d);
  });
  $('shopGold').textContent = gold + 'g';
}
function paintHud() {
  if (!player) return;
  if (time > 10 && Math.floor(time) !== paintHud._gs) { paintHud._gs = Math.floor(time); gold += DEMOF ? 2 : 3; }
  $('tGold').textContent = gold;
  $('tLvl').textContent = player.level;
  $('plvl').textContent = player.level;
  $('deathveil').style.opacity = player.dead ? '1' : '0';
  $('tKD').textContent = kills + '/' + deaths;
  const m = Math.floor(time / 60), s = Math.floor(time % 60);
  $('tClock').textContent = m + ':' + (s < 10 ? '0' : '') + s;
  $('hpin').style.width = player.dead ? '0%' : clamp(player.hp / player.maxHp * 100, 0, 100) + '%';
  $('portrait').style.filter = player.dead ? 'grayscale(1) brightness(0.6)' : '';
  $('hpin').style.background = player.hp / player.maxHp > .5 ? 'linear-gradient(180deg,#7fe08a,#3f9e4c)'
    : player.hp / player.maxHp > .25 ? 'linear-gradient(180deg,#ffd98a,#c99022)' : 'linear-gradient(180deg,#ff8a7a,#b23428)';
  $('lbHp').textContent = (player.dead ? 0 : Math.max(0, Math.round(player.hp))) + '/' + player.maxHp + (player.sh > 0 ? ' (+' + Math.round(player.sh) + ')' : '');
  $('lbBuff').textContent = (player.buff ? player.buff + ' ' : '') + (player.recallT ? 'RECALLING ' + Math.ceil(player.recallT - time) : '');
  $('xpin').style.width = (player.level >= 9 ? 100 : player.xp / xpNeed(player.level) * 100) + '%';
  const shopBtn = $('bShop');
  if (shopBtn) shopBtn.style.display = !NET.guest && atShop(player) && !player.dead ? 'inline-flex' : 'none';
  if ($('shop') && !$('shop').classList.contains('hidden') && (!atShop(player) || player.dead)) $('shop').classList.add('hidden');
  $('statAD').textContent = effDmg(player); $('statMS').textContent = Math.round(player.speed * (player.hasteT > time ? player.haste : 1)); $('statGD').textContent = gold;
  const strip = $('itemStrip');
  if (strip) {
    const ids = (player.items || []).join(',');
    if (strip._ids !== ids) {
      strip._ids = ids; strip.innerHTML = '';
      for (const id of (player.items || [])) { const it = ITEMS.find(x => x.id === id); const sp2 = document.createElement('span'); sp2.className = 'itc'; sp2.title = it.n + ' — ' + it.d; sp2.textContent = it.ic; strip.appendChild(sp2); }
    }
  }
  paintBar();
}

/* ============================ ground ============================ */
let ground = null;
function buildGround() {
  /* Tiled, painted ground (the R1 panel called the old procedural blobs a
   * graybox). HALCYON tile art, graded to dusk: meadowstone base multiplied
   * toward cold blue, dirt-stone lanes with feathered edges, darker jungle
   * with dead trees and rocks, a crystal altar centerpiece, cratered camp
   * clearings, rock-lined map edges. Deterministic placement (seeded). */
  ground = document.createElement('canvas');
  const S = 0.85;
  ground.width = WORLD.w * S; ground.height = WORLD.h * S;
  const g = ground.getContext('2d');
  g.scale(S, S);
  let seed = 1337;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const T = 512;
  // 1. base: ONE cohesive painted map (R4 panel: tile compositing reads as
  // photobash) + a whisper of tile texture for close-up grain
  if (TILES.painting) g.drawImage(TILES.painting, 0, 0, WORLD.w, WORLD.h);
  else if (TILES.meadow) for (let y = 0; y < WORLD.h; y += T) for (let x = 0; x < WORLD.w; x += T) g.drawImage(TILES.meadow, x, y, T, T);
  if (TILES.painting && TILES.meadow) {
    g.save(); g.globalAlpha = 0.2; g.globalCompositeOperation = 'overlay';
    for (let y = 0; y < WORLD.h; y += T) for (let x = 0; x < WORLD.w; x += T) g.drawImage(TILES.meadow, x, y, T, T);
    g.restore();
  }
  // dusk grade: gentle cool multiply
  g.globalCompositeOperation = 'multiply';
  const gr = g.createLinearGradient(0, 0, WORLD.w, 0);
  gr.addColorStop(0, '#aab3c8'); gr.addColorStop(0.55, '#a2aabc'); gr.addColorStop(1, '#b8a294');
  g.fillStyle = gr; g.fillRect(0, 0, WORLD.w, WORLD.h);
  g.globalCompositeOperation = 'source-over';
  // 2. jungle bands: darker + mottled
  for (const [y0, y1] of [[0, 440], [MID_Y - 240 > 460 ? 0 : 0, 0]]) { /* top handled below */ }
  const darkBand = (yTop, yBot, a) => {
    const gg = g.createLinearGradient(0, yTop - 90, 0, yTop + 40);
    // feathered top edge
    const g2 = g.createLinearGradient(0, yTop - 60, 0, yBot + 60);
    g2.addColorStop(0, 'rgba(10,14,22,0)');
    g2.addColorStop(Math.min(0.25, 120 / (yBot - yTop + 120)), 'rgba(10,14,22,' + a + ')');
    g2.addColorStop(1 - Math.min(0.25, 120 / (yBot - yTop + 120)), 'rgba(10,14,22,' + a + ')');
    g2.addColorStop(1, 'rgba(10,14,22,0)');
    g.fillStyle = g2; g.fillRect(0, yTop - 60, WORLD.w, yBot - yTop + 120);
  };
  if (!TILES.painting) { darkBand(0, LANES[0] - 150, 0.34); darkBand(LANES[0] + 150, LANES[1] - 150, 0.30); darkBand(LANES[1] + 150, WORLD.h, 0.34); }
  // un-darken the base plazas
  g.save(); g.globalCompositeOperation = 'destination-out';
  for (const bx of [120, WORLD.w - 640]) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(bx, MID_Y - 260, 520, 520); }
  g.restore();
  // 3. lanes: dirt-stone road with feathered edges
  const lane = (y) => {
    if (!TILES.dirt) return;
    const band = document.createElement('canvas'); band.width = WORLD.w * S; band.height = 240 * S;
    const bg = band.getContext('2d'); bg.scale(S, S);
    for (let x = 0; x < WORLD.w; x += T) bg.drawImage(TILES.dirt, x, -rnd() * 200, T, T), bg.drawImage(TILES.dirt, x, 100, T, T);
    bg.globalCompositeOperation = 'destination-in';
    const fg = bg.createLinearGradient(0, 0, 0, 240);
    fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(0.22, 'rgba(0,0,0,1)'); fg.addColorStop(0.78, 'rgba(0,0,0,1)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
    bg.fillStyle = fg; bg.fillRect(0, 0, WORLD.w, 240);
    g.drawImage(band, 0, 0, band.width, band.height, 0, y - 120, WORLD.w, 240);
    g.globalCompositeOperation = 'multiply';
    const lg2 = g.createLinearGradient(0, y - 150, 0, y + 150);
    lg2.addColorStop(0, 'rgba(255,255,255,1)'); lg2.addColorStop(0.3, 'rgba(190,180,190,0.9)');
    lg2.addColorStop(0.7, 'rgba(190,180,190,0.9)'); lg2.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = lg2; g.fillRect(0, y - 150, WORLD.w, 300);
    g.globalCompositeOperation = 'source-over';
  };
  if (!TILES.painting) for (const y of LANES) lane(y);
  // base plaza roads
  if (!TILES.painting && TILES.dirt) for (const bx of [120, WORLD.w - 640]) {
    for (let y = MID_Y - 240; y < MID_Y + 240; y += T) for (let x = bx; x < bx + 520; x += T)
      g.drawImage(TILES.dirt, x, y, Math.min(T, bx + 520 - x), Math.min(T, MID_Y + 240 - y));
  }
  // 4. altar: cratered clearing + crystal centerpiece + emissive glow
  if (!TILES.painting && TILES.cratered) { g.save(); g.beginPath(); g.ellipse(ALTAR.x, ALTAR.y, 220, 155, 0, 0, TAU); g.clip(); g.globalAlpha = 0.7; g.translate(ALTAR.x, ALTAR.y); g.rotate(1.2); g.drawImage(TILES.cratered, -300, -300, 600, 600); g.restore(); g.globalAlpha = 1; }
  const ag = g.createRadialGradient(ALTAR.x, ALTAR.y, 20, ALTAR.x, ALTAR.y, 260);
  ag.addColorStop(0, 'rgba(150,220,255,0.30)'); ag.addColorStop(1, 'rgba(150,220,255,0)');
  g.fillStyle = ag; g.fillRect(ALTAR.x - 260, ALTAR.y - 260, 520, 520);
  if (TILES.crystal_rich) g.drawImage(TILES.crystal_rich, ALTAR.x - 90, ALTAR.y - 150, 180, 180);
  // 5. camp clearings
  for (const c of JUNGLE) {
    if (!TILES.painting && TILES.cratered) { g.save(); g.beginPath(); g.ellipse(c.x, c.y, 130, 90, 0, 0, TAU); g.clip(); g.globalAlpha = 0.55; g.translate(c.x, c.y); g.rotate(rnd() * TAU); const cs = 380 + rnd() * 200; g.drawImage(TILES.cratered, -cs / 2, -cs / 2, cs, cs); g.restore(); g.globalAlpha = 1; }
    if (c.big && TILES.bones && !TILES.painting) { g.save(); g.translate(c.x + 165, c.y - 75); if (c.y < MID_Y) g.scale(-1, 1); g.rotate((rnd() - .5) * .3); const bs = 140 + rnd() * 30; g.drawImage(TILES.bones, -bs / 2, -bs / 2, bs, bs); g.restore(); }
  }
  // 6. doodads: trees + rocks in the jungle, ruins accents, rock-lined edges
  const put = (img, x, y, s2) => {
    if (!img) return;
    g.save(); g.translate(x, y - s2 / 2);
    if (rnd() < 0.5) g.scale(-1, 1);
    g.rotate((rnd() - 0.5) * 0.16);
    const sc = 0.85 + rnd() * 0.35;
    g.drawImage(img, -s2 * sc / 2, -s2 * sc / 2, s2 * sc, s2 * sc);
    g.restore();
  };
  const DOODS = TILES.painting ? 10 : 46;
  for (let i = 0; i < DOODS; i++) {
    const x = 200 + rnd() * (WORLD.w - 400);
    const zone = rnd();
    let y;
    if (zone < 0.36) y = 90 + rnd() * (LANES[0] - 280);
    else if (zone < 0.72) y = LANES[0] + 210 + rnd() * (LANES[1] - LANES[0] - 420);
    else y = LANES[1] + 210 + rnd() * (WORLD.h - LANES[1] - 300);
    if (Math.abs(x - ALTAR.x) < 320 && Math.abs(y - ALTAR.y) < 260) continue;
    if (Math.abs(y - MID_Y) < 280 && (x < 700 || x > WORLD.w - 700)) continue;
    put(rnd() < 0.62 ? TILES.tree : TILES.rock, x, y, 130 + rnd() * 110);
  }
  put(TILES.ruins, 760, LANES[0] - 190, 200); put(TILES.ruins, WORLD.w - 760, LANES[1] + 240, 200);
  // map edges: rocks + vignette
  if (!TILES.painting) for (let x = 80; x < WORLD.w; x += 260 + rnd() * 120) { put(TILES.rock, x, 70 + rnd() * 30, 170); put(TILES.rock, x + 90, WORLD.h - 6 - rnd() * 20, 180); }
  g.globalCompositeOperation = 'multiply';
  const vg = g.createRadialGradient(WORLD.w / 2, WORLD.h / 2, WORLD.h * 0.48, WORLD.w / 2, WORLD.h / 2, WORLD.w * 0.58);
  vg.addColorStop(0, '#ffffff'); vg.addColorStop(1, '#39415a');
  g.fillStyle = vg; g.fillRect(0, 0, WORLD.w, WORLD.h);
  g.globalCompositeOperation = 'source-over';
  // team ground glow near cores
  for (const [x, rgb] of [[190, '90,140,255'], [WORLD.w - 190, '255,110,80']]) {
    const rg2 = g.createRadialGradient(x, MID_Y, 40, x, MID_Y, 420);
    rg2.addColorStop(0, 'rgba(' + rgb + ',0.20)'); rg2.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = rg2; g.fillRect(x - 420, MID_Y - 420, 840, 840);
  }
}

/* live map layer: pulsing altar + flickering camp braziers (not baked) */
function drawLiveMap() {
  const pulse = 0.55 + 0.45 * Math.sin(time * 1.7);
  const ax = (ALTAR.x - camX) * ZOOM, ay = (ALTAR.y - camY) * ZOOM;
  cx.save(); cx.globalCompositeOperation = 'lighter';
  const g2 = cx.createRadialGradient(ax, ay, 8 * ZOOM, ax, ay, (120 + 26 * pulse) * ZOOM);
  g2.addColorStop(0, 'rgba(120,235,255,' + (0.11 + 0.06 * pulse) + ')'); g2.addColorStop(1, 'rgba(120,235,255,0)');
  cx.fillStyle = g2; cx.fillRect(ax - 160 * ZOOM, ay - 160 * ZOOM, 320 * ZOOM, 320 * ZOOM);
  cx.strokeStyle = 'rgba(150,240,255,' + (0.22 + 0.2 * pulse) + ')'; cx.lineWidth = 2 * ZOOM;
  cx.setLineDash([14 * ZOOM, 20 * ZOOM]); cx.lineDashOffset = -time * 30 * ZOOM;
  cx.beginPath(); cx.ellipse(ax, ay, ALTAR.r * 1.35 * ZOOM, ALTAR.r * 0.95 * ZOOM, 0, 0, TAU); cx.stroke();
  cx.setLineDash([]);
  for (const c of JUNGLE) {
    if (!c.big) continue;
    const bx2 = (c.x + 165 - camX) * ZOOM, by2 = (c.y - 75 - camY) * ZOOM;
    if (TILES.bones && bx2 > -160 && by2 > -160 && bx2 < VW + 160 && by2 < VH + 160) {
      const swy = Math.sin(time * 2.1 + c.x) * 0.03, bsc = (c.y < MID_Y ? 0.9 : 1.08) * (1 + 0.025 * Math.sin(time * 7 + c.y));
      cx.save(); cx.translate(bx2, by2 + 62 * ZOOM); cx.scale(ZOOM, ZOOM);
      cx.fillStyle = 'rgba(0,0,0,0.45)'; cx.beginPath(); cx.ellipse(0, 0, 62, 20, 0, 0, TAU); cx.fill(); cx.restore();
      cx.save(); cx.globalCompositeOperation = 'source-over'; cx.translate(bx2, by2); cx.scale(ZOOM * (c.y < MID_Y ? -1 : 1) * bsc, ZOOM * bsc); cx.rotate(swy);
      cx.drawImage(TILES.bones, -75, -75, 150, 150); cx.restore();
    }
    if (bx2 < -80 || by2 < -80 || bx2 > VW + 80 || by2 > VH + 80) continue;
    const flSheet = FX['fx_hit_ember'];
    const flS = flSheet && feathered(flSheet, 'fx_hit_ember');
    if (flS) {
      const fi2 = Math.floor(time * 14 + c.x) % flSheet.n;
      cx.save(); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 0.85;
      cx.translate(bx2, by2 - 26 * ZOOM); cx.scale(ZOOM, ZOOM); cx.rotate(Math.sin(time * 3 + c.y) * 0.06);
      cx.drawImage(flS, fi2 * flSheet.fw, 0, flSheet.fw, flSheet.fh, -46, -60, 92, 92);
      cx.restore();
    }
    const fl = 0.5 + 0.5 * Math.sin(time * 9 + c.x);
    const g3 = cx.createRadialGradient(bx2, by2, 2, bx2, by2, (46 + 14 * fl) * ZOOM);
    g3.addColorStop(0, 'rgba(255,170,70,' + (0.28 + 0.18 * fl) + ')'); g3.addColorStop(1, 'rgba(255,120,40,0)');
    cx.fillStyle = g3; cx.fillRect(bx2 - 70 * ZOOM, by2 - 70 * ZOOM, 140 * ZOOM, 140 * ZOOM);
    if (Math.random() < 0.22) fxPush({ kind: 'spk', x: c.x + 165 + (Math.random() - .5) * 30, y: c.y - 85, vx: (Math.random() - .5) * 20, vy: -120 - Math.random() * 70, life: .8 + Math.random() * .5, max: 1.3, c: '255,180,90' });
  }
  cx.restore();
}

/* League fog of war + brush. Sight: heroes 500, minions 340, towers 520.
 * An enemy in brush is hidden unless an ally shares that brush (League rule). */
const FOG_ON = !DEMOF;
const BRUSH = [
  { x: 780, y: 700, rx: 150, ry: 68 }, { x: 780, y: 1210, rx: 150, ry: 68 },
  { x: 2220, y: 700, rx: 150, ry: 68 }, { x: 2220, y: 1210, rx: 150, ry: 68 },
  { x: 1500, y: 480, rx: 170, ry: 62 }, { x: 1500, y: 1430, rx: 170, ry: 62 },
];
function brushOf(u) { for (let i = 0; i < BRUSH.length; i++) { const b = BRUSH[i]; const dx = (u.x - b.x) / b.rx, dy = (u.y - b.y) / b.ry; if (dx * dx + dy * dy < 1) return i; } return -1; }
function sightSources() {
  const out = [];
  for (const u of units) if (!u.dead && u.team === 0) out.push({ x: u.x, y: u.y, r: u.kind === 'hero' ? 500 : 340, b: brushOf(u) });
  for (const tw of towers) if (tw.hp > 0 && tw.team === 0) out.push({ x: tw.x, y: tw.y, r: 520, b: -1 });
  return out;
}
let _srcCache = [], _srcT = -1;
function isVisible(u) {
  if (!FOG_ON || u.team === 0) return true;
  if (_srcT !== time) { _srcCache = sightSources(); _srcT = time; }
  const ub = brushOf(u);
  for (const sSrc of _srcCache) {
    const d = Math.hypot(u.x - sSrc.x, u.y - sSrc.y);
    if (d > sSrc.r) continue;
    if (ub >= 0 && sSrc.b !== ub && d > 70) continue;   // brush hides unless shared (or point-blank)
    return true;
  }
  return false;
}
const fogCv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
function drawFog() {
  if (!FOG_ON || !fogCv) return;
  const S = 8, fw = Math.ceil(WORLD.w / S), fh = Math.ceil(WORLD.h / S);
  if (fogCv.width !== fw) { fogCv.width = fw; fogCv.height = fh; }
  const g = fogCv.getContext('2d');
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = 'rgba(6,8,14,0.62)';
  g.clearRect(0, 0, fw, fh); g.fillRect(0, 0, fw, fh);
  g.globalCompositeOperation = 'destination-out';
  if (_srcT !== time) { _srcCache = sightSources(); _srcT = time; }
  for (const sSrc of _srcCache) {
    const rr = sSrc.r / S;
    const rg = g.createRadialGradient(sSrc.x / S, sSrc.y / S, rr * 0.55, sSrc.x / S, sSrc.y / S, rr);
    rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(sSrc.x / S, sSrc.y / S, rr, 0, TAU); g.fill();
  }
  cx.drawImage(fogCv, camX / S, camY / S, VW / ZOOM / S, VH / ZOOM / S, 0, 0, VW, VH);
}
function drawBrush() {
  if (DEMOF) return;
  cx.save();
  for (const b of BRUSH) {
    const bx = (b.x - camX) * ZOOM, by = (b.y - camY) * ZOOM;
    if (bx < -260 || by < -160 || bx > VW + 260 || by > VH + 160) continue;
    const inIt = player && !player.dead && brushOf(player) === BRUSH.indexOf(b);
    cx.globalAlpha = inIt ? 0.16 : 0.30;
    cx.fillStyle = '#223d1e';
    cx.beginPath(); cx.ellipse(bx, by, b.rx * ZOOM, b.ry * ZOOM, 0, 0, TAU); cx.fill();
    cx.globalAlpha = inIt ? 0.3 : 0.5;
    cx.strokeStyle = 'rgba(120,180,90,0.5)'; cx.lineWidth = 1.5;
    cx.setLineDash([8, 10]);
    cx.beginPath(); cx.ellipse(bx, by, b.rx * ZOOM, b.ry * ZOOM, 0, 0, TAU); cx.stroke();
    cx.setLineDash([]);
  }
  cx.restore();
}

/* ============================ render ============================ */
function drawSheet(u, sheet, size, hFlip, alpha) {
  const n = sheet.n;
  const fi = (u._atkAnim && time - u.atkT >= 0) ? Math.floor((time - u.atkT) * sheet.fps) % n : Math.floor((time * sheet.fps + u.vPhase * n)) % n;
  cx.save();
  cx.globalAlpha = alpha === undefined ? 1 : alpha;
  cx.translate(Math.round(u.x - camX) * ZOOM, Math.round(u.y - camY) * ZOOM);
  cx.scale(ZOOM, ZOOM);
  const atkAge = time - u.atkT;
  if (atkAge >= 0 && atkAge < 0.18) { const st = Math.sin(atkAge / 0.18 * Math.PI) * (u.range <= 80 ? 11 : 4); cx.translate(Math.cos(u.face) * st * ZOOM, Math.sin(u.face) * st * ZOOM); }
  // procedural life: the sheets alone read frozen in stills (Tee 2026-08-19)
  const ph = u.vPhase * 6.28;
  if (u.moving) {
    cx.translate(0, -Math.abs(Math.sin(time * 9 + ph)) * 3.2 * ZOOM);          // stride bob
    cx.rotate(Math.sin(time * 9 + ph) * 0.055);                                 // gait sway
  } else {
    cx.translate(0, Math.sin(time * 2.3 + ph) * 1.1 * ZOOM);                    // breathing
    cx.rotate(Math.sin(time * 1.4 + ph) * 0.018);
  }
  const castAge = time - (u.castT || -9);
  if (castAge >= 0 && castAge < 0.32) { const cs = Math.sin(castAge / 0.32 * Math.PI); cx.translate(0, -5 * cs * ZOOM); cx.scale(1 + 0.07 * cs, 1 + 0.07 * cs); }
  const lean = clamp(Math.sin(u.face) * 0.18, -0.22, 0.22);
  cx.rotate(u.moving ? lean : Math.cos(u.face) * -0.10);                        // face the fight even when planted
  if (hFlip) cx.scale(-1, 1);
  // hit flash pop
  const hitAge = time - u.hitT;
  const pop = hitAge < 0.22 ? 1 + 0.08 * (1 - hitAge / 0.22) : 1;
  cx.scale(pop, pop);
  cx.drawImage(sheet.img, fi * sheet.fw, 0, sheet.fw, sheet.fh, -size / 2, -size / 2, size, size);
  if (hitAge < 0.22 && hitAge >= 0) {
    cx.globalCompositeOperation = 'lighter';
    cx.globalAlpha = 0.8 * (1 - hitAge / 0.22);
    cx.drawImage(sheet.img, fi * sheet.fw, 0, sheet.fw, sheet.fh, -size / 2, -size / 2, size, size);
  }
  cx.restore();
}
function drawUnit(u) {
  const sx = (u.x - camX) * ZOOM, sy = (u.y - camY) * ZOOM;
  if (sx < -140 || sy < -140 || sx > VW + 140 || sy > VH + 140) return;
  const anims = ANIMS[u.key]; if (!anims) return;
  const state = (time - u.atkT < 0.4 && anims.attack) ? 'attack' : (u.moving && anims.walk ? 'walk' : 'idle');
  u._atkAnim = state === 'attack';
  const sheet = anims[state] || anims.idle; if (!sheet) return;
  let size = u.kind === 'hero' ? 120 : u.kind === 'monster' ? (u.key === 'mawborn_pitbrute' ? 116 : 96) : 84;
  if (u.kind !== 'hero') size = Math.round(size * (u.vScale || 1));
  const hFlip = (Math.cos(u.face) < 0) !== (u.kind !== 'hero' && u.vMirror && !u.moving && time - u.atkT > 0.5);
  // ground: pool shadow + team ellipse
  cx.save();
  cx.translate(sx, sy + size * 0.30 * ZOOM);
  cx.scale(ZOOM, ZOOM);
  cx.fillStyle = 'rgba(0,0,0,0.52)';
  cx.beginPath(); cx.ellipse(0, 2, size * 0.40, size * 0.15, 0, 0, TAU); cx.fill();
  cx.strokeStyle = 'rgba(' + TEAM[u.team].rgb + ',' + (u.kind === 'hero' ? 0.95 : 0.75) + ')';
  cx.lineWidth = u.kind === 'hero' ? 2.4 : 1.3;
  cx.beginPath(); cx.ellipse(0, 0, size * 0.36, size * 0.14, 0, 0, TAU); cx.stroke();
  if (u === player) {
    cx.strokeStyle = 'rgba(255,233,168,0.8)'; cx.lineWidth = 1.4;
    cx.beginPath(); cx.ellipse(0, 0, size * 0.44, size * 0.18, 0, 0, TAU); cx.stroke();
  }
  cx.restore();
  if (u === player && !player.dead) {
    const bob = Math.sin(time * 4) * 3;
    cx.save(); cx.translate(sx, sy - (size * 0.62) * ZOOM + bob * ZOOM); cx.scale(ZOOM, ZOOM);
    cx.fillStyle = 'rgba(255,217,138,0.95)'; cx.strokeStyle = 'rgba(0,0,0,0.7)'; cx.lineWidth = 2;
    cx.beginPath(); cx.moveTo(0, 8); cx.lineTo(-7, -4); cx.lineTo(7, -4); cx.closePath(); cx.fill(); cx.stroke();
    cx.restore();
  }
  u.moving = false;                                       // consumed by stepUnit next tick
  drawSheet(u, sheet, size, hFlip);
  // shield ring
  if (u.sh > 0) {
    cx.save(); cx.globalCompositeOperation = 'lighter';
    cx.strokeStyle = 'rgba(255,240,180,0.5)'; cx.lineWidth = 2.4 * ZOOM;
    cx.beginPath(); cx.arc(sx, sy, (u.r + 16) * ZOOM, 0, TAU); cx.stroke();
    cx.restore();
  }
  // hp bar
  if (u.hp < u.maxHp || u.kind === 'hero' || DEMOF) {
    const w = (u.kind === 'hero' ? 62 : 46) * ZOOM, h = (u.kind === 'hero' ? 6 : 4.5) * ZOOM;
    const bx = sx - w / 2, by = sy - size * 0.52 * ZOOM;
    cx.fillStyle = 'rgba(0,0,0,0.82)'; cx.fillRect(bx - 1, by - 1, w + 2, h + 2);
    const f = clamp(u.hp / u.maxHp, 0, 1);
    cx.fillStyle = u.team === 0 ? '#5aa2ff' : u.team === 1 ? '#ff5a5a' : '#c9b37e';
    if (u.kind === 'hero') cx.fillStyle = u === player ? (f > .55 ? '#5fd75f' : f > .28 ? '#e8c34a' : '#e85454') : u.team === 0 ? '#4f8fe8' : '#ff5a5a';
    cx.fillRect(bx, by, w * f, h);
    cx.fillStyle = 'rgba(255,255,255,0.3)'; cx.fillRect(bx, by, w * f, 1);
    if (u.sh > 0) { cx.fillStyle = 'rgba(255,240,180,0.9)'; cx.fillRect(bx, by - 2, w * clamp(u.sh / u.maxHp, 0, 1), 2); }
    if (u.kind === 'hero') {
      cx.fillStyle = '#ffd98a'; cx.font = '700 ' + Math.round(10 * ZOOM) + 'px Rajdhani';
      cx.textAlign = 'center'; cx.fillText(String(u.level), sx, by - 3);
    }
  }
}
function drawTower(tw) {
  const sx = (tw.x - camX) * ZOOM, sy = (tw.y - camY) * ZOOM;
  if (sx < -260 || sy < -260 || sx > VW + 260 || sy > VH + 260) return;
  const img = PLATES[tw.plate];
  const size = tw.size * ZOOM;
  cx.save();
  cx.translate(sx, sy);
  cx.fillStyle = 'rgba(0,0,0,0.4)';
  cx.beginPath(); cx.ellipse(0, size * 0.28, size * 0.36, size * 0.13, 0, 0, TAU); cx.fill();
  if (tw.hp <= 0) { cx.globalAlpha = 0.28; cx.filter = 'grayscale(1) brightness(0.5)'; }
  if (img) cx.drawImage(img, -size / 2, -size * 0.62, size, size);
  cx.restore();
  if (tw.hp > 0 && tw.hp < tw.maxHp) {
    const w = 90 * ZOOM, h = 7 * ZOOM, bx = sx - w / 2, by = sy - size * 0.66;
    cx.fillStyle = 'rgba(0,0,0,0.85)'; cx.fillRect(bx - 1, by - 1, w + 2, h + 2);
    cx.fillStyle = tw.team === 0 ? '#5aa2ff' : '#ff5a5a';
    cx.fillRect(bx, by, w * clamp(tw.hp / tw.maxHp, 0, 1), h);
  }
}
function drawFxAll() {
  // telegraphs (under everything bright)
  for (const t of telegraphs) {
    const sx = (t.x - camX) * ZOOM, sy = (t.y - camY) * ZOOM;
    const p = clamp((time - t.born) / Math.max(.01, t.at - t.born), 0, 1);
    cx.save();
    cx.strokeStyle = 'rgba(' + t.c + ',0.8)'; cx.lineWidth = 2;
    cx.setLineDash([8, 6]);
    cx.beginPath(); cx.arc(sx, sy, t.r * ZOOM, 0, TAU); cx.stroke();
    cx.setLineDash([]);
    cx.fillStyle = 'rgba(' + t.c + ',' + (0.10 + (t.nuke ? 0.12 : 0.06) * Math.sin(time * 10)) + ')';
    cx.beginPath(); cx.arc(sx, sy, t.r * ZOOM * p, 0, TAU); cx.fill();
    if (t.nuke) {
      cx.fillStyle = 'rgba(255,255,255,0.85)'; cx.font = '700 ' + Math.round(15 * ZOOM) + 'px Rajdhani';
      cx.textAlign = 'center'; cx.fillText(Math.ceil(t.at - time) + '', sx, sy + 5);
    }
    cx.restore();
  }
  // sheet fx
  for (const e of sheetFxList) {
    const t = (time - e.t0) / e.dur;
    if (t >= 1) continue;
    let x = e.x, y = e.y;
    if (e.travel) { x = e.x + (e.x2 - e.x) * t; y = e.y + (e.y2 - e.y) * t; }
    const sx = (x - camX) * ZOOM, sy = (y - camY) * ZOOM;
    const im = feathered(e.s, e.key);
    const f0 = FX_F0[e.key] || 0;
    const fi = Math.min(e.s.n - 1, f0 + Math.floor(t * (e.s.n - f0)));
    cx.save();
    cx.globalCompositeOperation = 'lighter';
    cx.globalAlpha = 0.9 * clamp(1 - Math.max(0, t - 0.62) / 0.38, 0, 1);
    cx.translate(sx, sy);
    if (e.travel) cx.rotate(Math.atan2(e.y2 - e.y, e.x2 - e.x));
    else if (e.spin) cx.rotate(e.spin);
    const sz = e.size * ZOOM;
    cx.drawImage(im, fi * e.s.fw, 0, e.s.fw, e.s.fh, -sz / 2, -sz / 2, sz, sz);
    cx.restore();
  }
  // beams
  for (const b of beams) {
    const t = (time - b.t0) / b.dur;
    if (t >= 1) continue;
    const a = t < .18 ? t / .18 : 1 - (t - .18) / .82;
    const x1 = (b.x - camX) * ZOOM, y1 = (b.y - camY) * ZOOM;
    const x2 = x1 + Math.cos(b.ang) * b.len * ZOOM, y2 = y1 + Math.sin(b.ang) * b.len * ZOOM;
    cx.save(); cx.globalCompositeOperation = 'lighter'; cx.lineCap = 'round';
    const pulse = 1 + Math.sin(time * 26) * .08;
    cx.globalAlpha = a * .26; cx.strokeStyle = b.c; cx.lineWidth = b.w * 1.35 * pulse * ZOOM;
    cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x2, y2); cx.stroke();
    cx.globalAlpha = a * .6; cx.lineWidth = b.w * .42 * pulse * ZOOM;
    cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x2, y2); cx.stroke();
    cx.globalAlpha = a * .8; cx.strokeStyle = '#fffbe8'; cx.lineWidth = Math.max(1.2, b.w * .1) * ZOOM;
    cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x2, y2); cx.stroke();
    for (const [ex, ey, er] of [[x1, y1, b.w * .9 * ZOOM], [x2, y2, b.w * 1.8 * ZOOM]]) {
      const g = cx.createRadialGradient(ex, ey, 0, ex, ey, er);
      g.addColorStop(0, 'rgba(255,255,240,' + .85 * a + ')'); g.addColorStop(1, 'rgba(255,255,240,0)');
      cx.fillStyle = g; cx.beginPath(); cx.arc(ex, ey, er, 0, TAU); cx.fill();
    }
    cx.restore();
  }
  // procedural fx
  for (const f of fx) {
    const a = clamp(f.life / f.max, 0, 1);
    const sx = (f.x - camX) * ZOOM, sy = (f.y - camY) * ZOOM;
    cx.save(); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = a;
    if (f.kind === 'laser') {
      const x1 = (f.x1 - camX) * ZOOM, y1 = (f.y1 - camY) * ZOOM, x2 = (f.x2 - camX) * ZOOM, y2 = (f.y2 - camY) * ZOOM;
      cx.lineCap = 'round';
      cx.globalAlpha = a * .32; cx.strokeStyle = f.c; cx.lineWidth = 12 * ZOOM;
      cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x2, y2); cx.stroke();
      cx.globalAlpha = a * .85; cx.lineWidth = 4.4 * ZOOM;
      cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x2, y2); cx.stroke();
      cx.strokeStyle = '#fff'; cx.globalAlpha = a; cx.lineWidth = 1.4 * ZOOM;
      cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x2, y2); cx.stroke();
      cx.globalCompositeOperation = 'lighter';
      const ig = cx.createRadialGradient(x2, y2, 1, x2, y2, 16 * ZOOM);
      ig.addColorStop(0, 'rgba(255,255,255,' + a * 0.9 + ')'); ig.addColorStop(0.4, f.c.replace('rgb', 'rgba').replace(')', ',' + a * 0.6 + ')'));
      ig.addColorStop(1, 'rgba(255,255,255,0)');
      cx.fillStyle = ig; cx.beginPath(); cx.arc(x2, y2, 16 * ZOOM, 0, TAU); cx.fill();
    } else if (f.kind === 'flash') {
      const fr = (f.r || 9) * ZOOM;
      const g = cx.createRadialGradient(sx, sy, 0, sx, sy, fr);
      g.addColorStop(0, 'rgba(255,250,220,0.95)'); g.addColorStop(.5, 'rgba(255,240,200,0.5)'); g.addColorStop(1, 'rgba(255,250,220,0)');
      cx.fillStyle = g; cx.beginPath(); cx.arc(sx, sy, fr, 0, TAU); cx.fill();
    } else if (f.kind === 'mflash') {
      const p = 1 - a, fr = f.r * (1 + p * .5) * ZOOM;
      const g = cx.createRadialGradient(sx, sy, 0, sx, sy, fr);
      g.addColorStop(0, 'rgba(255,255,240,' + .95 * a + ')');
      g.addColorStop(.4, 'rgba(' + f.c + ',' + .55 * a + ')');
      g.addColorStop(1, 'rgba(' + f.c + ',0)');
      cx.fillStyle = g; cx.beginPath(); cx.arc(sx, sy, fr, 0, TAU); cx.fill();
      cx.translate(sx, sy); cx.rotate(f.rot || 0);
      const lg = cx.createLinearGradient(0, 0, fr * 2.6, 0);
      lg.addColorStop(0, 'rgba(255,255,240,' + .9 * a + ')'); lg.addColorStop(1, 'rgba(' + f.c + ',0)');
      cx.fillStyle = lg;
      cx.beginPath(); cx.moveTo(0, -fr * .28); cx.lineTo(fr * 2.6, 0); cx.lineTo(0, fr * .28); cx.closePath(); cx.fill();
    } else if (f.kind === 'spk') {
      cx.strokeStyle = 'rgba(' + f.c + ',' + a + ')'; cx.lineWidth = 1.8 * ZOOM; cx.lineCap = 'round';
      cx.beginPath(); cx.moveTo(sx, sy);
      cx.lineTo(sx - f.vx * .05 * ZOOM, sy - f.vy * .05 * ZOOM); cx.stroke();
    } else if (f.kind === 'shock') {
      const p = 1 - a, rr = f.r * (0.25 + 0.75 * (1 - (1 - p) * (1 - p))) * ZOOM;
      cx.strokeStyle = 'rgba(' + f.c + ',' + .55 * a + ')';
      cx.lineWidth = Math.max(2, f.r * .3 * (1 - p * .65)) * ZOOM;
      cx.beginPath(); cx.arc(sx, sy, rr, 0, TAU); cx.stroke();
      cx.strokeStyle = 'rgba(255,255,240,' + .8 * a + ')';
      cx.lineWidth = Math.max(1, f.r * .07) * ZOOM;
      cx.beginPath(); cx.arc(sx, sy, rr, 0, TAU); cx.stroke();
    } else if (f.kind === 'crescent') {
      cx.globalCompositeOperation = 'lighter';
      const p2 = 1 - a, r0 = f.r * (0.55 + p2 * 0.65);
      cx.save(); cx.translate(sx, sy); cx.rotate(f.ang + p2 * f.sweep);
      const cg = cx.createLinearGradient(0, -r0 * ZOOM, 0, 0);
      cg.addColorStop(0, 'rgba(255,255,255,' + a + ')'); cg.addColorStop(1, 'rgba(' + f.c + ',0)');
      cx.strokeStyle = cg; cx.lineWidth = 13 * ZOOM * a + 2; cx.lineCap = 'round';
      cx.beginPath(); cx.arc(0, 0, r0 * ZOOM, -1.0, 1.0); cx.stroke();
      cx.strokeStyle = 'rgba(255,255,255,' + a * 0.9 + ')'; cx.lineWidth = 3.5 * ZOOM;
      cx.beginPath(); cx.arc(0, 0, r0 * ZOOM, -0.9, 0.9); cx.stroke();
      cx.restore();
    } else if (f.kind === 'column') {
      cx.globalCompositeOperation = 'lighter';
      const w2 = f.r * ZOOM * (0.5 + 0.5 * a);
      const gg = cx.createLinearGradient(sx, sy - 320 * ZOOM, sx, sy);
      gg.addColorStop(0, 'rgba(' + f.c + ',0)'); gg.addColorStop(0.75, 'rgba(' + f.c + ',' + a * 0.7 + ')'); gg.addColorStop(1, 'rgba(255,255,255,' + a + ')');
      cx.fillStyle = gg; cx.fillRect(sx - w2 / 2, sy - 320 * ZOOM, w2, 320 * ZOOM);
      cx.fillStyle = 'rgba(255,255,255,' + a * 0.85 + ')';
      cx.fillRect(sx - w2 * 0.14, sy - 320 * ZOOM, w2 * 0.28, 320 * ZOOM);
    } else if (f.kind === 'scorch') {
      cx.globalCompositeOperation = 'source-over';
      cx.fillStyle = 'rgba(20,10,6,' + a * 0.4 + ')';
      cx.beginPath(); cx.ellipse(sx, sy, f.r * ZOOM, f.r * 0.44 * ZOOM, 0, 0, TAU); cx.fill();
      cx.globalCompositeOperation = 'lighter';
      cx.strokeStyle = 'rgba(' + f.c + ',' + a * 0.5 + ')'; cx.lineWidth = 2 * ZOOM;
      cx.beginPath(); cx.ellipse(sx, sy, f.r * 0.8 * ZOOM, f.r * 0.35 * ZOOM, 0, 0, TAU); cx.stroke();
    } else if (f.kind === 'runes') {
      cx.globalCompositeOperation = 'lighter';
      cx.save(); cx.translate(sx, sy); cx.rotate(time * 1.8);
      for (let k2 = 0; k2 < 6; k2++) {
        const aa = k2 / 6 * TAU;
        cx.fillStyle = 'rgba(' + f.c + ',' + a * 0.9 + ')';
        cx.font = '700 ' + Math.round(13 * ZOOM) + 'px Cinzel, serif'; cx.textAlign = 'center';
        cx.fillText('✦', Math.cos(aa) * f.r * ZOOM, Math.sin(aa) * f.r * 0.5 * ZOOM);
      }
      cx.restore();
      cx.strokeStyle = 'rgba(' + f.c + ',' + a * 0.5 + ')'; cx.lineWidth = 2 * ZOOM;
      cx.beginPath(); cx.ellipse(sx, sy, f.r * ZOOM, f.r * 0.5 * ZOOM, 0, 0, TAU); cx.stroke();
    } else if (f.kind === 'meteor') {
      cx.globalCompositeOperation = 'lighter';
      const p3 = 1 - a;
      const mx2 = sx + (1 - p3) * 260 * ZOOM, my2 = sy - (1 - p3) * 700 * ZOOM;
      cx.strokeStyle = 'rgba(255,190,90,' + (0.7 * (1 - a * 0.3)) + ')'; cx.lineWidth = 7 * ZOOM; cx.lineCap = 'round';
      cx.beginPath(); cx.moveTo(mx2 + 90 * ZOOM, my2 - 220 * ZOOM); cx.lineTo(mx2, my2); cx.stroke();
      const mg = cx.createRadialGradient(mx2, my2, 1, mx2, my2, 26 * ZOOM);
      mg.addColorStop(0, 'rgba(255,255,255,0.95)'); mg.addColorStop(0.5, 'rgba(255,170,70,0.8)'); mg.addColorStop(1, 'rgba(255,110,40,0)');
      cx.fillStyle = mg; cx.beginPath(); cx.arc(mx2, my2, 26 * ZOOM, 0, TAU); cx.fill();
    } else if (f.kind === 'ghost') {
      const an = ANIMS[f.key]; const sh2 = an && an.idle;
      if (sh2) { cx.globalAlpha = 0.35 * a; cx.globalCompositeOperation = 'lighter';
        const fl2 = Math.cos(f.face) < 0;
        cx.save(); cx.translate(sx, sy); cx.scale(ZOOM * (fl2 ? -1 : 1), ZOOM);
        cx.drawImage(sh2.img, 0, 0, sh2.fw, sh2.fh, -f.size / 2, -f.size / 2, f.size, f.size); cx.restore(); }
    } else if (f.kind === 'dmg') {
      cx.globalCompositeOperation = 'source-over';
      const fs2 = Math.round((f.amt >= 100 ? 23 : 17) * ZOOM);
      cx.font = '700 ' + fs2 + 'px Rajdhani, sans-serif';
      cx.textAlign = 'center';
      cx.lineWidth = 4; cx.strokeStyle = 'rgba(0,0,0,' + (0.95 * a) + ')';
      cx.strokeText(String(f.amt), sx, sy);
      cx.fillStyle = 'rgba(' + f.c + ',' + a + ')';
      cx.fillText(String(f.amt), sx, sy);
    } else if (f.kind === 'ping') {
      cx.strokeStyle = 'rgba(' + f.c + ',' + a + ')'; cx.lineWidth = 2;
      cx.beginPath(); cx.arc(sx, sy, (1 - a) * 26 + 6, 0, TAU); cx.stroke();
    }
    cx.restore();
  }
}
function drawMinimap() {
  const m = $('mm'), g = m.getContext('2d');
  const W = m.width, H = m.height;
  g.fillStyle = '#0b0e13'; g.fillRect(0, 0, W, H);
  if (ground) { g.globalAlpha = 0.85; g.drawImage(ground, 0, 0, ground.width, ground.height, 0, 0, W, H); g.globalAlpha = 1; }
  const sx = W / WORLD.w, sy = H / WORLD.h;
  g.fillStyle = 'rgba(70,74,90,0.35)';
  for (const y of LANES) g.fillRect(560 * sx, (y - 110) * sy, (WORLD.w - 1120) * sx, 220 * sy);
  // altar
  g.fillStyle = ALTAR.owner === 0 ? '#ffd98a' : ALTAR.owner === 1 ? '#ff8a6a' : '#8a94a6';
  g.beginPath(); g.arc(ALTAR.x * sx, ALTAR.y * sy, 4, 0, TAU); g.fill();
  for (const tw of towers) {
    if (tw.hp <= 0) continue;
    g.fillStyle = tw.team === 0 ? '#5aa2ff' : '#ff5a5a';
    g.fillRect(tw.x * sx - 3, tw.y * sy - 3, tw.core ? 8 : 5, tw.core ? 8 : 5);
  }
  for (const u of units) {
    if (u.dead || !isVisible(u)) continue;
    g.fillStyle = u.team === 0 ? '#8ec2ff' : u.team === 1 ? '#ff9c8a' : '#c9b37e';
    const s = u.kind === 'hero' ? 5 : 3;
    g.fillRect(u.x * sx - s / 2, u.y * sy - s / 2, s, s);
  }
  // viewport
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.5;
  g.strokeRect(camX * sx, camY * sy, VW / ZOOM * sx, VH / ZOOM * sy);
}
$('mm').addEventListener('pointerdown', e => {
  const r = $('mm').getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * WORLD.w, y = (e.clientY - r.top) / r.height * WORLD.h;
  if (player && !player.dead) orderPlayer(x, y);
});

/* ============================ main loop ============================ */
let last = 0, acc = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  if (!started) return;
  const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
  last = ts;
  if (!over) {
    time += dt;
    if (NET.guest) netLerp(dt); else {
    waveT -= dt;
    if (DEMOF && Math.floor(time) % 6 === 0 && Math.floor(time) !== (frame._lastFeed || -1)) {
      frame._lastFeed = Math.floor(time);
      for (const team of [0, 1]) for (let i = 0; i < 1; i++) {
        if (units.filter(u => !u.dead && u.kind === 'minion' && u.team === team).length >= 6) break;
        const d = MINIONS[team][i % 2];
        const u = mkUnit(team, d.key, ALTAR.x + (team === 0 ? -1 : 1) * (240 + Math.random() * 160), ALTAR.y - 170 + Math.random() * 340, d);
        u.order = { x: ALTAR.x + (team === 0 ? 60 : -60), y: u.y };
        units.push(u);
      }
    }
    if (DEMOF && time > 3 && time - (frame._choreo || 0) > 2.1) {
      frame._choreo = time;
      const ready = heroes.filter(h => !h.dead).map(h => {
        const abs = [0, 1, 2, 3].filter(i => h.level >= (h.hero.abilities[i].ult ? 6 : [1, 2, 3][i] || 1) && time >= h.abCd[i]);
        return abs.length ? { h, i: abs[Math.floor(Math.random() * abs.length)] } : null;
      }).filter(Boolean);
      if (ready.length) {
        const pickc = ready[Math.floor(Math.random() * ready.length)];
        const foe = nearestEnemy(pickc.h, 620);
        if (foe) castAbility(pickc.h, pickc.i, foe.x, foe.y);
      }
    }
    if (waveT <= 0) { waveT = 30; spawnWave(); }
    for (const c of JUNGLE) if (!c.alive && time > c.respawnAt) spawnCamp(c);
    for (const u of units) stepUnit(u, dt);
    separation();
    towersThink(dt);
    heroesThink(dt);
    if (NET.on && !NET.guest) { NET.snapT += dt; if (NET.snapT >= 0.1) { NET.snapT = 0; sendSnap(); } }
    }
    // projectiles (skillshots)
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      const step = p.sp * dt;
      p.x += Math.cos(p.ang) * step; p.y += Math.sin(p.ang) * step; p.left -= step;
      fxPush({ kind: 'spk', x: p.x, y: p.y, vx: -Math.cos(p.ang) * 120, vy: -Math.sin(p.ang) * 120, life: .12, max: .12, c: p.c });
      let hit = null;
      for (const t of units) if (!t.dead && t.team !== p.team && t.team !== 2 && Math.hypot(t.x - p.x, t.y - p.y) < t.r + 14) { hit = t; break; }
      if (!hit) for (const t of units) if (!t.dead && t.team === 2 && p.src.kind === 'hero' && Math.hypot(t.x - p.x, t.y - p.y) < t.r + 14) { hit = t; break; }
      if (hit) {
        dealDamage(hit, p.dmg, p.src);
        sparks(p.x, p.y, p.ang, p.c, 1.4);
        fxPush({ kind: 'shock', x: p.x, y: p.y, life: .3, max: .3, r: 34, c: p.c });
        projectiles.splice(i, 1);
      } else if (p.left <= 0) projectiles.splice(i, 1);
    }
    // telegraphs
    for (let i = telegraphs.length - 1; i >= 0; i--) {
      if (time >= telegraphs[i].at) { telegraphs[i].cb(); telegraphs.splice(i, 1); }
    }
    // fx step
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.life -= dt;
      if (f.kind === 'spk') { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 260 * dt; f.vx *= .9; }
      else if (f.kind === 'dmg') { f.y += f.vy * dt; f.vy *= 0.93; }
      else if (f.kind === 'ghost' && f.rise) { f.y -= 26 * dt; }
      else if (f.kind === 'runes' && f.follow && !f.follow.dead) { f.x = f.follow.x; f.y = f.follow.y; }
      if (f.life <= 0) fx.splice(i, 1);
    }
    for (let i = sheetFxList.length - 1; i >= 0; i--) if ((time - sheetFxList[i].t0) / sheetFxList[i].dur >= 1) sheetFxList.splice(i, 1);
    for (let i = beams.length - 1; i >= 0; i--) if (time - beams[i].t0 > beams[i].dur) beams.splice(i, 1);
    units = units.filter(u => !u.dead || u.kind === 'hero');
    // camera follows player
    const camF = DEMOF ? ALTAR : (player || ALTAR);
    const tx = clamp((DEMOF ? ALTAR.x : camF.x) - VW / ZOOM / 2, 0, WORLD.w - VW / ZOOM);
    const ty = clamp((DEMOF ? ALTAR.y : camF.y) - VH / ZOOM / 2, 0, WORLD.h - VH / ZOOM);
    camX += (tx - camX) * 0.12; camY += (ty - camY) * 0.12;
  }
  // render
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  cx.fillStyle = '#07090d'; cx.fillRect(0, 0, VW, VH);
  let ox = 0, oy = 0;
  const sAge = time - shakeT;
  if (sAge < .35 && shake > 0) {
    const m = shake * (1 - sAge / .35);
    ox = (Math.random() - .5) * m; oy = (Math.random() - .5) * m;
  }
  cx.save();
  cx.translate(ox, oy);
  if (ground) cx.drawImage(ground, camX * .85, camY * .85, VW / ZOOM * .85, VH / ZOOM * .85, 0, 0, VW, VH);
  drawLiveMap();
  // order marker line
  if (player && player.order && !DEMOF) {
    cx.strokeStyle = 'rgba(140,255,140,0.25)'; cx.lineWidth = 1;
    cx.beginPath(); cx.moveTo((player.x - camX) * ZOOM, (player.y - camY) * ZOOM);
    cx.lineTo((player.order.x - camX) * ZOOM, (player.order.y - camY) * ZOOM); cx.stroke();
  }
  // altar: animated light pool + live ring + capture progress arc
  {
    const ax2 = (ALTAR.x - camX) * ZOOM, ay2 = (ALTAR.y - camY) * ZOOM;
    cx.save(); cx.globalCompositeOperation = 'lighter';
    const pr = (90 + Math.sin(time * 1.8) * 10) * ZOOM;
    const pg = cx.createRadialGradient(ax2, ay2, 4, ax2, ay2, pr * 1.6);
    pg.addColorStop(0, 'rgba(150,230,255,0.30)'); pg.addColorStop(0.5, 'rgba(120,210,255,0.12)'); pg.addColorStop(1, 'rgba(120,210,255,0)');
    cx.fillStyle = pg; cx.fillRect(ax2 - pr * 1.7, ay2 - pr * 1.7, pr * 3.4, pr * 3.4);
    cx.restore();
  }
  {
    const ax = (ALTAR.x - camX) * ZOOM, ay = (ALTAR.y - camY) * ZOOM;
    cx.save();
    const locked = time < ALTAR.lockT;
    cx.globalAlpha = locked ? 0.35 : 0.9;
    cx.strokeStyle = ALTAR.owner === 0 ? 'rgba(255,217,138,.8)' : ALTAR.owner === 1 ? 'rgba(255,138,106,.8)' : 'rgba(180,190,210,.6)';
    cx.lineWidth = 3;
    cx.beginPath(); cx.arc(ax, ay, ALTAR.r * ZOOM, 0, TAU); cx.stroke();
    if (!locked && ALTAR.prog > 0 && ALTAR.capTeam >= 0) {
      cx.strokeStyle = 'rgba(' + TEAM[ALTAR.capTeam].light + ',0.95)'; cx.lineWidth = 6;
      cx.beginPath(); cx.arc(ax, ay, ALTAR.r * ZOOM + 8, -Math.PI / 2, -Math.PI / 2 + TAU * ALTAR.prog); cx.stroke();
    }
    cx.restore();
  }
  drawBrush();
  for (const tw of towers) drawTower(tw);
  const zs = units.slice().sort((a, b) => (a.kind === 'hero' ? 1 : 0) - (b.kind === 'hero' ? 1 : 0) || a.y - b.y);
  for (const u of zs) if (!u.dead && isVisible(u)) drawUnit(u);
  drawFxAll();
  cx.restore();
  drawFog();
  // vignette
  const vg = cx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * .45, VW / 2, VH / 2, Math.max(VW, VH) * .75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.42)');
  cx.fillStyle = vg; cx.fillRect(0, 0, VW, VH);
  // death overlay
  { const rp = $('respawn');
    if (player.dead) { rp.classList.remove('hidden'); rp.querySelector('b').textContent = Math.max(0, Math.ceil(player.respT - time)); }
    else rp.classList.add('hidden'); }
  paintHud();
  drawMinimap();
}

/* ============================ music ============================ */
const music = new Audio('assets/audio/theme.mp3');
music.loop = true; music.volume = .4;
let musicOn = localStorage.getItem('dv_music') !== 'off';
function tryMusic() { if (musicOn && started) music.play().catch(() => {}); }
$('bMute').addEventListener('click', () => {
  musicOn = !musicOn; localStorage.setItem('dv_music', musicOn ? 'on' : 'off');
  if (musicOn) tryMusic(); else music.pause();
  $('bMute').style.color = musicOn ? '#ffd98a' : '#8a94a6';
});
$('bExit').addEventListener('click', () => {
  if (!confirm('Leave the match?')) return;
  location.href = /[?&]from=hub/.test(location.search) ? 'https://hussl-production.vercel.app/' : location.pathname;
});
addEventListener('pointerdown', tryMusic, { once: true });

/* ============================ flow ============================ */
function endGame(win) {
  if (over) return;
  over = true;
  if (NET.on && !NET.guest) netBroadcast({ t: 'over', win });
  $('endTitle').textContent = win ? 'VICTORY' : 'DEFEAT';
  $('endSub').textContent = win ? 'THE MAW CORE IS SHATTERED' : 'THE DAWN CORE HAS FALLEN';
  setTimeout(() => $('end').classList.remove('hidden'), 1400);
}
$('bAgain').addEventListener('click', () => location.reload());

function heroCard(hk) {
  const h = HEROES[hk];
  const d = document.createElement('div');
  d.className = 'hc';
  const im = document.createElement('img');
  im.src = 'assets/portraits/' + hk + '.jpg';
  im.alt = h.name;
  im.style.cssText = 'width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:8px;display:block;';
  // splash portrait first; if it ever fails, fall back to the idle sprite frame
  im.onerror = () => {
    const s = ANIMS[h.key] && ANIMS[h.key].idle; if (!s) return;
    const c = document.createElement('canvas'); c.width = 240; c.height = 240;
    c.getContext('2d').drawImage(s.img, 0, 0, s.fw, s.fh, 10, 10, 220, 220);
    im.replaceWith(c);
  };
  d.appendChild(im);
  const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = h.name; d.appendChild(nm);
  const rl = document.createElement('div'); rl.className = 'rl'; rl.textContent = h.role; d.appendChild(rl);
  const ds = document.createElement('div'); ds.className = 'ds'; ds.textContent = h.desc; d.appendChild(ds);
  d.dataset.hk = hk;
  d.addEventListener('click', () => pickHero(hk));
  return d;
}
function startGame(hk) {
  $('pick').classList.add('hidden');
  for (const el of ['top', 'plate', 'bar', 'mm', 'feed']) $(el).classList.remove('hidden');
  stage();
  heroes = [];
  const all = Object.keys(HEROES);
  player = mkHero(0, hk, 380, MID_Y);
  player.lane = 0;
  heroes.push(player);
  // two AI allies from the rest of the roster; enemy team of three (roster of
  // four means one mirror match — the lane rival)
  let rest = all.filter(k => k !== hk).sort(() => Math.random() - .5);
  let allies = rest.slice(0, 2);
  if (DEMOF) allies = ['corwen', 'ravener'];
  allies.forEach((k, i) => {
    const h = mkHero(0, k, 380, MID_Y + 90 + i * 60);
    h.lane = i === 0 ? 1 : 2;                      // ally 1 bot lane, ally 2 jungles
    heroes.push(h);
  });
  const epool = DEMOF ? ['ravener', 'corwen', 'bastille'] : all.sort(() => Math.random() - .5).slice(0, 3);
  epool.forEach((k, i) => {
    const h = mkHero(1, k, WORLD.w - 380, MID_Y + (i - 1) * 80);
    h.lane = i;                                     // top / bot / jungle
    heroes.push(h);
  });
  for (const h of heroes) {
    h.level = 6;                     // ARAM rules: the whole kit is live from minute one
    heroStat(h); h.hp = h.maxHp; units.push(h);
  }
  if (DEMOF) {
    // everyone level 6 (ults online), arrayed in two arcs around the altar
    heroes.forEach((h, i) => {
      h.level = 6; heroStat(h); h.hp = h.maxHp;
      const side = h.team === 0 ? -1 : 1;
      const k = i % 3;
      h.x = ALTAR.x + side * (230 + k * 40);
      h.y = ALTAR.y + (k - 1) * 150;
      h.order = { x: ALTAR.x + side * 60, y: ALTAR.y + (k - 1) * 60 };
    });
    // two minion packs already colliding at the altar
    for (const team of [0, 1]) {
      for (let i = 0; i < 4; i++) {
        const d = MINIONS[team][i % 2];
        const u = mkUnit(team, d.key, ALTAR.x + (team === 0 ? -1 : 1) * (170 + Math.random() * 130), ALTAR.y - 130 + i * 86 + (Math.random() - .5) * 50, d);
        u.order = { x: ALTAR.x + (team === 0 ? 60 : -60), y: u.y };
        units.push(u);
      }
    }
    ALTAR.lockT = 0;
  }
  camX = clamp(player.x - VW / ZOOM / 2, 0, WORLD.w - VW / ZOOM);
  camY = clamp((DEMOF ? ALTAR.y : player.y) - VH / ZOOM / 2, 0, WORLD.h - VH / ZOOM);
  bindBar();
  $('portrait').style.backgroundImage = 'url(assets/portraits/' + hk + '.jpg)';
  started = true;
  feed('Destroy the enemy core. Jungle camps grant buffs.');
  tryMusic();
}

(async function boot() {
  $('loadmsg').textContent = 'Summoning the lane…';
  await loadAll();
  buildGround();                      // tiles must be loaded first
  $('load').classList.add('hidden');
  const hp = $('heroes');
  for (const hk of Object.keys(HEROES)) hp.appendChild(heroCard(hk));
  if (DEMOF) startGame('liora');
  else $('pick').classList.remove('hidden');
  requestAnimationFrame(ts => { last = ts; requestAnimationFrame(frame); });
})();

/* ============================ multiplayer ============================
 * Host-authoritative 3v3 co-op on PeerJS (the proven HALCYON FRONT netcode
 * pattern): guests send intent commands, the host runs the only real sim and
 * broadcasts 10 Hz snapshots plus a one-shot event queue for casts/attacks/
 * damage numbers. Guests interpolate positions and replay the fx locally. */
function netSend(o) { if (NET.conn) { try { NET.conn.send(o); } catch (e) {} } }
function netBroadcast(o) { for (const c of NET.conns) { try { c.send(o); } catch (e) {} } }
function unitById(id) { return units.find(u => u.id === id); }
function tryCast(i, x, y) {
  if (NET.guest) { netSend({ t: 'cast', i, x: Math.round(x), y: Math.round(y) }); return; }
  castAbility(player, i, x, y);
}
function mpStatus(t) { const el = $('mpInfo'); if (el) el.textContent = t; }

function sendSnap() {
  const snap = {
    t: 'snap', tm: Math.round(time * 100) / 100, gold,
    u: units.filter(u => !u.dead).map(u => [u.id, u.team, u.key, Math.round(u.x), Math.round(u.y),
      Math.round(u.face * 100) / 100, Math.ceil(u.hp), u.maxHp, u.level || 0, u.moving ? 1 : 0,
      u.hkey || '', u.sh > 0 ? Math.round(u.sh) : 0, u.buff || '', u.kind]),
    tw: towers.map(t2 => Math.ceil(t2.hp)),
    al: [Math.round(ALTAR.prog * 100) / 100, ALTAR.owner, ALTAR.capTeam, Math.round((ALTAR.lockT - time) * 10) / 10],
    seats: NET.conns.map(c => {
      const h = c.__hero;
      return h ? { hid: h.id, cd: h.abCd.map(x => Math.max(0, Math.round((x - time) * 10) / 10)),
        dead: !!h.dead, rt: Math.max(0, Math.round(((h.respT || 0) - time) * 10) / 10), lv: h.level, xp: h.xp } : null;
    }),
    e: NET.evq,
  };
  NET.evq = [];
  netBroadcast(snap);
}
function applyCmd(d, c) {
  const h = c.__hero;
  if (!h || h.dead) return;
  if (d.t === 'order') orderFor(h, clamp(+d.x || 0, 0, WORLD.w), clamp(+d.y || 0, 0, WORLD.h));
  else if (d.t === 'cast') castAbility(h, Math.min(3, Math.max(0, d.i | 0)), clamp(+d.x || h.x, 0, WORLD.w), clamp(+d.y || h.y, 0, WORLD.h));
  else if (d.t === 'recall') { if (!h.recallT) h.recallT = time + 4; }
  else if (d.t === 'stop') { h.order = null; h.target = null; }
}

/* ------------------------------ guest sim ------------------------------ */
function netLerp(dt) {
  for (const u of units) {
    if (u.dead || u.nx === undefined) continue;
    const k = Math.min(1, dt * 10);
    u.x += (u.nx - u.x) * k; u.y += (u.ny - u.y) * k;
    u.moving = !!u.movingNet;
  }
}
function guestMkFromSnap(a) {
  const [id, team, key, x, y, face, hp, maxHp, level, mov, hkey, sh, buff, kind] = a;
  let u;
  if (hkey && HEROES[hkey]) { u = mkHero(team, hkey, x, y); u.level = level || 1; }
  else u = mkUnit(team, key, x, y, { hp: maxHp, dmg: 0, range: 60, speed: 120, r: kind === 'monster' ? 16 : 12, cd: 1 }, kind);
  u.id = id; u.hp = hp; u.maxHp = maxHp; u.face = face;
  return u;
}
function applySnap(d) {
  time = d.tm; gold = d.gold;
  const seen = new Set();
  for (const a of d.u) {
    let u = unitById(a[0]);
    if (!u) {
      u = guestMkFromSnap(a);
      units.push(u);
      if (u.kind === 'hero') heroes.push(u);
      if (u.id === NET.myHid) { player = u; onGuestPlayerReady(); }
    }
    if (u.nx === undefined || Math.hypot(a[3] - u.x, a[4] - u.y) > 240) { u.x = a[3]; u.y = a[4]; }
    u.nx = a[3]; u.ny = a[4]; u.face = a[5]; u.hp = a[6]; u.maxHp = a[7];
    u.level = a[8] || u.level; u.movingNet = a[9]; u.sh = a[11]; u.buff = a[12] || null;
    if (u.dead) { u.dead = false; }
    u.netSeen = true;
    seen.add(u.id);
  }
  for (const u of units) if (!seen.has(u.id) && !u.dead) { u.dead = true; if (u.netSeen) boom(u); }
  units = units.filter(u => !(u.dead && !u.netSeen && u.kind !== 'hero'));
  d.tw.forEach((hp2, i) => { const t2 = towers[i]; if (!t2) return; if (t2.hp > 0 && hp2 <= 0) boomTower(t2); t2.hp = hp2; });
  ALTAR.prog = d.al[0]; ALTAR.owner = d.al[1]; ALTAR.capTeam = d.al[2]; ALTAR.lockT = time + d.al[3];
  const se = d.seats[NET.seat - 1];
  if (se && player) {
    player.abCd = se.cd.map(x => time + x);
    player.dead = se.dead; player.respT = time + se.rt; player.level = se.lv; player.xp = se.xp;
    const rp = $('respawn');
    if (se.dead) { rp.classList.remove('hidden'); const b = rp.querySelector('b'); if (b) b.textContent = Math.max(1, Math.ceil(se.rt)); }
    else rp.classList.add('hidden');
  }
  for (const e of d.e) {
    if (e[0] === 'fx') fxPush(e[1]);
    else if (e[0] === 'cast') { const u = unitById(e[1]); if (u) castAbility(u, e[2], e[3], e[4], true); }
    else if (e[0] === 'atk') {
      const u = unitById(e[1]); const t2 = unitById(e[2]) || towers.find(x => x.id === e[2]);
      if (u && t2) { u.face = Math.atan2(t2.y - u.y, t2.x - u.x); u.atkT = time; fireFx(u, t2); }
    }
    else if (e[0] === 'twr') { const tw = towers[e[1]], t2 = unitById(e[2]); if (tw && t2) towerFx(tw, t2); }
    else if (e[0] === 'feed') feed(String(e[1]).slice(0, 120));
  }
}

/* ------------------------------ lobby flow ------------------------------ */
function pickHero(hk) {
  if (MODE === 'guest') {
    if ((NET.taken || []).includes(hk)) { mpStatus(hk.toUpperCase() + ' is taken — pick another legend.'); return; }
    netSend({ t: 'pick', hk });
    mpStatus('Locked ' + hk.toUpperCase() + ' — waiting for the host to start…');
  } else if (MODE === 'host') {
    NET.myHk = hk;
    if (!NET.peer) netHost();
    else mpStatus('You will play ' + hk.toUpperCase() + '. ROOM ' + roomCode + ' — press START when allies are in.');
  } else startGame(hk);
}
function markTaken() {
  document.querySelectorAll('#heroes .hc').forEach(el => {
    el.style.opacity = (NET.taken || []).includes(el.dataset.hk) ? .35 : 1;
  });
}
function netHost() {
  if (typeof Peer === 'undefined') { mpStatus('Multiplayer needs internet (connection library failed to load).'); return; }
  roomCode = '' + Math.floor(1000 + Math.random() * 9000);
  mpStatus('Creating room…');
  NET.peer = new Peer('duskveil-' + roomCode, ICE);
  NET.peer.on('open', () => { mpStatus('ROOM CODE: ' + roomCode + ' — you play ' + NET.myHk.toUpperCase() + '. Send the code to up to 2 allies, then press START.'); $('mpStart').style.display = 'inline-block'; });
  NET.peer.on('error', e => mpStatus('Connection error (' + e.type + ') — reload and try again.'));
  NET.peer.on('connection', c => {
    if (started || NET.conns.length >= 2) { try { c.close(); } catch (e) {} return; }
    c.on('open', () => {
      NET.conns.push(c); c.__seat = NET.conns.length;
      c.send({ t: 'lobby', taken: [NET.myHk, ...NET.conns.map(x => x.__hk).filter(Boolean)] });
      mpStatus('ROOM ' + roomCode + ' — ' + NET.conns.length + ' ally joined. Press START when ready.');
    });
    c.on('data', d => {
      if (!d || !d.t) return;
      if (d.t === 'pick' && !started) { c.__hk = String(d.hk).slice(0, 24); mpStatus('ROOM ' + roomCode + ' — ally locked ' + c.__hk.toUpperCase() + '. Press START.'); }
      else if (started) applyCmd(d, c);
    });
    c.on('close', () => {
      const i = NET.conns.indexOf(c);
      if (i >= 0 && !started) { NET.conns.splice(i, 1); mpStatus('An ally left. ROOM ' + roomCode); }
      if (started && c.__hero) { c.__hero.human = false; feed('An ally lost connection — the AI takes over.'); }
    });
  });
}
function netStartMatch() {
  if (started || !NET.conns.length || !NET.myHk) return;
  NET.on = true;
  startGame(NET.myHk);
  const allyHeroes = heroes.filter(h => h.team === 0 && h !== player);
  NET.conns.forEach((c, i) => {
    let h = allyHeroes[i];
    if (!h) return;
    if (c.__hk && c.__hk !== h.hkey && HEROES[c.__hk]) {
      const nh = mkHero(0, c.__hk, h.x, h.y);
      nh.lane = h.lane; nh.id = h.id;
      units[units.indexOf(h)] = nh; heroes[heroes.indexOf(h)] = nh; h = nh;
      heroStat(h); h.hp = h.maxHp;
    }
    h.human = true; c.__hero = h;
    c.send({ t: 'start', hk: h.hkey, hid: h.id, seat: c.__seat });
  });
  sendSnap();
}
function netJoin() {
  const code = ($('mpCode').value || '').trim();
  if (code.length < 4) { mpStatus('Enter the 4-digit room code.'); return; }
  if (NET.peer) return;
  if (typeof Peer === 'undefined') { mpStatus('Multiplayer needs internet (connection library failed to load).'); return; }
  mpStatus('Connecting…');
  NET.peer = new Peer(ICE);
  NET.peer.on('error', e => {
    mpStatus(e.type === 'peer-unavailable' ? 'Room not found — check the code.' : 'Connection error (' + e.type + ') — reload and try again.');
    try { NET.peer.destroy(); } catch (_) {}
    NET.peer = null;
  });
  NET.peer.on('open', () => {
    const c = NET.peer.connect('duskveil-' + code, { reliable: true });
    NET.conn = c;
    c.on('open', () => { NET.guest = true; NET.on = true; MODE = 'guest'; mpStatus('Connected — pick your legend.'); });
    c.on('data', onGuestData);
    c.on('close', () => {
      if (started && !over) { over = true; $('endTitle').textContent = 'DISCONNECTED'; $('endSub').textContent = 'THE HOST LEFT THE FIELD'; $('end').classList.remove('hidden'); }
      else mpStatus('Connection closed.');
    });
  });
}
function onGuestData(d) {
  if (!d || !d.t) return;
  if (d.t === 'lobby') { NET.taken = d.taken || []; markTaken(); }
  else if (d.t === 'start') { NET.myHid = d.hid; NET.seat = d.seat; guestBegin(d.hk); }
  else if (d.t === 'snap') { if (started) applySnap(d); }
  else if (d.t === 'over') endGame(!!d.win);
}
function guestBegin(hk) {
  $('pick').classList.add('hidden');
  for (const el of ['top', 'plate', 'bar', 'mm', 'feed']) $(el).classList.remove('hidden');
  stage();
  units = []; heroes = []; corpses = [];
  player = null; started = true;
  NET.pendingHk = hk;
  feed('Match started — hold the lane with your allies.');
  tryMusic();
}
function onGuestPlayerReady() {
  player.human = true;
  bindBar();
  $('portrait').style.backgroundImage = 'url(assets/portraits/' + player.hkey + '.jpg)';
}
(function wireLobby() {
  const b = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
  const hl = id => ['mSolo','mHost','mJoin'].forEach(x => { const el = $(x); if (el) el.classList.toggle('on', x === id); });
  b('mSolo', () => { MODE = 'solo'; hl('mSolo'); mpStatus('Pick a legend to enter the lane.'); });
  b('mHost', () => { MODE = 'host'; hl('mHost'); mpStatus('Pick YOUR legend — a room code will appear for your allies.'); });
  b('mJoin', () => { MODE = 'join'; hl('mJoin'); $('mpCode').style.display = 'inline-block'; $('mpGo').style.display = 'inline-block'; mpStatus('Enter the room code from the host.'); });
  b('mpGo', netJoin);
  b('mpStart', netStartMatch);
})();
