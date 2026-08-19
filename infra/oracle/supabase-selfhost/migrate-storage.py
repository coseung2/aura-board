#!/usr/bin/env python3

from __future__ import annotations

import argparse
import hashlib
import json
import string
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import quote


DEFAULT_BUCKET = "aura-board-uploads"
DEFAULT_VERIFY_SAMPLES = 8
MAX_RETRIES = 5


def log(message: str) -> None:
    print(f"[storage-migrate] {message}", flush=True)


def fail(message: str) -> None:
    raise SystemExit(f"[storage-migrate] FAIL: {message}")


def load_env_values(path: Path, keys: set[str]) -> dict[str, str]:
    values: dict[str, str] = {}
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        fail(f"could not read env file {path} (errno={exc.errno})")

    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        key, separator, raw_value = line.partition("=")
        if not separator or key not in keys:
            continue
        value = raw_value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        values[key] = value
    return values


def require_env_value(values: dict[str, str], key: str, path: Path) -> str:
    value = values.get(key, "").strip()
    if not value:
        fail(f"{key} is missing from {path}")
    if any(ord(character) < 32 or ord(character) == 127 for character in value):
        fail(f"{key} contains control characters")
    return value


def run_text(command: list[str], stdin_text: str | None = None) -> str:
    try:
        completed = subprocess.run(
            command,
            check=False,
            input=stdin_text,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except OSError as exc:
        fail(f"command could not start (errno={exc.errno})")
    if completed.returncode != 0:
        fail(f"read-only manifest query failed (exit_code={completed.returncode})")
    return completed.stdout.strip()


def load_objects(bucket: str) -> list[dict[str, object]]:
    sql = """
BEGIN TRANSACTION READ ONLY;
SELECT COALESCE(
  json_agg(
    json_build_object(
      'name', name,
      'mime', COALESCE(metadata->>'mimetype', 'application/octet-stream'),
      'size', CASE
        WHEN metadata->>'size' ~ '^[0-9]+$' THEN (metadata->>'size')::bigint
        ELSE NULL
      END
    )
    ORDER BY name COLLATE "C"
  ),
  '[]'::json
)::text
FROM storage.objects
WHERE bucket_id = :'bucket';
COMMIT;
"""
    output = run_text(
        [
            "docker",
            "exec",
            "-i",
            "supabase-db",
            "psql",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "-A",
            "-t",
            "-v",
            "ON_ERROR_STOP=1",
            "-v",
            f"bucket={bucket}",
        ],
        stdin_text=sql,
    )
    try:
        parsed = json.loads(output or "[]")
    except json.JSONDecodeError as exc:
        fail(f"could not parse storage object manifest: {exc}")
    if not isinstance(parsed, list):
        fail("storage object manifest is not an array")
    return parsed


def object_size(item: dict[str, object], index: int) -> int:
    value = item.get("size")
    if isinstance(value, bool):
        fail(f"object #{index} has an invalid size")
    try:
        size = int(value) if value is not None else -1
    except (TypeError, ValueError):
        fail(f"object #{index} has an invalid size")
    if size < 0:
        fail(f"object #{index} has no non-negative metadata size")
    return size


def object_mime(item: dict[str, object], index: int) -> str:
    value = item.get("mime")
    mime = value if isinstance(value, str) and value else "application/octet-stream"
    if any(ord(character) < 32 or ord(character) == 127 for character in mime):
        fail(f"object #{index} has an invalid content type")
    return mime


def validate_object_manifest(objects: list[dict[str, object]]) -> None:
    names: set[str] = set()
    for index, item in enumerate(objects, start=1):
        if not isinstance(item, dict):
            fail(f"object #{index} manifest entry is not an object")
        name = item.get("name")
        if not isinstance(name, str) or not name:
            fail(f"object #{index} has an empty or invalid name")
        if name in names:
            fail(f"object #{index} duplicates an earlier object name")
        names.add(name)
        object_size(item, index)
        object_mime(item, index)


def manifest_sha256(objects: list[dict[str, object]]) -> str:
    payload = json.dumps(
        objects,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def object_url(base_url: str, bucket: str, name: str) -> str:
    encoded_bucket = quote(bucket, safe="")
    encoded_name = quote(name, safe="/")
    return f"{base_url.rstrip('/')}/storage/v1/object/{encoded_bucket}/{encoded_name}"


def auth_headers(key: str) -> list[str]:
    return ["-H", f"apikey: {key}", "-H", f"Authorization: Bearer {key}"]


def curl_get_args(url: str, key: str) -> list[str]:
    return [
        "curl",
        "--fail",
        "--silent",
        "--show-error",
        "--location",
        "--path-as-is",
        "--proto",
        "=http,https",
        "--proto-redir",
        "=http,https",
        "--connect-timeout",
        "15",
        "--max-time",
        "900",
        *auth_headers(key),
        url,
    ]


def transfer_once(
    source_url: str,
    source_key: str,
    target_url: str,
    target_key: str,
    mime: str,
) -> tuple[bool, str]:
    try:
        source = subprocess.Popen(
            curl_get_args(source_url, source_key),
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
    except OSError as exc:
        return False, f"source_curl_start_errno={exc.errno}"
    if source.stdout is None:
        source.kill()
        return False, "source stdout unavailable"

    try:
        target = subprocess.Popen(
            [
                "curl",
                "--fail",
                "--silent",
                "--show-error",
                "--path-as-is",
                "--proto",
                "=http,https",
                "--proto-redir",
                "=http,https",
                "--connect-timeout",
                "15",
                "--max-time",
                "900",
                "-X",
                "PUT",
                *auth_headers(target_key),
                "-H",
                f"Content-Type: {mime}",
                "--data-binary",
                "@-",
                target_url,
            ],
            stdin=source.stdout,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except OSError as exc:
        source.kill()
        source.wait()
        return False, f"target_curl_start_errno={exc.errno}"
    source.stdout.close()
    target.communicate()
    source.wait()

    if source.returncode == 0 and target.returncode == 0:
        return True, ""

    details: list[str] = []
    if source.returncode != 0:
        details.append(f"source_curl_exit={source.returncode}")
    if target.returncode != 0:
        details.append(f"target_curl_exit={target.returncode}")
    return False, "; ".join(details) or "transfer failed"


def hash_object(url: str, key: str) -> str:
    try:
        process = subprocess.Popen(
            curl_get_args(url, key),
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
    except OSError as exc:
        fail(f"hash download could not start (errno={exc.errno})")
    if process.stdout is None:
        process.kill()
        fail("hash stream unavailable")

    digest = hashlib.sha256()
    while True:
        chunk = process.stdout.read(1024 * 1024)
        if not chunk:
            break
        digest.update(chunk)
    process.stdout.close()
    return_code = process.wait()
    if return_code != 0:
        fail(f"hash download failed (curl_exit={return_code})")
    return digest.hexdigest()


def sample_objects(objects: list[dict[str, object]], count: int) -> list[dict[str, object]]:
    if count <= 0 or not objects:
        return []
    by_size = sorted(
        objects,
        key=lambda item: (int(item.get("size") or 0), str(item.get("name") or "")),
    )
    count = min(count, len(by_size))
    if count == 1:
        return [by_size[len(by_size) // 2]]
    indexes = sorted({round(index * (len(by_size) - 1) / (count - 1)) for index in range(count)})
    return [by_size[index] for index in indexes]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Copy managed Supabase Storage payloads into self-hosted staging Storage. "
            "Object names and credentials are never printed."
        )
    )
    parser.add_argument("--bucket", default=DEFAULT_BUCKET)
    parser.add_argument("--source-env", type=Path, default=Path("/etc/aura-board/app.env"))
    parser.add_argument("--target-env", type=Path, default=Path("/srv/aura-board/supabase/.env"))
    parser.add_argument("--target-url", default="http://127.0.0.1:18000")
    parser.add_argument(
        "--retries",
        type=int,
        default=3,
        help=f"bounded attempts per object (1-{MAX_RETRIES}; default: 3)",
    )
    parser.add_argument(
        "--start-index",
        type=int,
        default=1,
        help="1-based index in the unchanged C-ordered manifest to resume from; reports partial status",
    )
    parser.add_argument(
        "--expected-manifest-sha256",
        help="required for resumed runs; must match the metadata manifest digest from the prior dry-run",
    )
    parser.add_argument("--progress-every", type=int, default=25)
    parser.add_argument(
        "--verify-samples",
        type=int,
        default=DEFAULT_VERIFY_SAMPLES,
        help=(
            "size-stratified source/target SHA-256 samples after transfer "
            f"(default: {DEFAULT_VERIFY_SAMPLES}); 0 disables sampling and never proves the full bucket"
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="read the local metadata manifest and report counts/bytes; do not read credentials or write payloads",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.retries < 1:
        fail("--retries must be at least 1")
    if args.retries > MAX_RETRIES:
        fail(f"--retries must be at most {MAX_RETRIES}")
    if args.start_index < 1:
        fail("--start-index must be at least 1")
    if args.verify_samples < 0:
        fail("--verify-samples must be zero or greater")
    if not args.bucket:
        fail("--bucket must not be empty")
    if not args.target_url:
        fail("--target-url must not be empty")
    if any(ord(character) < 32 or ord(character) == 127 for character in args.bucket):
        fail("--bucket contains control characters")
    if any(ord(character) < 32 or ord(character) == 127 for character in args.target_url):
        fail("--target-url contains control characters")
    if args.expected_manifest_sha256:
        digest = args.expected_manifest_sha256.lower()
        if len(digest) != 64 or any(character not in string.hexdigits for character in digest):
            fail("--expected-manifest-sha256 must be a 64-character hexadecimal digest")

    objects = load_objects(args.bucket)
    validate_object_manifest(objects)
    current_manifest_sha256 = manifest_sha256(objects)
    if args.start_index > 1 and args.expected_manifest_sha256 != current_manifest_sha256:
        fail("resumed run requires a matching --expected-manifest-sha256")
    expected_bytes = sum(object_size(item, index) for index, item in enumerate(objects, start=1))
    if args.start_index > len(objects) + 1:
        fail(f"--start-index {args.start_index} exceeds object count {len(objects)}")
    selected = objects[args.start_index - 1 :]
    run_expected_bytes = sum(
        object_size(item, index)
        for index, item in enumerate(selected, start=args.start_index)
    )
    log(
        f"bucket={args.bucket} objects={len(objects)} expected_bytes={expected_bytes} "
        f"start_index={args.start_index} run_objects={len(selected)} run_expected_bytes={run_expected_bytes} "
        f"manifest_sha256={current_manifest_sha256}"
    )

    if args.dry_run:
        log("dry_run=success mutations=none credentials=not_read verification=not_run")
        return 0

    if objects and not selected:
        fail("no objects remain at --start-index; refusing to report migration success")

    source_values = load_env_values(args.source_env, {"SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"})
    target_values = load_env_values(args.target_env, {"SERVICE_ROLE_KEY"})
    source_url = require_env_value(source_values, "SUPABASE_URL", args.source_env)
    source_key = require_env_value(source_values, "SUPABASE_SERVICE_ROLE_KEY", args.source_env)
    target_key = require_env_value(target_values, "SERVICE_ROLE_KEY", args.target_env)

    completed = 0
    completed_bytes = 0
    started = time.monotonic()

    for index, item in enumerate(selected, start=args.start_index):
        name = item["name"]
        if not isinstance(name, str):
            fail(f"object #{index} has an invalid name")
        mime = object_mime(item, index)
        size = object_size(item, index)
        source_object_url = object_url(source_url, args.bucket, name)
        target_object_url = object_url(args.target_url, args.bucket, name)
        object_ref = hashlib.sha256(name.encode("utf-8")).hexdigest()[:12]

        error = ""
        for attempt in range(1, args.retries + 1):
            success, error = transfer_once(
                source_object_url,
                source_key,
                target_object_url,
                target_key,
                mime,
            )
            if success:
                break
            if attempt < args.retries:
                time.sleep(min(2 ** (attempt - 1), 8))
        else:
            fail(f"object_ref={object_ref} index={index} attempts={args.retries} error={error}")

        completed += 1
        completed_bytes += size
        if completed % max(args.progress_every, 1) == 0 or completed == len(selected):
            elapsed = max(time.monotonic() - started, 0.001)
            rate_mib = completed_bytes / elapsed / (1024 * 1024)
            log(
                f"progress_index={index}/{len(objects)} run_objects={completed}/{len(selected)} "
                f"run_bytes={completed_bytes}/{run_expected_bytes} rate_mib_s={rate_mib:.2f}"
            )

    samples = sample_objects(objects, args.verify_samples)
    for index, item in enumerate(samples, start=1):
        name = str(item["name"])
        source_hash = hash_object(object_url(source_url, args.bucket, name), source_key)
        target_hash = hash_object(object_url(args.target_url, args.bucket, name), target_key)
        if source_hash != target_hash:
            object_ref = hashlib.sha256(name.encode("utf-8")).hexdigest()[:12]
            fail(f"verification mismatch sample={index}/{len(samples)} object_ref={object_ref}")
        log(f"verify={index}/{len(samples)} sha256_match=yes")

    scope = "full_bucket" if args.start_index == 1 else "resumed_suffix"
    status = "success" if args.start_index == 1 else "partial"
    verification_scope = "sampled_sha256" if samples else "disabled"
    log(
        f"status={status} scope={scope} transferred_objects={completed} "
        f"transferred_bytes={completed_bytes} verified_samples={len(samples)} "
        f"verification_scope={verification_scope} "
        f"full_bucket_complete={'yes' if args.start_index == 1 else 'no'}"
    )
    return 0 if args.start_index == 1 else 2


if __name__ == "__main__":
    sys.exit(main())
