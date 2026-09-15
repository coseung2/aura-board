#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: build-ci-artifact.sh <release-id> <output-dir>" >&2
  exit 1
fi

release_id=$1
output_dir=$2
source_dir=$(pwd -P)

if [[ ! ${release_id} =~ ^[0-9a-f]{40}$ ]]; then
  echo "invalid release id: ${release_id}" >&2
  exit 1
fi
test -f "${source_dir}/package-lock.json"
test -f "${source_dir}/services/play-engine/Cargo.lock"

source "${source_dir}/infra/oracle/build-cache.sh"
prepare_build_cache

timed() {
  local label=$1 started=${SECONDS}
  shift
  "$@"
  echo "build_timing_${label}_seconds=$((SECONDS - started))"
}

# npm ci runs the existing postinstall Prisma generation once. Keep install
# scripts enabled for native modules. Next's build performs the typecheck.
timed install npm ci --include=dev --no-audit --no-fund
timed native npm run ensure-native
timed schema npx prisma validate
timed web node --max-old-space-size=4096 node_modules/next/dist/bin/next build
save_build_cache

engine_started=${SECONDS}
cargo test --locked --manifest-path services/play-engine/Cargo.toml --workspace
cargo build --locked --release --manifest-path services/play-engine/Cargo.toml -p play-server
echo "build_timing_engine_seconds=$((SECONDS - engine_started))"
engine_binary="${CARGO_TARGET_DIR:-${source_dir}/services/play-engine/target}/release/play-server"

if [[ ${AURA_BUILD_CUTOVER_MANIFEST:-0} == 1 ]]; then
  test -f .next/standalone/server.js
  test -f "${engine_binary}"
  python3 infra/oracle/create-cutover-build-manifest.py \
    --build-sha "${release_id}" \
    --app-artifact .next/standalone/server.js \
    --engine-artifact "${engine_binary}" \
    --output .next/standalone/cutover-build-manifest.json \
    --write
  test -s .next/standalone/cutover-build-manifest.json
fi

bundle_dir=$(mktemp -d)
cleanup() {
  rm -rf -- "${bundle_dir}"
}
trap cleanup EXIT

mkdir -p "${bundle_dir}/app/.next" "${bundle_dir}/engine" "${output_dir}"
cp -a .next/standalone/. "${bundle_dir}/app/"
cp -a .next/static "${bundle_dir}/app/.next/static"
install -m 0755 "${engine_binary}" \
  "${bundle_dir}/engine/play-server"
printf '%s\n' "${release_id}" > "${bundle_dir}/release-id"

archive="${output_dir}/oracle-release.tar.gz"
tar \
  --sort=name \
  --mtime='UTC 1970-01-01' \
  --owner=0 \
  --group=0 \
  --numeric-owner \
  -czf "${archive}" \
  -C "${bundle_dir}" .
(
  cd "${output_dir}"
  sha256sum oracle-release.tar.gz > oracle-release.tar.gz.sha256
)

echo "artifact_ready=${archive}"
