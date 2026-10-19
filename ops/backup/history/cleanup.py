"""Bounded expired-prose cleanup on the existing backup cadence; no DDL/DELETE."""
import json
import datetime
import hashlib
import hmac
import os
import pathlib
import re
import subprocess
import urllib.parse


class CleanupUnavailable(ValueError):
    def __init__(self, code):
        super().__init__('History cleanup unavailable')
        self.code = code


def sql_failure(stderr):
    state = re.search(r'ERROR:\s+([0-9A-Z]{5})\b', stderr or '')
    return CleanupUnavailable('SQL_' + state.group(1) if state else 'DATABASE_UNAVAILABLE')


def cleanup(env=None):
    env = dict(os.environ if env is None else env)
    if env.get('ASSISTANT_HISTORY_CLEANUP_ENABLED') != 'true':
        return {'state': 'DISABLED'}
    url = urllib.parse.urlsplit(env['DATABASE_URL'])
    query = urllib.parse.parse_qsl(url.query, keep_blank_values=True)
    schema = next((v for k, v in query if k == 'schema'), None)
    query = [(k, v) for k, v in query if k not in ('schema', 'connection_limit', 'pool_timeout', 'pgbouncer')]
    if schema is not None:
        # Only deployment/native isolated schemas, never shell/SQL interpolation.
        if not schema or len(schema) > 63 or not all(c.isascii() and (c.isalnum() or c == '_') for c in schema):
            raise ValueError('Invalid history cleanup schema')
        query.append(('options', '-csearch_path=' + schema))
    # libpq does not expand a connection URI supplied only as PGDATABASE.
    # Pass the URI explicitly, with its password removed from process arguments.
    netloc = url.netloc
    if url.password is not None:
        env['PGPASSWORD'] = urllib.parse.unquote(url.password)
        userinfo, host = netloc.rsplit('@', 1)
        netloc = userinfo.split(':', 1)[0] + '@' + host
    connection = urllib.parse.urlunsplit(url._replace(netloc=netloc, query=urllib.parse.urlencode(query)))
    env['PGDATABASE'] = urllib.parse.unquote(url.path.lstrip('/'))
    args = ['psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '--dbname', connection]
    sql = pathlib.Path(__file__).with_suffix('.sql').read_text()
    result = subprocess.run(args, env=env, input=sql,
                            text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
    if result.returncode:
        raise sql_failure(result.stderr)
    receipt = json.loads(result.stdout.strip())
    if receipt.get('state') not in ('UNAVAILABLE', 'BUSY', 'COMPLETED') or set(receipt) - {'state', 'erased', 'deferredScopes'}:
        raise ValueError('Invalid history cleanup receipt')
    if receipt['state'] == 'COMPLETED':
        if type(receipt.get('erased')) is not int or not 0 <= receipt['erased'] <= 256 or type(receipt.get('deferredScopes')) is not int or not 0 <= receipt['deferredScopes'] <= 256:
            raise ValueError('Invalid history cleanup counters')
        secret = env.get('BACKUP_MONITOR_SECRET', '')
        revision = env.get('RENDER_GIT_COMMIT', '')
        if len(secret) < 24 or len(revision) != 40 or any(c not in '0123456789abcdef' for c in revision):
            raise ValueError('Verified history worker configuration unavailable')
        manifest = json.loads((pathlib.Path(__file__).parent.parent / 'lifecycle/manifest.json').read_text())
        compact = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':'))
        protocol = 'MWS_ASSISTANT_HISTORY_RETENTION_V1'
        pulse = compact({'protocol': protocol, 'manifestHash': hashlib.sha256(compact(manifest).encode()).hexdigest(),
                         'workerRevision': revision, 'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'state': 'COMPLETED'})
        mac = hmac.new(secret.encode(), (protocol + '\n' + pulse).encode(), hashlib.sha256).hexdigest()
        literal = lambda value: "'" + value.replace("'", "''") + "'"
        query = 'INSERT INTO "StoreLifecycleRuntime"("id","heartbeatJson","mac") VALUES(\'assistant-history-cleanup\',' + literal(pulse) + ',' + literal(mac) + ') ON CONFLICT("id") DO UPDATE SET "heartbeatJson"=EXCLUDED."heartbeatJson","mac"=EXCLUDED."mac";'
        published = subprocess.run(args, env=env, input=query,
                                   text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
        if published.returncode:
            raise sql_failure(published.stderr)
    return receipt


if __name__ == '__main__':
    try:
        print(json.dumps({'event': 'ASSISTANT_HISTORY_CLEANUP', **cleanup()}, separators=(',', ':')))
    except Exception as error:
        # Never print SQL stderr, URLs, payloads, IDs or credentials into cron logs.
        print(json.dumps({'event': 'ASSISTANT_HISTORY_CLEANUP', 'state': 'FAILED', 'code': error.code if isinstance(error, CleanupUnavailable) else 'CLEANUP_UNAVAILABLE'}, separators=(',', ':')))
        raise SystemExit(1)
