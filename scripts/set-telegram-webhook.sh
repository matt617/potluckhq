#!/usr/bin/env bash
# Point the Telegram bot at the deployed webhook.
# Usage: scripts/set-telegram-webhook.sh [--stage prod] [--region us-east-1] [--url https://<app>/webhooks/telegram]
set -euo pipefail

STAGE="prod"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
URL=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --stage) STAGE="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --url) URL="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

PREFIX="/potluck/${STAGE}/"
get() { aws ssm get-parameter --region "$REGION" --with-decryption --name "${PREFIX}$1" --query Parameter.Value --output text; }

TOKEN="$(get telegram-bot-token)" || { echo "Set ${PREFIX}telegram-bot-token first (scripts/set-secrets.sh)" >&2; exit 1; }
SECRET="$(get telegram-webhook-secret)" || { echo "Set ${PREFIX}telegram-webhook-secret first" >&2; exit 1; }

if [[ -z "$URL" ]]; then
  URL="$(aws cloudformation describe-stacks --region "$REGION" --stack-name "Potluck-${STAGE}" \
    --query "Stacks[0].Outputs[?OutputKey=='TelegramWebhookUrl'].OutputValue" --output text)"
fi
[[ -n "$URL" && "$URL" != "None" ]] || { echo "Could not find TelegramWebhookUrl; pass --url" >&2; exit 1; }

echo "Setting webhook to $URL"
curl -fsS -X POST "https://api.telegram.org/bot${TOKEN}/setWebhook" \
  -H 'Content-Type: application/json' \
  -d "{\"url\":\"${URL}\",\"secret_token\":\"${SECRET}\",\"allowed_updates\":[\"message\"],\"drop_pending_updates\":true}"
echo
curl -fsS "https://api.telegram.org/bot${TOKEN}/getWebhookInfo"
echo
