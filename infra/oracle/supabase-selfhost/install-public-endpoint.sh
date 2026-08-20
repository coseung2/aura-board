#!/usr/bin/env bash

set -Eeuo pipefail
umask 022

DOMAIN='supabase.aura-board.com'
SITE_NAME="$DOMAIN"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

NGINX_TEMPLATE="${NGINX_TEMPLATE:-$SCRIPT_DIR/nginx-supabase.conf.template}"
SITES_AVAILABLE="${SITES_AVAILABLE:-/etc/nginx/sites-available}"
SITES_ENABLED="${SITES_ENABLED:-/etc/nginx/sites-enabled}"
ACME_WEBROOT="${ACME_WEBROOT:-/var/www/certbot}"
CERT_DIR="${CERT_DIR:-/etc/letsencrypt/live/$DOMAIN}"
LETSENCRYPT_CONFIG_DIR="${LETSENCRYPT_CONFIG_DIR:-/etc/letsencrypt}"
CERTBOT_WORK_DIR="${CERTBOT_WORK_DIR:-/var/lib/letsencrypt}"
CERTBOT_LOG_DIR="${CERTBOT_LOG_DIR:-/var/log/letsencrypt}"

CURL_BIN="${CURL_BIN:-curl}"
CERTBOT_BIN="${CERTBOT_BIN:-certbot}"
NGINX_BIN="${NGINX_BIN:-nginx}"
SYSTEMCTL_BIN="${SYSTEMCTL_BIN:-systemctl}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
INSTALL_BIN="${INSTALL_BIN:-install}"
LN_BIN="${LN_BIN:-ln}"
READLINK_BIN="${READLINK_BIN:-readlink}"
MKTEMP_BIN="${MKTEMP_BIN:-mktemp}"
MV_BIN="${MV_BIN:-mv}"
RM_BIN="${RM_BIN:-rm}"
CP_BIN="${CP_BIN:-cp}"
STAT_BIN="${STAT_BIN:-stat}"

MODE=''
PRIVATE_IP_ARG=''
CONFIG_PATH="$SITES_AVAILABLE/$SITE_NAME"
ENABLED_PATH="$SITES_ENABLED/$SITE_NAME"

PRIOR_CONFIG=0
PRIOR_LINK=0
PRIOR_LINK_TARGET=''
BACKUP_PATH=''
HTTP_RENDERED=''
FINAL_RENDERED=''
CONFIG_MUTATED=0
LINK_MUTATED=0
ROLLBACK_NEEDED=0

usage() {
    cat <<'USAGE'
Usage: install-public-endpoint.sh (--dry-run | --write) [--private-ip RFC1918_IPV4]

The write flow temporarily installs an HTTP-only ACME server, reloads nginx,
requests the existing Certbot account to issue the certificate, then installs
the final TLS proxy. It never changes DNS.
USAGE
}

fail() {
    printf '[supabase-public-endpoint] FAIL: %s\n' "$1" >&2
    exit 1
}

log() {
    printf '[supabase-public-endpoint] %s\n' "$1"
}

while (($# > 0)); do
    case "$1" in
        --dry-run|--write)
            [[ -z "$MODE" ]] || fail 'choose exactly one of --dry-run or --write'
            MODE="${1#--}"
            shift
            ;;
        --private-ip)
            (($# >= 2)) || fail '--private-ip requires a value'
            PRIVATE_IP_ARG="$2"
            shift 2
            ;;
        --private-ip=*)
            PRIVATE_IP_ARG="${1#*=}"
            shift
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            fail 'invalid command-line arguments'
            ;;
    esac
done

[[ -n "$MODE" ]] || { usage >&2; exit 2; }

require_command() {
    local command_name="$1"
    command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is required"
}

for command_name in \
    "$CURL_BIN" "$CERTBOT_BIN" "$NGINX_BIN" "$SYSTEMCTL_BIN" "$PYTHON_BIN" \
    "$INSTALL_BIN" "$LN_BIN" "$READLINK_BIN" "$MKTEMP_BIN" "$MV_BIN" \
    "$RM_BIN" "$CP_BIN" "$STAT_BIN" sed grep; do
    require_command "$command_name"
done

[[ -f "$NGINX_TEMPLATE" && ! -L "$NGINX_TEMPLATE" ]] || fail 'nginx template is not a regular non-symlink file'
[[ -r "$NGINX_TEMPLATE" ]] || fail 'nginx template is not readable'
[[ -d "$SITES_AVAILABLE" && ! -L "$SITES_AVAILABLE" ]] || fail 'nginx sites-available directory is invalid'
[[ -d "$SITES_ENABLED" && ! -L "$SITES_ENABLED" ]] || fail 'nginx sites-enabled directory is invalid'

is_rfc1918_ipv4() {
    local ip="$1"
    local first second third fourth extra octet

    [[ "$ip" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || return 1
    IFS='.' read -r first second third fourth extra <<<"$ip"
    [[ -z "${extra:-}" ]] || return 1
    for octet in "$first" "$second" "$third" "$fourth"; do
        if ((10#$octet > 255)); then
            return 1
        fi
    done

    if ((10#$first == 10)); then
        return 0
    fi
    if ((10#$first == 172 && 10#$second >= 16 && 10#$second <= 31)); then
        return 0
    fi
    if ((10#$first == 192 && 10#$second == 168)); then
        return 0
    fi
    return 1
}

discover_private_ip() {
    local metadata private_ip
    metadata="$("$CURL_BIN" --fail --silent --show-error --noproxy '*' \
        --connect-timeout 2 --max-time 5 \
        --header 'Authorization: Bearer Oracle' \
        'http://169.254.169.254/opc/v2/vnics/' 2>/dev/null)" \
        || fail 'OCI IMDS request failed'

    private_ip="$(printf '%s' "$metadata" | "$PYTHON_BIN" -c '
import json
import sys

try:
    items = json.load(sys.stdin)
    if not isinstance(items, list) or not items:
        raise ValueError
    primary = sorted(items, key=lambda item: int(item.get("nicIndex", 0)))[0]
    value = primary.get("privateIp")
    if not isinstance(value, str) or not value:
        raise ValueError
except (ValueError, TypeError, KeyError, json.JSONDecodeError):
    raise SystemExit(1)
print(value)
' 2>/dev/null)" || fail 'OCI IMDS did not return a primary private IPv4'
    printf '%s' "$private_ip"
}

if [[ -n "$PRIVATE_IP_ARG" ]]; then
    PRIVATE_IP="$PRIVATE_IP_ARG"
else
    PRIVATE_IP="$(discover_private_ip)"
fi
is_rfc1918_ipv4 "$PRIVATE_IP" || fail 'private IP must be an RFC1918 IPv4 address'

gateway_status="$("$CURL_BIN" --silent --show-error --noproxy '*' \
    --connect-timeout 2 --max-time 5 --output /dev/null \
    --write-out '%{http_code}' 'http://127.0.0.1:18000/rest/v1/' 2>/dev/null)" \
    || fail 'loopback Supabase gateway is unavailable'
[[ "$gateway_status" =~ ^[23][0-9][0-9]$ || "$gateway_status" == '401' ]] \
    || fail 'loopback Supabase gateway returned an unexpected status'

rendered_final="$(sed "s/__PRIVATE_IP__/$PRIVATE_IP/g" "$NGINX_TEMPLATE")" \
    || fail 'could not render nginx template'
[[ "$rendered_final" != *'__PRIVATE_IP__'* ]] || fail 'nginx template contains an unresolved placeholder'
[[ "$rendered_final" == *"listen $PRIVATE_IP:443 ssl;"* ]] \
    || fail 'rendered nginx template does not bind the requested private IP'

if [[ -L "$CONFIG_PATH" ]]; then
    fail 'refusing symlink at nginx sites-available target'
fi
if [[ -e "$CONFIG_PATH" && ! -f "$CONFIG_PATH" ]]; then
    fail 'nginx sites-available target is not a regular file'
fi

if [[ -L "$ENABLED_PATH" ]]; then
    resolved_enabled="$($READLINK_BIN -f -- "$ENABLED_PATH" 2>/dev/null || true)"
    resolved_config="$($READLINK_BIN -f -- "$CONFIG_PATH" 2>/dev/null || true)"
    [[ -n "$resolved_enabled" && "$resolved_enabled" == "$resolved_config" ]] \
        || fail 'refusing unexpected nginx sites-enabled symlink target'
    PRIOR_LINK=1
    PRIOR_LINK_TARGET="$($READLINK_BIN -- "$ENABLED_PATH")" \
        || fail 'could not read existing nginx sites-enabled symlink'
elif [[ -e "$ENABLED_PATH" ]]; then
    fail 'refusing non-symlink nginx sites-enabled target'
fi

if [[ "$MODE" == 'dry-run' ]]; then
    log 'dry-run: validated template, private address, nginx paths, and loopback gateway; no mutation or certbot call'
    exit 0
fi

[[ "$(id -u)" -eq 0 ]] || fail 'write mode must run as root'

if [[ -e "$ACME_WEBROOT" || -L "$ACME_WEBROOT" ]]; then
    [[ -d "$ACME_WEBROOT" && ! -L "$ACME_WEBROOT" ]] || fail 'ACME webroot is not a directory'
else
    "$INSTALL_BIN" -d -o root -g root -m 0755 "$ACME_WEBROOT"
fi

if [[ -e "$CONFIG_PATH" ]]; then
    BACKUP_PATH="$($MKTEMP_BIN "$SITES_AVAILABLE/.${SITE_NAME}.rollback.XXXXXX")" \
        || fail 'could not create nginx rollback copy'
    "$CP_BIN" -p "$CONFIG_PATH" "$BACKUP_PATH" \
        || fail 'could not save the previous nginx configuration'
    PRIOR_CONFIG=1
fi

cleanup_temporary_files() {
    [[ -z "$HTTP_RENDERED" ]] || "$RM_BIN" -f -- "$HTTP_RENDERED" 2>/dev/null || true
    [[ -z "$FINAL_RENDERED" ]] || "$RM_BIN" -f -- "$FINAL_RENDERED" 2>/dev/null || true
    [[ -z "$BACKUP_PATH" ]] || "$RM_BIN" -f -- "$BACKUP_PATH" 2>/dev/null || true
}

rollback() {
    set +e
    log 'attempting nginx configuration rollback'

    if ((CONFIG_MUTATED)); then
        if ((PRIOR_CONFIG)); then
            "$INSTALL_BIN" -o root -g root -m 0644 "$BACKUP_PATH" "$CONFIG_PATH" >/dev/null 2>&1
        else
            "$RM_BIN" -f -- "$CONFIG_PATH" >/dev/null 2>&1
        fi
    fi

    if ((LINK_MUTATED)); then
        "$RM_BIN" -f -- "$ENABLED_PATH" >/dev/null 2>&1
        if ((PRIOR_LINK)); then
            "$LN_BIN" -s -- "$PRIOR_LINK_TARGET" "$ENABLED_PATH" >/dev/null 2>&1
        fi
    fi

    "$NGINX_BIN" -t >/dev/null 2>&1
    "$SYSTEMCTL_BIN" reload nginx >/dev/null 2>&1
    set -e
}

on_exit() {
    local exit_code=$?
    trap - EXIT
    if ((ROLLBACK_NEEDED)); then
        rollback || true
    fi
    cleanup_temporary_files
    exit "$exit_code"
}

trap on_exit EXIT
ROLLBACK_NEEDED=1

render_http_config() {
    local output_path="$1"
    cat >"$output_path" <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name supabase.aura-board.com;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
        try_files $uri =404;
        default_type text/plain;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}
NGINX
}

install_config_atomically() {
    local source_path="$1"
    local installed_path
    [[ ! -L "$CONFIG_PATH" ]] || fail 'nginx configuration became a symlink during installation'
    installed_path="$($MKTEMP_BIN "$SITES_AVAILABLE/.${SITE_NAME}.install.XXXXXX")" \
        || fail 'could not create temporary nginx configuration'
    "$INSTALL_BIN" -o root -g root -m 0644 "$source_path" "$installed_path" \
        || fail 'could not install temporary nginx configuration'
    "$MV_BIN" -f -- "$installed_path" "$CONFIG_PATH" \
        || fail 'could not activate nginx configuration'
    CONFIG_MUTATED=1
}

ensure_enabled_symlink() {
    if [[ -L "$ENABLED_PATH" ]]; then
        "$RM_BIN" -f -- "$ENABLED_PATH"
        LINK_MUTATED=1
    elif [[ -e "$ENABLED_PATH" ]]; then
        fail 'nginx sites-enabled target changed to a non-symlink'
    fi
    "$LN_BIN" -s -- "$CONFIG_PATH" "$ENABLED_PATH" \
        || fail 'could not create nginx sites-enabled symlink'
    LINK_MUTATED=1
}

nginx_test() {
    "$NGINX_BIN" -t >/dev/null 2>&1 || fail 'nginx configuration test failed'
}

reload_nginx() {
    "$SYSTEMCTL_BIN" reload nginx >/dev/null 2>&1 || fail 'nginx reload failed'
}

HTTP_RENDERED="$($MKTEMP_BIN)" || fail 'could not create temporary HTTP-only configuration'
render_http_config "$HTTP_RENDERED"
log 'installing temporary HTTP-only nginx configuration'
install_config_atomically "$HTTP_RENDERED"
ensure_enabled_symlink
nginx_test
reload_nginx

log 'requesting the existing Certbot account for the certificate'
"$CERTBOT_BIN" certonly --webroot --webroot-path "$ACME_WEBROOT" \
    --cert-name "$DOMAIN" --domain "$DOMAIN" \
    --config-dir "$LETSENCRYPT_CONFIG_DIR" \
    --work-dir "$CERTBOT_WORK_DIR" --logs-dir "$CERTBOT_LOG_DIR" \
    --non-interactive --agree-tos --keep-until-expiring --no-eff-email \
    --preferred-challenges http >/dev/null 2>&1 \
    || fail 'Certbot certificate issuance failed'

[[ -r "$CERT_DIR/fullchain.pem" && -r "$CERT_DIR/privkey.pem" ]] \
    || fail 'Certbot did not produce the expected certificate files'

FINAL_RENDERED="$($MKTEMP_BIN)" || fail 'could not create temporary final configuration'
printf '%s\n' "$rendered_final" >"$FINAL_RENDERED"
log 'installing final TLS nginx configuration'
install_config_atomically "$FINAL_RENDERED"
ensure_enabled_symlink
owner="$($STAT_BIN -c '%u' "$CONFIG_PATH" 2>/dev/null || true)"
mode="$($STAT_BIN -c '%a' "$CONFIG_PATH" 2>/dev/null || true)"
[[ "$owner" == '0' && "$mode" == '644' ]] || fail 'installed nginx configuration is not root-owned mode 0644'
nginx_test
reload_nginx

ROLLBACK_NEEDED=0
log 'public Supabase endpoint installed; DNS was not changed'
