// Binary documents, originals and revision payloads are read only on demand.
export function createDocumentStore(indexedDB, name = 'jakal-office-online-v1') {
  let connection;
  const summary = ({ id, name, originalFormat, updated, created, revision, draft, bytes }) =>
    ({ id, name, originalFormat, updated, created, revision, draft, byteLength: bytes.byteLength });
  function write(tx, record, previous) {
    const binaries = tx.objectStore('binaries');
    if (record.original) binaries.put(record.original, [record.id, 'original']);
    const history = (record.history || []).map(({ bytes, ...entry }) => {
      if (bytes) binaries.put(bytes, [record.id, entry.revision]);
      return entry;
    });
    for (const entry of previous?.history || []) {
      if (!history.some(item => item.revision === entry.revision)) binaries.delete([record.id, entry.revision]);
    }
    const { original, ...document } = record;
    tx.objectStore('documents').put({ ...document, history });
    tx.objectStore('metadata').put(summary(record));
  }
  function database() {
    return connection ||= new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 2);
      let blocked = false;
      request.onblocked = () => {
        blocked = true; connection = null;
        reject(new Error('다른 탭에서 이 사이트의 문서를 저장한 뒤 해당 탭을 닫고 새로고침해 주세요. 저장소를 업그레이드하고 있습니다.'));
      };
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents', { keyPath: 'id' });
        db.createObjectStore('metadata', { keyPath: 'id' });
        db.createObjectStore('binaries');
        const cursor = request.transaction.objectStore('documents').openCursor();
        cursor.onsuccess = () => {
          if (!cursor.result) return;
          write(request.transaction, cursor.result.value);
          cursor.result.continue();
        };
      };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) { db.close(); return; }
        db.onversionchange = () => { db.close(); connection = null; };
        resolve(db);
      };
      request.onerror = () => { connection = null; reject(new Error('브라우저 저장소를 열지 못했습니다. 저장소 권한을 확인해 주세요.')); };
    });
  }
  async function transaction(names, mode, operation) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(names, mode);
      let request;
      try { request = operation(tx); } catch (error) { tx.abort(); reject(error); return; }
      tx.oncomplete = () => resolve(request?.result);
      tx.onabort = tx.onerror = () => reject(new Error(tx.error?.name === 'QuotaExceededError'
        ? '브라우저 저장 공간이 부족합니다. 문서를 다운로드하고 오래된 문서를 정리해 주세요.'
        : '브라우저 저장에 실패했습니다. 수정본을 다운로드해 주세요.'));
    });
  }
  return {
    all: () => transaction(['metadata'], 'readonly', tx => tx.objectStore('metadata').getAll()),
    get: id => transaction(['documents'], 'readonly', tx => tx.objectStore('documents').get(id)),
    original: id => transaction(['binaries'], 'readonly', tx => tx.objectStore('binaries').get([id, 'original'])),
    revision: (id, revision) => transaction(['binaries'], 'readonly', tx => tx.objectStore('binaries').get([id, revision])),
    put: record => transaction(['documents', 'metadata', 'binaries'], 'readwrite', tx => {
      const previous = tx.objectStore('documents').get(record.id);
      previous.onsuccess = () => write(tx, record, previous.result);
      return previous;
    }),
    delete: id => transaction(['documents', 'metadata', 'binaries'], 'readwrite', tx => {
      const previous = tx.objectStore('documents').get(id);
      previous.onsuccess = () => {
        const binaries = tx.objectStore('binaries');
        binaries.delete([id, 'original']);
        for (const entry of previous.result?.history || []) binaries.delete([id, entry.revision]);
        tx.objectStore('metadata').delete(id); tx.objectStore('documents').delete(id);
      };
      return previous;
    }),
    close: async () => { if (connection) (await connection).close(); connection = null; },
  };
}
export const documents = createDocumentStore(globalThis.indexedDB);
export function loadedRecord({ original, history = [], ...record }) {
  return { ...record, history: history.map(({ bytes, ...entry }) => entry) };
}
export function nameForDownload(name) { return name.replace(/[\x00-\x1f\x7f/\\]/g, '_').replace(/\.(hwp|hwpx)$/i, '') + '.hwpx'; }
export function recordRevision(document, bytes, now = Date.now()) {
  const revision = (document.revision || 0) + 1;
  const entry = { revision, saved: now, bytes: new Uint8Array(bytes) };
  return { ...document, bytes: new Uint8Array(bytes), updated: now, revision, draft: false, history: [entry, ...(document.history || [])].slice(0, 12) };
}
