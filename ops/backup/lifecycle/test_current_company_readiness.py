"""Offline reader mutation tests; never native PostgreSQL evidence."""
import copy,json,pathlib,unittest
import backoffice_company_readiness as ready
from backoffice_company_profile import current_company_manifest,CURRENT_PHASE_HASHES,CURRENT_SOURCE_FENCE_PLAN_HASH
HERE=pathlib.Path(__file__).resolve().parent
read=lambda name:json.loads((HERE/name).read_text())
def observation(phase='SOURCE'):
 manifest=current_company_manifest(read('monthly-inventory-capture-manifest.proposed.json'),phase);artifact=read('backoffice-company-current-capture-guards.proposed.json');extension=read('automatic-report-consent-extension.proposed.json')
 def relation(name):return dict(name=name,kind='r',persistence='p',partition=False,rls=False,forced=False,ownedByCurrentUser=True,acl=None,options=None,replicaIdentity='d',defaultTablespace=True,inherited=False,rewritten=False)
 columns=[]
 for table,cols in manifest['knownColumns'].items():
  for n,(name,kind,required)in enumerate(cols):columns.append(dict(table=table,name=name,type=kind,notNull=required,identity='',generated='',acl=None,defaultExpression="'[]'::jsonb"if table=='BackofficeStaffAccount'and name=='companyCapabilities'else None,position=n+1))
 for table,cols in artifact['internalColumns'].items():
  for n,col in enumerate(cols):columns.append(dict(table=table,acl=None,position=n+1,**col))
 immutable=ready.read_json('server/test/fixtures/ftext-full-schema-metadata-20261024.json');runtime=read('backoffice-company-current-columns.proposed.json')
 immutable_index={(r['table'],r['name']):r for r in immutable['columns']};runtime_index={(r['table'],r['name']):r for r in runtime['columns']}
 for c in columns:
  expected=immutable_index.get((c['table'],c['name']))
  if expected:c.update(defaultExpression=expected['default'],identity=expected['identity'],generated=expected['generated'])
  extra=runtime_index.get((c['table'],c['name']))
  if extra:c.update(extra)
 defaults=read('backoffice-company-current-defaults.proposed.json')
 for table,review in defaults['tables'].items():
  for expected in review['columns']:
   next(c for c in columns if c['table']==table and c['name']==expected['name']).update(expected)
 checks=[dict(table=r['table'],name=r['name'],kind='c',validated=True,deferrable=False,deferred=False,definition=r['definition'])for r in immutable['constraints']if r['kind']=='c'and r['table']in('PurchaseOrder','StoreProduct','TableOrder')]+[runtime['costCheck']]
 def raw(v,key=None):
  if isinstance(v,list):return[raw(x)for x in v]
  if isinstance(v,dict):return{k:raw(x,k)for k,x in v.items()}
  return v.replace('__SCHEMA__','public')if isinstance(v,str)and key!='body'else v
 supplier='AutomaticReportSupplierComparisonConsent';supplier_columns=[copy.deepcopy(r)for r in columns if r['table']==supplier]
 for r in supplier_columns:r['defaultExpression']=extension['defaults'].get(r['name'])
 constraints=[dict(schema='public',table=supplier,name='check'+str(n),kind='c',deferrable=False,deferred=False,validated=True,definition=d)for n,d in enumerate(extension['checks'][supplier][0])]
 constraints.extend([dict(schema='public',table=supplier,name='primary',kind='p',deferrable=False,deferred=False,validated=True,definition='PRIMARY KEY ("companyId", "storeId", "recipientId")'),dict(schema='public',table=supplier,name='foreign',kind='f',deferrable=False,deferred=False,validated=True,parentSchema='public',parentTable='AutomaticReportRecipient',onDelete='a',onUpdate='a',definition='FOREIGN KEY ("companyId", "storeId", "recipientId") REFERENCES "AutomaticReportRecipient"("companyId", "storeId", "recipientId")')])
 index=dict(table=supplier,primary=True,unique=True,valid=True,ready=True,immediate=True,replicaIdentity=False,ownedByCurrentUser=True,options=None,definition='CREATE UNIQUE INDEX "AutomaticReportSupplierComparisonConsent_pkey" ON public."AutomaticReportSupplierComparisonConsent" USING btree ("companyId", "storeId", "recipientId")')
 guards=[dict(**{**artifact['guardDefaults'],**r,'functionName':r['name']})for r in artifact['phases'][phase]['guards']]+[{**artifact['guardDefaults'],**r}for r in artifact['existingTriggers']]
 return dict(schema='public',readOnly='on',nonFinalOperations=0,currentChecks=checks,relations=[relation(n)for n in list(manifest['knownTables'])+list(artifact['internalColumns'])],columns=columns,foreignKeys=copy.deepcopy(artifact['foreignKeys']),guards=guards,operational=raw(read('report-operational-compatibility.proposed.json')['catalogue']),supplier=dict(relations=[relation(supplier)],columns=supplier_columns,constraints=constraints,indexes=[index],triggers=[]),fences=[dict(planHash=CURRENT_SOURCE_FENCE_PLAN_HASH if phase=='SOURCE'else CURRENT_PHASE_HASHES['TARGET'],count=1,maintenanceCount=0,retiredCount=0,operationNotNullCount=0,minGeneration='7',maxGeneration='7')])
class CurrentReadObservation(unittest.TestCase):
 def test_offline_both_phases_require_whole_reviewed_catalogue_and_guards(self):
  for phase in ['SOURCE','TARGET']:self.assertEqual(ready.validate_company_read_observation(observation(phase)),dict(phase=phase,manifestHash=CURRENT_PHASE_HASHES[phase]))
 def test_offline_schema_and_guard_mutations_never_become_a_signed_phase(self):
  def extra_column(x):x['columns'].append({**x['columns'][0],'name':'unknownColumn'})
  def missing_table(x):x['relations'].pop()
  def index(x):x['operational']['indexes'][0]['valid']=False
  def default(x):x['operational']['columns'][0]['defaultExpression']='unreviewed()'
  def canonical_default(x):next(r for r in x['columns']if r['table']=='AiOwnerWallet'and r['name']=='updatedAt')['defaultExpression']='NULL::timestamp with time zone'
  def fk(x):x['foreignKeys'][0]['remote']=['otherId']
  def guard(x):x['guards'][0]['bodySha256']='0'*64
  def function(x):x['guards'][0]['definer']=True
  def trigger(x):x['guards'].append({**x['guards'][0],'name':'unknown-trigger'})
  def consent(x):x['supplier']['constraints'].pop()
  def fence(x):x['fences'][0]['maintenanceCount']=1
  for mutate in [extra_column,missing_table,index,default,canonical_default,fk,guard,function,trigger,consent,fence]:
   with self.subTest(mutation=mutate.__name__):
    actual=observation();mutate(actual)
    with self.assertRaises(ValueError):ready.validate_company_read_observation(actual)
 def test_target_default_and_fence_must_not_reuse_source(self):
  actual=observation('TARGET');actual['fences'][0]['planHash']=CURRENT_SOURCE_FENCE_PLAN_HASH
  with self.assertRaises(ValueError):ready.validate_company_read_observation(actual)
  actual=observation('TARGET');next(r for r in actual['columns']if r['table']=='BackofficeStaffAccount'and r['name']=='companyCapabilities')['defaultExpression']='NULL::jsonb'
  with self.assertRaises(ValueError):ready.validate_company_read_observation(actual)
if __name__=='__main__':unittest.main()
