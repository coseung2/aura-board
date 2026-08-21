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
    FENCE_MODES,
    JOURNAL_FILENAME,
    MARKER_SQL,
    PRODUCTION_STOPPED_CONTAINERS,
    SUPABASE_MANAGED_POOLER_HOST,
    PROMOTION_MANIFEST_FILENAME,
    PROMOTION_MANIFEST_KEYS,
    SEAL_MARKER_FILENAME,
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
    fence_engage_sql,
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
    read_seal_marker,
    require_stopped,
    seal_marker_path,
    validate_seal_marker,
    validate_stopped_container_names,
    verify_stopped_containers,
    write_seal_marker,
    restore_scopes,
    service_escape,
    service_file,
    expected_writer_denial,
    expected_old_credential_rejection,
    credential_rotation_release_sql,
    validate_promotion_manifest,
    validate_fence,
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
