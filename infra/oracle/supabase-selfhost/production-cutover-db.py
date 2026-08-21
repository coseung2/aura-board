#!/usr/bin/env python3
"""Fail-closed candidate-database cutover coordinator for Aura Board."""

from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys


_LIB_DIR = Path(__file__).resolve().parent
if os.fspath(_LIB_DIR) not in sys.path:
    sys.path.insert(0, os.fspath(_LIB_DIR))

import production_cutover_db_lib as _lib  # noqa: E402
from production_cutover_db_lib import (  # noqa: E402,F401
    ACTIONS,
    CutoverError,
    DATA_SNAPSHOT_CONTRACT,
    MARKER_SQL,
    PROMOTION_MANIFEST_FILENAME,
    PROMOTION_MANIFEST_KEYS,
    SafeParser,
    ToolFailure,
    artifact_records_are_exact,
    auth_scope,
    compare_data_snapshots,
    compare_catalogs,
    compare_migrations,
    db_name,
    db_names,
    dispatch,
    entries,
    fence_equal,
    identity_from_marker,
    main as _implementation_main,
    metadata,
    parse_args,
    psql,
    qid,
    qlit,
    read_credentials,
    read_journal,
    recover_promotion,
    release_sql,
    rename_database,
    require_stopped,
    restore_scopes,
    service_escape,
    service_file,
    expected_writer_denial,
    validate_promotion_manifest,
    validate_data_snapshot,
    validate_state_dir as _implementation_validate_state_dir,
    write_promotion_manifest,
)


def validate_state_dir(path: Path) -> None:
    """Keep the facade patchable for unit tests and operator wrappers."""

    _implementation_validate_state_dir(path)


def main(argv: list[str] | None = None) -> int:
    _lib.validate_state_dir = validate_state_dir
    return _implementation_main(argv)


if __name__ == "__main__":
    raise SystemExit(main())
