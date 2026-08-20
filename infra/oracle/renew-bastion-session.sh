#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

BASTION_NAME="${BASTION_NAME:-aura-board-devspace-bastion}"
SESSION_NAME="${SESSION_NAME:-aura-board-devspace-auto}"
TARGET_PORT="${TARGET_PORT:-22}"
MIN_REMAINING_SECONDS="${MIN_REMAINING_SECONDS:-1200}"
SSH_PUBLIC_KEY_FILE="${SSH_PUBLIC_KEY_FILE:?SSH_PUBLIC_KEY_FILE is required}"
OUTPUT_FILE="${OUTPUT_FILE:?OUTPUT_FILE is required}"

fail() {
  printf '[bastion-session] FAIL: %s\n' "$1" >&2
  exit 1
}

log() {
  printf '[bastion-session] %s\n' "$1"
}

normalize_oci_json() {
  python3 -c '
import sys
text = sys.stdin.read()
if not text.strip():
    raise SystemExit("OCI command returned empty output")
start = text.find("{")
if start < 0:
    raise SystemExit("OCI command returned no JSON object")
sys.stdout.write(text[start:])
'
}

normalize_oci_list_json() {
  python3 -c '
import sys
text = sys.stdin.read()
if not text.strip():
    # OCI CLI 3.90.2 returns an empty stdout with exit 0 for a successful
    # filtered session list containing zero rows. pipefail still rejects a
    # non-zero OCI command before this normalizer can create the empty list.
    sys.stdout.write("{\"data\":[]}")
    raise SystemExit(0)
start = text.find("{")
if start < 0:
    raise SystemExit("OCI command returned no JSON object")
sys.stdout.write(text[start:])
'
}

for command_name in curl oci python3; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is required"
done

[[ -r "$SSH_PUBLIC_KEY_FILE" ]] || fail "SSH public key file is not readable"
[[ "$TARGET_PORT" =~ ^[0-9]+$ ]] || fail "TARGET_PORT must be numeric"
[[ "$MIN_REMAINING_SECONDS" =~ ^[0-9]+$ ]] || fail "MIN_REMAINING_SECONDS must be numeric"

imds_get() {
  local path="$1"
  curl --fail --silent --show-error --location \
    --retry 3 --retry-delay 1 \
    --header 'Authorization: Bearer Oracle' \
    "http://169.254.169.254/opc/v2/${path}"
}

instance_json="$(imds_get 'instance/')"
vnic_json="$(imds_get 'vnics/')"

read -r instance_id compartment_id region < <(
  python3 -c '
import json, sys
obj = json.load(sys.stdin)
values = [obj.get("id"), obj.get("compartmentId"), obj.get("canonicalRegionName") or obj.get("region")]
if not all(values):
    raise SystemExit("missing required instance metadata")
print(*values)
' <<<"$instance_json"
)

private_ip="$(
  python3 -c '
import json, sys
items = json.load(sys.stdin)
if not items:
    raise SystemExit("no VNIC metadata found")
primary = sorted(items, key=lambda item: item.get("nicIndex", 0))[0]
value = primary.get("privateIp")
if not value:
    raise SystemExit("primary VNIC privateIp missing")
print(value)
' <<<"$vnic_json"
)"

bastion_json="$(
  oci bastion bastion list \
    --auth instance_principal \
    --region "$region" \
    --compartment-id "$compartment_id" \
    --name "$BASTION_NAME" \
    --bastion-lifecycle-state ACTIVE \
    --all \
    --output json \
  | normalize_oci_json
)"

bastion_id="$(
  python3 -c '
import json, sys
items = json.load(sys.stdin).get("data", [])
if len(items) != 1:
    raise SystemExit(f"expected exactly one active bastion, got {len(items)}")
value = items[0].get("id")
if not value:
    raise SystemExit("bastion id missing")
print(value)
' <<<"$bastion_json"
)"

bastion_detail_json="$(
  oci bastion bastion get \
    --auth instance_principal \
    --region "$region" \
    --bastion-id "$bastion_id" \
    --output json \
  | normalize_oci_json
)"

max_ttl="$(
  python3 -c '
import json, sys
value = json.load(sys.stdin).get("data", {}).get("max-session-ttl-in-seconds")
if not value:
    raise SystemExit("bastion max session TTL missing")
print(value)
' <<<"$bastion_detail_json"
)"

[[ "$max_ttl" =~ ^[0-9]+$ ]] || fail "Bastion max session TTL is not numeric"
(( max_ttl >= 1800 && max_ttl <= 10800 )) || fail "unexpected Bastion max session TTL: $max_ttl"

latest_json="$(
  oci bastion session list \
    --auth instance_principal \
    --region "$region" \
    --bastion-id "$bastion_id" \
    --display-name "$SESSION_NAME" \
    --session-lifecycle-state ACTIVE \
    --sort-by timeCreated \
    --sort-order DESC \
    --limit 1 \
    --output json \
  | normalize_oci_list_json
)"

read -r session_id time_created remaining_seconds < <(
  python3 -c '
import datetime as dt
import json
import sys

max_ttl = int(sys.argv[1])
items = json.load(sys.stdin).get("data", [])
if not items:
    print("- - 0")
    raise SystemExit(0)
item = items[0]
created = item.get("time-created")
session_id = item.get("id")
if not created or not session_id:
    print("- - 0")
    raise SystemExit(0)
created_at = dt.datetime.fromisoformat(created.replace("Z", "+00:00"))
expires_at = created_at + dt.timedelta(seconds=max_ttl)
remaining = max(0, int((expires_at - dt.datetime.now(dt.timezone.utc)).total_seconds()))
print(session_id, created, remaining)
' "$max_ttl" <<<"$latest_json"
)

if [[ "$session_id" == "-" ]] || (( remaining_seconds <= MIN_REMAINING_SECONDS )); then
  log "creating a fresh port-forwarding session"
  session_id="$(
    oci bastion session create-port-forwarding \
      --auth instance_principal \
      --region "$region" \
      --bastion-id "$bastion_id" \
      --display-name "$SESSION_NAME" \
      --key-type PUB \
      --ssh-public-key-file "$SSH_PUBLIC_KEY_FILE" \
      --target-resource-id "$instance_id" \
      --target-private-ip "$private_ip" \
      --target-port "$TARGET_PORT" \
      --session-ttl "$max_ttl" \
      --query 'data.id' \
      --raw-output
  )"
  [[ "$session_id" == ocid1.bastionsession.* ]] || fail "OCI did not return a Bastion session OCID"
else
  log "reusing the active session; remaining lifetime is sufficient"
fi

session_json=''
for _ in $(seq 1 24); do
  session_json="$(
    oci bastion session get \
      --auth instance_principal \
      --region "$region" \
      --session-id "$session_id" \
      --output json \
    | normalize_oci_json
  )"
  lifecycle_state="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["lifecycle-state"])' <<<"$session_json")"
  case "$lifecycle_state" in
    ACTIVE)
      break
      ;;
    FAILED|DELETED|DELETING)
      fail "session entered lifecycle state $lifecycle_state"
      ;;
    CREATING)
      sleep 5
      ;;
    *)
      fail "unexpected session lifecycle state $lifecycle_state"
      ;;
  esac
done

[[ "${lifecycle_state:-}" == "ACTIVE" ]] || fail "session did not become ACTIVE in time"

read -r time_created session_ttl < <(
  python3 -c '
import json, sys
item = json.load(sys.stdin)["data"]
created = item.get("time-created")
ttl = item.get("session-ttl-in-seconds")
if not created or not ttl:
    raise SystemExit("session time-created or TTL missing")
print(created, ttl)
' <<<"$session_json"
)

install -d -m 0700 "$(dirname "$OUTPUT_FILE")"
python3 - "$OUTPUT_FILE" "$session_id" "$bastion_id" "$BASTION_NAME" "$region" "$instance_id" "$private_ip" "$TARGET_PORT" "$time_created" "$session_ttl" <<'PY'
import datetime as dt
import json
import sys

(
    output_file,
    session_id,
    bastion_id,
    bastion_name,
    region,
    instance_id,
    private_ip,
    target_port,
    time_created,
    session_ttl,
) = sys.argv[1:]
created_at = dt.datetime.fromisoformat(time_created.replace("Z", "+00:00"))
expires_at = created_at + dt.timedelta(seconds=int(session_ttl))
value = {
    "schema_version": 1,
    "session_id": session_id,
    "bastion_id": bastion_id,
    "bastion_name": bastion_name,
    "bastion_host": f"host.bastion.{region}.oci.oraclecloud.com",
    "region": region,
    "target_instance_id": instance_id,
    "target_private_ip": private_ip,
    "target_port": int(target_port),
    "lifecycle_state": "ACTIVE",
    "time_created": time_created,
    "session_ttl_in_seconds": int(session_ttl),
    "expires_at": expires_at.isoformat().replace("+00:00", "Z"),
}
with open(output_file, "w", encoding="utf-8") as file:
    json.dump(value, file, indent=2, sort_keys=True)
    file.write("\n")
PY
chmod 0600 "$OUTPUT_FILE"

log "active session metadata written without exposing the session OCID in logs"
