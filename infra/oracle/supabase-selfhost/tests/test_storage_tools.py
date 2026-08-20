from __future__ import annotations

import importlib.util
import io
import json
import os
import stat
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


SCRIPT_DIR = Path(__file__).resolve().parents[1]


def load_script_module(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPT_DIR / filename)
    if spec is None or spec.loader is None:
        raise AssertionError(f"could not load {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


migrate_storage = load_script_module("migrate_storage", "migrate-storage.py")
scan_storage_urls = load_script_module("scan_storage_urls", "scan-storage-urls.py")
configure_storage_s3 = load_script_module("configure_storage_s3", "configure-storage-s3.py")


class StorageS3ConfigurationTests(unittest.TestCase):
    @staticmethod
    def base_argv(env_path: Path, mode: str = "--write") -> list[str]:
        return [
            "configure-storage-s3.py",
            "--env-file",
            str(env_path),
            "--bucket",
            "aura-board-uploads",
            "--endpoint",
            "https://namespace.compat.objectstorage.ap-osaka-1.oci.customer-oci.com",
            "--region",
            "ap-osaka-1",
            mode,
        ]

    @staticmethod
    def assert_private_mode(test_case: unittest.TestCase, path: Path) -> None:
        mode = stat.S_IMODE(path.stat().st_mode)
        if os.name == "nt":
            # Windows exposes ACLs rather than POSIX mode bits through chmod/stat.
            return
        else:
            test_case.assertEqual(mode, 0o600)

    def test_dry_run_does_not_read_stdin_or_mutate_files(self) -> None:
        class ExplodingStdin:
            def read(self):
                raise AssertionError("dry-run must not read stdin")

        with tempfile.TemporaryDirectory() as temporary_directory:
            env_path = Path(temporary_directory) / ".env"
            original = b"# keep\nUNRELATED=value\n"
            env_path.write_bytes(original)
            output = io.StringIO()
            argv = self.base_argv(env_path, "--dry-run")
            with (
                patch.object(sys, "argv", argv),
                patch.object(sys, "stdin", ExplodingStdin()),
                redirect_stdout(output),
            ):
                result = configure_storage_s3.main()

            self.assertEqual(result, 0)
            self.assertEqual(
                output.getvalue().splitlines(),
                [
                    f"env_path={env_path}",
                    "bucket=aura-board-uploads",
                    "endpoint_host=namespace.compat.objectstorage.ap-osaka-1.oci.customer-oci.com",
                    "region=ap-osaka-1",
                    "planned_keys=STORAGE_BACKEND,GLOBAL_S3_BUCKET,GLOBAL_S3_ENDPOINT,GLOBAL_S3_PROTOCOL,GLOBAL_S3_FORCE_PATH_STYLE,AWS_ACCESS_KEY_ID,AWS_SECRET_ACCESS_KEY,REGION",
                ],
            )
            self.assertEqual(env_path.read_bytes(), original)
            self.assertEqual(list(env_path.parent.glob(".env.backup-*")), [])

    def test_missing_mode_fails_without_reading_stdin_or_mutating(self) -> None:
        class ExplodingStdin:
            def read(self):
                raise AssertionError("missing mode must not read stdin")

        with tempfile.TemporaryDirectory() as temporary_directory:
            env_path = Path(temporary_directory) / ".env"
            original = b"UNRELATED=keep\n"
            env_path.write_bytes(original)
            argv = self.base_argv(env_path)[:-1]
            with (
                patch.object(sys, "argv", argv),
                patch.object(sys, "stdin", ExplodingStdin()),
            ):
                with self.assertRaisesRegex(SystemExit, "invalid command-line arguments"):
                    configure_storage_s3.main()
            self.assertEqual(env_path.read_bytes(), original)

    def test_write_replaces_exact_keys_preserves_other_lines_and_creates_backup(self) -> None:
        access_key = "access-key-fixture"
        secret_key = "secret-key-fixture"
        with tempfile.TemporaryDirectory() as temporary_directory:
            env_path = Path(temporary_directory) / ".env"
            original = (
                b"# preserve this comment\r\n"
                b"UNRELATED=keep\r\n"
                b"STORAGE_BACKEND=file\r\n"
                b"GLOBAL_S3_BUCKET=old-bucket\r\n"
                b"GLOBAL_S3_ENDPOINT=https://old.example\r\n"
                b"GLOBAL_S3_PROTOCOL=http\r\n"
                b"GLOBAL_S3_FORCE_PATH_STYLE=false\r\n"
                b"AWS_ACCESS_KEY_ID=old-access\r\n"
                b"AWS_SECRET_ACCESS_KEY=old-secret\r\n"
                b"REGION=old-region\r\n"
                b"TRAILING=keep\r\n"
            )
            env_path.write_bytes(original)
            os.chmod(env_path, 0o644)
            output = io.StringIO()
            argv = self.base_argv(env_path)
            payload = json.dumps({"accessKeyId": access_key, "secretAccessKey": secret_key})
            with (
                patch.object(sys, "argv", argv),
                patch.object(sys, "stdin", io.StringIO(payload)),
                redirect_stdout(output),
            ):
                result = configure_storage_s3.main()

            expected = (
                b"# preserve this comment\r\n"
                b"UNRELATED=keep\r\n"
                b"STORAGE_BACKEND=s3\r\n"
                b"GLOBAL_S3_BUCKET=aura-board-uploads\r\n"
                b"GLOBAL_S3_ENDPOINT=https://namespace.compat.objectstorage.ap-osaka-1.oci.customer-oci.com\r\n"
                b"GLOBAL_S3_PROTOCOL=https\r\n"
                b"GLOBAL_S3_FORCE_PATH_STYLE=true\r\n"
                b"AWS_ACCESS_KEY_ID=access-key-fixture\r\n"
                b"AWS_SECRET_ACCESS_KEY=secret-key-fixture\r\n"
                b"REGION=ap-osaka-1\r\n"
                b"TRAILING=keep\r\n"
            )
            self.assertEqual(result, 0)
            self.assertEqual(env_path.read_bytes(), expected)
            self.assert_private_mode(self, env_path)
            backups = list(env_path.parent.glob(".env.backup-*"))
            self.assertEqual(len(backups), 1)
            self.assertEqual(backups[0].read_bytes(), original)
            self.assert_private_mode(self, backups[0])
            self.assertNotIn(access_key, output.getvalue())
            self.assertNotIn(secret_key, output.getvalue())
            self.assertNotIn("old-secret", output.getvalue())

    def test_duplicate_target_keys_collapse_to_one_canonical_occurrence(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            env_path = Path(temporary_directory) / ".env"
            env_path.write_bytes(
                b"# keep\n"
                b"STORAGE_BACKEND=file\n"
                b"UNRELATED=keep\n"
                b"STORAGE_BACKEND=duplicate\n"
                b"export REGION=old-region\n"
                b"REGION=duplicate-region\n"
            )
            payload = json.dumps({"accessKeyId": "access", "secretAccessKey": "secret"})
            with (
                patch.object(sys, "argv", self.base_argv(env_path)),
                patch.object(sys, "stdin", io.StringIO(payload)),
            ):
                configure_storage_s3.main()

            rendered = env_path.read_text(encoding="utf-8")
            for key in configure_storage_s3.TARGET_KEYS:
                self.assertEqual(rendered.count(f"{key}="), 1)
            self.assertIn("# keep\n", rendered)
            self.assertIn("UNRELATED=keep\n", rendered)
            self.assertIn("STORAGE_BACKEND=s3\n", rendered)
            self.assertIn("REGION=ap-osaka-1\n", rendered)
            self.assertNotIn("export REGION=", rendered)

    def test_errors_redact_stdin_payload_and_command_line_credential_data(self) -> None:
        stdin_secret = "stdin-secret-fixture"
        cli_secret = "cli-secret-fixture"
        with tempfile.TemporaryDirectory() as temporary_directory:
            env_path = Path(temporary_directory) / ".env"
            original = f"AWS_SECRET_ACCESS_KEY=existing-secret-fixture\n".encode()
            env_path.write_bytes(original)
            malformed_payload = (
                '{"accessKeyId":"access","secretAccessKey":"'
                + stdin_secret
                + '",}'
            )
            with (
                patch.object(sys, "argv", self.base_argv(env_path)),
                patch.object(sys, "stdin", io.StringIO(malformed_payload)),
            ):
                with self.assertRaisesRegex(SystemExit, "stdin must contain") as raised:
                    configure_storage_s3.main()
            self.assertNotIn(stdin_secret, str(raised.exception))
            self.assertEqual(env_path.read_bytes(), original)

            with (
                patch.object(sys, "argv", self.base_argv(env_path) + ["--accessKeyId", cli_secret]),
                patch.object(sys, "stdin", io.StringIO("must-not-be-read")),
            ):
                with self.assertRaises(SystemExit) as raised:
                    configure_storage_s3.main()
            self.assertNotIn(cli_secret, str(raised.exception))

    def test_symlink_env_file_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            target = directory / "real.env"
            link = directory / ".env"
            target.write_text("UNRELATED=keep\n", encoding="utf-8")
            try:
                link.symlink_to(target)
            except (OSError, NotImplementedError) as exc:
                self.skipTest(f"symlink creation unavailable: {exc}")

            with (
                patch.object(sys, "argv", self.base_argv(link)),
                patch.object(sys, "stdin", io.StringIO("must-not-be-read")),
            ):
                with self.assertRaisesRegex(SystemExit, "symlink"):
                    configure_storage_s3.main()
            self.assertEqual(target.read_text(encoding="utf-8"), "UNRELATED=keep\n")

    def test_cli_input_validation_rejects_unsafe_values(self) -> None:
        cases = (
            (["--bucket", ""], "must not be empty"),
            (["--region", "ap\nosaka-1"], "control characters"),
            (["--endpoint", "http://storage.example"], "must use https"),
            (["--endpoint", "https://user:password@storage.example"], "credentials"),
            (["--endpoint", "https://storage.example/?token=endpoint-secret"], "query"),
            (["--endpoint", "https://storage.example/#fragment-secret"], "fragment"),
        )
        with tempfile.TemporaryDirectory() as temporary_directory:
            env_path = Path(temporary_directory) / ".env"
            env_path.write_text("UNRELATED=keep\n", encoding="utf-8")
            for replacements, expected_message in cases:
                with self.subTest(replacements=replacements):
                    argv = self.base_argv(env_path)
                    for index in range(0, len(replacements), 2):
                        option, value = replacements[index : index + 2]
                        argv[argv.index(option) + 1] = value
                    with (
                        patch.object(sys, "argv", argv),
                        patch.object(sys, "stdin", io.StringIO("must-not-be-read")),
                    ):
                        with self.assertRaisesRegex(SystemExit, expected_message):
                            configure_storage_s3.main()

    def test_stdin_must_be_exact_json_object_with_two_string_fields(self) -> None:
        payloads = (
            '{"accessKeyId":"first","accessKeyId":"duplicate","secretAccessKey":"secret"}',
            '{"accessKeyId":"access","secretAccessKey":"secret","extra":"field"}',
            '{"accessKeyId":"access"}',
            "[]",
            '{"accessKeyId":1,"secretAccessKey":"secret"}',
            json.dumps({"accessKeyId": "access\nvalue", "secretAccessKey": "secret"}),
        )
        with tempfile.TemporaryDirectory() as temporary_directory:
            env_path = Path(temporary_directory) / ".env"
            original = b"UNRELATED=keep\n"
            env_path.write_bytes(original)
            for payload in payloads:
                with self.subTest(payload=payload):
                    with (
                        patch.object(sys, "argv", self.base_argv(env_path)),
                        patch.object(sys, "stdin", io.StringIO(payload)),
                    ):
                        with self.assertRaises(SystemExit):
                            configure_storage_s3.main()
                    self.assertEqual(env_path.read_bytes(), original)

    def test_credentials_reject_dotenv_special_characters_without_echoing_them(self) -> None:
        unsafe_values = ("access$key", "secret#key", "secret value", "비밀값")
        with tempfile.TemporaryDirectory() as temporary_directory:
            env_path = Path(temporary_directory) / ".env"
            original = b"UNRELATED=keep\n"
            env_path.write_bytes(original)
            for unsafe in unsafe_values:
                with self.subTest(unsafe=unsafe):
                    payload = json.dumps(
                        {"accessKeyId": "access-key", "secretAccessKey": unsafe}
                    )
                    with (
                        patch.object(sys, "argv", self.base_argv(env_path)),
                        patch.object(sys, "stdin", io.StringIO(payload)),
                    ):
                        with self.assertRaisesRegex(
                            SystemExit, "unsafe for Docker Compose dotenv"
                        ) as raised:
                            configure_storage_s3.main()
                    self.assertNotIn(unsafe, str(raised.exception))
                    self.assertEqual(env_path.read_bytes(), original)


class StorageMigrationTests(unittest.TestCase):
    def test_manifest_query_suppresses_psql_command_status(self) -> None:
        completed = SimpleNamespace(returncode=0, stdout="[]\n", stderr="")
        with patch.object(migrate_storage.subprocess, "run", return_value=completed) as run:
            objects = migrate_storage.load_objects("aura-board-uploads")

        command = run.call_args.args[0]
        self.assertEqual(objects, [])
        self.assertIn("-q", command)

    def test_manifest_is_c_ordered_and_digest_includes_version(self) -> None:
        manifest = [
            {"name": "a.txt", "mime": "text/plain", "size": 3, "version": "v1"},
        ]
        completed = SimpleNamespace(stdout=json.dumps(manifest), returncode=0, stderr="")
        with patch.object(migrate_storage.subprocess, "run", return_value=completed) as run:
            objects = migrate_storage.load_objects("aura-board-uploads")

        sql = run.call_args.kwargs["input"]
        self.assertEqual(objects, manifest)
        self.assertIn("'version', version", sql)
        self.assertIn('ORDER BY name COLLATE "C"', sql)
        changed = [dict(manifest[0], version="v2")]
        self.assertNotEqual(
            migrate_storage.manifest_sha256(manifest),
            migrate_storage.manifest_sha256(changed),
        )

    def test_direct_key_matches_upstream_optional_version_separator(self) -> None:
        self.assertEqual(
            migrate_storage.s3_object_key("tenant", "bucket", "private/a.txt", "v1"),
            "tenant/bucket/private/a.txt/v1",
        )
        self.assertEqual(
            migrate_storage.s3_object_key("tenant", "bucket", "private/a.txt", None),
            "tenant/bucket/private/a.txt",
        )
        self.assertEqual(
            migrate_storage.s3_object_key(
                "tenant",
                "bucket",
                "private/a.txt",
                "v1",
                use_file_version_separator=True,
            ),
            "tenant/bucket/private/a.txt-$v-v1",
        )
        migrate_storage.validate_object_manifest(
            [{"name": "a.txt", "mime": "text/plain", "size": 1, "version": None}],
            require_versions=True,
        )
        with self.assertRaisesRegex(SystemExit, "invalid version"):
            migrate_storage.validate_object_manifest(
                [{"name": "a.txt", "mime": "text/plain", "size": 1, "version": 7}],
                require_versions=True,
            )
        with self.assertRaisesRegex(SystemExit, "100 MiB"):
            migrate_storage.validate_object_manifest(
                [
                    {
                        "name": "too-large.bin",
                        "mime": "application/octet-stream",
                        "size": migrate_storage.MAX_OBJECT_SIZE + 1,
                        "version": "v1",
                    },
                ],
                require_versions=True,
            )

    def test_direct_dry_run_does_not_read_credentials_or_import_s3_client(self) -> None:
        objects = [
            {"name": "a.txt", "mime": "text/plain", "size": 1, "version": "v1"},
        ]
        output = io.StringIO()
        with (
            patch.object(migrate_storage, "load_objects", return_value=objects),
            patch.object(
                migrate_storage,
                "load_env_values",
                side_effect=AssertionError("dry-run must not read credentials"),
            ),
            patch.object(
                migrate_storage,
                "create_s3_client",
                side_effect=AssertionError("dry-run must not create an S3 client"),
            ),
            patch.object(
                sys,
                "argv",
                ["migrate-storage.py", "--target-mode", "s3-direct", "--dry-run"],
            ),
            redirect_stdout(output),
        ):
            result = migrate_storage.main()

        self.assertEqual(result, 0)
        self.assertIn("credentials=not_read", output.getvalue())

    def test_direct_transfer_rejects_exact_size_mismatch(self) -> None:
        class NeverCalledClient:
            def put_object(self, **_kwargs):
                raise AssertionError("size mismatch must not upload")

            def head_object(self, **_kwargs):
                raise AssertionError("size mismatch must not head")

        def write_wrong_size(command: list[str], **_kwargs):
            output_path = Path(command[command.index("--output") + 1])
            output_path.write_bytes(b"no")
            return SimpleNamespace(returncode=0)

        with patch.object(migrate_storage.subprocess, "run", side_effect=write_wrong_size):
            success, error = migrate_storage.direct_transfer_once(
                NeverCalledClient(),
                "https://source.example/object",
                "source-key",
                "storage-bucket",
                "tenant/bucket/object/v1",
                "text/plain",
                3,
            )

        self.assertFalse(success)
        self.assertEqual(error, "source_size_mismatch")

    def test_direct_transfer_uploads_and_head_verifies(self) -> None:
        payload = b"yes"

        def write_payload(command: list[str], **_kwargs):
            output_path = Path(command[command.index("--output") + 1])
            output_path.write_bytes(payload)
            return SimpleNamespace(returncode=0)

        class FakeClient:
            def __init__(self) -> None:
                self.uploaded: bytes | None = None
                self.put_kwargs: dict[str, object] | None = None

            def put_object(self, **kwargs):
                self.put_kwargs = kwargs
                self.uploaded = kwargs["Body"].read()

            def head_object(self, **_kwargs):
                if self.uploaded is None:
                    error = RuntimeError("missing")
                    error.response = {
                        "Error": {"Code": "NoSuchKey"},
                        "ResponseMetadata": {"HTTPStatusCode": 404},
                    }
                    raise error
                return {"ContentLength": len(payload)}

        client = FakeClient()
        with patch.object(migrate_storage.subprocess, "run", side_effect=write_payload):
            success, error = migrate_storage.direct_transfer_once(
                client,
                "https://source.example/object",
                "source-key",
                "storage-bucket",
                "tenant/bucket/object/v1",
                "text/plain",
                len(payload),
            )

        self.assertTrue(success)
        self.assertEqual(error, "")
        self.assertEqual(client.uploaded, payload)
        self.assertEqual(
            client.put_kwargs,
            {
                "Bucket": "storage-bucket",
                "Key": "tenant/bucket/object/v1",
                "Body": client.put_kwargs["Body"],
                "ContentType": "text/plain",
                "IfNoneMatch": "*",
            },
        )

    def test_direct_transfer_verifies_existing_object_without_overwrite(self) -> None:
        payload = b"already-present"

        def write_payload(command: list[str], **_kwargs):
            output_path = Path(command[command.index("--output") + 1])
            output_path.write_bytes(payload)
            return SimpleNamespace(returncode=0)

        class FakeBody:
            def __init__(self) -> None:
                self.sent = False

            def read(self, _size: int) -> bytes:
                if self.sent:
                    return b""
                self.sent = True
                return payload

            def close(self) -> None:
                pass

        class ExistingClient:
            def head_object(self, **_kwargs):
                return {"ContentLength": len(payload)}

            def get_object(self, **_kwargs):
                return {"Body": FakeBody()}

            def put_object(self, **_kwargs):
                raise AssertionError("verified existing object must not be overwritten")

        with patch.object(migrate_storage.subprocess, "run", side_effect=write_payload):
            success, status = migrate_storage.direct_transfer_once(
                ExistingClient(),
                "https://source.example/object",
                "source-key",
                "storage-bucket",
                "tenant/bucket/object/v1",
                "text/plain",
                len(payload),
            )

        self.assertTrue(success)
        self.assertEqual(status, "already_present_verified")

    def test_direct_transfer_rejects_same_size_existing_hash_mismatch(self) -> None:
        source_payload = b"source-payload"
        target_payload = b"target-payload"

        def write_payload(command: list[str], **_kwargs):
            output_path = Path(command[command.index("--output") + 1])
            output_path.write_bytes(source_payload)
            return SimpleNamespace(returncode=0)

        class FakeBody:
            def __init__(self) -> None:
                self.sent = False

            def read(self, _size: int) -> bytes:
                if self.sent:
                    return b""
                self.sent = True
                return target_payload

            def close(self) -> None:
                pass

        class ExistingMismatchClient:
            def head_object(self, **_kwargs):
                return {"ContentLength": len(source_payload)}

            def get_object(self, **_kwargs):
                return {"Body": FakeBody()}

            def put_object(self, **_kwargs):
                raise AssertionError("existing mismatch must not be overwritten")

        with patch.object(migrate_storage.subprocess, "run", side_effect=write_payload):
            success, status = migrate_storage.direct_transfer_once(
                ExistingMismatchClient(),
                "https://source.example/object",
                "source-key",
                "storage-bucket",
                "tenant/bucket/object/v1",
                "text/plain",
                len(source_payload),
            )

        self.assertFalse(success)
        self.assertEqual(status, "target_exists_hash_mismatch")

    def test_direct_transfer_verifies_concurrent_conditional_create_winner(self) -> None:
        payload = b"concurrent-winner"

        def write_payload(command: list[str], **_kwargs):
            output_path = Path(command[command.index("--output") + 1])
            output_path.write_bytes(payload)
            return SimpleNamespace(returncode=0)

        class FakeBody:
            def __init__(self) -> None:
                self.sent = False

            def read(self, _size: int) -> bytes:
                if self.sent:
                    return b""
                self.sent = True
                return payload

            def close(self) -> None:
                pass

        class ConcurrentClient:
            def __init__(self) -> None:
                self.head_calls = 0
                self.put_kwargs: dict[str, object] | None = None

            def head_object(self, **_kwargs):
                self.head_calls += 1
                if self.head_calls == 1:
                    error = RuntimeError("missing")
                    error.response = {
                        "Error": {"Code": "NoSuchKey"},
                        "ResponseMetadata": {"HTTPStatusCode": 404},
                    }
                    raise error
                return {"ContentLength": len(payload)}

            def put_object(self, **kwargs):
                self.put_kwargs = kwargs
                error = RuntimeError("precondition")
                error.response = {
                    "Error": {"Code": "PreconditionFailed"},
                    "ResponseMetadata": {"HTTPStatusCode": 412},
                }
                raise error

            def get_object(self, **_kwargs):
                return {"Body": FakeBody()}

        client = ConcurrentClient()
        with patch.object(migrate_storage.subprocess, "run", side_effect=write_payload):
            success, status = migrate_storage.direct_transfer_once(
                client,
                "https://source.example/object",
                "source-key",
                "storage-bucket",
                "tenant/bucket/object/v1",
                "text/plain",
                len(payload),
            )

        self.assertTrue(success)
        self.assertEqual(status, "already_present_verified")
        self.assertEqual(client.put_kwargs["IfNoneMatch"], "*")
        self.assertEqual(client.head_calls, 2)

    def test_main_rejects_credentialed_base_urls_before_transfer(self) -> None:
        objects = [{"name": "a.txt", "mime": "text/plain", "size": 1}]

        def source_with_credentials(_path: Path, keys: set[str]) -> dict[str, str]:
            if "SUPABASE_URL" in keys:
                return {
                    "SUPABASE_URL": "https://user:source-secret@source.example",
                    "SUPABASE_SERVICE_ROLE_KEY": "source-key",
                }
            return {"SERVICE_ROLE_KEY": "target-key"}

        with (
            patch.object(migrate_storage, "load_objects", return_value=objects),
            patch.object(migrate_storage, "load_env_values", side_effect=source_with_credentials),
            patch.object(
                migrate_storage,
                "transfer_once",
                side_effect=AssertionError("credentialed URL must fail before curl"),
            ),
            patch.object(sys, "argv", ["migrate-storage.py"]),
        ):
            with self.assertRaisesRegex(SystemExit, "must not contain credentials"):
                migrate_storage.main()

        def valid_source(_path: Path, keys: set[str]) -> dict[str, str]:
            if "SUPABASE_URL" in keys:
                return {
                    "SUPABASE_URL": "https://source.example",
                    "SUPABASE_SERVICE_ROLE_KEY": "source-key",
                }
            return {"SERVICE_ROLE_KEY": "target-key"}

        with (
            patch.object(migrate_storage, "load_objects", return_value=objects),
            patch.object(migrate_storage, "load_env_values", side_effect=valid_source),
            patch.object(
                migrate_storage,
                "transfer_once",
                side_effect=AssertionError("credentialed URL must fail before curl"),
            ),
            patch.object(
                sys,
                "argv",
                [
                    "migrate-storage.py",
                    "--target-url",
                    "https://user:target-secret@target.example",
                ],
            ),
        ):
            with self.assertRaisesRegex(SystemExit, "must not contain credentials"):
                migrate_storage.main()

    def test_base_url_rejects_empty_query_and_fragment_delimiters(self) -> None:
        for value in ("https://source.example?", "https://source.example#"):
            with self.subTest(value=value):
                with self.assertRaisesRegex(SystemExit, "query or fragment"):
                    migrate_storage.validate_base_url(value, "SUPABASE_URL")

    def test_direct_failures_are_sanitized_to_object_ref_and_index(self) -> None:
        objects = [
            {
                "name": "private/secret-object.txt",
                "mime": "text/plain",
                "size": 1,
                "version": "version-secret",
            },
        ]

        def fake_env(_path: Path, keys: set[str]) -> dict[str, str]:
            if "SUPABASE_URL" in keys:
                return {
                    "SUPABASE_URL": "https://source.example",
                    "SUPABASE_SERVICE_ROLE_KEY": "source-secret",
                }
            return {
                "AWS_ACCESS_KEY_ID": "access-secret",
                "AWS_SECRET_ACCESS_KEY": "secret-secret",
                "GLOBAL_S3_ENDPOINT": "https://target.example",
                "GLOBAL_S3_BUCKET": "storage-secret",
                "REGION": "ap-osaka-1",
                "STORAGE_TENANT_ID": "tenant-secret",
            }

        output = io.StringIO()
        with (
            patch.object(migrate_storage, "load_objects", return_value=objects),
            patch.object(migrate_storage, "load_env_values", side_effect=fake_env),
            patch.object(migrate_storage, "create_s3_client", return_value=object()),
            patch.object(
                migrate_storage,
                "direct_transfer_once",
                return_value=(False, "secret-secret/private/secret-object.txt"),
            ),
            patch.object(
                sys,
                "argv",
                ["migrate-storage.py", "--target-mode", "s3-direct", "--retries", "1"],
            ),
            redirect_stdout(output),
        ):
            with self.assertRaisesRegex(SystemExit, "object_ref=.* index=1") as raised:
                migrate_storage.main()

        message = str(raised.exception)
        self.assertNotIn("secret-secret", message)
        self.assertNotIn("secret-object.txt", message)
        self.assertNotIn("source-secret", message)
        self.assertNotIn("target.example", message)
        self.assertNotIn("secret-object.txt", output.getvalue())

    def test_direct_sample_hash_uses_s3_get_object_not_storage_api(self) -> None:
        class FakeBody:
            def __init__(self, chunks: list[bytes]) -> None:
                self.chunks = iter(chunks)
                self.closed = False

            def read(self, _size: int) -> bytes:
                return next(self.chunks, b"")

            def close(self) -> None:
                self.closed = True

        body = FakeBody([b"payload", b""])

        class FakeClient:
            def get_object(self, **kwargs):
                self.get_kwargs = kwargs
                return {"Body": body}

        client = FakeClient()
        expected = migrate_storage.hashlib.sha256(b"payload").hexdigest()
        self.assertEqual(
            migrate_storage.hash_s3_object(client, "storage-bucket", "tenant/bucket/a/v1"),
            expected,
        )
        self.assertEqual(
            client.get_kwargs,
            {"Bucket": "storage-bucket", "Key": "tenant/bucket/a/v1"},
        )
        self.assertTrue(body.closed)

    def test_direct_main_uses_versioned_key_and_s3_sample_verification(self) -> None:
        objects = [
            {"name": "private/a.txt", "mime": "text/plain", "size": 7, "version": "v1"},
        ]
        target_env_keys: list[set[str]] = []

        def fake_env(_path: Path, keys: set[str]) -> dict[str, str]:
            if "SUPABASE_URL" in keys:
                return {
                    "SUPABASE_URL": "https://source.example",
                    "SUPABASE_SERVICE_ROLE_KEY": "source-secret",
                }
            target_env_keys.append(keys)
            return {
                "AWS_ACCESS_KEY_ID": "access-secret",
                "AWS_SECRET_ACCESS_KEY": "secret-secret",
                "GLOBAL_S3_ENDPOINT": "https://target.example",
                "GLOBAL_S3_BUCKET": "storage-bucket",
                "REGION": "ap-osaka-1",
                "STORAGE_TENANT_ID": "tenant-id",
            }

        with (
            patch.object(migrate_storage, "load_objects", return_value=objects),
            patch.object(migrate_storage, "load_env_values", side_effect=fake_env),
            patch.object(migrate_storage, "create_s3_client", return_value=object()),
            patch.object(
                migrate_storage,
                "direct_transfer_once",
                return_value=(True, ""),
            ) as transfer,
            patch.object(migrate_storage, "hash_object", return_value="same-hash") as source_hash,
            patch.object(migrate_storage, "hash_s3_object", return_value="same-hash") as target_hash,
            patch.object(
                sys,
                "argv",
                [
                    "migrate-storage.py",
                    "--target-mode",
                    "s3-direct",
                    "--verify-samples",
                    "1",
                ],
            ),
        ):
            result = migrate_storage.main()

        self.assertEqual(result, 0)
        self.assertEqual(target_env_keys, [set(migrate_storage.DIRECT_TARGET_ENV_KEYS)])
        self.assertEqual(transfer.call_args.args[4], "tenant-id/aura-board-uploads/private/a.txt/v1")
        self.assertEqual(source_hash.call_count, 1)
        target_hash.assert_called_once_with(
            transfer.call_args.args[0],
            "storage-bucket",
            "tenant-id/aura-board-uploads/private/a.txt/v1",
        )

    def test_dry_run_reports_manifest_totals_without_reading_credentials(self) -> None:
        objects = [
            {"name": "private/first.txt", "mime": "text/plain", "size": 12},
            {"name": "private/second.txt", "mime": "text/plain", "size": 18},
        ]
        output = io.StringIO()
        with (
            patch.object(migrate_storage, "load_objects", return_value=objects),
            patch.object(
                migrate_storage,
                "load_env_values",
                side_effect=AssertionError("dry-run must not read credentials"),
            ),
            patch.object(sys, "argv", ["migrate-storage.py", "--dry-run"]),
            redirect_stdout(output),
        ):
            result = migrate_storage.main()

        rendered = output.getvalue()
        self.assertEqual(result, 0)
        self.assertIn("objects=2", rendered)
        self.assertIn("expected_bytes=30", rendered)
        self.assertIn("mutations=none", rendered)
        self.assertNotIn("private/first.txt", rendered)
        self.assertNotIn("private/second.txt", rendered)

    def test_resumed_run_is_explicitly_partial(self) -> None:
        objects = [
            {"name": "a.txt", "mime": "text/plain", "size": 1},
            {"name": "b.txt", "mime": "text/plain", "size": 2},
            {"name": "c.txt", "mime": "text/plain", "size": 3},
        ]

        def fake_env(_path: Path, keys: set[str]) -> dict[str, str]:
            if "SUPABASE_URL" in keys:
                return {
                    "SUPABASE_URL": "https://source.example",
                    "SUPABASE_SERVICE_ROLE_KEY": "source-service-role-key",
                }
            return {"SERVICE_ROLE_KEY": "target-service-role-key"}

        output = io.StringIO()
        with (
            patch.object(migrate_storage, "load_objects", return_value=objects),
            patch.object(migrate_storage, "load_env_values", side_effect=fake_env),
            patch.object(migrate_storage, "transfer_once", return_value=(True, "")),
            patch.object(migrate_storage, "hash_object", return_value="same-hash"),
            patch.object(migrate_storage.time, "sleep"),
            patch.object(
                sys,
                "argv",
                [
                    "migrate-storage.py",
                    "--start-index",
                    "2",
                    "--expected-manifest-sha256",
                    migrate_storage.manifest_sha256(objects).upper(),
                    "--progress-every",
                    "100",
                ],
            ),
            redirect_stdout(output),
        ):
            result = migrate_storage.main()

        rendered = output.getvalue()
        self.assertEqual(result, 2)
        self.assertIn("status=partial", rendered)
        self.assertIn("scope=resumed_suffix", rendered)
        self.assertNotIn("status=success", rendered)

    def test_retry_count_has_a_fixed_upper_bound(self) -> None:
        with (
            patch.object(migrate_storage, "load_objects", side_effect=AssertionError("manifest not needed")),
            patch.object(sys, "argv", ["migrate-storage.py", "--retries", str(migrate_storage.MAX_RETRIES + 1)]),
        ):
            with self.assertRaisesRegex(SystemExit, "at most"):
                migrate_storage.main()

    def test_transfer_error_does_not_echo_service_role_key_or_url(self) -> None:
        class FakeProcess:
            def __init__(self, returncode: int, stdout: io.BytesIO | None = None) -> None:
                self.returncode = returncode
                self.stdout = stdout

            def communicate(self):
                return b"", b"service-role-key/private/object-name"

            def kill(self) -> None:
                self.returncode = -9

            def wait(self) -> int:
                return self.returncode

            def poll(self) -> int:
                return self.returncode

        source = FakeProcess(7, io.BytesIO(b"payload"))
        target = FakeProcess(22)
        commands: list[list[str]] = []

        def fake_popen(command, **_kwargs):
            commands.append(command)
            return [source, target][len(commands) - 1]

        with patch.object(migrate_storage.subprocess, "Popen", side_effect=fake_popen):
            success, error = migrate_storage.transfer_once(
                "https://source.example/storage/private/object-name",
                "service-role-key",
                "http://127.0.0.1:18000/storage/private/object-name",
                "target-service-role-key",
                "text/plain",
            )

        self.assertFalse(success)
        self.assertIn("source_curl_exit=7", error)
        self.assertIn("target_curl_exit=22", error)
        self.assertNotIn("service-role-key", error)
        self.assertNotIn("object-name", error)
        rendered_commands = repr(commands)
        self.assertNotIn("service-role-key", rendered_commands)
        self.assertNotIn("target-service-role-key", rendered_commands)
        self.assertTrue(any(str(value).startswith("@") for command in commands for value in command))
        self.assertTrue(all("--location" not in command for command in commands))


class StorageUrlScannerTests(unittest.TestCase):
    def test_scanner_reports_counts_without_row_values(self) -> None:
        queries: list[str] = []

        def fake_query(sql: str) -> str:
            queries.append(sql)
            return "2"

        output = io.StringIO()
        with (
            patch.object(
                scan_storage_urls,
                "load_columns",
                return_value=[{"schema": "public", "table": "cards", "column": "body", "type": "text"}],
            ),
            patch.object(scan_storage_urls, "run_psql", side_effect=fake_query),
            patch.object(sys, "argv", ["scan-storage-urls.py"]),
            redirect_stdout(output),
        ):
            result = scan_storage_urls.main()

        rendered = output.getvalue()
        self.assertEqual(result, 0)
        self.assertIn("cards.body|2", rendered)
        self.assertIn("matched_columns=1 matched_rows=2", rendered)
        self.assertNotIn("persisted-row-value", rendered)
        self.assertIn("position(", queries[0])
        self.assertNotIn("LIKE", queries[0])

    def test_psql_queries_are_wrapped_in_read_only_transactions(self) -> None:
        completed = SimpleNamespace(returncode=0, stdout="7\n", stderr="")
        with patch.object(scan_storage_urls.subprocess, "run", return_value=completed) as run:
            result = scan_storage_urls.run_psql("SELECT count(*) FROM public.cards")

        command = run.call_args.args[0]
        sql = command[-1]
        self.assertEqual(result, "7")
        self.assertIn("-q", command)
        self.assertIn("BEGIN TRANSACTION READ ONLY", sql)
        self.assertIn("COMMIT", sql)

    def test_scanner_rejects_empty_needle_before_querying(self) -> None:
        with (
            patch.object(scan_storage_urls, "load_columns", side_effect=AssertionError("query must not run")),
            patch.object(sys, "argv", ["scan-storage-urls.py", "--needle", ""]),
        ):
            with self.assertRaisesRegex(SystemExit, "must not be empty"):
                scan_storage_urls.main()

    def test_psql_error_does_not_echo_stderr_contents(self) -> None:
        completed = SimpleNamespace(returncode=1, stdout="", stderr="persisted-row-value")
        with patch.object(scan_storage_urls.subprocess, "run", return_value=completed):
            with self.assertRaisesRegex(SystemExit, "exit_code=1") as raised:
                scan_storage_urls.run_psql("SELECT 1")

        self.assertNotIn("persisted-row-value", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
