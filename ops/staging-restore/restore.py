#!/usr/bin/env python3
"""Unwired, single-use tool for the one approved staging destination.

Validation is offline. Execution requires separately provisioned credentials,
an operator-reviewed receipt and an explicit acknowledgement. No production URL
or arbitrary SQL/URL/command is accepted. Receipt data is not authorization.
"""
import argparse
import contextlib
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile

TARGET_ID = 'dpg-db900vks728c73b9phtg-a'
TARGET_DATABASE = 'myworkstation_db_upgrade_test_20261016'
TARGET_USER = TARGET_DATABASE + '_user'
ACK = 'RESTORE ONLY ' + TARGET_ID
MAX_ARCHIVE = 1024 ** 3
CAPACITY = 5_000_000_000  # Conservative 5 GB quota, not measured disk free space.
RESERVE = 512 * 1024 ** 2
RECEIPT_KEYS = {'schema_version', 'target_id', 'source_run_id', 'object_version',
                'archive_bytes', 'archive_sha256', 'restored_bytes_upper_bound',
                'expires_at', 'table_rows'}


class Refusal(Exception):
    pass


def require(condition, code):
    if not condition:
        raise Refusal(code)


def integer(value, minimum, maximum):
    return type(value) is int and minimum <= value <= maximum


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'RECEIPT_DUPLICATE_KEY')
        result[key] = value
    return result


def reject_constant(_value):
    raise Refusal('RECEIPT_NONFINITE_NUMBER')


def regular_fd(path, limit):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and 0 < info.st_size <= limit,
                'INPUT_NOT_BOUNDED_REGULAR_FILE')
        return os.fdopen(fd, 'rb')
    except BaseException:
        os.close(fd)
        raise


def check_expiry(value, now=None):
    try:
        require(type(value) is str and
                re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z', value),
                'RECEIPT_EXPIRY')
        expires = dt.datetime.fromisoformat(value[:-1] + '+00:00')
        current = now or dt.datetime.now(dt.timezone.utc)
        require(current < expires <= current + dt.timedelta(hours=24), 'RECEIPT_EXPIRED')
    except (ValueError, TypeError):
        raise Refusal('RECEIPT_EXPIRY') from None


def read_receipt(path, now=None):
    with regular_fd(path, 1024 * 1024) as source:
        receipt = json.load(source, object_pairs_hook=unique_object,
                            parse_constant=reject_constant)
    require(type(receipt) is dict and set(receipt) == RECEIPT_KEYS, 'RECEIPT_FIELDS')
    require(type(receipt['schema_version']) is int and receipt['schema_version'] == 1,
            'RECEIPT_VERSION')
    require(receipt['target_id'] == TARGET_ID, 'TARGET_MISMATCH')
    require(type(receipt['source_run_id']) is str and
            re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}', receipt['source_run_id']),
            'RECEIPT_SOURCE')
    version = receipt['object_version']
    require(type(version) is str and 1 <= len(version) <= 1024 and
            all(32 < ord(char) < 127 for char in version), 'RECEIPT_OBJECT_VERSION')
    require(integer(receipt['archive_bytes'], 6, MAX_ARCHIVE), 'RECEIPT_SIZE')
    require(type(receipt['archive_sha256']) is str and
            re.fullmatch('[0-9a-f]{64}', receipt['archive_sha256']), 'RECEIPT_HASH')
    require(integer(receipt['restored_bytes_upper_bound'], receipt['archive_bytes'],
                    CAPACITY - RESERVE), 'RECEIPT_CAPACITY')
    check_expiry(receipt['expires_at'], now)
    rows = receipt['table_rows']
    require(type(rows) is dict and 0 < len(rows) <= 1000, 'RECEIPT_TABLES')
    for name, count in rows.items():
        require(re.fullmatch(r'public\.[A-Za-z_][A-Za-z0-9_]{0,62}', name) and
                integer(count, 0, 100_000_000), 'RECEIPT_TABLE_ROWS')
    return receipt


def environment_guard(env, execute=False, acknowledgement=None):
    require(not env.get('DATABASE_URL'), 'INHERITED_DATABASE_URL')
    if execute:
        require(acknowledgement == ACK, 'EXECUTION_ACK_REQUIRED')
        require(env.get('RENDER') == 'true' and env.get('RENDER_REGION') == 'oregon' and
                env.get('RENDER_SERVICE_NAME') == 'myworkstation-staging-restore-20261022',
                'DEDICATED_RENDER_RUNNER_REQUIRED')
        require(env.get('RENDER_SERVICE_ID') and
                env['RENDER_SERVICE_ID'] not in {'srv-d9isenfavr4c73bdh52g',
                                               'crn-dau2gdbncjis73agfh30'},
                'PRODUCTION_SERVICE_REFUSED')
        require(type(env.get('STAGING_RESTORE_PASSWORD')) is str and
                0 < len(env['STAGING_RESTORE_PASSWORD']) <= 4096 and
                '\x00' not in env['STAGING_RESTORE_PASSWORD'], 'STAGING_CREDENTIAL_REQUIRED')


@contextlib.contextmanager
def archive_snapshot(path, receipt):
    # Hash a private independent copy; pg_restore receives THIS fd, never reopens
    # the original pathname. Modifying the original after validation has no effect.
    require(shutil.disk_usage('/tmp').free >= receipt['archive_bytes'] + 64 * 1024 ** 2,
            'LOCAL_SCRATCH_CAPACITY')
    with regular_fd(path, MAX_ARCHIVE) as source, tempfile.TemporaryFile(dir='/tmp', buffering=0) as copy:
        digest, size = hashlib.sha256(), 0
        while True:
            block = source.read(1024 * 1024)
            if not block:
                break
            size += len(block)
            require(size <= receipt['archive_bytes'], 'ARCHIVE_SIZE_MISMATCH')
            digest.update(block)
            copy.write(block)
        require(size == receipt['archive_bytes'], 'ARCHIVE_SIZE_MISMATCH')
        require(digest.hexdigest() == receipt['archive_sha256'], 'ARCHIVE_HASH_MISMATCH')
        copy.seek(0)
        require(copy.read(5) == b'PGDMP', 'ARCHIVE_FORMAT')
        copy.seek(0)
        yield copy


def child_environment(env, readonly):
    # Do not inherit PGHOSTADDR/PGSERVICE/PGOPTIONS/PSQLRC/LD_PRELOAD/PYTHONPATH,
    # credentials or shell settings. Never put a password in argv or evidence.
    return {'PATH': '/usr/local/bin:/usr/bin:/bin', 'LANG': 'C.UTF-8',
            'PGHOST': TARGET_ID, 'PGPORT': '5432', 'PGDATABASE': TARGET_DATABASE,
            'PGUSER': TARGET_USER, 'PGPASSWORD': env['STAGING_RESTORE_PASSWORD'],
            'PGCONNECT_TIMEOUT': '10', 'PGAPPNAME': 'mws-private-staging-restore',
            'PGOPTIONS': '-c statement_timeout=300000 -c lock_timeout=5000' +
                         (' -c default_transaction_read_only=on' if readonly else '')}


def command(args, env, fd=None):
    try:
        result = subprocess.run(args, env=env, stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                pass_fds=(() if fd is None else (fd,)), timeout=900,
                                check=False)
        require(result.returncode == 0, 'DATABASE_COMMAND_FAILED')
        require(len(result.stdout) <= 1024 * 1024, 'DATABASE_OUTPUT_LIMIT')
        return result.stdout.decode('utf-8')
    except (subprocess.SubprocessError, OSError, UnicodeError):
        raise Refusal('DATABASE_COMMAND_FAILED') from None


def query(sql, env):
    output = command(['psql', '-X', '--no-password', '-At', '--set=ON_ERROR_STOP=1',
                      '--command', sql], child_environment(env, True))
    try:
        return json.loads(output, object_pairs_hook=unique_object)
    except (ValueError, TypeError):
        raise Refusal('DATABASE_PROOF_INVALID') from None


USER_NAMESPACE = "n.nspname <> 'information_schema' AND left(n.nspname,3) <> 'pg_'"
IDENTITY_SQL = """SELECT json_build_object(
 'database',current_database(),'user',current_user,
 'bytes',pg_database_size(current_database()),
 'schemas',(SELECT coalesce(json_agg(n.nspname ORDER BY n.nspname),'[]') FROM pg_namespace n WHERE %s),
 'relations',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE %s),
 'functions',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE %s),
 'types',(SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE %s),
 'extensions',(SELECT json_agg(extname ORDER BY extname) FROM pg_extension));""" % ((USER_NAMESPACE,) * 4)


def assert_empty_target(proof, receipt):
    require(type(proof) is dict and proof.get('database') == TARGET_DATABASE and
            proof.get('user') == TARGET_USER, 'LIVE_TARGET_MISMATCH')
    require(proof.get('schemas') == ['public'] and proof.get('extensions') == ['plpgsql'] and
            all(type(proof.get(key)) is int and proof[key] == 0
                for key in ('relations', 'functions', 'types')), 'TARGET_NOT_EMPTY')
    require(integer(proof.get('bytes'), 1, CAPACITY) and
            proof['bytes'] + receipt['restored_bytes_upper_bound'] + RESERVE <= CAPACITY,
            'TARGET_CAPACITY_BOUND')


def restore(copy, receipt, env):
    assert_empty_target(query(IDENTITY_SQL, env), receipt)
    check_expiry(receipt['expires_at'])  # Recheck after copy/connection, before writes.
    fd = copy.fileno()
    command(['pg_restore', '--no-password', '--exit-on-error', '--single-transaction',
             '--no-owner', '--no-privileges', '--dbname', TARGET_DATABASE,
             '/proc/self/fd/' + str(fd)], child_environment(env, False), fd)
    tables = query("SELECT coalesce(json_agg('public.'||c.relname ORDER BY c.relname),'[]') "
                   "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
                   "WHERE n.nspname='public' AND c.relkind IN ('r','p');", env)
    require(type(tables) is list and sorted(tables) == sorted(receipt['table_rows']),
            'RESTORED_TABLE_SET_MISMATCH')
    actual = {}
    for name in sorted(receipt['table_rows']):
        table = name.split('.')[1]  # Strictly validated identifier, still SQL quoted.
        count = query('SELECT to_json(count(*)) FROM public."' + table + '";', env)
        require(type(count) is int and count == receipt['table_rows'][name],
                'RESTORED_ROW_COUNT_MISMATCH')
        actual[name] = count
    return {'table_count': len(actual), 'row_count': sum(actual.values()),
            'counts_sha256': hashlib.sha256(json.dumps(actual, sort_keys=True,
                                separators=(',', ':')).encode()).hexdigest()}


def main(argv=None):
    class SafeParser(argparse.ArgumentParser):
        def error(self, _message):
            raise Refusal('ARGUMENTS_INVALID')
    parser = SafeParser(description=__doc__)
    parser.add_argument('mode', choices=('validate', 'restore'), nargs='?', default='validate')
    parser.add_argument('--receipt', required=True)
    parser.add_argument('--archive', required=True)
    parser.add_argument('--acknowledge')
    try:
        args = parser.parse_args(argv)
        environment_guard(os.environ, args.mode == 'restore', args.acknowledge)
        receipt = read_receipt(args.receipt)
        with archive_snapshot(args.archive, receipt) as copy:
            result = {'status': 'VALIDATED_ONLY', 'target_id': TARGET_ID,
                      'archive_bytes': receipt['archive_bytes'],
                      'archive_sha256': receipt['archive_sha256']}
            if args.mode == 'restore':
                result.update(restore(copy, receipt, os.environ))
                result['status'] = 'STAGING_RESTORE_CHECKS_COMPLETE'
            print(json.dumps(result, sort_keys=True))
        return 0
    except (Refusal, OSError, ValueError, TypeError, KeyError, RecursionError):
        # Never echo subprocess stderr, SQL, user paths, receipt contents or secrets.
        print(json.dumps({'status': 'REFUSED_OR_FAILED'}), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
