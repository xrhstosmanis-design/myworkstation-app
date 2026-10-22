import test from 'node:test';
import assert from 'node:assert/strict';
import {installOfflineStorageGuard} from './storage-guard.mjs';
function fixture(onBlocked){
  class Storage{
    constructor(){this.values=new Map([
      ['myworkstation:offline-pos-sales:lab-only','own queue'],
      ['myworkstation:offline-pos-history:lab-only','own history'],
      ['myworkstation:offline-pos-sales:other-store','protected queue'],
      ['myworkstation:offline-pos-history:other-store','protected history'],
      ['myworkstation:offline-pos-catalog:lab-only','catalog'],
      ['myworkstation:pos-text-size:lab-only','FONT_14'],
    ]);}
    setItem(key,value){this.values.set(String(key),String(value));}
    getItem(key){return this.values.get(String(key))??null;}
    removeItem(key){this.values.delete(String(key));}
  }
  const storage=new Storage(),restore=installOfflineStorageGuard({storeId:'lab-only',StorageType:Storage,storage,onBlocked});
  return {Storage,storage,restore};
}
test('visual LAB clears only its own synthetic financial queue/history',()=>{
  const {storage,restore}=fixture();
  try{
    assert.equal(storage.getItem('myworkstation:offline-pos-sales:lab-only'),null);
    assert.equal(storage.getItem('myworkstation:offline-pos-history:lab-only'),null);
    assert.equal(storage.getItem('myworkstation:offline-pos-sales:other-store'),'protected queue');
    assert.equal(storage.getItem('myworkstation:offline-pos-history:other-store'),'protected history');
    assert.equal(storage.getItem('myworkstation:offline-pos-catalog:lab-only'),'catalog');
    assert.equal(storage.getItem('myworkstation:pos-text-size:lab-only'),'FONT_14');
  }finally{restore();}
});
test('every financial queue/history prefix is denied without overwriting any stored record',()=>{
  const blocked=[],{Storage,storage,restore}=fixture(event=>blocked.push(event));
  try{
    for(const key of ['myworkstation:offline-pos-sales:lab-only','myworkstation:offline-pos-history:lab-only','myworkstation:offline-pos-sales:other-store','myworkstation:offline-pos-history:new-store']){
      const before=storage.getItem(key);
      assert.throws(()=>storage.setItem(key,'financial payload'),error=>error.code==='VISUAL_LAB_OFFLINE_QUEUE_DENIED'&&/Δεν έγινε συναλλαγή/.test(error.message));
      assert.equal(storage.getItem(key),before);
    }
    const otherStorage=new Storage();
    assert.throws(()=>otherStorage.setItem('myworkstation:offline-pos-sales:new-store','payload'),{code:'VISUAL_LAB_OFFLINE_QUEUE_DENIED'});
    assert.equal(blocked.length,5);
    assert.ok(blocked.every(event=>Object.keys(event).sort().join(',')==='key,method'),'No financial payload is copied into feedback.');
  }finally{restore();}
});
test('visual display preferences/catalog still use ordinary Storage semantics',()=>{
  const {storage,restore}=fixture();
  try{
    assert.equal(storage.setItem('myworkstation:pos-text-size:lab-only','FONT_16'),undefined);
    storage.setItem('myworkstation:offline-pos-catalog:lab-only','synthetic catalog');
    assert.equal(storage.getItem('myworkstation:pos-text-size:lab-only'),'FONT_16');
    assert.equal(storage.getItem('myworkstation:offline-pos-catalog:lab-only'),'synthetic catalog');
    assert.equal(storage.getItem('myworkstation:offline-pos-sales:other-store'),'protected queue');
  }finally{restore();}
});
test('feedback failure cannot permit a queued sale',()=>{
  const {storage,restore}=fixture(()=>{throw new Error('feedback unavailable');});
  try{
    assert.throws(()=>storage.setItem('myworkstation:offline-pos-sales:lab-only','payload'),{code:'VISUAL_LAB_OFFLINE_QUEUE_DENIED'});
    assert.equal(storage.getItem('myworkstation:offline-pos-sales:lab-only'),null);
  }finally{restore();}
});
