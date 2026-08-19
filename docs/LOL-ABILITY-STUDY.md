# PROJECT DUSKVEIL — Ability Design Implementation Spec
*Synthesis of the Mechanics / VFX / Kits research into one buildable document for the single-file JS canvas MOBA. Units: px, ms, HP. Assumes an entity system with `update(dt)`, `draw(ctx)`, a `projectiles[]` array, and per-champion `cd{}` cooldown map.*

**Governing law (Riot GDC 2013):** power is paid for with a counterplay window — travel time, windup, telegraph, resource, or cooldown. Every ability below states its payment. Second law: **the telegraph IS the hitbox** — one geometry object drives both the draw call and the collision test.

---

## SECTION 1 — TOP 12 MECHANICS, ranked by feel-impact ÷ implementation cost (2D canvas)

### 1. Skillshot projectile with 4-state lifecycle — **everyone; flagship: LIORA Q**
- **What:** dodgeable missile; birth (muzzle flash) → travel (bright core + fading tail) → impact (burst) → dissipate. Whiff = full cooldown lost.
- **League:** Morgana Q Dark Binding (longer root = slower, narrower missile).
- **Implement:**
```js
class Proj { constructor(x,y,dir,spd,w,onHit){ Object.assign(this,{x,y,dir,spd,w,onHit,age:0,hist:[],state:'travel'}); }
 update(dt){ this.hist.push({x:this.x,y:this.y}); if(this.hist.length>8)this.hist.shift();
  this.x+=this.dir*this.spd*dt; for(const e of enemies)
   if(this.state=='travel' && Math.abs(e.x-this.x)<e.r+this.w && Math.abs(e.y-this.y)<e.r+this.w)
    { this.onHit(e); this.state='impact'; this.age=0; }
  if((this.age+=dt)>0.15 && this.state=='impact') this.dead=true; }
 draw(c){ this.hist.forEach((p,i)=>{c.globalAlpha=i/8; c.fillRect(p.x-2,p.y-2,4,4);}); /* core+tail */ } }
```
- **Rule:** damage/CC scales with slowness+narrowness. Root ≥1.5s → speed ≤ 700px/s.

### 2. Ground telegraph with time-remaining fill — **SOVEREIGN R, LIORA E**
- **What:** danger zone drawn on a decal layer (above terrain, below units) that fills radially toward detonation. The red circle IS the counterplay: a reaction test, not a prediction test.
- **League:** Ziggs R, Xerath R, Veigar E.
- **Implement:**
```js
class Telegraph { constructor(x,y,r,delay,onPop){ Object.assign(this,{x,y,r,delay,t:0,onPop}); }
 update(dt){ if((this.t+=dt)>=this.delay){ for(const e of enemies)
   if(dist(e,this)<this.r+e.r) this.onPop(e); this.dead=true; spawnBurst(this.x,this.y,this.r);} }
 draw(c){ c.strokeStyle='rgba(255,60,40,.9)'; c.beginPath(); c.arc(this.x,this.y,this.r,0,7); c.stroke();
  c.fillStyle='rgba(255,60,40,.25)'; c.beginPath();
  c.arc(this.x,this.y,this.r*(this.t/this.delay),0,7); c.fill(); } } // inner circle GROWS to rim = timer
```
- **Rule:** same `{x,y,r}` object feeds draw AND hit test. Never hand-tune the sprite separately.

### 3. Execute threshold with a visible kill-line — **CORWEN R**
- **What:** damage scaling with missing HP, plus a marker drawn ON the enemy health bar showing "below this line, you die." Converts math into dread.
- **League:** Pyke R (flat threshold, drawn on screen), Garen R, Urgot R.
- **Implement (~12 lines):**
```js
function executeDamage(caster,t){ return 150 + 0.6*(t.maxHp - t.hp); } // missing-HP scale
// in enemy healthbar draw, when CORWEN's R is off cooldown and enemy in range 260:
const thresh = solveThreshold(corwen, e);            // hp value at which executeDamage >= hp
const px = barX + barW * (thresh / e.maxHp);
ctx.fillStyle = e.hp <= thresh ? '#ffd700' : '#fff'; // GOLD when lethal — the tell both players read
ctx.fillRect(px, barY-2, 2, barH+4);
if (e.hp <= thresh) e.healthbarPulse = true;
```
- **Counterplay:** shields/heals move you above the line; the line is visible to the victim too.

### 4. Mark → detonate weave passive — **LIORA passive**
- **What:** spells brand the target for 5s; next basic attack consumes the brand for bonus damage. Forces spell→walk-in→auto rhythm instead of max-range spam.
- **League:** Lux P Illumination.
- **Implement:** `e.marks.liora = {t:5}` on spell hit; draw a small sigil over the head; in LIORA's autoattack resolve: `if(e.marks.liora){ dmg += 40+10*liora.level; delete e.marks.liora; flash(e); }`. ~10 lines. Decay in the enemy's update.

### 5. Recharging shield on unhit-timer — **CORWEN P, SOVEREIGN P**
- **What:** free shield = %maxHP that regenerates after N seconds without taking champion damage. Rewards trade-timing; makes poke answerable without heals.
- **League:** Malphite P Granite Shield.
- **Implement:** `this.lastHit += dt; if(this.lastHit > 4 && this.shield < cap) this.shield = cap;` — damage pipeline already subtracts `shield` first and resets `lastHit=0`. Draw as a grey overlay segment on the HP bar + faint hex ring around sprite (under-layer, per VFX rule 8). ~8 lines.

### 6. Body-attached AoE DPS (the spin) — **CORWEN E**
- **What:** N-second channel dealing damage/tick to everything overlapping the caster's body while he keeps walking. A walking hazard that punishes clumping.
- **League:** Garen E Judgment (bonus vs single target).
- **Implement:** `if(this.spinning){ this.spinT-=dt; this.tick-=dt; if(this.tick<=0){ this.tick=0.33; const hits=enemies.filter(e=>dist(e,this)<90); for(const e of hits) damage(e, hits.length==1? dps*1.25: dps, this); } }` + rotating blade sprites. ~14 lines.

### 7. Weapon stance toggle — **BASTILLE Q**
- **What:** every basic attack routed through the current stance: gatling (single-target, ramping AS) vs cannon (splash, +25% range, heat cost). Makes plain autos a decision.
- **League:** Jinx Q Switcheroo.
- **Implement:** `this.stance='gat'|'can'`; in the autoattack function `if(stance=='can'){range=380;heat+=8;splash(target,60,dmg*0.7);}else{range=300;this.ramp=Math.min(this.ramp+1,4);/*+12% AS per*/}`; ramp resets on stance swap or 2.5s without attacking. ~15 lines.

### 8. Skillshot-hit CDR engine — **BASTILLE passive**
- **What:** every landed skillshot refunds cooldown across the kit. Hitting shots makes everything come back faster — the spam-poke dopamine loop.
- **League:** Ezreal Q (−1.5s on hit).
- **Implement:** in every BASTILLE projectile's `onHit`: `for(const k in bastille.cd) bastille.cd[k]=Math.max(0,bastille.cd[k]-1.0);` plus a brief blue flash on the ability icons. 4 lines. Highest feel-per-line in this document.

### 9. Visible N-hit stack pips with payoff + immunity window — **RAVENER passive**
- **What:** hits apply stacks drawn as pips over the enemy's head; at 3, detonate (bonus damage + brief slow), then a per-target immunity so it can't chain. Readable by BOTH sides — disengage at 2 pips is real counterplay.
- **League:** Vayne W, Braum P (with 6–8s immunity), Electrocute.
- **Implement:** `e.swarm={n:0,t:3,immune:0}`; on RAVENER damage: `if(e.swarm.immune<=0 && ++e.swarm.n>=3){ damage(e, 30+8*lvl+0.04*e.maxHp); slow(e,0.3,1); e.swarm={n:0,immune:5}; }`; draw `n` purple pips at `e.x-10+i*10, e.y-e.r-14`. ~12 lines.

### 10. Two-stage mark-then-dash — **RAVENER Q**
- **What:** skillshot sigil; on hit, re-cast within 3s to dash to the marked target with missing-HP bonus damage. The dodge happens at the mark, so the dash can be guaranteed.
- **League:** Lee Sin Q Sonic Wave / Resonating Strike.
- **Implement:** projectile `onHit: e=>{ravener.markT=3; ravener.markTarget=e;}`; Q pressed again while marked: `this.dashing=true; this.dashTo=markTarget;` in update lerp at 1400px/s toward the (moving) target, on arrival `damage(t, 70 + 0.35*(t.maxHp-t.hp))`. ~18 lines. The `markT` countdown ring around the Q icon is mandatory.

### 11. Directional launch — target becomes a projectile — **RAVENER R**
- **What:** knock the target flying down-lane; every enemy they collide with takes damage and is knocked down. In a 1-axis 2D lane, "kick them into their own team" is always legible — this is the InSec made native.
- **League:** Lee Sin R Dragon's Rage.
- **Implement:** convert the victim into a temp projectile: `t.launched={vx:dir*900, t:0.8}`; in the enemy update, while launched, move by `vx`, decelerate, and `for(const o of enemies) if(o!=t && dist(o,t)<o.r+t.r && !o.hitByLaunch){ damage(o,ultDmg*0.75); knockdown(o,0.75); o.hitByLaunch=true; }`; launched target ignores its own input. ~20 lines. Knock-up/launch **bypasses tenacity** (League rule) — its payment is that R is melee-range only.

### 12. Unstoppable off-screen drop engage — **SOVEREIGN R**
- **What:** the ship flies up off-screen (untargetable), a shadow telegraph appears at the target point, 1.2s later it crash-lands: AoE damage + knock-up. Flight is the one honest way a 2D game does Malphite-over-the-wall.
- **League:** Malphite R Unstoppable Force.
- **Implement:** state machine `'ascend'(0.4s, sprite scales up + fades)` → `'hover'(shadow Telegraph from mechanic #2, ellipse growing darker)` → `'slam'(reuse Telegraph.onPop: damage + airborne(1.1s) + screenShake(8,300ms))`. Untargetable = skip SOVEREIGN in all hit tests while state≠ground. ~20 lines on top of mechanics #2.

**Cut but cheap, folded into kits below:** arming ground traps (Jinx E → RAVENER W), distance-scaling pierce shot (Jinx/Ashe R → BASTILLE R), breakable wall cage (Thresh R → SOVEREIGN E), heat resource (BASTILLE), takedown surge (Jinx P → BASTILLE).

---

## SECTION 2 — TOP 10 VFX PRESENTATION RULES (adopt verbatim)

1. **Visual impact = gameplay impact.** Four hardcoded tiers — AA / basic spell / big spell / ult — each with a clamp table: `TIER=[{r:8,blur:0,parts:4,shake:0},{r:16,blur:6,parts:12,shake:0},{r:28,blur:12,parts:24,shake:3},{r:48,blur:20,parts:48,shake:8}]`. A poke spell may never out-render an ult.
2. **Anticipation before payload.** 150–400ms cast phase (caster flash-pose + growing charge glyph) before any hitbox exists. Damage never spawns on the input frame except basic attacks. This windup is a universal balance tax (Riot's hook-windup rule) — it is counterplay, not polish.
3. **The telegraph is the hitbox.** One geometry object → both `draw()` and collision. No hand-tuned indicator sprites, ever.
4. **Reserved indicator palette.** Enemy telegraph fill `rgba(255,60,40,0.25)` + solid rim; ally `rgba(60,255,120,0.15)`; self-aim reticle a distinct cyan. Champion thematic VFX may NOT use saturated alarm-red fills (RAVENER is *purple*-demon, not red, for exactly this reason).
5. **Triple-channel hit confirm:** (a) victim sprite white-tint 2–4 frames (`source-atop` overlay), (b) impact sound, (c) 50ms hitstop **on tier-3+ hits only** (hitstop on everything = mush), plus a floating damage number.
6. **Value discipline:** sustained effects live 15–85% value; near-white is reserved for the 1–3 frame impact flash — so white still *means* something.
7. **One dominant hue + one accent per ability**, coding effect type game-wide: physical=orange · magic=blue/purple · true/execute=**white-gold** · heal=green-gold · shield=pale-yellow. Roster mapping: CORWEN gold/white · LIORA white/sky-blue · BASTILLE orange/steel · RAVENER purple/black · SOVEREIGN teal/gunmetal. All particles for an ability generate from its 2-color ramp.
8. **Silhouette first, caster stays readable.** Test each effect rendered in solid black — if you can't tell what it does, redesign. Self-buffs draw as under-layer ring + sparse over-particles, never an opaque blob on the sprite. Hard-edged shapes = damage; soft round = buff/heal.
9. **Timing asymmetry:** ease-in charge 200–400ms → snap payoff <100ms → subdued ease-out 300–600ms; cap live particles (~300) and cull oldest-lowest-tier first. Nothing lingers past 0.5s after its job is done.
10. **Ult ceremony is exclusive.** Screen shake, edge vignette/tint, sound sting, lingering scorch decal — reserved for ults and executes ONLY; the exclusivity is the presence. Death = hitstop + desaturate flash + collapse (never vanish) + fading floor decal; respawn = expanding team-color ring + vertical light streak ~600ms.

---

## SECTION 3 — PER-CHAMPION KIT UPGRADE SPEC

*Format: cooldown | cost | numbers | counterplay. Base assumption: champs ~550–900 maxHP, lane ~1600px visible width, basic attack range melee 90 / ranged 300.*

### CORWEN — Gold Paladin Bruiser (Garen/Malphite chassis)
**P — Bulwark of Dawn** (mechanic #5): shield = 10% maxHP after 4s unhit by champions. Counterplay: chip him to keep it down before committing.
**Q — Censure** — 8s CD. Next basic within 3s: +30% movespeed for 1.2s, bonus 40+15/lvl dmg, **1.25s silence**. (Garen Q — the anti-LIORA tool.) Counterplay: kite the 1.2s speed window; silence is short and melee-delivered.
**W — Aegis Tempo** — 16s CD, active 1s: 60% damage reduction + CC duration −50%. Counterplay: bait it, then commit — it's a reflex check with a long CD.
**E — Radiant Judgment** (mechanic #6) — 11s CD, channel 3s: 25 + 8/lvl dmg per 0.33s tick, radius 90, +25% vs single target. Can move at 85% speed, can't attack. Counterplay: walk out (radius is body-sized); disarm/knockback ends it.
**R — Verdict of Gold** (mechanic #3) — 90/75/60s CD, range 260, targeted hammer-fall with **0.5s windup** (visible raised hammer): 150/250/350 + 60% of target's missing HP as **white-gold** damage. Kill-line drawn on enemy HP bars while R is up. Counterplay: the windup beat (dash out of 260 range), shields fake the threshold, stay above the gold line.

### LIORA — Light Priestess Mage (Lux chassis)
**P — Sanctified Mark** (mechanic #4): spells brand 5s; her next basic detonates for 40 + 10/lvl.
**Q — Chains of Dawn** (mechanic #1) — 10s CD, 55 mana. Skillshot bolt, speed 700px/s, width 24, range 900: **roots first 2 enemies hit 1.75s**, 60/100/140 dmg. Counterplay: slow narrow missile, minion-blockable; whiff = 10s of vulnerability.
**W — Aurora Ward** — 13s CD, 60 mana. Boomerang halo out-and-back 600px: shields allies 60 + 25% AP on each pass (stacks); an ally inside it may press interact to be **pulled 180px toward LIORA** (the Thresh-lantern agency moment). Counterplay: 2.5s shield decay — bait it, re-engage.
**E — Lucent Cage** (mechanic #2) — 9s CD, 70 mana. Telegraph radius 110, 0.9s fill: 70/110/150 dmg + 35% slow 1.5s; recast detonates early. Counterplay: react-dodge the filling circle.
**R — Sunlance** — 70/55/40s CD, 100 mana. **0.75s windup** (kneeling pose + gathering light — both teams see it), then instant full-lane-width beam, height 60: 250/350/450 + detonates ALL Sanctified Marks on screen. Deterministic combo: Q root → E → R while rooted. Screen: white flash frame + edge glow + shake 6 (VFX rule 10). Counterplay: dodge on the Y-axis during windup unless rooted — the root is the real cast; the counterplay lives on Q.

### BASTILLE — Mech Marksman (Jinx/Ezreal chassis)
**Resource: HEAT** 0–100, decays 10/s out of combat; at 100 → 2s vented (no cannon, no W).
**P — Targeting Uplink** (mechanic #8): every landed skillshot −1.0s on all his cooldowns. **Takedown: vent all heat + 4s +30% move/attack speed** (Jinx P surge — the snowball switch).
**Q — Ordnance Swap** (mechanic #7) — no CD, 0.25s swap lock. Gatling: range 300, +12% AS per hit (max 4, decays 2.5s). Cannon: range 380, +8 heat/shot, 70% dmg in 60px splash. Counterplay: cannon poke builds heat toward a vent window — fight him at high heat.
**W — Shock Bolt** — 7s CD, 12 heat. Thin fast skillshot (1100px/s, width 12, range 800): 60/95/130, 40% slow 1s, **reveals** the target 2s. His CDR trigger + pick tool. Counterplay: narrow — sidestep; body-blockable.
**E — Concussion Mine** — 14s CD. Drops 1 mine at his feet, arms 0.5s, lives 5s: first enemy champion on it is **knocked back 140px** + 50 dmg. Self-peel for an immobile carry. Counterplay: visible mine, walk around it.
**R — Cross-Map Railgun** — 100/80/60s CD. **1.0s anchor-down telegraph** (he plants, a full-lane warning line draws — VFX rule 4 enemy palette), then a piercing rail: damage 200/300/400 **ramping +1% per 40px traveled (cap +100%)**; first champion hit is stunned 0.5s + 0.25s per 300px flown (cap 1.5s). Counterplay: he is stationary and interruptible during the anchor (any hard CC cancels, refunds 50% CD); the warning line gives the whole lane a dodge beat on the Y-axis.

### RAVENER — Demon Swarm Assassin (Lee Sin chassis, purple palette per VFX rule 4)
**Resource: ENERGY** 200, +10/s, no scaling — burst-window-limited, not pool-limited.
**P — Devouring Swarm** (mechanic #9): his damage applies stacks; 3 stacks = 30 + 8/lvl + 4% maxHP magic dmg, 30% slow 1s, **then that target is immune to stacks 5s**. Pips visible to both sides — leave at 2 pips.
**Q — Hellmark Lunge** (mechanic #10) — 9s CD, 50 energy (+30 on recast). Sigil skillshot 950px/s, width 20, range 750; on hit, 3s window to recast: dash 1400px/s to the mark, 70/110/150 + 35% of missing HP. Counterplay: dodge the sigil and he has no engage for 9s; the dash is CC-able mid-flight (it's a dash, not a blink — the League mobility ladder).
**W — Imp Snare** — 13s CD, 60 energy. Scatters 3 eggs in a 240px spread, arm 0.5s, live 5s: first champion on each is **rooted 1.0s**; recast while an enemy is rooted: swarm **drags them 120px toward or away** from RAVENER (aim direction). Counterplay: visible eggs, arming delay; the drag telegraphs his kill angle.
**E — Shadow Slip** — 15s CD, 70 energy. 200px dash (not blink); if it passes through an enemy, refund 40 energy + apply 1 swarm stack. Counterplay: grounded/rooted RAVENER can't cast it; forcing E before the fight strands him.
**R — Devourer's Verdict** (mechanic #11) — 90/75/60s CD, melee range 120, 0.3s windup. **Launches the target 900px/s down-lane for 0.8s**; each enemy they collide with takes 150/225/300 ×75% and is knocked down 0.75s; if the victim **dies mid-flight, refund 50% CD**. Launch bypasses tenacity (paid for by melee delivery). Counterplay: he must reach melee through your team; spacing so the flight path hits no one; the 0.3s windup beat.

### SOVEREIGN — Flying Battlecruiser Siege-Tank (Malphite/Thresh chassis)
**P — Hull Plating** (mechanic #5): shield = 12% maxHP after 5s unhit. Largest HP pool in roster (×1.3), slowest base move (×0.85).
**Q — Flak Burst** — 8s CD. Cone 140° forward, range 320: 60/90/120 + **enemy attack speed −40% for 2.5s** (the anti-BASTILLE aura; Malphite E). Counterplay: fight it at range or from behind; melee window is a DPS tax.
**W — Broadside Doctrine** — 18s CD, active 4s: basic attacks gain **+damage equal to 30% of armor** and fire an aftershock volley in a 200px cone at 40%. Armor-stacking becomes offense — the siege-tank is a pilot fantasy, not a sponge. Counterplay: 4s window; kite it out, %maxHP damage (RAVENER's pips) ignores the armor stack.
**E — Suppression Pylons** — 20s CD. Drops two pylons 300px fore and aft, erecting energy **walls** (height of lane, live 4s): an enemy crossing a wall breaks it, taking 80/120/160 + a 70% decaying slow over 1.5s (Thresh R). Turns the ship into mobile terrain — cage a pick, or wall off a retreat. Counterplay: walls break on crossing (pay the toll and it's gone); dashes cross without breaking? **No** — grounded projects can decide later; v1: dashes also break walls and take the slow.
**R — Dreadnought Drop** (mechanics #2+#12) — 110/90/70s CD, cast range 500. Ascends 0.4s (untargetable), shadow telegraph fills 1.2s (radius 130, enemy-red rim), crash: 200/300/400 + **airborne 1.1s** (bypasses tenacity — paid for by the 1.2s telegraph), shake 8, lingering scorch decal 3s. The wombo setup: Drop → team follows → LIORA Sunlance on the knocked-up cluster. Counterplay: 1.2s of a filling red circle is the longest dodge window in the game; while airborne-in-flight SOVEREIGN's team is down its frontline; landing spot is committed at cast.

---

### Build order (dependency-sorted)
1. `Telegraph` + `Proj` classes, tier clamp table, indicator palette, hit-confirm channel (mechanics 1–2, VFX 1–5) — everything else composes from these.
2. Passives: shields, marks, pips, CDR engine (mechanics 4,5,8,9 — ~40 lines total).
3. Kit actives per champion in roster order CORWEN → LIORA → BASTILLE → RAVENER → SOVEREIGN (each later champ reuses more shared machinery).
4. Ult ceremony layer (shake/vignette/decals, VFX 10) last — it's exclusive, so it only ships once ults exist.

**Deliberately not adopted:** infinite stacking (Thresh souls — snowballs too hard with a 5-champ roster), pure-vision abilities (no fog-of-war depth), suppression channels (no cleanse-item economy to counter them), and blink-tier mobility (RAVENER's E is an interruptible dash on purpose — the counterplay ladder stays intact).