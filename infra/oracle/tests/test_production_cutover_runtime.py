from __future__ import annotations

import contextlib
import errno
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import os
import stat
import subprocess
import tempfile
import types
import unittest
from unittest import mock


MODULE_PATH = Path(__file__).resolve().parents[1] / "production-cutover-runtime.py"
SPEC = importlib.util.spec_from_file_location("production_cutover_runtime", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
runtime = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runtime)
import production_cutover_runtime_lib as lib  # noqa: E402

DB_LIB_PATH = MODULE_PATH.parent / "supabase-selfhost" / "production_cutover_db_lib.py"
DB_LIB_SPEC = importlib.util.spec_from_file_location(
    "production_cutover_db_lib_for_runtime_test", DB_LIB_PATH
)
assert DB_LIB_SPEC is not None and DB_LIB_SPEC.loader is not None
db_lib = importlib.util.module_from_spec(DB_LIB_SPEC)
DB_LIB_SPEC.loader.exec_module(db_lib)


def invoke(arguments: list[str]) -> tuple[int, str, str]:
    stdout = io.StringIO()
    stderr = io.StringIO()
    with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
        code = runtime.main(arguments)
    return code, stdout.getvalue(), stderr.getvalue()


@unittest.skipUnless(
    os.name == "nt" or os.geteuid() == 0,
    "production env fixtures are root-owned on POSIX",
)
class ProductionCutoverRuntimeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.state = self.root / "state"
        self.state.mkdir()
        self.state.chmod(0o700)
        self.app = self.root / "app.env"
        self.backup = self.root / "oracle-backup.env"
        self.selfhost = self.root / "selfhost.env"
        self.db = self.root / "promotion-manifest.json"
        self.rich_db = self.root / "journal.json"
        self.manifest = self.root / "next-build-manifest.json"
        self.app_release = self.root / ("app-release-" + ("d" * 40))
        self.engine_release = self.root / ("engine-release-" + ("d" * 40))
        self.build_sha = "d" * 40
        self.app_old = (
            b"# preserve this comment\n"
            b"DATABASE_URL=managed-db\n"
            b"DIRECT_URL=managed-direct\n"
            b"SUPABASE_URL=https://old.example\n"
            b"NEXT_PUBLIC_SUPABASE_URL=https://old.example\n"
            b"NEXT_PUBLIC_SUPABASE_ANON_KEY=old-anon\n"
            b"NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=old-publish\n"
            b"SUPABASE_SERVICE_ROLE_KEY=old-service\n"
            b"UNRELATED_APP=preserve-me\n"
        )
        self.backup_old = (
            b"# backup comment\n"
            b"BACKUP_SOURCE=managed-supabase\n"
            b"DATABASE_URL=managed-backup\n"
            b"OCI_BUCKET_NAME=preserve-bucket\n"
        )
        self.selfhost_text = (
            b"DATABASE_URL=postgresql://selfhost:db-secret@127.0.0.1:15432/postgres\n"
            b"DIRECT_URL=postgresql://selfhost:db-secret@127.0.0.1:15432/postgres\n"
            b"ANON_KEY=anon-secret\n"
            b"SERVICE_ROLE_KEY=service-secret\n"
        )
        self.write_file(self.app, self.app_old, 0o640)
        self.write_file(self.backup, self.backup_old, 0o640)
        self.write_file(self.selfhost, self.selfhost_text, 0o600)
        self.app_release.mkdir(mode=0o755)
        self.engine_release.mkdir(mode=0o755)
        self.write_file(self.app_release / "server.js", b"deployed-app-server", 0o644)
        self.write_file(self.engine_release / "play-server", b"deployed-play-server", 0o755)
        marker = f"{self.build_sha}\n".encode()
        self.write_file(self.app_release / ".release-complete", marker, 0o444)
        self.write_file(self.engine_release / ".release-complete", marker, 0o444)
        self.write_file(self.rich_db, self.rich_bytes(self.valid_rich()), 0o600)
        self.write_file(self.db, self.db_bytes(self.valid_db()), 0o600)
        self.write_file(self.manifest, self.manifest_bytes(), 0o600)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def write_file(self, path: Path, content: bytes, mode: int) -> None:
        path.write_bytes(content)
        path.chmod(mode)

    def db_bytes(self, document: dict[str, object]) -> bytes:
        return (json.dumps(document, sort_keys=True) + "\n").encode()

    def rich_bytes(self, document: dict[str, object]) -> bytes:
        return self.db_bytes(document)

    def valid_identity(self, name: str) -> dict[str, object]:
        return {
            "database": name,
            "server_address": "127.0.0.1",
            "server_port": 5432,
            "system_identifier": f"{name}-system",
        }

    def valid_rich(self) -> dict[str, object]:
        return {
            "format": 2,
            "phase": "promotion-complete",
            "fence": {"engaged": True},
        }

    def valid_db(self) -> dict[str, object]:
        return {
            "format": 1,
            "phase": "promotion-complete",
            "fence": {"engaged": True},
            "artifacts": {
                "public": {"file": "public.dump", "sha256": "a" * 64, "size": 10},
                "auth": {"file": "auth.dump", "sha256": "b" * 64, "size": 20},
                "storage": {
                    "file": "storage-metadata.dump",
                    "sha256": "c" * 64,
                    "size": 30,
                },
            },
            "source_identity": self.valid_identity("source"),
            "target_identity": self.valid_identity("target"),
            "candidate_identity": self.valid_identity("candidate"),
            "promotion_rollback_db": "target__aura_rollback",
            "db_journal_sha256": hashlib.sha256(self.rich_db.read_bytes()).hexdigest(),
        }

    def manifest_bytes(self) -> bytes:
        app_values, _ = lib.build_target_values(self.selfhost_text)
        document = {
            "format": 1,
            "build_sha": self.build_sha,
            "app_server_sha256": hashlib.sha256(
                (self.app_release / "server.js").read_bytes()
            ).hexdigest(),
            "play_server_sha256": hashlib.sha256(
                (self.engine_release / "play-server").read_bytes()
            ).hexdigest(),
            "public_env_sha256": lib.public_build_hashes(app_values),
        }
        return (json.dumps(document, sort_keys=True) + "\n").encode()

    def write_db(self, document: dict[str, object]) -> None:
        self.write_file(self.db, self.db_bytes(document), 0o600)

    def write_rich(self, document: dict[str, object]) -> None:
        self.write_file(self.rich_db, self.rich_bytes(document), 0o600)

    def write_manifest(self, document: dict[str, object]) -> None:
        self.write_file(
            self.manifest,
            (json.dumps(document, sort_keys=True) + "\n").encode(),
            0o600,
        )

    def test_db_promotion_manifest_contract_is_shared(self) -> None:
        document = self.valid_db()
        self.assertEqual(db_lib.validate_promotion_manifest(document), document)
        rich = self.valid_rich()
        rich_snapshot = lib.read_snapshot(self.rich_db, "rich DB", lib.JOURNAL_MODE)
        lib.require_db_gate(document, rich, rich_snapshot)

        partial = dict(document)
        partial["phase"] = "promotion-started"
        with self.assertRaises(db_lib.CutoverError):
            db_lib.validate_promotion_manifest(partial)
        with self.assertRaises(lib.CutoverError):
            lib.require_db_gate(partial, rich, rich_snapshot)

    def args(self, action: str, manifest: bool = True) -> list[str]:
        arguments = [
            "--db-promotion-manifest",
            str(self.db),
            "--db-rich-journal",
            str(self.rich_db),
            "--app-env",
            str(self.app),
            "--backup-env",
            str(self.backup),
            "--selfhost-env",
            str(self.selfhost),
            "--state-dir",
            str(self.state),
        ]
        if manifest:
            arguments.extend(("--build-manifest", str(self.manifest)))
        if action == "--seal-before-writers":
            arguments.extend(
                (
                    "--deployed-app-release",
                    str(self.app_release),
                    "--deployed-engine-release",
                    str(self.engine_release),
                    "--required-stopped-service",
                    "aura-board-app.service",
                    "--required-stopped-service",
                    "aura-play-engine.service",
                )
            )
        arguments.append(action)
        return arguments

    def run_write(self) -> tuple[int, str, str]:
        return invoke(self.args("--write"))

    def state_path(self) -> Path:
        return self.state / lib.STATE_FILENAME

    def test_write_requires_build_manifest(self) -> None:
        code, _output, error = invoke(self.args("--write", manifest=False))
        self.assertNotEqual(code, 0)
        self.assertIn("--build-manifest is mandatory", error)
        self.assertEqual(list(self.state.iterdir()), [])
        self.assertEqual(self.app.read_bytes(), self.app_old)

    def test_write_rejects_runtime_only_or_mismatched_build(self) -> None:
        document = json.loads(self.manifest.read_text())
        document["public_env_sha256"]["NEXT_PUBLIC_SUPABASE_URL"] = "f" * 64
        self.write_manifest(document)
        code, _output, error = self.run_write()
        self.assertNotEqual(code, 0)
        self.assertIn("do not match self-host target", error)
        self.assertEqual(list(self.state.iterdir()), [])

    def test_uppercase_build_digest_is_rejected(self) -> None:
        document = json.loads(self.manifest.read_text())
        document["app_server_sha256"] = document["app_server_sha256"].upper()
        self.write_manifest(document)
        code, _output, error = self.run_write()
        self.assertNotEqual(code, 0)
        self.assertIn("SHA-256 digest", error)

        self.write_file(self.manifest, self.manifest_bytes(), 0o600)
        db_document = self.valid_db()
        db_document["db_journal_sha256"] = db_document["db_journal_sha256"].upper()
        self.write_db(db_document)
        code, _output, error = self.run_write()
        self.assertNotEqual(code, 0)
        self.assertIn("DB promotion manifest", error)

    def test_stale_rich_journal_rejects_promotion_manifest(self) -> None:
        rich = self.valid_rich()
        rich["stale_marker"] = True
        self.write_rich(rich)
        code, _output, error = self.run_write()
        self.assertNotEqual(code, 0)
        self.assertIn("stale DB promotion manifest", error)
        self.assertEqual(list(self.state.iterdir()), [])

    def test_build_manifest_rejects_legacy_aliases_and_extra_fields(self) -> None:
        document = json.loads(self.manifest.read_text())
        document["build_sha256"] = document.pop("build_sha")
        self.write_manifest(document)
        code, _output, error = self.run_write()
        self.assertNotEqual(code, 0)
        self.assertIn("current format", error)
        document = json.loads(self.manifest.read_text())
        document["build_sha"] = "d" * 40
        document["unexpected"] = True
        self.write_manifest(document)
        code, _output, error = self.run_write()
        self.assertNotEqual(code, 0)
        self.assertIn("current format", error)

    def test_db_journal_requires_exact_promotion_contract(self) -> None:
        cases = []
        old = self.valid_db()
        old["phase"] = "restore-complete"
        cases.append(old)
        string_fence = self.valid_db()
        string_fence["fence"] = "engaged"
        cases.append(string_fence)
        missing_auth = self.valid_db()
        del missing_auth["artifacts"]["auth"]
        cases.append(missing_auth)
        legacy = self.valid_db()
        legacy["verified_artifact_digests"] = {"dump": "a" * 64}
        cases.append(legacy)
        no_rollback = self.valid_db()
        no_rollback["promotion_rollback_db"] = {"recorded": False}
        cases.append(no_rollback)
        for document in cases:
            with self.subTest(document=document):
                self.write_db(document)
                code, _output, error = self.run_write()
                self.assertNotEqual(code, 0)
                self.assertIn("DB promotion manifest", error)
                self.assertEqual(list(self.state.iterdir()), [])
                self.assertEqual(self.app.read_bytes(), self.app_old)

    def test_write_records_metadata_only_and_requires_fresh_build_gate(self) -> None:
        app_before = lib.read_snapshot(self.app, "app", lib.APP_MODE)
        backup_before = lib.read_snapshot(self.backup, "backup", lib.BACKUP_MODE)
        code, output, error = self.run_write()
        self.assertEqual(code, 0, error)
        self.assertIn("fresh-next-build-required", output)
        self.assertIn("write->build/deploy-gate->seal-before-writers->start-services", output)
        state_text = self.state_path().read_text()
        self.assertNotIn("db-secret", state_text)
        self.assertNotIn("anon-secret", state_text)
        self.assertNotIn("service-secret", state_text)
        state = json.loads(state_text)
        self.assertEqual(state["phase"], "written")
        self.assertEqual(state["targets"]["app_env"]["old"]["sha256"], app_before.sha256)
        self.assertEqual(state["targets"]["backup_env"]["old"]["sha256"], backup_before.sha256)
        for name, snapshot in (("app_env", app_before), ("backup_env", backup_before)):
            record = state["targets"][name]["old"]
            self.assertEqual(record["uid"], snapshot.metadata.uid)
            self.assertEqual(record["gid"], snapshot.metadata.gid)
            self.assertEqual(record["mode"], snapshot.metadata.mode)
        self.assertEqual(lib.read_snapshot(self.app, "app", lib.APP_MODE).metadata, app_before.metadata)
        self.assertEqual(lib.read_snapshot(self.backup, "backup", lib.BACKUP_MODE).metadata, backup_before.metadata)

    def test_fchown_and_fchmod_receive_original_uid_gid_mode(self) -> None:
        if os.name == "nt":
            self.skipTest("POSIX metadata syscalls are unavailable on Windows")
        before = lib.read_snapshot(self.app, "app", lib.APP_MODE)
        with (
            mock.patch.object(lib.os, "fchown", wraps=lib.os.fchown) as fchown,
            mock.patch.object(lib.os, "fchmod", wraps=lib.os.fchmod) as fchmod,
        ):
            lib.atomic_replace(self.app, b"replacement\n", before.metadata)
        self.assertTrue(any(call.args[1:] == (before.metadata.uid, before.metadata.gid) for call in fchown.call_args_list))
        self.assertTrue(any(call.args[1] == before.metadata.mode for call in fchmod.call_args_list))
        fake = types.SimpleNamespace(st_uid=123, st_gid=456, st_mode=stat.S_IFREG | 0o640)
        metadata = lib.FileMetadata.from_stat(fake)
        self.assertEqual((metadata.uid, metadata.gid, metadata.mode), (123, 456, 0o640))

    def test_second_write_replacement_failure_restores_both_bytes_and_metadata(self) -> None:
        before = (
            lib.read_snapshot(self.app, "app", lib.APP_MODE),
            lib.read_snapshot(self.backup, "backup", lib.BACKUP_MODE),
        )
        real_replace = lib.atomic_replace
        failed = False

        def fail_second(path: Path, content: bytes, metadata: object = None) -> None:
            nonlocal failed
            if Path(path) == self.backup and not failed:
                failed = True
                raise OSError(errno.EIO, "injected second replacement failure")
            real_replace(path, content, metadata)

        with mock.patch.object(lib, "atomic_replace", side_effect=fail_second):
            code, _output, error = self.run_write()
        self.assertNotEqual(code, 0)
        self.assertIn("restored", error)
        self.assertEqual(lib.read_snapshot(self.app, "app", lib.APP_MODE), before[0])
        self.assertEqual(lib.read_snapshot(self.backup, "backup", lib.BACKUP_MODE), before[1])
        self.assertEqual(list(self.state.iterdir()), [])

    def test_rollback_restores_exact_files_before_seal(self) -> None:
        app_before = lib.read_snapshot(self.app, "app", lib.APP_MODE)
        backup_before = lib.read_snapshot(self.backup, "backup", lib.BACKUP_MODE)
        code, _output, error = self.run_write()
        self.assertEqual(code, 0, error)
        code, output, error = invoke(self.args("--rollback", manifest=False))
        self.assertEqual(code, 0, error)
        self.assertIn("rollback=complete", output)
        self.assertEqual(lib.read_snapshot(self.app, "app", lib.APP_MODE), app_before)
        self.assertEqual(lib.read_snapshot(self.backup, "backup", lib.BACKUP_MODE), backup_before)
        self.assertEqual(json.loads(self.state_path().read_text())["phase"], "rolled_back")

    def test_second_rollback_replacement_failure_compensates_to_written_state(self) -> None:
        code, _output, error = self.run_write()
        self.assertEqual(code, 0, error)
        written = (
            lib.read_snapshot(self.app, "app", lib.APP_MODE),
            lib.read_snapshot(self.backup, "backup", lib.BACKUP_MODE),
        )
        real_replace = lib.atomic_replace
        failed = False

        def fail_second_rollback(path: Path, content: bytes, metadata: object = None) -> None:
            nonlocal failed
            if Path(path) == self.backup and content == self.backup_old and not failed:
                failed = True
                raise OSError(errno.EIO, "injected second rollback replacement failure")
            real_replace(path, content, metadata)

        with mock.patch.object(lib, "atomic_replace", side_effect=fail_second_rollback):
            code, _output, error = invoke(self.args("--rollback", manifest=False))
        self.assertNotEqual(code, 0)
        self.assertIn("restored", error)
        self.assertEqual(lib.read_snapshot(self.app, "app", lib.APP_MODE), written[0])
        self.assertEqual(lib.read_snapshot(self.backup, "backup", lib.BACKUP_MODE), written[1])
        self.assertEqual(json.loads(self.state_path().read_text())["phase"], "written")

    def test_seal_before_writers_permanently_refuses_rollback(self) -> None:
        code, _output, error = self.run_write()
        self.assertEqual(code, 0, error)
        with mock.patch.object(
            lib.subprocess,
            "run",
            return_value=subprocess.CompletedProcess(
                ["systemctl"], 3, stdout="inactive\n", stderr=""
            ),
        ):
            code, output, error = invoke(self.args("--seal-before-writers"))
        self.assertEqual(code, 0, error)
        self.assertIn("seal-before-writers=complete", output)
        self.assertIn("rollback=permanently-blocked", output)
        state = json.loads(self.state_path().read_text())
        self.assertEqual(state["phase"], "sealed")
        self.assertTrue(state["sealed"])
        code, _output, error = invoke(self.args("--rollback", manifest=False))
        self.assertNotEqual(code, 0)
        self.assertIn("permanently blocked", error)

    def test_seal_rejects_wrong_deployed_release_sha(self) -> None:
        code, _output, error = self.run_write()
        self.assertEqual(code, 0, error)
        if os.name == "nt":
            self.app_release.joinpath(".release-complete").chmod(0o666)
        self.write_file(
            self.app_release / ".release-complete",
            ("e" * 40 + "\n").encode(),
            0o444,
        )
        with mock.patch.object(
            lib.subprocess,
            "run",
            return_value=subprocess.CompletedProcess(
                ["systemctl"], 3, stdout="inactive\n", stderr=""
            ),
        ):
            code, _output, error = invoke(self.args("--seal-before-writers"))
        self.assertNotEqual(code, 0)
        self.assertIn(".release-complete does not match build_sha", error)

    def test_seal_rejects_wrong_deployed_app_digest(self) -> None:
        code, _output, error = self.run_write()
        self.assertEqual(code, 0, error)
        self.write_file(self.app_release / "server.js", b"tampered-app", 0o644)
        with mock.patch.object(
            lib.subprocess,
            "run",
            return_value=subprocess.CompletedProcess(
                ["systemctl"], 3, stdout="inactive\n", stderr=""
            ),
        ):
            code, _output, error = invoke(self.args("--seal-before-writers"))
        self.assertNotEqual(code, 0)
        self.assertIn("deployed app server.js digest", error)

    def test_seal_rejects_wrong_deployed_engine_digest(self) -> None:
        code, _output, error = self.run_write()
        self.assertEqual(code, 0, error)
        self.write_file(self.engine_release / "play-server", b"tampered-engine", 0o755)
        with mock.patch.object(
            lib.subprocess,
            "run",
            return_value=subprocess.CompletedProcess(
                ["systemctl"], 3, stdout="inactive\n", stderr=""
            ),
        ):
            code, _output, error = invoke(self.args("--seal-before-writers"))
        self.assertNotEqual(code, 0)
        self.assertIn("deployed play-server digest", error)

    def test_seal_rejects_active_required_service(self) -> None:
        code, _output, error = self.run_write()
        self.assertEqual(code, 0, error)
        result = subprocess.CompletedProcess(
            ["systemctl", "is-active", "aura-board-app.service"],
            0,
            stdout="active\n",
            stderr="",
        )
        with mock.patch.object(lib.subprocess, "run", return_value=result) as run:
            code, _output, error = invoke(self.args("--seal-before-writers"))
        self.assertNotEqual(code, 0)
        self.assertIn("required stopped service is active", error)
        self.assertEqual(json.loads(self.state_path().read_text())["phase"], "written")
        self.assertEqual(run.call_args.args[0][:2], ["systemctl", "is-active"])

    def test_seal_rejects_systemctl_transport_error(self) -> None:
        code, _output, error = self.run_write()
        self.assertEqual(code, 0, error)
        with mock.patch.object(lib.subprocess, "run", side_effect=OSError("no systemctl")):
            code, _output, error = invoke(self.args("--seal-before-writers"))
        self.assertNotEqual(code, 0)
        self.assertIn("systemctl is-active failed", error)

    def test_seal_requires_deployed_releases_and_explicit_services(self) -> None:
        arguments = [
            "--db-promotion-manifest",
            str(self.db),
            "--db-rich-journal",
            str(self.rich_db),
            "--app-env",
            str(self.app),
            "--backup-env",
            str(self.backup),
            "--selfhost-env",
            str(self.selfhost),
            "--state-dir",
            str(self.state),
            "--build-manifest",
            str(self.manifest),
            "--seal-before-writers",
        ]
        code, _output, error = invoke(arguments)
        self.assertNotEqual(code, 0)
        self.assertIn("deployed-app-release", error)

    def test_journal_failure_after_write_compensates(self) -> None:
        real_write_state = lib.write_state

        def fail_written_journal(path: Path, payload: dict[str, object]) -> None:
            if payload["phase"] == "written":
                raise OSError(errno.EIO, "injected journal failure")
            real_write_state(path, payload)

        with mock.patch.object(lib, "write_state", side_effect=fail_written_journal):
            code, _output, error = self.run_write()
        self.assertNotEqual(code, 0)
        self.assertIn("restored", error)
        self.assertEqual(self.app.read_bytes(), self.app_old)
        self.assertEqual(self.backup.read_bytes(), self.backup_old)
        self.assertEqual(list(self.state.iterdir()), [])

    def test_symlink_and_mode_checks_remain_strict(self) -> None:
        link = self.root / "app-link.env"
        try:
            link.symlink_to(self.app)
        except (OSError, NotImplementedError):
            self.skipTest("symlink creation is unavailable")
        arguments = self.args("--dry-run", manifest=False)
        arguments[arguments.index(str(self.app))] = str(link)
        code, _output, error = invoke(arguments)
        self.assertNotEqual(code, 0)
        self.assertIn("symlink", error)
        if os.name != "nt":
            self.app.chmod(0o600)
            code, _output, error = invoke(self.args("--dry-run", manifest=False))
            self.assertNotEqual(code, 0)
            self.assertIn("mode 0640", error)


if __name__ == "__main__":
    unittest.main()
