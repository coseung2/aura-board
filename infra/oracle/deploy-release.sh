#!/usr/bin/env bash
set -Eeuo pipefail

readonly source_dir=/opt/actions-runner-aura-board/_work/aura-board/aura-board
readonly app_root=/opt/aura-board-app
readonly engine_root=/opt/aura-board-play-engine
readonly build_script=/usr/local/libexec/aura-board/build-release.sh
readonly publish_script=/usr/local/libexec/aura-board/publish-ci-artifact.sh
readonly lock_file=/opt/aura-board-app/shared/locks/deploy.lock
readonly build_root=/opt/aura-board-app/shared/builds
readonly state_file=/opt/aura-board-app/shared/locks/deploy.pending

if [[ ${EUID} -ne 0 ]]; then
  echo "deploy-release must run as root" >&2
  exit 1
fi
if [[ $# -ne 0 ]]; then
  echo "deploy-release does not accept arguments" >&2
  exit 1
fi
if [[ ${SUDO_USER:-} != aura-deploy ]]; then
  echo "deploy-release is restricted to the aura-deploy runner user" >&2
  exit 1
fi
if [[ ! -x ${build_script} ]]; then
  echo "trusted build script is not installed: ${build_script}" >&2
  exit 1
fi

resolved_source=$(readlink -f "${source_dir}")
if [[ ${resolved_source} != "${source_dir}" || ! -d ${source_dir}/.git ]]; then
  echo "unexpected runner checkout path: ${resolved_source}" >&2
  exit 1
fi

release_id=$(git -C "${source_dir}" rev-parse --verify HEAD)
if [[ ! ${release_id} =~ ^[0-9a-f]{40}$ ]]; then
  echo "invalid Git revision: ${release_id}" >&2
  exit 1
fi
if [[ $(git -C "${source_dir}" status --porcelain) ]]; then
  echo "runner checkout is not clean" >&2
  exit 1
fi

install -d -o root -g root -m 0755 "$(dirname "${lock_file}")"
exec 9>"${lock_file}"
if ! flock -n 9; then
  echo "another production deployment is active" >&2
  exit 1
fi

restore_link() {
  local root=$1
  local target=$2
  rm -f -- "${root}/current.rollback"
  ln -s "${target}" "${root}/current.rollback"
  mv -Tf "${root}/current.rollback" "${root}/current"
}

switch_link() {
  local root=$1
  local target=$2
  rm -f -- "${root}/current.next"
  ln -s "${target}" "${root}/current.next"
  mv -Tf "${root}/current.next" "${root}/current"
}

wait_for_health() {
  local name=$1
  shift
  local attempt
  for attempt in {1..30}; do
    if curl --fail --silent --show-error --max-time 5 "$@" >/dev/null; then
      echo "health_ok=${name}"
      return 0
    fi
    sleep 2
  done
  echo "health check failed: ${name}" >&2
  return 1
}

verify_process_release() {
  local service=$1
  local kind=$2
  local expected=$3
  local pid actual
  pid=$(systemctl show --property MainPID --value "${service}")
  [[ ${pid} =~ ^[1-9][0-9]*$ ]]
  if [[ ${kind} == cwd ]]; then
    actual=$(readlink -f "/proc/${pid}/cwd")
  else
    actual=$(readlink -f "/proc/${pid}/exe")
  fi
  if [[ ${actual} != "${expected}" ]]; then
    echo "release process mismatch: ${service}: ${actual} != ${expected}" >&2
    return 1
  fi
  echo "release_process_ok=${service}"
}

verify_release() {
  local root=$1
  local release=$2
  local release_id=$3
  test "$(cat "${release}/.release-complete")" = "${release_id}"
  (cd "${release}" && sha256sum --check --status .release-sha256)
  [[ $(stat --format '%U:%G' "${release}") == root:root ]]
  if find -P "${release}" \( -type f -o -type d \) -perm /022 -print -quit | grep -q .; then
    echo "release contains a group/world-writable path: ${release}" >&2
    return 1
  fi
  [[ ${release} == "${root}/releases/${release_id}" ]]
}

rollback() {
  local observed=$?
  local exit_code=${1:-${observed}}
  trap - ERR INT TERM HUP
  set +e
  if [[ -n ${build_dir:-} && ${build_dir} == "${build_root}/"* ]]; then
    rm -rf -- "${build_dir}"
  fi
  echo "deployment failed; restoring previous releases" >&2
  rollback_failed=0
  restore_link "${app_root}" "${old_app}" || rollback_failed=1
  restore_link "${engine_root}" "${old_engine}" || rollback_failed=1
  [[ $(readlink -f "${app_root}/current") == "${old_app}" ]] || rollback_failed=1
  [[ $(readlink -f "${engine_root}/current") == "${old_engine}" ]] || rollback_failed=1
  systemctl restart aura-play-engine.service || rollback_failed=1
  systemctl restart aura-board-app.service || rollback_failed=1
  wait_for_health play-engine http://127.0.0.1:8081/health || rollback_failed=1
  wait_for_health next-app http://127.0.0.1:3000/api/health || rollback_failed=1
  verify_process_release aura-play-engine.service exe "${old_engine}/play-server" || rollback_failed=1
  verify_process_release aura-board-app.service cwd "${old_app}" || rollback_failed=1
  wait_for_health nginx -H 'Host: aura-board.com' http://127.0.0.1/api/health || rollback_failed=1
  if [[ ${rollback_failed} -eq 0 ]]; then
    rm -f -- "${state_file}"
    echo "rollback_complete=yes" >&2
    exit "${exit_code}"
  fi
  echo "rollback_failed=yes; operator intervention required; state=${state_file}" >&2
  exit 70
}

if [[ -s ${state_file} ]]; then
  mapfile -t pending < "${state_file}"
  if [[ ${#pending[@]} -ne 2 || ${pending[0]} != "${app_root}/releases/"* || ${pending[1]} != "${engine_root}/releases/"* ]]; then
    echo "invalid pending deployment state: ${state_file}" >&2
    exit 1
  fi
  echo "recovering interrupted deployment before starting a new one" >&2
  restore_link "${app_root}" "${pending[0]}"
  restore_link "${engine_root}" "${pending[1]}"
  systemctl restart aura-play-engine.service
  systemctl restart aura-board-app.service
  wait_for_health play-engine http://127.0.0.1:8081/health
  wait_for_health next-app http://127.0.0.1:3000/api/health
  verify_process_release aura-play-engine.service exe "${pending[1]}/play-server"
  verify_process_release aura-board-app.service cwd "${pending[0]}"
  wait_for_health nginx -H 'Host: aura-board.com' http://127.0.0.1/api/health
  rm -f -- "${state_file}"
fi

old_app=$(readlink -f "${app_root}/current")
old_engine=$(readlink -f "${engine_root}/current")
if [[ ${old_app} != "${app_root}/releases/"* || ${old_engine} != "${engine_root}/releases/"* ]]; then
  echo "current release links are missing or unsafe" >&2
  exit 1
fi

trap 'rollback $?' ERR
trap 'rollback 130' INT TERM HUP

app_release="${app_root}/releases/${release_id}"
engine_release="${engine_root}/releases/${release_id}"
build_dir=
if [[ -e ${app_release} && ! -e ${engine_release} ]] || [[ ! -e ${app_release} && -e ${engine_release} ]]; then
  if [[ $(readlink -f "${app_root}/current") == "${app_release}" || $(readlink -f "${engine_root}/current") == "${engine_release}" ]]; then
    echo "refusing to quarantine a partial release referenced by current" >&2
    exit 1
  fi
  quarantine_suffix="incomplete.$(date +%s%N)"
  [[ ! -e ${app_release} ]] || mv -T "${app_release}" "${app_release}.${quarantine_suffix}"
  [[ ! -e ${engine_release} ]] || mv -T "${engine_release}" "${engine_release}.${quarantine_suffix}"
  echo "partial_release_quarantined=${release_id}"
fi
if [[ -e ${app_release} || -e ${engine_release} ]]; then
  verify_release "${app_root}" "${app_release}" "${release_id}"
  verify_release "${engine_root}" "${engine_release}" "${release_id}"
  echo "release_reused=${release_id}"
else
  artifact_dir="${source_dir}/.deploy-artifact"
  if [[ -s ${artifact_dir}/oracle-release.tar.gz && -s ${artifact_dir}/oracle-release.tar.gz.sha256 ]]; then
    test -x "${publish_script}"
    "${publish_script}" "${source_dir}" "${artifact_dir}" "${release_id}"
  else
    install -d -o root -g root -m 0755 "${build_root}"
    build_dir=$(mktemp -d "${build_root}/${release_id}.XXXXXX")
    git -C "${source_dir}" archive "${release_id}" | tar -x -C "${build_dir}"
    chown -R aura-app:aura-app "${build_dir}"
    "${build_script}" "${build_dir}" "${release_id}"
    rm -rf -- "${build_dir}"
    build_dir=
  fi
fi

verify_release "${app_root}" "${app_release}" "${release_id}"
verify_release "${engine_root}" "${engine_release}" "${release_id}"
printf '%s\n%s\n' "${old_app}" "${old_engine}" > "${state_file}.next"
chmod 0600 "${state_file}.next"
mv -Tf "${state_file}.next" "${state_file}"
switch_link "${app_root}" "${app_release}"
switch_link "${engine_root}" "${engine_release}"

systemctl restart aura-play-engine.service
wait_for_health play-engine http://127.0.0.1:8081/health
verify_process_release aura-play-engine.service exe "${engine_release}/play-server"
systemctl restart aura-board-app.service
wait_for_health next-app http://127.0.0.1:3000/api/health
verify_process_release aura-board-app.service cwd "${app_release}"
wait_for_health nginx -H 'Host: aura-board.com' http://127.0.0.1/api/health

rm -f -- "${state_file}"
trap - ERR INT TERM HUP
echo "deployment_complete=${release_id}"
