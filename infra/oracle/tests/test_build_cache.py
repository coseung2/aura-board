"""Cache lifecycle and verification-gate contracts; no production credentials."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[3]
BASH = ("C:/Program Files/Git/bin/bash.exe" if os.name == "nt" else shutil.which("bash"))


class BuildCacheTests(unittest.TestCase):
    def test_verification_is_not_disabled(self):
        script = (ROOT / "infra/oracle/build-ci-artifact.sh").read_text()
        package = json.loads((ROOT / "package.json").read_text())
        self.assertEqual(package["scripts"]["postinstall"], "npm run prisma:generate")
        self.assertNotIn("--ignore-scripts", script)
        self.assertNotIn("npm run typecheck", script)
        self.assertNotIn("npm run build", script)
        for command in ("npm ci --include=dev", "npm run ensure-native", "npx prisma validate",
                        "node_modules/next/dist/bin/next build", "cargo test --locked", "cargo build --locked --release"):
            self.assertIn(command, script)
        self.assertNotIn("ignoreBuildErrors: true", (ROOT / "next.config.ts").read_text())

    def test_cache_only_enabled_on_existing_trusted_workflow(self):
        workflow = (ROOT / ".github/workflows/deploy-oracle.yml").read_text()
        self.assertIn("${{ runner.tool_cache }}/aura-board-build-cache-v1", workflow)
        self.assertIn("github.ref == 'refs/heads/main'", workflow)
        self.assertIn("cancel-in-progress: false", workflow)
        self.assertIn("clean: true", workflow)
        self.assertNotIn("pull_request:", workflow)

    @unittest.skipUnless(BASH, "bash unavailable")
    def test_cache_survives_fresh_checkout_and_invalidates_changed_inputs(self):
        with tempfile.TemporaryDirectory(prefix="aura-cache-test-") as directory:
            base = Path(directory)
            repo = base / "checkout"
            (repo / "services/play-engine").mkdir(parents=True)
            for name in ("package-lock.json", "next.config.ts", "tsconfig.json", "services/play-engine/Cargo.lock"):
                (repo / name).write_text("fixture")
            # Git Bash has no flock. Stub locking only on Windows; Linux CI uses real flock.
            locking = "flock() { :; };" if os.name == "nt" else ""
            script = locking + r'''
set -euo pipefail
node() { echo v22.0.0; }
rustc() { echo rustc-1.95.0-arm64; }
source "$1"
source_dir=$(pwd -P)
export AURA_BUILD_CACHE_ROOT="$(cd .. && pwd -P)/cache"
prepare_build_cache
first_web=$web_cache
first_engine=$CARGO_TARGET_DIR
echo cached > .next/cache/probe
save_build_cache
mv .next .next-previous
exec 9>&-
prepare_build_cache
test "$(cat .next/cache/probe)" = cached
test "$first_engine" = "$CARGO_TARGET_DIR"
test "$first_web" = "$web_cache"
echo changed >> package-lock.json
echo changed >> services/play-engine/Cargo.lock
exec 9>&-
prepare_build_cache
test "$first_web" != "$web_cache"
test "$first_engine" != "$CARGO_TARGET_DIR"
echo CACHE_LIFECYCLE_OK
'''
            result = subprocess.run([BASH, "-c", script, "test", str(ROOT / "infra/oracle/build-cache.sh")], cwd=repo, text=True, capture_output=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("CACHE_LIFECYCLE_OK", result.stdout)

    @unittest.skipUnless(BASH, "bash unavailable")
    def test_failed_web_build_cannot_reach_engine_or_packaging(self):
        with tempfile.TemporaryDirectory(prefix="aura-build-failure-") as directory:
            repo = Path(directory)
            (repo / "infra/oracle").mkdir(parents=True)
            (repo / "services/play-engine").mkdir(parents=True)
            (repo / "package-lock.json").write_text("{}")
            (repo / "services/play-engine/Cargo.lock").write_text("fixture")
            shutil.copyfile(ROOT / "infra/oracle/build-cache.sh", repo / "infra/oracle/build-cache.sh")
            script = r'''
set -euo pipefail
unset AURA_BUILD_CACHE_ROOT
npm() { echo "npm $*"; }
npx() { echo "npx $*"; }
node() { echo TYPECHECK_FAILED; return 17; }
cargo() { echo SHOULD_NOT_REACH_CARGO; }
set -- aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa output
source "$BUILD_SCRIPT"
'''
            result = subprocess.run([BASH, "-c", script], cwd=repo, env={**os.environ, "BUILD_SCRIPT": str(ROOT / "infra/oracle/build-ci-artifact.sh")}, text=True, capture_output=True, timeout=10)
            self.assertEqual(result.returncode, 17, result.stdout + result.stderr)
            self.assertNotIn("SHOULD_NOT_REACH_CARGO", result.stdout)
            self.assertFalse((repo / "output").exists())

    @unittest.skipUnless(BASH, "bash unavailable")
    def test_rejects_cache_inside_checkout(self):
        with tempfile.TemporaryDirectory(prefix="aura-cache-reject-") as directory:
            result = subprocess.run([BASH, "-c", 'set -e; source "$1"; source_dir=$(pwd -P); AURA_BUILD_CACHE_ROOT="$source_dir/cache"; prepare_build_cache', "test", str(ROOT / "infra/oracle/build-cache.sh")], cwd=directory, text=True, capture_output=True, timeout=10)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("outside the checkout", result.stderr)


if __name__ == "__main__":
    unittest.main()
