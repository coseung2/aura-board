#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import subprocess
import sys


def fail(message: str) -> None:
    raise SystemExit(f"[storage-url-scan] FAIL: {message}")


def run_psql(sql: str) -> str:
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
            sql,
        ],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if completed.returncode != 0:
        detail = completed.stderr.strip().splitlines()
        fail(detail[-1] if detail else "psql failed")
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
    return parsed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Find persisted managed Supabase Storage URLs in public schema columns.")
    parser.add_argument("--needle", default="supabase.co/storage/v1/object/")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    pattern = f"%{args.needle}%"
    matches = 0
    rows = 0

    for column in load_columns():
        schema = str(column["schema"])
        table = str(column["table"])
        name = str(column["column"])
        sql = (
            f"SELECT count(*) FROM {quote_ident(schema)}.{quote_ident(table)} "
            f"WHERE {quote_ident(name)}::text LIKE {quote_literal(pattern)};"
        )
        count_text = run_psql(sql)
        count = int(count_text or "0")
        if count <= 0:
            continue
        matches += 1
        rows += count
        print(f"{table}.{name}|{count}")

    print(f"[storage-url-scan] matched_columns={matches} matched_rows={rows}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
