"""Bounded expired-prose cleanup on the existing backup cadence; no DDL/DELETE."""
import json
import datetime
import hashlib
import hmac
import os
import pathlib
import subprocess
import urllib.parse


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
    env['PGDATABASE'] = urllib.parse.urlunsplit(url._replace(query=urllib.parse.urlencode(query)))
    sql = pathlib.Path(__file__).with_suffix('.sql').read_text()
    result = subprocess.run(['psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], env=env, input=sql,
                            text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
    if result.returncode:
        raise ValueError('History cleanup unavailable')
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
        published = subprocess.run(['psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], env=env, input=query,
                                   text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
        if published.returncode:
            raise ValueError('History retention readiness unavailable')
    return receipt


if __name__ == '__main__':
    try:
        print(json.dumps({'event': 'ASSISTANT_HISTORY_CLEANUP', **cleanup()}, separators=(',', ':')))
    except Exception:
        # Never print SQL stderr, URLs, payloads, IDs or credentials into cron logs.
        print('{"event":"ASSISTANT_HISTORY_CLEANUP","state":"FAILED"}')
        raise SystemExit(1)
