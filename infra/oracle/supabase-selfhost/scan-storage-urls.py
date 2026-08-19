#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import subprocess
import sys


def fail(message: str) -> None:
    raise SystemExit(f"[storage-url-scan] FAIL: {message}")


def run_psql(sql: str) -> str:
    read_only_sql = f"BEGIN TRANSACTION READ ONLY;\n{sql.rstrip()};\nCOMMIT;"
    try:
        completed = subprocess.run(
            [
                "docker",
                "exec",
                "supabase-db",
                "psql",
                "-U",
                "postgres",
                "-d",
                "postgres",
                "-A",
                "-t",
                "-v",
                "ON_ERROR_STOP=1",
                "-c",
                read_only_sql,
            ],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except OSError as exc:
        fail(f"read-only query could not start (errno={exc.errno})")
    if completed.returncode != 0:
        fail(f"read-only query failed (exit_code={completed.returncode})")
    return completed.stdout.strip()


def quote_ident(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def quote_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def load_columns() -> list[dict[str, str]]:
    sql = """
SELECT COALESCE(
  json_agg(
    json_build_object(
      'schema', table_schema,
      'table', table_name,
      'column', column_name,
      'type', data_type
    )
    ORDER BY table_name, ordinal_position
  ),
  '[]'::json
)::text
FROM information_schema.columns
WHERE table_schema = 'public'
  AND data_type IN ('text', 'character varying', 'json', 'jsonb');
"""
    try:
        parsed = json.loads(run_psql(sql) or "[]")
    except json.JSONDecodeError as exc:
        fail(f"could not parse column manifest: {exc}")
    if not isinstance(parsed, list):
        fail("column manifest is not an array")
    for index, column in enumerate(parsed, start=1):
        if not isinstance(column, dict):
            fail(f"column manifest entry #{index} is invalid")
        for key in ("schema", "table", "column", "type"):
            if not isinstance(column.get(key), str) or not column[key]:
                fail(f"column manifest entry #{index} has an invalid {key}")
        if column["schema"] != "public":
            fail(f"column manifest entry #{index} is outside the public schema")
    return parsed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Read-only count scan for persisted managed Supabase Storage URLs. "
            "Only public text/varchar/json/jsonb columns are inspected; row values are never printed."
        )
    )
    parser.add_argument(
        "--needle",
        default="supabase.co/storage/v1/object/",
        help="exact case-sensitive substring to count (default: managed Supabase object URL marker)",
    )
    return parser.parse_args()


def output_identifier(value: str) -> str:
    """Keep unusual SQL identifiers from creating ambiguous or multi-line output."""
    return (
        value.replace("\\", "\\\\")
        .replace("|", "\\|")
        .replace("\r", "\\r")
        .replace("\n", "\\n")
    )


def main() -> int:
    args = parse_args()
    if not args.needle:
        fail("--needle must not be empty")
    if any(ord(character) < 32 or ord(character) == 127 for character in args.needle):
        fail("--needle contains control characters")
    matches = 0
    rows = 0

    for column in load_columns():
        schema = str(column["schema"])
        table = str(column["table"])
        name = str(column["column"])
        sql = (
            f"SELECT count(*) FROM {quote_ident(schema)}.{quote_ident(table)} "
            f"WHERE position({quote_literal(args.needle)} in {quote_ident(name)}::text) > 0;"
        )
        count_text = run_psql(sql)
        try:
            count = int(count_text or "0")
        except ValueError:
            fail("count query returned a non-integer result")
        if count < 0:
            fail("count query returned a negative result")
        if count <= 0:
            continue
        matches += 1
        rows += count
        print(f"{output_identifier(table)}.{output_identifier(name)}|{count}")

    print(f"[storage-url-scan] matched_columns={matches} matched_rows={rows}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
