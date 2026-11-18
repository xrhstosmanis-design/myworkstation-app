"""Pure paired COMPANY profile selection. No storage, SQL or activation."""
import copy
import hashlib
import json
import pathlib
from company_source_root import source_file, verify_runtime_copy

HERE = pathlib.Path(__file__).resolve().parent


def company_manifest(document, profile):
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
