"""Compare trusted PostgreSQL data-only COPY exports without emitting row contents.

Read-only file auditor, not a SQL executor or a production recovery authorization.
Requires identical COPY row order and column headers; fails closed on other data
formats (including large objects/INSERTs), malformed streams and missing tables.
"""
import hashlib
import json
import re
import sys

MAX_LINE = 64 * 1024 * 1024
MAX_TABLES = 1000


def inventory(filename):
    tables, sequences = {}, {}
    current = None
    with open(filename, "rb") as stream:
        while True:
            line = stream.readline(MAX_LINE + 1)
            if not line:
                break
            if len(line) > MAX_LINE or not line.endswith(b"\n"):
                raise ValueError("Oversized or incomplete SQL line")
            if current is not None:
                if line == b"\\.\n":
                    tables[current]["sha256"] = row_hash.hexdigest()
                    current = None
                else:
                    row_hash.update(str(len(line)).encode("ascii") + b":" + line)
                    tables[current]["rows"] += 1
                    tables[current]["bytes"] += len(line)
                continue
            sql = line.strip()
            if not sql or sql.startswith(b"--"):
                continue
            if re.fullmatch(rb"\\(?:un)?restrict [A-Za-z0-9]+", sql):
                continue
            if re.fullmatch(rb"SET [a-z_]+ = .*;", sql):
                continue
            if sql == b"SELECT pg_catalog.set_config('search_path', '', false);":
                continue
            if sql.startswith(b"COPY ") and sql.endswith(b" FROM stdin;"):
                if len(sql) > 65536 or sql in tables or len(tables) >= MAX_TABLES:
                    raise ValueError("Duplicate or oversized COPY inventory")
                current = sql
                row_hash = hashlib.sha256()
                tables[current] = {"rows": 0, "bytes": 0}
                continue
            match = re.fullmatch(rb"SELECT pg_catalog.setval\(('(?:[^']|'')*)', (-?[0-9]+), (true|false)\);", sql)
            if match:
                name = match.group(1)
                if name in sequences:
                    raise ValueError("Duplicate sequence state")
                sequences[name] = sql
                continue
            raise ValueError("Unsupported SQL outside COPY data")
    if current is not None or not tables:
        raise ValueError("Incomplete or empty COPY inventory")
    return tables, sequences


def compare(expected_file, restored_file):
    expected, expected_sequences = inventory(expected_file)
    restored, restored_sequences = inventory(restored_file)
    if expected != restored or expected_sequences != restored_sequences:
        raise ValueError("Restored data or sequence state differs")
    canonical = {
        "tables": [[key.decode("utf-8"), expected[key]] for key in sorted(expected)],
        "sequences": [expected_sequences[key].decode("utf-8") for key in sorted(expected_sequences)],
    }
    return {
        "format": "MWS_COPY_ROUNDTRIP_AUDIT_V1",
        "dataMatches": True,
        "tables": len(expected),
        "rows": sum(t["rows"] for t in expected.values()),
        "copyBytes": sum(t["bytes"] for t in expected.values()),
        "sequences": len(expected_sequences),
        "sha256": hashlib.sha256(json.dumps(canonical, ensure_ascii=True, separators=(",", ":")).encode()).hexdigest(),
        "executionAuthorized": False,
    }


if __name__ == "__main__":
    try:
        if len(sys.argv) != 3:
            raise ValueError("Expected two data-only SQL files")
        print(json.dumps(compare(sys.argv[1], sys.argv[2]), sort_keys=True))
    except (ValueError, OSError, UnicodeError) as error:
        # Never emit SQL payloads, input filenames or credential-bearing errors.
        print(json.dumps({"dataMatches": False, "error": type(error).__name__}), file=sys.stderr)
        sys.exit(1)
