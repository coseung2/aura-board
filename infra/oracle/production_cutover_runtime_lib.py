"""Fail-closed runtime cutover helpers; state stores hashes and metadata, never environment values."""

from __future__ import annotations
import datetime as dt
import errno
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, NoReturn
from urllib.parse import parse_qsl, quote, urlsplit, urlunsplit

APP_MODE = 416
BACKUP_MODE = 416
SELFHOST_MODE = 384
BUILD_MANIFEST_MODE = 384
JOURNAL_MODE = 384
STATE_DIR_MODE = 448
PUBLIC_SUPABASE_URL = "https://supabase.aura-board.com"
TRANSACTION_PORTS = frozenset({6543, 16543})
STATE_FILENAME = "production-cutover-runtime.json"
APP_BACKUP_FILENAME = "app.env.before-production-cutover"
BACKUP_ENV_BACKUP_FILENAME = "oracle-backup.env.before-production-cutover"
NEXT_SERVICE_ACTIONS = (
    "aura-board-app.service",
    "aura-play-engine.service",
    "aura-supabase-backup.service",
)
TARGET_APP_KEYS = (
    "DATABASE_URL",
    "DIRECT_URL",
    "SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
)
PUBLIC_BUILD_KEYS = (
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
)
BUILD_MANIFEST_REQUIRED_KEYS = frozenset(
    {
        "format",
        "build_sha",
        "app_server_sha256",
        "play_server_sha256",
        "public_env_sha256",
    }
)
BUILD_MANIFEST_OPTIONAL_KEYS = frozenset({"bundle_sha256"})
BUILD_MANIFEST_KEYS = BUILD_MANIFEST_REQUIRED_KEYS | BUILD_MANIFEST_OPTIONAL_KEYS
PUBLIC_BUILD_KEY_SET = frozenset(PUBLIC_BUILD_KEYS)
STATE_KEYS = frozenset(
    {
        "schema",
        "phase",
        "state_dir",
        "db_state_journal",
        "db_rich_journal",
        "build_manifest",
        "targets",
        "rollback_blocked",
        "sealed",
        "created_at",
        "updated_at",
        "sealed_at",
        "rolled_back_at",
    }
)
TARGET_NAMES = ("app_env", "backup_env")
SHA256 = re.compile("^[0-9a-f]{64}$")
BUILD_SHA = re.compile("^[0-9a-f]{40}$")
ASSIGNMENT = re.compile(b"^[ \\t]*(?:export[ \\t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \\t]*=")
UNSUPPORTED_SYNC_ERRNOS = frozenset(
    (
        value
        for value in (
            getattr(errno, "EINVAL", None),
            getattr(errno, "ENOTSUP", None),
            getattr(errno, "EOPNOTSUPP", None),
        )
        if value is not None
    )
)


class CutoverError(Exception):
    """An expected, secret-free cutover failure."""


@dataclass(frozen=True)
class FileMetadata:
    uid: int
    gid: int
    mode: int

    @classmethod
    def from_stat(cls, info: os.stat_result) -> "FileMetadata":
        return cls(
            int(getattr(info, "st_uid", 0)),
            int(getattr(info, "st_gid", 0)),
            stat.S_IMODE(info.st_mode),
        )

    @classmethod
    def from_record(cls, value: Any, label: str) -> "FileMetadata":
        if not isinstance(value, dict) or set(value) != {"uid", "gid", "mode"}:
            fail(f"{label} metadata is invalid")
        if any(
            (
                isinstance(value[key], bool) or not isinstance(value[key], int)
                for key in ("uid", "gid", "mode")
            )
        ):
            fail(f"{label} metadata is invalid")
        if value["uid"] < 0 or value["gid"] < 0 or (not 0 <= value["mode"] <= 4095):
            fail(f"{label} metadata is invalid")
        return cls(value["uid"], value["gid"], value["mode"])

    def record(self) -> dict[str, int]:
        return {"uid": self.uid, "gid": self.gid, "mode": self.mode}


@dataclass(frozen=True)
class FileSnapshot:
    path: Path
    content: bytes
    metadata: FileMetadata

    @property
    def sha256(self) -> str:
        return sha256_bytes(self.content)

    def record(self) -> dict[str, Any]:
        return {"sha256": self.sha256, **self.metadata.record()}


@dataclass(frozen=True)
class TargetChange:
    name: str
    path: Path
    before: FileSnapshot
    after_content: bytes
    after_metadata: FileMetadata

    @property
    def after(self) -> FileSnapshot:
        return FileSnapshot(self.path, self.after_content, self.after_metadata)


def fail(message: str) -> NoReturn:
    raise CutoverError(message)


def metadata_matches(actual: FileMetadata, expected: FileMetadata) -> bool:
    return os.name == "nt" or actual == expected


def absolute_path(path: Path) -> Path:
    return Path(os.path.abspath(os.fspath(path)))


def path_key(path: Path) -> str:
    return os.path.normcase(os.path.normpath(os.fspath(path)))


def is_within(path: Path, directory: Path) -> bool:
    try:
        return os.path.commonpath((os.fspath(path), os.fspath(directory))) == os.fspath(directory)
    except ValueError:
        return False


def reject_symlink_components(path: Path, label: str) -> None:
    current = Path(path.anchor)
    for component in path.parts[1:]:
        current /= component
        try:
            info = os.lstat(current)
        except FileNotFoundError:
            break
        except OSError as exc:
            fail(f"could not inspect {label} metadata (errno={exc.errno})")
        if stat.S_ISLNK(info.st_mode):
            fail(f"refusing symlink in {label} path")


def require_owner(info: os.stat_result, label: str) -> None:
    if os.name != "nt" and getattr(info, "st_uid", None) != 0:
        fail(f"{label} must be owned by root")


def require_mode(info: os.stat_result, mode: int, label: str) -> None:
    if os.name != "nt" and stat.S_IMODE(info.st_mode) != mode:
        fail(f"{label} must have mode {mode:04o}")


def validate_regular_file(path: Path, label: str, mode: int) -> os.stat_result:
    path = absolute_path(path)
    reject_symlink_components(path, label)
    try:
        info = os.lstat(path)
    except FileNotFoundError:
        fail(f"{label} does not exist")
    except OSError as exc:
        fail(f"could not inspect {label} metadata (errno={exc.errno})")
    if stat.S_ISLNK(info.st_mode):
        fail(f"refusing symlink {label}")
    if not stat.S_ISREG(info.st_mode):
        fail(f"{label} is not a regular file")
    require_owner(info, label)
    require_mode(info, mode, label)
    return info


def validate_directory(path: Path, label: str, mode: int) -> os.stat_result:
    path = absolute_path(path)
    reject_symlink_components(path, label)
    try:
        info = os.lstat(path)
    except FileNotFoundError:
        fail(f"{label} does not exist")
    except OSError as exc:
        fail(f"could not inspect {label} metadata (errno={exc.errno})")
    if stat.S_ISLNK(info.st_mode):
        fail(f"refusing symlink {label}")
    if not stat.S_ISDIR(info.st_mode):
        fail(f"{label} is not a directory")
    require_owner(info, label)
    require_mode(info, mode, label)
    return info


def _read_open_descriptor(
    descriptor: int, path: Path, label: str, mode: int | None
) -> FileSnapshot:
    before = os.fstat(descriptor)
    if stat.S_ISLNK(before.st_mode) or not stat.S_ISREG(before.st_mode):
        fail(f"{label} is not a regular file")
    require_owner(before, label)
    if mode is not None:
        require_mode(before, mode, label)
    content = b""
    while True:
        block = os.read(descriptor, 1024 * 1024)
        if not block:
            break
        content += block
    after = os.fstat(descriptor)
    if FileMetadata.from_stat(before) != FileMetadata.from_stat(after):
        fail(f"{label} metadata changed while reading")
    return FileSnapshot(absolute_path(path), content, FileMetadata.from_stat(after))


def read_snapshot(path: Path, label: str, mode: int | None = None) -> FileSnapshot:
    path = absolute_path(path)
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    descriptor: int | None = None
    try:
        descriptor = os.open(os.fspath(path), flags)
        result = _read_open_descriptor(descriptor, path, label, mode)
        os.close(descriptor)
        descriptor = None
        return result
    except FileNotFoundError:
        fail(f"{label} does not exist")
    except OSError as exc:
        if exc.errno == getattr(errno, "ELOOP", None):
            fail(f"refusing symlink {label}")
        fail(f"could not read {label} (errno={exc.errno})")
    finally:
        if descriptor is not None:
            os.close(descriptor)


def verify_snapshot(path: Path, expected: FileSnapshot, label: str) -> None:
    actual = read_snapshot(path, label, expected.metadata.mode)
    if actual.content != expected.content or not metadata_matches(
        actual.metadata, expected.metadata
    ):
        fail(f"{label} bytes or metadata failed exact verification")


def open_read_only(path: Path, label: str, mode: int | None = None) -> bytes:
    return read_snapshot(path, label, mode).content


def scan_env_keys(path: Path, label: str, mode: int | None = None) -> set[str]:
    """Read assignment names only; right-hand-side bytes are not retained."""
    snapshot = read_snapshot(path, label, mode)
    keys: set[str] = set()
    for line in snapshot.content.splitlines(keepends=True):
        match = ASSIGNMENT.match(line)
        if match is None:
            continue
        key = match.group(1).decode("ascii")
        if key in keys:
            fail(f"duplicate key {key} in {label}")
        keys.add(key)
    return keys


def line_ending(line: bytes) -> bytes:
    if line.endswith(b"\r\n"):
        return b"\r\n"
    if line.endswith(b"\n"):
        return b"\n"
    if line.endswith(b"\r"):
        return b"\r"
    return b""


def preferred_newline(content: bytes) -> bytes:
    for line in content.splitlines(keepends=True):
        ending = line_ending(line)
        if ending:
            return ending
    return b"\n"


def decode_env_value(raw: bytes, key: str) -> str:
    body = raw.rstrip(b"\r\n").strip()
    try:
        value = body.decode("utf-8")
    except UnicodeDecodeError:
        fail(f"invalid UTF-8 value for {key}")
    if len(value) >= 2 and value[0] == value[-1] == '"':
        try:
            decoded = json.loads(value)
        except (TypeError, ValueError, json.JSONDecodeError):
            fail(f"invalid quoted value for {key}")
        if not isinstance(decoded, str):
            fail(f"invalid quoted value for {key}")
        value = decoded
    elif len(value) >= 2 and value[0] == value[-1] == "'":
        value = value[1:-1]
    if any((ord(character) < 32 or ord(character) == 127 for character in value)):
        fail(f"control character in value for {key}")
    return value


def parse_env_values(content: bytes, label: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in content.splitlines(keepends=True):
        match = ASSIGNMENT.match(line)
        if match is None:
            continue
        key = match.group(1).decode("ascii")
        if key in values:
            fail(f"duplicate key {key} in {label}")
        values[key] = decode_env_value(line[match.end() :], key)
    return values


def safe_env_value(value: str) -> str:
    if re.fullmatch("[A-Za-z0-9_./:@%+?,=~\\-]+", value):
        return value
    return json.dumps(value, ensure_ascii=False)


def update_env_content(content: bytes, values: dict[str, str]) -> bytes:
    newline = preferred_newline(content)
    seen: set[str] = set()
    rendered: list[bytes] = []
    for line in content.splitlines(keepends=True):
        match = ASSIGNMENT.match(line)
        if match is None:
            rendered.append(line)
            continue
        key = match.group(1).decode("ascii")
        if key in seen:
            fail(f"duplicate key {key} in env file")
        seen.add(key)
        if key not in values:
            rendered.append(line)
            continue
        ending = line_ending(line) or newline
        rendered.append(f"{key}={safe_env_value(values[key])}".encode() + ending)
    for key, value in values.items():
        if key in seen:
            continue
        if rendered and (not line_ending(rendered[-1])):
            rendered.append(newline)
        rendered.append(f"{key}={safe_env_value(value)}".encode() + newline)
    return b"".join(rendered)


def sync_fd(descriptor: int) -> None:
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
    sync_fd(descriptor)


def sync_directory(directory: Path) -> None:
    flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_BINARY", 0)
    descriptor: int | None = None
    try:
        descriptor = os.open(os.fspath(directory), flags)
        sync_fd(descriptor)
    except OSError as exc:
        if os.name != "nt" and exc.errno not in UNSUPPORTED_SYNC_ERRNOS:
            raise
    finally:
        if descriptor is not None:
            os.close(descriptor)


def apply_metadata(descriptor: int, path: Path, metadata: FileMetadata) -> None:
    if os.name != "nt":
        fchown = getattr(os, "fchown", None)
        if fchown is None:
            fail("POSIX fchown is required for exact cutover metadata")
        fchown(descriptor, metadata.uid, metadata.gid)
    fchmod = getattr(os, "fchmod", None)
    if fchmod is not None:
        fchmod(descriptor, metadata.mode)
    elif os.name != "nt":
        fail("POSIX fchmod is required for exact cutover metadata")
    else:
        os.chmod(os.fspath(path), metadata.mode)


def set_mode(descriptor: int, path: Path, mode: int) -> None:
    """Compatibility helper retained for callers that only set a mode."""
    current = os.fstat(descriptor)
    apply_metadata(
        descriptor,
        path,
        FileMetadata.from_stat(current).__class__(
            FileMetadata.from_stat(current).uid, FileMetadata.from_stat(current).gid, mode
        ),
    )


def _replace_once(path: Path, content: bytes, metadata: FileMetadata) -> None:
    descriptor: int | None = None
    temporary: Path | None = None
    try:
        descriptor, name = tempfile.mkstemp(
            prefix=".production-cutover-", dir=os.fspath(path.parent)
        )
        temporary = Path(name)
        apply_metadata(descriptor, temporary, metadata)
        write_all(descriptor, content)
        os.close(descriptor)
        descriptor = None
        temporary_snapshot = read_snapshot(
            temporary, "atomic replacement temporary file", metadata.mode
        )
        if temporary_snapshot.content != content or not metadata_matches(
            temporary_snapshot.metadata, metadata
        ):
            fail("atomic replacement temporary file failed exact verification")
        if os.path.lexists(path):
            info = os.lstat(path)
            if stat.S_ISLNK(info.st_mode):
                fail("refusing symlink target during atomic replace")
            if not stat.S_ISREG(info.st_mode):
                fail("atomic replacement target is not a regular file")
        os.replace(os.fspath(temporary), os.fspath(path))
        temporary = None
        sync_path(path)
        sync_directory(path.parent)
        verify_snapshot(path, FileSnapshot(path, content, metadata), "atomic replacement target")
    finally:
        if descriptor is not None:
            os.close(descriptor)
        if temporary is not None:
            try:
                os.unlink(temporary)
            except FileNotFoundError:
                pass


def atomic_replace(path: Path, content: bytes, metadata: FileMetadata | int | None = None) -> None:
    """Replace a file while retaining and verifying exact uid/gid/mode.; An existing target's metadata is the default.  The integer form is kept; only for old callers and changes the requested mode while still retaining; the original uid/gid; cutover code always passes a full FileMetadata.;"""
    path = absolute_path(path)
    reject_symlink_components(path, "atomic replacement")
    original: FileSnapshot | None = None
    replaced = False
    if os.path.lexists(path):
        original = read_snapshot(path, "atomic replacement target")
    if isinstance(metadata, int):
        if original is None:
            fail("new atomic replacement requires exact metadata")
        desired = FileMetadata(original.metadata.uid, original.metadata.gid, metadata)
    elif metadata is not None:
        desired = metadata
    elif original is not None:
        desired = original.metadata
    else:
        fail("new atomic replacement requires exact metadata")
    try:
        _replace_once(path, content, desired)
        replaced = True
    except Exception:
        if original is not None and replaced is False and os.path.lexists(path):
            try:
                current = read_snapshot(path, "failed atomic replacement target")
                if current.content != original.content or not metadata_matches(
                    current.metadata, original.metadata
                ):
                    _replace_once(path, original.content, original.metadata)
                verify_snapshot(path, original, "atomic replacement restoration")
            except Exception as restore_exc:
                raise CutoverError(
                    "atomic replacement failed and original bytes or metadata could not be restored"
                ) from restore_exc
        raise


def create_exact_backup(
    destination: Path, source: FileSnapshot | bytes, metadata: FileMetadata | int | None = None
) -> None:
    """Create a backup with the source bytes and exact source metadata."""
    destination = absolute_path(destination)
    reject_symlink_components(destination, "rollback backup")
    if os.path.lexists(destination):
        fail("stale rollback state: backup path already exists")
    if isinstance(source, FileSnapshot):
        content = source.content
        desired = source.metadata
    else:
        content = source
        if isinstance(metadata, FileMetadata):
            desired = metadata
        elif isinstance(metadata, int):
            parent = os.stat(destination.parent)
            desired = FileMetadata.from_stat(parent)
            desired = FileMetadata(desired.uid, desired.gid, metadata)
        else:
            fail("backup creation requires exact metadata")
    descriptor: int | None = None
    created = False
    try:
        descriptor = os.open(
            os.fspath(destination),
            os.O_WRONLY
            | os.O_CREAT
            | os.O_EXCL
            | getattr(os, "O_BINARY", 0)
            | getattr(os, "O_NOFOLLOW", 0),
            desired.mode,
        )
        created = True
        apply_metadata(descriptor, destination, desired)
        write_all(descriptor, content)
        os.close(descriptor)
        descriptor = None
        sync_directory(destination.parent)
        verify_snapshot(destination, FileSnapshot(destination, content, desired), "rollback backup")
    except Exception:
        if descriptor is not None:
            os.close(descriptor)
        if created:
            try:
                os.unlink(destination)
            except OSError:
                pass
        raise


def sync_path(path: Path) -> None:
    flags = os.O_RDWR | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    descriptor: int | None = None
    try:
        descriptor = os.open(os.fspath(path), flags)
        sync_fd(descriptor)
    finally:
        if descriptor is not None:
            os.close(descriptor)


def sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def sha256_text(value: str) -> str:
    return sha256_bytes(value.encode("utf-8"))


def validate_sha256(value: Any, label: str) -> str:
    if not isinstance(value, str) or SHA256.fullmatch(value) is None:
        fail(f"{label} must be a SHA-256 digest")
    return value


def validate_build_sha(value: Any) -> str:
    if not isinstance(value, str) or BUILD_SHA.fullmatch(value) is None:
        fail("build manifest build_sha must be a 40-character SHA")
    return value.lower()


def duplicate_json_pairs(pairs: list[tuple[object, object]]) -> dict[object, object]:
    result: dict[object, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON field")
        result[key] = value
    return result


def parse_json_document(content: bytes, label: str) -> dict[str, Any]:
    try:
        document = json.loads(content.decode("utf-8"), object_pairs_hook=duplicate_json_pairs)
    except (UnicodeDecodeError, json.JSONDecodeError, TypeError, ValueError):
        fail(f"{label} must be valid JSON without duplicate fields")
    if not isinstance(document, dict):
        fail(f"{label} must contain a JSON object")
    return document


@lru_cache(maxsize=1)
def _canonical_db_helper() -> Any:
    helper_path = Path(__file__).with_name("supabase-selfhost") / "production_cutover_db_lib.py"
    spec = importlib.util.spec_from_file_location(
        "aura_board_canonical_cutover_db_lib",
        helper_path,
    )
    if spec is None or spec.loader is None:
        fail("canonical DB promotion validator is unavailable")
    module = importlib.util.module_from_spec(spec)
    sys.modules.setdefault(spec.name, module)
    try:
        spec.loader.exec_module(module)
    except Exception as exc:
        raise CutoverError("canonical DB promotion validator could not be loaded") from exc
    return module


def parse_rich_journal(content: bytes) -> dict[str, Any]:
    document = parse_json_document(content, "DB rich journal")
    if document.get("format") != 2:
        fail("DB rich journal must be format 2")
    if document.get("phase") != "promotion-complete":
        fail("DB rich journal must be promotion-complete")
    if document.get("fence") != {"engaged": True}:
        fail("DB rich journal fence must be engaged")
    return document


def require_db_gate(
    document: dict[str, Any],
    rich_document: dict[str, Any] | None = None,
    rich_snapshot: FileSnapshot | None = None,
) -> None:
    """Accept a canonical promotion manifest bound to a fresh rich journal."""
    if rich_document is None or rich_snapshot is None:
        fail("--db-rich-journal is required with --db-promotion-manifest")
    try:
        _canonical_db_helper().validate_promotion_manifest(document)
    except CutoverError:
        raise
    except Exception as exc:
        raise CutoverError("DB promotion manifest failed the canonical validator") from exc
    parse_rich_journal(rich_snapshot.content)
    if rich_document != parse_rich_journal(rich_snapshot.content):
        fail("DB rich journal changed while being read")
    if document.get("db_journal_sha256") != rich_snapshot.sha256:
        fail("stale DB promotion manifest: rich journal digest does not match")


def read_db_journal(path: Path) -> tuple[dict[str, Any], FileSnapshot]:
    snapshot = read_snapshot(path, "DB promotion manifest", JOURNAL_MODE)
    return (parse_json_document(snapshot.content, "DB promotion manifest"), snapshot)


def read_rich_journal(path: Path) -> tuple[dict[str, Any], FileSnapshot]:
    snapshot = read_snapshot(path, "DB rich journal", JOURNAL_MODE)
    return (parse_rich_journal(snapshot.content), snapshot)


def parse_build_manifest(content: bytes) -> dict[str, Any]:
    document = parse_json_document(content, "build manifest")
    if set(document) not in {BUILD_MANIFEST_REQUIRED_KEYS, BUILD_MANIFEST_KEYS}:
        fail("build manifest fields do not match the current format")
    if document["format"] != 1:
        fail("build manifest fields do not match the current format")
    validate_build_sha(document["build_sha"])
    validate_sha256(document["app_server_sha256"], "build manifest app_server_sha256")
    validate_sha256(document["play_server_sha256"], "build manifest play_server_sha256")
    if "bundle_sha256" in document:
        validate_sha256(document["bundle_sha256"], "build manifest bundle_sha256")
    hashes = document["public_env_sha256"]
    if not isinstance(hashes, dict) or set(hashes) != PUBLIC_BUILD_KEY_SET:
        fail("build manifest public environment hash scope is not exact")
    for key in PUBLIC_BUILD_KEYS:
        validate_sha256(hashes[key], f"build manifest {key} hash")
    return document


def read_build_manifest(path: Path) -> tuple[dict[str, Any], FileSnapshot]:
    snapshot = read_snapshot(path, "build manifest", BUILD_MANIFEST_MODE)
    return (parse_build_manifest(snapshot.content), snapshot)


def direct_url_parts(value: str, key: str) -> tuple[tuple[str, str, int, str], str]:
    if value != value.strip() or any((character.isspace() for character in value)):
        fail(f"self-host {key} is not a direct PostgreSQL URL")
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
        port = parsed.port or 5432
    except ValueError:
        fail(f"self-host {key} is not a direct PostgreSQL URL")
    if parsed.scheme.lower() not in {"postgres", "postgresql"}:
        fail(f"self-host {key} is not a direct PostgreSQL URL")
    if hostname is None or hostname.lower() not in {"127.0.0.1", "localhost", "::1"}:
        fail(f"self-host {key} must use a loopback host")
    if port in TRANSACTION_PORTS:
        fail(f"self-host {key} must not use a transaction pooler port")
    if parsed.fragment or not parsed.path or parsed.path == "/":
        fail(f"self-host {key} is not a direct PostgreSQL URL")
    if parsed.username is None or parsed.password is None:
        fail(f"self-host {key} must include database credentials")
    for query_key, query_value in parse_qsl(parsed.query, keep_blank_values=True):
        if query_key.lower() == "pgbouncer" and query_value.lower() in {"1", "true", "yes"}:
            fail(f"self-host {key} must not use a transaction pooler")
    identity = (parsed.username, parsed.password, port, parsed.path)
    rendered_netloc = (
        f"{quote(parsed.username, safe='')}:{quote(parsed.password, safe='')}@127.0.0.1:{port}"
    )
    canonical = urlunsplit(("postgresql", rendered_netloc, parsed.path, parsed.query, ""))
    return (identity, canonical)


def source_value(values: dict[str, str], key: str) -> str:
    if key not in values or not values[key].strip():
        fail(f"self-host env is missing exact key {key}")
    value = values[key]
    if any((ord(character) < 32 or ord(character) == 127 for character in value)):
        fail(f"self-host value for {key} contains control characters")
    return value


def derive_direct_url(values: dict[str, str]) -> str:
    url_keys = {"DATABASE_URL", "DIRECT_URL"}
    present = url_keys.intersection(values)
    if present:
        if present != url_keys:
            fail(f"self-host env is missing exact key {sorted(url_keys - present)[0]}")
        first, _ = direct_url_parts(source_value(values, "DATABASE_URL"), "DATABASE_URL")
        second, direct = direct_url_parts(source_value(values, "DIRECT_URL"), "DIRECT_URL")
        if first != second:
            fail("self-host DATABASE_URL and DIRECT_URL target different databases")
        return direct
    for key in ("POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"):
        source_value(values, key)
    port_keys = (
        "DIRECT_POSTGRES_PORT",
        "POSTGRES_HOST_PORT",
        "AURA_POSTGRES_HOST_PORT",
        "SUPABASE_POSTGRES_HOST_PORT",
    )
    port_key = next((key for key in port_keys if key in values), "POSTGRES_PORT")
    port_text = source_value(values, port_key)
    try:
        port = int(port_text, 10)
    except ValueError:
        fail("self-host direct PostgreSQL port is invalid")
    if not 1 <= port <= 65535 or port in TRANSACTION_PORTS:
        fail("self-host direct PostgreSQL port is invalid")
    if port_key == "POSTGRES_PORT" and "POSTGRES_HOST" in values:
        if source_value(values, "POSTGRES_HOST").lower() not in {"127.0.0.1", "localhost", "::1"}:
            fail("self-host POSTGRES_PORT must use a loopback host")
    user = source_value(values, "POSTGRES_USER")
    password = source_value(values, "POSTGRES_PASSWORD")
    database = source_value(values, "POSTGRES_DB")
    netloc = f"{quote(user, safe='')}:{quote(password, safe='')}@127.0.0.1:{port}"
    return urlunsplit(("postgresql", netloc, f"/{quote(database, safe='')}", "", ""))


def validate_required_source_names(keys: set[str]) -> None:
    if "ANON_KEY" not in keys and "PUBLISHABLE_KEY" not in keys:
        fail("self-host env is missing exact key ANON_KEY or PUBLISHABLE_KEY")
    if "SERVICE_ROLE_KEY" not in keys:
        fail("self-host env is missing exact key SERVICE_ROLE_KEY")
    url_keys = {"DATABASE_URL", "DIRECT_URL"}
    if keys.intersection(url_keys):
        missing = url_keys - keys
        if missing:
            fail(f"self-host env is missing exact key {sorted(missing)[0]}")
        return
    if not {"POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"}.issubset(keys):
        missing = sorted({"POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"} - keys)[0]
        fail(f"self-host env is missing exact key {missing}")
    if not keys.intersection(
        {
            "POSTGRES_PORT",
            "DIRECT_POSTGRES_PORT",
            "POSTGRES_HOST_PORT",
            "AURA_POSTGRES_HOST_PORT",
            "SUPABASE_POSTGRES_HOST_PORT",
        }
    ):
        fail("self-host env is missing exact direct PostgreSQL port key")


def build_target_values(selfhost_content: bytes) -> tuple[dict[str, str], dict[str, str]]:
    source = parse_env_values(selfhost_content, "self-host env")
    direct_url = derive_direct_url(source)
    anon = source_value(source, "ANON_KEY") if "ANON_KEY" in source else None
    publishable = source_value(source, "PUBLISHABLE_KEY") if "PUBLISHABLE_KEY" in source else None
    if anon is None and publishable is None:
        fail("self-host env is missing exact key ANON_KEY or PUBLISHABLE_KEY")
    service_role = source_value(source, "SERVICE_ROLE_KEY")
    anon = anon or publishable
    publishable = publishable or anon
    assert anon is not None and publishable is not None
    app_values = {
        "DATABASE_URL": direct_url,
        "DIRECT_URL": direct_url,
        "SUPABASE_URL": PUBLIC_SUPABASE_URL,
        "NEXT_PUBLIC_SUPABASE_URL": PUBLIC_SUPABASE_URL,
        "NEXT_PUBLIC_SUPABASE_ANON_KEY": anon,
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": publishable,
        "SUPABASE_SERVICE_ROLE_KEY": service_role,
    }
    backup_values = {"BACKUP_SOURCE": "oracle-self-hosted", "DATABASE_URL": direct_url}
    return (app_values, backup_values)


def public_build_hashes(app_values: dict[str, str]) -> dict[str, str]:
    return {key: sha256_text(app_values[key]) for key in PUBLIC_BUILD_KEYS}


def verify_build_manifest_matches(manifest: dict[str, Any], app_values: dict[str, str]) -> None:
    if manifest["public_env_sha256"] != public_build_hashes(app_values):
        fail("build manifest public environment hashes do not match self-host target")


def validate_release_directory(path: Path, label: str) -> Path:
    path = absolute_path(path)
    reject_symlink_components(path, label)
    try:
        info = os.lstat(path)
    except FileNotFoundError:
        fail(f"{label} does not exist")
    except OSError as exc:
        fail(f"could not inspect {label} metadata (errno={exc.errno})")
    if stat.S_ISLNK(info.st_mode):
        fail(f"refusing symlink {label}")
    if not stat.S_ISDIR(info.st_mode):
        fail(f"{label} is not a directory")
    require_owner(info, label)
    return path


def _release_marker_matches(snapshot: FileSnapshot, build_sha: str, label: str) -> None:
    expected = {build_sha.encode("ascii"), f"{build_sha}\n".encode("ascii")}
    if snapshot.content not in expected:
        fail(f"{label} .release-complete does not match build_sha")


def _release_artifact_digest(
    release: Path,
    artifact_name: str,
    build_sha: str,
    label: str,
) -> str:
    release = validate_release_directory(release, label)
    marker = read_snapshot(release / ".release-complete", f"{label} .release-complete")
    _release_marker_matches(marker, build_sha, label)
    artifact = read_snapshot(release / artifact_name, f"{label} {artifact_name}")
    marker_after = read_snapshot(release / ".release-complete", f"{label} .release-complete")
    if marker_after != marker:
        fail(f"{label} release changed while it was being verified")
    return artifact.sha256


def verify_deployed_releases(
    manifest: dict[str, Any], app_release: Path, engine_release: Path
) -> None:
    build_sha = manifest["build_sha"]
    app_digest = _release_artifact_digest(
        app_release,
        "server.js",
        build_sha,
        "deployed app release",
    )
    if app_digest != manifest["app_server_sha256"]:
        fail("deployed app server.js digest does not match build manifest")
    engine_digest = _release_artifact_digest(
        engine_release,
        "play-server",
        build_sha,
        "deployed engine release",
    )
    if engine_digest != manifest["play_server_sha256"]:
        fail("deployed play-server digest does not match build manifest")


def validate_required_stopped_service_name(value: Any) -> str:
    if (
        not isinstance(value, str)
        or not value
        or value != value.strip()
        or value.startswith("-")
        or any(ord(character) < 0x20 or ord(character) == 0x7F for character in value)
    ):
        fail("required stopped service names must be non-empty safe unit names")
    return value


def verify_required_stopped_services(services: Sequence[str]) -> None:
    if not services:
        fail("--seal-before-writers requires at least one --required-stopped-service")
    for raw_service in services:
        service = validate_required_stopped_service_name(raw_service)
        try:
            result = subprocess.run(
                ["systemctl", "is-active", service],
                check=False,
                capture_output=True,
                text=True,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            raise CutoverError(
                f"systemctl is-active failed for required service {service}"
            ) from exc
        stdout = result.stdout if isinstance(result.stdout, str) else ""
        status = stdout.strip()
        if result.returncode == 0 and status == "active":
            fail(f"required stopped service is active: {service}")
        if result.returncode != 0 and status == "inactive":
            continue
        fail(f"could not prove required service is inactive: {service}")


def state_paths(state_dir: Path) -> tuple[Path, Path, Path]:
    return (
        state_dir / STATE_FILENAME,
        state_dir / APP_BACKUP_FILENAME,
        state_dir / BACKUP_ENV_BACKUP_FILENAME,
    )


def validate_state_entries(state_dir: Path) -> set[str]:
    allowed = {STATE_FILENAME, APP_BACKUP_FILENAME, BACKUP_ENV_BACKUP_FILENAME}
    names: set[str] = set()
    try:
        entries = list(os.scandir(state_dir))
    except OSError as exc:
        fail(f"could not inspect state directory (errno={exc.errno})")
    for entry in entries:
        if entry.name not in allowed:
            fail("unexpected path in state directory")
        if entry.is_symlink():
            fail("refusing symlink in state directory")
        names.add(entry.name)
    return names


def validate_input_paths(args: Any) -> dict[str, Path]:
    paths = {
        "db": absolute_path(args.db_promotion_manifest),
        "rich_db": absolute_path(args.db_rich_journal),
        "app": absolute_path(args.app_env),
        "backup": absolute_path(args.backup_env),
        "selfhost": absolute_path(args.selfhost_env),
        "state": absolute_path(args.state_dir),
    }
    if args.build_manifest is not None:
        paths["manifest"] = absolute_path(args.build_manifest)
    if args.deployed_app_release is not None:
        paths["deployed_app"] = absolute_path(args.deployed_app_release)
    if args.deployed_engine_release is not None:
        paths["deployed_engine"] = absolute_path(args.deployed_engine_release)
    validate_regular_file(paths["db"], "DB promotion manifest", JOURNAL_MODE)
    validate_regular_file(paths["rich_db"], "DB rich journal", JOURNAL_MODE)
    validate_regular_file(paths["app"], "app env", APP_MODE)
    validate_regular_file(paths["backup"], "backup env", BACKUP_MODE)
    validate_regular_file(paths["selfhost"], "self-host env", SELFHOST_MODE)
    validate_directory(paths["state"], "state directory", STATE_DIR_MODE)
    if "manifest" in paths:
        validate_regular_file(paths["manifest"], "build manifest", BUILD_MANIFEST_MODE)
    keys = list(paths)
    for index, left_key in enumerate(keys):
        for right_key in keys[index + 1 :]:
            if path_key(paths[left_key]) == path_key(paths[right_key]):
                fail("input paths must be distinct")
    for key in ("db", "rich_db", "app", "backup", "selfhost", "manifest"):
        if key in paths and is_within(paths[key], paths["state"]):
            fail("input file path must not be inside state directory")
    validate_state_entries(paths["state"])
    scan_env_keys(paths["app"], "app env", APP_MODE)
    scan_env_keys(paths["backup"], "backup env", BACKUP_MODE)
    return paths


def _state_metadata_for_new_file(directory: Path, mode: int) -> FileMetadata:
    return FileMetadata.from_stat(os.stat(directory)).__class__(
        int(os.stat(directory).st_uid), int(os.stat(directory).st_gid), mode
    )


def state_bytes(payload: dict[str, Any]) -> bytes:
    return (json.dumps(payload, sort_keys=True, indent=2) + "\n").encode("utf-8")


def write_state(path: Path, payload: dict[str, Any]) -> None:
    path = absolute_path(path)
    if os.path.lexists(path):
        metadata: FileMetadata | None = None
    else:
        metadata = _state_metadata_for_new_file(path.parent, JOURNAL_MODE)
    atomic_replace(path, state_bytes(payload), metadata)


def unlink_created(path: Path, label: str) -> None:
    if not os.path.lexists(path):
        return
    info = os.lstat(path)
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        fail(f"refusing unsafe cleanup path for {label}")
    os.unlink(path)
    sync_directory(path.parent)


def _metadata_record(value: Any, label: str) -> FileMetadata:
    return FileMetadata.from_record(value, label)


def _state_target_record(value: Any, name: str) -> tuple[str, Path, dict[str, Any], dict[str, Any]]:
    if not isinstance(value, dict) or set(value) != {"path", "backup_path", "old", "new"}:
        fail(f"runtime state {name} target record is invalid")
    old = value["old"]
    new = value["new"]
    for label, record in ((f"runtime state {name} old", old), (f"runtime state {name} new", new)):
        if not isinstance(record, dict) or set(record) != {"sha256", "uid", "gid", "mode"}:
            fail(f"{label} record is invalid")
        validate_sha256(record["sha256"], f"{label} digest")
        _metadata_record({key: record[key] for key in ("uid", "gid", "mode")}, label)
    if not isinstance(value["path"], str) or not isinstance(value["backup_path"], str):
        fail(f"runtime state {name} paths are invalid")
    return (value["path"], Path(value["backup_path"]), old, new)


def _build_state_record(
    path: Path, snapshot: FileSnapshot, manifest: dict[str, Any]
) -> dict[str, Any]:
    record: dict[str, Any] = {
        "path": os.fspath(absolute_path(path)),
        "sha256": snapshot.sha256,
        **snapshot.metadata.record(),
        "build_sha": manifest["build_sha"],
        "app_server_sha256": manifest["app_server_sha256"],
        "play_server_sha256": manifest["play_server_sha256"],
        "public_env_sha256": dict(manifest["public_env_sha256"]),
    }
    if "bundle_sha256" in manifest:
        record["bundle_sha256"] = manifest["bundle_sha256"]
    return record


def fixed_state_payload(
    paths: dict[str, Path],
    db_snapshot: FileSnapshot,
    rich_snapshot: FileSnapshot,
    manifest_snapshot: FileSnapshot,
    manifest: dict[str, Any],
    changes: tuple[TargetChange, TargetChange],
) -> dict[str, Any]:
    state_file, app_backup, backup_env_backup = state_paths(paths["state"])
    now = utc_now()
    return {
        "schema": 2,
        "phase": "prepared",
        "state_dir": os.fspath(paths["state"]),
        "db_state_journal": {"path": os.fspath(db_snapshot.path), **db_snapshot.record()},
        "db_rich_journal": {"path": os.fspath(rich_snapshot.path), **rich_snapshot.record()},
        "build_manifest": _build_state_record(paths["manifest"], manifest_snapshot, manifest),
        "targets": {
            changes[0].name: {
                "path": os.fspath(changes[0].path),
                "backup_path": os.fspath(app_backup),
                "old": changes[0].before.record(),
                "new": changes[0].after.record(),
            },
            changes[1].name: {
                "path": os.fspath(changes[1].path),
                "backup_path": os.fspath(backup_env_backup),
                "old": changes[1].before.record(),
                "new": changes[1].after.record(),
            },
        },
        "rollback_blocked": False,
        "sealed": False,
        "sealed_at": None,
        "rolled_back_at": None,
        "created_at": now,
        "updated_at": now,
    }


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def load_and_validate_state(
    state_file: Path, paths: dict[str, Path]
) -> tuple[dict[str, Any], FileSnapshot]:
    snapshot = read_snapshot(state_file, "runtime state journal", JOURNAL_MODE)
    state = parse_json_document(snapshot.content, "runtime state journal")
    if set(state) != STATE_KEYS or state["schema"] != 2:
        fail("runtime state journal schema or fields are invalid")
    if state["state_dir"] != os.fspath(paths["state"]):
        fail("runtime state journal has an unexpected state path")
    if state["phase"] not in {"prepared", "written", "sealed", "rolled_back"}:
        fail("runtime state journal phase is invalid")
    for key in ("rollback_blocked", "sealed"):
        if not isinstance(state[key], bool):
            fail("runtime state journal flags are invalid")
    expected_blocked = state["phase"] == "sealed"
    if state["rollback_blocked"] != expected_blocked or state["sealed"] != expected_blocked:
        fail("runtime state journal seal flags are inconsistent")
    if state["phase"] == "sealed" and (not isinstance(state["sealed_at"], str)):
        fail("runtime state journal seal timestamp is invalid")
    if state["phase"] != "sealed" and state["sealed_at"] is not None:
        fail("runtime state journal seal timestamp is inconsistent")
    if state["phase"] == "rolled_back" and (not isinstance(state["rolled_back_at"], str)):
        fail("runtime state journal rollback timestamp is invalid")
    if state["phase"] != "rolled_back" and state["rolled_back_at"] is not None:
        fail("runtime state journal rollback timestamp is inconsistent")
    db = state["db_state_journal"]
    if not isinstance(db, dict) or set(db) != {"path", "sha256", "uid", "gid", "mode"}:
        fail("runtime state DB journal record is invalid")
    if db["path"] != os.fspath(paths["db"]):
        fail("runtime state has an unexpected DB journal path")
    validate_sha256(db["sha256"], "runtime state DB journal digest")
    _metadata_record({key: db[key] for key in ("uid", "gid", "mode")}, "runtime state DB journal")
    rich_db = state["db_rich_journal"]
    if not isinstance(rich_db, dict) or set(rich_db) != {"path", "sha256", "uid", "gid", "mode"}:
        fail("runtime state rich DB journal record is invalid")
    if rich_db["path"] != os.fspath(paths["rich_db"]):
        fail("runtime state has an unexpected rich DB journal path")
    validate_sha256(rich_db["sha256"], "runtime state rich DB journal digest")
    _metadata_record(
        {key: rich_db[key] for key in ("uid", "gid", "mode")},
        "runtime state rich DB journal",
    )
    manifest = state["build_manifest"]
    manifest_required_keys = {
        "path",
        "sha256",
        "uid",
        "gid",
        "mode",
        "build_sha",
        "app_server_sha256",
        "play_server_sha256",
        "public_env_sha256",
    }
    manifest_allowed_keys = manifest_required_keys | {"bundle_sha256"}
    if not isinstance(manifest, dict) or set(manifest) not in (
        manifest_required_keys,
        manifest_allowed_keys,
    ):
        fail("runtime state build manifest record is invalid")
    if "manifest" in paths and manifest["path"] != os.fspath(paths["manifest"]):
        fail("runtime state has an unexpected build manifest path")
    validate_sha256(manifest["sha256"], "runtime state build manifest digest")
    _metadata_record(
        {key: manifest[key] for key in ("uid", "gid", "mode")}, "runtime state build manifest"
    )
    validate_build_sha(manifest["build_sha"])
    validate_sha256(manifest["app_server_sha256"], "runtime state app server digest")
    validate_sha256(manifest["play_server_sha256"], "runtime state play-server digest")
    if "bundle_sha256" in manifest:
        validate_sha256(manifest["bundle_sha256"], "runtime state bundle digest")
    hashes = manifest["public_env_sha256"]
    if not isinstance(hashes, dict) or set(hashes) != PUBLIC_BUILD_KEY_SET:
        fail("runtime state build hash scope is invalid")
    for key in PUBLIC_BUILD_KEYS:
        validate_sha256(hashes[key], f"runtime state {key} hash")
    targets = state["targets"]
    if not isinstance(targets, dict) or set(targets) != set(TARGET_NAMES):
        fail("runtime state target records are invalid")
    expected_paths = {"app_env": paths["app"], "backup_env": paths["backup"]}
    expected_backups = {
        "app_env": state_paths(paths["state"])[1],
        "backup_env": state_paths(paths["state"])[2],
    }
    for name in TARGET_NAMES:
        path_text, backup_path, _old, _new = _state_target_record(targets[name], name)
        if path_text != os.fspath(expected_paths[name]) or os.fspath(backup_path) != os.fspath(
            expected_backups[name]
        ):
            fail("runtime state contains an unexpected target path")
    return (state, snapshot)


def _record_to_snapshot(path: Path, record: dict[str, Any], label: str) -> FileSnapshot:
    metadata = FileMetadata(record["uid"], record["gid"], record["mode"])
    actual = read_snapshot(path, label, metadata.mode)
    if actual.sha256 != record["sha256"] or not metadata_matches(actual.metadata, metadata):
        fail(f"{label} bytes or metadata do not match runtime journal")
    return actual


def _restore_and_verify(changes: Iterable[tuple[Path, FileSnapshot, str]], label: str) -> None:
    failures: list[str] = []
    for path, snapshot, name in changes:
        try:
            atomic_replace(path, snapshot.content, snapshot.metadata)
            verify_snapshot(path, snapshot, name)
        except Exception:
            failures.append(name)
    if failures:
        fail(f"{label} could not restore and verify exact bytes or metadata")


def _apply_changes(changes: tuple[TargetChange, TargetChange], label: str) -> None:
    try:
        for change in changes:
            atomic_replace(change.path, change.after_content, change.after_metadata)
            verify_snapshot(change.path, change.after, change.name)
    except Exception:
        _restore_and_verify(
            ((change.path, change.before, change.name) for change in changes),
            f"{label} compensation",
        )
        raise


def _clean_write_state(paths: dict[str, Path]) -> None:
    state_file, app_backup, backup_env_backup = state_paths(paths["state"])
    for path, label in (
        (state_file, "runtime state journal"),
        (app_backup, "app rollback backup"),
        (backup_env_backup, "backup env rollback backup"),
    ):
        unlink_created(path, label)


def write_action(
    paths: dict[str, Path],
    db_document: dict[str, Any],
    rich_document: dict[str, Any],
    db_snapshot: FileSnapshot,
    rich_snapshot: FileSnapshot,
    manifest: dict[str, Any],
    manifest_snapshot: FileSnapshot,
) -> None:
    require_db_gate(db_document, rich_document, rich_snapshot)
    if validate_state_entries(paths["state"]):
        fail("stale rollback state or unexpected path exists")
    app_before = read_snapshot(paths["app"], "app env", APP_MODE)
    backup_before = read_snapshot(paths["backup"], "backup env", BACKUP_MODE)
    selfhost = read_snapshot(paths["selfhost"], "self-host env", SELFHOST_MODE)
    app_values, backup_values = build_target_values(selfhost.content)
    verify_build_manifest_matches(manifest, app_values)
    changes = (
        TargetChange(
            "app_env",
            paths["app"],
            app_before,
            update_env_content(app_before.content, app_values),
            app_before.metadata,
        ),
        TargetChange(
            "backup_env",
            paths["backup"],
            backup_before,
            update_env_content(backup_before.content, backup_values),
            backup_before.metadata,
        ),
    )
    state_file, app_backup, backup_env_backup = state_paths(paths["state"])
    state = fixed_state_payload(
        paths,
        db_snapshot,
        rich_snapshot,
        manifest_snapshot,
        manifest,
        changes,
    )
    created_backups: list[Path] = []
    prepared_snapshot: FileSnapshot | None = None
    try:
        create_exact_backup(app_backup, app_before)
        created_backups.append(app_backup)
        create_exact_backup(backup_env_backup, backup_before)
        created_backups.append(backup_env_backup)
        write_state(state_file, state)
        prepared_snapshot = read_snapshot(state_file, "runtime state journal", JOURNAL_MODE)
        _apply_changes(changes, "write")
        state["phase"] = "written"
        state["updated_at"] = utc_now()
        write_state(state_file, state)
        read_snapshot(state_file, "runtime state journal", JOURNAL_MODE)
    except Exception as exc:
        try:
            _restore_and_verify(
                ((change.path, change.before, change.name) for change in changes),
                "write compensation",
            )
            if prepared_snapshot is not None:
                _restore_and_verify(
                    ((state_file, prepared_snapshot, "runtime state journal"),),
                    "write journal compensation",
                )
            _clean_write_state(paths)
        except Exception as compensation_exc:
            raise CutoverError(
                "write failed and compensation could not restore and verify exact state"
            ) from compensation_exc
        if isinstance(exc, OSError):
            raise CutoverError("write failed; exact bytes and metadata were restored") from exc
        raise
    print("[production-cutover-runtime] write=complete")
    print("[production-cutover-runtime] build-deploy-gate=fresh-next-build-required")
    print("[production-cutover-runtime] rollback=allowed-before-seal")
    print(
        "[production-cutover-runtime] sequence=write->build/deploy-gate->seal-before-writers->start-services"
    )


def verify_rollback_state(
    state: dict[str, Any],
    paths: dict[str, Path],
    db_snapshot: FileSnapshot,
    rich_snapshot: FileSnapshot,
) -> tuple[tuple[TargetChange, TargetChange], tuple[FileSnapshot, FileSnapshot]]:
    if state["sealed"] or state["rollback_blocked"] or state["phase"] == "sealed":
        fail("rollback is permanently blocked after --seal-before-writers")
    if state["phase"] != "written":
        fail("runtime state is not rollbackable before seal")
    db = state["db_state_journal"]
    if db["sha256"] != db_snapshot.sha256 or not metadata_matches(
        db_snapshot.metadata, FileMetadata(db["uid"], db["gid"], db["mode"])
    ):
        fail("stale rollback state: DB journal changed")
    rich_db = state["db_rich_journal"]
    if rich_db["sha256"] != rich_snapshot.sha256 or not metadata_matches(
        rich_snapshot.metadata,
        FileMetadata(rich_db["uid"], rich_db["gid"], rich_db["mode"]),
    ):
        fail("stale rollback state: rich DB journal changed")
    manifest_path = Path(state["build_manifest"]["path"])
    _record_to_snapshot(manifest_path, state["build_manifest"], "build manifest")
    changes: list[TargetChange] = []
    current: list[FileSnapshot] = []
    for name, path, mode in (
        ("app_env", paths["app"], APP_MODE),
        ("backup_env", paths["backup"], BACKUP_MODE),
    ):
        record = state["targets"][name]
        old = record["old"]
        new = record["new"]
        old_snapshot = _record_to_snapshot(
            Path(record["backup_path"]), old, f"{name} rollback backup"
        )
        current_snapshot = _record_to_snapshot(path, new, name)
        if os.name != "nt" and current_snapshot.metadata.mode != mode:
            fail(f"{name} mode is invalid")
        current.append(current_snapshot)
        changes.append(
            TargetChange(name, path, current_snapshot, old_snapshot.content, old_snapshot.metadata)
        )
    return ((changes[0], changes[1]), (current[0], current[1]))


def rollback_action(
    paths: dict[str, Path],
    db_document: dict[str, Any],
    rich_document: dict[str, Any],
    db_snapshot: FileSnapshot,
    rich_snapshot: FileSnapshot,
) -> None:
    require_db_gate(db_document, rich_document, rich_snapshot)
    state_file, _, _ = state_paths(paths["state"])
    if STATE_FILENAME not in validate_state_entries(paths["state"]):
        fail("rollback state journal does not exist")
    state, state_before = load_and_validate_state(state_file, paths)
    changes, current = verify_rollback_state(state, paths, db_snapshot, rich_snapshot)
    try:
        _apply_changes(changes, "rollback")
        state["phase"] = "rolled_back"
        state["rolled_back_at"] = utc_now()
        state["updated_at"] = state["rolled_back_at"]
        write_state(state_file, state)
    except Exception as exc:
        try:
            _restore_and_verify(
                (
                    (snapshot.path, snapshot, name)
                    for snapshot, name in zip(current, ("app_env", "backup_env"))
                ),
                "rollback compensation",
            )
            _restore_and_verify(
                ((state_file, state_before, "runtime state journal"),),
                "rollback journal compensation",
            )
        except Exception as compensation_exc:
            raise CutoverError(
                "rollback failed and compensation could not restore and verify exact state"
            ) from compensation_exc
        if isinstance(exc, OSError):
            raise CutoverError("rollback failed; exact bytes and metadata were restored") from exc
        raise
    print("[production-cutover-runtime] rollback=complete")
    print(
        "[production-cutover-runtime] sequence=write->build/deploy-gate->seal-before-writers->start-services"
    )


def seal_before_writers_action(
    paths: dict[str, Path],
    db_document: dict[str, Any],
    rich_document: dict[str, Any],
    db_snapshot: FileSnapshot,
    rich_snapshot: FileSnapshot,
    manifest: dict[str, Any],
    manifest_snapshot: FileSnapshot,
    deployed_app_release: Path,
    deployed_engine_release: Path,
    required_stopped_services: Sequence[str],
) -> None:
    require_db_gate(db_document, rich_document, rich_snapshot)
    state_file, _, _ = state_paths(paths["state"])
    if STATE_FILENAME not in validate_state_entries(paths["state"]):
        fail("runtime state journal does not exist")
    state, _state_snapshot = load_and_validate_state(state_file, paths)
    if state["phase"] != "written" or state["sealed"]:
        fail("runtime state is not an open pre-writer seal window")
    state_manifest = state["build_manifest"]
    if state_manifest["path"] != os.fspath(paths["manifest"]):
        fail("seal build manifest path does not match write state")
    if state_manifest["sha256"] != manifest_snapshot.sha256:
        fail("seal build manifest does not match write artifact")
    for key in (
        "build_sha",
        "app_server_sha256",
        "play_server_sha256",
        "public_env_sha256",
        "bundle_sha256",
    ):
        if state_manifest.get(key) != manifest.get(key):
            fail("seal build manifest does not match write artifact")
    if state["db_state_journal"]["sha256"] != db_snapshot.sha256:
        fail("stale runtime state: DB journal changed")
    if state["db_rich_journal"]["sha256"] != rich_snapshot.sha256:
        fail("stale runtime state: rich DB journal changed")
    selfhost = read_snapshot(paths["selfhost"], "self-host env", SELFHOST_MODE)
    app_values, _ = build_target_values(selfhost.content)
    verify_build_manifest_matches(manifest, app_values)
    for name in TARGET_NAMES:
        _record_to_snapshot(
            Path(state["targets"][name]["path"]), state["targets"][name]["new"], name
        )
    verify_deployed_releases(manifest, deployed_app_release, deployed_engine_release)
    verify_required_stopped_services(required_stopped_services)
    state["phase"] = "sealed"
    state["sealed"] = True
    state["rollback_blocked"] = True
    state["sealed_at"] = utc_now()
    state["updated_at"] = state["sealed_at"]
    write_state(state_file, state)
    print("[production-cutover-runtime] seal-before-writers=complete")
    print("[production-cutover-runtime] rollback=permanently-blocked")
    print("[production-cutover-runtime] next_service_actions=" + ",".join(NEXT_SERVICE_ACTIONS))
    print(
        "[production-cutover-runtime] sequence=write->build/deploy-gate->seal-before-writers->start-services"
    )


def dry_run_action(paths: dict[str, Path], db_document: dict[str, Any]) -> None:
    del paths, db_document
    print("[production-cutover-runtime] dry-run=valid")
    print(
        "[production-cutover-runtime] planned_keys=" + ",".join((*TARGET_APP_KEYS, "BACKUP_SOURCE"))
    )
    print(
        "[production-cutover-runtime] sequence=write->build/deploy-gate->seal-before-writers->start-services"
    )


def action_from_args(args: Any) -> str:
    if args.dry_run:
        return "dry-run"
    if args.write:
        return "write"
    if args.rollback:
        return "rollback"
    return "seal-before-writers"


def require_build_manifest_for(action: str, paths: dict[str, Path]) -> None:
    if action in {"write", "seal-before-writers"} and "manifest" not in paths:
        fail(f"--build-manifest is mandatory for --{action}")


def require_seal_inputs(action: str, args: Any, paths: dict[str, Path]) -> None:
    if action != "seal-before-writers":
        return
    if "deployed_app" not in paths or "deployed_engine" not in paths:
        fail(
            "--seal-before-writers requires --deployed-app-release and "
            "--deployed-engine-release"
        )
    if not args.required_stopped_service:
        fail("--seal-before-writers requires at least one --required-stopped-service")
    paths["deployed_app"] = validate_release_directory(
        paths["deployed_app"], "deployed app release"
    )
    paths["deployed_engine"] = validate_release_directory(
        paths["deployed_engine"], "deployed engine release"
    )


def execute(args: Any) -> None:
    action = action_from_args(args)
    paths = validate_input_paths(args)
    require_build_manifest_for(action, paths)
    require_seal_inputs(action, args, paths)
    validate_required_source_names(scan_env_keys(paths["selfhost"], "self-host env", SELFHOST_MODE))
    db_document, db_snapshot = read_db_journal(paths["db"])
    rich_document, rich_snapshot = read_rich_journal(paths["rich_db"])
    require_db_gate(db_document, rich_document, rich_snapshot)
    if action == "dry-run":
        dry_run_action(paths, db_document)
        return
    if action == "rollback":
        rollback_action(paths, db_document, rich_document, db_snapshot, rich_snapshot)
        return
    manifest, manifest_snapshot = read_build_manifest(paths["manifest"])
    selfhost = read_snapshot(paths["selfhost"], "self-host env", SELFHOST_MODE)
    app_values, _ = build_target_values(selfhost.content)
    verify_build_manifest_matches(manifest, app_values)
    if action == "write":
        write_action(
            paths,
            db_document,
            rich_document,
            db_snapshot,
            rich_snapshot,
            manifest,
            manifest_snapshot,
        )
    else:
        seal_before_writers_action(
            paths,
            db_document,
            rich_document,
            db_snapshot,
            rich_snapshot,
            manifest,
            manifest_snapshot,
            paths["deployed_app"],
            paths["deployed_engine"],
            args.required_stopped_service,
        )
