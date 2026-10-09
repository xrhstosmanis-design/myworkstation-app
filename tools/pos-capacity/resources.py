"""Sanitized resource evidence: never persist container environment or raw app logs."""
import datetime
import json
import os
import pathlib
import re
import subprocess
import sys
import time

out = pathlib.Path('/tmp/mws-capacity20')
names = ['mws-capacity-app', 'mws-capacity-db']

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def state():
    rows = []
    for name in names:
        try:
            d = json.loads(subprocess.check_output(['docker', 'inspect', name], stderr=subprocess.DEVNULL))[0]
        except subprocess.CalledProcessError:
            rows.append({'name': name, 'present': False})
            continue
        s, c = d['State'], d['HostConfig']
        rows.append({'name': d['Name'], 'running': s['Running'], 'oomKilled': s['OOMKilled'],
                     'exitCode': s['ExitCode'], 'startedAt': s['StartedAt'], 'finishedAt': s['FinishedAt'],
                     'memoryLimitBytes': c['Memory'], 'memorySwapBytes': c['MemorySwap'], 'nanoCPUs': c['NanoCpus']})
    # Count error signals without retaining any original log content.
    log = subprocess.run(['docker', 'logs', 'mws-capacity-app'], capture_output=True).stdout.decode(errors='replace')
    log += subprocess.run(['docker', 'logs', 'mws-capacity-app'], capture_output=True).stderr.decode(errors='replace')
    result = {'at': now(), 'containers': rows, 'applicationSignals': {k: log.count(k) for k in ['P2024', 'AUTH_VALIDATION_UNAVAILABLE', 'JavaScript heap out of memory', 'deadlock detected']},
              'databaseErrorCodes': sorted(set(re.findall(r'\b(?:P\d{4}|42P01|42703|57014|53300|40P01|53200)\b', log))),
              'knownErrorSignals': {k: log.count(k) for k in ['statement timeout', 'connection pool', 'does not exist', 'out of memory', 'transaction timeout', 'Unable to start a transaction', 'Unknown argument']}}
    (out/'container-state.json').write_text(json.dumps(result, indent=2)+'\n')
    print('Sanitized container state', json.dumps(result))
    p = out/'result.json'
    if p.exists():
        d = json.loads(p.read_text())
        print('Sanitized workload summary', json.dumps({k: d.get(k) for k in ['status', 'failure', 'lastRejectedAction', 'capacityAcceptance']}))
    p = out/'resources.jsonl'
    if p.exists():
        data = [json.loads(line) for line in p.read_text().splitlines()]
        print('Sanitized resource last samples', json.dumps(data[-3:]))

if sys.argv[1] == 'monitor':
    with (out/'resources.jsonl').open('a') as f:
        while True:
            try:
                raw = subprocess.check_output(['docker', 'stats', '--no-stream', '--format', '{{json .}}', *names], timeout=15)
                data = [json.loads(line) for line in raw.decode().splitlines()]
                rows = [{k: row.get(k) for k in ['Name', 'CPUPerc', 'MemUsage', 'MemPerc', 'PIDs', 'BlockIO', 'NetIO']} for row in data]
                item = {'at': now(), 'containers': rows}
            except Exception:
                item = {'at': now(), 'diagnosticFailure': True}
            f.write(json.dumps(item)+'\n'); f.flush(); time.sleep(5)
elif sys.argv[1] == 'state':
    state()
elif sys.argv[1] == 'manifest':
    state()
    text = {'at': now(), 'revision': subprocess.check_output(['git', 'rev-parse', 'HEAD']).decode().strip(),
            'profile': os.environ['MWS_CAPACITY_PROFILE'], 'generator': {'cpuCount': os.cpu_count()},
            'resourceModel': os.environ['MWS_CAPACITY_RESOURCE_MODEL'], 'testAppPoolLimit': 5, 'diagnosticPoolLimit': 2,
            'productionAppPoolLimit': 'NOT_MEASURED', 'productionCapacity': 'NOT_TESTED',
            'note': 'Docker caps based on observed Render limits; storage, networking, job/history/device/provider/cloud equivalence NOT TESTED'}
    (out/'model-manifest.json').write_text(json.dumps(text, indent=2)+'\n')
else:
    raise ValueError('Unknown resource command')
