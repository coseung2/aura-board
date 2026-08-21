from __future__ import annotations

import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock


MODULE_PATH = Path(__file__).parents[1] / "create-cutover-build-manifest.py"
SPEC = importlib.util.spec_from_file_location("create_cutover_build_manifest", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
manifest = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(manifest)


class BuildManifestTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.app_artifact = self.root / "server.js"
        self.engine_artifact = self.root / "play-server"
        self.bundle_artifact = self.root / "oracle-release.tar.gz"
        self.app_artifact.write_bytes(b"verified-app-build")
        self.engine_artifact.write_bytes(b"verified-engine-build")
        self.bundle_artifact.write_bytes(b"verified-final-bundle")
        self.output = self.root / "manifest.json"
        self.environment = {
            "NEXT_PUBLIC_SUPABASE_URL": "https://supabase.aura-board.com",
            "NEXT_PUBLIC_SUPABASE_ANON_KEY": "anon-value",
            "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": "anon-value",
        }

    def tearDown(self) -> None:
        self.temp.cleanup()

    def arguments(self, mode: str, bundle: bool = False) -> list[str]:
        arguments = [
            "--build-sha",
            "a" * 40,
            "--app-artifact",
            str(self.app_artifact),
            "--engine-artifact",
            str(self.engine_artifact),
            "--output",
            str(self.output),
            mode,
        ]
        if bundle:
            arguments[arguments.index("--output") : arguments.index("--output")] = [
                "--bundle-artifact",
                str(self.bundle_artifact),
            ]
        return arguments

    def test_dry_run_does_not_read_environment_or_artifacts(self) -> None:
        with (
            mock.patch.object(manifest, "regular_file", side_effect=AssertionError("file I/O")),
            mock.patch.dict(manifest.os.environ, {}, clear=True),
        ):
            self.assertEqual(manifest.run(self.arguments("--dry-run")), 0)
        self.assertFalse(self.output.exists())

    def test_write_binds_both_required_artifacts_without_outputting_values(self) -> None:
        stdout = io.StringIO()
        with (
            mock.patch.dict(manifest.os.environ, self.environment, clear=True),
            contextlib.redirect_stdout(stdout),
        ):
            self.assertEqual(manifest.run(self.arguments("--write")), 0)
        document = json.loads(self.output.read_text(encoding="utf-8"))
        self.assertEqual(
            set(document),
            {
                "format",
                "build_sha",
                "app_server_sha256",
                "play_server_sha256",
                "public_env_sha256",
            },
        )
        self.assertEqual(
            document["app_server_sha256"],
            hashlib.sha256(self.app_artifact.read_bytes()).hexdigest(),
        )
        self.assertEqual(
            document["play_server_sha256"],
            hashlib.sha256(self.engine_artifact.read_bytes()).hexdigest(),
        )
        self.assertEqual(set(document["public_env_sha256"]), set(manifest.PUBLIC_KEYS))
        rendered = stdout.getvalue()
        self.assertNotIn("anon-value", rendered)
        self.assertNotIn("supabase.aura-board.com", rendered)

    def test_optional_bundle_digest_is_bound_when_supplied(self) -> None:
        with mock.patch.dict(manifest.os.environ, self.environment, clear=True):
            self.assertEqual(manifest.run(self.arguments("--write", bundle=True)), 0)
        document = json.loads(self.output.read_text(encoding="utf-8"))
        self.assertEqual(
            document["bundle_sha256"],
            hashlib.sha256(self.bundle_artifact.read_bytes()).hexdigest(),
        )

    def test_both_artifacts_are_required(self) -> None:
        with self.assertRaises(SystemExit):
            manifest.parse_args(
                [
                    "--build-sha",
                    "a" * 40,
                    "--app-artifact",
                    str(self.app_artifact),
                    "--output",
                    str(self.output),
                    "--write",
                ]
            )
        with self.assertRaises(SystemExit):
            manifest.parse_args(
                [
                    "--build-sha",
                    "a" * 40,
                    "--engine-artifact",
                    str(self.engine_artifact),
                    "--output",
                    str(self.output),
                    "--write",
                ]
            )

    def test_missing_or_control_character_value_fails(self) -> None:
        for environment in (
            {},
            {**self.environment, "NEXT_PUBLIC_SUPABASE_ANON_KEY": "bad\nvalue"},
        ):
            with self.subTest(environment=environment):
                with mock.patch.dict(manifest.os.environ, environment, clear=True):
                    with self.assertRaises(manifest.ManifestError):
                        manifest.run(self.arguments("--write"))

    def test_output_symlink_is_rejected(self) -> None:
        target = self.root / "target.json"
        try:
            self.output.symlink_to(target)
        except OSError:
            self.skipTest("symlink creation unavailable")
        with mock.patch.dict(manifest.os.environ, self.environment, clear=True):
            with self.assertRaises(manifest.ManifestError):
                manifest.run(self.arguments("--write"))


class BuildScriptContractTests(unittest.TestCase):
    ROOT = Path(__file__).parents[1]

    def assert_manifest_after_both_artifacts(self, path: Path) -> None:
        text = path.read_text(encoding="utf-8")
        self.assertIn("AURA_BUILD_CUTOVER_MANIFEST", text)
        self.assertIn("--app-artifact", text)
        self.assertIn("--engine-artifact", text)
        self.assertNotIn("--artifact .next/standalone/server.js", text)
        build = text.index("cargo build --locked --release")
        generator = text.index("create-cutover-build-manifest.py")
        app_check = text.index("test -f .next/standalone/server.js")
        engine_check = text.index("test -f services/play-engine/target/release/play-server")
        self.assertLess(build, app_check)
        self.assertLess(build, engine_check)
        self.assertLess(app_check, generator)
        self.assertLess(engine_check, generator)
        self.assertIn("test -s .next/standalone/cutover-build-manifest.json", text)

    def test_ci_and_release_scripts_have_fatal_post_build_manifest_contract(self) -> None:
        self.assert_manifest_after_both_artifacts(self.ROOT / "build-ci-artifact.sh")
        self.assert_manifest_after_both_artifacts(self.ROOT / "build-release.sh")
        for name in ("build-ci-artifact.sh", "build-release.sh"):
            text = (self.ROOT / name).read_text(encoding="utf-8")
            self.assertIn("set -euo pipefail", text)


if __name__ == "__main__":
    unittest.main()
