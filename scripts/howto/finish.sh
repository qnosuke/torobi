#!/usr/bin/env bash
# 生成した素材を、アプリが求める形に仕上げる。
#
#   scripts/howto/finish.sh <slug> <開始秒> <長さ秒>
#   例: scripts/howto/finish.sh side-raise 1.2 2.4
#
# やっていること:
#   1. 素材から「下ろしている間」だけを切り出す（開始秒・長さ秒は目で見て決める）
#   2. その区間をちょうど2.0秒に伸縮する  → テンポをAIに頼らず正確にする
#   3. 逆再生を継ぎ足して4.0秒にする      → 最後のコマ＝最初のコマになり、継ぎ目が消える
#   4. 4:3・640×480、H.264 yuv420p、音声なし、300KB以下に収める
#
# 必要: ffmpeg

set -euo pipefail

SLUG="${1:?slug を指定してください}"
START="${2:?素材の中で下ろし始めるタイミング（秒）}"
LEN="${3:?下ろしきるまでの長さ（秒）}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IN="$HERE/raw/$SLUG.mp4"
OUT="$HERE/../../public/howto/$SLUG.mp4"
LIMIT=307200   # 300KB

[ -f "$IN" ] || { echo "素材がありません: $IN"; exit 1; }
mkdir -p "$(dirname "$OUT")"

# 2.0秒に伸縮する倍率（PTSを掛ける）
RATE=$(awk -v l="$LEN" 'BEGIN{ printf "%.6f", 2.0 / l }')

encode() {
  local crf="$1"
  ffmpeg -y -loglevel error \
    -ss "$START" -t "$LEN" -i "$IN" -an \
    -filter_complex "\
[0:v]scale=640:480:force_original_aspect_ratio=increase,crop=640:480,\
setpts=(PTS-STARTPTS)*${RATE},fps=25,format=yuv420p[fwd];\
[fwd]split[f1][f2];[f2]reverse[rev];[f1][rev]concat=n=2:v=1[out]" \
    -map "[out]" \
    -c:v libx264 -profile:v main -preset slow -crf "$crf" \
    -pix_fmt yuv420p -movflags +faststart "$OUT"
}

# 300KBに収まるまで品質を落としていく（背景が平坦なので普通は1回で収まる）
for CRF in 26 29 32 35 38; do
  encode "$CRF"
  SIZE=$(wc -c < "$OUT")
  if [ "$SIZE" -le "$LIMIT" ]; then
    echo "$OUT  ${SIZE} bytes (crf=$CRF)"
    ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT" | awk '{printf "長さ %.2f 秒\n", $1}'
    exit 0
  fi
done

echo "300KBに収まりませんでした（${SIZE} bytes）。背景がもっと平坦な素材で作り直してください。"
exit 1
