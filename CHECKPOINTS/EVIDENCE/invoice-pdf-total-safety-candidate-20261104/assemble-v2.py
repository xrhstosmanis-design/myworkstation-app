#!/usr/bin/env python3
"""Reproduce the tested V2 patch. Never apply it or modify application files."""
import argparse
import hashlib
import sys
from pathlib import Path

V1_SHA256 = "3254e85967745ada000a1bcf4be46ced88df787c37bf67f681012b801679b3fa"
TEST_SHA256 = "90bd908326a12f0b1dda48e12e626b981e282aa10cf5ea665af4a879374f62d5"
V2_SHA256 = "54fa54128c8030e11c17bd66583dab61b78fce1e4af6ae8904cd7b4baeadd956"
TARGET = "server/test/pos-fast-header-pdf-real-helpers.test.js"


def read_verified(path: Path, expected: str) -> str:
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f"Refusing changed input: {path.name}")
    return data.decode("utf-8")


def assemble(root: Path) -> bytes:
    previous = read_verified(root / "candidate.patch", V1_SHA256)
    test = read_verified(root / "v2-real-helpers.test.mjs", TEST_SHA256)
    # The historical patch has one extra space before a diff boundary.
    previous = previous.replace("\n diff --git ", "\ndiff --git ")
    lines = test.splitlines()
    addition = (
        f"diff --git a/{TARGET} b/{TARGET}\n"
        "new file mode 100644\n--- /dev/null\n"
        f"+++ b/{TARGET}\n@@ -0,0 +1,{len(lines)} @@\n"
        + "".join("+" + line + "\n" for line in lines)
    )
    data = (previous + addition).encode("utf-8")
    if hashlib.sha256(data).hexdigest() != V2_SHA256:
        raise ValueError("Refusing output: it differs from the tested V2 patch")
    return data


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--verify-only", action="store_true")
    mode.add_argument("--output", type=Path, help="Create a NEW patch file; never overwrite")
    args = parser.parse_args()
    try:
        data = assemble(Path(__file__).resolve().parent)
        if args.output is not None:
            with args.output.open("xb") as handle:
                handle.write(data)
        print(f"V2 verified: {len(data)} bytes; SHA256 {V2_SHA256}")
        print("No application file changed. No patch applied. No tests, Git, network or deployment invoked.")
        return 0
    except (OSError, UnicodeError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
