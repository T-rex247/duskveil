'use strict';
/* PROJECT DUSKVEIL — hero-command battle arena (HALCYON universe).
 * One lane, two cores, minion waves, jungle camps, four legends.
 * Single-file, no build step; art = HALCYON atlas sheets (mirror-facing). */

/* ============================ helpers ============================ */
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const TAU = Math.PI * 2;

/* ============================ world ============================ */
/* 3v3 twin-lane arena (Twisted-Treeline-shaped, original): two lanes over a
 * jungle midfield with a capturable central altar. */
const WORLD = { w: 3000, h: 1900 };
const LANES = [560, 1340];
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
const UNIT_SHEETS = ['dawnmarch_corwen', 'dawnmarch_liora', 'dawnmarch_squire', 'dawnmarch_sunbow',
  'vectra_bastille', 'mawborn_ravener', 'mawborn_cinderling', 'mawborn_imp', 'mawborn_fiend', 'mawborn_pitbrute'];
const FX_SHEETS = ['fx_hit_gold', 'fx_hit_cyan', 'fx_hit_ember', 'fx_muzzle_gold', 'fx_muzzle_cyan', 'fx_muzzle_ember',
  'fx_death_dawnmarch', 'fx_death_vectra', 'fx_death_mawborn', 'fx_proj_lightarrow', 'fx_proj_ionbolt_v3',
  'fx_proj_shell_v3', 'fx_proj_emberspit', 'fx_ability_finallight', 'fx_ability_daybreak'];
const PLATE_FILES = { keep: 'dawnmarch_keep', tower_d: 'dawnmarch_watchtower', spire: 'mawborn_brimstonespire', heart: 'mawborn_pitheart' };

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
  }
  FEATHERED[key] = c;
  return c;
}
const FX_F0 = { fx_hit_gold: 2, fx_hit_cyan: 2, fx_hit_ember: 2 };

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
  u.maxHp = h.hp + h.hpG * (l - 1);
  u.dmg = h.dmg + h.dmgG * (l - 1);
}
function xpNeed(l) { return Math.round(90 * Math.pow(l, 1.35)); }
function grantXp(u, amt) {
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
  time = 0; over = false; waveT = 5; kills = 0; deaths = 0; gold = 0;
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
function spawnWave() {
  for (const team of [0, 1]) {
    const x0 = team === 0 ? 380 : WORLD.w - 380;
    for (const lane of [0, 1]) {
      for (let i = 0; i < 4; i++) {
        const d = MINIONS[team][i < 3 ? 0 : 1];
        const u = mkUnit(team, d.key, x0 + (Math.random() - .5) * 50, MID_Y - 50 + i * 34, d);
        u.path = lanePath(team, lane); u.wp = 0;
        u.order = { ...u.path[0] };
        units.push(u);
      }
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
  let d = u.dmg;
  if (u.buff === 'EMBERBRAND') d *= 1.25;
  return Math.round(d);
}
function dealDamage(t, amt, src) {
  if (t.hp === undefined || t.dead) return;
  if (t.sh > 0) { const a = Math.min(t.sh, amt); t.sh -= a; amt -= a; }
  t.hp -= amt; t.hitT = time;
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
    const srcHero = src && src.kind === 'hero' ? src : null;
    if (t.kind === 'minion') {
      if (srcHero) { if (srcHero === player) gold += 22; grantXp(srcHero, 30); }
      for (const h of heroes) if (!h.dead && h.team !== t.team && dist(h, t) < 550) grantXp(h, 14);
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
      t.respT = time + 7 + 2.5 * t.level;
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
  const fac = u.key.split('_')[0];
  const lrgb = { dawnmarch: '255,233,168', vectra: '159,232,255', mawborn: '255,150,90' }[fac] || '220,235,255';
  const melee = u.range <= 80;
  const mx = u.x + Math.cos(u.face) * (u.r + 6), my = u.y + Math.sin(u.face) * (u.r + 6);
  if (!melee) {
    fxPush({ kind: 'laser', x1: mx, y1: my, x2: t.x, y2: t.y, life: .12, max: .12, c: 'rgb(' + lrgb + ')' });
    fxPush({ kind: 'mflash', x: mx, y: my, rot: u.face, life: .1, max: .1, c: lrgb, r: u.kind === 'hero' ? 15 : 10 });
    sheetFx('fx_proj_' + (fac === 'dawnmarch' ? 'lightarrow' : fac === 'vectra' ? 'ionbolt_v3' : 'emberspit'),
      { x: mx, y: my, x2: t.x, y2: t.y, dur: clamp(dist(u, t) / 1500, .06, .22), travel: true, size: u.kind === 'hero' ? 56 : 44 });
  }
  const hitKey = fac === 'dawnmarch' ? 'fx_hit_gold' : fac === 'vectra' ? 'fx_hit_cyan' : 'fx_hit_ember';
  sheetFx(hitKey, { x: t.x, y: t.y, size: u.kind === 'hero' ? 88 : 64 });
  sparks(t.x, t.y, u.face, lrgb, u.kind === 'hero' ? 1.2 : 0.8);
  dealDamage(t, effDmg(u), u);
}
function towerFire(tw, t) {
  const lrgb = tw.team === 0 ? '255,233,168' : '255,150,90';
  fxPush({ kind: 'laser', x1: tw.x, y1: tw.y - 60, x2: t.x, y2: t.y, life: .14, max: .14, c: 'rgb(' + lrgb + ')' });
  fxPush({ kind: 'flash', x: t.x, y: t.y, life: .12, max: .12, r: 15 });
  sparks(t.x, t.y, Math.atan2(t.y - tw.y, t.x - tw.x), lrgb, 1.2);
  tw.cdT = time + 1.1;
  dealDamage(t, tw.dmg, tw);
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
function castAbility(u, i, tx, ty) {
  const ab = u.hero.abilities[i];
  const need = ab.ult ? 6 : [1, 2, 3][i] || 1;
  if (u.level < need || time < u.abCd[i] || u.dead) return false;
  const l = u.level, fac = u.hero.fac;
  const lrgb = { dawnmarch: '255,233,168', vectra: '159,232,255', mawborn: '255,150,90' }[fac];
  let cdMul = u.buff === 'WARDLIGHT' ? 0.8 : 1;
  const ang = Math.atan2(ty - u.y, tx - u.x);
  const capTo = (r) => { const d = Math.hypot(tx - u.x, ty - u.y); if (d > r) { tx = u.x + (tx - u.x) / d * r; ty = u.y + (ty - u.y) / d * r; } };
  switch (ab.type) {
    case 'bolt': {
      u.face = ang;
      fxPush({ kind: 'mflash', x: u.x, y: u.y, rot: ang, life: .12, max: .12, c: lrgb, r: 18 });
      const proj = { x: u.x, y: u.y, ang, sp: ab.speed, left: ab.range, dmg: ab.dmg(l), team: u.team, src: u, c: lrgb };
      projectiles.push(proj);
      break;
    }
    case 'aoe': {
      capTo(ab.range);
      const X = tx, Y = ty;
      telegraphs.push({ x: X, y: Y, r: ab.radius, at: time + ab.delay, team: u.team, c: lrgb, born: time, cb: () => {
        aoeDamage(X, Y, ab.radius, ab.dmg(l), u);
        fxPush({ kind: 'shock', x: X, y: Y, life: .45, max: .45, r: ab.radius, c: lrgb });
        fxPush({ kind: 'flash', x: X, y: Y, life: .2, max: .2, r: ab.radius * .55 });
        addShake(X, Y, 6);
      } });
      break;
    }
    case 'shield':
      u.sh = ab.amount(l); u.shT = time + ab.dur;
      if (ab.haste) { u.haste = ab.haste; u.hasteT = time + ab.dur; }
      fxPush({ kind: 'shock', x: u.x, y: u.y, life: .4, max: .4, r: 50, c: lrgb });
      break;
    case 'haste':
      u.haste = ab.haste; u.hasteT = time + ab.dur;
      fxPush({ kind: 'shock', x: u.x, y: u.y, life: .35, max: .35, r: 44, c: lrgb });
      break;
    case 'arc': {
      u.face = ang; u.atkT = time;
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
      for (let i2 = 0; i2 < ab.count; i2++) {
        const b = mkUnit(u.team, 'mawborn_imp', u.x + (Math.random() - .5) * 60, u.y + (Math.random() - .5) * 60,
          { hp: 110 + 25 * l, dmg: 18 + 5 * l, range: 60, speed: 165, r: 10, cd: 0.9 }, 'brood');
        b.dieAt = time + ab.life;
        units.push(b);
      }
      fxPush({ kind: 'shock', x: u.x, y: u.y, life: .4, max: .4, r: 60, c: lrgb });
      break;
    }
    case 'beam': {
      u.face = ang;
      beams.push({ x: u.x, y: u.y, ang, len: ab.range, w: ab.width, t0: time, dur: .5, c: '#ffe9a8' });
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
      telegraphs.push({ x: X, y: Y, r: ab.radius, at: time + ab.delay, team: u.team, c: lrgb, born: time, nuke: true, cb: () => {
        aoeDamage(X, Y, ab.radius, ab.dmg(l), u);
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
  const sp = u.speed * (u.hasteT > time ? u.haste : 1) * (u.recallT ? 0 : 1);
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
    t = nearestEnemy(u, u.kind === 'brood' ? 420 : 300);
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
    if (tw.hp <= 0 || time < tw.cdT) continue;
    let best = null, bd = tw.range;
    for (const t of units) {                                  // minions first
      if (t.dead || t.team === tw.team || t.team === 2) continue;
      const pri = t.kind === 'hero' ? 1 : 0;
      const d = dist(tw, t);
      if (d < tw.range && (best === null || pri < best.pri || (pri === best.pri && d < bd))) { best = { t, pri }; bd = d; }
    }
    if (best) towerFire(tw, best.t);
  }
}
function coreOf(team) { return towers.find(t => t.core && t.team === team); }
function heroesThink(dt) {
  // player recall
  if (player.recallT && time >= player.recallT) {
    player.recallT = 0;
    const c = coreOf(0); player.x = c.x + 90; player.y = c.y; player.order = null;
    fxPush({ kind: 'shock', x: player.x, y: player.y, life: .5, max: .5, r: 60, c: '255,233,168' });
  }
  // respawn + regen — every hero on the field
  for (const h of heroes) {
    if (h.dead && time >= h.respT) {
      h.dead = false; h.hp = h.maxHp;
      const c = coreOf(h.team);
      h.x = c.x + (h.team === 0 ? 90 : -90); h.y = c.y + (Math.random() - .5) * 80;
      h.order = null; h.target = null;
      fxPush({ kind: 'shock', x: h.x, y: h.y, life: .5, max: .5, r: 70, c: TEAM[h.team].light });
    }
    if (!h.dead) {
      const nearCore = dist(h, coreOf(h.team)) < 320;
      const regen = nearCore ? h.maxHp * .06 : (h.buff === 'WARDLIGHT' ? 8 : 1.6);
      h.hp = Math.min(h.maxHp, h.hp + regen * dt);
      if (h.buffT && time > h.buffT) h.buff = null;
    }
  }
  // AI brain for every non-player hero
  for (const e of heroes) {
    if (e === player || e.dead) continue;
    if (time < (e.aiT || 0)) continue;
    e.aiT = time + 0.5;
    const home = coreOf(e.team);
    const low = e.hp < e.maxHp * 0.32;
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
  // attack if clicking near an enemy
  let best = null, bd = 60;
  for (const t of units) {
    if (t.dead || t.team === player.team) continue;
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
  if (k === 'q') castAbility(player, 0, mouse.x, mouse.y);
  else if (k === 'w') castAbility(player, 1, mouse.x, mouse.y);
  else if (k === 'e') castAbility(player, 2, mouse.x, mouse.y);
  else if (k === 'r') castAbility(player, 3, mouse.x, mouse.y);
  else if (k === 'b' && !player.dead && !player.recallT) { player.recallT = time + 4; feed('Recalling…'); }
  else if (k === 's') { player.order = null; player.target = null; }
});

/* mobile ability buttons cast at nearest enemy / self */
function bindBar() {
  const bar = $('bar'); bar.innerHTML = '';
  player.hero.abilities.forEach((ab, i) => {
    const d = document.createElement('div');
    d.className = 'ab' + (ab.ult ? ' ult' : '');
    d.innerHTML = `<span class="k">${ab.k}</span><span class="ic">${ab.icon}</span><span class="n">${ab.name}</span><div class="cd hidden"></div>`;
    d.addEventListener('pointerdown', e => {
      e.stopPropagation();
      let tx = mouse.x, ty = mouse.y;
      const near = nearestEnemy(player, 700);
      if ((e.pointerType === 'touch' || (mouse.x === 0 && mouse.y === 0)) && near) { tx = near.x; ty = near.y; }
      castAbility(player, i, tx, ty);
    });
    bar.appendChild(d);
  });
}
function paintBar() {
  const kids = $('bar').children;
  player.hero.abilities.forEach((ab, i) => {
    const el = kids[i]; if (!el) return;
    const cdel = el.querySelector('.cd');
    const need = ab.ult ? 6 : [1, 2, 3][i] || 1;
    if (player.level < need) { cdel.classList.remove('hidden'); cdel.textContent = 'L' + need; }
    else {
      const left = player.abCd[i] - time;
      if (left > 0) { cdel.classList.remove('hidden'); cdel.textContent = Math.ceil(left); }
      else {
        cdel.classList.add('hidden');
        if (ab.ult) el.classList.add('ready-ult');
      }
      if (ab.ult && left > 0) el.classList.remove('ready-ult');
    }
  });
}

/* ============================ feed / hud ============================ */
function feed(t) {
  const f = $('feed');
  const d = document.createElement('div');
  d.textContent = t;
  f.appendChild(d);
  while (f.children.length > 4) f.removeChild(f.firstChild);
  setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 6000);
}
function paintHud() {
  $('tGold').textContent = gold;
  $('tLvl').textContent = player.level;
  $('tKD').textContent = kills + '/' + deaths;
  const m = Math.floor(time / 60), s = Math.floor(time % 60);
  $('tClock').textContent = m + ':' + (s < 10 ? '0' : '') + s;
  $('hpin').style.width = clamp(player.hp / player.maxHp * 100, 0, 100) + '%';
  $('hpin').style.background = player.hp / player.maxHp > .5 ? 'linear-gradient(180deg,#7fe08a,#3f9e4c)'
    : player.hp / player.maxHp > .25 ? 'linear-gradient(180deg,#ffd98a,#c99022)' : 'linear-gradient(180deg,#ff8a7a,#b23428)';
  $('lbHp').textContent = Math.max(0, Math.round(player.hp)) + '/' + player.maxHp + (player.sh > 0 ? ' (+' + Math.round(player.sh) + ')' : '');
  $('lbBuff').textContent = (player.buff ? player.buff + ' ' : '') + (player.recallT ? 'RECALLING ' + Math.ceil(player.recallT - time) : '');
  $('xpin').style.width = (player.level >= 9 ? 100 : player.xp / xpNeed(player.level) * 100) + '%';
  paintBar();
}

/* ============================ ground ============================ */
let ground = null;
function buildGround() {
  ground = document.createElement('canvas');
  const S = 0.5;
  ground.width = WORLD.w * S; ground.height = WORLD.h * S;
  const g = ground.getContext('2d');
  g.scale(S, S);
  // dusk field: cool blue-grey, warmer toward MAW side
  const base = g.createLinearGradient(0, 0, WORLD.w, 0);
  base.addColorStop(0, '#2a3140'); base.addColorStop(0.5, '#272d3a'); base.addColorStop(1, '#33262a');
  g.fillStyle = base; g.fillRect(0, 0, WORLD.w, WORLD.h);
  // mottle
  for (let i = 0; i < 1600; i++) {
    const x = Math.random() * WORLD.w, y = Math.random() * WORLD.h, r = 6 + Math.random() * 22;
    g.fillStyle = 'rgba(' + (x > WORLD.w / 2 ? '60,40,36' : '40,52,66') + ',' + (0.03 + Math.random() * 0.05) + ')';
    g.beginPath(); g.ellipse(x, y, r * (1 + Math.random()), r * 0.6, Math.random() * 3, 0, TAU); g.fill();
  }
  // jungle: darker everywhere except the lanes and base plazas
  g.fillStyle = 'rgba(12,16,20,0.40)';
  g.fillRect(0, 0, WORLD.w, WORLD.h);
  for (let i = 0; i < 700; i++) {
    const x = Math.random() * WORLD.w, y = Math.random() * WORLD.h;
    g.fillStyle = 'rgba(20,30,26,' + (0.15 + Math.random() * 0.25) + ')';
    g.beginPath(); g.arc(x, y, 8 + Math.random() * 28, 0, TAU); g.fill();
  }
  // roads: two lanes + base plazas + short ramps
  const road = (x0, y0, w, h) => {
    g.fillStyle = '#3d4150'; g.fillRect(x0, y0, w, h);
    const lg = g.createLinearGradient(0, y0, 0, y0 + h);
    lg.addColorStop(0, 'rgba(0,0,0,0.35)'); lg.addColorStop(0.5, 'rgba(255,235,200,0.07)'); lg.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = lg; g.fillRect(x0, y0, w, h);
    for (let i = 0; i < (w * h) / 4200; i++) {
      const x = x0 + Math.random() * w, y = y0 + Math.random() * h;
      g.fillStyle = 'rgba(' + (Math.random() > .5 ? '70,74,88' : '52,56,68') + ',' + (0.4 + Math.random() * .4) + ')';
      g.beginPath(); g.ellipse(x, y, 14 + Math.random() * 22, 9 + Math.random() * 14, Math.random(), 0, TAU); g.fill();
    }
  };
  for (const y of LANES) road(560, y - 110, WORLD.w - 1120, 220);
  road(120, MID_Y - 240, 520, 480);                 // dawn base plaza
  road(WORLD.w - 640, MID_Y - 240, 520, 480);        // maw base plaza
  for (const t2 of [0, 1]) for (const y of LANES) {  // diagonal ramps base→lanes
    const bx = t2 === 0 ? 560 : WORLD.w - 560;
    g.save(); g.strokeStyle = '#3d4150'; g.lineWidth = 150; g.lineCap = 'round';
    g.beginPath(); g.moveTo(bx + (t2 === 0 ? 20 : -20), MID_Y); g.lineTo(bx + (t2 === 0 ? 260 : -260), y); g.stroke();
    g.restore();
  }
  // the altar clearing
  road(ALTAR.x - 170, ALTAR.y - 130, 340, 260);
  g.strokeStyle = 'rgba(255,233,168,0.35)'; g.lineWidth = 6;
  g.beginPath(); g.arc(ALTAR.x, ALTAR.y, ALTAR.r, 0, TAU); g.stroke();
  // camp clearings
  for (const c of JUNGLE) {
    g.fillStyle = 'rgba(58,52,44,0.55)';
    g.beginPath(); g.ellipse(c.x, c.y, 120, 80, 0, 0, TAU); g.fill();
  }
  // team ground glow near cores
  for (const [x, rgb] of [[190, '90,140,255'], [WORLD.w - 190, '255,110,80']]) {
    const rg = g.createRadialGradient(x, LANE_Y, 40, x, LANE_Y, 420);
    rg.addColorStop(0, 'rgba(' + rgb + ',0.20)'); rg.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = rg; g.fillRect(x - 420, LANE_Y - 420, 840, 840);
  }
}

/* ============================ render ============================ */
function drawSheet(u, sheet, size, hFlip, alpha) {
  const n = sheet.n;
  const fi = Math.floor((time * sheet.fps + u.vPhase * n)) % n;
  cx.save();
  cx.globalAlpha = alpha === undefined ? 1 : alpha;
  cx.translate(Math.round(u.x - camX) * ZOOM, Math.round(u.y - camY) * ZOOM);
  cx.scale(ZOOM, ZOOM);
  const lean = clamp(Math.sin(u.face) * 0.18, -0.22, 0.22);
  cx.rotate(u.moving ? lean : 0);
  if (hFlip) cx.scale(-1, 1);
  // hit flash pop
  const hitAge = time - u.hitT;
  const pop = hitAge < 0.13 ? 1 + 0.08 * (1 - hitAge / 0.13) : 1;
  cx.scale(pop, pop);
  cx.drawImage(sheet.img, fi * sheet.fw, 0, sheet.fw, sheet.fh, -size / 2, -size / 2, size, size);
  if (hitAge < 0.13 && hitAge >= 0) {
    cx.globalCompositeOperation = 'lighter';
    cx.globalAlpha = 0.8 * (1 - hitAge / 0.13);
    cx.drawImage(sheet.img, fi * sheet.fw, 0, sheet.fw, sheet.fh, -size / 2, -size / 2, size, size);
  }
  cx.restore();
}
function drawUnit(u) {
  const sx = (u.x - camX) * ZOOM, sy = (u.y - camY) * ZOOM;
  if (sx < -140 || sy < -140 || sx > VW + 140 || sy > VH + 140) return;
  const anims = ANIMS[u.key]; if (!anims) return;
  const state = (time - u.atkT < 0.4 && anims.attack) ? 'attack' : (u.moving && anims.walk ? 'walk' : 'idle');
  const sheet = anims[state] || anims.idle; if (!sheet) return;
  const size = u.kind === 'hero' ? 120 : u.kind === 'monster' ? (u.key === 'mawborn_pitbrute' ? 116 : 96) : 84;
  const hFlip = Math.cos(u.face) < 0;
  // ground: pool shadow + team ellipse
  cx.save();
  cx.translate(sx, sy + size * 0.30 * ZOOM);
  cx.scale(ZOOM, ZOOM);
  cx.fillStyle = 'rgba(0,0,0,0.38)';
  cx.beginPath(); cx.ellipse(0, 0, size * 0.34, size * 0.13, 0, 0, TAU); cx.fill();
  cx.strokeStyle = 'rgba(' + TEAM[u.team].rgb + ',' + (u.kind === 'hero' ? 0.9 : 0.5) + ')';
  cx.lineWidth = u.kind === 'hero' ? 2.4 : 1.3;
  cx.beginPath(); cx.ellipse(0, 0, size * 0.36, size * 0.14, 0, 0, TAU); cx.stroke();
  if (u === player) {
    cx.strokeStyle = 'rgba(255,233,168,0.8)'; cx.lineWidth = 1.4;
    cx.beginPath(); cx.ellipse(0, 0, size * 0.44, size * 0.18, 0, 0, TAU); cx.stroke();
  }
  cx.restore();
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
  if (u.hp < u.maxHp || u.kind === 'hero') {
    const w = (u.kind === 'hero' ? 62 : 46) * ZOOM, h = (u.kind === 'hero' ? 6 : 4.5) * ZOOM;
    const bx = sx - w / 2, by = sy - size * 0.52 * ZOOM;
    cx.fillStyle = 'rgba(0,0,0,0.82)'; cx.fillRect(bx - 1, by - 1, w + 2, h + 2);
    const f = clamp(u.hp / u.maxHp, 0, 1);
    cx.fillStyle = u.team === 0 ? '#5aa2ff' : u.team === 1 ? '#ff5a5a' : '#c9b37e';
    if (u.kind === 'hero') cx.fillStyle = f > .55 ? (u.team === 0 ? '#5fd75f' : '#ff5a5a') : (f > .28 ? '#e8c34a' : '#e85454');
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
    cx.globalAlpha = a * .95; cx.strokeStyle = '#fff'; cx.lineWidth = Math.max(1.4, b.w * .12) * ZOOM;
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
      cx.globalAlpha = a * .3; cx.strokeStyle = f.c; cx.lineWidth = 9 * ZOOM;
      cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x2, y2); cx.stroke();
      cx.globalAlpha = a * .85; cx.lineWidth = 3.4 * ZOOM;
      cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x2, y2); cx.stroke();
      cx.strokeStyle = '#fff'; cx.globalAlpha = a; cx.lineWidth = 1.4 * ZOOM;
      cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x2, y2); cx.stroke();
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
  const sx = W / WORLD.w, sy = H / WORLD.h;
  g.fillStyle = 'rgba(70,74,90,0.6)';
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
    if (u.dead) continue;
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
    waveT -= dt;
    if (waveT <= 0) { waveT = 26; spawnWave(); }
    for (const c of JUNGLE) if (!c.alive && time > c.respawnAt) spawnCamp(c);
    for (const u of units) stepUnit(u, dt);
    separation();
    towersThink(dt);
    heroesThink(dt);
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
      if (f.life <= 0) fx.splice(i, 1);
    }
    for (let i = sheetFxList.length - 1; i >= 0; i--) if ((time - sheetFxList[i].t0) / sheetFxList[i].dur >= 1) sheetFxList.splice(i, 1);
    for (let i = beams.length - 1; i >= 0; i--) if (time - beams[i].t0 > beams[i].dur) beams.splice(i, 1);
    units = units.filter(u => !u.dead || u.kind === 'hero');
    // camera follows player
    const tx = clamp(player.x - VW / ZOOM / 2, 0, WORLD.w - VW / ZOOM);
    const ty = clamp(player.y - VH / ZOOM / 2, 0, WORLD.h - VH / ZOOM);
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
  if (ground) cx.drawImage(ground, camX * .5, camY * .5, VW / ZOOM * .5, VH / ZOOM * .5, 0, 0, VW, VH);
  // order marker line
  if (player && player.order) {
    cx.strokeStyle = 'rgba(140,255,140,0.25)'; cx.lineWidth = 1;
    cx.beginPath(); cx.moveTo((player.x - camX) * ZOOM, (player.y - camY) * ZOOM);
    cx.lineTo((player.order.x - camX) * ZOOM, (player.order.y - camY) * ZOOM); cx.stroke();
  }
  // altar: live ring + capture progress arc
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
  for (const tw of towers) drawTower(tw);
  const zs = units.slice().sort((a, b) => (a.kind === 'hero' ? 1 : 0) - (b.kind === 'hero' ? 1 : 0) || a.y - b.y);
  for (const u of zs) if (!u.dead) drawUnit(u);
  drawFxAll();
  cx.restore();
  // vignette
  const vg = cx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * .45, VW / 2, VH / 2, Math.max(VW, VH) * .75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.42)');
  cx.fillStyle = vg; cx.fillRect(0, 0, VW, VH);
  // death overlay
  if (player.dead) {
    cx.fillStyle = 'rgba(20,4,4,0.45)'; cx.fillRect(0, 0, VW, VH);
    cx.fillStyle = '#fff'; cx.font = '700 28px Rajdhani'; cx.textAlign = 'center';
    cx.fillText('RESPAWN IN ' + Math.max(0, Math.ceil(player.respT - time)), VW / 2, VH / 2);
  }
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
  d.addEventListener('click', () => startGame(hk));
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
  const rest = all.filter(k => k !== hk).sort(() => Math.random() - .5);
  const allies = rest.slice(0, 2);
  allies.forEach((k, i) => {
    const h = mkHero(0, k, 380, MID_Y + 90 + i * 60);
    h.lane = i === 0 ? 1 : 2;                      // ally 1 bot lane, ally 2 jungles
    heroes.push(h);
  });
  const epool = all.sort(() => Math.random() - .5).slice(0, 3);
  epool.forEach((k, i) => {
    const h = mkHero(1, k, WORLD.w - 380, MID_Y + (i - 1) * 80);
    h.lane = i;                                     // top / bot / jungle
    heroes.push(h);
  });
  for (const h of heroes) { heroStat(h); h.hp = h.maxHp; units.push(h); }
  camX = clamp(player.x - VW / ZOOM / 2, 0, WORLD.w - VW / ZOOM);
  camY = clamp(player.y - VH / ZOOM / 2, 0, WORLD.h - VH / ZOOM);
  bindBar();
  started = true;
  feed('Destroy the enemy core. Jungle camps grant buffs.');
  tryMusic();
}

(async function boot() {
  buildGround();
  $('loadmsg').textContent = 'Summoning the lane…';
  await loadAll();
  $('load').classList.add('hidden');
  const hp = $('heroes');
  for (const hk of Object.keys(HEROES)) hp.appendChild(heroCard(hk));
  $('pick').classList.remove('hidden');
  requestAnimationFrame(ts => { last = ts; requestAnimationFrame(frame); });
})();
