#!/usr/bin/env bash

set -Eeuo pipefail
# Upstream Docker assets must remain readable by non-root container users.
# Secret material is locked down explicitly after it is created.
umask 022

SUPABASE_REF="${SUPABASE_REF:-e66d8eb0947973fdd8f26921a9ee3ca08474beb6}"
STAGING_DIR="${STAGING_DIR:-/srv/aura-board/supabase}"
API_PORT="${API_PORT:-18000}"
SESSION_PORT="${SESSION_PORT:-15432}"
TRANSACTION_PORT="${TRANSACTION_PORT:-16543}"

fail() {
  printf '[supabase-staging] FAIL: %s\n' "$1" >&2
  exit 1
}

log() {
  printf '[supabase-staging] %s\n' "$1"
}

[[ "$(id -u)" -eq 0 ]] || fail "run as root"
[[ "$(uname -m)" == "aarch64" || "$(uname -m)" == "arm64" ]] || fail "ARM64 host required"
command -v git >/dev/null 2>&1 || fail "git is required"
command -v docker >/dev/null 2>&1 || fail "docker is required"
docker compose version >/dev/null 2>&1 || fail "docker compose plugin is required"
command -v openssl >/dev/null 2>&1 || fail "openssl is required"

for port in "$API_PORT" "$SESSION_PORT" "$TRANSACTION_PORT"; do
  if ss -ltnH "sport = :$port" 2>/dev/null | grep -q .; then
    fail "port $port is already listening"
  fi
done

if [[ -e "$STAGING_DIR" ]]; then
  fail "$STAGING_DIR already exists; refusing to overwrite"
fi

work_dir="$(mktemp -d)"
trap 'rm -rf -- "$work_dir"' EXIT

log "fetching official Supabase source at $SUPABASE_REF"
git clone --filter=blob:none --no-checkout https://github.com/supabase/supabase.git "$work_dir/supabase" >/dev/null 2>&1
git -C "$work_dir/supabase" fetch --depth 1 origin "$SUPABASE_REF" >/dev/null 2>&1
git -C "$work_dir/supabase" checkout --detach "$SUPABASE_REF" >/dev/null 2>&1
resolved_ref="$(git -C "$work_dir/supabase" rev-parse HEAD)"
[[ "$resolved_ref" == "$SUPABASE_REF" ]] || fail "resolved upstream SHA does not match requested SHA"

install -d -o root -g root -m 0750 "$STAGING_DIR"
cp -a "$work_dir/supabase/docker/." "$STAGING_DIR/"
unreadable_sql="$(find "$STAGING_DIR/volumes/db" -type f -name '*.sql' ! -perm -004 -print -quit)"
[[ -z "$unreadable_sql" ]] || fail "upstream DB init SQL is not container-readable: $unreadable_sql"
printf '%s\n' "$SUPABASE_REF" > "$STAGING_DIR/.aura-upstream-ref"
chmod 0640 "$STAGING_DIR/.aura-upstream-ref"

cd "$STAGING_DIR"
cp .env.example .env
chmod 0600 .env

log "generating staging-only Supabase secrets"
sh utils/generate-keys.sh --update-env >/dev/null
if [[ -x utils/add-new-auth-keys.sh || -f utils/add-new-auth-keys.sh ]]; then
  sh utils/add-new-auth-keys.sh --update-env >/dev/null 2>&1 || log "asymmetric auth key helper did not update env; legacy JWT keys remain available for staging"
fi

replace_env() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" .env; then
    sed -i -e "s|^${key}=.*$|${key}=${value}|" .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

replace_env SUPABASE_PUBLIC_URL "http://127.0.0.1:${API_PORT}"
replace_env API_EXTERNAL_URL "http://127.0.0.1:${API_PORT}/auth/v1"
replace_env SITE_URL "https://aura-board.com"
replace_env ADDITIONAL_REDIRECT_URLS ""
replace_env DISABLE_SIGNUP "true"
replace_env ENABLE_EMAIL_SIGNUP "false"
replace_env ENABLE_PHONE_SIGNUP "false"
replace_env POOLER_TENANT_ID "aura-staging"
replace_env POOLER_DEFAULT_POOL_SIZE "10"
replace_env POOLER_MAX_CLIENT_CONN "60"
replace_env STUDIO_DEFAULT_ORGANIZATION "Aura Board"
replace_env STUDIO_DEFAULT_PROJECT "Aura Board Staging"

python3 - "$API_PORT" "$SESSION_PORT" "$TRANSACTION_PORT" <<'PY'
from pathlib import Path
import sys

api_port, session_port, transaction_port = sys.argv[1:]
path = Path("docker-compose.yml")
text = path.read_text(encoding="utf-8")
replacements = {
    '      - ${API_GW_HTTP_PORT:-${KONG_HTTP_PORT:-8000}}:8000/tcp': f'      - 127.0.0.1:{api_port}:8000/tcp',
    '      - ${POSTGRES_PORT}:5432': f'      - 127.0.0.1:{session_port}:5432',
    '      - ${POOLER_PROXY_PORT_TRANSACTION}:6543': f'      - 127.0.0.1:{transaction_port}:6543',
    '      FILE_SIZE_LIMIT: 52428800': '      FILE_SIZE_LIMIT: 104857600',
}
for old, new in replacements.items():
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected exactly one compose staging replacement for {old!r}, got {count}")
    text = text.replace(old, new)
path.write_text(text, encoding="utf-8")
PY

log "validating resolved compose configuration"
docker compose config --quiet

log "pulling ARM64-compatible images; no containers are started yet"
docker compose pull

log "prepared staging stack"
log "path=$STAGING_DIR"
log "api=http://127.0.0.1:$API_PORT"
log "postgres_session=127.0.0.1:$SESSION_PORT"
log "postgres_transaction=127.0.0.1:$TRANSACTION_PORT"
log "next: cd $STAGING_DIR && docker compose up -d --wait"
