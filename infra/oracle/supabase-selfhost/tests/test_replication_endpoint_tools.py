from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[4]
SELFHOST = ROOT / "infra" / "oracle" / "supabase-selfhost"
SCRIPT = SELFHOST / "install-replication-endpoint.sh"
NGINX_TEMPLATE = SELFHOST / "nginx-replication.conf.template"
HBA_TEMPLATE = SELFHOST / "pg-hba-replication.conf.template"
COMPOSE_TEMPLATE = SELFHOST / "docker-compose.replication.yml.template"
NSG = ROOT / "infra" / "oracle" / "nsg-replication-5432.json"


def bash_executable() -> str | None:
    found = shutil.which("bash")
    if found:
        return found
    if os.name == "nt":
        candidate = Path(r"C:\Program Files\Git\bin\bash.exe")
        if candidate.is_file():
            return str(candidate)
    return None


class StaticContractTests(unittest.TestCase):
    def test_rendered_nginx_contract(self) -> None:
        rendered = NGINX_TEMPLATE.read_text(encoding="utf-8")
        for old, new in {
            "__PRIVATE_IP__": "10.42.1.207",
            "__LISTEN_PORT__": "5432",
            "__DB_PORT__": "15433",
            "__CERT_DIR__": "/etc/letsencrypt/live/replication.example.com",
        }.items():
            rendered = rendered.replace(old, new)
        for expected in (
            "listen 10.42.1.207:5432 ssl",
            "proxy_pass 127.0.0.1:15433;",
            "ssl_alpn postgresql;",
            "ssl_protocols TLSv1.2 TLSv1.3;",
            "ssl_certificate /etc/letsencrypt/live/replication.example.com/fullchain.pem;",
            "ssl_certificate_key /etc/letsencrypt/live/replication.example.com/privkey.pem;",
            "proxy_connect_timeout 5s;",
            "proxy_timeout 1h;",
            "ssl_handshake_timeout 10s;",
            "so_keepalive=on",
        ):
            self.assertIn(expected, rendered)
        self.assertNotIn("location ", rendered)
        self.assertNotIn("proxy_pass http", rendered)

    def test_hba_order_contract(self) -> None:
        hba = HBA_TEMPLATE.read_text(encoding="utf-8")
        reject = "host all all __REPLICATION_GATEWAY__/32 reject"
        for token in (
            "local all supabase_admin trust",
            "local all all peer map=supabase_map",
            "host postgres __REPLICATION_ROLE__ __REPLICATION_GATEWAY__/32 scram-sha-256",
            "host replication __REPLICATION_ROLE__ __REPLICATION_GATEWAY__/32 scram-sha-256",
            "host all __REPLICATION_ROLE__ 0.0.0.0/0 reject",
            "host all __REPLICATION_ROLE__ ::/0 reject",
            reject,
            "host all all 172.16.0.0/12 scram-sha-256",
            "host all all 0.0.0.0/0 reject",
            "host all all ::/0 reject",
        ):
            self.assertIn(token, hba)
        reject_at = hba.index(reject)
        role_reject4_at = hba.index("host all __REPLICATION_ROLE__ 0.0.0.0/0 reject")
        role_reject6_at = hba.index("host all __REPLICATION_ROLE__ ::/0 reject")
        loopback4_at = hba.index("host all all 127.0.0.1/32 trust")
        loopback6_at = hba.index("host all all ::1/128 trust")
        self.assertLess(hba.index("host postgres"), reject_at)
        self.assertLess(hba.index("host replication"), reject_at)
        self.assertLess(hba.index("host postgres"), role_reject4_at)
        self.assertLess(hba.index("host replication"), role_reject4_at)
        self.assertLess(role_reject4_at, role_reject6_at)
        self.assertLess(role_reject6_at, reject_at)
        self.assertLess(reject_at, loopback4_at)
        self.assertLess(loopback4_at, loopback6_at)
        self.assertLess(loopback6_at, hba.index("host all all 172.16.0.0/12"))
        self.assertLess(reject_at, hba.index("host all all 172.16.0.0/12"))
        self.assertLess(
            hba.index("host all all 172.16.0.0/12"),
            hba.index("host all all 0.0.0.0/0 reject"),
        )

    def test_compose_nsg_and_line_counts(self) -> None:
        compose = COMPOSE_TEMPLATE.read_text(encoding="utf-8")
        self.assertIn("127.0.0.1:15433:5432/tcp", compose)
        self.assertNotIn("volumes:", compose)
        artifact = json.loads(NSG.read_text(encoding="utf-8"))
        self.assertEqual(len(artifact), 1)
        self.assertEqual(artifact[0]["direction"], "INGRESS")
        self.assertEqual(artifact[0]["protocol"], "6")
        self.assertEqual(artifact[0]["sourceType"], "CIDR_BLOCK")
        self.assertEqual(artifact[0]["source"], "0.0.0.0/0")
        self.assertEqual(artifact[0]["tcpOptions"]["destinationPortRange"], {"min": 5432, "max": 5432})
        for path in (SCRIPT, NGINX_TEMPLATE, HBA_TEMPLATE, COMPOSE_TEMPLATE, NSG):
            text = path.read_text(encoding="utf-8")
            self.assertNotRegex(text, r"ocid[0-9a-z_.-]+")
            self.assertLessEqual(len(text.splitlines()), 800, path.name)

    def test_installer_is_explicit_and_does_not_handle_passwords(self) -> None:
        script = SCRIPT.read_text(encoding="utf-8")
        for expected in (
            "set -Eeuo pipefail",
            "MODE='dry-run'",
            "--domain",
            "--private-ip",
            "--rollback",
            "docker compose",
            "pg_hba_file_rules",
            "current_setting('hba_file')",
            "HBA_CONTAINER_PATH",
            "REPLICATION_MAX_CONNECTIONS:-3",
            "stream { include %s/*.conf; }",
            "NGINX_STREAM_BOOTSTRAP_PATH",
            "iptables-save",
            '"$NGINX_BIN" -t',
            "sudo apt-get install nginx-full libnginx-mod-stream",
            "atomic_install",
            "ROLLBACK_STATE_DIR",
            "durable rollback",
            "-d \"$PRIVATE_IP\"",
            "^2[0-9][0-9]$",
            "firewall_scope_preflight",
            ".aura-replication-install.XXXXXX",
            '"$INSTALL_BIN" -o root -g root',
            '"$MV_BIN" -f --',
        ):
            self.assertIn(expected, script)
        self.assertNotRegex(script, r"CREATE ROLE|ALTER ROLE|rolpassword|PGPASSWORD|password")
        self.assertNotIn("security-rule-id=", script)


class InstallerSubprocessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.bash = bash_executable()

    def setUp(self) -> None:
        if not self.bash:
            self.skipTest("bash is unavailable on this worker")
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.supabase = self.root / "supabase"
        (self.supabase / "volumes" / "db").mkdir(parents=True)
        self.db_config = self.root / "db-config"
        (self.db_config / "conf.d").mkdir(parents=True)
        (self.supabase / "docker-compose.yml").write_text("services:\n  db:\n    image: postgres:17\n", encoding="utf-8")
        self.stream_dir = self.root / "stream.d"
        self.stream_dir.mkdir()
        self.modules_enabled = self.root / "modules-enabled"
        self.modules_enabled.mkdir()
        self.nginx_main = self.root / "nginx.conf"
        self.nginx_main.write_text(
            "events {}\nhttp {}\ninclude /etc/nginx/aura-board-replication-stream.conf;\n",
            encoding="utf-8",
        )
        self.sites_available = self.root / "sites-available"
        self.sites_enabled = self.root / "sites-enabled"
        self.sites_available.mkdir()
        self.sites_enabled.mkdir()
        self.letsencrypt = self.root / "letsencrypt"
        (self.letsencrypt / "accounts").mkdir(parents=True)
        self.firewall_parent = self.root / "iptables"
        self.firewall_parent.mkdir()
        self.module = self.root / "ngx_stream_module.so"
        self.module.write_bytes(b"module")
        self.log = self.root / "commands.log"
        self.marker = self.root / "iptables-rule"
        self._write_shims()

    @staticmethod
    def bash_path(path: Path | str) -> str:
        value = str(path)
        if os.name != "nt":
            return value
        drive, tail = os.path.splitdrive(value)
        tail = tail.replace("\\", "/")
        return f"/{drive[0].lower()}{tail}"

    def tearDown(self) -> None:
        self.temp.cleanup()

    def _write_executable(self, name: str, body: str) -> None:
        path = self.bin / name
        path.write_text(body, encoding="utf-8")
        path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    def _write_shims(self) -> None:
        self._write_executable("uname", "#!/usr/bin/env bash\nprintf 'aarch64\\n'\n")
        self._write_executable("install", """#!/usr/bin/env bash
+printf 'install %s\\n' "$*" >> "$COMMAND_LOG"
+exec /usr/bin/install "$@"
+""".replace("\n+", "\n"))
        self._write_executable("nginx", """#!/usr/bin/env bash
+printf 'nginx %s\\n' "$*" >> "$COMMAND_LOG"
+if [[ "$1" == "-V" ]]; then printf 'nginx version --with-stream\\n' >&2; exit 0; fi
+if [[ "$1" == "-T" ]]; then printf 'include %s/*.conf;\\n' "$NGINX_STREAM_DIR"; exit 0; fi
+if [[ "$1" == "-t" && "$FAIL_STAGE" == "nginx" ]]; then exit 19; fi
+exit 0
+""".replace("\n+", "\n"))
        self._write_executable("systemctl", """#!/usr/bin/env bash
+printf 'systemctl %s\\n' "$*" >> "$COMMAND_LOG"
+[[ "$FAIL_STAGE" == "reload" && "$*" == "reload nginx" ]] && exit 29
+exit 0
+""".replace("\n+", "\n"))
        self._write_executable("curl", """#!/usr/bin/env bash
+printf 'curl %s\\n' "$*" >> "$COMMAND_LOG"
+if [[ "$*" == *"/api/health"* ]]; then printf '%s' "${APP_HEALTH_STATUS:-200}"; else printf '200'; fi
+""".replace("\n+", "\n"))
        self._write_executable("getent", "#!/usr/bin/env bash\nprintf '198.51.100.7 STREAM\\n'\n")
        self._write_executable("ss", """#!/usr/bin/env bash
+if [[ "$*" == *":15433"* ]]; then printf 'LISTEN 0 128 127.0.0.1:15433 0.0.0.0:*\\n'; elif [[ "$FAIL_STAGE" == "listener-extra" ]]; then printf 'LISTEN 0 128 10.42.1.207:5432 0.0.0.0:*\\nLISTEN 0 128 192.168.1.10:5432 0.0.0.0:*\\n'; else printf 'LISTEN 0 128 10.42.1.207:5432 0.0.0.0:*\\n'; fi
+""".replace("\n+", "\n"))
        self._write_executable("certbot", """#!/usr/bin/env bash
+printf 'certbot %s\\n' "$*" >> "$COMMAND_LOG"
+[[ "$FAIL_STAGE" == "certbot" ]] && exit 17
+mkdir -p "$CERT_DIR"
+printf cert > "$CERT_DIR/fullchain.pem"
+printf key > "$CERT_DIR/privkey.pem"
+""".replace("\n+", "\n"))
        self._write_executable("docker", """#!/usr/bin/env bash
+printf 'docker %s\\n' "$*" >> "$COMMAND_LOG"
+[[ "$FAIL_STAGE" == "compose" && "$*" == *" config --quiet"* ]] && exit 23
+[[ "$FAIL_STAGE" == "compose-up" && "$*" == *" up -d --force-recreate --wait db"* ]] && exit 24
+[[ "$*" == *"pg_isready"* ]] && exit 0
+if [[ "$*" == *"psql"* ]]; then
+  if [[ "$*" == *"pg_hba_file_rules"* ]]; then printf '%s\\n' "$HBA_RESULT"; else printf 'ok\\n'; fi
+fi
+exit 0
+""".replace("\n+", "\n"))
        self._write_executable("iptables", """#!/usr/bin/env bash
+printf 'iptables %s\\n' "$*" >> "$COMMAND_LOG"
+if [[ "$1" == "-L" ]]; then
+  printf 'Chain INPUT (policy DROP)\\n'
+  printf '1 ACCEPT tcp -- 0.0.0.0/0 0.0.0.0/0 tcp dpt:22\\n'
+  if [[ "$FAIL_STAGE" == "firewall-legacy" ]]; then printf '2 ACCEPT tcp -- 0.0.0.0/0 0.0.0.0/0 tcp dpt:5432\\n3 REJECT all -- 0.0.0.0/0 0.0.0.0/0 reject-with icmp-port-unreachable\\n'; elif [[ -e "$IPTABLES_MARKER" ]]; then printf '2 ACCEPT tcp -- 0.0.0.0/0 %s tcp dpt:5432\\n3 REJECT all -- 0.0.0.0/0 0.0.0.0/0 reject-with icmp-port-unreachable\\n' "$PRIVATE_IP"; else printf '2 REJECT all -- 0.0.0.0/0 0.0.0.0/0 reject-with icmp-port-unreachable\\n'; fi
+  exit 0
+fi
+if [[ "$1" == "-C" ]]; then [[ -e "$IPTABLES_MARKER" ]]; exit $?; fi
+if [[ "$1" == "-I" ]]; then touch "$IPTABLES_MARKER"; exit 0; fi
+if [[ "$1" == "-D" ]]; then rm -f "$IPTABLES_MARKER"; exit 0; fi
+exit 0
+""".replace("\n+", "\n"))
        self._write_executable("iptables-save", """#!/usr/bin/env bash
+count=0
+[[ -f "$IPTABLES_SAVE_COUNT" ]] && count=$(< "$IPTABLES_SAVE_COUNT")
+count=$((count + 1)); printf '%s' "$count" > "$IPTABLES_SAVE_COUNT"
+if [[ "$FAIL_STAGE" == "firewall-persist" && "$count" -ge 4 ]]; then exit 31; fi
+if [[ "$FAIL_STAGE" == "firewall-legacy" ]]; then rule='-A INPUT -p tcp --dport 5432 -j ACCEPT'; elif [[ "$FAIL_STAGE" == "firewall-range" ]]; then rule='-A CUSTOM -p tcp --dport 5000:6000 -j ACCEPT'; elif [[ "$FAIL_STAGE" == "firewall-multiport" ]]; then rule='-A CUSTOM -p tcp -m multiport --dports 22,5432 -j ACCEPT'; elif [[ "$FAIL_STAGE" == "firewall-private-multiport" ]]; then rule="-A CUSTOM -d $PRIVATE_IP -p tcp -m multiport --dports 22,5432 -j ACCEPT"; [[ -e "$IPTABLES_MARKER" ]] && rule="$rule"$'\\n'"-A INPUT -d $PRIVATE_IP -p tcp -m conntrack --ctstate NEW,ESTABLISHED -m tcp --dport 5432 -j ACCEPT"; elif [[ -e "$IPTABLES_MARKER" ]]; then rule="-A INPUT -d $PRIVATE_IP -p tcp -m conntrack --ctstate NEW,ESTABLISHED -m tcp --dport 5432 -j ACCEPT"; else rule=''; fi
+printf '%s\\n' '*filter' "$rule" 'COMMIT'
+""".replace("\n+", "\n"))
        self._write_executable("cp", """#!/usr/bin/env bash
+count=0
+[[ -f "$CP_COUNT" ]] && count=$(< "$CP_COUNT")
+count=$((count + 1)); printf '%s' "$count" > "$CP_COUNT"
+[[ "$FAIL_STAGE" == "backup" && "$count" -ge 2 ]] && exit 41
+exec /bin/cp "$@"
+""".replace("\n+", "\n"))

    def env(self, fail_stage: str = "") -> dict[str, str]:
        env = os.environ.copy()
        env.update({
            "PATH": str(self.bin) + os.pathsep + env.get("PATH", ""),
            "SUPABASE_ROOT": str(self.supabase),
            "DB_CONFIG_ROOT": str(self.db_config),
            "COMPOSE_BASE_PATH": str(self.supabase / "docker-compose.yml"),
            "COMPOSE_OVERRIDE_PATH": str(self.supabase / "docker-compose.replication.yml"),
            "HBA_PATH": str(self.db_config / "pg_hba-replication.conf"),
            "POSTGRES_OVERRIDE_PATH": str(self.db_config / "conf.d/replication-endpoint.conf"),
            "NGINX_STREAM_DIR": str(self.stream_dir),
            "NGINX_STREAM_PATH": str(self.stream_dir / "aura-board-replication.conf"),
            "NGINX_STREAM_BOOTSTRAP_PATH": str(self.modules_enabled / "60-aura-board-replication-stream.conf"),
            "NGINX_MAIN_PATH": str(self.nginx_main),
            "NGINX_ACME_CONFIG_PATH": str(self.sites_available / "replication-acme.conf"),
            "NGINX_ACME_LINK_PATH": str(self.sites_enabled / "replication-acme.conf"),
            "ACME_WEBROOT": str(self.root / "certbot"),
            "LETSENCRYPT_CONFIG_DIR": str(self.letsencrypt),
            "CERT_DIR": str(self.letsencrypt / "live/replication.example.com"),
            "RENEWAL_HOOK_PATH": str(self.letsencrypt / "renewal-hooks/deploy/replication.sh"),
            "FIREWALL_RULES_PATH": str(self.firewall_parent / "rules.v4"),
            "ROLLBACK_STATE_DIR": str(self.root / "rollback-state"),
            "NGINX_STREAM_MODULE_PATH": str(self.module),
            "NGINX_BIN": "nginx",
            "CERTBOT_BIN": "certbot",
            "SYSTEMCTL_BIN": "systemctl",
            "DOCKER_BIN": "docker",
            "IPTABLES_BIN": "iptables",
            "IPTABLES_SAVE_BIN": "iptables-save",
            "SS_BIN": "ss",
            "GETENT_BIN": "getent",
            "UNAME_BIN": str(self.bin / "uname"),
            "COMMAND_LOG": str(self.log),
            "IPTABLES_MARKER": str(self.marker),
            "IPTABLES_SAVE_COUNT": str(self.root / "iptables-save-count"),
            "CP_COUNT": str(self.root / "cp-count"),
            "PRIVATE_IP": "10.42.1.207",
            "APP_HEALTH_STATUS": "200",
            "TMPDIR": str(self.root / "tmp"),
        })
        Path(self.root / "tmp").mkdir(exist_ok=True)
        if os.name == "nt":
            for key in (
                "SUPABASE_ROOT", "DB_CONFIG_ROOT", "COMPOSE_BASE_PATH", "COMPOSE_OVERRIDE_PATH",
                "HBA_PATH", "POSTGRES_OVERRIDE_PATH", "NGINX_STREAM_DIR", "NGINX_STREAM_PATH",
                "NGINX_STREAM_BOOTSTRAP_PATH", "NGINX_MAIN_PATH", "NGINX_ACME_CONFIG_PATH",
                "NGINX_ACME_LINK_PATH", "ACME_WEBROOT", "LETSENCRYPT_CONFIG_DIR", "CERT_DIR",
                "RENEWAL_HOOK_PATH", "FIREWALL_RULES_PATH", "ROLLBACK_STATE_DIR",
                "NGINX_STREAM_MODULE_PATH", "COMMAND_LOG", "IPTABLES_MARKER", "IPTABLES_SAVE_COUNT",
                "CP_COUNT", "TMPDIR",
            ):
                env[key] = self.bash_path(env[key])
            env["PATH"] = f"{self.bash_path(self.bin)}:/usr/bin:/bin"
            env["UNAME_BIN"] = self.bash_path(self.bin / "uname")
        if fail_stage:
            env["FAIL_STAGE"] = fail_stage
        else:
            env["FAIL_STAGE"] = ""
        env["HBA_RESULT"] = "ok"
        return env

    def execute(self, mode: str, env: dict[str, str], extra: list[str] | None = None) -> subprocess.CompletedProcess[str]:
        argv = [self.bash, self.bash_path(SCRIPT)]
        if mode:
            argv.append(mode)
        argv.extend(["--domain", "replication.example.com", "--private-ip", "10.42.1.207"])
        if extra:
            argv.extend(extra)
        return subprocess.run(argv, env=env, capture_output=True, text=True, check=False)

    def require_posix_root(self) -> None:
        if os.name == "nt" or os.geteuid() != 0:
            self.skipTest("write behavior requires a root POSIX worker")

    def test_dry_run_is_default_and_has_no_write_commands(self) -> None:
        result = self.execute("", self.env())
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("no writes", result.stdout)
        self.assertFalse((self.supabase / "docker-compose.replication.yml").exists())
        self.assertFalse((self.db_config / "pg_hba-replication.conf").exists())
        log = self.log.read_text(encoding="utf-8")
        for forbidden in ("certbot", "docker", "systemctl", "iptables", "curl"):
            self.assertNotIn(forbidden, log)

    def test_invalid_domain_ip_path_and_symlink_fail(self) -> None:
        for extra in (
            ["--domain", "bad_domain.example.com"],
            ["--private-ip", "192.0.2.1"],
            ["--private-ip", "10.42.1.999"],
        ):
            result = self.execute("--dry-run", self.env(), extra)
            self.assertNotEqual(result.returncode, 0)
        if os.name != "nt":
            link_root = self.root / "linked-root"
            link_root.symlink_to(self.supabase, target_is_directory=True)
            env = self.env()
            env["SUPABASE_ROOT"] = str(link_root)
            result = self.execute("--dry-run", env)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("symlink", result.stderr)

    def test_invalid_port_and_control_character_fail_without_writes(self) -> None:
        env = self.env()
        env["REPLICATION_LISTEN_PORT"] = "5433"
        result = self.execute("", env)
        self.assertNotEqual(result.returncode, 0)
        result = self.execute("", self.env(), ["--domain", "replication\nexample.com"])
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.supabase / "docker-compose.replication.yml").exists())

    def test_standard_certbot_live_file_symlinks_are_accepted(self) -> None:
        if os.name == "nt":
            self.skipTest("symlink fixture requires POSIX semantics")
        archive = self.letsencrypt / "archive" / "replication.example.com"
        live = self.letsencrypt / "live" / "replication.example.com"
        archive.mkdir(parents=True)
        live.mkdir(parents=True)
        for name in ("fullchain.pem", "privkey.pem"):
            (archive / name).write_text(name, encoding="utf-8")
            (live / name).symlink_to(Path("../../archive/replication.example.com") / name)
        env = self.env()
        env["CERT_DIR"] = str(live)
        result = self.execute("--dry-run", env)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_partial_backup_failure_preserves_uncaptured_existing_file(self) -> None:
        self.require_posix_root()
        override = self.supabase / "docker-compose.replication.yml"
        hba = self.db_config / "pg_hba-replication.conf"
        override.write_text("prior compose\n", encoding="utf-8")
        hba.write_text("prior hba\n", encoding="utf-8")
        result = self.execute("--write", self.env("backup"))
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(override.read_text(encoding="utf-8"), "prior compose\n")
        self.assertEqual(hba.read_text(encoding="utf-8"), "prior hba\n")

    def test_wrong_existing_mode_fails_before_state_or_endpoint_writes(self) -> None:
        self.require_posix_root()
        hba = self.db_config / "pg_hba-replication.conf"
        hba.write_text("prior hba\n", encoding="utf-8")
        hba.chmod(0o600)
        result = self.execute("--write", self.env())
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("mode 644", result.stderr)
        self.assertFalse((self.root / "rollback-state").exists())
        self.assertNotIn("docker ", self.log.read_text(encoding="utf-8"))

    def test_pending_precedes_mutation_and_failed_recovery_is_retryable(self) -> None:
        self.require_posix_root()
        env = self.env("certbot")
        env["APP_HEALTH_STATUS"] = "503"
        failed = self.execute("--write", env)
        self.assertNotEqual(failed.returncode, 0)
        state = self.root / "rollback-state"
        pending = state / "pending"
        self.assertTrue(pending.exists())
        log = self.log.read_text(encoding="utf-8")
        self.assertLess(log.index("pending.data"), log.index("compose.override"))

        blocked = self.execute("--write", self.env())
        self.assertNotEqual(blocked.returncode, 0)
        self.assertIn("unresolved pending rollback", blocked.stderr)

        recovered = self.execute("--rollback", self.env())
        self.assertEqual(recovered.returncode, 0, recovered.stderr)
        self.assertFalse(pending.exists())
        self.assertFalse((self.supabase / "docker-compose.replication.yml").exists())
        self.assertFalse(self.marker.exists())
        self.assertEqual(list(state.glob("transaction.*")), [])

    def test_unscoped_firewall_accept_fails_before_endpoint_writes(self) -> None:
        self.require_posix_root()
        result = self.execute("--write", self.env("firewall-legacy"))
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.supabase / "docker-compose.replication.yml").exists())
        self.assertFalse((self.db_config / "pg_hba-replication.conf").exists())
        self.assertFalse((self.root / "rollback-state").exists())
        log = self.log.read_text(encoding="utf-8")
        self.assertNotIn("iptables -I INPUT", log)
        self.assertNotIn("docker ", log)

    def test_multiport_custom_chain_5432_accept_fails_before_writes(self) -> None:
        self.require_posix_root()
        result = self.execute("--write", self.env("firewall-multiport"))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("exact private-NIC rule", result.stderr)
        self.assertFalse((self.root / "rollback-state").exists())
        log = self.log.read_text(encoding="utf-8")
        self.assertNotIn("iptables -I INPUT", log)
        self.assertNotIn("docker ", log)

    def test_single_dport_range_covering_5432_fails_before_writes(self) -> None:
        self.require_posix_root()
        result = self.execute("--write", self.env("firewall-range"))
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / "rollback-state").exists())
        self.assertNotIn("docker ", self.log.read_text(encoding="utf-8"))

    def test_private_destination_multiport_does_not_false_positive(self) -> None:
        self.require_posix_root()
        env = self.env("firewall-private-multiport")
        result = self.execute("--write", env)
        self.assertEqual(result.returncode, 0, result.stderr)
        rolled_back = self.execute("--rollback", env)
        self.assertEqual(rolled_back.returncode, 0, rolled_back.stderr)

    def test_success_persists_one_snapshot_and_explicit_rollback_restores_it(self) -> None:
        self.require_posix_root()
        override = self.supabase / "docker-compose.replication.yml"
        hba = self.db_config / "pg_hba-replication.conf"
        override.write_text("prior compose\n", encoding="utf-8")
        hba.write_text("prior hba\n", encoding="utf-8")
        env = self.env()
        first = self.execute("--write", env)
        self.assertEqual(first.returncode, 0, first.stderr)
        state = self.root / "rollback-state"
        current = state / "current"
        current_name = current.read_text(encoding="utf-8").strip()
        snapshot = state / current_name
        self.assertEqual((snapshot / "override").read_text(encoding="utf-8"), "prior compose\n")
        second = self.execute("--write", env)
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(current.read_text(encoding="utf-8").strip(), current_name)
        self.assertEqual((snapshot / "override").read_text(encoding="utf-8"), "prior compose\n")
        self.assertEqual(len(list(state.glob("transaction.*"))), 1)
        self.assertFalse((state / "pending").exists())
        self.assertFalse((state / "in-progress").exists())
        rolled_back = self.execute("--rollback", env)
        self.assertEqual(rolled_back.returncode, 0, rolled_back.stderr)
        self.assertEqual(override.read_text(encoding="utf-8"), "prior compose\n")
        self.assertEqual(hba.read_text(encoding="utf-8"), "prior hba\n")
        self.assertFalse(current.exists())
        self.assertFalse((state / "in-progress").exists())
        self.assertEqual(list(state.glob("transaction.*")), [])
        self.assertFalse(self.marker.exists())
        log = self.log.read_text(encoding="utf-8")
        self.assertIn(f"-f {self.bash_path(override)} up -d --force-recreate --wait db", log)

    def test_rollback_rejects_symlinked_current_pointer_without_changes(self) -> None:
        if os.name == "nt":
            self.skipTest("symlink fixture requires POSIX semantics")
        if os.geteuid() != 0:
            self.skipTest("write shim requires root-capable install ownership")
        env = self.env()
        result = self.execute("--write", env)
        self.assertEqual(result.returncode, 0, result.stderr)
        current = self.root / "rollback-state" / "current"
        transaction = (self.root / "rollback-state" / current.read_text(encoding="utf-8").strip())
        current.unlink()
        current.symlink_to(transaction, target_is_directory=True)
        result = self.execute("--rollback", env)
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue((self.db_config / "pg_hba-replication.conf").exists())

    def test_dangling_current_symlink_cannot_trigger_completed_cleanup(self) -> None:
        if os.name == "nt":
            self.skipTest("symlink fixture requires POSIX semantics")
        self.require_posix_root()
        env = self.env()
        result = self.execute("--write", env)
        self.assertEqual(result.returncode, 0, result.stderr)
        state = self.root / "rollback-state"
        current = state / "current"
        transaction_name = current.read_text(encoding="utf-8").strip()
        (state / "in-progress").write_text(transaction_name + "\n", encoding="utf-8")
        (state / "in-progress").chmod(0o600)
        current.unlink()
        current.symlink_to(state / "missing-transaction")
        result = self.execute("--rollback", env)
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(current.is_symlink())
        self.assertTrue((state / "in-progress").exists())

    def test_explicit_rollback_failure_keeps_progress_and_retry_succeeds(self) -> None:
        self.require_posix_root()
        env = self.env()
        installed = self.execute("--write", env)
        self.assertEqual(installed.returncode, 0, installed.stderr)
        state = self.root / "rollback-state"
        failed_env = self.env()
        failed_env["APP_HEALTH_STATUS"] = "503"
        failed = self.execute("--rollback", failed_env)
        self.assertNotEqual(failed.returncode, 0)
        self.assertTrue((state / "current").exists())
        self.assertTrue((state / "in-progress").exists())

        retried = self.execute("--rollback", self.env())
        self.assertEqual(retried.returncode, 0, retried.stderr)
        self.assertFalse((state / "current").exists())
        self.assertFalse((state / "in-progress").exists())
        self.assertEqual(list(state.glob("transaction.*")), [])

    def test_preexisting_exact_firewall_rule_survives_install_and_rollback(self) -> None:
        self.require_posix_root()
        self.marker.touch()
        env = self.env()
        installed = self.execute("--write", env)
        self.assertEqual(installed.returncode, 0, installed.stderr)
        self.assertTrue(self.marker.exists())
        rolled_back = self.execute("--rollback", env)
        self.assertEqual(rolled_back.returncode, 0, rolled_back.stderr)
        self.assertTrue(self.marker.exists())

    def test_write_shim_proves_order_and_health_probes(self) -> None:
        self.require_posix_root()
        result = self.execute("--write", self.env())
        self.assertEqual(result.returncode, 0, result.stderr)
        log = self.log.read_text(encoding="utf-8")
        self.assertLess(log.index("docker compose"), log.index("certbot certonly"))
        for expected in ("config --quiet", "pg_isready", "pg_hba_file_rules", "nginx -t", "systemctl reload nginx", "iptables -I INPUT"):
            self.assertIn(expected, log)
        self.assertIn("-d 10.42.1.207 -p tcp --dport 5432", log)
        self.assertNotIn("-d 0.0.0.0/0", log)
        self.assertIn(
            "hba_file = '/etc/postgresql-custom/pg_hba-replication.conf'",
            (self.db_config / "conf.d/replication-endpoint.conf").read_text(encoding="utf-8"),
        )
        self.assertNotIn(
            "include /etc/nginx/aura-board-replication-stream.conf;",
            self.nginx_main.read_text(encoding="utf-8"),
        )
        self.assertTrue((self.firewall_parent / "rules.v4").exists())
        self.assertIn("installed for replication.example.com", result.stdout)

    def test_write_failures_are_nonzero_and_never_success(self) -> None:
        self.require_posix_root()
        stages = ("certbot", "compose", "compose-up", "hba", "nginx", "reload", "firewall-persist", "app-redirect", "listener-extra")
        for index, stage in enumerate(stages):
            with self.subTest(stage=stage):
                if index:
                    self.tearDown()
                    self.setUp()
                env = self.env(stage)
                if stage == "hba":
                    env["HBA_RESULT"] = "fail"
                if stage == "app-redirect":
                    env["APP_HEALTH_STATUS"] = "302"
                result = self.execute("--write", env)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn("installed for", result.stdout + result.stderr)
                if stage == "certbot":
                    up_lines = [line for line in self.log.read_text(encoding="utf-8").splitlines() if " up -d --force-recreate --wait db" in line]
                    self.assertTrue(any(
                        self.bash_path(self.supabase / "docker-compose.yml") in line
                        and self.bash_path(self.supabase / "docker-compose.replication.yml") not in line
                        for line in up_lines
                    ))


if __name__ == "__main__":
    unittest.main()
