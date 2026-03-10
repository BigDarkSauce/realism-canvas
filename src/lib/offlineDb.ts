/**
 * IndexedDB wrapper for offline caching of canvas data.
 * Uses a singleton connection pool to avoid repeated open/close overhead.
 */

const DB_NAME = 'canvas_offline';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbPromise) return dbPromise;
  
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('documents')) {
        db.createObjectStore('documents', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('saves')) {
        db.createObjectStore('saves', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('pendingChanges')) {
        db.createObjectStore('pendingChanges', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => {
      dbInstance = req.result;
      dbInstance.onclose = () => { dbInstance = null; dbPromise = null; };
      resolve(dbInstance);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function txPromise(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function reqPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheDocument(doc: { id: string; [key: string]: any }) {
  const db = await openDb();
  const tx = db.transaction('documents', 'readwrite');
  tx.objectStore('documents').put(doc);
  return txPromise(tx);
}

export async function getCachedDocument(id: string): Promise<any | null> {
  const db = await openDb();
  const tx = db.transaction('documents', 'readonly');
  return reqPromise(tx.objectStore('documents').get(id)) ?? null;
}

export async function getAllCachedDocuments(): Promise<any[]> {
  const db = await openDb();
  const tx = db.transaction('documents', 'readonly');
  return reqPromise(tx.objectStore('documents').getAll()) ?? [];
}

export async function cacheSave(save: { id: string; [key: string]: any }) {
  const db = await openDb();
  const tx = db.transaction('saves', 'readwrite');
  tx.objectStore('saves').put(save);
  return txPromise(tx);
}

export async function getAllCachedSaves(): Promise<any[]> {
  const db = await openDb();
  const tx = db.transaction('saves', 'readonly');
  return reqPromise(tx.objectStore('saves').getAll()) ?? [];
}

export async function addPendingChange(change: { type: string; table: string; data: any }) {
  const db = await openDb();
  const tx = db.transaction('pendingChanges', 'readwrite');
  tx.objectStore('pendingChanges').add({ ...change, timestamp: Date.now() });
  return txPromise(tx);
}

export async function getPendingChanges(): Promise<any[]> {
  const db = await openDb();
  const tx = db.transaction('pendingChanges', 'readonly');
  return reqPromise(tx.objectStore('pendingChanges').getAll()) ?? [];
}

export async function clearPendingChanges() {
  const db = await openDb();
  const tx = db.transaction('pendingChanges', 'readwrite');
  tx.objectStore('pendingChanges').clear();
  return txPromise(tx);
}

export function isOnline(): boolean {
  return navigator.onLine;
}
