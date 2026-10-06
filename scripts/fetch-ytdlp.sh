#!/usr/bin/env bash
# Download the standalone yt-dlp binary and an ffmpeg build for arm64 Lambda into the layer
# directory. ffmpeg is needed because YouTube, Instagram and others often serve video and
# audio as separate streams, and recipe videos need their voiceover.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_DIR="$ROOT/infra/layers/ytdlp/bin"
YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64"
# Pin the yt-dlp maintained build so deploys do not depend on a mutable download page.
FFMPEG_BUILD="ffmpeg-N-127214-g104edd0777-linuxarm64-gpl"
FFMPEG_URL="https://github.com/yt-dlp/FFmpeg-Builds/releases/download/autobuild-2026-10-05-21-50/${FFMPEG_BUILD}.tar.xz"
FFMPEG_SHA256="cb183e1d7cfc067ee8ec60eea599da50f767cd6da6f337578a5e9fa8b31a9131"

mkdir -p "$DEST_DIR"
echo "Downloading latest yt-dlp (linux aarch64) ..."
curl -fL --retry 3 -o "$DEST_DIR/yt-dlp.tmp" "$YTDLP_URL"
mv "$DEST_DIR/yt-dlp.tmp" "$DEST_DIR/yt-dlp"
chmod +x "$DEST_DIR/yt-dlp"

if [[ ! -x "$DEST_DIR/ffmpeg" || "${1:-}" == "--refresh-ffmpeg" ]]; then
  echo "Downloading pinned ffmpeg (linux arm64) ..."
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  curl -fL --retry 3 -o "$TMP/ffmpeg.tar.xz" "$FFMPEG_URL"
  (cd "$TMP" && printf '%s  ffmpeg.tar.xz\n' "$FFMPEG_SHA256" | shasum -a 256 -c -)
  tar -xJf "$TMP/ffmpeg.tar.xz" -C "$TMP" "$FFMPEG_BUILD/bin/ffmpeg"
  chmod +x "$TMP/$FFMPEG_BUILD/bin/ffmpeg"
  mv "$TMP/$FFMPEG_BUILD/bin/ffmpeg" "$DEST_DIR/ffmpeg"
fi

echo "Layer contents:"
du -h "$DEST_DIR"/*
echo "Redeploy to ship the new versions: npm run deploy"
