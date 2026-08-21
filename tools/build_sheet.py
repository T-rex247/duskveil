#!/usr/bin/env python3
"""
build_sheet.py — turn a chroma-green img2video clip into a game sprite strip.

Why this exists (2026-08-19, Tee: "the characters look like trash"):
Every previous animation frame was generated as its OWN image, so the face/cape/armor changed
shape frame-to-frame and the characters shimmered and morphed in motion. The fix is the method
proved on THE COIN: generate ONE canonical plate, animate it as continuous VIDEO, then cut the
frames out of that video — the frames are then the same character BY CONSTRUCTION.

Keying notes learned the hard way:
  * SAMPLE the actual background colour per clip; never assume the hex you prompted for.
  * Key in YUV chroma distance (not RGB), so shading on the character doesn't punch holes.
  * DESPILL: green bounce on white cloth reads as a sick green fringe; neutralise g > (r+b)/2.
  * ERODE the alpha ~1px — a 1px green halo is what makes a sprite look "cheap" at game size.
  * ⚠️ ALWAYS test the finished sheet IN THE GAME, not just over magenta. A sheet that looks
    clean over magenta rendered as a BLACK SQUARE in-engine once (see INDEX.md).

Usage: build_sheet.py <clip.mp4> <out_base> [frames] [size]
       → writes <out_base>.png (horizontal strip) + <out_base>.atlas.json
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def sample_bg(img: Image.Image) -> np.ndarray:
    """Median of the frame corners — the background, whatever colour it actually is."""
    a = np.asarray(img.convert("RGB")).astype(float)
    h, w = a.shape[:2]
    p = max(8, min(h, w) // 12)
    corners = np.concatenate([
        a[:p, :p].reshape(-1, 3), a[:p, -p:].reshape(-1, 3),
        a[-p:, :p].reshape(-1, 3), a[-p:, -p:].reshape(-1, 3),
    ])
    return np.median(corners, axis=0)


def key_frame(img: Image.Image, bg: np.ndarray, tol: float = 42.0, soft: float = 26.0) -> Image.Image:
    """Chroma-distance key + despill + 1px erode. Returns RGBA."""
    a = np.asarray(img.convert("RGB")).astype(float)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]

    def uv(px):  # BT.601 chroma only — ignores luma, so shadows on the subject survive
        R, G, B = px[..., 0], px[..., 1], px[..., 2]
        return (-0.169 * R - 0.331 * G + 0.5 * B, 0.5 * R - 0.419 * G - 0.081 * B)

    u, v = uv(a)
    bu, bv = uv(bg.reshape(1, 1, 3))
    d = np.sqrt((u - bu) ** 2 + (v - bv) ** 2)          # chroma distance from the backing
    # 2026-08-21 (GOLIATH nano sheets came out TRANSLUCENT/purple): the tol/soft defaults assumed a near-pure
    # green backing (chroma ~91). Grok rendered one batch on a DARKER green (chroma 67), so tol+soft ≈ the whole
    # bg chroma and every grey pixel on the mech fell into the soft ramp (median alpha 199/255). Scale the key
    # to the backing actually measured: tol 42% / soft 26% of the bg chroma magnitude.
    mag = float(np.sqrt(bu ** 2 + bv ** 2)) or 1.0
    tol = min(tol, 0.42 * mag); soft = min(soft, 0.26 * mag)
    alpha = np.clip((d - tol) / soft, 0, 1)              # 0 = background, 1 = subject

    # DESPILL — gentle. Only pull green DOWN where it genuinely dominates both other channels,
    # and only part-way. A hard clamp to (r+b)/2 desaturates white-and-gold cloth to grey (it ate
    # Liora's gold on the first pass); gold is r>g>b, so the limit has to sit above the midpoint.
    lim = np.maximum((r + b) / 2 + 10, np.minimum(r, b) * 1.06)
    gg = np.where(g > lim, lim + (g - lim) * 0.35, g)
    out = np.stack([r, gg, b], -1)

    am = Image.fromarray((alpha * 255).astype(np.uint8), "L")
    am = am.filter(ImageFilter.MinFilter(3))             # erode ~1px → no green halo
    am = am.filter(ImageFilter.GaussianBlur(0.6))        # re-soften the cut edge
    rgba = Image.fromarray(out.astype(np.uint8), "RGB").convert("RGBA")
    rgba.putalpha(am)
    return rgba


def build(clip: str, out_base: str, n_frames: int = 16, size: int = 192, fps_out: int = 8):
    tmp = Path(tempfile.mkdtemp())
    # even sampling across the clip
    dur = float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", clip],
        capture_output=True, text=True).stdout.strip())
    # skip the first 6% — img2video often eases in from the still
    t0, t1 = dur * 0.06, dur * 0.98
    times = [t0 + (t1 - t0) * i / n_frames for i in range(n_frames)]
    for i, t in enumerate(times):
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{t:.3f}", "-i", clip,
                        "-frames:v", "1", str(tmp / f"f{i:02d}.png")], check=True)

    raw = [Image.open(tmp / f"f{i:02d}.png") for i in range(n_frames)]
    bg = sample_bg(raw[0])
    keyed = [key_frame(im, bg) for im in raw]

    # ONE shared bounding box across all frames → the rig never jitters/scales between frames
    boxes = [k.getbbox() for k in keyed]
    boxes = [b for b in boxes if b]
    if not boxes:
        raise SystemExit("key produced empty frames — check the backing colour")
    x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes)
    x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
    cw, ch = x1 - x0, y1 - y0
    scale = (size * 0.92) / max(cw, ch)

    strip = Image.new("RGBA", (size * n_frames, size), (0, 0, 0, 0))
    for i, k in enumerate(keyed):
        crop = k.crop((x0, y0, x1, y1))
        nw, nh = max(1, int(cw * scale)), max(1, int(ch * scale))
        crop = crop.resize((nw, nh), Image.LANCZOS)
        # FEET-CENTER PIVOT: horizontally centred, bottom-aligned — so the sprite plants on the
        # ground plane instead of bobbing relative to its shadow.
        px = i * size + (size - nw) // 2
        py = size - nh - int(size * 0.04)
        strip.paste(crop, (px, py), crop)

    strip.save(out_base + ".png")
    json.dump({
        "name": Path(out_base).name.rsplit("_", 1)[0],
        "anim": Path(out_base).name.rsplit("_", 1)[-1],
        "sheet": Path(out_base).name + ".png",
        "frame_count": n_frames, "frame_w": size, "frame_h": size,
        "layout": "horizontal-strip", "loop": True, "hold_last_frame": False, "fps": fps_out,
        "source_clip": Path(clip).name, "pivot": "feet-center",
    }, open(out_base + ".atlas.json", "w"), indent=1)
    print(f"wrote {out_base}.png  ({n_frames}x{size}px, bg={bg.astype(int).tolist()})")


def _keyed_frames(clip, n_frames):
    tmp = Path(tempfile.mkdtemp())
    dur = float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", clip],
        capture_output=True, text=True).stdout.strip())
    t0, t1 = dur * 0.06, dur * 0.98
    for i in range(n_frames):
        t = t0 + (t1 - t0) * i / n_frames
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{t:.3f}", "-i", clip,
                        "-frames:v", "1", str(tmp / f"f{i:02d}.png")], check=True)
    raw = [Image.open(tmp / f"f{i:02d}.png") for i in range(n_frames)]
    bg = sample_bg(raw[0])
    return [key_frame(im, bg) for im in raw]


def _union(boxes):
    boxes = [b for b in boxes if b]
    return (min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes))


def build_group(states, out_dir, key, n_frames=16, size=192, fps=None):
    """Build idle/walk/attack for ONE champion with ONE shared scale and ONE ground line.

    Why this exists (2026-08-19): building each state independently gives each sheet its own
    bounding box, so the character is a DIFFERENT SIZE in idle vs walk vs attack — the hero
    visibly pops bigger/smaller every time the state machine switches. Worse, a raised sword or
    a muzzle flash inflates the attack bbox and shrinks the body specifically in the frames the
    player is looking hardest at. So: normalise on the LOCOMOTION states (idle+walk = the
    character's true standing size), share that scale across every state, and pin every frame to
    one ground line. Attack flourishes are allowed to overflow the cell rather than shrink the rig.
    """
    fps = fps or {"idle": 8, "walk": 12, "attack": 16}
    keyed = {st: _keyed_frames(clip, n_frames) for st, clip in states.items()}
    per_state = {st: _union([k.getbbox() for k in fr]) for st, fr in keyed.items()}
    U = _union(list(per_state.values()))                                  # every pixel, all states
    ref = _union([b for st, b in per_state.items() if st != "attack"]) or U  # the standing rig
    scale = (size * 0.92) / max(ref[2] - ref[0], ref[3] - ref[1])
    cell_cx, cell_bottom = size / 2, size - int(size * 0.04)

    for st, frames in keyed.items():
        strip = Image.new("RGBA", (size * n_frames, size), (0, 0, 0, 0))
        for i, k in enumerate(frames):
            crop = k.crop(U)
            nw, nh = max(1, int((U[2] - U[0]) * scale)), max(1, int((U[3] - U[1]) * scale))
            crop = crop.resize((nw, nh), Image.LANCZOS)
            px = int(i * size + cell_cx - ((ref[0] + ref[2]) / 2 - U[0]) * scale)
            py = int(cell_bottom - (ref[3] - U[1]) * scale)
            strip.paste(crop, (px, py), crop)
        base = f"{out_dir}/{key}_{st}"
        strip.save(base + ".png")
        json.dump({
            "name": key, "anim": st, "sheet": f"{key}_{st}.png",
            "frame_count": n_frames, "frame_w": size, "frame_h": size,
            "layout": "horizontal-strip", "loop": st != "attack", "hold_last_frame": False,
            "fps": fps[st], "source_clip": Path(states[st]).name, "pivot": "feet-center",
            "shared_scale": True,
        }, open(base + ".atlas.json", "w"), indent=1)
        print(f"wrote {base}.png (shared scale {scale:.3f})")


if __name__ == "__main__":
    if sys.argv[1:2] == ["--group"]:
        # build_sheet.py --group <key> <out_dir> <idle.mp4> <walk.mp4> <attack.mp4> [frames] [size]
        key, out_dir, ci, cw, ca = sys.argv[2:7]
        build_group({"idle": ci, "walk": cw, "attack": ca}, out_dir, key,
                    int(sys.argv[7]) if len(sys.argv) > 7 else 16,
                    int(sys.argv[8]) if len(sys.argv) > 8 else 192)
        raise SystemExit(0)
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    build(sys.argv[1], sys.argv[2],
          int(sys.argv[3]) if len(sys.argv) > 3 else 16,
          int(sys.argv[4]) if len(sys.argv) > 4 else 192)
