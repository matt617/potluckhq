#!/usr/bin/env bash
# Download the standalone yt-dlp binary and a static ffmpeg for arm64 Lambda into the layer
# directory. ffmpeg is needed because YouTube, Instagram and others often serve video and
# audio as separate streams, and recipe videos need their voiceover.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_DIR="$ROOT/infra/layers/ytdlp/bin"
YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64"
FFMPEG_URL="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz"

mkdir -p "$DEST_DIR"
echo "Downloading latest yt-dlp (linux aarch64) ..."
curl -fL --retry 3 -o "$DEST_DIR/yt-dlp.tmp" "$YTDLP_URL"
mv "$DEST_DIR/yt-dlp.tmp" "$DEST_DIR/yt-dlp"
chmod +x "$DEST_DIR/yt-dlp"

if [[ ! -x "$DEST_DIR/ffmpeg" || "${1:-}" == "--refresh-ffmpeg" ]]; then
  echo "Downloading static ffmpeg (linux arm64) ..."
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  curl -fL --retry 3 -o "$TMP/ffmpeg.tar.xz" "$FFMPEG_URL"
  tar -xJf "$TMP/ffmpeg.tar.xz" -C "$TMP"
  mv "$TMP"/ffmpeg-*-arm64-static/ffmpeg "$DEST_DIR/ffmpeg"
  chmod +x "$DEST_DIR/ffmpeg"
fi

echo "Layer contents:"
du -h "$DEST_DIR"/*
echo "Redeploy to ship the new versions: npm run deploy"
