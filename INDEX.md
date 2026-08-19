# duskveil — INDEX

**What:** PROJECT DUSKVEIL — 3v3 MOBA in the HALCYON universe (HUSSL PRODUCTION brand). Single-file canvas engine.
**Live:** https://duskveil.vercel.app (t-rex247s-projects) · hub: hussl-production.vercel.app · husslai.com/game (via rewrite, Phillip's Vercel serves the domain)
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
