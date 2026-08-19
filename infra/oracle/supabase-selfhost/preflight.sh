#!/usr/bin/env bash

set -Eeuo pipefail

fail() {
  printf '[supabase-preflight] FAIL: %s\n' "$1" >&2
  exit 1
}

warn() {
  printf '[supabase-preflight] WARN: %s\n' "$1" >&2
}

ok() {
  printf '[supabase-preflight] OK: %s\n' "$1"
}

arch="$(uname -m)"
case "$arch" in
  aarch64|arm64)
    ok "architecture=$arch"
    ;;
  *)
    fail "expected ARM64 host, got $arch"
    ;;
esac

cpu_count="$(getconf _NPROCESSORS_ONLN 2>/dev/null || nproc)"
if (( cpu_count < 4 )); then
  fail "expected at least 4 online CPUs/OCPUs for the staging target, got $cpu_count"
fi
ok "online_cpus=$cpu_count"

mem_kib="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
mem_gib=$((mem_kib / 1024 / 1024))
if (( mem_gib < 20 )); then
  fail "expected roughly 24 GB RAM after resize; detected ${mem_gib} GiB"
fi
ok "memory_gib=${mem_gib}"

if command -v docker >/dev/null 2>&1; then
  docker_version="$(docker --version)"
  ok "$docker_version"
else
  warn "docker is not installed yet"
fi

if docker compose version >/dev/null 2>&1; then
  ok "$(docker compose version)"
else
  warn "docker compose plugin is not available yet"
fi

for port in 18000 15432 16543; do
  if ss -ltnH "sport = :$port" 2>/dev/null | grep -q .; then
    fail "staging port $port is already listening"
  fi
  ok "port $port is free"
done

data_root="${AURA_BOARD_DATA_ROOT:-/srv/aura-board}"
if ! mountpoint -q "$data_root"; then
  fail "$data_root must be a dedicated mounted filesystem before staging"
fi

data_avail_kib="$(df -Pk "$data_root" | awk 'NR==2 {print $4}')"
data_avail_gib=$((data_avail_kib / 1024 / 1024))
if (( data_avail_gib < 60 )); then
  fail "$data_root has only ${data_avail_gib} GiB free; keep at least 60 GiB available before the first full-stack pull"
fi
ok "data_root=$data_root free_gib=${data_avail_gib}"

root_avail_kib="$(df -Pk / | awk 'NR==2 {print $4}')"
root_avail_gib=$((root_avail_kib / 1024 / 1024))
if (( root_avail_gib < 10 )); then
  warn "root filesystem has only ${root_avail_gib} GiB free"
else
  ok "root_free_gib=${root_avail_gib}"
fi

if command -v docker >/dev/null 2>&1; then
  docker_root="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || true)"
  if [[ -n "$docker_root" && "$docker_root" != "$data_root/docker" ]]; then
    fail "DockerRootDir is $docker_root; expected $data_root/docker"
  fi
  [[ -n "$docker_root" ]] && ok "docker_root=$docker_root"
fi

printf '[supabase-preflight] INFO: top memory consumers\n'
ps -eo pid,comm,%cpu,%mem,rss --sort=-rss | head -n 12

printf '[supabase-preflight] INFO: filesystem usage\n'
df -h / /opt 2>/dev/null || df -h /

printf '[supabase-preflight] SUCCESS\n'
