#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: run-app-cron.sh <job> <GET|POST>" >&2
  exit 2
fi

job=$1
method=$2
case "${job}:${method}" in
  parent-weekly-digest:GET | \
  parent-anonymize:GET | \
  expire-pending-links:GET | \
  fd-maturity:GET | \
  billing-renew:POST | \
  blob-cleanup:GET | \
  notification-push:GET | \
  reading-feedback:POST | \
  attendance-reminder:GET | \
  afternoon-attendance-reminder:GET | \
  role-salary-payout:GET | \
  play-outbox:POST) ;;
  *)
    echo "unsupported cron job or method: ${job}:${method}" >&2
    exit 2
    ;;
esac

exec 9>"/opt/aura-board-app/shared/cron-locks/cron-${job}.lock"
if ! flock --nonblock 9; then
  exit 0
fi

set -a
# shellcheck disable=SC1091
. /etc/aura-board/app.env
set +a
: "${CRON_SECRET:?CRON_SECRET is required}"

exec /usr/bin/curl \
  --fail \
  --silent \
  --show-error \
  --connect-timeout 10 \
  --max-time 300 \
  --request "${method}" \
  --header "Authorization: Bearer ${CRON_SECRET}" \
  --output /dev/null \
  "http://127.0.0.1:3000/api/cron/${job}"
