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
import re
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

PRIVATE_POSTGRES_COMMANDS = frozenset({'initdb', 'pg_ctl', 'psql', 'pg_dump', 'pg_restore'})
PRIVATE_SQLSTATE_CATEGORIES = {
    '42601': 'SQLSTATE_42601_SQL_SYNTAX', '42704': 'SQLSTATE_42704_UNDEFINED_OBJECT',
    '42P01': 'SQLSTATE_42P01_MISSING_RELATION', '42703': 'SQLSTATE_42703_MISSING_COLUMN',
    '42883': 'SQLSTATE_42883_MISSING_FUNCTION_OR_OPERATOR', '3F000': 'SQLSTATE_3F000_MISSING_SCHEMA',
    '42P06': 'SQLSTATE_42P06_DUPLICATE_SCHEMA', '42P07': 'SQLSTATE_42P07_DUPLICATE_RELATION',
    '42710': 'SQLSTATE_42710_DUPLICATE_OBJECT', '42501': 'SQLSTATE_42501_PERMISSION',
    '22023': 'SQLSTATE_22023_INVALID_PARAMETER_VALUE', '0A000': 'SQLSTATE_0A000_FEATURE_NOT_SUPPORTED',
    'XX000': 'SQLSTATE_XX000_INTERNAL_ERROR', '23502': 'SQLSTATE_23502_NOT_NULL_CONSTRAINT',
    '23503': 'SQLSTATE_23503_FOREIGN_KEY_CONSTRAINT', '23505': 'SQLSTATE_23505_UNIQUE_CONSTRAINT',
    '23514': 'SQLSTATE_23514_CHECK_CONSTRAINT', '53100': 'SQLSTATE_53100_DISK_FULL',
    '53200': 'SQLSTATE_53200_MEMORY', '08006': 'SQLSTATE_08006_CONNECTION_FAILURE',
    '58P01': 'SQLSTATE_58P01_UNDEFINED_FILE', '42P16': 'SQLSTATE_42P16_INVALID_TABLE_DEFINITION',
    '42P17': 'SQLSTATE_42P17_INVALID_OBJECT_DEFINITION', '42804': 'SQLSTATE_42804_DATATYPE_MISMATCH',
}
PRIVATE_22023_SETTINGS = frozenset({'composite_type_mismatch', 'timezone', 'lc_collate', 'lc_ctype', 'lc_messages', 'lc_monetary', 'lc_numeric', 'lc_time', 'client_encoding', 'server_encoding', 'default_toast_compression', 'default_table_access_method', 'default_tablespace', 'temp_tablespaces', 'session_replication_role', 'xmloption', 'row_security', 'transaction_timeout', 'restrict_nonsystem_relation_kind', 'search_path', 'datestyle', 'extra_float_digits'})
PRIVATE_22023_OPERATIONS = frozenset({'SET', 'CREATE_COLLATION', 'CREATE_FUNCTION', 'CREATE_INDEX', 'CREATE_TABLE', 'ALTER_TABLE', 'COPY', 'SELECT_SETVAL', 'SELECT_SET_CONFIG', 'CREATE_SCHEMA', 'CREATE_SEQUENCE', 'ALTER_SEQUENCE', 'CREATE_EXTENSION', 'ALTER_TYPE', 'CREATE_TYPE', 'CREATE_TRIGGER', 'COMMENT', 'GRANT', 'ALTER_FUNCTION', 'ALTER_DATABASE'})
PRIVATE_22023_DETAILS = frozenset({'SETTING_VALUE', 'SETTING_NAME', 'SETTING_CONTEXT', 'SEQUENCE_BOUNDS', 'SEQUENCE_OPTIONS', 'LOCALE', 'JSON_ARGUMENT', 'STORAGE_OPTION', 'EXTENSION_OPTION'})
PRIVATE_22023_PARAMETER_NAMES = PRIVATE_22023_SETTINGS | frozenset({'autovacuum_enabled', 'fillfactor', 'deduplicate_items', 'toast_tuple_target', 'vacuum_index_cleanup', 'vacuum_truncate', 'parallel_workers', 'autovacuum_vacuum_threshold', 'autovacuum_vacuum_max_threshold', 'autovacuum_vacuum_scale_factor', 'autovacuum_vacuum_insert_threshold', 'autovacuum_vacuum_insert_scale_factor', 'autovacuum_analyze_threshold', 'autovacuum_analyze_scale_factor', 'autovacuum_vacuum_cost_delay', 'autovacuum_vacuum_cost_limit', 'autovacuum_freeze_min_age', 'autovacuum_freeze_max_age', 'autovacuum_freeze_table_age', 'autovacuum_multixact_freeze_min_age', 'autovacuum_multixact_freeze_max_age', 'autovacuum_multixact_freeze_table_age', 'user_catalog_table', 'security_barrier', 'security_invoker', 'check_option', 'buffering', 'pages_per_range', 'autosummarize', 'fastupdate', 'gin_pending_list_limit', 'siglen', 'default_version', 'module_pathname', 'relocatable', 'requires', 'schema', 'superuser', 'trusted', 'no_relocate', 'locale', 'provider', 'deterministic', 'version', 'rules', 'publish_generated_columns', 'publish_via_partition_root'})
PRIVATE_22023_CATEGORIES = (frozenset('SQLSTATE_22023_SETTING_' + name.upper() for name in PRIVATE_22023_SETTINGS)
    | frozenset('SQLSTATE_22023_' + name for name in PRIVATE_22023_DETAILS)
    | frozenset('SQLSTATE_22023_OPERATION_' + name for name in PRIVATE_22023_OPERATIONS)
    | frozenset('SQLSTATE_22023_PARAMETER_NAME_' + name.upper() for name in PRIVATE_22023_PARAMETER_NAMES)
    | frozenset('SQLSTATE_22023_PARAMETER_OPERATION_' + name for name in PRIVATE_22023_OPERATIONS))
PRIVATE_POSTGRES_CATEGORIES = frozenset({'UNSUPPORTED_SETTING', 'ARCHIVE_VERSION', 'PERMISSION', 'MISSING_ROLE', 'MISSING_TYPE', 'COLLATION', 'DUPLICATE_RELATION', 'ENCODING', 'MEMORY', 'PRIVATE_CONNECTION', 'DUPLICATE_SCHEMA', 'MISSING_SCHEMA', 'MISSING_FUNCTION', 'MISSING_EXTENSION', 'MISSING_RELATION', 'MISSING_COLUMN', 'MISSING_OPERATOR', 'CONSTRAINT', 'SQL_SYNTAX', 'ARCHIVE_IO', 'FILE_IO', 'RESOURCE', 'UNKNOWN'}) | frozenset(PRIVATE_SQLSTATE_CATEGORIES.values()) | PRIVATE_22023_CATEGORIES


def private_22023_operation(remainder):
    statement = re.search(r'\bSTATEMENT:\s+([^\n]{0,100})', remainder)
    if statement:
        text = statement.group(1).upper()
        operations = [('SELECT_SETVAL', r'SELECT\s+(?:PG_CATALOG\.)?SETVAL\s*\('), ('SELECT_SET_CONFIG', r'SELECT\s+(?:PG_CATALOG\.)?SET_CONFIG\s*\('), ('CREATE_COLLATION', r'CREATE\s+COLLATION\b'), ('CREATE_FUNCTION', r'CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b'), ('CREATE_INDEX', r'CREATE\s+(?:UNIQUE\s+)?INDEX\b'), ('CREATE_TABLE', r'CREATE\s+TABLE\b'), ('ALTER_TABLE', r'ALTER\s+TABLE\b'), ('COPY', r'COPY\b'), ('SET', r'SET\b'), ('CREATE_SCHEMA', r'CREATE\s+SCHEMA\b'), ('CREATE_SEQUENCE', r'CREATE\s+SEQUENCE\b'), ('ALTER_SEQUENCE', r'ALTER\s+SEQUENCE\b'), ('CREATE_EXTENSION', r'CREATE\s+EXTENSION\b'), ('ALTER_TYPE', r'ALTER\s+TYPE\b'), ('CREATE_TYPE', r'CREATE\s+TYPE\b'), ('CREATE_TRIGGER', r'CREATE\s+(?:CONSTRAINT\s+)?TRIGGER\b'), ('COMMENT', r'COMMENT\s+ON\b'), ('GRANT', r'GRANT\b'), ('ALTER_FUNCTION', r'ALTER\s+FUNCTION\b'), ('ALTER_DATABASE', r'ALTER\s+DATABASE\b')]
        for name, pattern in operations:
            if re.match(pattern, text):
                return name
    return None


def private_22023_category(primary, remainder):
    """Map known server templates/operation families to constants, never text."""
    setting = re.search(r'invalid value for parameter "([a-z_]+)"', primary.lower())
    if setting:
        name = setting.group(1)
        return 'SQLSTATE_22023_SETTING_' + name.upper() if name in PRIVATE_22023_SETTINGS else 'SQLSTATE_22023_SETTING_VALUE'
    patterns = [
        ('SETTING_NAME', r'unrecognized (?:configuration )?parameter'),
        ('SETTING_CONTEXT', r'parameter .{0,200} cannot be changed|cannot set parameter'),
        ('SEQUENCE_BOUNDS', r'setval: value .{0,200} is out of bounds'),
        ('SEQUENCE_OPTIONS', r'(?:minvalue|maxvalue|increment|cache|start value).{0,200}(?:must be|cannot|invalid|out of)'),
        ('LOCALE', r'invalid locale|could not create locale|invalid collation|collation .{0,200} is incompatible'),
        ('JSON_ARGUMENT', r'cannot (?:get|call|extract|delete).{0,100}(?:array|object|scalar)|json.{0,100}(?:must be|cannot)'),
        ('STORAGE_OPTION', r'unrecognized (?:storage )?option|invalid value for .{0,100} option'),
        ('EXTENSION_OPTION', r'extension .{0,200}(?:version|update script|installation script)'),
    ]
    for name, pattern in patterns:
        if re.search(pattern, primary.lower()):
            if name == 'SETTING_NAME':
                parameter = re.search(r'unrecognized (?:configuration )?parameter \"([a-z_]+)\"', primary.lower())
                if parameter and parameter.group(1) in PRIVATE_22023_PARAMETER_NAMES:
                    return 'SQLSTATE_22023_PARAMETER_NAME_' + parameter.group(1).upper()
                operation = private_22023_operation(remainder)
                if operation:
                    return 'SQLSTATE_22023_PARAMETER_OPERATION_' + operation
            return 'SQLSTATE_22023_' + name
    operation = private_22023_operation(remainder)
    if operation:
        return 'SQLSTATE_22023_OPERATION_' + operation
    return PRIVATE_SQLSTATE_CATEGORIES['22023']


class PrivatePostgresCommandError(ValueError):
    def __init__(self, command, exit_code, category):
        self.command = command if isinstance(command, str) and command in PRIVATE_POSTGRES_COMMANDS else 'UNKNOWN_COMMAND'
        self.exit_code = exit_code if type(exit_code) is int and -255 <= exit_code <= 255 else -1
        self.category = category if isinstance(category, str) and category in PRIVATE_POSTGRES_CATEGORIES else 'UNKNOWN'
        super().__init__(f'Private PostgreSQL command failed: {self.command} [exit={self.exit_code}, category={self.category}]')


def private_command_failure_category(stderr):
    """Return only an allowlisted diagnostic; never return captured stderr."""
    if isinstance(stderr, (bytes, str)):
        sample = stderr if len(stderr) <= 131072 else stderr[:65536] + (b'\n' if isinstance(stderr, bytes) else '\n') + stderr[-65536:]
        text = (sample.decode('utf-8', errors='replace') if isinstance(sample, bytes) else sample).lower()
    else:
        text = ''
    patterns = [
        ('UNSUPPORTED_SETTING', r'(?:unrecognized|unsupported) configuration parameter'),
        ('ARCHIVE_VERSION', r'unsupported version.*file header|archive version|unsupported archive format'),
        ('PERMISSION', r'permission denied|must be (?:owner|superuser)|not permitted|authentication failed'),
        ('MISSING_ROLE', r'role [^\n]{0,200} does not exist'),
        ('MISSING_TYPE', r'type [^\n]{0,200} does not exist'),
        ('COLLATION', r'collation [^\n]{0,200} does not exist|collation[^\n]{0,200}version mismatch|invalid locale|invalid collation'),
        ('DUPLICATE_RELATION', r'relation [^\n]{0,200} already exists|duplicate table'),
        ('ENCODING', r'invalid byte sequence|character [^\n]{0,200} has no equivalent|encoding mismatch|conversion between[^\n]{0,200}encoding'),
        ('MEMORY', r'out of memory|cannot allocate memory|memory exhausted|could not resize shared memory'),
        ('PRIVATE_CONNECTION', r'could not connect to server|connection (?:refused|timed out)|connection to server[^\n]{0,200}failed|server closed[^\n]{0,200}connection'),
        ('DUPLICATE_SCHEMA', r'schema [^\n]{0,200} already exists'),
        ('MISSING_SCHEMA', r'schema [^\n]{0,200} does not exist'),
        ('MISSING_FUNCTION', r'function [^\n]{0,200} does not exist'),
        ('MISSING_EXTENSION', r'could not open extension control file|extension [^\n]{0,200} (?:does not exist|is not available)|no installation script[^\n]{0,200}extension'),
        ('MISSING_COLUMN', r'column [^\n]{0,200} does not exist'),
        ('MISSING_RELATION', r'relation [^\n]{0,200} does not exist'),
        ('MISSING_OPERATOR', r'operator(?: [^\n]{0,200})? does not exist'),
        ('CONSTRAINT', r'violates (?:not-null|unique|foreign key|check|exclusion) constraint|contains null values|could not create unique index'),
        ('SQL_SYNTAX', r'syntax error (?:at|in)|unterminated (?:quoted|dollar-quoted)|invalid input syntax'),
        ('ARCHIVE_IO', r'could not read from input file|input file is too short|unexpected end of file|does not appear to be a valid archive|input file appears to be a text format dump|could not uncompress data|decompression failed'),
        ('FILE_IO', r'could not open (?:input|output) file|could not read (?:input|output) file|could not write (?:to )?(?:file|output file)|no such file or directory'),
        ('RESOURCE', r'no space left on device|disk quota exceeded|too many open files|resource temporarily unavailable'),
    ]
    return next((category for category, pattern in patterns if re.search(pattern, text)), 'UNKNOWN')


def private_server_log_category(logfile, start_offset=0):
    """Inspect bounded private log bytes; publish only explicitly known states."""
    try:
        with open(logfile, 'rb') as stream:
            stream.seek(0, 2)
            end = stream.tell()
            if type(start_offset) is not int or start_offset < 0 or start_offset >= end:
                return 'UNKNOWN'
            stream.seek(start_offset)
            if end - start_offset <= 131072:
                sample = stream.read(131072)
            else:
                sample = stream.read(65536)
                stream.seek(end - 65536)
                sample += b'\n' + stream.read(65536)
            text = sample.decode('utf-8', errors='replace')
    except (OSError, TypeError, ValueError):
        return 'UNKNOWN'
    errors = list(re.finditer(r'(?m)^\d{4}-\d{2}-\d{2}[^\n]{0,160}\b(?:ERROR|FATAL|PANIC):\s+([A-Z0-9]{5}):([^\n]{0,4096})', text))
    if not errors:
        return 'UNKNOWN'
    error = errors[-1]
    if error.group(1) == '22023':
        return private_22023_category(error.group(2), text[error.end():])
    return PRIVATE_SQLSTATE_CATEGORIES.get(error.group(1), 'UNKNOWN')


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
        logfile = self.root / 'postgres.log' if getattr(self, 'root', None) is not None else None
        try:
            log_offset = logfile.stat().st_size if logfile is not None else 0
        except OSError:
            log_offset = 0
        result = subprocess.run(args, timeout=300, env=self.env, **(self.user or {}), stderr=subprocess.PIPE, **options)
        if result.returncode:
            # Do not expose row values, SQL, archive paths or credentials.
            command = pathlib.Path(str(args[0])).name
            if command not in PRIVATE_POSTGRES_COMMANDS:
                command = 'UNKNOWN_COMMAND'
            code = result.returncode if type(result.returncode) is int and -255 <= result.returncode <= 255 else -1
            category = private_command_failure_category(result.stderr)
            if category == 'UNKNOWN' and logfile is not None:
                category = private_server_log_category(logfile, log_offset)
            raise PrivatePostgresCommandError(command, code, category)
        return result

    def __enter__(self):
        self.run(['initdb', '-D', str(self.data), '-U', 'postgres', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8'], stdout=subprocess.DEVNULL)
        self.run(['pg_ctl', '-D', str(self.data), '-l', str(self.root / 'postgres.log'), '-o', "-F -k " + str(self.socket) + " -h '' -p 55439 -c max_connections=5 -c shared_buffers=16MB -c work_mem=1MB -c maintenance_work_mem=16MB -c max_parallel_workers=0 -c max_worker_processes=0 -c log_error_verbosity=verbose", '-w', 'start'], stdout=subprocess.DEVNULL)
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
    if manifest.get('executionDisabled') is True:
        raise ValueError('Scoped store recovery is unavailable for the reports-only profile')
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
