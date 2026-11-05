#!/usr/bin/env python3
"""Strict once-only Task3 canonical registry reconciliation, against exact protected Git trees."""
from pathlib import Path
import subprocess
import sys

BASE="69c9a14f3ec00ad044e4fa1d7d08aa4894248836"
TASK="723d1a3cdd2fe45675c92a3dbe60c2511489a6ac"
PEER="65ea6e1d4e506e8b4bf65490f7bb07c98e61b22a"
DOCS=(
 "CHECKPOINTS/KAT_ACTIVE_LIST_2026-09-05.md",
 "docs/roadmap/OPEN_WORK_TRACKER.md",
 "docs/roadmap/PENDING_WORK.md",
)
PDFS=(
 "docs/roadmap/MyWorkStation_Open_Work_2026-10-07.pdf",
 "output/pdf/MyWorkStation_Open_Work_2026-10-07.pdf",
)
def git(*args):
 return subprocess.check_output(("git", *args))
def content(ref,path):
 return git("show",f"{ref}:{path}")

if git("rev-parse","origin/main").decode().strip()!=PEER:
 raise SystemExit("ABORT main is no longer the exact reviewed peer")
subprocess.run(("git","merge-base","--is-ancestor",TASK,"HEAD"),check=True)
for path in DOCS:
 base,task,peer=[content(r,path) for r in (BASE,TASK,PEER)]
 if len(base)<3000000 or not task.endswith(base) or not peer.endswith(base):
  raise SystemExit(f"ABORT shared history mismatch: {path}")
 task_prefix=task[:-len(base)]
 peer_prefix=peer[:-len(base)]
 if not (5000<len(task_prefix)<15000 and
         b"INVOICE-CREDIT-HOSTED-PREP-01" in task_prefix and
         2000<len(peer_prefix)<12000 and
         b"INVOICE-HEADER-LATENCY" in peer_prefix):
  raise SystemExit(f"ABORT inconsistent bounded prefixes: {path}")
 if "OPEN_WORK_TRACKER" in path and b"INVENTORY-SCAN-WORKFLOW-01" not in peer_prefix:
  raise SystemExit("ABORT missing latest inventory entry")
 result=peer_prefix+task_prefix+base
 assert result.endswith(base) and result.startswith(peer_prefix)
 Path(path).write_bytes(result)
 print(f"PASS {path}: peer prefix {len(peer_prefix)}, task prefix {len(task_prefix)}, shared history {len(base)}, total {len(result)}")
print("PASS: all canonical history boundaries verified")
