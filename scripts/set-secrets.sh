#!/usr/bin/env bash
# Interactively store Potluck secrets and settings in SSM Parameter Store.
# Usage: scripts/set-secrets.sh [--stage prod] [--region us-east-1]
# Leave a prompt blank to keep the current value. Missing parameters disable that feature.
set -euo pipefail

STAGE="prod"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --stage) STAGE="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    -h|--help) sed -n '2,4p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

PREFIX="/potluck/${STAGE}/"
command -v aws >/dev/null || { echo "aws CLI is required" >&2; exit 1; }
aws sts get-caller-identity >/dev/null || { echo "AWS credentials are not configured" >&2; exit 1; }

# name|type|description
PARAMS=(
  "gemini-api-key|SecureString|Google AI Studio API key (required for recipe extraction)"
  "telegram-bot-token|SecureString|Telegram bot token from @BotFather"
  "telegram-webhook-secret|SecureString|Random string Telegram echoes back (leave blank to generate)"
  "telegram-bot-username|String|Telegram bot username without @"
  "whatsapp-token|SecureString|WhatsApp Cloud API permanent access token"
  "whatsapp-phone-number-id|String|WhatsApp phone number ID"
  "whatsapp-app-secret|SecureString|Meta app secret (verifies webhook signatures)"
  "whatsapp-verify-token|SecureString|Webhook verify token you will paste into Meta (leave blank to generate)"
  "whatsapp-number|String|WhatsApp number shown to users, E.164 (e.g. +15551234567)"
  "stripe-secret-key|SecureString|Stripe secret key (sk_live_... or sk_test_...)"
  "stripe-webhook-secret|SecureString|Stripe webhook signing secret (whsec_...)"
  "stripe-price-plus|String|Stripe price ID for Plus, \$4/month"
  "stripe-price-pro|String|Stripe price ID for Pro, \$9/month"
)

echo "Storing parameters under ${PREFIX} in ${REGION}. Press Enter to skip any item."
for entry in "${PARAMS[@]}"; do
  IFS='|' read -r name type desc <<<"$entry"
  current="$(aws ssm get-parameter --region "$REGION" --name "${PREFIX}${name}" --query 'Parameter.Version' --output text 2>/dev/null || true)"
  status="not set"; [[ -n "$current" && "$current" != "None" ]] && status="set (v${current})"
  echo
  echo "${name}: ${desc} [${status}]"
  if [[ "$type" == "SecureString" ]]; then
    read -r -s -p "> " value; echo
  else
    read -r -p "> " value
  fi
  if [[ -z "$value" && ( "$name" == "telegram-webhook-secret" || "$name" == "whatsapp-verify-token" ) && "$status" == "not set" ]]; then
    value="$(openssl rand -hex 24)"
    echo "  generated a random value"
    [[ "$name" == "whatsapp-verify-token" ]] && echo "  verify token (paste into Meta): $value"
  fi
  if [[ -z "$value" ]]; then
    echo "  skipped"
    continue
  fi
  aws ssm put-parameter --region "$REGION" --name "${PREFIX}${name}" --type "$type" --value "$value" --overwrite >/dev/null
  echo "  saved"
done

echo
echo "Done. Lambdas cache parameters per container; new values apply within ~15 minutes or after the next deploy."
