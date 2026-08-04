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

test -f "${source_dir}/package-lock.json"
test -f "${source_dir}/services/play-engine/Cargo.lock"
test -s /etc/aura-board/app.env
if [[ -e ${app_release} || -e ${engine_release} ]]; then
  echo "release already exists: ${release_id}" >&2
  exit 1
fi

runuser -u aura-app -- env HOME=/var/lib/aura-app bash -c '
  set -euo pipefail
  set -a
  . /etc/aura-board/app.env
  set +a
  cd "$1"
  npm ci --no-audit --no-fund
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

install -d -o aura-app -g aura-app -m 0750 "${app_release}" "${engine_release}"
cp -a "${source_dir}/.next/standalone/." "${app_release}/"
cp -a "${source_dir}/public" "${app_release}/public"
install -d -o aura-app -g aura-app -m 0750 "${app_release}/.next"
cp -a "${source_dir}/.next/static" "${app_release}/.next/static"
ln -s /opt/aura-board-app/shared/cache "${app_release}/.next/cache"
install -o aura-app -g aura-app -m 0750 \
  "${source_dir}/services/play-engine/target/release/play-server" \
  "${engine_release}/play-server"
chown -R aura-app:aura-app "${app_release}" "${engine_release}"

ln -s "${app_release}" /opt/aura-board-app/current.next
mv -Tf /opt/aura-board-app/current.next /opt/aura-board-app/current
ln -s "${engine_release}" /opt/aura-board-play-engine/current.next
mv -Tf /opt/aura-board-play-engine/current.next /opt/aura-board-play-engine/current

echo "release_ready=${release_id}"
