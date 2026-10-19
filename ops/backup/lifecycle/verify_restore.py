"""Private full restore + selective RESET/undo. Never connects to a live database.

Only explicit Unix-socket connections to this process's fresh private cluster are
used. Business rows stay in mode-0600 temporary files and are never logged.
"""
import hashlib
import importlib.util
import json
import os
import pathlib
import pwd
import shutil
import subprocess
import tempfile
import uuid

MAX_ROW = 8 * 1024 * 1024
MAX_ROWS = 500000
ROW_DIGEST_FORMAT = 'MWS_ROW_MULTISET_SHA256_V1'

def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))

def sha(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()

def ident(value):
    if not isinstance(value, str) or not value or len(value) > 200 or '\x00' in value:
        raise ValueError('Invalid identifier')
    return '"' + value.replace('"', '""') + '"'

def literal(value):
    if not isinstance(value, str) or '\x00' in value:
        raise ValueError('Invalid literal')
    return "'" + value.replace("'", "''") + "'"

def selected(nodes, schema, name, store, alias='t', depth=0):
    if depth > 300:
        raise ValueError('Ownership cycle')
    owner = nodes[name]['owner']
    if owner['kind'] in ('ROOT', 'DIRECT', 'BASE_STORE'):
        column = {'ROOT': 'id', 'DIRECT': 'storeId', 'BASE_STORE': 'baseStoreId'}[owner['kind']]
        return 'COALESCE(' + alias + '.' + ident(column) + '=' + literal(store) + ',false)'
    if owner['kind'] not in ('CHILD', 'LINK'):
        raise ValueError('Unknown ownership')
    parent = owner['parent']
    p = 'p' + str(depth)
    conditions = [alias + '.' + ident(a) + '=' + p + '.' + ident(b) for a, b in owner['columns']]
    conditions += ['COALESCE(' + alias + '.' + ident(k) + '=' + literal(v) + ',false)' for k, v in owner.get('match', {}).items()]
    conditions.append(selected(nodes, schema, parent, store, p, depth + 1))
    return 'EXISTS (SELECT 1 FROM ' + ident(schema) + '.' + ident(parent) + ' ' + p + ' WHERE ' + ' AND '.join(conditions) + ')'

def delete_order(snapshot, descriptor, schema):
    remaining = {t['name'] for t in snapshot['tables'] if t['action'] == 'REMOVE'}
    edges = descriptor['fks'] + descriptor['links']
    order = []
    while remaining:
        ready = sorted(n for n in remaining if not any(e['parentSchema'] == schema and e['childSchema'] == schema and e['parent'] == n and e['child'] != n and e['child'] in remaining and not e.get('applicationReference') for e in edges))
        if not ready:
            raise ValueError('Cyclic deletion dependencies')
        order.extend(ready)
        remaining.difference_update(ready)
    return order

class PrivatePostgres:
    def __init__(self, root):
        self.root = pathlib.Path(root)
        self.data = self.root / 'pgdata'
        self.socket = self.root / 'socket'
        self.socket.mkdir(mode=0o700)
        self.user = None
        if os.geteuid() == 0:
            account = pwd.getpwnam('postgres')
            self.user = dict(user=account.pw_uid, group=account.pw_gid, extra_groups=[])
            os.chown(self.root, account.pw_uid, account.pw_gid)
            os.chown(self.socket, account.pw_uid, account.pw_gid)
        self.env = {'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'HOME': str(self.root), 'LC_ALL': 'C.UTF-8', 'PGHOST': str(self.socket), 'PGPORT': '55439', 'PGUSER': 'postgres', 'PGDATABASE': 'postgres', 'PGOPTIONS': '-c TimeZone=UTC -c DateStyle=ISO,YMD -c extra_float_digits=3 -c bytea_output=hex'}
        self.started = False

    def run(self, args, **options):
        result = subprocess.run(args, timeout=300, env=self.env, **(self.user or {}), stderr=subprocess.PIPE, **options)
        if result.returncode:
            # Do not expose row values, SQL, archive paths or credentials.
            raise ValueError('Private PostgreSQL command failed: ' + pathlib.Path(args[0]).name)
        return result

    def __enter__(self):
        self.run(['initdb', '-D', str(self.data), '-U', 'postgres', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8'], stdout=subprocess.DEVNULL)
        self.run(['pg_ctl', '-D', str(self.data), '-l', str(self.root / 'postgres.log'), '-o', "-F -k " + str(self.socket) + " -h '' -p 55439 -c max_connections=5 -c shared_buffers=16MB -c work_mem=1MB -c maintenance_work_mem=16MB -c max_parallel_workers=0 -c max_worker_processes=0", '-w', 'start'], stdout=subprocess.DEVNULL)
        self.started = True
        return self

    def __exit__(self, *_):
        if self.started:
            self.run(['pg_ctl', '-D', str(self.data), '-m', 'immediate', '-w', 'stop'], stdout=subprocess.DEVNULL)

    def query(self, sql):
        return self.run(['psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], input=sql.encode(), stdout=subprocess.PIPE).stdout

    def script(self, filename):
        with open(filename, 'rb') as stream:
            self.run(['psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1'], stdin=stream, stdout=subprocess.DEVNULL)

    def rows_to_file(self, sql, filename):
        with open(filename, 'wb') as out:
            os.chmod(filename, 0o600)
            self.run(['psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], input=sql.encode(), stdout=out)

def row_digest(filename):
    digest, count, size, hashes = hashlib.sha256((ROW_DIGEST_FORMAT + chr(0)).encode()), 0, 0, []
    with open(filename, 'rb') as stream:
        while True:
            row = stream.readline(MAX_ROW + 2)
            if not row:
                break
            if not row.endswith(b'\n') or len(row) > MAX_ROW + 1:
                raise ValueError('Row size or framing limit')
            row = row[:-1]
            count += 1
            if count > MAX_ROWS:
                raise ValueError('Row limit')
            size += len(row)
            hashes.append(hashlib.sha256(str(len(row)).encode('ascii') + b':' + row).digest())
    for value in sorted(hashes):
        digest.update(value)
    return {'rowCount': count, 'sha256': digest.hexdigest(), 'sourceBytes': size}

def verify_archive(archive, job, manifest, audit_module):
    if job.get('protocol') != 'MWS_STORE_RECOVERY_JOB_V1':
        raise ValueError('Unknown job protocol')
    operation = str(uuid.UUID(job['operationId']))
    if operation != job['operationId']:
        raise ValueError('Invalid operation')
    snapshot = json.loads(job['snapshotMetadataJson'])
    descriptor = json.loads(job['schemaDescriptorJson'])
    metadata = {k: v for k, v in snapshot.items() if k != 'snapshotHash'}
    if sha(compact(metadata)) != snapshot['snapshotHash'] or sha(compact(descriptor)) != snapshot['schemaSignature'] or sha(compact(manifest)) != snapshot['planHash'] or snapshot['scope']['mode'] != 'RESET' or not manifest.get('streaming') or snapshot.get('rowDigestFormat') != ROW_DIGEST_FORMAT:
        raise ValueError('Job metadata binding differs')
    nodes = {t['name']: t for t in manifest['tables']}
    if len(nodes) != len(snapshot['tables']) or set(nodes) != {t['name'] for t in snapshot['tables']} or any(t['action'] != nodes[t['name']]['reset'] or 'rows' in t for t in snapshot['tables']):
        raise ValueError('Snapshot differs from reviewed scope')
    schema, store = job['schema'], snapshot['scope']['storeId']
    order = delete_order(snapshot, descriptor, schema)
    spec = importlib.util.spec_from_file_location('copy_audit', audit_module)
    auditor = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(auditor)
    with tempfile.TemporaryDirectory(prefix='mws-private-restore-') as root:
        root = pathlib.Path(root)
        os.chmod(root, 0o700)
        local_archive = root / 'source.dump'
        shutil.copyfile(archive, local_archive)
        os.chmod(local_archive, 0o600)
        with PrivatePostgres(root) as pg:
            if pg.user:
                os.chown(local_archive, pg.user['user'], pg.user['group'])
            expected, before, after = [root / name for name in ('expected.sql', 'before.sql', 'after.sql')]
            pg.run(['pg_restore', '--exit-on-error', '--no-owner', '--no-privileges', '--dbname=postgres', str(local_archive)], stdout=subprocess.DEVNULL)
            # Redirect through parent-owned file descriptors, so no world access.
            with open(expected, 'wb') as output:
                pg.run(['pg_restore', '--data-only', '--no-owner', '--no-privileges', '--file=-', str(local_archive)], stdout=output)
            with open(before, 'wb') as output:
                pg.run(['pg_dump', '--data-only', '--no-owner', '--no-privileges', 'postgres'], stdout=output)
            full_audit = auditor.compare(expected, before)
            files = {}
            for table in snapshot['tables']:
                name = table['name']
                keys = [k['name'] for k in descriptor['primaryKeys'] if k['table'] == name]
                if not keys:
                    raise ValueError('Missing exact primary key')
                filename = root / (str(len(files)) + '.jsonl')
                sql = 'SELECT row_to_json(t)::text FROM ' + ident(schema) + '.' + ident(name) + ' t WHERE ' + selected(nodes, schema, name, store) + ' ORDER BY ' + ','.join('t.' + ident(k) for k in keys) + ';'
                pg.rows_to_file(sql, filename)
                if row_digest(filename) != {k: table[k] for k in ('rowCount', 'sha256', 'sourceBytes')}:
                    raise ValueError('Archived selected data differs from preparation')
                cols = [c['name'] for c in descriptor['columns'] if c['table'] == name and not c['generated']]
                if not cols:
                    raise ValueError('Missing restoration columns')
                copyfile = root / (str(len(files)) + '.copy')
                copy_sql = 'COPY (SELECT ' + ','.join('t.' + ident(c) for c in cols) + ' FROM ' + ident(schema) + '.' + ident(name) + ' t WHERE ' + selected(nodes, schema, name, store) + ' ORDER BY ' + ','.join('t.' + ident(k) for k in keys) + ') TO STDOUT;'
                pg.rows_to_file(copy_sql, copyfile)
                files[name] = (filename, sql, copyfile, cols)
            script = root / 'selective.sql'
            with open(script, 'wb') as out:
                def emit(value):
                    out.write(value.encode('utf-8'))
                os.chmod(script, 0o600)
                emit("BEGIN; SET LOCAL standard_conforming_strings=on; SELECT set_config('mws.lifecycle_operation'," + literal(operation) + ",true);\n")
                for name in order:
                    expected_count = next(t['rowCount'] for t in snapshot['tables'] if t['name'] == name)
                    body = 'DECLARE affected bigint; BEGIN DELETE FROM ' + ident(schema) + '.' + ident(name) + ' t WHERE ' + selected(nodes, schema, name, store) + '; GET DIAGNOSTICS affected=ROW_COUNT; IF affected<>' + str(expected_count) + " THEN RAISE EXCEPTION 'Selective delete count differs'; END IF; END;"
                    emit('DO ' + literal(body) + ';\n')
                # Disable only the explicitly reviewed INSERT business hooks, in
                # this private restoration transaction. Lifecycle/FK guards stay.
                hooks = []
                for name in order:
                    for trigger in nodes[name].get('existingTriggers', []):
                        if trigger['mask'] & 4:
                            if trigger['mask'] & 8:
                                raise ValueError('Mixed DELETE restore trigger requires review')
                            hooks.append((name, trigger))
                            emit('ALTER TABLE ' + ident(schema) + '.' + ident(name) + ' DISABLE TRIGGER ' + ident(trigger['name']) + ';\n')
                for name in reversed(order):
                    _, _, copyfile, cols = files[name]
                    emit('COPY ' + ident(schema) + '.' + ident(name) + ' (' + ','.join(ident(c) for c in cols) + ') FROM stdin;\n')
                    with open(copyfile, 'rb') as rows:
                        shutil.copyfileobj(rows, out)
                    emit('\\.\n')
                for name, trigger in hooks:
                    emit('ALTER TABLE ' + ident(schema) + '.' + ident(name) + (' ENABLE ALWAYS TRIGGER ' if trigger['enabled'] == 'A' else ' ENABLE TRIGGER ') + ident(trigger['name']) + ';\n')
                emit('COMMIT;\n')
            # Verify archived business-hook identity before allowing even a
            # private selective restore to bypass its INSERT side effects.
            for name, trigger in hooks:
                value = pg.query('SELECT encode(sha256(convert_to(p.prosrc,\'UTF8\')),\'hex\') FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid WHERE n.nspname=' + literal(schema) + ' AND c.relname=' + literal(name) + ' AND t.tgname=' + literal(trigger['name']) + ';').decode().strip()
                if value != trigger['bodySha256']:
                    raise ValueError('Archived business hook differs')
            pg.script(script)
            restored_tables = []
            for table in snapshot['tables']:
                filename, sql, _, _ = files[table['name']]
                pg.rows_to_file(sql, filename)
                restored_tables.append({'name': table['name'], 'action': table['action'], **row_digest(filename)})
            restored = {**metadata, 'tables': restored_tables}
            if sha(compact(restored)) != snapshot['snapshotHash']:
                raise ValueError('Selective restored snapshot differs')
            with open(after, 'wb') as output:
                pg.run(['pg_dump', '--data-only', '--no-owner', '--no-privileges', 'postgres'], stdout=output)
            selective_audit = auditor.compare(before, after)
            return {'restoredSnapshotHash': snapshot['snapshotHash'], 'selectiveRestoreVerified': True, 'controlsUnchanged': True, 'fullRestoreAudit': full_audit, 'selectiveRestoreAudit': selective_audit}
