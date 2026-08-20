from __future__ import annotations

import hashlib
import os
import shutil
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "restore-rehearsal.sh"


def bash_executable() -> str | None:
    discovered = shutil.which("bash")
    if discovered:
        return discovered
    if os.name == "nt":
        candidate = Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Git" / "bin" / "bash.exe"
        if candidate.is_file():
            return str(candidate)
    return None


@unittest.skipUnless(bash_executable(), "bash is required for restore rehearsal behavior tests")
class TestRestoreRehearsal(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(prefix="aura-restore-test-")
        self.root = Path(self.temp_dir.name)
        self.shims = self.root / "shims"
        self.shims.mkdir()
        self.log_path = self.root / "commands.log"
        self.fake_label_path = self.root / "fake-label"
        self.fake_staged_path = self.root / "fake-staged-path"
        self.fake_removed_path = self.root / "fake-removed"
        self.archive = self.root / "backup.dump"
        self.manifest = self.root / "backup.dump.sha256"
        self.check_sql = self.root / "check.sql"
        self.expected_archive = self.root / "expected.dump"
        self.archive.write_bytes(b"custom-format-fixture\n")
        self.expected_archive.write_bytes(self.archive.read_bytes())
        self._write_manifest()
        self.check_sql.write_bytes(b"SELECT 1;\n")
        self._write_shim(
            "timeout",
            r'''#!/usr/bin/env bash
printf 'timeout %s\n' "$*" >> "$FAKE_LOG"
while [[ "$1" == --* ]]; do
  shift
done
duration="$1"
shift
if [[ "${FAKE_TIMEOUT_RESTORE:-0}" == 1 && "$*" == *"docker exec"* && "$*" == *"pg_restore"* ]]; then
  exit 124
fi
"$@"
''',
        )
        self._write_shim(
            "sha256sum",
            r'''#!/usr/bin/env bash
printf 'sha256sum %s\n' "$*" >> "$FAKE_LOG"
exec "$REAL_SHA256SUM" "$@"
''',
        )
        self._write_shim(
            "pg_restore",
            r'''#!/usr/bin/env bash
printf 'pg_restore %s\n' "$*" >> "$FAKE_LOG"
if [[ "$1" == --list && "${FAKE_MUTATE_STAGED:-0}" == 1 ]]; then
  staged="${!#}"
  chmod u+w -- "$staged"
  printf 'mutated-staged-copy\n' > "$staged"
  chmod u-w -- "$staged"
fi
exit 0
''',
        )
        self._write_shim(
            "openssl",
            r'''#!/usr/bin/env bash
if [[ "$1" == rand && "$2" == -hex && "$3" == 32 ]]; then
  printf '%064d\n' 0
  exit 0
fi
exit 2
''',
        )
        self._write_shim(
            "docker",
            r'''#!/usr/bin/env bash
printf 'docker %s\n' "$*" >> "$FAKE_LOG"
if [[ "$1" == image && "$2" == inspect ]]; then
  if [[ "$*" == *"--format"* ]]; then
    printf 'postgres\n-D\n/etc/postgresql\n'
  fi
  [[ "${FAKE_IMAGE_PRESENT:-1}" == 1 ]]
  exit $?
fi
if [[ "$1" == pull ]]; then
  exit 0
fi
if [[ "$1" == run ]]; then
  label=""
  previous=""
  staged=""
  for argument in "$@"; do
    if [[ "$previous" == --label ]]; then
      label="$argument"
    fi
    if [[ "$argument" == type=bind,src=*,dst=/tmp/aura-restore.archive,readonly ]]; then
      staged="${argument#type=bind,src=}"
      staged="${staged%,dst=/tmp/aura-restore.archive,readonly}"
    fi
    if [[ "$argument" == type=bind,src=*,dst=/etc/postgresql-custom/pgsodium_root.key,readonly ]]; then
      key_path="${argument#type=bind,src=}"
      key_path="${key_path%,dst=/etc/postgresql-custom/pgsodium_root.key,readonly}"
      [[ "$(<"$key_path")" =~ ^[0-9a-f]{64}$ ]] || exit 22
      printf 'pgsodium-key-verified\n' >> "$FAKE_LOG"
    fi
    previous="$argument"
  done
  printf '%s\n' "${label#*=}" > "$FAKE_LABEL_FILE"
  printf '%s\n' "$staged" > "$FAKE_STAGED_FILE"
  if [[ "${FAKE_MUTATE_SOURCE:-0}" == 1 ]]; then
    printf 'mutated-source\n' > "$FAKE_ARCHIVE_SOURCE"
  fi
  if [[ "${FAKE_FAIL_START:-0}" == 1 ]]; then
    exit 19
  fi
  printf 'fake-container\n'
  exit 0
fi
if [[ "$1" == exec && "$*" == *pg_restore* ]]; then
  if [[ -n "${FAKE_EXPECTED_ARCHIVE:-}" ]]; then
    staged="$(<"$FAKE_STAGED_FILE")"
    if cmp -s "$staged" "$FAKE_EXPECTED_ARCHIVE"; then
      printf 'staged-archive-verified\n' >> "$FAKE_LOG"
    else
      exit 9
    fi
  fi
  if [[ "${FAKE_TIMEOUT_RESTORE:-0}" == 1 ]]; then
    exit 124
  fi
  if [[ "${FAKE_FAIL_RESTORE:-0}" == 1 ]]; then
    exit 7
  fi
  exit 0
fi
if [[ "$1" == exec ]]; then
  exit 0
fi
if [[ "$1" == container && "$2" == inspect ]]; then
  [[ ! -e "$FAKE_REMOVED_FILE" ]] || exit 1
  [[ "${FAKE_FAIL_INSPECT:-0}" != 1 ]] || exit 17
  label="$(<"$FAKE_LABEL_FILE")"
  if [[ "${FAKE_FOREIGN_LABEL:-0}" == 1 ]]; then
    label="foreign-owner"
  fi
  printf '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef %s\n' "$label"
  exit 0
fi
if [[ "$1" == container && "$2" == rm ]]; then
  [[ "${FAKE_FAIL_REMOVE:-0}" != 1 ]] || exit 18
  : > "$FAKE_REMOVED_FILE"
  exit 0
fi
exit 0
''',
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _write_manifest(self) -> None:
        digest = hashlib.sha256(self.archive.read_bytes()).hexdigest()
        self.manifest.write_bytes(f"{digest}  {self.archive.name}\n".encode("ascii"))

    def _write_shim(self, name: str, content: str) -> None:
        path = self.shims / name
        path.write_text(content, encoding="utf-8", newline="\n")
        path.chmod(stat.S_IRUSR | stat.S_IWUSR | stat.S_IXUSR)

    @staticmethod
    def _bash_path(path: Path) -> str:
        return path.as_posix()

    def _environment(self, **extra: str) -> dict[str, str]:
        environment = os.environ.copy()
        real_sha256sum = shutil.which("sha256sum")
        if real_sha256sum is None:
            self.skipTest("sha256sum is required for restore checksum behavior tests")
        environment.update(
            {
                "FAKE_LOG": self._bash_path(self.log_path),
                "FAKE_LABEL_FILE": self._bash_path(self.fake_label_path),
                "FAKE_STAGED_FILE": self._bash_path(self.fake_staged_path),
                "FAKE_REMOVED_FILE": self._bash_path(self.fake_removed_path),
                "FAKE_ARCHIVE_SOURCE": self._bash_path(self.archive),
                "REAL_SHA256SUM": real_sha256sum,
                "PATH": os.pathsep.join([self._bash_path(self.shims), environment.get("PATH", "")]),
            }
        )
        environment.update(extra)
        return environment

    def _run(self, *arguments: str, **environment: str) -> subprocess.CompletedProcess[str]:
        executable = bash_executable()
        assert executable is not None
        self.fake_removed_path.unlink(missing_ok=True)
        return subprocess.run(
            [executable, self._bash_path(SCRIPT), *arguments],
            cwd=self._bash_path(self.root),
            env=self._environment(**environment),
            capture_output=True,
            text=True,
            check=False,
        )

    def _log_lines(self) -> list[str]:
        if not self.log_path.exists():
            return []
        return self.log_path.read_text(encoding="utf-8").splitlines()

    def _base_arguments(self, mode: str = "dry-run") -> tuple[str, ...]:
        return (
            f"--{mode}",
            "--archive",
            self._bash_path(self.archive),
            "--manifest",
            self._bash_path(self.manifest),
        )

    def test_dry_run_verifies_staged_copy_without_docker(self) -> None:
        result = self._run(*self._base_arguments())

        self.assertEqual(
            result.returncode,
            0,
            f"{result.stderr}\nstdout={result.stdout!r}\nlog={self._log_lines()!r}",
        )
        lines = self._log_lines()
        self.assertTrue(any(line.startswith("pg_restore --list") for line in lines), lines)
        self.assertFalse(any(line.startswith("docker ") for line in lines))
        self.assertIn("stage=checksum-complete", result.stdout)
        self.assertIn("stage=dry-run-success", result.stdout)

    def test_write_uses_immutable_image_and_hardened_readonly_container(self) -> None:
        result = self._run(
            *self._base_arguments("write"),
            "--check-sql",
            self._bash_path(self.check_sql),
        )

        self.assertEqual(
            result.returncode,
            0,
            f"{result.stderr}\nstdout={result.stdout!r}\nlog={self._log_lines()!r}",
        )
        docker_lines = [line for line in self._log_lines() if line.startswith("docker ")]
        image_index = next(index for index, line in enumerate(docker_lines) if "image inspect" in line)
        run_index = next(index for index, line in enumerate(docker_lines) if line.startswith("docker run "))
        ready_index = next(index for index, line in enumerate(docker_lines) if "pg_isready" in line)
        create_index = next(index for index, line in enumerate(docker_lines) if "createdb" in line)
        restore_index = next(index for index, line in enumerate(docker_lines) if "pg_restore" in line)
        check_index = next(index for index, line in enumerate(docker_lines) if " psql " in f" {line} ")
        inspect_index = next(index for index, line in enumerate(docker_lines) if "container inspect" in line)
        remove_index = next(index for index, line in enumerate(docker_lines) if "container rm -f" in line)

        self.assertLess(image_index, run_index)
        self.assertLess(run_index, ready_index)
        self.assertLess(ready_index, create_index)
        self.assertLess(create_index, restore_index)
        self.assertLess(restore_index, check_index)
        self.assertLess(check_index, inspect_index)
        self.assertLess(inspect_index, remove_index)

        run_line = docker_lines[run_index]
        self.assertIn("supabase/postgres:17.6.1.136@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a", run_line)
        self.assertNotIn(self._bash_path(self.archive), run_line)
        for required in (
            "--network none",
            "--restart=no",
            "--read-only",
            "--cap-drop=ALL",
            "--cap-add=CHOWN",
            "--cap-add=DAC_OVERRIDE",
            "--cap-add=FOWNER",
            "--cap-add=SETGID",
            "--cap-add=SETUID",
            "--security-opt no-new-privileges:true",
            "--cpus=1.0",
            "--memory=1g",
            "--memory-swap=1g",
            "--pids-limit=256",
            "--tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m",
            "--mount type=bind,src=",
            "dst=/tmp/aura-restore.archive,readonly",
            "dst=/etc/postgresql-custom/pgsodium_root.key,readonly",
        ):
            self.assertIn(required, run_line)
        self.assertNotIn(" --publish ", f" {run_line} ")
        self.assertNotIn(" -p ", f" {run_line} ")
        self.assertIn("/tmp/aura-restore.archive", docker_lines[restore_index])
        self.assertIn("--set=ON_ERROR_STOP=1", docker_lines[check_index])
        self.assertIn("pgsodium-key-verified", self._log_lines())
        self.assertIn(
            "postgres -D /etc/postgresql -c cron.database_name=aura_restore_scratch",
            run_line,
        )

    def test_source_mutation_after_staging_does_not_change_restored_bytes(self) -> None:
        result = self._run(
            *self._base_arguments("write"),
            FAKE_MUTATE_SOURCE="1",
            FAKE_EXPECTED_ARCHIVE=self._bash_path(self.expected_archive),
        )

        self.assertEqual(
            result.returncode,
            0,
            f"{result.stderr}\nstdout={result.stdout!r}\nlog={self._log_lines()!r}",
        )
        self.assertEqual(self.archive.read_bytes(), b"mutated-source\n")
        self.assertIn("staged-archive-verified", self._log_lines())
        staged_path = Path(self.fake_staged_path.read_text(encoding="utf-8").strip())
        self.assertFalse(staged_path.exists(), "private staging directory must be cleaned")

    def test_staged_mutation_is_caught_before_docker_restore(self) -> None:
        result = self._run(*self._base_arguments(), FAKE_MUTATE_STAGED="1")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("reason=checksum", result.stderr)
        self.assertFalse(any(line.startswith("docker ") for line in self._log_lines()))

    def test_validated_resource_overrides_reach_docker(self) -> None:
        result = self._run(
            *self._base_arguments("write"),
            RESTORE_CPU_LIMIT="2.5",
            RESTORE_MEMORY_LIMIT="2g",
            RESTORE_MEMORY_SWAP_LIMIT="3g",
            RESTORE_PIDS_LIMIT="128",
            RESTORE_TMPFS_SIZE="32m",
            RESTORE_DATA_TMPFS_SIZE="4g",
            RESTORE_INTEGRITY_TIMEOUT_SECONDS="45",
            RESTORE_TIMEOUT_SECONDS="120",
            RESTORE_CLEANUP_TIMEOUT_SECONDS="15",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        run_line = next(line for line in self._log_lines() if line.startswith("docker run "))
        for required in (
            "--cpus=2.5",
            "--memory=2g",
            "--memory-swap=3g",
            "--pids-limit=128",
            "--tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m",
            "--tmpfs /var/lib/postgresql/data:rw,nosuid,nodev,size=4g",
        ):
            self.assertIn(required, run_line)

    def test_restore_failure_and_timeout_cleanup_owned_container(self) -> None:
        for environment, expected_reason in (
            ({"FAKE_FAIL_RESTORE": "1"}, "reason=restore"),
            ({"FAKE_TIMEOUT_RESTORE": "1"}, "reason=restore"),
        ):
            with self.subTest(environment=environment):
                self.log_path.unlink(missing_ok=True)
                result = self._run(*self._base_arguments("write"), **environment)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(expected_reason, result.stderr)
                lines = self._log_lines()
                self.assertTrue(any("container inspect" in line for line in lines), lines)
                self.assertTrue(any("container rm -f" in line for line in lines), lines)

    def test_failed_start_cleanup_and_foreign_container_is_not_removed(self) -> None:
        result = self._run(*self._base_arguments("write"), FAKE_FAIL_START="1")
        self.assertNotEqual(result.returncode, 0)
        lines = self._log_lines()
        self.assertTrue(any(line.startswith("docker run ") for line in lines), lines)
        self.assertTrue(any("container inspect" in line for line in lines), lines)
        self.assertTrue(any("container rm -f" in line for line in lines), lines)

        self.log_path.unlink(missing_ok=True)
        result = self._run(*self._base_arguments("write"), FAKE_FOREIGN_LABEL="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("reason=cleanup", result.stderr)
        lines = self._log_lines()
        self.assertTrue(any("container inspect" in line for line in lines), lines)
        self.assertFalse(any("container rm -f" in line for line in lines), lines)

    def test_cleanup_failure_changes_success_to_failure(self) -> None:
        for environment in ({"FAKE_FAIL_REMOVE": "1"}, {"FAKE_FAIL_INSPECT": "1"}):
            with self.subTest(environment=environment):
                self.log_path.unlink(missing_ok=True)
                result = self._run(*self._base_arguments("write"), **environment)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("reason=cleanup", result.stderr)

    def test_manifest_rejects_blank_extra_malformed_nul_and_bad_separators(self) -> None:
        valid_digest = hashlib.sha256(self.archive.read_bytes()).hexdigest().encode("ascii")
        valid = valid_digest + b"  " + self.archive.name.encode("ascii") + b"\n"
        invalid_manifests = (
            b"",
            valid + b"\n",
            b"0" * 64 + b" " + self.archive.name.encode("ascii") + b"\n",
            b"0" * 64 + b"\t " + self.archive.name.encode("ascii") + b"\n",
            b"0" * 64 + b"  wrong.dump\n",
            b"A" * 64 + b"  " + self.archive.name.encode("ascii") + b"\n",
            b"0" * 63 + b"g" + b"  " + self.archive.name.encode("ascii") + b"\n",
            b"0" * 63 + b"\x00" + b"  " + self.archive.name.encode("ascii") + b"\n",
        )
        for manifest in invalid_manifests:
            with self.subTest(manifest=manifest):
                self.manifest.write_bytes(manifest)
                result = self._run(*self._base_arguments())
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self._log_lines(), [])
                self._write_manifest()

    def test_symlink_and_unpinned_image_inputs_are_rejected(self) -> None:
        symlink_path = self.root / "backup-link.dump"
        try:
            symlink_path.symlink_to(self.archive)
        except (OSError, NotImplementedError) as error:
            self.skipTest(f"symlinks unavailable: {error}")

        result = self._run(
            "--dry-run",
            "--archive",
            self._bash_path(symlink_path),
            "--manifest",
            self._bash_path(self.manifest),
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self._log_lines(), [])

        output_manifest = self.root / "manifest-link.sha256"
        output_manifest.symlink_to(self.manifest)
        result = self._run(
            "--dry-run",
            "--archive",
            self._bash_path(self.archive),
            "--manifest",
            self._bash_path(output_manifest),
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self._log_lines(), [])

        result = self._run(
            *self._base_arguments("write"),
            "--image",
            "postgres:17-bookworm",
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self._log_lines(), [])

        result = self._run(
            *self._base_arguments("write"),
            "--image",
            "postgres:17-bookworm",
            "--unsafe-allow-unpinned-image",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("stage=unsafe-unpinned-image-override", result.stdout)

    def test_invalid_resource_limits_are_rejected(self) -> None:
        result = self._run(
            *self._base_arguments("write"),
            RESTORE_MEMORY_LIMIT="0g",
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self._log_lines(), [])

        result = self._run(
            *self._base_arguments("write"),
            RESTORE_TIMEOUT_SECONDS="999999999999999999999999999999",
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self._log_lines(), [])

        result = self._run(
            *self._base_arguments("write"),
            RESTORE_MEMORY_LIMIT="1g",
            RESTORE_MEMORY_SWAP_LIMIT="512m",
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self._log_lines(), [])


if __name__ == "__main__":
    unittest.main()
