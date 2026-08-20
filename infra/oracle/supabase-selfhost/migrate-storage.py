#!/usr/bin/env python3

from __future__ import annotations

import argparse
import hashlib
import json
import os
import string
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.parse import quote, urlsplit


DEFAULT_BUCKET = "aura-board-uploads"
DEFAULT_VERIFY_SAMPLES = 8
MAX_RETRIES = 5
MAX_OBJECT_SIZE = 104857600
TARGET_MODE_STORAGE_API = "storage-api"
TARGET_MODE_S3_DIRECT = "s3-direct"
PATH_VERSION_SEPARATOR = "/"
FILE_VERSION_SEPARATOR = "-$v-"
DIRECT_TARGET_ENV_KEYS = frozenset(
    {
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "GLOBAL_S3_ENDPOINT",
        "GLOBAL_S3_BUCKET",
        "REGION",
        "STORAGE_TENANT_ID",
        "TUS_USE_FILE_VERSION_SEPARATOR",
    }
)
DIRECT_REQUIRED_ENV_KEYS = DIRECT_TARGET_ENV_KEYS - {"TUS_USE_FILE_VERSION_SEPARATOR"}


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
      END,
      'version', version
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
            "-q",
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


def object_version(item: dict[str, object], index: int) -> str | None:
    value = item.get("version")
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        fail(f"object #{index} has an invalid version for s3-direct mode")
    if any(ord(character) < 32 or ord(character) == 127 for character in value):
        fail(f"object #{index} has an invalid version for s3-direct mode")
    return value


def validate_object_manifest(
    objects: list[dict[str, object]], *, require_versions: bool = False
) -> None:
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
        size = object_size(item, index)
        object_mime(item, index)
        if require_versions:
            if size > MAX_OBJECT_SIZE:
                fail(f"object #{index} exceeds the configured 100 MiB limit")
            object_version(item, index)


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


def validate_base_url(value: str, label: str, *, allow_loopback_http: bool = False) -> str:
    if any(character.isspace() for character in value):
        fail(f"{label} must not contain whitespace")
    if "?" in value or "#" in value:
        fail(f"{label} must not contain a query or fragment")
    try:
        parsed = urlsplit(value)
        _ = parsed.port
    except ValueError:
        fail(f"{label} is malformed")
    if not parsed.hostname or parsed.username is not None or parsed.password is not None:
        fail(f"{label} must not contain credentials and must include a host")
    if parsed.path not in {"", "/"}:
        fail(f"{label} must be an origin URL without a path")
    if parsed.scheme.lower() == "https":
        return value.rstrip("/")
    if (
        allow_loopback_http
        and parsed.scheme.lower() == "http"
        and parsed.hostname.lower() in {"localhost", "127.0.0.1", "::1"}
    ):
        return value.rstrip("/")
    fail(f"{label} must use HTTPS unless it is an HTTP loopback target")


def create_private_header_file(key: str) -> Path:
    fd: int | None = None
    path: Path | None = None
    try:
        fd, name = tempfile.mkstemp(prefix=".aura-storage-headers-")
        path = Path(name)
        fchmod = getattr(os, "fchmod", None)
        if fchmod is not None:
            fchmod(fd, 0o600)
        else:
            os.chmod(path, 0o600)
        payload = f"apikey: {key}\nAuthorization: Bearer {key}\n".encode("utf-8")
        os.write(fd, payload)
        os.fsync(fd)
        os.close(fd)
        fd = None
        return path
    except OSError:
        if fd is not None:
            os.close(fd)
        if path is not None:
            securely_remove_temp_file(path)
        fail("could not prepare private request headers")


def curl_get_args(url: str, header_path: Path, output_path: Path | None = None) -> list[str]:
    args = [
        "curl",
        "--fail",
        "--silent",
        "--show-error",
        "--path-as-is",
        "--proto",
        "=http,https",
        "--connect-timeout",
        "15",
        "--max-time",
        "900",
        "-H",
        f"@{header_path}",
    ]
    if output_path is not None:
        args.extend(["--output", str(output_path)])
    args.append(url)
    return args


def transfer_once(
    source_url: str,
    source_key: str,
    target_url: str,
    target_key: str,
    mime: str,
) -> tuple[bool, str]:
    source_headers: Path | None = None
    target_headers: Path | None = None
    source: subprocess.Popen[bytes] | None = None
    result: tuple[bool, str] = (False, "curl_start_failed")
    cleanup_failed = False
    try:
        source_headers = create_private_header_file(source_key)
        target_headers = create_private_header_file(target_key)
        source = subprocess.Popen(
            curl_get_args(source_url, source_headers),
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
        if source.stdout is None:
            source.kill()
            source.wait()
            result = (False, "source stdout unavailable")
        else:
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
                    "-H",
                    f"@{target_headers}",
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
            source.stdout.close()
            target.communicate()
            source.wait()

            if source.returncode == 0 and target.returncode == 0:
                result = (True, "")
            else:
                details: list[str] = []
                if source.returncode != 0:
                    details.append(f"source_curl_exit={source.returncode}")
                if target.returncode != 0:
                    details.append(f"target_curl_exit={target.returncode}")
                result = (False, "; ".join(details) or "transfer failed")
    except OSError:
        if source is not None and source.poll() is None:
            source.kill()
            source.wait()
        result = (False, "curl_start_failed")
    finally:
        for header_path in (source_headers, target_headers):
            if header_path is not None and not securely_remove_temp_file(header_path):
                cleanup_failed = True
    if cleanup_failed:
        return False, "header_cleanup_failed"
    return result


def s3_object_key(
    tenant_id: str,
    bucket_id: str,
    name: str,
    version: str | None,
    *,
    use_file_version_separator: bool = False,
) -> str:
    key = f"{tenant_id}/{bucket_id}/{name}"
    if not version:
        return key
    separator = FILE_VERSION_SEPARATOR if use_file_version_separator else PATH_VERSION_SEPARATOR
    return f"{key}{separator}{version}"


def securely_remove_temp_file(path: Path) -> bool:
    try:
        os.unlink(path)
    except FileNotFoundError:
        return True
    except OSError:
        return False
    return True


def is_missing_s3_object_error(error: Exception) -> bool:
    response = getattr(error, "response", None)
    if not isinstance(response, dict):
        return False
    error_data = response.get("Error")
    metadata = response.get("ResponseMetadata")
    code = error_data.get("Code") if isinstance(error_data, dict) else None
    status = metadata.get("HTTPStatusCode") if isinstance(metadata, dict) else None
    return code in {"404", "NoSuchKey", "NotFound"} or status == 404


def is_conditional_s3_conflict(error: Exception) -> bool:
    response = getattr(error, "response", None)
    if not isinstance(response, dict):
        return False
    error_data = response.get("Error")
    metadata = response.get("ResponseMetadata")
    code = error_data.get("Code") if isinstance(error_data, dict) else None
    status = metadata.get("HTTPStatusCode") if isinstance(metadata, dict) else None
    return code in {"409", "412", "ConditionalRequestConflict", "PreconditionFailed"} or status in {
        409,
        412,
    }


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as payload:
        while True:
            chunk = payload.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def verify_existing_s3_payload(
    client: object,
    target_bucket: str,
    target_key: str,
    source_path: Path,
    expected_size: int,
) -> tuple[bool, str]:
    try:
        head = client.head_object(Bucket=target_bucket, Key=target_key)
    except Exception:
        return False, "target_exists_head_failed"
    if head.get("ContentLength") != expected_size:
        return False, "target_exists_size_mismatch"
    try:
        target_hash = hash_s3_object(client, target_bucket, target_key)
        source_hash = sha256_file(source_path)
    except (OSError, RuntimeError):
        return False, "target_exists_hash_failed"
    if target_hash != source_hash:
        return False, "target_exists_hash_mismatch"
    return True, "already_present_verified"


def direct_transfer_once(
    client: object,
    source_url: str,
    source_key: str,
    target_bucket: str,
    target_key: str,
    mime: str,
    expected_size: int,
) -> tuple[bool, str]:
    temp_path: Path | None = None
    header_path: Path | None = None
    temp_fd: int | None = None
    result: tuple[bool, str] = (False, "temporary_file_failed")
    try:
        header_path = create_private_header_file(source_key)
        temp_fd, temp_name = tempfile.mkstemp(prefix=".aura-storage-payload-")
        temp_path = Path(temp_name)
        os.chmod(temp_path, 0o600)
        os.close(temp_fd)
        temp_fd = None

        try:
            completed = subprocess.run(
                curl_get_args(source_url, header_path, temp_path),
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except OSError:
            result = (False, "source_download_failed")
        else:
            if completed.returncode != 0:
                result = (False, "source_download_failed")
            else:
                try:
                    actual_size = temp_path.stat().st_size
                except OSError:
                    result = (False, "source_size_unavailable")
                else:
                    if actual_size != expected_size:
                        result = (False, "source_size_mismatch")
                    else:
                        try:
                            head = client.head_object(Bucket=target_bucket, Key=target_key)
                        except Exception as exc:
                            if not is_missing_s3_object_error(exc):
                                result = (False, "target_head_failed")
                            else:
                                try:
                                    with temp_path.open("rb") as payload:
                                        client.put_object(
                                            Bucket=target_bucket,
                                            Key=target_key,
                                            Body=payload,
                                            ContentType=mime,
                                            IfNoneMatch="*",
                                        )
                                except Exception as put_error:
                                    if is_conditional_s3_conflict(put_error):
                                        result = verify_existing_s3_payload(
                                            client,
                                            target_bucket,
                                            target_key,
                                            temp_path,
                                            expected_size,
                                        )
                                    else:
                                        result = (False, "s3_conditional_create_failed")
                                else:
                                    try:
                                        created_head = client.head_object(
                                            Bucket=target_bucket,
                                            Key=target_key,
                                        )
                                    except Exception:
                                        result = (False, "target_size_check_failed")
                                    else:
                                        if created_head.get("ContentLength") != expected_size:
                                            result = (False, "target_size_mismatch")
                                        else:
                                            result = (True, "")
                        else:
                            result = verify_existing_s3_payload(
                                client,
                                target_bucket,
                                target_key,
                                temp_path,
                                expected_size,
                            )
    except OSError:
        result = (False, "temporary_file_failed")
    finally:
        if temp_fd is not None:
            try:
                os.close(temp_fd)
            except OSError:
                result = (False, "temporary_file_cleanup_failed")
        if temp_path is not None and not securely_remove_temp_file(temp_path):
            result = (False, "temporary_file_cleanup_failed")
        if header_path is not None and not securely_remove_temp_file(header_path):
            result = (False, "temporary_file_cleanup_failed")
    return result


def hash_object(url: str, key: str) -> str:
    header_path: Path | None = None
    try:
        header_path = create_private_header_file(key)
        try:
            process = subprocess.Popen(
                curl_get_args(url, header_path),
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
    finally:
        if header_path is not None and not securely_remove_temp_file(header_path):
            fail("hash header cleanup failed")


def hash_s3_object(client: object, bucket: str, key: str) -> str:
    body = None
    try:
        response = client.get_object(Bucket=bucket, Key=key)
        body = response["Body"]
        digest = hashlib.sha256()
        while True:
            chunk = body.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
        return digest.hexdigest()
    except Exception:
        raise RuntimeError("direct S3 hash download failed") from None
    finally:
        if body is not None:
            try:
                body.close()
            except Exception:
                pass


def create_s3_client(values: dict[str, str]) -> object:
    try:
        import boto3
        from botocore.config import Config
        from botocore.exceptions import BotoCoreError
    except ImportError:
        fail("s3-direct requires boto3 and botocore")

    endpoint = values["GLOBAL_S3_ENDPOINT"]
    try:
        parsed_endpoint = urlsplit(endpoint)
        _ = parsed_endpoint.port
    except ValueError:
        fail("s3-direct GLOBAL_S3_ENDPOINT is malformed")
    if (
        parsed_endpoint.scheme.lower() != "https"
        or not parsed_endpoint.hostname
        or parsed_endpoint.username is not None
        or parsed_endpoint.password is not None
        or parsed_endpoint.query
        or parsed_endpoint.fragment
    ):
        fail("s3-direct GLOBAL_S3_ENDPOINT must be credential-free HTTPS without query or fragment")

    try:
        return boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=values["AWS_ACCESS_KEY_ID"],
            aws_secret_access_key=values["AWS_SECRET_ACCESS_KEY"],
            region_name=values["REGION"],
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"},
            ),
        )
    except (BotoCoreError, ValueError):
        fail("s3-direct client initialization failed")


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
    parser.add_argument(
        "--target-mode",
        choices=(TARGET_MODE_STORAGE_API, TARGET_MODE_S3_DIRECT),
        default=TARGET_MODE_STORAGE_API,
        help="target write/verification path (default: storage-api)",
    )
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
    normalized_manifest_sha256 = None
    if args.expected_manifest_sha256:
        normalized_manifest_sha256 = args.expected_manifest_sha256.lower()
        if len(normalized_manifest_sha256) != 64 or any(
            character not in string.hexdigits for character in normalized_manifest_sha256
        ):
            fail("--expected-manifest-sha256 must be a 64-character hexadecimal digest")

    objects = load_objects(args.bucket)
    validate_object_manifest(
        objects,
        require_versions=args.target_mode == TARGET_MODE_S3_DIRECT,
    )
    current_manifest_sha256 = manifest_sha256(objects)
    if args.start_index > 1 and normalized_manifest_sha256 != current_manifest_sha256:
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
    source_url = validate_base_url(
        require_env_value(source_values, "SUPABASE_URL", args.source_env),
        "SUPABASE_URL",
    )
    source_key = require_env_value(source_values, "SUPABASE_SERVICE_ROLE_KEY", args.source_env)
    target_url = validate_base_url(
        args.target_url,
        "--target-url",
        allow_loopback_http=True,
    )

    target_key = ""
    target_s3_bucket = ""
    tenant_id = ""
    use_file_version_separator = False
    s3_client: object | None = None
    if args.target_mode == TARGET_MODE_STORAGE_API:
        target_values = load_env_values(args.target_env, {"SERVICE_ROLE_KEY"})
        target_key = require_env_value(target_values, "SERVICE_ROLE_KEY", args.target_env)
    else:
        target_values = load_env_values(args.target_env, set(DIRECT_TARGET_ENV_KEYS))
        direct_values = {
            key: require_env_value(target_values, key, args.target_env)
            for key in DIRECT_REQUIRED_ENV_KEYS
        }
        separator_value = target_values.get("TUS_USE_FILE_VERSION_SEPARATOR", "").strip().lower()
        if separator_value not in {"", "true", "false"}:
            fail("TUS_USE_FILE_VERSION_SEPARATOR must be true or false when set")
        use_file_version_separator = separator_value == "true"
        target_s3_bucket = direct_values["GLOBAL_S3_BUCKET"]
        tenant_id = direct_values["STORAGE_TENANT_ID"]
        s3_client = create_s3_client(direct_values)

    completed = 0
    completed_bytes = 0
    started = time.monotonic()

    for index, item in enumerate(selected, start=args.start_index):
        name = item["name"]
        if not isinstance(name, str):
            fail(f"object #{index} has an invalid name")
        mime = object_mime(item, index)
        size = object_size(item, index)
        object_ref = hashlib.sha256(name.encode("utf-8")).hexdigest()[:12]

        error = ""
        for attempt in range(1, args.retries + 1):
            if args.target_mode == TARGET_MODE_STORAGE_API:
                source_object_url = object_url(source_url, args.bucket, name)
                target_object_url = object_url(target_url, args.bucket, name)
                success, error = transfer_once(
                    source_object_url,
                    source_key,
                    target_object_url,
                    target_key,
                    mime,
                )
            else:
                version = object_version(item, index)
                success, error = direct_transfer_once(
                    s3_client,
                    object_url(source_url, args.bucket, name),
                    source_key,
                    target_s3_bucket,
                    s3_object_key(
                        tenant_id,
                        args.bucket,
                        name,
                        version,
                        use_file_version_separator=use_file_version_separator,
                    ),
                    mime,
                    size,
                )
            if success:
                break
            if attempt < args.retries:
                time.sleep(min(2 ** (attempt - 1), 8))
        else:
            if args.target_mode == TARGET_MODE_S3_DIRECT:
                fail(f"object_ref={object_ref} index={index} attempts={args.retries} transfer_failed")
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
        try:
            source_hash = hash_object(object_url(source_url, args.bucket, name), source_key)
            if args.target_mode == TARGET_MODE_STORAGE_API:
                target_hash = hash_object(object_url(target_url, args.bucket, name), target_key)
            else:
                version = object_version(item, index)
                target_hash = hash_s3_object(
                    s3_client,
                    target_s3_bucket,
                    s3_object_key(
                        tenant_id,
                        args.bucket,
                        name,
                        version,
                        use_file_version_separator=use_file_version_separator,
                    ),
                )
        except RuntimeError:
            object_ref = hashlib.sha256(name.encode("utf-8")).hexdigest()[:12]
            fail(f"verification failed sample={index}/{len(samples)} object_ref={object_ref}")
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
