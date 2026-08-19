#!/bin/bash
# cut-character.sh <out.mp4> <name> <role> <stem.mp3> <shot1.mp4> [shot2.mp4]
# Concats the shots (native SFX kept), lays the faction stem under, appends a
# 1.6s gold name card. First frame stays visible (poster-frame rule: no
# fade-from-black open).
set -e
OUT="$1"; NAME="$2"; ROLE="$3"; STEM="$4"; shift 4
FONT="/private/tmp/claude-501/-Users-clawbot247/ca578de1-196f-4355-868b-f769a89e6b0d/scratchpad/Cinzel.ttf"
TMP=$(mktemp -d)
# 1. concat shots with re-encode (uniform), keep native audio
i=0; inputs=(); fc=""
for f in "$@"; do inputs+=(-i "$f"); fc+="[$i:v][$i:a]"; i=$((i+1)); done
n=$i
ffmpeg -y -v error "${inputs[@]}" -filter_complex "${fc}concat=n=${n}:v=1:a=1[v][a]" \
  -map "[v]" -map "[a]" -r 24 -c:v libx264 -crf 19 -pix_fmt yuv420p -c:a aac -b:a 192k "$TMP/body.mp4"
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMP/body.mp4")
# 2. name card 1.6s from a pre-rendered PNG (this ffmpeg lacks drawtext)
CARD="/private/tmp/claude-501/-Users-clawbot247/ca578de1-196f-4355-868b-f769a89e6b0d/scratchpad/card_$(echo "$NAME" | tr "A-Z " "a-z_").png"
ffmpeg -y -v error -loop 1 -t 1.6 -i "$CARD" -f lavfi -i "anullsrc=r=48000:cl=stereo:d=1.6" \
  -vf "scale=1280:720,format=yuv420p,fade=t=in:d=0.3,fade=t=out:st=1.2:d=0.4" \
  -r 24 -c:v libx264 -crf 19 -c:a aac -shortest "$TMP/card.mp4"
# 3. join + music bed under the whole piece
ffmpeg -y -v error -i "$TMP/body.mp4" -i "$TMP/card.mp4" -i "$STEM" -filter_complex \
  "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][sfx]; \
   [2:a]atrim=0:$(echo "$D+1.6"|bc),afade=t=in:d=0.5,afade=t=out:st=$(echo "$D+0.4"|bc):d=1.2,volume=0.5[m]; \
   [sfx][m]amix=inputs=2:normalize=0,alimiter=limit=0.95[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -crf 19 -pix_fmt yuv420p -c:a aac -b:a 192k "$OUT"
rm -rf "$TMP"
echo "CUT $OUT ($(stat -f%z "$OUT") bytes)"
