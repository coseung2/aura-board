#!/usr/bin/env python3

from __future__ import annotations

import argparse
import datetime as dt
import errno
import os
from pathlib import Path
import re
import stat
import tempfile
from collections.abc import Sequence
from typing import NoReturn


PUBLIC_URL = "https://supabase.aura-board.com"
TARGET_VALUES = {
    "SUPABASE_PUBLIC_URL": PUBLIC_URL,
    "API_EXTERNAL_URL": f"{PUBLIC_URL}/auth/v1",
}
TARGET_ASSIGNMENT = re.compile(
    rb"^[ \t]*(?:export[ \t]+)?(SUPABASE_PUBLIC_URL|API_EXTERNAL_URL)[ \t]*="
)
UNSUPPORTED_SYNC_ERRNOS = frozenset(
    value
    for value in (
        getattr(errno, "EINVAL", None),
        getattr(errno, "ENOTSUP", None),
        getattr(errno, "EOPNOTSUPP", None),
    )
    if value is not None
)


class SafeArgumentParser(argparse.ArgumentParser):
    def error(self, _message: str) -> NoReturn:
        raise SystemExit("[supabase-public-url] FAIL: invalid command-line arguments")


def fail(message: str) -> NoReturn:
    raise SystemExit(f"[supabase-public-url] FAIL: {message}")


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = SafeArgumentParser(
        description=(
            "Atomically configure the stable public URL in an existing self-hosted "
            "Supabase Docker env file."
        )
    )
    parser.add_argument("--env-file", required=True, type=Path)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--write", action="store_true")
    return parser.parse_args(argv)


def validate_regular_file(path: Path) -> None:
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


def read_file(path: Path) -> bytes:
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    descriptor: int | None = None
    try:
        descriptor = os.open(path, flags)
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode):
            fail("env file is not a regular file")
        with os.fdopen(descriptor, "rb") as handle:
            descriptor = None
            return handle.read()
    except OSError as exc:
        if exc.errno == getattr(errno, "ELOOP", None):
            fail("refusing symlink env file")
        fail(f"could not read env file (errno={exc.errno})")
    finally:
        if descriptor is not None:
            os.close(descriptor)


def line_ending(line: bytes) -> bytes:
    if line.endswith(b"\r\n"):
        return b"\r\n"
    if line.endswith(b"\n"):
        return b"\n"
    if line.endswith(b"\r"):
        return b"\r"
    return b""


def update_content(content: bytes) -> bytes:
    newline = next(
        (
            ending
            for line in content.splitlines(keepends=True)
            if (ending := line_ending(line))
        ),
        b"\n",
    )
    seen: set[str] = set()
    rendered: list[bytes] = []
    for line in content.splitlines(keepends=True):
        match = TARGET_ASSIGNMENT.match(line)
        if match is None:
            rendered.append(line)
            continue
        key = match.group(1).decode("ascii")
        if key in seen:
            continue
        seen.add(key)
        rendered.append(
            f"{key}={TARGET_VALUES[key]}".encode("utf-8")
            + (line_ending(line) or newline)
        )
    for key, value in TARGET_VALUES.items():
        if key in seen:
            continue
        if rendered and not line_ending(rendered[-1]):
            rendered.append(newline)
        rendered.append(f"{key}={value}".encode("utf-8") + newline)
    return b"".join(rendered)


def sync_descriptor(descriptor: int) -> None:
    try:
        os.fsync(descriptor)
    except OSError as exc:
        if exc.errno not in UNSUPPORTED_SYNC_ERRNOS:
            raise


def write_all(descriptor: int, content: bytes) -> None:
    view = memoryview(content)
    while view:
        written = os.write(descriptor, view)
        if written <= 0:
            raise OSError(errno.EIO, "short write")
        view = view[written:]
    sync_descriptor(descriptor)


def sync_directory(directory: Path) -> None:
    flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_BINARY", 0)
    descriptor: int | None = None
    try:
        descriptor = os.open(directory, flags)
        sync_descriptor(descriptor)
    except OSError as exc:
        if os.name != "nt" and exc.errno not in UNSUPPORTED_SYNC_ERRNOS:
            raise
    finally:
        if descriptor is not None:
            os.close(descriptor)


def create_backup(path: Path, content: bytes) -> Path:
    timestamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup = path.parent / f"{path.name}.backup-public-url-{timestamp}"
    descriptor = os.open(
        backup,
        os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0),
        0o600,
    )
    try:
        os.chmod(backup, 0o600)
        write_all(descriptor, content)
    except OSError:
        os.close(descriptor)
        try:
            os.unlink(backup)
        except OSError:
            pass
        raise
    os.close(descriptor)
    return backup


def atomic_replace(path: Path, content: bytes) -> None:
    descriptor: int | None = None
    temporary: Path | None = None
    try:
        descriptor, name = tempfile.mkstemp(prefix=".supabase-public-url-", dir=path.parent)
        temporary = Path(name)
        os.chmod(temporary, 0o600)
        write_all(descriptor, content)
        os.close(descriptor)
        descriptor = None
        os.replace(temporary, path)
        temporary = None
        os.chmod(path, 0o600)
        sync_directory(path.parent)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        if temporary is not None:
            try:
                os.unlink(temporary)
            except FileNotFoundError:
                pass


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    validate_regular_file(args.env_file)
    if args.dry_run:
        print(f"[supabase-public-url] env_path={args.env_file}")
        print(
            "[supabase-public-url] planned_keys="
            + ",".join(TARGET_VALUES)
            + " mutations=none"
        )
        return 0

    try:
        original = read_file(args.env_file)
        updated = update_content(original)
        backup = create_backup(args.env_file, original)
        sync_directory(args.env_file.parent)
        atomic_replace(args.env_file, updated)
    except OSError as exc:
        fail(f"could not update env file (errno={exc.errno})")
    print(f"[supabase-public-url] updated env_path={args.env_file} backup={backup}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
