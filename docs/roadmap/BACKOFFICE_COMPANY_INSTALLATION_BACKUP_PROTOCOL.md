# Company installation backup candidate

Status: implemented isolated candidate, unmounted and inactive. No live backup, migration, profile switch or account grant is authorized by importing these files. Existing runtime defaults remain unchanged. Actual installation and production acceptance are separate evidence.

## Native sequence

1. The explicit worker CLI `--prepare --profile BASE|CAPTURE --source-revision <exact revision>` reads the fixed observer SQL and an actual whole-database data-only pg_dump. The native COPY multiset/sequence auditor computes the full data digest. The worker signs a bounded 30-minute request after checking exact reviewed source hashes and its actual revision.
2. The CLI consumes that signed request without `--prepare`. It checks actual private/encrypted/versioned S3 configuration, takes a custom-format whole-database dump, uploads a unique request-bound object, verifies version-specific HEAD metadata and downloads that exact version to verify SHA-256 and size.
3. A fresh private Unix-socket PostgreSQL cluster actually restores those bytes. The native auditor compares complete archive COPY data and sequence state with the restored database. Semantic catalogue/guards/global/security observations and full row multiset digest must match the requested source state. A fresh source observation after all work must still match the initial observation. No tables or authority rows are excluded from the full data comparison.
4. Only then does the worker emit a signed proof, fresh for at most ten minutes and bounded by request expiry. It contains digest evidence and the exact immutable object version, rather than accepting a caller's `verified` boolean.
5. The explicit unmounted installation service locks all known tables against writes, rechecks live Super Admin identity, native closed catalogue/guard/global state and fresh signed old-profile worker readiness. It invokes the fixed local CLI with request and proof to recheck actual storage policy, version-specific bytes and a new real source observation under those locks.
6. After another identity/expiry/native-state check, the installation transaction adds the empty-default JSONB column, transitions all enrolled fence plan hashes without changing epochs, reinstalls native guards, checks exact readback and appends per-company security audit evidence. Replay requires the recorded request hash. A new matching worker/profile must subsequently pass runtime readiness; installation does not switch default profiles or grant company rights.

All CLI stages require `--authorize-isolated-installation-backup` and a new output path. No stage is scheduled or executed by import. Request/proof files use mode 0600; temporary dump/plaintext files and the private cluster are removed. Worker source DB operations are SELECT and pg_dump only. Installer migration is available only through an explicit `enabled:true` constructor and explicit invocation, not an HTTP mount or startup bootstrap.

## Bound evidence

`MWS_BACKOFFICE_COMPANY_INSTALL_BACKUP_REQUEST_V1` binds UUID, exact application and worker revisions, reviewed BASE/CAPTURE source/target plan pair, schema, fixed observer SQL hash, source observation hash, source ownership/ACL hash, complete data digest, trusted storage identity and issue/expiry clocks. It refuses unrelated RESET receipts and unprepared event-report profiles.

`MWS_BACKOFFICE_COMPANY_INSTALL_BACKUP_PROOF_V1` binds the exact request JSON SHA-256, those source digests, restored observation digest, native full data digest, archive SHA-256/size, unique object key/exact version, worker revision and verification clock. The storage identity hashes configured bucket, region and HTTPS endpoint; object version strings are never interpreted as ETags or archive checksums.

Semantic restore comparison excludes only source relation/function owners and ACLs, because native restores intentionally use `--no-owner --no-privileges`. Those source ownership/ACL values are separately hashed and must remain unchanged before/after backup and at proof consumption. Function bodies/security settings, views, rules, RLS policies, sequence definitions, schema columns/defaults/constraints/indexes, lifecycle fences and account authority digests remain in the semantic comparison. Complete database rows and sequence state are independently compared without this exclusion.

## Interfaces

- `signCompanyInstallationBackupRequest`, `validateCompanyInstallationBackupRequest` and `validateCompanyInstallationBackupProof` operate on strictly typed canonical signed JSON. Trusted storage configuration is passed by the server or read from its own environment, never supplied by an HTTP request.
- Python `prepare_request`, `run_backup` and `consume_backed_proof` perform the actual external work. There is no injected successful-restore callback or Boolean proof adapter.
- `createBackofficeCompanyInstallation(...).inspect(actor)` returns native state and old/new worker readiness evidence. `install(actor,{explicitAuthorization,packet,requestEnvelope,proofEnvelope})` rechecks the exact packet and performs the guarded transaction only when explicitly enabled.

Isolated mocked-boundary security tests verify rejection paths; they do not establish actual PostgreSQL restoration or hosted object storage acceptance. Native isolated PostgreSQL/CLI coverage and matching app-worker-profile deployment remain required before live activation.
