"""Versioned, reports-only weekly overlay. Legacy recovery profiles stay intact."""
import copy,hashlib,json,pathlib
SUFFIX='__WEEKLY_STOCK_ALARM_V1'
def digest(value):
    return hashlib.sha256(json.dumps(value,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def weekly_source(profile):
    definition=json.loads((pathlib.Path(__file__).resolve().parent/'weekly-stock-alarm-definition.proposed.json').read_text())
    source=profile[:-len(SUFFIX)]
    if source.endswith('__NO14_COMPAT_V2'):
        source=source[:-len('__NO14_COMPAT_V2')]
    if source.endswith('__EXISTING_EFOOD_LAB_V1'):source=source[:-len('__EXISTING_EFOOD_LAB_V1')]
    if '__NO14_COMPAT_V2' in profile and source!='MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V4':raise ValueError('Unknown No14 weekly source')
    if not profile.endswith(SUFFIX) or source not in definition['sourceProfiles']:
        raise ValueError('Unknown weekly stock alarm source profile')
    return source

def weekly_manifest(profile,select):
    definition=json.loads((pathlib.Path(__file__).resolve().parent/'weekly-stock-alarm-definition.proposed.json').read_text())
    source=weekly_source(profile)
    if source=='MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_NO14_V1':
        base=select({'MWS_STORE_LIFECYCLE_PROFILE':'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V3'})
        delta=definition['expectedReceiptProfileDelta']
        base['id']+=delta['idSuffix']
        for table in delta['tables']:
            name=table['name'];base['knownTables'].append(name);base['knownColumns'][name]=table['columns'];base['preservedOperationalTables'].append(name)
            base['reviewedColumns'].extend(name+'.'+c[0] for c in table['columns'] if c[0].endswith('Id') or c[0] in ('confirmedBy','cancelledBy','result'))
        base['expectedReceiptCompatibility']=delta['compatibility'];base['executionDisabled']=True
    else:
        base=select({'MWS_STORE_LIFECYCLE_PROFILE':source})
    source_hash=digest(base)
    if source_hash!=definition['sourceProfiles'][source]:
        raise ValueError('Weekly stock alarm source hash differs')
    result=copy.deepcopy(base)
    existing_lab='__EXISTING_EFOOD_LAB_V1' in profile
    lab_definition=None
    if existing_lab:
        lab_definition=json.loads((pathlib.Path(__file__).resolve().parent/'weekly-stock-alarm-existing-lab.proposed.json').read_text())
        result['id']+='__EXISTING_EFOOD_LAB_V1'
        for name,columns in lab_definition['columns'].items():
            result['knownTables'].append(name);result['knownColumns'][name]=columns;result['preservedOperationalTables'].append(name);result['reviewedColumns'].extend(name+'.'+c[0] for c in columns)
    expected_receipts=profile[:-len(SUFFIX)].endswith('__NO14_COMPAT_V2')
    if expected_receipts:
        result['id']+='__NO14_COMPAT_V2'
        for table in definition['expectedReceiptProfileDelta']['tables']:
            name=table['name'];result['knownTables'].append(name);result['knownColumns'][name]=table['columns'];result['preservedOperationalTables'].append(name)
            result['reviewedColumns'].extend(name+'.'+c[0] for c in table['columns'] if c[0].endswith('Id') or c[0] in ('confirmedBy','cancelledBy','result'))
    result['id']+=SUFFIX
    for name,columns in definition['columns'].items():
        result['knownTables'].append(name);result['knownColumns'][name]=columns;result['preservedOperationalTables'].append(name)
        result['reviewedColumns'].extend(name+'.'+c[0] for c in columns if c[0].endswith('Id') or c[1]=='jsonb')
    result['weeklyStockAlarmCompatibility']={'format':'MWS_WEEKLY_STOCK_ALARM_PROFILE_V1','definitionHash':digest(definition),'sourcePlanHash':source_hash}
    if expected_receipts:result['weeklyStockAlarmCompatibility']['expectedReceipts']=True
    if existing_lab:result['weeklyStockAlarmCompatibility']['existingLabCompatibility']=digest(lab_definition)
    result['executionDisabled']=True
    return result
