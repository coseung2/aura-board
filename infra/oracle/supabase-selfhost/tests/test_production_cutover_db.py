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
import stat
import subprocess
import tempfile
import time
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
        "source_fence_mode": "role_lockdown",
        "source_export_role": "aura_export",
        "source_writer_roles": writers,
        "source_writer_credentials": {
            role: conn("source_db", role, f"{role} pass \\ # = \" ' 한") for role in writers
        },
        "target_stopped_containers": list(cutover.PRODUCTION_STOPPED_CONTAINERS),
    }


def rotation_contract() -> dict[str, object]:
    value = contract()
    host = cutover.SUPABASE_MANAGED_POOLER_HOST
    value["source_fence_mode"] = "credential_rotation"
    value["source"] = conn(
        "source_db",
        "postgres.abcdefghijklmnopqrst",
        "temporary-cutover-password",
        host=host,
    )
    value["source_export_role"] = "postgres"
    value["source_writer_roles"] = ["postgres"]
    value["source_writer_credentials"] = {
        "postgres": conn(
            "source_db",
            "postgres.abcdefghijklmnopqrst",
            "old-writer-password",
            host=host,
        )
    }
    return value


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


def catalog_document(objects: list[dict[str, object]]) -> dict[str, object]:
    return {
        "objects": objects,
        "migrations": {"present": True, "records": [migration()]},
    }


EXPECTED_STORAGE_FORWARD_CATALOG_OBJECTS = frozenset(
    {
        ("column", "storage", "buckets.versioning_status"),
        ("constraint", "storage", "buckets.buckets_versioning_dark_check"),
        ("constraint", "storage", "buckets.buckets_versioning_standard_only_check"),
        ("constraint", "storage", "buckets.buckets_versioning_status_check"),
        ("column", "storage", "objects.archived_at"),
        ("column", "storage", "objects.is_delete_marker"),
        ("column", "storage", "objects.is_versioned"),
    }
)


class FakeToolchain:
    """Command-level PostgreSQL shim; no socket, Docker, or external process is used."""

    def __init__(self, credentials: dict[str, object]) -> None:
        self.credentials = credentials
        self.names = cutover.db_names(credentials)
        self.rotation = credentials["source_fence_mode"] == "credential_rotation"
        self.active_password = "old-writer-password"
        self.allow_temp_after_restore = False
        self.rotation_read_only = True
        self.rotation_cron_disabled = True
        self.databases = {self.names["target"]}
        self.restore_user_superuser = True
        self.target_admin_superuser = True
        self.external_public_fks: list[dict[str, str]] = []
        self.database_contracts: dict[str, dict[str, object]] = {
            self.names["target"]: {
                "database": self.names["target"],
                "owner": "target_admin",
                "acl": [
                    {
                        "grantee": "PUBLIC",
                        "grantor": "target_admin",
                        "privilege": "CONNECT",
                        "grantable": False,
                    },
                    {
                        "grantee": "target_admin",
                        "grantor": "target_admin",
                        "privilege": "CONNECT",
                        "grantable": False,
                    },
                    {
                        "grantee": "target_admin",
                        "grantor": "target_admin",
                        "privilege": "CREATE",
                        "grantable": False,
                    },
                    {
                        "grantee": "target_admin",
                        "grantor": "target_admin",
                        "privilege": "TEMPORARY",
                        "grantable": False,
                    },
                ],
            }
        }
        self.target_schema_objects = {"public.target_only_schema_object"}
        self.candidate_schema_objects: set[str] = set()
        self.fenced = False
        self.fail_restore = False
        self.fail_dump_scope: str | None = None
        self.fail_candidate_create_once = False
        self.fail_rename_once = False
        self.fail_writer_termination = False
        self.writer_probe_stderr = 'FATAL: role "aura_app" is not permitted to log in'
        self.fail_target_termination = False
        self.running_containers: set[str] = set()
        self.restart_after_quiesce = False
        self.database_acl_is_default = False
        self.sessions: list[dict[str, object]] = []
        self.writer_sessions: list[dict[str, object]] = []
        self.calls: list[tuple[list[str], dict[str, str], str | None]] = []
        self.catalog_objects = [
            {
                "kind": "relation",
                "schema_name": "public",
                "object_name": "lessons",
                "detail": {
                    "acl": [
                        {
                            "grantee": "PUBLIC",
                            "privilege": "SELECT",
                            "grantable": False,
                        }
                    ]
                },
            },
            {
                "kind": "relation",
                "schema_name": "auth",
                "object_name": "users",
                "detail": {
                    "acl": [
                        {
                            "grantee": "PUBLIC",
                            "privilege": "SELECT",
                            "grantable": False,
                        }
                    ]
                },
            },
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
        if service in {"source", "writer_0"}:
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
            "user": (
                self.credentials["source_export_role"]
                if service in {"source", "writer_0"}
                else connection["user"]
            ),
            "server_address": "source host" if service in {"source", "writer_0"} else "target host",
            "server_port": 5432,
            "system_identifier": "source-system" if service in {"source", "writer_0"} else "target-system",
        }

    def _database_contract(self, service: str) -> dict[str, object]:
        database = (
            self.names["candidate"]
            if service == "candidate"
            else self.names["target"]
        )
        return json.loads(json.dumps(self.database_contracts[database]))

    def _fence(self) -> dict[str, object]:
        if self.rotation:
            return {
                "roles": [
                    {"rolname": "postgres", "rolcanlogin": True, "rolsuper": False}
                ],
                "connect_acl": [
                    {"grantee": "PUBLIC", "grantor": "postgres", "is_grantable": False}
                ],
                "database_acl": "original-acl",
                "database_acl_is_default": self.database_acl_is_default,
                "database_acl_entries": [
                    {
                        "grantee": "PUBLIC",
                        "grantor": "postgres",
                        "privilege_type": "CONNECT",
                        "is_grantable": False,
                    },
                    {
                        "grantee": "PUBLIC",
                        "grantor": "postgres",
                        "privilege_type": "TEMPORARY",
                        "is_grantable": False,
                    },
                ],
                "cron_jobs": [{"jobid": 7, "active": not (self.fenced and self.rotation_cron_disabled)}],
                "db_settings": (
                    ["default_transaction_read_only=on"]
                    if self.fenced and self.rotation_read_only
                    else []
                ),
                "effective_read_only": "on" if self.fenced and self.rotation_read_only else "off",
            }
        if self.fenced:
            roles = [
                {"rolname": "aura_app", "rolcanlogin": False, "rolsuper": False},
                {"rolname": "aura_export", "rolcanlogin": True, "rolsuper": False},
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
                {"rolname": "aura_app", "rolcanlogin": True, "rolsuper": False},
                {"rolname": "aura_export", "rolcanlogin": True, "rolsuper": False},
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
            "database_acl_is_default": self.database_acl_is_default,
            "database_acl_entries": acl_entries,
            "cron_jobs": [{"jobid": 7, "active": True}],
            "db_settings": [],
            "effective_read_only": effective_read_only,
        }

    def externally_rotate_and_fence(self) -> None:
        self.active_password = "temporary-cutover-password"
        self.fenced = True

    def externally_restore_old_password(self) -> None:
        self.active_password = "old-writer-password"

    @staticmethod
    def archive_listing(path: Path) -> str:
        if "public" in path.name:
            return (
                "1; 0 0 TABLE DATA public lessons postgres\n"
                "2; 0 0 TABLE DATA public boards postgres\n"
            )
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
            if self.rotation and service in {"source", "writer_0"}:
                connection = (
                    self.credentials["source"]
                    if service == "source"
                    else self.credentials["source_writer_credentials"]["postgres"]
                )
                password_is_active = connection["password"] == self.active_password
                if service == "source" and self.allow_temp_after_restore:
                    password_is_active = True
                if not password_is_active:
                    return subprocess.CompletedProcess(
                        argv,
                        7,
                        "",
                        'FATAL: password authentication failed for user "postgres"',
                    )
            if "--command" in argv:
                command = argv[argv.index("--command") + 1]
                self.sql_calls.append((service, command))
                if service.startswith("writer_") and self.fenced and not self.rotation:
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
            elif "aura:superuser-check" in sql:
                output = json.dumps(
                    {
                        "user": "target_admin",
                        "superuser": (
                            self.target_admin_superuser
                            if service == "target_admin"
                            else self.restore_user_superuser
                        ),
                    }
                )
            elif "aura:database-contract" in sql:
                output = json.dumps(self._database_contract(service))
            elif "aura:public-inbound-fks" in sql:
                output = json.dumps(self.external_public_fks)
            elif "aura:fence-engage" in sql:
                self.fenced = True
                output = ""
            elif "aura:fence-release" in sql:
                self.fenced = False
                output = ""
            elif "aura:credential-rotation-release" in sql:
                self.fenced = False
                output = ""
            elif "aura:fence-inspect" in sql:
                if "aura:fence-release" in sql:
                    self.fenced = False
                elif "aura:fence-engage" in sql:
                    self.fenced = True
                output = json.dumps(self._fence())
            elif (
                "aura:writer-terminate" in sql
                or "aura:release-writer-terminate" in sql
                or "aura:rotation-terminate" in sql
                or "aura:rotation-release-terminate" in sql
            ):
                output = json.dumps(
                    [
                        {"pid": item["pid"], "terminated": not self.fail_writer_termination}
                        for item in self.writer_sessions
                    ]
                )
                if not self.fail_writer_termination:
                    self.writer_sessions = []
            elif (
                "aura:writer-sessions" in sql
                or "aura:release-writer-sessions" in sql
                or "aura:rotation-sessions" in sql
                or "aura:rotation-release-sessions" in sql
            ):
                output = json.dumps(self.writer_sessions)
            elif "aura:export-path-probe" in sql:
                output = json.dumps(
                    {"database": "source_db", "user": self.credentials["source_export_role"]}
                )
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
                    if self.restart_after_quiesce:
                        self.running_containers.add("supabase-auth")
            elif "aura:candidate-drop" in sql:
                self.databases.discard(self.names["candidate"])
                self.database_contracts.pop(self.names["candidate"], None)
                self.candidate_schema_objects.clear()
                output = ""
            elif "aura:candidate-create" in sql:
                self.databases.add(self.names["candidate"])
                self.database_contracts[self.names["candidate"]] = {
                    "database": self.names["candidate"],
                    "owner": "target_admin",
                    "acl": [],
                }
                self.candidate_schema_objects = set(self.target_schema_objects)
                if self.fail_candidate_create_once:
                    self.fail_candidate_create_once = False
                    return subprocess.CompletedProcess(argv, 7, "", "candidate create failed")
                output = ""
            elif "aura:candidate-database-contract" in sql:
                expected = json.loads(
                    json.dumps(self.database_contracts[self.names["target"]])
                )
                expected["database"] = self.names["candidate"]
                self.database_contracts[self.names["candidate"]] = expected
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
                database_contract = self.database_contracts.pop(old)
                database_contract["database"] = new
                self.database_contracts[new] = database_contract
                output = ""
            else:
                output = ""
            return subprocess.CompletedProcess(argv, 0, output, "")
        if executable == "docker":
            names = argv[3:]
            output = "\n".join(
                f"/{name}\t{'running' if name in self.running_containers else 'exited'}\t{str(name in self.running_containers).lower()}"
                for name in names
            )
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

    def test_production_stopped_container_contract_matches_live_a1_writer_api_set(self) -> None:
        self.assertEqual(
            cutover.PRODUCTION_STOPPED_CONTAINERS,
            (
                "realtime-dev.supabase-realtime",
                "supabase-auth",
                "supabase-edge-functions",
                "supabase-envoy",
                "supabase-meta",
                "supabase-pooler",
                "supabase-rest",
                "supabase-storage",
                "supabase-studio",
            ),
        )

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

    def test_shared_pooler_login_aliases_are_separate_from_sql_roles(self) -> None:
        pooler = json.loads(json.dumps(self.credentials))
        project = "abcdefghijklmnopqrst"
        pooler["source"]["host"] = "aws-0-ap-northeast-1.pooler.supabase.com"
        pooler["source"]["user"] = f"aura_export.{project}"
        for role, connection in pooler["source_writer_credentials"].items():
            connection["host"] = pooler["source"]["host"]
            connection["user"] = f"{role}.{project}"
        with mock.patch.object(cutover.sys, "stdin", io.StringIO(json.dumps(pooler))):
            parsed = cutover.read_credentials()
        self.assertEqual(parsed["source_export_role"], "aura_export")
        with cutover.service_file(parsed) as path:
            service_text = path.read_text(encoding="utf-8")
        self.assertIn(f"user=aura_export.{project}", service_text)
        self.assertIn(f"user=aura_app.{project}", service_text)
        fence_sql = cutover.fence_engage_sql(parsed)
        self.assertIn('ALTER ROLE "aura_app" NOLOGIN', fence_sql)
        self.assertIn('ALTER ROLE "aura_jobs" NOLOGIN', fence_sql)
        self.assertNotIn(project, fence_sql)

    def test_role_lockdown_rejects_null_database_acl_before_fence(self) -> None:
        self.fake.database_acl_is_default = True
        result, _out, err = self.call("preflight")
        self.assertEqual(result, 1)
        self.assertIn("datacl is NULL", err)
        self.assertFalse(any("aura:fence-engage" in sql for _service, sql in self.fake.sql_calls))
        self.assertFalse((self.root / cutover.JOURNAL_FILENAME).exists())

    def test_pooler_aliases_reject_arbitrary_hosts_and_suffix_mismatches(self) -> None:
        arbitrary_host = json.loads(json.dumps(self.credentials))
        arbitrary_host["source"]["user"] = "aura_export.projectref"
        with mock.patch.object(
            cutover.sys, "stdin", io.StringIO(json.dumps(arbitrary_host))
        ):
            with self.assertRaisesRegex(cutover.CutoverError, "exact Supabase shared-pooler host"):
                cutover.read_credentials()

        mismatch = json.loads(json.dumps(self.credentials))
        mismatch["source"]["host"] = "aws-0-ap-northeast-1.pooler.supabase.com"
        mismatch["source"]["user"] = "aura_export.abcdefghijklmnopqrst"
        mismatch["source_writer_credentials"]["aura_app"]["host"] = mismatch["source"]["host"]
        mismatch["source_writer_credentials"]["aura_app"]["user"] = "aura_app.differentprojectref"
        mismatch["source_writer_credentials"]["aura_jobs"]["host"] = mismatch["source"]["host"]
        mismatch["source_writer_credentials"]["aura_jobs"]["user"] = "aura_jobs.abcdefghijklmnopqrst"
        with mock.patch.object(cutover.sys, "stdin", io.StringIO(json.dumps(mismatch))):
            with self.assertRaisesRegex(cutover.CutoverError, "same role.<project-ref>"):
                cutover.read_credentials()

        dotted_target = json.loads(json.dumps(self.credentials))
        dotted_target["target"]["user"] = "target_admin.projectref"
        with mock.patch.object(
            cutover.sys, "stdin", io.StringIO(json.dumps(dotted_target))
        ):
            with self.assertRaisesRegex(cutover.CutoverError, "exact cutover contract"):
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

    def test_pg_service_cleanup_failure_is_reported_without_secret_content(self) -> None:
        created: list[Path] = []

        def fail_cleanup(path: str | os.PathLike[str]) -> None:
            created.append(Path(path))
            raise OSError(13, "permission denied")

        with mock.patch.object(cutover._lib.shutil, "rmtree", side_effect=fail_cleanup):
            with self.assertRaisesRegex(cutover.CutoverError, "pg_service.conf cleanup failed") as raised:
                with cutover.service_file(self.credentials):
                    pass
        self.assertNotIn(self.credentials["source"]["password"], str(raised.exception))
        if created:
            shutil.rmtree(created[0])

    def test_operation_and_pg_service_cleanup_failure_reports_cleanup(self) -> None:
        created: list[Path] = []

        def fail_cleanup(path: str | os.PathLike[str]) -> None:
            created.append(Path(path))
            raise OSError(13, "permission denied")

        with mock.patch.object(cutover._lib.shutil, "rmtree", side_effect=fail_cleanup):
            with self.assertRaisesRegex(
                cutover.CutoverError,
                "cutover operation failed and pg_service.conf cleanup failed",
            ) as raised:
                with cutover.service_file(self.credentials):
                    raise cutover.CutoverError("simulated operation failure")
        self.assertNotIn(self.credentials["source"]["password"], str(raised.exception))
        self.assertIsInstance(raised.exception.__cause__, cutover.CutoverError)
        if created:
            shutil.rmtree(created[0])

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

    def test_exact_rolled_back_and_finished_duplicate_is_accepted(self) -> None:
        name = "202608210001_replayed_migration"
        source = {
            "present": True,
            "records": [
                migration(
                    name,
                    id=f"{name}-rollback",
                    started_at="2026-08-21T00:00:00+00:00",
                    finished_at=None,
                    rolled_back_at="2026-08-21T00:01:00+00:00",
                ),
                migration(
                    name,
                    id=f"{name}-finished",
                    started_at="2026-08-21T00:02:00+00:00",
                ),
            ],
        }

        cutover.compare_migrations(source, json.loads(json.dumps(source)))

    def test_orphan_rolled_back_migration_is_rejected(self) -> None:
        name = "202608210001_orphaned_rollback"
        source = {
            "present": True,
            "records": [
                migration(
                    name,
                    finished_at=None,
                    rolled_back_at="2026-08-21T00:01:00+00:00",
                )
            ],
        }

        with self.assertRaisesRegex(cutover.CutoverError, "no finished replacement"):
            cutover.compare_migrations(source, json.loads(json.dumps(source)))

    def test_rolled_back_replacement_mismatch_or_missing_is_rejected(self) -> None:
        name = "202608210001_replacement_gate"
        source = {
            "present": True,
            "records": [
                migration(
                    name,
                    id=f"{name}-rollback",
                    started_at="2026-08-21T00:00:00+00:00",
                    finished_at=None,
                    rolled_back_at="2026-08-21T00:01:00+00:00",
                ),
                migration(
                    name,
                    id=f"{name}-finished",
                    started_at="2026-08-21T00:02:00+00:00",
                ),
            ],
        }
        candidate = json.loads(json.dumps(source))
        candidate["records"][1]["checksum"] = "different"
        with self.assertRaisesRegex(cutover.CutoverError, "checksum"):
            cutover.compare_migrations(source, candidate)

        candidate = json.loads(json.dumps(source))
        candidate["records"].pop()
        with self.assertRaisesRegex(cutover.CutoverError, "no finished replacement"):
            cutover.compare_migrations(source, candidate)

    def test_duplicate_migration_names_compare_by_name_and_id(self) -> None:
        name = "202608210001_duplicate_name"
        source_records = [
            migration(name, id=f"{name}-1", started_at="2026-08-21T00:00:00+00:00"),
            migration(name, id=f"{name}-2", started_at="2026-08-21T00:01:00+00:00"),
        ]
        source = {"present": True, "records": source_records}
        candidate = json.loads(json.dumps(source))

        cutover.compare_migrations(source, candidate)

        candidate["records"][1]["checksum"] = "different"
        with self.assertRaisesRegex(cutover.CutoverError, "checksum"):
            cutover.compare_migrations(source, candidate)

        candidate["records"].pop()
        with self.assertRaisesRegex(cutover.CutoverError, "missing"):
            cutover.compare_migrations(source, candidate)

    def test_migration_record_duplicate_id_is_rejected(self) -> None:
        records = [
            migration("202608210001_first", id="duplicate-id"),
            migration("202608210002_second", id="duplicate-id"),
        ]
        with self.assertRaisesRegex(cutover.CutoverError, "duplicate ids"):
            cutover.compare_migrations(
                {"present": True, "records": records},
                {"present": True, "records": records},
            )

    def test_full_auth_catalog_gate_is_exact(self) -> None:
        source = {"objects": [{"kind": "policy", "schema_name": "auth", "object_name": "users.read", "detail": {"using": "true"}}], "migrations": {"present": True, "records": [migration()]}}
        candidate = json.loads(json.dumps(source))
        candidate["objects"][0]["detail"]["using"] = "false"
        with self.assertRaisesRegex(cutover.CutoverError, "auth schema"):
            cutover.compare_catalogs(source, candidate)

    def test_auth_scope_does_not_ignore_dr_replication_select(self) -> None:
        source = catalog_document(
            [
                {
                    "kind": "relation",
                    "schema_name": "auth",
                    "object_name": "users",
                    "detail": {
                        "acl": [
                            {
                                "grantee": "PUBLIC",
                                "privilege": "SELECT",
                                "grantable": False,
                            }
                        ]
                    },
                }
            ]
        )
        candidate = json.loads(json.dumps(source))
        candidate["objects"][0]["detail"]["acl"].append(
            {
                "grantee": "aura_board_dr_replication",
                "privilege": "SELECT",
                "grantable": False,
            }
        )
        with self.assertRaisesRegex(cutover.CutoverError, "auth schema"):
            cutover.compare_catalogs(source, candidate)

    def test_application_scope_detects_unknown_custom_schema_drift(self) -> None:
        source = catalog_document(
            [
                {
                    "kind": "schema",
                    "schema_name": "custom_extension",
                    "object_name": "custom_extension",
                    "detail": {"owner": "owner_a", "acl": []},
                }
            ]
        )
        candidate = json.loads(json.dumps(source))
        candidate["objects"][0]["detail"]["owner"] = "owner_b"
        with self.assertRaisesRegex(cutover.CutoverError, "application catalog"):
            cutover.compare_catalogs(source, candidate)

    def test_application_scope_ignores_only_named_internal_forward_fields_and_exact_dr_select(self) -> None:
        public_acl = [
            {
                "grantee": "PUBLIC",
                "privilege": "UPDATE",
                "grantable": False,
            },
            {
                "grantee": "PUBLIC",
                "privilege": "SELECT",
                "grantable": False,
            },
        ]
        source = catalog_document(
            [
                {
                    "kind": "relation",
                    "schema_name": "public",
                    "object_name": "lessons",
                    "detail": {"row_security": False, "acl": public_acl},
                },
                {
                    "kind": "column",
                    "schema_name": "public",
                    "object_name": "lessons.title",
                    "detail": {"type": "text", "default": None},
                },
                {
                    "kind": "relation",
                    "schema_name": "auth",
                    "object_name": "users",
                    "detail": {"acl": []},
                },
                {
                    "kind": "relation",
                    "schema_name": "storage",
                    "object_name": "buckets",
                    "detail": {"acl": []},
                },
                {
                    "kind": "relation",
                    "schema_name": "storage",
                    "object_name": "objects",
                    "detail": {"acl": []},
                },
                {
                    "kind": "column",
                    "schema_name": "storage",
                    "object_name": "buckets.versioning_status",
                    "detail": {"type": "text"},
                },
                {
                    "kind": "constraint",
                    "schema_name": "storage",
                    "object_name": "buckets.buckets_versioning_dark_check",
                    "detail": {"definition": "forward-only"},
                },
                {
                    "kind": "constraint",
                    "schema_name": "storage",
                    "object_name": "buckets.buckets_versioning_standard_only_check",
                    "detail": {"definition": "forward-only"},
                },
                {
                    "kind": "constraint",
                    "schema_name": "storage",
                    "object_name": "buckets.buckets_versioning_status_check",
                    "detail": {"definition": "forward-only"},
                },
                {
                    "kind": "column",
                    "schema_name": "storage",
                    "object_name": "objects.archived_at",
                    "detail": {"type": "timestamptz"},
                },
                {
                    "kind": "column",
                    "schema_name": "storage",
                    "object_name": "objects.is_delete_marker",
                    "detail": {"type": "boolean"},
                },
                {
                    "kind": "column",
                    "schema_name": "storage",
                    "object_name": "objects.is_versioned",
                    "detail": {"type": "boolean"},
                },
                {
                    "kind": "relation",
                    "schema_name": "realtime",
                    "object_name": "internal_state",
                    "detail": {"definition": "source"},
                },
                {
                    "kind": "relation",
                    "schema_name": "_realtime",
                    "object_name": "internal_state",
                    "detail": {"definition": "source"},
                },
                {
                    "kind": "relation",
                    "schema_name": "supabase_migrations",
                    "object_name": "internal_state",
                    "detail": {"definition": "source"},
                },
                {
                    "kind": "relation",
                    "schema_name": "private",
                    "object_name": "internal_state",
                    "detail": {"definition": "source"},
                },
                {
                    "kind": "relation",
                    "schema_name": "extensions",
                    "object_name": "internal_state",
                    "detail": {"definition": "source"},
                },
                {
                    "kind": "relation",
                    "schema_name": "net",
                    "object_name": "internal_state",
                    "detail": {"definition": "source"},
                },
                {
                    "kind": "relation",
                    "schema_name": "pgbouncer",
                    "object_name": "internal_state",
                    "detail": {"definition": "source"},
                },
                {
                    "kind": "relation",
                    "schema_name": "supabase_functions",
                    "object_name": "internal_state",
                    "detail": {"definition": "source"},
                },
            ]
        )
        candidate = json.loads(json.dumps(source))
        candidate_by_key = {
            (item["kind"], item["schema_name"], item["object_name"]): item
            for item in candidate["objects"]
        }
        candidate_by_key[("relation", "public", "lessons")]["detail"]["acl"] = [
            {
                "grantee": "aura_board_dr_replication",
                "privilege": "SELECT",
                "grantable": False,
            },
            {
                "grantee": "PUBLIC",
                "privilege": "SELECT",
                "grantable": False,
            },
            {
                "grantee": "PUBLIC",
                "privilege": "UPDATE",
                "grantable": False,
            },
        ]
        for schema_name in cutover._lib.SERVICE_INTERNAL_SCHEMAS:
            candidate_by_key[("relation", schema_name, "internal_state")]["detail"]["definition"] = "target"
        for key in EXPECTED_STORAGE_FORWARD_CATALOG_OBJECTS:
            candidate_by_key[key]["detail"] = {"definition": "target-forward-only"}

        cutover.compare_catalogs(source, candidate)

    def test_candidate_only_named_storage_forward_objects_are_ignored_but_unknown_additions_fail(self) -> None:
        source = catalog_document(
            [
                {
                    "kind": "relation",
                    "schema_name": "storage",
                    "object_name": "buckets",
                    "detail": {"acl": []},
                },
                {
                    "kind": "relation",
                    "schema_name": "storage",
                    "object_name": "objects",
                    "detail": {"acl": []},
                },
            ]
        )
        for key in EXPECTED_STORAGE_FORWARD_CATALOG_OBJECTS:
            with self.subTest(key=key):
                candidate = json.loads(json.dumps(source))
                kind, schema_name, object_name = key
                candidate["objects"].append(
                    {
                        "kind": kind,
                        "schema_name": schema_name,
                        "object_name": object_name,
                        "detail": {"definition": "candidate-only-forward"},
                    }
                )
                cutover.compare_catalogs(source, candidate)

        candidate = json.loads(json.dumps(source))
        candidate["objects"].append(
            {
                "kind": "column",
                "schema_name": "storage",
                "object_name": "objects.unlisted_candidate_field",
                "detail": {"type": "text"},
            }
        )
        with self.assertRaisesRegex(cutover.CutoverError, "application catalog"):
            cutover.compare_catalogs(source, candidate)

    def test_application_scope_detects_public_type_default_and_rls_drift(self) -> None:
        source = catalog_document(
            [
                {
                    "kind": "relation",
                    "schema_name": "public",
                    "object_name": "lessons",
                    "detail": {"row_security": False, "acl": []},
                },
                {
                    "kind": "column",
                    "schema_name": "public",
                    "object_name": "lessons.title",
                    "detail": {"type": "text", "default": "'untitled'::text"},
                },
                {
                    "kind": "policy",
                    "schema_name": "public",
                    "object_name": "lessons.read",
                    "detail": {"using": "(true)"},
                },
            ]
        )
        changes = (
            ("type", "varchar", ("column", "public", "lessons.title")),
            ("default", "'changed'::text", ("column", "public", "lessons.title")),
            ("row_security", True, ("relation", "public", "lessons")),
            ("using", "(false)", ("policy", "public", "lessons.read")),
        )
        for field, changed, key in changes:
            with self.subTest(field=field):
                candidate = json.loads(json.dumps(source))
                item = next(
                    item
                    for item in candidate["objects"]
                    if (item["kind"], item["schema_name"], item["object_name"]) == key
                )
                item["detail"][field] = changed
                with self.assertRaisesRegex(cutover.CutoverError, "application catalog"):
                    cutover.compare_catalogs(source, candidate)

    def test_application_scope_detects_unknown_storage_field(self) -> None:
        source = catalog_document(
            [
                {
                    "kind": "relation",
                    "schema_name": "storage",
                    "object_name": "objects",
                    "detail": {"acl": []},
                },
                {
                    "kind": "column",
                    "schema_name": "storage",
                    "object_name": "objects.unlisted_forward_field",
                    "detail": {"type": "text"},
                },
            ]
        )
        candidate = json.loads(json.dumps(source))
        candidate["objects"][1]["detail"]["type"] = "integer"
        with self.assertRaisesRegex(cutover.CutoverError, "application catalog"):
            cutover.compare_catalogs(source, candidate)

    def test_relation_acl_detects_unknown_grants_and_non_allowlisted_dr_grants(self) -> None:
        source = catalog_document(
            [
                {
                    "kind": "relation",
                    "schema_name": "public",
                    "object_name": "lessons",
                    "detail": {
                        "acl": [
                            {
                                "grantee": "PUBLIC",
                                "privilege": "SELECT",
                                "grantable": False,
                            }
                        ]
                    },
                }
            ]
        )
        grants = (
            {"grantee": "unknown_grantee", "privilege": "SELECT", "grantable": False},
            {"grantee": "aura_board_dr_replication", "privilege": "DELETE", "grantable": False},
            {"grantee": "aura_board_dr_replication", "privilege": "SELECT", "grantable": True},
        )
        for grant in grants:
            with self.subTest(grant=grant):
                candidate = json.loads(json.dumps(source))
                candidate["objects"][0]["detail"]["acl"].append(grant)
                with self.assertRaisesRegex(cutover.CutoverError, "application catalog"):
                    cutover.compare_catalogs(source, candidate)

    def test_relation_acl_rejects_non_sql_emitted_row_shapes(self) -> None:
        source = catalog_document(
            [
                {
                    "kind": "relation",
                    "schema_name": "public",
                    "object_name": "lessons",
                    "detail": {
                        "acl": [
                            {
                                "grantee": "PUBLIC",
                                "privilege": "SELECT",
                                "grantable": False,
                            }
                        ]
                    },
                }
            ]
        )
        alternate_shapes = (
            {
                "grantee": "PUBLIC",
                "privilege_type": "SELECT",
                "is_grantable": False,
            },
            {
                "grantee": "PUBLIC",
                "privilege": "SELECT",
                "grantable": False,
                "grantor": "postgres",
            },
        )
        for alternate in alternate_shapes:
            with self.subTest(alternate=alternate):
                candidate = json.loads(json.dumps(source))
                candidate["objects"][0]["detail"]["acl"] = [alternate]
                with self.assertRaisesRegex(cutover.CutoverError, "relation ACL is malformed"):
                    cutover.compare_catalogs(source, candidate)

    def test_schema_and_routine_acls_are_canonical_with_exact_dr_exceptions(self) -> None:
        source = catalog_document(
            [
                {
                    "kind": "schema",
                    "schema_name": "public",
                    "object_name": "public",
                    "detail": {
                        "owner": "postgres",
                        "acl": [
                            {
                                "grantee": "PUBLIC",
                                "privilege": "CREATE",
                                "grantable": False,
                            },
                            {
                                "grantee": "PUBLIC",
                                "privilege": "USAGE",
                                "grantable": False,
                            },
                        ],
                    },
                },
                {
                    "kind": "routine",
                    "schema_name": "public",
                    "object_name": "aura_probe()",
                    "detail": {
                        "acl": [
                            {
                                "grantee": "PUBLIC",
                                "privilege": "EXECUTE",
                                "grantable": False,
                            }
                        ],
                        "definition": "CREATE FUNCTION aura_probe() RETURNS void",
                    },
                },
            ]
        )
        candidate = json.loads(json.dumps(source))
        candidate["objects"][0]["detail"]["acl"] = [
            {
                "grantee": "aura_board_dr_replication",
                "privilege": "USAGE",
                "grantable": False,
            },
            {
                "grantee": "PUBLIC",
                "privilege": "USAGE",
                "grantable": False,
            },
            {
                "grantee": "PUBLIC",
                "privilege": "CREATE",
                "grantable": False,
            },
        ]
        cutover.compare_catalogs(source, candidate)

        candidate["objects"][1]["detail"]["acl"].append(
            {
                "grantee": "aura_board_dr_replication",
                "privilege": "EXECUTE",
                "grantable": False,
            }
        )
        with self.assertRaisesRegex(cutover.CutoverError, "application catalog"):
            cutover.compare_catalogs(source, candidate)

        auth = catalog_document(
            [
                {
                    "kind": "schema",
                    "schema_name": "auth",
                    "object_name": "auth",
                    "detail": {"owner": "postgres", "acl": []},
                }
            ]
        )
        auth_candidate = json.loads(json.dumps(auth))
        auth_candidate["objects"][0]["detail"]["acl"].append(
            {
                "grantee": "aura_board_dr_replication",
                "privilege": "USAGE",
                "grantable": False,
            }
        )
        with self.assertRaisesRegex(cutover.CutoverError, "auth schema"):
            cutover.compare_catalogs(auth, auth_candidate)

    def test_owner_drift_is_not_normalized_for_library_style_restore(self) -> None:
        source = catalog_document(
            [
                {
                    "kind": "schema",
                    "schema_name": "public",
                    "object_name": "public",
                    "detail": {"owner": "source_owner", "acl": []},
                },
                {
                    "kind": "relation",
                    "schema_name": "public",
                    "object_name": "lessons",
                    "detail": {"owner": "source_owner", "acl": []},
                },
            ]
        )
        candidate = json.loads(json.dumps(source))
        candidate["objects"][0]["detail"]["owner"] = "target_owner"
        with self.assertRaisesRegex(cutover.CutoverError, "application catalog"):
            cutover.compare_catalogs(source, candidate)

        candidate = json.loads(json.dumps(source))
        candidate["objects"][1]["detail"]["owner"] = "target_owner"
        with self.assertRaisesRegex(cutover.CutoverError, "application catalog"):
            cutover.compare_catalogs(source, candidate)

    def test_routine_type_and_index_owner_drift_fails_closed(self) -> None:
        source = catalog_document(
            [
                {
                    "kind": kind,
                    "schema_name": "public",
                    "object_name": name,
                    "detail": {"owner": "source_owner", "acl": []},
                }
                for kind, name in (
                    ("routine", "library_lookup()"),
                    ("type", "library_kind"),
                    ("index", "library.library_pkey"),
                )
            ]
        )
        for index, kind in enumerate(("routine", "type", "index")):
            with self.subTest(kind=kind):
                candidate = json.loads(json.dumps(source))
                candidate["objects"][index]["detail"]["owner"] = "target_owner"
                with self.assertRaisesRegex(cutover.CutoverError, "application catalog"):
                    cutover.compare_catalogs(source, candidate)

    def test_public_archive_is_data_only_and_rejects_schema_or_ddl_entries(self) -> None:
        public_args = cutover._lib.archive_args("public", self.root / "public.dump")
        self.assertIn("--data-only", public_args)
        self.assertIn("--schema=public", public_args)
        self.assertNotIn("--clean", public_args)
        cutover._lib.validate_archive(
            "public",
            "1; 0 0 TABLE DATA public lessons postgres\n"
            "2; 0 0 SEQUENCE SET public lessons_id_seq postgres\n",
        )
        for entry in (
            "1; 0 0 SCHEMA - public postgres\n",
            "1; 0 0 TABLE public lessons postgres\n",
            "1; 0 0 INDEX public lessons_pkey postgres\n",
        ):
            with self.subTest(entry=entry):
                with self.assertRaisesRegex(cutover.CutoverError, "schema or DDL"):
                    cutover._lib.validate_archive("public", entry)

    def test_archive_toc_parser_is_anchored_and_supports_quoted_identifiers(self) -> None:
        listing = (
            "; Archive created at 2026-08-21\n"
            '1; 0 0 TABLE DATA public "Mixed Case Table" postgres\n'
            '2; 0 0 SEQUENCE SET public "Sequence ""With Quote""" postgres\n'
        )
        self.assertEqual(
            cutover._lib.archive_entries(listing),
            [
                ("TABLE DATA", "public", "Mixed Case Table"),
                ("SEQUENCE SET", "public", 'Sequence "With Quote"'),
            ],
        )
        cutover._lib.validate_archive("public", listing)
        with self.assertRaisesRegex(cutover.CutoverError, "unrecognized"):
            cutover._lib.archive_entries(
                "prefix 1; 0 0 TABLE DATA public lessons postgres\n"
            )
        with self.assertRaisesRegex(cutover.CutoverError, "malformed"):
            cutover._lib.archive_entries(
                "1; 0 0 TABLE DATA public lessons postgres trailing\n"
            )

    def test_sequence_only_archive_is_valid_and_duplicate_data_entries_fail(self) -> None:
        cutover._lib.validate_archive(
            "public", "1; 0 0 SEQUENCE SET public only_sequence postgres\n"
        )
        with self.assertRaisesRegex(cutover.CutoverError, "duplicate"):
            cutover._lib.validate_archive(
                "public",
                "1; 0 0 SEQUENCE SET public only_sequence postgres\n"
                "2; 0 0 SEQUENCE SET public only_sequence postgres\n",
            )

    def test_preflight_requires_restore_and_admin_superusers(self) -> None:
        for field in ("restore_user_superuser", "target_admin_superuser"):
            with self.subTest(field=field):
                setattr(self.fake, field, False)
                result, _out, err = self.call("preflight")
                self.assertEqual(result, 1)
                self.assertIn("must be a PostgreSQL superuser", err)
                self.assertFalse(
                    any(
                        "aura:candidate-create" in sql
                        or "aura:truncate-" in sql
                        for _service, sql in self.fake.sql_calls
                    )
                )
                setattr(self.fake, field, True)

    def test_candidate_restore_rechecks_superuser_before_mutation(self) -> None:
        self.flow_to("candidate-create")
        self.fake.restore_user_superuser = False
        result, _out, err = self.call("candidate-restore")
        self.assertEqual(result, 1)
        self.assertIn("candidate restore user must be a PostgreSQL superuser", err)
        self.assertFalse(
            any("aura:truncate-" in sql for _service, sql in self.fake.sql_calls)
        )
        self.assertFalse(
            any(
                "pg_restore" in Path(argv[0]).name and "--list" not in argv
                for argv, _env, _sql in self.fake.calls
            )
        )

    def test_external_public_fk_blocks_truncate_without_cascade(self) -> None:
        self.flow_to("candidate-create")
        self.fake.external_public_fks = [
            {
                "constraint": "audit_lesson_fk",
                "referencing_schema": "audit",
                "referencing_table": "lesson_events",
                "referenced_table": "lessons",
            }
        ]
        result, _out, err = self.call("candidate-restore")
        self.assertEqual(result, 1)
        self.assertIn("out-of-scope table has a foreign key", err)
        self.assertFalse(
            any("aura:truncate-" in sql for _service, sql in self.fake.sql_calls)
        )

    def test_candidate_database_owner_and_acl_are_restored_and_recorded(self) -> None:
        self.flow_to("candidate-create")
        names = cutover.db_names(self.credentials)
        create_sql = next(
            sql
            for service, sql in self.fake.sql_calls
            if service == "target_admin" and "aura:candidate-create" in sql
        )
        self.assertIn('WITH OWNER "target_admin"', create_sql)
        expected = json.loads(
            json.dumps(self.fake.database_contracts[names["target"]])
        )
        expected["database"] = names["candidate"]
        self.assertEqual(self.fake.database_contracts[names["candidate"]], expected)
        journal = json.loads((self.root / "journal.json").read_text(encoding="utf-8"))
        self.assertEqual(journal["candidate"]["database_contract"], expected)

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
        public_restore = [
            argv
            for service, argv in restores
            if service == "candidate"
            and "--list" not in argv
            and argv[-1].endswith("public.dump")
        ]
        self.assertEqual(len(public_restore), 1)
        self.assertIn("--data-only", public_restore[0])
        self.assertIn("--disable-triggers", public_restore[0])
        self.assertIn("--single-transaction", public_restore[0])
        self.assertNotIn("--clean", public_restore[0])
        self.assertNotIn("--if-exists", public_restore[0])
        public_truncates = [
            (service, sql)
            for service, sql in self.fake.sql_calls
            if "aura:truncate-public" in sql
        ]
        self.assertEqual(len(public_truncates), 1)
        self.assertEqual(public_truncates[0][0], "candidate")
        self.assertIn(
            'TRUNCATE TABLE "public"."boards", "public"."lessons" '
            'RESTART IDENTITY',
            public_truncates[0][1],
        )
        self.assertNotIn("CASCADE", public_truncates[0][1])
        self.assertEqual(self.fake.candidate_schema_objects, self.fake.target_schema_objects)
        self.assertFalse(any("DROP SCHEMA public" in sql for _service, sql in self.fake.sql_calls))

    def test_rollback_works_before_seal_and_fails_after_runtime_seal_marker(self) -> None:
        self.flow_to("candidate-verify")
        result, _out, err = self.call("promote")
        self.assertEqual(result, 0, err)
        before_seal = set(self.fake.databases)
        marker = cutover.write_seal_marker(
            self.root / cutover.JOURNAL_FILENAME,
            self.root / cutover.PROMOTION_MANIFEST_FILENAME,
        )
        self.assertEqual(
            cutover.write_seal_marker(
                self.root / cutover.JOURNAL_FILENAME,
                self.root / cutover.PROMOTION_MANIFEST_FILENAME,
            ),
            marker,
        )
        manifest_bytes = (self.root / cutover.PROMOTION_MANIFEST_FILENAME).read_bytes()
        (self.root / cutover.PROMOTION_MANIFEST_FILENAME).write_bytes(manifest_bytes + b"tampered")
        with self.assertRaisesRegex(cutover.CutoverError, "does not match current DB evidence"):
            cutover.write_seal_marker(
                self.root / cutover.JOURNAL_FILENAME,
                self.root / cutover.PROMOTION_MANIFEST_FILENAME,
            )
        (self.root / cutover.PROMOTION_MANIFEST_FILENAME).write_bytes(manifest_bytes)
        marker_path = cutover.seal_marker_path(self.root / cutover.JOURNAL_FILENAME)
        if os.name != "nt":
            self.assertEqual(stat.S_IMODE(marker_path.stat().st_mode), 0o600)
        result, _out, err = self.call("rollback")
        self.assertEqual(result, 1)
        self.assertIn("permanently blocked after the production seal", err)
        self.assertEqual(self.fake.databases, before_seal)

    def test_malformed_seal_marker_fails_closed_before_rollback_action(self) -> None:
        self.flow_to("candidate-verify")
        result, _out, err = self.call("promote")
        self.assertEqual(result, 0, err)
        marker_path = cutover.seal_marker_path(self.root / cutover.JOURNAL_FILENAME)
        marker_path.write_text("{}\n", encoding="utf-8")
        marker_path.chmod(0o600)
        before = set(self.fake.databases)
        result, _out, err = self.call("rollback")
        self.assertEqual(result, 1)
        self.assertIn("DB seal marker is malformed", err)
        self.assertEqual(self.fake.databases, before)

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

    def test_release_restores_recorded_acl_login_cron_and_read_only_state_exactly(self) -> None:
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
        self.assertEqual(journal["fence"]["before"]["cron_jobs"], journal["fence"]["after_release"]["cron_jobs"])
        self.assertEqual(journal["fence"]["before"]["db_settings"], journal["fence"]["after_release"]["db_settings"])
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

    def test_role_lockdown_release_replays_exact_cron_and_read_only_snapshot(self) -> None:
        before = self.fake._fence()
        before["cron_jobs"] = [
            {"jobid": 7, "active": False},
            {"jobid": 9, "active": True},
        ]
        before["db_settings"] = [
            "default_transaction_read_only=on",
            "search_path=public",
        ]
        before["effective_read_only"] = "on"
        sql = cutover.release_sql(self.credentials, before)
        self.assertIn(
            'ALTER DATABASE "source_db" SET default_transaction_read_only=on;',
            sql,
        )
        self.assertIn("UPDATE cron.job SET active=false WHERE jobid=7;", sql)
        self.assertIn("UPDATE cron.job SET active=true WHERE jobid=9;", sql)

    def test_target_container_contract_is_required_before_candidate_creation(self) -> None:
        false_contract = json.loads(json.dumps(self.credentials))
        false_contract["target_stopped_containers"] = false_contract["target_stopped_containers"][1:]
        with (
            mock.patch.object(cutover.sys, "stdin", io.StringIO(json.dumps(false_contract))),
            self.assertRaisesRegex(
                cutover.CutoverError, "complete sorted production container set"
            ),
        ):
            cutover.read_credentials()

    def test_active_target_container_blocks_candidate_creation_before_database_action(self) -> None:
        self.flow_to("engage-fence")
        self.fake.running_containers.add("supabase-auth")
        result, _out, err = self.call("candidate-create")
        self.assertEqual(result, 1)
        self.assertIn("required target container is active: supabase-auth", err)
        self.assertEqual(self.fake.databases, {cutover.db_names(self.credentials)["target"]})

        legacy_contract = json.loads(json.dumps(self.credentials))
        del legacy_contract["target_stopped_containers"]
        legacy_contract["target_services_stopped"] = True
        with (
            mock.patch.object(cutover.sys, "stdin", io.StringIO(json.dumps(legacy_contract))),
            self.assertRaisesRegex(cutover.CutoverError, "exact cutover contract"),
        ):
            cutover.read_credentials()

    def test_candidate_drop_rechecks_containers_after_quiescence(self) -> None:
        names = cutover.db_names(self.credentials)
        self.fake.databases.add(names["candidate"])
        self.fake.restart_after_quiesce = True
        with (
            mock.patch.object(cutover.subprocess, "run", side_effect=self.fake),
            self.assertRaisesRegex(cutover.CutoverError, "required target container is active"),
        ):
            cutover._lib.drop_candidate(self.root, self.credentials)
        self.assertIn(names["candidate"], self.fake.databases)
        self.assertFalse(any("aura:candidate-drop" in sql for _service, sql in self.fake.sql_calls))

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
        rollback_contract = self.fake.database_contracts.pop(names["target"])
        rollback_contract["database"] = names["rollback"]
        self.fake.database_contracts[names["rollback"]] = rollback_contract
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
        candidate_contract = self.fake.database_contracts.pop(names["target"])
        candidate_contract["database"] = names["candidate"]
        self.fake.database_contracts[names["candidate"]] = candidate_contract
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


class CredentialRotationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="cutover-rotation-test-")
        self.root = Path(self.temporary.name)
        self.root.chmod(0o700)
        self.credentials = rotation_contract()
        self.fake = FakeToolchain(self.credentials)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def call(self, action: str) -> tuple[int, str, str]:
        stdout, stderr = io.StringIO(), io.StringIO()
        with (
            mock.patch.object(cutover.subprocess, "run", side_effect=self.fake),
            mock.patch.object(cutover, "validate_state_dir"),
            mock.patch.object(
                cutover.sys,
                "stdin",
                io.StringIO(json.dumps(self.credentials, ensure_ascii=False)),
            ),
            contextlib.redirect_stdout(stdout),
            contextlib.redirect_stderr(stderr),
        ):
            result = cutover.main([action, "--write", "--state-dir", str(self.root)])
        return result, stdout.getvalue(), stderr.getvalue()

    def preflight_and_external_fence(self) -> None:
        result, _out, err = self.call("preflight")
        self.assertEqual(result, 0, err)
        self.fake.externally_rotate_and_fence()

    def adopt(self) -> None:
        self.preflight_and_external_fence()
        result, _out, err = self.call("adopt-fence")
        self.assertEqual(result, 0, err)

    def test_same_role_rotation_requires_exact_alias_and_different_passwords(self) -> None:
        with mock.patch.object(
            cutover.sys, "stdin", io.StringIO(json.dumps(self.credentials))
        ):
            parsed = cutover.read_credentials()
        self.assertEqual(parsed["source_fence_mode"], "credential_rotation")
        self.assertEqual(parsed["source_export_role"], "postgres")
        self.assertEqual(parsed["source_writer_roles"], ["postgres"])

        same_password = json.loads(json.dumps(self.credentials))
        same_password["source_writer_credentials"]["postgres"]["password"] = same_password[
            "source"
        ]["password"]
        with mock.patch.object(
            cutover.sys, "stdin", io.StringIO(json.dumps(same_password))
        ), self.assertRaisesRegex(cutover.CutoverError, "different passwords"):
            cutover.read_credentials()

        alias_mismatch = json.loads(json.dumps(self.credentials))
        alias_mismatch["source_writer_credentials"]["postgres"]["user"] = (
            "postgres.otherprojectref"
        )
        with mock.patch.object(
            cutover.sys, "stdin", io.StringIO(json.dumps(alias_mismatch))
        ), self.assertRaisesRegex(cutover.CutoverError, "same role.<project-ref>"):
            cutover.read_credentials()

        wrong_role = json.loads(json.dumps(self.credentials))
        wrong_role["source_export_role"] = "aura_app"
        wrong_role["source_writer_roles"] = ["aura_app"]
        wrong_role["source"]["user"] = "aura_app.abcdefghijklmnopqrst"
        wrong_role["source_writer_credentials"] = {
            "aura_app": {
                **wrong_role["source_writer_credentials"]["postgres"],
                "user": "aura_app.abcdefghijklmnopqrst",
            }
        }
        with mock.patch.object(
            cutover.sys, "stdin", io.StringIO(json.dumps(wrong_role))
        ), self.assertRaisesRegex(cutover.CutoverError, "actual postgres role"):
            cutover.read_credentials()

    def test_credential_rotation_allows_default_database_acl_without_acl_mutation(self) -> None:
        self.fake.database_acl_is_default = True
        result, _out, err = self.call("preflight")
        self.assertEqual(result, 0, err)
        self.fake.externally_rotate_and_fence()
        result, _out, err = self.call("adopt-fence")
        self.assertEqual(result, 0, err)
        journal = json.loads((self.root / cutover.JOURNAL_FILENAME).read_text(encoding="utf-8"))
        self.assertTrue(journal["fence"]["before"]["database_acl_is_default"])
        self.assertTrue(journal["fence"]["after"]["database_acl_is_default"])

    def test_adopt_rejects_engage_and_verifies_old_rejection_and_temp_export(self) -> None:
        self.preflight_and_external_fence()
        result, _out, err = self.call("engage-fence")
        self.assertEqual(result, 1)
        self.assertIn("adopt-fence", err)
        result, _out, err = self.call("adopt-fence")
        self.assertEqual(result, 0, err)
        self.assertTrue(
            any(
                "old-writer-reconnect-write-probe" in " ".join(argv)
                for argv, _env, _sql in self.fake.calls
            )
        )
        self.assertTrue(any("export-path-probe" in sql for _service, sql in self.fake.sql_calls))
        self.assertTrue(
            any("default_transaction_read_only=on" in sql for _service, sql in self.fake.sql_calls)
            or self.fake._fence()["effective_read_only"] == "on"
        )
        journal = json.loads((self.root / "journal.json").read_text(encoding="utf-8"))
        self.assertEqual(journal["phase"], "fence-engaged")
        self.assertEqual(journal["fence"]["after"]["effective_read_only"], "on")
        self.assertTrue(all(not job["active"] for job in journal["fence"]["after"]["cron_jobs"]))

    def test_adopt_terminates_active_old_pooled_sessions(self) -> None:
        self.fake.writer_sessions = [{"pid": 700, "user": "postgres", "application": "pooler"}]
        self.preflight_and_external_fence()
        result, _out, err = self.call("adopt-fence")
        self.assertEqual(result, 0, err)
        self.assertEqual(self.fake.writer_sessions, [])
        self.assertTrue(
            any("aura:rotation-terminate" in sql for _service, sql in self.fake.sql_calls)
        )

    def test_adopt_requires_exact_read_only_and_cron_state(self) -> None:
        self.preflight_and_external_fence()
        self.fake.rotation_read_only = False
        result, _out, err = self.call("adopt-fence")
        self.assertEqual(result, 1)
        self.assertIn("read-only", err)
        self.assertEqual(
            json.loads((self.root / "journal.json").read_text(encoding="utf-8"))["phase"],
            "fence-adopt-partial-failure",
        )
        before = json.loads((self.root / "journal.json").read_text(encoding="utf-8"))["fence"]["before"]
        self.fake.rotation_read_only = True
        result, _out, err = self.call("adopt-fence")
        self.assertEqual(result, 0, err)
        retry_journal = json.loads((self.root / "journal.json").read_text(encoding="utf-8"))
        self.assertEqual(retry_journal["phase"], "fence-engaged")
        self.assertEqual(retry_journal["fence"]["before"], before)

        self.temporary.cleanup()
        self.temporary = tempfile.TemporaryDirectory(prefix="cutover-rotation-test-")
        self.root = Path(self.temporary.name)
        self.root.chmod(0o700)
        self.credentials = rotation_contract()
        self.fake = FakeToolchain(self.credentials)
        self.preflight_and_external_fence()
        self.fake.rotation_cron_disabled = False
        result, _out, err = self.call("adopt-fence")
        self.assertEqual(result, 1)
        self.assertIn("pg_cron", err)

    def test_malformed_or_ambiguous_rotation_state_fails_closed(self) -> None:
        snapshot = self.fake._fence()
        snapshot["roles"].append(dict(snapshot["roles"][0]))
        with self.assertRaisesRegex(cutover.CutoverError, "role snapshot"):
            cutover.validate_fence(snapshot, self.credentials)

        snapshot = self.fake._fence()
        snapshot["cron_jobs"].append(dict(snapshot["cron_jobs"][0]))
        with self.assertRaisesRegex(cutover.CutoverError, "pg_cron snapshot"):
            cutover.validate_fence(snapshot, self.credentials)

        malformed = json.loads(json.dumps(self.credentials))
        malformed["source_fence_mode"] = ["credential_rotation"]
        with mock.patch.object(
            cutover.sys, "stdin", io.StringIO(json.dumps(malformed))
        ), self.assertRaisesRegex(cutover.CutoverError, "source_fence_mode"):
            cutover.read_credentials()

        self.preflight_and_external_fence()
        journal = json.loads((self.root / "journal.json").read_text(encoding="utf-8"))
        journal["fence"] = []
        (self.root / "journal.json").write_text(json.dumps(journal), encoding="utf-8")
        result, _out, err = self.call("adopt-fence")
        self.assertEqual(result, 1)
        self.assertIn("journal fence mode", err)

    def test_release_requires_external_old_restore_and_restores_exact_state(self) -> None:
        self.adopt()
        result, _out, err = self.call("release-fence")
        self.assertEqual(result, 1)
        self.assertIn("temporary credential remains active", err)
        self.assertNotIn(self.credentials["source"]["password"], err)
        self.assertNotIn(
            self.credentials["source_writer_credentials"]["postgres"]["password"], err
        )
        self.assertFalse(
            any("aura:credential-rotation-release" in sql for _service, sql in self.fake.sql_calls)
        )

        self.fake.externally_restore_old_password()
        result, _out, err = self.call("release-fence")
        self.assertEqual(result, 0, err)
        journal = json.loads((self.root / "journal.json").read_text(encoding="utf-8"))
        self.assertEqual(journal["phase"], "fence-released")
        self.assertEqual(journal["fence"]["before"], journal["fence"]["after_release"])
        self.assertFalse(self.fake.fenced)

    def test_release_never_succeeds_while_temporary_password_is_active(self) -> None:
        self.adopt()
        self.fake.externally_restore_old_password()
        self.fake.allow_temp_after_restore = True
        result, _out, err = self.call("release-fence")
        self.assertEqual(result, 1)
        self.assertIn("temporary credential remains active", err)
        self.assertEqual(
            json.loads((self.root / "journal.json").read_text(encoding="utf-8"))["phase"],
            "fence-release-partial-failure",
        )

    def test_rotation_secrets_stay_out_of_argv_sql_journal_and_errors(self) -> None:
        self.adopt()
        journal = (self.root / "journal.json").read_text(encoding="utf-8")
        rendered = json.dumps(self.fake.calls, ensure_ascii=False) + json.dumps(
            self.fake.sql_calls, ensure_ascii=False
        )
        secret_values = {
            self.credentials["source"]["password"],
            self.credentials["source_writer_credentials"]["postgres"]["password"],
        }
        self.assertTrue(all(secret not in journal for secret in secret_values))
        self.assertTrue(all(secret not in rendered for secret in secret_values))
        self.assertTrue(all("PGPASSWORD" not in env for _argv, env, _sql in self.fake.calls))


class EphemeralPostgresHarness:
    """Concrete opt-in Docker harness for a real PostgreSQL catalog probe."""

    def __init__(self) -> None:
        self.docker = shutil.which("docker")
        self.name = "aura-cutover-test-postgres"
        self.catalog_source = "aura_cutover_catalog_source"
        self.catalog_target = "aura_cutover_catalog_target"

    def start(self) -> None:
        if not self.docker:
            raise unittest.SkipTest("Docker unavailable")
        subprocess.run(
            [
                self.docker,
                "run",
                "--rm",
                "-d",
                "--name",
                self.name,
                "-e",
                "POSTGRES_PASSWORD=test-only",
                "postgres:16-alpine",
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            result = subprocess.run(
                [self.docker, "exec", self.name, "pg_isready", "-U", "postgres"],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if result.returncode == 0:
                return
            time.sleep(0.25)
        raise AssertionError("ephemeral PostgreSQL container did not become ready")

    def psql(self, sql: str, database: str = "postgres") -> str:
        if not self.docker:
            raise AssertionError("Docker unavailable")
        result = subprocess.run(
            [
                self.docker,
                "exec",
                "-i",
                self.name,
                "psql",
                "-U",
                "postgres",
                "-d",
                database,
                "--no-psqlrc",
                "--quiet",
                "--set=ON_ERROR_STOP=1",
                "--tuples-only",
                "--no-align",
                "--file=-",
            ],
            input=sql,
            text=True,
            capture_output=True,
            check=True,
        )
        return result.stdout.strip()

    def stop(self) -> None:
        if self.docker:
            subprocess.run([self.docker, "rm", "-f", self.name], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


@unittest.skipUnless(os.environ.get("AURA_CUTOVER_RUN_DOCKER_TESTS") == "1", "set AURA_CUTOVER_RUN_DOCKER_TESTS=1 to run the ephemeral PostgreSQL harness")
class DockerIntegrationTests(unittest.TestCase):
    def test_migration_sql_uses_python_order_for_collation_sensitive_names(self) -> None:
        harness = EphemeralPostgresHarness()
        try:
            harness.start()
            harness.psql(
                """
                CREATE COLLATION aura_test_migration_order (provider = icu, locale = 'en-US');
                CREATE TABLE public._prisma_migrations (
                    id text PRIMARY KEY,
                    checksum text NOT NULL,
                    finished_at timestamptz,
                    migration_name text COLLATE aura_test_migration_order NOT NULL,
                    logs text,
                    rolled_back_at timestamptz,
                    started_at timestamptz NOT NULL,
                    applied_steps_count integer NOT NULL
                );
                INSERT INTO public._prisma_migrations (
                    id,
                    checksum,
                    finished_at,
                    migration_name,
                    started_at,
                    applied_steps_count
                )
                VALUES
                    ('z-id', 'z-checksum', '2026-08-21 00:00:00+00', '202608210001_Z', '2026-08-21 00:00:00+00', 1),
                    ('a-id', 'a-checksum', '2026-08-21 00:00:00+00', '202608210001_a', '2026-08-21 00:00:00+00', 1);
                """
            )
            records = json.loads(harness.psql(cutover._lib.MIGRATION_SQL))
            names = [record["migration_name"] for record in records]
            self.assertEqual(names, sorted(names))
        finally:
            harness.stop()

    def test_catalog_sql_canonicalizes_acl_policy_roles_with_shifted_oids_and_semantic_columns(self) -> None:
        harness = EphemeralPostgresHarness()
        try:
            harness.start()
            harness.psql(
                """
                CREATE ROLE aura_acl_grantee NOLOGIN;
                CREATE ROLE aura_board_dr_replication NOLOGIN;
                CREATE ROLE aura_policy_oid_z NOLOGIN;
                CREATE ROLE aura_policy_oid_a NOLOGIN;
                CREATE DATABASE aura_cutover_catalog_source;
                CREATE DATABASE aura_cutover_catalog_target;
                """
            )
            self.assertEqual(
                harness.psql(
                    """
                    SELECT string_agg(rolname, ',' ORDER BY oid)
                    FROM pg_roles
                    WHERE rolname IN ('aura_policy_oid_z', 'aura_policy_oid_a');
                    """
                ),
                "aura_policy_oid_z,aura_policy_oid_a",
            )
            harness.psql(
                """
                CREATE TABLE public.acl_items (
                    id integer,
                    payload text DEFAULT 'payload'
                );
                GRANT SELECT ON TABLE public.acl_items TO aura_acl_grantee;
                GRANT USAGE ON SCHEMA public TO aura_acl_grantee;
                CREATE INDEX acl_items_payload_idx ON public.acl_items(payload);
                CREATE FUNCTION public.acl_probe() RETURNS integer
                    LANGUAGE sql AS $$ SELECT 1 $$;
                GRANT EXECUTE ON FUNCTION public.acl_probe() TO aura_acl_grantee;
                CREATE TYPE public.acl_kind AS ENUM ('one', 'two');
                GRANT USAGE ON TYPE public.acl_kind TO aura_acl_grantee;
                CREATE TABLE public.policy_items (id integer);
                CREATE POLICY policy_roles
                    ON public.policy_items
                    TO aura_policy_oid_z, aura_policy_oid_a
                    USING (true);
                """,
                harness.catalog_source,
            )
            harness.psql(
                """
                CREATE TABLE public.acl_items (
                    id integer,
                    noise text,
                    payload text DEFAULT 'payload'
                );
                ALTER TABLE public.acl_items DROP COLUMN noise;
                GRANT SELECT ON TABLE public.acl_items TO aura_acl_grantee;
                GRANT SELECT ON TABLE public.acl_items TO aura_board_dr_replication;
                GRANT USAGE ON SCHEMA public TO aura_acl_grantee;
                CREATE INDEX acl_items_payload_idx ON public.acl_items(payload);
                CREATE FUNCTION public.acl_probe() RETURNS integer
                    LANGUAGE sql AS $$ SELECT 1 $$;
                GRANT EXECUTE ON FUNCTION public.acl_probe() TO aura_acl_grantee;
                CREATE TYPE public.acl_kind AS ENUM ('one', 'two');
                GRANT USAGE ON TYPE public.acl_kind TO aura_acl_grantee;
                """,
                harness.catalog_target,
            )

            def objects(database: str) -> list[dict[str, object]]:
                value = json.loads(harness.psql(cutover._lib.CATALOG_SQL, database))
                self.assertIsInstance(value, list)
                return value

            source_objects = objects(harness.catalog_source)
            target_objects = objects(harness.catalog_target)
            source_columns = [
                item
                for item in source_objects
                if item["kind"] == "column"
                and item["schema_name"] == "public"
                and item["object_name"].startswith("acl_items.")
            ]
            target_columns = [
                item
                for item in target_objects
                if item["kind"] == "column"
                and item["schema_name"] == "public"
                and item["object_name"].startswith("acl_items.")
            ]
            self.assertEqual(source_columns, target_columns)
            self.assertEqual(
                {"type", "collation", "not_null", "identity", "generated", "storage", "compression", "default"},
                set(source_columns[0]["detail"]),
            )
            self.assertTrue(all("number" not in item["detail"] for item in source_columns))

            source_relation = next(
                item
                for item in source_objects
                if item["kind"] == "relation"
                and item["schema_name"] == "public"
                and item["object_name"] == "acl_items"
            )
            target_relation = next(
                item
                for item in target_objects
                if item["kind"] == "relation"
                and item["schema_name"] == "public"
                and item["object_name"] == "acl_items"
            )
            self.assertNotEqual(
                source_relation["detail"]["acl"], target_relation["detail"]["acl"]
            )
            self.assertEqual(
                cutover._lib.application_scope({"objects": [source_relation]}),
                cutover._lib.application_scope({"objects": [target_relation]}),
            )
            source_policy = next(
                item
                for item in source_objects
                if item["kind"] == "policy"
                and item["schema_name"] == "public"
                and item["object_name"] == "policy_items.policy_roles"
            )
            self.assertEqual(
                source_policy["detail"]["roles"],
                ["aura_policy_oid_a", "aura_policy_oid_z"],
            )
            for kind, object_name in (
                ("schema", "public"),
                ("routine", "acl_probe()"),
                ("type", "acl_kind"),
                ("index", "acl_items.acl_items_payload_idx"),
            ):
                source_item = next(
                    item
                    for item in source_objects
                    if item["kind"] == kind
                    and item["schema_name"] == "public"
                    and item["object_name"] == object_name
                )
                target_item = next(
                    item
                    for item in target_objects
                    if item["kind"] == kind
                    and item["schema_name"] == "public"
                    and item["object_name"] == object_name
                )
                self.assertEqual(source_item["detail"]["owner"], "postgres")
                self.assertEqual(source_item["detail"], target_item["detail"])
                if kind in {"schema", "routine", "type", "index"}:
                    self.assertIsInstance(source_item["detail"]["acl"], list)
        finally:
            harness.stop()

    def test_catalog_sql_fingerprints_enum_domain_and_range_base_types(self) -> None:
        harness = EphemeralPostgresHarness()
        try:
            harness.start()
            harness.psql(
                """
                CREATE DATABASE aura_cutover_catalog_source;
                """
            )
            harness.psql(
                """
                CREATE TYPE public.aura_mood AS ENUM ('sad', 'ok', 'happy');
                CREATE TYPE public.aura_amount_range AS RANGE (subtype = numeric);
                CREATE DOMAIN public.aura_short_text AS varchar(42)
                    CHECK (VALUE <> '');
                """,
                harness.catalog_source,
            )
            objects = json.loads(harness.psql(cutover._lib.CATALOG_SQL, harness.catalog_source))
            types = {
                item["object_name"]: item["detail"]
                for item in objects
                if item["kind"] == "type" and item["schema_name"] == "public"
            }
            self.assertEqual(types["aura_mood"]["kind"], "e")
            self.assertIsNone(types["aura_mood"]["base_type"])
            self.assertEqual(types["aura_amount_range"]["kind"], "r")
            self.assertIsNone(types["aura_amount_range"]["base_type"])
            self.assertEqual(types["aura_short_text"]["kind"], "d")
            self.assertEqual(types["aura_short_text"]["base_type"], "character varying(42)")
        finally:
            harness.stop()

    def test_catalog_sql_fingerprints_range_semantics_without_oids(self) -> None:
        harness = EphemeralPostgresHarness()
        try:
            harness.start()
            harness.psql(
                """
                CREATE DATABASE aura_cutover_catalog_source;
                CREATE DATABASE aura_cutover_catalog_target;
                """
            )
            harness.psql(
                """
                CREATE TYPE public.aura_same_range AS RANGE (
                    subtype = text,
                    subtype_opclass = text_ops
                );
                CREATE TYPE public.aura_subtype_range AS RANGE (subtype = text);
                CREATE TYPE public.aura_opclass_range AS RANGE (
                    subtype = text,
                    subtype_opclass = text_ops
                );
                """,
                harness.catalog_source,
            )
            harness.psql(
                """
                CREATE SCHEMA oid_shift;
                CREATE TABLE oid_shift.noise (id integer PRIMARY KEY);
                CREATE INDEX noise_idx ON oid_shift.noise(id);
                CREATE TYPE public.aura_same_range AS RANGE (
                    subtype = text,
                    subtype_opclass = text_ops
                );
                CREATE TYPE public.aura_subtype_range AS RANGE (subtype = varchar);
                CREATE TYPE public.aura_opclass_range AS RANGE (
                    subtype = text,
                    subtype_opclass = text_pattern_ops
                );
                """,
                harness.catalog_target,
            )

            def type_details(database: str) -> dict[str, dict[str, object]]:
                objects = json.loads(harness.psql(cutover._lib.CATALOG_SQL, database))
                return {
                    item["object_name"]: item["detail"]
                    for item in objects
                    if item["kind"] == "type"
                    and item["schema_name"] == "public"
                    and item["object_name"]
                    in {"aura_same_range", "aura_subtype_range", "aura_opclass_range"}
                }

            source = type_details(harness.catalog_source)
            target = type_details(harness.catalog_target)
            self.assertEqual(source["aura_same_range"], target["aura_same_range"])
            self.assertEqual(source["aura_same_range"]["range"]["subtype"], "text")
            self.assertEqual(
                source["aura_same_range"]["range"]["subtype_opclass"],
                {"schema": "pg_catalog", "name": "text_ops"},
            )
            self.assertNotEqual(
                source["aura_subtype_range"], target["aura_subtype_range"]
            )
            self.assertNotEqual(
                source["aura_opclass_range"], target["aura_opclass_range"]
            )

            identical = catalog_document(
                [
                    {
                        "kind": "type",
                        "schema_name": "public",
                        "object_name": "aura_same_range",
                        "detail": source["aura_same_range"],
                    }
                ]
            )
            cutover.compare_catalogs(
                identical,
                catalog_document(
                    [
                        {
                            "kind": "type",
                            "schema_name": "public",
                            "object_name": "aura_same_range",
                            "detail": target["aura_same_range"],
                        }
                    ]
                ),
            )

            for name in ("aura_subtype_range", "aura_opclass_range"):
                with self.subTest(name=name):
                    with self.assertRaisesRegex(cutover.CutoverError, "application catalog"):
                        cutover.compare_catalogs(
                            catalog_document(
                                [
                                    {
                                        "kind": "type",
                                        "schema_name": "public",
                                        "object_name": name,
                                        "detail": source[name],
                                    }
                                ]
                            ),
                            catalog_document(
                                [
                                    {
                                        "kind": "type",
                                        "schema_name": "public",
                                        "object_name": name,
                                        "detail": target[name],
                                    }
                                ]
                            ),
                        )
        finally:
            harness.stop()

    def test_data_sql_ignores_only_named_storage_forward_fields(self) -> None:
        harness = EphemeralPostgresHarness()
        try:
            harness.start()
            harness.psql(
                """
                CREATE DATABASE aura_cutover_catalog_source;
                CREATE DATABASE aura_cutover_catalog_target;
                """
            )
            common = """
                CREATE SCHEMA auth;
                CREATE SCHEMA storage;
                CREATE TABLE public.app_rows (id integer PRIMARY KEY, value text);
                INSERT INTO public.app_rows VALUES (1, 'same');
                CREATE TABLE auth.users (id integer PRIMARY KEY, email text);
                INSERT INTO auth.users VALUES (1, 'same@example.test');
            """
            harness.psql(
                common
                + """
                CREATE TABLE storage.buckets (id integer PRIMARY KEY, name text);
                INSERT INTO storage.buckets VALUES (1, 'uploads');
                CREATE TABLE storage.objects (
                    id integer PRIMARY KEY,
                    name text,
                    custom_marker text
                );
                INSERT INTO storage.objects VALUES (1, 'a.txt', 'same');
                """,
                harness.catalog_source,
            )
            harness.psql(
                common
                + """
                CREATE TABLE storage.buckets (
                    id integer PRIMARY KEY,
                    name text,
                    versioning_status text
                );
                INSERT INTO storage.buckets VALUES (1, 'uploads', 'enabled');
                CREATE TABLE storage.objects (
                    id integer PRIMARY KEY,
                    name text,
                    custom_marker text,
                    archived_at timestamptz,
                    is_delete_marker boolean,
                    is_versioned boolean
                );
                INSERT INTO storage.objects VALUES (
                    1,
                    'a.txt',
                    'same',
                    '2026-08-21 00:00:00+00',
                    true,
                    true
                );
                """,
                harness.catalog_target,
            )
            source = json.loads(harness.psql(cutover._lib.DATA_SQL, harness.catalog_source))
            candidate = json.loads(harness.psql(cutover._lib.DATA_SQL, harness.catalog_target))
            cutover.compare_data_snapshots(source, candidate)

            harness.psql(
                "UPDATE storage.objects SET custom_marker = 'changed';",
                harness.catalog_target,
            )
            changed = json.loads(harness.psql(cutover._lib.DATA_SQL, harness.catalog_target))
            with self.assertRaisesRegex(cutover.CutoverError, "data snapshot"):
                cutover.compare_data_snapshots(source, changed)
        finally:
            harness.stop()

    def test_catalog_sql_executes_and_fingerprints_dependencies(self) -> None:
        harness = EphemeralPostgresHarness()
        try:
            harness.start()
            harness.psql(
                """
                CREATE DATABASE aura_cutover_catalog_source;
                CREATE DATABASE aura_cutover_catalog_target;
                """
            )
            topology = """
                CREATE SCHEMA app;
                CREATE TABLE app.parent (id integer PRIMARY KEY);
                CREATE TABLE app.child (
                    id integer PRIMARY KEY,
                    parent_id integer NOT NULL,
                    CONSTRAINT child_parent_fk
                        FOREIGN KEY (parent_id) REFERENCES app.parent(id)
                );
                CREATE INDEX child_parent_idx ON app.child(parent_id);
            """
            target_topology = """
                CREATE SCHEMA app;
                CREATE TABLE app.parent (noise text, id integer PRIMARY KEY);
                CREATE TABLE app.child (
                    noise text,
                    id integer PRIMARY KEY,
                    parent_id integer NOT NULL,
                    CONSTRAINT child_parent_fk
                        FOREIGN KEY (parent_id) REFERENCES app.parent(id)
                );
                CREATE INDEX child_parent_idx ON app.child(parent_id);
            """
            harness.psql(
                """
                CREATE SCHEMA oid_shift;
                CREATE TABLE oid_shift.noise (id integer PRIMARY KEY);
                CREATE INDEX noise_idx ON oid_shift.noise(id);
                CREATE SEQUENCE oid_shift.noise_sequence;
                """,
                harness.catalog_target,
            )
            harness.psql(topology, harness.catalog_source)
            harness.psql(target_topology, harness.catalog_target)

            relation_oid_sql = """
                SELECT c.oid
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'app' AND c.relname = 'child';
            """
            self.assertNotEqual(
                harness.psql(relation_oid_sql, harness.catalog_source),
                harness.psql(relation_oid_sql, harness.catalog_target),
                "the harness must allocate different relation OIDs",
            )

            def dependencies(database: str) -> list[tuple[str, str]]:
                objects = json.loads(harness.psql(cutover._lib.CATALOG_SQL, database))
                self.assertIsInstance(objects, list)
                self.assertTrue(objects)
                self.assertTrue(
                    all(
                        isinstance(item, dict)
                        and set(item) == {"kind", "schema_name", "object_name", "detail"}
                        for item in objects
                    )
                )
                rows = [
                    item
                    for item in objects
                    if item["kind"] == "dependency" and item["schema_name"] == "app"
                ]
                self.assertTrue(rows)
                self.assertTrue(
                    all(
                        set(item["detail"]) == {"dependency_type", "objsubid", "refobjsubid"}
                        for item in rows
                    )
                )
                return sorted(
                    (
                        item["object_name"],
                        json.dumps(item["detail"], sort_keys=True),
                    )
                    for item in rows
                )

            source_dependencies = dependencies(harness.catalog_source)
            target_dependencies = dependencies(harness.catalog_target)
            self.assertEqual(source_dependencies, target_dependencies)
            self.assertTrue(
                any(
                    object_name == "child_parent_idx->app.child"
                    for object_name, _detail in source_dependencies
                )
            )
            source_index_dependencies = [
                json.loads(detail)
                for object_name, detail in source_dependencies
                if object_name == "child_parent_idx->app.child"
            ]
            target_index_dependencies = [
                json.loads(detail)
                for object_name, detail in target_dependencies
                if object_name == "child_parent_idx->app.child"
            ]
            self.assertIn(
                "parent_id",
                [item["refobjsubid"] for item in source_index_dependencies],
            )
            self.assertIn(
                "parent_id",
                [item["refobjsubid"] for item in target_index_dependencies],
            )

            harness.psql(
                "DROP INDEX app.child_parent_idx; "
                "CREATE INDEX child_parent_idx ON app.child(id);",
                harness.catalog_target,
            )
            changed_dependencies = dependencies(harness.catalog_target)
            self.assertNotEqual(source_dependencies, changed_dependencies)
            self.assertTrue(
                any(
                    object_name == "child_parent_idx->app.child"
                    and "\"refobjsubid\": \"id\"" in detail
                    for object_name, detail in changed_dependencies
                )
            )
        finally:
            harness.stop()

    def test_candidate_database_owner_and_acl_contract_restores_exactly(self) -> None:
        harness = EphemeralPostgresHarness()
        try:
            harness.start()
            harness.psql(
                """
                CREATE ROLE aura_db_owner NOLOGIN;
                CREATE ROLE aura_db_reader NOLOGIN;
                CREATE DATABASE aura_contract_source OWNER aura_db_owner;
                SET ROLE aura_db_owner;
                GRANT CONNECT, TEMPORARY ON DATABASE aura_contract_source
                    TO aura_db_reader;
                RESET ROLE;
                CREATE DATABASE aura_contract_candidate
                    WITH OWNER aura_db_owner TEMPLATE aura_contract_source;
                """
            )
            source_contract = json.loads(
                harness.psql(cutover._lib.DATABASE_CONTRACT_SQL, "aura_contract_source")
            )
            expected = cutover._lib.renamed_database_contract(
                source_contract, "aura_contract_candidate", "candidate"
            )

            def routed_psql(
                sql: str,
                _path: Path,
                service: str,
                *,
                json_output: bool = False,
            ) -> object:
                database = (
                    "aura_contract_candidate"
                    if service == "candidate"
                    else "postgres"
                )
                output = harness.psql(sql, database)
                return json.loads(output) if json_output else output

            with mock.patch.object(cutover._lib, "psql", side_effect=routed_psql):
                restored = cutover._lib.restore_database_contract(
                    Path("unused"), "candidate", expected
                )
            self.assertEqual(restored, expected)
            self.assertEqual(
                json.loads(
                    harness.psql(
                        cutover._lib.DATABASE_CONTRACT_SQL,
                        "aura_contract_candidate",
                    )
                ),
                expected,
            )
        finally:
            harness.stop()

    def test_public_data_only_restore_preserves_schema_and_publication(self) -> None:
        harness = EphemeralPostgresHarness()
        try:
            harness.start()
            harness.psql(
                """
                CREATE DATABASE aura_restore_source;
                CREATE DATABASE aura_restore_target;
                """
            )
            harness.psql(
                """
                CREATE TABLE public.library_items (
                    id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                    title text NOT NULL
                );
                INSERT INTO public.library_items(title) VALUES ('source row');
                """,
                "aura_restore_source",
            )
            harness.psql(
                """
                CREATE TABLE public.library_items (
                    id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                    title text NOT NULL
                );
                INSERT INTO public.library_items(title) VALUES ('stale row');
                CREATE SCHEMA target_only;
                CREATE TABLE target_only.keep_me(id integer PRIMARY KEY);
                CREATE PUBLICATION aura_keep_publication
                    FOR TABLE public.library_items;
                """,
                "aura_restore_target",
            )
            archive = "/tmp/aura-public-data.dump"
            subprocess.run(
                [
                    harness.docker,
                    "exec",
                    harness.name,
                    "pg_dump",
                    "-U",
                    "postgres",
                    "-d",
                    "aura_restore_source",
                    "--format=custom",
                    "--data-only",
                    "--schema=public",
                    f"--file={archive}",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            listing = subprocess.run(
                [harness.docker, "exec", harness.name, "pg_restore", "--list", archive],
                check=True,
                capture_output=True,
                text=True,
            ).stdout
            cutover._lib.validate_archive("public", listing)
            harness.psql(
                "TRUNCATE TABLE public.library_items RESTART IDENTITY;",
                "aura_restore_target",
            )
            subprocess.run(
                [
                    harness.docker,
                    "exec",
                    harness.name,
                    "pg_restore",
                    "-U",
                    "postgres",
                    "-d",
                    "aura_restore_target",
                    "--data-only",
                    "--disable-triggers",
                    "--exit-on-error",
                    "--single-transaction",
                    archive,
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            self.assertEqual(
                harness.psql(
                    "SELECT title FROM public.library_items;", "aura_restore_target"
                ),
                "source row",
            )
            self.assertEqual(
                harness.psql(
                    "SELECT to_regclass('target_only.keep_me') IS NOT NULL;",
                    "aura_restore_target",
                ),
                "t",
            )
            self.assertEqual(
                harness.psql(
                    "SELECT count(*) FROM pg_publication "
                    "WHERE pubname = 'aura_keep_publication';",
                    "aura_restore_target",
                ),
                "1",
            )
        finally:
            harness.stop()


if __name__ == "__main__":
    unittest.main()
