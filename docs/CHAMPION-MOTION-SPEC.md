PROJECT DUSKVEIL — CHAMPION MOTION SPEC v1.0
Single-file JS canvas MOBA. Sprite-strip animation (idle/walk/attack sheets) + procedural transform layer. 30 Hz logic tick (dt = 0.0333s) decoupled from rAF render. All champions share one `Unit` model; per-champion data is a config object. Numbers are tuned defaults — ship then taste.

═══════════════════════════════════════════
BUILD ORDER — ranked feel-impact-per-effort
═══════════════════════════════════════════
Do them top-down; each is independently shippable and each makes the game feel better before the next exists.

| # | Feature | Effort | Why it's this high |
|---|---|---|---|
| 1 | Windup/cooldown attack timer + procedural cast-raise | S | The entire "MOBA feel" lives here. No new art needed. |
| 2 | Attack-move + stutter-step kiting seam | S | Turns clicking into skill. Pure logic on top of #1. |
| 3 | Procedural motion layer (bob/lean/turn-lerp) | S | Makes ANY sprite sheet read as alive & weighted. 40 lines. |
| 4 | On-hit flinch + hitstop + hit-spark + dmg number | S | Biggest per-line "weight" upgrade in 2D combat. |
| 5 | Homeguard decaying-buff juice (trail+speedlines) | M | One buff, but the pattern generalizes to ALL buffs. |
| 6 | Idle base-bob + fidget timer | S | Cheap "alive". Reuses idle sheet. |
| 7 | Level-up radial ring + flash | S | One-shot VFX, no art. |
| 8 | Recall channel + interrupt + ring | M | Personality + map-readable tension. |
| 9 | Death one-shot + fade-to-grey + respawn timer | M | Punctuation; needs a death sheet or a keyed collapse. |
| 10 | Per-champion archetype tuning + 5 sprite regens | L | The differentiation pass; art-gated. |

Signature moment budget: LIORA's R lift-and-fire (§1) is the one hand-authored showpiece. Build everything else generic; splurge there.

═══════════════════════════════════════════
SHARED UNIT MODEL (referenced by all sections)
═══════════════════════════════════════════
```
Unit = {
  x, y, vx, vy,              // world units (100u ≈ champion diameter)
  ms: 340,                   // base move speed u/s
  radius: 32, attackRange: 220, acqRange: 340,
  facing: 1,                 // logical heading: -1 left / +1 right (snap instantly)
  visualFacing: 1,          // lerped toward facing for sprite flip/skew
  state: 'IDLE',            // IDLE MOVING WINDUP COOLDOWN CAST RECALL DEAD
  attackSpeed: 0.67,        // attacks/sec (Lux-ish)
  windupPct: 0.32,          // ranged; melee 0.25
  atkTimer: 0, atkPhase: null,
  anim: {sheet:'idle', frame:0, t:0, fps:12},
  proc: {bob:0, lean:0, castRaise:0, flinch:0, squash:1}, // procedural offsets
  idleTime: 0, buffs: [], hp, maxHp, level:1
}
```
Draw order per unit each frame: shadow ellipse → sprite (with proc transforms) → ground-plane telegraphs are drawn in a SEPARATE pre-pass beneath all units → floating text/VFX above.

═══════════════════════════════════════════
(1) LIORA / LUX MOVEMENT SPEC
═══════════════════════════════════════════
Identity: light mage, wand-led, buoyant, "on her toes." Head stays level (composed); everything routes through the crescent-topped staff; skirt+cape lag 2–4 frames behind every action. Base AS 0.67, auto windup 15.6% of cycle, range 220 (=550 LoL scaled). Casts Q/W/E = 0.25s; R = 1.0s charge.

── SPRITE SHEETS TO REGEN (horizontal strips) ──
Frame canvas 256×256, pivot at feet-center. Draw wand extended so the crescent is the aim point. All strips share the same rig/proportions/pivot so procedural code composites cleanly.

• liora_idle.png — 6 frames @ 8fps (0.75s loop). Contrapposto, weight on one hip, wand held lightly across body, chest breathing rise.
• liora_idle_fidget.png — 8 frames @ 12fps, one-shot. The baton wand-twirl; eye flicks to crescent head.
• liora_walk.png — 8 frames @ 14fps. Toe-led light cadence, subtle float at top of each step, hips gentle sway, wand carried high & counter-rotating, off-arm loose swing, skirt trailing back.
• liora_attack.png — 5 frames @ 20fps: [0 gather, 1 draw-back/up, 2 RELEASE thrust-forward (bolt spawns here), 3-4 settle back to carry].
• liora_cast_thrust.png — 4 frames (Q): square-up → sharp forward point.
• liora_cast_twirl.png — 5 frames (W & E): wand baton-spin → sweep-forward (W) / lofted overhand lob (E).
• liora_cast_ult.png — 8 frames (R): [0-3 raise staff overhead in BOTH hands, coil down] → [4 HADOUKEN two-palm thrust, feet leave ground, legs point fire-dir] → [5-7 hold fired pose].
• liora_death.png — 6 frames @ 10fps one-shot: light-dissolve collapse.

── RUN (procedural on top of walk sheet) ──
Sheet gives the leg cadence; procedure gives the buoyancy, lean, and cloth-lag feel.
```
// per tick when MOVING
u.anim.fps = 14 * (currentMS / u.ms);         // faster gait when hasted (couples to speed)
u.proc.lean = lerp(u.proc.lean, 6*facing, 0.15);   // torso tips 6px into travel dir
u.proc.bob  = Math.sin(u.anim.t*Math.PI*2*2) * 3;  // 3px vertical float, 2 cyc/step
// wand counter-rotation & skirt lag are baked in the sheet; procedure adds the FLOAT:
u.proc.softLift = Math.max(0, Math.sin(u.anim.t*Math.PI*2)) * 2; // extra air-time
```
Turn (§2 turn-rate rule): logical `facing` snaps instantly; `visualFacing` lerps over ~7 frames so she "leads with the shoulders/wand" — the skirt-whip is the lag. On a >90° heading change, fire a one-shot 4-frame skirt-sweep overlay.

── IDLE ──
```
if (speed<2 && u.state=='IDLE'){
  u.idleTime += dt;
  u.proc.bob = Math.sin(now*1.6)*2;            // gentle breathing, 1.2s-ish
  if (u.idleTime > 8 && rand()<dt/2){          // fidget after 8s, occasional
    playOneShot('idle_fidget'); u.idleTime = -rand(6..12); // re-roll window
  }
} // ANY order snaps idleTime=0 and cancels the fidget instantly
```

── AUTO-ATTACK (windup→release→recovery) ──
Uses the shared timer (§2). Total cycle = 1/0.67 = 1.49s. Windup = 1.49×0.156 = 0.233s (she must stand still). Bolt spawns at end of windup from crescent tip (missile speed ~640 scaled). Recovery = rest of cycle, freely cancelable = the kiting seam.
```
// procedural cast-raise layered over the attack sheet so short AS reads as "flicks":
if (phase=='WINDUP') u.proc.castRaise = lerp(u.proc.castRaise, 8, 0.4); // wand draws up 8px
if (phase=='COOLDOWN') u.proc.castRaise = lerp(u.proc.castRaise, 0, 0.25); // eases to carry
```
Free-hand "gather light" spark VFX during windup at crescent; crisp forward extension on release frame.

── ABILITY CASTS (each = a sheet + a procedural signature + castTime lock) ──
Cast roots her for `castTime`; movement re-enabled after. Every cast ends with cloth overshoot (procedural: `proc.clothOvershoot` decays over 6 frames).

Q — Light Binding (root skillshot) · castTime 0.25s · straight thrust.
```
sheet='cast_thrust'; proc.lean=10*aimDir;  // punchy, committal, minimal flourish
spawnMissile(crescentPos, aimDir, speed=480, onHit=root(1.5s));
```
W — Prismatic Barrier (boomerang shield) · 0.25s · wand-twirl-sweep.
```
sheet='cast_twirl'; proc.wandSpin=TWO_PI over castTime; // the baton signature
spawnBoomerang(aimDir, outDist=260, returns=true); // arc mirrors wand sweep
```
E — Lucent Singularity (zone AoE) · 0.25s · twirl→lofted lob, then a detonate flick.
```
sheet='cast_twirl'; proc.wandRaise=12;  // slightly overhand, presentational
spawnLobSphere(targetZone, slowField=true);
// detonation = separate quick input: playOneShot 2-frame wand-flick, pop the sphere.
```
R — Final Spark (THE signature) · castTime 1.0s · SHOWPIECE.
```
// Anticipation (1s): raise staff overhead both hands, paint a RED AIM LINE down beam path
sheet='cast_ult'; proc.castRaise = ease(0→22, over 1.0s);
drawGroundTelegraph(redLine, len=1360, width=80); // the tell/counterplay window
// Release frame (frame 4): the lift-and-align — the one hand-authored moment
proc.airLift = 14;                       // she floats 14px off ground
proc.legPoint = fireDir;                 // legs rotate to point down the beam
screenPunch(4px); fireBeam(width=80, sustain=0.4s);
// Recovery: hold fired pose during sustain, then settle airLift→0, castRaise→0,
//           cloth billows out & settles with overshoot.
```

═══════════════════════════════════════════
(2) MOVEMENT-FEEL RULES (canvas-engine pseudocode)
═══════════════════════════════════════════
Core doctrine: latest-command-wins with ≤1-tick delay; logical facing instant; attack roots only for a cancelable windup; firing commits for 2 grace ticks; cooldown is 100% free to move; kiting is EMERGENT, never scripted.

── 2.1 ATTACK TIMER (windup/cooldown) — the heart ──
```
function tickAttack(u){
  const T = 1 / clamp(u.attackSpeed, 0.2, 3.003);
  if (u.atkPhase=='WINDUP'){
    u.atkTimer += dt;
    const windup = T * u.windupPct;
    if (u.atkTimer >= windup - dt && u.atkTimer < windup) u.uncancellable = true; // last tick locked
    if (u.atkTimer >= windup){ fireProjectile(u); u.atkPhase='COOLDOWN';
      u.atkTimer = 0; u.postFireLock = dt; }              // 1-tick post-fire lockout
  } else if (u.atkPhase=='COOLDOWN'){
    u.atkTimer += dt;
    if (u.postFireLock>0) u.postFireLock -= dt;            // commands blocked this tick only
    if (u.atkTimer >= T*(1-u.windupPct)) u.atkPhase=null;  // free to re-acquire
  }
}
function startWindup(u,target){ u.state='WINDUP'; u.atkPhase='WINDUP';
  u.atkTimer=0; u.uncancellable=false; u.vx=u.vy=0; faceInstant(u,target); }
```

── 2.2 ANIMATION-CANCEL / ATTACK-RESET ──
```
function resetAttackTimer(u){ // any dash/reset-ability calls this
  if (u.atkPhase=='COOLDOWN'){ u.atkPhase=null; u.atkTimer=0; }   // GOOD: skip backswing → new windup now
  else if (u.atkPhase=='WINDUP' && !u.uncancellable){
    u.atkPhase=null; u.atkTimer=0; u.state='IDLE'; }              // cancels: NO shot fired (the risk)
  // during the uncancellable last tick: ignore — commitment is locked
}
// A move command during COOLDOWN cancels the recovery half cleanly (the kite seam);
// during WINDUP (if cancelable) it aborts the attack with no shot — punished by wasted wind-up.
```

── 2.3 STUTTER-STEP / KITING (emergent, player-driven) ──
```
// Not scripted. Player primitives make it fall out of 2.1/2.2:
// A) attack-move → startWindup → fire (windup must fully play)
// B) after postFireLock clears, a move command in COOLDOWN is free → reposition
// C) before atkPhase clears, next attack-move re-acquires → new windup
// Keep auto-chase SLIGHTLY imprecise (don't perfectly snap to range) so manual > auto:
function autoChase(u,t){ const stop=u.attackRange+t.radius;
  if (dist(u,t) > stop*1.04) moveToward(u,t);   // 4% slop → manual stutter strictly better
  else if (!u.atkPhase) startWindup(u,t); }
// Ranged (bigger windupPct + range) gets more cooldown to reposition → smoother kite.
```

── 2.4 ATTACK-MOVE (the input backbone) ──
```
function onAttackMoveClick(u, cursor){         // A+click OR shift-rightclick (single bind)
  const scanOrigin = OPT.attackMoveOnCursor ? cursor : u.pos;
  const enemy = nearestEnemyWithin(scanOrigin, u.acqRange);
  if (clickedDirectlyOn(cursor)?.isEnemy) u.order={type:'ATTACK', t:clickedEnemy};
  else if (enemy) u.order={type:'ATTACK', t:enemy}; // acquire the instant one enters range
  else u.order={type:'MOVE_THEN_SCAN', dest:cursor}; // walk toward, keep scanning acqRange
}
// MOVE_THEN_SCAN: each tick, if nearestEnemyWithin(u.pos,acqRange) → stop & startWindup.
// A misclick walks you, it never right-clicks you out of position — that's the whole point.
```

── 2.5 TURN RATE (responsiveness lever) ──
```
function faceInstant(u,target){ u.facing = (target.x>=u.x)?1:-1; } // LOGICAL: snap, zero cost
function tickVisualTurn(u){    // VISUAL only — never gates velocity
  u.visualFacing = lerp(u.visualFacing, u.facing, 0.18);          // ~7-frame ease
  u.proc.turnSkew = (u.facing - u.visualFacing) * 6;              // shoulder-lead skew px
  if (Math.sign(u.facing)!=Math.sign(u.lastFacing)) fireClothSweep(u); // cloth whips a beat later
}
// Movement is ALWAYS turn-free; the sprite catches up. Weight lives in the sprite, not the sim.
```

── 2.6 STOP (S) / HOLD (J) ──
```
function stopCmd(u){ u.order=null; u.vx=u.vy=0; u.autoAcquire=false;   // cancels moves AND acquisition
  if (u.atkPhase=='WINDUP' && !u.uncancellable){ u.atkPhase=null; } }  // holds until next order
function holdCmd(u){ u.vx=u.vy=0; u.chaseSuppressed=true;             // won't chase
  /* but STILL attacks anything already in attackRange */ }
```

── 2.7 HOMEGUARD SPEEDUP ──
```
function applyHomeguard(u){                        // on leaving fountain, gameTime>20s
  u.buffs.push({ id:'homeguard', dur:4,
    ms:(t)=>lerp(1.8, 1.4, 1 - t/4),               // +80%→+40% over 4s (pre-14min); later 2.5→1.4
    endOnCombat:true, juice:'trail' });
}
function currentMS(u){ let m=u.ms;                  // multipliers stack; soft-cap the total
  for(const b of u.buffs) if(b.ms) m*=b.ms(b.dur - b.t);
  if(m>415) m=415+(m-415)*0.8; if(m>490) m=490+(m-490)*0.5; return m; }
// Any hit taken/dealt → drop endOnCombat buffs immediately (see §3 for the trail juice).
```

═══════════════════════════════════════════
(3) INTERACTION / JUICE LAYER
═══════════════════════════════════════════
Doctrine: personality in the dead time (idle/recall/spawn/death — long, characterful), feel in the live time (hit/cast/level — short, radial, hitstopped). Reserve radial+vertical motion for high-priority events (play is horizontal, so radial pops). Every VFX answers "whose is it?" by color (blue/green ally, red enemy) before "what is it?".

── 3.1 IDLE FIDGETS ── (see §1 idle block)
Base bob always when v≈0; one-shot fidget after 8s idle, re-roll 6–12s, cancel on any order.

── 3.2 ON-HIT FLINCH + HITSTOP (highest ROI juice) ──
```
function onHit(victim, dmg, isCrit){
  victim.proc.flinch = 5;                          // 5px knockback-then-return, additive
  victim.proc.squash = 0.90;                       // squash, eases back to 1 over 4-6 frames
  spawnHitSpark(impactPt, isCrit);
  spawnDamageNumber(dmg, isCrit?BIG_HOT:NORMAL, colorBy(attacker));
  const stop = isCrit ? 4 : 2;                      // HITSTOP: freeze BOTH units N render frames
  freezeFrames(attacker, stop); freezeFrames(victim, stop);
  screenShake(clamp(dmg*0.02, 1, 3));              // 1-3px decaying
  if (victim.isLocalPlayer) redVignette(0.4);
}
// flinch is ADDITIVE over current anim — never a full interrupt; you keep control.
// tick: victim.proc.flinch = lerp(flinch,0,0.35); squash = lerp(squash,1,0.3);
```

── 3.3 HOMEGUARD RUN JUICE (the decaying-buff pattern for ALL buffs) ──
```
function tickHomeguardJuice(u,b){
  const frac = b.ms(b.dur-b.t) - 1;                // current bonus fraction (0.8→0.4→0)
  if (frameEvery(60)) spawnGhostSprite(u, alpha=frac*0.6);  // motion trail, thins as buff decays
  drawSpeedLines(u, alpha=frac);                   // intensity == live buff value
  u.anim.fps = baseFps * (1+frac);                 // faster gait + faster footstep SFX cadence
}
// RULE: every temp buff gets a decaying visual whose intensity IS the current buff number —
// players watch it run out. Ends instantly on combat.
```

── 3.4 LEVEL-UP SHIMMER ──
```
function onLevelUp(u){
  spawnRadialRing(u.feet, scale:1→3, alpha:1→0, dur:0.5);   // radial = pops in chaos
  spawnLightColumn(u, up, dur:0.4);                          // vertical
  u.proc.whiteFlash = 1;                                     // additive full-sprite, decays 1 frame in
  playSting('levelup_rise');                                 // ascending pitch = good
}
```

── 3.5 ABILITY-READY SHIMMER ──
```
onCooldownFinish(ability){ hudGlintSweep(ability.icon, 250ms);
  playTick('ready'); u.proc.readyPulse[ability]=1; }  // small on-champ weapon-glow, 1 cycle
onCooldown: radialWipeDarken(icon, timeLeft/cd); desaturate(icon);
```

── 3.6 RECALL ──
```
function startRecall(u){ u.state='RECALL'; u.recallT=0; u.recallDur= empowered?4:7; }
function tickRecall(u){
  u.recallT += dt;
  drawGroundRing(u.feet, fill = u.recallT/u.recallDur);      // whole map reads the progress
  spawnAscendShimmer(u); playRisingTone(u.recallT/u.recallDur);
  playLoop('recall_perf', u);                                // wand-twirl escalation = personality
  const grace = u.recallDur - 0.3;                           // last 0.3s uninterruptible
  if ((tookDamage(u)||wasCC(u)||gotMoveOrder(u)) && u.recallT < grace){
    particleShatter(u); playSound('fail_descend'); u.state='IDLE'; return; }
  if (u.recallT >= u.recallDur){ flash(u); upwardWhoosh(u); fadeOut(u); teleportToBase(u); }
}
```

── 3.7 DEATH ──
```
function onDeath(u){ u.state='DEAD';
  playOneShot('death', u, {unskippable:true, dur:0.8});     // the one place motion runs long
  spawnSoulParticles(u); playVoice(u,'death_line');
  after(0.8, ()=> fadeToGrey(u.corpse) );
  showRespawnTimer(u.pos, u.respawnSecs);                    // greyed countdown at the spot
}
// Spawn (mirror): scale 0.6→1 + alpha 0→1 over 350ms ease-out + materialize poof + spawn voice line.
```

Audio-motion coupling (do this or animation reads flat): 3-part per ability — windup cue → release whoosh → impact thud, unique timbre each. Footsteps tempo-locked to `anim.fps` (so Homeguard auto-speeds steps). Ascending pitch = good (ready/level/recall-success), descending/shatter = bad (recall-break/death). Event barks on spawn/first-blood/kill/low-health(<15%)/recall — the barks carry most of the personality.

═══════════════════════════════════════════
(4) PER-CHAMPION MOVEMENT ARCHETYPE
═══════════════════════════════════════════
Each maps a research archetype to one config + one procedural signature + a sprite-regen seed. Ranked by how much the archetype changes the felt movement.

LIORA — Mage / kiter (the girl character). windupPct 0.32, AS 0.67, range 220, MS 340, turn-lerp 0.18 (snappy). Locomotion sells "hard-ish to catch but not mobile": light toe-led gait with the procedural buoyant float (§1), head held level, wand-led. No dash — 100% of her survival is the stutter-step seam (§2.3) plus a Get-Excited-style +40% decaying MS on takedown reusing the §3.3 buff-juice. Signature proc: `wandSpin`/`castRaise` route every cast through the crescent; R lift-and-fire is her one showpiece. Feel: readable telegraphs, elegant, the baseline kiter.
Regen seed: "A poised young light-mage in a flowing white-and-gold dress, crescent-topped wand/staff, buoyant ballet carriage, chin up, skirt and short cape trailing — top-down 3/4 game sprite, clean rim-lit cel style, neutral idle + walk + wand-thrust attack strips, consistent rig and feet-center pivot, transparent bg."

RAVENER — Assassin (Zed/Yasuo lens). windupPct 0.20, AS 0.85, range 60 (melee), MS 345. Low coiled crouch-run; idle reads tense-and-ready. Mobility is the archetype: a swap-blink (Zed W — dash a shadow, recast to trade places, needs a PERSISTENT on-screen destination arrow even though the blink is instant, §2 rule H) and an R lunge-PAST that arrives behind the target (untargetable during the dash). Hand-author the cancel exception: his shuriken cast does NOT lock out the swap (§2.2 carve-out) so the combo flows. Feel: mobility as a committed pose + point-of-no-return.
Regen seed: "A lithe demon assassin in dark segmented armor, glowing red eyes, twin curved blades, low predatory crouch, shadow-smoke wisps — top-down 3/4 sprite, crouch-run + blade-flick attack + dash-lunge strips, consistent rig, transparent bg."

CORWEN — Bruiser (Garen/Sett lens). windupPct 0.25, AS 0.60 (slow, committed), range 70, MS 335, radius 40 (bigger base). Low center of mass, wide planted stance; heavy armored jog with pronounced vertical bob and hard even foot-plants (procedural: bigger `proc.bob` amplitude 5px, slow `visualFacing` lerp 0.10 = weighty turns). Weight lives in the RECOVERY: big overhand chop with a slow settle, not a snap-back (long cooldown-half animation). Ult = verticality-equals-finality: raise sword-of-light high, hold a beat, drive DOWN. Add hitstop 4 frames on his hits (§3.2). Feel: immovable, earned power.
Regen seed: "A broad gold-plated paladin bruiser, oversized two-handed sword, triangular wide-legged stance, low heavy center of mass, cape — top-down 3/4 sprite, armored heavy jog + overhead-chop attack + downward-slam ult strips, consistent rig, transparent bg."

BASTILLE — Marksman (Jinx/Ezreal lens). windupPct 0.30, AS 0.62 ramping, range 260 (longest), MS 330. Loose top-heavy sprint, weapon-swing instability. Two auto states with different sheets/stats: a short-windup rapid mode whose `anim.fps` and `attackSpeed` visibly RAMP up the longer it fires (spin-up, couple fps to AS, §2 rule B), and a long-windup heavier long-range mode. No blink — pure kiter, reward the stutter-step seam hardest here (most cooldown time to reposition). Feel: "the reward for spacing is speed"; the AS stat is FELT via animation compression.
Regen seed: "A wiry mech-rig marksman with a heavy shoulder-mounted cannon and a rapid-fire sidearm, top-heavy unstable posture, exhaust vents, hazard-stripe accents — top-down 3/4 sprite, loping run + two distinct weapon-fire strips (rapid vs heavy), consistent rig, transparent bg."

SOVEREIGN — Capital ship / immobile artillery (Xerath/Syndra/Morgana lens). windupPct 0.35, AS 0.55, range 340 (huge), MS 300 (slowest). Does NOT walk — it HOVERS/glides: kill footfall entirely, replace walk sheet cadence with a slow floating bob (`proc.bob = sin*4`, constant even at rest), engines/robes stream behind as the secondary-motion engine so it reads "alive" while stationary. Deliberately least-mobile: no dash, slow deliberate glide = the "glass cannon that cannot escape" promise. Signature = the CHARGE/CHANNEL: Q winds up over 1.5s with range growing and a self-slow 0%→40% (power=time=vulnerability, rooted telegraph); R is a channeled multi-shot barrage with a per-shot arm-punch cadence so enemies dodge between beats. Externalize state into the world (persistent placed zones). Feel: rooted artillery, biggest power gated behind the most exposed pose.
Regen seed: "A colossal hovering arcane battlecruiser-being, no legs, containment-shell torso with churning energy inside, streaming banner-robes, drifting above the ground — top-down 3/4 sprite, floating idle-bob + arm-raise energy-lob + arms-spread channel-barrage strips, consistent rig and hover pivot, transparent bg."

Cross-champion procedural knobs that carry the archetype for free (no new art): `windupPct`, `attackSpeed`, `attackRange`, `MS`, `visualFacing` lerp rate (turn weight), `proc.bob` amplitude, and whether locomotion uses foot-cadence (Liora/Corwen/Ravener/Bastille) or hover-bob (Sovereign). Tune those five sliders per champ before touching art.