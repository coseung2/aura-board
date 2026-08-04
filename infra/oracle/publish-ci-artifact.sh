#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "publish-ci-artifact.sh must run as root" >&2
  exit 1
fi
if [[ $# -ne 3 ]]; then
  echo "usage: publish-ci-artifact.sh <source-dir> <artifact-dir> <release-id>" >&2
  exit 1
fi

source_dir=$(readlink -f "$1")
artifact_dir=$(readlink -f "$2")
release_id=$3
app_root=/opt/aura-board-app
engine_root=/opt/aura-board-play-engine
app_release="${app_root}/releases/${release_id}"
engine_release="${engine_root}/releases/${release_id}"
app_staging="${app_release}.staging.$$"
engine_staging="${engine_release}.staging.$$"
extract_root="${app_root}/shared/artifacts/${release_id}.$$"

if [[ ! ${release_id} =~ ^[0-9a-f]{40}$ ]]; then
  echo "invalid release id: ${release_id}" >&2
  exit 1
fi
if [[ ${source_dir} != /opt/actions-runner-aura-board/_work/aura-board/aura-board ]]; then
  echo "unexpected source directory: ${source_dir}" >&2
  exit 1
fi
if [[ ${artifact_dir} != "${source_dir}/.deploy-artifact" ]]; then
  echo "unexpected artifact directory: ${artifact_dir}" >&2
  exit 1
fi

archive="${artifact_dir}/oracle-release.tar.gz"
checksum="${artifact_dir}/oracle-release.tar.gz.sha256"
test -d "${source_dir}/public"
test -s "${archive}"
test -s "${checksum}"
if [[ -e ${app_release} || -e ${engine_release} ]]; then
  echo "release already exists: ${release_id}" >&2
  exit 1
fi

cleanup() {
  rm -rf -- "${app_staging}" "${engine_staging}" "${extract_root}"
}
trap cleanup EXIT

(
  cd "${artifact_dir}"
  sha256sum --check --strict oracle-release.tar.gz.sha256
)
if tar -tzf "${archive}" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "artifact contains an unsafe path" >&2
  exit 1
fi

install -d -o aura-app -g aura-app -m 0750 "${extract_root}"
runuser -u aura-app -- tar -xzf "${archive}" -C "${extract_root}"
test "$(cat "${extract_root}/release-id")" = "${release_id}"
test -f "${extract_root}/app/server.js"
test -d "${extract_root}/app/.next/static"
test -x "${extract_root}/engine/play-server"

install -d -o root -g root -m 0755 "${app_staging}" "${engine_staging}"
cp -a "${extract_root}/app/." "${app_staging}/"
cp -a "${source_dir}/public" "${app_staging}/public"
rm -rf -- "${app_staging}/.next/cache"
ln -s /opt/aura-board-app/shared/cache "${app_staging}/.next/cache"
install -o root -g root -m 0755 \
  "${extract_root}/engine/play-server" \
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
rm -rf -- "${extract_root}"
echo "artifact_published=${release_id}"
