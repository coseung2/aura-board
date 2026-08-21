#!/usr/bin/env python3
"""Coordinate the Aura Board runtime cutover state machine.

The command does not start or restart services.  Its required operational
sequence is: write -> build/deploy gate -> seal-before-writers -> start
services.  Rollback is accepted only before the seal.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys
from collections.abc import Sequence
from typing import NoReturn

_LIB_DIR = Path(__file__).resolve().parent
if os.fspath(_LIB_DIR) not in sys.path:
    sys.path.insert(0, os.fspath(_LIB_DIR))

from production_cutover_runtime_lib import (  # noqa: E402
    CutoverError,
    action_from_args,
    execute,
)


class SafeArgumentParser(argparse.ArgumentParser):
    def error(self, _message: str) -> NoReturn:
        raise SystemExit(
            "[production-cutover-runtime] FAIL: invalid command-line arguments"
        )


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = SafeArgumentParser(
        description=(
            "Switch Aura Board runtime env files to the verified Oracle self-host "
            "with a dry-run, write, rollback, or seal-before-writers action."
        ),
        epilog=(
            "Write and seal require --build-manifest from a fresh Next.js build; "
            "runtime --dry-run intentionally reads and validates the supplied DB "
            "evidence and environment files but never writes. Every action requires "
            "both DB evidence files. Seal also requires "
            "immutable deployed releases, active release symlinks, the complete "
            "fixed stopped-service/container sets, and the fixed production cron "
            "path to be absent. "
            "The command never starts services or deploys an application. "
            "Rollback is permanently unavailable after --seal-before-writers."
        ),
    )
    parser.add_argument(
        "--db-promotion-manifest",
        required=True,
        type=Path,
    )
    parser.add_argument(
        "--db-rich-journal",
        required=True,
        type=Path,
        help="format-2 rich promotion journal whose raw bytes are hashed by the promotion manifest",
    )
    parser.add_argument("--app-env", required=True, type=Path)
    parser.add_argument("--backup-env", required=True, type=Path)
    parser.add_argument("--selfhost-env", required=True, type=Path)
    parser.add_argument("--state-dir", required=True, type=Path)
    parser.add_argument(
        "--build-manifest",
        type=Path,
        help="format-1 fresh Next.js build evidence; mandatory for --write and --seal-before-writers",
    )
    parser.add_argument(
        "--deployed-app-release",
        type=Path,
        help="immutable deployed app release; mandatory for --seal-before-writers",
    )
    parser.add_argument(
        "--deployed-engine-release",
        type=Path,
        help="immutable deployed play-engine release; mandatory for --seal-before-writers",
    )
    parser.add_argument(
        "--active-app-release",
        type=Path,
        help="active app symlink; mandatory for --seal-before-writers",
    )
    parser.add_argument(
        "--active-engine-release",
        type=Path,
        help="active play-engine symlink; mandatory for --seal-before-writers",
    )
    parser.add_argument(
        "--required-stopped-service",
        action="append",
        default=[],
        metavar="UNIT",
        help="systemd writer unit that must report inactive at seal; repeat for each unit",
    )
    parser.add_argument(
        "--required-stopped-container",
        action="append",
        default=[],
        metavar="CONTAINER",
        help="production self-host container that must report stopped at seal; repeat for each container",
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--dry-run",
        action="store_true",
        help="intentionally read and validate supplied metadata, source names, and exact DB evidence files; never write",
    )
    mode.add_argument(
        "--write",
        action="store_true",
        help="write both runtime env files with exact backups; requires --build-manifest",
    )
    mode.add_argument(
        "--rollback",
        action="store_true",
        help="restore both exact backups while the pre-seal rollback window is open",
    )
    mode.add_argument(
        "--seal-before-writers",
        action="store_true",
        help="permanently close rollback before any production writer or service starts",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    try:
        args = parse_args(argv)
        # Resolve the action here so malformed combinations are represented by
        # the same small coordinator path used by tests and operators.
        action_from_args(args)
        execute(args)
        return 0
    except CutoverError as exc:
        print(f"[production-cutover-runtime] FAIL: {exc}", file=sys.stderr)
        return 1
    except OSError as exc:
        print(
            f"[production-cutover-runtime] FAIL: unexpected filesystem error (errno={exc.errno})",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
