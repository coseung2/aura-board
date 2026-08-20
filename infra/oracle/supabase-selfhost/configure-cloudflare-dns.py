#!/usr/bin/env python3

from __future__ import annotations

import argparse
import ipaddress
import json
import re
import sys
from collections.abc import Sequence
from typing import Any, NoReturn
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


API_BASE = "https://api.cloudflare.com/client/v4"
REQUEST_TIMEOUT_SECONDS = 10
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
DNS_TTL_SECONDS = 120
DNS_LABEL = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")


class SafeArgumentParser(argparse.ArgumentParser):
    def error(self, _message: str) -> NoReturn:
        raise SystemExit("[cloudflare-dns] FAIL: invalid command-line arguments")


class ToolError(Exception):
    pass


class NoRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, *_args: Any, **_kwargs: Any) -> NoReturn:
        raise ToolError("status=redirect code=redirect_rejected")


def fail(message: str) -> NoReturn:
    raise ToolError(message)


def normalize_dns_name(value: str, label: str) -> str:
    if not isinstance(value, str):
        fail(f"{label} is invalid")
    name = value.rstrip(".").lower()
    if not name or len(name) > 253 or name.startswith(".") or name.endswith("."):
        fail(f"{label} is invalid")
    labels = name.split(".")
    if any(DNS_LABEL.fullmatch(part) is None for part in labels):
        fail(f"{label} is invalid")
    return name


def validate_content(value: str) -> str:
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        fail("--content must be an IPv4 address")
    if address.version != 4:
        fail("--content must be an IPv4 address")
    if not address.is_global:
        fail("--content must be a globally routable public IPv4 address")
    return str(address)


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = SafeArgumentParser(
        description="Safely create or update the exact Cloudflare A record for the public Supabase endpoint.",
        epilog=(
            "Recommended two-stage rollout: use --proxied false for ACME HTTP validation; "
            "after external HTTPS succeeds, run again with --proxied true. "
            "Write mode reads exactly {\"apiToken\":\"...\"} from stdin."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--zone", default="aura-board.com", help="exact Cloudflare zone name")
    parser.add_argument("--name", default="supabase.aura-board.com", help="exact A record name")
    parser.add_argument("--content", required=True, help="IPv4 address for the A record")
    parser.add_argument(
        "--proxied",
        required=True,
        choices=("true", "false"),
        help="Cloudflare proxy state; explicit to prevent an accidental mode change",
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="validate inputs and show the no-mutation plan")
    mode.add_argument("--write", action="store_true", help="read the API token from stdin and reconcile DNS")
    return parser.parse_args(argv)


def read_api_token() -> str:
    try:
        raw = sys.stdin.read()
        value = json.loads(raw)
    except (OSError, UnicodeError, json.JSONDecodeError):
        fail("stdin credential must be exact JSON with only apiToken")
    if not isinstance(value, dict) or set(value) != {"apiToken"}:
        fail("stdin credential must be exact JSON with only apiToken")
    token = value.get("apiToken")
    if not isinstance(token, str) or not token or token.strip() != token:
        fail("stdin credential must be exact JSON with only apiToken")
    if any(ord(character) < 0x20 or ord(character) > 0x7E for character in token):
        fail("stdin credential contains invalid characters")
    return token


def _error_code(payload: Any) -> str:
    if isinstance(payload, dict):
        errors = payload.get("errors")
        if isinstance(errors, list) and errors:
            first = errors[0]
            if isinstance(first, dict) and isinstance(first.get("code"), (int, str)):
                return str(first["code"])
        if isinstance(payload.get("code"), (int, str)):
            return str(payload["code"])
    return "unknown"


class CloudflareClient:
    def __init__(self, token: str, opener: Any | None = None) -> None:
        self._token = token
        self._opener = opener or build_opener(NoRedirectHandler())

    def request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        url = f"{API_BASE}{path}"
        parsed_url = urlsplit(url)
        if parsed_url.scheme != "https" or parsed_url.netloc != "api.cloudflare.com":
            fail("status=client code=unsafe_url")
        body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode("utf-8")
        request = Request(
            url,
            data=body,
            method=method,
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {self._token}",
                "Content-Type": "application/json",
            },
        )
        try:
            response = self._opener.open(request, timeout=REQUEST_TIMEOUT_SECONDS)
        except HTTPError as error:
            status = str(error.code) if isinstance(error.code, int) else "http_error"
            api_code = "http_error"
            try:
                error_body = error.read(MAX_RESPONSE_BYTES + 1)
                if len(error_body) <= MAX_RESPONSE_BYTES:
                    api_code = _error_code(json.loads(error_body.decode("utf-8")))
            except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError):
                pass
            finally:
                close = getattr(error, "close", None)
                if close is not None:
                    close()
            raise ToolError(f"status={status} code={api_code}") from None
        except ToolError:
            raise
        except (URLError, TimeoutError, OSError):
            raise ToolError("status=network code=request_failed") from None

        try:
            status = getattr(response, "status", None) or response.getcode()
            content = response.read(MAX_RESPONSE_BYTES + 1)
        except (OSError, ValueError):
            raise ToolError("status=network code=response_read_failed") from None
        finally:
            close = getattr(response, "close", None)
            if close is not None:
                close()

        if len(content) > MAX_RESPONSE_BYTES:
            fail("status=response code=too_large")
        try:
            decoded = json.loads(content.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            fail(f"status={status} code=invalid_json")
        if not isinstance(decoded, dict) or decoded.get("success") is not True:
            fail(f"status={status} code={_error_code(decoded)}")
        return decoded


def exact_zone(client: CloudflareClient, zone: str) -> str:
    query = urlencode({"name": zone, "per_page": "50"})
    response = client.request("GET", f"/zones?{query}")
    result = response.get("result")
    if not isinstance(result, list):
        fail("status=client code=malformed_zone_result")
    matches = [
        item
        for item in result
        if isinstance(item, dict) and isinstance(item.get("name"), str) and item["name"].rstrip(".").lower() == zone
    ]
    if len(matches) != 1:
        fail(f"status=client code=zone_{'not_found' if not matches else 'duplicate'}")
    zone_id = matches[0].get("id")
    if not isinstance(zone_id, str) or not zone_id:
        fail("status=client code=zone_id_missing")
    return zone_id


def exact_a_records(client: CloudflareClient, zone_id: str, name: str) -> list[dict[str, Any]]:
    encoded_zone_id = quote(zone_id, safe="")
    query = urlencode({"type": "A", "name": name, "per_page": "1000"})
    response = client.request("GET", f"/zones/{encoded_zone_id}/dns_records?{query}")
    result = response.get("result")
    if not isinstance(result, list):
        fail("status=client code=malformed_record_result")
    return [
        item
        for item in result
        if isinstance(item, dict)
        and item.get("type") == "A"
        and isinstance(item.get("name"), str)
        and item["name"].rstrip(".").lower() == name
    ]


def reconcile(args: argparse.Namespace, client: CloudflareClient) -> int:
    zone = normalize_dns_name(args.zone, "--zone")
    name = normalize_dns_name(args.name, "--name")
    if name != zone and not name.endswith(f".{zone}"):
        fail("--name must be inside --zone")
    content = validate_content(args.content)
    proxied = args.proxied == "true"
    ttl = 1 if proxied else DNS_TTL_SECONDS

    zone_id = exact_zone(client, zone)
    records = exact_a_records(client, zone_id, name)
    if len(records) > 1:
        fail("status=client code=duplicate_a_record")

    record_path = f"/zones/{quote(zone_id, safe='')}/dns_records"
    if not records:
        client.request(
            "POST",
            record_path,
            {"type": "A", "name": name, "content": content, "ttl": ttl, "proxied": proxied},
        )
        print(f"[cloudflare-dns] created name={name} content={content} proxied={str(proxied).lower()}")
        return 0

    record = records[0]
    record_id = record.get("id")
    if not isinstance(record_id, str) or not record_id:
        fail("status=client code=record_id_missing")
    current_content = record.get("content")
    current_proxied = bool(record.get("proxied", False))
    if current_content == content and current_proxied == proxied:
        print(f"[cloudflare-dns] no-op name={name} content={content} proxied={str(proxied).lower()}")
        return 0

    client.request(
        "PATCH",
        f"{record_path}/{quote(record_id, safe='')}",
        {"content": content, "ttl": ttl, "proxied": proxied},
    )
    print(f"[cloudflare-dns] updated name={name} content={content} proxied={str(proxied).lower()}")
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    try:
        args = parse_args(argv)
        zone = normalize_dns_name(args.zone, "--zone")
        name = normalize_dns_name(args.name, "--name")
        if name != zone and not name.endswith(f".{zone}"):
            fail("--name must be inside --zone")
        content = validate_content(args.content)
        proxied = args.proxied == "true"
        if args.dry_run:
            print(
                f"[cloudflare-dns] dry-run zone={zone} name={name} content={content} "
                f"proxied={str(proxied).lower()} mutations=none network=none"
            )
            return 0
        token = read_api_token()
        return reconcile(
            argparse.Namespace(zone=zone, name=name, content=content, proxied=str(proxied).lower()),
            CloudflareClient(token),
        )
    except ToolError as error:
        print(f"[cloudflare-dns] FAIL: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
