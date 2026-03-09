/**
 * IndexedDB wrapper for offline caching of canvas data.
 * Stores documents, saves, and pending changes for sync when back online.
 */

const DB_NAME = 'canvas_offline';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
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
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheDocument(doc: { id: string; [key: string]: any }) {
  const db = await openDb();
  const tx = db.transaction('documents', 'readwrite');
  tx.objectStore('documents').put(doc);
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedDocument(id: string): Promise<any | null> {
  const db = await openDb();
  const tx = db.transaction('documents', 'readonly');
  const req = tx.objectStore('documents').get(id);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllCachedDocuments(): Promise<any[]> {
  const db = await openDb();
  const tx = db.transaction('documents', 'readonly');
  const req = tx.objectStore('documents').getAll();
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheSave(save: { id: string; [key: string]: any }) {
  const db = await openDb();
  const tx = db.transaction('saves', 'readwrite');
  tx.objectStore('saves').put(save);
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllCachedSaves(): Promise<any[]> {
  const db = await openDb();
  const tx = db.transaction('saves', 'readonly');
  const req = tx.objectStore('saves').getAll();
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function addPendingChange(change: { type: string; table: string; data: any }) {
  const db = await openDb();
  const tx = db.transaction('pendingChanges', 'readwrite');
  tx.objectStore('pendingChanges').add({ ...change, timestamp: Date.now() });
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingChanges(): Promise<any[]> {
  const db = await openDb();
  const tx = db.transaction('pendingChanges', 'readonly');
  const req = tx.objectStore('pendingChanges').getAll();
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function clearPendingChanges() {
  const db = await openDb();
  const tx = db.transaction('pendingChanges', 'readwrite');
  tx.objectStore('pendingChanges').clear();
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function isOnline(): boolean {
  return navigator.onLine;
}
