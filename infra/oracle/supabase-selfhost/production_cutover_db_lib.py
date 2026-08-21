"""Implementation helpers for the Aura Board database cutover coordinator.

The rich journal in ``journal.json`` is operational state for recovery.  The
small ``promotion-manifest.json`` written after a verified promotion is the
only database evidence consumed by the runtime cutover tool.
"""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from collections.abc import Iterator, Sequence
from pathlib import Path
from typing import Any, NoReturn


ACTIONS = (
    "preflight",
    "engage-fence",
    "adopt-fence",
    "release-fence",
    "export",
    "candidate-create",
    "candidate-restore",
    "candidate-verify",
    "candidate-rename",
    "promote",
    "rollback",
)
CONNECTION_KEYS = frozenset({"host", "port", "dbname", "user", "password", "sslmode"})
FENCE_MODES = frozenset({"role_lockdown", "credential_rotation"})
CONTRACT_KEYS = frozenset(
    {
        "source",
        "target",
        "target_admin",
        "source_fence_mode",
        "source_export_role",
        "source_writer_roles",
        "source_writer_credentials",
        "target_stopped_containers",
    }
)
ARCHIVE_NAMES = {
    "public": "public.dump",
    "auth": "auth.dump",
    "storage": "storage-metadata.dump",
}
IDENTITY_KEYS = frozenset({"database", "server_address", "server_port", "system_identifier"})
MARKER_KEYS = frozenset({"database", "user", "server_address", "server_port", "system_identifier"})
PROMOTION_MANIFEST_KEYS = frozenset(
    {
        "format",
        "phase",
        "fence",
        "artifacts",
        "source_identity",
        "target_identity",
        "candidate_identity",
        "promotion_rollback_db",
        "db_journal_sha256",
    }
)
SAFE_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_$]*$")
SUPABASE_MANAGED_POOLER_HOST = "aws-1-ap-northeast-2.pooler.supabase.com"
SUPABASE_SHARED_POOLER_HOST = re.compile(
    r"^aws-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com$"
)
SUPABASE_PROJECT_REF = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
POOLER_LOGIN_ALIAS = re.compile(
    r"^(?P<role>[A-Za-z_][A-Za-z0-9_$]*)\.(?P<project>[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$"
)
JOURNAL_FORMAT = 2
PROMOTION_MANIFEST_FORMAT = 1
JOURNAL_FILENAME = "journal.json"
PROMOTION_MANIFEST_FILENAME = "promotion-manifest.json"
SEAL_MARKER_FILENAME = "production-cutover-seal.json"
SEAL_MARKER_FORMAT = 1
SEAL_MARKER_KEYS = frozenset(
    {
        "format",
        "phase",
        "rich_journal_path",
        "rich_journal_sha256",
        "promotion_manifest_path",
        "promotion_manifest_sha256",
    }
)
TOOL_APP_NAME = "aura-board-cutover"
DATA_SNAPSHOT_CONTRACT = "aura-cutover-data-v2"
PRODUCTION_STOPPED_CONTAINERS = tuple(
    sorted(
        {
            "realtime-dev.supabase-realtime",
            "supabase-auth",
            "supabase-edge-functions",
            "supabase-envoy",
            "supabase-meta",
            "supabase-pooler",
            "supabase-rest",
            "supabase-storage",
            "supabase-studio",
        }
    )
)
DOCKER_INSPECT_TIMEOUT_SECONDS = 10
MIGRATION_RECORD_KEYS = frozenset(
    {
        "id",
        "migration_name",
        "checksum",
        "started_at",
        "finished_at",
        "rolled_back_at",
        "applied_steps_count",
        "logs_digest",
        "logs_state",
        "state",
    }
)

VERSION_SQL = """
/* aura:version */
SELECT json_build_object(
    'major', current_setting('server_version_num')::int / 10000
)::text;
"""
EXTENSIONS_SQL = """
/* aura:extensions */
SELECT coalesce(
    json_agg(
        json_build_object('name', extname, 'version', extversion)
        ORDER BY extname
    ),
    '[]'::json
)::text
FROM pg_extension;
"""
MARKER_SQL = """
/* aura:database-marker */
SELECT json_build_object(
    'database', current_database(),
    'user', current_user,
    'server_address', coalesce(inet_server_addr()::text, 'local'),
    'server_port', inet_server_port(),
    'system_identifier', (pg_control_system()).system_identifier::text
)::text;
"""
CATALOG_SQL = r"""/* aura:catalog-fingerprint */ WITH o(kind,schema_name,object_name,detail) AS (
SELECT 'schema',n.nspname,n.nspname,jsonb_build_object('owner',pg_get_userbyid(n.nspowner),'acl',n.nspacl::text) FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
UNION ALL SELECT 'relation',n.nspname,c.relname,jsonb_build_object('kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'persistence',c.relpersistence,'row_security',c.relrowsecurity,'force_row_security',c.relforcerowsecurity,'replica_identity',c.relreplident,'options',c.reloptions::text,'partition_bound',pg_get_expr(c.relpartbound,c.oid),'acl',c.relacl::text) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p','v','m','S','f')
UNION ALL SELECT 'column',n.nspname,c.relname||'.'||a.attname,jsonb_build_object('number',a.attnum,'type',format_type(a.atttypid,a.atttypmod),'collation',CASE WHEN a.attcollation=0 THEN NULL ELSE a.attcollation::regcollation::text END,'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'storage',a.attstorage,'compression',a.attcompression,'default',pg_get_expr(d.adbin,d.adrelid)) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped
UNION ALL SELECT 'constraint',n.nspname,coalesce(r.relname,t.typname)||'.'||con.conname,jsonb_build_object('type',con.contype,'validated',con.convalidated,'deferrable',con.condeferrable,'deferred',con.condeferred,'definition',pg_get_constraintdef(con.oid,true)) FROM pg_constraint con LEFT JOIN pg_class r ON r.oid=con.conrelid LEFT JOIN pg_type t ON t.oid=con.contypid JOIN pg_namespace n ON n.oid=coalesce(r.relnamespace,t.typnamespace) WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
UNION ALL SELECT 'index',n.nspname,c.relname||'.'||i.relname,jsonb_build_object('definition',pg_get_indexdef(i.oid),'primary',x.indisprimary,'unique',x.indisunique,'exclusion',x.indisexclusion,'valid',x.indisvalid,'ready',x.indisready,'predicate',pg_get_expr(x.indpred,x.indrelid),'expressions',pg_get_expr(x.indexprs,x.indrelid),'options',i.reloptions::text,'acl',i.relacl::text) FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
UNION ALL SELECT 'trigger',n.nspname,c.relname||'.'||t.tgname,jsonb_build_object('enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid,true)) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND NOT t.tgisinternal
UNION ALL SELECT 'policy',n.nspname,c.relname||'.'||p.polname,jsonb_build_object('permissive',p.polpermissive,'command',p.polcmd,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid),'roles',array(SELECT coalesce(r.rolname,'PUBLIC') FROM unnest(p.polroles) x(oid) LEFT JOIN pg_roles r ON r.oid=x.oid ORDER BY x.oid)) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
UNION ALL SELECT 'routine',n.nspname,p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',jsonb_build_object('kind',p.prokind,'result',pg_get_function_result(p.oid),'language',l.lanname,'volatile',p.provolatile,'strict',p.proisstrict,'security_definer',p.prosecdef,'config',p.proconfig::text,'acl',p.proacl::text,'definition',pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND p.prokind IN ('f','p')
UNION ALL SELECT 'sequence',n.nspname,c.relname,jsonb_build_object('type',s.seqtypid::regtype::text,'start',s.seqstart,'increment',s.seqincrement,'min',s.seqmin,'max',s.seqmax,'cache',s.seqcache,'cycle',s.seqcycle,'acl',c.relacl::text) FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
UNION ALL SELECT 'type',n.nspname,t.typname,jsonb_build_object('kind',t.typtype,'base_type',format_type(t.typtypmod,t.typtypmod),'not_null',t.typnotnull,'default',t.typdefault,'acl',t.typacl::text,'enum_values',array(SELECT e.enumlabel FROM pg_enum e WHERE e.enumtypid=t.oid ORDER BY e.enumsortorder)) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND t.typrelid=0 AND t.typtype IN ('d','e','r')
UNION ALL SELECT 'view',n.nspname,c.relname,jsonb_build_object('kind',c.relkind,'definition',pg_get_viewdef(c.oid,true),'options',c.reloptions::text,'acl',c.relacl::text) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind IN ('v','m')
UNION ALL SELECT 'dependency',n.nspname,c.relname||'->'||rn.nspname||'.'||rc.relname,jsonb_build_object('dependency_type',d.deptype,'subobject',d.refobjid,'subobject_id',d.refobjsubid) FROM pg_depend d JOIN pg_class c ON d.classid='pg_class'::regclass AND c.oid=d.objid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_class rc ON d.refclassid='pg_class'::regclass AND rc.oid=d.refobjid JOIN pg_namespace rn ON rn.oid=rc.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND rn.nspname !~ '^pg_' AND rn.nspname <> 'information_schema') SELECT coalesce(json_agg(json_build_object('kind',kind,'schema_name',schema_name,'object_name',object_name,'detail',detail) ORDER BY kind,schema_name,object_name),'[]'::json)::text FROM o;"""
MIGRATION_PRESENT_SQL = """
/* aura:prisma-migrations-present */
SELECT (to_regclass('public._prisma_migrations') IS NOT NULL)::text;
"""
MIGRATION_SQL = """
/* aura:prisma-migrations */
SELECT coalesce(
    json_agg(
        json_build_object(
            'id', id,
            'migration_name', migration_name,
            'checksum', checksum,
            'started_at', started_at,
            'finished_at', finished_at,
            'rolled_back_at', rolled_back_at,
            'applied_steps_count', applied_steps_count,
            'logs_digest', CASE
                WHEN logs IS NULL THEN NULL
                ELSE encode(digest(convert_to(logs, 'UTF8'), 'sha256'), 'hex')
            END,
            'logs_state', CASE
                WHEN logs IS NULL THEN 'null'
                WHEN logs = '' THEN 'empty'
                ELSE 'present'
            END,
            'state', CASE
                WHEN finished_at IS NOT NULL AND rolled_back_at IS NOT NULL THEN 'invalid'
                WHEN rolled_back_at IS NOT NULL THEN 'rolled-back'
                WHEN finished_at IS NOT NULL THEN 'finished'
                ELSE 'unfinished'
            END
        )
        ORDER BY migration_name COLLATE "C", started_at NULLS FIRST, id COLLATE "C"
    ),
    '[]'::json
)::text
FROM public._prisma_migrations;
"""
DATA_SQL = r"""
/* aura:data-snapshot:v2 */
CREATE TEMP TABLE aura_cutover_data(
    scope text,
    table_name text,
    row_count bigint,
    content_sha256 text
);
SELECT format(
    $command$
    INSERT INTO aura_cutover_data(scope, table_name, row_count, content_sha256)
    SELECT %L, %L, count(*)::bigint,
        encode(
            digest(
                convert_to(
                    coalesce(
                        string_agg(
                            to_jsonb(t)::text,
                            E'\n' ORDER BY (to_jsonb(t)::text) COLLATE "C"
                        ),
                        ''
                    ),
                    'UTF8'
                ),
                'sha256'
            ),
            'hex'
        )
    FROM %I.%I AS t;
    $command$,
    schemaname,
    tablename,
    schemaname,
    tablename
)
FROM pg_catalog.pg_tables
WHERE schemaname IN ('public','auth')
   OR (schemaname = 'storage' AND tablename IN ('buckets','objects'))
ORDER BY schemaname COLLATE "C", tablename COLLATE "C"
\gexec
SELECT coalesce(
    json_build_object(
        'contract', 'aura-cutover-data-v2',
        'tables', coalesce(
            json_object_agg(
                scope || '.' || table_name,
                json_build_object(
                    'row_count', row_count,
                    'content_sha256', content_sha256
                ) ORDER BY scope COLLATE "C", table_name COLLATE "C"
            ),
            '{}'::json
        )
    ),
    json_build_object('contract', 'aura-cutover-data-v2', 'tables', '{}'::json)
)::text
FROM aura_cutover_data;
"""


class CutoverError(RuntimeError):
    """An expected, secret-free cutover failure."""


class ToolFailure(CutoverError):
    """A tool failure whose diagnostic is retained only for safe classification."""

    def __init__(self, tool: str, returncode: int, stderr: str) -> None:
        self.tool = tool
        self.returncode = returncode
        self.stderr = stderr
        super().__init__(f"{tool} failed with status {returncode}")


class SafeParser(argparse.ArgumentParser):
    def error(self, _message: str) -> NoReturn:
        raise CutoverError("invalid command-line arguments")


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = SafeParser(description="Safely coordinate Aura Board candidate-database cutover")
    parser.add_argument("action", choices=ACTIONS)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="print the plan; no I/O")
    mode.add_argument("--write", action="store_true", help="perform the selected action")
    parser.add_argument(
        "--state-dir",
        type=Path,
        required=True,
        help="root-owned mode-0700 persistent state directory",
    )
    return parser.parse_args(argv)


def log(action: str, phase: str) -> None:
    print(f"[production-cutover-db] action={action} phase={phase}")


def sync_directory(path: Path) -> None:
    if os.name == "nt":
        return
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _check_atomic_destination(path: Path) -> None:
    if not os.path.lexists(path):
        return
    info = os.lstat(path)
    if stat.S_ISLNK(info.st_mode):
        raise CutoverError(f"refusing symlink destination: {path.name}")
    if not stat.S_ISREG(info.st_mode):
        raise CutoverError(f"destination is not a regular file: {path.name}")


def atomic_json(path: Path, value: Any, mode: int = 0o600) -> None:
    """Write a JSON document with an fsynced replace and exact mode."""

    _check_atomic_destination(path)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        if hasattr(os, "fchmod"):
            os.fchmod(descriptor, mode)
        else:
            os.chmod(temporary, mode)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            descriptor = -1
            json.dump(value, handle, sort_keys=True, separators=(",", ":"))
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        os.chmod(path, mode)
        sync_directory(path.parent)
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        temporary.unlink(missing_ok=True)


def seal_marker_path(rich_journal: Path) -> Path:
    return Path(os.path.abspath(rich_journal)).with_name(SEAL_MARKER_FILENAME)


def _seal_input_bytes(path: Path, label: str) -> bytes:
    path = Path(os.path.abspath(path))
    try:
        info = os.lstat(path)
    except OSError as exc:
        raise CutoverError(f"{label} inspection failed (errno={exc.errno})") from None
    if stat.S_ISLNK(info.st_mode):
        raise CutoverError(f"{label} must not be a symlink")
    if not stat.S_ISREG(info.st_mode):
        raise CutoverError(f"{label} must be a regular file")
    if os.name != "nt" and stat.S_IMODE(info.st_mode) != 0o600:
        raise CutoverError(f"{label} must have mode 0600")
    try:
        return path.read_bytes()
    except OSError as exc:
        raise CutoverError(f"{label} could not be read (errno={exc.errno})") from None


def validate_seal_marker(
    value: Any,
    rich_journal: Path,
    promotion_manifest: Path,
    rich_sha256: str,
    promotion_sha256: str,
) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != SEAL_MARKER_KEYS:
        raise CutoverError("DB seal marker is malformed")
    rich_journal = Path(os.path.abspath(rich_journal))
    promotion_manifest = Path(os.path.abspath(promotion_manifest))
    if (
        isinstance(value["format"], bool)
        or not isinstance(value["format"], int)
        or value["format"] != SEAL_MARKER_FORMAT
        or value["phase"] != "sealed"
        or value["rich_journal_path"] != os.fspath(rich_journal)
        or value["promotion_manifest_path"] != os.fspath(promotion_manifest)
        or not isinstance(value["rich_journal_sha256"], str)
        or re.fullmatch(r"[0-9a-f]{64}", value["rich_journal_sha256"]) is None
        or not isinstance(value["promotion_manifest_sha256"], str)
        or re.fullmatch(r"[0-9a-f]{64}", value["promotion_manifest_sha256"]) is None
        or value["rich_journal_sha256"] != rich_sha256
        or value["promotion_manifest_sha256"] != promotion_sha256
    ):
        raise CutoverError("DB seal marker is malformed or does not match current DB evidence")
    return value


def read_seal_marker(rich_journal: Path, promotion_manifest: Path) -> dict[str, Any] | None:
    marker_path = seal_marker_path(rich_journal)
    if not os.path.lexists(marker_path):
        return None
    marker_bytes = _seal_input_bytes(marker_path, "DB seal marker")
    rich_bytes = _seal_input_bytes(rich_journal, "DB rich journal")
    promotion_bytes = _seal_input_bytes(promotion_manifest, "DB promotion manifest")
    try:
        marker = json.loads(marker_bytes.decode("utf-8"), object_pairs_hook=unique_object)
    except (CutoverError, UnicodeDecodeError, json.JSONDecodeError, TypeError, ValueError):
        raise CutoverError("DB seal marker is malformed") from None
    return validate_seal_marker(
        marker,
        rich_journal,
        promotion_manifest,
        hashlib.sha256(rich_bytes).hexdigest(),
        hashlib.sha256(promotion_bytes).hexdigest(),
    )


def write_seal_marker(rich_journal: Path, promotion_manifest: Path) -> dict[str, Any]:
    marker_path = seal_marker_path(rich_journal)
    if os.path.lexists(marker_path):
        marker = read_seal_marker(rich_journal, promotion_manifest)
        if marker is None:
            raise CutoverError("DB seal marker disappeared during validation")
        return marker
    rich_bytes = _seal_input_bytes(rich_journal, "DB rich journal")
    promotion_bytes = _seal_input_bytes(promotion_manifest, "DB promotion manifest")
    value = {
        "format": SEAL_MARKER_FORMAT,
        "phase": "sealed",
        "rich_journal_path": os.fspath(Path(os.path.abspath(rich_journal))),
        "rich_journal_sha256": hashlib.sha256(rich_bytes).hexdigest(),
        "promotion_manifest_path": os.fspath(Path(os.path.abspath(promotion_manifest))),
        "promotion_manifest_sha256": hashlib.sha256(promotion_bytes).hexdigest(),
    }
    validate_seal_marker(
        value,
        rich_journal,
        promotion_manifest,
        value["rich_journal_sha256"],
        value["promotion_manifest_sha256"],
    )
    atomic_json(marker_path, value, mode=0o600)
    read_back = read_seal_marker(rich_journal, promotion_manifest)
    if read_back != value:
        raise CutoverError("DB seal marker failed exact verification")
    return value


def validate_state_dir(path: Path) -> None:
    try:
        info = os.lstat(path)
    except OSError as exc:
        raise CutoverError(f"state directory inspection failed (errno={exc.errno})") from None
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise CutoverError("state directory must be a real directory")
    if os.name != "nt" and (info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o700):
        raise CutoverError("state directory must be root-owned with mode 0700")


@contextlib.contextmanager
def state_lock(state_dir: Path) -> Iterator[None]:
    path = state_dir / "operation.lock"
    if path.is_symlink():
        raise CutoverError("lock file must not be a symlink")
    try:
        descriptor = os.open(
            path,
            os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0),
            0o600,
        )
    except OSError as exc:
        raise CutoverError(f"could not open state lock (errno={exc.errno})") from None
    try:
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            raise CutoverError("state lock is not a regular file")
        os.chmod(path, 0o600)
        if os.name == "nt":
            import msvcrt

            if os.fstat(descriptor).st_size == 0:
                os.write(descriptor, b"0")
                os.lseek(descriptor, 0, os.SEEK_SET)
            try:
                msvcrt.locking(descriptor, msvcrt.LK_NBLCK, 1)
            except OSError:
                raise CutoverError("another cutover operation holds the lock") from None
        else:
            import fcntl

            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError:
                raise CutoverError("another cutover operation holds the lock") from None
        yield
    finally:
        os.close(descriptor)


def safe_text(value: Any) -> bool:
    return (
        isinstance(value, str)
        and bool(value)
        and not any(ord(character) < 32 or ord(character) == 127 for character in value)
    )


def unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise CutoverError("stdin must contain the exact cutover contract")
        result[key] = value
    return result


def pooler_login_alias(value: Any) -> tuple[str, str] | None:
    if not isinstance(value, str):
        return None
    match = POOLER_LOGIN_ALIAS.fullmatch(value)
    if match is None:
        return None
    role = match.group("role")
    project = match.group("project")
    if SAFE_IDENTIFIER.fullmatch(role) is None or SUPABASE_PROJECT_REF.fullmatch(project) is None:
        return None
    return (role, project)


def is_supabase_shared_pooler_host(value: Any) -> bool:
    return isinstance(value, str) and SUPABASE_SHARED_POOLER_HOST.fullmatch(value.lower()) is not None


def validate_connection(value: Any, *, allow_pooler_alias: bool = False) -> None:
    if not isinstance(value, dict) or set(value) != CONNECTION_KEYS:
        raise CutoverError("stdin must contain the exact cutover contract")
    if any(not safe_text(value[key]) for key in CONNECTION_KEYS - {"port"}):
        raise CutoverError("stdin must contain the exact cutover contract")
    user = value["user"]
    if SAFE_IDENTIFIER.fullmatch(user) is None and (
        not allow_pooler_alias or pooler_login_alias(user) is None
    ):
        raise CutoverError("stdin must contain the exact cutover contract")
    port = value.get("port")
    if isinstance(port, bool) or not isinstance(port, int) or not 1 <= port <= 65535:
        raise CutoverError("stdin must contain the exact cutover contract")


def read_credentials() -> dict[str, Any]:
    try:
        value = json.loads(sys.stdin.read(), object_pairs_hook=unique_object)
    except (OSError, UnicodeError, json.JSONDecodeError):
        raise CutoverError("stdin must contain the exact cutover contract") from None
    if not isinstance(value, dict) or set(value) != CONTRACT_KEYS:
        raise CutoverError("stdin must contain the exact cutover contract")
    source_fence_mode = value["source_fence_mode"]
    if not isinstance(source_fence_mode, str) or source_fence_mode not in FENCE_MODES:
        raise CutoverError("source_fence_mode must be role_lockdown or credential_rotation")

    validate_connection(value["source"], allow_pooler_alias=True)
    for key in ("target", "target_admin"):
        validate_connection(value[key])
    if value["target_admin"]["dbname"] == value["target"]["dbname"]:
        raise CutoverError("target admin must be a maintenance connection on the target server")
    deterministic_names = db_names(value)
    if value["target_admin"]["dbname"] in {
        deterministic_names["candidate"],
        deterministic_names["rollback"],
    }:
        raise CutoverError("target admin must not connect to a rename or drop candidate")
    if (
        value["target_admin"]["host"],
        value["target_admin"]["port"],
    ) != (value["target"]["host"], value["target"]["port"]):
        raise CutoverError("target admin must be a maintenance connection on the target server")

    export_role = value["source_export_role"]
    writer_roles = value["source_writer_roles"]
    if not isinstance(export_role, str) or SAFE_IDENTIFIER.fullmatch(export_role) is None:
        raise CutoverError("source export role must be an actual safe PostgreSQL identifier")
    source_alias = pooler_login_alias(value["source"]["user"])
    source_is_pooler = is_supabase_shared_pooler_host(value["source"]["host"])
    if source_alias is not None:
        if not source_is_pooler:
            raise CutoverError(
                "pooler login aliases are allowed only on the exact Supabase shared-pooler host"
            )
        if source_alias[0] != export_role:
            raise CutoverError("source export role does not match the pooler login alias role")
        pooler_project = source_alias[1]
    else:
        if "." in value["source"]["user"]:
            raise CutoverError("source credential user contains an invalid dotted login alias")
        if source_is_pooler:
            raise CutoverError(
                "Supabase shared-pooler source credentials must use role.<project-ref> login aliases"
            )
        if value["source"]["user"] != export_role:
            raise CutoverError("source export role must exactly match the source credential user")
        pooler_project = None
    if not isinstance(writer_roles, list) or not writer_roles:
        raise CutoverError("source writer roles must be explicit identifiers")
    if any(
        not isinstance(role, str) or SAFE_IDENTIFIER.fullmatch(role) is None
        for role in writer_roles
    ):
        raise CutoverError("source writer roles must be explicit identifiers")
    if source_fence_mode == "role_lockdown" and export_role in writer_roles:
        raise CutoverError("source export role must not be a writer")
    if source_fence_mode == "credential_rotation" and (
        len(writer_roles) != 1 or export_role != writer_roles[0]
    ):
        raise CutoverError(
            "credential_rotation requires the export role to be the sole writer role"
        )
    if source_fence_mode == "credential_rotation" and (
        export_role != "postgres" or writer_roles != ["postgres"]
    ):
        raise CutoverError(
            "credential_rotation requires the actual postgres role and postgres.<project-ref> aliases"
        )
    if writer_roles != sorted(set(writer_roles)):
        raise CutoverError("source writer roles must be unique and sorted")

    probes = value["source_writer_credentials"]
    if not isinstance(probes, dict) or set(probes) != set(writer_roles):
        raise CutoverError("source writer credentials must exactly name every writer role")
    for role in writer_roles:
        validate_connection(probes[role], allow_pooler_alias=True)
        connection = probes[role]
        writer_alias = pooler_login_alias(connection["user"])
        if pooler_project is None:
            if writer_alias is not None or "." in connection["user"]:
                raise CutoverError(
                    "dotted writer login aliases are allowed only for Supabase shared-pooler credentials"
                )
            expected_user = role
        else:
            if writer_alias is None or writer_alias != (role, pooler_project):
                raise CutoverError(
                    "every source writer credential must use the same role.<project-ref> login suffix"
                )
            expected_user = connection["user"]
        if (
            connection["user"] != expected_user
            or connection["dbname"] != value["source"]["dbname"]
            or (connection["host"], connection["port"])
            != (value["source"]["host"], value["source"]["port"])
        ):
            raise CutoverError(
                "writer probe credentials must address the source as their named role"
            )
        if source_fence_mode == "credential_rotation" and (
            value["source"]["host"] != SUPABASE_MANAGED_POOLER_HOST
            or connection["host"] != SUPABASE_MANAGED_POOLER_HOST
            or source_alias is None
            or writer_alias != source_alias
            or connection["user"] != value["source"]["user"]
            or connection["password"] == value["source"]["password"]
        ):
            raise CutoverError(
                "credential_rotation requires identical managed-pooler aliases and different passwords"
            )
    validate_stopped_container_names(value["target_stopped_containers"])
    return value


def service_escape(value: Any) -> str:
    value = str(value)
    if not safe_text(value):
        raise CutoverError("credential values contain unsupported control characters")
    return "".join(
        "\\\\" if character == "\\" else "\\" + character if character in "#=\"'" else character
        for character in value
    )


def qid(value: str) -> str:
    if SAFE_IDENTIFIER.fullmatch(value) is None:
        raise CutoverError("unsafe database or role identifier")
    return f'"{value}"'


def qlit(value: str) -> str:
    if not safe_text(value):
        raise CutoverError("unsafe SQL literal")
    return "'" + value.replace("'", "''") + "'"


def db_name(base: str, suffix: str) -> str:
    if SAFE_IDENTIFIER.fullmatch(base) is None or base.endswith(
        ("__aura_candidate", "__aura_rollback")
    ):
        raise CutoverError("target database name is not eligible for deterministic names")
    value = base + suffix
    if len(value) <= 63:
        return value
    digest_value = hashlib.sha256(base.encode()).hexdigest()[:10]
    room = 63 - len(suffix) - len(digest_value) - 1
    if room < 1:
        raise CutoverError("target database name is too long")
    return f"{base[:room]}_{digest_value}{suffix}"


def db_names(credentials: dict[str, Any]) -> dict[str, str]:
    base = credentials["target"]["dbname"]
    return {
        "target": base,
        "candidate": db_name(base, "__aura_candidate"),
        "rollback": db_name(base, "__aura_rollback"),
    }


def metadata(credentials: dict[str, Any]) -> dict[str, Any]:
    names = db_names(credentials)
    return {
        "source_fence_mode": credentials["source_fence_mode"],
        "target_database": names["target"],
        "candidate_database": names["candidate"],
        "rollback_database": names["rollback"],
        "source_export_role": credentials["source_export_role"],
        "source_writer_roles": credentials["source_writer_roles"],
        "target_stopped_containers": credentials["target_stopped_containers"],
    }


def source_control_service(credentials: dict[str, Any]) -> str:
    """Return the non-secret service used for source control-plane reads."""

    if credentials["source_fence_mode"] == "credential_rotation":
        return "writer_0"
    return "source"


@contextlib.contextmanager
def service_file(credentials: dict[str, Any]) -> Iterator[Path]:
    directory = Path(tempfile.mkdtemp(prefix="aura-cutover-"))
    os.chmod(directory, 0o700)
    path = directory / "pg_service.conf"
    candidate = dict(credentials["target"])
    candidate["dbname"] = db_names(credentials)["candidate"]
    connections = {
        "source": credentials["source"],
        "target": credentials["target"],
        "target_admin": credentials["target_admin"],
        "candidate": candidate,
    }
    connections.update(
        {
            f"writer_{index}": credentials["source_writer_credentials"][role]
            for index, role in enumerate(credentials["source_writer_roles"])
        }
    )
    operation_error: BaseException | None = None
    try:
        with path.open("x", encoding="utf-8") as handle:
            for service, connection in connections.items():
                handle.write(f"[{service}]\n")
                for key in ("host", "port", "dbname", "user", "password", "sslmode"):
                    handle.write(f"{key}={service_escape(connection[key])}\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(path, 0o600)
        yield path
    except BaseException as exc:
        operation_error = exc
        raise
    finally:
        try:
            if os.path.lexists(directory):
                shutil.rmtree(directory)
            if os.path.lexists(directory):
                raise OSError("temporary pg_service.conf directory still exists")
        except Exception as exc:
            cleanup_error = CutoverError(
                f"pg_service.conf cleanup failed (errno={getattr(exc, 'errno', None)})"
            )
            if operation_error is not None:
                raise CutoverError(
                    "cutover operation failed and pg_service.conf cleanup failed "
                    f"(errno={getattr(exc, 'errno', None)})"
                ) from operation_error
            else:
                raise cleanup_error from None


def environment(path: Path, service: str) -> dict[str, str]:
    result = os.environ.copy()
    for key in tuple(result):
        if key.upper() in {
            "DATABASE_URL",
            "PGPASSWORD",
            "PGHOST",
            "PGPORT",
            "PGDATABASE",
            "PGUSER",
            "PGSERVICE",
            "PGSERVICEFILE",
            "PGAPPNAME",
        }:
            result.pop(key, None)
    result.update(
        PGSERVICEFILE=str(path),
        PGSERVICE=service,
        PGAPPNAME=TOOL_APP_NAME,
    )
    return result


def run_tool(
    argv: list[str],
    path: Path,
    service: str,
    *,
    capture: bool = False,
    input_text: str | None = None,
) -> str:
    kwargs: dict[str, Any] = {
        "env": environment(path, service),
        "stderr": subprocess.PIPE,
        "text": True,
        "check": False,
    }
    if capture:
        kwargs["stdout"] = subprocess.PIPE
    else:
        kwargs["stdout"] = subprocess.DEVNULL
    if input_text is None:
        kwargs["stdin"] = subprocess.DEVNULL
    else:
        kwargs["input"] = input_text
    try:
        result = subprocess.run(argv, **kwargs)
    except OSError as exc:
        raise CutoverError(
            f"required tool unavailable: {Path(argv[0]).name} (errno={exc.errno})"
        ) from None
    if result.returncode:
        raise ToolFailure(
            Path(argv[0]).name,
            result.returncode,
            result.stderr or "",
        )
    return (result.stdout or "").strip()


def psql(
    sql: str,
    path: Path,
    service: str,
    *,
    json_output: bool = False,
) -> Any:
    output = run_tool(
        [
            os.environ.get("PSQL_BIN", "psql"),
            "--no-psqlrc",
            "--quiet",
            "--set=ON_ERROR_STOP=1",
            "--tuples-only",
            "--no-align",
            "--file=-",
        ],
        path,
        service,
        capture=True,
        input_text=sql,
    )
    if not json_output:
        return output
    try:
        return json.loads(output)
    except json.JSONDecodeError:
        raise CutoverError(f"{service} returned invalid catalog JSON") from None


def psql_command(sql: str, path: Path, service: str) -> str:
    return run_tool(
        [
            os.environ.get("PSQL_BIN", "psql"),
            "--no-psqlrc",
            "--quiet",
            "--set=ON_ERROR_STOP=1",
            "--command",
            sql,
        ],
        path,
        service,
    )


def parse_json_file(path: Path, label: str) -> dict[str, Any]:
    if path.is_symlink():
        raise CutoverError(f"{label} must not be a symlink")
    try:
        value = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique_object)
    except (OSError, UnicodeError, json.JSONDecodeError):
        raise CutoverError(f"valid {label} is required") from None
    if not isinstance(value, dict):
        raise CutoverError(f"valid {label} is required")
    return value


def read_journal(state: Path) -> dict[str, Any]:
    value = parse_json_file(state / JOURNAL_FILENAME, "cutover journal")
    if value.get("format") != JOURNAL_FORMAT:
        raise CutoverError("valid cutover journal is required")
    return value


def write_journal(state: Path, journal: dict[str, Any]) -> None:
    payload = dict(journal)
    payload["format"] = JOURNAL_FORMAT
    atomic_json(state / JOURNAL_FILENAME, payload)


def digest(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def file_digest(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def require_contract(journal: dict[str, Any], credentials: dict[str, Any]) -> None:
    if journal.get("contract") != metadata(credentials):
        raise CutoverError("journal does not match the exact cutover contract")


def require_phase(journal: dict[str, Any], *phases: str) -> None:
    if journal.get("phase") not in phases:
        raise CutoverError("journal phase does not permit this action")


def require_preflight(journal: dict[str, Any], credentials: dict[str, Any]) -> None:
    require_contract(journal, credentials)
    preflight_record = journal.get("preflight")
    if not isinstance(preflight_record, dict) or preflight_record.get("passed") is not True:
        raise CutoverError("successful preflight journal is required")
    fence = journal.get("fence")
    if not isinstance(fence, dict) or fence.get("mode") != credentials["source_fence_mode"]:
        raise CutoverError("journal fence mode does not match the exact cutover contract")


def validate_stopped_container_names(value: Any) -> list[str]:
    if (
        not isinstance(value, list)
        or any(
            not isinstance(name, str)
            or not name
            or name.startswith("-")
            or any(ord(character) < 0x20 or ord(character) == 0x7F for character in name)
            for name in value
        )
        or value != sorted(set(value))
        or value != list(PRODUCTION_STOPPED_CONTAINERS)
    ):
        raise CutoverError(
            "target_stopped_containers must be the complete sorted production container set"
        )
    return value


def verify_stopped_containers(containers: Sequence[str]) -> None:
    expected = validate_stopped_container_names(list(containers))
    try:
        result = subprocess.run(
            [
                os.environ.get("DOCKER_BIN", "docker"),
                "inspect",
                "--format={{.Name}}\t{{.State.Status}}\t{{.State.Running}}",
                *expected,
            ],
            check=False,
            capture_output=True,
            text=True,
            timeout=DOCKER_INSPECT_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise CutoverError("docker inspect failed while proving target containers are stopped") from exc
    stdout = result.stdout if isinstance(result.stdout, str) else ""
    if result.returncode != 0:
        raise CutoverError("docker inspect failed while proving target containers are stopped")
    records: dict[str, tuple[str, str]] = {}
    for line in stdout.splitlines():
        fields = line.split("\t")
        if len(fields) != 3:
            raise CutoverError("docker inspect returned malformed container state")
        name, status, running = fields
        if name.startswith("/"):
            name = name[1:]
        if name not in expected or name in records:
            raise CutoverError("docker inspect returned an unexpected container")
        if status not in {"created", "dead", "exited"} or running != "false":
            raise CutoverError(f"required target container is active: {name}")
        records[name] = (status, running)
    if set(records) != set(expected):
        raise CutoverError("docker inspect did not report every required target container")


def require_stopped(credentials: dict[str, Any]) -> None:
    verify_stopped_containers(credentials["target_stopped_containers"])


def require_rollback_not_sealed(state: Path) -> None:
    marker = read_seal_marker(
        state / JOURNAL_FILENAME,
        state / PROMOTION_MANIFEST_FILENAME,
    )
    if marker is not None:
        raise CutoverError("rollback is permanently blocked after the production seal")


def validate_marker(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != MARKER_KEYS:
        raise CutoverError(f"{label} database marker is malformed")
    for key in ("database", "user", "server_address", "system_identifier"):
        if not safe_text(value[key]):
            raise CutoverError(f"{label} database marker is malformed")
    if SAFE_IDENTIFIER.fullmatch(value["database"]) is None:
        raise CutoverError(f"{label} database marker has an unsafe database name")
    port = value["server_port"]
    if isinstance(port, bool) or not isinstance(port, int) or not 1 <= port <= 65535:
        raise CutoverError(f"{label} database marker has an invalid port")
    return value


def identity_from_marker(value: Any, label: str) -> dict[str, Any]:
    marker = validate_marker(value, label)
    return {key: marker[key] for key in IDENTITY_KEYS}


def validate_identity(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != IDENTITY_KEYS:
        raise CutoverError(f"{label} identity is malformed")
    if not safe_text(value["database"]):
        raise CutoverError(f"{label} identity is malformed")
    if SAFE_IDENTIFIER.fullmatch(value["database"]) is None:
        raise CutoverError(f"{label} identity has an unsafe database name")
    for key in ("server_address", "system_identifier"):
        if not safe_text(value[key]):
            raise CutoverError(f"{label} identity is malformed")
    port = value["server_port"]
    if isinstance(port, bool) or not isinstance(port, int) or not 1 <= port <= 65535:
        raise CutoverError(f"{label} identity has an invalid port")
    return value


def require_marker(journal: dict[str, Any], path: Path, service: str, key: str) -> None:
    recorded = journal.get(key)
    if recorded is None:
        raise CutoverError(f"{service} database marker is missing from the journal")
    validate_marker(recorded, f"journal {key}")
    current = validate_marker(psql(MARKER_SQL, path, service, json_output=True), service)
    if current != recorded:
        raise CutoverError(f"{service} database marker does not match the journal")


def migration_state(item: dict[str, Any]) -> str:
    finished = item.get("finished_at") is not None
    rolled = item.get("rolled_back_at") is not None
    if finished and rolled:
        raise CutoverError("migration record has both finished and rolled-back state")
    if rolled:
        return "rolled-back"
    if finished:
        return "finished"
    return "unfinished"


def migration_records(value: Any, label: str) -> list[dict[str, Any]]:
    if (
        not isinstance(value, dict)
        or value.get("present") is not True
        or not isinstance(value.get("records"), list)
    ):
        raise CutoverError(
            f"{label} migration history is missing or malformed public._prisma_migrations"
        )
    rows = value["records"]
    for item in rows:
        if (
            not isinstance(item, dict)
            or set(item) != MIGRATION_RECORD_KEYS
            or not safe_text(item["id"])
            or not safe_text(item["migration_name"])
            or not safe_text(item["checksum"])
            or not safe_text(item["started_at"])
            or any(
                value is not None and not safe_text(value)
                for value in (item["finished_at"], item["rolled_back_at"])
            )
            or not isinstance(item["applied_steps_count"], int)
            or isinstance(item["applied_steps_count"], bool)
            or item["applied_steps_count"] < 0
            or (
                item["logs_digest"] is not None
                and (
                    not isinstance(item["logs_digest"], str)
                    or re.fullmatch(r"[0-9a-f]{64}", item["logs_digest"]) is None
                )
            )
            or item["logs_state"] not in {"null", "empty", "present"}
            or item["state"] not in {"finished", "rolled-back", "unfinished"}
        ):
            raise CutoverError(f"{label} migration record is malformed")
        if item["logs_state"] == "null" and item["logs_digest"] is not None:
            raise CutoverError(f"{label} migration logs state is inconsistent")
        if item["logs_state"] != "null" and item["logs_digest"] is None:
            raise CutoverError(f"{label} migration logs state is inconsistent")
        if item["state"] != migration_state(item):
            raise CutoverError(f"{label} migration state is inconsistent")
    identities = [(item["migration_name"], item["id"]) for item in rows]
    if len(set(identities)) != len(identities):
        raise CutoverError(f"{label} migration records contain duplicate identities")
    ids = [item["id"] for item in rows]
    if len(set(ids)) != len(ids):
        raise CutoverError(f"{label} migration records contain duplicate ids")
    order = [
        (
            item["migration_name"].encode("utf-8"),
            item["started_at"],
            item["id"].encode("utf-8"),
        )
        for item in rows
    ]
    if order != sorted(order):
        raise CutoverError(f"{label} migration records are not exact ordered records")
    return rows


def compare_migrations(source: Any, candidate: Any) -> None:
    source_rows = migration_records(source, "source")
    candidate_rows = migration_records(candidate, "candidate")
    for rows, label in ((source_rows, "source"), (candidate_rows, "candidate")):
        finished_names = {
            item["migration_name"]
            for item in rows
            if migration_state(item) == "finished"
        }
        for item in rows:
            if (
                migration_state(item) == "rolled-back"
                and item["migration_name"] not in finished_names
            ):
                raise CutoverError(
                    f"{label} rolled-back migration history has no finished replacement: "
                    f"{item['migration_name']}"
                )

    source_map = {
        (item["migration_name"], item["id"]): item for item in source_rows
    }
    candidate_map = {
        (item["migration_name"], item["id"]): item for item in candidate_rows
    }
    source_order = [(item["migration_name"], item["id"]) for item in source_rows]
    candidate_order = [(item["migration_name"], item["id"]) for item in candidate_rows]
    source_identities = set(source_order)
    candidate_identities = set(candidate_order)
    missing = [identity for identity in source_order if identity not in candidate_identities]
    extra = [identity for identity in candidate_order if identity not in source_identities]
    if missing or extra:
        detail = "missing " + ",".join(name for name, _ in missing) if missing else ""
        if extra:
            detail = (detail + "; " if detail else "") + "extra " + ",".join(
                name for name, _ in extra
            )
        raise CutoverError("migration history mismatch: " + detail)
    for name, migration_id in source_order:
        source_item = source_map[(name, migration_id)]
        candidate_item = candidate_map[(name, migration_id)]
        if source_item["checksum"] != candidate_item["checksum"]:
            raise CutoverError(f"migration checksum mismatch: {name}")
        if source_item["id"] != candidate_item["id"]:
            raise CutoverError(f"migration id mismatch: {name}")
        if source_item["started_at"] != candidate_item["started_at"]:
            raise CutoverError(f"migration start time mismatch: {name}")
        source_state = migration_state(source_item)
        candidate_state = migration_state(candidate_item)
        if source_state != candidate_state:
            raise CutoverError(
                f"migration state mismatch ({source_state}/{candidate_state}): {name}"
            )
        if source_item["applied_steps_count"] != candidate_item["applied_steps_count"]:
            raise CutoverError(f"migration applied_steps_count mismatch: {name}")
        if (
            source_item["finished_at"] != candidate_item["finished_at"]
            or source_item["rolled_back_at"] != candidate_item["rolled_back_at"]
        ):
            raise CutoverError(f"migration completion state mismatch: {name}")
        if (
            source_item["logs_digest"] != candidate_item["logs_digest"]
            or source_item["logs_state"] != candidate_item["logs_state"]
        ):
            raise CutoverError(f"migration logs mismatch: {name}")
        if source_state == "unfinished":
            raise CutoverError(f"unfinished migration history: {name}")
    if source_rows != candidate_rows:
        raise CutoverError("migration history records are not exactly ordered and equal")


def catalog(path: Path, service: str) -> dict[str, Any]:
    objects = psql(CATALOG_SQL, path, service, json_output=True)
    present = psql(MIGRATION_PRESENT_SQL, path, service).lower()
    if not isinstance(objects, list) or present not in {"true", "false"}:
        raise CutoverError(f"{service} catalog fingerprint is malformed")
    rows = psql(MIGRATION_SQL, path, service, json_output=True) if present == "true" else []
    if not isinstance(rows, list):
        raise CutoverError(f"{service} migration records are malformed")
    return {
        "objects": objects,
        "migrations": {"present": present == "true", "records": rows},
    }


def validate_data_snapshot(value: Any, label: str) -> dict[str, Any]:
    if (
        not isinstance(value, dict)
        or set(value) != {"contract", "tables"}
        or value.get("contract") != DATA_SNAPSHOT_CONTRACT
        or not isinstance(value.get("tables"), dict)
        or not value["tables"]
    ):
        raise CutoverError(f"{label} data snapshot is malformed")
    for table_name, table in value["tables"].items():
        if not isinstance(table_name, str) or "." not in table_name:
            raise CutoverError(f"{label} data snapshot is malformed")
        schema, name = table_name.split(".", 1)
        if (
            schema not in {"public", "auth", "storage"}
            or SAFE_IDENTIFIER.fullmatch(name) is None
            or schema == "storage" and name not in {"buckets", "objects"}
            or not isinstance(table, dict)
            or set(table) != {"row_count", "content_sha256"}
            or not isinstance(table["row_count"], int)
            or isinstance(table["row_count"], bool)
            or table["row_count"] < 0
            or not isinstance(table["content_sha256"], str)
            or re.fullmatch(r"[0-9a-f]{64}", table["content_sha256"]) is None
        ):
            raise CutoverError(f"{label} data snapshot is malformed")
    return value


def data_snapshot(path: Path, service: str) -> dict[str, Any]:
    return validate_data_snapshot(psql(DATA_SQL, path, service, json_output=True), service)


def compare_data_snapshots(source: Any, candidate: Any) -> None:
    """Compare the fail-closed per-table count and canonical content contract."""

    source = validate_data_snapshot(source, "source")
    candidate = validate_data_snapshot(candidate, "candidate")
    if source != candidate:
        raise CutoverError("data snapshot count or content digest mismatch")


def auth_scope(value: dict[str, Any]) -> list[Any]:
    return [
        item
        for item in value.get("objects", [])
        if isinstance(item, dict)
        and (
            item.get("schema_name") == "auth"
            or str(item.get("object_name", "")).startswith("auth.")
        )
    ]


def compare_catalogs(source: dict[str, Any], candidate: dict[str, Any]) -> None:
    compare_migrations(source.get("migrations"), candidate.get("migrations"))
    if digest(auth_scope(source)) != digest(auth_scope(candidate)):
        raise CutoverError("auth schema catalog fingerprint is not exact")
    if source != candidate:
        raise CutoverError("full cross-schema catalog fingerprint mismatch")


def preflight(state: Path, path: Path, credentials: dict[str, Any]) -> None:
    if os.path.lexists(state / JOURNAL_FILENAME):
        raise CutoverError("a cutover journal already exists")
    if os.path.lexists(state / PROMOTION_MANIFEST_FILENAME):
        raise CutoverError("a promotion manifest already exists")

    source_service = source_control_service(credentials)
    versions = {
        "source": psql(VERSION_SQL, path, source_service, json_output=True),
        "target": psql(VERSION_SQL, path, "target", json_output=True),
    }
    if versions["source"].get("major") != versions["target"].get("major"):
        raise CutoverError("source and target PostgreSQL major versions differ")
    extensions = {
        "source": psql(EXTENSIONS_SQL, path, source_service, json_output=True),
        "target": psql(EXTENSIONS_SQL, path, "target", json_output=True),
    }
    if extensions["source"] != extensions["target"]:
        raise CutoverError("source and target extension catalogs are not exact")

    source_catalog = catalog(path, source_service)
    target_catalog = catalog(path, "target")
    compare_catalogs(source_catalog, target_catalog)
    source_marker = validate_marker(
        psql(MARKER_SQL, path, source_service, json_output=True), "source"
    )
    target_marker = validate_marker(psql(MARKER_SQL, path, "target", json_output=True), "target")
    fence: dict[str, Any] = {
        "mode": credentials["source_fence_mode"],
        "engaged": False,
        "release_required": False,
    }
    if credentials["source_fence_mode"] == "credential_rotation":
        fence["before"] = validate_rotation_prior_fence(
            psql(fence_inspect_sql(credentials), path, source_service, json_output=True),
            credentials,
        )
    else:
        preflight_fence = validate_fence(
            psql(fence_inspect_sql(credentials), path, source_service, json_output=True),
            credentials,
        )
        if preflight_fence["database_acl_is_default"]:
            raise CutoverError(
                "role_lockdown requires an explicit database ACL; datacl is NULL and cannot be restored exactly"
            )
    write_journal(
        state,
        {
            "phase": "preflight-complete",
            "contract": metadata(credentials),
            "source_marker": source_marker,
            "target_marker": target_marker,
            "preflight": {
                "passed": True,
                "major": versions["source"]["major"],
                "extensions_digest": digest(extensions["source"]),
                "source_catalog_digest": digest(source_catalog),
                "target_catalog_digest": digest(target_catalog),
                "source_data_digest": digest(data_snapshot(path, source_service)),
                "target_data_digest": digest(data_snapshot(path, "target")),
                "source_migrations_digest": digest(source_catalog["migrations"]),
            },
            "fence": fence,
            "rollback_available": False,
            "first_write_sealed": False,
        },
    )


def role_names(credentials: dict[str, Any]) -> list[str]:
    result: list[str] = []
    for role in [credentials["source_export_role"], *credentials["source_writer_roles"]]:
        if role not in result:
            result.append(role)
    return result


def fence_inspect_sql(credentials: dict[str, Any]) -> str:
    roles = ",".join(qlit(role) for role in role_names(credentials))
    return f"""
/* aura:fence-inspect */
WITH r AS (
    SELECT coalesce(
        json_agg(
            json_build_object(
                'rolname', rolname,
                'rolcanlogin', rolcanlogin,
                'rolsuper', rolsuper
            ) ORDER BY rolname
        ),
        '[]'::json
    ) value
    FROM pg_roles
    WHERE rolname IN ({roles})
), a AS (
    SELECT coalesce(
        json_agg(
            json_build_object(
                'grantee', coalesce(g.rolname, 'PUBLIC'),
                'grantor', coalesce(o.rolname, 'PUBLIC'),
                'is_grantable', x.is_grantable
            ) ORDER BY coalesce(g.rolname, 'PUBLIC'),
                         coalesce(o.rolname, 'PUBLIC'), x.is_grantable
        ),
        '[]'::json
    ) value
    FROM pg_database d
    CROSS JOIN LATERAL aclexplode(coalesce(d.datacl, acldefault('d', d.datdba))) x
    LEFT JOIN pg_roles g ON g.oid = x.grantee
    LEFT JOIN pg_roles o ON o.oid = x.grantor
    WHERE d.datname = current_database()
      AND x.privilege_type = 'CONNECT'
), da AS (
    SELECT
        coalesce(
            json_agg(
                json_build_object(
                    'grantee', coalesce(g.rolname, 'PUBLIC'),
                    'grantor', coalesce(o.rolname, 'PUBLIC'),
                    'privilege_type', x.privilege_type,
                    'is_grantable', x.is_grantable
                ) ORDER BY coalesce(g.rolname, 'PUBLIC'),
                             coalesce(o.rolname, 'PUBLIC'),
                             x.privilege_type, x.is_grantable
            ),
            '[]'::json
        ) value
    FROM pg_database d
    CROSS JOIN LATERAL aclexplode(coalesce(d.datacl, acldefault('d', d.datdba))) x
    LEFT JOIN pg_roles g ON g.oid = x.grantee
    LEFT JOIN pg_roles o ON o.oid = x.grantor
    WHERE d.datname = current_database()
), j AS (
    SELECT coalesce(
        json_agg(json_build_object('jobid', jobid, 'active', active) ORDER BY jobid),
        '[]'::json
    ) value
    FROM cron.job
), s AS (
    SELECT coalesce(json_agg(config ORDER BY config), '[]'::json) value
    FROM pg_db_role_setting d
    CROSS JOIN LATERAL unnest(d.setconfig) config
    WHERE d.setdatabase = (
        SELECT oid FROM pg_database WHERE datname = current_database()
    )
      AND d.setrole = 0
)
SELECT json_build_object(
    'roles', (SELECT value FROM r),
    'connect_acl', (SELECT value FROM a),
    'database_acl', (
        SELECT coalesce(d.datacl::text, acldefault('d', d.datdba)::text)
        FROM pg_database d
        WHERE d.datname = current_database()
    ),
    'database_acl_is_default', (
        SELECT d.datacl IS NULL
        FROM pg_database d
        WHERE d.datname = current_database()
    ),
    'database_acl_entries', (SELECT value FROM da),
    'cron_jobs', (SELECT value FROM j),
    'db_settings', (SELECT value FROM s),
    'effective_read_only', current_setting('transaction_read_only')
)::text;
"""


def validate_fence(value: Any, credentials: dict[str, Any]) -> dict[str, Any]:
    required = {
        "roles",
        "connect_acl",
        "database_acl",
        "database_acl_is_default",
        "database_acl_entries",
        "cron_jobs",
        "db_settings",
        "effective_read_only",
    }
    if not isinstance(value, dict) or set(value) != required:
        raise CutoverError("fence catalog snapshot is malformed")
    if any(
        not isinstance(value[key], list)
        for key in (
            "roles",
            "connect_acl",
            "database_acl_entries",
            "cron_jobs",
            "db_settings",
        )
    ):
        raise CutoverError("fence catalog snapshot is malformed")
    if (
        not safe_text(value["database_acl"])
        or not isinstance(value["database_acl_is_default"], bool)
        or value["effective_read_only"] not in {"on", "off"}
    ):
        raise CutoverError("fence catalog snapshot is malformed")
    role_rows = value["roles"]
    if any(
        not isinstance(item, dict)
        or set(item) != {"rolname", "rolcanlogin", "rolsuper"}
        or SAFE_IDENTIFIER.fullmatch(item["rolname"]) is None
        or not isinstance(item["rolcanlogin"], bool)
        or not isinstance(item["rolsuper"], bool)
        for item in role_rows
    ):
        raise CutoverError("fence role snapshot is malformed")
    role_names_in_snapshot = [item["rolname"] for item in role_rows]
    if (
        role_names_in_snapshot != sorted(set(role_names_in_snapshot))
        or set(role_names_in_snapshot) != set(role_names(credentials))
    ):
        raise CutoverError("fence role snapshot is not exact")
    roles = {item["rolname"]: item for item in role_rows}
    for grant in value["connect_acl"]:
        if (
            not isinstance(grant, dict)
            or set(grant) != {"grantee", "grantor", "is_grantable"}
            or not isinstance(grant["is_grantable"], bool)
            or not safe_text(grant["grantee"])
            or not safe_text(grant["grantor"])
            or grant["grantor"] == "PUBLIC"
            or (
                grant["grantee"] != "PUBLIC"
                and SAFE_IDENTIFIER.fullmatch(grant["grantee"]) is None
            )
            or SAFE_IDENTIFIER.fullmatch(grant["grantor"]) is None
        ):
            raise CutoverError("fence CONNECT ACL snapshot is malformed")
    connect_keys = [
        (item["grantee"], item["grantor"], item["is_grantable"])
        for item in value["connect_acl"]
    ]
    if len(connect_keys) != len(set(connect_keys)):
        raise CutoverError("fence CONNECT ACL snapshot is ambiguous")
    for grant in value["database_acl_entries"]:
        if (
            not isinstance(grant, dict)
            or set(grant) != {"grantee", "grantor", "privilege_type", "is_grantable"}
            or not isinstance(grant["is_grantable"], bool)
            or not safe_text(grant["grantee"])
            or not safe_text(grant["grantor"])
            or grant["privilege_type"] not in {"CONNECT", "CREATE", "TEMPORARY"}
            or grant["grantor"] == "PUBLIC"
            or (
                grant["grantee"] != "PUBLIC"
                and SAFE_IDENTIFIER.fullmatch(grant["grantee"]) is None
            )
            or SAFE_IDENTIFIER.fullmatch(grant["grantor"]) is None
        ):
            raise CutoverError("fence database ACL snapshot is malformed")
    database_acl_keys = [
        (item["grantee"], item["grantor"], item["privilege_type"], item["is_grantable"])
        for item in value["database_acl_entries"]
    ]
    if len(database_acl_keys) != len(set(database_acl_keys)):
        raise CutoverError("fence database ACL snapshot is ambiguous")
    jobs = value["cron_jobs"]
    if any(
        not isinstance(item, dict)
        or set(item) != {"jobid", "active"}
        or isinstance(item["jobid"], bool)
        or not isinstance(item["jobid"], int)
        or item["jobid"] < 1
        or not isinstance(item["active"], bool)
        for item in jobs
    ):
        raise CutoverError("fence pg_cron snapshot is malformed")
    jobids = [item["jobid"] for item in jobs]
    if jobids != sorted(set(jobids)):
        raise CutoverError("fence pg_cron snapshot is ambiguous")
    settings = value["db_settings"]
    if any(not safe_text(item) for item in settings) or settings != sorted(set(settings)):
        raise CutoverError("fence database settings snapshot is malformed")
    return value


def has_connect(snapshot: dict[str, Any], role: str) -> bool:
    return any(
        item.get("grantee") in {role, "PUBLIC"}
        for item in snapshot["connect_acl"]
        if isinstance(item, dict)
    )


def default_transaction_read_only(snapshot: dict[str, Any]) -> str:
    settings = [
        item.split("=", 1)[1]
        for item in snapshot["db_settings"]
        if item.startswith("default_transaction_read_only=")
    ]
    if len(settings) > 1 or settings and settings[0] not in {"on", "off"}:
        raise CutoverError("fence default transaction setting is ambiguous")
    return settings[0] if settings else "off"


def rotation_settings_after_fence(before: dict[str, Any]) -> list[str]:
    return sorted(
        [
            item
            for item in before["db_settings"]
            if not item.startswith("default_transaction_read_only=")
        ]
        + ["default_transaction_read_only=on"]
    )


def validate_rotation_prior_fence(
    snapshot: dict[str, Any], credentials: dict[str, Any]
) -> dict[str, Any]:
    snapshot = validate_fence(snapshot, credentials)
    roles = {item["rolname"]: item for item in snapshot["roles"]}
    if (
        snapshot["effective_read_only"] != "off"
        or default_transaction_read_only(snapshot) != "off"
        or any(not roles[role]["rolcanlogin"] for role in role_names(credentials))
        or any(not has_connect(snapshot, role) for role in role_names(credentials))
    ):
        raise CutoverError("credential rotation prior fence state is already engaged or ambiguous")
    return snapshot


def validate_rotation_engaged_fence(
    snapshot: dict[str, Any],
    before: dict[str, Any],
    credentials: dict[str, Any],
) -> dict[str, Any]:
    snapshot = validate_fence(snapshot, credentials)
    before = validate_rotation_prior_fence(before, credentials)
    stable_keys = (
        "roles",
        "connect_acl",
        "database_acl",
        "database_acl_is_default",
        "database_acl_entries",
    )
    if any(snapshot[key] != before[key] for key in stable_keys):
        raise CutoverError("credential rotation changed role or database ACL state")
    if (
        snapshot["effective_read_only"] != "on"
        or default_transaction_read_only(snapshot) != "on"
        or snapshot["db_settings"] != rotation_settings_after_fence(before)
        or any(item["active"] for item in snapshot["cron_jobs"])
        or [item["jobid"] for item in snapshot["cron_jobs"]]
        != [item["jobid"] for item in before["cron_jobs"]]
    ):
        raise CutoverError("credential rotation read-only or pg_cron fence is not exact")
    return snapshot


def fence_engage_sql(credentials: dict[str, Any]) -> str:
    if credentials["source_fence_mode"] != "role_lockdown":
        raise CutoverError("credential_rotation requires adopt-fence after external password rotation")
    database = qid(credentials["source"]["dbname"])
    statements = ["/* aura:fence-engage */", "BEGIN;"]
    statements.extend(
        f"ALTER ROLE {qid(role)} NOLOGIN; REVOKE CONNECT ON DATABASE {database} FROM {qid(role)};"
        for role in credentials["source_writer_roles"]
    )
    statements.extend(
        [
            f"REVOKE CONNECT ON DATABASE {database} FROM PUBLIC;",
            f"GRANT CONNECT ON DATABASE {database} TO {qid(credentials['source_export_role'])};",
            "UPDATE cron.job SET active=false WHERE active;",
            "COMMIT;",
            f"ALTER DATABASE {database} SET default_transaction_read_only=on;",
        ]
    )
    return "\n".join(statements)


def release_sql(credentials: dict[str, Any], before: dict[str, Any]) -> str:
    before = validate_fence(before, credentials)
    if before["database_acl_is_default"]:
        raise CutoverError(
            "role_lockdown requires an explicit database ACL; datacl is NULL and cannot be restored exactly"
        )
    database = qid(credentials["source"]["dbname"])
    statements = [
        "/* aura:fence-release */",
        "SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE;",
        "SET default_transaction_read_only=off;",
        f"REVOKE ALL PRIVILEGES ON DATABASE {database} FROM PUBLIC;",
        "SELECT format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM %I',current_database(),rolname) "
        "FROM pg_roles \\gexec",
    ]
    role_map = {
        item.get("rolname"): item for item in before.get("roles", []) if isinstance(item, dict)
    }
    for role in role_names(credentials):
        if role not in role_map or not isinstance(role_map[role].get("rolcanlogin"), bool):
            raise CutoverError("invalid recorded role login state")
        state = "LOGIN" if role_map[role]["rolcanlogin"] else "NOLOGIN"
        statements.append(f"ALTER ROLE {qid(role)} {state};")
    if not before["database_acl_is_default"]:
        for grant in before["database_acl_entries"]:
            grantee = "PUBLIC" if grant["grantee"] == "PUBLIC" else qid(grant["grantee"])
            option = " WITH GRANT OPTION" if grant["is_grantable"] else ""
            statements.append(
                f"GRANT {grant['privilege_type']} ON DATABASE {database} TO {grantee}{option} "
                f"GRANTED BY {qid(grant['grantor'])};"
            )
    for grant in before.get("connect_acl", []):
        if (
            not isinstance(grant, dict)
            or set(grant) != {"grantee", "grantor", "is_grantable"}
            or not isinstance(grant["is_grantable"], bool)
            or not safe_text(grant["grantee"])
            or not safe_text(grant["grantor"])
        ):
            raise CutoverError("invalid recorded database CONNECT ACL")
        if grant["grantor"] == "PUBLIC":
            raise CutoverError("recorded database CONNECT grantor is invalid")
    settings = before.get("db_settings", [])
    if not isinstance(settings, list) or any(not isinstance(item, str) for item in settings):
        raise CutoverError("invalid recorded database settings")
    statements.append(f"ALTER DATABASE {database} RESET default_transaction_read_only;")
    for setting in settings:
        if setting.startswith("default_transaction_read_only="):
            value = setting.split("=", 1)[1]
            if value not in {"on", "off"}:
                raise CutoverError("invalid recorded default transaction setting")
            statements.append(
                f"ALTER DATABASE {database} SET default_transaction_read_only={value};"
            )
    jobs = before.get("cron_jobs", [])
    if not isinstance(jobs, list) or any(
        not isinstance(item, dict)
        or set(item) != {"jobid", "active"}
        or not isinstance(item["jobid"], int)
        or not isinstance(item["active"], bool)
        for item in jobs
    ):
        raise CutoverError("invalid recorded pg_cron state")
    statements.append("UPDATE cron.job SET active=false;")
    statements.extend(
        f"UPDATE cron.job SET active={'true' if item['active'] else 'false'} "
        f"WHERE jobid={item['jobid']};"
        for item in jobs
    )
    return "\n".join(statements)


def credential_rotation_release_sql(
    credentials: dict[str, Any], before: dict[str, Any]
) -> str:
    """Restore only the DB settings changed by the externally managed fence."""

    before = validate_rotation_prior_fence(before, credentials)
    database = qid(credentials["source"]["dbname"])
    statements = [
        "/* aura:credential-rotation-release */",
        "SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE;",
        "SET default_transaction_read_only=off;",
        f"ALTER DATABASE {database} RESET default_transaction_read_only;",
    ]
    if default_transaction_read_only(before) == "on":
        statements.append(f"ALTER DATABASE {database} SET default_transaction_read_only=on;")
    elif default_transaction_read_only(before) == "off" and any(
        item.startswith("default_transaction_read_only=") for item in before["db_settings"]
    ):
        statements.append(f"ALTER DATABASE {database} SET default_transaction_read_only=off;")
    statements.append("UPDATE cron.job SET active=false;")
    statements.extend(
        f"UPDATE cron.job SET active={'true' if item['active'] else 'false'} "
        f"WHERE jobid={item['jobid']};"
        for item in before["cron_jobs"]
    )
    return "\n".join(statements)


def fence_equal(first: dict[str, Any], second: dict[str, Any]) -> bool:
    return first == second


def export_probe(path: Path, credentials: dict[str, Any]) -> None:
    value = psql(
        "/* aura:export-path-probe */ SELECT "
        "json_build_object('database',current_database(),'user',current_user)::text;",
        path,
        "source",
        json_output=True,
    )
    expected = {
        "database": credentials["source"]["dbname"],
        "user": credentials["source_export_role"],
    }
    if value != expected:
        raise CutoverError("dedicated source export path did not remain available")


def _session_termination_sql(
    marker: str,
    database_names: Sequence[str],
    roles: Sequence[str] | None = None,
) -> str:
    databases = ",".join(qlit(name) for name in database_names)
    role_clause = ""
    if roles is not None:
        role_clause = " AND usename IN (" + ",".join(qlit(role) for role in roles) + ")"
    return (
        f"/* aura:{marker}-terminate */ SELECT coalesce(json_agg("
        "json_build_object('pid',pid,'terminated',pg_terminate_backend(pid)) "
        "ORDER BY pid), '[]'::json)::text FROM pg_stat_activity "
        f"WHERE datname IN ({databases}) AND pid<>pg_backend_pid(){role_clause};"
    )


def _session_remaining_sql(
    marker: str,
    database_names: Sequence[str],
    roles: Sequence[str] | None = None,
) -> str:
    databases = ",".join(qlit(name) for name in database_names)
    role_clause = ""
    if roles is not None:
        role_clause = " AND usename IN (" + ",".join(qlit(role) for role in roles) + ")"
    return (
        f"/* aura:{marker}-sessions */ SELECT coalesce(json_agg("
        "json_build_object('pid',pid,'user',usename,'application',application_name) "
        "ORDER BY pid), '[]'::json)::text FROM pg_stat_activity "
        f"WHERE datname IN ({databases}) AND pid<>pg_backend_pid(){role_clause};"
    )


def terminate_and_verify_sessions(
    path: Path,
    service: str,
    database_names: Sequence[str],
    *,
    roles: Sequence[str] | None = None,
    label: str,
) -> None:
    if not database_names or roles is not None and not roles:
        raise CutoverError("session termination scope is empty")
    terminated = psql(
        _session_termination_sql(label, database_names, roles),
        path,
        service,
        json_output=True,
    )
    if not isinstance(terminated, list) or any(
        not isinstance(item, dict)
        or set(item) != {"pid", "terminated"}
        or isinstance(item["pid"], bool)
        or not isinstance(item["pid"], int)
        or not isinstance(item["terminated"], bool)
        for item in terminated
    ):
        raise CutoverError(f"{label} session termination result is malformed")
    if any(not item["terminated"] for item in terminated):
        raise CutoverError(f"{label} session termination did not succeed")

    remaining = psql(
        _session_remaining_sql(label, database_names, roles),
        path,
        service,
        json_output=True,
    )
    if not isinstance(remaining, list) or any(
        not isinstance(item, dict)
        or set(item) != {"pid", "user", "application"}
        or isinstance(item["pid"], bool)
        or not isinstance(item["pid"], int)
        or not safe_text(item["user"])
        or item["application"] is not None
        and not safe_text(item["application"])
        for item in remaining
    ):
        raise CutoverError(f"{label} remaining session result is malformed")
    if remaining:
        raise CutoverError(f"{label} sessions remain after termination")


_WRITER_TRANSPORT_OR_AUTH_RE = re.compile(
    r"(?is)(?:password authentication failed|authentication failed|no pg_hba\.conf entry|"
    r"could not connect|connection (?:refused|timed out|reset)|could not translate host name|"
    r"server closed the connection unexpectedly|database .* does not exist|role .* does not exist|"
    r"ssl error|timeout expired|connection to server .* failed)"
)
_EXPECTED_WRITER_DENIAL_RE = re.compile(
    r"(?im)^\s*(?:FATAL|ERROR):\s+(?:"
    r"(?:42501:\s*)?permission denied for "
    r"(?:database|schema|table|relation|sequence|function|view|materialized view|type)\b"
    r"|(?:28000:\s*)?role\s+\"[^\"]+\"\s+is not permitted to log in\s*$)"
)
_CREDENTIAL_REJECTION_RE = re.compile(
    r"(?i)password authentication failed(?:\s+for\s+user\b)?"
)
_CREDENTIAL_TRANSPORT_RE = re.compile(
    r"(?i)(?:could not connect|connection (?:refused|timed out|reset)|"
    r"could not translate host name|server closed the connection unexpectedly|"
    r"ssl error|timeout expired|connection to server .* failed)"
)


def expected_writer_denial(stderr: str) -> bool:
    """Return true only for a known PostgreSQL authorization denial."""

    return bool(
        stderr
        and not _WRITER_TRANSPORT_OR_AUTH_RE.search(stderr)
        and _EXPECTED_WRITER_DENIAL_RE.search(stderr)
    )


def writer_probe(path: Path, service: str) -> None:
    try:
        psql_command(
            "/* aura:writer-reconnect-write-probe */ BEGIN; "
            "CREATE TABLE public.aura_cutover_write_probe(id integer); ROLLBACK;",
            path,
            service,
        )
    except ToolFailure as exc:
        if expected_writer_denial(exc.stderr):
            return
        raise CutoverError("source writer probe failed with a non-authorization diagnostic") from None
    raise CutoverError("source writer role still reconnects and can reach a write probe")


def expected_old_credential_rejection(stderr: str) -> bool:
    """Return true only for password authentication rejection, not transport failure."""

    return bool(
        stderr
        and _CREDENTIAL_REJECTION_RE.search(stderr)
        and not _CREDENTIAL_TRANSPORT_RE.search(stderr)
    )


def credential_acceptance_probe(path: Path, service: str, label: str) -> None:
    try:
        psql_command(
            "/* aura:credential-acceptance-probe */ SELECT 1;",
            path,
            service,
        )
    except ToolFailure:
        raise CutoverError(f"{label} credential was not accepted") from None


def credential_rejection_probe(path: Path, service: str, label: str) -> None:
    try:
        psql_command(
            "/* aura:old-writer-reconnect-write-probe */ BEGIN; "
            "CREATE TABLE public.aura_cutover_old_writer_probe(id integer); ROLLBACK;",
            path,
            service,
        )
    except ToolFailure as exc:
        if expected_old_credential_rejection(exc.stderr):
            return
        raise CutoverError(f"{label} credential did not fail password authentication") from None
    raise CutoverError(f"{label} credential remains active")


def engage_fence(state: Path, path: Path, credentials: dict[str, Any]) -> None:
    if credentials["source_fence_mode"] != "role_lockdown":
        raise CutoverError("credential_rotation requires adopt-fence after external password rotation")
    journal = read_journal(state)
    require_preflight(journal, credentials)
    require_phase(journal, "preflight-complete", "fence-engaging", "fence-engage-partial-failure")
    require_marker(journal, path, "source", "source_marker")
    if journal.get("fence", {}).get("engaged"):
        raise CutoverError("write fence is already engaged")

    if journal["phase"] == "preflight-complete":
        before = validate_fence(
            psql(fence_inspect_sql(credentials), path, "source", json_output=True),
            credentials,
        )
    else:
        recorded_before = journal.get("fence", {}).get("before")
        if not isinstance(recorded_before, dict):
            raise CutoverError("partial fence journal is missing its complete before snapshot")
        before = validate_fence(recorded_before, credentials)
    if before["effective_read_only"] not in {"on", "off"} or any(
        not has_connect(before, role) for role in role_names(credentials)
    ):
        raise CutoverError("writer or export role did not have enforceable source CONNECT state")
    journal.update(
        phase="fence-engaging",
        fence={
            "mode": "role_lockdown",
            "engaged": False,
            "release_required": True,
            "before": before,
        },
    )
    write_journal(state, journal)
    try:
        psql(fence_engage_sql(credentials), path, "source")
        after = validate_fence(
            psql(fence_inspect_sql(credentials), path, "source", json_output=True),
            credentials,
        )
        roles = {item["rolname"]: item for item in after["roles"]}
        if any(roles[role]["rolcanlogin"] for role in credentials["source_writer_roles"]) or any(
            item.get("grantee") in set(credentials["source_writer_roles"]) | {"PUBLIC"}
            for item in after["connect_acl"]
        ):
            raise CutoverError("source writer login or CONNECT fence was not exact")
        if after["effective_read_only"] != "on":
            raise CutoverError("source database did not enter effective read-only mode")
        if not roles[credentials["source_export_role"]]["rolcanlogin"] or not has_connect(
            after, credentials["source_export_role"]
        ):
            raise CutoverError("dedicated export role was fenced")
        terminate_and_verify_sessions(
            path,
            "source",
            [credentials["source"]["dbname"]],
            roles=credentials["source_writer_roles"],
            label="writer",
        )
        export_probe(path, credentials)
        for index, _role in enumerate(credentials["source_writer_roles"]):
            writer_probe(path, f"writer_{index}")
    except CutoverError:
        journal["phase"] = "fence-engage-partial-failure"
        write_journal(state, journal)
        raise
    journal["phase"] = "fence-engaged"
    journal["fence"].update(engaged=True, after=after)
    write_journal(state, journal)


def adopt_fence(state: Path, path: Path, credentials: dict[str, Any]) -> None:
    if credentials["source_fence_mode"] != "credential_rotation":
        raise CutoverError("adopt-fence is only valid for credential_rotation")
    journal = read_journal(state)
    require_preflight(journal, credentials)
    require_phase(journal, "preflight-complete", "fence-adopting", "fence-adopt-partial-failure")
    fence = journal.get("fence")
    if (
        not isinstance(fence, dict)
        or fence.get("mode") != "credential_rotation"
        or fence.get("engaged") is not False
        or not isinstance(fence.get("before"), dict)
    ):
        raise CutoverError("credential rotation requires an unengaged preflight fence snapshot")
    if journal["phase"] == "preflight-complete":
        if fence.get("release_required") is True:
            raise CutoverError("credential rotation fence journal is ambiguous")
        fence["release_required"] = True
    elif fence.get("release_required") is not True:
        raise CutoverError("partial credential rotation fence journal is not retryable")
    before = validate_rotation_prior_fence(fence["before"], credentials)
    journal["phase"] = "fence-adopting"
    write_journal(state, journal)
    try:
        require_marker(journal, path, "source", "source_marker")
        credential_rejection_probe(path, "writer_0", "old source writer")
        credential_acceptance_probe(path, "source", "temporary export")
        terminate_and_verify_sessions(
            path,
            "source",
            [credentials["source"]["dbname"]],
            roles=credentials["source_writer_roles"],
            label="rotation",
        )
        after = validate_rotation_engaged_fence(
            psql(fence_inspect_sql(credentials), path, "source", json_output=True),
            before,
            credentials,
        )
        export_probe(path, credentials)
    except CutoverError:
        journal["phase"] = "fence-adopt-partial-failure"
        write_journal(state, journal)
        raise
    journal["phase"] = "fence-engaged"
    journal["fence"].update(engaged=True, after=after)
    write_journal(state, journal)


def release_credential_rotation_fence(
    state: Path,
    path: Path,
    credentials: dict[str, Any],
    journal: dict[str, Any],
) -> None:
    fence = journal.get("fence")
    if (
        not isinstance(fence, dict)
        or fence.get("mode") != "credential_rotation"
        or fence.get("engaged") is not True
        or fence.get("release_required") is not True
        or not isinstance(fence.get("before"), dict)
    ):
        raise CutoverError("completed credential rotation adoption is required before release")
    before = validate_rotation_prior_fence(fence["before"], credentials)
    try:
        credential_rejection_probe(path, "source", "temporary")
        credential_acceptance_probe(path, "writer_0", "restored old source writer")
        require_marker(journal, path, "writer_0", "source_marker")
        terminate_and_verify_sessions(
            path,
            "writer_0",
            [credentials["source"]["dbname"]],
            roles=credentials["source_writer_roles"],
            label="rotation-release",
        )
        psql(credential_rotation_release_sql(credentials, before), path, "writer_0")
        after = validate_fence(
            psql(fence_inspect_sql(credentials), path, "writer_0", json_output=True),
            credentials,
        )
        if not fence_equal(before, after):
            raise CutoverError("complete source fence snapshot was not restored exactly")
        credential_acceptance_probe(path, "writer_0", "restored old source writer")
        credential_rejection_probe(path, "source", "temporary")
    except CutoverError:
        journal["phase"] = "fence-release-partial-failure"
        write_journal(state, journal)
        raise
    journal["phase"] = "fence-released"
    journal["fence"].update(engaged=False, release_required=False, after_release=after)
    write_journal(state, journal)


def release_fence(state: Path, path: Path, credentials: dict[str, Any]) -> None:
    journal = read_journal(state)
    require_preflight(journal, credentials)
    require_phase(
        journal,
        "fence-engaged",
        "fence-engaging",
        "fence-engage-partial-failure",
        "fence-adopt-partial-failure",
        "fence-release-partial-failure",
        "candidate-verify-complete",
        "promotion-started",
        "promotion-recovered",
        "promotion-complete",
        "rollback-started",
        "rollback-recovered",
        "rolled-back",
    )
    fence = journal.get("fence", {})
    if (
        not isinstance(fence, dict)
        or fence.get("release_required") is not True
        or not isinstance(fence.get("before"), dict)
    ):
        raise CutoverError("engaged or partially engaged fence journal is required")
    if credentials["source_fence_mode"] == "credential_rotation":
        release_credential_rotation_fence(state, path, credentials, journal)
        return
    require_marker(journal, path, "source", "source_marker")
    try:
        terminate_and_verify_sessions(
            path,
            "source",
            [credentials["source"]["dbname"]],
            roles=credentials["source_writer_roles"],
            label="release-writer",
        )
        psql(release_sql(credentials, fence["before"]), path, "source")
        after = validate_fence(
            psql(fence_inspect_sql(credentials), path, "source", json_output=True),
            credentials,
        )
        if not fence_equal(fence["before"], after):
            raise CutoverError(
                "complete source fence snapshot was not restored exactly"
            )
    except CutoverError:
        journal["phase"] = "fence-release-partial-failure"
        write_journal(state, journal)
        raise
    journal["phase"] = "fence-released"
    journal["fence"].update(engaged=False, release_required=False, after_release=after)
    write_journal(state, journal)


def archive_args(scope: str, output: Path) -> list[str]:
    base = [
        os.environ.get("PG_DUMP_BIN", "pg_dump"),
        "--format=custom",
        "--no-owner",
        "--no-acl",
        f"--file={output}",
    ]
    if scope == "public":
        return base + ["--schema=public"]
    if scope == "auth":
        return base + ["--data-only", "--schema=auth"]
    if scope == "storage":
        return base + [
            "--data-only",
            "--table=storage.buckets",
            "--table=storage.objects",
        ]
    raise CutoverError("unsupported archive scope")


def entries(listing: str) -> list[tuple[str, str]]:
    pattern = re.compile(
        r"\b(TABLE DATA|TABLE|SEQUENCE SET|SEQUENCE|VIEW|MATERIALIZED VIEW|"
        r"FUNCTION|INDEX|TRIGGER|CONSTRAINT|SCHEMA|TYPE|DEFAULT) "
        r"(?:- )?([^ .]+)(?: ([^ ]+))?"
    )
    result: list[tuple[str, str]] = []
    for line in listing.splitlines():
        if not line or line.startswith(";"):
            continue
        match = pattern.search(line)
        if match:
            result.append(
                (match.group(2), "" if match.group(1) == "SCHEMA" else match.group(3) or "")
            )
    return result


def validate_archive(scope: str, listing: str) -> None:
    found = entries(listing)
    if not found or {item[0] for item in found} != {scope}:
        raise CutoverError(f"{scope} archive contains an out-of-scope or empty listing")
    tables = {item[1] for item in found if item[1]}
    if scope == "storage" and tables != {"buckets", "objects"}:
        raise CutoverError("storage archive scope is not exact")
    if scope == "auth" and not tables:
        raise CutoverError("auth archive has no table data")


def dump_archive(scope: str, output: Path, path: Path, service: str) -> None:
    run_tool(archive_args(scope, output), path, service)
    if output.is_symlink() or not output.is_file():
        raise CutoverError(f"{scope} archive was not created safely")
    os.chmod(output, 0o600)
    listing = run_tool(
        [os.environ.get("PG_RESTORE_BIN", "pg_restore"), "--list", str(output)],
        path,
        service,
        capture=True,
    )
    validate_archive(scope, listing)


def artifact_records(directory: Path) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for scope, filename in ARCHIVE_NAMES.items():
        archive = directory / filename
        if archive.is_symlink() or not archive.is_file():
            raise CutoverError(f"{scope} archive was not created safely")
        result[scope] = {
            "file": filename,
            "sha256": file_digest(archive),
            "size": archive.stat().st_size,
        }
    return result


def artifact_records_are_exact(value: Any) -> bool:
    if not isinstance(value, dict) or set(value) != set(ARCHIVE_NAMES):
        return False
    for scope, filename in ARCHIVE_NAMES.items():
        record = value[scope]
        if not isinstance(record, dict) or set(record) != {"file", "sha256", "size"}:
            return False
        if record["file"] != filename:
            return False
        if (
            not isinstance(record["sha256"], str)
            or re.fullmatch(r"[0-9a-f]{64}", record["sha256"]) is None
        ):
            return False
        if (
            isinstance(record["size"], bool)
            or not isinstance(record["size"], int)
            or record["size"] < 0
        ):
            return False
    return True


def manifest(directory: Path, path: Path, journal: dict[str, Any]) -> dict[str, Any]:
    artifacts = artifact_records(directory)
    return {
        "format": JOURNAL_FORMAT,
        "source_marker": journal["source_marker"],
        "source_catalog_digest": journal["preflight"]["source_catalog_digest"],
        "source_data_digest": digest(data_snapshot(path, "source")),
        "artifacts": artifacts,
    }


def remove_partial_artifacts(directory: Path) -> None:
    """Remove only a known, regular-file artifact tree before an export retry."""

    if not os.path.lexists(directory):
        return
    info = os.lstat(directory)
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise CutoverError("partial artifact directory is not a real directory")
    allowed = set(ARCHIVE_NAMES.values()) | {"manifest.json"}
    for child in directory.iterdir():
        child_info = os.lstat(child)
        if stat.S_ISLNK(child_info.st_mode) or not stat.S_ISREG(child_info.st_mode):
            raise CutoverError("partial artifact tree contains an unsafe entry")
        if child.name not in allowed and not child.name.startswith(".manifest.json."):
            raise CutoverError("partial artifact tree contains an unexpected entry")
        child.unlink()
    directory.rmdir()


def export_archives(state: Path, path: Path, credentials: dict[str, Any]) -> None:
    journal = read_journal(state)
    require_preflight(journal, credentials)
    require_phase(journal, "fence-engaged", "export-started", "export-partial-failure")
    if journal.get("fence", {}).get("engaged") is not True:
        raise CutoverError("engaged source fence is required")
    require_marker(journal, path, "source", "source_marker")
    directory = state / "artifacts"
    if journal["phase"] in {"export-started", "export-partial-failure"}:
        remove_partial_artifacts(directory)
    elif os.path.lexists(directory):
        raise CutoverError("artifact directory already exists")
    directory.mkdir(mode=0o700)
    journal["phase"] = "export-started"
    write_journal(state, journal)
    try:
        for scope, filename in ARCHIVE_NAMES.items():
            dump_archive(scope, directory / filename, path, "source")
        artifact_manifest = manifest(directory, path, journal)
        atomic_json(directory / "manifest.json", artifact_manifest)
    except (CutoverError, OSError):
        journal["phase"] = "export-partial-failure"
        write_journal(state, journal)
        raise
    journal.update(
        phase="export-complete",
        artifacts=artifact_manifest["artifacts"],
        manifest={
            key: artifact_manifest[key]
            for key in (
                "format",
                "source_marker",
                "source_catalog_digest",
                "source_data_digest",
            )
        },
    )
    write_journal(state, journal)


def verify_manifest(
    directory: Path,
    marker: Any,
    path: Path,
    service: str,
) -> dict[str, Any]:
    document = parse_json_file(directory / "manifest.json", "artifact manifest")
    if (
        document.get("format") != JOURNAL_FORMAT
        or document.get("source_marker") != marker
        or set(document.get("artifacts", {})) != set(ARCHIVE_NAMES)
    ):
        raise CutoverError("artifact manifest identity or scope mismatch")
    for scope, filename in ARCHIVE_NAMES.items():
        record = document["artifacts"].get(scope)
        archive = directory / filename
        if (
            not isinstance(record, dict)
            or set(record) != {"file", "sha256", "size"}
            or record["file"] != filename
            or archive.is_symlink()
            or not archive.is_file()
            or archive.stat().st_size != record["size"]
            or file_digest(archive) != record["sha256"]
        ):
            raise CutoverError(f"{scope} archive digest mismatch")
        listing = run_tool(
            [os.environ.get("PG_RESTORE_BIN", "pg_restore"), "--list", str(archive)],
            path,
            service,
            capture=True,
        )
        validate_archive(scope, listing)
    return document


def restore_scopes(directory: Path, path: Path, service: str = "candidate") -> None:
    if service != "candidate":
        raise CutoverError("restore is permitted only against the isolated candidate database")
    public_archive = directory / ARCHIVE_NAMES["public"]
    run_tool(
        [
            os.environ.get("PG_RESTORE_BIN", "pg_restore"),
            "--clean",
            "--if-exists",
            "--exit-on-error",
            "--no-owner",
            "--no-acl",
            "--single-transaction",
            str(public_archive),
        ],
        path,
        service,
    )
    for scope in ("auth", "storage"):
        archive = directory / ARCHIVE_NAMES[scope]
        listing = run_tool(
            [os.environ.get("PG_RESTORE_BIN", "pg_restore"), "--list", str(archive)],
            path,
            service,
            capture=True,
        )
        tables = sorted({table for kind, table in entries(listing) if kind == scope and table})
        validate_archive(scope, listing)
        if any(SAFE_IDENTIFIER.fullmatch(table) is None for table in tables):
            raise CutoverError("archive contains an unsafe table identifier")
        qualified = ", ".join(f"{qid(scope)}.{qid(table)}" for table in tables)
        psql(
            f"/* aura:truncate-{scope} */ BEGIN; TRUNCATE TABLE {qualified} "
            "RESTART IDENTITY; COMMIT;",
            path,
            service,
        )
        run_tool(
            [
                os.environ.get("PG_RESTORE_BIN", "pg_restore"),
                "--exit-on-error",
                "--no-owner",
                "--no-acl",
                "--single-transaction",
                str(archive),
            ],
            path,
            service,
        )


def databases(path: Path, credentials: dict[str, Any]) -> set[str]:
    names = db_names(credentials)
    listed = psql(
        "/* aura:database-names */ SELECT coalesce(json_agg(datname ORDER BY datname), '[]'::json)::text "
        "FROM pg_database WHERE datname IN ("
        + ",".join(qlit(names[key]) for key in ("target", "candidate", "rollback"))
        + ");",
        path,
        "target_admin",
        json_output=True,
    )
    if not isinstance(listed, list) or any(not isinstance(item, str) for item in listed):
        raise CutoverError("database existence probe is malformed")
    return set(listed)


def quiesce(
    path: Path,
    credentials: dict[str, Any],
    include_candidate: bool = True,
    include_rollback: bool = True,
    *,
    database_keys: Sequence[str] | None = None,
) -> None:
    names = db_names(credentials)
    if database_keys is None:
        selected = [names["target"]]
        if include_candidate:
            selected.append(names["candidate"])
        if include_rollback:
            selected.append(names["rollback"])
    else:
        if any(key not in {"target", "candidate", "rollback"} for key in database_keys):
            raise CutoverError("database quiescence scope is invalid")
        selected = [names[key] for key in database_keys]
    terminate_and_verify_sessions(
        path,
        "target_admin",
        selected,
        label="target",
    )


def drop_candidate(path: Path, credentials: dict[str, Any]) -> None:
    names = db_names(credentials)
    if names["candidate"] not in databases(path, credentials):
        return
    quiesce(path, credentials, database_keys=("candidate",))
    require_stopped(credentials)
    psql(
        f"/* aura:candidate-drop */ DROP DATABASE IF EXISTS {qid(names['candidate'])};",
        path,
        "target_admin",
    )
    if names["candidate"] in databases(path, credentials):
        raise CutoverError("partial candidate database was not removed")


def create_candidate_database(path: Path, credentials: dict[str, Any]) -> dict[str, Any]:
    names = db_names(credentials)
    if databases(path, credentials) & {names["candidate"], names["rollback"]}:
        raise CutoverError("deterministic candidate or rollback database already exists")
    quiesce(path, credentials, include_candidate=False, include_rollback=False)
    require_stopped(credentials)
    psql(
        f"/* aura:candidate-create */ CREATE DATABASE {qid(names['candidate'])} "
        f"WITH TEMPLATE {qid(names['target'])};",
        path,
        "target_admin",
    )
    marker = validate_marker(psql(MARKER_SQL, path, "candidate", json_output=True), "candidate")
    if (
        names["candidate"] not in databases(path, credentials)
        or marker["database"] != names["candidate"]
    ):
        raise CutoverError("candidate database was not created")
    return marker


def create_candidate(state: Path, path: Path, credentials: dict[str, Any]) -> None:
    journal = read_journal(state)
    require_preflight(journal, credentials)
    require_phase(
        journal,
        "fence-engaged",
        "export-complete",
        "candidate-create-started",
        "candidate-create-partial-failure",
    )
    if journal.get("fence", {}).get("engaged") is not True:
        raise CutoverError("source write fence is required before candidate creation")
    require_stopped(credentials)
    names = db_names(credentials)
    if journal["phase"] in {"candidate-create-started", "candidate-create-partial-failure"}:
        drop_candidate(path, credentials)
    if names["rollback"] in databases(path, credentials):
        raise CutoverError("deterministic rollback database already exists")
    journal["phase"] = "candidate-create-started"
    write_journal(state, journal)
    try:
        marker = create_candidate_database(path, credentials)
    except (CutoverError, OSError):
        journal["phase"] = "candidate-create-partial-failure"
        write_journal(state, journal)
        raise
    journal.update(
        phase="candidate-created",
        candidate={"database": names["candidate"]},
    )
    write_journal(state, journal)


def candidate_restore(state: Path, path: Path, credentials: dict[str, Any]) -> None:
    journal = read_journal(state)
    require_preflight(journal, credentials)
    require_phase(
        journal,
        "candidate-created",
        "candidate-restore-started",
        "candidate-restore-partial-failure",
    )
    if journal.get("fence", {}).get("engaged") is not True:
        raise CutoverError("source write fence is required before candidate restore")
    require_stopped(credentials)
    if journal["phase"] in {"candidate-restore-started", "candidate-restore-partial-failure"}:
        # auth/storage restore is intentionally non-transactional; discard the isolated
        # candidate and reclone the target before any retry.
        drop_candidate(path, credentials)
        marker = create_candidate_database(path, credentials)
        journal.update(
            phase="candidate-created",
            candidate={"database": db_names(credentials)["candidate"], "marker": marker},
        )
        write_journal(state, journal)
    artifact_manifest = verify_manifest(
        state / "artifacts", journal["source_marker"], path, "candidate"
    )
    before_catalog = catalog(path, "candidate")
    before_data = data_snapshot(path, "candidate")
    if (
        digest(before_catalog) != journal["preflight"]["target_catalog_digest"]
        or digest(before_data) != journal["preflight"]["target_data_digest"]
    ):
        raise CutoverError("candidate clone does not exactly match the current target")
    journal["candidate_before_restore"] = {
        "catalog_digest": digest(before_catalog),
        "data_digest": digest(before_data),
    }
    journal["phase"] = "candidate-restore-started"
    write_journal(state, journal)
    try:
        require_stopped(credentials)
        restore_scopes(state / "artifacts", path)
    except (CutoverError, OSError):
        journal["phase"] = "candidate-restore-partial-failure"
        write_journal(state, journal)
        raise
    journal.update(
        phase="candidate-restore-complete",
        manifest={
            key: artifact_manifest[key]
            for key in (
                "format",
                "source_marker",
                "source_catalog_digest",
                "source_data_digest",
            )
        },
    )
    write_journal(state, journal)


def candidate_verify(state: Path, path: Path, credentials: dict[str, Any]) -> None:
    journal = read_journal(state)
    require_preflight(journal, credentials)
    require_phase(journal, "candidate-restore-complete")
    if journal.get("fence", {}).get("engaged") is not True:
        raise CutoverError("source write fence is required before candidate verification")
    require_marker(journal, path, "source", "source_marker")
    source_catalog = catalog(path, "source")
    candidate_catalog = catalog(path, "candidate")
    compare_catalogs(source_catalog, candidate_catalog)
    source_data = data_snapshot(path, "source")
    candidate_data = data_snapshot(path, "candidate")
    compare_data_snapshots(source_data, candidate_data)
    if (
        digest(source_catalog) != journal["manifest"]["source_catalog_digest"]
        or digest(source_data) != journal["manifest"]["source_data_digest"]
    ):
        raise CutoverError("candidate or fenced-source verification does not exactly match")
    journal.update(
        phase="candidate-verify-complete",
        verification={
            "catalog_digest": digest(candidate_catalog),
            "data_digest": digest(candidate_data),
            "migration_digest": digest(candidate_catalog["migrations"]),
            "auth_catalog_digest": digest(auth_scope(candidate_catalog)),
        },
    )
    write_journal(state, journal)


def rename_database(path: Path, old: str, new: str) -> None:
    if old == new:
        raise CutoverError("database rename names must differ")
    psql(
        f"/* aura:database-rename */ ALTER DATABASE {qid(old)} RENAME TO {qid(new)};",
        path,
        "target_admin",
    )


def rename_after_quiesce(
    path: Path,
    credentials: dict[str, Any],
    old: str,
    new: str,
) -> None:
    require_stopped(credentials)
    quiesce(path, credentials, include_candidate=True, include_rollback=True)
    require_stopped(credentials)
    rename_database(path, old, new)


def promotion_inputs(state: Path, path: Path, credentials: dict[str, Any]) -> dict[str, Any]:
    journal = read_journal(state)
    require_preflight(journal, credentials)
    require_phase(journal, "candidate-verify-complete", "promotion-recovered")
    if journal.get("fence", {}).get("engaged") is not True or journal.get("rollback_available"):
        raise CutoverError("verified candidate and engaged source fence are required")
    require_stopped(credentials)
    require_marker(journal, path, "target", "target_marker")
    if (
        digest(catalog(path, "target")) != journal["preflight"]["target_catalog_digest"]
        or digest(data_snapshot(path, "target")) != journal["preflight"]["target_data_digest"]
    ):
        raise CutoverError("current target changed before promotion")
    if digest(catalog(path, "candidate")) != journal.get("verification", {}).get(
        "catalog_digest"
    ) or digest(data_snapshot(path, "candidate")) != journal.get("verification", {}).get(
        "data_digest"
    ):
        raise CutoverError("verified candidate changed before promotion")
    candidate_marker = validate_marker(
        psql(MARKER_SQL, path, "candidate", json_output=True), "candidate"
    )
    expected_candidate = db_names(credentials)["candidate"]
    if candidate_marker["database"] != expected_candidate:
        raise CutoverError("candidate database marker is not deterministic")
    quiesce(path, credentials)
    journal["promotion"] = {
        "step": 0,
        "candidate_marker": candidate_marker,
        "target_marker_before": journal["target_marker"],
    }
    return journal


def promoted_target_matches_verification(
    path: Path,
    credentials: dict[str, Any],
    journal: dict[str, Any],
) -> dict[str, Any]:
    names = db_names(credentials)
    marker = validate_marker(psql(MARKER_SQL, path, "target", json_output=True), "promoted target")
    candidate_marker = journal.get("promotion", {}).get("candidate_marker")
    candidate_identity = identity_from_marker(candidate_marker, "candidate")
    target_identity = identity_from_marker(marker, "promoted target")
    expected_identity = dict(candidate_identity)
    expected_identity["database"] = names["target"]
    if target_identity != expected_identity:
        raise CutoverError("renamed target identity does not match the verified candidate")
    if (
        digest(catalog(path, "target")) != journal["verification"]["catalog_digest"]
        or digest(data_snapshot(path, "target")) != journal["verification"]["data_digest"]
    ):
        raise CutoverError("renamed target does not match the verified candidate")
    return marker


def recover_promotion(
    path: Path,
    credentials: dict[str, Any],
    journal: dict[str, Any],
) -> str:
    names = db_names(credentials)
    current = databases(path, credentials)
    before = {names["target"], names["candidate"]}
    first_rename = {names["rollback"], names["candidate"]}
    final = {names["target"], names["rollback"]}
    if current == before:
        return "reset"
    if current == first_rename:
        rename_after_quiesce(path, credentials, names["rollback"], names["target"])
        return "reset"
    if current == final:
        try:
            promoted_target_matches_verification(path, credentials, journal)
        except CutoverError:
            rename_after_quiesce(path, credentials, names["target"], names["candidate"])
            rename_after_quiesce(path, credentials, names["rollback"], names["target"])
            return "reset"
        return "complete"
    raise CutoverError("promotion state is not automatically recoverable")


def validate_promotion_manifest(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != PROMOTION_MANIFEST_KEYS:
        raise CutoverError("promotion manifest fields do not match the exact format")
    if value["format"] != PROMOTION_MANIFEST_FORMAT or value["phase"] != "promotion-complete":
        raise CutoverError("promotion manifest must be format 1 and promotion-complete")
    if value["fence"] != {"engaged": True}:
        raise CutoverError("promotion manifest fence must be engaged")
    if not artifact_records_are_exact(value["artifacts"]):
        raise CutoverError("promotion manifest artifact scope is not exact")
    for label in ("source_identity", "target_identity", "candidate_identity"):
        validate_identity(value[label], label)
    rollback_name = value["promotion_rollback_db"]
    if not isinstance(rollback_name, str) or SAFE_IDENTIFIER.fullmatch(rollback_name) is None:
        raise CutoverError("promotion manifest rollback database is not a safe name")
    if (
        not isinstance(value["db_journal_sha256"], str)
        or re.fullmatch(r"[0-9a-f]{64}", value["db_journal_sha256"]) is None
    ):
        raise CutoverError("promotion manifest DB journal digest is invalid")
    return value


def promotion_manifest_from_journal(state: Path, journal: dict[str, Any]) -> dict[str, Any]:
    if journal.get("phase") != "promotion-complete":
        raise CutoverError("promotion manifest requires promotion-complete journal state")
    if journal.get("fence", {}).get("engaged") is not True:
        raise CutoverError("promotion manifest requires the engaged writer fence")
    promotion = journal.get("promotion")
    if not isinstance(promotion, dict) or promotion.get("step") != 3:
        raise CutoverError("promotion manifest requires both completed renames")
    artifacts = artifact_records(state / "artifacts")
    if journal.get("artifacts") != artifacts:
        raise CutoverError("promotion artifacts no longer match the rich journal")
    source_identity = identity_from_marker(journal["source_marker"], "source")
    candidate_identity = identity_from_marker(promotion.get("candidate_marker"), "candidate")
    target_identity = identity_from_marker(promotion.get("target_marker_after"), "target")
    rollback_name = journal.get("contract", {}).get("rollback_database")
    if not isinstance(rollback_name, str) or SAFE_IDENTIFIER.fullmatch(rollback_name) is None:
        raise CutoverError("promotion rollback database is not a safe name")
    journal_path = state / JOURNAL_FILENAME
    if journal_path.is_symlink() or not journal_path.is_file():
        raise CutoverError("rich promotion journal is missing")
    return validate_promotion_manifest(
        {
            "format": PROMOTION_MANIFEST_FORMAT,
            "phase": "promotion-complete",
            "fence": {"engaged": True},
            "artifacts": artifacts,
            "source_identity": source_identity,
            "target_identity": target_identity,
            "candidate_identity": candidate_identity,
            "promotion_rollback_db": rollback_name,
            "db_journal_sha256": file_digest(journal_path),
        }
    )


def write_promotion_manifest(state: Path, journal: dict[str, Any]) -> dict[str, Any]:
    path = state / PROMOTION_MANIFEST_FILENAME
    if os.path.lexists(path):
        raise CutoverError("promotion manifest already exists")
    value = promotion_manifest_from_journal(state, journal)
    atomic_json(path, value, mode=0o600)
    return value


def remove_promotion_manifest(state: Path) -> None:
    path = state / PROMOTION_MANIFEST_FILENAME
    if not os.path.lexists(path):
        return
    info = os.lstat(path)
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        raise CutoverError("promotion manifest is not a safe regular file")
    path.unlink()
    sync_directory(state)


def complete_promotion(
    state: Path,
    path: Path,
    credentials: dict[str, Any],
    journal: dict[str, Any],
) -> None:
    target_marker = promoted_target_matches_verification(path, credentials, journal)
    journal["promotion"]["target_marker_after"] = target_marker
    journal["promotion"]["verified"] = True
    journal["promotion"]["step"] = 3
    journal["phase"] = "promotion-complete"
    journal["rollback_available"] = True
    write_journal(state, journal)
    write_promotion_manifest(state, journal)


def promote(state: Path, path: Path, credentials: dict[str, Any]) -> None:
    journal = read_journal(state)
    require_preflight(journal, credentials)
    if journal.get("phase") == "promotion-complete":
        if os.path.lexists(state / PROMOTION_MANIFEST_FILENAME):
            document = parse_json_file(state / PROMOTION_MANIFEST_FILENAME, "promotion manifest")
            validate_promotion_manifest(document)
            return
        write_promotion_manifest(state, journal)
        return
    if journal.get("phase") == "promotion-started":
        require_stopped(credentials)
        try:
            status = recover_promotion(path, credentials, journal)
        except CutoverError:
            journal["phase"] = "promotion-recovery-required"
            write_journal(state, journal)
            raise
        if status == "complete":
            complete_promotion(state, path, credentials, journal)
            return
        journal["phase"] = "promotion-recovered"
        write_journal(state, journal)
        raise CutoverError(
            "interrupted promotion was recovered; rerun promotion after preflight gates"
        )

    journal = promotion_inputs(state, path, credentials)
    names = db_names(credentials)
    if databases(path, credentials) != {names["target"], names["candidate"]}:
        raise CutoverError("promotion requires exactly the target and candidate databases")
    journal["phase"] = "promotion-started"
    write_journal(state, journal)
    try:
        rename_after_quiesce(path, credentials, names["target"], names["rollback"])
        journal["promotion"]["step"] = 1
        write_journal(state, journal)
        rename_after_quiesce(path, credentials, names["candidate"], names["target"])
        journal["promotion"]["step"] = 2
        write_journal(state, journal)
        promoted_target_matches_verification(path, credentials, journal)
    except CutoverError:
        try:
            status = recover_promotion(path, credentials, journal)
        except CutoverError:
            journal["phase"] = "promotion-recovery-required"
            write_journal(state, journal)
            raise
        if status == "complete":
            complete_promotion(state, path, credentials, journal)
            return
        journal["phase"] = "promotion-recovered"
        write_journal(state, journal)
        raise
    complete_promotion(state, path, credentials, journal)


def rolled_back_target_matches_original(
    path: Path, credentials: dict[str, Any], journal: dict[str, Any]
) -> None:
    marker = validate_marker(
        psql(MARKER_SQL, path, "target", json_output=True), "rolled-back target"
    )
    if identity_from_marker(marker, "rolled-back target") != identity_from_marker(
        journal["target_marker"], "original target"
    ):
        raise CutoverError("rolled-back target identity does not match the original target")
    if (
        digest(catalog(path, "target")) != journal["preflight"]["target_catalog_digest"]
        or digest(data_snapshot(path, "target")) != journal["preflight"]["target_data_digest"]
    ):
        raise CutoverError("rolled-back target does not match the original target")


def recover_rollback(path: Path, credentials: dict[str, Any], journal: dict[str, Any]) -> str:
    names = db_names(credentials)
    current = databases(path, credentials)
    before = {names["target"], names["rollback"]}
    first_rename = {names["candidate"], names["rollback"]}
    final = {names["target"], names["candidate"]}
    if current == before:
        return "reset"
    if current == first_rename:
        rename_after_quiesce(path, credentials, names["candidate"], names["target"])
        return "reset"
    if current == final:
        try:
            rolled_back_target_matches_original(path, credentials, journal)
        except CutoverError:
            rename_after_quiesce(path, credentials, names["target"], names["rollback"])
            rename_after_quiesce(path, credentials, names["candidate"], names["target"])
            return "reset"
        return "complete"
    raise CutoverError("rollback state is not automatically recoverable")


def rollback(state: Path, path: Path, credentials: dict[str, Any]) -> None:
    journal = read_journal(state)
    require_preflight(journal, credentials)
    require_rollback_not_sealed(state)
    if journal.get("phase") == "rollback-started":
        require_stopped(credentials)
        try:
            status = recover_rollback(path, credentials, journal)
        except CutoverError:
            journal["phase"] = "rollback-recovery-required"
            write_journal(state, journal)
            raise
        if status == "complete":
            journal["phase"] = "rolled-back"
            journal["rollback_available"] = False
            journal["rollback"]["step"] = 3
            write_journal(state, journal)
            remove_promotion_manifest(state)
            return
        journal["phase"] = "promotion-complete"
        journal["rollback_available"] = True
        journal.pop("rollback", None)
        write_journal(state, journal)
        raise CutoverError(
            "interrupted rollback was recovered; rerun rollback after preflight gates"
        )

    require_phase(journal, "promotion-complete", "rollback-recovered")
    if journal.get("first_write_sealed") is True:
        raise CutoverError("rollback is permanently blocked after the first-write seal")
    if journal.get("rollback_available") is not True:
        raise CutoverError("original target rollback database is not available")
    require_stopped(credentials)
    names = db_names(credentials)
    quiesce(path, credentials)
    if databases(path, credentials) != {names["target"], names["rollback"]}:
        raise CutoverError("rollback requires the promoted target and intact rollback database")
    journal.update(phase="rollback-started", rollback={"step": 0})
    write_journal(state, journal)
    try:
        rename_after_quiesce(path, credentials, names["target"], names["candidate"])
        journal["rollback"]["step"] = 1
        write_journal(state, journal)
        rename_after_quiesce(path, credentials, names["rollback"], names["target"])
        journal["rollback"]["step"] = 2
        write_journal(state, journal)
        rolled_back_target_matches_original(path, credentials, journal)
    except CutoverError:
        try:
            status = recover_rollback(path, credentials, journal)
        except CutoverError:
            journal["phase"] = "rollback-recovery-required"
            write_journal(state, journal)
            raise
        if status == "complete":
            journal["phase"] = "rolled-back"
            journal["rollback_available"] = False
            journal["rollback"]["step"] = 3
            write_journal(state, journal)
            remove_promotion_manifest(state)
            return
        journal["phase"] = "rollback-recovered"
        write_journal(state, journal)
        raise
    journal["phase"] = "rolled-back"
    journal["rollback_available"] = False
    journal["rollback"]["step"] = 3
    write_journal(state, journal)
    remove_promotion_manifest(state)


def dispatch(action: str, state: Path, path: Path, credentials: dict[str, Any]) -> None:
    actions = {
        "preflight": preflight,
        "engage-fence": engage_fence,
        "adopt-fence": adopt_fence,
        "release-fence": release_fence,
        "export": export_archives,
        "candidate-create": create_candidate,
        "candidate-restore": candidate_restore,
        "candidate-verify": candidate_verify,
        "candidate-rename": promote,
        "promote": promote,
        "rollback": rollback,
    }
    actions[action](state, path, credentials)


def main(argv: Sequence[str] | None = None) -> int:
    try:
        args = parse_args(argv)
        if args.dry_run:
            log(args.action, "planned-no-io")
            return 0
        validate_state_dir(args.state_dir)
        with state_lock(args.state_dir):
            credentials = read_credentials()
            with service_file(credentials) as service_path:
                dispatch(args.action, args.state_dir, service_path, credentials)
        log(args.action, "complete")
        return 0
    except CutoverError as exc:
        print(f"[production-cutover-db] FAIL: {exc}", file=sys.stderr)
        return 1
    except OSError as exc:
        print(
            f"[production-cutover-db] FAIL: local operation failed (errno={exc.errno})",
            file=sys.stderr,
        )
        return 1
    except KeyboardInterrupt:
        print("[production-cutover-db] FAIL: interrupted", file=sys.stderr)
        return 130
