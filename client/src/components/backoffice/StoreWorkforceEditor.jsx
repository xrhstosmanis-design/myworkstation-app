import React, {useEffect, useRef, useState} from 'react';
import {workforceRuleSeverityLabel} from '../platform/workforce-v2-ui-utils.js';

function Options({items}) {
  return items.map(([id, name]) => <option key={id} value={id}>{name}</option>);
}

export default function StoreWorkforceEditor({
  api, path, row, rules, labels, optionsPath, companyId, storeId, disabled, onCancel, onChanged
}) {
  const [options, setOptions] = useState([]);
  const [ruleType, setRuleType] = useState(row?.ruleType ?? Object.keys(labels)[0]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [optionsReady, setOptionsReady] = useState(!optionsPath);
  const [loading, setLoading] = useState(Boolean(optionsPath));
  const sending = useRef(false);

  useEffect(() => {
    if (!optionsPath) return;
    const controller = new AbortController();
    setLoading(true);
    setOptionsReady(false);
    api(optionsPath, {signal: controller.signal}).then(result => {
      if (controller.signal.aborted) return;
      if (result?.companyId !== companyId || result.storeId !== storeId || !Array.isArray(result.items)) {
        throw new Error('Δεν επιβεβαιώθηκαν οι επιλογές του καταστήματος.');
      }
      setOptions(result.items.filter(item => item.companyId === companyId && (rules ? item.baseStoreId === storeId : item.active)));
      setOptionsReady(true);
    }).catch(failure => {
      if (!controller.signal.aborted) setError(failure.message);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [api, companyId, optionsPath, rules, storeId]);

  async function save(event) {
    event.preventDefault();
    if (sending.current || disabled || loading || !optionsReady) return;
    const form = new FormData(event.currentTarget);
    const get = name => String(form.get(name) ?? '').trim();
    const reason = get('reason');
    if (reason.length < 3) {
      setError('Γράψε αιτιολογία τουλάχιστον τριών χαρακτήρων.');
      return;
    }
    const payload = rules ? {
      ruleType, employeeId: get('employeeId'), severity: get('severity'),
      relatedEmployeeId: ruleType === 'INCOMPATIBLE_EMPLOYEE' ? get('relatedEmployeeId') : null,
      value: ruleType === 'MIN_DAYS_OFF' ? {days: Number(get('numericValue'))}
        : ruleType === 'MAX_HOURS_PER_WEEK' ? {hours: Number(get('numericValue'))} : {},
      note: get('note') || null, validFrom: get('validFrom') || null, validTo: get('validTo') || null
    } : {
      name: get('name'), code: get('code') || undefined, category: get('category'),
      startTime: get('startTime'), endTime: get('endTime'), minimumPeople: Number(get('minimumPeople')),
      maximumPeople: get('maximumPeople') ? Number(get('maximumPeople')) : null,
      requiredRoleId: optionsPath ? get('requiredRoleId') || null : row?.requiredRoleId ?? null,
      requiresSupervisor: form.has('requiresSupervisor'), changeAllowed: form.has('changeAllowed')
    };
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api(row ? `${path}/${encodeURIComponent(row.id)}` : path, {
        method: row ? 'PUT' : 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...payload, confirmed: true, reason})
      });
      if (!result?.item?.id || (row && result.item.id !== row.id)) {
        throw new Error('Η αποθήκευση δεν επιβεβαιώθηκε. Ανανέωσε την προβολή.');
      }
      onChanged();
    } catch (failure) {
      setError(failure.message || 'Η αποθήκευση απέτυχε.');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const choices = options.map(item => [item.id, rules ? item.fullName : item.name]);
  const currentRoleMissing = row?.requiredRoleId && !choices.some(([id]) => id === row.requiredRoleId);
  return <form className="workforce-editor-card" onSubmit={save}>
    <h4>{row ? 'Επεξεργασία' : 'Νέα καταχώριση'}</h4>
    {loading && <p role="status">Φόρτωση επιλογών…</p>}
    {optionsReady && <fieldset className="workforce-form-grid" disabled={busy || disabled}>
      {rules ? <>
        <label>Εργαζόμενος<select name="employeeId" required defaultValue={row?.employeeId ?? ''}><option value="">Επιλογή</option><Options items={choices}/></select></label>
        <label>Κανόνας<select value={ruleType} onChange={event => setRuleType(event.target.value)}><Options items={Object.entries(labels)}/></select></label>
        <label>Αποτέλεσμα ελέγχου<select name="severity" defaultValue={row?.severity ?? 'WARNING'}><Options items={Object.entries(workforceRuleSeverityLabel)}/></select></label>
        {ruleType === 'INCOMPATIBLE_EMPLOYEE' && <label>Δεύτερος εργαζόμενος<select name="relatedEmployeeId" required defaultValue={row?.relatedEmployeeId ?? ''}><option value="">Επιλογή</option><Options items={choices}/></select></label>}
        {['MIN_DAYS_OFF', 'MAX_HOURS_PER_WEEK'].includes(ruleType) && <label>{ruleType === 'MIN_DAYS_OFF' ? 'Ελάχιστα ρεπό' : 'Μέγιστες ώρες εβδομάδας'}<input key={ruleType} type="number" name="numericValue" required min="1" max={ruleType === 'MIN_DAYS_OFF' ? 6 : 168} step={ruleType === 'MIN_DAYS_OFF' ? 1 : 'any'} defaultValue={row?.ruleType === ruleType ? row.value.days ?? row.value.hours : undefined}/></label>}
        <label>Ισχύει από<input type="date" name="validFrom" defaultValue={row?.validFrom?.slice(0, 10)}/></label>
        <label>Ισχύει έως<input type="date" name="validTo" defaultValue={row?.validTo?.slice(0, 10)}/></label>
        <label>Σημείωση<textarea name="note" maxLength={1000} defaultValue={row?.note ?? ''}/></label>
      </> : <>
        <label>Ονομασία<input name="name" required minLength={2} maxLength={120} defaultValue={row?.name}/></label>
        <label>Κωδικός<input name="code" minLength={2} maxLength={40} defaultValue={row?.code}/></label>
        <label>Κατηγορία<select name="category" defaultValue={row?.category}><Options items={Object.entries(labels)}/></select></label>
        <label>Έναρξη<input type="time" name="startTime" required defaultValue={row?.startTime}/></label>
        <label>Λήξη<input type="time" name="endTime" required defaultValue={row?.endTime}/></label>
        <label>Ελάχιστα άτομα<input type="number" name="minimumPeople" required min="1" max="100" defaultValue={row?.minimumPeople ?? 1}/></label>
        <label>Μέγιστα άτομα<input type="number" name="maximumPeople" min="1" max="100" defaultValue={row?.maximumPeople ?? ''}/></label>
        {optionsPath && <label>Απαιτούμενος ρόλος<select name="requiredRoleId" defaultValue={row?.requiredRoleId ?? ''}><option value="">Χωρίς συγκεκριμένο ρόλο</option>{currentRoleMissing && <option value={row.requiredRoleId}>{row.requiredRole?.name ?? 'Τρέχων ρόλος'}</option>}<Options items={choices}/></select></label>}
        <label><input type="checkbox" name="requiresSupervisor" defaultChecked={row?.requiresSupervisor}/> Χρειάζεται υπεύθυνος</label>
        <label><input type="checkbox" name="changeAllowed" defaultChecked={row?.changeAllowed ?? true}/> Επιτρέπεται αλλαγή</label>
      </>}
      <label>Αιτιολογία<input name="reason" required minLength={3} maxLength={500}/></label>
      <button type="submit">Επιβεβαίωση και αποθήκευση</button>
    </fieldset>}
    <button type="button" className="secondary" disabled={busy} onClick={onCancel}>Ακύρωση</button>
    {error && <p role="alert">{error}</p>}
  </form>;
}
