from __future__ import annotations

import importlib.util
import io
import sys
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


class StorageMigrationTests(unittest.TestCase):
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
                    migrate_storage.manifest_sha256(objects),
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

        source = FakeProcess(7, io.BytesIO(b"payload"))
        target = FakeProcess(22)
        with patch.object(migrate_storage.subprocess, "Popen", side_effect=[source, target]):
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
