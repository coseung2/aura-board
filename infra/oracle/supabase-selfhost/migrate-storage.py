#!/usr/bin/env python3

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import quote


def log(message: str) -> None:
    print(f"[storage-migrate] {message}", flush=True)


def fail(message: str) -> None:
    raise SystemExit(f"[storage-migrate] FAIL: {message}")


def load_env_values(path: Path, keys: set[str]) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
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
    return value


def run_text(command: list[str], stdin_text: str | None = None) -> str:
    completed = subprocess.run(
        command,
        check=False,
        input=stdin_text,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if completed.returncode != 0:
        detail = completed.stderr.strip().splitlines()[-1] if completed.stderr.strip() else "command failed"
        fail(detail)
    return completed.stdout.strip()


def load_objects(bucket: str) -> list[dict[str, object]]:
    sql = """
SELECT COALESCE(
  json_agg(
    json_build_object(
      'name', name,
      'mime', COALESCE(metadata->>'mimetype', 'application/octet-stream'),
      'size', COALESCE((metadata->>'size')::bigint, 0)
    )
    ORDER BY name
  ),
  '[]'::json
)::text
FROM storage.objects
WHERE bucket_id = :'bucket';
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
    source = subprocess.Popen(
        curl_get_args(source_url, source_key),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if source.stdout is None:
        source.kill()
        return False, "source stdout unavailable"

    target = subprocess.Popen(
        [
            "curl",
            "--fail",
            "--silent",
            "--show-error",
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
        stderr=subprocess.PIPE,
    )
    source.stdout.close()
    _, target_stderr = target.communicate()
    _, source_stderr = source.communicate()

    if source.returncode == 0 and target.returncode == 0:
        return True, ""

    details: list[str] = []
    if source.returncode != 0:
        details.append(f"source={source_stderr.decode('utf-8', errors='replace').strip()[-240:]}")
    if target.returncode != 0:
        details.append(f"target={target_stderr.decode('utf-8', errors='replace').strip()[-240:]}")
    return False, "; ".join(details) or "transfer failed"


def hash_object(url: str, key: str) -> str:
    process = subprocess.Popen(
        curl_get_args(url, key),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
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
    stderr = process.stderr.read() if process.stderr is not None else b""
    return_code = process.wait()
    if return_code != 0:
        detail = stderr.decode("utf-8", errors="replace").strip().splitlines()
        fail(detail[-1] if detail else "hash download failed")
    return digest.hexdigest()


def sample_objects(objects: list[dict[str, object]], count: int) -> list[dict[str, object]]:
    if count <= 0 or not objects:
        return []
    by_size = sorted(objects, key=lambda item: int(item.get("size") or 0))
    count = min(count, len(by_size))
    if count == 1:
        return [by_size[len(by_size) // 2]]
    indexes = sorted({round(index * (len(by_size) - 1) / (count - 1)) for index in range(count)})
    return [by_size[index] for index in indexes]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Copy managed Supabase Storage payloads into self-hosted staging Storage.")
    parser.add_argument("--bucket", default="aura-board-uploads")
    parser.add_argument("--source-env", type=Path, default=Path("/etc/aura-board/app.env"))
    parser.add_argument("--target-env", type=Path, default=Path("/srv/aura-board/supabase/.env"))
    parser.add_argument("--target-url", default="http://127.0.0.1:18000")
    parser.add_argument("--retries", type=int, default=3)
    parser.add_argument("--start-index", type=int, default=1, help="1-based object index to resume from")
    parser.add_argument("--progress-every", type=int, default=25)
    parser.add_argument("--verify-samples", type=int, default=8)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.retries < 1:
        fail("--retries must be at least 1")
    if args.start_index < 1:
        fail("--start-index must be at least 1")

    source_values = load_env_values(args.source_env, {"SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"})
    target_values = load_env_values(args.target_env, {"SERVICE_ROLE_KEY"})
    source_url = require_env_value(source_values, "SUPABASE_URL", args.source_env)
    source_key = require_env_value(source_values, "SUPABASE_SERVICE_ROLE_KEY", args.source_env)
    target_key = require_env_value(target_values, "SERVICE_ROLE_KEY", args.target_env)

    objects = load_objects(args.bucket)
    expected_bytes = sum(int(item.get("size") or 0) for item in objects)
    if args.start_index > len(objects) + 1:
        fail(f"--start-index {args.start_index} exceeds object count {len(objects)}")
    selected = objects[args.start_index - 1 :]
    run_expected_bytes = sum(int(item.get("size") or 0) for item in selected)
    log(
        f"bucket={args.bucket} objects={len(objects)} expected_bytes={expected_bytes} "
        f"start_index={args.start_index} run_objects={len(selected)} run_expected_bytes={run_expected_bytes}"
    )

    if args.dry_run:
        log("dry_run=success")
        return 0

    completed = 0
    completed_bytes = 0
    started = time.monotonic()

    for index, item in enumerate(selected, start=args.start_index):
        name = str(item.get("name") or "")
        if not name:
            fail(f"object #{index} has an empty name")
        mime = str(item.get("mime") or "application/octet-stream")
        size = int(item.get("size") or 0)
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

    log(
        f"success transferred_objects={completed} transferred_bytes={completed_bytes} "
        f"verified_samples={len(samples)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
