#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "install-deploy-automation.sh must run as root" >&2
  exit 1
fi
if [[ $# -ne 1 ]]; then
  echo "usage: install-deploy-automation.sh <repository-root>" >&2
  exit 1
fi

repo_root=$(readlink -f "$1")
test -f "${repo_root}/infra/oracle/build-release.sh"
test -f "${repo_root}/infra/oracle/deploy-release.sh"
test -f "${repo_root}/infra/oracle/publish-ci-artifact.sh"
test -f "${repo_root}/infra/oracle/run-app-cron.sh"
test -f "${repo_root}/infra/oracle/aura-board-app.cron"
test -f "${repo_root}/infra/oracle/aura-board-deploy.sudoers"
id aura-deploy >/dev/null 2>&1
test -s /etc/aura-board/build.env
test "$(stat --format '%U:%G:%a' /etc/aura-board/build.env)" = "root:aura-app:640"

# Keep application-owned cron locks separate from root-owned deployment state.
# Sharing a writable directory would let aura-app replace predictable root
# lock/state paths with symlinks before the deploy helper opens them.
install -d -o aura-app -g aura-app -m 0750 /opt/aura-board-app/shared/cron-locks
install -d -o root -g root -m 0755 /opt/aura-board-app/bin
install -o root -g root -m 0755 \
  "${repo_root}/infra/oracle/run-app-cron.sh" \
  /opt/aura-board-app/bin/run-app-cron.sh
install -o root -g root -m 0644 \
  "${repo_root}/infra/oracle/aura-board-app.cron" \
  /etc/cron.d/aura-board-app

install -d -o root -g root -m 0755 /usr/local/libexec/aura-board
install -o root -g root -m 0755 \
  "${repo_root}/infra/oracle/build-release.sh" \
  /usr/local/libexec/aura-board/build-release.sh
install -o root -g root -m 0755 \
  "${repo_root}/infra/oracle/deploy-release.sh" \
  /usr/local/sbin/aura-board-deploy-release
install -o root -g root -m 0755 \
  "${repo_root}/infra/oracle/publish-ci-artifact.sh" \
  /usr/local/libexec/aura-board/publish-ci-artifact.sh

sudoers_temp=$(mktemp)
trap 'rm -f "${sudoers_temp}"' EXIT
install -o root -g root -m 0440 \
  "${repo_root}/infra/oracle/aura-board-deploy.sudoers" \
  "${sudoers_temp}"
visudo -cf "${sudoers_temp}"
install -o root -g root -m 0440 "${sudoers_temp}" /etc/sudoers.d/aura-board-deploy

echo "deploy_automation_installed=yes"
