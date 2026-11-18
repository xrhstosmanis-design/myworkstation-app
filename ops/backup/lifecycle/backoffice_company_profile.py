"""Pure paired COMPANY profile selection. No storage, SQL or activation."""
import copy
import hashlib
import json
import pathlib
from company_source_root import source_file, verify_runtime_copy

HERE = pathlib.Path(__file__).resolve().parent


def company_manifest(document, profile):
    if profile == 'CURRENT_CAPTURE':
        return current_company_manifest(document, 'TARGET')
    if profile not in ('BASE', 'CAPTURE'):
        raise ValueError('Invalid company lifecycle profile')
    verify_runtime_copy(__file__, 'ops/backup/lifecycle/backoffice_company_profile.py')
    packet = json.loads(source_file('ops/backup/lifecycle/backoffice-company-compatibility.proposed.json').read_text())
    if packet.get('format') != 'MWS_BACKOFFICE_COMPANY_COMPATIBILITY_PROPOSAL_V1':
        raise ValueError('Invalid company compatibility packet')
    variant = next(v for v in packet['variants'] if v['profile'] == profile)
    target = copy.deepcopy(document)
    expected = [['userId', 'text', True], ['companyId', 'text', True], ['username', 'text', True], ['pinHash', 'text', True], ['active', 'boolean', True], ['revision', 'integer', True], ['createdAt', 'timestamp with time zone', True], ['updatedAt', 'timestamp with time zone', True]]
    column = 'BackofficeStaffAccount.companyCapabilities'
    if target.get('knownColumns', {}).get('BackofficeStaffAccount') != expected or column in target.get('reviewedColumns', []) or any(t['name'] == 'BackofficeStaffAccount' for t in target['tables']):
        raise ValueError('Unreviewed company security layout')
    source = source_file(variant['sourceManifest'])
    if hashlib.sha256(source.read_bytes()).hexdigest() != packet['sourceHashes'][variant['sourceManifest']] or json.loads(source.read_text()) != document:
        raise ValueError('Company profile source changed')
    target['id'] = 'BACKOFFICE_COMPANY_' + profile + '_PROPOSED_V1'
    target['knownColumns']['BackofficeStaffAccount'].append(['companyCapabilities', 'jsonb', True])
    target['reviewedColumns'].append(column)
    encoded = json.dumps(target, ensure_ascii=False, separators=(',', ':'))
    if hashlib.sha256(encoded.encode()).hexdigest() != variant['proposedPlanHash']:
        raise ValueError('Company profile plan changed')
    return target


CURRENT_SOURCE_FENCE_PLAN_HASH = '59ca657191a03dfeb751e907d95abe4291a3fc61da30c9d0602a116ed78757c2'
CURRENT_PHASE_HASHES = {'SOURCE': 'b4bf19367ca9371ad527c19a3246bf0309c9e0044b7c9a109cf9852e597bf0aa', 'TARGET': '9485ee86e3f706b4ead00cdaa240646e761b93f7420a40233dd97b12442f5419'}


def current_company_manifest(document, phase):
    """Compose only the separately reviewed non-owning current catalogue."""
    if phase not in CURRENT_PHASE_HASHES:
        raise ValueError('Invalid current company phase')
    verify_runtime_copy(__file__, 'ops/backup/lifecycle/backoffice_company_profile.py')
    source = json.loads(source_file('ops/backup/lifecycle/monthly-inventory-capture-manifest.proposed.json').read_text())
    compact = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    if document != source or hashlib.sha256(compact(source).encode()).hexdigest() != CURRENT_SOURCE_FENCE_PLAN_HASH:
        raise ValueError('Current company legacy source differs')
    definition = json.loads(source_file('ops/backup/lifecycle/backoffice-company-current-capture.proposed.json').read_text())
    if definition.get('format') != 'MWS_BACKOFFICE_COMPANY_CURRENT_CAPTURE_PROPOSAL_V1' or definition.get('profile') != 'CURRENT_CAPTURE' or definition.get('purpose') != 'COMPANY_READ_ONLY' or definition.get('executionEnabled') is not False or definition.get('productionActivated') is not False or definition.get('eventConsentPresent') is not False or definition.get('scopedRecovery') is not False or definition.get('sourceFencePlanHash') != CURRENT_SOURCE_FENCE_PLAN_HASH:
        raise ValueError('Current company policy differs')
    operational = json.loads(source_file('ops/backup/lifecycle/report-operational-compatibility.proposed.json').read_text())
    supplier = 'AutomaticReportSupplierComparisonConsent'
    if operational.get('format') != 'MWS_REPORT_OPERATIONAL_COMPATIBILITY_V1' or len(operational.get('tables', [])) != 9 or supplier in source['knownTables'] or 'AutomaticReportEventConsent' in source['knownTables']:
        raise ValueError('Current company operational policy differs')
    target = copy.deepcopy(source)
    target['id'] = 'BACKOFFICE_COMPANY_CURRENT_CAPTURE_SOURCE_V1' if phase == 'SOURCE' else 'BACKOFFICE_COMPANY_CURRENT_CAPTURE_PROPOSED_V1'
    target['purpose'] = 'COMPANY_READ_ONLY'
    non_owning = [table['name'] for table in operational['tables']] + [supplier]
    target['companyCurrentCatalogue'] = {'format': 'MWS_BACKOFFICE_CURRENT_CAPTURE_CATALOGUE_V1', 'phase': phase, 'nonOwningTables': non_owning}
    for table in operational['tables']:
        if table['name'] in target['knownTables']:
            raise ValueError('Duplicate current company table')
        target['knownTables'].append(table['name'])
        target['knownColumns'][table['name']] = copy.deepcopy(table['columns'])
    target['knownTables'].append(supplier)
    target['knownColumns'][supplier] = copy.deepcopy(target['knownColumns']['AutomaticReportRecipientConsent'])
    current_columns = json.loads(source_file('ops/backup/lifecycle/backoffice-company-current-columns.proposed.json').read_text())
    if current_columns.get('format') != 'MWS_BACKOFFICE_COMPANY_CURRENT_COLUMNS_V1' or len(current_columns.get('columns', [])) != 6 or current_columns.get('productionActivated') is not False or current_columns.get('ownershipInference') is not False or current_columns.get('scopedRecovery') is not False:
        raise ValueError('Unreviewed current runtime columns')
    for column in current_columns['columns']:
        if column['position'] != len(target['knownColumns'][column['table']]) + 1:
            raise ValueError('Current runtime column order differs')
        target['knownColumns'][column['table']].append([column['name'], column['type'], column['notNull']])
    target['reviewedColumns'].extend(current_columns['opaquePreservedColumns'] + operational['reviewedColumns'] + [supplier + '.' + name for name in ('recipientId', 'consentedBy', 'revokedBy', 'updatedBy')])
    stock = next(table for table in target['tables'] if table['name'] == 'StoreProduct')
    stock['existingTriggers'] = stock.get('existingTriggers', []) + [copy.deepcopy(operational['packageTrigger'])]
    if phase == 'TARGET':
        target['knownColumns']['BackofficeStaffAccount'].append(['companyCapabilities', 'jsonb', True])
        target['reviewedColumns'].append('BackofficeStaffAccount.companyCapabilities')
    if len(target['knownTables']) != 287 or any(table['name'] in non_owning for table in target['tables']) or 'executionDisabled' in target:
        raise ValueError('Current company cannot own or recover operational rows')
    if hashlib.sha256(compact(target).encode()).hexdigest() != CURRENT_PHASE_HASHES[phase]:
        raise ValueError('Current company compiled plan differs')
    return target
