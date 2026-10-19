// Only encrypted envelopes belong in this database. No API response cache or sessions.
export function createWholesaleOfflineStorage({indexedDB = globalThis.indexedDB, name = 'mws-wholesale-encrypted-v1'} = {}) {
  let pending;
  const unavailable = () => Object.assign(new Error('Η ασφαλής τοπική αποθήκευση δεν είναι διαθέσιμη.'), {code: 'STORAGE_UNAVAILABLE'});
  function open() {
    if (!indexedDB?.open) return Promise.reject(unavailable());
    if (!pending) pending = new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      let blocked = false;
      request.onupgradeneeded = () => request.result.createObjectStore('profiles', {keyPath: 'key'});
      request.onerror = () => { pending = undefined; reject(unavailable()); };
      request.onblocked = () => { blocked = true; pending = undefined; reject(unavailable()); };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) { db.close(); return; }
        db.onversionchange = () => { db.close(); pending = undefined; };
        resolve(db);
      };
    });
    return pending;
  }
  async function transaction(mode, operation, {signal, isCurrent = () => true} = {}) {
    const db = await open();
    if (signal?.aborted || !isCurrent()) throw Object.assign(new Error('Η συνεδρία τοπικής εργασίας κλειδώθηκε.'), {code: 'LOCKED'});
    return new Promise((resolve, reject) => {
      const tx = db.transaction('profiles', mode);
      let value, failure;
      const abort = () => { try { tx.abort(); } catch {} };
      signal?.addEventListener('abort', abort, {once: true});
      const cleanup = () => signal?.removeEventListener('abort', abort);
      tx.oncomplete = () => { cleanup(); resolve(value); };
      tx.onabort = tx.onerror = () => {
        cleanup();
        reject(failure || Object.assign(new Error('Η τοπική εγγραφή δεν ολοκληρώθηκε.'), {code: signal?.aborted ? 'LOCKED' : 'WRITE_FAILED'}));
      };
      try { operation(tx.objectStore('profiles'), result => { value = result; }, error => { failure = error; abort(); }, isCurrent); }
      catch (error) { failure = error; abort(); }
    });
  }
  return {
    get: key => transaction('readonly', (store, done) => { const req = store.get(key); req.onsuccess = () => done(req.result?.envelope || null); }),
    getRecord: key => transaction('readonly', (store, done) => { const req = store.get(key); req.onsuccess = () => done({envelope:req.result?.envelope || null,denied:req.result?.denied === true,denialVersion:req.result?.denialVersion || 0}); }),
    isDenied: key => transaction('readonly', (store, done) => { const req = store.get(key); req.onsuccess = () => done(req.result?.denied === true); }),
    deny: key => transaction('readwrite', (store, done) => {
      const req = store.get(key);
      req.onsuccess = () => {
        const previous = req.result, denialVersion = (previous?.denialVersion || 0) + 1;
        store.put({key,envelope:previous?.envelope || null,denied:true,denialVersion});
        done({denied:true,denialVersion});
      };
    }),
    list: () => transaction('readonly', (store, done) => { const req = store.getAll(); req.onsuccess = () => done(req.result.map(row => row.envelope).filter(Boolean)); }),
    compareAndSwap: (key, expectedVersion, envelope, options) => transaction('readwrite', (store, done, fail, isCurrent) => {
      const request = store.get(key);
      request.onsuccess = () => {
        if (!isCurrent()) return fail(Object.assign(new Error('Το πλαίσιο εργασίας άλλαξε.'), {code: 'LOCKED'}));
        const row = request.result;
        if (row?.denied && !options?.renew) return fail(Object.assign(new Error('Η πρόσβαση έχει ανακληθεί.'), {code:'REVOKED'}));
        if (options?.renew && (row?.denialVersion || 0) !== options.expectedDenialVersion) return fail(Object.assign(new Error('Η πρόσβαση άλλαξε κατά την ανανέωση.'), {code:'REVOKED'}));
        if ((request.result?.envelope?.version ?? null) !== expectedVersion) return done(false);
        store.put({key,envelope,denied:options?.renew ? false : row?.denied === true,denialVersion:row?.denialVersion || 0});
        done(true);
      };
    }, options),
    close: async () => { if (pending) (await pending).close(); pending = undefined; }
  };
}
