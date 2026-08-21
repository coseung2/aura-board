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

npm ci --include=dev --no-audit --no-fund
npm run typecheck
npx prisma validate
npm run build

cargo test --locked --manifest-path services/play-engine/Cargo.toml --workspace
cargo build --locked --release --manifest-path services/play-engine/Cargo.toml -p play-server

if [[ ${AURA_BUILD_CUTOVER_MANIFEST:-0} == 1 ]]; then
  test -f .next/standalone/server.js
  test -f services/play-engine/target/release/play-server
  python3 infra/oracle/create-cutover-build-manifest.py \
    --build-sha "${release_id}" \
    --app-artifact .next/standalone/server.js \
    --engine-artifact services/play-engine/target/release/play-server \
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
install -m 0755 services/play-engine/target/release/play-server \
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
