#!/usr/bin/env bash

set -Eeuo pipefail
umask 077
export LC_ALL=C

readonly DEFAULT_IMAGE="supabase/postgres:17.6.1.136@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a"
readonly IMAGE_DIGEST_PATTERN='^[A-Za-z0-9][A-Za-z0-9._:/-]*@sha256:[0-9a-f]{64}$'
readonly IMAGE_UNPINNED_PATTERN='^[A-Za-z0-9][A-Za-z0-9._:/-]*$'
readonly OWNER_LABEL_KEY="com.aura-board.restore-rehearsal"
readonly READY_ATTEMPTS=30
readonly READY_DELAY_SECONDS=1

mode=""
archive=""
manifest=""
check_sql=""
image="$DEFAULT_IMAGE"
unsafe_unpinned_image=0

RESTORE_CPU_LIMIT="${RESTORE_CPU_LIMIT:-1.0}"
RESTORE_MEMORY_LIMIT="${RESTORE_MEMORY_LIMIT:-1g}"
RESTORE_MEMORY_SWAP_LIMIT="${RESTORE_MEMORY_SWAP_LIMIT:-$RESTORE_MEMORY_LIMIT}"
RESTORE_PIDS_LIMIT="${RESTORE_PIDS_LIMIT:-256}"
RESTORE_TMPFS_SIZE="${RESTORE_TMPFS_SIZE:-64m}"
RESTORE_DATA_TMPFS_SIZE="${RESTORE_DATA_TMPFS_SIZE:-2g}"
RESTORE_INTEGRITY_TIMEOUT_SECONDS="${RESTORE_INTEGRITY_TIMEOUT_SECONDS:-60}"
RESTORE_TIMEOUT_SECONDS="${RESTORE_TIMEOUT_SECONDS:-900}"
RESTORE_CLEANUP_TIMEOUT_SECONDS="${RESTORE_CLEANUP_TIMEOUT_SECONDS:-30}"

archive_dir=""
archive_basename=""
manifest_basename=""
archive_path=""
manifest_path=""
check_sql_path=""
staging_dir=""
staged_archive_path=""
staged_manifest_path=""
staged_check_sql_path=""
staged_pgsodium_key_path=""
container_name=""
container_owner_label=""
container_possible=0
container_started=0
size_bytes=0

usage() {
  printf 'Usage: %s --dry-run|--write --archive PATH --manifest PATH [--check-sql PATH] [--image IMAGE] [--unsafe-allow-unpinned-image]\n' \
    "${0##*/}"
  printf 'Default immutable image: %s\n' "$DEFAULT_IMAGE"
  printf 'Validated overrides: RESTORE_CPU_LIMIT, RESTORE_MEMORY_LIMIT, RESTORE_MEMORY_SWAP_LIMIT, RESTORE_PIDS_LIMIT, RESTORE_TMPFS_SIZE, RESTORE_DATA_TMPFS_SIZE, RESTORE_INTEGRITY_TIMEOUT_SECONDS, RESTORE_TIMEOUT_SECONDS, RESTORE_CLEANUP_TIMEOUT_SECONDS\n'
}

fail() {
  local reason="$1"
  local status="${2:-1}"
  printf '[restore-rehearsal] stage=failed reason=%s\n' "$reason" >&2
  exit "$status"
}

log_stage() {
  printf '[restore-rehearsal] stage=%s\n' "$1"
}

on_error() {
  local status=$?
  trap - ERR
  fail "operation" "$status"
}

cleanup() {
  local status=$?
  local cleanup_failed=0
  local inspect_status=0
  local removal_check_status=0
  local inspect_line=""
  local inspected_id=""
  local inspected_label=""
  trap - EXIT INT TERM HUP ERR

  if [[ "$container_possible" == 1 && -n "$container_name" ]]; then
    if inspect_line="$(run_with_timeout "$RESTORE_CLEANUP_TIMEOUT_SECONDS" docker container inspect \
      --format '{{.Id}} {{index .Config.Labels "com.aura-board.restore-rehearsal"}}' \
      "$container_name" 2>/dev/null)"; then
      read -r inspected_id inspected_label <<< "$inspect_line" || true
      if [[ "$inspected_label" == "$container_owner_label" && "$inspected_id" =~ ^[0-9a-fA-F]{12,64}$ ]]; then
        if ! run_with_timeout "$RESTORE_CLEANUP_TIMEOUT_SECONDS" docker container rm -f "$inspected_id" >/dev/null 2>&1; then
          cleanup_failed=1
        elif run_with_timeout "$RESTORE_CLEANUP_TIMEOUT_SECONDS" docker container inspect "$container_name" >/dev/null 2>&1; then
          cleanup_failed=1
        else
          removal_check_status=$?
          if (( removal_check_status == 124 || removal_check_status == 137 )); then
            cleanup_failed=1
          fi
        fi
      else
        cleanup_failed=1
      fi
    else
      inspect_status=$?
      if (( inspect_status == 124 || inspect_status == 137 || container_started == 1 )); then
        cleanup_failed=1
      fi
    fi
  fi

  if [[ -n "$staging_dir" && -d "$staging_dir" && ! -L "$staging_dir" && -O "$staging_dir" ]]; then
    rm -rf -- "$staging_dir" || true
  fi
  if (( cleanup_failed == 1 )); then
    printf '[restore-rehearsal] stage=failed reason=cleanup\n' >&2
    (( status == 0 )) && status=1
  fi
  exit "$status"
}

trap on_error ERR
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

has_control_chars() {
  [[ "$1" =~ [[:cntrl:]] ]]
}

require_safe_value() {
  local value="$1"
  local reason="$2"
  [[ -n "$value" ]] || fail "$reason"
  if has_control_chars "$value"; then
    fail "control-chars"
  fi
}

require_regular_file() {
  local path="$1"
  require_safe_value "$path" "path"
  [[ -L "$path" ]] && fail "symlink"
  [[ -f "$path" ]] || fail "nonregular"
}

validate_image() {
  require_safe_value "$image" "image"
  if [[ "$image" =~ $IMAGE_DIGEST_PATTERN ]]; then
    return
  fi
  if (( unsafe_unpinned_image == 1 )) && [[ "$image" =~ $IMAGE_UNPINNED_PATTERN ]]; then
    log_stage "unsafe-unpinned-image-override"
    return
  fi
  fail "image-unpinned"
}

validate_positive_integer() {
  local name="$1"
  local value="$2"
  local maximum="$3"
  [[ "$value" =~ ^[1-9][0-9]*$ ]] || fail "config-$name"
  (( ${#value} < ${#maximum} )) && return
  (( ${#value} == ${#maximum} )) || fail "config-$name"
  [[ "$value" > "$maximum" ]] && fail "config-$name"
}

validate_cpu_limit() {
  local value="$1"
  local integer_part
  local fraction_part
  [[ "$value" =~ ^([0-8])([.][0-9]{1,3})?$ ]] || fail "config-cpu"
  integer_part="${BASH_REMATCH[1]}"
  fraction_part="${BASH_REMATCH[2]:-}"
  if (( 10#$integer_part == 0 )); then
    [[ "${fraction_part#.}" =~ [1-9] ]] || fail "config-cpu"
  fi
  if (( 10#$integer_part == 8 )); then
    [[ "${fraction_part#.}" =~ [1-9] ]] && fail "config-cpu"
  fi
}

size_to_bytes() {
  local value="$1"
  local reason="$2"
  local number
  local unit
  local multiplier=1
  [[ "$value" =~ ^([1-9][0-9]*)([kKmMgG])?$ ]] || fail "config-$reason"
  number="${BASH_REMATCH[1]}"
  unit="${BASH_REMATCH[2]:-}"
  case "$unit" in
    k|K) multiplier=$((1024)) ;;
    m|M) multiplier=$((1024 * 1024)) ;;
    g|G) multiplier=$((1024 * 1024 * 1024)) ;;
    "") ;;
    *) fail "config-$reason" ;;
  esac
  (( ${#number} <= 11 )) || fail "config-$reason"
  (( 10#$number <= (64 * 1024 * 1024 * 1024) / multiplier )) || fail "config-$reason"
  size_bytes=$((10#$number * multiplier))
}

validate_resource_config() {
  validate_cpu_limit "$RESTORE_CPU_LIMIT"
  size_to_bytes "$RESTORE_MEMORY_LIMIT" "memory"
  local memory_bytes="$size_bytes"
  size_to_bytes "$RESTORE_MEMORY_SWAP_LIMIT" "memory-swap"
  (( size_bytes >= memory_bytes )) || fail "config-memory-swap"
  size_to_bytes "$RESTORE_TMPFS_SIZE" "tmpfs"
  size_to_bytes "$RESTORE_DATA_TMPFS_SIZE" "data-tmpfs"
  validate_positive_integer "pids" "$RESTORE_PIDS_LIMIT" 4096
  validate_positive_integer "integrity-timeout" "$RESTORE_INTEGRITY_TIMEOUT_SECONDS" 3600
  validate_positive_integer "restore-timeout" "$RESTORE_TIMEOUT_SECONDS" 86400
  validate_positive_integer "cleanup-timeout" "$RESTORE_CLEANUP_TIMEOUT_SECONDS" 300
}

parse_args() {
  while (( $# > 0 )); do
    case "$1" in
      --dry-run|--write)
        [[ -z "$mode" ]] || fail "arguments" 2
        mode="${1#--}"
        shift
        ;;
      --archive)
        (( $# >= 2 )) || fail "arguments" 2
        archive="$2"
        shift 2
        ;;
      --archive=*)
        archive="${1#*=}"
        shift
        ;;
      --manifest)
        (( $# >= 2 )) || fail "arguments" 2
        manifest="$2"
        shift 2
        ;;
      --manifest=*)
        manifest="${1#*=}"
        shift
        ;;
      --check-sql)
        (( $# >= 2 )) || fail "arguments" 2
        check_sql="$2"
        shift 2
        ;;
      --check-sql=*)
        check_sql="${1#*=}"
        shift
        ;;
      --image)
        (( $# >= 2 )) || fail "arguments" 2
        image="$2"
        shift 2
        ;;
      --image=*)
        image="${1#*=}"
        shift
        ;;
      --unsafe-allow-unpinned-image)
        unsafe_unpinned_image=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        fail "arguments" 2
        ;;
    esac
  done

  [[ "$mode" == "dry-run" || "$mode" == "write" ]] || fail "mode" 2
  [[ -n "$archive" && -n "$manifest" ]] || fail "arguments" 2
  require_safe_value "$archive" "path"
  require_safe_value "$manifest" "path"
  validate_image
  validate_resource_config
}

resolve_sibling_paths() {
  local archive_dir_input
  local manifest_dir_input
  local archive_dir_real
  local manifest_dir_real

  archive_dir_input="$(dirname -- "$archive")"
  manifest_dir_input="$(dirname -- "$manifest")"
  if ! archive_dir_real="$(cd -- "$archive_dir_input" 2>/dev/null && pwd -P)"; then
    fail "path"
  fi
  if ! manifest_dir_real="$(cd -- "$manifest_dir_input" 2>/dev/null && pwd -P)"; then
    fail "path"
  fi
  [[ "$archive_dir_real" == "$manifest_dir_real" ]] || fail "sibling-pair"

  archive_dir="$archive_dir_real"
  archive_basename="$(basename -- "$archive")"
  manifest_basename="$(basename -- "$manifest")"
  [[ -n "$archive_basename" && "$archive_basename" != "." && "$archive_basename" != ".." ]] || fail "path"
  [[ "$manifest_basename" != "." && "$manifest_basename" != ".." ]] || fail "path"
  [[ "$archive_basename" != *'\'* ]] || fail "path"
  [[ "$manifest_basename" != *'\'* ]] || fail "path"
  archive_path="$archive_dir/$archive_basename"
  manifest_path="$archive_dir/$manifest_basename"
  [[ "$archive_path" != "$manifest_path" ]] || fail "sibling-pair"
}

validate_manifest_reference() {
  local manifest_file="$1"
  local expected_basename="$2"
  local manifest_fd
  local manifest_line=""
  local extra_byte=""
  local digest
  local separator
  local reference
  local expected_size=$((67 + ${#expected_basename}))
  local manifest_size

  require_regular_file "$manifest_file"
  manifest_size="$(wc -c < "$manifest_file")"
  (( manifest_size == expected_size )) || fail "manifest"

  if ! exec {manifest_fd}< "$manifest_file"; then
    fail "manifest"
  fi
  if ! IFS= read -r -u "$manifest_fd" manifest_line; then
    exec {manifest_fd}<&-
    fail "manifest"
  fi
  if IFS= read -r -n 1 -u "$manifest_fd" extra_byte; then
    exec {manifest_fd}<&-
    fail "manifest"
  fi
  exec {manifest_fd}<&-

  [[ ${#manifest_line} -eq $((66 + ${#expected_basename})) ]] || fail "manifest"
  digest="${manifest_line:0:64}"
  separator="${manifest_line:64:2}"
  reference="${manifest_line:66}"
  [[ "$digest" =~ ^[0-9a-f]{64}$ ]] || fail "manifest"
  [[ "$separator" == "  " ]] || fail "manifest"
  [[ "$reference" == "$expected_basename" ]] || fail "manifest"
}

copy_private_file() {
  local source_path="$1"
  local destination_path="$2"
  if ! cp --no-dereference -- "$source_path" "$destination_path"; then
    fail "staging-copy"
  fi
  [[ ! -L "$destination_path" && -f "$destination_path" ]] || fail "staging-file"
  chmod 0400 -- "$destination_path"
}

stage_inputs() {
  if ! staging_dir="$(mktemp -d -- "${TMPDIR:-/tmp}/aura-restore.XXXXXX")"; then
    fail "staging"
  fi
  chmod 0700 -- "$staging_dir"
  [[ -O "$staging_dir" && ! -L "$staging_dir" ]] || fail "staging"

  staged_archive_path="$staging_dir/$archive_basename"
  staged_manifest_path="$staging_dir/$manifest_basename"
  copy_private_file "$archive_path" "$staged_archive_path"
  copy_private_file "$manifest_path" "$staged_manifest_path"
  validate_manifest_reference "$staged_manifest_path" "$archive_basename"

  if [[ -n "$check_sql" ]]; then
    check_sql_path="$(cd -- "$(dirname -- "$check_sql")" 2>/dev/null && pwd -P)/$(basename -- "$check_sql")" || fail "path"
    staged_check_sql_path="$staging_dir/check.sql"
    copy_private_file "$check_sql_path" "$staged_check_sql_path"
  fi
}

require_command() {
  local command_name="$1"
  command -v -- "$command_name" >/dev/null 2>&1 || fail "dependency"
}

run_with_timeout() {
  local seconds="$1"
  shift
  timeout --signal=TERM --kill-after=5s "${seconds}s" "$@"
}

verify_archive() {
  # The checksum binds the staged bytes only. Authenticity against a paired
  # archive/manifest replacement comes from the encrypted offsite artifact or
  # an independent signature, not from unauthenticated SHA-256 alone.
  log_stage "checksum-start"
  if ! (
    cd -- "$staging_dir" &&
    run_with_timeout "$RESTORE_INTEGRITY_TIMEOUT_SECONDS" sha256sum --check --strict --status -- "$manifest_basename"
  ) >/dev/null 2>&1; then
    fail "checksum"
  fi
  log_stage "checksum-complete"

  log_stage "archive-list-start"
  if ! run_with_timeout "$RESTORE_INTEGRITY_TIMEOUT_SECONDS" pg_restore --list -- "$staged_archive_path" >/dev/null 2>&1; then
    fail "archive-list"
  fi
  log_stage "archive-list-complete"

  log_stage "checksum-recheck-start"
  if ! (
    cd -- "$staging_dir" &&
    run_with_timeout "$RESTORE_INTEGRITY_TIMEOUT_SECONDS" sha256sum --check --strict --status -- "$manifest_basename"
  ) >/dev/null 2>&1; then
    fail "checksum"
  fi
  log_stage "checksum-recheck-complete"
}

wait_for_postgres() {
  local attempt
  for (( attempt = 1; attempt <= READY_ATTEMPTS; attempt += 1 )); do
    if run_with_timeout "$RESTORE_INTEGRITY_TIMEOUT_SECONDS" docker exec "$container_name" pg_isready \
      --host=127.0.0.1 \
      --port=5432 \
      --username=postgres \
      --dbname=postgres \
      --timeout=1 >/dev/null 2>&1; then
      return 0
    fi
    sleep "$READY_DELAY_SECONDS"
  done
  return 1
}

prepare_pgsodium_key() {
  local key_value
  staged_pgsodium_key_path="$staging_dir/pgsodium_root.key"
  if ! key_value="$(openssl rand -hex 32)"; then
    fail "pgsodium-key"
  fi
  [[ "$key_value" =~ ^[0-9a-f]{64}$ ]] || fail "pgsodium-key"
  printf '%s\n' "$key_value" > "$staged_pgsodium_key_path"
  key_value=""
  chmod 0444 -- "$staged_pgsodium_key_path"
}

run_write_rehearsal() {
  local attempt_id
  local image_cmd_output
  local ready
  local image_arg
  local -a docker_run_args
  local -a image_cmd

  log_stage "image-check-start"
  if ! run_with_timeout "$RESTORE_INTEGRITY_TIMEOUT_SECONDS" docker image inspect "$image" >/dev/null 2>&1; then
    log_stage "image-pull-start"
    if ! run_with_timeout "$RESTORE_INTEGRITY_TIMEOUT_SECONDS" docker pull --platform linux/arm64 "$image" >/dev/null 2>&1; then
      fail "image-pull"
    fi
    log_stage "image-pull-complete"
  fi
  log_stage "image-check-complete"

  if ! image_cmd_output="$(run_with_timeout "$RESTORE_INTEGRITY_TIMEOUT_SECONDS" docker image inspect \
    --format '{{range .Config.Cmd}}{{println .}}{{end}}' "$image")"; then
    fail "image-cmd"
  fi
  mapfile -t image_cmd <<< "$image_cmd_output"
  (( ${#image_cmd[@]} >= 1 && ${#image_cmd[@]} <= 32 )) || fail "image-cmd"
  for image_arg in "${image_cmd[@]}"; do
    [[ -n "$image_arg" && ${#image_arg} -le 4096 ]] || fail "image-cmd"
    has_control_chars "$image_arg" && fail "image-cmd"
  done

  prepare_pgsodium_key

  attempt_id="$(date -u +%Y%m%dT%H%M%SZ)-$BASHPID-${RANDOM}${RANDOM}"
  container_name="aura-board-restore-${attempt_id}"
  container_owner_label="${attempt_id}-${RANDOM}${RANDOM}"
  container_possible=1
  docker_run_args=(
    run
    --detach
    --name "$container_name"
    --label "$OWNER_LABEL_KEY=$container_owner_label"
    --platform linux/arm64
    --network none
    --restart=no
    --read-only
    --cap-drop=ALL
    --cap-add=CHOWN
    --cap-add=DAC_OVERRIDE
    --cap-add=FOWNER
    --cap-add=SETGID
    --cap-add=SETUID
    --security-opt no-new-privileges:true
    --cpus="$RESTORE_CPU_LIMIT"
    --memory="$RESTORE_MEMORY_LIMIT"
    --memory-swap="$RESTORE_MEMORY_SWAP_LIMIT"
    --pids-limit="$RESTORE_PIDS_LIMIT"
    --tmpfs "/tmp:rw,noexec,nosuid,nodev,size=$RESTORE_TMPFS_SIZE"
    --tmpfs "/run/postgresql:rw,noexec,nosuid,nodev,size=16m"
    --tmpfs "/var/lib/postgresql/data:rw,nosuid,nodev,size=$RESTORE_DATA_TMPFS_SIZE"
    --mount "type=bind,src=$staged_archive_path,dst=/tmp/aura-restore.archive,readonly"
    --mount "type=bind,src=$staged_pgsodium_key_path,dst=/etc/postgresql-custom/pgsodium_root.key,readonly"
    --env POSTGRES_HOST_AUTH_METHOD=trust
    --env POSTGRES_DB=postgres
  )
  if [[ -n "$check_sql" ]]; then
    docker_run_args+=(--mount "type=bind,src=$staged_check_sql_path,dst=/tmp/aura-restore.check.sql,readonly")
  fi
  docker_run_args+=("$image" "${image_cmd[@]}" -c "cron.database_name=aura_restore_scratch")

  log_stage "container-start"
  if ! run_with_timeout "$RESTORE_INTEGRITY_TIMEOUT_SECONDS" docker "${docker_run_args[@]}" >/dev/null 2>&1; then
    fail "container-start"
  fi
  container_started=1
  log_stage "container-started"

  log_stage "readiness-start"
  ready=0
  if wait_for_postgres; then
    ready=1
  fi
  if (( ready != 1 )); then
    run_with_timeout "$RESTORE_CLEANUP_TIMEOUT_SECONDS" docker logs --tail 100 "$container_name" >&2 2>/dev/null || true
    fail "readiness"
  fi
  log_stage "readiness-complete"

  log_stage "scratch-db-create-start"
  if ! run_with_timeout "$RESTORE_INTEGRITY_TIMEOUT_SECONDS" docker exec "$container_name" createdb \
    --host=127.0.0.1 \
    --port=5432 \
    --username=supabase_admin \
    aura_restore_scratch >/dev/null 2>&1; then
    fail "scratch-db-create"
  fi
  log_stage "scratch-db-create-complete"

  log_stage "restore-start"
  if ! run_with_timeout "$RESTORE_TIMEOUT_SECONDS" docker exec "$container_name" pg_restore \
    --exit-on-error \
    --no-owner \
    --no-acl \
    --host=127.0.0.1 \
    --port=5432 \
    --username=supabase_admin \
    --dbname=aura_restore_scratch \
    /tmp/aura-restore.archive >"$staging_dir/pg_restore.log" 2>&1; then
    tail -n 100 "$staging_dir/pg_restore.log" >&2 2>/dev/null || true
    fail "restore"
  fi
  log_stage "restore-complete"

  if [[ -n "$check_sql" ]]; then
    log_stage "check-sql-start"
    if ! run_with_timeout "$RESTORE_INTEGRITY_TIMEOUT_SECONDS" docker exec "$container_name" psql \
      --host=127.0.0.1 \
      --port=5432 \
      --username=supabase_admin \
      --dbname=aura_restore_scratch \
      --set=ON_ERROR_STOP=1 \
      --quiet \
      --file=/tmp/aura-restore.check.sql >/dev/null 2>&1; then
      fail "check-sql"
    fi
    log_stage "check-sql-complete"
  fi
}

parse_args "$@"
resolve_sibling_paths
require_regular_file "$archive_path"
require_regular_file "$manifest_path"
if [[ -n "$check_sql" ]]; then
  require_regular_file "$check_sql"
fi
require_command cp
require_command chmod
require_command mktemp
require_command sha256sum
require_command pg_restore
require_command timeout
stage_inputs
verify_archive

if [[ "$mode" == "dry-run" ]]; then
  log_stage "dry-run-success"
  exit 0
fi

require_command docker
require_command openssl
run_write_rehearsal
log_stage "success"
exit 0
