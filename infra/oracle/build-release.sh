#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "build-release.sh must run as root" >&2
  exit 1
fi
if [[ $# -ne 2 ]]; then
  echo "usage: build-release.sh <source-dir> <release-id>" >&2
  exit 1
fi

source_dir=$1
release_id=$2
app_release="/opt/aura-board-app/releases/${release_id}"
engine_release="/opt/aura-board-play-engine/releases/${release_id}"
app_staging="${app_release}.staging.$$"
engine_staging="${engine_release}.staging.$$"

cleanup() {
  rm -rf -- "${app_staging}" "${engine_staging}"
}
trap cleanup EXIT

test -f "${source_dir}/package-lock.json"
test -f "${source_dir}/services/play-engine/Cargo.lock"
test -s /etc/aura-board/build.env
if [[ -e ${app_release} || -e ${engine_release} ]]; then
  echo "release already exists: ${release_id}" >&2
  exit 1
fi

runuser -u aura-app -- env HOME=/var/lib/aura-app bash -c '
  set -euo pipefail
  set -a
  . /etc/aura-board/build.env
  set +a
  cd "$1"
  npm ci --include=dev --no-audit --no-fund
  npm run typecheck
  npx prisma validate
  npm run build
' bash "${source_dir}"

if [[ ! -x /var/lib/aura-app/.cargo/bin/rustc ]]; then
  runuser -u aura-app -- env HOME=/var/lib/aura-app bash -c '
    set -euo pipefail
    curl --proto "=https" --tlsv1.2 --silent --show-error --fail \
      https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain 1.95.0
  '
fi

runuser -u aura-app -- env \
  HOME=/var/lib/aura-app \
  PATH=/var/lib/aura-app/.cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  bash -c '
    set -euo pipefail
    cd "$1"
    cargo test --locked --manifest-path services/play-engine/Cargo.toml --workspace
    cargo build --locked --release --manifest-path services/play-engine/Cargo.toml -p play-server
  ' bash "${source_dir}"

install -d -o root -g root -m 0755 "${app_staging}" "${engine_staging}"
cp -a "${source_dir}/.next/standalone/." "${app_staging}/"
cp -a "${source_dir}/public" "${app_staging}/public"
install -d -o root -g root -m 0755 "${app_staging}/.next"
cp -a "${source_dir}/.next/static" "${app_staging}/.next/static"
ln -s /opt/aura-board-app/shared/cache "${app_staging}/.next/cache"
install -o root -g root -m 0755 \
  "${source_dir}/services/play-engine/target/release/play-server" \
  "${engine_staging}/play-server"
chown -R root:root "${app_staging}" "${engine_staging}"
find "${app_staging}" "${engine_staging}" -type d -exec chmod 0755 {} +
find "${app_staging}" "${engine_staging}" -type f -exec chmod go-w {} +
chmod 0755 "${engine_staging}/play-server"

(
  cd "${app_staging}"
  sha256sum server.js > .release-sha256
  printf '%s\n' "${release_id}" > .release-complete
)
(
  cd "${engine_staging}"
  sha256sum play-server > .release-sha256
  printf '%s\n' "${release_id}" > .release-complete
)
chmod 0444 \
  "${app_staging}/.release-sha256" "${app_staging}/.release-complete" \
  "${engine_staging}/.release-sha256" "${engine_staging}/.release-complete"

mv -T "${app_staging}" "${app_release}"
mv -T "${engine_staging}" "${engine_release}"

trap - EXIT
echo "release_built=${release_id}"
