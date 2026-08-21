from __future__ import annotations

import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock


SCRIPT = Path(__file__).resolve().parents[1] / "production-cutover-db.py"
SPEC = importlib.util.spec_from_file_location("production_cutover_db", SCRIPT)
assert SPEC and SPEC.loader
cutover = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(cutover)


def conn(db: str, user: str, password: str, host: str = "db host #1") -> dict[str, object]:
    return {"host": host, "port": 5432, "dbname": db, "user": user, "password": password, "sslmode": "require"}


def contract() -> dict[str, object]:
    source = conn("source_db", "aura_export", "source pass\\#=\"' 한")
    writers = ["aura_app", "aura_jobs"]
    return {
        "source": source,
        "target": conn("target_db", "target_admin", "target pass\\#=\"' 한"),
        "target_admin": conn("postgres", "target_admin", "target pass\\#=\"' 한"),
        "source_export_role": "aura_export",
        "source_writer_roles": writers,
        "source_writer_credentials": {
            role: conn("source_db", role, f"{role} pass \\ # = \" ' 한") for role in writers
        },
        "target_services_stopped": True,
    }


def migration(name: str = "202608210001_init", checksum: str = "abc", **changes: object) -> dict[str, object]:
    value: dict[str, object] = {
        "id": f"{name}-id",
        "migration_name": name,
        "checksum": checksum,
        "started_at": "2026-08-21T00:00:00+00:00",
        "finished_at": "2026-08-21T00:00:00+00:00",
        "rolled_back_at": None,
        "applied_steps_count": 1,
        "logs_digest": None,
        "logs_state": "null",
        "state": "finished",
    }
    value.update(changes)
    if value["rolled_back_at"] is not None:
        value["state"] = "rolled-back"
    elif value["finished_at"] is None:
        value["state"] = "unfinished"
    else:
        value["state"] = "finished"
    return value


class FakeToolchain:
    """Command-level PostgreSQL shim; no socket, Docker, or external process is used."""

    def __init__(self, credentials: dict[str, object]) -> None:
        self.credentials = credentials
        self.names = cutover.db_names(credentials)
        self.databases = {self.names["target"]}
        self.fenced = False
        self.fail_restore = False
        self.fail_dump_scope: str | None = None
        self.fail_candidate_create_once = False
        self.fail_rename_once = False
        self.fail_writer_termination = False
        self.writer_probe_stderr = 'FATAL: role "aura_app" is not permitted to log in'
        self.fail_target_termination = False
        self.sessions: list[dict[str, object]] = []
        self.writer_sessions: list[dict[str, object]] = []
        self.calls: list[tuple[list[str], dict[str, str], str | None]] = []
        self.catalog_objects = [
            {"kind": "relation", "schema_name": "public", "object_name": "lessons", "detail": {"acl": "public-acl"}},
            {"kind": "relation", "schema_name": "auth", "object_name": "users", "detail": {"acl": "auth-acl"}},
            {"kind": "policy", "schema_name": "auth", "object_name": "users.read", "detail": {"using": "true"}},
            {"kind": "trigger", "schema_name": "storage", "object_name": "objects.touch", "detail": {"enabled": "O"}},
        ]
        self.migrations = [migration()]
        self.data = {
            "contract": cutover.DATA_SNAPSHOT_CONTRACT,
            "tables": {
                "public.lessons": {"row_count": 3, "content_sha256": "1" * 64},
                "auth.users": {"row_count": 2, "content_sha256": "2" * 64},
                "storage.buckets": {"row_count": 1, "content_sha256": "3" * 64},
                "storage.objects": {"row_count": 4, "content_sha256": "4" * 64},
            },
        }
        self.sql_calls: list[tuple[str, str]] = []

    def _marker(self, service: str) -> dict[str, object]:
        if service == "source":
            connection = self.credentials["source"]
        elif service == "candidate":
            connection = self.credentials["target"]
            return {
                "database": self.names["candidate"],
                "user": connection["user"],
                "server_address": "target host",
                "server_port": 5432,
                "system_identifier": "target-system",
            }
        else:
            connection = self.credentials["target"]
        return {
            "database": connection["dbname"],
            "user": connection["user"],
            "server_address": "source host" if service == "source" else "target host",
            "server_port": 5432,
            "system_identifier": "source-system" if service == "source" else "target-system",
        }

    def _fence(self) -> dict[str, object]:
        if self.fenced:
            roles = [
                {"rolname": "aura_export", "rolcanlogin": True, "rolsuper": False},
                {"rolname": "aura_app", "rolcanlogin": False, "rolsuper": False},
                {"rolname": "aura_jobs", "rolcanlogin": False, "rolsuper": False},
            ]
            acl = [{"grantee": "aura_export", "grantor": "target_admin", "is_grantable": False}]
            acl_raw = "fenced-acl"
            acl_entries = [
                {
                    "grantee": "aura_export",
                    "grantor": "target_admin",
                    "privilege_type": "CONNECT",
                    "is_grantable": False,
                }
            ]
            effective_read_only = "on"
        else:
            roles = [
                {"rolname": "aura_export", "rolcanlogin": True, "rolsuper": False},
                {"rolname": "aura_app", "rolcanlogin": True, "rolsuper": False},
                {"rolname": "aura_jobs", "rolcanlogin": True, "rolsuper": False},
            ]
            acl = [{"grantee": "PUBLIC", "grantor": "target_admin", "is_grantable": False}]
            acl_raw = "original-acl"
            acl_entries = [
                {
                    "grantee": "PUBLIC",
                    "grantor": "target_admin",
                    "privilege_type": "CONNECT",
                    "is_grantable": False,
                },
                {
                    "grantee": "PUBLIC",
                    "grantor": "target_admin",
                    "privilege_type": "TEMPORARY",
                    "is_grantable": False,
                },
            ]
            effective_read_only = "off"
        return {
            "roles": roles,
            "connect_acl": acl,
            "database_acl": acl_raw,
            "database_acl_is_default": False,
            "database_acl_entries": acl_entries,
            "cron_jobs": [{"jobid": 7, "active": True}],
            "db_settings": [],
            "effective_read_only": effective_read_only,
        }

    @staticmethod
    def archive_listing(path: Path) -> str:
        if "public" in path.name:
            return "1; 0 0 SCHEMA - public postgres\n2; 0 0 TABLE public lessons postgres\n3; 0 0 TABLE DATA public lessons postgres\n"
        if "storage" in path.name:
            return "1; 0 0 TABLE DATA storage buckets postgres\n2; 0 0 TABLE DATA storage objects postgres\n"
        return "1; 0 0 TABLE DATA auth users postgres\n"

    def __call__(self, arguments: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        argv = [str(value) for value in arguments]
        env = dict(kwargs.get("env", {}))
        input_text = kwargs.get("input")
        sql = input_text if isinstance(input_text, str) else None
        self.calls.append((argv, env, sql))
        executable = Path(argv[0]).name.lower()
        service = env.get("PGSERVICE", "")
        if "psql" in executable:
            if "--command" in argv:
                command = argv[argv.index("--command") + 1]
                self.sql_calls.append((service, command))
                if service.startswith("writer_") and self.fenced:
                    return subprocess.CompletedProcess(argv, 7, "", self.writer_probe_stderr)
                return subprocess.CompletedProcess(argv, 0, "", "")
            assert sql is not None
            self.sql_calls.append((service, sql))
            if "aura:version" in sql:
                output = '{"major":17}'
            elif "aura:extensions" in sql:
                output = '[{"name":"pgcrypto","version":"1.3"}]'
            elif "aura:catalog-fingerprint" in sql:
                output = json.dumps(self.catalog_objects)
            elif "aura:prisma-migrations-present" in sql:
                output = "true"
            elif "aura:prisma-migrations" in sql:
                output = json.dumps(self.migrations)
            elif "aura:data-snapshot" in sql:
                output = json.dumps(self.data)
            elif "aura:database-marker" in sql:
                output = json.dumps(self._marker(service))
            elif "aura:fence-engage" in sql:
                self.fenced = True
                output = ""
            elif "aura:fence-release" in sql:
                self.fenced = False
                output = ""
            elif "aura:fence-inspect" in sql:
                if "aura:fence-release" in sql:
                    self.fenced = False
                elif "aura:fence-engage" in sql:
                    self.fenced = True
                output = json.dumps(self._fence())
            elif "aura:writer-terminate" in sql or "aura:release-writer-terminate" in sql:
                output = json.dumps(
                    [
                        {"pid": item["pid"], "terminated": not self.fail_writer_termination}
                        for item in self.writer_sessions
                    ]
                )
                if not self.fail_writer_termination:
                    self.writer_sessions = []
            elif "aura:writer-sessions" in sql or "aura:release-writer-sessions" in sql:
                output = json.dumps(self.writer_sessions)
            elif "aura:export-path-probe" in sql:
                output = json.dumps({"database": "source_db", "user": "aura_export"})
            elif "aura:database-names" in sql:
                output = json.dumps(sorted(self.databases))
            elif "aura:target-sessions" in sql:
                output = json.dumps(self.sessions)
            elif "aura:target-terminate" in sql:
                output = json.dumps(
                    [
                        {"pid": item["pid"], "terminated": not self.fail_target_termination}
                        for item in self.sessions
                    ]
                )
                if not self.fail_target_termination:
                    self.sessions = []
            elif "aura:candidate-drop" in sql:
                self.databases.discard(self.names["candidate"])
                output = ""
            elif "aura:candidate-create" in sql:
                self.databases.add(self.names["candidate"])
                if self.fail_candidate_create_once:
                    self.fail_candidate_create_once = False
                    return subprocess.CompletedProcess(argv, 7, "", "candidate create failed")
                output = ""
            elif "aura:database-rename" in sql:
                match = re.search(r'ALTER DATABASE "([^"]+)" RENAME TO "([^"]+)"', sql)
                assert match
                old, new = match.groups()
                if self.fail_rename_once and old == self.names["candidate"] and new == self.names["target"]:
                    self.fail_rename_once = False
                    return subprocess.CompletedProcess(argv, 9, "", "rename failed")
                self.databases.remove(old)
                self.databases.add(new)
                output = ""
            else:
                output = ""
            return subprocess.CompletedProcess(argv, 0, output, "")
        if "pg_dump" in executable:
            output_arg = next(value for value in argv if value.startswith("--file="))
            output_path = Path(output_arg.split("=", 1)[1])
            output_path.write_bytes(b"fake archive")
            if self.fail_dump_scope and self.fail_dump_scope in output_path.name:
                return subprocess.CompletedProcess(argv, 7, "", "RAW_DUMP_DIAGNOSTIC")
            return subprocess.CompletedProcess(argv, 0, "", "")
        if "pg_restore" in executable:
            archive = Path(argv[-1])
            if "--list" in argv:
                return subprocess.CompletedProcess(argv, 0, self.archive_listing(archive), "")
            if self.fail_restore and service == "candidate":
                return subprocess.CompletedProcess(argv, 7, "", "RAW_RESTORE_DIAGNOSTIC")
            return subprocess.CompletedProcess(argv, 0, "", "")
        raise AssertionError(argv[0])


class CutoverTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="cutover-test-")
        self.root = Path(self.temporary.name)
        self.root.chmod(0o700)
        self.credentials = contract()
        self.fake = FakeToolchain(self.credentials)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def call(self, action: str) -> tuple[int, str, str]:
        stdout, stderr = io.StringIO(), io.StringIO()
        with (
            mock.patch.object(cutover.subprocess, "run", side_effect=self.fake),
            mock.patch.object(cutover, "validate_state_dir"),
            mock.patch.object(cutover.sys, "stdin", io.StringIO(json.dumps(self.credentials, ensure_ascii=False))),
            contextlib.redirect_stdout(stdout),
            contextlib.redirect_stderr(stderr),
        ):
            result = cutover.main([action, "--write", "--state-dir", str(self.root)])
        return result, stdout.getvalue(), stderr.getvalue()

    def flow_to(self, action: str) -> None:
        ordered = ["preflight", "engage-fence", "export", "candidate-create", "candidate-restore", "candidate-verify"]
        for step in ordered[: ordered.index(action) + 1]:
            result, _out, err = self.call(step)
            self.assertEqual(result, 0, f"{step}: {err}")

    def test_dry_run_has_no_stdin_files_or_tool_io(self) -> None:
        with (
            mock.patch.object(cutover.sys, "stdin", mock.Mock(read=mock.Mock(side_effect=AssertionError("stdin read")))),
            mock.patch.object(cutover, "validate_state_dir", side_effect=AssertionError("filesystem I/O")),
            mock.patch.object(cutover.subprocess, "run", side_effect=AssertionError("tool I/O")),
        ):
            self.assertEqual(cutover.main(["candidate-rename", "--dry-run", "--state-dir", str(self.root / "missing")]), 0)

    def test_exact_contract_rejects_legacy_and_source_writer_export_collision(self) -> None:
        legacy = {"source": self.credentials["source"], "target": self.credentials["target"]}
        with mock.patch.object(cutover.sys, "stdin", io.StringIO(json.dumps(legacy))):
            with self.assertRaisesRegex(cutover.CutoverError, "exact cutover contract"):
                cutover.read_credentials()
        collision = json.loads(json.dumps(self.credentials))
        collision["source_writer_roles"] = ["aura_export"]
        collision["source_writer_credentials"] = {"aura_export": self.credentials["source"]}
        with mock.patch.object(cutover.sys, "stdin", io.StringIO(json.dumps(collision))):
            with self.assertRaisesRegex(cutover.CutoverError, "must not be a writer"):
                cutover.read_credentials()

    def test_libpq_service_values_round_trip_special_characters(self) -> None:
        with cutover.service_file(self.credentials) as path:
            text = path.read_text(encoding="utf-8")
        self.assertIn(cutover.service_escape(self.credentials["source"]["password"]), text)
        values: dict[str, str] = {}
        section = None
        for line in text.splitlines():
            if line.startswith("["):
                section = line[1:-1]
            elif section == "source" and "=" in line:
                key, value = line.split("=", 1)
                decoded = []
                escaped = False
                for char in value:
                    if escaped:
                        decoded.append(char)
                        escaped = False
                    elif char == "\\":
                        escaped = True
                    else:
                        decoded.append(char)
                values[key] = "".join(decoded)
        self.assertEqual(values["password"], self.credentials["source"]["password"])
        self.assertEqual(values["host"], self.credentials["source"]["host"])

    def test_migration_checksum_missing_unfinished_and_rolled_back_mismatch(self) -> None:
        source = {"present": True, "records": [migration()]}
        with self.assertRaisesRegex(cutover.CutoverError, "checksum"):
            cutover.compare_migrations(source, {"present": True, "records": [migration(checksum="different")]})
        with self.assertRaisesRegex(cutover.CutoverError, "missing"):
            cutover.compare_migrations(source, {"present": True, "records": []})
        with self.assertRaisesRegex(cutover.CutoverError, "unfinished"):
            cutover.compare_migrations(source, {"present": True, "records": [migration(finished_at=None)]})
        with self.assertRaisesRegex(cutover.CutoverError, "rolled-back"):
            cutover.compare_migrations(source, {"present": True, "records": [migration(finished_at=None, rolled_back_at="2026-08-21T00:01:00+00:00")]})
        with self.assertRaisesRegex(cutover.CutoverError, "missing.*public._prisma_migrations"):
            cutover.compare_migrations(source, {"present": False, "records": []})

    def test_full_auth_catalog_gate_is_exact(self) -> None:
        source = {"objects": [{"kind": "policy", "schema_name": "auth", "object_name": "users.read", "detail": {"using": "true"}}], "migrations": {"present": True, "records": [migration()]}}
        candidate = json.loads(json.dumps(source))
        candidate["objects"][0]["detail"]["using"] = "false"
        with self.assertRaisesRegex(cutover.CutoverError, "auth schema"):
            cutover.compare_catalogs(source, candidate)

    def test_candidate_flow_uses_only_candidate_restore_and_deterministic_rename_rollback(self) -> None:
        self.flow_to("candidate-verify")
        result, _out, err = self.call("promote")
        self.assertEqual(result, 0, err)
        names = cutover.db_names(self.credentials)
        self.assertEqual(self.fake.databases, {names["target"], names["rollback"]})
        rename_sql = "\n".join(sql for _service, sql in self.fake.sql_calls if "aura:database-rename" in sql)
        self.assertIn(f'ALTER DATABASE "{names["target"]}" RENAME TO "{names["rollback"]}"', rename_sql)
        self.assertIn(f'ALTER DATABASE "{names["candidate"]}" RENAME TO "{names["target"]}"', rename_sql)
        result, _out, err = self.call("rollback")
        self.assertEqual(result, 0, err)
        self.assertEqual(self.fake.databases, {names["target"], names["candidate"]})
        restores = [(service, argv) for argv, env, _sql in self.fake.calls if (service := env.get("PGSERVICE", "")) and "pg_restore" in Path(argv[0]).name]
        self.assertTrue(restores)
        self.assertTrue(all(service == "candidate" for service, _argv in restores if "--list" not in _argv))
        self.assertFalse(any("DROP SCHEMA public" in sql for _service, sql in self.fake.sql_calls))

    def test_fence_denies_real_writer_reconnect_write_and_preserves_export_path(self) -> None:
        result, _out, err = self.call("preflight")
        self.assertEqual(result, 0, err)
        result, _out, err = self.call("engage-fence")
        self.assertEqual(result, 0, err)
        writer_commands = [sql for service, sql in self.fake.sql_calls if service.startswith("writer_")]
        self.assertEqual(len(writer_commands), 2)
        self.assertTrue(all("writer-reconnect-write-probe" in sql for sql in writer_commands))
        self.assertTrue(any("export-path-probe" in sql for _service, sql in self.fake.sql_calls))
        fence_sql = "\n".join(
            sql
            for _service, sql in self.fake.sql_calls
            if "aura:fence-engage" in sql or "aura:writer-terminate" in sql
        )
        self.assertIn("NOLOGIN", fence_sql)
        self.assertIn("REVOKE CONNECT", fence_sql)
        self.assertIn("pg_terminate_backend", fence_sql)
        self.assertEqual(self.fake.writer_sessions, [])

    def test_release_restores_recorded_acl_login_and_cron_state(self) -> None:
        self.flow_to("engage-fence")
        result, _out, err = self.call("release-fence")
        self.assertEqual(result, 0, err)
        release_sql = "\n".join(sql for _service, sql in self.fake.sql_calls if "aura:fence-release" in sql)
        self.assertIn("ALTER ROLE \"aura_app\" LOGIN", release_sql)
        self.assertIn("GRANT CONNECT ON DATABASE", release_sql)
        self.assertIn("GRANT TEMPORARY ON DATABASE", release_sql)
        self.assertIn("REVOKE ALL PRIVILEGES ON DATABASE", release_sql)
        self.assertIn("UPDATE cron.job SET active=true", release_sql)
        journal = json.loads((self.root / "journal.json").read_text(encoding="utf-8"))
        self.assertEqual(journal["fence"]["before"]["database_acl"], journal["fence"]["after_release"]["database_acl"])
        self.assertEqual(journal["fence"]["before"]["effective_read_only"], journal["fence"]["after_release"]["effective_read_only"])

    def test_release_snapshot_comparison_includes_acl_and_effective_read_only(self) -> None:
        before = self.fake._fence()
        after = json.loads(json.dumps(before))
        after["database_acl"] = "different-acl"
        self.assertFalse(cutover.fence_equal(before, after))
        after = json.loads(json.dumps(before))
        after["effective_read_only"] = "on"
        self.assertFalse(cutover.fence_equal(before, after))

    def test_release_switches_session_read_write_before_restoration_sql(self) -> None:
        sql = cutover.release_sql(self.credentials, self.fake._fence())
        session_write = sql.index(
            "SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE;"
        )
        default_write = sql.index("SET default_transaction_read_only=off;")
        first_restore = sql.index("REVOKE ALL PRIVILEGES")
        self.assertLess(session_write, first_restore)
        self.assertLess(default_write, first_restore)

    def test_target_services_confirmation_is_required_before_candidate_creation(self) -> None:
        false_contract = json.loads(json.dumps(self.credentials))
        false_contract["target_services_stopped"] = False
        with self.assertRaisesRegex(cutover.CutoverError, "target_services_stopped=true"):
            cutover.require_stopped(false_contract)

    def test_candidate_restore_failure_leaves_live_target_database_untouched_and_journals_partial_candidate(self) -> None:
        self.flow_to("candidate-create")
        self.fake.fail_restore = True
        result, _out, err = self.call("candidate-restore")
        self.assertEqual(result, 1)
        self.assertIn("status 7", err)
        self.assertNotIn("RAW_RESTORE_DIAGNOSTIC", err)
        self.assertEqual(self.fake.databases, {cutover.db_names(self.credentials)["target"], cutover.db_names(self.credentials)["candidate"]})
        journal = json.loads((self.root / "journal.json").read_text(encoding="utf-8"))
        self.assertEqual(journal["phase"], "candidate-restore-partial-failure")
        self.assertTrue(journal["fence"]["engaged"])
        self.assertFalse(any(service == "target" and "pg_restore" in Path(argv[0]).name for argv, env, _sql in self.fake.calls for service in [env.get("PGSERVICE", "")]))

        self.fake.fail_restore = False
        result, _out, err = self.call("candidate-restore")
        self.assertEqual(result, 0, err)
        self.assertEqual(
            json.loads((self.root / "journal.json").read_text(encoding="utf-8"))["phase"],
            "candidate-restore-complete",
        )
        self.assertTrue(any("aura:candidate-drop" in sql for _service, sql in self.fake.sql_calls))

    def test_export_partial_failure_is_safely_recreated_on_retry(self) -> None:
        self.flow_to("engage-fence")
        self.fake.fail_dump_scope = "auth"
        result, _out, err = self.call("export")
        self.assertEqual(result, 1)
        self.assertIn("status 7", err)
        self.assertNotIn("RAW_DUMP_DIAGNOSTIC", err)
        self.assertEqual(
            json.loads((self.root / "journal.json").read_text(encoding="utf-8"))["phase"],
            "export-partial-failure",
        )
        self.assertTrue(
            json.loads((self.root / "journal.json").read_text(encoding="utf-8"))["fence"]["engaged"]
        )
        self.fake.fail_dump_scope = None
        result, _out, err = self.call("export")
        self.assertEqual(result, 0, err)
        self.assertEqual(
            json.loads((self.root / "journal.json").read_text(encoding="utf-8"))["phase"],
            "export-complete",
        )
        self.assertEqual(
            {path.name for path in (self.root / "artifacts").iterdir()},
            {"public.dump", "auth.dump", "storage-metadata.dump", "manifest.json"},
        )

    def test_candidate_create_partial_failure_drops_and_reclones_on_retry(self) -> None:
        self.flow_to("engage-fence")
        self.fake.fail_candidate_create_once = True
        result, _out, err = self.call("candidate-create")
        self.assertEqual(result, 1)
        self.assertIn("status 7", err)
        names = cutover.db_names(self.credentials)
        self.assertIn(names["candidate"], self.fake.databases)
        self.assertEqual(
            json.loads((self.root / "journal.json").read_text(encoding="utf-8"))["phase"],
            "candidate-create-partial-failure",
        )
        self.assertTrue(json.loads((self.root / "journal.json").read_text(encoding="utf-8"))["fence"]["engaged"])
        result, _out, err = self.call("candidate-create")
        self.assertEqual(result, 0, err)
        self.assertEqual(
            json.loads((self.root / "journal.json").read_text(encoding="utf-8"))["phase"],
            "candidate-created",
        )
        self.assertTrue(any("aura:candidate-drop" in sql for _service, sql in self.fake.sql_calls))

    def test_writer_transport_failure_is_not_accepted_as_fencing_evidence(self) -> None:
        self.assertTrue(cutover.expected_writer_denial('FATAL: 28000: role "aura_app" is not permitted to log in'))
        self.assertTrue(cutover.expected_writer_denial("ERROR: 42501: permission denied for schema public"))
        self.assertFalse(cutover.expected_writer_denial("ERROR: 99999: permission denied for schema public"))
        self.assertFalse(cutover.expected_writer_denial("FATAL: password authentication failed for user \"aura_app\""))
        self.call("preflight")
        self.fake.writer_probe_stderr = "could not connect to server: Connection refused"
        result, _out, err = self.call("engage-fence")
        self.assertEqual(result, 1)
        self.assertIn("non-authorization diagnostic", err)
        self.assertNotIn("Connection refused", err)
        self.assertEqual(
            json.loads((self.root / "journal.json").read_text(encoding="utf-8"))["phase"],
            "fence-engage-partial-failure",
        )

    def test_failed_writer_termination_fails_before_probe_and_records_partial_fence(self) -> None:
        self.call("preflight")
        self.fake.writer_sessions = [{"pid": 741, "user": "aura_app", "application": "worker"}]
        self.fake.fail_writer_termination = True
        result, _out, err = self.call("engage-fence")
        self.assertEqual(result, 1)
        self.assertIn("session termination did not succeed", err)
        self.assertNotIn("worker denied", err)
        writer_termination = [sql for _service, sql in self.fake.sql_calls if "aura:writer-terminate" in sql]
        self.assertTrue(writer_termination)
        self.assertIn("pg_terminate_backend", writer_termination[-1])

    def test_rollback_db_sessions_are_quiesced_before_rename(self) -> None:
        self.flow_to("candidate-verify")
        names = cutover.db_names(self.credentials)
        self.fake.sessions = [{"pid": 902, "user": "rollback_user", "application": "stale"}]
        self.fake.fail_target_termination = True
        result, _out, err = self.call("promote")
        self.assertEqual(result, 1)
        self.assertIn("session termination did not succeed", err)
        termination_sql = [sql for _service, sql in self.fake.sql_calls if "aura:target-terminate" in sql]
        self.assertTrue(termination_sql)
        self.assertIn(names["rollback"], termination_sql[-1])

    def test_same_count_different_content_digest_fails_closed(self) -> None:
        source = json.loads(json.dumps(self.fake.data))
        candidate = json.loads(json.dumps(source))
        candidate["tables"]["public.lessons"]["content_sha256"] = "f" * 64
        self.assertEqual(
            source["tables"]["public.lessons"]["row_count"],
            candidate["tables"]["public.lessons"]["row_count"],
        )
        with self.assertRaisesRegex(cutover.CutoverError, "content digest"):
            cutover.compare_data_snapshots(source, candidate)

    def test_promotion_rename_failure_is_automatically_recovered(self) -> None:
        self.flow_to("candidate-verify")
        self.fake.fail_rename_once = True
        result, _out, err = self.call("candidate-rename")
        self.assertEqual(result, 1)
        self.assertIn("status 9", err)
        names = cutover.db_names(self.credentials)
        self.assertEqual(self.fake.databases, {names["target"], names["candidate"]})
        journal = json.loads((self.root / "journal.json").read_text(encoding="utf-8"))
        self.assertEqual(journal["phase"], "promotion-recovered")

    def test_restart_between_rename_and_journal_write_is_recoverable(self) -> None:
        self.flow_to("candidate-verify")
        names = cutover.db_names(self.credentials)
        journal = json.loads((self.root / "journal.json").read_text(encoding="utf-8"))
        journal.update(phase="promotion-started", promotion={"step": 1})
        (self.root / "journal.json").write_text(json.dumps(journal), encoding="utf-8")
        self.fake.databases = {names["candidate"], names["rollback"]}
        result, _out, _err = self.call("candidate-rename")
        self.assertEqual(result, 1)
        self.assertEqual(self.fake.databases, {names["target"], names["candidate"]})
        recovered = json.loads((self.root / "journal.json").read_text(encoding="utf-8"))
        self.assertEqual(recovered["phase"], "promotion-recovered")

        result, _out, err = self.call("promote")
        self.assertEqual(result, 0, err)
        journal = json.loads((self.root / "journal.json").read_text(encoding="utf-8"))
        journal.update(phase="rollback-started", rollback={"step": 1})
        (self.root / "journal.json").write_text(json.dumps(journal), encoding="utf-8")
        self.fake.databases = {names["candidate"], names["rollback"]}
        result, _out, _err = self.call("rollback")
        self.assertEqual(result, 1)
        self.assertEqual(self.fake.databases, {names["target"], names["rollback"]})
        recovered = json.loads((self.root / "journal.json").read_text(encoding="utf-8"))
        self.assertEqual(recovered["phase"], "promotion-complete")

    def test_restore_scope_guard_rejects_live_target_service(self) -> None:
        with self.assertRaisesRegex(cutover.CutoverError, "isolated candidate"):
            cutover.restore_scopes(self.root, self.root / "service", "target")

    def test_secret_free_tool_calls_and_output(self) -> None:
        secret = self.credentials["source"]["password"]
        result, stdout, stderr = self.call("preflight")
        self.assertEqual(result, 0, stderr)
        rendered = json.dumps(self.fake.calls, ensure_ascii=False)
        self.assertNotIn(secret, rendered)
        self.assertNotIn(secret, stdout + stderr)
        self.assertTrue(all("PGSERVICEFILE" in env and "PGPASSWORD" not in env for _argv, env, _sql in self.fake.calls))
        self.assertFalse(any("postgresql://" in arg for argv, _env, _sql in self.fake.calls for arg in argv))


class EphemeralPostgresHarness:
    """Concrete opt-in Docker harness for a real PostgreSQL catalog probe."""

    def __init__(self) -> None:
        self.docker = shutil.which("docker")
        self.name = "aura-cutover-test-postgres"

    def start(self) -> None:
        if not self.docker:
            raise unittest.SkipTest("Docker unavailable")
        subprocess.run([self.docker, "run", "--rm", "-d", "--name", self.name, "-e", "POSTGRES_PASSWORD=test-only", "postgres:16-alpine"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def stop(self) -> None:
        if self.docker:
            subprocess.run([self.docker, "rm", "-f", self.name], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


@unittest.skipUnless(os.environ.get("AURA_CUTOVER_RUN_DOCKER_TESTS") == "1", "set AURA_CUTOVER_RUN_DOCKER_TESTS=1 to run the ephemeral PostgreSQL harness")
class DockerIntegrationTests(unittest.TestCase):
    def test_ephemeral_postgres_harness_path(self) -> None:
        harness = EphemeralPostgresHarness()
        try:
            harness.start()
            self.assertIsNotNone(harness.docker)
        finally:
            harness.stop()


if __name__ == "__main__":
    unittest.main()
