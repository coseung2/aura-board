#!/usr/bin/env bash
# Sourced by the trusted main-branch build. Cache only; never a release artifact.

prepare_build_cache() {
  [[ -n ${AURA_BUILD_CACHE_ROOT:-} ]] || return 0
  if [[ ${AURA_BUILD_CACHE_ROOT} != /* || -L ${AURA_BUILD_CACHE_ROOT} ]]; then
    echo 'Build cache must be an absolute, non-symlink directory' >&2
    return 1
  fi
  local root
  root=$(realpath -m -- "${AURA_BUILD_CACHE_ROOT}")
  case "${root}" in
    /|"${source_dir}"|"${source_dir}"/*)
      echo 'Build cache must be outside the checkout' >&2; return 1 ;;
  esac
  mkdir -p -- "${root}"
  # One runner may host manual invocations too; hold the lock for this build.
  exec 9>"${root}/build.lock"
  flock -w 600 9
  local web_key engine_key
  web_key=$({ node --version; sha256sum package-lock.json next.config.ts tsconfig.json; } | sha256sum | cut -d' ' -f1)
  engine_key=$({ rustc -vV; sha256sum services/play-engine/Cargo.lock; printf '%s\n' "${RUSTFLAGS:-}" "${CARGO_PROFILE_DEV_DEBUG:-}" "${CARGO_INCREMENTAL:-}"; } | sha256sum | cut -d' ' -f1)
  web_cache="${root}/next-${web_key}"
  export CARGO_TARGET_DIR="${root}/rust-${engine_key}"
  test ! -L "${web_cache}"
  test ! -L "${CARGO_TARGET_DIR}"
  mkdir -p -- "${web_cache}" "${CARGO_TARGET_DIR}" .next/cache
  cp -a "${web_cache}/." .next/cache/
  echo '[build-cache] Next cache restored; persistent Cargo target enabled'
}

save_build_cache() {
  [[ -n ${web_cache:-} && -d .next/cache ]] || return 0
  # Do not store .next/standalone or runtime credentials/data in the cache.
  cp -a .next/cache/. "${web_cache}/"
  echo '[build-cache] Next cache saved'
}
