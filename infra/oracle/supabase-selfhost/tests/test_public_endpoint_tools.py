from __future__ import annotations

import contextlib
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
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[4]
SELFHOST = ROOT / "infra" / "oracle" / "supabase-selfhost"
TEMPLATE_PATH = SELFHOST / "nginx-supabase.conf.template"
INSTALLER_PATH = SELFHOST / "install-public-endpoint.sh"
DNS_PATH = SELFHOST / "configure-cloudflare-dns.py"
PUBLIC_URL_PATH = SELFHOST / "configure-public-url.py"


def load_dns_module():
    spec = importlib.util.spec_from_file_location("configure_cloudflare_dns", DNS_PATH)
    if spec is None or spec.loader is None:
        raise AssertionError("could not load DNS module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


dns = load_dns_module()


def load_public_url_module():
    spec = importlib.util.spec_from_file_location("configure_public_url", PUBLIC_URL_PATH)
    if spec is None or spec.loader is None:
        raise AssertionError("could not load public URL module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


public_url = load_public_url_module()


class FakeResponse:
    def __init__(self, payload: dict, status: int = 200):
        self.status = status
        self._body = json.dumps(payload).encode("utf-8")
        self.closed = False

    def getcode(self):
        return self.status

    def read(self, _limit: int = -1):
        return self._body

    def close(self):
        self.closed = True


class FakeOpener:
    def __init__(self, responses):
        self.responses = list(responses)
        self.requests = []

    def open(self, request, timeout):
        self.requests.append((request, timeout))
        if not self.responses:
            raise AssertionError("unexpected API request")
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def success(result=None):
    return {"success": True, "result": result}


class NginxTemplateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.template = TEMPLATE_PATH.read_text(encoding="utf-8")

    def test_http_acme_and_redirect_are_restricted(self):
        self.assertIn("server_name supabase.aura-board.com;", self.template)
        self.assertIn("location ^~ /.well-known/acme-challenge/", self.template)
        self.assertIn("root /var/www/certbot;", self.template)
        self.assertIn("try_files $uri =404;", self.template)
        self.assertIn("return 301 https://$host$request_uri;", self.template)

    def test_tls_uses_private_placeholder_and_expected_certificates(self):
        self.assertIn("listen __PRIVATE_IP__:443 ssl;", self.template)
        self.assertNotIn("listen 443", self.template.replace("listen __PRIVATE_IP__:443 ssl;", ""))
        self.assertIn("/etc/letsencrypt/live/supabase.aura-board.com/fullchain.pem", self.template)
        self.assertIn("/etc/letsencrypt/live/supabase.aura-board.com/privkey.pem", self.template)
        self.assertIn("ssl_protocols TLSv1.2 TLSv1.3;", self.template)

    def test_only_supabase_client_prefixes_match_the_allowlist(self):
        client_pattern = re.compile(r"^/(auth|rest|realtime|storage|functions)/v1(?:/|$)")
        graphql_pattern = re.compile(r"^/graphql/v1(?:/|$)")
        allowed = (
            "/auth/v1/token",
            "/rest/v1/boards",
            "/realtime/v1/websocket",
            "/storage/v1/object/sign/aura-board-uploads/a.png",
            "/functions/v1/thumbnail",
            "/graphql/v1",
            "/graphql/v1/anything",
        )
        for path in allowed:
            with self.subTest(path=path):
                self.assertTrue(client_pattern.match(path) or graphql_pattern.match(path))
        for path in ("/", "/studio", "/meta", "/unknown", "/auth/v10/token", "/graphql/v10"):
            with self.subTest(path=path):
                self.assertFalse(client_pattern.match(path) or graphql_pattern.match(path))
        self.assertRegex(self.template, r"location / \{\s*return 404;\s*\}")

    def test_proxy_contract_has_uri_headers_websocket_and_no_cors(self):
        self.assertEqual(self.template.count("proxy_pass http://aura_supabase_gateway;"), 2)
        self.assertIn("proxy_set_header Host $http_host;", self.template)
        self.assertIn("proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;", self.template)
        self.assertIn("proxy_set_header Upgrade $http_upgrade;", self.template)
        self.assertIn("proxy_set_header Connection $supabase_connection_upgrade;", self.template)
        self.assertIn("proxy_buffering off;", self.template)
        self.assertIn("proxy_request_buffering off;", self.template)
        self.assertIn("client_max_body_size 110m;", self.template)
        self.assertNotRegex(self.template, r"add_header\s+Access-Control-")


class InstallerStaticTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.script = INSTALLER_PATH.read_text(encoding="utf-8")

    def test_installer_is_explicit_and_has_ordered_two_stage_flow(self):
        self.assertIn("set -Eeuo pipefail", self.script)
        self.assertIn("--dry-run|--write", self.script)
        self.assertIn("Authorization: Bearer Oracle", self.script)
        http = self.script.index("installing temporary HTTP-only nginx configuration")
        first_test = self.script.index("nginx_test", http)
        certbot = self.script.index("CERTBOT_BIN", http)
        final = self.script.index("installing final TLS nginx configuration")
        self.assertLess(http, first_test)
        self.assertLess(first_test, certbot)
        self.assertLess(certbot, final)
        self.assertIn("attempting nginx configuration rollback", self.script)
        self.assertIn('"$SYSTEMCTL_BIN" reload nginx', self.script)
        self.assertNotIn("cloudflare", self.script.lower())

        rollback_start = self.script.index("rollback()")
        rollback_end = self.script.index("on_exit()", rollback_start)
        rollback = self.script[rollback_start:rollback_end]
        self.assertIn('"$INSTALL_BIN" -o root -g root -m 0644 "$BACKUP_PATH" "$CONFIG_PATH"', rollback)
        self.assertIn('"$RM_BIN" -f -- "$CONFIG_PATH"', rollback)
        self.assertIn('"$LN_BIN" -s -- "$PRIOR_LINK_TARGET" "$ENABLED_PATH"', rollback)
        self.assertLess(rollback.index('"$NGINX_BIN" -t'), rollback.index('"$SYSTEMCTL_BIN" reload nginx'))

    def test_dry_run_is_gated_before_certbot_and_mutation(self):
        dry_run = self.script.index("if [[ \"$MODE\" == 'dry-run' ]]")
        write_root = self.script.index("write mode must run as root")
        certbot_call = self.script.index('"$CERTBOT_BIN" certonly')
        self.assertLess(dry_run, write_root)
        self.assertLess(write_root, certbot_call)
        self.assertIn("no mutation or certbot call", self.script)


class InstallerSubprocessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bash = shutil.which("bash")

    def setUp(self):
        if not self.bash:
            self.skipTest("bash is unavailable")

    @staticmethod
    def write_executable(directory: Path, name: str, body: str) -> Path:
        path = directory / name
        path.write_text(body, encoding="utf-8")
        path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        return path

    def base_env(self, temp: Path, bin_dir: Path, template: Path | None = None):
        available = temp / "sites-available"
        enabled = temp / "sites-enabled"
        available.mkdir()
        enabled.mkdir()
        webroot = temp / "certbot"
        env = os.environ.copy()
        env.update(
            {
                "PATH": f"{bin_dir}{os.pathsep}{env.get('PATH', '')}",
                "SITES_AVAILABLE": str(available),
                "SITES_ENABLED": str(enabled),
                "ACME_WEBROOT": str(webroot),
                "NGINX_TEMPLATE": str(template or TEMPLATE_PATH),
            }
        )
        return env, available, enabled, webroot

    def test_dry_run_does_not_call_certbot_or_mutate_targets(self):
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            bin_dir = temp / "bin"
            bin_dir.mkdir()
            certbot_marker = temp / "certbot-called"
            self.write_executable(
                bin_dir,
                "curl",
                "#!/usr/bin/env bash\nprintf '200'\n",
            )
            self.write_executable(
                bin_dir,
                "certbot",
                f"#!/usr/bin/env bash\nprintf called > '{certbot_marker}'\nexit 99\n",
            )
            self.write_executable(bin_dir, "nginx", "#!/usr/bin/env bash\nexit 0\n")
            self.write_executable(bin_dir, "systemctl", "#!/usr/bin/env bash\nexit 0\n")
            env, available, enabled, webroot = self.base_env(temp, bin_dir)
            result = subprocess.run(
                [self.bash, str(INSTALLER_PATH), "--dry-run", "--private-ip", "10.42.1.207"],
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse(certbot_marker.exists())
            self.assertEqual(list(available.iterdir()), [])
            self.assertEqual(list(enabled.iterdir()), [])
            self.assertFalse(webroot.exists())

    def test_final_nginx_failure_restores_previous_config_and_link(self):
        if os.name == "nt" or getattr(os, "geteuid", lambda: 1)() != 0:
            self.skipTest("rollback subprocess requires a root-capable POSIX shell")
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            bin_dir = temp / "bin"
            bin_dir.mkdir()
            cert_dir = temp / "live"
            certbot_work = temp / "certbot-work"
            certbot_logs = temp / "certbot-logs"
            command_log = temp / "commands.log"
            nginx_count = temp / "nginx-count"
            self.write_executable(bin_dir, "curl", "#!/usr/bin/env bash\nprintf '200'\n")
            self.write_executable(
                bin_dir,
                "nginx",
                f"#!/usr/bin/env bash\n"
                f"printf 'nginx %s\\n' \"$*\" >> '{command_log}'\n"
                f"count=0; [[ -f '{nginx_count}' ]] && count=$(< '{nginx_count}')\n"
                f"count=$((count + 1)); printf '%s' \"$count\" > '{nginx_count}'\n"
                f"if [[ \"$1\" == '-t' && $count -ge 2 ]]; then exit 1; fi\n"
                f"exit 0\n",
            )
            self.write_executable(
                bin_dir,
                "systemctl",
                f"#!/usr/bin/env bash\nprintf 'systemctl %s\\n' \"$*\" >> '{command_log}'\nexit 0\n",
            )
            self.write_executable(
                bin_dir,
                "certbot",
                f"#!/usr/bin/env bash\nmkdir -p '{cert_dir}'\nprintf cert > '{cert_dir / 'fullchain.pem'}'\nprintf key > '{cert_dir / 'privkey.pem'}'\nexit 0\n",
            )
            template = temp / "template.conf"
            template.write_text(
                TEMPLATE_PATH.read_text(encoding="utf-8").replace(
                    "/etc/letsencrypt/live/supabase.aura-board.com",
                    str(cert_dir).replace("\\", "/"),
                ),
                encoding="utf-8",
            )
            env, available, enabled, webroot = self.base_env(temp, bin_dir, template)
            env.update(
                {
                    "CERT_DIR": str(cert_dir),
                    "CERTBOT_WORK_DIR": str(certbot_work),
                    "CERTBOT_LOG_DIR": str(certbot_logs),
                }
            )
            previous = available / "supabase.aura-board.com"
            previous.write_text("previous-config\n", encoding="utf-8")
            os.symlink(previous, enabled / "supabase.aura-board.com")

            result = subprocess.run(
                [self.bash, str(INSTALLER_PATH), "--write", "--private-ip", "10.42.1.207"],
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(previous.read_text(encoding="utf-8"), "previous-config\n")
            self.assertEqual(os.path.realpath(enabled / "supabase.aura-board.com"), str(previous))
            self.assertIn("systemctl reload nginx", command_log.read_text(encoding="utf-8"))
            self.assertTrue(webroot.is_dir())


class CloudflareDnsTests(unittest.TestCase):
    def run_main(self, argv, opener=None, stdin='{"apiToken":"token-secret"}'):
        output = io.StringIO()
        error = io.StringIO()
        patches = [mock.patch.object(dns.sys, "stdin", io.StringIO(stdin))]
        if opener is not None:
            patches.append(mock.patch.object(dns, "build_opener", return_value=opener))
        with contextlib.ExitStack() as stack:
            for patcher in patches:
                stack.enter_context(patcher)
            stack.enter_context(contextlib.redirect_stdout(output))
            stack.enter_context(contextlib.redirect_stderr(error))
            result = dns.main(argv)
        return result, output.getvalue(), error.getvalue()

    @staticmethod
    def zone_response():
        return FakeResponse(success([{"id": "zone-id", "name": "aura-board.com"}]))

    @staticmethod
    def record_response(records):
        return FakeResponse(success(records))

    def test_dry_run_is_network_free_and_requires_explicit_proxy_state(self):
        with mock.patch.object(dns, "build_opener", side_effect=AssertionError("dry-run network")):
            result, output, error = self.run_main(
                ["--dry-run", "--content", "129.225.159.251", "--proxied", "false"]
            )
        self.assertEqual(result, 0)
        self.assertIn("mutations=none network=none", output)
        self.assertEqual(error, "")
        with self.assertRaises(SystemExit):
            dns.parse_args(["--dry-run", "--content", "129.225.159.251"])

    def test_create_when_exact_a_record_is_absent(self):
        opener = FakeOpener(
            [
                self.zone_response(),
                self.record_response([]),
                FakeResponse(success({"id": "new-record"})),
            ]
        )
        result, output, error = self.run_main(
            ["--write", "--content", "129.225.159.251", "--proxied", "false"], opener
        )
        self.assertEqual(result, 0, error)
        self.assertIn("created", output)
        self.assertEqual(len(opener.requests), 3)
        request, timeout = opener.requests[-1]
        self.assertEqual(timeout, 10)
        self.assertEqual(request.method, "POST")
        self.assertEqual(
            json.loads(request.data),
            {
                "type": "A",
                "name": "supabase.aura-board.com",
                "content": "129.225.159.251",
                "ttl": 120,
                "proxied": False,
            },
        )

    def test_update_when_content_or_proxy_state_differs(self):
        opener = FakeOpener(
            [
                self.zone_response(),
                self.record_response(
                    [
                        {
                            "id": "record-id",
                            "type": "A",
                            "name": "supabase.aura-board.com",
                            "content": "10.42.1.10",
                            "proxied": False,
                            "ttl": 300,
                        }
                    ]
                ),
                FakeResponse(success({"id": "record-id"})),
            ]
        )
        result, output, error = self.run_main(
            ["--write", "--content", "129.225.159.251", "--proxied", "true"], opener
        )
        self.assertEqual(result, 0, error)
        self.assertIn("updated", output)
        request, _ = opener.requests[-1]
        self.assertEqual(request.method, "PATCH")
        self.assertEqual(
            json.loads(request.data),
            {"content": "129.225.159.251", "ttl": 1, "proxied": True},
        )
        self.assertNotIn("DELETE", [item[0].method for item in opener.requests])

    def test_matching_record_is_noop_and_unrelated_record_is_preserved(self):
        opener = FakeOpener(
            [
                self.zone_response(),
                self.record_response(
                    [
                        {
                            "id": "record-id",
                            "type": "A",
                            "name": "supabase.aura-board.com",
                            "content": "129.225.159.251",
                            "proxied": False,
                        },
                        {
                            "id": "unrelated",
                            "type": "CNAME",
                            "name": "supabase.aura-board.com",
                            "content": "other.example",
                        },
                    ]
                ),
            ]
        )
        result, output, error = self.run_main(
            ["--write", "--content", "129.225.159.251", "--proxied", "false"], opener
        )
        self.assertEqual(result, 0, error)
        self.assertIn("no-op", output)
        self.assertEqual(len(opener.requests), 2)

    def test_duplicate_exact_a_records_fail_without_mutation(self):
        opener = FakeOpener(
            [
                self.zone_response(),
                self.record_response(
                    [
                        {
                            "id": "one",
                            "type": "A",
                            "name": "supabase.aura-board.com",
                            "content": "129.225.159.251",
                            "proxied": False,
                        },
                        {
                            "id": "two",
                            "type": "A",
                            "name": "supabase.aura-board.com",
                            "content": "129.225.159.252",
                            "proxied": False,
                        },
                    ]
                ),
            ]
        )
        result, output, error = self.run_main(
            ["--write", "--content", "129.225.159.251", "--proxied", "false"], opener
        )
        self.assertEqual(result, 1)
        self.assertIn("duplicate_a_record", error)
        self.assertEqual(len(opener.requests), 2)

    def test_non_ipv4_content_fails_without_network(self):
        with mock.patch.object(dns, "build_opener", side_effect=AssertionError("network")):
            result, output, error = self.run_main(
                ["--write", "--content", "2001:db8::1", "--proxied", "false"]
            )
        self.assertEqual(result, 1)
        self.assertIn("IPv4", error)
        self.assertEqual(output, "")

    def test_token_is_stdin_only_and_never_in_logs_or_errors(self):
        secret = "api-token-secret"
        opener = FakeOpener(
            [
                FakeResponse(
                    {"success": False, "errors": [{"code": 1000, "message": secret}]},
                    status=400,
                )
            ]
        )
        result, output, error = self.run_main(
            ["--write", "--content", "129.225.159.251", "--proxied", "false"],
            opener,
            stdin=json.dumps({"apiToken": secret}),
        )
        self.assertEqual(result, 1)
        self.assertNotIn(secret, output)
        self.assertNotIn(secret, error)
        request, _ = opener.requests[0]
        self.assertEqual(request.get_header("Authorization"), f"Bearer {secret}")
        self.assertNotIn(secret, request.full_url)
        self.assertNotIn(secret.encode("ascii"), request.data or b"")

    def test_extra_stdin_keys_are_rejected(self):
        result, output, error = self.run_main(
            ["--write", "--content", "129.225.159.251", "--proxied", "false"],
            stdin=json.dumps({"apiToken": "secret", "other": "value"}),
        )
        self.assertEqual(result, 1)
        self.assertIn("exact JSON", error)
        self.assertEqual(output, "")

    def test_private_origin_address_is_rejected_without_network(self):
        with mock.patch.object(dns, "build_opener", side_effect=AssertionError("network")):
            result, output, error = self.run_main(
                ["--write", "--content", "10.42.1.207", "--proxied", "false"]
            )
        self.assertEqual(result, 1)
        self.assertIn("globally routable", error)
        self.assertEqual(output, "")


class PublicUrlConfigurationTests(unittest.TestCase):
    def test_dry_run_does_not_mutate(self):
        with tempfile.TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            original = b"UNRELATED=keep\n"
            env_file.write_bytes(original)
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                result = public_url.main(
                    ["--env-file", str(env_file), "--dry-run"]
                )
            self.assertEqual(result, 0)
            self.assertEqual(env_file.read_bytes(), original)
            self.assertIn("mutations=none", output.getvalue())
            self.assertEqual(list(env_file.parent.glob("*.backup-public-url-*")), [])

    def test_write_preserves_other_lines_collapses_duplicates_and_creates_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            original = (
                b"# keep\r\n"
                b"SUPABASE_PUBLIC_URL=http://127.0.0.1:18000\r\n"
                b"UNRELATED=keep\r\n"
                b"SUPABASE_PUBLIC_URL=duplicate\r\n"
                b"API_EXTERNAL_URL=http://127.0.0.1:18000/auth/v1\r\n"
            )
            env_file.write_bytes(original)
            result = public_url.main(["--env-file", str(env_file), "--write"])
            self.assertEqual(result, 0)
            rendered = env_file.read_text(encoding="utf-8")
            self.assertEqual(rendered.count("SUPABASE_PUBLIC_URL="), 1)
            self.assertEqual(rendered.count("API_EXTERNAL_URL="), 1)
            self.assertIn(
                "SUPABASE_PUBLIC_URL=https://supabase.aura-board.com", rendered
            )
            self.assertIn(
                "API_EXTERNAL_URL=https://supabase.aura-board.com/auth/v1", rendered
            )
            self.assertIn("UNRELATED=keep", rendered)
            backups = list(env_file.parent.glob("*.backup-public-url-*"))
            self.assertEqual(len(backups), 1)
            self.assertEqual(backups[0].read_bytes(), original)
            if os.name != "nt":
                self.assertEqual(stat.S_IMODE(env_file.stat().st_mode), 0o600)
                self.assertEqual(stat.S_IMODE(backups[0].stat().st_mode), 0o600)

    def test_symlink_env_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "target.env"
            link = root / ".env"
            target.write_text("UNRELATED=keep\n", encoding="utf-8")
            try:
                link.symlink_to(target)
            except (OSError, NotImplementedError) as exc:
                self.skipTest(f"symlink creation unavailable: {exc}")
            with self.assertRaisesRegex(SystemExit, "symlink"):
                public_url.main(["--env-file", str(link), "--write"])
            self.assertEqual(target.read_text(encoding="utf-8"), "UNRELATED=keep\n")


if __name__ == "__main__":
    unittest.main()
