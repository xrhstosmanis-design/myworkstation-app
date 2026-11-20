"""Closed CURRENT COMPANY source/target readiness. SELECT-only observation.

The reviewed compiler artifact is authority. Actual observations can only match
or fail; they never create/update a policy or accepted schema fingerprint.
"""
import hashlib
import json
from company_source_root import source_file, verify_runtime_copy
from backoffice_company_profile import current_company_manifest, CURRENT_PHASE_HASHES, CURRENT_SOURCE_FENCE_PLAN_HASH

SOURCE_PATHS = ('ops/backup/lifecycle/manifest.json', 'ops/backup/lifecycle/column-review.json', 'ops/backup/lifecycle/monthly-inventory-capture-manifest.proposed.json', 'ops/backup/lifecycle/monthly-inventory-capture-column-review.proposed.json', 'server/src/services/store-lifecycle-executor.js', 'server/src/services/store-lifecycle-worker-ready.js', 'server/src/services/store-lifecycle-manifest.js', 'ops/backup/lifecycle/worker.py', 'ops/backup/lifecycle/verify_restore.py', 'server/src/services/backoffice-company-profile.js', 'ops/backup/lifecycle/backoffice_company_profile.py', 'server/src/services/backoffice-company-installation-proof.js', 'server/src/services/backoffice-company-installation.js', 'ops/backup/lifecycle/company-installation-backup.py', 'ops/backup/lifecycle/company-installation-observe.sql', 'server/src/services/monthly-inventory-capture-schema.js', 'server/src/services/monthly-inventory-capture-authorization.js', 'server/src/services/monthly-inventory-capture-status.js', 'ops/backup/lifecycle/company_source_root.py', 'server/scripts/store-lifecycle-verify-copy.py', 'server/src/services/automatic-report-operational-profile.js', 'server/src/services/automatic-report-source-compatibility.js', 'ops/backup/lifecycle/report-operational-compatibility.proposed.json', 'server/src/services/backoffice-company-current-capture.js', 'server/src/services/backoffice-company-read-worker-ready.js', 'server/scripts/backoffice-company-current-guard-review.mjs', 'ops/backup/lifecycle/backoffice-company-current-capture.proposed.json', 'ops/backup/lifecycle/backoffice-company-current-capture-guards.proposed.json', 'ops/backup/lifecycle/backoffice_company_readiness.py', 'ops/backup/lifecycle/backoffice-company-current-readiness.sql', 'server/test/fixtures/ftext-full-schema-metadata-20261024.json', 'server/src/backoffice-staff-bootstrap.js', 'server/src/services/ai-owner-wallet-schema.js', 'server/src/services/automatic-report-consent-inspection.js', 'server/src/services/automatic-report-event-schema.js', 'ops/backup/lifecycle/automatic-report-consent-extension.proposed.json')

SOURCE_PATHS += ('ops/backup/lifecycle/backoffice-company-current-columns.proposed.json', 'server/src/routes/purchase-orders.js', 'server/src/commercial-bootstrap.js', 'server/src/routes/store-table-orders.js')

SOURCE_PATHS += ('ops/backup/lifecycle/backoffice-company-current-defaults.proposed.json', 'server/scripts/backoffice-company-current-default-review.mjs', 'server/src/services/ftext-cash-schema.js', 'server/src/chat-interactions.mjs', 'server/src/services/monthly-inventory-snapshot-schema.js')

SOURCE_PATHS += ('server/src/services/automatic-report-column-compatibility.js', 'ops/backup/lifecycle/report-column-compatibility.proposed.json')

def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))

def read_json(path):
    return json.loads(source_file(path).read_text())

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))

def same_rows(left, right):
    return isinstance(left, list) and isinstance(right, list) and sorted(map(canonical, left)) == sorted(map(canonical, right))

def fail():
    raise ValueError('Current company catalogue or guard proof differs')

def verify_current_sources():
    verify_runtime_copy(__file__, 'ops/backup/lifecycle/backoffice_company_readiness.py')
    packet = read_json('ops/backup/lifecycle/backoffice-company-compatibility.proposed.json')
    if packet.get('format') != 'MWS_BACKOFFICE_COMPANY_COMPATIBILITY_PROPOSAL_V1' or packet.get('executionEnabled') is not False or packet.get('productionActivated') is not False or set(packet.get('sourceHashes', {})) != set(SOURCE_PATHS):
        fail()
    for path, digest in packet['sourceHashes'].items():
        if hashlib.sha256(source_file(path).read_bytes()).hexdigest() != digest:
            fail()
    return packet

def normalize(value, key=None):
    if isinstance(value, list): return [normalize(v) for v in value]
    if isinstance(value, dict): return {k:normalize(v,k) for k,v in value.items()}
    if isinstance(value, str):
        if key in ('schema','parentSchema','functionSchema') and value == 'public': return '__SCHEMA__'
        if key == 'definition': return value.replace('"public".', '__SCHEMA__.').replace('public.', '__SCHEMA__.')
    return value

def validate_supplier(actual, manifest, extension):
    table='AutomaticReportSupplierComparisonConsent'
    relations=actual.get('relations', [])
    if len(relations)!=1 or relations[0].get('name')!=table: fail()
    wanted={'kind':'r','persistence':'p','partition':False,'rls':False,'forced':False,'ownedByCurrentUser':True,'acl':None,'options':None,'replicaIdentity':'d','defaultTablespace':True,'inherited':False,'rewritten':False}
    if any(relations[0].get(k)!=v for k,v in wanted.items()): fail()
    columns=actual.get('columns', [])
    if [[r.get('name'),r.get('type'),r.get('notNull')] for r in columns] != manifest['knownColumns'][table]: fail()
    for row in columns:
        if row.get('identity')!='' or row.get('generated')!='' or row.get('acl') is not None or row.get('defaultExpression') != extension['defaults'].get(row['name']): fail()
    constraints=actual.get('constraints', [])
    if any(row.get('table')!=table or row.get('schema')!='public' or row.get('validated') is not True or row.get('deferrable') is not False or row.get('deferred') is not False for row in constraints): fail()
    checks=sorted(row.get('definition') for row in constraints if row.get('kind')=='c')
    if checks not in [sorted(v) for v in extension['checks'][table]]: fail()
    primary=[r for r in constraints if r.get('kind')=='p']; foreign=[r for r in constraints if r.get('kind')=='f']
    if len(primary)!=1 or primary[0]['definition']!='PRIMARY KEY ("companyId", "storeId", "recipientId")': fail()
    expected_fk='FOREIGN KEY ("companyId", "storeId", "recipientId") REFERENCES "AutomaticReportRecipient"("companyId", "storeId", "recipientId")'
    if len(foreign)!=1 or foreign[0]['definition']!=expected_fk or foreign[0].get('parentSchema')!='public' or foreign[0].get('parentTable')!='AutomaticReportRecipient' or foreign[0].get('onDelete')!='a' or foreign[0].get('onUpdate')!='a': fail()
    if len(constraints)!=len(checks)+2 or actual.get('triggers')!=[]: fail()
    indexes=actual.get('indexes', [])
    if len(indexes)!=1 or any(indexes[0].get(k)!=v for k,v in {'table':table,'primary':True,'unique':True,'valid':True,'ready':True,'immediate':True,'replicaIdentity':False,'ownedByCurrentUser':True,'options':None}.items()): fail()
    expected_index='CREATE UNIQUE INDEX "AutomaticReportSupplierComparisonConsent_pkey" ON public."AutomaticReportSupplierComparisonConsent" USING btree ("companyId", "storeId", "recipientId")'
    if indexes[0].get('definition') != expected_index: fail()

def validate_company_read_observation(actual):
    if not isinstance(actual, dict) or actual.get('schema')!='public' or actual.get('readOnly')!='on' or actual.get('nonFinalOperations')!=0: fail()
    artifact=read_json('ops/backup/lifecycle/backoffice-company-current-capture-guards.proposed.json')
    if artifact.get('format')!='MWS_BACKOFFICE_CURRENT_CAPTURE_GUARD_REVIEW_V1' or artifact.get('schema')!='public' or artifact.get('sourceFencePlanHash')!=CURRENT_SOURCE_FENCE_PLAN_HASH: fail()
    source=read_json('ops/backup/lifecycle/monthly-inventory-capture-manifest.proposed.json')
    columns=actual.get('columns', [])
    column_index={(r.get('table'),r.get('name')):r for r in columns}
    if len(column_index)!=len(columns): fail()
    table_columns={}
    for row in columns: table_columns.setdefault(row.get('table'),[]).append(row)
    accounts=table_columns.get('BackofficeStaffAccount',[])
    shape=[[r.get('name'),r.get('type'),r.get('notNull')] for r in accounts]
    old=source['knownColumns']['BackofficeStaffAccount']; new=old+[['companyCapabilities','jsonb',True]]
    phase='SOURCE' if shape==old else 'TARGET' if shape==new else None
    if phase is None: fail()
    manifest=current_company_manifest(source,phase)
    expected_names=set(manifest['knownTables'])|set(artifact['internalColumns'])
    relations=actual.get('relations', [])
    if len(relations)!=291 or len({r.get('name') for r in relations})!=291 or {r.get('name') for r in relations}!=expected_names: fail()
    safe_relation={'kind':'r','persistence':'p','partition':False,'rls':False,'forced':False,'ownedByCurrentUser':True,'acl':None,'options':None,'replicaIdentity':'d','defaultTablespace':True,'inherited':False,'rewritten':False}
    if any(any(row.get(k)!=v for k,v in safe_relation.items()) for row in relations): fail()
    if any(row.get('table') not in expected_names or row.get('identity')!='' or row.get('generated')!='' or row.get('acl') is not None for row in columns): fail()
    for table in manifest['knownTables']:
        rows=table_columns.get(table,[])
        if [[r['name'],r['type'],r['notNull']] for r in rows]!=manifest['knownColumns'][table]: fail()
    for table,expected in artifact['internalColumns'].items():
        rows=[{k:r.get(k) for k in expected[0]} for r in table_columns.get(table,[])]
        if rows!=expected: fail()
    runtime_columns=read_json('ops/backup/lifecycle/backoffice-company-current-columns.proposed.json')
    for expected in runtime_columns['columns']:
        rows=[column_index[(expected['table'],expected['name'])]] if (expected['table'],expected['name']) in column_index else []
        if len(rows)!=1 or any(rows[0].get(k)!=v for k,v in expected.items()): fail()
    immutable=read_json('server/test/fixtures/ftext-full-schema-metadata-20261024.json')
    for expected in immutable['columns']:
        rows=[column_index[(expected['table'],expected['name'])]] if (expected['table'],expected['name']) in column_index else []
        if len(rows)!=1 or any(rows[0].get(k)!=expected.get(source) for k,source in [('defaultExpression','default'),('identity','identity'),('generated','generated')]): fail()
    defaults=read_json('ops/backup/lifecycle/backoffice-company-current-defaults.proposed.json')
    if defaults.get('format')!='MWS_COMPANY_CURRENT_CAPTURE_DEFAULT_REVIEW_V1' or defaults.get('policy')!='SOURCE_DERIVED_DEFAULTS_ONLY_NO_LIVE_ROW_OR_SCHEMA_ADMISSION' or len(defaults.get('tables',{}))!=14 or sum(len(t.get('columns',[])) for t in defaults['tables'].values())!=168: fail()
    for source_input in defaults.get('sourceFiles',[]):
        if source_input.get('path') not in SOURCE_PATHS or hashlib.sha256(source_file(source_input['path']).read_bytes()).hexdigest()!=source_input.get('sha256'): fail()
    for table,review in defaults['tables'].items():
        expected=review['columns']+([{'name':'companyCapabilities','defaultExpression':"'[]'::jsonb",'identity':'','generated':''}] if phase=='TARGET' and table=='BackofficeStaffAccount' else [])
        rows=[{k:r.get(k) for k in ('name','defaultExpression','identity','generated')} for r in table_columns.get(table,[])]
        if rows!=expected: fail()
    expected_checks=[{'table':r['table'],'name':r['name'],'kind':'c','validated':True,'deferrable':False,'deferred':False,'definition':r['definition']} for r in immutable['constraints'] if r['kind']=='c' and r['table'] in ('PurchaseOrder','StoreProduct','TableOrder')]+[runtime_columns['costCheck']]
    if not same_rows(actual.get('currentChecks'),expected_checks): fail()
    if phase=='TARGET' and accounts[-1].get('defaultExpression')!="'[]'::jsonb": fail()
    if not same_rows(actual.get('foreignKeys'),artifact['foreignKeys']): fail()
    expected_guards=[]
    for row in artifact['phases'][phase]['guards']:
        expected_guards.append({**artifact['guardDefaults'],**row,'functionName':row['name']})
    actual_guards=actual.get('guards', [])
    if len(actual_guards)!=len(expected_guards)+len(artifact['existingTriggers']): fail()
    by_key={(r.get('table'),r.get('name')):r for r in actual_guards}
    if len(by_key)!=len(actual_guards): fail()
    for expected in expected_guards+artifact['existingTriggers']:
        row=by_key.get((expected['table'],expected['name']))
        if not row or any(row.get(k)!=v for k,v in expected.items()): fail()
        if row.get('ownedByCurrentUser') is not True or row.get('acl') is not None: fail()
    operational=read_json('ops/backup/lifecycle/report-operational-compatibility.proposed.json')['catalogue']
    actual_ops=normalize(actual.get('operational'))
    if not isinstance(actual_ops,dict) or set(actual_ops)!=set(operational) or any(not same_rows(actual_ops[k],operational[k]) for k in operational): fail()
    validate_supplier(actual.get('supplier', {}),manifest,read_json('ops/backup/lifecycle/automatic-report-consent-extension.proposed.json'))
    fences=actual.get('fences', [])
    expected_plan=CURRENT_SOURCE_FENCE_PLAN_HASH if phase=='SOURCE' else CURRENT_PHASE_HASHES['TARGET']
    if not fences or any(row.get('planHash')!=expected_plan or not isinstance(row.get('count'),int) or row['count']<=0 or any(row.get(k)!=0 for k in ('maintenanceCount','retiredCount','operationNotNullCount')) or not str(row.get('minGeneration','')).isdigit() or not str(row.get('maxGeneration','')).isdigit() for row in fences): fail()
    return {'phase':phase,'manifestHash':CURRENT_PHASE_HASHES[phase]}

def observe_company_read_state(query):
    verify_current_sources()
    sql=source_file('ops/backup/lifecycle/backoffice-company-current-readiness.sql').read_text()
    verify_runtime_copy(source_file('ops/backup/lifecycle/backoffice-company-current-readiness.sql'),'ops/backup/lifecycle/backoffice-company-current-readiness.sql')
    actual=json.loads(query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='10000ms'; "+sql+' COMMIT;'))
    return validate_company_read_observation(actual)
