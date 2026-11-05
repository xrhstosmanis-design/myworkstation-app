#!/usr/bin/env python3
"""Strict once-only Task3 canonical registry reconciliation, against exact protected Git trees."""
from pathlib import Path
import subprocess
import sys
import hashlib
import re
import shutil

BASE="69c9a14f3ec00ad044e4fa1d7d08aa4894248836"
TASK="723d1a3cdd2fe45675c92a3dbe60c2511489a6ac"
PEER="c182e18767016ea2645dc538537d7ba3e81215d3"
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
prepared={}
for path in DOCS:
 base,task,peer=[content(r,path) for r in (BASE,TASK,PEER)]
 if len(base)<3000000 or not task.endswith(base) or not peer.endswith(base):
  raise SystemExit(f"ABORT shared history mismatch: {path}")
 task_prefix=task[:-len(base)]
 peer_prefix=peer[:-len(base)]
 if not (5000<len(task_prefix)<15000 and
         b"INVOICE-CREDIT-HOSTED-PREP-01" in task_prefix and
         2000<len(peer_prefix)<100000 and
         b"INVOICE-HEADER-LATENCY" in peer_prefix):
  raise SystemExit(f"ABORT inconsistent bounded prefixes: {path}")
 if "OPEN_WORK_TRACKER" in path and b"INVENTORY-SCAN-WORKFLOW-01" not in peer_prefix:
  raise SystemExit("ABORT missing latest inventory entry")
 result=peer_prefix+task_prefix+base
 assert result.endswith(base) and result.startswith(peer_prefix)
 prepared[path]=result
 print(f"PASS {path}: peer prefix {len(peer_prefix)}, task prefix {len(task_prefix)}, shared history {len(base)}, total {len(result)}")
print("PASS: all canonical history boundaries verified; no files changed")


# Default is preview: no canonical document writes, no merge, no release.
if "--apply" not in sys.argv:
 print("DRY RUN ONLY: pass --apply to prepare a guarded, UNCOMMITTED PR merge.")
 sys.exit(0)
if git("symbolic-ref","--short","HEAD").decode().strip()!="fix/task3-lab-preparation-20261105":
 raise SystemExit("ABORT must use existing Task3 PR branch")
if git("status","--porcelain"):
 raise SystemExit("ABORT dirty working tree")
if git("rev-parse","origin/main").decode().strip()!=PEER:
 raise SystemExit("ABORT main moved after verification")

# Merge all newer peer changes first. Only known shared registries/PDFs may conflict.
merge=subprocess.run(("git","merge","--no-commit","--no-ff","origin/main"),capture_output=True,text=True)
unmerged=set(git("diff","--name-only","--diff-filter=U").decode().splitlines())
allowed=set(DOCS+PDFS)
if unmerged-allowed:
 raise SystemExit(f"ABORT unexpected conflicts: {sorted(unmerged-allowed)}")
if merge.returncode!=0 and not unmerged:
 raise SystemExit("ABORT merge failed without expected canonical conflicts: "+merge.stderr[:700])

for path,data in prepared.items():
 Path(path).write_bytes(data)
 if Path(path).read_bytes()!=data:
  raise SystemExit(f"ABORT canonical content verification: {path}")

# Use the repo's original, unchanged PDF generator after source reconciliation.
subprocess.run((sys.executable,"docs/roadmap/generate-open-work-tracker.py"),check=True)
generated=Path(PDFS[1])
archived=Path(PDFS[0])
if not generated.is_file() or not shutil.which("pdfinfo"):
 raise SystemExit("ABORT generated PDF missing or pdfinfo unavailable")
info=subprocess.run(("pdfinfo",str(generated)),check=True,capture_output=True,text=True).stdout
match=re.search(r"^Pages:\s*(\d+)$",info,flags=re.M)
if not match or int(match.group(1))<900:
 raise SystemExit("ABORT incomplete generated tracker PDF")
archived.write_bytes(generated.read_bytes())
if archived.read_bytes()!=generated.read_bytes():
 raise SystemExit("ABORT canonical PDF copies are not byte-identical")
digest=hashlib.sha256(generated.read_bytes()).hexdigest()
git("add","--",*DOCS,*PDFS)
if git("ls-files","-u"):
 raise SystemExit("ABORT unresolved merge stages")
print(f"PREPARED: {match.group(1)}-page PDFs, SHA256 {digest}; exact copies")
print("NO COMMIT / NO PUSH / NO MERGE TO MAIN / NO DEPLOY. Review and independently validate before committing.")
