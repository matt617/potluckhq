#!/usr/bin/env bash
# Build and deploy Potluck. Extra arguments pass through to `cdk deploy`, e.g.
#   scripts/deploy.sh -c stage=prod -c alertEmail=you@example.com
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command -v aws >/dev/null || { echo "aws CLI is required" >&2; exit 1; }
aws sts get-caller-identity >/dev/null || { echo "AWS credentials are not configured (try: aws login)" >&2; exit 1; }

if [[ ! -x infra/layers/ytdlp/bin/yt-dlp || ! -x infra/layers/ytdlp/bin/ffmpeg ]]; then
  echo "yt-dlp or ffmpeg binary missing, fetching them ..."
  bash scripts/fetch-ytdlp.sh
fi

echo "Building web app ..."
npm run build -w @potluck/web

STAGE="prod"
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  if [[ "${args[$i]}" == "-c" && "${args[$((i + 1))]:-}" == stage=* ]]; then STAGE="${args[$((i + 1))]#stage=}"; fi
done

OUTPUTS="$ROOT/infra/cdk-outputs.json"
echo "Deploying stack Potluck-${STAGE} ..."
(
  cd infra
  npx cdk deploy "Potluck-${STAGE}" --require-approval never --outputs-file "$OUTPUTS" "$@"
)

echo
echo "Stack outputs:"
node -e '
const o = require(process.argv[1]);
for (const [stack, vals] of Object.entries(o)) {
  console.log(stack);
  for (const [k, v] of Object.entries(vals)) console.log(`  ${k.padEnd(20)} ${v}`);
}' "$OUTPUTS"
echo
echo "Next: scripts/set-secrets.sh --stage ${STAGE}, then scripts/set-telegram-webhook.sh --stage ${STAGE}. See docs/setup.md."
