#!/usr/bin/env python3
"""Create or reuse a named OCI Bastion port-forwarding session."""

from __future__ import annotations

import argparse
import configparser
import datetime as dt
import json
import os
import stat
import subprocess
import sys
import tempfile
import time
from collections.abc import Sequence
from typing import Any


DEFAULT_REGION = "ap-osaka-1"
DEFAULT_MINIMUM_REMAINING_SECONDS = 1200
TARGET_PORT = 22
OCI_CONNECTION_TIMEOUT_SECONDS = "10"
OCI_READ_TIMEOUT_SECONDS = "30"
OCI_PROCESS_TIMEOUT_SECONDS = 45
SESSION_POLL_ATTEMPTS = 24
SESSION_POLL_INTERVAL_SECONDS = 5


class OperatorError(Exception):
    """An expected operator-facing failure with no sensitive detail."""


def _non_negative_integer(value: str) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be a non-negative integer") from exc
    if parsed < 0:
        raise argparse.ArgumentTypeError("must be a non-negative integer")
    return parsed


def _required_text(value: Any) -> str:
    if not isinstance(value, str) or not value:
        raise OperatorError("OCI response was missing required data")
    return value


def _required_integer(value: Any) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise OperatorError("OCI response contained invalid numeric data")
    return value


def _parse_timestamp(value: Any) -> dt.datetime:
    if not isinstance(value, str) or not value:
        raise OperatorError("OCI response contained invalid timestamp data")
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise OperatorError("OCI response contained invalid timestamp data") from exc
    if parsed.tzinfo is None:
        raise OperatorError("OCI response contained invalid timestamp data")
    return parsed


def _data_list(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        raise OperatorError("OCI response contained invalid list data")
    items = payload["data"]
    if not all(isinstance(item, dict) for item in items):
        raise OperatorError("OCI response contained invalid list data")
    return items


def _data_object(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), dict):
        raise OperatorError("OCI response contained invalid object data")
    return payload["data"]


def run_oci(argv: Sequence[str]) -> str:
    """Run one bounded OCI CLI command without exposing its stderr."""

    try:
        completed = subprocess.run(
            list(argv),
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=OCI_PROCESS_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise OperatorError("OCI command failed") from exc
    if completed.returncode != 0:
        raise OperatorError("OCI command failed")
    return completed.stdout


def _json_response(raw: str, *, allow_empty_list: bool = False) -> Any:
    if not raw.strip():
        if allow_empty_list:
            return {"data": []}
        raise OperatorError("OCI returned invalid JSON")
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError) as exc:
        raise OperatorError("OCI returned invalid JSON") from exc


class OciClient:
    def __init__(self, profile: str, region: str) -> None:
        self.profile = profile
        self.region = region

    def _argv(self, *command: str) -> list[str]:
        return [
            "oci",
            *command,
            "--profile",
            self.profile,
            "--region",
            self.region,
            "--no-retry",
            "--connection-timeout",
            OCI_CONNECTION_TIMEOUT_SECONDS,
            "--read-timeout",
            OCI_READ_TIMEOUT_SECONDS,
            "--output",
            "json",
        ]

    def json(self, *command: str, allow_empty_list: bool = False) -> Any:
        return _json_response(
            run_oci(self._argv(*command)), allow_empty_list=allow_empty_list
        )


def _tenancy_from_profile(profile: str) -> str:
    config_path = os.environ.get("OCI_CLI_CONFIG_FILE")
    if not config_path:
        config_path = os.path.join(os.path.expanduser("~"), ".oci", "config")

    parser = configparser.ConfigParser(interpolation=None)
    try:
        with open(config_path, encoding="utf-8") as config_file:
            parser.read_file(config_file)
    except (OSError, configparser.Error) as exc:
        raise OperatorError("OCI profile could not be read") from exc

    try:
        section = parser[profile]
        tenancy = section.get("tenancy", "")
    except KeyError as exc:
        raise OperatorError("OCI profile could not be read") from exc
    if not tenancy:
        raise OperatorError("OCI profile could not be read")
    return tenancy


def _find_instance(client: OciClient, tenancy: str, instance_name: str) -> str:
    payload = client.json(
        "compute",
        "instance",
        "list",
        "--compartment-id",
        tenancy,
        "--display-name",
        instance_name,
        "--lifecycle-state",
        "RUNNING",
        "--all",
    )
    items = _data_list(payload)
    if len(items) != 1:
        raise OperatorError("expected exactly one running instance")
    item = items[0]
    if item.get("lifecycle-state") != "RUNNING":
        raise OperatorError("expected exactly one running instance")
    return _required_text(item.get("id"))


def _find_primary_private_ip(
    client: OciClient, tenancy: str, instance_id: str
) -> str:
    payload = client.json(
        "compute",
        "vnic-attachment",
        "list",
        "--compartment-id",
        tenancy,
        "--instance-id",
        instance_id,
        "--all",
    )
    attachments = _data_list(payload)
    primary = [
        item
        for item in attachments
        if item.get("nic-index") == 0 and item.get("lifecycle-state") == "ATTACHED"
    ]
    if len(primary) != 1:
        raise OperatorError("expected exactly one attached primary VNIC")
    vnic_id = _required_text(primary[0].get("vnic-id"))
    vnic = _data_object(
        client.json("network", "vnic", "get", "--vnic-id", vnic_id)
    )
    if vnic.get("is-primary") is not True:
        raise OperatorError("expected exactly one attached primary VNIC")
    return _required_text(vnic.get("private-ip"))


def _find_bastion(client: OciClient, tenancy: str, bastion_name: str) -> str:
    payload = client.json(
        "bastion",
        "bastion",
        "list",
        "--compartment-id",
        tenancy,
        "--name",
        bastion_name,
        "--bastion-lifecycle-state",
        "ACTIVE",
        "--all",
    )
    items = _data_list(payload)
    if len(items) != 1:
        raise OperatorError("expected exactly one active bastion")
    item = items[0]
    if item.get("lifecycle-state") != "ACTIVE":
        raise OperatorError("expected exactly one active bastion")
    return _required_text(item.get("id"))


def _bastion_max_ttl(client: OciClient, bastion_id: str) -> int:
    payload = client.json("bastion", "bastion", "get", "--bastion-id", bastion_id)
    ttl = _required_integer(_data_object(payload).get("max-session-ttl-in-seconds"))
    if ttl < 1800 or ttl > 10800:
        raise OperatorError("Bastion max session TTL was outside the supported range")
    return ttl


def _active_named_sessions(
    client: OciClient, bastion_id: str, session_name: str
) -> list[dict[str, Any]]:
    payload = client.json(
        "bastion",
        "session",
        "list",
        "--bastion-id",
        bastion_id,
        "--display-name",
        session_name,
        "--session-lifecycle-state",
        "ACTIVE",
        "--sort-by",
        "timeCreated",
        "--sort-order",
        "DESC",
        "--limit",
        "1",
        allow_empty_list=True,
    )
    sessions = _data_list(payload)
    for session in sessions:
        if session.get("lifecycle-state") != "ACTIVE":
            raise OperatorError("OCI response contained an invalid session")
        _required_text(session.get("id"))
        _parse_timestamp(session.get("time-created"))
    return sorted(
        sessions,
        key=lambda item: _parse_timestamp(item["time-created"]),
        reverse=True,
    )


def _remaining_seconds(created_at: dt.datetime, ttl: int) -> int:
    expires_at = created_at + dt.timedelta(seconds=ttl)
    return max(0, int((expires_at - dt.datetime.now(dt.timezone.utc)).total_seconds()))


def _create_session(
    client: OciClient,
    bastion_id: str,
    session_name: str,
    ssh_public_key_file: str,
    instance_id: str,
    private_ip: str,
    max_ttl: int,
) -> str:
    payload = client.json(
        "bastion",
        "session",
        "create-port-forwarding",
        "--bastion-id",
        bastion_id,
        "--display-name",
        session_name,
        "--key-type",
        "PUB",
        "--ssh-public-key-file",
        ssh_public_key_file,
        "--target-resource-id",
        instance_id,
        "--target-private-ip",
        private_ip,
        "--target-port",
        str(TARGET_PORT),
        "--session-ttl",
        str(max_ttl),
    )
    session_id = _required_text(_data_object(payload).get("id"))
    if not session_id.startswith("ocid1.bastionsession."):
        raise OperatorError("OCI did not return a valid Bastion session")
    return session_id


def _get_active_session(client: OciClient, session_id: str) -> dict[str, Any]:
    for attempt in range(SESSION_POLL_ATTEMPTS):
        payload = client.json("bastion", "session", "get", "--session-id", session_id)
        session = _data_object(payload)
        lifecycle_state = session.get("lifecycle-state")
        if lifecycle_state == "ACTIVE":
            returned_session_id = _required_text(session.get("id"))
            if returned_session_id != session_id:
                raise OperatorError("OCI response contained an invalid session")
            _parse_timestamp(session.get("time-created"))
            _required_integer(session.get("session-ttl-in-seconds"))
            return session
        if lifecycle_state not in {"CREATING", "UPDATING"}:
            raise OperatorError("Bastion session did not become active")
        if attempt + 1 < SESSION_POLL_ATTEMPTS:
            time.sleep(SESSION_POLL_INTERVAL_SECONDS)
    raise OperatorError("Bastion session did not become active in time")


def _validate_public_key_file(path: str) -> str:
    value = os.path.abspath(os.path.expanduser(path))
    try:
        file_stat = os.lstat(value)
    except OSError as exc:
        raise OperatorError("SSH public key file is not a readable regular file") from exc
    if stat.S_ISLNK(file_stat.st_mode) or not stat.S_ISREG(file_stat.st_mode):
        raise OperatorError("SSH public key file is not a readable regular file")
    if not os.access(value, os.R_OK):
        raise OperatorError("SSH public key file is not a readable regular file")
    return value


def _ensure_output_parent(path: str) -> str:
    output_path = os.path.abspath(os.path.expanduser(path))
    parent = os.path.dirname(output_path)
    if not os.path.basename(output_path):
        raise OperatorError("metadata output path is invalid")

    drive, tail = os.path.splitdrive(parent)
    if tail.startswith(os.sep):
        current = drive + os.sep
        components = [part for part in tail.split(os.sep) if part]
    else:
        current = drive or os.curdir
        components = [part for part in tail.split(os.sep) if part]

    try:
        for component in components:
            current = os.path.join(current, component)
            if os.path.lexists(current):
                current_stat = os.lstat(current)
                if stat.S_ISLNK(current_stat.st_mode) or not stat.S_ISDIR(
                    current_stat.st_mode
                ):
                    raise OperatorError("metadata output parent is not a safe directory")
            else:
                os.mkdir(current, 0o700)
        if os.path.lexists(output_path):
            output_stat = os.lstat(output_path)
            if stat.S_ISLNK(output_stat.st_mode) or not stat.S_ISREG(output_stat.st_mode):
                raise OperatorError("metadata output is not a regular file")
    except OperatorError:
        raise
    except OSError as exc:
        raise OperatorError("metadata output parent could not be prepared") from exc
    return output_path


def _write_metadata(path: str, value: dict[str, Any]) -> None:
    output_path = _ensure_output_parent(path)
    parent = os.path.dirname(output_path)
    temporary_path: str | None = None
    file_descriptor: int | None = None
    try:
        file_descriptor, temporary_path = tempfile.mkstemp(
            prefix=".bastion-session-", dir=parent
        )
        os.chmod(temporary_path, 0o600)
        with os.fdopen(file_descriptor, "w", encoding="utf-8") as output_file:
            file_descriptor = None
            json.dump(value, output_file, indent=2, sort_keys=True)
            output_file.write("\n")
            output_file.flush()
            os.fsync(output_file.fileno())
        os.replace(temporary_path, output_path)
        temporary_path = None
        os.chmod(output_path, 0o600)
    except OSError as exc:
        if file_descriptor is not None:
            try:
                os.close(file_descriptor)
            except OSError:
                pass
        if temporary_path is not None:
            try:
                os.unlink(temporary_path)
            except OSError:
                pass
        raise OperatorError("metadata output could not be written") from exc


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Create or reuse a named OCI Bastion port-forwarding session."
    )
    parser.add_argument("--profile", required=True)
    parser.add_argument("--region", default=DEFAULT_REGION)
    parser.add_argument("--instance-name", required=True)
    parser.add_argument("--bastion-name", required=True)
    parser.add_argument("--session-name", required=True)
    parser.add_argument("--ssh-public-key-file", required=True)
    parser.add_argument("--output-file", required=True)
    parser.add_argument(
        "--minimum-remaining-seconds",
        type=_non_negative_integer,
        default=DEFAULT_MINIMUM_REMAINING_SECONDS,
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    if not all(
        isinstance(value, str) and value
        for value in (
            args.profile,
            args.region,
            args.instance_name,
            args.bastion_name,
            args.session_name,
        )
    ):
        print("[bastion-session] FAIL: required text flag is empty", file=sys.stderr)
        return 1

    try:
        public_key_file = _validate_public_key_file(args.ssh_public_key_file)
        tenancy = _tenancy_from_profile(args.profile)
        client = OciClient(args.profile, args.region)
        instance_id = _find_instance(client, tenancy, args.instance_name)
        private_ip = _find_primary_private_ip(client, tenancy, instance_id)
        bastion_id = _find_bastion(client, tenancy, args.bastion_name)
        max_ttl = _bastion_max_ttl(client, bastion_id)
        sessions = _active_named_sessions(client, bastion_id, args.session_name)

        session_state = "created"
        if sessions:
            candidate = sessions[0]
            candidate_created = _parse_timestamp(candidate["time-created"])
            candidate_id = _required_text(candidate.get("id"))
            if _remaining_seconds(candidate_created, max_ttl) > args.minimum_remaining_seconds:
                session_id = candidate_id
                session_state = "reused"
            else:
                session_id = _create_session(
                    client,
                    bastion_id,
                    args.session_name,
                    public_key_file,
                    instance_id,
                    private_ip,
                    max_ttl,
                )
        else:
            session_id = _create_session(
                client,
                bastion_id,
                args.session_name,
                public_key_file,
                instance_id,
                private_ip,
                max_ttl,
            )

        session = _get_active_session(client, session_id)
        session_created = _required_text(session.get("time-created"))
        session_ttl = _required_integer(session.get("session-ttl-in-seconds"))
        created_at = _parse_timestamp(session_created)
        expires_at = created_at + dt.timedelta(seconds=session_ttl)
        metadata = {
            "schema_version": 1,
            "session_id": session_id,
            "bastion_id": bastion_id,
            "bastion_name": args.bastion_name,
            "bastion_host": f"host.bastion.{args.region}.oci.oraclecloud.com",
            "region": args.region,
            "target_instance_id": instance_id,
            "target_private_ip": private_ip,
            "target_port": TARGET_PORT,
            "lifecycle_state": "ACTIVE",
            "time_created": session_created,
            "session_ttl_in_seconds": session_ttl,
            "expires_at": expires_at.isoformat().replace("+00:00", "Z"),
        }
        _write_metadata(args.output_file, metadata)
    except OperatorError as exc:
        print(f"[bastion-session] FAIL: {exc}", file=sys.stderr)
        return 1

    print(f"[bastion-session] {session_state}")
    print("[bastion-session] active")
    print(f"[bastion-session] metadata path: {os.path.abspath(os.path.expanduser(args.output_file))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
