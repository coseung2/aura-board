from __future__ import annotations

import datetime as dt
import importlib.util
import io
import json
import os
import stat
import subprocess
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).parents[1] / "create-bastion-session.py"
SPEC = importlib.util.spec_from_file_location("create_bastion_session", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise AssertionError("could not load create-bastion-session.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


TENANCY_ID = "ocid1.tenancy.oc1..tenancy-test"
INSTANCE_ID = "ocid1.instance.oc1.ap-osaka-1.instance-test"
BASTION_ID = "ocid1.bastion.oc1.ap-osaka-1.bastion-test"
SESSION_ID = "ocid1.bastionsession.oc1.ap-osaka-1.session-test"
PRIVATE_IP = "10.0.0.17"
KEY_CONTENT = "ssh-rsa AAAATEST operator-key-content"
CREATED_AT = "2026-08-20T00:00:00Z"


def arguments(key_file: Path, output_file: Path) -> list[str]:
    return [
        "--profile",
        "operator",
        "--region",
        "ap-osaka-1",
        "--instance-name",
        "aura-board-a1",
        "--bastion-name",
        "auraboardbastion",
        "--session-name",
        "aura-board-bastion-auto",
        "--ssh-public-key-file",
        str(key_file),
        "--output-file",
        str(output_file),
        "--minimum-remaining-seconds",
        "1200",
    ]


class FakeOCI:
    def __init__(self, sessions: list[dict] | None, empty_session_list: bool = False):
        self.sessions = sessions
        self.empty_session_list = empty_session_list
        self.argvs: list[list[str]] = []
        self.create_called = False

    def __call__(self, argv: list[str]) -> str:
        self.argvs.append(list(argv))
        command = tuple(argv[1:4])
        if command == ("compute", "instance", "list"):
            return json.dumps({"data": [{"id": INSTANCE_ID, "lifecycle-state": "RUNNING"}]})
        if command == ("compute", "vnic-attachment", "list"):
            return json.dumps(
                {
                    "data": [
                        {
                            "nic-index": 0,
                            "vnic-id": "ocid1.vnic.oc1.ap-osaka-1.vnic-test",
                            "lifecycle-state": "ATTACHED",
                        }
                    ]
                }
            )
        if command == ("network", "vnic", "get"):
            return json.dumps({"data": {"is-primary": True, "private-ip": PRIVATE_IP}})
        if command == ("bastion", "bastion", "list"):
            return json.dumps({"data": [{"id": BASTION_ID, "lifecycle-state": "ACTIVE"}]})
        if command == ("bastion", "bastion", "get"):
            return json.dumps({"data": {"max-session-ttl-in-seconds": 3600}})
        if command == ("bastion", "session", "list"):
            return "" if self.empty_session_list else json.dumps({"data": self.sessions or []})
        if command == ("bastion", "session", "create-port-forwarding"):
            self.create_called = True
            return json.dumps({"data": {"id": SESSION_ID}})
        if command == ("bastion", "session", "get"):
            return json.dumps(
                {
                    "data": {
                        "id": SESSION_ID,
                        "lifecycle-state": "ACTIVE",
                        "time-created": CREATED_AT,
                        "session-ttl-in-seconds": 3600,
                    }
                }
            )
        raise AssertionError(f"unexpected OCI command: {argv}")


class CreateBastionSessionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary_directory.name)
        self.config_file = self.directory / "oci-config"
        self.config_file.write_text(f"[operator]\ntenancy={TENANCY_ID}\n", encoding="utf-8")
        self.key_file = self.directory / "operator.pub"
        self.key_file.write_text(KEY_CONTENT, encoding="utf-8")
        self.output_file = self.directory / "nested" / "session.json"
        self.environment = patch.dict(
            os.environ, {"OCI_CLI_CONFIG_FILE": str(self.config_file)}
        )
        self.environment.start()

    def tearDown(self) -> None:
        self.environment.stop()
        self.temporary_directory.cleanup()

    def run_main(self, fake: FakeOCI) -> tuple[int, str, str]:
        stdout = io.StringIO()
        stderr = io.StringIO()
        with patch.object(MODULE, "run_oci", side_effect=fake):
            with redirect_stdout(stdout), redirect_stderr(stderr):
                result = MODULE.main(arguments(self.key_file, self.output_file))
        return result, stdout.getvalue(), stderr.getvalue()

    def assert_no_sensitive_output(self, output: str) -> None:
        self.assertNotIn(SESSION_ID, output)
        self.assertNotIn(PRIVATE_IP, output)
        self.assertNotIn(KEY_CONTENT, output)

    def test_reuses_newest_active_session_without_create_or_sensitive_output(self) -> None:
        recent = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=300)).isoformat()
        recent = recent.replace("+00:00", "Z")
        fake = FakeOCI(
            sessions=[
                {"id": SESSION_ID, "lifecycle-state": "ACTIVE", "time-created": recent}
            ]
        )

        result, stdout, stderr = self.run_main(fake)

        self.assertEqual(result, 0)
        self.assertIn("[bastion-session] reused\n", stdout)
        self.assertIn("[bastion-session] active\n", stdout)
        self.assertIn(str(self.output_file), stdout)
        self.assertEqual(stderr, "")
        self.assert_no_sensitive_output(stdout + stderr)
        self.assertFalse(fake.create_called)
        self.assertTrue(all(KEY_CONTENT not in argv for argv in fake.argvs))
        self.assertEqual(
            json.loads(self.output_file.read_text(encoding="utf-8")),
            {
                "bastion_host": "host.bastion.ap-osaka-1.oci.oraclecloud.com",
                "bastion_id": BASTION_ID,
                "bastion_name": "auraboardbastion",
                "expires_at": "2026-08-20T01:00:00Z",
                "lifecycle_state": "ACTIVE",
                "region": "ap-osaka-1",
                "schema_version": 1,
                "session_id": SESSION_ID,
                "session_ttl_in_seconds": 3600,
                "target_instance_id": INSTANCE_ID,
                "target_port": 22,
                "target_private_ip": PRIVATE_IP,
                "time_created": CREATED_AT,
            },
        )

    def test_creates_from_empty_successful_list_and_writes_exact_atomic_metadata(self) -> None:
        fake = FakeOCI(sessions=None, empty_session_list=True)

        result, stdout, stderr = self.run_main(fake)

        self.assertEqual(result, 0)
        self.assertIn("[bastion-session] created\n", stdout)
        self.assertIn("[bastion-session] active\n", stdout)
        self.assertEqual(stderr, "")
        self.assert_no_sensitive_output(stdout + stderr)
        self.assertTrue(fake.create_called)

        create_argv = next(
            argv
            for argv in fake.argvs
            if tuple(argv[1:4]) == ("bastion", "session", "create-port-forwarding")
        )
        self.assertIn(str(self.key_file), create_argv)
        self.assertNotIn(KEY_CONTENT, create_argv)
        self.assertIn(PRIVATE_IP, create_argv)
        self.assertIn(INSTANCE_ID, create_argv)
        self.assertEqual(create_argv[create_argv.index("--session-ttl") + 1], "3600")

        expected = {
            "bastion_host": "host.bastion.ap-osaka-1.oci.oraclecloud.com",
            "bastion_id": BASTION_ID,
            "bastion_name": "auraboardbastion",
            "expires_at": "2026-08-20T01:00:00Z",
            "lifecycle_state": "ACTIVE",
            "region": "ap-osaka-1",
            "schema_version": 1,
            "session_id": SESSION_ID,
            "session_ttl_in_seconds": 3600,
            "target_instance_id": INSTANCE_ID,
            "target_port": 22,
            "target_private_ip": PRIVATE_IP,
            "time_created": CREATED_AT,
        }
        self.assertEqual(json.loads(self.output_file.read_text(encoding="utf-8")), expected)
        if os.name != "nt":
            self.assertEqual(stat.S_IMODE(self.output_file.stat().st_mode), 0o600)
        self.assertEqual(list(self.output_file.parent.glob(".bastion-session-*")), [])

    def test_nonzero_empty_oci_output_is_failure_and_stderr_is_not_exposed(self) -> None:
        def failed_run(*args, **kwargs):
            self.assertIsInstance(args[0], list)
            self.assertNotIn("shell", kwargs)
            self.assertEqual(kwargs["timeout"], 45)
            return subprocess.CompletedProcess(
                args=args[0],
                returncode=1,
                stdout="",
                stderr=f"failed {SESSION_ID} {PRIVATE_IP} {KEY_CONTENT}",
            )

        with patch.object(MODULE.subprocess, "run", side_effect=failed_run):
            with self.assertRaises(MODULE.OperatorError) as raised:
                MODULE.OciClient("operator", "ap-osaka-1").json(
                    "bastion", "session", "list", allow_empty_list=True
                )
        self.assertEqual(str(raised.exception), "OCI command failed")
        self.assert_no_sensitive_output(str(raised.exception))

    def test_multiple_resources_fail_without_sensitive_error(self) -> None:
        for resource in ("instance", "bastion"):
            with self.subTest(resource=resource):
                fake = FakeOCI(sessions=[])
                original = fake

                def multiple_resources(argv: list[str]) -> str:
                    result = original(argv)
                    if resource == "instance" and tuple(argv[1:4]) == (
                        "compute",
                        "instance",
                        "list",
                    ):
                        return json.dumps(
                            {
                                "data": [
                                    {"id": INSTANCE_ID, "lifecycle-state": "RUNNING"},
                                    {
                                        "id": INSTANCE_ID + "-second",
                                        "lifecycle-state": "RUNNING",
                                    },
                                ]
                            }
                        )
                    if resource == "bastion" and tuple(argv[1:4]) == (
                        "bastion",
                        "bastion",
                        "list",
                    ):
                        return json.dumps(
                            {
                                "data": [
                                    {"id": BASTION_ID, "lifecycle-state": "ACTIVE"},
                                    {
                                        "id": BASTION_ID + "-second",
                                        "lifecycle-state": "ACTIVE",
                                    },
                                ]
                            }
                        )
                    return result

                stdout = io.StringIO()
                stderr = io.StringIO()
                with patch.object(MODULE, "run_oci", side_effect=multiple_resources):
                    with redirect_stdout(stdout), redirect_stderr(stderr):
                        result = MODULE.main(arguments(self.key_file, self.output_file))
                self.assertEqual(result, 1)
                self.assertEqual(stdout.getvalue(), "")
                self.assertIn("expected exactly one", stderr.getvalue())
                self.assert_no_sensitive_output(stderr.getvalue())

    def test_malformed_json_fails_without_echoing_payload(self) -> None:
        secret_payload = f"not-json {SESSION_ID} {PRIVATE_IP} {KEY_CONTENT}"
        with patch.object(MODULE, "run_oci", return_value=secret_payload):
            with self.assertRaises(MODULE.OperatorError) as raised:
                MODULE.OciClient("operator", "ap-osaka-1").json(
                    "bastion", "bastion", "get"
                )
        self.assertEqual(str(raised.exception), "OCI returned invalid JSON")
        self.assert_no_sensitive_output(str(raised.exception))

    def test_public_key_symlink_is_rejected_before_oci(self) -> None:
        symlink = self.directory / "linked.pub"
        try:
            symlink.symlink_to(self.key_file)
        except (OSError, NotImplementedError) as exc:
            self.skipTest(f"symlink creation unavailable: {exc}")

        stdout = io.StringIO()
        stderr = io.StringIO()
        with patch.object(MODULE, "run_oci", side_effect=AssertionError("OCI was called")):
            with redirect_stdout(stdout), redirect_stderr(stderr):
                result = MODULE.main(arguments(symlink, self.output_file))
        self.assertEqual(result, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("regular file", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
