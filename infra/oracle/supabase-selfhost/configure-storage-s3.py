#!/usr/bin/env python3

from __future__ import annotations

import argparse
import datetime as dt
import errno
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
import unicodedata
from collections.abc import Sequence
from typing import NoReturn
from urllib.parse import SplitResult, urlsplit


DEFAULT_REGION = "ap-osaka-1"
COMPOSE_SAFE_CREDENTIAL = re.compile(r"^[A-Za-z0-9._~+/=-]+$")
TARGET_KEYS = (
    "STORAGE_BACKEND",
    "GLOBAL_S3_BUCKET",
    "GLOBAL_S3_ENDPOINT",
    "GLOBAL_S3_PROTOCOL",
    "GLOBAL_S3_FORCE_PATH_STYLE",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "REGION",
)
TARGET_ASSIGNMENT = re.compile(
    rb"^[ \t]*(?:export[ \t]+)?(STORAGE_BACKEND|GLOBAL_S3_BUCKET|"
    rb"GLOBAL_S3_ENDPOINT|GLOBAL_S3_PROTOCOL|GLOBAL_S3_FORCE_PATH_STYLE|AWS_ACCESS_KEY_ID|"
    rb"AWS_SECRET_ACCESS_KEY|REGION)[ \t]*="
)
UNSUPPORTED_FSYNC_ERRNOS = frozenset(
    errno_value
    for errno_value in (
        getattr(errno, "EINVAL", None),
        getattr(errno, "ENOTSUP", None),
        getattr(errno, "EOPNOTSUPP", None),
    )
    if errno_value is not None
)


class SafeArgumentParser(argparse.ArgumentParser):
    """Never let argparse echo an unknown argument or its value."""

    def error(self, _message: str) -> NoReturn:
        raise SystemExit("[storage-s3] FAIL: invalid command-line arguments")


def fail(message: str) -> NoReturn:
    raise SystemExit(f"[storage-s3] FAIL: {message}")


def contains_control_character(value: str) -> bool:
    return any(unicodedata.category(character) in {"Cc", "Cs"} for character in value)


def validate_value(value: str, label: str) -> str:
    if not value or not value.strip():
        fail(f"{label} must not be empty")
    if contains_control_character(value):
        fail(f"{label} contains control characters")
    return value


def validate_compose_credential(value: str, label: str) -> str:
    validate_value(value, label)
    if COMPOSE_SAFE_CREDENTIAL.fullmatch(value) is None:
        fail(f"{label} contains characters unsafe for Docker Compose dotenv")
    return value


def validate_endpoint(endpoint: str) -> SplitResult:
    validate_value(endpoint, "--endpoint")
    if any(character.isspace() for character in endpoint):
        fail("--endpoint contains whitespace")
    if "?" in endpoint:
        fail("--endpoint must not contain a query")
    if "#" in endpoint:
        fail("--endpoint must not contain a fragment")

    try:
        parsed = urlsplit(endpoint)
        hostname = parsed.hostname
        _ = parsed.port
    except ValueError:
        fail("--endpoint is malformed")

    if parsed.scheme.lower() != "https":
        fail("--endpoint must use https")
    if not parsed.netloc or not hostname:
        fail("--endpoint must include a host")
    if parsed.username is not None or parsed.password is not None:
        fail("--endpoint must not contain credentials")
    return parsed


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = SafeArgumentParser(
        description=(
            "Safely configure the OCI S3-compatible backend in an existing "
            "Supabase Docker .env file. Write-mode credentials are read only from stdin."
        )
    )
    parser.add_argument("--env-file", required=True, type=Path, help="existing Supabase Docker .env path")
    parser.add_argument("--bucket", required=True, help="OCI Object Storage bucket name")
    parser.add_argument("--endpoint", required=True, help="HTTPS OCI S3-compatible endpoint")
    parser.add_argument(
        "--region",
        default=DEFAULT_REGION,
        help=f"OCI region (default: {DEFAULT_REGION})",
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--dry-run",
        action="store_true",
        help="validate inputs and show the planned keys without reading stdin or changing files",
    )
    mode.add_argument(
        "--write",
        action="store_true",
        help="read credentials from stdin, create a private backup, and atomically update the env file",
    )
    return parser.parse_args(argv)


def validate_env_path(path: Path) -> None:
    try:
        info = os.lstat(path)
    except FileNotFoundError:
        fail("env file does not exist")
    except OSError as exc:
        fail(f"could not inspect env file (errno={exc.errno})")

    if stat.S_ISLNK(info.st_mode):
        fail("refusing symlink env file")
    if not stat.S_ISREG(info.st_mode):
        fail("env file is not a regular file")


def read_env_file(path: Path) -> bytes:
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0)
    fd: int | None = None
    try:
        fd = os.open(path, flags)
        info = os.fstat(fd)
        if stat.S_ISLNK(info.st_mode):
            fail("refusing symlink env file")
        if not stat.S_ISREG(info.st_mode):
            fail("env file is not a regular file")
        with os.fdopen(fd, "rb") as handle:
            fd = None
            return handle.read()
    except FileNotFoundError:
        fail("env file does not exist")
    except OSError as exc:
        if exc.errno in {getattr(errno, "ELOOP", None)}:
            fail("refusing symlink env file")
        fail(f"could not read env file (errno={exc.errno})")
    finally:
        if fd is not None:
            os.close(fd)


def _line_ending(line: bytes) -> bytes:
    if line.endswith(b"\r\n"):
        return b"\r\n"
    if line.endswith(b"\n"):
        return b"\n"
    if line.endswith(b"\r"):
        return b"\r"
    return b""


def preferred_newline(content: bytes) -> bytes:
    for line in content.splitlines(keepends=True):
        ending = _line_ending(line)
        if ending:
            return ending
    return b"\n"


def update_env_content(content: bytes, values: dict[str, str]) -> bytes:
    newline = preferred_newline(content)
    seen: set[str] = set()
    updated_lines: list[bytes] = []

    for line in content.splitlines(keepends=True):
        match = TARGET_ASSIGNMENT.match(line)
        if match is None:
            updated_lines.append(line)
            continue

        key = match.group(1).decode("ascii")
        if key in seen:
            continue
        seen.add(key)
        ending = _line_ending(line) or newline
        updated_lines.append(f"{key}={values[key]}".encode("utf-8") + ending)

    for key in TARGET_KEYS:
        if key in seen:
            continue
        if updated_lines and not _line_ending(updated_lines[-1]):
            updated_lines.append(newline)
        updated_lines.append(f"{key}={values[key]}".encode("utf-8") + newline)

    return b"".join(updated_lines)


def duplicate_field_rejector(pairs: list[tuple[object, object]]) -> dict[object, object]:
    result: dict[object, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate field")
        result[key] = value
    return result


def read_secret_values() -> tuple[str, str]:
    try:
        payload = sys.stdin.read()
    except (OSError, UnicodeError):
        fail("could not read secret JSON from stdin")

    try:
        parsed = json.loads(payload, object_pairs_hook=duplicate_field_rejector)
    except (TypeError, ValueError, UnicodeError, RecursionError):
        fail("stdin must contain exactly accessKeyId and secretAccessKey as JSON strings")

    if not isinstance(parsed, dict) or set(parsed) != {"accessKeyId", "secretAccessKey"}:
        fail("stdin must contain exactly accessKeyId and secretAccessKey as JSON strings")

    access_key = parsed["accessKeyId"]
    secret_key = parsed["secretAccessKey"]
    if not isinstance(access_key, str) or not isinstance(secret_key, str):
        fail("stdin must contain exactly accessKeyId and secretAccessKey as JSON strings")
    validate_compose_credential(access_key, "accessKeyId")
    validate_compose_credential(secret_key, "secretAccessKey")
    return access_key, secret_key


def set_mode_0600(fd: int, path: Path) -> None:
    fchmod = getattr(os, "fchmod", None)
    if fchmod is not None:
        try:
            fchmod(fd, 0o600)
            return
        except OSError as exc:
            if exc.errno not in UNSUPPORTED_FSYNC_ERRNOS:
                raise
    os.chmod(path, 0o600)


def fsync_fd(fd: int) -> None:
    fsync = getattr(os, "fsync", None)
    if fsync is None:
        return
    try:
        fsync(fd)
    except OSError as exc:
        if exc.errno not in UNSUPPORTED_FSYNC_ERRNOS:
            raise


def write_and_sync(fd: int, content: bytes) -> None:
    view = memoryview(content)
    while view:
        written = os.write(fd, view)
        if written <= 0:
            raise OSError(errno.EIO, "short write")
        view = view[written:]
    fsync_fd(fd)


def fsync_directory(directory: Path) -> None:
    flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_BINARY", 0)
    fd: int | None = None
    try:
        fd = os.open(directory, flags)
        fsync_fd(fd)
    except OSError as exc:
        if exc.errno not in UNSUPPORTED_FSYNC_ERRNOS and os.name != "nt":
            raise
    finally:
        if fd is not None:
            os.close(fd)


def fsync_path(path: Path) -> None:
    flags = os.O_RDWR | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    fd: int | None = None
    try:
        fd = os.open(path, flags)
        set_mode_0600(fd, path)
        fsync_fd(fd)
    finally:
        if fd is not None:
            os.close(fd)


def create_backup(path: Path, content: bytes) -> Path:
    timestamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    base = path.parent / f"{path.name}.backup-{timestamp}"
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0)

    for suffix in range(1000):
        backup_path = base if suffix == 0 else path.parent / f"{base.name}-{suffix}"
        fd: int | None = None
        try:
            fd = os.open(backup_path, flags, 0o600)
            set_mode_0600(fd, backup_path)
            write_and_sync(fd, content)
            return_path = backup_path
            os.close(fd)
            fd = None
            return return_path
        except FileExistsError:
            if fd is not None:
                os.close(fd)
            continue
        except OSError:
            if fd is not None:
                os.close(fd)
            try:
                os.unlink(backup_path)
            except OSError:
                pass
            raise

    raise OSError(errno.EEXIST, "could not allocate a unique backup name")


def atomic_replace(path: Path, content: bytes) -> None:
    temp_path: Path | None = None
    fd: int | None = None
    try:
        fd, temp_name = tempfile.mkstemp(prefix=".aura-storage-s3-", dir=path.parent)
        temp_path = Path(temp_name)
        set_mode_0600(fd, temp_path)
        write_and_sync(fd, content)
        os.close(fd)
        fd = None
        os.replace(temp_path, path)
        temp_path = None
        fsync_path(path)
        fsync_directory(path.parent)
    finally:
        if fd is not None:
            os.close(fd)
        if temp_path is not None:
            try:
                os.unlink(temp_path)
            except FileNotFoundError:
                pass


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    validate_value(str(args.env_file), "--env-file")
    bucket = validate_value(args.bucket, "--bucket")
    region = validate_value(args.region, "--region")
    endpoint = validate_endpoint(args.endpoint)
    validate_env_path(args.env_file)

    if args.dry_run:
        print(f"env_path={args.env_file}")
        print(f"bucket={bucket}")
        print(f"endpoint_host={endpoint.hostname}")
        print(f"region={region}")
        print(f"planned_keys={','.join(TARGET_KEYS)}")
        return 0

    access_key, secret_key = read_secret_values()
    values = {
        "STORAGE_BACKEND": "s3",
        "GLOBAL_S3_BUCKET": bucket,
        "GLOBAL_S3_ENDPOINT": args.endpoint,
        "GLOBAL_S3_PROTOCOL": "https",
        "GLOBAL_S3_FORCE_PATH_STYLE": "true",
        "AWS_ACCESS_KEY_ID": access_key,
        "AWS_SECRET_ACCESS_KEY": secret_key,
        "REGION": region,
    }

    try:
        original = read_env_file(args.env_file)
        updated = update_env_content(original, values)
        backup = create_backup(args.env_file, original)
        fsync_directory(args.env_file.parent)
        atomic_replace(args.env_file, updated)
    except OSError as exc:
        fail(f"could not update env file (errno={exc.errno})")

    print(f"[storage-s3] updated env_path={args.env_file} backup={backup}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
