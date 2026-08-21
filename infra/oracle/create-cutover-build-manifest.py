#!/usr/bin/env python3
"""Create secret-free evidence for a self-host-targeted Next.js build."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tempfile
from collections.abc import Sequence


PUBLIC_KEYS = (
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
)
BUILD_SHA = re.compile(r"^[0-9a-f]{40}$")
MANIFEST_FORMAT = 1


class ManifestError(RuntimeError):
    pass


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create format-1 Aura cutover build evidence",
    )
    parser.add_argument("--build-sha", required=True)
    parser.add_argument(
        "--app-artifact",
        "--app-server-artifact",
        dest="app_artifact",
        required=True,
        type=Path,
        help="standalone Next.js server.js",
    )
    parser.add_argument(
        "--engine-artifact",
        "--play-server-artifact",
        dest="engine_artifact",
        required=True,
        type=Path,
        help="compiled play-server binary",
    )
    parser.add_argument(
        "--bundle-artifact",
        "--archive-artifact",
        dest="bundle_artifact",
        type=Path,
        help="optional final bundle or archive",
    )
    parser.add_argument("--output", required=True, type=Path)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--write", action="store_true")
    return parser.parse_args(argv)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def regular_file(path: Path, label: str) -> None:
    try:
        info = os.lstat(path)
    except OSError as exc:
        raise ManifestError(f"{label} inspection failed (errno={exc.errno})") from None
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        raise ManifestError(f"{label} must be a regular non-symlink file")


def public_hashes(environment: dict[str, str]) -> dict[str, str]:
    result: dict[str, str] = {}
    for key in PUBLIC_KEYS:
        value = environment.get(key)
        if not isinstance(value, str) or not value or value != value.strip():
            raise ManifestError(f"required build environment is missing: {key}")
        if any(ord(character) < 0x20 or ord(character) == 0x7F for character in value):
            raise ManifestError(f"build environment contains control characters: {key}")
        result[key] = hashlib.sha256(value.encode("utf-8")).hexdigest()
    return result


def atomic_json(path: Path, value: dict[str, object]) -> None:
    parent = path.parent
    if path.is_symlink() or parent.is_symlink() or not parent.is_dir():
        raise ManifestError("output path is unsafe")
    descriptor, name = tempfile.mkstemp(prefix=".cutover-build-", dir=parent)
    temporary: Path | None = Path(name)
    try:
        fchmod = getattr(os, "fchmod", None)
        if fchmod is not None:
            fchmod(descriptor, 0o600)
        else:
            os.chmod(temporary, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            descriptor = -1
            json.dump(value, handle, sort_keys=True, separators=(",", ":"))
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        if os.path.lexists(path):
            regular_file(path, "existing output")
        os.replace(temporary, path)
        temporary = None
        os.chmod(path, 0o600)
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        if temporary is not None and temporary.exists():
            temporary.unlink()


def run(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    if BUILD_SHA.fullmatch(args.build_sha) is None:
        raise ManifestError("build SHA must be 40 lowercase hexadecimal characters")
    if args.dry_run:
        print("[cutover-build-manifest] dry-run=valid mutations=none")
        return 0

    regular_file(args.app_artifact, "app server.js artifact")
    regular_file(args.engine_artifact, "play-server artifact")
    if args.bundle_artifact is not None:
        regular_file(args.bundle_artifact, "bundle/archive artifact")

    document: dict[str, object] = {
        "format": MANIFEST_FORMAT,
        "build_sha": args.build_sha,
        "app_server_sha256": sha256_file(args.app_artifact),
        "play_server_sha256": sha256_file(args.engine_artifact),
        "public_env_sha256": public_hashes(dict(os.environ)),
    }
    if args.bundle_artifact is not None:
        document["bundle_sha256"] = sha256_file(args.bundle_artifact)
    atomic_json(args.output, document)
    print("[cutover-build-manifest] write=complete values=redacted")
    return 0


def main() -> int:
    try:
        return run()
    except ManifestError as exc:
        print(f"[cutover-build-manifest] FAIL: {exc}", file=os.sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
