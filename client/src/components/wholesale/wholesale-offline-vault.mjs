import {createWholesaleOfflineStorage} from './wholesale-offline-idb.mjs';

const ITERATIONS = 310000, DAY = 86400000, MAX_CIPHERTEXT_BASE64 = 16_000_000;
const encoder = new TextEncoder(), decoder = new TextDecoder();
const clone = value => JSON.parse(JSON.stringify(value));
export class OfflineVaultError extends Error {
  constructor(code, message = code) { super(message); this.name = 'OfflineVaultError'; this.code = code; }
}
const fail = (code, message) => { throw new OfflineVaultError(code, message); };
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
const text = (value, limit = 200) => typeof value === 'string' && value.length <= limit ? value : '';
export function wholesaleOfflineScopeKey(scope) {
  if (!scope || !['userId','companyId','storeId'].every(key => id(scope[key])) || !['SUPER_ADMIN','OWNER','ADMIN','MANAGER','EMPLOYEE'].includes(scope.role)) fail('INVALID_SCOPE');
  return JSON.stringify([scope.userId, scope.companyId, scope.storeId, scope.role]);
}
const base64 = value => {
  // Never spread a whole encrypted catalogue into a function call: ordinary
  // multi-thousand-item snapshots exceed JavaScript's argument-count limit.
  const chunks = [];
  for (let start = 0; start < value.length; start += 32768) chunks.push(String.fromCharCode(...value.subarray(start,start + 32768)));
  return btoa(chunks.join(''));
};
const bytes = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
const safeScope = scope => { wholesaleOfflineScopeKey(scope); return {userId:scope.userId,companyId:scope.companyId,storeId:scope.storeId,role:scope.role}; };
function metadata(envelope) {
  return {format: envelope.format, version: envelope.version, scope: envelope.scope, storeName: envelope.storeName,
    preparedAt: envelope.preparedAt, expiresAt: envelope.expiresAt, salt: envelope.salt, iterations: envelope.iterations};
}
function validEnvelope(envelope, scope) {
  if (!envelope || envelope.format !== 1 || !Number.isSafeInteger(envelope.version) || envelope.version < 1 ||
      envelope.iterations !== ITERATIONS || wholesaleOfflineScopeKey(envelope.scope) !== wholesaleOfflineScopeKey(scope) ||
      !Number.isFinite(envelope.preparedAt) || !Number.isFinite(envelope.expiresAt) || envelope.expiresAt <= envelope.preparedAt ||
      envelope.expiresAt - envelope.preparedAt > DAY || typeof envelope.salt !== 'string' || typeof envelope.iv !== 'string' ||
      typeof envelope.ciphertext !== 'string' || envelope.ciphertext.length > MAX_CIPHERTEXT_BASE64 || bytes(envelope.salt).length !== 16 || bytes(envelope.iv).length !== 12) fail('UNLOCK_FAILED');
}
function safeItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 100) fail('INVALID_DRAFT');
  const seen = new Set();
  return items.map(item => {
    const quantity = String(item.quantity);
    if (!id(item.productId) || seen.has(item.productId) || !/^\d{1,9}(?:\.\d{1,4})?$/.test(quantity) || Number(quantity) <= 0) fail('INVALID_DRAFT');
    seen.add(item.productId);
    return {productId: item.productId, quantity};
  });
}
function safeSnapshot(scope, snapshot, time) {
  if (!snapshot || snapshot.store?.id !== scope.storeId || !Number.isFinite(snapshot.paidExpiresAt) || snapshot.paidExpiresAt <= time) fail('INVALID_SNAPSHOT');
  const originGeneration=snapshot.originGeneration ?? '0';
  if (typeof originGeneration !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(originGeneration)) fail('INVALID_SNAPSHOT');
  if (snapshot.identity && ['userId','companyId','role'].some(key => snapshot.identity[key] !== scope[key])) fail('INVALID_SNAPSHOT');
  const expiresAt = Math.min(time + DAY, snapshot.paidExpiresAt, Number.isFinite(snapshot.expiresAt) ? snapshot.expiresAt : Infinity);
  if (expiresAt <= time) fail('EXPIRED');
  const select = (rows, product) => {
    if (!Array.isArray(rows) || rows.length > 5000) fail('INVALID_SNAPSHOT');
    const seen = new Set();
    return rows.map(row => {
      if (!id(row.id) || seen.has(row.id)) fail('INVALID_SNAPSHOT');
      seen.add(row.id);
      return product ? {id: row.id, name: text(row.name), sku: text(row.sku), unit: text(row.unit)} : {id: row.id, name: text(row.name), code: text(row.code)};
    });
  };
  return {identity: {userId: scope.userId, companyId: scope.companyId, role: scope.role},
    store: {id: scope.storeId, name: text(snapshot.store.name)}, customers: select(snapshot.customers, false), products: select(snapshot.products, true),
    preparedAt: time, expiresAt, paidExpiresAt: snapshot.paidExpiresAt, originGeneration};
}

// Caller prepares only from current authenticated, licensed server responses. A local
// lease cannot discover an online revocation while the device is disconnected.
export function createWholesaleOfflineVault({storage = createWholesaleOfflineStorage(), crypto = globalThis.crypto,
  now = Date.now, lockManager = globalThis.navigator?.locks, onInvalidated = () => {},
  broadcastFactory = typeof window !== 'undefined' && window.BroadcastChannel ? name => new window.BroadcastChannel(name) : null} = {}) {
  let active = null, epoch = 0, disposed = false;
  const controllers = new Set();
  const localDenials = new Set(), denialGenerations = new Map();
  let broadcast;
  try { broadcast = broadcastFactory?.('mws-wholesale-offline-access-v1'); } catch {}
  const checkCrypto = () => { if (!crypto?.subtle || !crypto?.getRandomValues || !crypto?.randomUUID) fail('CRYPTO_UNAVAILABLE'); };
  const random = count => crypto.getRandomValues(new Uint8Array(count));
  function lock() { epoch++; active = null; for (const controller of controllers) controller.abort(); controllers.clear(); }
  function invalidateScope(scope) {
    if (!active || active.scopeKey !== wholesaleOfflineScopeKey(scope)) return;
    lock();
    try { onInvalidated({scope:clone(scope),code:'REVOKED'}); } catch {}
  }
  function observeDenial(scope) {
    const scopeKey = wholesaleOfflineScopeKey(scope);
    localDenials.add(scopeKey); denialGenerations.set(scopeKey,(denialGenerations.get(scopeKey) || 0) + 1);
    invalidateScope(scope);
  }
  if (broadcast) broadcast.onmessage = event => {
    try { if (!disposed && event.data?.kind === 'DENIED' && event.data?.version === 1) observeDenial(safeScope(event.data.scope)); } catch {}
  };
  async function record(scopeKey) {
    if (storage.getRecord) return storage.getRecord(scopeKey);
    // Legacy injected test adapters may have no denial metadata. Production
    // storage always reads the envelope and denial generation atomically.
    return {envelope:await storage.get(scopeKey),denied:storage.isDenied ? await storage.isDenied(scopeKey) : false,denialVersion:0};
  }
  async function assertAllowed(scopeKey) {
    if (localDenials.has(scopeKey) || storage.isDenied && await storage.isDenied(scopeKey)) fail('REVOKED','Η online πρόσβαση έχει ανακληθεί. Απαιτείται νέα online προετοιμασία.');
  }
  async function denyPrepared(scope) {
    if (disposed) fail('LOCKED'); scope = safeScope(scope);
    const scopeKey = wholesaleOfflineScopeKey(scope);
    observeDenial(scope);
    if (!storage.deny || !storage.isDenied) fail('STORAGE_UNAVAILABLE');
    try {
      await storage.deny(scopeKey);
      try { broadcast?.postMessage({version:1,kind:'DENIED',scope:clone(scope)}); } catch {}
      return {denied:true};
    } catch { fail('WRITE_FAILED','Η ανάκληση δεν αποθηκεύτηκε σε όλες τις καρτέλες. Η τρέχουσα προβολή κλειδώθηκε.'); }
  }
  function context() {
    if (disposed || !active) fail('LOCKED');
    return {...active, epoch};
  }
  const current = ctx => !disposed && !!active && epoch === ctx.epoch && active.key === ctx.key;
  function assertCurrent(ctx) { if (!current(ctx)) fail('LOCKED'); }
  async function derive(passphrase, salt) {
    checkCrypto();
    if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 1024) fail('PASSPHRASE_INVALID', 'Χρησιμοποίησε ξεχωριστή τοπική φράση τουλάχιστον 12 χαρακτήρων.');
    const secret = encoder.encode(passphrase);
    const material = await crypto.subtle.importKey('raw', secret, 'PBKDF2', false, ['deriveKey']);
    secret.fill(0);
    return crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:ITERATIONS, hash:'SHA-256'}, material, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
  }
  async function decrypt(envelope, scope, key) {
    try {
      validEnvelope(envelope, scope);
      const raw = await crypto.subtle.decrypt({name:'AES-GCM', iv:bytes(envelope.iv), additionalData:encoder.encode(JSON.stringify(metadata(envelope)))}, key, bytes(envelope.ciphertext));
      const state = JSON.parse(decoder.decode(raw));
      if (!state || !Array.isArray(state.drafts) || !state.snapshot || state.snapshot.store?.id !== scope.storeId) fail('UNLOCK_FAILED');
      return state;
    } catch { fail('UNLOCK_FAILED', 'Η τοπική φράση ή τα κρυπτογραφημένα δεδομένα δεν επιβεβαιώθηκαν.'); }
  }
  async function encrypt(header, state, key) {
    const iv = random(12);
    const plaintext = encoder.encode(JSON.stringify(state));
    const capacityFailure = () => fail('CAPACITY_EXCEEDED','Η κρυπτογραφημένη τοπική θυρίδα ξεπερνά το ασφαλές όριο μεγέθους. Δεν αποθηκεύτηκε η αλλαγή· διατήρησε τα υπάρχοντα αιτήματα και επικοινώνησε με την υποστήριξη.');
    // Include AES-GCM's 16-byte authentication tag and base64 expansion. This
    // applies to preparation AND every later draft/outbox state write.
    if (Math.ceil((plaintext.length + 16) / 3) * 4 > MAX_CIPHERTEXT_BASE64) capacityFailure();
    const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData:encoder.encode(JSON.stringify(metadata(header)))}, key, plaintext);
    const encoded = base64(new Uint8Array(ciphertext));
    if (encoded.length > MAX_CIPHERTEXT_BASE64) capacityFailure();
    return {...header, iv:base64(iv), ciphertext:encoded};
  }
  function lease(state, envelope) {
    const time = now();
    if (state.revoked) fail('REVOKED', 'Η πρόσβαση χρειάζεται νέα επιβεβαίωση με σύνδεση.');
    if (time < envelope.preparedAt || time < (state.lastWriteAt || envelope.preparedAt) - 60000 || time >= envelope.expiresAt) fail('EXPIRED', 'Η τοπική προετοιμασία έληξε. Συνδέσου για ανανέωση.');
  }
  async function load(ctx, bypassLease = false) {
    const stored = await record(ctx.scopeKey); assertCurrent(ctx);
    if (stored.denied || localDenials.has(ctx.scopeKey)) { invalidateScope(ctx.scope); fail('REVOKED'); }
    const envelope = stored.envelope;
    const state = await decrypt(envelope, ctx.scope, ctx.key); assertCurrent(ctx);
    if (!bypassLease) { try { lease(state, envelope); } catch (error) { lock(); throw error; } }
    return {envelope, state};
  }
  async function persist(ctx, envelope, state, bypassLease = false) {
    state.lastWriteAt = now();
    const next = await encrypt({...metadata(envelope), version:envelope.version + 1}, state, ctx.key); assertCurrent(ctx);
    if (!bypassLease) { try { lease(state,envelope); } catch (error) { lock(); throw error; } }
    const controller = new AbortController(); controllers.add(controller);
    try {
      const saved = await storage.compareAndSwap(ctx.scopeKey, envelope.version, next, {signal:controller.signal, isCurrent:() => current(ctx) && (bypassLease || (now() >= envelope.preparedAt && now() < envelope.expiresAt && !state.revoked))});
      assertCurrent(ctx);
      if (!saved) fail('CONFLICT', 'Άλλα δεδομένα αποθηκεύτηκαν σε δεύτερο παράθυρο. Ανανέωσε την προβολή.');
    } catch (error) {
      if (error?.code === 'REVOKED') { invalidateScope(ctx.scope); fail('REVOKED'); }
      if (error instanceof OfflineVaultError || error?.code === 'LOCKED') throw error;
      fail('WRITE_FAILED', 'Η εγγραφή δεν επιβεβαιώθηκε. Μην κλείσεις το παράθυρο.');
    } finally { controllers.delete(controller); }
  }
  async function mutate(change, bypassLease = false) {
    const ctx = context(), {envelope, state} = await load(ctx, bypassLease);
    const result = change(state);
    await persist(ctx, envelope, state, bypassLease);
    return clone(result);
  }
  function draftIn(state, draftId) { const draft = state.drafts.find(row => row.id === draftId); if (!draft) fail('INVALID_DRAFT'); return draft; }
  function validateCapture(state, input) {
    const items = safeItems(input.items);
    if (!state.snapshot.customers.some(customer => customer.id === input.customerId) || items.some(item => !state.snapshot.products.some(product => product.id === item.productId)) || typeof input.notes !== 'string' || input.notes.length > 2000) fail('INVALID_DRAFT');
    return {customerId: input.customerId, items, notes: input.notes};
  }
  return {
    async listProfiles() {
      const envelopes = await storage.list();
      return envelopes.flatMap(envelope => { try { validEnvelope(envelope, envelope.scope); return [{scope:clone(envelope.scope),storeName:text(envelope.storeName),preparedAt:envelope.preparedAt,expiresAt:envelope.expiresAt}]; } catch { return []; } });
    },
    async prepare(scope, passphrase, snapshot) {
      if (disposed) fail('LOCKED');
      lock(); checkCrypto();
      scope = safeScope(scope);
      const generation = epoch, scopeKey = wholesaleOfflineScopeKey(scope), safe = safeSnapshot(scope, snapshot, now());
      const denialGeneration = denialGenerations.get(scopeKey) || 0;
      const stored = await record(scopeKey), old = stored.envelope, salt = old ? (validEnvelope(old, scope), bytes(old.salt)) : random(16);
      const key = await derive(passphrase, salt);
      const previous = old ? await decrypt(old, scope, key) : {drafts:[]};
      if (generation !== epoch || disposed) fail('LOCKED');
      if ((denialGenerations.get(scopeKey) || 0) !== denialGeneration) fail('REVOKED');
      const header = {format:1,version:(old?.version || 0) + 1,scope:clone(scope),storeName:safe.store.name,preparedAt:safe.preparedAt,expiresAt:safe.expiresAt,salt:base64(salt),iterations:ITERATIONS};
      const next = await encrypt(header, {snapshot:safe,drafts:previous.drafts,revoked:false,lastWriteAt:now()}, key);
      if (generation !== epoch || disposed) fail('LOCKED');
      if (now() < safe.preparedAt || now() >= safe.expiresAt) fail('EXPIRED');
      const controller = new AbortController(); controllers.add(controller);
      try {
        const saved = await storage.compareAndSwap(scopeKey, old?.version ?? null, next, {renew:true,expectedDenialVersion:stored.denialVersion,signal:controller.signal,isCurrent:() => generation === epoch && !disposed && (denialGenerations.get(scopeKey) || 0) === denialGeneration && now() >= safe.preparedAt && now() < safe.expiresAt});
        if (generation !== epoch || disposed) fail('LOCKED');
        if (!saved) fail('CONFLICT');
        localDenials.delete(scopeKey);
        active = {scope:clone(scope),scopeKey,key};
        return {snapshot:clone(safe),drafts:clone(previous.drafts)};
      } catch (error) { if (error instanceof OfflineVaultError) throw error; if (error?.code === 'REVOKED') fail('REVOKED'); fail('WRITE_FAILED'); }
      finally { controllers.delete(controller); }
    },
    async unlock(scope, passphrase) {
      if (disposed) fail('LOCKED'); lock();
      scope = safeScope(scope);
      const generation = epoch, scopeKey = wholesaleOfflineScopeKey(scope), stored = await record(scopeKey), envelope = stored.envelope;
      if (stored.denied || localDenials.has(scopeKey)) fail('REVOKED');
      if (!envelope) fail('NOT_PREPARED');
      validEnvelope(envelope, scope);
      const key = await derive(passphrase, bytes(envelope.salt)), state = await decrypt(envelope, scope, key);
      if (generation !== epoch || disposed) fail('LOCKED');
      await assertAllowed(scopeKey);
      if (generation !== epoch || disposed) fail('LOCKED');
      lease(state, envelope); active = {scope:clone(scope),scopeKey,key};
      return {snapshot:clone(state.snapshot),drafts:clone(state.drafts)};
    },
    async read() { const ctx = context(), {state} = await load(ctx); return clone({snapshot:state.snapshot,drafts:state.drafts}); },
    async addDraft(input) {
      return mutate(state => { const capture = validateCapture(state, {...input,notes:input.notes ?? ''}), draftId = crypto.randomUUID();
        // A renewed catalogue may belong to a later store lifecycle. Every
        // existing draft keeps its own origin; legacy records remain epoch zero.
        const draft = {...capture,id:draftId,clientOrderId:draftId,originGeneration:state.snapshot.originGeneration ?? '0',status:'LOCAL_DRAFT',createdAt:now(),updatedAt:now()};
        state.drafts.push(draft); return draft; });
    },
    async editDraft(draftId, patch) {
      return mutate(state => { const draft = draftIn(state,draftId); if (draft.status !== 'LOCAL_DRAFT') fail('FROZEN');
        Object.assign(draft,validateCapture(state,{...draft,...patch}),{updatedAt:now()}); return draft; });
    },
    async freezeSend(draftId, input) {
      const body = typeof input === 'string' ? JSON.parse(input) : input;
      return mutate(state => {
        const draft = draftIn(state,draftId); if (draft.status !== 'LOCAL_DRAFT') fail('FROZEN');
        const allowed = ['clientOrderId','customerId','storeId','items','quoteId','notes'];
        if (!body || Object.keys(body).some(key => !allowed.includes(key)) || !id(body.quoteId) || body.clientOrderId !== draft.clientOrderId || body.customerId !== draft.customerId || body.storeId !== active.scope.storeId || body.notes !== draft.notes || JSON.stringify(safeItems(body.items)) !== JSON.stringify(draft.items)) fail('INVALID_DRAFT');
        draft.sendBody = JSON.stringify({clientOrderId:draft.clientOrderId,customerId:draft.customerId,storeId:body.storeId,items:clone(draft.items),quoteId:body.quoteId,notes:draft.notes});
        draft.status = 'FROZEN'; draft.updatedAt = now(); return draft;
      });
    },
    async sendFrozen(draftId, callback) {
      const initial = context();
      if (!lockManager?.request) fail('LOCKS_UNAVAILABLE', 'Η ασφαλής αποστολή χρειάζεται πρόγραμμα περιήγησης με κλείδωμα παραθύρων.');
      if (typeof callback !== 'function') fail('INVALID_DRAFT');
      return lockManager.request(`mws-wholesale-send:${initial.scopeKey}:${draftId}`, {mode:'exclusive',ifAvailable:true}, async acquired => {
        if (!acquired) fail('SEND_BUSY', 'Η ίδια αποστολή εκτελείται σε άλλο παράθυρο.');
        assertCurrent(initial);
        const attemptId = crypto.randomUUID();
        const frozen = await mutate(state => {
          const draft = draftIn(state,draftId);
          if (!['FROZEN','UNKNOWN','SENDING'].includes(draft.status) || !draft.sendBody) fail('NOT_SENDABLE');
          draft.status = 'SENDING'; draft.attemptId = attemptId; draft.updatedAt = now(); return draft;
        });
        assertCurrent(initial);
        let result;
        try { result = await callback(frozen.sendBody, clone(frozen)); }
        catch { result = {status:'UNKNOWN'}; }
        if (!result || !['CONFIRMED','UNKNOWN','REJECTED'].includes(result.status) || (result.status === 'CONFIRMED' && !id(result.serverOrderId))) result = {status:'UNKNOWN'};
        assertCurrent(initial);
        // A response arriving after expiry still needs a durable outcome. It never
        // authorizes another send or unlock and retains the same frozen body.
        return mutate(state => {
          const draft = draftIn(state,draftId);
          if (draft.attemptId !== attemptId || draft.status !== 'SENDING' || draft.sendBody !== frozen.sendBody) fail('CONFLICT');
          draft.status = result.status; draft.updatedAt = now();
          if (result.status === 'CONFIRMED') draft.serverOrderId = result.serverOrderId;
          draft.message = result.status === 'CONFIRMED' ? 'Η παραγγελία επιβεβαιώθηκε από τον διακομιστή.' : result.status === 'REJECTED' ? 'Το αρχικό αίτημα απορρίφθηκε. Παραμένει στο ιστορικό.' : 'Η απάντηση δεν επιβεβαιώθηκε. Επιτρέπεται μόνο ακριβής επανάληψη.';
          return draft;
        }, true);
      });
    },
    denyPrepared,
    async revoke() { const ctx = context(); try { await denyPrepared(ctx.scope); } finally { lock(); } },
    async revokePrepared(scope, passphrase) {
      if (disposed) fail('LOCKED'); lock(); scope = safeScope(scope);
      const generation = epoch, scopeKey = wholesaleOfflineScopeKey(scope), envelope = await storage.get(scopeKey);
      if (!envelope) fail('NOT_PREPARED');
      validEnvelope(envelope,scope);
      const key = await derive(passphrase,bytes(envelope.salt));
      await decrypt(envelope,scope,key);
      if (generation !== epoch || disposed) fail('LOCKED');
      try { return await denyPrepared(scope); }
      finally { lock(); }
    },
    lock,
    dispose() { lock(); disposed = true; if (broadcast) { broadcast.onmessage = null; broadcast.close?.(); } const closed = storage.close?.(); closed?.catch?.(() => {}); }
  };
}
