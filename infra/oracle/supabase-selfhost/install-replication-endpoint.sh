#!/usr/bin/env bash
set -Eeuo pipefail
umask 022
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DOMAIN="${DOMAIN:-replication.129-225-159-251.sslip.io}"
PRIVATE_IP_ENV="${PRIVATE_IP:-}"
REPLICATION_ROLE="${REPLICATION_ROLE:-aura_board_dr_replication}"
REPLICATION_GATEWAY="${REPLICATION_GATEWAY:-172.18.0.1}"
REPLICATION_MAX_CONNECTIONS="${REPLICATION_MAX_CONNECTIONS:-3}"
SUPABASE_ROOT="${SUPABASE_ROOT:-/srv/aura-board/supabase}"
DB_CONFIG_ROOT="${DB_CONFIG_ROOT:-/srv/aura-board/docker/volumes/supabase_db-config/_data}"
LISTEN_PORT="${REPLICATION_LISTEN_PORT:-5432}"
DB_PORT="${REPLICATION_DB_PORT:-15433}"
NGINX_TEMPLATE="${NGINX_TEMPLATE:-$SCRIPT_DIR/nginx-replication.conf.template}"
HBA_TEMPLATE="${HBA_TEMPLATE:-$SCRIPT_DIR/pg-hba-replication.conf.template}"
COMPOSE_TEMPLATE="${COMPOSE_TEMPLATE:-$SCRIPT_DIR/docker-compose.replication.yml.template}"
COMPOSE_BASE_PATH="${COMPOSE_BASE_PATH:-$SUPABASE_ROOT/docker-compose.yml}"
COMPOSE_OVERRIDE_PATH="${COMPOSE_OVERRIDE_PATH:-$SUPABASE_ROOT/docker-compose.replication.yml}"
HBA_PATH="${HBA_PATH:-$DB_CONFIG_ROOT/pg_hba-replication.conf}"
HBA_CONTAINER_PATH="${HBA_CONTAINER_PATH:-/etc/postgresql-custom/pg_hba-replication.conf}"
POSTGRES_OVERRIDE_PATH="${POSTGRES_OVERRIDE_PATH:-$DB_CONFIG_ROOT/conf.d/replication-endpoint.conf}"
NGINX_STREAM_DIR="${NGINX_STREAM_DIR:-/etc/nginx/stream.d}"
NGINX_STREAM_PATH="${NGINX_STREAM_PATH:-$NGINX_STREAM_DIR/aura-board-replication.conf}"
NGINX_STREAM_BOOTSTRAP_PATH="${NGINX_STREAM_BOOTSTRAP_PATH:-/etc/nginx/modules-enabled/60-aura-board-replication-stream.conf}"
NGINX_MAIN_PATH="${NGINX_MAIN_PATH:-/etc/nginx/nginx.conf}"
LEGACY_NGINX_STREAM_INCLUDE="${LEGACY_NGINX_STREAM_INCLUDE:-include /etc/nginx/aura-board-replication-stream.conf;}"
NGINX_ACME_CONFIG_PATH="${NGINX_ACME_CONFIG_PATH:-/etc/nginx/sites-available/aura-board-replication-acme.conf}"
NGINX_ACME_LINK_PATH="${NGINX_ACME_LINK_PATH:-/etc/nginx/sites-enabled/aura-board-replication-acme.conf}"
NGINX_STREAM_MODULE_PATH="${NGINX_STREAM_MODULE_PATH:-/usr/lib/nginx/modules/ngx_stream_module.so}"
ACME_WEBROOT="${ACME_WEBROOT:-/var/www/certbot}"
CERT_DIR="${CERT_DIR:-}"
LETSENCRYPT_CONFIG_DIR="${LETSENCRYPT_CONFIG_DIR:-/etc/letsencrypt}"
CERTBOT_WORK_DIR="${CERTBOT_WORK_DIR:-/var/lib/letsencrypt}"
CERTBOT_LOG_DIR="${CERTBOT_LOG_DIR:-/var/log/letsencrypt}"
RENEWAL_HOOK_PATH="${RENEWAL_HOOK_PATH:-$LETSENCRYPT_CONFIG_DIR/renewal-hooks/deploy/aura-board-replication-nginx.sh}"
FIREWALL_RULES_PATH="${FIREWALL_RULES_PATH:-/etc/iptables/rules.v4}"
APP_HEALTH_URL="${APP_HEALTH_URL:-http://127.0.0.1:3000/api/health}"
ROLLBACK_STATE_DIR="${ROLLBACK_STATE_DIR:-/var/lib/aura-board/replication-endpoint}"
ROLLBACK_CURRENT_PATH="${ROLLBACK_CURRENT_PATH:-$ROLLBACK_STATE_DIR/current}"
ROLLBACK_PENDING_PATH="${ROLLBACK_PENDING_PATH:-$ROLLBACK_STATE_DIR/pending}"
ROLLBACK_IN_PROGRESS_PATH="${ROLLBACK_IN_PROGRESS_PATH:-$ROLLBACK_STATE_DIR/in-progress}"
CURL_BIN="${CURL_BIN:-curl}"
CERTBOT_BIN="${CERTBOT_BIN:-certbot}"
NGINX_BIN="${NGINX_BIN:-nginx}"
SYSTEMCTL_BIN="${SYSTEMCTL_BIN:-systemctl}"
DOCKER_BIN="${DOCKER_BIN:-docker}"
IPTABLES_BIN="${IPTABLES_BIN:-iptables}"
IPTABLES_SAVE_BIN="${IPTABLES_SAVE_BIN:-iptables-save}"
SS_BIN="${SS_BIN:-ss}"
GETENT_BIN="${GETENT_BIN:-getent}"
UNAME_BIN="${UNAME_BIN:-uname}"
INSTALL_BIN="${INSTALL_BIN:-install}"
MKTEMP_BIN="${MKTEMP_BIN:-mktemp}"
MV_BIN="${MV_BIN:-mv}"
RM_BIN="${RM_BIN:-rm}"
CP_BIN="${CP_BIN:-cp}"
LN_BIN="${LN_BIN:-ln}"
READLINK_BIN="${READLINK_BIN:-readlink}"
AWK_BIN="${AWK_BIN:-awk}"
STAT_BIN="${STAT_BIN:-stat}"
SHA256_BIN="${SHA256_BIN:-sha256sum}"
MODE='dry-run'
MODE_EXPLICIT=0
DOMAIN_ARG_SET=0
PRIVATE_IP_ARG=''
PRIVATE_IP_ARG_SET=0
RUN_DIR=''
ACME_PROBE_PATH=''
ROLLBACK_NEEDED=0
ROLLBACK_STATE_COMMITTED=0
PENDING_PUBLISHED=0
TERMINATED=0
ACTIVE_STATE_DIR=''
ACTIVE_STATE_REUSABLE=0
ROLLBACK_IN_PROGRESS=0
COMPOSE_RECREATED=0
FIREWALL_INSERTED=0
FIREWALL_PREEXISTING=0
FIREWALL_PERSISTED_MUTATED=0
NGINX_MUTATED=0
RESOURCE_KEYS=(override hba postgres-override stream stream-bootstrap nginx-main acme hook firewall acme-link)
declare -A MANIFEST_STATE=() MANIFEST_VALUE=() MANIFEST_META=()
usage() {
    cat <<'USAGE'
Usage: install-replication-endpoint.sh [--dry-run|--write|--rollback] --domain FQDN --private-ip RFC1918_IPV4
Dry-run is the default. Write mode installs the direct loopback database compose
override, persistent HBA, ACME-only HTTP server, TLS PostgreSQL stream proxy,
renewal hook, and private-NIC-scoped host TCP/5432 firewall rule. Rollback mode
restores the last successful install snapshot and never handles the role secret.
Neither mode changes OCI NSGs or DNS.
USAGE
}
fail() { printf '[supabase-replication-endpoint] FAIL: %s\n' "$1" >&2; exit 1; }
log() { printf '[supabase-replication-endpoint] %s\n' "$1"; }
while (($# > 0)); do
    case "$1" in
        --dry-run)
            ((MODE_EXPLICIT == 0)) || fail 'choose exactly one of --dry-run or --write'
            MODE='dry-run'
            MODE_EXPLICIT=1
            shift
            ;;
        --write)
            ((MODE_EXPLICIT == 0)) || fail 'choose exactly one of --dry-run or --write'
            MODE='write'
            MODE_EXPLICIT=1
            shift
            ;;
        --rollback)
            ((MODE_EXPLICIT == 0)) || fail 'choose exactly one of --dry-run, --write, or --rollback'
            MODE='rollback'
            MODE_EXPLICIT=1
            shift
            ;;
        --domain)
            (($# >= 2)) || fail '--domain requires a value'
            DOMAIN="$2"
            DOMAIN_ARG_SET=1
            shift 2
            ;;
        --domain=*)
            DOMAIN="${1#*=}"
            DOMAIN_ARG_SET=1
            shift
            ;;
        --private-ip)
            (($# >= 2)) || fail '--private-ip requires a value'
            PRIVATE_IP_ARG="$2"
            PRIVATE_IP_ARG_SET=1
            shift 2
            ;;
        --private-ip=*)
            PRIVATE_IP_ARG="${1#*=}"
            PRIVATE_IP_ARG_SET=1
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
if [[ -n "$PRIVATE_IP_ARG" ]]; then
    PRIVATE_IP="$PRIVATE_IP_ARG"
else
    PRIVATE_IP="$PRIVATE_IP_ENV"
fi
[[ -n "$CERT_DIR" ]] || CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
has_control_chars() { LC_ALL=C printf '%s' "$1" | grep -q '[[:cntrl:]]'; }
validate_text() { local label="$1" value="$2"; [[ -n "$value" ]] || fail "$label must not be empty"; if has_control_chars "$value"; then fail "$label contains control characters"; fi; }
validate_path_string() {
    local label="$1"
    local path="$2"
    validate_text "$label" "$path"
    [[ "$path" == /* ]] || fail "$label must be an absolute path"
    local current='/'
    local component
    local -a components
    IFS='/' read -r -a components <<<"${path#/}"
    for component in "${components[@]}"; do
        [[ -z "$component" ]] && continue
        [[ "$component" != '.' && "$component" != '..' ]] || fail "$label contains a traversal component"
        current="${current%/}/$component"
        [[ ! -L "$current" ]] || fail "$label contains a symlink component"
    done
}
validate_regular_target() { local label="$1" path="$2"; validate_path_string "$label" "$path"; [[ ! -L "$path" ]] || fail "$label is a symlink"; [[ ! -e "$path" || -f "$path" ]] || fail "$label is not a regular file"; }
validate_directory() { local label="$1" path="$2"; validate_path_string "$label" "$path"; [[ -d "$path" && ! -L "$path" ]] || fail "$label is not a regular directory"; }
resource_target() { case "$1" in override) printf '%s' "$COMPOSE_OVERRIDE_PATH";; hba) printf '%s' "$HBA_PATH";; postgres-override) printf '%s' "$POSTGRES_OVERRIDE_PATH";; stream) printf '%s' "$NGINX_STREAM_PATH";; stream-bootstrap) printf '%s' "$NGINX_STREAM_BOOTSTRAP_PATH";; nginx-main) printf '%s' "$NGINX_MAIN_PATH";; acme) printf '%s' "$NGINX_ACME_CONFIG_PATH";; hook) printf '%s' "$RENEWAL_HOOK_PATH";; firewall) printf '%s' "$FIREWALL_RULES_PATH";; acme-link) printf '%s' "$NGINX_ACME_LINK_PATH";; *) return 1;; esac; }
validate_root_owned() { local label="$1" path="$2" expected_mode="${3-}" owner group mode; expected_mode="${expected_mode#0}"; IFS=: read -r owner group mode < <("$STAT_BIN" -c '%u:%g:%a' -- "$path" 2>/dev/null) || fail "could not inspect ownership of $label"; [[ "$owner" == 0 && "$group" == 0 ]] || fail "$label must be owned by root:root"; [[ -z "$expected_mode" || "$mode" == "$expected_mode" ]] || fail "$label must have mode $expected_mode"; }
validate_root_owned_file() { validate_regular_target "$1" "$2"; validate_root_owned "$@"; }
prepare_rollback_state_dir() { validate_path_string 'rollback state directory' "$ROLLBACK_STATE_DIR"; [[ "$ROLLBACK_CURRENT_PATH" == "$ROLLBACK_STATE_DIR/current" && "$ROLLBACK_PENDING_PATH" == "$ROLLBACK_STATE_DIR/pending" && "$ROLLBACK_IN_PROGRESS_PATH" == "$ROLLBACK_STATE_DIR/in-progress" ]] || fail 'rollback state pointers must stay inside the rollback state directory'; if [[ ! -e "$ROLLBACK_STATE_DIR" ]]; then (( ${1:-0} )) || fail 'rollback state directory does not exist'; "$INSTALL_BIN" -d -o root -g root -m 0700 "$ROLLBACK_STATE_DIR" || fail 'could not create the rollback state directory'; fi; [[ -d "$ROLLBACK_STATE_DIR" && ! -L "$ROLLBACK_STATE_DIR" ]] || fail 'rollback state path is not a regular directory'; validate_root_owned 'rollback state directory' "$ROLLBACK_STATE_DIR" 700; }
managed_mode() { [[ "$1" == hook ]] && printf 755 || printf 644; }
validate_managed_target_metadata() { local key target owner group mode; for key in "${RESOURCE_KEYS[@]}"; do [[ "$key" == acme-link ]] && continue; target="$(resource_target "$key")"; [[ ! -e "$target" && ! -L "$target" ]] && continue; [[ -f "$target" && ! -L "$target" ]] || fail "$key target must be a root:root regular file with mode $(managed_mode "$key")"; IFS=: read -r owner group mode < <("$STAT_BIN" -c '%u:%g:%a' -- "$target" 2>/dev/null) || fail "could not inspect $key target metadata"; [[ "$owner" == 0 && "$group" == 0 && "$mode" == "$(managed_mode "$key")" ]] || fail "$key target must be a root:root regular file with mode $(managed_mode "$key")"; done; }
refuse_pending_write() { [[ -e "$ROLLBACK_STATE_DIR" || -L "$ROLLBACK_STATE_DIR" ]] || return 0; prepare_rollback_state_dir 0; if [[ -e "$ROLLBACK_PENDING_PATH" || -L "$ROLLBACK_PENDING_PATH" ]]; then validate_root_owned_file 'pending rollback pointer' "$ROLLBACK_PENDING_PATH" 600; fail "unresolved pending rollback exists at $ROLLBACK_PENDING_PATH"; fi; }
load_pending() { local key value extra; PENDING_TRANSACTION=''; PENDING_DOMAIN=''; PENDING_PRIVATE_IP=''; PENDING_FIREWALL_PREEXISTING=''; [[ -e "$ROLLBACK_PENDING_PATH" || -L "$ROLLBACK_PENDING_PATH" ]] || return 1; validate_root_owned_file 'pending rollback pointer' "$ROLLBACK_PENDING_PATH" 600; while IFS=$'\t' read -r key value extra; do [[ -n "$key" && -n "$value" && -z "$extra" ]] || fail 'pending rollback metadata is malformed'; case "$key" in transaction) [[ -z "$PENDING_TRANSACTION" ]] || fail 'pending rollback metadata is duplicated'; PENDING_TRANSACTION="$value";; domain) [[ -z "$PENDING_DOMAIN" ]] || fail 'pending rollback metadata is duplicated'; PENDING_DOMAIN="$value";; private-ip) [[ -z "$PENDING_PRIVATE_IP" ]] || fail 'pending rollback metadata is duplicated'; PENDING_PRIVATE_IP="$value";; firewall-preexisting) [[ -z "$PENDING_FIREWALL_PREEXISTING" ]] || fail 'pending rollback metadata is duplicated'; PENDING_FIREWALL_PREEXISTING="$value";; *) fail 'pending rollback metadata has an unknown key';; esac; done <"$ROLLBACK_PENDING_PATH"; [[ "$PENDING_TRANSACTION" =~ ^transaction\.[A-Za-z0-9]+$ ]] || fail 'pending rollback transaction name is invalid'; is_valid_domain "$PENDING_DOMAIN" || fail 'pending rollback domain is invalid'; is_rfc1918_ipv4 "$PENDING_PRIVATE_IP" || fail 'pending rollback private IP is invalid'; [[ "$PENDING_FIREWALL_PREEXISTING" == 0 || "$PENDING_FIREWALL_PREEXISTING" == 1 ]] || fail 'pending rollback firewall state is invalid'; PENDING_STATE_DIR="$ROLLBACK_STATE_DIR/$PENDING_TRANSACTION"; validate_path_string 'pending rollback transaction directory' "$PENDING_STATE_DIR"; [[ -d "$PENDING_STATE_DIR" && ! -L "$PENDING_STATE_DIR" ]] || fail 'pending rollback transaction directory does not exist'; validate_root_owned 'pending rollback transaction directory' "$PENDING_STATE_DIR" 700; validate_snapshot_for_restore "$PENDING_STATE_DIR"; }
file_sha256() { "$SHA256_BIN" -- "$1" | "$AWK_BIN" '{print $1}'; }
load_manifest() { local manifest_path="$1" kind key target state value extra expected_kind; validate_root_owned_file 'rollback manifest' "$manifest_path" 600; MANIFEST_STATE=(); MANIFEST_VALUE=(); MANIFEST_META=(); while IFS=$'\t' read -r kind key target state value extra; do [[ -n "$kind" ]] || fail 'rollback manifest contains an empty record'; if [[ "$kind" == meta ]]; then [[ -n "$key" && -n "$target" && -z "$state" && -z "$value" && -z "$extra" ]] || fail 'rollback manifest metadata is malformed'; [[ -z "${MANIFEST_META[$key]+x}" ]] || fail 'rollback manifest contains duplicate metadata'; MANIFEST_META[$key]="$target"; continue; fi; [[ "$kind" == file || "$kind" == link ]] || fail 'rollback manifest contains an unknown record type'; [[ -z "$extra" && -n "$key" && -n "$target" && -n "$state" ]] || fail 'rollback manifest resource record is malformed'; case "$key" in acme-link) expected_kind=link;; override|hba|postgres-override|stream|stream-bootstrap|nginx-main|acme|hook|firewall) expected_kind=file;; *) fail 'rollback manifest contains an unknown resource key';; esac; [[ "$kind" == "$expected_kind" ]] || fail "rollback manifest type does not match $key"; validate_path_string 'rollback manifest target' "$target"; [[ "$target" == "$(resource_target "$key")" ]] || fail "rollback manifest target does not match configured $key path"; if [[ "$expected_kind" == file ]]; then [[ "$state" == sha256 || "$state" == absent ]] || fail 'rollback manifest file state is invalid'; if [[ "$state" == sha256 ]]; then [[ "$value" =~ ^[[:xdigit:]]{64}$ ]] || fail 'rollback manifest file digest is invalid'; else [[ -z "$value" ]] || fail 'rollback manifest absent file has an unexpected value'; fi; else [[ "$state" == symlink || "$state" == absent ]] || fail 'rollback manifest link state is invalid'; if [[ "$state" == symlink ]]; then validate_text 'rollback manifest link target' "$value"; else [[ -z "$value" ]] || fail 'rollback manifest absent link has an unexpected value'; fi; fi; [[ -z "${MANIFEST_STATE[$key]+x}" ]] || fail 'rollback manifest contains a duplicate resource key'; MANIFEST_STATE[$key]="$state"; MANIFEST_VALUE[$key]="$value"; done <"$manifest_path"; [[ "${MANIFEST_META[version]:-}" == 1 ]] || fail 'rollback manifest version is unsupported'; is_valid_domain "${MANIFEST_META[domain]:-}" || fail 'rollback manifest domain is invalid'; is_rfc1918_ipv4 "${MANIFEST_META[private-ip]:-}" || fail 'rollback manifest private IP is invalid'; [[ "${MANIFEST_META[firewall-inserted]:-}" == 0 || "${MANIFEST_META[firewall-inserted]:-}" == 1 ]] || fail 'rollback manifest firewall state is invalid'; for key in "${RESOURCE_KEYS[@]}"; do [[ -n "${MANIFEST_STATE[$key]+x}" ]] || fail "rollback manifest is missing $key"; done; }
manifest_matches_current() { local key target current_hash; for key in "${RESOURCE_KEYS[@]}"; do target="$(resource_target "$key")"; if [[ "${MANIFEST_STATE[$key]}" == absent ]]; then [[ ! -e "$target" && ! -L "$target" ]] || return 1; elif [[ "$key" == acme-link ]]; then [[ -L "$target" && "$("$READLINK_BIN" -- "$target")" == "${MANIFEST_VALUE[$key]}" ]] || return 1; else [[ -f "$target" && ! -L "$target" ]] || return 1; current_hash="$(file_sha256 "$target")" || return 1; [[ "$current_hash" == "${MANIFEST_VALUE[$key]}" ]] || return 1; fi; done; }
load_current_state() { local state_name; ACTIVE_STATE_DIR=''; ACTIVE_STATE_REUSABLE=0; ROLLBACK_IN_PROGRESS=0; if [[ -e "$ROLLBACK_IN_PROGRESS_PATH" || -L "$ROLLBACK_IN_PROGRESS_PATH" ]]; then validate_root_owned_file 'rollback progress marker' "$ROLLBACK_IN_PROGRESS_PATH" 600; ROLLBACK_IN_PROGRESS=1; fi; [[ ! -L "$ROLLBACK_CURRENT_PATH" ]] || fail 'rollback current pointer must not be a symlink'; if [[ -e "$ROLLBACK_CURRENT_PATH" ]]; then validate_root_owned_file 'rollback current pointer' "$ROLLBACK_CURRENT_PATH" 600; state_name="$(<"$ROLLBACK_CURRENT_PATH")"; [[ "$state_name" =~ ^transaction\.[A-Za-z0-9]+$ ]] || fail 'rollback current pointer contains an invalid transaction name'; ACTIVE_STATE_DIR="$ROLLBACK_STATE_DIR/$state_name"; validate_path_string 'rollback transaction directory' "$ACTIVE_STATE_DIR"; [[ -d "$ACTIVE_STATE_DIR" && ! -L "$ACTIVE_STATE_DIR" ]] || fail 'rollback transaction directory does not exist'; validate_root_owned 'rollback transaction directory' "$ACTIVE_STATE_DIR" 700; load_manifest "$ACTIVE_STATE_DIR/manifest"; if ((ROLLBACK_IN_PROGRESS)); then [[ "$(<"$ROLLBACK_IN_PROGRESS_PATH")" == "$state_name" ]] || fail 'rollback progress marker does not match the current state'; fi; if [[ "${MANIFEST_META[domain]}" == "$DOMAIN" && "${MANIFEST_META[private-ip]}" == "$PRIVATE_IP" ]] && { ((ROLLBACK_IN_PROGRESS)) || manifest_matches_current; }; then ACTIVE_STATE_REUSABLE=1; fi; elif ((ROLLBACK_IN_PROGRESS)); then fail 'rollback progress marker has no current state'; fi; }
validate_snapshot_for_restore() { local snapshot_dir="$1" key marker backup_path; validate_path_string 'rollback snapshot directory' "$snapshot_dir"; [[ -d "$snapshot_dir" && ! -L "$snapshot_dir" ]] || fail 'rollback snapshot directory does not exist'; validate_root_owned 'rollback snapshot directory' "$snapshot_dir" 700; for key in "${RESOURCE_KEYS[@]}"; do if [[ -e "$snapshot_dir/$key.exists" ]]; then marker="$snapshot_dir/$key.exists"; [[ "$key" == acme-link ]] && backup_path="$snapshot_dir/$key.link" || backup_path="$snapshot_dir/$key"; elif [[ -e "$snapshot_dir/$key.absent" ]]; then marker="$snapshot_dir/$key.absent"; backup_path=''; else fail "rollback snapshot has no captured state for $key"; fi; validate_root_owned_file "rollback snapshot marker for $key" "$marker"; [[ -z "$backup_path" ]] || validate_root_owned_file "rollback snapshot for $key" "$backup_path"; done; validate_root_owned_file 'rollback firewall runtime snapshot' "$snapshot_dir/firewall.runtime"; }
is_rfc1918_ipv4() { local ip="$1" first second third fourth extra octet; [[ "$ip" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || return 1; IFS=. read -r first second third fourth extra <<<"$ip"; [[ -z "$extra" ]] || return 1; for octet in "$first" "$second" "$third" "$fourth"; do ((10#$octet <= 255)) || return 1; done; ((10#$first == 10 || (10#$first == 172 && 10#$second >= 16 && 10#$second <= 31) || (10#$first == 192 && 10#$second == 168))); }
is_valid_domain() { [[ ${#1} -le 253 && "$1" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$ && ! "$1" =~ [A-Z] ]]; }
validate_port() { [[ "$2" =~ ^[0-9]+$ ]] || fail "$1 must be numeric"; (( $2 >= 1 && $2 <= 65535 )) || fail "$1 is outside 1..65535"; }
require_command() { local command_name="$1"; command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is required"; }
render_text() { local source_path="$1" rendered; rendered="$(<"$source_path")" || fail "could not read $source_path"; for pair in "DOMAIN|$DOMAIN" "PRIVATE_IP|$PRIVATE_IP" "REPLICATION_ROLE|$REPLICATION_ROLE" "REPLICATION_GATEWAY|$REPLICATION_GATEWAY" "MAX_CONNECTIONS|$REPLICATION_MAX_CONNECTIONS" "LISTEN_PORT|$LISTEN_PORT" "DB_PORT|$DB_PORT" "CERT_DIR|$CERT_DIR"; do rendered="${rendered//__${pair%%|*}__/${pair#*|}}"; done; [[ "$rendered" != *'__'* ]] || fail "unresolved placeholder in $source_path"; printf '%s' "$rendered"; }
line_number() { "$AWK_BIN" -v expected="$1" '$0 == expected {print NR; exit}' <<<"$2"; }
validate_hba_rendering() { local hba_text="$1" a b c d e f g h i j k l; a="$(line_number "host postgres $REPLICATION_ROLE $REPLICATION_GATEWAY/32 scram-sha-256" "$hba_text")"; b="$(line_number "host replication $REPLICATION_ROLE $REPLICATION_GATEWAY/32 scram-sha-256" "$hba_text")"; c="$(line_number "host all $REPLICATION_ROLE 0.0.0.0/0 reject" "$hba_text")"; d="$(line_number "host all $REPLICATION_ROLE ::/0 reject" "$hba_text")"; e="$(line_number "host all all $REPLICATION_GATEWAY/32 reject" "$hba_text")"; f="$(line_number 'host all all 127.0.0.1/32 trust' "$hba_text")"; g="$(line_number 'host all all ::1/128 trust' "$hba_text")"; h="$(line_number 'host all all 172.16.0.0/12 scram-sha-256' "$hba_text")"; i="$(line_number 'host all all 10.0.0.0/8 scram-sha-256' "$hba_text")"; j="$(line_number 'host all all 192.168.0.0/16 scram-sha-256' "$hba_text")"; k="$(line_number 'host all all 0.0.0.0/0 reject' "$hba_text")"; l="$(line_number 'host all all ::/0 reject' "$hba_text")"; [[ -n "$a" && -n "$b" && -n "$c" && -n "$d" && -n "$e" && -n "$f" && -n "$g" && -n "$h" && -n "$i" && -n "$j" && -n "$k" && -n "$l" ]] || fail 'HBA is missing an exact replication, loopback, private, or reject rule'; ((a<c && b<c && c<d && d<e && e<f && f<g && g<h && h<i && i<j && k>h && l>h)) || fail 'HBA dedicated-role deny is not before loopback and broader private CIDRs'; }
validate_nginx_rendering() { local n="$1"; [[ "$n" == *"listen $PRIVATE_IP:$LISTEN_PORT ssl"* && "$n" == *"proxy_pass 127.0.0.1:$DB_PORT;"* && "$n" == *'ssl_alpn postgresql;'* && "$n" == *'ssl_protocols TLSv1.2 TLSv1.3;'* && "$n" == *"ssl_certificate $CERT_DIR/fullchain.pem;"* && "$n" == *"ssl_certificate_key $CERT_DIR/privkey.pem;"* && "$n" == *'proxy_connect_timeout 5s;'* && "$n" == *'proxy_timeout 1h;'* && "$n" == *'ssl_handshake_timeout 10s;'* && "$n" == *'proxy_socket_keepalive on;'* && "$n" == *'so_keepalive=on'* ]] || fail 'nginx stream rendering is incomplete'; [[ "$n" != *'location '* && "$n" != *'proxy_pass http'* ]] || fail 'replication nginx template exposes HTTP directives'; }
backup_target() { local key="$1" target="$2" backup="$RUN_DIR/$1"; if [[ -e "$target" || -L "$target" ]]; then [[ ! -L "$target" ]] || fail "refusing symlink at $target"; "$CP_BIN" -p -- "$target" "$backup.tmp" || fail "could not back up $target"; "$INSTALL_BIN" -o root -g root -m 0600 "$backup.tmp" "$backup" || fail "could not finalize backup for $target"; "$RM_BIN" -f -- "$backup.tmp" || fail "could not remove temporary backup for $target"; : >"$backup.exists"; else : >"$backup.absent"; fi; }
backup_link() { local key="$1" target="$2" tmp="$RUN_DIR/$1.link.tmp"; if [[ -L "$target" ]]; then "$READLINK_BIN" -- "$target" >"$tmp" || fail "could not back up link $target"; "$INSTALL_BIN" -o root -g root -m 0600 "$tmp" "$RUN_DIR/$key.link" || fail "could not finalize link backup for $target"; "$RM_BIN" -f -- "$tmp" || fail "could not remove temporary link backup for $target"; : >"$RUN_DIR/$key.exists"; elif [[ -e "$target" ]]; then fail "refusing non-symlink nginx link target $target"; else : >"$RUN_DIR/$key.absent"; fi; }
atomic_install() {
    local source_path="$1"
    local target_path="$2"
    local mode="$3"
    local parent temp_path
    parent="$(dirname -- "$target_path")"
    [[ -d "$parent" && ! -L "$parent" ]] || fail "install parent is not a directory: $parent"
    [[ ! -L "$target_path" ]] || fail "target became a symlink: $target_path"
    temp_path="$($MKTEMP_BIN "$parent/.aura-replication-install.XXXXXX")" || fail "could not create atomic install file for $target_path"
    "$INSTALL_BIN" -o root -g root -m "$mode" "$source_path" "$temp_path" || fail "could not stage $target_path"
    "$MV_BIN" -f -- "$temp_path" "$target_path" || fail "could not activate $target_path"
}
publish_pending() {
    printf 'transaction\t%s\ndomain\t%s\nprivate-ip\t%s\nfirewall-preexisting\t%s\n' \
        "${RUN_DIR##*/}" "$DOMAIN" "$PRIVATE_IP" "$FIREWALL_PREEXISTING" >"$RUN_DIR/pending.data"
    atomic_install "$RUN_DIR/pending.data" "$ROLLBACK_PENDING_PATH" 0600
    PENDING_PUBLISHED=1
}
load_in_progress() {
    local state_name
    ROLLBACK_IN_PROGRESS=0
    if [[ ! -e "$ROLLBACK_IN_PROGRESS_PATH" && ! -L "$ROLLBACK_IN_PROGRESS_PATH" ]]; then return; fi
    validate_root_owned_file 'rollback progress marker' "$ROLLBACK_IN_PROGRESS_PATH" '600'
    state_name="$(<"$ROLLBACK_IN_PROGRESS_PATH")"
    [[ "$state_name" == "${ACTIVE_STATE_DIR##*/}" ]] || fail 'rollback progress marker does not match the current state'
    ROLLBACK_IN_PROGRESS=1
}
publish_in_progress() {
    printf '%s\n' "${RUN_DIR##*/}" >"$RUN_DIR/in-progress.data"
    atomic_install "$RUN_DIR/in-progress.data" "$ROLLBACK_IN_PROGRESS_PATH" 0600
    ROLLBACK_IN_PROGRESS=1
}
atomic_restore() {
    local source_path="$1" target_path="$2" mode="$3" parent temp_path
    parent="$(dirname -- "$target_path")"
    [[ -d "$parent" && ! -L "$parent" && ! -L "$target_path" ]] || return 1
    temp_path="$($MKTEMP_BIN "$parent/.aura-replication-restore.XXXXXX")" || return 1
    if ! "$INSTALL_BIN" -o root -g root -m "$mode" "$source_path" "$temp_path" || ! "$MV_BIN" -f -- "$temp_path" "$target_path"; then
        "$RM_BIN" -f -- "$temp_path" 2>/dev/null || true
        return 1
    fi
}
restore_target() {
    local key="$1" target="$2" mode="$3"
    if [[ -e "$RUN_DIR/$key.exists" ]]; then atomic_restore "$RUN_DIR/$key" "$target" "$mode"
    elif [[ -e "$RUN_DIR/$key.absent" ]]; then [[ ! -L "$target" ]] && "$RM_BIN" -f -- "$target"
    else return 1
    fi
}
restore_link() {
    local key="$1" target="$2"
    [[ -e "$RUN_DIR/$key.exists" || -e "$RUN_DIR/$key.absent" ]] || return 1
    if [[ -L "$target" ]]; then "$RM_BIN" -f -- "$target" || return 1; elif [[ -e "$target" ]]; then return 1; fi
    [[ ! -e "$RUN_DIR/$key.exists" ]] || "$LN_BIN" -s -- "$(<"$RUN_DIR/$key.link")" "$target"
}
write_rollback_manifest() {
    local manifest_tmp="$RUN_DIR/manifest.tmp"
    local key target digest
    validate_snapshot_for_restore "$RUN_DIR"
    printf 'meta\tversion\t1\nmeta\tdomain\t%s\nmeta\tprivate-ip\t%s\nmeta\tfirewall-inserted\t%s\n' "$DOMAIN" "$PRIVATE_IP" "$FIREWALL_INSERTED" >"$manifest_tmp"
    for key in "${RESOURCE_KEYS[@]}"; do
        [[ "$key" == 'acme-link' ]] && continue
        target="$(resource_target "$key")"
        [[ -f "$target" && ! -L "$target" ]] || fail "installed $key target is not a regular file"
        digest="$(file_sha256 "$target")" || fail "could not fingerprint installed $key target"
        printf 'file\t%s\t%s\tsha256\t%s\n' "$key" "$target" "$digest" >>"$manifest_tmp"
    done
    target="$NGINX_ACME_LINK_PATH"
    [[ -L "$target" ]] || fail 'installed nginx ACME target is not a symlink'
    printf 'link\tacme-link\t%s\tsymlink\t%s\n' "$target" "$("$READLINK_BIN" -- "$target")" >>"$manifest_tmp"
    "$INSTALL_BIN" -o root -g root -m 0600 "$manifest_tmp" "$RUN_DIR/manifest" || fail 'could not finalize the durable rollback manifest'
    "$RM_BIN" -f -- "$manifest_tmp" || fail 'could not remove the temporary rollback manifest'
}
commit_rollback_state() {
    if ((ACTIVE_STATE_REUSABLE)); then
        "$RM_BIN" -f -- "$ROLLBACK_PENDING_PATH" || fail 'could not clear the completed pending rollback'
        PENDING_PUBLISHED=0
        ROLLBACK_NEEDED=0
        "$RM_BIN" -rf -- "$RUN_DIR" || fail 'could not remove the redundant rollback snapshot'
        RUN_DIR=''
        log 'idempotent rerun: preserving the existing last-known pre-install rollback snapshot'
        return
    fi
    write_rollback_manifest
    printf '%s\n' "${RUN_DIR##*/}" >"$RUN_DIR/current.pointer"
    atomic_install "$RUN_DIR/current.pointer" "$ROLLBACK_CURRENT_PATH" 0600
    "$RM_BIN" -f -- "$ROLLBACK_PENDING_PATH" || fail 'could not clear the completed pending rollback'
    PENDING_PUBLISHED=0
    ROLLBACK_NEEDED=0
    ROLLBACK_STATE_COMMITTED=1
    log 'durable rollback snapshot committed'
}
restore_firewall_runtime() {
    local preexisting="$1" terminal_line
    if ((preexisting)); then
        if ! firewall_rule_present; then
            terminal_line="$($IPTABLES_BIN -L INPUT --line-numbers -n 2>/dev/null | "$AWK_BIN" '$1 ~ /^[0-9]+$/ && $2 == "REJECT" {print $1; exit}')"
            [[ -n "$terminal_line" ]] || return 1
            "$IPTABLES_BIN" -I INPUT "$terminal_line" -d "$PRIVATE_IP" -p tcp --dport "$LISTEN_PORT" -m conntrack --ctstate NEW,ESTABLISHED -j ACCEPT >/dev/null 2>&1 || return 1
        fi
    elif firewall_rule_present; then
        "$IPTABLES_BIN" -D INPUT -d "$PRIVATE_IP" -p tcp --dport "$LISTEN_PORT" -m conntrack --ctstate NEW,ESTABLISHED -j ACCEPT >/dev/null 2>&1 || return 1
    fi
}
restore_snapshot() {
    local snapshot="$1" preexisting="$2" key mode failed=0
    RUN_DIR="$snapshot"
    restore_firewall_runtime "$preexisting" || failed=1
    for key in "${RESOURCE_KEYS[@]}"; do
        if [[ "$key" == acme-link ]]; then restore_link "$key" "$(resource_target "$key")" || failed=1
        else mode="$(managed_mode "$key")"; restore_target "$key" "$(resource_target "$key")" "$mode" || failed=1
        fi
    done
    compose_base_recreate || failed=1
    db_health || failed=1
    app_health || failed=1
    if "$NGINX_BIN" -t >/dev/null 2>&1; then "$SYSTEMCTL_BIN" reload nginx >/dev/null 2>&1 || failed=1; else failed=1; fi
    ((failed == 0))
}
recover_pending() {
    local current_name=''
    load_pending || return 1
    [[ "$PENDING_DOMAIN" == "$DOMAIN" && "$PENDING_PRIVATE_IP" == "$PRIVATE_IP" ]] || fail 'pending rollback target does not match the explicit domain and private IP'
    if ! restore_snapshot "$PENDING_STATE_DIR" "$PENDING_FIREWALL_PREEXISTING"; then return 1; fi
    if [[ -e "$ROLLBACK_CURRENT_PATH" || -L "$ROLLBACK_CURRENT_PATH" ]]; then validate_root_owned_file 'rollback current pointer' "$ROLLBACK_CURRENT_PATH" 600; current_name="$(<"$ROLLBACK_CURRENT_PATH")"; [[ "$current_name" != "$PENDING_TRANSACTION" ]] || "$RM_BIN" -f -- "$ROLLBACK_CURRENT_PATH" || return 1; fi
    if [[ -e "$ROLLBACK_IN_PROGRESS_PATH" || -L "$ROLLBACK_IN_PROGRESS_PATH" ]]; then validate_root_owned_file 'rollback progress marker' "$ROLLBACK_IN_PROGRESS_PATH" 600; if [[ "$(<"$ROLLBACK_IN_PROGRESS_PATH")" == "$PENDING_TRANSACTION" ]]; then "$RM_BIN" -f -- "$ROLLBACK_IN_PROGRESS_PATH" || return 1; fi; fi
    "$RM_BIN" -f -- "$ROLLBACK_PENDING_PATH" || return 1
    PENDING_PUBLISHED=0
    ROLLBACK_NEEDED=0
    "$RM_BIN" -rf -- "$PENDING_STATE_DIR" || log "orphaned recovered rollback snapshot: $PENDING_STATE_DIR"
    RUN_DIR=''
}
finish_completed_rollback() {
    local state_name state_dir
    [[ -e "$ROLLBACK_IN_PROGRESS_PATH" && ! -e "$ROLLBACK_CURRENT_PATH" && ! -L "$ROLLBACK_CURRENT_PATH" ]] || return 1
    validate_root_owned_file 'rollback progress marker' "$ROLLBACK_IN_PROGRESS_PATH" 600
    state_name="$(<"$ROLLBACK_IN_PROGRESS_PATH")"
    [[ "$state_name" =~ ^transaction\.[A-Za-z0-9]+$ ]] || fail 'rollback progress marker is invalid'
    state_dir="$ROLLBACK_STATE_DIR/$state_name"
    validate_path_string 'completed rollback transaction directory' "$state_dir"
    [[ -d "$state_dir" && ! -L "$state_dir" ]] || fail 'completed rollback transaction directory is invalid'
    validate_root_owned "$state_dir" "$state_dir" 700
    load_manifest "$state_dir/manifest"
    [[ "${MANIFEST_META[domain]}" == "$DOMAIN" && "${MANIFEST_META[private-ip]}" == "$PRIVATE_IP" ]] || fail 'completed rollback marker target mismatch'
    "$RM_BIN" -f -- "$ROLLBACK_IN_PROGRESS_PATH" || fail 'could not clear rollback progress marker'
    "$RM_BIN" -rf -- "$state_dir" || log "orphaned completed rollback snapshot: $state_dir"
    log 'completed rollback cleanup finished'
}
explicit_rollback() {
    local key mode preexisting
    prepare_rollback_state_dir 0
    if [[ -e "$ROLLBACK_PENDING_PATH" || -L "$ROLLBACK_PENDING_PATH" ]]; then recover_pending || fail "pending rollback recovery failed; state retained at $ROLLBACK_PENDING_PATH"; log 'interrupted replication endpoint write restored'; return; fi
    if [[ -e "$ROLLBACK_IN_PROGRESS_PATH" && ! -e "$ROLLBACK_CURRENT_PATH" && ! -L "$ROLLBACK_CURRENT_PATH" ]]; then finish_completed_rollback; return; fi
    load_current_state
    [[ -n "$ACTIVE_STATE_DIR" ]] || fail 'no successful replication endpoint install is available for rollback'
    [[ "${MANIFEST_META[domain]}" == "$DOMAIN" ]] || fail 'rollback domain does not match the installed state'
    [[ "${MANIFEST_META[private-ip]}" == "$PRIVATE_IP" ]] || fail 'rollback private IP does not match the installed state'
    ((ROLLBACK_IN_PROGRESS)) || manifest_matches_current || fail 'managed endpoint state changed; refusing to overwrite an unexpected state during rollback'
    validate_snapshot_for_restore "$ACTIVE_STATE_DIR"
    RUN_DIR="$ACTIVE_STATE_DIR"
    ((ROLLBACK_IN_PROGRESS)) || publish_in_progress
    preexisting=1; [[ "${MANIFEST_META[firewall-inserted]}" == 1 ]] && preexisting=0
    restore_snapshot "$ACTIVE_STATE_DIR" "$preexisting" || fail "rollback incomplete; retry with --rollback after correcting health or runtime failures"
    "$RM_BIN" -f -- "$ROLLBACK_CURRENT_PATH" || fail 'could not clear the completed rollback pointer'
    "$RM_BIN" -f -- "$ROLLBACK_IN_PROGRESS_PATH" || fail 'could not clear the rollback progress marker'
    "$RM_BIN" -rf -- "$ACTIVE_STATE_DIR" || log "orphaned completed rollback snapshot: $ACTIVE_STATE_DIR"
    log 'last successful replication endpoint state restored; OCI NSG must be removed separately'
}
compose_base_recreate() { local -a compose_args=(-f "$COMPOSE_BASE_PATH"); [[ -f "$COMPOSE_OVERRIDE_PATH" ]] && compose_args+=(-f "$COMPOSE_OVERRIDE_PATH"); "$DOCKER_BIN" compose "${compose_args[@]}" up -d --force-recreate --wait db >/dev/null 2>&1 || return 1; }
db_health() {
    local -a compose_args=(-f "$COMPOSE_BASE_PATH")
    [[ -f "$COMPOSE_OVERRIDE_PATH" ]] && compose_args+=(-f "$COMPOSE_OVERRIDE_PATH")
    "$DOCKER_BIN" compose "${compose_args[@]}" exec -T db pg_isready -U supabase_admin -d postgres >/dev/null 2>&1
}
app_health() { local status; status="$($CURL_BIN --fail --silent --show-error --noproxy '*' --connect-timeout 3 --max-time 10 --output /dev/null --write-out '%{http_code}' "$APP_HEALTH_URL" 2>/dev/null)" || return 1; [[ "$status" =~ ^2[0-9][0-9]$ ]]; }
verify_role() {
    local sql result
    sql="SELECT CASE WHEN count(*) = 1 AND bool_and(rolcanlogin AND rolreplication AND rolbypassrls AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND rolconnlimit = $REPLICATION_MAX_CONNECTIONS) THEN 'ok' ELSE 'fail' END FROM pg_roles WHERE rolname = '$REPLICATION_ROLE';"
    result="$($DOCKER_BIN compose -f "$COMPOSE_BASE_PATH" -f "$COMPOSE_OVERRIDE_PATH" exec -T db psql -XAtq -U supabase_admin -d postgres -c "$sql" 2>/dev/null)" || fail 'could not verify the replication role via supabase_admin'
    [[ "$result" == 'ok' ]] || fail 'replication role attributes are not the required bounded SCRAM role contract'
}
verify_hba() {
    local sql result
    sql="WITH r AS (SELECT * FROM pg_hba_file_rules WHERE error IS NULL), lines AS (SELECT "
    sql+="min(CASE WHEN type='host' AND database @> ARRAY['postgres'] AND user_name @> ARRAY['$REPLICATION_ROLE'] AND address='$REPLICATION_GATEWAY' AND auth_method='scram-sha-256' THEN line_number END) db_allow, "
    sql+="min(CASE WHEN type='host' AND database @> ARRAY['replication'] AND user_name @> ARRAY['$REPLICATION_ROLE'] AND address='$REPLICATION_GATEWAY' AND auth_method='scram-sha-256' THEN line_number END) replication_allow, "
    sql+="min(CASE WHEN type='host' AND database @> ARRAY['all'] AND user_name @> ARRAY['$REPLICATION_ROLE'] AND address='0.0.0.0' AND auth_method='reject' THEN line_number END) role_reject4, "
    sql+="min(CASE WHEN type='host' AND database @> ARRAY['all'] AND user_name @> ARRAY['$REPLICATION_ROLE'] AND address='::' AND auth_method='reject' THEN line_number END) role_reject6, "
    sql+="min(CASE WHEN type='host' AND database @> ARRAY['all'] AND user_name @> ARRAY['all'] AND address='$REPLICATION_GATEWAY' AND auth_method='reject' THEN line_number END) gateway_reject, "
    sql+="min(CASE WHEN type='host' AND database @> ARRAY['all'] AND user_name @> ARRAY['all'] AND address='127.0.0.1' AND auth_method='trust' THEN line_number END) loopback4, "
    sql+="min(CASE WHEN type='host' AND database @> ARRAY['all'] AND user_name @> ARRAY['all'] AND address='::1' AND auth_method='trust' THEN line_number END) loopback6, "
    sql+="min(CASE WHEN type='host' AND database @> ARRAY['all'] AND user_name @> ARRAY['all'] AND address='172.16.0.0' AND auth_method='scram-sha-256' THEN line_number END) private172, "
    sql+="min(CASE WHEN type='host' AND database @> ARRAY['all'] AND user_name @> ARRAY['all'] AND address='10.0.0.0' AND auth_method='scram-sha-256' THEN line_number END) private10, "
    sql+="min(CASE WHEN type='host' AND database @> ARRAY['all'] AND user_name @> ARRAY['all'] AND address='192.168.0.0' AND auth_method='scram-sha-256' THEN line_number END) private192 FROM r) "
    sql+="SELECT CASE WHEN current_setting('hba_file')='$HBA_CONTAINER_PATH' AND db_allow < role_reject4 AND replication_allow < role_reject4 AND role_reject4 < role_reject6 AND role_reject6 < gateway_reject AND gateway_reject < loopback4 AND loopback4 < loopback6 AND loopback6 < private172 AND private172 < private10 AND private10 < private192 AND NOT EXISTS (SELECT 1 FROM pg_hba_file_rules WHERE error IS NOT NULL) THEN 'ok' ELSE 'fail' END FROM lines;"
    result="$($DOCKER_BIN compose -f "$COMPOSE_BASE_PATH" -f "$COMPOSE_OVERRIDE_PATH" exec -T db psql -XAtq -U supabase_admin -d postgres -c "$sql" 2>/dev/null)" || fail 'could not validate pg_hba_file_rules via supabase_admin'
    [[ "$result" == 'ok' ]] || fail 'loaded pg_hba_file_rules do not match the exact gateway allow/deny order contract'
}
listener_matches_exact() {
    local listeners="$1"
    local expected="$2"
    [[ -n "$listeners" ]] || return 1
    "$AWK_BIN" -v expected="$expected" '
        NF >= 4 { seen = 1; if ($4 != expected) { bad = 1 } }
        END { exit !(seen && !bad) }
    ' <<<"$listeners"
}
listener_checks() {
    local db_listeners stream_listeners
    db_listeners="$($SS_BIN -ltnH "sport = :$DB_PORT" 2>/dev/null)" || fail 'could not inspect the loopback database listener'
    listener_matches_exact "$db_listeners" "127.0.0.1:$DB_PORT" || fail 'database has a non-loopback or unexpected listener'
    stream_listeners="$($SS_BIN -ltnH "sport = :$LISTEN_PORT" 2>/dev/null)" || fail 'could not inspect the public replication listener'
    listener_matches_exact "$stream_listeners" "$PRIVATE_IP:$LISTEN_PORT" || fail 'replication stream has an unexpected TCP/5432 listener'
}
firewall_rule_present() { "$IPTABLES_BIN" -C INPUT -d "$PRIVATE_IP" -p tcp --dport "$LISTEN_PORT" -m conntrack --ctstate NEW,ESTABLISHED -j ACCEPT >/dev/null 2>&1; }
firewall_scope_preflight() {
    local rules
    rules="$($IPTABLES_SAVE_BIN 2>/dev/null)" || fail 'could not inspect the complete host firewall ruleset'
    "$AWK_BIN" -v destination="$PRIVATE_IP" '
        /-j ACCEPT/ {
            dest = ""; covers = 0
            for (i = 1; i <= NF; i++) {
                if ($i == "-d") dest = $(i + 1)
                if ($i == "--dport" || $i == "--dports") {
                    count = split($(i + 1), ports, ",")
                    for (p = 1; p <= count; p++) {
                        if (ports[p] == "5432") covers = 1
                        if (ports[p] ~ /^[0-9]+:[0-9]+$/) {
                            split(ports[p], bounds, ":")
                            if (bounds[1] <= 5432 && bounds[2] >= 5432) covers = 1
                        }
                    }
                }
            }
            if (covers && dest != destination && dest != destination "/32") bad = 1
        }
        END { exit bad }
    ' <<<"$rules" || fail 'refusing an existing TCP/5432 ACCEPT rule outside the exact private-NIC rule'
}
install_firewall_rule() {
    local terminal_line existing_line
    terminal_line="$($IPTABLES_BIN -L INPUT --line-numbers -n 2>/dev/null | "$AWK_BIN" '$1 ~ /^[0-9]+$/ && $2 == "REJECT" {print $1; exit}')" || true
    [[ -n "$terminal_line" ]] || fail 'INPUT chain has no terminal REJECT before which TCP/5432 can be inserted'
    existing_line="$($IPTABLES_BIN -L INPUT --line-numbers -n 2>/dev/null | "$AWK_BIN" -v destination="$PRIVATE_IP" '$1 ~ /^[0-9]+$/ && $2 == "ACCEPT" && ($6 == destination || $6 == destination "/32") && /tcp dpt:5432/ {print $1; exit}')" || true
    if firewall_rule_present; then
        [[ -n "$existing_line" && "$existing_line" -lt "$terminal_line" ]] || fail 'existing TCP/5432 firewall rule is not before the terminal reject'
    else
        firewall_scope_preflight
        "$IPTABLES_BIN" -I INPUT "$terminal_line" -d "$PRIVATE_IP" -p tcp --dport "$LISTEN_PORT" -m conntrack --ctstate NEW,ESTABLISHED -j ACCEPT >/dev/null 2>&1 || fail 'could not insert the host TCP/5432 firewall rule'
        FIREWALL_INSERTED=1
    fi
    "$IPTABLES_SAVE_BIN" >"$RUN_DIR/firewall.rules" || fail 'could not save the host firewall rules'
    atomic_install "$RUN_DIR/firewall.rules" "$FIREWALL_RULES_PATH" 0644
    FIREWALL_PERSISTED_MUTATED=1
    grep -Fq -- "-d $PRIVATE_IP" "$FIREWALL_RULES_PATH" || fail 'persisted firewall rules are not scoped to the private NIC'
    grep -Fq -- "--dport $LISTEN_PORT" "$FIREWALL_RULES_PATH" || fail 'persisted firewall rules do not contain TCP/5432'
}
on_exit() {
    local exit_code=$?
    trap - EXIT
    [[ -z "$ACME_PROBE_PATH" ]] || "$RM_BIN" -f -- "$ACME_PROBE_PATH" 2>/dev/null || true
    if ((ROLLBACK_NEEDED && PENDING_PUBLISHED)); then
        if recover_pending; then log 'failed write was fully rolled back'; else log "rollback incomplete; durable recovery retained at $ROLLBACK_PENDING_PATH"; fi
    elif [[ -n "$RUN_DIR" && "$ROLLBACK_STATE_COMMITTED" -eq 0 ]]; then
        "$RM_BIN" -rf -- "$RUN_DIR" 2>/dev/null || true
    fi
    exit "$exit_code"
}
for command_name in "$NGINX_BIN" "$INSTALL_BIN" "$MKTEMP_BIN" "$MV_BIN" "$RM_BIN" "$CP_BIN" "$LN_BIN" "$READLINK_BIN" "$UNAME_BIN" grep "$AWK_BIN"; do
    require_command "$command_name"
done
validate_text 'domain' "$DOMAIN"
is_valid_domain "$DOMAIN" || fail 'domain must be a lowercase multi-label FQDN without wildcards, underscores, ports, or paths'
validate_text 'private IP' "$PRIVATE_IP"
is_rfc1918_ipv4 "$PRIVATE_IP" || fail 'private IP must be an RFC1918 IPv4 address'
validate_text 'replication role' "$REPLICATION_ROLE"
[[ "$REPLICATION_ROLE" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || fail 'replication role must be a lowercase PostgreSQL identifier'
validate_text 'Docker gateway' "$REPLICATION_GATEWAY"
is_rfc1918_ipv4 "$REPLICATION_GATEWAY" || fail 'Docker gateway must be an RFC1918 IPv4 address'
validate_port 'replication listen port' "$LISTEN_PORT"
validate_port 'direct database port' "$DB_PORT"
[[ "$LISTEN_PORT" == '5432' ]] || fail 'replication listen port must be exactly 5432'
[[ "$DB_PORT" == '15433' ]] || fail 'direct database port must be exactly 15433'
[[ "$REPLICATION_MAX_CONNECTIONS" =~ ^[1-9][0-9]{0,2}$ ]] || fail 'replication connection limit must be a bounded positive integer'
((REPLICATION_MAX_CONNECTIONS <= 100)) || fail 'replication connection limit is too large'
validate_text 'app health URL' "$APP_HEALTH_URL"
[[ "$APP_HEALTH_URL" =~ ^http://127\.0\.0\.1:[0-9]+/ ]] || fail 'app health URL must use the loopback HTTP endpoint'
for path_pair in \
    "nginx template|$NGINX_TEMPLATE" "HBA template|$HBA_TEMPLATE" "Compose template|$COMPOSE_TEMPLATE" \
    "Supabase root|$SUPABASE_ROOT" "DB config root|$DB_CONFIG_ROOT" "Compose base|$COMPOSE_BASE_PATH" "Compose override|$COMPOSE_OVERRIDE_PATH" \
    "HBA path|$HBA_PATH" "Postgres override|$POSTGRES_OVERRIDE_PATH" "nginx stream directory|$NGINX_STREAM_DIR" "nginx stream path|$NGINX_STREAM_PATH" \
    "nginx stream bootstrap|$NGINX_STREAM_BOOTSTRAP_PATH" "nginx main|$NGINX_MAIN_PATH" \
    "nginx ACME config|$NGINX_ACME_CONFIG_PATH" "ACME webroot|$ACME_WEBROOT" "certificate directory|$CERT_DIR" \
    "Certbot config|$LETSENCRYPT_CONFIG_DIR" "renewal hook|$RENEWAL_HOOK_PATH" "firewall rules|$FIREWALL_RULES_PATH" \
    "stream module|$NGINX_STREAM_MODULE_PATH" "rollback state directory|$ROLLBACK_STATE_DIR" "rollback current pointer|$ROLLBACK_CURRENT_PATH"; do
    label="${path_pair%%|*}"
    path="${path_pair#*|}"
    validate_path_string "$label" "$path"
done
validate_path_string 'HBA container path' "$HBA_CONTAINER_PATH"
[[ "$HBA_CONTAINER_PATH" == '/etc/postgresql-custom/pg_hba-replication.conf' ]] || fail 'HBA container path must use the existing Postgres custom volume'
validate_path_string 'nginx ACME link parent' "$(dirname -- "$NGINX_ACME_LINK_PATH")"
validate_regular_target 'nginx template' "$NGINX_TEMPLATE"
validate_regular_target 'HBA template' "$HBA_TEMPLATE"
validate_regular_target 'Compose template' "$COMPOSE_TEMPLATE"
validate_regular_target 'Compose base' "$COMPOSE_BASE_PATH"
validate_regular_target 'Compose override' "$COMPOSE_OVERRIDE_PATH"
validate_regular_target 'HBA path' "$HBA_PATH"
validate_regular_target 'Postgres override' "$POSTGRES_OVERRIDE_PATH"
validate_regular_target 'nginx stream path' "$NGINX_STREAM_PATH"
validate_regular_target 'nginx stream bootstrap' "$NGINX_STREAM_BOOTSTRAP_PATH"
validate_regular_target 'nginx main' "$NGINX_MAIN_PATH"
validate_regular_target 'nginx ACME config' "$NGINX_ACME_CONFIG_PATH"
validate_regular_target 'renewal hook' "$RENEWAL_HOOK_PATH"
validate_directory 'Supabase root' "$SUPABASE_ROOT"
validate_directory 'DB config root' "$DB_CONFIG_ROOT"
validate_directory 'DB config conf.d' "$(dirname -- "$POSTGRES_OVERRIDE_PATH")"
validate_directory 'nginx stream directory' "$NGINX_STREAM_DIR"
validate_directory 'nginx ACME available directory' "$(dirname -- "$NGINX_ACME_CONFIG_PATH")"
validate_directory 'nginx ACME enabled directory' "$(dirname -- "$NGINX_ACME_LINK_PATH")"
validate_directory 'Certbot config' "$LETSENCRYPT_CONFIG_DIR"
validate_directory 'firewall rules parent' "$(dirname -- "$FIREWALL_RULES_PATH")"
if [[ "$MODE" == 'rollback' ]]; then
    ((DOMAIN_ARG_SET && PRIVATE_IP_ARG_SET)) || fail 'rollback mode requires explicit --domain and --private-ip'
    [[ "$(id -u)" -eq 0 ]] || fail 'rollback mode must run as root'
    for command_name in "$CURL_BIN" "$SYSTEMCTL_BIN" "$DOCKER_BIN" "$IPTABLES_BIN" "$NGINX_BIN" "$STAT_BIN" "$SHA256_BIN"; do
        require_command "$command_name"
    done
    explicit_rollback
    exit 0
fi
[[ -r "$NGINX_TEMPLATE" && -r "$HBA_TEMPLATE" && -r "$COMPOSE_TEMPLATE" ]] || fail 'a required template is not readable'
[[ ! -e "$NGINX_STREAM_MODULE_PATH" || -r "$NGINX_STREAM_MODULE_PATH" ]] || fail 'nginx stream module path is not readable'
arch="$($UNAME_BIN -m)" || fail 'could not determine host architecture'
[[ "$arch" == 'aarch64' || "$arch" == 'arm64' ]] || fail 'ARM64 host required'
nginx_build="$($NGINX_BIN -V 2>&1 || true)"
if [[ "$nginx_build" != *'--with-stream'* && ! -r "$NGINX_STREAM_MODULE_PATH" ]]; then
    fail 'nginx stream module is required on ARM64; install it with: sudo apt-get install nginx-full libnginx-mod-stream'
fi
rendered_nginx="$(render_text "$NGINX_TEMPLATE")"
rendered_hba="$(render_text "$HBA_TEMPLATE")"
rendered_compose="$(render_text "$COMPOSE_TEMPLATE")"
validate_nginx_rendering "$rendered_nginx"
validate_hba_rendering "$rendered_hba"
[[ "$rendered_compose" == *'127.0.0.1:15433:5432/tcp'* ]] || fail 'compose override does not publish only 127.0.0.1:15433 to db:5432'
[[ "$rendered_compose" != *'volumes:'* ]] || fail 'compose override must preserve the existing database config volume'
if [[ -L "$NGINX_ACME_LINK_PATH" ]]; then
    resolved_link="$($READLINK_BIN -f -- "$NGINX_ACME_LINK_PATH" 2>/dev/null || true)"
    resolved_config="$($READLINK_BIN -f -- "$NGINX_ACME_CONFIG_PATH" 2>/dev/null || true)"
    [[ -n "$resolved_link" && "$resolved_link" == "$resolved_config" ]] || fail 'refusing unexpected nginx ACME symlink target'
elif [[ -e "$NGINX_ACME_LINK_PATH" ]]; then
    fail 'nginx ACME link path is not a symlink'
fi
if [[ "$MODE" == 'dry-run' ]]; then
    log "dry-run: validated domain=$DOMAIN private-NIC=$PRIVATE_IP role=$REPLICATION_ROLE; no writes, certbot, compose recreate, reload, or firewall changes"
    exit 0
fi
[[ "$(id -u)" -eq 0 ]] || fail 'write mode must run as root'
for command_name in "$CURL_BIN" "$CERTBOT_BIN" "$SYSTEMCTL_BIN" "$DOCKER_BIN" "$IPTABLES_BIN" "$IPTABLES_SAVE_BIN" "$SS_BIN" "$GETENT_BIN"; do
    require_command "$command_name"
done
for command_name in "$STAT_BIN" "$SHA256_BIN"; do require_command "$command_name"; done
firewall_scope_preflight
validate_managed_target_metadata
refuse_pending_write
[[ -d "$LETSENCRYPT_CONFIG_DIR/accounts" && ! -L "$LETSENCRYPT_CONFIG_DIR/accounts" ]] || fail 'an existing Certbot account is required under the configured Certbot directory'
[[ -d "$(dirname -- "$RENEWAL_HOOK_PATH")" || ! -e "$(dirname -- "$RENEWAL_HOOK_PATH")" ]] || fail 'renewal hook parent is not a directory'
[[ -d "$ACME_WEBROOT" || ! -e "$ACME_WEBROOT" ]] || fail 'ACME webroot is not a directory'
[[ -d "$(dirname -- "$FIREWALL_RULES_PATH")" && ! -L "$(dirname -- "$FIREWALL_RULES_PATH")" ]] || fail 'firewall rules parent is not a directory'
prepare_rollback_state_dir 1
load_current_state
((ROLLBACK_IN_PROGRESS == 0)) || fail 'an explicit rollback is in progress; retry --rollback first'
[[ -z "$ACTIVE_STATE_DIR" || "$ACTIVE_STATE_REUSABLE" -eq 1 ]] || fail 'managed endpoint state differs from its rollback manifest; rollback or reconcile it before write'
RUN_DIR="$($MKTEMP_BIN -d "$ROLLBACK_STATE_DIR/transaction.XXXXXX")" || fail 'could not create private rollback state'
trap on_exit EXIT
for key in "${RESOURCE_KEYS[@]}"; do
    if [[ "$key" == 'acme-link' ]]; then backup_link "$key" "$(resource_target "$key")"; else backup_target "$key" "$(resource_target "$key")"; fi
done
"$IPTABLES_SAVE_BIN" >"$RUN_DIR/firewall.runtime" || fail 'could not snapshot current host firewall rules'
FIREWALL_PREEXISTING=0; firewall_rule_present && FIREWALL_PREEXISTING=1
validate_snapshot_for_restore "$RUN_DIR"
publish_pending
ROLLBACK_NEEDED=1
if [[ ! -d "$(dirname -- "$RENEWAL_HOOK_PATH")" ]]; then
    "$INSTALL_BIN" -d -o root -g root -m 0755 "$(dirname -- "$RENEWAL_HOOK_PATH")" || fail 'could not create the Certbot renewal hook directory'
fi
if [[ ! -d "$ACME_WEBROOT" ]]; then
    "$INSTALL_BIN" -d -o root -g root -m 0755 "$ACME_WEBROOT" || fail 'could not create the ACME webroot'
fi
printf '%s\n' "$rendered_compose" >"$RUN_DIR/compose.override"
printf '%s\n' "$rendered_hba" >"$RUN_DIR/pg_hba.conf"
printf "hba_file = '%s'\n" "$HBA_CONTAINER_PATH" >"$RUN_DIR/postgres-override.conf"
atomic_install "$RUN_DIR/compose.override" "$COMPOSE_OVERRIDE_PATH" 0644
atomic_install "$RUN_DIR/pg_hba.conf" "$HBA_PATH" 0644
atomic_install "$RUN_DIR/postgres-override.conf" "$POSTGRES_OVERRIDE_PATH" 0644
"$DOCKER_BIN" compose -f "$COMPOSE_BASE_PATH" -f "$COMPOSE_OVERRIDE_PATH" config --quiet >/dev/null 2>&1 || fail 'docker compose config failed before db recreate'
COMPOSE_RECREATED=1
"$DOCKER_BIN" compose -f "$COMPOSE_BASE_PATH" -f "$COMPOSE_OVERRIDE_PATH" up -d --force-recreate --wait db >/dev/null 2>&1 || fail 'docker compose db recreate failed'
db_health || fail 'Supabase db health probe failed'
verify_role
verify_hba
dns_result="$($GETENT_BIN ahosts "$DOMAIN" 2>/dev/null || true)"
[[ -n "$dns_result" ]] || fail 'domain does not resolve; create DNS before requesting the certificate'
acme_dir="$ACME_WEBROOT/.well-known/acme-challenge"
"$INSTALL_BIN" -d -o root -g root -m 0755 "$acme_dir" || fail 'could not create the ACME challenge directory'
ACME_PROBE_PATH="$acme_dir/aura-board-replication-probe"
printf 'aura-board-http-ok\n' >"$ACME_PROBE_PATH"
rendered_http="$RUN_DIR/acme.conf"
printf '%s\n' "server {" "    listen 80;" "    listen [::]:80;" "    server_name $DOMAIN;" '' "    location ^~ /.well-known/acme-challenge/ {" "        root $ACME_WEBROOT;" '        try_files $uri =404;' '        default_type text/plain;' '    }' '' '    location / {' '        return 404;' '    }' '}' >"$rendered_http"
atomic_install "$rendered_http" "$NGINX_ACME_CONFIG_PATH" 0644
"$RM_BIN" -f -- "$NGINX_ACME_LINK_PATH"
"$LN_BIN" -s -- "$NGINX_ACME_CONFIG_PATH" "$NGINX_ACME_LINK_PATH" || fail 'could not enable the ACME-only nginx server'
NGINX_MUTATED=1
"$NGINX_BIN" -t >/dev/null 2>&1 || fail 'nginx test failed for the ACME-only server'
"$SYSTEMCTL_BIN" reload nginx >/dev/null 2>&1 || fail 'nginx reload failed for the ACME-only server'
http_status="$($CURL_BIN --fail --silent --show-error --noproxy '*' --connect-timeout 5 --max-time 15 --output /dev/null --write-out '%{http_code}' "http://$DOMAIN/.well-known/acme-challenge/aura-board-replication-probe" 2>/dev/null)" || fail 'HTTP-01 prerequisite check failed'
[[ "$http_status" == '200' ]] || fail 'HTTP-01 prerequisite did not return 200 from the ACME-only server'
"$CERTBOT_BIN" certonly --webroot --webroot-path "$ACME_WEBROOT" --cert-name "$DOMAIN" --domain "$DOMAIN" --config-dir "$LETSENCRYPT_CONFIG_DIR" --work-dir "$CERTBOT_WORK_DIR" --logs-dir "$CERTBOT_LOG_DIR" --non-interactive --agree-tos --keep-until-expiring --no-eff-email --preferred-challenges http >/dev/null 2>&1 || fail 'Certbot certificate issuance failed'
[[ -r "$CERT_DIR/fullchain.pem" && -r "$CERT_DIR/privkey.pem" ]] || fail 'Certbot did not produce the expected certificate files'
"$RM_BIN" -f -- "$ACME_PROBE_PATH"
ACME_PROBE_PATH=''
printf '%s\n' "$rendered_nginx" >"$RUN_DIR/stream.conf"
printf 'stream { include %s/*.conf; }\n' "$NGINX_STREAM_DIR" >"$RUN_DIR/stream-bootstrap.conf"
"$AWK_BIN" -v legacy="$LEGACY_NGINX_STREAM_INCLUDE" '$0 != legacy { print }' "$NGINX_MAIN_PATH" >"$RUN_DIR/nginx-main.conf"
printf '#!/usr/bin/env bash\nset -Eeuo pipefail\n%s -t\n%s reload nginx\n' "$(printf '%q' "$NGINX_BIN")" "$(printf '%q' "$SYSTEMCTL_BIN")" >"$RUN_DIR/renewal-hook"
atomic_install "$RUN_DIR/stream.conf" "$NGINX_STREAM_PATH" 0644
atomic_install "$RUN_DIR/stream-bootstrap.conf" "$NGINX_STREAM_BOOTSTRAP_PATH" 0644
atomic_install "$RUN_DIR/nginx-main.conf" "$NGINX_MAIN_PATH" 0644
atomic_install "$RUN_DIR/renewal-hook" "$RENEWAL_HOOK_PATH" 0755
"$NGINX_BIN" -t >/dev/null 2>&1 || fail 'nginx test failed for the PostgreSQL stream endpoint'
"$SYSTEMCTL_BIN" reload nginx >/dev/null 2>&1 || fail 'nginx reload failed for the PostgreSQL stream endpoint'
install_firewall_rule
listener_checks
db_health || fail 'Supabase db health probe failed'
app_health || fail 'Supabase app health probe failed'
commit_rollback_state
log "replication endpoint installed for $DOMAIN; OCI NSG and DNS were not changed"
