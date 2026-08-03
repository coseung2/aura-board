#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

mode="dry-run"
temp_dir=""

log() {
  printf '[oracle-backup] stage=%s object=%s\n' "$1" "$2"
}

fail() {
  printf '[oracle-backup] stage=failed object=%s\n' "${1:-none}" >&2
  exit 1
}

cleanup() {
  local exit_code=$?
  unset DATABASE_URL PGDATABASE PGSERVICE PGSERVICEFILE
  if [[ -n "$temp_dir" && -d "$temp_dir" ]]; then
    rm -rf -- "$temp_dir"
  fi
  exit "$exit_code"
}

trap cleanup EXIT
trap 'fail "${current_object:-none}"' ERR

usage() {
  printf 'Usage: %s [--dry-run|--write]\n' "${0##*/}"
}

case "${1:-}" in
  ""|--dry-run)
    ;;
  --write)
    mode="write"
    ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

if (( $# > 1 )); then
  usage >&2
  exit 2
fi

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${OCI_NAMESPACE:?OCI_NAMESPACE is required}"
: "${OCI_BUCKET_NAME:?OCI_BUCKET_NAME is required}"

OCI_OBJECT_PREFIX="${OCI_OBJECT_PREFIX:-aura-board/postgres}"
OCI_REGION="${OCI_REGION:-ap-osaka-1}"
PG_DUMP_BIN="${PG_DUMP_BIN:-pg_dump}"
PG_RESTORE_BIN="${PG_RESTORE_BIN:-pg_restore}"
OCI_BIN="${OCI_BIN:-oci}"

for value_name in OCI_NAMESPACE OCI_BUCKET_NAME OCI_OBJECT_PREFIX OCI_REGION; do
  value="${!value_name}"
  if [[ "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
    fail "none"
  fi
done

[[ "$OCI_REGION" == "ap-osaka-1" ]] || fail "none"

OCI_OBJECT_PREFIX="${OCI_OBJECT_PREFIX#/}"
OCI_OBJECT_PREFIX="${OCI_OBJECT_PREFIX%/}"
[[ -n "$OCI_OBJECT_PREFIX" ]] || fail "none"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
if [[ -r /proc/sys/kernel/random/uuid ]]; then
  read -r unique_id < /proc/sys/kernel/random/uuid
else
  unique_id="$$-${RANDOM}${RANDOM}"
fi

base_name="supabase-${timestamp}-${unique_id}"
dump_object="${OCI_OBJECT_PREFIX}/${base_name}.dump"
manifest_object="${OCI_OBJECT_PREFIX}/${base_name}.dump.sha256"

if [[ "$mode" == "dry-run" ]]; then
  log "dry-run-planned" "$dump_object"
  log "dry-run-planned" "$manifest_object"
  exit 0
fi

for command_path in "$PG_DUMP_BIN" "$PG_RESTORE_BIN" "$OCI_BIN" python3 mktemp sha256sum; do
  command -v -- "$command_path" >/dev/null 2>&1 || fail "none"
done

temp_dir="$(mktemp -d)"
dump_path="${temp_dir}/${base_name}.dump"
manifest_path="${temp_dir}/${base_name}.dump.sha256"

python3 - "$temp_dir/pg_service.conf" <<'PY'
import os
import sys
from urllib.parse import parse_qs, unquote, urlparse

url = os.environ["DATABASE_URL"]
parsed = urlparse(url)
if parsed.scheme not in {"postgres", "postgresql"} or not parsed.hostname or not parsed.path:
    raise SystemExit("DATABASE_URL must be a PostgreSQL URL")

values = {
    "host": parsed.hostname,
    "port": parsed.port or 5432,
    "user": unquote(parsed.username or ""),
    "password": unquote(parsed.password or ""),
    "dbname": unquote(parsed.path.lstrip("/")),
}
for key in ("sslmode", "sslrootcert", "sslcert", "sslkey", "gssencmode", "channel_binding"):
    values[key] = parse_qs(parsed.query, keep_blank_values=True).get(key, [""])[-1]

def escape(value: object) -> str:
    return str(value).replace("\\", "\\\\").replace("\n", "\\n").replace("\r", "\\r")

with open(sys.argv[1], "w", encoding="utf-8") as service_file:
    service_file.write("[aura-backup]\n")
    for key, value in values.items():
        if value != "":
            rendered = str(value) if key == "port" else escape(value)
            service_file.write(f"{key}={rendered}\n")
os.chmod(sys.argv[1], 0o600)
PY

export PGSERVICEFILE="$temp_dir/pg_service.conf"
export PGSERVICE="aura-backup"
unset DATABASE_URL

current_object="$dump_object"
log "dump-started" "$dump_object"
"$PG_DUMP_BIN" --format=custom --no-owner --no-acl --file="$dump_path"
unset PGSERVICE PGSERVICEFILE
log "dump-complete" "$dump_object"

log "archive-verify-started" "$dump_object"
"$PG_RESTORE_BIN" --list "$dump_path" >/dev/null
log "archive-verify-complete" "$dump_object"

(
  cd -- "$temp_dir"
  sha256sum -- "${base_name}.dump" > "${base_name}.dump.sha256"
)
log "manifest-created" "$manifest_object"

log "upload-started" "$dump_object"
"$OCI_BIN" os object put \
  --auth instance_principal \
  --region "$OCI_REGION" \
  --namespace "$OCI_NAMESPACE" \
  --bucket-name "$OCI_BUCKET_NAME" \
  --name "$dump_object" \
  --file "$dump_path" \
  --verify-checksum \
  --no-overwrite \
  >/dev/null
log "upload-complete" "$dump_object"

current_object="$manifest_object"
log "upload-started" "$manifest_object"
"$OCI_BIN" os object put \
  --auth instance_principal \
  --region "$OCI_REGION" \
  --namespace "$OCI_NAMESPACE" \
  --bucket-name "$OCI_BUCKET_NAME" \
  --name "$manifest_object" \
  --file "$manifest_path" \
  --verify-checksum \
  --no-overwrite \
  >/dev/null
log "upload-complete" "$manifest_object"
log "success" "$manifest_object"

# Retention and deletion belong to the private bucket lifecycle policy.
# This script intentionally never deletes remote objects.
