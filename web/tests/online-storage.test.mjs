import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { createDocumentStore, loadedRecord, recordRevision } from '../online/storage.mjs';

function fixture(id = 'doc') {
  const bytes = new Uint8Array(1024 * 1024).fill(17);
  return { id, name: '시험.hwpx', originalFormat: 'hwpx', bytes, original: bytes,
    updated: 1, created: 1, revision: 0, history: [], draft: false };
}
test('listing reads metadata only; opening defers original and revision binaries', async () => {
  const store = createDocumentStore(new IDBFactory());
  let doc = fixture();
  for (let i = 0; i < 12; i++) doc = recordRevision(doc, doc.bytes);
  await store.put(doc);
  const list = await store.all(), opened = await store.get(doc.id);
  assert.equal(list[0].byteLength, 1024 * 1024);
  assert(JSON.stringify(list).length < 250);
  assert.equal(list[0].bytes, undefined);
  assert.equal(opened.original, undefined);
  assert(opened.history.every(entry => entry.bytes === undefined));
  assert.equal(opened.bytes.byteLength, doc.bytes.byteLength);
  assert.deepEqual(await store.original(doc.id), doc.original);
  assert.deepEqual(await store.revision(doc.id, 1), doc.history.at(-1).bytes);
  await store.close();
});
test('legacy version one migrates without losing original, current bytes or history', async () => {
  const indexedDB = new IDBFactory();
  const doc = recordRevision(fixture(), new Uint8Array([9, 8, 7]), 7);
  await new Promise((resolve, reject) => {
    const request = indexedDB.open('legacy', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents', {keyPath: 'id'}).put(doc);
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  });
  const store = createDocumentStore(indexedDB, 'legacy');
  assert.deepEqual((await store.get(doc.id)).bytes, doc.bytes);
  assert.deepEqual(await store.original(doc.id), doc.original);
  assert.deepEqual(await store.revision(doc.id, 1), doc.history[0].bytes);
  assert.equal((await store.all())[0].byteLength, 3);
  await store.close();
});
test('autosave and rename retain lazy history and original; pruning and deletion remove binaries', async () => {
  const store = createDocumentStore(new IDBFactory());
  await store.put(recordRevision(fixture(), new Uint8Array([1])));
  let doc = await store.get('doc');
  await store.put({...doc, name: '새 이름.hwpx', draft: true});
  for (let i = 2; i <= 13; i++) {
    doc = loadedRecord(recordRevision(await store.get('doc'), new Uint8Array([i])));
    // A newly exported revision must be persisted before its bytes are evicted.
    await store.put(recordRevision(await store.get('doc'), new Uint8Array([i])));
  }
  assert.equal(await store.revision('doc', 1), undefined);
  assert.deepEqual(await store.revision('doc', 13), new Uint8Array([13]));
  assert.equal((await store.original('doc')).byteLength, 1024 * 1024);
  assert.equal((await store.all())[0].name, '새 이름.hwpx');
  assert.equal(doc.history.length, 12);
  assert(doc.history.every(entry => !entry.bytes));
  await store.delete('doc');
  assert.deepEqual(await store.all(), []);
  assert.equal(await store.original('doc'), undefined);
  assert.equal(await store.revision('doc', 13), undefined);
  await store.close();
});

test('an old tab blocking migration reports recovery and preserves its data', async () => {
  const indexedDB = new IDBFactory();
  const old = await new Promise((resolve, reject) => {
    const request = indexedDB.open('blocked', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents', {keyPath:'id'}).put(fixture());
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const store = createDocumentStore(indexedDB, 'blocked');
  await assert.rejects(store.all(), /다른 탭/);
  old.close();
  assert.equal((await store.all()).length, 1);
  assert.equal((await store.original('doc')).byteLength, 1024 * 1024);
  await store.close();
});
