## ROSTER + RULES 2026-08-19 (afternoon block)
**SOVEREIGN** (5th legend, Tee's "epic battlecruiser"): VECTRA sky-dreadnought, full pipeline (Grok card/seed/icons + img2video sheets keyed w/ erosion; seed was already top-down 3/4 — the projection critics demand; sample that camera phrasing for future units). **ARAM rules**: all heroes lvl 6 at spawn, 1400 opening gold, 3g/s trickle. **Survivability** (Tee): +45% hero HP, respawn 4+1.5/lvl, real OOC regen. **Champion passives** (docs/LOL-ABILITY-STUDY.md, from the research workflow): Bastille skillshot-CDR, Liora brand→detonate, Ravener 3-hit swarm pop, Corwen/Sovereign recharging shields, Corwen R execute + gold kill-line. Theme music = new EL slow-epic orchestral. Hub OG card = og_epic.jpg (playwright-composited over Grok art). husslai.com/games live (plural, Phillip auto-deploy works now).

## OPEN-SOURCE PIVOT (Tee, 2026-08-19): "use all their logic — recreate LoL with my characters"
Code now PUBLIC at github.com/T-rex247/duskveil under **AGPL-3.0** (Tee accepted open-sourcing; art/characters stay proprietary — assets/ is gitignored, NOTICE + README state the split). This legally unlocks porting LeagueSandbox/LeagueEmulatorJS logic directly. PORTED so far: 30s waves 3 melee+3 caster+siege every 3rd (bounty/xp per type, siege ×2 vs towers), call-for-help sticky minion aggro, tower priority (siege>melee>caster>hero) + hero-protection hold + heat ramp, last-hit gold + presence XP. NEXT to port: fog of war + brush, item/shop system, proper pathfinding, League stat/cooldown formulas. Commit + push every port (the repo is the AGPL compliance).

# duskveil — INDEX

## ⭐ GOLIATH (formerly BASTILLE; hkey/assets still `bastille`) v2 — Diablo-grade kit (Tee 2026-08-21: "each ability like a Diablo ability, max impressive; make that robot look awesome")
Kit rewritten in `moba.js` (HEROES.bastille + `case 'gatling'|'rockets'|'vault'|'orbital'` + `tickBastille()` + `rocketBlast/shellImpact/debris/smokeBurst`):
- **Q GATLING SALVO** — `u.chan={kind:'gat'}`: 0.22s `spinup` glyph, then a ROOTED 1.1s cone spray (tracer `projectiles` w/ `tracer:true`, 60ms cadence, alternating barrels, brass `casing` fx, recoil `u._recoil`). A move/stop order cancels the channel (Diablo channel rule). `cone` fx = the aim telegraph (follows caster).
- **W ROCKET SWARM** — 7 `missile` fx on quadratic beziers (apex above), white `smoke` trails, staggered landings → `rocketBlast` (fireball+shock+scorch+debris); the last rocket is 2× with a `crack` decal.
- **E THRUSTER VAULT** — `u.jump` (0.42s arc, `_lift` drawn in drawSheet, shadow shrinks while airborne), landing = aoe dmg + **knockback** (`t.kb`) + cyan shock/dust/crack; then 3.5s overdrive w/ exhaust `spk` trail (`_thrustT`) + cyan underglow. AI Bastille vaults AWAY from the nearest foe hero when low.
- **R ORBITAL BARRAGE** — `u.chan={kind:'anchor'}` (uncancelable 0.9s squat), `designator` laser + `reticle` (TARGETING %→LOCKED, red for enemies of the viewer) → 12 `shellfall` streaks onto `shell` telegraphs → `shellImpact`; final shell 2.2×, ground `crack`, knockback, and a 3.6s `fire` zone (tick dmg + slow). `ultCeremony()` edge-tint vignette.
- **DEFINITION + PACING PASS (Tee 2026-08-21: '10000x more defined and slower, each missile defined, like an Iron Man battle scene'; then 'hard to kill + abilities reload in half the time'):** missiles moved to a GROUND-PATH + ALTITUDE model (`gx/gy/altv`, shadow travels the real ground line, body drawn as opaque gunmetal+orange warhead+fins+flickering exhaust, fan launch from the shoulder pods, 1.35s flight, 0.14s stagger); shells are opaque ordnance w/ orange tip + a sharpening ground shadow, 0.34s gap, 0.8s visible fall; tracers carry an opaque brass capsule; vault 0.72s/135px with two thruster jet cones drawn under the mech; anchor 1.3s. Stats: HP 920 (+104/lvl), cds Q3.5/W5.5/E6/R35. Rule learned: 'defined' = an OPAQUE hard-edged body (source-over) riding on the glow, plus a ground shadow — glow alone reads as blur.
- **PIN MISSILES (Tee 2026-08-21: 'rocket swarm looks cheesy — smaller pin missiles, silver, homing'):** W is now 10 thin polished-silver darts (`missile{pin:true}`): each locks a live foe inside the zone (heroes first, round-robin) and steers its landing point onto the target while diving (`f.tgt`, gain 2→12/s with p); thin smoke line, tiny flame, small sharp `pinHit` (no big rings). Rule: 'cheesy' = oversized + cartoon; realism = small, many, precise, homing.
- **MARK II NANITE ARMOR + RED LANCE + MORPH (Tee 2026-08-21: Tony-Stark-nanotech detail, the morph scene, a red laser):** new Grok plate `goliath_nano_1` (overlapping liquid-metal plates, teal seams, forearm emitters — ORIGINAL design, no Marvel marks) → clips `goliath_nano_{idle,walk,attack}` → sheets (old in `_bak_2026-08-21b/`). Basic attack = `redlance` fx (white core / red bloom lance from the forearm emitter; no ion bolt). Spawn/respawn/match-start = NANITE MORPH (`u._nanoT`): clipped rising reveal + teal seam band + converging motes + a teal ring. **Keyer fix:** `build_sheet.py` tol/soft now scale with the MEASURED bg chroma (Grok rendered this batch on a darker green, chroma 67 vs 91 → every grey pixel fell in the soft ramp → translucent purple sprite; median alpha 199→255 after the fix).
- Passive: Targeting Uplink CDR now throttled 0.3s (a tracer stream isn't 14 refunds) + `#bar.cdr` flash; **Takedown Surge** in `kill()`.
- Engine additions: `drawFxAll('ground'|'air')` — decals (scorch/crack/fire/dust/cone/reticle/designator/casing) draw UNDER units now; projectiles get a real streak+head render; `fxPush` cap 460 with trivial-first eviction (`FX_TRIVIAL`); `drawMechPresence()` = barrel heat / reactor pulse / overdrive pool as POINT glows only (never a cell overlay — the 08-19 square-halo lesson); `stepUnit` honours `u.kb` knockback, `u.jump` (airborne) and `u.chan` (rooted).
- **QA hooks:** `window.DV_QA={noAI:true,noChoreo:true}` via `page.addInitScript` BEFORE load stops the demo AI/choreographer from driving the player (in `?demo=fight` the AI drives the player too — without this flag every capture is polluted by auto-casts; cost me 3 capture rounds). `DV.cast(player,i,x,y)`, `DV.fx`, `DV.projectiles`. Capture script: scratchpad `cap-bastille.mjs` (1440 + 390, casts Q/W/E/R on a timeline, zero console errors).
- **GOLIATH FOOTFALL (Tee 2026-08-21: 'dust looks cheesy — mimic SC Goliath, realistic'):** the v1 walk clip had BAKED white dust puffs at the feet (keyed cleanly, looked cartoon) → regenerated walk with 'piston-driven gait … ABSOLUTELY NO dust/smoke/steam' (`clips/bastille2_walk_v2.mp4`). Procedural footfall is now a `stomp` ground decal (contact shadow + barely-there tan grit drift, no ring), 4 `debris{grit}` pebbles kicked back along the stride, `addShake 0.9` thump, and a hydraulic settle squash (`u._plantT` in drawSheet). MOTION.bastille: cadence 6.4, bob 4.4, lean .035, `stomp:true` (|sin|^0.55 plant curve — spends the stride up, drops fast). Rule: a heavy mech's footfall is a SHADOW + GRIT + THUMP, never a puff.
- Sprite v2 SHIPPED (draw size 165): attack clip v1 filled the frame with smoke → keyed as a pale RECTANGLE behind the mech in-engine; regenerated with an explicit 'ABSOLUTELY NO smoke/haze/dust' clause → clean (`clips/bastille2_attack_v2.mp4`). Old sheets in `assets/anim/_bak_2026-08-21/`.
- Sprite v2 pipeline: Grok plate `grok-imagine-image-quality` n=4 (prompt in scratchpad `gen_plates.py`; ⚠ `response_format:"url"` download 403s — use `b64_json`), plate 3 chosen → 3× `grok-imagine-video-1.5` 6s clips (`gen_videos.py`) → `tools/build_sheet.py --group`.


**What:** PROJECT DUSKVEIL — 3v3 MOBA in the HALCYON universe (HUSSL PRODUCTION brand). Single-file canvas engine.
**Live:** https://duskveil.vercel.app (t-rex247s-projects) · hub: hussl-production.vercel.app · husslai.com/game (via rewrite, Phillip's Vercel serves the domain)

## ⭐ CHARACTER SPRITE PIPELINE v2 — 2026-08-19 (Tee: "the characters look like trash")
ROOT CAUSE (confirmed in-engine): every animation frame had been generated as its OWN image, so face/
cape/armor changed shape frame-to-frame (shimmer/morph in motion), AND the sheets were cropped BUSTS
(cut at the thighs) so heroes read as paper dolls floating on their shadow ellipse. Old Liora "walk" was
literally the same static front-facing pose in all 16 frames — she slid, never stepped.
THE FIX (same method that solved THE COIN tonight): ONE canonical plate → img2video → cut frames out of
that continuous motion → frames are the same character BY CONSTRUCTION.
1. Grok plate: use the champion's REGEN SEED from docs/CHAMPION-MOTION-SPEC.md §4 (per-champion archetype
   from the League research) + "TOP-DOWN THREE-QUARTER game camera looking DOWN 45°, full body, feet in
   frame, feet-center pivot, crisp rim-lit silhouette, FLAT SOLID PURE CHROMA GREEN background".
   ⚠️ FULL BODY WITH FEET is the fix for the paper-doll look — never a bust.
2. Grok img2video from that plate, one clip per state (idle / walk / attack), prompt = the motion ONLY +
   "camera locked, stays centered, feet on same ground line, background stays FLAT SOLID PURE GREEN,
   keep design/colors EXACTLY identical every frame, no morphing".
3. `tools/build_sheet.py <clip.mp4> <out_base> [frames] [size]` → strip + atlas.json. It SAMPLES the real
   bg colour (never assume the hex), keys in YUV CHROMA distance (not RGB, so shading doesn't punch holes),
   GENTLE despill (a hard clamp to (r+b)/2 desaturated her white-and-gold dress to grey — gold is r>g>b so
   the limit must sit above the midpoint), 1px erode (kills the cheap green halo), ONE shared bbox across
   all frames (so the rig never jitters/scales), feet-center bottom-aligned pivot.
4. ⚠️ TEST IN-ENGINE, not just over magenta (the old black-square gotcha).
5. ⚠️ ONE SHARED SCALE PER CHAMPION — use `build_sheet.py --group <key> <out_dir> <idle> <walk> <attack>`,
   NOT three separate single-clip runs. Each single run computes its own bbox, so a raised sword or a
   muzzle flash inflates the ATTACK bbox and the hero visibly shrinks the moment it attacks. `--group`
   normalises the scale on the LOCOMOTION states (idle+walk = the true standing size), shares it across
   all three, pins one ground line, and lets attack flourishes overflow the cell instead of shrinking the rig.
DONE: Liora (2026-08-19 am), then CORWEN · RAVENER · BASTILLE · SOVEREIGN (2026-08-19 pm, `--group`).
Chosen plates: corwen_0, ravener_0, bastille_3, sovereign_2 (n=4 each, picked by eye).
Originals in assets/anim/_bak_2026-08-19/. Bastille's wide cannon still inflates its bbox, so its
in-engine draw size is bumped to 150 (vs 120) in drawUnit to compensate — no re-render needed.
TODO: the 3 Crystalfall legends (the Crystalfall mech also has UN-KEYED WHITE BACKGROUND stuck to it —
visible blob in cf_alkone_attack frames). Liora predates `--group` — re-run her with it when convenient.

## ⭐ CHAMPION MOTION LAYER — 2026-08-19 (docs/CHAMPION-MOTION-SPEC.md, build order 1-4 + 6 + archetypes)
The League "MOBA feel" is now in the sim, not just the art.
- **Attack windup/cooldown state machine** (`startWindup`/`tickAttack`/`cancelWindup`, `atkCycle`). An auto
  is a ROOTED cancelable WINDUP then a FREE cooldown half. `tickAttack` runs every tick INCLUDING while
  walking — that free half IS the stutter-step seam. Cancel a windup (move/stop/cast) and you lose the shot.
  `fireAt` subtracts `wuLen` from the next `cdT` so windup+recovery = the champion's real cycle, unchanged.
- **Attack-move**: `A` or shift+right-click → `attackMoveFor`. Walks to the point, acquires at
  `range*1.35+70`. Player ellipse turns ORANGE while armed. `S` stop / `H` hold also wired. Guests send
  `{t:'amove'|'hold'}`; snapshot element **[14]** carries windup progress so guests see the same tell.
- **MOTION table** (top of moba.js) = the five feel sliders per champion: windup · turn-lerp · bob ·
  cadence (0 = HOVER, no footfall — Sovereign) · lean, plus `asRamp` (Bastille only, spins up to 1.45×
  on sustained fire and the anim fps compresses with it). Base HP/dmg/range untouched; only corwen
  speed 185→172 and ravener 180→186 to fix the bruiser-outrunning-the-assassin inversion.
- **Attack frames are driven by the TIMER, not wall-clock fps**: first 60% of the strip across the windup,
  last 40% across the release — so the same 16 frames read fast on Ravener and committal on Sovereign.
- Flinch is now directional + squash; hitstop length comes from the ATTACKER's archetype (Corwen .08).
- Idle fidget after 8s standing still, re-rolls 6-12s, cancelled by any order.
- 🐞 Fixed: `u.moving = false` was reset BEFORE `drawSheet`, so the procedural stride bob/gait sway
  had never once run. It is now reset after.
- **`window.DV`** = read-only debug handle (heroes/units/time/player/anims/MOTION + attackMove,
  cancelWindup, orderFor). Everything in moba.js is script-scoped, so without this a headless probe can
  only screenshot and guess. `?demo=fight&hero=<key>` picks the demo hero and the demo now fields the
  WHOLE roster (2 allies + the other 3 as enemies) so one capture shows every sprite.

**Key files:** `moba.js` (entire engine + netcode), `index.html` (HUD/lobby/CSS), `assets/tiles/mapgen.png` (painted map, 2560px lanczos-sharpened Grok art), `assets/icons/{hero}_{0-3}.jpg` (16 Grok ability icons), `qa/` captures via scratchpad `capture-dvfight.mjs` (?demo=fight staged teamfight).

## Multiplayer (2026-08-19) — LIVE
Host-authoritative 3v3 co-op on PeerJS (Halcyon pattern). Pick screen: SOLO / HOST 3v3 CO-OP (4-digit room code, up to 2 guests) / JOIN WITH CODE. Guests = thin clients: send {order/cast/recall/stop}, host sims and broadcasts 10 Hz snapshots (`sendSnap`) + event queue (cast/atk/twr/fx/feed) → guests interpolate (`netLerp`) and replay fx (`fireFx`/`towerFx` splits). `dealDamage`/`grantXp` return early on guests. Guest heroes flagged `h.human` — AI skips them; disconnect hands the hero back to AI. Verified end-to-end with two headless browsers: guest order moved its hero 262px on the host sim.

## Graphics Ralph loop (Tee: "rival LoL, loop until done")
Panel workflow: `.claude/projects/-Users-clawbot247-workspace-duskveil/.../duskveil-gfx-panel-r1-wf_4d0bd50d-f6b.js` (3 critics, dims mapArt25/combatJuice20/characters15/hud20/readability10/polish10). Scores: 28→44→45→46→37(blur+empty-frame dip)→46. **Current weakest: characters** (static poses in stills, mirror-clone heroes across teams, style-clash mech, shadows weak, portrait/sprite mismatch).

## Gotchas
- Ground cache `buildGround` S=0.85 of WORLD (was 0.5 = mush); painting drawn once + 0.2 overlay tile grain; `drawLiveMap()` = runtime altar pulse/rotating ring/brazier flicker (never bake animation).
- Demo staging: heroes ×8 HP, minions ×3, respawn 1.5s AT the altar (not base), no low-HP retreat in DEMOF, cast choreographer every 2.1s — otherwise the arena empties by the 13s capture.
- paintBar once crashed every frame on a removed `.ic` span → minimap went black (drawMinimap never reached). Frame-loop exceptions starve everything after them.
- fx lifetimes <0.15s are invisible to 0.5s-apart capture strips — critics grade stills; keep beams ≥0.24s, projectiles ≥0.16s dur.
- xAI images API: no `size` param (1280x720 fixed for 16:9); upscale via ffmpeg lanczos+unsharp.
- Open-source MOBA research (wmneb1n08): every real codebase GPL/AGPL (LeagueSandbox got a Riot C&D; js13k MOBA GPL; UNION Apache-2.0 is the only permissive one) — rip patterns, never code.

## VISUAL REVERT 2026-08-19 eve (Tee: white halo square, girl looks horrible)
- REMOVED the hero underglow + animated rim-light silhouette pass (the "visual enhance all heroes" commit) — it drew a square glow box around characters. Radial underglow was fine but the rim-light drawImage+source-atop over the sprite CELL made a square halo. Gone.
- Liora new Lux-movement run/idle sheets (chromakey 0x2E7A2A:0.10, from liora2_walk/idle.mp4) rendered as a BLACK SQUARE in-engine during the WALK state (solo/fog view) despite the PNG being cleanly transparent over magenta — a canvas alpha/keying gotcha. REVERTED to _old/liora_{walk,idle}_v2.png (the golden-priestess "Liora reborn" sheets that render fine). Buoyant-run regen shelved until the keying is fixed to render correctly in-engine (test IN THE GAME, not just over magenta).
- Fog softened 0.62→0.42 + wider gradient.
